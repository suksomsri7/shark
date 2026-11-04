// i18n ของจอใหม่ (เลขา AI + จอเข้า/สมัคร S2.12) — useT() คืน t(key, vars?) · จอ 1.0 ไม่ใช้ไฟล์นี้
// พจนานุกรม = คีย์แบนราบ ("auth.otp.title") ใน th.ts / en.ts (คีย์ชุดเดียวกันทั้งสองภาษา — ข้อสอบตรวจ)
// ภาษา: ปริยายไทย (แอปเดิมเป็นไทยทั้งหมด) · setLang() ให้จอที่รู้ภาษาของผู้ใช้ (เช่น AiSecretary.languages) ตั้งทับ
// ไม่มีคีย์ในภาษาที่เลือก ⇒ ใช้ไทย ⇒ ไม่มีอีก ⇒ คืนชื่อคีย์ (เห็นชัดตอนตรวจ ไม่เงียบ)
import { useCallback, useSyncExternalStore } from "react";
import { th } from "./th";
import { en } from "./en";

export type Lang = "th" | "en";
const DICTS: Record<Lang, Record<string, string>> = { th, en };

let lang: Lang = "th";
const listeners = new Set<() => void>();

export function getLang(): Lang {
  return lang;
}

export function setLang(next: Lang): void {
  if (next === lang) return;
  lang = next;
  listeners.forEach((l) => l());
}

export type Vars = Record<string, string | number>;

/** แปลคีย์ + แทน {ชื่อ} ด้วย vars */
export function translate(key: string, vars?: Vars, l: Lang = lang): string {
  const s = DICTS[l][key] ?? DICTS.th[key] ?? key;
  return vars ? s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m)) : s;
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

/** ใช้ในจอ: const t = useT(); t("auth.otp.title") */
export function useT(): (key: string, vars?: Vars) => string {
  const l = useSyncExternalStore(subscribe, getLang, getLang);
  return useCallback((key: string, vars?: Vars) => translate(key, vars, l), [l]);
}
