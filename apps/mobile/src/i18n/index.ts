// i18n ของจอเลขา AI (ใบ S2.1) — `useT()` คืน `t(key, vars?)` · ภาษา th | en
// ลำดับเลือกภาษา: AiSecretary.languages[0] (จาก GET /api/mobile/secretary/me ผ่าน src/api/secretary.ts → setLang) ·
// ก่อนได้ค่านั้น = ภาษาเครื่อง (Intl/navigator · ไม่มี expo-localization ในแอปและห้ามติดตั้งเพิ่ม) · ภาษาอื่น ⇒ ไทย
// จอ 1.0 ไม่ใช้โมดูลนี้
import { useCallback, useSyncExternalStore } from "react";
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

let lang: Lang = deviceLang();
const listeners = new Set<() => void>();

export function getLang(): Lang {
  return lang;
}

export function setLang(next: Lang): void {
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
