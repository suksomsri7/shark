// ops/inbox.ts — op ของ "กล่องงานเข้าส่วนตัว" (K2.8 · เปิดผ่าน REST ใน K2.12)
//
// 🔴 กล่องงานเข้าเป็นของ**คนเดียว** เสมอ (แม้เจ้าของร้านก็ดูของคนอื่นไม่ได้ — สัญญา K2.8) ⇒ ทุก op ที่นี่
//    ทำงานกับกล่องของ "ผู้ใช้ที่คีย์นี้ผูกไว้" เท่านั้น (`ctx.actorUserId` — คีย์ที่ไม่รู้ว่าใครสร้างจะถูก
//    ปฏิเสธโดย `inbox.ts#requireActor` เอง ด้วยข้อความไทยเดียวกับหน้าจอ)
// 🔴 `inbox.ts` ตรวจสิทธิ์เองครบแล้ว (ความเป็นเจ้าของ + บทบาทของคอลัมน์ปลายทางตอนส่งเข้าบอร์ด) ⇒ ไม่ต้อง
//    `assertBoardRole`/`assertColumnRole` ซ้ำที่นี่

import { z } from "zod";
import { listInbox, moveToBoard, quickAdd } from "../../inbox";
import { kanbanCtxOf } from "../actor";
import { defineKanbanOp, type ApiOp } from "../op";

const inboxList = defineKanbanOp({
  id: "inbox.list",
  method: "GET",
  path: "/inbox",
  kind: "read",
  action: "kanban.board.read",
  summary: "Open items of the task inbox belonging to the user this key was created by, newest first.",
  label: "รายการกล่องงานเข้า",
  test: "K2.12-S3.1",
  async handler({ actor }) {
    const ctx = kanbanCtxOf(actor);
    return listInbox(ctx, ctx.actorUserId ?? "");
  },
});

const inboxQuickAddInput = z
  .object({
    title: z.string().trim().min(1).max(300).describe("What has to be done. Jotted down for later, not yet placed on any board."),
  })
  .strict();

const inboxQuickAdd = defineKanbanOp({
  id: "inbox.quickAdd",
  method: "POST",
  path: "/inbox",
  kind: "write",
  action: "kanban.card.create",
  summary: "Jot a task into the personal inbox of the user this key was created by, to be sorted onto a board later.",
  label: "จดงานเข้ากล่องงานเข้า",
  tool: { name: "kanban_inbox_add", hint: "Use this when the shop owner mentions something to do but does not say which board or column it belongs on yet." },
  input: inboxQuickAddInput,
  test: "K2.12-S3.1",
  async handler({ actor, input }) {
    const ctx = kanbanCtxOf(actor);
    return quickAdd(ctx, { title: input.title });
  },
});

const inboxMoveInput = z
  .object({
    boardId: z.string().min(1).max(40).describe("Board the inbox item becomes a card on."),
    columnId: z.string().min(1).max(40).describe("Column of that board the card starts in."),
    dueAt: z.iso.datetime({ offset: true }).nullable().optional().describe("Due date and time, ISO-8601 UTC."),
    assigneeUserIds: z.array(z.string().min(1).max(40)).max(20).optional().describe("Extra people to assign, on top of the user this key was created by (who owns the inbox item)."),
  })
  .strict();

const inboxMove = defineKanbanOp({
  id: "inbox.move",
  method: "POST",
  path: "/inbox/{id}/move",
  kind: "write",
  action: "kanban.card.create",
  summary: "Turn an inbox item into a real card on a board and close the inbox item.",
  label: "ส่งเข้าบอร์ด",
  input: inboxMoveInput,
  test: "K2.12-S3.1",
  async handler({ actor, params, input }) {
    const ctx = kanbanCtxOf(actor);
    return moveToBoard(ctx, {
      itemId: params.id!,
      boardId: input.boardId,
      columnId: input.columnId,
      dueAt: input.dueAt ? new Date(input.dueAt) : null,
      ...(input.assigneeUserIds ? { assigneeUserIds: input.assigneeUserIds } : {}),
    });
  },
});

export const INBOX_OPS: ApiOp[] = [inboxList, inboxQuickAdd, inboxMove];
