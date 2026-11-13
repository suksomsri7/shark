// ─────────────────────────────────────────────────────────────
// trips/money.ts — เงินฝั่ง trips: งวดจ่าย (ensureTripDuesInTx) · รับเงิน (recordTripPayment) · QR พร้อมเพย์ยอดล็อก · สรุปเงิน · ข้อมูลเงินสดรายวัน · RUN TRIPS T0.7a
// ใบสั่ง ledger/trips-briefs/T0.7.md §5 §6 §7 §10 §11 §12 (§22 มติผู้คุมชนะ) · CC §G.1 §H.0–§H.2 §J.1
//
// 🔴 นอก tx เท่านั้น: gateOf · อ่านการจอง/สลิปไม่ล็อก · กันซ้ำล่วงหน้า · promptpayQrFor · (ไม่มี connection ที่สองในธุรกรรม · pool 10)
// 🔴 ลำดับล็อกรับเงิน (§10): ชั้น 0 advisory `pay:<bookingId>` → [HOLD: 1a รอบ → 2a CAS hold ผ่าน convertHoldForBookingInTx] → 2b การจอง FOR UPDATE →
//    2d งวด (CAS คำสั่งเดียว) + INSERT RECEIVED → 2b CAS การจอง (paid + a ≤ payable · status · version) → 2h outbox + audit
// 🔴 ทุกแถวเงิน postingStatus 'UNPOSTED' (T0.7b ลงบัญชีย้อนด้วยคีย์เดิม) · ไม่เรียกบัญชี/POS · ไม่มี DELETE · ไม่ส่ง object ผู้เรียกเข้า Prisma data
// 🔴 รุ่นของการจองอ่านใต้ล็อกเสมอ (มติ §22 ข้อ 5) · การจองที่ลบข้อมูลผู้จองแล้ว (piiPurgedAt) ⇒ STATE_CONFLICT BOOKER_PURGED (หมายเหตุผู้คุม 13 พ.ย.)
// ─────────────────────────────────────────────────────────────
import { createHash, randomBytes } from "node:crypto";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { emitOutboxMany } from "@/lib/core/outbox";
import type { SellActor, SellCtx, SellResult } from "@/lib/core/sellable";
import { promptpayQrFor } from "@/lib/payment/receiver";
import { BookingAbort, runTripsTx, tripsSafely } from "./booking";
import { asTx, convertHoldForBookingInTx, invalidInput, parseCtx, sellFail, type Ctx, type Failure, type Gate, type Tx } from "./capacity";
import { idemKeyFor } from "./capacity-core";
import { gateOf, unitClient } from "./capacity-service";
import { addDaysYmd, localToUtc } from "./departures-core";
import {
  TRIP_DUE_OPEN_STATUSES,
  TRIP_REFUND_OPEN_STATUSES,
  TRIP_TENDERS,
  MONEY_REFERENCE,
  allocatePayment,
  bookingStatusAfterPayment,
  dueDraftsFromSnapshot,
  moneyDocumentOf,
  receiptVatCtxOf,
  receiptVatSatang,
  type DueDraft,
  type DueState,
} from "./money-core";
import { snapshotValue } from "./snapshot";
import { BOOKING_SOLD_STATUSES, canTransitionBooking } from "./state";

// ── T0.7 money ──
const INT4 = 2_147_483_647;
const sha256hex = (s: string) => createHash("sha256").update(s).digest("hex");
/**
 * id ของแถวเงิน/งวด/คำขอ = เวลาเครื่อง (ms · base36) + ลำดับในกระบวนการ + สุ่ม 64 บิต — ไม่รับประกันลำดับการเขียนข้ามกระบวนการ/เครื่อง
 * ลำดับใบรับที่ใช้จริง (planRefundSlices) = (seq ของงวด, createdAt, id) — เป็นลำดับรวมที่กำหนดได้เพราะ id ไม่ซ้ำ · ผลรวมตรงพอดีทุกลำดับ (allocateWithin)
 * ต่างกันได้แค่ตำแหน่งเศษสตางค์ (รีวิว r1 MINOR 6)
 */
let idSeq = 0;
export function moneyRowId(prefix: string): string {
  idSeq = (idSeq + 1) % 1_679_616;
  return `${prefix}${Date.now().toString(36).padStart(9, "0")}${idSeq.toString(36).padStart(4, "0")}${randomBytes(8).toString("hex")}`;
}
const newId = moneyRowId;
const isRec = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const NF = (): Failure => sellFail("NOT_FOUND");
const ID = z.string().trim().min(1).max(128);
const IDEM_KEY = z.string().regex(/^[A-Za-z0-9_-]{8,90}$/);
const AMOUNT = z.number().int().min(1).max(INT4);
const OPEN_DUE = Prisma.sql`ARRAY['OPEN','PARTLY_PAID','OVERDUE']::text[]`;
const OPEN_REFUND: string[] = [...TRIP_REFUND_OPEN_STATUSES];
const SOLD: ReadonlySet<string> = new Set(BOOKING_SOLD_STATUSES);
const MS_PER_DAY = 86_400_000;
const MS_PER_HOUR = 3_600_000;

// ═══════════════════════ ctx ═══════════════════════
/** SellCtx ของคำขอ (นาฬิกาเดียว = ctx.now) */
export function moneySellCtx(c: Ctx): SellCtx {
  return { tenantId: c.tenantId, unitId: c.unitId, channel: c.channel, actor: c.actor, now: c.clock.now };
}
/** คีย์กันซ้ำตาม namespace ผู้เรียก + หน่วย (แบบ T0.6 booking.ts :234) */
export const moneyNsKey = (c: Ctx, key: string) => `${idemKeyFor(c.actor, key)}@${c.unitId}`;
/** advisory ชั้น 0 ของเส้นเงิน (สองอาร์กิวเมนต์ · คลาส hashtext('trips.booking.v1') · มติ §22 ข้อ 6) */
export async function lockMoneyKey(tx: Tx, kind: "pay" | "refund" | "approval", id: string): Promise<void> {
  await tx.$queryRaw`SELECT 1 AS "locked" FROM pg_advisory_xact_lock(hashtext('trips.booking.v1'), hashtext(${`${kind}:${id}`}))`;
}

