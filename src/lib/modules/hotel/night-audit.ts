// SVC H.7 ▸ ปิดวัน (night audit) 6 ขั้น · business date ต่อหน่วย · cron ปิดอัตโนมัติ — ใบสั่ง ledger/svc-briefs/svc-brief-h.7.md §0 §2 §3.1–3.2 §9
//   ขั้น 1 no-show: CONFIRMED ที่ checkInDate = วันปิด ⇒ markNoShow ของ H.3 (ริบ/คืนมัดจำผ่าน POS · folio VOID ตาม releaseStayTx · มติ §9.1)
//          ทำ "นอก" tx ปิดวัน ทีละแถว (เงินผ่าน POS · idempotent ด้วย CAS สถานะใน booking.ts) · แถวที่ไม่สำเร็จ = warning ไม่บล็อกการปิดวัน
//   ขั้น 2 post ค่าห้อง: CHECKED_IN ที่มีคืน counted ของวันปิดและยังไม่ post ⇒ postRoomNightsTx ของ H.5 (ตั้ง postedAuditId) ใน tx ปิดวัน
//          คืนก่อน "วันเริ่มใช้ night audit" ไม่ post ย้อน (มติ §2.4 · ค่าห้อง P1 อยู่ใน totalSatang แล้ว)
//   ขั้น 4 freeze KPI ลง HotelNightAudit (unique unitId+businessDate) · ขั้น 5 AuditLog + outbox hotel.audit.closed (อีเมลสรุป = consumer)
//   ขั้น 2+4+5 อยู่ใน tx เดียว (ล้ม ⇒ ย้อนทั้งก้อน · มติ §2.6) · ขั้น 3 markStayoversDirty ของ H.6 หลัง commit (ฟังก์ชันมี tx ของตัวเอง · idempotent ตามสถานะ)
//   ขั้น 6 ลำดับวัน: ปิดวันถัดจากวันปิดล่าสุดเท่านั้น (ข้าม = PREVIOUS_OPEN) · วันที่ reopen ต้องปิดก่อน · cron ไล่ปิดทีละวัน ≤ 7 วัน/รอบ
//   reopen: OWNER/MANAGER + hotel.audit.run · เฉพาะวันล่าสุด · ต้องมีเหตุผล · ไม่ถอนรายการ folio · ปิดใหม่ = คำนวณ KPI ทับ (ขั้น 1–2 idempotent)
//   ไม่มี "use server" (actions.ts เป็นคนเรียก) · ผลเป็นข้อมูล ไม่ throw ดิบ · DTO/payload/AuditLog ไม่มีชื่อ/เบอร์/อีเมลแขก (X8/X10)
import { randomUUID } from "node:crypto";
import type { Prisma, Role } from "@prisma/client";
import { tenantDb } from "@/lib/core/db";
import { emitOutbox } from "@/lib/core/outbox";
import { canAccessUnit, evaluate, type MembershipCtx } from "@/lib/core/rbac";
import { resolveSettings } from "@/lib/core/settings";
import { markNoShow } from "./booking";
import { auditTx, folioSettings, insertItemTx, isOpen, lockFolio, nightLabelTh, postRoomNightsTx, recomputeTx, type FolioSettings } from "./folio";
import { markStayoversDirty } from "./housekeeping";
import { addDaysYmd, isYmd, roundFraction } from "./pricing";
import { businessDateOf, auditTimeMinutes, isAuditDue, localMinutesOf, nextBusinessDate, normalizeTimezone, ymdOfDate, ymdToDbDate } from "./business-date";

// ───────────────────────── ชนิด ─────────────────────────
export type AuditActor = MembershipCtx & { userId: string };
export type AuditFailCode = "ALREADY_CLOSED" | "TOO_EARLY" | "PREVIOUS_OPEN" | "NOT_FOUND" | "FORBIDDEN" | "INVALID_INPUT" | "NOT_LATEST" | "INVALID_STATUS" | "BUSY" | "FAILED";
export type AuditFail = { ok: false; code: AuditFailCode; reason: string };
export type NightAuditKpi = {
  roomsTotal: number;
  roomsOOO: number;
  roomsAvailable: number;
  roomsOccupied: number;
  occupancyBps: number;
  roomRevenueSatang: number;
  adrSatang: number;
  revparSatang: number;
  arrivals: number;
  departures: number;
  noShowCount: number;
  cancelledCount: number;
};
export type AuditNoShowRow = { reservationId: string; code: string; depositSatang: number; policy: string };
export type AuditPreviewOk = {
  ok: true;
  unitId: string;
  businessDate: string;
  today: string;
  status: "OPEN" | "CLOSED" | "REOPENED";
  tooEarly: boolean;
  firstAudit: boolean;
  noShows: AuditNoShowRow[];
  roomNightsToPost: number;
  revenueSatang: number;
  kpi: NightAuditKpi;
  stayoversToDirty: number;
  warnings: string[];
};
export type CloseAuditOk = { ok: true; auditId: string; businessDate: string; kpi: NightAuditKpi; roomNightsPosted: number; warnings: string[] };
export type AuditHistoryRow = {
  auditId: string;
  id: string;
  businessDate: string;
  status: "CLOSED" | "REOPENED";
  roomsAvailable: number;
  roomsOccupied: number;
  occupancyBps: number;
  roomRevenueSatang: number;
  adrSatang: number;
  revparSatang: number;
  arrivals: number;
  departures: number;
  noShowCount: number;
  byCron: boolean;
  reopened: boolean;
};
export type RunDueResult = { ok: true; closed: number; skipped: number; errors: number };

