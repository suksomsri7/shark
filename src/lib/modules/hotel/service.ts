import { prisma, tenantDb } from "@/lib/core/db";
import { callerTx } from "@/lib/core/caller-tx"; // POS P5.1 ▸ MA2: ใบรับมัดจำในธุรกรรมของ moduleTakeDeposit ◂
import { registerScopes } from "@/lib/core/scope";
import * as pos from "@/lib/modules/pos/service";
import { emitOutbox } from "@/lib/core/outbox"; // CRM C2.9 ▸ เหตุการณ์ "เช็คเอาท์แล้ว" ใน tx เดียวกับสถานะ ◂
import { normalizePartyPhone, safeFindOrCreate } from "@/lib/modules/party";
import { systemForUnit } from "@/lib/modules/system/service";
import { promptpayPayload } from "@/lib/payment/promptpay";
import type { HotelReservationStatus, HotelRoomStatus, PosPayType, Prisma, SystemType } from "@prisma/client";
// SVC R0.8 ▸ แกนห้อง: การจองถือ "ห้องจริง" (RoomOccupancy) ใน tx เดียวกับการจอง — ผ่าน facade เท่านั้น (ห้ามล้วง subpath) ◂
import { affectedByOutOfOrder, releaseOccupancy } from "@/lib/modules/rooms"; // SVC H.4 ▸ claimRoom/moveOccupancy ย้ายไป checkin.ts ◂
export type { AffectedOccupancy } from "@/lib/modules/rooms";
import { resolvePublicUnit } from "@/lib/core/storefront";
// SVC H.3 ▸ จอง V2: createReservation/cancelReservation เดิมเรียกเส้นเดียวของ booking.ts · ห้องว่างสูตรเดียว (availability.ts) ◂
import { cancelBooking, createBooking } from "./booking";
import { hotelAvailability } from "./availability";
import { checkInV2Legacy } from "./checkin"; // SVC H.4 ▸ checkIn เดิมห่อเช็กอิน V2 ◂

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

// SVC H.3 ▸ การจองที่ยังกินห้อง: HOLD/CONFIRMED (V2) + BOOKED (แถวเก่าที่ backfill ค้าง) + CHECKED_IN ◂
const ACTIVE_STATUSES: HotelReservationStatus[] = ["BOOKED", "HOLD", "CONFIRMED", "CHECKED_IN"];

// ───────── SVC R0.8 ▸ ห้องที่ขายรายคืนได้ + การครองห้อง (RoomOccupancy) ─────────
// แหล่งความจริงสถานะกายภาพ = hkStatus (มติผู้คุม R0.8) · status เดิมคงไว้ให้หน้าจอ P1 (แมปสองทาง: setRoomStatus ↔ rooms.setHkStatus)
// ห้องขายรายคืนได้ = active · ไม่ OOO/OUT_OF_ORDER · rentMode จริง (ของห้อง ?? ของประเภท) ∈ NIGHTLY|BOTH (ห้อง MONTHLY ไม่ขายรายคืน)
// ห้องไม่ว่าง = มี occupancy active ซ้อนช่วง (hold หมดเวลานับว่าง) — ของใครก็ได้ (สัญญาหอ/การจองโรงแรม/กันห้อง)
// การจองเดิมก่อน R0.8 ที่ยังไม่มี occupancy (ก่อน backfill) ยังนับ "กินห้อง 1 ห้องของประเภท" เหมือนเดิม
const HOTEL_REF = "HotelReservation";
type Db = Prisma.TransactionClient;
// ธุรกรรมโรงแรม: เพดานเวลาชัด (รอคิว lock ประเภทห้อง/การชน EXCLUDE) · หมดเวลา (P2028) ⇒ ok:false "ระบบไม่ว่าง" ไม่ throw
const HOTEL_TX = { maxWait: 5_000, timeout: 15_000 } as const;
const BUSY_REASON = "ระบบไม่ว่าง ลองใหม่อีกครั้ง";
function isTxTimeout(e: unknown): boolean {
  let cur: unknown = e;
  for (let d = 0; d < 5 && cur && typeof cur === "object"; d++) {
    const o = cur as { code?: unknown; cause?: unknown };
    if (o.code === "P2028") return true;
    cur = o.cause;
  }
  return false;
}
const sellsNightly = (roomRentMode: string | null, typeRentMode: string) => {
  const m = roomRentMode ?? typeRentMode;
  return m === "NIGHTLY" || m === "BOTH";
};
const liveOcc = (o: { kind: string; holdExpiresAt: Date | null }, now: Date) =>
  !((o.kind === "HOLD" || o.kind === "CHANNEL_HOLD") && o.holdExpiresAt !== null && o.holdExpiresAt <= now);
const DAY_MS = 86_400_000;

