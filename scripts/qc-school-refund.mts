// QC — School refund (WO Wave2-E): คืนเงินค่าเรียนหลังชำระ · Fable oracle, Builder ห้ามแตะ
// ⚠️ standalone-typesafe: dynamic import + wide cast เท่านั้น
//
// สัญญา src/lib/modules/school/service.ts:
//   refundEnrollment(ctx {tenantId, unitId}, enrollmentId) → { ok, reason? }
//     · guard: เฉพาะ enrollment สถานะ PAID (อื่น → ok:false + reason) · idempotent (refund ซ้ำไม่เบิ้ล)
//     · claim อะตอมมิก PAID→REFUNDED + refundedAt (ห้ามลบ record)
//     · กลับเส้นเงิน pos.voidSale(posSaleId) → posSale VOIDED + outbox pos.sale.voided → GL รายได้ net=0
//     · คืนที่นั่ง: capacity นับเฉพาะ ENROLLED+PAID → REFUNDED ไม่นับ (คนใหม่สมัครแทนได้)
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
  const sc = (await import("@/lib/modules/school/service" as string).catch(() => null)) as { [k: string]: (...a: any[]) => Promise<any> } | null; // any จงใจ
  if (!sc || typeof sc.refundEnrollment !== "function") { chk("RF-0", "มี refundEnrollment ใน school/service.ts", false, "มี", "ยังไม่สร้าง"); }
  else {
    // ── setup tenant 1 + บัญชี (เช็ค net=0) ──
    const t = await prisma.tenant.create({ data: { name: "QC SCH RF", slug: `qc-schrf-${Date.now()}` } }); tid = t.id;
    const unit = await prisma.businessUnit.create({ data: { tenantId: tid, type: "SCHOOL", name: "โรงเรียน RF", slug: `schrf-${Date.now()}` } });
    const posSys = await sys.createSystem(tid, "POS", "ขาย"); await sys.linkUnit(tid, posSys.id, unit.id);
    const accSys = await sys.createSystem(tid, "ACCOUNT", "บัญชี");
    await acc.saveSettings(tid, accSys.id, { orgName: "โรงเรียน RF จำกัด", taxId: "0105561177639", vatRegistered: true } as never);
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

    const c1 = await sc.createCourse(ctx, { name: "คอร์สว่ายน้ำ", priceSatang: 250000 });
    const cl = await sc.createClass(ctx, { courseId: c1.id, name: "รอบเช้า", capacity: 2 });
    const e1 = await sc.enroll(ctx, { classId: cl.id, studentName: "น้องเอ", studentPhone: "0801111111" });
    await sc.enroll(ctx, { classId: cl.id, studentName: "น้องบี", studentPhone: "0802222222" });
    const pay = await sc.markPaid(ctx, e1.id);
    await wiring.drainAll();
    const saleId = pay.posSaleId as string;
    // capacity 2 เต็ม → คนที่ 3 สมัครไม่ได้ (ก่อน refund)
    let fullBefore = false; try { await sc.enroll(ctx, { classId: cl.id, studentName: "น้องซี-ก่อน", studentPhone: "0803333333" }); } catch { fullBefore = true; }
    const acctPaid = await rev4000();
    chk("RF-1.0", "ก่อน refund: PAID + posSale PAID + รอบเต็ม (สมัครที่ 3 ไม่ได้) + รายได้ net>0", pay.ok === true && !!saleId && fullBefore === true && acctPaid.revNet === Math.round(250000 / 1.07), "PAID/full/net>0", `${pay.ok}/${fullBefore}/${acctPaid.revNet}`);

    const rf = await sc.refundEnrollment(ctx, e1.id);
    const afterRf = await prisma.schoolEnrollment.findUnique({ where: { id: e1.id as string } });
    const saleRf = await prisma.posSale.findUnique({ where: { id: saleId } });
    await wiring.drainAll();
    const acctRf = await rev4000();
    chk("RF-1.1", "refund ok:true", rf.ok === true, "true", JSON.stringify(rf));
    chk("RF-1.2", "enrollment → REFUNDED + refundedAt ตั้ง (ไม่ลบ record)", afterRf?.status === "REFUNDED" && !!afterRf?.refundedAt, "REFUNDED+refundedAt", `${afterRf?.status}/${!!afterRf?.refundedAt}`);
    chk("RF-1.3", "posSale → VOIDED (กลับเส้นเงิน)", saleRf?.status === "VOIDED", "VOIDED", String(saleRf?.status));
    chk("RF-1.4", "outbox pos.sale.voided ≥1", (await prisma.outboxEvent.count({ where: { tenantId: tid, type: "pos.sale.voided" } })) >= 1, "≥1", "?");
    chk("RF-1.5", "GL รายได้ 4000 net=0 (คืนครบ) + Σdr=Σcr", acctRf.revNet === 0 && acctRf.allDr === acctRf.allCr && acctRf.allDr > 0, "0/สมดุล", `${acctRf.revNet}/${acctRf.allDr}=${acctRf.allCr}`);
    // ที่นั่งคืน: หลัง refund เหลือ active 1 คน (น้องบี ENROLLED) → สมัครใหม่ได้
    const e3 = await sc.enroll(ctx, { classId: cl.id, studentName: "น้องซี-หลัง", studentPhone: "0803333333" });
    chk("RF-1.6", "ที่นั่งคืน: หลัง refund สมัครคนใหม่ในรอบเดิมได้ (capacity ว่าง 1)", !!e3?.id, "id", JSON.stringify(e3));

    // ── idempotency: refund ซ้ำ ──
    const rf2 = await sc.refundEnrollment(ctx, e1.id);
    const voidCount = await prisma.outboxEvent.count({ where: { tenantId: tid, type: "pos.sale.voided" } });
    await wiring.drainAll();
    const acctDup = await rev4000();
    chk("RF-2.1", "refund ซ้ำ → ok:false (ไม่ทำซ้ำ)", rf2.ok === false, "false", JSON.stringify(rf2));
    chk("RF-2.2", "void outbox ไม่เพิ่ม + GL รายได้ยัง net=0 (ไม่กลับบัญชีเบิ้ล)", voidCount === 1 && acctDup.revNet === 0, "1/0", `${voidCount}/${acctDup.revNet}`);

    // ── guard: refund enrollment ที่ยัง ENROLLED (ไม่จ่าย) ──
    const e2 = await prisma.schoolEnrollment.findFirst({ where: { tenantId: tid, studentName: "น้องบี" } });
    const rfG = await sc.refundEnrollment(ctx, e2!.id);
    const stillEnrolled = (await prisma.schoolEnrollment.findUnique({ where: { id: e2!.id } }))?.status;
    chk("RF-3.1", "refund ENROLLED → ok:false + enrollment ยัง ENROLLED", rfG.ok === false && !!rfG.reason && stillEnrolled === "ENROLLED", "false+ENROLLED", `${rfG.ok}/${stillEnrolled}`);

    // ── cross-tenant: refund enrollment t1 ด้วย ctx t2 ──
    const t2 = await prisma.tenant.create({ data: { name: "QC SCH RF2", slug: `qc-schrf2-${Date.now()}` } }); tid2 = t2.id;
    const unit2 = await prisma.businessUnit.create({ data: { tenantId: tid2, type: "SCHOOL", name: "รร.อื่น", slug: `schrf2-${Date.now()}` } });
    await sys.createSystem(tid2, "POS", "ขาย");
    const ctx2 = { tenantId: tid2, unitId: unit2.id };
    const clX = await sc.createClass(ctx, { courseId: c1.id, name: "รอบข้ามร้าน" });
    const eX = await sc.enroll(ctx, { classId: clX.id, studentName: "ข", studentPhone: "0811111111" });
    await sc.markPaid(ctx, eX.id);
    const rfCross = await sc.refundEnrollment(ctx2, eX.id); // ctx t2 บน enrollment t1
    const eXStatus = (await prisma.schoolEnrollment.findUnique({ where: { id: eX.id as string } }))?.status;
    chk("RF-4.1", "cross-tenant refund → ok:false + enrollment t1 ยัง PAID (ไม่ถูกคืน)", rfCross.ok === false && eXStatus === "PAID", "false+PAID", `${rfCross.ok}/${eXStatus}`);
  }
} catch (e) { chk("CRASH", "จบ", false, "จบ", e instanceof Error ? e.message.slice(0, 200) : String(e)); }
finally {
  const d = async (f: () => Promise<unknown>) => { try { await f(); } catch {} };
  for (const id of [tid, tid2].filter(Boolean)) {
    await d(() => prisma.accountJournalLine.deleteMany({ where: { tenantId: id } }));
    await d(() => prisma.accountJournalEntry.deleteMany({ where: { tenantId: id } }));
    for (const m of ["accountSystemLink", "accountMapping", "accountLedger", "accountPeriod", "accountDocSequence", "accountSettings", "schoolAttendance", "schoolEnrollment", "schoolClass", "schoolCourse", "posPayment", "posSaleLine", "posSale", "posReceiptCounter", "customer", "outboxEvent", "appNotification", "appSystemUnit", "appSystem"]) await d(() => (prisma as never as Record<string, { deleteMany: (a: unknown) => Promise<unknown> }>)[m].deleteMany({ where: { tenantId: id } }));
    await d(() => prisma.businessUnit.deleteMany({ where: { tenantId: id } }));
    await d(() => prisma.tenant.delete({ where: { id } }));
  }
  await prisma.$disconnect();
}
const f = cks.filter((c) => !c.ok);
console.log(`\n===== QC School Refund =====\nผ่าน ${cks.length - f.length}/${cks.length}`);
console.log(`FINDINGS: CRITICAL ${f.filter((c) => c.sev === "CRITICAL").length} · MAJOR ${f.filter((c) => c.sev === "MAJOR").length} · MINOR ${f.filter((c) => c.sev === "MINOR").length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed: cks.length - f.length, findings: f.map((c) => c.id) })}`);
process.exit(f.filter((c) => c.sev === "CRITICAL").length > 0 ? 1 : 0);
