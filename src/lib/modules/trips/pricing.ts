// ─────────────────────────────────────────────────────────────
// trips/pricing.ts — ตัวโหลดที่ป้อนตัวเลือกราคาบริสุทธิ์ + quote ของ Sellable + snapshot การจอง (RUN TRIPS T0.5)
// ใบสั่ง ledger/trips-briefs/T0.5.md §5.1 §5.5 · สัญญา CC §C (Quote) §F §E (snapshotPolicy นอก tx · L-5)
//
// 🔴 อ่านอย่างเดียว: ไม่มี INSERT/UPDATE/outbox (quote ไม่เขียนฐาน) · tenantDb({tenantId, unitId}) เท่านั้น
// 🔴 ไม่ import โมดูลอื่น — เอเจนซี่ (A1.3) และแต้ม/คูปอง (X.2) เข้ามาทาง port ที่ลงทะเบียน (registerAgencyPricingPort · registerTripPromoProvider)
// 🔴 รอบอ่านจากตาราง TripDeparture ตรง (บริการรอบของ T0.3 ยังไม่ลงทรีนี้)
// ─────────────────────────────────────────────────────────────
import { createHash } from "node:crypto";
import { z } from "zod";
import { tenantDb } from "@/lib/core/db";
import type { DueSpec, LineRequest, Money, Quote, QuoteLine, QuoteRequest, SellCtx, SellResult } from "@/lib/core/sellable";
import { logOps } from "@/lib/core/ops";
import { defaultFor, getDef, resolveSettings, snapshotPolicy, type PolicySnapshot } from "@/lib/core/settings";
import { minorToSatang } from "./money-math";
import {
  REASON_TH,
  TRIP_DEFAULT_TZ,
  agencyPricingInputSchema,
  tripTzValid,
  priceFingerprint,
  resolveTripPrice,
  type AgencyPricingInput,
  type CancelStepBp,
  type PricedQuote,
  type TripPricingInput,
} from "./pricing-core";
import { SnapshotKeyMissing, toTripsSnapshot, type SnapshotFlags, type TripsBookingSnapshot } from "./snapshot";

// ═══════════════ port (ฉีดได้ · คืนตัวยกเลิกลงทะเบียน) ═══════════════
export type AgencyPricingQuery = { agentAccountId?: string; linkId?: string; productId: string; departureId: string; travelDate: string; at: Date };
export type AgencyPricingPort = { load(ctx: SellCtx, q: AgencyPricingQuery): Promise<AgencyPricingInput | null> };
export type TripPromoProvider = {
  key: string;
  evaluate(ctx: SellCtx, q: { partyId: string; discountableSatang: number; lines: { itemRef: string; amountSatang: number }[] }): Promise<{ ref: string; label: string; discountSatang: number } | null>;
  redeemInTx(tx: unknown, ctx: SellCtx, q: { ref: string; bookingId: string; discountSatang: number }): Promise<void>;
  releaseInTx(tx: unknown, ctx: SellCtx, q: { bookingId: string }): Promise<void>;
};
let agencyPort: AgencyPricingPort | null = null;
const promoProviders = new Map<string, TripPromoProvider>();

/** A1.3 ลงทะเบียนชั้นเอเจนซี่ (ระดับ/สัญญา/เงื่อนไขเงิน) — ตัวล่าสุดชนะ */
export function registerAgencyPricingPort(port: AgencyPricingPort): () => void {
  agencyPort = port;
  return () => {
    if (agencyPort === port) agencyPort = null;
  };
}
/** X.2 ลงทะเบียนแต้ม/คูปอง/บัตรของขวัญ (ต่อ key) — ไม่มี = ไม่มีส่วนลด */
export function registerTripPromoProvider(p: TripPromoProvider): () => void {
  promoProviders.set(p.key, p);
  return () => {
    if (promoProviders.get(p.key) === p) promoProviders.delete(p.key);
  };
}

