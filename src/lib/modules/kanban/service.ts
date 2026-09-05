import { prisma } from "@/lib/core/db";
import { Prisma } from "@prisma/client";
import type { KanbanBoard, KanbanBoardVisibility, KanbanCard, KanbanCardSourceType, KanbanColumn, KanbanLabelColor } from "@prisma/client";
import { keyBetween, keysBetween } from "./ordering";
import { applyCardLabelNames } from "./labels";
import { syncSingleAssignee } from "./cards";
import { notifyCardAssigned } from "./notify";
import { boardRole, KanbanNotFoundError, visibleBoardsWhere, type BoardRole } from "./access";
import type { KanbanActor, KanbanCtx } from "./types";

// ── K1.2: service.ts เป็น facade ของโมดูล (proposals.ts/ai/tools.ts/ข้อสอบเก่า import ที่นี่) ──
//    ฟังก์ชันใหม่อยู่ไฟล์ของตัวเอง แล้ว re-export ออกจากที่นี่ — ผู้เรียกเดิมไม่ต้องแก้สักบรรทัด
export { setCardAssignees, listCardAssignees } from "./cards";
export { listLabels, createLabel, updateLabel, deleteLabel, setCardLabels } from "./labels";
export type { KanbanCtx, KanbanActor } from "./types";
// K1.3: สิทธิ์ 2 ชั้น — ผู้เรียกนอกโมดูล (หน้า/action/AI) ใช้ผ่าน facade เดียวกัน
export { boardRole, canReadKanban, toActor, visibleBoardsWhere, KanbanNotFoundError, KanbanForbiddenError } from "./access";
export type { BoardRole } from "./access";
export {
  addMember,
  assertBoardRole,
  boardRoleOf,
  leaveBoard,
  listMembers,
  listStarredBoardIds,
  removeMember,
  setBoardVisibility,
  setMemberRole,
  starBoard,
  unstarBoard,
} from "./members";

// แจ้งเตือนเมื่อมอบหมายงาน — ย้ายตรรกะไป `notify.ts` ใน K1.2 (cards.ts ใช้ร่วมโดยไม่เกิด import วงกลม)
// ชื่อเดิมคงไว้เป็น alias ภายในไฟล์นี้ เพื่อไม่ต้องแก้จุดเรียกเดิม
const notifyAssignment = notifyCardAssigned;

// งานของฉัน — การ์ด ACTIVE ที่มอบหมายให้ผู้ใช้ปัจจุบัน ข้ามทุกบอร์ด (เรียงตามกำหนดส่ง)
//
// 🔴 K1.3: ส่ง `actor` มาด้วยเมื่อรู้ว่าใครกำลังดู — การ์ดจากบอร์ดที่คนนั้น "มองไม่เห็นแล้ว"
//    (ถูกถอดออกจากบอร์ด PRIVATE / บอร์ดเปลี่ยนเป็น PRIVATE) ต้องหายจากหน้า "งานของฉัน" ทันที
//    ไม่งั้นชื่อการ์ด+ชื่อบอร์ดลับจะรั่วผ่านหน้ารวมทั้งที่ปิดประตูหน้าบอร์ดไปแล้ว
//    (พารามิเตอร์เป็น optional เพื่อไม่หักผู้เรียกเดิม — cron/AI ที่ไม่มี actor ยังเรียกได้เหมือนเดิม)
export async function listMyCards(tenantId: string, systemId: string, userId: string, actor?: KanbanActor | null) {
  // 🔴 K1.2: ผู้รับผิดชอบมีได้หลายคน — "งานของฉัน" ต้องอ่าน `KanbanCardAssignee` ด้วย
  //    ไม่ใช่แค่ช่องเดิม `assigneeUserId` (คนที่ 2 ของการ์ดจะไม่เห็นงานตัวเองเลย)
  //    union ทั้งสองทางไว้ตลอด P1 เพราะทั้งคู่ถูกเขียนคู่กัน (แถวเก่าที่ยังไม่ backfill ก็ยังโผล่)
  const assigned = await prisma.kanbanCardAssignee.findMany({
    where: { tenantId, userId },
    select: { cardId: true },
  });
  const assignedIds = assigned.map((a) => a.cardId);
  return prisma.kanbanCard.findMany({
    where: {
      tenantId,
      systemId,
      status: "ACTIVE",
      OR: [{ assigneeUserId: userId }, ...(assignedIds.length ? [{ id: { in: assignedIds } }] : [])],
      ...(actor ? { board: visibleBoardsWhere(actor) } : {}),
    },
    include: { board: { select: { name: true } }, column: { select: { name: true } } },
    // กำหนดส่งก่อน (หน้า "งานของฉัน" จัดกลุ่มตามวัน) แล้วค่อยลำดับในคอลัมน์ (position → sortOrder → createdAt)
    orderBy: [
      { dueAt: { sort: "asc", nulls: "last" } },
      { position: { sort: "asc", nulls: "first" } },
      { sortOrder: "asc" },
      { createdAt: "asc" },
    ],
    take: 100,
  });
}

