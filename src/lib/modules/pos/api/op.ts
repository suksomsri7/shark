// op.ts — ประกาศ op ของ API ขายหน้าร้าน (POS) (ใบ P0.2 · แบบเดียวกับ kanban/api/op.ts)
//
// ห่อ `defineOp` ของแกนกลางชั้นเดียวเพื่อเติมของที่ทุก op ของ POS ต้องมีเหมือนกัน:
//   `module: "pos"` — ติดไปกับเอกสาร/บันทึก
//   `auditAction: "pos.api.<id>"` — คีย์สิทธิ์ของ POS 1 ตัวครอบหลาย op (`pos.sale.create` = เปิดบิล + ดูรายงานขาย)
//      ถ้าเขียน `action` ลง AuditLog ตรง ๆ เจ้าของร้านจะย้อนอ่านไม่ออกว่าทำ "อะไร" — จึงบันทึกชื่อ op ไว้ด้วยเสมอ
//
// POS P2.13 ▸ route `/api/v1/pos/[...path]` + bundle คีย์ `pos-*` มีแล้ว (config.ts · actor.ts · dispatch.ts) ◂
// ⚠️ ห้าม import `./registry` จากที่นี่ (registry → ops/* → op.ts เป็นวงกลม — บทเรียนเดียวกับบัญชี)

import type { ZodType } from "zod";
import { defineOp, type ApiOp, type ApiOpCtx } from "@/lib/api/op";

export type { ApiOp, ApiOpCtx, ApiOpKind, ApiMethod, ApiRateKind } from "@/lib/api/op";

/**
 * scope (= permission key ของ RBAC ตัวเดียวกับหน้าจอ) ที่ op ของ POS ใช้
 * 🔴 ต้องเป็นคีย์ที่มีจริงใน `src/lib/core/permissions.ts` (โมดูล `pos`) — ข้อสอบ qc-pos-p0.2 S2.2 / qc-pos-p2.13 ST1 ตรวจให้
 * POS P2.13 ▸ ครบทุก scope ที่ op ใช้ (48 op · brief §1) + `salePriceOverride` (ราคากำหนดเองของ sales.create ตรวจที่ facade) ·
 *   ชุดสำเร็จรูปของคีย์ = `pos-read` / `pos-operate` / `pos-admin` ใน src/lib/api-keys/scopes.ts ◂
 */
export const POS_SCOPES = {
  saleRead: "pos.sale.read",
  saleCreate: "pos.sale.create",
  saleVoid: "pos.sale.void",
  saleRefund: "pos.sale.refund",
  salePriceOverride: "pos.sale.priceOverride",
  taxInvoiceIssue: "pos.taxinvoice.issue",
  shiftManage: "pos.shift.manage",
  deviceManage: "pos.device.manage",
  productManage: "pos.product.manage",
  productSetPrice: "pos.product.setPrice",
  orderAccept: "pos.order.accept",
  orderReject: "pos.order.reject",
  reportView: "pos.report.view",
  reportAnomaly: "pos.report.anomaly",
  offlineSync: "pos.offline.sync", // POS P3.4 ▸ มติ 2: ซิงก์บิลออฟไลน์ผ่าน REST (sync.sales) — หน้าขายของร้านใช้ route ของ session ไม่ต้องมีคีย์นี้ ◂
} as const;

export type PosScope = (typeof POS_SCOPES)[keyof typeof POS_SCOPES];

type PosOpDefinition<S extends ZodType | undefined> = Omit<Parameters<typeof defineOp<S>>[0], "module" | "auditAction">;

/** ประกาศ op ของ POS (ชนิดของ `input` มาจาก zod schema เหมือน `defineOp` ของแกนกลาง) */
export function definePosOp<S extends ZodType | undefined = undefined>(def: PosOpDefinition<S>): ApiOp {
  return defineOp<S>({ ...def, module: "pos", auditAction: `pos.api.${def.id}` });
}

/** ctx ของ handler ที่รู้ชนิด input แล้ว (ใช้ประกาศ helper ที่รับ ctx ต่อ) */
export type PosOpCtx<T> = ApiOpCtx<T>;
