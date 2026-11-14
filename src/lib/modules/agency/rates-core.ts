// ─────────────────────────────────────────────────────────────
// agency/rates-core.ts — ส่วนบริสุทธิ์ของราคาเอเจนซี่ (RUN TRIPS A1.3a · ใบสั่ง ledger/trips-briefs/A1.3.md §3 §4 §5)
//   ค่าคงที่ · ตรวจรูปแถวราคา · ตัวกันช่วงซ้อน · ตัวเลือกชั้นเอเจนซี่ (CC §F.1 ขั้น 5–6) · แปลงค่าตั้ง → terms
//
// 🔴 บริสุทธิ์: นำเข้าได้เฉพาะ zod + ชนิด · ไม่อ่านนาฬิกา/ฐาน/สภาพแวดล้อม · ไม่แก้อินพุต
// 🔴 ไม่มีสูตรเงิน: ฐานคอมฯ · คอมฯ · VAT · หัก ณ ที่จ่าย · ยอดส่งร้าน · ปัดเศษ เป็นของตัวคิดราคา T0.5 (trips/pricing-core.ts)
//    ไฟล์นี้ "เลือกแถวราคา" และ "ส่งค่าตั้งต่อ" เท่านั้น — เงิน/อัตราเป็นจำนวนเต็มทุกช่อง
// 🔴 ผลของตัวเลือกต้องไม่ขึ้นกับลำดับอินพุต (§5.2) และต้องไม่ใช้ card ของระดับ/เอเจนซี่อื่นแม้ถูกส่งเข้ามา (§5.1)
// ─────────────────────────────────────────────────────────────
import { z } from "zod";

// ═══════════════ ค่าคงที่ (§3) ═══════════════
export const AGENT_TIER_CODES = ["A", "B", "C"] as const;
export type AgentTierCode = (typeof AGENT_TIER_CODES)[number];
export const AGENT_RATE_MODES = ["COMMISSION_PCT", "COMMISSION_FIXED", "NET", "MARKUP"] as const;
export type AgentRateMode = (typeof AGENT_RATE_MODES)[number];
export const AGENT_RATE_CARD_STATUSES = ["DRAFT", "ACTIVE", "ARCHIVED"] as const;
export type AgentRateCardStatus = (typeof AGENT_RATE_CARD_STATUSES)[number];
export const AGENT_RATE_CARD_ACTIONS = ["ACTIVATE", "ARCHIVE"] as const;
export type AgentRateCardAction = (typeof AGENT_RATE_CARD_ACTIONS)[number];

/** DRAFT→ACTIVE · DRAFT→ARCHIVED · ACTIVE→ARCHIVED · อื่น null (ARCHIVED = จบ — สร้างใหม่ด้วย copyFromCardId) */
export function rateCardTransition(from: AgentRateCardStatus, action: AgentRateCardAction): AgentRateCardStatus | null {
  if (action === "ACTIVATE") return from === "DRAFT" ? "ACTIVE" : null;
  if (action === "ARCHIVE") return from === "DRAFT" || from === "ACTIVE" ? "ARCHIVED" : null;
  return null;
}

/** ตารางเดียวที่อนุญาตให้มีค่าคงที่ในใบนี้ */
export const AGENT_RATE_LIMITS = {
  cardsPerOwner: 20,
  ratesPerCard: 500,
  cardNameMax: 80,
  listMax: 100,
  tryPaxLines: 20,
  draftRatesMax: 200,
  markupCapBpMax: 100_000,
  priorityMax: 1000,
  /** มติ R3 ของ A1.1: เทอมเครดิตของระดับ A (วัน · A12) — มติ Z9 ย้ายเข้าตารางนี้ */
  tierACreditDays: 30,
} as const;

export const AGENT_RATE_REASONS = [
  "BAD_INPUT",
  "BAD_RANGE",
  "MODE_VALUE_MISMATCH",
  "PAX_RATE_COMMISSION",
  /** มติ V3: ขั้นต่ำตั้งได้เฉพาะแถวที่ไม่ระบุประเภทคน — ข้อความ (A1.3b): "ขั้นต่ำการขายตั้งได้ที่แถวราคาที่ไม่ระบุประเภทคน — โปรดย้ายขั้นต่ำไปไว้ที่แถวนั้น" */
  "PAX_RATE_MIN_SELL",
  "CABIN_RATE_NOT_SUPPORTED",
  "KIND_NOT_SUPPORTED",
  "PRODUCT_NOT_FOUND",
  "CURRENCY_MISMATCH",
  "MIN_SELL_BELOW_NET",
  "RATE_OVERLAP",
  "CARD_OVERLAP",
  "CARD_ARCHIVED",
  "LIMIT_REACHED",
  "TIER_NOT_FOUND",
  "ACCOUNT_NOT_ACTIVE",
  "SETTINGS_INVALID",
  "STATE_CONFLICT",
  "MIXED_MODES",
  "ACCOUNT_NOT_IN_UNIT",
] as const;
export type AgentRateReason = (typeof AGENT_RATE_REASONS)[number];

