// ─────────────────────────────────────────────────────────────
// trips/booking-screens.ts — ตัวโหลดจอการจองฝั่งร้าน (ภาพ 18 · 13ค · RUN TRIPS T1.3a §4): รายการ/ค้นหา/ชิป · รายละเอียด · คิวเอกสารเงินรอออก · เงินสดหน้าร้านรายวัน
// ทุกตัว (ctx: { tenantId, actorUserId }, input, opts?: { now? }) · ด่าน: zod strict (INVALID_INPUT) → หน่วย (NOT_FOUND/UNIT_NOT_TRIPS) → สิทธิ์ (FORBIDDEN)
//   คืน { ok: true, vm } | { ok: false, code, message } ไม่ throw (ยกเว้นฐานล่ม)
// 🔴 อ่านอย่างเดียว — ไม่เขียนฐานเลย (ไม่มี audit/outbox/งวดร่างถูกเขียน) · tenantDb ของด่าน + บริการ T0.7a (สรุปเงิน · คำขอคืน) + facade party
//   เงินสดรายวัน: อ่านเองด้วยคิวรีรวม + แถวที่มีเพดานใน SQL (กติกาเดียวกับ tripCashDay ของ T0.7a — บริการนั้นอ่านทุกแถวของวัน ไม่มีเพดาน)
// 🔴 ทุกคิวรีผูก (tenantId, unitId) จากด่าน — ชื่อจาก party (ระดับร้าน) ใช้เป็น id กรองการจองของหน่วยนี้เท่านั้น
// 🔴 เพดาน + ไม่ N+1: แถว ≤ TRIPS_BOOKING_LIST_CAP · ชิป/จำนวน/ยอดรวมนับด้วยคิวรีรวมบนชุดฐาน (ไม่นับจากแถวที่ถูกตัด) · ข้อมูลประกอบอ่านเป็นชุดครั้งเดียวต่อจอ
// 🔴 ป้าย · ต้องทำ · ปุ่มไหนแสดง · ยอดค้าง ตัดสินที่นี่ (คอมโพเนนต์แสดงอย่างเดียว) · เวลา/วันที่แสดงคิดตามเขตเวลาของหน่วยที่นี่
// 🔴 แถวรายการไม่มีเบอร์/อีเมล/token — เบอร์ออกเฉพาะรายละเอียดแบบปิดบัง (maskPhone)
// SQL ดิบ (อ่านอย่างเดียว): ข้อความคำสั่งประกอบจากค่าคงที่ในไฟล์นี้เท่านั้น · ค่าจากผู้ใช้ทุกตัวผูกเป็นพารามิเตอร์ ($n) ไม่ต่อสตริง
// ─────────────────────────────────────────────────────────────
import { z } from "zod";
import { tenantDb } from "@/lib/core/db";
import type { SellChannel, SellCtx } from "@/lib/core/sellable";
import { getProfile, listBriefsByIds, searchByName } from "@/lib/modules/party";
import { DEPARTURE_SELL_CHANNELS, addDaysYmd, hhmm, localToUtc, normalizeTimezone, utcToLocal } from "./departures-core";
import { isCalendarYmd } from "./departure-view-core";
import { TRIP_REFUND_OPEN_STATUSES, TRIP_TENDERS } from "./money-core";
import { tripMoneySummary } from "./money";
import { listTripRefunds } from "./refund";
import { tripsFail, tripsUnitGate, type TripsFail, type TripsScreenCtx, type TripsUnitGate } from "./pickup";
import {
  BOOKING_ATTENTION_KINDS,
  BOOKING_LIST_CHIPS,
  BOOKING_LIST_WHENS,
  BOOKING_LIVE_STATUSES,
  BOOKING_OWES_STATUSES,
  TRIPS_BOOKING_LIST_CAP,
  TRIPS_CASH_EVENTS_CAP,
  TRIPS_MONEY_DOCS_CAP,
  bookingBadgeOf,
  bookingCodeQuery,
  listWindowOf,
  maskPhone,
  moneyStateOf,
  outstandingOf,
  type BookingAttention,
  type BookingBadgeShape,
  type BookingListChip,
  type BookingListWhen,
  type BookingMoneyState,
} from "./booking-view-core";

type Opts = { now?: Date };
type Fail = TripsFail<string>;
const isRec = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isFail = (x: unknown): x is TripsFail => isRec(x) && x.ok === false;
/** อักขระควบคุม (รวม NUL ที่ฐานข้อมูลรับไม่ได้) — ค่าที่มี ⇒ INVALID_INPUT ไม่ปล่อยถึงคิวรี */
const CTL_RE = /[\u0000-\u001f\u007f]/;
const noCtl = (s: string): boolean => !CTL_RE.test(s);
const ID = z.string().min(1).max(128).refine(noCtl);
const YMD = z.string().refine(isCalendarYmd);
const nowOf = (opts?: Opts) => (opts?.now instanceof Date && !Number.isNaN(opts.now.getTime()) ? opts.now : new Date());
const DAY_MS = 86_400_000;
const i18nTh = (v: unknown): string => (isRec(v) && typeof v.th === "string" ? v.th : "");
const i18nEn = (v: unknown): string | null => (isRec(v) && typeof v.en === "string" && v.en.trim() ? v.en : null);
const iso = (d: Date | string): string => new Date(d).toISOString();
const ymdOfDate = (d: Date | string): string => iso(d).slice(0, 10);

const VIEW = "trips.booking.view";
const PAY = "trips.payment.record";
const APPROVE = "trips.booking.approve";
const CANCEL = "trips.booking.cancel";
/** ชื่อผู้จองที่ตรงสูงสุดต่อการค้น (facade party ตัดที่ 25) */
const NAME_MATCH_CAP = 25;
/** สินค้าในตัวกรองสูงสุด */
const PRODUCT_FILTER_CAP = 200;
/** ชื่อผู้เดินทางสูงสุดที่อ่านต่อการจอง */
const TRAVELLER_NAMES_CAP = 200;
/** แถวเงินสูงสุดที่อ่านเลขอ้างอิงต่อการจอง */
const EVENT_REFERENCE_CAP = 500;
/** กลุ่ม (ชนิด × วิธีจ่าย) สูงสุดของยอดรวมเงินสดรายวัน */
const CASH_GROUP_CAP = 64;
const CASH_KINDS = ["RECEIVED", "REFUNDED"];
const POSTING_STATUSES = ["UNPOSTED", "POSTED", "FAILED_NEEDS_ACTION"];
/** อักขระที่ facade party ใช้เป็นตัวแทน (LIKE) — ตัดออกก่อนค้นชื่อ */
const NAME_WILDCARD_RE = /[%_\\]/g;
const MONEY_DOC_KINDS = ["RECEIVED", "REFUNDED", "RETAINED"];
const DUE_OPEN = ["OPEN", "PARTLY_PAID", "OVERDUE"];
const PAYABLE_STATUSES = ["HOLD", "CONFIRMED", "PART_PAID"];
const UNPAID_CANCEL_STATUSES = ["HOLD", "PENDING"];
const OPEN_REFUND: string[] = [...TRIP_REFUND_OPEN_STATUSES];
const OWES: readonly string[] = BOOKING_OWES_STATUSES;
const LIVE: readonly string[] = BOOKING_LIVE_STATUSES;

