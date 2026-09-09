// ops/cards.ts — op ของ "การ์ดงาน": รายการ (+CSV) · รายละเอียด · สร้าง/แก้/ย้าย/ทำสำเนา · เสร็จ · เก็บ/กู้คืน ·
//                 ผู้รับผิดชอบ · ป้าย · ประวัติ
//
// กติกาเดียวกับ `ops/boards.ts` (อ่านหัวไฟล์นั้นก่อน) — เพิ่มอีก 2 ข้อที่เป็นของการ์ดโดยเฉพาะ:
//   · `moveCard` / `completeCard` คืน `{ok:false, code}` เมื่อ "ผู้ใช้ทำถูกแต่โลกเปลี่ยนไปแล้ว"
//     (การ์ดถูกเก็บ · คอลัมน์เต็ม WIP · คอลัมน์คนละบอร์ด) ⇒ REST ต้องแปลงเป็น 409 พร้อมรหัสที่แยกออกจากกันได้
//     ไม่ใช่ 200 ที่มี ok:false ปนอยู่ (ผู้เชื่อมต่อจะเข้าใจว่าย้ายสำเร็จ)
//   · `createCard` เป็นบริการรุ่นเก่าที่ไม่ตรวจบทบาทบอร์ดให้ ⇒ ต้อง `assertBoardRole(..., "EDITOR")` เอง
//     และต้องตรวจว่า "คอลัมน์ที่ส่งมาอยู่ในบอร์ดตาม path จริง" ไม่งั้นยิงคอลัมน์ของบอร์ดอื่นผ่าน path บอร์ดที่ตัวเองเห็นได้

import { z } from "zod";
import { csvRow } from "@/lib/core/csv";
import { ApiError } from "@/lib/api/respond";
import { listCardActivity } from "../../activity";
import { KanbanNotFoundError } from "../../access";
import {
  archiveCard,
  duplicateCard,
  getCardDetail,
  getCardFullDetail,
  restoreCard,
  setCardAssignees,
  updateCardFields,
} from "../../cards";
import { getCardFieldValues, setCardFieldValue } from "../../fields";
import { setCardLabels } from "../../labels";
import { assertBoardRole } from "../../members";
// K3.7 — การ์ดสะท้อน (mirror)
import { mirrorCard } from "../../mirror";
import { moveCard } from "../../moves";
import { completeCard } from "../../my-tasks";
import { describeRecurrence, setCardRecurrence } from "../../recurrence";
import { createCard, getBoardFor } from "../../service";
import { kanbanActorOf, kanbanCtxOf } from "../actor";
import { defineKanbanOp, type ApiOp } from "../op";
import { cardRow, type ApiCardRow } from "../serialize";

/** วันเวลาที่ผู้เรียกส่งมา (ISO-8601) → Date · `null` = ล้างค่า */
const isoDate = z.iso.datetime({ offset: true }).describe("ISO-8601 timestamp in UTC, for example 2026-10-05T10:00:00.000Z");

function toDate(v: string | null | undefined): Date | null | undefined {
  if (v === undefined) return undefined;
  if (v === null) return null;
  return new Date(v);
}

const cardsListInput = z
  .object({
    columnId: z.string().max(40).optional().describe("Only cards in this column."),
    assignee: z.string().max(40).optional().describe("Only cards assigned to this user id."),
    status: z.enum(["open", "done", "all"]).optional().describe("open (not completed, default), done, or all."),
    q: z.string().max(200).optional().describe("Free text on the card title."),
    includeArchived: z.enum(["true", "false"]).transform((v) => v === "true").optional().describe("Include archived cards. Default false."),
  })
  .strict();

