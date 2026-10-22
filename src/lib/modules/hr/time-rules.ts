// HR H1.2 ▸ กติกาเวลาแบบฟังก์ชันล้วน (ไม่แตะ DB · ไม่อ่านนาฬิกา — ผู้เรียกส่งเวลามาเอง)
//
// ทำไมแยกไฟล์: กะข้ามเที่ยงคืน (22:00–06:00) ทำให้ "วันของกะ" ≠ "วันของเวลาที่กด" — ทุกจุดที่คิดเรื่องนี้ต้องใช้สูตรเดียวกัน
//   (ตัวตรวจกะในหน้าตั้งค่า H1.2 · ลงเวลา v2 H2.4 · ตัดสินผล H2.5 · นับวันลา H2.7)
// เวลาไทย = +07:00 คงที่ (ไม่มี DST) — ค่าคงที่เดียวกับ bkkParts ใน service.ts (ไม่ย้ายโค้ดเดิม · oracle เทียบสองตัวนี้ 500 จุด)
// วัน (day) = สตริง "YYYY-MM-DD" ตามปฏิทินไทยเสมอ · ช่วงเวลา = ครึ่งเปิด [start, end)
// ปฏิเสธ = throw TimeRuleError (ข้อความไทยคงที่ — ผู้เรียกส่งต่อถึงจอได้) ◂

/** +07:00 เป็นมิลลิวินาที */
const BKK_OFFSET_MS = 7 * 3_600_000;
const DAY_MS = 86_400_000;
const MIN_MS = 60_000;
const DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** ข้อความปฏิเสธ (คงที่ทุกไบต์ — ห้ามต่อชื่อ/id) */
export const TIME_RULE_TEXT = {
  shiftEqual: "เวลาเริ่มกับเวลาเลิกกะต้องไม่เท่ากัน",
  shiftRange: "เวลากะต้องอยู่ระหว่าง 00:00 ถึง 24:00",
  shiftMidnight: "กะที่เลิกหลังเที่ยงคืนต้องติ๊ก \"ข้ามเที่ยงคืน\" (และกะที่ติ๊กต้องเลิกก่อนเวลาเริ่ม)",
  badDay: "วันที่ไม่ถูกต้อง",
  badInstant: "เวลาไม่ถูกต้อง",
  leaveRange: "วันเริ่มลาต้องไม่หลังวันสิ้นสุด",
  halfDayRange: "ลาครึ่งวันได้ครั้งละ 1 วัน",
  leaveTooLong: "ใบลาหนึ่งใบยาวได้ไม่เกิน 366 วัน", // HR H1.2 R13 ▸ R13.4 (Decimal(4,1)) ◂
} as const;

export class TimeRuleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TimeRuleError";
  }
}

export type ShiftTimes = { startMin: number; endMin: number; crossesMidnight: boolean };
export type Window = { start: Date; end: Date };

const isInt = (n: unknown): n is number => typeof n === "number" && Number.isInteger(n);

/** แยก "YYYY-MM-DD" → [y, m(1-12), d] พร้อมตรวจว่าเป็นวันจริง (รวม 29 ก.พ.) */
function parseDay(day: string): [number, number, number] {
  const m = typeof day === "string" ? DAY_RE.exec(day) : null;
  if (!m) throw new TimeRuleError(TIME_RULE_TEXT.badDay);
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const t = new Date(Date.UTC(y, mo - 1, d));
  if (t.getUTCFullYear() !== y || t.getUTCMonth() !== mo - 1 || t.getUTCDate() !== d) throw new TimeRuleError(TIME_RULE_TEXT.badDay);
  return [y, mo, d];
}

/** วันที่ตามปฏิทินไทยของ instant ("YYYY-MM-DD") */
export function bkkDayKey(at: Date): string {
  if (!(at instanceof Date) || !Number.isFinite(at.getTime())) throw new TimeRuleError(TIME_RULE_TEXT.badInstant);
  return new Date(at.getTime() + BKK_OFFSET_MS).toISOString().slice(0, 10);
}

/** เที่ยงคืนเวลาไทยของวันนั้น (= `${day}T00:00:00+07:00`) */
export function bkkMidnight(day: string): Date {
  const [y, mo, d] = parseDay(day);
  return new Date(Date.UTC(y, mo - 1, d) - BKK_OFFSET_MS);
}

/** บวก/ลบวันตามปฏิทิน (ข้ามเดือน/ปี/29 ก.พ. ถูกต้อง) */
export function addDays(day: string, n: number): string {
  const [y, mo, d] = parseDay(day);
  if (!isInt(n)) throw new TimeRuleError(TIME_RULE_TEXT.badDay);
  return new Date(Date.UTC(y, mo - 1, d) + n * DAY_MS).toISOString().slice(0, 10);
}

/**
 * ปัญหาของเวลากะ (null = ใช้ได้) — กติกาเดียวของทั้งระบบ:
 *   startMin 0..1439 · endMin 0..1440 (1440 = เที่ยงคืนพอดี ได้เฉพาะกะที่ไม่ข้ามเที่ยงคืน) · เริ่ม ≠ เลิก ·
 *   crossesMidnight ต้องตรงกับ (endMin < startMin)
 */
