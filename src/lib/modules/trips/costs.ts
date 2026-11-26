// ─────────────────────────────────────────────────────────────
// trips/costs.ts — ต้นทุนรอบ · สรุปเงินระดับรอบ · จอ "ต้นทุนและกำไรของรอบ" (RUN TRIPS T1.7a1 §4 §6)
// ทุกตัว (ctx: { tenantId, actorUserId }, input, opts?: { now? }) ⇒ { ok: true, vm|value } | { ok: false, code, message } ไม่ throw (ยกเว้นฐานล่ม)
// 🔴 ตัวเลขบริหาร ไม่ใช่รายงานบัญชี · ไม่ลงบัญชี · ไม่แตะ POS · ไม่ส่ง outbox · เขียนได้เฉพาะ TripCost + AuditLog
// 🔴 สิทธิ์ต้นทุน/คอมฯ/กำไร = costAccessOf (แคบ · trips.* ไม่นับ) — ผู้ไม่เห็นได้ช่องเหล่านั้นเป็น null · ข้อความปฏิเสธไม่มีตัวเลข
// 🔴 อ่านเป็นชุดต่อรอบ (การจอง + ที่นั่ง + RETAINED + คำขอคืนเงินเปิด ในคิวรีเดียว · ต้นทุน · ค่าตั้ง VAT) · ไม่มี await ในลูป · ไม่ใช้นาฬิกาฐานข้อมูล (เวลาจาก opts.now)
// ─────────────────────────────────────────────────────────────
import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { tenantDb } from "@/lib/core/db";
import { resolveSettings } from "@/lib/core/settings";
import { SELL_CHANNELS } from "@/lib/core/sellable";
import { hhmm, normalizeTimezone, utcToLocal } from "./departures-core";
import { TRIP_REFUND_OPEN_STATUSES } from "./money-core";
import { mulDivHalfUp } from "./money-math";
import { tripsFail, tripsUnitGate, type TripsFail, type TripsScreenCtx, type TripsUnitGate } from "./pickup";
import {
  CHANNEL_GROUPS,
  MONEY_WARNING_CODES,
  REPORT_LIVE_STATUSES,
  REPORT_PENDING_STATUSES,
  TRIP_COST_KINDS,
  TRIP_COST_ROWS_MAX,
  bookingMoneyInOfRow,
  bookingMoneyOf,
  channelGroupOf,
  charterLikeOf,
  costAccessOf,
  costContentKey,
  departureReportStateOf,
  loadFactorBp,
  parseCostRows,
  profitOf,
  sumMoney,
  type BookingMoney,
  type BookingMoneyRow,
  type CostRowIn,
  type DepartureReportState,
  type MoneyTotals,
  type MoneyWarningCode,
} from "./report-core";

// ── T1.7a1 costs ──
type Opts = { now?: Date };
type Tx = Prisma.TransactionClient;
type Code = "INVALID_INPUT" | "NOT_FOUND" | "FORBIDDEN" | "UNIT_NOT_TRIPS" | "STATE_CONFLICT" | "BUSY" | "COST_ROWS_LIMIT" | "COST_AMOUNT_INVALID";
type Fail = TripsFail<Code | string> & { row?: number; field?: string };
const isRec = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isFail = (x: unknown): x is TripsFail => isRec(x) && x.ok === false;
const CTL_RE = /[\u0000-\u001f\u007f]/;
const ID = z.string().min(1).max(128).refine((s) => !CTL_RE.test(s));
const nowOf = (opts?: Opts) => (opts?.now instanceof Date && !Number.isNaN(opts.now.getTime()) ? opts.now : new Date());
const i18nTh = (v: unknown): string => (isRec(v) && typeof v.th === "string" ? v.th : "");
const i18nEn = (v: unknown): string | null => (isRec(v) && typeof v.en === "string" && v.en.trim() ? v.en : null);
const DAY_MS = 86_400_000;
const TX_OPTS = { maxWait: 20_000, timeout: 30_000 } as const;
const VAT_KEY = "trips.tax.vatRegistered";
/** action ของ audit (ใบสั่ง §6) */
const A_SAVED = "trips.cost.saved";
/** ข้อความไทยของรหัสใหม่ (ไม่มีตัวเลขเงิน · ไม่สะท้อนอินพุต) */
const MSG: Record<string, string> = {
  STATE_CONFLICT: "มีคนบันทึกต้นทุนของรอบนี้ไปก่อนแล้ว — โหลดใหม่แล้วตรวจอีกครั้ง (ยอดที่พิมพ์ไว้จะหายเมื่อโหลดใหม่)",
  COST_ROWS_LIMIT: "ต้นทุนของรอบมีได้ไม่เกิน 30 รายการ",
  COST_AMOUNT_INVALID: "ยอดต้นทุนต้องมากกว่าศูนย์ ไม่เกิน 10,000,000 บาทต่อรายการ และรวมทั้งรอบไม่เกิน 21 ล้านบาท",
  BUSY: "มีคนกำลังบันทึกต้นทุนของรอบนี้อยู่ — ลองอีกครั้ง",
};
const fail = (code: Code): Fail => tripsFail(code, MSG[code]);

