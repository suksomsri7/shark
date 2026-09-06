"use client";

// ThemeRoot — วางโทเคนธีมของร้านไว้ที่ราก `:root` (B3 · สัญญา ledger/BRANDING-RUN.md §B3)
//
// 🔴 ที่เดียวในระบบที่ "ตั้งสี" — ทุกคอมโพเนนต์อ่านผ่าน var เท่านั้น (ห้ามรับสีเป็น prop ไล่ทีละหน้า)
//    เปลี่ยนธีมของร้าน = เปลี่ยน 7 ตัวแปรที่นี่ที่เดียว แล้วทั้งแอปตามทันที
//
// 🔴 ทำไมเป็น <style> ที่เรนเดอร์จากเซิร์ฟเวอร์ ไม่ใช่ useEffect อย่างเดียว:
//    useEffect ทำงานหลังเพนต์แรก ⇒ คนจะเห็นสีปริยาย (น้ำเงิน) แวบหนึ่งก่อนเปลี่ยนเป็นสีร้าน (กะพริบ)
//    · กฎที่ "ไม่มี @layer" ชนะ utility/theme layer ของ Tailwind v4 เสมอ ⇒ ทับค่าปริยายใน globals.css ได้
//
// 🔴 `?theme=preview` = โหมดดูตัวอย่างเต็มจอจากหน้าตั้งค่า (B2 กด "ดูตัวอย่างเต็มจอ"):
//    หน้าตั้งค่าเขียนโทเคนที่ "ยังไม่บันทึก" ลง sessionStorage["shark:branding:preview"] แล้วเปิดแท็บใหม่
//    ⇒ เห็นเฉพาะแท็บนั้น ของคนกดคนเดียว ไม่แตะ DB และไม่กระทบเพื่อนร่วมร้านเลย
//    (sessionStorage ถูกก๊อปให้แท็บใหม่ที่เปิดด้วย window.open จาก origin เดียวกันโดยเบราว์เซอร์)

import { useEffect, useState } from "react";

export type ThemeTokens = {
  accent: string;
  accentFg: string;
  accentSoft: string;
  navBg: string;
  navFg: string;
  navFg2: string;
  navOn: string;
};

/** คีย์ sessionStorage ของโหมดดูตัวอย่าง — หน้าตั้งค่า (BrandingSettings) เป็นคนเขียน */
export const BRANDING_PREVIEW_KEY = "shark:branding:preview";

/** ชื่อ CSS variable ต่อโทเคน — ทะเบียนเดียว (globals.css ประกาศค่าปริยายของชุดเดียวกันนี้) */
const CSS_VARS: readonly (readonly [keyof ThemeTokens, string])[] = [
  ["accent", "--color-accent"],
  ["accentFg", "--color-accent-fg"],
  ["accentSoft", "--color-accent-soft"],
  ["navBg", "--nav-bg"],
  ["navFg", "--nav-fg"],
  ["navFg2", "--nav-fg2"],
  ["navOn", "--nav-on"],
];

// ค่าที่จะถูกยัดลงใน <style> ต้องไม่มีอักขระที่ "ปิดกฎ CSS" ได้ (กันฉีด CSS ผ่านค่าที่หลุด validate)
// ของจริงเป็น #rrggbb / rgba(...) ที่ service คำนวณเอง — ด่านนี้คือกันวันที่มีใครเปิดช่องกรอกอิสระ
const UNSAFE_CSS = /[<>;{}()"'\\]|url|expression|import/gi;
function safeCss(value: string, fallback: string): string {
  const v = (value ?? "").trim();
  if (!v) return fallback;
  // rgba(...) ปลอดภัยและจำเป็น — อนุญาตเฉพาะรูปแบบตัวเลขล้วน
  if (/^rgba?\(\s*[\d.]+\s*,\s*[\d.]+\s*,\s*[\d.]+\s*(,\s*[\d.]+\s*)?\)$/.test(v)) return v;
  const cleaned = v.replace(UNSAFE_CSS, "");
  return cleaned || fallback;
}

function cssBlock(tokens: ThemeTokens): string {
  const lines = CSS_VARS.map(([key, name]) => `${name}: ${safeCss(tokens[key], "inherit")};`);
  return `:root{${lines.join("")}}`;
}

/** อ่านโทเคนพรีวิวจาก sessionStorage — รูปไม่ครบ/พัง = ไม่พรีวิว (ห้ามทำหน้าพัง) */
function readPreviewTokens(): ThemeTokens | null {
  try {
    const raw = window.sessionStorage.getItem(BRANDING_PREVIEW_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const src = parsed as Record<string, unknown>;
    const out: Partial<ThemeTokens> = {};
    for (const [key] of CSS_VARS) {
      const v = src[key];
      if (typeof v !== "string" || !v.trim()) return null;
      out[key] = v;
    }
    return out as ThemeTokens;
  } catch {
    return null;
  }
}

export function ThemeRoot({ tokens }: { tokens: ThemeTokens }) {
  // โทเคนพรีวิวถูกตั้งหลัง mount เท่านั้น (sessionStorage อ่านฝั่งเซิร์ฟเวอร์ไม่ได้) ⇒ SSR = ธีมจริงเสมอ
  const [preview, setPreview] = useState<ThemeTokens | null>(null);

  useEffect(() => {
    const isPreview = new URLSearchParams(window.location.search).get("theme") === "preview";
    if (!isPreview) return;
    setPreview(readPreviewTokens());
  }, []);

  const active = preview ?? tokens;

  return (
    <style
      data-qc="theme-root"
      // ไม่ใช่ข้อความจากผู้ใช้: ทุกค่าเดินผ่าน safeCss() ด้านบนก่อนเสมอ
      dangerouslySetInnerHTML={{ __html: cssBlock(active) }}
    />
  );
}

export default ThemeRoot;
