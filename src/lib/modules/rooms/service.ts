// SVC R0.8 ▸ แกนห้อง — อาคาร/ชั้น/rentMode/hkStatus · availability · roomBoard · backfill การจองโรงแรมเดิม
//   สัญญา: ledger/svc-briefs/svc-brief-r0.8.md §3 · ledger/SVC-CORE-CONTRACT.md §5
//   ชื่อ Room/RoomType อยู่ใน facade เท่านั้น — ตารางจริงยังเป็น HotelRoom/HotelRoomType (CC §5: ไม่ rename)
//   ไฟล์นี้ไม่ import prisma ดิบ: อ่าน/เขียนผ่าน tenantDb (ผูก tenant+unit) · ธุรกรรมผ่าน withRoomTx ของ occupancy.ts
//   🔴 hkStatus = แหล่งความจริงของสถานะกายภาพ (มติผู้คุม R0.8) · HotelRoom.status เดิมคงไว้ให้หน้าจอ P1 และถูกแมปตาม
import { tenantDb } from "@/lib/core/db";
import { bkkYmd } from "@/lib/core/quiet-hours";
import {
  HOLD_KINDS,
  claimRoom,
  dbToYmd,
  toYmd,
  withRoomTx,
  ymdToDb,
  type DateIn,
  type Tx,
} from "./occupancy";

type Ctx = { tenantId: string };
/** occupancy ที่ยังไม่จบของห้องซึ่ง "ขัด" กับค่าใหม่ — คืนเป็นคำเตือน (ไม่บล็อก · occupancy คงเดิม ผู้เรียกตัดสินใจย้ายเอง · ใบ §8 ข้อ 2) */
export type AffectedOccupancy = { occupancyId: string; roomId: string; kind: string; refType: string; refId: string; startDate: string; endDate: string };
type Res = { ok: true; id?: string; affected?: AffectedOccupancy[] } | { ok: false; code: string; message: string };

/** kinds = ชนิดที่ขัด (OUT_OF_ORDER: ทุกชนิดยกเว้น BLOCK · MONTHLY: STAY · NIGHTLY: LEASE) · endDate > วันนี้ (ไทย) */
async function affectedOn(tenantId: string, unitId: string, roomId: string, kinds: string[]): Promise<AffectedOccupancy[]> {
  if (kinds.length === 0) return [];
  const rows = await tenantDb({ tenantId, unitId }).roomOccupancy.findMany({
    where: { roomId, active: true, kind: { in: kinds }, endDate: { gt: ymdToDb(bkkYmd(new Date())) } },
    orderBy: { startDate: "asc" },
    select: { id: true, roomId: true, kind: true, refType: true, refId: true, startDate: true, endDate: true },
  });
  return rows.map(toAffected);
}
function toAffected(o: { id: string; roomId: string; kind: string; refType: string; refId: string; startDate: Date; endDate: Date }): AffectedOccupancy {
  return { occupancyId: o.id, roomId: o.roomId, kind: o.kind, refType: o.refType, refId: o.refId, startDate: dbToYmd(o.startDate), endDate: dbToYmd(o.endDate) };
}
const OOO_CLASH = ["LEASE", "STAY", "HOLD", "CHANNEL_HOLD"];
/** ชนิด occupancy ที่ขัดกับ rentMode จริง: MONTHLY ⇒ STAY (การจองรายคืน) · NIGHTLY ⇒ LEASE (สัญญารายเดือน) · BOTH ⇒ ไม่มี */
const clashOfRentMode = (m: string): string[] => (m === "MONTHLY" ? ["STAY"] : m === "NIGHTLY" ? ["LEASE"] : []);
/** ใช้จาก hotel.setRoomStatus(OOO) ผ่าน facade — กติกาเดียวกับ setHkStatus(OUT_OF_ORDER) */
export function affectedByOutOfOrder(ctx: Ctx, input: { unitId: string; roomId: string }): Promise<AffectedOccupancy[]> {
  if (!ctx?.tenantId || !input?.unitId || !input.roomId) return Promise.resolve([]);
  return affectedOn(ctx.tenantId, input.unitId, input.roomId, OOO_CLASH);
}