// ═══════════════ ชนิด VM ═══════════════
export type DepartureMoneyVM = Omit<MoneyTotals, "commissionCostSatang"> & {
  state: DepartureReportState;
  estimate: true;
  vatMode: "REGISTERED" | "NOT_REGISTERED" | "UNKNOWN";
  capacity: number;
  sold: number;
  loadFactorBp: number | null;
  charterLike: boolean;
  /** HOLD + PENDING (ยังไม่นับเงิน) */
  pendingBookings: number;
  /** null ⇔ ผู้ดูไม่มีสิทธิ์ต้นทุน */
  commissionCostSatang: number | null;
  costSatang: number | null;
  costRows: number | null;
  /** null เมื่อไม่เห็นต้นทุน หรือรอบยังไม่มีแถวต้นทุน (Q2 — ยังไม่หักต้นทุนรอบ ⇒ ไม่แสดงกำไร) */
  grossProfitSatang: number | null;
  marginBp: number | null;
  /** Q2 + Q16: ผู้เห็นต้นทุน = รอบยังไม่มีแถวต้นทุน (true/false) · ผู้ไม่เห็นต้นทุน = null (ไม่อ่านแถวต้นทุนเลย) */
  noCosts: boolean | null;
  warnings: { code: MoneyWarningCode; n?: number }[];
};
export type CostRowVM = { id: string; kind: string; amountSatang: number; note: string | null; updatedAtIso: string };
export type DepartureCostsVM = {
  unit: { id: string; slug: string; tz: string; today: string; nowIso: string };
  /** commissionWithVat (U3): มีการจองที่ VAT ของคอมฯ ถูกนับเป็นต้นทุนจริง (snapshot ไม่จด VAT) ⇒ ป้าย "รวม VAT ของคอมมิชชัน" */
  flags: { canEdit: boolean; commissionWithVat: boolean };
  departure: {
    id: string;
    productId: string;
    titleTh: string;
    titleEn: string | null;
    optionTh: string | null;
    optionEn: string | null;
    localDate: string;
    timeText: string;
    status: string;
    capacity: number;
    sold: number;
    state: DepartureReportState;
    estimate: true;
    sourceKind: string;
  };
  /** Q12/Q17: ไม่ส่ง byKind (จอไม่แสดง) */
  costs: { token: string; rows: CostRowVM[]; totalSatang: number; perSeatSatang: number | null };
  money: DepartureMoneyVM;
  channels: { channel: string; group: "DIRECT" | "AGENT" | "OTHER"; bookings: number; seats: number; salesSatang: number; revenueExVatSatang: number; commissionCostSatang: number; cancelledBookings: number }[];
  warnings: DepartureMoneyVM["warnings"];
};
export type SavedCosts = { applied: boolean; token: string; totalSatang: number; rows: CostRowVM[] };

