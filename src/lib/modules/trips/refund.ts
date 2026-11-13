// ─────────────────────────────────────────────────────────────
// trips/refund.ts — คำขอคืนเงินเป็นขั้นตอน (CC §G.3 · ภาพ 15): ยื่น (QUOTED จาก snapshot ทันที) → อนุมัติ/ปฏิเสธ/ถอน → บันทึกโอนคืน (DONE) · RUN TRIPS T0.7a
// ใบสั่ง ledger/trips-briefs/T0.7.md §8 §10 §11 §12 (§22 มติผู้คุมชนะ) · CC §G.3 :708–:720 · §H.2 :777–:783
//
// 🔴 นอก tx เท่านั้น: gateOf · ค่าตั้งปัจจุบัน (X12 X13) · approval.requestBindings · อ่าน FileAsset · loadCapacityPolicies · ทะเบียนกฎหมาย
// 🔴 ลำดับล็อก (§10): ยื่น/ตัดสิน/ถอน = 2b การจอง → 2b′ คำขอ → [ตัดสิน: advisory คำอนุมัติ → audit consumed] → 2h
//    บันทึกโอนคืน = ชั้น 0 advisory `refund:<requestId>` → 1a returnSoldInTx (คืนที่นั่ง) → 2b การจอง → 2b′ คำขอ APPROVED→EXECUTING→DONE →
//    2d แถวเงิน REFUNDED/RETAINED + งวด → 2b CAS การจอง → CANCELLED → กฎโค้ด releasePromoInTx (หลังคืนที่นั่งเสมอ) → 2h
// 🔴 ยอดคืนไม่เกินที่รับ (ต่อใบรับ · ต่อกลุ่ม tender · รวม) · เงินเก็บแทนคืนเต็มเว้นมีหลักฐานจ่ายออก · ทุกแถวเงิน UNPOSTED · ไม่มี DELETE
// 🔴 จุดปล่อยที่นั่ง = ตอน DONE (มติ §22 ข้อ 3) — ย้ายไปตอนอนุมัติได้ด้วยการย้ายการเรียก `returnSeatsForRefundInTx` ที่เดียว
// ─────────────────────────────────────────────────────────────
import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import type { SellActor, SellResult } from "@/lib/core/sellable";
import { resolveSettings } from "@/lib/core/settings";
import { tourRefundFloorPctAt } from "@/lib/core/settings/legal/th-tour-2569";
import { requestBindings } from "@/lib/modules/approval";
import { BookingAbort, runTripsTx, tripsSafely } from "./booking";
import { seatsOfSnapshot, tripText, type SnapshotShape } from "./booking-core";
import { holdRequestHash, invalidInput, parseCtx, returnSoldInTx, sellFail, type CapacityPolicies, type Ctx, type Failure, type Gate, type Tx } from "./capacity";
import { gateOf, loadCapacityPolicies, unitClient } from "./capacity-service";
import {
  auditMoney,
  bookingEventPayload,
  emitMoney,
  lockMoneyBookingInTx,
  lockMoneyKey,
  moneyBookingGate,
  moneyNsKey,
  moneyRowId,
  moneySellCtx,
  openRefundOf,
  payableOfSnapshot,
  readMoneyBooking,
  type MoneyBooking,
  type MoneyEvt,
} from "./money";
import { BP_UNIT } from "./money-math";
import {
  MONEY_REFERENCE,
  TRIP_REFUND_ENTITY,
  TRIP_REFUND_STATUSES,
  planRefundSlices,
  receiptVatCtxOf,
  refundQuoteFromSnapshot,
  tenderGroupOf,
  tripRefundEntityId,
  type RefundQuote,
  type RefundReasonKind,
} from "./money-core";
import { releasePromoInTx } from "./promo";
import { snapshotValue } from "./snapshot";
import { canTransitionBooking } from "./state";

// ── T0.7 refund ──
const INT4 = 2_147_483_647;
const sha256hex = (s: string) => createHash("sha256").update(s).digest("hex");
const newId = (prefix: string) => moneyRowId(prefix);
const isRec = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const NF = (): Failure => sellFail("NOT_FOUND");
const ID = z.string().trim().min(1).max(128);
const IDEM_KEY = z.string().regex(/^[A-Za-z0-9_-]{8,90}$/);
const NN = z.number().int().min(0).max(INT4);
const AMOUNT = z.number().int().min(1).max(INT4);
const REASON_KINDS = ["CUSTOMER", "EXTERNAL", "MIN_NOT_MET", "SHOP_FAULT"] as const;
const CHOICES = ["MONEY", "CREDIT", "MOVE_DATE"] as const;
const DEDUCTION_CATEGORIES = ["VISA", "AIR_DEPOSIT", "OTHER_NECESSARY"] as const;
const REFUNDABLE: ReadonlySet<string> = new Set(["CONFIRMED", "PART_PAID", "PAID"]);
/** ช่วงเผื่อนาฬิกาคลาดของการค้นแถว audit กันซ้ำ (แบบ T0.6 F1 · ไม่ใช่ค่าธุรกิจ) */
const IDEM_SKEW_S = 24 * 60 * 60;
/** หน่วยร้อยละ (ไม่ใช่ค่าธุรกิจ) — bp ต่อ 1 % */
const BP_PER_PCT = BP_UNIT / 100;
const K_AUTO_APPROVE = "trips.cancel.autoApproveUpTo"; // X12 (ค่าปัจจุบัน · นโยบาย ไม่ใช่ยอด)
const K_MANUAL_APPROVAL = "trips.cancel.manualEditApprovalSatang"; // X13
const APPROVAL_CONSUMED = "trips.approval.consumed";
const AUTO_APPROVER: SellActor = { kind: "SYSTEM", job: "trips.refund.autoApprove" };

// ═══════════════════════ ขั้นต่ำตามประกาศคืนเงิน 2563 (ทะเบียนกฎหมาย · มติ §22 ข้อ 4 · มติ r1 V5) ═══════════════════════
/** ขั้นต่ำ (bp) ณ จำนวนวันก่อนเดินทาง = tourRefundFloorPctAt ของ `core/settings/legal/th-tour-2569.ts` (ตารางเดียวกับ W01) · หลังวันเดินทาง ⇒ null · ระดับสูงสุด WARN */
function statutoryFloorBpAt(daysBefore: number): number | null {
  const pct = tourRefundFloorPctAt(daysBefore);
  return pct === null ? null : pct * BP_PER_PCT;
}

