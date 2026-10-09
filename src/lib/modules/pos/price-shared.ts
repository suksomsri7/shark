// price-shared.ts — ตัวแก้ราคาบริสุทธิ์ของ POS P2.2 (ราคาตามช่องทาง / สาขา / ช่วงเวลา · happy hour / โปร)
//
// 🔴 ไฟล์นี้ client component import ได้ (ไทล์หน้าขาย · ลิ้นชัก 06 "ราคาตามช่องทาง" · ตัวแก้กติกา P2.2U) — ห้าม import ค่าจาก prisma/db/โมดูลฝั่งเซิร์ฟเวอร์
//    (import ได้เฉพาะ ./pricing-shared · ./channel-shared) · ฝั่งเซิร์ฟเวอร์: price.ts (อ่าน + resolvePrices) · price-rule.ts (ผู้เขียนเดียวของ PosPriceRule) ·
//    catalog.ts (ผู้เขียนเดียวของ PosProductChannelPrice)
// 🔴 เงินเป็นสตางค์จำนวนเต็ม · ปัดครึ่งขึ้นเฉพาะค่าที่ไม่ติดลบ · ไม่มีนาฬิกาทดสอบ (CD10) — ผู้เรียกส่ง `at` เอง (1 ค่าต่อการคิดราคา 1 ครั้ง)
// 🔴 เวลาไทย = UTC+7 คงที่ (ไม่มีเวลาออมแสง) · หน้าต่างเวลา [timeFrom, timeTo) ไม่ข้ามเที่ยงคืน (CD8) · ช่วงวันที่ [startsAt, endsAt)
//
// ลำดับ (R4 · มติ Q3/CD2): ① ราคาเปิด/รายการกำหนดเอง/สินค้าชั่ง ไม่โดนชั้นราคาใด ๆ → ② ราคาปกติ = ฐาน (ตัวแปรไม่ตั้งราคา = ฐานของแม่ · null = PRICE_NOT_SET)
//   → ③④ แถวราคา: (ช่องทาง, สาขา) > (ช่องทาง, ทุกสาขา) > (ทุกช่องทาง, สาขา) — ระดับเดียวกัน แถวของตัวแปรเองชนะแถวของแม่ · แถวที่ชนะเป็น notSold = CHANNEL_NOT_SOLD
//   → ⑤ กติกาที่ตรง: priority มากก่อน → ราคาผลต่ำก่อน → createdAt เก่าก่อน → id น้อยก่อน · PRICE แทนราคา · PERCENT_OFF/AMOUNT_OFF คิดบนราคาขั้น ④
//   → ⑥ ราคาต่อหน่วย = ราคา + Σ ส่วนต่างตัวเลือก (ตัวเลือกไม่ถูกปรับ · CD5)
import { PRICE_MAX_SATANG, roundHalfUp } from "./pricing-shared";
import { CHANNEL_CODE_RE } from "./channel-shared";

// ═══════════ ค่าคงที่ ═══════════
/** ที่มาของราคา (enum PosPriceSource — ลำดับนี้ตายตัว) */
export const PRICE_SOURCES = ["BASE", "BRANCH", "CHANNEL", "RULE", "OPEN", "CUSTOM", "WEIGHED"] as const;
export type PriceSource = (typeof PRICE_SOURCES)[number];
export const PRICE_RULE_KINDS = ["HAPPY_HOUR", "PROMO"] as const;
export type PriceRuleKind = (typeof PRICE_RULE_KINDS)[number];
export const PRICE_RULE_ADJUSTS = ["PRICE", "PERCENT_OFF", "AMOUNT_OFF"] as const;
export type PriceRuleAdjust = (typeof PRICE_RULE_ADJUSTS)[number];

