// ─────────────────────────────────────────────────────────────
// trips/departure-view-core.ts — ตัวช่วยบริสุทธิ์ของจอปฏิทินรอบ (RUN TRIPS T1.2 §3)
// สถานะช่อง (ลำดับตัดสินตายตัว) · วันของสัปดาห์/เดือน · เกณฑ์เป้ารวมรอบ
// 🔴 pure ล้วน: import ได้เฉพาะ `import type` + ./departures-core + ./capacity-core · ไม่มี I/O · ไม่อ่านนาฬิกาเครื่อง (now มาจากผู้เรียก)
// 🔴 "เต็ม" ตัดสินจากที่ว่าง capacity − sold − held − reserved (publicLeftOf) ไม่ใช่สถานะ (มติ T0.4 ข้อ 1)
// ─────────────────────────────────────────────────────────────
import { publicLeftOf } from "./capacity-core";
import { addDaysYmd, weekdayOfYmd } from "./departures-core";

export const DEPARTURE_CELL_STATES = ["CANCELLED", "PAST", "DEPARTED_TODAY", "FULL", "CLOSED", "BELOW_MIN", "GUARANTEED", "LOW", "OPEN"] as const;
export type DepartureCellState = (typeof DEPARTURE_CELL_STATES)[number];

export type CellStateInput = { status: string; capacity: number; sold: number; held: number; reserved: number; minPax: number | null; localDate: string; startsAt: Date | string };
export type CellStateCtx = { now: Date; today: string; lowAtOrBelow: number | null };

const msOf = (v: Date | string): number => (typeof v === "string" ? Date.parse(v) : v.getTime());

/**
 * สถานะของช่องในปฏิทิน — ตารางตัดสินบนลงล่าง ตัวแรกที่จริงชนะ (ใบสั่ง §3):
 * ยกเลิก → เริ่มแล้ว (วันนี้ = ออกเรือแล้ว · ก่อนหน้า = เดินทางแล้ว) → ที่ว่าง ≤ 0 = เต็ม → ปิดรับ → ต่ำกว่าขั้นต่ำ → ยืนยันออก → เหลือน้อย → เปิดขาย
 * สถานะ FULL ที่ยังมีที่ว่าง ⇒ ถือเป็น OPEN (เต็มตั้งโดยระบบ แต่จอเชื่อตัวนับ)
 */
export function departureCellState(d: CellStateInput, c: CellStateCtx): DepartureCellState {
  if (d.status === "CANCELLED") return "CANCELLED";
  if (msOf(d.startsAt) <= c.now.getTime()) return d.localDate === c.today ? "DEPARTED_TODAY" : "PAST";
  const left = publicLeftOf(d);
  if (left <= 0) return "FULL";
  if (d.status === "CLOSED") return "CLOSED";
  const status = d.status === "FULL" ? "OPEN" : d.status;
  if (status === "OPEN" && d.minPax !== null && d.sold < d.minPax) return "BELOW_MIN";
  if (status === "GUARANTEED") return "GUARANTEED";
  if (c.lowAtOrBelow !== null && c.lowAtOrBelow > 0 && left <= c.lowAtOrBelow) return "LOW";
  return "OPEN";
}

/** "YYYY-MM-DD" ที่เป็นวันมีจริง (UTC ล้วน) */
export function isCalendarYmd(s: unknown): s is string {
  if (typeof s !== "string") return false;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return false;
  return addDaysYmd(s, 0) === s;
}
/** "YYYY-MM" ที่เดือนอยู่ 01–12 */
export function isCalendarMonth(s: unknown): s is string {
  return typeof s === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(s);
}

/** 7 วันต่อกันเริ่ม start (ข้ามเดือน/ปีได้) · start ผิดรูป ⇒ [] */
export function calendarWeekDays(start: string): string[] {
  if (!isCalendarYmd(start)) return [];
  return [0, 1, 2, 3, 4, 5, 6].map((i) => addDaysYmd(start, i));
}

/** จันทร์ = 0 … อาทิตย์ = 6 */
const mondayIndex = (ymd: string): number => (weekdayOfYmd(ymd) + 6) % 7;

/** "YYYY-MM" → ทุกวันของสัปดาห์ที่ครอบเดือน เริ่มวันจันทร์ (28–42 วัน) · ผิดรูป ⇒ [] */
export function calendarMonthDays(month: string): string[] {
  if (!isCalendarMonth(month)) return [];
  const first = `${month}-01`;
  const last = addDaysYmd(nextMonthOf(month) + "-01", -1);
  const from = addDaysYmd(first, -mondayIndex(first));
  const to = addDaysYmd(last, 6 - mondayIndex(last));
  const out: string[] = [];
  for (let d = from; d <= to; d = addDaysYmd(d, 1)) out.push(d);
  return out;
}

/** วันเริ่มสัปดาห์ปริยาย = วันนี้ − 1 (ภาพ 11: ดู ณ พฤ. 12 แสดงตั้งแต่ พ. 11) */
export function defaultWeekStart(today: string): string {
  return isCalendarYmd(today) ? addDaysYmd(today, -1) : today;
}

/** เดือนถัดไป/ก่อนหน้าของ "YYYY-MM" */
export function nextMonthOf(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
}
export function prevMonthOf(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
}

/** สถานะช่องที่รับเป็นเป้ารวมรอบได้ (ใบสั่ง §4.2) */
export const MERGE_TARGET_STATES: readonly DepartureCellState[] = ["OPEN", "GUARANTEED", "LOW", "BELOW_MIN"];
/**
 * เป้ารวมรอบ: วันเดียวกัน (localDate) · ไม่ใช่ตัวเอง · สถานะช่อง (ณ now) อยู่ใน MERGE_TARGET_STATES · ที่ว่างของเป้า ≥ คนของรอบต้นทาง
 * ข้ามสินค้าได้ (ภาพ 11 "รวมกับพีพี") — ความเป็นของหน่วย/สินค้าที่ไม่ถูกเก็บ ผู้เรียกกรองก่อน
 */
export function isMergeTarget(
  src: { id: string; localDate: string; sold: number; held: number; reserved: number },
  tgt: CellStateInput & { id: string },
  c: { now: Date; today: string },
): boolean {
  if (tgt.id === src.id || tgt.localDate !== src.localDate) return false;
  const st = departureCellState(tgt, { ...c, lowAtOrBelow: null });
  if (!MERGE_TARGET_STATES.includes(st)) return false;
  return publicLeftOf(tgt) >= src.sold + src.held + src.reserved;
}