const cardsList = defineKanbanOp({
  id: "cards.list",
  method: "GET",
  path: "/boards/{id}/cards",
  kind: "read",
  action: "kanban.board.read",
  summary: "List the cards of one board, with column, assignee, status and text filters.",
  label: "รายการการ์ดของบอร์ด",
  tool: { name: "kanban_list_cards", hint: "Use this to see what is on a board, optionally filtered by column or assignee." },
  input: cardsListInput,
  test: "K1.15-S2.16",
  // ตารางแบบแบน (ไม่มีคอลัมน์ซ้อน) — เจ้าของร้านเอาไปเปิดใน Excel ได้ตรง ๆ
  // 🔴 ทุกช่องผ่าน `csvRow` เสมอ (กัน CSV injection) · BOM เติมที่ dispatch กลางที่เดียว
  csv: (_ctx, data) => {
    const rows = Array.isArray(data) ? (data as ApiCardRow[]) : [];
    const head = csvRow(["cardNo", "title", "columnId", "status", "assigneeUserId", "dueAt", "completedAt", "labels"]);
    const body = rows.map((c) =>
      csvRow([c.cardNo, c.title, c.columnId, c.status, c.assigneeUserId, c.dueAt, c.completedAt, c.labels.join(" ")]),
    );
    return [head, ...body].join("\n");
  },
  async handler({ actor, params, input }) {
    const ctx = kanbanCtxOf(actor);
    const board = await getBoardFor(ctx, kanbanActorOf(actor), params.id!);
    const q = input.q?.trim().toLowerCase();
    const status = input.status ?? "open";
    return board.columns
      .flatMap((c) => c.cards)
      .filter((c) => (input.columnId ? c.columnId === input.columnId : true))
      .filter((c) => (input.assignee ? c.assigneeUserId === input.assignee : true))
      .filter((c) => (status === "all" ? true : status === "done" ? c.completedAt !== null : c.completedAt === null))
      .filter((c) => (q ? c.title.toLowerCase().includes(q) : true))
      .map(cardRow);
  },
});

const cardsGet = defineKanbanOp({
  id: "cards.get",
  method: "GET",
  path: "/cards/{id}",
  kind: "read",
  action: "kanban.board.read",
  summary: "Read one card with its description, checklists, comments and attachments.",
  label: "เปิดการ์ด",
  test: "K1.15-S1.3",
  async handler({ actor, params }) {
    return getCardDetail(kanbanCtxOf(actor), params.id!);
  },
});

const cardsCreateInput = z
  .object({
    columnId: z.string().min(1).max(40).describe("Column the card starts in (must belong to this board)."),
    title: z.string().trim().min(1).max(300).describe("What has to be done."),
    description: z.string().max(20000).nullable().optional().describe("Longer description (HTML is sanitised)."),
    assigneeUserId: z.string().max(40).nullable().optional().describe("User id responsible for the card."),
    dueAt: isoDate.nullable().optional().describe("Due date and time."),
    startAt: isoDate.nullable().optional().describe("Start date and time."),
    labels: z.array(z.string().min(1).max(60)).max(10).optional().describe("Label names; labels that do not exist yet are created on the board."),
  })
  .strict();

const cardsCreate = defineKanbanOp({
  id: "cards.create",
  method: "POST",
  path: "/boards/{id}/cards",
  kind: "write",
  action: "kanban.card.create",
  summary: "Create a card in a column of this board.",
  label: "สร้างการ์ดงาน",
  tool: { name: "kanban_create_card", hint: "Use this to put a new task on a board." },
  input: cardsCreateInput,
  test: "K1.15-S2.5",
  async handler({ actor, params, input }) {
    const ctx = kanbanCtxOf(actor);
    const boardId = params.id!;
    // `createCard` (บริการรุ่นเก่า) ไม่ตรวจบทบาท ⇒ ด่านอยู่ที่นี่ เหมือน `createCardAction`
    await assertBoardRole(ctx, boardId, "EDITOR");
    const card = await createCard({
      tenantId: ctx.tenantId,
      systemId: ctx.systemId,
      columnId: input.columnId,
      title: input.title,
      description: input.description ?? null,
      assigneeUserId: input.assigneeUserId ?? null,
      dueAt: toDate(input.dueAt) ?? null,
      startAt: toDate(input.startAt) ?? null,
      labels: input.labels ?? [],
      // ที่มาของการ์ด: enum `KanbanCardSourceType` ยังไม่มีค่า `API` (จะเพิ่มต้องมี migration ของ enum)
      // ⇒ ใช้ `AUTOMATION` ซึ่งหมายถึง "ระบบภายนอกเป็นคนสร้าง ไม่ใช่คนกดบนจอ" — ตรงความหมายที่สุดที่มีอยู่
      sourceType: "AUTOMATION",
      createdById: ctx.actorUserId ?? null,
    });
    if (!card) throw new KanbanNotFoundError("ไม่พบคอลัมน์ปลายทางในบอร์ดนี้");
    // 🔴 คอลัมน์ของบอร์ดอื่นในระบบเดียวกันต้องไม่ผ่าน path ของบอร์ดนี้ (การ์ดจะไปโผล่ผิดบอร์ด)
    if (card.boardId !== boardId) {
      throw new ApiError(
        422,
        "validation",
        "คอลัมน์ที่ระบุไม่ได้อยู่ในบอร์ดนี้",
        "The column does not belong to the board in the path.",
        undefined,
        [{ path: "columnId", message: "ต้องเป็นคอลัมน์ของบอร์ดใน path" }],
      );
    }
    return cardRow(card);
  },
});

