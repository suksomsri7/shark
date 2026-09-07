// my-tasks.ts — "งานของฉัน" ใหม่ + ปัดเสร็จ/เก็บบนมือถือ + undo 5 นาที (K1.13 · KANBAN-RUN §K1.13)
//
// 🔴 ไฟล์นี้แตะ prisma โดยตรง ⇒ **server-only** — ห้าม client component import จากที่นี่เด็ดขาด
//    (บทเรียนจาก K1.11/K1.12: Turbopack ลากทั้งไฟล์เข้าบันเดิลฝั่ง browser ถ้า client component
//    import ชื่อใดก็ได้จากไฟล์เดียวกัน) — DTO ทั้งหมดอยู่ใน `types.ts` (บริสุทธิ์) ให้ `MyTasks.tsx`
//    `import type` ตรง ๆ ได้โดยไม่ลาก `db.ts` → `pg` ไปด้วย
//
// ═══ myTasksOverview ═══
// รวมการ์ดที่ actor เป็นผู้รับผิดชอบ (assigneeUserId ∪ KanbanCardAssignee — เหมือน listMyCards เดิม)
// เฉพาะบอร์ดที่มองเห็น (`visibleBoardsWhere`) แล้วจัดกลุ่มตามกำหนดส่งด้วยสูตรเดียวกับตัวกรอง K1.11
// (`dueBucketOf` ของ `filters.ts`) — ปฏิทินไทย จันทร์–อาทิตย์ (Asia/Bangkok)
//
// ═══ ปัดเสร็จ/เก็บ + undo ═══
// `completeCard`/`archiveWithUndo` เรียกฟังก์ชัน service เดิมที่ตรวจสิทธิ์/เขียนกิจกรรมไว้แล้ว
// (`moveCard`/`archiveCard`) แล้วสร้างแถว `KanbanUndoToken` เก็บ "ข้อมูลย้อนกลับ" พอให้ `undo()`
// คืนสภาพเดิมได้เอง — รูปแบบเดียวกับ `AccountUndoToken`/`undo-stack.ts` ของบัญชี (one-shot · อายุ
// 5 นาที · ผูก tenant+system+**user เดียวกันเท่านั้น** ที่เลิกทำได้)

import { Prisma } from "@prisma/client";
import { KanbanForbiddenError, KanbanNotFoundError, visibleBoardsWhere } from "./access";
import { archiveCard, restoreCard } from "./cards";
import { listMyChecklistItems } from "./checklists";
import { prisma } from "./db";
import { BKK_OFFSET_MS, bkkDayStartMs, dayIndexOf, dueBucketOf } from "./filters";
import { assertCardRole } from "./members";
import { moveCard, type MoveCardFailCode } from "./moves";
import { myWatched } from "./watch";
import type { KanbanActor, KanbanCtx, KanbanTagColor, MyTaskCardDto, MyTasksOverviewDto } from "./types";

const UNDO_TTL_MS = 5 * 60 * 1000; // 5 นาที (เท่า AccountUndoToken) — toast บนจอโชว์แค่ 5 วิ แต่ token อยู่ได้นานกว่านั้น

// ───────────────────────── myTasksOverview ─────────────────────────

/** จันทร์–อาทิตย์ (เวลาไทย) ที่ครอบเวลา `nowMs` — คืนช่วง [start, end) เป็น ms ของ UTC สำหรับคิวรี/เทียบ */
function currentWeekRangeMs(nowMs: number): { startMs: number; endMs: number } {
  const nowDay = dayIndexOf(nowMs);
  const nowWeekday = new Date(nowMs + BKK_OFFSET_MS).getUTCDay(); // 0 = อาทิตย์
  const mondayOffset = (nowWeekday + 6) % 7;
  const weekStartDay = nowDay - mondayOffset;
  return { startMs: bkkDayStartMs(weekStartDay), endMs: bkkDayStartMs(weekStartDay + 7) };
}

