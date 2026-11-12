// ─────────────────────────────────────────────────────────────
// trips/booking.ts — การจองทัวร์: ถือผ่านตะกร้า · ยืนยันในธุรกรรมเดียว · อนุมัติ/ปฏิเสธ · ยกเลิกก่อนจ่าย · แก้คน/เลื่อนวัน · อ่าน · RUN TRIPS T0.6
// ใบสั่ง ledger/trips-briefs/T0.6.md §2 §5 §8 (§16 มติผู้คุมชนะ) · CC §C §D.4–§D.6 §F.2 §G §J.1 §K · wo-notes T0.4 r2 §(d) · T0.5 r2/r3
//
// 🔴 นอก tx เท่านั้น: quoteTrips · buildTripBookingSnapshot · capacityRowsOf · loadCapacityPolicies · resolveSettings (X1 X3) · party · approval
//    ในธุรกรรม = *InTx ของ T0.4/T0.5 + SQL ผ่าน tx เดียวกัน (ไม่ขอ connection ที่สอง · pool 10)
// 🔴 ลำดับล็อก (ใบสั่ง §5.4 · r2 §d): ชั้น 0 (SellBasket FOR UPDATE / INSERT → advisory เพดานถือ/rekey) → สินค้า FOR SHARE เรียง id →
//    1a รอบ เรียง id → 2a hold (เรียงตามรอบ) → 2c เลขจอง → 2b การจอง/รายการ/ผู้เดินทาง → โค้ดส่วนลด (เรียง id การจอง · ภายในเรียง ruleId) → 2h outbox/audit → ตะกร้า CAS
//    ยกเลิก/ปฏิเสธ: คืนที่นั่ง (releaseHoldInTx) ก่อน releasePromoInTx เสมอ (r2 §d ข้อ 4)
// 🔴 ทุกการเปลี่ยนสถานะการจอง = CAS (status + version) + ตรวจจำนวนแถว · ไม่มีการลบแถว Trip* · ไม่ส่ง object ผู้เรียกเข้า Prisma data
// 🔴 ไม่มีค่าธุรกิจตายตัว: X1 X2 X3 X10 T5 มาจากค่าตั้ง (resolveSettings / policies ของ T0.4) · event/audit ไม่มีชื่อ/เบอร์/อีเมล/เลขจอง
// ─────────────────────────────────────────────────────────────
import { createHash, createHmac, randomBytes } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { tenantDb } from "@/lib/core/db";
import { emitOutboxMany } from "@/lib/core/outbox";
import type { BookingRef, CancelResult, DueSpec, Hold, LedgerDraft, Quote, QuoteRequest, SellActor, SellCtx, SellResult } from "@/lib/core/sellable";
import { resolveSettings } from "@/lib/core/settings";
import { requestStatuses } from "@/lib/modules/approval";
import { safeFindOrCreate } from "@/lib/modules/party";
import {
  approveRequestSchema,
  bookNowRequestSchema,
  bookingColumnsFromSnapshot,
  cancelRequestSchema,
  changeRequestSchema,
  confirmRequestSchema,
  contactKeyOf,
  dueNowOfSnapshot,
  expiredEventSchema,
  getRequestSchema,
  holdRequestSchema,
  listRequestSchema,
  seatsOfSnapshot,
  transitionRequestSchema,
  CHANGE_POLICY_REASON_MIN,
  type ApprovalInput,
  type BookingColumns,
  type BookingItemColumns,
  type LineInput,
  type OverrideInput,
  type QuoteRequestInput,
  type SnapshotShape,
} from "./booking-core";
import {
  CapacityAbort,
  acquireHoldCapInTx,
  convertHoldInTx,
  holdCapKeyHash,
  holdRequestHash,
  insertHoldInTx,
  invalidInput,
  moveSoldInTx,
  parseCtx,
  rekeyHoldsToContactInTx,
  releaseHoldInTx,
  reserveInTx,
  returnSoldInTx,
  sellFail,
  type CapacityPolicies,
  type Ctx,
  type Failure,
  type Gate,
  type Tx,
} from "./capacity";
import { QTY_MAX, holdExpiresAt, idemKeyFor } from "./capacity-core";
import { capacityRowsOf, gateOf, loadCapacityPolicies, runTx } from "./capacity-service";
import { nextBookingCodeInTx } from "./numbering";
import { buildTripBookingSnapshot, quoteTrips, type TripQuoteLine, type TripQuoteOpts } from "./pricing";
import { PricingAbort } from "./pricing-core";
import { TripProductNotSellableError, assertProductSellableInTx } from "./products";
import { redeemPromosInTx, releasePromoInTx } from "./promo";
import { recomputeFromSnapshot, type TripsBookingSnapshot } from "./snapshot";
import { BOOKING_SOLD_STATUSES, canTransitionBooking, initialBookingStatus, isBookingStatus, type BookingStatus, type InitialHoldMode } from "./state";

// ── T0.6 booking ──
/** อาร์กิวเมนต์ที่ 3 ของบริการ — ตั้งได้จาก booking-actions หลัง assertCan("trips.price.override") เท่านั้น */
export type BookingOpts = { canOverride?: boolean };

/** ผลปฏิเสธในธุรกรรมของการจอง (rollback ทั้งก้อน) — สืบจาก CapacityAbort ⇒ runTx ของ T0.4 แปลงเป็น SellResult ให้ */
export class BookingAbort extends CapacityAbort {
  constructor(code: ConstructorParameters<typeof CapacityAbort>[0], details?: Record<string, unknown>) {
    super(code, details);
    this.name = "BookingAbort";
  }
}

const K_CONFIRM_MODE = "trips.sell.confirmMode";
const K_CODE_PREFIX = "trips.sell.codePrefix";
const CONFIRM_MODES: ReadonlySet<string> = new Set(["AUTO", "SHOP_CONFIRMS"]);
const PREFIX_RE = /^[A-Z]{1,4}$/;
const PROMO_REASONS: ReadonlySet<string> = new Set(["PROMO_EXHAUSTED", "PROMO_PER_CONTACT", "PROMO_INACTIVE", "PROMO_EXPIRED"]);
const UNPAID: ReadonlySet<string> = new Set(["HOLD", "PENDING"]);
const SOLD: ReadonlySet<string> = new Set(BOOKING_SOLD_STATUSES);

const sha256hex = (s: string) => createHash("sha256").update(s).digest("hex");
const newId = (prefix: string) => `${prefix}${randomBytes(12).toString("hex")}`;
const isRec = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const NF = (): Failure => sellFail("NOT_FOUND");
const ymdOf = (d: Date | string) => new Date(d).toISOString().slice(0, 10);
const dateOfYmd = (ymd: string) => new Date(`${ymd}T00:00:00.000Z`);

// ═══════════════════════ token ลิงก์ลูกค้า (มติ §16 ข้อ 5) ═══════════════════════
/**
 * publicToken = base64url(HMAC-SHA256(กุญแจเซิร์ฟเวอร์ · ป้าย trips.booking.token.v1 · bookingId)) — 256 บิต · เก็บเฉพาะ sha256 ของ token
 * กุญแจ = SESSION_SECRET (≥ 32 ตัว · แบบแผนเดียวกับ holdCapKeyHash) · production ไม่มีกุญแจ ⇒ throw (ปิดแบบล้ม) · นอก production (QC/dev) = sha256 ติดป้าย
 * หนี้: เพิกถอน/ออกใหม่ต้องมีคอลัมน์รุ่น (W1.x · สัญญา J.3.2)
 */
export function bookingPublicToken(bookingId: string): string {
  const secret = process.env.SESSION_SECRET;
  if (typeof secret === "string" && secret.length >= 32) return createHmac("sha256", `trips.booking.token.v1:${secret}`).update(bookingId).digest("base64url");
  if (process.env.NODE_ENV === "production") throw new Error("[trips/booking] ไม่ได้ตั้งค่า SESSION_SECRET — ออก token ลิงก์การจองไม่ได้");
  return createHash("sha256").update(`trips.booking.token.v1:dev:${bookingId}`).digest("base64url");
}

// ═══════════════════════ ธุรกรรม ═══════════════════════
function isUniqueViolation(e: unknown): boolean {
  const seen = new Set<unknown>();
  const stack: unknown[] = [e];
  let depth = 0;
  while (stack.length && depth++ < 64) {
    const cur = stack.pop();
    if (!cur || typeof cur !== "object" || seen.has(cur)) continue;
    seen.add(cur);
    const o = cur as Record<string, unknown>;
    if (o.code === "23505" || o.code === "P2002" || o.originalCode === "23505") return true;
    if (typeof o.message === "string" && /duplicate key value|Unique constraint failed/i.test(o.message)) return true;
    if (o.cause) stack.push(o.cause);
    if (o.meta && typeof o.meta === "object") stack.push(o.meta);
  }
  return false;
}
/** runTx ของ T0.4 (ลองใหม่เมื่อ 40P01 · CapacityAbort ⇒ SellResult) + PricingAbort/สินค้าขายไม่ได้ ⇒ BookingAbort · คีย์ชน (23505) ⇒ IDEMPOTENCY_CONFLICT */
async function runBooking<T>(g: Gate, fn: (tx: Tx) => Promise<T>): Promise<SellResult<T>> {
  try {
    return await runTx(g, async (tx) => {
      try {
        return await fn(tx);
      } catch (e) {
        if (e instanceof PricingAbort) throw new BookingAbort(e.code, e.details);
        throw e;
      }
    });
  } catch (e) {
    if (isUniqueViolation(e)) return sellFail("IDEMPOTENCY_CONFLICT");
    throw e;
  }
}

// ═══════════════════════ ctx · ตัวช่วยนอก tx ═══════════════════════
/** SellCtx ที่ใช้ตลอดคำขอ (นาฬิกาเดียว = ctx.now) — เรียกราคา/snapshot/*InTx ด้วยตัวนี้ตัวเดียว */
function sellCtxOf(c: Ctx, raw: unknown): SellCtx {
  const locale = isRec(raw) && (raw.locale === "th" || raw.locale === "en") ? raw.locale : undefined;
  return { tenantId: c.tenantId, unitId: c.unitId, channel: c.channel, actor: c.actor, now: c.clock.now, ...(locale ? { locale } : {}) };
}
const isPublicActor = (a: SellActor) => a.kind === "PUBLIC";
/** คีย์กันซ้ำตาม namespace ของผู้เรียก (CC §C ข้อ 3) */
const nsKey = (c: Ctx, key: string, tokenHash: string | null) => idemKeyFor(c.actor, key, tokenHash ?? undefined);

