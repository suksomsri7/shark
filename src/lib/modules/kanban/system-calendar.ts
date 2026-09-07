// system-calendar.ts — ปฏิทินรวมทุกบอร์ดที่มองเห็นของทั้งระบบ (K2.12 · ปิดหนี้ P2 · ledger/KANBAN-RUN.md §K2.F)
//
// อ่านอย่างเดียว (ไม่มีถาดลาก — ต่างจาก `calendar.ts` ของบอร์ดใบเดียวที่ลากตั้งกำหนดส่งได้): จัดการ์ด
// ACTIVE ของ**ทุกบอร์ดที่ actor มองเห็น** (`visibleBoardsWhere` เดียวกับ reports.ts/search.ts) ตามวัน
// กำหนดส่ง (เวลาไทย) — คลิกการ์ดพาไปหน้าบอร์ดของการ์ดนั้น (`?card=`) ฝั่งจอเป็นคนสร้างลิงก์
//
// 🔴 ทำไมไม่เรียก `calendar.ts#listBoardCalendar` วนทีละบอร์ด: ต้องคิวรี N ครั้ง (N = จำนวนบอร์ด) แทนที่
//    จะเป็นคิวรีเดียวข้ามบอร์ด (งบประสิทธิภาพ §12.1 แบบเดียวกับ `reports.ts`/`search.ts`/`overview.ts`)
// 🔴 ช่วง `[from, to]` เป็นแบบปิดทั้งสองฝั่ง (ต่างจาก `calendar.ts` ที่ครึ่งเปิด) — ไฟล์นี้ใหม่ เลือกแบบที่
//    ผู้เรียก (oracle/หน้า) คิดช่วงเป็น "ตั้งแต่วันที่ .. ถึงวันที่ .." ได้ตรงไปตรงมาที่สุด

import { prisma } from "./db";
import { visibleBoardsWhere } from "./access";
import { BKK_OFFSET_MS } from "./filters";
import type { KanbanActor, KanbanCtx, KanbanTagColor, SystemCalCardDto, SystemCalDayDto, SystemCalendarDto } from "./types";

export type { SystemCalCardDto, SystemCalDayDto, SystemCalendarBoardDto, SystemCalendarDto } from "./types";