// ═══════════════════════ แถวการจอง ═══════════════════════
export type MoneyBooking = {
  id: string;
  code: string;
  status: string;
  version: number;
  departureId: string;
  productId: string;
  channel: string;
  currency: string;
  collectMode: string;
  agentAccountId: string | null;
  paidSatang: number;
  refundedSatang: number;
  vatSatang: number;
  createdAt: Date;
  piiPurgedAt: Date | null;
  policySnapshot: unknown;
};
const BOOKING_COLS = Prisma.raw(
  `"id", "code", "status", "version", "departureId", "productId", "channel", "currency", "collectMode", "agentAccountId", "paidSatang", "refundedSatang", "vatSatang", "createdAt", "piiPurgedAt", "policySnapshot"`,
);
/** อ่านการจอง (ไม่ล็อก) — ร้าน+หน่วยของ g เท่านั้น */
export async function readMoneyBooking(db: Tx, g: { tenantId: string; unitId: string }, id: string): Promise<MoneyBooking | null> {
  const rows = await db.$queryRaw<MoneyBooking[]>`SELECT ${BOOKING_COLS} FROM "TripBooking" WHERE "id" = ${id} AND "tenantId" = ${g.tenantId} AND "unitId" = ${g.unitId}`;
  return rows[0] ?? null;
}
/** 2b: ถือแถวการจอง (FOR UPDATE) แล้วคืนค่าปัจจุบัน — รุ่นที่ใช้ CAS ต้องมาจากที่นี่ (มติ §22 ข้อ 5) */
export async function lockMoneyBookingInTx(tx: Tx, g: { tenantId: string; unitId: string }, id: string): Promise<MoneyBooking | null> {
  const rows = await tx.$queryRaw<MoneyBooking[]>`SELECT ${BOOKING_COLS} FROM "TripBooking" WHERE "id" = ${id} AND "tenantId" = ${g.tenantId} AND "unitId" = ${g.unitId} FOR UPDATE`;
  return rows[0] ?? null;
}
export const payableOfSnapshot = (snap: unknown): number | null => {
  const t = isRec(snap) && isRec(snap.totals) ? snap.totals.payableSatang : undefined;
  return typeof t === "number" && Number.isSafeInteger(t) && t >= 0 && t <= INT4 ? t : null;
};
/** การจองของเอเจนซี่ / สกุลอื่น ⇒ ยังรับไม่ได้ (A1.x · L1.x) */
export function moneyBookingGate(b: MoneyBooking): Failure | null {
  if (b.collectMode === "AGENT" || b.agentAccountId) return sellFail("FORBIDDEN", { reason: "AGENCY_NOT_ENABLED" });
  if (b.currency !== "THB") return sellFail("CURRENCY_NOT_ALLOWED", { reason: "CURRENCY_NOT_THB" });
  return null;
}
/** สถานะที่รับเงิน/ออก QR ได้ (§6.2) · การจองที่ลบข้อมูลผู้จองแล้ว ⇒ BOOKER_PURGED */
export function payableStatusGate(b: Pick<MoneyBooking, "status" | "piiPurgedAt">): Failure | null {
  if (b.piiPurgedAt !== null) return sellFail("STATE_CONFLICT", { reason: "BOOKER_PURGED" }, "ข้อมูลผู้จองของการจองนี้ถูกลบแล้ว — ให้ลูกค้าจองใหม่");
  switch (b.status) {
    case "HOLD":
    case "CONFIRMED":
    case "PART_PAID":
      return null;
    case "PENDING":
      return sellFail("STATE_CONFLICT", { reason: "PENDING_APPROVAL" });
    case "PAID":
      return sellFail("STATE_CONFLICT", { reason: "NOTHING_DUE" });
    case "EXPIRED":
      return sellFail("STATE_CONFLICT", { reason: "BOOKING_EXPIRED" });
    default:
      return sellFail("STATE_CONFLICT", { reason: "NOT_PAYABLE" });
  }
}
function abortOf(f: Failure): never {
  throw new BookingAbort(f.code, f.details);
}
/** คำขอคืนเงินที่ยังเปิดของการจอง (ดัชนี TripRefundRequest_bookingId_idx) */
export async function openRefundOf(db: Tx, g: { tenantId: string; unitId: string }, bookingId: string): Promise<string | null> {
  const rows = await db.$queryRaw<{ id: string }[]>`
    SELECT "id" FROM "TripRefundRequest" WHERE "bookingId" = ${bookingId} AND "tenantId" = ${g.tenantId} AND "unitId" = ${g.unitId} AND "status" = ANY(${OPEN_REFUND}::text[]) LIMIT 1`;
  return rows[0]?.id ?? null;
}

// ═══════════════════════ audit · outbox ═══════════════════════
export type MoneyAuditVal = Record<string, string | number | boolean | null>;
/** audit ในธุรกรรมเดียวกัน (STAFF/SYSTEM · createdAt = ค่าเริ่มของฐาน — มติ r1 V7 · ไม่มีข้อมูลบุคคล) */
export async function auditMoney(
  tx: Tx,
  a: { tenantId: string; unitId: string; actor: SellActor },
  action: string,
  target: { type: string; id: string },
  after: MoneyAuditVal,
  before?: MoneyAuditVal,
): Promise<void> {
  if (a.actor.kind !== "STAFF" && a.actor.kind !== "SYSTEM") return;
  await tx.auditLog.create({
    data: {
      tenantId: a.tenantId,
      unitId: a.unitId,
      actorType: a.actor.kind === "STAFF" ? "USER" : "SYSTEM",
      actorId: a.actor.kind === "STAFF" ? a.actor.userId : null,
      action,
      targetType: target.type,
      targetId: target.id,
      ...(before ? { before: { ...before } } : {}),
      after: { ...after },
    },
  });
}
export type MoneyEvt = { type: string; key: string; payload: Record<string, unknown> };
export async function emitMoney(tx: Tx, g: { tenantId: string; unitId: string }, evts: readonly MoneyEvt[]): Promise<void> {
  if (!evts.length) return;
  await emitOutboxMany(tx, evts.map((e) => ({ tenantId: g.tenantId, unitId: g.unitId, type: e.type, idempotencyKey: `${e.type}:${e.key}`, payload: e.payload })));
}
/** payload ชุด T0.6 ของ event การจอง (amountSatang = payable · ไม่มีข้อมูลบุคคล) */
export const bookingEventPayload = (g: { unitId: string }, b: { id: string; departureId: string; channel: string }, status: string, payable: number) => ({
  bookingId: b.id,
  unitId: g.unitId,
  departureId: b.departureId,
  status,
  channel: b.channel,
  amountSatang: payable,
});

// ═══════════════════════ §5 งวดจ่าย ═══════════════════════
export type DueRow = { id: string; seq: number; kind: string; dueAt: Date; amountSatang: number; vatableSatang: number; passThroughSatang: number; paidSatang: number; status: string };
const DUE_COLS = Prisma.raw(`"id", "seq", "kind", "dueAt", "amountSatang", "vatableSatang", "passThroughSatang", "paidSatang", "status"`);
/** งวดของ snapshot ปัจจุบัน (status <> CANCELLED · เรียง seq) — ดัชนี TripPaymentDue_bookingId_seq_key */
export async function currentDues(db: Tx, g: { tenantId: string; unitId: string }, bookingId: string): Promise<DueRow[]> {
  return db.$queryRaw<DueRow[]>`
    SELECT ${DUE_COLS} FROM "TripPaymentDue" WHERE "bookingId" = ${bookingId} AND "tenantId" = ${g.tenantId} AND "unitId" = ${g.unitId} AND "status" <> 'CANCELLED' ORDER BY "seq"`;
}
/** Σ เก็บแทนของ RECEIVED ต่องวด (ดัชนี TripMoneyEvent_bookingId_idx) */
export async function receivedPtByDue(db: Tx, g: { tenantId: string; unitId: string }, bookingId: string): Promise<Map<string, number>> {
  const rows = await db.$queryRaw<{ dueId: string | null; pt: number }[]>`
    SELECT "dueId", COALESCE(sum("passThroughSatang"), 0)::int AS "pt" FROM "TripMoneyEvent"
    WHERE "bookingId" = ${bookingId} AND "tenantId" = ${g.tenantId} AND "unitId" = ${g.unitId} AND "kind" = 'RECEIVED' GROUP BY "dueId"`;
  return new Map(rows.filter((r) => r.dueId).map((r) => [r.dueId as string, Number(r.pt)]));
}
/** INSERT งวดร่างต่อจาก seq สูงสุดของการจอง (ON CONFLICT ไม่เขียนซ้ำ) — ผู้เรียกถือแถวการจองแล้ว (2b) */
async function insertDraftsInTx(tx: Tx, g: { tenantId: string; unitId: string }, bookingId: string, drafts: readonly DueDraft[], at: Date): Promise<void> {
  const mx = await tx.$queryRaw<{ m: number }[]>`SELECT COALESCE(max("seq"), 0)::int AS "m" FROM "TripPaymentDue" WHERE "bookingId" = ${bookingId}`;
  const base = Number(mx[0]?.m ?? 0);
  const iso = at.toISOString();
  for (const [i, d] of drafts.entries()) {
    const status = d.amountSatang === 0 ? "PAID" : "OPEN";
    await tx.$queryRaw`
      INSERT INTO "TripPaymentDue" ("id", "tenantId", "unitId", "bookingId", "seq", "kind", "dueAt", "amountSatang", "vatableSatang", "passThroughSatang", "amountMinor", "paidSatang", "status", "createdAt", "updatedAt")
      VALUES (${newId("tpd_")}, ${g.tenantId}, ${g.unitId}, ${bookingId}, ${base + i + 1}, ${d.kind}, ${new Date(d.dueAt).toISOString()}::timestamp, ${d.amountSatang}, ${d.vatableSatang}, ${d.passThroughSatang},
        ${d.amountMinor}::int, 0, ${status}, ${iso}::timestamp, ${iso}::timestamp)
      ON CONFLICT ("bookingId", "seq") DO NOTHING
      RETURNING "id"`;
  }
}
async function ensureDuesCore(tx: Tx, g: { tenantId: string; unitId: string }, bookingId: string, at: Date): Promise<DueRow[]> {
  const b = await lockMoneyBookingInTx(tx, g, bookingId);
  if (!b) throw new BookingAbort("NOT_FOUND");
  const cur = await currentDues(tx, g, bookingId);
  if (cur.length) return cur;
  const drafts = dueDraftsFromSnapshot(b.policySnapshot);
  if (!drafts.ok) throw new BookingAbort("VALIDATION", { reason: "SNAPSHOT_INVALID" });
  await insertDraftsInTx(tx, g, bookingId, drafts.value, at);
  return currentDues(tx, g, bookingId);
}
const ensureInput = z.strictObject({ bookingId: ID });
/**
 * งวดของการจองในธุรกรรมของผู้เรียก (ยืนยันการจอง 2d · ตัวเติมย้อนของการจองก่อน T0.7): ถือแถวการจอง (FOR UPDATE · ซ้อนได้เมื่อถืออยู่แล้ว) →
 * มีงวดที่ไม่ CANCELLED ⇒ ไม่เขียน · ไม่มี ⇒ INSERT ตาม snapshot (seq ต่อจาก max · ON CONFLICT DO NOTHING + อ่านซ้ำ) · ปฏิเสธ ⇒ throw BookingAbort
 */
