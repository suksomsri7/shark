// HR H2.7 ▸ กติกาการลาแบบฟังก์ชันล้วน (ไม่แตะ DB · ไม่อ่านนาฬิกา — ผู้เรียกส่งวันมาเอง) — brief H2.7 R2
//
//   • ปีการลา = เริ่มวันที่ 1 ของเดือน yearStartMonth (ysm) · ปี Y = [Y-ysm-01, (Y+1)-ysm-01)
//   • จำนวนวัน = สตริงทศนิยม 1 ตำแหน่ง ("3.0" · "0.5") คิดเป็นจำนวนเต็ม "หนึ่งในสิบวัน" ภายใน (ไม่มีเศษทศนิยมลอยตัว)
//   • ลาเป็นชั่วโมง = floor(ชั่วโมง/8, 0.1) — 8 × 1 ชม. = 0.8 วัน (เสียเวลา) ⇒ หน้าตั้งค่ายังไม่เปิดสวิตช์นี้ (หนี้ D-H27-hourly)
//   • สิทธิ์ต่อปี (grantDays): มีสิทธิ์ตั้งแต่ วันเริ่มงาน + minServiceDays · โควตาเต็มตั้งแต่ max(ต้นปี, วันมีสิทธิ์) ·
//     ตามสัดส่วน (firstYearProrata) = floor(โควตา × วันที่เหลือ / วันในปี, 0.5) เฉพาะปีที่วันมีสิทธิ์ตกกลางปี
//   • ปฏิเสธ = throw (ข้อความไทยคงที่ — LEAVE_TEXT / TIME_RULE_TEXT) ◂
import { addDays, leaveDaysBetween, TIME_RULE_TEXT, TimeRuleError } from "./time-rules";

/** ข้อความคงที่ของการลา (brief §3 — ห้ามต่อชื่อ/id) */
export const LEAVE_TEXT = {
  // ถึงพนักงาน / ผู้จัดการที่ยื่นแทน
  policyNf: "ไม่พบประเภทการลานี้ หรือปิดใช้แล้ว — กรุณาเลือกใหม่",
  halfNotAllowed: "ประเภทการลานี้ลาครึ่งวันไม่ได้",
  hoursNotAllowed: "ประเภทการลานี้ลาเป็นชั่วโมงไม่ได้",
  hoursBad: "ลาเป็นชั่วโมงได้ครั้งละ 1 วัน จำนวน 1 ถึง 7 ชั่วโมงเต็ม",
  halfAndHours: "เลือกลาครึ่งวันหรือลาเป็นชั่วโมงอย่างใดอย่างหนึ่ง",
  crossYear: "ใบลาข้ามปีการลา — กรุณาแยกเป็น 2 ใบตามปีการลา",
  outOfEmployment: "วันลาอยู่นอกช่วงการจ้างงาน — ตรวจวันที่อีกครั้ง",
  noStart: "ยังไม่ได้บันทึกวันเริ่มงานของพนักงาน — ให้ผู้จัดการบันทึกก่อน",
  notEligible: "ยังไม่ครบอายุงานสำหรับการลาประเภทนี้",
  overlap: "ช่วงนี้มีใบลาที่รออนุมัติหรืออนุมัติแล้ว — ยกเลิกใบเดิมก่อน หรือเลือกวันอื่น",
  zeroDays: "ช่วงที่เลือกเป็นวันหยุดทั้งหมด — ไม่ต้องยื่นลา",
  balance: "วันลาคงเหลือไม่พอสำหรับใบลานี้ — ดูยอดคงเหลือก่อนยื่น",
  fileBad: "ไฟล์แนบไม่ถูกต้อง — แนบรูปหรือ PDF ที่อัปโหลดใหม่",
  attachClosed: "ใบลานี้ปิดแล้ว — แนบไฟล์เพิ่มไม่ได้",
  // ถึงคนที่แนบไฟล์ให้ใบของคนอื่น
  attachNotYours: "แนบไฟล์ได้เฉพาะใบลาของคุณ",
  // ถึงผู้อนุมัติ (ทางตรง)
  balanceDecide: "วันลาคงเหลือของพนักงานไม่พอ — อนุมัติใบนี้ไม่ได้",
  // ถึงผู้ที่ไม่มีสิทธิ์ (ไบต์เดียวกันทุกกรณี — ไม่บอกว่ามีข้อมูลอยู่)
  linkNo: "ไม่พบไฟล์แนบ หรือคุณไม่มีสิทธิ์เปิด",
  detailNo: "ไม่พบใบลานี้ หรือคุณไม่มีสิทธิ์ดู",
  balNo: "ไม่พบข้อมูลวันลาของพนักงานคนนี้ หรือคุณไม่มีสิทธิ์ดู",
  // ถึงผู้ตั้งค่า
  presetNone: "ยังไม่มีชุดวันหยุดราชการของปีนี้ — เพิ่มวันหยุดเองได้",
} as const;