/** "YYYY-MM-DD" ตามวันที่ไทยของเวลา `ms` */
function bkkDayKey(ms: number): string {
  const d = new Date(ms + BKK_OFFSET_MS);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export type ListSystemCalendarInput = {
  /** ช่วงที่ต้องการ — ปิดทั้งสองฝั่ง (`dueAt >= from && dueAt <= to`) */
  from: Date;
  to: Date;
  /** เวลาอ้างอิง (จาก server เดียวกับที่ใช้เรนเดอร์ทั้งหน้า) — ใช้คิด `isOverdue` */
  now: Date;
  /** ตัวกรองบอร์ด (testid `calendar-boards`) — ไม่ระบุ/ว่าง = ทุกบอร์ดที่มองเห็น */
  boardIds?: string[];
};

/**
 * ปฏิทินรวมทุกบอร์ดของระบบที่ `actor` มองเห็น (`visibleBoardsWhere` — owner เห็นทุกบอร์ด · staff เห็นเฉพาะ
 * บอร์ดที่เป็นสมาชิก/สาขาที่คุม/บอร์ด TENANT) → `{ days: {YYYY-MM-DD: {cards}}, boards: [{id,name,color,count}] }`
 */
export async function listSystemCalendar(
  ctx: KanbanCtx,
  actor: KanbanActor,
  opts: ListSystemCalendarInput,
): Promise<SystemCalendarDto> {
  const boards = await prisma.kanbanBoard.findMany({
    where: {
      AND: [
        { tenantId: ctx.tenantId, systemId: ctx.systemId, status: "ACTIVE" },
        visibleBoardsWhere(actor),
        ...(opts.boardIds && opts.boardIds.length > 0 ? [{ id: { in: opts.boardIds } }] : []),
      ],
    },
    select: { id: true, name: true, color: true },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
  const range = { from: opts.from.toISOString(), to: opts.to.toISOString() };
  if (boards.length === 0) return { range, days: {}, boards: [] };

  const boardIds = boards.map((b) => b.id);
  const boardNameOf = new Map(boards.map((b) => [b.id, b.name]));
  const boardColorOf = new Map(boards.map((b) => [b.id, b.color as KanbanTagColor]));

  const cards = await prisma.kanbanCard.findMany({
    where: {
      tenantId: ctx.tenantId,
      systemId: ctx.systemId,
      status: "ACTIVE",
      boardId: { in: boardIds },
      dueAt: { gte: opts.from, lte: opts.to },
    },
    orderBy: [{ position: { sort: "asc", nulls: "first" } }, { sortOrder: "asc" }, { createdAt: "asc" }],
    select: { id: true, cardNo: true, title: true, dueAt: true, completedAt: true, boardId: true, columnId: true },
  });
  if (cards.length === 0) {
    return { range, days: {}, boards: boards.map((b) => ({ id: b.id, name: b.name, color: b.color as KanbanTagColor, count: 0 })) };
  }

  const columns = await prisma.kanbanColumn.findMany({
    where: { boardId: { in: boardIds }, tenantId: ctx.tenantId, systemId: ctx.systemId },
    select: { id: true, name: true },
  });
  const columnNameOf = new Map(columns.map((c) => [c.id, c.name]));

  const cardIds = cards.map((c) => c.id);
  const [labelRows, assigneeRows] = await Promise.all([
    prisma.kanbanCardLabel.findMany({
      where: { cardId: { in: cardIds }, tenantId: ctx.tenantId },
      include: { label: { select: { name: true, color: true } } },
    }),
    prisma.kanbanCardAssignee.findMany({
      where: { cardId: { in: cardIds }, tenantId: ctx.tenantId },
      orderBy: { assignedAt: "asc" },
      select: { cardId: true, userId: true },
    }),
  ]);
  const labelsOfCard = new Map<string, { name: string; color: KanbanTagColor }[]>();
  for (const row of labelRows) {
    const list = labelsOfCard.get(row.cardId) ?? [];
    list.push({ name: row.label.name, color: row.label.color as KanbanTagColor });
    labelsOfCard.set(row.cardId, list);
  }
  const assigneeIdsOfCard = new Map<string, string[]>();
  for (const row of assigneeRows) {
    const list = assigneeIdsOfCard.get(row.cardId) ?? [];
    list.push(row.userId);
    assigneeIdsOfCard.set(row.cardId, list);
  }
  const assigneeUserIds = Array.from(new Set(assigneeRows.map((r) => r.userId)));
  const users = assigneeUserIds.length
    ? await prisma.user.findMany({ where: { id: { in: assigneeUserIds } }, select: { id: true, name: true, email: true } })
    : [];
  const nameOf = new Map(users.map((u) => [u.id, u.name ?? u.email ?? u.id]));

  const nowMs = opts.now.getTime();
  const days: Record<string, SystemCalDayDto> = {};
  const dayOf = (key: string): SystemCalDayDto => days[key] ?? (days[key] = { cards: [] });
  const countByBoard = new Map<string, number>();

  for (const c of cards) {
    const dto: SystemCalCardDto = {
      id: c.id,
      cardNo: c.cardNo,
      title: c.title,
      dueAt: c.dueAt ? c.dueAt.toISOString() : null,
      columnName: columnNameOf.get(c.columnId) ?? "",
      labels: labelsOfCard.get(c.id) ?? [],
      assignees: (assigneeIdsOfCard.get(c.id) ?? []).map((userId) => ({ userId, name: nameOf.get(userId) ?? userId })),
      isOverdue: !!c.dueAt && c.dueAt.getTime() < nowMs && !c.completedAt,
      isDone: !!c.completedAt,
      boardId: c.boardId,
      boardName: boardNameOf.get(c.boardId) ?? "",
      boardColor: boardColorOf.get(c.boardId) ?? "SLATE",
    };
    dayOf(bkkDayKey(c.dueAt!.getTime())).cards.push(dto);
    countByBoard.set(c.boardId, (countByBoard.get(c.boardId) ?? 0) + 1);
  }

  return {
    range,
    days,
    boards: boards.map((b) => ({ id: b.id, name: b.name, color: b.color as KanbanTagColor, count: countByBoard.get(b.id) ?? 0 })),
  };
}
