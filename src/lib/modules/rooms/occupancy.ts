// SVC R0.8 ▸ แกนห้อง — การครองห้อง (RoomOccupancy) กันจองซ้อนข้ามหอ/เคาน์เตอร์/ออนไลน์
//   สัญญา: ledger/svc-briefs/svc-brief-r0.8.md §2–§3 · ledger/SVC-CORE-CONTRACT.md §5 · ledger/wo-notes/svc-r0.8-carry.md
//
// 🔴 ไฟล์เดียวในโมดูล rooms ที่ import `prisma` ดิบได้ (fitness F5 baseline +1 · เหตุผล: `expireHolds` ไล่ hold ที่หมดเวลา
//    "ข้ามร้าน" จาก minute-job ก่อนรู้ tenant · และ `withRoomTx` เปิดธุรกรรมให้ service.ts โดยไม่ต้องลาก prisma เข้าไฟล์อื่น)
//
// กติกา
//   • วันที่: "YYYY-MM-DD" = วันไทย · Date = เวลาจริง ⇒ แปลงเป็นวันไทยด้วย bkkYmd · เก็บ @db.Date = เที่ยงคืน UTC ของวันนั้น
//     endDate ไม่รวมวันจบ [start,end) — สัญญาถึง 31 ม.ค. เก็บ 1 ก.พ. (exclusiveEnd)
//   • ขอบเขต (X1): อ่านห้องใน tx เดียวกันด้วย where { id, tenantId, unitId } ก่อนเขียน · ห้าม nested connect (ใช้ roomId scalar)
//   • ชนกัน: EXCLUDE ของฐาน ("RoomOccupancy_no_overlap") เป็นตัวตัดสิน — 23P01 ⇒ ROOM_TAKEN · CHECK 23514 ⇒ INVALID_RANGE
//     ทุกคำสั่งเขียนครอบ SAVEPOINT ⇒ ได้ ok:false แล้ว tx ของผู้เรียกยังใช้ต่อ/commit ได้ · ไม่ throw ออกไปเมื่อชน
//   • conflict = { kind, refType } เท่านั้น (ไม่บอก refId/occupancyId/ชื่อ ของคนอื่น)
//   • event `rooms.occupancy.changed` ทุกการเปลี่ยนที่สำเร็จ ผ่าน emitOutbox ใน tx เดียวกัน · payload ตรง 4 คีย์ { unitId, roomId, from, to }
//   • ลำดับล็อก: ผู้เรียกที่ต้องล็อกประเภทห้อง (โรงแรม) ล็อกประเภทก่อน แล้วค่อยแตะแถวห้อง/occupancy — ไฟล์นี้ไม่ล็อกประเภทเอง
import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/core/db";
import { emitOutbox, emitOutboxMany } from "@/lib/core/outbox";
import { bkkYmd } from "@/lib/core/quiet-hours";

export type Tx = Prisma.TransactionClient;
export type DateIn = string | Date;
export const OCC_KINDS = ["LEASE", "STAY", "HOLD", "BLOCK", "CHANNEL_HOLD"] as const;
export type OccKind = (typeof OCC_KINDS)[number];
export const HOLD_KINDS: readonly string[] = ["HOLD", "CHANNEL_HOLD"];
export const OCC_EVENT = "rooms.occupancy.changed";

export type Conflict = { kind: string; refType: string };
export type Fail<C extends string> = { ok: false; code: C; message?: string; conflict?: Conflict };

// ───────────────────────── วันที่ ─────────────────────────
const YMD_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_MS = 86_400_000;

/** "YYYY-MM-DD" ที่เป็นวันจริง (ไม่ใช่ 2031-02-30) */
export function isYmd(s: string): boolean {
  const m = YMD_RE.exec(s);
  if (!m) return false;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.getUTCFullYear() === Number(m[1]) && d.getUTCMonth() === Number(m[2]) - 1 && d.getUTCDate() === Number(m[3]);
}

