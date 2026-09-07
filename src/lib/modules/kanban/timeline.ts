// timeline.ts — มุมมองไทม์ไลน์ `?view=timeline` (K2.3 · พิมพ์เขียว 13-kanban-v2 §3.6 · สัญญา ledger/KANBAN-RUN.md §K2.3)
//
// อ่านอย่างเดียว (VIEWER+): แถบงานจาก `startAt` → `dueAt` ของการ์ด ACTIVE ที่มี `dueAt` อยู่ในช่วงที่ขอ
// (กรองด้วย `filterBoardCards` เดิม K1.11 เหมือน table.ts/calendar.ts) จัดกลุ่มตามคอลัมน์/คน/ป้าย
// เขียนได้ 2 อย่าง (ลากขอบ/ลากตัวแถบ) — ทั้งคู่ผ่าน `updateCardFields` เดิมทั้งหมด (K1.6) ไม่เขียน query
// ใหม่ ⇒ activity `CARD_DUE_SET`/แจ้งเตือน/realtime ได้ครบเหมือนแก้จากหลังการ์ด
//
// 🔴 ทำไมไม่เรียก `service.getBoardFor`: เหตุผลเดียวกับ `table.ts`/`calendar.ts` (K2.1/K2.2) — `service.ts`
//    re-export ฟังก์ชันของไฟล์นี้ออกไปด้วย ถ้า import กลับเข้า service.ts จะเกิด import วน
import { prisma } from "./db";
import { KanbanNotFoundError } from "./access";
import { assertBoardRole, assertCardRole } from "./members";
import { updateCardFields } from "./cards";
import { filterBoardCards, type BoardFilters, type FilterableCard } from "./filters";
import type {
  BoardTimelineDto,
  KanbanActor,
  KanbanCtx,
  KanbanTagColor,
  TimelineBarDto,
  TimelineGroupBy,
  TimelineRowDto,
} from "./types";
// re-export ให้ผู้เรียกนอกโมดูล (service.ts/page.tsx) ใช้ชื่อเดิมได้จากที่นี่เหมือนเดิม
export type { BoardTimelineDto, TimelineBarDto, TimelineGroupBy, TimelineRowDto } from "./types";

const DAY_MS = 86_400_000;
const BKK_OFFSET_MS = 7 * 60 * 60 * 1000; // Asia/Bangkok = UTC+7 ตายตัว (ไม่มี DST)
const MAX_RANGE_DAYS = 366; // กันดึงทั้งประวัติ (สัญญา K2.3)

const NONE_KEY = "none";
const NONE_ASSIGNEE_LABEL = "ไม่มีผู้รับผิดชอบ";
const NONE_LABEL_LABEL = "ไม่มีป้าย";

