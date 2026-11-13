// ─────────────────────────────────────────────────────────────
// trips/booking.ts — การจองทัวร์: ถือผ่านตะกร้า · ยืนยันในธุรกรรมเดียว · อนุมัติ/ปฏิเสธ · ยกเลิกก่อนจ่าย · แก้คน/เลื่อนวัน · อ่าน · RUN TRIPS T0.6
// ใบสั่ง ledger/trips-briefs/T0.6.md §2 §5 §8 (§16 มติผู้คุมชนะ + มติรอบแก้ r1 R1–R14) · CC §C §D.4–§D.6 §F.2 §G §J.1 §K · wo-notes T0.4 r2 §(d) · T0.5 r2/r3
//
// 🔴 นอก tx เท่านั้น: quoteTrips · buildTripBookingSnapshot · capacityRowsOf · loadCapacityPolicies · resolveSettings (X1 X3) · party · approval
//    ในธุรกรรม = *InTx ของ T0.4/T0.5 + SQL ผ่าน tx เดียวกัน (ไม่ขอ connection ที่สอง · pool 10)
// 🔴 ลำดับล็อก (ใบสั่ง §5.4 · r2 §d · R7 R13): ชั้น 0 (SellBasket FOR UPDATE / INSERT → advisory เพดานถือ/rekey/ผูกการแก้) → สินค้า FOR SHARE เรียง (id, ตัวเลือก) →
//    1a รอบ เรียง id → 2a hold (เรียงตามรอบ) → advisory คำอนุมัติ (เรียง id) → 2c เลขจอง (เรียง prefix, งวด) → 2b การจอง/รายการ/ผู้เดินทาง →
//    โค้ดส่วนลดทั้งตะกร้าเรียง ruleId → 2h outbox/audit → ตะกร้า CAS · ยกเลิก/ปฏิเสธ: คืนที่นั่ง (releaseHoldInTx) ก่อน releasePromoInTx เสมอ (r2 §d ข้อ 4)
// 🔴 ทุกการเปลี่ยนสถานะการจอง = CAS (status + version) + ตรวจจำนวนแถว · ไม่มีการลบแถว Trip* · ไม่ส่ง object ผู้เรียกเข้า Prisma data
// 🔴 ไม่มีค่าธุรกิจตายตัว: X1 X2 X3 X10 T5 มาจากค่าตั้ง (resolveSettings / policies ของ T0.4) · event/audit ไม่มีชื่อ/เบอร์/อีเมล/เลขจอง
// 🔴 ทุกฟังก์ชันบริการคืน SellResult — error ที่ไม่คาดคิดถูกบันทึก ops แล้วคืน BUSY (R10) · *InTx ปฏิเสธด้วย throw (ผู้เรียก rollback)
// ─────────────────────────────────────────────────────────────
import { createHash, createHmac, randomBytes } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { tenantDb } from "@/lib/core/db";
import { logOps } from "@/lib/core/ops";
import { emitOutboxMany } from "@/lib/core/outbox";
import type { BookingRef, CancelResult, DueSpec, Hold, LedgerDraft, Quote, QuoteRequest, SellActor, SellCtx, SellResult } from "@/lib/core/sellable";
import { resolveSettings } from "@/lib/core/settings";
import { requestBindings } from "@/lib/modules/approval";
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
import { LOCK_RETRIES, QTY_MAX, holdExpiresAt, idemKeyFor } from "./capacity-core";
import { capacityRowsOf, gateOf, loadCapacityPolicies, runTx } from "./capacity-service";
import { bookingPeriodOf, nextBookingCodeInTx } from "./numbering";
import { buildTripBookingSnapshot, quoteTripLine, quoteTrips, type TripQuoteLine, type TripQuoteOpts } from "./pricing";
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
/** entityType ของคำขออนุมัติราคาแก้มือ (มติ R1) */
export const TRIP_PRICE_OVERRIDE_ENTITY = "trips.price_override";

const sha256hex = (s: string) => createHash("sha256").update(s).digest("hex");
const newId = (prefix: string) => `${prefix}${randomBytes(12).toString("hex")}`;
const isRec = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const NF = (): Failure => sellFail("NOT_FOUND");
const ymdOf = (d: Date | string) => new Date(d).toISOString().slice(0, 10);
const dateOfYmd = (ymd: string) => new Date(`${ymd}T00:00:00.000Z`);
const byStr = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

// ═══════════════════════ token ลิงก์ลูกค้า (มติ §16 ข้อ 5 · R11) ═══════════════════════
const SECRET_MIN = 32;
const tokenSecret = (): string | null => {
  const s = process.env.SESSION_SECRET;
  return typeof s === "string" && s.length >= SECRET_MIN ? s : null;
};
/**
 * publicToken = base64url(HMAC-SHA256(กุญแจเซิร์ฟเวอร์ · ป้าย trips.booking.token.v1 · bookingId)) — 256 บิต · เก็บเฉพาะ sha256 ของ token
 * กุญแจ = SESSION_SECRET (≥ 32 ตัว) · ไม่มีกุญแจ ⇒ null ทุกสภาพแวดล้อม (ไม่มีสูตรสำรองที่ไม่มีกุญแจ · R11) — บริการคืน BUSY reason SERVER_KEY_MISSING
 * หนี้: เพิกถอน/ออกใหม่ต้องมีคอลัมน์รุ่น (W1.x · สัญญา J.3.2)
 */
export function bookingPublicToken(bookingId: string): string | null {
  const secret = tokenSecret();
  return secret ? createHmac("sha256", `trips.booking.token.v1:${secret}`).update(bookingId).digest("base64url") : null;
}
const keyMissing = (): Failure => sellFail("BUSY", { reason: "SERVER_KEY_MISSING" }, "ระบบยังไม่ได้ตั้งกุญแจเซิร์ฟเวอร์ — ทำรายการจองไม่ได้ชั่วคราว");

/**
 * id ของคำขออนุมัติราคาแก้มือ (entityId · มติ R1 + S3) — ผูก หน่วย · รอบ · itemRef · ราคาที่แก้ · ราคาระบบ · จำนวนของ itemRef นั้นในบรรทัด
 * คำอนุมัติหนึ่งใบ = บรรทัดเดียว · จอยื่นคำขอใช้ค่านี้ (REQUIRES_APPROVAL ของบริการการจองคืน details.entityId + qty ให้แล้ว)
 */
export function tripPriceOverrideEntityId(i: { unitId: string; departureId: string; itemRef: string; unitMinor: number; resolvedMinor: number; qty: number }): string {
  return `tpo2_${sha256hex(JSON.stringify(["trips.price_override.v2", i.unitId, i.departureId, i.itemRef, i.unitMinor, i.resolvedMinor, i.qty]))}`;
}

// ═══════════════════════ error ที่ไม่คาดคิด (R10 · S8) ═══════════════════════
let unexpectedCount = 0;
/** จำนวนผล BUSY reason UNEXPECTED ของกระบวนการนี้ (ให้ข้อสอบตรวจว่าเป็น 0 ตลอดการรัน · S8) */
export function tripsUnexpectedCount(): number {
  return unexpectedCount;
}
/** บันทึก ops: ชื่อ + ข้อความ + stack ของ error (ตัดความยาว) — ไม่มีอินพุตของผู้เรียก (ไม่มีข้อมูลบุคคล) */
async function logUnexpected(where: string, e: unknown, tenantId: string | null): Promise<void> {
  const name = e instanceof Error ? e.name || "Error" : typeof e;
  const message = e instanceof Error ? e.message.slice(0, 500) : String(e).slice(0, 200);
  const stack = e instanceof Error && e.stack ? e.stack.split("\n").slice(0, 8).join("\n").slice(0, 1500) : null;
  await logOps("ERROR", "trips.booking", `ข้อผิดพลาดที่ไม่คาดคิดใน ${where} (${name})`, { tenantId: tenantId ?? undefined, detail: JSON.stringify({ where, name, message, stack }) }).catch(() => undefined);
}
/** ห่อบริการ: CapacityAbort/PricingAbort ⇒ ผลมีชื่อ · อื่น ⇒ บันทึก ops (ไม่มีข้อมูลบุคคล) แล้ว BUSY — ไม่มี error ดิบหลุดถึงผู้เรียก */
async function safely<T>(where: string, ctx: unknown, fn: () => Promise<SellResult<T>>): Promise<SellResult<T>> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof CapacityAbort) return sellFail(e.code, e.details);
    if (e instanceof PricingAbort) return sellFail(e.code, e.details);
    unexpectedCount++;
    await logUnexpected(where, e, isRec(ctx) && typeof ctx.tenantId === "string" ? ctx.tenantId : null);
    return sellFail("BUSY", { reason: "UNEXPECTED" });
  }
}

// ═══════════════════════ ธุรกรรม ═══════════════════════
/** ชื่อ unique constraint ที่ชน (23505/P2002) ในสาย error · ไม่ใช่ unique ⇒ null */
function uniqueViolationOf(e: unknown): { name: string } | null {
  const seen = new Set<unknown>();
  const stack: unknown[] = [e];
  let depth = 0;
  let hit = false;
  const names: string[] = [];
  while (stack.length && depth++ < 64) {
    const cur = stack.pop();
    if (!cur || typeof cur !== "object" || seen.has(cur)) continue;
    seen.add(cur);
    const o = cur as Record<string, unknown>;
    if (o.code === "23505" || o.code === "P2002" || o.originalCode === "23505") hit = true;
    for (const v of Object.values(o)) {
      if (typeof v === "string") {
        if (/duplicate key value|Unique constraint failed/i.test(v)) hit = true;
        for (const m of v.matchAll(/"([A-Za-z]+_[A-Za-z_]+_key)"/g)) names.push(m[1]);
      } else if (Array.isArray(v)) names.push(v.filter((x) => typeof x === "string").join(","));
      else if (v && typeof v === "object") stack.push(v);
    }
  }
  return hit ? { name: names.join("|") } : null;
}
const IDEM_CONSTRAINTS = /SellBasket_tenantId_idempotencyKey_key|TripHold_tenantId_idempotencyKey_key|^tenantId,idempotencyKey$|\|tenantId,idempotencyKey/;
const TOKEN_CONSTRAINT = /SellBasket_publicTokenHash_key/;
/**
 * runTx ของ T0.4 (ลองใหม่เมื่อ 40P01 · CapacityAbort ⇒ SellResult) + PricingAbort ⇒ BookingAbort
 * unique ชน: คีย์กันซ้ำ ⇒ IDEMPOTENCY_CONFLICT · token ตะกร้า ⇒ VALIDATION BASKET_TOKEN_USED · อื่น ⇒ ลองใหม่ แล้ว BUSY + ops (R12)
 */
