// summary.ts — มุมมองสรุป `?view=summary` (K2.4 · พิมพ์เขียว 13-kanban-v2 §3.7 · สัญญา ledger/KANBAN-RUN.md §K2.4)
//
// อ่านอย่างเดียว (VIEWER+): สรุปตัวเลข 5 ค่า (ค้าง/เลยกำหนด/วันนี้/สัปดาห์นี้/เสร็จ) + 4 มิติของการ์ด active
// บนบอร์ด (คอลัมน์/คน/กำหนดส่ง/ป้าย) + throughput รายสัปดาห์ 8 สัปดาห์ล่าสุด
//
// 🔴 หัวใจของ WO นี้: ทุกไทล์เป็นลิงก์ `?view=table&...` ที่เจาะลงแล้วได้ "จำนวนแถวเท่ากับตัวเลขในไทล์" เป๊ะ
//    (สิ่งที่ Trello ทำไม่ได้ — พิมพ์เขียว §3.7) ⇒ นับด้วย `filterBoardCards` ตัวเดียวกับ `listBoardTable`
//    (K2.1) แล้วประกอบ href จากตัวกรองฐาน (`opts.filters`) รวมกับมิติที่ไทล์นั้นเจาะจง ห้ามคิดเลขไทล์ด้วย
//    วิธีอื่นที่ไม่ตรงกับสิ่งที่ `listBoardTable` จะกรองได้จริงจากตัวกรองเดียวกัน
//
// นิยาม "ค้าง"/"เสร็จ" ตามอนุสัญญาเดียวกับ K2.10 (`reports.ts`): completedAt null = ค้าง · ไม่ null = เสร็จ
// `byColumn`/`byAssignee`/`byLabel` นับการ์ด active ทุกใบที่ผ่านตัวกรองฐาน (ค้าง+เสร็จรวมกัน — คอลัมน์ต้อง
// โชว์ทุกใบที่อยู่ในคอลัมน์นั้นจริง ๆ ไม่ใช่แค่ที่ยังไม่เสร็จ) ส่วน `byDue`/`totals.overdue|dueToday|dueWeek`
// นับเฉพาะใบที่ "ค้าง" (แบบเดียวกับ `myTasksOverview` ของ K1.13 — การ์ดที่เสร็จแล้วไม่มีความหมายเรื่อง
// "ใกล้ถึงกำหนด" อีกต่อไป) ⇒ `sum(byDue) === totals.open` เสมอ (ข้อสอบ S1.3 ยืนยันไว้)
//
// 🔴 ทำไมไม่เรียก `service.getBoardFor`: เหตุผลเดียวกับ `table.ts`/`calendar.ts` (K2.1/K2.2) — `service.ts`
//    re-export ฟังก์ชันของไฟล์นี้ออกไปด้วย ถ้า import กลับเข้า service.ts จะเกิด import วน
import { prisma } from "./db";
import { assertBoardRole } from "./members";
import {
  BKK_OFFSET_MS,
  bkkDayStartMs,
  dayIndexOf,
  dueBucketOf,
  filterBoardCards,
  type BoardFilters,
  type FilterableCard,
} from "./filters";
import type { BoardSummaryDto, KanbanActor, KanbanCtx, KanbanTagColor, SummaryLabelTileDto, SummaryThroughputWeekDto, SummaryTileDto } from "./types";
// re-export ให้ผู้เรียกนอกโมดูล (service.ts/page.tsx) ใช้ชื่อเดิมได้จากที่นี่เหมือนเดิม
export type { BoardSummaryDto, SummaryLabelTileDto, SummaryThroughputWeekDto, SummaryTileDto } from "./types";

const DAY_MS = 86_400_000;
const THROUGHPUT_WEEKS = 8;

const NONE_ASSIGNEE_KEY = "none";
const NONE_ASSIGNEE_LABEL = "ไม่มีผู้รับผิดชอบ";
const NONE_LABEL_KEY = "none";
const NONE_LABEL_LABEL = "ไม่มีป้ายกำกับ";

