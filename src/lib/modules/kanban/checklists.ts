// checklists.ts — เช็คลิสต์ในการ์ด (K1.7 · พิมพ์เขียว 13-kanban-v2 §3.3 · KANBAN-RUN §K1.7)
//
// หลายชุดต่อการ์ด (`KanbanChecklist`) · แต่ละชุดมีหลายรายการ (`KanbanChecklistItem`) — มอบหมาย/
// กำหนดวันได้รายรายการ (ต่างจากการ์ดที่มีผู้รับผิดชอบ/กำหนดส่งระดับใบเดียว)
//
// 🔴 ทุกฟังก์ชันเขียนผ่าน `assertCardRole(ctx, cardId, "EDITOR")` เสมอ — บอร์ดมองไม่เห็น = 404
//    (§6.3) เห็นแต่ต่ำกว่า EDITOR = 403 · ฟังก์ชันอ่านอย่างเดียว (`getCardChecklists`) ใช้ VIEWER
// 🔴 assignee ต้องเป็น Membership ที่ accepted ของร้านนี้เสมอ (แพตเทิร์นเดียวกับ `cards.ts`/`members.ts`)
// 🔴 ครบทุกข้อ (total > 0 ทุกใบ done) → outbox `kanban.checklist.completed`
//    idempotencyKey มีทั้ง checklistId + เวลา ⇒ "ครบใหม่" หลังติ๊กออกแล้วติ๊กกลับได้ event ใบใหม่เสมอ
//    (ตรวจ transition ไม่ใช่ทุกครั้งที่ toggle — ไม่งั้น toggle รายการอื่นตอนครบอยู่แล้วจะยิงซ้ำ)

import type { KanbanChecklist, KanbanChecklistItem, Prisma } from "@prisma/client";
import { emitOutbox } from "@/lib/core/outbox";
import { scheduleDrain } from "@/lib/outbox-consumers";
import { KanbanNotFoundError, visibleBoardsWhere } from "./access";
import { prisma } from "./db";
import { KANBAN_LIMITS } from "./limits";
import { assertCardRole, loadActor } from "./members";
import { keyBetween } from "./ordering";
import type { KanbanChecklistDto, KanbanChecklistItemDto, KanbanCtx, MyChecklistItemDto } from "./types";

// ───────────────────────── ตัวช่วยภายใน ─────────────────────────

/** เช็คลิสต์ต้องอยู่ในร้านของ ctx และการ์ดต้นทางต้องอยู่ใน systemId เดียวกัน (defense-in-depth) */
async function requireChecklist(ctx: KanbanCtx, checklistId: string): Promise<{ id: string; cardId: string }> {
  const checklist = await prisma.kanbanChecklist.findFirst({
    where: { id: checklistId, tenantId: ctx.tenantId, card: { systemId: ctx.systemId } },
    select: { id: true, cardId: true },
  });
  if (!checklist) throw new KanbanNotFoundError("ไม่พบเช็คลิสต์นี้");
  return checklist;
}

async function requireItem(ctx: KanbanCtx, itemId: string): Promise<{ id: string; checklistId: string; cardId: string }> {
  const item = await prisma.kanbanChecklistItem.findFirst({
    where: { id: itemId, tenantId: ctx.tenantId, checklist: { card: { systemId: ctx.systemId } } },
    select: { id: true, checklistId: true, checklist: { select: { cardId: true } } },
  });
  if (!item) throw new KanbanNotFoundError("ไม่พบรายการเช็คลิสต์นี้");
  return { id: item.id, checklistId: item.checklistId, cardId: item.checklist.cardId };
}

/** ผู้รับมอบหมายรายการต้องเป็นพนักงานของร้านนี้ (Membership accepted) — เหมือน `cards.ts#assertMembers` */
async function assertAssigneeIsMember(tenantId: string, userId: string | null | undefined): Promise<void> {
  if (!userId) return;
  const m = await prisma.membership.findFirst({
    where: { tenantId, userId, acceptedAt: { not: null } },
    select: { userId: true },
  });
  if (!m) throw new Error("มอบหมายได้เฉพาะพนักงานในร้านนี้ — คนนี้ไม่ใช่สมาชิกของร้าน");
}

function normalizeTitle(title: string, fallback: string): string {
  const value = title.trim();
  return value || fallback;
}

