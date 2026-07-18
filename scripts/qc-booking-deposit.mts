// QC — Booking deposit (WO Wave3-A): ร้านรับมัดจำกัน no-show + ลงบัญชี DEPOSIT (Dr 2110) · Fable oracle, Builder ห้ามแตะ
// ⚠️ standalone-typesafe: dynamic import + wide cast เท่านั้น (ไม่ผูก type ตอน compile)
//
// สัญญา src/lib/modules/booking/service.ts:
//   setServiceDeposit(ctx, serviceId, depositSatang) — ตั้งมัดจำต่อบริการ (validate ≥0)
//   createAppointment — snapshot depositSatang จากบริการตอนสร้าง
//   recordDeposit(ctx, appointmentId, payMethod?) — เปิดบิล POS DEPOSIT (Dr 2110) + ปั๊ม depositPaidAt · idempotent · ไม่ผูก POS = บันทึกเฉย ๆ
//   refundDeposit(ctx, appointmentId) — void บิล (กลับ Dr 2110) + เคลียร์ depositPaidAt · idempotent
try { process.loadEnvFile(".env"); } catch {}
const { prisma } = await import("@/lib/core/db");
const sys = await import("@/lib/modules/system/service");
const acc = await import("@/lib/modules/account/service");
const gl = await import("@/lib/modules/account/gl");
const wiring = await import("@/lib/outbox-consumers");
const svc = (await import("@/lib/modules/booking/service" as string)) as { [k: string]: (...a: any[]) => Promise<any> };

type Sev = "CRITICAL" | "MAJOR" | "MINOR";
const cks: { id: string; ok: boolean; exp: string; act: string; sev: Sev }[] = [];
const chk = (id: string, n: string, ok: boolean, e: string, a: string, s: Sev = "CRITICAL") => {
  cks.push({ id, ok, exp: e, act: a, sev: s });
  console.log(`  ${ok ? "✅" : "❌"} [${id}] ${n}${ok ? "" : ` — exp ${e} | act ${a}`}`);
};

const DATE = "2031-05-20"; // อนาคตไกล (กัน filter อดีต)
const SLOT = 600; // 10:00
const DEP = 50000; // มัดจำ ฿500

