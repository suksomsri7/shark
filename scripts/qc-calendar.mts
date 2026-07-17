// QC — Calendar รวม read-only v1 (WO-0057) · Fable oracle, Builder ห้ามแตะ
// ⚠️ standalone-typesafe: dynamic import + wide cast เท่านั้น
//
// สัญญา src/lib/modules/calendar/service.ts (ctx {tenantId} — READ-ONLY ห้ามเขียน DB ใด ๆ):
//   getCalendarEvents(ctx, { from: Date, to: Date }) → CalEvent[]
//     CalEvent: { id, kind: "APPOINTMENT"|"HOTEL_STAY"|"HR_LEAVE", title: string(ไทย มีชื่อคน),
//                 startAt: Date, endAt: Date, status: string, unitId?: string|null, systemId?: string|null }
//     · รวม 3 แหล่ง: Appointment (คิวจองบริการ) · HotelReservation (เข้าพัก: checkInDate→checkOutDate) · HrLeave (ลา: fromDate→toDate)
//     · เกณฑ์เข้า window: ช่วงเวลา overlap [from, to) — เริ่มก่อน from แต่ยังไม่จบ = เข้า
//     · ตัดทิ้ง: Appointment CANCELLED · HotelReservation CANCELLED · HrLeave REJECTED/CANCELLED (PENDING+APPROVED = แสดง พร้อม status จริง)
//     · เรียง startAt จากน้อยไปมาก · ระบบ/ตารางไม่เปิด = ข้ามเงียบ ๆ (ห้าม throw) · tenant ว่าง → []
//   UI: หน้า /app/calendar (read-only — เดือน+รายการ ไทยล้วน) + ลิงก์ใน NavDrawer
try { process.loadEnvFile(".env"); } catch {}
const { prisma } = await import("@/lib/core/db");
const sys = await import("@/lib/modules/system/service");
type Sev = "CRITICAL" | "MAJOR" | "MINOR";
const cks: { id: string; ok: boolean; exp: string; act: string; sev: Sev }[] = [];
const chk = (id: string, n: string, ok: boolean, e: string, a: string, s: Sev = "CRITICAL") => { cks.push({ id, ok, exp: e, act: a, sev: s }); console.log(`  ${ok ? "✅" : "❌"} [${id}] ${n}${ok ? "" : ` — exp ${e} | act ${a}`}`); };