export const RENT_MODES = ["NIGHTLY", "MONTHLY", "BOTH"] as const;
export type RentMode = (typeof RENT_MODES)[number];
export const HK_STATUSES = ["CLEAN", "DIRTY", "INSPECTED", "OUT_OF_ORDER"] as const;
export type HkStatus = (typeof HK_STATUSES)[number];

const isRentMode = (v: unknown): v is RentMode => typeof v === "string" && (RENT_MODES as readonly string[]).includes(v);
const isHk = (v: unknown): v is HkStatus => typeof v === "string" && (HK_STATUSES as readonly string[]).includes(v);
const isInt = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v);
const bad = (code: string, message: string): Res => ({ ok: false, code, message });

/** rentMode จริงของห้อง = ของห้อง (override) ?? ของประเภท */
export function effectiveRentMode(roomRentMode: string | null | undefined, typeRentMode: string | null | undefined): string {
  return roomRentMode ?? typeRentMode ?? "NIGHTLY";
}
/** ห้องนี้ขายในโหมดที่ขอได้ไหม (NIGHTLY รับ NIGHTLY|BOTH · MONTHLY รับ MONTHLY|BOTH) */
export function rentModeAccepts(effective: string, wanted: "NIGHTLY" | "MONTHLY"): boolean {
  return effective === wanted || effective === "BOTH";
}
/** hold ที่หมดเวลาแล้ว (ยัง active เพราะงานยังไม่มาปิด) นับว่าง */
function liveOcc(o: { kind: string; holdExpiresAt: Date | null }, now: Date): boolean {
  return !(HOLD_KINDS.includes(o.kind) && o.holdExpiresAt !== null && o.holdExpiresAt <= now);
}

async function unitOfTenant(ctx: Ctx, unitId: string): Promise<boolean> {
  if (!ctx?.tenantId || !unitId) return false;
  const u = await tenantDb({ tenantId: ctx.tenantId }).businessUnit.findFirst({ where: { id: unitId }, select: { id: true } });
  return !!u;
}

// ───────────────────────── อาคาร ─────────────────────────
export async function createBuilding(ctx: Ctx, input: { unitId: string; name: string; floors: number; sortOrder?: number }): Promise<Res> {
  const name = typeof input?.name === "string" ? input.name.trim() : "";
  if (!name) return bad("INVALID_INPUT", "กรุณาใส่ชื่ออาคาร");
  if (!isInt(input.floors) || input.floors < 1) return bad("INVALID_INPUT", "จำนวนชั้นต้องเป็นจำนวนเต็มตั้งแต่ 1");
  if (input.sortOrder !== undefined && !isInt(input.sortOrder)) return bad("INVALID_INPUT", "ลำดับต้องเป็นจำนวนเต็ม");
  if (!(await unitOfTenant(ctx, input.unitId))) return bad("NOT_FOUND", "ไม่พบหน่วยธุรกิจ");
  const db = tenantDb({ tenantId: ctx.tenantId, unitId: input.unitId });
  let sortOrder = input.sortOrder;
  if (sortOrder === undefined) {
    const last = await db.roomBuilding.findFirst({ orderBy: { sortOrder: "desc" }, select: { sortOrder: true } });
    sortOrder = (last?.sortOrder ?? 0) + 1;
  }
  const row = await db.roomBuilding.create({ data: { tenantId: ctx.tenantId, unitId: input.unitId, name, floors: input.floors, sortOrder } });
  return { ok: true, id: row.id };
}

export async function updateBuilding(
  ctx: Ctx,
  input: { unitId: string; buildingId: string; name?: string; floors?: number; sortOrder?: number },
): Promise<Res> {
  if (!ctx?.tenantId || !input?.unitId || !input.buildingId) return bad("NOT_FOUND", "ไม่พบอาคาร");
  const db = tenantDb({ tenantId: ctx.tenantId, unitId: input.unitId });
  const b = await db.roomBuilding.findFirst({ where: { id: input.buildingId }, select: { id: true } });
  if (!b) return bad("NOT_FOUND", "ไม่พบอาคาร");
  const data: { name?: string; floors?: number; sortOrder?: number } = {};
  if (input.name !== undefined) {
    const name = typeof input.name === "string" ? input.name.trim() : "";
    if (!name) return bad("INVALID_INPUT", "กรุณาใส่ชื่ออาคาร");
    data.name = name;
  }
  if (input.floors !== undefined) {
    if (!isInt(input.floors) || input.floors < 1) return bad("INVALID_INPUT", "จำนวนชั้นต้องเป็นจำนวนเต็มตั้งแต่ 1");
    const above = await db.hotelRoom.count({ where: { buildingId: b.id, floorNo: { gt: input.floors } } });
    if (above > 0) return bad("FLOOR_IN_USE", "มีห้องอยู่ชั้นที่สูงกว่าจำนวนชั้นใหม่ — ย้ายห้องก่อน");
    data.floors = input.floors;
  }
  if (input.sortOrder !== undefined) {
    if (!isInt(input.sortOrder)) return bad("INVALID_INPUT", "ลำดับต้องเป็นจำนวนเต็ม");
    data.sortOrder = input.sortOrder;
  }
  await db.roomBuilding.update({ where: { id: b.id }, data });
  return { ok: true, id: b.id };
}