/** DTO ฝั่งร้าน (รายการ: ไม่มี rates) */
export const SHOP_RATE_CARD_KEYS = ["id", "ownerKind", "tierCode", "agentAccountId", "name", "status", "validFrom", "validTo", "priority", "version", "rateCount", "rates", "createdAt", "updatedAt"] as const;
export const SHOP_RATE_KEYS = [
  "id", "productKind", "productId", "optionId", "paxTypeId", "mode", "valueBp", "valueMinor", "currency", "minSellMinor", "markupCapBp",
  "bookFrom", "bookTo", "travelFrom", "travelTo", "priority", "active", "specialPeriod", "updatedAt",
] as const;
/** คีย์ชั้นบนของ AuditLog.after — before/after ชั้นในมีได้เฉพาะคอลัมน์ตัวเลข/วันที่/โหมด (ไม่มีชื่อ) */
export const AGENT_RATE_AUDIT_KEYS = ["cardId", "rateId", "version", "from", "to", "fields", "before", "after", "ownerKind", "tierCode", "agentAccountId", "copiedFrom", "count"] as const;

// ═══════════════ ชนิด ═══════════════
/** วันที่ = "YYYY-MM-DD" */
export type RateRow = {
  id: string;
  rateCardId: string;
  productKind: string;
  productId: string;
  optionId: string | null;
  paxTypeId: string | null;
  cabinTypeId: string | null;
  mode: AgentRateMode;
  valueBp: number | null;
  valueMinor: number | null;
  currency: string;
  minSellMinor: number | null;
  markupCapBp: number | null;
  bookFrom: string | null;
  bookTo: string | null;
  travelFrom: string | null;
  travelTo: string | null;
  priority: number;
  active: boolean;
};
export type NormalizedAgentRate = Omit<RateRow, "id" | "rateCardId">;
export type RateCardRow = {
  id: string;
  ownerKind: "TIER" | "AGENT";
  tierId: string | null;
  agentAccountId: string | null;
  status: string;
  validFrom: string | null;
  validTo: string | null;
  version: number;
  priority: number;
  rates: RateRow[];
};
export type RateFacts = {
  account: { id: string; tierId: string | null; tierCode: AgentTierCode | null; payeeType: string; vatRegistered: boolean };
  /** optionId = ของรอบ */
  product: { id: string; productType: "TOUR" | "LIVEABOARD" | "ATTRACTION"; optionId: string | null; paxTypes: { id: string; code: string }[] };
  /** สกุลของการจอง */
  currency: string;
  /** วันจองตามเขตเวลาของหน่วย */
  bookYmd: string;
  /** วันเดินทาง (localDate ของรอบ) */
  travelYmd: string;
  /** card ทั้งหมดที่โหลดมา — ตัวเลือกกรองเอง */
  cards: RateCardRow[];
  /** snapshot "agency.booking" */
  policy: { values: Record<string, unknown>; sources: Record<string, string> };
  /** อัตรา VAT ของร้าน (trips.tax.vatRate.rateBp) */
  vatRateBp: number;
};
/** รูปของ trips `agencyPricingInputSchema` (LEVEL) ตรงตัว — ประกาศชนิดเอง ไม่นำเข้าค่า */
export type AgencyLevelInput = {
  refId: string;
  mode: AgentRateMode;
  rateBp: number | null;
  fixedSatang: number | null;
  unitMinorByPaxCode: Record<string, number> | null;
  minSellMinor: number | null;
  markupCapBp: number | null;
};
export type CommissionVatMode = "NONE" | "EXCLUSIVE" | "INCLUSIVE";
/** รูปของ trips `agencyPricingInputSchema.terms` ตรงตัว */
export type AgencyTermsInput = {
  collector: "SHOP_COLLECTS" | "AGENT_COLLECTS";
  sellerOfRecord: "SHOP_PRINCIPAL" | "AGENT_RESELLS";
  vatMode: CommissionVatMode;
  vatRateBp: number;
  wht: {
    applies: boolean;
    mode: "RATE" | "PROGRESSIVE_50_1" | "NONE_FOREIGN" | "NONE";
    rateBp: number | null;
    eWht: boolean;
    grossUp: boolean;
    minPerContractSatang: number;
    continuous: string;
    remitter: "SHOP" | "AGENT_ON_BEHALF" | "NONE";
    payerType: string;
    payeeType: string;
  };
  discountFromCommission: { enabled: boolean; capPct: number };
  earnedAt: "AFTER_TRAVEL" | "ON_CONFIRM";
  clawbackOnCancel: boolean;
  actualSaleSatang: number | null;
};
export type LayerTrace = { source: "TIER_DEFAULT" | "TIER_CARD" | "AGENT_CARD"; cardId: string | null; cardVersion: number | null; rateId: string | null; mode: AgentRateMode; specialPeriod: boolean };
export type RateTrace = {
  tier: LayerTrace | null;
  contract: LayerTrace | null;
  applied: "CONTRACT" | "TIER" | "NONE";
  vat: { mode: CommissionVatMode; decidedBy: "NOT_REGISTERED" | "DEFAULT_REGISTERED" | "SETTING" };
};
export type AgencyPricingBuiltInput = { agentAccountId: string; agentTierId: string | null; vatRegistered: boolean; tier: AgencyLevelInput | null; contract: AgencyLevelInput | null; terms: AgencyTermsInput };
export type AgencyPricingBuilt = { ok: true; input: AgencyPricingBuiltInput; trace: RateTrace; warnings: string[] } | { ok: false; reason: "SETTINGS_INVALID" };

