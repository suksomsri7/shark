// QC — School public storefront: ผู้ปกครองสมัครเรียน+จ่ายค่าเรียนเอง
//   (resolve slug → list รอบเรียนเปิด → สมัคร PENDING+publicToken → ร้าน markPaid → posSale PAID + ลงบัญชี
//    → capacity race (FOR UPDATE) → cross-tenant)
// standalone-typesafe: dynamic import + wide cast (ไม่ผูก type ตอน compile)
//
// สัญญา src/lib/modules/school/service.ts:
//   resolveSchoolUnit(tenantSlug, unitSlug) — public resolve (ACTIVE + type=SCHOOL) · ผิด → null
//   listPublicClasses(ctx) — รอบเรียน (คอร์ส active) + ค่าเรียน + ที่ว่างคงเหลือ
//   enroll(ctx, ...) — FOR UPDATE lock กันสมัครเกิน capacity + snapshot ราคา + คืน publicToken
//   getPublicEnrollment(unitId, publicToken) — สถานะการสมัคร (กัน cross-tenant PII)
//   markPaid(ctx, enrollmentId) — posSale PAID (ลงบัญชี) · idempotent
//   promptpayForEnrollment(ctx, enrollmentId) — payload PromptPay ยอดค่าเรียน
try { process.loadEnvFile(".env"); } catch {}
const { prisma } = await import("@/lib/core/db");
const sys = await import("@/lib/modules/system/service");
const acc = await import("@/lib/modules/account/service");
const gl = await import("@/lib/modules/account/gl");
const wiring = await import("@/lib/outbox-consumers");
const svc = (await import("@/lib/modules/school/service" as string)) as { [k: string]: (...a: any[]) => Promise<any> };

type Sev = "CRITICAL" | "MAJOR" | "MINOR";
const cks: { id: string; ok: boolean; exp: string; act: string; sev: Sev }[] = [];
const chk = (id: string, n: string, ok: boolean, e: string, a: string, s: Sev = "CRITICAL") => {
  cks.push({ id, ok, exp: e, act: a, sev: s });
  console.log(`  ${ok ? "✅" : "❌"} [${id}] ${n}${ok ? "" : ` — exp ${e} | act ${a}`}`);
};

