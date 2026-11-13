// ─────────────────────────────────────────────────────────────
// trips/screens.ts — ตัวโหลดจอ TRIPS (view model) ของใบ T1.1 §4: แถบนำทาง · ด่านหน้า · รายการสินค้า (ภาพ 16 ซ้าย) · ตัวแก้สินค้า (ภาพ 16) · จอค่าตั้ง (ภาพ 17)
// ทุกตัว (ctx: { tenantId, actorUserId }, input, opts?: { now? }) · ด่าน: สมาชิกภาพสด → หน่วย + canAccessUnit (NOT_FOUND) → TRIPS (UNIT_NOT_TRIPS) → สิทธิ์ (FORBIDDEN)
//   input zod strict (INVALID_INPUT) · ลูกของหน่วยอื่น ⇒ NOT_FOUND · คืน { ok, … } | { ok:false, code, message } ไม่ throw
// 🔴 tenantDb + facade ของ settings เท่านั้น (ไม่ import prisma) · ตรรกะ "เต็ม" · ชี้ชวน · สิทธิ์ · ราคา อยู่ที่นี่ (คอมโพเนนต์แสดงอย่างเดียว)
// 🔴 ราคาทุกตัวจากตัวคิดราคาจริงของ T0.5 (loadPricingInput + resolveTripPrice · quoteTripLine) — ไม่คูณ % เองที่นี่
// 🔴 prices.ts ไม่ตรวจสิทธิ์เอง ⇒ ตัวโหลดนี้ตรวจสิทธิ์ก่อนอ่านราคาทุกครั้ง (มติผู้คุม T1.1)
// ─────────────────────────────────────────────────────────────
import { z } from "zod";
import { tenantDb } from "@/lib/core/db";
import { PERMISSIONS } from "@/lib/core/permissions";
import type { LineRequest, SellCtx } from "@/lib/core/sellable";
import { getDef, legalInputsOf, listDefs, loadSettingsForm, resolveSettings, resolveSettingsMany, type Resolved, type SettingsActor } from "@/lib/core/settings";
import { evaluateTourRule, type TourSeverity } from "@/lib/core/settings/legal";
import type { SettingsFormModel } from "@/components/settings/settings-shared";
import {
  TRIPS_NAV,
  TRIPS_NAV_KEYS,
  TRIPS_PRICE_EXAMPLE_DEFAULT,
  TRIPS_SETTINGS_SECTIONS,
  TRIPS_SETTINGS_SECTION_KEYS,
  formatBaht,
  type TripsNavEntry,
  type TripsNavKey,
  type TripsSettingsSectionKey,
} from "@/components/trips/trips-shared";
import { getProduct } from "./products";
import { effectivePaxBand, hasLocale, missingTranslations, prospectusChecklist, type ProductDTO, type ProspectusItem, type T27Value } from "./products-core";
import { loadPricingInput, quoteTripLine } from "./pricing";
import { resolveTripPrice, tripLocalToUtcIso, type PricedItem, type PricedQuote, type TripPricingInput } from "./pricing-core";
import { utcToLocal } from "./departures-core";
import { pickupWindowFor, type PickupWindow, type PickupZoneDTO } from "./pickup-core";
import { TRIPS_PRODUCT_VIEW_ANY, activePickupZonesOf, tripsFail, tripsUnitGate, type TripsFail, type TripsScreenCtx, type TripsUnitGate } from "./pickup";

type Opts = { now?: Date };
type ScreenCode = "INVALID_INPUT" | "NOT_FOUND" | "FORBIDDEN" | "UNIT_NOT_TRIPS";
type Fail = TripsFail<ScreenCode>;
const isRec = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isFail = (x: unknown): x is TripsFail => isRec(x) && x.ok === false;
const ID = z.string().min(1).max(100);
const nowOf = (opts?: Opts) => (opts?.now instanceof Date && !Number.isNaN(opts.now.getTime()) ? opts.now : new Date());
const ymdOf = (d: Date) => d.toISOString().slice(0, 10);
const textOf = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v.trim() : null);

// ═══════════════ สิทธิ์ของแท็บ (ใบสั่ง §3 · §7) ═══════════════
const DEPARTURE_ANY = ["trips.departure.view", "trips.departure.edit", "trips.departure.status"] as const;
const SETTINGS_ANY = ["trips.settings.edit", "trips.settings.money"] as const;
/** คีย์สิทธิ์ trips ทั้งหมดจากทะเบียนสิทธิ์ (ใบหลังเพิ่มคีย์ ⇒ นับอัตโนมัติ) */
const TRIPS_ALL = PERMISSIONS.filter((p) => p.module === "trips").map((p) => p.key);

function visibleOf(g: TripsUnitGate): Record<TripsNavKey, boolean> {
  const anyTrips = g.canAny(TRIPS_ALL);
  return {
    products: g.canAny(TRIPS_PRODUCT_VIEW_ANY),
    departures: g.canAny(DEPARTURE_ANY),
    bookings: g.can("trips.booking.view"), // TRIPS T1.3 ▸ เห็นแท็บการจอง ⇔ สิทธิ์ดูการจอง ◂
    agents: anyTrips,
    channels: anyTrips,
    settings: g.canAny(SETTINGS_ANY),
  };
}
function navOf(g: TripsUnitGate): { unitId: string; unitSlug: string; unitName: string; entries: TripsNavEntry[] } {
  const vis = visibleOf(g);
  return {
    unitId: g.unitId,
    unitSlug: g.unitSlug,
    unitName: g.unitName,
    entries: TRIPS_NAV.map((t) => ({ key: t.key, href: `/app/u/${g.unitSlug}${t.path}`, available: t.available, visible: vis[t.key], wo: t.wo })),
  };
}
export type TripsNavVM = ReturnType<typeof navOf>;

async function gate(ctx: unknown, input: unknown): Promise<TripsUnitGate | Fail> {
  const g = await tripsUnitGate(ctx, input);
  return g;
}
function parse<S extends z.ZodType>(schema: S, input: unknown): z.output<S> | Fail {
  const r = schema.safeParse(input);
  return r.success ? r.data : tripsFail("INVALID_INPUT");
}

// ═══════════════ 1-2. แถบ + ด่านหน้า ═══════════════
const NAV_IN = z.strictObject({ unitId: ID });
export async function loadTripsNav(ctx: TripsScreenCtx, input: unknown): Promise<{ ok: true; nav: TripsNavVM } | Fail> {
  const p = parse(NAV_IN, input);
  if (isFail(p)) return p;
  const g = await gate(ctx, p);
  if (isFail(g)) return g;
  if (!g.canAny(TRIPS_ALL)) return tripsFail("FORBIDDEN");
  return { ok: true, nav: navOf(g) };
}

const GATE_IN = z.strictObject({ unitId: ID, page: z.enum(TRIPS_NAV_KEYS) });
/** ด่านของทุก page.tsx ใต้ /trips — หน้าที่ผู้ใช้มองไม่เห็นแท็บ ⇒ FORBIDDEN */
export async function tripsPageGate(ctx: TripsScreenCtx, input: unknown): Promise<{ ok: true; nav: TripsNavVM } | Fail> {
  const p = parse(GATE_IN, input);
  if (isFail(p)) return p;
  const g = await gate(ctx, { unitId: p.unitId });
  if (isFail(g)) return g;
  if (!g.canAny(TRIPS_ALL)) return tripsFail("FORBIDDEN");
  const nav = navOf(g);
  return nav.entries.find((e) => e.key === p.page)?.visible ? { ok: true, nav } : tripsFail("FORBIDDEN");
}