let tid = ""; let tid2 = "";
try {
  const t = await prisma.tenant.create({ data: { name: "QC BK DEP", slug: `qc-bkdep-${Date.now()}` } }); tid = t.id;
  const unit = await prisma.businessUnit.create({ data: { tenantId: tid, type: "BOOKING", name: "สปา RF", slug: `bkdep-${Date.now()}` } });
  const posSys = await sys.createSystem(tid, "POS", "ขาย"); await sys.linkUnit(tid, posSys.id, unit.id);
  const accSys = await sys.createSystem(tid, "ACCOUNT", "บัญชี");
  await acc.saveSettings(tid, accSys.id, { orgName: "สปา RF จำกัด", taxId: "0105561177639", vatRegistered: true } as never);
  await gl.ensureAccounting({ tenantId: tid, systemId: accSys.id });
  await prisma.accountSystemLink.create({ data: { tenantId: tid, systemId: accSys.id, linkedKind: "POS", linkedId: posSys.id } });

  const ctx = { tenantId: tid, unitId: unit.id };
  const service = await prisma.bookingService.create({ data: { tenantId: tid, unitId: unit.id, name: "นวดหน้า", durationMin: 60, bufferMin: 0, priceSatang: 0 } });
  const staff = await prisma.bookingStaff.create({ data: { tenantId: tid, unitId: unit.id, name: "ช่างมัดจำ" } });

  // Dr/net ของบัญชีเลขหนึ่ง จาก journal entry ที่อ้าง PosSale (หลัง drain)
  const acctSide = async (code: string) => {
    const es = await prisma.accountJournalEntry.findMany({ where: { systemId: accSys.id, refType: "PosSale" }, include: { lines: { include: { account: { select: { code: true } } } } } });
    const dr = es.flatMap((e) => e.lines).filter((l) => l.account.code === code).reduce((a, l) => a + l.debit, 0);
    const cr = es.flatMap((e) => e.lines).filter((l) => l.account.code === code).reduce((a, l) => a + l.credit, 0);
    return { dr, cr, net: dr - cr };
  };

  // ── BD-1: setServiceDeposit ──
  const setNeg = await svc.setServiceDeposit(ctx, service.id, -100);
  chk("BD-1.1", "setServiceDeposit ติดลบ → ok:false (validate ≥0)", setNeg.ok === false, "false", JSON.stringify(setNeg));
  const set1 = await svc.setServiceDeposit(ctx, service.id, DEP);
  const svcRow = await prisma.bookingService.findUnique({ where: { id: service.id } });
  chk("BD-1.2", "setServiceDeposit → บริการ depositSatang = 50000", set1.ok === true && svcRow?.depositSatang === DEP, "true+50000", `${set1.ok}/${svcRow?.depositSatang}`);

  // ── BD-2: createAppointment snapshot มัดจำ ──
  const cr1 = await svc.createAppointment({ tenantId: tid, unitId: unit.id, serviceId: service.id, staffId: staff.id, dateStr: DATE, startMin: SLOT, customerName: "ลูกค้า A", customerPhone: "0800000001", source: "STAFF" });
  const apptId = cr1.id as string;
  const apptRow = await prisma.appointment.findUnique({ where: { id: apptId } });
  chk("BD-2.1", "createAppointment → นัด snapshot depositSatang = 50000 (ยังไม่จ่าย)", cr1.ok === true && apptRow?.depositSatang === DEP && apptRow?.depositPaidAt === null, "50000+null", `${apptRow?.depositSatang}/${apptRow?.depositPaidAt}`);

  // ── BD-3: recordDeposit → บิล DEPOSIT PAID + Dr 2110 ──
  const rd = await svc.recordDeposit(ctx, apptId);
  await wiring.drainAll();
  const saleId = rd.saleId as string;
  const sale = saleId ? await prisma.posSale.findUnique({ where: { id: saleId }, include: { payments: true } }) : null;
  const apptAfter = await prisma.appointment.findUnique({ where: { id: apptId } });
  const dep2110 = await acctSide("2110");
  chk("BD-3.1", "recordDeposit ok + มี saleId", rd.ok === true && !!saleId, "true+saleId", JSON.stringify(rd).slice(0, 60));
  chk("BD-3.2", "posSale สถานะ PAID + payment type DEPOSIT amount=50000", sale?.status === "PAID" && sale?.payments?.some((p: any) => p.type === "DEPOSIT" && p.amountSatang === DEP), "PAID+DEPOSIT", `${sale?.status}/${sale?.payments?.map((p: any) => p.type).join(",")}`);
  chk("BD-3.3", "depositPaidAt ตั้ง + depositSaleId ผูกบิล", !!apptAfter?.depositPaidAt && apptAfter?.depositSaleId === saleId, "paidAt+saleId", `${!!apptAfter?.depositPaidAt}/${apptAfter?.depositSaleId === saleId}`);
  chk("BD-3.4", "บัญชี Dr 2110 เงินมัดจำรับ = 50000 (มัดจำลงถูกช่อง)", dep2110.dr === DEP, String(DEP), `dr=${dep2110.dr}`);

  // ── BD-4: idempotent recordDeposit (กดซ้ำไม่เบิ้ล) ──
  const rd2 = await svc.recordDeposit(ctx, apptId);
  await wiring.drainAll();
  const depSaleCount = await prisma.posSale.count({ where: { tenantId: tid, sourceModule: "BOOKING", sourceId: apptId, status: "PAID" } });
  const dep2110b = await acctSide("2110");
  chk("BD-4.1", "recordDeposit ซ้ำ → no-op (ไม่ error) + บิล DEPOSIT ยัง 1 ใบ", rd2.ok === true && depSaleCount === 1, "1", `${rd2.ok}/${depSaleCount}`);
  chk("BD-4.2", "Dr 2110 ไม่เบิ้ล (ยัง 50000)", dep2110b.dr === DEP, String(DEP), `dr=${dep2110b.dr}`);

  // ── BD-5: refundDeposit → VOIDED + Dr 2110 net=0 ──
  const rf = await svc.refundDeposit(ctx, apptId);
  await wiring.drainAll();
  const saleRf = await prisma.posSale.findUnique({ where: { id: saleId } });
  const apptRf = await prisma.appointment.findUnique({ where: { id: apptId } });
  const dep2110c = await acctSide("2110");
  chk("BD-5.1", "refundDeposit ok", rf.ok === true, "true", JSON.stringify(rf));
  chk("BD-5.2", "posSale → VOIDED + depositPaidAt เคลียร์ (null)", saleRf?.status === "VOIDED" && apptRf?.depositPaidAt === null, "VOIDED+null", `${saleRf?.status}/${apptRf?.depositPaidAt}`);
  chk("BD-5.3", "บัญชี Dr 2110 net=0 (กลับรายการครบ)", dep2110c.net === 0, "0", `net=${dep2110c.net}`);
  chk("BD-5.4", "outbox pos.sale.voided ≥1", (await prisma.outboxEvent.count({ where: { tenantId: tid, type: "pos.sale.voided" } })) >= 1, "≥1", "?");

  // ── BD-6: idempotent refund (คืนซ้ำไม่เบิ้ล) ──
  const rf2 = await svc.refundDeposit(ctx, apptId);
  const voidCount = await prisma.posSale.count({ where: { tenantId: tid, sourceModule: "BOOKING", sourceId: apptId, status: "VOIDED" } });
  chk("BD-6.1", "refundDeposit ซ้ำ → ok:false (ไม่ทำซ้ำ)", rf2.ok === false, "false", JSON.stringify(rf2));
  chk("BD-6.2", "บิล VOIDED ยัง 1 (ไม่ void ซ้ำ)", voidCount === 1, "1", String(voidCount));

  // ── BD-7: ไม่ผูก POS → recordDeposit ได้ ไม่ error (standalone) ──
  const unit2 = await prisma.businessUnit.create({ data: { tenantId: tid, type: "BOOKING", name: "สาขาไม่มี POS", slug: `nopos-${Date.now()}` } });
  const ctxNoPos = { tenantId: tid, unitId: unit2.id };
  const svc2 = await prisma.bookingService.create({ data: { tenantId: tid, unitId: unit2.id, name: "ตัดผม", durationMin: 30, priceSatang: 0, depositSatang: DEP } });
  const staff2 = await prisma.bookingStaff.create({ data: { tenantId: tid, unitId: unit2.id, name: "ช่างบี" } });
  const crNoPos = await svc.createAppointment({ tenantId: tid, unitId: unit2.id, serviceId: svc2.id, staffId: staff2.id, dateStr: DATE, startMin: SLOT, customerName: "ลูกค้า B", customerPhone: "0800000002", source: "STAFF" });
  const rdNoPos = await svc.recordDeposit(ctxNoPos, crNoPos.id);
  const apptNoPos = await prisma.appointment.findUnique({ where: { id: crNoPos.id as string } });
  chk("BD-7.1", "ไม่ผูก POS → recordDeposit ok + depositPaidAt ตั้ง + ไม่มีบิล (saleId ว่าง)", rdNoPos.ok === true && !!apptNoPos?.depositPaidAt && !apptNoPos?.depositSaleId, "ok+paidAt+noSale", `${rdNoPos.ok}/${!!apptNoPos?.depositPaidAt}/${apptNoPos?.depositSaleId}`);

  // ── BD-8: cross-tenant guard ──
  const t2 = await prisma.tenant.create({ data: { name: "QC BK DEP2", slug: `qc-bkdep2-${Date.now()}` } }); tid2 = t2.id;
  const unitX = await prisma.businessUnit.create({ data: { tenantId: tid2, type: "BOOKING", name: "ร้านอื่น", slug: `bkdep2-${Date.now()}` } });
  const ctx2 = { tenantId: tid2, unitId: unitX.id };
  const svcX = await prisma.bookingService.create({ data: { tenantId: tid, unitId: unit.id, name: "สปา", durationMin: 60, priceSatang: 0, depositSatang: DEP } });
  const crX = await svc.createAppointment({ tenantId: tid, unitId: unit.id, serviceId: svcX.id, staffId: staff.id, dateStr: DATE, startMin: 720, customerName: "ลูกค้า X", customerPhone: "0800000003", source: "STAFF" });
  const rdCross = await svc.recordDeposit(ctx2, crX.id); // ctx t2 บนนัด t1
  const apptX = await prisma.appointment.findUnique({ where: { id: crX.id as string } });
  chk("BD-8.1", "cross-tenant recordDeposit → ok:false + นัด t1 ยังไม่จ่าย (ไม่ถูกแตะ)", rdCross.ok === false && apptX?.depositPaidAt === null, "false+null", `${rdCross.ok}/${apptX?.depositPaidAt}`);

  // ── BD-9: งบดุลบิลมัดจำ (Σdr=Σcr) ──
  const allEs = await prisma.accountJournalEntry.findMany({ where: { systemId: accSys.id, refType: "PosSale" }, include: { lines: true } });
  const sdr = allEs.flatMap((e) => e.lines).reduce((a, l) => a + l.debit, 0);
  const scr = allEs.flatMap((e) => e.lines).reduce((a, l) => a + l.credit, 0);
  chk("BD-9.1", "ทุก journal entry สมดุล Σdr=Σcr", sdr === scr && sdr > 0, String(sdr), String(scr));
} catch (e) { chk("CRASH", "จบ", false, "จบ", e instanceof Error ? e.message.slice(0, 200) : String(e)); }
finally {
  const d = async (f: () => Promise<unknown>) => { try { await f(); } catch {} };
  for (const id of [tid, tid2].filter(Boolean)) {
    await d(() => prisma.accountJournalLine.deleteMany({ where: { tenantId: id } }));
    await d(() => prisma.accountJournalEntry.deleteMany({ where: { tenantId: id } }));
    for (const m of ["accountSystemLink", "accountMapping", "accountLedger", "accountPeriod", "accountDocSequence", "accountSettings", "appointment", "bookingStaffHours", "bookingStaff", "bookingService", "bookingHours", "posPayment", "posSaleLine", "posSale", "posReceiptCounter", "customer", "outboxEvent", "appNotification", "appSystemUnit", "appSystem"]) await d(() => (prisma as never as Record<string, { deleteMany: (a: unknown) => Promise<unknown> }>)[m].deleteMany({ where: { tenantId: id } }));
    await d(() => prisma.businessUnit.deleteMany({ where: { tenantId: id } }));
    await d(() => prisma.tenant.delete({ where: { id } }));
  }
  await prisma.$disconnect();
}
const f = cks.filter((c) => !c.ok);
console.log(`\n===== QC Booking Deposit =====\nผ่าน ${cks.length - f.length}/${cks.length}`);
console.log(`FINDINGS: CRITICAL ${f.filter((c) => c.sev === "CRITICAL").length} · MAJOR ${f.filter((c) => c.sev === "MAJOR").length} · MINOR ${f.filter((c) => c.sev === "MINOR").length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed: cks.length - f.length, findings: f.map((c) => c.id) })}`);
process.exit(f.filter((c) => c.sev === "CRITICAL").length > 0 ? 1 : 0);
