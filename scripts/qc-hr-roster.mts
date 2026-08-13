// QC — ทะเบียนพนักงานเป็นแหล่งเดียว + ใครรับคิว + ลบแบบ soft (มติเจ้าของ 13 ส.ค. 2026)
// ⚠️ Oracle ภายใต้ change control — Fable (Auditor) เป็นเจ้าของ
//
// สัญญาที่ต้องจริงเสมอ:
// [1] เพิ่ม/ลบคน = ที่ระบบพนักงาน HR ที่เดียว · หน้าจองคิวติ๊กได้แค่ "รับคิวที่สาขานี้"
// [2] ปิดรับคิว ≠ ลบพนักงาน (HR ยังเห็นคนนั้น) · ลบพนักงาน → หยุดรับคิวเองทุกสาขา
// [3] 🔴 ลบ = soft delete: บันทึกลงเวลา/ใบลา/นัดที่รับไว้ ต้องอยู่ครบ · กู้คืนได้
// [4] แก้ชื่อที่ HR → ชื่อในทะเบียนผู้รับคิวตามไปด้วย (จอ 2 ที่ต้องไม่ขัดกัน)
// [5] แก้ตำแหน่งงานได้ (เดิมกรอกตอนสร้างแล้วแก้ไม่ได้เลย)
// [6] แท็บ/ชื่อระบบไม่เพี้ยนกันระหว่าง layout กับหน้าจริง (เจ้าของหาหน้าขายไม่เจอเพราะชื่อไม่ตรง)
//
// รัน: pnpm exec tsx scripts/qc-hr-roster.mts
try { process.loadEnvFile(".env"); } catch { /* CI ใช้ secrets */ }