// ═══════════════ ตัวช่วยร่วม: กฎรอบ · ทรัพยากร · ชี้ชวน ═══════════════
type ScheduleRow = { id: string; productId: string; optionId: string | null; departTimeMin: number; capacity: number; resourceIds: string[]; dateFrom: Date; dateTo: Date | null };
/** กฎรอบที่ใช้อยู่ (ไม่พัก · ยังไม่หมดช่วง) ของสินค้าในหน่วย — กฎล่าสุดต่อตัวเลือกมาก่อน */
async function activeSchedules(g: TripsUnitGate, productIds: string[], now: Date): Promise<ScheduleRow[]> {
  if (!productIds.length) return [];
  const today = new Date(`${ymdOf(now)}T00:00:00.000Z`);
  return g.db.tripSchedule.findMany({
    where: { tenantId: g.tenantId, unitId: g.unitId, productId: { in: productIds }, pausedAt: null, OR: [{ dateTo: null }, { dateTo: { gte: today } }] },
    orderBy: [{ dateFrom: "desc" }, { id: "asc" }],
    select: { id: true, productId: true, optionId: true, departTimeMin: true, capacity: true, resourceIds: true, dateFrom: true, dateTo: true },
  });
}
const scheduleFor = (scheds: ScheduleRow[], productId: string, optionId: string): ScheduleRow | null =>
  scheds.find((s) => s.productId === productId && s.optionId === optionId) ?? scheds.find((s) => s.productId === productId && s.optionId === null) ?? null;

type ResourceRow = { id: string; kind: string; name: string };
/** ทรัพยากรของกฎรอบ (โครงข้อมูล — คอมโพเนนต์จัดคำตามภาษา) */
export type ResourcesVM = { boats: string[]; vans: number; guides: number; others: string[] };
function resourcesOf(ids: string[], res: Map<string, ResourceRow>): ResourcesVM {
  const rows = ids.map((id) => res.get(id)).filter((r): r is ResourceRow => !!r);
  return {
    boats: rows.filter((r) => r.kind === "BOAT").map((r) => r.name),
    vans: rows.filter((r) => r.kind === "VAN").length,
    guides: rows.filter((r) => r.kind === "GUIDE").length,
    others: rows.filter((r) => r.kind !== "BOAT" && r.kind !== "VAN" && r.kind !== "GUIDE").map((r) => r.name),
  };
}

type ProspectusFacts = { productId: string; options: { active: boolean; durationMin: number | null; nights: number | null }[]; body: { itinerary?: { th?: string | null } | null }; disclosure: { accommodationMeals?: { th?: string | null } | null; guides?: { th?: string | null } | null } | null };
export type BrochureVM = { enabled: boolean; items: { code: ProspectusItem; done: boolean }[]; done: number; total: number; pct: number };
/**
 * ชี้ชวน 9 ข้อ (ใบสั่ง §4.1 brochure) ของหลายสินค้าในครั้งเดียว — คิดจากข้อมูลจริงของร้าน แสดงอย่างเดียว ไม่บล็อก
 * คิวรีเป็นชุด: ค่าตั้ง 1 ครั้ง (resolveSettingsMany) · นับแถวราคา 1 ครั้ง (groupBy) · รอบที่มีประกัน 1 ครั้ง — ไม่วนต่อสินค้า
 */
async function brochuresOf(g: TripsUnitGate, facts: ProspectusFacts[], scheds: ScheduleRow[], resKinds: Map<string, string>, now: Date): Promise<Map<string, BrochureVM>> {
  const out = new Map<string, BrochureVM>();
  if (!facts.length) return out;
  const ids = facts.map((f) => f.productId);
  const [settings, priceGroups, insured] = await Promise.all([
    resolveSettingsMany({ tenantId: g.tenantId }, ["trips.prospectus.checklist", "trips.license.fields", "trips.sell.minToDepart"], ids.map((productId) => ({ unitId: g.unitId, productId })), now),
    g.db.tripPrice.groupBy({ by: ["productId"], where: { tenantId: g.tenantId, unitId: g.unitId, productId: { in: ids } }, _count: { _all: true } }),
    // ฐานตอบเอง: สินค้าไหนมีรอบอนาคตที่ใส่เลขกรมธรรม์ — ได้ไม่เกิน 1 แถวต่อสินค้า (ไม่ดึงรอบทั้งหมดมากรองในหน่วยความจำ)
    g.db.$queryRaw<{ productId: string }[]>`
      SELECT DISTINCT "productId" FROM "TripDeparture"
      WHERE "tenantId" = ${g.tenantId} AND "unitId" = ${g.unitId} AND "productId" = ANY(${ids}::text[])
        AND status <> 'CANCELLED' AND "startsAt" >= ${now}
        AND btrim(coalesce(insurance ->> 'policyNo', '')) <> ''`,
  ]);
  const priceCount = new Map(priceGroups.map((x) => [x.productId, x._count._all]));
  const insuredIds = new Set(insured.map((d) => d.productId));
  facts.forEach((p, i) => {
    const st = settings[i] ?? {};
    const license = st["trips.license.fields"]?.value;
    const minDep = st["trips.sell.minToDepart"]?.value;
    const mine = scheds.filter((s) => s.productId === p.productId);
    const done: Partial<Record<ProspectusItem, boolean>> = {
      OPERATOR_LICENSE: isRec(license) && textOf(license.number) !== null,
      DURATION: p.options.some((o) => o.active && ((o.durationMin ?? 0) > 0 || (o.nights ?? 0) > 0)),
      PRICE_PAYMENT: (priceCount.get(p.productId) ?? 0) > 0,
      VEHICLE: mine.some((s) => s.resourceIds.some((id) => resKinds.get(id) === "BOAT" || resKinds.get(id) === "VAN")),
      ITINERARY: textOf(p.body.itinerary?.th) !== null,
      ACCOMMODATION_MEALS: textOf(p.disclosure?.accommodationMeals?.th) !== null,
      GUIDE: textOf(p.disclosure?.guides?.th) !== null,
      MIN_PAX: isRec(minDep) && typeof minDep.minPax === "number",
      INSURANCE: insuredIds.has(p.productId),
    };
    out.set(p.productId, { enabled: st["trips.prospectus.checklist"]?.value !== false, ...prospectusChecklist(done) });
  });
  return out;
}
async function resourceMap(g: TripsUnitGate, ids: string[]): Promise<Map<string, ResourceRow>> {
  const uniq = [...new Set(ids)];
  if (!uniq.length) return new Map();
  const rows = await g.db.tripResource.findMany({ where: { tenantId: g.tenantId, unitId: g.unitId, id: { in: uniq } }, select: { id: true, kind: true, name: true } });
  return new Map(rows.map((r) => [r.id, r]));
}
const i18nOf = (v: unknown): { th?: string | null; en?: string | null } => (isRec(v) ? { th: typeof v.th === "string" ? v.th : null, en: typeof v.en === "string" ? v.en : null } : {});

// ═══════════════ 3. รายการสินค้า (ภาพ 16 ซ้าย) ═══════════════
/** เพดานรายการต่อหน้า (ไม่มีแบบแบ่งหน้าในโมดูลนี้ — เกินนี้ขึ้นข้อความ "แสดง N รายการแรก" ให้ค้น/กรองต่อ) */
export const TRIPS_PRODUCT_LIST_CAP = 200;
const LIST_IN = z.strictObject({ unitId: ID, type: z.enum(["TOUR", "LIVEABOARD"]).optional(), q: z.string().max(100).optional(), includeArchived: z.boolean().optional() });
export type ProductListItemVM = {
  id: string;
  slug: string;
  productType: string;
  status: string;
  title: string;
  /** ตัวเลือกแรกที่เปิด · เรือของกฎรอบ · ที่นั่ง/รอบ · จำนวนตัวเลือกที่เปิด (คอมโพเนนต์จัดคำ) */
  summary: { optionName: string | null; boats: string[]; capacity: number | null; activeOptions: number };
  capacity: number | null;
  prospectus: { done: number; total: number } | null;
  enMissing: number;
};
export type ProductListVM = { counts: { all: number; TOUR: number; LIVEABOARD: number; archived: number }; canCreate: boolean; items: ProductListItemVM[]; shown: number; matched: number; cap: number };

