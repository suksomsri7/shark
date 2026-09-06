// ops/columns.ts — op ของ "คอลัมน์": รายการ · สร้าง · แก้ชื่อ/เพดาน/ธงเสร็จ · ย้ายซ้าย-ขวา · เก็บ/กู้คืน · ย้ายการ์ดออกทั้งคอลัมน์
//
// 🔴 กติกาเดียวกับ `ops/boards.ts` (อ่านหัวไฟล์นั้นก่อน): เรียก service เดิมเท่านั้น · ด่านบทบาทบอร์ดต้องมีเสมอ ·
//    คืนค่าผ่าน `../serialize.ts` · บอร์ด/คอลัมน์ที่คีย์มองไม่เห็น = 404
//
// ใครตรวจบทบาทให้แล้วบ้าง (สำคัญ — จะได้ไม่ตรวจซ้ำ/ไม่ลืมตรวจ):
//   `moves.ts` (renameColumn · moveColumn · setColumnWip · setColumnDone · archiveColumn · moveAllCards)
//   และ `archive.restoreColumn` เรียก `assertColumnRole(...)` ในตัวเองแล้ว ⇒ op ปล่อยผ่านได้
//   `service.createColumn` เป็นตัวรุ่นเก่าที่รับ `tenantId, systemId` ตรง ๆ **ไม่ตรวจอะไรเลย**
//   ⇒ ต้อง `assertBoardRole(ctx, boardId, "EDITOR")` เองก่อน เหมือน `createColumnAction`

import { z } from "zod";
import { KanbanNotFoundError } from "../../access";
import { restoreColumn } from "../../archive";
import { assertBoardRole, assertColumnRole } from "../../members";
import {
  archiveColumn,
  moveAllCards,
  moveColumn,
  renameColumn,
  setColumnDone,
  setColumnWip,
} from "../../moves";
import { createColumn, getBoardFor } from "../../service";
import { kanbanActorOf, kanbanCtxOf } from "../actor";
import { defineKanbanOp, type ApiOp } from "../op";
import { columnRow } from "../serialize";

const columnsList = defineKanbanOp({
  id: "columns.list",
  method: "GET",
  path: "/boards/{id}/columns",
  kind: "read",
  action: "kanban.board.read",
  summary: "List the active columns of a board with how many cards are in each.",
  label: "รายการคอลัมน์",
  test: "K1.15-S1.2",
  async handler({ actor, params }) {
    const ctx = kanbanCtxOf(actor);
    // `getBoardFor` ตรวจ "มองเห็นบอร์ดนี้ไหม" ให้แล้ว (มองไม่เห็น = 404) และคืนเฉพาะคอลัมน์/การ์ด ACTIVE
    // ⇒ ไม่ต้อง assert ซ้ำ และไม่ต้องนับการ์ดเอง (คอลัมน์ที่อยู่ในคลังต้องดูที่ `GET /boards/{id}/archive`)
    const board = await getBoardFor(ctx, kanbanActorOf(actor), params.id!);
    return board.columns.map((c) => ({ ...columnRow(c), cardCount: c.cards.length }));
  },
});

const columnsCreateInput = z
  .object({ name: z.string().trim().min(1).max(60).describe("Column name, for example 'In progress'.") })
  .strict();

const columnsCreate = defineKanbanOp({
  id: "columns.create",
  method: "POST",
  path: "/boards/{id}/columns",
  kind: "write",
  action: "kanban.column.create",
  summary: "Add a column to the end of a board.",
  label: "เพิ่มคอลัมน์",
  input: columnsCreateInput,
  test: "K1.15-S1.3",
  async handler({ actor, params, input }) {
    const ctx = kanbanCtxOf(actor);
    const boardId = params.id!;
    // คอลัมน์ = EDITOR ขึ้นไป (เหมือน `createColumnAction`) · `createColumn` เป็นตัวรุ่นเก่าที่ไม่ตรวจสิทธิ์เอง
    await assertBoardRole(ctx, boardId, "EDITOR");
    const column = await createColumn(ctx.tenantId, ctx.systemId, boardId, input.name, ctx.actorUserId ?? null);
    // service คืน `null` เมื่อหาบอร์ดไม่เจอ — แปลงเป็น 404 ตามกติกา §6.3 (ด่านข้างบนกันเคสนี้ไว้เกือบหมดแล้ว
    // แต่บอร์ดอาจถูกลบไประหว่างสองคำสั่ง ⇒ ห้ามปล่อยเป็น `null` ออกไปให้ผู้เรียกเดาเอง)
    if (!column) throw new KanbanNotFoundError();
    return columnRow(column);
  },
});

