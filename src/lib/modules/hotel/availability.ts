// SVC H.3 ▸ ห้องว่างโรงแรม — สูตรเดียวใช้ทุกที่ (ใบสั่ง h.3 §0 · §3.1 · สเปก S §4.2)
//   available(ประเภท, คืน) = ห้องขายรายคืนได้ (active · ไม่ OOO/OUT_OF_ORDER · rentMode จริง NIGHTLY|BOTH)
//                           − ห้องของประเภทที่ถูกกัน (occupancy BLOCK active ครอบคืน · นับห้องไม่ซ้ำ)
//                           − ห้องของประเภทที่เป็นสัญญาหอ (occupancy LEASE active ครอบคืน · นับห้องไม่ซ้ำ)
//                           − คืนที่นับ (HotelBookingNight.counted = true · ชั้นประเภทห้อง)
//   ปัดล่างที่ 0 (มติผู้คุม §11 ข้อ 8) · HOLD/STAY ของการจองไม่นับซ้ำ (การจองนับผ่าน nights แล้ว)
//   • hotelAvailability.get = อ่านอย่างเดียว ≤ 4 คำสั่ง (หน่วย+ห้อง 1 · occupancyRange ผ่าน facade rooms · nights 1)
//   • availabilityInTx = ตัวเดียวกันที่ด่านกันจองซ้อนใช้ใน guard tx (หลัง advisory lock) — อ่านด้วย tx ของผู้เรียกเท่านั้น
//   • ไม่มีข้อมูลผู้เข้าพัก (X10) · ข้ามร้าน/ข้ามหน่วย/ไม่ใช่โรงแรม ⇒ ok:false NOT_FOUND
import type { Prisma } from "@prisma/client";
import { tenantDb } from "@/lib/core/db";
import { occupancyRange } from "@/lib/modules/rooms";
import { dayNumber, isYmd, nightDates } from "./pricing";

export type AvailabilityCell = { total: number; blocked: number; leased: number; counted: number; available: number };
export type AvailabilityByDate = Record<string, Record<string, AvailabilityCell>>;
export type AvailabilityResult = { ok: true; from: string; to: string; byDate: AvailabilityByDate } | { ok: false; code: "NOT_FOUND" | "INVALID_INPUT"; reason: string };

/** เพดานช่วงที่ขอได้ต่อครั้ง (วัน) */
export const AVAILABILITY_MAX_DAYS = 400;

type RoomRow = { id: string; roomTypeId: string; active: boolean; status: string; hkStatus: string; rentMode: string | null; typeRentMode: string };
type TypeRow = { id: string; rentMode: string };
type OccRow = { roomId: string; kind: string; startDate: string; endDate: string };
type NightCount = { roomTypeId: string; date: string; n: number };

const isStr = (v: unknown): v is string => typeof v === "string" && v.length > 0;
const isRec = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const ymdOfDb = (d: Date | string): string => (d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10));
const dbDate = (ymd: string): Date => new Date(`${ymd}T00:00:00.000Z`);

/** ห้องขายรายคืนได้ (กติกาเดียวกับ claimRoom requireRentMode NIGHTLY + ปิดซ่อม) */
export function isSellableNightly(r: { active: boolean; status: string; hkStatus: string; rentMode: string | null; typeRentMode: string }): boolean {
  const mode = r.rentMode ?? r.typeRentMode;
  return r.active && r.status !== "OOO" && r.hkStatus !== "OUT_OF_ORDER" && (mode === "NIGHTLY" || mode === "BOTH");
}

/** ประกอบตาราง (pure) — ประเภทที่แสดง = ประเภท active ที่ไม่ใช่รายเดือนล้วน หรือมีห้องขายรายคืนได้ */
export function buildAvailability(types: TypeRow[], rooms: RoomRow[], occ: OccRow[], nights: NightCount[], from: string, to: string, roomTypeId?: string): AvailabilityByDate {
  const sellable = rooms.filter(isSellableNightly);
  const typeOfRoom = new Map(sellable.map((r) => [r.id, r.roomTypeId]));
  const totalOf = new Map<string, number>();
  for (const r of sellable) totalOf.set(r.roomTypeId, (totalOf.get(r.roomTypeId) ?? 0) + 1);
  const shown = types.filter((t) => (!roomTypeId || t.id === roomTypeId) && (t.rentMode !== "MONTHLY" || (totalOf.get(t.id) ?? 0) > 0)).map((t) => t.id);
  const held = new Map<string, Set<string>>(); // `${kind}|${type}|${date}` → ห้อง
  for (const o of occ) {
    if (o.kind !== "BLOCK" && o.kind !== "LEASE") continue;
    const t = typeOfRoom.get(o.roomId);
    if (!t) continue;
    const s = o.startDate < from ? from : o.startDate;
    for (const d of nightDates(s, o.endDate)) {
      if (d >= to) break;
      const k = `${o.kind}|${t}|${d}`;
      const set = held.get(k) ?? new Set<string>();
      set.add(o.roomId);
      held.set(k, set);
    }
  }
  const counted = new Map<string, number>();
  for (const n of nights) counted.set(`${n.roomTypeId}|${n.date}`, (counted.get(`${n.roomTypeId}|${n.date}`) ?? 0) + n.n);
  const out: AvailabilityByDate = {};
  for (const d of nightDates(from, to)) {
    const day: Record<string, AvailabilityCell> = {};
    for (const t of shown) {
      const total = totalOf.get(t) ?? 0;
      const blocked = held.get(`BLOCK|${t}|${d}`)?.size ?? 0;
      const leased = held.get(`LEASE|${t}|${d}`)?.size ?? 0;
      const c = counted.get(`${t}|${d}`) ?? 0;
      day[t] = { total, blocked, leased, counted: c, available: Math.max(0, total - blocked - leased - c) };
    }
    out[d] = day;
  }
  return out;
}

