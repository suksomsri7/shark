// ─────────────────────────────────────────────────────────────
// trips/cancel-departure.ts — ร้านยกเลิกรอบที่มีคนจอง (RUN TRIPS T1.6a1 · ใบสั่ง ledger/trips-briefs/T1.6.md §5 · มติ N1–N14 C10–C14)
//   cancelDepartureWithBookings — ยกเลิกในธุรกรรมเดียว: ปล่อยถือที่/คำขอจอง/รายการรอ · ถอนคำขอคืนเงินเปิดทุกใบ · แถวผล PENDING ทุกการจองที่ยืนยันแล้ว (C11)
//   resolveCancelledBooking — ร้านบันทึกทางออกต่อการจอง: REFUND (คืน 100 % จากใบรับจริง · อนุมัติให้เอง) · NO_MONEY (settleNoMoneyInTx) · MOVE = a2
//   withdrawForPaymentInTx — เงินเข้าหลังร้านยกเลิก (N13): ถอนคำขอเปิดแล้วยื่นใหม่ในธุรกรรมของ recordTripPayment
// 🔴 สิทธิ์ตรวจในบริการจาก membership เอง (N3) · ไม่รับสิทธิ์ผ่าน opts · หน่วย/ร้านอื่น ⇒ NOT_FOUND
// 🔴 ลำดับล็อก (CC :495): advisory ของรอบ → 1a รอบ FOR UPDATE → ถือที่ → การจองเรียง id FOR UPDATE → คำขอ → แถวผล
// 🔴 ทางเงินที่เดียว: คำขอคืนเงินผ่าน fileRefundRequestInTx / withdrawRefundInTx ของ refund.ts · ไม่มีแถวเงินในไฟล์นี้ · นาฬิกา = now ที่ฉีด (ไม่ใช้นาฬิกาฐาน)
// 🔴 payload/audit ไม่มีข้อมูลบุคคล · ไม่มี decideBy ในอีเวนต์ต่อการจอง (N1 · จนกว่า T1.6b)
// ─────────────────────────────────────────────────────────────
import { createHash } from "node:crypto";
import { z } from "zod";
import { tenantDb } from "@/lib/core/db";
import { canAccessUnit, evaluate, type MembershipCtx } from "@/lib/core/rbac";
import { resolveSettings } from "@/lib/core/settings";
import { transitionBookingInTx, runTripsTx } from "./booking";
import { seatsOfSnapshot, type SnapshotShape } from "./booking-core";
import { CANCEL_KINDS, cancelOptionsOf, decideByOf } from "./cancel-departure-core";
import { parseCtx, releaseHoldForBookingInTx, releaseHoldInTx, returnSoldInTx, type Ctx, type Gate as CGate, type Tx } from "./capacity";
import { normalizeTimezone } from "./departures-core";
import { auditMoney, bookingEventPayload, emitMoney, receivedAfterCancelOf, lockMoneyBookingInTx, moneyNsKey, moneyRowId, moneySellCtx, openRefundOf, readMoneyBooking, type MoneyBooking, type MoneyEvt } from "./money";
import { releasePromoInTx } from "./promo";
import { fileRefundRequestInTx, withdrawRefundInTx } from "./refund";
import { auditTx, lockDeparture, releaseUsesTx, type Gate, type TripCtx, type TripOpts } from "./resources";

// ── T1.6a1 cancel-departure ──
const INT4 = 2_147_483_647;
const sha256hex = (s: string) => createHash("sha256").update(s).digest("hex");
const isRec = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const ID = z.string().trim().min(1).max(128);
const IDEM_KEY = z.string().regex(/^[A-Za-z0-9_-]{8,90}$/);
const VERSION = z.number().int().min(0).max(INT4);
const REASON = z.string().trim().min(3).max(500);
const K_T22 = "trips.cancel.shopCancelOptions";
const P_STATUS = "trips.departure.status";
const P_APPROVE = "trips.refund.approve";
const P_REQUEST = "trips.refund.request";
const P_CANCEL = "trips.booking.cancel";
const P_EDIT = "trips.booking.edit";
const SOLD: ReadonlySet<string> = new Set(["CONFIRMED", "PART_PAID", "PAID"]);
const UNPAID: ReadonlySet<string> = new Set(["HOLD", "PENDING"]);
/** ข้อความในคำขอคืนเงินของทางนี้เมื่อร้านไม่ได้พิมพ์ (แสดงผล · ไม่ใช่ค่าธุรกิจ) */
const DEFAULT_REFUND_REASON = "ร้านยกเลิกรอบ — คืนเงินเต็มจำนวน";
const REFILE_REASON = "รับเงินเพิ่มหลังร้านยกเลิกรอบ — ยื่นคำขอใหม่ด้วยยอดใหม่";

export type CancelFail = { ok: false; code: string; message: string; details?: Record<string, unknown> };
const MESSAGES: Record<string, string> = {
  NOT_FOUND: "ไม่พบรายการ",
  FORBIDDEN: "ไม่มีสิทธิ์ทำรายการนี้",
  VALIDATION: "ข้อมูลไม่ถูกต้อง",
  STATE_CONFLICT: "ข้อมูลเปลี่ยนไปแล้ว — โหลดหน้าใหม่แล้วลองอีกครั้ง",
  IDEMPOTENCY_CONFLICT: "คำขอนี้ถูกใช้กับข้อมูลอื่นไปแล้ว",
  FORBIDDEN_TRANSITION: "รอบนี้ยกเลิกแล้ว",
  BUSY: "ระบบกำลังทำรายการเดียวกันอยู่ ลองใหม่อีกครั้ง",
};
const REASON_TH: Record<string, string> = {
  BOOKINGS_CHANGED: "จำนวนการจองไม่ตรงกับที่พิมพ์ยืนยัน — มีการจองเปลี่ยนระหว่างนี้ โหลดหน้าใหม่แล้วยืนยันอีกครั้ง",
  DEPARTURE_STARTED: "รอบนี้ออกเดินทางแล้ว ยกเลิกทางนี้ไม่ได้",
  NO_MONEY_USE_CLOSE: "การจองนี้ไม่มีเงินรับไว้ — ใช้ปุ่มปิดการจอง",
  HAS_MONEY_USE_REFUND: "การจองนี้มีเงินรับไว้ — ใช้ปุ่มคืนเงินเต็ม",
  MOVE_NOT_AVAILABLE_YET: "การย้ายรอบยังไม่เปิดใช้",
  CHOICE_ALREADY_MADE: "การจองนี้บันทึกทางออกไปแล้ว",
  AGENCY_NOT_ENABLED: "การจองของเอเจนซี่ที่มีเงินในระบบยังจัดการทางนี้ไม่ได้",
  NOT_CANCELLED_BY_SHOP: "การจองนี้ไม่ได้อยู่ในรอบที่ร้านยกเลิก",
  REASON_REQUIRED: "การจองของเอเจนซี่ต้องระบุเหตุผล",
  SETTINGS_INVALID: "ค่าตั้งตัวเลือกเมื่อร้านยกเลิกรอบไม่ถูกต้อง",
};
const fail = (code: string, reason?: string, extra?: Record<string, unknown>): CancelFail => ({
  ok: false,
  code,
  message: (reason && REASON_TH[reason]) || MESSAGES[code] || MESSAGES.VALIDATION,
  ...(reason || extra ? { details: { ...(reason ? { reason } : {}), ...(extra ?? {}) } } : {}),
});
/** ผลพลาดในธุรกรรม — โยนเพื่อ rollback ทั้งก้อน แล้วแปลงกลับนอก tx */
class CancelAbort extends Error {
  constructor(readonly fail: CancelFail) {
    super(fail.code);
  }
}
const abort = (code: string, reason?: string, extra?: Record<string, unknown>): never => {
  throw new CancelAbort(fail(code, reason, extra));
};
/** ธุรกรรม (runTripsTx ของ T0.6: ลองใหม่เมื่อ deadlock · BookingAbort ⇒ ผลพลาด) + CancelAbort ⇒ ผลพลาด */
async function txOf<T>(g: CGate, fn: (tx: Tx) => Promise<T>): Promise<{ ok: true; value: T } | CancelFail> {
  try {
    const r = await runTripsTx(g, fn);
    return r.ok ? { ok: true, value: r.value } : { ok: false, code: r.code, message: r.messageTh, ...(r.details ? { details: r.details } : {}) };
  } catch (e) {
    if (e instanceof CancelAbort) return e.fail;
    throw e;
  }
}
/** ชั้น 0: advisory ของรอบ `trips.depcancel:<departureId>` (ผู้ยกเลิกพร้อมกันเข้าทีละคน) */
async function advisoryLockTx(tx: Tx, departureId: string): Promise<void> {
  await tx.$queryRaw`SELECT 1 AS "locked" FROM pg_advisory_xact_lock(hashtext('trips.depcancel'), hashtext(${departureId}))`;
}