// ═══════════════ ชนิด/ข้อความ ═══════════════
type Fail = Extract<SellResult<never>, { ok: false }>;
const fail = (code: Fail["code"], messageTh: string, details?: Record<string, unknown>): Fail => ({ ok: false, code, messageTh, retryable: false, ...(details ? { details } : {}) });
const NOT_FOUND_TH = "ไม่พบรายการนี้ในหน่วยที่เลือก";
const INT4 = 2_147_483_647;
const ID = z.string().min(1).max(200);
const NN = z.number().int().min(0).max(INT4);

const CTX = z.object({
  tenantId: ID,
  unitId: ID,
  channel: z.string().min(1).max(40),
  actor: z.object({ kind: z.enum(["STAFF", "AGENT", "PUBLIC", "SYSTEM"]), agentAccountId: z.string().optional() }),
  now: z.date().optional(),
  locale: z.enum(["th", "en"]).optional(),
});
const LINE = z.strictObject({
  productKind: z.string(),
  unitId: ID,
  productId: ID,
  slotId: ID,
  optionId: ID.optional(),
  pax: z.array(z.strictObject({ paxTypeId: ID, qty: NN.max(100_000) })).min(1).max(50),
  unitIds: z.array(ID).max(200).optional(),
  wholeCabinIds: z.array(ID).max(200).optional(),
  extras: z.array(z.strictObject({ extraId: ID, qty: NN.max(100_000) })).max(200).optional(),
  pickupZoneId: ID.optional(),
  promoCode: z.string().max(64).optional(),
  currency: z.string().regex(/^[A-Z]{3}$/).optional(),
});
const OPTS = z.strictObject({
  overrides: z.array(z.strictObject({ itemRef: z.string().min(1).max(200), unitMinor: NN, reason: z.string().max(500) })).max(200).optional(),
  canOverride: z.boolean().optional(),
  overrideApprovals: z.array(z.strictObject({ approvalId: ID, itemRef: z.string().min(1).max(200), unitMinor: NN })).max(200).optional(),
  agentDiscountSatang: NN.optional(),
  partyId: ID.optional(),
  linkId: ID.optional(),
  flags: z.record(z.string(), z.unknown()).optional(),
});
export type QuoteLineOpts = z.input<typeof OPTS>;
/**
 * ค่าตั้ง: อ่าน "ครั้งเดียว" ด้วย snapshotPolicy("trips.booking") — 35 คีย์ที่จดลง snapshot = ชุดเดียวกับที่ใช้คิดบรรทัด/ยอด/ตารางยกเลิก/งวด (มติ r2 ข้อ 6)
 * + คีย์ที่ไม่จดและไม่กระทบยอดเงิน: T11 (เพดานแก้มือ) · T12 (คำเตือนต้นทุน) · T5 (เวลาถือ → expiresAt) อ่านที่เวลาเดียวกัน
 */
const HOLD_KEY = "trips.sell.holdMinutes";
const EXTRA_KEYS = ["trips.price.manualOverrideApprovalPct", "trips.price.costWarnMarginPct", HOLD_KEY];
type Loaded = { input: TripPricingInput; tripsPolicy: PolicySnapshot };

const ymdOf = (d: Date) => d.toISOString().slice(0, 10);
const isRec = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
function labelOf(v: unknown, locale: "th" | "en"): string {
  if (typeof v === "string") return v;
  if (!isRec(v)) return "";
  const pick = v[locale] ?? v.th;
  return typeof pick === "string" ? pick : "";
}

// ═══════════════ ตัวโหลด ═══════════════
/**
 * อ่านทุกอย่างที่ตัวเลือกราคาต้องใช้ของบรรทัดคำขอ (ไม่เขียนฐาน)
 * ไม่ตรวจสถานะรอบ/เวลาปิดรับ/ที่ว่าง (เป็นของ T0.4 ถือที่ · T0.6 ยืนยัน) · STAFF/SYSTEM คิดราคาสินค้า DRAFT ได้ · PUBLIC/AGENT เห็นเฉพาะ ACTIVE
 */
export async function loadPricingInput(ctx: SellCtx, line: LineRequest, opts?: QuoteLineOpts): Promise<SellResult<TripPricingInput>> {
  const r = await loadAll(ctx, line, opts);
  return r.ok ? { ok: true, value: r.value.input } : r;
}

