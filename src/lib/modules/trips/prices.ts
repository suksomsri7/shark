// ─────────────────────────────────────────────────────────────
// trips/prices.ts — ฤดูกาล · ราคา (ปลีก/ฤดู/รายรอบ) · กฎราคา 6 ชนิด + โค้ดส่วนลด (RUN TRIPS T0.5)
// ใบสั่ง ledger/trips-briefs/T0.5.md §5.2 §8 · มติ §13 (assertProductSellableInTx · int4 · เลือกฟิลด์ด้วย zod strict)
//
// 🔴 บริการ `(ctx: SellCtx, input) => Promise<SellResult<T>>` · สิทธิ์ตรวจที่ action (pricing-actions.ts) ก่อนเรียก
// 🔴 tenantDb({tenantId, unitId}) เท่านั้น ⇒ id ของร้าน/หน่วยอื่น = NOT_FOUND ข้อความเดียว
// 🔴 ไม่ลบแถวฤดูกาล/กฎ/โค้ด (ARCHIVED · active=false) · TripPrice ลบได้ (ช่องคีย์ต้องใช้ซ้ำ) แต่ต้องมีเหตุผล + audit ค่าก่อนลบ
// 🔴 ทุกการเขียน: audit `trips.price.*` (ไม่มีข้อมูลบุคคล) + event `trips.price.changed` ในธุรกรรมเดียวกัน
// นาฬิกา: `ctx.now ?? new Date()` (อ่านค่าตั้ง T3 · คีย์ event ของการลบราคา) · แต่ละบริการเปิดธุรกรรมของตัวเอง (ไม่ใช่ *InTx)
// ─────────────────────────────────────────────────────────────
import { Prisma, type TripPrice } from "@prisma/client";
import { z } from "zod";
import { tenantDb, type TenantDb } from "@/lib/core/db";
import { emitOutbox } from "@/lib/core/outbox";
import type { SellCtx, SellResult } from "@/lib/core/sellable";
import { resolveSetting } from "@/lib/core/settings";
import { isYmd, tripPriceRuleParamsSchema } from "./json-schemas";
import { PricingAbort, REASON_TH, reasonOk } from "./pricing-core";
import { TripProductNotSellableError, assertProductSellableInTx } from "./products";

type Tx = Prisma.TransactionClient;
type Fail = Extract<SellResult<never>, { ok: false }>;
const fail = (code: Fail["code"], messageTh: string, details?: Record<string, unknown>): Fail => ({ ok: false, code, messageTh, retryable: false, ...(details ? { details } : {}) });
const NOT_FOUND = (): Fail => fail("NOT_FOUND", "ไม่พบรายการนี้ในหน่วยที่เลือก");
const reasonFail = (code: Fail["code"], reason: string): Fail => fail(code, REASON_TH[reason] ?? "ทำรายการไม่สำเร็จ", { reason });

// ═══════════════ zod (strict · int4) ═══════════════
const INT4 = 2_147_483_647;
const ID = z.string().min(1).max(200);
const NN = z.number().int().min(0).max(INT4);
const PRIORITY = z.number().int().min(-1_000_000).max(1_000_000);
const YMD = z.string().refine(isYmd, { message: "วันที่ต้องเป็นรูปแบบ ปปปป-ดด-วว" });
const CURRENCY = z.string().regex(/^[A-Z]{3}$/);
const CODE_RE = /^[A-Z0-9_-]{3,32}$/;
const RULE_KINDS = ["EARLY_BIRD", "LAST_MINUTE", "GROUP_TIER", "FREE_LEADER", "BLACKOUT", "PROMO_CODE"] as const;
const TX_OPTS = { maxWait: 20_000, timeout: 40_000 } as const;

