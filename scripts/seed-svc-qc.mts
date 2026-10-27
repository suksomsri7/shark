// seed-svc-qc.mts — ร้านตัวอย่างของ RUN SVC (ใบ R0.2) บนฐาน qc-svc
//
// ใช้ (ผู้เรียกครอบล็อกคิวของ RUN เอง — seed ไม่ถือล็อก):
//   bash scripts/iso.sh bash scripts/qc-svc.sh <ตัวครอบล็อกของ RUN> pnpm exec tsx scripts/seed-svc-qc.mts
//   (บรรทัดข้างบนเป็นคำสั่งของผู้เรียก — ตัวไฟล์นี้ไม่เรียกล็อกใด ๆ)
//
// สร้างอะไร (สัญญาทั้งหมดอยู่ที่ `scripts/svc-qc-data.mts` · SQC — แก้ที่นั่นที่เดียว):
//   • ร้าน A `svcqc-tenant` 4 หน่วย: บาร์เบอร์ · ร้านนวด (BOOKING) · หอ (DORM) · โรงแรม (HOTEL)
//   • ระบบ INVENTORY + POS ผูก barber + massage · บริการ 12 ตัว = InvItem SERVICE (ต้นฉบับ) → BookingService (projection ผ่าน setServiceOffered)
//   • ช่าง/หมอนวด · เวลาร้าน · เวลาช่าง · อาคาร A/B · ประเภทห้อง · ห้องหอ 36 · ห้องโรงแรม 14 (B205 รายเดือน)
//   • ผู้ใช้ร้าน A 8 คน + ร้าน B (เจ้าของคนอื่น · slug หน่วยซ้ำโดยตั้งใจ) 1 คน
//
// กติกา:
//   🔴 รันซ้ำ = ไม่มีแถวเพิ่ม และ "ไม่มีการเขียนเลย" — ทุกแถวอ่านมาเทียบกับ SQC ก่อน ต่างเท่านั้นถึงเขียน (ไม่ upsert ทุกแถว)
//   🔴 ค่าเพี้ยน (ราคา/active/rentMode/role ฯลฯ) ⇒ รันแล้วกลับเป็นค่าตาม SQC
//   🔴 ไม่แตะแถวของร้านอื่น · ลบได้เฉพาะแถวเกินของร้าน SVC (where ผูก tenantId ร้าน SVC เสมอ) · ไม่ระบายคิว outbox
//   🔴 ลำดับลบ (ถ้าวันหน้าต้องลบห้อง): roomOccupancy ก่อน hotelRoom (FK RESTRICT — ledger/wo-notes/svc-r0.8-carry.md)
//   🔴 ไม่สร้าง RoomOccupancy / HotelReservation / Appointment (ธุรกรรม = ใบหลังเติม) · ไม่สร้างพนักงาน/กะ HR
import { loadSvcQcEnv } from "./svc-qc-env.mjs";
import { SQC, type SqcRoom, type SqcRoomType, type SqcService, type SqcStaff, type SqcUnit } from "./svc-qc-data.mjs";

// ด่านฐาน: ไม่ใช่ qc-svc (prod / QC ของ RUN อื่น / host อื่น / QC_ENV_FILE=.env) ⇒ exit 4 ก่อนแตะฐาน
loadSvcQcEnv("seed-svc-qc");

const { prisma } = await import("@/lib/core/db");
const sys = await import("@/lib/modules/system/service");
const inventory = await import("@/lib/modules/inventory/service");
const booking = await import("@/lib/modules/booking/service");

const t0 = Date.now();
const created: Record<string, number> = {};
const updated: Record<string, number> = {};
const removed: Record<string, number> = {};
const bump = (m: Record<string, number>, k: string, n = 1) => (m[k] = (m[k] ?? 0) + n);

/** เทียบค่าแบบเรียงคีย์ (JSON) — Decimal/Date ต้องแปลงก่อนส่งเข้ามา */
const canon = (v: unknown): string =>
  JSON.stringify(v, (_k, x: unknown) =>
    x && typeof x === "object" && !Array.isArray(x) ? Object.fromEntries(Object.entries(x as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b))) : x,
  );