/** กติกาที่ยังไม่เก็บถาวรต่อระบบ (นับกติกาที่ปิดอยู่ด้วย · มติ 9) */
export const PRICE_RULE_LIMIT = 100;
/** แถวราคาตามช่องทาง/สาขาต่อสินค้า (setChannelPrices แทนทั้งชุด) */
export const CHANNEL_PRICE_ROWS_MAX = 60;
/** บวกราคาทั้งช่องทางได้ไม่เกิน +200% */
export const BULK_MARKUP_BP_MAX = 20_000;
/** สินค้าต่อคำขอ bulk / ต่อกติกา */
export const BULK_MARKUP_PRODUCTS_MAX = 500;
export const PRICE_RULE_PRODUCTS_MAX = 500;
export const PRICE_RULE_CATEGORIES_MAX = 50;
export const PRICE_RULE_NAME_MAX = 60;
export const PRICE_RULE_PRIORITY_MAX = 100;
/** รายการช่องทาง/สาขาของกติกา (กันอินพุตบวม) */
export const PRICE_RULE_CHANNELS_MAX = 30;
export const PRICE_RULE_UNITS_MAX = 200;
/** createSale lines[].priceRuleId ยาวได้ไม่เกิน (R7) */
export const PRICE_RULE_ID_MAX = 40;
/** ปัดราคาที่บวก % : 1 = สตางค์ · 100 = บาท */
export const BULK_ROUND_TO = [1, 100] as const;

const BP_FULL = 10_000;
const BKK_OFFSET_MS = 7 * 3_600_000;
const DAY_MS = 86_400_000;
const HHMM_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

// ═══════════ ชนิดข้อมูล ═══════════
/** แถวราคาตามช่องทาง/สาขา (PosProductChannelPrice) ที่ตัวแก้ใช้ */
export type ChannelPriceRow = { productId: string; channelCode: string | null; unitId: string | null; priceSatang: number | null; notSold: boolean };
/** กติกาที่ตัวแก้ใช้ (แถว PosPriceRule หรือ DTO — วันที่เป็น Date หรือ ISO) */
export type PriceRuleLike = {
  id: string;
  name: string;
  kind?: string;
  active: boolean;
  archivedAt: Date | string | null;
  priority: number;
  productIds: readonly string[];
  categoryIds: readonly string[];
  channelCodes: readonly string[];
  unitIds: readonly string[];
  adjust: string;
  valueSatang: number | null;
  valueBp: number | null;
  startsAt: Date | string | null;
  endsAt: Date | string | null;
  weekdays: readonly number[];
  timeFrom: string | null;
  timeTo: string | null;
  createdAt: Date | string;
};
export type PriceProductLike = { id: string; basePriceSatang: number | null; categoryId: string | null; parentId: string | null; soldByWeight?: boolean };
export type PriceParentLike = { id: string; basePriceSatang: number | null; categoryId: string | null };
export type ResolveUnitPriceInput = {
  product: PriceProductLike;
  parent?: PriceParentLike | null;
  channelCode: string;
  unitId: string;
  /** แถวของสินค้าอื่นปนมาได้ — ตัวแก้กรองเอง */
  rows: readonly ChannelPriceRow[];
  rules: readonly PriceRuleLike[];
  at: Date;
  /** ① ราคาที่ไม่โดนชั้นราคา (ราคาเปิด · รายการกำหนดเอง · ราคาของน้ำหนัก) */
  override?: { source: "OPEN" | "CUSTOM" | "WEIGHED"; priceSatang: number };
  optionDeltaSatang?: number;
};
export type ResolvedUnitPrice = {
  ok: true;
  source: PriceSource;
  /** ราคาก่อนตัวเลือก */
  priceSatang: number;
  /** = priceSatang + optionDeltaSatang */
  unitPriceSatang: number;
  /** ราคาปกติขั้น ② (ไม่รวมตัวเลือก) · null = OPEN/CUSTOM/WEIGHED */
  listPriceSatang: number | null;
  ruleId: string | null;
  ruleName: string | null;
};
export type ResolveUnitPriceRefusal = { ok: false; code: "PRICE_NOT_SET" | "CHANNEL_NOT_SOLD" };
export type ResolveUnitPriceResult = ResolvedUnitPrice | ResolveUnitPriceRefusal;