/** บรรทัดต้องเป็น TRIP ของหน่วยนี้ (ตะกร้าข้ามหน่วย/ข้ามชนิด = K1.1) */
function linesGate(c: Ctx, lines: readonly LineInput[]): Failure | null {
  for (const l of lines) {
    if (l.productKind !== "TRIP") return sellFail("KIND_NOT_SUPPORTED");
    if (l.unitId !== c.unitId) return NF();
  }
  return null;
}
type OverrideReq = { priceOverrides?: OverrideInput[]; overrideApprovals?: ApprovalInput[] };
/** ราคาแก้มือต้องมี canOverride (จาก action) · คำอนุมัติทุกตัวต้องมี resolvedMinor (มติ §16 ข้อ 3) */
function overrideGate(req: OverrideReq, opts: BookingOpts | undefined): Failure | null {
  if (req.priceOverrides?.length && opts?.canOverride !== true) return sellFail("FORBIDDEN");
  if (req.overrideApprovals?.some((a) => a.resolvedMinor === undefined)) return sellFail("VALIDATION", { reason: "APPROVAL_RESOLVED_REQUIRED" });
  return null;
}
/** ตัวเลือกราคา (บริบทเดียวกับตอนเสนอราคา · เลือกฟิลด์เอง) */
function quoteOptsOf(req: OverrideReq, opts: BookingOpts | undefined): TripQuoteOpts {
  return {
    ...(req.priceOverrides?.length ? { overrides: req.priceOverrides.map((o) => ({ itemRef: o.itemRef, unitMinor: o.unitMinor, reason: o.reason })) } : {}),
    ...(opts?.canOverride === true ? { canOverride: true } : {}),
    ...(req.overrideApprovals?.length
      ? { overrideApprovals: req.overrideApprovals.map((a) => ({ approvalId: a.approvalId, itemRef: a.itemRef, unitMinor: a.unitMinor, ...(a.resolvedMinor !== undefined ? { resolvedMinor: a.resolvedMinor } : {}) })) }
      : {}),
  };
}
/** ตัวเลือกต่อบรรทัดแบบเดียวกับ quoteTrips (agentDiscount · linkId ของคำขอ) */
function lineOptsOf(q: QuoteRequestInput, base: TripQuoteOpts): TripQuoteOpts {
  return { ...base, ...(q.agentDiscountSatang ? { agentDiscountSatang: q.agentDiscountSatang } : {}), ...(q.attribution?.linkId ? { linkId: q.attribution.linkId } : {}) };
}
/** คำอนุมัติราคาแก้มือต้อง APPROVED ทุกตัว (นอก tx) */
async function approvalsGate(c: Ctx, req: OverrideReq): Promise<Failure | null> {
  const ids = (req.overrideApprovals ?? []).map((a) => a.approvalId);
  if (!ids.length) return null;
  const st = await requestStatuses({ tenantId: c.tenantId }, ids);
  return ids.every((id) => st[id] === "APPROVED") ? null : sellFail("FORBIDDEN", { reason: "APPROVAL_NOT_APPROVED" });
}
const priceChanged = (quote: Quote, reason?: string): Failure => sellFail("PRICE_CHANGED", { ...(reason ? { reason } : {}), quote });
/** ตัดสิทธิ์โค้ดไม่ผ่าน ⇒ PRICE_CHANGED + ใบเสนอราคาใหม่ของคำขอเดิม "ไม่มีโค้ด" (ใบสั่ง §5.4) */
async function promoFailure(sc: SellCtx, q: QuoteRequestInput, qopts: TripQuoteOpts, reason: string): Promise<Failure> {
  const lines = q.lines.map((l) => {
    const { promoCode: _drop, ...rest } = l;
    return rest;
  });
  const fresh = await quoteTrips(sc, { ...q, lines } as QuoteRequest, qopts);
  return sellFail("PRICE_CHANGED", { reason, ...(fresh.ok ? { quote: fresh.value } : {}) });
}

/** ที่นั่งที่นับความจุต่อบรรทัด (Σ qty ของประเภทคน countsCapacity · ทารกไม่นับ) — 0 หรือเกิน QTY_MAX ⇒ VALIDATION */
async function seatsOfLines(g: Gate, lines: readonly LineInput[]): Promise<number[] | Failure> {
  const ids = [...new Set(lines.flatMap((l) => l.pax.map((p) => p.paxTypeId)))];
  const rows = await tenantDb({ tenantId: g.tenantId, unitId: g.unitId }).tripPaxType.findMany({
    where: { tenantId: g.tenantId, unitId: g.unitId, id: { in: ids } },
    select: { id: true, productId: true, countsCapacity: true },
  });
  const byId = new Map(rows.map((r) => [r.id, r]));
  const out: number[] = [];
  for (const l of lines) {
    let n = 0;
    for (const p of l.pax) {
      const pt = byId.get(p.paxTypeId);
      if (!pt || pt.productId !== l.productId) return NF();
      if (pt.countsCapacity) n += p.qty;
    }
    if (n < 1 || n > QTY_MAX) return sellFail("VALIDATION", { fields: ["pax"] });
    out.push(n);
  }
  return out;
}
/** แถวเฟส 1 + ค่าตั้งของรอบทุกบรรทัด (นอก tx) */
async function policiesOfLines(sc: SellCtx, lines: readonly LineInput[]): Promise<CapacityPolicies | Failure> {
  for (const l of lines) {
    const rows = await capacityRowsOf(sc, { ...l, productKind: "TRIP" });
    if (!rows.length) return NF();
  }
  const pol = await loadCapacityPolicies(sc, { departureIds: [...new Set(lines.map((l) => l.slotId))] });
  if (!pol.ok) return pol;
  for (const l of lines) if (!pol.value.departures[l.slotId]) return NF();
  return pol.value;
}
function holdExpiry(policies: CapacityPolicies, departureId: string, purpose: "PAYMENT" | "SHOP_CONFIRM", now: Date): Date {
  const d = policies.departures[departureId];
  const exp = d ? holdExpiresAt(purpose, d.durations, now) : null;
  if (!exp) throw new BookingAbort("VALIDATION", { reason: "SETTINGS_INVALID" });
  return exp;
}

// ═══════════════════════ ตะกร้า (SellBasket) ═══════════════════════
type BasketRow = { id: string; status: string; channel: string; publicTokenHash: string | null; idempotencyKey: string; requestHash: string | null; expiresAt: Date; unitIds: string[] };
async function basketByKey(db: Tx, tenantId: string, key: string): Promise<BasketRow | null> {
  const rows = await db.$queryRaw<BasketRow[]>`
    SELECT "id", "status", "channel", "publicTokenHash", "idempotencyKey", "requestHash", "expiresAt", "unitIds" FROM "SellBasket" WHERE "tenantId" = ${tenantId} AND "idempotencyKey" = ${key}`;
  return rows[0] ?? null;
}
async function basketById(db: Tx, tenantId: string, id: string, lock: boolean): Promise<BasketRow | null> {
  const rows = lock
    ? await db.$queryRaw<BasketRow[]>`
        SELECT "id", "status", "channel", "publicTokenHash", "idempotencyKey", "requestHash", "expiresAt", "unitIds" FROM "SellBasket" WHERE "id" = ${id} AND "tenantId" = ${tenantId} FOR UPDATE`
    : await db.$queryRaw<BasketRow[]>`
        SELECT "id", "status", "channel", "publicTokenHash", "idempotencyKey", "requestHash", "expiresAt", "unitIds" FROM "SellBasket" WHERE "id" = ${id} AND "tenantId" = ${tenantId}`;
  return rows[0] ?? null;
}
async function basketTokenUsed(db: Tx, tokenHash: string): Promise<boolean> {
  const rows = await db.$queryRaw<{ id: string }[]>`SELECT "id" FROM "SellBasket" WHERE "publicTokenHash" = ${tokenHash}`;
  return rows.length > 0;
}
/** ชั้น 0: INSERT ตะกร้า OPEN · ชนคีย์/ token ⇒ null (ผู้เรียกตัดสิน) */
async function insertBasket(tx: Tx, b: { id: string; tenantId: string; channel: string; expiresAt: Date; tokenHash: string | null; key: string; requestHash: string; unitId: string }): Promise<boolean> {
  const rows = await tx.$queryRaw<{ id: string }[]>`
    INSERT INTO "SellBasket" ("id", "tenantId", "channel", "status", "expiresAt", "publicTokenHash", "idempotencyKey", "requestHash", "unitIds", "createdAt", "updatedAt")
    VALUES (${b.id}, ${b.tenantId}, ${b.channel}, 'OPEN', ${b.expiresAt.toISOString()}::timestamp, ${b.tokenHash}::text, ${b.key}, ${b.requestHash}, ${[b.unitId]}::text[], now(), now())
    ON CONFLICT DO NOTHING
    RETURNING "id"`;
  return rows.length === 1;
}
const unitDb = (g: Gate) => tenantDb({ tenantId: g.tenantId, unitId: g.unitId }) as unknown as Tx;

/** Hold ของตะกร้า (holdIds เรียงตามบรรทัดจากส่วนท้ายคีย์ `_<i>`) */
async function holdValueOf(g: Gate, b: BasketRow): Promise<Hold> {
  const rows = await unitDb(g).$queryRaw<{ id: string; idempotencyKey: string }[]>`
    SELECT "id", "idempotencyKey" FROM "TripHold" WHERE "basketId" = ${b.id} AND "tenantId" = ${g.tenantId} AND "unitId" = ${g.unitId}`;
  const idx = (k: string) => Number(/_(\d+)@[^@]*$/.exec(k)?.[1] ?? "9999");
  const holdIds = rows.sort((a, z) => idx(a.idempotencyKey) - idx(z.idempotencyKey) || (a.id < z.id ? -1 : 1)).map((r) => r.id);
  return { holdIds, basketId: b.id, expiresAt: new Date(b.expiresAt).toISOString() };
}

// ═══════════════════════ ล็อกชั้นสินค้า/รอบ ═══════════════════════
/** สินค้าทุกตัวของตะกร้า FOR SHARE เรียง id (หลังชั้น 0 · ก่อนแตะรอบ · r2 §d ข้อ 2) */
async function lockProductsInTx(tx: Tx, sc: SellCtx, productIds: readonly string[]): Promise<void> {
  const pub = isPublicActor(sc.actor);
  for (const productId of [...new Set(productIds)].sort()) {
    try {
      const p = await assertProductSellableInTx(tx, { tenantId: sc.tenantId, unitId: sc.unitId, productId });
      if (pub && p.status !== "ACTIVE") throw new BookingAbort("NOT_FOUND");
    } catch (e) {
      if (e instanceof TripProductNotSellableError) throw new BookingAbort(pub || e.code === "NOT_FOUND" ? "NOT_FOUND" : "SLOT_CLOSED");
      throw e;
    }
  }
}
/** 1a ล็อกรอบทั้งหมดเรียง id (reserveInTx op CONVERT = SELECT … FOR UPDATE อย่างเดียว) */
async function lockDeparturesInTx(tx: Tx, sc: SellCtx, departureIds: readonly string[]): Promise<void> {
  const ids = [...new Set(departureIds)].sort();
  if (!ids.length) return;
  await reserveInTx(tx, sc, ids.map((id) => ({ layer: "1a", table: "TripDeparture", id, sortKey: id })), { op: "CONVERT", qtyPublic: 0, qtyAllot: 0 });
}
/** เฟส 1 ถือ: reserveInTx(HOLD) ทีละบรรทัดตามรอบ (sortCapacityRows = id รอบ) */
async function reserveHoldsInTx(tx: Tx, sc: SellCtx, lines: readonly { departureId: string; qty: number }[], policies: CapacityPolicies, capKey: string | null): Promise<void> {
  const order = lines.map((l, i) => ({ ...l, i })).sort((a, b) => (a.departureId < b.departureId ? -1 : a.departureId > b.departureId ? 1 : a.i - b.i));
  for (const l of order) {
    await reserveInTx(tx, sc, [{ layer: "1a", table: "TripDeparture", id: l.departureId, sortKey: l.departureId }], { op: "HOLD", qtyPublic: l.qty, qtyAllot: 0, ...(capKey ? { capKey } : {}), policies });
  }
}
/** 2a INSERT hold ต่อบรรทัด (ตามหลัง reserveInTx(HOLD) ของรอบ/จำนวนเดียวกันใน tx นี้เท่านั้น) */
async function insertHoldsInTx(tx: Tx, sc: SellCtx, lines: readonly { departureId: string; qty: number; key: string }[], basketId: string, policies: CapacityPolicies, capKey: string | null): Promise<string[]> {
  const ids: string[] = [];
  for (const l of lines) {
    const r = await insertHoldInTx(tx, sc, { departureId: l.departureId, qty: l.qty, idempotencyKey: l.key, purpose: "PAYMENT", basketId, ...(capKey ? { capKey } : {}) }, policies);
    if (!r.ok) throw new BookingAbort(r.code, r.details);
    ids.push(r.value.holdId);
  }
  return ids;
}

// ═══════════════════════ ถือผ่านตะกร้า (ใบสั่ง §5.3) ═══════════════════════
/**
 * tripSellable.hold — นอก tx: ตรวจรูป → กันซ้ำ → ราคาเดิม (quoteId · เวลาหมดของใบเสนอราคา) → แถวเฟส 1 + ค่าตั้ง
 * tx: ชั้น 0 INSERT SellBasket → (PUBLIC) acquireHoldCapInTx ของตะกร้า → สินค้าเรียง id → reserveInTx(HOLD) ตามรอบ → insertHoldInTx ต่อบรรทัด
 */