/** คืนเฉพาะฟิลด์ที่ต่างจากที่ต้องการ (ว่าง = ไม่ต้องเขียน) */
function diff<W extends Record<string, unknown>>(cur: Record<string, unknown>, want: W): Partial<W> {
  const out: Partial<W> = {};
  for (const k of Object.keys(want) as (keyof W & string)[]) if (canon(cur[k]) !== canon(want[k])) out[k] = want[k];
  return out;
}
const has = (o: object) => Object.keys(o).length > 0;
const dec = (v: { toString(): string } | null | undefined): number | null => (v == null ? null : Number(v.toString()));

// ═══════════════ ร้าน · หน่วย · ระบบ ═══════════════
async function ensureTenant(t: { id: string; slug: string; name: string }) {
  const bySlug = await prisma.tenant.findUnique({ where: { slug: t.slug } });
  if (bySlug && bySlug.id !== t.id) throw new Error(`slug ${t.slug} ถูกร้านอื่นใช้อยู่ (id ${bySlug.id}) — ไม่แตะ หยุด`);
  const row = bySlug ?? (await prisma.tenant.findUnique({ where: { id: t.id } }));
  if (!row) {
    bump(created, "tenant");
    await prisma.tenant.create({ data: { id: t.id, slug: t.slug, name: t.name } });
    return;
  }
  const d = diff(row, { slug: t.slug, name: t.name, status: "ACTIVE" as const });
  if (has(d)) {
    bump(updated, "tenant");
    await prisma.tenant.update({ where: { id: t.id }, data: d });
  }
}

async function ensureUnit(tenantId: string, u: SqcUnit | { id: string; type: string; slug: string; name: string }) {
  const row = await prisma.businessUnit.findUnique({ where: { id: u.id } });
  if (row && row.tenantId !== tenantId) throw new Error(`หน่วย ${u.id} เป็นของร้านอื่น (${row.tenantId}) — หยุด`);
  if (!row) {
    const clash = await prisma.businessUnit.findFirst({ where: { tenantId, slug: u.slug } });
    if (clash) throw new Error(`slug ${u.slug} ในร้าน ${tenantId} ถูกหน่วย ${clash.id} ใช้อยู่ — หยุด`);
    bump(created, "businessUnit");
    await prisma.businessUnit.create({ data: { id: u.id, tenantId, type: u.type as SqcUnit["type"], slug: u.slug, name: u.name } });
    return;
  }
  const d = diff(row, { type: u.type as SqcUnit["type"], slug: u.slug, name: u.name, status: "ACTIVE" as const });
  if (has(d)) {
    bump(updated, "businessUnit");
    await prisma.businessUnit.update({ where: { id: u.id }, data: d });
  }
}

async function ensureSystem(tenantId: string, s: { id: string; type: "INVENTORY" | "POS"; name: string }) {
  const row = await prisma.appSystem.findUnique({ where: { id: s.id } });
  if (row && row.tenantId !== tenantId) throw new Error(`ระบบ ${s.id} เป็นของร้านอื่น — หยุด`);
  if (!row) {
    bump(created, "appSystem");
    // createSystem ของจริง = appSystem.create ล้วน — สร้างตรงเพื่อกำหนด id ตายตัว
    await prisma.appSystem.create({ data: { id: s.id, tenantId, type: s.type, name: s.name } });
    return;
  }
  const d = diff(row, { type: s.type, name: s.name, active: true });
  if (has(d)) {
    bump(updated, "appSystem");
    await prisma.appSystem.update({ where: { id: s.id }, data: d });
  }
}

async function ensureLink(tenantId: string, systemId: string, unitId: string, type: "INVENTORY" | "POS") {
  const link = await prisma.appSystemUnit.findUnique({ where: { tenantId_unitId_type: { tenantId, unitId, type } } });
  if (link?.systemId === systemId) return;
  bump(link ? updated : created, "appSystemUnit");
  await sys.linkUnit(tenantId, systemId, unitId); // ของจริง (ย้ายออกจากระบบเดิมของประเภทนั้นก่อน)
}

