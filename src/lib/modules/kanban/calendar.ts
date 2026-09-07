// calendar.ts — มุมมองปฏิทิน `?view=calendar` (K2.2 · พิมพ์เขียว 13-kanban-v2 §3.5 · สัญญา ledger/KANBAN-RUN.md §K2.2)
//
// อ่านอย่างเดียว (VIEWER+): จัดการ์ด active ของบอร์ดตามวันกำหนดส่ง (เวลาไทย) + ถาด "ยังไม่กำหนดวัน"
// (การ์ด active ที่ไม่มี dueAt ผ่าน filters เดียวกับที่อยู่ในวัน) · ผสมงานอ่านอย่างเดียวจากปฏิทินกลางของ
// ร้าน (`src/lib/modules/calendar/service.ts` — ใบลา/นัดหมาย/เข้าพัก) เมื่อ `includeExternal:true`
// เขียนได้ 1 อย่าง: `setCardDueFromCalendar` (ลากการ์ดจากถาด/ระหว่างวัน) — ผ่าน `updateCardFields` เดิม
// (K1.6) ทั้งหมด ไม่เขียน query ใหม่ ⇒ activity/แจ้งเตือน/realtime ได้ครบเหมือนแก้จากหลังการ์ด
//
// 🔴 ทำไมไม่เรียก `service.getBoardFor`: เหตุผลเดียวกับ `table.ts` (K2.1) — `service.ts` re-export
//    ฟังก์ชันของไฟล์นี้ออกไปด้วย ถ้า import กลับเข้า service.ts จะเกิด import วน
// 🔴 `kanban→calendar` เป็นเส้นข้ามโมดูลที่ Fable อนุมัติแล้ว (ledger/KANBAN-RUN.md §K3.2 ท้ายกล่อง
//    "เส้น import ข้ามโมดูลที่ Fable อนุมัติ" · ลงทะเบียนใน `scripts/fitness.mts` ALLOWED_EDGES)
import { prisma } from "./db";
import { assertBoardRole, assertCardRole } from "./members";
import { updateCardFields } from "./cards";
// เส้นข้ามโมดูล kanban→calendar — Fable อนุมัติแล้ว (KANBAN-RUN.md §K3.2 ท้ายกล่อง "เส้น import
// ข้ามโมดูลที่ Fable อนุมัติ") · ลงทะเบียนใน scripts/fitness.mts ALLOWED_EDGES พร้อมคอมเมนต์อ้าง K2.2
// อ่านอย่างเดียว (getCalendarEvents ไม่มี write path) · ไฟล์นี้แตะ `./db` อยู่แล้วจึงไม่เคยเข้าบันเดิลฝั่ง
// client (ไม่ต้องกังวลเรื่อง Turbopack ลาก `pg` เข้า browser เหมือน `filters.ts` บอกไว้)
import { getCalendarEvents } from "@/lib/modules/calendar/service";
import {
  BKK_OFFSET_MS,
  bkkDayStartMs,
  dayIndexOf,
  filterBoardCards,
  type BoardFilters,
  type FilterableCard,
} from "./filters";
import type {
  BoardCalendarDto,
  CalCardDto,
  CalDayDto,
  CalExternalDto,
  KanbanActor,
  KanbanCtx,
  KanbanTagColor,
} from "./types";
// re-export ให้ผู้เรียกนอกโมดูล (service.ts/page.tsx) ใช้ชื่อเดิมได้จากที่นี่เหมือนเดิม
export type { BoardCalendarDto, CalCardDto, CalDayDto, CalExternalDto } from "./types";

const DAY_MS = 86_400_000;