export async function holdTrips(ctx: unknown, input: unknown, opts?: BookingOpts): Promise<SellResult<Hold>> {
  const pc = parseCtx(ctx);
  if (!pc.ok) return pc;
  const c = pc.c;
  if (c.actor.kind === "SYSTEM") return sellFail("FORBIDDEN");
  const p = holdRequestSchema.safeParse(input);
  if (!p.success) return invalidInput(p.error);
  const req = p.data;
  const pub = c.actor.kind === "PUBLIC";
  if (pub && !req.basketToken) return sellFail("VALIDATION", { fields: ["basketToken"] });
  if (req.basketId !== undefined || req.holdMinutes !== undefined) return sellFail("VALIDATION", { fields: ["basketId", "holdMinutes"] });
  const lg = linesGate(c, req.quote.lines) ?? overrideGate(req, opts);
  if (lg) return lg;
  const g = await gateOf(c);
  if (!g) return NF();
  const tokenHash = pub && req.basketToken ? sha256hex(req.basketToken) : null;
  const key = nsKey(c, req.idempotencyKey, tokenHash);
  const requestHash = holdRequestHash({ op: "trips.hold.v1", quote: req.quote, quoteId: req.quoteId, priceOverrides: req.priceOverrides ?? null, overrideApprovals: req.overrideApprovals ?? null });
  const db = unitDb(g);
  const prior = await basketByKey(db, g.tenantId, key);
  if (prior) return prior.requestHash === requestHash ? { ok: true, value: await holdValueOf(g, prior) } : sellFail("IDEMPOTENCY_CONFLICT");
  if (tokenHash && (await basketTokenUsed(db, tokenHash))) return sellFail("VALIDATION", { reason: "BASKET_TOKEN_USED" });

  const sc = sellCtxOf(c, ctx);
  const qopts = quoteOptsOf(req, opts);
  const fresh = await quoteTrips(sc, req.quote as QuoteRequest, qopts);
  if (!fresh.ok) return fresh;
  if (c.clock.now.getTime() > Date.parse(req.quoteExpiresAt)) return priceChanged(fresh.value, "QUOTE_EXPIRED");
  if (fresh.value.quoteId !== req.quoteId) return priceChanged(fresh.value);
  const ag = await approvalsGate(c, req);
  if (ag) return ag;
  const seats = await seatsOfLines(g, req.quote.lines);
  if (!Array.isArray(seats)) return seats;
  const policies = await policiesOfLines(sc, req.quote.lines);
  if ("ok" in policies) return policies;
  const lines = req.quote.lines.map((l, i) => ({ departureId: l.slotId, qty: seats[i], key: `${req.idempotencyKey}_${i}` }));
  let expiresAt: Date;
  try {
    expiresAt = new Date(Math.max(...lines.map((l) => holdExpiry(policies, l.departureId, "PAYMENT", c.clock.now).getTime())));
  } catch (e) {
    if (e instanceof BookingAbort) return sellFail(e.code, e.details);
    throw e;
  }
  const capKey = tokenHash ? `basket:${tokenHash}` : null;
  const basketId = newId("sb_");
  const r = await runBooking(g, async (tx): Promise<{ dup: BasketRow } | { value: Hold }> => {
    // ชั้น 0
    if (!(await insertBasket(tx, { id: basketId, tenantId: g.tenantId, channel: c.channel, expiresAt, tokenHash, key, requestHash, unitId: g.unitId }))) {
      const b = await basketByKey(tx, g.tenantId, key);
      if (b) return { dup: b };
      throw new BookingAbort("VALIDATION", { reason: "BASKET_TOKEN_USED" });
    }
    if (capKey) await acquireHoldCapInTx(tx, sc, { capKey, mode: "HOLDS", add: lines.length, limit: policies.holdCap });
    await lockProductsInTx(tx, sc, req.quote.lines.map((l) => l.productId));
    await reserveHoldsInTx(tx, sc, lines, policies, capKey);
    const holdIds = await insertHoldsInTx(tx, sc, lines, basketId, policies, capKey);
    return { value: { holdIds, basketId, expiresAt: expiresAt.toISOString() } };
  });
  if (!r.ok) return r;
  if ("dup" in r.value) return r.value.dup.requestHash === requestHash ? { ok: true, value: await holdValueOf(g, r.value.dup) } : sellFail("IDEMPOTENCY_CONFLICT");
  return { ok: true, value: r.value.value };
}

// ═══════════════════════ เตรียมยืนยัน (นอก tx · ใบสั่ง §5.4 ข้อ 1) ═══════════════════════
export type PreparedLine = {
  index: number;
  bookingId: string;
  productId: string;
  departureId: string;
  seats: number;
  snapshot: TripsBookingSnapshot;
  columns: BookingColumns;
  items: BookingItemColumns[];
  status: BookingStatus;
  holdMode: InitialHoldMode;
  prefix: string;
  passengers: { name: string; paxTypeId: string }[];
  promo: { ruleId: string; discountSatang: number } | null;
  holdId: string | null;
};
export type PreparedConfirm = {
  kind: "trips.confirm.v1";
  tenantId: string;
  unitId: string;
  channel: string;
  basketId: string | null;
  basketKey: string;
  requestHash: string;
  tokenHash: string | null;
  contactKey: string | null;
  bookerPartyId: string | null;
  payMethod: "PAY_NOW" | "PAY_LATER";
  overridden: boolean;
  onExpired: "FAIL" | "REHOLD";
  lines: PreparedLine[];
  policies: CapacityPolicies;
};
type CoreReq = OverrideReq & {
  quote: QuoteRequestInput;
  quoteId: string;
  booker: { name: string; phone?: string; email?: string; lineUserId?: string; partyId?: string };
  passengers?: { name: string; paxTypeId: string }[];
  pay: { method: "PAY_NOW" | "PAY_LATER" | "WALLET" | "CREDIT" };
};

/** ส่วนร่วมของ confirm/bookNow นอก tx: ราคา (quoteId) → snapshot ต่อบรรทัด → ค่าตั้ง X1/X3 → สถานะแรก → ผู้เดินทาง → คำอนุมัติ → ผู้จอง (Party) */
async function prepareCore(
  c: Ctx,
  sc: SellCtx,
  g: Gate,
  req: CoreReq,
  opts: BookingOpts | undefined,
  extra: { quoteExpiresAt?: string; policies: CapacityPolicies },
): Promise<{ ok: true; lines: PreparedLine[]; contactKey: string | null; bookerPartyId: string | null; payMethod: "PAY_NOW" | "PAY_LATER" } | Failure> {
  const lg = linesGate(c, req.quote.lines) ?? overrideGate(req, opts);
  if (lg) return lg;
  const contactKey = contactKeyOf(req.booker);
  const pub = c.actor.kind === "PUBLIC";
  if (!contactKey && (pub || req.quote.lines.some((l) => l.promoCode))) return sellFail("VALIDATION", { reason: "CONTACT_REQUIRED" });
  const qopts = quoteOptsOf(req, opts);
  const fresh = await quoteTrips(sc, req.quote as QuoteRequest, qopts);
  if (!fresh.ok) return fresh;
  if (extra.quoteExpiresAt !== undefined && c.clock.now.getTime() > Date.parse(extra.quoteExpiresAt)) return priceChanged(fresh.value, "QUOTE_EXPIRED");
  if (fresh.value.quoteId !== req.quoteId) return priceChanged(fresh.value);
  const ag = await approvalsGate(c, req);
  if (ag) return ag;
  // snapshot ต่อบรรทัด (ยอดที่จด/ตัดโค้ด มาจากที่นี่เท่านั้น)
  const qLines = fresh.value.lines as TripQuoteLine[];
  const snaps: TripsBookingSnapshot[] = [];
  for (let i = 0; i < req.quote.lines.length; i++) {
    const ql = qLines[i];
    if (!ql) return priceChanged(fresh.value);
    const s = await buildTripBookingSnapshot(sc, { ...req.quote.lines[i], productKind: "TRIP" }, { quotedFingerprint: ql.fingerprint, policyAt: ql.policyAt }, lineOptsOf(req.quote, qopts));
    if (!s.ok) return s.code === "PRICE_CHANGED" ? priceChanged(fresh.value) : s;
    snaps.push(s.value);
  }
  // ค่าตั้ง X1 (ชั้นสินค้า) · X3 (ชั้นหน่วย)
  const settingsOf = new Map<string, { confirmMode: string; prefix: string }>();
  for (const productId of [...new Set(req.quote.lines.map((l) => l.productId))]) {
    const r = await resolveSettings({ tenantId: c.tenantId }, [K_CONFIRM_MODE, K_CODE_PREFIX], { unitId: c.unitId, productId }, c.clock.now);
    const confirmMode = r[K_CONFIRM_MODE]?.value;
    const prefix = r[K_CODE_PREFIX]?.value;
    if (typeof confirmMode !== "string" || !CONFIRM_MODES.has(confirmMode) || typeof prefix !== "string" || !PREFIX_RE.test(prefix)) return sellFail("VALIDATION", { reason: "SETTINGS_INVALID" });
    settingsOf.set(productId, { confirmMode, prefix });
  }
  // ผู้เดินทาง: จับคู่ตามประเภทคนกับที่นั่งของบรรทัด (ตามลำดับบรรทัด) · เกิน ⇒ TOO_MANY_PASSENGERS
  const seatLeft = snaps.map((s) => {
    const m: Record<string, number> = {};
    for (const l of s.lines) {
      const pt = (l as { paxTypeId?: unknown }).paxTypeId;
      if (l.kind === "SEAT" && typeof pt === "string") m[pt] = (m[pt] ?? 0) + l.qty;
    }
    return m;
  });
  const paxOf: { name: string; paxTypeId: string }[][] = snaps.map(() => []);
  for (const p of req.passengers ?? []) {
    const i = seatLeft.findIndex((m) => (m[p.paxTypeId] ?? 0) > 0);
    if (i < 0) return sellFail("VALIDATION", { reason: "TOO_MANY_PASSENGERS" });
    seatLeft[i][p.paxTypeId] -= 1;
    paxOf[i].push({ name: p.name, paxTypeId: p.paxTypeId });
  }
  const bookingPrefix = `tb${randomBytes(10).toString("hex")}`;
  const lines: PreparedLine[] = [];
  for (let i = 0; i < snaps.length; i++) {
    const s = snaps[i];
    const cols = bookingColumnsFromSnapshot(s as unknown as SnapshotShape);
    if (!cols) return sellFail("VALIDATION", { reason: "SNAPSHOT_INVALID" });
    const set = settingsOf.get(req.quote.lines[i].productId);
    if (!set) return sellFail("VALIDATION", { reason: "SETTINGS_INVALID" });
    const st = initialBookingStatus({ actorKind: c.actor.kind, payMethod: req.pay.method, confirmMode: set.confirmMode, dueNowSatang: dueNowOfSnapshot(s as unknown as SnapshotShape) });
    if (!st.ok) return sellFail(st.code, { reason: st.reason });
    lines.push({
      index: i,
      bookingId: `${bookingPrefix}${String(i).padStart(2, "0")}`,
      productId: req.quote.lines[i].productId,
      departureId: req.quote.lines[i].slotId,
      seats: seatsOfSnapshot(s as unknown as SnapshotShape),
      snapshot: s,
      columns: cols.booking,
      items: cols.items,
      status: st.status,
      holdMode: st.hold,
      prefix: set.prefix,
      passengers: paxOf[i],
      promo: s.promo && s.promo.discountSatang > 0 ? { ruleId: s.promo.ruleId, discountSatang: s.promo.discountSatang } : null,
      holdId: null,
    });
  }
  for (const l of lines) if (!extra.policies.departures[l.departureId]) return NF();
  // ผู้จอง = Party ของร้าน (ช่องทางใดก็ได้ · นอก tx · ซ้ำได้ไม่เพิ่มแถว) — STAFF ส่ง partyId ของร้านตัวเองได้
  let bookerPartyId: string | null = null;
  if (c.actor.kind === "STAFF" && req.booker.partyId) {
    const party = await tenantDb({ tenantId: c.tenantId }).party.findFirst({ where: { id: req.booker.partyId, tenantId: c.tenantId }, select: { id: true } });
    if (!party) return NF();
    bookerPartyId = party.id;
  } else {
    bookerPartyId = await safeFindOrCreate(c.tenantId, { name: req.booker.name, phone: req.booker.phone ?? null, email: req.booker.email ?? null });
  }
  return { ok: true, lines, contactKey, bookerPartyId, payMethod: req.pay.method === "PAY_LATER" ? "PAY_LATER" : "PAY_NOW" };
}

