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
import { affectedByOutOfOrder, claimRoom, moveOccupancy, releaseOccupancy } from "@/lib/modules/rooms";
export type { AffectedOccupancy } from "@/lib/modules/rooms";
import { resolvePublicUnit } from "@/lib/core/storefront";

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
 * ภาระของแต่ละประเภทในช่วง [from,to)
 *   total        = ห้องขายรายคืนได้ (active · ไม่ OOO/OUT_OF_ORDER · rentMode จริง NIGHTLY|BOTH)
 *   usedOf(t,d)  = การจองโรงแรม active ทุกแถวที่กินคืน d (แบบ P1 เดิม — ไม่สนว่ามี occupancy/ห้องจะ OOO หรือ MONTHLY แล้ว)
 *                  + ห้องของประเภทนั้นที่ถูกถือโดย occupancy ที่ "ไม่ใช่" การจองโรงแรม (LEASE/BLOCK/HOLD ที่ยังไม่หมดเวลา) ในคืน d
 *   rangeFreeOf(t) = ห้องที่ว่าง "ห้องเดียวตลอดช่วง" − การจองเดิมที่ยังไม่มีห้อง (ไม่มี occupancy และไม่มี roomId) ที่ซ้อนช่วง
 * excludeReservationId = ไม่นับการจองนี้
 */