async function runBooking<T>(g: Gate, fn: (tx: Tx) => Promise<T>): Promise<SellResult<T>> {
  for (let attempt = 0; ; attempt++) {
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
      const u = uniqueViolationOf(e);
      if (!u) throw e;
      if (IDEM_CONSTRAINTS.test(u.name)) return sellFail("IDEMPOTENCY_CONFLICT");
      if (TOKEN_CONSTRAINT.test(u.name)) return sellFail("VALIDATION", { reason: "BASKET_TOKEN_USED" });
      if (attempt < LOCK_RETRIES) continue;
      await logOps("ERROR", "trips.booking", "unique constraint ชนซ้ำหลังลองใหม่ (ไม่ใช่คีย์กันซ้ำ)", { tenantId: g.tenantId, detail: JSON.stringify({ unitId: g.unitId, constraint: u.name.slice(0, 200) }) }).catch(() => undefined);
      return sellFail("BUSY", { reason: "UNIQUE_CONFLICT" });
    }
  }
}

// ═══════════════════════ ctx · ตัวช่วยนอก tx ═══════════════════════
/** SellCtx ที่ใช้ตลอดคำขอ (นาฬิกาเดียว = ctx.now) — เรียกราคา/snapshot/*InTx ด้วยตัวนี้ตัวเดียว */
function sellCtxOf(c: Ctx, raw: unknown): SellCtx {
  const locale = isRec(raw) && (raw.locale === "th" || raw.locale === "en") ? raw.locale : undefined;
  return { tenantId: c.tenantId, unitId: c.unitId, channel: c.channel, actor: c.actor, now: c.clock.now, ...(locale ? { locale } : {}) };
}
const isPublicActor = (a: SellActor) => a.kind === "PUBLIC";
const actorIdOf = (a: SellActor) => (a.kind === "STAFF" ? a.userId : a.kind === "PUBLIC" ? a.clientKey : a.kind === "SYSTEM" ? a.job : a.agentUserId);
/** คีย์กันซ้ำตาม namespace ของผู้เรียก (CC §C ข้อ 3) + หน่วย (R12: ผูก tenant+unit) */
const nsKey = (c: Ctx, key: string, tokenHash: string | null) => `${idemKeyFor(c.actor, key, tokenHash ?? undefined)}@${c.unitId}`;