const PRICE = 10700; // ค่าเรียน ฿107 (รวม VAT)
let tid = ""; let tid2 = "";
try {
  const stamp = Date.now();
  const tSlug = `qc-scpub-${stamp}`;
  const uSlug = `scpub-${stamp}`;
  const t = await prisma.tenant.create({ data: { name: "QC SC PUB", slug: tSlug } }); tid = t.id;
  const unit = await prisma.businessUnit.create({ data: { tenantId: tid, type: "SCHOOL", name: "โรงเรียนว่ายน้ำริมเล", slug: uSlug } });
  const posSys = await sys.createSystem(tid, "POS", "ค่าเรียน"); await sys.linkUnit(tid, posSys.id, unit.id);
  const accSys = await sys.createSystem(tid, "ACCOUNT", "บัญชี");
  await acc.saveSettings(tid, accSys.id, { orgName: "โรงเรียน จำกัด", taxId: "0105561177639", vatRegistered: true } as never);
  await gl.ensureAccounting({ tenantId: tid, systemId: accSys.id });
  await prisma.accountSystemLink.create({ data: { tenantId: tid, systemId: accSys.id, linkedKind: "POS", linkedId: posSys.id } });
  await prisma.paymentProfile.create({ data: { tenantId: tid, promptpayId: "0812345678", displayName: "โรงเรียนว่ายน้ำริมเล" } });

  const ctx = { tenantId: tid, unitId: unit.id };

  // คอร์ส (active) + รอบเรียน capacity 2 · คอร์สปิดใช้ (ต้องไม่โผล่ใน public)
  const course = await svc.createCourse(ctx, { name: "ว่ายน้ำเด็ก", priceSatang: PRICE, description: "รอบเช้า" });
  const cl = await svc.createClass(ctx, { courseId: course.id, name: "รอบเช้า ส.ค.", capacity: 2 });
  const clId = cl.id as string;
  const courseOff = await svc.createCourse(ctx, { name: "คอร์สปิดใช้", priceSatang: 5000 });
  await svc.updateCourse(ctx, courseOff.id, { active: false });
  await svc.createClass(ctx, { courseId: courseOff.id, name: "รอบปิด", capacity: 5 });

  const acctSide = async (code: string) => {
    const es = await prisma.accountJournalEntry.findMany({ where: { systemId: accSys.id, refType: "PosSale" }, include: { lines: { include: { account: { select: { code: true } } } } } });
    const dr = es.flatMap((e) => e.lines).filter((l) => l.account.code === code).reduce((a, l) => a + l.debit, 0);
    const cr = es.flatMap((e) => e.lines).filter((l) => l.account.code === code).reduce((a, l) => a + l.credit, 0);
    return { dr, cr, net: dr - cr };
  };

  // ── SP-1: resolveSchoolUnit ──
  const r1 = await svc.resolveSchoolUnit(tSlug, uSlug);
  chk("SP-1.1", "resolveSchoolUnit slug ถูก → tenant+unit", !!r1 && r1.unit?.id === unit.id, "unit.id", `${r1?.unit?.id === unit.id}`);
  const r1b = await svc.resolveSchoolUnit(tSlug, "ไม่มีสาขานี้");
  chk("SP-1.2", "resolveSchoolUnit slug ผิด → null", r1b === null, "null", JSON.stringify(r1b));

  // ── SP-2: listPublicClasses → เฉพาะคอร์ส active + ราคา + ที่ว่าง ──
  const cls0 = await svc.listPublicClasses(ctx);
  const clPub = cls0.find((x: any) => x.id === clId);
  chk("SP-2.1", "listPublicClasses → คืนรอบของคอร์ส active เท่านั้น (1 รอบ)", cls0.length === 1 && !!clPub, "1", String(cls0.length));
  chk("SP-2.2", "รอบเรียน: ค่าเรียน 10700 + ที่ว่าง 2", clPub?.priceSatang === PRICE && clPub?.remaining === 2 && clPub?.full === false, "107/2", `${clPub?.priceSatang}/${clPub?.remaining}`);

  // ── SP-3: enroll (public) → ENROLLED + publicToken + snapshot ──
  const en = await svc.enroll(ctx, { classId: clId, studentName: "น้องเจ", studentPhone: "0891112222" });
  const enId = en.id as string;
  const token = en.publicToken as string;
  chk("SP-3.1", "enroll ok + มี publicToken", !!enId && !!token, "id+token", `${!!enId}/${!!token}`);
  const enRow = await prisma.schoolEnrollment.findUnique({ where: { id: enId } });
  chk("SP-3.2", "ENROLLED + snapshot ราคา 10700 + ยังไม่ชำระ", enRow?.status === "ENROLLED" && enRow?.priceSatang === PRICE && enRow?.posSaleId === null, "ENROLLED/107", `${enRow?.status}/${enRow?.priceSatang}`);
  const pub0 = await svc.getPublicEnrollment(unit.id, token);
  chk("SP-3.3", "getPublicEnrollment(token) → การสมัครถูกใบ + ชื่อผู้เรียน + คอร์ส", pub0?.id === enId && pub0?.studentName === "น้องเจ" && pub0?.class?.course?.name === "ว่ายน้ำเด็ก", "enId+น้องเจ", `${pub0?.id === enId}/${pub0?.studentName}`);
  const pp = await svc.promptpayForEnrollment(ctx, enId);
  chk("SP-3.4", "promptpayForEnrollment → payload PromptPay (ยอดค่าเรียน)", !!pp?.payload && pp.payload.length > 20, "payload", `${!!pp?.payload}`);
  const clsAfter = await svc.listPublicClasses(ctx);
  chk("SP-3.5", "สมัครแล้ว → ที่ว่าง 1 (2-1)", clsAfter.find((x: any) => x.id === clId)?.remaining === 1, "1", `${clsAfter.find((x: any) => x.id === clId)?.remaining}`);

  // ── SP-4: ร้าน markPaid → posSale PAID + ลงบัญชี ──
  await svc.markPaid(ctx, enId);
  await wiring.drainAll();
  const sale = await prisma.posSale.findUnique({ where: { tenantId_idempotencyKey: { tenantId: tid, idempotencyKey: `school-${enId}` } } });
  const es = await prisma.accountJournalEntry.findMany({ where: { systemId: accSys.id, refType: "PosSale" }, include: { lines: true } });
  chk("SP-4.1", "markPaid → posSale PAID (ลงบัญชี)", sale?.status === "PAID" && es.length >= 1, "PAID+≥1", `${sale?.status}/${es.length}`);
  const rev4000 = await acctSide("4000");
  chk("SP-4.2", "Cr รายได้ 4000 = ฐานหลังถอด VAT (10000)", rev4000.cr === Math.round(PRICE / 1.07), String(Math.round(PRICE / 1.07)), String(rev4000.cr));
  const dr = es.flatMap((e) => e.lines).reduce((a, l) => a + l.debit, 0);
  const cr = es.flatMap((e) => e.lines).reduce((a, l) => a + l.credit, 0);
  chk("SP-4.3", "งบสมดุล Σdr=Σcr", dr === cr && dr > 0, String(dr), String(cr));
  const enRow2 = await prisma.schoolEnrollment.findUnique({ where: { id: enId } });
  chk("SP-4.4", "การสมัคร → PAID + posSaleId ผูกบิล", enRow2?.status === "PAID" && enRow2?.posSaleId === (sale?.id ?? ""), "PAID+saleId", `${enRow2?.status}/${enRow2?.posSaleId === sale?.id}`);
  const pub1 = await svc.getPublicEnrollment(unit.id, token);
  chk("SP-4.5", "หน้า public เห็นสถานะ PAID", pub1?.status === "PAID", "PAID", `${pub1?.status}`);
  // idempotent
  await svc.markPaid(ctx, enId); await wiring.drainAll();
  const es2 = await prisma.accountJournalEntry.count({ where: { systemId: accSys.id, refType: "PosSale" } });
  chk("SP-4.6", "markPaid ซ้ำ idempotent (ไม่ post เบิ้ล)", es2 === es.length, String(es.length), String(es2));

  // ── SP-5: capacity race — เหลือ 1 ที่ (มี PAID 1) ยิง 2 พร้อมกัน → สำเร็จ 1 (ไม่เกิน capacity 2) ──
  const race = await Promise.all([
    svc.enroll(ctx, { classId: clId, studentName: "แข่ง A", studentPhone: "0810000001" }).then((r: any) => ({ ok: true, r })).catch(() => ({ ok: false })),
    svc.enroll(ctx, { classId: clId, studentName: "แข่ง B", studentPhone: "0810000002" }).then((r: any) => ({ ok: true, r })).catch(() => ({ ok: false })),
  ]);
  const okCount = race.filter((r: any) => r.ok === true).length;
  const activeCount = await prisma.schoolEnrollment.count({ where: { tenantId: tid, unitId: unit.id, classId: clId, status: { in: ["ENROLLED", "PAID"] } } });
  chk("SP-5.1", "สมัครที่สุดท้าย (2 พร้อมกัน) → สำเร็จ 1 · active=2 (ไม่เกิน capacity)", okCount === 1 && activeCount === 2, "1+2", `ok=${okCount}/active=${activeCount}`);
  const clsFull = await svc.listPublicClasses(ctx);
  chk("SP-5.2", "เต็ม → ที่ว่าง 0 + full=true", clsFull.find((x: any) => x.id === clId)?.remaining === 0 && clsFull.find((x: any) => x.id === clId)?.full === true, "0+full", `${clsFull.find((x: any) => x.id === clId)?.remaining}`);

  // ── SP-6: cross-tenant guard (กัน leak PII ผู้เรียนร้านอื่น) ──
  const t2 = await prisma.tenant.create({ data: { name: "QC SC PUB2", slug: `qc-scpub2-${stamp}` } }); tid2 = t2.id;
  const unitX = await prisma.businessUnit.create({ data: { tenantId: tid2, type: "SCHOOL", name: "ร้านอื่น", slug: `scpub2-${stamp}` } });
  const cross = await svc.getPublicEnrollment(unitX.id, token); // token ร้าน A + unit ร้าน B
  chk("SP-6.1", "publicToken ร้าน A + unit ร้าน B → null (ไม่ leak)", cross === null, "null", JSON.stringify(cross));
} catch (e) { chk("CRASH", "จบ", false, "จบ", e instanceof Error ? e.message.slice(0, 200) : String(e)); }
finally {
  const d = async (f: () => Promise<unknown>) => { try { await f(); } catch {} };
  for (const id of [tid, tid2].filter(Boolean)) {
    await d(() => prisma.accountJournalLine.deleteMany({ where: { tenantId: id } }));
    await d(() => prisma.accountJournalEntry.deleteMany({ where: { tenantId: id } }));
    for (const m of ["accountSystemLink", "accountMapping", "accountLedger", "accountPeriod", "accountDocSequence", "accountSettings", "schoolAttendance", "schoolEnrollment", "schoolClass", "schoolCourse", "posPayment", "posSaleLine", "posSale", "posReceiptCounter", "paymentProfile", "customer", "outboxEvent", "appNotification", "appSystemUnit", "appSystem"]) await d(() => (prisma as never as Record<string, { deleteMany: (a: unknown) => Promise<unknown> }>)[m].deleteMany({ where: { tenantId: id } }));
    await d(() => prisma.businessUnit.deleteMany({ where: { tenantId: id } }));
    await d(() => prisma.tenant.delete({ where: { id } }));
  }
  await prisma.$disconnect();
}
const f = cks.filter((c) => !c.ok);
console.log(`\n===== QC School Public =====\nผ่าน ${cks.length - f.length}/${cks.length}`);
console.log(`FINDINGS: CRITICAL ${f.filter((c) => c.sev === "CRITICAL").length} · MAJOR ${f.filter((c) => c.sev === "MAJOR").length} · MINOR ${f.filter((c) => c.sev === "MINOR").length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed: cks.length - f.length, findings: f.map((c) => c.id) })}`);
process.exit(f.filter((c) => c.sev === "CRITICAL").length > 0 ? 1 : 0);