// ═══════════════ ตัวช่วยรูปแบบ ═══════════════
const INT4_MAX = 2_147_483_647;
const BP_MAX = 10_000;
const PCT_MAX = 100;
const PCT_TO_BP = 100;
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const YMD_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
/** มติ Z8: วันที่ทุกช่องของใบนี้อยู่ในปี 1900–2200 (นอกช่วง ⇒ BAD_INPUT ไม่ถึงฐานข้อมูล) */
const YEAR_MIN = 1900;
const YEAR_MAX = 2200;
const isRec = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const hasOwn = (o: object, k: string): boolean => Object.prototype.hasOwnProperty.call(o, k);
const isInt = (v: unknown, min: number, max: number): v is number => typeof v === "number" && Number.isInteger(v) && v >= min && v <= max;
/** วันจริงรูป YYYY-MM-DD ในปี 1900–2200 (ไม่อ่านนาฬิกา) — ตัวตรวจวันที่ตัวเดียวของใบนี้ (มติ Z8) */
export function isAgentRateYmd(s: unknown): s is string {
  if (typeof s !== "string") return false;
  const m = YMD_RE.exec(s);
  if (!m) return false;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (y < YEAR_MIN || y > YEAR_MAX) return false;
  if (mo < 1 || mo > 12 || d < 1) return false;
  const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  const dim = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][mo - 1];
  return d <= dim;
}
/** มติ V4: ISO 8601 วันที่+เวลาเท่านั้น — `YYYY-MM-DDTHH:mm[:ss[.fff…]]` + โซน `Z` หรือ `±hh:mm` */
const INSTANT_RE = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,9})?)?(?:Z|([+-])(\d{2}):(\d{2}))$/;
const HOUR_MS = 3_600_000;
const MINUTE_MS = 60_000;
/** เวลา ISO (เช่น วันจองสมมติ · expectedUpdatedAt) ที่ตกอยู่ในปี 1900–2200 (มติ Z8) · รูปอื่น (ไม่มีเวลา/ไม่มีโซน/รูปที่ Date.parse เดาได้) ⇒ false (มติ V4) */
export function isAgentRateInstant(s: unknown): s is string {
  if (typeof s !== "string" || s.length > 40) return false;
  const m = INSTANT_RE.exec(s);
  if (!m) return false;
  const ymd = m[1];
  const hh = Number(m[2]);
  const mi = Number(m[3]);
  const ss = m[4] === undefined ? 0 : Number(m[4]);
  if (!isAgentRateYmd(ymd) || hh > 23 || mi > 59 || ss > 59) return false;
  let offsetMs = 0;
  if (m[5] !== undefined) {
    const oh = Number(m[6]);
    const om = Number(m[7]);
    if (oh > 23 || om > 59) return false;
    offsetMs = (m[5] === "-" ? -1 : 1) * (oh * HOUR_MS + om * MINUTE_MS);
  }
  // วันตาม UTC (ขอบโซนอาจข้ามวัน/ปี) — คิดจากส่วนประกอบเอง ไม่ส่งสตริงให้ Date.parse
  const localMs = Date.UTC(Number(ymd.slice(0, 4)), Number(ymd.slice(5, 7)) - 1, Number(ymd.slice(8, 10))) + hh * HOUR_MS + mi * MINUTE_MS;
  const utcDay = new Date(localMs - offsetMs);
  return isAgentRateYmd(`${String(utcDay.getUTCFullYear()).padStart(4, "0")}-${String(utcDay.getUTCMonth() + 1).padStart(2, "0")}-${String(utcDay.getUTCDate()).padStart(2, "0")}`);
}

// ═══════════════ §4.1 ตรวจรูปแถวราคา ═══════════════
const Z_ID = z.string().regex(ID_RE);
const Z_OPT_ID = Z_ID.nullable().optional();
const zInt = (max: number) => z.number().int().min(0).max(max);
const Z_YMD = z.string().refine(isAgentRateYmd).nullable().optional();
const RAW_RATE = z
  .object({
    productKind: z.enum(["TRIP", "TICKET", "HOTEL"]),
    productId: Z_ID,
    optionId: Z_OPT_ID,
    paxTypeId: Z_OPT_ID,
    cabinTypeId: Z_OPT_ID,
    mode: z.enum(AGENT_RATE_MODES),
    valueBp: zInt(BP_MAX).nullable().optional(),
    valueMinor: zInt(INT4_MAX).nullable().optional(),
    currency: z.string().regex(/^[A-Z]{3}$/).optional(),
    minSellMinor: zInt(INT4_MAX).nullable().optional(),
    markupCapBp: zInt(AGENT_RATE_LIMITS.markupCapBpMax).nullable().optional(),
    bookFrom: Z_YMD,
    bookTo: Z_YMD,
    travelFrom: Z_YMD,
    travelTo: Z_YMD,
    priority: zInt(AGENT_RATE_LIMITS.priorityMax).optional(),
    active: z.boolean().optional(),
  })
  .strict();