// ───────────────────────── ค่าคงที่ ─────────────────────────
const SYSTEM_ID = "module:hotel";
const NO_SHOW_KEY = "rooms.hotel.noShow";
const KEY_TIME = "rooms.hotel.nightAuditTime";
const KEY_AUTO = "rooms.hotel.audit.autoClose";
const NO_SHOW_POLICIES = ["FORFEIT_RELEASE_AFTER_AUDIT", "FORFEIT_HOLD_STAY", "REFUND_RELEASE"] as const;
const TX_OPTS = { maxWait: 15_000, timeout: 60_000 } as const;
const MAX_DAYS_PER_RUN = 7;
const HISTORY_MAX_DAYS = 400;
const R = {
  notFound: "ไม่พบโรงแรมนี้ หรือบัญชีนี้เข้าถึงหน่วยนี้ไม่ได้",
  forbidden: "บัญชีนี้ไม่มีสิทธิ์ปิดวัน (night audit)",
  reopenForbidden: "เปิดวันที่ปิดแล้วอีกครั้งได้เฉพาะผู้จัดการหรือเจ้าของที่มีสิทธิ์ปิดวัน",
  badDate: "วันที่ต้องเป็นรูปแบบ ปปปป-ดด-วว",
  already: "วันนี้ปิดไปแล้ว — ถ้าต้องแก้ ให้ผู้จัดการเปิดวันอีกครั้งก่อน",
  tooEarly: "ยังปิดวันนี้ไม่ได้ — ปิดได้เฉพาะวันที่ผ่านไปแล้วตามเวลาของร้าน",
  previousOpen: "ยังมีวันก่อนหน้าที่ยังไม่ปิด — ปิดวันก่อนหน้าให้ครบก่อน",
  backward: "วันนี้อยู่ก่อนวันที่ปิดล่าสุด — ปิดย้อนหลังไม่ได้",
  notLatest: "เปิดอีกครั้งได้เฉพาะวันที่ปิดล่าสุด",
  notClosed: "วันนี้ยังไม่ได้ปิด หรือเปิดอีกครั้งไปแล้ว",
  reason: "กรุณาระบุเหตุผลที่เปิดวันอีกครั้ง",
  busy: "ระบบไม่ว่าง ลองใหม่อีกครั้ง",
  failed: "ปิดวันไม่สำเร็จ — ระบบย้อนรายการของรอบนี้ทั้งหมดแล้ว ลองใหม่อีกครั้ง",
} as const;

type Tx = Prisma.TransactionClient;
type UnitCtx = { tenantId: string; unitId: string };
type UnitInfo = UnitCtx & { tz: string };
type Gate = UnitInfo & { actor: AuditActor | null };
type AuditRowLite = { id: string; ymd: string; status: string };

const fail = (code: AuditFailCode, reason: string): AuditFail => ({ ok: false, code, reason });
const isRec = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === "string" && v.length > 0;
export const isAuditFail = (v: unknown): v is AuditFail => isRec(v) && v.ok === false && typeof v.code === "string";
const jsonOf = (v: unknown): Prisma.InputJsonValue => JSON.parse(JSON.stringify(v ?? null)) as Prisma.InputJsonValue;

class Abort extends Error {
  constructor(readonly result: AuditFail) {
    super(result.code);
  }
}
/** client ของร้าน (tenantDb · ไม่มี raw prisma ในโมดูล — fitness F5.1) */
const dbOf = (c: { tenantId: string; unitId?: string }): Tx => tenantDb({ tenantId: c.tenantId, ...(c.unitId ? { unitId: c.unitId } : {}) }) as unknown as Tx;
function isTxBusy(e: unknown): boolean {
  let cur: unknown = e;
  for (let d = 0; d < 6 && cur && typeof cur === "object"; d++) {
    const o = cur as { code?: unknown; message?: unknown; cause?: unknown };
    if (o.code === "P2028" || o.code === "P2034" || o.code === "40P01") return true;
    if (typeof o.message === "string" && /deadlock detected|40P01/i.test(o.message)) return true;
    cur = o.cause;
  }
  return false;
}

// ───────────────────────── ด่าน ─────────────────────────
function actorOf(a: unknown): AuditActor | null {
  if (!isRec(a) || !isStr(a.role) || !isStr(a.userId)) return null;
  return {
    role: a.role as MembershipCtx["role"],
    unitAccess: Array.isArray(a.unitAccess) ? a.unitAccess.filter(isStr) : [],
    permissions: isRec(a.permissions) ? a.permissions : {},
    userId: a.userId,
  };
}

/** หน่วยโรงแรมของร้าน + timezone ของร้าน (unit.settings.timezone · ค่าเริ่ม Bangkok) · ไม่ใช่/ต่างร้าน ⇒ null */
export async function hotelUnitInfo(tenantId: unknown, unitId: unknown): Promise<UnitInfo | null> {
  if (!isStr(tenantId) || !isStr(unitId) || unitId.length > 64) return null;
  const u = await tenantDb({ tenantId }).businessUnit.findFirst({ where: { id: unitId, type: "HOTEL" }, select: { id: true, settings: true } });
  if (!u) return null;
  const tz = isRec(u.settings) ? u.settings.timezone : null;
  return { tenantId, unitId: u.id, tz: normalizeTimezone(tz) };
}

/** ด่านปิดวัน/preview: หน่วยโรงแรมของร้าน → เข้าหน่วยได้ (ไม่ได้ ⇒ NOT_FOUND) → hotel.audit.run (FORBIDDEN) · actor null = cron (เฉพาะ allowSystem) */
async function gate(actorIn: unknown, ctx: unknown, unitId: unknown, allowSystem: boolean): Promise<Gate | AuditFail> {
  const tenantId = isRec(ctx) ? ctx.tenantId : null;
  const actor = actorOf(actorIn);
  if (!actor && !(allowSystem && actorIn === null)) return fail("NOT_FOUND", R.notFound);
  const u = await hotelUnitInfo(tenantId, unitId);
  if (!u) return fail("NOT_FOUND", R.notFound);
  if (actor && !canAccessUnit(actor, u.unitId)) return fail("NOT_FOUND", R.notFound);
  if (actor && !evaluate(actor, { module: "hotel", action: "hotel.audit.run", unitId: u.unitId })) return fail("FORBIDDEN", R.forbidden);
  return { ...u, actor };
}

/** ผู้กระทำที่ส่งให้ markNoShow — สิทธิ์ตัดสินที่ด่านปิดวันแล้ว (hotel.audit.run) · ผู้ใช้จริงยังลงชื่อใน AuditLog */
const noShowActor = (actor: AuditActor | null): AuditActor => ({ role: "OWNER", unitAccess: ["*"], permissions: {}, userId: actor?.userId ?? SYSTEM_ID });

// ───────────────────────── สถานะวันปิด ─────────────────────────
async function auditRowsOf(db: Tx, c: UnitCtx): Promise<{ last: AuditRowLite | null; first: AuditRowLite | null }> {
  const [last, first] = await Promise.all([
    db.hotelNightAudit.findFirst({ where: { tenantId: c.tenantId, unitId: c.unitId }, orderBy: { businessDate: "desc" }, select: { id: true, businessDate: true, status: true } }),
    db.hotelNightAudit.findFirst({ where: { tenantId: c.tenantId, unitId: c.unitId }, orderBy: { businessDate: "asc" }, select: { id: true, businessDate: true, status: true } }),
  ]);
  const lite = (r: { id: string; businessDate: Date; status: string } | null): AuditRowLite | null => (r ? { id: r.id, ymd: ymdOfDate(r.businessDate), status: r.status } : null);
  return { last: lite(last), first: lite(first) };
}