async function loadAll(ctx: SellCtx, line: LineRequest, opts?: QuoteLineOpts): Promise<SellResult<Loaded>> {
  const c = CTX.safeParse(ctx);
  if (!c.success) return fail("NOT_FOUND", NOT_FOUND_TH);
  const kind = isRec(line) ? line.productKind : undefined;
  if (kind !== "TRIP") return fail("KIND_NOT_SUPPORTED", "สินค้าชนิดนี้ไม่ได้ขายผ่านโมดูลทัวร์");
  const l = LINE.safeParse(line);
  if (!l.success) return fail("VALIDATION", "ข้อมูลการจองยังไม่ครบหรือรูปแบบยังไม่ตรง", { issues: l.error.issues.slice(0, 5).map((i) => ({ path: i.path.join("."), message: i.message })) });
  const o = OPTS.safeParse(opts ?? {});
  if (!o.success) return fail("VALIDATION", "ตัวเลือกการคิดราคาไม่ถูกต้อง");
  const { tenantId, unitId } = c.data;
  const now = c.data.now ?? new Date();
  const locale = c.data.locale ?? "th";
  const actor = c.data.actor.kind;
  const L = l.data;
  if (L.unitId !== unitId) return fail("NOT_FOUND", NOT_FOUND_TH);
  const db = tenantDb({ tenantId, unitId });
  const unit = await tenantDb({ tenantId }).businessUnit.findFirst({ where: { id: unitId, tenantId, status: "ACTIVE" }, select: { id: true, type: true, settings: true } });
  if (!unit || unit.type !== "TRIPS") return fail("NOT_FOUND", NOT_FOUND_TH);
  const product = await db.tripProduct.findFirst({ where: { id: L.productId, tenantId, unitId }, select: { id: true, productType: true, currency: true, status: true } });
  if (!product || product.status === "ARCHIVED" || (product.status !== "ACTIVE" && actor !== "STAFF" && actor !== "SYSTEM")) return fail("NOT_FOUND", NOT_FOUND_TH);
  const productType = product.productType === "LIVEABOARD" ? "LIVEABOARD" : product.productType === "ATTRACTION" ? "ATTRACTION" : "TOUR";
  const currency = L.currency ?? product.currency;
  if (currency !== product.currency && productType !== "LIVEABOARD") return fail("CURRENCY_NOT_ALLOWED", "ทัวร์และสถานที่ขายเป็นเงินบาทเท่านั้น");
  const dep = await db.tripDeparture.findFirst({
    where: { id: L.slotId, tenantId, unitId, productId: product.id },
    select: { id: true, localDate: true, startsAt: true, optionId: true, capacity: true, sold: true, held: true, reserved: true, minPax: true, deckPlanVersionId: true },
  });
  if (!dep) return fail("NOT_FOUND", NOT_FOUND_TH);
  if (L.optionId !== undefined && dep.optionId !== null && L.optionId !== dep.optionId) return fail("VALIDATION", "ตัวเลือกไม่ตรงกับรอบที่เลือก");
  const option = dep.optionId ? await db.tripOption.findFirst({ where: { id: dep.optionId, productId: product.id }, select: { nights: true } }) : null;
  const nights = option?.nights ?? 0;
  const travelDate = ymdOf(dep.localDate);

  // เอเจนซี่ (port)
  let agency: AgencyPricingInput | null = null;
  const agentAccountId = c.data.actor.kind === "AGENT" ? c.data.actor.agentAccountId : undefined;
  if (actor === "AGENT" || (c.data.channel === "AGENT_LINK" && o.data.linkId)) {
    const port = agencyPort;
    if (!port) {
      if (actor === "AGENT") return fail("FORBIDDEN", "ยังไม่ได้เปิดขายผ่านเอเจนซี่สำหรับร้านนี้", { reason: "AGENCY_NOT_ENABLED" });
    } else {
      const got = await port.load(ctx, { ...(agentAccountId ? { agentAccountId } : {}), ...(o.data.linkId ? { linkId: o.data.linkId } : {}), productId: product.id, departureId: dep.id, travelDate, at: now });
      if (got) {
        const v = agencyPricingInputSchema.safeParse(got);
        if (!v.success) return fail("VALIDATION", "ข้อมูลสัญญาเอเจนซี่ไม่ครบ");
        agency = { ...v.data, policySnapshot: got.policySnapshot ?? null };
      } else if (actor === "AGENT") return fail("FORBIDDEN", "ยังไม่ได้เปิดขายผ่านเอเจนซี่สำหรับร้านนี้", { reason: "AGENCY_NOT_ENABLED" });
    }
  }

  const refs = { unitId, productId: product.id, departureId: dep.id, ...(agency ? { agentId: agency.agentAccountId } : {}), ...(agency?.agentTierId ? { agentTierId: agency.agentTierId } : {}) };
  const [paxTypes, extras, zone, prices, seasons, rules, costs, resolved] = await Promise.all([
    db.tripPaxType.findMany({ where: { tenantId, unitId, productId: product.id }, select: { id: true, code: true, countsCapacity: true, active: true } }),
    // รายการเสริมของสินค้า + ของหน่วย (productId null · มติ r2 ข้อ 7) — แยกหน่วยด้วย tenantDb + unitId
    db.tripExtra.findMany({
      where: { tenantId, unitId, active: true, OR: [{ productId: product.id }, { productId: null }] },
      select: { id: true, kind: true, basis: true, mandatory: true, priceMinor: true, paxPrices: true, currency: true, commissionable: true, discountable: true, passThrough: true, taxKind: true, name: true },
    }),
    L.pickupZoneId ? db.tripPickupZone.findFirst({ where: { id: L.pickupZoneId, tenantId, unitId }, select: { id: true, name: true, surchargeSatang: true } }) : Promise.resolve(null),
    db.tripPrice.findMany({ where: { tenantId, unitId, productId: product.id } }),
    db.tripSeason.findMany({ where: { tenantId, unitId, status: "ACTIVE" }, select: { id: true, dateStart: true, dateEnd: true, priority: true, status: true } }),
    db.tripPriceRule.findMany({ where: { tenantId, unitId, active: true } }),
    db.tripCost.findMany({ where: { tenantId, unitId, departureId: dep.id }, select: { amountSatang: true } }),
    resolveSettings({ tenantId }, EXTRA_KEYS, refs, now),
  ]);
  if (L.pickupZoneId && !zone) return fail("NOT_FOUND", NOT_FOUND_TH);
  let tripsPolicy: PolicySnapshot;
  try {
    tripsPolicy = await snapshotPolicy({ tenantId }, "trips.booking", refs, now);
  } catch {
    return fail("VALIDATION", REASON_TH.SETTINGS_INVALID, { reason: "SETTINGS_INVALID" });
  }
  const policy: Record<string, unknown> = { ...tripsPolicy.values };
  for (const k of EXTRA_KEYS) if (resolved[k]) policy[k] = resolved[k].value;
  const tzRaw = isRec(unit.settings) ? unit.settings.timezone : undefined;
  const tz = typeof tzRaw === "string" && tzRaw.trim() ? tzRaw.trim() : TRIP_DEFAULT_TZ;
  if (!tripTzValid(tz)) return fail("VALIDATION", REASON_TH.SETTINGS_INVALID, { reason: "SETTINGS_INVALID", key: "timezone" });
  const ov = o.data;
  const input: TripPricingInput = {
    now: now.toISOString(),
    tz,
    unitId,
    channel: c.data.channel,
    actor,
    currency,
    product: { id: product.id, productType, currency: product.currency },
    departure: {
      id: dep.id,
      localDate: travelDate,
      startsAt: dep.startsAt.toISOString(),
      optionId: dep.optionId,
      capacity: dep.capacity,
      sold: dep.sold,
      held: dep.held,
      reserved: dep.reserved,
      minPax: dep.minPax,
      days: nights + 1,
      nights,
      costSatang: costs.reduce((s, x) => s + x.amountSatang, 0),
      deckPlanVersionId: dep.deckPlanVersionId,
    },
    paxTypes: paxTypes.map((p) => ({ id: p.id, code: p.code, countsCapacity: p.countsCapacity, active: p.active })),
    pax: L.pax,
    extras: extras.map((e) => ({
      id: e.id,
      kind: e.kind,
      basis: e.basis as TripPricingInput["extras"][number]["basis"],
      mandatory: e.mandatory,
      priceMinor: e.priceMinor,
      paxPrices: isRec(e.paxPrices) ? (Object.fromEntries(Object.entries(e.paxPrices).filter(([, v]) => typeof v === "number")) as Record<string, number>) : null,
      currency: e.currency,
      commissionable: e.commissionable,
      discountable: e.discountable,
      passThrough: e.passThrough,
      taxKind: e.taxKind as TripPricingInput["extras"][number]["taxKind"],
      label: labelOf(e.name, locale),
    })),
    requestedExtras: L.extras ?? [],
    pickup: zone ? { zoneId: zone.id, label: zone.name, surchargeSatang: zone.surchargeSatang } : null,
    prices: prices.map((p) => ({
      id: p.id,
      optionId: p.optionId,
      paxTypeId: p.paxTypeId,
      cabinTypeId: p.cabinTypeId,
      seasonId: p.seasonId,
      departureId: p.departureId,
      currency: p.currency,
      amountMinor: p.amountMinor,
      weekdayMask: p.weekdayMask,
      bookFrom: p.bookFrom ? ymdOf(p.bookFrom) : null,
      bookTo: p.bookTo ? ymdOf(p.bookTo) : null,
      travelFrom: p.travelFrom ? ymdOf(p.travelFrom) : null,
      travelTo: p.travelTo ? ymdOf(p.travelTo) : null,
      priority: p.priority,
    })),
    seasons: seasons.map((s) => ({ id: s.id, dateStart: ymdOf(s.dateStart), dateEnd: ymdOf(s.dateEnd), priority: s.priority, status: s.status })),
    rules: rules.map((r) => ({
      id: r.id,
      productId: r.productId,
      kind: r.kind,
      params: r.params,
      dateFrom: r.dateFrom ? ymdOf(r.dateFrom) : null,
      dateTo: r.dateTo ? ymdOf(r.dateTo) : null,
      bookFrom: r.bookFrom ? ymdOf(r.bookFrom) : null,
      bookTo: r.bookTo ? ymdOf(r.bookTo) : null,
      priority: r.priority,
      active: r.active,
      usedCount: r.usedCount,
    })),
    promoCode: L.promoCode ?? null,
    promoProviders: [],
    agency,
    agentDiscountSatang: ov.agentDiscountSatang ?? 0,
    overrides: ov.overrides ?? [],
    overrideGrant: { canOverride: ov.canOverride === true, approvals: ov.overrideApprovals ?? [] },
    policy,
  };

  // แต้ม/คูปอง (X.2) — ประเมินบนยอดลดได้หลังขั้น 1–7 ของรอบแรก
  if (promoProviders.size && ov.partyId && currency === "THB") {
    const first = resolveTripPrice(input);
    if (first.ok) {
      const lines = first.value.items.filter((i) => i.discountable && !i.passThrough).map((i) => ({ itemRef: i.itemRef, amountSatang: i.amountSatang }));
      const discountableSatang = lines.reduce((s, x) => s + x.amountSatang, 0);
      for (const key of [...promoProviders.keys()].sort()) {
        const p = promoProviders.get(key);
        const got = p ? await p.evaluate(ctx, { partyId: ov.partyId, discountableSatang, lines }) : null;
        if (got && Number.isSafeInteger(got.discountSatang) && got.discountSatang > 0) input.promoProviders.push({ key, ref: got.ref, label: got.label, discountSatang: got.discountSatang });
      }
    }
  }
  return { ok: true, value: { input, tripsPolicy } };
}