const cardsUpdateInput = z
  .object({
    title: z.string().trim().min(1).max(300).optional(),
    description: z.string().max(20000).nullable().optional(),
    dueAt: isoDate.nullable().optional(),
    startAt: isoDate.nullable().optional(),
    reminderMinutesBefore: z.number().int().min(0).max(43200).nullable().optional().describe("Remind this many minutes before the due time."),
  })
  .strict();

const cardsUpdate = defineKanbanOp({
  id: "cards.update",
  method: "PATCH",
  path: "/cards/{id}",
  kind: "write",
  action: "kanban.card.update",
  summary: "Change the title, description, dates or reminder of a card.",
  label: "แก้ไขการ์ดงาน",
  tool: { name: "kanban_update_card", hint: "Use this to rename a task or change its due date." },
  input: cardsUpdateInput,
  test: "K1.15-S2.8",
  async handler({ actor, params, input }) {
    const card = await updateCardFields(kanbanCtxOf(actor), params.id!, {
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.dueAt !== undefined ? { dueAt: toDate(input.dueAt) ?? null } : {}),
      ...(input.startAt !== undefined ? { startAt: toDate(input.startAt) ?? null } : {}),
      ...(input.reminderMinutesBefore !== undefined ? { reminderMinutesBefore: input.reminderMinutesBefore } : {}),
    });
    return cardRow(card);
  },
});

const cardsMoveInput = z
  .object({
    toColumnId: z.string().min(1).max(40).describe("Column the card ends up in (same board)."),
    beforeCardId: z.string().max(40).nullable().optional().describe("Put the card immediately before this card."),
    afterCardId: z.string().max(40).nullable().optional().describe("Put the card immediately after this card. Ignored when beforeCardId is given."),
    force: z.boolean().optional().describe("Ignore the WIP limit of the target column. Requires the ADMIN role on the board."),
  })
  .strict();

/** `{ok:false,code}` ของ moves.ts → สถานะ HTTP ที่ผู้เชื่อมต่อแยกแยะได้ (ห้ามตอบ 200 ทั้งที่ไม่ได้ย้าย) */
function moveFailure(code: string, message: string): ApiError {
  if (code === "NOT_FOUND") {
    return new ApiError(404, "not_found", message, "The card or the target column was not found.");
  }
  if (code === "WIP_LIMIT") {
    return new ApiError(409, "state_conflict", message, "The target column is at its WIP limit. Send force: true as a board ADMIN to override.", "ส่ง force: true (ต้องเป็น ADMIN ของบอร์ด) เพื่อข้ามเพดาน");
  }
  return new ApiError(409, "state_conflict", message, "The card is not in a state that allows this move.");
}

const cardsMove = defineKanbanOp({
  id: "cards.move",
  method: "POST",
  path: "/cards/{id}/move",
  kind: "write",
  action: "kanban.card.move",
  summary: "Move a card to another column and/or another position, by naming its new neighbours.",
  label: "ย้ายการ์ดงาน",
  tool: { name: "kanban_move_card", hint: "Use this to move a task to another column, for example into 'doing' or 'done'." },
  input: cardsMoveInput,
  test: "K1.15-S2.7",
  async handler({ actor, params, input }) {
    const res = await moveCard(kanbanCtxOf(actor), {
      cardId: params.id!,
      toColumnId: input.toColumnId,
      beforeCardId: input.beforeCardId ?? null,
      afterCardId: input.afterCardId ?? null,
      ...(input.force !== undefined ? { force: input.force } : {}),
    });
    if (!res.ok) throw moveFailure(res.code, res.message);
    return {
      ok: true,
      cardId: res.card.id,
      columnId: res.card.columnId,
      position: res.position,
      placedAt: res.placedAt,
      completedAt: res.card.completedAt ? res.card.completedAt.toISOString() : null,
    };
  },
});

const dangerInput = z.object({ reason: z.string().min(5).describe("Why the card is being archived. Stored in the audit log.") }).strict();