/** วันที่จะปิดถัดไป: ไม่เคยปิด ⇒ เมื่อวานของร้าน · วันล่าสุดถูกเปิดอีกครั้ง ⇒ วันนั้น · อื่น ⇒ วันถัดจากวันปิดล่าสุด */
export function pendingBusinessDate(last: { ymd: string; status: string } | null, today: string): string {
  if (!last) return addDaysYmd(today, -1);
  if (last.status === "REOPENED") return last.ymd;
  return nextBusinessDate(last.ymd);
}

/** ตรวจลำดับวัน (ขั้น 6) — null = ปิดได้ */
function orderCheck(bd: string, today: string, cur: { status: string } | null, last: AuditRowLite | null): AuditFail | null {
  if (cur?.status === "CLOSED") return fail("ALREADY_CLOSED", R.already);
  if (bd >= today) return fail("TOO_EARLY", R.tooEarly);
  if (cur) return null; // REOPENED = วันล่าสุด (reopen ได้เฉพาะวันล่าสุด) ⇒ ปิดใหม่ได้
  if (!last) return null; // วันแรกที่เริ่มใช้ night audit
  if (bd < last.ymd) return fail("INVALID_INPUT", R.backward);
  if (last.status === "REOPENED") return fail("PREVIOUS_OPEN", R.previousOpen);
  if (bd > nextBusinessDate(last.ymd)) return fail("PREVIOUS_OPEN", R.previousOpen);
  return null;
}

// ───────────────────────── KPI (pure) ─────────────────────────
export type KpiRoom = { id: string; active?: boolean; rentMode: string | null; typeRentMode: string };
export type KpiNight = { id: string; roomId: string | null; status: string; counted?: boolean };
export type KpiInput = {
  rooms: readonly KpiRoom[];
  blockedRoomIds: readonly string[];
  nights: readonly KpiNight[];
  roomRevenueSatang: number;
  rounding?: string;
  arrivals?: number;
  departures?: number;
  noShowCount?: number;
  cancelledCount?: number;
};
const OCCUPYING = new Set(["CHECKED_IN", "CHECKED_OUT"]);
const sellsNightly = (r: KpiRoom) => r.active !== false && ["NIGHTLY", "BOTH"].includes(r.rentMode ?? r.typeRentMode);

/**
 * KPI ของวันจากแถว (ใบ §2.1): total = ห้อง active NIGHTLY/BOTH · OOO = ห้องขายได้ที่มี BLOCK ครอบคืนนั้น · available = total − OOO ·
 * occupied = จำนวนห้องที่มีคืน counted ของการจอง CHECKED_IN/CHECKED_OUT (ไม่นับ HOLD/CONFIRMED) · bps ปัดลง · ADR/RevPAR ปัดตาม rooms.money.rounding
 */
export function computeKpi(input: KpiInput): NightAuditKpi {
  const sellable = input.rooms.filter(sellsNightly);
  const ids = new Set(sellable.map((r) => r.id));
  const ooo = new Set(input.blockedRoomIds.filter((id) => ids.has(id))).size;
  const total = sellable.length;
  const available = Math.max(0, total - ooo);
  const occupied = new Set(input.nights.filter((n) => n.counted !== false && OCCUPYING.has(n.status)).map((n) => n.roomId ?? n.id)).size;
  const revenue = Math.trunc(input.roomRevenueSatang);
  const rounding = input.rounding ?? "SATANG";
  return {
    roomsTotal: total,
    roomsOOO: ooo,
    roomsAvailable: available,
    roomsOccupied: occupied,
    occupancyBps: available > 0 ? Math.floor((occupied * 10_000) / available) : 0,
    roomRevenueSatang: revenue,
    adrSatang: occupied > 0 ? roundFraction(revenue, occupied, rounding) : 0,
    revparSatang: available > 0 ? roundFraction(revenue, available, rounding) : 0,
    arrivals: input.arrivals ?? 0,
    departures: input.departures ?? 0,
    noShowCount: input.noShowCount ?? 0,
    cancelledCount: input.cancelledCount ?? 0,
  };
}

// ───────────────────────── ข้อเท็จจริงของวัน (อ่านฐาน) ─────────────────────────
type DayFacts = {
  kpi: NightAuditKpi;
  liveRoomItems: { refId: string | null; amountSatang: number; folio: { reservationId: string } }[];
  occNights: { id: string; roomId: string | null; reservationId: string; roomTypeId: string; status: string; source: string }[];
};
async function roundingOf(c: UnitCtx): Promise<string> {
  const r = await resolveSettings({ tenantId: c.tenantId }, ["rooms.money.rounding"], { unitId: c.unitId });
  const v = r["rooms.money.rounding"]?.value;
  return typeof v === "string" ? v : "SATANG";
}
/** อ่านทุกอย่างที่ KPI ของวัน bd ต้องใช้ (ใน tx หรือ client ปกติ) · extraRevenue = ค่าห้องที่ "จะ" post (preview) */
async function dayFacts(db: Tx, u: UnitInfo, bd: string, rounding: string, extraRevenue = 0): Promise<DayFacts> {
  const day = ymdToDbDate(bd);
  const c = { tenantId: u.tenantId, unitId: u.unitId };
  const [rooms, blocks, nights, items, rvs] = await Promise.all([
    db.hotelRoom.findMany({ where: { ...c, active: true }, select: { id: true, active: true, rentMode: true, roomType: { select: { rentMode: true } } } }),
    db.roomOccupancy.findMany({ where: { ...c, kind: "BLOCK", active: true, startDate: { lte: day }, endDate: { gt: day } }, select: { roomId: true } }),
    db.hotelBookingNight.findMany({ where: { ...c, date: day, counted: true }, select: { id: true, roomId: true, reservationId: true, roomTypeId: true, reservation: { select: { status: true, source: true } } } }),
    db.hotelFolioItem.findMany({ where: { ...c, type: "ROOM", businessDate: day, voidedAt: null }, select: { refId: true, amountSatang: true, folio: { select: { reservationId: true } } } }),
    db.hotelReservation.findMany({
      where: { ...c, OR: [{ checkInDate: day }, { checkOutDate: day }, { cancelledAt: { gte: ymdToDbDate(addDaysYmd(bd, -1)), lt: ymdToDbDate(addDaysYmd(bd, 2)) } }] },
      select: { status: true, checkInDate: true, checkOutDate: true, cancelledAt: true },
    }),
  ]);
  const occNights = nights.map((n) => ({ id: n.id, roomId: n.roomId, reservationId: n.reservationId, roomTypeId: n.roomTypeId, status: n.reservation.status, source: n.reservation.source }));
  const revenue = items.reduce((s, i) => s + i.amountSatang, 0) + extraRevenue;
  const kpi = computeKpi({
    rooms: rooms.map((r) => ({ id: r.id, active: r.active, rentMode: r.rentMode, typeRentMode: r.roomType.rentMode })),
    blockedRoomIds: blocks.map((b) => b.roomId),
    nights: occNights,
    roomRevenueSatang: revenue,
    rounding,
    arrivals: rvs.filter((r) => ymdOfDate(r.checkInDate) === bd && OCCUPYING.has(r.status)).length,
    departures: rvs.filter((r) => ymdOfDate(r.checkOutDate) === bd && r.status === "CHECKED_OUT").length,
    noShowCount: rvs.filter((r) => ymdOfDate(r.checkInDate) === bd && r.status === "NO_SHOW").length,
    cancelledCount: rvs.filter((r) => r.status === "CANCELLED" && r.cancelledAt && businessDateOf(u.tz, r.cancelledAt) === bd).length,
  });
  return { kpi, liveRoomItems: items, occNights };
}