/** ขั้นต่ำตามประกาศ ณ วันจอง = T20 ของแม่แบบ DIVE_SHOP (ใช้แสดง W01 · ไม่ใช่ตารางที่ใช้คืนเงิน) */
function minimumLadder(): CancelStepBp[] | null {
  const def = getDef("trips.cancel.ladder");
  const v = def ? defaultFor(def, "DIVE_SHOP") : null;
  if (!Array.isArray(v)) return null;
  const out: CancelStepBp[] = [];
  for (const s of v) if (isRec(s) && typeof s.fromDaysBefore === "number" && typeof s.refundPct === "number") out.push({ daysBefore: s.fromDaysBefore, refundBp: s.refundPct * 100 });
  return out.sort((a, b) => b.daysBefore - a.daysBefore);
}

/** กฎราคาที่ params เสีย: ข้ามแต่เตือนในผล (RULE_INVALID) + บันทึก ops ครั้งเดียวต่อกฎต่อโปรเซส — มติ r2 ข้อ 11 */
const loggedInvalidRules = new Set<string>();
async function noteInvalidRules(ctx: SellCtx, priced: PricedQuote): Promise<void> {
  const w = priced.warnings.find((x) => x.code === "RULE_INVALID");
  const ids = w && isRec(w.details) && Array.isArray(w.details.ruleIds) ? w.details.ruleIds.filter((x): x is string => typeof x === "string") : [];
  const fresh = ids.filter((id) => !loggedInvalidRules.has(id));
  if (!fresh.length) return;
  for (const id of fresh) loggedInvalidRules.add(id);
  await logOps("WARN", "trips.pricing", "กฎราคาทัวร์มีเงื่อนไขไม่ถูกต้อง ระบบข้ามกฎนี้ตอนคิดราคา", { tenantId: ctx.tenantId, detail: `ruleIds=${fresh.join(",")}` });
}

