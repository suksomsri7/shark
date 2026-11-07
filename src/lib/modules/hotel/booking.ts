// SVC H.3 ▸ จองโรงแรม V2 ฝั่งเซิร์ฟเวอร์ (ใบสั่ง ledger/svc-briefs/svc-brief-h.3.md §0 §2 §3 §5 §11 · สเปก S §7.2 §7.3 §7.5 §7.8 §11)
//   • ทุกฟังก์ชันรับ (actor, ctx {tenantId}, input {unitId, …}) · ด่าน: หน่วย HOTEL ของร้าน → เข้าหน่วยได้ (ไม่ได้ ⇒ NOT_FOUND) → สิทธิ์ (FORBIDDEN)
//     ล้มเหลวทุกแบบ = { ok:false, code, reason(ไทย) } ไม่ throw · ทุกคิวรีผ่าน tenantDb({tenantId, unitId}) (sweeper อ่าน id ข้ามร้านด้วย SQL ดิบแล้วเขียนผ่าน tenantDb ของร้านนั้น)
//   • กันจองซ้อน 2 ชั้นใน tx เดียว: ชั้นประเภทห้อง = pg_advisory_xact_lock(hashtext(unitId||':'||roomTypeId)) เรียงตาม roomTypeId แล้วนับ
//     availabilityInTx (สูตรเดียวกับ hotelAvailability) · ชั้นห้องจริง = claimRoom/moveOccupancy/resizeOccupancy (EXCLUDE ของฐาน) ผ่าน facade rooms
//   • เงินทุกบาทผ่าน POS: รับมัดจำ moduleTakeDeposit · คืน moduleRefundDeposit · ริบเต็ม moduleForfeitDeposit ·
//     คืนบางส่วน (มติผู้คุม §11 ข้อ 1) = บิลค่าธรรมเนียมยกเลิกจ่ายด้วยแถว DEPOSIT อ้างใบรับ แล้ว moduleRefundDeposit คงเหลือ — ไม่มีการเขียนบัญชีตรง
//   • นโยบายหลังจอง (คืนเงิน · ไม่มา) อ่านจาก policySnapshot ของการจองเท่านั้น
//   • นาฬิกาฉาก (§2 ข้อ 13): input.at ใช้เป็น "เวลาปัจจุบัน" เฉพาะเมื่อ process.env.SVC_QC_CLOCK === "1" (อ่านตอนเรียกทุกครั้ง) · ค่าตั้งยังอ่าน ณ เวลาจริง
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { Prisma, PosPayType } from "@prisma/client";
import { tenantDb } from "@/lib/core/db";
import { callerTx } from "@/lib/core/caller-tx";
import { emitOutbox } from "@/lib/core/outbox";
import { canAccessUnit, evaluate, type MembershipCtx } from "@/lib/core/rbac";
import { bkkYmd } from "@/lib/core/quiet-hours";
import { resolveSettings, snapshotPolicy } from "@/lib/core/settings";
import { claimRoom, moveOccupancy, releaseOccupancy, resizeOccupancy } from "@/lib/modules/rooms";
import * as pos from "@/lib/modules/pos/service";
import { DEPOSIT_PAY_TYPES, moduleForfeitDeposit, moduleRefundDeposit, moduleTakeDeposit } from "@/lib/modules/pos/deposit";
import { systemForUnit } from "@/lib/modules/system/service";
import { normalizePartyPhone, safeFindOrCreate } from "@/lib/modules/party";
import { loadPricingContext } from "./rates";
import { addDaysYmd, dayNumber, depositFor, depositPolicyOf, isYmd, nightDates, quoteStay, refundFor, type CancelRule, type DepositPolicy, type PricingContext, type QuoteOk } from "./pricing";
import { availabilityInTx, isSellableNightly, shortDates } from "./availability";
import { canTransition, holdDeadline, nightsOf } from "./booking-state";

// ───────────────────────── ชนิด ─────────────────────────
export type BookingActor = MembershipCtx & { userId: string };
export type BookingSource = "WEB" | "WALK_IN" | "PHONE" | "LINE" | "OTA";
export type BookingFailCode =
  | "INVALID_INPUT"
  | "NO_RATE"
  | "MIN_NIGHTS"
  | "MAX_NIGHTS"
  | "CLOSED_TO_ARRIVAL"
  | "TOO_FAR"
  | "PAST_DATE"
  | "OVER_OCCUPANCY"
  | "EXTRA_BED_NOT_ALLOWED"
  | "AVAILABILITY_CHANGED"
  | "NOT_FOUND"
  | "FORBIDDEN"
  | "INVALID_STATUS"
  | "HOLD_EXPIRED"
  | "ROOM_BUSY"
  | "ROOM_INACTIVE"
  | "SHORTEN_POSTED"
  | "NOT_SAME_DAY"
  | "NO_POS"
  | "BUSY";
export type BookingFail = { ok: false; code: BookingFailCode; reason: string; dates?: string[]; suggest?: { action: "MOVE_ROOM"; rooms: { id: string; number: string }[] } };
export type BookingRowOut = { id: string; code: string; roomTypeId: string; status: string; holdExpiresAt: string | null; nights: number; totalSatang: number };
export type CreateBookingOk = {
  ok: true;
  groupId: string | null;
  reservations: BookingRowOut[];
  depositRequiredSatang: number;
  quote: { totalSatang: number; rooms: { roomTypeId: string; nightsTotal: number; nights: { date: string; priceSatang: number; source: string }[] }[] };
  publicToken: string | null;
};

const SOURCES = ["WEB", "WALK_IN", "PHONE", "LINE", "OTA"] as const;
const HOTEL_REF = "HotelReservation";
const TX_OPTS = { maxWait: 20_000, timeout: 30_000 } as const;
const ACTIVE = ["HOLD", "CONFIRMED", "CHECKED_IN"] as const;
const SWEEP_BATCH = 200;
const BEST_FIT_WINDOW_DAYS = 60;
const SYSTEM_ACTOR_ID = "module:hotel";
const NO_SHOW_POLICIES = ["FORFEIT_RELEASE_AFTER_AUDIT", "FORFEIT_HOLD_STAY", "REFUND_RELEASE"] as const;
type NoShowPolicy = (typeof NO_SHOW_POLICIES)[number];

const KEY = {
  bookingMode: "rooms.hotel.bookingMode",
  holdOnline: "rooms.hotel.holdMinutesOnline",
  holdCounter: "rooms.hotel.holdMinutesCounter",
  maxAdvance: "rooms.hotel.maxAdvanceBookingDays",
  codePrefix: "rooms.hotel.codePrefix",
  deposit: "rooms.hotel.deposit",
  minNights: "rooms.hotel.minNights",
  closedToArrival: "rooms.hotel.closedToArrival",
  checkInTime: "rooms.hotel.checkInTime",
  rounding: "rooms.money.rounding",
  taxMode: "rooms.hotel.tax.mode",
  vatBp: "rooms.hotel.tax.vatBp",
  scBp: "rooms.hotel.tax.serviceChargeBp",
  noShow: "rooms.hotel.noShow",
  cancelPolicy: "rooms.hotel.cancelPolicy",
} as const;

const R = {
  notFound: "ไม่พบการจองหรือโรงแรมนี้ (หรืออยู่นอกสาขาที่คุณดูแล)",
  forbidden: "คุณยังไม่มีสิทธิ์ทำรายการนี้ — ขอสิทธิ์จากเจ้าของร้าน",
  busy: "ระบบไม่ว่าง ลองใหม่อีกครั้ง",
  full: "ห้องประเภทนี้เต็มในบางคืนที่เลือกแล้ว — เลือกวันหรือประเภทห้องอื่น",
  status: "สถานะการจองตอนนี้ทำรายการนี้ไม่ได้",
  money: "ต้องมีสิทธิ์จัดการการจอง (ผู้จัดการ) เพราะมีการคืนหรือริบเงินมัดจำ",
};

type Tx = Prisma.TransactionClient;
type Ctx = { tenantId: string; unitId: string };
type Gate = Ctx & { actor: BookingActor | null; unitName: string };
type RvRow = NonNullable<Awaited<ReturnType<Tx["hotelReservation"]["findFirst"]>>>;

const fail = (code: BookingFailCode, reason: string, extra: Partial<BookingFail> = {}): BookingFail => ({ ok: false, code, reason, ...extra });
const isStr = (v: unknown): v is string => typeof v === "string" && v.length > 0;
const isRec = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const ymdOfDb = (d: Date): string => d.toISOString().slice(0, 10);
const dbDate = (ymd: string): Date => new Date(`${ymd}T00:00:00.000Z`);
const jsonOf = (v: unknown): Prisma.InputJsonValue => JSON.parse(JSON.stringify(v ?? null)) as Prisma.InputJsonValue;
const zodReason = (e: z.ZodError): string => {
  const m = e.issues[0]?.message ?? "";
  return /[\u0E00-\u0E7F]/.test(m) ? m : "ข้อมูลไม่ครบหรือไม่ถูกต้อง";
};
const minYmd = (a: string, b: string): string => (a < b ? a : b);

class Abort extends Error {
  constructor(readonly result: BookingFail) {
    super(result.code);
  }
}
function isTxTimeout(e: unknown): boolean {
  let cur: unknown = e;
  for (let d = 0; d < 5 && cur && typeof cur === "object"; d++) {
    const o = cur as { code?: unknown; cause?: unknown };
    if (o.code === "P2028" || o.code === "P2034") return true;
    cur = o.cause;
  }
  return false;
}
function isUnique(e: unknown): boolean {
  let cur: unknown = e;
  for (let d = 0; d < 5 && cur && typeof cur === "object"; d++) {
    const o = cur as { code?: unknown; cause?: unknown; message?: unknown };
    if (o.code === "P2002" || o.code === "23505") return true;
    cur = o.cause;
  }
  return false;
}

