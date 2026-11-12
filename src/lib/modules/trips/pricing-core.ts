// ─────────────────────────────────────────────────────────────
// trips/pricing-core.ts — ตัวเลือกราคาบริสุทธิ์ 8 ขั้น (RUN TRIPS T0.5)
// ใบสั่ง ledger/trips-briefs/T0.5.md §2–§4 (มติ §12 §13 ชนะ) · สัญญา CC §C §F.1 §H.2–§H.4
//
// 🔴 บริสุทธิ์ + กำหนดได้ซ้ำ: ไม่มี prisma/ค่าตั้ง/นาฬิกาเครื่อง — ทุกอย่างมาจากอินพุต (`now` `tz` `policy`)
// 🔴 เงินเป็นจำนวนเต็มตลอดทาง · การหาร/ปัดทั้งหมดผ่าน ./money-math · ไม่มีตัวเลขธุรกิจตายตัว (อัตรา/เพดาน/% มาจาก policy หรืออินพุต)
// 🔴 ผลไม่ขึ้นกับลำดับอินพุต: เรียงบรรทัด SEAT → EXTRA → PICKUP แล้วตาม itemRef · เลือกแถวด้วยกติกาแน่นอน (… → id น้อย)
// 🔴 บรรทัดเก็บแทน (passThrough) ข้ามขั้น 4–8 ทุกกรณี · ไม่เข้าฐานส่วนลด/คอมฯ/VAT
// ผลปฏิเสธ = `{ ok:false, code, messageTh, retryable:false, details }` (ไม่ throw)
// ─────────────────────────────────────────────────────────────
import { z } from "zod";
import type { SellErrorCode } from "@/lib/core/sellable";
import type { PolicySnapshot } from "@/lib/core/settings";
import { isYmd, tripPriceRuleParamsSchema, type TripPriceRuleParams } from "./json-schemas";
import {
  BP_UNIT,
  allocateLastRemainder,
  allocateWithin,
  divFloor,
  minorToSatang,
  mulBpHalfUp,
  mulDivHalfUp,
  vatOfExclusive,
  vatOfInclusive,
} from "./money-math";

// ═══════════════ ขั้น ═══════════════
export const PRICE_STEPS = ["RETAIL", "SEASON", "DEPARTURE", "RULE", "TIER", "CONTRACT", "PROMO", "MANUAL"] as const;
export type PriceStep = (typeof PRICE_STEPS)[number];

/** ผลปฏิเสธในฟังก์ชัน *InTx (โยนเพื่อ rollback ธุรกรรมของผู้เรียก) — code ∈ SELL_ERROR_CODES · เหตุย่อยใน details.reason */
export class PricingAbort extends Error {
  readonly code: SellErrorCode;
  readonly details: Record<string, unknown> & { reason: string };
  readonly messageTh: string;
  readonly retryable = false;
  constructor(code: SellErrorCode, reason: string, messageTh?: string, extra?: Record<string, unknown>) {
    const msg = messageTh ?? REASON_TH[reason] ?? "ทำรายการราคาไม่สำเร็จ";
    super(msg);
    this.name = "PricingAbort";
    this.code = code;
    this.messageTh = msg;
    this.details = { ...(extra ?? {}), reason };
  }
}

export const REASON_TH: Record<string, string> = {
  PRICE_MISSING: "ยังไม่มีราคาสำหรับรอบหรือประเภทผู้เดินทางนี้ — ตั้งราคาก่อนเปิดขาย",
  SEASON_OVERLAP: "ช่วงวันของฤดูกาลนี้ทับกับฤดูกาลอื่นที่ลำดับความสำคัญเท่ากัน — ปรับช่วงวันหรือลำดับความสำคัญ",
  BAD_RANGE: "วันสิ้นสุดต้องไม่ก่อนวันเริ่ม",
  CODE_TAKEN: "โค้ดนี้มีโปรโมชันอื่นในหน่วยใช้อยู่แล้ว — เลือกโค้ดอื่น",
  PROMO_EXHAUSTED: "โค้ดส่วนลดนี้ถูกใช้ครบจำนวนแล้ว",
  PROMO_PER_CONTACT: "ลูกค้ารายนี้ใช้โค้ดส่วนลดนี้ครบจำนวนครั้งที่กำหนดแล้ว",
  PROMO_INACTIVE: "โค้ดส่วนลดนี้ปิดใช้อยู่",
  REASON_REQUIRED: "กรุณาระบุเหตุผลอย่างน้อย 10 ตัวอักษร",
  FX_RATE_MISSING: "ยังไม่มีอัตราแลกเปลี่ยนของสกุลเงินนี้ในค่าตั้ง — เพิ่มอัตราก่อน",
  MARKUP_OVER_CAP: "ราคาขายจริงสูงกว่าเพดานที่สัญญาเอเจนซี่กำหนด",
  RULE_DISCOUNT_SHAPE: "ระบุส่วนลดเป็นเปอร์เซ็นต์หรือจำนวนเงินอย่างใดอย่างหนึ่ง",
  PASS_THROUGH_LOCKED: "เงินเก็บแทน (เช่น ค่าอุทยาน) แก้ราคาเองไม่ได้",
  AGENCY_NOT_ENABLED: "ยังไม่ได้เปิดขายผ่านเอเจนซี่สำหรับร้านนี้",
};

// ═══════════════ อินพุต (§3.1) ═══════════════
const INT4 = 2_147_483_647;
const NN = z.number().int().min(0).max(INT4);
const SINT = z.number().int().min(-INT4).max(INT4);
const BP = z.number().int().min(0).max(BP_UNIT);
const PCT = z.number().int().min(0).max(INT4);
const ID = z.string().min(1).max(200);
const YMD = z.string().refine(isYmd, { message: "วันที่ต้องเป็นรูปแบบ ปปปป-ดด-วว" });
const ISO = z.string().refine((s) => !Number.isNaN(Date.parse(s)), { message: "เวลาต้องเป็นรูปแบบ ISO" });
const TAX_KIND = z.enum(["VAT7", "EXEMPT", "NONE"]);
const LEVEL = z
  .strictObject({
    refId: ID,
    mode: z.enum(["COMMISSION_PCT", "COMMISSION_FIXED", "NET", "MARKUP"]),
    rateBp: BP.nullable(),
    fixedSatang: NN.nullable(),
    unitMinorByPaxCode: z.record(z.string(), NN).nullable(),
    minSellMinor: NN.nullable(),
    markupCapBp: NN.nullable(),
  })
  .nullable();
export const agencyPricingInputSchema = z.strictObject({
  agentAccountId: ID,
  agentTierId: ID.nullable(),
  vatRegistered: z.boolean(),
  tier: LEVEL,
  contract: LEVEL,
  terms: z.strictObject({
    collector: z.enum(["SHOP_COLLECTS", "AGENT_COLLECTS"]),
    sellerOfRecord: z.enum(["SHOP_PRINCIPAL", "AGENT_RESELLS"]),
    vatMode: z.enum(["NONE", "EXCLUSIVE", "INCLUSIVE"]),
    vatRateBp: BP,
    wht: z.strictObject({
      applies: z.boolean(),
      mode: z.enum(["RATE", "PROGRESSIVE_50_1", "NONE_FOREIGN", "NONE"]),
      rateBp: BP.nullable(),
      eWht: z.boolean(),
      grossUp: z.boolean(),
      minPerContractSatang: NN,
      continuous: z.string().min(1).max(40),
      remitter: z.enum(["SHOP", "AGENT_ON_BEHALF", "NONE"]),
      payerType: z.string().min(1).max(40),
      payeeType: z.string().min(1).max(40),
    }),
    discountFromCommission: z.strictObject({ enabled: z.boolean(), capPct: PCT }),
    earnedAt: z.enum(["AFTER_TRAVEL", "ON_CONFIRM"]),
    clawbackOnCancel: z.boolean(),
    actualSaleSatang: NN.nullable(),
  }),
  policySnapshot: z.unknown(),
});
export type AgencyPricingInput = Omit<z.infer<typeof agencyPricingInputSchema>, "policySnapshot"> & { policySnapshot: PolicySnapshot | null };
export type AgencyLevel = NonNullable<AgencyPricingInput["tier"]>;

