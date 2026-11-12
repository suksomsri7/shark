// ─────────────────────────────────────────────────────────────
// trips/products-core.ts — ชนิด · ค่าคงที่ · ฟังก์ชันบริสุทธิ์ของสินค้าทัวร์ (RUN TRIPS T0.2)
// ใบสั่ง ledger/trips-briefs/T0.2.md §2 §3 · 🔴 บริสุทธิ์: import type เท่านั้น · ไม่มี I/O
// 🔴 ไม่มีตัวเลขธุรกิจ (อายุ/ราคา/%) ในไฟล์นี้ — ช่วงอายุมาจากค่าตั้ง T27 ที่ผู้เรียกส่งเข้ามา
// ─────────────────────────────────────────────────────────────

export const CONTENT_SECTIONS = ["title", "summary", "itinerary", "includes", "meeting"] as const;
export type ContentSection = (typeof CONTENT_SECTIONS)[number];

/** ข้อมูลชี้ชวนขายทัวร์ ม.26 (TRIPS-DEFAULTS T58) — แสดงอย่างเดียว ไม่บล็อกการขาย */
export const PROSPECTUS_ITEMS = [
  "OPERATOR_LICENSE",
  "DURATION",
  "PRICE_PAYMENT",
  "VEHICLE",
  "ITINERARY",
  "ACCOMMODATION_MEALS",
  "GUIDE",
  "MIN_PAX",
  "INSURANCE",
] as const;
export type ProspectusItem = (typeof PROSPECTUS_ITEMS)[number];

export const PUBLISH_MISSING = ["TITLE_TH", "OPTION", "SEAT_PAX_TYPE"] as const;
export type PublishMissing = (typeof PUBLISH_MISSING)[number];

export const TRIP_PRODUCT_ERROR_CODES = [
  "INVALID_INPUT",
  "NOT_FOUND",
  "FORBIDDEN",
  "UNIT_NOT_TRIPS",
  "SLUG_TAKEN",
  "CURRENCY_NOT_ALLOWED",
  "CURRENCY_MISMATCH",
  "SOURCE_NOT_SUPPORTED",
  "PUBLISH_INCOMPLETE",
  "BAD_STATE",
  "CONFIRM_REQUIRED",
  "AGE_RANGE",
  "AGE_OVERLAP",
  "PAX_CODE_TAKEN",
  "UNKNOWN_PAX_TYPE",
  "LAST_ACTIVE_OPTION",
  "LAST_SEAT_PAX_TYPE",
  "PASS_THROUGH_FLAGS",
  "TAX_KIND_MISMATCH",
  "LOCALE_DISABLED",
  "BUSY",
] as const;
export type TripProductErrorCode = (typeof TRIP_PRODUCT_ERROR_CODES)[number];

export const PRODUCT_TYPES = ["TOUR", "LIVEABOARD", "ATTRACTION"] as const;
export type ProductType = (typeof PRODUCT_TYPES)[number];
export const SOURCE_KINDS = ["OWN", "SUPPLIER"] as const;
export type SourceKind = (typeof SOURCE_KINDS)[number];
export const PRODUCT_STATUSES = ["DRAFT", "ACTIVE", "ARCHIVED"] as const;
export type ProductStatus = (typeof PRODUCT_STATUSES)[number];
export const EXTRA_KINDS = ["PARK_FEE", "PORT_FEE", "FUEL", "EQUIPMENT", "NITROX", "TRANSFER", "COURSE", "INSURANCE", "OTHER"] as const;
export type ExtraKind = (typeof EXTRA_KINDS)[number];
export const EXTRA_BASES = ["PER_PAX", "PER_BOOKING", "PER_DAY", "PER_PAX_DAY", "PER_BOAT_NIGHT"] as const;
export type ExtraBasis = (typeof EXTRA_BASES)[number];
export const TAX_KINDS = ["VAT7", "EXEMPT", "NONE"] as const;
export type TaxKind = (typeof TAX_KINDS)[number];
/** ภาษาที่ระบบรู้จัก (ชุดเดียวกับ schema ของค่าตั้ง T2) — ภาษาที่ร้านเขียนได้จริง = T2 */
export const CONTENT_LOCALES = ["th", "en", "zh"] as const;
export type ContentLocale = (typeof CONTENT_LOCALES)[number];

