// ops/views.ts — op ของ "มุมมองที่บันทึกไว้" (K2.5 · เปิดผ่าน REST ใน K2.12)
//
// กติกาเดียวกับ `ops/boards.ts` (อ่านหัวไฟล์นั้นก่อน) — ตัวตัดสินสิทธิ์จริงอยู่ที่ `views.ts` เอง
// (`saveView`/`loadEditableView`/`loadVisibleView`) ⇒ op ที่นี่ไม่ต้อง `assertBoardRole` ซ้ำ:
//   - อ่าน/บันทึก PRIVATE = เห็นบอร์ด (VIEWER+) ก็พอ
//   - บันทึก/ลบมุมมองของทั้งทีม (scope BOARD) = ADMIN ของบอร์ดนั้น (`views.ts` โยน Forbidden เอง)
//   - มุมมอง PRIVATE ของคนอื่น = 404 เสมอ (§6.3 — ไม่บอกว่ามีอยู่จริง)

import { z } from "zod";
import { deleteView, listViews, saveView } from "../../views";
import { kanbanActorOf, kanbanCtxOf } from "../actor";
import { defineKanbanOp, type ApiOp } from "../op";

const viewsList = defineKanbanOp({
  id: "views.list",
  method: "GET",
  path: "/boards/{id}/views",
  kind: "read",
  action: "kanban.board.read",
  summary: "Saved views of a board: the whole team's first, then this key's own private ones.",
  label: "รายการมุมมองที่บันทึกไว้",
  test: "K2.12-S3.1",
  async handler({ actor, params }) {
    const ctx = kanbanCtxOf(actor);
    return listViews(ctx, kanbanActorOf(actor), params.id!);
  },
});

const viewsCreateInput = z
  .object({
    name: z.string().trim().min(1).max(60).describe("Name of the saved view."),
    scope: z.enum(["PRIVATE", "BOARD"]).optional().describe("PRIVATE (default, only this key's owning user) or BOARD (the whole team — requires the ADMIN role)."),
    config: z
      .record(z.string(), z.unknown())
      .describe("View configuration: { view: 'board'|'table'|'calendar'|'summary'|'timeline', filters?, sort?, group?, zoom? } — same shape the app writes into the URL."),
  })
  .strict();

const viewsCreate = defineKanbanOp({
  id: "views.create",
  method: "POST",
  path: "/boards/{id}/views",
  kind: "write",
  action: "kanban.board.read",
  summary: "Save the current filters/sort/grouping of a board as a named view.",
  label: "บันทึกมุมมอง",
  input: viewsCreateInput,
  test: "K2.12-S3.1",
  async handler({ actor, params, input }) {
    const ctx = kanbanCtxOf(actor);
    return saveView(ctx, kanbanActorOf(actor), {
      boardId: params.id!,
      name: input.name,
      ...(input.scope ? { scope: input.scope } : {}),
      config: input.config,
    });
  },
});

const viewsDelete = defineKanbanOp({
  id: "views.delete",
  method: "DELETE",
  path: "/views/{id}",
  kind: "write",
  action: "kanban.board.read",
  summary: "Delete a saved view. A private view may only be deleted by the key it belongs to; a team view needs the ADMIN role on that board.",
  label: "ลบมุมมองที่บันทึกไว้",
  test: "K2.12-S3.1",
  async handler({ actor, params }) {
    const ctx = kanbanCtxOf(actor);
    await deleteView(ctx, kanbanActorOf(actor), params.id!);
    return { ok: true, viewId: params.id! };
  },
});

export const VIEWS_OPS: ApiOp[] = [viewsList, viewsCreate, viewsDelete];