function parse<S extends z.ZodType>(schema: S, input: unknown): z.output<S> | Fail {
  const r = schema.safeParse(input);
  return r.success ? r.data : tripsFail("INVALID_INPUT");
}
/** ด่าน: หน่วย → สิทธิ์ดูการจอง (+ สิทธิ์รับเงินสำหรับจอเงินของทั้งหน่วย) */
async function gateBookings(ctx: TripsScreenCtx, unitId: string, money = false): Promise<TripsUnitGate | Fail> {
  const g = await tripsUnitGate(ctx, { unitId });
  if (isFail(g)) return g;
  if (!g.can(VIEW)) return tripsFail("FORBIDDEN");
  if (money && !g.can(PAY)) return tripsFail("FORBIDDEN");
  return g;
}
export type BookingUnitVM = { id: string; slug: string; tz: string; today: string; nowIso: string };
async function unitOf(g: TripsUnitGate, now: Date): Promise<BookingUnitVM> {
  const u = await tenantDb({ tenantId: g.tenantId }).businessUnit.findFirst({ where: { id: g.unitId, tenantId: g.tenantId }, select: { settings: true } });
  const tz = normalizeTimezone(isRec(u?.settings) ? u.settings.timezone : null);
  return { id: g.unitId, slug: g.unitSlug, tz, today: utcToLocal(tz, now).ymd, nowIso: now.toISOString() };
}
/** SellCtx ของบริการ T0.7a (STAFF · COUNTER · นาฬิกาเดียวกับจอ) */
const sellCtxOf = (g: TripsUnitGate, now: Date): SellCtx => ({ tenantId: g.tenantId, unitId: g.unitId, channel: "COUNTER", actor: { kind: "STAFF", userId: g.actorUserId }, now, locale: "th" });
const localYmd = (tz: string, d: Date | string): string => utcToLocal(tz, new Date(d)).ymd;
const localHm = (tz: string, d: Date | string): string => hhmm(utcToLocal(tz, new Date(d)).minutes);
const localStamp = (tz: string, d: Date | string): string => `${localYmd(tz, d)} ${localHm(tz, d)}`;
/** "08:00–16:30" ตามเวลาร้าน · จบคนละวัน ⇒ ต่อท้าย " (+N)" (แบบจอปฏิทินรอบ) */
function timeTextOf(tz: string, startsAt: Date | null, endsAt: Date | null): string {
  if (!startsAt || !endsAt) return "";
  const s = utcToLocal(tz, new Date(startsAt));
  const e = utcToLocal(tz, new Date(endsAt));
  const days = Math.round((Date.parse(`${e.ymd}T00:00:00.000Z`) - Date.parse(`${s.ymd}T00:00:00.000Z`)) / DAY_MS);
  return `${hhmm(s.minutes)}–${hhmm(e.minutes)}${days > 0 ? ` (+${days})` : ""}`;
}

// ═══════════════ SQL (อ่านอย่างเดียว · พารามิเตอร์ผูกทั้งหมด) ═══════════════
/** ตัวสะสมพารามิเตอร์: add(ค่า) ⇒ "$n" */
type Params = { values: unknown[]; add(v: unknown): string };
const newParams = (): Params => {
  const values: unknown[] = [];
  return { values, add: (v) => `$${values.push(v)}` };
};
/** รายการรหัสคงที่ของไฟล์ ⇒ ARRAY[...] (รับเฉพาะตัวพิมพ์ใหญ่/ขีดล่าง — ไม่ใช่ค่าจากผู้ใช้) */
const codeArray = (codes: readonly string[]): string => `ARRAY[${codes.filter((c) => /^[A-Z_]+$/.test(c)).map((c) => `'${c}'`).join(",")}]::text[]`;
/** "ต้องทำ" ของแถว (ต้องตรงกับ attentionOf ด้านล่าง) */
const ATTENTION_SQL = `(
  b."status" = 'PENDING'
  OR EXISTS (SELECT 1 FROM "TripRefundRequest" r WHERE r."bookingId" = b."id" AND r."tenantId" = b."tenantId" AND r."unitId" = b."unitId" AND r."status" = ANY(${codeArray(OPEN_REFUND)}))
  OR (b."status" = ANY(${codeArray(LIVE)}) AND EXISTS (SELECT 1 FROM "TripDeparture" dc WHERE dc."id" = b."departureId" AND dc."tenantId" = b."tenantId" AND dc."unitId" = b."unitId" AND dc."status" = 'CANCELLED'))
  OR (b."status" = ANY(${codeArray(OWES)}) AND EXISTS (SELECT 1 FROM "TripPaymentDue" pd WHERE pd."bookingId" = b."id" AND pd."tenantId" = b."tenantId" AND pd."unitId" = b."unitId" AND pd."status" = 'OVERDUE'))
)`;
const PAYABLE_SQL = `(b."grossSatang" - b."discountSatang" - b."agentDiscountSatang")`;
const ROW_COLS = `b."id", b."code", b."status", b."version", b."productId", b."departureId", b."travelDate", b."bookerPartyId", b."piiPurgedAt", b."channel", b."agentAccountId", b."agentRef",
  b."collectMode", b."currency", b."grossSatang", b."discountSatang", b."agentDiscountSatang", b."paidSatang", b."refundedSatang", b."createdAt",
  d."startsAt" AS "depStartsAt", d."endsAt" AS "depEndsAt", d."status" AS "depStatus", d."cancelReason" AS "depCancelReason"`;