export async function deleteBuilding(ctx: Ctx, input: { unitId: string; buildingId: string }): Promise<Res> {
  if (!ctx?.tenantId || !input?.unitId || !input.buildingId) return bad("NOT_FOUND", "ไม่พบอาคาร");
  const db = tenantDb({ tenantId: ctx.tenantId, unitId: input.unitId });
  const b = await db.roomBuilding.findFirst({ where: { id: input.buildingId }, select: { id: true } });
  if (!b) return bad("NOT_FOUND", "ไม่พบอาคาร");
  const used = await db.hotelRoom.count({ where: { buildingId: b.id } });
  if (used > 0) return bad("BUILDING_IN_USE", "ยังมีห้องผูกกับอาคารนี้ — ย้ายห้องออกก่อน");
  await db.roomBuilding.delete({ where: { id: b.id } });
  return { ok: true, id: b.id };
}

export async function listBuildings(ctx: Ctx, input: { unitId: string }): Promise<{ id: string; name: string; floors: number; sortOrder: number }[]> {
  if (!ctx?.tenantId || !input?.unitId) return [];
  return tenantDb({ tenantId: ctx.tenantId, unitId: input.unitId }).roomBuilding.findMany({
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: { id: true, name: true, floors: true, sortOrder: true },
  });
}

// ───────────────────────── ห้อง: ผัง/โหมดเช่า/แม่บ้าน ─────────────────────────
export async function setRoomLayout(
  ctx: Ctx,
  input: { unitId: string; roomId: string; buildingId?: string | null; floorNo?: number | null; rentMode?: RentMode | null },
): Promise<Res> {
  if (!ctx?.tenantId || !input?.unitId || !input.roomId) return bad("NOT_FOUND", "ไม่พบห้อง");
  const db = tenantDb({ tenantId: ctx.tenantId, unitId: input.unitId });
  const room = await db.hotelRoom.findFirst({ where: { id: input.roomId }, select: { id: true, buildingId: true, floorNo: true, roomType: { select: { rentMode: true } } } });
  if (!room) return bad("NOT_FOUND", "ไม่พบห้อง");
  const data: { buildingId?: string | null; floorNo?: number | null; rentMode?: string | null } = {};

  if (input.rentMode !== undefined) {
    if (input.rentMode !== null && !isRentMode(input.rentMode)) return bad("INVALID_INPUT", "โหมดเช่าไม่ถูกต้อง");
    data.rentMode = input.rentMode;
  }
  if (input.floorNo !== undefined && input.floorNo !== null && !isInt(input.floorNo)) return bad("INVALID_INPUT", "ชั้นต้องเป็นจำนวนเต็ม");

  const buildingId = input.buildingId === undefined ? room.buildingId : input.buildingId;
  const floorNo = input.floorNo === undefined ? room.floorNo : input.floorNo;
  if (buildingId) {
    // อาคารต้องอยู่หน่วยเดียวกับห้อง (tenantDb ผูก unit ของห้องแล้ว ⇒ อาคารหน่วยอื่น = ไม่พบ)
    const b = await db.roomBuilding.findFirst({ where: { id: buildingId }, select: { id: true, floors: true } });
    if (!b) return bad("BUILDING_NOT_FOUND", "ไม่พบอาคารในหน่วยนี้");
    if (floorNo !== null && floorNo !== undefined && (floorNo < 1 || floorNo > b.floors)) return bad("INVALID_FLOOR", `ชั้นต้องอยู่ระหว่าง 1–${b.floors}`);
  }
  if (input.buildingId !== undefined) data.buildingId = input.buildingId;
  if (input.floorNo !== undefined) data.floorNo = input.floorNo;
  if (Object.keys(data).length === 0) return { ok: true, id: room.id };
  await db.hotelRoom.update({ where: { id: room.id }, data });
  // เปลี่ยนโหมดเช่า ⇒ เตือน occupancy ที่ยังไม่จบซึ่งขัดกับ rentMode จริงใหม่ (ไม่บล็อก — พนักงานย้ายห้องเอง)
  if (input.rentMode !== undefined) {
    const eff = effectiveRentMode(input.rentMode, room.roomType.rentMode);
    return { ok: true, id: room.id, affected: await affectedOn(ctx.tenantId, input.unitId, room.id, clashOfRentMode(eff)) };
  }
  return { ok: true, id: room.id };
}

