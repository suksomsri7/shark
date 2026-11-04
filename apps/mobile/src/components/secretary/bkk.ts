// เวลาไทย (Asia/Bangkok · UTC+7 ไม่มี DST) สำหรับจอตั้งค่า — เลื่อน +7 ชม. แล้วอ่าน getUTC* (ไม่พึ่งเขตเวลาของเครื่อง · COMMON §A.11)
const BKK_MS = 7 * 3600_000;
const pad = (n: number) => String(n).padStart(2, "0");

function shift(v: string | number): Date | null {
  const ms = typeof v === "number" ? v : Date.parse(v);
  return Number.isFinite(ms) ? new Date(ms + BKK_MS) : null;
}

/** "HH:MM" เวลาไทย · ค่าเสีย = "" */
export function hhmmBkk(iso: string | null | undefined): string {
  const d = iso ? shift(iso) : null;
  return d ? `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}` : "";
}

/** "YYYY-MM-DD" วันไทยของเวลา ms (ใช้กับ ?day= ของ GET log) */
export function dayBkk(ms: number): string {
  const d = shift(ms);
  return d ? `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}` : "";
}

/** วัน/เดือนไทย { date, month(1..12) } · ค่าเสีย = null */
export function dateBkk(iso: string | null | undefined): { date: number; month: number } | null {
  const d = iso ? shift(iso) : null;
  return d ? { date: d.getUTCDate(), month: d.getUTCMonth() + 1 } : null;
}

/** จำนวนวันไทยจาก now ถึง iso (ปัดขึ้น · อดีต = 0) */
export function daysUntil(iso: string | null | undefined, nowMs: number): number {
  const ms = iso ? Date.parse(iso) : NaN;
  if (!Number.isFinite(ms)) return 0;
  const day = (x: number) => Math.floor((x + BKK_MS) / 86_400_000);
  return Math.max(0, day(ms) - day(nowMs));
}

/** สตางค์ → บาทแบบมีจุลภาค (ไม่มีทศนิยม) */
export function bahtText(satang: number | null | undefined): string {
  const b = Math.round((Number(satang) || 0) / 100);
  return b.toLocaleString("en-US");
}