/**
 * ตรวจ + เติมค่าปริยายของแถวราคา (ไม่ throw) — ช่องแปลก/ชนิดผิด/ทศนิยม/เกินขีด/วันที่ไม่มีจริง ⇒ BAD_INPUT
 * ลำดับเหตุ: BAD_INPUT → KIND_NOT_SUPPORTED → CABIN_RATE_NOT_SUPPORTED → MODE_VALUE_MISMATCH → PAX_RATE_COMMISSION → PAX_RATE_MIN_SELL → CURRENCY_MISMATCH → MIN_SELL_BELOW_NET → BAD_RANGE
 */
export function normalizeAgentRate(raw: unknown): { ok: true; rate: NormalizedAgentRate } | { ok: false; reason: AgentRateReason } {
  const bad = (reason: AgentRateReason) => ({ ok: false as const, reason });
  if (!isRec(raw)) return bad("BAD_INPUT");
  const proto: unknown = Object.getPrototypeOf(raw);
  if (proto !== null && proto !== Object.prototype) return bad("BAD_INPUT");
  const p = RAW_RATE.safeParse(raw);
  if (!p.success) return bad("BAD_INPUT");
  const d = p.data;
  const valueBp = d.valueBp ?? null;
  const valueMinor = d.valueMinor ?? null;
  const minSellMinor = d.minSellMinor ?? null;
  const markupCapBp = d.markupCapBp ?? null;
  const paxTypeId = d.paxTypeId ?? null;
  const cabinTypeId = d.cabinTypeId ?? null;
  const currency = d.currency ?? "THB";
  if (d.productKind !== "TRIP") return bad("KIND_NOT_SUPPORTED");
  if (cabinTypeId !== null) return bad("CABIN_RATE_NOT_SUPPORTED");
  const commission = d.mode === "COMMISSION_PCT" || d.mode === "COMMISSION_FIXED";
  if (d.mode === "COMMISSION_PCT" && (valueBp === null || valueMinor !== null || markupCapBp !== null || minSellMinor !== null)) return bad("MODE_VALUE_MISMATCH");
  if (d.mode === "COMMISSION_FIXED" && (valueMinor === null || valueBp !== null || markupCapBp !== null || minSellMinor !== null)) return bad("MODE_VALUE_MISMATCH");
  if (d.mode === "NET" && (valueMinor === null || valueBp !== null || markupCapBp !== null)) return bad("MODE_VALUE_MISMATCH");
  if (d.mode === "MARKUP" && (valueMinor === null || valueBp !== null || markupCapBp === null)) return bad("MODE_VALUE_MISMATCH");
  if (commission && paxTypeId !== null) return bad("PAX_RATE_COMMISSION");
  // มติ V3: Level ของ T0.5 มีขั้นต่ำค่าเดียวต่อทุกประเภทคน ⇒ ขั้นต่ำต้องอยู่บนแถวไม่ระบุประเภทคน (ครอบบันทึก · ร่าง · แก้ด้วย id — ทุกทางผ่านฟังก์ชันนี้)
  if (paxTypeId !== null && minSellMinor !== null) return bad("PAX_RATE_MIN_SELL");
  if (d.mode === "COMMISSION_FIXED" && currency !== "THB") return bad("CURRENCY_MISMATCH");
  if (!commission && minSellMinor !== null && valueMinor !== null && minSellMinor < valueMinor) return bad("MIN_SELL_BELOW_NET");
  const bookFrom = d.bookFrom ?? null;
  const bookTo = d.bookTo ?? null;
  const travelFrom = d.travelFrom ?? null;
  const travelTo = d.travelTo ?? null;
  if ((bookFrom !== null && bookTo !== null && bookTo < bookFrom) || (travelFrom !== null && travelTo !== null && travelTo < travelFrom)) return bad("BAD_RANGE");
  return {
    ok: true,
    rate: {
      productKind: d.productKind,
      productId: d.productId,
      optionId: d.optionId ?? null,
      paxTypeId,
      cabinTypeId,
      mode: d.mode,
      valueBp,
      valueMinor,
      currency,
      minSellMinor,
      markupCapBp,
      bookFrom,
      bookTo,
      travelFrom,
      travelTo,
      priority: d.priority ?? 0,
      active: d.active ?? true,
    },
  };
}

// ═══════════════ §4.2 ช่วงวัน ═══════════════
/** ช่วงปิดสองด้าน · null = ไม่จำกัด · `to = D` กับ `from = D` ซ้อน · `to = D` กับ `from = D+1` ไม่ซ้อน */
export function dateRangesOverlap(aFrom: string | null, aTo: string | null, bFrom: string | null, bTo: string | null): boolean {
  const aStartsBeforeBEnds = aFrom === null || bTo === null || aFrom <= bTo;
  const bStartsBeforeAEnds = bFrom === null || aTo === null || bFrom <= aTo;
  return aStartsBeforeBEnds && bStartsBeforeAEnds;
}
/** แถวที่มีขอบวันอย่างน้อยหนึ่งช่อง = ช่วงพิเศษ */
export function isSpecialPeriodRate(r: Pick<RateRow, "bookFrom" | "bookTo" | "travelFrom" | "travelTo">): boolean {
  return r.bookFrom !== null || r.bookTo !== null || r.travelFrom !== null || r.travelTo !== null;
}
/**
 * ชนกันเมื่อ: เปิดทั้งคู่ · เป็นช่วงพิเศษทั้งคู่ · card เดียวกัน · มิติเท่ากัน (null = null) · priority เท่ากัน · ช่วงวันจองซ้อน **และ** ช่วงวันเดินทางซ้อน
 * (แถวไม่มีขอบวันกับช่วงพิเศษไม่ชน — ช่วงพิเศษชนะตาม §5.2 · ต่าง priority ซ้อนได้ — ตัวสูงชนะ)
 */