function rangeOk(from: unknown, to: unknown): { from: string; to: string } | null {
  if (!isYmd(from) || !isYmd(to)) return null;
  const days = dayNumber(to) - dayNumber(from);
  if (days < 1 || days > AVAILABILITY_MAX_DAYS) return null;
  return { from, to };
}

type UnitRoomRow = { unitType: string | null; typeId: string | null; typeRentMode: string | null; roomId: string | null; roomActive: boolean | null; roomStatus: string | null; hkStatus: string | null; roomRentMode: string | null };

/**
 * ห้องว่างต่อคืนต่อประเภท ช่วง [from, to) ของหน่วยโรงแรม — อ่านอย่างเดียว
 * ctx = { tenantId } · ข้ามร้าน/หน่วย/ไม่ใช่โรงแรม ⇒ NOT_FOUND · ช่วงผิด/เกิน 400 วัน ⇒ INVALID_INPUT (ไม่ throw)
 */
async function get(ctx: unknown, input: unknown): Promise<AvailabilityResult> {
  const tenantId = isRec(ctx) ? ctx.tenantId : null;
  const unitId = isRec(input) ? input.unitId : null;
  if (!isStr(tenantId) || !isStr(unitId)) return { ok: false, code: "NOT_FOUND", reason: "ไม่พบโรงแรมนี้" };
  const range = rangeOk(isRec(input) ? input.from : null, isRec(input) ? input.to : null);
  if (!range) return { ok: false, code: "INVALID_INPUT", reason: `ช่วงวันที่ไม่ถูกต้อง (ต้องมีอย่างน้อย 1 คืน และไม่เกิน ${AVAILABILITY_MAX_DAYS} วัน)` };
  const roomTypeId = isRec(input) && isStr(input.roomTypeId) ? input.roomTypeId : undefined;
  const db = tenantDb({ tenantId, unitId });
  const [rows, occ, nights] = await Promise.all([
    db.$queryRaw<UnitRoomRow[]>`
      SELECT u."type"::text AS "unitType", rt."id" AS "typeId", rt."rentMode" AS "typeRentMode",
             r."id" AS "roomId", r."active" AS "roomActive", r."status"::text AS "roomStatus", r."hkStatus", r."rentMode" AS "roomRentMode"
        FROM "BusinessUnit" u
        LEFT JOIN "HotelRoomType" rt ON rt."unitId" = u."id" AND rt."tenantId" = u."tenantId" AND rt."active" = true
        LEFT JOIN "HotelRoom" r ON r."roomTypeId" = rt."id" AND r."unitId" = u."id" AND r."tenantId" = u."tenantId"
       WHERE u."id" = ${unitId} AND u."tenantId" = ${tenantId}
       ORDER BY rt."sortOrder" ASC, rt."name" ASC`,
    occupancyRange({ tenantId }, { unitId, start: range.from, end: range.to }),
    db.hotelBookingNight.groupBy({
      by: ["roomTypeId", "date"],
      where: { counted: true, date: { gte: dbDate(range.from), lt: dbDate(range.to) }, ...(roomTypeId ? { roomTypeId } : {}) },
      _count: { _all: true },
    }),
  ]);
  if (rows[0]?.unitType !== "HOTEL") return { ok: false, code: "NOT_FOUND", reason: "ไม่พบโรงแรมนี้" };
  const types = new Map<string, TypeRow>();
  const rooms: RoomRow[] = [];
  for (const r of rows) {
    if (!r.typeId) continue;
    if (!types.has(r.typeId)) types.set(r.typeId, { id: r.typeId, rentMode: r.typeRentMode ?? "NIGHTLY" });
    if (r.roomId) rooms.push({ id: r.roomId, roomTypeId: r.typeId, active: r.roomActive === true, status: r.roomStatus ?? "AVAILABLE", hkStatus: r.hkStatus ?? "CLEAN", rentMode: r.roomRentMode, typeRentMode: r.typeRentMode ?? "NIGHTLY" });
  }
  const byDate = buildAvailability(
    [...types.values()],
    rooms,
    occ.map((o) => ({ roomId: o.roomId, kind: o.kind, startDate: o.startDate, endDate: o.endDate })),
    nights.map((n) => ({ roomTypeId: n.roomTypeId, date: ymdOfDb(n.date), n: n._count._all })),
    range.from,
    range.to,
    roomTypeId,
  );
  return { ok: true, from: range.from, to: range.to, byDate };
}

