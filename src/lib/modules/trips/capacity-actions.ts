"use server";
// ─────────────────────────────────────────────────────────────
// trips/capacity-actions.ts — server actions ของที่ว่าง · ถือ/ขายที่หน้าร้าน · คืน/ย้าย · รายการรอ (ฝั่งร้าน) · RUN TRIPS T0.4
// 🔴 ส่งออกเฉพาะ export async function · ทุกตัว requireUnit + assertCan ก่อนเรียกบริการ (F6)
// 🔴 action ไม่รับเวลาจากผู้เรียก (บริการใช้นาฬิกาจริง) · หน่วยมาจาก slug ที่ requireUnit ตรวจแล้ว · ผู้กระทำ = STAFF ช่องทาง COUNTER
// สิทธิ์ (ใบสั่ง §5): trips.seat.sell = ถือ/แปลง/ปล่อย/ต่ออายุ · trips.seat.manage = คืน/ย้าย/รายการรอ · อ่านที่ว่าง = trips.departure.view
// ─────────────────────────────────────────────────────────────
import { requireUnit } from "@/lib/core/context";
import { assertCan, evaluate, type MembershipCtx } from "@/lib/core/rbac";
import * as cap from "./capacity-service";
import * as wl from "./waitlist";

// ── T0.4 capacity ──
type UnitAuth = Awaited<ReturnType<typeof requireUnit>>["auth"];

const SELL = ["trips.seat.sell"] as const;
const MANAGE = ["trips.seat.manage"] as const;
const VIEW = ["trips.departure.view", "trips.departure.edit", "trips.departure.status", "trips.seat.sell", "trips.seat.manage"] as const;

/** ผ่านเมื่อได้สิทธิ์ข้อใดข้อหนึ่ง · ไม่ผ่าน ⇒ assertCan โยน ForbiddenError */
function guard(auth: UnitAuth, unitId: string, actions: readonly string[]) {
  const m: MembershipCtx = {
    role: auth.active.role,
    unitAccess: auth.active.unitAccess as string[],
    permissions: auth.active.permissions as Record<string, unknown>,
  };
  if (actions.some((action) => evaluate(m, { module: "trips", action, unitId }))) return;
  assertCan(m, { module: "trips", action: actions[0], unitId });
}

async function staffCtx(unitSlug: string, actions: readonly string[]) {
  const { auth, unit } = await requireUnit(unitSlug);
  guard(auth, unit.id, actions);
  return { tenantId: auth.active.tenantId, unitId: unit.id, channel: "COUNTER" as const, actor: { kind: "STAFF" as const, userId: auth.user.id } };
}

// ── ที่ว่าง ──
export async function getAvailabilityAction(unitSlug: string, input: unknown) {
  return cap.getAvailability(await staffCtx(unitSlug, VIEW), input);
}
export async function listAvailabilityAction(unitSlug: string, input: unknown) {
  return cap.listAvailability(await staffCtx(unitSlug, VIEW), input);
}

// ── ถือ · แปลง · ปล่อย · ต่ออายุ (trips.seat.sell) ──
export async function placeHoldAction(unitSlug: string, input: unknown) {
  return cap.placeHold(await staffCtx(unitSlug, SELL), input);
}
export async function convertHoldAction(unitSlug: string, input: unknown) {
  return cap.convertHold(await staffCtx(unitSlug, SELL), input);
}
export async function releaseHoldAction(unitSlug: string, input: unknown) {
  return cap.releaseHold(await staffCtx(unitSlug, SELL), input);
}
export async function extendHoldAction(unitSlug: string, input: unknown) {
  return cap.extendHold(await staffCtx(unitSlug, SELL), input);
}

// ── คืน · ย้าย (trips.seat.manage) ──
export async function returnSoldAction(unitSlug: string, input: unknown) {
  return cap.returnSold(await staffCtx(unitSlug, MANAGE), input);
}
export async function moveSoldAction(unitSlug: string, input: unknown) {
  return cap.moveSold(await staffCtx(unitSlug, MANAGE), input);
}

// ── รายการรอฝั่งร้าน (trips.seat.manage · อ่าน = view) ──
export async function joinWaitlistAction(unitSlug: string, input: unknown) {
  return wl.joinWaitlist(await staffCtx(unitSlug, MANAGE), input);
}
export async function leaveWaitlistAction(unitSlug: string, input: unknown) {
  return wl.leaveWaitlist(await staffCtx(unitSlug, MANAGE), input);
}
export async function declineWaitlistOfferAction(unitSlug: string, input: unknown) {
  return wl.declineWaitlistOffer(await staffCtx(unitSlug, MANAGE), input);
}
export async function offerWaitlistAction(unitSlug: string, input: unknown) {
  return wl.offerWaitlist(await staffCtx(unitSlug, MANAGE), input);
}
export async function listWaitlistAction(unitSlug: string, input: unknown) {
  return wl.listWaitlist(await staffCtx(unitSlug, VIEW), input);
}
// ── /T0.4 capacity ──
