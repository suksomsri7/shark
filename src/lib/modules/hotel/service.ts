import { prisma, tenantDb } from "@/lib/core/db";
import { registerScopes } from "@/lib/core/scope";
import * as pos from "@/lib/modules/pos/service";
import type { HotelReservationStatus, HotelRoomStatus, SystemType } from "@prisma/client";

// ลงทะเบียน scope ของ Hotel models (unit-scoped) — ให้ tenantDb() inject tenantId+unitId อัตโนมัติ
// (ตามกลไก modules ใน src/lib/core/scope.ts — idempotent-safe ถ้า core ประกาศซ้ำด้วย scope เดียวกัน)
registerScopes({
  HotelRoomType: "unit",
  HotelRoom: "unit",
  HotelReservation: "unit",
});

// ───────────────────────── date helpers ─────────────────────────
// วัน check-in/out เก็บเป็น @db.Date (เที่ยงคืน UTC) — ใช้ string "YYYY-MM-DD" ใน UI
export function parseDate(dateStr: string): Date {
  return new Date(`${dateStr}T00:00:00.000Z`);
}
export function dateToStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}
export function nightsBetween(fromStr: string, toStr: string): number {
  const ms = parseDate(toStr).getTime() - parseDate(fromStr).getTime();
  return Math.round(ms / 86_400_000);
}
export function todayBkk(): string {
  // เที่ยงคืนตามเวลาไทย = business date ปัจจุบัน
  return new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
}
export function addDaysStr(dateStr: string, days: number): string {
  return dateToStr(new Date(parseDate(dateStr).getTime() + days * 86_400_000));
}

const ACTIVE_STATUSES: HotelReservationStatus[] = ["BOOKED", "CHECKED_IN"];

// หาว่าหน่วยนี้ผูกระบบชนิดใดไว้ (POS/POINT) → คืน systemId หรือ null ถ้าไม่ผูก
// query ตรงจากทะเบียนระบบ (appSystemUnit เป็น model ระดับ tenant ไม่ผูก unit-scope)
// — เลี่ยง cross-module import hotel→system (ขอบเขตโมดูล F2) โดยยังคง contract เดิม
async function systemIdFor(
  tenantId: string,
  unitId: string,
  type: SystemType,
): Promise<string | null> {
  const link = await prisma.appSystemUnit.findUnique({
    where: { tenantId_unitId_type: { tenantId, unitId, type } },
  });
  return link?.systemId ?? null;
}

// ───────────────────────── Room types ─────────────────────────
export async function listRoomTypes(tenantId: string, unitId: string) {
  const db = tenantDb({ tenantId, unitId });
  return db.hotelRoomType.findMany({
    where: { active: true },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    include: { _count: { select: { rooms: { where: { active: true } } } } },
  });
}

export async function createRoomType(input: {
  tenantId: string;
  unitId: string;
  name: string;
  code?: string;
  capacity: number;
  baseRateSatang: number;
  description?: string;
}) {
  const ctx = { tenantId: input.tenantId, unitId: input.unitId };
  const db = tenantDb(ctx);
  return db.hotelRoomType.create({
    data: {
      ...ctx,
      name: input.name,
      code: input.code || null,
      capacity: input.capacity,
      baseRateSatang: input.baseRateSatang,
      description: input.description || null,
    },
  });
}

export async function updateRoomType(
  tenantId: string,
  unitId: string,
  id: string,
  data: { name?: string; code?: string | null; capacity?: number; baseRateSatang?: number },
) {
  const db = tenantDb({ tenantId, unitId });
  return db.hotelRoomType.update({ where: { id }, data });
}

export async function archiveRoomType(tenantId: string, unitId: string, id: string) {
  const db = tenantDb({ tenantId, unitId });
  // กันลบถ้ามีการจองอนาคตค้าง (BOOKED/CHECKED_IN)
  const active = await db.hotelReservation.count({
    where: { roomTypeId: id, status: { in: ACTIVE_STATUSES } },
  });
  if (active > 0) return { ok: false as const, reason: "มีการจองค้างอยู่ ยังลบประเภทห้องนี้ไม่ได้" };
  await db.hotelRoomType.update({ where: { id }, data: { active: false } });
  return { ok: true as const };
}

// ───────────────────────── Rooms ─────────────────────────
export async function listRooms(tenantId: string, unitId: string) {
  const db = tenantDb({ tenantId, unitId });
  return db.hotelRoom.findMany({
    where: { active: true },
    orderBy: [{ number: "asc" }],
    include: { roomType: true },
  });
}