async function sellableRooms(db: Db, tenantId: string, unitId: string, roomTypeId?: string) {
  const rooms = await db.hotelRoom.findMany({
    where: { tenantId, unitId, active: true, status: { not: "OOO" }, hkStatus: { not: "OUT_OF_ORDER" }, ...(roomTypeId ? { roomTypeId } : {}) },
    orderBy: { number: "asc" },
    select: { id: true, number: true, floor: true, roomTypeId: true, rentMode: true, roomType: { select: { rentMode: true } } },
  });
  return rooms.filter((r) => sellsNightly(r.rentMode, r.roomType.rentMode));
}

/**
 * ห้องขายรายคืนได้ของประเภทที่ว่างทั้งช่วง (ไม่มี occupancy ซ้อน · ไม่ถูกการจองเดิมที่ระบุห้องไว้ถือ)
 * bestFit = เรียงให้ห้องที่ช่องว่างก่อน/หลังช่วงนี้แคบที่สุดมาก่อน (อุดช่องว่าง เก็บช่วงยาวไว้ให้การจอง/สัญญายาว) · เท่ากัน = เลขห้อง
 */
async function freeRoomsForStay(db: Db, tenantId: string, unitId: string, roomTypeId: string, from: Date, to: Date, reservationId: string, bestFit = false) {
  const now = new Date();
  const rooms = await sellableRooms(db, tenantId, unitId, roomTypeId);
  if (rooms.length === 0) return [];
  const ids = rooms.map((r) => r.id);
  const WINDOW = 60 * DAY_MS;
  const wFrom = new Date(from.getTime() - (bestFit ? WINDOW : 0));
  const wTo = new Date(to.getTime() + (bestFit ? WINDOW : 0));
  // SVC H.3 ▸ ห้องจริงตัดสินจาก occupancy เท่านั้น (เลิกเส้นการจองเดิมที่ระบุห้องโดยไม่มี occupancy — backfill svc-h0 แล้ว) ◂
  const occ = await db.roomOccupancy.findMany({
    where: { tenantId, unitId, active: true, roomId: { in: ids }, startDate: { lt: wTo }, endDate: { gt: wFrom } },
    select: { roomId: true, kind: true, holdExpiresAt: true, refType: true, refId: true, startDate: true, endDate: true },
  });
  const spans = occ
    .filter((o) => liveOcc(o, now) && !(o.refType === HOTEL_REF && o.refId === reservationId))
    .map((o) => ({ roomId: o.roomId, s: o.startDate.getTime(), e: o.endDate.getTime() }));
  const f = from.getTime();
  const t = to.getTime();
  const free = rooms.filter((r) => !spans.some((x) => x.roomId === r.id && x.s < t && x.e > f));
  if (!bestFit) return free;
  const gap = (roomId: string) => {
    const mine = spans.filter((x) => x.roomId === roomId);
    const prevEnd = Math.max(f - WINDOW, ...mine.filter((x) => x.e <= f).map((x) => x.e));
    const nextStart = Math.min(t + WINDOW, ...mine.filter((x) => x.s >= t).map((x) => x.s));
    return f - prevEnd + (nextStart - t);
  };
  const score = new Map(free.map((r) => [r.id, gap(r.id)]));
  return [...free].sort((a, b) => (score.get(a.id) ?? 0) - (score.get(b.id) ?? 0) || a.number.localeCompare(b.number));
}

/** ปล่อย occupancy ที่ active ทั้งหมดของการจองนี้ (ใน tx ของผู้เรียก) */
async function releaseStay(tx: Db, tenantId: string, unitId: string, reservationId: string, reason: string) {
  const occ = await tx.roomOccupancy.findMany({ where: { tenantId, unitId, refType: HOTEL_REF, refId: reservationId, active: true }, select: { id: true } });
  for (const o of occ) await releaseOccupancy(tx, { tenantId, unitId, occupancyId: o.id, reason });
}

// ◂ SVC R0.8

// หาว่าหน่วยนี้ผูกระบบชนิดใดไว้ (POS/POINT) → คืน systemId หรือ null ถ้าไม่ผูก
// query ตรงจากทะเบียนระบบ (appSystemUnit เป็น model ระดับ tenant ไม่ผูก unit-scope)
// — เลี่ยง cross-module import hotel→system (ขอบเขตโมดูล F2) โดยยังคง contract เดิม
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
  depositSatang?: number;
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
      depositSatang: Math.max(0, Math.round(input.depositSatang ?? 0)),
      description: input.description || null,
    },
  });
}