export async function ensureTripDuesInTx(tx: unknown, ctx: unknown, input: unknown): Promise<DueRow[]> {
  const t = asTx(tx);
  const pc = parseCtx(ctx);
  if (!pc.ok) throw new BookingAbort(pc.code, pc.details);
  const p = ensureInput.safeParse(input);
  if (!p.success) throw new BookingAbort("VALIDATION", invalidInput(p.error).details);
  return ensureDuesCore(t, pc.c, p.data.bookingId, pc.c.clock.now);
}
/** แก้การจอง CONFIRMED (ยังไม่มีเงิน · §9.2): งวดเดิมที่เปิด → CANCELLED · INSERT งวดของ snapshot ใหม่ (seq ต่อ) — ผู้เรียกถือการจองแล้ว (2b → 2d) */
export async function replaceTripDuesInTx(tx: Tx, g: { tenantId: string; unitId: string }, bookingId: string, snap: unknown, at: Date): Promise<void> {
  const drafts = dueDraftsFromSnapshot(snap);
  if (!drafts.ok) throw new BookingAbort("VALIDATION", { reason: "SNAPSHOT_INVALID" });
  const paid = await tx.$queryRaw<{ id: string }[]>`
    SELECT "id" FROM "TripPaymentDue" WHERE "bookingId" = ${bookingId} AND "tenantId" = ${g.tenantId} AND "unitId" = ${g.unitId} AND "status" <> 'CANCELLED' AND "paidSatang" > 0 LIMIT 1`;
  if (paid.length) throw new BookingAbort("STATE_CONFLICT", { reason: "PRICE_CHANGED_AFTER_PAYMENT" });
  await tx.$queryRaw`
    UPDATE "TripPaymentDue" SET "status" = 'CANCELLED', "updatedAt" = now()
    WHERE "bookingId" = ${bookingId} AND "tenantId" = ${g.tenantId} AND "unitId" = ${g.unitId} AND "status" = ANY(${OPEN_DUE}) AND "paidSatang" = 0
    RETURNING "id"`;
  await insertDraftsInTx(tx, g, bookingId, drafts.value, at);
}
/** การจองที่จ่ายแล้ว: งวดใหม่ต้องเหมือนงวดเดิมทุกแถว (จำนวน · ยอด · vatable · เก็บแทน) ต่างได้เฉพาะ dueAt (§9.2) */
export function duesShapeUnchanged(cur: readonly DueRow[], snap: unknown): boolean {
  const d = dueDraftsFromSnapshot(snap);
  if (!d.ok || d.value.length !== cur.length) return false;
  return cur.every((r, i) => {
    const x = d.value[i];
    return !!x && x.amountSatang === r.amountSatang && x.vatableSatang === r.vatableSatang && x.passThroughSatang === r.passThroughSatang && x.kind === r.kind;
  });
}
/** ชั่วโมงผ่อนผันหลังเลยกำหนด (X11) จาก snapshot — ไม่ได้จด/ผิดรูป ⇒ null */
function graceHoursOf(snap: unknown): number | null {
  try {
    const v = snapshotValue(snap, "trips", "trips.pay.overdueGraceHours");
    return typeof v === "number" && Number.isSafeInteger(v) && v >= 0 ? v : null;
  } catch {
    return null;
  }
}
/**
 * การจองที่จ่ายแล้วเลื่อนวัน (ยอดเท่าเดิม · §9.2): UPDATE dueAt ของงวดที่ยังเปิด (CAS ต่อแถว) — ไม่แตะเงินที่รับ
 * งวด OVERDUE ที่ถูกเลื่อนไปช้ากว่าเดิมและยังไม่เลยกำหนด+ผ่อนผัน (X11 ของ snapshot ใหม่) ⇒ กลับเป็น OPEN/PARTLY_PAID (รีวิว r1 MINOR 3)
 */
export async function retimeTripDuesInTx(tx: Tx, g: { tenantId: string; unitId: string }, bookingId: string, snap: unknown, now: Date): Promise<void> {
  const cur = await currentDues(tx, g, bookingId);
  if (!duesShapeUnchanged(cur, snap)) throw new BookingAbort("STATE_CONFLICT", { reason: "PRICE_CHANGED_AFTER_PAYMENT" });
  const d = dueDraftsFromSnapshot(snap);
  if (!d.ok) throw new BookingAbort("VALIDATION", { reason: "SNAPSHOT_INVALID" });
  const grace = graceHoursOf(snap) ?? 0;
  for (const [i, r] of cur.entries()) {
    const x = d.value[i];
    if (!x || r.status === "PAID") continue;
    const at = new Date(x.dueAt);
    const reopen = r.status === "OVERDUE" && at.getTime() > new Date(r.dueAt).getTime() && now.getTime() < at.getTime() + grace * MS_PER_HOUR;
    const to = reopen ? (r.paidSatang > 0 ? "PARTLY_PAID" : "OPEN") : r.status;
    await tx.$queryRaw`
      UPDATE "TripPaymentDue" SET "dueAt" = ${at.toISOString()}::timestamp, "status" = ${to}, "updatedAt" = now()
      WHERE "id" = ${r.id} AND "tenantId" = ${g.tenantId} AND "unitId" = ${g.unitId} AND "status" = ${r.status} AND "paidSatang" = ${r.paidSatang}
      RETURNING "id"`;
  }
}

/** DTO งวด (ไม่มีข้อมูลบุคคล) */
export type TripDueDTO = {
  id: string | null;
  seq: number;
  kind: string;
  dueAt: string;
  amountSatang: number;
  vatableSatang: number;
  passThroughSatang: number;
  paidSatang: number;
  paidPassThroughSatang: number;
  outstandingSatang: number;
  status: string;
};
/** สถานะการจองที่ยังมียอดให้จ่าย (นอกจากนี้ยอดค้างของทุกงวด = 0 · มติ r1 V3) */
const OWES: ReadonlySet<string> = new Set(["HOLD", "PENDING", "CONFIRMED", "PART_PAID"]);
/**
 * งวดที่แสดง (มติ r1 V3): ไม่มีแถวงวดเลย (การจองก่อน T0.7) ⇒ ร่างจาก snapshot (id null · ไม่เขียนฐาน) ·
 * มีแถว ⇒ งวดของ snapshot ปัจจุบัน (ไม่ CANCELLED) หรือถ้าทุกแถว CANCELLED ⇒ แถวทั้งหมดตามจริง (ประวัติ) ·
 * การจองที่ไม่ค้างจ่ายแล้ว (CANCELLED/EXPIRED/PAID/…) หรืองวดที่ CANCELLED ⇒ ยอดค้าง 0 เสมอ
 */
