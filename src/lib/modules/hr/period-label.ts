// HR VIS-5a ▸ period / date labels for screens: th "ก.ย. 2569" (Buddhist year, month names = hr.self.m like self-ui) · en "Sep 2026" — no ISO YYYY-MM on screen ◂
//   pure: month names come from the message files (no literal Thai here) · unknown input is returned as is
import th from "@/messages/th/common.json";
import en from "@/messages/en/common.json";

type Lang = "th" | "en";
const MONTHS: Record<Lang, Record<string, string>> = { th: th.hr.self.m, en: en.hr.self.m };
const langOf = (locale: string | null | undefined): Lang => (String(locale ?? "").toLowerCase().startsWith("en") ? "en" : "th");
const yearOf = (y: number, lang: Lang) => (lang === "th" ? y + 543 : y);

/** "2026-09" → th "ก.ย. 2569" · en "Sep 2026" */
export function periodLabel(key: string, locale: string): string {
  const m = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(String(key ?? ""));
  if (!m) return String(key ?? "");
  const lang = langOf(locale);
  return `${MONTHS[lang][`m${Number(m[2])}`]} ${yearOf(Number(m[1]), lang)}`;
}

/** "2026-09-28" (or a Date, read as a Bangkok calendar day) → th "28 ก.ย. 2569" · en "28 Sep 2026" */
export function dayLabel(day: string | Date | null | undefined, locale: string): string {
  const key = day instanceof Date ? (Number.isNaN(day.getTime()) ? "" : new Date(day.getTime() + 7 * 3_600_000).toISOString().slice(0, 10)) : String(day ?? "");
  const m = /^(\d{4})-(0[1-9]|1[0-2])-(\d{2})$/.exec(key);
  if (!m) return key;
  const lang = langOf(locale);
  return `${Number(m[3])} ${MONTHS[lang][`m${Number(m[2])}`]} ${yearOf(Number(m[1]), lang)}`;
}