// ═══════════════ ตัวช่วย ═══════════════
type CostDb = { id: string; kind: string; amountSatang: number; note: string | null; createdAt: Date; updatedAt: Date };
const COST_SELECT = { id: true, kind: true, amountSatang: true, note: true, createdAt: true, updatedAt: true } as const;
/** token ของชุดต้นทุน = sha256 hex 32 ตัวแรกของ [[id, kind, amount, note, updatedAt]] เรียงตาม id (ชุดว่าง = ค่าคงที่) */
function costTokenOf(rows: readonly CostDb[]): string {
  const sorted = [...rows].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)).map((r) => [r.id, r.kind, r.amountSatang, r.note, r.updatedAt.toISOString()]);
  return createHash("sha256").update(JSON.stringify(sorted)).digest("hex").slice(0, 32);
}
const rowVM = (r: CostDb): CostRowVM => ({ id: r.id, kind: r.kind, amountSatang: r.amountSatang, note: r.note, updatedAtIso: r.updatedAt.toISOString() });
const totalOf = (rows: readonly { amountSatang: number }[]): number => rows.reduce((s, r) => s + r.amountSatang, 0);
const sortCosts = (rows: CostDb[]): CostDb[] => rows.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
export async function tzOf(g: TripsUnitGate): Promise<string> {
  const u = await tenantDb({ tenantId: g.tenantId }).businessUnit.findFirst({ where: { id: g.unitId, tenantId: g.tenantId }, select: { settings: true } });
  return normalizeTimezone(isRec(u?.settings) ? u.settings.timezone : null);
}
export function timeTextOf(tz: string, startsAt: Date, endsAt: Date): string {
  const s = utcToLocal(tz, startsAt);
  const e = utcToLocal(tz, endsAt);
  const days = Math.trunc((Date.parse(`${e.ymd}T00:00:00.000Z`) - Date.parse(`${s.ymd}T00:00:00.000Z`)) / DAY_MS);
  return `${hhmm(s.minutes)}–${hhmm(e.minutes)}${days > 0 ? ` (+${days})` : ""}`;
}
const CHANNEL_ORDER: readonly string[] = [...CHANNEL_GROUPS.DIRECT, ...CHANNEL_GROUPS.AGENT, ...CHANNEL_GROUPS.OTHER];
const GROUP_RANK = { DIRECT: 0, AGENT: 1, OTHER: 2 } as const;
const sellRank = (c: string): number => {
  const i = (SELL_CHANNELS as readonly string[]).indexOf(c);
  return i >= 0 ? i : SELL_CHANNELS.length + CHANNEL_ORDER.length;
};

// ═══════════════ อ่านเงินของรอบ (ตัวคิดเดียว: สรุปเงิน · แผงรอบ · จอต้นทุน) ═══════════════
type DepRow = { id: string; productId: string; optionId: string | null; localDate: Date; startsAt: Date; endsAt: Date; status: string; capacity: number; sold: number };
/** แถวของตัวอ่านการจองร่วม (a1 + รายงาน a2 · §4.4) — เงินตาม BookingMoneyRow + รอบ (วันเดินทาง · สถานะ) + วันจอง */
export type BookingReadRow = BookingMoneyRow & { id: string; departureId: string; productId: string; localDate: Date; depStatus: string; createdAt: Date };
type BookingRow = BookingReadRow;
type Computed = { money: DepartureMoneyVM; perBooking: { b: BookingRow; m: BookingMoney; commissionVatCounted: boolean }[]; costs: CostDb[] };
const READ_STATUSES = [...REPORT_LIVE_STATUSES, ...REPORT_PENDING_STATUSES, "CANCELLED"];
const PENDING_SET: readonly string[] = REPORT_PENDING_STATUSES;

/**
 * ตัวอ่านการจองร่วม (D3 · §4.4): ตามรอบ { departureIds } หรือตามวันจอง { createdGte, createdLt } (+ สินค้า · ช่องทาง) · สถานะ LIVE + HOLD/PENDING + CANCELLED
 * เลือกเฉพาะ JSON path ของ snapshot ที่ตัวแปลงแถวใช้ (ไม่ดึงทั้งก้อน) · limit = เพดาน + 1 (ผู้เรียกตัดสินเกินเพดาน)
 */