/** "YYYY-MM-DD" ตามวันที่ไทยของเวลา `ms` — คีย์ของ `BoardCalendarDto.days` */
function bkkDayKey(ms: number): string {
  const d = new Date(ms + BKK_OFFSET_MS);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** คีย์วันจาก "เลขวันไทยนับจาก epoch" (`dayIndexOf`) — กลับเป็น "YYYY-MM-DD" */
function dayKeyFromIndex(dayIndex: number): string {
  return bkkDayKey(bkkDayStartMs(dayIndex));
}

/** แถวการ์ดดิบ + ผู้รับผิดชอบครบ (ต้องรู้ก่อนกรอง — เหมือน `RawTableCard` ของ K2.1) */
type RawCalCard = FilterableCard & {
  cardNo: number | null;
  columnId: string;
  dueAt: Date | null;
  completedAt: Date | null;
};

export type ListBoardCalendarInput = {
  /** ช่วงที่ต้องการ (ครึ่งเปิด `[from, to)`) — หน้าบอร์ด (K2.2) ส่ง "เดือนที่เลือก ±6 วัน" */
  from: Date;
  to: Date;
  /** เวลาอ้างอิง (จาก server เดียวกับที่ใช้เรนเดอร์ทั้งหน้า) — ใช้คิด `isOverdue`/`filters.due` */
  now: Date;
  filters?: BoardFilters;
  /** true = ผสมงานอ่านอย่างเดียวจากปฏิทินกลางของร้าน (ใบลา/นัดหมาย/เข้าพัก) */
  includeExternal?: boolean;
};

/**
 * มุมมองปฏิทินของบอร์ดหนึ่งใบ — VIEWER ขึ้นไป (มองไม่เห็นบอร์ด = ไม่พบ ตาม §6.3)
 * `actor` ใช้แค่กรอง `filters.assignee === "me"` (แพตเทิร์นเดียวกับ `listBoardTable`)
 */
export async function listBoardCalendar(
  ctx: KanbanCtx,
  actor: KanbanActor,
  boardId: string,
  opts: ListBoardCalendarInput,
): Promise<BoardCalendarDto> {
  await assertBoardRole(ctx, boardId, "VIEWER");

  const columns = await prisma.kanbanColumn.findMany({
    where: { boardId, tenantId: ctx.tenantId, systemId: ctx.systemId, status: "ACTIVE" },
    select: { id: true, name: true },
  });
  const columnName = new Map(columns.map((c) => [c.id, c.name]));

  const cards = await prisma.kanbanCard.findMany({
    where: { boardId, tenantId: ctx.tenantId, systemId: ctx.systemId, status: "ACTIVE" },
    // ลำดับเสถียร (เหมือน `listBoardTable` K2.1) — ถาด "ยังไม่กำหนดวัน" ไม่กระโดดสลับที่ทุกครั้งที่โหลด
    orderBy: [{ position: { sort: "asc", nulls: "first" } }, { sortOrder: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      cardNo: true,
      title: true,
      description: true,
      columnId: true,
      dueAt: true,
      completedAt: true,
      assigneeUserId: true,
      labels: true,
    },
  });

  // ผู้รับผิดชอบทุกคน (ไม่ใช่แค่คนแรก) ก่อนกรอง — เหตุผลเดียวกับ `listBoardTable` (K2.1)
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

  const withAssignees: RawCalCard[] = cards.map((c) => ({
    ...c,
    assignees: (assigneeIdsOfCard.get(c.id) ?? []).map((userId) => ({ userId })),
  }));

  const filters = opts.filters ?? {};
  const matched = filterBoardCards<RawCalCard>(withAssignees, filters, { now: opts.now, userId: actor.userId });

  const fromMs = opts.from.getTime();
  const toMs = opts.to.getTime();
  const inWindow = matched.filter((c) => c.dueAt && c.dueAt.getTime() >= fromMs && c.dueAt.getTime() < toMs);
  const unscheduledRaw = matched.filter((c) => !c.dueAt);
  const shownIds = [...inWindow, ...unscheduledRaw].map((c) => c.id);

  const [labelRows, users] = await Promise.all([
    shownIds.length
      ? prisma.kanbanCardLabel.findMany({
          where: { cardId: { in: shownIds }, tenantId: ctx.tenantId },
          include: { label: { select: { name: true, color: true } } },
        })
      : Promise.resolve([]),
    (() => {
      const assigneeUserIds = Array.from(new Set(shownIds.flatMap((id) => assigneeIdsOfCard.get(id) ?? [])));
      return assigneeUserIds.length
        ? prisma.user.findMany({ where: { id: { in: assigneeUserIds } }, select: { id: true, name: true, email: true } })
        : Promise.resolve([]);
    })(),
  ]);
  const labelsOfCard = new Map<string, { name: string; color: KanbanTagColor }[]>();
  for (const row of labelRows) {
    const list = labelsOfCard.get(row.cardId) ?? [];
    list.push({ name: row.label.name, color: row.label.color as KanbanTagColor });
    labelsOfCard.set(row.cardId, list);
  }
  const nameOf = new Map(users.map((u) => [u.id, u.name ?? u.email ?? u.id]));

  const nowMs = opts.now.getTime();
  const toDto = (c: RawCalCard): CalCardDto => ({
    id: c.id,
    cardNo: c.cardNo,
    title: c.title,
    dueAt: c.dueAt ? c.dueAt.toISOString() : null,
    columnName: columnName.get(c.columnId) ?? "",
    labels: labelsOfCard.get(c.id) ?? [],
    assignees: (assigneeIdsOfCard.get(c.id) ?? []).map((userId) => ({ userId, name: nameOf.get(userId) ?? userId })),
    isOverdue: !!c.dueAt && c.dueAt.getTime() < nowMs && !c.completedAt,
    isDone: !!c.completedAt,
  });

  const days: Record<string, CalDayDto> = {};
  const dayOf = (key: string): CalDayDto => days[key] ?? (days[key] = { cards: [], external: [] });
  for (const c of inWindow) dayOf(bkkDayKey(c.dueAt!.getTime())).cards.push(toDto(c));

  if (opts.includeExternal) {
    // membership ของ `getCalendarEvents` (ปฏิทินกลาง `src/lib/modules/calendar`) มีรูปเดียวกับ
    // `KanbanActor` ทุกฟิลด์ (role/unitAccess/permissions) — ประกอบ literal ใหม่กันไม่ให้ `apiRole`
    // ของ K1.15/D18 หลุดเข้าไปเป็นฟิลด์แปลกปลอม
    const membership = { role: actor.role, unitAccess: actor.unitAccess, permissions: actor.permissions };
    const events = await getCalendarEvents({ tenantId: ctx.tenantId, membership }, { from: opts.from, to: opts.to });
    for (const ev of events) {
      const startMs = Math.max(ev.startAt.getTime(), fromMs);
      const endMs = Math.max(Math.min(ev.endAt.getTime(), toMs), startMs + 1);
      const startDay = dayIndexOf(startMs);
      const endDay = dayIndexOf(endMs - 1);
      for (let d = startDay; d <= endDay; d++) {
        const key = dayKeyFromIndex(d);
        const dto: CalExternalDto = {
          id: ev.id,
          kind: ev.kind,
          title: ev.title,
          startAt: ev.startAt.toISOString(),
          endAt: ev.endAt.toISOString(),
          href: `/app/calendar?d=${key}`,
        };
        dayOf(key).external.push(dto);
      }
    }
  }

  return {
    range: { from: opts.from.toISOString(), to: opts.to.toISOString() },
    days,
    unscheduled: unscheduledRaw.map(toDto),
  };
}

export type SetCardDueFromCalendarResult = { ok: true; dueAt: string };

/**
 * ตั้ง/เปลี่ยนกำหนดส่งจากปฏิทิน (ลากการ์ด) — ผ่าน `updateCardFields` เดิมทั้งหมด (activity `CARD_DUE_SET` ·
 * แจ้งเตือน/realtime เหมือนแก้ในหลังการ์ด)
 * - จากถาด (ยังไม่มี dueAt) หรือ `keepTime` ไม่ได้ขอ → ใช้เวลาของ `date` ตรง ๆ (หน้าจอเป็นคนคำนวณ
 *   "18:00 ไทยของวันนั้น" ตามสัญญา K2.2 ก่อนเรียกมา — เหมือนที่ oracle ทำ)
 * - `keepTime: true` (ลากระหว่างวันในปฏิทิน) → เปลี่ยนเฉพาะ "วัน" (ตามวันที่ไทยของ `date`) เวลาของเดิมคงไว้
 *   เสมอ ไม่ว่าฝั่งจอจะส่งเวลาอะไรมาใน `date` ก็ตาม (กันพลาดกรณีจอไม่รู้เวลาที่แน่นอนของการ์ด)
 */
export async function setCardDueFromCalendar(
  ctx: KanbanCtx,
  cardId: string,
  date: Date,
  opts?: { keepTime?: boolean },
): Promise<SetCardDueFromCalendarResult> {
  await assertCardRole(ctx, cardId, "EDITOR");

  let dueAt = date;
  if (opts?.keepTime) {
    const before = await prisma.kanbanCard.findFirst({
      where: { id: cardId, tenantId: ctx.tenantId, systemId: ctx.systemId },
      select: { dueAt: true },
    });
    if (before?.dueAt) {
      const targetDayIndex = dayIndexOf(date.getTime());
      const msOfDay = ((before.dueAt.getTime() + BKK_OFFSET_MS) % DAY_MS + DAY_MS) % DAY_MS;
      dueAt = new Date(bkkDayStartMs(targetDayIndex) + msOfDay);
    }
  }

  const updated = await updateCardFields(ctx, cardId, { dueAt });
  return { ok: true, dueAt: updated.dueAt!.toISOString() };
}