const cardsArchive = defineKanbanOp({
  id: "cards.archive",
  method: "DELETE",
  path: "/cards/{id}",
  kind: "danger",
  action: "kanban.card.delete",
  summary: "Archive a card. It leaves the board and lives in the board archive until restored.",
  label: "เก็บการ์ดเข้าคลัง",
  tool: { name: "kanban_archive_card", hint: "Use this when a task should disappear from the board.", risk: "DESTRUCTIVE" },
  input: dangerInput,
  test: "K1.15-S2.12",
  async handler({ actor, params }) {
    const card = await archiveCard(kanbanCtxOf(actor), params.id!);
    return cardRow(card);
  },
});

const cardsRestore = defineKanbanOp({
  id: "cards.restore",
  method: "POST",
  path: "/cards/{id}/restore",
  kind: "write",
  action: "kanban.card.delete",
  summary: "Bring an archived card back onto the board.",
  label: "กู้การ์ดคืน",
  test: "K1.15-S1.3",
  async handler({ actor, params }) {
    const card = await restoreCard(kanbanCtxOf(actor), params.id!);
    return cardRow(card);
  },
});

const cardsDuplicate = defineKanbanOp({
  id: "cards.duplicate",
  method: "POST",
  path: "/cards/{id}/duplicate",
  kind: "write",
  action: "kanban.card.create",
  summary: "Copy a card (description, dates, labels, assignees and checklists) into the same column.",
  label: "ทำสำเนาการ์ด",
  test: "K1.15-S1.3",
  async handler({ actor, params }) {
    const card = await duplicateCard(kanbanCtxOf(actor), params.id!);
    return cardRow(card);
  },
});

const cardsMirrorInput = z
  .object({
    toBoardId: z.string().min(1).max(40).describe("Board to reflect this card onto (must not be the card's own board)."),
    toColumnId: z.string().max(40).optional().describe("Column on the target board. Defaults to the board's first column."),
  })
  .strict();

// K3.7 — สะท้อนการ์ดไปบอร์ดอื่น: EDITOR ทั้ง 2 บอร์ด (ตรวจใน mirrorCard เอง) · idempotent (มีอยู่แล้ว → คืน id เดิม)
const cardsMirror = defineKanbanOp({
  id: "cards.mirror",
  method: "POST",
  path: "/cards/{id}/mirror",
  kind: "write",
  action: "kanban.card.create",
  summary: "Reflect a card onto another board — one shared task, editable from either board. Not for cards that are already a mirror.",
  label: "สะท้อนการ์ด",
  input: cardsMirrorInput,
  test: "K3.7-S2.1",
  async handler({ actor, params, input }) {
    const res = await mirrorCard(kanbanCtxOf(actor), { cardId: params.id!, toBoardId: input.toBoardId, toColumnId: input.toColumnId ?? null });
    return { ok: true, mirrorId: res.mirrorId, boardId: res.boardId, boardName: res.boardName, cardNo: res.cardNo };
  },
});

const cardsComplete = defineKanbanOp({
  id: "cards.complete",
  method: "POST",
  path: "/cards/{id}/complete",
  kind: "write",
  action: "kanban.card.move",
  summary: "Mark a card done by moving it into the board's done column.",
  label: "ทำเครื่องหมายว่าเสร็จ",
  tool: { name: "kanban_complete_card", hint: "Use this when someone says a task is finished." },
  test: "K1.15-S1.3",
  async handler({ actor, params }) {
    const res = await completeCard(kanbanCtxOf(actor), params.id!);
    if (!res.ok) {
      if (res.code === "NO_DONE_COLUMN") {
        throw new ApiError(409, "state_conflict", res.message, "This board has no column flagged as the done column.");
      }
      throw moveFailure(res.code, res.message);
    }
    return { ok: true, cardId: params.id!, fromColumnId: res.fromColumnId, undoToken: res.undoToken };
  },
});

const assigneesInput = z
  .object({
    userIds: z.array(z.string().min(1).max(40)).max(20).describe("Complete list of user ids responsible for this card. The first one owns the legacy single-assignee field."),
  })
  .strict();

const cardsAssignees = defineKanbanOp({
  id: "cards.assignees.set",
  method: "PUT",
  path: "/cards/{id}/assignees",
  kind: "write",
  action: "kanban.card.update",
  summary: "Replace the list of people responsible for a card. Everyone newly added is notified.",
  label: "ตั้งผู้รับผิดชอบการ์ด",
  tool: { name: "kanban_assign_card", hint: "Use this to give a task to one or more staff members." },
  input: assigneesInput,
  test: "K1.15-S1.3",
  async handler({ actor, params, input }) {
    const res = await setCardAssignees(kanbanCtxOf(actor), params.id!, input.userIds);
    return { ok: true, cardId: params.id!, assigneeUserIds: res.assigneeUserIds, added: res.added };
  },
});