/** "YYYY-MM-DD" ตามวันที่ไทยของเวลา `ms` — ใช้ทั้ง `startDay`/`endDay` ของแถบ */
function bkkDayKey(ms: number): string {
  const d = new Date(ms + BKK_OFFSET_MS);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** แถวการ์ดดิบ + สิ่งที่ต้องรู้ก่อนกรอง (แบบเดียวกับ `RawTableCard`/`RawCalCard` ของ K2.1/K2.2) */
type RawTimelineCard = FilterableCard & {
  cardNo: number | null;
  columnId: string;
  startAt: Date | null;
  dueAt: Date | null;
  completedAt: Date | null;
};

export type ListBoardTimelineInput = {
  /** ช่วงที่ต้องการ (ปิดทั้งสองฝั่ง `[from, to]`) — หน้าบอร์ด (K2.3) คำนวณจากซูมที่เลือก */
  from: Date;
  to: Date;
  /** เวลาอ้างอิง (จาก server เดียวกับที่ใช้เรนเดอร์ทั้งหน้า) — ใช้คิด `isOverdue`/`filters.due` */
  now: Date;
  filters?: BoardFilters;
  /** ปริยาย "column" */
  group?: TimelineGroupBy;
};

/**
 * มุมมองไทม์ไลน์ของบอร์ดหนึ่งใบ — VIEWER ขึ้นไป (มองไม่เห็นบอร์ด = ไม่พบ ตาม §6.3)
 * `actor` ใช้แค่กรอง `filters.assignee === "me"` (แพตเทิร์นเดียวกับ `listBoardTable`/`listBoardCalendar`)
 */
export async function listBoardTimeline(
  ctx: KanbanCtx,
  actor: KanbanActor,
  boardId: string,
  opts: ListBoardTimelineInput,
): Promise<BoardTimelineDto> {
  await assertBoardRole(ctx, boardId, "VIEWER");

  const rangeDays = Math.round((opts.to.getTime() - opts.from.getTime()) / DAY_MS);
  if (rangeDays > MAX_RANGE_DAYS) {
    throw new Error(`ช่วงเวลาที่ขอยาวเกินไป (สูงสุด ${MAX_RANGE_DAYS} วัน) — เลือกช่วงที่แคบลง`);
  }

  const columns = await prisma.kanbanColumn.findMany({
    where: { boardId, tenantId: ctx.tenantId, systemId: ctx.systemId, status: "ACTIVE" },
    orderBy: [{ position: { sort: "asc", nulls: "first" } }, { sortOrder: "asc" }, { createdAt: "asc" }],
    select: { id: true, name: true },
  });
  const columnName = new Map(columns.map((c) => [c.id, c.name]));

  const cards = await prisma.kanbanCard.findMany({
    where: { boardId, tenantId: ctx.tenantId, systemId: ctx.systemId, status: "ACTIVE" },
    // ลำดับเสถียร (เหมือน `listBoardTable`/`listBoardCalendar`) — ลำดับแถบก่อนเรียง startDay ไม่กระโดดสลับที่
    orderBy: [{ position: { sort: "asc", nulls: "first" } }, { sortOrder: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      cardNo: true,
      title: true,
      description: true,
      columnId: true,
      startAt: true,
      dueAt: true,
      completedAt: true,
      assigneeUserId: true,
      labels: true,
    },
  });

  // ผู้รับผิดชอบทุกคน (ไม่ใช่แค่คนแรก) ก่อนกรอง — เหตุผลเดียวกับ K2.1/K2.2
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

  const withAssignees: RawTimelineCard[] = cards.map((c) => ({
    ...c,
    assignees: (assigneeIdsOfCard.get(c.id) ?? []).map((userId) => ({ userId })),
  }));

  const filters = opts.filters ?? {};
  const matched = filterBoardCards<RawTimelineCard>(withAssignees, filters, { now: opts.now, userId: actor.userId });

  const fromMs = opts.from.getTime();
  const toMs = opts.to.getTime();
  const withDue = matched.filter((c) => c.dueAt !== null);
  const inRange = withDue.filter((c) => c.dueAt!.getTime() >= fromMs && c.dueAt!.getTime() <= toMs);
  const unscheduledCount = matched.length - withDue.length;

  const cardIds = inRange.map((c) => c.id);
  const [labelRows, users] = await Promise.all([
    cardIds.length
      ? prisma.kanbanCardLabel.findMany({
          where: { cardId: { in: cardIds }, tenantId: ctx.tenantId },
          include: { label: { select: { id: true, name: true, color: true, sortOrder: true } } },
        })
      : Promise.resolve([]),
    (() => {
      const assigneeUserIds = Array.from(new Set(cardIds.flatMap((id) => assigneeIdsOfCard.get(id) ?? [])));
      return assigneeUserIds.length
        ? prisma.user.findMany({ where: { id: { in: assigneeUserIds } }, select: { id: true, name: true, email: true } })
        : Promise.resolve([]);
    })(),
  ]);

  // ป้ายของการ์ด เรียงตาม sortOrder แล้ว name (แบบเดียวกับ `syncCardLabelJson` ที่คุม `KanbanCard.labels`
  // json อยู่แล้ว) — ป้าย "แรก" ของแถบ = ตัวหัวลิสต์นี้เป๊ะ ตรงกับที่จอ/การ์ดอื่นเห็น ไม่ใช่ลำดับสุ่มจาก DB
  const labelsOfCard = new Map<string, { id: string; name: string; color: KanbanTagColor; sortOrder: number }[]>();
  for (const row of labelRows) {
    const list = labelsOfCard.get(row.cardId) ?? [];
    list.push({ id: row.label.id, name: row.label.name, color: row.label.color as KanbanTagColor, sortOrder: row.label.sortOrder });
    labelsOfCard.set(row.cardId, list);
  }
  for (const list of labelsOfCard.values()) list.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "th"));

  const nameOf = new Map(users.map((u) => [u.id, u.name ?? u.email ?? u.id]));
  const columnIdOfCard = new Map(inRange.map((c) => [c.id, c.columnId]));

  const nowMs = opts.now.getTime();
  const toBar = (c: RawTimelineCard): TimelineBarDto => {
    const dueMs = c.dueAt!.getTime();
    const startMs = c.startAt ? c.startAt.getTime() : dueMs;
    const firstLabel = labelsOfCard.get(c.id)?.[0] ?? null;
    return {
      cardId: c.id,
      cardNo: c.cardNo,
      title: c.title,
      startAt: c.startAt ? c.startAt.toISOString() : null,
      dueAt: c.dueAt!.toISOString(),
      startDay: bkkDayKey(startMs),
      endDay: bkkDayKey(dueMs),
      isOverdue: dueMs < nowMs && !c.completedAt,
      isDone: !!c.completedAt,
      color: firstLabel ? firstLabel.color : null,
      columnName: columnName.get(c.columnId) ?? "",
      assignees: (assigneeIdsOfCard.get(c.id) ?? []).map((userId) => ({ userId, name: nameOf.get(userId) ?? userId })),
    };
  };

  const bars = inRange.map(toBar).sort((a, b) => (a.startDay < b.startDay ? -1 : a.startDay > b.startDay ? 1 : 0));

  const group = opts.group ?? "column";
  const rows = groupTimelineRows(bars, group, columns, columnIdOfCard, labelsOfCard);

  return {
    range: { from: opts.from.toISOString(), to: opts.to.toISOString() },
    zoomDays: rangeDays + 1,
    rows,
    unscheduled: unscheduledCount,
  };
}

