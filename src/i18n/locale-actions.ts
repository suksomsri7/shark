"use server";
// locale-actions.ts — server action ของตัวสลับภาษาแอป TH | EN (POS P1.18 S · R12 · CD5)
//
// 🔴 ไฟล์ "use server" export ได้เฉพาะ async function · ไม่เขียน DB · ค่าผิด = {ok:false, code VALIDATION} ไม่โยน
// 🔴 ตั้งคุกกี้ตาม nextLocaleCookies (LOCALE + lang) — client อ่าน lang ได้ (httpOnly false แบบ LanguageSwitcher เดิม) · secure ใน production

import { cookies } from "next/headers";
import { nextLocaleCookies, type NextLocaleCookiesResult } from "./locale-cookies";

export async function setUiLocaleAction(args: { locale: string }): Promise<NextLocaleCookiesResult | { ok: false; code: "UNKNOWN"; message: string }> {
  try {
    const r = nextLocaleCookies(args?.locale);
    if (!r.ok) return r;
    const store = await cookies();
    for (const c of r.cookies) store.set(c.name, c.value, { path: c.path, maxAge: c.maxAge, sameSite: c.sameSite, httpOnly: false, secure: process.env.NODE_ENV === "production" });
    return r;
  } catch (e) {
    console.error("[i18n/locale-actions] set", e);
    return { ok: false, code: "UNKNOWN", message: "ตั้งภาษาไม่สำเร็จ — ลองอีกครั้ง" };
  }
}