// Kanban — บอร์ดงานภายในองค์กร. scope = feature: filter ด้วย tenantId + systemId เสมอ
// ทุก mutation ตรวจ ownership ผ่าน tenantId + systemId (defense-in-depth) — ไม่พึ่ง tenantDb inject

const DEFAULT_COLUMNS = ["รอทำ", "กำลังทำ", "เสร็จ"];

export type BoardWithData = KanbanBoard & {
  columns: (KanbanColumn & { cards: KanbanCard[] })[];
};

// ───────────────────────── Board ─────────────────────────

export async function listBoards(tenantId: string, systemId: string, includeArchived = false) {
  return prisma.kanbanBoard.findMany({
    where: { tenantId, systemId, ...(includeArchived ? {} : { status: "ACTIVE" }) },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    include: { _count: { select: { cards: { where: { status: "ACTIVE" } } } } },
  });
}

// โหลดบอร์ดเต็ม (คอลัมน์ active เรียงซ้าย-ขวา + การ์ด active เรียงในคอลัมน์)
export async function getBoard(
  tenantId: string,
  systemId: string,
  boardId: string,
): Promise<BoardWithData | null> {
  const board = await prisma.kanbanBoard.findFirst({
    where: { id: boardId, tenantId, systemId },
    include: {
      // เรียงด้วย `position` (fractional index) เป็นหลัก · `sortOrder` เป็น fallback ช่วงเปลี่ยนผ่าน (D10)
      // 🔴 nulls: "first" — แถวที่ยังไม่ backfill (position = null) ต้องอยู่ "ก่อน" แถวที่มี key
      //    เพราะการ์ด/คอลัมน์ที่โค้ดใหม่สร้าง = ต่อท้ายเสมอ (ถ้าใช้ค่าปริยาย NULLS LAST ของ Postgres
      //    ของใหม่จะเด้งขึ้นไปอยู่หัวคอลัมน์ในช่วงก่อน backfill)
      columns: {
        where: { status: "ACTIVE" },
        orderBy: [{ position: { sort: "asc", nulls: "first" } }, { sortOrder: "asc" }, { createdAt: "asc" }],
        include: {
          cards: {
            where: { status: "ACTIVE" },
            orderBy: [{ position: { sort: "asc", nulls: "first" } }, { sortOrder: "asc" }, { createdAt: "asc" }],
          },
        },
      },
    },
  });
  return board as BoardWithData | null;
}

// ───────────────── K1.3: ตัวที่ "ผ่านสิทธิ์" แล้ว — หน้าเว็บ/action ต้องเรียกตัวนี้เท่านั้น ─────────────────
// `listBoards`/`getBoard` เดิมยังอยู่ (seed · AI · ข้อสอบเก่าเรียกอยู่) แต่ **ไม่กรองสิทธิ์**
// ⇒ ทุกจุดที่มี "คนกด" ต้องใช้ตัว `…For` ที่รับ `actor` ไม่งั้นบอร์ดลับโผล่ในรายการ

export type BoardListItem = KanbanBoard & { starred: boolean };

