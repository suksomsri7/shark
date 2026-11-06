// SVC H.1 ▸ ราคาโรงแรม — ฟังก์ชันคิดราคาแบบ pure (ใบสั่ง ledger/svc-briefs/svc-brief-h.1.md §2 มติ 1–6 · §3)
//   • ไม่แตะฐาน · ไม่อ่านนาฬิกาเครื่อง (today/วันที่ทุกตัวเป็นสตริง "YYYY-MM-DD" ไทย) · วันในสัปดาห์คิดจากสตริงด้วยเลขจำนวนเต็มล้วน
//   • เงินเป็นสตางค์ Int ทุกจุด · ปัดตาม rooms.money.rounding ด้วยเลขจำนวนเต็ม (ไม่ผ่านทศนิยมลอย)
//   • ลำดับคิดราคา 1 คืน (S:826 + มติ 1): แก้มือ (แผนตรง → ทุกแผน) → ฤดู ACTIVE priority สูงสุด (เสมอ ⇒ dateStart ล่าสุด)
//     → แถว HotelRate (แผน, ประเภท, ฤดู) → (แผน, ประเภท, null) → ช่องวันหยุด/สุดสัปดาห์/ธรรมดา → ไม่มีแถวเลย ⇒ ราคาฐานจากค่าตั้ง (FALLBACK)
//     → ไม่มีราคาฐาน ⇒ null (ขายไม่ได้) · + เตียงเสริม × ราคาเตียงเสริมของประเภท
//   • โมดูลอื่นใช้ผ่าน facade `@/lib/modules/hotel` เท่านั้น

export type RoundingMode = "SATANG" | "BAHT_HALF_UP" | "BAHT_DOWN";
export type PriceSource = "RATE" | "OVERRIDE" | "FALLBACK";
export type PriceBucket = "weekday" | "weekend" | "holiday";

/** แถวแผนราคา (ชื่อฟิลด์ = คอลัมน์ HotelRatePlan) */
export type RatePlanRow = {
  id: string;
  code: string;
  name: string;
  isDefault: boolean;
  includeBreakfast: boolean;
  minNights: number | null;
  maxNights: number | null;
  depositKind: string;
  depositValue: number;
  status: string;
  visibility?: unknown;
};
/** แถวฤดู (dateStart/dateEnd = "YYYY-MM-DD" · รวมวันจบ) */
export type SeasonRow = { id: string; name: string; dateStart: string; dateEnd: string; priority: number; minNights?: number | null; status?: string };
export type RateRow = {
  ratePlanId: string;
  roomTypeId: string;
  seasonId: string | null;
  priceWeekdaySatang: number;
  priceWeekendSatang: number;
  priceHolidaySatang: number | null;
};
export type OverrideRow = { roomTypeId: string; ratePlanId: string | null; date: string; priceSatang: number; reason?: string | null; setById?: string | null };
export type RoomTypeInfo = { baseOccupancy: number; maxOccupancy: number | null; extraBedAllowed: boolean; extraBedPriceSatang: number };
export type FallbackRate = { baseRateSatang: number | null; dayOfWeekAdjustBp: number[] };

export type PricingContext = {
  /** 0 = อาทิตย์ (rooms.hotel.weekendDays) */
  weekendDays: number[];
  rounding: RoundingMode;
  /** วันนี้ไทย "YYYY-MM-DD" */
  today: string;
  /** คีย์ = roomTypeId */
  roomTypes: Record<string, RoomTypeInfo>;
  plans: RatePlanRow[];
  seasons: SeasonRow[];
  holidays: Set<string>;
  rates: RateRow[];
  overrides: OverrideRow[];
  /** คีย์ = roomTypeId · ค่าตั้ง rooms.hotel.baseRate / dayOfWeekAdjustBp (chain ROOM_TYPE → RATE_PLAN) */
  fallback: Record<string, FallbackRate>;
};

export type NightPrice = { priceSatang: number; source: PriceSource; seasonId: string | null; bucket: PriceBucket | null };
export type QuoteNight = NightPrice & { date: string };
export type QuoteLimits = { minNights: number | null; maxNights: number | null; closedToArrival: boolean; maxAdvanceBookingDays: number };
export type QuoteInput = { roomTypeId: string; ratePlanId: string; checkIn: string; checkOut: string; extraBeds?: number; limits: QuoteLimits };
export type QuoteOk = {
  ok: true;
  roomTypeId: string;
  ratePlanId: string;
  checkIn: string;
  checkOut: string;
  extraBeds: number;
  nights: QuoteNight[];
  nightsTotal: number;
};
export type QuoteError = "INVALID_RANGE" | "TOO_FAR" | "CLOSED_TO_ARRIVAL" | "MIN_NIGHTS" | "MAX_NIGHTS" | "EXTRA_BED_NOT_ALLOWED" | "OVER_OCCUPANCY" | "NO_RATE";
export type QuoteFail = { ok: false; error: QuoteError; messageTh: string; dates?: string[]; minNights?: number; maxNights?: number };

