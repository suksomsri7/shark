// ─────────────────────────────────────────────────────────────
// trips/products.ts — บริการสินค้าทัวร์ · ตัวเลือก · ประเภทคน · รายการเสริม · เนื้อหาไทย/อังกฤษ (RUN TRIPS T0.2)
// ใบสั่ง ledger/trips-briefs/T0.2.md (มติ §11 §12 ชนะ) · สัญญา CC §B.1 §E §L-27
//
// 🔴 ทุกฟังก์ชัน `(ctx, input) => Promise<{ok:true,…} | Fail>` · ไม่ throw ยกเว้นบั๊ก
// 🔴 ด่าน (ลำดับตายตัว): Membership สด → หน่วยของร้าน + canAccessUnit (ไม่ได้ ⇒ NOT_FOUND) → ชนิด TRIPS → evaluate (⇒ FORBIDDEN)
// 🔴 tenantDb({tenantId, unitId}) เท่านั้น (ไม่มี prisma ดิบ) ⇒ id ลูกของหน่วยอื่น = NOT_FOUND โดยธรรมชาติ
// 🔴 ไม่มีการลบแถว Trip* ใด ๆ (มติ §11 ข้อ 8) — สินค้าออกด้วย ARCHIVED · ลูกออกด้วย active=false
// 🔴 ข้อมูลจากผู้ใช้ผ่าน zod (strict) แล้ว "เลือกฟิลด์" ก่อนเขียนเสมอ — ไม่ส่ง object ของผู้ใช้เข้า update({data}) ตรง ๆ (TRIPS-RUN §3)
// 🔴 ตัวเลขธุรกิจ (อายุ · % คอมฯ · ธงตั้งต้น · สกุล · ภาษา) มาจากค่าตั้ง T27 T44 T3 T2 เท่านั้น
// ─────────────────────────────────────────────────────────────
import { Prisma, type TripProduct } from "@prisma/client";
import { z } from "zod";
import { tenantDb } from "@/lib/core/db";
import { emitOutbox } from "@/lib/core/outbox";
import { canAccessUnit, evaluate, type MembershipCtx } from "@/lib/core/rbac";
import { resolveSetting, resolveSettings } from "@/lib/core/settings";
import {
  CONTENT_LOCALES,
  CONTENT_SECTIONS,
  DEFAULT_PAX_CODES,
  DEFAULT_PAX_COUNTS_CAPACITY,
  DEFAULT_PAX_LABELS,
  EXTRA_BASES,
  EXTRA_KINDS,
  PRODUCT_STATUSES,
  PRODUCT_TYPES,
  SOURCE_KINDS,
  TAX_KINDS,
  bandsOverlap,
  effectivePaxBand,
  hasLocale,
  isEmptyBand,
  localize,
  missingTranslations,
  nonThaiLocales,
  sectionI18n,
  type Band,
  type ContentSection,
  type Ctx,
  type Disclosure,
  type ExtraBasis,
  type ExtraDTO,
  type ExtraKind,
  type Fail,
  type I18n,
  type I18nText,
  type Localized,
  type MeetingPoint,
  type OptionDTO,
  type PaxTypeDTO,
  type ProductBody,
  type ProductDTO,
  type ProductListItem,
  type ProductStatus,
  type ProductType,
  type PublishMissing,
  type SourceKind,
  type T27Value,
  type TaxKind,
  type TripProductErrorCode,
} from "./products-core";

// ═══════════════ ค่าคงที่ทางเทคนิค (ไม่ใช่ตัวเลขธุรกิจ) ═══════════════
const T2 = "trips.general.customerLocales";
const T3 = "trips.general.currencies";
const T27 = "trips.pax.childAgeBand";
const T44 = "trips.line.defaults";
const TITLE_MAX = 160;
const TEXT_MAX = 8000;
const PG_INT_MAX = 2_147_483_647;
/** เหตุผลเก็บสินค้าที่เคยเปิดขาย/ถูกอ้าง (ตัดช่องว่างแล้ว) — ใบสั่ง §10 ข้อ 11 · มติ §11 ข้อ 11 */
const ARCHIVE_REASON_MIN = 10;
const TX_OPTS = { maxWait: 20_000, timeout: 40_000 } as const;

type Tx = Prisma.TransactionClient;
type Ok<T extends object = Record<never, never>> = { ok: true } & T;
type Res<T extends object = Record<never, never>> = Promise<Ok<T> | Fail>;

const MSG: Record<TripProductErrorCode, string> = {
  INVALID_INPUT: "ข้อมูลยังไม่ครบหรือรูปแบบยังไม่ตรงกับที่ระบบรองรับ — ตรวจช่องที่กรอกแล้วลองอีกครั้ง",
  NOT_FOUND: "ไม่พบรายการนี้ในหน่วยที่เลือก — อาจยังไม่ได้สร้างหรือไม่ได้อยู่ในหน่วยนี้",
  FORBIDDEN: "บัญชีนี้ยังไม่ได้รับสิทธิ์ทำรายการนี้ — ติดต่อเจ้าของร้านหรือผู้จัดการเพื่อขอสิทธิ์",
  UNIT_NOT_TRIPS: "หน่วยนี้ไม่ใช่หน่วยทัวร์ — เลือกหน่วยทัวร์ของร้านแล้วลองอีกครั้ง",
  SLUG_TAKEN: "ชื่อลิงก์นี้มีสินค้าอื่นในร้านใช้อยู่แล้ว — ลองชื่อลิงก์อื่น",
  CURRENCY_NOT_ALLOWED: "สกุลเงินนี้ยังไม่ได้เปิดใช้กับสินค้านี้ — เปิดในค่าตั้งสกุลเงินของร้านก่อน (ทัวร์และสถานที่ใช้บาท)",
  CURRENCY_MISMATCH: "รายการเสริมของสินค้าใช้สกุลเงินเดียวกับสินค้า",
  SOURCE_NOT_SUPPORTED: "สินค้าจากผู้ให้บริการอื่นจะเปิดให้ใช้ในรุ่นถัดไป",
  PUBLISH_INCOMPLETE: "ยังเปิดขายไม่ได้ — ต้องมีชื่อภาษาไทย ตัวเลือกที่เปิดอยู่ และประเภทผู้เดินทางที่ใช้ที่นั่งอย่างน้อยอย่างละ 1",
  BAD_STATE: "สถานะของสินค้าเปลี่ยนไปแล้ว — โหลดหน้าใหม่แล้วลองอีกครั้ง",
  CONFIRM_REQUIRED: "สินค้านี้เคยเปิดขายหรือมีรอบ/ราคา/การจองอ้างอยู่ — ยืนยันและใส่เหตุผลอย่างน้อย 10 ตัวอักษรก่อนเก็บ",
  AGE_RANGE: "อายุเริ่มต้องไม่มากกว่าอายุสิ้นสุด",
  AGE_OVERLAP: "ช่วงอายุนี้ทับกับประเภทผู้เดินทางอื่นของสินค้า — ปรับช่วงให้ไม่ซ้อนกัน",
  PAX_CODE_TAKEN: "รหัสประเภทผู้เดินทางนี้มีอยู่แล้วในสินค้านี้",
  UNKNOWN_PAX_TYPE: "ราคาตามประเภทผู้เดินทางต้องใช้รหัสประเภทที่เปิดใช้อยู่ในสินค้านี้",
  LAST_ACTIVE_OPTION: "สินค้าที่เปิดขายต้องมีตัวเลือกที่เปิดอยู่อย่างน้อย 1 — ปิดขายสินค้าก่อนถ้าต้องการปิดตัวเลือกนี้",
  LAST_SEAT_PAX_TYPE: "สินค้าที่เปิดขายต้องมีประเภทผู้เดินทางที่ใช้ที่นั่งอย่างน้อย 1 — ปิดขายสินค้าก่อนถ้าต้องการเปลี่ยนรายการนี้",
  PASS_THROUGH_FLAGS: "เงินเก็บแทน (เช่น ค่าอุทยาน) ไม่คิดคอมมิชชันและลดราคาไม่ได้",
  TAX_KIND_MISMATCH: "ชนิดภาษีต้องเป็น \"ไม่มีภาษี\" เมื่อเป็นเงินเก็บแทนเท่านั้น",
  LOCALE_DISABLED: "ภาษานี้ยังไม่ได้เปิดใช้ในหน้าจองของร้าน — เปิดในค่าตั้งภาษาก่อน",
  BUSY: "มีการแก้ไขสินค้านี้พร้อมกันหลายรายการ — ลองอีกครั้งในอีกสักครู่",
  CURRENCY_LOCKED: "สินค้านี้เคยเปิดขายแล้ว สกุลเงินจึงเปลี่ยนไม่ได้ — สร้างสินค้าใหม่ถ้าต้องการขายในสกุลอื่น",
  PRODUCT_ARCHIVED: "สินค้านี้ถูกเก็บแล้ว — กู้คืนสินค้าก่อนสร้างรอบหรือราคาใหม่",
  OPTION_INACTIVE: "ตัวเลือกนี้ปิดใช้อยู่ — เปิดใช้ตัวเลือกก่อนสร้างรอบหรือราคาใหม่",
};
const fail = (code: TripProductErrorCode, extra?: { missing?: PublishMissing[]; message?: string }): Fail => ({
  ok: false,
  code,
  message: extra?.message ?? MSG[code],
  ...(extra?.missing ? { missing: extra.missing } : {}),
});
const isFail = (x: unknown): x is Fail => typeof x === "object" && x !== null && (x as { ok?: unknown }).ok === false;

// ═══════════════ zod (strict) ═══════════════
const ID = z.string().min(1).max(100);
const UNIT_ID = z.object({ unitId: ID });
/** id อ้างข้ามโมดูล (stockItemId · photoFileIds) — r2: ตรวจรูปแบบเท่านั้น (ยังไม่มี facade/เส้น import ให้ตรวจเจ้าของ · หนี้ X.2/T1.1) */
const REF_ID = z.string().regex(/^[A-Za-z0-9_-]{1,100}$/);
const SLUG = z.string().min(3).max(60).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const CURRENCY = z.string().regex(/^[A-Z]{3}$/);
const LOCALE = z.string().min(2).max(8);

