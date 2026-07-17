// QC — Rental refund (WO Wave2-F): คืนเงินหลังคืนของ/คิดเงิน · Fable oracle, Builder ห้ามแตะ
// ⚠️ standalone-typesafe: dynamic import + wide cast เท่านั้น
//
// สัญญา src/lib/modules/rental/service.ts:
//   refundRental(ctx {tenantId, unitId}, bookingId) → { ok, reason? }
//     · guard: เฉพาะ booking สถานะ RETURNED (อื่น → ok:false + reason) · idempotent (refund ซ้ำไม่เบิ้ล)
//     · claim อะตอมมิก RETURNED→REFUNDED + refundedAt (ห้ามลบ record)
//     · กลับเส้นเงิน pos.voidSale(posSaleId) → posSale VOIDED + outbox pos.sale.voided → GL รายได้ net=0
//     · asset: ปล่อยว่างตามเดิม (availability คิดจาก BOOKED/PICKED_UP เท่านั้น → ช่วงเดิมจองได้)
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
const D = (s: string) => new Date(s);

let tid = ""; let tid2 = "";
try {
  const rt = (await import("@/lib/modules/rental/service" as string).catch(() => null)) as { [k: string]: (...a: any[]) => Promise<any> } | null; // any จงใจ
  if (!rt || typeof rt.refundRental !== "function") { chk("RF-0", "มี refundRental ใน rental/service.ts", false, "มี", "ยังไม่สร้าง"); }
  else {
    const t = await prisma.tenant.create({ data: { name: "QC RENT RF", slug: `qc-rtrf-${Date.now()}` } }); tid = t.id;
    const unit = await prisma.businessUnit.create({ data: { tenantId: tid, type: "RENTAL", name: "เช่ารถ RF", slug: `rtrf-${Date.now()}` } });
    const posSys = await sys.createSystem(tid, "POS", "ขาย"); await sys.linkUnit(tid, posSys.id, unit.id);
    const accSys = await sys.createSystem(tid, "ACCOUNT", "บัญชี");
    await acc.saveSettings(tid, accSys.id, { orgName: "เช่ารถ RF จำกัด", taxId: "0105561177639", vatRegistered: true } as never);
    await gl.ensureAccounting({ tenantId: tid, systemId: accSys.id });
    await prisma.accountSystemLink.create({ data: { tenantId: tid, systemId: accSys.id, linkedKind: "POS", linkedId: posSys.id } });
    const ctx = { tenantId: tid, unitId: unit.id };

    const rev4000 = async () => {
      const es = await prisma.accountJournalEntry.findMany({ where: { systemId: accSys.id, refType: "PosSale" }, include: { lines: { include: { account: { select: { code: true } } } } } });
      const cr = es.flatMap((e) => e.lines).filter((l) => l.account.code === "4000").reduce((a, l) => a + l.credit, 0);
      const dr = es.flatMap((e) => e.lines).filter((l) => l.account.code === "4000").reduce((a, l) => a + l.debit, 0);
      const allDr = es.flatMap((e) => e.lines).reduce((a, l) => a + l.debit, 0), allCr = es.flatMap((e) => e.lines).reduce((a, l) => a + l.credit, 0);
      return { revNet: cr - dr, allDr, allCr };
    };

    const a1 = await rt.createAsset(ctx, { name: "มอเตอร์ไซค์ A", dailyRateSatang: 30000, depositSatang: 100000 });
    const bk = await rt.createBooking(ctx, { assetId: a1.id, customerName: "คุณเช่า", customerPhone: "0810000000", startDate: D("2026-08-01"), endDate: D("2026-08-04") });
    await rt.pickUp(ctx, bk.id);

    // guard ก่อนคืนของ: refund booking ที่ยัง PICKED_UP → ok:false
    const rfEarly = await rt.refundRental(ctx, bk.id);
    const stillPicked = (await prisma.rentalBooking.findUnique({ where: { id: bk.id as string } }))?.status;
    chk("RF-3.1", "refund ก่อนคืนของ (PICKED_UP) → ok:false + ยัง PICKED_UP", rfEarly.ok === false && !!rfEarly.reason && stillPicked === "PICKED_UP", "false+PICKED_UP", `${rfEarly.ok}/${stillPicked}`);

    const ret = await rt.returnAsset(ctx, bk.id, { lateFeeSatang: 5000 });
    await wiring.drainAll();
    const saleId = (await prisma.posSale.findFirst({ where: { tenantId: tid, idempotencyKey: `rental-${bk.id}` } }))?.id as string;
    const acctPaid = await rev4000();
    chk("RF-1.0", "ก่อน refund: RETURNED + posSale PAID (950) + รายได้ net>0", ret.ok === true && ret.totalSatang === 95000 && !!saleId && acctPaid.revNet === Math.round(95000 / 1.07), "RETURNED/net>0", `${ret.ok}/${acctPaid.revNet}`);

    const rf = await rt.refundRental(ctx, bk.id);
    const afterRf = await prisma.rentalBooking.findUnique({ where: { id: bk.id as string } });
    const saleRf = await prisma.posSale.findUnique({ where: { id: saleId } });
    await wiring.drainAll();
    const acctRf = await rev4000();
    chk("RF-1.1", "refund ok:true", rf.ok === true, "true", JSON.stringify(rf));
    chk("RF-1.2", "booking → REFUNDED + refundedAt ตั้ง (ไม่ลบ record)", afterRf?.status === "REFUNDED" && !!afterRf?.refundedAt, "REFUNDED+refundedAt", `${afterRf?.status}/${!!afterRf?.refundedAt}`);
    chk("RF-1.3", "posSale → VOIDED (กลับเส้นเงิน)", saleRf?.status === "VOIDED", "VOIDED", String(saleRf?.status));
    chk("RF-1.4", "outbox pos.sale.voided ≥1", (await prisma.outboxEvent.count({ where: { tenantId: tid, type: "pos.sale.voided" } })) >= 1, "≥1", "?");
    chk("RF-1.5", "GL รายได้ 4000 net=0 (คืนครบ) + Σdr=Σcr", acctRf.revNet === 0 && acctRf.allDr === acctRf.allCr && acctRf.allDr > 0, "0/สมดุล", `${acctRf.revNet}/${acctRf.allDr}=${acctRf.allCr}`);
    chk("RF-1.6", "asset ปล่อยว่าง: ช่วงเดิม (1-4 ส.ค.) จองได้อีก", (await rt.isAvailable(ctx, a1.id, { from: D("2026-08-01"), to: D("2026-08-04") })) === true, "true", "?");

    // ── idempotency: refund ซ้ำ ──
    const rf2 = await rt.refundRental(ctx, bk.id);
    const voidCount = await prisma.outboxEvent.count({ where: { tenantId: tid, type: "pos.sale.voided" } });
    await wiring.drainAll();
    const acctDup = await rev4000();
    chk("RF-2.1", "refund ซ้ำ → ok:false (ไม่ทำซ้ำ)", rf2.ok === false, "false", JSON.stringify(rf2));
    chk("RF-2.2", "void outbox ไม่เพิ่ม + GL รายได้ยัง net=0 (ไม่กลับบัญชีเบิ้ล)", voidCount === 1 && acctDup.revNet === 0, "1/0", `${voidCount}/${acctDup.revNet}`);

    // ── cross-tenant: refund booking t1 ด้วย ctx t2 ──
    const t2 = await prisma.tenant.create({ data: { name: "QC RENT RF2", slug: `qc-rtrf2-${Date.now()}` } }); tid2 = t2.id;
    const unit2 = await prisma.businessUnit.create({ data: { tenantId: tid2, type: "RENTAL", name: "เช่าอื่น", slug: `rtrf2-${Date.now()}` } });
    await sys.createSystem(tid2, "POS", "ขาย");
    const ctx2 = { tenantId: tid2, unitId: unit2.id };
    const bkX = await rt.createBooking(ctx, { assetId: a1.id, customerName: "ข", customerPhone: "0811111111", startDate: D("2026-09-01"), endDate: D("2026-09-02") });
    await rt.pickUp(ctx, bkX.id);
    await rt.returnAsset(ctx, bkX.id, {});
    const rfCross = await rt.refundRental(ctx2, bkX.id); // ctx t2 บน booking t1
    const bkXStatus = (await prisma.rentalBooking.findUnique({ where: { id: bkX.id as string } }))?.status;
    chk("RF-4.1", "cross-tenant refund → ok:false + booking t1 ยัง RETURNED (ไม่ถูกคืน)", rfCross.ok === false && bkXStatus === "RETURNED", "false+RETURNED", `${rfCross.ok}/${bkXStatus}`);
  }
} catch (e) { chk("CRASH", "จบ", false, "จบ", e instanceof Error ? e.message.slice(0, 200) : String(e)); }
finally {
  const d = async (f: () => Promise<unknown>) => { try { await f(); } catch {} };
  for (const id of [tid, tid2].filter(Boolean)) {
    await d(() => prisma.accountJournalLine.deleteMany({ where: { tenantId: id } }));
    await d(() => prisma.accountJournalEntry.deleteMany({ where: { tenantId: id } }));
    for (const m of ["accountSystemLink", "accountMapping", "accountLedger", "accountPeriod", "accountDocSequence", "accountSettings", "rentalBooking", "rentalAsset", "posPayment", "posSaleLine", "posSale", "posReceiptCounter", "outboxEvent", "appNotification", "appSystemUnit", "appSystem"]) await d(() => (prisma as never as Record<string, { deleteMany: (a: unknown) => Promise<unknown> }>)[m].deleteMany({ where: { tenantId: id } }));
    await d(() => prisma.businessUnit.deleteMany({ where: { tenantId: id } }));
    await d(() => prisma.tenant.delete({ where: { id } }));
  }
  await prisma.$disconnect();
}
const f = cks.filter((c) => !c.ok);
console.log(`\n===== QC Rental Refund =====\nผ่าน ${cks.length - f.length}/${cks.length}`);
console.log(`FINDINGS: CRITICAL ${f.filter((c) => c.sev === "CRITICAL").length} · MAJOR ${f.filter((c) => c.sev === "MAJOR").length} · MINOR ${f.filter((c) => c.sev === "MINOR").length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed: cks.length - f.length, findings: f.map((c) => c.id) })}`);
process.exit(f.filter((c) => c.sev === "CRITICAL").length > 0 ? 1 : 0);