export async function updateRoomType(
  tenantId: string,
  unitId: string,
  id: string,
  data: { name?: string; code?: string | null; capacity?: number; baseRateSatang?: number; depositSatang?: number },
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
  // SVC R0.8 ▸ แมปไป hkStatus (แหล่งความจริง): CLEANING→DIRTY · OOO→OUT_OF_ORDER · AVAILABLE→CLEAN · OCCUPIED ไม่แตะ hk ◂
  const hk: Record<HotelRoomStatus, string | null> = { CLEANING: "DIRTY", OOO: "OUT_OF_ORDER", AVAILABLE: "CLEAN", OCCUPIED: null };
  const hkStatus = hk[status];
  await db.hotelRoom.update({ where: { id }, data: { status, ...(hkStatus ? { hkStatus } : {}) } });
  // SVC R0.8 ▸ ปิดซ่อม (OOO) ⇒ คืน occupancy ที่ยังไม่จบซึ่งขัด (ทุกชนิดยกเว้น BLOCK · กติกาเดียวกับ rooms.setHkStatus) — เตือน ไม่บล็อก ◂
  return { ok: true as const, affected: status === "OOO" ? await affectedByOutOfOrder({ tenantId }, { unitId, roomId: id }) : [] };
}

export async function archiveRoom(tenantId: string, unitId: string, id: string) {
  const db = tenantDb({ tenantId, unitId });
  const active = await db.hotelReservation.count({
    where: { roomId: id, status: { in: ACTIVE_STATUSES } },
  });
  if (active > 0) return { ok: false as const, reason: "มีการจองผูกห้องนี้อยู่ ยังลบไม่ได้" };
  // SVC R0.8 ▸ ห้องที่ยังมีการครองห้อง (สัญญาหอ/การจอง/กันห้อง) ที่ยังไม่จบ ลบไม่ได้ ◂
  const held = await db.roomOccupancy.count({ where: { roomId: id, active: true, endDate: { gt: parseDate(todayBkk()) } } });
  if (held > 0) return { ok: false as const, reason: "ห้องนี้ยังถูกใช้งานอยู่ (มีสัญญาหรือการจองที่ยังไม่จบ) ยังลบไม่ได้" };
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
  // SVC H.3 ▸ สูตรเดียว (hotelAvailability · S §4.2): ห้องขายรายคืนได้ − BLOCK − LEASE − คืนที่นับ (HotelBookingNight.counted) ◂
  const [types, av] = await Promise.all([
    db.hotelRoomType.findMany({
      where: { active: true },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    }),
    hotelAvailability.get({ tenantId }, { unitId, from: fromStr, to: toStr }),
  ]);
  const nights: string[] = [];
  for (let d = parseDate(fromStr).getTime(); d < parseDate(toStr).getTime(); d += DAY_MS) nights.push(dateToStr(new Date(d)));
  return types.map((t) => {
    const days = nights.map((date) => {
      const cell = av.ok ? av.byDate[date]?.[t.id] : undefined;
      const total = cell?.total ?? 0;
      const free = cell?.available ?? 0;
      return { date, total, booked: Math.max(0, total - free), free };
    });
    return { roomTypeId: t.id, name: t.name, days };
  });
}

// ───────────────────────── Reservations ─────────────────────────
// SVC H.3 ▸ เส้น P1 (signature เดิม) → createBooking เส้นเดียว (nights + occupancy + snapshot ใน tx เดียว · CONFIRMED · ราคาแผน/ราคาฐานประเภท) ◂
const P1_ACTOR = { role: "OWNER", unitAccess: ["*"], permissions: {}, userId: "module:hotel" } as const;
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
  /** SVC H.3 ▸ แหล่งที่มา (storefront = WEB · ผู้ช่วย AI = PHONE · ไม่ส่ง = WALK_IN เดิม) — สถานะเส้นนี้ยัง CONFIRMED เสมอ ◂ */
  source?: "WEB" | "WALK_IN" | "PHONE" | "LINE" | "OTA";
}): Promise<{ ok: true; id: string; code: string; publicToken: string | null } | { ok: false; reason: string }> {
  const r = await createBooking(
    P1_ACTOR,
    { tenantId: input.tenantId },
    {
      unitId: input.unitId,
      rooms: [{ roomTypeId: input.roomTypeId, adults: input.adults ?? 2, children: input.children ?? 0 }],
      checkIn: input.checkInDate,
      checkOut: input.checkOutDate,
      source: input.source ?? "WALK_IN",
      guest: { name: input.guestName, phone: input.guestPhone || null, email: input.guestEmail || null },
      note: input.note || null,
    },
    { legacy: true, createdById: input.createdById || null },
  );
  if (!r.ok) return { ok: false, reason: r.reason };
  const first = r.reservations[0];
  return { ok: true, id: first.id, code: first.code, publicToken: r.publicToken };
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
  // SVC R0.8 ▸ ตัดห้องที่ถูกถือช่วงซ้อน (occupancy ของคนอื่น — ของการจองนี้เองไม่ตัด) · ห้องขายรายคืนไม่ได้/ปิดซ่อม ◂
  return freeRoomsForStay(prisma, tenantId, unitId, rv.roomTypeId, rv.checkInDate, rv.checkOutDate, reservationId);
}

