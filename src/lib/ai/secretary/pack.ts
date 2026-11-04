// pack.ts — แพ็กฟรี + นิยาม "1 งาน" + ข้อความโควตา ของเลขา AI (ใบ S0.4 · สัญญา docs/modules/31-secretary.md §8)
//
// 🔴 ไฟล์บริสุทธิ์: ไม่แตะฐานข้อมูล · ไม่อ่านนาฬิกาเอง (`now` มาจากผู้เรียกเสมอ) · ไม่ใช้ตัวอ่านเวลาตามเครื่อง
//    เวลาไทยอ่านผ่าน `bkkParts` (บวก offset แล้วอ่านแบบ UTC) — [[reference_thai_date_getday_trap]]
// 🔴 ตัวเลขที่ผู้ใช้เห็น = งาน · % ของโควตา · วันรีเซ็ต — ห้ามมีคำว่า token/บาท/ดอลลาร์ในข้อความ (COMMON §C.6)
//
// ที่มาของตัวเลข (มติเจ้าของ 7.1–7.4 · DESIGN-SECRETARY §6 · วัดจริง 9 ต.ค. งาน T0.1):
//   ต้นทุนเฉลี่ย ≈ 3.58 บาท/งาน (แชท 50% · ใบเสนอราคา 10% · สรุป 20% · คอนเทนต์ 10% · สอน 10%)
//   แพ็กฟรี 100 งาน/เดือน ≈ 358 บาท/ร้าน/เดือนที่ราคาป้ายถ้าใช้เต็ม · งานข้ามระบบหลายขั้นแพงกว่าเฉลี่ย ~1.5–2×
//   แพ็กเสียเงินแสดงปิด · ปุ่มเติมเงินปิด · ร้านใหม่ไม่ได้เครดิตต้อนรับ · เครดิต $10 ของร้านเดิมคงไว้ (R-K7)
import { bkkParts } from "@/lib/core/quiet-hours";

/**
 * แพ็กฟรีรุ่นแรก (มติ 7.2) — scheduledMax = เพดานงานประจำต่อร้าน (เท่า MAX_TASKS_PER_TENANT เดิม) · approversMax = ผู้อนุมัติต่อร้าน
 * assistDailyMicro (R-S1.13b) = เพดานต้นทุน assist ต่อร้านต่อวันไทย (ไมโครดอลลาร์ ≈ $0.50) — กันทางที่ฟรีวิ่งไม่หยุด · ห้องเลขา (job) ไม่ใช้เพดานนี้
 */
export const FREE_PACK = { enabled: true, jobsPerMonth: 100, scheduledMax: 10, approversMax: 5, assistDailyMicro: 500_000 } as const;

/**
 * เวลาเปิดใช้เลขา (R-K7): ร้านที่ `createdAt >= SECRETARY_LAUNCH_AT` ไม่ได้แถว GRANT เครดิตต้อนรับใน `ensureWallet`
 * 🔴 ตั้งเป็นเวลา deploy production จริงในใบ S3a.2 (ลำดับ deploy RESOLUTIONS §E ข้อ 4)
 */
export const SECRETARY_LAUNCH_AT = "2026-11-04T00:00:00.000Z"; // R-K7 · set to the real prod deploy time in S3a.2

/**
 * เหตุการณ์ที่อาจนับเป็นงาน (มติ Q3 ของเจ้าของ):
 *   room_new = เปิดห้องงานใหม่ (นับที่ `startRoom` — R-K6) · room_message = สั่งเพิ่มในห้องเดิม (ไม่นับ) ·
 *   scheduled_run = งานประจำรัน 1 รอบ (= เปิดห้องใหม่ 1 ห้อง) · couldNotAct = เลขาทำอะไรไม่ได้เลย (ไม่มีสิทธิ์/ระบบปิด) ⇒ ไม่นับ
 */
export type JobEvent = { kind: "room_new" | "room_message" | "scheduled_run"; couldNotAct?: boolean };