/** จัดแถบเข้าแถวตาม `group` — bars เข้ามาเรียง startDay แล้ว (คงลำดับเดิมไว้ในแต่ละแถว) */
function groupTimelineRows(
  bars: readonly TimelineBarDto[],
  group: TimelineGroupBy,
  columns: readonly { id: string; name: string }[],
  columnIdOfCard: ReadonlyMap<string, string>,
  labelsOfCard: ReadonlyMap<string, { id: string; name: string }[]>,
): TimelineRowDto[] {
  if (group === "column") {
    const byColumn = new Map<string, TimelineBarDto[]>();
    for (const bar of bars) {
      const columnId = columnIdOfCard.get(bar.cardId);
      if (!columnId) continue;
      const list = byColumn.get(columnId) ?? [];
      list.push(bar);
      byColumn.set(columnId, list);
    }
    return columns.map((c) => ({ key: c.id, label: c.name, bars: byColumn.get(c.id) ?? [] }));
  }

  if (group === "assignee") {
    const byUser = new Map<string, { label: string; bars: TimelineBarDto[] }>();
    const none: TimelineBarDto[] = [];
    for (const bar of bars) {
      if (bar.assignees.length === 0) {
        none.push(bar);
        continue;
      }
      for (const a of bar.assignees) {
        const entry = byUser.get(a.userId) ?? { label: a.name, bars: [] };
        entry.bars.push(bar);
        byUser.set(a.userId, entry);
      }
    }
    const rows: TimelineRowDto[] = Array.from(byUser.entries())
      .sort((a, b) => a[1].label.localeCompare(b[1].label, "th"))
      .map(([userId, v]) => ({ key: userId, label: v.label, bars: v.bars }));
    rows.push({ key: NONE_KEY, label: NONE_ASSIGNEE_LABEL, bars: none });
    return rows;
  }

  // group === "label"
  const byLabel = new Map<string, { label: string; bars: TimelineBarDto[] }>();
  const none: TimelineBarDto[] = [];
  for (const bar of bars) {
    const labels = labelsOfCard.get(bar.cardId) ?? [];
    if (labels.length === 0) {
      none.push(bar);
      continue;
    }
    for (const l of labels) {
      const entry = byLabel.get(l.id) ?? { label: l.name, bars: [] };
      entry.bars.push(bar);
      byLabel.set(l.id, entry);
    }
  }
  const rows: TimelineRowDto[] = Array.from(byLabel.entries())
    .sort((a, b) => a[1].label.localeCompare(b[1].label, "th"))
    .map(([id, v]) => ({ key: id, label: v.label, bars: v.bars }));
  rows.push({ key: NONE_KEY, label: NONE_LABEL_LABEL, bars: none });
  return rows;
}