// ═══════════════════════ แถวคำขอ ═══════════════════════
type ReqRow = {
  id: string;
  bookingId: string;
  by: string;
  reasonKind: string;
  deductions: unknown;
  status: string;
  computed: unknown;
  choice: string;
  amountSatang: number;
  manualDeltaSatang: number;
  approvalId: string | null;
  decidedById: string | null;
  idempotencyKey: string | null;
  requestHash: string | null;
  createdAt: Date;
};
const REQ_COLS = Prisma.raw(`"id", "bookingId", "by", "reasonKind", "deductions", "status", "computed", "choice", "amountSatang", "manualDeltaSatang", "approvalId", "decidedById", "idempotencyKey", "requestHash", "createdAt"`);
async function readRequest(db: Tx, g: { tenantId: string; unitId: string }, id: string): Promise<ReqRow | null> {
  const rows = await db.$queryRaw<ReqRow[]>`SELECT ${REQ_COLS} FROM "TripRefundRequest" WHERE "id" = ${id} AND "tenantId" = ${g.tenantId} AND "unitId" = ${g.unitId}`;
  return rows[0] ?? null;
}
/** คำขอของคีย์กันซ้ำ (ดัชนี unique TripRefundRequest_tenantId_idempotencyKey_key) */
async function requestByKey(db: Tx, tenantId: string, key: string): Promise<ReqRow | null> {
  const rows = await db.$queryRaw<ReqRow[]>`SELECT ${REQ_COLS} FROM "TripRefundRequest" WHERE "tenantId" = ${tenantId} AND "idempotencyKey" = ${key}`;
  return rows[0] ?? null;
}
/** ข้อเท็จจริงเงินที่ใบเสนอคิดจาก (ตรวจซ้ำตอนบันทึกโอนคืน · มติ r1 V4) */
type QuoteFacts = { moneyEventIds: string[]; departureId: string; passThroughPaidOut: boolean };
type Computed = RefundQuote & { bookingVersion: number; quotedAt: string; reason: string; facts?: QuoteFacts };
function computedOf(v: unknown): Computed | null {
  if (!isRec(v)) return null;
  const nums = ["refundSatang", "refundNonPtSatang", "refundPassThroughSatang", "paidSatang", "keptSatang", "bookingVersion"] as const;
  if (!nums.every((k) => typeof v[k] === "number" && Number.isSafeInteger(v[k])) || !Array.isArray(v.lines)) return null;
  return v as unknown as Computed;
}
/** DTO ของคำขอ (ไม่มีข้อมูลบุคคล — เหตุผลข้อความอิสระไม่ออก DTO) */
export type TripRefundDTO = {
  id: string;
  bookingId: string;
  by: string;
  reasonKind: string;
  status: string;
  choice: string;
  amountSatang: number;
  manualDeltaSatang: number;
  approvalId: string | null;
  decidedById: string | null;
  deductions: { category: string; amountSatang: number; evidenceFileId: string | null }[];
  computed: Omit<Computed, "reason"> | null;
  createdAt: string;
};
function dtoOf(r: ReqRow): TripRefundDTO {
  const computed = computedOf(r.computed) ? (publicComputed(r.computed) as Omit<Computed, "reason">) : null;
  const deds = Array.isArray(r.deductions) ? r.deductions.filter(isRec) : [];
  return {
    id: r.id,
    bookingId: r.bookingId,
    by: r.by,
    reasonKind: r.reasonKind,
    status: r.status,
    choice: r.choice,
    amountSatang: r.amountSatang,
    manualDeltaSatang: r.manualDeltaSatang,
    approvalId: r.approvalId,
    decidedById: r.decidedById,
    deductions: deds.map((d) => ({ category: String(d.category), amountSatang: Number(d.amountSatang), evidenceFileId: typeof d.evidenceFileId === "string" ? d.evidenceFileId : null })),
    computed,
    createdAt: new Date(r.createdAt).toISOString(),
  };
}
/**
 * แถว audit ที่จดคีย์กันซ้ำของคำขอนี้ (ดัชนี AuditLog_tenantId_createdAt_idx + กรอง targetId/action · หนี้ดัชนี (tenantId, targetId) แบบ T0.6)
 * มติ r1 V7: audit ใช้เวลาของฐาน · ขอบล่าง = LEAST(เวลาสร้างคำขอ (ctx.now), now() ของฐาน) − 24 ชม. คิดใน SQL ⇒ ทนนาฬิกาที่ฉีด/คลาดกับฐาน
 */
async function idemAudit(db: Tx, tenantId: string, r: { id: string; createdAt: Date }, actions: readonly string[], keyHash: string): Promise<Record<string, unknown> | null> {
  const created = new Date(r.createdAt).toISOString();
  const rows = await db.$queryRaw<{ after: unknown }[]>`
    SELECT "after" FROM "AuditLog" WHERE "tenantId" = ${tenantId} AND "createdAt" >= LEAST(${created}::timestamp, now()::timestamp) - make_interval(secs => ${IDEM_SKEW_S})
      AND "targetId" = ${r.id} AND "action" = ANY(${[...actions]}::text[])
      AND "after"->>'idemKeyHash' = ${keyHash} LIMIT 1`;
  const a = rows[0]?.after;
  return isRec(a) ? a : null;
}
/** หลักฐานเงินเก็บแทนจ่ายออกแล้ว: ของการจอง หรือของรอบ (bookingId ว่าง) — ดัชนี TripPassThroughEvidence_bookingId_idx / _departureId_idx */
async function passThroughPaidOut(db: Tx, g: { tenantId: string; unitId: string }, b: { id: string; departureId: string }): Promise<boolean> {
  const rows = await db.$queryRaw<{ id: string }[]>`
    SELECT "id" FROM "TripPassThroughEvidence" WHERE "tenantId" = ${g.tenantId} AND "unitId" = ${g.unitId}
      AND ("bookingId" = ${b.id} OR ("bookingId" IS NULL AND "departureId" = ${b.departureId})) LIMIT 1`;
  return rows.length > 0;
}
/** ข้อเท็จจริงเงินของการจองตอนนี้ (แถวเงินทุกชนิด เรียง id · รอบ · หลักฐานเก็บแทนจ่ายออก) — ดัชนี TripMoneyEvent_bookingId_idx */
async function quoteFactsOf(db: Tx, g: { tenantId: string; unitId: string }, b: { id: string; departureId: string }): Promise<QuoteFacts> {
  const rows = await db.$queryRaw<{ id: string }[]>`SELECT "id" FROM "TripMoneyEvent" WHERE "bookingId" = ${b.id} AND "tenantId" = ${g.tenantId} AND "unitId" = ${g.unitId} ORDER BY "id"`;
  return { moneyEventIds: rows.map((r) => r.id), departureId: b.departureId, passThroughPaidOut: await passThroughPaidOut(db, g, b) };
}
const sameFacts = (a: QuoteFacts, b: QuoteFacts) =>
  a.departureId === b.departureId && a.passThroughPaidOut === b.passThroughPaidOut && a.moneyEventIds.length === b.moneyEventIds.length && a.moneyEventIds.every((x, i) => x === b.moneyEventIds[i]);
const settingInt = async (c: Ctx, key: string): Promise<number | null> => {
  const r = await resolveSettings({ tenantId: c.tenantId }, [key], { unitId: c.unitId }, c.clock.now);
  const v = r[key]?.value;
  return typeof v === "number" && Number.isSafeInteger(v) && v >= 0 ? v : null;
};
const audActor = (c: Ctx, g: Gate) => ({ tenantId: g.tenantId, unitId: g.unitId, actor: c.actor });
const refundEvt = (type: string, r: { id: string; bookingId: string; choice: string }, amountSatang: number): MoneyEvt => ({
  type,
  key: r.id,
  payload: { requestId: r.id, bookingId: r.bookingId, amountSatang, choice: r.choice },
});

// ═══════════════════════ ใบเสนอจาก snapshot (ใช้ร่วมกับ tripSellable.cancel QUOTE) ═══════════════════════
/** ใบเสนอคืนเงินของการจองที่ขายแล้ว ณ ctx.now (ไม่เขียน · อ่านนอก tx หรือใน tx ของผู้เรียก) */
export async function tripRefundQuote(db: Tx, g: { tenantId: string; unitId: string }, b: MoneyBooking, at: string, reasonKind: RefundReasonKind, deductionsSatang: number): Promise<SellResult<RefundQuote>> {
  const paidOut = await passThroughPaidOut(db, g, b);
  const q = refundQuoteFromSnapshot(b.policySnapshot, {
    at,
    reasonKind,
    paidSatang: Math.max(0, b.paidSatang - b.refundedSatang),
    deductionsSatang,
    passThroughPaidOut: paidOut,
    statutoryFloorBpAt,
  });
  return q.ok ? { ok: true, value: q.value } : sellFail("VALIDATION", { reason: q.reason === "SETTINGS_INVALID" ? "SETTINGS_INVALID" : "SNAPSHOT_INVALID" });
}

// ═══════════════════════ §8.1 ยื่นคำขอ ═══════════════════════
const deductionSchema = z.strictObject({ category: z.enum(DEDUCTION_CATEGORIES), amountSatang: AMOUNT, evidenceFileId: ID.optional() });
const requestInput = z.strictObject({
  bookingId: ID,
  expectedVersion: NN,
  reasonKind: z.enum(REASON_KINDS),
  choice: z.enum(CHOICES),
  reason: tripText(500).pipe(z.string().min(1)),
  deductions: z.array(deductionSchema).max(10).optional(),
  idempotencyKey: IDEM_KEY,
});
type RequestInput = z.infer<typeof requestInput>;
export type RefundRequestValue = { requestId: string; status: string; amountSatang: number; computed: Record<string, unknown>; replayed: boolean };

/** ตรวจหมวด/หลักฐานของค่าใช้จ่ายจริง (snapshot `trips.cancel.deductions` · FileAsset ของร้าน อ่านนอก tx) */
async function deductionsGate(db: Tx, g: Gate, b: MoneyBooking, deds: readonly z.infer<typeof deductionSchema>[]): Promise<Failure | null> {
  if (!deds.length) return null;
  let cfg: unknown;
  try {
    cfg = snapshotValue(b.policySnapshot, "trips", "trips.cancel.deductions");
  } catch {
    return sellFail("VALIDATION", { reason: "SNAPSHOT_INVALID" });
  }
  const cats = isRec(cfg) && Array.isArray(cfg.categories) ? cfg.categories.filter((x): x is string => typeof x === "string") : [];
  const evidenceRequired = !isRec(cfg) || cfg.evidenceRequired !== false;
  for (const d of deds) {
    if (!cats.includes(d.category)) return sellFail("VALIDATION", { reason: "DEDUCTION_CATEGORY" });
    if (evidenceRequired && !d.evidenceFileId) return sellFail("VALIDATION", { reason: "EVIDENCE_REQUIRED" });
  }
  const ids = [...new Set(deds.map((d) => d.evidenceFileId).filter((x): x is string => !!x))];
  if (ids.length) {
    const rows = await db.$queryRaw<{ id: string }[]>`SELECT "id" FROM "FileAsset" WHERE "id" = ANY(${ids}::text[]) AND "tenantId" = ${g.tenantId}`;
    if (rows.length !== ids.length) return NF();
  }
  const total = deds.reduce((s, d) => s + d.amountSatang, 0);
  return total > INT4 ? sellFail("VALIDATION", { fields: ["deductions"] }) : null;
}

