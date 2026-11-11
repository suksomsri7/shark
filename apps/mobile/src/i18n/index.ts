// i18n ของจอเลขา AI (ใบ S2.1) — `useT()` คืน `t(key, vars?)` · ภาษา th | en
// ลำดับเลือกภาษา: AiSecretary.languages[0] (จาก GET /api/mobile/secretary/me ผ่าน src/api/secretary.ts → setLang) ·
// ก่อนได้ค่านั้น = ภาษาเครื่อง (Intl/navigator · ไม่มี expo-localization ในแอปและห้ามติดตั้งเพิ่ม) · ภาษาอื่น ⇒ ไทย
// จอ 1.0 ไม่ใช้โมดูลนี้
// S2.13 (Q-9 ภาษากระพริบ): ภาษาที่ได้จากเลขาล่าสุดเก็บในเครื่อง คีย์ "shark_lang" (เว็บ localStorage อ่านทันที · มือถือ SecureStore แบบ async)
//   เปิดแอปครั้งถัดไป = ใช้ค่าที่เก็บก่อน (ไม่วาดภาษาเครื่องแล้วค่อยสลับ) · ค่าจากเซิร์ฟเวอร์ยังชนะเสมอเมื่อมาถึง
import { useCallback, useSyncExternalStore } from "react";
import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";
import th, { type I18nKey } from "./th";
import en from "./en";

export type Lang = "th" | "en";
export type { I18nKey };
export type Vars = Record<string, string | number>;

const DICT: Record<Lang, Record<I18nKey, string>> = { th, en };

/** ค่าภาษาใด ๆ (เช่น "en-US", "th", "cn") → th | en · ไม่รู้จัก = null */
export function langFrom(v: unknown): Lang | null {
  if (typeof v !== "string") return null;
  const s = v.toLowerCase();
  if (s.startsWith("th")) return "th";
  if (s.startsWith("en")) return "en";
  return null;
}

function deviceLang(): Lang {
  try {
    const loc = Intl.DateTimeFormat().resolvedOptions().locale;
    const nav = typeof navigator !== "undefined" ? (navigator as { language?: string }).language : undefined;
    return langFrom(nav) ?? langFrom(loc) ?? "th";
  } catch {
    return "th";
  }
}

const LANG_KEY = "shark_lang";
function cachedWebLang(): Lang | null {
  try {
    return typeof localStorage === "undefined" ? null : langFrom(localStorage.getItem(LANG_KEY));
  } catch {
    return null;
  }
}

let lang: Lang = (Platform.OS === "web" ? cachedWebLang() : null) ?? deviceLang();
const listeners = new Set<() => void>();
/** ผู้ใช้/เซิร์ฟเวอร์ตั้งภาษาแล้วในรอบนี้ ⇒ ค่าที่อ่านจากเครื่องแบบ async มาทีหลังห้ามทับ */
let langSetThisRun = false;

if (Platform.OS !== "web") {
  SecureStore.getItemAsync(LANG_KEY)
    .then((v) => {
      const l = langFrom(v);
      if (l && !langSetThisRun && l !== lang) {
        lang = l;
        listeners.forEach((fn) => fn());
      }
    })
    .catch(() => {});
}

function persistLang(l: Lang): void {
  try {
    if (Platform.OS === "web") {
      if (typeof localStorage !== "undefined") localStorage.setItem(LANG_KEY, l);
    } else {
      void SecureStore.setItemAsync(LANG_KEY, l).catch(() => {});
    }
  } catch {
    // เก็บไม่ได้ = ใช้ในหน่วยความจำต่อ
  }
}

export function getLang(): Lang {
  return lang;
}

export function setLang(next: Lang): void {
  langSetThisRun = true;
  persistLang(next);
  if (next === lang) return;
  lang = next;
  listeners.forEach((l) => l());
}

function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

/** แทน {ชื่อ} ด้วยค่า · คีย์ที่ไม่มีในพจนานุกรม (ไม่ควรเกิด — type กันไว้) = คืนคีย์ */
export function translate(l: Lang, key: I18nKey, vars?: Vars): string {
  const raw = DICT[l][key] ?? DICT.th[key] ?? key;
  if (!vars) return raw;
  return raw.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
}

export function useLang(): Lang {
  return useSyncExternalStore(subscribe, getLang, getLang);
}

export function useT(): (key: I18nKey, vars?: Vars) => string {
  const l = useLang();
  return useCallback((key: I18nKey, vars?: Vars) => translate(l, key, vars), [l]);
}