/** วันที่เข้า ⇒ วันไทย "YYYY-MM-DD" · ผิดรูป = null */
export function toYmd(d: DateIn | null | undefined): string | null {
  if (d instanceof Date) return Number.isNaN(d.getTime()) ? null : bkkYmd(d);
  if (typeof d === "string") return isYmd(d) ? d : null;
  return null;
}

/** วันไทย ⇒ ค่าที่เก็บใน @db.Date (เที่ยงคืน UTC ของวันนั้น · เหมือน hotel.parseDate) */
export function ymdToDb(ymd: string): Date {
  return new Date(`${ymd}T00:00:00.000Z`);
}

/** ค่าจาก @db.Date (เที่ยงคืน UTC) ⇒ "YYYY-MM-DD" — ใช้กับค่าที่อ่านจากฐานเท่านั้น (ไม่ใช่ Date ของผู้ใช้) */
export function dbToYmd(d: Date | string): string {
  if (typeof d === "string") return d.slice(0, 10);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + 1;
  const day = d.getUTCDate();
  return `${y}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function addDaysYmd(ymd: string, n: number): string {
  return dbToYmd(new Date(ymdToDb(ymd).getTime() + n * DAY_MS));
}

/** วันสุดท้าย (รวม) ⇒ endDate แบบไม่รวม: "2031-01-31" ⇒ "2031-02-01" */
export function exclusiveEnd(lastDayYmd: string): string {
  if (!isYmd(lastDayYmd)) throw new Error("exclusiveEnd: วันที่ต้องเป็น YYYY-MM-DD");
  return addDaysYmd(lastDayYmd, 1);
}

// ───────────────────────── รหัส error ของ Postgres ─────────────────────────
/** เดินสาย error (Prisma → driver adapter → pg) หา SQLSTATE */
export function pgCodeOf(e: unknown): string | null {
  let cur: unknown = e;
  for (let d = 0; d < 6 && cur && typeof cur === "object"; d++) {
    const o = cur as { code?: unknown; originalCode?: unknown; message?: unknown; cause?: unknown; meta?: unknown };
    for (const c of [o.originalCode, o.code]) if (c === "23P01" || c === "23514") return c;
    const meta = o.meta && typeof o.meta === "object" ? (o.meta as { driverAdapterError?: unknown; code?: unknown }) : null;
    if (meta?.code === "23P01" || meta?.code === "23514") return meta.code;
    if (typeof o.message === "string") {
      if (/RoomOccupancy_no_overlap|violates exclusion constraint/i.test(o.message)) return "23P01";
      if (/RoomOccupancy_dates_check/i.test(o.message)) return "23514";
    }
    cur = o.cause ?? meta?.driverAdapterError;
  }
  return null;
}

/** ทำ fn ใต้ SAVEPOINT — ล้ม = ย้อนเฉพาะส่วนนี้ (tx ผู้เรียกยังใช้ต่อได้) แล้วคืน error ให้ผู้เรียกแปลง */
async function underSavepoint<T>(tx: Tx, fn: () => Promise<T>): Promise<{ ok: true; value: T } | { ok: false; error: unknown }> {
  await tx.$executeRaw`SAVEPOINT rooms_occ`;
  try {
    const value = await fn();
    await tx.$executeRaw`RELEASE SAVEPOINT rooms_occ`;
    return { ok: true, value };
  } catch (error) {
    // ย้อนเฉพาะส่วนนี้ แล้วปล่อย savepoint ทิ้ง (ไม่ให้ค้างซ้อนใน tx ของผู้เรียก)
    await tx.$executeRaw`ROLLBACK TO SAVEPOINT rooms_occ`;
    await tx.$executeRaw`RELEASE SAVEPOINT rooms_occ`;
    return { ok: false, error };
  }
}

// ───────────────────────── event ─────────────────────────
type OccRange = { tenantId: string; unitId: string; roomId: string; from: string; to: string };

function eventOf(r: OccRange, occupancyId: string, op: string) {
  return {
    tenantId: r.tenantId,
    unitId: r.unitId,
    type: OCC_EVENT,
    // ไม่ซ้ำต่อการเปลี่ยน (resize 2 ครั้ง = 2 event · ปล่อยแล้วเปิดคืนแล้วปล่อยอีก = event ใหม่)
    idempotencyKey: `${OCC_EVENT}#${occupancyId}#${op}#${randomUUID()}`,
    payload: { unitId: r.unitId, roomId: r.roomId, from: r.from, to: r.to },
  };
}
async function emitChanged(tx: Tx, r: OccRange, occupancyId: string, op: string): Promise<void> {
  await emitOutbox(tx, eventOf(r, occupancyId, op));
}

