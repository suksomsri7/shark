// ops/boards.ts — op ของ "บอร์ด": รายการ · เปิดบอร์ด · สรุป · สร้าง/แก้/เก็บ/กู้คืน · ดาว · สมาชิก · ประวัติ · คลัง
//
// 🔴 กติกาของทุก op ในโมดูลนี้ (ทำตามให้ครบทุกไฟล์ `ops/*.ts`):
//   1. เรียก **service เดิม** เท่านั้น — ห้ามเขียน query เอง (ตรรกะ/ประวัติ/เหตุการณ์อยู่ที่ service แล้ว)
//   2. ด่านบทบาทบอร์ดต้องมีเสมอ: service ตัวไหนตรวจให้แล้วก็ปล่อยผ่าน · ตัวไหนไม่ตรวจ (ตัวรุ่นเก่าที่รับ
//      `tenantId, systemId` ตรง ๆ) ต้อง `assertBoardRole(...)` เองก่อน — แบบเดียวกับที่ `actions.ts` ทำ
//   3. คืนค่าผ่าน `../serialize.ts` เสมอ (ห้ามคืนแถว Prisma ดิบ — Date/tenantId จะหลุด)
//   4. บอร์ดที่คีย์มองไม่เห็น = 404 (`KanbanNotFoundError`) ไม่ใช่ 403 — แกน REST แปลงให้เองแล้ว

import { z } from "zod";
import { listArchived } from "../../archive";
import { listBoardActivity } from "../../activity";
import {
  addMember,
  assertBoardRole,
  listMembers,
  removeMember,
  setBoardVisibility,
  setMemberRole,
  starBoard,
  unstarBoard,
} from "../../members";
import {
  archiveBoard,
  createBoard,
  getBoardFor,
  listBoardsFor,
  renameBoard,
  unarchiveBoard,
  updateBoardFields,
} from "../../service";
import { createBoardFromTemplate } from "../../templates";
import { kanbanActorOf, kanbanCtxOf } from "../actor";
import { defineKanbanOp, type ApiOp } from "../op";
import { boardRow, cardRow, columnRow } from "../serialize";

const BOARD_COLORS = ["SLATE", "BLUE", "GREEN", "AMBER", "RED", "PURPLE"] as const;
const VISIBILITY = ["PRIVATE", "TENANT"] as const;
const BOARD_ROLES = ["VIEWER", "EDITOR", "ADMIN"] as const;

/** ธงใน query string มาเป็นข้อความเสมอ — `"true"`/`"false"` เท่านั้น (ค่าอื่นเด้ง 422 ไม่ใช่เดาให้) */
const flag = z.enum(["true", "false"]).transform((v) => v === "true");

const boardsListInput = z
  .object({
    includeArchived: flag.optional().describe("Include boards that were archived. Default false."),
  })
  .strict();

const boardsList = defineKanbanOp({
  id: "boards.list",
  method: "GET",
  path: "/boards",
  kind: "read",
  action: "kanban.board.read",
  summary: "List every board of this task board system with its card count.",
  label: "รายการบอร์ด",
  tool: { name: "kanban_list_boards", hint: "Use this first to turn a board name into the boardId other tools need." },
  input: boardsListInput,
  test: "K1.15-S2.3",
  async handler({ actor, input }) {
    const ctx = kanbanCtxOf(actor);
    const rows = await listBoardsFor(ctx, kanbanActorOf(actor), input.includeArchived === true);
    return rows.map((b) => boardRow(b));
  },
});

const boardsGet = defineKanbanOp({
  id: "boards.get",
  method: "GET",
  path: "/boards/{id}",
  kind: "read",
  action: "kanban.board.read",
  summary: "Open one board with its active columns and the cards inside each column, plus the role this key has on it.",
  label: "เปิดบอร์ด",
  tool: { name: "kanban_get_board", hint: "Use this to see the columns of a board and what is currently on it." },
  test: "K1.15-S2.4",
  async handler({ actor, params }) {
    const ctx = kanbanCtxOf(actor);
    const board = await getBoardFor(ctx, kanbanActorOf(actor), params.id!);
    return {
      ...boardRow(board, { cardCount: board.columns.reduce((n, c) => n + c.cards.length, 0) }),
      role: board.role,
      columns: board.columns.map((c) => ({ ...columnRow(c), cards: c.cards.map(cardRow) })),
    };
  },
});

