// QC — contract C-2: ลาอนุมัติแล้ว → ช่องจองของช่างคนนั้นปิดเอง (13 ส.ค. 2026)
// ⚠️ Oracle ภายใต้ change control — Fable (Auditor) เป็นเจ้าของ
//
// สัญญาที่ต้องจริงเสมอ:
// [1] ใบลา "รออนุมัติ" ยังไม่ปิดช่องจอง (ร้านยังไม่ตัดสิน = ยังรับนัดได้)
// [2] อนุมัติแล้ว → ช่างคนนั้นไม่มีช่องว่างในวันนั้น · "ใครก็ได้" ตกไปคนที่เหลือ (ร้านไม่เสียยอด)
// [3] ยิงจองตรง ๆ (API สาธารณะ) ก็ต้องถูกปฏิเสธ ไม่ใช่แค่ซ่อนช่องบนจอ
// [4] ช่างที่ไม่ผูกทะเบียนพนักงาน = ไม่มีข้อมูลลา → ห้ามปิดช่องมั่ว (ร้านต้องขายได้ตามปกติ)
// [5] 🔴 นัดที่รับลูกค้าไว้แล้วต้องไม่ถูกยกเลิกอัตโนมัติ — แค่ติดป้ายเตือนให้ร้านจัดการ
// [6] เปลี่ยนใจไม่อนุมัติ → ช่องจองกลับมาเอง
//
// รัน: pnpm exec tsx scripts/qc-hr-leave-booking.mts
try { process.loadEnvFile(".env"); } catch { /* CI ใช้ secrets */ }

const { prisma } = await import("@/lib/core/db");
const sys = await import("@/lib/modules/system/service");
const booking = await import("@/lib/modules/booking/service");
const hr = await import("@/lib/modules/hr/service");

type Sev = "CRITICAL" | "MAJOR" | "MINOR";
type Check = { id: string; name: string; ok: boolean; expected: string; actual: string; sev: Sev };
const checks: Check[] = [];
function chk(id: string, name: string, ok: boolean, expected: string, actual: string, sev: Sev = "CRITICAL") {
  checks.push({ id, name, ok, expected, actual, sev });
  console.log(`  ${ok ? "✅" : "❌"} [${id}] ${name}${ok ? "" : ` — expected ${expected} | actual ${actual}`}`);
}
const dPlus = (n: number) => new Date(Date.now() + 7 * 3_600_000 + n * 86_400_000).toISOString().slice(0, 10);