// ───────────────────────── ตัวช่วยภายใน ─────────────────────────
type RoomRow = { id: string; active: boolean; hkStatus: string; rentMode: string | null; roomType: { rentMode: string } };

/** X1: ห้องต้องเป็นของ tenant+unit ของผู้เรียก (อ่านใน tx เดียวกัน) */
async function roomInScope(tx: Tx, tenantId: string, unitId: string, roomId: string): Promise<RoomRow | null> {
  if (!roomId) return null;
  return tx.hotelRoom.findFirst({
    where: { id: roomId, tenantId, unitId },
    select: { id: true, active: true, hkStatus: true, rentMode: true, roomType: { select: { rentMode: true } } },
  });
}

/** ห้องรับโหมดเช่านี้ไหม — rentMode จริง = ของห้อง ?? ของประเภท · NIGHTLY รับ NIGHTLY|BOTH · MONTHLY รับ MONTHLY|BOTH */
export function roomAcceptsRentMode(room: { rentMode: string | null; roomType: { rentMode: string } }, wanted: "NIGHTLY" | "MONTHLY"): boolean {
  const m = room.rentMode ?? room.roomType.rentMode;
  return m === wanted || m === "BOTH";
}

/**
 * ปิด HOLD/CHANNEL_HOLD ที่หมดเวลาแล้วแต่ยัง active ซึ่งซ้อนช่วงบนห้องนี้ (ใน tx เดียวกัน · ก่อนเขียนแถวใหม่)
 * คืนแถวที่ "ตัวเอง" ปิดได้ (เงื่อนไข active ใน UPDATE ⇒ ปิดครั้งเดียว) ให้ผู้เรียกยิง event หลังสำเร็จ
 */
async function closeExpiredHoldsOn(tx: Tx, roomId: string, start: string, end: string, now: Date, exceptId?: string): Promise<ClosedRow[]> {
  return tx.$queryRaw<ClosedRow[]>`
    UPDATE "RoomOccupancy" SET "active" = false, "updatedAt" = now()
    WHERE "roomId" = ${roomId} AND "active" = true AND "kind" IN ('HOLD', 'CHANNEL_HOLD')
      AND "holdExpiresAt" IS NOT NULL AND "holdExpiresAt" <= ${now}
      AND "startDate" < ${end}::date AND "endDate" > ${start}::date
      AND "id" <> ${exceptId ?? ""}
    RETURNING "id", "tenantId", "unitId", "roomId", "startDate", "endDate"`;
}
type ClosedRow = { id: string; tenantId: string; unitId: string; roomId: string; startDate: Date | string; endDate: Date | string };

/** event ของแถวที่ปิด — คำสั่งเดียว (createMany) ไม่ว่ากี่แถว */
async function emitClosed(tx: Tx, rows: ClosedRow[], op: string): Promise<void> {
  await emitOutboxMany(
    tx,
    rows.map((r) => eventOf({ tenantId: r.tenantId, unitId: r.unitId, roomId: r.roomId, from: dbToYmd(r.startDate), to: dbToYmd(r.endDate) }, r.id, op)),
  );
}

