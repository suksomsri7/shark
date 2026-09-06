// ops/labels.ts — op ของ "ป้ายกำกับ": รายการ · สร้าง · แก้ชื่อ/สี · ลบ
//
// 🔴 กติกาเดียวกับ `ops/boards.ts` (อ่านหัวไฟล์นั้นก่อน): เรียก service เดิมเท่านั้น · ด่านบทบาทบอร์ดต้องมีเสมอ ·
//    ไม่คืนแถวดิบ · บอร์ด/ป้ายที่คีย์มองไม่เห็น = 404
//
// 🔴 `labels.ts` ทั้งไฟล์ตรวจแค่ "ป้าย/บอร์ดนี้อยู่ในร้าน+ระบบเดียวกับ ctx ไหม" (`requireBoard`/`requireLabel`)
//    **ไม่ตรวจบทบาทในบอร์ด** ⇒ ทุก op ที่นี่ต้อง `assertBoardRole(...)` เองก่อน เหมือนที่ `createLabelAction` ทำ
//    (ป้ายเป็นของบอร์ด: อ่าน = VIEWER · แก้ = EDITOR ขึ้นไป)

import { z } from "zod";
import { createLabel, deleteLabel, listLabels, updateLabel } from "../../labels";
import { assertBoardRole, assertLabelRole } from "../../members";
import { kanbanCtxOf } from "../actor";
import { defineKanbanOp, type ApiOp } from "../op";

/** 6 สีตามดีไซน์ (D9) — ตรงกับ `KanbanLabelColor` ใน schema · เขียนเป็น literal เพื่อให้ OpenAPI เห็นค่าที่รับได้ */
const LABEL_COLORS = ["SLATE", "BLUE", "GREEN", "AMBER", "RED", "PURPLE"] as const;

const labelsList = defineKanbanOp({
  id: "labels.list",
  method: "GET",
  path: "/boards/{id}/labels",
  kind: "read",
  action: "kanban.board.read",
  summary: "List the labels of a board with how many cards carry each one.",
  label: "รายการป้ายกำกับ",
  test: "K1.15-S1.2",
  async handler({ actor, params }) {
    const ctx = kanbanCtxOf(actor);
    const boardId = params.id!;
    // อ่านป้ายของบอร์ดลับได้ = รู้ว่าบอร์ดนั้นมีจริง ⇒ ต้องผ่านด่าน VIEWER ก่อน (มองไม่เห็น = 404)
    await assertBoardRole(ctx, boardId, "VIEWER");
    const rows = await listLabels(ctx, boardId);
    return rows.map((l) => ({ id: l.id, name: l.name, color: l.color, sortOrder: l.sortOrder, cardCount: l.cardCount }));
  },
});

const labelsCreateInput = z
  .object({
    name: z.string().trim().min(1).max(40).describe("Label name. Must be unique inside the board."),
    color: z.enum(LABEL_COLORS).describe("One of the six label colours."),
  })
  .strict();

const labelsCreate = defineKanbanOp({
  id: "labels.create",
  method: "POST",
  path: "/boards/{id}/labels",
  kind: "write",
  action: "kanban.label.manage",
  summary: "Create a label on a board. Labels belong to one board, not to the whole shop.",
  label: "สร้างป้ายกำกับ",
  input: labelsCreateInput,
  test: "K1.15-S1.3",
  async handler({ actor, params, input }) {
    const ctx = kanbanCtxOf(actor);
    const boardId = params.id!;
    await assertBoardRole(ctx, boardId, "EDITOR");
    const label = await createLabel(ctx, boardId, { name: input.name, color: input.color });
    return { id: label.id, boardId: label.boardId, name: label.name, color: label.color, sortOrder: label.sortOrder };
  },
});

const labelsUpdateInput = z
  .object({
    name: z.string().trim().min(1).max(40).optional().describe("New label name. Must stay unique inside the board."),
    color: z.enum(LABEL_COLORS).optional().describe("New colour."),
  })
  // ไม่รับ `sortOrder`: ลำดับป้ายเป็นเรื่องของหน้าจอ ยังไม่มีคนสั่งจากภายนอก (เปิดทีหลังได้ ไม่ผิดสัญญา)
  .strict();

const labelsUpdate = defineKanbanOp({
  id: "labels.update",
  method: "PATCH",
  path: "/labels/{id}",
  kind: "write",
  action: "kanban.label.manage",
  summary: "Rename a label or change its colour. Renaming updates every card that carries it.",
  label: "แก้ไขป้ายกำกับ",
  input: labelsUpdateInput,
  test: "K1.15-S1.2",
  async handler({ actor, params, input }) {
    const ctx = kanbanCtxOf(actor);
    const labelId = params.id!;
    // ป้ายอยู่บอร์ดไหน หาเองจากตัวป้าย (path ไม่มี boardId) แล้วค่อยตรวจบทบาท EDITOR — 404 ถ้ามองไม่เห็น
    await assertLabelRole(ctx, labelId, "EDITOR");
    const label = await updateLabel(ctx, labelId, {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.color !== undefined ? { color: input.color } : {}),
    });
    return { id: label.id, boardId: label.boardId, name: label.name, color: label.color, sortOrder: label.sortOrder };
  },
});

const labelsDelete = defineKanbanOp({
  id: "labels.delete",
  method: "DELETE",
  path: "/labels/{id}",
  // kind = write ไม่ใช่ danger: ลบป้ายแค่ปลดมันออกจากการ์ด — ไม่มีการ์ด/งานใบไหนหายไป
  // (ของที่ย้อนกลับยาก เช่น เก็บบอร์ด/คอลัมน์/การ์ด จึงจะเป็น danger ที่ต้อง confirm + reason)
  kind: "write",
  action: "kanban.label.manage",
  summary: "Delete a label. The label is removed from every card that carried it; no card is deleted.",
  label: "ลบป้ายกำกับ",
  test: "K1.15-S1.2",
  async handler({ actor, params }) {
    const ctx = kanbanCtxOf(actor);
    const labelId = params.id!;
    // ป้ายอยู่บอร์ดไหน หาเองจากตัวป้าย (path ไม่มี boardId) แล้วค่อยตรวจบทบาท EDITOR — 404 ถ้ามองไม่เห็น
    await assertLabelRole(ctx, labelId, "EDITOR");
    const res = await deleteLabel(ctx, labelId);
    return { ok: true, labelId, cardsTouched: res.cardsTouched };
  },
});

export const LABELS_OPS: ApiOp[] = [labelsList, labelsCreate, labelsUpdate, labelsDelete];