function toItemDto(item: KanbanChecklistItem): KanbanChecklistItemDto {
  return {
    id: item.id,
    text: item.text,
    done: item.done,
    position: item.position,
    assigneeUserId: item.assigneeUserId,
    dueAt: item.dueAt ? item.dueAt.toISOString() : null,
    doneAt: item.doneAt ? item.doneAt.toISOString() : null,
    doneById: item.doneById,
  };
}

// ───────────────────────── เช็คลิสต์ (ชุด) ─────────────────────────

/** สร้างเช็คลิสต์ชุดใหม่ต่อท้ายการ์ด (ชื่อว่าง → ตกไปใช้ "ขั้นตอนงาน") */
export async function createChecklist(ctx: KanbanCtx, cardId: string, title: string): Promise<KanbanChecklist> {
  await assertCardRole(ctx, cardId, "EDITOR");
  const value = normalizeTitle(title, "ขั้นตอนงาน");
  const last = await prisma.kanbanChecklist.findFirst({
    where: { cardId },
    orderBy: { position: "desc" },
    select: { position: true },
  });
  const position = keyBetween(last?.position ?? null, null);
  return prisma.kanbanChecklist.create({
    data: { tenantId: ctx.tenantId, cardId, title: value, position },
  });
}

export async function renameChecklist(ctx: KanbanCtx, id: string, title: string): Promise<KanbanChecklist> {
  const checklist = await requireChecklist(ctx, id);
  await assertCardRole(ctx, checklist.cardId, "EDITOR");
  const value = title.trim();
  if (!value) throw new Error("ต้องตั้งชื่อเช็คลิสต์ก่อนจึงบันทึกได้");
  return prisma.kanbanChecklist.update({ where: { id: checklist.id }, data: { title: value } });
}

/** ลบทั้งชุด — รายการข้างในหายไปด้วย (cascade ในสคีมา) */
export async function deleteChecklist(ctx: KanbanCtx, id: string): Promise<void> {
  const checklist = await requireChecklist(ctx, id);
  await assertCardRole(ctx, checklist.cardId, "EDITOR");
  await prisma.kanbanChecklist.delete({ where: { id: checklist.id } });
}

// ───────────────────────── รายการ ─────────────────────────

export type AddChecklistItemInput = { assigneeUserId?: string | null; dueAt?: Date | null };

/** เพิ่มรายการต่อท้ายชุด — ≤ `KANBAN_LIMITS.checklistItemsPerCard` รวมทุกชุดของการ์ดเดียวกัน */
export async function addItem(
  ctx: KanbanCtx,
  checklistId: string,
  text: string,
  opts: AddChecklistItemInput = {},
): Promise<KanbanChecklistItem> {
  const checklist = await requireChecklist(ctx, checklistId);
  await assertCardRole(ctx, checklist.cardId, "EDITOR");
  const value = text.trim();
  if (!value) throw new Error("ต้องพิมพ์ข้อความรายการก่อนจึงเพิ่มได้");
  if (opts.assigneeUserId) await assertAssigneeIsMember(ctx.tenantId, opts.assigneeUserId);

  const total = await prisma.kanbanChecklistItem.count({ where: { checklist: { cardId: checklist.cardId } } });
  if (total >= KANBAN_LIMITS.checklistItemsPerCard) {
    throw new Error(`เช็คลิสต์ในการ์ดนี้เต็ม ${KANBAN_LIMITS.checklistItemsPerCard} รายการแล้ว — ลบรายการที่ไม่ได้ใช้ก่อน`);
  }

  const last = await prisma.kanbanChecklistItem.findFirst({
    where: { checklistId },
    orderBy: { position: "desc" },
    select: { position: true },
  });
  const position = keyBetween(last?.position ?? null, null);

  return prisma.kanbanChecklistItem.create({
    data: {
      tenantId: ctx.tenantId,
      checklistId,
      text: value,
      position,
      assigneeUserId: opts.assigneeUserId ?? null,
      dueAt: opts.dueAt ?? null,
    },
  });
}

export type EditChecklistItemInput = { text?: string; assigneeUserId?: string | null; dueAt?: Date | null };