export function rateRowsConflict(a: RateRow, b: RateRow): boolean {
  if (!a.active || !b.active) return false;
  if (!isSpecialPeriodRate(a) || !isSpecialPeriodRate(b)) return false;
  if (a.rateCardId !== b.rateCardId) return false;
  if (a.productKind !== b.productKind || a.productId !== b.productId || a.optionId !== b.optionId || a.paxTypeId !== b.paxTypeId || a.cabinTypeId !== b.cabinTypeId) return false;
  if (a.priority !== b.priority) return false;
  return dateRangesOverlap(a.bookFrom, a.bookTo, b.bookFrom, b.bookTo) && dateRangesOverlap(a.travelFrom, a.travelTo, b.travelFrom, b.travelTo);
}
/**
 * มติ Z5 (ก): ใน card เดียว แถวที่เปิดของสินค้า/ตัวเลือก/priority เดียวกันต้องเป็นโหมดเดียว (ทุกช่วงวัน · ทุกประเภทคน)
 * — คู่ที่ทำให้ปน ⇒ บริการ/เครื่องลองคิดปฏิเสธ VALIDATION MIXED_MODES
 */
export function rateRowsMixModes(a: RateRow, b: RateRow): boolean {
  if (!a.active || !b.active || a.rateCardId !== b.rateCardId) return false;
  if (a.productKind !== b.productKind || a.productId !== b.productId || a.optionId !== b.optionId || a.priority !== b.priority) return false;
  return a.mode !== b.mode;
}

// ═══════════════ §5.1–§5.3 ตัวเลือกชั้นเอเจนซี่ ═══════════════
type Picked = { r: RateRow; c: RateCardRow };
const inRange = (d: string, from: string | null, to: string | null): boolean => (from === null || from <= d) && (to === null || d <= to);
/** หลังสุดก่อน · null ท้าย */
const laterFirst = (a: string | null, b: string | null): number => (a === b ? 0 : a === null ? 1 : b === null ? -1 : a > b ? -1 : 1);
const flag = (b: boolean): number => (b ? 1 : 0);
const cmpStr = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
/**
 * §5.2 — ตัวแรกชนะ · เรียงครบทุกชั้นจนถึง id จึงไม่ขึ้นกับลำดับอินพุต
 * มติ Z5 (ค): ก่อนใช้ id — แถวไม่ระบุประเภทคนก่อนแถวรายประเภท แล้วเรียงตามรหัสประเภทคน (ร่างกับหลังบันทึกได้ "แถวแรก" เดียวกัน)
 */
function byPrecedence(x: Picked, y: Picked): number {
  return (
    y.r.priority - x.r.priority ||
    flag(isSpecialPeriodRate(y.r)) - flag(isSpecialPeriodRate(x.r)) ||
    flag(y.r.optionId !== null) - flag(x.r.optionId !== null) ||
    y.c.priority - x.c.priority ||
    laterFirst(x.r.travelFrom, y.r.travelFrom) ||
    laterFirst(x.r.bookFrom, y.r.bookFrom) ||
    flag(x.r.paxTypeId !== null) - flag(y.r.paxTypeId !== null) ||
    cmpStr(x.r.paxTypeId ?? "", y.r.paxTypeId ?? "") ||
    cmpStr(x.r.id, y.r.id)
  );
}
/**
 * มติ V2 (แทน Z5 ข): ราคาต่อประเภทคน = §5.2 (1) rate.priority → (2) ช่วงพิเศษ → (3) ตัวเลือกเจาะจง → (4) card.priority →
 * แถวระบุประเภทคนก่อนแถวไม่ระบุ → (5) travelFrom/bookFrom หลังสุด → (6) id น้อย
 * (ผู้สมัครถูกกรองไว้แล้ว = แถวของประเภทนี้หรือแถวไม่ระบุ จึงไม่ต้องเทียบรหัสประเภทคน)
 */
