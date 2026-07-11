// i18n: ไทย (default) + อังกฤษ — locale เก็บต่อ user/cookie (ไม่ prefix URL)
export const locales = ["th", "en"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "th";
export const LOCALE_COOKIE = "LOCALE";

export function isLocale(v: string | undefined | null): v is Locale {
  return !!v && (locales as readonly string[]).includes(v);
}