const ROW_FROM = `FROM "TripBooking" b LEFT JOIN "TripDeparture" d ON d."id" = b."departureId" AND d."tenantId" = b."tenantId" AND d."unitId" = b."unitId"`;
type BaseRow = {
  id: string;
  code: string;
  status: string;
  version: number;
  productId: string;
  departureId: string;
  travelDate: Date;
  bookerPartyId: string | null;
  piiPurgedAt: Date | null;
  channel: string;
  agentAccountId: string | null;
  agentRef: string | null;
  collectMode: string;
  currency: string;
  grossSatang: number;
  discountSatang: number;
  agentDiscountSatang: number;
  paidSatang: number;
  refundedSatang: number;
  createdAt: Date;
  depStartsAt: Date | null;
  depEndsAt: Date | null;
  depStatus: string | null;
  depCancelReason: string | null;
};
type BaseFilter = {
  from: string | null;
  to: string | null;
  product: string | null;
  channel: string;
  dep: string | null;
  code: string | null;
  text: { agentRef: string; partyIds: string[] } | null;
};
/** เงื่อนไขของชุดฐาน B (ร้าน + หน่วย + หน้าต่างวัน + สินค้า + ช่องทาง + รอบ + ค้น) */
function baseWhere(g: TripsUnitGate, f: BaseFilter, p: Params): string {
  const w = [`b."tenantId" = ${p.add(g.tenantId)}`, `b."unitId" = ${p.add(g.unitId)}`];
  if (f.from) w.push(`b."travelDate" >= ${p.add(f.from)}::date`);
  if (f.to) w.push(`b."travelDate" <= ${p.add(f.to)}::date`);
  if (f.product) w.push(`b."productId" = ${p.add(f.product)}`);
  if (f.channel === "direct") w.push(`b."agentAccountId" IS NULL`);
  else if (f.channel === "agent") w.push(`b."agentAccountId" IS NOT NULL`);
  else if (f.channel !== "all") w.push(`b."channel" = ${p.add(f.channel)}`);
  if (f.dep) w.push(`b."departureId" = ${p.add(f.dep)}`);
  if (f.code) w.push(`b."code" = ${p.add(f.code)}`);
  if (f.text) w.push(`(b."agentRef" = ${p.add(f.text.agentRef)} OR b."bookerPartyId" = ANY(${p.add(f.text.partyIds)}::text[]))`);
  return w.join(" AND ");
}
/** เงื่อนไขของคิวรีชุด "ของการจองชุดนี้" (ร้าน + หน่วย + bookingId ∈ ids) — alias เป็นค่าคงที่ของไฟล์ */
function batchWhere(g: TripsUnitGate, alias: "pd" | "e", ids: readonly string[], p: Params): string {
  return `${alias}."tenantId" = ${p.add(g.tenantId)} AND ${alias}."unitId" = ${p.add(g.unitId)} AND ${alias}."bookingId" = ANY(${p.add([...ids])}::text[])`;
}
type NextDueRow = { bookingId: string; dueAt: Date; outstandingSatang: number };
type BookingIdRow = { bookingId: string };
type LastTenderRow = { bookingId: string; tender: string };
/** งวดแรกที่ยังค้างต่อการจอง · การจองที่มีงวดเกินกำหนด · วิธีจ่ายของการรับเงินล่าสุดต่อการจอง — แต่ละคิวรีได้ไม่เกิน 1 แถวต่อการจอง + LIMIT ใน SQL */
function batchMoney(g: TripsUnitGate, ids: readonly string[]): [Promise<NextDueRow[]>, Promise<BookingIdRow[]>, Promise<LastTenderRow[]>] {
  const np = newParams();
  const nextSql = `SELECT DISTINCT ON (pd."bookingId") pd."bookingId", pd."dueAt", (pd."amountSatang" - pd."paidSatang")::int AS "outstandingSatang"
    FROM "TripPaymentDue" pd WHERE ${batchWhere(g, "pd", ids, np)} AND pd."status" = ANY(${codeArray(DUE_OPEN)}) AND pd."amountSatang" - pd."paidSatang" > 0
    ORDER BY pd."bookingId" ASC, pd."seq" ASC LIMIT ${np.add(TRIPS_BOOKING_LIST_CAP)}::int`;
  const op = newParams();
  const overdueSql = `SELECT DISTINCT pd."bookingId" FROM "TripPaymentDue" pd WHERE ${batchWhere(g, "pd", ids, op)} AND pd."status" = 'OVERDUE' LIMIT ${op.add(TRIPS_BOOKING_LIST_CAP)}::int`;
  const tp = newParams();
  const tenderSql = `SELECT DISTINCT ON (e."bookingId") e."bookingId", e."tender" FROM "TripMoneyEvent" e WHERE ${batchWhere(g, "e", ids, tp)} AND e."kind" = 'RECEIVED'
    ORDER BY e."bookingId" ASC, e."createdAt" DESC, e."id" DESC LIMIT ${tp.add(TRIPS_BOOKING_LIST_CAP)}::int`;
  return [g.db.$queryRawUnsafe<NextDueRow[]>(nextSql, ...np.values), g.db.$queryRawUnsafe<BookingIdRow[]>(overdueSql, ...op.values), g.db.$queryRawUnsafe<LastTenderRow[]>(tenderSql, ...tp.values)];
}

// ═══════════════ ชนิด VM ═══════════════
export type BookingRowVM = {
  bookingId: string;
  code: string;
  status: string;
  version: number;
  productId: string;
  productTitleTh: string;
  productTitleEn: string | null;
  departureId: string;
  /** วันเดินทาง YYYY-MM-DD */
  travelDate: string;
  /** "08:00–16:30" ตามเขตเวลาร้าน */
  timeText: string;
  departureStatus: string;
  /** ดิบ — จอถอดด้วย parseReason (รูป preset: / merge: ของ T1.2) */
  departureCancelReason: string | null;
  bookerName: string | null;
  bookerPurged: boolean;
  channel: string;
  agentAccountId: string | null;
  agentRef: string | null;
  collectMode: string;
  currency: string;
  pax: { paxTypeId: string; code: string; labelTh: string; labelEn: string | null; qty: number }[];
  extras: { extraId: string; nameTh: string; nameEn: string | null; qty: number }[];
  payableSatang: number;
  paidSatang: number;
  refundedSatang: number;
  outstandingSatang: number;
  money: BookingMoneyState;
  /** tender ของการรับเงินล่าสุด */
  lastTender: string | null;
  /** งวดแถวจริงแรกที่ยังค้าง (ไม่มีแถวงวด ⇒ null) */
  nextDue: { dueAt: string; localDate: string; amountSatang: number } | null;
  /** hold ACTIVE ที่หมดเร็วสุด */
  hold: { expiresAt: string; localDate: string; time: string; expired: boolean } | null;
  /** คำขอคืนเงินเปิดล่าสุด */
  refund: { requestId: string; status: string; amountSatang: number } | null;
  attention: BookingAttention[];
  badge: { kind: string; shape: BookingBadgeShape };
  createdAt: string;
  createdLocal: string;
};
export type BookingListVM = {
  unit: BookingUnitVM;
  flags: { canPay: boolean; canApprove: boolean; canCancel: boolean; canSeeMoney: boolean; canCreate: false };
  query: { q: string | null; queryMode: "none" | "code" | "text"; product: string | null; when: BookingListWhen; date: string | null; channel: string; chip: BookingListChip; dep: string | null };
  products: { id: string; titleTh: string; titleEn: string | null }[];
  chips: { all: number; day: { date: string; n: number } | null; hold: number; attention: number };
  segments: { refundsOpen: number; docsWaiting: number | null };
  rows: BookingRowVM[];
  total: number;
  shown: number;
  cap: number;
  truncated: boolean;
  sumPayableSatang: number;
  search: { nameCapped: boolean };
};
export type BookingDetailVM = {
  unit: BookingUnitVM;
  row: BookingRowVM;
  customer: { name: string | null; phoneMasked: string | null; purged: boolean };
  lines: { itemRef: string; labelTh: string; labelEn: string | null; qty: number; amountSatang: number; passThrough: boolean }[];
  document: { serviceInclVatSatang: number; preVatSatang: number; vatSatang: number; passThroughSatang: number; totalSatang: number };
  payableSatang: number;
  paidSatang: number;
  refundedSatang: number;
  outstandingSatang: number;
  dues: { id: string | null; seq: number; kind: string; dueAt: string; dueLocal: string; amountSatang: number; paidSatang: number; outstandingSatang: number; status: string }[];
  /** reference = เลขอ้างอิงที่ผู้รับเงินพิมพ์ตอนรับเงิน (ไม่มี ⇒ null) */
  events: { id: string; kind: string; tender: string; amountSatang: number; vatSatang: number; passThroughSatang: number; postingStatus: string; at: string; atLocal: string; reference: string | null }[];
  docs: { issued: false; waiting: { eventId: string; kind: string; tender: string; amountSatang: number; vatSatang: number; passThroughSatang: number; atLocal: string; reference: string | null }[]; vatDiffSatang: number };
  travellers: { seats: number; names: string[]; formsAvailable: false };
  refunds: { requestId: string; status: string; amountSatang: number; createdLocal: string }[];
  actions: { pay: boolean; qr: boolean; approve: boolean; reject: boolean; cancel: boolean; change: false; refund: false };
};
export type BookingDocsVM = {
  unit: BookingUnitVM;
  count: number;
  shown: number;
  cap: number;
  truncated: boolean;
  /** reference = เลขอ้างอิงที่ผู้รับเงินพิมพ์ · vatDiffSatang = Σ VAT ต่อใบรับ − VAT ของการจอง (เฉพาะแถวรับเงินของการจองที่จ่ายครบ · ไม่ต่าง ⇒ 0) ⇒ ≠ 0 ให้ตรวจกับนักบัญชี */
  items: { eventId: string; bookingId: string; code: string; kind: string; tender: string; amountSatang: number; vatSatang: number; passThroughSatang: number; at: string; atLocal: string; reference: string | null; vatDiffSatang: number }[];
};
type TenderTotals = { receivedSatang: number; refundedSatang: number };
export type CashDayVM = {
  unit: BookingUnitVM;
  businessDate: string;
  tz: string;
  receivedSatang: number;
  refundedSatang: number;
  expectedSatang: number;
  byTender: Record<"CASH" | "PROMPTPAY" | "TRANSFER" | "CARD", TenderTotals>;
  events: { id: string; bookingId: string; code: string; kind: string; tender: string; amountSatang: number; atLocal: string }[];
  total: number;
  shown: number;
  truncated: boolean;
  closeAvailable: false;
};

