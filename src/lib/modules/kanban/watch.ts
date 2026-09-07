// watch.ts — "ติดตาม" การ์ด/คอลัมน์/บอร์ด (K2.11 · พิมพ์เขียว 13-kanban-v2 §7.4 · สัญญา ledger/KANBAN-RUN.md §K2.11)
//
// ติดตาม = ขอรับแจ้งเตือนของงานที่ตัวเองไม่ได้รับผิดชอบ (หัวหน้าเฝ้าคอลัมน์ "รอตรวจ" · เจ้าของร้าน
// เฝ้าบอร์ดสาขา) — เป็น **ของส่วนตัว**: ติดตามแล้วไม่มีใครเห็น ไม่เปลี่ยนสิทธิ์ ไม่เปลี่ยนสถานะงาน
//
// 🔴 สิทธิ์: ต้อง VIEWER+ ของบอร์ดที่เป้าหมายสังกัด (มองไม่เห็นบอร์ด = 404 ตาม §6.3 — ห้ามยืนยันว่ามีอยู่)
//    ⇒ ติดตามบอร์ดลับของสาขาอื่นไม่ได้ · ติดตามการ์ดในบอร์ดที่ไม่ได้ถูกเชิญไม่ได้
// 🔴 การ์ด 1 ใบมีผู้ติดตาม 3 ทาง (การ์ด/คอลัมน์ปัจจุบัน/บอร์ด) + ผู้รับผิดชอบ ⇒ `resolveWatchersForCard`
//    เป็นที่เดียวที่รวมทั้งหมด (notify.ts เรียกตัวนี้ตัวเดียว ไม่ประกอบเอง)
// 🔴 ผู้ติดตามที่ "มองบอร์ดไม่เห็นแล้ว" (ถูกถอดออกจากบอร์ด/บอร์ดเปลี่ยนเป็น PRIVATE) ถูกตัดออกตอนส่ง
//    — แถวติดตามยังอยู่ (เชิญกลับเข้ามาแล้วได้รับเหมือนเดิม) แต่ไม่ได้เนื้อหาระหว่างที่มองไม่เห็น
//    ยกเว้น **ผู้รับผิดชอบ**: คนที่ถูกมอบหมายงานได้แจ้งเตือนเสมอ (แบบเดียวกับ `notifyCardAssigned`
//    ที่แจ้งพนักงานทุกคนของร้านที่ถูกมอบหมาย ไม่ว่าจะเป็นสมาชิกบอร์ดหรือไม่ — งานของเขาคือของเขา)

import { boardRole, KanbanNotFoundError, toActor, visibleBoardsWhere } from "./access";
import { prisma } from "./db";
import { assertBoardRole, loadActor } from "./members";
import type { KanbanActor, KanbanCtx, MyWatchingCardDto } from "./types";

export type KanbanWatchTargetType = "CARD" | "COLUMN" | "BOARD";
export type WatchTarget = { targetType: KanbanWatchTargetType; targetId: string };

/** จำนวนสูงสุดของบล็อก "ที่ฉันติดตาม" ในหน้างานของฉัน — เป็นรายการเฝ้าดู ไม่ใช่รายงาน */
const MY_WATCHED_MAX = 100;

/**
 * เป้าหมาย → บอร์ดที่มันสังกัด (พร้อมด่านสิทธิ์ VIEWER+)
 * 🔴 หา boardId จากตัวเป้าหมายเองเสมอ ไม่เชื่อ boardId ที่ผู้เรียกส่งมา (แพตเทิร์นเดียวกับ `assertColumnRole`)
 */
async function requireTargetBoard(ctx: KanbanCtx, target: WatchTarget): Promise<string> {
  const scope = { tenantId: ctx.tenantId, systemId: ctx.systemId };
  let boardId: string | null = null;
  if (target.targetType === "CARD") {
    const card = await prisma.kanbanCard.findFirst({ where: { id: target.targetId, ...scope }, select: { boardId: true } });
    boardId = card?.boardId ?? null;
  } else if (target.targetType === "COLUMN") {
    const col = await prisma.kanbanColumn.findFirst({ where: { id: target.targetId, ...scope }, select: { boardId: true } });
    boardId = col?.boardId ?? null;
  } else {
    const board = await prisma.kanbanBoard.findFirst({ where: { id: target.targetId, ...scope }, select: { id: true } });
    boardId = board?.id ?? null;
  }
  if (!boardId) throw new KanbanNotFoundError("ไม่พบสิ่งที่จะติดตาม");
  await assertBoardRole(ctx, boardId, "VIEWER");
  return boardId;
}