/** กติกาที่จอเห็น (savePriceRule/archivePriceRule/listPriceRules) — คีย์ตายตัว 18 ตัว · วันที่เป็น ISO */
export type PriceRuleItem = {
  id: string;
  name: string;
  kind: PriceRuleKind;
  active: boolean;
  priority: number;
  productIds: string[];
  categoryIds: string[];
  channelCodes: string[];
  unitIds: string[];
  adjust: PriceRuleAdjust;
  valueSatang: number | null;
  valueBp: number | null;
  startsAt: string | null;
  endsAt: string | null;
  weekdays: number[];
  timeFrom: string | null;
  timeTo: string | null;
  archived: boolean;
};
/** อินพุตของ savePriceRule (คีย์ตรงตัว · มี id = แก้) */
export type PriceRuleInput = {
  id?: string;
  name: string;
  kind: PriceRuleKind;
  active?: boolean;
  priority?: number;
  productIds?: string[];
  categoryIds?: string[];
  channelCodes?: string[];
  unitIds?: string[];
  adjust: PriceRuleAdjust;
  valueSatang?: number | null;
  valueBp?: number | null;
  startsAt?: string | null;
  endsAt?: string | null;
  weekdays?: number[];
  timeFrom?: string | null;
  timeTo?: string | null;
};
export type PriceRuleRefusalCode = "VALIDATION" | "PERMISSION_DENIED" | "PRICE_RULE_NOT_FOUND" | "PRICE_RULE_LIMIT" | "INTERNAL";
export type PriceRuleRefusal = { ok: false; code: PriceRuleRefusalCode; message: string; field?: string };
export type ListPriceRulesResult = { ok: true; items: PriceRuleItem[] } | PriceRuleRefusal;
export type SavePriceRuleResult = { ok: true; rule: PriceRuleItem } | PriceRuleRefusal;
export type ArchivePriceRuleResult = { ok: true; rule: PriceRuleItem } | PriceRuleRefusal;

/** แถวราคาที่ setChannelPrices รับ (คีย์ตรงตัว) / ที่ listForUnit คืน */
export type ChannelPriceInputRow = { channelCode: string | null; unitId: string | null; priceSatang: number | null; notSold?: boolean };
export type ChannelPriceView = { channelId: string | null; channelCode: string | null; unitId: string | null; priceSatang: number | null; notSold: boolean };

// ═══════════ ตัวช่วยเวลา ═══════════
const msOf = (v: Date | string | null | undefined): number | null => {
  if (v === null || v === undefined) return null;
  const t = v instanceof Date ? v.getTime() : Date.parse(v);
  return Number.isFinite(t) ? t : null;
};
/** "HH:MM" → นาทีของวัน · ผิดรูป = null */
export function parseHhmm(v: unknown): number | null {
  if (typeof v !== "string") return null;
  const m = HHMM_RE.exec(v);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}
/** เที่ยงคืนเวลาไทยของวันที่ `ms` อยู่ (ms UTC) */
const bkkMidnight = (ms: number): number => ms - (((ms + BKK_OFFSET_MS) % DAY_MS) + DAY_MS) % DAY_MS;
/** วันในสัปดาห์ตามเวลาไทย (0 = อาทิตย์) */
export const bkkWeekday = (at: Date): number => new Date(at.getTime() + BKK_OFFSET_MS).getUTCDay();

/** หน้าต่างเวลาของกติกาเปิดอยู่ที่ `at` ไหม (ช่วงวันที่ · วัน · เวลา — ไม่ดู active/archived/ขอบเขต) */
export function priceRuleWindowOpen(rule: Pick<PriceRuleLike, "startsAt" | "endsAt" | "weekdays" | "timeFrom" | "timeTo">, at: Date): boolean {
  const t = at.getTime();
  const s = msOf(rule.startsAt);
  const e = msOf(rule.endsAt);
  if (s !== null && t < s) return false;
  if (e !== null && t >= e) return false;
  if (rule.weekdays.length && !rule.weekdays.includes(bkkWeekday(at))) return false;
  if (rule.timeFrom !== null || rule.timeTo !== null) {
    const f = parseHhmm(rule.timeFrom);
    const to = parseHhmm(rule.timeTo);
    if (f === null || to === null) return false;
    const inDay = t - bkkMidnight(t);
    if (inDay < f * 60_000 || inDay >= to * 60_000) return false;
  }
  return true;
}