const columnsUpdateInput = z
  .object({
    name: z.string().trim().min(1).max(60).optional().describe("New column name."),
    wipLimit: z
      .number()
      .int()
      .min(0)
      .max(999)
      .nullable()
      .optional()
      .describe("How many cards may sit in this column at once. 0 or null = no limit. Requires the ADMIN role on that board."),
    isDoneColumn: z
      .boolean()
      .optional()
      .describe("Mark this column as the 'done' column: cards moved here are counted as completed. Requires the ADMIN role."),
  })
  // 🔴 ไม่รับ `color`: วันนี้ยังไม่มี service ตั้งสีคอลัมน์ (หน้าจอก็ยังตั้งไม่ได้) และกติกาข้อ 1 ห้ามเขียน query เอง
  //    ⇒ ตั้งใจเบี่ยงจากพิมพ์เขียว — เปิดฟิลด์นี้เมื่อมี service จริงแล้วเท่านั้น (เพิ่มฟิลด์ทีหลังไม่ผิดสัญญา API)
  .strict();

const columnsUpdate = defineKanbanOp({
  id: "columns.update",
  method: "PATCH",
  path: "/columns/{id}",
  kind: "write",
  action: "kanban.column.create",
  summary: "Rename a column, set its work-in-progress limit, or turn it into the done column.",
  label: "แก้ไขคอลัมน์",
  input: columnsUpdateInput,
  test: "K1.15-S1.2",
  async handler({ actor, params, input }) {
    const ctx = kanbanCtxOf(actor);
    const columnId = params.id!;
    // ตรวจ EDITOR ตรงนี้ครั้งเดียวเพื่อ **หา boardId จากคอลัมน์จริง** (ไว้อ่านผลกลับตอนท้าย) ไม่ใช่เพื่อกันสิทธิ์ซ้ำ —
    // ตัวตั้งค่าแต่ละตัวใน `moves.ts` ตรวจยศของมันเองอยู่แล้ว (ชื่อ = EDITOR · เพดาน/ธงเสร็จ = ADMIN ตาม D16)
    const { boardId } = await assertColumnRole(ctx, columnId, "EDITOR");
    if (input.name !== undefined) await renameColumn(ctx, columnId, input.name);
    if (input.wipLimit !== undefined) {
      // service รับ 1..n หรือ null เท่านั้น · ผู้เรียกฝั่ง REST มักส่ง 0 แทน "ไม่จำกัด"
      // ⇒ แปลง 0 เป็น null ที่นี่ ไม่ปล่อยให้ไปเจอข้อความ error ของ service แบบงง ๆ
      await setColumnWip(ctx, columnId, input.wipLimit === 0 ? null : input.wipLimit);
    }
    if (input.isDoneColumn !== undefined) await setColumnDone(ctx, columnId, input.isDoneColumn);

    const board = await getBoardFor(ctx, kanbanActorOf(actor), boardId);
    const column = board.columns.find((c) => c.id === columnId);
    if (!column) throw new KanbanNotFoundError("ไม่พบคอลัมน์นี้");
    return { ...columnRow(column), cardCount: column.cards.length };
  },
});

const columnsMoveInput = z
  .object({
    beforeColumnId: z.string().max(40).nullable().optional().describe("Put this column immediately to the left of that column."),
    afterColumnId: z.string().max(40).nullable().optional().describe("Put this column immediately to the right of that column."),
  })
  // ไม่ส่งสมอมาเลย = ย้ายไปท้ายบอร์ด (ความหมายเดียวกับหน้าจอ) ⇒ ไม่บังคับให้มีอย่างน้อยหนึ่งฟิลด์
  .strict();