/** สูตรเดียวของโรงแรม (dashboard · storefront · quote · ปฏิทินราคา · ปฏิทินห้อง · OTA) */
export const hotelAvailability = { get } as const;

/**
 * ตัวเดียวกันในธุรกรรมของผู้เรียก (หลัง pg_advisory_xact_lock ต่อประเภท) — อ่านด้วย tx เท่านั้น (ไม่เปิด connection ที่สองระหว่างถือล็อก)
 * ไม่ตรวจชนิดหน่วย (ผู้เรียกผ่านด่าน HOTEL แล้ว) · excludeReservationIds = ไม่นับคืนของการจองเหล่านี้ (ต่อ/ย้าย/คืนสถานะ)
 */
export async function availabilityInTx(
  tx: Prisma.TransactionClient,
  q: { tenantId: string; unitId: string; roomTypeIds: string[]; from: string; to: string; excludeReservationIds?: string[] },
): Promise<AvailabilityByDate> {
  if (!q.roomTypeIds.length || !(q.to > q.from)) return {};
  const from = dbDate(q.from);
  const to = dbDate(q.to);
  const [types, rooms, nights] = await Promise.all([
    tx.hotelRoomType.findMany({ where: { tenantId: q.tenantId, unitId: q.unitId, id: { in: q.roomTypeIds } }, select: { id: true, rentMode: true } }),
    tx.hotelRoom.findMany({
      where: { tenantId: q.tenantId, unitId: q.unitId, roomTypeId: { in: q.roomTypeIds } },
      select: { id: true, roomTypeId: true, active: true, status: true, hkStatus: true, rentMode: true, roomType: { select: { rentMode: true } } },
    }),
    tx.hotelBookingNight.groupBy({
      by: ["roomTypeId", "date"],
      where: {
        tenantId: q.tenantId,
        unitId: q.unitId,
        roomTypeId: { in: q.roomTypeIds },
        counted: true,
        date: { gte: from, lt: to },
        ...(q.excludeReservationIds?.length ? { reservationId: { notIn: q.excludeReservationIds } } : {}),
      },
      _count: { _all: true },
    }),
  ]);
  const roomIds = rooms.map((r) => r.id);
  const occ = roomIds.length
    ? await tx.roomOccupancy.findMany({
        where: { tenantId: q.tenantId, unitId: q.unitId, roomId: { in: roomIds }, active: true, kind: { in: ["BLOCK", "LEASE"] }, startDate: { lt: to }, endDate: { gt: from } },
        select: { roomId: true, kind: true, startDate: true, endDate: true },
      })
    : [];
  return buildAvailability(
    types.map((t) => ({ id: t.id, rentMode: t.rentMode })),
    rooms.map((r) => ({ id: r.id, roomTypeId: r.roomTypeId, active: r.active, status: r.status, hkStatus: r.hkStatus, rentMode: r.rentMode, typeRentMode: r.roomType.rentMode })),
    occ.map((o) => ({ roomId: o.roomId, kind: o.kind, startDate: ymdOfDb(o.startDate), endDate: ymdOfDb(o.endDate) })),
    nights.map((n) => ({ roomTypeId: n.roomTypeId, date: ymdOfDb(n.date), n: n._count._all })),
    q.from,
    q.to,
  );
}

/** คืนที่ต้องใช้ต่อ (ประเภท, คืน) เกินที่ว่าง ⇒ รายการคืนที่ไม่พอ (เรียง · ไม่ซ้ำ) */
export function shortDates(byDate: AvailabilityByDate, need: Map<string, number>): string[] {
  const bad = new Set<string>();
  for (const [k, n] of need) {
    const i = k.indexOf("|");
    const t = k.slice(0, i);
    const d = k.slice(i + 1);
    if ((byDate[d]?.[t]?.available ?? 0) < n) bad.add(d);
  }
  return [...bad].sort();
}