/** 1 งาน = 1 ห้องที่เปิด (สั่งเอง หรือ งานประจำ) · ข้อความต่อในห้องเดิม = 0 · ทำไม่ได้เลย = 0 */
export function countsAsJob(ev: JobEvent): 0 | 1 {
  if (ev.couldNotAct === true) return 0;
  return ev.kind === "room_new" || ev.kind === "scheduled_run" ? 1 : 0;
}

export type QuotaLevel = "ok" | "warn80" | "warn95" | "exhausted";

const TH_MONTH_SHORT = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."] as const;

/** "1 ธ.ค." — วันที่ไทย (วัน + เดือนย่อ) ของเวลา `d` */
function thaiDayMonth(d: Date): string {
  const p = bkkParts(d);
  return `${p.day} ${TH_MONTH_SHORT[p.mo]}`;
}

/** จำนวนเต็มที่ปลอดภัย (ค่าเพี้ยน/ติดลบ = 0) */
function nonNeg(n: number): number {
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

/**
 * สถานะโควตางานของเดือน + ข้อความไทยที่ผู้ใช้เห็น
 *   pct = floor(used/limit×100) (คำนวณแบบจำนวนเต็ม กันทศนิยมลอยตัว) · limit ≤ 0 ⇒ 100 · jobsLeft = max(0, limit−used)
 *   ระดับ: < 80 ok (ไม่มีข้อความ) · 80–94 warn80 · 95–99 warn95 · ≥ 100 exhausted
 *   `now` รับไว้ตามสัญญา (นาฬิกาฉีด) — ข้อความใช้ `resetAt` ที่ผู้เรียกคำนวณจาก `nextResetBangkok(now)`
 */
export function quotaMessage(used: number, limit: number, resetAt: Date, now: Date): { level: QuotaLevel; pct: number; jobsLeft: number; text: string | null } {
  void now;
  const u = nonNeg(used);
  const l = nonNeg(limit);
  const pct = l <= 0 ? 100 : Math.floor((u * 100) / l);
  const jobsLeft = Math.max(0, l - u);
  const reset = thaiDayMonth(resetAt);
  if (pct >= 100) {
    return { level: "exhausted", pct, jobsLeft, text: `โควตางานเดือนนี้หมดแล้ว (เหลือ ${jobsLeft} งาน) · เริ่มใหม่ ${reset} · งานที่รออนุมัติยังอนุมัติได้` };
  }
  if (pct >= 95) {
    return { level: "warn95", pct, jobsLeft, text: `ใช้โควตางานเดือนนี้ไปแล้ว ${pct}% · เหลือ ${jobsLeft} งาน · เริ่มใหม่ ${reset}` };
  }
  if (pct >= 80) {
    return { level: "warn80", pct, jobsLeft, text: `ใช้โควตางานเดือนนี้ไปแล้ว ${pct}% · เหลือ ${jobsLeft} งาน · เริ่มใหม่ ${reset}` };
  }
  return { level: "ok", pct, jobsLeft, text: null };
}

/** 00:00 เวลาไทยของวันที่ 1 เดือนถัดไป (เป็นเวลา UTC จริง = 17:00 ของวันสุดท้ายของเดือนแบบ UTC) */
export function nextResetBangkok(now: Date): Date {
  const p = bkkParts(now);
  // Date.UTC จัดการเดือน 12 → ปีถัดไป และชั่วโมงติดลบ (00:00 BKK = −7 ชม. UTC) ให้เอง
  return new Date(Date.UTC(p.y, p.mo + 1, 1, -7, 0, 0, 0));
}

/** "YYYY-MM" ของเดือนไทยที่ครอบ `now` — กุญแจของ `AiJobCounter.month` */
export function monthKeyBangkok(now: Date): string {
  const p = bkkParts(now);
  return `${p.y}-${String(p.mo + 1).padStart(2, "0")}`;
}
