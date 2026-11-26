// ─────────────────────────────────────────────────────────────
// trips/cancel-departure-core.ts — ตัวช่วยบริสุทธิ์ของ "ร้านยกเลิกรอบที่มีคนจอง" (RUN TRIPS T1.6a1 §5.4)
// 🔴 บริสุทธิ์: ไม่มี I/O · ไม่อ่านนาฬิกา (now มาจากผู้เรียก) · สตางค์จำนวนเต็มเสมอ
// 🔴 คืนเงินเต็ม 100% ของเงินที่รับ (N4 · N9): แบ่งตามใบรับจริง — ไม่ใช้สัดส่วนของ snapshot (มัดจำ TRIP_ONLY ไม่มีเก็บแทนในใบรับ ⇒ กัน OVER_REFUND)
// ─────────────────────────────────────────────────────────────
import { addDaysYmd, localToUtc, utcToLocal } from "./departures-core";

// ── T1.6a1 cancel-departure-core ──
/** = CHECK TripDeparture_cancelKind_check */
export const CANCEL_KINDS = ["EXTERNAL", "MIN_NOT_MET", "SHOP_FAULT"] as const;
export type CancelKind = (typeof CANCEL_KINDS)[number];
/** = CHECK TripDepartureCancelOutcome_choice_check (MOVED เขียนใน a2 · AGENCY_MONEY_HELD = เอเจนซี่มีเงิน · N11) */
export const CANCEL_OUTCOMES = ["PENDING", "MOVED", "REFUND", "NO_MONEY", "AGENCY_MONEY_HELD"] as const;
export type CancelOutcome = (typeof CANCEL_OUTCOMES)[number];
/** ช่องทางความยินยอมของการย้าย (a2 · N6) */
export const CONSENT_CHANNELS = ["PHONE", "LINE", "EMAIL", "IN_PERSON", "AGENT"] as const;
export type ConsentChannel = (typeof CONSENT_CHANNELS)[number];
/** ทางเลือกของ T22 ที่ใบนี้รับ (CREDIT ปิดตามมติ 7) */
export const CANCEL_OPTION_KEYS = ["MOVE_DATE", "REFUND_100"] as const;

/** เส้นตาย = สิ้นวัน (23:59:59.999 เวลาหน่วย) ของ วันนี้ตามเวลาหน่วย + days (เลยเวลาออกเดิมได้ · N7) */
export function decideByOf(now: Date, days: number, tz: string): Date {
  const d = Number.isSafeInteger(days) && days > 0 ? days : 0;
  const today = utcToLocal(tz, now).ymd;
  return new Date(localToUtc(tz, addDaysYmd(today, d + 1), 0).getTime() - 1);
}
/** T22 ⇒ ทางเลือกของรอบที่ยกเลิก: ตัด CREDIT (มติ 7) · REFUND_100 ใส่เสมอ (N9) · ลำดับ MOVE_DATE → REFUND_100 */
export function cancelOptionsOf(t22: { options?: readonly unknown[] | null } | null | undefined): string[] {
  const has = new Set((Array.isArray(t22?.options) ? t22.options : []).filter((x): x is string => typeof x === "string"));
  return CANCEL_OPTION_KEYS.filter((k) => k === "REFUND_100" || has.has(k));
}
/** ผลของแถว + "เลยเส้นตาย" (N1: choice PENDING ∧ now > decideBy) */
export function cancelOutcomeOf(row: { choice: string }, now: Date, decideBy: Date | null): { choice: string; overdue: boolean } {
  return { choice: row.choice, overdue: row.choice === "PENDING" && decideBy !== null && now.getTime() > decideBy.getTime() };
}
/** คืนเต็มจากใบรับจริง — ตัวคิดอยู่ใน money-core (ไฟล์บริสุทธิ์ของเงิน · import ได้แค่ money-math/snapshot/booking-core) ส่งออกต่อที่นี่ตามสัญญา §5.4 */
export { fullRefundSplitOf, type CancelReceipt, type FullRefundSplit } from "./money-core";
// ── /T1.6a1 cancel-departure-core ──
