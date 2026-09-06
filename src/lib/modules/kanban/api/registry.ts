// registry.ts — ทะเบียนกลางของทุก endpoint ของ "บอร์ดงาน" + ตัวจับคู่ path (K1.15 · D15)
//
// 🔴 "ทะเบียนเดียว หลายทางออก": op ที่ลงทะเบียนที่นี่คือแหล่งความจริงเดียวของ
//    (1) REST `/api/v1/kanban/*`  (2) OpenAPI + คู่มือ EN + สกิล Claude  (3) tool ของสกิล AI `tasks`
//    ⇒ เพิ่ม endpoint = เพิ่ม op ที่ไฟล์ `ops/*.ts` แล้วต่อเข้าทะเบียนนี้ที่เดียว
//    (บทเรียน outbox: เพิ่ม event แล้วลืมลงทะเบียน consumer = คิวตันเงียบ ๆ)
//
// 🔴 ทุก WO ของ P2/P3 ที่เพิ่มฟีเจอร์ให้บอร์ดงาน **ต้องเพิ่ม op ของตัวเองที่นี่** (ด่าน fitness F13)

import { allowedMethodsIn, matchOpIn } from "@/lib/api/dispatch";
import type { ApiOp } from "@/lib/api/op";
import { ATTACHMENTS_OPS } from "./ops/attachments";
import { BOARDS_OPS } from "./ops/boards";
import { CARDS_OPS } from "./ops/cards";
import { CHECKLISTS_OPS } from "./ops/checklists";
import { COLUMNS_OPS } from "./ops/columns";
import { COMMENTS_OPS } from "./ops/comments";
import { CORE_OPS } from "./ops/core";
import { LABELS_OPS } from "./ops/labels";
import { MISC_OPS } from "./ops/misc";

export * from "./op";

/** ทุก op ของ API บอร์ดงาน — เรียงตามไฟล์ที่มา */
export const KANBAN_OPS: ApiOp[] = [
  ...CORE_OPS,
  ...BOARDS_OPS,
  ...COLUMNS_OPS,
  ...CARDS_OPS,
  ...LABELS_OPS,
  ...CHECKLISTS_OPS,
  ...COMMENTS_OPS,
  ...ATTACHMENTS_OPS,
  ...MISC_OPS,
];

/** หา op ที่ตรงทั้ง method และ path · เจอหลายตัว → เลือกตัวที่ "คงที่มากที่สุด" (param น้อยสุด) */
export function matchOp(method: string, segments: string[]): { op: ApiOp; params: Record<string, string> } | null {
  return matchOpIn(KANBAN_OPS, method, segments);
}

/** method ที่ path นี้รองรับ (ใช้ทำหัว `Allow` ของ 405) — [] = ไม่มี op ที่ path นี้เลย */
export function allowedMethods(segments: string[]): string[] {
  return allowedMethodsIn(KANBAN_OPS, segments);
}

/** op ที่เปิดเป็นเครื่องมือของผู้ช่วย AI (ทะเบียนเดียวกัน — ไม่มีรายชื่อชุดที่สอง) */
export function kanbanToolOps(): ApiOp[] {
  return KANBAN_OPS.filter((o) => o.tool);
}
