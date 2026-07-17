// QC — School/คอร์ส (WO-0051) · Fable oracle, Builder ห้ามแตะ
// ⚠️ standalone-typesafe: dynamic import + wide cast เท่านั้น
//
// สัญญา src/lib/modules/school/service.ts (ctx {tenantId, unitId} — tenantDb ทุก query · unit type SCHOOL):
//   createCourse(ctx, {name, priceSatang, description?}) — name ว่าง/ราคา<0 throw ไทย · updateCourse · listCourses
//   createClass(ctx, {courseId, name, startDate?, capacity?}) · listClasses(ctx, courseId?)
//   enroll(ctx, {classId, studentName, studentPhone}) → {id} — snapshot priceSatang จาก course
//     · capacity เต็ม (นับ ENROLLED+PAID) → throw ไทย · ถ้า tenant มีระบบ MEMBER → หา/สร้าง Customer จากเบอร์ (member facade หรือ tenantDb) แล้วผูก customerId · ไม่มีระบบ → customerId null (ห้าม throw)
//   markPaid(ctx, enrollmentId) → {ok, posSaleId?} — claim ENROLLED→PAID + pos.createSale (systemId = POS ตัวแรก ·
//     idempotencyKey `school-<enrollmentId>` · sourceModule "SCHOOL" · payMethods CASH เต็มยอด) → posSaleId+paidAt
//     · ไม่มีระบบ POS → throw ไทย + revert ENROLLED · จ่ายแล้ว/ยกเลิก → ok:false
//   cancelEnrollment(ctx, id) → boolean (ENROLLED เท่านั้น)
//   checkIn(ctx, enrollmentId, date, present?) → {ok} — บันทึกเช็คชื่อ upsert-เอง (find→update/create · unique [enrollmentId,date]) ซ้ำวันเดิม = อัปเดต present ไม่งอกแถว · attendanceSheet(ctx, classId, date) → [{enrollmentId, studentName, present|null}]
//   UI: UNIT_NAV SCHOOL + SYSTEM_DEFS SCHOOL (business · available · no.23 — อัปเดต comment จำนวน F9.2) + หน้า /app/u/[unitSlug]/school (คอร์ส/รอบ/สมัคร/ชำระ/เช็คชื่อ) ไทยล้วน
try { process.loadEnvFile(".env"); } catch {}
const { prisma } = await import("@/lib/core/db");
const sys = await import("@/lib/modules/system/service");
type Sev = "CRITICAL" | "MAJOR" | "MINOR";
const cks: { id: string; ok: boolean; exp: string; act: string; sev: Sev }[] = [];
const chk = (id: string, n: string, ok: boolean, e: string, a: string, s: Sev = "CRITICAL") => { cks.push({ id, ok, exp: e, act: a, sev: s }); console.log(`  ${ok ? "✅" : "❌"} [${id}] ${n}${ok ? "" : ` — exp ${e} | act ${a}`}`); };
const D = (s: string) => new Date(s);
let tid = "";
try {
  const sc = (await import("@/lib/modules/school/service" as string).catch(() => null)) as { [k: string]: (...a: any[]) => Promise<any> } | null; // any จงใจ: oracle ล้ำหน้าโค้ด
  if (!sc) { chk("SC-0", "มี school/service.ts", false, "มี", "ยังไม่สร้าง"); }
  else {
    const t = await prisma.tenant.create({ data: { name: "QC SCHOOL", slug: `qc-sch-${Date.now()}` } }); tid = t.id;
    const unit = await prisma.businessUnit.create({ data: { tenantId: tid, type: "SCHOOL", name: "โรงเรียน QC", slug: `sch-${Date.now()}` } });
    await sys.createSystem(tid, "POS", "ขาย");
    const member = await sys.createSystem(tid, "MEMBER", "สมาชิก");
    const ctx = { tenantId: tid, unitId: unit.id };

    const c1 = await sc.createCourse(ctx, { name: "คอร์สว่ายน้ำ", priceSatang: 250000 });
    const cl = await sc.createClass(ctx, { courseId: c1.id, name: "รอบเช้า", capacity: 2 });
    const e1 = await sc.enroll(ctx, { classId: cl.id, studentName: "น้องเอ", studentPhone: "0801111111" });
    chk("SC-1.1", "สมัคร → snapshot ราคา 2500 + ผูก Customer (มีระบบสมาชิก)", (await prisma.schoolEnrollment.findUnique({ where: { id: e1.id as string } }))?.priceSatang === 250000 && (await prisma.customer.count({ where: { tenantId: tid, memberSystemId: member.id, phone: "0801111111" } })) === 1, "2500+customer", "?");
    await sc.enroll(ctx, { classId: cl.id, studentName: "น้องบี", studentPhone: "0802222222" });
    let thCap = false; try { await sc.enroll(ctx, { classId: cl.id, studentName: "น้องซี", studentPhone: "0803333333" }); } catch { thCap = true; }
    chk("SC-1.2", "capacity 2 เต็ม → คนที่ 3 throw ไทย", thCap, "throw", "?");

    const pay = await sc.markPaid(ctx, e1.id);
    const sale = await prisma.posSale.findFirst({ where: { tenantId: tid, idempotencyKey: `school-${e1.id}` } });
    chk("SC-2.1", "ชำระ → PAID + PosSale 2500 PAID + paidAt", pay.ok === true && sale?.grandTotalSatang === 250000 && sale?.status === "PAID" && (await prisma.schoolEnrollment.findUnique({ where: { id: e1.id as string } }))?.status === "PAID", "PAID/2500", `${sale?.grandTotalSatang}`);
    chk("SC-2.2", "outbox pos.sale.paid ≥1 + ชำระซ้ำ ok:false ไม่สร้างบิลซ้ำ", (await prisma.outboxEvent.count({ where: { tenantId: tid, type: "pos.sale.paid" } })) >= 1 && ((await sc.markPaid(ctx, e1.id)) as { ok: boolean }).ok === false && (await prisma.posSale.count({ where: { tenantId: tid, idempotencyKey: `school-${e1.id}` } })) === 1, "≥1/false/1", "?");

    await sc.checkIn(ctx, e1.id, D("2026-08-01"));
    await sc.checkIn(ctx, e1.id, D("2026-08-01"), false);
    chk("SC-3.1", "เช็คชื่อซ้ำวันเดิม → อัปเดต present ไม่งอกแถว (1 แถว present=false)", (await prisma.schoolAttendance.count({ where: { enrollmentId: e1.id as string } })) === 1 && (await prisma.schoolAttendance.findFirst({ where: { enrollmentId: e1.id as string } }))?.present === false, "1/false", "?");
    const sheet = (await sc.attendanceSheet(ctx, cl.id, D("2026-08-01"))) as { studentName: string; present: boolean | null }[];
    chk("SC-3.2", "attendanceSheet: น้องเอ present=false · น้องบียังไม่เช็ค (null)", sheet.length === 2 && sheet.find((x) => x.studentName === "น้องเอ")?.present === false && sheet.find((x) => x.studentName === "น้องบี")?.present === null, "false/null", JSON.stringify(sheet));

    const e3 = await sc.enroll(ctx, { classId: (await sc.createClass(ctx, { courseId: c1.id, name: "รอบบ่าย" })).id, studentName: "น้องดี", studentPhone: "0804444444" });
    chk("SC-4.1", "ยกเลิก ENROLLED → true · ชำระหลังยกเลิก → ok:false", (await sc.cancelEnrollment(ctx, e3.id)) === true && ((await sc.markPaid(ctx, e3.id)) as { ok: boolean }).ok === false, "true/false", "?");
  }
} catch (e) { chk("CRASH", "จบ", false, "จบ", e instanceof Error ? e.message.slice(0, 160) : String(e)); }
finally {
  const d = async (f: () => Promise<unknown>) => { try { await f(); } catch {} };
  if (tid) {
    for (const m of ["schoolAttendance", "schoolEnrollment", "schoolClass", "schoolCourse", "posPayment", "posSaleLine", "posSale", "posReceiptCounter", "customer", "outboxEvent", "appNotification", "appSystemUnit", "appSystem"]) await d(() => (prisma as never as Record<string, { deleteMany: (a: unknown) => Promise<unknown> }>)[m].deleteMany({ where: { tenantId: tid } }));
    await d(() => prisma.businessUnit.deleteMany({ where: { tenantId: tid } }));
    await d(() => prisma.tenant.delete({ where: { id: tid } }));
  }
  await prisma.$disconnect();
}
const f = cks.filter((c) => !c.ok);
console.log(`\n===== QC School =====\nผ่าน ${cks.length - f.length}/${cks.length}`);
console.log(`FINDINGS: CRITICAL ${f.filter((c) => c.sev === "CRITICAL").length} · MAJOR ${f.filter((c) => c.sev === "MAJOR").length} · MINOR ${f.filter((c) => c.sev === "MINOR").length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed: cks.length - f.length, findings: f.map((c) => c.id) })}`);
process.exit(f.filter((c) => c.sev === "CRITICAL").length > 0 ? 1 : 0);
