// ops/fields.ts — op ของ "ฟิลด์กำหนดเอง" ของบอร์ด (K2.6 · เปิดผ่าน REST ใน K2.12)
//
// กติกาเดียวกับ `ops/boards.ts` (อ่านหัวไฟล์นั้นก่อน) — ตัวตัดสินสิทธิ์จริงอยู่ที่ `fields.ts` เอง
// (`assertBoardRole` เรียกจากในนั้นแล้ว: อ่าน = VIEWER · นิยามฟิลด์ (สร้าง/แก้/ลบ) = ADMIN) ⇒ ไม่ต้องตรวจซ้ำที่นี่

import { z } from "zod";
import { createField, deleteField, listFields, updateField } from "../../fields";
import { kanbanActorOf, kanbanCtxOf } from "../actor";
import { defineKanbanOp, type ApiOp } from "../op";

const FIELD_TYPES = ["TEXT", "NUMBER", "DATE", "CHECKBOX", "SELECT"] as const;

const optionsInput = z
  .object({
    choices: z.array(z.string().trim().min(1).max(60)).max(50).optional().describe("SELECT only: the list of choices. Required (at least one) when type is SELECT."),
    unit: z.string().trim().max(20).optional().describe("NUMBER only: unit label shown after the value, for example 'บาท'."),
    decimals: z.number().int().min(0).max(4).optional().describe("NUMBER only: how many decimal places to display."),
  })
  .strict();

const fieldsList = defineKanbanOp({
  id: "fields.list",
  method: "GET",
  path: "/boards/{id}/fields",
  kind: "read",
  action: "kanban.board.read",
  summary: "List the custom fields defined on a board, in display order.",
  label: "รายการฟิลด์กำหนดเอง",
  test: "K2.12-S3.1",
  async handler({ actor, params }) {
    const ctx = kanbanCtxOf(actor);
    return listFields(ctx, kanbanActorOf(actor), params.id!);
  },
});

const fieldsCreateInput = z
  .object({
    name: z.string().trim().min(1).max(60).describe("Field name. Must be unique inside the board."),
    type: z.enum(FIELD_TYPES).describe("TEXT, NUMBER, DATE, CHECKBOX or SELECT. Cannot be changed after creation."),
    options: optionsInput.optional(),
    showOnCard: z.boolean().optional().describe("Show this field as a chip on the card face and as a table column. Default false."),
  })
  .strict();

const fieldsCreate = defineKanbanOp({
  id: "fields.create",
  method: "POST",
  path: "/boards/{id}/fields",
  kind: "write",
  action: "kanban.board.read",
  summary: "Create a custom field on a board (up to 20 per board). Requires the ADMIN role on that board.",
  label: "สร้างฟิลด์กำหนดเอง",
  input: fieldsCreateInput,
  test: "K2.12-S3.1",
  async handler({ actor, params, input }) {
    const ctx = kanbanCtxOf(actor);
    return createField(ctx, kanbanActorOf(actor), params.id!, {
      name: input.name,
      type: input.type,
      ...(input.options ? { options: input.options } : {}),
      ...(input.showOnCard !== undefined ? { showOnCard: input.showOnCard } : {}),
    });
  },
});

const fieldsUpdateInput = z
  .object({
    name: z.string().trim().min(1).max(60).optional().describe("New field name. Must stay unique inside the board."),
    options: optionsInput.optional().describe("SELECT choices / NUMBER unit and decimals. Replaces the previous options object."),
    showOnCard: z.boolean().optional(),
  })
  .strict();

const fieldsUpdate = defineKanbanOp({
  id: "fields.update",
  method: "PATCH",
  path: "/fields/{id}",
  kind: "write",
  action: "kanban.board.read",
  summary: "Rename a field, change its SELECT choices / NUMBER unit, or toggle whether it shows on the card face. The field type itself cannot change. Requires the ADMIN role.",
  label: "แก้ไขฟิลด์กำหนดเอง",
  input: fieldsUpdateInput,
  test: "K2.12-S3.1",
  async handler({ actor, params, input }) {
    const ctx = kanbanCtxOf(actor);
    return updateField(ctx, kanbanActorOf(actor), params.id!, {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.options !== undefined ? { options: input.options } : {}),
      ...(input.showOnCard !== undefined ? { showOnCard: input.showOnCard } : {}),
    });
  },
});

const fieldsDelete = defineKanbanOp({
  id: "fields.delete",
  method: "DELETE",
  path: "/fields/{id}",
  // kind = write ไม่ใช่ danger: ลบฟิลด์เอาค่าของทุกการ์ดออกไปด้วยจริง แต่ไม่มี "งาน" ใบไหนหายไป —
  // เข้าเกณฑ์เดียวกับ `labels.delete` (ย้อนกลับยากในแง่ข้อมูล แต่ไม่ใช่ความเสียหายเชิงธุรกิจ)
  kind: "write",
  action: "kanban.board.read",
  summary: "Delete a custom field. The value stored on every card is removed too; no card is deleted. Requires the ADMIN role.",
  label: "ลบฟิลด์กำหนดเอง",
  test: "K2.12-S3.1",
  async handler({ actor, params }) {
    const ctx = kanbanCtxOf(actor);
    await deleteField(ctx, kanbanActorOf(actor), params.id!);
    return { ok: true, fieldId: params.id! };
  },
});

export const FIELDS_OPS: ApiOp[] = [fieldsList, fieldsCreate, fieldsUpdate, fieldsDelete];