export async function createRoom(input: {
  tenantId: string;
  unitId: string;
  roomTypeId: string;
  number: string;
  floor?: string;
}) {
  const ctx = { tenantId: input.tenantId, unitId: input.unitId };
  const db = tenantDb(ctx);
  const rt = await db.hotelRoomType.findFirst({ where: { id: input.roomTypeId, active: true } });
  if (!rt) return { ok: false as const, reason: "ไม่พบประเภทห้อง" };
  const dup = await db.hotelRoom.findFirst({ where: { number: input.number, active: true } });
  if (dup) return { ok: false as const, reason: `ห้องเลข ${input.number} มีอยู่แล้ว` };
  const room = await db.hotelRoom.create({
    data: { ...ctx, roomTypeId: input.roomTypeId, number: input.number, floor: input.floor || null },
  });
  return { ok: true as const, id: room.id };
}

export async function setRoomStatus(
  tenantId: string,
  unitId: string,
  id: string,
  status: HotelRoomStatus,
) {
  const db = tenantDb({ tenantId, unitId });
  await db.hotelRoom.update({ where: { id }, data: { status } });
}

export async function archiveRoom(tenantId: string, unitId: string, id: string) {
  const db = tenantDb({ tenantId, unitId });
  const active = await db.hotelReservation.count({
    where: { roomId: id, status: { in: ACTIVE_STATUSES } },
  });
  if (active > 0) return { ok: false as const, reason: "มีการจองผูกห้องนี้อยู่ ยังลบไม่ได้" };
  await db.hotelRoom.update({ where: { id }, data: { active: false } });
  return { ok: true as const };
}

// ───────────────────────── Availability ─────────────────────────
// จำนวนห้องว่างต่อประเภท ต่อคืน ในช่วง [fromStr, toStr) — คืนสุดท้าย = toStr-1
export type DayAvail = { date: string; total: number; booked: number; free: number };
export type RoomTypeAvail = { roomTypeId: string; name: string; days: DayAvail[] };

export async function availability(
  tenantId: string,
  unitId: string,
  fromStr: string,
  toStr: string,
): Promise<RoomTypeAvail[]> {
  const db = tenantDb({ tenantId, unitId });
  const from = parseDate(fromStr);
  const to = parseDate(toStr);
  const [types, rooms, reservations] = await Promise.all([
    db.hotelRoomType.findMany({
      where: { active: true },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    }),
    db.hotelRoom.findMany({
      where: { active: true, status: { not: "OOO" } },
      select: { roomTypeId: true },
    }),
    db.hotelReservation.findMany({
      where: {
        status: { in: ACTIVE_STATUSES },
        checkInDate: { lt: to },
        checkOutDate: { gt: from },
      },
      select: { roomTypeId: true, checkInDate: true, checkOutDate: true },
    }),
  ]);

  const roomsByType = new Map<string, number>();
  for (const r of rooms) roomsByType.set(r.roomTypeId, (roomsByType.get(r.roomTypeId) ?? 0) + 1);

  const nights: string[] = [];
  for (let d = from.getTime(); d < to.getTime(); d += 86_400_000) nights.push(dateToStr(new Date(d)));

  return types.map((t) => {
    const total = roomsByType.get(t.id) ?? 0;
    const days = nights.map((date) => {
      const nightMs = parseDate(date).getTime();
      // การจองที่กินคืนนี้: checkIn <= date < checkOut
      const booked = reservations.filter(
        (rv) =>
          rv.roomTypeId === t.id &&
          rv.checkInDate.getTime() <= nightMs &&
          rv.checkOutDate.getTime() > nightMs,
      ).length;
      return { date, total, booked, free: Math.max(0, total - booked) };
    });
    return { roomTypeId: t.id, name: t.name, days };
  });
}

