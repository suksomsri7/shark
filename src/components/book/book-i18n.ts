// components/book/book-i18n.ts — ข้อความของหน้าจองสาธารณะ (ไทย + อังกฤษ) · RUN TRIPS W1.1a
// pure: อ่าน src/messages/{th,en}/book.json ตรง ๆ — หน้านี้เลือกภาษาจาก ?lang / Accept-Language (ไม่ใช่คุกกี้ภาษาของแอป) จึงไม่ผ่าน next-intl
import th from "@/messages/th/book.json";
import en from "@/messages/en/book.json";
import type { DateNames } from "@/components/trips/trips-shared";

export type BookT = (key: string, vars?: Record<string, string | number>) => string;

type Node = { [k: string]: Node | string };
const TABLES: Record<"th" | "en", Node> = { th, en };

function lookup(table: Node, key: string): string | null {
  let cur: Node | string | undefined = table;
  for (const part of key.split(".")) {
    if (typeof cur !== "object" || cur === null || !Object.prototype.hasOwnProperty.call(cur, part)) return null;
    cur = cur[part];
  }
  return typeof cur === "string" ? cur : null;
}

/** ตัวแปลของภาษานั้น — ภาษาที่ไม่รู้จัก ⇒ ไทย · แทน `{ชื่อ}` · ไม่มีคีย์ ⇒ คืนคีย์ */
export function bookT(locale: unknown): BookT {
  const table = locale === "en" ? TABLES.en : TABLES.th;
  return (key, vars) => {
    const raw = lookup(table, String(key));
    if (raw === null) return String(key);
    if (!vars) return raw;
    return raw.replace(/\{(\w+)\}/g, (m, name: string) => (Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : m));
  };
}

const RANGE7 = [0, 1, 2, 3, 4, 5, 6] as const;
const RANGE12 = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const;
const THAI_YEAR_OFFSET = 543;

/** ชื่อวัน/เดือนแบบย่อของ formatYmd (ไทย = พ.ศ. · อังกฤษ = ค.ศ.) */
export function bookDateNames(locale: unknown): DateNames {
  const t = bookT(locale);
  return { weekdays: RANGE7.map((i) => t(`weekday.${i}`)), months: RANGE12.map((i) => t(`month.${i}`)), yearOffset: locale === "en" ? 0 : THAI_YEAR_OFFSET };
}

/** หัวปฏิทิน "พฤศจิกายน 2569" / "November 2026" จาก YYYY-MM */
export function bookMonthTitle(month: string, locale: unknown): string {
  const m = /^(\d{4})-(\d{2})$/.exec(month);
  if (!m) return month;
  return `${bookT(locale)(`monthLong.${Number(m[2])}`)} ${Number(m[1]) + (locale === "en" ? 0 : THAI_YEAR_OFFSET)}`;
}

/** "+7" / "+5:30" / "-3" จากนาทีที่นำหน้า UTC */
export function bookGmtOffset(offsetMin: number): string {
  const total = Number.isFinite(offsetMin) ? Math.trunc(offsetMin) : 0;
  const abs = Math.abs(total);
  const h = Math.floor(abs / 60);
  const mm = abs % 60;
  return `${total < 0 ? "-" : "+"}${h}${mm ? `:${String(mm).padStart(2, "0")}` : ""}`;
}
