// op.ts — ประกาศ op ของ API บอร์ดงาน (K1.15)
//
// ห่อ `defineOp` ของแกนกลางไว้ชั้นเดียวเพื่อเติมของที่ทุก op ของโมดูลนี้ต้องมีเหมือนกัน:
//   `module: "kanban"` — ติดไปกับเอกสาร/บันทึก
//   `auditAction: "kanban.api.<id>"` — 🔴 คีย์สิทธิ์ของโมดูลนี้ 1 ตัวครอบหลาย op
//      (`kanban.card.delete` = เก็บการ์ด · เก็บคอลัมน์ · เก็บบอร์ด) ถ้าเขียน `action` ลง AuditLog ตรง ๆ
//      เจ้าของร้านจะย้อนอ่านไม่ออกว่าคีย์ทำ "อะไร" — จึงบันทึกชื่อ op ไว้ด้วยเสมอ
//
// ⚠️ ห้าม import `./registry` จากที่นี่ (registry → ops/* → op.ts เป็นวงกลม — บทเรียนเดียวกับบัญชี)

import type { ZodType } from "zod";
import { defineOp, type ApiOp, type ApiOpCtx } from "@/lib/api/op";

export type { ApiOp, ApiOpCtx, ApiOpKind, ApiMethod, ApiRateKind } from "@/lib/api/op";

type KanbanOpDefinition<S extends ZodType | undefined> = Omit<
  Parameters<typeof defineOp<S>>[0],
  "module" | "auditAction"
>;

/** ประกาศ op ของบอร์ดงาน (ชนิดของ `input` มาจาก zod schema เหมือน `defineOp` ของแกนกลาง) */
export function defineKanbanOp<S extends ZodType | undefined = undefined>(def: KanbanOpDefinition<S>): ApiOp {
  return defineOp<S>({ ...def, module: "kanban", auditAction: `kanban.api.${def.id}` });
}

/** ctx ของ handler ที่รู้ชนิด input แล้ว (ใช้ประกาศ helper ที่รับ ctx ต่อ) */
export type KanbanOpCtx<T> = ApiOpCtx<T>;