export async function loadProductListVM(ctx: TripsScreenCtx, input: unknown, opts?: Opts): Promise<{ ok: true; vm: ProductListVM } | Fail> {
  const p = parse(LIST_IN, input);
  if (isFail(p)) return p;
  const g = await gate(ctx, { unitId: p.unitId });
  if (isFail(g)) return g;
  if (!g.canAny(TRIPS_PRODUCT_VIEW_ANY)) return tripsFail("FORBIDDEN");
  const now = nowOf(opts);
  // นับ/ค้นจากคอลัมน์เบา (ชื่อ · ชนิด · สถานะ) ก่อน แล้วโหลดเนื้อหาเฉพาะรายการที่จะแสดง (≤ เพดาน)
  const light = await g.db.tripProduct.findMany({
    where: { tenantId: g.tenantId, unitId: g.unitId },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: { id: true, productType: true, status: true, title: true },
  });
  const scope = p.includeArchived ? light : light.filter((r) => r.status !== "ARCHIVED");
  const counts = {
    all: scope.length,
    TOUR: scope.filter((r) => r.productType === "TOUR").length,
    LIVEABOARD: scope.filter((r) => r.productType === "LIVEABOARD").length,
    archived: light.filter((r) => r.status === "ARCHIVED").length,
  };
  const q = (p.q ?? "").trim().toLocaleLowerCase("th");
  const matched = scope.filter((r) => {
    if (p.type && r.productType !== p.type) return false;
    if (!q) return true;
    const t = i18nOf(r.title);
    return [t.th, t.en].some((s) => typeof s === "string" && s.toLocaleLowerCase("th").includes(q));
  });
  const ids = matched.slice(0, TRIPS_PRODUCT_LIST_CAP).map((r) => r.id);
  const [rows, options, scheds] = await Promise.all([
    ids.length
      ? g.db.tripProduct.findMany({ where: { tenantId: g.tenantId, unitId: g.unitId, id: { in: ids } }, select: { id: true, slug: true, productType: true, status: true, title: true, body: true, meetingPoint: true, disclosure: true } })
      : Promise.resolve([]),
    ids.length
      ? g.db.tripOption.findMany({ where: { tenantId: g.tenantId, unitId: g.unitId, productId: { in: ids } }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }, { id: "asc" }], select: { id: true, productId: true, name: true, active: true, durationMin: true, nights: true } })
      : Promise.resolve([]),
    activeSchedules(g, ids, now),
  ]);
  const byId = new Map(rows.map((r) => [r.id, r]));
  const res = await resourceMap(g, scheds.flatMap((s) => s.resourceIds));
  const resKinds = new Map([...res.values()].map((r) => [r.id, r.kind]));
  const prepared = ids.flatMap((id) => {
    const r = byId.get(id);
    if (!r) return [];
    const title = i18nOf(r.title);
    const body = isRec(r.body) ? r.body : {};
    const parts = { title: { th: title.th ?? "", en: title.en ?? null }, body: { summary: i18nOf(body.summary), itinerary: i18nOf(body.itinerary), includes: i18nOf(body.includes) }, meetingPoint: isRec(r.meetingPoint) ? { text: i18nOf(r.meetingPoint.text) } : null };
    const disclosure = isRec(r.disclosure) ? { accommodationMeals: i18nOf(r.disclosure.accommodationMeals), guides: i18nOf(r.disclosure.guides) } : null;
    return [{ r, title, parts, disclosure, opts: options.filter((o) => o.productId === r.id) }];
  });
  const brochures = await brochuresOf(g, prepared.map((x) => ({ productId: x.r.id, options: x.opts, body: x.parts.body, disclosure: x.disclosure })), scheds, resKinds, now);
  const items: ProductListItemVM[] = prepared.map(({ r, title, parts, opts }) => {
    const first = opts.find((o) => o.active) ?? null;
    const sched = first ? scheduleFor(scheds, r.id, first.id) : null;
    const b = brochures.get(r.id);
    return {
      id: r.id,
      slug: r.slug,
      productType: r.productType,
      status: r.status,
      title: title.th ?? "",
      summary: { optionName: first ? (i18nOf(first.name).th ?? null) : null, boats: sched ? resourcesOf(sched.resourceIds, res).boats : [], capacity: sched?.capacity ?? null, activeOptions: opts.filter((o) => o.active).length },
      capacity: sched?.capacity ?? null,
      prospectus: b?.enabled ? { done: b.done, total: b.total } : null,
      enMissing: missingTranslations(parts, "en").length,
    };
  });
  return { ok: true, vm: { counts, canCreate: g.can("trips.product.edit"), items, shown: items.length, matched: matched.length, cap: TRIPS_PRODUCT_LIST_CAP } };
}

// ═══════════════ 4. ตัวแก้สินค้า (ภาพ 16) ═══════════════
/** locale: ตามลายเซ็นในใบสั่ง §4 ข้อ 4 — รับไว้แต่ไม่ใช้ (ตัวแก้แสดงเนื้อหาไทย/อังกฤษคู่กันเสมอ) */
const EDITOR_IN = z.strictObject({ unitId: ID, productId: ID, exampleDepartureId: ID.optional(), locale: z.enum(["th", "en"]).optional() });
/** เพดานรอบที่มีราคาเฉพาะรอบที่แสดง/คิดราคาต่อครั้ง (รอบอนาคตเท่านั้น · เกินนี้ขึ้นข้อความว่าตัดไว้) */
export const TRIPS_PRICED_DEPARTURE_CAP = 20;
const APPLIED_KEYS = ["trips.sell.holdMinutes", "trips.sell.cutoff", "trips.sell.minToDepart", "trips.cancel.ladder", "trips.pay.depositPct"] as const;
const CHILD_PCT_KEY = "trips.pax.childPricePct";
const LINE_DEFAULTS_KEY = "trips.line.defaults";
const CHILD_BAND_KEY = "trips.pax.childAgeBand";

export type PaxRowVM = {
  paxTypeId: string;
  code: string;
  labelTh: string;
  ageFrom: number;
  ageTo: number | null;
  /** ที่มาของช่วงอายุ: PRODUCT = คอลัมน์ของประเภทคน (T0.2 คัด T27 ลงตอนสร้าง) · SETTING = ไม่มีคอลัมน์ ใช้ค่าตั้งสด · NONE = ไม่มีช่วง */
  bandSource: "SETTING" | "PRODUCT" | "NONE";
  /** ช่วงอายุของแถวนี้ยังเท่ากับช่วงที่ค่าตั้ง T27 ให้ในตอนนี้ (ข้อเท็จจริง ไม่ใช่การผูกสด) */
  equalsSetting: boolean;
  countsCapacity: boolean;
  active: boolean;
  priceSatang: number | null;
  priceBasis: "SET" | "DERIVED_PCT" | "FREE" | "MISSING";
  derivedPct: number | null;
};
export type SeasonRowVM = { seasonId: string; name: string; dateStart: string; dateEnd: string; adultSatang: number | null; childSatang: number | null; childBasis: PaxRowVM["priceBasis"]; inEffect: boolean };
export type DepartureRowVM = {
  departureId: string;
  localDate: string;
  status: string;
  capacity: number;
  sold: number | null;
  full: boolean;
  adultSatang: number | null;
  childSatang: number | null;
  source: "RETAIL" | "SEASON" | "DEPARTURE" | null;
  seasonName: string | null;
  overridesSeasonName: string | null;
  hasOwnPrice: boolean;
};
export type ExtraRowVM = {
  id: string;
  kind: string;
  nameTh: string;
  noteTh: string | null;
  basis: string;
  mandatory: boolean;
  priceSatang: number;
  paxPrices: Record<string, number> | null;
  commissionable: boolean;
  commissionPct: number;
  discountable: boolean;
  passThrough: boolean;
  scope: "PRODUCT" | "UNIT";
  active: boolean;
};
export type ExampleLineVM = { kind: "SEAT" | "EXTRA" | "PICKUP"; paxCode: string | null; labelTh: string; qtys: number[]; qty: number; unitSatang: number | null; amountSatang: number };
export type ExampleVM = {
  departureId: string | null;
  localDate: string | null;
  /** ที่มาของราคาผู้ใหญ่ในตัวอย่าง (คอมโพเนนต์จัดคำ) */
  priceSource: "RETAIL" | "SEASON" | "DEPARTURE" | null;
  seasonName: string | null;
  lines: ExampleLineVM[];
  totalSatang: number | null;
  totalText: string | null;
  /** null = คิดได้ · NO_DEPARTURE · NO_PAX · PRICING (errorDetailTh = ข้อความของตัวคิดราคา) */
  error: "NO_DEPARTURE" | "NO_PAX" | "PRICING" | null;
  errorDetailTh: string | null;
  /** เหตุผลจากตัวคิดราคา (details.reason เช่น PRICE_MISSING) — จอแปลเป็นข้อความตามภาษาได้ */
  errorReason: string | null;
  choices: { departureId: string; localDate: string }[];
};
/** ค่าที่ใช้กับสินค้านี้ในรูปที่จอจัดคำได้ทุกภาษา */
export type AppliedView =
  | { code: "MINUTES"; n: number }
  | { code: "CUTOFF"; days: number; hm: string }
  | { code: "MIN_PAX"; n: number }
  | { code: "NO_MIN" }
  | { code: "LADDER"; pcts: number[] }
  | { code: "FULL" }
  | { code: "PCT"; n: number }
  | { code: "NONE" };
