// วัน/เวลาของปฏิทินเลขา (CAL2.x) — ฟังก์ชันบริสุทธิ์ · เวลาไทย UTC+7 คงที่ (ไม่พึ่งเขตเวลาของเครื่อง · R-CAL-10 ปี พ.ศ. ปัก BKK)
// วัน = "YYYY-MM-DD" (วันไทย) · เดือน = "YYYY-MM" · เวลา = ISO UTC (ตามสัญญา docs/modules/32-secretary-calendar.md §8)
export type CalLang = "th" | "en";

const BKK_MS = 7 * 3600_000;
const DAY_MS = 86_400_000;
const pad = (n: number) => String(n).padStart(2, "0");

const TH_WD = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];
const EN_WD = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const TH_WD_FULL = ["อาทิตย์", "จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์"];
const EN_WD_FULL = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const TH_MONTH = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
const TH_MON = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
const EN_MONTH = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const EN_MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "YYYY-MM-DD" ถูกรูป */
export function isDay(v: unknown): v is string {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(dayStartMs(v));
}

/** วันไทยของเวลา ms */
export function dayOfMs(ms: number): string {
  const d = new Date(ms + BKK_MS);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}
/** วันไทยของ ISO · ค่าเสีย = "" */
export function dayOfIso(iso: string | null | undefined): string {
  const ms = iso ? Date.parse(iso) : NaN;
  return Number.isFinite(ms) ? dayOfMs(ms) : "";
}

/** เที่ยงคืนไทยของวันนั้น (ms UTC) */
export function dayStartMs(day: string): number {
  const [y, m, d] = day.split("-").map(Number);
  return Date.UTC(y, (m ?? 1) - 1, d ?? 1) - BKK_MS;
}

export function addDays(day: string, n: number): string {
  return dayOfMs(dayStartMs(day) + n * DAY_MS + 12 * 3600_000);
}

/** 0 = อาทิตย์ … 6 = เสาร์ */
export function weekdayOf(day: string): number {
  return new Date(dayStartMs(day) + BKK_MS).getUTCDay();
}

/** วันอาทิตย์ต้นสัปดาห์ของวันนั้น */
export function weekStart(day: string): string {
  return addDays(day, -weekdayOf(day));
}
/** 7 วัน อา–ส ของสัปดาห์ที่มีวันนั้น */
export function weekDays(day: string): string[] {
  const s = weekStart(day);
  return Array.from({ length: 7 }, (_, i) => addDays(s, i));
}

export const ymOf = (day: string) => day.slice(0, 7);
export function addMonths(ym: string, n: number): string {
  const [y, m] = ym.split("-").map(Number);
  const t = y * 12 + (m - 1) + n;
  return `${Math.floor(t / 12)}-${pad((t % 12) + 1)}`;
}
export function daysInMonth(ym: string): number {
  const [y, m] = ym.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}
/** ช่องตารางเดือน เริ่มอาทิตย์ (null = ช่องว่างหน้าวันที่ 1) · ไม่เติมช่องท้าย */
export function monthCells(ym: string): (string | null)[] {
  const first = `${ym}-01`;
  const lead = weekdayOf(first);
  const n = daysInMonth(ym);
  return [...Array.from({ length: lead }, () => null), ...Array.from({ length: n }, (_, i) => `${ym}-${pad(i + 1)}`)];
}

export const dateNum = (day: string) => Number(day.slice(8, 10));

export function wdShort(day: string, lang: CalLang): string {
  return (lang === "en" ? EN_WD : TH_WD)[weekdayOf(day)];
}
export function wdShortOf(i: number, lang: CalLang): string {
  return (lang === "en" ? EN_WD : TH_WD)[i];
}
/** ชื่อเดือนเต็ม ("พฤศจิกายน") */
export function monthName(ym: string, lang: CalLang): string {
  const m = Number(ym.slice(5, 7)) - 1;
  return (lang === "en" ? EN_MONTH : TH_MONTH)[m];
}
/** ปีไทย พ.ศ. (th) / ค.ศ. (en) */
export function yearLabel(ym: string, lang: CalLang): string {
  const y = Number(ym.slice(0, 4));
  return String(lang === "en" ? y : y + 543);
}
/** "พฤศจิกายน 2569" */
export function monthYear(ym: string, lang: CalLang): string {
  return `${monthName(ym, lang)} ${yearLabel(ym, lang)}`;
}
/** "จ. 16 พ.ย." / "Mon 16 Nov" */
export function shortDate(day: string, lang: CalLang): string {
  const m = Number(day.slice(5, 7)) - 1;
  if (lang === "en") return `${EN_WD_FULL[weekdayOf(day)].slice(0, 3)} ${dateNum(day)} ${EN_MON[m]}`;
  return `${TH_WD[weekdayOf(day)]}. ${dateNum(day)} ${TH_MON[m]}`;
}
/** "วันจันทร์ 16 พฤศจิกายน" */
export function longDate(day: string, lang: CalLang): string {
  const ym = ymOf(day);
  if (lang === "en") return `${EN_WD_FULL[weekdayOf(day)]} ${dateNum(day)} ${monthName(ym, lang)}`;
  return `วัน${TH_WD_FULL[weekdayOf(day)]} ${dateNum(day)} ${monthName(ym, lang)}`;
}

/** "HH:MM" เวลาไทย · ค่าเสีย = "" */
export function hhmm(iso: string | null | undefined): string {
  const ms = iso ? Date.parse(iso) : NaN;
  if (!Number.isFinite(ms)) return "";
  const d = new Date(ms + BKK_MS);
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}
/** นาทีของวัน 0..1439 → "HH:MM" */
export function minuteText(min: number): string {
  const m = ((Math.round(min) % 1440) + 1440) % 1440;
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
}
/** ISO UTC ของ วัน+เวลาไทย */
export function isoAt(day: string, hour: number, minute = 0): string {
  return new Date(dayStartMs(day) + (hour * 60 + minute) * 60_000).toISOString();
}

/** ระยะเวลาแบบสั้น "1 ชม." / "30 นาที" / "1 ชม. 30 นาที" · ≤ 0 = "" */
export function durationText(startIso: string, endIso: string | null | undefined, lang: CalLang): string {
  const a = Date.parse(startIso);
  const b = endIso ? Date.parse(endIso) : NaN;
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) return "";
  const min = Math.round((b - a) / 60_000);
  const h = Math.floor(min / 60);
  const m = min % 60;
  const H = lang === "en" ? "h" : " ชม.";
  const M = lang === "en" ? "m" : " นาที";
  if (h && m) return `${h}${H} ${m}${M}`;
  return h ? `${h}${H}` : `${m}${M}`;
}

/** สตางค์ → "฿18,400" (ไม่มีทศนิยม) */
export function baht(satang: number | null | undefined): string {
  return `฿${Math.round((Number(satang) || 0) / 100).toLocaleString("en-US")}`;
}
