// types.ts — ชนิดร่วมของโมดูล "บอร์ดงาน" (พิมพ์เขียว 13-kanban-v2 §5.1)
// ไฟล์นี้ไม่แตะ prisma และไม่ import ไฟล์อื่นในโมดูล — ทุกไฟล์ import จากที่นี่ได้โดยไม่เกิดวงกลม

import type { Role } from "@prisma/client";

/**
 * บริบทของทุก service ใหม่ในโมดูล — ต้องมี `tenantId + systemId` เสมอ (defense-in-depth:
 * ทุก `where` ผูกทั้งคู่ ไม่พึ่ง Prisma extension อย่างเดียว)
 * `actorUserId` = คนกด (ใช้บันทึก assignedById / กิจกรรม / AuditLog) — null ได้เมื่อระบบเป็นคนทำ (cron/automation)
 */
export type KanbanCtx = {
  tenantId: string;
  systemId: string;
  actorUserId?: string | null;
};

/**
 * ผู้ใช้ที่กำลังทำงาน — ประกอบจาก Membership (K1.3 จะใช้คิด `boardRole()`)
 * เก็บไว้ที่นี่ตั้งแต่ K1.2 เพราะเป็น "ชนิดร่วม" ตามสัญญา ไม่ใช่ของไฟล์ใดไฟล์หนึ่ง
 */
export type KanbanActor = {
  userId: string;
  role: Role;
  /** BusinessUnit.id ที่ผู้ใช้ดูแล ([] = ทุกสาขา สำหรับ OWNER) */
  unitAccess: string[];
  permissions: Record<string, unknown>;
};
