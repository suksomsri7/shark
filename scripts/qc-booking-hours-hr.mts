// QC — ระบบจอง: เวลาทำการร้าน (B) + เชื่อมพนักงาน HR (A) · Fable oracle
// สัญญา src/lib/modules/booking/service.ts:
//   getUnitHours(tenantId, unitId) → 7 แถว [{weekday 0-6, openMin, closeMin, closed}] (ไม่มีใน DB = ค่าเริ่มต้น 600-1200 เปิด)
//   setUnitHours(tenantId, unitId, rows[]) → upsert รายวัน (unique unitId+weekday)
//   getAvailableSlots(...) → ใช้ "เวลาร้าน" (getUnitHours) เป็นกรอบ · วันปิด/นอกเวลา = ไม่มีช่อง
//   listLinkableEmployees(tenantId) → พนักงานจากระบบ HR ที่เปิดอยู่ (active) · ไม่เปิด HR = []
//   createStaff({tenantId, unitId, name?, employeeId?}) → ถ้ามี employeeId ดึงชื่อจาก HrEmployee + set employeeId · ไม่มี = ใช้ name เอง
try { process.loadEnvFile(".env"); } catch {}
const { prisma } = await import("@/lib/core/db");
const { existsSync, readFileSync } = await import("node:fs");
const svc = (await import("@/lib/modules/booking/service" as string)) as any;
const slots = (await import("@/lib/modules/booking/slots" as string)) as any;
type Sev = "CRITICAL" | "MAJOR" | "MINOR";
const cks: { id: string; ok: boolean; sev: Sev }[] = [];
const chk = (id: string, n: string, ok: boolean, s: Sev = "CRITICAL") => { cks.push({ id, ok, sev: s }); console.log(`  ${ok ? "✅" : "❌"} [${id}] ${n}`); };
let tid = "";
try {
  const t = await prisma.tenant.create({ data: { name: "QC Booking", slug: `qc-bk-${Date.now()}` } });
  tid = t.id;
  const unit = await prisma.businessUnit.create({ data: { tenantId: tid, type: "BOOKING", name: "สาขาทดสอบ", slug: `u-${Date.now()}` } });
  const hrSys = await prisma.appSystem.create({ data: { tenantId: tid, type: "HR", name: "พนักงาน" } });
  const emp = await prisma.hrEmployee.create({ data: { tenantId: tid, systemId: hrSys.id, name: "ช่างเอ HR", position: "ช่างตัดผม" } });
  const service = await prisma.bookingService.create({ data: { tenantId: tid, unitId: unit.id, name: "ตัดผม", durationMin: 60, priceSatang: 0 } });

  // ── B: เวลาทำการ ──
  const def = await svc.getUnitHours(tid, unit.id);
  chk("BH-0.1", "getUnitHours คืน 7 แถว (weekday 0-6) ค่าเริ่มต้นเปิด", Array.isArray(def) && def.length === 7 && def.every((r: any) => !r.closed));

  const dateStr = "2031-01-10"; // อนาคต (กัน filter อดีต)
  const wd = slots.localWeekday(dateStr);
  // ตั้งวันนั้นเปิด 09:00-10:00, อีกวันปิด
  const rows = Array.from({ length: 7 }, (_, w) => ({ weekday: w, openMin: 540, closeMin: 600, closed: w !== wd }));
  await svc.setUnitHours(tid, unit.id, rows);
  const saved = await svc.getUnitHours(tid, unit.id);
  const savedWd = saved.find((r: any) => r.weekday === wd);
  chk("BH-1.1", "setUnitHours+getUnitHours: บันทึกเวลา/วันปิดถูกต้อง", !!savedWd && savedWd.openMin === 540 && savedWd.closeMin === 600 && savedWd.closed === false && saved.filter((r: any) => r.closed).length === 6);

  const open = await svc.getAvailableSlots(tid, unit.id, service.id, null, dateStr);
  chk("BH-2.1", "getAvailableSlots: วันเปิด 09:00-10:00 บริการ 60 นาที → 1 ช่อง (09:00) เมื่อมีช่าง", Array.isArray(open));

  // เพิ่มช่างแล้วเช็คช่องอีกครั้ง (ต้องมีช่างถึงจะมีช่อง)
  const st = await svc.createStaff({ tenantId: tid, unitId: unit.id, name: "ช่างบี" });
  chk("BH-2.2", "createStaff (พิมพ์เอง) → employeeId ว่าง + ชื่อตามที่กรอก", !!st?.id && (await prisma.bookingStaff.findUnique({ where: { id: st.id } }))?.name === "ช่างบี");
  const openWithStaff = await svc.getAvailableSlots(tid, unit.id, service.id, null, dateStr);
  chk("BH-2.3", "วันเปิด 09:00-10:00 + มีช่าง → ได้ 1 ช่อง (09:00)", openWithStaff.length === 1 && openWithStaff[0].hhmm === "09:00");

  // ปิดวันนั้น → ไม่มีช่อง
  await svc.setUnitHours(tid, unit.id, rows.map((r) => (r.weekday === wd ? { ...r, closed: true } : r)));
  const closed = await svc.getAvailableSlots(tid, unit.id, service.id, null, dateStr);
  chk("BH-3.1", "วันปิดร้าน → ไม่มีช่องจอง (0)", closed.length === 0);

  // ── A: เชื่อมพนักงาน HR ──
  const emps = await svc.listLinkableEmployees(tid);
  chk("HR-1.1", "listLinkableEmployees คืนพนักงานจากระบบ HR ที่เปิด", Array.isArray(emps) && emps.some((e: any) => e.id === emp.id && e.name === "ช่างเอ HR"));

  const linked = await svc.createStaff({ tenantId: tid, unitId: unit.id, employeeId: emp.id });
  const linkedRow = await prisma.bookingStaff.findUnique({ where: { id: linked.id } });
  chk("HR-2.1", "createStaff(employeeId) → set employeeId + ดึงชื่อจาก HR", !!linkedRow && linkedRow.employeeId === emp.id && linkedRow.name === "ช่างเอ HR");

  let threw = false;
  try { await svc.createStaff({ tenantId: tid, unitId: unit.id, employeeId: "not-real" }); } catch { threw = true; }
  chk("HR-2.2", "createStaff(employeeId ผิด) → throw ไทย", threw);

  const emptyTenant = await prisma.tenant.create({ data: { name: "QC no HR", slug: `qc-nohr-${Date.now()}` } });
  chk("HR-1.2", "ร้านไม่เปิด HR → listLinkableEmployees = []", (await svc.listLinkableEmployees(emptyTenant.id)).length === 0);
  await prisma.tenant.delete({ where: { id: emptyTenant.id } });

  // ── source: UI/nav ──
  const staffPage = "src/app/app/u/[unitSlug]/booking/staff/page.tsx";
  chk("UI-1.1", "หน้าพนักงานอ้าง listLinkableEmployees + employeeId", existsSync(staffPage) && /listLinkableEmployees/.test(readFileSync(staffPage, "utf8")) && /employeeId/.test(readFileSync(staffPage, "utf8")), "MAJOR");
  chk("UI-2.1", "มีหน้า booking/hours (เวลาทำการ)", existsSync("src/app/app/u/[unitSlug]/booking/hours/page.tsx"), "MAJOR");
  const layout = "src/app/app/u/[unitSlug]/booking/layout.tsx";
  chk("UI-2.2", "แท็บ booking มี 'เวลาทำการ'", existsSync(layout) && /เวลาทำการ/.test(readFileSync(layout, "utf8")), "MAJOR");
} catch (e) { chk("CRASH", "จบ: " + (e instanceof Error ? e.message.slice(0, 150) : String(e)), false); }
finally {
  if (tid) {
    const d = async (f: () => Promise<unknown>) => { try { await f(); } catch {} };
    await d(() => prisma.appointment.deleteMany({ where: { tenantId: tid } }));
    await d(() => prisma.bookingStaffHours.deleteMany({ where: { tenantId: tid } }));
    await d(() => prisma.bookingHours.deleteMany({ where: { tenantId: tid } }));
    await d(() => prisma.bookingStaff.deleteMany({ where: { tenantId: tid } }));
    await d(() => prisma.bookingService.deleteMany({ where: { tenantId: tid } }));
    await d(() => prisma.hrEmployee.deleteMany({ where: { tenantId: tid } }));
    await d(() => prisma.appSystem.deleteMany({ where: { tenantId: tid } }));
    await d(() => prisma.businessUnit.deleteMany({ where: { tenantId: tid } }));
    await d(() => prisma.tenant.delete({ where: { id: tid } }));
  }
  await prisma.$disconnect();
}
const f = cks.filter((c) => !c.ok);
console.log(`\n===== QC Booking Hours+HR =====\nผ่าน ${cks.length - f.length}/${cks.length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed: cks.length - f.length, findings: f.map((c) => c.id) })}`);
process.exit(f.filter((c) => c.sev === "CRITICAL").length > 0 ? 1 : 0);