// ═══════════════ จองคิว: เวลาร้าน · ช่าง · เวลาช่าง · บริการ ═══════════════
async function ensureHours(tenantId: string, unitId: string, hours: typeof SQC.barber.hours) {
  for (const h of hours) {
    const row = await prisma.bookingHours.findUnique({ where: { unitId_weekday: { unitId, weekday: h.weekday } } });
    if (row && row.tenantId !== tenantId) throw new Error(`BookingHours ของหน่วย ${unitId} ผูกร้านอื่น — หยุด`);
    if (!row) {
      bump(created, "bookingHours");
      await prisma.bookingHours.create({ data: { id: `${unitId}-h${h.weekday}`, tenantId, unitId, ...h } });
      continue;
    }
    const d = diff(row, { openMin: h.openMin, closeMin: h.closeMin, closed: h.closed });
    if (has(d)) {
      bump(updated, "bookingHours");
      await prisma.bookingHours.update({ where: { id: row.id }, data: d });
    }
  }
}

async function ensureStaff(tenantId: string, unitId: string, list: readonly SqcStaff[]) {
  for (const s of list) {
    const row = await prisma.bookingStaff.findUnique({ where: { id: s.id } });
    if (row && row.tenantId !== tenantId) throw new Error(`ช่าง ${s.id} เป็นของร้านอื่น — หยุด`);
    if (!row) {
      bump(created, "bookingStaff");
      await prisma.bookingStaff.create({ data: { id: s.id, tenantId, unitId, name: s.name, sortOrder: s.sortOrder, active: true } });
    } else {
      // employeeId ไม่แตะ (ผูก HR ภายหลัง — ใบ B.1)
      const d = diff(row, { unitId, name: s.name, sortOrder: s.sortOrder, active: true });
      if (has(d)) {
        bump(updated, "bookingStaff");
        await prisma.bookingStaff.update({ where: { id: s.id }, data: d });
      }
    }
    if (!s.hours) continue;
    const wantIds: string[] = [];
    for (const weekday of s.hours.weekdays) {
      const id = `${s.id}-w${weekday}`;
      wantIds.push(id);
      const h = await prisma.bookingStaffHours.findUnique({ where: { id } });
      const want = { tenantId, unitId, staffId: s.id, weekday, startMin: s.hours.startMin, endMin: s.hours.endMin };
      if (!h) {
        bump(created, "bookingStaffHours");
        await prisma.bookingStaffHours.create({ data: { id, ...want } });
        continue;
      }
      const d = diff(h, want);
      if (has(d)) {
        bump(updated, "bookingStaffHours");
        await prisma.bookingStaffHours.update({ where: { id }, data: d });
      }
    }
    // แถวเวลาเกินของช่างคนนี้ (ร้าน SVC เท่านั้น) — ลบ ไม่งั้นช่องจองเพี้ยน
    const extra = await prisma.bookingStaffHours.deleteMany({ where: { tenantId, staffId: s.id, id: { notIn: wantIds } } });
    if (extra.count) bump(removed, "bookingStaffHours", extra.count);
  }
  // ช่างที่ไม่อยู่ในสัญญา (เช่น เพิ่มมือผ่านหน้าจอ) — ไม่ลบ (นัดอ้างถึง) · แจ้งเฉย ๆ
  const extraStaff = await prisma.bookingStaff.count({ where: { tenantId, unitId, id: { notIn: list.map((s) => s.id) } } });
  if (extraStaff) console.log(`⚠️ หน่วย ${unitId} มีช่างนอกสัญญา ${extraStaff} คน (ไม่ลบ — ตรวจเอง)`);
}