// ═══════════════ ตัวสร้างแถว (รายการ + รายละเอียดใช้ตัวเดียวกัน) ═══════════════
type PaxTypeRow = { id: string; productId: string; code: string; label: unknown; countsCapacity: boolean; sortOrder: number };
type ExtraRow = { id: string; name: unknown };
type RowExtras = { rows: BookingRowVM[]; paxTypes: PaxTypeRow[]; seatsOf: Map<string, number> };
/** ข้อมูลประกอบแถว — อ่านเป็นชุด 2 รอบ (รอบสอง = รายการเสริมตาม id ที่พบในรายการ) ไม่มีคิวรีต่อแถว */
async function buildRows(g: TripsUnitGate, unit: BookingUnitVM, now: Date, base: readonly BaseRow[]): Promise<RowExtras> {
  if (!base.length) return { rows: [], paxTypes: [], seatsOf: new Map() };
  const scope = { tenantId: g.tenantId, unitId: g.unitId };
  const ids = base.map((b) => b.id);
  const productIds = [...new Set(base.map((b) => b.productId))];
  const partyIds = [...new Set(base.filter((b) => b.piiPurgedAt === null && b.bookerPartyId).map((b) => String(b.bookerPartyId)))];
  const [nextDueQ, overdueQ, lastTenderQ] = batchMoney(g, ids);
  const [products, paxTypes, items, briefs, holds, refunds, nextDues, overdues, lastTenders] = await Promise.all([
    g.db.tripProduct.findMany({ where: { ...scope, id: { in: productIds } }, select: { id: true, title: true } }),
    g.db.tripPaxType.findMany({ where: { ...scope, productId: { in: productIds } }, select: { id: true, productId: true, code: true, label: true, countsCapacity: true, sortOrder: true } }),
    g.db.tripBookingItem.findMany({ where: { ...scope, bookingId: { in: ids }, active: true }, select: { bookingId: true, kind: true, paxTypeId: true, extraId: true, qty: true, passThrough: true } }),
    listBriefsByIds(g.tenantId, partyIds),
    g.db.tripHold.findMany({ where: { ...scope, bookingId: { in: ids }, status: "ACTIVE" }, select: { bookingId: true, expiresAt: true }, orderBy: [{ expiresAt: "asc" }, { id: "asc" }] }),
    g.db.tripRefundRequest.findMany({ where: { ...scope, bookingId: { in: ids }, status: { in: OPEN_REFUND } }, select: { id: true, bookingId: true, status: true, amountSatang: true }, orderBy: [{ createdAt: "desc" }, { id: "asc" }] }),
    nextDueQ,
    overdueQ,
    lastTenderQ,
  ]);
  const extraIds = [...new Set(items.filter((i) => i.kind === "EXTRA" && i.extraId).map((i) => String(i.extraId)))];
  const extras: ExtraRow[] = extraIds.length ? await g.db.tripExtra.findMany({ where: { ...scope, id: { in: extraIds } }, select: { id: true, name: true } }) : [];

  const productOf = new Map(products.map((p) => [p.id, p]));
  const paxOf = new Map(paxTypes.map((p) => [p.id, p]));
  const extraOf = new Map(extras.map((e) => [e.id, e]));
  const nameOf = new Map(briefs.map((p) => [p.id, p.name]));
  const group = <T extends { bookingId: string | null }>(list: readonly T[]): Map<string, T[]> => {
    const m = new Map<string, T[]>();
    for (const x of list) {
      if (!x.bookingId) continue;
      const cur = m.get(x.bookingId);
      if (cur) cur.push(x);
      else m.set(x.bookingId, [x]);
    }
    return m;
  };
  const itemsOf = group(items);
  const holdsOf = group(holds);
  const refundsOf = group(refunds);
  const nextDueOf = new Map(nextDues.map((x) => [x.bookingId, x]));
  const overdueSet = new Set(overdues.map((x) => x.bookingId));
  const lastTenderOf = new Map(lastTenders.map((x) => [x.bookingId, x.tender]));
  const seatsOf = new Map<string, number>();

  const rows = base.map((b): BookingRowVM => {
    const its = itemsOf.get(b.id) ?? [];
    // คน: รายการ SEAT active รวมต่อประเภทคน เรียงลำดับของประเภทคน
    const paxQty = new Map<string, number>();
    for (const it of its) if (it.kind === "SEAT" && it.paxTypeId) paxQty.set(it.paxTypeId, (paxQty.get(it.paxTypeId) ?? 0) + it.qty);
    const pax = [...paxQty.entries()]
      .map(([paxTypeId, qty]) => ({ pt: paxOf.get(paxTypeId), paxTypeId, qty }))
      .sort((x, y) => (x.pt?.sortOrder ?? 0) - (y.pt?.sortOrder ?? 0) || (x.pt?.code ?? "").localeCompare(y.pt?.code ?? ""))
      .map((x) => ({ paxTypeId: x.paxTypeId, code: x.pt?.code ?? "", labelTh: i18nTh(x.pt?.label), labelEn: i18nEn(x.pt?.label), qty: x.qty }));
    seatsOf.set(b.id, [...paxQty.entries()].reduce((s, [id, qty]) => s + (paxOf.get(id)?.countsCapacity === false ? 0 : qty), 0));
    // รายการเสริม: EXTRA active ที่ไม่ใช่เก็บแทน รวมต่อรายการ
    const extraQty = new Map<string, number>();
    for (const it of its) if (it.kind === "EXTRA" && it.extraId && !it.passThrough) extraQty.set(it.extraId, (extraQty.get(it.extraId) ?? 0) + it.qty);
    const extrasVm = [...extraQty.entries()].map(([extraId, qty]) => ({ extraId, nameTh: i18nTh(extraOf.get(extraId)?.name), nameEn: i18nEn(extraOf.get(extraId)?.name), qty }));

    const payable = b.grossSatang - b.discountSatang - b.agentDiscountSatang;
    const outstanding = outstandingOf({ status: b.status, payableSatang: payable, paidSatang: b.paidSatang });
    const purged = b.piiPurgedAt !== null;
    const h = (holdsOf.get(b.id) ?? [])[0];
    const rf = (refundsOf.get(b.id) ?? [])[0];
    const owes = OWES.includes(b.status);
    const next = owes ? nextDueOf.get(b.id) : undefined;
    const attention: BookingAttention[] = BOOKING_ATTENTION_KINDS.filter((k) => attentionOf(k, { status: b.status, hasOpenRefund: !!rf, departureStatus: b.depStatus, hasOverdue: overdueSet.has(b.id) }));
    const product = productOf.get(b.productId);
    return {
      bookingId: b.id,
      code: b.code,
      status: b.status,
      version: Number(b.version),
      productId: b.productId,
      productTitleTh: i18nTh(product?.title),
      productTitleEn: i18nEn(product?.title),
      departureId: b.departureId,
      travelDate: ymdOfDate(b.travelDate),
      timeText: timeTextOf(unit.tz, b.depStartsAt, b.depEndsAt),
      departureStatus: b.depStatus ?? "",
      departureCancelReason: b.depCancelReason ?? null,
      bookerName: purged || !b.bookerPartyId ? null : (nameOf.get(b.bookerPartyId) ?? null),
      bookerPurged: purged,
      channel: b.channel,
      agentAccountId: b.agentAccountId,
      agentRef: b.agentRef,
      collectMode: b.collectMode,
      currency: b.currency,
      pax,
      extras: extrasVm,
      payableSatang: payable,
      paidSatang: b.paidSatang,
      refundedSatang: b.refundedSatang,
      outstandingSatang: outstanding,
      money: moneyStateOf({ status: b.status, collectMode: b.collectMode, agentAccountId: b.agentAccountId, payableSatang: payable, paidSatang: b.paidSatang, refundedSatang: b.refundedSatang }),
      lastTender: lastTenderOf.get(b.id) ?? null,
      nextDue: next ? { dueAt: iso(next.dueAt), localDate: localYmd(unit.tz, next.dueAt), amountSatang: Number(next.outstandingSatang) } : null,
      hold: h ? { expiresAt: iso(h.expiresAt), localDate: localYmd(unit.tz, h.expiresAt), time: localHm(unit.tz, h.expiresAt), expired: new Date(h.expiresAt).getTime() <= now.getTime() } : null,
      refund: rf ? { requestId: rf.id, status: rf.status, amountSatang: rf.amountSatang } : null,
      attention,
      badge: bookingBadgeOf({ status: b.status, attention }),
      createdAt: iso(b.createdAt),
      createdLocal: localYmd(unit.tz, b.createdAt),
    };
  });
  return { rows, paxTypes, seatsOf };
}
/** เรื่องต้องทำของแถว (ต้องตรงกับ ATTENTION_SQL) */
function attentionOf(kind: BookingAttention, b: { status: string; hasOpenRefund: boolean; departureStatus: string | null; hasOverdue: boolean }): boolean {
  switch (kind) {
    case "REFUND_OPEN":
      return b.hasOpenRefund;
    case "PENDING_APPROVAL":
      return b.status === "PENDING";
    case "DEPARTURE_CANCELLED":
      return b.departureStatus === "CANCELLED" && LIVE.includes(b.status);
    case "OVERDUE":
      return b.hasOverdue && OWES.includes(b.status);
  }
}