const optText = (max: number) => z.string().trim().max(max).nullable().optional();
const cleanText = (v: { th?: string | null; en?: string | null; zh?: string | null }): I18nText => {
  const out: I18nText = {};
  for (const l of CONTENT_LOCALES) {
    const s = v[l];
    if (typeof s === "string" && s !== "") out[l] = s;
  }
  return out;
};
/** ชื่อ/ป้าย: ไทยบังคับ (ตัดช่องว่างแล้วไม่ว่าง) */
const i18nIn = (max: number) =>
  z
    .strictObject({ th: z.string().trim().min(1).max(max), en: optText(max), zh: optText(max) })
    .transform((v): I18n => {
      const out: I18n = { th: v.th };
      if (v.en) out.en = v.en;
      if (v.zh) out.zh = v.zh;
      return out;
    });
/** ส่วนเนื้อหา: ภาษาใดก็ได้ */
const textIn = z.strictObject({ th: optText(TEXT_MAX), en: optText(TEXT_MAX), zh: optText(TEXT_MAX) }).transform(cleanText);
// r2 ▸ updateProduct รวมทีละส่วน: ไม่ส่ง = คงเดิม · null (หรือว่าง) = ล้างส่วนนั้น · photoFileIds เปลี่ยนเฉพาะเมื่อส่ง ◂
const BODY_IN = z.strictObject({
  summary: textIn.nullable().optional(),
  itinerary: textIn.nullable().optional(),
  includes: textIn.nullable().optional(),
  photoFileIds: z.array(REF_ID).max(100).nullable().optional(),
});
const MEETING_IN = z
  .strictObject({ text: i18nIn(TEXT_MAX), lat: z.number().min(-90).max(90).optional(), lng: z.number().min(-180).max(180).optional() })
  .nullable();
const DISCLOSURE_IN = z.strictObject({ accommodationMeals: textIn.optional(), guides: textIn.optional() }).nullable();

const PRODUCT_FIELDS = {
  slug: SLUG,
  title: i18nIn(TITLE_MAX),
  body: BODY_IN.optional(),
  meetingPoint: MEETING_IN.optional(),
  disclosure: DISCLOSURE_IN.optional(),
  currency: CURRENCY.optional(),
  deepDive: z.boolean().optional(),
  crossBorder: z.boolean().optional(),
};
const CREATE_PRODUCT = z.strictObject({
  unitId: ID,
  productType: z.enum(PRODUCT_TYPES),
  sourceKind: z.enum(SOURCE_KINDS).optional(),
  defaultPaxTypes: z.boolean().optional(),
  ...PRODUCT_FIELDS,
});
const UPDATE_PRODUCT = z.strictObject({
  unitId: ID,
  productId: ID,
  slug: SLUG.optional(),
  title: i18nIn(TITLE_MAX).optional(),
  body: PRODUCT_FIELDS.body,
  meetingPoint: PRODUCT_FIELDS.meetingPoint,
  disclosure: PRODUCT_FIELDS.disclosure,
  currency: PRODUCT_FIELDS.currency,
  deepDive: PRODUCT_FIELDS.deepDive,
  crossBorder: PRODUCT_FIELDS.crossBorder,
});
const sectionVal = z.string().trim().max(TEXT_MAX).nullable().optional();
const SET_CONTENT = z
  .strictObject({
    unitId: ID,
    productId: ID,
    locale: LOCALE,
    title: z.string().trim().max(TITLE_MAX).nullable().optional(),
    summary: sectionVal,
    itinerary: sectionVal,
    includes: sectionVal,
    meeting: sectionVal,
  })
  .refine((v) => CONTENT_SECTIONS.some((s) => v[s] !== undefined));
const PRODUCT_REF = z.strictObject({ unitId: ID, productId: ID });
const ARCHIVE = z.strictObject({ unitId: ID, productId: ID, confirm: z.boolean().optional(), reason: z.string().max(TEXT_MAX).optional() });
const LIST = z.strictObject({ unitId: ID, status: z.enum(PRODUCT_STATUSES).optional(), productType: z.enum(PRODUCT_TYPES).optional(), locale: LOCALE.optional() });
const GET = z.strictObject({ unitId: ID, productId: ID, locale: LOCALE.optional() });
const GET_SLUG = z.strictObject({ unitId: ID, slug: z.string().min(1).max(60), locale: LOCALE.optional() });

const DURATION = z.number().int().min(1).max(PG_INT_MAX).nullable();
const NIGHTS = z.number().int().min(0).max(PG_INT_MAX).nullable();
const CREATE_OPTION = z.strictObject({
  unitId: ID,
  productId: ID,
  name: i18nIn(TITLE_MAX),
  durationMin: DURATION.optional(),
  nights: NIGHTS.optional(),
  active: z.boolean().optional(),
});
const UPDATE_OPTION = z.strictObject({ unitId: ID, optionId: ID, name: i18nIn(TITLE_MAX).optional(), durationMin: DURATION.optional(), nights: NIGHTS.optional() });
const SET_OPTION_ACTIVE = z.strictObject({ unitId: ID, optionId: ID, active: z.boolean() });
const REORDER = z.strictObject({ unitId: ID, productId: ID, optionIds: z.array(ID).min(1).max(500) });

const AGE = z.number().int().min(0).max(PG_INT_MAX).nullable();
const CREATE_PAX = z.strictObject({
  unitId: ID,
  productId: ID,
  code: z.string().regex(/^[A-Z][A-Z0-9_]{0,23}$/),
  label: i18nIn(TITLE_MAX),
  ageMin: AGE.optional(),
  ageMax: AGE.optional(),
  countsCapacity: z.boolean(),
});
const UPDATE_PAX = z.strictObject({ unitId: ID, paxTypeId: ID, label: i18nIn(TITLE_MAX).optional(), ageMin: AGE.optional(), ageMax: AGE.optional(), countsCapacity: z.boolean().optional() });
const SET_PAX_ACTIVE = z.strictObject({ unitId: ID, paxTypeId: ID, active: z.boolean() });

const MINOR = z.number().int().min(0).max(PG_INT_MAX);
const PAX_PRICES = z.record(z.string().min(1).max(24), MINOR).nullable();
const EXTRA_FIELDS = {
  kind: z.enum(EXTRA_KINDS),
  basis: z.enum(EXTRA_BASES),
  mandatory: z.boolean(),
  priceMinor: MINOR,
  paxPrices: PAX_PRICES.optional(),
  name: i18nIn(TITLE_MAX),
  note: i18nIn(TEXT_MAX).nullable().optional(),
  currency: CURRENCY.optional(),
  commissionable: z.boolean().optional(),
  discountable: z.boolean().optional(),
  passThrough: z.boolean().optional(),
  taxKind: z.enum(TAX_KINDS).optional(),
  stockItemId: REF_ID.nullable().optional(),
};
const CREATE_EXTRA = z.strictObject({ unitId: ID, productId: ID.nullable(), ...EXTRA_FIELDS });
const UPDATE_EXTRA = z.strictObject({
  unitId: ID,
  extraId: ID,
  kind: EXTRA_FIELDS.kind.optional(),
  basis: EXTRA_FIELDS.basis.optional(),
  mandatory: EXTRA_FIELDS.mandatory.optional(),
  priceMinor: MINOR.optional(),
  paxPrices: EXTRA_FIELDS.paxPrices,
  name: i18nIn(TITLE_MAX).optional(),
  note: EXTRA_FIELDS.note,
  currency: EXTRA_FIELDS.currency,
  commissionable: EXTRA_FIELDS.commissionable,
  discountable: EXTRA_FIELDS.discountable,
  passThrough: EXTRA_FIELDS.passThrough,
  taxKind: EXTRA_FIELDS.taxKind,
  stockItemId: EXTRA_FIELDS.stockItemId,
});
const SET_EXTRA_ACTIVE = z.strictObject({ unitId: ID, extraId: ID, active: z.boolean() });

function parse<S extends z.ZodType>(schema: S, input: unknown): z.output<S> | Fail {
  const r = schema.safeParse(input);
  return r.success ? r.data : fail("INVALID_INPUT");
}

// ═══════════════ อ่าน JSON ที่เก็บไว้ (ป้องกันแถวเก่า/แปลก) ═══════════════
const isRec = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
function readText(v: unknown): I18nText {
  if (!isRec(v)) return {};
  const out: I18nText = {};
  for (const l of CONTENT_LOCALES) if (typeof v[l] === "string" && v[l] !== "") out[l] = v[l] as string;
  return out;
}
function readI18n(v: unknown): I18n {
  const t = readText(v);
  const out: I18n = { th: t.th ?? "" };
  if (t.en) out.en = t.en;
  if (t.zh) out.zh = t.zh;
  return out;
}
function readBody(v: unknown): ProductBody {
  if (!isRec(v)) return {};
  const out: ProductBody = {};
  for (const s of ["summary", "itinerary", "includes"] as const) if (isRec(v[s])) out[s] = readText(v[s]);
  if (Array.isArray(v.photoFileIds)) out.photoFileIds = v.photoFileIds.filter((x): x is string => typeof x === "string");
  return out;
}
function readMeeting(v: unknown): MeetingPoint | null {
  if (!isRec(v)) return null;
  const out: MeetingPoint = { text: readText(v.text) };
  if (typeof v.lat === "number") out.lat = v.lat;
  if (typeof v.lng === "number") out.lng = v.lng;
  return out;
}
function readDisclosure(v: unknown): Disclosure | null {
  if (!isRec(v)) return null;
  const out: Disclosure = {};
  if (isRec(v.accommodationMeals)) out.accommodationMeals = readText(v.accommodationMeals);
  if (isRec(v.guides)) out.guides = readText(v.guides);
  return out;
}
function readPaxPrices(v: unknown): Record<string, number> | null {
  if (!isRec(v)) return null;
  const out: Record<string, number> = {};
  for (const [k, x] of Object.entries(v)) if (typeof x === "number" && Number.isInteger(x)) out[k] = x;
  return out;
}
const asJson = (v: unknown): Prisma.InputJsonValue => v as Prisma.InputJsonValue;
const jsonOrNull = (v: unknown): Prisma.InputJsonValue | typeof Prisma.DbNull => (v === null || v === undefined ? Prisma.DbNull : asJson(v));
const canon = (v: unknown): string =>
  JSON.stringify(v ?? null, (_k, x: unknown) => (isRec(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => a.localeCompare(b))) : x));
const same = (a: unknown, b: unknown) => canon(a) === canon(b);

