"use server";
// ─────────────────────────────────────────────────────────────
// trips/money-actions.ts — server actions ของเงินฝั่ง trips (จอการจอง/การเงินของร้านเรียก) · RUN TRIPS T0.7a
// ทุกตัว: requireUnit (หน่วยของร้านที่เข้าได้ ไม่งั้น 404) → assertCan (คีย์ของใบสั่ง T0.7 §14) → บริการด้วย SellCtx ของหน่วย (STAFF · COUNTER)
// 🔴 "use server" ⇒ ส่งออกเฉพาะ async function · ไม่รับเวลาจากผู้เรียก (บริการใช้นาฬิกาเครื่อง) · หน่วยมาจาก slug ของหน้าเสมอ
// ─────────────────────────────────────────────────────────────
import { requireUnit } from "@/lib/core/context";
import { ForbiddenError, assertCan, type MembershipCtx } from "@/lib/core/rbac";
import type { SellCtx } from "@/lib/core/sellable";
import * as money from "./money";
import * as refund from "./refund";

// ── T0.7 money ──
type Auth = Awaited<ReturnType<typeof requireUnit>>["auth"];
const FORBIDDEN = { ok: false as const, code: "FORBIDDEN" as const, messageTh: "บัญชีนี้ยังไม่ได้รับสิทธิ์ทำรายการนี้ — ติดต่อเจ้าของร้านหรือผู้จัดการเพื่อขอสิทธิ์", retryable: false as const };

function memberOf(auth: Auth): MembershipCtx {
  const p = auth.active.permissions;
  return {
    role: auth.active.role,
    unitAccess: Array.isArray(auth.active.unitAccess) ? auth.active.unitAccess.filter((x): x is string => typeof x === "string") : [],
    permissions: typeof p === "object" && p !== null && !Array.isArray(p) ? (p as Record<string, unknown>) : {},
  };
}
function ctxOf(auth: Auth, unitId: string): SellCtx {
  return { tenantId: auth.active.tenantId, unitId, channel: "COUNTER", actor: { kind: "STAFF", userId: auth.user.id }, locale: "th" };
}
function denied(e: unknown): typeof FORBIDDEN {
  if (e instanceof ForbiddenError) return FORBIDDEN;
  throw e;
}

// ── อ่าน (trips.booking.view) ──
export async function listTripDuesAction(unitSlug: string, input: unknown) {
  const { auth, unit } = await requireUnit(unitSlug);
  const m = memberOf(auth);
  try {
    assertCan(m, { module: "trips", action: "trips.booking.view", unitId: unit.id });
  } catch (e) {
    return denied(e);
  }
  return money.listTripDues(ctxOf(auth, unit.id), input);
}
export async function tripMoneySummaryAction(unitSlug: string, input: unknown) {
  const { auth, unit } = await requireUnit(unitSlug);
  const m = memberOf(auth);
  try {
    assertCan(m, { module: "trips", action: "trips.booking.view", unitId: unit.id });
  } catch (e) {
    return denied(e);
  }
  return money.tripMoneySummary(ctxOf(auth, unit.id), input);
}
export async function tripCashDayAction(unitSlug: string, input: unknown) {
  const { auth, unit } = await requireUnit(unitSlug);
  const m = memberOf(auth);
  try {
    assertCan(m, { module: "trips", action: "trips.booking.view", unitId: unit.id });
  } catch (e) {
    return denied(e);
  }
  return money.tripCashDay(ctxOf(auth, unit.id), input);
}
export async function getTripRefundAction(unitSlug: string, input: unknown) {
  const { auth, unit } = await requireUnit(unitSlug);
  const m = memberOf(auth);
  try {
    assertCan(m, { module: "trips", action: "trips.booking.view", unitId: unit.id });
  } catch (e) {
    return denied(e);
  }
  return refund.getTripRefund(ctxOf(auth, unit.id), input);
}
export async function listTripRefundsAction(unitSlug: string, input: unknown) {
  const { auth, unit } = await requireUnit(unitSlug);
  const m = memberOf(auth);
  try {
    assertCan(m, { module: "trips", action: "trips.booking.view", unitId: unit.id });
  } catch (e) {
    return denied(e);
  }
  return refund.listTripRefunds(ctxOf(auth, unit.id), input);
}

// ── รับเงิน (trips.payment.record) ──
export async function recordTripPaymentAction(unitSlug: string, input: unknown) {
  const { auth, unit } = await requireUnit(unitSlug);
  const m = memberOf(auth);
  try {
    assertCan(m, { module: "trips", action: "trips.payment.record", unitId: unit.id });
  } catch (e) {
    return denied(e);
  }
  return money.recordTripPayment(ctxOf(auth, unit.id), input);
}
/** QR พร้อมเพย์ยอดล็อกที่หน้าร้าน (ผู้รับเงินเปิดให้ลูกค้าสแกน) */
export async function tripPaymentIntentAction(unitSlug: string, input: unknown) {
  const { auth, unit } = await requireUnit(unitSlug);
  const m = memberOf(auth);
  try {
    assertCan(m, { module: "trips", action: "trips.payment.record", unitId: unit.id });
  } catch (e) {
    return denied(e);
  }
  return money.tripPaymentIntent(ctxOf(auth, unit.id), input);
}

// ── คำขอคืนเงิน ──
export async function requestTripRefundAction(unitSlug: string, input: unknown) {
  const { auth, unit } = await requireUnit(unitSlug);
  const m = memberOf(auth);
  try {
    assertCan(m, { module: "trips", action: "trips.refund.request", unitId: unit.id });
  } catch (e) {
    return denied(e);
  }
  return refund.requestTripRefund(ctxOf(auth, unit.id), input);
}
/** ถอนคำขอ = สิทธิ์เดียวกับผู้ยื่น */
export async function withdrawTripRefundAction(unitSlug: string, input: unknown) {
  const { auth, unit } = await requireUnit(unitSlug);
  const m = memberOf(auth);
  try {
    assertCan(m, { module: "trips", action: "trips.refund.request", unitId: unit.id });
  } catch (e) {
    return denied(e);
  }
  return refund.withdrawTripRefund(ctxOf(auth, unit.id), input);
}
export async function decideTripRefundAction(unitSlug: string, input: unknown) {
  const { auth, unit } = await requireUnit(unitSlug);
  const m = memberOf(auth);
  try {
    assertCan(m, { module: "trips", action: "trips.refund.approve", unitId: unit.id });
  } catch (e) {
    return denied(e);
  }
  return refund.decideTripRefund(ctxOf(auth, unit.id), input);
}
export async function executeTripRefundAction(unitSlug: string, input: unknown) {
  const { auth, unit } = await requireUnit(unitSlug);
  const m = memberOf(auth);
  try {
    assertCan(m, { module: "trips", action: "trips.refund.execute", unitId: unit.id });
  } catch (e) {
    return denied(e);
  }
  return refund.executeTripRefund(ctxOf(auth, unit.id), input);
}
// ── /T0.7 money ──