export function shiftTimesProblem(s: ShiftTimes): string | null {
  if (!s || !isInt(s.startMin) || !isInt(s.endMin) || typeof s.crossesMidnight !== "boolean") return TIME_RULE_TEXT.shiftRange;
  if (s.startMin < 0 || s.startMin > 1439 || s.endMin < 0 || s.endMin > 1440) return TIME_RULE_TEXT.shiftRange;
  if (s.startMin === s.endMin) return TIME_RULE_TEXT.shiftEqual;
  if (s.endMin === 1440 && s.crossesMidnight) return TIME_RULE_TEXT.shiftMidnight;
  if (s.crossesMidnight !== s.endMin < s.startMin) return TIME_RULE_TEXT.shiftMidnight;
  return null;
}

/** ช่วงเวลาจริงของกะที่เริ่มวัน `day` (เวลาไทย) — กะข้ามเที่ยงคืนจบวันถัดไป · ผิดกติกา = TimeRuleError */
export function shiftWindow(day: string, s: ShiftTimes): Window {
  const problem = shiftTimesProblem(s);
  if (problem) throw new TimeRuleError(problem);
  const base = bkkMidnight(day).getTime();
  const start = new Date(base + s.startMin * MIN_MS);
  const end = new Date(base + (s.crossesMidnight ? DAY_MS : 0) + s.endMin * MIN_MS);
  return { start, end };
}

/** นาทีที่ได้ค่าแรงของกะ = ความยาวกะ − พัก (ไม่ต่ำกว่า 0) */
export function paidMinutes(s: ShiftTimes & { breakMin?: number | null }): number {
  const problem = shiftTimesProblem(s);
  if (problem) throw new TimeRuleError(problem);
  const length = s.crossesMidnight ? 1440 - s.startMin + s.endMin : s.endMin - s.startMin;
  const brk = isInt(s.breakMin) && s.breakMin > 0 ? s.breakMin : 0;
  return Math.max(0, length - brk);
}

/** นาทีที่สองช่วงซ้อนกัน (ครึ่งเปิด — แตะกันพอดี = 0 · ไม่ซ้อน = 0) */
export function overlapMinutes(a: Window, b: Window): number {
  const s = Math.max(a.start.getTime(), b.start.getTime());
  const e = Math.min(a.end.getTime(), b.end.getTime());
  return e > s ? Math.floor((e - s) / MIN_MS) : 0;
}

/**
 * เวลาที่กด `at` เป็นของกะวันไหน — คืน day ของช่วงที่ครอบ `at` (± toleranceMin นาที) · ไม่มีช่วงไหนครอบ = null
 * กรณี D13b: 02:00 ของวันที่ 1 พ.ย. อยู่ในกะดึกที่เริ่ม 31 ต.ค. ⇒ "31 ต.ค." · ครอบหลายช่วง = ช่วงที่เริ่มใกล้ `at` ที่สุด
 * (H2.4 ใช้ตอนลงเวลา v2 — H1.2 มีแต่ตัวสูตร)
 */
export function rosterDayOf(at: Date, windows: readonly (Window & { day?: string; date?: string })[], toleranceMin = 0): string | null {
  if (!(at instanceof Date) || !Number.isFinite(at.getTime())) throw new TimeRuleError(TIME_RULE_TEXT.badInstant);
  const tol = isInt(toleranceMin) && toleranceMin > 0 ? toleranceMin * MIN_MS : 0;
  const t = at.getTime();
  let best: { day: string; dist: number } | null = null;
  for (const w of windows ?? []) {
    if (!(w?.start instanceof Date) || !(w?.end instanceof Date)) continue;
    if (t < w.start.getTime() - tol || t >= w.end.getTime() + tol) continue;
    const day = w.day ?? w.date ?? bkkDayKey(w.start);
    const dist = Math.abs(t - w.start.getTime());
    if (!best || dist < best.dist) best = { day, dist };
  }
  return best ? best.day : null;
}

/**
 * จำนวนวันลา (สตริงทศนิยม 1 ตำแหน่ง เช่น "3.0" · "0.5") — นับทุกวันตั้งแต่ from ถึง to รวมหัวท้าย ยกเว้นวันใน `excluded`
 * (วันหยุด/วันหยุดประจำ — ผู้เรียกเป็นคนบอก) · ลาครึ่งวัน (halfDay) ได้ครั้งละ 1 วัน = "0.5" (วันนั้นเป็นวันหยุด = "0.0")
 */
export function leaveDaysBetween(from: string, to: string, opts: { halfDay?: "AM" | "PM" | null; excluded?: ReadonlySet<string> } = {}): string {
  parseDay(from);
  parseDay(to);
  if (from > to) throw new TimeRuleError(TIME_RULE_TEXT.leaveRange);
  // HR H1.2 R13 ▸ R13.4: จำนวนวันเก็บใน Decimal(4,1) (สูงสุด 999.9) — ช่วงเกิน 366 วันตามปฏิทิน = ปฏิเสธ ◂
  if (addDays(from, 365) < to) throw new TimeRuleError(TIME_RULE_TEXT.leaveTooLong);
  const excluded = opts.excluded ?? new Set<string>();
  if (opts.halfDay) {
    if (from !== to) throw new TimeRuleError(TIME_RULE_TEXT.halfDayRange);
    return excluded.has(from) ? "0.0" : "0.5";
  }
  let n = 0;
  for (let d = from; d <= to; d = addDays(d, 1)) if (!excluded.has(d)) n++;
  return n.toFixed(1);
}
