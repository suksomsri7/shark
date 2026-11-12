"use server";
// ─────────────────────────────────────────────────────────────
// trips/booking-actions.ts — server actions ของการจองทัวร์ฝั่งร้าน (จอ T1.3 เรียก) · RUN TRIPS T0.6
// ทุกตัว: requireUnit (หน่วยของร้านที่เข้าได้ ไม่งั้น 404) → assertCan (trips.booking.*) → บริการด้วย SellCtx ของหน่วย (STAFF · COUNTER)
// 🔴 "use server" ⇒ ส่งออกเฉพาะ async function · ไม่รับเวลาจากผู้เรียก (บริการใช้นาฬิกาเครื่อง) · หน่วยมาจาก slug ของหน้าเสมอ
// 🔴 ราคาแก้มือ: ส่ง canOverride เฉพาะหลัง assertCan("trips.price.override") ผ่านในฟังก์ชันเดียวกัน (ใบสั่ง §5.1 · §7)
// ─────────────────────────────────────────────────────────────
import { requireUnit } from "@/lib/core/context";
import { ForbiddenError, assertCan, type MembershipCtx } from "@/lib/core/rbac";
import type { SellCtx } from "@/lib/core/sellable";
import * as booking from "./booking";

// ── T0.6 booking ──
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
/** คำขอมีราคาแก้มือ (ต้องผ่าน trips.price.override ก่อนส่ง canOverride) */
function wantsOverride(input: unknown): boolean {
  if (typeof input !== "object" || input === null || Array.isArray(input)) return false;
  const o = (input as Record<string, unknown>).priceOverrides;
  return Array.isArray(o) && o.length > 0;
}

// ── อ่าน (trips.booking.view) ──
export async function getTripBookingAction(unitSlug: string, input: unknown) {
  const { auth, unit } = await requireUnit(unitSlug);
  const m = memberOf(auth);
  try {
    assertCan(m, { module: "trips", action: "trips.booking.view", unitId: unit.id });
  } catch (e) {
    return denied(e);
  }
  return booking.getTripBooking(ctxOf(auth, unit.id), input);
}
export async function listTripBookingsAction(unitSlug: string, input: unknown) {
  const { auth, unit } = await requireUnit(unitSlug);
  const m = memberOf(auth);
  try {
    assertCan(m, { module: "trips", action: "trips.booking.view", unitId: unit.id });
  } catch (e) {
    return denied(e);
  }
  return booking.listTripBookings(ctxOf(auth, unit.id), input);
}

// ── จองหน้าร้าน (trips.booking.create) ──
export async function holdTripsAction(unitSlug: string, input: unknown) {
  const { auth, unit } = await requireUnit(unitSlug);
  const m = memberOf(auth);
  try {
    assertCan(m, { module: "trips", action: "trips.booking.create", unitId: unit.id });
  } catch (e) {
    return denied(e);
  }
  if (!wantsOverride(input)) return booking.holdTrips(ctxOf(auth, unit.id), input, {});
  try {
    assertCan(m, { module: "trips", action: "trips.price.override", unitId: unit.id });
  } catch (e) {
    return denied(e);
  }
  return booking.holdTrips(ctxOf(auth, unit.id), input, { canOverride: true });
}
export async function confirmTripsAction(unitSlug: string, input: unknown) {
  const { auth, unit } = await requireUnit(unitSlug);
  const m = memberOf(auth);
  try {
    assertCan(m, { module: "trips", action: "trips.booking.create", unitId: unit.id });
  } catch (e) {
    return denied(e);
  }
  if (!wantsOverride(input)) return booking.confirmTrips(ctxOf(auth, unit.id), input, {});
  try {
    assertCan(m, { module: "trips", action: "trips.price.override", unitId: unit.id });
  } catch (e) {
    return denied(e);
  }
  return booking.confirmTrips(ctxOf(auth, unit.id), input, { canOverride: true });
}
export async function bookTripsNowAction(unitSlug: string, input: unknown) {
  const { auth, unit } = await requireUnit(unitSlug);
  const m = memberOf(auth);
  try {
    assertCan(m, { module: "trips", action: "trips.booking.create", unitId: unit.id });
  } catch (e) {
    return denied(e);
  }
  if (!wantsOverride(input)) return booking.bookTripsNow(ctxOf(auth, unit.id), input, {});
  try {
    assertCan(m, { module: "trips", action: "trips.price.override", unitId: unit.id });
  } catch (e) {
    return denied(e);
  }
  return booking.bookTripsNow(ctxOf(auth, unit.id), input, { canOverride: true });
}

// ── แก้คน/เลื่อนวัน (trips.booking.edit) ──
export async function changeTripBookingAction(unitSlug: string, input: unknown) {
  const { auth, unit } = await requireUnit(unitSlug);
  const m = memberOf(auth);
  try {
    assertCan(m, { module: "trips", action: "trips.booking.edit", unitId: unit.id });
  } catch (e) {
    return denied(e);
  }
  if (!wantsOverride(input)) return booking.changeTripBooking(ctxOf(auth, unit.id), input, {});
  try {
    assertCan(m, { module: "trips", action: "trips.price.override", unitId: unit.id });
  } catch (e) {
    return denied(e);
  }
  return booking.changeTripBooking(ctxOf(auth, unit.id), input, { canOverride: true });
}

// ── อนุมัติ/ปฏิเสธ (trips.booking.approve) ──
export async function approveTripBookingAction(unitSlug: string, input: unknown) {
  const { auth, unit } = await requireUnit(unitSlug);
  const m = memberOf(auth);
  try {
    assertCan(m, { module: "trips", action: "trips.booking.approve", unitId: unit.id });
  } catch (e) {
    return denied(e);
  }
  return booking.approveTripBooking(ctxOf(auth, unit.id), input);
}

// ── ยกเลิกก่อนจ่าย (trips.booking.cancel) ──
export async function cancelTripBookingAction(unitSlug: string, input: unknown) {
  const { auth, unit } = await requireUnit(unitSlug);
  const m = memberOf(auth);
  try {
    assertCan(m, { module: "trips", action: "trips.booking.cancel", unitId: unit.id });
  } catch (e) {
    return denied(e);
  }
  return booking.cancelTripBooking(ctxOf(auth, unit.id), input);
}
// ── /T0.6 booking ──
