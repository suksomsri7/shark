// limits.ts — เพดานอ่อนของโมดูลบอร์ดงาน (D4 · พิมพ์เขียว 13-kanban-v2 §11.7) — ค่าเริ่มต้นเมื่อ Tenant.limits ไม่ระบุ
// ไฟล์นี้ไม่แตะ prisma — service ที่ต้องบังคับเพดานอ่านค่าจากที่นี่ที่เดียว

export const KANBAN_LIMITS = Object.freeze({
  /** ป้ายกำกับต่อบอร์ด (K1.2) */
  labelsPerBoard: 30,
  /** ฟิลด์กำหนดเองต่อบอร์ด (K2.6) */
  customFieldsPerBoard: 20,
  /** ไฟล์แนบต่อการ์ด + ขนาดต่อไฟล์ (K1.9 · เท่าแชท) */
  attachmentsPerCard: 20,
  attachmentMaxBytes: 10 * 1024 * 1024,
  /** รายการเช็คลิสต์ต่อการ์ด (K1.7) */
  checklistItemsPerCard: 50,
  /** สมาชิกต่อบอร์ด (K1.3) */
  membersPerBoard: 50,
  /** คอลัมน์ต่อบอร์ด */
  columnsPerBoard: 20,
  /** ความยาวคีย์ position ก่อน rebalance (ordering.ts) */
  positionRebalanceLength: 50,
} as const);

export type KanbanLimits = typeof KANBAN_LIMITS;