/** บอร์ดที่ actor มองเห็น — ติดดาวขึ้นก่อน แล้วเรียงตามลำดับเดิม */
export async function listBoardsFor(
  ctx: KanbanCtx,
  actor: KanbanActor,
  includeArchived = false,
): Promise<BoardListItem[]> {
  const boards = await prisma.kanbanBoard.findMany({
    where: {
      AND: [
        { tenantId: ctx.tenantId, systemId: ctx.systemId, ...(includeArchived ? {} : { status: "ACTIVE" as const }) },
        visibleBoardsWhere(actor),
      ],
    },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    include: {
      _count: { select: { cards: { where: { status: "ACTIVE" } } } },
      stars: { where: { userId: actor.userId }, select: { boardId: true } },
    },
  });
  // เรียงใหม่แบบคงลำดับเดิมภายในกลุ่ม (stable sort ของ JS) — ดาวขึ้นบน ที่เหลือเรียงเหมือนเดิม
  return boards
    .map((b) => ({ ...b, starred: b.stars.length > 0 }))
    .sort((a, b) => Number(b.starred) - Number(a.starred));
}

/** เปิดบอร์ดพร้อมบทบาทของผู้เปิด — มองไม่เห็น = `KanbanNotFoundError` (404 ไม่ใช่ 403) */
export async function getBoardFor(
  ctx: KanbanCtx,
  actor: KanbanActor,
  boardId: string,
): Promise<BoardWithData & { role: Exclude<BoardRole, null> }> {
  const board = await getBoard(ctx.tenantId, ctx.systemId, boardId);
  if (!board) throw new KanbanNotFoundError();
  const members = await prisma.kanbanBoardMember.findMany({
    where: { boardId: board.id, tenantId: ctx.tenantId },
    select: { userId: true, role: true },
  });
  const role = boardRole(actor, board, members);
  if (role === null) throw new KanbanNotFoundError();
  return { ...board, role };
}

export async function createBoard(input: {
  tenantId: string;
  systemId: string;
  name: string;
  description?: string | null;
  /** BusinessUnit.id — บอร์ดของสาขาไหน (null = กลางองค์กร) */
  unitId?: string | null;
  /** ไม่ระบุ = PRIVATE ตาม default ของ schema (บอร์ดใหม่ปิดก่อน — D2) */
  visibility?: KanbanBoardVisibility;
  color?: KanbanLabelColor;
  createdById?: string | null;
}): Promise<KanbanBoard> {
  const count = await prisma.kanbanBoard.count({
    where: { tenantId: input.tenantId, systemId: input.systemId },
  });
  // คอลัมน์เริ่มต้นได้ position ตั้งแต่แรก ⇒ บอร์ดที่โค้ดใหม่สร้างจะไม่ถูก backfill แตะ (เครื่องหมายใน K1.1)
  const colKeys = keysBetween(null, null, DEFAULT_COLUMNS.length);
  return prisma.kanbanBoard.create({
    data: {
      tenantId: input.tenantId,
      systemId: input.systemId,
      name: input.name,
      description: input.description ?? null,
      sortOrder: count,
      unitId: input.unitId ?? null,
      ...(input.visibility ? { visibility: input.visibility } : {}),
      ...(input.color ? { color: input.color } : {}),
      createdById: input.createdById ?? null,
      columns: {
        create: DEFAULT_COLUMNS.map((name, i) => ({
          tenantId: input.tenantId,
          systemId: input.systemId,
          name,
          sortOrder: i,
          position: colKeys[i]!,
        })),
      },
    },
  });
}

export async function renameBoard(tenantId: string, systemId: string, boardId: string, name: string) {
  await prisma.kanbanBoard.updateMany({
    where: { id: boardId, tenantId, systemId },
    data: { name },
  });
}

export async function archiveBoard(tenantId: string, systemId: string, boardId: string) {
  await prisma.kanbanBoard.updateMany({
    where: { id: boardId, tenantId, systemId },
    data: { status: "ARCHIVED", archivedAt: new Date() },
  });
}

export async function unarchiveBoard(tenantId: string, systemId: string, boardId: string) {
  await prisma.kanbanBoard.updateMany({
    where: { id: boardId, tenantId, systemId },
    data: { status: "ACTIVE", archivedAt: null },
  });
}

// ───────────────────────── ลำดับ (fractional index) ─────────────────────────

