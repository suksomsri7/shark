// ops/checklists.ts — op ของ "เช็คลิสต์ในการ์ด": สร้าง/แก้ชื่อ/ลบทั้งชุด · เพิ่ม/แก้/ติ๊ก/ลบ/ย้ายรายการ
//
// กติกา 4 ข้อของทุก op อยู่หัวไฟล์ `ops/boards.ts` (อ่านก่อน) — ของเฉพาะไฟล์นี้อีก 3 ข้อ:
//   · ทุกบริการใน `../../checklists.ts` เรียก `assertCardRole(ctx, cardId, "EDITOR")` ให้เองแล้วทุกตัว
//     ⇒ **ห้ามตรวจซ้ำที่นี่** (ตรวจซ้ำ = ยิง query เพิ่มโดยไม่เปลี่ยนคำตอบ และวันหน้ากติกาสองที่จะเพี้ยนจากกัน)
//   · คีย์สิทธิ์ของทุก op = `kanban.card.update` — ตรงกับที่หน้าจอใช้ (`createChecklistAction` …
//     `moveChecklistItemAction` เรียก `assertKanbanCan(auth, "kanban.card.update")` ทุกตัว) เพราะเช็คลิสต์
//     คือ "เนื้อในการ์ด" ไม่ใช่ทรัพยากรที่มีคีย์สิทธิ์ของตัวเอง
//   · `../serialize.ts` มีตัวแปลงแค่บอร์ด/คอลัมน์/การ์ด ⇒ แถวเช็คลิสต์แปลงในไฟล์นี้ผ่าน `iso()`
//     (คืนแถว Prisma ดิบไม่ได้ — `tenantId` หลุด + `Date` ดิบ)

import type { KanbanChecklist, KanbanChecklistItem } from "@prisma/client";
import { z } from "zod";
import {
  addItem,
  createChecklist,
  deleteChecklist,
  deleteItem,
  editItem,
  moveItem,
  renameChecklist,
  toggleItem,
  type EditChecklistItemInput,
} from "../../checklists";
import { kanbanCtxOf } from "../actor";
import { defineKanbanOp, type ApiOp } from "../op";
import { iso } from "../serialize";

/** วันเวลาที่ผู้เรียกส่งมา (ISO-8601) — รูปแบบเดียวกับทุก op ของการ์ด (`ops/cards.ts`) */
const isoDate = z.iso.datetime({ offset: true }).describe("ISO-8601 timestamp in UTC, for example 2026-10-05T10:00:00.000Z");

/** `null` = ล้างค่า · `undefined` = ไม่แตะช่องนี้ (บริการแยกสองความหมายนี้ออกจากกันจริง) */
function toDate(v: string | null | undefined): Date | null | undefined {
  if (v === undefined) return undefined;
  if (v === null) return null;
  return new Date(v);
}

type ApiChecklistRow = {
  id: string;
  cardId: string;
  title: string;
  position: string;
  createdAt: string | null;
};

function checklistRow(c: KanbanChecklist): ApiChecklistRow {
  return { id: c.id, cardId: c.cardId, title: c.title, position: c.position, createdAt: iso(c.createdAt) };
}

type ApiChecklistItemRow = {
  id: string;
  checklistId: string;
  text: string;
  done: boolean;
  position: string;
  assigneeUserId: string | null;
  dueAt: string | null;
  doneAt: string | null;
  doneById: string | null;
  createdAt: string | null;
};

function checklistItemRow(i: KanbanChecklistItem): ApiChecklistItemRow {
  return {
    id: i.id,
    checklistId: i.checklistId,
    text: i.text,
    done: i.done,
    position: i.position,
    assigneeUserId: i.assigneeUserId,
    dueAt: iso(i.dueAt),
    doneAt: iso(i.doneAt),
    doneById: i.doneById,
    createdAt: iso(i.createdAt),
  };
}

// ───────────────────────── เช็คลิสต์ (ชุด) ─────────────────────────

const checklistCreateInput = z
  .object({
    title: z.string().trim().min(1).max(120).describe("Name of the checklist, for example 'Steps' or 'Before delivery'."),
  })
  .strict();