/** ต้นฉบับ InvItem (createItem ครั้งแรก · updateItem เมื่อเพี้ยน) → projection BookingService (setServiceOffered เมื่อเพี้ยน) */
async function ensureServices(tenantId: string, unitId: string, invSystemId: string, list: readonly SqcService[]) {
  const ctx = { tenantId, systemId: invSystemId };
  const bctx = { tenantId, unitId };
  for (const s of list) {
    let item = await prisma.invItem.findFirst({ where: { tenantId, systemId: invSystemId, sku: s.sku } });
    if (!item) {
      bump(created, "invItem");
      const r = await inventory.createItem(ctx, {
        sku: s.sku,
        name: s.name,
        kind: "SERVICE",
        unitLabel: "ครั้ง",
        priceSatang: s.priceSatang,
        durationMin: s.durationMin,
        bufferMin: s.bufferMin,
        depositSatang: s.depositSatang,
        bookable: true,
      });
      item = await prisma.invItem.findFirstOrThrow({ where: { id: r.id } });
    } else {
      if (item.archivedAt) throw new Error(`บริการ ${s.sku} ถูกเก็บถาวร — เปิดคืนที่หน้าสินค้า/บริการก่อน แล้วรันซ้ำ`);
      if (item.kind !== "SERVICE") throw new Error(`InvItem ${s.sku} ไม่ใช่ SERVICE — หยุด`);
      const d = diff(item, { name: s.name, priceSatang: s.priceSatang, durationMin: s.durationMin, bufferMin: s.bufferMin, depositSatang: s.depositSatang, bookable: true });
      if (has(d)) {
        bump(updated, "invItem");
        await inventory.updateItem(ctx, item.id, d);
      }
    }
    const proj = await prisma.bookingService.findFirst({ where: { tenantId, unitId, itemId: item.id } });
    const want = { name: s.name, priceSatang: s.priceSatang, durationMin: s.durationMin, bufferMin: s.bufferMin, depositSatang: s.depositSatang, bookable: true, active: true };
    if (!proj || has(diff(proj, want))) {
      bump(proj ? updated : created, "bookingService");
      const r = await booking.setServiceOffered(bctx, item.id, true);
      if (!r.ok) throw new Error(`เปิดรับจอง ${s.name} ไม่ได้: ${r.reason}`);
    }
  }
}

// ═══════════════ ห้อง: อาคาร · ประเภท · ห้อง ═══════════════
async function ensureBuilding(tenantId: string, unitId: string, b: { id: string; name: string; floors: number; sortOrder: number }) {
  const row = await prisma.roomBuilding.findUnique({ where: { id: b.id } });
  if (row && row.tenantId !== tenantId) throw new Error(`อาคาร ${b.id} เป็นของร้านอื่น — หยุด`);
  const want = { unitId, name: b.name, floors: b.floors, sortOrder: b.sortOrder };
  if (!row) {
    bump(created, "roomBuilding");
    await prisma.roomBuilding.create({ data: { id: b.id, tenantId, ...want } });
    return;
  }
  const d = diff(row, want);
  if (has(d)) {
    bump(updated, "roomBuilding");
    await prisma.roomBuilding.update({ where: { id: b.id }, data: d });
  }
}

async function ensureRoomType(tenantId: string, unitId: string, t: SqcRoomType) {
  const row = (await prisma.hotelRoomType.findUnique({ where: { id: t.id } })) ?? (await prisma.hotelRoomType.findUnique({ where: { unitId_name: { unitId, name: t.name } } }));
  if (row && row.tenantId !== tenantId) throw new Error(`ประเภทห้อง ${t.id} เป็นของร้านอื่น — หยุด`);
  const want = { unitId, name: t.name, rentMode: t.rentMode, baseRateSatang: t.baseRateSatang, monthlyRateSatang: t.monthlyRateSatang, active: true };
  if (!row) {
    bump(created, "hotelRoomType");
    await prisma.hotelRoomType.create({ data: { id: t.id, tenantId, ...want, areaSqm: t.areaSqm } });
    return row;
  }
  const d: Record<string, unknown> = diff(row, want);
  if (dec(row.areaSqm) !== t.areaSqm) d.areaSqm = t.areaSqm;
  if (has(d)) {
    bump(updated, "hotelRoomType");
    await prisma.hotelRoomType.update({ where: { id: row.id }, data: d });
  }
  return row;
}

async function ensureRooms(tenantId: string, unitId: string, buildingId: string | null, rooms: readonly SqcRoom[], typeIdMap: Map<string, string>) {
  for (const r of rooms) {
    const roomTypeId = typeIdMap.get(r.typeId) ?? r.typeId;
    const want = { roomTypeId, buildingId, floorNo: r.floorNo, floor: String(r.floorNo), rentMode: r.rentMode, active: true };
    const row = await prisma.hotelRoom.findUnique({ where: { unitId_number: { unitId, number: r.number } } });
    if (row && row.tenantId !== tenantId) throw new Error(`ห้อง ${r.number} ของหน่วย ${unitId} ผูกร้านอื่น — หยุด`);
    if (!row) {
      bump(created, "hotelRoom");
      await prisma.hotelRoom.create({ data: { id: `${unitId}-r${r.number}`, tenantId, unitId, number: r.number, ...want } });
      continue;
    }
    const d = diff(row, want);
    if (has(d)) {
      bump(updated, "hotelRoom");
      await prisma.hotelRoom.update({ where: { id: row.id }, data: d });
    }
  }
  const extra = await prisma.hotelRoom.count({ where: { tenantId, unitId, number: { notIn: rooms.map((r) => r.number) } } });
  if (extra) console.log(`⚠️ หน่วย ${unitId} มีห้องนอกสัญญา ${extra} ห้อง (ไม่ลบ — ลบต้องลบ roomOccupancy ก่อน hotelRoom)`);
}