/** snapshot ของแถว audit: รายได้/คืนตามแหล่งจองและประเภทห้อง (ไม่มี PII) */
async function snapshotOf(db: Tx, u: UnitCtx, f: DayFacts, warnings: string[]): Promise<Prisma.InputJsonValue> {
  const nightById = new Map(f.occNights.map((n) => [n.id, n]));
  const typeIds = [...new Set(f.occNights.map((n) => n.roomTypeId))];
  const types = typeIds.length ? await db.hotelRoomType.findMany({ where: { tenantId: u.tenantId, unitId: u.unitId, id: { in: typeIds } }, select: { id: true, name: true } }) : [];
  const typeName = new Map(types.map((t) => [t.id, t.name]));
  const bySource: Record<string, { roomNights: number; revenueSatang: number }> = {};
  const byRoomType: Record<string, { name: string; roomNights: number; revenueSatang: number }> = {};
  for (const n of f.occNights.filter((x) => OCCUPYING.has(x.status))) {
    (bySource[n.source] ??= { roomNights: 0, revenueSatang: 0 }).roomNights++;
    (byRoomType[n.roomTypeId] ??= { name: typeName.get(n.roomTypeId) ?? "", roomNights: 0, revenueSatang: 0 }).roomNights++;
  }
  for (const it of f.liveRoomItems) {
    const n = it.refId ? nightById.get(it.refId) : undefined;
    if (!n) continue;
    (bySource[n.source] ??= { roomNights: 0, revenueSatang: 0 }).revenueSatang += it.amountSatang;
    (byRoomType[n.roomTypeId] ??= { name: typeName.get(n.roomTypeId) ?? "", roomNights: 0, revenueSatang: 0 }).revenueSatang += it.amountSatang;
  }
  return jsonOf({ bySource, byRoomType, warnings, version: 1 });
}

/** คืนที่ต้อง post ของวัน bd: CHECKED_IN · counted · ยังไม่ post */
function toPostWhere(c: UnitCtx, bd: string): Prisma.HotelBookingNightWhereInput {
  return { tenantId: c.tenantId, unitId: c.unitId, date: ymdToDbDate(bd), counted: true, folioItemId: null, reservation: { status: "CHECKED_IN" } };
}

function noShowPolicyOf(snapshot: unknown): string {
  const v = isRec(snapshot) && isRec(snapshot.values) ? snapshot.values[NO_SHOW_KEY] : null;
  return (NO_SHOW_POLICIES as readonly unknown[]).includes(v) ? String(v) : "FORFEIT_RELEASE_AFTER_AUDIT";
}

// ───────────────────────── auditPreview ─────────────────────────
/** ตัวอย่างการปิดวัน (ไม่เขียนฐาน): no-show ที่จะตั้ง · คืนที่จะ post · KPI หลังปิด (คาด) · ห้องค้างต่อที่จะเป็น DIRTY */
export async function auditPreview(actorIn: unknown, ctx: unknown, input: unknown): Promise<AuditPreviewOk | AuditFail> {
  const g = await gate(actorIn, ctx, isRec(input) ? input.unitId : null, false);
  if (isAuditFail(g)) return g;
  const c = { tenantId: g.tenantId, unitId: g.unitId };
  const today = businessDateOf(g.tz, new Date());
  const rows = await auditRowsOf(dbOf(c), c);
  const wanted = isRec(input) ? input.businessDate : undefined;
  if (wanted !== undefined && wanted !== null && !isYmd(wanted)) return fail("INVALID_INPUT", R.badDate);
  const bd = isYmd(wanted) ? wanted : pendingBusinessDate(rows.last, today);
  const day = ymdToDbDate(bd);
  const db = tenantDb(c) as unknown as Tx;
  const [row, confirmed, toPost, stays, noRoom, rounding] = await Promise.all([
    db.hotelNightAudit.findFirst({ where: { ...c, businessDate: day }, select: { status: true } }),
    db.hotelReservation.findMany({ where: { ...c, status: "CONFIRMED", checkInDate: day }, orderBy: { code: "asc" }, select: { id: true, code: true, depositSatang: true, depositPaidAt: true, policySnapshot: true } }),
    db.hotelBookingNight.findMany({ where: toPostWhere(c, bd), select: { priceSatang: true } }),
    db.hotelReservation.findMany({ where: { ...c, status: "CHECKED_IN", roomId: { not: null }, checkInDate: { lte: day }, checkOutDate: { gt: day } }, select: { roomId: true, room: { select: { hkStatus: true } } } }),
    db.hotelReservation.count({ where: { ...c, status: "CHECKED_IN", roomId: null, checkInDate: { lte: day }, checkOutDate: { gt: day } } }),
    roundingOf(c),
  ]);
  const toPostSum = toPost.reduce((s, n) => s + n.priceSatang, 0);
  const facts = await dayFacts(db, g, bd, rounding, toPostSum);
  const dirtyRooms = new Set(stays.filter((s) => s.room && (s.room.hkStatus === "CLEAN" || s.room.hkStatus === "INSPECTED")).map((s) => s.roomId));
  const warnings: string[] = [];
  if (noRoom > 0) warnings.push(`มีแขกเช็กอินแล้ว ${noRoom} รายการที่ยังไม่มีห้อง — ค่าห้องจะไม่ถูกลง`);
  return {
    ok: true,
    unitId: g.unitId,
    businessDate: bd,
    today,
    status: row ? (row.status === "REOPENED" ? "REOPENED" : "CLOSED") : "OPEN",
    tooEarly: bd >= today,
    firstAudit: rows.last === null,
    noShows: confirmed.map((r) => ({ reservationId: r.id, code: r.code, depositSatang: r.depositPaidAt ? r.depositSatang : 0, policy: noShowPolicyOf(r.policySnapshot) })),
    roomNightsToPost: toPost.length,
    revenueSatang: toPostSum,
    kpi: facts.kpi,
    stayoversToDirty: dirtyRooms.size,
    warnings,
  };
}

