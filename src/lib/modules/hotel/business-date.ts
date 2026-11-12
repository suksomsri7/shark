// SVC H.7 ▸ business date ต่อหน่วยโรงแรม (pure · ไม่มี I/O · ไม่มี directive) — ใบสั่ง h.7 §0 · §1 · SVC-HOTEL-PLAN §2 ข้อ 10–11
//   • วันทางธุรกิจ (business date) ของร้าน = วันที่ตามเวลาของร้าน (`unit.settings.timezone` · ค่าเริ่ม Asia/Bangkok)
//     Bangkok ⇒ bkkYmd (สูตรเดียวกับทั้งระบบ) · timezone อื่น ⇒ Intl.DateTimeFormat (รองรับ DST) · tz ว่าง/ผิด ⇒ ถอยเป็น Bangkok (ไม่ throw)
//   • ปิดวันได้เฉพาะวันที่ < วันนี้ของร้าน · ถัดจากวันที่ปิดล่าสุด = +1 วัน (นับบนวันปฏิทิน UTC ล้วน ไม่อ่านชิ้นเวลาเครื่อง)
//   • isAuditDue = cron ถึงเวลาปิดวันของหน่วยแล้วหรือยัง: เวลาร้าน ≥ nightAuditTime และวันถัดจากวันปิดล่าสุด < วันนี้ของร้าน
//     (ไม่เคยปิด ⇒ ถึงเวลาเมื่อเวลาร้าน ≥ nightAuditTime — ปิด "เมื่อวาน" ของร้าน)
//   • service.ts (P1) todayBkk/parseDate เรียกไฟล์นี้ (พฤติกรรม Bangkok เดิม)
import { bkkParts, bkkYmd } from "@/lib/core/quiet-hours";
import { addDaysYmd, isYmd } from "./pricing";

export const DEFAULT_TIMEZONE = "Asia/Bangkok";
const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;

type LocalParts = { ymd: string; minutes: number };

/** แคช formatter ต่อ timezone (สร้าง Intl ซ้ำแพง) · tz ที่ Intl ไม่รู้จัก = null */
const FORMATTERS = new Map<string, Intl.DateTimeFormat | null>();
function formatterOf(tz: string): Intl.DateTimeFormat | null {
  if (FORMATTERS.has(tz)) return FORMATTERS.get(tz) ?? null;
  let f: Intl.DateTimeFormat | null = null;
  try {
    f = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  } catch {
    f = null;
  }
  FORMATTERS.set(tz, f);
  return f;
}

/** timezone ที่ใช้จริง — ว่าง/ไม่ใช่สตริง/Intl ไม่รู้จัก ⇒ Asia/Bangkok */
export function normalizeTimezone(tz: unknown): string {
  if (typeof tz !== "string" || !tz.trim()) return DEFAULT_TIMEZONE;
  const t = tz.trim();
  if (t === DEFAULT_TIMEZONE) return t;
  return formatterOf(t) ? t : DEFAULT_TIMEZONE;
}

/** วันที่ + นาทีของวัน ณ เวลาร้าน */
function localParts(tz: unknown, now: Date): LocalParts {
  const zone = normalizeTimezone(tz);
  if (zone === DEFAULT_TIMEZONE) {
    const p = bkkParts(now);
    return { ymd: bkkYmd(now), minutes: p.h * 60 + p.mi };
  }
  const f = formatterOf(zone);
  if (!f) {
    const p = bkkParts(now);
    return { ymd: bkkYmd(now), minutes: p.h * 60 + p.mi };
  }
  const parts = f.formatToParts(now);
  const get = (type: string) => parts.find((x) => x.type === type)?.value ?? "";
  const hour = Number(get("hour")) % 24;
  return { ymd: `${get("year")}-${get("month")}-${get("day")}`, minutes: hour * 60 + Number(get("minute")) };
}

/** วันทางธุรกิจ ("YYYY-MM-DD") ของร้านใน timezone `unitTz` ณ `now` (ไม่ส่ง = ตอนนี้) */
export function businessDateOf(unitTz?: string | null, now: Date = new Date()): string {
  return localParts(unitTz, now).ymd;
}

/** นาทีของวัน (0–1439) ณ เวลาร้าน */
export function localMinutesOf(unitTz: string | null | undefined, now: Date): number {
  return localParts(unitTz, now).minutes;
}

/** ค่าจาก @db.Date (เที่ยงคืน UTC) หรือ "YYYY-MM-DD" ⇒ "YYYY-MM-DD" */
export function ymdOfDate(d: Date | string): string {
  return typeof d === "string" ? d.slice(0, 10) : d.toISOString().slice(0, 10);
}

/** วันถัดจากวันที่ปิดล่าสุด (รับ "YYYY-MM-DD" หรือ Date จาก @db.Date) */
export function nextBusinessDate(lastClosed: string | Date): string {
  return addDaysYmd(ymdOfDate(lastClosed), 1);
}

/** "HH:MM" ⇒ นาทีของวัน · ผิดรูป ⇒ 03:00 (ค่าเริ่มของ rooms.hotel.nightAuditTime) */
export function auditTimeMinutes(auditTime: unknown): number {
  const m = typeof auditTime === "string" ? HHMM.exec(auditTime) : null;
  return m ? Number(m[1]) * 60 + Number(m[2]) : 3 * 60;
}

/**
 * ถึงเวลาปิดวันอัตโนมัติไหม (cron):
 *   เวลาร้าน ≥ auditTime  และ  (ไม่เคยปิด  หรือ  วันถัดจากวันปิดล่าสุด < วันนี้ของร้าน)
 * now = นาฬิกาที่ผู้เรียกส่งเข้า (ไม่อ่านนาฬิกาเครื่อง · มติผู้คุม §9.9)
 */
export function isAuditDue(unitTz: string | null | undefined, auditTime: string | null | undefined, now: Date, lastClosed: string | Date | null | undefined): boolean {
  const lp = localParts(unitTz, now);
  if (lp.minutes < auditTimeMinutes(auditTime)) return false;
  if (lastClosed === null || lastClosed === undefined) return true;
  const last = ymdOfDate(lastClosed);
  if (!isYmd(last)) return false;
  return nextBusinessDate(last) < lp.ymd;
}

/** จำนวนวันแบบรวมหัวท้าย [from, to] (สตริงวันที่ถูกรูปแล้ว) */
export function daysInclusive(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1;
}

/** "YYYY-MM-DD" ⇒ Date เที่ยงคืน UTC (ค่าที่เก็บใน @db.Date) */
export function ymdToDbDate(ymd: string): Date {
  return new Date(`${ymd}T00:00:00.000Z`);
}

/** เวลาจริง (UTC) ของเที่ยงคืนวัน ymd ตามเวลาร้าน — ใช้ทำช่วงคิวรีคอลัมน์ timestamp (createdAt/cancelledAt) ต่อวันของร้าน */
export function zonedDayStart(unitTz: string | null | undefined, ymd: string): Date {
  const base = Date.parse(`${ymd}T00:00:00Z`);
  let t = base;
  for (let i = 0; i < 3; i++) {
    const lp = localParts(unitTz, new Date(t));
    const localAsUtc = Date.parse(`${lp.ymd}T00:00:00Z`) + lp.minutes * 60_000;
    const next = t - (localAsUtc - base);
    if (next === t) break;
    t = next;
  }
  return new Date(t);
}