/**
 * แม่บ้าน: hkStatus = แหล่งความจริง · แมปกลับ status เดิมของ P1
 *   OUT_OF_ORDER → OOO · DIRTY → CLEANING (ถ้าไม่ได้มีแขกพักอยู่) · CLEAN/INSPECTED → AVAILABLE (ถ้าเดิม CLEANING|OOO)
 */
export async function setHkStatus(ctx: Ctx, input: { unitId: string; roomId: string; hkStatus: HkStatus }): Promise<Res> {
  if (!isHk(input?.hkStatus)) return bad("INVALID_INPUT", "สถานะแม่บ้านไม่ถูกต้อง");
  if (!ctx?.tenantId || !input.unitId || !input.roomId) return bad("NOT_FOUND", "ไม่พบห้อง");
  const db = tenantDb({ tenantId: ctx.tenantId, unitId: input.unitId });
  const room = await db.hotelRoom.findFirst({ where: { id: input.roomId }, select: { id: true, status: true } });
  if (!room) return bad("NOT_FOUND", "ไม่พบห้อง");
  let status = room.status;
  if (input.hkStatus === "OUT_OF_ORDER") status = "OOO";
  else if (input.hkStatus === "DIRTY") status = room.status === "OCCUPIED" ? room.status : "CLEANING";
  else if (room.status === "CLEANING" || room.status === "OOO") status = "AVAILABLE";
  await db.hotelRoom.update({ where: { id: room.id }, data: { hkStatus: input.hkStatus, status } });
  // ปิดซ่อม ⇒ เตือนสัญญา/การจองที่ยังไม่จบของห้องนี้ (ไม่บล็อก)
  if (input.hkStatus === "OUT_OF_ORDER") return { ok: true, id: room.id, affected: await affectedOn(ctx.tenantId, input.unitId, room.id, OOO_CLASH) };
  return { ok: true, id: room.id };
}

export async function setRoomTypeRent(
  ctx: Ctx,
  input: { unitId: string; roomTypeId: string; rentMode: RentMode; monthlyRateSatang?: number | null },
): Promise<Res> {
  if (!isRentMode(input?.rentMode)) return bad("INVALID_INPUT", "โหมดเช่าไม่ถูกต้อง");
  const rate = input.monthlyRateSatang;
  if (rate !== undefined && rate !== null && (!isInt(rate) || rate < 0)) return bad("INVALID_INPUT", "ค่าเช่ารายเดือนต้องเป็นจำนวนเต็มสตางค์ ไม่ติดลบ");
  if (!ctx?.tenantId || !input.unitId || !input.roomTypeId) return bad("NOT_FOUND", "ไม่พบประเภทห้อง");
  const db = tenantDb({ tenantId: ctx.tenantId, unitId: input.unitId });
  const t = await db.hotelRoomType.findFirst({ where: { id: input.roomTypeId }, select: { id: true } });
  if (!t) return bad("NOT_FOUND", "ไม่พบประเภทห้อง");
  await db.hotelRoomType.update({
    where: { id: t.id },
    data: { rentMode: input.rentMode, ...(rate !== undefined ? { monthlyRateSatang: rate } : {}) },
  });
  // R0.9 (carry) ▸ เตือนเสมอ (ไม่มีก็ []) — occupancy ที่ยังไม่จบของห้อง "ที่ตามประเภท" (rentMode ห้อง null) ซึ่งขัดกับโหมดใหม่
  //   ห้อง override ไม่นับ (rentMode จริงไม่เปลี่ยน) · ไม่บล็อก (ประเภทเปลี่ยนจริงแล้ว — พนักงานย้ายห้องเอง)
  const kinds = clashOfRentMode(input.rentMode);
  if (kinds.length === 0) return { ok: true, id: t.id, affected: [] };
  const rows = await db.roomOccupancy.findMany({
    where: { active: true, kind: { in: kinds }, endDate: { gt: ymdToDb(bkkYmd(new Date())) }, room: { roomTypeId: t.id, rentMode: null } },
    orderBy: [{ startDate: "asc" }, { id: "asc" }],
    select: { id: true, roomId: true, kind: true, refType: true, refId: true, startDate: true, endDate: true },
  });
  return { ok: true, id: t.id, affected: rows.map(toAffected) };
}

