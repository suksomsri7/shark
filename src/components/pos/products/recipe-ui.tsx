// recipe-ui.tsx — ชิ้นส่วนร่วมของแท็บ "สูตรและวัตถุดิบ" + คอลัมน์ต้นทุน/กำไรของจอ 06 (POS P2.3U ▸ มติ 1–4)
//   สถานะสูตรของแถว (มีสูตร · ตัดจริง · สูตรจากเมนูเดิม) · ข้อความปริมาณ/ส่วนต่าง · กำไร % (ปัดลงจาก marginBp ของบริการ) · คำปฏิเสธ → ข้อความ · ไอคอน
// 🔴 บริสุทธิ์ (client import ได้): import เฉพาะ *-shared + price-ui — ห้ามแตะโมดูลที่ถึง prisma
// 🔴 ไม่คิดเงินเอง: ต้นทุน/กำไรมาจาก recipeCost เท่านั้น (ไฟล์นี้แค่จัดรูปข้อความ) · ไม่มีข้อความไทยนอกคอมเมนต์ (ST7)

import { RECIPE_MAX_COMPONENTS } from "@/lib/modules/pos/recipe-shared";
import { priceErrorText, type PT } from "./price-ui";

/** เพดานของตัวเขียน (catalog.ts) — ตรวจฝั่งจอก่อนส่ง (ตัวเขียนตรวจซ้ำเสมอ) */
export const RECIPE_LINES_MAX = RECIPE_MAX_COMPONENTS;
export const RECIPE_CHOICE_LINES_MAX = 100;
export const RECIPE_QTY_MAX = 1_000_000;

type RecipeRowLike = { kind: string; soldByWeight: boolean; recipe: readonly unknown[]; bomEnabled: boolean };

/** แถวนี้ตั้งสูตรได้ไหม (เมนู/ชุด · ไม่ใช่สินค้าชั่ง) */
export const recipeCapable = (p: Pick<RecipeRowLike, "kind" | "soldByWeight">): boolean => (p.kind === "MENU" || p.kind === "BUNDLE") && !p.soldByWeight;
/** มีสูตร (≥ 1 บรรทัด) — คอลัมน์ต้นทุน/กำไรและชิปนับเฉพาะแถวนี้ */
export const hasRecipe = (p: RecipeRowLike): boolean => recipeCapable(p) && p.recipe.length > 0;
/** ตัดสต็อกตามสูตรจริง (ชุด = เสมอ · เมนู = เปิดสวิตช์) */
export const recipeLive = (p: RecipeRowLike): boolean => hasRecipe(p) && (p.kind === "BUNDLE" || p.bomEnabled);
/** มติ 2 (F4): สูตรจากเมนูเดิม = เมนู · สวิตช์ปิด · มีสูตร ≥ 1 บรรทัด */
export const recipeBackfilled = (p: RecipeRowLike): boolean => p.kind === "MENU" && !p.soldByWeight && !p.bomEnabled && p.recipe.length > 0;

/** กำไรขั้นต้น % = ปัดลงของ marginBp / 100 (ค่าจากบริการ · null = คำนวณไม่ได้) */
export const marginPctText = (bp: number | null | undefined): string | null => (typeof bp === "number" ? `${Math.floor(bp / 100)}%` : null);

/** "18 g" · "1 ใบ" */
export const qtyText = (qty: number, unitLabel: string, locale: string): string => `${qty.toLocaleString(locale.startsWith("en") ? "en-US" : "th-TH")} ${unitLabel}`.trim();
/** ส่วนต่างมีเครื่องหมาย "+6 g" · "−1 ใบ" (ลบ = U+2212) */
export const deltaText = (d: number, unitLabel: string, locale: string): string => `${d < 0 ? "−" : "+"}${qtyText(Math.abs(d), unitLabel, locale)}`;

/** ช่องปริมาณ (จำนวนเต็ม 1..1,000,000) → ค่า · ผิด = null */
export function parseQty(v: string): number | null {
  const s = v.trim().replace(/,/g, "");
  if (!/^\d{1,7}$/.test(s)) return null;
  const n = Number(s);
  return n >= 1 && n <= RECIPE_QTY_MAX ? n : null;
}
/** ช่องส่วนต่าง (+/− จำนวนเต็ม ≠ 0 · |v| ≤ 1,000,000 · รับ "−" U+2212) → ค่า · ผิด = null */
export function parseDelta(v: string): number | null {
  const s = v.trim().replace(/,/g, "").replace(/−/g, "-");
  if (!/^[+-]?\d{1,7}$/.test(s)) return null;
  const n = Number(s);
  return n !== 0 && Math.abs(n) <= RECIPE_QTY_MAX ? n : null;
}

/**
 * คำปฏิเสธของ saveRecipeAction / setBomEnabledAction / searchRecipeItemsAction → ข้อความ:
 *   VALIDATION = ข้อความของบริการ (ตรวจฝั่งจอแล้ว ที่เหลือคือกติกาของตัวเขียน เช่น บริการ/เก็บถาวร) · NOT_FOUND / PERMISSION_DENIED = คีย์ของสูตร ·
 *   อื่น ๆ (BUSY · CONFLICT · INTERNAL) = ข้อความของจอราคาชุดเดิม
 */
export function recipeRefusalText(r: { code: string; message?: string }, tr: PT, tp: PT, treg: PT): string {
  if (r.code === "VALIDATION") {
    const message = (r.message ?? "").trim();
    return message ? tr("errors.serverValidation", { message }) : tp("errors.unknown");
  }
  if (r.code === "NOT_FOUND") return tr("errors.notFound");
  if (r.code === "PERMISSION_DENIED") return tr("errors.permission");
  return priceErrorText(r.code, tp, treg);
}

// ═══════════ ไอคอน (เส้น · currentColor) ═══════════
const PATHS = {
  tree: (
    <>
      <rect x="9" y="3.5" width="6" height="4.5" rx="1" />
      <rect x="3.5" y="16" width="6" height="4.5" rx="1" />
      <rect x="14.5" y="16" width="6" height="4.5" rx="1" />
      <path d="M12 8v4M6.5 16v-2a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v2" />
    </>
  ),
  minus: <path d="M5 12h14" />,
  plus: <path d="M12 5v14M5 12h14" />,
  trash: (
    <>
      <path d="M4.5 7h15M9.5 7V5a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v2" />
      <path d="M6.5 7l.8 12a1 1 0 0 0 1 .9h7.4a1 1 0 0 0 1-.9l.8-12" />
    </>
  ),
  warn: (
    <>
      <path d="M12 4.5 20.5 19h-17Z" />
      <path d="M12 10v4M12 16.5v.5" />
    </>
  ),
  retry: (
    <>
      <path d="M19 12a7 7 0 1 1-2.05-4.95" />
      <path d="M19 4.5V9h-4.5" />
    </>
  ),
} as const;
export type RecipeIconName = keyof typeof PATHS;
export function RecipeIcon({ name, size = 16, className }: { name: RecipeIconName; size?: number; className?: string }) {
  return (
    <svg aria-hidden width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={`shrink-0 ${className ?? ""}`}>
      {PATHS[name]}
    </svg>
  );
}

/** ชิปเตือนเล็ก (ยังไม่ใส่ต้นทุน · กำไรคำนวณไม่ได้ · เก็บถาวร) */
export function RecipeWarnChip({ text }: { text: string }) {
  return (
    <span className="inline-flex h-6 items-center gap-1 whitespace-nowrap rounded-full border border-dashed px-2 text-[11px] text-[color:var(--color-ink-soft)]">
      <RecipeIcon name="warn" size={12} />
      {text}
    </span>
  );
}