async function priceOf(ctx: SellCtx, line: LineRequest, opts?: QuoteLineOpts): Promise<SellResult<Loaded & { priced: PricedQuote }>> {
  const li = await loadAll(ctx, line, opts);
  if (!li.ok) return li;
  const r = resolveTripPrice(li.value.input);
  if (!r.ok) return r;
  await noteInvalidRules(ctx, r.value);
  return { ok: true, value: { ...li.value, priced: { ...r.value, cancelMinimumLadder: minimumLadder() } } };
}

/** ราคาของบรรทัดคำขอเดียว (ไม่เขียนฐาน) */
export async function quoteTripLine(ctx: SellCtx, line: LineRequest, opts?: QuoteLineOpts): Promise<SellResult<PricedQuote>> {
  const r = await priceOf(ctx, line, opts);
  return r.ok ? { ok: true, value: r.value.priced } : r;
}

// ═══════════════ quote ของ Sellable (CC §C) ═══════════════
const REQ = z.object({
  lines: z.array(z.unknown()).min(1).max(20),
  attribution: z.object({ agentCode: z.string().optional(), staffCode: z.string().optional(), linkId: z.string().optional(), source: z.string().optional() }).optional(),
  agentDiscountSatang: NN.optional(),
});
const moneyOf = (satang: number, currency: string, minor?: number): Money => (currency === "THB" || minor === undefined ? { satang, currency } : { satang, minor, currency });
const thb = (satang: number): Money => ({ satang, currency: "THB" });
/** บรรทัดของ Quote + เงื่อนไขของบรรทัดนั้นเอง (ตารางยกเลิก · งวด · เวลานโยบาย) — มติ r2 ข้อ 11 */
export type TripQuoteLine = QuoteLine & { cancelLadder: CancelStepBp[]; paymentSchedule: DueSpec[]; policyAt: string; fingerprint: string };