/**
 * คีย์ตำแหน่ง "ต่อท้ายสุด" — ของคอลัมน์ในบอร์ด (kind=column) หรือของการ์ดในคอลัมน์ (kind=card)
 *
 * 🔴 อ่านเฉพาะแถวที่ `position` ไม่ null: แถวที่ยังไม่ backfill ไม่มีคีย์ที่ใช้ต่อยอดได้
 *    (generateKeyBetween ต้องรับคีย์ที่ถูกต้องตามไวยากรณ์เท่านั้น — ยัด "5" จาก sortOrder เข้าไปจะโยน)
 *    ⇒ คอลัมน์ที่ยังไม่ backfill: ของใหม่เริ่มที่ "a0" แล้วเรียงหลังแถว null ด้วย nulls:"first" ตอนอ่าน
 */
async function nextPosition(
  kind: "column" | "card",
  scope: { tenantId: string; systemId: string; scopeId: string },
): Promise<string> {
  const { tenantId, systemId, scopeId } = scope;
  const last =
    kind === "column"
      ? await prisma.kanbanColumn.findFirst({
          where: { tenantId, systemId, boardId: scopeId, status: "ACTIVE", position: { not: null } },
          orderBy: { position: "desc" },
          select: { position: true },
        })
      : await prisma.kanbanCard.findFirst({
          where: { tenantId, systemId, columnId: scopeId, status: "ACTIVE", position: { not: null } },
          orderBy: { position: "desc" },
          select: { position: true },
        });
  return keyBetween(last?.position ?? null, null);
}

// ───────────────────────── Column ─────────────────────────

export async function createColumn(
  tenantId: string,
  systemId: string,
  boardId: string,
  name: string,
): Promise<KanbanColumn | null> {
  const board = await prisma.kanbanBoard.findFirst({ where: { id: boardId, tenantId, systemId } });
  if (!board) return null;
  const count = await prisma.kanbanColumn.count({ where: { tenantId, systemId, boardId, status: "ACTIVE" } });
  const position = await nextPosition("column", { tenantId, systemId, scopeId: boardId });
  return prisma.kanbanColumn.create({
    data: { tenantId, systemId, boardId, name, sortOrder: count, position },
  });
}

export async function renameColumn(tenantId: string, systemId: string, columnId: string, name: string) {
  await prisma.kanbanColumn.updateMany({
    where: { id: columnId, tenantId, systemId },
    data: { name },
  });
}

// archive คอลัมน์ + การ์ดในคอลัมน์ (atomic)
export async function archiveColumn(tenantId: string, systemId: string, columnId: string) {
  await prisma.$transaction([
    prisma.kanbanCard.updateMany({
      where: { columnId, tenantId, systemId, status: "ACTIVE" },
      data: { status: "ARCHIVED", archivedAt: new Date() },
    }),
    prisma.kanbanColumn.updateMany({
      where: { id: columnId, tenantId, systemId },
      data: { status: "ARCHIVED", archivedAt: new Date() },
    }),
  ]);
}

// ───────────────────────── Card ─────────────────────────

