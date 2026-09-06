// color.ts — คณิตศาสตร์ของสีล้วน ๆ (pure · ไม่แตะ DB/env/เครือข่าย)
// ใช้โดย service.ts (คำนวณ brandFg ตอนบันทึก) และหน้าตั้งค่า B2 (กล่อง "ผ่าน AA")
//
// 🔴 ทำไมต้องคำนวณเอง: เจ้าของเลือกสีอะไรก็ได้ (รวมสีอ่อนอย่างเหลือง) — ถ้าปล่อยให้ตัวอักษร
//    เป็นขาวเสมอ ปุ่ม/แถบเมนูจะอ่านไม่ออก ⇒ ระบบเลือกสีตัวอักษร (ขาว/เข้ม) ให้เองจาก
//    อัตราความคมชัด (contrast ratio) ตามสูตร WCAG 2.x
//
// สูตร WCAG 2.x (https://www.w3.org/TR/WCAG21/#dfn-relative-luminance):
//   c' = c/255 ; c_lin = c' ≤ 0.03928 ? c'/12.92 : ((c'+0.055)/1.055)^2.4
//   L   = 0.2126·R_lin + 0.7152·G_lin + 0.0722·B_lin
//   ratio = (L_สว่าง + 0.05) / (L_มืด + 0.05)   → 1..21

/** สีตัวอักษร 2 ตัวเลือกของระบบ (ไม่ใช้ #000 ล้วน — ดำสนิทบนจอสว่างจ้าเกินไป) */
export const FG_LIGHT = "#ffffff" as const;
export const FG_DARK = "#0a0a0a" as const;

export type ReadableFg = typeof FG_LIGHT | typeof FG_DARK;

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

/** true = สตริงเป็น hex 6 หลักพร้อม `#` (รูปแบบเดียวที่ระบบเก็บ) */
export function isHex(s: unknown): boolean {
  return typeof s === "string" && HEX_RE.test(s);
}

/** "#RRGGBB" → [r, g, b] (0..255) · รูปแบบผิด → โยน (ผู้เรียกต้อง isHex ก่อน) */
export function hexToRgb(hex: string): [number, number, number] {
  if (!isHex(hex)) throw new Error(`รหัสสีไม่ถูกต้อง: ${String(hex)} — ต้องเป็นรูปแบบ #RRGGBB`);
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
}

function channelLinear(c255: number): number {
  const c = c255 / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/** ความสว่างสัมพัทธ์ (relative luminance) 0..1 ตาม WCAG 2.x */
export function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex);
  return 0.2126 * channelLinear(r) + 0.7152 * channelLinear(g) + 0.0722 * channelLinear(b);
}

/** อัตราความคมชัดของสองสี 1..21 (สลับลำดับแล้วได้ค่าเดียวกัน) */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const hi = Math.max(la, lb);
  const lo = Math.min(la, lb);
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * เลือกสีตัวอักษรที่อ่านออกบนพื้นสีนี้ — ตัวที่ contrast สูงกว่าชนะ
 * (เท่ากันเป๊ะ → ขาว เพื่อให้ผลนิ่ง)
 */
export function pickReadableFg(hex: string): ReadableFg {
  const onWhite = contrastRatio(FG_LIGHT, hex);
  const onDark = contrastRatio(FG_DARK, hex);
  return onWhite >= onDark ? FG_LIGHT : FG_DARK;
}

/** ผ่านเกณฑ์ AA (ตัวอักษรปกติ ≥ 4.5 · ตัวใหญ่/หนา ≥ 3) */
export function meetsAA(ratio: number, large = false): boolean {
  return ratio >= (large ? 3 : 4.5);
}

/** สีจาง 8% ของสีแบรนด์ — ใช้เป็นพื้นชิป/แถวที่เลือก (`--color-accent-soft`) */
export function softOf(hex: string, alpha = 0.08): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** ขาว/ดำแบบโปร่ง — ใช้ทำ navFg2 (ตัวอักษรรอง) และ navOn (พื้นรายการที่เลือก) บนแถบเมนู */
export function fgAlpha(fg: string, alpha: number): string {
  const [r, g, b] = hexToRgb(fg);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