export const tripPricingInputSchema = z.strictObject({
  now: ISO,
  tz: z.string().min(1).max(64),
  unitId: ID,
  channel: z.string().min(1).max(40),
  actor: z.enum(["STAFF", "AGENT", "PUBLIC", "SYSTEM"]),
  currency: z.string().regex(/^[A-Z]{3}$/),
  product: z.strictObject({ id: ID, productType: z.enum(["TOUR", "LIVEABOARD", "ATTRACTION"]), currency: z.string().regex(/^[A-Z]{3}$/) }),
  departure: z.strictObject({
    id: ID,
    localDate: YMD,
    startsAt: ISO,
    optionId: ID.nullable(),
    capacity: NN,
    sold: NN,
    held: NN,
    reserved: NN,
    minPax: NN.nullable(),
    days: NN,
    nights: NN,
    costSatang: NN,
    deckPlanVersionId: ID.nullable(),
  }),
  paxTypes: z.array(z.strictObject({ id: ID, code: z.string().min(1).max(40), countsCapacity: z.boolean(), active: z.boolean() })).max(50),
  pax: z.array(z.strictObject({ paxTypeId: ID, qty: NN.max(100_000) })).max(50),
  extras: z
    .array(
      z.strictObject({
        id: ID,
        kind: z.string().min(1).max(40),
        basis: z.enum(["PER_PAX", "PER_BOOKING", "PER_DAY", "PER_PAX_DAY", "PER_BOAT_NIGHT"]),
        mandatory: z.boolean(),
        priceMinor: NN,
        paxPrices: z.record(z.string(), NN).nullable(),
        currency: z.string().regex(/^[A-Z]{3}$/),
        commissionable: z.boolean(),
        discountable: z.boolean(),
        passThrough: z.boolean(),
        taxKind: TAX_KIND,
        label: z.string().max(400),
      }),
    )
    .max(200),
  requestedExtras: z.array(z.strictObject({ extraId: ID, qty: NN.max(100_000) })).max(200),
  pickup: z.strictObject({ zoneId: ID, label: z.string().max(400), surchargeSatang: NN }).nullable(),
  prices: z
    .array(
      z.strictObject({
        id: ID,
        optionId: ID.nullable(),
        paxTypeId: ID.nullable(),
        cabinTypeId: ID.nullable(),
        seasonId: ID.nullable(),
        departureId: ID.nullable(),
        currency: z.string().regex(/^[A-Z]{3}$/),
        amountMinor: NN,
        weekdayMask: z.number().int().min(0).max(127).nullable(),
        bookFrom: YMD.nullable(),
        bookTo: YMD.nullable(),
        travelFrom: YMD.nullable(),
        travelTo: YMD.nullable(),
        priority: SINT,
      }),
    )
    .max(5000),
  seasons: z.array(z.strictObject({ id: ID, dateStart: YMD, dateEnd: YMD, priority: SINT, status: z.string().min(1).max(20) })).max(500),
  rules: z
    .array(
      z.strictObject({
        id: ID,
        productId: ID.nullable(),
        kind: z.string().min(1).max(40),
        params: z.unknown(),
        dateFrom: YMD.nullable(),
        dateTo: YMD.nullable(),
        bookFrom: YMD.nullable(),
        bookTo: YMD.nullable(),
        priority: SINT,
        active: z.boolean(),
        usedCount: NN,
      }),
    )
    .max(5000),
  promoCode: z.string().max(64).nullable(),
  promoProviders: z.array(z.strictObject({ key: z.string().min(1).max(60), ref: ID, label: z.string().max(200), discountSatang: NN })).max(20),
  agency: agencyPricingInputSchema.nullable(),
  agentDiscountSatang: NN,
  overrides: z.array(z.strictObject({ itemRef: z.string().min(1).max(200), unitMinor: NN, reason: z.string().max(500) })).max(200),
  overrideGrant: z.strictObject({
    canOverride: z.boolean(),
    approvals: z.array(z.strictObject({ approvalId: ID, itemRef: z.string().min(1).max(200), unitMinor: NN })).max(200),
  }),
  policy: z.record(z.string(), z.unknown()),
});
export type TripPricingInput = Omit<z.infer<typeof tripPricingInputSchema>, "agency"> & { agency: AgencyPricingInput | null };

// ═══════════════ ค่าตั้งที่ตัวเลือกราคาใช้ (§9) ═══════════════
const BOOL = z.boolean();
const PERCENT = z.number().int().min(0).max(100);
const POLICY_SCHEMAS = {
  "trips.general.currencies": z.array(z.string()),
  "trips.fx.rates": z.array(z.object({ currency: z.string(), rateMicros: NN })),
  "trips.pay.depositPct": PERCENT,
  "trips.pay.depositBase": z.enum(["TRIP_ONLY", "ALL_LINES"]),
  "trips.pay.balanceDueDaysBefore": NN.nullable(),
  "trips.cancel.ladder": z.array(z.object({ fromDaysBefore: NN, refundPct: PERCENT })),
  "trips.cancel.shopCancelRefund": z.object({ EXTERNAL: PERCENT, MIN_NOT_MET: PERCENT, SHOP_FAULT: PERCENT }),
  "trips.pax.childPricePct": PERCENT.nullable(),
  "trips.tax.vatRegistered": z.object({ registered: BOOL.nullable() }),
  "trips.tax.priceIncludesVat": BOOL,
  "trips.tax.vatRate": z.object({ mode: z.enum(["STANDARD", "EXEMPT_81_1_N"]), rateBp: BP }),
  "trips.line.defaults": z.record(z.string(), z.object({ passThrough: BOOL, commissionPct: PERCENT, discountable: BOOL })),
  "trips.parkFee.table": z.object({
    groups: z.array(z.object({ thaiChildSatang: NN, thaiAdultSatang: NN, foreignChildSatang: NN, foreignAdultSatang: NN })),
    shopRates: z.array(z.object({ adultSatang: NN, childSatang: NN, diverSatang: NN.nullable() })).optional(),
  }),
  "trips.price.manualOverrideApprovalPct": PERCENT,
  "trips.price.costWarnMarginPct": PCT,
} as const;
type PolicyKey = keyof typeof POLICY_SCHEMAS;
type Policy = { [K in PolicyKey]: z.infer<(typeof POLICY_SCHEMAS)[K]> };
/** คีย์ค่าตั้งที่ตัวเลือกราคาต้องมี (ขาด = VALIDATION details.missingKeys) */
export const PRICING_POLICY_KEYS = Object.keys(POLICY_SCHEMAS) as PolicyKey[];

