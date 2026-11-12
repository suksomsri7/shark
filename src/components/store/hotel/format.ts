// SVC H.8 ▸ ตัวจัดรูปของหน้าจองโรงแรม (pure · ใช้ได้ทั้ง server/client · ไม่ import ฝั่งเซิร์ฟเวอร์)
export type WebLocale = "th" | "en";

/** ฿1,490 (ไม่มีสตางค์ถ้าเต็มบาท) · showSatang = 1,490.00 */
export function baht(satang: number, locale: WebLocale, showSatang = false): string {
  const v = (satang / 100).toLocaleString(locale === "en" ? "en-GB" : "th-TH", {
    minimumFractionDigits: showSatang ? 2 : 0,
    maximumFractionDigits: 2,
  });
  return v;
}

/** "ศ. 13 พ.ย." / "Fri 13 Nov" จาก YYYY-MM-DD (อ่านเป็นวันที่ล้วน ไม่ขึ้นกับเขตเวลาเครื่อง) */
export function dayLabel(ymd: string, locale: WebLocale, withYear = false): string {
  return new Date(`${ymd}T00:00:00.000Z`).toLocaleDateString(locale === "en" ? "en-GB" : "th-TH", {
    weekday: "short",
    day: "numeric",
    month: "short",
    ...(withYear ? { year: "numeric" } : {}),
    timeZone: "UTC",
  });
}

/** วันย่อ "ศ." / "Fri" */
export function weekdayShort(ymd: string, locale: WebLocale): string {
  return new Date(`${ymd}T00:00:00.000Z`).toLocaleDateString(locale === "en" ? "en-GB" : "th-TH", { weekday: "short", timeZone: "UTC" });
}

/** "13–15 พ.ย." */
export function rangeLabel(checkIn: string, checkOut: string, locale: WebLocale): string {
  const loc = locale === "en" ? "en-GB" : "th-TH";
  const a = new Date(`${checkIn}T00:00:00.000Z`);
  const b = new Date(`${checkOut}T00:00:00.000Z`);
  const month = b.toLocaleDateString(loc, { month: "short", timeZone: "UTC" });
  return a.getUTCMonth() === b.getUTCMonth()
    ? `${a.getUTCDate()}–${b.getUTCDate()} ${month}`
    : `${a.toLocaleDateString(loc, { day: "numeric", month: "short", timeZone: "UTC" })} – ${b.toLocaleDateString(loc, { day: "numeric", month: "short", timeZone: "UTC" })}`;
}

/** เวลาไทย HH:MM จาก ISO */
export function bkkTime(iso: string, locale: WebLocale): string {
  return new Date(iso).toLocaleTimeString(locale === "en" ? "en-GB" : "th-TH", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Bangkok" });
}

/** ภาษาของหน้า: ?lang=en|th ชนะ cookie "lang" · อื่น ๆ = ไทย */
export function pickLocale(queryLang: string | string[] | undefined, cookieLang: string | undefined): WebLocale {
  const q = typeof queryLang === "string" ? queryLang : "";
  if (q === "en" || q === "th") return q;
  return cookieLang === "en" ? "en" : "th";
}

/** YYYY-MM-DD + n วัน (UTC ล้วน) */
export function addDays(ymd: string, n: number): string {
  const d = new Date(`${ymd}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export const isYmdStr = (s: unknown): s is string => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