/** ด่านสิทธิ์ของทางนี้ (N3): membership สด → หน่วยของร้าน + canAccessUnit (ไม่ได้ ⇒ NOT_FOUND) → TRIPS → ทุกคีย์ต้องผ่าน (ไม่ผ่าน ⇒ FORBIDDEN) */
async function gateAll(ctx: TripCtx, unitId: unknown, actions: readonly string[]): Promise<Gate | CancelFail> {
  if (!isRec(ctx) || typeof ctx.tenantId !== "string" || !ctx.tenantId || typeof ctx.actorUserId !== "string" || !ctx.actorUserId) return fail("NOT_FOUND");
  if (typeof unitId !== "string" || !unitId) return fail("VALIDATION", undefined, { fields: ["unitId"] });
  const db = tenantDb({ tenantId: ctx.tenantId });
  const mem = await db.membership.findFirst({ where: { tenantId: ctx.tenantId, userId: ctx.actorUserId, acceptedAt: { not: null } }, select: { role: true, unitAccess: true, permissions: true } });
  if (!mem) return fail("NOT_FOUND");
  const m: MembershipCtx = {
    role: mem.role,
    unitAccess: Array.isArray(mem.unitAccess) ? mem.unitAccess.filter((x): x is string => typeof x === "string") : [],
    permissions: isRec(mem.permissions) ? mem.permissions : {},
  };
  const unit = await db.businessUnit.findFirst({ where: { id: unitId }, select: { id: true, type: true, settings: true } });
  if (!unit || !canAccessUnit(m, unit.id) || unit.type !== "TRIPS") return fail("NOT_FOUND");
  if (!actions.every((action) => evaluate(m, { module: "trips", action, unitId: unit.id }))) return fail("FORBIDDEN");
  return { tenantId: ctx.tenantId, unitId: unit.id, tz: normalizeTimezone(isRec(unit.settings) ? unit.settings.timezone : null), actorId: ctx.actorUserId, actorType: "USER" };
}
const isGateFail = (x: Gate | CancelFail): x is CancelFail => "ok" in x && x.ok === false;
const nowOf = (opts?: TripOpts): Date | null => {
  const n = opts?.now ?? new Date();
  return n instanceof Date && Number.isFinite(n.getTime()) ? n : null;
};
const staffCtx = (g: Gate, userId: string, now: Date) => ({ tenantId: g.tenantId, unitId: g.unitId, channel: "COUNTER" as const, actor: { kind: "STAFF" as const, userId }, now });
const ctxOf = (g: Gate, userId: string, now: Date): Ctx => {
  const pc = parseCtx(staffCtx(g, userId, now));
  if (!pc.ok) throw new Error("trips.cancel-departure: ctx ไม่ถูกต้อง");
  return pc.c;
};
const isAgency = (b: { collectMode: string; agentAccountId: string | null }) => b.collectMode === "AGENT" || b.agentAccountId !== null;
/** audit ที่จดคีย์กันซ้ำ (after.idemKeyHash) ของเป้าหมายนี้ */
async function idemAuditOf(db: Tx, tenantId: string, action: string, targetId: string, keyHash: string): Promise<Record<string, unknown> | null> {
  const rows = await db.$queryRaw<{ after: unknown }[]>`
    SELECT "after" FROM "AuditLog" WHERE "tenantId" = ${tenantId} AND "action" = ${action} AND "targetId" = ${targetId} AND "after"->>'idemKeyHash' = ${keyHash} LIMIT 1`;
  const a = rows[0]?.after;
  return isRec(a) ? a : null;
}

// ═══════════════════════ §5.1 ยกเลิกรอบที่มีคน ═══════════════════════
const cancelInput = z.strictObject({
  unitId: ID,
  departureId: ID,
  expectedVersion: VERSION,
  kind: z.enum(CANCEL_KINDS),
  reason: REASON,
  confirmBookings: VERSION,
  idempotencyKey: IDEM_KEY,
});
export type CancelDepartureValue = { departureId: string; status: "CANCELLED"; kind: string; decideBy: string; outcomes: number; heldSatang: number; replayed: boolean };
type BookingLockRow = { id: string; status: string; version: number; paidSatang: number; refundedSatang: number; collectMode: string; agentAccountId: string | null; channel: string; payable: number };
type OpenReqRow = { id: string; status: string; bookingId: string };

/**
 * ยกเลิกรอบที่มีการจอง (ใบสั่ง §5.1): สิทธิ์ departure.status ∧ refund.approve · confirmBookings = จำนวนการจองที่ยืนยันแล้ว ·
 * กันซ้ำ: คีย์เดิมเนื้อหาเดิม ⇒ ผลเดิม (replayed) · เนื้อหาต่าง ⇒ IDEMPOTENCY_CONFLICT · รอบยกเลิกแล้ว ⇒ FORBIDDEN_TRANSITION
 */