// ═══════════════ ผลลัพธ์ (§3.4) ═══════════════
export type TaxKind = "VAT7" | "EXEMPT" | "NONE";
export type TraceEntry = { step: PriceStep; refId?: string; amountMinor: number; note?: string };
export type PricedItem = {
  itemRef: string;
  kind: "SEAT" | "EXTRA" | "PICKUP";
  label: string;
  paxTypeId: string | null;
  paxTypeCode: string | null;
  extraId: string | null;
  qty: number;
  unitMinor: number;
  grossMinor: number;
  discountSatang: number;
  agentDiscountSatang: number;
  amountMinor: number;
  amountSatang: number;
  vatSatang: number;
  commissionBp: number;
  commissionable: boolean;
  discountable: boolean;
  passThrough: boolean;
  taxKind: TaxKind;
  priceSource: PriceStep;
  priceTrace: TraceEntry[];
};
export type PricedTotals = {
  grossSatang: number;
  discountSatang: number;
  agentDiscountSatang: number;
  passThroughSatang: number;
  vatableSatang: number;
  vatBaseSatang: number;
  vatSatang: number;
  payableSatang: number;
};
export type CommissionBlock = {
  agentAccountId: string;
  agentTierId: string | null;
  mode: AgencyLevel["mode"];
  rateSource: "TIER" | "CONTRACT";
  refId: string | null;
  baseSatang: number;
  rateBp: number | null;
  fixedSatang: number | null;
  commissionSatang: number;
  commissionInclVatSatang: number;
  collectMode: "SHOP_COLLECTS" | "AGENT_COLLECTS";
  sellerOfRecord: "SHOP_PRINCIPAL" | "AGENT_RESELLS";
  vatMode: "NONE" | "EXCLUSIVE" | "INCLUSIVE";
  vatRateBp: number;
  agencyVatRegistered: boolean;
  commissionVatSatang: number;
  earnedAt: "AFTER_TRAVEL" | "ON_CONFIRM";
  clawbackRule: string;
  wht: {
    applies: boolean;
    payerType: string;
    payeeType: string;
    mode: "RATE" | "PROGRESSIVE_50_1" | "NONE_FOREIGN" | "NONE";
    rateBp: number | null;
    eWht: boolean;
    whtSatang: number | null;
    grossUp: boolean;
    remitter: "SHOP" | "AGENT_ON_BEHALF" | "NONE";
    minPerContractSatang: number;
    continuous: string;
  };
  agentDiscountSatang: number;
  agentActualSaleSatang: number | null;
  collectFromCustomerSatang: number;
  remitToShopSatang: number;
  agentEarnsSatang: number;
  currency: "THB";
};
export type ScheduleRow = { seq: number; kind: "DEPOSIT" | "BALANCE"; amountSatang: number; vatableSatang: number; passThroughSatang: number; dueAt: string };
export type CancelStepBp = { daysBefore: number; refundBp: number };
export type PricingWarning = { code: string; messageTh: string; severity: "NORMAL" | "HIGH" | "HIGHEST"; details?: Record<string, unknown> };
export type PricedQuote = {
  currency: string;
  fx: null | { rateMicros: number; source: "SETTING"; effectiveFrom: string };
  items: PricedItem[];
  totals: PricedTotals;
  commission: CommissionBlock | null;
  paymentSchedule: ScheduleRow[];
  cancelLadder: CancelStepBp[];
  cancelMinimumLadder: CancelStepBp[] | null;
  shopCancelRefundBpByReason: { EXTERNAL: number; MIN_NOT_MET: number; SHOP_FAULT: number };
  promo: null | { ruleId: string; discountSatang: number };
  warnings: PricingWarning[];
};
export type PricingFail = { ok: false; code: SellErrorCode; messageTh: string; retryable: false; details: Record<string, unknown> };
export type PricingResult = { ok: true; value: PricedQuote } | PricingFail;

const fail = (code: SellErrorCode, reason: string | null, messageTh?: string, extra?: Record<string, unknown>): PricingFail => ({
  ok: false,
  code,
  messageTh: messageTh ?? (reason ? REASON_TH[reason] : undefined) ?? "ข้อมูลยังไม่ครบหรือรูปแบบยังไม่ตรง — ตรวจแล้วลองอีกครั้ง",
  retryable: false,
  details: { ...(extra ?? {}), ...(reason ? { reason } : {}) },
});

// ═══════════════ วันและเขตเวลา (สำเนาเล็กของ departures-core ของ T0.3 — ใช้แทนเมื่อ T0.3 merge) ═══════════════
const DEFAULT_TZ = "Asia/Bangkok";
const MS_MIN = 60_000;
const MS_DAY = 86_400_000;
const FMT = new Map<string, Intl.DateTimeFormat | null>();
function fmtOf(tz: string): Intl.DateTimeFormat | null {
  if (FMT.has(tz)) return FMT.get(tz) ?? null;
  let f: Intl.DateTimeFormat | null = null;
  try {
    f = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
  } catch {
    f = null;
  }
  FMT.set(tz, f);
  return f;
}
function zoneOf(tz: string): Intl.DateTimeFormat {
  return fmtOf(tz) ?? (fmtOf(DEFAULT_TZ) as Intl.DateTimeFormat);
}
function wallMs(f: Intl.DateTimeFormat, ms: number): number {
  const parts = f.formatToParts(new Date(ms));
  const get = (t: string) => Number(parts.find((x) => x.type === t)?.value ?? "0");
  return Date.UTC(get("year"), get("month") - 1, get("day"), get("hour") % 24, get("minute"), get("second"));
}
const utcMid = (ymd: string): number => Date.UTC(Number(ymd.slice(0, 4)), Number(ymd.slice(5, 7)) - 1, Number(ymd.slice(8, 10)));
/** วันที่ของร้าน "YYYY-MM-DD" ของเวลา `at` */
export function tripLocalYmd(tz: string, at: Date): string {
  return new Date(wallMs(zoneOf(tz), at.getTime())).toISOString().slice(0, 10);
}
/** เวลาร้าน (วัน + นาทีจากเที่ยงคืน) ⇒ ISO UTC (DST กระโดด ⇒ ใช้ออฟเซ็ตก่อนกระโดด) */
export function tripLocalToUtcIso(tz: string, ymd: string, minutes: number): string {
  const f = zoneOf(tz);
  const wall = utcMid(ymd) + minutes * MS_MIN;
  const offBefore = wallMs(f, wall - MS_DAY) - (wall - MS_DAY);
  const offAfter = wallMs(f, wall + MS_DAY) - (wall + MS_DAY);
  const cands = [wall - offBefore, wall - offAfter].filter((t) => wallMs(f, t) === wall).sort((a, b) => a - b);
  return new Date(cands.length ? cands[0] : wall - offBefore).toISOString();
}
/** จำนวนวันปฏิทินจาก a ถึง b (b − a) */
export function tripDaysBetween(a: string, b: string): number {
  return (utcMid(b) - utcMid(a)) / MS_DAY;
}
export function tripAddDays(ymd: string, n: number): string {
  return new Date(utcMid(ymd) + n * MS_DAY).toISOString().slice(0, 10);
}
const weekdayOf = (ymd: string): number => new Date(utcMid(ymd)).getUTCDay();
const inRange = (d: string, from: string | null, to: string | null): boolean => (from === null || from <= d) && (to === null || d <= to);

// ═══════════════ ตัวช่วย ═══════════════
const SEAT_LABEL_TH: Record<string, string> = { ADULT: "ผู้ใหญ่", CHILD: "เด็ก", INFANT: "เด็กเล็ก" };
const ADULT = "ADULT";
const CHILD = "CHILD";
const KIND_RANK = { SEAT: 0, EXTRA: 1, PICKUP: 2 } as const;
const cmpStr = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const sum = (xs: readonly number[]) => xs.reduce((s, x) => s + x, 0);
const trace = (step: PriceStep, amountMinor: number, refId?: string | null, note?: string | null): TraceEntry => ({
  step,
  ...(refId ? { refId } : {}),
  amountMinor,
  ...(note ? { note } : {}),
});
const normCode = (s: string) => s.trim().toUpperCase();

type Price = TripPricingInput["prices"][number];
type Rule = TripPricingInput["rules"][number];
type ParsedRule = Rule & { p: TripPriceRuleParams };
type Work = {
  itemRef: string;
  kind: "SEAT" | "EXTRA" | "PICKUP";
  label: string;
  paxTypeId: string | null;
  paxTypeCode: string | null;
  extraId: string | null;
  extraKind: string | null;
  qty: number;
  unitMinor: number;
  discountSatang: number;
  agentDiscountSatang: number;
  commissionBp: number;
  commissionable: boolean;
  discountable: boolean;
  passThrough: boolean;
  taxKind: TaxKind;
  priceSource: PriceStep;
  priceTrace: TraceEntry[];
  blackout: boolean;
  free: boolean;
  countsCapacity: boolean;
};