/** ติดตาม (ซ้ำ = แถวเดิม ไม่ error) — VIEWER+ ของบอร์ดของเป้าหมาย */
export async function watch(ctx: KanbanCtx, actor: KanbanActor, target: WatchTarget): Promise<{ watching: true }> {
  await requireTargetBoard(ctx, target);
  await prisma.kanbanWatcher.upsert({
    where: {
      targetType_targetId_userId: { targetType: target.targetType, targetId: target.targetId, userId: actor.userId },
    },
    update: {},
    create: {
      tenantId: ctx.tenantId,
      systemId: ctx.systemId,
      targetType: target.targetType,
      targetId: target.targetId,
      userId: actor.userId,
    },
  });
  return { watching: true };
}

/** เลิกติดตาม (ซ้ำ = เงียบ) — hard delete (§11.6: ถอนความสนใจไม่ใช่ประวัติที่ต้องเก็บ) */
export async function unwatch(ctx: KanbanCtx, actor: KanbanActor, target: WatchTarget): Promise<{ watching: false }> {
  await requireTargetBoard(ctx, target);
  await prisma.kanbanWatcher.deleteMany({
    where: { tenantId: ctx.tenantId, targetType: target.targetType, targetId: target.targetId, userId: actor.userId },
  });
  return { watching: false };
}

/** ฉันติดตามเป้าหมายนี้อยู่ไหม (ปุ่ม 👁 บนหลังการ์ด/หัวบอร์ดใช้ตัดสินคำบนปุ่ม) */
export async function isWatching(ctx: KanbanCtx, actor: KanbanActor, target: WatchTarget): Promise<boolean> {
  await requireTargetBoard(ctx, target);
  const row = await prisma.kanbanWatcher.findFirst({
    where: { tenantId: ctx.tenantId, targetType: target.targetType, targetId: target.targetId, userId: actor.userId },
    select: { id: true },
  });
  return row !== null;
}

/** ผู้ติดตาม "ตรงตัว" ของเป้าหมายเดียว (ไม่รวมทางอ้อม) — ใช้โชว์จำนวนบนปุ่ม */
export async function listWatchers(ctx: KanbanCtx, target: WatchTarget): Promise<string[]> {
  const rows = await prisma.kanbanWatcher.findMany({
    where: { tenantId: ctx.tenantId, targetType: target.targetType, targetId: target.targetId },
    orderBy: { createdAt: "asc" },
    select: { userId: true },
  });
  return rows.map((r) => r.userId);
}

/**
 * ผู้รับแจ้งเตือนทั้งหมดของการ์ด 1 ใบ (§7.4)
 * = ผู้ติดตามการ์ด ∪ ผู้ติดตาม **คอลัมน์ปัจจุบัน** ∪ ผู้ติดตามบอร์ด ∪ ผู้รับผิดชอบ
 *
 * ผู้ติดตามที่มองบอร์ดไม่เห็นแล้วถูกตัดออก (ดูหัวไฟล์) — ผู้รับผิดชอบไม่ถูกตัด
 * ⚠️ ไม่ตัดตัว actor ออกที่นี่ (ผู้เรียกเป็นคนตัด — บางเส้นทาง เช่น cron ไม่มี actor)
 */
export async function resolveWatchersForCard(ctx: KanbanCtx, cardId: string): Promise<Set<string>> {
  const card = await prisma.kanbanCard.findFirst({
    where: { id: cardId, tenantId: ctx.tenantId, systemId: ctx.systemId },
    select: { id: true, boardId: true, columnId: true, assigneeUserId: true },
  });
  if (!card) return new Set();

  const [rows, assignees, board, members] = await Promise.all([
    prisma.kanbanWatcher.findMany({
      where: {
        tenantId: ctx.tenantId,
        OR: [
          { targetType: "CARD", targetId: card.id },
          { targetType: "COLUMN", targetId: card.columnId },
          { targetType: "BOARD", targetId: card.boardId },
        ],
      },
      select: { userId: true },
    }),
    prisma.kanbanCardAssignee.findMany({ where: { cardId: card.id, tenantId: ctx.tenantId }, select: { userId: true } }),
    prisma.kanbanBoard.findFirst({
      where: { id: card.boardId, tenantId: ctx.tenantId },
      select: { unitId: true, visibility: true },
    }),
    prisma.kanbanBoardMember.findMany({
      where: { boardId: card.boardId, tenantId: ctx.tenantId },
      select: { userId: true, role: true },
    }),
  ]);

  const out = new Set<string>();
  for (const a of assignees) out.add(a.userId);
  if (card.assigneeUserId) out.add(card.assigneeUserId);

  const watcherIds = [...new Set(rows.map((r) => r.userId))].filter((u) => !out.has(u));
  if (watcherIds.length > 0 && board) {
    // ด่าน "ยังมองเห็นบอร์ดอยู่ไหม" — คนที่สมัครติดตามไว้แล้วถูกถอดออกจากบอร์ด ไม่ควรได้เนื้อหาต่อ
    for (const userId of await visibleAmong(ctx.tenantId, board, members, watcherIds)) out.add(userId);
  }
  return out;
}