// ห้องว่างต่อประเภท สำหรับช่วงจองเดียว (ค่าน้อยสุดตลอดช่วง)
async function freeCountForRange(
  tx: typeof prisma,
  tenantId: string,
  unitId: string,
  roomTypeId: string,
  fromStr: string,
  toStr: string,
  excludeReservationId?: string,
): Promise<{ total: number; free: number }> {
  const total = await tx.hotelRoom.count({
    where: { tenantId, unitId, roomTypeId, active: true, status: { not: "OOO" } },
  });
  const overlapping = await tx.hotelReservation.findMany({
    where: {
      tenantId,
      unitId,
      roomTypeId,
      status: { in: ACTIVE_STATUSES },
      checkInDate: { lt: parseDate(toStr) },
      checkOutDate: { gt: parseDate(fromStr) },
      ...(excludeReservationId ? { id: { not: excludeReservationId } } : {}),
    },
    select: { checkInDate: true, checkOutDate: true },
  });
  // นับซ้อนสูงสุดต่อคืนในช่วง
  let maxBooked = 0;
  for (let d = parseDate(fromStr).getTime(); d < parseDate(toStr).getTime(); d += 86_400_000) {
    const booked = overlapping.filter(
      (rv) => rv.checkInDate.getTime() <= d && rv.checkOutDate.getTime() > d,
    ).length;
    if (booked > maxBooked) maxBooked = booked;
  }
  return { total, free: Math.max(0, total - maxBooked) };
}

// ───────────────────────── Reservations ─────────────────────────
async function nextCode(
  tx: typeof prisma,
  tenantId: string,
  unitId: string,
): Promise<string> {
  const yymm = todayBkk().slice(2, 7).replace("-", ""); // "2607"
  const n = await tx.hotelReservation.count({ where: { tenantId, unitId } });
  return `HR-${yymm}-${String(n + 1).padStart(4, "0")}`;
}

export async function createReservation(input: {
  tenantId: string;
  unitId: string;
  roomTypeId: string;
  checkInDate: string; // YYYY-MM-DD
  checkOutDate: string;
  guestName: string;
  guestPhone?: string;
  guestEmail?: string;
  adults?: number;
  children?: number;
  note?: string;
  createdById?: string;
}): Promise<{ ok: true; id: string; code: string } | { ok: false; reason: string }> {
  const { tenantId, unitId } = input;
  const nights = nightsBetween(input.checkInDate, input.checkOutDate);
  if (nights < 1) return { ok: false, reason: "วันเข้าพักต้องก่อนวันออกอย่างน้อย 1 คืน" };
  if (input.checkInDate < todayBkk()) return { ok: false, reason: "เลือกวันเข้าพักในอดีตไม่ได้" };

  const db = tenantDb({ tenantId, unitId });
  const rt = await db.hotelRoomType.findFirst({
    where: { id: input.roomTypeId, active: true },
  });
  if (!rt) return { ok: false, reason: "ไม่พบประเภทห้อง" };

  try {
    const created = await prisma.$transaction(async (tx) => {
      const { total, free } = await freeCountForRange(
        tx as typeof prisma,
        tenantId,
        unitId,
        input.roomTypeId,
        input.checkInDate,
        input.checkOutDate,
      );
      if (total === 0) throw new Error("NO_ROOMS");
      if (free < 1) throw new Error("FULL");

      const code = await nextCode(tx as typeof prisma, tenantId, unitId);
      const total_ = rt.baseRateSatang * nights;
      return tx.hotelReservation.create({
        data: {
          tenantId,
          unitId,
          code,
          status: "BOOKED",
          guestName: input.guestName,
          guestPhone: input.guestPhone || null,
          guestEmail: input.guestEmail || null,
          roomTypeId: input.roomTypeId,
          checkInDate: parseDate(input.checkInDate),
          checkOutDate: parseDate(input.checkOutDate),
          nights,
          adults: input.adults ?? 2,
          children: input.children ?? 0,
          ratePerNightSatang: rt.baseRateSatang,
          totalSatang: total_,
          note: input.note || null,
          createdById: input.createdById || null,
        },
      });
    });
    return { ok: true, id: created.id, code: created.code };
  } catch (e) {
    if (e instanceof Error && e.message === "FULL")
      return { ok: false, reason: "ประเภทห้องนี้เต็มในช่วงวันที่เลือก" };
    if (e instanceof Error && e.message === "NO_ROOMS")
      return { ok: false, reason: "ยังไม่มีห้องในประเภทนี้ — เพิ่มห้องก่อน" };
    throw e;
  }
}