/** ประเภท (id ตายตัว — ถ้าเจอชื่อเดิมที่ id อื่น ใช้ id นั้น) แล้วห้อง */
async function ensureRoomUnit(tenantId: string, unitId: string, building: { id: string; name: string; floors: number; sortOrder: number } | null, types: readonly SqcRoomType[], rooms: readonly SqcRoom[]) {
  if (building) await ensureBuilding(tenantId, unitId, building);
  const map = new Map<string, string>();
  for (const t of types) {
    const row = await ensureRoomType(tenantId, unitId, t);
    map.set(t.id, row?.id ?? t.id);
  }
  await ensureRooms(tenantId, unitId, building?.id ?? null, rooms, map);
}

// ═══════════════ ผู้ใช้ ═══════════════
async function ensureUser(tenantId: string, u: { userId: string; membershipId: string; email: string; name: string; role: "OWNER" | "MANAGER" | "STAFF"; unitAccess: readonly string[]; permissions: Record<string, boolean> }) {
  const byEmail = await prisma.user.findUnique({ where: { email: u.email } });
  if (byEmail && byEmail.id !== u.userId) throw new Error(`อีเมล ${u.email} เป็นของผู้ใช้อื่น (id ${byEmail.id}) — ไม่แตะ หยุด`);
  if (!byEmail) {
    bump(created, "user");
    await prisma.user.create({ data: { id: u.userId, email: u.email, name: u.name } });
  } else if (byEmail.name !== u.name) {
    bump(updated, "user");
    await prisma.user.update({ where: { id: u.userId }, data: { name: u.name } });
  }
  const acceptedAt = new Date(SQC.acceptedAt);
  const unitAccess: string[] = [...u.unitAccess];
  const permissions: Record<string, boolean> = { ...u.permissions };
  const m = await prisma.membership.findUnique({ where: { userId_tenantId: { userId: u.userId, tenantId } } });
  if (!m) {
    bump(created, "membership");
    await prisma.membership.create({ data: { id: u.membershipId, userId: u.userId, tenantId, role: u.role, unitAccess, permissions, invitedAt: acceptedAt, acceptedAt } });
  } else {
    const d: Record<string, unknown> = diff(m, { role: u.role, unitAccess, permissions });
    if (!m.acceptedAt) d.acceptedAt = acceptedAt;
    if (has(d)) {
      bump(updated, "membership");
      await prisma.membership.update({ where: { id: m.id }, data: d });
    }
  }
  // 1 membership ต่อคน — membership ของผู้ใช้ QC ในร้านอื่น = ผิดสัญญา (ไม่ลบแถวร้านอื่น · หยุดให้คนตรวจ)
  const stray = await prisma.membership.count({ where: { userId: u.userId, tenantId: { not: tenantId } } });
  if (stray) throw new Error(`ผู้ใช้ ${u.email} มี membership ในร้านอื่น ${stray} แถว — ผิดสัญญา SQC หยุด`);
}

// ═══════════════════════════ ลงมือ ═══════════════════════════
const T = SQC.tenant.id;
const U = SQC.units;

// 1. ร้าน A
await ensureTenant(SQC.tenant);
for (const u of Object.values(U)) await ensureUnit(T, u);
for (const s of Object.values(SQC.systems)) {
  await ensureSystem(T, s);
  for (const k of SQC.systemUnits) await ensureLink(T, s.id, U[k].id, s.type);
}

// 2. บาร์เบอร์
await ensureHours(T, U.barber.id, SQC.barber.hours);
await ensureStaff(T, U.barber.id, SQC.barber.staff);
await ensureServices(T, U.barber.id, SQC.systems.INVENTORY.id, SQC.barber.services);