type ReqTxOut = { replay: ReqRow } | { value: RefundRequestValue };
/**
 * สิทธิ์เพิ่มของผู้เรียกผ่าน server action (มติ r1 V2 V4): canDecide = มี trips.refund.approve
 * ไม่ส่ง ⇒ ผู้เรียกในระบบที่ไว้ใจ (งาน SYSTEM · tripSellable ของแพลตฟอร์ม · ข้อสอบ) — ยกเว้นการถอนคำขอที่อนุมัติแล้ว ซึ่งต้อง canDecide === true เสมอ
 */
export type RefundOpts = { canDecide?: boolean };
type FileArgs = {
  reasonKind: RefundReasonKind;
  reason: string;
  deductions: { category: string; amountSatang: number; evidenceFileId: string | null }[];
  deductionsSatang: number;
  key: string;
  requestHash: string;
  autoApproveUpTo: number;
};
/**
 * แกนยื่นคำขอในธุรกรรมของผู้เรียก — ผู้เรียกถือแถวการจองแล้ว (2b) และตรวจสถานะ/คำขอเปิด/รุ่นแล้ว:
 * ใบเสนอจาก snapshot ณ ctx.now → INSERT QUOTED (2b′ · computed + ข้อเท็จจริงเงิน) → audit → [X12 อนุมัติอัตโนมัติ] → outbox
 */
async function fileRefundRequestInTx(tx: Tx, c: Ctx, g: Gate, lb: MoneyBooking, a: FileArgs): Promise<RefundRequestValue> {
  const q = await tripRefundQuote(tx, g, lb, c.clock.iso, a.reasonKind, a.deductionsSatang);
  if (!q.ok) throw new BookingAbort(q.code, q.details);
  const quote = q.value;
  if (quote.refundSatang < 0 || quote.refundSatang > INT4) throw new BookingAbort("VALIDATION", { reason: "OVER_REFUND" });
  const computed: Computed = { ...quote, bookingVersion: lb.version, quotedAt: c.clock.iso, reason: a.reason, facts: await quoteFactsOf(tx, g, lb) };
  const id = newId("trr_");
  const iso = c.clock.iso;
  // 2b′
  await tx.$queryRaw`
    INSERT INTO "TripRefundRequest" ("id", "tenantId", "unitId", "bookingId", "by", "reasonKind", "deductions", "status", "computed", "choice", "amountSatang", "manualDeltaSatang",
      "approvalId", "decidedById", "idempotencyKey", "requestHash", "createdAt", "updatedAt")
    VALUES (${id}, ${g.tenantId}, ${g.unitId}, ${lb.id}, ${c.actor.kind === "SYSTEM" ? "SYSTEM" : "STAFF"}, ${a.reasonKind}, ${JSON.stringify(a.deductions)}::jsonb, 'QUOTED', ${JSON.stringify(computed)}::jsonb,
      'MONEY', ${quote.refundSatang}, 0, NULL, NULL, ${a.key}, ${a.requestHash}, ${iso}::timestamp, ${iso}::timestamp)
    RETURNING "id"`;
  const evts: MoneyEvt[] = [refundEvt("trips.refund.requested", { id, bookingId: lb.id, choice: "MONEY" }, quote.refundSatang)];
  await auditMoney(tx, audActor(c, g), "trips.refund.request", { type: "TripRefundRequest", id }, {
    status: "QUOTED",
    bookingId: lb.id,
    amountSatang: quote.refundSatang,
    refundBp: quote.refundBp,
    paidSatang: quote.paidSatang,
    bookingVersion: lb.version,
    warnings: quote.warnings.join(","),
    idemKeyHash: sha256hex(a.key),
    bodyHash: a.requestHash,
  });
  let status = "QUOTED";
  // อนุมัติอัตโนมัติ (X12 · ค่าปัจจุบันอ่านนอก tx) — ค่าเริ่ม 0 ⇒ รอคนอนุมัติ
  if (a.autoApproveUpTo > 0 && quote.refundSatang <= a.autoApproveUpTo) {
    const ap = await tx.$queryRaw<{ id: string }[]>`
      UPDATE "TripRefundRequest" SET "status" = 'APPROVED', "updatedAt" = now()
      WHERE "id" = ${id} AND "tenantId" = ${g.tenantId} AND "unitId" = ${g.unitId} AND "status" = 'QUOTED'
      RETURNING "id"`;
    if (ap.length !== 1) throw new BookingAbort("STATE_CONFLICT");
    status = "APPROVED";
    evts.push(refundEvt("trips.refund.approved", { id, bookingId: lb.id, choice: "MONEY" }, quote.refundSatang));
    await auditMoney(tx, { tenantId: g.tenantId, unitId: g.unitId, actor: AUTO_APPROVER }, "trips.refund.approve", { type: "TripRefundRequest", id }, {
      status,
      amountSatang: quote.refundSatang,
      manualDeltaSatang: 0,
      auto: true,
      idemKeyHash: sha256hex(`auto:${id}`),
      bodyHash: a.requestHash,
    }, { status: "QUOTED", amountSatang: quote.refundSatang });
  }
  await emitMoney(tx, g, evts);
  return { requestId: id, status, amountSatang: quote.refundSatang, computed: publicComputed(computed), replayed: false };
}
/** เหตุผลของคำขออัตโนมัติเมื่องวดเลยกำหนด (ข้อความแสดงผล · ไม่ใช่ค่าธุรกิจ) */
const OVERDUE_REASON = "เลยกำหนดชำระ";
/**
 * AUTO_RELEASE (T17 · §13 · มติ r1 V1 + hunt M-3): เรียกจาก markTripDueOverdue ในธุรกรรมเดียวกับ CAS งวด → OVERDUE (ผู้เรียกถือแถวการจอง · งวดยังค้างจ่ายใต้ล็อก)
 * ยื่นคำขอ SYSTEM เหตุ CUSTOMER · MONEY · คีย์ `refund:<bookingId>:sys:trips.paymentDue:due_<dueId>@<unit>` · มีคำขอเปิด/คีย์เคยใช้/สถานะไม่เข้า ⇒ ไม่ยื่น (false)
 * autoApproveUpTo (X12) อ่านนอก tx โดยผู้เรียก
 */
