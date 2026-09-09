// mirror.ts — การ์ดสะท้อน (K3.7 · KANBAN-RUN §K3.7) — "แก้ที่ไหนก็เห็นเหมือนกัน"
//
// แนวคิด: การ์ด 1 ใบ (ต้นฉบับ) มี "ที่นั่ง" บนบอร์ดอื่นได้หลายใบ (ตัวสะท้อน) — ตัวสะท้อนเป็นแถว
// `KanbanCard` จริงของตัวเอง (มี id/boardId/columnId/cardNo ของบอร์ดปลายทาง) แต่ **ไม่มีเนื้อหาของตัวเอง**:
// description/dueAt/checklists/comments/attachments/customFields/labels/assignees ทั้งหมดอ่าน-เขียนที่
// ต้นฉบับเสมอ (`resolveMirror` คือประตูเดียวที่ทุก mutation เนื้อหาการ์ดเรียกก่อน)
//
// 🔴 ยกเว้น moves/archive/complete (D22): ทำที่แถวตัวเอง — ตัวสะท้อนคือ "ที่นั่ง" ของงานเดียวกันบนอีกบอร์ด
//    ปิดงานฝั่งหนึ่งไม่ปิดอีกฝั่ง (ดู moves.ts/cards.archiveCard/cards.restoreCard — ไฟล์นี้ไม่แตะ)
// 🔴 ไม่ทำ FK บน `mirrorOfId` (ดูคอมเมนต์ที่ schema) — ต้นฉบับถูกเก็บเข้าคลัง/ไม่มีวันถูกลบจริงในโมดูลนี้
//    แต่กันไว้ไม่ให้พังทั้งระบบถ้าวันหน้าแถวต้นฉบับหายไปจริง ๆ (resolveMirror คืนค่า sourceArchived:true)

import type { Prisma } from "@prisma/client";
import { emitOutbox } from "@/lib/core/outbox";
import { boardRole, hasBoardRole, KanbanNotFoundError, visibleBoardsWhere } from "./access";
import { logActivity } from "./activity-log";
import { prisma } from "./db";
import { KANBAN_LIMITS } from "./limits";
import { assertBoardRole, loadActor } from "./members";
import { keyBetween } from "./ordering";
import { publishBoardSignal, boardSignal } from "./realtime";
import type { KanbanCtx } from "./types";

export type MirrorCardInput = { cardId: string; toBoardId: string; toColumnId?: string | null };
export type MirrorCardResult = { mirrorId: string; boardId: string; boardName: string; cardNo: number | null };

/**
 * สะท้อนการ์ดไปบอร์ดปลายทาง — EDITOR ทั้งบอร์ดต้นทางและปลายทาง (§K3.7)
 * - ต้นฉบับต้องไม่ใช่ตัวสะท้อนอยู่แล้ว (ห้ามสะท้อนซ้อน)
 * - สะท้อนไปบอร์ดเดิม → throw
 * - มีตัวสะท้อนบนบอร์ดปลายทางอยู่แล้ว → คืน id เดิม (idempotent — ไม่สร้างซ้ำ)
 * - เพดาน `KANBAN_LIMITS.mirrorsPerCard` บอร์ดต่อการ์ด 1 ใบ (นับเฉพาะตัวสะท้อนที่ยัง ACTIVE)
 * - `toColumnId` ไม่ระบุ = คอลัมน์แรกของบอร์ดปลายทาง (เรียงแบบเดียวกับหน้าบอร์ด)
 */