// 3. ร้านนวด
await ensureStaff(T, U.massage.id, SQC.massage.staff);
await ensureServices(T, U.massage.id, SQC.systems.INVENTORY.id, SQC.massage.services);

// 4. หอ · โรงแรม
await ensureRoomUnit(T, U.dorm.id, SQC.dorm.building, Object.values(SQC.dorm.types), SQC.dorm.rooms);
await ensureRoomUnit(T, U.hotel.id, SQC.hotel.building, Object.values(SQC.hotel.types), SQC.hotel.rooms);

// 5. ผู้ใช้ร้าน A
for (const u of SQC.users) await ensureUser(T, u);

// 6. ร้าน B (เจ้าของคนอื่น — ตรวจข้ามร้าน)
const O = SQC.other;
await ensureTenant(O.tenant);
await ensureUnit(O.tenant.id, O.units.barber);
await ensureUnit(O.tenant.id, O.units.hotel);
await ensureStaff(O.tenant.id, O.units.barber.id, [O.staff]);
{
  const s = O.service;
  const row = await prisma.bookingService.findUnique({ where: { id: s.id } });
  if (row && row.tenantId !== O.tenant.id) throw new Error(`บริการ ${s.id} เป็นของร้านอื่น — หยุด`);
  const want = { unitId: O.units.barber.id, name: s.name, durationMin: s.durationMin, priceSatang: s.priceSatang, depositSatang: s.depositSatang, bufferMin: s.bufferMin, active: true, bookable: true };
  if (!row) {
    bump(created, "bookingService");
    await prisma.bookingService.create({ data: { id: s.id, tenantId: O.tenant.id, ...want } }); // legacy (itemId null)
  } else {
    const d = diff(row, want);
    if (has(d)) {
      bump(updated, "bookingService");
      await prisma.bookingService.update({ where: { id: s.id }, data: d });
    }
  }
}
await ensureRoomUnit(O.tenant.id, O.units.hotel.id, null, [O.roomType], [O.room]);
await ensureUser(O.tenant.id, O.owner);

// ═══════════════ สรุป (ต้องเหมือนเดิมทุกตัวอักษรเมื่อรันซ้ำ — ไม่มีเวลา/จำนวนที่เพิ่งสร้าง) ═══════════════
async function countsOf(tenantId: string) {
  const w = { tenantId };
  return {
    units: await prisma.businessUnit.count({ where: w }),
    systems: await prisma.appSystem.count({ where: w }),
    systemUnitLinks: await prisma.appSystemUnit.count({ where: w }),
    memberships: await prisma.membership.count({ where: w }),
    invServices: await prisma.invItem.count({ where: { ...w, kind: "SERVICE" } }),
    bookingServices: await prisma.bookingService.count({ where: w }),
    bookingStaff: await prisma.bookingStaff.count({ where: w }),
    bookingStaffHours: await prisma.bookingStaffHours.count({ where: w }),
    bookingHours: await prisma.bookingHours.count({ where: w }),
    buildings: await prisma.roomBuilding.count({ where: w }),
    roomTypes: await prisma.hotelRoomType.count({ where: w }),
    rooms: await prisma.hotelRoom.count({ where: w }),
  };
}
const summary = {
  A: await countsOf(T),
  B: await countsOf(O.tenant.id),
  users: await prisma.user.count({ where: { email: { in: [...SQC.emails] } } }),
};
const wrote = has(created) || has(updated) || has(removed);
console.log(`ร้าน A: ${JSON.stringify(summary.A)}`);
console.log(`ร้าน B: ${JSON.stringify(summary.B)} · ผู้ใช้ SVC ${summary.users}`);
console.log(
  wrote
    ? `เขียนรอบนี้: สร้าง ${JSON.stringify(created)} · แก้ ${JSON.stringify(updated)} · ลบ ${JSON.stringify(removed)} · ${Math.round((Date.now() - t0) / 1000)} วิ`
    : `ไม่มีการเขียน (ตรงสัญญาแล้ว) · ${Math.round((Date.now() - t0) / 1000)} วิ`,
);
console.log(`SEED_SUMMARY ${JSON.stringify(summary)}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ suite: "seed-svc-qc", ok: true, created, updated, removed })}`);
await prisma.$disconnect();