// รายการห้องจริงที่ assign ให้ได้ ณ ช่วงนี้ (ประเภทตรง, active, ไม่ OOO, ไม่ชนการจองอื่น)
export async function assignableRooms(
  tenantId: string,
  unitId: string,
  reservationId: string,
) {
  const db = tenantDb({ tenantId, unitId });
  const rv = await db.hotelReservation.findFirst({ where: { id: reservationId } });
  if (!rv) return [];
  const rooms = await db.hotelRoom.findMany({
    where: { roomTypeId: rv.roomTypeId, active: true, status: { not: "OOO" } },
    orderBy: { number: "asc" },
  });
  const clashes = await db.hotelReservation.findMany({
    where: {
      status: { in: ACTIVE_STATUSES },
      id: { not: reservationId },
      roomId: { not: null },
      checkInDate: { lt: rv.checkOutDate },
      checkOutDate: { gt: rv.checkInDate },
    },
    select: { roomId: true },
  });
  const taken = new Set(clashes.map((c) => c.roomId));
  return rooms.filter((r) => !taken.has(r.id));
}

export async function checkIn(
  tenantId: string,
  unitId: string,
  reservationId: string,
  roomId: string,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  try {
    await prisma.$transaction(async (tx) => {
      const rv = await tx.hotelReservation.findFirst({
        where: { id: reservationId, tenantId, unitId },
      });
      if (!rv) throw new Error("NOT_FOUND");
      if (rv.status !== "BOOKED") throw new Error("BAD_STATUS");
      const room = await tx.hotelRoom.findFirst({
        where: { id: roomId, tenantId, unitId, active: true, roomTypeId: rv.roomTypeId },
      });
      if (!room) throw new Error("BAD_ROOM");
      if (room.status === "OOO") throw new Error("ROOM_OOO");
      // กันห้องจริงถูก assign ซ้อนช่วงเวลา
      const clash = await tx.hotelReservation.findFirst({
        where: {
          tenantId,
          unitId,
          roomId,
          id: { not: reservationId },
          status: { in: ACTIVE_STATUSES },
          checkInDate: { lt: rv.checkOutDate },
          checkOutDate: { gt: rv.checkInDate },
        },
      });
      if (clash) throw new Error("ROOM_TAKEN");
      await tx.hotelReservation.update({
        where: { id: reservationId },
        data: { status: "CHECKED_IN", roomId, checkedInAt: new Date() },
      });
      await tx.hotelRoom.update({ where: { id: roomId }, data: { status: "OCCUPIED" } });
    });
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    const map: Record<string, string> = {
      NOT_FOUND: "ไม่พบการจอง",
      BAD_STATUS: "การจองนี้เช็คอินไม่ได้ (สถานะไม่ถูกต้อง)",
      BAD_ROOM: "ห้องไม่ตรงประเภทหรือไม่พบห้อง",
      ROOM_OOO: "ห้องนี้ปิดใช้งานอยู่",
      ROOM_TAKEN: "ห้องนี้ถูกใช้ในช่วงเวลานี้แล้ว",
    };
    if (map[msg]) return { ok: false, reason: map[msg] };
    throw e;
  }
}

export async function checkOut(
  tenantId: string,
  unitId: string,
  reservationId: string,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  try {
    // ดึงค่าห้อง (totalSatang/nights/customerId) ออกจาก tx ไว้เก็บเงินหลัง commit —
    // createSale เปิด tx + drain outbox ของตัวเอง จึงต้องอยู่นอก tx นี้ (กัน nested tx)
    const billing = await prisma.$transaction(async (tx) => {
      const rv = await tx.hotelReservation.findFirst({
        where: { id: reservationId, tenantId, unitId },
      });
      if (!rv) throw new Error("NOT_FOUND");
      if (rv.status !== "CHECKED_IN") throw new Error("BAD_STATUS");
      await tx.hotelReservation.update({
        where: { id: reservationId },
        data: { status: "CHECKED_OUT", checkedOutAt: new Date() },
      });
      if (rv.roomId) {
        // ห้องต้องทำความสะอาดก่อนขายใหม่
        await tx.hotelRoom.update({ where: { id: rv.roomId }, data: { status: "CLEANING" } });
      }
      return { totalSatang: rv.totalSatang, nights: rv.nights, customerId: rv.customerId };
    });

    // เช็คเอาท์แล้ว → เก็บค่าห้องเข้าบัญชีผ่าน POS (idempotent ด้วย reservationId)
    // ไม่ผูก POS = ร้านแบบ standalone → เช็คเอาท์ได้ตามปกติ ข้ามการตัดเงิน
    if (billing.totalSatang > 0) {
      const [posSystemId, pointSystemId] = await Promise.all([
        systemIdFor(tenantId, unitId, "POS"),
        systemIdFor(tenantId, unitId, "POINT"),
      ]);
      if (posSystemId) {
        await pos.createSale({
          tenantId,
          unitId,
          systemId: posSystemId,
          pointSystemId: pointSystemId ?? undefined,
          memberId: billing.customerId ?? undefined,
          sourceModule: "HOTEL",
          sourceId: reservationId,
          idempotencyKey: `hotel-sale-${reservationId}`,
          lines: [
            { name: `ค่าห้อง ${billing.nights} คืน`, qty: 1, unitPriceSatang: billing.totalSatang },
          ],
          payMethods: [{ type: "CASH", amountSatang: billing.totalSatang }],
        });
      }
    }
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg === "NOT_FOUND") return { ok: false, reason: "ไม่พบการจอง" };
    if (msg === "BAD_STATUS") return { ok: false, reason: "ต้องเช็คอินก่อนจึงเช็คเอาท์ได้" };
    throw e;
  }
}