const checklistsCreate = defineKanbanOp({
  id: "checklists.create",
  method: "POST",
  path: "/cards/{id}/checklists",
  kind: "write",
  action: "kanban.card.update",
  summary: "Add a checklist to a card. A card can hold several checklists, each with its own items.",
  label: "เพิ่มเช็คลิสต์ในการ์ด",
  tool: { name: "kanban_add_checklist", hint: "Use this to break a task card into sub-steps." },
  input: checklistCreateInput,
  test: "K1.15-S1.3",
  async handler({ actor, params, input }) {
    const row = await createChecklist(kanbanCtxOf(actor), params.id!, input.title);
    return checklistRow(row);
  },
});

const checklistUpdateInput = z
  .object({ title: z.string().trim().min(1).max(120).describe("New name of the checklist.") })
  .strict();

const checklistsUpdate = defineKanbanOp({
  id: "checklists.update",
  method: "PATCH",
  path: "/checklists/{id}",
  kind: "write",
  action: "kanban.card.update",
  summary: "Rename one checklist.",
  label: "แก้ชื่อเช็คลิสต์",
  input: checklistUpdateInput,
  test: "K1.15-S1.2",
  async handler({ actor, params, input }) {
    const row = await renameChecklist(kanbanCtxOf(actor), params.id!, input.title);
    return checklistRow(row);
  },
});

const checklistsDelete = defineKanbanOp({
  id: "checklists.delete",
  method: "DELETE",
  path: "/checklists/{id}",
  // 🔴 `write` ไม่ใช่ `danger` โดยตั้งใจ: ของที่หายคือ "รายการที่พิมพ์เอง" ไม่กี่บรรทัด สร้างใหม่ได้ในไม่กี่วินาที
  //    (ต่างจากบอร์ด/คอลัมน์/การ์ดที่พาของทั้งกองหายไปจากสายตาทีม) — บังคับ confirm+reason กับของแบบนี้
  //    ทำให้ผู้เชื่อมต่อเริ่มส่ง confirm แบบอัตโนมัติจนด่านของจริงเสียความหมาย
  kind: "write",
  action: "kanban.card.update",
  summary: "Delete a whole checklist and every item inside it. Items are removed for good, not archived.",
  label: "ลบเช็คลิสต์",
  test: "K1.15-S1.2",
  async handler({ actor, params }) {
    await deleteChecklist(kanbanCtxOf(actor), params.id!);
    return { ok: true, checklistId: params.id! };
  },
});

// ───────────────────────── รายการในเช็คลิสต์ ─────────────────────────

const itemCreateInput = z
  .object({
    text: z.string().trim().min(1).max(500).describe("What has to be done in this step."),
    assigneeUserId: z
      .string()
      .max(40)
      .nullable()
      .optional()
      .describe("Staff member responsible for this step. Must be a member of this shop."),
    dueAt: isoDate.nullable().optional().describe("Due date and time of this step."),
  })
  .strict();

const itemsCreate = defineKanbanOp({
  id: "checklist-items.create",
  method: "POST",
  path: "/checklists/{id}/items",
  kind: "write",
  action: "kanban.card.update",
  summary: "Add one item to the end of a checklist, optionally assigned to a person and with its own due date.",
  label: "เพิ่มรายการในเช็คลิสต์",
  input: itemCreateInput,
  test: "K1.15-S1.2",
  async handler({ actor, params, input }) {
    const row = await addItem(kanbanCtxOf(actor), params.id!, input.text, {
      assigneeUserId: input.assigneeUserId ?? null,
      dueAt: toDate(input.dueAt) ?? null,
    });
    return checklistItemRow(row);
  },
});

const itemUpdateInput = z
  .object({
    text: z.string().trim().min(1).max(500).optional().describe("New text of the item."),
    assigneeUserId: z.string().max(40).nullable().optional().describe("New assignee. Send null to clear it."),
    dueAt: isoDate.nullable().optional().describe("New due date. Send null to clear it."),
    done: z.boolean().optional().describe("true ticks the item off, false un-ticks it."),
  })
  .strict();

