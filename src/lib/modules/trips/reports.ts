// ─────────────────────────────────────────────────────────────
// trips/reports.ts — รายงานทัวร์ตามช่วงเวลา (4 แท็บ · ตารางรอบแบ่งหน้า · CSV) · RUN TRIPS T1.7a2 §6
// ทุกตัว (ctx: { tenantId, actorUserId }, input, opts?: { now?, caps? }) ⇒ { ok: true, vm|value } | { ok: false, code, message, field? } ไม่ throw (ยกเว้นฐานล่ม)
// 🔴 ตัวเลขบริหาร ไม่ใช่รายงานบัญชี · ประมาณการทุกรอบ · ไม่ลงบัญชี · ไม่แตะ POS · เขียนได้เฉพาะ AuditLog (+ ถังเพดานความถี่ผ่านตัวช่วยกลาง)
// 🔴 สูตรเดียวกับ a1: การจองอ่านผ่านตัวอ่านร่วม readMoneyBookings · เงินต่อรอบคิดด้วย moneyOfDeparture (costs.ts) — ไฟล์นี้ไม่มีตรรกะเงินต่อการจองของตัวเอง
// 🔴 สิทธิ์ต้นทุนแคบ (costAccessOf) — ผู้ไม่เห็นต้นทุนไม่อ่านแถวต้นทุน และได้ช่องต้นทุน/คอมฯ/กำไร/สัญญาณ "มีต้นทุนแล้ว" เป็น null (Q16)
// 🔴 ต่อการโหลด: ด่าน · เขตเวลา · ค่าตั้ง VAT ครั้งเดียว · สินค้า · รอบ (1) · การจอง (1) · ต้นทุน (1) — ไม่มี await ในลูป · ขอบวันจองเป็น UTC จากโค้ด (N10)
// 🔴 เกินเพดานรอบ/การจอง ⇒ REPORT_TOO_LARGE (ไม่ตัดเงียบ) · opts.caps ใช้ได้เฉพาะข้อสอบ (action/หน้าไม่ส่ง · D3)
// ─────────────────────────────────────────────────────────────
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { checkRateLimitDb } from "@/lib/core/rate-limit-db";
import { SELL_CHANNELS } from "@/lib/core/sellable";
import { resolveSettings } from "@/lib/core/settings";
import enMessages from "@/messages/en/trips.json";
import thMessages from "@/messages/th/trips.json";
import { moneyOfDeparture, readMoneyBookings, timeTextOf, tzOf, type BookingReadRow, type DepartureMoneyVM } from "./costs";
import { utcToLocal } from "./departures-core";
import { mulDivHalfUp } from "./money-math";
import { tripsFail, tripsUnitGate, type TripsFail, type TripsScreenCtx, type TripsUnitGate } from "./pickup";
import {
  CHANNEL_GROUPS,
  LEAD_BUCKETS,
  MONEY_WARNING_CODES,
  REPORT_BASES,
  REPORT_BOOKING_CAP,
  REPORT_CSV_COLUMNS,
  REPORT_CSV_COST_COLUMNS,
  REPORT_DAY_GROUP_MAX_DAYS,
  REPORT_DEPARTURE_CAP,
  REPORT_EXPORT_RATE,
  REPORT_GROUPS,
  REPORT_PAGE_MAX,
  REPORT_PAGE_SIZE,
  REPORT_PRODUCTS_MAX,
  REPORT_TABS,
  TRIPS_REPORT_CSV_CAP,
  TRIP_COST_ROWS_MAX,
  channelGroupOf,
  costAccessOf,
  leadBucketOf,
  leadDaysOf,
  loadFactorBp,
  medianOf,
  periodKeyOf,
  periodsOf,
  profitOf,
  reportCsv,
  reportFileName,
  reportGroupOf,
  reportPresetsOf,
  reportRangeOf,
  reportUtcBoundsOf,
  sumMoney,
  type BookingMoney,
  type ChannelGroup,
  type LeadBucketKey,
  type MoneyTotals,
  type MoneyWarningCode,
  type ReportBasis,
  type ReportCell,
  type ReportGroup,
  type ReportTab,
} from "./report-core";

