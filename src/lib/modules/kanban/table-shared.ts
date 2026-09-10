// table-shared.ts — ตัวช่วยจัดกลุ่มที่ใช้ร่วมกันระหว่างมุมมองตาราง (K2.1 `table.ts`) และภาพรวมข้ามบอร์ด
// (K3.8 `overview.ts`) — บริสุทธิ์ (ไม่แตะ prisma) ทำงานบน `TableRowDto` ที่ประกอบมาแล้วเท่านั้น (label/
// assignees ต้อง join มาก่อนหน้านี้แล้ว) แยกออกจาก `table.ts` เพราะ "จัดกลุ่มตามผู้รับผิดชอบ" ของทั้งสอง
// WO เป็นตรรกะเดียวกันเป๊ะ (การ์ดหลายผู้รับผิดชอบอยู่ได้หลายกลุ่ม + "ไม่มีผู้รับผิดชอบ" ท้ายสุดเสมอ) —
// ห้ามก๊อปสองที่ (ledger/KANBAN-RUN.md §K3.8: "แยก helper ออกมาใช้ร่วม")

import type { TableGroupDto, TableRowDto } from "./types";

export const NONE_ASSIGNEE_KEY = "none";
export const NONE_ASSIGNEE_LABEL = "ไม่มีผู้รับผิดชอบ";

/** จัดกลุ่มแถวตามผู้รับผิดชอบ — การ์ดหลายคนอยู่ได้หลายกลุ่ม · "ไม่มีผู้รับผิดชอบ" เป็นกลุ่มท้ายสุดเสมอ */
export function groupRowsByAssignee(rows: readonly TableRowDto[]): TableGroupDto[] {
  const byUser = new Map<string, { label: string; ids: string[] }>();
  const none: string[] = [];
  for (const r of rows) {
    if (r.assignees.length === 0) {
      none.push(r.id);
      continue;
    }
    for (const a of r.assignees) {
      const entry = byUser.get(a.userId) ?? { label: a.name, ids: [] };
      entry.ids.push(r.id);
      byUser.set(a.userId, entry);
    }
  }
  const groups: TableGroupDto[] = Array.from(byUser.entries()).map(([userId, v]) => ({ key: userId, label: v.label, rowIds: v.ids }));
  groups.push({ key: NONE_ASSIGNEE_KEY, label: NONE_ASSIGNEE_LABEL, rowIds: none });
  return groups;
}