function byPaxPrecedence(x: Picked, y: Picked): number {
  return (
    y.r.priority - x.r.priority ||
    flag(isSpecialPeriodRate(y.r)) - flag(isSpecialPeriodRate(x.r)) ||
    flag(y.r.optionId !== null) - flag(x.r.optionId !== null) ||
    y.c.priority - x.c.priority ||
    flag(y.r.paxTypeId !== null) - flag(x.r.paxTypeId !== null) ||
    laterFirst(x.r.travelFrom, y.r.travelFrom) ||
    laterFirst(x.r.bookFrom, y.r.bookFrom) ||
    cmpStr(x.r.id, y.r.id)
  );
}
/** มติ V1 (แก้ Z1): แถวจำนวนเงิน (NET · MARKUP · COMMISSION_FIXED) ต้องสกุลเดียวกับการจอง · COMMISSION_PCT ไม่มีหน่วยเงิน ⇒ เข้าเกณฑ์ทุกสกุล */
const currencyFits = (r: RateRow, bookingCurrency: string): boolean => r.mode === "COMMISSION_PCT" || r.currency === bookingCurrency;
function eligibleRows(layer: "TIER" | "CONTRACT", f: RateFacts): Picked[] {
  const acc = f.account;
  const out: Picked[] = [];
  for (const c of f.cards) {
    if (c.status !== "ACTIVE" || !inRange(f.bookYmd, c.validFrom, c.validTo)) continue;
    const mine = layer === "TIER" ? c.ownerKind === "TIER" && acc.tierId !== null && c.tierId === acc.tierId : c.ownerKind === "AGENT" && c.agentAccountId === acc.id;
    if (!mine) continue;
    for (const r of c.rates) {
      if (r.active !== true || r.productKind !== "TRIP" || r.productId !== f.product.id) continue;
      if (r.optionId !== null && r.optionId !== f.product.optionId) continue;
      if (r.cabinTypeId !== null || !currencyFits(r, f.currency)) continue;
      if (!inRange(f.bookYmd, r.bookFrom, r.bookTo) || !inRange(f.travelYmd, r.travelFrom, r.travelTo)) continue;
      out.push({ r, c });
    }
  }
  return out.sort(byPrecedence);
}
type LayerOut = { level: AgencyLevelInput | null; trace: LayerTrace | null; warnings: string[] };
const NO_LAYER: LayerOut = { level: null, trace: null, warnings: [] };
const emptyLevel = (refId: string, mode: AgentRateMode): AgencyLevelInput => ({ refId, mode, rateBp: null, fixedSatang: null, unitMinorByPaxCode: null, minSellMinor: null, markupCapBp: null });

/** null = ค่าตั้งที่ต้องใช้ขาด/ผิดรูป (ไม่เดาค่า) */
function layerOf(layer: "TIER" | "CONTRACT", f: RateFacts): LayerOut | null {
  const rows = eligibleRows(layer, f);
  const values = isRec(f.policy) && isRec(f.policy.values) ? f.policy.values : null;
  if (rows.length === 0) {
    const acc = f.account;
    if (layer === "CONTRACT" || acc.tierId === null || acc.tierCode === null) return NO_LAYER;
    // ค่าเริ่มของระดับ (A1): ทัวร์/สถานที่ = tourPct · Liveaboard = laPct — แปลงหน่วย % → basis point เท่านั้น
    const table = values ? values["agency.tier.table"] : undefined;
    const row = isRec(table) && hasOwn(table, acc.tierCode) ? table[acc.tierCode] : undefined;
    const pct = isRec(row) ? (f.product.productType === "LIVEABOARD" ? row.laPct : row.tourPct) : undefined;
    if (!isInt(pct, 0, PCT_MAX)) return null;
    return {
      level: { ...emptyLevel(`tier:${acc.tierId}:A1`, "COMMISSION_PCT"), rateBp: pct * PCT_TO_BP },
      trace: { source: "TIER_DEFAULT", cardId: null, cardVersion: null, rateId: null, mode: "COMMISSION_PCT", specialPeriod: false },
      warnings: [],
    };
  }
  const first = rows[0];
  const mode = first.r.mode;
  const same = rows.filter((x) => x.r.mode === mode);
  const warnings = same.length < rows.length ? ["MIXED_MODES_IGNORED"] : [];
  const refId = `${first.r.id}@${first.c.version}`;
  const trace: LayerTrace = { source: layer === "TIER" ? "TIER_CARD" : "AGENT_CARD", cardId: first.c.id, cardVersion: first.c.version, rateId: first.r.id, mode, specialPeriod: isSpecialPeriodRate(first.r) };
  if (mode === "COMMISSION_PCT") return { level: { ...emptyLevel(refId, mode), rateBp: first.r.valueBp }, trace, warnings };
  if (mode === "COMMISSION_FIXED") return { level: { ...emptyLevel(refId, mode), fixedSatang: first.r.valueMinor }, trace, warnings };
  const unitMinorByPaxCode: Record<string, number> = {};
  for (const pt of f.product.paxTypes) {
    const hit = same.filter((x) => x.r.paxTypeId === pt.id || x.r.paxTypeId === null).sort(byPaxPrecedence)[0];
    if (hit && hit.r.valueMinor !== null) unitMinorByPaxCode[pt.code] = hit.r.valueMinor;
  }
  // มติ Z5 (ง): Level ของ T0.5 มีขั้นต่ำค่าเดียวต่อที่นั่งทุกประเภท ⇒ ใช้เฉพาะขั้นต่ำของแถวไม่ระบุประเภทคน (ของแถวรายประเภทไม่ลามไปประเภทอื่น)
  const generic = same.find((x) => x.r.paxTypeId === null);
  let minSellMinor = generic ? generic.r.minSellMinor : null;
  if (minSellMinor === null && f.currency === "THB") {
    const a7 = values ? values["agency.price.minResalePrice"] : undefined; // ไม่ตั้ง = ไม่กำหนด
    if (a7 !== null && a7 !== undefined) {
      if (!isInt(a7, 0, INT4_MAX)) return null;
      minSellMinor = a7;
    }
  }
  return { level: { ...emptyLevel(refId, mode), unitMinorByPaxCode, minSellMinor, markupCapBp: mode === "MARKUP" ? first.r.markupCapBp : null }, trace, warnings };
}