const labelsInput = z
  .object({
    labelIds: z.array(z.string().min(1).max(40)).max(20).describe("Complete list of label ids of this board (from GET /boards/{id}/labels)."),
  })
  .strict();

const cardsLabels = defineKanbanOp({
  id: "cards.labels.set",
  method: "PUT",
  path: "/cards/{id}/labels",
  kind: "write",
  action: "kanban.card.update",
  summary: "Replace the labels on a card.",
  label: "ตั้งป้ายกำกับของการ์ด",
  tool: { name: "kanban_set_labels", hint: "Use this to tag a task, for example as urgent." },
  input: labelsInput,
  test: "K1.15-S1.3",
  async handler({ actor, params, input }) {
    const labelIds = await setCardLabels(kanbanCtxOf(actor), params.id!, input.labelIds);
    return { ok: true, cardId: params.id!, labelIds };
  },
});

const activityInput = z
  .object({
    take: z.coerce.number().int().min(1).max(100).optional().describe("How many entries to return. Default 20."),
    cursor: z.string().max(200).optional().describe("`nextCursor` of the previous page."),
  })
  .strict();

const cardsActivity = defineKanbanOp({
  id: "cards.activity",
  method: "GET",
  path: "/cards/{id}/activity",
  kind: "read",
  action: "kanban.board.read",
  summary: "History of one card, newest first.",
  label: "ประวัติของการ์ด",
  input: activityInput,
  test: "K1.15-S1.3",
  async handler({ actor, params, input }) {
    const page = await listCardActivity(kanbanCtxOf(actor), params.id!, {
      take: input.take,
      cursor: input.cursor ?? null,
    });
    return { items: page.items, nextCursor: page.nextCursor };
  },
});

// ───────────────────────── K2.12: ค่าฟิลด์กำหนดเอง + กำหนดส่งซ้ำ ─────────────────────────

const cardsFieldsSetInput = z
  .object({
    value: z
      .union([z.string().max(500), z.number(), z.boolean()])
      .nullable()
      .describe("Value matching the field's type (text/number/checkbox/select option/ISO date string). null clears the value."),
  })
  .strict();

const cardsFieldsSet = defineKanbanOp({
  id: "cards.fields.set",
  method: "PUT",
  path: "/cards/{id}/fields/{fieldId}",
  kind: "write",
  action: "kanban.card.update",
  summary: "Set (or clear with null) the value of one custom field on a card.",
  label: "ตั้งค่าฟิลด์กำหนดเองของการ์ด",
  input: cardsFieldsSetInput,
  test: "K2.12-S3.1",
  async handler({ actor, params, input }) {
    const ctx = kanbanCtxOf(actor);
    const cardId = params.id!;
    const fieldId = params.fieldId!;
    let value: unknown = input.value ?? null;
    if (value !== null) {
      // ต้องรู้ชนิดฟิลด์ก่อนแปลงสตริงวันที่ให้เป็น Date จริง (`fields.ts#coerceValue` รับ Date instance
      // ของชนิด DATE เท่านั้น) — เรียกผ่าน service เดิม ไม่ query prisma ตรง ๆ (กติกาข้อ 1 ของโมดูล ops/*)
      const existing = await getCardFieldValues(ctx, kanbanActorOf(actor), cardId);
      const field = existing.find((f) => f.fieldId === fieldId);
      if (field?.type === "DATE" && typeof value === "string") {
        const d = new Date(value);
        if (Number.isNaN(d.getTime())) {
          throw new ApiError(422, "validation", "รูปแบบวันที่ไม่ถูกต้อง", "value must be a valid ISO-8601 date for this field.", undefined, [
            { path: "value", message: "must be a valid date" },
          ]);
        }
        value = d;
      }
    }
    return setCardFieldValue(ctx, kanbanActorOf(actor), cardId, fieldId, value);
  },
});

const cardsRecurrenceSetInput = z
  .object({
    rule: z
      .string()
      .max(120)
      .nullable()
      .describe("RRULE subset: FREQ=DAILY[;INTERVAL=n] | FREQ=WEEKLY;BYDAY=MO,TH[;INTERVAL=n] | FREQ=MONTHLY;BYMONTHDAY=d[;INTERVAL=n]. null clears the recurrence."),
  })
  .strict();