export async function cancelDepartureWithBookings(ctx: TripCtx, input: unknown, opts?: TripOpts): Promise<{ ok: true; value: CancelDepartureValue } | CancelFail> {
  const g = await gateAll(ctx, isRec(input) ? input.unitId : undefined, [P_STATUS, P_APPROVE]);
  if (isGateFail(g)) return g;
  const p = cancelInput.safeParse(input);
  if (!p.success) return fail("VALIDATION", undefined, { fields: [...new Set(p.error.issues.map((i) => i.path.join(".")))].slice(0, 8) });
  const v = p.data;
  const now = nowOf(opts);
  if (!now) return fail("VALIDATION", undefined, { fields: ["now"] });
  const cg: CGate = { tenantId: g.tenantId, unitId: g.unitId, tz: g.tz };
  const c = ctxOf(g, ctx.actorUserId, now);
  const db = tenantDb({ tenantId: g.tenantId, unitId: g.unitId }) as unknown as Tx;
  const keyHash = sha256hex(`depcancel:${g.unitId}:${v.departureId}:${v.idempotencyKey}`);
  const bodyHash = sha256hex(JSON.stringify(["trips.depcancel.v1", v.departureId, v.expectedVersion, v.kind, v.reason, v.confirmBookings]));
  const replay = (a: Record<string, unknown>): { ok: true; value: CancelDepartureValue } | CancelFail =>
    a.bodyHash === bodyHash
      ? { ok: true, value: { departureId: v.departureId, status: "CANCELLED", kind: String(a.kind), decideBy: String(a.decideBy), outcomes: Number(a.bookings), heldSatang: Number(a.heldSatang), replayed: true } }
      : fail("IDEMPOTENCY_CONFLICT");
  const prior = await idemAuditOf(db, g.tenantId, "trips.departure.cancel", v.departureId, keyHash);
  if (prior) return replay(prior);
  // นอก tx: สินค้าของรอบ → T22 ปัจจุบัน (ตัวเลือก ณ ตอนยกเลิก · REFUND_100 ใส่เสมอ · N9) → เส้นตาย (N7)
  const dep0 = (await db.$queryRaw<{ productId: string }[]>`SELECT "productId" FROM "TripDeparture" WHERE "id" = ${v.departureId} AND "tenantId" = ${g.tenantId} AND "unitId" = ${g.unitId}`)[0];
  if (!dep0) return fail("NOT_FOUND");
  const t22 = (await resolveSettings({ tenantId: g.tenantId }, [K_T22], { unitId: g.unitId, productId: dep0.productId }, now))[K_T22]?.value;
  const days = isRec(t22) ? t22.autoRefundAfterDays : undefined;
  if (!isRec(t22) || typeof days !== "number" || !Number.isSafeInteger(days) || days < 0) return fail("VALIDATION", "SETTINGS_INVALID");
  const options = cancelOptionsOf(t22 as { options?: unknown[] });
  const decideBy = decideByOf(now, days, g.tz);
  const iso = now.toISOString();
  const r = await txOf(cg, async (tx): Promise<{ replay: Record<string, unknown> } | { value: CancelDepartureValue }> => {
    await advisoryLockTx(tx, v.departureId); // ชั้น 0
    const again = await idemAuditOf(tx, g.tenantId, "trips.departure.cancel", v.departureId, keyHash);
    if (again) return { replay: again };
    // 1a รอบ
    const dep = await lockDeparture(tx, g, v.departureId);
    if (!dep) return abort("NOT_FOUND");
    if (dep.status === "CANCELLED") return abort("FORBIDDEN_TRANSITION");
    if (dep.version !== v.expectedVersion) return abort("STATE_CONFLICT");
    if (now.getTime() >= new Date(dep.startsAt).getTime()) return abort("STATE_CONFLICT", "DEPARTURE_STARTED");
    // รายการรอที่ยังรอ ⇒ ปิดก่อนปล่อยถือที่ (ไม่ให้การปล่อยเสนอที่ว่างให้รายการรอของรอบที่กำลังยกเลิก)
    await tx.$queryRaw`
      UPDATE "TripWaitlist" SET "status" = 'CANCELLED', "updatedAt" = ${iso}::timestamp
      WHERE "departureId" = ${dep.id} AND "tenantId" = ${g.tenantId} AND "unitId" = ${g.unitId} AND "status" = 'WAITING' RETURNING "id"`;
    // ถือที่ ACTIVE ทั้งรอบ (CAS ปล่อย · ข้อเสนอรายการรอปิดตามไปด้วย) — การจอง HOLD/PENDING ยกเลิกด้านล่าง
    const sc = staffCtx(g, ctx.actorUserId, now);
    const holds = await tx.$queryRaw<{ id: string; bookingId: string | null }[]>`
      SELECT "id", "bookingId" FROM "TripHold" WHERE "departureId" = ${dep.id} AND "tenantId" = ${g.tenantId} AND "unitId" = ${g.unitId} AND "status" = 'ACTIVE' ORDER BY "id"`;
    for (const h of holds) {
      const rel = h.bookingId
        ? await releaseHoldForBookingInTx(tx, sc, { holdId: h.id, reason: "DEPARTURE_CANCELLED" }, undefined, h.bookingId)
        : await releaseHoldInTx(tx, sc, { holdId: h.id, reason: "DEPARTURE_CANCELLED" });
      if (!rel.ok) abort(rel.code, typeof rel.details?.reason === "string" ? rel.details.reason : undefined);
    }
    // 2b การจองทั้งรอบ เรียง id
    const bookings = await tx.$queryRaw<BookingLockRow[]>`
      SELECT "id", "status", "version", "paidSatang", "refundedSatang", "collectMode", "agentAccountId", "channel",
        COALESCE(("policySnapshot"->'totals'->>'payableSatang')::int, 0) AS "payable"
      FROM "TripBooking" WHERE "departureId" = ${dep.id} AND "tenantId" = ${g.tenantId} AND "unitId" = ${g.unitId}
        AND "status" IN ('HOLD', 'PENDING', 'CONFIRMED', 'PART_PAID', 'PAID') ORDER BY "id" FOR UPDATE`;
    const sold = bookings.filter((b) => SOLD.has(b.status));
    if (sold.length !== v.confirmBookings) return abort("STATE_CONFLICT", "BOOKINGS_CHANGED", { bookings: sold.length });
    // 2b′ ถอนคำขอคืนเงินเปิดทุกใบ (N10 · ไม่ว่าเหตุ) — EXECUTING ไม่ค้างในฐาน · FAILED ไม่มีในทางนี้
    const open = sold.length
      ? await tx.$queryRaw<OpenReqRow[]>`
          SELECT "id", "status", "bookingId" FROM "TripRefundRequest" WHERE "bookingId" = ANY(${sold.map((b) => b.id)}::text[]) AND "tenantId" = ${g.tenantId} AND "unitId" = ${g.unitId}
            AND "status" IN ('QUOTED', 'APPROVED') ORDER BY "id" FOR UPDATE`
      : [];
    for (const q of open) await withdrawRefundInTx(tx, cg, q, `ร้านยกเลิกรอบ: ${v.reason}`);
    if (sold.some((b) => b.paidSatang - b.refundedSatang < 0)) return abort("STATE_CONFLICT", "INTEGRITY");
    // HOLD/PENDING ⇒ CANCELLED (ถือที่ปล่อยแล้วข้างบน) → คืนโค้ด
    const evts: MoneyEvt[] = [];
    for (const b of bookings.filter((x) => UNPAID.has(x.status))) {
      const tr = await transitionBookingInTx(tx, sc, { bookingId: b.id, from: b.status, to: "CANCELLED", expectedVersion: b.version, reason: v.reason });
      if (!tr.ok) abort(tr.code);
      await releasePromoInTx(tx, sc, { bookingId: b.id });
      evts.push({ type: "trips.booking.cancelled", key: b.id, payload: bookingEventPayload(g, { id: b.id, departureId: dep.id, channel: b.channel }, "CANCELLED", Number(b.payable)) });
    }
    // รายการรอของรอบ ⇒ ปิด
    await tx.$queryRaw`
      UPDATE "TripWaitlist" SET "status" = 'CANCELLED', "updatedAt" = ${iso}::timestamp
      WHERE "departureId" = ${dep.id} AND "tenantId" = ${g.tenantId} AND "unitId" = ${g.unitId} AND "status" IN ('WAITING', 'OFFERED') RETURNING "id"`;
    await releaseUsesTx(tx, g, dep.id, now); // N14
    // แถวผล: ทุกการจองที่ยืนยันแล้ว (C11) · เอเจนซี่มีเงิน ⇒ AGENCY_MONEY_HELD (N11)
    let agencyHeld = 0;
    let noMoney = 0;
    let heldSatang = 0;
    for (const b of sold) {
      const money = b.paidSatang - b.refundedSatang;
      heldSatang += money;
      if (money === 0) noMoney++;
      const choice = isAgency(b) && money > 0 ? "AGENCY_MONEY_HELD" : "PENDING";
      if (choice === "AGENCY_MONEY_HELD") agencyHeld++;
      await tx.$queryRaw`
        INSERT INTO "TripDepartureCancelOutcome" ("id", "tenantId", "unitId", "departureId", "bookingId", "choice", "by", "refundRequestId", "consent", "at", "createdAt", "updatedAt")
        VALUES (${moneyRowId("tdco_")}, ${g.tenantId}, ${g.unitId}, ${dep.id}, ${b.id}, ${choice}, 'STAFF', NULL, NULL, ${iso}::timestamp, ${iso}::timestamp, ${iso}::timestamp)
        RETURNING "id"`;
      evts.push({
        type: "trips.booking.cancel_choice_offered",
        key: `${b.id}:${dep.id}`,
        payload: { bookingId: b.id, departureId: dep.id, options, recipient: isAgency(b) ? "AGENT" : "CUSTOMER", agentAccountId: b.agentAccountId, paidSatang: money },
      });
    }
    // รอบ CANCELLED + cancelKind/cancelDecideBy/cancelOptions (CHECK รวมของ migration) · ตัวนับของการปล่อยถือที่ข้างบนขยับ version ภายใน tx นี้ —
    // ผู้อื่นไม่เคยเห็นค่าระหว่างทาง (ถือแถวรอบตลอด) ⇒ version สุดท้าย = ที่ผู้ยกเลิกเห็น + 1 (CAS ของจอทำงานตามเดิม)
    const upd = await tx.$queryRaw<{ version: number }[]>`
      UPDATE "TripDeparture" SET "status" = 'CANCELLED', "version" = ${dep.version + 1}, "cancelReason" = ${v.reason}, "cancelledAt" = ${iso}::timestamp, "updatedAt" = ${iso}::timestamp,
        "cancelKind" = ${v.kind}, "cancelDecideBy" = ${decideBy.toISOString()}::timestamp, "cancelOptions" = ${JSON.stringify(options)}::jsonb
      WHERE "id" = ${dep.id} AND "tenantId" = ${g.tenantId} AND "unitId" = ${g.unitId} AND "status" <> 'CANCELLED'
      RETURNING "version"`;
    if (upd.length !== 1) return abort("STATE_CONFLICT");
    evts.unshift({
      type: "trips.departure.cancelled",
      key: dep.id,
      payload: { id: dep.id, productId: dep.productId, status: "CANCELLED", sold: dep.sold, minPax: dep.minPax, kind: v.kind, decideBy: decideBy.toISOString(), affected: sold.length, noMoney, agencyHeld },
    });
    await emitMoney(tx, cg, evts);
    const after = {
      status: "CANCELLED",
      kind: v.kind,
      reason: v.reason,
      decideBy: decideBy.toISOString(),
      options,
      bookings: sold.length,
      outcomes: { PENDING: sold.length - agencyHeld, AGENCY_MONEY_HELD: agencyHeld },
      noMoney,
      heldSatang,
      releasedBookings: bookings.length - sold.length,
      releasedHolds: holds.length,
      withdrawnRequests: open.length,
      idemKeyHash: keyHash,
      bodyHash,
    };
    await auditTx(tx, g, "trips.departure.cancel", "TripDeparture", dep.id, after, { status: dep.status, version: dep.version, sold: dep.sold, held: dep.held });
    return { value: { departureId: dep.id, status: "CANCELLED", kind: v.kind, decideBy: decideBy.toISOString(), outcomes: sold.length, heldSatang, replayed: false } };
  });
  if (!r.ok) return r;
  return "replay" in r.value ? replay(r.value.replay) : { ok: true, value: r.value.value };
}