export async function quoteTrips(ctx: SellCtx, req: QuoteRequest, opts?: QuoteLineOpts): Promise<SellResult<Quote>> {
  const r = REQ.safeParse(req);
  if (!r.success) return fail("VALIDATION", "คำขอราคาต้องมีอย่างน้อย 1 บรรทัด", { reason: "INVALID_INPUT" });
  if (r.data.agentDiscountSatang && r.data.lines.length > 1) return fail("VALIDATION", REASON_TH.AGENT_DISCOUNT_SINGLE_LINE, { reason: "AGENT_DISCOUNT_SINGLE_LINE" });
  const now = ctx.now ?? new Date();
  const qLines: TripQuoteLine[] = [];
  const prints: string[] = [];
  const dues: DueSpec[] = [];
  const warnings: Quote["warnings"] = [];
  const t = { gross: 0, discount: 0, passThrough: 0, payable: 0 };
  const ag = { collect: 0, remit: 0, earns: 0, wht: 0, shop: 0, toAgent: 0, any: false };
  let hold = 0;
  let fx: Quote["fx"] = null;
  let currency = "THB";
  for (let i = 0; i < r.data.lines.length; i++) {
    const lineOpts: QuoteLineOpts = {
      ...(opts ?? {}),
      ...(r.data.agentDiscountSatang ? { agentDiscountSatang: r.data.agentDiscountSatang } : {}),
      ...(r.data.attribution?.linkId ? { linkId: r.data.attribution.linkId } : {}),
    };
    const pr = await priceOf(ctx, r.data.lines[i] as LineRequest, lineOpts);
    if (!pr.ok) return pr;
    const { input: inp, priced: v } = pr.value;
    if (i === 0) {
      currency = v.currency;
      const hm = inp.policy[HOLD_KEY];
      hold = typeof hm === "number" && Number.isInteger(hm) && hm > 0 ? hm : 1;
      fx = v.fx ? { rateMicros: v.fx.rateMicros, at: inp.now } : null;
    } else if (v.currency !== currency) return fail("CURRENCY_NOT_ALLOWED", "ตะกร้าเดียวต้องใช้สกุลเงินเดียวกัน");
    const fp = priceFingerprint(inp, v);
    prints.push(fp);
    const rate = v.fx?.rateMicros;
    const lineDues: DueSpec[] = v.paymentSchedule.map((s) => ({ seq: s.seq, kind: s.kind, amount: moneyOf(s.amountSatang, v.currency, s.amountMinor), dueAt: s.dueAt }));
    qLines.push({
      ref: String(i),
      items: v.items.map((it) => ({
        kind: it.kind,
        label: it.label,
        qty: it.qty,
        unit: moneyOf(rate ? minorToSatang(it.unitMinor, rate) : it.unitMinor, v.currency, rate ? it.unitMinor : undefined),
        amount: moneyOf(it.amountSatang, v.currency, rate ? it.amountMinor : undefined),
        commissionable: it.commissionable,
        discountable: it.discountable,
        passThrough: it.passThrough,
        taxKind: it.taxKind,
        priceSource: it.priceSource,
      })),
      available: { publicLeft: Math.max(0, inp.departure.capacity - inp.departure.sold - inp.departure.held - inp.departure.reserved) },
      cancelLadder: v.cancelLadder,
      paymentSchedule: lineDues,
      policyAt: inp.now,
      fingerprint: createHash("sha256").update(fp).digest("hex"),
    });
    t.gross += v.totals.grossSatang;
    t.discount += v.totals.discountSatang + v.totals.agentDiscountSatang;
    t.passThrough += v.totals.passThroughSatang;
    t.payable += v.totals.payableSatang;
    if (v.commission) {
      ag.any = true;
      ag.collect += v.commission.collectFromCustomerSatang;
      ag.remit += v.commission.remitToShopSatang;
      ag.shop += v.commission.shopCollectsSatang;
      ag.toAgent += v.commission.payToAgentSatang;
      ag.earns += v.commission.agentEarnsSatang;
      ag.wht += v.commission.collectMode === "AGENT_COLLECTS" && v.commission.wht.grossUp ? (v.commission.wht.whtSatang ?? 0) : 0;
    }
    for (const d of lineDues) dues.push({ ...d, seq: dues.length + 1 });
    for (const w of v.warnings) if (!warnings.some((x) => x.code === w.code)) warnings.push({ code: w.code, messageTh: w.messageTh });
  }
  // ตารางยกเลิกระดับคำขอ: ทุกบรรทัดเหมือนกัน = ตารางนั้น · ต่างกัน = ดูที่บรรทัด (ไม่ใช้ของบรรทัดแรกแทนทุกบรรทัด)
  const ladders = new Set(qLines.map((l) => JSON.stringify(l.cancelLadder)));
  const ladder = ladders.size === 1 ? qLines[0].cancelLadder : [];
  if (ladders.size > 1) warnings.push({ code: "LADDER_PER_LINE", messageTh: "แต่ละรายการมีเงื่อนไขยกเลิกต่างกัน — ดูเงื่อนไขที่แต่ละรายการ" });
  const quoteId = createHash("sha256").update(prints.join("\n")).digest("hex");
  const agent = ag.any
    ? {
        collectFromCustomer: thb(ag.collect),
        remitToShop: thb(ag.remit),
        agentEarns: thb(ag.earns),
        whtGrossUp: thb(ag.wht),
        creditLeftSatang: null,
        shopCollects: thb(ag.shop),
        payToAgent: thb(ag.toAgent),
      }
    : null;
  const quote: Quote = {
    quoteId,
    lines: qLines,
    totals: { gross: thb(t.gross), discount: thb(t.discount), passThrough: thb(t.passThrough), payable: thb(t.payable) },
    ...(agent ? { agent } : {}),
    cancelLadder: ladder,
    paymentSchedule: dues,
    holdMinutes: hold,
    fx,
    warnings,
    expiresAt: new Date(now.getTime() + hold * 60_000).toISOString(),
  };
  return { ok: true, value: quote };
}