// ═══════════════ ค่าตั้ง ═══════════════
const T27_SCHEMA = z.object({ infantBelow: z.number().int(), childFrom: z.number().int(), childTo: z.number().int() });
const LINE_DEF = z.object({ passThrough: z.boolean(), commissionPct: z.number(), discountable: z.boolean() });
const T44_SCHEMA = z.record(z.string(), LINE_DEF);
const STR_ARR = z.array(z.string()).min(1);
type LineDef = z.output<typeof LINE_DEF>;
type Refs = { unitId: string; productId?: string };

function asT27(v: unknown): T27Value {
  const r = T27_SCHEMA.safeParse(v);
  if (!r.success) throw new Error("ค่าตั้ง trips.pax.childAgeBand อ่านไม่ได้ (บั๊กของทะเบียนค่าตั้ง)");
  return r.data;
}
function asT44(v: unknown): Record<string, LineDef> {
  const r = T44_SCHEMA.safeParse(v);
  if (!r.success) throw new Error("ค่าตั้ง trips.line.defaults อ่านไม่ได้ (บั๊กของทะเบียนค่าตั้ง)");
  return r.data;
}
const NEUTRAL_LINE: LineDef = { passThrough: false, commissionPct: 0, discountable: false };
async function readT27(tenantId: string, refs: Refs): Promise<T27Value> {
  return asT27((await resolveSetting({ tenantId }, T27, refs)).value);
}
async function readT44(tenantId: string, refs: Refs): Promise<Record<string, LineDef>> {
  return asT44((await resolveSetting({ tenantId }, T44, refs)).value);
}
async function readStrings(tenantId: string, key: string, refs: Refs): Promise<string[]> {
  const r = STR_ARR.safeParse((await resolveSetting({ tenantId }, key, refs)).value);
  if (!r.success) throw new Error(`ค่าตั้ง ${key} อ่านไม่ได้ (บั๊กของทะเบียนค่าตั้ง)`);
  return r.data;
}

// ═══════════════ ด่าน ═══════════════
type Level = "view" | "edit" | "publish";
const ACTION: Record<Exclude<Level, "view">, string> = { edit: "trips.product.edit", publish: "trips.product.publish" };
const VIEW_ANY = ["trips.product.view", "trips.product.edit", "trips.product.publish"];
type Gate = { tenantId: string; unitId: string; actorUserId: string; db: ReturnType<typeof tenantDb> };
const CTX = z.object({ tenantId: ID, actorUserId: ID });

async function gate(ctx: unknown, input: unknown, level: Level): Promise<Gate | Fail> {
  const c = CTX.safeParse(ctx);
  if (!c.success) return fail("NOT_FOUND");
  const u = UNIT_ID.safeParse(input);
  if (!u.success) return fail("INVALID_INPUT");
  const { tenantId, actorUserId } = c.data;
  const unitId = u.data.unitId;
  const tdb = tenantDb({ tenantId });
  const mem = await tdb.membership.findFirst({
    where: { tenantId, userId: actorUserId, acceptedAt: { not: null } },
    select: { role: true, unitAccess: true, permissions: true },
  });
  if (!mem) return fail("NOT_FOUND");
  const m: MembershipCtx = {
    role: mem.role,
    unitAccess: Array.isArray(mem.unitAccess) ? mem.unitAccess.filter((x): x is string => typeof x === "string") : [],
    permissions: isRec(mem.permissions) ? mem.permissions : {},
  };
  const unit = await tdb.businessUnit.findFirst({ where: { id: unitId, tenantId, status: "ACTIVE" }, select: { id: true, type: true } });
  if (!unit || !canAccessUnit(m, unit.id)) return fail("NOT_FOUND");
  if (unit.type !== "TRIPS") return fail("UNIT_NOT_TRIPS");
  const allowed =
    level === "view"
      ? VIEW_ANY.some((action) => evaluate(m, { module: "trips", action, unitId: unit.id }))
      : evaluate(m, { module: "trips", action: ACTION[level], unitId: unit.id });
  if (!allowed) return fail("FORBIDDEN");
  return { tenantId, unitId: unit.id, actorUserId, db: tenantDb({ tenantId, unitId: unit.id }) };
}