async function duesView(db: Tx, g: Gate, b: MoneyBooking): Promise<TripDueDTO[] | null> {
  const owes = OWES.has(b.status);
  const all = await db.$queryRaw<DueRow[]>`
    SELECT ${DUE_COLS} FROM "TripPaymentDue" WHERE "bookingId" = ${b.id} AND "tenantId" = ${g.tenantId} AND "unitId" = ${g.unitId} ORDER BY "seq"`;
  if (!all.length) {
    const d = dueDraftsFromSnapshot(b.policySnapshot);
    if (!d.ok) return null;
    return d.value.map((x) => ({
      id: null,
      seq: x.seq,
      kind: x.kind,
      dueAt: new Date(x.dueAt).toISOString(),
      amountSatang: x.amountSatang,
      vatableSatang: x.vatableSatang,
      passThroughSatang: x.passThroughSatang,
      paidSatang: 0,
      paidPassThroughSatang: 0,
      outstandingSatang: owes ? x.amountSatang : 0,
      status: x.amountSatang === 0 ? "PAID" : owes ? "OPEN" : "CANCELLED",
    }));
  }
  const live = all.filter((r) => r.status !== "CANCELLED");
  const rows = live.length ? live : all;
  const pt = await receivedPtByDue(db, g, b.id);
  return rows.map((r) => ({
    id: r.id,
    seq: r.seq,
    kind: r.kind,
    dueAt: new Date(r.dueAt).toISOString(),
    amountSatang: r.amountSatang,
    vatableSatang: r.vatableSatang,
    passThroughSatang: r.passThroughSatang,
    paidSatang: r.paidSatang,
    paidPassThroughSatang: pt.get(r.id) ?? 0,
    outstandingSatang: owes && r.status !== "CANCELLED" ? r.amountSatang - r.paidSatang : 0,
    status: r.status,
  }));
}
const readerGate = (c: Ctx): Failure | null => (c.actor.kind === "STAFF" || c.actor.kind === "SYSTEM" ? null : sellFail("FORBIDDEN"));
const bookingIdInput = z.strictObject({ bookingId: ID });

/** งวดของการจอง (STAFF/SYSTEM · PUBLIC ⇒ FORBIDDEN) — การอ่านไม่เขียนฐาน */
export async function listTripDues(ctx: unknown, input: unknown): Promise<SellResult<{ items: TripDueDTO[] }>> {
  return tripsSafely("listTripDues", ctx, async () => {
    const pc = parseCtx(ctx);
    if (!pc.ok) return pc;
    const rg = readerGate(pc.c);
    if (rg) return rg;
    const p = bookingIdInput.safeParse(input);
    if (!p.success) return invalidInput(p.error);
    const g = await gateOf(pc.c);
    if (!g) return NF();
    const db = unitClient(g);
    const b = await readMoneyBooking(db, g, p.data.bookingId);
    if (!b) return NF();
    const items = await duesView(db, g, b);
    return items ? { ok: true, value: { items } } : sellFail("VALIDATION", { reason: "SNAPSHOT_INVALID" });
  });
}

// ═══════════════════════ §6 รับเงิน ═══════════════════════
const payInput = z.strictObject({
  bookingId: ID,
  amountSatang: AMOUNT,
  tender: z.enum(TRIP_TENDERS),
  idempotencyKey: IDEM_KEY,
  slipId: ID.optional(),
  reference: MONEY_REFERENCE.optional(),
});
type PayInput = z.infer<typeof payInput>;
export type PaymentEventDTO = { id: string; dueId: string | null; amountSatang: number; vatSatang: number; passThroughSatang: number };
export type PaymentValue = { bookingId: string; status: string; version: number; paidSatang: number; outstandingSatang: number; events: PaymentEventDTO[]; replayed: boolean };
type ReceivedRow = { id: string; bookingId: string; kind: string; amountSatang: number; vatSatang: number; passThroughSatang: number; dueId: string | null; tender: string; slipId: string | null };
/** ชิ้นสูงสุดต่อการรับเงินหนึ่งครั้ง (ขอบของการค้นกันซ้ำ · ค่าทางเทคนิค ไม่ใช่ตัวเลขธุรกิจ) */
const MAX_SLICES = 64;
/** แถวเงินของคีย์ base:1 … base:64 ในคำสั่งเดียว (ดัชนี unique TripMoneyEvent_tenantId_idempotencyKey_key · = ANY) — เรียงตาม i */
async function receiptsByKey(db: Tx, tenantId: string, base: string): Promise<ReceivedRow[]> {
  const keys = Array.from({ length: MAX_SLICES }, (_, i) => `${base}:${i + 1}`);
  const rows = await db.$queryRaw<(ReceivedRow & { idempotencyKey: string })[]>`
    SELECT "id", "bookingId", "kind", "amountSatang", "vatSatang", "passThroughSatang", "dueId", "tender", "slipId", "idempotencyKey" FROM "TripMoneyEvent"
    WHERE "tenantId" = ${tenantId} AND "idempotencyKey" = ANY(${keys}::text[])`;
  const idx = (k: string) => Number(k.slice(base.length + 1));
  return rows
    .sort((a, b) => idx(a.idempotencyKey) - idx(b.idempotencyKey))
    .map((r) => ({ id: r.id, bookingId: r.bookingId, kind: r.kind, amountSatang: r.amountSatang, vatSatang: r.vatSatang, passThroughSatang: r.passThroughSatang, dueId: r.dueId, tender: r.tender, slipId: r.slipId }));
}
/** คีย์เดิม + (การจอง · Σ ยอด · tender · สลิป) เดิม ⇒ ผลเดิม · ต่าง ⇒ IDEMPOTENCY_CONFLICT (สลิป: SLIP_ALREADY_USED) */
function sameReceipt(rows: readonly ReceivedRow[], v: PayInput): boolean {
  return (
    rows.every((r) => r.kind === "RECEIVED" && r.bookingId === v.bookingId && r.tender === v.tender && (r.slipId ?? null) === (v.slipId ?? null)) &&
    rows.reduce((s, r) => s + Number(r.amountSatang), 0) === v.amountSatang
  );
}
const idemConflict = (v: PayInput): Failure => sellFail("IDEMPOTENCY_CONFLICT", v.slipId ? { reason: "SLIP_ALREADY_USED" } : undefined);
async function paymentValueOf(db: Tx, g: Gate, bookingId: string, rows: readonly ReceivedRow[], replayed: boolean): Promise<PaymentValue | null> {
  const b = await readMoneyBooking(db, g, bookingId);
  if (!b) return null;
  const payable = payableOfSnapshot(b.policySnapshot) ?? 0;
  return {
    bookingId: b.id,
    status: b.status,
    version: b.version,
    paidSatang: b.paidSatang,
    outstandingSatang: Math.max(0, payable - b.paidSatang),
    events: rows.map((r) => ({ id: r.id, dueId: r.dueId, amountSatang: Number(r.amountSatang), vatSatang: Number(r.vatSatang), passThroughSatang: Number(r.passThroughSatang) })),
    replayed,
  };
}
/** สลิปที่อนุมัติแล้วของร้าน+หน่วยนี้ (อ่านอย่างเดียว · §6.3) — ไม่ผ่าน ⇒ Failure */
async function slipGate(db: Tx, g: Gate, v: PayInput): Promise<Failure | null> {
  if (!v.slipId) return null;
  if (v.tender !== "PROMPTPAY" && v.tender !== "TRANSFER") return sellFail("VALIDATION", { reason: "TENDER_NOT_ALLOWED" });
  const rows = await db.$queryRaw<{ id: string; status: string; domain: string; refType: string; refId: string; amountSatang: number | null }[]>`
    SELECT "id", "status", "domain", "refType", "refId", "amountSatang" FROM "PaymentSlip" WHERE "id" = ${v.slipId} AND "tenantId" = ${g.tenantId} AND "unitId" = ${g.unitId}`;
  const s = rows[0];
  if (!s) return NF();
  if (s.status !== "APPROVED" && s.status !== "AUTO_APPROVED") return sellFail("STATE_CONFLICT", { reason: "SLIP_NOT_APPROVED" });
  if (s.domain !== "TRIPS" || s.refType !== "TRIP_DUE" || s.amountSatang !== v.amountSatang) return sellFail("VALIDATION", { reason: "SLIP_MISMATCH" });
  const due = await db.$queryRaw<{ id: string }[]>`
    SELECT "id" FROM "TripPaymentDue" WHERE "id" = ${s.refId} AND "bookingId" = ${v.bookingId} AND "tenantId" = ${g.tenantId} AND "unitId" = ${g.unitId}`;
  return due.length ? null : sellFail("VALIDATION", { reason: "SLIP_MISMATCH" });
}