/** ใครถือห้องช่วงนี้อยู่ — บอกแค่ kind/refType (ไม่บอก ref ของคนอื่น) */
async function conflictOn(tx: Tx, roomId: string, start: string, end: string, now: Date, exceptId?: string): Promise<Conflict | undefined> {
  const rows = await tx.roomOccupancy.findMany({
    where: {
      roomId,
      active: true,
      startDate: { lt: ymdToDb(end) },
      endDate: { gt: ymdToDb(start) },
      ...(exceptId ? { id: { not: exceptId } } : {}),
    },
    select: { kind: true, refType: true, holdExpiresAt: true },
    take: 5,
  });
  const live = rows.find((r) => !(HOLD_KINDS.includes(r.kind) && r.holdExpiresAt && r.holdExpiresAt <= now)) ?? rows[0];
  return live ? { kind: live.kind, refType: live.refType } : undefined;
}

const MSG = {
  ROOM_TAKEN: "ห้องนี้ถูกใช้ในช่วงเวลานี้แล้ว",
  ROOM_NOT_FOUND: "ไม่พบห้อง",
  ROOM_INACTIVE: "ห้องนี้ปิดใช้งานอยู่",
  INVALID_RANGE: "ช่วงวันที่ไม่ถูกต้อง (วันจบต้องหลังวันเริ่ม)",
  INVALID_INPUT: "ข้อมูลไม่ครบหรือไม่ถูกต้อง",
  NOT_FOUND: "ไม่พบรายการครองห้อง",
  INACTIVE: "รายการครองห้องนี้ถูกปล่อยแล้ว",
  RENT_MODE_MISMATCH: "ห้องนี้ไม่ได้เปิดให้เช่าแบบนี้ (รายคืน/รายเดือน)",
} as const;

// ───────────────────────── claimRoom ─────────────────────────
export type ClaimInput = {
  tenantId: string;
  unitId: string;
  roomId: string;
  start: DateIn;
  end: DateIn;
  kind: OccKind;
  refType: string;
  refId: string;
  holdExpiresAt?: Date | null;
  /** ตรวจโหมดเช่าของห้อง (rentMode จริง) — ไม่ตรง ⇒ RENT_MODE_MISMATCH · ไม่ส่ง = ไม่ตรวจ */
  requireRentMode?: "NIGHTLY" | "MONTHLY";
};
export type ClaimResult =
  | { ok: true; occupancyId: string }
  | Fail<"ROOM_TAKEN" | "ROOM_NOT_FOUND" | "UNIT_MISMATCH" | "ROOM_INACTIVE" | "INVALID_RANGE" | "INVALID_INPUT" | "RENT_MODE_MISMATCH">;