/**
 * งานของฉันข้ามทุกบอร์ดที่ `actor` มองเห็น จัดกลุ่มตามกำหนดส่ง (ปฏิทินไทย) + รายการเช็คลิสต์ที่มอบหมายให้ฉัน
 * — เฉพาะการ์ด ACTIVE ที่ยังไม่เสร็จ (`completedAt === null`) เท่านั้นที่อยู่ในกลุ่ม `groups.*`
 *   (การ์ดที่เสร็จแล้วนับใน `counts.doneThisWeek` อย่างเดียว ไม่โผล่ในกลุ่มไหนเลย — ตามสัญญา §K1.13)
 * `watching` (K2.11) = การ์ดที่ฉัน "ติดตาม" แต่ไม่ได้รับผิดชอบ — บล็อกล่างขวาของภาพ 06
 */
export async function myTasksOverview(
  ctx: KanbanCtx,
  actor: KanbanActor,
  opts: { now: Date },
): Promise<MyTasksOverviewDto> {
  const nowMs = opts.now.getTime();

  const assigned = await prisma.kanbanCardAssignee.findMany({
    where: { tenantId: ctx.tenantId, userId: actor.userId },
    select: { cardId: true },
  });
  const assignedIds = assigned.map((a) => a.cardId);

  const cards = await prisma.kanbanCard.findMany({
    where: {
      tenantId: ctx.tenantId,
      systemId: ctx.systemId,
      status: "ACTIVE",
      OR: [{ assigneeUserId: actor.userId }, ...(assignedIds.length ? [{ id: { in: assignedIds } }] : [])],
      board: visibleBoardsWhere(actor),
    },
    include: {
      board: { select: { name: true } },
      column: { select: { name: true } },
      cardLabels: { include: { label: { select: { id: true, name: true, color: true } } } },
    },
    orderBy: [
      { dueAt: { sort: "asc", nulls: "last" } },
      { position: { sort: "asc", nulls: "first" } },
      { sortOrder: "asc" },
      { createdAt: "asc" },
    ],
    take: 300,
  });

  // K1.7: ตราความคืบหน้าเช็คลิสต์ — คิวรีเดียว (group by cardId) ไม่ใช่ต่อการ์ด (กัน N+1 แบบ getBoardView)
  const cardIds = cards.map((c) => c.id);
  const checklistRows = cardIds.length
    ? await prisma.$queryRaw<{ cardId: string; total: bigint; done: bigint }[]>`
        SELECT ch."cardId" as "cardId", COUNT(i.id) as total, COUNT(i.id) FILTER (WHERE i.done) as done
        FROM "KanbanChecklist" ch JOIN "KanbanChecklistItem" i ON i."checklistId" = ch.id
        WHERE ch."cardId" IN (${Prisma.join(cardIds)}) GROUP BY ch."cardId"
      `
    : [];
  const checklistOf = new Map(checklistRows.map((r) => [r.cardId, { done: Number(r.done), total: Number(r.total) }]));

  const toDto = (c: (typeof cards)[number]): MyTaskCardDto => {
    const checklistProgress = checklistOf.get(c.id);
    return {
      id: c.id,
      cardNo: c.cardNo,
      title: c.title,
      boardId: c.boardId,
      boardName: c.board.name,
      columnName: c.column.name,
      dueAt: c.dueAt ? c.dueAt.toISOString() : null,
      labels: c.cardLabels.map((cl) => ({ id: cl.label.id, name: cl.label.name, color: cl.label.color as KanbanTagColor })),
      ...(checklistProgress ? { checklistProgress } : {}),
    };
  };

  const groups: MyTasksOverviewDto["groups"] = { overdue: [], today: [], week: [], later: [], none: [] };
  const { startMs: weekStartMs, endMs: weekEndMs } = currentWeekRangeMs(nowMs);
  let doneThisWeek = 0;

  for (const c of cards) {
    if (c.completedAt) {
      const t = c.completedAt.getTime();
      if (t >= weekStartMs && t < weekEndMs) doneThisWeek++;
      continue; // เสร็จแล้ว — ไม่อยู่ในกลุ่มไหนเลย (สัญญา §K1.13)
    }
    const bucket = dueBucketOf({ id: c.id, title: c.title, dueAt: c.dueAt, completedAt: null }, nowMs);
    const dto = toDto(c);
    if (bucket === "overdue") groups.overdue.push(dto);
    else if (bucket === "today") groups.today.push(dto);
    else if (bucket === "week") groups.week.push(dto);
    else if (bucket === "none") groups.none.push(dto);
    else groups.later.push(dto); // null = มีกำหนดส่งแต่เลยสัปดาห์นี้ไปแล้ว
  }

  const [checklistItems, watching] = await Promise.all([
    listMyChecklistItems(ctx, actor.userId),
    // K2.11: ของที่ฉันเฝ้าดูอยู่ (ไม่ได้รับผิดชอบ) — ไม่ซ้ำกับกลุ่มด้านบนของหน้าเดียวกัน
    myWatched(ctx, actor),
  ]);

  return {
    counts: {
      overdue: groups.overdue.length,
      today: groups.today.length,
      week: groups.week.length,
      none: groups.none.length,
      doneThisWeek,
    },
    groups,
    checklistItems,
    watching,
  };
}