export type ProductEditorVM = {
  product: { id: string; slug: string; productType: string; status: string; title: { th: string; en: string | null }; currency: string; publishedAt: string | null; archived: boolean };
  locales: ["th", "en"];
  flags: { canEdit: boolean; canPublish: boolean; canEditPrices: boolean; showSeatCounts: boolean; readOnly: boolean; showCurrency: boolean; currencyLocked: boolean; canOpenSettings: boolean };
  options: { id: string; nameTh: string; active: boolean; durationMin: number | null; nights: number | null; capacity: number | null; resources: ResourcesVM | null; departTimeMin: number | null }[];
  paxRows: PaxRowVM[];
  /** ราคาในตารางประเภทคน = ราคา ณ วันนี้ (ไม่รวมราคาเฉพาะรอบ) · ฤดูที่ใช้ · ช่วงอายุ: คัดจากค่าตั้งตอนสร้างและยังเท่ากัน / ปรับที่สินค้าแล้ว */
  paxPrice: { atDate: string; seasonName: string | null };
  ageSource: "COPIED_FROM_SETTING" | "CUSTOMISED";
  departuresTruncated: boolean;
  /** จำนวนรอบที่มีราคาเฉพาะรอบที่แสดง / ทั้งหมด (อนาคต) — ข้อความ "แสดง N จาก M" ใช้สองค่านี้ ไม่ใช่จำนวนแถวทั้งตาราง */
  pricedShown: number;
  pricedTotal: number;
  seasons: SeasonRowVM[];
  departures: DepartureRowVM[];
  extras: ExtraRowVM[];
  extraWarnings: { code: "UNIT_EXTRA_SUPPRESSED"; kind: string; unitExtraId: string; productExtraId: string; unitExtraName: string; productExtraName: string; productOptional: boolean; messageTh: string }[];
  pickup: { departTimeMin: number | null; zones: (PickupZoneDTO & { window: PickupWindow | null })[] };
  content: { rows: { section: string; th: "HAS" | "MISSING" | "AUTO"; en: "TRANSLATED" | "NOT_TRANSLATED" | "AUTO"; enPreview: string | null }[]; untranslated: string[]; texts: Record<string, { th: string; en: string }> };
  photos: { count: number; invalid: number };
  brochure: BrochureVM;
  applied: { key: string; value: unknown; view: AppliedView; source: string; atProduct: boolean }[];
  example: ExampleVM;
};

/** ค่าที่ใช้กับสินค้านี้ → รูปสั้นแบบภาพ 16 (แสดงผลเท่านั้น · คำอยู่ใน messages) */
function appliedView(key: string, v: unknown): AppliedView {
  switch (key) {
    case "trips.sell.holdMinutes":
      return typeof v === "number" ? { code: "MINUTES", n: v } : { code: "NONE" };
    case "trips.sell.cutoff":
      if (!isRec(v) || typeof v.daysBefore !== "number" || typeof v.atMin !== "number") return { code: "NONE" };
      return { code: "CUTOFF", days: v.daysBefore, hm: `${String(Math.floor(v.atMin / 60)).padStart(2, "0")}:${String(v.atMin % 60).padStart(2, "0")}` };
    case "trips.sell.minToDepart":
      return isRec(v) && typeof v.minPax === "number" ? { code: "MIN_PAX", n: v.minPax } : { code: "NO_MIN" };
    case "trips.cancel.ladder":
      return Array.isArray(v) ? { code: "LADDER", pcts: v.map((x) => (isRec(x) && typeof x.refundPct === "number" ? x.refundPct : 0)) } : { code: "NONE" };
    case "trips.pay.depositPct":
      return typeof v === "number" ? (v >= 100 ? { code: "FULL" } : { code: "PCT", n: v }) : { code: "NONE" };
    default:
      return { code: "NONE" };
  }
}

const SEAT_ORDER = ["ADULT", "CHILD", "INFANT"];
const seatRank = (code: string) => (SEAT_ORDER.includes(code) ? SEAT_ORDER.indexOf(code) : SEAT_ORDER.length);
type SampleQuote = { adult: number | null; child: number | null; childBasis: PaxRowVM["priceBasis"]; source: DepartureRowVM["source"]; seasonId: string | null; overridesSeasonId: string | null };
function seatOf(items: PricedItem[], code: string): PricedItem | undefined {
  return items.find((i) => i.kind === "SEAT" && i.paxTypeCode === code);
}
const unitSatangOf = (it: PricedItem): number => (it.qty > 0 ? Math.round(it.amountSatang / it.qty) : 0);
const basisOf = (it: PricedItem | undefined): PaxRowVM["priceBasis"] => {
  if (!it) return "MISSING";
  if (it.priceTrace.at(-1)?.note === "CHILD_PCT") return "DERIVED_PCT";
  return unitSatangOf(it) === 0 ? "FREE" : "SET";
};
/** ราคาผู้ใหญ่/เด็กของผลคิดราคา + ที่มาของราคาผู้ใหญ่ (ฤดูกาล/ราคารอบ) */
function sampleOf(q: PricedQuote, priceSeason: Map<string, string | null>): SampleQuote {
  const a = seatOf(q.items, "ADULT");
  const c = seatOf(q.items, "CHILD");
  const seasonTrace = a?.priceTrace.filter((t) => t.step === "SEASON").at(-1);
  const seasonId = seasonTrace?.refId ? (priceSeason.get(seasonTrace.refId) ?? null) : null;
  const src = a?.priceSource;
  return {
    adult: a ? unitSatangOf(a) : null,
    child: c ? unitSatangOf(c) : null,
    childBasis: basisOf(c),
    source: src === "RETAIL" || src === "SEASON" || src === "DEPARTURE" ? src : null,
    seasonId: src === "SEASON" ? seasonId : null,
    overridesSeasonId: src === "DEPARTURE" ? seasonId : null,
  };
}