const itemsUpdate = defineKanbanOp({
  id: "checklist-items.update",
  method: "PATCH",
  path: "/checklist-items/{id}",
  kind: "write",
  action: "kanban.card.update",
  summary: "Change the text, assignee or due date of one checklist item, and/or tick it off. Sending only done just ticks it.",
  label: "แก้/ติ๊กรายการเช็คลิสต์",
  input: itemUpdateInput,
  test: "K1.15-S1.3",
  async handler({ actor, params, input }) {
    const ctx = kanbanCtxOf(actor);
    const itemId = params.id!;
    const patch: EditChecklistItemInput = {
      ...(input.text !== undefined ? { text: input.text } : {}),
      ...(input.assigneeUserId !== undefined ? { assigneeUserId: input.assigneeUserId } : {}),
      ...(input.dueAt !== undefined ? { dueAt: toDate(input.dueAt) ?? null } : {}),
    };

    // 🔴 ลำดับ "แก้ก่อน แล้วค่อยติ๊ก" มีเหตุผล: `toggleItem` เป็นตัวที่เขียนประวัติ CHECKLIST_ITEM_DONE
    //    (เก็บสำเนา `text` ไว้ในแถวประวัติ) และยิง outbox `kanban.checklist.completed` ⇒ ถ้าติ๊กก่อนแก้
    //    ประวัติจะจำข้อความเก่าที่ผู้เรียกเพิ่งสั่งเปลี่ยนในคำขอเดียวกัน
    if (input.done === undefined) return checklistItemRow(await editItem(ctx, itemId, patch));
    if (Object.keys(patch).length > 0) await editItem(ctx, itemId, patch);
    return checklistItemRow(await toggleItem(ctx, itemId, input.done));
  },
});

const itemsDelete = defineKanbanOp({
  id: "checklist-items.delete",
  method: "DELETE",
  path: "/checklist-items/{id}",
  kind: "write",
  action: "kanban.card.update",
  summary: "Delete one checklist item.",
  label: "ลบรายการเช็คลิสต์",
  test: "K1.15-S1.2",
  async handler({ actor, params }) {
    await deleteItem(kanbanCtxOf(actor), params.id!);
    return { ok: true, itemId: params.id! };
  },
});

const itemMoveInput = z
  .object({
    beforeItemId: z.string().max(40).nullable().optional().describe("Put the item immediately before this item of the same checklist."),
    afterItemId: z
      .string()
      .max(40)
      .nullable()
      .optional()
      .describe("Put the item immediately after this item. Ignored when beforeItemId is given. Sending neither moves the item to the end."),
  })
  .strict();

const itemsMove = defineKanbanOp({
  id: "checklist-items.move",
  method: "POST",
  path: "/checklist-items/{id}/move",
  kind: "write",
  action: "kanban.card.update",
  summary: "Reorder one item inside its checklist by naming its new neighbour. Returns the new position key.",
  label: "ย้ายลำดับรายการเช็คลิสต์",
  input: itemMoveInput,
  test: "K1.15-S1.2",
  async handler({ actor, params, input }) {
    // บริการรับ `{ beforeItemId?: string; afterItemId?: string }` (ไม่รับ null) — `null` ของผู้เรียกแปลว่า
    // "ไม่ระบุเพื่อนบ้าน" เท่ากับไม่ส่งช่องนั้นมา ⇒ ตัดทิ้งก่อนส่งต่อ ไม่ใช่ส่ง null ลงไปให้ชนชนิด
    const row = await moveItem(kanbanCtxOf(actor), params.id!, {
      ...(input.beforeItemId ? { beforeItemId: input.beforeItemId } : {}),
      ...(input.afterItemId ? { afterItemId: input.afterItemId } : {}),
    });
    return { ok: true, itemId: row.id, checklistId: row.checklistId, position: row.position };
  },
});

export const CHECKLISTS_OPS: ApiOp[] = [
  checklistsCreate,
  checklistsUpdate,
  checklistsDelete,
  itemsCreate,
  itemsUpdate,
  itemsDelete,
  itemsMove,
];