/** ชั้นระดับ (TIER) หรือชั้นสัญญาเฉพาะเอเจนซี่ (CONTRACT) ของข้อเท็จจริงชุดนี้ — ค่าตั้งที่ต้องใช้ผิดรูป ⇒ level null + คำเตือน SETTINGS_INVALID */
export function resolveAgentLayer(layer: "TIER" | "CONTRACT", facts: RateFacts): { level: AgencyLevelInput | null; trace: LayerTrace | null; warnings: string[] } {
  const out = layerOf(layer, facts);
  return out ? { level: out.level, trace: out.trace, warnings: [...out.warnings] } : { level: null, trace: null, warnings: ["SETTINGS_INVALID"] };
}

// ═══════════════ §5.4 terms ═══════════════
const VAT_MODES = ["NONE", "EXCLUSIVE", "INCLUSIVE"] as const;
const isVatMode = (v: unknown): v is CommissionVatMode => typeof v === "string" && (VAT_MODES as readonly string[]).includes(v);
/**
 * VAT ของค่าคอมมิชชัน (X26 · OQ14): เอเจนซี่ไม่จด VAT ⇒ NONE เสมอ · จด VAT และร้านไม่ได้ตั้งเอง (ที่มา TEMPLATE/FALLBACK) ⇒ EXCLUSIVE ·
 * จด VAT และร้านตั้งเอง ⇒ ค่าที่ตั้ง (รวม NONE) · ค่าที่ไม่รู้จัก ⇒ NONE (buildAgencyPricingInput ปฏิเสธค่าแบบนั้นก่อนถึงที่นี่)
 */
export function decideCommissionVatMode(i: { value: unknown; source: string; vatRegistered: boolean }): { mode: CommissionVatMode; decidedBy: RateTrace["vat"]["decidedBy"] } {
  if (!i.vatRegistered) return { mode: "NONE", decidedBy: "NOT_REGISTERED" };
  if (i.source === "TEMPLATE" || i.source === "FALLBACK") return { mode: "EXCLUSIVE", decidedBy: "DEFAULT_REGISTERED" };
  return { mode: isVatMode(i.value) ? i.value : "NONE", decidedBy: "SETTING" };
}

const PAYEE_TYPES = ["TH_JURISTIC", "TH_FOUNDATION", "TH_PERSON", "FOREIGN"] as const;
/** ⚖️ มติ Z6: อัตรา e-WHT ใช้กับผู้รับนิติบุคคลเท่านั้น — มูลนิธิ/สมาคมคงอัตราปกติ (กฎกระทรวง ฉ.402 · skill shark-thai-law common-withholding-tax.md §14)
 *  อัตราและวันสิ้นมาตรการมาจากค่าตั้ง A28 `agency.wht.eWht` (rateBp · untilPaidOn) ไม่ฝังโค้ด */
const E_WHT_PAYEES: readonly string[] = ["TH_JURISTIC"];
const Z_WHT_RULE = z.object({ mode: z.enum(["FLAT", "M50_1", "NONE"]), rateBp: zInt(BP_MAX) });
const TERMS_POLICY = z.object({
  "agency.money.collector": z.enum(["AGENT_COLLECTS", "SHOP_COLLECTS"]),
  "agency.price.sellerOfRecord": z.enum(["SHOP_PRINCIPAL", "AGENT_RESELLS"]),
  "agency.comm.earnedAt": z.enum(["AFTER_TRAVEL", "ON_CONFIRM"]),
  "agency.comm.clawbackOnCancel": z.boolean(),
  "agency.comm.discountFromCommission": z.object({ enabled: z.boolean(), capPct: zInt(PCT_MAX) }),
  "agency.comm.vatMode": z.enum(VAT_MODES),
  "agency.wht.payerType": z.enum(["JURISTIC", "INDIVIDUAL"]).nullable(),
  "agency.wht.ruleByPayee": z.record(z.string(), z.record(z.string(), Z_WHT_RULE)),
  "agency.wht.minPerContract": z.object({ amountSatang: zInt(INT4_MAX), appliesTo: z.record(z.string(), z.boolean()), continuousContract: z.string().min(1).max(40) }),
  "agency.wht.eWht": z.object({ enabled: z.boolean(), rateBp: zInt(BP_MAX), untilPaidOn: z.string().refine(isAgentRateYmd).nullable() }),
  "agency.wht.grossUpOnNetRemit": z.boolean(),
  "agency.wht.remitter": z.enum(["SHOP", "AGENT_ON_BEHALF", "NONE"]),
});