/** กรองรายชื่อให้เหลือเฉพาะคนที่ยัง "มองเห็นบอร์ดใบนี้" ตอนนี้ (คิวรี Membership ครั้งเดียว) */
async function visibleAmong(
  tenantId: string,
  board: { unitId: string | null; visibility: "PRIVATE" | "TENANT" },
  members: { userId: string; role: "VIEWER" | "EDITOR" | "ADMIN" }[],
  userIds: string[],
): Promise<string[]> {
  if (userIds.length === 0) return [];
  const memberships = await prisma.membership.findMany({
    where: { tenantId, userId: { in: userIds } },
    select: { userId: true, role: true, unitAccess: true, permissions: true },
  });
  return memberships.filter((m) => boardRole(toActor(m.userId, m), board, members) !== null).map((m) => m.userId);
}

/**
 * ผู้รับที่ "เปิดการ์ดใบนี้ได้จริง" ตอนนี้ — ด่านสุดท้ายก่อนส่งแจ้งเตือนของผู้ติดตาม (K2.11)
 *
 * 🔴 ทำไมต้องกรองอีกชั้นนอกเหนือจาก `resolveWatchersForCard`: ผู้รับผิดชอบถูกนับเข้ามาโดยไม่สนบทบาทบอร์ด
 *    (มอบหมายงานให้พนักงานคนไหนก็ได้ของร้าน — `setCardAssignees` ตรวจแค่ว่าเป็นพนักงานจริง) ⇒ อาจมีคนที่
 *    ถูกมอบหมายแต่ยังไม่ได้ถูกเชิญเข้าบอร์ด PRIVATE · ใบ "ได้รับมอบหมายงาน" ยังส่งถึงเขาเหมือนเดิม
 *    (มีคนเรียกเขาโดยตรง) แต่ **ข่าวคราวของบอร์ด** (ความเห็นใหม่/ย้ายคอลัมน์/เก็บเข้าคลัง) ต้องไม่หลุด —
 *    ทั้งเรื่องความเป็นส่วนตัวของบอร์ดลับ และเพราะลิงก์ในใบจะพาเขาไปหน้า 404 อยู่ดี
 */
export async function notifiableWatchersForCard(ctx: KanbanCtx, cardId: string): Promise<string[]> {
  const all = await resolveWatchersForCard(ctx, cardId);
  if (all.size === 0) return [];
  const card = await prisma.kanbanCard.findFirst({
    where: { id: cardId, tenantId: ctx.tenantId },
    select: { boardId: true },
  });
  if (!card) return [];
  const [board, members] = await Promise.all([
    prisma.kanbanBoard.findFirst({
      where: { id: card.boardId, tenantId: ctx.tenantId },
      select: { unitId: true, visibility: true },
    }),
    prisma.kanbanBoardMember.findMany({
      where: { boardId: card.boardId, tenantId: ctx.tenantId },
      select: { userId: true, role: true },
    }),
  ]);
  if (!board) return [];
  return visibleAmong(ctx.tenantId, board, members, [...all]);
}

/**
 * บล็อก "ที่ฉันติดตาม (ไม่ได้รับผิดชอบ)" ในหน้างานของฉัน (ภาพ 06 ฝั่งขวาล่าง)
 * = การ์ด ACTIVE ที่ฉันติดตาม (ตรง ๆ / ผ่านคอลัมน์ / ผ่านบอร์ด) บนบอร์ดที่ฉันมองเห็น
 *   และ **ไม่ได้** เป็นผู้รับผิดชอบ (ของที่ฉันรับผิดชอบอยู่ในกลุ่มด้านบนของหน้าอยู่แล้ว — ไม่ซ้ำสองที่)
 */