const boardsSummary = defineKanbanOp({
  id: "boards.summary",
  method: "GET",
  path: "/boards/{id}/summary",
  kind: "read",
  action: "kanban.board.read",
  summary: "Counts for one board: cards per column, how many are done, overdue or unassigned.",
  label: "สรุปบอร์ด",
  tool: { name: "kanban_board_summary", hint: "Use this to answer 'how is board X doing' without listing every card." },
  test: "K1.15-S1.3",
  async handler({ actor, params }) {
    const ctx = kanbanCtxOf(actor);
    const board = await getBoardFor(ctx, kanbanActorOf(actor), params.id!);
    const cards = board.columns.flatMap((c) => c.cards);
    const now = Date.now();
    return {
      boardId: board.id,
      name: board.name,
      cardCount: cards.length,
      doneCount: cards.filter((c) => c.completedAt !== null).length,
      overdueCount: cards.filter((c) => c.completedAt === null && c.dueAt !== null && c.dueAt.getTime() < now).length,
      unassignedCount: cards.filter((c) => c.assigneeUserId === null).length,
      columns: board.columns.map((c) => ({
        id: c.id,
        name: c.name,
        cardCount: c.cards.length,
        wipLimit: c.wipLimit,
        isDoneColumn: c.isDoneColumn,
      })),
    };
  },
});

const boardsCreateInput = z
  .object({
    name: z.string().trim().min(1).max(120).describe("Board name."),
    description: z.string().max(2000).nullable().optional(),
    unitId: z.string().max(40).nullable().optional().describe("Business unit (branch) the board belongs to. Null = whole company."),
    visibility: z.enum(VISIBILITY).optional().describe("PRIVATE (default) or TENANT (everyone in the shop can read it)."),
    color: z.enum(BOARD_COLORS).optional(),
    template: z
      .string()
      .max(60)
      .optional()
      .describe("Key or id of a board template (from GET /templates). When given, the board is created with the template columns, labels and cards."),
  })
  .strict();

const boardsCreate = defineKanbanOp({
  id: "boards.create",
  method: "POST",
  path: "/boards",
  kind: "write",
  action: "kanban.board.create",
  summary: "Create a board, optionally from a template.",
  label: "สร้างบอร์ด",
  tool: { name: "kanban_create_board", hint: "Use this when the shop asks for a new board of work." },
  input: boardsCreateInput,
  test: "K1.15-S1.3",
  async handler({ actor, input }) {
    const ctx = kanbanCtxOf(actor);
    if (input.template) {
      const board = await createBoardFromTemplate(ctx, kanbanActorOf(actor), input.template, {
        name: input.name,
        unitId: input.unitId ?? null,
        ...(input.visibility ? { visibility: input.visibility } : {}),
      });
      return boardRow(board, { cardCount: 0 });
    }
    const board = await createBoard({
      tenantId: ctx.tenantId,
      systemId: ctx.systemId,
      name: input.name,
      description: input.description ?? null,
      unitId: input.unitId ?? null,
      ...(input.visibility ? { visibility: input.visibility } : {}),
      ...(input.color ? { color: input.color } : {}),
      createdById: ctx.actorUserId ?? null,
    });
    return boardRow(board, { cardCount: 0 });
  },
});

const boardsUpdateInput = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    description: z.string().max(2000).nullable().optional(),
    unitId: z.string().max(40).nullable().optional(),
    visibility: z.enum(VISIBILITY).optional(),
    color: z.enum(BOARD_COLORS).optional(),
  })
  .strict();

const boardsUpdate = defineKanbanOp({
  id: "boards.update",
  method: "PATCH",
  path: "/boards/{id}",
  kind: "write",
  action: "kanban.board.rename",
  summary: "Change the name, description, colour, branch or visibility of a board. Requires the ADMIN role on that board.",
  label: "แก้ไขบอร์ด",
  input: boardsUpdateInput,
  test: "K1.15-S1.3",
  async handler({ actor, params, input }) {
    const ctx = kanbanCtxOf(actor);
    const boardId = params.id!;
    // ตั้งค่าบอร์ด = ADMIN ของบอร์ดใบนั้น (เหมือน `renameBoardAction`) · มองไม่เห็น = 404
    await assertBoardRole(ctx, boardId, "ADMIN");
    if (input.name !== undefined) await renameBoard(ctx.tenantId, ctx.systemId, boardId, input.name, ctx.actorUserId ?? null);
    await updateBoardFields(ctx, boardId, {
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.color !== undefined ? { color: input.color } : {}),
      ...(input.unitId !== undefined ? { unitId: input.unitId } : {}),
    });
    if (input.visibility !== undefined) await setBoardVisibility(ctx, boardId, input.visibility);
    const board = await getBoardFor(ctx, kanbanActorOf(actor), boardId);
    return { ...boardRow(board, { cardCount: board.columns.reduce((n, c) => n + c.cards.length, 0) }), role: board.role };
  },
});

