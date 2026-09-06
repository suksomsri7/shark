// search.ts — ค้นหาข้ามบอร์ด (K1.11 · พิมพ์เขียว 13-kanban-v2 §11.8/§11.9 · สัญญา ledger/KANBAN-RUN.md §K1.11)
//
// 🔴 ไฟล์นี้แตะ prisma โดยตรง (`searchCards`) ⇒ **server-only** — ห้ามมี client component ใด import
//    จากไฟล์นี้เด็ดขาด (ตอน build production เจอจริง: Turbopack ลากทั้งไฟล์ที่ import prisma เข้าบันเดิล
//    ฝั่ง browser ทันทีที่ client component import ชื่อใดก็ได้จากไฟล์เดียวกัน แม้ prisma จะถูกใช้ใน
//    ฟังก์ชันอื่นที่ฝั่ง client ไม่เคยเรียกก็ตาม) — ตรรกะที่ client ต้องใช้ร่วม (`parseSearchQuery`
//    `filterBoardCards` `hasAnyFilter` ฯลฯ) ย้ายไปอยู่ `filters.ts` (บริสุทธิ์ ไม่แตะ prisma) แล้ว
//    re-export ออกจากที่นี่ทั้งหมด — `BoardView.tsx`/`FilterBar.tsx`/`SearchPalette.tsx` (client)
//    ต้อง import จาก `@/lib/modules/kanban/filters` เท่านั้น ห้าม import จาก `./search` โดยเด็ดขาด
import { prisma } from "./db";
import type { Prisma } from "@prisma/client";
import { visibleBoardsWhere } from "./access";
import { bkkDayStartMs, dayIndexOf, BKK_OFFSET_MS } from "./filters";
import type { BoardFilters, DueBucket, SearchCardDto, SearchCardsResult } from "./filters";
import type { KanbanActor, KanbanCtx } from "./types";

// ── re-export ตรรกะบริสุทธิ์ให้ oracle/actions เรียกจากที่เดียว (`@/lib/modules/kanban/search`) ──
// (client component ห้าม import ผ่านที่นี่ — ดูหมายเหตุหัวไฟล์ — ใช้ `./filters` ตรง ๆ แทน)
// 🔴 Prisma `contains` ไม่ escape wildcard ของ LIKE — พิมพ์ "%" หรือ "_" แล้วเจอทุกใบ (Fable probe K1.11) → escape เอง
const likeSafe = (s: string): string => s.replace(/[\\%_]/g, (m) => `\\${m}`);

export {
  parseSearchQuery,
  filterBoardCards,
  hasAnyFilter,
  boardFiltersFromParams,
  dueBucketOf,
} from "./filters";
export type {
  BoardFilters,
  DueBucket,
  CardStatus,
  FilterableCard,
  SearchCardDto,
  SearchLabelDto,
  SearchAssigneeDto,
  SearchCardsResult,
} from "./filters";

function encodeCursor(row: { createdAt: Date; id: string }): string {
  return Buffer.from(JSON.stringify({ c: row.createdAt.toISOString(), i: row.id })).toString("base64");
}

function decodeCursor(cursor: string): { createdAt: Date; id: string } | null {
  try {
    const parsed = JSON.parse(Buffer.from(cursor, "base64").toString("utf8")) as { c?: unknown; i?: unknown };
    if (typeof parsed.c !== "string" || typeof parsed.i !== "string") return null;
    const d = new Date(parsed.c);
    if (Number.isNaN(d.getTime())) return null;
    return { createdAt: d, id: parsed.i };
  } catch {
    return null;
  }
}

/** ช่วง `dueAt` ของแต่ละบั๊กเก็ต แปลงเป็น Prisma where — คู่กับตรรกะ `dueBucketOf` (`filters.ts`) ให้ผลตรงกันเป๊ะ */
function dueRangeWhere(due: DueBucket | undefined, nowMs: number): Prisma.KanbanCardWhereInput {
  if (!due) return {};
  if (due === "none") return { dueAt: null };

  const nowDate = new Date(nowMs);
  const nowDay = dayIndexOf(nowMs);
  const todayStart = new Date(bkkDayStartMs(nowDay));
  const todayEnd = new Date(bkkDayStartMs(nowDay + 1));

  if (due === "overdue") return { completedAt: null, dueAt: { lt: nowDate, not: null } };

  if (due === "today") {
    return {
      AND: [
        { dueAt: { gte: todayStart, lt: todayEnd } },
        { OR: [{ completedAt: { not: null } }, { dueAt: { gte: nowDate } }] },
      ],
    };
  }

  // week — วันในอนาคตของสัปดาห์นี้เท่านั้น (วันนี้แยกไปบั๊กเก็ต "today" แล้ว)
  const nowWeekday = new Date(nowMs + BKK_OFFSET_MS).getUTCDay();
  const mondayOffset = (nowWeekday + 6) % 7;
  const weekEndDay = nowDay - mondayOffset + 6;
  const weekEnd = new Date(bkkDayStartMs(weekEndDay + 1));
  return { dueAt: { gte: todayEnd, lt: weekEnd } };
}