export async function readMoneyBookings(
  g: TripsUnitGate,
  w: ({ departureIds: readonly string[] } | { createdGte: Date; createdLt: Date }) & { productId?: string | null; channel?: string | null; limit?: number },
): Promise<BookingReadRow[]> {
  const open = [...TRIP_REFUND_OPEN_STATUSES];
  const scope = "departureIds" in w ? Prisma.sql`b."departureId" = ANY(${[...w.departureIds]}::text[])` : Prisma.sql`b."createdAt" >= ${w.createdGte} AND b."createdAt" < ${w.createdLt}`;
  const product = w.productId ? Prisma.sql` AND b."productId" = ${w.productId}` : Prisma.empty;
  const channel = w.channel ? Prisma.sql` AND b."channel" = ${w.channel}` : Prisma.empty;
  const limit = w.limit === undefined ? Prisma.empty : Prisma.sql` LIMIT ${w.limit}`;
  return g.db.$queryRaw<BookingReadRow[]>`
      SELECT b."id", b."status", b."collectMode", b."agentAccountId", b."channel", b."currency",
        b."grossSatang", b."discountSatang", b."agentDiscountSatang", b."passThroughSatang", b."vatSatang", b."commissionSatang", b."commissionVatSatang",
        b."paidSatang", b."refundedSatang",
        b."policySnapshot"->'totals'->'payableSatang' AS "payableJson", b."policySnapshot"->'tax'->'vatRegistered' AS "vatRegJson",
        b."policySnapshot"->'tax'->'pricesIncludeVat' AS "inclVatJson",
        b."departureId", b."productId", b."createdAt", d."localDate", d."status" AS "depStatus",
        COALESCE((SELECT sum(i."qty") FROM "TripBookingItem" i LEFT JOIN "TripPaxType" pt ON pt."id" = i."paxTypeId"
          WHERE i."bookingId" = b."id" AND i."tenantId" = ${g.tenantId} AND i."active" AND (i."kind" = 'BERTH' OR (i."kind" = 'SEAT' AND COALESCE(pt."countsCapacity", true)))), 0)::int AS "seats",
        COALESCE(r."amount", 0)::float8 AS "retAmount", COALESCE(r."vat", 0)::float8 AS "retVat", COALESCE(r."pt", 0)::float8 AS "retPt", COALESCE(r."n", 0)::int AS "retN",
        EXISTS (SELECT 1 FROM "TripRefundRequest" q WHERE q."bookingId" = b."id" AND q."tenantId" = ${g.tenantId} AND q."status" = ANY(${open}::text[])) AS "openRefund"
      FROM "TripBooking" b
      JOIN "TripDeparture" d ON d."id" = b."departureId" AND d."tenantId" = ${g.tenantId} AND d."unitId" = ${g.unitId}
      LEFT JOIN LATERAL (
        SELECT sum(e."amountSatang") AS "amount", sum(e."vatSatang") AS "vat", sum(e."passThroughSatang") AS "pt", count(*) AS "n"
        FROM "TripMoneyEvent" e WHERE e."bookingId" = b."id" AND e."tenantId" = ${g.tenantId} AND e."kind" = 'RETAINED'
      ) r ON true
      WHERE b."tenantId" = ${g.tenantId} AND b."unitId" = ${g.unitId} AND ${scope}${product}${channel} AND b."status" = ANY(${READ_STATUSES}::text[])
      ORDER BY b."createdAt", b."id"${limit}`;
}
/** ตัวอ่านค่าตั้ง VAT ของหน่วยที่เดียว (J4) — ผู้เรียกอ่านครั้งเดียวต่อการโหลด · vatRegisteredOf = true/false/null */
export const unitVatSettingsOf = (g: TripsUnitGate, now: Date) => resolveSettings({ tenantId: g.tenantId }, [VAT_KEY], { unitId: g.unitId }, now);
export const vatRegisteredOf = (vatSet: Record<string, { value?: unknown } | undefined>): boolean | null => {
  const reg = vatSet[VAT_KEY]?.value;
  return isRec(reg) && typeof reg.registered === "boolean" ? reg.registered : null;
};
async function computeMoney(g: TripsUnitGate, dep: Pick<DepRow, "id" | "status" | "endsAt" | "capacity" | "sold">, sourceKind: string, costView: boolean, now: Date): Promise<Computed> {
  const [bookings, costRows, vatSet] = await Promise.all([
    readMoneyBookings(g, { departureIds: [dep.id] }),
    // Q16: ผู้ไม่เห็นต้นทุนไม่อ่านแถวต้นทุนเลย (การรู้ว่ามีต้นทุนแล้วก็เป็นข้อมูลต้นทุน)
    costView
      ? g.db.tripCost.findMany({ where: { tenantId: g.tenantId, unitId: g.unitId, departureId: dep.id }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], take: TRIP_COST_ROWS_MAX, select: COST_SELECT })
      : Promise.resolve([] as CostDb[]),
    unitVatSettingsOf(g, now),
  ]);
  const reg = vatSet[VAT_KEY]?.value;
  const registered = isRec(reg) ? reg.registered : null;
  return moneyOfDeparture(dep, sourceKind, costView, now, bookings, costRows, typeof registered === "boolean" ? registered : null);
}
/** ตัวคิดเงินของรอบ (ไม่มี I/O) — ตัวเดียวของ สรุปเงิน · แผงรอบ · จอต้นทุน · รายงานตามช่วง (a2) */
export function moneyOfDeparture(dep: Pick<DepRow, "id" | "status" | "endsAt" | "capacity" | "sold">, sourceKind: string, costView: boolean, now: Date, bookings: readonly BookingRow[], costRows: readonly CostDb[], registered: boolean | null): Computed {
  const vatMode: DepartureMoneyVM["vatMode"] = registered === true ? "REGISTERED" : registered === false ? "NOT_REGISTERED" : "UNKNOWN";
  const depCancelled = dep.status === "CANCELLED";

  let fallback = 0;
  let fx = 0;
  let ota = 0;
  let pendingBookings = 0;
  const perBooking: Computed["perBooking"] = [];
  for (const b of bookings) {
    if (PENDING_SET.includes(b.status)) pendingBookings += 1;
    // ตัวแปลงแถวตัวเดียว (report-core · D4): payable Q7/Q8 · สถานะ VAT Q10 · รอคืนเงิน Q12
    const { input, hasPayable, vatRegistered: bookingVatReg } = bookingMoneyInOfRow(b, { unitVatRegistered: registered, departureCancelled: depCancelled });
    const m = bookingMoneyOf(input);
    perBooking.push({ b, m, commissionVatCounted: m.counted === "LIVE" && !bookingVatReg && b.commissionVatSatang > 0 });
    if (m.counted === "EXCLUDED") continue;
    if (!hasPayable && m.counted === "LIVE") fallback += 1; // Q9
    if (b.currency !== "THB") fx += 1;
    if (b.channel === "OTA") ota += 1;
  }
  const t = sumMoney(perBooking.map((x) => x.m));
  const liveSeats = perBooking.filter((x) => x.m.counted === "LIVE").reduce((s, x) => s + x.m.seats, 0);
  const costs = sortCosts([...costRows]);
  const costSatang = totalOf(costs);
  const noCosts = costs.length === 0;
  const prof = profitOf({ revenueExVatSatang: t.revenueExVatSatang, commissionCostSatang: t.commissionCostSatang, costSatang });

  const has: Partial<Record<MoneyWarningCode, number | null>> = {};
  if (costView && t.passThroughSatang > 0 && costs.some((c) => c.kind === "PARK_FEE")) has.PARK_FEE_WITH_PASS_THROUGH = null;
  if (sourceKind === "SUPPLIER") has.SUPPLIER_COSTS_NOT_INCLUDED = null;
  if (fallback > 0) has.SNAPSHOT_FALLBACK = fallback;
  if (fx > 0) has.FX_BOOKINGS = fx;
  if (vatMode === "UNKNOWN") has.VAT_STATUS_UNKNOWN = null;
  if (ota > 0) has.OTA_FEES_NOT_INCLUDED = ota;
  const warnings = MONEY_WARNING_CODES.filter((c) => c in has).map((code) => {
    const n = has[code];
    return typeof n === "number" ? { code, n } : { code };
  });

  const money: DepartureMoneyVM = {
    ...t,
    state: departureReportStateOf({ status: dep.status, endsAt: dep.endsAt }, now),
    estimate: true,
    vatMode,
    capacity: dep.capacity,
    sold: dep.sold,
    loadFactorBp: depCancelled ? null : loadFactorBp(dep.sold, dep.capacity),
    charterLike: charterLikeOf({ capacity: dep.capacity, liveBookings: t.bookings, liveSeats }),
    pendingBookings,
    commissionCostSatang: costView ? t.commissionCostSatang : null,
    costSatang: costView ? costSatang : null,
    costRows: costView ? costs.length : null,
    grossProfitSatang: costView && !noCosts ? prof.grossProfitSatang : null,
    marginBp: costView && !noCosts ? prof.marginBp : null,
    noCosts: costView ? noCosts : null,
    warnings,
  };
  return { money, perBooking, costs: costView ? costs : [] };
}