export async function myWatched(ctx: KanbanCtx, actor: KanbanActor): Promise<MyWatchingCardDto[]> {
  const rows = await prisma.kanbanWatcher.findMany({
    where: { tenantId: ctx.tenantId, systemId: ctx.systemId, userId: actor.userId },
    select: { targetType: true, targetId: true },
  });
  if (rows.length === 0) return [];
  const cardIds = rows.filter((r) => r.targetType === "CARD").map((r) => r.targetId);
  const columnIds = rows.filter((r) => r.targetType === "COLUMN").map((r) => r.targetId);
  const boardIds = rows.filter((r) => r.targetType === "BOARD").map((r) => r.targetId);

  const assigned = await prisma.kanbanCardAssignee.findMany({
    where: { tenantId: ctx.tenantId, userId: actor.userId },
    select: { cardId: true },
  });
  const assignedIds = new Set(assigned.map((a) => a.cardId));

  const cards = await prisma.kanbanCard.findMany({
    where: {
      tenantId: ctx.tenantId,
      systemId: ctx.systemId,
      status: "ACTIVE",
      OR: [
        ...(cardIds.length ? [{ id: { in: cardIds } }] : []),
        ...(columnIds.length ? [{ columnId: { in: columnIds } }] : []),
        ...(boardIds.length ? [{ boardId: { in: boardIds } }] : []),
      ],
      // บอร์ดที่มองไม่เห็นแล้ว = ไม่โผล่ (แถวติดตามยังอยู่ — ดูหัวไฟล์)
      board: { status: "ACTIVE", ...visibleBoardsWhere(actor) },
    },
    select: {
      id: true,
      cardNo: true,
      title: true,
      boardId: true,
      dueAt: true,
      assigneeUserId: true,
      board: { select: { name: true } },
      column: { select: { name: true } },
    },
    orderBy: [{ dueAt: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }],
    take: MY_WATCHED_MAX + 50,
  });

  return cards
    .filter((c) => !assignedIds.has(c.id) && c.assigneeUserId !== actor.userId)
    .slice(0, MY_WATCHED_MAX)
    .map((c) => ({
      id: c.id,
      cardNo: c.cardNo,
      title: c.title,
      boardId: c.boardId,
      boardName: c.board.name,
      columnName: c.column.name,
      dueAt: c.dueAt ? c.dueAt.toISOString() : null,
    }));
}

/**
 * ตัวช่วยของหน้าบอร์ด: "ฉันติดตามบอร์ดใบนี้ไหม + คอลัมน์ไหนบ้าง" ในคิวรีเดียว
 * (หน้าบอร์ดโหลดครั้งเดียวแล้วส่งลง `BoardHeader`/`Column` — ไม่ยิงต่อคอลัมน์)
 */
export async function boardWatchState(
  ctx: KanbanCtx,
  boardId: string,
  columnIds: string[],
): Promise<{ board: boolean; columnIds: string[] }> {
  const userId = ctx.actorUserId;
  if (!userId) return { board: false, columnIds: [] };
  const rows = await prisma.kanbanWatcher.findMany({
    where: {
      tenantId: ctx.tenantId,
      userId,
      OR: [
        { targetType: "BOARD", targetId: boardId },
        ...(columnIds.length ? [{ targetType: "COLUMN" as const, targetId: { in: columnIds } }] : []),
      ],
    },
    select: { targetType: true, targetId: true },
  });
  return {
    board: rows.some((r) => r.targetType === "BOARD"),
    columnIds: rows.filter((r) => r.targetType === "COLUMN").map((r) => r.targetId),
  };
}

/** จำนวนผู้ติดตามการ์ด + ฉันติดตามอยู่ไหม (หลังการ์ด K1.6 โหลดพร้อมรายละเอียดที่เหลือ) */
export async function cardWatchState(ctx: KanbanCtx, cardId: string): Promise<{ watching: boolean; count: number }> {
  const rows = await prisma.kanbanWatcher.findMany({
    where: { tenantId: ctx.tenantId, targetType: "CARD", targetId: cardId },
    select: { userId: true },
  });
  return { watching: !!ctx.actorUserId && rows.some((r) => r.userId === ctx.actorUserId), count: rows.length };
}

/** actor ของคนที่ล็อกอินอยู่ (ทางลัดให้ action ที่ต้องใช้ทั้ง ctx และ actor) — ไม่มี = 404 */
export async function requireActor(ctx: KanbanCtx): Promise<KanbanActor> {
  const actor = await loadActor(ctx);
  if (!actor) throw new KanbanNotFoundError();
  return actor;
}