// ───────────────────────── ปัดขวา = เสร็จ / ปัดซ้าย = เก็บ + undo ─────────────────────────

export type CompleteCardResult =
  | { ok: true; fromColumnId: string; undoToken: string }
  | { ok: false; code: "NO_DONE_COLUMN" | MoveCardFailCode; message: string };

/**
 * ปัดขวา = "เสร็จ" — ย้ายการ์ดเข้าคอลัมน์ที่ตั้งธง `isDoneColumn` ของบอร์ดใบนั้น (คอลัมน์แรกถ้ามีหลายคอลัมน์
 * ที่ตั้งธงไว้) ผ่าน `moveCard` เดิม (ได้ WIP/กิจกรรม/เหตุการณ์/`completedAt` ครบชุดตามที่ K1.4 ทำไว้แล้ว —
 * ไม่เขียนตรรกะย้ายซ้ำที่นี่) แล้วสร้าง undo token ให้กด "เลิกทำ" ได้ภายใน 5 นาที
 * บอร์ดไม่มีคอลัมน์เสร็จเลย → `{ok:false, code:"NO_DONE_COLUMN"}` (ไม่ย้ายอะไรทั้งสิ้น)
 */
export async function completeCard(ctx: KanbanCtx, cardId: string): Promise<CompleteCardResult> {
  const { boardId } = await assertCardRole(ctx, cardId, "EDITOR");
  const actorUserId = ctx.actorUserId;
  if (!actorUserId) throw new KanbanForbiddenError("ต้องเข้าสู่ระบบก่อน");

  const doneColumn = await prisma.kanbanColumn.findFirst({
    where: { boardId, tenantId: ctx.tenantId, systemId: ctx.systemId, status: "ACTIVE", isDoneColumn: true },
    orderBy: [{ position: { sort: "asc", nulls: "first" } }, { sortOrder: "asc" }, { createdAt: "asc" }],
    select: { id: true },
  });
  if (!doneColumn) {
    return {
      ok: false,
      code: "NO_DONE_COLUMN",
      message: "บอร์ดนี้ยังไม่มีคอลัมน์ที่ตั้งเป็น 'เสร็จแล้ว' — ไปตั้งค่าคอลัมน์เสร็จก่อนจึงจะปัดเสร็จได้",
    };
  }

  const before = await prisma.kanbanCard.findFirst({
    where: { id: cardId, tenantId: ctx.tenantId, systemId: ctx.systemId },
    select: { columnId: true },
  });
  if (!before) throw new KanbanNotFoundError("ไม่พบการ์ดนี้");
  const fromColumnId = before.columnId;

  const moved = await moveCard(ctx, { cardId, toColumnId: doneColumn.id });
  if (!moved.ok) return { ok: false, code: moved.code, message: moved.message };

  const token = await prisma.kanbanUndoToken.create({
    data: {
      tenantId: ctx.tenantId,
      systemId: ctx.systemId,
      userId: actorUserId,
      kind: "card.complete",
      payload: { cardId, fromColumnId } satisfies Prisma.InputJsonValue,
      expiresAt: new Date(Date.now() + UNDO_TTL_MS),
    },
    select: { id: true },
  });

  return { ok: true, fromColumnId, undoToken: token.id };
}