const cardsRecurrenceSet = defineKanbanOp({
  id: "cards.recurrence.set",
  method: "PUT",
  path: "/cards/{id}/recurrence",
  kind: "write",
  action: "kanban.card.update",
  summary: "Set (or clear with null) the recurrence rule of a card. The card must already have a due date.",
  label: "ตั้งกำหนดส่งซ้ำของการ์ด",
  input: cardsRecurrenceSetInput,
  test: "K2.12-S3.1",
  async handler({ actor, params, input }) {
    const ctx = kanbanCtxOf(actor);
    await setCardRecurrence(ctx, kanbanActorOf(actor), params.id!, input.rule ?? null);
    return { ok: true, cardId: params.id!, rule: input.rule ?? null, label: input.rule ? describeRecurrence(input.rule) : null };
  },
});

// ───────────────────── K3.5: อ่านการ์ดฉบับเต็ม + ตั้งกำหนดส่ง (เครื่องมือ AI §8.2) ─────────────────────
// 🔴 ทำไมต้องมี `cards.detail` ทั้งที่มี `cards.get` อยู่แล้ว: `cards.get` คืน `CardDetailDto` ซึ่งเป็น
//    "ส่วนที่หน้าบอร์ดยังไม่มี" (ไม่มีชื่อการ์ด/บอร์ด/คอลัมน์/ผู้รับผิดชอบ · รายละเอียดเป็น HTML)
//    ผู้ช่วย AI กับผู้เชื่อมต่อภายนอกต้องการ "การ์ดทั้งใบเป็นข้อความล้วน" ในคำขอเดียว ⇒ op แยกตัว
//    (สัญญาของ `cards.get` เป็นของหน้าจอมาตั้งแต่ K1.15 — เปลี่ยนรูปร่างมันคือการหักสัญญาผู้เชื่อมต่อเดิม)

const cardsDetail = defineKanbanOp({
  id: "cards.detail",
  method: "GET",
  path: "/cards/{id}/detail",
  kind: "read",
  action: "kanban.board.read",
  summary:
    "Read one card in full: description as plain text, board and column, assignees, due date, labels, checklists with their items, recent comments and the SHARK records the card is linked to.",
  label: "อ่านการ์ดฉบับเต็ม",
  tool: {
    name: "kanban_card_detail",
    hint: "Use this before answering any question about one specific task, or before drafting a reply about it.",
  },
  test: "K3.5-S2.1",
  async handler({ actor, params }) {
    return getCardFullDetail(kanbanCtxOf(actor), params.id!);
  },
});

const cardsSetDueInput = z
  .object({
    dueAt: isoDate.nullable().describe("Due date and time. null clears the due date."),
    startAt: isoDate.nullable().optional().describe("Start date and time."),
    reminderMinutesBefore: z
      .number()
      .int()
      .min(0)
      .max(43200)
      .nullable()
      .optional()
      .describe("Remind the people responsible this many minutes before the due time."),
  })
  .strict();

const cardsSetDue = defineKanbanOp({
  id: "cards.setDue",
  method: "POST",
  path: "/cards/{id}/due",
  kind: "write",
  action: "kanban.card.update",
  summary: "Set or clear the due date of a card, with an optional start date and reminder.",
  label: "ตั้งกำหนดส่งของการ์ด",
  tool: { name: "kanban_set_due", hint: "Use this when someone says when a task has to be finished." },
  input: cardsSetDueInput,
  test: "K3.5-S3.1",
  async handler({ actor, params, input }) {
    const card = await updateCardFields(kanbanCtxOf(actor), params.id!, {
      dueAt: toDate(input.dueAt) ?? null,
      ...(input.startAt !== undefined ? { startAt: toDate(input.startAt) ?? null } : {}),
      ...(input.reminderMinutesBefore !== undefined ? { reminderMinutesBefore: input.reminderMinutesBefore } : {}),
    });
    return cardRow(card);
  },
});

export const CARDS_OPS: ApiOp[] = [
  cardsList,
  cardsGet,
  cardsCreate,
  cardsUpdate,
  cardsMove,
  cardsArchive,
  cardsRestore,
  cardsDuplicate,
  cardsMirror,
  cardsComplete,
  cardsAssignees,
  cardsLabels,
  cardsActivity,
  cardsFieldsSet,
  cardsRecurrenceSet,
  // K3.5 — เครื่องมือ AI §8.2
  cardsDetail,
  cardsSetDue,
];