type ConfirmPrep = { replay: BookingRef[] } | { prepared: PreparedConfirm; c: Ctx; sc: SellCtx; g: Gate; quote: QuoteRequestInput; qopts: TripQuoteOpts };

async function replayOrConflict(g: Gate, b: BasketRow, key: string, requestHash: string): Promise<SellResult<BookingRef[]>> {
  if (b.status === "CHECKED_OUT" && b.idempotencyKey === key) return b.requestHash === requestHash ? { ok: true, value: await refsOfBasket(g, b.id) } : sellFail("IDEMPOTENCY_CONFLICT");
  return sellFail("STATE_CONFLICT", { reason: "BASKET_CHECKED_OUT" });
}

/**
 * ส่วนนอก tx ของการยืนยัน (ให้ K1.1 ประกอบตะกร้าข้ามชนิดได้) — คืน `prepared` ที่ finalizeTripsInTx ใช้ หรือผลเดิม (กันซ้ำ)
 * ตะกร้า/ token ผิด ⇒ HOLD_NOT_FOUND · บรรทัดไม่ตรง hold ⇒ VALIDATION HOLD_MISMATCH · ราคาไม่ตรง ⇒ PRICE_CHANGED + ใบใหม่
 */
export async function prepareTripConfirm(ctx: unknown, input: unknown, opts?: BookingOpts): Promise<SellResult<ConfirmPrep>> {
  const pc = parseCtx(ctx);
  if (!pc.ok) return pc;
  const c = pc.c;
  if (c.actor.kind === "SYSTEM") return sellFail("FORBIDDEN");
  const p = confirmRequestSchema.safeParse(input);
  if (!p.success) return invalidInput(p.error);
  const req = p.data;
  const pub = c.actor.kind === "PUBLIC";
  if (pub && !req.basketToken) return sellFail("VALIDATION", { fields: ["basketToken"] });
  const g = await gateOf(c);
  if (!g) return sellFail("HOLD_NOT_FOUND");
  const db = unitDb(g);
  const b = await basketById(db, g.tenantId, req.basketId, false);
  const tokenHash = pub && req.basketToken ? sha256hex(req.basketToken) : null;
  if (!b || !b.unitIds.includes(c.unitId) || (pub && b.publicTokenHash !== tokenHash)) return sellFail("HOLD_NOT_FOUND");
  const key = nsKey(c, req.idempotencyKey, tokenHash);
  const requestHash = holdRequestHash({
    op: "trips.confirm.v1",
    basketId: req.basketId,
    holdIds: req.holdIds,
    quoteId: req.quoteId,
    quote: req.quote,
    booker: req.booker,
    passengers: req.passengers ?? null,
    pay: req.pay,
    note: req.note ?? null,
    onExpired: req.onExpired ?? "FAIL",
    priceOverrides: req.priceOverrides ?? null,
    overrideApprovals: req.overrideApprovals ?? null,
  });
  if (b.status !== "OPEN") {
    const r = await replayOrConflict(g, b, key, requestHash);
    return r.ok ? { ok: true, value: { replay: r.value } } : r;
  }
  const lg = linesGate(c, req.quote.lines);
  if (lg) return lg;
  // hold ของตะกร้า ↔ บรรทัด (รอบ + จำนวน)
  const holds = await db.$queryRaw<{ id: string; departureId: string; qtyPublic: number; qtyAllot: number }[]>`
    SELECT "id", "departureId", "qtyPublic", "qtyAllot" FROM "TripHold"
    WHERE "id" = ANY(${req.holdIds}::text[]) AND "tenantId" = ${g.tenantId} AND "unitId" = ${g.unitId} AND "basketId" = ${b.id}`;
  if (holds.length !== new Set(req.holdIds).size || holds.length !== req.holdIds.length) return sellFail("HOLD_NOT_FOUND");
  if (req.quote.lines.length !== req.holdIds.length) return sellFail("VALIDATION", { reason: "HOLD_MISMATCH" });
  const seats = await seatsOfLines(g, req.quote.lines);
  if (!Array.isArray(seats)) return seats;
  const byId = new Map(holds.map((h) => [h.id, h]));
  for (let i = 0; i < req.holdIds.length; i++) {
    const h = byId.get(req.holdIds[i]);
    if (!h || h.departureId !== req.quote.lines[i].slotId || h.qtyPublic + h.qtyAllot !== seats[i]) return sellFail("VALIDATION", { reason: "HOLD_MISMATCH" });
  }
  const sc = sellCtxOf(c, ctx);
  const policies = await loadCapacityPolicies(sc, { departureIds: [...new Set(req.quote.lines.map((l) => l.slotId))] });
  if (!policies.ok) return policies;
  const core = await prepareCore(c, sc, g, req, opts, { policies: policies.value });
  if (!core.ok) return core;
  for (const l of core.lines) {
    l.holdId = req.holdIds[l.index];
    if (l.seats !== seats[l.index]) return sellFail("VALIDATION", { reason: "HOLD_MISMATCH" });
  }
  return {
    ok: true,
    value: {
      prepared: {
        kind: "trips.confirm.v1",
        tenantId: c.tenantId,
        unitId: c.unitId,
        channel: c.channel,
        basketId: b.id,
        basketKey: key,
        requestHash,
        tokenHash,
        contactKey: core.contactKey,
        bookerPartyId: core.bookerPartyId,
        payMethod: core.payMethod,
        overridden: !!req.priceOverrides?.length,
        onExpired: req.onExpired ?? "FAIL",
        lines: core.lines,
        policies: policies.value,
      },
      c,
      sc,
      g,
      quote: req.quote,
      qopts: quoteOptsOf(req, opts),
    },
  };
}

// ═══════════════════════ ยืนยัน (ใบสั่ง §5.4) ═══════════════════════
type TxOut = { replay: true } | { refs: BookingRef[] };
/** ชั้น 0 ของการยืนยัน: ตะกร้า FOR UPDATE (ไม่ OPEN ⇒ กันซ้ำ §5.5) */
async function lockOpenBasket(tx: Tx, P: PreparedConfirm): Promise<{ replay: true } | null> {
  if (!P.basketId) throw new BookingAbort("HOLD_NOT_FOUND");
  const b = await basketById(tx, P.tenantId, P.basketId, true);
  if (!b || !b.unitIds.includes(P.unitId) || (P.tokenHash !== null && b.publicTokenHash !== P.tokenHash)) throw new BookingAbort("HOLD_NOT_FOUND");
  if (b.status === "OPEN") return null;
  if (b.status === "CHECKED_OUT" && b.idempotencyKey === P.basketKey) {
    if (b.requestHash === P.requestHash) return { replay: true };
    throw new BookingAbort("IDEMPOTENCY_CONFLICT");
  }
  throw new BookingAbort("STATE_CONFLICT", { reason: "BASKET_CHECKED_OUT" });
}
async function confirmTx(tx: Tx, sc: SellCtx, P: PreparedConfirm, mode: "FAIL" | "REHOLD"): Promise<TxOut> {
  if (await lockOpenBasket(tx, P)) return { replay: true };
  const pub = isPublicActor(sc.actor);
  let lines = P.lines;
  if (mode === "FAIL") {
    if (pub) {
      if (!P.contactKey) throw new BookingAbort("VALIDATION", { reason: "CONTACT_REQUIRED" });
      await rekeyHoldsToContactInTx(tx, sc, { holdIds: lines.map((l) => l.holdId ?? ""), contactKey: `contact:${P.contactKey}` }, P.policies);
    }
    await lockProductsInTx(tx, sc, lines.map((l) => l.productId));
    await lockDeparturesInTx(tx, sc, lines.map((l) => l.departureId));
  } else {
    // REHOLD (ธุรกรรมใหม่ · STAFF): สินค้า → 1a → ปล่อย hold เก่าที่ยัง ACTIVE → reserveInTx(HOLD) → insertHoldInTx (rh_<holdIdเดิม>)
    await lockProductsInTx(tx, sc, lines.map((l) => l.productId));
    await lockDeparturesInTx(tx, sc, lines.map((l) => l.departureId));
    for (const l of [...lines].sort((a, b) => (a.departureId < b.departureId ? -1 : a.departureId > b.departureId ? 1 : 0))) {
      const cur = await tx.$queryRaw<{ status: string }[]>`SELECT "status" FROM "TripHold" WHERE "id" = ${l.holdId ?? ""} AND "tenantId" = ${P.tenantId} AND "unitId" = ${P.unitId}`;
      if (cur[0]?.status === "ACTIVE") await releaseHoldInTx(tx, sc, { holdId: l.holdId ?? "", reason: "REHOLD" }, P.policies);
    }
    await reserveHoldsInTx(tx, sc, lines.map((l) => ({ departureId: l.departureId, qty: l.seats })), P.policies, null);
    const ids = await insertHoldsInTx(tx, sc, lines.map((l) => ({ departureId: l.departureId, qty: l.seats, key: `rh_${l.holdId ?? ""}`.slice(0, 100) })), P.basketId ?? "", P.policies, null);
    lines = lines.map((l, i) => ({ ...l, holdId: ids[i] }));
  }
  const out = await finalizeTripsInTx(tx, sc, [], { prepared: { ...P, lines }, basketId: P.basketId ?? "" });
  if (!out.ok) throw new BookingAbort(out.code, out.details);
  return { refs: out.value.bookings };
}

/** ผลของธุรกรรมยืนยัน → SellResult (replay อ่านผลเดิม · โค้ดตัดสิทธิ์ไม่ผ่าน ⇒ PRICE_CHANGED + ใบใหม่ไม่มีโค้ด) */
async function finishConfirm(r: SellResult<TxOut>, g: Gate, basketId: string, sc: SellCtx, quote: QuoteRequestInput, qopts: TripQuoteOpts): Promise<SellResult<BookingRef[]>> {
  if (!r.ok) {
    const reason = typeof r.details?.reason === "string" ? r.details.reason : "";
    if (PROMO_REASONS.has(reason)) return promoFailure(sc, quote, qopts, reason);
    return r;
  }
  if ("replay" in r.value) return { ok: true, value: await refsOfBasket(g, basketId) };
  return { ok: true, value: r.value.refs };
}

/** tripSellable.confirm — ยืนยันการจองจากตะกร้าที่ถือไว้ในธุรกรรมเดียว (ลำดับ §5.4) */
export async function confirmTrips(ctx: unknown, input: unknown, opts?: BookingOpts): Promise<SellResult<BookingRef[]>> {
  const prep = await prepareTripConfirm(ctx, input, opts);
  if (!prep.ok) return prep;
  if ("replay" in prep.value) return { ok: true, value: prep.value.replay };
  const { prepared: P, c, sc, g, quote, qopts } = prep.value;
  let r = await runBooking(g, (tx) => confirmTx(tx, sc, P, "FAIL"));
  if (!r.ok && r.code === "HOLD_EXPIRED" && P.onExpired === "REHOLD" && c.actor.kind === "STAFF") r = await runBooking(g, (tx) => confirmTx(tx, sc, P, "REHOLD"));
  return finishConfirm(r, g, P.basketId ?? "", sc, quote, qopts);
}

