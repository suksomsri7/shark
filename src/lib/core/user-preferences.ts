// user-preferences.ts — "ค่าที่เป็นของคน ไม่ใช่ของร้าน" (B3 · เดิมอยู่ที่ modules/kanban/preferences.ts ของ K1.14)
//
// ทำไมย้ายมาที่ core: ตอน K1.14 มีค่าเดียว (`kanbanShortcuts`) เลยอยู่ในโมดูลบอร์ดงานได้
// พอ B3 เพิ่ม `navCollapsed` (ย่อ/ขยายแถบเมนูของโครงแอป ซึ่งไม่ใช่ของโมดูลไหนเลย) ก้อน Json
// เดียวกันเริ่มมีเจ้าของ 2 คน ⇒ ถ้าปล่อยให้ 2 ที่เขียนกันเอง วันหนึ่งจะมีใครเขียนทับทั้งก้อน
// แล้วลบค่าของอีกฝั่งทิ้งเงียบ ๆ (บทเรียนเดียวกับ outbox/consumer) — จึงมี "ที่เดียว" ที่รู้จัก
// รูปร่างของ prefs ทั้งหมด และ `src/lib/modules/kanban/preferences.ts` เหลือเป็นทางผ่าน
//
// เก็บที่ `User.prefs` (Json · ไมเกรชัน `20260929000000_kanban_v2_k`) — เป็นตัวตนข้าม tenant
// เหมือนตัว User เอง (คนเดียวเปิด 3 ร้าน ต้องไม่ต้องตั้งค่า 3 รอบ)
//
// 🔴 ทำไมเก็บใน DB ไม่ใช่ localStorage: มันคือค่าของ **คน** ไม่ใช่ของ **เครื่อง**
//    คนที่ปิดปุ่มลัดเพราะใช้โปรแกรมอ่านหน้าจอ ต้องปิดครั้งเดียวแล้วปิดทุกเครื่อง

import { prisma } from "./db";

export type UserPreferences = {
  /** true = ปุ่มลัดคีย์บอร์ดของบอร์ดงานทำงาน (ค่าเริ่มต้น · K1.14) */
  kanbanShortcuts: boolean;
  /** true = ย่อแถบเมนูซ้ายเป็นรางไอคอน 56px (ค่าเริ่มต้น false = แถบเต็ม 288px · B3) */
  navCollapsed: boolean;
};

export const DEFAULT_USER_PREFERENCES: UserPreferences = Object.freeze({
  kanbanShortcuts: true,
  navCollapsed: false,
});

/**
 * อ่านค่าที่ผู้ใช้ตั้งไว้จาก Json ดิบ — ค่าที่ไม่รู้จัก/พังรูป = ใช้ค่าเริ่มต้น
 * (หน้าจอห้ามพังเพราะ prefs เพี้ยน · array/สตริง/null → ค่าเริ่มต้นทั้งชุด)
 */
export function parsePreferences(raw: unknown): UserPreferences {
  const src = raw !== null && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  return {
    kanbanShortcuts:
      typeof src.kanbanShortcuts === "boolean" ? src.kanbanShortcuts : DEFAULT_USER_PREFERENCES.kanbanShortcuts,
    navCollapsed: typeof src.navCollapsed === "boolean" ? src.navCollapsed : DEFAULT_USER_PREFERENCES.navCollapsed,
  };
}

export async function getUserPreferences(userId: string): Promise<UserPreferences> {
  if (!userId) return { ...DEFAULT_USER_PREFERENCES };
  const row = await prisma.user.findUnique({ where: { id: userId }, select: { prefs: true } });
  return parsePreferences(row?.prefs ?? null);
}

/**
 * เขียนทับเฉพาะคีย์ที่ส่งมา — **ไม่เขียนทับทั้งก้อน**
 * (prefs ของโมดูลอื่นอยู่ใน Json เดียวกัน · เขียนทั้งก้อน = ลบของคนอื่นทิ้งเงียบ ๆ)
 */
export async function setUserPreferences(
  userId: string,
  patch: Partial<UserPreferences>,
): Promise<UserPreferences> {
  const row = await prisma.user.findUnique({ where: { id: userId }, select: { prefs: true } });
  const current =
    row?.prefs !== null && typeof row?.prefs === "object" && !Array.isArray(row?.prefs)
      ? (row.prefs as Record<string, unknown>)
      : {};
  const next = { ...current, ...patch };
  await prisma.user.update({ where: { id: userId }, data: { prefs: next } });
  return parsePreferences(next);
}