export async function mirrorCard(ctx: KanbanCtx, input: MirrorCardInput): Promise<MirrorCardResult> {
  const card = await prisma.kanbanCard.findFirst({
    where: { id: input.cardId, tenantId: ctx.tenantId, systemId: ctx.systemId },
    select: { id: true, boardId: true, title: true, sourceType: true, mirrorOfId: true },
  });
  if (!card) throw new KanbanNotFoundError("ไม่พบการ์ดนี้");
  if (card.mirrorOfId) {
    throw new Error("การ์ดนี้เป็นตัวสะท้อนอยู่แล้ว — สะท้อนซ้อนไม่ได้ ไปสะท้อนจากต้นฉบับแทน");
  }
  if (input.toBoardId === card.boardId) {
    throw new Error("สะท้อนไปบอร์ดเดียวกับต้นฉบับไม่ได้");
  }

  // EDITOR ทั้ง 2 บอร์ด — มองไม่เห็น = 404 (§6.3) · เห็นแต่ไม่ถึง EDITOR = 403 · ตรวจต้นทางก่อนเสมอ
  await assertBoardRole(ctx, card.boardId, "EDITOR");
  const { board: toBoard } = await assertBoardRole(ctx, input.toBoardId, "EDITOR");

  // idempotent: มีตัวสะท้อนของการ์ดนี้บนบอร์ดปลายทางอยู่แล้ว (ไม่ว่าใบนั้นจะยัง ACTIVE หรือถูกเก็บไปแล้ว) → คืน id เดิม
  const existing = await prisma.kanbanCard.findFirst({
    where: { tenantId: ctx.tenantId, systemId: ctx.systemId, boardId: input.toBoardId, mirrorOfId: card.id },
    select: { id: true, boardId: true, cardNo: true },
  });
  if (existing) {
    return { mirrorId: existing.id, boardId: existing.boardId, boardName: toBoard.name, cardNo: existing.cardNo };
  }

  const mirrorCount = await prisma.kanbanCard.count({
    where: { tenantId: ctx.tenantId, systemId: ctx.systemId, mirrorOfId: card.id, status: "ACTIVE" },
  });
  if (mirrorCount >= KANBAN_LIMITS.mirrorsPerCard) {
    throw new Error(`สะท้อนการ์ดนี้ได้สูงสุด ${KANBAN_LIMITS.mirrorsPerCard} บอร์ด — ถอด (เก็บ) ตัวสะท้อนเก่าก่อนจึงเพิ่มใหม่ได้`);
  }

  const targetColumn = input.toColumnId
    ? await prisma.kanbanColumn.findFirst({
        where: { id: input.toColumnId, tenantId: ctx.tenantId, systemId: ctx.systemId, boardId: input.toBoardId, status: "ACTIVE" },
        select: { id: true },
      })
    : await prisma.kanbanColumn.findFirst({
        where: { boardId: input.toBoardId, tenantId: ctx.tenantId, systemId: ctx.systemId, status: "ACTIVE" },
        orderBy: [{ position: { sort: "asc", nulls: "first" } }, { sortOrder: "asc" }, { createdAt: "asc" }],
        select: { id: true },
      });
  if (!targetColumn) throw new Error("ไม่พบคอลัมน์ปลายทาง — บอร์ดนี้ต้องมีคอลัมน์ที่ใช้งานได้ก่อนจึงสะท้อนการ์ดมาได้");

  const last = await prisma.kanbanCard.findFirst({
    where: { columnId: targetColumn.id, tenantId: ctx.tenantId, systemId: ctx.systemId, status: "ACTIVE" },
    orderBy: [{ position: { sort: "desc", nulls: "last" } }, { sortOrder: "desc" }, { createdAt: "desc" }],
    select: { position: true },
  });
  const position = keyBetween(last?.position ?? null, null);

  const created = await prisma.$transaction(async (tx) => {
    // D14 — เลขการ์ดของบอร์ดปลายทาง (คนละลำดับกับบอร์ดต้นทาง)
    const seq = await tx.$queryRaw<{ cardNoSeq: number }[]>`
      UPDATE "KanbanBoard" SET "cardNoSeq" = "cardNoSeq" + 1 WHERE id = ${input.toBoardId} RETURNING "cardNoSeq"
    `;
    const row = await tx.kanbanCard.create({
      data: {
        tenantId: ctx.tenantId,
        systemId: ctx.systemId,
        boardId: input.toBoardId,
        columnId: targetColumn.id,
        // ก๊อปชื่อไว้ให้ค้นหา/ตารางของบอร์ดปลายทางไม่ต้อง join กลับต้นฉบับทุกครั้ง (sync ต่อเมื่อชื่อต้นฉบับเปลี่ยน — cards.ts)
        title: card.title,
        mirrorOfId: card.id,
        sourceType: card.sourceType,
        position,
        cardNo: seq[0]?.cardNoSeq ?? null,
        createdById: ctx.actorUserId ?? null,
      } satisfies Prisma.KanbanCardUncheckedCreateInput,
    });
    // K1.10 — CARD_CREATED ทั้ง 2 ใบ: ที่ตัวสะท้อน (data.mirrorOfId) และที่ต้นฉบับ (data.mirrorId)
    await logActivity(tx, {
      tenantId: ctx.tenantId,
      boardId: input.toBoardId,
      cardId: row.id,
      actorUserId: ctx.actorUserId ?? null,
      type: "CARD_CREATED",
      data: { title: row.title, columnId: targetColumn.id, mirrorOfId: card.id },
    });
    await logActivity(tx, {
      tenantId: ctx.tenantId,
      boardId: card.boardId,
      cardId: card.id,
      actorUserId: ctx.actorUserId ?? null,
      type: "CARD_CREATED",
      data: { mirrorId: row.id, mirrorBoardId: input.toBoardId },
    });
    await emitOutbox(tx, {
      tenantId: ctx.tenantId,
      systemId: ctx.systemId,
      type: "kanban.card.created",
      idempotencyKey: `kanban.card.created#${row.id}`,
      payload: { cardId: row.id, boardId: input.toBoardId, columnId: targetColumn.id, cardNo: row.cardNo, title: row.title, mirrorOfId: card.id },
    });
    return row;
  });

  await publishBoardSignal(ctx, input.toBoardId, boardSignal({ type: "card.updated", boardId: input.toBoardId, cardId: created.id }));
  await publishBoardSignal(ctx, card.boardId, boardSignal({ type: "card.updated", boardId: card.boardId, cardId: card.id }));

  return { mirrorId: created.id, boardId: input.toBoardId, boardName: toBoard.name, cardNo: created.cardNo };
}

