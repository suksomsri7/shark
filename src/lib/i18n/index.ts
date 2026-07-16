// i18n กลาง (WO-0034) — resolve locale + ตัวแปล t() แบบไม่พึ่ง DB
// ใช้ทั้งฝั่ง server (อ่าน cookie "lang") และ client (public-booking)
import { DICT, type Locale } from "./dict";

export type { Locale };

/** "en" → en · อื่น ๆ / null / undefined → th (default ไทย) */
export function resolveLocale(input?: string | null): Locale {
  return input === "en" ? "en" : "th";
}

/** alias ให้หน้า server เรียกจากค่า cookie ได้อ่านง่าย */
export const getLocaleFromCookie = resolveLocale;

/**
 * สร้างฟังก์ชันแปลตาม locale
 * - key ไม่มีใน locale → fallback ไป th → ไม่มีทั้งคู่ → คืน key ตรง ๆ (ไม่ throw)
 * - interpolation: "สวัสดี {name}" + {name:"เอ"} → "สวัสดี เอ" · ตัวแปรที่ไม่ส่ง = คงรูป {var}
 */
export function makeT(
  locale: string,
): (key: string, vars?: Record<string, string | number>) => string {
  const loc = resolveLocale(locale);
  return (key, vars) => {
    const raw = DICT[loc][key] ?? DICT.th[key] ?? key;
    if (!vars) return raw;
    return raw.replace(/\{(\w+)\}/g, (m, name: string) =>
      name in vars ? String(vars[name]) : m,
    );
  };
}