const DEP_SELECT = { id: true, productId: true, optionId: true, localDate: true, startsAt: true, endsAt: true, status: true, capacity: true, sold: true } as const;
async function departureOf(g: TripsUnitGate, departureId: string): Promise<{ dep: DepRow; product: { title: unknown; sourceKind: string } } | null> {
  const dep = await g.db.tripDeparture.findFirst({ where: { tenantId: g.tenantId, unitId: g.unitId, id: departureId }, select: DEP_SELECT });
  if (!dep) return null;
  const product = await g.db.tripProduct.findFirst({ where: { tenantId: g.tenantId, unitId: g.unitId, id: dep.productId }, select: { title: true, sourceKind: true } });
  return product ? { dep, product } : null;
}
/** ด่านของสรุปเงิน (ใบสั่ง §4.1): ดูรอบ ∧ (ดูการจอง ∨ ดูรายงาน ∨ เห็นต้นทุน) */
const canSeeMoney = (g: TripsUnitGate, costView: boolean): boolean => g.can("trips.departure.view") && (g.can("trips.booking.view") || g.can("trips.report.view") || costView);

/**
 * เงินของรอบสำหรับแผงรอบ (T1.2 · ใบสั่ง §4.3) — ตัวคิดเดียวกับ departureMoneySummary · ไม่ผ่านด่าน ⇒ money null
 * Q12: ใช้รอบ/สินค้าที่แผงโหลดไว้แล้ว (ไม่อ่านซ้ำ) · Q7: ตัวคิดล้ม ⇒ money null + failed (แผงยังเปิดได้)
 * costs = ผู้ดูไปจอต้นทุนได้ (ดูรอบ ∧ เห็นต้นทุน)
 */