// ═══════════════════════ แกนในธุรกรรม (ข้อ 4–7 ของ §5.4) ═══════════════════════
type InsertedBooking = { line: PreparedLine; code: string; token: string };
function duesOf(snap: { currency?: unknown; paymentSchedule?: unknown }): DueSpec[] {
  const cur = typeof snap.currency === "string" ? snap.currency : "THB";
  const rows = Array.isArray(snap.paymentSchedule) ? snap.paymentSchedule : [];
  return rows.filter(isRec).map((r) => ({
    seq: Number(r.seq),
    kind: String(r.kind),
    amount: { satang: Number(r.amountSatang), currency: cur },
    dueAt: String(r.dueAt),
  }));
}
const eventPayload = (b: { id: string; unitId: string; departureId: string; status: string; channel: string; amountSatang: number }) => ({
  bookingId: b.id,
  unitId: b.unitId,
  departureId: b.departureId,
  status: b.status,
  channel: b.channel,
  amountSatang: b.amountSatang,
});
type AuditActor = { tenantId: string; unitId: string; actor: SellActor };
/** audit ใน tx เดียวกัน (STAFF/SYSTEM · ไม่มีข้อมูลบุคคล) */
async function auditBooking(tx: Tx, a: AuditActor, action: string, targetId: string, after: Record<string, string | number | boolean | null>, before?: Record<string, string | number | boolean | null>) {
  if (a.actor.kind !== "STAFF" && a.actor.kind !== "SYSTEM") return;
  await tx.auditLog.create({
    data: {
      tenantId: a.tenantId,
      unitId: a.unitId,
      actorType: a.actor.kind === "STAFF" ? "USER" : "SYSTEM",
      actorId: a.actor.kind === "STAFF" ? a.actor.userId : null,
      action,
      targetType: "TripBooking",
      targetId,
      ...(before ? { before: { ...before } } : {}),
      after: { ...after },
    },
  });
}
function isPrepared(v: unknown): v is PreparedConfirm {
  return isRec(v) && v.kind === "trips.confirm.v1" && Array.isArray(v.lines) && isRec(v.policies);
}

/**
 * แกนข้อ 4–7 ของ §5.4 ในธุรกรรมของผู้เรียก (ให้ K1.1 ประกอบตะกร้าข้ามชนิด) — ผู้เรียกทำชั้น 0 (ตะกร้า · rekey) + สินค้า + 1a มาแล้ว
 * `req.prepared` = ผลของ prepareTripConfirm/bookTripsNow (snapshot · สถานะแรก · ค่าตั้ง สร้างนอก tx) · ปฏิเสธ ⇒ throw BookingAbort/CapacityAbort/PricingAbort
 * 2a ผูก bookingId (CAS) + CONVERT/SHOP_CONFIRM/KEEP ตามรอบเรียง id → 2c เลขจอง → 2b การจอง/รายการ/ผู้เดินทาง → โค้ดส่วนลด (เรียง id การจอง) → 2h outbox/audit → ตะกร้า CHECKED_OUT
 */
export async function finalizeTripsInTx(tx: unknown, ctx: unknown, reservations: unknown, req: unknown): Promise<SellResult<{ holds?: Hold; bookings: BookingRef[]; ledger: LedgerDraft[] }>> {
  const t = tx as Tx;
  const pc = parseCtx(ctx);
  if (!pc.ok) throw new BookingAbort(pc.code, pc.details);
  const c = pc.c;
  const P = isRec(req) ? req.prepared : undefined;
  if (!isPrepared(P) || P.tenantId !== c.tenantId || P.unitId !== c.unitId || (isRec(req) && req.basketId !== P.basketId) || !Array.isArray(reservations)) throw new BookingAbort("VALIDATION", { reason: "PREPARED_REQUIRED" });
  const sc: SellCtx = { tenantId: c.tenantId, unitId: c.unitId, channel: c.channel, actor: c.actor, now: c.clock.now };
  const nowIso = c.clock.iso;
  const pub = c.actor.kind === "PUBLIC";
  // 2a: ผูก hold กับการจอง ตามรอบเรียง id
  const ordered = [...P.lines].sort((a, b) => (a.departureId < b.departureId ? -1 : a.departureId > b.departureId ? 1 : (a.holdId ?? "") < (b.holdId ?? "") ? -1 : 1));
  for (const l of ordered) {
    const holdId = l.holdId ?? "";
    const bound = await t.$queryRaw<{ id: string }[]>`
      UPDATE "TripHold" SET "bookingId" = ${l.bookingId}, "updatedAt" = now()
      WHERE "id" = ${holdId} AND "tenantId" = ${c.tenantId} AND "unitId" = ${c.unitId} AND "basketId" = ${P.basketId} AND "departureId" = ${l.departureId}
        AND "status" = 'ACTIVE' AND "expiresAt" > ${nowIso}::timestamp AND ("bookingId" IS NULL OR "bookingId" = ${l.bookingId})
      RETURNING "id"`;
    if (bound.length !== 1) {
      const cur = await t.$queryRaw<{ id: string }[]>`SELECT "id" FROM "TripHold" WHERE "id" = ${holdId} AND "tenantId" = ${c.tenantId} AND "unitId" = ${c.unitId}`;
      throw new BookingAbort(cur.length ? "HOLD_EXPIRED" : "HOLD_NOT_FOUND");
    }
    if (l.holdMode === "CONVERT") {
      const r = await convertHoldInTx(t, sc, { holdId, ...(pub && P.contactKey ? { capKey: `contact:${P.contactKey}` } : {}) });
      if (!r.ok) throw new BookingAbort(r.code, r.details);
    } else if (l.holdMode === "SHOP_CONFIRM") {
      const exp = holdExpiry(P.policies, l.departureId, "SHOP_CONFIRM", c.clock.now);
      const s = await t.$queryRaw<{ id: string }[]>`
        UPDATE "TripHold" SET "purpose" = 'SHOP_CONFIRM', "expiresAt" = ${exp.toISOString()}::timestamp, "updatedAt" = now()
        WHERE "id" = ${holdId} AND "tenantId" = ${c.tenantId} AND "unitId" = ${c.unitId} AND "status" = 'ACTIVE' AND "expiresAt" > ${nowIso}::timestamp
        RETURNING "id"`;
      if (s.length !== 1) throw new BookingAbort("HOLD_EXPIRED");
    }
  }
  // 2c เลขจอง → 2b การจอง + รายการ + ผู้เดินทาง (ตามลำดับบรรทัด)
  const done: InsertedBooking[] = [];
  const staffId = c.actor.kind === "STAFF" ? c.actor.userId : null;
  for (const l of P.lines) {
    const code = await nextBookingCodeInTx(t, { tenantId: c.tenantId, prefix: l.prefix, localDate: l.columns.travelDate });
    const token = bookingPublicToken(l.bookingId);
    const k = l.columns;
    await t.tripBooking.create({
      data: {
        id: l.bookingId,
        tenantId: c.tenantId,
        unitId: c.unitId,
        code,
        publicTokenHash: sha256hex(token),
        status: l.status,
        productId: l.productId,
        departureId: l.departureId,
        travelDate: dateOfYmd(k.travelDate),
        basketId: P.basketId,
        channel: c.channel,
        salesStaffId: staffId,
        collectMode: k.collectMode,
        payMethod: P.payMethod,
        bookerPartyId: P.bookerPartyId,
        marketingEligible: k.marketingEligible,
        contactRoute: k.contactRoute,
        currency: k.currency,
        fxRateMicros: k.fxRateMicros,
        grossSatang: k.grossSatang,
        discountSatang: k.discountSatang,
        agentDiscountSatang: k.agentDiscountSatang,
        passThroughSatang: k.passThroughSatang,
        vatSatang: k.vatSatang,
        commissionSatang: k.commissionSatang,
        commissionVatSatang: k.commissionVatSatang,
        whtSatang: k.whtSatang,
        netToShopSatang: k.netToShopSatang,
        paidSatang: k.paidSatang,
        refundedSatang: k.refundedSatang,
        accountingState: k.accountingState,
        policySnapshot: l.snapshot as unknown as Prisma.InputJsonValue,
        version: 0,
        createdById: staffId,
      },
    });
    const itemIds = await insertItems(t, c.tenantId, c.unitId, l.bookingId, l.departureId, l.items);
    if (l.passengers.length) {
      await t.tripPassenger.createMany({
        data: l.passengers.map((p) => ({
          id: newId("tp_"),
          tenantId: c.tenantId,
          unitId: c.unitId,
          bookingId: l.bookingId,
          itemId: itemIds.find((x) => x.kind === "SEAT" && x.paxTypeId === p.paxTypeId)?.id ?? null,
          fullName: p.name,
          answers: {},
          formStatus: "PENDING",
        })),
      });
    }
    done.push({ line: l, code, token });
  }
  // โค้ดส่วนลด (เรียง id การจอง · ภายในเรียง ruleId) — ยอดจาก snapshot
  for (const d of [...done].sort((a, b) => (a.line.bookingId < b.line.bookingId ? -1 : 1))) {
    if (!d.line.promo) continue;
    if (!P.contactKey) throw new BookingAbort("VALIDATION", { reason: "CONTACT_REQUIRED" });
    await redeemPromosInTx(t, sc, { contactKey: P.contactKey, bookingId: d.line.bookingId, items: [{ ruleId: d.line.promo.ruleId, discountSatang: d.line.promo.discountSatang }] });
  }
  // 2h outbox + audit
  const evts: { tenantId: string; unitId: string; type: string; idempotencyKey: string; payload: Record<string, unknown> }[] = [];
  for (const d of done) {
    const payload = eventPayload({ id: d.line.bookingId, unitId: c.unitId, departureId: d.line.departureId, status: d.line.status, channel: c.channel, amountSatang: d.line.snapshot.totals.payableSatang });
    evts.push({ tenantId: c.tenantId, unitId: c.unitId, type: "trips.booking.created", idempotencyKey: `trips.booking.created:${d.line.bookingId}`, payload });
    if (d.line.status === "CONFIRMED") evts.push({ tenantId: c.tenantId, unitId: c.unitId, type: "trips.booking.confirmed", idempotencyKey: `trips.booking.confirmed:${d.line.bookingId}`, payload });
    const a: AuditActor = { tenantId: c.tenantId, unitId: c.unitId, actor: c.actor };
    await auditBooking(t, a, "trips.booking.create", d.line.bookingId, { status: d.line.status, departureId: d.line.departureId, seats: d.line.seats, grossSatang: d.line.columns.grossSatang, payableSatang: d.line.snapshot.totals.payableSatang });
    if (P.overridden) await auditBooking(t, a, "trips.booking.price_override", d.line.bookingId, { grossSatang: d.line.columns.grossSatang, discountSatang: d.line.columns.discountSatang });
  }
  await emitOutboxMany(t, evts);
  // ตะกร้า OPEN → CHECKED_OUT (คีย์/แฮชของการยืนยันแทนของการถือ · §5.5)
  const co = await t.$queryRaw<{ id: string }[]>`
    UPDATE "SellBasket" SET "status" = 'CHECKED_OUT', "idempotencyKey" = ${P.basketKey}, "requestHash" = ${P.requestHash}, "updatedAt" = now()
    WHERE "id" = ${P.basketId} AND "tenantId" = ${c.tenantId} AND "status" = 'OPEN'
    RETURNING "id"`;
  if (co.length !== 1) throw new BookingAbort("STATE_CONFLICT", { reason: "BASKET_CHECKED_OUT" });
  const bookings: BookingRef[] = done.map((d) => ({ productKind: "TRIP", bookingId: d.line.bookingId, code: d.code, status: d.line.status, publicToken: d.token, dues: duesOf(d.line.snapshot) }));
  return { ok: true, value: { bookings, ledger: [] } };
}

/** INSERT รายการของการจอง (id ฝั่งแอป · คืน id ต่อรายการให้ผูกผู้เดินทาง) */
async function insertItems(tx: Tx, tenantId: string, unitId: string, bookingId: string, departureId: string, items: readonly BookingItemColumns[]): Promise<{ id: string; kind: string; paxTypeId: string | null }[]> {
  const rows = items.map((it) => ({
    id: newId("ti_"),
    tenantId,
    unitId,
    bookingId,
    departureId,
    kind: it.kind,
    paxTypeId: it.paxTypeId,
    extraId: it.extraId,
    qty: it.qty,
    unitPriceMinor: it.unitPriceMinor,
    amountMinor: it.amountMinor,
    amountSatang: it.amountSatang,
    vatSatang: it.vatSatang,
    commissionable: it.commissionable,
    discountable: it.discountable,
    passThrough: it.passThrough,
    taxKind: it.taxKind,
    priceSource: it.priceSource,
    active: true,
  }));
  if (rows.length) await tx.tripBookingItem.createMany({ data: rows });
  return rows.map((r) => ({ id: r.id, kind: r.kind, paxTypeId: r.paxTypeId }));
}