// ───────────────────────── closeNightAudit ─────────────────────────
/** post คืนในช่วง [start, bd] ทีละคืน (ใช้เมื่อการจองมีคืนก่อนวันเริ่มใช้ที่ห้าม post ย้อน) */
async function postRangeTx(tx: Tx, c: UnitCtx, folioId: string, reservationId: string, start: string, bd: string, auditId: string): Promise<number> {
  const nights = await tx.hotelBookingNight.findMany({
    where: { tenantId: c.tenantId, unitId: c.unitId, reservationId, counted: true, folioItemId: null, date: { gte: ymdToDbDate(start), lte: ymdToDbDate(bd) } },
    orderBy: { date: "asc" },
  });
  if (!nights.length) return 0;
  const types = await tx.hotelRoomType.findMany({ where: { tenantId: c.tenantId, unitId: c.unitId, id: { in: [...new Set(nights.map((n) => n.roomTypeId))] } }, select: { id: true, name: true } });
  const nameOf = new Map(types.map((t) => [t.id, t.name]));
  let n = 0;
  for (const night of nights) {
    const ymd = ymdOfDate(night.date);
    const item = await insertItemTx(tx, c, folioId, { type: "ROOM", description: `${nightLabelTh(ymd)} · ${nameOf.get(night.roomTypeId) ?? "ห้องพัก"}`, qty: 1, unitAmountSatang: night.priceSatang, refType: "HotelBookingNight", refId: night.id, businessDate: ymd }, null);
    const upd = await tx.hotelBookingNight.updateMany({ where: { id: night.id, tenantId: c.tenantId, unitId: c.unitId, folioItemId: null }, data: { folioItemId: item.id, postedAuditId: auditId } });
    if (upd.count === 0) throw new Abort(fail("BUSY", R.busy));
    n++;
  }
  return n;
}

/** แกนปิดวัน (ผ่านด่านแล้ว) — now = นาฬิกาของผู้เรียก (cron ส่ง now ของรอบ) */
async function closeCore(g: Gate, bd: string, now: Date): Promise<CloseAuditOk | AuditFail> {
  const c = { tenantId: g.tenantId, unitId: g.unitId };
  const today = businessDateOf(g.tz, now);
  const day = ymdToDbDate(bd);
  const pre = await auditRowsOf(dbOf(c), c);
  const cur0 = await dbOf(c).hotelNightAudit.findFirst({ where: { ...c, businessDate: day }, select: { id: true, status: true } });
  const bad0 = orderCheck(bd, today, cur0, pre.last);
  if (bad0) return bad0;
  const warnings: string[] = [];

  // ขั้น 1 — no-show (นอก tx · ทีละแถว · เงินผ่าน POS ใน markNoShow)
  const confirmed = await tenantDb(c).hotelReservation.findMany({ where: { status: "CONFIRMED", checkInDate: day }, orderBy: { code: "asc" }, select: { id: true, code: true } });
  for (const rv of confirmed) {
    try {
      const r = await markNoShow(noShowActor(g.actor), { tenantId: c.tenantId }, { unitId: c.unitId, reservationId: rv.id });
      if (!r.ok) warnings.push(`ตั้งไม่มา ${rv.code} ไม่สำเร็จ: ${r.reason}`);
      else if ("moneyWarning" in r && typeof r.moneyWarning === "string") warnings.push(`${rv.code}: ${r.moneyWarning}`);
    } catch {
      warnings.push(`ตั้งไม่มา ${rv.code} ไม่สำเร็จ — ตรวจที่หน้าการจอง`);
    }
  }

  const st: FolioSettings = await folioSettings(c.tenantId, c.unitId);
  // ขั้น 2 + 4 + 5 — tx เดียว
  let out: { auditId: string; kpi: NightAuditKpi; posted: number; firstClose: boolean } | AuditFail;
  try {
    out = await tenantDb(c).$transaction(async (t) => {
      const tx = t as unknown as Tx;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('hotel-night-audit:' || ${c.unitId}::text))`;
      const cur = await tx.hotelNightAudit.findFirst({ where: { ...c, businessDate: day }, select: { id: true, status: true } });
      const rows = await auditRowsOf(tx, c);
      const bad = orderCheck(bd, today, cur, rows.last);
      if (bad) throw new Abort(bad);
      const auditId = cur?.id ?? `hna${randomUUID().replace(/-/g, "")}`;
      const start = rows.first && rows.first.ymd < bd ? rows.first.ymd : bd;

      // ขั้น 2 — ค่าห้องคืน bd ของแขกที่เข้าพัก
      const nights = await tx.hotelBookingNight.findMany({ where: toPostWhere(c, bd), select: { reservationId: true, roomTypeId: true, roomId: true } });
      let posted = 0;
      const seen = new Set<string>();
      for (const n of nights) {
        if (seen.has(n.reservationId)) continue;
        seen.add(n.reservationId);
        if (!n.roomId) warnings.push("พบแขกเช็กอินแล้วที่คืนนี้ไม่มีห้อง — ตรวจการจัดห้อง");
        const f = await lockFolio(tx, c, n.reservationId);
        if (!isOpen(f)) {
          warnings.push("พบบิลห้องที่ปิดแล้วของแขกที่ยังเข้าพัก — ค่าห้องคืนนี้ไม่ถูกลง");
          continue;
        }
        const before = await tx.hotelBookingNight.count({ where: { ...c, reservationId: n.reservationId, counted: true, folioItemId: null, date: { lt: ymdToDbDate(start) } } });
        const k = before === 0 ? await postRoomNightsTx(tx, c, f.id, { id: n.reservationId, roomTypeId: n.roomTypeId }, addDaysYmd(bd, 1), auditId) : await postRangeTx(tx, c, f.id, n.reservationId, start, bd, auditId);
        if (k > 0) await recomputeTx(tx, c, f.id, st);
        posted += k;
      }

      // ขั้น 4 — freeze KPI
      const facts = await dayFacts(tx, g, bd, st.rounding);
      const snapshot = await snapshotOf(tx, c, facts, warnings);
      const data = { ...facts.kpi, status: "CLOSED", snapshot, closedById: g.actor?.userId ?? null };
      if (cur) await tx.hotelNightAudit.updateMany({ where: { id: cur.id, ...c }, data });
      else await tx.hotelNightAudit.create({ data: { id: auditId, ...c, businessDate: day, ...data } });

      // ขั้น 5 — บันทึก + แจ้ง
      await auditTx(tx, c, g.actor?.userId ?? null, "hotel.audit.closed", "HotelNightAudit", auditId, cur ? { status: "REOPENED" } : null, {
        businessDate: bd,
        kpi: facts.kpi,
        roomNightsPosted: posted,
        noShowsMarked: confirmed.length,
        warnings: warnings.length,
        byCron: g.actor === null,
      });
      await emitOutbox(tx, {
        tenantId: c.tenantId,
        unitId: c.unitId,
        type: "hotel.audit.closed",
        idempotencyKey: `hotel.audit.closed#${auditId}#${randomUUID()}`,
        payload: { tenantId: c.tenantId, unitId: c.unitId, auditId, businessDate: bd, kpi: { occupancyBps: facts.kpi.occupancyBps, roomRevenueSatang: facts.kpi.roomRevenueSatang, noShows: facts.kpi.noShowCount } },
      });
      return { auditId, kpi: facts.kpi, posted, firstClose: !cur };
    }, TX_OPTS);
  } catch (e) {
    if (e instanceof Abort) return e.result;
    return isTxBusy(e) ? fail("BUSY", R.busy) : fail("FAILED", R.failed);
  }
  if (isAuditFail(out)) return out;

  // ขั้น 3 — ห้องค้างต่อ ⇒ DIRTY (H.6 · ครั้งแรกที่ปิด "เมื่อวาน" เท่านั้น · ปิดใหม่หลัง reopen ไม่ทำซ้ำ กันห้องที่แม่บ้านทำแล้วกลับเป็นสกปรก)
  if (out.firstClose && bd === addDaysYmd(today, -1)) {
    try {
      const r = await markStayoversDirty({ tenantId: c.tenantId }, { unitId: c.unitId, businessDate: bd });
      if (!r.ok) warnings.push(`ตั้งห้องค้างต่อเป็นรอทำความสะอาดไม่สำเร็จ: ${r.reason}`);
    } catch {
      warnings.push("ตั้งห้องค้างต่อเป็นรอทำความสะอาดไม่สำเร็จ — ตรวจที่บอร์ดแม่บ้าน");
    }
  }
  return { ok: true, auditId: out.auditId, businessDate: bd, kpi: out.kpi, roomNightsPosted: out.posted, warnings };
}