type SummaryDueKey = "overdue" | "today" | "week" | "later" | "none";
const DUE_TILE_LABEL: Record<SummaryDueKey, string> = {
  overdue: "เลยกำหนด",
  today: "วันนี้",
  week: "สัปดาห์นี้",
  later: "ภายหลัง",
  none: "ไม่ได้กำหนดวัน",
};
const DUE_TILE_ORDER: SummaryDueKey[] = ["overdue", "today", "week", "later", "none"];

/** แถวการ์ดดิบ + ผู้รับผิดชอบครบ (ต้องรู้ก่อนกรอง — เหมือน `RawTableCard`/`RawCalCard` ของ K2.1/K2.2) */
type RawSummaryCard = FilterableCard & {
  columnId: string;
  dueAt: Date | null;
  completedAt: Date | null;
};

export type BoardSummaryInput = {
  /** เวลาอ้างอิง (จาก server เดียวกับที่ใช้เรนเดอร์ทั้งหน้า — ให้ `filterBoardCards`/ป้ายกำหนดส่งตรงกันเป๊ะ) */
  now: Date;
  filters?: BoardFilters;
};

/** ตัวกรองฐาน (`BoardFilters`) → querystring — ไม่รวมค่าว่าง เพื่อให้ href สั้นและอ่านง่าย */
function filtersToParams(filters: BoardFilters): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.q) params.set("q", filters.q);
  if (filters.assignee) params.set("assignee", filters.assignee);
  if (filters.label) params.set("label", filters.label);
  if (filters.due) params.set("due", filters.due);
  if (filters.status) params.set("status", filters.status);
  if (filters.column) params.set("column", filters.column);
  return params;
}

/** ลิงก์ไปตาราง (`?view=table&...`) ของตัวกรองฐาน + มิติที่ไทล์นี้เจาะจง (ทับค่าเดิมของแกนเดียวกัน) */
function tileHref(base: BoardFilters, patch: Partial<BoardFilters>): string {
  const params = filtersToParams({ ...base, ...patch });
  const qs = params.toString();
  return qs ? `?view=table&${qs}` : "?view=table";
}