export async function loadProductEditorVM(ctx: TripsScreenCtx, input: unknown, opts?: Opts): Promise<{ ok: true; vm: ProductEditorVM } | Fail> {
  const p = parse(EDITOR_IN, input);
  if (isFail(p)) return p;
  const g = await gate(ctx, { unitId: p.unitId });
  if (isFail(g)) return g;
  if (!g.canAny(TRIPS_PRODUCT_VIEW_ANY)) return tripsFail("FORBIDDEN");
  const now = nowOf(opts);
  const got = await getProduct(ctx, { unitId: g.unitId, productId: p.productId, locale: "en" });
  if (!got.ok) return got.code === "FORBIDDEN" ? tripsFail("FORBIDDEN") : tripsFail("NOT_FOUND");
  const prod: ProductDTO = got.product;
  const archived = prod.status === "ARCHIVED";
  const canEdit = g.can("trips.product.edit");
  const showSeatCounts = g.canAny(DEPARTURE_ANY);
  const tenantId = g.tenantId;
  const unitId = g.unitId;

  // ── กฎรอบ · ทรัพยากร · ตัวเลือก ──
  const scheds = await activeSchedules(g, [prod.id], now);
  const res = await resourceMap(g, scheds.flatMap((s) => s.resourceIds));
  const resKinds = new Map([...res.values()].map((r) => [r.id, r.kind]));
  const options = prod.options.map((o) => {
    const s = scheduleFor(scheds, prod.id, o.id);
    return { id: o.id, nameTh: o.name.th, active: o.active, durationMin: o.durationMin, nights: o.nights, capacity: s?.capacity ?? null, resources: s ? resourcesOf(s.resourceIds, res) : null, departTimeMin: s?.departTimeMin ?? null };
  });
  const firstOpt = prod.options.find((o) => o.active) ?? null;
  const firstSched = firstOpt ? scheduleFor(scheds, prod.id, firstOpt.id) : null;

  // ── รอบ (2 รอบถัดไปของตัวเลือกแรกที่เปิด + ทุกรอบที่มีราคาเฉพาะรอบ · ไม่นับยกเลิก) ──
  const DEP_SELECT = { id: true, optionId: true, localDate: true, startsAt: true, status: true, capacity: true, sold: true, held: true, reserved: true } as const;
  const [nextDeps, depPriceRows, seasonRows, priceCount, unitExtras, lineDefs] = await Promise.all([
    g.db.tripDeparture.findMany({
      where: { tenantId, unitId, productId: prod.id, status: { not: "CANCELLED" }, startsAt: { gte: now }, ...(firstOpt ? { optionId: firstOpt.id } : {}) },
      orderBy: [{ startsAt: "asc" }, { id: "asc" }],
      take: 2,
      select: DEP_SELECT,
    }),
    g.db.tripPrice.findMany({ where: { tenantId, unitId, productId: prod.id, departureId: { not: null } }, distinct: ["departureId"], select: { departureId: true } }),
    g.db.tripSeason.findMany({ where: { tenantId, unitId, status: "ACTIVE" }, orderBy: [{ dateStart: "asc" }, { id: "asc" }], select: { id: true, name: true, dateStart: true, dateEnd: true, priority: true } }),
    g.db.tripPrice.count({ where: { tenantId, unitId, productId: prod.id } }),
    g.db.tripExtra.findMany({ where: { tenantId, unitId, productId: null }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }, { id: "asc" }] }),
    resolveSettings({ tenantId }, [LINE_DEFAULTS_KEY, CHILD_BAND_KEY, ...APPLIED_KEYS], { unitId, productId: prod.id }, now),
  ]);
  const depPriceIds = [...new Set(depPriceRows.map((r) => r.departureId).filter((x): x is string => typeof x === "string"))];
  // รอบที่มีราคาเฉพาะรอบ: อนาคตเท่านั้น · เรียงเวลา · ไม่เกินเพดาน (เกิน ⇒ departuresTruncated)
  const pricedWhere = { tenantId, unitId, productId: prod.id, id: { in: depPriceIds }, status: { not: "CANCELLED" }, startsAt: { gte: now } };
  let pricedDeps: typeof nextDeps = [];
  let pricedTotal = 0;
  if (depPriceIds.length) {
    [pricedDeps, pricedTotal] = await Promise.all([
      g.db.tripDeparture.findMany({ where: pricedWhere, orderBy: [{ startsAt: "asc" }, { id: "asc" }], take: TRIPS_PRICED_DEPARTURE_CAP, select: DEP_SELECT }),
      g.db.tripDeparture.count({ where: pricedWhere }),
    ]);
  }
  const depMap = new Map([...nextDeps, ...pricedDeps].map((d) => [d.id, d]));
  const deps = [...depMap.values()].sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime() || a.id.localeCompare(b.id));

  // ── รอบตัวอย่าง ──
  let exampleDep: (typeof nextDeps)[number] | null = nextDeps[0] ?? null;
  if (p.exampleDepartureId) {
    const d = await g.db.tripDeparture.findFirst({ where: { tenantId, unitId, productId: prod.id, id: p.exampleDepartureId }, select: DEP_SELECT });
    if (!d) return tripsFail("NOT_FOUND");
    exampleDep = d;
  }
  if (!exampleDep) {
    exampleDep = await g.db.tripDeparture.findFirst({ where: { tenantId, unitId, productId: prod.id, status: { not: "CANCELLED" }, startsAt: { gte: now } }, orderBy: [{ startsAt: "asc" }, { id: "asc" }], select: DEP_SELECT });
  }

  // ── ราคา (ตัวคิดราคาจริง) ──
  const paxActive = prod.paxTypes.filter((x) => x.active);
  const ptByCode = new Map(paxActive.map((x) => [x.code, x]));
  const sellCtx = (channel: SellCtx["channel"]): SellCtx => ({ tenantId, unitId, channel, actor: { kind: "STAFF", userId: g.actorUserId }, now, locale: "th" });
  const line = (slotId: string, pax: { paxTypeId: string; qty: number }[], extras?: { extraId: string; qty: number }[]): LineRequest => ({
    productKind: "TRIP",
    unitId,
    productId: prod.id,
    slotId,
    pax,
    ...(extras && extras.length ? { extras } : {}),
  });
  const pairPax = (): { paxTypeId: string; qty: number }[] => {
    const a = ptByCode.get("ADULT") ?? paxActive.find((x) => x.countsCapacity) ?? paxActive[0];
    const c = ptByCode.get("CHILD");
    return [...(a ? [{ paxTypeId: a.id, qty: 1 }] : []), ...(c && c.id !== a?.id ? [{ paxTypeId: c.id, qty: 1 }] : [])];
  };
  let pin: TripPricingInput | null = null;
  if (exampleDep && paxActive.length) {
    const li = await loadPricingInput(sellCtx("COUNTER"), line(exampleDep.id, paxActive.map((x) => ({ paxTypeId: x.id, qty: 1 }))));
    if (li.ok) pin = li.value;
  }
  const priceSeason = new Map<string, string | null>((pin?.prices ?? []).map((r) => [r.id, r.seasonId]));
  const seasonName = new Map(seasonRows.map((s) => [s.id, s.name]));
  const childPctRaw = pin?.policy[CHILD_PCT_KEY];
  const childPct = typeof childPctRaw === "number" ? childPctRaw : null;

  // ช่วงอายุ: T0.2 คัดค่า T27 ลงคอลัมน์ตอนสร้าง (มติ T0.2 §11 ข้อ 5) — แถวไม่ผูกกับค่าตั้งสด ⇒ ที่มา = PRODUCT เสมอเมื่อมีคอลัมน์
  //   equalsSetting = ข้อเท็จจริงว่ายังเท่าช่วงที่ค่าตั้งให้ตอนนี้ (หัวตาราง "คัดจากค่าตั้งตอนสร้าง" / "ปรับที่สินค้าแล้ว")
  const t27raw = lineDefs[CHILD_BAND_KEY]?.value;
  const t27: T27Value | null = isRec(t27raw) && typeof t27raw.infantBelow === "number" && typeof t27raw.childFrom === "number" && typeof t27raw.childTo === "number" ? { infantBelow: t27raw.infantBelow, childFrom: t27raw.childFrom, childTo: t27raw.childTo } : null;
  const bandSourceOf = (x: ProductDTO["paxTypes"][number]): PaxRowVM["bandSource"] => (x.band.source === "PAX_TYPE" ? "PRODUCT" : x.band.source === "SETTING" ? "SETTING" : "NONE");
  const equalsSettingOf = (x: ProductDTO["paxTypes"][number]): boolean => {
    if (!t27) return false;
    const fromSetting = effectivePaxBand({ code: x.code, ageMin: null, ageMax: null }, t27);
    return fromSetting.source === "SETTING" && fromSetting.from === x.band.from && fromSetting.to === x.band.to;
  };
  // ราคาตารางประเภทคน/ฤดูกาล: ตัดแถวราคาเฉพาะรอบออกจากอินพุต (กรองข้อมูล ไม่คิดเลขเอง) — ไม่ให้ราคาของ ?ex= ลามไปทั้งตาราง
  //   อินพุตกลาง (กรอง/แทนค่า ไม่คิดเลขเอง) สำหรับแถวฤดูกาลและ "ราคาวันนี้":
  //   • ตัดแถวราคาเฉพาะรอบ · • ตัดกฎราคา/โค้ด/แต้ม (rules [] · promoCode null · promoProviders []) — กฎโปร (เช่นนาทีสุดท้าย/ตามที่นั่ง) ไม่ลามจากรอบตัวอย่าง
  //   • วันเดินทาง = วันที่ขอ · เวลาออก = เวลาท้องถิ่นเดียวกับรอบตัวอย่าง (tripLocalToUtcIso) · ที่นั่ง sold/held/reserved = 0 · ต้นทุนรอบ = 0
  const todayYmd = utcToLocal(pin?.tz, now).ymd;
  const depMinutes = pin ? utcToLocal(pin.tz, new Date(pin.departure.startsAt)).minutes : 0;
  const basePin: TripPricingInput | null = pin ? { ...pin, prices: pin.prices.filter((r) => r.departureId === null), rules: [], promoCode: null, promoProviders: [] } : null;
  const atDate = (d: string): TripPricingInput | null =>
    basePin ? { ...basePin, departure: { ...basePin.departure, localDate: d, startsAt: tripLocalToUtcIso(basePin.tz, d, depMinutes), sold: 0, held: 0, reserved: 0, costSatang: 0 } } : null;
  const todayPin = atDate(todayYmd);

  // ประเภทคน: ราคา ณ วันนี้ คนละ 1 ที่ (ไม่รวมราคาเฉพาะรอบ)
  const paxRows: PaxRowVM[] = [...prod.paxTypes]
    .sort((a, b) => seatRank(a.code) - seatRank(b.code) || a.sortOrder - b.sortOrder)
    .map((x) => {
      let it: PricedItem | undefined;
      if (todayPin && x.active) {
        const r = resolveTripPrice({ ...todayPin, pax: [{ paxTypeId: x.id, qty: 1 }] });
        if (r.ok) it = seatOf(r.value.items, x.code);
      }
      const basis = basisOf(it);
      return {
        paxTypeId: x.id,
        code: x.code,
        labelTh: x.label.th,
        ageFrom: x.band.from,
        ageTo: x.band.to,
        bandSource: bandSourceOf(x),
        equalsSetting: equalsSettingOf(x),
        countsCapacity: x.countsCapacity,
        active: x.active,
        priceSatang: it ? unitSatangOf(it) : null,
        priceBasis: basis,
        derivedPct: basis === "DERIVED_PCT" ? childPct : null,
      };
    });

  const paxSeasonQ = todayPin ? resolveTripPrice({ ...todayPin, pax: pairPax() }) : null;
  const paxSeasonId = paxSeasonQ?.ok ? sampleOf(paxSeasonQ.value, priceSeason).seasonId : null;
  const seatRows = paxRows.filter((r) => r.bandSource !== "NONE");
  const ageSource: ProductEditorVM["ageSource"] = seatRows.every((r) => r.bandSource === "SETTING" || r.equalsSetting) ? "COPIED_FROM_SETTING" : "CUSTOMISED";

  // ฤดูกาล: คิดใหม่จากอินพุตเดียวกัน (ไม่มีแถวราคาเฉพาะรอบ) โดยเปลี่ยนวันเดินทางเป็นวันแรกของฤดู (ไม่คูณ % เอง)
  const covering = seasonRows.filter((s) => ymdOf(s.dateStart) <= todayYmd && todayYmd <= ymdOf(s.dateEnd)).sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id));
  const inEffectId = covering[0]?.id ?? null;
  const seasons: SeasonRowVM[] = seasonRows.map((s) => {
    let adult: number | null = null;
    let child: number | null = null;
    let childBasis: PaxRowVM["priceBasis"] = "MISSING";
    const sp = atDate(ymdOf(s.dateStart));
    if (sp) {
      const r = resolveTripPrice({ ...sp, pax: pairPax() });
      if (r.ok) {
        const q = sampleOf(r.value, priceSeason);
        adult = q.adult;
        child = q.child;
        childBasis = q.childBasis;
      }
    }
    return { seasonId: s.id, name: s.name, dateStart: ymdOf(s.dateStart), dateEnd: ymdOf(s.dateEnd), adultSatang: adult, childSatang: child, childBasis, inEffect: s.id === inEffectId };
  });

  // ราคารายรอบ: quoteTripLine (ผู้ใหญ่ 1 + เด็ก 1) · รอบ ≤ 2 + เพดาน · คิดเป็นชุดละ 5
  const quotes: (SampleQuote | null)[] = [];
  for (let i = 0; i < deps.length; i += 5) {
    const chunk = await Promise.all(
      deps.slice(i, i + 5).map(async (d) => {
        if (!paxActive.length) return null;
        const r = await quoteTripLine(sellCtx("COUNTER"), line(d.id, pairPax()));
        return r.ok ? sampleOf(r.value, priceSeason) : null;
      }),
    );
    quotes.push(...chunk);
  }
  const departures: DepartureRowVM[] = deps.map((d, i) => {
    const q = quotes[i] ?? null;
    return {
      departureId: d.id,
      localDate: ymdOf(d.localDate),
      status: d.status,
      capacity: d.capacity,
      sold: showSeatCounts ? d.sold : null,
      full: d.sold + d.held + d.reserved >= d.capacity,
      adultSatang: q?.adult ?? null,
      childSatang: q?.child ?? null,
      source: q?.source ?? null,
      seasonName: q?.seasonId ? (seasonName.get(q.seasonId) ?? null) : null,
      overridesSeasonName: q?.overridesSeasonId ? (seasonName.get(q.overridesSeasonId) ?? null) : null,
      hasOwnPrice: depPriceIds.includes(d.id),
    };
  });

  // ── รายการเสริม (ของสินค้า + ของร้าน) + คำเตือนของร้านถูกแทน (มติ T0.5 ข้อ 1) ──
  const lines = isRec(lineDefs[LINE_DEFAULTS_KEY]?.value) ? (lineDefs[LINE_DEFAULTS_KEY]?.value as Record<string, unknown>) : {};
  const pctOf = (kind: string): number => {
    const l = lines[kind];
    return isRec(l) && typeof l.commissionPct === "number" ? l.commissionPct : 0;
  };
  const productExtras: ExtraRowVM[] = prod.extras.map((e) => ({
    id: e.id,
    kind: e.kind,
    nameTh: e.name.th,
    noteTh: e.note?.th ?? null,
    basis: e.basis,
    mandatory: e.mandatory,
    priceSatang: e.priceMinor,
    paxPrices: e.paxPrices,
    commissionable: e.commissionable,
    commissionPct: e.commissionPct,
    discountable: e.discountable,
    passThrough: e.passThrough,
    scope: "PRODUCT",
    active: e.active,
  }));
  const unitExtraRows: ExtraRowVM[] = unitExtras.map((e) => {
    const name = i18nOf(e.name);
    const pp = isRec(e.paxPrices) ? (Object.fromEntries(Object.entries(e.paxPrices).filter(([, v]) => typeof v === "number")) as Record<string, number>) : null;
    return {
      id: e.id,
      kind: e.kind,
      nameTh: name.th ?? "",
      noteTh: i18nOf(e.note).th ?? null,
      basis: e.basis,
      mandatory: e.mandatory,
      priceSatang: e.priceMinor,
      paxPrices: pp,
      commissionable: e.commissionable,
      commissionPct: e.commissionable ? pctOf(e.kind) : 0,
      discountable: e.discountable,
      passThrough: e.passThrough,
      scope: "UNIT",
      active: e.active,
    };
  });
  const extraWarnings: ProductEditorVM["extraWarnings"] = [];
  for (const u of unitExtraRows) {
    if (!u.active || !u.mandatory) continue;
    const pe = productExtras.find((x) => x.active && x.kind === u.kind);
    if (pe) {
      extraWarnings.push({
        code: "UNIT_EXTRA_SUPPRESSED",
        kind: u.kind,
        unitExtraId: u.id,
        productExtraId: pe.id,
        unitExtraName: u.nameTh,
        productExtraName: pe.nameTh,
        productOptional: !pe.mandatory,
        messageTh: `รายการบังคับของร้าน «${u.nameTh}» ไม่ถูกคิดกับสินค้านี้ เพราะสินค้ามี «${pe.nameTh}» ชนิดเดียวกันแล้ว${pe.mandatory ? "" : " (ของสินค้าเป็นแบบเลือกได้)"}`,
      });
    }
  }

  // ── รับส่ง (ของหน่วย ใช้ร่วมทุกสินค้า · มติ Q2) ──
  const departTimeMin = firstSched?.departTimeMin ?? null;
  const zones = (await activePickupZonesOf(g)).map((zz) => ({ ...zz, window: departTimeMin === null ? null : pickupWindowFor(zz, departTimeMin) }));

  // ── เนื้อหา ไทย/EN (zh ไม่แสดง) ──
  const sectionText: Record<string, { th?: string | null; en?: string | null } | null> = {
    title: prod.title,
    summary: prod.body.summary ?? null,
    itinerary: prod.body.itinerary ?? null,
    includes: prod.body.includes ?? null,
    meeting: prod.meetingPoint?.text ?? null,
  };
  const contentRows: ProductEditorVM["content"]["rows"] = Object.entries(sectionText).map(([section, t]) => ({
    section,
    th: hasLocale(t, "th") ? "HAS" : "MISSING",
    en: hasLocale(t, "en") ? "TRANSLATED" : "NOT_TRANSLATED",
    enPreview: section === "title" ? textOf(t?.en) : null,
  }));
  contentRows.push({ section: "policy", th: "AUTO", en: "AUTO", enPreview: null });
  const texts = Object.fromEntries(Object.entries(sectionText).map(([k, t]) => [k, { th: textOf(t?.th) ?? "", en: textOf(t?.en) ?? "" }]));

  // ── รูป (หนี้ T0.2: นับเฉพาะ FileAsset ของร้านนี้) ──
  const photoIds = [...new Set(prod.body.photoFileIds ?? [])];
  const validPhotos = photoIds.length ? await tenantDb({ tenantId }).fileAsset.count({ where: { tenantId, id: { in: photoIds } } }) : 0;

  // ── ชี้ชวน · ค่าที่ใช้ ──
  const brochure: BrochureVM = (await brochuresOf(g, [{ productId: prod.id, options: prod.options, body: prod.body, disclosure: prod.disclosure }], scheds, resKinds, now)).get(prod.id) ?? { enabled: false, ...prospectusChecklist({}) };
  const applied = APPLIED_KEYS.map((key) => {
    const r: Resolved | undefined = lineDefs[key];
    return { key, value: r?.value ?? null, view: appliedView(key, r?.value), source: String(r?.source ?? "FALLBACK"), atProduct: r?.source === "PRODUCT" };
  });

  // ── ลูกค้าจะเห็น (ตะกร้าตัวอย่าง · STAFF · ช่องทาง WEB) ──
  const example: ExampleVM = { departureId: exampleDep?.id ?? null, localDate: exampleDep ? ymdOf(exampleDep.localDate) : null, priceSource: null, seasonName: null, lines: [], totalSatang: null, totalText: null, error: null, errorDetailTh: null, errorReason: null, choices: deps.map((d) => ({ departureId: d.id, localDate: ymdOf(d.localDate) })) };
  if (exampleDep && !example.choices.some((c) => c.departureId === exampleDep?.id)) example.choices.unshift({ departureId: exampleDep.id, localDate: ymdOf(exampleDep.localDate) });
  if (!exampleDep) example.error = "NO_DEPARTURE";
  else {
    const pax = Object.entries(TRIPS_PRICE_EXAMPLE_DEFAULT.pax).flatMap(([code, qty]) => {
      const pt = ptByCode.get(code);
      return pt && qty > 0 ? [{ paxTypeId: pt.id, qty }] : [];
    });
    const usable = [...productExtras, ...unitExtraRows.filter((u) => !productExtras.some((pe) => pe.active && pe.kind === u.kind))];
    const extras = usable.filter((e) => e.active && !e.mandatory && TRIPS_PRICE_EXAMPLE_DEFAULT.extraKinds.includes(e.kind)).map((e) => ({ extraId: e.id, qty: 1 }));
    if (!pax.length) example.error = "NO_PAX";
    else {
      const r = await quoteTripLine(sellCtx("WEB"), line(exampleDep.id, pax, extras));
      if (!r.ok) {
        example.error = "PRICING";
        example.errorDetailTh = r.messageTh;
        const reason = r.details?.reason;
        example.errorReason = typeof reason === "string" ? reason : null;
      }
      else {
        const s = sampleOf(r.value, priceSeason);
        example.priceSource = s.source;
        example.seasonName = s.seasonId ? (seasonName.get(s.seasonId) ?? null) : null;
        const grouped = new Map<string, PricedItem[]>();
        for (const it of r.value.items) {
          const k = it.kind === "EXTRA" && it.extraId ? `extra:${it.extraId}` : it.itemRef;
          grouped.set(k, [...(grouped.get(k) ?? []), it]);
        }
        for (const [k, its] of grouped) {
          const amount = its.reduce((sum, i) => sum + i.amountSatang, 0);
          const qty = its.reduce((sum, i) => sum + i.qty, 0);
          const ex = usable.find((e) => `extra:${e.id}` === k);
          example.lines.push({
            kind: its[0].kind,
            paxCode: its.length === 1 && its[0].kind === "SEAT" ? its[0].paxTypeCode : null,
            labelTh: ex?.nameTh ?? its[0].label,
            qtys: its.map((i) => i.qty),
            qty,
            unitSatang: its.length === 1 ? unitSatangOf(its[0]) : null,
            amountSatang: amount,
          });
        }
        example.totalSatang = r.value.totals.payableSatang;
        example.totalText = formatBaht(r.value.totals.payableSatang);
      }
    }
  }

  const vm: ProductEditorVM = {
    product: { id: prod.id, slug: prod.slug, productType: prod.productType, status: prod.status, title: { th: prod.title.th, en: textOf(prod.title.en) }, currency: prod.currency, publishedAt: prod.publishedAt ? prod.publishedAt.toISOString() : null, archived },
    locales: ["th", "en"],
    flags: {
      canEdit,
      canPublish: g.can("trips.product.publish"),
      canEditPrices: g.can("trips.price.edit"),
      showSeatCounts,
      readOnly: archived || !canEdit,
      showCurrency: prod.productType === "LIVEABOARD",
      currencyLocked: prod.publishedAt !== null || priceCount > 0,
      canOpenSettings: g.canAny(SETTINGS_ANY),
    },
    options,
    paxRows,
    paxPrice: { atDate: todayYmd, seasonName: paxSeasonId ? (seasonName.get(paxSeasonId) ?? null) : null },
    ageSource,
    departuresTruncated: pricedTotal > pricedDeps.length,
    pricedShown: pricedDeps.length,
    pricedTotal,
    seasons,
    departures,
    extras: [...productExtras, ...unitExtraRows],
    extraWarnings,
    pickup: { departTimeMin, zones },
    content: { rows: contentRows, untranslated: [...prod.translation.missing], texts },
    photos: { count: validPhotos, invalid: photoIds.length - validPhotos },
    brochure,
    applied,
    example,
  };
  return { ok: true, vm };
}

