// SVC H.3 ▸ สถานะการจองโรงแรม V2 — pure ล้วน (ใบสั่ง ledger/svc-briefs/svc-brief-h.3.md §0 · §3.4 · สเปก S §7.8)
//   • ไม่มี directive · ไม่ import ค่าใด ๆ · ไม่อ่านนาฬิกาเครื่อง (ผู้เรียกส่ง now เข้ามาเอง)
//   • ทางเดียว: HOLD → CONFIRMED → CHECKED_IN → CHECKED_OUT · HOLD/CONFIRMED → CANCELLED · CONFIRMED → NO_SHOW
//     NO_SHOW → CONFIRMED เฉพาะ MANAGER/OWNER ภายในวันเดียวกัน (ไทย) — ผู้เรียกต้องผ่าน guard tx (ห้องต้องยังว่าง)
//   • BOOKED (P1) = สถานะเก่าที่ backfill แล้ว · REFUNDED = ปลายทางของเส้น P1 refundStay — ไม่อยู่ในตาราง V2 (ไม่ใช่ต้นทาง/ปลายทาง)
//   • ข้อยกเว้นนอกตาราง (ไม่แก้ TRANSITIONS โดยตั้งใจ): CANCELLED(cancelReason HOLD_EXPIRED) → CONFIRMED = "re-book" เมื่อเงินมัดจำเข้าหลังหมดเวลาถือห้อง
//     (booking.ts takeBookingDeposit · ผ่าน guard tx · เฉพาะวันเข้ายังไม่ผ่านและห้องยังว่าง — ไม่งั้นคงยกเลิก + คืนเงินอัตโนมัติ) · CANCELLED ด้วยเหตุอื่นเป็นปลายทางเสมอ

export type BookingStatus = "HOLD" | "CONFIRMED" | "CHECKED_IN" | "CHECKED_OUT" | "CANCELLED" | "NO_SHOW";
export type TransitionRole = "OWNER" | "MANAGER" | "STAFF";
export type TransitionOpts = { role?: TransitionRole | string; sameDay?: boolean };

/** ตารางคงที่ (ต้นทาง → ปลายทางที่อนุญาต) — 6 สถานะ V2 */
export const TRANSITIONS: Readonly<Record<BookingStatus, readonly BookingStatus[]>> = Object.freeze({
  HOLD: Object.freeze(["CONFIRMED", "CANCELLED"] as const),
  CONFIRMED: Object.freeze(["CHECKED_IN", "CANCELLED", "NO_SHOW"] as const),
  CHECKED_IN: Object.freeze(["CHECKED_OUT"] as const),
  CHECKED_OUT: Object.freeze([] as const),
  CANCELLED: Object.freeze([] as const),
  NO_SHOW: Object.freeze(["CONFIRMED"] as const),
});

const isStatus = (s: unknown): s is BookingStatus => typeof s === "string" && Object.prototype.hasOwnProperty.call(TRANSITIONS, s);

/** เปลี่ยนสถานะได้ไหม — NO_SHOW → CONFIRMED ต้อง role MANAGER/OWNER และ sameDay === true · สถานะไม่รู้จัก ⇒ false (ไม่ throw) */
export function canTransition(from: string, to: string, opts?: TransitionOpts): boolean {
  if (!isStatus(from) || !isStatus(to)) return false;
  if (!TRANSITIONS[from].includes(to)) return false;
  if (from === "NO_SHOW" && to === "CONFIRMED") return (opts?.role === "MANAGER" || opts?.role === "OWNER") && opts.sameDay === true;
  return true;
}

// ───────── วันที่ (จำนวนเต็มล้วน · ไม่ใช้ Date) ─────────
const YMD = /^(\d{4})-(\d{2})-(\d{2})$/;
const MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const isLeap = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
function validYmd(s: unknown): s is string {
  if (typeof s !== "string") return false;
  const m = YMD.exec(s);
  if (!m) return false;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1) return false;
  return d <= (mo === 2 && isLeap(y) ? 29 : MONTH_DAYS[mo - 1]);
}
function dayNo(ymd: string): number {
  const m = YMD.exec(ymd);
  if (!m) return Number.NaN;
  let y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  y -= mo <= 2 ? 1 : 0;
  const era = Math.floor(y / 400);
  const yoe = y - era * 400;
  const mp = (mo + 9) % 12;
  const doy = Math.floor((153 * mp + 2) / 5) + d - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}
function ymdOf(z0: number): string {
  const z = z0 + 719468;
  const era = Math.floor(z / 146097);
  const doe = z - era * 146097;
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365);
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const d = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const mo = mp < 10 ? mp + 3 : mp - 9;
  const y = yoe + era * 400 + (mo <= 2 ? 1 : 0);
  return `${String(y).padStart(4, "0")}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** คืนของการเข้าพัก [checkIn, checkOut) เป็นรายวัน "YYYY-MM-DD" · ช่วงผิด/วันผิดรูป ⇒ [] */
export function nightsOf(checkIn: string, checkOut: string): string[] {
  if (!validYmd(checkIn) || !validYmd(checkOut)) return [];
  const a = dayNo(checkIn);
  const b = dayNo(checkOut);
  const out: string[] = [];
  for (let n = a; n < b; n++) out.push(ymdOf(n));
  return out;
}

/** เส้นตายถือห้อง = now + minutes นาที · minutes null (ไม่หมดอายุ) ⇒ null · ไม่แก้ค่า now */
export function holdDeadline(now: Date, minutes: number | null | undefined): Date | null {
  if (minutes === null || minutes === undefined || !Number.isFinite(minutes)) return null;
  const t = now instanceof Date ? now.getTime() : Number.NaN;
  if (!Number.isFinite(t)) return null;
  return new Date(t + Math.trunc(minutes) * 60_000);
}
