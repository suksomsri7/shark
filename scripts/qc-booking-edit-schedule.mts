// QC — แก้ไขบริการ / วันหยุดรายวัน / รวมพนักงาน / ตารางเข้างาน (คำสั่งเจ้าของ 11 ส.ค. 2026)
// ⚠️ Oracle ภายใต้ change control — Fable (Auditor) เป็นเจ้าของ
//
// สัญญาที่ต้องจริงเสมอ:
// [1] แก้ราคา  — 🔴 บิลที่ขายไปแล้วและบัญชีต้องไม่ขยับ · นัดที่จองไว้ใช้ราคา ณ วันจอง
// [2] วันหยุด  — closure ทับเวลาทำการรายสัปดาห์ · ปิดทั้งวัน = ไม่มีช่องจอง · เปิดพิเศษ = ใช้เวลาที่ตั้ง
// [3] พนักงาน  — เพิ่มช่างในระบบจองแล้วขึ้นทะเบียนทีมงานให้เอง (ไม่ต้องกรอกสองที่) · ชื่อซ้ำไม่สร้างซ้ำ
// [4] ตารางงาน — ตั้งเวลาเข้า-ออกรายวันได้ · ยังไม่ตั้ง = ห้ามตัดสินว่าสาย
//
// รัน: pnpm exec tsx scripts/qc-booking-edit-schedule.mts
try { process.loadEnvFile(".env"); } catch { /* CI ใช้ secrets */ }

const { prisma } = await import("@/lib/core/db");
const sys = await import("@/lib/modules/system/service");
const booking = await import("@/lib/modules/booking/service");
const hr = await import("@/lib/modules/hr/service");
const pos = await import("@/lib/modules/pos/service");

type Sev = "CRITICAL" | "MAJOR" | "MINOR";
type Check = { id: string; name: string; ok: boolean; expected: string; actual: string; sev: Sev };
const checks: Check[] = [];
function chk(id: string, name: string, ok: boolean, expected: string, actual: string, sev: Sev = "CRITICAL") {
  checks.push({ id, name, ok, expected, actual, sev });
  console.log(`  ${ok ? "✅" : "❌"} [${id}] ${name}${ok ? "" : ` — expected ${expected} | actual ${actual}`}`);
}
const dPlus = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