// ═══════════════ 1. รายการการจอง ═══════════════
const CHANNELS: readonly string[] = ["all", "direct", "agent", ...DEPARTURE_SELL_CHANNELS];
const LIST_IN = z.strictObject({
  unitId: ID,
  q: z.string().trim().min(1).max(100).refine(noCtl).optional(),
  product: ID.optional(),
  when: z.enum(BOOKING_LIST_WHENS).optional(),
  date: YMD.optional(),
  channel: z.string().refine((c): c is "all" | "direct" | "agent" | SellChannel => CHANNELS.includes(c)).optional(),
  chip: z.enum(BOOKING_LIST_CHIPS).optional(),
  dep: ID.optional(),
});
type Big = bigint | number | string | null;
type AggRow = { all: number; hold: number; attention: number; day: Date | null; sumAll: Big; sumHold: Big; sumAttention: Big };
type DayRow = { n: number; sum: Big };
const numOf = (v: Big | undefined): number => (v === null || v === undefined ? 0 : Number(v));

export async function loadBookingListVM(ctx: TripsScreenCtx, input: unknown, opts?: Opts): Promise<{ ok: true; vm: BookingListVM } | Fail> {
  const p = parse(LIST_IN, input);
  if (isFail(p)) return p;
  const g = await gateBookings(ctx, p.unitId);
  if (isFail(g)) return g;
  const now = nowOf(opts);
  const unit = await unitOf(g, now);
  const when: BookingListWhen = p.when ?? "upcoming";
  const chip: BookingListChip = p.chip ?? "all";
  const channel = p.channel ?? "all";
  const canSeeMoney = g.can(PAY);

  // ── ค้น: เลขจอง (ตรงตัว) หรือ เลขอ้างอิงเอเจนซี่/ชื่อผู้จอง · มี q ⇒ ไม่จำกัดหน้าต่างวัน ──
  const code = p.q ? bookingCodeQuery(p.q) : null;
  const queryMode: "none" | "code" | "text" = !p.q ? "none" : code ? "code" : "text";
  // ชื่อผู้จอง: ตัดตัวแทนของ LIKE (% _ \) ออกก่อนส่ง facade party (ไม่ให้ "%" แปลว่า "ทุกคน") · เหลือว่าง ⇒ ไม่ค้นชื่อ (ยังค้นเลขอ้างอิงเอเจนซี่ตรงตัว)
  const nameQ = queryMode === "text" && p.q ? p.q.replace(NAME_WILDCARD_RE, "").trim() : "";
  const matches = nameQ ? await searchByName(g.tenantId, nameQ, 25) : [];
  const win = p.q ? { from: null, to: null } : p.date ? { from: p.date, to: p.date } : (listWindowOf(when, unit.today) ?? { from: null, to: null });
  const filter: BaseFilter = {
    from: win.from,
    to: win.to,
    product: p.product ?? null,
    channel,
    dep: p.dep ?? null,
    code,
    text: queryMode === "text" && p.q ? { agentRef: p.q, partyIds: matches.map((m) => m.id) } : null,
  };

  // ── ชิป + จำนวน + ยอดรวม: คิวรีรวมบนชุดฐาน (ไม่นับจากแถวที่ถูกตัด) ──
  const ap = newParams();
  const aggWhere = baseWhere(g, filter, ap);
  const today = ap.add(unit.today);
  const aggSql = `SELECT count(*)::int AS "all",
      (count(*) FILTER (WHERE b."status" = 'HOLD'))::int AS "hold",
      (count(*) FILTER (WHERE ${ATTENTION_SQL}))::int AS "attention",
      min(b."travelDate") FILTER (WHERE b."travelDate" >= ${today}::date) AS "day",
      coalesce(sum(${PAYABLE_SQL}), 0)::bigint AS "sumAll",
      coalesce(sum(${PAYABLE_SQL}) FILTER (WHERE b."status" = 'HOLD'), 0)::bigint AS "sumHold",
      coalesce(sum(${PAYABLE_SQL}) FILTER (WHERE ${ATTENTION_SQL}), 0)::bigint AS "sumAttention"
    FROM "TripBooking" b WHERE ${aggWhere}`;
  const [aggRows, products, refundsOpen, docsWaiting] = await Promise.all([
    g.db.$queryRawUnsafe<AggRow[]>(aggSql, ...ap.values),
    g.db.tripProduct.findMany({ where: { tenantId: g.tenantId, unitId: g.unitId, status: { not: "ARCHIVED" } }, select: { id: true, title: true }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], take: PRODUCT_FILTER_CAP }),
    g.db.tripRefundRequest.count({ where: { tenantId: g.tenantId, unitId: g.unitId, status: { in: OPEN_REFUND } } }),
    canSeeMoney ? g.db.tripMoneyEvent.count({ where: { tenantId: g.tenantId, unitId: g.unitId, postingStatus: "UNPOSTED", kind: { in: MONEY_DOC_KINDS } } }) : Promise.resolve(null),
  ]);
  const agg = aggRows[0];
  const dayDate = agg?.day ? ymdOfDate(agg.day) : null;

  // ── แถว (ชุดฐาน ∧ ชิป) + จำนวนของวันเดินทางถัดไป ──
  const dp = newParams();
  const dayWhere = baseWhere(g, filter, dp);
  const daySql = `SELECT count(*)::int AS "n", coalesce(sum(${PAYABLE_SQL}), 0)::bigint AS "sum" FROM "TripBooking" b WHERE ${dayWhere} AND b."travelDate" = ${dp.add(dayDate ?? unit.today)}::date`;
  const rp = newParams();
  const rowWhere = baseWhere(g, filter, rp);
  const chipSql = chip === "hold" ? ` AND b."status" = 'HOLD'` : chip === "attention" ? ` AND ${ATTENTION_SQL}` : chip === "day" ? ` AND b."travelDate" = ${rp.add(dayDate ?? unit.today)}::date` : "";
  const dir = when === "past30" && !p.q && !p.date ? "DESC" : "ASC";
  const rowSql = `SELECT ${ROW_COLS} ${ROW_FROM} WHERE ${rowWhere}${chipSql}
    ORDER BY b."travelDate" ${dir}, d."startsAt" ASC NULLS LAST, b."code" ASC LIMIT ${rp.add(TRIPS_BOOKING_LIST_CAP)}::int`;
  const noDayRows = chip === "day" && dayDate === null;
  const [dayRows, baseRows] = await Promise.all([
    dayDate ? g.db.$queryRawUnsafe<DayRow[]>(daySql, ...dp.values) : Promise.resolve<DayRow[]>([]),
    noDayRows ? Promise.resolve<BaseRow[]>([]) : g.db.$queryRawUnsafe<BaseRow[]>(rowSql, ...rp.values),
  ]);
  const dayN = numOf(dayRows[0]?.n);
  const { rows } = await buildRows(g, unit, now, baseRows);

  const total = chip === "hold" ? numOf(agg?.hold) : chip === "attention" ? numOf(agg?.attention) : chip === "day" ? (dayDate ? dayN : 0) : numOf(agg?.all);
  const sum = chip === "hold" ? numOf(agg?.sumHold) : chip === "attention" ? numOf(agg?.sumAttention) : chip === "day" ? (dayDate ? numOf(dayRows[0]?.sum) : 0) : numOf(agg?.sumAll);
  return {
    ok: true,
    vm: {
      unit,
      flags: { canPay: canSeeMoney, canApprove: g.can(APPROVE), canCancel: g.can(CANCEL), canSeeMoney, canCreate: false },
      query: { q: p.q ?? null, queryMode, product: p.product ?? null, when, date: p.date ?? null, channel, chip, dep: p.dep ?? null },
      products: products.map((x) => ({ id: x.id, titleTh: i18nTh(x.title), titleEn: i18nEn(x.title) })),
      chips: { all: numOf(agg?.all), day: dayDate ? { date: dayDate, n: dayN } : null, hold: numOf(agg?.hold), attention: numOf(agg?.attention) },
      segments: { refundsOpen, docsWaiting },
      rows,
      total,
      shown: rows.length,
      cap: TRIPS_BOOKING_LIST_CAP,
      truncated: total > rows.length,
      sumPayableSatang: sum,
      search: { nameCapped: queryMode === "text" && matches.length >= NAME_MATCH_CAP },
    },
  };
}

