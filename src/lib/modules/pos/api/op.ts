// op.ts — ประกาศ op ของ API ขายหน้าร้าน (POS) (ใบ P0.2 · แบบเดียวกับ kanban/api/op.ts)
//
// ห่อ `defineOp` ของแกนกลางชั้นเดียวเพื่อเติมของที่ทุก op ของ POS ต้องมีเหมือนกัน:
//   `module: "pos"` — ติดไปกับเอกสาร/บันทึก
//   `auditAction: "pos.api.<id>"` — คีย์สิทธิ์ของ POS 1 ตัวครอบหลาย op (`pos.sale.create` = เปิดบิล + ดูรายงานขาย)
//      ถ้าเขียน `action` ลง AuditLog ตรง ๆ เจ้าของร้านจะย้อนอ่านไม่ออกว่าทำ "อะไร" — จึงบันทึกชื่อ op ไว้ด้วยเสมอ
//
// 🔴 P0.2 = โครงเท่านั้น: ยังไม่มี route `/api/v1/pos` · ยังไม่มี bundle ของคีย์ API (ทั้งสองอย่างคือใบ P2.13)
// ⚠️ ห้าม import `./registry` จากที่นี่ (registry → ops/* → op.ts เป็นวงกลม — บทเรียนเดียวกับบัญชี)

import type { ZodType } from "zod";
import { defineOp, type ApiOp, type ApiOpCtx } from "@/lib/api/op";

export type { ApiOp, ApiOpCtx, ApiOpKind, ApiMethod, ApiRateKind } from "@/lib/api/op";

/**
 * scope (= permission key ของ RBAC ตัวเดียวกับหน้าจอ) ที่ op ของ POS ใช้
 * 🔴 ต้องเป็นคีย์ที่มีจริงใน `src/lib/core/permissions.ts` (โมดูล `pos`) — ข้อสอบ qc-pos-p0.2 ตรวจให้
 *    `pos.sale.create` ครอบ "ดึงรายงานขายรายวัน" ด้วย (ป้ายไทยของสิทธิ์เขียนไว้แบบนั้น) ⇒ op อ่านรายงานใช้ตัวนี้
 *    ไปก่อน · สิทธิ์อ่านแยก (`pos.sale.read` ตาม POS-API.md) = ตัดสินใจใบ P2.13
 * 🔴 ยังไม่ลง `API_SCOPE_BUNDLES` (src/lib/api-keys/scopes.ts) — ไม่มีคีย์ไหนเข้าถึง POS ได้จนกว่าจะมี route (P2.13)
 */
export const POS_SCOPES = {
  saleCreate: "pos.sale.create",
  saleVoid: "pos.sale.void",
} as const;

export type PosScope = (typeof POS_SCOPES)[keyof typeof POS_SCOPES];

type PosOpDefinition<S extends ZodType | undefined> = Omit<Parameters<typeof defineOp<S>>[0], "module" | "auditAction">;

/** ประกาศ op ของ POS (ชนิดของ `input` มาจาก zod schema เหมือน `defineOp` ของแกนกลาง) */
export function definePosOp<S extends ZodType | undefined = undefined>(def: PosOpDefinition<S>): ApiOp {
  return defineOp<S>({ ...def, module: "pos", auditAction: `pos.api.${def.id}` });
}

/** ctx ของ handler ที่รู้ชนิด input แล้ว (ใช้ประกาศ helper ที่รับ ctx ต่อ) */
export type PosOpCtx<T> = ApiOpCtx<T>;