export async function departureMoneyForPanel(
  g: TripsUnitGate,
  dep: { id: string; status: string; endsAt: Date; capacity: number; sold: number },
  sourceKind: string,
  now: Date,
): Promise<{ money: DepartureMoneyVM | null; costs: boolean; failed: boolean }> {
  const access = costAccessOf(g.member, g.unitId);
  const costs = g.can("trips.departure.view") && access.view;
  if (!canSeeMoney(g, access.view)) return { money: null, costs, failed: false };
  try {
    return { money: (await computeMoney(g, dep, sourceKind, access.view, now)).money, costs, failed: false };
  } catch (err) {
    // U2: ไม่กลืนเงียบ — log ชนิด/ข้อความของความผิดพลาด (ไม่มีตัวเลขเงินของรอบ) · แผงยังเปิดได้
    console.error("[trips.costs] departure money summary failed", { departureId: dep.id, error: err instanceof Error ? err.message : String(err) });
    return { money: null, costs, failed: true };
  }
}

// ═══════════════ 4.1 สรุปเงินของรอบ ═══════════════
const REF_IN = z.strictObject({ unitId: ID, departureId: ID });
export async function departureMoneySummary(ctx: TripsScreenCtx, input: unknown, opts?: Opts): Promise<{ ok: true; value: DepartureMoneyVM } | Fail> {
  const p = REF_IN.safeParse(input);
  if (!p.success) return fail("INVALID_INPUT");
  const g = await tripsUnitGate(ctx, { unitId: p.data.unitId });
  if (isFail(g)) return g;
  const access = costAccessOf(g.member, g.unitId);
  if (!canSeeMoney(g, access.view)) return fail("FORBIDDEN");
  const d = await departureOf(g, p.data.departureId);
  if (!d) return fail("NOT_FOUND");
  const c = await computeMoney(g, d.dep, d.product.sourceKind, access.view, nowOf(opts));
  return { ok: true, value: c.money };
}