// ═══════════════ 5. จอค่าตั้ง (ภาพ 17) ═══════════════
const SETTINGS_IN = z
  .strictObject({ unitId: ID, scope: z.enum(["UNIT", "PRODUCT"]).optional(), productId: ID.optional(), section: z.enum(TRIPS_SETTINGS_SECTION_KEYS).optional() })
  .refine((v) => (v.scope === "PRODUCT" ? !!v.productId : true));
export type TripsSettingsVM = {
  scope: "UNIT" | "PRODUCT";
  scopeId: string;
  productId: string | null;
  section: TripsSettingsSectionKey | null;
  unitName: string;
  form: SettingsFormModel;
  header: { templateKey: string | null; templateLabelTh: string | null; differsCount: number; productOverrideCount: number };
  sections: { key: TripsSettingsSectionKey; labelTh: string; groups: readonly string[]; fieldCount: number; differsCount: number; warningCount: number }[];
  products: { id: string; titleTh: string; productType: string; overrideCount: number }[];
  /** masked = เครื่องยนต์ซ่อนค่านี้จากผู้ดู (PRIVACY ไม่ใช่เจ้าของ) หรือคีย์ไม่อยู่ในฟอร์มที่ผู้ดูเห็น ⇒ value null เสมอ (ไม่ส่งค่าจริงถึงเบราว์เซอร์) */
  productOverrides: { key: string; productId: string; titleTh: string; value: unknown; masked: boolean }[];
  standingWarnings: { key: string; code: string; severity: TourSeverity; messageTh: string }[];
  canEdit: boolean;
  /**
   * การ์ดที่จอ trips จัดรูปค่าเอง (ทะเบียนไม่มีชนิดช่องย่อยที่ตรง — ภาพ 17): ขั้นบันไดคืนเงินเป็นช่อง · ข้อมูลผู้เดินทางแยกบังคับ/ไม่บังคับ/ไม่ขอ
   * · ตารางค่าอุทยาน · ตัวเลือกเมื่อร้านยกเลิกรอบ · ค่าใช้จ่ายที่หักได้ (สามคีย์หลังมีรายการซ้อนในออบเจกต์ ⇒ ไม่มี tableTh)
   */
  fieldViews: Record<string, TripsFieldView>;
};
export type TripsFieldView = "LADDER" | "PAX_FIELDS" | "PARK_FEE" | "CANCEL_OPTIONS" | "DEDUCTIONS" | "SATANG_FIELDS";
const FIELD_VIEWS: Readonly<Record<string, TripsFieldView>> = {
  "trips.cancel.ladder": "LADDER",
  "trips.pax.fields": "PAX_FIELDS",
  "trips.parkFee.table": "PARK_FEE",
  "trips.cancel.shopCancelOptions": "CANCEL_OPTIONS",
  "trips.cancel.deductions": "DEDUCTIONS",
  // ช่องย่อยเงินเก็บเป็นสตางค์ (ชนิดช่องย่อยของทะเบียนไม่มีเงิน) — การ์ดแสดงเป็นบาท · ตัวแก้คงเป็นสตางค์ตามทะเบียน
  "trips.tax.vatRegistered": "SATANG_FIELDS",
  "trips.insurance.minSum": "SATANG_FIELDS",
};
const SEV_RANK: Record<string, number> = { HIGHEST: 3, HIGH: 2, NORMAL: 1 };

