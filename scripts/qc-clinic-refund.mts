// QC — Clinic refund (WO Wave2-G): void visit/คืนเงินหลังเก็บเงิน + คืนยาเข้าคลัง · Fable oracle, Builder ห้ามแตะ
// ⚠️ standalone-typesafe: dynamic import + wide cast เท่านั้น
//
// สัญญา src/lib/modules/clinic/service.ts:
//   refundVisit(ctx {tenantId, unitId}, visitId) → { ok, reason? }
//     · guard: เฉพาะ visit สถานะ BILLED (อื่น → ok:false + reason) · idempotent (refund ซ้ำไม่เบิ้ล)
//     · claim อะตอมมิก BILLED→REFUNDED + refundedAt (ห้ามลบ record)
//     · กลับเส้นเงิน pos.voidSale(posSaleId) → posSale VOIDED + outbox pos.sale.voided → GL รายได้ net=0
//     · คืนยาเข้าคลัง: อ้าง InvMovement OUT ที่ตัดจริง → inventory.receive (idempotencyKey `clinic-refund-<visitId>-<itemId>`)
//       ที่ต้นทุนปัจจุบัน → ต้นทุนถัวเฉลี่ยไม่เพี้ยน · คืนตรงกับที่ตัด (idempotent)
//     · cross-tenant: ctx tenant อื่น → ok:false (guard tenantDb)
try { process.loadEnvFile(".env"); } catch {}
const { prisma } = await import("@/lib/core/db");
const sys = await import("@/lib/modules/system/service");
const acc = await import("@/lib/modules/account/service");
const gl = await import("@/lib/modules/account/gl");
const wiring = await import("@/lib/outbox-consumers");
type Sev = "CRITICAL" | "MAJOR" | "MINOR";
const cks: { id: string; ok: boolean; exp: string; act: string; sev: Sev }[] = [];
const chk = (id: string, n: string, ok: boolean, e: string, a: string, s: Sev = "CRITICAL") => { cks.push({ id, ok, exp: e, act: a, sev: s }); console.log(`  ${ok ? "✅" : "❌"} [${id}] ${n}${ok ? "" : ` — exp ${e} | act ${a}`}`); };