/** ธุรกรรมของหน่วย (tx ของ client ที่ $extends — ตัวกรอง tenantId/unitId ยังอยู่ตอน runtime) */
function inTx<T>(g: Gate, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return g.db.$transaction(async (t) => fn(t as unknown as Tx), TX_OPTS);
}
const isDeadlock = (e: unknown): boolean => {
  if (e instanceof Prisma.PrismaClientKnownRequestError) {
    if (e.code === "P2034") return true;
    if (canon(e.meta).includes("40P01")) return true;
  }
  return e instanceof Error && /40P01|deadlock/i.test(e.message);
};
/** ธุรกรรมที่ล็อกแถวสินค้า: 40P01 ⇒ ลองใหม่ 1 ครั้ง แล้ว BUSY */
async function lockedTx<T>(g: Gate, fn: (tx: Tx) => Promise<T>): Promise<T | Fail> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await inTx(g, fn);
    } catch (e) {
      if (!isDeadlock(e)) throw e;
      if (attempt >= 1) return fail("BUSY");
    }
  }
}
type LockedProduct = { id: string; status: string; currency: string; productType: string };
async function lockProduct(tx: Tx, g: Gate, productId: string): Promise<LockedProduct | null> {
  const rows = await tx.$queryRaw<LockedProduct[]>`
    SELECT id, status, currency, "productType" FROM "TripProduct"
    WHERE id = ${productId} AND "tenantId" = ${g.tenantId} AND "unitId" = ${g.unitId}
    FOR UPDATE`;
  return rows[0] ?? null;
}
async function audit(tx: Tx, g: Gate, action: string, targetType: string, targetId: string, before: unknown, after: unknown): Promise<void> {
  await tx.auditLog.create({
    data: {
      tenantId: g.tenantId,
      unitId: g.unitId,
      actorType: "USER",
      actorId: g.actorUserId,
      action,
      targetType,
      targetId,
      ...(before === undefined || before === null ? {} : { before: asJson(before) }),
      ...(after === undefined || after === null ? {} : { after: asJson(after) }),
    },
  });
}
const isUnique = (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";

/** before/after ของฟิลด์ที่เปลี่ยน */
function changes<T extends Record<string, unknown>>(cur: Record<string, unknown>, next: T): { before: Partial<T>; after: Partial<T> } {
  const before: Partial<T> = {};
  const after: Partial<T> = {};
  for (const k of Object.keys(next) as (keyof T & string)[]) {
    if (next[k] === undefined || same(cur[k], next[k])) continue;
    before[k] = cur[k] as T[typeof k];
    after[k] = next[k];
  }
  return { before, after };
}
const hasKeys = (o: object) => Object.keys(o).length > 0;

// ═══════════════ สกุลเงิน ═══════════════
async function checkProductCurrency(g: Gate, productType: string, currency: string | undefined, refs: Refs): Promise<string | Fail> {
  if (productType !== "LIVEABOARD") {
    if (currency !== undefined && currency !== "THB") return fail("CURRENCY_NOT_ALLOWED");
    return "THB";
  }
  const allowed = await readStrings(g.tenantId, T3, refs);
  if (currency === undefined) return allowed[0] ?? fail("CURRENCY_NOT_ALLOWED");
  return allowed.includes(currency) ? currency : fail("CURRENCY_NOT_ALLOWED");
}

// ═══════════════ สินค้า ═══════════════
const cleanBody = (b: z.output<typeof BODY_IN>): ProductBody => {
  const out: ProductBody = {};
  for (const s of ["summary", "itinerary", "includes"] as const) {
    const v = b[s];
    if (v && hasKeys(v)) out[s] = v;
  }
  if (b.photoFileIds?.length) out.photoFileIds = b.photoFileIds;
  return out;
};
const BODY_SECTIONS = ["summary", "itinerary", "includes"] as const;
/** r2 ▸ รวมทีละส่วน (updateProduct) */
const mergeBody = (cur: ProductBody, b: z.output<typeof BODY_IN>): ProductBody => {
  const out: ProductBody = { ...cur };
  for (const s of BODY_SECTIONS) {
    const v = b[s];
    if (v === undefined) continue;
    if (v === null || !hasKeys(v)) delete out[s];
    else out[s] = v;
  }
  if (b.photoFileIds !== undefined) {
    if (b.photoFileIds === null || b.photoFileIds.length === 0) delete out.photoFileIds;
    else out.photoFileIds = b.photoFileIds;
  }
  return out;
};
/** r2 ▸ ทุกข้อความหลายภาษาที่รับเข้า: ภาษาที่ไม่ใช่ไทยต้องอยู่ใน T2 ของหน่วย (ใบสั่ง §4 ข้อ 13) */
async function checkLocales(g: Gate, ...texts: (I18nText | I18n | null | undefined)[]): Promise<Fail | null> {
  const need = nonThaiLocales(...texts);
  if (!need.length) return null;
  const enabled = await readStrings(g.tenantId, T2, { unitId: g.unitId });
  return need.every((l) => enabled.includes(l)) ? null : fail("LOCALE_DISABLED");
}
const EMPTY_BAND_MSG = "ช่วงอายุของประเภทนี้ว่าง (ตามค่าตั้งช่วงอายุของร้านหรืออายุที่ระบุ) — ระบุอายุเริ่ม/สิ้นสุดให้มีอย่างน้อย 1 ปี";
const cleanMeeting = (m: z.output<typeof MEETING_IN>): MeetingPoint | null => {
  if (!m) return null;
  const out: MeetingPoint = { text: m.text };
  if (m.lat !== undefined) out.lat = m.lat;
  if (m.lng !== undefined) out.lng = m.lng;
  return out;
};
const cleanDisclosure = (d: z.output<typeof DISCLOSURE_IN>): Disclosure | null => {
  if (!d) return null;
  const out: Disclosure = {};
  if (d.accommodationMeals && hasKeys(d.accommodationMeals)) out.accommodationMeals = d.accommodationMeals;
  if (d.guides && hasKeys(d.guides)) out.guides = d.guides;
  return out;
};

export async function createProduct(ctx: Ctx, input: unknown): Res<{ id: string }> {
  const g = await gate(ctx, input, "edit");
  if (isFail(g)) return g;
  const p = parse(CREATE_PRODUCT, input);
  if (isFail(p)) return p;
  if ((p.sourceKind ?? "OWN") === "SUPPLIER") return fail("SOURCE_NOT_SUPPORTED");
  const lf = await checkLocales(g, p.title, p.body?.summary, p.body?.itinerary, p.body?.includes, p.meetingPoint?.text, p.disclosure?.accommodationMeals, p.disclosure?.guides);
  if (lf) return lf;
  const currency = await checkProductCurrency(g, p.productType, p.currency, { unitId: g.unitId });
  if (isFail(currency)) return currency;
  const band = p.defaultPaxTypes === false ? null : await readT27(g.tenantId, { unitId: g.unitId });
  const body = p.body ? cleanBody(p.body) : {};
  const meetingPoint = p.meetingPoint ? cleanMeeting(p.meetingPoint) : null;
  const disclosure = p.disclosure ? cleanDisclosure(p.disclosure) : null;
  try {
    const id = await inTx(g, async (tx) => {
      const row = await tx.tripProduct.create({
        data: {
          tenantId: g.tenantId,
          unitId: g.unitId,
          productType: p.productType,
          sourceKind: "OWN",
          slug: p.slug,
          status: "DRAFT",
          title: asJson(p.title),
          body: asJson(body),
          currency,
          meetingPoint: jsonOrNull(meetingPoint),
          disclosure: jsonOrNull(disclosure),
          deepDive: p.deepDive ?? false,
          crossBorder: p.crossBorder ?? false,
        },
        select: { id: true },
      });
      if (band) {
        // คัดช่วงอายุจาก T27 ลงคอลัมน์ (มติ §11 ข้อ 5) ⇒ เปลี่ยนค่าตั้งทีหลังไม่กระทบสินค้านี้
        const ages: Record<(typeof DEFAULT_PAX_CODES)[number], [number, number | null]> = {
          ADULT: [band.childTo + 1, null],
          CHILD: [band.childFrom, band.childTo],
          INFANT: [0, band.infantBelow - 1],
        };
        let order = 0;
        for (const code of DEFAULT_PAX_CODES) {
          const [from, to] = ages[code];
          if (to !== null && to < from) continue; // ค่าตั้งไม่มีช่วงทารก (infantBelow 0) ⇒ ไม่สร้าง
          order += 1;
          await tx.tripPaxType.create({
            data: {
              tenantId: g.tenantId,
              unitId: g.unitId,
              productId: row.id,
              code,
              label: asJson(DEFAULT_PAX_LABELS[code]),
              ageMin: from,
              ageMax: to,
              countsCapacity: DEFAULT_PAX_COUNTS_CAPACITY[code],
              active: true,
              sortOrder: order,
            },
          });
        }
      }
      await audit(tx, g, "trips.product.create", "TripProduct", row.id, null, {
        slug: p.slug,
        productType: p.productType,
        currency,
        status: "DRAFT",
        defaultPaxTypes: band !== null,
      });
      return row.id;
    });
    return { ok: true, id };
  } catch (e) {
    if (isUnique(e)) return fail("SLUG_TAKEN");
    throw e;
  }
}

export async function updateProduct(ctx: Ctx, input: unknown): Res<{ id: string }> {
  const g = await gate(ctx, input, "edit");
  if (isFail(g)) return g;
  const p = parse(UPDATE_PRODUCT, input);
  if (isFail(p)) return p;
  const lf = await checkLocales(g, p.title, p.body?.summary, p.body?.itinerary, p.body?.includes, p.meetingPoint?.text, p.disclosure?.accommodationMeals, p.disclosure?.guides);
  if (lf) return lf;
  try {
    // r2 ▸ ล็อกแถวสินค้าก่อนอ่าน-แก้-เขียน (กันงานหาย) · สกุลเงินเปลี่ยนพร้อมรายการเสริมทุกตัวในธุรกรรมเดียว ◂
    return await lockedTx(g, async (tx): Promise<Ok<{ id: string }> | Fail> => {
      const lp = await lockProduct(tx, g, p.productId);
      if (!lp) return fail("NOT_FOUND");
      const cur = await tx.tripProduct.findFirst({ where: { id: lp.id, tenantId: g.tenantId, unitId: g.unitId } });
      if (!cur) return fail("NOT_FOUND");
      let currency: string | undefined;
      if (p.currency !== undefined) {
        if (cur.status !== "DRAFT") return fail("BAD_STATE");
        if (p.currency !== cur.currency) {
          if (cur.publishedAt !== null) return fail("CURRENCY_LOCKED");
          // ── T0.5 pricing ── TRIPS T0.5 ▸ มีแถวราคา/กฎราคาอ้างสินค้านี้ ⇒ สกุลเงินล็อก (ราคาจะค้างสกุลเดิม · หนี้ T0.2) — ใต้ล็อกสินค้าเดียวกัน ◂
          const priced = await Promise.all([
            tx.tripPrice.findFirst({ where: { tenantId: g.tenantId, unitId: g.unitId, productId: cur.id }, select: { id: true } }),
            tx.tripPriceRule.findFirst({ where: { tenantId: g.tenantId, unitId: g.unitId, productId: cur.id }, select: { id: true } }),
          ]);
          if (priced.some((x) => x !== null)) return fail("CURRENCY_LOCKED");
          // ── /T0.5 pricing ──
          const c = await checkProductCurrency(g, cur.productType, p.currency, { unitId: g.unitId, productId: cur.id });
          if (isFail(c)) return c;
          currency = c;
        }
      }
      const next = {
        slug: p.slug,
        title: p.title,
        body: p.body === undefined ? undefined : mergeBody(readBody(cur.body), p.body),
        meetingPoint: p.meetingPoint === undefined ? undefined : cleanMeeting(p.meetingPoint),
        disclosure: p.disclosure === undefined ? undefined : cleanDisclosure(p.disclosure),
        currency,
        deepDive: p.deepDive,
        crossBorder: p.crossBorder,
      };
      const { before, after } = changes({ ...cur, body: readBody(cur.body) }, next);
      if (!hasKeys(after)) return { ok: true, id: cur.id };
      const data: Prisma.TripProductUpdateManyMutationInput = {};
      if (after.slug !== undefined) data.slug = after.slug;
      if (after.title !== undefined) data.title = asJson(after.title);
      if (after.body !== undefined) data.body = asJson(after.body);
      if ("meetingPoint" in after) data.meetingPoint = jsonOrNull(after.meetingPoint);
      if ("disclosure" in after) data.disclosure = jsonOrNull(after.disclosure);
      if (after.currency !== undefined) data.currency = after.currency;
      if (after.deepDive !== undefined) data.deepDive = after.deepDive;
      if (after.crossBorder !== undefined) data.crossBorder = after.crossBorder;
      const where: Prisma.TripProductWhereInput = { id: cur.id, tenantId: g.tenantId, unitId: g.unitId, ...(after.currency !== undefined ? { status: "DRAFT", publishedAt: null } : {}) };
      const n = await tx.tripProduct.updateMany({ where, data });
      if (n.count !== 1) return fail("BAD_STATE");
      let extrasChanged: number | undefined;
      if (after.currency !== undefined) {
        // ราคาคงตัวเลขเดิม (ร้านทบทวนเอง) — เปลี่ยนเฉพาะสกุลของรายการเสริมของสินค้านี้ทุกตัว (รวมที่ปิดใช้)
        extrasChanged = (
          await tx.tripExtra.updateMany({
            where: { tenantId: g.tenantId, unitId: g.unitId, productId: cur.id, currency: { not: after.currency } },
            data: { currency: after.currency },
          })
        ).count;
      }
      await audit(tx, g, "trips.product.update", "TripProduct", cur.id, before, extrasChanged === undefined ? after : { ...after, extrasChanged });
      return { ok: true, id: cur.id };
    });
  } catch (e) {
    if (isUnique(e)) return fail("SLUG_TAKEN");
    throw e;
  }
}

export async function setProductContent(ctx: Ctx, input: unknown): Res<{ id: string }> {
  const g = await gate(ctx, input, "edit");
  if (isFail(g)) return g;
  const p = parse(SET_CONTENT, input);
  if (isFail(p)) return p;
  const enabled = await readStrings(g.tenantId, T2, { unitId: g.unitId });
  const locale = CONTENT_LOCALES.find((l) => l === p.locale);
  if (!locale || !enabled.includes(locale)) return fail("LOCALE_DISABLED");
  if (locale === "th" && p.title !== undefined && (p.title === null || p.title === "")) {
    return fail("INVALID_INPUT", { message: "ชื่อสินค้าภาษาไทยต้องมีเสมอ — แก้ข้อความแทนการลบ" });
  }
  const set = (v: I18nText | I18n | null | undefined, text: string | null | undefined): I18nText => {
    const out: I18nText = { ...readText(v) };
    if (text === null || text === "" || text === undefined) delete out[locale];
    else out[locale] = text;
    return out;
  };
  // r2 ▸ ล็อกแถวสินค้าแล้วอ่านภายในธุรกรรม (สองคนแก้คนละภาษาพร้อมกันไม่ทับกัน) ◂
  return lockedTx(g, async (tx): Promise<Ok<{ id: string }> | Fail> => {
    const lp = await lockProduct(tx, g, p.productId);
    if (!lp) return fail("NOT_FOUND");
    const cur = await tx.tripProduct.findFirst({ where: { id: lp.id, tenantId: g.tenantId, unitId: g.unitId } });
    if (!cur) return fail("NOT_FOUND");
    const title = readI18n(cur.title);
    const body = readBody(cur.body);
    const meeting = readMeeting(cur.meetingPoint);
    let nextTitle: I18n = title;
    if (p.title !== undefined) {
      const t = set(title, p.title);
      nextTitle = { th: t.th ?? title.th, ...(t.en ? { en: t.en } : {}), ...(t.zh ? { zh: t.zh } : {}) };
    }
    const nextBody: ProductBody = { ...body };
    for (const s of BODY_SECTIONS) {
      if (p[s] === undefined) continue;
      const v = set(body[s], p[s]);
      if (hasKeys(v)) nextBody[s] = v;
      else delete nextBody[s];
    }
    let nextMeeting: MeetingPoint | null = meeting;
    if (p.meeting !== undefined) {
      const text = set(meeting?.text, p.meeting);
      const hasCoord = meeting?.lat !== undefined || meeting?.lng !== undefined;
      nextMeeting = hasKeys(text) || hasCoord ? { ...(meeting ?? {}), text } : null;
    }
    const { before, after } = changes({ title, body, meetingPoint: meeting }, { title: nextTitle, body: nextBody, meetingPoint: nextMeeting });
    if (!hasKeys(after)) return { ok: true, id: cur.id };
    const data: Prisma.TripProductUpdateManyMutationInput = {};
    if (after.title !== undefined) data.title = asJson(after.title);
    if (after.body !== undefined) data.body = asJson(after.body);
    if ("meetingPoint" in after) data.meetingPoint = jsonOrNull(after.meetingPoint);
    await tx.tripProduct.updateMany({ where: { id: cur.id, tenantId: g.tenantId, unitId: g.unitId }, data });
    await audit(tx, g, "trips.content.update", "TripProduct", cur.id, { locale, ...before }, { locale, ...after });
    return { ok: true, id: cur.id };
  });
}

type Transition = { from: readonly ProductStatus[]; to: ProductStatus; action: string; event?: string };
const PRODUCT_EVENT_KEYS = ["productId", "unitId", "productType", "status"] as const;

async function emitProductEvent(tx: Tx, g: Gate, type: string, product: { id: string; productType: string }, status: ProductStatus, at: Date) {
  const payload: Record<(typeof PRODUCT_EVENT_KEYS)[number], string> = { productId: product.id, unitId: g.unitId, productType: product.productType, status };
  await emitOutbox(tx, { tenantId: g.tenantId, unitId: g.unitId, type, idempotencyKey: `${type}:${product.id}:${at.getTime()}`, payload });
}

export async function publishProduct(ctx: Ctx, input: unknown): Res<{ id: string; status: ProductStatus }> {
  const g = await gate(ctx, input, "publish");
  if (isFail(g)) return g;
  const p = parse(PRODUCT_REF, input);
  if (isFail(p)) return p;
  return lockedTx(g, async (tx): Promise<Ok<{ id: string; status: ProductStatus }> | Fail> => {
    const lp = await lockProduct(tx, g, p.productId);
    if (!lp) return fail("NOT_FOUND");
    if (lp.status !== "DRAFT") return fail("BAD_STATE");
    const row = await tx.tripProduct.findFirst({ where: { id: lp.id, tenantId: g.tenantId, unitId: g.unitId }, select: { title: true } });
    const missing: PublishMissing[] = [];
    if (!hasLocale(readI18n(row?.title), "th")) missing.push("TITLE_TH");
    const opts = await tx.tripOption.count({ where: { tenantId: g.tenantId, unitId: g.unitId, productId: lp.id, active: true } });
    if (opts === 0) missing.push("OPTION");
    const seats = await tx.tripPaxType.count({ where: { tenantId: g.tenantId, unitId: g.unitId, productId: lp.id, active: true, countsCapacity: true } });
    if (seats === 0) missing.push("SEAT_PAX_TYPE");
    if (missing.length) return fail("PUBLISH_INCOMPLETE", { missing });
    const at = new Date();
    const n = await tx.tripProduct.updateMany({ where: { id: lp.id, tenantId: g.tenantId, unitId: g.unitId, status: "DRAFT" }, data: { status: "ACTIVE" } });
    if (n.count !== 1) return fail("BAD_STATE");
    // เผยแพร่ครั้งแรก = ตั้งครั้งเดียว ไม่ล้าง (มติ §12)
    await tx.tripProduct.updateMany({ where: { id: lp.id, tenantId: g.tenantId, unitId: g.unitId, publishedAt: null }, data: { publishedAt: at } });
    await emitProductEvent(tx, g, "trips.product.published", lp, "ACTIVE", at);
    await audit(tx, g, "trips.product.publish", "TripProduct", lp.id, { status: "DRAFT" }, { status: "ACTIVE" });
    return { ok: true, id: lp.id, status: "ACTIVE" };
  });
}

async function simpleTransition(ctx: Ctx, input: unknown, t: Transition): Res<{ id: string; status: ProductStatus }> {
  const g = await gate(ctx, input, "publish");
  if (isFail(g)) return g;
  const p = parse(PRODUCT_REF, input);
  if (isFail(p)) return p;
  return lockedTx(g, async (tx): Promise<Ok<{ id: string; status: ProductStatus }> | Fail> => {
    const lp = await lockProduct(tx, g, p.productId);
    if (!lp) return fail("NOT_FOUND");
    const from = t.from.find((s) => s === lp.status);
    if (!from) return fail("BAD_STATE");
    const at = new Date();
    const n = await tx.tripProduct.updateMany({ where: { id: lp.id, tenantId: g.tenantId, unitId: g.unitId, status: from }, data: { status: t.to } });
    if (n.count !== 1) return fail("BAD_STATE");
    if (t.event) await emitProductEvent(tx, g, t.event, lp, t.to, at);
    await audit(tx, g, t.action, "TripProduct", lp.id, { status: from }, { status: t.to });
    return { ok: true, id: lp.id, status: t.to };
  });
}

export async function unpublishProduct(ctx: Ctx, input: unknown): Res<{ id: string; status: ProductStatus }> {
  return simpleTransition(ctx, input, { from: ["ACTIVE"], to: "DRAFT", action: "trips.product.unpublish", event: "trips.product.unpublished" });
}

export async function restoreProduct(ctx: Ctx, input: unknown): Res<{ id: string; status: ProductStatus }> {
  return simpleTransition(ctx, input, { from: ["ARCHIVED"], to: "DRAFT", action: "trips.product.restore" });
}

/** ถูกอ้างถึง = มีแถวในรอบ/กฎรอบ/ราคา/กฎราคา/การจอง (ใบสั่ง §4 ข้อ 6) */
async function isReferenced(tx: Tx, g: Gate, productId: string): Promise<boolean> {
  const w = { tenantId: g.tenantId, unitId: g.unitId, productId };
  const found = await Promise.all([
    tx.tripDeparture.findFirst({ where: w, select: { id: true } }),
    tx.tripSchedule.findFirst({ where: w, select: { id: true } }),
    tx.tripPrice.findFirst({ where: w, select: { id: true } }),
    tx.tripPriceRule.findFirst({ where: w, select: { id: true } }),
    tx.tripBooking.findFirst({ where: w, select: { id: true } }),
  ]);
  return found.some((x) => x !== null);
}

export async function archiveProduct(ctx: Ctx, input: unknown): Res<{ id: string; status: ProductStatus }> {
  const g = await gate(ctx, input, "publish");
  if (isFail(g)) return g;
  const p = parse(ARCHIVE, input);
  if (isFail(p)) return p;
  return lockedTx(g, async (tx): Promise<Ok<{ id: string; status: ProductStatus }> | Fail> => {
    const lp = await lockProduct(tx, g, p.productId);
    if (!lp) return fail("NOT_FOUND");
    const from = (["DRAFT", "ACTIVE"] as const).find((s) => s === lp.status);
    if (!from) return fail("BAD_STATE");
    const row = await tx.tripProduct.findFirst({ where: { id: lp.id, tenantId: g.tenantId, unitId: g.unitId }, select: { publishedAt: true } });
    const wasPublished = row?.publishedAt != null;
    const referenced = await isReferenced(tx, g, lp.id);
    const reason = p.reason?.trim() ?? "";
    if ((from === "ACTIVE" || wasPublished || referenced) && !(p.confirm === true && reason.length >= ARCHIVE_REASON_MIN)) return fail("CONFIRM_REQUIRED");
    const at = new Date();
    const n = await tx.tripProduct.updateMany({ where: { id: lp.id, tenantId: g.tenantId, unitId: g.unitId, status: from }, data: { status: "ARCHIVED" } });
    if (n.count !== 1) return fail("BAD_STATE");
    await emitProductEvent(tx, g, "trips.product.archived", lp, "ARCHIVED", at);
    await audit(tx, g, "trips.product.archive", "TripProduct", lp.id, { status: from }, { status: "ARCHIVED", reason: reason || null, referenced, wasPublished });
    return { ok: true, id: lp.id, status: "ARCHIVED" };
  });
}

// ═══════════════ อ่าน ═══════════════
type ProductRow = TripProduct;

async function buildDTO(g: Gate, row: ProductRow, locale: string): Promise<ProductDTO> {
  const where = { tenantId: g.tenantId, unitId: g.unitId, productId: row.id };
  const orderBy = [{ sortOrder: "asc" as const }, { createdAt: "asc" as const }, { id: "asc" as const }];
  const [options, paxTypes, extras, st] = await Promise.all([
    g.db.tripOption.findMany({ where, orderBy }),
    g.db.tripPaxType.findMany({ where, orderBy }),
    g.db.tripExtra.findMany({ where, orderBy }),
    resolveSettings({ tenantId: g.tenantId }, [T27, T44], { unitId: g.unitId, productId: row.id }),
  ]);
  const band = asT27(st[T27]?.value);
  const lines = asT44(st[T44]?.value);
  const title = readI18n(row.title);
  const body = readBody(row.body);
  const meetingPoint = readMeeting(row.meetingPoint);
  const parts = { title, body, meetingPoint };
  const content = Object.fromEntries(CONTENT_SECTIONS.map((s) => [s, localize(sectionI18n(parts, s), locale)])) as Record<ContentSection, Localized>;
  return {
    id: row.id,
    unitId: row.unitId,
    slug: row.slug,
    productType: row.productType as ProductType,
    sourceKind: row.sourceKind as SourceKind,
    status: row.status as ProductStatus,
    currency: row.currency,
    deepDive: row.deepDive,
    crossBorder: row.crossBorder,
    title,
    body,
    meetingPoint,
    disclosure: readDisclosure(row.disclosure),
    options: options.map((o): OptionDTO => {
      const name = readI18n(o.name);
      return { id: o.id, name, display: localize(name, locale), durationMin: o.durationMin, nights: o.nights, sortOrder: o.sortOrder, active: o.active };
    }),
    paxTypes: paxTypes.map((x): PaxTypeDTO => {
      const label = readI18n(x.label);
      return {
        id: x.id,
        code: x.code,
        label,
        display: localize(label, locale),
        ageMin: x.ageMin,
        ageMax: x.ageMax,
        band: effectivePaxBand(x, band),
        countsCapacity: x.countsCapacity,
        active: x.active,
        sortOrder: x.sortOrder,
      };
    }),
    extras: extras.map((e): ExtraDTO => {
      const name = readI18n(e.name);
      return {
        id: e.id,
        productId: e.productId,
        kind: e.kind as ExtraKind,
        basis: e.basis as ExtraBasis,
        mandatory: e.mandatory,
        priceMinor: e.priceMinor,
        currency: e.currency,
        commissionable: e.commissionable,
        discountable: e.discountable,
        passThrough: e.passThrough,
        taxKind: e.taxKind as TaxKind,
        stockItemId: e.stockItemId,
        name,
        note: e.note === null ? null : readI18n(e.note),
        display: localize(name, locale),
        active: e.active,
        sortOrder: e.sortOrder,
        commissionPct: e.commissionable ? (lines[e.kind] ?? NEUTRAL_LINE).commissionPct : 0,
        paxPrices: readPaxPrices(e.paxPrices),
      };
    }),
    content,
    translation: { locale, missing: missingTranslations(parts, locale) },
    publishedAt: row.publishedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function getProduct(ctx: Ctx, input: unknown): Res<{ product: ProductDTO }> {
  const g = await gate(ctx, input, "view");
  if (isFail(g)) return g;
  const p = parse(GET, input);
  if (isFail(p)) return p;
  const row = await g.db.tripProduct.findFirst({ where: { id: p.productId } });
  if (!row) return fail("NOT_FOUND");
  return { ok: true, product: await buildDTO(g, row, p.locale ?? "th") };
}

export async function getProductBySlug(ctx: Ctx, input: unknown): Res<{ product: ProductDTO }> {
  const g = await gate(ctx, input, "view");
  if (isFail(g)) return g;
  const p = parse(GET_SLUG, input);
  if (isFail(p)) return p;
  const row = await g.db.tripProduct.findFirst({ where: { slug: p.slug } });
  if (!row) return fail("NOT_FOUND");
  return { ok: true, product: await buildDTO(g, row, p.locale ?? "th") };
}

export async function listProducts(ctx: Ctx, input: unknown): Res<{ items: ProductListItem[] }> {
  const g = await gate(ctx, input, "view");
  if (isFail(g)) return g;
  const p = parse(LIST, input);
  if (isFail(p)) return p;
  const locale = p.locale ?? "th";
  const rows = await g.db.tripProduct.findMany({
    where: { ...(p.status ? { status: p.status } : {}), ...(p.productType ? { productType: p.productType } : {}) },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: { id: true, slug: true, productType: true, status: true, title: true, body: true, meetingPoint: true },
  });
  const counts = rows.length
    ? await g.db.tripOption.groupBy({ by: ["productId"], where: { productId: { in: rows.map((r) => r.id) }, active: true }, _count: { _all: true } })
    : [];
  const countOf = new Map(counts.map((c) => [c.productId, c._count._all]));
  const items = rows.map((r): ProductListItem => {
    const parts = { title: readI18n(r.title), body: readBody(r.body), meetingPoint: readMeeting(r.meetingPoint) };
    return {
      id: r.id,
      slug: r.slug,
      productType: r.productType as ProductType,
      status: r.status as ProductStatus,
      title: localize(parts.title, locale),
      optionCount: countOf.get(r.id) ?? 0,
      missingCount: missingTranslations(parts, locale).length,
    };
  });
  return { ok: true, items };
}

// ═══════════════ ตัวเลือก ═══════════════
export async function createOption(ctx: Ctx, input: unknown): Res<{ id: string }> {
  const g = await gate(ctx, input, "edit");
  if (isFail(g)) return g;
  const p = parse(CREATE_OPTION, input);
  if (isFail(p)) return p;
  const lf = await checkLocales(g, p.name);
  if (lf) return lf;
  return lockedTx(g, async (tx): Promise<Ok<{ id: string }> | Fail> => {
    const lp = await lockProduct(tx, g, p.productId);
    if (!lp) return fail("NOT_FOUND");
    const max = await tx.tripOption.aggregate({ where: { tenantId: g.tenantId, unitId: g.unitId, productId: lp.id }, _max: { sortOrder: true } });
    const sortOrder = (max._max.sortOrder ?? 0) + 1;
    const row = await tx.tripOption.create({
      data: {
        tenantId: g.tenantId,
        unitId: g.unitId,
        productId: lp.id,
        name: asJson(p.name),
        durationMin: p.durationMin ?? null,
        nights: p.nights ?? null,
        sortOrder,
        active: p.active ?? true,
      },
      select: { id: true },
    });
    await audit(tx, g, "trips.option.create", "TripOption", row.id, null, {
      productId: lp.id,
      name: p.name,
      durationMin: p.durationMin ?? null,
      nights: p.nights ?? null,
      sortOrder,
      active: p.active ?? true,
    });
    return { ok: true, id: row.id };
  });
}

export async function updateOption(ctx: Ctx, input: unknown): Res<{ id: string }> {
  const g = await gate(ctx, input, "edit");
  if (isFail(g)) return g;
  const p = parse(UPDATE_OPTION, input);
  if (isFail(p)) return p;
  const lf = await checkLocales(g, p.name);
  if (lf) return lf;
  const cur = await g.db.tripOption.findFirst({ where: { id: p.optionId } });
  if (!cur) return fail("NOT_FOUND");
  const { before, after } = changes({ ...cur, name: readI18n(cur.name) }, { name: p.name, durationMin: p.durationMin, nights: p.nights });
  if (!hasKeys(after)) return { ok: true, id: cur.id };
  await inTx(g, async (tx) => {
    const data: Prisma.TripOptionUpdateManyMutationInput = {};
    if (after.name !== undefined) data.name = asJson(after.name);
    if (after.durationMin !== undefined) data.durationMin = after.durationMin;
    if (after.nights !== undefined) data.nights = after.nights;
    await tx.tripOption.updateMany({ where: { id: cur.id, tenantId: g.tenantId, unitId: g.unitId }, data });
    await audit(tx, g, "trips.option.update", "TripOption", cur.id, before, after);
  });
  return { ok: true, id: cur.id };
}

export async function setOptionActive(ctx: Ctx, input: unknown): Res<{ id: string }> {
  const g = await gate(ctx, input, "edit");
  if (isFail(g)) return g;
  const p = parse(SET_OPTION_ACTIVE, input);
  if (isFail(p)) return p;
  const cur = await g.db.tripOption.findFirst({ where: { id: p.optionId }, select: { id: true, productId: true } });
  if (!cur) return fail("NOT_FOUND");
  return lockedTx(g, async (tx): Promise<Ok<{ id: string }> | Fail> => {
    const lp = await lockProduct(tx, g, cur.productId);
    if (!lp) return fail("NOT_FOUND");
    const row = await tx.tripOption.findFirst({ where: { id: cur.id, tenantId: g.tenantId, unitId: g.unitId }, select: { active: true } });
    if (!row) return fail("NOT_FOUND");
    if (row.active === p.active) return { ok: true, id: cur.id };
    if (!p.active && lp.status === "ACTIVE") {
      const others = await tx.tripOption.count({ where: { tenantId: g.tenantId, unitId: g.unitId, productId: lp.id, active: true, id: { not: cur.id } } });
      if (others === 0) return fail("LAST_ACTIVE_OPTION");
    }
    await tx.tripOption.updateMany({ where: { id: cur.id, tenantId: g.tenantId, unitId: g.unitId }, data: { active: p.active } });
    await audit(tx, g, "trips.option.activate", "TripOption", cur.id, { active: row.active }, { active: p.active });
    return { ok: true, id: cur.id };
  });
}

export async function reorderOptions(ctx: Ctx, input: unknown): Res<{ id: string }> {
  const g = await gate(ctx, input, "edit");
  if (isFail(g)) return g;
  const p = parse(REORDER, input);
  if (isFail(p)) return p;
  if (new Set(p.optionIds).size !== p.optionIds.length) return fail("INVALID_INPUT", { message: "รายการตัวเลือกมีรายการซ้ำ — โหลดหน้าใหม่แล้วจัดลำดับอีกครั้ง" });
  return lockedTx(g, async (tx): Promise<Ok<{ id: string }> | Fail> => {
    const lp = await lockProduct(tx, g, p.productId);
    if (!lp) return fail("NOT_FOUND");
    const rows = await tx.tripOption.findMany({
      where: { tenantId: g.tenantId, unitId: g.unitId, productId: lp.id },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      select: { id: true, sortOrder: true },
    });
    const ids = new Set(rows.map((r) => r.id));
    if (rows.length !== p.optionIds.length || !p.optionIds.every((id) => ids.has(id))) {
      return fail("INVALID_INPUT", { message: "รายการตัวเลือกไม่ตรงกับตัวเลือกปัจจุบันของสินค้า — โหลดหน้าใหม่แล้วจัดลำดับอีกครั้ง" });
    }
    for (const [i, id] of p.optionIds.entries()) {
      await tx.tripOption.updateMany({ where: { id, tenantId: g.tenantId, unitId: g.unitId }, data: { sortOrder: i + 1 } });
    }
    await audit(tx, g, "trips.option.reorder", "TripProduct", lp.id, { optionIds: rows.map((r) => r.id) }, { optionIds: p.optionIds });
    return { ok: true, id: lp.id };
  });
}

// ═══════════════ ประเภทคน ═══════════════
type PaxRow = { id: string; code: string; ageMin: number | null; ageMax: number | null; active: boolean; countsCapacity: boolean };
const overlapsAny = (cand: Band, others: readonly PaxRow[], band: T27Value): boolean =>
  others.some((o) => o.active && bandsOverlap(cand, effectivePaxBand(o, band)));

export async function createPaxType(ctx: Ctx, input: unknown): Res<{ id: string }> {
  const g = await gate(ctx, input, "edit");
  if (isFail(g)) return g;
  const p = parse(CREATE_PAX, input);
  if (isFail(p)) return p;
  const lf = await checkLocales(g, p.label);
  if (lf) return lf;
  const ageMin = p.ageMin ?? null;
  const ageMax = p.ageMax ?? null;
  if (ageMin !== null && ageMax !== null && ageMin > ageMax) return fail("AGE_RANGE");
  const exists = await g.db.tripProduct.findFirst({ where: { id: p.productId }, select: { id: true } });
  if (!exists) return fail("NOT_FOUND");
  const band = await readT27(g.tenantId, { unitId: g.unitId, productId: exists.id });
  try {
    return await lockedTx(g, async (tx): Promise<Ok<{ id: string }> | Fail> => {
      const lp = await lockProduct(tx, g, exists.id);
      if (!lp) return fail("NOT_FOUND");
      const all = await tx.tripPaxType.findMany({
        where: { tenantId: g.tenantId, unitId: g.unitId, productId: lp.id },
        select: { id: true, code: true, ageMin: true, ageMax: true, active: true, countsCapacity: true, sortOrder: true },
      });
      if (all.some((x) => x.code === p.code)) return fail("PAX_CODE_TAKEN");
      const nb = effectivePaxBand({ code: p.code, ageMin, ageMax }, band);
      if (isEmptyBand(nb)) return fail("AGE_RANGE", { message: EMPTY_BAND_MSG });
      if (overlapsAny(nb, all, band)) return fail("AGE_OVERLAP");
      const sortOrder = all.reduce((m, x) => Math.max(m, x.sortOrder), 0) + 1;
      const row = await tx.tripPaxType.create({
        data: { tenantId: g.tenantId, unitId: g.unitId, productId: lp.id, code: p.code, label: asJson(p.label), ageMin, ageMax, countsCapacity: p.countsCapacity, active: true, sortOrder },
        select: { id: true },
      });
      await audit(tx, g, "trips.paxType.create", "TripPaxType", row.id, null, { productId: lp.id, code: p.code, label: p.label, ageMin, ageMax, countsCapacity: p.countsCapacity, sortOrder });
      return { ok: true, id: row.id };
    });
  } catch (e) {
    if (isUnique(e)) return fail("PAX_CODE_TAKEN");
    throw e;
  }
}

async function seatGuard(tx: Tx, g: Gate, lp: LockedProduct, selfId: string): Promise<Fail | null> {
  if (lp.status !== "ACTIVE") return null;
  const others = await tx.tripPaxType.count({
    where: { tenantId: g.tenantId, unitId: g.unitId, productId: lp.id, active: true, countsCapacity: true, id: { not: selfId } },
  });
  return others === 0 ? fail("LAST_SEAT_PAX_TYPE") : null;
}

export async function updatePaxType(ctx: Ctx, input: unknown): Res<{ id: string }> {
  const g = await gate(ctx, input, "edit");
  if (isFail(g)) return g;
  const p = parse(UPDATE_PAX, input);
  if (isFail(p)) return p;
  const lf = await checkLocales(g, p.label);
  if (lf) return lf;
  const cur = await g.db.tripPaxType.findFirst({ where: { id: p.paxTypeId }, select: { id: true, productId: true } });
  if (!cur) return fail("NOT_FOUND");
  const band = await readT27(g.tenantId, { unitId: g.unitId, productId: cur.productId });
  return lockedTx(g, async (tx): Promise<Ok<{ id: string }> | Fail> => {
    const lp = await lockProduct(tx, g, cur.productId);
    if (!lp) return fail("NOT_FOUND");
    const all = await tx.tripPaxType.findMany({
      where: { tenantId: g.tenantId, unitId: g.unitId, productId: lp.id },
      select: { id: true, code: true, label: true, ageMin: true, ageMax: true, active: true, countsCapacity: true },
    });
    const self = all.find((x) => x.id === cur.id);
    if (!self) return fail("NOT_FOUND");
    const ageMin = p.ageMin === undefined ? self.ageMin : p.ageMin;
    const ageMax = p.ageMax === undefined ? self.ageMax : p.ageMax;
    if (ageMin !== null && ageMax !== null && ageMin > ageMax) return fail("AGE_RANGE");
    const nb = effectivePaxBand({ code: self.code, ageMin, ageMax }, band);
    if (isEmptyBand(nb)) return fail("AGE_RANGE", { message: EMPTY_BAND_MSG });
    if (self.active && overlapsAny(nb, all.filter((x) => x.id !== self.id), band)) return fail("AGE_OVERLAP");
    if (p.countsCapacity === false && self.countsCapacity && self.active) {
      const f = await seatGuard(tx, g, lp, self.id);
      if (f) return f;
    }
    const { before, after } = changes(
      { label: readI18n(self.label), ageMin: self.ageMin, ageMax: self.ageMax, countsCapacity: self.countsCapacity },
      { label: p.label, ageMin: p.ageMin, ageMax: p.ageMax, countsCapacity: p.countsCapacity },
    );
    if (!hasKeys(after)) return { ok: true, id: self.id };
    const data: Prisma.TripPaxTypeUpdateManyMutationInput = {};
    if (after.label !== undefined) data.label = asJson(after.label);
    if (after.ageMin !== undefined) data.ageMin = after.ageMin;
    if (after.ageMax !== undefined) data.ageMax = after.ageMax;
    if (after.countsCapacity !== undefined) data.countsCapacity = after.countsCapacity;
    await tx.tripPaxType.updateMany({ where: { id: self.id, tenantId: g.tenantId, unitId: g.unitId }, data });
    await audit(tx, g, "trips.paxType.update", "TripPaxType", self.id, before, after);
    return { ok: true, id: self.id };
  });
}

export async function setPaxTypeActive(ctx: Ctx, input: unknown): Res<{ id: string }> {
  const g = await gate(ctx, input, "edit");
  if (isFail(g)) return g;
  const p = parse(SET_PAX_ACTIVE, input);
  if (isFail(p)) return p;
  const cur = await g.db.tripPaxType.findFirst({ where: { id: p.paxTypeId }, select: { id: true, productId: true } });
  if (!cur) return fail("NOT_FOUND");
  const band = await readT27(g.tenantId, { unitId: g.unitId, productId: cur.productId });
  return lockedTx(g, async (tx): Promise<Ok<{ id: string }> | Fail> => {
    const lp = await lockProduct(tx, g, cur.productId);
    if (!lp) return fail("NOT_FOUND");
    const all = await tx.tripPaxType.findMany({
      where: { tenantId: g.tenantId, unitId: g.unitId, productId: lp.id },
      select: { id: true, code: true, ageMin: true, ageMax: true, active: true, countsCapacity: true },
    });
    const self = all.find((x) => x.id === cur.id);
    if (!self) return fail("NOT_FOUND");
    if (self.active === p.active) return { ok: true, id: self.id };
    if (p.active) {
      const nb = effectivePaxBand(self, band);
      if (isEmptyBand(nb)) return fail("AGE_RANGE", { message: EMPTY_BAND_MSG });
      if (overlapsAny(nb, all.filter((x) => x.id !== self.id), band)) return fail("AGE_OVERLAP");
    } else if (self.countsCapacity) {
      const f = await seatGuard(tx, g, lp, self.id);
      if (f) return f;
    }
    await tx.tripPaxType.updateMany({ where: { id: self.id, tenantId: g.tenantId, unitId: g.unitId }, data: { active: p.active } });
    await audit(tx, g, "trips.paxType.activate", "TripPaxType", self.id, { active: self.active }, { active: p.active });
    return { ok: true, id: self.id };
  });
}

// ═══════════════ รายการเสริม ═══════════════
type Flags = { passThrough: boolean; commissionable: boolean; discountable: boolean; taxKind: TaxKind };
type FlagInput = { passThrough?: boolean; commissionable?: boolean; discountable?: boolean; taxKind?: TaxKind };

/** ธงที่ไม่ส่งมา: สร้าง = จาก T44 (passThrough ⇒ ไม่คอมฯ/ไม่ลด/NONE) · แก้ = ค่าเดิม · แล้วตรวจกฎ (ไม่แก้ให้เงียบ ๆ) */
function resolveFlags(given: FlagInput, base: Flags | LineDef): Flags | Fail {
  let f: Flags;
  if ("commissionPct" in base) {
    const passThrough = given.passThrough ?? base.passThrough;
    f = {
      passThrough,
      commissionable: given.commissionable ?? (passThrough ? false : base.commissionPct > 0),
      discountable: given.discountable ?? (passThrough ? false : base.discountable),
      taxKind: given.taxKind ?? (passThrough ? "NONE" : "VAT7"),
    };
  } else {
    f = {
      passThrough: given.passThrough ?? base.passThrough,
      commissionable: given.commissionable ?? base.commissionable,
      discountable: given.discountable ?? base.discountable,
      taxKind: given.taxKind ?? base.taxKind,
    };
  }
  if (f.passThrough && (f.commissionable || f.discountable)) return fail("PASS_THROUGH_FLAGS");
  if ((f.taxKind === "NONE") !== f.passThrough) return fail("TAX_KIND_MISMATCH");
  return f;
}

async function checkPaxPrices(tx: Tx, g: Gate, productId: string, pp: Record<string, number>): Promise<Fail | null> {
  if (!hasKeys(pp)) return fail("INVALID_INPUT", { message: "ราคาตามประเภทผู้เดินทางต้องมีอย่างน้อย 1 ประเภท (หรือไม่ระบุเพื่อใช้ราคาเดียว)" });
  const codes = new Set(
    (await tx.tripPaxType.findMany({ where: { tenantId: g.tenantId, unitId: g.unitId, productId, active: true }, select: { code: true } })).map((x) => x.code),
  );
  return Object.keys(pp).every((k) => codes.has(k)) ? null : fail("UNKNOWN_PAX_TYPE");
}

async function unitExtraCurrency(g: Gate, currency: string | undefined): Promise<string | Fail> {
  const allowed = await readStrings(g.tenantId, T3, { unitId: g.unitId });
  if (currency === undefined) return allowed[0] ?? fail("CURRENCY_NOT_ALLOWED");
  return allowed.includes(currency) ? currency : fail("CURRENCY_NOT_ALLOWED");
}

export async function createExtra(ctx: Ctx, input: unknown): Res<{ id: string }> {
  const g = await gate(ctx, input, "edit");
  if (isFail(g)) return g;
  const p = parse(CREATE_EXTRA, input);
  if (isFail(p)) return p;
  const pp = p.paxPrices ?? null;
  const productId = p.productId;
  if (productId === null && pp !== null) {
    return fail("INVALID_INPUT", { message: "ราคาตามประเภทผู้เดินทางใช้ได้กับรายการเสริมของสินค้าเท่านั้น" });
  }
  const lf = await checkLocales(g, p.name, p.note);
  if (lf) return lf;
  const unitCurrency = productId === null ? await unitExtraCurrency(g, p.currency) : null;
  if (isFail(unitCurrency)) return unitCurrency;
  const lines = await readT44(g.tenantId, productId ? { unitId: g.unitId, productId } : { unitId: g.unitId });
  const flags = resolveFlags(p, lines[p.kind] ?? NEUTRAL_LINE);
  if (isFail(flags)) return flags;
  // r2 ▸ สกุลของสินค้าอ่านใต้ล็อกแถวสินค้าในธุรกรรมเดียวกับการสร้าง (ไม่แข่งกับการเปลี่ยนสกุลของสินค้า) ◂
  return lockedTx(g, async (tx): Promise<Ok<{ id: string }> | Fail> => {
    let currency: string;
    if (productId !== null) {
      const lp = await lockProduct(tx, g, productId);
      if (!lp) return fail("NOT_FOUND");
      if (p.currency !== undefined && p.currency !== lp.currency) return fail("CURRENCY_MISMATCH");
      currency = lp.currency;
      if (pp !== null) {
        const f = await checkPaxPrices(tx, g, productId, pp);
        if (f) return f;
      }
    } else {
      currency = unitCurrency ?? "";
    }
    const max = await tx.tripExtra.aggregate({ where: { tenantId: g.tenantId, unitId: g.unitId, productId }, _max: { sortOrder: true } });
    const sortOrder = (max._max.sortOrder ?? 0) + 1;
    const data = {
      kind: p.kind,
      basis: p.basis,
      mandatory: p.mandatory,
      priceMinor: p.priceMinor,
      currency,
      ...flags,
      stockItemId: p.stockItemId ?? null,
      name: p.name,
      note: p.note ?? null,
      paxPrices: pp,
    };
    const row = await tx.tripExtra.create({
      data: {
        tenantId: g.tenantId,
        unitId: g.unitId,
        productId,
        ...data,
        name: asJson(data.name),
        note: jsonOrNull(data.note),
        paxPrices: jsonOrNull(data.paxPrices),
        active: true,
        sortOrder,
      },
      select: { id: true },
    });
    await audit(tx, g, "trips.extra.create", "TripExtra", row.id, null, { productId, ...data, sortOrder });
    return { ok: true, id: row.id };
  });
}

export async function updateExtra(ctx: Ctx, input: unknown): Res<{ id: string }> {
  const g = await gate(ctx, input, "edit");
  if (isFail(g)) return g;
  const p = parse(UPDATE_EXTRA, input);
  if (isFail(p)) return p;
  const pre = await g.db.tripExtra.findFirst({ where: { id: p.extraId }, select: { id: true, productId: true } });
  if (!pre) return fail("NOT_FOUND");
  const productId = pre.productId;
  if (productId === null && p.paxPrices !== undefined && p.paxPrices !== null) {
    return fail("INVALID_INPUT", { message: "ราคาตามประเภทผู้เดินทางใช้ได้กับรายการเสริมของสินค้าเท่านั้น" });
  }
  const lf = await checkLocales(g, p.name, p.note);
  if (lf) return lf;
  const unitCurrency = productId === null && p.currency !== undefined ? await unitExtraCurrency(g, p.currency) : null;
  if (isFail(unitCurrency)) return unitCurrency;
  // r2 ▸ ล็อกแถวสินค้า (ถ้าเป็นรายการของสินค้า) แล้วอ่านรายการ+สกุลสินค้าภายในธุรกรรม ◂
  return lockedTx(g, async (tx): Promise<Ok<{ id: string }> | Fail> => {
    let productCurrency: string | null = null;
    if (productId !== null) {
      const lp = await lockProduct(tx, g, productId);
      if (!lp) return fail("NOT_FOUND");
      productCurrency = lp.currency;
    }
    const cur = await tx.tripExtra.findFirst({ where: { id: pre.id, tenantId: g.tenantId, unitId: g.unitId } });
    if (!cur) return fail("NOT_FOUND");
    let currency: string | undefined;
    if (p.currency !== undefined) {
      if (productCurrency !== null) {
        if (p.currency !== productCurrency) return fail("CURRENCY_MISMATCH");
        currency = productCurrency;
      } else {
        currency = unitCurrency ?? undefined;
      }
    }
    const flags = resolveFlags(p, {
      passThrough: cur.passThrough,
      commissionable: cur.commissionable,
      discountable: cur.discountable,
      taxKind: cur.taxKind as TaxKind,
    });
    if (isFail(flags)) return flags;
    const next = {
      kind: p.kind,
      basis: p.basis,
      mandatory: p.mandatory,
      priceMinor: p.priceMinor,
      currency,
      passThrough: flags.passThrough,
      commissionable: flags.commissionable,
      discountable: flags.discountable,
      taxKind: flags.taxKind,
      stockItemId: p.stockItemId,
      name: p.name,
      note: p.note,
      paxPrices: p.paxPrices,
    };
    const { before, after } = changes(
      { ...cur, name: readI18n(cur.name), note: cur.note === null ? null : readI18n(cur.note), paxPrices: readPaxPrices(cur.paxPrices) },
      next,
    );
    if (!hasKeys(after)) return { ok: true, id: cur.id };
    if (productId !== null && after.paxPrices !== undefined && after.paxPrices !== null) {
      const f = await checkPaxPrices(tx, g, productId, after.paxPrices);
      if (f) return f;
    }
    const data: Prisma.TripExtraUpdateManyMutationInput = {};
    if (after.kind !== undefined) data.kind = after.kind;
    if (after.basis !== undefined) data.basis = after.basis;
    if (after.mandatory !== undefined) data.mandatory = after.mandatory;
    if (after.priceMinor !== undefined) data.priceMinor = after.priceMinor;
    if (after.currency !== undefined) data.currency = after.currency;
    if (after.passThrough !== undefined) data.passThrough = after.passThrough;
    if (after.commissionable !== undefined) data.commissionable = after.commissionable;
    if (after.discountable !== undefined) data.discountable = after.discountable;
    if (after.taxKind !== undefined) data.taxKind = after.taxKind;
    if ("stockItemId" in after) data.stockItemId = after.stockItemId ?? null;
    if (after.name !== undefined) data.name = asJson(after.name);
    if ("note" in after) data.note = jsonOrNull(after.note);
    if ("paxPrices" in after) data.paxPrices = jsonOrNull(after.paxPrices);
    await tx.tripExtra.updateMany({ where: { id: cur.id, tenantId: g.tenantId, unitId: g.unitId }, data });
    await audit(tx, g, "trips.extra.update", "TripExtra", cur.id, before, after);
    return { ok: true, id: cur.id };
  });
}

export async function setExtraActive(ctx: Ctx, input: unknown): Res<{ id: string }> {
  const g = await gate(ctx, input, "edit");
  if (isFail(g)) return g;
  const p = parse(SET_EXTRA_ACTIVE, input);
  if (isFail(p)) return p;
  const cur = await g.db.tripExtra.findFirst({ where: { id: p.extraId }, select: { id: true, active: true } });
  if (!cur) return fail("NOT_FOUND");
  if (cur.active === p.active) return { ok: true, id: cur.id };
  await inTx(g, async (tx) => {
    await tx.tripExtra.updateMany({ where: { id: cur.id, tenantId: g.tenantId, unitId: g.unitId }, data: { active: p.active } });
    await audit(tx, g, "trips.extra.activate", "TripExtra", cur.id, { active: cur.active }, { active: p.active });
  });
  return { ok: true, id: cur.id };
}

// ═══════════════ ด่าน "ขายได้" ภายในธุรกรรม (r2 · ให้ T0.3/T0.5 เรียกก่อนสร้างกฎรอบ/รอบ/ราคา) ═══════════════
export type ProductSellableCode = "NOT_FOUND" | "PRODUCT_ARCHIVED" | "OPTION_INACTIVE";
/** สินค้าไม่พร้อมให้ผูกรอบ/ราคาใหม่ — `code` = รหัสใน TRIP_PRODUCT_ERROR_CODES · ข้อความไทย */
export class TripProductNotSellableError extends Error {
  readonly code: ProductSellableCode;
  constructor(code: ProductSellableCode) {
    super(MSG[code]);
    this.name = "TripProductNotSellableError";
    this.code = code;
  }
}
/**
 * ล็อกแถวสินค้า `FOR SHARE` ในธุรกรรมของผู้เรียก แล้วตรวจ: มีอยู่ในหน่วยนี้ · ไม่ ARCHIVED · ตัวเลือก (ถ้าส่ง) เป็นของสินค้านี้และเปิดใช้
 * ไม่ผ่าน ⇒ throw TripProductNotSellableError (ผู้เรียกแปลงเป็น Fail ของตัวเอง) · ผ่าน ⇒ คืนข้อมูลสินค้า
 * ล็อกแบบแชร์ชนกับ FOR UPDATE ของ archiveProduct ⇒ เก็บสินค้าไม่แทรกกลางการสร้างรอบ/ราคา (ผลตรวจ T0.2 ข้อ 8)
 * 🔴 tx ใดก็ได้ (prisma.$transaction หรือ tenantDb().$transaction) — SQL ใส่ tenantId/unitId เอง
 */
export async function assertProductSellableInTx(
  tx: Prisma.TransactionClient,
  ref: { tenantId: string; unitId: string; productId: string; optionId?: string | null },
): Promise<{ id: string; status: "DRAFT" | "ACTIVE"; currency: string; productType: ProductType }> {
  const rows = await tx.$queryRaw<LockedProduct[]>`
    SELECT id, status, currency, "productType" FROM "TripProduct"
    WHERE id = ${ref.productId} AND "tenantId" = ${ref.tenantId} AND "unitId" = ${ref.unitId}
    FOR SHARE`;
  const p = rows[0];
  if (!p) throw new TripProductNotSellableError("NOT_FOUND");
  const status = p.status === "DRAFT" ? "DRAFT" : p.status === "ACTIVE" ? "ACTIVE" : null;
  if (status === null) throw new TripProductNotSellableError("PRODUCT_ARCHIVED");
  if (ref.optionId) {
    const opt = await tx.$queryRaw<{ active: boolean }[]>`
      SELECT active FROM "TripOption"
      WHERE id = ${ref.optionId} AND "productId" = ${p.id} AND "tenantId" = ${ref.tenantId} AND "unitId" = ${ref.unitId}`;
    if (!opt[0]) throw new TripProductNotSellableError("NOT_FOUND");
    if (!opt[0].active) throw new TripProductNotSellableError("OPTION_INACTIVE");
  }
  return { id: p.id, status, currency: p.currency, productType: p.productType as ProductType };
}