/** แถวราคาที่ดีที่สุดในระดับ: optionId ตรง > null · paxTypeId ตรง > null · priority สูง · id น้อย */
function bestRow(rows: readonly Price[], optionId: string | null): Price | null {
  let best: Price | null = null;
  const rank = (r: Price): [number, number, number] => [r.optionId !== null && r.optionId === optionId ? 1 : 0, r.paxTypeId !== null ? 1 : 0, r.priority];
  for (const r of rows) {
    if (!best) {
      best = r;
      continue;
    }
    const a = rank(r);
    const b = rank(best);
    const c = a[0] - b[0] || a[1] - b[1] || a[2] - b[2] || cmpStr(best.id, r.id);
    if (c > 0) best = r;
  }
  return best;
}

function appliesTo(p: TripPriceRuleParams, line: { code: string | null; isSeat: boolean }, optionId: string | null, channel: string): boolean {
  const a = p.appliesTo;
  if (!a) return true;
  if (a.optionIds && (optionId === null || !a.optionIds.includes(optionId))) return false;
  if (a.channels && !(a.channels as readonly string[]).includes(channel)) return false;
  if (a.paxTypeCodes && line.isSeat && (line.code === null || !a.paxTypeCodes.includes(line.code))) return false;
  return true;
}
const ruleCmp = (a: { priority: number; id: string }, b: { priority: number; id: string }) => b.priority - a.priority || cmpStr(a.id, b.id);
function discounted(unit: number, p: { discountBp?: number; discountMinor?: number }): number {
  if (p.discountBp !== undefined) return unit - mulBpHalfUp(unit, p.discountBp);
  if (p.discountMinor !== undefined) return Math.max(0, unit - p.discountMinor);
  return unit;
}

function warn(code: string, messageTh: string, severity: PricingWarning["severity"], details?: Record<string, unknown>): PricingWarning {
  return { code, messageTh, severity, ...(details ? { details } : {}) };
}
const PROMO_TH: Record<string, string> = {
  UNKNOWN: "ไม่พบโค้ดส่วนลดนี้ หรือโค้ดปิดใช้อยู่",
  EXPIRED: "โค้ดส่วนลดนี้หมดอายุแล้ว",
  NOT_YET: "โค้ดส่วนลดนี้ยังไม่เริ่มใช้",
  EXHAUSTED: "โค้ดส่วนลดนี้ถูกใช้ครบจำนวนแล้ว",
  BLACKOUT: "วันเดินทางนี้งดใช้โปรโมชัน",
  CURRENCY: "โค้ดส่วนลดใช้ได้กับราคาเงินบาทเท่านั้น",
  NOT_ELIGIBLE: "โค้ดส่วนลดนี้ใช้กับรายการนี้ไม่ได้",
};