// ── T1.7a2 reports ──
type Opts = { now?: Date; caps?: { departures?: number; bookings?: number } };
type Field = "range" | "basis" | "product" | "channel" | "tab" | "group" | "page";
type Fail = TripsFail & { field?: Field; minutes?: number };
const isRec = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isFail = (x: unknown): x is TripsFail => isRec(x) && x.ok === false;
const CTL_RE = /[\u0000-\u001f\u007f]/;
const ID = z.string().min(1).max(128).refine((s) => !CTL_RE.test(s));
const nowOf = (opts?: Opts) => (opts?.now instanceof Date && !Number.isNaN(opts.now.getTime()) ? opts.now : new Date());
const capOf = (v: unknown, dflt: number): number => (typeof v === "number" && Number.isSafeInteger(v) && v > 0 ? v : dflt);
const i18nTh = (v: unknown): string => (isRec(v) && typeof v.th === "string" ? v.th : "");
const i18nEn = (v: unknown): string | null => (isRec(v) && typeof v.en === "string" && v.en.trim() ? v.en : null);
const ymd = (d: Date): string => d.toISOString().slice(0, 10);
function pushTo<K, V>(m: Map<K, V[]>, k: K, v: V): void {
  const xs = m.get(k);
  if (xs) xs.push(v);
  else m.set(k, [v]);
}
const VAT_KEY = "trips.tax.vatRegistered";
const A_EXPORTED = "trips.report.exported";
const NEEDS = ["trips.departure.view", "trips.report.view"] as const;
/** 12 ช่องทางตามกลุ่ม (ตัวเลือกของตัวกรอง) */
const CHANNELS: readonly string[] = [...CHANNEL_GROUPS.DIRECT, ...CHANNEL_GROUPS.AGENT, ...CHANNEL_GROUPS.OTHER];
const GROUP_KEYS = ["DIRECT", "AGENT", "OTHER"] as const;
const sellRank = (c: string): number => {
  const i = (SELL_CHANNELS as readonly string[]).indexOf(c);
  return i >= 0 ? i : SELL_CHANNELS.length;
};
/** ข้อความไทยของรหัสใหม่ (ไม่มีตัวเลขเงิน · ไม่สะท้อนอินพุต) */
const MSG: Record<string, string> = {
  RANGE_TOO_LARGE: "เลือกช่วงได้ไม่เกิน 366 วัน",
  REPORT_TOO_LARGE: "ช่วงนี้มีรอบหรือการจองมากเกินไป — เลือกช่วงสั้นลงหรือเลือกสินค้า",
  BUSY: "ระบบกำลังยุ่ง — ลองส่งออกอีกครั้ง",
};
const fail = (code: string, field?: Field): Fail => ({ ...tripsFail(code, MSG[code]), ...(field ? { field } : {}) });
type Dict = Record<string, string>;
const TEXT = { th: thMessages, en: enMessages } as const;

// ═══════════════ ชนิด VM (§6.1) ═══════════════
type CostWait = { ended: number; upcoming: number };
export type ReportTotals = Omit<MoneyTotals, "commissionCostSatang"> & {
  estimate: true;
  pendingBookings: number;
  departures: number | null;
  cancelledDepartures: number | null;
  capacity: number | null;
  sold: number | null;
  loadFactorBp: number | null;
  charterLikeDepartures: number | null;
  commissionCostSatang: number | null;
  costSatang: number | null;
  costRows: number | null;
  grossProfitSatang: number | null;
  marginBp: number | null;
  /** D1: รอบไม่ยกเลิกที่ยังไม่มีแถวต้นทุน แยกเดินทางแล้ว/ยังไม่เดินทาง · ผู้ไม่เห็นต้นทุน ⇒ null (Q16) */
  departuresWithoutCosts: CostWait | null;
};
export type ReportPeriodVM = {
  key: string;
  from: string;
  to: string;
  departures: number | null;
  bookings: number;
  seats: number;
  salesSatang: number;
  vatSatang: number;
  revenueExVatSatang: number;
  commissionCostSatang: number | null;
  costSatang: number | null;
  costRows: number | null;
  grossProfitSatang: number | null;
  departuresWithoutCosts: CostWait | null;
};
export type ReportLoadVM = { rows: { productId: string; titleTh: string; titleEn: string | null; departures: number; capacity: number; sold: number; loadFactorBp: number | null; charterLikeDepartures: number }[] };
export type ReportLeadVM = { buckets: { key: LeadBucketKey; bookings: number; seats: number; salesSatang: number }[]; medianDays: number | null; counted: number; excludedImport: number; excludedNegative: number };
type ChannelSum = { bookings: number; cancelledBookings: number; seats: number; salesSatang: number; commissionCostSatang: number | null; shareBp: number | null };
export type ReportChannelsVM = { groups: ({ group: ChannelGroup; channels: ({ channel: string } & ChannelSum)[] } & ChannelSum)[] };
export type ReportDepartureRowVM = {
  departureId: string;
  productId: string;
  titleTh: string;
  titleEn: string | null;
  optionTh: string | null;
  optionEn: string | null;
  localDate: string;
  timeText: string;
  status: string;
} & Pick<
  DepartureMoneyVM,
  | "state"
  | "estimate"
  | "capacity"
  | "sold"
  | "loadFactorBp"
  | "charterLike"
  | "bookings"
  | "cancelledBookings"
  | "pendingRefundBookings"
  | "salesSatang"
  | "passThroughSatang"
  | "vatSatang"
  | "revenueExVatSatang"
  | "collectedSatang"
  | "outstandingSatang"
  | "heldSatang"
  | "agentCollectBookings"
  | "commissionCostSatang"
  | "costSatang"
  | "costRows"
  | "grossProfitSatang"
  | "marginBp"
  | "noCosts"