/** ปิดวัน businessDate ของหน่วย (actor null = cron) · ผล {ok, auditId, kpi, warnings} | ALREADY_CLOSED/TOO_EARLY/PREVIOUS_OPEN/NOT_FOUND/FORBIDDEN */
export async function closeNightAudit(actorIn: unknown, ctx: unknown, input: unknown): Promise<CloseAuditOk | AuditFail> {
  try {
    const g = await gate(actorIn, ctx, isRec(input) ? input.unitId : null, true);
    if (isAuditFail(g)) return g;
    const bd = isRec(input) ? input.businessDate : null;
    if (!isYmd(bd)) return fail("INVALID_INPUT", R.badDate);
    return await closeCore(g, bd, new Date());
  } catch {
    return fail("FAILED", R.failed);
  }
}

// ───────────────────────── reopenNightAudit ─────────────────────────
/** เปิดวันที่ปิดล่าสุดอีกครั้ง (OWNER/MANAGER + hotel.audit.run · ต้องมีเหตุผล) — ไม่ถอนรายการ folio */
export async function reopenNightAudit(actorIn: unknown, ctx: unknown, input: unknown): Promise<{ ok: true; auditId: string; businessDate: string } | AuditFail> {
  try {
    const tenantId = isRec(ctx) ? ctx.tenantId : null;
    const actor = actorOf(actorIn);
    const auditId = isRec(input) ? input.auditId : null;
    if (!isStr(tenantId) || !actor || !isStr(auditId) || auditId.length > 64) return fail("NOT_FOUND", "ไม่พบวันที่ปิดนี้");
    const found = await tenantDb({ tenantId }).$queryRaw<{ id: string; unitId: string; businessDate: Date; status: string }[]>`
      SELECT "id", "unitId", "businessDate", "status" FROM "HotelNightAudit" WHERE "id" = ${auditId} AND "tenantId" = ${tenantId} LIMIT 1`; // หาหน่วยของแถว (unit-scoped) ก่อนอ่านผ่าน tenantDb ของหน่วย
    const row = found[0];
    if (!row) return fail("NOT_FOUND", "ไม่พบวันที่ปิดนี้");
    if (isRec(input) && input.unitId !== undefined && input.unitId !== row.unitId) return fail("NOT_FOUND", "ไม่พบวันที่ปิดนี้"); // ผู้เรียกจากหน้าจอส่งหน่วยของหน้า — ต่างหน่วย = ไม่พบ
    const u = await hotelUnitInfo(tenantId, row.unitId);
    if (!u || !canAccessUnit(actor, u.unitId)) return fail("NOT_FOUND", "ไม่พบวันที่ปิดนี้");
    if ((actor.role !== "OWNER" && actor.role !== "MANAGER") || !evaluate(actor, { module: "hotel", action: "hotel.audit.run", unitId: u.unitId })) return fail("FORBIDDEN", R.reopenForbidden);
    const reason = isRec(input) && typeof input.reason === "string" ? input.reason.trim() : "";
    if (!reason || reason.length > 300) return fail("INVALID_INPUT", R.reason);
    const c = { tenantId, unitId: u.unitId };
    const bd = ymdOfDate(row.businessDate);
    await tenantDb(c).$transaction(async (t) => {
      const tx = t as unknown as Tx;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('hotel-night-audit:' || ${c.unitId}::text))`;
      const cur = await tx.hotelNightAudit.findFirst({ where: { id: row.id, ...c }, select: { status: true } });
      if (!cur) throw new Abort(fail("NOT_FOUND", "ไม่พบวันที่ปิดนี้"));
      const later = await tx.hotelNightAudit.count({ where: { ...c, businessDate: { gt: ymdToDbDate(bd) } } });
      if (later > 0) throw new Abort(fail("NOT_LATEST", R.notLatest));
      if (cur.status !== "CLOSED") throw new Abort(fail("INVALID_STATUS", R.notClosed));
      const now = new Date();
      await tx.hotelNightAudit.updateMany({ where: { id: row.id, ...c, status: "CLOSED" }, data: { status: "REOPENED", reopenedAt: now, reopenedById: actor.userId } });
      await auditTx(tx, c, actor.userId, "hotel.audit.reopened", "HotelNightAudit", row.id, { status: "CLOSED", businessDate: bd }, { status: "REOPENED", businessDate: bd, reason });
      await emitOutbox(tx, {
        tenantId,
        unitId: c.unitId,
        type: "hotel.audit.reopened",
        idempotencyKey: `hotel.audit.reopened#${row.id}#${randomUUID()}`,
        payload: { tenantId, unitId: c.unitId, auditId: row.id, businessDate: bd, byUserId: actor.userId },
      });
    }, TX_OPTS);
    return { ok: true, auditId: row.id, businessDate: bd };
  } catch (e) {
    if (e instanceof Abort) return e.result;
    return isTxBusy(e) ? fail("BUSY", R.busy) : fail("FAILED", "เปิดวันอีกครั้งไม่สำเร็จ ลองใหม่อีกครั้ง");
  }
}