// ═══════════════ ตัวเลือกราคา ═══════════════
export function resolveTripPrice(raw: unknown): PricingResult {
  const parsed = tripPricingInputSchema.safeParse(raw);
  if (!parsed.success) {
    return fail("VALIDATION", null, undefined, { issues: parsed.error.issues.slice(0, 5).map((i) => ({ path: i.path.join("."), message: i.message })) });
  }
  const inp = parsed.data;
  // ── ค่าตั้ง ──
  const missingKeys = PRICING_POLICY_KEYS.filter((k) => !Object.prototype.hasOwnProperty.call(inp.policy, k));
  if (missingKeys.length) return fail("VALIDATION", null, "ค่าตั้งราคาที่จำเป็นยังไม่ครบ", { missingKeys });
  const pol = {} as Record<PolicyKey, unknown>;
  for (const k of PRICING_POLICY_KEYS) {
    const r = POLICY_SCHEMAS[k].safeParse(inp.policy[k]);
    if (!r.success) return fail("VALIDATION", null, "ค่าตั้งราคามีรูปแบบไม่ถูกต้อง", { badKeys: [k] });
    pol[k] = r.data;
  }
  const P = pol as Policy;
  const agency = inp.agency as AgencyPricingInput | null;
  const now = new Date(inp.now);
  const tz = inp.tz;
  const bookYmd = tripLocalYmd(tz, now);
  const dep = inp.departure;
  const travel = dep.localDate;
  const currency = inp.currency;
  const thb = currency === "THB";

  // ── สกุลเงิน + อัตรา ──
  if ((!thb && inp.product.productType !== "LIVEABOARD") || !P["trips.general.currencies"].includes(currency)) {
    return fail("CURRENCY_NOT_ALLOWED", null, "สกุลเงินนี้ใช้กับสินค้านี้ไม่ได้ — ทัวร์และสถานที่ใช้บาท · Liveaboard ใช้สกุลที่เปิดในค่าตั้ง");
  }
  let rateMicros = 0;
  if (!thb) {
    const fx = P["trips.fx.rates"].find((r) => r.currency === currency);
    if (!fx) return fail("VALIDATION", "FX_RATE_MISSING");
    rateMicros = fx.rateMicros;
  }
  const toSatang = (minor: number) => (thb ? minor : minorToSatang(minor, rateMicros));

  // ── ผู้กระทำ ──
  if (inp.actor === "AGENT" && !agency) return fail("FORBIDDEN", "AGENCY_NOT_ENABLED");

  // ── ประเภทคน + ที่นั่ง ──
  const ptById = new Map(inp.paxTypes.map((p) => [p.id, p]));
  const qtyByPt = new Map<string, number>();
  for (const x of inp.pax) {
    const pt = ptById.get(x.paxTypeId);
    if (!pt || !pt.active) return fail("VALIDATION", null, "ประเภทผู้เดินทางนี้ไม่มีหรือปิดใช้อยู่", { paxTypeId: x.paxTypeId });
    qtyByPt.set(pt.id, (qtyByPt.get(pt.id) ?? 0) + x.qty);
  }
  const qtyOfCode = (code: string): number => sum(inp.paxTypes.filter((p) => p.code === code).map((p) => qtyByPt.get(p.id) ?? 0));
  const totalPax = sum([...qtyByPt.values()]);
  if (totalPax <= 0) return fail("VALIDATION", null, "ต้องมีผู้เดินทางอย่างน้อย 1 คน");
  const capacityPax = sum(inp.paxTypes.filter((p) => p.countsCapacity).map((p) => qtyByPt.get(p.id) ?? 0));
  const seatTax: TaxKind = P["trips.tax.vatRate"].mode === "STANDARD" ? "VAT7" : "EXEMPT";
  const lineDefaults = P["trips.line.defaults"];

  // ── แถวราคาที่ใช้ได้ (สกุล · ตัวเลือก · วันในสัปดาห์ · ช่วงจอง · ช่วงเดินทาง) ──
  const wd = weekdayOf(travel);
  const usable = inp.prices.filter(
    (r) =>
      r.currency === currency &&
      r.cabinTypeId === null &&
      (r.optionId === null || r.optionId === dep.optionId) &&
      (r.weekdayMask === null || (r.weekdayMask & (1 << wd)) !== 0) &&
      inRange(bookYmd, r.bookFrom, r.bookTo) &&
      inRange(travel, r.travelFrom, r.travelTo),
  );
  const retailRows = usable.filter((r) => r.seasonId === null && r.departureId === null);
  const seasonsCovering = inp.seasons.filter((s) => s.status === "ACTIVE" && s.dateStart <= travel && travel <= s.dateEnd).sort(ruleCmp);
  const season = seasonsCovering.find((s) => usable.some((r) => r.seasonId === s.id && r.departureId === null)) ?? null;
  const seasonRows = season ? usable.filter((r) => r.seasonId === season.id && r.departureId === null) : [];
  const depRows = usable.filter((r) => r.departureId === dep.id);
  const adultPt = inp.paxTypes.find((p) => p.code === ADULT) ?? null;
  const t28 = P["trips.pax.childPricePct"];

  const levelPrice = (rows: readonly Price[], pt: { id: string; code: string }): { amount: number; refId: string; note: string | null } | null => {
    const exact = bestRow(rows.filter((r) => r.paxTypeId === pt.id), dep.optionId);
    if (exact) return { amount: exact.amountMinor, refId: exact.id, note: null };
    if (pt.code === CHILD && t28 !== null && adultPt && adultPt.id !== pt.id) {
      const a = bestRow(rows.filter((r) => r.paxTypeId === adultPt.id || r.paxTypeId === null), dep.optionId);
      if (a) return { amount: mulBpHalfUp(a.amountMinor, t28 * 100), refId: a.id, note: "CHILD_PCT" };
    }
    const common = bestRow(rows.filter((r) => r.paxTypeId === null), dep.optionId);
    return common ? { amount: common.amountMinor, refId: common.id, note: null } : null;
  };

  const work: Work[] = [];
  const seatPts = inp.paxTypes.filter((p) => (qtyByPt.get(p.id) ?? 0) > 0).sort((a, b) => cmpStr(a.code, b.code) || cmpStr(a.id, b.id));
  const seenCodes = new Set<string>();
  for (const pt of seatPts) {
    if (seenCodes.has(pt.code)) return fail("VALIDATION", null, "รหัสประเภทผู้เดินทางซ้ำกัน", { code: pt.code });
    seenCodes.add(pt.code);
    const tr: TraceEntry[] = [];
    let unit: number | null = null;
    let src: PriceStep = "RETAIL";
    for (const [step, rows] of [["RETAIL", retailRows], ["SEASON", seasonRows], ["DEPARTURE", depRows]] as const) {
      const lp = levelPrice(rows, pt);
      if (!lp) continue;
      unit = lp.amount;
      src = step;
      tr.push(trace(step, lp.amount, lp.refId, lp.note));
    }
    if (unit === null) return fail("VALIDATION", "PRICE_MISSING", undefined, { paxTypeCode: pt.code });
    work.push({
      itemRef: `seat:${pt.code}`,
      kind: "SEAT",
      label: SEAT_LABEL_TH[pt.code] ?? pt.code,
      paxTypeId: pt.id,
      paxTypeCode: pt.code,
      extraId: null,
      extraKind: null,
      qty: qtyByPt.get(pt.id) ?? 0,
      unitMinor: unit,
      discountSatang: 0,
      agentDiscountSatang: 0,
      commissionBp: BP_UNIT,
      commissionable: true,
      discountable: true,
      passThrough: false,
      taxKind: seatTax,
      priceSource: src,
      priceTrace: tr,
      blackout: false,
      free: false,
      countsCapacity: pt.countsCapacity,
    });
  }

  // ── รายการเสริม ──
  const reqQty = new Map<string, number>();
  for (const r of inp.requestedExtras) reqQty.set(r.extraId, (reqQty.get(r.extraId) ?? 0) + r.qty);
  const extraById = new Map(inp.extras.map((e) => [e.id, e]));
  for (const id of reqQty.keys()) if (!extraById.has(id)) return fail("VALIDATION", null, "ไม่พบรายการเสริมนี้ในสินค้า", { extraId: id });
  for (const e of [...inp.extras].sort((a, b) => cmpStr(a.id, b.id))) {
    const asked = reqQty.get(e.id) ?? 0;
    if (!e.mandatory && asked <= 0) continue;
    if (e.currency !== currency) return fail("CURRENCY_NOT_ALLOWED", null, "รายการเสริมใช้สกุลเงินต่างจากราคาที่ขอ", { extraId: e.id });
    const reqN = e.mandatory ? Math.max(1, asked) : asked;
    const mult = e.basis === "PER_DAY" || e.basis === "PER_PAX_DAY" ? dep.days : e.basis === "PER_BOAT_NIGHT" ? dep.nights : 1;
    const def = lineDefaults[e.kind];
    const commissionBp = !e.passThrough && e.commissionable ? (def ? def.commissionPct * 100 : BP_UNIT) : 0;
    const base = {
      kind: "EXTRA" as const,
      extraId: e.id,
      extraKind: e.kind,
      discountSatang: 0,
      agentDiscountSatang: 0,
      commissionBp,
      commissionable: !e.passThrough && e.commissionable,
      discountable: !e.passThrough && e.discountable,
      passThrough: e.passThrough,
      taxKind: e.passThrough ? ("NONE" as const) : e.taxKind,
      priceSource: "RETAIL" as const,
      blackout: false,
      free: false,
      countsCapacity: false,
    };
    if (e.paxPrices) {
      for (const pt of seatPts) {
        const price = e.paxPrices[pt.code];
        if (price === undefined) continue;
        const n = qtyByPt.get(pt.id) ?? 0;
        const qty = n * mult; // ราคาต่อคนของ code นั้น × วัน/คืนตาม basis
        if (qty <= 0) continue;
        work.push({ ...base, itemRef: `extra:${e.id}:${pt.code}`, label: `${e.label} ${SEAT_LABEL_TH[pt.code] ?? pt.code}`.trim(), paxTypeId: pt.id, paxTypeCode: pt.code, qty, unitMinor: price, priceTrace: [trace("RETAIL", price, e.id)] });
      }
    } else {
      const qty = e.basis === "PER_PAX" || e.basis === "PER_PAX_DAY" ? totalPax * mult : reqN * mult;
      if (qty <= 0) continue;
      work.push({ ...base, itemRef: `extra:${e.id}`, label: e.label, paxTypeId: null, paxTypeCode: null, qty, unitMinor: e.priceMinor, priceTrace: [trace("RETAIL", e.priceMinor, e.id)] });
    }
  }
  // ── รับส่ง ──
  if (inp.pickup && inp.pickup.surchargeSatang > 0) {
    const def = lineDefaults.TRANSFER;
    const pt = def ? def.passThrough : false;
    work.push({
      itemRef: `pickup:${inp.pickup.zoneId}`,
      kind: "PICKUP",
      label: inp.pickup.label,
      paxTypeId: null,
      paxTypeCode: null,
      extraId: null,
      extraKind: "TRANSFER",
      qty: 1,
      unitMinor: inp.pickup.surchargeSatang,
      discountSatang: 0,
      agentDiscountSatang: 0,
      commissionBp: pt || !def ? 0 : def.commissionPct * 100,
      commissionable: !pt && !!def && def.commissionPct > 0,
      discountable: !pt && !!def && def.discountable,
      passThrough: pt,
      taxKind: pt ? "NONE" : seatTax,
      priceSource: "RETAIL",
      priceTrace: [trace("RETAIL", inp.pickup.surchargeSatang, inp.pickup.zoneId)],
      blackout: false,
      free: false,
      countsCapacity: false,
    });
  }

  // ── ขั้น 4 กฎราคา (ที่นั่งเท่านั้น) ──
  const rules: ParsedRule[] = [];
  for (const r of inp.rules) {
    const pr = tripPriceRuleParamsSchema.safeParse(r.params);
    if (!pr.success || pr.data.kind !== r.kind) continue;
    rules.push({ ...r, p: pr.data });
  }
  rules.sort(ruleCmp);
  const ruleLive = (r: ParsedRule) =>
    r.active && (r.productId === null || r.productId === inp.product.id) && inRange(travel, r.dateFrom, r.dateTo) && inRange(bookYmd, r.bookFrom, r.bookTo);
  const warnings: PricingWarning[] = [];
  const startsMs = Date.parse(dep.startsAt);
  const leadMs = startsMs - now.getTime();
  const daysAhead = tripDaysBetween(bookYmd, travel);
  let anyBlackout = false;
  for (const w of work) {
    if (w.passThrough) continue;
    const lineRef = { code: w.paxTypeCode, isSeat: w.kind === "SEAT" };
    const live = rules.filter((r) => ruleLive(r) && appliesTo(r.p, lineRef, dep.optionId, inp.channel));
    // BLACKOUT ครอบทุกบรรทัดที่ไม่ใช่เก็บแทน (งดโปรขั้น 7) · กฎขั้น 4 ใช้กับที่นั่งเท่านั้น
    w.blackout = live.some((r) => r.p.kind === "BLACKOUT" && (r.p.dates.includes(travel) || r.p.ranges.some((g) => g.from <= travel && travel <= g.to)));
    if (w.blackout) anyBlackout = true;
    if (w.blackout || w.kind !== "SEAT") continue;
    let win: { rule: ParsedRule; price: number } | null = null;
    for (const r of live) {
      const p = r.p;
      let price: number | null = null;
      if (p.kind === "EARLY_BIRD" && daysAhead >= p.minDaysBefore) price = discounted(w.unitMinor, p);
      else if (p.kind === "LAST_MINUTE" && leadMs > 0 && leadMs <= p.maxHoursBefore * 60 * MS_MIN) price = discounted(w.unitMinor, p);
      else if (p.kind === "GROUP_TIER") {
        const tier = [...p.tiers].reverse().find((t) => capacityPax >= t.minPax);
        if (tier) price = discounted(w.unitMinor, { discountBp: tier.discountBp });
      }
      if (price === null) continue;
      if (!win || price < win.price || (price === win.price && ruleCmp(r, win.rule) < 0)) win = { rule: r, price };
    }
    if (win) {
      w.unitMinor = win.price;
      w.priceSource = "RULE";
      w.priceTrace.push(trace("RULE", win.price, win.rule.id, win.rule.p.kind));
    }
  }
  if (anyBlackout) warnings.push(warn("BLACKOUT_APPLIED", "วันเดินทางนี้งดใช้ส่วนลดและโปรโมชัน", "NORMAL"));
  // FREE_LEADER — ซ้อนหลังตัวชนะ (กลุ่มครบ N คน ฟรี freeQty)
  for (const w of [...work]) {
    if (w.kind !== "SEAT" || w.blackout || w.free) continue;
    let best: { rule: ParsedRule; free: number } | null = null;
    for (const r of rules) {
      if (r.p.kind !== "FREE_LEADER" || !ruleLive(r) || r.p.paxTypeCode !== w.paxTypeCode || !appliesTo(r.p, { code: w.paxTypeCode, isSeat: true }, dep.optionId, inp.channel)) continue;
      const n = w.qty;
      const free = Math.min(n, divFloor(n, r.p.everyPaid) * r.p.freeQty);
      if (free > 0 && (!best || free > best.free)) best = { rule: r, free };
    }
    if (!best) continue;
    w.qty -= best.free;
    work.push({
      ...w,
      itemRef: `${w.itemRef}:free`,
      label: `${w.label} (ฟรี)`,
      qty: best.free,
      unitMinor: 0,
      discountable: false,
      priceSource: "RULE",
      priceTrace: [...w.priceTrace, trace("RULE", 0, best.rule.id, "FREE_LEADER")],
      free: true,
    });
  }
  for (let i = work.length - 1; i >= 0; i--) if (work[i].qty <= 0) work.splice(i, 1);

  // ── ขั้น 5–6 ระดับ/สัญญาเอเจนซี่ ──
  for (const w of work) {
    if (w.kind !== "SEAT" || w.free || !agency || w.paxTypeCode === null) continue;
    for (const [step, lv] of [["TIER", agency.tier], ["CONTRACT", agency.contract]] as const) {
      const price = lv?.unitMinorByPaxCode?.[w.paxTypeCode];
      if (lv && price !== undefined) {
        w.unitMinor = price;
        w.priceSource = step;
        w.priceTrace.push(trace(step, price, lv.refId));
      }
    }
  }

  // เรียงบรรทัด (ผลไม่ขึ้นกับลำดับอินพุต)
  work.sort((a, b) => KIND_RANK[a.kind] - KIND_RANK[b.kind] || cmpStr(a.itemRef, b.itemRef));

  // ── ขั้น 7 โปรโมชัน (บาทเท่านั้น · บรรทัดลดได้ที่ไม่ใช่เก็บแทน/ไม่โดนงด) ──
  let promo: PricedQuote["promo"] = null;
  const remainingOf = (w: Work) => w.unitMinor * w.qty - w.discountSatang;
  const applyDiscount = (lines: Work[], amounts: number[], refId: string, note: string) => {
    lines.forEach((w, i) => {
      if (amounts[i] <= 0) return;
      w.discountSatang += amounts[i];
      w.priceSource = "PROMO";
      w.priceTrace.push(trace("PROMO", amounts[i], refId, note));
    });
  };
  const promoWarn = (reason: string) => warnings.push(warn("PROMO_NOT_APPLIED", PROMO_TH[reason] ?? PROMO_TH.NOT_ELIGIBLE, "NORMAL", { reason }));
  const promoBase = (w: Work) => w.discountable && !w.passThrough && !w.blackout && !w.free;
  if (inp.promoCode !== null && inp.promoCode.trim() !== "") {
    const code = normCode(inp.promoCode);
    if (!thb) promoWarn("CURRENCY");
    else {
      const named = rules.filter((r) => r.p.kind === "PROMO_CODE" && normCode(r.p.code) === code && r.active);
      const forProduct = named.filter((r) => r.productId === null || r.productId === inp.product.id);
      const r = forProduct[0];
      if (named.length === 0) promoWarn("UNKNOWN");
      else if (!r) promoWarn("NOT_ELIGIBLE");
      else if (r.p.kind === "PROMO_CODE") {
        const p = r.p;
        if (p.validTo !== undefined && p.validTo < bookYmd) promoWarn("EXPIRED");
        else if (p.validFrom !== undefined && p.validFrom > bookYmd) promoWarn("NOT_YET");
        else if (p.maxUses !== undefined && r.usedCount >= p.maxUses) promoWarn("EXHAUSTED");
        else if (!inRange(travel, r.dateFrom, r.dateTo) || !inRange(bookYmd, r.bookFrom, r.bookTo)) promoWarn("NOT_ELIGIBLE");
        else {
          const elig = work.filter((w) => promoBase(w) && appliesTo(p, { code: w.paxTypeCode, isSeat: w.kind === "SEAT" }, dep.optionId, inp.channel) && remainingOf(w) > 0);
          if (elig.length === 0) promoWarn(work.some((w) => w.blackout && w.discountable) ? "BLACKOUT" : "NOT_ELIGIBLE");
          else {
            const amounts =
              p.discountBp !== undefined ? elig.map((w) => mulBpHalfUp(remainingOf(w), p.discountBp as number)) : allocateWithin(p.discountMinor ?? 0, elig.map(remainingOf));
            applyDiscount(elig, amounts, r.id, "PROMO_CODE");
            promo = { ruleId: r.id, discountSatang: sum(amounts) };
          }
        }
      }
    }
  }
  if (thb) {
    for (const pv of inp.promoProviders) {
      const elig = work.filter((w) => promoBase(w) && remainingOf(w) > 0);
      if (!elig.length || pv.discountSatang <= 0) continue;
      applyDiscount(elig, allocateWithin(pv.discountSatang, elig.map(remainingOf)), pv.ref, pv.key);
    }
  }

  // ── ขั้น 8 ราคาแก้มือ ──
  if (inp.overrides.length) {
    if (inp.actor === "PUBLIC" || inp.actor === "AGENT" || !inp.overrideGrant.canOverride) return fail("FORBIDDEN", null, "บัญชีนี้แก้ราคาเองไม่ได้ — ต้องได้สิทธิ์แก้ราคามือจากเจ้าของร้าน");
    const capPct = P["trips.price.manualOverrideApprovalPct"];
    for (const o of [...inp.overrides].sort((a, b) => cmpStr(a.itemRef, b.itemRef))) {
      if (o.reason.trim().length < 10) return fail("VALIDATION", "REASON_REQUIRED", undefined, { itemRef: o.itemRef });
      const w = work.find((x) => x.itemRef === o.itemRef);
      if (!w) return fail("VALIDATION", null, "ไม่พบบรรทัดที่จะแก้ราคา", { itemRef: o.itemRef });
      if (w.passThrough) return fail("VALIDATION", "PASS_THROUGH_LOCKED", undefined, { itemRef: o.itemRef });
      const resolved = w.unitMinor;
      let approvalId: string | null = null;
      if (o.unitMinor < resolved - mulBpHalfUp(resolved, capPct * 100)) {
        const ap = inp.overrideGrant.approvals.filter((a) => a.itemRef === o.itemRef && a.unitMinor === o.unitMinor).sort((a, b) => cmpStr(a.approvalId, b.approvalId))[0];
        if (!ap) {
          return fail("REQUIRES_APPROVAL", null, "ราคาที่แก้ต่ำกว่าราคาระบบเกินเพดาน — ต้องให้ผู้มีสิทธิ์อนุมัติก่อน", {
            entityType: "trips.price_override",
            itemRef: o.itemRef,
            resolvedMinor: resolved,
            requestedMinor: o.unitMinor,
          });
        }
        approvalId = ap.approvalId;
      }
      w.unitMinor = o.unitMinor;
      w.discountSatang = 0;
      w.priceSource = "MANUAL";
      w.priceTrace.push(trace("MANUAL", o.unitMinor, approvalId, "OVERRIDE"));
    }
  }

  // ── ยอดต่อบรรทัด ──
  const amountSatangOf = (w: Work) => toSatang(w.unitMinor * w.qty - w.discountSatang - w.agentDiscountSatang);

  // ── คอมมิชชัน (§4.1–§4.3) ──
  let commission: CommissionBlock | null = null;
  if (agency) {
    const level = agency.contract ?? agency.tier;
    const rateSource: "TIER" | "CONTRACT" = agency.contract ? "CONTRACT" : "TIER";
    const mode = level ? level.mode : "COMMISSION_PCT";
    const terms = agency.terms;
    const commLines = work.filter((w) => w.commissionable && !w.passThrough);
    const base = sum(commLines.map((w) => mulBpHalfUp(amountSatangOf(w) + w.agentDiscountSatang, w.commissionBp)));
    const paidSeats = sum(work.filter((w) => w.kind === "SEAT" && !w.free && w.countsCapacity).map((w) => w.qty));
    const gross =
      mode === "COMMISSION_PCT" ? (level && level.rateBp !== null ? mulBpHalfUp(base, level.rateBp) : 0) : mode === "COMMISSION_FIXED" ? (level?.fixedSatang ?? 0) * paidSeats : 0;
    // ส่วนลดจากคอมฯ (A24)
    const agentDisc = inp.agentDiscountSatang;
    if (agentDisc > 0) {
      const capBp = terms.discountFromCommission.capPct * 100;
      if (!thb || !terms.discountFromCommission.enabled || agentDisc > mulBpHalfUp(gross, capBp)) {
        return fail("DISCOUNT_OVER_CAP", null, "ส่วนลดจากค่าคอมมิชชันเกินเพดานที่สัญญากำหนด", { capSatang: terms.discountFromCommission.enabled ? mulBpHalfUp(gross, capBp) : 0 });
      }
      const elig = commLines.filter((w) => amountSatangOf(w) > 0);
      const alloc = allocateWithin(agentDisc, elig.map(amountSatangOf));
      elig.forEach((w, i) => (w.agentDiscountSatang += alloc[i]));
    }
    const gAfter = gross - (agentDisc > 0 ? agentDisc : 0);
    const vr = terms.vatRateBp;
    let C = gAfter;
    let Vc = 0;
    if (terms.vatMode === "INCLUSIVE") {
      C = mulDivHalfUp(gAfter, BP_UNIT, BP_UNIT + vr);
      Vc = gAfter - C;
    } else if (terms.vatMode === "EXCLUSIVE") {
      Vc = vatOfExclusive(C, vr);
    }
    const wht = terms.wht;
    let whtSatang: number | null = 0;
    if (wht.mode === "PROGRESSIVE_50_1" && wht.applies) whtSatang = null;
    else if (wht.applies && wht.mode === "RATE" && wht.rateBp !== null && (wht.continuous === "EVERY_PAYMENT" || C >= wht.minPerContractSatang)) whtSatang = mulBpHalfUp(C, wht.rateBp);
    commission = {
      agentAccountId: agency.agentAccountId,
      agentTierId: agency.agentTierId,
      mode,
      rateSource,
      refId: level ? level.refId : null,
      baseSatang: base,
      rateBp: level ? level.rateBp : null,
      fixedSatang: level ? level.fixedSatang : null,
      commissionSatang: C,
      commissionInclVatSatang: C + Vc,
      collectMode: terms.collector,
      sellerOfRecord: terms.sellerOfRecord,
      vatMode: terms.vatMode,
      vatRateBp: vr,
      agencyVatRegistered: agency.vatRegistered,
      commissionVatSatang: Vc,
      earnedAt: terms.earnedAt,
      clawbackRule: terms.clawbackOnCancel ? "CLAWBACK_PRO_RATA" : "NO_CLAWBACK",
      wht: {
        applies: wht.applies,
        payerType: wht.payerType,
        payeeType: wht.payeeType,
        mode: wht.mode,
        rateBp: wht.rateBp,
        eWht: wht.eWht,
        whtSatang,
        grossUp: wht.grossUp,
        remitter: wht.remitter,
        minPerContractSatang: wht.minPerContractSatang,
        continuous: wht.continuous,
      },
      agentDiscountSatang: agentDisc,
      agentActualSaleSatang: terms.actualSaleSatang,
      collectFromCustomerSatang: 0,
      remitToShopSatang: 0,
      agentEarnsSatang: C,
      currency: "THB",
    };
  }

  // ── ประกอบบรรทัด + VAT ต่อเอกสาร ──
  const items: PricedItem[] = work.map((w) => {
    const grossMinor = w.unitMinor * w.qty;
    const amountMinor = grossMinor - w.discountSatang - w.agentDiscountSatang;
    return {
      itemRef: w.itemRef,
      kind: w.kind,
      label: w.label,
      paxTypeId: w.paxTypeId,
      paxTypeCode: w.paxTypeCode,
      extraId: w.extraId,
      qty: w.qty,
      unitMinor: w.unitMinor,
      grossMinor,
      discountSatang: w.discountSatang,
      agentDiscountSatang: w.agentDiscountSatang,
      amountMinor,
      amountSatang: toSatang(amountMinor),
      vatSatang: 0,
      commissionBp: w.commissionBp,
      commissionable: w.commissionable,
      discountable: w.discountable,
      passThrough: w.passThrough,
      taxKind: w.taxKind,
      priceSource: w.priceSource,
      priceTrace: w.priceTrace,
    };
  });
  const vatRegistered = P["trips.tax.vatRegistered"].registered;
  if (vatRegistered === null) warnings.push(warn("VAT_STATUS_UNKNOWN", "ยังไม่ระบุว่าร้านจดทะเบียน VAT หรือไม่ — ระบบคิดแบบจด VAT ไว้ก่อน", "HIGH"));
  const incl = P["trips.tax.priceIncludesVat"];
  const vatRateBp = P["trips.tax.vatRate"].rateBp;
  const vatLines = items.filter((i) => i.taxKind === "VAT7");
  const vatable = sum(vatLines.map((i) => i.amountSatang));
  const vat = vatRegistered === false ? 0 : incl ? vatOfInclusive(vatable, vatRateBp) : vatOfExclusive(vatable, vatRateBp);
  const vatAlloc = allocateLastRemainder(vat, vatLines.map((i) => i.amountSatang));
  vatLines.forEach((i, k) => (i.vatSatang = vatAlloc[k]));
  const passThroughSatang = sum(items.filter((i) => i.passThrough).map((i) => i.amountSatang));
  const amountSum = sum(items.map((i) => i.amountSatang));
  const payable = amountSum + (incl ? 0 : vat);
  const discountSatang = sum(items.map((i) => i.discountSatang));
  const agentDiscountSatang = sum(items.map((i) => i.agentDiscountSatang));
  const totals: PricedTotals = {
    grossSatang: amountSum + discountSatang + agentDiscountSatang,
    discountSatang,
    agentDiscountSatang,
    passThroughSatang,
    vatableSatang: vatable,
    vatBaseSatang: incl ? vatable - vat : vatable,
    vatSatang: vat,
    payableSatang: payable,
  };

  // ── คอมฯ: ยอดส่งร้าน · ราคาขายจริง ──
  if (commission && agency) {
    const level = agency.contract ?? agency.tier;
    const W = commission.wht.whtSatang ?? 0;
    commission.collectFromCustomerSatang = payable;
    commission.remitToShopSatang = payable - commission.commissionSatang - commission.commissionVatSatang + (commission.wht.grossUp ? W : 0);
    const actual = agency.terms.actualSaleSatang;
    const seats = sum(items.filter((i) => i.kind === "SEAT" && !i.itemRef.endsWith(":free")).map((i) => i.qty));
    const seatNetMinor = sum(items.filter((i) => i.kind === "SEAT").map((i) => i.amountSatang));
    if (level && (level.mode === "NET" || level.mode === "MARKUP" || level.minSellMinor !== null)) {
      if (actual === null) warnings.push(warn("AGENT_ACTUAL_SALE_MISSING", "เอเจนซี่ยังไม่กรอกราคาขายจริงให้ลูกค้า", "NORMAL"));
      else {
        if (level.minSellMinor !== null && actual < level.minSellMinor * seats) return fail("BELOW_MIN_SELL_PRICE", null, "ราคาขายจริงต่ำกว่าราคาขายขั้นต่ำตามสัญญาเอเจนซี่");
        if (level.mode === "MARKUP" && level.markupCapBp !== null && actual * BP_UNIT > seatNetMinor * (BP_UNIT + level.markupCapBp)) return fail("VALIDATION", "MARKUP_OVER_CAP");
      }
      if (level.mode === "NET" || level.mode === "MARKUP") commission.agentEarnsSatang = actual === null ? 0 : Math.max(0, actual - seatNetMinor);
    }
  }

  // ── คำเตือนต้นทุน (W22) ──
  const seatItems = items.filter((i) => i.kind === "SEAT");
  const seatNet = sum(seatItems.map((i) => i.amountSatang)) - (commission ? commission.commissionSatang : 0);
  const seatPax = sum(work.filter((w) => w.kind === "SEAT" && w.countsCapacity).map((w) => w.qty));
  const D = Math.max(dep.minPax ?? 1, dep.sold + dep.held + seatPax);
  if (dep.costSatang > 0 && seatPax > 0 && seatNet * 100 * D < dep.costSatang * (100 + P["trips.price.costWarnMarginPct"]) * seatPax) {
    warnings.push(warn("W22", "ราคาต่อคนต่ำกว่าต้นทุนรอบ — ตรวจราคาก่อนยืนยัน", "HIGHEST"));
  }
  // ── W05 ค่าอุทยานไม่ตรงตาราง T45 ──
  if (thb) {
    const park = P["trips.parkFee.table"];
    const known = new Set<number>();
    for (const g of park.groups) [g.thaiChildSatang, g.thaiAdultSatang, g.foreignChildSatang, g.foreignAdultSatang].forEach((x) => known.add(x));
    for (const s of park.shopRates ?? []) [s.adultSatang, s.childSatang, ...(s.diverSatang === null ? [] : [s.diverSatang])].forEach((x) => known.add(x));
    const bad = work.filter((w) => w.extraKind === "PARK_FEE" && !known.has(w.unitMinor)).map((w) => w.itemRef);
    if (bad.length) warnings.push(warn("W05", "ค่าอุทยานต่อคนไม่ตรงกับตารางค่าอุทยานในค่าตั้ง — ตรวจอัตราอีกครั้ง", "HIGH", { itemRefs: bad }));
  }

  // ── งวดจ่าย (T13 T14 T15) ──
  const depositPct = P["trips.pay.depositPct"];
  const balDays = P["trips.pay.balanceDueDaysBefore"];
  const dueYmd = balDays === null ? null : tripAddDays(travel, -balDays);
  const nowIso = now.toISOString();
  let schedule: ScheduleRow[];
  if (dueYmd === null || depositPct >= 100 || dueYmd <= bookYmd || payable <= 0) {
    schedule = [{ seq: 1, kind: "BALANCE", amountSatang: payable, vatableSatang: payable - passThroughSatang, passThroughSatang, dueAt: nowIso }];
  } else {
    const nonPt = payable - passThroughSatang;
    let dep1: number;
    let dep1Pt: number;
    if (P["trips.pay.depositBase"] === "TRIP_ONLY") {
      dep1 = mulBpHalfUp(nonPt, depositPct * 100);
      dep1Pt = 0;
    } else {
      dep1 = mulBpHalfUp(payable, depositPct * 100);
      dep1Pt = mulDivHalfUp(passThroughSatang, dep1, payable);
    }
    const bal = payable - dep1;
    const balPt = passThroughSatang - dep1Pt;
    schedule = [
      { seq: 1, kind: "DEPOSIT", amountSatang: dep1, vatableSatang: dep1 - dep1Pt, passThroughSatang: dep1Pt, dueAt: nowIso },
      { seq: 2, kind: "BALANCE", amountSatang: bal, vatableSatang: bal - balPt, passThroughSatang: balPt, dueAt: tripLocalToUtcIso(tz, dueYmd, 1439) },
    ];
  }

  const cancelLadder = [...P["trips.cancel.ladder"]].sort((a, b) => b.fromDaysBefore - a.fromDaysBefore).map((s) => ({ daysBefore: s.fromDaysBefore, refundBp: s.refundPct * 100 }));
  const scr = P["trips.cancel.shopCancelRefund"];
  return {
    ok: true,
    value: {
      currency,
      fx: thb ? null : { rateMicros, source: "SETTING", effectiveFrom: bookYmd },
      items,
      totals,
      commission,
      paymentSchedule: schedule,
      cancelLadder,
      cancelMinimumLadder: null,
      shopCancelRefundBpByReason: { EXTERNAL: scr.EXTERNAL * 100, MIN_NOT_MET: scr.MIN_NOT_MET * 100, SHOP_FAULT: scr.SHOP_FAULT * 100 },
      promo,
      warnings: warnings.sort((a, b) => cmpStr(a.code, b.code)),
    },
  };
}