>;
export type TripReportVM = {
  unit: { id: string; slug: string; tz: string; today: string; nowIso: string };
  filter: { from: string; to: string; days: number; basis: ReportBasis; productId: string | null; channel: string | null; tab: ReportTab; group: ReportGroup; page: number };
  presets: { key: string; from: string; to: string }[];
  /** commissionWithVat (U3): VAT ของคอมฯ ถูกนับเป็นต้นทุนจริง · ผู้ไม่เห็นต้นทุน ⇒ null */
  flags: { costView: boolean; exportAvailable: boolean; commissionWithVat: boolean | null };
  notes: { basis: boolean; channel: boolean };
  products: { id: string; titleTh: string; titleEn: string | null }[];
  productsTotal: number;
  productsTruncated: boolean;
  channelOptions: readonly string[];
  totals: ReportTotals;
  periods: ReportPeriodVM[] | null;
  load: ReportLoadVM | null;
  lead: ReportLeadVM | null;
  channelsTab: ReportChannelsVM | null;
  departures: { rows: ReportDepartureRowVM[]; page: number; pageCount: number; total: number; pageSize: number } | null;
  warnings: { code: MoneyWarningCode; n?: number }[];
};
export type ReportCsvOut = { filename: string; csv: string; rows: number; total: number; truncated: boolean; withCost: boolean };

// ═══════════════ อินพุต ═══════════════
const LOAD_IN = z.strictObject({
  unitId: ID,
  from: z.unknown().optional(),
  to: z.unknown().optional(),
  basis: z.unknown().optional(),
  productId: z.unknown().optional(),
  channel: z.unknown().optional(),
  tab: z.unknown().optional(),
  group: z.unknown().optional(),
  page: z.unknown().optional(),
});
const EXPORT_IN = z.strictObject({ unitId: ID, from: z.unknown().optional(), to: z.unknown().optional(), productId: z.unknown().optional(), locale: z.enum(["th", "en"]).optional() });
type Filters = { from: string | null; to: string | null; basis: ReportBasis; productId: string | null; channel: string | null; tab: ReportTab; group: ReportGroup | null; page: number };
const opt = (v: unknown) => v === undefined || v === null || v === "";
const inSet = <T extends string>(set: readonly T[], v: unknown): v is T => typeof v === "string" && (set as readonly string[]).includes(v);
/** ตัวกรองที่ตรวจได้โดยไม่อ่านฐาน — ผิด ⇒ ผลผิดพร้อม field (หน้าใช้ทิ้งช่องนั้น · §5.7) */
function filtersOf(d: Record<string, unknown>): Filters | Fail {
  if ((!opt(d.from) && typeof d.from !== "string") || (!opt(d.to) && typeof d.to !== "string")) return fail("INVALID_INPUT", "range");
  if (!opt(d.basis) && !inSet(REPORT_BASES, d.basis)) return fail("INVALID_INPUT", "basis");
  if (!opt(d.productId) && !ID.safeParse(d.productId).success) return fail("INVALID_INPUT", "product");
  if (!opt(d.channel) && !inSet(CHANNELS, d.channel)) return fail("INVALID_INPUT", "channel");
  if (!opt(d.tab) && !inSet(REPORT_TABS, d.tab)) return fail("INVALID_INPUT", "tab");
  if (!opt(d.group) && !inSet(REPORT_GROUPS, d.group)) return fail("INVALID_INPUT", "group");
  if (d.page !== undefined && d.page !== null && !(typeof d.page === "number" && Number.isInteger(d.page) && d.page >= 1 && d.page <= REPORT_PAGE_MAX)) return fail("INVALID_INPUT", "page");
  return {
    from: opt(d.from) ? null : String(d.from),
    to: opt(d.to) ? null : String(d.to),
    basis: inSet(REPORT_BASES, d.basis) ? d.basis : "travel",
    productId: opt(d.productId) ? null : String(d.productId),
    channel: opt(d.channel) ? null : String(d.channel),
    tab: inSet(REPORT_TABS, d.tab) ? d.tab : "sales",
    group: inSet(REPORT_GROUPS, d.group) ? d.group : null,
    page: typeof d.page === "number" ? d.page : 1,
  };
}

// ═══════════════ อ่าน + คิด (ตัวเดียวของจอและไฟล์) ═══════════════
type DepDb = { id: string; productId: string; optionId: string | null; localDate: Date; startsAt: Date; endsAt: Date; status: string; capacity: number; sold: number; optionName: unknown };
type CostRead = { id: string; departureId: string; kind: string; amountSatang: number; note: string | null; createdAt: Date; updatedAt: Date };
type ProductInfo = { id: string; titleTh: string; titleEn: string | null; sourceKind: string };
type DepCalc = { dep: DepDb; product: ProductInfo | null; money: DepartureMoneyVM; perBooking: { b: BookingReadRow; m: BookingMoney; commissionVatCounted: boolean }[] };
type Built = {
  tz: string;
  today: string;
  now: Date;
  range: { from: string; to: string; days: number };
  f: Filters;
  group: ReportGroup;
  costView: boolean;
  products: ProductInfo[];
  /** ฐานวันเดินทาง: ทุกรอบในช่วง (รวมยกเลิก) · ฐานวันจอง: กลุ่มการจองตามรอบ */
  calcs: DepCalc[];
  /** true ⇔ ฐานวันเดินทางและไม่กรองช่องทาง (มีความจุ/ต้นทุน/ตารางรอบ) */
  full: boolean;
};
type Enter = { g: TripsUnitGate; costView: boolean };