// ───────────────────────── availability · roomBoard ─────────────────────────
export async function availability(
  ctx: Ctx,
  input: { unitId: string; roomTypeId?: string; start: DateIn; end: DateIn; rentMode: "NIGHTLY" | "MONTHLY" },
): Promise<{ roomId: string; free: boolean }[]> {
  const start = toYmd(input?.start);
  const end = toYmd(input?.end);
  if (!ctx?.tenantId || !input.unitId || !start || !end || end <= start) return [];
  if (input.rentMode !== "NIGHTLY" && input.rentMode !== "MONTHLY") return [];
  const db = tenantDb({ tenantId: ctx.tenantId, unitId: input.unitId });
  const rooms = await db.hotelRoom.findMany({
    where: { active: true, ...(input.roomTypeId ? { roomTypeId: input.roomTypeId } : {}) },
    orderBy: { number: "asc" },
    select: { id: true, status: true, hkStatus: true, rentMode: true, roomType: { select: { rentMode: true } } },
  });
  const fit = rooms.filter((r) => rentModeAccepts(effectiveRentMode(r.rentMode, r.roomType.rentMode), input.rentMode));
  if (fit.length === 0) return [];
  const now = new Date();
  const occ = await db.roomOccupancy.findMany({
    where: { active: true, roomId: { in: fit.map((r) => r.id) }, startDate: { lt: ymdToDb(end) }, endDate: { gt: ymdToDb(start) } },
    select: { roomId: true, kind: true, holdExpiresAt: true },
  });
  const busy = new Set(occ.filter((o) => liveOcc(o, now)).map((o) => o.roomId));
  return fit.map((r) => ({ roomId: r.id, free: !busy.has(r.id) && r.hkStatus !== "OUT_OF_ORDER" && r.status !== "OOO" }));
}

export type RoomUse = "VACANT" | "LEASED" | "GUEST" | "HOLD" | "BLOCKED";
export type RoomBoardCell = {
  roomId: string;
  number: string;
  roomTypeId: string;
  buildingId: string | null;
  floorNo: number | null;
  rentMode: string;
  hkStatus: string;
  use: RoomUse;
  occupancy: null | { occupancyId: string; kind: string; refType: string; refId: string; startDate: string; endDate: string };
  /** R0.9 ▸ การครองถัดไป (active · ไม่ใช่ hold หมดเวลา · เริ่มหลังวันผัง) ตัวแรกตาม startDate — ไม่มีขอบเวลา (ผังตัดสินว่า "จอง" หรือ "ว่าง") */
  next: null | { kind: string; startDate: string };
  finance: null;
};
const USE_OF: Record<string, RoomUse> = { LEASE: "LEASED", STAY: "GUEST", HOLD: "HOLD", CHANNEL_HOLD: "HOLD", BLOCK: "BLOCKED" };