// ───────────────────────── auditHistory ─────────────────────────
/** ประวัติวันปิดของหน่วย (เรียงวันจากเก่า → ใหม่) · ช่วงไม่ส่ง = 30 วันล่าสุด */
export async function auditHistory(ctx: unknown, input: unknown): Promise<{ ok: true; rows: AuditHistoryRow[] } | AuditFail> {
  try {
    const u = await hotelUnitInfo(isRec(ctx) ? ctx.tenantId : null, isRec(input) ? input.unitId : null);
    if (!u) return fail("NOT_FOUND", R.notFound);
    const today = businessDateOf(u.tz, new Date());
    const from = isRec(input) && input.from !== undefined ? input.from : addDaysYmd(today, -30);
    const to = isRec(input) && input.to !== undefined ? input.to : today;
    if (!isYmd(from) || !isYmd(to) || from > to) return fail("INVALID_INPUT", R.badDate);
    if (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`) > HISTORY_MAX_DAYS * 86_400_000) return fail("INVALID_INPUT", "ช่วงวันที่ยาวเกินไป");
    const rows = await dbOf(u).hotelNightAudit.findMany({
      where: { tenantId: u.tenantId, unitId: u.unitId, businessDate: { gte: ymdToDbDate(from), lte: ymdToDbDate(to) } },
      orderBy: { businessDate: "asc" },
    });
    return {
      ok: true,
      rows: rows.map((r) => ({
        auditId: r.id,
        id: r.id,
        businessDate: ymdOfDate(r.businessDate),
        status: r.status === "REOPENED" ? "REOPENED" : "CLOSED",
        roomsAvailable: r.roomsAvailable,
        roomsOccupied: r.roomsOccupied,
        occupancyBps: r.occupancyBps,
        roomRevenueSatang: r.roomRevenueSatang,
        adrSatang: r.adrSatang,
        revparSatang: r.revparSatang,
        arrivals: r.arrivals,
        departures: r.departures,
        noShowCount: r.noShowCount,
        byCron: r.closedById === null,
        reopened: r.reopenedAt !== null,
      })),
    };
  } catch {
    return fail("FAILED", "อ่านประวัติการปิดวันไม่สำเร็จ");
  }
}

/** วันที่ยังไม่ปิดของหน่วย (ป้ายหน้าเคาน์เตอร์) — null = ไม่เคยเริ่มใช้ night audit · 0 = ปิดครบถึงเมื่อวาน */
export async function pendingAuditDays(ctx: unknown, input: unknown): Promise<{ ok: true; pendingDate: string | null; daysBehind: number; started: boolean } | AuditFail> {
  const u = await hotelUnitInfo(isRec(ctx) ? ctx.tenantId : null, isRec(input) ? input.unitId : null);
  if (!u) return fail("NOT_FOUND", R.notFound);
  const today = businessDateOf(u.tz, new Date());
  const { last } = await auditRowsOf(dbOf(u), u);
  if (!last) return { ok: true, pendingDate: addDaysYmd(today, -1), daysBehind: 1, started: false };
  const next = pendingBusinessDate(last, today);
  const days = Math.max(0, Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${next}T00:00:00Z`)) / 86_400_000));
  return { ok: true, pendingDate: days > 0 ? next : null, daysBehind: days, started: true };
}

// ───────────────────────── runDueAudits (minute job) ─────────────────────────
/**
 * ทุกหน่วยโรงแรม ACTIVE/PAUSED: autoClose เปิด + ถึง nightAuditTime ตามเวลาร้าน ⇒ ปิดวันที่ค้าง (ทีละวัน ≤ 7 วัน/หน่วย/รอบ)
 * หน่วยที่ไม่เคยปิดและไม่มีการจองเลย = ข้าม (ยังไม่เริ่มใช้งานโรงแรม) · หน่วยหนึ่งล้ม = errors ไม่บล็อกหน่วยอื่น ·
 * ซ้อนกัน 2 รอบ = ปิดครั้งเดียว (advisory lock + ตรวจแถวซ้ำใน tx · X5) · งบหมด/สัญญาณยกเลิก = หยุดก่อนเริ่มหน่วยถัดไป
 */