export type ArchiveWithUndoResult = { ok: true; undoToken: string };

/** ปัดซ้าย = "เก็บ" — เรียก `archiveCard` เดิม (ตรวจสิทธิ์/เขียนกิจกรรมให้แล้ว) แล้วสร้าง undo token */
export async function archiveWithUndo(ctx: KanbanCtx, cardId: string): Promise<ArchiveWithUndoResult> {
  const actorUserId = ctx.actorUserId;
  if (!actorUserId) throw new KanbanForbiddenError("ต้องเข้าสู่ระบบก่อน");
  await assertCardRole(ctx, cardId, "EDITOR");
  await archiveCard(ctx, cardId);

  const token = await prisma.kanbanUndoToken.create({
    data: {
      tenantId: ctx.tenantId,
      systemId: ctx.systemId,
      userId: actorUserId,
      kind: "card.archive",
      payload: { cardId } satisfies Prisma.InputJsonValue,
      expiresAt: new Date(Date.now() + UNDO_TTL_MS),
    },
    select: { id: true },
  });

  return { ok: true, undoToken: token.id };
}

export type UndoResult = { ok: true } | { ok: false };

/**
 * เลิกทำ — one-shot: token ต้องยังไม่หมดอายุ ยังไม่ถูกใช้ และเป็นของ tenant+system+**user เดียวกัน**เท่านั้น
 * (คนอื่นแม้ในร้าน/ระบบเดียวกันก็เลิกทำแทนไม่ได้ — เหมือน `consumeUndoToken` ของบัญชี) · token ปลอม/ไม่พบ/
 * ใช้ไปแล้ว/หมดอายุ → `{ok:false}` เงียบ ๆ (ไม่ throw — ฝั่งจอโชว์แค่ว่าเลิกทำไม่ได้)
 */
export async function undo(ctx: KanbanCtx, token: string): Promise<UndoResult> {
  const actorUserId = ctx.actorUserId;
  if (!actorUserId) return { ok: false };

  const row = await prisma.kanbanUndoToken.findFirst({ where: { id: token } });
  if (!row) return { ok: false };
  if (row.tenantId !== ctx.tenantId || row.systemId !== ctx.systemId) return { ok: false };
  if (row.userId !== actorUserId) return { ok: false };
  if (row.usedAt) return { ok: false };
  if (row.expiresAt.getTime() < Date.now()) return { ok: false };

  // อะตอมมิก: claim ก่อนทำจริง กันกดเลิกทำพร้อมกัน 2 ครั้ง (เช่น 2 แท็บ) แย่งกันย้อนสภาพซ้ำ
  const claim = await prisma.kanbanUndoToken.updateMany({ where: { id: token, usedAt: null }, data: { usedAt: new Date() } });
  if (claim.count === 0) return { ok: false };

  const payload = row.payload as { cardId?: string; fromColumnId?: string };
  if (!payload.cardId) return { ok: false };

  try {
    if (row.kind === "card.complete" && payload.fromColumnId) {
      // ย้ายกลับคอลัมน์เดิม (ต่อท้าย) ผ่าน moveCard เดิม — ปลายทางไม่ใช่คอลัมน์เสร็จ ⇒ completedAt เป็น null ให้เอง
      await moveCard(ctx, { cardId: payload.cardId, toColumnId: payload.fromColumnId });
    } else if (row.kind === "card.archive") {
      await restoreCard(ctx, payload.cardId);
    } else {
      return { ok: false };
    }
  } catch {
    return { ok: false };
  }
  return { ok: true };
}