export type SetCardRangeResult = { ok: true; startAt: string | null; dueAt: string };

/**
 * ลากขอบซ้าย/ขวาของแถบ — เปลี่ยน `startAt`/`dueAt` ตรง ๆ ผ่าน `updateCardFields` เดิม (K1.6) ทั้งหมด
 * (activity `CARD_DUE_SET` · `reminderSentAt` reset เมื่อ `dueAt` เปลี่ยน · แจ้งเตือน/realtime เหมือนแก้
 * จากหลังการ์ด) — `updateCardFields` เป็นคนตรวจ `startAt > dueAt` เองอยู่แล้ว (throw ข้อความไทย)
 */
export async function setCardRange(
  ctx: KanbanCtx,
  cardId: string,
  input: { startAt: Date | null; dueAt: Date },
): Promise<SetCardRangeResult> {
  const updated = await updateCardFields(ctx, cardId, { startAt: input.startAt, dueAt: input.dueAt });
  return {
    ok: true,
    startAt: updated.startAt ? updated.startAt.toISOString() : null,
    dueAt: updated.dueAt!.toISOString(),
  };
}

export type ShiftCardRangeResult = { ok: true; startAt: string | null; dueAt: string };

/**
 * ลากตัวแถบ (ไม่ใช่ขอบ) — เลื่อนทั้ง `startAt`(ถ้ามี) และ `dueAt` ไปพร้อมกันเป็นจำนวนวันเท่ากัน
 * คงเวลาของวันเดิมไว้ (แค่ขยับ "วัน" ไม่แตะชั่วโมง:นาที) — ผ่าน `updateCardFields` เดิมเหมือน `setCardRange`
 */
export async function shiftCardRange(ctx: KanbanCtx, cardId: string, input: { days: number }): Promise<ShiftCardRangeResult> {
  await assertCardRole(ctx, cardId, "EDITOR");
  const before = await prisma.kanbanCard.findFirst({
    where: { id: cardId, tenantId: ctx.tenantId, systemId: ctx.systemId },
    select: { startAt: true, dueAt: true },
  });
  if (!before || !before.dueAt) throw new KanbanNotFoundError("ไม่พบการ์ดนี้");
  const deltaMs = Math.round(input.days) * DAY_MS;
  const nextDueAt = new Date(before.dueAt.getTime() + deltaMs);
  const nextStartAt = before.startAt ? new Date(before.startAt.getTime() + deltaMs) : null;
  const updated = await updateCardFields(ctx, cardId, { startAt: nextStartAt, dueAt: nextDueAt });
  return {
    ok: true,
    startAt: updated.startAt ? updated.startAt.toISOString() : null,
    dueAt: updated.dueAt!.toISOString(),
  };
}
