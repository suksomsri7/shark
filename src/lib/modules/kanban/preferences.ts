// preferences.ts — การตั้งค่าส่วนตัวของผู้ใช้ที่เกี่ยวกับบอร์ดงาน (K1.14 · แบบ §5.6)
//
// วันนี้มีค่าเดียว: `kanbanShortcuts` = เปิด/ปิดปุ่มลัดคีย์บอร์ด
// 🔴 ทำไมต้องปิดได้ (ไม่ใช่ของแถม): คนใช้โปรแกรมอ่านหน้าจอ และคนพิมพ์ไทยที่กด `f` แล้วโฟกัสถูกขโมย
//    ต้องมีทางปิด — Trello เองก็มีสวิตช์นี้ (แบบ §5.6)
// 🔴 ทำไมเก็บใน DB ไม่ใช่ localStorage: มันคือ "การเข้าถึงได้" ของ **คน** ไม่ใช่ของ **เครื่อง**
//    คนที่ต้องปิดปุ่มลัด ต้องปิดครั้งเดียวแล้วปิดทุกเครื่อง ไม่ใช่ไล่ปิดทีละเครื่อง
//
// เก็บที่ `User.prefs` (Json · ไมเกรชัน `20260929000000_kanban_v2_k`) — เป็นตัวตนข้าม tenant
// เหมือนตัว User เอง (คนเดียวเปิด 3 ร้าน ต้องไม่ต้องตั้งค่า 3 รอบ)

import { prisma } from "./db";

export type KanbanUserPreferences = {
  /** true = ปุ่มลัดทำงาน (ค่าเริ่มต้น) */
  kanbanShortcuts: boolean;
};

export const DEFAULT_KANBAN_PREFERENCES: KanbanUserPreferences = Object.freeze({
  kanbanShortcuts: true,
});

/** อ่านค่าที่ผู้ใช้ตั้งไว้ — ค่าที่ไม่รู้จัก/พังรูป = ใช้ค่าเริ่มต้น (หน้าจอห้ามพังเพราะ prefs เพี้ยน) */
export function parsePreferences(raw: unknown): KanbanUserPreferences {
  const src = raw !== null && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  return {
    kanbanShortcuts: typeof src.kanbanShortcuts === "boolean" ? src.kanbanShortcuts : DEFAULT_KANBAN_PREFERENCES.kanbanShortcuts,
  };
}

export async function getUserPreferences(userId: string): Promise<KanbanUserPreferences> {
  if (!userId) return { ...DEFAULT_KANBAN_PREFERENCES };
  const row = await prisma.user.findUnique({ where: { id: userId }, select: { prefs: true } });
  return parsePreferences(row?.prefs ?? null);
}

/**
 * เขียนทับเฉพาะคีย์ที่ส่งมา — **ไม่เขียนทับทั้งก้อน**
 * (วันหน้ามี prefs ตัวอื่นของโมดูลอื่นอยู่ใน Json เดียวกัน การเขียนทับทั้งก้อนจะลบของคนอื่นทิ้งเงียบ ๆ)
 */
export async function setUserPreferences(
  userId: string,
  patch: Partial<KanbanUserPreferences>,
): Promise<KanbanUserPreferences> {
  const row = await prisma.user.findUnique({ where: { id: userId }, select: { prefs: true } });
  const current =
    row?.prefs !== null && typeof row?.prefs === "object" && !Array.isArray(row?.prefs)
      ? (row.prefs as Record<string, unknown>)
      : {};
  const next = { ...current, ...patch };
  await prisma.user.update({ where: { id: userId }, data: { prefs: next } });
  return parsePreferences(next);
}