/** บอร์ดอื่นที่ actor เป็น EDITOR ขึ้นไป (ตัวเลือกปลายทางของ `MirrorPicker.tsx`) — เรียงตามชื่อ */
export async function listMirrorBoards(ctx: KanbanCtx, excludeBoardId: string): Promise<{ id: string; name: string }[]> {
  const actor = await loadActor(ctx);
  if (!actor) return [];
  const boards = await prisma.kanbanBoard.findMany({
    where: { tenantId: ctx.tenantId, systemId: ctx.systemId, status: "ACTIVE", id: { not: excludeBoardId }, ...visibleBoardsWhere(actor) },
    select: { id: true, name: true, unitId: true, visibility: true },
    orderBy: { name: "asc" },
  });
  if (boards.length === 0) return [];
  const memberships = actor.apiRole
    ? []
    : await prisma.kanbanBoardMember.findMany({
        where: { boardId: { in: boards.map((b) => b.id) }, userId: actor.userId, tenantId: ctx.tenantId },
        select: { boardId: true, userId: true, role: true },
      });
  const membersByBoard = new Map<string, { userId: string; role: "VIEWER" | "EDITOR" | "ADMIN" }[]>();
  for (const m of memberships) {
    const list = membersByBoard.get(m.boardId) ?? [];
    list.push({ userId: m.userId, role: m.role });
    membersByBoard.set(m.boardId, list);
  }
  return boards
    .filter((b) => hasBoardRole(boardRole(actor, b, membersByBoard.get(b.id) ?? []), "EDITOR"))
    .map((b) => ({ id: b.id, name: b.name }));
}