/** นาฬิกา: at ใช้ได้เฉพาะใต้ SVC_QC_CLOCK=1 (อ่าน env ทุกครั้ง) · อื่น ⇒ เวลาเครื่อง */
function clockOf(input: unknown): Date {
  if (process.env.SVC_QC_CLOCK === "1" && isRec(input) && typeof input.at === "string") {
    const d = new Date(input.at);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return new Date();
}

function actorOf(a: unknown): BookingActor | null {
  if (!isRec(a) || !isStr(a.role) || !isStr(a.userId)) return null;
  return {
    role: a.role as MembershipCtx["role"],
    unitAccess: Array.isArray(a.unitAccess) ? a.unitAccess.filter(isStr) : [],
    permissions: isRec(a.permissions) ? a.permissions : {},
    userId: a.userId,
  };
}
const can = (g: Gate, action: string): boolean => g.actor === null || evaluate(g.actor, { module: "hotel", action, unitId: g.unitId });

/** ด่าน: โรงแรมของร้าน → ผู้กระทำเข้าหน่วยได้ (ไม่ได้ ⇒ NOT_FOUND) → สิทธิ์ need (FORBIDDEN) · actor null = ทางสาธารณะ (เฉพาะ createBooking) */
async function gate(actorIn: unknown, ctx: unknown, input: unknown, need: string | null, allowPublic = false): Promise<Gate | BookingFail> {
  const tenantId = isRec(ctx) ? ctx.tenantId : null;
  const unitId = isRec(input) ? input.unitId : null;
  if (!isStr(tenantId) || !isStr(unitId)) return fail("NOT_FOUND", R.notFound);
  const actor = actorOf(actorIn);
  if (!actor && !(allowPublic && actorIn === null)) return fail("NOT_FOUND", R.notFound);
  const unit = await tenantDb({ tenantId }).businessUnit.findFirst({ where: { id: unitId, type: "HOTEL" }, select: { id: true, name: true } });
  if (!unit) return fail("NOT_FOUND", R.notFound);
  if (actor && !canAccessUnit(actor, unit.id)) return fail("NOT_FOUND", R.notFound);
  const g: Gate = { tenantId, unitId: unit.id, actor, unitName: unit.name };
  if (actor && need && !can(g, need)) return fail("FORBIDDEN", R.forbidden);
  return g;
}
const isFail = (v: unknown): v is BookingFail => isRec(v) && v.ok === false;

/** ธุรกรรมของหน่วย (tenantDb ขยาย) · Abort ⇒ ผลปฏิเสธ · หมดเวลา ⇒ BUSY */
async function inTx<T>(c: Ctx, fn: (tx: Tx) => Promise<T>): Promise<T | BookingFail> {
  try {
    return await tenantDb({ tenantId: c.tenantId, unitId: c.unitId }).$transaction((t) => fn(t as unknown as Tx), TX_OPTS);
  } catch (e) {
    if (e instanceof Abort) return e.result;
    if (isTxTimeout(e)) return fail("BUSY", R.busy);
    throw e;
  }
}

/** ล็อกชั้นประเภทห้อง — เรียง roomTypeId เสมอ (ทุกเส้นทางที่กินห้องล็อกลำดับเดียวกัน ⇒ ไม่มี 40P01) */
async function lockTypes(tx: Tx, unitId: string, typeIds: string[]): Promise<void> {
  for (const t of [...new Set(typeIds)].sort()) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${unitId}::text || ':' || ${t}::text))`;
  }
}

// ───────────────────────── snapshot ─────────────────────────
type SnapshotLike = { values?: Record<string, unknown>; plan?: { cancelRules?: unknown } } | null;
const snapOf = (v: unknown): SnapshotLike => (isRec(v) ? (v as SnapshotLike) : null);
function rulesFrom(v: unknown): CancelRule[] {
  if (!Array.isArray(v)) return [];
  return v.filter((r): r is CancelRule => isRec(r) && Number.isInteger(r.daysBefore) && Number.isInteger(r.refundBp)).map((r) => ({ daysBefore: r.daysBefore, refundBp: r.refundBp }));
}
/** กฎยกเลิกของการจอง = กฎของแผนที่จดตอนจอง (ถ้ามี) · ไม่มี ⇒ ค่าตั้ง rooms.hotel.cancelPolicy ที่จดไว้ */
export function cancelRulesOfSnapshot(snapshot: unknown): CancelRule[] {
  const s = snapOf(snapshot);
  const plan = rulesFrom(s?.plan?.cancelRules);
  return plan.length ? plan : rulesFrom(s?.values?.[KEY.cancelPolicy]);
}
function noShowPolicyOf(snapshot: unknown): NoShowPolicy {
  const v = snapOf(snapshot)?.values?.[KEY.noShow];
  return (NO_SHOW_POLICIES as readonly unknown[]).includes(v) ? (v as NoShowPolicy) : "FORFEIT_RELEASE_AFTER_AUDIT";
}

// ───────────────────────── ห้องจริง ─────────────────────────
type FreeRoom = { id: string; number: string };
/** ห้องขายรายคืนได้ของประเภทที่ว่างทั้งช่วง (ไม่มี occupancy live ซ้อน) · bestFit = ช่องว่างก่อน/หลังแคบสุดก่อน (แบบ P1) */
async function freeRoomsTx(
  tx: Tx,
  c: Ctx,
  q: { roomTypeId: string; from: string; to: string; exceptRefIds?: string[]; excludeRoomIds?: string[]; now: Date; bestFit?: boolean },
): Promise<FreeRoom[]> {
  const rooms = (
    await tx.hotelRoom.findMany({
      where: { tenantId: c.tenantId, unitId: c.unitId, roomTypeId: q.roomTypeId },
      orderBy: { number: "asc" },
      select: { id: true, number: true, active: true, status: true, hkStatus: true, rentMode: true, roomType: { select: { rentMode: true } } },
    })
  ).filter((r) => isSellableNightly({ active: r.active, status: r.status, hkStatus: r.hkStatus, rentMode: r.rentMode, typeRentMode: r.roomType.rentMode }) && !(q.excludeRoomIds ?? []).includes(r.id));
  if (!rooms.length) return [];
  const W = BEST_FIT_WINDOW_DAYS;
  const wFrom = q.bestFit ? addDaysYmd(q.from, -W) : q.from;
  const wTo = q.bestFit ? addDaysYmd(q.to, W) : q.to;
  const occ = await tx.roomOccupancy.findMany({
    where: { tenantId: c.tenantId, unitId: c.unitId, roomId: { in: rooms.map((r) => r.id) }, active: true, startDate: { lt: dbDate(wTo) }, endDate: { gt: dbDate(wFrom) } },
    select: { roomId: true, kind: true, holdExpiresAt: true, refType: true, refId: true, startDate: true, endDate: true },
  });
  const spans = occ
    .filter((o) => !((o.kind === "HOLD" || o.kind === "CHANNEL_HOLD") && o.holdExpiresAt !== null && o.holdExpiresAt <= q.now))
    .filter((o) => !(o.refType === HOTEL_REF && (q.exceptRefIds ?? []).includes(o.refId)))
    .map((o) => ({ roomId: o.roomId, s: dayNumber(ymdOfDb(o.startDate)), e: dayNumber(ymdOfDb(o.endDate)) }));
  const f = dayNumber(q.from);
  const t = dayNumber(q.to);
  const free = rooms.filter((r) => !spans.some((x) => x.roomId === r.id && x.s < t && x.e > f));
  if (!q.bestFit) return free.map((r) => ({ id: r.id, number: r.number }));
  const gap = (roomId: string) => {
    const mine = spans.filter((x) => x.roomId === roomId);
    const prevEnd = Math.max(f - W, ...mine.filter((x) => x.e <= f).map((x) => x.e));
    const nextStart = Math.min(t + W, ...mine.filter((x) => x.s >= t).map((x) => x.s));
    return f - prevEnd + (nextStart - t);
  };
  return free
    .map((r) => ({ r, g: gap(r.id) }))
    .sort((a, b) => a.g - b.g || a.r.number.localeCompare(b.r.number, "th", { numeric: true }))
    .map(({ r }) => ({ id: r.id, number: r.number }));
}

type HoldKind = { kind: "HOLD" | "STAY"; holdExpiresAt: Date | null };
const kindOf = (status: string, holdExpiresAt: Date | null): HoldKind => (status === "HOLD" && holdExpiresAt ? { kind: "HOLD", holdExpiresAt } : { kind: "STAY", holdExpiresAt: null });

/** ถือห้องจริงห้องที่ดีที่สุดของประเภท (ไม่ได้ห้อง = null · ไม่ล้ม — ใบ §2 ข้อ 1) */
async function holdBestRoom(tx: Tx, c: Ctx, q: { reservationId: string; roomTypeId: string; from: string; to: string; hk: HoldKind; now: Date }): Promise<string | null> {
  for (const room of await freeRoomsTx(tx, c, { roomTypeId: q.roomTypeId, from: q.from, to: q.to, exceptRefIds: [q.reservationId], now: q.now, bestFit: true })) {
    const r = await claimRoom(tx, { ...c, roomId: room.id, start: q.from, end: q.to, kind: q.hk.kind, holdExpiresAt: q.hk.holdExpiresAt, refType: HOTEL_REF, refId: q.reservationId, requireRentMode: "NIGHTLY" });
    if (r.ok) return room.id;
  }
  return null;
}

async function activeOcc(tx: Tx, c: Ctx, reservationId: string) {
  return tx.roomOccupancy.findMany({
    where: { tenantId: c.tenantId, unitId: c.unitId, refType: HOTEL_REF, refId: reservationId, active: true },
    select: { id: true, roomId: true, kind: true, startDate: true, endDate: true, holdExpiresAt: true },
  });
}

/** ปล่อยชั้นประเภทห้อง (nights counted=false · roomId=null) + ห้องจริง + folio OPEN ⇒ VOID — ใน tx ของผู้เรียก */
async function releaseStayTx(tx: Tx, c: Ctx, reservationId: string, reason: string): Promise<void> {
  await tx.hotelBookingNight.updateMany({ where: { tenantId: c.tenantId, unitId: c.unitId, reservationId, counted: true }, data: { counted: false, roomId: null } });
  for (const o of await activeOcc(tx, c, reservationId)) await releaseOccupancy(tx, { ...c, occupancyId: o.id, reason });
  await tx.hotelFolio.updateMany({ where: { tenantId: c.tenantId, unitId: c.unitId, reservationId, status: "OPEN" }, data: { status: "VOID" } });
}

/** HOLD ⇒ STAY ของห้องที่ถืออยู่ (ปล่อยแล้วถือใหม่ห้องเดิมช่วงเดิม · ผ่าน facade) */
async function holdToStay(tx: Tx, c: Ctx, reservationId: string): Promise<void> {
  for (const o of await activeOcc(tx, c, reservationId)) {
    if (o.kind !== "HOLD") continue;
    await releaseOccupancy(tx, { ...c, occupancyId: o.id, reason: "ยืนยันการจอง" });
    const r = await claimRoom(tx, { ...c, roomId: o.roomId, start: ymdOfDb(o.startDate), end: ymdOfDb(o.endDate), kind: "STAY", refType: HOTEL_REF, refId: reservationId, requireRentMode: "NIGHTLY" });
    if (!r.ok) {
      await tx.hotelBookingNight.updateMany({ where: { tenantId: c.tenantId, unitId: c.unitId, reservationId, roomId: o.roomId }, data: { roomId: null } });
      await tx.hotelReservation.updateMany({ where: { id: reservationId, tenantId: c.tenantId, unitId: c.unitId }, data: { roomId: null } });
    }
  }
}

async function openFolio(tx: Tx, c: Ctx, reservationId: string): Promise<void> {
  const f = await tx.hotelFolio.findFirst({ where: { tenantId: c.tenantId, unitId: c.unitId, reservationId }, select: { id: true, status: true } });
  if (!f) await tx.hotelFolio.create({ data: { tenantId: c.tenantId, unitId: c.unitId, reservationId, status: "OPEN", balanceSatang: 0 } });
  else if (f.status === "VOID") await tx.hotelFolio.update({ where: { id: f.id }, data: { status: "OPEN" } });
}

/** คืนที่นับของการจองนี้ (เรียงวัน) */
async function countedNights(tx: Tx, c: Ctx, reservationId: string) {
  return tx.hotelBookingNight.findMany({ where: { tenantId: c.tenantId, unitId: c.unitId, reservationId, counted: true }, orderBy: { date: "asc" }, select: { id: true, date: true, priceSatang: true, roomId: true, postedAuditId: true } });
}

// ───────────────────────── event · audit ─────────────────────────
type EvType = "created" | "confirmed" | "cancelled" | "hold_expired" | "no_show" | "changed" | "deposit_after_expiry";
async function emitEv(tx: Tx, c: Ctx, type: EvType, rv: { id: string; groupId: string | null; code: string; source: string }, status: string, keyTail?: string): Promise<void> {
  const t = `hotel.booking.${type}`;
  await emitOutbox(tx, {
    tenantId: c.tenantId,
    unitId: c.unitId,
    type: t,
    idempotencyKey: `${t}#${rv.id}${keyTail === undefined ? "" : `#${keyTail}`}`,
    payload: { tenantId: c.tenantId, unitId: c.unitId, reservationId: rv.id, groupId: rv.groupId ?? null, code: rv.code, status, source: rv.source },
  });
}
async function audit(tx: Tx, c: Ctx, actor: BookingActor | null, action: string, targetId: string, before: unknown, after: unknown): Promise<void> {
  await tx.auditLog.create({
    data: {
      tenantId: c.tenantId,
      unitId: c.unitId,
      actorType: actor ? "USER" : "SYSTEM",
      actorId: actor?.userId ?? SYSTEM_ACTOR_ID,
      action,
      targetType: "HotelReservation",
      targetId,
      before: before === null ? undefined : jsonOf(before),
      after: after === null ? undefined : jsonOf(after),
    },
  });
}
/** สรุปแถวที่ลง audit (ไม่มีชื่อ/เบอร์/อีเมลผู้เข้าพัก · X8/X10) */
const auditView = (rv: { code: string; status: string; source: string; roomTypeId: string; roomId: string | null; checkInDate: Date; checkOutDate: Date; nights: number; totalSatang: number; depositSatang: number; groupId: string | null }) => ({
  code: rv.code,
  status: rv.status,
  source: rv.source,
  roomTypeId: rv.roomTypeId,
  roomId: rv.roomId,
  checkIn: ymdOfDb(rv.checkInDate),
  checkOut: ymdOfDb(rv.checkOutDate),
  nights: rv.nights,
  totalSatang: rv.totalSatang,
  depositSatang: rv.depositSatang,
  groupId: rv.groupId,
});

// ───────────────────────── ค่าตั้ง/ราคา ─────────────────────────
type UnitPolicy = {
  bookingMode: string;
  holdOnline: number;
  holdCounter: number;
  maxAdvance: number;
  codePrefix: string;
  deposit: DepositPolicy;
  minNights: number | null;
  closedToArrival: boolean;
  checkInTime: string;
  rounding: string;
  tax: { mode: string; vatBp: number; serviceChargeBp: number };
};
const num = (v: unknown, d: number): number => (typeof v === "number" && Number.isFinite(v) ? v : d);
async function unitPolicy(tenantId: string, unitId: string, ratePlanId: string | null): Promise<UnitPolicy> {
  const keys = Object.values(KEY).filter((k) => k !== KEY.noShow && k !== KEY.cancelPolicy);
  const st = await resolveSettings({ tenantId }, keys, { unitId, ...(ratePlanId ? { ratePlanId } : {}) });
  const v = (k: string) => st[k]?.value;
  const dep = v(KEY.deposit);
  return {
    bookingMode: String(v(KEY.bookingMode) ?? "DEPOSIT_REQUIRED"),
    holdOnline: num(v(KEY.holdOnline), 15),
    holdCounter: num(v(KEY.holdCounter), 1440),
    maxAdvance: num(v(KEY.maxAdvance), 365),
    codePrefix: String(v(KEY.codePrefix) ?? "HR").trim() || "HR",
    deposit: isRec(dep) && isStr(dep.kind) ? (dep as DepositPolicy) : { kind: "FIRST_NIGHT" },
    minNights: typeof v(KEY.minNights) === "number" ? (v(KEY.minNights) as number) : null,
    closedToArrival: v(KEY.closedToArrival) === true,
    checkInTime: typeof v(KEY.checkInTime) === "string" ? (v(KEY.checkInTime) as string) : "14:00",
    rounding: String(v(KEY.rounding) ?? "SATANG"),
    tax: { mode: String(v(KEY.taxMode) ?? "INCLUSIVE"), vatBp: num(v(KEY.vatBp), 700), serviceChargeBp: num(v(KEY.scBp), 0) },
  };
}
/** วัน "YYYY-MM-DD" + "HH:MM" เวลาไทย ⇒ Date */
function bkkDateTime(ymd: string, hhmm: string): Date {
  const m = /^(\d{2}):(\d{2})$/.exec(hhmm) ?? ["", "14", "00"];
  return new Date(`${ymd}T${m[1]}:${m[2]}:00.000+07:00`);
}

const QUOTE_CODE: Record<string, BookingFailCode> = {
  INVALID_RANGE: "INVALID_INPUT",
  OUT_OF_RANGE: "INVALID_INPUT",
  PAST_DATE: "PAST_DATE",
  TOO_FAR: "TOO_FAR",
  CLOSED_TO_ARRIVAL: "CLOSED_TO_ARRIVAL",
  MIN_NIGHTS: "MIN_NIGHTS",
  MAX_NIGHTS: "MAX_NIGHTS",
  EXTRA_BED_NOT_ALLOWED: "EXTRA_BED_NOT_ALLOWED",
  OVER_OCCUPANCY: "OVER_OCCUPANCY",
  NO_RATE: "NO_RATE",
};

/** ราคาคืนใหม่ ณ ปัจจุบัน (ต่อ/ย้าย/เลื่อน) — แผนของการจอง (เก็บเข้าคลังแล้ว ⇒ แผนเริ่มต้น) · ไม่มีแผนเลย = ราคาต่อคืนเดิมของการจอง (การจอง P1) */
async function quoteNights(
  c: Ctx,
  rv: { roomTypeId: string; ratePlanId: string | null; ratePerNightSatang: number },
  roomTypeId: string,
  from: string,
  to: string,
  today: string,
): Promise<{ ok: true; nights: { date: string; priceSatang: number; source: string }[]; ratePlanId: string | null } | BookingFail> {
  if (!(to > from)) return { ok: true, nights: [], ratePlanId: rv.ratePlanId };
  const pc = await loadPricingContext({ tenantId: c.tenantId }, c.unitId, { from, to: addDaysYmd(to, -1), ...(rv.ratePlanId ? { ratePlanId: rv.ratePlanId } : {}) });
  if (!pc) return fail("NOT_FOUND", R.notFound);
  const plan = pc.plans.find((p) => p.id === rv.ratePlanId) ?? pc.plans.find((p) => p.isDefault) ?? null;
  if (plan) {
    const q = quoteStay({ ...pc, today: minYmd(today, from) }, { roomTypeId, ratePlanId: plan.id, checkIn: from, checkOut: to, limits: { minNights: null, maxNights: null, closedToArrival: false, maxAdvanceBookingDays: 100_000 } });
    if (q.ok) return { ok: true, nights: q.nights.map((n) => ({ date: n.date, priceSatang: n.priceSatang, source: n.source })), ratePlanId: plan.id };
    if (q.error !== "NO_RATE" || rv.ratePlanId) return fail(QUOTE_CODE[q.error] ?? "INVALID_INPUT", q.messageTh, q.dates ? { dates: q.dates } : {});
  }
  return { ok: true, nights: nightDates(from, to).map((date) => ({ date, priceSatang: rv.ratePerNightSatang, source: "FALLBACK" })), ratePlanId: rv.ratePlanId };
}

