// ─────────────────────────────────────────────────────────────
// booking/access.ts — ด่านสิทธิ์ต่อ action ของระบบจอง (pure) · SVC B.11 ใบสั่ง §7.2
//   BOOKING_ACTIONS: ชื่อ export ของ server action ทุกตัว (actions/booking.ts + actions/booking-settings.ts) → คีย์สิทธิ์
//   ผ่านเมื่อถือ "อย่างน้อยหนึ่ง" คีย์ (evaluate: OWNER ทุกอย่าง · MANAGER สาขาที่คุม · STAFF ตาม permissions)
//   setStatusAction แยกคีย์ตามสถานะปลายทาง (คง booking.appointment.setStatus เดิมเป็นทางเลือก — ร้านเดิมไม่พัง)
// 🔴 pure: import ได้เฉพาะ core/rbac (ไม่มี I/O)
// ─────────────────────────────────────────────────────────────
import { assertCan, evaluate, ForbiddenError, type MembershipCtx } from "@/lib/core/rbac";

export const BOOKING_ACTIONS: Record<string, readonly string[]> = {
  setServiceDepositAction: ["booking.service.setDeposit"],
  recordDepositAction: ["booking.deposit.record", "booking.deposit.confirm"],
  refundDepositAction: ["booking.deposit.refund"],
  confirmDepositAction: ["booking.deposit.confirm", "booking.deposit.record"], // SVC B.8 ▸ ร้านยืนยันรับมัดจำ (คิวมัดจำ) ◂
  refundDueDepositAction: ["booking.deposit.refund"], // SVC B.8 ▸ คืนมัดจำที่ค้างคืน ◂
  forfeitDueDepositAction: ["booking.deposit.forfeit"], // SVC B.8 ▸ V5 ร้านตัดสินริบมัดจำที่รอ (FORFEIT_PENDING) ◂
  addStaffAction: ["booking.staff.create"],
  setStaffReceivingAction: ["booking.staff.create"],
  linkStaffToHrAction: ["booking.staff.create"],
  removeStaffAction: ["booking.staff.delete"],
  setBookingHoursAction: ["booking.hours.set"],
  addClosureAction: ["booking.hours.set"],
  removeClosureAction: ["booking.hours.set"],
  setServiceOfferedAction: ["booking.service.update"],
  importServicesToCatalogAction: ["booking.service.create"],
  setStatusAction: ["booking.appointment.setStatus"],
  applyBookingTemplateAction: ["booking.settings.edit"],
  setStaffServiceAction: ["booking.staff.create"],
  setServiceBookingAction: ["booking.service.update"],
  applyBookingRolePresetAction: ["booking.settings.edit"],
};

const STATUS_KEYS: Record<string, readonly string[]> = {
  CANCELLED: ["booking.appointment.setStatus", "booking.appointment.reschedule"],
  PENDING: ["booking.appointment.setStatus", "booking.appointment.reschedule"],
  CONFIRMED: ["booking.appointment.setStatus", "booking.appointment.reschedule"],
  NO_SHOW: ["booking.appointment.setStatus", "booking.job.runAny"],
  ARRIVED: ["booking.appointment.setStatus", "booking.checkin"],
  DONE: ["booking.appointment.setStatus", "booking.job.run", "booking.job.runAny"],
};

/** คีย์ที่ action นี้ยอมรับ (ไม่รู้จัก ⇒ []) · setStatusAction ตามสถานะปลายทาง (ไม่ส่ง/อื่น ⇒ เฉพาะคีย์เดิม) */
export function bookingActionKeys(action: string, input?: { status?: unknown }): readonly string[] {
  if (!Object.prototype.hasOwnProperty.call(BOOKING_ACTIONS, action)) return [];
  if (action === "setStatusAction") {
    const st = typeof input?.status === "string" ? input.status : "";
    return Object.prototype.hasOwnProperty.call(STATUS_KEYS, st) ? STATUS_KEYS[st] : BOOKING_ACTIONS.setStatusAction;
  }
  return BOOKING_ACTIONS[action];
}

/** ทำ action นี้ที่สาขานี้ได้ไหม — มีคีย์ใดผ่าน evaluate · ชื่อ action ไม่รู้จัก ⇒ false */
export function canBookingAction(m: MembershipCtx | null, unitId: string, action: string, input?: { status?: unknown }): boolean {
  if (!m) return false;
  return bookingActionKeys(action, input).some((key) => evaluate(m, { module: "booking", action: key, unitId }));
}

/**
 * ด่านของ server action: ไม่ผ่าน ⇒ throw ForbiddenError (แบบ assertCan) · action ไม่รู้จัก ⇒ throw เสมอ (fail closed)
 * เรียกก่อนอ่าน/เขียนฐานทุกครั้ง (actions/booking.ts · actions/booking-settings.ts)
 */
export function assertBookingActionAllowed(m: MembershipCtx, unitId: string, action: string, input?: { status?: unknown }): void {
  const keys = bookingActionKeys(action, input);
  if (!keys.length) throw new ForbiddenError({ module: "booking", action, unitId });
  if (canBookingAction(m, unitId, action, input)) return;
  assertCan(m, { module: "booking", action: keys[0], unitId }); // ไม่มีคีย์ใดผ่าน ⇒ คีย์แรกก็ไม่ผ่าน ⇒ throw
  throw new ForbiddenError({ module: "booking", action: keys[0], unitId });
}