let tid = "";
try {
  const t = await prisma.tenant.create({ data: { name: "QC จอง+ตาราง", slug: `qc-bk-${Date.now()}` } });
  tid = t.id;
  const unit = await prisma.businessUnit.create({
    data: { tenantId: tid, type: "BOOKING", name: "ร้านตัดผม", slug: `bk-${Date.now()}` },
  });
  const ctx = { tenantId: tid, unitId: unit.id };
  const posSys = await sys.createSystem(tid, "POS", "ขายหน้าร้าน");
  await sys.linkUnit(tid, posSys.id, unit.id);
  const hrSys = await sys.createSystem(tid, "HR", "ทีมงาน");

  // ── [1] แก้ราคาแล้วประวัติต้องไม่ขยับ ──
  console.log("── แก้ราคาบริการ: ประวัติต้องไม่ขยับ ──");
  const svc = await prisma.bookingService.create({
    data: { tenantId: tid, unitId: unit.id, name: "ตัดผมชาย", durationMin: 30, priceSatang: 5000 },
  });
  // ขายที่ราคา 50 บาท
  const sale50 = await pos.createSale({
    tenantId: tid, unitId: unit.id, systemId: posSys.id, idempotencyKey: `s50-${Date.now()}`,
    lines: [{ name: svc.name, qty: 1, unitPriceSatang: 5000, serviceId: svc.id }],
    payMethods: [{ type: "CASH", amountSatang: 5000 }],
  });
  // จองไว้ที่ราคา 50 บาท (ยังไม่ปิดงาน)
  const staff = await booking.createStaff({ tenantId: tid, unitId: unit.id, name: "ช่างเอ" });
  await prisma.bookingHours.createMany({
    data: Array.from({ length: 7 }, (_, wd) => ({ tenantId: tid, unitId: unit.id, weekday: wd, openMin: 540, closeMin: 1200, closed: false })),
  });
  const bk = await booking.createAppointment({
    tenantId: tid, unitId: unit.id, serviceId: svc.id, staffId: staff.id,
    dateStr: dPlus(1), startMin: 600, customerName: "ลูกค้า", customerPhone: "0800000000",
  });
  chk("PR-0", "จองนัดได้", bk.ok === true, "ok", JSON.stringify(bk));

  // ขึ้นราคาเป็น 60
  await prisma.bookingService.updateMany({ where: { id: svc.id }, data: { priceSatang: 6000 } });

  const line = await prisma.posSaleLine.findFirst({ where: { saleId: sale50.saleId } });
  chk("PR-1", "🔴 บิลที่ขายไปแล้วยังเป็นราคาเดิม 50 บาท", line?.unitPriceSatang === 5000, "5000", String(line?.unitPriceSatang));
  const saleRow = await prisma.posSale.findUnique({ where: { id: sale50.saleId } });
  chk("PR-2", "🔴 ยอดรวมบิลเดิมไม่ขยับ", saleRow?.grandTotalSatang === 5000, "5000", String(saleRow?.grandTotalSatang));
  const appt = bk.ok ? await prisma.appointment.findUnique({ where: { id: bk.id } }) : null;
  chk("PR-3", "🔴 นัดที่จองไว้ก่อนขึ้นราคา เก็บราคา ณ วันจอง (50 บาท)", appt?.priceSatang === 5000, "5000", String(appt?.priceSatang));
  const svcNow = await prisma.bookingService.findUnique({ where: { id: svc.id } });
  chk("PR-4", "บริการเองเปลี่ยนเป็น 60 บาทแล้ว (มีผลกับครั้งถัดไป)", svcNow?.priceSatang === 6000, "6000", String(svcNow?.priceSatang));

  // ── [2] วันหยุด/เวลาพิเศษรายวัน ──
  console.log("── วันหยุดรายวัน ──");
  const day = dPlus(2);
  const before = await booking.getAvailableSlots(tid, unit.id, svc.id, staff.id, day);
  chk("CL-1", "ปกติมีช่องจอง", before.length > 0, ">0", String(before.length));
  await booking.setClosure(ctx, { date: day, closed: true, note: "หยุดปีใหม่" });
  const closed = await booking.getAvailableSlots(tid, unit.id, svc.id, staff.id, day);
  chk("CL-2", "🔴 ตั้งปิดทั้งวัน → ไม่มีช่องจองเลย (ทับเวลาทำการรายสัปดาห์)", closed.length === 0, "0", String(closed.length));
  await booking.setClosure(ctx, { date: day, closed: false, openMin: 600, closeMin: 720 });
  const special = await booking.getAvailableSlots(tid, unit.id, svc.id, staff.id, day);
  chk("CL-3", "เปลี่ยนเป็นเปิดพิเศษ 10:00-12:00 → มีช่องจองในกรอบนั้น",
    special.length > 0 && special.every((s) => s.startMin >= 600 && s.startMin + 30 <= 720),
    "อยู่ในกรอบ", JSON.stringify(special.map((s) => s.startMin)));
  const listed = await booking.listClosures(ctx);
  chk("CL-4", "วันหยุดโผล่ในรายการให้แก้/ลบได้", listed.some((c) => c.date === day), "มี", JSON.stringify(listed.map((c) => c.date)));
  await booking.removeClosure(ctx, listed.find((c) => c.date === day)!.id);
  const restored = await booking.getAvailableSlots(tid, unit.id, svc.id, staff.id, day);
  chk("CL-5", "ลบวันหยุด → กลับไปใช้เวลาทำการปกติ", restored.length === before.length, String(before.length), String(restored.length));
  const otherDay = await booking.getAvailableSlots(tid, unit.id, svc.id, staff.id, dPlus(3));
  chk("CL-6", "วันหยุดมีผลเฉพาะวันที่ตั้ง ไม่ลามวันอื่น", otherDay.length > 0, ">0", String(otherDay.length));

  // ── [3] รวมพนักงาน จอง ↔ ทีมงาน ──
  console.log("── พนักงานซ้ำซ้อน ──");
  const staff2 = await booking.createStaff({ tenantId: tid, unitId: unit.id, name: "ช่างบี" });
  chk("ST-1", "เพิ่มช่างในระบบจอง → ขึ้นทะเบียนทีมงานให้อัตโนมัติ", staff2.employeeId != null, "มี employeeId", String(staff2.employeeId));
  const empB = await prisma.hrEmployee.findFirst({ where: { tenantId: tid, name: "ช่างบี" } });
  chk("ST-2", "มีพนักงานชื่อเดียวกันอยู่ในทะเบียนทีมงานจริง", !!empB && empB.id === staff2.employeeId, "ตรงกัน", String(empB?.id));
  // จำลองร้านเดิม (เช่นช่างต๊อก): ช่างถูกเพิ่มไว้ก่อนมีการเชื่อม → employeeId ว่าง
  const legacy = await prisma.bookingStaff.create({
    data: { tenantId: tid, unitId: unit.id, name: "ช่างเก่า", employeeId: null },
  });
  const merged = await booking.linkStaffToHr(ctx);
  const legacyAfter = await prisma.bookingStaff.findUnique({ where: { id: legacy.id } });
  chk("ST-3", "ช่างที่เพิ่มไว้ก่อนมีการเชื่อม — กดรวมแล้วผูกทะเบียนให้",
    legacyAfter?.employeeId != null && merged.linked >= 1, "ผูกแล้ว", JSON.stringify(merged));
  chk("ST-3b", "ช่างที่เพิ่มหลังมีระบบทีมงาน ถูกผูกตั้งแต่ตอนสร้างอยู่แล้ว",
    (await prisma.bookingStaff.findUnique({ where: { id: staff.id } }))?.employeeId != null, "มี", "ไม่มี");
  const again = await booking.linkStaffToHr(ctx);
  chk("ST-4", "กดรวมซ้ำไม่สร้างพนักงานซ้ำ", again.created === 0 && again.linked === 0, "0/0", JSON.stringify(again));
  const dupName = await booking.createStaff({ tenantId: tid, unitId: unit.id, name: "ช่างบี" });
  const empCount = await prisma.hrEmployee.count({ where: { tenantId: tid, name: "ช่างบี" } });
  chk("ST-5", "เพิ่มช่างชื่อซ้ำ → ผูกพนักงานคนเดิม ไม่สร้างใหม่", empCount === 1 && dupName.employeeId === empB?.id, "1 คน", String(empCount));

  // ── [4] ตารางเข้างาน ──
  console.log("── ตารางเข้างานรายพนักงาน ──");
  const hrCtx = { tenantId: tid, systemId: hrSys.id };
  const empId = empB!.id;
  const none = await hr.getSchedule(hrCtx, empId);
  chk("SC-1", "ยังไม่ตั้ง → ว่างทั้ง 7 วัน", none.every((r) => r == null), "null ทั้งหมด", JSON.stringify(none));
  chk("SC-2", "🔴 ยังไม่ตั้งตาราง ห้ามตัดสินว่าสาย", hr.judgeClockIn(new Date(), null) === "NO_SCHEDULE", "NO_SCHEDULE", hr.judgeClockIn(new Date(), null));

  // จันทร์-ศุกร์ เต็มวัน · เสาร์-อาทิตย์ ครึ่งวัน
  const full = { dayOff: false, startMin: 540, endMin: 1080, graceMin: 15 };
  const half = { dayOff: false, startMin: 540, endMin: 780, graceMin: 15 };
  const res = await hr.setSchedule(hrCtx, empId, [
    ...[1, 2, 3, 4, 5].map((wd) => ({ weekday: wd, ...full })),
    { weekday: 6, ...half },
    { weekday: 0, ...half },
  ]);
  chk("SC-3", "ตั้ง จ-ศ เต็มวัน + ส-อา ครึ่งวัน ได้", res.ok === true, "ok", JSON.stringify(res));
  const sch = await hr.getSchedule(hrCtx, empId);
  chk("SC-4", "อ่านกลับได้ครบ: จันทร์ 09:00-18:00 · เสาร์ 09:00-13:00",
    sch[1]?.endMin === 1080 && sch[6]?.endMin === 780, "1080/780", JSON.stringify({ mon: sch[1]?.endMin, sat: sch[6]?.endMin }));

  const monday = sch[1]!;
  const at = (h: number, m: number) => new Date(Date.UTC(2026, 0, 5, h - 7, m)); // เวลาไทย → UTC
  chk("SC-5", "เข้า 09:10 (ผ่อนผัน 15 นาที) = ตรงเวลา", hr.judgeClockIn(at(9, 10), monday) === "ON_TIME", "ON_TIME", hr.judgeClockIn(at(9, 10), monday));
  chk("SC-6", "เข้า 09:30 = สาย", hr.judgeClockIn(at(9, 30), monday) === "LATE", "LATE", hr.judgeClockIn(at(9, 30), monday));
  const off = await hr.setSchedule(hrCtx, empId, [{ weekday: 1, ...full, dayOff: true }]);
  const schOff = await hr.getSchedule(hrCtx, empId);
  chk("SC-7", "ตั้งวันหยุดประจำได้ + วันที่ไม่ส่งมาถูกล้าง (กลับเป็นยังไม่ตั้ง)",
    off.ok && schOff[1]?.dayOff === true && schOff[6] == null, "จันทร์หยุด/เสาร์ว่าง",
    JSON.stringify({ mon: schOff[1]?.dayOff, sat: schOff[6] }));
  chk("SC-8", "วันหยุดประจำ = ไม่นับสาย", hr.judgeClockIn(at(11, 0), schOff[1]!) === "DAY_OFF", "DAY_OFF", hr.judgeClockIn(at(11, 0), schOff[1]!));
  const bad = await hr.setSchedule(hrCtx, empId, [{ weekday: 2, dayOff: false, startMin: 600, endMin: 540, graceMin: 0 }]);
  chk("SC-9", "เวลาออกก่อนเวลาเข้า → ปฏิเสธ", bad.ok === false, "false", JSON.stringify(bad));
} catch (e) {
  chk("CRASH", "harness ทำงานจนจบ", false, "จบปกติ", e instanceof Error ? (e.stack ?? e.message).slice(0, 200) : String(e));
} finally {
  if (tid) {
    const del = async (n: string, fn: () => Promise<unknown>) => {
      try { await fn(); } catch (err) { console.log(`  ⚠ cleanup ${n}: ${err instanceof Error ? err.message.slice(0, 60) : err}`); }
    };
    for (const [n, fn] of [
      ["posSaleLine", () => prisma.posSaleLine.deleteMany({ where: { tenantId: tid } })],
      ["posPayment", () => prisma.posPayment.deleteMany({ where: { tenantId: tid } })],
      ["posSale", () => prisma.posSale.deleteMany({ where: { tenantId: tid } })],
      ["posReceiptCounter", () => prisma.posReceiptCounter.deleteMany({ where: { tenantId: tid } })],
      ["outbox", () => prisma.outboxEvent.deleteMany({ where: { tenantId: tid } })],
      ["appointment", () => prisma.appointment.deleteMany({ where: { tenantId: tid } })],
      ["closure", () => prisma.bookingClosure.deleteMany({ where: { tenantId: tid } })],
      ["bookingHours", () => prisma.bookingHours.deleteMany({ where: { tenantId: tid } })],
      ["bookingStaffHours", () => prisma.bookingStaffHours.deleteMany({ where: { tenantId: tid } })],
      ["bookingStaff", () => prisma.bookingStaff.deleteMany({ where: { tenantId: tid } })],
      ["bookingService", () => prisma.bookingService.deleteMany({ where: { tenantId: tid } })],
      ["hrWorkSchedule", () => prisma.hrWorkSchedule.deleteMany({ where: { tenantId: tid } })],
      ["hrEmployee", () => prisma.hrEmployee.deleteMany({ where: { tenantId: tid } })],
      ["appSystemUnit", () => prisma.appSystemUnit.deleteMany({ where: { tenantId: tid } })],
      ["appSystem", () => prisma.appSystem.deleteMany({ where: { tenantId: tid } })],
      ["unit", () => prisma.businessUnit.deleteMany({ where: { tenantId: tid } })],
      ["tenant", () => prisma.tenant.delete({ where: { id: tid } })],
    ] as [string, () => Promise<unknown>][]) await del(n, fn);
    console.log("\n[cleanup] ลบ test tenant เรียบร้อย");
  }
  await prisma.$disconnect();
}

const failed = checks.filter((c) => !c.ok);
const bySev = (s: Sev) => failed.filter((c) => c.sev === s).length;
console.log("\n===== QC: แก้ไขบริการ / วันหยุด / พนักงาน / ตารางงาน =====");
console.log(`ผ่าน ${checks.length - failed.length}/${checks.length}`);
console.log(`FINDINGS: CRITICAL ${bySev("CRITICAL")} · MAJOR ${bySev("MAJOR")} · MINOR ${bySev("MINOR")}`);
console.log("\nJSON_SUMMARY " + JSON.stringify({ total: checks.length, passed: checks.length - failed.length, findings: failed.map((c) => ({ id: c.id, sev: c.sev })) }));
process.exit(bySev("CRITICAL") > 0 ? 1 : 0);
