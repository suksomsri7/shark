// ─────────────────────────────────────────────────────────────
// trips/state.ts — ผังสถานะการจองทัวร์ (CC §G.0–§G.1) · RUN TRIPS T0.6
// ใบสั่ง ledger/trips-briefs/T0.6.md §3
//
// 🔴 บริสุทธิ์: ไม่มี import ที่เป็นค่า (import type เท่านั้น) · ไม่มี I/O · ไม่อ่านนาฬิกา · ไม่ throw
// 🔴 ตารางเปลี่ยนสถานะ = ตารางเต็มของใบสั่ง §3 (ไม่มีแถวอื่น) — การเปลี่ยนจริงทำด้วย CAS ใน booking.ts (transitionBookingInTx)
// ─────────────────────────────────────────────────────────────
import type { SellErrorCode } from "@/lib/core/sellable";

// ── T0.6 booking ──
export const BOOKING_STATUSES = ["HOLD", "PENDING", "CONFIRMED", "PART_PAID", "PAID", "EXPIRED", "CANCELLED", "TRAVELLED", "NO_SHOW"] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];
export const BOOKING_TERMINAL_STATUSES = ["EXPIRED", "CANCELLED", "TRAVELLED", "NO_SHOW"] as const;
/** สถานะที่นับเป็น "ขายแล้ว" (ตัวนับ sold · ค่าคงที่ §13 ข้อ 1) */
export const BOOKING_SOLD_STATUSES = ["CONFIRMED", "PART_PAID", "PAID", "TRAVELLED", "NO_SHOW"] as const;
/** สถานะก่อนจ่าย (ยกเลิกได้ในใบนี้ · แก้ไข/เลื่อนวันไม่ได้) */
export const BOOKING_UNPAID_STATUSES = ["HOLD", "PENDING"] as const;

export type BookingActorKind = "PUBLIC" | "AGENT" | "STAFF" | "SYSTEM";
export type BookingTransition = { from: BookingStatus | "NEW"; to: BookingStatus; actors: readonly BookingActorKind[]; via: string };

const ALL_BUT_SYSTEM: readonly BookingActorKind[] = ["PUBLIC", "AGENT", "STAFF"];
const MONEY: readonly BookingActorKind[] = ["SYSTEM", "STAFF"];
const STAFF_SYSTEM: readonly BookingActorKind[] = ["STAFF", "SYSTEM"];
const UNPAID_CANCEL: readonly BookingActorKind[] = ["PUBLIC", "AGENT", "STAFF", "SYSTEM"];
const SYSTEM_ONLY: readonly BookingActorKind[] = ["SYSTEM"];
const STAFF_ONLY: readonly BookingActorKind[] = ["STAFF"];

/** ตารางเต็มของใบสั่ง §3 (CC §G.1 :685–:697) */
export const BOOKING_TRANSITIONS: readonly BookingTransition[] = [
  { from: "NEW", to: "HOLD", actors: ALL_BUT_SYSTEM, via: "G.0 :687" },
  { from: "NEW", to: "PENDING", actors: ALL_BUT_SYSTEM, via: "G.0 :687" },
  { from: "NEW", to: "CONFIRMED", actors: ALL_BUT_SYSTEM, via: "G.0 :687" },
  { from: "HOLD", to: "CONFIRMED", actors: MONEY, via: "เงินเข้า :688" },
  { from: "HOLD", to: "PART_PAID", actors: MONEY, via: "เงินเข้า :688" },
  { from: "HOLD", to: "PAID", actors: MONEY, via: "เงินเข้า :688" },
  { from: "HOLD", to: "EXPIRED", actors: SYSTEM_ONLY, via: "§D.4 :689" },
  { from: "PENDING", to: "EXPIRED", actors: SYSTEM_ONLY, via: "§D.4 :689" },
  { from: "HOLD", to: "CANCELLED", actors: UNPAID_CANCEL, via: ":690" },
  { from: "PENDING", to: "CANCELLED", actors: UNPAID_CANCEL, via: ":690" },
  { from: "PENDING", to: "HOLD", actors: STAFF_SYSTEM, via: "อนุมัติ :691" },
  { from: "PENDING", to: "CONFIRMED", actors: STAFF_SYSTEM, via: "อนุมัติ :691" },
  { from: "CONFIRMED", to: "PART_PAID", actors: MONEY, via: ":692" },
  { from: "CONFIRMED", to: "PAID", actors: MONEY, via: ":692" },
  { from: "PART_PAID", to: "PAID", actors: MONEY, via: ":692" },
  { from: "CONFIRMED", to: "CANCELLED", actors: STAFF_SYSTEM, via: ":693–:694" },
  { from: "PART_PAID", to: "CANCELLED", actors: STAFF_SYSTEM, via: ":693–:694" },
  { from: "PAID", to: "CANCELLED", actors: STAFF_SYSTEM, via: ":693–:694" },
  { from: "CONFIRMED", to: "TRAVELLED", actors: STAFF_SYSTEM, via: ":695" },
  { from: "PART_PAID", to: "TRAVELLED", actors: STAFF_SYSTEM, via: ":695" },
  { from: "PAID", to: "TRAVELLED", actors: STAFF_SYSTEM, via: ":695" },
  { from: "CONFIRMED", to: "NO_SHOW", actors: STAFF_ONLY, via: ":696" },
  { from: "PART_PAID", to: "NO_SHOW", actors: STAFF_ONLY, via: ":696" },
  { from: "PAID", to: "NO_SHOW", actors: STAFF_ONLY, via: ":696" },
  { from: "NO_SHOW", to: "TRAVELLED", actors: STAFF_ONLY, via: ":697" },
];