// ═══════════════ snapshot การจอง (T0.6 เป็นผู้เขียนลง TripBooking) ═══════════════
/**
 * ทางเลือก (b) ของมติ r2 ข้อ 6: คิดราคาใหม่ทั้งหมด "ที่นาฬิกาเดียว + อ่านค่าตั้งครั้งเดียว" (snapshotPolicy นอก tx · L-5)
 * แล้วเทียบลายนิ้วมือกับผลที่ quote ให้ลูกค้า — ไม่ตรง ⇒ PRICE_CHANGED (ไม่ประกอบ snapshot จากของสองชุด)
 * snapshot ที่คืน: นโยบาย (policy.trips.values) · บรรทัด · ยอด · ตารางยกเลิก · งวด มาจากการอ่านครั้งเดียวกัน · T0.6 เก็บเงินตาม snapshot.totals
 */
export async function buildTripBookingSnapshot(ctx: SellCtx, line: LineRequest, priced: PricedQuote, opts?: QuoteLineOpts): Promise<SellResult<TripsBookingSnapshot>> {
  const pr = await priceOf(ctx, line, opts);
  if (!pr.ok) return pr;
  const { input, tripsPolicy, priced: fresh } = pr.value;
  if (!isRec(priced) || !Array.isArray(priced.items) || !isRec(priced.totals) || !Array.isArray(priced.paymentSchedule)) return fail("VALIDATION", "ผลราคาที่ส่งมาไม่ครบ", { reason: "INVALID_INPUT" });
  let quoted: string;
  try {
    quoted = priceFingerprint(input, priced);
  } catch {
    return fail("VALIDATION", "ผลราคาที่ส่งมาไม่ครบ", { reason: "INVALID_INPUT" });
  }
  const current = priceFingerprint(input, fresh);
  if (quoted !== current) {
    const h = (x: string) => createHash("sha256").update(x).digest("hex");
    return fail("PRICE_CHANGED", "ราคาหรือเงื่อนไขเปลี่ยนตั้งแต่เสนอราคา — เสนอราคาใหม่ก่อนจอง", { quotedFingerprint: h(quoted), currentFingerprint: h(current) });
  }
  const flags = (opts?.flags ?? undefined) as SnapshotFlags | undefined;
  try {
    const snap = toTripsSnapshot({ input, priced: fresh, policy: { trips: tripsPolicy, agency: input.agency?.policySnapshot ?? null }, ...(flags ? { flags } : {}) });
    return { ok: true, value: snap };
  } catch (e) {
    if (e instanceof SnapshotKeyMissing) return fail("VALIDATION", REASON_TH.SETTINGS_INVALID, { reason: "SETTINGS_INVALID", key: e.key });
    throw e;
  }
}