export async function createCard(input: {
  tenantId: string;
  systemId: string;
  columnId: string;
  title: string;
  description?: string | null;
  assigneeUserId?: string | null;
  dueAt?: Date | null;
  startAt?: Date | null;
  labels?: string[];
  sourceType?: KanbanCardSourceType;
  sourceId?: string | null;
  createdById?: string | null;
}): Promise<KanbanCard | null> {
  const col = await prisma.kanbanColumn.findFirst({
    where: { id: input.columnId, tenantId: input.tenantId, systemId: input.systemId, status: "ACTIVE" },
  });
  if (!col) return null;
  const count = await prisma.kanbanCard.count({
    where: { columnId: col.id, tenantId: input.tenantId, systemId: input.systemId, status: "ACTIVE" },
  });
  const position = await nextPosition("card", {
    tenantId: input.tenantId,
    systemId: input.systemId,
    scopeId: col.id,
  });
  // 🔴 เลขการ์ด (D14 · §11.2): จองเลขด้วย `UPDATE … SET cardNoSeq = cardNoSeq + 1 … RETURNING`
  //    ใน transaction เดียวกับการสร้างการ์ด — คำสั่งเดียวจบ ⇒ สร้างพร้อมกันหลายใบก็ไม่ได้เลขซ้ำ
  //    (อ่านมานับเองแล้วค่อยเขียนคือรูปแบบที่นับพลาดตอนยิงพร้อมกัน)
  const card = await prisma.$transaction(async (tx) => {
    const seq = await tx.$queryRaw<{ cardNoSeq: number }[]>`
      UPDATE "KanbanBoard" SET "cardNoSeq" = "cardNoSeq" + 1 WHERE id = ${col.boardId} RETURNING "cardNoSeq"
    `;
    return tx.kanbanCard.create({
      data: {
        tenantId: input.tenantId,
        systemId: input.systemId,
        boardId: col.boardId,
        columnId: col.id,
        title: input.title,
        description: input.description ?? null,
        assigneeUserId: input.assigneeUserId ?? null,
        dueAt: input.dueAt ?? null,
        startAt: input.startAt ?? null,
        labels: input.labels ?? [],
        sortOrder: count,
        position,
        cardNo: seq[0]?.cardNoSeq ?? null,
        ...(input.sourceType ? { sourceType: input.sourceType } : {}),
        sourceId: input.sourceId ?? null,
        createdById: input.createdById ?? null,
      },
    });
  });
  // ── K1.2 dual-write: ช่องเดิม + ตารางใหม่ต้องตรงกันเสมอ ──
  const ctx = { tenantId: input.tenantId, systemId: input.systemId, actorUserId: input.createdById ?? null };
  if (input.assigneeUserId) {
    await syncSingleAssignee(ctx, card.id, input.assigneeUserId);
  }
  // ผู้เรียกเดิม (seed · AI · actions) ส่งป้ายมาเป็น "ชื่อ" — สร้าง/ผูก KanbanLabel ของบอร์ดให้อัตโนมัติ
  if (input.labels && input.labels.length > 0) {
    await applyCardLabelNames(ctx, { id: card.id, boardId: card.boardId }, input.labels);
  }
  // มอบหมายตั้งแต่สร้าง → แจ้งผู้รับ
  if (input.assigneeUserId) {
    await notifyAssignment(input.tenantId, input.systemId, card, input.assigneeUserId);
  }
  return card;
}

export async function updateCard(input: {
  tenantId: string;
  systemId: string;
  cardId: string;
  title?: string;
  description?: string | null;
  assigneeUserId?: string | null;
  dueAt?: Date | null;
  labels?: string[];
}) {
  const data: Prisma.KanbanCardUpdateManyMutationInput = {};
  if (input.title !== undefined) data.title = input.title;
  if (input.description !== undefined) data.description = input.description;
  if (input.assigneeUserId !== undefined) data.assigneeUserId = input.assigneeUserId;
  if (input.dueAt !== undefined) data.dueAt = input.dueAt;
  // 🔴 `labels` ไม่เขียนตรงที่นี่แล้ว — ผ่าน applyCardLabelNames เพื่อให้แถวเชื่อมกับ Json ตรงกัน (K1.2)
  if (Object.keys(data).length === 0 && input.labels === undefined) return;
  // อ่าน assignee เดิมก่อน เพื่อแจ้งเฉพาะเมื่อ "เปลี่ยนผู้รับเป็นคนใหม่" (ไม่แจ้งซ้ำถ้าเดิมคนเดียวกัน)
  const before = await prisma.kanbanCard.findFirst({
    where: { id: input.cardId, tenantId: input.tenantId, systemId: input.systemId },
    select: { id: true, title: true, boardId: true, assigneeUserId: true },
  });
  if (!before) return;
  if (Object.keys(data).length > 0) {
    await prisma.kanbanCard.updateMany({
      where: { id: input.cardId, tenantId: input.tenantId, systemId: input.systemId },
      data,
    });
  }
  const ctx = { tenantId: input.tenantId, systemId: input.systemId, actorUserId: null };
  if (input.labels !== undefined) {
    await applyCardLabelNames(ctx, { id: before.id, boardId: before.boardId }, input.labels);
  }
  if (input.assigneeUserId !== undefined) {
    await syncSingleAssignee(ctx, before.id, input.assigneeUserId);
  }
  const newAssignee = input.assigneeUserId;
  if (newAssignee != null && newAssignee !== before.assigneeUserId) {
    const title = input.title ?? before.title;
    await notifyAssignment(input.tenantId, input.systemId, { id: before.id, title, boardId: before.boardId }, newAssignee);
  }
}