// ═══════════════════════ §5.2 ทางออกต่อการจอง ═══════════════════════
const resolveInput = z.strictObject({
  unitId: ID,
  bookingId: ID,
  expectedVersion: z.number().int().min(-INT4).max(INT4), // รุ่นเก่า/ผิดใด ๆ ⇒ STATE_CONFLICT (ไม่ใช่ VALIDATION)
  choice: z.enum(["REFUND", "NO_MONEY", "MOVE"]),
  reason: REASON.optional(),
  targetDepartureId: ID.optional(), // a2
  consent: z.unknown().optional(), // a2
  idempotencyKey: IDEM_KEY,
});
export type ResolveValue = { bookingId: string; choice: "REFUND" | "NO_MONEY"; refundRequestId: string | null; amountSatang: number; replayed: boolean };
type OutcomeRow = { id: string; departureId: string; choice: string };
const PERM_OF = { REFUND: P_REQUEST, NO_MONEY: P_CANCEL, MOVE: P_EDIT } as const;

async function lockOutcomeTx(tx: Tx, g: { tenantId: string; unitId: string }, departureId: string, bookingId: string): Promise<OutcomeRow | null> {
  const rows = await tx.$queryRaw<OutcomeRow[]>`
    SELECT "id", "departureId", "choice" FROM "TripDepartureCancelOutcome" WHERE "departureId" = ${departureId} AND "bookingId" = ${bookingId} AND "tenantId" = ${g.tenantId} AND "unitId" = ${g.unitId} FOR UPDATE`;
  return rows[0] ?? null;
}
/** ลำดับของ cancel_choice_made ต่อการจอง (คีย์ …:<choice>:<seq>) */
async function choiceSeqOf(tx: Tx, g: { tenantId: string }, bookingId: string): Promise<number> {
  const rows = await tx.$queryRaw<{ n: number }[]>`SELECT count(*)::int AS "n" FROM "AuditLog" WHERE "tenantId" = ${g.tenantId} AND "action" = 'trips.booking.cancel_choice' AND "targetId" = ${bookingId}`;
  return Number(rows[0]?.n ?? 0) + 1;
}
const madeEvt = (bookingId: string, departureId: string, choice: string, seq: number, by: string, refundRequestId: string | null): MoneyEvt => ({
  type: "trips.booking.cancel_choice_made",
  key: `${bookingId}:${departureId}:${choice}:${seq}`,
  payload: { bookingId, departureId, choice, by, ...(refundRequestId ? { refundRequestId } : {}) },
});

