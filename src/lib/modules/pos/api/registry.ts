// registry.ts — ทะเบียนกลางของ op ขายหน้าร้าน (POS) + ตัวจับคู่ path (ใบ P0.2 · โครง)
//
// 🔴 "ทะเบียนเดียว หลายทางออก" (แบบเดียวกับบัญชี/CRM/บอร์ดงาน): op ที่ลงทะเบียนที่นี่จะเป็นแหล่งความจริงเดียวของ
//    (1) REST `/api/v1/pos/*`  (2) OpenAPI + คู่มือ + สกิล `shark-pos-api`  (3) tool ของผู้ช่วย AI สกิล `sales`
//    ⇒ เพิ่ม endpoint = เพิ่ม op ที่ `ops/*.ts` แล้วต่อเข้าทะเบียนนี้ที่เดียว
//
// 🔴 P0.2 = โครงเท่านั้น (มติผู้คุมงาน 1 ต.ค.):
//    - ยังไม่มี route `src/app/api/v1/pos` · ยังไม่มี bundle คีย์ API · ยังไม่มี config/actor ของ REST — ทั้งหมดคือใบ P2.13
//    - tool ของผู้ช่วย AI ยังเป็นตัวเขียนมือเดิมใน `src/lib/ai/tools.ts` (ไม่เปลี่ยนพฤติกรรม) — op ที่นี่ **ไม่ประกาศ `tool`**
//      เพราะถ้าประกาศ ทะเบียนสกิลจะเห็นสองตัวชื่อเดียวกันตอนสลับ · การสลับ = P2.13/P3.9 (ตาราง POS_LEGACY_AI_TOOLS ด้านล่าง)

import { allowedMethodsIn, matchOpIn } from "@/lib/api/dispatch";
import type { ApiOp } from "./op";
import { REPORTS_OPS } from "./ops/reports";
import { SALES_OPS } from "./ops/sales";

export * from "./op";

/** ทุก op ของ API ขายหน้าร้าน — เรียงตามไฟล์ที่มา */
export const POS_OPS: ApiOp[] = [
  // POS P0.2 ▸ op จาก tool เดิมของสกิล `sales` ที่ตรรกะอยู่ในโมดูล POS จริง ◂
  ...REPORTS_OPS,
  ...SALES_OPS,
];

/**
 * tool เดิมของสกิล AI `sales` (src/lib/ai/skills.ts) ↔ op ในทะเบียนนี้ — ตารางเดียวที่ตอบว่า "tool ไหนเป็นของ POS"
 *   `opId: null` = ตรรกะไม่ได้อยู่ในโมดูล POS ⇒ ไม่สร้าง op ปลอม (มติผู้คุมงานข้อ 2) · `owner` บอกบ้านที่ควรเป็น
 * 🔴 ข้อสอบ qc-pos-p0.2 ตรวจว่าตารางนี้ครบเท่ารายชื่อ tool ของสกิล `sales` พอดี (ไม่ขาด ไม่เกิน)
 *    เพิ่ม tool ใหม่ให้สกิล `sales` แล้วลืมมาลงที่นี่ = ข้อสอบแดง
 */
export type PosLegacyToolRow = {
  tool: string;
  opId: string | null;
  owner: "pos" | "account" | "cross";
  /** บริการที่ทางเดิม (tool/proposal) เรียกจริง — ใช้ตอนสลับ P2.13 */
  legacyPath: string;
};

export const POS_LEGACY_AI_TOOLS: readonly PosLegacyToolRow[] = [
  { tool: "sales_summary", opId: "sales.summary", owner: "pos", legacyPath: "ai/tools.ts salesSummary (คิวรี posSale เอง)" },
  { tool: "sales_by_day", opId: "sales.byDay", owner: "pos", legacyPath: "ai/tools.ts salesByDay (คิวรี posSale เอง)" },
  { tool: "pos_create_sale", opId: "sales.create", owner: "pos", legacyPath: "ai/proposals.ts pos_create_sale → pos createSale" },
  { tool: "void_sale", opId: "sales.void", owner: "pos", legacyPath: "ai/proposals.ts void_sale → pos voidSale" },
  { tool: "record_expense", opId: null, owner: "account", legacyPath: "ai/proposals.ts record_expense → account facade createExpenseDoc" },
  { tool: "financial_summary", opId: null, owner: "cross", legacyPath: "ai/tools.ts financialSummary (posSale + accountDocument)" },
];

/** หา op ที่ตรงทั้ง method และ path · เจอหลายตัว → เลือกตัวที่ "คงที่มากที่สุด" (param น้อยสุด) */
export function matchOp(method: string, segments: string[]): { op: ApiOp; params: Record<string, string> } | null {
  return matchOpIn(POS_OPS, method, segments);
}

/** method ที่ path นี้รองรับ (ใช้ทำหัว `Allow` ของ 405) — [] = ไม่มี op ที่ path นี้เลย */
export function allowedMethods(segments: string[]): string[] {
  return allowedMethodsIn(POS_OPS, segments);
}