const { prisma } = await import("@/lib/core/db");
const { existsSync, readFileSync } = await import("node:fs");
const sys = await import("@/lib/modules/system/service");
const booking = await import("@/lib/modules/booking/service");
const hr = await import("@/lib/modules/hr/service");
const { SYSTEM_DEFS } = await import("@/lib/systems");
const { posTabs } = await import("@/lib/modules/pos/tabs");
const { hrTabs } = await import("@/lib/modules/hr/ui");

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
  // ── [6] ชื่อระบบ + แท็บ (static) ──
  console.log("── ชื่อระบบ + แท็บไม่เพี้ยน ──");
  const labelOf = (code: string) => SYSTEM_DEFS.find((d) => d.code === code)?.label ?? "";
  chk("NM-1", "ชื่อระบบ: พนักงาน HR · ขายหน้าร้าน POS · สินค้า/บริการ",
    labelOf("HR") === "พนักงาน HR" && labelOf("POS") === "ขายหน้าร้าน POS" && labelOf("INVENTORY") === "สินค้า/บริการ",
    "ครบ 3", JSON.stringify([labelOf("HR"), labelOf("POS"), labelOf("INVENTORY")]));
  const layoutSrc = readFileSync("src/app/app/layout.tsx", "utf8");
  const layoutHas = (label: string) => layoutSrc.includes(`label: "${label}"`);
  chk("NM-2", "แท็บ POS ในเมนูตรงกับ posTabs (ชื่อเดียวกันทุกที่)",
    posTabs("X").every((t) => layoutHas(t.label)), "ตรงกันทุกแท็บ",
    JSON.stringify(posTabs("X").filter((t) => !layoutHas(t.label)).map((t) => t.label)));
  chk("NM-3", "แท็บ HR ในเมนูตรงกับ hrTabs", hrTabs("X").every((t) => layoutHas(t.label)), "ตรงกันทุกแท็บ",
    JSON.stringify(hrTabs("X").filter((t) => !layoutHas(t.label)).map((t) => t.label)));
  chk("NM-4", "หน้าขาย POS มีจริง + ทุกหน้า POS ใช้แท็บชุดเดียว (posTabs)",
    existsSync("src/app/app/sys/[id]/pos/register/page.tsx") &&
      ["register", "products", "sales", "close"].every((r) =>
        /posTabs\(/.test(readFileSync(`src/app/app/sys/[id]/pos/${r}/page.tsx`, "utf8"))),
    "ใช้ posTabs ทุกหน้า", "ยังมีหน้าที่ก๊อปแท็บเอง", "MAJOR");

  // ── setup ร้านทดสอบ ──
  const t = await prisma.tenant.create({ data: { name: "QC ทะเบียนพนักงาน", slug: `qc-rost-${Date.now()}` } });
  tid = t.id;
  const unit = await prisma.businessUnit.create({
    data: { tenantId: tid, type: "BOOKING", name: "ร้านตัดผม", slug: `rost-${Date.now()}` },
  });
  const ctx = { tenantId: tid, unitId: unit.id };
  const hrSys = await sys.createSystem(tid, "HR", "พนักงาน HR");
  const hrCtx = { tenantId: tid, systemId: hrSys.id };
  const service = await prisma.bookingService.create({
    data: { tenantId: tid, unitId: unit.id, name: "ตัดผมชาย", durationMin: 60, priceSatang: 15000 },
  });
  await prisma.bookingHours.createMany({
    data: Array.from({ length: 7 }, (_, wd) => ({ tenantId: tid, unitId: unit.id, weekday: wd, openMin: 540, closeMin: 1080, closed: false })),
  });

  // ── [1] เพิ่มคนที่ HR → โผล่ในรายการ "ใครรับคิว" แบบยังไม่รับคิว ──
  console.log("── ใครรับคิว ──");
  const emp = await hr.createEmployee(hrCtx, { name: "ช่างเอ", position: "ช่างตัดผม" });
  const r1 = await booking.queueRoster(ctx);
  chk("RS-1", "เพิ่มพนักงานที่ HR → โผล่ในรายการใครรับคิว (ยังไม่รับคิว)",
    r1.rows.length === 1 && r1.rows[0]!.employeeId === emp.id && r1.rows[0]!.receiving === false,
    "1 คน/ไม่รับคิว", JSON.stringify(r1.rows));
  const noSlots = await booking.getAvailableSlots(tid, unit.id, service.id, null, dPlus(2));
  chk("RS-2", "ยังไม่ติ๊กใครรับคิว → ลูกค้าไม่มีช่องจอง", noSlots.length === 0, "0", String(noSlots.length));

  await booking.setStaffReceiving(ctx, emp.id, true);
  const r2 = await booking.queueRoster(ctx);
  chk("RS-3", "ติ๊กรับคิว → มีทะเบียนผู้รับคิวผูกกับพนักงานคนเดิม (ไม่สร้างคนใหม่)",
    r2.rows[0]!.receiving === true && r2.rows[0]!.staffId != null &&
      (await prisma.hrEmployee.count({ where: { tenantId: tid } })) === 1,
    "รับคิว + HR ยัง 1 คน", JSON.stringify({ receiving: r2.rows[0]!.receiving, hr: await prisma.hrEmployee.count({ where: { tenantId: tid } }) }));
  const slots = await booking.getAvailableSlots(tid, unit.id, service.id, null, dPlus(2));
  chk("RS-4", "ติ๊กแล้วลูกค้าจองได้", slots.length > 0, ">0", String(slots.length));

  // นัดที่รับไว้แล้ว (ไว้พิสูจน์ว่าปิดรับคิว/ลบคน ไม่ทำประวัติหาย)
  const appt = await booking.createAppointment({
    tenantId: tid, unitId: unit.id, serviceId: service.id, staffId: r2.rows[0]!.staffId!,
    dateStr: dPlus(2), startMin: 600, customerName: "ลูกค้า", customerPhone: "0800000001",
  });
  chk("RS-5", "จองนัดกับผู้รับคิวได้", appt.ok === true, "ok", JSON.stringify(appt));

  // ── [2] ปิดรับคิว ≠ ลบพนักงาน ──
  await booking.setStaffReceiving(ctx, emp.id, false);
  const r3 = await booking.queueRoster(ctx);
  const empStillThere = await hr.listEmployees(hrCtx);
  chk("RS-6", "🔴 ปิดรับคิว → HR ยังมีชื่อคนนี้อยู่ (บั๊กเดิมคือลบที่จองคิวแล้ว HR ยังมีชื่อ = คนละความหมาย)",
    r3.rows[0]!.receiving === false && empStillThere.length === 1, "ไม่รับคิว/HR 1 คน",
    JSON.stringify({ receiving: r3.rows[0]!.receiving, hr: empStillThere.length }));
  chk("RS-7", "ปิดรับคิว → ไม่มีช่องจองใหม่ แต่นัดเดิมยังอยู่",
    (await booking.getAvailableSlots(tid, unit.id, service.id, null, dPlus(2))).length === 0 &&
      (await prisma.appointment.count({ where: { tenantId: tid, status: "CONFIRMED" } })) === 1,
    "0 ช่อง/1 นัด", "-");

  // ── [3] ลบพนักงาน = soft delete ──
  console.log("── ลบพนักงานแบบ soft delete ──");
  await booking.setStaffReceiving(ctx, emp.id, true); // เปิดรับคิวไว้ก่อนลบ เพื่อดูว่าลบแล้วหยุดรับคิวเอง
  await hr.clock(hrCtx, { employeeId: emp.id, kind: "IN" });
  const del = await hr.setEmployeeActive(hrCtx, emp.id, false);
  chk("DL-1", "ลบพนักงานได้ (soft delete)", del.ok === true, "ok", JSON.stringify(del));
  chk("DL-2", "🔴 ประวัติลงเวลา + นัดที่รับไว้ ยังอยู่ครบหลังลบ",
    (await prisma.hrAttendance.count({ where: { tenantId: tid } })) === 1 &&
      (await prisma.appointment.count({ where: { tenantId: tid } })) === 1,
    "1/1", JSON.stringify([await prisma.hrAttendance.count({ where: { tenantId: tid } }), await prisma.appointment.count({ where: { tenantId: tid } })]));
  chk("DL-3", "ลบแล้วหายจากรายชื่อพนักงาน แต่ไปอยู่ 'ลบแล้ว' (กู้คืนได้)",
    (await hr.listEmployees(hrCtx)).length === 0 && (await hr.listRemovedEmployees(hrCtx)).length === 1,
    "0/1", "-");
  chk("DL-4", "🔴 ลบพนักงาน → หยุดรับคิวเองทันที (ไม่ต้องไปปิดในระบบจองอีกที)",
    (await booking.getAvailableSlots(tid, unit.id, service.id, null, dPlus(2))).length === 0, "0 ช่อง",
    String((await booking.getAvailableSlots(tid, unit.id, service.id, null, dPlus(2))).length));
  const blocked = await booking.createAppointment({
    tenantId: tid, unitId: unit.id, serviceId: service.id, staffId: r2.rows[0]!.staffId!,
    dateStr: dPlus(2), startMin: 780, customerName: "ลูกค้าใหม่", customerPhone: "0800000002",
  });
  chk("DL-5", "ยิงจองตรงกับคนที่ถูกลบ → ปฏิเสธ", blocked.ok === false, "false", JSON.stringify(blocked));
  chk("DL-6", "ลบแล้วไม่โผล่ในรายการใครรับคิว", (await booking.queueRoster(ctx)).rows.length === 0, "0", "-");

  await hr.setEmployeeActive(hrCtx, emp.id, true);
  chk("DL-7", "กู้คืนได้ → กลับมารับคิวตามเดิม",
    (await hr.listEmployees(hrCtx)).length === 1 &&
      (await booking.getAvailableSlots(tid, unit.id, service.id, null, dPlus(2))).length > 0,
    "1 คน + มีช่อง", "-");

  // ── [4][5] แก้ชื่อ/ตำแหน่ง ──
  console.log("── แก้ข้อมูลพนักงาน ──");
  const up = await hr.updateEmployee(hrCtx, emp.id, { name: "ช่างเอ (ใหม่)", position: "หัวหน้าช่าง", phone: "0891112222" });
  chk("ED-1", "แก้ชื่อ/ตำแหน่ง/เบอร์ได้", up.ok === true, "ok", JSON.stringify(up));
  const after = (await hr.listEmployees(hrCtx))[0]!;
  chk("ED-2", "ตำแหน่งงานบันทึกจริง", after.position === "หัวหน้าช่าง", "หัวหน้าช่าง", String(after.position));
  const r4 = await booking.queueRoster(ctx);
  const staffRow = await prisma.bookingStaff.findFirst({ where: { employeeId: emp.id } });
  chk("ED-3", "แก้ชื่อที่ HR → ชื่อในทะเบียนผู้รับคิวตามไปด้วย (จอ 2 ที่ต้องตรงกัน)",
    r4.rows[0]!.name === "ช่างเอ (ใหม่)" && staffRow?.name === "ช่างเอ (ใหม่)", "ตรงกัน",
    JSON.stringify({ roster: r4.rows[0]!.name, staff: staffRow?.name }));
  const bad = await hr.updateEmployee(hrCtx, emp.id, { name: "   " });
  chk("ED-4", "ชื่อว่าง → ปฏิเสธ (ไม่ปล่อยให้ทะเบียนมีคนไม่มีชื่อ)", bad.ok === false, "false", JSON.stringify(bad));

  // ── ไม่รั่วข้ามร้าน ──
  const t2 = await prisma.tenant.create({ data: { name: "QC ร้านอื่น", slug: `qc-rost2-${Date.now()}` } });
  const unit2 = await prisma.businessUnit.create({
    data: { tenantId: t2.id, type: "BOOKING", name: "ร้านอื่น", slug: `rost2-${Date.now()}` },
  });
  const cross = await booking.setStaffReceiving({ tenantId: t2.id, unitId: unit2.id }, emp.id, true);
  chk("XT-1", "🔴 ร้านอื่นเอาพนักงานของเราไปรับคิวไม่ได้", cross.ok === false, "false", JSON.stringify(cross));
  const crossRoster = await booking.queueRoster({ tenantId: t2.id, unitId: unit2.id });
  chk("XT-2", "รายการใครรับคิวของร้านอื่นว่าง", crossRoster.rows.length === 0, "0", String(crossRoster.rows.length));
  await prisma.bookingStaff.deleteMany({ where: { tenantId: t2.id } });
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
      ["hrAttendance", () => prisma.hrAttendance.deleteMany({ where: { tenantId: tid } })],
      ["hrLeave", () => prisma.hrLeave.deleteMany({ where: { tenantId: tid } })],
      ["hrWorkSchedule", () => prisma.hrWorkSchedule.deleteMany({ where: { tenantId: tid } })],
      ["hrEmployee", () => prisma.hrEmployee.deleteMany({ where: { tenantId: tid } })],
      ["customer", () => prisma.customer.deleteMany({ where: { tenantId: tid } })],
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
console.log("\n===== QC: ทะเบียนพนักงานแหล่งเดียว + ใครรับคิว =====");
console.log(`ผ่าน ${checks.length - failed.length}/${checks.length}`);
console.log(`FINDINGS: CRITICAL ${bySev("CRITICAL")} · MAJOR ${bySev("MAJOR")} · MINOR ${bySev("MINOR")}`);
console.log("\nJSON_SUMMARY " + JSON.stringify({ total: checks.length, passed: checks.length - failed.length, findings: failed.map((c) => ({ id: c.id, sev: c.sev })) }));
process.exit(bySev("CRITICAL") > 0 ? 1 : 0);