/** รหัสประเภทคนเริ่มต้น (ค่าคงที่ที่ใบสั่ง §6 ยอมรับ — ไม่ใช่ตัวเลขธุรกิจ) */
export const DEFAULT_PAX_CODES = ["ADULT", "CHILD", "INFANT"] as const;
export type DefaultPaxCode = (typeof DEFAULT_PAX_CODES)[number];
export const DEFAULT_PAX_LABELS: Record<DefaultPaxCode, { th: string; en: string }> = {
  ADULT: { th: "ผู้ใหญ่", en: "Adult" },
  CHILD: { th: "เด็ก", en: "Child" },
  INFANT: { th: "ทารก", en: "Infant" },
};
/** ทารกไม่ใช้ที่นั่ง (จอ 16 "ไม่ใช้") */
export const DEFAULT_PAX_COUNTS_CAPACITY: Record<DefaultPaxCode, boolean> = { ADULT: true, CHILD: true, INFANT: false };

export type Ctx = { tenantId: string; actorUserId: string };
export type Fail = { ok: false; code: TripProductErrorCode; message: string; missing?: PublishMissing[] };
/** ชื่อ/ป้าย — ไทยบังคับ · เก็บเฉพาะภาษาที่มีข้อความ */
export type I18n = { th: string; en?: string | null; zh?: string | null };
/** ส่วนเนื้อหา (สรุป/กำหนดการ/รวม/จุดนัดพบ) — ภาษาใดก็ได้ (ลบไทยของส่วนได้ · ลบไทยของชื่อไม่ได้) */
export type I18nText = { th?: string | null; en?: string | null; zh?: string | null };
export type Localized = { text: string | null; locale: string; fallback: boolean };

export type ProductBody = { summary?: I18nText; itinerary?: I18nText; includes?: I18nText; photoFileIds?: string[] };
export type MeetingPoint = { text: I18nText; lat?: number; lng?: number };
export type Disclosure = { accommodationMeals?: I18nText; guides?: I18nText };

/** ค่าตั้ง T27 `trips.pax.childAgeBand` */
export type T27Value = { infantBelow: number; childFrom: number; childTo: number };
export type Band = { from: number; to: number | null; source: "PAX_TYPE" | "SETTING" | "NONE" };

export type OptionDTO = {
  id: string;
  name: I18n;
  display: Localized;
  durationMin: number | null;
  nights: number | null;
  sortOrder: number;
  active: boolean;
};
export type PaxTypeDTO = {
  id: string;
  code: string;
  label: I18n;
  display: Localized;
  ageMin: number | null;
  ageMax: number | null;
  band: Band;
  countsCapacity: boolean;
  active: boolean;
  sortOrder: number;
};
export type ExtraDTO = {
  id: string;
  productId: string | null;
  kind: ExtraKind;
  basis: ExtraBasis;
  mandatory: boolean;
  priceMinor: number;
  currency: string;
  commissionable: boolean;
  discountable: boolean;
  passThrough: boolean;
  taxKind: TaxKind;
  stockItemId: string | null;
  name: I18n;
  note: I18n | null;
  display: Localized;
  active: boolean;
  sortOrder: number;
  commissionPct: number;
  paxPrices: Record<string, number> | null;
};
export type ProductDTO = {
  id: string;
  unitId: string;
  slug: string;
  productType: ProductType;
  sourceKind: SourceKind;
  status: ProductStatus;
  currency: string;
  deepDive: boolean;
  crossBorder: boolean;
  title: I18n;
  body: ProductBody;
  meetingPoint: MeetingPoint | null;
  disclosure: Disclosure | null;
  options: OptionDTO[];
  paxTypes: PaxTypeDTO[];
  extras: ExtraDTO[];
  content: Record<ContentSection, Localized>;
  translation: { locale: string; missing: ContentSection[] };
  publishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};
export type ProductListItem = {
  id: string;
  slug: string;
  productType: ProductType;
  status: ProductStatus;
  title: Localized;
  optionCount: number;
  missingCount: number;
};

// ═══════════════ ฟังก์ชันบริสุทธิ์ ═══════════════

const textOf = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v : null);

/** อ่านข้อความภาษาที่ขอ · ไม่มี ⇒ ไทย + fallback · ขอไทย ⇒ fallback false เสมอ · ไม่มีทั้งคู่ ⇒ text null */
export function localize(i18n: I18nText | I18n | null | undefined, locale: string = "th"): Localized {
  const rec: Record<string, unknown> = i18n && typeof i18n === "object" ? i18n : {};
  const want = textOf(rec[locale]);
  if (want !== null) return { text: want, locale, fallback: false };
  if (locale === "th") return { text: null, locale, fallback: false };
  const th = textOf(rec.th);
  if (th !== null) return { text: th, locale: "th", fallback: true };
  return { text: null, locale, fallback: false };
}