export class LeaveRuleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LeaveRuleError";
  }
}

const DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_MS = 86_400_000;

/** "YYYY-MM-DD" (Date ที่เป็นเที่ยงคืน UTC ของคอลัมน์ @db.Date ก็รับ) */
export function dayKey(v: string | Date): string {
  if (v instanceof Date) {
    if (!Number.isFinite(v.getTime())) throw new TimeRuleError(TIME_RULE_TEXT.badDay);
    return v.toISOString().slice(0, 10);
  }
  const s = typeof v === "string" ? v.trim().slice(0, 10) : "";
  if (!DAY_RE.test(s)) throw new TimeRuleError(TIME_RULE_TEXT.badDay);
  return addDays(s, 0); // ตรวจว่าเป็นวันจริง
}

/** ค่า (Decimal · ตัวเลข · สตริง) → จำนวน "หนึ่งในสิบวัน" (จำนวนเต็ม) · ว่าง = 0 */
export function tenthsOf(v: unknown): number {
  if (v === null || v === undefined || v === "") return 0;
  const n = Number(String(v));
  return Number.isFinite(n) ? Math.round(n * 10) : 0;
}
/** หนึ่งในสิบวัน → "N.N" */
export const fmtTenths = (t: number): string => (t / 10).toFixed(1);

const daysInRange = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS) + 1;
const pad2 = (n: number) => String(n).padStart(2, "0");
const validYsm = (ysm: number) => (Number.isInteger(ysm) && ysm >= 1 && ysm <= 12 ? ysm : 1);

/** ปีการลาของวันนั้น (ysm = เดือนเริ่มปี 1–12) */
export function leaveYearOf(day: string | Date, ysm = 1): number {
  const d = dayKey(day);
  const m = validYsm(ysm);
  const y = Number(d.slice(0, 4));
  return Number(d.slice(5, 7)) >= m ? y : y - 1;
}

/** ช่วงวันของปีการลา Y (รวมหัวท้าย) */
export function leaveYearBounds(year: number, ysm = 1): { from: string; to: string } {
  const m = validYsm(ysm);
  const from = `${year}-${pad2(m)}-01`;
  return { from, to: addDays(`${year + 1}-${pad2(m)}-01`, -1) };
}

/** วันหมดอายุของวันลาสะสมในปี Y ("MM-DD" ครั้งแรกนับจากต้นปีการลา) · ไม่ตั้ง = null */
export function carryExpiryOf(year: number, ysm: number, monthDay: string | null | undefined): string | null {
  const md = typeof monthDay === "string" ? monthDay.trim() : "";
  if (!/^\d{2}-\d{2}$/.test(md)) return null;
  const b = leaveYearBounds(year, ysm);
  const first = `${year}-${md}`;
  try {
    const d = dayKey(first) < b.from ? dayKey(`${year + 1}-${md}`) : dayKey(first);
    return d;
  } catch {
    return null; // 02-29 ของปีที่ไม่มี — ไม่หมดอายุ (หน้าตั้งค่ากันไว้แล้ว)
  }
}

/** ลาเป็นชั่วโมง → วัน: ชั่วโมงเต็ม 1–7 · floor(h/8, 0.1) */
export function hourlyLeaveDays(hours: unknown): string {
  const h = typeof hours === "string" && hours.trim() !== "" ? Number(hours) : hours;
  if (typeof h !== "number" || !Number.isInteger(h) || h < 1 || h > 7) throw new LeaveRuleError(LEAVE_TEXT.hoursBad);
  return fmtTenths(Math.floor((h * 10) / 8));
}