export async function runDueAudits(now: Date, budgetMs: number, control?: { signal?: AbortSignal; deadline?: number }): Promise<RunDueResult> {
  const res: RunDueResult = { ok: true, closed: 0, skipped: 0, errors: 0 };
  if (!(budgetMs > 0)) return res;
  const deadline = Math.min(Date.now() + budgetMs, typeof control?.deadline === "number" ? control.deadline : Number.POSITIVE_INFINITY);
  const outOfTime = () => control?.signal?.aborted === true || Date.now() >= deadline - 300;
  let units: { id: string; tenantId: string; settings: unknown }[] = [];
  try {
    // 🔴 อ่าน id ข้ามร้านด้วย $queryRaw ของ client ขยาย (SQL ดิบไม่ผ่านตัวกรอง scope · แบบ sweepExpiredHolds) — เขียน/อ่านต่อหน่วยผ่าน tenantDb ของร้านนั้นเท่านั้น
    units = await tenantDb({ tenantId: "hotel-night-audit-scan" }).$queryRaw<{ id: string; tenantId: string; settings: unknown }[]>`
      SELECT "id", "tenantId", "settings" FROM "BusinessUnit" WHERE "type"::text = 'HOTEL' AND "status"::text IN ('ACTIVE', 'PAUSED') ORDER BY "id" ASC`;
  } catch {
    res.errors++;
    return res;
  }
  for (const unit of units) {
    if (outOfTime()) break;
    try {
      const u: UnitInfo = { tenantId: unit.tenantId, unitId: unit.id, tz: normalizeTimezone(isRec(unit.settings) ? unit.settings.timezone : null) };
      const st = await resolveSettings({ tenantId: u.tenantId }, [KEY_TIME, KEY_AUTO], { unitId: u.unitId });
      if (st[KEY_AUTO]?.value === false) {
        res.skipped++;
        continue;
      }
      const time = typeof st[KEY_TIME]?.value === "string" ? String(st[KEY_TIME]?.value) : "03:00";
      const rows = await auditRowsOf(dbOf(u), u);
      const today = businessDateOf(u.tz, now);
      if (!rows.last && (await dbOf(u).hotelReservation.count({ where: { tenantId: u.tenantId, unitId: u.unitId } })) === 0) {
        res.skipped++;
        continue;
      }
      const due = rows.last?.status === "REOPENED" ? localMinutesOf(u.tz, now) >= auditTimeMinutes(time) && rows.last.ymd < today : isAuditDue(u.tz, time, now, rows.last?.ymd ?? null);
      if (!due) {
        res.skipped++;
        continue;
      }
      let target = pendingBusinessDate(rows.last, today);
      for (let i = 0; i < MAX_DAYS_PER_RUN && target < today; i++) {
        if (outOfTime()) break;
        const r = await closeCore({ ...u, actor: null }, target, now);
        if (r.ok) res.closed++;
        else if (r.code === "ALREADY_CLOSED") {
          res.skipped++;
          break;
        } else {
          res.errors++;
          break;
        }
        target = nextBusinessDate(target);
      }
    } catch {
      res.errors++;
    }
  }
  return res;
}

// ───────────────────────── อีเมลสรุป (consumer hotel.audit.closed เรียก) ─────────────────────────
const fmtBaht = (satang: number) => `฿${(satang / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtPct = (bps: number) => `${(bps / 100).toFixed(1)}%`;
const escHtml = (s: string) => s.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch] ?? ch);
/**
 * เนื้ออีเมลสรุปการปิดวัน + ผู้รับ (บทบาทตาม rooms.hotel.audit.notifyRoles ที่เข้าหน่วยได้) — ไม่มีข้อมูลแขก
 * null = ไม่มีอะไรต้องส่ง (แถวหาย/ไม่มีผู้รับ)
 */
export async function auditSummaryEmail(evt: { tenantId: string; payload: unknown }): Promise<{ to: string[]; subject: string; html: string; text: string; auditId: string } | null> {
  const p = isRec(evt.payload) ? evt.payload : {};
  const auditId = isStr(p.auditId) ? p.auditId : null;
  if (!auditId) return null;
  if (!isStr(p.unitId)) return null;
  const db = dbOf({ tenantId: evt.tenantId, unitId: p.unitId });
  const row = await db.hotelNightAudit.findFirst({ where: { id: auditId, tenantId: evt.tenantId } });
  if (!row) return null;
  const unit = await db.businessUnit.findFirst({ where: { id: row.unitId, tenantId: evt.tenantId }, select: { name: true } });
  const st = await resolveSettings({ tenantId: evt.tenantId }, ["rooms.hotel.audit.notifyRoles"], { unitId: row.unitId });
  const rolesRaw = st["rooms.hotel.audit.notifyRoles"]?.value;
  const roles: Role[] = Array.isArray(rolesRaw) ? rolesRaw.filter((r): r is Role => r === "OWNER" || r === "MANAGER" || r === "STAFF") : ["OWNER", "MANAGER"];
  if (!roles.length) return null;
  const mems = await db.membership.findMany({ where: { tenantId: evt.tenantId, role: { in: roles }, acceptedAt: { not: null } }, select: { role: true, unitAccess: true, user: { select: { email: true } } } });
  const to = [
    ...new Set(
      mems
        .filter((m) => m.role === "OWNER" || (Array.isArray(m.unitAccess) && (m.unitAccess.includes("*") || m.unitAccess.includes(row.unitId))))
        .map((m) => m.user?.email ?? "")
        .filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)),
    ),
  ].slice(0, 20);
  if (!to.length) return null;
  const bd = ymdOfDate(row.businessDate);
  const name = unit?.name ?? "โรงแรม";
  const lines: [string, string][] = [
    ["อัตราเข้าพัก", `${fmtPct(row.occupancyBps)} (${row.roomsOccupied}/${row.roomsAvailable} ห้อง)`],
    ["รายได้ห้อง", fmtBaht(row.roomRevenueSatang)],
    ["ADR", fmtBaht(row.adrSatang)],
    ["RevPAR", fmtBaht(row.revparSatang)],
    ["เข้าพัก / ออก", `${row.arrivals} / ${row.departures}`],
    ["ไม่มา", String(row.noShowCount)],
    ["ยกเลิก", String(row.cancelledCount)],
  ];
  const subject = `สรุปปิดวัน ${bd} · ${name}`.replace(/[\r\n]/g, " ").slice(0, 150);
  const html = `<p>สรุปการปิดวัน (night audit) วันที่ ${escHtml(bd)} · ${escHtml(name)}</p><table>${lines.map(([k, v]) => `<tr><td>${escHtml(k)}</td><td>${escHtml(v)}</td></tr>`).join("")}</table>`;
  const text = [`สรุปการปิดวัน ${bd} · ${name}`, ...lines.map(([k, v]) => `${k}: ${v}`)].join("\n");
  return { to, subject, html, text, auditId };
}