type PayTxOut = { replay: ReceivedRow[] } | { value: PaymentValue };
/** ธุรกรรมรับเงิน (ลำดับ §6.4 · §10) */
async function payTx(tx: Tx, c: Ctx, g: Gate, v: PayInput, base: string, keyHash: string, bodyHash: string): Promise<PayTxOut> {
  const sc = moneySellCtx(c);
  await lockMoneyKey(tx, "pay", v.bookingId); // ชั้น 0
  const prior = await receiptsByKey(tx, g.tenantId, base);
  if (prior.length) return { replay: prior };
  const pre = await readMoneyBooking(tx, g, v.bookingId);
  if (!pre) throw new BookingAbort("NOT_FOUND");
  const pg = payableStatusGate(pre) ?? moneyBookingGate(pre);
  if (pg) abortOf(pg);
  if (pre.status === "HOLD") {
    // 1a → 2a: แปลงทุก hold ACTIVE ของการจอง เรียง (รอบ, id) — hold หมดเวลา ⇒ rollback ทั้งก้อน HOLD_EXPIRED (ไม่มีเงินถูกบันทึก)
    const holds = await tx.$queryRaw<{ id: string }[]>`
      SELECT "id" FROM "TripHold" WHERE "bookingId" = ${v.bookingId} AND "tenantId" = ${g.tenantId} AND "unitId" = ${g.unitId} AND "status" = 'ACTIVE' ORDER BY "departureId", "id"`;
    if (!holds.length) throw new BookingAbort("HOLD_EXPIRED");
    for (const h of holds) {
      const r = await convertHoldForBookingInTx(tx, sc, { holdId: h.id }, v.bookingId);
      if (!r.ok) throw new BookingAbort(r.code, r.details);
    }
  }
  // 2b
  const b = await lockMoneyBookingInTx(tx, g, v.bookingId);
  if (!b) throw new BookingAbort("NOT_FOUND");
  if (b.status !== pre.status) throw new BookingAbort("STATE_CONFLICT");
  const sg = payableStatusGate(b) ?? moneyBookingGate(b);
  if (sg) abortOf(sg);
  if (await openRefundOf(tx, g, b.id)) throw new BookingAbort("STATE_CONFLICT", { reason: "REFUND_IN_PROGRESS" });
  const payable = payableOfSnapshot(b.policySnapshot);
  const vatCtx = receiptVatCtxOf(b.policySnapshot);
  if (payable === null || !vatCtx) throw new BookingAbort("VALIDATION", { reason: "SNAPSHOT_INVALID" });
  const dues = await ensureDuesCore(tx, g, b.id, c.clock.now);
  // 2d
  const ptBy = await receivedPtByDue(tx, g, b.id);
  const states: DueState[] = dues.map((d) => ({ id: d.id, seq: d.seq, status: d.status, amountSatang: d.amountSatang, vatableSatang: d.vatableSatang, passThroughSatang: d.passThroughSatang, paidSatang: d.paidSatang, paidPassThroughSatang: ptBy.get(d.id) ?? 0 }));
  const al = allocatePayment(states, v.amountSatang);
  if (!al.ok) {
    if (al.reason === "NOTHING_DUE") throw new BookingAbort("STATE_CONFLICT", { reason: "NOTHING_DUE" });
    throw new BookingAbort("VALIDATION", { reason: al.reason === "OVERPAYMENT" ? "OVERPAYMENT" : "INVALID_AMOUNT" });
  }
  if (b.paidSatang + v.amountSatang > payable) throw new BookingAbort("VALIDATION", { reason: "OVERPAYMENT" });
  if (al.slices.length > MAX_SLICES) throw new BookingAbort("VALIDATION", { reason: "TOO_MANY_DUES" });
  const iso = c.clock.iso;
  const events: (PaymentEventDTO & { dueAt: Date })[] = [];
  for (const [i, s] of al.slices.entries()) {
    const upd = await tx.$queryRaw<{ id: string; dueAt: Date }[]>`
      UPDATE "TripPaymentDue" SET "paidSatang" = "paidSatang" + ${s.amountSatang},
        "status" = CASE WHEN "paidSatang" + ${s.amountSatang} = "amountSatang" THEN 'PAID' ELSE 'PARTLY_PAID' END, "updatedAt" = now()
      WHERE "id" = ${s.dueId} AND "tenantId" = ${g.tenantId} AND "unitId" = ${g.unitId} AND "bookingId" = ${b.id}
        AND "status" = ANY(${OPEN_DUE}) AND "paidSatang" = ${s.duePaidBeforeSatang} AND "paidSatang" + ${s.amountSatang} <= "amountSatang"
      RETURNING "id", "dueAt"`;
    if (upd.length !== 1) throw new BookingAbort("STATE_CONFLICT");
    const vat = receiptVatSatang(s.vatableSatang, vatCtx);
    const id = newId("tme_");
    await tx.$queryRaw`
      INSERT INTO "TripMoneyEvent" ("id", "tenantId", "unitId", "bookingId", "kind", "amountSatang", "vatSatang", "passThroughSatang", "dueId", "tender",
        "postingStatus", "postingAttempts", "slipId", "idempotencyKey", "createdAt", "updatedAt")
      VALUES (${id}, ${g.tenantId}, ${g.unitId}, ${b.id}, 'RECEIVED', ${s.amountSatang}, ${vat}, ${s.passThroughSatang}, ${s.dueId}, ${v.tender},
        'UNPOSTED', 0, ${v.slipId ?? null}::text, ${`${base}:${i + 1}`}, ${iso}::timestamp, ${iso}::timestamp)
      RETURNING "id"`;
    events.push({ id, dueId: s.dueId, amountSatang: s.amountSatang, vatSatang: vat, passThroughSatang: s.passThroughSatang, dueAt: upd[0]?.dueAt ?? new Date(iso) });
  }
  // 2b CAS การจอง
  const newPaid = b.paidSatang + v.amountSatang;
  const to = bookingStatusAfterPayment(newPaid, payable) ?? b.status;
  if (to !== b.status && !canTransitionBooking(b.status, to, c.actor.kind)) throw new BookingAbort("STATE_CONFLICT", { reason: "TRANSITION_NOT_ALLOWED" });
  const cas = await tx.$queryRaw<{ version: number; paidSatang: number }[]>`
    UPDATE "TripBooking" SET "paidSatang" = "paidSatang" + ${v.amountSatang}, "status" = ${to}, "version" = "version" + 1, "updatedAt" = now()
    WHERE "id" = ${b.id} AND "tenantId" = ${g.tenantId} AND "unitId" = ${g.unitId} AND "status" = ${b.status} AND "version" = ${b.version}
      AND "paidSatang" + ${v.amountSatang} <= ${payable}
    RETURNING "version", "paidSatang"`;
  const nb = cas[0];
  if (!nb) throw new BookingAbort("STATE_CONFLICT");
  // 2h
  const evts: MoneyEvt[] = events.map((e) => ({ type: "trips.payment.received", key: e.id, payload: { dueId: e.dueId, bookingId: b.id, amountSatang: e.amountSatang, dueAt: new Date(e.dueAt).toISOString() } }));
  if (to !== b.status) {
    const payload = bookingEventPayload(g, b, to, payable);
    if (b.status === "HOLD") evts.push({ type: "trips.booking.confirmed", key: b.id, payload });
    if (to === "PART_PAID") evts.push({ type: "trips.booking.part_paid", key: b.id, payload });
    if (to === "PAID") evts.push({ type: "trips.booking.paid", key: b.id, payload });
  }
  await emitMoney(tx, g, evts);
  await auditMoney(
    tx,
    { tenantId: g.tenantId, unitId: g.unitId, actor: c.actor },
    "trips.payment.record",
    { type: "TripBooking", id: b.id },
    {
      status: to,
      version: nb.version,
      amountSatang: v.amountSatang,
      tender: v.tender,
      slices: events.map((e) => `${e.dueId}:${e.amountSatang}:${e.vatSatang}:${e.passThroughSatang}`).join(","),
      slipId: v.slipId ?? null,
      idemKeyHash: keyHash,
      bodyHash,
      ...(v.reference ? { reference: v.reference } : {}),
    },
    { status: b.status, version: b.version, paidSatang: b.paidSatang },
  );
  return {
    value: {
      bookingId: b.id,
      status: to,
      version: nb.version,
      paidSatang: Number(nb.paidSatang),
      outstandingSatang: payable - Number(nb.paidSatang),
      events: events.map((e) => ({ id: e.id, dueId: e.dueId, amountSatang: e.amountSatang, vatSatang: e.vatSatang, passThroughSatang: e.passThroughSatang })),
      replayed: false,
    },
  };
}

