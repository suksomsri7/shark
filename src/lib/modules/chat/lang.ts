// lang.ts — รหัสภาษาของระบบแชท (pure · SEC S3a.6 R-Z61) — จุดเดียวที่ normalize รหัสภาษา (zh ≡ cn) · ใช้ร่วม translate · ai-suggest · DTO แอป

/** ชื่อภาษาเป็นภาษาอังกฤษ — ใช้ในคำสั่งของโมเดล (โมเดลเข้าใจชื่อเต็มดีกว่ารหัส 2 ตัวอักษร) */
export const LANG_NAME: Record<string, string> = {
  th: "Thai",
  en: "English",
  cn: "Simplified Chinese",
  zh: "Simplified Chinese",
  ja: "Japanese",
  ko: "Korean",
  de: "German",
  fr: "French",
  ru: "Russian",
  es: "Spanish",
  it: "Italian",
  vi: "Vietnamese",
  id: "Indonesian",
  ms: "Malay",
  my: "Burmese",
  km: "Khmer",
  ar: "Arabic",
  he: "Hebrew",
  pt: "Portuguese",
  nl: "Dutch",
};

/** SEC S3a.6 ▸ R-Z61 M1: ชื่อแทนของภาษา → รหัสเดียวของระบบ (เว็บ/`detectLang` ใช้ `cn` สำหรับภาษาจีน) — จุดเดียวที่แปลงรหัส ◂ */
const LANG_ALIAS: Record<string, string> = { zh: "cn" };

export function normalizeLang(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const v = value.trim().toLowerCase().split(/[-_]/)[0];
  if (!v || v.length < 2 || v.length > 8) return null;
  return LANG_ALIAS[v] ?? v;
}

/** SEC S3a.6 ▸ R-Z61: รหัสภาษาที่ระบบแปลรู้จัก (คีย์ของ LANG_NAME หลัง normalize) */
export function isKnownLang(value: unknown): boolean {
  const v = normalizeLang(value);
  return !!v && Object.prototype.hasOwnProperty.call(LANG_NAME, v);
}