/** แก้ข้อความ/ผู้รับมอบหมาย/กำหนดวันของรายการ (ทุกฟิลด์ optional เขียนเฉพาะที่ส่งมา) */
export async function editItem(ctx: KanbanCtx, itemId: string, patch: EditChecklistItemInput): Promise<KanbanChecklistItem> {
  const item = await requireItem(ctx, itemId);
  await assertCardRole(ctx, item.cardId, "EDITOR");

  const data: Prisma.KanbanChecklistItemUpdateInput = {};
  if (patch.text !== undefined) {
    const value = patch.text.trim();
    if (!value) throw new Error("ต้องพิมพ์ข้อความรายการก่อนจึงบันทึกได้");
    data.text = value;
  }
  if (patch.assigneeUserId !== undefined) {
    if (patch.assigneeUserId) await assertAssigneeIsMember(ctx.tenantId, patch.assigneeUserId);
    data.assigneeUserId = patch.assigneeUserId;
  }
  if (patch.dueAt !== undefined) data.dueAt = patch.dueAt;

  if (Object.keys(data).length === 0) {
    return prisma.kanbanChecklistItem.findUniqueOrThrow({ where: { id: item.id } });
  }
  return prisma.kanbanChecklistItem.update({ where: { id: item.id }, data });
}

export async function deleteItem(ctx: KanbanCtx, itemId: string): Promise<void> {
  const item = await requireItem(ctx, itemId);
  await assertCardRole(ctx, item.cardId, "EDITOR");
  await prisma.kanbanChecklistItem.delete({ where: { id: item.id } });
}

/**
 * ติ๊ก/ปลดรายการ — done=true ตั้ง `doneAt`/`doneById` · false ล้างทั้งคู่
 * ครบทุกข้อของชุดนี้เป็นครั้งแรก (transition ไม่ครบ → ครบ) → ยิง outbox `kanban.checklist.completed`
 * คีย์กันซ้ำมีเวลาด้วย ⇒ ครบใหม่ในรอบถัดไปได้ event ใบใหม่เสมอ (ไม่ใช่แค่ครั้งแรกในชีวิตของชุดนี้)
 */
export async function toggleItem(ctx: KanbanCtx, itemId: string, done: boolean): Promise<KanbanChecklistItem> {
  const item = await requireItem(ctx, itemId);
  await assertCardRole(ctx, item.cardId, "EDITOR");

  const updated = await prisma.$transaction(async (tx) => {
    // 🔴 ล็อกแถวเช็คลิสต์ก่อนนับ — สองคนติ๊ก 2 รายการสุดท้ายพร้อมกัน ต่างคนต่างเห็น "ยังไม่ครบ" แล้ว event ครบหาย
    // (Fable ตรวจ K1.7 · บทเรียนเดียวกับ reference_atomic_counter_single_statement)
    await tx.$executeRaw`SELECT id FROM "KanbanChecklist" WHERE id = ${item.checklistId} FOR UPDATE`;
    const siblings = await tx.kanbanChecklistItem.findMany({
      where: { checklistId: item.checklistId },
      select: { id: true, done: true },
    });
    const total = siblings.length;
    const doneCountBefore = siblings.filter((s) => s.done).length;
    const wasDone = siblings.find((s) => s.id === item.id)?.done ?? false;
    const preComplete = total > 0 && doneCountBefore === total;

    const row = await tx.kanbanChecklistItem.update({
      where: { id: item.id },
      data: done
        ? { done: true, doneAt: new Date(), doneById: ctx.actorUserId ?? null }
        : { done: false, doneAt: null, doneById: null },
    });

    const doneCountAfter = doneCountBefore - (wasDone ? 1 : 0) + (done ? 1 : 0);
    const postComplete = total > 0 && doneCountAfter === total;

    if (!preComplete && postComplete) {
      await emitOutbox(tx, {
        tenantId: ctx.tenantId,
        type: "kanban.checklist.completed",
        // 🔴 ต้องมี checklistId + เวลาเสมอ (ห้ามใช้แค่ checklistId เฉย ๆ — ครบใหม่ต้องได้ event ใบใหม่)
        idempotencyKey: `kanban.checklist.completed#${item.checklistId}#${Date.now()}#${Math.random().toString(36).slice(2, 8)}`,
        payload: { checklistId: item.checklistId, cardId: item.cardId },
        systemId: ctx.systemId,
      });
    }
    return row;
  });

  scheduleDrain();
  return updated;
}