export async function claimRoom(tx: Tx, input: ClaimInput): Promise<ClaimResult> {
  const kind = String(input.kind ?? "");
  const refType = typeof input.refType === "string" ? input.refType.trim() : "";
  const refId = typeof input.refId === "string" ? input.refId.trim() : "";
  if (!input.tenantId || !input.unitId || !(OCC_KINDS as readonly string[]).includes(kind) || !refType || !refId) {
    return { ok: false, code: "INVALID_INPUT", message: MSG.INVALID_INPUT };
  }
  const hold = input.holdExpiresAt instanceof Date && !Number.isNaN(input.holdExpiresAt.getTime()) ? input.holdExpiresAt : null;
  if (HOLD_KINDS.includes(kind) && !hold) return { ok: false, code: "INVALID_INPUT", message: "การกันห้องชั่วคราวต้องมีเวลาหมดอายุ" };
  const start = toYmd(input.start);
  const end = toYmd(input.end);
  if (!start || !end || end <= start) return { ok: false, code: "INVALID_RANGE", message: MSG.INVALID_RANGE };

  const room = await roomInScope(tx, input.tenantId, input.unitId, input.roomId);
  if (!room) return { ok: false, code: "ROOM_NOT_FOUND", message: MSG.ROOM_NOT_FOUND };
  if (!room.active) return { ok: false, code: "ROOM_INACTIVE", message: MSG.ROOM_INACTIVE };
  // ห้องปิดซ่อม (hkStatus OUT_OF_ORDER) ⇒ เช่า/เข้าพัก/กันห้องไม่ได้ (LEASE/STAY/HOLD/CHANNEL_HOLD) — BLOCK ได้ (ใช้ปิดซ่อมเอง · ใบ §8 ข้อ 8)
  if (kind !== "BLOCK" && room.hkStatus === "OUT_OF_ORDER") return { ok: false, code: "ROOM_INACTIVE", message: "ห้องนี้ปิดซ่อมอยู่" };
  if (input.requireRentMode !== undefined) {
    if (input.requireRentMode !== "NIGHTLY" && input.requireRentMode !== "MONTHLY") return { ok: false, code: "INVALID_INPUT", message: MSG.INVALID_INPUT };
    if (!roomAcceptsRentMode(room, input.requireRentMode)) return { ok: false, code: "RENT_MODE_MISMATCH", message: MSG.RENT_MODE_MISMATCH };
  }

  const now = new Date();
  const res = await underSavepoint(tx, async () => {
    const closed = await closeExpiredHoldsOn(tx, room.id, start, end, now);
    const row = await tx.roomOccupancy.create({
      data: {
        tenantId: input.tenantId,
        unitId: input.unitId,
        roomId: room.id,
        startDate: ymdToDb(start),
        endDate: ymdToDb(end),
        kind,
        refType,
        refId,
        active: true,
        holdExpiresAt: hold,
      },
      select: { id: true },
    });
    return { id: row.id, closed };
  });
  if (!res.ok) {
    const code = pgCodeOf(res.error);
    if (code === "23P01") return { ok: false, code: "ROOM_TAKEN", message: MSG.ROOM_TAKEN, conflict: await conflictOn(tx, room.id, start, end, now) };
    if (code === "23514") return { ok: false, code: "INVALID_RANGE", message: MSG.INVALID_RANGE };
    throw res.error;
  }
  await emitClosed(tx, res.value.closed, "expire");
  await emitChanged(tx, { tenantId: input.tenantId, unitId: input.unitId, roomId: room.id, from: start, to: end }, res.value.id, "claim");
  return { ok: true, occupancyId: res.value.id };
}

// ───────────────────────── release / move / resize ─────────────────────────
type OccRow = { id: string; tenantId: string; unitId: string; roomId: string; startDate: Date; endDate: Date; active: boolean };

/** X1: occupancy ต้องตรง tenant+unit ของผู้เรียก — ไม่ตรง = เหมือนไม่มี */
async function occInScope(tx: Tx, tenantId: string, unitId: string, occupancyId: string): Promise<OccRow | null> {
  if (!tenantId || !unitId || !occupancyId) return null;
  return tx.roomOccupancy.findFirst({
    where: { id: occupancyId, tenantId, unitId },
    select: { id: true, tenantId: true, unitId: true, roomId: true, startDate: true, endDate: true, active: true },
  });
}

export async function releaseOccupancy(
  tx: Tx,
  input: { tenantId: string; unitId: string; occupancyId: string; reason: string },
): Promise<{ ok: true; noop?: boolean } | Fail<"NOT_FOUND">> {
  const occ = await occInScope(tx, input.tenantId, input.unitId, input.occupancyId);
  if (!occ) return { ok: false, code: "NOT_FOUND", message: MSG.NOT_FOUND };
  if (!occ.active) return { ok: true, noop: true };
  // เงื่อนไข active ใน UPDATE ⇒ ปล่อยพร้อมกัน 2 ทาง = ปิดครั้งเดียว event ครั้งเดียว
  const upd = await tx.roomOccupancy.updateMany({ where: { id: occ.id, tenantId: input.tenantId, unitId: input.unitId, active: true }, data: { active: false } });
  if (upd.count === 0) return { ok: true, noop: true };
  await emitChanged(tx, { tenantId: occ.tenantId, unitId: occ.unitId, roomId: occ.roomId, from: dbToYmd(occ.startDate), to: dbToYmd(occ.endDate) }, occ.id, "release");
  return { ok: true };
}