const liveRule = (r: PriceRuleLike): boolean => r.active === true && (r.archivedAt === null || r.archivedAt === undefined);

/** กติกาใช้กับสินค้า/ช่องทาง/สาขา/เวลานี้ไหม (ตัวแปร: id ของแม่ + หมวดของแม่เมื่อตัวเองไม่มีหมวด · มติ 3) */
export function priceRuleMatches(rule: PriceRuleLike, product: PriceProductLike, parent: PriceParentLike | null | undefined, channelCode: string, unitId: string, at: Date): boolean {
  if (!liveRule(rule)) return false;
  if (rule.channelCodes.length && !rule.channelCodes.includes(channelCode)) return false;
  if (rule.unitIds.length && !rule.unitIds.includes(unitId)) return false;
  const parentId = product.parentId && parent && parent.id === product.parentId ? parent.id : null;
  const categoryId = product.categoryId ?? (parentId ? (parent?.categoryId ?? null) : null);
  const hitProduct = rule.productIds.includes(product.id) || (parentId !== null && rule.productIds.includes(parentId));
  const hitCategory = categoryId !== null && rule.categoryIds.includes(categoryId);
  if (!hitProduct && !hitCategory) return false;
  return priceRuleWindowOpen(rule, at);
}

/** ราคาหลังกติกาบนราคาขั้น ④ — ค่ากติกาผิดรูป = null (ไม่ใช้กติกานั้น) */
export function applyPriceRule(rule: Pick<PriceRuleLike, "adjust" | "valueSatang" | "valueBp">, priceSatang: number): number | null {
  const isInt = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v);
  if (rule.adjust === "PRICE") return isInt(rule.valueSatang) && rule.valueSatang >= 0 && rule.valueSatang <= PRICE_MAX_SATANG ? rule.valueSatang : null;
  if (rule.adjust === "PERCENT_OFF") {
    if (!isInt(rule.valueBp) || rule.valueBp < 1 || rule.valueBp > BP_FULL) return null;
    return priceSatang - roundHalfUp(priceSatang * rule.valueBp, BP_FULL);
  }
  if (rule.adjust === "AMOUNT_OFF") return isInt(rule.valueSatang) && rule.valueSatang >= 1 ? Math.max(0, priceSatang - rule.valueSatang) : null;
  return null;
}