/**
 * ทางไม่มีเงิน (N12 · ตัวช่วยเดียวของร้าน (a1) และงานเลยเส้นตาย (b)) — ผู้เรียกไม่ถือล็อกใดไว้:
 * 1a คืนที่นั่ง (returnSoldInTx · ลำดับเดียวกับบันทึกโอนคืน) → 2b การจอง (รุ่น/สถานะ/ไม่มีเงิน ใต้ล็อก) → แถวผล PENDING ใต้ล็อก → งวดเปิด ⇒ CANCELLED →
 * คืนโค้ด → การจอง ⇒ CANCELLED → แถวผล NO_MONEY → trips.booking.cancelled + cancel_choice_made → audit trips.booking.cancel_choice
 */
async function settleNoMoneyInTx(
  tx: Tx,
  c: Ctx,
  ag: Gate,
  b0: MoneyBooking,
  o: { by: "STAFF" | "SYSTEM_DEFAULT"; reason: string; expectedVersion: number; keyHash: string; bodyHash: string },
): Promise<ResolveValue> {
  const g = { tenantId: ag.tenantId, unitId: ag.unitId };
  const sc = moneySellCtx(c);
  const seats = seatsOfSnapshot(b0.policySnapshot as SnapshotShape);
  if (seats > 0) {
    const rr = await returnSoldInTx(tx, sc, { departureId: b0.departureId, qty: seats });
    if (!rr.ok) abort(rr.code);
  }
  const b = await lockMoneyBookingInTx(tx, g, b0.id);
  if (!b) return abort("NOT_FOUND");
  if (b.version !== o.expectedVersion || b.status !== b0.status || b.departureId !== b0.departureId || !SOLD.has(b.status)) return abort("STATE_CONFLICT");
  if (b.paidSatang - b.refundedSatang !== 0) return abort("VALIDATION", "HAS_MONEY_USE_REFUND");
  const out = await lockOutcomeTx(tx, g, b.departureId, b.id);
  if (!out) return abort("STATE_CONFLICT", "NOT_CANCELLED_BY_SHOP");
  if (out.choice !== "PENDING") return abort("STATE_CONFLICT", "CHOICE_ALREADY_MADE");
  const iso = c.clock.iso;
  await tx.$queryRaw`
    UPDATE "TripPaymentDue" SET "status" = 'CANCELLED', "updatedAt" = ${iso}::timestamp
    WHERE "bookingId" = ${b.id} AND "tenantId" = ${g.tenantId} AND "unitId" = ${g.unitId} AND "status" IN ('OPEN', 'PARTLY_PAID', 'OVERDUE') RETURNING "id"`;
  await releasePromoInTx(tx, sc, { bookingId: b.id });
  const tr = await transitionBookingInTx(tx, sc, { bookingId: b.id, from: b.status, to: "CANCELLED", expectedVersion: b.version, reason: o.reason });
  if (!tr.ok) return abort(tr.code);
  await tx.$queryRaw`
    UPDATE "TripDepartureCancelOutcome" SET "choice" = 'NO_MONEY', "by" = ${o.by}, "at" = ${iso}::timestamp, "updatedAt" = ${iso}::timestamp
    WHERE "id" = ${out.id} AND "tenantId" = ${g.tenantId} AND "choice" = 'PENDING' RETURNING "id"`;
  const seq = await choiceSeqOf(tx, g, b.id);
  await emitMoney(tx, g, [
    { type: "trips.booking.cancelled", key: b.id, payload: bookingEventPayload(g, b, "CANCELLED", Number(isRec(b.policySnapshot) && isRec(b.policySnapshot.totals) ? b.policySnapshot.totals.payableSatang : 0) || 0) },
    madeEvt(b.id, b.departureId, "NO_MONEY", seq, o.by, null),
  ]);
  await auditTx(tx, ag, "trips.booking.cancel_choice", "TripBooking", b.id, { choice: "NO_MONEY", by: o.by, departureId: b.departureId, seats, version: tr.value.version, idemKeyHash: o.keyHash, bodyHash: o.bodyHash }, { status: b.status, version: b.version });
  return { bookingId: b.id, choice: "NO_MONEY", refundRequestId: null, amountSatang: 0, replayed: false };
}

/** ยื่นคำขอคืนเต็ม (ป้าย DEPARTURE_CANCEL) ในธุรกรรมของผู้เรียก — ผู้เรียกถือแถวการจองแล้ว · อนุมัติให้เอง (ไม่ผ่าน X12 · N5) · แถวผล ⇒ REFUND */
async function fileFullRefundInTx(tx: Tx, c: Ctx, lb: MoneyBooking, o: { kind: string; reason: string; key: string; outcomeId: string; lateMoney?: boolean }): Promise<{ requestId: string; amountSatang: number; status: string }> {
  const g: CGate = { tenantId: c.tenantId, unitId: c.unitId, tz: "" };
  // F1 (ข): มีใบรับบันทึกหลังแถวผล (เงินเข้าหลังร้านยกเลิก) ⇒ ไม่อนุมัติให้เอง — QUOTED (ยังติดป้าย · ปรับยอดไม่ได้) รอผู้ถือ trips.refund.approve
  const late = o.lateMoney === true || (await receivedAfterCancelOf(tx, g, lb.id, lb.departureId)); // H7: ยื่นใหม่ใน payTx = หลังยกเลิกเสมอ
  const requestHash = sha256hex(JSON.stringify(["trips.depcancel.refund.v1", lb.id, o.kind, o.reason]));
  const f = await fileRefundRequestInTx(tx, c, g, lb, {
    reasonKind: o.kind as "EXTERNAL" | "MIN_NOT_MET" | "SHOP_FAULT",
    reason: o.reason,
    deductions: [],
    deductionsSatang: 0,
    key: o.key,
    requestHash,
    autoApproveUpTo: late ? 0 : INT4,
    fullRefund: true,
  });
  if (f.status !== (late ? "QUOTED" : "APPROVED")) abort("STATE_CONFLICT", "INTEGRITY");
  // F5: เวลาอนุมัติแรก (นาฬิกาของคำขอ) — คำเตือนโอนค้างนับจากเวลานี้ · requote/ยื่นใหม่ไม่รีเซ็ต
  if (f.status === "APPROVED") await tx.$queryRaw`UPDATE "TripRefundRequest" SET "computed" = "computed" || ${JSON.stringify({ approvedAt: c.clock.iso })}::jsonb WHERE "id" = ${f.requestId} AND "tenantId" = ${g.tenantId} RETURNING "id"`;
  await tx.$queryRaw`
    UPDATE "TripDepartureCancelOutcome" SET "choice" = 'REFUND', "refundRequestId" = ${f.requestId}, "by" = 'STAFF', "at" = ${c.clock.iso}::timestamp, "updatedAt" = ${c.clock.iso}::timestamp
    WHERE "id" = ${o.outcomeId} AND "tenantId" = ${g.tenantId} AND "choice" = 'PENDING' RETURNING "id"`;
  return { requestId: f.requestId, amountSatang: f.amountSatang, status: f.status };
}

