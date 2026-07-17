import { prisma } from "@/lib/core/db";
import { Prisma } from "@prisma/client";
import type { KanbanBoard, KanbanCard, KanbanColumn } from "@prisma/client";
import { emitOutbox } from "@/lib/core/outbox";
import { drainAll } from "@/lib/outbox-consumers";

// แจ้งเตือนเมื่อมอบหมายงาน (assignee ตั้งใหม่/เปลี่ยน) — ปิด "โมดูลเงียบ"
// AppNotification tenant-wide (schema ไม่มี user targeting) → ระบุชื่อผู้รับใน body
async function notifyAssignment(
  tenantId: string,
  systemId: string,
  card: { id: string; title: string; boardId: string },
  assigneeUserId: string,
): Promise<void> {
  const [board, membership] = await Promise.all([
    prisma.kanbanBoard.findFirst({ where: { id: card.boardId, tenantId }, select: { name: true } }),
    prisma.membership.findFirst({ where: { tenantId, userId: assigneeUserId }, include: { user: true } }),
  ]);
  const who = membership?.user.name ?? membership?.user.email ?? "พนักงาน";
  await prisma.$transaction(async (tx) => {
    await emitOutbox(tx, {
      tenantId,
      type: "kanban.card.assigned",
      idempotencyKey: `kanban.assign.${card.id}.${assigneeUserId}`,
      payload: { cardId: card.id, boardId: card.boardId, assigneeUserId },
      systemId,
    });
    await tx.appNotification.create({
      data: {
        tenantId,
        title: "ได้รับมอบหมายงาน",
        body: `${who}: "${card.title}"${board ? ` · บอร์ด ${board.name}` : ""} · ดูงาน /app/sys/${systemId}/kanban/${card.boardId}`,
      },
    });
  });
  void drainAll().catch(() => {});
}

// งานของฉัน — การ์ด ACTIVE ที่มอบหมายให้ผู้ใช้ปัจจุบัน ข้ามทุกบอร์ด (เรียงตามกำหนดส่ง)
export async function listMyCards(tenantId: string, systemId: string, userId: string) {
  return prisma.kanbanCard.findMany({
    where: { tenantId, systemId, assigneeUserId: userId, status: "ACTIVE" },
    include: { board: { select: { name: true } }, column: { select: { name: true } } },
    orderBy: [{ dueAt: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }],
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
      columns: {
        where: { status: "ACTIVE" },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        include: {
          cards: {
            where: { status: "ACTIVE" },
            orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
          },
        },
      },
    },
  });
  return board as BoardWithData | null;
}

export async function createBoard(input: {
  tenantId: string;
  systemId: string;
  name: string;
  description?: string | null;
}): Promise<KanbanBoard> {
  const count = await prisma.kanbanBoard.count({
    where: { tenantId: input.tenantId, systemId: input.systemId },
  });
  return prisma.kanbanBoard.create({
    data: {
      tenantId: input.tenantId,
      systemId: input.systemId,
      name: input.name,
      description: input.description ?? null,
      sortOrder: count,
      columns: {
        create: DEFAULT_COLUMNS.map((name, i) => ({
          tenantId: input.tenantId,
          systemId: input.systemId,
          name,
          sortOrder: i,
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
  return prisma.kanbanColumn.create({
    data: { tenantId, systemId, boardId, name, sortOrder: count },
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
  labels?: string[];
}): Promise<KanbanCard | null> {
  const col = await prisma.kanbanColumn.findFirst({
    where: { id: input.columnId, tenantId: input.tenantId, systemId: input.systemId, status: "ACTIVE" },
  });
  if (!col) return null;
  const count = await prisma.kanbanCard.count({
    where: { columnId: col.id, tenantId: input.tenantId, systemId: input.systemId, status: "ACTIVE" },
  });
  const card = await prisma.kanbanCard.create({
    data: {
      tenantId: input.tenantId,
      systemId: input.systemId,
      boardId: col.boardId,
      columnId: col.id,
      title: input.title,
      description: input.description ?? null,
      assigneeUserId: input.assigneeUserId ?? null,
      dueAt: input.dueAt ?? null,
      labels: input.labels ?? [],
      sortOrder: count,
    },
  });
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
  if (input.labels !== undefined) data.labels = input.labels;
  if (Object.keys(data).length === 0) return;
  // อ่าน assignee เดิมก่อน เพื่อแจ้งเฉพาะเมื่อ "เปลี่ยนผู้รับเป็นคนใหม่" (ไม่แจ้งซ้ำถ้าเดิมคนเดียวกัน)
  const before = await prisma.kanbanCard.findFirst({
    where: { id: input.cardId, tenantId: input.tenantId, systemId: input.systemId },
    select: { id: true, title: true, boardId: true, assigneeUserId: true },
  });
  if (!before) return;
  await prisma.kanbanCard.updateMany({
    where: { id: input.cardId, tenantId: input.tenantId, systemId: input.systemId },
    data,
  });
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
    await tx.kanbanCard.update({
      where: { id: card.id },
      data: { columnId: col.id, sortOrder: (max._max.sortOrder ?? -1) + 1 },
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