/** คอลัมน์ ACTIVE ของบอร์ดปลายทางที่เลือกไว้ (ตรวจ EDITOR ซ้ำ — ไม่เชื่อ boardId ที่ client เลือกไว้ก่อนหน้า) */
export async function listMirrorColumns(ctx: KanbanCtx, boardId: string): Promise<{ id: string; name: string }[]> {
  await assertBoardRole(ctx, boardId, "EDITOR");
  return prisma.kanbanColumn.findMany({
    where: { boardId, tenantId: ctx.tenantId, systemId: ctx.systemId, status: "ACTIVE" },
    orderBy: [{ position: { sort: "asc", nulls: "first" } }, { sortOrder: "asc" }, { createdAt: "asc" }],
    select: { id: true, name: true },
  });
}

export type ResolvedMirror = {
  /** id ของแถวที่ต้อง อ่าน/เขียน เนื้อหาจริง — ต้นฉบับเอง หรือของตัวเองถ้าไม่ใช่ตัวสะท้อน */
  effectiveCardId: string;
  /** บอร์ดของ `effectiveCardId` (ใช้ทำ boardId ของ logActivity/emitOutbox/publishBoardSignal) */
  effectiveBoardId: string;
  isMirror: boolean;
  /** ต้นฉบับถูกเก็บเข้าคลังไหม (มีความหมายเมื่อ `isMirror` เท่านั้น) */
  sourceArchived: boolean;
};

/**
 * ประตูเดียวที่ทุก mutation "เนื้อหาการ์ด" (title/description/assignees/checklists/comments/
 * attachments/labels/fields) เรียกก่อนเสมอ — คืนตำแหน่งจริงที่ต้องอ่าน/เขียน
 * 🔴 ไม่ตรวจสิทธิ์ที่นี่ (ผู้เรียกต้องผ่าน `assertCardRole(ctx, cardId, …)` ของ id **ที่ส่งเข้ามา** ก่อนเสมอ —
 *    นั่นคือด่านที่อนุญาตให้คนที่มีสิทธิ์แค่บอร์ดปลายทางแก้ผ่านตัวสะท้อนได้โดยไม่ต้องมีสิทธิ์บอร์ดต้นทาง)
 */
export async function resolveMirror(ctx: KanbanCtx, cardId: string): Promise<ResolvedMirror> {
  const card = await prisma.kanbanCard.findFirst({
    where: { id: cardId, tenantId: ctx.tenantId, systemId: ctx.systemId },
    select: { id: true, boardId: true, mirrorOfId: true },
  });
  if (!card) throw new KanbanNotFoundError("ไม่พบการ์ดนี้");
  if (!card.mirrorOfId) {
    return { effectiveCardId: card.id, effectiveBoardId: card.boardId, isMirror: false, sourceArchived: false };
  }
  const source = await prisma.kanbanCard.findFirst({
    where: { id: card.mirrorOfId, tenantId: ctx.tenantId, systemId: ctx.systemId },
    select: { id: true, boardId: true, status: true },
  });
  if (!source) {
    // ไม่ควรเกิด (โมดูลนี้ไม่มีการลบการ์ดจริง มีแต่เก็บเข้าคลัง) — กันไว้ไม่ให้ทั้งระบบพัง ถือว่า "ต้นฉบับหาย = อ่านอย่างเดียว"
    return { effectiveCardId: card.id, effectiveBoardId: card.boardId, isMirror: true, sourceArchived: true };
  }
  return { effectiveCardId: source.id, effectiveBoardId: source.boardId, isMirror: true, sourceArchived: source.status === "ARCHIVED" };
}

/** ข้อความไทยมาตรฐานเมื่อพยายามแก้เนื้อหาผ่านตัวสะท้อนที่ต้นฉบับถูกเก็บเข้าคลังไปแล้ว */
export const MIRROR_SOURCE_ARCHIVED_TH = "ต้นฉบับถูกเก็บเข้าคลัง — แก้ไม่ได้";