export async function roomBoard(ctx: Ctx, input: { unitId: string; date: DateIn }): Promise<RoomBoardCell[]> {
  const day = toYmd(input?.date);
  if (!ctx?.tenantId || !input.unitId || !day) return [];
  const db = tenantDb({ tenantId: ctx.tenantId, unitId: input.unitId });
  const rooms = await db.hotelRoom.findMany({
    where: { active: true },
    orderBy: { number: "asc" },
    select: { id: true, number: true, roomTypeId: true, buildingId: true, floorNo: true, rentMode: true, hkStatus: true, roomType: { select: { rentMode: true } } },
  });
  if (rooms.length === 0) return [];
  const d = ymdToDb(day);
  const now = new Date();
  const occ = await db.roomOccupancy.findMany({
    where: { active: true, roomId: { in: rooms.map((r) => r.id) }, startDate: { lte: d }, endDate: { gt: d } },
    select: { id: true, roomId: true, kind: true, refType: true, refId: true, startDate: true, endDate: true, holdExpiresAt: true },
  });
  const byRoom = new Map<string, (typeof occ)[number]>();
  for (const o of occ) if (liveOcc(o, now)) byRoom.set(o.roomId, o);
  // ถัดไป: แถวที่เริ่มหลังวันผัง เรียง startDate — ตัวแรกที่ยัง live ต่อห้อง
  const later = await db.roomOccupancy.findMany({
    where: { active: true, roomId: { in: rooms.map((r) => r.id) }, startDate: { gt: d } },
    orderBy: [{ startDate: "asc" }, { id: "asc" }],
    select: { roomId: true, kind: true, startDate: true, holdExpiresAt: true },
  });
  const nextOf = new Map<string, { kind: string; startDate: string }>();
  for (const o of later) if (!nextOf.has(o.roomId) && liveOcc(o, now)) nextOf.set(o.roomId, { kind: o.kind, startDate: dbToYmd(o.startDate) });
  return rooms.map((r) => {
    const o = byRoom.get(r.id);
    return {
      roomId: r.id,
      number: r.number,
      roomTypeId: r.roomTypeId,
      buildingId: r.buildingId,
      floorNo: r.floorNo,
      rentMode: effectiveRentMode(r.rentMode, r.roomType.rentMode),
      hkStatus: r.hkStatus,
      use: o ? (USE_OF[o.kind] ?? "BLOCKED") : "VACANT",
      occupancy: o
        ? { occupancyId: o.id, kind: o.kind, refType: o.refType, refId: o.refId, startDate: dbToYmd(o.startDate), endDate: dbToYmd(o.endDate) }
        : null,
      next: nextOf.get(r.id) ?? null,
      finance: null,
    };
  });
}

// ───────────────────────── occupancyRange (R0.9 · ปฏิทิน/หอ) ─────────────────────────
export type OccupancyRangeRow = { occupancyId: string; roomId: string; kind: string; refType: string; refId: string; startDate: string; endDate: string };
const RANGE_MAX_DAYS = 400;

/**
 * occupancy active ที่ซ้อนช่วง [start,end) ของหน่วย (X1: tenantDb ผูก tenant+unit · ห้อง/หน่วยของคนอื่น ⇒ [])
 * hold หมดเวลาไม่นับ (กติกา liveOcc) · ช่วงผิด/ไม่ส่ง/end<=start/เกิน 400 วัน ⇒ [] ไม่ throw · เรียง startDate แล้วเลขห้อง
 */
export async function occupancyRange(
  ctx: Ctx,
  input: { unitId: string; start: DateIn; end: DateIn; roomId?: string },
): Promise<OccupancyRangeRow[]> {
  const start = toYmd(input?.start);
  const end = toYmd(input?.end);
  if (!ctx?.tenantId || !input?.unitId || !start || !end || end <= start) return [];
  const s = ymdToDb(start);
  const e = ymdToDb(end);
  if ((e.getTime() - s.getTime()) / 86_400_000 > RANGE_MAX_DAYS) return [];
  if (input.roomId !== undefined && (typeof input.roomId !== "string" || !input.roomId)) return [];
  const now = new Date();
  const rows = await tenantDb({ tenantId: ctx.tenantId, unitId: input.unitId }).roomOccupancy.findMany({
    where: { active: true, startDate: { lt: e }, endDate: { gt: s }, ...(input.roomId ? { roomId: input.roomId } : {}) },
    orderBy: [{ startDate: "asc" }, { id: "asc" }],
    select: { id: true, roomId: true, kind: true, refType: true, refId: true, startDate: true, endDate: true, holdExpiresAt: true, room: { select: { number: true } } },
  });
  return rows
    .filter((o) => liveOcc(o, now))
    .map((o) => ({ row: o, sd: dbToYmd(o.startDate) }))
    .sort((a, b) => (a.sd < b.sd ? -1 : a.sd > b.sd ? 1 : a.row.room.number.localeCompare(b.row.room.number, "th", { numeric: true })))
    .map(({ row: o, sd }) => ({ occupancyId: o.id, roomId: o.roomId, kind: o.kind, refType: o.refType, refId: o.refId, startDate: sd, endDate: dbToYmd(o.endDate) }));
}