/** `confirm` ถูกตรวจและถอดออกที่ dispatch กลางแล้ว — schema ของ danger เห็นแค่ `reason` */
const dangerInput = z.object({ reason: z.string().min(5).describe("Why this is being archived. Stored in the audit log.") }).strict();

const boardsArchive = defineKanbanOp({
  id: "boards.archive",
  method: "DELETE",
  path: "/boards/{id}",
  kind: "danger",
  action: "kanban.board.delete",
  summary: "Archive a whole board. The board and everything on it disappears from the app until it is restored.",
  label: "เก็บบอร์ดเข้าคลัง",
  input: dangerInput,
  test: "K1.15-S1.4",
  async handler({ actor, params }) {
    const ctx = kanbanCtxOf(actor);
    await assertBoardRole(ctx, params.id!, "ADMIN");
    await archiveBoard(ctx.tenantId, ctx.systemId, params.id!, ctx.actorUserId ?? null);
    return { ok: true, boardId: params.id!, status: "ARCHIVED" };
  },
});

const boardsRestore = defineKanbanOp({
  id: "boards.restore",
  method: "POST",
  path: "/boards/{id}/restore",
  kind: "write",
  action: "kanban.board.delete",
  summary: "Bring an archived board back into the app.",
  label: "กู้บอร์ดคืน",
  test: "K1.15-S1.3",
  async handler({ actor, params }) {
    const ctx = kanbanCtxOf(actor);
    await assertBoardRole(ctx, params.id!, "ADMIN");
    await unarchiveBoard(ctx.tenantId, ctx.systemId, params.id!, ctx.actorUserId ?? null);
    return { ok: true, boardId: params.id!, status: "ACTIVE" };
  },
});

const boardsStarInput = z.object({ starred: z.boolean().describe("true = star the board, false = remove the star.") }).strict();

const boardsStar = defineKanbanOp({
  id: "boards.star",
  method: "PUT",
  path: "/boards/{id}/star",
  kind: "write",
  action: "kanban.board.read",
  summary: "Star or unstar a board. The star belongs to the user who created this API key.",
  label: "ติดดาวบอร์ด",
  input: boardsStarInput,
  test: "K1.15-S1.3",
  async handler({ actor, params, input }) {
    const ctx = kanbanCtxOf(actor);
    if (input.starred) await starBoard(ctx, params.id!);
    else await unstarBoard(ctx, params.id!);
    return { ok: true, boardId: params.id!, starred: input.starred };
  },
});

const boardsMembersList = defineKanbanOp({
  id: "boards.members.list",
  method: "GET",
  path: "/boards/{id}/members",
  kind: "read",
  action: "kanban.board.read",
  summary: "List the people explicitly invited to this board and their board role.",
  label: "รายชื่อสมาชิกบอร์ด",
  test: "K1.15-S2.15",
  async handler({ actor, params }) {
    const rows = await listMembers(kanbanCtxOf(actor), params.id!);
    return rows.map((m) => ({ userId: m.userId, name: m.name, email: m.email, role: m.role, tenantRole: m.tenantRole }));
  },
});

const memberAddInput = z
  .object({
    userId: z.string().min(1).max(40).describe("User id of a staff member of this shop."),
    role: z.enum(BOARD_ROLES).optional().describe("Board role. Default EDITOR."),
  })
  .strict();

const boardsMembersAdd = defineKanbanOp({
  id: "boards.members.add",
  method: "POST",
  path: "/boards/{id}/members",
  kind: "write",
  action: "kanban.board.member.manage",
  summary: "Invite a staff member to a board (or change the role of someone already invited).",
  label: "เพิ่มสมาชิกบอร์ด",
  input: memberAddInput,
  test: "K1.15-S2.15",
  async handler({ actor, params, input }) {
    const row = await addMember(kanbanCtxOf(actor), params.id!, input.userId, input.role ?? "EDITOR");
    return { ok: true, boardId: params.id!, userId: row.userId, role: row.role };
  },
});