// ═══════════════ 2. รายละเอียดการจอง ═══════════════
const DETAIL_IN = z.strictObject({ unitId: ID, bookingId: ID });
/** ป้ายอังกฤษของบรรทัดเอกสารจาก itemRef (seat:<รหัสคน> · extra:<id>[:<รหัสคน>]) — ขาดภาษาอังกฤษส่วนใด ⇒ null */
function lineLabelEn(itemRef: string, paxByCode: Map<string, PaxTypeRow>, extraOf: Map<string, ExtraRow>): string | null {
  const parts = itemRef.split(":");
  if (parts[0] === "seat" && parts.length === 2) return i18nEn(paxByCode.get(parts[1])?.label);
  if (parts[0] === "extra" && (parts.length === 2 || parts.length === 3)) {
    const name = i18nEn(extraOf.get(parts[1])?.name);
    if (name === null) return null;
    if (parts.length === 2) return name;
    const pax = i18nEn(paxByCode.get(parts[2])?.label);
    return pax === null ? null : `${name} ${pax}`;
  }
  return null;
}

export async function loadBookingDetailVM(ctx: TripsScreenCtx, input: unknown, opts?: Opts): Promise<{ ok: true; vm: BookingDetailVM } | Fail> {
  const p = parse(DETAIL_IN, input);
  if (isFail(p)) return p;
  const g = await gateBookings(ctx, p.unitId);
  if (isFail(g)) return g;
  const now = nowOf(opts);
  const unit = await unitOf(g, now);
  const bp = newParams();
  const baseRows = await g.db.$queryRawUnsafe<BaseRow[]>(`SELECT ${ROW_COLS} ${ROW_FROM} WHERE b."tenantId" = ${bp.add(g.tenantId)} AND b."unitId" = ${bp.add(g.unitId)} AND b."id" = ${bp.add(p.bookingId)} LIMIT 1`, ...bp.values);
  const b = baseRows[0];
  if (!b) return tripsFail("NOT_FOUND");
  const sctx = sellCtxOf(g, now);
  const purged = b.piiPurgedAt !== null;
  const [built, summary, refundList, profile] = await Promise.all([
    buildRows(g, unit, now, [b]),
    tripMoneySummary(sctx, { bookingId: b.id }),
    listTripRefunds(sctx, { bookingId: b.id, limit: 50 }),
    !purged && b.bookerPartyId ? getProfile(g.tenantId, b.bookerPartyId) : Promise.resolve(null),
  ]);
  const row = built.rows[0];
  if (!row) return tripsFail("NOT_FOUND");
  if (!summary.ok) return summary.code === "NOT_FOUND" ? tripsFail("NOT_FOUND") : { ok: false, code: summary.code, message: summary.messageTh };
  const s = summary.value;
  const doc = s.document;
  if (!doc) return tripsFail("NOT_FOUND");

  // ── ป้ายอังกฤษของบรรทัด + ชื่อผู้เดินทาง (อ่านเป็นชุด) ──
  const refExtraIds = [...new Set(doc.lines.map((l) => l.itemRef.split(":")).filter((x) => x[0] === "extra" && x[1]).map((x) => x[1]))];
  const seats = built.seatsOf.get(b.id) ?? 0;
  const [lineExtras, passengers, refRows] = await Promise.all([
    refExtraIds.length ? g.db.tripExtra.findMany({ where: { tenantId: g.tenantId, unitId: g.unitId, id: { in: refExtraIds } }, select: { id: true, name: true } }) : Promise.resolve<ExtraRow[]>([]),
    seats > 0
      ? g.db.tripPassenger.findMany({ where: { tenantId: g.tenantId, unitId: g.unitId, bookingId: b.id }, select: { bookingId: true, fullName: true }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], take: Math.min(seats, TRAVELLER_NAMES_CAP) })
      : Promise.resolve<{ bookingId: string; fullName: string }[]>([]),
    g.db.tripMoneyEvent.findMany({ where: { tenantId: g.tenantId, unitId: g.unitId, bookingId: b.id, reference: { not: null } }, select: { id: true, reference: true }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: EVENT_REFERENCE_CAP }),
  ]);
  const referenceOf = new Map(refRows.map((r) => [r.id, r.reference]));
  const paxByCode = new Map(built.paxTypes.filter((x) => x.productId === b.productId).map((x) => [x.code, x]));
  const extraOf = new Map(lineExtras.map((e) => [e.id, e]));

  const events = s.events.map((e) => ({ id: e.id, kind: e.kind, tender: e.tender, amountSatang: e.amountSatang, vatSatang: e.vatSatang, passThroughSatang: e.passThroughSatang, postingStatus: e.postingStatus, at: e.at, atLocal: localStamp(unit.tz, e.at), reference: referenceOf.get(e.id) ?? null }));
  const waiting = events
    .filter((e) => e.postingStatus === "UNPOSTED" && MONEY_DOC_KINDS.includes(e.kind))
    .map((e) => ({ eventId: e.id, kind: e.kind, tender: e.tender, amountSatang: e.amountSatang, vatSatang: e.vatSatang, passThroughSatang: e.passThroughSatang, atLocal: e.atLocal, reference: e.reference }));

  // ── ปุ่ม (ตรงกับด่านของ recordTripPayment / approveTripBooking / cancelTripBooking) ──
  const holdOk = b.status !== "HOLD" || (row.hold !== null && !row.hold.expired);
  const pay =
    g.can(PAY) && PAYABLE_STATUSES.includes(b.status) && s.outstandingSatang > 0 && row.refund === null && !purged && b.currency === "THB" && b.collectMode === "SHOP" && b.agentAccountId === null && holdOk;
  const approve = g.can(APPROVE) && b.status === "PENDING";
  return {
    ok: true,
    vm: {
      unit,
      row,
      customer: { name: purged ? null : (profile?.name ?? row.bookerName), phoneMasked: purged ? null : maskPhone(profile?.phone), purged },
      lines: doc.lines.map((l) => ({ itemRef: l.itemRef, labelTh: l.label, labelEn: lineLabelEn(l.itemRef, paxByCode, extraOf), qty: l.qty, amountSatang: l.amountSatang, passThrough: l.passThrough })),
      document: { serviceInclVatSatang: doc.serviceInclVatSatang, preVatSatang: doc.preVatSatang, vatSatang: doc.vatSatang, passThroughSatang: doc.passThroughSatang, totalSatang: doc.totalSatang },
      payableSatang: s.payableSatang,
      paidSatang: s.paidSatang,
      refundedSatang: s.refundedSatang,
      outstandingSatang: s.outstandingSatang,
      dues: s.dues.map((d) => ({ id: d.id, seq: d.seq, kind: d.kind, dueAt: d.dueAt, dueLocal: localYmd(unit.tz, d.dueAt), amountSatang: d.amountSatang, paidSatang: d.paidSatang, outstandingSatang: d.outstandingSatang, status: d.status })),
      events,
      docs: { issued: false, waiting, vatDiffSatang: s.vat.receiptRoundingDiffSatang },
      travellers: { seats, names: passengers.map((x) => x.fullName).filter((n) => n.trim() !== ""), formsAvailable: false },
      refunds: refundList.ok ? refundList.value.items.map((r) => ({ requestId: r.id, status: r.status, amountSatang: r.amountSatang, createdLocal: localYmd(unit.tz, r.createdAt) })) : [],
      actions: { pay, qr: pay, approve, reject: approve, cancel: g.can(CANCEL) && UNPAID_CANCEL_STATUSES.includes(b.status), change: false, refund: false },
    },
  };
}