export type DepositKind = "NONE" | "FIRST_NIGHT" | "FULL" | "PERCENT" | "FIXED_AMOUNT";
/** รูปเดียวกับค่าตั้ง rooms.hotel.deposit */
export type DepositPolicy = { kind: DepositKind | string; percentBp?: number; amountSatang?: number };
export type CancelRule = { daysBefore: number; refundBp: number };
export type TaxMode = "INCLUSIVE" | "EXCLUSIVE";
export type TaxPolicy = { mode: TaxMode | string; vatBp: number; serviceChargeBp: number };
export type TaxLine = { type: "SERVICE_CHARGE" | "TAX"; amountSatang: number };

// ───────────────────────── วันที่ (pure · ไม่ใช้ Date) ─────────────────────────
const YMD = /^(\d{4})-(\d{2})-(\d{2})$/;
const isLeap = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
const MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/** "YYYY-MM-DD" ที่มีจริงในปฏิทิน */
export function isYmd(s: unknown): s is string {
  if (typeof s !== "string") return false;
  const m = YMD.exec(s);
  if (!m) return false;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1) return false;
  return d <= (mo === 2 && isLeap(y) ? 29 : MONTH_DAYS[mo - 1]);
}

/** จำนวนวันนับจาก 1970-01-01 (days_from_civil · จำนวนเต็มล้วน) */
export function dayNumber(ymd: string): number {
  const m = YMD.exec(ymd);
  if (!m) return Number.NaN;
  let y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  y -= mo <= 2 ? 1 : 0;
  const era = Math.floor(y / 400);
  const yoe = y - era * 400;
  const mp = (mo + 9) % 12;
  const doy = Math.floor((153 * mp + 2) / 5) + d - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

/** วันที่จากเลขวัน (civil_from_days) */
export function ymdOfDayNumber(z0: number): string {
  const z = z0 + 719468;
  const era = Math.floor(z / 146097);
  const doe = z - era * 146097;
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365);
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const d = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const mo = mp < 10 ? mp + 3 : mp - 9;
  const y = yoe + era * 400 + (mo <= 2 ? 1 : 0);
  return `${String(y).padStart(4, "0")}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export const addDaysYmd = (ymd: string, n: number): string => ymdOfDayNumber(dayNumber(ymd) + n);
/** 0 = อาทิตย์ … 6 = เสาร์ (1970-01-01 = พฤหัสบดี) */
export const dayOfWeekOf = (ymd: string): number => (((dayNumber(ymd) + 4) % 7) + 7) % 7;
/** คืนในช่วง [checkIn, checkOut) */
export function nightDates(checkIn: string, checkOut: string): string[] {
  const a = dayNumber(checkIn);
  const b = dayNumber(checkOut);
  const out: string[] = [];
  for (let n = a; n < b; n++) out.push(ymdOfDayNumber(n));
  return out;
}

// ───────────────────────── ปัดเศษ (จำนวนเต็มล้วน) ─────────────────────────
/** ปัด num/den (≥ 0 · den > 0) ตามโหมด — SATANG = ปัดครึ่งขึ้นเป็นสตางค์ · BAHT_HALF_UP = ครึ่งขึ้นเป็นบาท · BAHT_DOWN = ตัดเป็นบาท */
export function roundFraction(num: number, den: number, mode: RoundingMode | string): number {
  if (!(den > 0) || !Number.isFinite(num)) return 0;
  const n = Math.max(0, Math.trunc(num));
  const d = Math.trunc(den);
  if (mode === "BAHT_DOWN") return Math.floor(n / (100 * d)) * 100;
  if (mode === "BAHT_HALF_UP") return Math.floor((2 * n + 100 * d) / (200 * d)) * 100;
  return Math.floor((2 * n + d) / (2 * d));
}

const int0 = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? Math.max(0, Math.trunc(v)) : 0);

// ───────────────────────── ฤดู / ราคา 1 คืน ─────────────────────────
const isActive = (s: { status?: string }) => s.status === undefined || s.status === "ACTIVE";

/** ฤดู ACTIVE ที่ครอบวัน (รวมวันจบ) — priority สูงสุด · เสมอ ⇒ dateStart ล่าสุด · เสมออีก ⇒ id */
export function resolveSeason<S extends SeasonRow>(seasons: readonly S[], date: string): S | null {
  let best: S | null = null;
  for (const s of seasons ?? []) {
    if (!isActive(s) || !(s.dateStart <= date && date <= s.dateEnd)) continue;
    if (
      !best ||
      s.priority > best.priority ||
      (s.priority === best.priority && (s.dateStart > best.dateStart || (s.dateStart === best.dateStart && s.id > best.id)))
    )
      best = s;
  }
  return best;
}

const holidayHas = (h: PricingContext["holidays"] | readonly string[] | undefined, d: string): boolean =>
  h instanceof Set ? h.has(d) : Array.isArray(h) ? h.includes(d) : false;

/** ราคา 1 คืนก่อนเตียงเสริม — null = ขายไม่ได้ */
function basePrice(ctx: PricingContext, roomTypeId: string, ratePlanId: string, date: string): NightPrice | null {
  const ovs = ctx.overrides ?? [];
  const ov =
    ovs.find((o) => o.roomTypeId === roomTypeId && o.ratePlanId === ratePlanId && o.date === date) ??
    ovs.find((o) => o.roomTypeId === roomTypeId && o.ratePlanId === null && o.date === date);
  if (ov) return { priceSatang: int0(ov.priceSatang), source: "OVERRIDE", seasonId: null, bucket: null };

  const season = resolveSeason(ctx.seasons ?? [], date);
  const rates = ctx.rates ?? [];
  const seasonRow = season ? rates.find((r) => r.ratePlanId === ratePlanId && r.roomTypeId === roomTypeId && r.seasonId === season.id) : undefined;
  const row = seasonRow ?? rates.find((r) => r.ratePlanId === ratePlanId && r.roomTypeId === roomTypeId && r.seasonId === null);
  if (row) {
    const seasonId = seasonRow && season ? season.id : null;
    if (holidayHas(ctx.holidays, date) && row.priceHolidaySatang !== null && row.priceHolidaySatang !== undefined) {
      return { priceSatang: int0(row.priceHolidaySatang), source: "RATE", seasonId, bucket: "holiday" };
    }
    if ((ctx.weekendDays ?? []).includes(dayOfWeekOf(date))) return { priceSatang: int0(row.priceWeekendSatang), source: "RATE", seasonId, bucket: "weekend" };
    return { priceSatang: int0(row.priceWeekdaySatang), source: "RATE", seasonId, bucket: "weekday" };
  }

  const fb = ctx.fallback?.[roomTypeId];
  if (!fb || fb.baseRateSatang === null || fb.baseRateSatang === undefined) return null;
  const bp = Math.trunc(fb.dayOfWeekAdjustBp?.[dayOfWeekOf(date)] ?? 0);
  const base = int0(fb.baseRateSatang);
  return { priceSatang: roundFraction(base * (10_000 + bp), 10_000, ctx.rounding), source: "FALLBACK", seasonId: null, bucket: null };
}

/** ราคา 1 คืน (+ เตียงเสริม × ราคาเตียงเสริมของประเภท) — null = ขายไม่ได้ (storefront ซ่อน · จอราคาเตือน) */
export function resolveNightPrice(
  ctx: PricingContext,
  i: { roomTypeId: string; ratePlanId: string; date: string; extraBeds?: number },
): NightPrice | null {
  if (!ctx || !i || !isYmd(i.date)) return null;
  const p = basePrice(ctx, i.roomTypeId, i.ratePlanId, i.date);
  if (!p) return null;
  const beds = int0(i.extraBeds);
  if (beds === 0) return p;
  const bedPrice = int0(ctx.roomTypes?.[i.roomTypeId]?.extraBedPriceSatang);
  return { ...p, priceSatang: p.priceSatang + beds * bedPrice };
}

// ───────────────────────── ใบเสนอราคาการเข้าพัก ─────────────────────────
const fail = (error: QuoteError, messageTh: string, extra: Partial<QuoteFail> = {}): QuoteFail => ({ ok: false, error, messageTh, ...extra });

/** ราคาทุกคืน [checkIn, checkOut) + เงื่อนไขขาย (มติ 3 · §11 #4: ขั้นต่ำคืน = max(แผน, ฤดูที่ครอบคืนแรก, ค่าตั้ง)) */
export function quoteStay(ctx: PricingContext, i: QuoteInput): QuoteOk | QuoteFail {
  if (!ctx || !i || !isYmd(i.checkIn) || !isYmd(i.checkOut) || dayNumber(i.checkOut) <= dayNumber(i.checkIn)) {
    return fail("INVALID_RANGE", "วันเช็กเอาต์ต้องอยู่หลังวันเช็กอิน");
  }
  const limits: QuoteLimits = i.limits ?? { minNights: null, maxNights: null, closedToArrival: false, maxAdvanceBookingDays: 365 };
  const beds = int0(i.extraBeds);
  if (beds > 0) {
    const rt = ctx.roomTypes?.[i.roomTypeId];
    if (!rt || !rt.extraBedAllowed) return fail("EXTRA_BED_NOT_ALLOWED", "ห้องประเภทนี้เสริมเตียงไม่ได้");
    if (rt.maxOccupancy !== null && rt.maxOccupancy !== undefined && int0(rt.baseOccupancy) + beds > rt.maxOccupancy) {
      return fail("OVER_OCCUPANCY", `ห้องประเภทนี้พักได้สูงสุด ${rt.maxOccupancy} คน`);
    }
  }
  if (isYmd(ctx.today) && Number.isFinite(limits.maxAdvanceBookingDays) && dayNumber(i.checkIn) - dayNumber(ctx.today) > limits.maxAdvanceBookingDays) {
    return fail("TOO_FAR", `จองล่วงหน้าได้ไม่เกิน ${limits.maxAdvanceBookingDays} วัน`);
  }
  if (limits.closedToArrival) return fail("CLOSED_TO_ARRIVAL", "วันนี้ปิดรับเช็กอินสำหรับแผนราคานี้");

  const dates = nightDates(i.checkIn, i.checkOut);
  const plan = (ctx.plans ?? []).find((p) => p.id === i.ratePlanId) ?? null;
  const firstSeason = resolveSeason(ctx.seasons ?? [], i.checkIn);
  const minNights = Math.max(plan?.minNights ?? 0, firstSeason?.minNights ?? 0, limits.minNights ?? 0);
  if (dates.length < minNights) return fail("MIN_NIGHTS", `ต้องพักอย่างน้อย ${minNights} คืน`, { minNights });
  const maxes = [plan?.maxNights, limits.maxNights].filter((x): x is number => typeof x === "number" && x > 0);
  const maxNights = maxes.length ? Math.min(...maxes) : null;
  if (maxNights !== null && dates.length > maxNights) return fail("MAX_NIGHTS", `พักได้ไม่เกิน ${maxNights} คืนต่อการจอง`, { maxNights });

  const nights: QuoteNight[] = [];
  const missing: string[] = [];
  for (const date of dates) {
    const p = resolveNightPrice(ctx, { roomTypeId: i.roomTypeId, ratePlanId: i.ratePlanId, date, extraBeds: beds });
    if (!p) missing.push(date);
    else nights.push({ date, ...p });
  }
  if (missing.length) return fail("NO_RATE", "ยังไม่ได้ตั้งราคาห้องประเภทนี้บางคืน", { dates: missing });
  return {
    ok: true,
    roomTypeId: i.roomTypeId,
    ratePlanId: i.ratePlanId,
    checkIn: i.checkIn,
    checkOut: i.checkOut,
    extraBeds: beds,
    nights,
    nightsTotal: nights.reduce((a, n) => a + n.priceSatang, 0),
  };
}

// ───────────────────────── มัดจำ · คืนเงิน · ภาษี ─────────────────────────
/**
 * มัดจำของกลุ่มการจอง (มติ 4) — FIRST_NIGHT = ราคาคืนแรกรวมทุกห้อง (S:218) · PERCENT = bp ของยอดรวม ปัดตามโหมด
 * FIXED_AMOUNT = amountSatang (ไม่เกินยอดรวม) · FULL = ยอดรวม · NONE/อื่น = 0
 */
export function depositFor(quotes: readonly QuoteOk[], policy: DepositPolicy, rounding: RoundingMode | string): number {
  const qs = (quotes ?? []).filter((q) => q && q.ok === true);
  const total = qs.reduce((a, q) => a + int0(q.nightsTotal), 0);
  switch (policy?.kind) {
    case "FIRST_NIGHT":
      return qs.reduce((a, q) => a + int0(q.nights?.[0]?.priceSatang), 0);
    case "FULL":
      return total;
    case "PERCENT": {
      const bp = Math.min(10_000, int0(policy.percentBp));
      return Math.min(total, roundFraction(total * bp, 10_000, rounding));
    }
    case "FIXED_AMOUNT":
      return Math.min(total, int0(policy.amountSatang));
    default:
      return 0;
  }
}

/** นโยบายมัดจำจากแผนราคา (kind ไม่ระบุ ⇒ ใช้ค่าตั้ง) — depositValue = bp (PERCENT) หรือสตางค์ (FIXED_AMOUNT) */
export function depositPolicyOf(plan: Pick<RatePlanRow, "depositKind" | "depositValue"> | null | undefined, fromSettings: DepositPolicy): DepositPolicy {
  if (!plan || !plan.depositKind) return fromSettings;
  if (plan.depositKind === "PERCENT") return { kind: "PERCENT", percentBp: int0(plan.depositValue) };
  if (plan.depositKind === "FIXED_AMOUNT") return { kind: "FIXED_AMOUNT", amountSatang: int0(plan.depositValue) };
  return { kind: plan.depositKind };
}

/**
 * คืนเงินเมื่อยกเลิก (มติ 5) — daysBefore = วันเข้า − วันยกเลิก (วันเดียวกัน = 0 · หลังวันเข้า = ติดลบ ⇒ 0)
 * กฎที่ใช้ = daysBefore ≥ rule.daysBefore ที่ rule.daysBefore มากสุด · ไม่มีกฎเข้า/กฎว่าง ⇒ 0 · คืน = paid × refundBp / 10000 ปัดลง
 * กฎมาจาก snapshot ของการจอง (ผู้เรียกส่งมา) — ไม่อ่านฐาน
 */
export function refundFor(i: { paidSatang: number; checkInDate: string; cancelAt: string; rules: readonly CancelRule[] }): {
  refundSatang: number;
  ruleUsed: CancelRule | null;
  daysBefore: number;
} {
  if (!i || !isYmd(i.checkInDate) || !isYmd(i.cancelAt)) return { refundSatang: 0, ruleUsed: null, daysBefore: 0 };
  const daysBefore = dayNumber(i.checkInDate) - dayNumber(i.cancelAt);
  let used: CancelRule | null = null;
  if (daysBefore >= 0) {
    for (const r of i.rules ?? []) {
      if (!r || !Number.isInteger(r.daysBefore) || r.daysBefore > daysBefore) continue;
      if (!used || r.daysBefore > used.daysBefore) used = r;
    }
  }
  if (!used) return { refundSatang: 0, ruleUsed: null, daysBefore };
  const bp = Math.min(10_000, int0(used.refundBp));
  return { refundSatang: Math.floor((int0(i.paidSatang) * bp) / 10_000), ruleUsed: { daysBefore: used.daysBefore, refundBp: used.refundBp }, daysBefore };
}

/**
 * ภาษี (มติ 6 · Q1) — INCLUSIVE: ไม่มีบรรทัดบวก · vatIncludedSatang = subtotal × vat / (10000 + vat) (รายงานเฉย ๆ)
 * EXCLUSIVE: SERVICE_CHARGE = subtotal × sc → TAX = (subtotal + sc) × vat → total · ปัดทุกขั้นตามโหมด · บรรทัด 0 ไม่ออก
 * ค่ามาจาก taxSnapshot ของการจอง (ไม่ใช่ค่าตั้งสด)
 */
export function taxLines(subtotalSatang: number, tax: TaxPolicy, rounding: RoundingMode | string): { lines: TaxLine[]; totalSatang: number; vatIncludedSatang: number } {
  const sub = int0(subtotalSatang);
  const vat = Math.min(10_000, int0(tax?.vatBp));
  const sc = Math.min(10_000, int0(tax?.serviceChargeBp));
  if (tax?.mode === "EXCLUSIVE") {
    const scAmt = roundFraction(sub * sc, 10_000, rounding);
    const vatAmt = roundFraction((sub + scAmt) * vat, 10_000, rounding);
    const lines: TaxLine[] = [];
    if (scAmt > 0) lines.push({ type: "SERVICE_CHARGE", amountSatang: scAmt });
    if (vatAmt > 0) lines.push({ type: "TAX", amountSatang: vatAmt });
    return { lines, totalSatang: sub + scAmt + vatAmt, vatIncludedSatang: 0 };
  }
  return { lines: [], totalSatang: sub, vatIncludedSatang: roundFraction(sub * vat, 10_000 + vat, rounding) };
}