/** BookingRef ของตะกร้า (ผลเดิมของการยืนยันซ้ำ · token สร้างซ้ำได้จาก HMAC) — เรียง id = ลำดับบรรทัด */
async function refsOfBasket(g: Gate, basketId: string): Promise<BookingRef[]> {
  const rows = await unitDb(g).$queryRaw<{ id: string; code: string; status: string; policySnapshot: unknown }[]>`
    SELECT "id", "code", "status", "policySnapshot" FROM "TripBooking" WHERE "basketId" = ${basketId} AND "tenantId" = ${g.tenantId} AND "unitId" = ${g.unitId} ORDER BY "id"`;
  return rows.map((r) => ({ productKind: "TRIP", bookingId: r.id, code: r.code, status: r.status, publicToken: bookingPublicToken(r.id), dues: isRec(r.policySnapshot) ? duesOf(r.policySnapshot) : [] }));
}

// ═══════════════════════ จองหน้าร้านทีเดียว (ใบสั่ง §5.6) ═══════════════════════
/** STAFF เท่านั้น: ตะกร้า + hold + ยืนยัน ในธุรกรรมเดียว (ลำดับ §5.3 แล้ว §5.4 ข้อ 4–7 · ไม่มี rekey) · คีย์ซ้ำ = ผลเดิม */
export async function bookTripsNow(ctx: unknown, input: unknown, opts?: BookingOpts): Promise<SellResult<BookingRef[]>> {
  const pc = parseCtx(ctx);
  if (!pc.ok) return pc;
  const c = pc.c;
  if (c.actor.kind !== "STAFF") return sellFail("FORBIDDEN");
  const p = bookNowRequestSchema.safeParse(input);
  if (!p.success) return invalidInput(p.error);
  const req = p.data;
  const lg = linesGate(c, req.quote.lines) ?? overrideGate(req, opts);
  if (lg) return lg;
  const g = await gateOf(c);
  if (!g) return NF();
  const key = nsKey(c, req.idempotencyKey, null);
  const requestHash = holdRequestHash({
    op: "trips.booknow.v1",
    quote: req.quote,
    quoteId: req.quoteId,
    booker: req.booker,
    passengers: req.passengers ?? null,
    pay: req.pay,
    note: req.note ?? null,
    priceOverrides: req.priceOverrides ?? null,
    overrideApprovals: req.overrideApprovals ?? null,
  });
  const prior = await basketByKey(unitDb(g), g.tenantId, key);
  if (prior) return replayOrConflict(g, prior, key, requestHash);
  const sc = sellCtxOf(c, ctx);
  const seats = await seatsOfLines(g, req.quote.lines);
  if (!Array.isArray(seats)) return seats;
  const policies = await policiesOfLines(sc, req.quote.lines);
  if ("ok" in policies) return policies;
  const core = await prepareCore(c, sc, g, req, opts, { quoteExpiresAt: req.quoteExpiresAt, policies });
  if (!core.ok) return core;
  for (const l of core.lines) if (l.seats !== seats[l.index]) return sellFail("VALIDATION", { fields: ["pax"] });
  let expiresAt: Date;
  try {
    expiresAt = new Date(Math.max(...core.lines.map((l) => holdExpiry(policies, l.departureId, "PAYMENT", c.clock.now).getTime())));
  } catch (e) {
    if (e instanceof BookingAbort) return sellFail(e.code, e.details);
    throw e;
  }
  const basketId = newId("sb_");
  const P: PreparedConfirm = {
    kind: "trips.confirm.v1",
    tenantId: c.tenantId,
    unitId: c.unitId,
    channel: c.channel,
    basketId,
    basketKey: key,
    requestHash,
    tokenHash: null,
    contactKey: core.contactKey,
    bookerPartyId: core.bookerPartyId,
    payMethod: core.payMethod,
    overridden: !!req.priceOverrides?.length,
    onExpired: "FAIL",
    lines: core.lines,
    policies,
  };
  const r = await runBooking(g, async (tx): Promise<TxOut> => {
    if (!(await insertBasket(tx, { id: basketId, tenantId: g.tenantId, channel: c.channel, expiresAt, tokenHash: null, key, requestHash, unitId: g.unitId }))) {
      const b = await basketByKey(tx, g.tenantId, key);
      if (b && b.status === "CHECKED_OUT" && b.requestHash === requestHash) return { replay: true };
      throw new BookingAbort(b && b.requestHash !== requestHash ? "IDEMPOTENCY_CONFLICT" : "STATE_CONFLICT", b && b.requestHash !== requestHash ? undefined : { reason: "BASKET_CHECKED_OUT" });
    }
    await lockProductsInTx(tx, sc, core.lines.map((l) => l.productId));
    await reserveHoldsInTx(tx, sc, core.lines.map((l) => ({ departureId: l.departureId, qty: l.seats })), policies, null);
    const ids = await insertHoldsInTx(tx, sc, core.lines.map((l) => ({ departureId: l.departureId, qty: l.seats, key: `${req.idempotencyKey}_${l.index}` })), basketId, policies, null);
    const out = await finalizeTripsInTx(tx, sc, [], { prepared: { ...P, lines: core.lines.map((l, i) => ({ ...l, holdId: ids[i] })) }, basketId });
    if (!out.ok) throw new BookingAbort(out.code, out.details);
    return { refs: out.value.bookings };
  });
  if (r.ok && "replay" in r.value) {
    const b = await basketByKey(unitDb(g), g.tenantId, key);
    return b ? { ok: true, value: await refsOfBasket(g, b.id) } : sellFail("STATE_CONFLICT");
  }
  return finishConfirm(r, g, basketId, sc, req.quote, quoteOptsOf(req, opts));
}

// ═══════════════════════ อ่านการจอง ═══════════════════════
type BookingRow = {
  id: string;
  code: string;
  status: string;
  version: number;
  productId: string;
  departureId: string;
  travelDate: Date;
  basketId: string | null;
  channel: string;
  payMethod: string;
  bookerPartyId: string | null;
  currency: string;
  grossSatang: number;
  discountSatang: number;
  passThroughSatang: number;
  vatSatang: number;
  netToShopSatang: number;
  paidSatang: number;
  refundedSatang: number;
  cancelReason: string | null;
  cancelledAt: Date | null;
  createdAt: Date;
  policySnapshot: unknown;
};
async function readBooking(db: Tx, g: Gate, id: string): Promise<BookingRow | null> {
  const rows = await db.$queryRaw<BookingRow[]>`
    SELECT "id", "code", "status", "version", "productId", "departureId", "travelDate", "basketId", "channel", "payMethod", "bookerPartyId", "currency",
      "grossSatang", "discountSatang", "passThroughSatang", "vatSatang", "netToShopSatang", "paidSatang", "refundedSatang", "cancelReason", "cancelledAt", "createdAt", "policySnapshot"
    FROM "TripBooking" WHERE "id" = ${id} AND "tenantId" = ${g.tenantId} AND "unitId" = ${g.unitId}`;
  return rows[0] ?? null;
}
export type TripBookingDTO = Omit<BookingRow, "travelDate" | "cancelledAt" | "createdAt" | "policySnapshot"> & { travelDate: string; cancelledAt: string | null; createdAt: string; payableSatang: number };
function dtoOf(b: BookingRow): TripBookingDTO {
  const totals = isRec(b.policySnapshot) && isRec(b.policySnapshot.totals) ? b.policySnapshot.totals : {};
  return {
    id: b.id,
    code: b.code,
    status: b.status,
    version: b.version,
    productId: b.productId,
    departureId: b.departureId,
    travelDate: ymdOf(b.travelDate),
    basketId: b.basketId,
    channel: b.channel,
    payMethod: b.payMethod,
    bookerPartyId: b.bookerPartyId,
    currency: b.currency,
    grossSatang: b.grossSatang,
    discountSatang: b.discountSatang,
    passThroughSatang: b.passThroughSatang,
    vatSatang: b.vatSatang,
    netToShopSatang: b.netToShopSatang,
    paidSatang: b.paidSatang,
    refundedSatang: b.refundedSatang,
    payableSatang: typeof totals.payableSatang === "number" ? totals.payableSatang : b.grossSatang,
    cancelReason: b.cancelReason,
    cancelledAt: b.cancelledAt ? new Date(b.cancelledAt).toISOString() : null,
    createdAt: new Date(b.createdAt).toISOString(),
  };
}
/** ร้าน/ระบบเท่านั้น (หน้า my/[token] ของลูกค้า = W1.3) */
function readerGate(c: Ctx): Failure | null {
  return c.actor.kind === "STAFF" || c.actor.kind === "SYSTEM" ? null : sellFail("FORBIDDEN");
}
export async function getTripBooking(ctx: unknown, input: unknown): Promise<SellResult<TripBookingDTO>> {
  const pc = parseCtx(ctx);
  if (!pc.ok) return pc;
  const rg = readerGate(pc.c);
  if (rg) return rg;
  const p = getRequestSchema.safeParse(input);
  if (!p.success) return invalidInput(p.error);
  const g = await gateOf(pc.c);
  if (!g) return NF();
  const b = await readBooking(unitDb(g), g, p.data.bookingId);
  return b ? { ok: true, value: dtoOf(b) } : NF();
}
export async function listTripBookings(ctx: unknown, input: unknown): Promise<SellResult<{ items: TripBookingDTO[] }>> {
  const pc = parseCtx(ctx);
  if (!pc.ok) return pc;
  const rg = readerGate(pc.c);
  if (rg) return rg;
  const p = listRequestSchema.safeParse(input);
  if (!p.success) return invalidInput(p.error);
  const v = p.data;
  if (v.status !== undefined && !isBookingStatus(v.status)) return sellFail("VALIDATION", { fields: ["status"] });
  const g = await gateOf(pc.c);
  if (!g) return NF();
  const rows = await tenantDb({ tenantId: g.tenantId, unitId: g.unitId }).tripBooking.findMany({
    where: {
      tenantId: g.tenantId,
      unitId: g.unitId,
      ...(v.departureId ? { departureId: v.departureId } : {}),
      ...(v.status ? { status: v.status } : {}),
      ...(v.from || v.to ? { travelDate: { ...(v.from ? { gte: dateOfYmd(v.from) } : {}), ...(v.to ? { lte: dateOfYmd(v.to) } : {}) } } : {}),
    },
    orderBy: [{ travelDate: "asc" }, { id: "asc" }],
    take: v.limit ?? 50,
    select: {
      id: true, code: true, status: true, version: true, productId: true, departureId: true, travelDate: true, basketId: true, channel: true, payMethod: true, bookerPartyId: true, currency: true,
      grossSatang: true, discountSatang: true, passThroughSatang: true, vatSatang: true, netToShopSatang: true, paidSatang: true, refundedSatang: true, cancelReason: true, cancelledAt: true, createdAt: true, policySnapshot: true,
    },
  });
  return { ok: true, value: { items: rows.map((r) => dtoOf(r)) } };
}

// ═══════════════════════ CAS สถานะ (ตัวช่วยให้ใบถัดไป · ใบสั่ง §3) ═══════════════════════
/** CAS เดียวของการเปลี่ยนสถานะ (status + version) — 0 แถว ⇒ STATE_CONFLICT · cancelReason/cancelledAt/travelledAt ตามปลายทาง */
async function casStatus(tx: Tx, a: { tenantId: string; unitId: string }, id: string, from: string, to: string, version: number, nowIso: string, reason: string | null): Promise<number> {
  const rows = await tx.$queryRaw<{ version: number }[]>`
    UPDATE "TripBooking" SET "status" = ${to}, "version" = "version" + 1, "updatedAt" = now(),
      "cancelReason" = CASE WHEN ${to} = 'CANCELLED' THEN COALESCE(${reason}::text, "cancelReason") ELSE "cancelReason" END,
      "cancelledAt" = CASE WHEN ${to} = 'CANCELLED' THEN ${nowIso}::timestamp ELSE "cancelledAt" END,
      "travelledAt" = CASE WHEN ${to} = 'TRAVELLED' THEN ${nowIso}::timestamp ELSE "travelledAt" END
    WHERE "id" = ${id} AND "tenantId" = ${a.tenantId} AND "unitId" = ${a.unitId} AND "status" = ${from} AND "version" = ${version}
    RETURNING "version"`;
  const r = rows[0];
  if (!r) throw new BookingAbort("STATE_CONFLICT");
  return r.version;
}
/**
 * เปลี่ยนสถานะในธุรกรรมของผู้เรียก: ตรวจผัง (PUBLIC/AGENT ไม่ได้ ⇒ FORBIDDEN · อื่น STATE_CONFLICT TRANSITION_NOT_ALLOWED) แล้ว CAS
 * 🔴 ไม่แตะตัวนับที่นั่ง — ผู้เรียกทำคำสั่งที่นั่งของ T0.4 ใน tx เดียวกันก่อน · ปฏิเสธ ⇒ throw BookingAbort
 */