async function stayLoad(db: Db, tenantId: string, unitId: string, fromStr: string, toStr: string, roomTypeId?: string, excludeReservationId?: string) {
  const from = parseDate(fromStr);
  const to = parseDate(toStr);
  const now = new Date();
  const rooms = await sellableRooms(db, tenantId, unitId, roomTypeId);
  const typeOfRoom = new Map(rooms.map((r) => [r.id, r.roomTypeId]));
  const [occ, rvs] = await Promise.all([
    rooms.length
      ? db.roomOccupancy.findMany({
          where: { tenantId, unitId, active: true, roomId: { in: rooms.map((r) => r.id) }, startDate: { lt: to }, endDate: { gt: from } },
          select: { roomId: true, kind: true, holdExpiresAt: true, refType: true, refId: true, startDate: true, endDate: true },
        })
      : Promise.resolve([]),
    db.hotelReservation.findMany({
      where: {
        tenantId,
        unitId,
        status: { in: ACTIVE_STATUSES },
        checkInDate: { lt: to },
        checkOutDate: { gt: from },
        ...(roomTypeId ? { roomTypeId } : {}),
        ...(excludeReservationId ? { id: { not: excludeReservationId } } : {}),
      },
      select: { id: true, roomTypeId: true, roomId: true, checkInDate: true, checkOutDate: true },
    }),
  ]);
  const live = occ.filter((o) => liveOcc(o, now) && !(excludeReservationId && o.refType === HOTEL_REF && o.refId === excludeReservationId));
  const others = live.filter((o) => o.refType !== HOTEL_REF);
  // การจองที่ "มีห้องแล้ว" = มี occupancy active (ห้องไหนก็ได้) หรือมี roomId (การจองเดิมที่เช็คอินแล้ว)
  const withOcc = new Set(
    rvs.length
      ? (await db.roomOccupancy.findMany({ where: { tenantId, unitId, active: true, refType: HOTEL_REF, refId: { in: rvs.map((r) => r.id) } }, select: { refId: true } })).map((o) => o.refId)
      : [],
  );
  const roomless = rvs.filter((r) => !withOcc.has(r.id) && !r.roomId);
  const legacyRoomIds = new Set(rvs.filter((r) => !withOcc.has(r.id) && r.roomId).map((r) => r.roomId as string));
  const busyRooms = new Set([...live.map((o) => o.roomId), ...legacyRoomIds]);

  const totalOf = (typeId: string) => rooms.filter((r) => r.roomTypeId === typeId).length;
  const usedOf = (typeId: string, d: number) => {
    const rv = rvs.filter((r) => r.roomTypeId === typeId && r.checkInDate.getTime() <= d && r.checkOutDate.getTime() > d).length;
    const held = new Set(others.filter((o) => typeOfRoom.get(o.roomId) === typeId && o.startDate.getTime() <= d && o.endDate.getTime() > d).map((o) => o.roomId)).size;
    return rv + held;
  };
  const perNightFreeOf = (typeId: string) => {
    const total = totalOf(typeId);
    let maxUsed = 0;
    for (let d = from.getTime(); d < to.getTime(); d += DAY_MS) maxUsed = Math.max(maxUsed, usedOf(typeId, d));
    return Math.max(0, total - maxUsed);
  };
  const rangeFreeOf = (typeId: string) => {
    const whole = rooms.filter((r) => r.roomTypeId === typeId && !busyRooms.has(r.id)).length;
    return Math.max(0, whole - roomless.filter((r) => r.roomTypeId === typeId).length);
  };
  return { totalOf, usedOf, perNightFreeOf, rangeFreeOf };
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
  const [occ, legacy] = await Promise.all([
    db.roomOccupancy.findMany({
      where: { tenantId, unitId, active: true, roomId: { in: ids }, startDate: { lt: wTo }, endDate: { gt: wFrom } },
      select: { roomId: true, kind: true, holdExpiresAt: true, refType: true, refId: true, startDate: true, endDate: true },
    }),
    db.hotelReservation.findMany({
      where: { tenantId, unitId, id: { not: reservationId }, roomId: { in: ids }, status: { in: ACTIVE_STATUSES }, checkInDate: { lt: wTo }, checkOutDate: { gt: wFrom } },
      select: { roomId: true, checkInDate: true, checkOutDate: true },
    }),
  ]);
  const spans = [
    ...occ.filter((o) => liveOcc(o, now) && !(o.refType === HOTEL_REF && o.refId === reservationId)).map((o) => ({ roomId: o.roomId, s: o.startDate.getTime(), e: o.endDate.getTime() })),
    ...legacy.map((l) => ({ roomId: l.roomId ?? "", s: l.checkInDate.getTime(), e: l.checkOutDate.getTime() })),
  ];
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
  const from = parseDate(fromStr);
  const to = parseDate(toStr);
  // SVC R0.8 ▸ ต่อคืน: ห้องที่ขายรายคืนได้ − การจองโรงแรมทุกแถว (แบบ P1) − ห้องที่ถูกถือโดย occupancy ที่ไม่ใช่โรงแรม (เช่น สัญญาหอ) ◂
  const [types, load] = await Promise.all([
    db.hotelRoomType.findMany({
      where: { active: true },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    }),
    stayLoad(prisma, tenantId, unitId, fromStr, toStr),
  ]);

  const nights: string[] = [];
  for (let d = from.getTime(); d < to.getTime(); d += 86_400_000) nights.push(dateToStr(new Date(d)));

  return types.map((t) => {
    const total = load.totalOf(t.id);
    const days = nights.map((date) => {
      const booked = Math.min(total, load.usedOf(t.id, parseDate(date).getTime()));
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
): Promise<{ total: number; free: number; perNightFree: number }> {
  // SVC R0.8 ▸ free = min(ว่างต่อคืนน้อยสุด, ห้องที่ว่างห้องเดียวตลอดช่วง − การจองเดิมที่ยังไม่มีห้อง) · ไม่นับห้อง MONTHLY/OUT_OF_ORDER ◂
  const load = await stayLoad(tx as Db, tenantId, unitId, fromStr, toStr, roomTypeId, excludeReservationId);
  const perNightFree = load.perNightFreeOf(roomTypeId);
  return { total: load.totalOf(roomTypeId), free: Math.min(perNightFree, load.rangeFreeOf(roomTypeId)), perNightFree };
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
}): Promise<{ ok: true; id: string; code: string; publicToken: string | null } | { ok: false; reason: string }> {
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
      // ล็อกแถวประเภทห้อง (FOR UPDATE) → ซีเรียลไลซ์การจองพร้อมกันของประเภทเดียวกัน
      // กันจองซ้อนเกิน capacity: request ที่ 2 บล็อกจนคนแรก commit แล้วค่อยนับ availability ใหม่ (เห็นการจองแรก → FULL)
      await tx.$queryRaw`SELECT id FROM "HotelRoomType" WHERE id = ${input.roomTypeId} FOR UPDATE`;
      const { total, free, perNightFree } = await freeCountForRange(
        tx as typeof prisma,
        tenantId,
        unitId,
        input.roomTypeId,
        input.checkInDate,
        input.checkOutDate,
      );
      if (total === 0) throw new Error("NO_ROOMS");
      if (perNightFree < 1) throw new Error("FULL");
      if (free < 1) throw new Error("NO_SINGLE_ROOM"); // SVC R0.8 ▸ ต่อคืนยังว่าง แต่ไม่มีห้องเดียวที่ว่างตลอดช่วง ◂

      const code = await nextCode(tx as typeof prisma, tenantId, unitId);
      const total_ = rt.baseRateSatang * nights;
      const rv = await tx.hotelReservation.create({
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
          depositSatang: rt.depositSatang, // snapshot มัดจำจากประเภทห้อง (0 = ไม่ต้องมัดจำ)
          note: input.note || null,
          createdById: input.createdById || null,
        },
      });
      // SVC R0.8 ▸ มติผู้คุม: ถือ "ห้องจริง" ตั้งแต่ตอนจอง — ใน tx เดิม หลังล็อกประเภทห้อง (ลำดับล็อก ประเภท → ห้อง)
      //   ไล่ห้องว่างตามเลขห้อง · ชน (23P01 · เช่น สัญญาหอเพิ่ง commit) ⇒ ลองห้องถัดไป · หมด ⇒ FULL (tx ย้อนทั้งก้อน ไม่มีการจองค้าง) ◂
      let held = false;
      //   best-fit (ผู้ตรวจ R0.8 ข้อ 5): ห้องที่ช่องว่างก่อน/หลังแคบสุดก่อน — เก็บช่วงยาวไว้ (re-pack การจองที่ยังไม่เช็คอิน = หนี้เฟส H) ◂
      for (const room of await freeRoomsForStay(tx as Db, tenantId, unitId, input.roomTypeId, rv.checkInDate, rv.checkOutDate, rv.id, true)) {
        const c = await claimRoom(tx, {
          requireRentMode: "NIGHTLY",
          tenantId,
          unitId,
          roomId: room.id,
          start: input.checkInDate,
          end: input.checkOutDate,
          kind: "STAY",
          refType: HOTEL_REF,
          refId: rv.id,
        });
        if (c.ok) {
          held = true;
          break;
        }
      }
      if (!held) throw new Error("NO_SINGLE_ROOM");
      return rv;
    }, HOTEL_TX);
    await linkPartyAfterCommit(tenantId, created.id, input.guestName, input.guestPhone, input.guestEmail); // CRM v2 C1.1 (C11)
    return { ok: true, id: created.id, code: created.code, publicToken: created.publicToken };
  } catch (e) {
    if (e instanceof Error && e.message === "FULL")
      return { ok: false, reason: "ประเภทห้องนี้เต็มในช่วงวันที่เลือก" };
    if (e instanceof Error && e.message === "NO_ROOMS")
      return { ok: false, reason: "ยังไม่มีห้องในประเภทนี้ — เพิ่มห้องก่อน" };
    if (e instanceof Error && e.message === "NO_SINGLE_ROOM")
      return { ok: false, reason: "ไม่มีห้องเดียวที่ว่างตลอดช่วง ลองเลื่อนวัน" };
    if (isTxTimeout(e)) return { ok: false, reason: BUSY_REASON };
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
  // SVC R0.8 ▸ ตัดห้องที่ถูกถือช่วงซ้อน (occupancy ของคนอื่น — ของการจองนี้เองไม่ตัด) · ห้องขายรายคืนไม่ได้/ปิดซ่อม ◂
  return freeRoomsForStay(prisma, tenantId, unitId, rv.roomTypeId, rv.checkInDate, rv.checkOutDate, reservationId);
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
      if (room.status === "OOO" || room.hkStatus === "OUT_OF_ORDER") throw new Error("ROOM_OOO");
      if (!sellsNightly(room.rentMode, (await tx.hotelRoomType.findFirst({ where: { id: room.roomTypeId, tenantId, unitId }, select: { rentMode: true } }))?.rentMode ?? "NIGHTLY"))
        throw new Error("BAD_ROOM"); // SVC R0.8 ▸ ห้องรายเดือนไม่ขายรายคืน ◂
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
      // SVC R0.8 ▸ ห้องจริงของ occupancy: ห้องที่เลือก ≠ ห้องที่ถืออยู่ ⇒ ย้าย · การจองเดิมไม่มี occupancy ⇒ claim ห้องที่เลือก
      //   ชน ⇒ throw (tx ย้อน · สถานะคง BOOKED · occupancy เดิมไม่ขยับ) ◂
      const occ = await tx.roomOccupancy.findFirst({
        where: { tenantId, unitId, refType: HOTEL_REF, refId: reservationId, active: true },
        select: { id: true, roomId: true },
      });
      if (occ) {
        if (occ.roomId !== roomId) {
          const m = await moveOccupancy(tx, { tenantId, unitId, occupancyId: occ.id, toRoomId: roomId });
          if (!m.ok) throw new Error(m.code === "ROOM_TAKEN" ? "ROOM_TAKEN" : m.code === "ROOM_INACTIVE" ? "ROOM_OOO" : "BAD_ROOM");
        }
      } else {
        const c = await claimRoom(tx, {
          tenantId,
          unitId,
          roomId,
          start: dateToStr(rv.checkInDate),
          end: dateToStr(rv.checkOutDate),
          kind: "STAY",
          refType: HOTEL_REF,
          refId: reservationId,
          requireRentMode: "NIGHTLY",
        });
        if (!c.ok) throw new Error(c.code === "ROOM_TAKEN" ? "ROOM_TAKEN" : c.code === "ROOM_INACTIVE" ? "ROOM_OOO" : "BAD_ROOM");
      }
      await tx.hotelReservation.update({
        where: { id: reservationId },
        data: { status: "CHECKED_IN", roomId, checkedInAt: new Date() },
      });
      await tx.hotelRoom.update({ where: { id: roomId }, data: { status: "OCCUPIED" } });
    }, HOTEL_TX);
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
    if (isTxTimeout(e)) return { ok: false, reason: BUSY_REASON };
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
      // ถ้าเคยเช็คอินและถือห้องอยู่ → ปล่อยห้องเป็น CLEANING (SVC R0.8 ▸ + hkStatus DIRTY ◂)
      if (rv.status === "CHECKED_IN" && rv.roomId) {
        await tx.hotelRoom.update({ where: { id: rv.roomId }, data: { status: "CLEANING", hkStatus: "DIRTY" } });
      }
      // SVC R0.8 ▸ ปล่อยห้องจริง (occupancy) ใน tx เดียวกับ CANCELLED ◂
      await releaseStay(tx, tenantId, unitId, reservationId, reason || "ยกเลิกการจอง");
    }, HOTEL_TX);
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg === "NOT_FOUND") return { ok: false, reason: "ไม่พบการจอง" };
    if (msg === "BAD_STATUS") return { ok: false, reason: "การจองนี้ยกเลิกไม่ได้" };
    if (isTxTimeout(e)) return { ok: false, reason: BUSY_REASON };
    throw e;
  }
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
  // SVC R0.8 ▸ ว่าง = min(ว่างต่อคืนน้อยสุด, ห้องที่ว่างห้องเดียวตลอดช่วง − การจองเดิมที่ยังไม่มีห้อง) — ตรงกับที่ createReservation จองได้จริง ◂
  const load = validRange ? await stayLoad(prisma, tenantId, unitId, fromStr, toStr) : null;
  return types.map((t) => {
    const free = load ? Math.min(load.perNightFreeOf(t.id), load.rangeFreeOf(t.id)) : 0;
    const totalRooms = load ? load.totalOf(t.id) : 0;
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