// ───────────────────────── backfill การจองโรงแรมเดิม (ก่อน R0.8 ไม่มี occupancy) ─────────────────────────
const HOTEL_REF = "HotelReservation";
const ACTIVE_RV = ["BOOKED", "CHECKED_IN"] as const;
type Rv = { id: string; unitId: string; roomTypeId: string; roomId: string | null; checkInDate: Date; checkOutDate: Date };

/** เลือกห้องว่างของประเภท — กติกาเดียวกับ hotel.createReservation (active · ไม่ OOO/OUT_OF_ORDER · NIGHTLY|BOTH · ไม่ถูกถือ) */
async function freeRoomsOfType(tx: Tx, tenantId: string, rv: Rv): Promise<string[]> {
  const rooms = await tx.hotelRoom.findMany({
    where: { tenantId, unitId: rv.unitId, roomTypeId: rv.roomTypeId, active: true, status: { not: "OOO" }, hkStatus: { not: "OUT_OF_ORDER" } },
    orderBy: { number: "asc" },
    select: { id: true, rentMode: true, roomType: { select: { rentMode: true } } },
  });
  const ids = rooms.filter((r) => rentModeAccepts(effectiveRentMode(r.rentMode, r.roomType.rentMode), "NIGHTLY")).map((r) => r.id);
  if (ids.length === 0) return [];
  const now = new Date();
  const occ = await tx.roomOccupancy.findMany({
    where: { tenantId, roomId: { in: ids }, active: true, startDate: { lt: rv.checkOutDate }, endDate: { gt: rv.checkInDate } },
    select: { roomId: true, kind: true, holdExpiresAt: true },
  });
  const legacy = await tx.hotelReservation.findMany({
    where: { tenantId, unitId: rv.unitId, id: { not: rv.id }, roomId: { in: ids }, status: { in: [...ACTIVE_RV] }, checkInDate: { lt: rv.checkOutDate }, checkOutDate: { gt: rv.checkInDate } },
    select: { roomId: true },
  });
  const taken = new Set<string>([...occ.filter((o) => liveOcc(o, now)).map((o) => o.roomId), ...legacy.map((l) => l.roomId ?? "")]);
  return ids.filter((id) => !taken.has(id));
}

type Outcome = { r: "created" | "conflict" | "skip"; roomId?: string };
type Span = { roomId: string; s: number; e: number };

/**
 * ทำ 1 การจองใน tx · lock=false (dry-run) = ไม่ล็อกประเภทห้อง (FOR UPDATE) · simulated = ห้อง/ช่วงที่ dry-run รายการก่อนหน้า "จะได้"
 * (แต่ละรายการ dry-run ย้อนทิ้งทันที ⇒ ต้องจำไว้เองเพื่อให้รายการถัดไปไม่เลือกห้องเดียวกัน)
 */
async function backfillOne(tx: Tx, tenantId: string, rv: Rv, opts: { lock: boolean; simulated: Span[] }): Promise<Outcome> {
  // อ่านซ้ำใน tx: ยัง active และยังไม่มี occupancy (กันรันซ้อน/รันซ้ำ)
  const cur = await tx.hotelReservation.findFirst({ where: { id: rv.id, tenantId, status: { in: [...ACTIVE_RV] } }, select: { id: true } });
  if (!cur) return { r: "skip" };
  const has = await tx.roomOccupancy.count({ where: { tenantId, refType: HOTEL_REF, refId: rv.id, active: true } });
  if (has > 0) return { r: "skip" };
  const s = rv.checkInDate.getTime();
  const e = rv.checkOutDate.getTime();
  const simTaken = (roomId: string) => opts.simulated.some((x) => x.roomId === roomId && x.s < e && x.e > s);
  const base = { tenantId, unitId: rv.unitId, start: dbToYmd(rv.checkInDate), end: dbToYmd(rv.checkOutDate), kind: "STAY" as const, refType: HOTEL_REF, refId: rv.id };
  if (rv.roomId) {
    if (simTaken(rv.roomId)) return { r: "conflict" };
    const r = await claimRoom(tx, { ...base, roomId: rv.roomId });
    return r.ok ? { r: "created", roomId: rv.roomId } : { r: "conflict" };
  }
  // ลำดับล็อกเดียวกับโรงแรม: ประเภทห้องก่อน แล้วค่อยห้อง (dry-run ไม่ล็อก)
  if (opts.lock) await tx.$queryRaw`SELECT id FROM "HotelRoomType" WHERE id = ${rv.roomTypeId} FOR UPDATE`;
  for (const roomId of await freeRoomsOfType(tx, tenantId, rv)) {
    if (simTaken(roomId)) continue;
    const r = await claimRoom(tx, { ...base, roomId, requireRentMode: "NIGHTLY" });
    if (r.ok) return { r: "created", roomId };
    if (r.code !== "ROOM_TAKEN") break;
  }
  return { r: "conflict" };
}

