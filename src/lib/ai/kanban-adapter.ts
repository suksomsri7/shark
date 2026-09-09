// kanban-adapter.ts — ชนิดของ "ตัวปรับสคีมาต่อ tool" ของสกิลบอร์ดงาน (K1.15 · ขยายใน K3.5)
//
// แยกออกมาเป็นไฟล์ชนิดล้วน ๆ เพื่อให้ตัวปรับที่อยู่คนละไฟล์ (เช่น `kanban-op-from-chat.ts`)
// อ้างชนิดได้โดยไม่ import ย้อนกลับไปที่ `kanban-ops.ts` (จะเป็นวงกลมตอนรันจริง)

import type { ZodType } from "zod";

/** ผลของ `toCall` — input/params ของ op + สรุปภาษาไทยของข้อเสนอ (ถ้าตัวปรับอยากเขียนเอง) */
export type KanbanToolCall = {
  input: unknown;
  params?: Record<string, string>;
  /**
   * สรุปที่แสดงบนการ์ดยืนยัน — มีเมื่อ "ตัวปรับรู้เรื่องมากกว่าตัวสรุปกลาง" เช่นชื่อผู้ติดต่อของห้องแชท
   * ที่ไม่ได้อยู่ใน input ของ op · ไม่ระบุ = ใช้ตัวสรุปกลางของ `kanban-ops.ts`
   */
  summary?: string;
};

export type KanbanToolAdapter = {
  /** สคีมาที่ผู้ช่วยเห็นแทนสคีมาของ op (ไม่ระบุ = ใช้ของ op ตรง ๆ) */
  args?: ZodType;
  description?: string;
  /** args (ผ่าน zod แล้ว) → input/params ของ op · async ได้ (บางตัวต้องค้นคน/ห้องแชทก่อน) */
  toCall?: (args: Record<string, unknown>, tenantId: string, systemId: string) => Promise<KanbanToolCall>;
};