export async function transitionBookingInTx(tx: unknown, ctx: unknown, input: unknown): Promise<SellResult<{ version: number }>> {
  const t = tx as Tx;
  const pc = parseCtx(ctx);
  if (!pc.ok) throw new BookingAbort(pc.code, pc.details);
  const c = pc.c;
  const p = transitionRequestSchema.safeParse(input);
  if (!p.success) throw new BookingAbort("VALIDATION", { fields: p.error.issues.map((i) => i.path.join(".")).slice(0, 5) });
  const v = p.data;
  if (!canTransitionBooking(v.from, v.to, c.actor.kind)) {
    if (c.actor.kind === "PUBLIC" || c.actor.kind === "AGENT") throw new BookingAbort("FORBIDDEN");
    throw new BookingAbort("STATE_CONFLICT", { reason: "TRANSITION_NOT_ALLOWED" });
  }
  const version = await casStatus(t, c, v.bookingId, v.from, v.to, v.expectedVersion, c.clock.iso, v.reason ?? null);
  return { ok: true, value: { version } };
}

// ═══════════════════════ ปล่อย hold ของการจอง → ยกเลิก → คืนโค้ด (r2 §d ข้อ 4) ═══════════════════════
/** คืนที่นั่ง (releaseHoldInTx) ก่อน CAS การจอง แล้วจึง releasePromoInTx — ลำดับเดียวกับยืนยัน (รอบ → hold → การจอง → กฎโค้ด) */
async function cancelUnpaidInTx(tx: Tx, sc: SellCtx, b: { id: string; status: string; version: number }, reason: string, policies: CapacityPolicies | undefined): Promise<number> {
  const a = { tenantId: sc.tenantId, unitId: sc.unitId };
  const holds = await tx.$queryRaw<{ id: string }[]>`
    SELECT "id" FROM "TripHold" WHERE "bookingId" = ${b.id} AND "tenantId" = ${a.tenantId} AND "unitId" = ${a.unitId} AND "status" = 'ACTIVE' ORDER BY "departureId", "id"`;
  for (const h of holds) {
    const r = await releaseHoldInTx(tx, sc, { holdId: h.id, reason: "BOOKING_CANCELLED" }, policies);
    if (!r.ok) throw new BookingAbort(r.code, r.details);
  }
  const version = await casStatus(tx, a, b.id, b.status, "CANCELLED", b.version, (sc.now ?? new Date()).toISOString(), reason);
  await releasePromoInTx(tx, sc, { bookingId: b.id });
  return version;
}
async function optionalPolicies(sc: SellCtx, departureId: string): Promise<CapacityPolicies | undefined> {
  const r = await loadCapacityPolicies(sc, { departureIds: [departureId] });
  return r.ok ? r.value : undefined;
}
async function emitBooking(tx: Tx, a: { tenantId: string; unitId: string }, type: string, key: string, b: { id: string; departureId: string; status: string; channel: string; amountSatang: number }) {
  await emitOutboxMany(tx, [{ tenantId: a.tenantId, unitId: a.unitId, type, idempotencyKey: `${type}:${key}`, payload: eventPayload({ ...b, unitId: a.unitId }) }]);
}
const payableOf = (b: BookingRow) => {
  const t = isRec(b.policySnapshot) && isRec(b.policySnapshot.totals) ? b.policySnapshot.totals.payableSatang : undefined;
  return typeof t === "number" ? t : b.grossSatang;
};

// ═══════════════════════ ยกเลิกก่อนจ่าย (ใบสั่ง §5.6) ═══════════════════════
/**
 * tripSellable.cancel — QUOTE = คำนวณจาก snapshot (ไม่เขียน) · EXECUTE (STAFF/SYSTEM) บน HOLD/PENDING:
 * releaseHoldInTx → CAS →CANCELLED → releasePromoInTx → outbox · ขายแล้ว ⇒ STATE_CONFLICT REFUND_REQUIRED (T0.7) · PUBLIC ⇒ FORBIDDEN OTP_REQUIRED (W1.3)
 * คีย์ซ้ำ = ผลเดิม (สถานะ CANCELLED + audit ของคีย์นี้)
 */
export async function cancelTripBooking(ctx: unknown, input: unknown): Promise<SellResult<CancelResult>> {
  const pc = parseCtx(ctx);
  if (!pc.ok) return pc;
  const c = pc.c;
  if (c.actor.kind === "PUBLIC") return sellFail("FORBIDDEN", { reason: "OTP_REQUIRED" });
  const p = cancelRequestSchema.safeParse(input);
  if (!p.success) return invalidInput(p.error);
  const v = p.data;
  const g = await gateOf(c);
  if (!g) return NF();
  const b = await readBooking(unitDb(g), g, v.bookingId);
  if (!b) return NF();
  const sc = sellCtxOf(c, ctx);
  const computed = (): CancelResult["computed"] | null => {
    const r = recomputeFromSnapshot(b.policySnapshot, { kind: "CANCEL", at: c.clock.iso, reasonKind: v.reasonKind ?? "CUSTOMER", paidSatang: b.paidSatang });
    if (!r.ok || !("refundSatang" in r.value) || !("keptSatang" in r.value)) return null;
    return { refundSatang: r.value.refundSatang, feeSatang: r.value.keptSatang, ladderStep: r.value.step, source: "SNAPSHOT" };
  };
  if (v.mode === "QUOTE") {
    try {
      const cv = computed();
      return cv ? { ok: true, value: { computed: cv, status: b.status } } : sellFail("VALIDATION", { reason: "SNAPSHOT_INVALID" });
    } catch {
      return sellFail("VALIDATION", { reason: "SNAPSHOT_INVALID" });
    }
  }
  const keyHash = sha256hex(`cancel:${b.id}:${nsKey(c, v.idempotencyKey, null)}`);
  const replayed = async (): Promise<boolean> => {
    const rows = await tenantDb({ tenantId: g.tenantId }).auditLog.findMany({ where: { tenantId: g.tenantId, action: "trips.booking.cancel", targetId: b.id }, select: { after: true }, take: 20 });
    return rows.some((r) => isRec(r.after) && r.after.idemKeyHash === keyHash);
  };
  const zero: CancelResult["computed"] = { refundSatang: 0, feeSatang: 0, ladderStep: null, source: "SNAPSHOT" };
  if (b.status === "CANCELLED" && (await replayed())) return { ok: true, value: { computed: zero, status: "CANCELLED" } };
  if (SOLD.has(b.status)) return sellFail("STATE_CONFLICT", { reason: "REFUND_REQUIRED" });
  if (!UNPAID.has(b.status)) return sellFail("STATE_CONFLICT");
  const policies = await optionalPolicies(sc, b.departureId);
  const r = await runBooking(g, async (tx): Promise<"DONE" | "REPLAY"> => {
    let version: number;
    try {
      version = await cancelUnpaidInTx(tx, sc, b, v.reason, policies);
    } catch (e) {
      if (e instanceof BookingAbort && e.code === "STATE_CONFLICT" && !e.details) {
        const rows = await tx.auditLog.findMany({ where: { tenantId: g.tenantId, action: "trips.booking.cancel", targetId: b.id }, select: { after: true }, take: 20 });
        if (rows.some((x) => isRec(x.after) && x.after.idemKeyHash === keyHash)) return "REPLAY";
      }
      throw e;
    }
    await emitBooking(tx, g, "trips.booking.cancelled", b.id, { id: b.id, departureId: b.departureId, status: "CANCELLED", channel: b.channel, amountSatang: payableOf(b) });
    await auditBooking(tx, { tenantId: g.tenantId, unitId: g.unitId, actor: c.actor }, "trips.booking.cancel", b.id, { status: "CANCELLED", version, idemKeyHash: keyHash }, { status: b.status, version: b.version });
    return "DONE";
  });
  if (!r.ok) return r;
  return { ok: true, value: { computed: zero, status: "CANCELLED" } };
}

// ═══════════════════════ อนุมัติ/ปฏิเสธคำขอ PENDING (ใบสั่ง §5.6) ═══════════════════════
/** APPROVE = PENDING→HOLD (hold CAS purpose PAYMENT · expiresAt = now + T5) · REJECT = ปล่อย hold → PENDING→CANCELLED → releasePromoInTx */
export async function approveTripBooking(ctx: unknown, input: unknown): Promise<SellResult<{ bookingId: string; status: string; version: number }>> {
  const pc = parseCtx(ctx);
  if (!pc.ok) return pc;
  const c = pc.c;
  if (c.actor.kind !== "STAFF" && c.actor.kind !== "SYSTEM") return sellFail("FORBIDDEN");
  const p = approveRequestSchema.safeParse(input);
  if (!p.success) return invalidInput(p.error);
  const v = p.data;
  const g = await gateOf(c);
  if (!g) return NF();
  const b = await readBooking(unitDb(g), g, v.bookingId);
  if (!b) return NF();
  if (b.status !== "PENDING" || b.version !== v.expectedVersion) return sellFail("STATE_CONFLICT");
  const sc = sellCtxOf(c, ctx);
  const a = { tenantId: g.tenantId, unitId: g.unitId, actor: c.actor };
  if (v.decision === "APPROVE") {
    const pol = await loadCapacityPolicies(sc, { departureIds: [b.departureId] });
    if (!pol.ok) return pol;
    const r = await runBooking(g, async (tx) => {
      await lockDeparturesInTx(tx, sc, [b.departureId]);
      const exp = holdExpiry(pol.value, b.departureId, "PAYMENT", c.clock.now);
      const h = await tx.$queryRaw<{ id: string }[]>`
        UPDATE "TripHold" SET "purpose" = 'PAYMENT', "expiresAt" = ${exp.toISOString()}::timestamp, "updatedAt" = now()
        WHERE "bookingId" = ${b.id} AND "tenantId" = ${g.tenantId} AND "unitId" = ${g.unitId} AND "status" = 'ACTIVE' AND "purpose" = 'SHOP_CONFIRM' AND "expiresAt" > ${c.clock.iso}::timestamp
        RETURNING "id"`;
      if (!h.length) throw new BookingAbort("STATE_CONFLICT");
      const tr = await transitionBookingInTx(tx, sc, { bookingId: b.id, from: "PENDING", to: "HOLD", expectedVersion: v.expectedVersion });
      if (!tr.ok) throw new BookingAbort(tr.code, tr.details);
      await auditBooking(tx, a, "trips.booking.approve", b.id, { status: "HOLD", version: tr.value.version }, { status: b.status, version: b.version });
      return tr.value.version;
    });
    return r.ok ? { ok: true, value: { bookingId: b.id, status: "HOLD", version: r.value } } : r;
  }
  const policies = await optionalPolicies(sc, b.departureId);
  const r = await runBooking(g, async (tx) => {
    const version = await cancelUnpaidInTx(tx, sc, { id: b.id, status: "PENDING", version: v.expectedVersion }, v.reason ?? "REJECTED", policies);
    await emitBooking(tx, g, "trips.booking.cancelled", b.id, { id: b.id, departureId: b.departureId, status: "CANCELLED", channel: b.channel, amountSatang: payableOf(b) });
    await auditBooking(tx, a, "trips.booking.reject", b.id, { status: "CANCELLED", version }, { status: b.status, version: b.version });
    return version;
  });
  return r.ok ? { ok: true, value: { bookingId: b.id, status: "CANCELLED", version: r.value } } : r;
}