/**
 * รับเงิน (§6): STAFF (เงินสด · พร้อมเพย์ · โอน · บัตรจาก EDC ภายนอก) · SYSTEM ต้องมีสลิปที่อนุมัติแล้ว · PUBLIC ⇒ FORBIDDEN · AGENT ⇒ AGENCY_NOT_ENABLED
 * ปันเข้างวดตามลำดับ · VAT/เก็บแทนต่อใบ · HOLD → PART_PAID/PAID (แปลงที่นั่ง) · CONFIRMED → PART_PAID → PAID · event ครั้งเดียวต่อการเปลี่ยน
 * กันซ้ำ: คีย์ `rcv:<sha256(nsKey)[0:40]>:<i>` / `rcv:slip:<slipId>:<i>` บน TripMoneyEvent (tenantId, idempotencyKey) unique
 */
export async function recordTripPayment(ctx: unknown, input: unknown): Promise<SellResult<PaymentValue>> {
  return tripsSafely("recordTripPayment", ctx, async () => {
    const pc = parseCtx(ctx);
    if (!pc.ok) return pc;
    const c = pc.c;
    if (c.actor.kind === "PUBLIC") return sellFail("FORBIDDEN");
    const p = payInput.safeParse(input);
    if (!p.success) return invalidInput(p.error);
    const v = p.data;
    if (c.actor.kind === "SYSTEM" && !v.slipId) return sellFail("FORBIDDEN", { reason: "SLIP_REQUIRED" });
    const g = await gateOf(c);
    if (!g) return NF();
    const db = unitClient(g);
    const b = await readMoneyBooking(db, g, v.bookingId);
    if (!b) return NF();
    const bg = moneyBookingGate(b);
    if (bg) return bg;
    const base = v.slipId ? `rcv:slip:${v.slipId}` : `rcv:${sha256hex(moneyNsKey(c, v.idempotencyKey)).slice(0, 40)}`;
    const keyHash = sha256hex(base);
    const bodyHash = sha256hex(JSON.stringify(["trips.pay.v1", v.bookingId, v.amountSatang, v.tender, v.slipId ?? null]));
    const replay = async (rows: ReceivedRow[]): Promise<SellResult<PaymentValue>> => {
      if (!sameReceipt(rows, v)) return idemConflict(v);
      const val = await paymentValueOf(db, g, v.bookingId, rows, true);
      return val ? { ok: true, value: val } : NF();
    };
    const prior = await receiptsByKey(db, g.tenantId, base);
    if (prior.length) return replay(prior);
    // สลิปตรวจหลังกันซ้ำ: สลิปที่ใช้แล้วกับคำขออื่น ⇒ IDEMPOTENCY_CONFLICT SLIP_ALREADY_USED (ไม่ใช่ SLIP_MISMATCH)
    const sg = await slipGate(db, g, v);
    if (sg) return sg;
    const st = payableStatusGate(b);
    if (st) return st;
    const r = await runTripsTx(g, (tx) => payTx(tx, c, g, v, base, keyHash, bodyHash));
    if (!r.ok) {
      // ชนคีย์ระหว่างยิงพร้อมกัน (ร้านเดียวกัน คนละการจอง) ⇒ อ่านซ้ำแล้วตัดสินแบบเดียวกัน (ไม่ใช่ BUSY)
      if (r.code === "IDEMPOTENCY_CONFLICT" || r.code === "BUSY") {
        const again = await receiptsByKey(db, g.tenantId, base);
        if (again.length) return replay(again);
      }
      return r;
    }
    if ("replay" in r.value) return replay(r.value.replay);
    return { ok: true, value: r.value.value };
  });
}

// ═══════════════════════ §7 QR พร้อมเพย์ยอดล็อก ═══════════════════════
const intentInput = z.union([z.strictObject({ bookingId: ID }), z.strictObject({ publicToken: z.string().regex(/^[A-Za-z0-9_-]{22,128}$/) })]);
export type PaymentIntentValue = { bookingId: string; dueId: string | null; seq: number; amountSatang: number; payload: string; svgDataUrl: string; displayName: string };
/**
 * QR ยอดล็อก = ยอดค้างของงวดแรกที่ยังรับเงินได้ (งวดจริงหรือร่าง) · STAFF/SYSTEM ด้วย bookingId · PUBLIC ด้วย token ลิงก์การจอง (ผูกร้าน+หน่วย)
 * promptpayQrFor นอก tx · ไม่เขียนฐาน (ไม่สร้างงวด · ไม่ audit)
 */
export async function tripPaymentIntent(ctx: unknown, input: unknown): Promise<SellResult<PaymentIntentValue>> {
  return tripsSafely("tripPaymentIntent", ctx, async () => {
    const pc = parseCtx(ctx);
    if (!pc.ok) return pc;
    const c = pc.c;
    const p = intentInput.safeParse(input);
    if (!p.success) return invalidInput(p.error);
    const v = p.data;
    const pub = c.actor.kind === "PUBLIC";
    if (pub && !("publicToken" in v)) return sellFail("FORBIDDEN");
    if (!pub && !("bookingId" in v)) return sellFail("VALIDATION", { fields: ["bookingId"] });
    const g = await gateOf(c);
    if (!g) return NF();
    const db = unitClient(g);
    let b: MoneyBooking | null;
    if ("publicToken" in v) {
      const rows = await db.$queryRaw<{ id: string }[]>`
        SELECT "id" FROM "TripBooking" WHERE "publicTokenHash" = ${sha256hex(v.publicToken)} AND "tenantId" = ${g.tenantId} AND "unitId" = ${g.unitId}`;
      b = rows[0] ? await readMoneyBooking(db, g, rows[0].id) : null;
    } else b = await readMoneyBooking(db, g, v.bookingId);
    if (!b) return NF();
    const gate = moneyBookingGate(b) ?? payableStatusGate(b);
    if (gate) return gate;
    // มติ r1 V6: HOLD ต้องมี hold ACTIVE ที่ยังไม่หมดเวลา ณ ctx.now ทุกตัว (กติกาเดียวกับ CAS ของ convertHoldForBookingInTx ในเส้นรับเงิน) — ไม่ออก QR ให้เงินที่จะถูกปฏิเสธ
    if (b.status === "HOLD") {
      const hs = await db.$queryRaw<{ expiresAt: Date }[]>`
        SELECT "expiresAt" FROM "TripHold" WHERE "bookingId" = ${b.id} AND "tenantId" = ${g.tenantId} AND "unitId" = ${g.unitId} AND "status" = 'ACTIVE'`;
      if (!hs.length || hs.some((h) => new Date(h.expiresAt).getTime() <= c.clock.now.getTime())) return sellFail("HOLD_EXPIRED");
    }
    if (await openRefundOf(db, g, b.id)) return sellFail("STATE_CONFLICT", { reason: "REFUND_IN_PROGRESS" });
    const dues = await duesView(db, g, b);
    if (!dues) return sellFail("VALIDATION", { reason: "SNAPSHOT_INVALID" });
    const first = dues.find((d) => (TRIP_DUE_OPEN_STATUSES as readonly string[]).includes(d.status) && d.outstandingSatang > 0);
    if (!first) return sellFail("STATE_CONFLICT", { reason: "NOTHING_DUE" });
    const qr = await promptpayQrFor({ tenantId: g.tenantId }, { unitId: g.unitId, amountSatang: first.outstandingSatang, ref: b.code });
    if (!qr.ok) return qr.code === "NO_RECEIVER" ? sellFail("STATE_CONFLICT", { reason: "NO_PROMPTPAY_RECEIVER" }) : qr.code === "NOT_FOUND" ? NF() : sellFail("BUSY");
    return { ok: true, value: { bookingId: b.id, dueId: first.id, seq: first.seq, amountSatang: first.outstandingSatang, payload: qr.payload, svgDataUrl: qr.svgDataUrl, displayName: qr.displayName } };
  });
}