class DryRunRollback extends Error {
  constructor(readonly outcome: Outcome) {
    super("dry-run rollback");
  }
}

/**
 * เติม occupancy ให้การจองโรงแรม BOOKED/CHECKED_IN ที่ยังไม่จบ (checkOutDate > วันนี้ไทย) และยังไม่มี occupancy
 * ทำแบบมี roomId ก่อน แล้วค่อยแบบไม่มี (เลือกห้องว่างของประเภท) · ชน ⇒ conflicts (ไม่ throw · รายการอื่นทำต่อ)
 * ทั้งสองโหมด tx สั้นต่อการจอง:
 *   dryRun — แต่ละรายการทำใน tx แล้ว rollback ทันที (ไม่ FOR UPDATE · ไม่มีอะไรถูกเขียน) · created = 0
 *   apply  — แต่ละรายการ commit ของตัวเอง · รันซ้ำ = created 0
 */
export async function backfillHotelOccupancy(input: {
  tenantId: string;
  dryRun: boolean;
}): Promise<{ scanned: number; toCreate: number; created: number; conflicts: { reservationId: string }[] }> {
  const tenantId = input?.tenantId;
  if (!tenantId) throw new Error("backfillHotelOccupancy: ต้องระบุ tenantId");
  const dryRun = input.dryRun !== false;
  const today = ymdToDb(bkkYmd(new Date()));

  const { scanned, list } = await withRoomTx(async (tx) => {
    const rows = await tx.hotelReservation.findMany({
      where: { tenantId, status: { in: [...ACTIVE_RV] }, checkOutDate: { gt: today } },
      orderBy: [{ checkInDate: "asc" }, { createdAt: "asc" }],
      select: { id: true, unitId: true, roomTypeId: true, roomId: true, checkInDate: true, checkOutDate: true },
    });
    const withOcc = new Set(
      (await tx.roomOccupancy.findMany({ where: { tenantId, refType: HOTEL_REF, refId: { in: rows.map((r) => r.id) }, active: true }, select: { refId: true } })).map((o) => o.refId),
    );
    const need = rows.filter((r) => !withOcc.has(r.id));
    // มีห้องก่อน แล้วค่อยไม่มีห้อง (ห้องที่ระบุไว้แล้วต้องได้ก่อนการเลือกห้องอัตโนมัติจะไปทับ)
    return { scanned: rows.length, list: [...need.filter((r) => r.roomId), ...need.filter((r) => !r.roomId)] };
  });

  let toCreate = 0;
  let created = 0;
  const conflicts: { reservationId: string }[] = [];
  const simulated: Span[] = [];
  for (const rv of list) {
    let out: Outcome;
    if (dryRun) {
      try {
        await withRoomTx(async (tx) => {
          throw new DryRunRollback(await backfillOne(tx, tenantId, rv, { lock: false, simulated }));
        });
        out = { r: "skip" };
      } catch (e) {
        if (!(e instanceof DryRunRollback)) throw e;
        out = e.outcome;
      }
      if (out.r === "created" && out.roomId) simulated.push({ roomId: out.roomId, s: rv.checkInDate.getTime(), e: rv.checkOutDate.getTime() });
    } else {
      out = await withRoomTx((tx) => backfillOne(tx, tenantId, rv, { lock: true, simulated }));
    }
    if (out.r === "created") {
      toCreate++;
      if (!dryRun) created++;
    } else if (out.r === "conflict") conflicts.push({ reservationId: rv.id });
  }
  return { scanned, toCreate, created, conflicts };
}
