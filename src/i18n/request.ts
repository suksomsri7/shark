import { getRequestConfig } from "next-intl/server";
import { cookies } from "next/headers";
import { defaultLocale, isLocale, LOCALE_COOKIE } from "./config";

// next-intl v4 — โหมดไม่ prefix URL (locale จาก cookie/user setting)
// messages แยกไฟล์ต่อโมดูลได้ (messages/<locale>/<module>.json) — Stage A ใช้ common.json
export default getRequestConfig(async () => {
  const store = await cookies();
  const cookieLocale = store.get(LOCALE_COOKIE)?.value;
  const locale = isLocale(cookieLocale) ? cookieLocale : defaultLocale;
  const messages = (await import(`../messages/${locale}/common.json`)).default;
  return { locale, messages };
});