export async function moveOccupancy(
  tx: Tx,
  input: { tenantId: string; unitId: string; occupancyId: string; toRoomId: string },
): Promise<{ ok: true } | Fail<"NOT_FOUND" | "INACTIVE" | "ROOM_NOT_FOUND" | "UNIT_MISMATCH" | "ROOM_INACTIVE" | "ROOM_TAKEN">> {
  const occ = await occInScope(tx, input.tenantId, input.unitId, input.occupancyId);
  if (!occ) return { ok: false, code: "NOT_FOUND", message: MSG.NOT_FOUND };
  if (!occ.active) return { ok: false, code: "INACTIVE", message: MSG.INACTIVE };
  const room = await roomInScope(tx, input.tenantId, input.unitId, input.toRoomId);
  if (!room) return { ok: false, code: "ROOM_NOT_FOUND", message: MSG.ROOM_NOT_FOUND };
  if (!room.active) return { ok: false, code: "ROOM_INACTIVE", message: MSG.ROOM_INACTIVE };
  if (room.id === occ.roomId) return { ok: true };

  const from = dbToYmd(occ.startDate);
  const to = dbToYmd(occ.endDate);
  const now = new Date();
  const res = await underSavepoint(tx, async () => {
    const closed = await closeExpiredHoldsOn(tx, room.id, from, to, now, occ.id);
    const upd = await tx.roomOccupancy.updateMany({ where: { id: occ.id, tenantId: input.tenantId, unitId: input.unitId, active: true }, data: { roomId: room.id } });
    return { closed, count: upd.count };
  });
  if (!res.ok) {
    if (pgCodeOf(res.error) === "23P01") return { ok: false, code: "ROOM_TAKEN", message: MSG.ROOM_TAKEN, conflict: await conflictOn(tx, room.id, from, to, now, occ.id) };
    throw res.error;
  }
  if (res.value.count === 0) return { ok: false, code: "INACTIVE", message: MSG.INACTIVE };
  await emitClosed(tx, res.value.closed, "expire");
  await emitChanged(tx, { tenantId: occ.tenantId, unitId: occ.unitId, roomId: occ.roomId, from, to }, occ.id, "move-out");
  await emitChanged(tx, { tenantId: occ.tenantId, unitId: occ.unitId, roomId: room.id, from, to }, occ.id, "move-in");
  return { ok: true };
}