// ═══════════════ ลายนิ้วมือราคา (ข้อความ canonical — แฮชทำใน pricing.ts) ═══════════════
function canon(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v) ?? "null";
  if (Array.isArray(v)) return `[${v.map(canon).join(",")}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o)
    .filter((k) => o[k] !== undefined)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${canon(o[k])}`)
    .join(",")}}`;
}
/** ข้อความแทนคำขอ + ราคาที่ได้ (ไม่รวมเวลา) — ค่าเท่าเดิม = ข้อความเดิม · ราคาเปลี่ยน = ข้อความใหม่ */
export function priceFingerprint(input: Pick<TripPricingInput, "unitId" | "channel" | "actor" | "currency" | "product" | "departure" | "pax" | "requestedExtras" | "pickup" | "promoCode"> & { agency?: { agentAccountId: string } | null }, priced: PricedQuote): string {
  return canon({
    v: 1,
    unitId: input.unitId,
    channel: input.channel,
    actor: input.actor,
    currency: input.currency,
    productId: input.product.id,
    departureId: input.departure.id,
    pax: [...input.pax].map((p) => [p.paxTypeId, p.qty]).sort(),
    extras: [...input.requestedExtras].map((e) => [e.extraId, e.qty]).sort(),
    pickup: input.pickup ? input.pickup.zoneId : null,
    promo: input.promoCode ? normCode(input.promoCode) : null,
    agent: input.agency ? input.agency.agentAccountId : null,
    items: priced.items.map((i) => [i.itemRef, i.qty, i.unitMinor, i.discountSatang, i.agentDiscountSatang, i.amountSatang, i.vatSatang, i.priceSource]),
    totals: priced.totals,
    commission: priced.commission ? [priced.commission.commissionSatang, priced.commission.commissionVatSatang, priced.commission.remitToShopSatang] : null,
    schedule: priced.paymentSchedule.map((s) => [s.kind, s.amountSatang, s.dueAt]),
    ladder: priced.cancelLadder,
    fx: priced.fx,
  });
}