/**
 * ร้านบันทึกทางออกของการจองในรอบที่ร้านยกเลิก (ใบสั่ง §5.2): REFUND (refund.request · ต้องมีเงิน · ได้แม้เลยเส้นตาย) · NO_MONEY (booking.cancel · ต้องไม่มีเงิน)
 * MOVE (booking.edit) ⇒ VALIDATION MOVE_NOT_AVAILABLE_YET ใน a1 · แถวผลต้อง PENDING ใต้ล็อก · เอเจนซี่มีเงิน ⇒ FORBIDDEN AGENCY_NOT_ENABLED · เอเจนซี่ต้องมีเหตุผล
 */
export async function resolveCancelledBooking(ctx: TripCtx, input: unknown, opts?: TripOpts): Promise<{ ok: true; value: ResolveValue } | CancelFail> {
  const p = resolveInput.safeParse(input);
  const choice = p.success ? p.data.choice : isRec(input) && (input.choice === "REFUND" || input.choice === "NO_MONEY" || input.choice === "MOVE") ? input.choice : "REFUND";
  const g = await gateAll(ctx, isRec(input) ? input.unitId : undefined, [PERM_OF[choice]]);
  if (isGateFail(g)) return g;
  if (!p.success) return fail("VALIDATION", undefined, { fields: [...new Set(p.error.issues.map((i) => i.path.join(".")))].slice(0, 8) });
  const v = p.data;
  if (v.choice === "MOVE") return fail("VALIDATION", "MOVE_NOT_AVAILABLE_YET"); // T1.6a2
  const now = nowOf(opts);
  if (!now) return fail("VALIDATION", undefined, { fields: ["now"] });
  const cg: CGate = { tenantId: g.tenantId, unitId: g.unitId, tz: g.tz };
  const c = ctxOf(g, ctx.actorUserId, now);
  const db = tenantDb({ tenantId: g.tenantId, unitId: g.unitId }) as unknown as Tx;
  const b = await readMoneyBooking(db, cg, v.bookingId);
  if (!b) return fail("NOT_FOUND");
  const keyHash = sha256hex(`depresolve:${g.unitId}:${b.id}:${v.idempotencyKey}`);
  const bodyHash = sha256hex(JSON.stringify(["trips.depresolve.v1", b.id, v.expectedVersion, v.choice, v.reason ?? null]));
  // F4: คีย์เดิม ⇒ ผลตามสถานะปัจจุบันของแถวผล (คำขอถูกถอน/ปฏิเสธแล้ว ⇒ STATE_CONFLICT CHOICE_CHANGED · ไม่ replay ความสำเร็จเก่า)
  const replay = async (a: Record<string, unknown>): Promise<{ ok: true; value: ResolveValue } | CancelFail> => {
    if (a.bodyHash !== bodyHash) return fail("IDEMPOTENCY_CONFLICT");
    const cur = (await db.$queryRaw<{ choice: string; reqId: string | null; amount: number | null }[]>`
      SELECT o."choice", o."refundRequestId" AS "reqId", r."amountSatang" AS "amount" FROM "TripDepartureCancelOutcome" o LEFT JOIN "TripRefundRequest" r ON r."id" = o."refundRequestId" AND r."tenantId" = o."tenantId"
      WHERE o."departureId" = ${b.departureId} AND o."bookingId" = ${b.id} AND o."tenantId" = ${g.tenantId} AND o."unitId" = ${g.unitId}`)[0];
    if (!cur || cur.choice !== v.choice) return fail("STATE_CONFLICT", "CHOICE_CHANGED");
    return { ok: true, value: { bookingId: b.id, choice: v.choice as "REFUND" | "NO_MONEY", refundRequestId: cur.reqId, amountSatang: Number(cur.amount ?? 0), replayed: true } };
  };
  const prior = await idemAuditOf(db, g.tenantId, "trips.booking.cancel_choice", b.id, keyHash);
  if (prior) return replay(prior);
  const dep = (await db.$queryRaw<{ cancelKind: string | null; cancelReason: string | null }[]>`
    SELECT "cancelKind", "cancelReason" FROM "TripDeparture" WHERE "id" = ${b.departureId} AND "tenantId" = ${g.tenantId} AND "unitId" = ${g.unitId}`)[0];
  if (!dep?.cancelKind) return fail("STATE_CONFLICT", "NOT_CANCELLED_BY_SHOP");
  const out = (await db.$queryRaw<OutcomeRow[]>`
    SELECT "id", "departureId", "choice" FROM "TripDepartureCancelOutcome" WHERE "departureId" = ${b.departureId} AND "bookingId" = ${b.id} AND "tenantId" = ${g.tenantId} AND "unitId" = ${g.unitId}`)[0];
  if (!out) return fail("STATE_CONFLICT", "NOT_CANCELLED_BY_SHOP");
  if (out.choice === "AGENCY_MONEY_HELD") return fail("FORBIDDEN", "AGENCY_NOT_ENABLED");
  if (out.choice !== "PENDING") return fail("STATE_CONFLICT", "CHOICE_ALREADY_MADE");
  if (isAgency(b) && !v.reason) return fail("VALIDATION", "REASON_REQUIRED", { fields: ["reason"] });
  const money = b.paidSatang - b.refundedSatang;
  if (v.choice === "REFUND" && money <= 0) return fail("VALIDATION", "NO_MONEY_USE_CLOSE");
  if (v.choice === "REFUND" && b.currency !== "THB") return fail("CURRENCY_NOT_ALLOWED", "CURRENCY_NOT_THB"); // F6 ▸ บันทึกโอนคืนได้เฉพาะ THB (moneyBookingGate) ◂
  if (v.choice === "NO_MONEY" && money !== 0) return fail("VALIDATION", "HAS_MONEY_USE_REFUND");
  if (b.version !== v.expectedVersion) return fail("STATE_CONFLICT");
  const reason = v.reason ?? dep.cancelReason ?? DEFAULT_REFUND_REASON;
  const r = await txOf(cg, async (tx): Promise<ResolveValue> => {
    if (v.choice === "NO_MONEY") return settleNoMoneyInTx(tx, c, g, b, { by: "STAFF", reason, expectedVersion: v.expectedVersion, keyHash, bodyHash });
    // REFUND: 2b การจอง → แถวผลใต้ล็อก → คำขอ (ใบเสนอเต็มจากใบรับ · อนุมัติให้เอง) → แถวผล REFUND
    const lb = await lockMoneyBookingInTx(tx, cg, b.id);
    if (!lb) return abort("NOT_FOUND");
    if (lb.version !== v.expectedVersion || !SOLD.has(lb.status) || lb.departureId !== b.departureId) return abort("STATE_CONFLICT");
    if (isAgency(lb)) return abort("FORBIDDEN", "AGENCY_NOT_ENABLED");
    if (lb.currency !== "THB") return abort("CURRENCY_NOT_ALLOWED", "CURRENCY_NOT_THB");
    if (lb.paidSatang - lb.refundedSatang <= 0) return abort("VALIDATION", "NO_MONEY_USE_CLOSE");
    const o2 = await lockOutcomeTx(tx, cg, lb.departureId, lb.id);
    if (!o2) return abort("STATE_CONFLICT", "NOT_CANCELLED_BY_SHOP");
    if (o2.choice !== "PENDING") return abort("STATE_CONFLICT", "CHOICE_ALREADY_MADE");
    if (await openRefundOf(tx, cg, lb.id)) return abort("STATE_CONFLICT", "REFUND_IN_PROGRESS");
    const f = await fileFullRefundInTx(tx, c, lb, { kind: dep.cancelKind as string, reason, key: `depcancel:${lb.id}:${moneyNsKey(c, v.idempotencyKey)}`, outcomeId: o2.id });
    const seq = await choiceSeqOf(tx, cg, lb.id);
    await emitMoney(tx, cg, [madeEvt(lb.id, lb.departureId, "REFUND", seq, "STAFF", f.requestId)]);
    await auditTx(tx, g, "trips.booking.cancel_choice", "TripBooking", lb.id, { choice: "REFUND", by: "STAFF", departureId: lb.departureId, refundRequestId: f.requestId, amountSatang: f.amountSatang, requestStatus: f.status, idemKeyHash: keyHash, bodyHash });
    return { bookingId: lb.id, choice: "REFUND", refundRequestId: f.requestId, amountSatang: f.amountSatang, replayed: false };
  });
  if (!r.ok) {
    if (r.code === "IDEMPOTENCY_CONFLICT" || r.code === "BUSY") {
      const late = await idemAuditOf(db, g.tenantId, "trips.booking.cancel_choice", b.id, keyHash);
      if (late) return replay(late);
    }
    return r;
  }
  return { ok: true, value: r.value };
}