const CTX = z.object({
  tenantId: ID,
  unitId: ID,
  actor: z.object({ kind: z.enum(["STAFF", "AGENT", "PUBLIC", "SYSTEM"]), userId: z.string().optional(), job: z.string().optional() }),
  now: z.date().optional(),
});
const LIST_SEASONS = z.strictObject({ includeArchived: z.boolean().optional() });
const SAVE_SEASON = z.strictObject({ id: ID.optional(), name: z.string().trim().min(1).max(100), dateStart: YMD, dateEnd: YMD, priority: PRIORITY.optional() });
const ARCHIVE_SEASON = z.strictObject({ id: ID, reason: z.string().max(500).optional() });
const LIST_PRICES = z.strictObject({ productId: ID });
const SET_PRICE = z.strictObject({
  productId: ID,
  optionId: ID.nullable().optional(),
  paxTypeId: ID.nullable().optional(),
  cabinTypeId: ID.nullable().optional(),
  seasonId: ID.nullable().optional(),
  departureId: ID.nullable().optional(),
  currency: CURRENCY,
  amountMinor: NN,
  weekdayMask: z.number().int().min(0).max(127).nullable().optional(),
  bookFrom: YMD.nullable().optional(),
  bookTo: YMD.nullable().optional(),
  travelFrom: YMD.nullable().optional(),
  travelTo: YMD.nullable().optional(),
  priority: PRIORITY.optional(),
});
const REMOVE_PRICE = z.strictObject({ id: ID, reason: z.string().max(500) });
const SAVE_RULE = z.strictObject({
  id: ID.optional(),
  productId: ID.nullable().optional(),
  kind: z.enum(RULE_KINDS),
  params: z.unknown(),
  dateFrom: YMD.nullable().optional(),
  dateTo: YMD.nullable().optional(),
  bookFrom: YMD.nullable().optional(),
  bookTo: YMD.nullable().optional(),
  priority: PRIORITY.optional(),
});
const SET_RULE_ACTIVE = z.strictObject({ id: ID, active: z.boolean(), reason: z.string().max(500).optional() });