/** ⑤ ผู้ชนะ: priority มากก่อน → ราคาผลต่ำก่อน → createdAt เก่าก่อน → id น้อยก่อน (ไม่ขึ้นกับลำดับในอาร์เรย์) */
function pickRule(cands: { rule: PriceRuleLike; price: number }[]): { rule: PriceRuleLike; price: number } | null {
  let best: { rule: PriceRuleLike; price: number } | null = null;
  for (const c of cands) {
    if (!best) {
      best = c;
      continue;
    }
    const a = c.rule;
    const b = best.rule;
    const d =
      b.priority - a.priority ||
      c.price - best.price ||
      (msOf(a.createdAt) ?? 0) - (msOf(b.createdAt) ?? 0) ||
      (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
    if (d < 0) best = c;
  }
  return best;
}

/** ③④ แถวที่ชนะ: (code, unit) → (code, ทุกสาขา) → (ทุกช่องทาง, unit) · ระดับเดียวกันแถวของตัวเองชนะแถวของแม่ */
function winningRow(rows: readonly ChannelPriceRow[], ownId: string, parentId: string | null, channelCode: string, unitId: string): { row: ChannelPriceRow; level: "CHANNEL" | "BRANCH" } | null {
  const levels: [string | null, string | null, "CHANNEL" | "BRANCH"][] = [
    [channelCode, unitId, "CHANNEL"],
    [channelCode, null, "CHANNEL"],
    [null, unitId, "BRANCH"],
  ];
  for (const [code, unit, level] of levels) {
    for (const pid of parentId ? [ownId, parentId] : [ownId]) {
      const r = rows.find((x) => x.productId === pid && (x.channelCode ?? null) === code && (x.unitId ?? null) === unit);
      if (r) return { row: r, level };
    }
  }
  return null;
}

/**
 * R4 — ราคาต่อหน่วยของสินค้า 1 รายการ ณ `at` บนช่องทาง (รหัส) + สาขา · คืนค่าเสมอ (ไม่ throw)
 * `override` = ① (ราคาเปิด/รายการกำหนดเอง/ราคาของน้ำหนัก) — ไม่ดูแถว/กติกา · listPriceSatang null
 */
export function resolveUnitPrice(input: ResolveUnitPriceInput): ResolveUnitPriceResult {
  const opt = typeof input.optionDeltaSatang === "number" && Number.isInteger(input.optionDeltaSatang) ? input.optionDeltaSatang : 0;
  if (input.override) {
    const p = input.override.priceSatang;
    return { ok: true, source: input.override.source, priceSatang: p, unitPriceSatang: p + opt, listPriceSatang: null, ruleId: null, ruleName: null };
  }
  const product = input.product;
  const parent = product.parentId && input.parent && input.parent.id === product.parentId ? input.parent : null;
  // ② ราคาปกติ: ตัวแปรที่ตั้งราคาเองใช้ของตัวเอง (ไม่ถูกแม่ทับ · มติ 3)
  const list = product.basePriceSatang ?? (parent ? parent.basePriceSatang : null);
  if (list === null || list === undefined) return { ok: false, code: "PRICE_NOT_SET" };
  // ③④
  const win = winningRow(input.rows, product.id, parent ? parent.id : null, input.channelCode, input.unitId);
  let price = list;
  let source: PriceSource = "BASE";
  if (win) {
    // notSold ที่ระดับที่ชนะ = ไม่ขาย (กติกาช่วยไม่ได้ · มติ 4)
    if (win.row.notSold || win.row.priceSatang === null) return { ok: false, code: "CHANNEL_NOT_SOLD" };
    price = win.row.priceSatang;
    source = win.level;
  }
  // ⑤
  const cands: { rule: PriceRuleLike; price: number }[] = [];
  for (const r of input.rules) {
    if (!priceRuleMatches(r, product, parent, input.channelCode, input.unitId, input.at)) continue;
    const v = applyPriceRule(r, price);
    if (v !== null) cands.push({ rule: r, price: v });
  }
  const best = pickRule(cands);
  if (best) return { ok: true, source: "RULE", priceSatang: best.price, unitPriceSatang: best.price + opt, listPriceSatang: list, ruleId: best.rule.id, ruleName: best.rule.name };
  return { ok: true, source, priceSatang: price, unitPriceSatang: price + opt, listPriceSatang: list, ruleId: null, ruleName: null };
}

/**
 * R2 · CD6 — ราคาช่องทางแบบบวก % ปัดครั้งเดียว (ครึ่งขึ้น) : roundTo × halfUp(base × (10000 + bp) / (10000 × roundTo))
 * ตัวอย่าง: 7,500 × 2,700 bp ปัด 100 = 9,500 · 115 × 3,000 bp ปัด 100 = 100 (ไม่ปัดสองชั้น)
 */
export function channelMarkupPrice(baseSatang: number, markupBp: number, roundTo: 1 | 100): number {
  const den = BP_FULL * roundTo;
  return roundTo * roundHalfUp(baseSatang * (BP_FULL + markupBp), den);
}

/**
 * ปลายของหน้าต่างที่เปิดอยู่ตอนนี้ของกติกา (ไทล์ "Happy hour ถึง 16:00") — ต่ำสุดของ endsAt · timeTo วันนี้ · เที่ยงคืน (เมื่อจำกัดวัน) · null = ไม่มีปลาย
 */
export function priceRuleActiveUntil(rule: Pick<PriceRuleLike, "endsAt" | "weekdays" | "timeFrom" | "timeTo">, at: Date): Date | null {
  const t = at.getTime();
  const cands: number[] = [];
  const e = msOf(rule.endsAt);
  if (e !== null && e > t) cands.push(e);
  const to = parseHhmm(rule.timeTo);
  if (to !== null) {
    const edge = bkkMidnight(t) + to * 60_000;
    if (edge > t) cands.push(edge);
  }
  if (rule.weekdays.length) cands.push(bkkMidnight(t) + DAY_MS);
  return cands.length ? new Date(Math.min(...cands)) : null;
}

/**
 * R6 — ขอบหน้าต่างถัดไปของกติกาที่ยังใช้ได้ (เริ่ม/จบ/เวลาเปิด-ปิดรายวัน/เที่ยงคืนของกติการายวัน) ภายใน `horizonMs` (ปริยาย 24 ชม.)
 * — จอ refetch แคตตาล็อกตอนนั้น (`priceValidUntil`) · ไม่มีขอบ = null
 */
export function nextPriceEdge(rules: readonly PriceRuleLike[], at: Date, horizonMs = DAY_MS): Date | null {
  const t = at.getTime();
  let best: number | null = null;
  const take = (ms: number | null) => {
    if (ms !== null && ms > t && ms <= t + horizonMs && (best === null || ms < best)) best = ms;
  };
  for (const r of rules) {
    if (!liveRule(r)) continue;
    take(msOf(r.startsAt));
    take(msOf(r.endsAt));
    const day0 = bkkMidnight(t);
    for (const d of [0, 1]) {
      const f = parseHhmm(r.timeFrom);
      const to = parseHhmm(r.timeTo);
      if (f !== null) take(day0 + d * DAY_MS + f * 60_000);
      if (to !== null) take(day0 + d * DAY_MS + to * 60_000);
    }
    if (r.weekdays.length) take(day0 + DAY_MS);
  }
  return best === null ? null : new Date(best);
}

/** สถานะกติกาบนจอ (P2.2U) — ACTIVE กำลังใช้ · UPCOMING รอเริ่ม · ENDED หมดแล้ว · OFF ปิด/เก็บถาวร */
export function priceRuleState(rule: PriceRuleLike, at: Date): "ACTIVE" | "UPCOMING" | "ENDED" | "OFF" {
  if (!liveRule(rule)) return "OFF";
  const e = msOf(rule.endsAt);
  if (e !== null && at.getTime() >= e) return "ENDED";
  return priceRuleWindowOpen(rule, at) ? "ACTIVE" : "UPCOMING";
}

// ═══════════ ตัวตรวจอินพุตกติกา (ใช้ร่วมจอ + price-rule.ts) ═══════════
const RULE_INPUT_KEYS: ReadonlySet<string> = new Set([
  "id", "name", "kind", "active", "priority", "productIds", "categoryIds", "channelCodes", "unitIds",
  "adjust", "valueSatang", "valueBp", "startsAt", "endsAt", "weekdays", "timeFrom", "timeTo",
]);
export type ParsedPriceRule = {
  id: string | null;
  name: string;
  kind: PriceRuleKind;
  active: boolean;
  priority: number;
  productIds: string[];
  categoryIds: string[];
  channelCodes: string[];
  unitIds: string[];
  adjust: PriceRuleAdjust;
  valueSatang: number | null;
  valueBp: number | null;
  startsAt: Date | null;
  endsAt: Date | null;
  weekdays: number[];
  timeFrom: string | null;
  timeTo: string | null;
};
export type ParsePriceRuleResult = { ok: true; value: ParsedPriceRule } | { ok: false; code: "VALIDATION"; message: string; field?: string };

const isRec = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const isIntIn = (v: unknown, lo: number, hi: number): v is number => typeof v === "number" && Number.isInteger(v) && v >= lo && v <= hi;
const isIdStr = (v: unknown): v is string => typeof v === "string" && v.length > 0 && v.length <= 200 && !v.includes("\u0000");

/** R3 — ตรวจอินพุต savePriceRule (คีย์ตรงตัว · ค่าปริยาย active true · priority 0 · อาร์เรย์ []) */
export function parsePriceRuleInput(raw: unknown): ParsePriceRuleResult {
  const bad = (message: string, field?: string): ParsePriceRuleResult => ({ ok: false, code: "VALIDATION", message, ...(field ? { field } : {}) });
  if (!isRec(raw)) return bad("ข้อมูลกติกาไม่ถูกต้อง");
  for (const k of Object.keys(raw)) if (!RULE_INPUT_KEYS.has(k)) return bad(`ไม่รู้จักช่อง ${k.slice(0, 40)}`, k);
  const has = (k: string) => raw[k] !== undefined;
  let id: string | null = null;
  if (has("id") && raw.id !== null) {
    if (!isIdStr(raw.id)) return bad("รหัสกติกาไม่ถูกต้อง", "id");
    id = raw.id;
  }
  const name = typeof raw.name === "string" ? raw.name.trim() : "";
  if (!name) return bad("กรุณาตั้งชื่อโปร", "name");
  if (name.length > PRICE_RULE_NAME_MAX || name.includes("\u0000")) return bad(`ชื่อโปรยาวได้ไม่เกิน ${PRICE_RULE_NAME_MAX} ตัวอักษร`, "name");
  if (!(PRICE_RULE_KINDS as readonly unknown[]).includes(raw.kind)) return bad("ชนิดโปรไม่ถูกต้อง", "kind");
  const active = has("active") ? raw.active : true;
  if (typeof active !== "boolean") return bad("สถานะเปิด/ปิดไม่ถูกต้อง", "active");
  const priority = has("priority") ? raw.priority : 0;
  if (!isIntIn(priority, 0, PRICE_RULE_PRIORITY_MAX)) return bad(`ลำดับความสำคัญต้องเป็น 0–${PRICE_RULE_PRIORITY_MAX}`, "priority");
  const list = (k: string, max: number, ok: (v: unknown) => boolean): string[] | string => {
    if (!has(k) || raw[k] === null) return [];
    const v = raw[k];
    if (!Array.isArray(v) || v.length > max || !v.every(ok)) return k;
    return [...new Set(v as string[])];
  };
  const productIds = list("productIds", PRICE_RULE_PRODUCTS_MAX, isIdStr);
  if (typeof productIds === "string") return bad(`เลือกสินค้าได้ไม่เกิน ${PRICE_RULE_PRODUCTS_MAX} รายการ`, "productIds");
  const categoryIds = list("categoryIds", PRICE_RULE_CATEGORIES_MAX, isIdStr);
  if (typeof categoryIds === "string") return bad(`เลือกหมวดได้ไม่เกิน ${PRICE_RULE_CATEGORIES_MAX} หมวด`, "categoryIds");
  if (!productIds.length && !categoryIds.length) return bad("เลือกสินค้าหรือหมวดอย่างน้อย 1 รายการ", "productIds");
  const channelCodes = list("channelCodes", PRICE_RULE_CHANNELS_MAX, (v) => typeof v === "string" && CHANNEL_CODE_RE.test(v));
  if (typeof channelCodes === "string") return bad("รหัสช่องทางไม่ถูกต้อง", "channelCodes");
  const unitIds = list("unitIds", PRICE_RULE_UNITS_MAX, isIdStr);
  if (typeof unitIds === "string") return bad("สาขาไม่ถูกต้อง", "unitIds");
  if (!(PRICE_RULE_ADJUSTS as readonly unknown[]).includes(raw.adjust)) return bad("วิธีปรับราคาไม่ถูกต้อง", "adjust");
  const adjust = raw.adjust as PriceRuleAdjust;
  const vs = has("valueSatang") ? raw.valueSatang : null;
  const vb = has("valueBp") ? raw.valueBp : null;
  let valueSatang: number | null = null;
  let valueBp: number | null = null;
  if (adjust === "PERCENT_OFF") {
    if (vs !== null) return bad("โปรลดเป็น % ใช้ valueBp เท่านั้น", "valueSatang");
    if (!isIntIn(vb, 1, BP_FULL)) return bad("ส่วนลดต้องเป็น 0.01%–100%", "valueBp");
    valueBp = vb;
  } else {
    if (vb !== null) return bad("โปรนี้ใช้ valueSatang เท่านั้น", "valueBp");
    if (!isIntIn(vs, adjust === "AMOUNT_OFF" ? 1 : 0, PRICE_MAX_SATANG)) return bad(adjust === "AMOUNT_OFF" ? "ส่วนลดต้องมากกว่า 0" : "ราคาโปรต้องเป็นจำนวนเต็มสตางค์ไม่ติดลบ", "valueSatang");
    valueSatang = vs;
  }
  const date = (k: "startsAt" | "endsAt"): Date | null | "bad" => {
    const v = raw[k];
    if (v === undefined || v === null) return null;
    if (typeof v !== "string" || v.length > 40) return "bad";
    const t = Date.parse(v);
    return Number.isFinite(t) ? new Date(t) : "bad";
  };
  const startsAt = date("startsAt");
  const endsAt = date("endsAt");
  if (startsAt === "bad") return bad("วันเริ่มไม่ถูกต้อง", "startsAt");
  if (endsAt === "bad") return bad("วันสิ้นสุดไม่ถูกต้อง", "endsAt");
  if (startsAt && endsAt && startsAt.getTime() >= endsAt.getTime()) return bad("วันเริ่มต้องก่อนวันสิ้นสุด", "endsAt");
  let weekdays: number[] = [];
  if (has("weekdays") && raw.weekdays !== null) {
    const w = raw.weekdays;
    if (!Array.isArray(w) || w.length > 7 || !w.every((d) => isIntIn(d, 0, 6))) return bad("วันในสัปดาห์ต้องเป็น 0 (อา.) – 6 (ส.)", "weekdays");
    weekdays = [...new Set(w as number[])].sort((a, b) => a - b);
  }
  const tf = has("timeFrom") ? raw.timeFrom : null;
  const tt = has("timeTo") ? raw.timeTo : null;
  if ((tf === null) !== (tt === null)) return bad("ใส่เวลาเริ่มและเวลาจบให้ครบทั้งคู่", "timeTo");
  let timeFrom: string | null = null;
  let timeTo: string | null = null;
  if (tf !== null) {
    const f = parseHhmm(tf);
    const t = parseHhmm(tt);
    if (f === null) return bad("เวลาเริ่มต้องเป็น HH:MM", "timeFrom");
    if (t === null) return bad("เวลาจบต้องเป็น HH:MM", "timeTo");
    // CD8: ไม่มีหน้าต่างข้ามเที่ยงคืน — แบ่งเป็น 2 กติกา
    if (f >= t) return bad("เวลาจบต้องหลังเวลาเริ่มในวันเดียวกัน (ข้ามเที่ยงคืนให้แยกเป็น 2 โปร)", "timeTo");
    timeFrom = tf as string;
    timeTo = tt as string;
  }
  return {
    ok: true,
    value: { id, name, kind: raw.kind as PriceRuleKind, active, priority, productIds, categoryIds, channelCodes, unitIds, adjust, valueSatang, valueBp, startsAt, endsAt, weekdays, timeFrom, timeTo },
  };
}

/** แถว PosPriceRule → DTO 18 คีย์ (วันที่ ISO · archived boolean) */
export function priceRuleItem(r: PriceRuleLike & { kind: string }): PriceRuleItem {
  const iso = (v: Date | string | null) => {
    const ms = msOf(v);
    return ms === null ? null : new Date(ms).toISOString();
  };
  return {
    id: r.id,
    name: r.name,
    kind: r.kind as PriceRuleKind,
    active: r.active,
    priority: r.priority,
    productIds: [...r.productIds],
    categoryIds: [...r.categoryIds],
    channelCodes: [...r.channelCodes],
    unitIds: [...r.unitIds],
    adjust: r.adjust as PriceRuleAdjust,
    valueSatang: r.valueSatang,
    valueBp: r.valueBp,
    startsAt: iso(r.startsAt),
    endsAt: iso(r.endsAt),
    weekdays: [...r.weekdays],
    timeFrom: r.timeFrom,
    timeTo: r.timeTo,
    archived: r.archivedAt !== null && r.archivedAt !== undefined,
  };
}

/** % ที่จอแสดงข้างราคาช่องทาง (round((p − base)/base) เป็น basis point) · ฐาน 0/null = null */
export const channelMarkupBpOf = (priceSatang: number | null, baseSatang: number | null): number | null =>
  priceSatang === null || baseSatang === null || baseSatang <= 0 ? null : Math.round(((priceSatang - baseSatang) * BP_FULL) / baseSatang);
