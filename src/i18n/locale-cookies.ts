// locale-cookies.ts — ตัวช่วยบริสุทธิ์ของตัวสลับภาษาแอป (POS P1.18 S · R12 · CD5) — ไม่แตะ next/headers / prisma (oracle เรียกตรงได้)
//
// 🔴 ภาษาที่ผู้ใช้เลือก = คุกกี้ 2 ตัวพร้อมกัน: LOCALE (next-intl ของแอป) + lang (พจนานุกรมหน้าร้าน/ใบเสร็จออนไลน์ /r/[token])
//    ⇒ แคชเชียร์ที่สลับเป็น EN เห็น EN ทั้งแอปและใบเสร็จออนไลน์ · ภาษาใบเสร็จที่ "พิมพ์" เป็นค่าตั้งของระบบ POS (receiptLocale) ไม่ใช่ภาษาจอ
// 🔴 ค่าอื่นนอก th/en = {ok:false, code VALIDATION} ไม่โยน
import { LOCALE_COOKIE, type Locale } from "./config";

export const LOCALE_COOKIE_MAX_AGE = 31_536_000; // 1 ปี (วินาที)
/** คุกกี้ภาษาหน้าร้าน (src/lib/i18n · LanguageSwitcher) — ชื่อเดียวกับที่หน้า /r/[token] อ่าน */
export const STOREFRONT_LANG_COOKIE = "lang";

export type LocaleCookie = { name: string; value: Locale; path: "/"; maxAge: number; sameSite: "lax" };
export type NextLocaleCookiesResult = { ok: true; cookies: LocaleCookie[] } | { ok: false; code: "VALIDATION"; message: string };

export function nextLocaleCookies(locale: unknown): NextLocaleCookiesResult {
  if (locale !== "th" && locale !== "en") return { ok: false, code: "VALIDATION", message: "ภาษาต้องเป็นไทยหรืออังกฤษ" };
  const value: Locale = locale;
  const base = { value, path: "/" as const, maxAge: LOCALE_COOKIE_MAX_AGE, sameSite: "lax" as const };
  return { ok: true, cookies: [{ name: LOCALE_COOKIE, ...base }, { name: STOREFRONT_LANG_COOKIE, ...base }] };
}