// ═══════════════ 3. คิวเอกสารเงินรอออก (ทั้งหน่วย) ═══════════════
const UNIT_IN = z.strictObject({ unitId: ID });
type DocBooking = { code: string; vatDiffSatang: number };
type VatSumRow = { bookingId: string; vat: Big };
/** เลขจองของชุด id (คิวรีเดียว) */
async function codesOf(g: TripsUnitGate, bookingIds: readonly string[]): Promise<Map<string, string>> {
  const ids = [...new Set(bookingIds)];
  if (!ids.length) return new Map();
  const rows = await g.db.tripBooking.findMany({ where: { tenantId: g.tenantId, unitId: g.unitId, id: { in: ids } }, select: { id: true, code: true }, take: ids.length });
  return new Map(rows.map((r) => [r.id, r.code]));
}
/**
 * เลขจอง + ส่วนต่าง VAT ของการจองในคิวเอกสาร (2 คิวรีต่อจอ ไม่ใช่ต่อแถว)
 * ส่วนต่าง = กติกาเดียวกับ vat.receiptRoundingDiffSatang ของ tripMoneySummary: การจองที่จ่ายครบ ⇒ Σ VAT ของแถวรับเงิน − VAT ของการจอง · ยังไม่ครบ ⇒ 0
 */