/** บรรทัดต้องเป็น TRIP ของหน่วยนี้ (ตะกร้าข้ามหน่วย/ข้ามชนิด = K1.1) */
function linesGate(c: Ctx, lines: readonly LineInput[]): Failure | null {
  for (const l of lines) {
    if (l.productKind !== "TRIP") return sellFail("KIND_NOT_SUPPORTED");
    if (l.unitId !== c.unitId) return NF();
  }
  return null;
}
type OverrideReq = { priceOverrides?: OverrideInput[]; overrideApprovals?: ApprovalInput[] };
/** ราคาแก้มือต้องมี canOverride (จาก action) · คำอนุมัติทุกตัวต้องมี resolvedMinor (มติ §16 ข้อ 3) · คำอนุมัติโดยไม่มีราคาแก้มือ ⇒ VALIDATION */
function overrideGate(req: OverrideReq, opts: BookingOpts | undefined, actorKind: SellActor["kind"]): Failure | null {
  // S2: ราคาแก้มือเป็นงานของพนักงานเท่านั้น (ผู้กระทำอื่น ⇒ FORBIDDEN แม้ส่ง canOverride มา)
  if (req.priceOverrides?.length && (opts?.canOverride !== true || actorKind !== "STAFF")) return sellFail("FORBIDDEN");
  if (req.overrideApprovals?.length && !req.priceOverrides?.length) return sellFail("VALIDATION", { fields: ["overrideApprovals"] });
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
/** รายการที่คิดราคาแล้วของบรรทัด (ราคาตั้งต้น ไม่มีราคาแก้มือ) — จำนวนของ itemRef ไม่ขึ้นกับราคาที่แก้ */
async function baseItemsOf(sc: SellCtx, line: LineInput): Promise<{ itemRef: string; qty: number }[] | null> {
  const r = await quoteTripLine(sc, { ...line, productKind: "TRIP" }, {});
  return r.ok ? r.value.items.map((x) => ({ itemRef: x.itemRef, qty: x.qty })) : null;
}
/**
 * คำอนุมัติราคาแก้มือ (มติ R1 + S3 · นอก tx): ราคาแก้มือใช้กับทุกบรรทัดที่มี itemRef นั้น ⇒ itemRef ที่มีคำอนุมัติต้องอยู่ในบรรทัดเดียวของคำขอ
 * (มากกว่าหนึ่ง ⇒ VALIDATION APPROVAL_MULTI_LINE · ไม่มีเลย ⇒ VALIDATION) · ทุกตัวต้อง APPROVED · entityType trips.price_override · หน่วยเดียวกัน (ถ้าระบุ) ·
 * entityId = tripPriceOverrideEntityId(หน่วย, รอบของบรรทัด, itemRef, unitMinor, resolvedMinor, qty ของ itemRef ในบรรทัด) · ยอด (amountSatang) ถ้ามี = unitMinor × qty
 * การใช้ครั้งเดียว: ตรวจใน tx (consumeApprovalsInTx) · ไม่ผ่าน ⇒ FORBIDDEN APPROVAL_NOT_APPROVED
 */
async function approvalsGate(c: Ctx, sc: SellCtx, req: OverrideReq, lines: readonly LineInput[]): Promise<Failure | null> {
  const aps = req.overrideApprovals ?? [];
  if (!aps.length) return null;
  const itemsOf: ({ itemRef: string; qty: number }[] | null)[] = [];
  for (const l of lines) itemsOf.push(await baseItemsOf(sc, l));
  const b = await requestBindings({ tenantId: c.tenantId }, aps.map((a) => a.approvalId));
  for (const a of aps) {
    const hits = lines.map((l, i) => ({ l, it: itemsOf[i]?.find((x) => x.itemRef === a.itemRef) })).filter((x) => x.it);
    if (hits.length > 1) return sellFail("VALIDATION", { fields: ["overrideApprovals"], reason: "APPROVAL_MULTI_LINE" });
    const hit = hits[0];
    if (!hit?.it) return sellFail("VALIDATION", { fields: ["overrideApprovals"] });
    const qty = hit.it.qty;
    const x = b[a.approvalId];
    const want = tripPriceOverrideEntityId({ unitId: c.unitId, departureId: hit.l.slotId, itemRef: a.itemRef, unitMinor: a.unitMinor, resolvedMinor: a.resolvedMinor ?? -1, qty });
    if (
      !x ||
      x.status !== "APPROVED" ||
      x.entityType !== TRIP_PRICE_OVERRIDE_ENTITY ||
      x.entityId !== want ||
      (x.unitId !== null && x.unitId !== c.unitId) ||
      (x.amountSatang !== null && x.amountSatang !== a.unitMinor * qty)
    ) {
      return sellFail("FORBIDDEN", { reason: "APPROVAL_NOT_APPROVED" });
    }
  }
  return null;
}
/**
 * REQUIRES_APPROVAL ของ T0.5 + entityId/qty/departureId/unitMinor ที่จอต้องยื่น (S3) — หาบรรทัดที่ต้องอนุมัติ แล้วคิดจำนวนของ itemRef จากราคาตั้งต้น
 * (REQUIRES_APPROVAL ที่ได้จาก quoteTrips ของ T0.5 โดยตรงยังไม่มีช่องเหล่านี้ — จอต้องเรียกผ่านบริการการจอง หรือ tripPriceOverrideEntityId)
 */
async function withApprovalTarget(r: Failure, c: Ctx, sc: SellCtx, lines: readonly LineInput[], qopts: TripQuoteOpts): Promise<Failure> {
  if (r.code !== "REQUIRES_APPROVAL" || !r.details) return r;
  const d = r.details;
  if (typeof d.itemRef !== "string" || typeof d.resolvedMinor !== "number" || typeof d.requestedMinor !== "number") return r;
  for (const l of lines) {
    const one = await quoteTripLine(sc, { ...l, productKind: "TRIP" }, qopts);
    if (one.ok || one.code !== "REQUIRES_APPROVAL" || one.details?.itemRef !== d.itemRef) continue;
    const qty = (await baseItemsOf(sc, l))?.find((x) => x.itemRef === d.itemRef)?.qty;
    if (qty === undefined) return r;
    const entityId = tripPriceOverrideEntityId({ unitId: c.unitId, departureId: l.slotId, itemRef: d.itemRef, unitMinor: d.requestedMinor, resolvedMinor: d.resolvedMinor, qty });
    return { ...r, details: { ...d, entityId, qty, departureId: l.slotId, unitMinor: d.requestedMinor, amountSatang: d.requestedMinor * qty } };
  }
  return r;
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

/** ที่นั่งที่นับความจุต่อบรรทัดใหม่ (Σ qty ของประเภทคน countsCapacity · ทารกไม่นับ) — 0 หรือเกิน QTY_MAX ⇒ VALIDATION */
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
type ProductRef = { productId: string; optionId: string | null };
/** ตัวเลือกของแต่ละบรรทัด = ตัวเลือกของรอบ (หรือของบรรทัดเมื่อรอบไม่ระบุ) — ใช้ตรวจตัวเลือกเปิดในธุรกรรม (R8) */
async function productRefsOf(g: Gate, lines: readonly { productId: string; slotId: string; optionId?: string }[]): Promise<ProductRef[] | Failure> {
  const ids = [...new Set(lines.map((l) => l.slotId))];
  const rows = await unitDb(g).$queryRaw<{ id: string; productId: string; optionId: string | null }[]>`
    SELECT "id", "productId", "optionId" FROM "TripDeparture" WHERE "id" = ANY(${ids}::text[]) AND "tenantId" = ${g.tenantId} AND "unitId" = ${g.unitId}`;
  const byId = new Map(rows.map((r) => [r.id, r]));
  const out: ProductRef[] = [];
  for (const l of lines) {
    const d = byId.get(l.slotId);
    if (!d || d.productId !== l.productId) return NF();
    out.push({ productId: l.productId, optionId: d.optionId ?? l.optionId ?? null });
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
/** ชั้น 0: INSERT ตะกร้า OPEN · ชนคีย์/ token ⇒ false (ผู้เรียกตัดสิน) */
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
  const holdIds = rows.sort((a, z) => idx(a.idempotencyKey) - idx(z.idempotencyKey) || byStr(a.id, z.id)).map((r) => r.id);
  return { holdIds, basketId: b.id, expiresAt: new Date(b.expiresAt).toISOString() };
}

// ═══════════════════════ ล็อกชั้นสินค้า/รอบ ═══════════════════════
/** สินค้า (+ ตัวเลือกของบรรทัด · R8) FOR SHARE เรียง (สินค้า, ตัวเลือก) — หลังชั้น 0 ก่อนแตะรอบ (r2 §d ข้อ 2) */
async function lockProductsInTx(tx: Tx, sc: SellCtx, refs: readonly ProductRef[]): Promise<void> {
  const pub = isPublicActor(sc.actor);
  const uniq = new Map<string, ProductRef>();
  for (const r of refs) uniq.set(`${r.productId}\u0001${r.optionId ?? ""}`, r);
  for (const r of [...uniq.values()].sort((a, b) => byStr(a.productId, b.productId) || byStr(a.optionId ?? "", b.optionId ?? ""))) {
    try {
      const p = await assertProductSellableInTx(tx, { tenantId: sc.tenantId, unitId: sc.unitId, productId: r.productId, optionId: r.optionId });
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
  const order = lines.map((l, i) => ({ ...l, i })).sort((a, b) => byStr(a.departureId, b.departureId) || a.i - b.i);
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
/**
 * advisory lock ของ trips ในรูปสองอาร์กิวเมนต์ (int4, int4) — ไม่มีโมดูลใดใช้รูปนี้ (ทั้ง repo ใช้รูป bigint หนึ่งอาร์กิวเมนต์) ⇒ ไม่ชนกับคีย์ของโมดูลอื่น (S9)
 * classid = hashtext('trips.booking.v1') · objid = hashtext('<ชนิด>:<id>')
 */
const lockTripsKey = (tx: Tx, kind: "approval" | "change", id: string) =>
  tx.$queryRaw`SELECT 1 AS "locked" FROM pg_advisory_xact_lock(hashtext('trips.booking.v1'), hashtext(${`${kind}:${id}`}))`;
/** แถวบันทึกการใช้คำอนุมัติ (S4): action นี้ + targetId = approvalId — ค้นผ่าน index "AuditLog_action_idx" (action เป็นของการใช้คำอนุมัติอย่างเดียว) */
const APPROVAL_CONSUMED = "trips.approval.consumed";
/**
 * คำอนุมัติราคาแก้มือใช้ได้ครั้งเดียว (มติ R1 · S4): advisory ต่อ id (เรียง) แล้วหาแถว trips.approval.consumed ของ id นี้ — มี ⇒ FORBIDDEN APPROVAL_USED
 * แล้วเขียนแถวนั้นทันที (ทุกผู้กระทำ · ไม่ผ่าน auditBooking ที่ข้าม PUBLIC/AGENT · S2) — ล็อกอยู่ถึงจบ tx ⇒ สองการจองพร้อมกันได้ตัวเดียว
 */
async function consumeApprovalsInTx(tx: Tx, a: AuditActor, approvalIds: readonly string[], bookingIds: readonly string[]): Promise<void> {
  for (const id of [...new Set(approvalIds)].sort()) {
    await lockTripsKey(tx, "approval", id);
    const used = await tx.$queryRaw<{ id: string }[]>`
      SELECT "id" FROM "AuditLog" WHERE "action" = ${APPROVAL_CONSUMED} AND "tenantId" = ${a.tenantId} AND "targetId" = ${id} LIMIT 1`;
    if (used.length) throw new BookingAbort("FORBIDDEN", { reason: "APPROVAL_USED" });
    await tx.auditLog.create({
      data: {
        tenantId: a.tenantId,
        unitId: a.unitId,
        actorType: a.actor.kind === "STAFF" ? "USER" : "SYSTEM",
        actorId: a.actor.kind === "STAFF" ? a.actor.userId : null,
        action: APPROVAL_CONSUMED,
        targetType: "ApprovalRequest",
        targetId: id,
        after: { bookingIds: [...bookingIds].sort().join(",") },
      },
    });
  }
}

// ═══════════════════════ ถือผ่านตะกร้า (ใบสั่ง §5.3) ═══════════════════════
/**
 * tripSellable.hold — นอก tx: ตรวจรูป → กันซ้ำ → ราคาเดิม (quoteId · เวลาหมดของใบเสนอราคา) → แถวเฟส 1 + ค่าตั้ง
 * tx: ชั้น 0 INSERT SellBasket → (PUBLIC) acquireHoldCapInTx ของตะกร้า → สินค้า+ตัวเลือกเรียง → reserveInTx(HOLD) ตามรอบ → insertHoldInTx ต่อบรรทัด
 * หมายเหตุ (R12): คีย์ของการถือถูกแทนด้วยคีย์ยืนยันตอน CHECKED_OUT (ไม่มีคอลัมน์เก็บคู่) ⇒ ถือซ้ำหลังยืนยันแล้ว: PUBLIC = VALIDATION BASKET_TOKEN_USED · STAFF = IDEMPOTENCY_CONFLICT
 */
export async function holdTrips(ctx: unknown, input: unknown, opts?: BookingOpts): Promise<SellResult<Hold>> {
  return safely("holdTrips", ctx, () => holdTripsImpl(ctx, input, opts));
}
async function holdTripsImpl(ctx: unknown, input: unknown, opts?: BookingOpts): Promise<SellResult<Hold>> {
  const pc = parseCtx(ctx);
  if (!pc.ok) return pc;
  const c = pc.c;
  if (c.actor.kind === "SYSTEM") return sellFail("FORBIDDEN");
  const p = holdRequestSchema.safeParse(input);
  if (!p.success) return invalidInput(p.error);
  const req = p.data;
  const pub = c.actor.kind === "PUBLIC";
  if (pub && !req.basketToken) return sellFail("VALIDATION", { fields: ["basketToken"] });
  const lg = linesGate(c, req.quote.lines) ?? overrideGate(req, opts, c.actor.kind);
  if (lg) return lg;
  if (!tokenSecret()) return keyMissing();
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
  if (!fresh.ok) return withApprovalTarget(fresh, c, sc, req.quote.lines, qopts);
  if (c.clock.now.getTime() > Date.parse(req.quoteExpiresAt)) return priceChanged(fresh.value, "QUOTE_EXPIRED");
  if (fresh.value.quoteId !== req.quoteId) return priceChanged(fresh.value);
  const ag = await approvalsGate(c, sc, req, req.quote.lines);
  if (ag) return ag;
  const seats = await seatsOfLines(g, req.quote.lines);
  if (!Array.isArray(seats)) return seats;
  const refs = await productRefsOf(g, req.quote.lines);
  if (!Array.isArray(refs)) return refs;
  const policies = await policiesOfLines(sc, req.quote.lines);
  if ("ok" in policies) return policies;
  const lines = req.quote.lines.map((l, i) => ({ departureId: l.slotId, qty: seats[i], key: `${req.idempotencyKey}_${i}` }));
  const expiresAt = new Date(Math.max(...lines.map((l) => holdExpiry(policies, l.departureId, "PAYMENT", c.clock.now).getTime())));
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
    await lockProductsInTx(tx, sc, refs);
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
  readonly index: number;
  readonly bookingId: string;
  readonly productId: string;
  readonly optionId: string | null;
  readonly departureId: string;
  readonly seats: number;
  readonly snapshot: TripsBookingSnapshot;
  readonly status: BookingStatus;
  readonly holdMode: InitialHoldMode;
  readonly prefix: string;
  readonly passengers: readonly { name: string; paxTypeId: string }[];
  readonly promo: { ruleId: string; discountSatang: number } | null;
  readonly holdId: string | null;
};
/** ผลของการเตรียมยืนยัน — ออกโดยโมดูลนี้เท่านั้น (WeakSet · แช่แข็ง · R4) · finalizeTripsInTx ไม่รับก้อนที่สร้างเอง */
export type PreparedConfirm = {
  readonly kind: "trips.confirm.v1";
  readonly tenantId: string;
  readonly unitId: string;
  readonly channel: string;
  readonly actorKind: SellActor["kind"];
  readonly actorId: string;
  readonly basketId: string;
  readonly basketKey: string;
  readonly requestHash: string;
  readonly tokenHash: string | null;
  readonly contactKey: string | null;
  readonly bookerPartyId: string;
  readonly payMethod: "PAY_NOW" | "PAY_LATER";
  readonly approvalIds: readonly string[];
  readonly onExpired: "FAIL" | "REHOLD";
  readonly lines: readonly PreparedLine[];
  readonly policies: CapacityPolicies;
};
const SEALED = new WeakSet<object>();
function deepFreeze<T>(v: T): T {
  if (v && typeof v === "object" && !Object.isFrozen(v)) {
    Object.freeze(v);
    for (const x of Object.values(v as Record<string, unknown>)) deepFreeze(x);
  }
  return v;
}
function seal(P: PreparedConfirm): PreparedConfirm {
  const frozen = deepFreeze(structuredClone(P));
  SEALED.add(frozen);
  return frozen;
}

type CoreReq = OverrideReq & {
  quote: QuoteRequestInput;
  quoteId: string;
  booker: { name: string; phone?: string; email?: string; lineUserId?: string; partyId?: string };
  passengers?: { name: string; paxTypeId: string }[];
  pay: { method: "PAY_NOW" | "PAY_LATER" | "WALLET" | "CREDIT" };
};
type CoreOut = { ok: true; lines: Omit<PreparedLine, "holdId">[]; contactKey: string | null; bookerPartyId: string; payMethod: "PAY_NOW" | "PAY_LATER" };

/** ส่วนร่วมของ confirm/bookNow นอก tx: ราคา (quoteId) → คำอนุมัติ → snapshot ต่อบรรทัด → ค่าตั้ง X1/X3 → สถานะแรก → ผู้เดินทาง → ผู้จอง (Party) */
async function prepareCore(
  c: Ctx,
  sc: SellCtx,
  g: Gate,
  req: CoreReq,
  opts: BookingOpts | undefined,
  extra: { quoteExpiresAt?: string; policies: CapacityPolicies; refs: readonly ProductRef[] },
): Promise<CoreOut | Failure> {
  const lg = linesGate(c, req.quote.lines) ?? overrideGate(req, opts, c.actor.kind);
  if (lg) return lg;
  const contactKey = contactKeyOf(req.booker);
  const pub = c.actor.kind === "PUBLIC";
  if (!contactKey && (pub || req.quote.lines.some((l) => l.promoCode))) return sellFail("VALIDATION", { reason: "CONTACT_REQUIRED" });
  const qopts = quoteOptsOf(req, opts);
  const fresh = await quoteTrips(sc, req.quote as QuoteRequest, qopts);
  if (!fresh.ok) return withApprovalTarget(fresh, c, sc, req.quote.lines, qopts);
  if (extra.quoteExpiresAt !== undefined && c.clock.now.getTime() > Date.parse(extra.quoteExpiresAt)) return priceChanged(fresh.value, "QUOTE_EXPIRED");
  if (fresh.value.quoteId !== req.quoteId) return priceChanged(fresh.value);
  const ag = await approvalsGate(c, sc, req, req.quote.lines);
  if (ag) return ag;
  // snapshot ต่อบรรทัด (ยอดที่จด/ตัดโค้ด มาจากที่นี่เท่านั้น)
  const qLines = fresh.value.lines as TripQuoteLine[];
  const snaps: TripsBookingSnapshot[] = [];
  for (let i = 0; i < req.quote.lines.length; i++) {
    const ql = qLines[i];
    if (!ql) return priceChanged(fresh.value);
    const s = await buildTripBookingSnapshot(sc, { ...req.quote.lines[i], productKind: "TRIP" }, { quotedFingerprint: ql.fingerprint, policyAt: ql.policyAt }, lineOptsOf(req.quote, qopts));
    if (!s.ok) return s.code === "PRICE_CHANGED" ? priceChanged(fresh.value) : s;
    // แต้ม/คูปองของผู้ให้บริการ (X.2) ยังไม่ต่อสาย — ห้ามให้ส่วนลดที่ไม่ได้ตัดจริง (review m13)
    if ((s.value.providers ?? []).length > 0) return sellFail("VALIDATION", { reason: "PROVIDERS_NOT_WIRED" });
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
  const seatLeft = snaps.map((s) => seatsByPaxType(s));
  const paxOf: { name: string; paxTypeId: string }[][] = snaps.map(() => []);
  for (const p of req.passengers ?? []) {
    const i = seatLeft.findIndex((m) => (m[p.paxTypeId] ?? 0) > 0);
    if (i < 0) return sellFail("VALIDATION", { reason: "TOO_MANY_PASSENGERS" });
    seatLeft[i][p.paxTypeId] -= 1;
    paxOf[i].push({ name: p.name, paxTypeId: p.paxTypeId });
  }
  const bookingPrefix = `tb${randomBytes(10).toString("hex")}`;
  const lines: Omit<PreparedLine, "holdId">[] = [];
  for (let i = 0; i < snaps.length; i++) {
    const s = snaps[i];
    if (!bookingColumnsFromSnapshot(s as unknown as SnapshotShape)) return sellFail("VALIDATION", { reason: "SNAPSHOT_INVALID" });
    const set = settingsOf.get(req.quote.lines[i].productId);
    if (!set) return sellFail("VALIDATION", { reason: "SETTINGS_INVALID" });
    const st = initialBookingStatus({ actorKind: c.actor.kind, payMethod: req.pay.method, confirmMode: set.confirmMode, dueNowSatang: dueNowOfSnapshot(s as unknown as SnapshotShape) });
    if (!st.ok) return sellFail(st.code, { reason: st.reason });
    lines.push({
      index: i,
      bookingId: `${bookingPrefix}${String(i).padStart(2, "0")}`,
      productId: req.quote.lines[i].productId,
      optionId: extra.refs[i]?.optionId ?? null,
      departureId: req.quote.lines[i].slotId,
      seats: seatsOfSnapshot(s as unknown as SnapshotShape),
      snapshot: s,
      status: st.status,
      holdMode: st.hold,
      prefix: set.prefix,
      passengers: paxOf[i],
      promo: s.promo && s.promo.discountSatang > 0 ? { ruleId: s.promo.ruleId, discountSatang: s.promo.discountSatang } : null,
    });
  }
  for (const l of lines) if (!extra.policies.departures[l.departureId]) return NF();
  // ผู้จอง = Party ของร้าน (นอก tx · ซ้ำได้ไม่เพิ่มแถว) — STAFF ส่ง partyId ของร้านตัวเองได้ · หา/สร้างไม่ได้ ⇒ ล้ม (ห้ามการจองไม่มีผู้จอง · R10)
  let bookerPartyId: string | null;
  if (c.actor.kind === "STAFF" && req.booker.partyId) {
    const party = await tenantDb({ tenantId: c.tenantId }).party.findFirst({ where: { id: req.booker.partyId, tenantId: c.tenantId }, select: { id: true } });
    if (!party) return NF();
    bookerPartyId = party.id;
  } else {
    bookerPartyId = await safeFindOrCreate(c.tenantId, { name: req.booker.name, phone: req.booker.phone ?? null, email: req.booker.email ?? null });
  }
  if (!bookerPartyId) return sellFail("BUSY", { reason: "BOOKER_UNAVAILABLE" });
  return { ok: true, lines, contactKey, bookerPartyId, payMethod: req.pay.method === "PAY_LATER" ? "PAY_LATER" : "PAY_NOW" };
}
/** ที่นั่งต่อประเภทคนของ snapshot (SEAT ทุกประเภท — ผู้เดินทางทารกผูกที่นั่งทารกได้) */
function seatsByPaxType(s: TripsBookingSnapshot): Record<string, number> {
  const m: Record<string, number> = {};
  for (const l of s.lines) {
    const pt = (l as { paxTypeId?: unknown }).paxTypeId;
    if (l.kind === "SEAT" && typeof pt === "string") m[pt] = (m[pt] ?? 0) + l.qty;
  }
  return m;
}

type ConfirmPrep = { replay: BookingRef[] } | { prepared: PreparedConfirm; c: Ctx; sc: SellCtx; g: Gate; quote: QuoteRequestInput; qopts: TripQuoteOpts };

/** ตะกร้าของคีย์นี้มีอยู่แล้ว: CHECKED_OUT + แฮชเดิม = ผลเดิม · แฮชต่าง/ตะกร้ายัง OPEN (คีย์ถูกใช้กับคำขออื่น) = IDEMPOTENCY_CONFLICT (R12) */
async function replayByKey(g: Gate, b: BasketRow, requestHash: string): Promise<SellResult<BookingRef[]>> {
  if (b.status === "CHECKED_OUT" && b.requestHash === requestHash) return refsOfBasket(g, b.id);
  return sellFail("IDEMPOTENCY_CONFLICT");
}

/**
 * ส่วนนอก tx ของการยืนยัน (ให้ K1.1 ประกอบตะกร้าข้ามชนิดได้) — คืน `prepared` (แช่แข็ง · ลงทะเบียนในโมดูล) ที่ finalizeTripsInTx ใช้ หรือผลเดิม (กันซ้ำ)
 * ตะกร้า/ token ผิด ⇒ HOLD_NOT_FOUND · บรรทัดไม่ตรง hold ⇒ VALIDATION HOLD_MISMATCH · ราคาไม่ตรง ⇒ PRICE_CHANGED + ใบใหม่
 */
export async function prepareTripConfirm(ctx: unknown, input: unknown, opts?: BookingOpts): Promise<SellResult<ConfirmPrep>> {
  return safely("prepareTripConfirm", ctx, () => prepareTripConfirmImpl(ctx, input, opts));
}
async function prepareTripConfirmImpl(ctx: unknown, input: unknown, opts?: BookingOpts): Promise<SellResult<ConfirmPrep>> {
  const pc = parseCtx(ctx);
  if (!pc.ok) return pc;
  const c = pc.c;
  if (c.actor.kind === "SYSTEM") return sellFail("FORBIDDEN");
  const p = confirmRequestSchema.safeParse(input);
  if (!p.success) return invalidInput(p.error);
  const req = p.data;
  const pub = c.actor.kind === "PUBLIC";
  if (pub && !req.basketToken) return sellFail("VALIDATION", { fields: ["basketToken"] });
  if (pub && req.onExpired === "REHOLD") return sellFail("VALIDATION", { fields: ["onExpired"] });
  if (!tokenSecret()) return keyMissing();
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
    onExpired: req.onExpired ?? "FAIL",
    priceOverrides: req.priceOverrides ?? null,
    overrideApprovals: req.overrideApprovals ?? null,
  });
  if (b.status !== "OPEN") {
    if (b.status === "CHECKED_OUT" && b.idempotencyKey === key) {
      const r = await replayByKey(g, b, requestHash);
      return r.ok ? { ok: true, value: { replay: r.value } } : r;
    }
    return sellFail("STATE_CONFLICT", { reason: "BASKET_CHECKED_OUT" });
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
  const refs = await productRefsOf(g, req.quote.lines);
  if (!Array.isArray(refs)) return refs;
  const sc = sellCtxOf(c, ctx);
  const policies = await loadCapacityPolicies(sc, { departureIds: [...new Set(req.quote.lines.map((l) => l.slotId))] });
  if (!policies.ok) return policies;
  const core = await prepareCore(c, sc, g, req, opts, { policies: policies.value, refs });
  if (!core.ok) return core;
  for (const l of core.lines) if (l.seats !== seats[l.index]) return sellFail("VALIDATION", { reason: "HOLD_MISMATCH" });
  const prepared = seal({
    kind: "trips.confirm.v1",
    tenantId: c.tenantId,
    unitId: c.unitId,
    channel: c.channel,
    actorKind: c.actor.kind,
    actorId: actorIdOf(c.actor),
    basketId: b.id,
    basketKey: key,
    requestHash,
    tokenHash,
    contactKey: core.contactKey,
    bookerPartyId: core.bookerPartyId,
    payMethod: core.payMethod,
    approvalIds: (req.overrideApprovals ?? []).map((a) => a.approvalId),
    onExpired: req.onExpired ?? "FAIL",
    lines: core.lines.map((l) => ({ ...l, holdId: req.holdIds[l.index] })),
    policies: policies.value,
  });
  return { ok: true, value: { prepared, c, sc, g, quote: req.quote, qopts: quoteOptsOf(req, opts) } };
}

// ═══════════════════════ ยืนยัน (ใบสั่ง §5.4) ═══════════════════════
type TxOut = { replay: true } | { refs: BookingRef[] };
/** ชั้น 0 ของการยืนยัน: ตะกร้า FOR UPDATE (ไม่ OPEN ⇒ กันซ้ำ §5.5) */
async function lockOpenBasket(tx: Tx, P: PreparedConfirm): Promise<{ replay: true } | null> {
  const b = await basketById(tx, P.tenantId, P.basketId, true);
  if (!b || !b.unitIds.includes(P.unitId) || (P.tokenHash !== null && b.publicTokenHash !== P.tokenHash)) throw new BookingAbort("HOLD_NOT_FOUND");
  if (b.status === "OPEN") return null;
  if (b.status === "CHECKED_OUT" && b.idempotencyKey === P.basketKey) {
    if (b.requestHash === P.requestHash) return { replay: true };
    throw new BookingAbort("IDEMPOTENCY_CONFLICT");
  }
  throw new BookingAbort("STATE_CONFLICT", { reason: "BASKET_CHECKED_OUT" });
}
async function confirmTx(tx: Tx, c: Ctx, sc: SellCtx, P: PreparedConfirm, mode: "FAIL" | "REHOLD"): Promise<TxOut> {
  if (await lockOpenBasket(tx, P)) return { replay: true };
  const pub = isPublicActor(sc.actor);
  const refs = P.lines.map((l) => ({ productId: l.productId, optionId: l.optionId }));
  let holdIds = P.lines.map((l) => l.holdId ?? "");
  if (mode === "FAIL") {
    if (pub) {
      if (!P.contactKey) throw new BookingAbort("VALIDATION", { reason: "CONTACT_REQUIRED" });
      // ชั้น 0 (มติ: rekey ก่อนแปลงเสมอ · r2 §d ข้อ 3) — ⚠️ T0.7: rekey UPDATE แถว TripHold ก่อนล็อกรอบ 1a ขณะที่ตัวกวาด (sweepDeparturesTx)
      //   ล็อกรอบก่อนแล้วจึง UPDATE hold เดียวกัน ⇒ ลำดับสลับทางทฤษฎี (ยืนยันสาธารณะ ณ เวลาหมด ∥ runExpireHolds) — ผู้ล่ายิง 600 ครั้งไม่พบ 40P01
      //   (review m1 / hunt S1) · ถ้าเกิด runTx ลองใหม่ (ไม่ใช่ข้อมูลเสีย) — ใบที่แก้ลำดับต้องย้าย rekey ไปหลัง 1a พร้อมมติผู้คุม
      await rekeyHoldsToContactInTx(tx, sc, { holdIds, contactKey: `contact:${P.contactKey}` }, P.policies);
    }
    await lockProductsInTx(tx, sc, refs);
    await lockDeparturesInTx(tx, sc, P.lines.map((l) => l.departureId));
  } else {
    // REHOLD (ธุรกรรมใหม่ · STAFF): สินค้า → 1a → ปล่อย hold เก่าที่ยัง ACTIVE → reserveInTx(HOLD) → insertHoldInTx (rh_<holdIdเดิม>)
    await lockProductsInTx(tx, sc, refs);
    await lockDeparturesInTx(tx, sc, P.lines.map((l) => l.departureId));
    for (const l of [...P.lines].sort((a, b) => byStr(a.departureId, b.departureId))) {
      const cur = await tx.$queryRaw<{ status: string }[]>`SELECT "status" FROM "TripHold" WHERE "id" = ${l.holdId ?? ""} AND "tenantId" = ${P.tenantId} AND "unitId" = ${P.unitId}`;
      if (cur[0]?.status === "ACTIVE") await releaseHoldInTx(tx, sc, { holdId: l.holdId ?? "", reason: "REHOLD" }, P.policies);
    }
    await reserveHoldsInTx(tx, sc, P.lines.map((l) => ({ departureId: l.departureId, qty: l.seats })), P.policies, null);
    holdIds = await insertHoldsInTx(tx, sc, P.lines.map((l) => ({ departureId: l.departureId, qty: l.seats, key: `rh_${l.holdId ?? ""}`.slice(0, 100) })), P.basketId, P.policies, null);
  }
  return { refs: await finalizeCoreInTx(tx, c, P, holdIds) };
}

/** ผลของธุรกรรมยืนยัน → SellResult (replay อ่านผลเดิม · โค้ดตัดสิทธิ์ไม่ผ่าน ⇒ PRICE_CHANGED + ใบใหม่ไม่มีโค้ด) */
async function finishConfirm(r: SellResult<TxOut>, g: Gate, basketId: string, sc: SellCtx, quote: QuoteRequestInput, qopts: TripQuoteOpts): Promise<SellResult<BookingRef[]>> {
  if (!r.ok) {
    const reason = typeof r.details?.reason === "string" ? r.details.reason : "";
    if (PROMO_REASONS.has(reason)) return promoFailure(sc, quote, qopts, reason);
    return r;
  }
  if ("replay" in r.value) return refsOfBasket(g, basketId);
  return { ok: true, value: r.value.refs };
}

/** tripSellable.confirm — ยืนยันการจองจากตะกร้าที่ถือไว้ในธุรกรรมเดียว (ลำดับ §5.4) */
export async function confirmTrips(ctx: unknown, input: unknown, opts?: BookingOpts): Promise<SellResult<BookingRef[]>> {
  return safely("confirmTrips", ctx, async () => {
    const prep = await prepareTripConfirmImpl(ctx, input, opts);
    if (!prep.ok) return prep;
    if ("replay" in prep.value) return { ok: true, value: prep.value.replay };
    const { prepared: P, c, sc, g, quote, qopts } = prep.value;
    let r = await runBooking(g, (tx) => confirmTx(tx, c, sc, P, "FAIL"));
    if (!r.ok && r.code === "HOLD_EXPIRED" && P.onExpired === "REHOLD" && c.actor.kind === "STAFF") r = await runBooking(g, (tx) => confirmTx(tx, c, sc, P, "REHOLD"));
    return finishConfirm(r, g, P.basketId, sc, quote, qopts);
  });
}

// ═══════════════════════ แกนในธุรกรรม (ข้อ 4–7 ของ §5.4) ═══════════════════════
type InsertedBooking = { line: PreparedLine; code: string; token: string; items: BookingItemColumns[] };
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
type AuditVal = Record<string, string | number | boolean | null>;
/** audit ใน tx เดียวกัน (STAFF/SYSTEM · ไม่มีข้อมูลบุคคล) */
async function auditBooking(tx: Tx, a: AuditActor, action: string, targetId: string, after: AuditVal, before?: AuditVal) {
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

/**
 * แกนข้อ 4–7 ของ §5.4 ในธุรกรรมของผู้เรียก (ให้ K1.1 ประกอบตะกร้าข้ามชนิด) — ผู้เรียกทำชั้น 0 (ตะกร้า · rekey) + สินค้า + 1a มาแล้ว
 * `req.prepared` ต้องเป็นก้อนที่ prepareTripConfirm ของกระบวนการนี้ออกให้ (แช่แข็ง · ลงทะเบียน · R4) และผู้กระทำ/ร้าน/หน่วย/ตะกร้าตรงกับ ctx
 * ปฏิเสธ ⇒ throw BookingAbort/CapacityAbort/PricingAbort
 */
export async function finalizeTripsInTx(tx: unknown, ctx: unknown, reservations: unknown, req: unknown): Promise<SellResult<{ holds?: Hold; bookings: BookingRef[]; ledger: LedgerDraft[] }>> {
  const pc = parseCtx(ctx);
  if (!pc.ok) throw new BookingAbort(pc.code, pc.details);
  const c = pc.c;
  const P = isRec(req) ? req.prepared : undefined;
  if (!isRec(P) || !SEALED.has(P) || !Array.isArray(reservations)) throw new BookingAbort("VALIDATION", { reason: "PREPARED_REQUIRED" });
  const prepared = P as unknown as PreparedConfirm;
  if (prepared.tenantId !== c.tenantId || prepared.unitId !== c.unitId || prepared.actorKind !== c.actor.kind || prepared.actorId !== actorIdOf(c.actor) || (isRec(req) ? req.basketId : undefined) !== prepared.basketId) {
    throw new BookingAbort("VALIDATION", { reason: "PREPARED_REQUIRED" });
  }
  const holdIds = prepared.lines.map((l) => l.holdId ?? "");
  if (holdIds.some((h) => !h)) throw new BookingAbort("VALIDATION", { reason: "PREPARED_REQUIRED" });
  // S5: ผู้เรียกตรงต้องไม่จองบนสินค้า/ตัวเลือกที่ปิดแล้ว — ตรวจ (และล็อก FOR SHARE ซ้ำ ซึ่งไม่รอเมื่อถืออยู่แล้ว) ที่นี่เอง
  const sc: SellCtx = { tenantId: c.tenantId, unitId: c.unitId, channel: c.channel, actor: c.actor, now: c.clock.now };
  await lockProductsInTx(tx as Tx, sc, prepared.lines.map((l) => ({ productId: l.productId, optionId: l.optionId })));
  return { ok: true, value: { bookings: await finalizeCoreInTx(tx as Tx, c, prepared, holdIds), ledger: [] } };
}

/** แกนของ finalize (ภายในโมดูล) — holdIds ตามบรรทัด (REHOLD/จองหน้าร้านส่ง hold ที่เพิ่งสร้างใน tx นี้) · คอลัมน์เงินคำนวณใหม่จาก snapshot เสมอ */
async function finalizeCoreInTx(t: Tx, c: Ctx, P: PreparedConfirm, holdIds: readonly string[]): Promise<BookingRef[]> {
  const sc: SellCtx = { tenantId: c.tenantId, unitId: c.unitId, channel: c.channel, actor: c.actor, now: c.clock.now };
  const nowIso = c.clock.iso;
  const pub = c.actor.kind === "PUBLIC";
  const lines = P.lines.map((l, i) => ({ l, holdId: holdIds[i] ?? "" }));
  // 2a: ผูก hold กับการจอง ตามรอบเรียง id
  for (const { l, holdId } of [...lines].sort((a, b) => byStr(a.l.departureId, b.l.departureId) || byStr(a.holdId, b.holdId))) {
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
      const r = await convertHoldInTx(t, sc, { holdId, ...(pub && P.contactKey ? { capKey: `contact:${P.contactKey}` } : {}) }, { forBookingId: l.bookingId });
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
  // คำอนุมัติราคาแก้มือ: ใช้ได้ครั้งเดียว (R1)
  if (P.approvalIds.length) await consumeApprovalsInTx(t, { tenantId: c.tenantId, unitId: c.unitId, actor: c.actor }, P.approvalIds, P.lines.map((l) => l.bookingId));
  // 2c เลขจอง: จองเลขเรียง (prefix, งวด) ก่อน แล้วจึงคืนให้บรรทัด (R7 — แถว SellCounter ล็อกตามลำดับเดียวกันทุกตะกร้า)
  const codeOf = new Map<number, string>();
  const keyOf = (l: PreparedLine) => `${l.prefix}\u0001${bookingPeriodOf(l.snapshot.travel.localDate)}`;
  for (const l of [...P.lines].sort((a, b) => byStr(keyOf(a), keyOf(b)) || a.index - b.index)) {
    codeOf.set(l.index, await nextBookingCodeInTx(t, { tenantId: c.tenantId, prefix: l.prefix, localDate: l.snapshot.travel.localDate }));
  }
  // 2b การจอง + รายการ + ผู้เดินทาง (ตามลำดับบรรทัด) — คอลัมน์เงินคำนวณใหม่จาก snapshot (R4)
  const done: InsertedBooking[] = [];
  const staffId = c.actor.kind === "STAFF" ? c.actor.userId : null;
  for (const l of P.lines) {
    const cols = bookingColumnsFromSnapshot(l.snapshot as unknown as SnapshotShape);
    if (!cols) throw new BookingAbort("VALIDATION", { reason: "SNAPSHOT_INVALID" });
    const code = codeOf.get(l.index) ?? "";
    const token = bookingPublicToken(l.bookingId);
    if (!token) throw new BookingAbort("BUSY", { reason: "SERVER_KEY_MISSING" });
    const k = cols.booking;
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
    const itemIds = await insertItems(t, c.tenantId, c.unitId, l.bookingId, l.departureId, cols.items);
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
    done.push({ line: l, code, token, items: cols.items });
  }
  // โค้ดส่วนลดทั้งตะกร้าเรียง ruleId (แล้ว id การจอง) — ยอดจาก snapshot (R13)
  const redeems = done.filter((d) => d.line.promo).map((d) => ({ ruleId: d.line.promo?.ruleId ?? "", bookingId: d.line.bookingId, discountSatang: d.line.promo?.discountSatang ?? 0 }));
  if (redeems.length && !P.contactKey) throw new BookingAbort("VALIDATION", { reason: "CONTACT_REQUIRED" });
  for (const x of redeems.sort((a, b) => byStr(a.ruleId, b.ruleId) || byStr(a.bookingId, b.bookingId))) {
    await redeemPromosInTx(t, sc, { contactKey: P.contactKey ?? "", bookingId: x.bookingId, items: [{ ruleId: x.ruleId, discountSatang: x.discountSatang }] });
  }
  // 2h outbox + audit
  const evts: { tenantId: string; unitId: string; type: string; idempotencyKey: string; payload: Record<string, unknown> }[] = [];
  const a: AuditActor = { tenantId: c.tenantId, unitId: c.unitId, actor: c.actor };
  for (const d of done) {
    const payload = eventPayload({ id: d.line.bookingId, unitId: c.unitId, departureId: d.line.departureId, status: d.line.status, channel: c.channel, amountSatang: d.line.snapshot.totals.payableSatang });
    evts.push({ tenantId: c.tenantId, unitId: c.unitId, type: "trips.booking.created", idempotencyKey: `trips.booking.created:${d.line.bookingId}`, payload });
    if (d.line.status === "CONFIRMED") evts.push({ tenantId: c.tenantId, unitId: c.unitId, type: "trips.booking.confirmed", idempotencyKey: `trips.booking.confirmed:${d.line.bookingId}`, payload });
    await auditBooking(t, a, "trips.booking.create", d.line.bookingId, { status: d.line.status, departureId: d.line.departureId, seats: d.line.seats, grossSatang: d.line.snapshot.totals.grossSatang, payableSatang: d.line.snapshot.totals.payableSatang });
    if (P.approvalIds.length) {
      await auditBooking(t, a, "trips.booking.price_override", d.line.bookingId, { grossSatang: d.line.snapshot.totals.grossSatang, discountSatang: d.line.snapshot.totals.discountSatang, approvalIds: [...P.approvalIds].sort().join(",") });
    }
  }
  await emitOutboxMany(t, evts);
  // ตะกร้า OPEN → CHECKED_OUT (คีย์/แฮชของการยืนยันแทนของการถือ · §5.5)
  const co = await t.$queryRaw<{ id: string }[]>`
    UPDATE "SellBasket" SET "status" = 'CHECKED_OUT', "idempotencyKey" = ${P.basketKey}, "requestHash" = ${P.requestHash}, "updatedAt" = now()
    WHERE "id" = ${P.basketId} AND "tenantId" = ${c.tenantId} AND "status" = 'OPEN'
    RETURNING "id"`;
  if (co.length !== 1) throw new BookingAbort("STATE_CONFLICT", { reason: "BASKET_CHECKED_OUT" });
  return done.map((d) => ({ productKind: "TRIP", bookingId: d.line.bookingId, code: d.code, status: d.line.status, publicToken: d.token, dues: duesOf(d.line.snapshot) }));
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
async function refsOfBasket(g: Gate, basketId: string): Promise<SellResult<BookingRef[]>> {
  const rows = await unitDb(g).$queryRaw<{ id: string; code: string; status: string; policySnapshot: unknown }[]>`
    SELECT "id", "code", "status", "policySnapshot" FROM "TripBooking" WHERE "basketId" = ${basketId} AND "tenantId" = ${g.tenantId} AND "unitId" = ${g.unitId} ORDER BY "id"`;
  const out: BookingRef[] = [];
  for (const r of rows) {
    const publicToken = bookingPublicToken(r.id);
    if (!publicToken) return keyMissing();
    out.push({ productKind: "TRIP", bookingId: r.id, code: r.code, status: r.status, publicToken, dues: isRec(r.policySnapshot) ? duesOf(r.policySnapshot) : [] });
  }
  return { ok: true, value: out };
}

// ═══════════════════════ จองหน้าร้านทีเดียว (ใบสั่ง §5.6) ═══════════════════════
/** STAFF เท่านั้น: ตะกร้า + hold + ยืนยัน ในธุรกรรมเดียว (ลำดับ §5.3 แล้ว §5.4 ข้อ 4–7 · ไม่มี rekey) · คีย์ซ้ำ = ผลเดิม */
export async function bookTripsNow(ctx: unknown, input: unknown, opts?: BookingOpts): Promise<SellResult<BookingRef[]>> {
  return safely("bookTripsNow", ctx, () => bookTripsNowImpl(ctx, input, opts));
}
async function bookTripsNowImpl(ctx: unknown, input: unknown, opts?: BookingOpts): Promise<SellResult<BookingRef[]>> {
  const pc = parseCtx(ctx);
  if (!pc.ok) return pc;
  const c = pc.c;
  if (c.actor.kind !== "STAFF") return sellFail("FORBIDDEN");
  const p = bookNowRequestSchema.safeParse(input);
  if (!p.success) return invalidInput(p.error);
  const req = p.data;
  const lg = linesGate(c, req.quote.lines) ?? overrideGate(req, opts, c.actor.kind);
  if (lg) return lg;
  if (!tokenSecret()) return keyMissing();
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
    priceOverrides: req.priceOverrides ?? null,
    overrideApprovals: req.overrideApprovals ?? null,
  });
  const prior = await basketByKey(unitDb(g), g.tenantId, key);
  if (prior) return replayByKey(g, prior, requestHash);
  const sc = sellCtxOf(c, ctx);
  const seats = await seatsOfLines(g, req.quote.lines);
  if (!Array.isArray(seats)) return seats;
  const refs = await productRefsOf(g, req.quote.lines);
  if (!Array.isArray(refs)) return refs;
  const policies = await policiesOfLines(sc, req.quote.lines);
  if ("ok" in policies) return policies;
  const core = await prepareCore(c, sc, g, req, opts, { quoteExpiresAt: req.quoteExpiresAt, policies, refs });
  if (!core.ok) return core;
  for (const l of core.lines) if (l.seats !== seats[l.index]) return sellFail("VALIDATION", { fields: ["pax"] });
  const expiresAt = new Date(Math.max(...core.lines.map((l) => holdExpiry(policies, l.departureId, "PAYMENT", c.clock.now).getTime())));
  const basketId = newId("sb_");
  const P = seal({
    kind: "trips.confirm.v1",
    tenantId: c.tenantId,
    unitId: c.unitId,
    channel: c.channel,
    actorKind: c.actor.kind,
    actorId: actorIdOf(c.actor),
    basketId,
    basketKey: key,
    requestHash,
    tokenHash: null,
    contactKey: core.contactKey,
    bookerPartyId: core.bookerPartyId,
    payMethod: core.payMethod,
    approvalIds: (req.overrideApprovals ?? []).map((a) => a.approvalId),
    onExpired: "FAIL",
    lines: core.lines.map((l) => ({ ...l, holdId: null })),
    policies,
  });
  const r = await runBooking(g, async (tx): Promise<TxOut> => {
    if (!(await insertBasket(tx, { id: basketId, tenantId: g.tenantId, channel: c.channel, expiresAt, tokenHash: null, key, requestHash, unitId: g.unitId }))) {
      const b = await basketByKey(tx, g.tenantId, key);
      if (b && b.status === "CHECKED_OUT" && b.requestHash === requestHash) return { replay: true };
      throw new BookingAbort("IDEMPOTENCY_CONFLICT");
    }
    await lockProductsInTx(tx, sc, refs);
    await reserveHoldsInTx(tx, sc, P.lines.map((l) => ({ departureId: l.departureId, qty: l.seats })), policies, null);
    const ids = await insertHoldsInTx(tx, sc, P.lines.map((l) => ({ departureId: l.departureId, qty: l.seats, key: `${req.idempotencyKey}_${l.index}` })), basketId, policies, null);
    return { refs: await finalizeCoreInTx(tx, c, P, ids) };
  });
  if (r.ok && "replay" in r.value) {
    const b = await basketByKey(unitDb(g), g.tenantId, key);
    return b ? refsOfBasket(g, b.id) : sellFail("STATE_CONFLICT");
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
  return safely("getTripBooking", ctx, async () => {
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
  });
}
export async function listTripBookings(ctx: unknown, input: unknown): Promise<SellResult<{ items: TripBookingDTO[] }>> {
  return safely("listTripBookings", ctx, async () => {
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
  });
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
/** คืนที่นั่ง (releaseHoldInTx · ระบุว่าเป็นการจองนี้ — R9) ก่อน CAS การจอง แล้วจึง releasePromoInTx — ลำดับเดียวกับยืนยัน (รอบ → hold → การจอง → กฎโค้ด) */
async function cancelUnpaidInTx(tx: Tx, sc: SellCtx, b: { id: string; status: string; version: number }, reason: string, policies: CapacityPolicies | undefined): Promise<number> {
  const a = { tenantId: sc.tenantId, unitId: sc.unitId };
  const holds = await tx.$queryRaw<{ id: string }[]>`
    SELECT "id" FROM "TripHold" WHERE "bookingId" = ${b.id} AND "tenantId" = ${a.tenantId} AND "unitId" = ${a.unitId} AND "status" = 'ACTIVE' ORDER BY "departureId", "id"`;
  for (const h of holds) {
    const r = await releaseHoldInTx(tx, sc, { holdId: h.id, reason: "BOOKING_CANCELLED" }, policies, { forBookingId: b.id });
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
/** แถว audit ที่จดคีย์กันซ้ำนี้ไว้ (ยกเลิก/แก้ไข) — idemKeyHash + bodyHash ใน after */
type IdemAudit = { after: Record<string, unknown> };
/**
 * แถว audit ที่จดคีย์กันซ้ำนี้ (ยกเลิก/แก้ไข) — ค้นด้วย tenantId + createdAt ≥ เวลาสร้างการจอง (index "AuditLog_tenantId_createdAt_idx") แล้วกรอง
 * targetId = bookingId · action · idemKeyHash (S4: ไม่สแกนตาม action ทั้งแพลตฟอร์ม · ไม่มี index ของ targetId ในฐาน — หนี้: (tenantId, targetId) ต้อง migration)
 */
async function idemAudits(db: Tx, tenantId: string, action: string, b: { id: string; createdAt: Date }, keyHash: string): Promise<IdemAudit[]> {
  const since = new Date(b.createdAt).toISOString();
  const rows = await db.$queryRaw<{ after: unknown }[]>`
    SELECT "after" FROM "AuditLog" WHERE "tenantId" = ${tenantId} AND "createdAt" >= ${since}::timestamp AND "targetId" = ${b.id} AND "action" = ${action} AND "after"->>'idemKeyHash' = ${keyHash} LIMIT 1`;
  return rows.filter((r) => isRec(r.after)).map((r) => ({ after: r.after as Record<string, unknown> }));
}

// ═══════════════════════ ยกเลิกก่อนจ่าย (ใบสั่ง §5.6) ═══════════════════════
/**
 * tripSellable.cancel — QUOTE = คำนวณจาก snapshot (ไม่เขียน) · EXECUTE (STAFF/SYSTEM) บน HOLD/PENDING:
 * releaseHoldInTx → CAS →CANCELLED → releasePromoInTx → outbox · ขายแล้ว ⇒ STATE_CONFLICT REFUND_REQUIRED (T0.7) · PUBLIC ⇒ FORBIDDEN OTP_REQUIRED (W1.3)
 * คีย์ซ้ำ + คำขอเดิม = ผลเดิม · คีย์ซ้ำ + คำขอต่าง = IDEMPOTENCY_CONFLICT (R12 · audit จด idemKeyHash + bodyHash)
 */
export async function cancelTripBooking(ctx: unknown, input: unknown): Promise<SellResult<CancelResult>> {
  return safely("cancelTripBooking", ctx, () => cancelImpl(ctx, input));
}
async function cancelImpl(ctx: unknown, input: unknown): Promise<SellResult<CancelResult>> {
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
  if (v.mode === "QUOTE") {
    try {
      const r = recomputeFromSnapshot(b.policySnapshot, { kind: "CANCEL", at: c.clock.iso, reasonKind: v.reasonKind ?? "CUSTOMER", paidSatang: b.paidSatang });
      if (!r.ok || !("refundSatang" in r.value) || !("keptSatang" in r.value)) return sellFail("VALIDATION", { reason: "SNAPSHOT_INVALID" });
      return { ok: true, value: { computed: { refundSatang: r.value.refundSatang, feeSatang: r.value.keptSatang, ladderStep: r.value.step, source: "SNAPSHOT" }, status: b.status } };
    } catch {
      return sellFail("VALIDATION", { reason: "SNAPSHOT_INVALID" });
    }
  }
  const keyHash = sha256hex(`cancel:${b.id}:${nsKey(c, v.idempotencyKey, null)}`);
  const bodyHash = holdRequestHash({ op: "trips.cancel.v1", reason: v.reason, reasonKind: v.reasonKind ?? null });
  const zero: CancelResult["computed"] = { refundSatang: 0, feeSatang: 0, ladderStep: null, source: "SNAPSHOT" };
  const replay = (rows: IdemAudit[]): SellResult<CancelResult> | null => {
    const hit = rows[0];
    if (!hit) return null;
    return hit.after.bodyHash === bodyHash ? { ok: true, value: { computed: zero, status: "CANCELLED" } } : sellFail("IDEMPOTENCY_CONFLICT");
  };
  const pre = replay(await idemAudits(unitDb(g), g.tenantId, "trips.booking.cancel", b, keyHash));
  if (pre) return pre;
  if (SOLD.has(b.status)) return sellFail("STATE_CONFLICT", { reason: "REFUND_REQUIRED" });
  if (!UNPAID.has(b.status)) return sellFail("STATE_CONFLICT");
  const policies = await optionalPolicies(sc, b.departureId);
  const r = await runBooking(g, async (tx): Promise<SellResult<CancelResult> | "DONE"> => {
    let version: number;
    try {
      version = await cancelUnpaidInTx(tx, sc, b, v.reason, policies);
    } catch (e) {
      if (e instanceof BookingAbort && e.code === "STATE_CONFLICT" && !e.details) {
        const rr = replay(await idemAudits(tx, g.tenantId, "trips.booking.cancel", b, keyHash));
        if (rr) return rr;
      }
      throw e;
    }
    await emitBooking(tx, g, "trips.booking.cancelled", b.id, { id: b.id, departureId: b.departureId, status: "CANCELLED", channel: b.channel, amountSatang: payableOf(b) });
    await auditBooking(tx, { tenantId: g.tenantId, unitId: g.unitId, actor: c.actor }, "trips.booking.cancel", b.id, { status: "CANCELLED", version, idemKeyHash: keyHash, bodyHash }, { status: b.status, version: b.version });
    return "DONE";
  });
  if (!r.ok) return r;
  if (r.value !== "DONE") return r.value;
  return { ok: true, value: { computed: zero, status: "CANCELLED" } };
}

// ═══════════════════════ อนุมัติ/ปฏิเสธคำขอ PENDING (ใบสั่ง §5.6 · R5) ═══════════════════════
/**
 * APPROVE: ยอดตอนจอง > 0 ⇒ PENDING→HOLD (hold CAS purpose PAYMENT · expiresAt = now + T5) · = 0 ⇒ แปลง hold เป็นขาย + PENDING→CONFIRMED + event confirmed (R5)
 * REJECT = ปล่อย hold → PENDING→CANCELLED → releasePromoInTx · สินค้า/ตัวเลือกปิดแล้ว ⇒ อนุมัติไม่ได้ (R8)
 */
export async function approveTripBooking(ctx: unknown, input: unknown): Promise<SellResult<{ bookingId: string; status: string; version: number }>> {
  return safely("approveTripBooking", ctx, () => approveImpl(ctx, input));
}
async function approveImpl(ctx: unknown, input: unknown): Promise<SellResult<{ bookingId: string; status: string; version: number }>> {
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
    const refs = await productRefsOf(g, [{ productId: b.productId, slotId: b.departureId }]);
    if (!Array.isArray(refs)) return refs;
    const snap = isRec(b.policySnapshot) ? (b.policySnapshot as unknown as SnapshotShape) : null;
    if (!snap || !Array.isArray(snap.paymentSchedule)) return sellFail("VALIDATION", { reason: "SNAPSHOT_INVALID" });
    const confirmNow = dueNowOfSnapshot(snap) === 0;
    const to: BookingStatus = confirmNow ? "CONFIRMED" : "HOLD";
    const r = await runBooking(g, async (tx) => {
      await lockProductsInTx(tx, sc, refs);
      await lockDeparturesInTx(tx, sc, [b.departureId]);
      const exp = holdExpiry(pol.value, b.departureId, "PAYMENT", c.clock.now);
      const h = await tx.$queryRaw<{ id: string }[]>`
        UPDATE "TripHold" SET "purpose" = 'PAYMENT', "expiresAt" = ${exp.toISOString()}::timestamp, "updatedAt" = now()
        WHERE "bookingId" = ${b.id} AND "tenantId" = ${g.tenantId} AND "unitId" = ${g.unitId} AND "status" = 'ACTIVE' AND "purpose" = 'SHOP_CONFIRM' AND "expiresAt" > ${c.clock.iso}::timestamp
        RETURNING "id"`;
      if (!h.length) throw new BookingAbort("STATE_CONFLICT");
      if (confirmNow) {
        for (const x of h) {
          const cv = await convertHoldInTx(tx, sc, { holdId: x.id }, { forBookingId: b.id });
          if (!cv.ok) throw new BookingAbort(cv.code, cv.details);
        }
      }
      const tr = await transitionBookingInTx(tx, sc, { bookingId: b.id, from: "PENDING", to, expectedVersion: v.expectedVersion });
      if (!tr.ok) throw new BookingAbort(tr.code, tr.details);
      if (confirmNow) await emitBooking(tx, g, "trips.booking.confirmed", b.id, { id: b.id, departureId: b.departureId, status: "CONFIRMED", channel: b.channel, amountSatang: payableOf(b) });
      await auditBooking(tx, a, "trips.booking.approve", b.id, { status: to, version: tr.value.version }, { status: b.status, version: b.version });
      return tr.value.version;
    });
    return r.ok ? { ok: true, value: { bookingId: b.id, status: to, version: r.value } } : r;
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

// ═══════════════════════ แก้คน/เลื่อนวัน (ใบสั่ง §5.6 · R2 R3 R6 R12 R14) ═══════════════════════
type ChangeValue = { bookingId: string; version: number; departureId: string };
/**
 * STAFF · การจอง CONFIRMED (PART_PAID/PAID = T0.7 ⇒ STATE_CONFLICT NOT_SUPPORTED) · snapshot ใหม่ทั้งก้อนนอก tx —
 * นโยบาย (policy) ใหม่ทั้งหมด · คงเฉพาะตารางยกเลิก (cancelLadder · cancelMinimumLadder · shopCancelRefundBpByReason) เว้น useCurrentPolicy + เหตุผล ≥ 10 ตัว (R2)
 * การจองมีโค้ดส่วนลด ⇒ ต้อง dropPromo: true (คืนสิทธิ์ในธุรกรรมเดียวกัน · R3) · ที่นั่งเดิมนับจาก snapshot เดิม (R6) · คีย์กันซ้ำ = ผลเดิม (R12)
 * tx: advisory ต่อการจอง → สินค้า+ตัวเลือก → 1a รอบเก่า/ใหม่ min→max → ที่นั่ง → CAS การจอง (สถานะเดิม · version+1) → รายการเดิม active=false + ใหม่
 *     → คืนโค้ด (กฎโค้ดล็อกท้ายสุด) → audit before/after (sha256 ของ snapshot เดิม) → event · เลขจองเดิม
 */
export async function changeTripBooking(ctx: unknown, input: unknown, opts?: BookingOpts): Promise<SellResult<ChangeValue>> {
  return safely("changeTripBooking", ctx, () => changeImpl(ctx, input, opts));
}
async function changeImpl(ctx: unknown, input: unknown, opts?: BookingOpts): Promise<SellResult<ChangeValue>> {
  const pc = parseCtx(ctx);
  if (!pc.ok) return pc;
  const c = pc.c;
  if (c.actor.kind !== "STAFF") return sellFail("FORBIDDEN");
  const p = changeRequestSchema.safeParse(input);
  if (!p.success) return invalidInput(p.error);
  const v = p.data;
  if (v.useCurrentPolicy && (v.reason ?? "").trim().length < CHANGE_POLICY_REASON_MIN) return sellFail("VALIDATION", { fields: ["reason"] });
  if (v.line.promoCode) return sellFail("VALIDATION", { fields: ["line.promoCode"] });
  const lg = linesGate(c, [v.line]) ?? overrideGate(v, opts, c.actor.kind);
  if (lg) return lg;
  const g = await gateOf(c);
  if (!g) return NF();
  const db = unitDb(g);
  const b = await readBooking(db, g, v.bookingId);
  if (!b) return NF();
  // กันซ้ำ (R12): คีย์เดิม + คำขอเดิม = ผลเดิม · คำขอต่าง = IDEMPOTENCY_CONFLICT
  const keyHash = sha256hex(`change:${b.id}:${nsKey(c, v.idempotencyKey, null)}`);
  const { idempotencyKey: _k, ...body } = v;
  const bodyHash = holdRequestHash({ op: "trips.change.v1", ...body });
  const replay = (rows: IdemAudit[]): SellResult<ChangeValue> | null => {
    const hit = rows[0];
    if (!hit) return null;
    if (hit.after.bodyHash !== bodyHash) return sellFail("IDEMPOTENCY_CONFLICT");
    return { ok: true, value: { bookingId: b.id, version: Number(hit.after.version), departureId: String(hit.after.departureId) } };
  };
  const pre = replay(await idemAudits(db, g.tenantId, "trips.booking.change", b, keyHash));
  if (pre) return pre;
  if (UNPAID.has(b.status)) return sellFail("STATE_CONFLICT", { reason: "CHANGE_BEFORE_CONFIRM" });
  if (b.status === "PART_PAID" || b.status === "PAID") return sellFail("STATE_CONFLICT", { reason: "NOT_SUPPORTED" });
  if (b.status !== "CONFIRMED") return sellFail("STATE_CONFLICT");
  if (b.version !== v.expectedVersion) return sellFail("STATE_CONFLICT");
  if (v.line.productId !== b.productId) return sellFail("VALIDATION", { fields: ["line.productId"] });
  const old = isRec(b.policySnapshot) ? (b.policySnapshot as unknown as TripsBookingSnapshot) : null;
  if (!old || !Array.isArray(old.lines)) return sellFail("VALIDATION", { reason: "SNAPSHOT_INVALID" });
  // โค้ดส่วนลดของการจองนี้ (R3)
  const promos = await db.$queryRaw<{ id: string }[]>`
    SELECT "id" FROM "TripPromoRedemption" WHERE "bookingId" = ${b.id} AND "tenantId" = ${g.tenantId} AND "unitId" = ${g.unitId} AND "status" = 'ACTIVE' LIMIT 1`;
  if (promos.length && v.dropPromo !== true) return sellFail("VALIDATION", { reason: "PROMO_ON_CHANGE" });
  const sc = sellCtxOf(c, ctx);
  const quote: QuoteRequestInput = { lines: [v.line] };
  const qopts = quoteOptsOf(v, opts);
  const fresh = await quoteTrips(sc, quote as QuoteRequest, qopts);
  if (!fresh.ok) return withApprovalTarget(fresh, c, sc, [v.line], qopts);
  if (c.clock.now.getTime() > Date.parse(v.quoteExpiresAt)) return priceChanged(fresh.value, "QUOTE_EXPIRED");
  if (fresh.value.quoteId !== v.quoteId) return priceChanged(fresh.value);
  const ag = await approvalsGate(c, sc, v, [v.line]);
  if (ag) return ag;
  const ql = (fresh.value.lines as TripQuoteLine[])[0];
  if (!ql) return priceChanged(fresh.value);
  const built = await buildTripBookingSnapshot(sc, { ...v.line, productKind: "TRIP" }, { quotedFingerprint: ql.fingerprint, policyAt: ql.policyAt }, qopts);
  if (!built.ok) return built.code === "PRICE_CHANGED" ? priceChanged(fresh.value) : built;
  if ((built.value.providers ?? []).length > 0) return sellFail("VALIDATION", { reason: "PROVIDERS_NOT_WIRED" });
  const snap: TripsBookingSnapshot = v.useCurrentPolicy
    ? built.value
    : { ...built.value, cancelLadder: old.cancelLadder, cancelMinimumLadder: old.cancelMinimumLadder, shopCancelRefundBpByReason: old.shopCancelRefundBpByReason };
  const cols = bookingColumnsFromSnapshot(snap as unknown as SnapshotShape);
  if (!cols) return sellFail("VALIDATION", { reason: "SNAPSHOT_INVALID" });
  const newSeats = seatsOfSnapshot(snap as unknown as SnapshotShape);
  const oldSeats = seatsOfSnapshot(old as unknown as SnapshotShape);
  if (newSeats < 1 || newSeats > QTY_MAX) return sellFail("VALIDATION", { fields: ["line.pax"] });
  // ผู้เดินทางที่มีอยู่ต้องไม่เกินที่นั่งใหม่ต่อประเภทคน (R14)
  const paxRows = await db.$queryRaw<{ paxTypeId: string | null; n: number }[]>`
    SELECT i."paxTypeId", count(*)::int AS "n" FROM "TripPassenger" p LEFT JOIN "TripBookingItem" i ON i."id" = p."itemId" AND i."tenantId" = p."tenantId"
    WHERE p."bookingId" = ${b.id} AND p."tenantId" = ${g.tenantId} AND p."unitId" = ${g.unitId} GROUP BY i."paxTypeId"`;
  const newByPax = seatsByPaxType(snap);
  const totalNew = Object.values(newByPax).reduce((s, n) => s + n, 0);
  if (paxRows.some((r) => (r.paxTypeId ? r.n > (newByPax[r.paxTypeId] ?? 0) : false)) || paxRows.reduce((s, r) => s + r.n, 0) > totalNew) {
    return sellFail("VALIDATION", { reason: "TOO_MANY_PASSENGERS" });
  }
  const from = b.departureId;
  const to = v.line.slotId;
  const refs = await productRefsOf(g, [v.line]);
  if (!Array.isArray(refs)) return refs;
  const policies = await loadCapacityPolicies(sc, { departureIds: [...new Set([from, to])] });
  if (!policies.ok) return policies;
  if (!policies.value.departures[to]) return NF();
  const a = { tenantId: g.tenantId, unitId: g.unitId, actor: c.actor };
  const oldSha = sha256hex(JSON.stringify(b.policySnapshot));
  const approvalIds = (v.overrideApprovals ?? []).map((x) => x.approvalId);
  const r = await runBooking(g, async (tx): Promise<ChangeValue> => {
    // ชั้น 0: การแก้ของการจองเดียวกันทีละคำขอ (คีย์ซ้ำที่ยิงพร้อมกันได้ผลเดิม)
    await lockTripsKey(tx, "change", b.id);
    const again = replay(await idemAudits(tx, g.tenantId, "trips.booking.change", b, keyHash));
    if (again) {
      if (!again.ok) throw new BookingAbort(again.code, again.details);
      return again.value;
    }
    // S7: ตรวจเวอร์ชันใต้ล็อกของการจองนี้ก่อนสร้าง hold เพิ่ม (คีย์ cg_<เวอร์ชัน> ของผู้ชนะจะชน) ⇒ เวอร์ชันเก่า = STATE_CONFLICT
    const cur = await tx.$queryRaw<{ version: number; status: string }[]>`SELECT "version", "status" FROM "TripBooking" WHERE "id" = ${b.id} AND "tenantId" = ${g.tenantId} AND "unitId" = ${g.unitId}`;
    if (cur[0]?.version !== v.expectedVersion || cur[0]?.status !== b.status) throw new BookingAbort("STATE_CONFLICT");
    await lockProductsInTx(tx, sc, refs);
    await lockDeparturesInTx(tx, sc, [from, to]);
    const addOn = async (dep: string, qty: number) => {
      await reserveHoldsInTx(tx, sc, [{ departureId: dep, qty }], policies.value, null);
      const h = await insertHoldInTx(tx, sc, { departureId: dep, qty, idempotencyKey: `cg_${v.expectedVersion}_${b.id}`.slice(0, 100), purpose: "PAYMENT", bookingId: b.id }, policies.value);
      if (!h.ok) throw new BookingAbort(h.code, h.details);
      const cv = await convertHoldInTx(tx, sc, { holdId: h.value.holdId }, { forBookingId: b.id });
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
    if (approvalIds.length) await consumeApprovalsInTx(tx, a, approvalIds, [b.id]);
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
    // คืนสิทธิ์โค้ด (หลังที่นั่งและการจอง · กฎโค้ดล็อกท้ายสุด · R3)
    if (v.dropPromo === true) await releasePromoInTx(tx, sc, { bookingId: b.id });
    await auditBooking(
      tx,
      a,
      "trips.booking.change",
      b.id,
      { departureId: to, version: nv, seats: newSeats, grossSatang: k.grossSatang, payableSatang: snap.totals.payableSatang, useCurrentPolicy: v.useCurrentPolicy === true, dropPromo: v.dropPromo === true, idemKeyHash: keyHash, bodyHash },
      { departureId: from, version: b.version, seats: oldSeats, grossSatang: b.grossSatang, payableSatang: payableOf(b), snapshotSha256: oldSha },
    );
    if (approvalIds.length) await auditBooking(tx, a, "trips.booking.price_override", b.id, { grossSatang: k.grossSatang, discountSatang: k.discountSatang, version: nv, approvalIds: [...approvalIds].sort().join(",") });
    await emitBooking(tx, g, "trips.booking.changed", `${b.id}:${nv}`, { id: b.id, departureId: to, status: b.status, channel: b.channel, amountSatang: snap.totals.payableSatang });
    return { bookingId: b.id, version: nv, departureId: to };
  });
  return r;
}

// ═══════════════════════ consumer ของ trips.booking.expired (ใบสั่ง §11 ข้อ 6) ═══════════════════════
/** การจองหมดเวลาโดยตัวกวาด T0.4 ⇒ คืนสิทธิ์โค้ดส่วนลดในธุรกรรมใหม่ (ซ้ำ = ไม่ลดอีก · การจองไม่ EXPIRED ⇒ ไม่ทำอะไร) — รับ {tenantId, unitId, bookingId} หรือ event outbox */
export async function onTripBookingExpired(input: unknown): Promise<SellResult<{ released: number }>> {
  return safely("onTripBookingExpired", input, async () => {
    const raw = isRec(input) && isRec(input.payload) ? { tenantId: input.tenantId, unitId: input.payload.unitId ?? input.unitId, bookingId: input.payload.bookingId } : input;
    const p = expiredEventSchema.safeParse(raw);
    if (!p.success) return invalidInput(p.error);
    const v = p.data;
    const g = await gateOf(v);
    if (!g) return NF();
    const b = await readBooking(unitDb(g), g, v.bookingId);
    if (!b) return NF();
    if (b.status !== "EXPIRED") return { ok: true, value: { released: 0 } };
    const sc: SellCtx = { tenantId: g.tenantId, unitId: g.unitId, channel: "WEB", actor: { kind: "SYSTEM", job: "trips.booking.expired" }, now: new Date() };
    const r = await runBooking(g, async (tx) => {
      const rel = await releasePromoInTx(tx, sc, { bookingId: b.id });
      return rel.ok ? rel.value.released : 0;
    });
    return r.ok ? { ok: true, value: { released: r.value } } : r;
  });
}
// ── /T0.6 booking ──
