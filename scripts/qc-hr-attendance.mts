// QC — สาย/ขาดงาน ใช้งานได้จริง (ต่อจากตารางเข้างาน 11 ส.ค. 2026)
// ⚠️ Oracle ภายใต้ change control — Fable (Auditor) เป็นเจ้าของ
//
// สัญญาที่ต้องจริงเสมอ:
// [1] ลงเวลาเข้า → เก็บคำตัดสินติดแถวไว้ (snapshot) · แก้ตารางทีหลังต้องไม่ย้อนเปลี่ยนอดีต
// [2] ออกงาน ไม่ตัดสิน (judgement null) — สัญญานี้ไม่มี "ออกก่อนเวลา"
// [3] 🔴 ห้ามกล่าวหาจากข้อมูลที่ยังไม่มี: ไม่มีตาราง / วันก่อนตั้งตาราง / วันนี้ยังไม่จบ = ไม่นับขาดงาน
// [4] วันลาที่อนุมัติ = "ลา" ไม่ใช่ "ขาด" · ใบลาที่ยังรออนุมัติไม่ช่วยกันขาด
// [5] ไม่รั่วข้ามร้าน (ctx ผิดร้าน = มองไม่เห็นข้อมูล)
//
// รัน: pnpm exec tsx scripts/qc-hr-attendance.mts
try { process.loadEnvFile(".env"); } catch { /* CI ใช้ secrets */ }

const { prisma } = await import("@/lib/core/db");
const sys = await import("@/lib/modules/system/service");
const hr = await import("@/lib/modules/hr/service");

type Sev = "CRITICAL" | "MAJOR" | "MINOR";
type Check = { id: string; name: string; ok: boolean; expected: string; actual: string; sev: Sev };
const checks: Check[] = [];
function chk(id: string, name: string, ok: boolean, expected: string, actual: string, sev: Sev = "CRITICAL") {
  checks.push({ id, name, ok, expected, actual, sev });
  console.log(`  ${ok ? "✅" : "❌"} [${id}] ${name}${ok ? "" : ` — expected ${expected} | actual ${actual}`}`);
}

// เวลาไทย → instant (ใช้สร้างบันทึกลงเวลาย้อนหลังในข้อสอบ)
const bkkAt = (dateStr: string, h: number, m: number) => new Date(`${dateStr}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00+07:00`);
const bkkToday = () => new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
const bkkDay = (offset: number) => new Date(Date.now() + 7 * 3_600_000 + offset * 86_400_000).toISOString().slice(0, 10);
const weekdayOf = (dateStr: string) => new Date(`${dateStr}T00:00:00Z`).getUTCDay();

