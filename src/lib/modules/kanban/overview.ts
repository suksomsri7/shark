// overview.ts — มุมมองข้ามบอร์ดระดับองค์กร `/kanban/overview` (K3.8 · ledger/KANBAN-RUN.md §K3.8)
//
// อ่านอย่างเดียว (canReadKanban ขึ้นไป): รวมการ์ดที่ "ค้าง" (status ACTIVE + completedAt null) ของทุก
// บอร์ด ACTIVE ที่ actor มองเห็น (`visibleBoardsWhere` — เหมือน `reports.ts`/`system-calendar.ts`/
// `search.ts`) เป็นตารางเดียว กรอง/จัดกลุ่ม/เรียง/แบ่งหน้าได้เหมือนมุมมองตาราง (K2.1 `table.ts`) แต่ข้ามบอร์ด
//
// 🔴 งบประสิทธิภาพ §12.1: คิวรีเดียวข้ามบอร์ด ไม่ใช่ `listBoardTable` วนทีละบอร์ด (N คิวรี) — เหตุผลเดียวกับ
//    `system-calendar.ts`/`reports.ts` ("ทำไมไม่เรียกของเดิมวนลูป")
// 🔴 ขอบเขตคงที่ = ค้างเท่านั้น (`completedAt: null`) — ต่างจาก `listBoardTable` ที่โชว์ทุกสถานะแล้วให้
//    `filters.status` เลือกเอา: ภาพรวมองค์กรตอบคำถาม "อะไรค้างอยู่บ้างทั้งร้าน" ไม่ใช่ทะเบียนการ์ดทั้งหมด
//    (สัญญา K3.8: "ขอบเขต = การ์ด ACTIVE + completedAt null" เป็นส่วนหนึ่งของขอบเขต ไม่ใช่ตัวกรอง —
//    `filters.status=done` ที่ส่งมาจึงได้ผลลัพธ์ว่าง เป็นพฤติกรรมที่ตั้งใจ)
// 🔴 K3.7: ตัวสะท้อน (`mirrorOfId != null`) ไม่นับซ้ำในภาพรวม — กรองออกตั้งแต่คิวรีแรก (นับต้นฉบับใบเดียว
//    ไม่ว่าจะถูกสะท้อนไปกี่บอร์ดก็ตาม — ต้นฉบับยังนับที่บอร์ดของมันเองตามปกติ)
// 🔴 ป้ายกรองด้วย "ชื่อ" ข้ามบอร์ด (ป้ายคนละบอร์ดชื่อเดียวกันถือเป็นตัวเดียวกัน) — ใช้ `filterBoardCards`
//    เดิม (K1.11) ตรง ๆ (มันกรองป้ายด้วยชื่ออยู่แล้ว ไม่ต้องเขียนใหม่)
//
// 🔴 ทำไมไม่เรียก `service.ts`: เหตุผลเดียวกับ `table.ts`/`summary.ts`/`calendar.ts` — `service.ts` ไม่ได้
//    re-export ไฟล์นี้ (K3.8 ใหม่) แต่ถ้าวันหน้ามีคน re-export แล้ว import กลับเข้ามาจะเกิดวงกลม ⇒ คุยกับ
//    `prisma`/`access.ts`/`filters.ts` ตรง ๆ แบบเดียวกับทุกมุมมองอื่นในโมดูลนี้

import { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { visibleBoardsWhere } from "./access";
import { dueBucketOf, filterBoardCards, type BoardFilters, type FilterableCard } from "./filters";
import { linkChipsOfCards } from "./link-resolvers";
import { groupRowsByAssignee } from "./table-shared";
import type {
  CrossBoardBoardDto,
  CrossBoardFilters,
  CrossBoardGroupBy,
  CrossBoardGroupDto,
  CrossBoardResult,
  CrossBoardRowDto,
  CrossBoardSort,
  CrossBoardTotalsDto,
  KanbanActor,
  KanbanCtx,
  KanbanTagColor,
  TableRowDto,
} from "./types";
// re-export ให้ผู้เรียกนอกโมดูล (page.tsx/oracle) ใช้ชื่อเดิมได้จากที่นี่เหมือนไฟล์อื่นในโมดูล (K2.1/K2.12 ฯลฯ)
export type {
  CrossBoardBoardDto,
  CrossBoardFilters,
  CrossBoardGroupBy,
  CrossBoardGroupDto,
  CrossBoardResult,
  CrossBoardRowDto,
  CrossBoardSort,
  CrossBoardTotalsDto,
} from "./types";

const MAX_PAGE_SIZE = 200;
const DEFAULT_PAGE_SIZE = 50;

type CrossBoardDueKey = "overdue" | "today" | "week" | "later" | "none";
const DUE_GROUP_ORDER: readonly CrossBoardDueKey[] = ["overdue", "today", "week", "later", "none"];
const DUE_GROUP_LABEL: Record<CrossBoardDueKey, string> = {
  overdue: "เลยกำหนด",
  today: "วันนี้",
  week: "สัปดาห์นี้",
  later: "ภายหลัง",
  none: "ไม่ได้กำหนดวัน",
};

/**
 * `filterBoardCards` (K1.11) ไม่เคยอ่าน `filters.board` เลย (บอร์ดถูกคัดก่อนหน้าแล้วผ่าน `visibleBoardsWhere`
 * + `wantedBoardIds` ในฟังก์ชันหลัก) — ตัด `board` (ชนิด `string[]` ของภาพรวม) ออกก่อนส่งเข้า `BoardFilters`
 * (ชนิดเดิม `board?: string` = "ชื่อบอร์ด contains" ของ `search.ts` — คนละความหมาย ห้ามส่งข้ามชนิดกันตรง ๆ)
 */
function toBoardFilters(f: CrossBoardFilters): BoardFilters {
  const { board: _board, ...rest } = f;
  return rest;
}

/** แถวการ์ดดิบข้ามบอร์ด + สิ่งที่ต้องรู้ก่อนกรอง (เหมือน `RawTableCard` ของ table.ts + `boardId`) */
type RawRow = FilterableCard & {
  cardNo: number | null;
  boardId: string;
  columnId: string;
  dueAt: Date | null;
  completedAt: Date | null;
  updatedAt: Date;
  createdAt: Date;
  recurrenceRule: string | null;
};

export async function listCrossBoard(ctx: KanbanCtx, actor: KanbanActor, opts: {
  now: Date;
  filters?: CrossBoardFilters;
  group?: CrossBoardGroupBy;
  sort?: CrossBoardSort;
  page?: number;
  pageSize?: number;
}): Promise<CrossBoardResult> {
  const page = Math.max(1, Math.floor(opts.page ?? 1));
  const pageSize = Math.min(Math.max(1, Math.floor(opts.pageSize ?? DEFAULT_PAGE_SIZE)), MAX_PAGE_SIZE);

  const boards = await prisma.kanbanBoard.findMany({
    where: { AND: [{ tenantId: ctx.tenantId, systemId: ctx.systemId, status: "ACTIVE" }, visibleBoardsWhere(actor)] },
    select: { id: true, name: true, color: true, sortOrder: true },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });

  const empty = (): CrossBoardResult => ({ rows: [], total: 0, page, pageSize, boards: [] });
  if (boards.length === 0) return empty();

  const boardNameOf = new Map(boards.map((b) => [b.id, b.name]));
  const boardColorOf = new Map(boards.map((b) => [b.id, b.color as KanbanTagColor]));
  const boardIndexOf = new Map(boards.map((b, i) => [b.id, i]));

  const filters = opts.filters ?? {};
  // 🔴 `boards[]` ของผลลัพธ์ (ตัวเลือกของตัวกรอง `overview-boards`) มาจากบอร์ดที่ "มองเห็น" ทั้งหมดเสมอ —
  //    ไม่หดตาม `filters.board` ที่เลือกไว้ตอนนี้ (ไม่งั้นตัวเลือกในดรอปดาวน์จะหายไปเรื่อย ๆ เมื่อเลือกบอร์ด)
  const wantedBoardIds = filters.board && filters.board.length > 0 ? new Set(filters.board) : null;
  const scopedBoards = wantedBoardIds ? boards.filter((b) => wantedBoardIds.has(b.id)) : boards;
  if (scopedBoards.length === 0) {
    return { ...empty(), boards: boards.map((b) => ({ id: b.id, name: b.name, color: b.color as KanbanTagColor, count: 0 })) };
  }
  const scopedBoardIds = scopedBoards.map((b) => b.id);

  const columns = await prisma.kanbanColumn.findMany({
    where: { boardId: { in: scopedBoardIds }, tenantId: ctx.tenantId, systemId: ctx.systemId, status: "ACTIVE" },
    orderBy: [{ position: { sort: "asc", nulls: "first" } }, { sortOrder: "asc" }, { createdAt: "asc" }],
    select: { id: true, name: true, boardId: true },
  });
  const columnNameOf = new Map(columns.map((c) => [c.id, c.name]));
  // ลำดับคอลัมน์ "ซ้าย→ขวา" ภายในบอร์ดของตัวเอง (แบบเดียวกับ table.ts) — ใช้จัด sort=position ข้ามบอร์ด
  const columnIndexOf = new Map<string, number>();
  {
    const perBoardIdx = new Map<string, number>();
    for (const c of columns) {
      const i = perBoardIdx.get(c.boardId) ?? 0;
      columnIndexOf.set(c.id, i);
      perBoardIdx.set(c.boardId, i + 1);
    }
  }

  // ขอบเขตคงที่ = ค้างเท่านั้น (completedAt null) + ไม่นับตัวสะท้อน (mirrorOfId null — K3.7) — ดูหัวไฟล์
  const cards = await prisma.kanbanCard.findMany({
    where: {
      tenantId: ctx.tenantId,
      systemId: ctx.systemId,
      status: "ACTIVE",
      boardId: { in: scopedBoardIds },
      completedAt: null,
      mirrorOfId: null,
    },
    orderBy: [{ position: { sort: "asc", nulls: "first" } }, { sortOrder: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      cardNo: true,
      title: true,
      description: true,
      boardId: true,
      columnId: true,
      dueAt: true,
      completedAt: true,
      updatedAt: true,
      createdAt: true,
      recurrenceRule: true,
      labels: true,
      assigneeUserId: true,
    },
  });

  // นับ "ค้างทั้งหมดต่อบอร์ด" ของทุกบอร์ดที่มองเห็น (ไม่ใช่แค่ scopedBoards) ไว้ทำ badge ตัวเลือกบอร์ด —
  // นับจากคิวรีเดียวกับที่ใช้จริง (ไม่ใช่คิวรีแยก) เมื่อ `filters.board` เลือกไว้บางส่วน ต้องคิวรีเพิ่มของ
  // บอร์ดที่เหลือ (เกิดขึ้นน้อย — เฉพาะตอนกรองบอร์ดแล้วยังอยากเห็นจำนวนของบอร์ดอื่นในดรอปดาวน์)
  const countByBoard = new Map<string, number>();
  for (const c of cards) countByBoard.set(c.boardId, (countByBoard.get(c.boardId) ?? 0) + 1);
  const uncounted = boards.filter((b) => !scopedBoardIds.includes(b.id));
  if (uncounted.length > 0) {
    const rest = await prisma.kanbanCard.groupBy({
      by: ["boardId"],
      where: {
        tenantId: ctx.tenantId,
        systemId: ctx.systemId,
        status: "ACTIVE",
        boardId: { in: uncounted.map((b) => b.id) },
        completedAt: null,
        mirrorOfId: null,
      },
      _count: { _all: true },
    });
    for (const r of rest) countByBoard.set(r.boardId, r._count._all);
  }
  const boardDtos: CrossBoardBoardDto[] = boards.map((b) => ({ id: b.id, name: b.name, color: b.color as KanbanTagColor, count: countByBoard.get(b.id) ?? 0 }));

  if (cards.length === 0) return { ...empty(), boards: boardDtos };

  // ผู้รับผิดชอบทุกคน (ไม่ใช่แค่คนแรก) ก่อนกรอง — เหตุผลเดียวกับ `listBoardTable`/`boardSummary`
  const cardIdsAll = cards.map((c) => c.id);
  const allAssigneeRows = await prisma.kanbanCardAssignee.findMany({
    where: { cardId: { in: cardIdsAll }, tenantId: ctx.tenantId },
    orderBy: { assignedAt: "asc" },
    select: { cardId: true, userId: true },
  });
  const assigneeIdsOfCard = new Map<string, string[]>();
  for (const row of allAssigneeRows) {
    const list = assigneeIdsOfCard.get(row.cardId) ?? [];
    list.push(row.userId);
    assigneeIdsOfCard.set(row.cardId, list);
  }

  // ── ลำดับ "position" ข้ามบอร์ด = บอร์ด (sortOrder/ชื่อ) ก่อน แล้วคอลัมน์ซ้าย→ขวาของบอร์ดนั้น แล้ว
  //    ตำแหน่งในคอลัมน์ (คิวรีข้างบนเรียงในคอลัมน์มาแล้ว — เหลือจัดกลุ่มตามบอร์ด/คอลัมน์ด้วย stable sort) ──
  const ordered: RawRow[] = [...cards]
    .sort(
      (a, b) =>
        (boardIndexOf.get(a.boardId) ?? 0) - (boardIndexOf.get(b.boardId) ?? 0) ||
        (columnIndexOf.get(a.columnId) ?? 0) - (columnIndexOf.get(b.columnId) ?? 0),
    )
    .map((c) => ({ ...c, assignees: (assigneeIdsOfCard.get(c.id) ?? []).map((userId) => ({ userId })) }));

  const matched = filterBoardCards<RawRow>(ordered, toBoardFilters(filters), { now: opts.now, userId: actor.userId });
  if (matched.length === 0) return { ...empty(), boards: boardDtos };

  const cardIds = matched.map((c) => c.id);
  const [labelRows, checklistRows] = await Promise.all([
    prisma.kanbanCardLabel.findMany({
      where: { cardId: { in: cardIds }, tenantId: ctx.tenantId },
      include: { label: { select: { id: true, name: true, color: true } } },
    }),
    prisma.$queryRaw<{ cardId: string; total: bigint; done: bigint }[]>`
      SELECT ch."cardId" as "cardId",
             COUNT(i.id) as total,
             COUNT(i.id) FILTER (WHERE i.done) as done
      FROM "KanbanChecklist" ch
      JOIN "KanbanChecklistItem" i ON i."checklistId" = ch.id
      WHERE ch."cardId" IN (${Prisma.join(cardIds)})
      GROUP BY ch."cardId"
    `,
  ]);

  const matchedAssigneeIds = Array.from(new Set(cardIds.flatMap((id) => assigneeIdsOfCard.get(id) ?? [])));
  const users = matchedAssigneeIds.length
    ? await prisma.user.findMany({ where: { id: { in: matchedAssigneeIds } }, select: { id: true, name: true, email: true } })
    : [];
  const nameOf = new Map(users.map((u) => [u.id, u.name ?? u.email ?? u.id]));

  const labelsOfCard = new Map<string, { id: string; name: string; color: KanbanTagColor }[]>();
  for (const row of labelRows) {
    const list = labelsOfCard.get(row.cardId) ?? [];
    list.push({ id: row.label.id, name: row.label.name, color: row.label.color as KanbanTagColor });
    labelsOfCard.set(row.cardId, list);
  }
  const checklistOfCard = new Map(checklistRows.map((r) => [r.cardId, { done: Number(r.done), total: Number(r.total) }]));

  const rowsAll: CrossBoardRowDto[] = matched.map((raw) => {
    const checklist = checklistOfCard.get(raw.id);
    const assignees = (assigneeIdsOfCard.get(raw.id) ?? []).map((userId) => ({ userId, name: nameOf.get(userId) ?? userId }));
    const row: TableRowDto = {
      id: raw.id,
      cardNo: raw.cardNo,
      title: raw.title,
      columnId: raw.columnId,
      columnName: columnNameOf.get(raw.columnId) ?? "",
      assignees,
      dueAt: raw.dueAt ? raw.dueAt.toISOString() : null,
      completedAt: null,
      checklistDone: checklist?.done ?? 0,
      checklistTotal: checklist?.total ?? 0,
      labels: labelsOfCard.get(raw.id) ?? [],
      links: [], // เติมหลังแบ่งหน้า (เหมือน table.ts) — resolve เฉพาะแถวที่แสดงจริง
      updatedAt: raw.updatedAt.toISOString(),
      // ภาพรวมข้ามบอร์ดไม่มี "คอลัมน์ฟิลด์กำหนดเอง" ร่วมกัน (แต่ละบอร์ดนิยามฟิลด์ของตัวเอง) — หนี้ที่ตั้งใจ (ดู wo-notes)
      fieldsOnCard: [],
      isRecurring: raw.recurrenceRule != null,
    };
    return { ...row, boardId: raw.boardId, boardName: boardNameOf.get(raw.boardId) ?? "", boardColor: boardColorOf.get(raw.boardId) ?? "SLATE" };
  });

  const sorted = sortCrossBoardRows(rowsAll, opts.sort ?? "position");

  const start = (page - 1) * pageSize;
  const rows = sorted.slice(start, start + pageSize);

  // เติม "เชื่อมระบบ" (K3.1) หลังแบ่งหน้าเท่านั้น — เหตุผลเดียวกับ table.ts
  const chips = await linkChipsOfCards(ctx, actor, rows.map((r) => r.id));
  for (const row of rows) row.links = chips.get(row.id) ?? [];

  const result: CrossBoardResult = { rows, total: sorted.length, page, pageSize, boards: boardDtos };
  if (opts.group) result.groups = groupCrossBoardRows(sorted, opts.group, opts.now);
  return result;
}

/**
 * ตัวเลข 4 ค่าหัวหน้าเพจ (ค้าง/เลยกำหนด/วันนี้/สัปดาห์นี้) — ข้ามทุกบอร์ดที่มองเห็น ไม่ผูกกับตัวกรอง/หน้า
 * ปัจจุบันของตาราง (สัญญา §K3.8 "ตัวเลข 4 ค่า" — ต่างจาก `data.total` ของ `listCrossBoard` ที่ผูกกับ
 * `filters`) 🔴 คิวรีเบา ๆ แยกจาก `listCrossBoard` โดยตั้งใจ (แบบเดียวกับ `reports.ts#openCards`) — ไม่ต้อง
 * join label/checklist/assignee เพราะแค่นับ ไม่ต้องเรนเดอร์แถว
 */
export async function crossBoardTotals(ctx: KanbanCtx, actor: KanbanActor, opts: { now: Date }): Promise<CrossBoardTotalsDto> {
  const boards = await prisma.kanbanBoard.findMany({
    where: { AND: [{ tenantId: ctx.tenantId, systemId: ctx.systemId, status: "ACTIVE" }, visibleBoardsWhere(actor)] },
    select: { id: true },
  });
  if (boards.length === 0) return { open: 0, overdue: 0, dueToday: 0, dueWeek: 0 };

  const cards = await prisma.kanbanCard.findMany({
    where: {
      tenantId: ctx.tenantId,
      systemId: ctx.systemId,
      status: "ACTIVE",
      boardId: { in: boards.map((b) => b.id) },
      completedAt: null,
      mirrorOfId: null,
    },
    select: { id: true, dueAt: true },
  });

  const nowMs = opts.now.getTime();
  const totals: CrossBoardTotalsDto = { open: cards.length, overdue: 0, dueToday: 0, dueWeek: 0 };
  for (const c of cards) {
    const bucket = dueBucketOf({ id: c.id, title: "", dueAt: c.dueAt, completedAt: null }, nowMs);
    if (bucket === "overdue") totals.overdue++;
    else if (bucket === "today") totals.dueToday++;
    else if (bucket === "week") totals.dueWeek++;
  }
  return totals;
}

/** เรียงแถวข้ามบอร์ด — `position` = ลำดับบอร์ด→คอลัมน์→ตำแหน่งเดิม (คงลำดับที่ประกอบมา) ตัวอื่นเรียงใหม่แบบเสถียร */
function sortCrossBoardRows(rows: readonly CrossBoardRowDto[], sort: CrossBoardSort): CrossBoardRowDto[] {
  if (sort === "position") return [...rows];
  const withIndex = rows.map((r, i) => ({ r, i }));
  withIndex.sort((a, b) => {
    switch (sort) {
      case "due": {
        // ไม่กำหนดอยู่ท้ายเสมอ (สัญญาเดียวกับ K2.1) — เทียบเวลาที่ parse แล้วก่อน ตกลำดับเดิมเมื่อเท่ากัน
        const at = a.r.dueAt ? Date.parse(a.r.dueAt) : null;
        const bt = b.r.dueAt ? Date.parse(b.r.dueAt) : null;
        if (at === null && bt === null) return a.i - b.i;
        if (at === null) return 1;
        if (bt === null) return -1;
        return at - bt || a.i - b.i;
      }
      case "created":
        // cardNo ไม่เทียบข้ามบอร์ดได้ (แต่ละบอร์ดวิ่งเลขของตัวเอง — ต่างจาก table.ts ที่ใช้ cardNo แทน
        // createdAt ได้เพราะบอร์ดเดียว) ⇒ ที่นี่เรียงจริงด้วย `updatedAt` ไม่ได้เพราะไม่มี createdAt ใน DTO
        // ก็จริง — ใช้ `updatedAt` เป็นตัวแทนที่ใกล้เคียงที่สุดที่มีอยู่ใน DTO นี้ (ใหม่สุดก่อน) แทน (หนี้)
        return Date.parse(b.r.updatedAt) - Date.parse(a.r.updatedAt) || a.i - b.i;
      case "updated":
        return Date.parse(b.r.updatedAt) - Date.parse(a.r.updatedAt) || a.i - b.i;
      default:
        return a.i - b.i;
    }
  });
  return withIndex.map((x) => x.r);
}

function groupCrossBoardRows(rows: readonly CrossBoardRowDto[], group: CrossBoardGroupBy, now: Date): CrossBoardGroupDto[] {
  if (group === "board") {
    const byBoard = new Map<string, { label: string; ids: string[] }>();
    for (const r of rows) {
      const entry = byBoard.get(r.boardId) ?? { label: r.boardName, ids: [] };
      entry.ids.push(r.id);
      byBoard.set(r.boardId, entry);
    }
    return Array.from(byBoard.entries()).map(([boardId, v]) => ({ key: boardId, label: v.label, rowIds: v.ids }));
  }
  if (group === "assignee") return groupRowsByAssignee(rows);
  // group === "due" — เฉพาะบั๊กเก็ตค้าง (ขอบเขตของภาพรวมมีแต่การ์ดค้างอยู่แล้ว ไม่มี "เสร็จ")
  const nowMs = now.getTime();
  const byKey = new Map<CrossBoardDueKey, string[]>();
  for (const r of rows) {
    const bucket = dueBucketOf({ id: r.id, title: r.title, dueAt: r.dueAt, completedAt: r.completedAt }, nowMs);
    const key: CrossBoardDueKey = bucket === null ? "later" : bucket;
    byKey.set(key, [...(byKey.get(key) ?? []), r.id]);
  }
  return DUE_GROUP_ORDER.map((key) => ({ key, label: DUE_GROUP_LABEL[key], rowIds: byKey.get(key) ?? [] }));
}