// ═══════════════ 4.2 จอต้นทุนและกำไร ═══════════════
export async function loadDepartureCostsVM(ctx: TripsScreenCtx, input: unknown, opts?: Opts): Promise<{ ok: true; vm: DepartureCostsVM } | Fail> {
  const p = REF_IN.safeParse(input);
  if (!p.success) return fail("INVALID_INPUT");
  const g = await tripsUnitGate(ctx, { unitId: p.data.unitId });
  if (isFail(g)) return g;
  const access = costAccessOf(g.member, g.unitId);
  if (!g.can("trips.departure.view") || !access.view) return fail("FORBIDDEN");
  const d = await departureOf(g, p.data.departureId);
  if (!d) return fail("NOT_FOUND");
  const now = nowOf(opts);
  const [c, tz, opt] = await Promise.all([
    computeMoney(g, d.dep, d.product.sourceKind, true, now),
    tzOf(g),
    d.dep.optionId ? g.db.tripOption.findFirst({ where: { tenantId: g.tenantId, unitId: g.unitId, id: d.dep.optionId }, select: { name: true } }) : Promise.resolve(null),
  ]);
  const totalSatang = totalOf(c.costs);

  // ── ช่องทาง: ที่มี LIVE/CANCELLED · DIRECT → AGENT → OTHER แล้วลำดับ SELL_CHANNELS ──
  const byChannel = new Map<string, BookingMoney[]>();
  for (const x of c.perBooking) if (x.m.counted === "LIVE" || x.m.counted === "CANCELLED") byChannel.set(x.b.channel, [...(byChannel.get(x.b.channel) ?? []), x.m]);
  const channels: DepartureCostsVM["channels"] = [...byChannel.entries()]
    .map(([channel, ms]) => {
      const s = sumMoney(ms);
      return { channel, group: channelGroupOf(channel), bookings: s.bookings, seats: s.seats, salesSatang: s.salesSatang, revenueExVatSatang: s.revenueExVatSatang, commissionCostSatang: s.commissionCostSatang, cancelledBookings: s.cancelledBookings };
    })
    .sort((a, b) => GROUP_RANK[a.group] - GROUP_RANK[b.group] || sellRank(a.channel) - sellRank(b.channel) || a.channel.localeCompare(b.channel));

  return {
    ok: true,
    vm: {
      unit: { id: g.unitId, slug: g.unitSlug, tz, today: utcToLocal(tz, now).ymd, nowIso: now.toISOString() },
      flags: { canEdit: access.edit, commissionWithVat: c.perBooking.some((x) => x.commissionVatCounted) },
      departure: {
        id: d.dep.id,
        productId: d.dep.productId,
        titleTh: i18nTh(d.product.title),
        titleEn: i18nEn(d.product.title),
        optionTh: opt ? i18nTh(opt.name) || null : null,
        optionEn: opt ? i18nEn(opt.name) : null,
        localDate: d.dep.localDate.toISOString().slice(0, 10),
        timeText: timeTextOf(tz, d.dep.startsAt, d.dep.endsAt),
        status: d.dep.status,
        capacity: d.dep.capacity,
        sold: d.dep.sold,
        state: c.money.state,
        estimate: true,
        sourceKind: d.product.sourceKind,
      },
      costs: {
        token: costTokenOf(c.costs),
        rows: c.costs.map(rowVM),
        totalSatang,
        perSeatSatang: d.dep.sold > 0 ? mulDivHalfUp(totalSatang, 1, d.dep.sold) : null, // Q12: หาร/ปัดผ่าน money-math
      },
      money: c.money,
      channels,
      warnings: c.money.warnings,
    },
  };
}

// ═══════════════ 6. บันทึกต้นทุนทั้งชุด ═══════════════
const SAVE_IN = z.strictObject({ unitId: ID, departureId: ID, expectedToken: z.string().min(1).max(128), rows: z.unknown() });
class Abort extends Error {
  constructor(readonly fail: Fail) {
    super(fail.code);
  }
}
function pgCode(e: unknown): string {
  if (e instanceof Prisma.PrismaClientKnownRequestError) {
    const meta = JSON.stringify(e.meta ?? {});
    if (/40P01/.test(meta)) return "40P01";
    if (/40001/.test(meta)) return "40001";
    return e.code;
  }
  return e instanceof Error && /deadlock|40P01/i.test(e.message) ? "40P01" : "";
}
/** Q1 + Q17: audit ไม่เก็บยอดเงิน — จำนวนแถว + ชนิดที่ไม่ซ้ำ (ลำดับทะเบียน) เท่านั้น */
type Summary = { count: number; kinds: string[] };
const summaryOf = (rows: readonly { kind: string }[]): Summary => ({ count: rows.length, kinds: TRIP_COST_KINDS.filter((k) => rows.some((r) => r.kind === k)) });

/**
 * บันทึกต้นทุนของรอบทั้งชุด (ใบสั่ง §6) — tx เดียวใต้ advisory lock ต่อรอบ · CAS ด้วย token · ส่งซ้ำเนื้อหาเดิม ⇒ applied false
 * ลบจริง (C4 · ประวัติอยู่ใน audit) · audit 1 แถวต่อการเปลี่ยน (ไม่มีหมายเหตุ) · แก้ได้ทุกสถานะรอบ (OQ46) · ไม่แตะ TripDeparture
 */