let tid = "";
let otherTid = "";
try {
  const t = await prisma.tenant.create({ data: { name: "QC สาย/ขาด", slug: `qc-hra-${Date.now()}` } });
  tid = t.id;
  const hrSys = await sys.createSystem(tid, "HR", "ทีมงาน");
  const ctx = { tenantId: tid, systemId: hrSys.id };
  const emp = await hr.createEmployee(ctx, { name: "ช่างทดสอบ" });

  // ── [1] ลงเวลาเข้าโดยยังไม่มีตาราง = ไม่ตัดสิน ──
  console.log("── ยังไม่ตั้งตาราง ห้ามตัดสิน ──");
  const noSch = await hr.clock(ctx, { employeeId: emp.id, kind: "IN" });
  chk("AT-1", "🔴 ยังไม่ตั้งตาราง → NO_SCHEDULE (ไม่ใช่ LATE)", noSch.judgement === "NO_SCHEDULE", "NO_SCHEDULE", String(noSch.judgement));
  const rowNoSch = await prisma.hrAttendance.findUnique({ where: { id: noSch.id } });
  chk("AT-1b", "เก็บคำตัดสินติดแถวไว้จริง", rowNoSch?.judgement === "NO_SCHEDULE" && rowNoSch?.lateMin == null, "NO_SCHEDULE/null", JSON.stringify({ j: rowNoSch?.judgement, l: rowNoSch?.lateMin }));

  // ── [2] ออกงานไม่ตัดสิน ──
  const out = await hr.clock(ctx, { employeeId: emp.id, kind: "OUT" });
  const rowOut = await prisma.hrAttendance.findUnique({ where: { id: out.id } });
  chk("AT-2", "ออกงานไม่ตัดสิน (judgement ว่าง)", out.judgement === null && rowOut?.judgement == null, "null", JSON.stringify(out.judgement));

  // ── [3] ตั้งตารางครบ 7 วัน 09:00-18:00 ผ่อนผัน 15 นาที แล้วลงเวลาจริง ──
  console.log("── ตั้งตารางแล้ว: ตรงเวลา/สาย ──");
  const full = { dayOff: false, startMin: 540, endMin: 1080, graceMin: 15 };
  await hr.setSchedule(ctx, emp.id, Array.from({ length: 7 }, (_, wd) => ({ weekday: wd, ...full })));
  const onTime = await hr.clock(ctx, { employeeId: emp.id, kind: "IN" });
  const nowMin = (() => { const d = new Date(Date.now() + 7 * 3_600_000); return d.getUTCHours() * 60 + d.getUTCMinutes(); })();
  const expectLate = nowMin > 540 + 15;
  chk("AT-3", `ลงเวลาจริงตอนนี้ (${Math.floor(nowMin / 60)}:${String(nowMin % 60).padStart(2, "0")} ไทย) ตัดสินตามตาราง`,
    onTime.judgement === (expectLate ? "LATE" : "ON_TIME"), expectLate ? "LATE" : "ON_TIME", String(onTime.judgement));
  const rowNow = await prisma.hrAttendance.findUnique({ where: { id: onTime.id } });
  chk("AT-3b", "บันทึกเวลาที่ควรเข้า (dueMin=540) ไว้เป็นหลักฐาน", rowNow?.dueMin === 540, "540", String(rowNow?.dueMin));
  if (expectLate) {
    chk("AT-3c", "สายกี่นาทีนับจากเวลาที่ควรเข้า (ไม่หักผ่อนผัน)", rowNow?.lateMin === nowMin - 540, String(nowMin - 540), String(rowNow?.lateMin));
  } else {
    chk("AT-3c", "ไม่สาย → lateMin = 0", rowNow?.lateMin === 0, "0", String(rowNow?.lateMin));
  }

  // ตัดสินแบบ pure (ไม่ผ่าน DB) — เขตแดนผ่อนผัน
  const monday = (await hr.getSchedule(ctx, emp.id))[1]!;
  const at = (h: number, m: number) => new Date(Date.UTC(2026, 0, 5, h - 7, m));
  chk("AT-4", "09:15 พอดี (ผ่อนผัน 15) = ตรงเวลา", hr.clockInDetail(at(9, 15), monday).judgement === "ON_TIME", "ON_TIME", hr.clockInDetail(at(9, 15), monday).judgement);
  chk("AT-5", "09:16 = สาย 16 นาที (รายงานจริง ไม่หักผ่อนผัน)",
    hr.clockInDetail(at(9, 16), monday).judgement === "LATE" && hr.clockInDetail(at(9, 16), monday).lateMin === 16,
    "LATE/16", JSON.stringify(hr.clockInDetail(at(9, 16), monday)));

  // ── [4] snapshot: แก้ตารางทีหลังไม่ย้อนเปลี่ยนอดีต ──
  console.log("── แก้ตารางทีหลัง อดีตต้องไม่ขยับ ──");
  const before = await prisma.hrAttendance.findUnique({ where: { id: onTime.id } });
  await hr.setSchedule(ctx, emp.id, Array.from({ length: 7 }, (_, wd) => ({ weekday: wd, ...full, startMin: 300 }))); // ย้ายเวลาเข้าเป็น 05:00
  const after = await prisma.hrAttendance.findUnique({ where: { id: onTime.id } });
  chk("AT-6", "🔴 เลื่อนเวลาเข้างานเป็น 05:00 แล้วบันทึกเดิมต้องไม่เปลี่ยนคำตัดสิน",
    after?.judgement === before?.judgement && after?.dueMin === 540, "เหมือนเดิม/540",
    JSON.stringify({ j: after?.judgement, due: after?.dueMin }));
  await hr.setSchedule(ctx, emp.id, Array.from({ length: 7 }, (_, wd) => ({ weekday: wd, ...full })));

  // ── [5] สรุปเดือน: ขาดงาน/ลา/สาย ──
  console.log("── สรุปเดือน: ขาด/ลา/สาย ──");
  const today = bkkToday();
  const [yy, mm] = today.split("-").map(Number);
  const monthStart = new Date(Date.UTC(yy!, mm! - 1, 1));
  // ใช้พนักงานคนใหม่เพื่อคุมตัวแปร (คนเดิมมีบันทึกทดสอบปนอยู่)
  const emp2 = await hr.createEmployee(ctx, { name: "ช่างสรุป" });
  await hr.setSchedule(ctx, emp2.id, Array.from({ length: 7 }, (_, wd) => ({ weekday: wd, ...full })));

  const d1 = bkkDay(-1); // เมื่อวาน = ขาด (ไม่มีบันทึก ไม่มีใบลา)
  const d2 = bkkDay(-2); // สองวันก่อน = มาสาย 30 นาที
  const d3 = bkkDay(-3); // สามวันก่อน = ลาอนุมัติแล้ว
  // ตารางย้อนหลังถึง d3 เท่านั้น → หน้าต่างที่นับได้คือ d3, d2, d1 (วันก่อน d3 = ยังไม่มีตาราง)
  await prisma.hrWorkSchedule.updateMany({ where: { employeeId: emp2.id }, data: { createdAt: bkkAt(d3, 0, 1) } });
  const sameMonth = [d1, d2, d3].every((d) => d.slice(0, 7) === today.slice(0, 7));
  await prisma.hrAttendance.createMany({
    data: [
      { tenantId: tid, systemId: hrSys.id, employeeId: emp2.id, kind: "IN", at: bkkAt(d2, 9, 30), judgement: "LATE", dueMin: 540, lateMin: 30 },
      { tenantId: tid, systemId: hrSys.id, employeeId: emp2.id, kind: "OUT", at: bkkAt(d2, 18, 0) },
    ],
  });
  const leave = await hr.requestLeave(ctx, { employeeId: emp2.id, type: "SICK", fromDate: d3, toDate: d3 });
  const sumPending = await hr.monthlyAttendance(ctx, emp2.id, monthStart);
  if (sameMonth) {
    chk("AT-7", "ใบลารออนุมัติ ยังไม่ช่วยกันขาด (นับเป็นขาด 2 วัน: เมื่อวาน + วันที่ขอลา)",
      sumPending.absentDays === 2 && sumPending.leaveDays === 0, "ขาด 2/ลา 0",
      JSON.stringify({ absent: sumPending.absentDays, leave: sumPending.leaveDays }));
  } else {
    chk("AT-7", "ข้ามข้อ (ช่วงข้ามเดือน)", true, "-", "-", "MINOR");
  }
  await hr.decideLeave(ctx, leave.id, "APPROVED");
  const sum = await hr.monthlyAttendance(ctx, emp2.id, monthStart);
  if (sameMonth) {
    chk("AT-8", "อนุมัติลาแล้ว → วันนั้นเป็น 'ลา' ไม่ใช่ 'ขาด'",
      sum.leaveDays === 1 && sum.absentDays === 1, "ลา 1/ขาด 1",
      JSON.stringify({ absent: sum.absentDays, leave: sum.leaveDays }));
    chk("AT-9", "นับสายจากคำตัดสินที่บันทึกไว้ (1 ครั้ง 30 นาที)",
      sum.lateCount === 1 && sum.lateMinutes === 30, "1/30", JSON.stringify({ c: sum.lateCount, m: sum.lateMinutes }));
    chk("AT-10", "ชั่วโมงทำงานจับคู่ IN/OUT ของวันสาย = 8 ชม. 30 น.", sum.workedMinutes === 510, "510", String(sum.workedMinutes));
  } else {
    for (const id of ["AT-8", "AT-9", "AT-10"]) chk(id, "ข้ามข้อ (ช่วงข้ามเดือน)", true, "-", "-", "MINOR");
  }
  if (sameMonth) {
    // วันนี้ยังไม่ลงเวลาเข้าเลย — ถ้าเผลอนับวันนี้ workDays จะเป็น 3 และ absent จะเป็น 2
    chk("AT-11", "🔴 วันนี้ยังไม่จบ ห้ามนับ (ต้องเข้า 2 วัน = เมื่อวาน+สองวันก่อน)",
      sum.workDays === 2, "2", JSON.stringify({ work: sum.workDays, absent: sum.absentDays }));
  } else {
    chk("AT-11", "ข้ามข้อ (ช่วงข้ามเดือน)", true, "-", "-", "MINOR");
  }

  // ── [6] ตารางเพิ่งตั้งวันนี้ = ไม่ย้อนไปนับขาดของวันก่อน ──
  const emp3 = await hr.createEmployee(ctx, { name: "ช่างเข้าใหม่" });
  await hr.setSchedule(ctx, emp3.id, Array.from({ length: 7 }, (_, wd) => ({ weekday: wd, ...full })));
  const sumNew = await hr.monthlyAttendance(ctx, emp3.id, monthStart);
  chk("AT-12", "🔴 ตารางเพิ่งตั้งวันนี้ → ขาดงาน 0 วัน (ห้ามย้อนไปกล่าวหา)",
    sumNew.absentDays === 0 && sumNew.workDays === 0, "0/0", JSON.stringify({ absent: sumNew.absentDays, work: sumNew.workDays }));

  // ── [7] วันหยุดประจำไม่นับขาด ──
  const emp4 = await hr.createEmployee(ctx, { name: "ช่างหยุดประจำ" });
  await hr.setSchedule(ctx, emp4.id, Array.from({ length: 7 }, (_, wd) => ({ weekday: wd, ...full, dayOff: true })));
  await prisma.hrWorkSchedule.updateMany({ where: { employeeId: emp4.id }, data: { createdAt: monthStart } });
  const sumOff = await hr.monthlyAttendance(ctx, emp4.id, monthStart);
  chk("AT-13", "ทุกวันเป็นวันหยุดประจำ → ขาดงาน 0 · ต้องเข้า 0", sumOff.absentDays === 0 && sumOff.workDays === 0, "0/0", JSON.stringify(sumOff));
  const offDay = (await hr.getSchedule(ctx, emp4.id))[weekdayOf(today)]!;
  chk("AT-14", "มาลงเวลาในวันหยุดของตัวเอง = DAY_OFF (ไม่นับสาย)", hr.clockInDetail(new Date(), offDay).judgement === "DAY_OFF", "DAY_OFF", hr.clockInDetail(new Date(), offDay).judgement);

  // ── [8] ไม่รั่วข้ามร้าน ──
  const t2 = await prisma.tenant.create({ data: { name: "QC ร้านอื่น", slug: `qc-hrb-${Date.now()}` } });
  otherTid = t2.id;
  const sys2 = await sys.createSystem(otherTid, "HR", "ทีมงาน");
  const cross = await hr.monthlyAttendance({ tenantId: otherTid, systemId: sys2.id }, emp2.id, monthStart);
  chk("AT-15", "ร้านอื่นถามสรุปของพนักงานเราไม่ได้ (ว่างเปล่า)",
    cross.lateCount === 0 && cross.workDays === 0 && cross.workedMinutes === 0, "ว่าง", JSON.stringify(cross));
  const crossSet = await hr.employeesWithSchedule({ tenantId: otherTid, systemId: sys2.id });
  chk("AT-16", "รายชื่อคนที่ตั้งตารางแล้ว ไม่รั่วข้ามร้าน", !crossSet.has(emp2.id), "ไม่มี", String(crossSet.size));
} catch (e) {
  chk("CRASH", "harness ทำงานจนจบ", false, "จบปกติ", e instanceof Error ? (e.stack ?? e.message).slice(0, 300) : String(e));
} finally {
  for (const id of [tid, otherTid].filter(Boolean)) {
    const del = async (n: string, fn: () => Promise<unknown>) => {
      try { await fn(); } catch (err) { console.log(`  ⚠ cleanup ${n}: ${err instanceof Error ? err.message.slice(0, 60) : err}`); }
    };
    for (const [n, fn] of [
      ["hrAttendance", () => prisma.hrAttendance.deleteMany({ where: { tenantId: id } })],
      ["hrLeave", () => prisma.hrLeave.deleteMany({ where: { tenantId: id } })],
      ["hrWorkSchedule", () => prisma.hrWorkSchedule.deleteMany({ where: { tenantId: id } })],
      ["hrEmployee", () => prisma.hrEmployee.deleteMany({ where: { tenantId: id } })],
      ["approvalRequest", () => prisma.approvalRequest.deleteMany({ where: { tenantId: id } })],
      ["appSystemUnit", () => prisma.appSystemUnit.deleteMany({ where: { tenantId: id } })],
      ["appSystem", () => prisma.appSystem.deleteMany({ where: { tenantId: id } })],
      ["tenant", () => prisma.tenant.delete({ where: { id } })],
    ] as [string, () => Promise<unknown>][]) await del(n, fn);
  }
  console.log("\n[cleanup] ลบ test tenant เรียบร้อย");
  await prisma.$disconnect();
}

const failed = checks.filter((c) => !c.ok);
const bySev = (s: Sev) => failed.filter((c) => c.sev === s).length;
console.log("\n===== QC: สาย/ขาดงาน (HR attendance) =====");
console.log(`ผ่าน ${checks.length - failed.length}/${checks.length}`);
console.log(`FINDINGS: CRITICAL ${bySev("CRITICAL")} · MAJOR ${bySev("MAJOR")} · MINOR ${bySev("MINOR")}`);
console.log("\nJSON_SUMMARY " + JSON.stringify({ total: checks.length, passed: checks.length - failed.length, findings: failed.map((c) => ({ id: c.id, sev: c.sev })) }));
process.exit(bySev("CRITICAL") > 0 ? 1 : 0);