/**
 * ค้นหาการ์ดข้ามทุกบอร์ดที่ `actor` มองเห็น (`visibleBoardsWhere`) — ไม่มี `now` ให้ส่งเข้ามาเพราะ
 * เป็นคิวรีสด (ใช้เวลาปัจจุบันจริงเสมอ ต่างจาก `filterBoardCards` ที่ oracle ต้องตรึงเวลาได้)
 */
export async function searchCards(
  ctx: KanbanCtx,
  actor: KanbanActor,
  filters: BoardFilters & { take?: number; cursor?: string | null },
): Promise<SearchCardsResult> {
  const take = Math.min(Math.max(filters.take ?? 20, 1), 100);
  const nowMs = Date.now();

  const boards = await prisma.kanbanBoard.findMany({
    where: {
      AND: [
        { tenantId: ctx.tenantId, systemId: ctx.systemId, status: "ACTIVE" },
        visibleBoardsWhere(actor),
        ...(filters.board ? [{ name: { contains: likeSafe(filters.board), mode: "insensitive" as const } }] : []),
      ],
    },
    select: { id: true },
  });
  if (boards.length === 0) return { items: [], total: 0 };
  const boardIds = boards.map((b) => b.id);

  let assigneeWhere: Prisma.KanbanCardWhereInput = {};
  if (filters.assignee) {
    const target = filters.assignee === "me" ? actor.userId : filters.assignee;
    assigneeWhere = { OR: [{ assigneeUserId: target }, { assignees: { some: { userId: target } } }] };
  }

  const dueWhere = dueRangeWhere(filters.due, nowMs);
  const statusWhereClause: Prisma.KanbanCardWhereInput =
    filters.status === "done" ? { completedAt: { not: null } } : filters.status === "open" ? { completedAt: null } : {};
  const labelWhereClause: Prisma.KanbanCardWhereInput = filters.label
    ? { cardLabels: { some: { label: { name: filters.label } } } }
    : {};
  const qText = filters.q?.trim();
  const qWhereClause: Prisma.KanbanCardWhereInput = qText
    ? {
        OR: [
          { title: { contains: likeSafe(qText), mode: "insensitive" } },
          { description: { contains: likeSafe(qText), mode: "insensitive" } },
          { cardLabels: { some: { label: { name: { contains: likeSafe(qText), mode: "insensitive" } } } } },
        ],
      }
    : {};

  const baseWhere: Prisma.KanbanCardWhereInput = {
    AND: [
      { tenantId: ctx.tenantId, systemId: ctx.systemId, status: "ACTIVE", boardId: { in: boardIds } },
      assigneeWhere,
      dueWhere,
      statusWhereClause,
      labelWhereClause,
      qWhereClause,
    ],
  };

  const cursor = filters.cursor ? decodeCursor(filters.cursor) : null;
  const cursorWhere: Prisma.KanbanCardWhereInput = cursor
    ? { OR: [{ createdAt: { gt: cursor.createdAt } }, { createdAt: cursor.createdAt, id: { gt: cursor.id } }] }
    : {};

  const [total, rows] = await Promise.all([
    prisma.kanbanCard.count({ where: baseWhere }),
    prisma.kanbanCard.findMany({
      where: { AND: [baseWhere, cursorWhere] },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: take + 1,
      include: {
        board: { select: { name: true } },
        column: { select: { name: true } },
        cardLabels: { include: { label: { select: { name: true, color: true } } } },
        assignees: { select: { userId: true } },
      },
    }),
  ]);

  const page = rows.slice(0, take);
  const assigneeIds = Array.from(new Set(page.flatMap((r) => r.assignees.map((a) => a.userId))));
  const users = assigneeIds.length
    ? await prisma.user.findMany({ where: { id: { in: assigneeIds } }, select: { id: true, name: true, email: true } })
    : [];
  const nameOf = new Map(users.map((u) => [u.id, u.name ?? u.email ?? u.id]));

  const items: SearchCardDto[] = page.map((r) => ({
    id: r.id,
    cardNo: r.cardNo,
    title: r.title,
    boardId: r.boardId,
    boardName: r.board.name,
    columnName: r.column.name,
    dueAt: r.dueAt ? r.dueAt.toISOString() : null,
    completedAt: r.completedAt ? r.completedAt.toISOString() : null,
    labels: r.cardLabels.map((cl) => ({ name: cl.label.name, color: cl.label.color })),
    assignees: r.assignees.map((a) => ({ userId: a.userId, name: nameOf.get(a.userId) ?? a.userId })),
  }));

  return {
    items,
    ...(rows.length > take ? { nextCursor: encodeCursor(page[page.length - 1]!) } : {}),
    total,
  };
}