export async function checkIn(
  tenantId: string,
  unitId: string,
  reservationId: string,
  roomId: string,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  // SVC H.4 ▸ ทางเดิมของ P1 ห่อเช็กอิน V2 (checkin.ts · ธุรกรรมเดียว · ลำดับล็อก ประเภท → แถว → occupancy · event hotel.checked_in)
  //   คง signature/รูปผลเดิม · ไม่มีผู้พักในทะเบียน + requireRegistration เปิด ⇒ ok:false เหตุผลไทย (GUEST_REQUIRED · มติ H.4 รอบ 2) ◂
  const r = await checkInV2Legacy(tenantId, unitId, reservationId, roomId);
  if (r.ok) return { ok: true };
  const map: Record<string, string> = {
    NOT_FOUND: "ไม่พบการจอง",
    NOT_CONFIRMED: "การจองนี้เช็คอินไม่ได้ (สถานะไม่ถูกต้อง)",
    INVALID_INPUT: "ห้องไม่ตรงประเภทหรือไม่พบห้อง",
    ROOM_INACTIVE: "ห้องนี้ปิดใช้งานอยู่",
    ROOM_TAKEN: "ห้องนี้ถูกใช้ในช่วงเวลานี้แล้ว",
    BUSY: BUSY_REASON,
  };
  return { ok: false, reason: map[r.code] ?? r.reason };
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
        // ห้องต้องทำความสะอาดก่อนขายใหม่ (SVC R0.8 ▸ hkStatus DIRTY = แหล่งความจริง · status CLEANING เดิมคงไว้ให้จอ P1 ◂)
        await tx.hotelRoom.update({ where: { id: rv.roomId }, data: { status: "CLEANING", hkStatus: "DIRTY" } });
      }
      // SVC R0.8 ▸ (ผู้ตรวจ R0.8 ข้อ 3) ยังไม่ปล่อยห้องจริงที่นี่ — ปล่อยใน tx เล็กหลังเก็บเงินสำเร็จ (หรือทางไม่ผูก POS)
      //   ⇒ ทาง rollback (POS ล้ม → CHECKED_IN) ไม่ต้องจองห้องคืน (occupancy ยัง active ตลอด · ห้องไม่หลุดให้คนอื่น) ◂
      // CRM C2.9 ▸ (มติ C11 · ใบ C2.9) "เช็คเอาท์แล้ว" ยิงใน tx เดียวกับการเปลี่ยนสถานะที่มีอยู่แล้วของฟังก์ชันนี้ ⇒
      //   เช็คเอาท์สำเร็จ = มี event เสมอ · event เขียนไม่ได้ = เช็คเอาท์ถูกยกเลิกทั้งก้อน (ยัง CHECKED_IN · ห้องไม่ถูกสั่งทำความสะอาด)
      //   `pos.createSale` ยังอยู่นอก tx นี้เหมือนเดิม · payload = id ล้วน + จำนวนคืน/ยอดสตางค์ (X8: ไม่มีชื่อ/เบอร์ผู้เข้าพัก)
      await emitOutbox(tx, {
        tenantId,
        unitId,
        type: "hotel.checked_out",
        idempotencyKey: `hotel.checked_out#${reservationId}`,
        payload: { reservationId, unitId, partyId: rv.partyId, nights: rv.nights, totalSatang: rv.totalSatang },
      });
      // ◂ CRM C2.9
      return { totalSatang: rv.totalSatang, nights: rv.nights, customerId: rv.customerId, depositSaleId: rv.depositSaleId, roomId: rv.roomId }; // POS P5.1 ▸ MA2 MA5: + ใบรับมัดจำ · ห้อง (คืน claim) ◂
    }, HOTEL_TX);
    // SVC R0.8 ▸ ปล่อยห้องจริงหลังเช็คเอาท์ "ลงตัว" (tx เล็ก · ปล่อยไม่ได้ = WARN ไม่ทำให้เช็คเอาท์ล้ม — id ล้วน ไม่มี PII) ◂
    const releaseAfterCheckout = async () => {
      try {
        await prisma.$transaction((tx) => releaseStay(tx, tenantId, unitId, reservationId, "เช็คเอาท์"), HOTEL_TX);
      } catch {
        console.warn(`[hotel] เช็คเอาท์ tenant=${tenantId} reservation=${reservationId}: ปล่อยการครองห้องไม่สำเร็จ — ให้พนักงานปล่อยเอง`);
      }
    };

    // เช็คเอาท์แล้ว → เก็บค่าห้องเข้าบัญชีผ่าน POS (idempotent ด้วย reservationId)
    // ไม่ผูก POS = ร้านแบบ standalone → เช็คเอาท์ได้ตามปกติ ข้ามการตัดเงิน
    if (billing.totalSatang > 0) {
      const [posSystemId, pointSystemId] = await Promise.all([
        systemForUnit(tenantId, unitId, "POS"),
        systemForUnit(tenantId, unitId, "POINT"),
      ]);
      if (posSystemId) {
        // POS P5.1 ▸ MA2 (F2): มัดจำที่รับเป็นใบรับ (POS_DEPOSIT) จ่ายเป็นแถว DEPOSIT อ้างใบรับ + ส่วนที่เหลือเงินสด ⇒ Σ รายได้ = ค่าห้อง · VAT ครั้งเดียว ·
        //   มัดจำแบบเดิม (ก่อน P5.1 · ไม่มี PosDeposit) = คิดเต็มเงินสดแบบเดิม ◂
        const dep = await (await import("@/lib/modules/pos/deposit")).moduleDepositForBill(tenantId, unitId, billing.depositSaleId, billing.totalSatang);
        try {
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
            payMethods: dep
              ? [{ type: "DEPOSIT", amountSatang: dep.satang, refSaleId: dep.refSaleId }, ...(billing.totalSatang > dep.satang ? [{ type: "CASH" as const, amountSatang: billing.totalSatang - dep.satang }] : [])]
              : [{ type: "CASH", amountSatang: billing.totalSatang }],
          });
        } catch (e) {
          // POS P5.1 ▸ MA5 (F5): createSale ล้ม (เช่น SHIFT_REQUIRED) และไม่มีบิลของคีย์นี้จริง ⇒ คืนเช็คเอาท์ (CHECKED_OUT → CHECKED_IN · ห้องกลับ OCCUPIED)
          //   แบบคลินิก/เช่า ให้ลองซ้ำได้ · event hotel.checked_out ที่ยิงแล้วคงอยู่ (คีย์เดิม · ลองซ้ำไม่ยิงซ้ำ) ◂
          if ((await pos.saleStatusByKey(tenantId, `hotel-sale-${reservationId}`)) === null) {
            await prisma.$transaction(async (tx) => {
              const back = await tx.hotelReservation.updateMany({ where: { id: reservationId, tenantId, unitId, status: "CHECKED_OUT" }, data: { status: "CHECKED_IN", checkedOutAt: null } });
              if (back.count > 0 && billing.roomId) await tx.hotelRoom.updateMany({ where: { id: billing.roomId, tenantId, unitId, status: "CLEANING" }, data: { status: "OCCUPIED" } });
              // SVC R0.8 ▸ occupancy ยังไม่ถูกปล่อย (ปล่อยหลังเก็บเงินสำเร็จเท่านั้น) ⇒ แขกกลับเป็น CHECKED_IN พร้อมห้องเดิม ไม่ต้องจองคืน ◂
            }, HOTEL_TX);
          } else {
            await releaseAfterCheckout(); // บิลของคีย์นี้มีแล้ว (ล้มหลังสร้างบิล) ⇒ เช็คเอาท์ลงตัว
          }
          throw e;
        }
      }
    }
    await releaseAfterCheckout();
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg === "NOT_FOUND") return { ok: false, reason: "ไม่พบการจอง" };
    if (msg === "BAD_STATUS") return { ok: false, reason: "ต้องเช็คอินก่อนจึงเช็คเอาท์ได้" };
    if (isTxTimeout(e)) return { ok: false, reason: BUSY_REASON };
    throw e;
  }
}