// ═══════════════════════ §4.7 ข้อมูลเอกสาร (ภาพ 13ค · ยังไม่ออกใบกำกับ) ═══════════════════════
export type TripMoneySummary = {
  bookingId: string;
  status: string;
  version: number;
  payableSatang: number;
  paidSatang: number;
  refundedSatang: number;
  outstandingSatang: number;
  document: ReturnType<typeof moneyDocumentOf>;
  dues: TripDueDTO[];
  events: { id: string; kind: string; dueId: string | null; tender: string; amountSatang: number; vatSatang: number; passThroughSatang: number; postingStatus: string; at: string }[];
  vat: { bookingVatSatang: number; receivedVatSatang: number; refundedVatSatang: number; retainedVatSatang: number; receiptRoundingDiffSatang: number };
  taxDocument: { status: "NOT_ISSUED"; reason: "ACCOUNT_FACADE_MISSING" };
};
/**
 * สรุปเงินของการจอง (STAFF/SYSTEM) — ข้อมูลให้ร้านออกเอกสารในบัญชี V2 เองระหว่างรอ T0.7b · taxDocument.status = NOT_ISSUED
 * vat.receiptRoundingDiffSatang = Σ VAT ต่อใบรับ − VAT ของการจอง (ต่อเอกสาร · ≤ n−1 สตางค์ · มติ §22 ข้อ 2 · ⚖️ ป้าย U ตรวจกับนักบัญชี)
 * การจองที่ลบข้อมูลผู้จองแล้ว (piiPurgedAt) ยังอ่านสรุปได้ (มติ r1 V8 — ไม่มีข้อมูลบุคคลในผล · เงินที่รับต้องตรวจ/คืนได้)
 */
export async function tripMoneySummary(ctx: unknown, input: unknown): Promise<SellResult<TripMoneySummary>> {
  return tripsSafely("tripMoneySummary", ctx, async () => {
    const pc = parseCtx(ctx);
    if (!pc.ok) return pc;
    const rg = readerGate(pc.c);
    if (rg) return rg;
    const p = bookingIdInput.safeParse(input);
    if (!p.success) return invalidInput(p.error);
    const g = await gateOf(pc.c);
    if (!g) return NF();
    const db = unitClient(g);
    const b = await readMoneyBooking(db, g, p.data.bookingId);
    if (!b) return NF();
    const payable = payableOfSnapshot(b.policySnapshot);
    const doc = moneyDocumentOf(b.policySnapshot);
    const dues = await duesView(db, g, b);
    if (payable === null || !doc || !dues) return sellFail("VALIDATION", { reason: "SNAPSHOT_INVALID" });
    const evs = await db.$queryRaw<{ id: string; kind: string; dueId: string | null; tender: string; amountSatang: number; vatSatang: number; passThroughSatang: number; postingStatus: string; createdAt: Date }[]>`
      SELECT "id", "kind", "dueId", "tender", "amountSatang", "vatSatang", "passThroughSatang", "postingStatus", "createdAt" FROM "TripMoneyEvent"
      WHERE "bookingId" = ${b.id} AND "tenantId" = ${g.tenantId} AND "unitId" = ${g.unitId} ORDER BY "createdAt", "id"`;
    const vatOf = (k: string) => evs.filter((e) => e.kind === k).reduce((s, e) => s + Number(e.vatSatang), 0);
    const received = vatOf("RECEIVED");
    return {
      ok: true,
      value: {
        bookingId: b.id,
        status: b.status,
        version: b.version,
        payableSatang: payable,
        paidSatang: b.paidSatang,
        refundedSatang: b.refundedSatang,
        outstandingSatang: SOLD.has(b.status) || b.status === "HOLD" ? Math.max(0, payable - b.paidSatang) : 0,
        document: doc,
        dues,
        events: evs.map((e) => ({ id: e.id, kind: e.kind, dueId: e.dueId, tender: e.tender, amountSatang: Number(e.amountSatang), vatSatang: Number(e.vatSatang), passThroughSatang: Number(e.passThroughSatang), postingStatus: e.postingStatus, at: new Date(e.createdAt).toISOString() })),
        vat: {
          bookingVatSatang: b.vatSatang,
          receivedVatSatang: received,
          refundedVatSatang: vatOf("REFUNDED"),
          retainedVatSatang: vatOf("RETAINED"),
          receiptRoundingDiffSatang: b.paidSatang >= payable && payable > 0 ? received - b.vatSatang : 0,
        },
        taxDocument: { status: "NOT_ISSUED", reason: "ACCOUNT_FACADE_MISSING" },
      },
    };
  });
}

