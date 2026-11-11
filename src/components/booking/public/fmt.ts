// SVC B.6 — ตัวช่วยแสดงเวลาของหน้าสาธารณะ (ไม่ใช้นาฬิกาเครื่อง · Intl + timeZone Asia/Bangkok)
const TZ = "Asia/Bangkok";

/** HH:MM เวลาไทย */
export function hhmm(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || !Number.isFinite(ms)) return "--:--";
  return new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: TZ }).format(new Date(ms));
}

/** "ส. 31 ต.ค." จาก YYYY-MM-DD */
export function dayLabel(dayStr: string): string {
  const [y, m, d] = dayStr.split("-").map(Number);
  if (!y || !m || !d) return dayStr;
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("th-TH", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
}

/** "~50 นาที" · "~1 ชม. 5 นาที" */
export function waitLabel(min: number | null | undefined): string {
  if (min === null || min === undefined) return "—";
  if (min < 60) return `~${min} นาที`;
  const h = Math.floor(min / 60);
  const r = min % 60;
  return `~${h} ชม.${r ? ` ${r} นาที` : ""}`;
}

export const baht = (satang: number) => `฿${Math.round(satang / 100).toLocaleString("th-TH")}`;