const memberUpdateInput = z.object({ role: z.enum(BOARD_ROLES).describe("New board role.") }).strict();

const boardsMembersUpdate = defineKanbanOp({
  id: "boards.members.update",
  method: "PATCH",
  path: "/boards/{id}/members/{userId}",
  kind: "write",
  action: "kanban.board.member.manage",
  summary: "Change the board role of one member. The last declared ADMIN of a board cannot be demoted.",
  label: "เปลี่ยนบทบาทสมาชิกบอร์ด",
  input: memberUpdateInput,
  test: "K1.15-S2.15",
  async handler({ actor, params, input }) {
    await setMemberRole(kanbanCtxOf(actor), params.id!, params.userId!, input.role);
    return { ok: true, boardId: params.id!, userId: params.userId!, role: input.role };
  },
});

/** เหตุผลของการถอดสมาชิก — ข้อความต่างจาก `dangerInput` (ไม่ได้ "เก็บเข้าคลัง" อะไรทั้งนั้น) */
const memberRemoveInput = z
  .object({ reason: z.string().min(5).describe("Why this person is being removed from the board. Stored in the audit log.") })
  .strict();

const boardsMembersRemove = defineKanbanOp({
  id: "boards.members.remove",
  method: "DELETE",
  path: "/boards/{id}/members/{userId}",
  kind: "danger",
  action: "kanban.board.member.manage",
  summary: "Remove a member from a board. On a private board that person immediately stops seeing it.",
  label: "ถอดสมาชิกออกจากบอร์ด",
  input: memberRemoveInput,
  test: "K1.15-S1.4",
  async handler({ actor, params }) {
    await removeMember(kanbanCtxOf(actor), params.id!, params.userId!);
    return { ok: true, boardId: params.id!, userId: params.userId!, removed: true };
  },
});

const activityInput = z
  .object({
    take: z.coerce.number().int().min(1).max(100).optional().describe("How many entries to return. Default 20."),
    cursor: z.string().max(200).optional().describe("`nextCursor` of the previous page."),
  })
  .strict();

const boardsActivity = defineKanbanOp({
  id: "boards.activity",
  method: "GET",
  path: "/boards/{id}/activity",
  kind: "read",
  action: "kanban.board.read",
  summary: "History of everything that happened on a board, newest first.",
  label: "ประวัติของบอร์ด",
  input: activityInput,
  test: "K1.15-S1.3",
  async handler({ actor, params, input }) {
    const page = await listBoardActivity(kanbanCtxOf(actor), params.id!, {
      take: input.take,
      cursor: input.cursor ?? null,
    });
    return { items: page.items, nextCursor: page.nextCursor };
  },
});

const archivedInput = z.object({ q: z.string().max(200).optional().describe("Filter by card or column name.") }).strict();

const boardsArchived = defineKanbanOp({
  id: "boards.archived",
  method: "GET",
  path: "/boards/{id}/archive",
  kind: "read",
  action: "kanban.board.read",
  summary: "What is in the archive of this board: archived cards and archived columns.",
  label: "คลังเก็บของบอร์ด",
  input: archivedInput,
  test: "K1.15-S1.3",
  async handler({ actor, params, input }) {
    const res = await listArchived(kanbanCtxOf(actor), params.id!, { q: input.q });
    return {
      cards: res.cards.map((c) => ({
        id: c.id,
        cardNo: c.cardNo,
        title: c.title,
        columnName: c.columnName,
        archivedAt: c.archivedAt,
        archivedBy: c.archivedBy,
      })),
      columns: res.columns.map((c) => ({
        id: c.id,
        name: c.name,
        cardCount: c.cardCount,
        archivedAt: c.archivedAt,
      })),
    };
  },
});

export const BOARDS_OPS: ApiOp[] = [
  boardsList,
  boardsGet,
  boardsSummary,
  boardsCreate,
  boardsUpdate,
  boardsArchive,
  boardsRestore,
  boardsStar,
  boardsMembersList,
  boardsMembersAdd,
  boardsMembersUpdate,
  boardsMembersRemove,
  boardsActivity,
  boardsArchived,
];