export async function cancelReservation(
  tenantId: string,
  unitId: string,
  reservationId: string,
  reason?: string,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  try {
    await prisma.$transaction(async (tx) => {
      const rv = await tx.hotelReservation.findFirst({
        where: { id: reservationId, tenantId, unitId },
      });
      if (!rv) throw new Error("NOT_FOUND");
      if (rv.status === "CHECKED_OUT" || rv.status === "CANCELLED") throw new Error("BAD_STATUS");
      await tx.hotelReservation.update({
        where: { id: reservationId },
        data: { status: "CANCELLED", cancelledAt: new Date(), cancelReason: reason || null },
      });
      // ถ้าเคยเช็คอินและถือห้องอยู่ → ปล่อยห้องเป็น CLEANING
      if (rv.status === "CHECKED_IN" && rv.roomId) {
        await tx.hotelRoom.update({ where: { id: rv.roomId }, data: { status: "CLEANING" } });
      }
    });
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg === "NOT_FOUND") return { ok: false, reason: "ไม่พบการจอง" };
    if (msg === "BAD_STATUS") return { ok: false, reason: "การจองนี้ยกเลิกไม่ได้" };
    throw e;
  }
}

// ───────────────────────── Dashboard ─────────────────────────
export async function dashboardData(tenantId: string, unitId: string) {
  const db = tenantDb({ tenantId, unitId });
  const today = todayBkk();
  const todayDate = parseDate(today);
  const tomorrow = parseDate(addDaysStr(today, 1));

  const [arrivals, departures, inHouse, upcoming, rooms] = await Promise.all([
    // ถึงวันนี้ (ยังไม่เช็คอิน)
    db.hotelReservation.findMany({
      where: { status: "BOOKED", checkInDate: { gte: todayDate, lt: tomorrow } },
      orderBy: { createdAt: "asc" },
      include: { roomType: true, room: true },
    }),
    // ออกวันนี้ (กำลังพักอยู่ และ checkout = วันนี้)
    db.hotelReservation.findMany({
      where: { status: "CHECKED_IN", checkOutDate: { gte: todayDate, lt: tomorrow } },
      orderBy: { createdAt: "asc" },
      include: { roomType: true, room: true },
    }),
    // พักอยู่ทั้งหมด
    db.hotelReservation.findMany({
      where: { status: "CHECKED_IN" },
      orderBy: { checkOutDate: "asc" },
      include: { roomType: true, room: true },
    }),
    // จองล่วงหน้า (หลังวันนี้)
    db.hotelReservation.findMany({
      where: { status: "BOOKED", checkInDate: { gte: tomorrow } },
      orderBy: { checkInDate: "asc" },
      take: 50,
      include: { roomType: true },
    }),
    db.hotelRoom.findMany({ where: { active: true }, select: { status: true } }),
  ]);

  const roomStatus = { AVAILABLE: 0, OCCUPIED: 0, CLEANING: 0, OOO: 0 } as Record<
    HotelRoomStatus,
    number
  >;
  for (const r of rooms) roomStatus[r.status]++;

  return { today, arrivals, departures, inHouse, upcoming, roomStatus, roomTotal: rooms.length };
}

export async function listReservations(tenantId: string, unitId: string) {
  const db = tenantDb({ tenantId, unitId });
  return db.hotelReservation.findMany({
    orderBy: { checkInDate: "desc" },
    take: 200,
    include: { roomType: true, room: true },
  });
}

export async function getReservation(tenantId: string, unitId: string, id: string) {
  const db = tenantDb({ tenantId, unitId });
  return db.hotelReservation.findFirst({
    where: { id },
    include: { roomType: true, room: true },
  });
}