export async function saveDepartureCosts(ctx: TripsScreenCtx, input: unknown, opts?: Opts): Promise<{ ok: true; value: SavedCosts } | Fail> {
  const p = SAVE_IN.safeParse(input);
  if (!p.success) return fail("INVALID_INPUT");
  const g = await tripsUnitGate(ctx, { unitId: p.data.unitId });
  if (isFail(g)) return g;
  if (!g.can("trips.departure.view") || !costAccessOf(g.member, g.unitId).edit) return fail("FORBIDDEN");
  const parsed = parseCostRows(p.data.rows);
  if (!parsed.ok) return { ...fail(parsed.code), ...(parsed.row === undefined ? {} : { row: parsed.row }), ...(parsed.field === undefined ? {} : { field: parsed.field }) };
  const want: CostRowIn[] = parsed.rows;
  const departureId = p.data.departureId;
  const expected = p.data.expectedToken;
  const now = nowOf(opts);
  const where = { tenantId: g.tenantId, unitId: g.unitId, departureId };

  const once = async (): Promise<{ ok: true; value: SavedCosts } | Fail | "RETRY"> => {
    try {
      const value = await g.db.$transaction(async (t) => {
        const tx = t as unknown as Tx;
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('trips.cost'), hashtext(${departureId}))`;
        const dep = await tx.tripDeparture.findFirst({ where: { tenantId: g.tenantId, unitId: g.unitId, id: departureId }, select: { id: true } });
        if (!dep) throw new Abort(fail("NOT_FOUND"));
        const cur = sortCosts(await tx.tripCost.findMany({ where, select: COST_SELECT }));
        const token = costTokenOf(cur);
        const curIds = new Set(cur.map((r) => r.id));
        const current: SavedCosts = { applied: false, token, totalSatang: totalOf(cur), rows: cur.map(rowVM) };
        if (token !== expected) {
          // C5: ส่งซ้ำ (เนื้อหาเท่ากัน + id ที่อ้างยังอยู่) ⇒ ไม่ทำอะไร · ไม่งั้นชนกัน
          if (costContentKey(cur) === costContentKey(want) && want.every((r) => r.id === null || curIds.has(r.id))) return current;
          throw new Abort(fail("STATE_CONFLICT"));
        }
        if (want.some((r) => r.id !== null && !curIds.has(r.id))) throw new Abort(fail("NOT_FOUND"));
        const keep = new Map(want.filter((r) => r.id !== null).map((r) => [r.id as string, r]));
        const drop = cur.filter((r) => !keep.has(r.id)).map((r) => r.id);
        const change = cur.filter((r) => {
          const w = keep.get(r.id);
          return w !== undefined && (w.kind !== r.kind || w.amountSatang !== r.amountSatang || w.note !== r.note);
        });
        const add = want.filter((r) => r.id === null);
        if (!drop.length && !change.length && !add.length) return current;
        if (drop.length) await tx.tripCost.deleteMany({ where: { ...where, id: { in: drop } } });
        await Promise.all(
          change.map((r) => {
            const w = keep.get(r.id) as CostRowIn;
            return tx.tripCost.updateMany({ where: { ...where, id: r.id }, data: { kind: w.kind, amountSatang: w.amountSatang, note: w.note, updatedAt: now } });
          }),
        );
        // createdAt ไล่ทีละ 1 ms ตามลำดับที่ส่ง (จอเรียงตาม createdAt)
        if (add.length) await tx.tripCost.createMany({ data: add.map((r, i) => ({ ...where, kind: r.kind, amountSatang: r.amountSatang, note: r.note, createdAt: new Date(now.getTime() + i), updatedAt: now })) });
        const after = sortCosts(await tx.tripCost.findMany({ where, select: COST_SELECT }));
        await tx.auditLog.create({
          data: {
            tenantId: g.tenantId,
            unitId: g.unitId,
            actorType: "USER",
            actorId: g.actorUserId,
            action: A_SAVED,
            targetType: "TripDeparture",
            targetId: departureId,
            before: summaryOf(cur),
            after: summaryOf(after),
          },
        });
        return { applied: true, token: costTokenOf(after), totalSatang: totalOf(after), rows: after.map(rowVM) };
      }, TX_OPTS);
      return { ok: true, value };
    } catch (e) {
      if (e instanceof Abort) return e.fail;
      const code = pgCode(e);
      if (code === "40P01" || code === "40001" || code === "P2034") return "RETRY";
      if (code === "P2028") return fail("BUSY");
      throw e;
    }
  };
  // deadlock/serialization ⇒ ลองใหม่ 1 ครั้ง · ยังไม่ได้ ⇒ BUSY
  const first = await once();
  if (first !== "RETRY") return first;
  const second = await once();
  return second === "RETRY" ? fail("BUSY") : second;
}
// ── /T1.7a1 costs ──