let tid = "";
try {
  const t = await prisma.tenant.create({ data: { name: "QC ลา×จอง", slug: `qc-lvbk-${Date.now()}` } });
  tid = t.id;
  const unit = await prisma.businessUnit.create({
    data: { tenantId: tid, type: "BOOKING", name: "ร้านตัดผม", slug: `lvbk-${Date.now()}` },
  });
  const hrSys = await sys.createSystem(tid, "HR", "ทีมงาน");
  const hrCtx = { tenantId: tid, systemId: hrSys.id };
  const service = await prisma.bookingService.create({
    data: { tenantId: tid, unitId: unit.id, name: "ตัดผมชาย", durationMin: 60, priceSatang: 15000 },
  });
  await prisma.bookingHours.createMany({
    data: Array.from({ length: 7 }, (_, wd) => ({
      tenantId: tid, unitId: unit.id, weekday: wd, openMin: 540, closeMin: 1080, closed: false,
    })),
  });

  // ช่าง A ผูกทะเบียนพนักงาน (createStaff ขึ้นทะเบียน HR ให้เอง) · ช่าง B ไม่ผูก (ร้านเก่า)
  const staffA = await booking.createStaff({ tenantId: tid, unitId: unit.id, name: "ช่างเอ" });
  const staffB = await prisma.bookingStaff.create({
    data: { tenantId: tid, unitId: unit.id, name: "ช่างบี (ไม่ผูก)", employeeId: null },
  });
  const empA = staffA.employeeId;
  chk("LV-0", "createStaff ผูกทะเบียนพนักงานให้แล้ว (ของ 313d04a)", !!empA, "มี employeeId", String(empA));
  if (!empA) throw new Error("ช่าง A ไม่ได้ผูก HR — เทสต่อไม่ได้");

  const day = dPlus(3);
  const slotsBefore = await booking.getAvailableSlots(tid, unit.id, service.id, staffA.id, day);
  chk("LV-1", "ก่อนลา: ช่าง A มีช่องว่างในวันนั้น", slotsBefore.length > 0, ">0", String(slotsBefore.length));

  // นัดที่รับลูกค้าไว้ก่อนแล้ว (ไว้เช็คว่าไม่ถูกยกเลิกอัตโนมัติ)
  const appt = await booking.createAppointment({
    tenantId: tid, unitId: unit.id, serviceId: service.id, staffId: staffA.id,
    dateStr: day, startMin: 600, customerName: "ลูกค้าเก่า", customerPhone: "0800000001",
    idempotencyKey: `lv-${Date.now()}`,
  });
  chk("LV-1b", "จองนัดกับช่าง A ได้ตามปกติ", appt.ok === true, "ok", JSON.stringify(appt));

  // ── [1] ใบลารออนุมัติ = ยังไม่ปิดช่อง ──
  console.log("── ใบลารออนุมัติ ──");
  const leave = await hr.requestLeave(hrCtx, { employeeId: empA, type: "PERSONAL", fromDate: day, toDate: day });
  const pendingSlots = await booking.getAvailableSlots(tid, unit.id, service.id, staffA.id, day);
  chk("LV-2", "รออนุมัติ → ช่องจองยังอยู่ (ร้านยังไม่ตัดสิน)", pendingSlots.length > 0, ">0", String(pendingSlots.length));
  const apptsNow = await prisma.appointment.findMany({
    where: { tenantId: tid }, include: { staff: true },
  });
  const hitPending = await booking.appointmentsHitByLeave(tid, apptsNow);
  chk("LV-2b", "รออนุมัติ → ยังไม่ติดป้ายเตือนนัดที่ชน", hitPending.size === 0, "0", String(hitPending.size));

  // ── [2][3][4] อนุมัติแล้ว ──
  console.log("── อนุมัติลาแล้ว ──");
  await hr.decideLeave(hrCtx, leave.id, "APPROVED");
  const afterA = await booking.getAvailableSlots(tid, unit.id, service.id, staffA.id, day);
  chk("LV-3", "🔴 อนุมัติแล้ว → ช่าง A ไม่มีช่องว่างเลยในวันนั้น", afterA.length === 0, "0", String(afterA.length));
  const anyone = await booking.getAvailableSlots(tid, unit.id, service.id, null, day);
  chk("LV-4", "'ใครก็ได้' ยังจองได้ → ตกไปช่าง B ทุกช่อง (ร้านไม่เสียยอด)",
    anyone.length > 0 && anyone.every((s) => s.staffId === staffB.id), ">0 และเป็นช่าง B",
    JSON.stringify({ n: anyone.length, others: anyone.filter((s) => s.staffId !== staffB.id).length }));
  const blocked = await booking.createAppointment({
    tenantId: tid, unitId: unit.id, serviceId: service.id, staffId: staffA.id,
    dateStr: day, startMin: 780, customerName: "ลูกค้าใหม่", customerPhone: "0800000002",
  });
  chk("LV-5", "🔴 ยิงจองตรง ๆ กับช่างที่ลา → ถูกปฏิเสธ + บอกเหตุผลเป็นภาษาคน",
    blocked.ok === false && /ลา/.test((blocked as { reason: string }).reason), "ok:false + มีคำว่า 'ลา'", JSON.stringify(blocked));
  const okB = await booking.createAppointment({
    tenantId: tid, unitId: unit.id, serviceId: service.id, staffId: staffB.id,
    dateStr: day, startMin: 780, customerName: "ลูกค้าใหม่", customerPhone: "0800000003",
  });
  chk("LV-6", "ช่างที่ไม่ผูกทะเบียนพนักงาน = จองได้ปกติ (ห้ามปิดช่องมั่ว)", okB.ok === true, "ok", JSON.stringify(okB));

  // ── [5] นัดเดิมต้องไม่ถูกยกเลิกอัตโนมัติ แต่ต้องเห็นว่าชน ──
  const apptsAfter = await prisma.appointment.findMany({ where: { tenantId: tid }, include: { staff: true } });
  const hit = await booking.appointmentsHitByLeave(tid, apptsAfter);
  const apptId = (appt as { id: string }).id;
  chk("LV-7", "นัดที่ค้างอยู่ในวันที่ช่างลา → ติดป้ายเตือน", hit.has(apptId), "มี", JSON.stringify([...hit]));
  const still = await prisma.appointment.findUnique({ where: { id: apptId } });
  chk("LV-8", "🔴 นัดเดิมไม่ถูกยกเลิกอัตโนมัติ (สัญญากับลูกค้า ร้านต้องเป็นคนตัดสิน)",
    still?.status === "CONFIRMED", "CONFIRMED", String(still?.status));
  chk("LV-8b", "นัดของช่างที่ไม่ได้ลา ไม่ติดป้าย", !hit.has((okB as { id: string }).id), "ไม่มี", JSON.stringify([...hit]));

  // ── [6] เปลี่ยนใจไม่อนุมัติ → ช่องกลับมา ──
  await hr.decideLeave(hrCtx, leave.id, "REJECTED");
  const rejected = await booking.getAvailableSlots(tid, unit.id, service.id, staffA.id, day);
  chk("LV-9", "ไม่อนุมัติ → ช่องจองของช่าง A กลับมาเอง", rejected.length > 0, ">0", String(rejected.length));

  // ── ร้านที่ไม่เปิดระบบทีมงาน ต้องไม่พังและไม่ปิดช่อง ──
  const t2 = await prisma.tenant.create({ data: { name: "QC ไม่มี HR", slug: `qc-nohr-${Date.now()}` } });
  const unit2 = await prisma.businessUnit.create({
    data: { tenantId: t2.id, type: "BOOKING", name: "ร้านไม่มีทีมงาน", slug: `nohr-${Date.now()}` },
  });
  const svc2 = await prisma.bookingService.create({
    data: { tenantId: t2.id, unitId: unit2.id, name: "ตัดผม", durationMin: 60, priceSatang: 10000 },
  });
  await prisma.bookingHours.createMany({
    data: Array.from({ length: 7 }, (_, wd) => ({ tenantId: t2.id, unitId: unit2.id, weekday: wd, openMin: 540, closeMin: 1080, closed: false })),
  });
  const st2 = await booking.createStaff({ tenantId: t2.id, unitId: unit2.id, name: "ช่างเดี่ยว" });
  const slots2 = await booking.getAvailableSlots(t2.id, unit2.id, svc2.id, st2.id, day);
  chk("LV-10", "ร้านที่ไม่เปิดระบบทีมงาน → จองได้ปกติ (ไม่มีใบลาในระบบ)", slots2.length > 0, ">0", String(slots2.length));
  await prisma.bookingHours.deleteMany({ where: { tenantId: t2.id } });
  await prisma.bookingStaff.deleteMany({ where: { tenantId: t2.id } });
  await prisma.bookingService.deleteMany({ where: { tenantId: t2.id } });
  await prisma.businessUnit.deleteMany({ where: { tenantId: t2.id } });
  await prisma.tenant.delete({ where: { id: t2.id } });
} catch (e) {
  chk("CRASH", "harness ทำงานจนจบ", false, "จบปกติ", e instanceof Error ? (e.stack ?? e.message).slice(0, 300) : String(e));
} finally {
  if (tid) {
    const del = async (n: string, fn: () => Promise<unknown>) => {
      try { await fn(); } catch (err) { console.log(`  ⚠ cleanup ${n}: ${err instanceof Error ? err.message.slice(0, 60) : err}`); }
    };
    for (const [n, fn] of [
      ["appointment", () => prisma.appointment.deleteMany({ where: { tenantId: tid } })],
      ["bookingHours", () => prisma.bookingHours.deleteMany({ where: { tenantId: tid } })],
      ["bookingStaff", () => prisma.bookingStaff.deleteMany({ where: { tenantId: tid } })],
      ["bookingService", () => prisma.bookingService.deleteMany({ where: { tenantId: tid } })],
      ["hrLeave", () => prisma.hrLeave.deleteMany({ where: { tenantId: tid } })],
      ["hrEmployee", () => prisma.hrEmployee.deleteMany({ where: { tenantId: tid } })],
      ["approvalRequest", () => prisma.approvalRequest.deleteMany({ where: { tenantId: tid } })],
      ["appSystemUnit", () => prisma.appSystemUnit.deleteMany({ where: { tenantId: tid } })],
      ["appSystem", () => prisma.appSystem.deleteMany({ where: { tenantId: tid } })],
      ["customer", () => prisma.customer.deleteMany({ where: { tenantId: tid } })],
      ["unit", () => prisma.businessUnit.deleteMany({ where: { tenantId: tid } })],
      ["tenant", () => prisma.tenant.delete({ where: { id: tid } })],
    ] as [string, () => Promise<unknown>][]) await del(n, fn);
    console.log("\n[cleanup] ลบ test tenant เรียบร้อย");
  }
  await prisma.$disconnect();
}

const failed = checks.filter((c) => !c.ok);
const bySev = (s: Sev) => failed.filter((c) => c.sev === s).length;
console.log("\n===== QC: ลาอนุมัติ → ปิดช่องจอง (C-2) =====");
console.log(`ผ่าน ${checks.length - failed.length}/${checks.length}`);
console.log(`FINDINGS: CRITICAL ${bySev("CRITICAL")} · MAJOR ${bySev("MAJOR")} · MINOR ${bySev("MINOR")}`);
console.log("\nJSON_SUMMARY " + JSON.stringify({ total: checks.length, passed: checks.length - failed.length, findings: failed.map((c) => ({ id: c.id, sev: c.sev })) }));
process.exit(bySev("CRITICAL") > 0 ? 1 : 0);