/** มีข้อความภาษานี้ไหม (ตัดช่องว่างแล้วไม่ว่าง) */
export function hasLocale(i18n: I18nText | I18n | null | undefined, locale: string): boolean {
  if (!i18n || typeof i18n !== "object") return false;
  return textOf((i18n as Record<string, unknown>)[locale]) !== null;
}

/**
 * ช่วงอายุที่ใช้จริงของประเภทคน (CC L-27): มีคอลัมน์ใดไม่ null ⇒ คอลัมน์ชนะ (PAX_TYPE)
 * ว่างทั้งคู่: ADULT/CHILD/INFANT ⇒ จากค่าตั้ง T27 (SETTING) · รหัสอื่น ⇒ ไม่มีช่วง (NONE)
 */
export function effectivePaxBand(pt: { code: string; ageMin: number | null; ageMax: number | null }, band: T27Value): Band {
  if (pt.ageMin !== null || pt.ageMax !== null) return { from: pt.ageMin ?? 0, to: pt.ageMax, source: "PAX_TYPE" };
  switch (pt.code) {
    case "ADULT":
      return { from: band.childTo + 1, to: null, source: "SETTING" };
    case "CHILD":
      return { from: band.childFrom, to: band.childTo, source: "SETTING" };
    case "INFANT":
      return { from: 0, to: band.infantBelow - 1, source: "SETTING" };
    default:
      return { from: 0, to: null, source: "NONE" };
  }
}

/** ช่วงสองช่วงซ้อนกันไหม (ปิดทั้งสองข้าง · to null = ไม่มีเพดาน · ติดกัน 11|12 ไม่ซ้อน) */
export function bandsOverlap(a: Band, b: Band): boolean {
  if (a.source === "NONE" || b.source === "NONE") return false;
  const aTo = a.to ?? Number.POSITIVE_INFINITY;
  const bTo = b.to ?? Number.POSITIVE_INFINITY;
  return a.from <= bTo && b.from <= aTo;
}

/** ช่วยเลือกประเภทคนจากอายุ (ระบบไม่ตรวจอายุ · จอ 16) — ตัว active ที่มีช่วงครอบ · ไม่มี ⇒ null */
export function paxTypeForAge<T extends { active: boolean; band: Band }>(paxTypes: readonly T[], age: number): T | null {
  for (const pt of paxTypes) {
    if (!pt.active || pt.band.source === "NONE") continue;
    if (pt.band.from <= age && age <= (pt.band.to ?? Number.POSITIVE_INFINITY)) return pt;
  }
  return null;
}

/** ชี้ชวน 9 ข้อ ม.26 — แสดงอย่างเดียว ไม่บล็อก (ราชา 7/9 = 78) */
export function prospectusChecklist(done: Partial<Record<ProspectusItem, boolean>>): {
  items: { code: ProspectusItem; done: boolean }[];
  done: number;
  total: number;
  pct: number;
} {
  const src: Partial<Record<string, unknown>> = done && typeof done === "object" ? done : {};
  const items = PROSPECTUS_ITEMS.map((code) => ({ code, done: src[code] === true }));
  const n = items.filter((x) => x.done).length;
  const total = items.length;
  return { items, done: n, total, pct: Math.round((n / total) * 100) };
}

/** ข้อความของส่วนเนื้อหาจากคอลัมน์ของสินค้า */
export function sectionI18n(
  p: { title: I18n | I18nText; body: ProductBody; meetingPoint: MeetingPoint | null },
  s: ContentSection,
): I18nText | I18n | null {
  switch (s) {
    case "title":
      return p.title;
    case "meeting":
      return p.meetingPoint?.text ?? null;
    default:
      return p.body[s] ?? null;
  }
}

/** ส่วนที่มีไทยแต่ไม่มีภาษาที่ขอ (ลำดับ CONTENT_SECTIONS) · ขอไทย ⇒ [] */
export function missingTranslations(p: { title: I18n | I18nText; body: ProductBody; meetingPoint: MeetingPoint | null }, locale: string): ContentSection[] {
  if (locale === "th") return [];
  return CONTENT_SECTIONS.filter((s) => {
    const v = sectionI18n(p, s);
    return hasLocale(v, "th") && !hasLocale(v, locale);
  });
}