export type CountLeaveInput = {
  from: string;
  to: string;
  halfDay?: "AM" | "PM" | null;
  hours?: number | null;
  /** วันหยุด (วันหยุดราชการ/ร้าน ของสาขาในวันนั้น) */
  holidays: ReadonlySet<string>;
  /** วันหยุดประจำของคนนี้ (ตารางกะ/ตารางงาน) */
  daysOff: ReadonlySet<string>;
};

/** จำนวนวันลา ("N.N") — ห่อ leaveDaysBetween (ช่วงวัน · ≤ 366 วัน · ครึ่งวัน) + ลาเป็นชั่วโมง · วันที่ไม่นับ = "0.0" */
export function countLeaveDays(input: CountLeaveInput): string {
  const half = input.halfDay ?? null;
  const hours = input.hours ?? null;
  if (half && hours !== null) throw new LeaveRuleError(LEAVE_TEXT.halfAndHours);
  const excluded = new Set<string>([...(input.holidays ?? []), ...(input.daysOff ?? [])]);
  if (hours !== null) {
    const perDay = hourlyLeaveDays(hours);
    leaveDaysBetween(input.from, input.to); // ช่วงวัน/ยาวเกิน = ข้อความเดิม
    if (input.from !== input.to) throw new LeaveRuleError(LEAVE_TEXT.hoursBad);
    return excluded.has(input.from) ? "0.0" : perDay;
  }
  return leaveDaysBetween(input.from, input.to, { halfDay: half, excluded });
}

export type GrantPolicy = { quotaDays: unknown; minServiceDays: number; firstYearProrata: boolean };
export type GrantResult = { eligible: true; days: string | null; effectiveDate: string } | { eligible: false; code: "SERVICE" | "NO_START" };

/** สิทธิ์ของปีการลา Y — days null = ไม่จำกัด */
export function grantDays(policy: GrantPolicy, startDate: string | Date | null | undefined, year: number, ysm = 1): GrantResult {
  const b = leaveYearBounds(year, ysm);
  const quota = policy.quotaDays === null || policy.quotaDays === undefined || policy.quotaDays === "" ? null : tenthsOf(policy.quotaDays);
  const ms = Number.isInteger(policy.minServiceDays) && policy.minServiceDays > 0 ? policy.minServiceDays : 0;
  const start = startDate ? dayKey(startDate) : null;
  if (!start) {
    if (ms > 0 || policy.firstYearProrata) return { eligible: false, code: "NO_START" };
    return { eligible: true, days: quota === null ? null : fmtTenths(quota), effectiveDate: b.from };
  }
  const eligibleFrom = addDays(start, ms);
  if (eligibleFrom > b.to) return { eligible: false, code: "SERVICE" };
  const eff = eligibleFrom > b.from ? eligibleFrom : b.from;
  if (quota === null) return { eligible: true, days: null, effectiveDate: eff };
  if (eff > b.from && policy.firstYearProrata) {
    const left = daysInRange(eff, b.to);
    const all = daysInRange(b.from, b.to);
    const halves = Math.floor((quota * 2 * left) / (10 * all)); // floor(โควตา × เหลือ / ทั้งปี, 0.5)
    return { eligible: true, days: fmtTenths(halves * 5), effectiveDate: eff };
  }
  return { eligible: true, days: fmtTenths(quota), effectiveDate: eff };
}

/** วันลาสะสมยกไปปีถัดไป = min(เพดาน, max(0, คงเหลือปีก่อน)) */
export function carryDays(prevBalance: unknown, maxDays: unknown): string {
  return fmtTenths(Math.min(tenthsOf(maxDays), Math.max(0, tenthsOf(prevBalance))));
}

/** วันลาสะสมที่หมดอายุ = max(0, สะสม − ใช้ไปถึงวันหมดอายุ) */
export function expireDays(carried: unknown, used: unknown): string {
  return fmtTenths(Math.max(0, tenthsOf(carried) - tenthsOf(used)));
}
// ◂ HR H2.7