// ═══════════════════════ แก้คน/เลื่อนวัน (ใบสั่ง §5.6) ═══════════════════════
/**
 * STAFF · การจองที่ขายแล้ว (CONFIRMED/PART_PAID/PAID) · snapshot ใหม่ทั้งก้อนนอก tx (ตารางยกเลิก/นโยบายคงของเดิม เว้น useCurrentPolicy + เหตุผล ≥ 10 ตัว)
 * tx: สินค้า → 1a รอบเก่า/ใหม่ min→max → ที่นั่ง (รอบเดิม: เพิ่ม reserveInTx(HOLD)→insertHoldInTx→convertHoldInTx / ลด returnSoldInTx · ย้าย: moveSoldInTx + ส่วนต่าง)
 *     → CAS การจอง (สถานะเดิม · version+1) → รายการเดิม active=false + INSERT ใหม่ → audit before/after → event · เลขจองเดิม
 */
export async function changeTripBooking(ctx: unknown, input: unknown, opts?: BookingOpts): Promise<SellResult<{ bookingId: string; version: number; departureId: string }>> {
  const pc = parseCtx(ctx);
  if (!pc.ok) return pc;
  const c = pc.c;
  if (c.actor.kind !== "STAFF") return sellFail("FORBIDDEN");
  const p = changeRequestSchema.safeParse(input);
  if (!p.success) return invalidInput(p.error);
  const v = p.data;
  if (v.useCurrentPolicy && (v.reason ?? "").trim().length < CHANGE_POLICY_REASON_MIN) return sellFail("VALIDATION", { fields: ["reason"] });
  if (v.line.promoCode) return sellFail("VALIDATION", { fields: ["line.promoCode"] });
  const lg = linesGate(c, [v.line]) ?? overrideGate(v, opts);
  if (lg) return lg;
  const g = await gateOf(c);
  if (!g) return NF();
  const b = await readBooking(unitDb(g), g, v.bookingId);
  if (!b) return NF();
  if (UNPAID.has(b.status)) return sellFail("STATE_CONFLICT", { reason: "CHANGE_BEFORE_CONFIRM" });
  if (b.status !== "CONFIRMED" && b.status !== "PART_PAID" && b.status !== "PAID") return sellFail("STATE_CONFLICT");
  if (b.version !== v.expectedVersion) return sellFail("STATE_CONFLICT");
  if (v.line.productId !== b.productId) return sellFail("VALIDATION", { fields: ["line.productId"] });
  const sc = sellCtxOf(c, ctx);
  const quote: QuoteRequestInput = { lines: [v.line] };
  const qopts = quoteOptsOf(v, opts);
  const fresh = await quoteTrips(sc, quote as QuoteRequest, qopts);
  if (!fresh.ok) return fresh;
  if (c.clock.now.getTime() > Date.parse(v.quoteExpiresAt)) return priceChanged(fresh.value, "QUOTE_EXPIRED");
  if (fresh.value.quoteId !== v.quoteId) return priceChanged(fresh.value);
  const ag = await approvalsGate(c, v);
  if (ag) return ag;
  const ql = (fresh.value.lines as TripQuoteLine[])[0];
  if (!ql) return priceChanged(fresh.value);
  const built = await buildTripBookingSnapshot(sc, { ...v.line, productKind: "TRIP" }, { quotedFingerprint: ql.fingerprint, policyAt: ql.policyAt }, qopts);
  if (!built.ok) return built.code === "PRICE_CHANGED" ? priceChanged(fresh.value) : built;
  const old = isRec(b.policySnapshot) ? (b.policySnapshot as unknown as TripsBookingSnapshot) : null;
  if (!old) return sellFail("VALIDATION", { reason: "SNAPSHOT_INVALID" });
  const snap: TripsBookingSnapshot = v.useCurrentPolicy
    ? built.value
    : { ...built.value, policy: old.policy, cancelLadder: old.cancelLadder, cancelMinimumLadder: old.cancelMinimumLadder, shopCancelRefundBpByReason: old.shopCancelRefundBpByReason };
  const cols = bookingColumnsFromSnapshot(snap as unknown as SnapshotShape);
  if (!cols) return sellFail("VALIDATION", { reason: "SNAPSHOT_INVALID" });
  const newSeats = seatsOfSnapshot(snap as unknown as SnapshotShape);
  if (newSeats < 1 || newSeats > QTY_MAX) return sellFail("VALIDATION", { fields: ["line.pax"] });
  const oldRows = await unitDb(g).$queryRaw<{ n: number }[]>`
    SELECT COALESCE(sum(i."qty"), 0)::int AS "n" FROM "TripBookingItem" i LEFT JOIN "TripPaxType" p ON p."id" = i."paxTypeId" AND p."tenantId" = i."tenantId"
    WHERE i."bookingId" = ${b.id} AND i."tenantId" = ${g.tenantId} AND i."unitId" = ${g.unitId} AND i."active" AND i."kind" = 'SEAT' AND COALESCE(p."countsCapacity", true)`;
  const oldSeats = oldRows[0]?.n ?? 0;
  const from = b.departureId;
  const to = v.line.slotId;
  const policies = await loadCapacityPolicies(sc, { departureIds: [...new Set([from, to])] });
  if (!policies.ok) return policies;
  if (!policies.value.departures[to]) return NF();
  const a = { tenantId: g.tenantId, unitId: g.unitId, actor: c.actor };
  const r = await runBooking(g, async (tx) => {
    await lockProductsInTx(tx, sc, [b.productId]);
    await lockDeparturesInTx(tx, sc, [from, to]);
    const addOn = async (dep: string, qty: number) => {
      await reserveHoldsInTx(tx, sc, [{ departureId: dep, qty }], policies.value, null);
      const h = await insertHoldInTx(tx, sc, { departureId: dep, qty, idempotencyKey: `cg_${v.expectedVersion}_${b.id}`.slice(0, 100), purpose: "PAYMENT", bookingId: b.id }, policies.value);
      if (!h.ok) throw new BookingAbort(h.code, h.details);
      const cv = await convertHoldInTx(tx, sc, { holdId: h.value.holdId });
      if (!cv.ok) throw new BookingAbort(cv.code, cv.details);
    };
    const giveBack = async (dep: string, qty: number) => {
      const rr = await returnSoldInTx(tx, sc, { departureId: dep, qty }, policies.value);
      if (!rr.ok) throw new BookingAbort(rr.code, rr.details);
    };
    if (from === to) {
      if (newSeats > oldSeats) await addOn(to, newSeats - oldSeats);
      else if (newSeats < oldSeats) await giveBack(from, oldSeats - newSeats);
    } else {
      const moveQty = Math.min(oldSeats, newSeats);
      if (moveQty > 0) {
        const mv = await moveSoldInTx(tx, sc, { fromDepartureId: from, toDepartureId: to, qty: moveQty }, policies.value);
        if (!mv.ok) throw new BookingAbort(mv.code, mv.details);
      }
      if (newSeats > moveQty) await addOn(to, newSeats - moveQty);
      if (oldSeats > moveQty) await giveBack(from, oldSeats - moveQty);
    }
    const k = cols.booking;
    const upd = await tx.$queryRaw<{ version: number }[]>`
      UPDATE "TripBooking" SET "version" = "version" + 1, "departureId" = ${to}, "travelDate" = ${k.travelDate}::date,
        "grossSatang" = ${k.grossSatang}, "discountSatang" = ${k.discountSatang}, "agentDiscountSatang" = ${k.agentDiscountSatang}, "passThroughSatang" = ${k.passThroughSatang},
        "vatSatang" = ${k.vatSatang}, "commissionSatang" = ${k.commissionSatang}, "commissionVatSatang" = ${k.commissionVatSatang}, "whtSatang" = ${k.whtSatang},
        "netToShopSatang" = ${k.netToShopSatang}, "fxRateMicros" = ${k.fxRateMicros}::int, "policySnapshot" = ${JSON.stringify(snap)}::jsonb, "updatedAt" = now()
      WHERE "id" = ${b.id} AND "tenantId" = ${g.tenantId} AND "unitId" = ${g.unitId} AND "status" = ${b.status} AND "version" = ${v.expectedVersion}
      RETURNING "version"`;
    const nv = upd[0]?.version;
    if (nv === undefined) throw new BookingAbort("STATE_CONFLICT");
    await tx.$queryRaw`UPDATE "TripBookingItem" SET "active" = false, "updatedAt" = now() WHERE "bookingId" = ${b.id} AND "tenantId" = ${g.tenantId} AND "unitId" = ${g.unitId} AND "active" RETURNING "id"`;
    const items = await insertItems(tx, g.tenantId, g.unitId, b.id, to, cols.items);
    for (const pt of [...new Set(items.filter((x) => x.kind === "SEAT" && x.paxTypeId).map((x) => x.paxTypeId as string))]) {
      const itemId = items.find((x) => x.kind === "SEAT" && x.paxTypeId === pt)?.id ?? null;
      await tx.$queryRaw`
        UPDATE "TripPassenger" p SET "itemId" = ${itemId}, "updatedAt" = now() FROM "TripBookingItem" i
        WHERE p."bookingId" = ${b.id} AND p."tenantId" = ${g.tenantId} AND p."unitId" = ${g.unitId} AND i."id" = p."itemId" AND i."paxTypeId" = ${pt}
        RETURNING p."id"`;
    }
    await auditBooking(
      tx,
      a,
      "trips.booking.change",
      b.id,
      { departureId: to, version: nv, seats: newSeats, grossSatang: k.grossSatang, payableSatang: snap.totals.payableSatang, useCurrentPolicy: v.useCurrentPolicy === true },
      { departureId: from, version: b.version, seats: oldSeats, grossSatang: b.grossSatang, payableSatang: payableOf(b) },
    );
    if (v.priceOverrides?.length) await auditBooking(tx, a, "trips.booking.price_override", b.id, { grossSatang: k.grossSatang, discountSatang: k.discountSatang, version: nv });
    await emitBooking(tx, g, "trips.booking.changed", `${b.id}:${nv}`, { id: b.id, departureId: to, status: b.status, channel: b.channel, amountSatang: snap.totals.payableSatang });
    return nv;
  });
  return r.ok ? { ok: true, value: { bookingId: b.id, version: r.value, departureId: to } } : r;
}

// ═══════════════════════ consumer ของ trips.booking.expired (ใบสั่ง §11 ข้อ 6) ═══════════════════════
/** การจองหมดเวลาโดยตัวกวาด T0.4 ⇒ คืนสิทธิ์โค้ดส่วนลดในธุรกรรมใหม่ (ซ้ำ = ไม่ลดอีก · การจองไม่ EXPIRED ⇒ ไม่ทำอะไร) — รับ {tenantId, unitId, bookingId} หรือ event outbox */
export async function onTripBookingExpired(input: unknown): Promise<SellResult<{ released: number }>> {
  const raw = isRec(input) && isRec(input.payload) ? { tenantId: input.tenantId, unitId: input.payload.unitId ?? input.unitId, bookingId: input.payload.bookingId } : input;
  const p = expiredEventSchema.safeParse(raw);
  if (!p.success) return invalidInput(p.error);
  const v = p.data;
  const g = await gateOf(v);
  if (!g) return NF();
  const b = await readBooking(unitDb(g), g, v.bookingId);
  if (!b) return NF();
  if (b.status !== "EXPIRED") return { ok: true, value: { released: 0 } };
  const sc: SellCtx = { tenantId: g.tenantId, unitId: g.unitId, channel: b.channel === "COUNTER" ? "COUNTER" : "WEB", actor: { kind: "SYSTEM", job: "trips.booking.expired" }, now: new Date() };
  const r = await runBooking(g, async (tx) => {
    const rel = await releasePromoInTx(tx, sc, { bookingId: b.id });
    return rel.ok ? rel.value.released : 0;
  });
  return r.ok ? { ok: true, value: { released: r.value } } : r;
}
// ── /T0.6 booking ──
