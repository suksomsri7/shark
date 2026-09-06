// public.ts — สไตล์ธีมของ "หน้าสาธารณะ" (หน้าร้าน/ฟอร์มสาธารณะ) จาก PublicBranding เดียว
// ledger/BRANDING-RUN.md §สัญญา B4 · T3
//
// 🔴 ตัวช่วยเดียวที่แปลง PublicBranding → CSSProperties — ห้ามหน้าไหนประกอบ
//    `{ ["--color-accent"]: branding.brandColor }` เอง (เพี้ยนคนละที่ + ลืม accent-fg/soft)
// ไม่มีสีแบรนด์ (ยังไม่ตั้ง หรือ applyStorefront=false) → คืน `{}` (ใช้ค่าปริยายของ CSS)
// ห้ามใส่ค่า null/undefined เป็นค่า CSS var (เบราว์เซอร์บางตัวตีความ "null" เป็นสตริง)

import type { CSSProperties } from "react";
import { pickReadableFg, softOf } from "./color";
import type { PublicBranding } from "./service";

export function publicThemeStyle(branding: PublicBranding): CSSProperties {
  const { brandColor, brandFg } = branding;
  if (!brandColor) return {};
  const accentFg = brandFg || pickReadableFg(brandColor);
  return {
    ["--color-accent" as string]: brandColor,
    ["--color-accent-fg" as string]: accentFg,
    ["--color-accent-soft" as string]: softOf(brandColor),
  } as CSSProperties;
}