export async function autoReleaseOverdueInTx(tx: Tx, ctx: unknown, b: MoneyBooking, dueId: string, autoApproveUpTo: number): Promise<boolean> {
  const pc = parseCtx(ctx);
  if (!pc.ok) throw new BookingAbort(pc.code, pc.details);
  const c = pc.c;
  const g: Gate = { tenantId: c.tenantId, unitId: c.unitId, tz: "" };
  if (!REFUNDABLE.has(b.status) || moneyBookingGate(b)) return false;
  if (await openRefundOf(tx, g, b.id)) return false;
  const key = `refund:${b.id}:${moneyNsKey(c, `due_${dueId}`)}`;
  if (await requestByKey(tx, g.tenantId, key)) return false;
  const requestHash = holdRequestHash({ op: "trips.refund.refund.v1", bookingId: b.id, reasonKind: "CUSTOMER", choice: "MONEY", reason: OVERDUE_REASON, deductions: [] });
  await fileRefundRequestInTx(tx, c, g, b, { reasonKind: "CUSTOMER", reason: OVERDUE_REASON, deductions: [], deductionsSatang: 0, key, requestHash, autoApproveUpTo });
  return true;
}
async function requestCore(c: Ctx, v: RequestInput, prefix: "refund" | "cancel", opts: RefundOpts | undefined): Promise<SellResult<RefundRequestValue>> {
  if (v.choice === "CREDIT") return sellFail("VALIDATION", { reason: "CREDIT_NOT_ENABLED" });
  if (v.choice === "MOVE_DATE") return sellFail("VALIDATION", { reason: "MOVE_DATE_VIA_CHANGE" });
  // มติ r1 V2: เหตุที่ไม่ใช่ลูกค้า (คืน 100 %) ต้องมีสิทธิ์อนุมัติคืนเงิน — ผู้เรียกผ่าน action ส่ง canDecide ตามสิทธิ์จริง · ไม่ส่ง opts = ผู้เรียกในระบบที่ไว้ใจ (SYSTEM/บริการ)
  if (v.reasonKind !== "CUSTOMER" && opts?.canDecide === false) return sellFail("FORBIDDEN", { reason: "REASON_REQUIRES_APPROVER" });
  const autoAllowed = v.reasonKind === "CUSTOMER" || opts?.canDecide !== false;
  const g = await gateOf(c);
  if (!g) return NF();
  const db = unitClient(g);
  const b = await readMoneyBooking(db, g, v.bookingId);
  if (!b) return NF();
  const key = `${prefix}:${b.id}:${moneyNsKey(c, v.idempotencyKey)}`;
  const deds = v.deductions ?? [];
  const requestHash = holdRequestHash({
    op: `trips.${prefix}.refund.v1`,
    bookingId: v.bookingId,
    reasonKind: v.reasonKind,
    choice: v.choice,
    reason: v.reason,
    deductions: deds.map((d) => ({ category: d.category, amountSatang: d.amountSatang, evidenceFileId: d.evidenceFileId ?? null })),
  });
  const replay = (r: ReqRow): SellResult<RefundRequestValue> =>
    r.requestHash === requestHash && r.bookingId === b.id
      ? { ok: true, value: { requestId: r.id, status: r.status, amountSatang: r.amountSatang, computed: publicComputed(r.computed), replayed: true } }
      : sellFail("IDEMPOTENCY_CONFLICT");
  const prior = await requestByKey(db, g.tenantId, key);
  if (prior) return replay(prior);
  const bg = moneyBookingGate(b);
  if (bg) return bg;
  if (!REFUNDABLE.has(b.status)) return sellFail("STATE_CONFLICT", { reason: "NOT_REFUNDABLE_STATUS" });
  if (b.version !== v.expectedVersion) return sellFail("STATE_CONFLICT");
  const dg = await deductionsGate(db, g, b, deds);
  if (dg) return dg;
  const autoApprove = (await settingInt(c, K_AUTO_APPROVE)) ?? 0;
  const deductionsSatang = deds.reduce((s, d) => s + d.amountSatang, 0);
  const r = await runTripsTx(g, async (tx): Promise<ReqTxOut> => {
    // 2b
    const lb = await lockMoneyBookingInTx(tx, g, b.id);
    if (!lb) throw new BookingAbort("NOT_FOUND");
    const again = await requestByKey(tx, g.tenantId, key);
    if (again) return { replay: again };
    if (!REFUNDABLE.has(lb.status)) throw new BookingAbort("STATE_CONFLICT", { reason: "NOT_REFUNDABLE_STATUS" });
    if (await openRefundOf(tx, g, lb.id)) throw new BookingAbort("STATE_CONFLICT", { reason: "REFUND_IN_PROGRESS" });
    if (lb.version !== v.expectedVersion) throw new BookingAbort("STATE_CONFLICT");
    return {
      value: await fileRefundRequestInTx(tx, c, g, lb, {
        reasonKind: v.reasonKind,
        reason: v.reason,
        deductions: deds.map((d) => ({ category: d.category, amountSatang: d.amountSatang, evidenceFileId: d.evidenceFileId ?? null })),
        deductionsSatang,
        key,
        requestHash,
        autoApproveUpTo: autoAllowed ? autoApprove : 0,
      }),
    };
  });
  if (!r.ok) {
    if (r.code === "IDEMPOTENCY_CONFLICT" || r.code === "BUSY") {
      const late = await requestByKey(db, g.tenantId, key);
      if (late) return replay(late);
    }
    return r;
  }
  return "replay" in r.value ? replay(r.value.replay) : { ok: true, value: r.value.value };
}
/** computed ที่คืนให้ผู้เรียก (ตัดข้อความอิสระ) */
function publicComputed(v: unknown): Record<string, unknown> {
  if (!isRec(v)) return {};
  const { reason: _r, decisionReason: _d, withdrawReason: _w, manualReason: _m, ...rest } = v;
  return rest;
}

/**
 * ยื่นคำขอคืนเงิน (§8.1): STAFF · SYSTEM (งานงวด / tripSellable.cancel) · PUBLIC ⇒ FORBIDDEN OTP_REQUIRED (W1.3) · AGENT ⇒ AGENCY_NOT_ENABLED
 * คำนวณจาก snapshot ทันที ⇒ บันทึก QUOTED (REQUESTED ไม่มีแถว) · ที่นั่งไม่ปล่อยจนกว่า DONE · ระหว่างคำขอเปิด รับเงิน/แก้การจองไม่ได้
 * กันซ้ำ: `refund:<bookingId>:<nsKey>` บน TripRefundRequest (tenantId, idempotencyKey) unique + requestHash
 * การจองที่ลบข้อมูลผู้จองแล้ว (piiPurgedAt) ยื่นได้ตามปกติ (มติ r1 V8 — เงินที่รับต้องคืนได้เสมอ · คำขอไม่ใช้ข้อมูลบุคคล)
 * opts (มติ r1 V2): ผู้เรียกผ่าน action ส่ง canDecide · ไม่มีสิทธิ์อนุมัติ + เหตุไม่ใช่ CUSTOMER ⇒ FORBIDDEN REASON_REQUIRES_APPROVER
 */
export async function requestTripRefund(ctx: unknown, input: unknown, opts?: RefundOpts): Promise<SellResult<RefundRequestValue>> {
  return tripsSafely("requestTripRefund", ctx, async () => {
    const pc = parseCtx(ctx);
    if (!pc.ok) return pc;
    if (pc.c.actor.kind === "PUBLIC") return sellFail("FORBIDDEN", { reason: "OTP_REQUIRED" });
    const p = requestInput.safeParse(input);
    if (!p.success) return invalidInput(p.error);
    return requestCore(pc.c, p.data, "refund", opts);
  });
}
/** tripSellable.cancel EXECUTE บนการจองที่ขายแล้ว = ยื่นคำขอคืนเงิน (คีย์ `cancel:<bookingId>:<nsKey>` · CC :351) — ผู้เรียก (booking.ts) parse ctx แล้ว */
export async function requestTripRefundForCancel(c: Ctx, input: unknown, opts?: RefundOpts): Promise<SellResult<RefundRequestValue>> {
  const p = requestInput.safeParse(input);
  if (!p.success) return invalidInput(p.error);
  return requestCore(c, p.data, "cancel", opts);
}