const STATUS_SET: ReadonlySet<string> = new Set(BOOKING_STATUSES);
export function isBookingStatus(v: unknown): v is BookingStatus {
  return typeof v === "string" && STATUS_SET.has(v);
}

/** มีแถวตรงในตาราง (สถานะเดิม→เดิม = false · สถานะ/ผู้กระทำไม่รู้จัก = false) */
export function canTransitionBooking(from: string, to: string, actorKind: string): boolean {
  if (from === to) return false;
  return BOOKING_TRANSITIONS.some((t) => t.from === from && t.to === to && (t.actors as readonly string[]).includes(actorKind));
}

export type InitialHoldMode = "KEEP" | "SHOP_CONFIRM" | "CONVERT";
export type InitialStatusInput = { actorKind: string; payMethod: string; confirmMode: string; dueNowSatang: number };
export type InitialStatusResult = { ok: true; status: BookingStatus; hold: InitialHoldMode } | { ok: false; code: SellErrorCode; reason: string };

/**
 * สถานะแรกของการจองตรง (CC §G.0 · ใบสั่ง §3 ข้อ 1–4):
 * 1. AGENT หรือ WALLET/CREDIT ⇒ FORBIDDEN AGENCY_NOT_ENABLED · 2. PAY_LATER ที่ไม่ใช่ STAFF ⇒ VALIDATION PAY_LATER_STAFF_ONLY
 * 3. SHOP_CONFIRMS (ไม่ใช่ STAFF) ⇒ PENDING/SHOP_CONFIRM · STAFF PAY_LATER ⇒ CONFIRMED/CONVERT
 * 4. PAY_NOW: ยอดครบกำหนดตอนจอง > 0 ⇒ HOLD/KEEP · = 0 ⇒ CONFIRMED/CONVERT
 */
export function initialBookingStatus(i: InitialStatusInput): InitialStatusResult {
  const staff = i.actorKind === "STAFF";
  if (i.actorKind === "AGENT" || i.payMethod === "WALLET" || i.payMethod === "CREDIT") return { ok: false, code: "FORBIDDEN", reason: "AGENCY_NOT_ENABLED" };
  if (i.payMethod !== "PAY_NOW" && i.payMethod !== "PAY_LATER") return { ok: false, code: "VALIDATION", reason: "PAY_METHOD" };
  if (i.payMethod === "PAY_LATER" && !staff) return { ok: false, code: "VALIDATION", reason: "PAY_LATER_STAFF_ONLY" };
  if (i.confirmMode === "SHOP_CONFIRMS" && !staff) return { ok: true, status: "PENDING", hold: "SHOP_CONFIRM" };
  if (i.payMethod === "PAY_LATER") return { ok: true, status: "CONFIRMED", hold: "CONVERT" };
  if (Number.isFinite(i.dueNowSatang) && i.dueNowSatang > 0) return { ok: true, status: "HOLD", hold: "KEEP" };
  return { ok: true, status: "CONFIRMED", hold: "CONVERT" };
}
// ── /T0.6 booking ──