/** ย้ายรายการในชุดเดียวกัน (fractional index) — ไม่ระบุ before/after = ไปท้ายสุด */
export async function moveItem(
  ctx: KanbanCtx,
  itemId: string,
  opts: { beforeItemId?: string; afterItemId?: string },
): Promise<KanbanChecklistItem> {
  const item = await requireItem(ctx, itemId);
  await assertCardRole(ctx, item.cardId, "EDITOR");

  const siblings = await prisma.kanbanChecklistItem.findMany({
    where: { checklistId: item.checklistId },
    orderBy: { position: "asc" },
    select: { id: true, position: true },
  });
  const others = siblings.filter((s) => s.id !== itemId);

  let position: string;
  if (opts.beforeItemId) {
    const idx = others.findIndex((s) => s.id === opts.beforeItemId);
    if (idx === -1) throw new Error("ไม่พบรายการอ้างอิงสำหรับย้าย");
    const prev = idx > 0 ? others[idx - 1]! : null;
    position = keyBetween(prev?.position ?? null, others[idx]!.position);
  } else if (opts.afterItemId) {
    const idx = others.findIndex((s) => s.id === opts.afterItemId);
    if (idx === -1) throw new Error("ไม่พบรายการอ้างอิงสำหรับย้าย");
    const next = others[idx + 1] ?? null;
    position = keyBetween(others[idx]!.position, next?.position ?? null);
  } else {
    position = keyBetween(others[others.length - 1]?.position ?? null, null);
  }

  return prisma.kanbanChecklistItem.update({ where: { id: itemId }, data: { position } });
}

// ───────────────────────── อ่าน ─────────────────────────

/** เช็คลิสต์ทั้งหมดของการ์ด + ความคืบหน้าต่อชุด (VIEWER อ่านได้ — แค่ดู ไม่ใช่แก้) */
export async function getCardChecklists(ctx: KanbanCtx, cardId: string): Promise<KanbanChecklistDto[]> {
  await assertCardRole(ctx, cardId, "VIEWER");
  const checklists = await prisma.kanbanChecklist.findMany({
    where: { cardId, tenantId: ctx.tenantId },
    orderBy: { position: "asc" },
    include: { items: { orderBy: { position: "asc" } } },
  });
  return checklists.map((c) => ({
    id: c.id,
    title: c.title,
    position: c.position,
    items: c.items.map(toItemDto),
    progress: { done: c.items.filter((i) => i.done).length, total: c.items.length },
  }));
}

/** ผลรวมความคืบหน้าเช็คลิสต์ของการ์ด 1 ใบ (ตราท้ายการ์ด n/m — ใช้ตอนคืนการ์ดเดี่ยวจาก action) */
export async function checklistProgressOfCard(ctx: KanbanCtx, cardId: string): Promise<{ done: number; total: number }> {
  const rows = await getCardChecklists(ctx, cardId);
  return rows.reduce((acc, r) => ({ done: acc.done + r.progress.done, total: acc.total + r.progress.total }), { done: 0, total: 0 });
}

/**
 * รายการเช็คลิสต์ที่มอบหมายให้ `userId` ข้ามทุกบอร์ด — เฉพาะ done=false และเฉพาะบอร์ดที่ **ผู้เรียก**
 * (`ctx.actorUserId`) มองเห็น — หน้า "งานของฉัน" ปกติเรียกด้วย `ctx.actorUserId === userId` (ดูของตัวเอง)
 * แต่ก็รองรับ OWNER/ผู้ดูแลเปิดดูแทนพนักงานคนอื่นได้ในขอบเขตบอร์ดที่ตัวเองมองเห็น
 */
export async function listMyChecklistItems(ctx: KanbanCtx, userId: string): Promise<MyChecklistItemDto[]> {
  const callerActor = await loadActor(ctx);
  if (!callerActor) return [];
  const items = await prisma.kanbanChecklistItem.findMany({
    where: {
      tenantId: ctx.tenantId,
      assigneeUserId: userId,
      done: false,
      checklist: { card: { systemId: ctx.systemId, status: "ACTIVE", board: visibleBoardsWhere(callerActor) } },
    },
    orderBy: [{ dueAt: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }],
    include: { checklist: { include: { card: { select: { id: true, title: true, cardNo: true, boardId: true } } } } },
    take: 100,
  });
  return items.map((i) => ({
    id: i.id,
    text: i.text,
    dueAt: i.dueAt ? i.dueAt.toISOString() : null,
    done: i.done,
    card: {
      id: i.checklist.card.id,
      title: i.checklist.card.title,
      cardNo: i.checklist.card.cardNo,
      boardId: i.checklist.card.boardId,
    },
  }));
}