// ═══════════════════════ §8.2 ตัดสิน · §8.3 ถอน ═══════════════════════
const decideInput = z.strictObject({
  requestId: ID,
  decision: z.enum(["APPROVE", "REJECT"]),
  reason: tripText(500).pipe(z.string().min(1)).optional(),
  manualDeltaSatang: z.number().int().min(-INT4).max(INT4).optional(),
  manualReason: tripText(500).optional(),
  approvalId: ID.optional(),
  idempotencyKey: IDEM_KEY,
});
export type DecideValue = { requestId: string; status: string; amountSatang: number; manualDeltaSatang: number; warnings: string[]; replayed: boolean };
const staffOnlyGate = (c: Ctx): Failure | null => (c.actor.kind === "STAFF" ? null : sellFail("FORBIDDEN"));
/** การจองของคำขอ + ความสดของใบเสนอใต้ล็อก (version · ยอดสุทธิที่รับ) */
async function lockFreshBooking(tx: Tx, g: Gate, r: ReqRow, comp: Computed): Promise<MoneyBooking> {
  const b = await lockMoneyBookingInTx(tx, g, r.bookingId);
  if (!b) throw new BookingAbort("NOT_FOUND");
  if (b.version !== comp.bookingVersion || b.paidSatang - b.refundedSatang !== comp.paidSatang) throw new BookingAbort("STATE_CONFLICT", { reason: "STALE_QUOTE" });
  return b;
}
/** คำอนุมัติใช้ได้ครั้งเดียว: advisory ต่อ id → หาแถว trips.approval.consumed → เขียนแถว (แบบ T0.6 consumeApprovalsInTx · ดัชนี AuditLog_action_idx) */
async function consumeApprovalInTx(tx: Tx, c: Ctx, g: Gate, approvalId: string, requestId: string): Promise<void> {
  await lockMoneyKey(tx, "approval", approvalId);
  const used = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "AuditLog" WHERE "action" = ${APPROVAL_CONSUMED} AND "tenantId" = ${g.tenantId} AND "targetId" = ${approvalId} LIMIT 1`;
  if (used.length) throw new BookingAbort("FORBIDDEN", { reason: "APPROVAL_USED" });
  await auditMoney(tx, audActor(c, g), APPROVAL_CONSUMED, { type: "ApprovalRequest", id: approvalId }, { refundRequestId: requestId });
}

/**
 * ตัดสินคำขอ (§8.2 · STAFF): QUOTED → APPROVED/REJECTED (CAS) · ใบเสนอต้องสด (version + ยอดที่รับ) ไม่งั้น STALE_QUOTE ·
 * แก้ยอดมือ (เฉพาะส่วนไม่ใช่เก็บแทน · 0 ≤ ส่วนไม่ใช่เก็บแทน + delta ≤ ที่รับจริง) · |delta| > X13 ⇒ ต้องมีคำอนุมัติที่ผูก (หน่วย · คำขอ · ยอดสุดท้าย) ใช้ครั้งเดียว
 */
export async function decideTripRefund(ctx: unknown, input: unknown): Promise<SellResult<DecideValue>> {
  return tripsSafely("decideTripRefund", ctx, async () => {
    const pc = parseCtx(ctx);
    if (!pc.ok) return pc;
    const c = pc.c;
    const sg = staffOnlyGate(c);
    if (sg) return sg;
    const p = decideInput.safeParse(input);
    if (!p.success) return invalidInput(p.error);
    const v = p.data;
    if (v.decision === "REJECT" && !v.reason) return sellFail("VALIDATION", { fields: ["reason"] });
    const g = await gateOf(c);
    if (!g) return NF();
    const db = unitClient(g);
    const r = await readRequest(db, g, v.requestId);
    if (!r) return NF();
    const keyHash = sha256hex(`refund-decide:${r.id}:${moneyNsKey(c, v.idempotencyKey)}`);
    const bodyHash = holdRequestHash({ op: "trips.refund.decide.v1", decision: v.decision, reason: v.reason ?? null, delta: v.manualDeltaSatang ?? 0, manualReason: v.manualReason ?? null, approvalId: v.approvalId ?? null });
    const fromAudit = (a: Record<string, unknown>): SellResult<DecideValue> =>
      a.bodyHash === bodyHash
        ? { ok: true, value: { requestId: r.id, status: String(a.status), amountSatang: Number(a.amountSatang), manualDeltaSatang: Number(a.manualDeltaSatang ?? 0), warnings: String(a.warnings ?? "").split(",").filter(Boolean), replayed: true } }
        : sellFail("IDEMPOTENCY_CONFLICT");
    const lookup = (dbx: Tx) => idemAudit(dbx, g.tenantId, r, ["trips.refund.approve", "trips.refund.reject"], keyHash);
    if (r.status !== "QUOTED") {
      const a = await lookup(db);
      return a ? fromAudit(a) : sellFail("STATE_CONFLICT");
    }
    const comp = computedOf(r.computed);
    if (!comp) return sellFail("VALIDATION", { reason: "SNAPSHOT_INVALID" });
    const delta = v.decision === "APPROVE" ? (v.manualDeltaSatang ?? 0) : 0;
    const warnings: string[] = [];
    let final = comp.refundSatang;
    let approvalId: string | null = null;
    if (delta !== 0) {
      if ((v.manualReason ?? "").length < 10) return sellFail("VALIDATION", { reason: "MANUAL_REASON_REQUIRED" });
      const paidNonPt = comp.lines.filter((l) => l.rule === "BP").reduce((s, l) => s + l.paidSatang, 0);
      const nonPtAfter = comp.refundNonPtSatang + delta;
      if (nonPtAfter < 0 || nonPtAfter > paidNonPt) return sellFail("VALIDATION", { reason: "OVER_REFUND" });
      final = comp.refundSatang + delta;
      if (final < 0 || final > INT4 || final > comp.paidSatang) return sellFail("VALIDATION", { reason: "OVER_REFUND" });
      const cap = await settingInt(c, K_MANUAL_APPROVAL);
      if (cap === null) return sellFail("VALIDATION", { reason: "SETTINGS_INVALID" });
      if (Math.abs(delta) > cap) {
        const entityId = tripRefundEntityId({ unitId: g.unitId, requestId: r.id, amountSatang: final });
        if (!v.approvalId) return sellFail("REQUIRES_APPROVAL", { entityType: TRIP_REFUND_ENTITY, entityId, amountSatang: final });
        const x = (await requestBindings({ tenantId: g.tenantId }, [v.approvalId]))[v.approvalId];
        if (!x || x.status !== "APPROVED" || x.entityType !== TRIP_REFUND_ENTITY || x.entityId !== entityId || x.unitId !== g.unitId) {
          return sellFail("FORBIDDEN", { reason: "APPROVAL_NOT_APPROVED" });
        }
        approvalId = v.approvalId;
      }
      if (final < comp.refundSatang) warnings.push("MANUAL_BELOW_POLICY");
    }
    const to = v.decision === "APPROVE" ? "APPROVED" : "REJECTED";
    const merge = JSON.stringify({
      ...(v.reason ? { decisionReason: v.reason } : {}),
      ...(delta !== 0 ? { manualReason: v.manualReason ?? "" } : {}),
      decisionWarnings: warnings,
    });
    const out = await runTripsTx(g, async (tx): Promise<{ replay: Record<string, unknown> } | { value: DecideValue }> => {
      await lockFreshBooking(tx, g, r, comp); // 2b
      if (approvalId) await consumeApprovalInTx(tx, c, g, approvalId, r.id);
      const cas = await tx.$queryRaw<{ id: string }[]>`
        UPDATE "TripRefundRequest" SET "status" = ${to}, "amountSatang" = ${final}, "manualDeltaSatang" = ${delta}, "approvalId" = ${approvalId}::text,
          "decidedById" = ${c.actor.kind === "STAFF" ? c.actor.userId : null}::text, "computed" = "computed" || ${merge}::jsonb, "updatedAt" = now()
        WHERE "id" = ${r.id} AND "tenantId" = ${g.tenantId} AND "unitId" = ${g.unitId} AND "status" = 'QUOTED'
        RETURNING "id"`;
      if (cas.length !== 1) {
        const a = await lookup(tx);
        if (a) return { replay: a };
        throw new BookingAbort("STATE_CONFLICT");
      }
      if (to === "APPROVED") await emitMoney(tx, g, [refundEvt("trips.refund.approved", r, final)]);
      await auditMoney(tx, audActor(c, g), to === "APPROVED" ? "trips.refund.approve" : "trips.refund.reject", { type: "TripRefundRequest", id: r.id }, {
        status: to,
        bookingId: r.bookingId,
        amountSatang: final,
        manualDeltaSatang: delta,
        approvalId,
        warnings: warnings.join(","),
        idemKeyHash: keyHash,
        bodyHash,
      }, { status: "QUOTED", amountSatang: r.amountSatang });
      return { value: { requestId: r.id, status: to, amountSatang: final, manualDeltaSatang: delta, warnings, replayed: false } };
    });
    if (!out.ok) return out;
    return "replay" in out.value ? fromAudit(out.value.replay) : { ok: true, value: out.value.value };
  });
}

const withdrawInput = z.strictObject({ requestId: ID, reason: tripText(500).pipe(z.string().min(1)), idempotencyKey: IDEM_KEY });
/**
 * ถอนคำขอ (§8.3 · STAFF): QUOTED → WITHDRAWN (CAS) · APPROVED → WITHDRAWN เฉพาะผู้มีสิทธิ์อนุมัติ (opts.canDecide === true · มติ r1 V4 —
 * ทางออกของคำขอที่อนุมัติแล้วแต่บันทึกโอนคืนไม่ได้ · นอกตาราง CC :709 ซึ่งคงไว้ใน TRIP_REFUND_TRANSITIONS) · อื่น ⇒ STATE_CONFLICT
 */
export async function withdrawTripRefund(ctx: unknown, input: unknown, opts?: RefundOpts): Promise<SellResult<{ requestId: string; status: "WITHDRAWN"; replayed: boolean }>> {
  return tripsSafely("withdrawTripRefund", ctx, async () => {
    const pc = parseCtx(ctx);
    if (!pc.ok) return pc;
    const c = pc.c;
    const sg = staffOnlyGate(c);
    if (sg) return sg;
    const p = withdrawInput.safeParse(input);
    if (!p.success) return invalidInput(p.error);
    const v = p.data;
    const g = await gateOf(c);
    if (!g) return NF();
    const db = unitClient(g);
    const r = await readRequest(db, g, v.requestId);
    if (!r) return NF();
    const keyHash = sha256hex(`refund-withdraw:${r.id}:${moneyNsKey(c, v.idempotencyKey)}`);
    const bodyHash = holdRequestHash({ op: "trips.refund.withdraw.v1", reason: v.reason });
    const ok = { ok: true as const, value: { requestId: r.id, status: "WITHDRAWN" as const, replayed: true } };
    const lookup = (dbx: Tx) => idemAudit(dbx, g.tenantId, r, ["trips.refund.withdraw"], keyHash);
    const from: string[] = opts?.canDecide === true ? ["QUOTED", "APPROVED"] : ["QUOTED"];
    if (!from.includes(r.status)) {
      const a = await lookup(db);
      return a ? (a.bodyHash === bodyHash ? ok : sellFail("IDEMPOTENCY_CONFLICT")) : sellFail("STATE_CONFLICT");
    }
    const merge = JSON.stringify({ withdrawReason: v.reason });
    const out = await runTripsTx(g, async (tx): Promise<"DONE" | { replay: Record<string, unknown> }> => {
      const b = await lockMoneyBookingInTx(tx, g, r.bookingId); // 2b
      if (!b) throw new BookingAbort("NOT_FOUND");
      const cas = await tx.$queryRaw<{ id: string }[]>`
        UPDATE "TripRefundRequest" SET "status" = 'WITHDRAWN', "computed" = "computed" || ${merge}::jsonb, "updatedAt" = now()
        WHERE "id" = ${r.id} AND "tenantId" = ${g.tenantId} AND "unitId" = ${g.unitId} AND "status" = ANY(${from}::text[])
        RETURNING "id"`;
      if (cas.length !== 1) {
        const a = await lookup(tx);
        if (a) return { replay: a };
        throw new BookingAbort("STATE_CONFLICT");
      }
      await auditMoney(tx, audActor(c, g), "trips.refund.withdraw", { type: "TripRefundRequest", id: r.id }, { status: "WITHDRAWN", bookingId: r.bookingId, amountSatang: r.amountSatang, idemKeyHash: keyHash, bodyHash }, { status: r.status });
      return "DONE";
    });
    if (!out.ok) return out;
    if (out.value !== "DONE") return out.value.replay.bodyHash === bodyHash ? ok : sellFail("IDEMPOTENCY_CONFLICT");
    return { ok: true, value: { requestId: r.id, status: "WITHDRAWN", replayed: false } };
  });
}

// ═══════════════════════ §8.4 บันทึกโอนคืน (DONE) ═══════════════════════
const executeInput = z.strictObject({
  requestId: ID,
  idempotencyKey: IDEM_KEY,
  bankTender: z.enum(["PROMPTPAY", "TRANSFER"]).optional(),
  evidenceFileId: ID.optional(),
  reference: MONEY_REFERENCE.optional(),
});
export type RefundMoneyEventDTO = { id: string; kind: "REFUNDED" | "RETAINED"; receivedEventId: string; tender: string; amountSatang: number; vatSatang: number; passThroughSatang: number };
export type ExecuteValue = { requestId: string; status: "DONE"; bookingId: string; bookingStatus: "CANCELLED"; refundedSatang: number; events: RefundMoneyEventDTO[]; replayed: boolean };

/** 1a: คืนที่นั่งของการจอง (จุดปล่อยที่ของ G.3 — มติ §22 ข้อ 3 · ย้ายจุดได้ด้วยการย้ายการเรียกฟังก์ชันนี้ที่เดียว) */
async function returnSeatsForRefundInTx(tx: Tx, c: Ctx, b: MoneyBooking, policies: CapacityPolicies | undefined): Promise<number> {
  const seats = seatsOfSnapshot(b.policySnapshot as SnapshotShape);
  if (seats <= 0) return 0;
  const rr = await returnSoldInTx(tx, moneySellCtx(c), { departureId: b.departureId, qty: seats }, policies);
  if (!rr.ok) throw new BookingAbort(rr.code, rr.details);
  return seats;
}
type RcvRow = { id: string; dueId: string | null; tender: string; amountSatang: number; vatSatang: number; passThroughSatang: number };
async function refundEventsOf(db: Tx, g: Gate, bookingId: string, requestId: string): Promise<RefundMoneyEventDTO[]> {
  const rows = await db.$queryRaw<{ id: string; kind: "REFUNDED" | "RETAINED"; idempotencyKey: string; tender: string; amountSatang: number; vatSatang: number; passThroughSatang: number }[]>`
    SELECT "id", "kind", "idempotencyKey", "tender", "amountSatang", "vatSatang", "passThroughSatang" FROM "TripMoneyEvent"
    WHERE "bookingId" = ${bookingId} AND "tenantId" = ${g.tenantId} AND "unitId" = ${g.unitId} AND "kind" IN ('REFUNDED', 'RETAINED') ORDER BY "createdAt", "id"`;
  const pre = [`trips-ref:${requestId}:`, `trips-ret:${requestId}:`];
  return rows
    .filter((r) => pre.some((p) => r.idempotencyKey.startsWith(p)))
    .map((r) => ({ id: r.id, kind: r.kind, receivedEventId: r.idempotencyKey.split(":").slice(2).join(":"), tender: r.tender, amountSatang: Number(r.amountSatang), vatSatang: Number(r.vatSatang), passThroughSatang: Number(r.passThroughSatang) }));
}

/**
 * บันทึกโอนคืน (§8.4 · STAFF · "ร้านโอนคืนเองแล้ว"): APPROVED → EXECUTING → DONE ในธุรกรรมเดียว · คืนที่นั่ง → การจอง CANCELLED → ปล่อยโค้ด
 * แถวคืนต่อใบรับเดิม (tender ตามใบ · กลุ่มธนาคารใช้ bankTender ได้) · ยอดคืน 0 ⇒ มีแต่ RETAINED · คีย์ trips-ref/trips-ret:<requestId>:<receivedEventId>
 * กันซ้ำ: advisory `refund:<requestId>` + idemKeyHash/bodyHash ใน audit trips.refund.execute
 */
export async function executeTripRefund(ctx: unknown, input: unknown): Promise<SellResult<ExecuteValue>> {
  return tripsSafely("executeTripRefund", ctx, async () => {
    const pc = parseCtx(ctx);
    if (!pc.ok) return pc;
    const c = pc.c;
    const sg = staffOnlyGate(c);
    if (sg) return sg;
    const p = executeInput.safeParse(input);
    if (!p.success) return invalidInput(p.error);
    const v = p.data;
    const g = await gateOf(c);
    if (!g) return NF();
    const db = unitClient(g);
    const r0 = await readRequest(db, g, v.requestId);
    if (!r0) return NF();
    const keyHash = sha256hex(`refund-execute:${r0.id}:${moneyNsKey(c, v.idempotencyKey)}`);
    const bodyHash = holdRequestHash({ op: "trips.refund.execute.v1", bankTender: v.bankTender ?? null, evidenceFileId: v.evidenceFileId ?? null, reference: v.reference ?? null });
    const fromAudit = async (a: Record<string, unknown>, dbx: Tx): Promise<SellResult<ExecuteValue>> => {
      if (a.bodyHash !== bodyHash) return sellFail("IDEMPOTENCY_CONFLICT");
      return { ok: true, value: { requestId: r0.id, status: "DONE", bookingId: r0.bookingId, bookingStatus: "CANCELLED", refundedSatang: Number(a.refundedSatang ?? 0), events: await refundEventsOf(dbx, g, r0.bookingId, r0.id), replayed: true } };
    };
    const lookup = (dbx: Tx) => idemAudit(dbx, g.tenantId, r0, ["trips.refund.execute"], keyHash);
    if (r0.status !== "APPROVED") {
      if (r0.status === "DONE") {
        const a = await lookup(db);
        if (a) return fromAudit(a, db);
      }
      return sellFail("STATE_CONFLICT");
    }
    if (v.evidenceFileId) {
      const f = await db.$queryRaw<{ id: string }[]>`SELECT "id" FROM "FileAsset" WHERE "id" = ${v.evidenceFileId} AND "tenantId" = ${g.tenantId}`;
      if (!f.length) return NF();
    }
    const b0 = await readMoneyBooking(db, g, r0.bookingId);
    if (!b0) return NF();
    const pol = await loadCapacityPolicies(moneySellCtx(c), { departureIds: [b0.departureId] });
    const policies = pol.ok ? pol.value : undefined;
    const out = await runTripsTx(g, async (tx): Promise<{ replay: Record<string, unknown> } | { value: ExecuteValue }> => {
      await lockMoneyKey(tx, "refund", r0.id); // ชั้น 0
      const r = await readRequest(tx, g, r0.id);
      if (!r) throw new BookingAbort("NOT_FOUND");
      if (r.status !== "APPROVED") {
        const a = r.status === "DONE" ? await lookup(tx) : null;
        if (a) return { replay: a };
        throw new BookingAbort("STATE_CONFLICT");
      }
      const comp = computedOf(r.computed);
      if (!comp) throw new BookingAbort("VALIDATION", { reason: "SNAPSHOT_INVALID" });
      const bu = await readMoneyBooking(tx, g, r.bookingId);
      if (!bu) throw new BookingAbort("NOT_FOUND");
      // 1a คืนที่นั่ง
      await returnSeatsForRefundInTx(tx, c, bu, policies);
      // 2b
      const b = await lockMoneyBookingInTx(tx, g, r.bookingId);
      if (!b) throw new BookingAbort("NOT_FOUND");
      // มติ r1 V4: ไม่ผูกกับรุ่นของการจอง (รุ่นขยับได้จากเลนอื่น เช่น T0.8) — ตรวจข้อเท็จจริงเงินที่ใบเสนอคิดจากใต้ล็อกแทน
      //   ยอดสุทธิที่รับ · รอบ · ชุดแถวเงินทั้งหมด (ไม่มีแถวใหม่) · หลักฐานเก็บแทน · สถานะยังคืนได้ — เปลี่ยน ⇒ rollback แล้วคำนวณใหม่เป็น QUOTED (ต้องอนุมัติใหม่)
      if (!REFUNDABLE.has(b.status) || !canTransitionBooking(b.status, "CANCELLED", c.actor.kind)) throw new BookingAbort("STATE_CONFLICT", { reason: "NOT_REFUNDABLE_STATUS" });
      const facts = await quoteFactsOf(tx, g, b);
      if (b.departureId !== bu.departureId || b.paidSatang - b.refundedSatang !== comp.paidSatang || (comp.facts ? !sameFacts(comp.facts, facts) : false)) {
        throw new BookingAbort("STATE_CONFLICT", { reason: FACTS_CHANGED });
      }
      const gate = moneyBookingGate(b);
      if (gate) throw new BookingAbort(gate.code, gate.details);
      // 2b′ APPROVED → EXECUTING → DONE (สองคำสั่ง · EXECUTING ไม่ค้างในฐาน)
      const ex = await tx.$queryRaw<{ id: string }[]>`
        UPDATE "TripRefundRequest" SET "status" = 'EXECUTING', "updatedAt" = now()
        WHERE "id" = ${r.id} AND "tenantId" = ${g.tenantId} AND "unitId" = ${g.unitId} AND "status" = 'APPROVED'
        RETURNING "id"`;
      if (ex.length !== 1) throw new BookingAbort("STATE_CONFLICT");
      const dn = await tx.$queryRaw<{ id: string }[]>`
        UPDATE "TripRefundRequest" SET "status" = 'DONE', "updatedAt" = now()
        WHERE "id" = ${r.id} AND "tenantId" = ${g.tenantId} AND "unitId" = ${g.unitId} AND "status" = 'EXECUTING'
        RETURNING "id"`;
      if (dn.length !== 1) throw new BookingAbort("STATE_CONFLICT");
      // 2d แถวเงิน — ใบรับเดิมเรียง (seq ของงวด, createdAt, id)
      const receipts = await tx.$queryRaw<RcvRow[]>`
        SELECT e."id", e."dueId", e."tender", e."amountSatang", e."vatSatang", e."passThroughSatang" FROM "TripMoneyEvent" e
        LEFT JOIN "TripPaymentDue" d ON d."id" = e."dueId" AND d."tenantId" = e."tenantId"
        WHERE e."bookingId" = ${b.id} AND e."tenantId" = ${g.tenantId} AND e."unitId" = ${g.unitId} AND e."kind" = 'RECEIVED'
        ORDER BY d."seq" NULLS LAST, e."createdAt", e."id"`;
      const prior = await tx.$queryRaw<{ n: number }[]>`
        SELECT count(*)::int AS "n" FROM "TripMoneyEvent" WHERE "bookingId" = ${b.id} AND "tenantId" = ${g.tenantId} AND "kind" IN ('REFUNDED', 'RETAINED')`;
      if (Number(prior[0]?.n ?? 0) > 0) throw new BookingAbort("STATE_CONFLICT", { reason: "INTEGRITY" });
      if (receipts.reduce((s, x) => s + Number(x.amountSatang), 0) !== b.paidSatang) throw new BookingAbort("STATE_CONFLICT", { reason: "INTEGRITY" });
      const vatCtx = receiptVatCtxOf(b.policySnapshot);
      if (!vatCtx) throw new BookingAbort("VALIDATION", { reason: "SNAPSHOT_INVALID" });
      const refundPt = comp.refundPassThroughSatang;
      const refundNonPt = r.amountSatang - refundPt;
      if (refundNonPt < 0 || refundNonPt !== comp.refundNonPtSatang + r.manualDeltaSatang) throw new BookingAbort("VALIDATION", { reason: "OVER_REFUND" });
      const plan = planRefundSlices({
        receipts: receipts.map((x) => ({ eventId: x.id, dueId: x.dueId, tender: x.tender, amountSatang: Number(x.amountSatang), vatableSatang: Number(x.amountSatang) - Number(x.passThroughSatang), passThroughSatang: Number(x.passThroughSatang), vatSatang: Number(x.vatSatang) })),
        refundNonPtSatang: refundNonPt,
        refundPassThroughSatang: refundPt,
        vatCtx,
      });
      if (!plan.ok) throw new BookingAbort("VALIDATION", { reason: "OVER_REFUND" });
      // ยอดคืนไม่เกินที่รับต่อกลุ่ม tender (ค่าคงที่ §16 ข้อ 5 · ตรวจซ้ำนอกเหนือจากต่อใบ)
      const byGroup = new Map<string, number>();
      for (const x of receipts) byGroup.set(String(tenderGroupOf(x.tender)), (byGroup.get(String(tenderGroupOf(x.tender))) ?? 0) + Number(x.amountSatang));
      for (const x of plan.refunded) byGroup.set(String(tenderGroupOf(x.tender)), (byGroup.get(String(tenderGroupOf(x.tender))) ?? 0) - x.amountSatang);
      if ([...byGroup.values()].some((n) => n < 0)) throw new BookingAbort("VALIDATION", { reason: "OVER_REFUND" });
      const iso = c.clock.iso;
      const insert = async (kind: "REFUNDED" | "RETAINED", x: (typeof plan.refunded)[number], tender: string, key: string) => {
        const id = newId("tme_");
        await tx.$queryRaw`
          INSERT INTO "TripMoneyEvent" ("id", "tenantId", "unitId", "bookingId", "kind", "amountSatang", "vatSatang", "passThroughSatang", "dueId", "tender",
            "postingStatus", "postingAttempts", "slipId", "idempotencyKey", "createdAt", "updatedAt")
          VALUES (${id}, ${g.tenantId}, ${g.unitId}, ${b.id}, ${kind}, ${x.amountSatang}, ${x.vatSatang}, ${x.passThroughSatang}, ${x.dueId}::text, ${tender},
            'UNPOSTED', 0, NULL, ${key}, ${iso}::timestamp, ${iso}::timestamp)
          RETURNING "id"`;
        return { id, kind, receivedEventId: x.eventId, tender, amountSatang: x.amountSatang, vatSatang: x.vatSatang, passThroughSatang: x.passThroughSatang };
      };
      const events: RefundMoneyEventDTO[] = [];
      for (const x of plan.refunded) {
        const tender = tenderGroupOf(x.tender) === "BANK" && v.bankTender ? v.bankTender : x.tender;
        events.push(await insert("REFUNDED", x, tender, `trips-ref:${r.id}:${x.eventId}`));
      }
      for (const x of plan.retained) events.push(await insert("RETAINED", x, x.tender, `trips-ret:${r.id}:${x.eventId}`));
      const refunded = plan.refunded.reduce((s, x) => s + x.amountSatang, 0);
      if (refunded !== r.amountSatang) throw new BookingAbort("VALIDATION", { reason: "OVER_REFUND" });
      // งวดที่ยังเปิด → CANCELLED (CAS · §8.4 · มติ r1 V3) — งวด PAID คงเป็น PAID (ยอดที่รับคงอยู่ในแถว)
      await tx.$queryRaw`
        UPDATE "TripPaymentDue" SET "status" = 'CANCELLED', "updatedAt" = now()
        WHERE "bookingId" = ${b.id} AND "tenantId" = ${g.tenantId} AND "unitId" = ${g.unitId} AND "status" = ANY(ARRAY['OPEN','PARTLY_PAID','OVERDUE']::text[])
        RETURNING "id"`;
      // 2b CAS การจอง → CANCELLED
      const cas = await tx.$queryRaw<{ version: number }[]>`
        UPDATE "TripBooking" SET "status" = 'CANCELLED', "version" = "version" + 1, "refundedSatang" = "refundedSatang" + ${refunded},
          "cancelReason" = ${typeof comp.reason === "string" ? comp.reason : null}::text, "cancelledAt" = ${iso}::timestamp, "updatedAt" = now()
        WHERE "id" = ${b.id} AND "tenantId" = ${g.tenantId} AND "unitId" = ${g.unitId} AND "status" = ${b.status} AND "version" = ${b.version}
          AND "refundedSatang" + ${refunded} <= "paidSatang"
        RETURNING "version"`;
      const nv = cas[0]?.version;
      if (nv === undefined) throw new BookingAbort("STATE_CONFLICT");
      // กฎโค้ด (หลังคืนที่นั่งเสมอ · wo-notes T0.6)
      await releasePromoInTx(tx, moneySellCtx(c), { bookingId: b.id });
      // 2h
      const payable = payableOfSnapshot(b.policySnapshot) ?? 0;
      await emitMoney(tx, g, [
        refundEvt("trips.refund.done", r, r.amountSatang),
        { type: "trips.booking.cancelled", key: b.id, payload: bookingEventPayload(g, b, "CANCELLED", payable) },
      ]);
      const retained = plan.retained.reduce((s, x) => s + x.amountSatang, 0);
      await auditMoney(tx, audActor(c, g), "trips.refund.execute", { type: "TripRefundRequest", id: r.id }, {
        status: "DONE",
        bookingId: b.id,
        bookingVersion: nv,
        refundedSatang: refunded,
        retainedSatang: retained,
        bankTender: v.bankTender ?? null,
        evidenceFileId: v.evidenceFileId ?? null,
        idemKeyHash: keyHash,
        bodyHash,
        ...(v.reference ? { reference: v.reference } : {}),
      }, { status: "APPROVED", bookingStatus: b.status, bookingVersion: b.version });
      return { value: { requestId: r.id, status: "DONE", bookingId: b.id, bookingStatus: "CANCELLED", refundedSatang: refunded, events, replayed: false } };
    });
    if (!out.ok) {
      if (out.code === "STATE_CONFLICT" && out.details?.reason === FACTS_CHANGED) return requoteApproved(c, g, r0.id);
      return out;
    }
    return "replay" in out.value ? fromAudit(out.value.replay, db) : { ok: true, value: out.value.value };
  });
}

/** เหตุภายใน: ข้อเท็จจริงเงินเปลี่ยนหลังอนุมัติ (ไม่ส่งถึงผู้เรียก — แปลงเป็นการคำนวณใหม่) */
const FACTS_CHANGED = "FACTS_CHANGED";
/**
 * มติ r1 V4: คำขอ APPROVED ที่ข้อเท็จจริงเงินเปลี่ยน ⇒ ธุรกรรมใหม่ 2b การจอง → คำนวณใบเสนอใหม่ ณ ctx.now → CAS APPROVED → QUOTED
 * (ล้างยอดแก้มือ/คำอนุมัติ/ผู้ตัดสิน · ต้องอนุมัติใหม่) → audit trips.refund.requote — คืน STATE_CONFLICT reason QUOTE_REFRESHED (+ ยอดใหม่)
 * การจองไม่อยู่ในสถานะคืนได้แล้ว ⇒ STATE_CONFLICT NOT_REFUNDABLE_STATUS (ทางออก: ผู้มีสิทธิ์อนุมัติถอน APPROVED → WITHDRAWN)
 */
async function requoteApproved(c: Ctx, g: Gate, requestId: string): Promise<SellResult<ExecuteValue>> {
  const out = await runTripsTx(g, async (tx): Promise<SellResult<ExecuteValue>> => {
    const r = await readRequest(tx, g, requestId);
    if (!r) throw new BookingAbort("NOT_FOUND");
    const b = await lockMoneyBookingInTx(tx, g, r.bookingId); // 2b
    if (!b) throw new BookingAbort("NOT_FOUND");
    if (!REFUNDABLE.has(b.status)) throw new BookingAbort("STATE_CONFLICT", { reason: "NOT_REFUNDABLE_STATUS" });
    const comp = computedOf(r.computed);
    if (r.status !== "APPROVED" || !comp) throw new BookingAbort("STATE_CONFLICT");
    const q = await tripRefundQuote(tx, g, b, c.clock.iso, r.reasonKind as RefundReasonKind, comp.deductionsSatang);
    if (!q.ok) throw new BookingAbort(q.code, q.details);
    const fresh: Computed = { ...q.value, bookingVersion: b.version, quotedAt: c.clock.iso, reason: comp.reason, facts: await quoteFactsOf(tx, g, b) };
    const cas = await tx.$queryRaw<{ id: string }[]>`
      UPDATE "TripRefundRequest" SET "status" = 'QUOTED', "amountSatang" = ${q.value.refundSatang}, "manualDeltaSatang" = 0, "approvalId" = NULL, "decidedById" = NULL,
        "computed" = ${JSON.stringify(fresh)}::jsonb, "updatedAt" = now()
      WHERE "id" = ${r.id} AND "tenantId" = ${g.tenantId} AND "unitId" = ${g.unitId} AND "status" = 'APPROVED'
      RETURNING "id"`;
    if (cas.length !== 1) throw new BookingAbort("STATE_CONFLICT");
    await auditMoney(tx, audActor(c, g), "trips.refund.requote", { type: "TripRefundRequest", id: r.id }, { status: "QUOTED", bookingId: b.id, amountSatang: q.value.refundSatang, bookingVersion: b.version }, { status: "APPROVED", amountSatang: r.amountSatang });
    return sellFail("STATE_CONFLICT", { reason: "QUOTE_REFRESHED", requestId: r.id, amountSatang: q.value.refundSatang });
  });
  return out.ok ? out.value : out;
}

// ═══════════════════════ §8.5 อ่าน ═══════════════════════
const getInput = z.strictObject({ requestId: ID });
const listInput = z.strictObject({ status: z.enum(TRIP_REFUND_STATUSES).optional(), bookingId: ID.optional(), limit: z.number().int().min(1).max(200).optional() });
const readerGate = (c: Ctx): Failure | null => (c.actor.kind === "STAFF" || c.actor.kind === "SYSTEM" ? null : sellFail("FORBIDDEN"));
export async function getTripRefund(ctx: unknown, input: unknown): Promise<SellResult<TripRefundDTO>> {
  return tripsSafely("getTripRefund", ctx, async () => {
    const pc = parseCtx(ctx);
    if (!pc.ok) return pc;
    const rg = readerGate(pc.c);
    if (rg) return rg;
    const p = getInput.safeParse(input);
    if (!p.success) return invalidInput(p.error);
    const g = await gateOf(pc.c);
    if (!g) return NF();
    const r = await readRequest(unitClient(g), g, p.data.requestId);
    return r ? { ok: true, value: dtoOf(r) } : NF();
  });
}
/** ดัชนี: bookingId ⇒ TripRefundRequest_bookingId_idx · อื่น ⇒ TripRefundRequest_tenantId_unitId_status_idx */
export async function listTripRefunds(ctx: unknown, input: unknown): Promise<SellResult<{ items: TripRefundDTO[] }>> {
  return tripsSafely("listTripRefunds", ctx, async () => {
    const pc = parseCtx(ctx);
    if (!pc.ok) return pc;
    const rg = readerGate(pc.c);
    if (rg) return rg;
    const p = listInput.safeParse(input ?? {});
    if (!p.success) return invalidInput(p.error);
    const v = p.data;
    const g = await gateOf(pc.c);
    if (!g) return NF();
    const st = v.status ? Prisma.sql`AND "status" = ${v.status}` : Prisma.empty;
    const bk = v.bookingId ? Prisma.sql`AND "bookingId" = ${v.bookingId}` : Prisma.empty;
    const rows = await unitClient(g).$queryRaw<ReqRow[]>`
      SELECT ${REQ_COLS} FROM "TripRefundRequest" WHERE "tenantId" = ${g.tenantId} AND "unitId" = ${g.unitId} ${st} ${bk}
      ORDER BY "createdAt" DESC, "id" LIMIT ${v.limit ?? 50}`;
    return { ok: true, value: { items: rows.map(dtoOf) } };
  });
}
// ── /T0.7 refund ──