// ═══════════════════════ §6.5 ข้อมูลกระทบยอดเงินสดหน้าร้าน (หนี้ N-4) ═══════════════════════
const YMD = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((s) => {
  const d = new Date(`${s}T00:00:00.000Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
});
const cashDayInput = z.strictObject({ businessDate: YMD });
type TenderTotals = { receivedSatang: number; refundedSatang: number };
export type TripCashDay = {
  unitId: string;
  businessDate: string;
  tz: string;
  receivedSatang: number;
  refundedSatang: number;
  expectedSatang: number;
  byTender: Record<(typeof TRIP_TENDERS)[number], TenderTotals>;
  events: { id: string; bookingId: string; kind: string; tender: string; amountSatang: number; at: string }[];
};
/**
 * แถวเงินของวันทำการ (เวลาร้าน) ของหน่วย — expected = เงินสดรับ − เงินสดคืน (RETAINED ไม่นับ) · ไม่เขียน TripCashClose (T1.3) · ไม่แตะลิ้นชัก POS
 * ดัชนี: TripMoneyEvent_tenantId_postingStatus_idx + กรองเวลา (หนี้: ดัชนี (tenantId, unitId, createdAt) ต้อง migration · ใบปิดยอด T1.3)
 */
export async function tripCashDay(ctx: unknown, input: unknown): Promise<SellResult<TripCashDay>> {
  return tripsSafely("tripCashDay", ctx, async () => {
    const pc = parseCtx(ctx);
    if (!pc.ok) return pc;
    if (pc.c.actor.kind !== "STAFF") return sellFail("FORBIDDEN");
    const p = cashDayInput.safeParse(input);
    if (!p.success) return invalidInput(p.error);
    const g = await gateOf(pc.c);
    if (!g) return NF();
    const day = p.data.businessDate;
    const from = localToUtc(g.tz, day, 0).toISOString();
    const to = localToUtc(g.tz, addDaysYmd(day, 1), 0).toISOString();
    const rows = await unitClient(g).$queryRaw<{ id: string; bookingId: string; kind: string; tender: string; amountSatang: number; createdAt: Date }[]>`
      SELECT "id", "bookingId", "kind", "tender", "amountSatang", "createdAt" FROM "TripMoneyEvent"
      WHERE "tenantId" = ${g.tenantId} AND "postingStatus" = ANY(ARRAY['UNPOSTED','POSTED','FAILED_NEEDS_ACTION']::text[]) AND "unitId" = ${g.unitId}
        AND "kind" IN ('RECEIVED', 'REFUNDED') AND "createdAt" >= ${from}::timestamp AND "createdAt" < ${to}::timestamp
      ORDER BY "createdAt", "id"`;
    const byTender = Object.fromEntries(TRIP_TENDERS.map((t) => [t, { receivedSatang: 0, refundedSatang: 0 }])) as Record<(typeof TRIP_TENDERS)[number], TenderTotals>;
    let received = 0;
    let refunded = 0;
    for (const r of rows) {
      const bucket = byTender[r.tender as (typeof TRIP_TENDERS)[number]];
      const a = Number(r.amountSatang);
      if (r.kind === "RECEIVED") {
        received += a;
        if (bucket) bucket.receivedSatang += a;
      } else {
        refunded += a;
        if (bucket) bucket.refundedSatang += a;
      }
    }
    return {
      ok: true,
      value: {
        unitId: g.unitId,
        businessDate: day,
        tz: g.tz,
        receivedSatang: received,
        refundedSatang: refunded,
        expectedSatang: byTender.CASH.receivedSatang - byTender.CASH.refundedSatang,
        byTender,
        events: rows.map((r) => ({ id: r.id, bookingId: r.bookingId, kind: r.kind, tender: r.tender, amountSatang: Number(r.amountSatang), at: new Date(r.createdAt).toISOString() })),
      },
    };
  });
}
// ═══════════════════════ §13 งาน trips.paymentDue (ส่วนต่อร้าน · jobs.ts เป็นทางเข้าข้ามร้าน) ═══════════════════════
export type DueTickRow = { id: string; bookingId: string; dueAt: Date; amountSatang: number; paidSatang: number };
/** เตือนงวด: ทุก d ใน T16 ที่ dueAt − d วัน ≤ now < dueAt ⇒ trips.payment.due_soon คีย์ <dueId>:<d> (ซ้ำ = ไม่ยิง) · ไม่เปลี่ยนแถว — คืนจำนวนที่ยิงใหม่ */
export async function emitDueReminders(g: Gate, due: DueTickRow, days: readonly number[], now: Date): Promise<number> {
  const at = new Date(due.dueAt).getTime();
  const t = now.getTime();
  const hit = [...new Set(days)].filter((d) => Number.isInteger(d) && d >= 0 && at - d * MS_PER_DAY <= t && t < at);
  if (!hit.length) return 0;
  const payload = { dueId: due.id, bookingId: due.bookingId, amountSatang: due.amountSatang - due.paidSatang, dueAt: new Date(due.dueAt).toISOString() };
  return emitOutboxMany(unitClient(g), hit.map((d) => ({ tenantId: g.tenantId, unitId: g.unitId, type: "trips.payment.due_soon", idempotencyKey: `trips.payment.due_soon:${due.id}:${d}`, payload })));
}
export type DueOverdueValue = { overdue: boolean; dueStatus: string | null; overdueAction: string | null; bookingStatus: string; bookingVersion: number; autoReleased: boolean };
/** ยื่นคำขอคืนเงินอัตโนมัติ (T17 AUTO_RELEASE) ในธุรกรรมเดียวกับ CAS → OVERDUE — ผู้เรียก (jobs.ts) ส่งตัวยื่นของ refund.ts เข้ามา (ไม่มีเส้น import money → refund) */
export type AutoReleaseInTx = (tx: Tx, b: MoneyBooking, dueId: string) => Promise<boolean>;
/**
 * เลยกำหนด (ต่องวดหนึ่ง tx · §10 · มติ r1 V1): 2b การจอง FOR UPDATE (ต้อง CONFIRMED/PART_PAID · ไม่มีคำขอคืนเงินเปิด) → อ่านงวดซ้ำใต้ล็อก →
 * now ≥ dueAt + X11 (snapshot) ⇒ 2d CAS งวด (ยังค้างจ่าย) → OVERDUE → 2h trips.payment.overdue →
 * เฉพาะรอบที่เปลี่ยนเป็น OVERDUE จริง + T17 = AUTO_RELEASE ⇒ autoRelease(tx, …) ในธุรกรรมเดียวกัน (งวดยังค้างจ่ายแน่นอนใต้ล็อก · hunt M-3)
 * ไม่บันทึกโอนคืน/ไม่ปล่อยที่เอง · งวดที่จ่ายแล้วระหว่างทาง ⇒ ไม่ทำอะไร (ไม่ใช่ความล้ม)
 */
export async function markTripDueOverdue(g: Gate, due: { id: string; bookingId: string }, now: Date, autoRelease?: AutoReleaseInTx): Promise<SellResult<DueOverdueValue>> {
  return runTripsTx(g, async (tx): Promise<DueOverdueValue> => {
    const b = await lockMoneyBookingInTx(tx, g, due.bookingId);
    if (!b) throw new BookingAbort("NOT_FOUND");
    const rows = await tx.$queryRaw<DueRow[]>`SELECT ${DUE_COLS} FROM "TripPaymentDue" WHERE "id" = ${due.id} AND "bookingId" = ${b.id} AND "tenantId" = ${g.tenantId} AND "unitId" = ${g.unitId}`;
    const d = rows[0];
    const base = { bookingStatus: b.status, bookingVersion: b.version, autoReleased: false };
    if (!d || (b.status !== "CONFIRMED" && b.status !== "PART_PAID")) return { overdue: false, dueStatus: d?.status ?? null, overdueAction: null, ...base };
    if (await openRefundOf(tx, g, b.id)) return { overdue: false, dueStatus: d.status, overdueAction: null, ...base };
    let action: unknown;
    try {
      action = snapshotValue(b.policySnapshot, "trips", "trips.pay.overdueAction");
    } catch {
      throw new BookingAbort("VALIDATION", { reason: "SNAPSHOT_INVALID" });
    }
    const grace = graceHoursOf(b.policySnapshot);
    if (grace === null || typeof action !== "string") throw new BookingAbort("VALIDATION", { reason: "SNAPSHOT_INVALID" });
    const due0 = new Date(d.dueAt).getTime();
    if (now.getTime() < due0 + grace * MS_PER_HOUR || (d.status !== "OPEN" && d.status !== "PARTLY_PAID") || d.paidSatang >= d.amountSatang) {
      return { overdue: false, dueStatus: d.status, overdueAction: action, ...base };
    }
    const cas = await tx.$queryRaw<{ id: string }[]>`
      UPDATE "TripPaymentDue" SET "status" = 'OVERDUE', "updatedAt" = now()
      WHERE "id" = ${d.id} AND "tenantId" = ${g.tenantId} AND "unitId" = ${g.unitId} AND "status" = ANY(ARRAY['OPEN','PARTLY_PAID']::text[]) AND "paidSatang" < "amountSatang"
      RETURNING "id"`;
    if (cas.length !== 1) return { overdue: false, dueStatus: d.status, overdueAction: action, ...base };
    await emitMoney(tx, g, [{ type: "trips.payment.overdue", key: d.id, payload: { dueId: d.id, bookingId: b.id, amountSatang: d.amountSatang - d.paidSatang, dueAt: new Date(d.dueAt).toISOString() } }]);
    await auditMoney(tx, { tenantId: g.tenantId, unitId: g.unitId, actor: { kind: "SYSTEM", job: "trips.paymentDue" } }, "trips.payment.overdue", { type: "TripPaymentDue", id: d.id }, {
      bookingId: b.id,
      status: "OVERDUE",
      outstandingSatang: d.amountSatang - d.paidSatang,
      overdueAction: action,
    }, { status: d.status });
    const released = action === "AUTO_RELEASE" && autoRelease ? await autoRelease(tx, b, d.id) : false;
    return { overdue: true, dueStatus: "OVERDUE", overdueAction: action, ...base, autoReleased: released };
  });
}
// ── /T0.7 money ──