let tid = ""; let tid2 = "";
try {
  const cal = (await import("@/lib/modules/calendar/service" as string).catch(() => null)) as { getCalendarEvents: (c: { tenantId: string; membership: any }, w: { from: Date; to: Date }) => Promise<any[]> } | null; // any จงใจ: oracle ล้ำหน้าโค้ด
  if (!cal) { chk("CAL-0", "มี calendar/service.ts", false, "มี", "ยังไม่สร้าง"); }
  else {
    const OWNER = { role: "OWNER", unitAccess: ["*"], permissions: {} }; // ปฏิทินเห็นทุกสาขา (สัญญาใหม่: ต้องส่ง membership)
    const t = await prisma.tenant.create({ data: { name: "QC CAL", slug: `qc-cal-${Date.now()}` } }); tid = t.id;
    const t2 = await prisma.tenant.create({ data: { name: "QC CAL2", slug: `qc-cal2-${Date.now()}` } }); tid2 = t2.id;
    const unit = await prisma.businessUnit.create({ data: { tenantId: tid, type: "BOOKING", name: "สาขา QC", slug: `cal-${Date.now()}` } });
    const hrSys = await sys.createSystem(tid, "HR", "บุคคล");

    // seed: Appointment ×3 (ใน window / นอก window / cancelled)
    const bsvc = await prisma.bookingService.create({ data: { tenantId: tid, unitId: unit.id, name: "ตัดผม", durationMin: 60 } });
    const bstaff = await prisma.bookingStaff.create({ data: { tenantId: tid, unitId: unit.id, name: "ช่างเอ" } });
    const D = (s: string) => new Date(s);
    const apptBase = { tenantId: tid, unitId: unit.id, staffId: bstaff.id, serviceId: bsvc.id, customerName: "คุณสมชาย", customerPhone: "0812345678" };
    await prisma.appointment.create({ data: { ...apptBase, startAt: D("2026-08-05T10:00:00+07:00"), endAt: D("2026-08-05T11:00:00+07:00"), status: "CONFIRMED" } });
    await prisma.appointment.create({ data: { ...apptBase, startAt: D("2026-09-05T10:00:00+07:00"), endAt: D("2026-09-05T11:00:00+07:00"), status: "CONFIRMED" } });
    await prisma.appointment.create({ data: { ...apptBase, startAt: D("2026-08-06T10:00:00+07:00"), endAt: D("2026-08-06T11:00:00+07:00"), status: "CANCELLED" } });

    // seed: HotelReservation ×2 (คร่อมขอบ window เริ่มก่อน from / cancelled)
    const rt = await prisma.hotelRoomType.create({ data: { tenantId: tid, unitId: unit.id, name: "Deluxe QC" } });
    await prisma.hotelReservation.create({ data: { tenantId: tid, unitId: unit.id, code: "HR-QC-1", guestName: "คุณเกสต์", roomTypeId: rt.id, checkInDate: D("2026-07-30"), checkOutDate: D("2026-08-03"), nights: 4, status: "BOOKED" } });
    await prisma.hotelReservation.create({ data: { tenantId: tid, unitId: unit.id, code: "HR-QC-2", guestName: "คุณยกเลิก", roomTypeId: rt.id, checkInDate: D("2026-08-10"), checkOutDate: D("2026-08-12"), nights: 2, status: "CANCELLED" } });

    // seed: HrLeave ×3 (APPROVED / PENDING / REJECTED)
    const emp = await prisma.hrEmployee.create({ data: { tenantId: tid, systemId: hrSys.id, name: "พนักงานบี" } });
    const leaveBase = { tenantId: tid, systemId: hrSys.id, employeeId: emp.id };
    await prisma.hrLeave.create({ data: { ...leaveBase, fromDate: D("2026-08-07"), toDate: D("2026-08-08"), status: "APPROVED", type: "PERSONAL" } });
    await prisma.hrLeave.create({ data: { ...leaveBase, fromDate: D("2026-08-20"), toDate: D("2026-08-21"), status: "PENDING", type: "SICK" } });
    await prisma.hrLeave.create({ data: { ...leaveBase, fromDate: D("2026-08-25"), toDate: D("2026-08-26"), status: "REJECTED", type: "PERSONAL" } });

    const win = { from: D("2026-08-01T00:00:00+07:00"), to: D("2026-09-01T00:00:00+07:00") };
    const evs = (await cal.getCalendarEvents({ tenantId: tid, membership: OWNER }, win)) as { id: string; kind: string; title: string; startAt: Date; endAt: Date; status: string }[];

    chk("CAL-1.1", "จำนวนรวม 4 (นัด 1 + เข้าพัก 1 + ลา 2)", evs.length === 4, "4", `${evs.length}: ${evs.map((e) => e.kind).join(",")}`);
    const appt = evs.filter((e) => e.kind === "APPOINTMENT");
    chk("CAL-1.2", "นัดหมาย: เข้าเฉพาะใน window ไม่เอา CANCELLED/เดือนหน้า + title มีชื่อลูกค้า", appt.length === 1 && appt[0].title.includes("สมชาย"), "1 + ชื่อ", JSON.stringify(appt.map((e) => e.title)).slice(0, 60));
    const stay = evs.filter((e) => e.kind === "HOTEL_STAY");
    chk("CAL-2.1", "เข้าพักคร่อมขอบ window (เริ่มก่อน from) → ยังเข้า + ไม่เอา CANCELLED", stay.length === 1 && stay[0].title.includes("เกสต์"), "1", String(stay.length));
    const lv = evs.filter((e) => e.kind === "HR_LEAVE");
    chk("CAL-3.1", "ลา: APPROVED+PENDING เข้า (2) · REJECTED ไม่เข้า + status จริงติดมา", lv.length === 2 && lv.some((e) => e.status === "APPROVED") && lv.some((e) => e.status === "PENDING") && lv.every((e) => e.title.includes("พนักงานบี")), "2", JSON.stringify(lv.map((e) => e.status)));
    chk("CAL-4.1", "เรียง startAt น้อย→มาก", evs.every((e, i) => i === 0 || new Date(evs[i - 1].startAt).getTime() <= new Date(e.startAt).getTime()), "เรียง", "?");
    chk("CAL-4.2", "kind/startAt/endAt ครบทุก event", evs.every((e) => e.id && e.kind && e.startAt && e.endAt && typeof e.status === "string"), "ครบ", "?");

    // window แคบ: เฉพาะวันที่ 5 ส.ค. → เห็นแค่นัด
    const evs2 = (await cal.getCalendarEvents({ tenantId: tid, membership: OWNER }, { from: D("2026-08-05T00:00:00+07:00"), to: D("2026-08-06T00:00:00+07:00") })) as { kind: string }[];
    chk("CAL-5.1", "window แคบ 1 วัน → เห็นเฉพาะนัด (1)", evs2.length === 1 && evs2[0].kind === "APPOINTMENT", "1 APPOINTMENT", JSON.stringify(evs2.map((e) => e.kind)));

    chk("CAL-6.1", "tenant อื่น → [] (guard)", ((await cal.getCalendarEvents({ tenantId: tid2, membership: OWNER }, win)) as unknown[]).length === 0, "0", "?");
    chk("CAL-6.2", "read-only: ไม่มีแถวใหม่เกิดใน 3 ตารางแหล่ง", (await prisma.appointment.count({ where: { tenantId: tid } })) === 3 && (await prisma.hotelReservation.count({ where: { tenantId: tid } })) === 2 && (await prisma.hrLeave.count({ where: { tenantId: tid } })) === 3, "3/2/3", "?");
  }
} catch (e) { chk("CRASH", "จบ", false, "จบ", e instanceof Error ? e.message.slice(0, 160) : String(e)); }
finally {
  const d = async (f: () => Promise<unknown>) => { try { await f(); } catch {} };
  for (const id of [tid, tid2].filter(Boolean)) {
    for (const m of ["appointment", "bookingStaff", "bookingService", "hotelReservation", "hotelRoomType", "hrLeave", "hrEmployee", "appSystemUnit", "appSystem", "businessUnit"]) await d(() => (prisma as never as Record<string, { deleteMany: (a: unknown) => Promise<unknown> }>)[m].deleteMany({ where: { tenantId: id } }));
    await d(() => prisma.tenant.delete({ where: { id } }));
  }
  await prisma.$disconnect();
}
const f = cks.filter((c) => !c.ok);
console.log(`\n===== QC Calendar =====\nผ่าน ${cks.length - f.length}/${cks.length}`);
console.log(`FINDINGS: CRITICAL ${f.filter((c) => c.sev === "CRITICAL").length} · MAJOR ${f.filter((c) => c.sev === "MAJOR").length} · MINOR ${f.filter((c) => c.sev === "MINOR").length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed: cks.length - f.length, findings: f.map((c) => c.id) })}`);
process.exit(f.filter((c) => c.sev === "CRITICAL").length > 0 ? 1 : 0);