/** ผู้กระทำของเครื่องยนต์ค่าตั้ง จากสมาชิกภาพสด */
export function settingsActorOf(g: TripsUnitGate): SettingsActor {
  return { role: g.member.role, unitAccess: [...g.member.unitAccess], permissions: { ...g.member.permissions }, userId: g.actorUserId };
}

export async function loadTripsSettingsVM(ctx: TripsScreenCtx, input: unknown, opts?: Opts): Promise<{ ok: true; vm: TripsSettingsVM } | Fail> {
  const p = parse(SETTINGS_IN, input);
  if (isFail(p)) return p;
  const g = await gate(ctx, { unitId: p.unitId });
  if (isFail(g)) return g;
  if (!g.canAny(SETTINGS_ANY)) return tripsFail("FORBIDDEN");
  const now = nowOf(opts);
  const scope = p.scope ?? "UNIT";
  const products = await g.db.tripProduct.findMany({ where: { tenantId: g.tenantId, unitId: g.unitId }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], select: { id: true, title: true, productType: true, status: true } });
  const productId = scope === "PRODUCT" ? (p.productId ?? null) : null;
  if (productId && !products.some((x) => x.id === productId)) return tripsFail("NOT_FOUND");
  const actor = settingsActorOf(g);
  const form = await loadSettingsForm(actor, { tenantId: g.tenantId }, { domains: ["trips"], unitId: g.unitId, unitType: "TRIPS", scope, ...(productId ? { scopeId: productId } : {}) });
  if (!form) return tripsFail("NOT_FOUND");

  // ค่าที่ตั้งรายสินค้า (ชั้น PRODUCT ของสินค้าในหน่วยนี้ · ค่าที่มีผล ณ ตอนนี้)
  const titleOf = new Map(products.map((x) => [x.id, i18nOf(x.title).th ?? ""]));
  const rows = products.length
    ? await tenantDb({ tenantId: g.tenantId }).settingValue.findMany({
        where: { tenantId: g.tenantId, scope: "PRODUCT", scopeId: { in: products.map((x) => x.id) }, key: { startsWith: "trips." }, effectiveFrom: { lte: now } },
        orderBy: [{ effectiveFrom: "desc" }],
        select: { key: true, scopeId: true, value: true },
      })
    : [];
  // การมองเห็นต่อคีย์มาจากเครื่องยนต์ (form.fields[].masked) — ไม่ตัดสินซ้ำที่นี่ · คีย์ที่ไม่อยู่ในฟอร์มที่ผู้ดูเห็น = ปิดไว้ก่อน
  const visibleKeys = new Set(form.groups.flatMap((gr) => gr.fields).filter((f) => !f.masked).map((f) => f.key));
  const seen = new Set<string>();
  const productOverrides: TripsSettingsVM["productOverrides"] = [];
  for (const r of rows) {
    const sig = `${r.key}|${r.scopeId}`;
    if (seen.has(sig) || getDef(r.key)?.domain !== "trips") continue;
    seen.add(sig);
    const visible = visibleKeys.has(r.key);
    productOverrides.push({ key: r.key, productId: r.scopeId, titleTh: titleOf.get(r.scopeId) ?? "", value: visible ? r.value : null, masked: !visible });
  }
  productOverrides.sort((a, b) => a.key.localeCompare(b.key) || products.findIndex((x) => x.id === a.productId) - products.findIndex((x) => x.id === b.productId));

  // คำเตือนค้างของค่าที่บันทึกแล้ว ณ ชั้นที่ดู (ตัวตรวจกฎทัวร์ตัวเดียวกับตอนบันทึก — ไม่เขียนกฎซ้ำ)
  const keys = listDefs("trips").map((d) => d.key);
  const refs = productId ? { unitId: g.unitId, productId } : { unitId: g.unitId };
  const resolved = await resolveSettings({ tenantId: g.tenantId }, keys, refs, now);
  const get = (k: string): unknown => resolved[k]?.value;
  const fields = form.groups.flatMap((gr) => gr.fields);
  const standingWarnings: TripsSettingsVM["standingWarnings"] = [];
  for (const f of fields) {
    const def = getDef(f.key);
    if (!def?.legal?.length || f.masked) continue;
    let inputs: { ruleId: string; input: unknown }[];
    try {
      inputs = legalInputsOf(def, get(f.key), get);
    } catch {
      inputs = def.legal.map((ruleId) => ({ ruleId, input: undefined }));
    }
    for (const { ruleId, input: tin } of inputs) {
      const v = evaluateTourRule(ruleId, tin, { now });
      if (v.level === "WARN" && !standingWarnings.some((w) => w.key === f.key && w.code === v.code)) standingWarnings.push({ key: f.key, code: v.code, severity: v.severity, messageTh: v.messageTh });
    }
  }
  standingWarnings.sort((a, b) => (SEV_RANK[b.severity] ?? 1) - (SEV_RANK[a.severity] ?? 1));

  const sections = TRIPS_SETTINGS_SECTIONS.map((s) => {
    const fs = fields.filter((f) => s.groups.includes(f.group));
    return { key: s.key, labelTh: s.labelTh, groups: s.groups, fieldCount: fs.length, differsCount: fs.filter((f) => f.differsFromTemplate).length, warningCount: standingWarnings.filter((w) => fs.some((f) => f.key === w.key)).length };
  });
  const tpl = form.templates.find((t) => t.domain === "trips") ?? null;
  const vm: TripsSettingsVM = {
    scope,
    scopeId: form.scopeId,
    productId,
    section: p.section ?? null,
    unitName: g.unitName,
    form,
    header: { templateKey: tpl?.key ?? null, templateLabelTh: tpl?.labelTh ?? null, differsCount: form.differsCount, productOverrideCount: productOverrides.length },
    sections,
    products: products
      .filter((x) => x.status !== "ARCHIVED")
      .map((x) => ({ id: x.id, titleTh: titleOf.get(x.id) ?? "", productType: x.productType, overrideCount: productOverrides.filter((o) => o.productId === x.id).length })),
    productOverrides,
    standingWarnings,
    canEdit: fields.some((f) => f.editable),
    fieldViews: Object.fromEntries(fields.filter((f) => FIELD_VIEWS[f.key]).map((f) => [f.key, FIELD_VIEWS[f.key]])),
  };
  return { ok: true, vm };
}