let tid = ""; let tid2 = "";
try {
  const cl = (await import("@/lib/modules/clinic/service" as string).catch(() => null)) as { [k: string]: (...a: any[]) => Promise<any> } | null; // any จงใจ
  if (!cl || typeof cl.refundVisit !== "function") { chk("RF-0", "มี refundVisit ใน clinic/service.ts", false, "มี", "ยังไม่สร้าง"); }
  else {
    const t = await prisma.tenant.create({ data: { name: "QC CL RF", slug: `qc-clrf-${Date.now()}` } }); tid = t.id;
    const unit = await prisma.businessUnit.create({ data: { tenantId: tid, type: "CLINIC", name: "คลินิก RF", slug: `clrf-${Date.now()}` } });
    const posSys = await sys.createSystem(tid, "POS", "ขาย"); await sys.linkUnit(tid, posSys.id, unit.id);
    const invSys = await sys.createSystem(tid, "INVENTORY", "ยา");
    const accSys = await sys.createSystem(tid, "ACCOUNT", "บัญชี");
    await acc.saveSettings(tid, accSys.id, { orgName: "คลินิก RF จำกัด", taxId: "0105561177639", vatRegistered: true } as never);
    await gl.ensureAccounting({ tenantId: tid, systemId: accSys.id });
    await prisma.accountSystemLink.create({ data: { tenantId: tid, systemId: accSys.id, linkedKind: "POS", linkedId: posSys.id } });
    const inv = (await import("@/lib/modules/inventory/service")) as unknown as { createItem: (c: unknown, i: unknown) => Promise<{ id: string }>; receive: (c: unknown, i: unknown) => Promise<unknown> };
    const invCtx = { tenantId: tid, systemId: invSys.id };
    const med = await inv.createItem(invCtx, { sku: "MED-01", name: "พาราเซตามอล" });
    await inv.receive(invCtx, { itemId: med.id, qty: 100, costSatang: 200, idempotencyKey: "clrf-rc" });
    const ctx = { tenantId: tid, unitId: unit.id };

    const rev4000 = async () => {
      const es = await prisma.accountJournalEntry.findMany({ where: { systemId: accSys.id, refType: "PosSale" }, include: { lines: { include: { account: { select: { code: true } } } } } });
      const cr = es.flatMap((e) => e.lines).filter((l) => l.account.code === "4000").reduce((a, l) => a + l.credit, 0);
      const dr = es.flatMap((e) => e.lines).filter((l) => l.account.code === "4000").reduce((a, l) => a + l.debit, 0);
      return { revNet: cr - dr };
    };

    const p1 = await cl.createPatient(ctx, { name: "คุณป่วย", phone: "0809998888" });
    const v = await cl.createVisit(ctx, { patientId: p1.id, symptom: "ปวดหัว มีไข้", feeSatang: 50000 });

    // guard ก่อนเก็บเงิน: refund visit ที่ยัง OPEN → ok:false
    const rfEarly = await cl.refundVisit(ctx, v.id);
    const stillOpen = (await prisma.clinicVisit.findUnique({ where: { id: v.id as string } }))?.status;
    chk("RF-3.1", "refund ก่อนเก็บเงิน (OPEN) → ok:false + ยัง OPEN", rfEarly.ok === false && !!rfEarly.reason && stillOpen === "OPEN", "false+OPEN", `${rfEarly.ok}/${stillOpen}`);

    await cl.dispense(ctx, v.id, [{ invItemId: med.id, qty: 10 }]);
    const stockAfterDispense = (await prisma.invItem.findUnique({ where: { id: med.id as string } }))?.onHand;
    const bill = await cl.billVisit(ctx, v.id);
    await wiring.drainAll();
    const saleId = bill.posSaleId as string;
    const acctPaid = await rev4000();
    chk("RF-1.0", "ก่อน refund: BILLED + posSale PAID + สต็อกยา 100→90 + รายได้ net>0", bill.ok === true && !!saleId && stockAfterDispense === 90 && acctPaid.revNet === Math.round(50000 / 1.07), "BILLED/90/net>0", `${bill.ok}/${stockAfterDispense}/${acctPaid.revNet}`);

    const rf = await cl.refundVisit(ctx, v.id);
    const afterRf = await prisma.clinicVisit.findUnique({ where: { id: v.id as string } });
    const saleRf = await prisma.posSale.findUnique({ where: { id: saleId } });
    const stockRf = (await prisma.invItem.findUnique({ where: { id: med.id as string } }))?.onHand;
    const costRf = (await prisma.invItem.findUnique({ where: { id: med.id as string } }))?.costSatang;
    await wiring.drainAll();
    const acctRf = await rev4000();
    chk("RF-1.1", "refund ok:true", rf.ok === true, "true", JSON.stringify(rf));
    chk("RF-1.2", "visit → REFUNDED + refundedAt ตั้ง (ไม่ลบ record)", afterRf?.status === "REFUNDED" && !!afterRf?.refundedAt, "REFUNDED+refundedAt", `${afterRf?.status}/${!!afterRf?.refundedAt}`);
    chk("RF-1.3", "posSale → VOIDED (กลับเส้นเงิน)", saleRf?.status === "VOIDED", "VOIDED", String(saleRf?.status));
    chk("RF-1.4", "outbox pos.sale.voided ≥1", (await prisma.outboxEvent.count({ where: { tenantId: tid, type: "pos.sale.voided" } })) >= 1, "≥1", "?");
    chk("RF-1.5", "คืนยาเข้าคลัง 90→100 (คืนเท่าที่ตัด)", stockRf === 100, "100", String(stockRf));
    chk("RF-1.6", "ต้นทุนถัวเฉลี่ยไม่เพี้ยน (200)", costRf === 200, "200", String(costRf));
    chk("RF-1.7", "movement คืนยา type IN idempotencyKey ผูก visit+item (1 รายการ)", (await prisma.invMovement.count({ where: { tenantId: tid, type: "IN", idempotencyKey: { startsWith: `clinic-refund-${v.id}-` } } })) === 1, "1", "?");
    chk("RF-1.8", "GL รายได้ 4000 net=0 (คืนครบ)", acctRf.revNet === 0, "0", String(acctRf.revNet));

    // ── idempotency: refund ซ้ำ ──
    const rf2 = await cl.refundVisit(ctx, v.id);
    const stock2 = (await prisma.invItem.findUnique({ where: { id: med.id as string } }))?.onHand;
    const voidCount = await prisma.outboxEvent.count({ where: { tenantId: tid, type: "pos.sale.voided" } });
    const inMoveCount = await prisma.invMovement.count({ where: { tenantId: tid, type: "IN", idempotencyKey: { startsWith: `clinic-refund-${v.id}-` } } });
    chk("RF-2.1", "refund ซ้ำ → ok:false (ไม่ทำซ้ำ)", rf2.ok === false, "false", JSON.stringify(rf2));
    chk("RF-2.2", "สต็อกยาไม่เบิ้ล (ยัง 100) + void ไม่เพิ่ม + IN movement ยัง 1", stock2 === 100 && voidCount === 1 && inMoveCount === 1, "100/1/1", `${stock2}/${voidCount}/${inMoveCount}`);

    // ── cross-tenant: refund visit t1 ด้วย ctx t2 ──
    const t2 = await prisma.tenant.create({ data: { name: "QC CL RF2", slug: `qc-clrf2-${Date.now()}` } }); tid2 = t2.id;
    const unit2 = await prisma.businessUnit.create({ data: { tenantId: tid2, type: "CLINIC", name: "คลินิกอื่น", slug: `clrf2-${Date.now()}` } });
    await sys.createSystem(tid2, "POS", "ขาย");
    const ctx2 = { tenantId: tid2, unitId: unit2.id };
    const vX = await cl.createVisit(ctx, { patientId: p1.id, symptom: "ตรวจข้ามร้าน", feeSatang: 30000 });
    await cl.billVisit(ctx, vX.id);
    const rfCross = await cl.refundVisit(ctx2, vX.id); // ctx t2 บน visit t1
    const vXStatus = (await prisma.clinicVisit.findUnique({ where: { id: vX.id as string } }))?.status;
    chk("RF-4.1", "cross-tenant refund → ok:false + visit t1 ยัง BILLED (ไม่ถูกคืน)", rfCross.ok === false && vXStatus === "BILLED", "false+BILLED", `${rfCross.ok}/${vXStatus}`);
  }
} catch (e) { chk("CRASH", "จบ", false, "จบ", e instanceof Error ? e.message.slice(0, 200) : String(e)); }
finally {
  const d = async (f: () => Promise<unknown>) => { try { await f(); } catch {} };
  for (const id of [tid, tid2].filter(Boolean)) {
    await d(() => prisma.accountJournalLine.deleteMany({ where: { tenantId: id } }));
    await d(() => prisma.accountJournalEntry.deleteMany({ where: { tenantId: id } }));
    for (const m of ["accountSystemLink", "accountMapping", "accountLedger", "accountPeriod", "accountDocSequence", "accountSettings", "clinicVisit", "patientRecord", "posPayment", "posSaleLine", "posSale", "posReceiptCounter", "invMovement", "invLot", "invLocationStock", "invLocation", "invItem", "customer", "outboxEvent", "appNotification", "appSystemUnit", "appSystem"]) await d(() => (prisma as never as Record<string, { deleteMany: (a: unknown) => Promise<unknown> }>)[m].deleteMany({ where: { tenantId: id } }));
    await d(() => prisma.businessUnit.deleteMany({ where: { tenantId: id } }));
    await d(() => prisma.tenant.delete({ where: { id } }));
  }
  await prisma.$disconnect();
}
const f = cks.filter((c) => !c.ok);
console.log(`\n===== QC Clinic Refund =====\nผ่าน ${cks.length - f.length}/${cks.length}`);
console.log(`FINDINGS: CRITICAL ${f.filter((c) => c.sev === "CRITICAL").length} · MAJOR ${f.filter((c) => c.sev === "MAJOR").length} · MINOR ${f.filter((c) => c.sev === "MINOR").length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed: cks.length - f.length, findings: f.map((c) => c.id) })}`);
process.exit(f.filter((c) => c.sev === "CRITICAL").length > 0 ? 1 : 0);