export async function archiveCard(tenantId: string, systemId: string, cardId: string) {
  await prisma.kanbanCard.updateMany({
    where: { id: cardId, tenantId, systemId },
    data: { status: "ARCHIVED", archivedAt: new Date() },
  });
}

// ย้ายการ์ดไปอีกคอลัมน์ (ต่อท้าย) — atomic ใน tx, กัน cross-tenant/board
export async function moveCard(input: {
  tenantId: string;
  systemId: string;
  cardId: string;
  toColumnId: string;
}): Promise<{ ok: boolean }> {
  const { tenantId, systemId, cardId, toColumnId } = input;
  return prisma.$transaction(async (tx) => {
    const card = await tx.kanbanCard.findFirst({
      where: { id: cardId, tenantId, systemId, status: "ACTIVE" },
    });
    if (!card) return { ok: false };
    const col = await tx.kanbanColumn.findFirst({
      where: { id: toColumnId, tenantId, systemId, boardId: card.boardId, status: "ACTIVE" },
    });
    if (!col) return { ok: false };
    if (col.id === card.columnId) return { ok: true };
    const max = await tx.kanbanCard.aggregate({
      where: { columnId: col.id, tenantId, systemId, status: "ACTIVE" },
      _max: { sortOrder: true },
    });
    // 🔴 ต้องเขียน `position` ใหม่ด้วย (dual-write · D10): คีย์เดิมเป็นของคอลัมน์เก่า
    //    ถ้าไม่เขียน การ์ดจะไปโผล่กลางคอลัมน์ปลายทางตามคีย์เก่า (getBoard เรียงด้วย position แล้ว)
    //    ย้ายแบบเลือกตำแหน่ง (before/after) มาใน K1.4 — ที่นี่คือ "ต่อท้ายคอลัมน์ปลายทาง"
    const lastInTarget = await tx.kanbanCard.findFirst({
      where: { columnId: col.id, tenantId, systemId, status: "ACTIVE", position: { not: null } },
      orderBy: { position: "desc" },
      select: { position: true },
    });
    await tx.kanbanCard.update({
      where: { id: card.id },
      data: {
        columnId: col.id,
        sortOrder: (max._max.sortOrder ?? -1) + 1,
        position: keyBetween(lastInTarget?.position ?? null, null),
      },
    });
    return { ok: true };
  });
}

// ย้ายการ์ดไปคอลัมน์ซ้าย/ขวา (ป้าย ◀ ▶ ใน P1)
export async function moveCardSideways(input: {
  tenantId: string;
  systemId: string;
  cardId: string;
  direction: "left" | "right";
}): Promise<{ ok: boolean }> {
  const { tenantId, systemId, cardId, direction } = input;
  const card = await prisma.kanbanCard.findFirst({
    where: { id: cardId, tenantId, systemId, status: "ACTIVE" },
  });
  if (!card) return { ok: false };
  const columns = await prisma.kanbanColumn.findMany({
    where: { tenantId, systemId, boardId: card.boardId, status: "ACTIVE" },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
  const idx = columns.findIndex((c) => c.id === card.columnId);
  const targetIdx = direction === "left" ? idx - 1 : idx + 1;
  if (idx < 0 || targetIdx < 0 || targetIdx >= columns.length) return { ok: false };
  return moveCard({ tenantId, systemId, cardId, toColumnId: columns[targetIdx].id });
}

// ───────────────────────── Assignee helpers ─────────────────────────

// รายชื่อผู้ใช้ใน tenant (สำหรับ dropdown ผู้รับผิดชอบ) — accepted members เท่านั้น
export async function listTenantUsers(tenantId: string) {
  const memberships = await prisma.membership.findMany({
    where: { tenantId, acceptedAt: { not: null } },
    include: { user: true },
    orderBy: { createdAt: "asc" },
  });
  return memberships.map((m) => ({
    userId: m.userId,
    name: m.user.name ?? m.user.email,
    email: m.user.email,
  }));
}