async function docBookingsOf(g: TripsUnitGate, bookingIds: readonly string[]): Promise<Map<string, DocBooking>> {
  const ids = [...new Set(bookingIds)];
  if (!ids.length) return new Map();
  const vp = newParams();
  const vatSql = `SELECT e."bookingId", coalesce(sum(e."vatSatang"), 0)::bigint AS "vat" FROM "TripMoneyEvent" e WHERE ${batchWhere(g, "e", ids, vp)} AND e."kind" = 'RECEIVED'
    GROUP BY e."bookingId" LIMIT ${vp.add(TRIPS_MONEY_DOCS_CAP)}::int`;
  const [rows, vats] = await Promise.all([
    g.db.tripBooking.findMany({
      where: { tenantId: g.tenantId, unitId: g.unitId, id: { in: ids } },
      select: { id: true, code: true, grossSatang: true, discountSatang: true, agentDiscountSatang: true, paidSatang: true, vatSatang: true },
      take: ids.length,
    }),
    g.db.$queryRawUnsafe<VatSumRow[]>(vatSql, ...vp.values),
  ]);
  const receivedVatOf = new Map(vats.map((v) => [v.bookingId, numOf(v.vat)]));
  return new Map(
    rows.map((r) => {
      const payable = r.grossSatang - r.discountSatang - r.agentDiscountSatang;
      const full = payable > 0 && r.paidSatang >= payable;
      return [r.id, { code: r.code, vatDiffSatang: full ? (receivedVatOf.get(r.id) ?? 0) - r.vatSatang : 0 }];
    }),
  );
}
export async function loadBookingDocsVM(ctx: TripsScreenCtx, input: unknown, opts?: Opts): Promise<{ ok: true; vm: BookingDocsVM } | Fail> {
  const p = parse(UNIT_IN, input);
  if (isFail(p)) return p;
  const g = await gateBookings(ctx, p.unitId, true);
  if (isFail(g)) return g;
  const unit = await unitOf(g, nowOf(opts));
  const where = { tenantId: g.tenantId, unitId: g.unitId, postingStatus: "UNPOSTED", kind: { in: MONEY_DOC_KINDS } };
  const [count, evs] = await Promise.all([
    g.db.tripMoneyEvent.count({ where }),
    g.db.tripMoneyEvent.findMany({
      where,
      select: { id: true, bookingId: true, kind: true, tender: true, amountSatang: true, vatSatang: true, passThroughSatang: true, reference: true, createdAt: true },
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      take: TRIPS_MONEY_DOCS_CAP,
    }),
  ]);
  const bookings = await docBookingsOf(g, evs.map((e) => e.bookingId));
  return {
    ok: true,
    vm: {
      unit,
      count,
      shown: evs.length,
      cap: TRIPS_MONEY_DOCS_CAP,
      truncated: count > evs.length,
      items: evs.map((e) => ({
        eventId: e.id,
        bookingId: e.bookingId,
        code: bookings.get(e.bookingId)?.code ?? "",
        kind: e.kind,
        tender: e.tender,
        amountSatang: e.amountSatang,
        vatSatang: e.vatSatang,
        passThroughSatang: e.passThroughSatang,
        at: iso(e.createdAt),
        atLocal: localStamp(unit.tz, e.createdAt),
        reference: e.reference ?? null,
        vatDiffSatang: e.kind === "RECEIVED" ? (bookings.get(e.bookingId)?.vatDiffSatang ?? 0) : 0,
      })),
    },
  };
}

// ═══════════════ 4. เงินสดหน้าร้านรายวัน (ห่อ tripCashDay · อ่านอย่างเดียว) ═══════════════
const CASH_IN = z.strictObject({ unitId: ID, businessDate: YMD.optional() });
type CashAggRow = { kind: string; tender: string; sum: Big; n: number };
type CashEventRow = { id: string; bookingId: string; kind: string; tender: string; amountSatang: number; createdAt: Date };
const isCashTender = (t: string): t is (typeof TRIP_TENDERS)[number] => (TRIP_TENDERS as readonly string[]).includes(t);
/**
 * แถวเงินของวันทำการ (เวลาร้าน) — กติกาเดียวกับ tripCashDay ของ T0.7a: แถวรับเงิน/คืนเงินของหน่วยในช่วง [ต้นวัน, ต้นวันถัดไป) · เงินสดที่ต้องมี = เงินสดรับ − เงินสดคืน
 * ยอดรวม/จำนวน = คิวรีรวม (ทั้งวัน) · รายการ = ใหม่→เก่า ตัดที่เพดานใน SQL (ไม่อ่านทุกแถวของวันขึ้นมาแล้วตัด)
 */
export async function loadCashDayVM(ctx: TripsScreenCtx, input: unknown, opts?: Opts): Promise<{ ok: true; vm: CashDayVM } | Fail> {
  const p = parse(CASH_IN, input);
  if (isFail(p)) return p;
  const g = await gateBookings(ctx, p.unitId, true);
  if (isFail(g)) return g;
  const now = nowOf(opts);
  const unit = await unitOf(g, now);
  const day = p.businessDate ?? unit.today;
  const from = localToUtc(unit.tz, day, 0).toISOString();
  const to = localToUtc(unit.tz, addDaysYmd(day, 1), 0).toISOString();
  const dayWhere = (pp: Params): string =>
    `e."tenantId" = ${pp.add(g.tenantId)} AND e."postingStatus" = ANY(${codeArray(POSTING_STATUSES)}) AND e."unitId" = ${pp.add(g.unitId)} AND e."kind" = ANY(${codeArray(CASH_KINDS)})
      AND e."createdAt" >= ${pp.add(from)}::timestamp AND e."createdAt" < ${pp.add(to)}::timestamp`;
  const ap = newParams();
  const aggSql = `SELECT e."kind", e."tender", coalesce(sum(e."amountSatang"), 0)::bigint AS "sum", count(*)::int AS "n" FROM "TripMoneyEvent" e WHERE ${dayWhere(ap)}
    GROUP BY e."kind", e."tender" LIMIT ${ap.add(CASH_GROUP_CAP)}::int`;
  const rp = newParams();
  const rowSql = `SELECT e."id", e."bookingId", e."kind", e."tender", e."amountSatang", e."createdAt" FROM "TripMoneyEvent" e WHERE ${dayWhere(rp)}
    ORDER BY e."createdAt" DESC, e."id" DESC LIMIT ${rp.add(TRIPS_CASH_EVENTS_CAP)}::int`;
  const [aggs, shown] = await Promise.all([g.db.$queryRawUnsafe<CashAggRow[]>(aggSql, ...ap.values), g.db.$queryRawUnsafe<CashEventRow[]>(rowSql, ...rp.values)]);
  const byTender: CashDayVM["byTender"] = { CASH: { receivedSatang: 0, refundedSatang: 0 }, PROMPTPAY: { receivedSatang: 0, refundedSatang: 0 }, TRANSFER: { receivedSatang: 0, refundedSatang: 0 }, CARD: { receivedSatang: 0, refundedSatang: 0 } };
  const totals = { receivedSatang: 0, refundedSatang: 0, n: 0 };
  for (const a of aggs) {
    const field = a.kind === "RECEIVED" ? "receivedSatang" : "refundedSatang";
    totals[field] += numOf(a.sum);
    totals.n += numOf(a.n);
    if (isCashTender(a.tender)) byTender[a.tender][field] += numOf(a.sum);
  }
  const codes = await codesOf(g, shown.map((e) => e.bookingId));
  return {
    ok: true,
    vm: {
      unit,
      businessDate: day,
      tz: unit.tz,
      receivedSatang: totals.receivedSatang,
      refundedSatang: totals.refundedSatang,
      expectedSatang: byTender.CASH.receivedSatang - byTender.CASH.refundedSatang,
      byTender,
      events: shown.map((e) => ({ id: e.id, bookingId: e.bookingId, code: codes.get(e.bookingId) ?? "", kind: e.kind, tender: e.tender, amountSatang: Number(e.amountSatang), atLocal: localStamp(unit.tz, e.createdAt) })),
      total: totals.n,
      shown: shown.length,
      truncated: totals.n > shown.length,
      closeAvailable: false,
    },
  };
}