async function enter(ctx: TripsScreenCtx, unitId: string): Promise<Enter | Fail> {
  const g = await tripsUnitGate(ctx, { unitId });
  if (isFail(g)) return g;
  if (!NEEDS.every((k) => g.can(k))) return fail("FORBIDDEN");
  return { g, costView: costAccessOf(g.member, g.unitId).view };
}
/** เขตเวลา · ค่าตั้ง VAT (ครั้งเดียวต่อการโหลด) · สินค้าของหน่วย — อ่านพร้อมกัน */
async function basicsOf(g: TripsUnitGate, now: Date): Promise<{ tz: string; registered: boolean | null; products: ProductInfo[] }> {
  const [tz, vatSet, rows] = await Promise.all([
    tzOf(g),
    resolveSettings({ tenantId: g.tenantId }, [VAT_KEY], { unitId: g.unitId }, now),
    g.db.tripProduct.findMany({ where: { tenantId: g.tenantId, unitId: g.unitId }, select: { id: true, title: true, sourceKind: true } }),
  ]);
  const reg = vatSet[VAT_KEY]?.value;
  const registered = isRec(reg) && typeof reg.registered === "boolean" ? reg.registered : null;
  const products = rows
    .map((p) => ({ id: p.id, titleTh: i18nTh(p.title), titleEn: i18nEn(p.title), sourceKind: p.sourceKind }))
    .sort((a, b) => a.titleTh.localeCompare(b.titleTh, "th") || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return { tz, registered, products };
}

async function build(e: Enter, f: Filters, opts: Opts | undefined): Promise<Built | Fail> {
  const { g, costView } = e;
  const now = nowOf(opts);
  const capDep = capOf(opts?.caps?.departures, REPORT_DEPARTURE_CAP);
  const capBk = capOf(opts?.caps?.bookings, REPORT_BOOKING_CAP);
  const { tz, registered, products } = await basicsOf(g, now);
  const today = utcToLocal(tz, now).ymd;
  const r = reportRangeOf({ from: f.from, to: f.to }, today);
  if (!r.ok) return fail(r.code, "range");
  if (f.group === "day" && r.days > REPORT_DAY_GROUP_MAX_DAYS) return fail("INVALID_INPUT", "group");
  const byId = new Map(products.map((p) => [p.id, p]));
  if (f.productId !== null && !byId.has(f.productId)) return fail("NOT_FOUND", "product");
  const full = f.basis === "travel" && f.channel === null;
  const base = { tz, today, now, range: { from: r.from, to: r.to, days: r.days }, f, group: f.group ?? reportGroupOf(r.days), costView, products, full };

  if (f.basis === "booked") {
    const { gte, lt } = reportUtcBoundsOf(r.from, r.to, tz);
    const rows = await readMoneyBookings(g, { createdGte: gte, createdLt: lt, productId: f.productId, channel: f.channel, limit: capBk + 1 });
    if (rows.length > capBk) return fail("REPORT_TOO_LARGE");
    const groups = new Map<string, BookingReadRow[]>();
    for (const b of rows) pushTo(groups, b.departureId, b);
    const calcs: DepCalc[] = [...groups.values()].map((bs) => {
      const b0 = bs[0] as BookingReadRow;
      // ฐานวันจอง: ต้องการเฉพาะสถานะรอบ (Q12) + วันเดินทาง — ความจุ/ต้นทุนเป็น null ในยอดรวม
      const dep: DepDb = { id: b0.departureId, productId: b0.productId, optionId: null, localDate: b0.localDate, startsAt: now, endsAt: now, status: b0.depStatus, capacity: 0, sold: 0, optionName: null };
      const product = byId.get(b0.productId) ?? null;
      const c = moneyOfDeparture(dep, product?.sourceKind ?? "", costView, now, bs, [], registered);
      return { dep, product, money: c.money, perBooking: c.perBooking };
    });
    return { ...base, calcs };
  }

  const prod = f.productId === null ? Prisma.empty : Prisma.sql` AND d."productId" = ${f.productId}`;
  const deps = await g.db.$queryRaw<DepDb[]>`
    SELECT d."id", d."productId", d."optionId", d."localDate", d."startsAt", d."endsAt", d."status", d."capacity", d."sold", o."name" AS "optionName"
    FROM "TripDeparture" d LEFT JOIN "TripOption" o ON o."id" = d."optionId" AND o."tenantId" = ${g.tenantId}
    WHERE d."tenantId" = ${g.tenantId} AND d."unitId" = ${g.unitId} AND d."localDate" >= ${r.from}::date AND d."localDate" <= ${r.to}::date${prod}
    ORDER BY d."localDate", d."startsAt", d."id"
    LIMIT ${capDep + 1}`;
  if (deps.length > capDep) return fail("REPORT_TOO_LARGE");
  const ids = deps.map((d) => d.id);
  const [rows, costs] = await Promise.all([
    ids.length ? readMoneyBookings(g, { departureIds: ids, channel: f.channel, limit: capBk + 1 }) : Promise.resolve([] as BookingReadRow[]),
    // Q16: แถวต้นทุนอ่านเฉพาะผู้เห็นต้นทุน และเฉพาะเมื่อไม่กรองช่องทาง (ต้นทุนแยกตามช่องทางไม่ได้)
    costView && f.channel === null && ids.length > 0
      ? g.db.tripCost.findMany({
          where: { tenantId: g.tenantId, unitId: g.unitId, departureId: { in: ids } },
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
          select: { id: true, departureId: true, kind: true, amountSatang: true, note: true, createdAt: true, updatedAt: true },
        })
      : Promise.resolve([] as CostRead[]),
  ]);
  if (rows.length > capBk) return fail("REPORT_TOO_LARGE");
  const bkOf = new Map<string, BookingReadRow[]>();
  for (const b of rows) pushTo(bkOf, b.departureId, b);
  const costOf = new Map<string, CostRead[]>();
  // เพดานอ่านแถวต้นทุนต่อรอบ = เพดานเดียวกับทางบันทึก (เหมือนตัวคิดของ a1 · Q12)
  for (const c of costs) if ((costOf.get(c.departureId)?.length ?? 0) < TRIP_COST_ROWS_MAX) pushTo(costOf, c.departureId, c);
  const calcs: DepCalc[] = deps.map((dep) => {
    const product = byId.get(dep.productId) ?? null;
    const c = moneyOfDeparture(dep, product?.sourceKind ?? "", costView, now, bkOf.get(dep.id) ?? [], costOf.get(dep.id) ?? [], registered);
    return { dep, product, money: c.money, perBooking: c.perBooking };
  });
  return { ...base, calcs };
}

// ── ผลรวม ──
const ADD_KEYS = ["bookings", "cancelledBookings", "pendingRefundBookings", "seats", "salesSatang", "passThroughSatang", "vatSatang", "revenueExVatSatang", "collectedSatang", "outstandingSatang", "heldSatang", "retainedSatang", "agentCollectBookings", "noShowUnpaid", "pendingBookings"] as const;
type AddKey = (typeof ADD_KEYS)[number];
function addUp(ms: readonly DepartureMoneyVM[]): Record<AddKey, number> & { commission: number; cost: number; costRows: number } {
  const t = { ...(Object.fromEntries(ADD_KEYS.map((k) => [k, 0])) as Record<AddKey, number>), commission: 0, cost: 0, costRows: 0 };
  for (const m of ms) {
    for (const k of ADD_KEYS) t[k] += m[k];
    t.commission += m.commissionCostSatang ?? 0;
    t.cost += m.costSatang ?? 0;
    t.costRows += m.costRows ?? 0;
  }
  return t;
}
function costWaitOf(calcs: readonly DepCalc[]): CostWait {
  const w = { ended: 0, upcoming: 0 };
  for (const c of calcs) {
    if (c.money.state === "CANCELLED" || c.money.noCosts !== true) continue;
    if (c.money.state === "ENDED") w.ended += 1;
    else w.upcoming += 1;
  }
  return w;
}
/** D1: กำไรของช่วง = รายได้ก่อน VAT − คอมฯ − ต้นทุน ของยอดรวม · null เมื่อไม่เห็นต้นทุนหรือทั้งช่วงไม่มีแถวต้นทุน */
const profitPart = (costView: boolean, s: { revenueExVatSatang: number; commission: number; cost: number; costRows: number }) =>
  costView && s.costRows > 0 ? profitOf({ revenueExVatSatang: s.revenueExVatSatang, commissionCostSatang: s.commission, costSatang: s.cost }) : { grossProfitSatang: null, marginBp: null };

function totalsOf(b: Built): ReportTotals {
  const ms = b.calcs.map((c) => c.money);
  const s = addUp(ms);
  const live = b.calcs.filter((c) => c.dep.status !== "CANCELLED");
  const capacity = live.reduce((a, c) => a + c.dep.capacity, 0);
  const sold = live.reduce((a, c) => a + c.dep.sold, 0);
  const full = b.full;
  const pr = full ? profitPart(b.costView, s) : { grossProfitSatang: null, marginBp: null };
  const { commission, cost, costRows, ...sums } = s;
  return {
    ...sums,
    estimate: true,
    departures: full ? b.calcs.length : null,
    cancelledDepartures: full ? b.calcs.length - live.length : null,
    capacity: full ? capacity : null,
    sold: full ? sold : null,
    loadFactorBp: full ? loadFactorBp(sold, capacity) : null,
    charterLikeDepartures: full ? live.filter((c) => c.money.charterLike).length : null,
    commissionCostSatang: b.costView ? commission : null,
    costSatang: full && b.costView ? cost : null,
    costRows: full && b.costView ? costRows : null,
    grossProfitSatang: pr.grossProfitSatang,
    marginBp: pr.marginBp,
    departuresWithoutCosts: full && b.costView ? costWaitOf(b.calcs) : null,
  };
}
function warningsOf(b: Built): TripReportVM["warnings"] {
  const has = new Map<MoneyWarningCode, number | null>();
  for (const c of b.calcs)
    for (const w of c.money.warnings) {
      const prev = has.get(w.code);
      has.set(w.code, typeof w.n === "number" ? (prev ?? 0) + w.n : (prev ?? null));
    }
  return MONEY_WARNING_CODES.filter((c) => has.has(c)).map((code) => {
    const n = has.get(code);
    return typeof n === "number" ? { code, n } : { code };
  });
}
/** การจองที่นับ (ไม่ใช่ EXCLUDED) พร้อมวันเดินทางของรอบ — ใช้ในแท็บระยะจอง/ช่องทาง/ช่วงของฐานวันจอง */
const bookingsOf = (b: Built) => b.calcs.flatMap((c) => c.perBooking.filter((x) => x.m.counted !== "EXCLUDED"));

function periodsVM(b: Built): ReportPeriodVM[] {
  const ps = periodsOf(b.range.from, b.range.to, b.group);
  const idx = new Map(ps.map((p, i) => [p.key, i]));
  const depGroups = ps.map(() => [] as DepCalc[]);
  const bkGroups = ps.map(() => [] as BookingMoney[]);
  if (b.f.basis === "booked") {
    for (const x of bookingsOf(b)) {
      const i = idx.get(periodKeyOf(utcToLocal(b.tz, x.b.createdAt).ymd, b.group));
      if (i !== undefined) bkGroups[i]?.push(x.m);
    }
  } else {
    for (const c of b.calcs) {
      const i = idx.get(periodKeyOf(ymd(c.dep.localDate), b.group));
      if (i !== undefined) depGroups[i]?.push(c);
    }
  }
  return ps.map((p, i) => {
    if (b.f.basis === "booked") {
      const s = sumMoney(bkGroups[i] ?? []);
      return { ...p, departures: null, bookings: s.bookings, seats: s.seats, salesSatang: s.salesSatang, vatSatang: s.vatSatang, revenueExVatSatang: s.revenueExVatSatang, commissionCostSatang: b.costView ? s.commissionCostSatang : null, costSatang: null, costRows: null, grossProfitSatang: null, departuresWithoutCosts: null };
    }
    const cs = depGroups[i] ?? [];
    const s = addUp(cs.map((c) => c.money));
    const full = b.full;
    return {
      ...p,
      departures: full ? cs.length : null,
      bookings: s.bookings,
      seats: s.seats,
      salesSatang: s.salesSatang,
      vatSatang: s.vatSatang,
      revenueExVatSatang: s.revenueExVatSatang,
      commissionCostSatang: b.costView ? s.commission : null,
      costSatang: full && b.costView ? s.cost : null,
      costRows: full && b.costView ? s.costRows : null,
      grossProfitSatang: full ? profitPart(b.costView, s).grossProfitSatang : null,
      departuresWithoutCosts: full && b.costView ? costWaitOf(cs) : null,
    };
  });
}
function loadVM(b: Built): ReportLoadVM {
  if (!b.full) return { rows: [] };
  const by = new Map<string, ReportLoadVM["rows"][number]>();
  for (const c of b.calcs) {
    if (c.dep.status === "CANCELLED") continue;
    const r = by.get(c.dep.productId) ?? { productId: c.dep.productId, titleTh: c.product?.titleTh ?? "", titleEn: c.product?.titleEn ?? null, departures: 0, capacity: 0, sold: 0, loadFactorBp: null, charterLikeDepartures: 0 };
    r.departures += 1;
    r.capacity += c.dep.capacity;
    r.sold += c.dep.sold;
    if (c.money.charterLike) r.charterLikeDepartures += 1;
    by.set(c.dep.productId, r);
  }
  const rows = [...by.values()].map((r) => ({ ...r, loadFactorBp: loadFactorBp(r.sold, r.capacity) }));
  rows.sort((a, z2) => (z2.loadFactorBp ?? -1) - (a.loadFactorBp ?? -1) || a.titleTh.localeCompare(z2.titleTh, "th") || (a.productId < z2.productId ? -1 : 1));
  return { rows };
}
function leadVM(b: Built): ReportLeadVM {
  const buckets = LEAD_BUCKETS.map((x) => ({ key: x.key, bookings: 0, seats: 0, salesSatang: 0 }));
  const days: number[] = [];
  let excludedImport = 0;
  let excludedNegative = 0;
  for (const x of bookingsOf(b)) {
    if (x.m.counted !== "LIVE") continue;
    if (x.b.channel === "IMPORT") {
      excludedImport += 1;
      continue;
    }
    const d = leadDaysOf(x.b.createdAt, ymd(x.b.localDate), b.tz);
    const k = leadBucketOf(d);
    const bk = buckets.find((y) => y.key === k);
    if (!bk) {
      excludedNegative += 1;
      continue;
    }
    bk.bookings += 1;
    bk.seats += x.m.seats;
    bk.salesSatang += x.m.salesSatang;
    days.push(d);
  }
  return { buckets, medianDays: medianOf(days), counted: days.length, excludedImport, excludedNegative };
}
function channelsVM(b: Built, totalSales: number): ReportChannelsVM {
  const by = new Map<string, BookingMoney[]>();
  for (const x of bookingsOf(b)) if (x.m.counted === "LIVE" || x.m.counted === "CANCELLED") pushTo(by, x.b.channel, x.m);
  // D5: ส่วนแบ่งปัดแต่ละแถวอิสระ (ผลรวมอาจไม่เท่า 100.00% · ไม่มีแถวรวม %)
  const share = (sales: number) => (totalSales > 0 ? mulDivHalfUp(sales, 10_000, totalSales) : null);
  const sumOf = (ms: readonly BookingMoney[]): ChannelSum => {
    const s = sumMoney(ms);
    return { bookings: s.bookings, cancelledBookings: s.cancelledBookings, seats: s.seats, salesSatang: s.salesSatang, commissionCostSatang: b.costView ? s.commissionCostSatang : null, shareBp: share(s.salesSatang) };
  };
  return {
    groups: GROUP_KEYS.map((group) => {
      const chs = [...by.keys()].filter((c) => channelGroupOf(c) === group).sort((a, z2) => sellRank(a) - sellRank(z2) || a.localeCompare(z2));
      return { group, ...sumOf(chs.flatMap((c) => by.get(c) ?? [])), channels: chs.map((channel) => ({ channel, ...sumOf(by.get(channel) ?? []) })) };
    }),
  };
}
function rowVM(c: DepCalc, tz: string): ReportDepartureRowVM {
  const m = c.money;
  return {
    departureId: c.dep.id,
    productId: c.dep.productId,
    titleTh: c.product?.titleTh ?? "",
    titleEn: c.product?.titleEn ?? null,
    optionTh: i18nTh(c.dep.optionName) || null,
    optionEn: i18nEn(c.dep.optionName),
    localDate: ymd(c.dep.localDate),
    timeText: timeTextOf(tz, c.dep.startsAt, c.dep.endsAt),
    status: c.dep.status,
    state: m.state,
    estimate: true,
    capacity: m.capacity,
    sold: m.sold,
    loadFactorBp: m.loadFactorBp,
    charterLike: m.charterLike,
    bookings: m.bookings,
    cancelledBookings: m.cancelledBookings,
    pendingRefundBookings: m.pendingRefundBookings,
    salesSatang: m.salesSatang,
    passThroughSatang: m.passThroughSatang,
    vatSatang: m.vatSatang,
    revenueExVatSatang: m.revenueExVatSatang,
    collectedSatang: m.collectedSatang,
    outstandingSatang: m.outstandingSatang,
    heldSatang: m.heldSatang,
    agentCollectBookings: m.agentCollectBookings,
    commissionCostSatang: m.commissionCostSatang,
    costSatang: m.costSatang,
    costRows: m.costRows,
    grossProfitSatang: m.grossProfitSatang,
    marginBp: m.marginBp,
    noCosts: m.noCosts,
  };
}

// ═══════════════ 6.1 ตัวโหลดจอรายงาน ═══════════════
export async function loadTripReportVM(ctx: TripsScreenCtx, input: unknown, opts?: Opts): Promise<{ ok: true; vm: TripReportVM } | Fail> {
  const p = LOAD_IN.safeParse(input);
  if (!p.success) return fail("INVALID_INPUT");
  const e = await enter(ctx, p.data.unitId);
  if (isFail(e)) return e;
  const f = filtersOf(p.data);
  if (isFail(f)) return f;
  const b = await build(e, f, opts);
  if (isFail(b)) return b;
  const totals = totalsOf(b);
  const rows = b.full ? b.calcs.map((c) => rowVM(c, b.tz)) : null;
  const pageCount = rows ? Math.max(1, Math.ceil(rows.length / REPORT_PAGE_SIZE)) : 1;
  return {
    ok: true,
    vm: {
      unit: { id: e.g.unitId, slug: e.g.unitSlug, tz: b.tz, today: b.today, nowIso: b.now.toISOString() },
      filter: { from: b.range.from, to: b.range.to, days: b.range.days, basis: f.basis, productId: f.productId, channel: f.channel, tab: f.tab, group: b.group, page: f.page },
      presets: reportPresetsOf(b.today).filter((x) => !(f.basis === "booked" && x.key === "next30")),
      flags: { costView: b.costView, exportAvailable: b.full, commissionWithVat: b.costView ? b.calcs.some((c) => c.perBooking.some((x) => x.commissionVatCounted)) : null },
      notes: { basis: f.basis === "booked", channel: f.channel !== null },
      products: b.products.slice(0, REPORT_PRODUCTS_MAX).map((x) => ({ id: x.id, titleTh: x.titleTh, titleEn: x.titleEn })),
      productsTotal: b.products.length,
      productsTruncated: b.products.length > REPORT_PRODUCTS_MAX,
      channelOptions: CHANNELS,
      totals,
      periods: f.tab === "sales" ? periodsVM(b) : null,
      load: f.tab === "load" ? loadVM(b) : null,
      lead: f.tab === "lead" ? leadVM(b) : null,
      channelsTab: f.tab === "channel" ? channelsVM(b, totals.salesSatang) : null,
      departures: rows ? { rows: rows.slice((f.page - 1) * REPORT_PAGE_SIZE, f.page * REPORT_PAGE_SIZE), page: f.page, pageCount, total: rows.length, pageSize: REPORT_PAGE_SIZE } : null,
      warnings: warningsOf(b),
    },
  };
}

// ═══════════════ 6.2 ส่งออก CSV (ฐานวันเดินทาง · ข้อมูลล้วน · D2) ═══════════════
export async function exportTripReportCsv(ctx: TripsScreenCtx, input: unknown, opts?: Opts): Promise<{ ok: true; value: ReportCsvOut } | Fail> {
  const p = EXPORT_IN.safeParse(input);
  if (!p.success) return fail("INVALID_INPUT");
  const e = await enter(ctx, p.data.unitId);
  if (isFail(e)) return e;
  const f = filtersOf({ from: p.data.from, to: p.data.to, productId: p.data.productId });
  if (isFail(f)) return f;
  const { g, costView } = e;
  const now = nowOf(opts);
  const locale = p.data.locale ?? "th";
  // ช่วงก่อนเพดานความถี่ (ช่วงผิดไม่กินโควตา)
  const tz = await tzOf(g);
  const r = reportRangeOf({ from: f.from, to: f.to }, utcToLocal(tz, now).ymd);
  if (!r.ok) return fail(r.code, "range");
  const rl = await checkRateLimitDb(`trips:report:export:${g.tenantId}:${g.unitId}:${g.actorUserId}`, REPORT_EXPORT_RATE, now.getTime());
  if (!rl.ok) {
    const minutes = Math.max(1, Math.ceil((rl.retryAfterSec ?? 60) / 60));
    return { ...tripsFail("RATE_LIMITED", `ส่งออกบ่อยเกินไป — ลองใหม่ในอีก ${minutes} นาที`), minutes };
  }
  const b = await build(e, { ...f, basis: "travel", channel: null, tab: "sales", group: null, page: 1 }, opts);
  if (isFail(b)) return b;
  const T = TEXT[locale];
  const head: Dict = T.report.csv;
  const states: Dict = T.costs.state;
  const cols: string[] = [...REPORT_CSV_COLUMNS, ...(costView ? REPORT_CSV_COST_COLUMNS : [])];
  const kept = b.calcs.slice(0, TRIPS_REPORT_CSV_CAP);
  const lines: ReportCell[][] = kept.map((c) => {
    const x = rowVM(c, b.tz);
    const cells: ReportCell[] = [
      x.localDate,
      x.timeText,
      locale === "en" ? (x.titleEn ?? x.titleTh) : x.titleTh,
      locale === "en" ? (x.optionEn ?? x.optionTh) : x.optionTh,
      states[x.state] ?? null,
      x.capacity,
      x.sold,
      { bp: x.loadFactorBp },
      x.bookings,
      x.cancelledBookings,
      x.pendingRefundBookings,
      { satang: x.salesSatang },
      { satang: x.passThroughSatang },
      { satang: x.vatSatang },
      { satang: x.revenueExVatSatang },
      { satang: x.collectedSatang },
      { satang: x.outstandingSatang },
      { satang: x.heldSatang },
      x.agentCollectBookings,
    ];
    // รอบยังไม่มีแถวต้นทุน ⇒ ต้นทุน/กำไร/มาร์จินว่าง (Q2)
    if (costView) cells.push(x.commissionCostSatang === null ? null : { satang: x.commissionCostSatang }, x.noCosts !== false || x.costSatang === null ? null : { satang: x.costSatang }, x.grossProfitSatang === null ? null : { satang: x.grossProfitSatang }, { bp: x.marginBp });
    return cells;
  });
  const total = b.calcs.length;
  const truncated = total > kept.length;
  const out: ReportCsvOut = { filename: reportFileName(b.range.from, b.range.to, truncated), csv: reportCsv(cols.map((c) => head[c] ?? c), lines), rows: kept.length, total, truncated, withCost: costView };
  try {
    await g.db.auditLog.create({
      data: {
        tenantId: g.tenantId,
        unitId: g.unitId,
        actorType: "USER",
        actorId: g.actorUserId,
        action: A_EXPORTED,
        targetType: "BusinessUnit",
        targetId: g.unitId,
        after: { from: b.range.from, to: b.range.to, productId: f.productId, rows: out.rows, total, truncated, withCost: costView, locale },
      },
    });
  } catch (err) {
    console.error("[trips.reports] export audit failed", { unitId: g.unitId, error: err instanceof Error ? err.message : String(err) });
    return fail("BUSY");
  }
  return { ok: true, value: out };
}
// ── /T1.7a2 reports ──