// ═══════════════════════ §4.5 เงินเข้าหลังร้านยกเลิก (N13) ═══════════════════════
/**
 * เรียกจาก payTx (money.ts) ใต้ล็อกแถวการจอง เมื่อรอบมี cancelKind: ถอนคำขอเปิด (ถ้ามี) ตอนนี้ แล้วคืนตัวยื่นใหม่ที่ payTx เรียกหลังบันทึกเงิน
 * (ยอดใหม่จากใบรับรวมใบใหม่ · แถวผลชี้คำขอใหม่ · ธุรกรรมเดียวกัน) · ไม่มีคำขอเปิด ⇒ null (เงินนับเข้ายอดคืนเต็มตอนร้านกดคืน)
 */
export async function withdrawForPaymentInTx(tx: Tx, c: Ctx, g: CGate, b: MoneyBooking): Promise<(() => Promise<void>) | null> {
  const open = (await tx.$queryRaw<OpenReqRow[]>`
    SELECT "id", "status", "bookingId" FROM "TripRefundRequest" WHERE "bookingId" = ${b.id} AND "tenantId" = ${g.tenantId} AND "unitId" = ${g.unitId} AND "status" IN ('QUOTED', 'APPROVED') ORDER BY "id" FOR UPDATE`)[0];
  if (!open) return null;
  await withdrawRefundInTx(tx, g, open, REFILE_REASON);
  return async () => {
    const lb = await lockMoneyBookingInTx(tx, g, b.id);
    if (!lb) throw new CancelAbort(fail("NOT_FOUND"));
    const dep = (await tx.$queryRaw<{ cancelKind: string | null; cancelReason: string | null }[]>`
      SELECT "cancelKind", "cancelReason" FROM "TripDeparture" WHERE "id" = ${lb.departureId} AND "tenantId" = ${g.tenantId} AND "unitId" = ${g.unitId}`)[0];
    const out = await lockOutcomeTx(tx, g, lb.departureId, lb.id);
    if (!dep?.cancelKind || !out || out.choice !== "PENDING") return;
    const f = await fileFullRefundInTx(tx, c, lb, { kind: dep.cancelKind, reason: dep.cancelReason ?? DEFAULT_REFUND_REASON, key: `depcancel:${lb.id}:refile:${open.id}`, outcomeId: out.id, lateMoney: true });
    // F2: ลำดับใหม่ (audit ของทางเลือกนับลำดับ) + audit ของการยื่นใหม่ ⇒ อีเวนต์ไม่ชนกุญแจเดิม (ไม่ถูก skipDuplicates กลืน)
    const seq = await choiceSeqOf(tx, g, lb.id);
    await emitMoney(tx, g, [madeEvt(lb.id, lb.departureId, "REFUND", seq, "STAFF", f.requestId)]);
    await auditMoney(tx, { tenantId: g.tenantId, unitId: g.unitId, actor: c.actor }, "trips.booking.cancel_choice", { type: "TripBooking", id: lb.id }, {
      choice: "REFUND", by: "STAFF", departureId: lb.departureId, refundRequestId: f.requestId, amountSatang: f.amountSatang, requestStatus: f.status, refiledFrom: open.id, seq,
    });
  };
}
// ═══════════════════════ §9 ข้อมูลจอ (อ่านอย่างเดียว) ═══════════════════════
/** ค่าของตัวกรองรายการการจอง (ผ่านช่อง `dep` ของ URL เดิม — หน้า/ชิปเดิมไม่ต้องเปลี่ยน) */
export const CANCEL_PENDING_DEP = "cancel:pending";
export const CANCEL_OVERDUE_DEP = "cancel:overdue";
/** คำขอที่อนุมัติแล้วยังไม่บันทึกโอนเกินกี่วัน ⇒ เตือนในร้าน (N5 · ไม่ใช่คำสัญญากับลูกค้า) */
export const TRANSFER_DUE_DAYS = 3;
const DAY_MS = 86_400_000;
export type DepartureCancelVM = {
  /** ก่อนยกเลิก: สรุปของกล่องยืนยัน (จำนวน = ค่าที่ต้องพิมพ์ยืนยัน) */
  confirm: { bookings: number; heldSatang: number; agency: number; noMoney: number };
  /** หลังร้านยกเลิก: การ์ดสถานะ · null = รอบไม่ได้ถูกยกเลิกทางนี้ */
  status: {
    kind: string; decideBy: string; pending: number; overdue: number; moved: number; refunding: number; toTransferSatang: number; refunded: number; noMoney: number; agencyHeld: number;
    /** H1: คำขอคืนเต็มที่ยังรอผู้อนุมัติ (QUOTED) แยกจากที่อนุมัติแล้วรอโอน (APPROVED) */
    awaitingApproval: number; awaitingApprovalSatang: number; approved: number;
  } | null;
};
type SummaryRow = { n: number; held: number | bigint | null; agency: number; nomoney: number };
type OutcomeStatRow = { choice: string; reqStatus: string | null; amount: number | null };
/** สรุปของรอบสำหรับแผงรอบ (กล่องยืนยัน + การ์ดสถานะ) — ดัชนี TripBooking (departureId) · TripDepartureCancelOutcome (departureId, bookingId) */
export async function departureCancelSummaryOf(db: Tx, g: { tenantId: string; unitId: string }, departureId: string, now: Date): Promise<DepartureCancelVM> {
  const [sum, dep] = await Promise.all([
    db.$queryRaw<SummaryRow[]>`
      SELECT count(*)::int AS "n", COALESCE(sum("paidSatang" - "refundedSatang"), 0)::bigint AS "held",
        (count(*) FILTER (WHERE "collectMode" = 'AGENT' OR "agentAccountId" IS NOT NULL))::int AS "agency",
        (count(*) FILTER (WHERE "paidSatang" - "refundedSatang" = 0))::int AS "nomoney"
      FROM "TripBooking" WHERE "departureId" = ${departureId} AND "tenantId" = ${g.tenantId} AND "unitId" = ${g.unitId} AND "status" IN ('CONFIRMED', 'PART_PAID', 'PAID')`,
    db.$queryRaw<{ cancelKind: string | null; cancelDecideBy: Date | null }[]>`
      SELECT "cancelKind", "cancelDecideBy" FROM "TripDeparture" WHERE "id" = ${departureId} AND "tenantId" = ${g.tenantId} AND "unitId" = ${g.unitId}`,
  ]);
  const s = sum[0];
  const confirm = { bookings: Number(s?.n ?? 0), heldSatang: Number(s?.held ?? 0), agency: Number(s?.agency ?? 0), noMoney: Number(s?.nomoney ?? 0) };
  const d = dep[0];
  if (!d?.cancelKind || !d.cancelDecideBy) return { confirm, status: null };
  const rows = await db.$queryRaw<OutcomeStatRow[]>`
    SELECT o."choice", r."status" AS "reqStatus", r."amountSatang" AS "amount" FROM "TripDepartureCancelOutcome" o
    LEFT JOIN "TripRefundRequest" r ON r."id" = o."refundRequestId" AND r."tenantId" = o."tenantId"
    WHERE o."departureId" = ${departureId} AND o."tenantId" = ${g.tenantId} AND o."unitId" = ${g.unitId}`;
  const decideBy = new Date(d.cancelDecideBy);
  const n = (f: (r: OutcomeStatRow) => boolean) => rows.filter(f).length;
  const refunding = rows.filter((r) => r.choice === "REFUND" && r.reqStatus !== "DONE");
  return {
    confirm,
    status: {
      kind: d.cancelKind,
      decideBy: decideBy.toISOString(),
      pending: n((r) => r.choice === "PENDING"),
      overdue: n((r) => r.choice === "PENDING" && now.getTime() > decideBy.getTime()),
      moved: n((r) => r.choice === "MOVED"),
      refunding: refunding.length,
      toTransferSatang: refunding.filter((r) => r.reqStatus === "APPROVED").reduce((t, r) => t + Number(r.amount ?? 0), 0),
      awaitingApproval: refunding.filter((r) => r.reqStatus === "QUOTED").length,
      awaitingApprovalSatang: refunding.filter((r) => r.reqStatus === "QUOTED").reduce((t, r) => t + Number(r.amount ?? 0), 0),
      approved: refunding.filter((r) => r.reqStatus === "APPROVED").length,
      refunded: n((r) => r.choice === "REFUND" && r.reqStatus === "DONE"),
      noMoney: n((r) => r.choice === "NO_MONEY"),
      agencyHeld: n((r) => r.choice === "AGENCY_MONEY_HELD"),
    },
  };
}
export type BookingCancelChoiceVM = {
  departureId: string;
  choice: string;
  overdue: boolean;
  decideBy: string;
  moneySatang: number;
  version: number;
  canRefund: boolean;
  canClose: boolean;
  /** ต้องใส่เหตุผล (การจองของเอเจนซี่) */
  reasonRequired: boolean;
  /** H1: อนุมัติคำขอ QUOTED (trips.refund.approve) · บันทึกโอนคืนของคำขอ APPROVED (trips.refund.execute) — action เดิม */
  canApprove: boolean;
  canExecute: boolean;
  refund: { requestId: string; status: string; amountSatang: number; transferDue: boolean } | null;
};
/** ทางออกของการจองบนรอบที่ร้านยกเลิก (ลิ้นชัก) · null = ไม่อยู่ในรอบที่ร้านยกเลิก */
export async function bookingCancelChoiceOf(
  db: Tx,
  g: { tenantId: string; unitId: string },
  b: { id: string; departureId: string; version: number; paidSatang: number; refundedSatang: number; collectMode: string; agentAccountId: string | null },
  now: Date,
  can: { refund: boolean; close: boolean; approve?: boolean; execute?: boolean },
): Promise<BookingCancelChoiceVM | null> {
  const rows = await db.$queryRaw<{ choice: string; decideBy: Date | null; reqId: string | null; reqStatus: string | null; amount: number | null; approvedAt: string | null }[]>`
    SELECT o."choice", d."cancelDecideBy" AS "decideBy", r."id" AS "reqId", r."status" AS "reqStatus", r."amountSatang" AS "amount",
      (SELECT min(x."computed"->>'approvedAt') FROM "TripRefundRequest" x WHERE x."bookingId" = o."bookingId" AND x."tenantId" = o."tenantId" AND x."computed"->>'path' = 'DEPARTURE_CANCEL') AS "approvedAt"
    FROM "TripDepartureCancelOutcome" o JOIN "TripDeparture" d ON d."id" = o."departureId" AND d."tenantId" = o."tenantId"
    LEFT JOIN "TripRefundRequest" r ON r."id" = o."refundRequestId" AND r."tenantId" = o."tenantId"
    WHERE o."bookingId" = ${b.id} AND o."departureId" = ${b.departureId} AND o."tenantId" = ${g.tenantId} AND o."unitId" = ${g.unitId} AND d."cancelKind" IS NOT NULL LIMIT 1`;
  const o = rows[0];
  if (!o?.decideBy) return null;
  const decideBy = new Date(o.decideBy);
  const money = b.paidSatang - b.refundedSatang;
  const agency = isAgency(b);
  const pending = o.choice === "PENDING";
  const approvedAt = o.approvedAt ? Date.parse(o.approvedAt) : NaN;
  return {
    departureId: b.departureId,
    choice: o.choice,
    overdue: pending && now.getTime() > decideBy.getTime(),
    decideBy: decideBy.toISOString(),
    moneySatang: money,
    version: b.version,
    canRefund: pending && money > 0 && !agency && can.refund,
    canClose: pending && money === 0 && can.close,
    reasonRequired: agency,
    canApprove: o.choice === "REFUND" && o.reqStatus === "QUOTED" && can.approve === true,
    canExecute: o.choice === "REFUND" && o.reqStatus === "APPROVED" && can.execute === true,
    refund: o.reqId
      ? { requestId: o.reqId, status: String(o.reqStatus), amountSatang: Number(o.amount ?? 0), transferDue: o.reqStatus === "APPROVED" && Number.isFinite(approvedAt) && now.getTime() - approvedAt > TRANSFER_DUE_DAYS * DAY_MS }
      : null,
  };
}
// ── /T1.6a1 cancel-departure ──