// ═══════════════ ด่าน + ธุรกรรม ═══════════════
type Gate = { tenantId: string; unitId: string; actorId: string; now: Date; db: TenantDb };
async function gate(ctx: unknown): Promise<Gate | Fail> {
  const c = CTX.safeParse(ctx);
  if (!c.success) return NOT_FOUND();
  const { tenantId, unitId, actor } = c.data;
  const actorId = actor.kind === "STAFF" && actor.userId ? actor.userId : actor.kind === "SYSTEM" ? `system:${actor.job ?? "job"}` : null;
  if (!actorId) return fail("FORBIDDEN", "บัญชีนี้ยังไม่ได้รับสิทธิ์ทำรายการนี้");
  const unit = await tenantDb({ tenantId }).businessUnit.findFirst({ where: { id: unitId, tenantId, status: "ACTIVE" }, select: { id: true, type: true } });
  if (!unit || unit.type !== "TRIPS") return NOT_FOUND();
  return { tenantId, unitId, actorId, now: c.data.now ?? new Date(), db: tenantDb({ tenantId, unitId }) };
}
const isFail = (x: unknown): x is Fail => typeof x === "object" && x !== null && (x as { ok?: unknown }).ok === false;
function parse<S extends z.ZodType>(schema: S, input: unknown): z.output<S> | Fail {
  const r = schema.safeParse(input);
  return r.success ? r.data : fail("VALIDATION", "ข้อมูลยังไม่ครบหรือรูปแบบยังไม่ตรง — ตรวจช่องที่กรอกแล้วลองอีกครั้ง", { issues: r.error.issues.slice(0, 5).map((i) => ({ path: i.path.join("."), message: i.message })) });
}
const isUnique = (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";
async function run<T>(g: Gate, fn: (tx: Tx) => Promise<T>): Promise<T | Fail> {
  try {
    return await g.db.$transaction(async (t) => fn(t as unknown as Tx), TX_OPTS);
  } catch (e) {
    if (e instanceof PricingAbort) return fail(e.code, e.messageTh, e.details);
    if (e instanceof TripProductNotSellableError) return e.code === "NOT_FOUND" ? NOT_FOUND() : fail("VALIDATION", e.message, { reason: e.code });
    throw e;
  }
}
const lock = (t: Tx, key: string) => t.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
const day = (ymd: string) => new Date(`${ymd}T00:00:00.000Z`);
const ymdOf = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
const asJson = (v: unknown) => JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue;
async function audit(t: Tx, g: Gate, action: string, targetType: string, targetId: string, before: unknown, after: unknown) {
  await t.auditLog.create({
    data: {
      tenantId: g.tenantId,
      unitId: g.unitId,
      actorType: "USER",
      actorId: g.actorId,
      action,
      targetType,
      targetId,
      ...(before === null || before === undefined ? {} : { before: asJson(before) }),
      ...(after === null || after === undefined ? {} : { after: asJson(after) }),
    },
  });
}
async function changed(t: Tx, g: Gate, id: string, stamp: string, p: { productId: string | null; seasonId: string | null; departureId: string | null; scope: "SEASON" | "PRICE" | "RULE" }) {
  await emitOutbox(t, {
    tenantId: g.tenantId,
    unitId: g.unitId,
    type: "trips.price.changed",
    idempotencyKey: `trips.price.changed:${id}:${stamp}`,
    payload: { unitId: g.unitId, productId: p.productId, seasonId: p.seasonId, departureId: p.departureId, scope: p.scope, count: 1 },
  });
}

// ═══════════════ ฤดูกาล ═══════════════
export type SeasonDTO = { id: string; name: string; dateStart: string; dateEnd: string; priority: number; status: string };
const seasonDTO = (s: { id: string; name: string; dateStart: Date; dateEnd: Date; priority: number; status: string }): SeasonDTO => ({
  id: s.id,
  name: s.name,
  dateStart: ymdOf(s.dateStart) ?? "",
  dateEnd: ymdOf(s.dateEnd) ?? "",
  priority: s.priority,
  status: s.status,
});

export async function listSeasons(ctx: SellCtx, input: unknown): Promise<SellResult<SeasonDTO[]>> {
  const g = await gate(ctx);
  if (isFail(g)) return g;
  const p = parse(LIST_SEASONS, input ?? {});
  if (isFail(p)) return p;
  const rows = await g.db.tripSeason.findMany({
    where: { tenantId: g.tenantId, unitId: g.unitId, ...(p.includeArchived ? {} : { status: "ACTIVE" }) },
    orderBy: [{ dateStart: "asc" }, { id: "asc" }],
  });
  return { ok: true, value: rows.map(seasonDTO) };
}

/** สร้าง/แก้ฤดูกาล — ACTIVE สองแถวที่ช่วงวันทับกันและ priority เท่ากัน = SEASON_OVERLAP (ตรวจใต้ advisory lock ต่อหน่วย) */
export async function saveSeason(ctx: SellCtx, input: unknown): Promise<SellResult<{ id: string }>> {
  const g = await gate(ctx);
  if (isFail(g)) return g;
  const p = parse(SAVE_SEASON, input);
  if (isFail(p)) return p;
  if (p.dateEnd < p.dateStart) return reasonFail("VALIDATION", "BAD_RANGE");
  const priority = p.priority ?? 0;
  return run(g, async (t) => {
    await lock(t, `trips:season:${g.unitId}`);
    const cur = p.id ? await t.tripSeason.findFirst({ where: { id: p.id, tenantId: g.tenantId, unitId: g.unitId } }) : null;
    if (p.id && !cur) throw new PricingAbort("NOT_FOUND", "NOT_FOUND", "ไม่พบรายการนี้ในหน่วยที่เลือก");
    const clash = await t.tripSeason.findFirst({
      where: { tenantId: g.tenantId, unitId: g.unitId, status: "ACTIVE", priority, dateStart: { lte: day(p.dateEnd) }, dateEnd: { gte: day(p.dateStart) }, ...(cur ? { id: { not: cur.id } } : {}) },
      select: { id: true },
    });
    if (clash && (!cur || cur.status === "ACTIVE")) throw new PricingAbort("VALIDATION", "SEASON_OVERLAP", undefined, { seasonId: clash.id });
    const data = { name: p.name, dateStart: day(p.dateStart), dateEnd: day(p.dateEnd), priority };
    let row;
    if (cur) {
      const n = await t.tripSeason.updateMany({ where: { id: cur.id, tenantId: g.tenantId, unitId: g.unitId }, data });
      if (n.count !== 1) throw new PricingAbort("STATE_CONFLICT", "NOT_FOUND", "ฤดูกาลนี้ถูกแก้พร้อมกัน — โหลดใหม่แล้วลองอีกครั้ง");
      row = await t.tripSeason.findFirstOrThrow({ where: { id: cur.id, tenantId: g.tenantId, unitId: g.unitId } });
      await audit(t, g, "trips.price.season.save", "TripSeason", row.id, seasonDTO(cur), seasonDTO(row));
    } else {
      row = await t.tripSeason.create({ data: { tenantId: g.tenantId, unitId: g.unitId, ...data, status: "ACTIVE" } });
      await audit(t, g, "trips.price.season.save", "TripSeason", row.id, null, seasonDTO(row));
    }
    await changed(t, g, row.id, String(row.updatedAt.getTime()), { productId: null, seasonId: row.id, departureId: null, scope: "SEASON" });
    return { ok: true as const, value: { id: row.id } };
  });
}

/** เก็บฤดูกาล (ไม่ลบแถว) — ถูกอ้างโดยแถวราคาต้องมีเหตุผล ≥ 10 ตัวอักษร */
export async function archiveSeason(ctx: SellCtx, input: unknown): Promise<SellResult<{ id: string; status: string }>> {
  const g = await gate(ctx);
  if (isFail(g)) return g;
  const p = parse(ARCHIVE_SEASON, input);
  if (isFail(p)) return p;
  return run(g, async (t) => {
    const cur = await t.tripSeason.findFirst({ where: { id: p.id, tenantId: g.tenantId, unitId: g.unitId } });
    if (!cur) throw new PricingAbort("NOT_FOUND", "NOT_FOUND", "ไม่พบรายการนี้ในหน่วยที่เลือก");
    if (cur.status === "ARCHIVED") return { ok: true as const, value: { id: cur.id, status: cur.status } };
    const referenced = await t.tripPrice.findFirst({ where: { tenantId: g.tenantId, unitId: g.unitId, seasonId: cur.id }, select: { id: true } });
    if (referenced && !reasonOk(p.reason)) throw new PricingAbort("VALIDATION", "REASON_REQUIRED");
    const n = await t.tripSeason.updateMany({ where: { id: cur.id, tenantId: g.tenantId, unitId: g.unitId, status: "ACTIVE" }, data: { status: "ARCHIVED" } });
    if (n.count !== 1) throw new PricingAbort("STATE_CONFLICT", "NOT_FOUND", "ฤดูกาลนี้ถูกแก้พร้อมกัน — โหลดใหม่แล้วลองอีกครั้ง");
    const row = await t.tripSeason.findFirstOrThrow({ where: { id: cur.id, tenantId: g.tenantId, unitId: g.unitId } });
    await audit(t, g, "trips.price.season.archive", "TripSeason", row.id, { status: cur.status }, { status: row.status, ...(p.reason ? { reason: p.reason.trim() } : {}) });
    await changed(t, g, row.id, String(row.updatedAt.getTime()), { productId: null, seasonId: row.id, departureId: null, scope: "SEASON" });
    return { ok: true as const, value: { id: row.id, status: row.status } };
  });
}

// ═══════════════ ราคา ═══════════════
type PriceRow = TripPrice;
export type PriceDTO = {
  id: string;
  productId: string;
  optionId: string | null;
  paxTypeId: string | null;
  cabinTypeId: string | null;
  seasonId: string | null;
  departureId: string | null;
  currency: string;
  amountMinor: number;
  weekdayMask: number | null;
  bookFrom: string | null;
  bookTo: string | null;
  travelFrom: string | null;
  travelTo: string | null;
  priority: number;
};
const priceDTO = (r: PriceRow): PriceDTO => ({
  id: r.id,
  productId: r.productId,
  optionId: r.optionId,
  paxTypeId: r.paxTypeId,
  cabinTypeId: r.cabinTypeId,
  seasonId: r.seasonId,
  departureId: r.departureId,
  currency: r.currency,
  amountMinor: r.amountMinor,
  weekdayMask: r.weekdayMask,
  bookFrom: ymdOf(r.bookFrom),
  bookTo: ymdOf(r.bookTo),
  travelFrom: ymdOf(r.travelFrom),
  travelTo: ymdOf(r.travelTo),
  priority: r.priority,
});

export async function listPrices(ctx: SellCtx, input: unknown): Promise<SellResult<PriceDTO[]>> {
  const g = await gate(ctx);
  if (isFail(g)) return g;
  const p = parse(LIST_PRICES, input);
  if (isFail(p)) return p;
  const product = await g.db.tripProduct.findFirst({ where: { id: p.productId, tenantId: g.tenantId, unitId: g.unitId }, select: { id: true } });
  if (!product) return NOT_FOUND();
  const rows = await g.db.tripPrice.findMany({ where: { tenantId: g.tenantId, unitId: g.unitId, productId: product.id }, orderBy: [{ priority: "desc" }, { id: "asc" }] });
  return { ok: true, value: rows.map(priceDTO) };
}

/** ตั้งราคา (upsert บนคีย์ NND: ตัวเลือก·ประเภทคน·เคบิน·ฤดู·รอบ·สกุล·วันในสัปดาห์·เริ่มจอง·เริ่มเดินทาง) */
export async function setPrice(ctx: SellCtx, input: unknown): Promise<SellResult<{ id: string }>> {
  const g = await gate(ctx);
  if (isFail(g)) return g;
  const p = parse(SET_PRICE, input);
  if (isFail(p)) return p;
  if ((p.bookFrom && p.bookTo && p.bookTo < p.bookFrom) || (p.travelFrom && p.travelTo && p.travelTo < p.travelFrom)) return reasonFail("VALIDATION", "BAD_RANGE");
  // ตารางเคบิน (L1.1) ยังไม่มีในรุ่นนี้ ⇒ ตรวจเจ้าของไม่ได้ ⇒ ปฏิเสธ (มติ r2 ข้อ 12)
  if (p.cabinTypeId) return reasonFail("VALIDATION", "CABIN_NOT_AVAILABLE");
  const t3 = await resolveSetting({ tenantId: g.tenantId }, "trips.general.currencies", { unitId: g.unitId, productId: p.productId }, g.now).catch(() => null);
  const allowed = Array.isArray(t3?.value) ? (t3.value as unknown[]) : [];
  try {
  return await run(g, async (t) => {
    const prod = await assertProductSellableInTx(t, { tenantId: g.tenantId, unitId: g.unitId, productId: p.productId, optionId: p.optionId ?? null });
    if (p.currency !== prod.currency || (p.currency !== "THB" && prod.productType !== "LIVEABOARD") || !allowed.includes(p.currency)) {
      throw new PricingAbort("CURRENCY_NOT_ALLOWED", "CURRENCY", "ราคาต้องใช้สกุลเงินเดียวกับสินค้า (ทัวร์และสถานที่ใช้บาท)");
    }
    const w = { tenantId: g.tenantId, unitId: g.unitId };
    const refsOk = await Promise.all([
      p.paxTypeId ? t.tripPaxType.findFirst({ where: { ...w, id: p.paxTypeId, productId: prod.id }, select: { id: true } }) : Promise.resolve(true),
      p.seasonId ? t.tripSeason.findFirst({ where: { ...w, id: p.seasonId }, select: { id: true } }) : Promise.resolve(true),
      p.departureId ? t.tripDeparture.findFirst({ where: { ...w, id: p.departureId, productId: prod.id }, select: { id: true } }) : Promise.resolve(true),
    ]);
    if (refsOk.some((x) => !x)) throw new PricingAbort("NOT_FOUND", "NOT_FOUND", "ไม่พบรายการนี้ในหน่วยที่เลือก");
    await lock(t, `trips:price:${prod.id}`);
    const key = {
      productId: prod.id,
      optionId: p.optionId ?? null,
      paxTypeId: p.paxTypeId ?? null,
      cabinTypeId: p.cabinTypeId ?? null,
      seasonId: p.seasonId ?? null,
      departureId: p.departureId ?? null,
      currency: p.currency,
      weekdayMask: p.weekdayMask ?? null,
      bookFrom: p.bookFrom ? day(p.bookFrom) : null,
      travelFrom: p.travelFrom ? day(p.travelFrom) : null,
    };
    const data = { amountMinor: p.amountMinor, bookTo: p.bookTo ? day(p.bookTo) : null, travelTo: p.travelTo ? day(p.travelTo) : null, priority: p.priority ?? 0 };
    const cur = await t.tripPrice.findFirst({ where: { ...w, ...key } });
    let row: PriceRow;
    if (cur) {
      await t.tripPrice.updateMany({ where: { ...w, id: cur.id }, data });
      row = await t.tripPrice.findFirstOrThrow({ where: { ...w, id: cur.id } });
      await audit(t, g, "trips.price.set", "TripPrice", row.id, priceDTO(cur), priceDTO(row));
    } else {
      row = await t.tripPrice.create({ data: { ...w, ...key, ...data } });
      await audit(t, g, "trips.price.set", "TripPrice", row.id, null, priceDTO(row));
    }
    await changed(t, g, row.id, String(row.updatedAt.getTime()), { productId: row.productId, seasonId: row.seasonId, departureId: row.departureId, scope: "PRICE" });
    return { ok: true as const, value: { id: row.id } };
  });
  } catch (e) {
    if (isUnique(e)) return reasonFail("STATE_CONFLICT", "PRICE_CONFLICT");
    throw e;
  }
}

/** ลบแถวราคา (ช่องคีย์ต้องใช้ซ้ำได้ · การจองเดิมอยู่ใน snapshot) — เหตุผล ≥ 10 ตัวอักษร + audit ค่าก่อนลบ */
export async function removePrice(ctx: SellCtx, input: unknown): Promise<SellResult<{ id: string }>> {
  const g = await gate(ctx);
  if (isFail(g)) return g;
  const p = parse(REMOVE_PRICE, input);
  if (isFail(p)) return p;
  if (!reasonOk(p.reason)) return reasonFail("VALIDATION", "REASON_REQUIRED");
  return run(g, async (t) => {
    const cur = await t.tripPrice.findFirst({ where: { id: p.id, tenantId: g.tenantId, unitId: g.unitId } });
    if (!cur) throw new PricingAbort("NOT_FOUND", "NOT_FOUND", "ไม่พบรายการนี้ในหน่วยที่เลือก");
    await lock(t, `trips:price:${cur.productId}`);
    const n = await t.tripPrice.deleteMany({ where: { id: cur.id, tenantId: g.tenantId, unitId: g.unitId } });
    if (n.count !== 1) throw new PricingAbort("STATE_CONFLICT", "NOT_FOUND", "แถวราคานี้ถูกแก้พร้อมกัน — โหลดใหม่แล้วลองอีกครั้ง");
    await audit(t, g, "trips.price.remove", "TripPrice", cur.id, priceDTO(cur), { removed: true, reason: p.reason.trim() });
    await changed(t, g, cur.id, `removed:${g.now.getTime()}`, { productId: cur.productId, seasonId: cur.seasonId, departureId: cur.departureId, scope: "PRICE" });
    return { ok: true as const, value: { id: cur.id } };
  });
}

// ═══════════════ กฎราคา + โค้ดส่วนลด ═══════════════
const isRec = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
function intsWithin(v: unknown): boolean {
  if (typeof v === "number") return Number.isFinite(v) && Math.abs(v) <= INT4;
  if (Array.isArray(v)) return v.every(intsWithin);
  if (isRec(v)) return Object.values(v).every(intsWithin);
  return true;
}
async function codeTaken(t: Tx, g: Gate, code: string, selfId: string | null): Promise<boolean> {
  const rows = await t.$queryRaw<{ id: string }[]>`
    SELECT id FROM "TripPriceRule"
    WHERE "tenantId" = ${g.tenantId} AND "unitId" = ${g.unitId} AND active AND kind = 'PROMO_CODE'
      AND upper(coalesce(code, "params"->>'code')) = ${code} AND id <> ${selfId ?? ""}
    LIMIT 1`;
  return rows.length > 0;
}

/** สร้าง/แก้กฎราคา — params ผ่าน tripPriceRuleParamsSchema · ส่วนลดต้องเป็น bp หรือจำนวนเงินอย่างใดอย่างหนึ่ง · โค้ดเก็บตัวใหญ่ไม่ซ้ำในหน่วย */
export async function savePriceRule(ctx: SellCtx, input: unknown): Promise<SellResult<{ id: string }>> {
  const g = await gate(ctx);
  if (isFail(g)) return g;
  const p = parse(SAVE_RULE, input);
  if (isFail(p)) return p;
  const raw = p.params;
  if ((p.kind === "EARLY_BIRD" || p.kind === "LAST_MINUTE" || p.kind === "PROMO_CODE") && isRec(raw) && (raw.discountBp !== undefined) === (raw.discountMinor !== undefined)) {
    return reasonFail("VALIDATION", "RULE_DISCOUNT_SHAPE");
  }
  const pr = tripPriceRuleParamsSchema.safeParse(isRec(raw) && raw.kind === "PROMO_CODE" && typeof raw.code === "string" ? { ...raw, code: raw.code.trim().toUpperCase() } : raw);
  if (!pr.success) return fail("VALIDATION", "เงื่อนไขของกฎราคาไม่ถูกต้อง", { issues: pr.error.issues.slice(0, 5).map((i) => ({ path: i.path.join("."), message: i.message })) });
  const params = pr.data;
  // ทุกจำนวนเต็มใน params ต้องอยู่ในช่วง int4 (SQL ตัดสิทธิ์โค้ด cast ::int · มติ §13 / r2 ข้อ 8)
  if (!intsWithin(params)) return reasonFail("VALIDATION", "INVALID_INPUT");
  if (params.kind !== p.kind) return fail("VALIDATION", "ชนิดของกฎไม่ตรงกับเงื่อนไข");
  const code = params.kind === "PROMO_CODE" ? params.code : null;
  if (code !== null && !CODE_RE.test(code)) return fail("VALIDATION", "โค้ดส่วนลดใช้อักษรภาษาอังกฤษตัวใหญ่ ตัวเลข _ หรือ - ยาว 3–32 ตัว");
  if ((p.dateFrom && p.dateTo && p.dateTo < p.dateFrom) || (p.bookFrom && p.bookTo && p.bookTo < p.bookFrom)) return reasonFail("VALIDATION", "BAD_RANGE");
  try {
    return await run(g, async (t) => {
      if (p.productId) await assertProductSellableInTx(t, { tenantId: g.tenantId, unitId: g.unitId, productId: p.productId });
      await lock(t, `trips:rule:${g.unitId}`);
      const w = { tenantId: g.tenantId, unitId: g.unitId };
      const cur = p.id ? await t.tripPriceRule.findFirst({ where: { ...w, id: p.id } }) : null;
      if (p.id && !cur) throw new PricingAbort("NOT_FOUND", "NOT_FOUND", "ไม่พบรายการนี้ในหน่วยที่เลือก");
      if (cur && cur.kind !== p.kind) throw new PricingAbort("VALIDATION", "KIND_LOCKED", "เปลี่ยนชนิดของกฎที่มีอยู่ไม่ได้ — สร้างกฎใหม่แทน");
      if (code !== null && (!cur || cur.active) && (await codeTaken(t, g, code, cur?.id ?? null))) throw new PricingAbort("VALIDATION", "CODE_TAKEN");
      const data = {
        productId: p.productId ?? null,
        params: asJson(params),
        code,
        dateFrom: p.dateFrom ? day(p.dateFrom) : null,
        dateTo: p.dateTo ? day(p.dateTo) : null,
        bookFrom: p.bookFrom ? day(p.bookFrom) : null,
        bookTo: p.bookTo ? day(p.bookTo) : null,
        priority: p.priority ?? 0,
      };
      let row;
      if (cur) {
        await t.tripPriceRule.updateMany({ where: { ...w, id: cur.id }, data });
        row = await t.tripPriceRule.findFirstOrThrow({ where: { ...w, id: cur.id } });
        await audit(t, g, "trips.price.rule.save", "TripPriceRule", row.id, { kind: cur.kind, params: cur.params, priority: cur.priority }, { kind: row.kind, params: row.params, priority: row.priority });
      } else {
        row = await t.tripPriceRule.create({ data: { ...w, kind: p.kind, ...data, active: true } });
        await audit(t, g, "trips.price.rule.save", "TripPriceRule", row.id, null, { kind: row.kind, params: row.params, priority: row.priority });
      }
      await changed(t, g, row.id, String(row.updatedAt.getTime()), { productId: row.productId, seasonId: null, departureId: null, scope: "RULE" });
      return { ok: true as const, value: { id: row.id } };
    });
  } catch (e) {
    if (isUnique(e)) return reasonFail("VALIDATION", "CODE_TAKEN");
    throw e;
  }
}

/** เปิด/ปิดกฎ (ไม่ลบ) — ปิดโค้ดที่มีการใช้แล้วต้องมีเหตุผล ≥ 10 ตัวอักษร · เปิดโค้ดซ้ำกับโค้ดที่ใช้อยู่ = CODE_TAKEN */
export async function setPriceRuleActive(ctx: SellCtx, input: unknown): Promise<SellResult<{ id: string; active: boolean }>> {
  const g = await gate(ctx);
  if (isFail(g)) return g;
  const p = parse(SET_RULE_ACTIVE, input);
  if (isFail(p)) return p;
  try {
    return await run(g, async (t) => {
      const w = { tenantId: g.tenantId, unitId: g.unitId };
      const cur = await t.tripPriceRule.findFirst({ where: { ...w, id: p.id } });
      if (!cur) throw new PricingAbort("NOT_FOUND", "NOT_FOUND", "ไม่พบรายการนี้ในหน่วยที่เลือก");
      if (cur.active === p.active) return { ok: true as const, value: { id: cur.id, active: cur.active } };
      await lock(t, `trips:rule:${g.unitId}`);
      if (!p.active) {
        const used = await t.tripPromoRedemption.findFirst({ where: { ...w, ruleId: cur.id }, select: { id: true } });
        if (used && !reasonOk(p.reason)) throw new PricingAbort("VALIDATION", "REASON_REQUIRED");
      } else if (cur.kind === "PROMO_CODE") {
        const c = cur.code ?? (isRec(cur.params) && typeof cur.params.code === "string" ? cur.params.code.toUpperCase() : null);
        if (c && (await codeTaken(t, g, c, cur.id))) throw new PricingAbort("VALIDATION", "CODE_TAKEN");
      }
      const n = await t.tripPriceRule.updateMany({ where: { ...w, id: cur.id, active: cur.active }, data: { active: p.active } });
      if (n.count !== 1) throw new PricingAbort("STATE_CONFLICT", "NOT_FOUND", "กฎนี้ถูกแก้พร้อมกัน — โหลดใหม่แล้วลองอีกครั้ง");
      const row = await t.tripPriceRule.findFirstOrThrow({ where: { ...w, id: cur.id } });
      await audit(t, g, "trips.price.rule.active", "TripPriceRule", row.id, { active: cur.active }, { active: row.active, ...(p.reason ? { reason: p.reason.trim() } : {}) });
      await changed(t, g, row.id, String(row.updatedAt.getTime()), { productId: row.productId, seasonId: null, departureId: null, scope: "RULE" });
      return { ok: true as const, value: { id: row.id, active: row.active } };
    });
  } catch (e) {
    if (isUnique(e)) return reasonFail("VALIDATION", "CODE_TAKEN");
    throw e;
  }
}