// SVC H.3 ▸ เส้น P1 (signature เดิม) → cancelBooking (HOLD/CONFIRMED · nights/ห้องปล่อยใน tx เดียว · มัดจำคืน/ริบตามขั้นบันไดของ snapshot ผ่าน POS) ◂
export async function cancelReservation(
  tenantId: string,
  unitId: string,
  reservationId: string,
  reason?: string,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const r = await cancelBooking(P1_ACTOR, { tenantId }, { unitId, reservationId, reason: reason || "ยกเลิกการจอง" });
  return r.ok ? { ok: true } : { ok: false, reason: r.reason };
}

// ───────────────────────── Refund หลังเช็คเอาท์ ─────────────────────────
// คืนเงินหลังเช็คเอาท์ (เก็บเงินผ่าน POS ไปแล้ว) — ปัญหาเดิม: cancelReservation บล็อก CHECKED_OUT → เงินค้าง
// mirror ของ ticket.cancelOrder / restaurant.voidCheckout:
//   1) claim สถานะอะตอมมิก CHECKED_OUT → REFUNDED (updateMany มีเงื่อนไข status) กันแข่ง/ทำซ้ำ
//   2) กลับเส้นเงิน pos.voidSale (คืนบัญชี + คืนแต้ม) "นอก tx" — voidSale เปิด tx ของตัวเอง (ไม่ nested)
// guard: เฉพาะ reservation ที่ CHECKED_OUT และมี posSale `hotel-sale-<id>` ที่ยัง PAID
// idempotent: refund ซ้ำ → status ไม่ใช่ CHECKED_OUT แล้ว → ok:false ไม่กลับบัญชีเบิ้ล
// ห้อง: คงสถานะเดิม (เช็คเอาท์แล้วห้องเป็น CLEANING/ว่าง — ไม่แตะ)
export async function refundStay(
  tenantId: string,
  unitId: string,
  reservationId: string,
): Promise<{ ok: true; saleVoided: boolean } | { ok: false; reason: string }> {
  const rv = await prisma.hotelReservation.findFirst({
    where: { id: reservationId, tenantId, unitId },
  });
  if (!rv) return { ok: false, reason: "ไม่พบการจอง" };
  if (rv.status === "REFUNDED") return { ok: false, reason: "การจองนี้คืนเงินไปแล้ว" };
  if (rv.status !== "CHECKED_OUT")
    return { ok: false, reason: "คืนเงินได้เฉพาะการจองที่เช็คเอาท์แล้ว" };

  // ต้องมีบิลที่เก็บเงินผ่าน POS แล้ว (idempotencyKey = hotel-sale-<id>) และยัง PAID
  const sale = await prisma.posSale.findUnique({
    where: {
      tenantId_idempotencyKey: { tenantId, idempotencyKey: `hotel-sale-${reservationId}` },
    },
  });
  if (!sale || sale.status !== "PAID")
    return { ok: false, reason: "การจองนี้ไม่มีบิลที่ต้องคืนเงิน" };

  // 1) claim อะตอมมิก: CHECKED_OUT → REFUNDED (แพ้แข่ง/ทำซ้ำ → count=0 → ไม่กลับบัญชีเบิ้ล)
  const claim = await prisma.hotelReservation.updateMany({
    where: { id: reservationId, tenantId, unitId, status: "CHECKED_OUT" },
    data: { status: "REFUNDED", refundedAt: new Date() },
  });
  if (claim.count === 0) return { ok: false, reason: "การจองนี้คืนเงินไปแล้ว" };

  // 2) กลับเส้นเงิน — void posSale (คืนบัญชี+แต้ม) นอก tx (voidSale เปิด tx เอง, idempotent)
  await pos.voidSale(tenantId, unitId, sale.id);
  // POS P5.1 ▸ MA2b (R1 F2 · CD-P51-O7): มัดจำที่เป็นใบรับ POS_DEPOSIT — คืนสภาพส่วนที่บิลนี้ใช้ แล้วคืนเงินมัดจำคงเหลือทั้งหมด (ใบคืน CN ของใบรับ)
  //   ⇒ "คืนเงินแล้ว" = ลูกค้าได้มัดจำคืนด้วย (เดิม: มัดจำกลับเป็น OPEN ค้างไว้ที่หน้าขาย) · มัดจำแบบเดิม/ไม่มีใบรับ = ไม่ทำอะไร ◂
  const dep = await (await import("@/lib/modules/pos/deposit")).moduleRefundDepositAfterVoid({ tenantId, unitId, receiptSaleId: rv.depositSaleId, voidedSaleId: sale.id, reason: "คืนเงินการจองห้องพัก", actorId: "module:hotel" });
  if (dep.ok === false) return { ok: false, reason: `ยกเลิกบิลค่าห้องแล้ว แต่คืนมัดจำไม่สำเร็จ (${dep.message}) — คืนมัดจำที่หน้าขาย` };
  return { ok: true, saleVoided: true };
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
      where: { status: { in: ["BOOKED", "CONFIRMED"] }, checkInDate: { gte: todayDate, lt: tomorrow } }, // SVC H.3 ▸ + CONFIRMED (V2) ◂
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
      where: { status: { in: ["BOOKED", "CONFIRMED", "HOLD"] }, checkInDate: { gte: tomorrow } }, // SVC H.3 ▸ + V2 ◂
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

// ───────────────────────── Public storefront (จองออนไลน์ · no-auth) ─────────────────────────
// resolve unit จาก slug (public) → tenantId+unitId · unit ต้อง ACTIVE + type=HOTEL (กันสวมร้าน/ประเภทผิด)
export async function resolveHotelUnit(tenantSlug: string, unitSlug: string) {
  // คิวรีเดียว (เดิมยิง tenant แล้ว unit เรียงกัน = 2 round-trip ไปสิงคโปร์)
  return resolvePublicUnit(tenantSlug, unitSlug, "HOTEL");
}

// ประเภทห้อง + จำนวนว่างน้อยสุดตลอดช่วง (สำหรับหน้าจองลูกค้า) — ถ้า from/to ไม่ถูกต้อง คืน free=0
export type PublicRoomTypeAvail = {
  id: string;
  name: string;
  code: string | null;
  capacity: number;
  baseRateSatang: number;
  depositSatang: number;
  totalRooms: number;
  free: number; // ห้องว่างน้อยสุดตลอดช่วง (จองได้ถ้า >= 1)
};

export async function listPublicAvailability(
  tenantId: string,
  unitId: string,
  fromStr: string,
  toStr: string,
): Promise<PublicRoomTypeAvail[]> {
  const db = tenantDb({ tenantId, unitId });
  const types = await db.hotelRoomType.findMany({
    where: { active: true },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
  const validRange = nightsBetween(fromStr, toStr) >= 1;
  // SVC H.3 ▸ ว่าง = ค่าน้อยสุดตลอดช่วงของสูตรเดียว (hotelAvailability) — ตรงกับที่ createBooking ตรวจใน guard tx ◂
  const av = validRange ? await hotelAvailability.get({ tenantId }, { unitId, from: fromStr, to: toStr }) : null;
  const days = av && av.ok ? Object.values(av.byDate) : [];
  return types.map((t) => {
    const cells = days.map((d) => d[t.id]).filter((x) => !!x);
    const free = cells.length ? Math.min(...cells.map((x) => x.available)) : 0;
    const totalRooms = cells.length ? cells[0].total : 0;
    return {
      id: t.id,
      name: t.name,
      code: t.code,
      capacity: t.capacity,
      baseRateSatang: t.baseRateSatang,
      depositSatang: t.depositSatang,
      totalRooms,
      free,
    };
  });
}

// สถานะการจอง (public จาก publicToken) — กัน cross-tenant: token ต้องเป็นของ unit นี้ (กัน leak PII แขก)
export async function getPublicReservation(unitId: string, publicToken: string) {
  const token = (publicToken ?? "").trim();
  if (!token) return null;
  const rv = await prisma.hotelReservation.findUnique({
    where: { publicToken: token },
    include: { roomType: { select: { name: true } } },
  });
  if (!rv || rv.unitId !== unitId) return null;
  return rv;
}

// PromptPay payload สำหรับจ่ายมัดจำการจองนี้ (ยอด = depositSatang) — ร้านยังไม่ตั้งเลข → null
export async function promptpayForDeposit(
  tenantId: string,
  unitId: string,
  reservationId: string,
): Promise<{ payload: string; displayName: string } | null> {
  const db = tenantDb({ tenantId, unitId });
  const rv = await db.hotelReservation.findFirst({ where: { id: reservationId } });
  if (!rv || rv.depositSatang <= 0) return null;
  const profile = await db.paymentProfile.findFirst({ where: {} });
  if (!profile?.promptpayId) return null;
  const payload = promptpayPayload({ id: profile.promptpayId, amountSatang: rv.depositSatang });
  return { payload, displayName: profile.displayName ?? "" };
}

// ร้านยืนยันรับมัดจำ — เปิดบิล POS ชนิด DEPOSIT (Dr 2110 เงินมัดจำรับ) แล้วปั๊ม depositPaidAt
//   guard: การจองมีมัดจำ (depositSatang>0) + ยังไม่จ่าย (depositPaidAt=null) + ยังไม่ยกเลิก/คืนเงิน
//   idempotent: createSale ผูก key `hotel-deposit-<reservationId>` (ยิงซ้ำ = บิลเดิม ไม่เบิ้ล)
//               + claim อะตอมมิก depositPaidAt (2 คนกดพร้อมกัน → บันทึกเดียว)
//   ไม่ผูก POS → บันทึก depositPaidAt เฉย ๆ (standalone · saleId=null)
export async function recordDeposit(
  tenantId: string,
  unitId: string,
  reservationId: string,
  payMethod: PosPayType = "TRANSFER", // POS P5.1 ▸ MA14 (R1 F4 · CD-P51-O9): วิธีรับจริง · ฟอร์มไม่มีช่องวิธีรับ = TRANSFER (เดิม "DEPOSIT") ◂
): Promise<{ ok: boolean; reason?: string; saleId?: string; noop?: boolean }> {
  const db = tenantDb({ tenantId, unitId });
  const rv = await db.hotelReservation.findFirst({ where: { id: reservationId } });
  if (!rv) return { ok: false, reason: "ไม่พบการจอง" };
  if (rv.status === "CANCELLED" || rv.status === "REFUNDED")
    return { ok: false, reason: "การจองนี้ยกเลิก/คืนเงินแล้ว รับมัดจำไม่ได้" };
  if (rv.depositSatang <= 0) return { ok: false, reason: "การจองนี้ไม่ต้องมัดจำ" };
  if (rv.depositPaidAt) return { ok: true, noop: true, saleId: rv.depositSaleId ?? undefined };

  const amount = rv.depositSatang;
  // เปิดบิลมัดจำผ่าน POS (chokepoint เงิน) — idempotent · ไม่มี POS = ข้าม (บันทึก paidAt เฉย ๆ)
  let saleId: string | null = null;
  const posSystemId = await systemForUnit(tenantId, unitId, "POS");
  if (posSystemId) {
    // POS P5.1 ▸ MA2 (F2): มัดจำ = ใบรับเงินมัดจำ POS_DEPOSIT (Cr 2110 · ไม่ใช่รายได้) + PosDeposit ผ่าน pos/deposit.moduleTakeDeposit ·
    //   createSale จุดเดิม (client = ธุรกรรมของใบรับ) · วิธีรับจริง (CD-P51-O9 · ค่าปริยาย TRANSFER · GL 1010) · เช็คเอาท์จ่ายมัดจำเป็นแถว DEPOSIT อ้างใบรับ ◂
    const posDeposit = await import("@/lib/modules/pos/deposit");
    const sale = await posDeposit.moduleTakeDeposit(
      { tenantId, unitId, systemId: posSystemId, keyBase: `hotel-deposit-${reservationId}`, amountSatang: amount, payType: payMethod, customerId: rv.customerId ?? null, customerName: rv.guestName ?? null, note: `มัดจำห้อง ${rv.code}`, createdBy: "module:hotel" },
      (tx, k) =>
        pos.createSale(
          {
            tenantId,
            unitId,
            systemId: posSystemId,
            sourceModule: k.sourceModule,
            sourceId: k.sourceId,
            idempotencyKey: k.idempotencyKey,
            lines: [{ name: `มัดจำห้อง ${rv.code}`, qty: 1, unitPriceSatang: amount }],
            payMethods: [{ type: k.payType, amountSatang: amount }],
          },
          callerTx(tx),
        ),
    );
    saleId = sale.saleId;
  }

  // claim อะตอมมิก: ปั๊ม depositPaidAt เฉพาะแถวที่ยังไม่จ่าย (กัน 2 request แข่งกัน)
  const claim = await db.hotelReservation.updateMany({
    where: { id: reservationId, depositPaidAt: null },
    data: { depositPaidAt: new Date(), depositSaleId: saleId },
  });
  if (claim.count === 0) {
    const cur = await db.hotelReservation.findFirst({ where: { id: reservationId } });
    return { ok: true, noop: true, saleId: cur?.depositSaleId ?? undefined };
  }
  return { ok: true, saleId: saleId ?? undefined };
}

// ───────── CRM v2 ใบ C1.1 (C11) — ผูก Party กลางให้ HotelReservation ─────────
// 🔴 เรียก "หลัง commit" เท่านั้น: รายการที่ล้ม (เต็ม/ชน/ไม่พบ) ต้องไม่ทิ้ง Party ของคนที่ไม่ได้เป็นลูกค้า (PDPA · เก็บเท่าที่จำเป็น)
//    และไม่ถือ connection ที่สองขณะ transaction ธุรกิจถือ lock อยู่
// 🔴 กุญแจต้องเชื่อถือได้: เบอร์ normalize ≥ 9 หลัก หรืออีเมลที่ถูกรูป — ไม่งั้นไม่ผูก (party.findOrCreate สร้างใหม่ทุกครั้งเมื่อเบอร์ < 8 หลัก ⇒ Party ขยะ)
// 🔴 ไม่มีวัน throw เข้าหาผู้เรียก · ล้ม = ปล่อย partyId ว่างให้ backfill party-links เก็บตก
// AUDIT-CLASS X8: log แค่ชื่อตาราง + tenant ไม่มีเบอร์/อีเมล/ชื่อ
async function linkPartyAfterCommit(tenantId: string, id: string, name: string | null | undefined, phone: string | null | undefined, email?: string | null): Promise<void> {
  try {
    const phoneOk = normalizePartyPhone(phone).length >= 9;
    const mail = email?.trim() ?? "";
    const mailOk = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(mail);
    if (!phoneOk && !mailOk) return;
    const partyId = await safeFindOrCreate(tenantId, { name: name?.trim() || "ลูกค้าไม่ระบุชื่อ", phone: phoneOk ? phone : null, email: mailOk ? mail : null });
    if (partyId) await prisma.hotelReservation.updateMany({ where: { id, tenantId, partyId: null }, data: { partyId } });
    else console.warn(`[party-link] HotelReservation tenant=${tenantId}: ไม่ได้ partyId — ปล่อยว่าง`);
  } catch {
    console.warn(`[party-link] HotelReservation tenant=${tenantId}: ผูก Party ไม่สำเร็จ — ปล่อยว่าง`);
  }
}