// ───────────────────────── รหัสการจอง ─────────────────────────
const reEscape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** รหัส running ต่อหน่วย `<prefix>-<YYMM>-<NNNN>` · ล็อกหน่วยใน tx (หลังล็อกประเภท — ลำดับเดียวกันทุกการจอง) */
async function nextCodes(tx: Tx, unitId: string, prefix: string, today: string, n: number): Promise<string[]> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`hotel-code:${unitId}`}::text))`;
  const base = `${prefix}-${today.slice(2, 4)}${today.slice(5, 7)}-`;
  const pattern = `^${reEscape(base)}([0-9]+)$`;
  const rows = await tx.$queryRaw<{ m: number | null }[]>`
    SELECT max((substring("code" from ${pattern}))::int) AS "m" FROM "HotelReservation" WHERE "unitId" = ${unitId} AND "code" ~ ${pattern}`;
  const start = Number(rows[0]?.m ?? 0) || 0;
  return Array.from({ length: n }, (_, i) => `${base}${String(start + i + 1).padStart(4, "0")}`);
}

// ───────────────────────── createBooking ─────────────────────────
const ymdZ = z.string().refine((s) => isYmd(s), { message: "วันที่ไม่ถูกต้อง" });
const CreateInput = z.object({
  unitId: z.string().min(1),
  rooms: z
    .array(
      z.object({
        roomTypeId: z.string().min(1, { message: "เลือกประเภทห้อง" }),
        adults: z.number().int().min(1, { message: "ต้องมีผู้ใหญ่อย่างน้อย 1 คน" }).max(20),
        children: z.number().int().min(0).max(20).optional(),
        extraBeds: z.number().int().min(0).max(5).optional(),
      }),
    )
    .min(1, { message: "เลือกห้องอย่างน้อย 1 ห้อง" })
    .max(10, { message: "จองได้ครั้งละไม่เกิน 10 ห้อง" }),
  checkIn: ymdZ,
  checkOut: ymdZ,
  ratePlanId: z.string().min(1).optional().nullable(),
  source: z.enum(SOURCES, { message: "แหล่งที่มาไม่ถูกต้อง" }),
  guest: z.object({
    name: z.string().trim().min(1, { message: "กรอกชื่อผู้เข้าพัก" }).max(120),
    phone: z.string().trim().max(32).optional().nullable(),
    email: z.string().trim().max(120).optional().nullable(),
  }),
  note: z.string().trim().max(500).optional().nullable(),
  couponCode: z.string().trim().max(40).optional().nullable(),
  hold: z.enum(["ONLINE", "COUNTER"]).optional().nullable(),
  channelRef: z.string().trim().max(64).optional().nullable(),
  at: z.string().optional(),
});
type CreateIn = z.infer<typeof CreateInput>;
type CreateOpts = { legacy?: boolean; createdById?: string | null };

/**
 * สร้างการจอง (tx เดียว · S §7.2) — actor null = ทางสาธารณะ (เฉพาะ WEB/LINE · มติ §11 ข้อ 5)
 * สถานะ: AUTO_CONFIRM ⇒ CONFIRMED · MANUAL_APPROVE ⇒ HOLD ถึงเวลาเช็กอินของวันเข้า (§11 ข้อ 4) · DEPOSIT_REQUIRED ⇒ มัดจำ 0 = CONFIRMED ·
 *   WEB/LINE/ONLINE ⇒ HOLD holdMinutesOnline · "รอโอน" (COUNTER) ⇒ HOLD holdMinutesCounter · อื่น = CONFIRMED
 * internal.legacy = เส้น P1 (service.createReservation · storefront เดิม · ผู้ช่วย AI — ผู้เรียกตรวจสิทธิ์แล้ว):
 *   ไม่มีแผน/ราคา ⇒ ราคาฐานของประเภทห้อง + มัดจำของประเภท · CONFIRMED เสมอ · createdById ตามที่ส่ง
 */
export async function createBooking(actor: unknown, ctx: unknown, input: unknown, internal?: CreateOpts): Promise<CreateBookingOk | BookingFail> {
  return createBookingCore(actor, ctx, input, internal ?? {});
}

async function createBookingCore(actorIn: unknown, ctx: unknown, input: unknown, opts: CreateOpts): Promise<CreateBookingOk | BookingFail> {
  const g = await gate(actorIn, ctx, input, "hotel.reservation.create", true);
  if (isFail(g)) return g;
  const p = CreateInput.safeParse(input);
  if (!p.success) return fail("INVALID_INPUT", zodReason(p.error));
  const inp: CreateIn = p.data;
  if (!g.actor && inp.source !== "WEB" && inp.source !== "LINE") return fail("FORBIDDEN", "จองผ่านหน้าเว็บ/LINE เท่านั้นสำหรับลูกค้า");
  if (inp.source === "OTA" && !isStr(inp.channelRef ?? "")) return fail("INVALID_INPUT", "การจองจากช่องทาง OTA ต้องมีเลขการจองของช่องทาง");
  const now = clockOf(input);
  const today = bkkYmd(now);
  if (!(inp.checkOut > inp.checkIn)) return fail("INVALID_INPUT", "วันเช็กเอาต์ต้องอยู่หลังวันเช็กอินอย่างน้อย 1 คืน");
  if (inp.checkIn < today) return fail("PAST_DATE", "วันเช็กอินผ่านไปแล้ว — เลือกวันนี้หรือวันถัดไป");
  const c: Ctx = { tenantId: g.tenantId, unitId: g.unitId };
  const db = tenantDb(c);
  const typeIds = [...new Set(inp.rooms.map((r) => r.roomTypeId))];
  const types = await db.hotelRoomType.findMany({ where: { id: { in: typeIds }, active: true }, select: { id: true, name: true, capacity: true, maxOccupancy: true, extraBedAllowed: true, baseRateSatang: true, depositSatang: true, rentMode: true } });
  if (types.length !== typeIds.length) return fail("NOT_FOUND", "ไม่พบประเภทห้องที่เลือกในโรงแรมนี้");
  const typeOf = new Map(types.map((t) => [t.id, t]));
  for (const r of inp.rooms) {
    const t = typeOf.get(r.roomTypeId)!;
    if ((r.extraBeds ?? 0) > 0 && !t.extraBedAllowed) return fail("EXTRA_BED_NOT_ALLOWED", `ห้อง${t.name}เสริมเตียงไม่ได้`);
    const max = t.maxOccupancy ?? t.capacity;
    if (r.adults + (r.children ?? 0) > max) return fail("OVER_OCCUPANCY", `ห้อง${t.name}พักได้สูงสุด ${max} คน`);
  }
  const pc0 = await loadPricingContext({ tenantId: c.tenantId }, c.unitId, { from: inp.checkIn, to: addDaysYmd(inp.checkOut, -1), ...(inp.ratePlanId ? { ratePlanId: inp.ratePlanId } : {}) });
  if (!pc0) return fail("INVALID_INPUT", "ช่วงวันที่ยาวเกินไป — จองได้ไม่เกิน 365 คืน");
  const pc: PricingContext = { ...pc0, today };
  const plan = inp.ratePlanId ? (pc.plans.find((x) => x.id === inp.ratePlanId) ?? null) : (pc.plans.find((x) => x.isDefault) ?? null);
  if (inp.ratePlanId && !plan) return fail("NOT_FOUND", "ไม่พบแผนราคานี้ในโรงแรมนี้");
  const pol = await unitPolicy(c.tenantId, c.unitId, plan?.id ?? null);
  // เส้น P1 (legacy) ไม่มีเพดานจองล่วงหน้า (คงพฤติกรรมเดิมของ createReservation · qc-hotel-public จองปี 2031) — V2 ใช้ rooms.hotel.maxAdvanceBookingDays
  const maxAdvance = opts.legacy ? 100_000 : pol.maxAdvance;
  if (dayNumber(inp.checkIn) - dayNumber(today) > maxAdvance) return fail("TOO_FAR", `จองล่วงหน้าได้ไม่เกิน ${pol.maxAdvance} วัน`);

  // ราคา · มัดจำ
  let quotes: QuoteOk[] = [];
  let legacyPrices = false;
  if (plan) {
    const limits = { minNights: pol.minNights, maxNights: null, closedToArrival: pol.closedToArrival, maxAdvanceBookingDays: maxAdvance };
    for (const r of inp.rooms) {
      const q = quoteStay(pc, { roomTypeId: r.roomTypeId, ratePlanId: plan.id, checkIn: inp.checkIn, checkOut: inp.checkOut, extraBeds: r.extraBeds ?? 0, limits });
      if (!q.ok) {
        if (opts.legacy && q.error === "NO_RATE") {
          legacyPrices = true;
          break;
        }
        return fail(QUOTE_CODE[q.error] ?? "INVALID_INPUT", q.messageTh, q.dates ? { dates: q.dates } : {});
      }
      quotes.push(q);
    }
  } else if (opts.legacy) legacyPrices = true;
  else return fail("NO_RATE", "โรงแรมนี้ยังไม่ได้ตั้งแผนราคา — ตั้งที่หน้าราคาก่อน", { dates: nightDates(inp.checkIn, inp.checkOut) });
  if (legacyPrices) {
    quotes = inp.rooms.map((r) => {
      const t = typeOf.get(r.roomTypeId)!;
      const nights = nightDates(inp.checkIn, inp.checkOut).map((date) => ({ date, priceSatang: t.baseRateSatang, source: "FALLBACK" as const, seasonId: null, bucket: null }));
      return { ok: true as const, roomTypeId: r.roomTypeId, ratePlanId: plan?.id ?? "", checkIn: inp.checkIn, checkOut: inp.checkOut, extraBeds: 0, nights, nightsTotal: nights.reduce((a, n) => a + n.priceSatang, 0) };
    });
  }
  const depositRequired = legacyPrices ? inp.rooms.reduce((a, r) => a + (typeOf.get(r.roomTypeId)?.depositSatang ?? 0), 0) : depositFor(quotes, depositPolicyOf(plan, pol.deposit), pol.rounding);

  // สถานะเริ่มต้น
  let status: "HOLD" | "CONFIRMED" = "CONFIRMED";
  let holdUntil: Date | null = null;
  if (!opts.legacy) {
    if (pol.bookingMode === "MANUAL_APPROVE") {
      status = "HOLD";
      const atCheckIn = bkkDateTime(inp.checkIn, pol.checkInTime);
      const floor = holdDeadline(now, pol.holdOnline) ?? now;
      holdUntil = atCheckIn > floor ? atCheckIn : floor;
    } else if (pol.bookingMode !== "AUTO_CONFIRM" && depositRequired > 0) {
      const online = inp.hold === "ONLINE" || !g.actor || (inp.hold === undefined && (inp.source === "WEB" || inp.source === "LINE"));
      if (inp.hold === "COUNTER") {
        status = "HOLD";
        holdUntil = holdDeadline(now, pol.holdCounter);
      } else if (online) {
        status = "HOLD";
        holdUntil = holdDeadline(now, pol.holdOnline);
      }
    }
  }

  // snapshot ตอนจอง (ค่าตั้ง ณ เวลาจริง + กฎยกเลิกของแผน)
  const planRules = plan ? await db.hotelCancelRule.findMany({ where: { ratePlanId: plan.id }, orderBy: { daysBefore: "desc" }, select: { daysBefore: true, refundBp: true } }) : [];
  const snap = await snapshotPolicy({ tenantId: c.tenantId }, "reservation", { unitId: c.unitId, roomTypeId: inp.rooms[0].roomTypeId, ...(plan ? { ratePlanId: plan.id } : {}) });
  const policySnapshot = jsonOf({ ...snap, plan: plan ? { id: plan.id, code: plan.code, depositKind: plan.depositKind, depositValue: plan.depositValue, cancelRules: planRules } : null });
  const taxSnapshot = jsonOf(pol.tax);
  const groupId = inp.rooms.length > 1 ? `grp${randomUUID().replace(/-/g, "")}` : null;
  const actor = g.actor;
  const createdById = opts.legacy ? (opts.createdById ?? null) : (actor?.userId ?? null);
  const need = new Map<string, number>();
  for (const r of inp.rooms) for (const d of nightDates(inp.checkIn, inp.checkOut)) need.set(`${r.roomTypeId}|${d}`, (need.get(`${r.roomTypeId}|${d}`) ?? 0) + 1);

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const out = await inTx(c, async (tx) => {
        await lockTypes(tx, c.unitId, typeIds);
        const av = await availabilityInTx(tx, { ...c, roomTypeIds: typeIds, from: inp.checkIn, to: inp.checkOut });
        const short = shortDates(av, need);
        if (short.length) throw new Abort(fail("AVAILABILITY_CHANGED", R.full, { dates: short }));
        const codes = await nextCodes(tx, c.unitId, pol.codePrefix, today, inp.rooms.length);
        const rows: (BookingRowOut & { publicToken: string | null })[] = [];
        for (const [i, r] of inp.rooms.entries()) {
          const q = quotes[i];
          const rv = await tx.hotelReservation.create({
            data: {
              tenantId: c.tenantId,
              unitId: c.unitId,
              code: codes[i],
              status,
              guestName: inp.guest.name,
              guestPhone: inp.guest.phone || null,
              guestEmail: inp.guest.email || null,
              roomTypeId: r.roomTypeId,
              checkInDate: dbDate(inp.checkIn),
              checkOutDate: dbDate(inp.checkOut),
              nights: q.nights.length,
              adults: r.adults,
              children: r.children ?? 0,
              ratePerNightSatang: q.nights[0]?.priceSatang ?? 0,
              totalSatang: q.nightsTotal,
              depositSatang: i === 0 ? depositRequired : 0,
              note: inp.note || null,
              createdById,
              source: inp.source,
              channelRef: inp.channelRef || null,
              ratePlanId: plan?.id ?? null,
              groupId,
              holdExpiresAt: holdUntil,
              policySnapshot,
              taxSnapshot,
            },
            select: { id: true, code: true, publicToken: true },
          });
          await tx.hotelBookingNight.createMany({
            data: q.nights.map((n) => ({ tenantId: c.tenantId, unitId: c.unitId, reservationId: rv.id, roomTypeId: r.roomTypeId, date: dbDate(n.date), priceSatang: n.priceSatang, ratePlanId: plan?.id ?? null, priceSource: n.source, counted: true })),
          });
          const roomId = await holdBestRoom(tx, c, { reservationId: rv.id, roomTypeId: r.roomTypeId, from: inp.checkIn, to: inp.checkOut, hk: kindOf(status, holdUntil), now });
          if (roomId) {
            await tx.hotelBookingNight.updateMany({ where: { tenantId: c.tenantId, unitId: c.unitId, reservationId: rv.id }, data: { roomId } });
            await tx.hotelReservation.update({ where: { id: rv.id }, data: { roomId } });
          }
          if (status === "CONFIRMED") await openFolio(tx, c, rv.id);
          const ev = { id: rv.id, groupId, code: rv.code, source: inp.source };
          await audit(tx, c, actor, "hotel.booking.created", rv.id, null, {
            code: rv.code,
            status,
            source: inp.source,
            roomTypeId: r.roomTypeId,
            roomId,
            checkIn: inp.checkIn,
            checkOut: inp.checkOut,
            nights: q.nights.length,
            totalSatang: q.nightsTotal,
            depositSatang: i === 0 ? depositRequired : 0,
            groupId,
            ratePlanId: plan?.id ?? null,
            holdExpiresAt: holdUntil?.toISOString() ?? null,
          });
          await emitEv(tx, c, "created", ev, status);
          rows.push({ id: rv.id, code: rv.code, roomTypeId: r.roomTypeId, status, holdExpiresAt: holdUntil?.toISOString() ?? null, nights: q.nights.length, totalSatang: q.nightsTotal, publicToken: rv.publicToken });
        }
        return rows;
      });
      if (isFail(out)) return out;
      await linkPartyAfterCommit(c, out.map((r) => r.id), inp.guest.name, inp.guest.phone, inp.guest.email);
      return {
        ok: true,
        groupId,
        reservations: out.map(({ publicToken: _pt, ...r }) => r),
        depositRequiredSatang: depositRequired,
        quote: { totalSatang: quotes.reduce((a, q) => a + q.nightsTotal, 0), rooms: quotes.map((q) => ({ roomTypeId: q.roomTypeId, nightsTotal: q.nightsTotal, nights: q.nights.map((n) => ({ date: n.date, priceSatang: n.priceSatang, source: n.source })) })) },
        publicToken: out[0]?.publicToken ?? null,
      };
    } catch (e) {
      if (isUnique(e) && attempt < 2) continue; // รหัสชน (แข่งกับเส้นอื่น) ⇒ ลองใหม่ทั้ง tx
      throw e;
    }
  }
  return fail("BUSY", R.busy);
}

/** ผูก Party กลาง (หลัง commit · ไม่ throw · กุญแจต้องเชื่อถือได้ — แบบ P1 C11) */
async function linkPartyAfterCommit(c: Ctx, ids: string[], name: string, phone: string | null | undefined, email: string | null | undefined): Promise<void> {
  try {
    const phoneOk = normalizePartyPhone(phone).length >= 9;
    const mail = email?.trim() ?? "";
    const mailOk = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(mail);
    if (!phoneOk && !mailOk) return;
    const partyId = await safeFindOrCreate(c.tenantId, { name: name.trim() || "ลูกค้าไม่ระบุชื่อ", phone: phoneOk ? (phone ?? null) : null, email: mailOk ? mail : null });
    if (partyId) await tenantDb(c).hotelReservation.updateMany({ where: { id: { in: ids }, partyId: null }, data: { partyId } });
  } catch {
    console.warn(`[hotel.booking] ผูก Party ไม่สำเร็จ tenant=${c.tenantId} — ปล่อยว่าง`);
  }
}

// ───────────────────────── โหลดการจอง ─────────────────────────
const idOfInput = (input: unknown): string | null => (isRec(input) ? (isStr(input.id) ? input.id : isStr(input.reservationId) ? input.reservationId : null) : null);
async function loadRv(c: Ctx, id: string | null): Promise<RvRow | null> {
  if (!id) return null;
  return tenantDb(c).hotelReservation.findFirst({ where: { id } });
}
async function groupRows(c: Ctx, rv: RvRow): Promise<RvRow[]> {
  if (!rv.groupId) return [rv];
  return tenantDb(c).hotelReservation.findMany({ where: { groupId: rv.groupId }, orderBy: [{ createdAt: "asc" }, { code: "asc" }] });
}
/** หัวกลุ่ม = แถวที่ถือมัดจำ (จ่ายแล้ว ⇒ แถวนั้น · ยังไม่จ่าย ⇒ แถวที่มียอดมัดจำ) */
const headOf = (rows: RvRow[]): RvRow => rows.find((r) => r.depositPaidAt) ?? rows.find((r) => r.depositSatang > 0) ?? rows[0];

// ───────────────────────── เงิน (ผ่าน POS เท่านั้น) ─────────────────────────
type DepositState = { systemId: string; depositId: string; receiptSaleId: string; remaining: number; customerId: string | null } | null;
async function depositState(c: Ctx, receiptSaleId: string | null): Promise<DepositState> {
  if (!receiptSaleId) return null;
  const systemId = await systemForUnit(c.tenantId, c.unitId, "POS");
  if (!systemId) return null;
  const d = await tenantDb({ tenantId: c.tenantId, systemId }).posDeposit.findFirst({
    where: { receiptSaleId },
    select: { id: true, unitId: true, status: true, amountSatang: true, usedSatang: true, refundedSatang: true, customerId: true },
  });
  if (!d || d.unitId !== c.unitId) return null;
  const remaining = String(d.status) === "OPEN" ? Math.max(0, d.amountSatang - d.usedSatang - d.refundedSatang) : 0;
  return { systemId, depositId: d.id, receiptSaleId, remaining, customerId: d.customerId };
}
type MoneyOut = { refundSatang: number; forfeitSatang: number; error: string | null };
const sellFor = (c: Ctx, systemId: string, reservationId: string) =>
  (tx: Tx, p: { idempotencyKey: string; lines: { name: string; qty: number; unitPriceSatang: number }[]; payMethods: { type: "DEPOSIT"; amountSatang: number; refSaleId: string }[]; memberId?: string; memberAttachOnly?: true; note?: string }) =>
    pos.createSale({ ...c, systemId, sourceModule: "HOTEL", sourceId: reservationId, ...p }, callerTx(tx));

async function refundAll(c: Ctx, receiptSaleId: string, reason: string, actorId: string): Promise<MoneyOut> {
  const r = await moduleRefundDeposit({ ...c, receiptSaleId, reason, actorId });
  return r.ok ? { refundSatang: 0, forfeitSatang: 0, error: null } : { refundSatang: 0, forfeitSatang: 0, error: r.message };
}
async function forfeitAll(c: Ctx, st: NonNullable<DepositState>, reservationId: string, reason: string, actorId: string): Promise<MoneyOut> {
  const r = await moduleForfeitDeposit({ ...c, receiptSaleId: st.receiptSaleId, reason, actorId }, sellFor(c, st.systemId, reservationId));
  if (r.ok === false) return { refundSatang: 0, forfeitSatang: 0, error: r.message };
  return { refundSatang: 0, forfeitSatang: "legacy" in r ? 0 : r.satang, error: null };
}
/** บิลค่าธรรมเนียมยกเลิก (จ่ายด้วยแถว DEPOSIT อ้างใบรับ · คีย์ริบของมัดจำ dep-forfeit:<มัดจำ> แบบ POS/จองคิว ⇒ ริบซ้ำ/สองทาง = บิลเดียว) */
async function cancelFeeBill(c: Ctx, st: NonNullable<DepositState>, rv: { id: string; code: string }, amount: number): Promise<string | null> {
  const posDb = tenantDb({ tenantId: c.tenantId, systemId: st.systemId });
  let key: string | null = null;
  for (let round = 0; round <= 20 && key === null; round++) {
    const k = round === 0 ? `dep-forfeit:${st.depositId}` : `dep-forfeit:${st.depositId}-r${round}`;
    const s = await posDb.posSale.findFirst({ where: { idempotencyKey: k }, select: { id: true, status: true } });
    if (!s) key = k;
    else if (s.status !== "VOIDED") return null; // มีบิลริบ/ค่าธรรมเนียมของมัดจำนี้แล้ว
  }
  if (!key) return "บิลค่าธรรมเนียมของมัดจำนี้ถูกยกเลิกหลายครั้งเกินไป";
  try {
    const r = await pos.createSale({
      ...c,
      systemId: st.systemId,
      sourceModule: "HOTEL",
      sourceId: rv.id,
      idempotencyKey: key,
      lines: [{ name: `ค่าธรรมเนียมยกเลิก ${rv.code}`, qty: 1, unitPriceSatang: amount }],
      payMethods: [{ type: "DEPOSIT", amountSatang: amount, refSaleId: st.receiptSaleId }],
      ...(st.customerId ? { memberId: st.customerId, memberAttachOnly: true as const } : {}),
    });
    if (r.status !== undefined && r.status !== "PAID") return "ออกบิลค่าธรรมเนียมยกเลิกไม่สำเร็จ";
    return null;
  } catch (e) {
    return e instanceof Error ? e.message.slice(0, 160) : "ออกบิลค่าธรรมเนียมยกเลิกไม่สำเร็จ";
  }
}
/** เงินตอนยกเลิกตามขั้นบันได (ยอดคืน = refundFor ของคงเหลือ · 100% ⇒ คืน · 0% ⇒ ริบ · ระหว่างนั้น ⇒ บิลค่าธรรมเนียม + คืนคงเหลือ) */
async function settleCancelMoney(c: Ctx, st: NonNullable<DepositState>, rv: { id: string; code: string }, refund: number, actorId: string): Promise<MoneyOut> {
  const paid = st.remaining;
  if (paid <= 0) return { refundSatang: 0, forfeitSatang: 0, error: null };
  const fee = Math.max(0, paid - Math.min(refund, paid));
  if (fee === 0) {
    const r = await refundAll(c, st.receiptSaleId, `ยกเลิกการจอง ${rv.code}`, actorId);
    return { ...r, refundSatang: r.error ? 0 : paid };
  }
  if (fee >= paid) return forfeitAll(c, st, rv.id, `ยกเลิกการจอง ${rv.code}`, actorId);
  const err = await cancelFeeBill(c, st, rv, fee);
  if (err) return { refundSatang: 0, forfeitSatang: 0, error: err };
  const r = await refundAll(c, st.receiptSaleId, `ยกเลิกการจอง ${rv.code} (คืนตามขั้นบันได)`, actorId);
  return { refundSatang: r.error ? 0 : paid - fee, forfeitSatang: fee, error: r.error };
}

// ───────────────────────── takeBookingDeposit ─────────────────────────
const DepositInput = z.object({
  reservationId: z.string().min(1, { message: "ไม่พบการจอง" }),
  payType: z.string(),
  amountSatang: z.number().int().positive().max(1_000_000_000).optional(),
  reference: z.string().trim().max(64).optional().nullable(),
});

/**
 * รับมัดจำ (หัวกลุ่ม · keyBase hotel-deposit-<groupId|id>) ผ่าน POS · HOLD ยังไม่หมดอายุ ⇒ CONFIRMED ทุกแถวในกลุ่ม
 * จ่ายหลังหมดอายุ (HOLD_EXPIRED · หรือ HOLD ที่เลยเวลาแต่ sweeper ยังไม่เก็บ): รับเงินก่อน (มีใบรับเสมอ) → guard tx ว่าง ⇒ CONFIRMED · ไม่ว่าง ⇒ คง CANCELLED + คืนมัดจำอัตโนมัติ + event deposit_after_expiry
 */
export async function takeBookingDeposit(actorIn: unknown, ctx: unknown, input: unknown) {
  const g = await gate(actorIn, ctx, input, "hotel.booking.manage");
  if (isFail(g)) return g;
  const p = DepositInput.safeParse(input);
  if (!p.success) return fail("INVALID_INPUT", zodReason(p.error));
  const payType = p.data.payType;
  if (!(DEPOSIT_PAY_TYPES as readonly string[]).includes(payType)) return fail("INVALID_INPUT", "วิธีรับเงินมัดจำไม่ถูกต้อง (เงินสด · พร้อมเพย์ · โอน · บัตร)");
  const c: Ctx = { tenantId: g.tenantId, unitId: g.unitId };
  const now = clockOf(input);
  let rv = await loadRv(c, p.data.reservationId);
  if (!rv) return fail("NOT_FOUND", R.notFound);
  let rows = await groupRows(c, rv);
  let head = headOf(rows);
  if (head.depositPaidAt) return { ok: true as const, duplicated: true, saleId: head.depositSaleId, status: rv.status };
  const late = (r: RvRow) => (r.status === "CANCELLED" && r.cancelReason === "HOLD_EXPIRED") || (r.status === "HOLD" && r.holdExpiresAt !== null && r.holdExpiresAt <= now);
  if (!(["HOLD", "CONFIRMED", "CHECKED_IN"].includes(head.status) || late(head))) return fail("INVALID_STATUS", "การจองนี้ยกเลิก/ไม่มา/ออกแล้ว — รับมัดจำไม่ได้");
  const amount = p.data.amountSatang ?? head.depositSatang;
  if (amount <= 0) return fail("INVALID_INPUT", "การจองนี้ไม่ต้องมัดจำ");
  const systemId = await systemForUnit(c.tenantId, c.unitId, "POS");
  if (!systemId) return fail("NO_POS", "หน่วยนี้ยังไม่ผูกระบบขายหน้าร้าน (POS) — ผูกก่อนจึงรับมัดจำได้");
  // HOLD ที่เลยเวลาแต่ยังไม่ถูกเก็บ ⇒ เก็บก่อน (ทางเดียวกับ sweeper · idempotent)
  for (const r of rows) if (r.status === "HOLD" && r.holdExpiresAt !== null && r.holdExpiresAt <= now) await expireOne({ tenantId: c.tenantId, unitId: c.unitId, id: r.id }, now);
  rv = (await loadRv(c, rv.id)) ?? rv;
  rows = await groupRows(c, rv);
  head = headOf(rows);
  const actorId = g.actor?.userId ?? SYSTEM_ACTOR_ID;
  const sale = await moduleTakeDeposit(
    { ...c, systemId, keyBase: `hotel-deposit-${head.groupId ?? head.id}`, amountSatang: amount, payType: payType as PosPayType, customerId: head.customerId ?? null, customerName: head.guestName ?? null, note: `มัดจำห้อง ${head.code}`, createdBy: SYSTEM_ACTOR_ID },
    (tx, k) =>
      pos.createSale(
        {
          ...c,
          systemId,
          sourceModule: k.sourceModule,
          sourceId: k.sourceId,
          idempotencyKey: k.idempotencyKey,
          lines: [{ name: `มัดจำห้อง ${head.code}`, qty: 1, unitPriceSatang: amount }],
          payMethods: [{ type: k.payType, amountSatang: amount, ...(p.data.reference ? { reference: p.data.reference } : {}) }],
        },
        callerTx(tx),
      ),
  );
  const expiredRows = rows.filter((r) => r.status === "CANCELLED" && r.cancelReason === "HOLD_EXPIRED");
  const headId = head.id;
  const out = await inTx(c, async (tx) => {
    await lockTypes(tx, c.unitId, rows.map((r) => r.roomTypeId));
    const claimed = await tx.hotelReservation.updateMany({ where: { id: headId, depositPaidAt: null }, data: { depositPaidAt: now, depositSaleId: sale.saleId, depositSatang: amount } });
    if (claimed.count === 0) return { kind: "dup" as const };
    const cur = await tx.hotelReservation.findMany({ where: { id: { in: rows.map((r) => r.id) } } });
    const reBook = cur.filter((r) => r.status === "CANCELLED" && r.cancelReason === "HOLD_EXPIRED" && expiredRows.some((x) => x.id === r.id));
    if (reBook.length) {
      const need = new Map<string, number>();
      for (const r of reBook) for (const d of nightDates(ymdOfDb(r.checkInDate), ymdOfDb(r.checkOutDate))) need.set(`${r.roomTypeId}|${d}`, (need.get(`${r.roomTypeId}|${d}`) ?? 0) + 1);
      const from = reBook.map((r) => ymdOfDb(r.checkInDate)).sort()[0];
      const to = reBook.map((r) => ymdOfDb(r.checkOutDate)).sort().reverse()[0];
      const av = await availabilityInTx(tx, { ...c, roomTypeIds: [...new Set(reBook.map((r) => r.roomTypeId))], from, to, excludeReservationIds: reBook.map((r) => r.id) });
      const short = shortDates(av, need);
      if (short.length) {
        for (const r of reBook) await emitEv(tx, c, "deposit_after_expiry", r, "CANCELLED", sale.saleId);
        await audit(tx, c, g.actor, "hotel.booking.deposit_after_expiry", headId, { status: "CANCELLED" }, { status: "CANCELLED", saleId: sale.saleId, amountSatang: amount, refund: true, dates: short });
        return { kind: "refund" as const };
      }
      for (const r of reBook) {
        const ci = ymdOfDb(r.checkInDate);
        const co = ymdOfDb(r.checkOutDate);
        await tx.hotelBookingNight.updateMany({ where: { tenantId: c.tenantId, unitId: c.unitId, reservationId: r.id, date: { gte: dbDate(ci), lt: dbDate(co) } }, data: { counted: true } });
        const roomId = await holdBestRoom(tx, c, { reservationId: r.id, roomTypeId: r.roomTypeId, from: ci, to: co, hk: { kind: "STAY", holdExpiresAt: null }, now });
        await tx.hotelBookingNight.updateMany({ where: { tenantId: c.tenantId, unitId: c.unitId, reservationId: r.id, counted: true }, data: { roomId } });
        await tx.hotelReservation.update({ where: { id: r.id }, data: { status: "CONFIRMED", holdExpiresAt: null, cancelledAt: null, cancelReason: null, roomId } });
        await openFolio(tx, c, r.id);
        await emitEv(tx, c, "confirmed", r, "CONFIRMED", `rebook-${sale.saleId}`);
        await audit(tx, c, g.actor, "hotel.booking.confirmed", r.id, { status: "CANCELLED", cancelReason: "HOLD_EXPIRED" }, { status: "CONFIRMED", via: "deposit_after_expiry" });
      }
    }
    for (const r of cur.filter((x) => x.status === "HOLD")) {
      const upd = await tx.hotelReservation.updateMany({ where: { id: r.id, status: "HOLD" }, data: { status: "CONFIRMED", holdExpiresAt: null } });
      if (upd.count === 0) continue;
      await holdToStay(tx, c, r.id);
      await openFolio(tx, c, r.id);
      await emitEv(tx, c, "confirmed", r, "CONFIRMED");
      await audit(tx, c, g.actor, "hotel.booking.confirmed", r.id, { status: "HOLD" }, { status: "CONFIRMED", via: "deposit" });
    }
    await audit(tx, c, g.actor, "hotel.booking.deposit", headId, { depositPaidAt: null }, { saleId: sale.saleId, amountSatang: amount, payType });
    return { kind: "ok" as const };
  });
  if (isFail(out)) return out;
  if (out.kind === "dup") return { ok: true as const, duplicated: true, saleId: sale.saleId, status: rv.status };
  if (out.kind === "refund") {
    const r = await refundAll(c, sale.saleId, `ห้องเต็มหลังถือห้องหมดเวลา — คืนมัดจำการจอง ${head.code}`, actorId);
    return fail("AVAILABILITY_CHANGED", r.error ? `ห้องเต็มแล้วหลังหมดเวลาถือห้อง — คืนมัดจำอัตโนมัติไม่สำเร็จ (${r.error}) ให้คืนที่หน้าขาย` : "ห้องเต็มแล้วหลังหมดเวลาถือห้อง — ระบบคืนเงินมัดจำให้อัตโนมัติแล้ว");
  }
  const after = await loadRv(c, rv.id);
  return { ok: true as const, duplicated: sale.duplicated, saleId: sale.saleId, status: after?.status ?? rv.status };
}

// ───────────────────────── confirmBooking (MANUAL_APPROVE / ยืนยันโดยไม่รอมัดจำ) ─────────────────────────
export async function confirmBooking(actorIn: unknown, ctx: unknown, input: unknown) {
  const g = await gate(actorIn, ctx, input, "hotel.booking.manage");
  if (isFail(g)) return g;
  const c: Ctx = { tenantId: g.tenantId, unitId: g.unitId };
  const now = clockOf(input);
  const rv = await loadRv(c, idOfInput(input));
  if (!rv) return fail("NOT_FOUND", R.notFound);
  if (rv.status !== "HOLD") return fail("INVALID_STATUS", "การจองนี้ไม่ได้อยู่ระหว่างถือห้อง — ยืนยันซ้ำไม่ได้");
  if (rv.holdExpiresAt && rv.holdExpiresAt <= now) return fail("HOLD_EXPIRED", "หมดเวลาถือห้องแล้ว — สร้างการจองใหม่");
  const rows = (await groupRows(c, rv)).filter((r) => r.status === "HOLD");
  const out = await inTx(c, async (tx) => {
    let n = 0;
    for (const r of rows) {
      const upd = await tx.hotelReservation.updateMany({ where: { id: r.id, status: "HOLD" }, data: { status: "CONFIRMED", holdExpiresAt: null } });
      if (upd.count === 0) continue;
      n++;
      await holdToStay(tx, c, r.id);
      await openFolio(tx, c, r.id);
      await emitEv(tx, c, "confirmed", r, "CONFIRMED");
      await audit(tx, c, g.actor, "hotel.booking.confirmed", r.id, { status: "HOLD" }, { status: "CONFIRMED", via: "manual" });
    }
    if (n === 0) throw new Abort(fail("INVALID_STATUS", "การจองนี้ถูกยืนยันหรือยกเลิกไปแล้ว"));
    return { ok: true as const, confirmed: n };
  });
  return out;
}

// ───────────────────────── cancelBooking ─────────────────────────
const CancelInput = z.object({
  reservationId: z.string().min(1).optional(),
  groupId: z.string().min(1).optional(),
  reason: z.string().trim().min(1, { message: "ระบุเหตุผลการยกเลิก" }).max(300),
});

/**
 * ยกเลิก HOLD/CONFIRMED ทั้งกลุ่ม (groupId) หรือรายห้อง — รายห้องที่ถือมัดจำหัวกลุ่ม ⇒ ย้ายหัวกลุ่มไปแถวถัดไป (ไม่คืนเงิน)
 * ห้องสุดท้ายของกลุ่ม/การจองเดี่ยวที่จ่ายมัดจำแล้ว ⇒ คืนตามขั้นบันไดของ snapshot (ต้องมี hotel.booking.manage)
 */
export async function cancelBooking(actorIn: unknown, ctx: unknown, input: unknown) {
  const g = await gate(actorIn, ctx, input, "hotel.reservation.cancel");
  if (isFail(g)) return g;
  const p = CancelInput.safeParse(input);
  if (!p.success) return fail("INVALID_INPUT", zodReason(p.error));
  if (!p.data.reservationId && !p.data.groupId) return fail("INVALID_INPUT", "ระบุการจองที่จะยกเลิก");
  const c: Ctx = { tenantId: g.tenantId, unitId: g.unitId };
  const now = clockOf(input);
  const today = bkkYmd(now);
  const db = tenantDb(c);
  let all: RvRow[];
  let targets: RvRow[];
  if (p.data.groupId) {
    all = await db.hotelReservation.findMany({ where: { groupId: p.data.groupId }, orderBy: [{ createdAt: "asc" }, { code: "asc" }] });
    if (!all.length) return fail("NOT_FOUND", R.notFound);
    targets = all.filter((r) => r.status === "HOLD" || r.status === "CONFIRMED");
  } else {
    const rv = await loadRv(c, p.data.reservationId ?? null);
    if (!rv) return fail("NOT_FOUND", R.notFound);
    all = await groupRows(c, rv);
    targets = rv.status === "HOLD" || rv.status === "CONFIRMED" ? [rv] : [];
  }
  if (!targets.length) return fail("INVALID_STATUS", "การจองนี้ยกเลิกไม่ได้ (ยกเลิกแล้ว · เข้าพักแล้ว · หรือไม่มาแล้ว)");
  const targetIds = new Set(targets.map((r) => r.id));
  const remaining = all.filter((r) => !targetIds.has(r.id) && (ACTIVE as readonly string[]).includes(r.status));
  const head = all.find((r) => r.depositPaidAt) ?? all.find((r) => r.depositSatang > 0) ?? null;
  const headCancelled = !!head && targetIds.has(head.id);
  const moveHeadTo = headCancelled && remaining.length ? remaining[0] : null;
  const settles = headCancelled && !moveHeadTo && !!head?.depositPaidAt;
  const st = settles && head ? await depositState(c, head.depositSaleId) : null;
  const paid = st?.remaining ?? 0;
  if (paid > 0 && !can(g, "hotel.booking.manage")) return fail("FORBIDDEN", R.money);
  const rules = head ? cancelRulesOfSnapshot(head.policySnapshot) : [];
  const refund = head && paid > 0 ? refundFor({ paidSatang: paid, checkInDate: ymdOfDb(head.checkInDate), cancelAt: today, rules }).refundSatang : 0;
  const reason = p.data.reason;
  const out = await inTx(c, async (tx) => {
    for (const r of targets) {
      const upd = await tx.hotelReservation.updateMany({ where: { id: r.id, status: { in: ["HOLD", "CONFIRMED"] } }, data: { status: "CANCELLED", cancelledAt: now, cancelReason: reason } });
      if (upd.count === 0) throw new Abort(fail("INVALID_STATUS", "การจองนี้ถูกยกเลิกหรือเปลี่ยนสถานะไปแล้ว"));
      await releaseStayTx(tx, c, r.id, reason);
      await emitEv(tx, c, "cancelled", r, "CANCELLED", randomUUID());
      const isHead = head?.id === r.id;
      await audit(tx, c, g.actor, "hotel.booking.cancelled", r.id, { status: r.status }, {
        status: "CANCELLED",
        reason,
        ...(isHead && settles ? { paidSatang: paid, refundSatang: refund, forfeitSatang: paid - refund, cancelAt: today } : {}),
        ...(isHead && moveHeadTo ? { depositMovedTo: moveHeadTo.id } : {}),
      });
    }
    if (head && moveHeadTo) {
      await tx.hotelReservation.update({ where: { id: moveHeadTo.id }, data: { depositSatang: head.depositSatang, depositPaidAt: head.depositPaidAt, depositSaleId: head.depositSaleId } });
      await tx.hotelReservation.update({ where: { id: head.id }, data: { depositSatang: 0, depositPaidAt: null, depositSaleId: null } });
    }
    return { ok: true as const };
  });
  if (isFail(out)) return out;
  let money: MoneyOut = { refundSatang: 0, forfeitSatang: 0, error: null };
  if (st && head && paid > 0) money = await settleCancelMoney(c, st, head, refund, g.actor?.userId ?? SYSTEM_ACTOR_ID);
  return { ok: true as const, cancelled: targets.map((r) => r.id), refundSatang: money.refundSatang, forfeitSatang: money.forfeitSatang, ...(money.error ? { moneyWarning: `ยกเลิกแล้ว แต่จัดการเงินมัดจำไม่สำเร็จ (${money.error}) — คืน/ริบที่หน้าขาย` } : {}) };
}

/** ตัวช่วยจอ: ยอดคืนตามขั้นบันได ถ้ายกเลิกตอนนี้ (อ่านอย่างเดียว) */
export function refundPreview(rv: { policySnapshot: unknown; checkInDate: Date; depositSatang: number; depositPaidAt: Date | null }, today: string) {
  const paid = rv.depositPaidAt ? rv.depositSatang : 0;
  const r = refundFor({ paidSatang: paid, checkInDate: ymdOfDb(rv.checkInDate), cancelAt: today, rules: cancelRulesOfSnapshot(rv.policySnapshot) });
  return { paidSatang: paid, refundSatang: r.refundSatang, forfeitSatang: paid - r.refundSatang, daysBefore: r.daysBefore, rule: r.ruleUsed };
}

// ───────────────────────── extendBooking / shortenBooking ─────────────────────────
const ChangeOutInput = z.object({ newCheckOut: ymdZ });

/** ต่อคืน: guard tx เฉพาะคืนใหม่ · ราคา = quote ณ ปัจจุบัน · ห้องเดิมไม่ว่าง ⇒ ROOM_BUSY + ห้องที่ย้ายไปได้ (ไม่ย้ายเอง) */
export async function extendBooking(actorIn: unknown, ctx: unknown, input: unknown) {
  const g = await gate(actorIn, ctx, input, "hotel.booking.manage");
  if (isFail(g)) return g;
  const p = ChangeOutInput.safeParse(input);
  if (!p.success) return fail("INVALID_INPUT", "วันออกใหม่ไม่ถูกต้อง");
  const c: Ctx = { tenantId: g.tenantId, unitId: g.unitId };
  const now = clockOf(input);
  const rv = await loadRv(c, idOfInput(input));
  if (!rv) return fail("NOT_FOUND", R.notFound);
  if (!(ACTIVE as readonly string[]).includes(rv.status)) return fail("INVALID_STATUS", R.status);
  const ci = ymdOfDb(rv.checkInDate);
  const co = ymdOfDb(rv.checkOutDate);
  const newCo = p.data.newCheckOut;
  if (!(newCo > co)) return fail("INVALID_INPUT", "วันออกใหม่ต้องอยู่หลังวันออกเดิม (ย่นคืนใช้ปุ่มย่นคืน)");
  const q = await quoteNights(c, rv, rv.roomTypeId, co, newCo, bkkYmd(now));
  if (isFail(q)) return q;
  const out = await inTx(c, async (tx) => {
    await lockTypes(tx, c.unitId, [rv.roomTypeId]);
    const cur = await tx.hotelReservation.findFirst({ where: { id: rv.id } });
    if (!cur || cur.status !== rv.status || ymdOfDb(cur.checkOutDate) !== co) throw new Abort(fail("INVALID_STATUS", "การจองนี้เพิ่งถูกแก้ — โหลดใหม่แล้วลองอีกครั้ง"));
    const av = await availabilityInTx(tx, { ...c, roomTypeIds: [rv.roomTypeId], from: co, to: newCo, excludeReservationIds: [rv.id] });
    const need = new Map(nightDates(co, newCo).map((d) => [`${rv.roomTypeId}|${d}`, 1]));
    const short = shortDates(av, need);
    if (short.length) throw new Abort(fail("AVAILABILITY_CHANGED", R.full, { dates: short }));
    const occ = await activeOcc(tx, c, rv.id);
    for (const o of occ) {
      const r = await resizeOccupancy(tx, { ...c, occupancyId: o.id, end: newCo });
      if (!r.ok) {
        const rooms = await freeRoomsTx(tx, c, { roomTypeId: rv.roomTypeId, from: ci, to: newCo, exceptRefIds: [rv.id], now });
        throw new Abort(fail("ROOM_BUSY", "ห้องเดิมไม่ว่างในคืนที่ต่อ — ย้ายห้องก่อนแล้วค่อยต่อคืน", { suggest: { action: "MOVE_ROOM", rooms } }));
      }
    }
    const roomId = occ[0]?.roomId ?? null;
    for (const n of q.nights) {
      const ex = await tx.hotelBookingNight.findFirst({ where: { tenantId: c.tenantId, unitId: c.unitId, reservationId: rv.id, date: dbDate(n.date) }, select: { id: true } });
      if (ex) await tx.hotelBookingNight.update({ where: { id: ex.id }, data: { counted: true, priceSatang: n.priceSatang, priceSource: n.source, roomId, roomTypeId: rv.roomTypeId, ratePlanId: q.ratePlanId } });
      else await tx.hotelBookingNight.create({ data: { tenantId: c.tenantId, unitId: c.unitId, reservationId: rv.id, roomTypeId: rv.roomTypeId, roomId, date: dbDate(n.date), priceSatang: n.priceSatang, priceSource: n.source, ratePlanId: q.ratePlanId, counted: true } });
    }
    const ns = await countedNights(tx, c, rv.id);
    const total = ns.reduce((a, n) => a + n.priceSatang, 0);
    const after = await tx.hotelReservation.update({ where: { id: rv.id }, data: { checkOutDate: dbDate(newCo), nights: ns.length, totalSatang: total } });
    await emitEv(tx, c, "changed", rv, rv.status, randomUUID());
    await audit(tx, c, g.actor, "hotel.booking.extended", rv.id, auditView(rv), { ...auditView(after), addedNights: q.nights.map((n) => ({ date: n.date, priceSatang: n.priceSatang, source: n.source })) });
    return { ok: true as const, checkOut: newCo, nights: ns.length, totalSatang: total, addedSatang: q.nights.reduce((a, n) => a + n.priceSatang, 0) };
  });
  return out;
}

/** ราคาคืนที่จะต่อ (อ่านอย่างเดียว · ให้จอแสดงก่อนยืนยัน) — ราคา ณ ปัจจุบันของแผนการจอง */
export async function quoteExtension(actorIn: unknown, ctx: unknown, input: unknown) {
  const g = await gate(actorIn, ctx, input, "hotel.booking.manage");
  if (isFail(g)) return g;
  const p = ChangeOutInput.safeParse(input);
  if (!p.success) return fail("INVALID_INPUT", "วันออกใหม่ไม่ถูกต้อง");
  const c: Ctx = { tenantId: g.tenantId, unitId: g.unitId };
  const rv = await loadRv(c, idOfInput(input));
  if (!rv) return fail("NOT_FOUND", R.notFound);
  const co = ymdOfDb(rv.checkOutDate);
  if (!(p.data.newCheckOut > co)) return fail("INVALID_INPUT", "วันออกใหม่ต้องอยู่หลังวันออกเดิม");
  const q = await quoteNights(c, rv, rv.roomTypeId, co, p.data.newCheckOut, bkkYmd(clockOf(input)));
  if (isFail(q)) return q;
  return { ok: true as const, nights: q.nights, addedSatang: q.nights.reduce((a, n) => a + n.priceSatang, 0) };
}

/** ย่นคืน: คืนอนาคต counted=false (แถวคงอยู่) · คืนที่ปิดวันแล้ว (postedAuditId) ⇒ SHORTEN_POSTED ไม่ตัดบางส่วน · ไม่คืนเงินอัตโนมัติ (S:923) */
export async function shortenBooking(actorIn: unknown, ctx: unknown, input: unknown) {
  const g = await gate(actorIn, ctx, input, "hotel.booking.manage");
  if (isFail(g)) return g;
  const p = ChangeOutInput.safeParse(input);
  if (!p.success) return fail("INVALID_INPUT", "วันออกใหม่ไม่ถูกต้อง");
  const c: Ctx = { tenantId: g.tenantId, unitId: g.unitId };
  const rv = await loadRv(c, idOfInput(input));
  if (!rv) return fail("NOT_FOUND", R.notFound);
  if (!(ACTIVE as readonly string[]).includes(rv.status)) return fail("INVALID_STATUS", R.status);
  const ci = ymdOfDb(rv.checkInDate);
  const co = ymdOfDb(rv.checkOutDate);
  const newCo = p.data.newCheckOut;
  if (!(newCo > ci) || !(newCo < co)) return fail("INVALID_INPUT", "วันออกใหม่ต้องอยู่หลังวันเข้าและก่อนวันออกเดิม");
  const out = await inTx(c, async (tx) => {
    const cur = await tx.hotelReservation.findFirst({ where: { id: rv.id } });
    if (!cur || cur.status !== rv.status || ymdOfDb(cur.checkOutDate) !== co) throw new Abort(fail("INVALID_STATUS", "การจองนี้เพิ่งถูกแก้ — โหลดใหม่แล้วลองอีกครั้ง"));
    const drop = await tx.hotelBookingNight.findMany({ where: { tenantId: c.tenantId, unitId: c.unitId, reservationId: rv.id, counted: true, date: { gte: dbDate(newCo) } }, select: { id: true, postedAuditId: true, date: true } });
    const posted = drop.filter((n) => n.postedAuditId);
    if (posted.length) throw new Abort(fail("SHORTEN_POSTED", "มีคืนที่ปิดวันแล้วในช่วงที่จะย่น — ย่นทับคืนที่ลงบัญชีแล้วไม่ได้", { dates: posted.map((n) => ymdOfDb(n.date)) }));
    await tx.hotelBookingNight.updateMany({ where: { id: { in: drop.map((n) => n.id) } }, data: { counted: false } });
    for (const o of await activeOcc(tx, c, rv.id)) {
      const r = await resizeOccupancy(tx, { ...c, occupancyId: o.id, end: newCo });
      if (!r.ok) throw new Abort(fail("INVALID_INPUT", "ย่นช่วงห้องไม่สำเร็จ"));
    }
    const ns = await countedNights(tx, c, rv.id);
    const total = ns.reduce((a, n) => a + n.priceSatang, 0);
    const after = await tx.hotelReservation.update({ where: { id: rv.id }, data: { checkOutDate: dbDate(newCo), nights: ns.length, totalSatang: total } });
    await emitEv(tx, c, "changed", rv, rv.status, randomUUID());
    await audit(tx, c, g.actor, "hotel.booking.shortened", rv.id, auditView(rv), { ...auditView(after), droppedNights: drop.map((n) => ymdOfDb(n.date)) });
    return { ok: true as const, checkOut: newCo, nights: ns.length, totalSatang: total };
  });
  return out;
}

// ───────────────────────── assignRoom ─────────────────────────
const AssignInput = z.object({ roomId: z.string().min(1, { message: "เลือกห้อง" }) });

type RoomCheck = { id: string; number: string; roomTypeId: string } | BookingFail;
async function roomForAssign(c: Ctx, roomId: string): Promise<RoomCheck> {
  const room = await tenantDb(c).hotelRoom.findFirst({ where: { id: roomId }, select: { id: true, number: true, roomTypeId: true, active: true, status: true, hkStatus: true, rentMode: true, roomType: { select: { rentMode: true } } } });
  if (!room) return fail("NOT_FOUND", "ไม่พบห้องนี้ในโรงแรมนี้");
  if (!room.active || room.status === "OOO" || room.hkStatus === "OUT_OF_ORDER") return fail("ROOM_INACTIVE", `ห้อง ${room.number} ปิดซ่อม/ปิดใช้งานอยู่`);
  if (!isSellableNightly({ active: room.active, status: room.status, hkStatus: room.hkStatus, rentMode: room.rentMode, typeRentMode: room.roomType.rentMode })) return fail("ROOM_INACTIVE", `ห้อง ${room.number} เปิดให้เช่ารายเดือนเท่านั้น`);
  return { id: room.id, number: room.number, roomTypeId: room.roomTypeId };
}

/** กำหนด/ย้ายห้องจริง (HOLD/CONFIRMED) — ต่างประเภทได้โดยไม่คิดส่วนต่าง (S:911) แต่ต้องผ่านชั้นประเภทห้องของประเภทใหม่ */
export async function assignRoom(actorIn: unknown, ctx: unknown, input: unknown) {
  const g = await gate(actorIn, ctx, input, "hotel.booking.manage");
  if (isFail(g)) return g;
  const p = AssignInput.safeParse(input);
  if (!p.success) return fail("INVALID_INPUT", zodReason(p.error));
  const c: Ctx = { tenantId: g.tenantId, unitId: g.unitId };
  const now = clockOf(input);
  const rv = await loadRv(c, idOfInput(input));
  if (!rv) return fail("NOT_FOUND", R.notFound);
  if (rv.status !== "HOLD" && rv.status !== "CONFIRMED") return fail("INVALID_STATUS", "กำหนดห้องได้เฉพาะการจองที่ยังไม่เข้าพัก");
  const room = await roomForAssign(c, p.data.roomId);
  if (isFail(room)) return room;
  const ci = ymdOfDb(rv.checkInDate);
  const co = ymdOfDb(rv.checkOutDate);
  const typeChange = room.roomTypeId !== rv.roomTypeId;
  const out = await inTx(c, async (tx) => {
    await lockTypes(tx, c.unitId, [rv.roomTypeId, room.roomTypeId]);
    const ns = await countedNights(tx, c, rv.id);
    if (typeChange && ns.length) {
      const need = new Map(ns.map((n) => [`${room.roomTypeId}|${ymdOfDb(n.date)}`, 1]));
      const av = await availabilityInTx(tx, { ...c, roomTypeIds: [room.roomTypeId], from: ymdOfDb(ns[0].date), to: addDaysYmd(ymdOfDb(ns[ns.length - 1].date), 1), excludeReservationIds: [rv.id] });
      const short = shortDates(av, need);
      if (short.length) throw new Abort(fail("AVAILABILITY_CHANGED", "ประเภทห้องปลายทางเต็มในบางคืน", { dates: short }));
    }
    const occ = await activeOcc(tx, c, rv.id);
    if (occ.length) {
      for (const o of occ) {
        if (o.roomId === room.id) continue;
        const m = await moveOccupancy(tx, { ...c, occupancyId: o.id, toRoomId: room.id });
        if (!m.ok) throw new Abort(m.code === "ROOM_INACTIVE" ? fail("ROOM_INACTIVE", `ห้อง ${room.number} ปิดใช้งานอยู่`) : fail("ROOM_BUSY", `ห้อง ${room.number} ถูกใช้ในช่วงนี้แล้ว`));
      }
    } else {
      const hk = kindOf(rv.status, rv.holdExpiresAt);
      const r = await claimRoom(tx, { ...c, roomId: room.id, start: ci, end: co, kind: hk.kind, holdExpiresAt: hk.holdExpiresAt, refType: HOTEL_REF, refId: rv.id, requireRentMode: "NIGHTLY" });
      if (!r.ok) throw new Abort(r.code === "ROOM_TAKEN" ? fail("ROOM_BUSY", `ห้อง ${room.number} ถูกใช้ในช่วงนี้แล้ว`) : fail("ROOM_INACTIVE", `ห้อง ${room.number} รับการจองนี้ไม่ได้`));
    }
    await tx.hotelBookingNight.updateMany({ where: { tenantId: c.tenantId, unitId: c.unitId, reservationId: rv.id, counted: true }, data: { roomId: room.id, ...(typeChange ? { roomTypeId: room.roomTypeId } : {}) } });
    const after = await tx.hotelReservation.update({ where: { id: rv.id }, data: { roomId: room.id, ...(typeChange ? { roomTypeId: room.roomTypeId } : {}) } });
    if (rv.roomId !== room.id || typeChange) {
      await emitEv(tx, c, "changed", rv, rv.status, randomUUID());
      await audit(tx, c, g.actor, "hotel.booking.room_assigned", rv.id, auditView(rv), { ...auditView(after), noPriceDiff: typeChange });
    }
    return { ok: true as const, roomId: room.id, roomNumber: room.number };
  });
  void now;
  return out;
}

// ───────────────────────── rescheduleBooking (ฐานการลากของ H.2) ─────────────────────────
const ReschedInput = z.object({ roomId: z.string().min(1).optional().nullable(), checkIn: ymdZ.optional().nullable(), checkOut: ymdZ.optional().nullable() });

/**
 * ย้ายการครองห้องที่ขวาง (การจอง HOLD/CONFIRMED ที่ยังไม่เข้าพัก · ประเภทที่ถือล็อกอยู่) ไปห้องว่างอื่นของประเภทนั้น — "จัดห้องใหม่"
 * (ห้องจริงของการจองที่ยังไม่เช็กอินเป็นการจัดของระบบ · ใบ §2 ข้อ 1) · ย้ายไม่ได้แม้รายการเดียว ⇒ false (ผู้เรียก Abort ทั้ง tx)
 */
async function repackRoom(tx: Tx, c: Ctx, q: { roomId: string; from: string; to: string; exceptRvId: string; lockedTypes: string[]; now: Date }): Promise<boolean> {
  const conflicts = await tx.roomOccupancy.findMany({
    where: { tenantId: c.tenantId, unitId: c.unitId, roomId: q.roomId, active: true, startDate: { lt: dbDate(q.to) }, endDate: { gt: dbDate(q.from) } },
    select: { id: true, kind: true, refType: true, refId: true, holdExpiresAt: true, startDate: true, endDate: true },
  });
  for (const o of conflicts) {
    if (o.refType === HOTEL_REF && o.refId === q.exceptRvId) continue;
    if ((o.kind === "HOLD" || o.kind === "CHANNEL_HOLD") && o.holdExpiresAt && o.holdExpiresAt <= q.now) continue; // claimRoom ปิดให้เอง
    if (o.refType !== HOTEL_REF) return false;
    const other = await tx.hotelReservation.findFirst({ where: { id: o.refId }, select: { id: true, status: true, roomTypeId: true } });
    if (!other || (other.status !== "HOLD" && other.status !== "CONFIRMED") || !q.lockedTypes.includes(other.roomTypeId)) return false;
    const s = ymdOfDb(o.startDate);
    const e = ymdOfDb(o.endDate);
    const dest = (await freeRoomsTx(tx, c, { roomTypeId: other.roomTypeId, from: s, to: e, exceptRefIds: [q.exceptRvId], excludeRoomIds: [q.roomId], now: q.now, bestFit: true }))[0];
    if (!dest) return false;
    const m = await moveOccupancy(tx, { ...c, occupancyId: o.id, toRoomId: dest.id });
    if (!m.ok) return false;
    await tx.hotelBookingNight.updateMany({ where: { tenantId: c.tenantId, unitId: c.unitId, reservationId: other.id, roomId: q.roomId }, data: { roomId: dest.id } });
    await tx.hotelReservation.update({ where: { id: other.id }, data: { roomId: dest.id } });
  }
  return true;
}

/**
 * ย้ายห้อง + เลื่อนวันเข้า/ออก ใน guard tx เดียว (มติผู้คุม 7 พ.ย. จากข้อสอบ h.2) — HOLD/CONFIRMED เลื่อนวันเข้าได้ · CHECKED_IN เลื่อนได้เฉพาะวันออก
 * คืนที่ยังนับอยู่คงราคาเดิม · คืนใหม่ = quote ปัจจุบัน · ล้ม = ไม่เปลี่ยนอะไร
 */
export async function rescheduleBooking(actorIn: unknown, ctx: unknown, input: unknown) {
  const g = await gate(actorIn, ctx, input, "hotel.booking.manage");
  if (isFail(g)) return g;
  const p = ReschedInput.safeParse(input);
  if (!p.success) return fail("INVALID_INPUT", "วันที่ไม่ถูกต้อง");
  const c: Ctx = { tenantId: g.tenantId, unitId: g.unitId };
  const now = clockOf(input);
  const today = bkkYmd(now);
  const rv = await loadRv(c, idOfInput(input));
  if (!rv) return fail("NOT_FOUND", R.notFound);
  if (!(ACTIVE as readonly string[]).includes(rv.status)) return fail("INVALID_STATUS", R.status);
  const ci = ymdOfDb(rv.checkInDate);
  const co = ymdOfDb(rv.checkOutDate);
  const newCi = p.data.checkIn ?? ci;
  const newCo = p.data.checkOut ?? co;
  if (rv.status === "CHECKED_IN" && newCi !== ci) return fail("INVALID_STATUS", "เข้าพักแล้ว — เลื่อนได้เฉพาะวันออก");
  if (!(newCo > newCi)) return fail("INVALID_INPUT", "วันออกต้องอยู่หลังวันเข้าอย่างน้อย 1 คืน");
  if (newCi !== ci && newCi < today) return fail("PAST_DATE", "วันเข้าใหม่ผ่านไปแล้ว");
  const room = p.data.roomId ? await roomForAssign(c, p.data.roomId) : null;
  if (room && isFail(room)) return room;
  const targetType = room ? room.roomTypeId : rv.roomTypeId;
  const typeChange = targetType !== rv.roomTypeId;
  const newDates = nightsOf(newCi, newCo);
  const out = await inTx(c, async (tx) => {
    const lockedTypes = [...new Set([rv.roomTypeId, targetType])];
    await lockTypes(tx, c.unitId, lockedTypes);
    const cur = await tx.hotelReservation.findFirst({ where: { id: rv.id } });
    if (!cur || cur.status !== rv.status || ymdOfDb(cur.checkInDate) !== ci || ymdOfDb(cur.checkOutDate) !== co) throw new Abort(fail("INVALID_STATUS", "การจองนี้เพิ่งถูกแก้ — โหลดใหม่แล้วลองอีกครั้ง"));
    const all = await tx.hotelBookingNight.findMany({ where: { tenantId: c.tenantId, unitId: c.unitId, reservationId: rv.id }, select: { id: true, date: true, counted: true, priceSatang: true, postedAuditId: true } });
    const byDate = new Map(all.map((n) => [ymdOfDb(n.date), n]));
    const keep = new Set(newDates);
    const dropPosted = all.filter((n) => n.counted && !keep.has(ymdOfDb(n.date)) && n.postedAuditId);
    if (dropPosted.length) throw new Abort(fail("SHORTEN_POSTED", "มีคืนที่ปิดวันแล้วอยู่นอกช่วงใหม่ — เลื่อนทับคืนที่ลงบัญชีแล้วไม่ได้", { dates: dropPosted.map((n) => ymdOfDb(n.date)) }));
    const needDates = newDates.filter((d) => typeChange || !byDate.get(d)?.counted);
    if (needDates.length) {
      const av = await availabilityInTx(tx, { ...c, roomTypeIds: [targetType], from: needDates[0], to: addDaysYmd(needDates[needDates.length - 1], 1), excludeReservationIds: [rv.id] });
      const short = shortDates(av, new Map(needDates.map((d) => [`${targetType}|${d}`, 1])));
      if (short.length) throw new Abort(fail("AVAILABILITY_CHANGED", R.full, { dates: short }));
    }
    const fresh = newDates.filter((d) => !byDate.get(d)?.counted);
    const priced = new Map<string, { priceSatang: number; source: string }>();
    for (const [from, to] of runsOf(fresh)) {
      const q = await quoteNights(c, rv, targetType, from, to, today);
      if (isFail(q)) throw new Abort(q);
      for (const n of q.nights) priced.set(n.date, { priceSatang: n.priceSatang, source: n.source });
    }
    // ห้องจริง: ปล่อยของเดิมแล้วถือช่วงใหม่ (ห้องที่ระบุ · ห้องเดิม) — ห้องขวางโดยการจองที่ยังไม่เข้าพัก ⇒ จัดห้องให้รายการนั้นใหม่
    const occ = await activeOcc(tx, c, rv.id);
    const hk = kindOf(rv.status, rv.holdExpiresAt);
    const roomId = room ? room.id : (occ[0]?.roomId ?? null);
    for (const o of occ) await releaseOccupancy(tx, { ...c, occupancyId: o.id, reason: "เลื่อน/ย้ายการจอง" });
    if (roomId) {
      const claim = () => claimRoom(tx, { ...c, roomId, start: newCi, end: newCo, kind: hk.kind, holdExpiresAt: hk.holdExpiresAt, refType: HOTEL_REF, refId: rv.id, requireRentMode: "NIGHTLY" });
      let r = await claim();
      if (!r.ok && r.code === "ROOM_TAKEN" && (await repackRoom(tx, c, { roomId, from: newCi, to: newCo, exceptRvId: rv.id, lockedTypes, now }))) r = await claim();
      if (!r.ok) throw new Abort(r.code === "ROOM_TAKEN" ? fail("ROOM_BUSY", "ห้องนี้ไม่ว่างในช่วงใหม่ — เลือกห้องอื่น") : fail("ROOM_INACTIVE", "ห้องนี้รับการจองช่วงนี้ไม่ได้"));
    }
    for (const n of all) if (n.counted && !keep.has(ymdOfDb(n.date))) await tx.hotelBookingNight.update({ where: { id: n.id }, data: { counted: false, roomId: null } });
    for (const d of newDates) {
      const ex = byDate.get(d);
      const pr = priced.get(d);
      if (ex && ex.counted) await tx.hotelBookingNight.update({ where: { id: ex.id }, data: { roomId, ...(typeChange ? { roomTypeId: targetType } : {}) } });
      else if (ex && pr) await tx.hotelBookingNight.update({ where: { id: ex.id }, data: { counted: true, roomId, roomTypeId: targetType, priceSatang: pr.priceSatang, priceSource: pr.source } });
      else if (pr) await tx.hotelBookingNight.create({ data: { tenantId: c.tenantId, unitId: c.unitId, reservationId: rv.id, roomTypeId: targetType, roomId, date: dbDate(d), priceSatang: pr.priceSatang, priceSource: pr.source, ratePlanId: rv.ratePlanId, counted: true } });
    }
    const ns = await countedNights(tx, c, rv.id);
    const total = ns.reduce((a, n) => a + n.priceSatang, 0);
    const after = await tx.hotelReservation.update({ where: { id: rv.id }, data: { checkInDate: dbDate(newCi), checkOutDate: dbDate(newCo), nights: ns.length, totalSatang: total, roomId, ...(typeChange ? { roomTypeId: targetType } : {}) } });
    await emitEv(tx, c, "changed", rv, rv.status, randomUUID());
    await audit(tx, c, g.actor, "hotel.booking.rescheduled", rv.id, auditView(rv), auditView(after));
    return { ok: true as const, checkIn: newCi, checkOut: newCo, roomId, nights: ns.length, totalSatang: total };
  });
  return out;
}
/** ช่วงวันต่อเนื่อง [from, to) จากรายการวันที่เรียงแล้ว */
function runsOf(dates: string[]): [string, string][] {
  const out: [string, string][] = [];
  for (const d of [...dates].sort()) {
    const last = out[out.length - 1];
    if (last && last[1] === d) last[1] = addDaysYmd(d, 1);
    else out.push([d, addDaysYmd(d, 1)]);
  }
  return out;
}

// ───────────────────────── markNoShow / undoNoShow ─────────────────────────
/** ไม่มา (มือ): CONFIRMED + วันเข้า ≤ วันนี้ไทย · นโยบายจาก snapshot: ริบ+ปล่อย / ริบ+ถือห้องต่อ / คืนเต็ม+ปล่อย */
export async function markNoShow(actorIn: unknown, ctx: unknown, input: unknown) {
  const g = await gate(actorIn, ctx, input, "hotel.booking.manage");
  if (isFail(g)) return g;
  const c: Ctx = { tenantId: g.tenantId, unitId: g.unitId };
  const now = clockOf(input);
  const today = bkkYmd(now);
  const rv = await loadRv(c, idOfInput(input));
  if (!rv) return fail("NOT_FOUND", R.notFound);
  if (rv.status !== "CONFIRMED") return fail("INVALID_STATUS", "ตั้ง «ไม่มา» ได้เฉพาะการจองที่ยืนยันแล้วและยังไม่เข้าพัก");
  if (ymdOfDb(rv.checkInDate) > today) return fail("INVALID_STATUS", "ยังไม่ถึงวันเข้าพัก — ตั้ง «ไม่มา» ไม่ได้");
  const policy = noShowPolicyOf(rv.policySnapshot);
  const release = policy !== "FORFEIT_HOLD_STAY";
  const all = await groupRows(c, rv);
  const head = all.find((r) => r.depositPaidAt) ?? null;
  const others = all.filter((r) => r.id !== rv.id && (ACTIVE as readonly string[]).includes(r.status));
  const isHead = head?.id === rv.id;
  const moveHeadTo = isHead && others.length ? others[0] : null;
  const settle = isHead && !moveHeadTo;
  const out = await inTx(c, async (tx) => {
    const upd = await tx.hotelReservation.updateMany({ where: { id: rv.id, status: "CONFIRMED" }, data: { status: "NO_SHOW", noShowAt: now } });
    if (upd.count === 0) throw new Abort(fail("INVALID_STATUS", "การจองนี้เปลี่ยนสถานะไปแล้ว"));
    if (release) await releaseStayTx(tx, c, rv.id, "ไม่มาเข้าพัก");
    if (head && moveHeadTo) {
      await tx.hotelReservation.update({ where: { id: moveHeadTo.id }, data: { depositSatang: head.depositSatang, depositPaidAt: head.depositPaidAt, depositSaleId: head.depositSaleId } });
      await tx.hotelReservation.update({ where: { id: head.id }, data: { depositSatang: 0, depositPaidAt: null, depositSaleId: null } });
    }
    await emitEv(tx, c, "no_show", rv, "NO_SHOW", randomUUID());
    await audit(tx, c, g.actor, "hotel.booking.no_show", rv.id, { status: "CONFIRMED" }, { status: "NO_SHOW", policy, released: release, ...(moveHeadTo ? { depositMovedTo: moveHeadTo.id } : {}) });
    return { ok: true as const };
  });
  if (isFail(out)) return out;
  let money: MoneyOut = { refundSatang: 0, forfeitSatang: 0, error: null };
  if (settle && head?.depositSaleId) {
    const st = await depositState(c, head.depositSaleId);
    if (st && st.remaining > 0) {
      const actorId = g.actor?.userId ?? SYSTEM_ACTOR_ID;
      if (policy === "REFUND_RELEASE") {
        const r = await refundAll(c, st.receiptSaleId, `ไม่มาเข้าพัก ${rv.code} — คืนมัดจำตามนโยบาย`, actorId);
        money = { ...r, refundSatang: r.error ? 0 : st.remaining };
      } else money = await forfeitAll(c, st, rv.id, `ไม่มาเข้าพัก ${rv.code}`, actorId);
    }
  }
  return { ok: true as const, policy, refundSatang: money.refundSatang, forfeitSatang: money.forfeitSatang, ...(money.error ? { moneyWarning: `ตั้งไม่มาแล้ว แต่จัดการมัดจำไม่สำเร็จ (${money.error}) — คืน/ริบที่หน้าขาย` } : {}) };
}

/** ย้อน «ไม่มา» → ยืนยัน: MANAGER/OWNER ภายในวันเดียวกัน (ไทย) · ผ่าน guard tx (ห้องต้องยังว่าง) · ไม่คืนเงินที่ริบไปแล้วอัตโนมัติ (มติ §11 ข้อ 8) */
export async function undoNoShow(actorIn: unknown, ctx: unknown, input: unknown) {
  const g = await gate(actorIn, ctx, input, "hotel.booking.manage");
  if (isFail(g)) return g;
  const c: Ctx = { tenantId: g.tenantId, unitId: g.unitId };
  const now = clockOf(input);
  const role = g.actor?.role ?? "STAFF";
  if (role !== "OWNER" && role !== "MANAGER") return fail("FORBIDDEN", "ย้อนสถานะ «ไม่มา» ได้เฉพาะผู้จัดการหรือเจ้าของ");
  const rv = await loadRv(c, idOfInput(input));
  if (!rv) return fail("NOT_FOUND", R.notFound);
  if (rv.status !== "NO_SHOW") return fail("INVALID_STATUS", "การจองนี้ไม่ได้อยู่ในสถานะ «ไม่มา»");
  const sameDay = !!rv.noShowAt && bkkYmd(rv.noShowAt) === bkkYmd(now);
  if (!canTransition("NO_SHOW", "CONFIRMED", { role, sameDay })) return fail("NOT_SAME_DAY", "ย้อนสถานะ «ไม่มา» ได้เฉพาะภายในวันเดียวกัน");
  const ci = ymdOfDb(rv.checkInDate);
  const co = ymdOfDb(rv.checkOutDate);
  const out = await inTx(c, async (tx) => {
    await lockTypes(tx, c.unitId, [rv.roomTypeId]);
    const counted = await countedNights(tx, c, rv.id);
    if (counted.length === 0) {
      const av = await availabilityInTx(tx, { ...c, roomTypeIds: [rv.roomTypeId], from: ci, to: co, excludeReservationIds: [rv.id] });
      const short = shortDates(av, new Map(nightDates(ci, co).map((d) => [`${rv.roomTypeId}|${d}`, 1])));
      if (short.length) throw new Abort(fail("AVAILABILITY_CHANGED", "ห้องประเภทนี้ถูกจองไปแล้ว — ย้อนสถานะไม่ได้ ให้ทำเป็นการจองใหม่", { dates: short }));
      await tx.hotelBookingNight.updateMany({ where: { tenantId: c.tenantId, unitId: c.unitId, reservationId: rv.id, date: { gte: dbDate(ci), lt: dbDate(co) } }, data: { counted: true } });
    }
    let roomId: string | null = (await activeOcc(tx, c, rv.id))[0]?.roomId ?? null;
    if (!roomId) {
      roomId = await holdBestRoom(tx, c, { reservationId: rv.id, roomTypeId: rv.roomTypeId, from: ci, to: co, hk: { kind: "STAY", holdExpiresAt: null }, now });
      await tx.hotelBookingNight.updateMany({ where: { tenantId: c.tenantId, unitId: c.unitId, reservationId: rv.id, counted: true }, data: { roomId } });
    }
    const upd = await tx.hotelReservation.updateMany({ where: { id: rv.id, status: "NO_SHOW" }, data: { status: "CONFIRMED", noShowAt: null, roomId } });
    if (upd.count === 0) throw new Abort(fail("INVALID_STATUS", "การจองนี้เปลี่ยนสถานะไปแล้ว"));
    await openFolio(tx, c, rv.id);
    await emitEv(tx, c, "confirmed", rv, "CONFIRMED", `undo-${randomUUID()}`);
    await audit(tx, c, g.actor, "hotel.booking.no_show_undo", rv.id, { status: "NO_SHOW" }, { status: "CONFIRMED", roomId });
    return { ok: true as const, roomId };
  });
  return out;
}

// ───────────────────────── sweepExpiredHolds (minute-job · ข้ามร้าน) ─────────────────────────
/** HOLD 1 ใบที่หมดเวลา ⇒ CANCELLED HOLD_EXPIRED (CAS ⇒ ซ้อนกัน/ซ้ำ = ครั้งเดียว) */
async function expireOne(row: { tenantId: string; unitId: string; id: string }, now: Date): Promise<boolean> {
  const c: Ctx = { tenantId: row.tenantId, unitId: row.unitId };
  const out = await inTx(c, async (tx) => {
    const rv = await tx.hotelReservation.findFirst({ where: { id: row.id }, select: { id: true, code: true, groupId: true, source: true, holdExpiresAt: true } });
    if (!rv) return false;
    const upd = await tx.hotelReservation.updateMany({ where: { id: row.id, status: "HOLD", holdExpiresAt: { lt: now } }, data: { status: "CANCELLED", cancelReason: "HOLD_EXPIRED", cancelledAt: now } });
    if (upd.count === 0) return false;
    await releaseStayTx(tx, c, row.id, "HOLD_EXPIRED");
    await emitEv(tx, c, "hold_expired", rv, "CANCELLED", rv.holdExpiresAt?.toISOString() ?? "none");
    await audit(tx, c, null, "hotel.booking.hold_expired", row.id, { status: "HOLD", holdExpiresAt: rv.holdExpiresAt?.toISOString() ?? null }, { status: "CANCELLED", cancelReason: "HOLD_EXPIRED" });
    return true;
  });
  return out === true;
}

/**
 * HOLD ที่ holdExpiresAt < now ทุกร้าน ⇒ CANCELLED HOLD_EXPIRED · nights counted=false · ปล่อยห้อง · folio VOID · event hold_expired
 * ก้อนละ ≤ 200 · limit = เพดานรวมของรอบ · now ใช้ได้เฉพาะใต้ SVC_QC_CLOCK=1 · ซ้อนกัน/ซ้ำ = แต่ละใบครั้งเดียว (X5)
 * 🔴 อ่าน id ข้ามร้านด้วย $queryRaw ของ client ขยาย (คำสั่ง SQL ดิบไม่ผ่านตัวกรอง scope) — เขียนต่อใบผ่าน tenantDb ของร้านนั้นเท่านั้น
 */
export async function sweepExpiredHolds(input?: unknown): Promise<{ expired: number }> {
  const now = process.env.SVC_QC_CLOCK === "1" && isRec(input) && (input.now instanceof Date || typeof input.now === "string") && !Number.isNaN(new Date(input.now).getTime()) ? new Date(input.now) : new Date();
  const cap = isRec(input) && typeof input.limit === "number" && Number.isInteger(input.limit) && input.limit > 0 ? input.limit : 10_000;
  const scan = tenantDb({ tenantId: "hotel-hold-sweep" });
  let expired = 0;
  for (let round = 0; round < 50 && expired < cap; round++) {
    const batch = Math.min(SWEEP_BATCH, cap - expired);
    const rows = await scan.$queryRaw<{ id: string; tenantId: string; unitId: string }[]>`
      SELECT "id", "tenantId", "unitId" FROM "HotelReservation"
       WHERE "status" = 'HOLD' AND "holdExpiresAt" IS NOT NULL AND "holdExpiresAt" < ${now}
       ORDER BY "holdExpiresAt" ASC, "id" ASC LIMIT ${batch}`;
    if (!rows.length) break;
    let n = 0;
    for (const r of rows) {
      if (expired + n >= cap) break;
      if (await expireOne(r, now)) n++;
    }
    expired += n;
    if (rows.length < batch || n === 0) break;
  }
  return { expired };
}

// ───────────────────────── listBookings / getBooking ─────────────────────────
const VIEW_KEYS = ["hotel.reservation.create", "hotel.reservation.cancel", "hotel.reservation.checkIn", "hotel.reservation.checkOut", "hotel.booking.manage", "hotel.rates.read", "hotel.housekeeping"];
const canView = (g: Gate) => VIEW_KEYS.some((k) => can(g, k));
const STATUS_FILTER = ["HOLD", "CONFIRMED", "CHECKED_IN", "CHECKED_OUT", "CANCELLED", "NO_SHOW", "REFUNDED"] as const;
const ListInput = z.object({
  status: z.enum(STATUS_FILTER).optional().nullable(),
  source: z.enum(SOURCES).optional().nullable(),
  from: ymdZ.optional().nullable(),
  to: ymdZ.optional().nullable(),
  q: z.string().trim().max(80).optional().nullable(),
  page: z.number().int().min(1).max(10_000).optional(),
  pageSize: z.number().int().min(1).max(500).optional(),
});
export type BookingListRow = {
  id: string;
  code: string;
  guestName: string;
  guestPhone: string | null;
  status: string;
  source: string;
  channelRef: string | null;
  checkIn: string;
  checkOut: string;
  nights: number;
  roomTypeId: string;
  roomTypeName: string;
  roomId: string | null;
  roomNumber: string | null;
  totalSatang: number;
  depositSatang: number;
  depositPaid: boolean;
  holdExpiresAt: string | null;
  groupId: string | null;
  groupSize: number;
  createdAt: string;
};

/** รายการการจองของหน่วย (กรอง สถานะ · แหล่ง · ช่วงวันพัก · ค้นหา รหัส/ชื่อ/เบอร์) — ไม่มีโทเคน/ความลับใน DTO */
export async function listBookings(actorIn: unknown, ctx: unknown, input: unknown) {
  const g = await gate(actorIn, ctx, input, null);
  if (isFail(g)) return g;
  if (!canView(g)) return fail("FORBIDDEN", R.forbidden);
  const p = ListInput.safeParse(input);
  if (!p.success) return fail("INVALID_INPUT", zodReason(p.error));
  const c: Ctx = { tenantId: g.tenantId, unitId: g.unitId };
  const db = tenantDb(c);
  const f = p.data;
  const q = f.q?.trim() ?? "";
  const where: Prisma.HotelReservationWhereInput = {
    ...(f.status ? { status: f.status } : {}),
    ...(f.source ? { source: f.source } : {}),
    ...(f.to ? { checkInDate: { lt: dbDate(f.to) } } : {}),
    ...(f.from ? { checkOutDate: { gt: dbDate(f.from) } } : {}),
    ...(q ? { OR: [{ code: { contains: q, mode: "insensitive" } }, { guestName: { contains: q, mode: "insensitive" } }, { guestPhone: { contains: q } }] } : {}),
  };
  const pageSize = f.pageSize ?? 50;
  const page = f.page ?? 1;
  const [total, rows] = await Promise.all([
    db.hotelReservation.count({ where }),
    db.hotelReservation.findMany({
      where,
      orderBy: [{ checkInDate: "desc" }, { code: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true, code: true, guestName: true, guestPhone: true, status: true, source: true, channelRef: true, checkInDate: true, checkOutDate: true, nights: true,
        roomTypeId: true, roomId: true, totalSatang: true, depositSatang: true, depositPaidAt: true, holdExpiresAt: true, groupId: true, createdAt: true,
        roomType: { select: { name: true } }, room: { select: { number: true } },
      },
    }),
  ]);
  const gids = [...new Set(rows.map((r) => r.groupId).filter(isStr))];
  const sizes = gids.length ? await db.hotelReservation.groupBy({ by: ["groupId"], where: { groupId: { in: gids } }, _count: { _all: true } }) : [];
  const sizeOf = new Map(sizes.map((s) => [s.groupId ?? "", s._count._all]));
  const out: BookingListRow[] = rows.map((r) => ({
    id: r.id,
    code: r.code,
    guestName: r.guestName,
    guestPhone: r.guestPhone,
    status: r.status,
    source: r.source,
    channelRef: r.channelRef,
    checkIn: ymdOfDb(r.checkInDate),
    checkOut: ymdOfDb(r.checkOutDate),
    nights: r.nights,
    roomTypeId: r.roomTypeId,
    roomTypeName: r.roomType.name,
    roomId: r.roomId,
    roomNumber: r.room?.number ?? null,
    totalSatang: r.totalSatang,
    depositSatang: r.depositSatang,
    depositPaid: !!r.depositPaidAt,
    holdExpiresAt: r.holdExpiresAt?.toISOString() ?? null,
    groupId: r.groupId,
    groupSize: r.groupId ? (sizeOf.get(r.groupId) ?? 1) : 1,
    createdAt: r.createdAt.toISOString(),
  }));
  return { ok: true as const, rows: out, total, page, pageSize };
}

export type BookingDetail = {
  id: string;
  code: string;
  status: string;
  source: string;
  channelRef: string | null;
  guestName: string;
  guestPhone: string | null;
  guestEmail: string | null;
  adults: number;
  children: number;
  note: string | null;
  checkIn: string;
  checkOut: string;
  nights: { date: string; priceSatang: number; priceSource: string; counted: boolean; roomId: string | null; roomNumber: string | null; posted: boolean }[];
  nightCount: number;
  roomTypeId: string;
  roomTypeName: string;
  roomId: string | null;
  roomNumber: string | null;
  ratePlanId: string | null;
  ratePlanName: string | null;
  totalSatang: number;
  depositSatang: number;
  depositPaidAt: string | null;
  depositSaleId: string | null;
  holdExpiresAt: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  noShowAt: string | null;
  createdAt: string;
  groupId: string | null;
  group: { id: string; code: string; status: string; roomTypeName: string; roomNumber: string | null; depositSatang: number; isHead: boolean }[];
  occupancy: { id: string; roomId: string; roomNumber: string; kind: string; from: string; to: string }[];
  folio: { status: string; balanceSatang: number } | null;
  policySnapshot: unknown;
  taxSnapshot: unknown;
  refund: { paidSatang: number; refundSatang: number; forfeitSatang: number; daysBefore: number } | null;
  cancelRules: CancelRule[];
  noShowPolicy: string;
  history: { action: string; at: string; actorType: string; before: unknown; after: unknown }[];
  today: string;
};

/** รายละเอียดการจอง (คืน · ห้องจริง · folio สรุป · snapshot · ประวัติ AuditLog · กลุ่ม · ยอดคืนถ้ายกเลิกวันนี้) */
export async function getBooking(actorIn: unknown, ctx: unknown, input: unknown) {
  const g = await gate(actorIn, ctx, input, null);
  if (isFail(g)) return g;
  if (!canView(g)) return fail("FORBIDDEN", R.forbidden);
  const c: Ctx = { tenantId: g.tenantId, unitId: g.unitId };
  const db = tenantDb(c);
  const id = idOfInput(input);
  if (!id) return fail("NOT_FOUND", R.notFound);
  const rv = await db.hotelReservation.findFirst({ where: { id }, include: { roomType: { select: { name: true } }, room: { select: { number: true } }, ratePlan: { select: { name: true } } } });
  if (!rv) return fail("NOT_FOUND", R.notFound);
  const today = bkkYmd(clockOf(input));
  const [nights, occ, folio, hist, grp] = await Promise.all([
    db.hotelBookingNight.findMany({ where: { reservationId: rv.id }, orderBy: { date: "asc" } }),
    db.roomOccupancy.findMany({ where: { refType: HOTEL_REF, refId: rv.id, active: true }, select: { id: true, roomId: true, kind: true, startDate: true, endDate: true, room: { select: { number: true } } } }),
    db.hotelFolio.findFirst({ where: { reservationId: rv.id }, select: { status: true, balanceSatang: true } }),
    tenantDb({ tenantId: c.tenantId }).auditLog.findMany({ where: { targetType: "HotelReservation", targetId: rv.id }, orderBy: { createdAt: "asc" }, take: 200, select: { action: true, createdAt: true, actorType: true, before: true, after: true } }),
    rv.groupId ? db.hotelReservation.findMany({ where: { groupId: rv.groupId }, orderBy: [{ createdAt: "asc" }, { code: "asc" }], select: { id: true, code: true, status: true, depositSatang: true, depositPaidAt: true, roomType: { select: { name: true } }, room: { select: { number: true } } } }) : Promise.resolve([]),
  ]);
  const roomIds = [...new Set(nights.map((n) => n.roomId).filter(isStr))];
  const rooms = roomIds.length ? await db.hotelRoom.findMany({ where: { id: { in: roomIds } }, select: { id: true, number: true } }) : [];
  const numOf = new Map(rooms.map((r) => [r.id, r.number]));
  const head = grp.find((r) => r.depositPaidAt) ?? grp.find((r) => r.depositSatang > 0) ?? null;
  const headRow = rv.groupId ? (head ? await db.hotelReservation.findFirst({ where: { id: head.id } }) : null) : rv;
  const preview = headRow && headRow.depositPaidAt ? refundPreview(headRow, today) : null;
  const detail: BookingDetail = {
    id: rv.id,
    code: rv.code,
    status: rv.status,
    source: rv.source,
    channelRef: rv.channelRef,
    guestName: rv.guestName,
    guestPhone: rv.guestPhone,
    guestEmail: rv.guestEmail,
    adults: rv.adults,
    children: rv.children,
    note: rv.note,
    checkIn: ymdOfDb(rv.checkInDate),
    checkOut: ymdOfDb(rv.checkOutDate),
    nights: nights.map((n) => ({ date: ymdOfDb(n.date), priceSatang: n.priceSatang, priceSource: n.priceSource, counted: n.counted, roomId: n.roomId, roomNumber: n.roomId ? (numOf.get(n.roomId) ?? null) : null, posted: !!n.postedAuditId })),
    nightCount: rv.nights,
    roomTypeId: rv.roomTypeId,
    roomTypeName: rv.roomType.name,
    roomId: rv.roomId,
    roomNumber: rv.room?.number ?? null,
    ratePlanId: rv.ratePlanId,
    ratePlanName: rv.ratePlan?.name ?? null,
    totalSatang: rv.totalSatang,
    depositSatang: rv.depositSatang,
    depositPaidAt: rv.depositPaidAt?.toISOString() ?? null,
    depositSaleId: rv.depositSaleId,
    holdExpiresAt: rv.holdExpiresAt?.toISOString() ?? null,
    cancelledAt: rv.cancelledAt?.toISOString() ?? null,
    cancelReason: rv.cancelReason,
    noShowAt: rv.noShowAt?.toISOString() ?? null,
    createdAt: rv.createdAt.toISOString(),
    groupId: rv.groupId,
    group: grp.map((r) => ({ id: r.id, code: r.code, status: r.status, roomTypeName: r.roomType.name, roomNumber: r.room?.number ?? null, depositSatang: r.depositSatang, isHead: head?.id === r.id })),
    occupancy: occ.map((o) => ({ id: o.id, roomId: o.roomId, roomNumber: o.room.number, kind: o.kind, from: ymdOfDb(o.startDate), to: ymdOfDb(o.endDate) })),
    folio: folio ? { status: folio.status, balanceSatang: folio.balanceSatang } : null,
    policySnapshot: rv.policySnapshot,
    taxSnapshot: rv.taxSnapshot,
    refund: preview ? { paidSatang: preview.paidSatang, refundSatang: preview.refundSatang, forfeitSatang: preview.forfeitSatang, daysBefore: preview.daysBefore } : null,
    cancelRules: cancelRulesOfSnapshot((headRow ?? rv).policySnapshot),
    noShowPolicy: noShowPolicyOf(rv.policySnapshot),
    history: hist.map((h) => ({ action: h.action, at: h.createdAt.toISOString(), actorType: String(h.actorType), before: h.before, after: h.after })),
    today,
  };
  return { ok: true as const, booking: detail };
}

/** ห้องที่กำหนดให้การจองนี้ได้ (ประเภทเดียวกันก่อน แล้วประเภทอื่นที่ว่างทั้งช่วง) — ใช้ในจอรายละเอียด */
export async function assignableRoomsFor(actorIn: unknown, ctx: unknown, input: unknown) {
  const g = await gate(actorIn, ctx, input, null);
  if (isFail(g)) return [];
  const c: Ctx = { tenantId: g.tenantId, unitId: g.unitId };
  const rv = await loadRv(c, idOfInput(input));
  if (!rv) return [];
  const types = await tenantDb(c).hotelRoomType.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] });
  const out: { id: string; number: string; roomTypeId: string; roomTypeName: string; sameType: boolean }[] = [];
  const now = new Date();
  const ci = ymdOfDb(rv.checkInDate);
  const co = ymdOfDb(rv.checkOutDate);
  await tenantDb(c).$transaction(async (t) => {
    const tx = t as unknown as Tx;
    for (const ty of [...types].sort((a, b) => Number(b.id === rv.roomTypeId) - Number(a.id === rv.roomTypeId))) {
      for (const r of await freeRoomsTx(tx, c, { roomTypeId: ty.id, from: ci, to: co, exceptRefIds: [rv.id], now })) out.push({ id: r.id, number: r.number, roomTypeId: ty.id, roomTypeName: ty.name, sameType: ty.id === rv.roomTypeId });
    }
  }, TX_OPTS);
  return out;
}