/** "YYYY-MM-DD" ตามวันที่ไทยของ "เลขวันไทยนับจาก epoch" (`dayIndexOf`) */
function bkkDateKeyOf(dayIndex: number): string {
  const d = new Date(bkkDayStartMs(dayIndex) + BKK_OFFSET_MS);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * มุมมองสรุปของบอร์ดหนึ่งใบ — VIEWER ขึ้นไป (มองไม่เห็นบอร์ด = ไม่พบ ตาม §6.3)
 * `actor` ใช้แค่กรอง `filters.assignee === "me"` (แพตเทิร์นเดียวกับ `listBoardTable`/`listBoardCalendar`)
 */
export async function boardSummary(
  ctx: KanbanCtx,
  actor: KanbanActor,
  boardId: string,
  opts: BoardSummaryInput,
): Promise<BoardSummaryDto> {
  await assertBoardRole(ctx, boardId, "VIEWER");
  const baseFilters = opts.filters ?? {};

  const columns = await prisma.kanbanColumn.findMany({
    where: { boardId, tenantId: ctx.tenantId, systemId: ctx.systemId, status: "ACTIVE" },
    orderBy: [{ position: { sort: "asc", nulls: "first" } }, { sortOrder: "asc" }, { createdAt: "asc" }],
    select: { id: true, name: true },
  });

  const cards = await prisma.kanbanCard.findMany({
    where: { boardId, tenantId: ctx.tenantId, systemId: ctx.systemId, status: "ACTIVE" },
    select: {
      id: true,
      title: true,
      description: true,
      columnId: true,
      dueAt: true,
      completedAt: true,
      assigneeUserId: true,
      labels: true,
    },
  });

  // ผู้รับผิดชอบทุกคน (ไม่ใช่แค่คนแรก) ก่อนกรอง — เหตุผลเดียวกับ `listBoardTable`/`listBoardCalendar`
  const allAssigneeRows = cards.length
    ? await prisma.kanbanCardAssignee.findMany({
        where: { cardId: { in: cards.map((c) => c.id) }, tenantId: ctx.tenantId },
        orderBy: { assignedAt: "asc" },
        select: { cardId: true, userId: true },
      })
    : [];
  const assigneeIdsOfCard = new Map<string, string[]>();
  for (const row of allAssigneeRows) {
    const list = assigneeIdsOfCard.get(row.cardId) ?? [];
    list.push(row.userId);
    assigneeIdsOfCard.set(row.cardId, list);
  }

  const withAssignees: RawSummaryCard[] = cards.map((c) => ({
    ...c,
    assignees: (assigneeIdsOfCard.get(c.id) ?? []).map((userId) => ({ userId })),
  }));

  const matched = filterBoardCards<RawSummaryCard>(withAssignees, baseFilters, { now: opts.now, userId: actor.userId });

  const openCards = matched.filter((c) => !c.completedAt);
  const doneCount = matched.length - openCards.length;

  // ───────── byColumn — ทุกใบที่ผ่านตัวกรองฐาน (ค้าง+เสร็จรวมกัน) ─────────
  const byColumnCount = new Map<string, number>();
  for (const c of matched) byColumnCount.set(c.columnId, (byColumnCount.get(c.columnId) ?? 0) + 1);
  const byColumn: SummaryTileDto[] = columns.map((col) => ({
    key: col.id,
    label: col.name,
    count: byColumnCount.get(col.id) ?? 0,
    href: tileHref(baseFilters, { column: col.id }),
  }));

  // ───────── byAssignee — ทุกใบที่ผ่านตัวกรองฐาน (ไม่ใช่เฉพาะที่ค้าง — "รับผิดชอบกี่ใบ" นับทุกสถานะ) ─────────
  const cardIds = matched.map((c) => c.id);
  const matchedAssigneeIds = Array.from(new Set(cardIds.flatMap((id) => assigneeIdsOfCard.get(id) ?? [])));
  const users = matchedAssigneeIds.length
    ? await prisma.user.findMany({ where: { id: { in: matchedAssigneeIds } }, select: { id: true, name: true, email: true } })
    : [];
  const nameOfUser = new Map(users.map((u) => [u.id, u.name ?? u.email ?? u.id]));
  const byAssigneeCount = new Map<string, number>();
  let noneAssigneeCount = 0;
  for (const c of matched) {
    const ids = assigneeIdsOfCard.get(c.id) ?? [];
    if (ids.length === 0) {
      noneAssigneeCount++;
      continue;
    }
    for (const uid of ids) byAssigneeCount.set(uid, (byAssigneeCount.get(uid) ?? 0) + 1);
  }
  const byAssignee: SummaryTileDto[] = [
    ...matchedAssigneeIds.map((uid) => ({
      key: uid,
      label: nameOfUser.get(uid) ?? uid,
      count: byAssigneeCount.get(uid) ?? 0,
      href: tileHref(baseFilters, { assignee: uid }),
    })),
    { key: NONE_ASSIGNEE_KEY, label: NONE_ASSIGNEE_LABEL, count: noneAssigneeCount, href: tileHref(baseFilters, { assignee: "none" }) },
  ];

  // ───────── byLabel — ทุกใบที่ผ่านตัวกรองฐาน (นับทุกสถานะ เหมือน byColumn/byAssignee) ─────────
  const labelRows = cardIds.length
    ? await prisma.kanbanCardLabel.findMany({
        where: { cardId: { in: cardIds }, tenantId: ctx.tenantId },
        include: { label: { select: { id: true, name: true, color: true } } },
      })
    : [];
  const labelsOfCard = new Map<string, { id: string; name: string; color: KanbanTagColor }[]>();
  for (const row of labelRows) {
    const list = labelsOfCard.get(row.cardId) ?? [];
    list.push({ id: row.label.id, name: row.label.name, color: row.label.color as KanbanTagColor });
    labelsOfCard.set(row.cardId, list);
  }
  const labelMeta = new Map<string, { name: string; color: KanbanTagColor }>();
  const byLabelCount = new Map<string, number>();
  let noneLabelCount = 0;
  for (const c of matched) {
    const labels = labelsOfCard.get(c.id) ?? [];
    if (labels.length === 0) {
      noneLabelCount++;
      continue;
    }
    for (const l of labels) {
      labelMeta.set(l.id, { name: l.name, color: l.color });
      byLabelCount.set(l.id, (byLabelCount.get(l.id) ?? 0) + 1);
    }
  }
  const byLabel: SummaryLabelTileDto[] = [
    ...Array.from(labelMeta.entries()).map(([id, meta]) => ({
      key: id,
      label: meta.name,
      color: meta.color,
      count: byLabelCount.get(id) ?? 0,
      href: tileHref(baseFilters, { label: meta.name }),
    })),
    {
      key: NONE_LABEL_KEY,
      label: NONE_LABEL_LABEL,
      color: "SLATE",
      count: noneLabelCount,
      href: tileHref(baseFilters, { label: "none" }),
    },
  ];

  // ───────── byDue + totals — เฉพาะใบที่ "ค้าง" (completedAt null) เหมือน `myTasksOverview` (K1.13) ─────────
  const nowMs = opts.now.getTime();
  const byDueCount: Record<SummaryDueKey, number> = { overdue: 0, today: 0, week: 0, later: 0, none: 0 };
  for (const c of openCards) {
    const bucket = dueBucketOf(c, nowMs);
    const key: SummaryDueKey = bucket === null ? "later" : bucket;
    byDueCount[key]++;
  }
  const byDue: SummaryTileDto[] = DUE_TILE_ORDER.map((key) => ({
    key,
    label: DUE_TILE_LABEL[key],
    count: byDueCount[key],
    href: key === "later" ? tileHref(baseFilters, {}) : tileHref(baseFilters, { due: key }),
  }));

  // ───────── throughput — 8 สัปดาห์ล่าสุด (จันทร์ไทย) สัปดาห์นี้อยู่ท้าย — ไม่ผูกกับตัวกรองฐาน ─────────
  // (ความเร็วงานของทั้งบอร์ดตามช่วงเวลา ไม่ใช่มุมมองที่ถูกกรองแล้ว — ตรงกับสัญญา "throughput รายสัปดาห์")
  const nowDay = dayIndexOf(nowMs);
  const nowWeekday = new Date(nowMs + BKK_OFFSET_MS).getUTCDay(); // 0 = อาทิตย์
  const mondayOffset = (nowWeekday + 6) % 7;
  const thisWeekStartDay = nowDay - mondayOffset;
  const rangeStartDay = thisWeekStartDay - (THROUGHPUT_WEEKS - 1) * 7;
  const rangeStartMs = bkkDayStartMs(rangeStartDay);
  const rangeEndMs = bkkDayStartMs(thisWeekStartDay + 7);

  const [createdRows, completedRows] = await Promise.all([
    prisma.kanbanCard.findMany({
      where: { boardId, tenantId: ctx.tenantId, systemId: ctx.systemId, createdAt: { gte: new Date(rangeStartMs), lt: new Date(rangeEndMs) } },
      select: { createdAt: true },
    }),
    prisma.kanbanCard.findMany({
      where: { boardId, tenantId: ctx.tenantId, systemId: ctx.systemId, completedAt: { gte: new Date(rangeStartMs), lt: new Date(rangeEndMs) } },
      select: { completedAt: true },
    }),
  ]);

  const throughput: SummaryThroughputWeekDto[] = [];
  for (let i = 0; i < THROUGHPUT_WEEKS; i++) {
    const weekStartDay = rangeStartDay + i * 7;
    const weekStartMs = bkkDayStartMs(weekStartDay);
    const weekEndMs = bkkDayStartMs(weekStartDay + 7);
    const created = createdRows.filter((r) => r.createdAt.getTime() >= weekStartMs && r.createdAt.getTime() < weekEndMs).length;
    const completed = completedRows.filter((r) => r.completedAt !== null && r.completedAt.getTime() >= weekStartMs && r.completedAt.getTime() < weekEndMs).length;
    throughput.push({ weekStart: bkkDateKeyOf(weekStartDay), created, completed });
  }

  return {
    totals: {
      open: openCards.length,
      overdue: byDueCount.overdue,
      dueToday: byDueCount.today,
      dueWeek: byDueCount.week,
      done: doneCount,
    },
    byColumn,
    byAssignee,
    byDue,
    byLabel,
    throughput,
  };
}