const columnsMove = defineKanbanOp({
  id: "columns.move",
  method: "POST",
  path: "/columns/{id}/move",
  kind: "write",
  action: "kanban.card.move",
  summary: "Move a column left or right. Without an anchor the column goes to the end of the board.",
  label: "ย้ายคอลัมน์",
  input: columnsMoveInput,
  test: "K1.15-S1.3",
  async handler({ actor, params, input }) {
    // `moveColumn` เรียก `assertColumnRole(..., "EDITOR")` เองแล้ว — ไม่ตรวจซ้ำ
    const res = await moveColumn(kanbanCtxOf(actor), {
      columnId: params.id!,
      beforeColumnId: input.beforeColumnId ?? null,
      afterColumnId: input.afterColumnId ?? null,
    });
    return { ok: true, columnId: params.id!, position: res.position, placedAt: res.placedAt };
  },
});

/** `confirm` ถูกตรวจและถอดออกที่ dispatch กลางแล้ว — schema ของ danger เห็นแค่ `reason` */
const dangerInput = z.object({ reason: z.string().min(5).describe("Why this is being archived. Stored in the audit log.") }).strict();

const columnsArchive = defineKanbanOp({
  id: "columns.archive",
  method: "DELETE",
  path: "/columns/{id}",
  kind: "danger",
  action: "kanban.column.delete",
  summary: "Archive a column. The column must be empty first: move its cards away with POST /columns/{id}/move-all.",
  label: "เก็บคอลัมน์เข้าคลัง",
  input: dangerInput,
  test: "K1.15-S1.4",
  async handler({ actor, params }) {
    // ใช้ `moves.archiveColumn` (ไม่ใช่ `service.archiveColumn` ตัวเก่าที่ลากการ์ดเข้าคลังตามไปเงียบ ๆ):
    // ตรวจ ADMIN เอง · เก็บได้เฉพาะคอลัมน์ที่ว่าง · ห้ามเก็บคอลัมน์สุดท้ายของบอร์ด
    await archiveColumn(kanbanCtxOf(actor), params.id!);
    return { ok: true, columnId: params.id!, status: "ARCHIVED" };
  },
});

const columnsRestore = defineKanbanOp({
  id: "columns.restore",
  method: "POST",
  path: "/columns/{id}/restore",
  kind: "write",
  action: "kanban.column.create",
  summary: "Bring an archived column back. It returns to the end of the board with the cards still attached to it.",
  label: "กู้คอลัมน์คืน",
  test: "K1.15-S1.2",
  async handler({ actor, params }) {
    // `restoreColumn` ตรวจ ADMIN เอง (D16) · กดซ้ำไม่ error (idempotent)
    const res = await restoreColumn(kanbanCtxOf(actor), params.id!);
    return { ok: true, columnId: params.id!, boardId: res.boardId };
  },
});

const columnsMoveAllInput = z
  .object({ toColumnId: z.string().min(1).max(40).describe("Column on the same board that all the cards move to.") })
  .strict();

const columnsMoveAll = defineKanbanOp({
  id: "columns.move-all",
  method: "POST",
  path: "/columns/{id}/move-all",
  kind: "write",
  action: "kanban.card.move",
  summary: "Move every active card of one column to the end of another column on the same board, keeping their order.",
  label: "ย้ายการ์ดออกทั้งคอลัมน์",
  input: columnsMoveAllInput,
  test: "K1.15-S1.2",
  async handler({ actor, params, input }) {
    // `moveAllCards` ตรวจ EDITOR เอง · ปลายทางคอลัมน์เดียวกัน = `moved: 0` ไม่ใช่ error · ไม่บังคับเพดาน WIP (§11.4)
    const res = await moveAllCards(kanbanCtxOf(actor), {
      fromColumnId: params.id!,
      toColumnId: input.toColumnId,
    });
    return { ok: true, moved: res.moved, toColumnId: input.toColumnId };
  },
});

export const COLUMNS_OPS: ApiOp[] = [
  columnsList,
  columnsCreate,
  columnsUpdate,
  columnsMove,
  columnsArchive,
  columnsRestore,
  columnsMoveAll,
];
