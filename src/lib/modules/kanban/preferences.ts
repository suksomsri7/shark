// preferences.ts — การตั้งค่าส่วนตัวของผู้ใช้ที่เกี่ยวกับบอร์ดงาน (K1.14 · แบบ §5.6)
//
// 🔴 ตัวจริงย้ายไป `src/lib/core/user-preferences.ts` แล้ว (B3) — ไฟล์นี้เหลือเป็น **ทางผ่าน**
//    เหตุผล: `User.prefs` เป็น Json ก้อนเดียวที่ตอนนี้มีทั้ง `kanbanShortcuts` (ของบอร์ดงาน)
//    และ `navCollapsed` (ของโครงแอป) ⇒ ต้องมีที่เดียวที่รู้จักรูปร่างทั้งก้อน ไม่งั้นวันหนึ่ง
//    จะมีใครเขียนทับทั้งก้อนแล้วลบค่าของอีกฝั่งทิ้งเงียบ ๆ
//    ผู้เรียกเดิม (`kanban/actions.ts` · `/app/settings/preferences` · หน้าบอร์ด) ใช้ path นี้ได้เหมือนเดิม
//
// วันนี้ค่าของบอร์ดงานมีค่าเดียว: `kanbanShortcuts` = เปิด/ปิดปุ่มลัดคีย์บอร์ด
// 🔴 ทำไมต้องปิดได้ (ไม่ใช่ของแถม): คนใช้โปรแกรมอ่านหน้าจอ และคนพิมพ์ไทยที่กด `f` แล้วโฟกัสถูกขโมย
//    ต้องมีทางปิด — Trello เองก็มีสวิตช์นี้ (แบบ §5.6)

export {
  parsePreferences,
  getUserPreferences,
  setUserPreferences,
  DEFAULT_USER_PREFERENCES,
  DEFAULT_USER_PREFERENCES as DEFAULT_KANBAN_PREFERENCES,
} from "@/lib/core/user-preferences";

export type { UserPreferences, UserPreferences as KanbanUserPreferences } from "@/lib/core/user-preferences";