export async function resizeOccupancy(
  tx: Tx,
  input: { tenantId: string; unitId: string; occupancyId: string; start?: DateIn; end?: DateIn },
): Promise<{ ok: true } | Fail<"NOT_FOUND" | "INACTIVE" | "INVALID_RANGE" | "ROOM_TAKEN">> {
  const occ = await occInScope(tx, input.tenantId, input.unitId, input.occupancyId);
  if (!occ) return { ok: false, code: "NOT_FOUND", message: MSG.NOT_FOUND };
  if (!occ.active) return { ok: false, code: "INACTIVE", message: MSG.INACTIVE };
  const oldFrom = dbToYmd(occ.startDate);
  const oldTo = dbToYmd(occ.endDate);
  const start = input.start === undefined ? oldFrom : toYmd(input.start);
  const end = input.end === undefined ? oldTo : toYmd(input.end);
  if (!start || !end || end <= start) return { ok: false, code: "INVALID_RANGE", message: MSG.INVALID_RANGE };
  if (start === oldFrom && end === oldTo) return { ok: true };

  const now = new Date();
  const res = await underSavepoint(tx, async () => {
    const closed = await closeExpiredHoldsOn(tx, occ.roomId, start, end, now, occ.id);
    const upd = await tx.roomOccupancy.updateMany({
      where: { id: occ.id, tenantId: input.tenantId, unitId: input.unitId, active: true },
      data: { startDate: ymdToDb(start), endDate: ymdToDb(end) },
    });
    return { closed, count: upd.count };
  });
  if (!res.ok) {
    const code = pgCodeOf(res.error);
    if (code === "23P01") return { ok: false, code: "ROOM_TAKEN", message: MSG.ROOM_TAKEN, conflict: await conflictOn(tx, occ.roomId, start, end, now, occ.id) };
    if (code === "23514") return { ok: false, code: "INVALID_RANGE", message: MSG.INVALID_RANGE };
    throw res.error;
  }
  if (res.value.count === 0) return { ok: false, code: "INACTIVE", message: MSG.INACTIVE };
  await emitClosed(tx, res.value.closed, "expire");
  // ช่วง union เดิม ∪ ใหม่ (event เดียว) — ผู้ฟังคำนวณช่วงที่กระทบใหม่ทั้งช่วง
  await emitChanged(
    tx,
    { tenantId: occ.tenantId, unitId: occ.unitId, roomId: occ.roomId, from: start < oldFrom ? start : oldFrom, to: end > oldTo ? end : oldTo },
    occ.id,
    "resize",
  );
  return { ok: true };
}

// ───────────────────────── expireHolds (minute-job · ข้ามร้าน) ─────────────────────────
const EXPIRE_BATCH = 50;
const EXPIRE_MAX_BATCHES = 40;
const EXPIRE_TX = { maxWait: 5_000, timeout: 10_000 } as const;

/**
 * HOLD/CHANNEL_HOLD ที่ active และ holdExpiresAt <= now ⇒ active=false (+ event ต่อแถว ใน tx เดียวกัน)
 * ไม่แตะ LEASE/STAY/BLOCK แม้มี holdExpiresAt
 * X5: เรียกซ้อนพร้อมกัน — FOR UPDATE SKIP LOCKED + เงื่อนไข active ใน UPDATE ⇒ แต่ละแถวปิดครั้งเดียว event ครั้งเดียว
 */
export async function expireHolds(now: Date): Promise<{ expired: number }> {
  const at = now instanceof Date && !Number.isNaN(now.getTime()) ? now : new Date();
  let expired = 0;
  for (let b = 0; b < EXPIRE_MAX_BATCHES; b++) {
    const n = await prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<ClosedRow[]>`
        UPDATE "RoomOccupancy" o SET "active" = false, "updatedAt" = now()
        WHERE o."id" IN (
          SELECT "id" FROM "RoomOccupancy"
          WHERE "active" = true AND "kind" IN ('HOLD', 'CHANNEL_HOLD') AND "holdExpiresAt" IS NOT NULL AND "holdExpiresAt" <= ${at}
          ORDER BY "holdExpiresAt" ASC
          LIMIT ${EXPIRE_BATCH}
          FOR UPDATE SKIP LOCKED
        ) AND o."active" = true
        RETURNING o."id", o."tenantId", o."unitId", o."roomId", o."startDate", o."endDate"`;
      await emitClosed(tx, rows, "expire");
      return rows.length;
    }, EXPIRE_TX);
    expired += n;
    if (n < EXPIRE_BATCH) break;
  }
  return { expired };
}

// ───────────────────────── ธุรกรรมให้ service.ts (ไม่ export ออก facade) ─────────────────────────
/** เปิด interactive tx ให้ service.ts ของโมดูลนี้ (ไฟล์นั้นห้าม import prisma ดิบ) */
export function withRoomTx<T>(fn: (tx: Tx) => Promise<T>, opts?: { timeoutMs?: number }): Promise<T> {
  return prisma.$transaction(fn, { maxWait: 10_000, timeout: opts?.timeoutMs ?? 15_000 });
}