/**
 * ประกอบอินพุตชั้นเอเจนซี่ของตัวคิดราคา T0.5 — **ฟังก์ชันเดียว** ที่ทั้ง port ตัวจริงและเครื่องลองคิดเรียก
 * ค่าตั้งขาด/ผิดรูป ⇒ { ok:false, reason:"SETTINGS_INVALID" } (ไม่เดาค่า · ไม่ throw)
 */
export function buildAgencyPricingInput(facts: RateFacts): AgencyPricingBuilt {
  const invalid = { ok: false as const, reason: "SETTINGS_INVALID" as const };
  if (!isRec(facts) || !isRec(facts.policy) || !isRec(facts.policy.values) || !isRec(facts.policy.sources) || !isRec(facts.account)) return invalid;
  const acc = facts.account;
  if (!isInt(facts.vatRateBp, 0, BP_MAX) || typeof acc.vatRegistered !== "boolean") return invalid;
  if (!(PAYEE_TYPES as readonly string[]).includes(acc.payeeType)) return invalid;
  const parsed = TERMS_POLICY.safeParse(facts.policy.values);
  if (!parsed.success) return invalid;
  const P = parsed.data;
  const vatSource = facts.policy.sources["agency.comm.vatMode"];
  if (typeof vatSource !== "string" || vatSource === "") return invalid;

  const tier = layerOf("TIER", facts);
  const contract = layerOf("CONTRACT", facts);
  if (!tier || !contract) return invalid;
  const warnings = new Set<string>([...tier.warnings, ...contract.warnings]);
  const applied: RateTrace["applied"] = contract.level ? "CONTRACT" : tier.level ? "TIER" : "NONE";
  if (applied === "NONE") warnings.add("NO_AGENT_RATE");
  // สัญญาแทนระดับทั้งชุด (CC :610 · มติ R3) — ช่วงพิเศษของ card ระดับที่ถูกสัญญาบัง ⇒ เตือน
  if (contract.level && tier.trace?.specialPeriod === true) warnings.add("TIER_SPECIAL_PERIOD_SHADOWED");

  const vat = decideCommissionVatMode({ value: P["agency.comm.vatMode"], source: vatSource, vatRegistered: acc.vatRegistered });
  // มติ Z9: เตือนเฉพาะเมื่อร้านตั้ง X26 เอง (ค่าจากแม่แบบ/ค่าสำรองไม่ใช่สิ่งที่ร้านเลือก)
  if (!acc.vatRegistered && P["agency.comm.vatMode"] !== "NONE" && vatSource !== "TEMPLATE" && vatSource !== "FALLBACK") warnings.add("VAT_MODE_IGNORED_NOT_REGISTERED");

  const payerSet = P["agency.wht.payerType"];
  const payerType = payerSet ?? "JURISTIC";
  if (payerSet === null) warnings.add("WHT_PAYER_ASSUMED_JURISTIC");
  const byPayer = P["agency.wht.ruleByPayee"];
  const payerRow = hasOwn(byPayer, payerType) ? byPayer[payerType] : undefined;
  const rule = payerRow && hasOwn(payerRow, acc.payeeType) ? payerRow[acc.payeeType] : undefined;
  if (!rule) return invalid;
  const whtMode: AgencyTermsInput["wht"]["mode"] = rule.mode === "FLAT" ? "RATE" : rule.mode === "M50_1" ? "PROGRESSIVE_50_1" : acc.payeeType === "FOREIGN" ? "NONE_FOREIGN" : "NONE";
  const e = P["agency.wht.eWht"];
  const eWht = e.enabled && whtMode === "RATE" && E_WHT_PAYEES.includes(acc.payeeType) && (e.untilPaidOn === null || facts.bookYmd <= e.untilPaidOn);
  const min = P["agency.wht.minPerContract"];
  const minApplies = hasOwn(min.appliesTo, acc.payeeType) && min.appliesTo[acc.payeeType] === true;

  const terms: AgencyTermsInput = {
    collector: P["agency.money.collector"],
    sellerOfRecord: P["agency.price.sellerOfRecord"],
    vatMode: vat.mode,
    vatRateBp: facts.vatRateBp,
    wht: {
      applies: rule.mode !== "NONE",
      mode: whtMode,
      rateBp: eWht ? e.rateBp : whtMode === "RATE" ? rule.rateBp : null,
      eWht,
      grossUp: P["agency.wht.grossUpOnNetRemit"],
      minPerContractSatang: minApplies ? min.amountSatang : 0,
      continuous: min.continuousContract,
      remitter: P["agency.wht.remitter"],
      payerType,
      payeeType: acc.payeeType,
    },
    discountFromCommission: { enabled: P["agency.comm.discountFromCommission"].enabled, capPct: P["agency.comm.discountFromCommission"].capPct },
    earnedAt: P["agency.comm.earnedAt"],
    clawbackOnCancel: P["agency.comm.clawbackOnCancel"],
    actualSaleSatang: null,
  };
  return {
    ok: true,
    input: { agentAccountId: acc.id, agentTierId: acc.tierId, vatRegistered: acc.vatRegistered, tier: tier.level, contract: contract.level, terms },
    trace: { tier: tier.trace, contract: contract.trace, applied, vat },
    warnings: [...warnings].sort(),
  };
}
