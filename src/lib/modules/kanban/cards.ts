// cards.ts — การ์ด: ส่วนที่ K1.2 รับผิดชอบ = "ผู้รับผิดชอบหลายคน"
// (createCard/updateCard/moveCard ยังอยู่ service.ts — จะทยอยย้ายมาที่นี่ตามพิมพ์เขียว §5.4 ใน WO ถัดไป)
//
// 🔴 เขียนคู่ตลอด P1 (§4.6 ข้อ 5): `KanbanCardAssignee` (หลายคน) คู่กับ `KanbanCard.assigneeUserId`
//    (= คนแรกของลิสต์ · null เมื่อไม่มีใคร) เพราะหน้าจอ/รายงาน/AI รอบ deploy ก่อนยังอ่านช่องเดิมอยู่

import type { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { notifyCardAssigned } from "./notify";
import type { KanbanCtx } from "./types";

type Tx = Prisma.TransactionClient;

type CardKey = { id: string; title: string; boardId: string };

async function requireCard(ctx: KanbanCtx, cardId: string): Promise<CardKey> {
  const card = await prisma.kanbanCard.findFirst({
    where: { id: cardId, tenantId: ctx.tenantId, systemId: ctx.systemId },
    select: { id: true, title: true, boardId: true },
  });
  if (!card) throw new Error("ไม่พบการ์ดนี้");
  return card;
}

/**
 * ทุก userId ต้องเป็นสมาชิก (Membership ที่ accepted) ของร้านนี้
 * ตรวจ **ทั้งชุดก่อนเขียนสักแถว** — ส่งมา 3 คนแล้วมีคนหนึ่งไม่ใช่พนักงาน = ไม่เขียนเลย ไม่ใช่เขียน 2 คนแล้วค่อยล้ม
 */
async function assertMembers(tenantId: string, userIds: string[]): Promise<void> {
  if (userIds.length === 0) return;
  const rows = await prisma.membership.findMany({
    where: { tenantId, userId: { in: userIds }, acceptedAt: { not: null } },
    select: { userId: true },
  });
  const ok = new Set(rows.map((r) => r.userId));
  const bad = userIds.filter((u) => !ok.has(u));
  if (bad.length > 0) {
    throw new Error(`มอบหมายได้เฉพาะพนักงานในร้านนี้ — มี ${bad.length} คนที่ไม่ใช่สมาชิกของร้าน`);
  }
}

/**
 * เขียนแถวผู้รับผิดชอบให้ตรงกับลิสต์ + ตั้ง `assigneeUserId` = คนแรก (ใช้ร่วมกับ createCard/updateCard)
 * คืน userId ของ "คนที่เพิ่งถูกเพิ่ม" เพื่อให้ผู้เรียกไปแจ้งเตือนหลัง commit (ไม่แจ้งซ้ำคนเดิม)
 */
async function writeAssignees(
  tx: Tx,
  ctx: KanbanCtx,
  cardId: string,
  userIds: string[],
): Promise<{ added: string[] }> {
  const before = await tx.kanbanCardAssignee.findMany({ where: { cardId }, select: { userId: true } });
  const had = new Set(before.map((r) => r.userId));
  await tx.kanbanCardAssignee.deleteMany({
    where: { cardId, userId: { notIn: userIds.length ? userIds : ["__none__"] } },
  });
  const added = userIds.filter((u) => !had.has(u));
  if (added.length > 0) {
    await tx.kanbanCardAssignee.createMany({
      data: added.map((userId) => ({
        cardId,
        userId,
        tenantId: ctx.tenantId,
        assignedById: ctx.actorUserId ?? null,
      })),
      skipDuplicates: true,
    });
  }
  await tx.kanbanCard.update({ where: { id: cardId }, data: { assigneeUserId: userIds[0] ?? null } });
  return { added };
}

/**
 * ตั้งผู้รับผิดชอบของการ์ด (แทนที่ทั้งชุด)
 * - ลำดับในลิสต์มีความหมาย: คนแรก = ค่าที่เขียนลง `assigneeUserId` (ช่องเดิม)
 * - แจ้งเตือนเฉพาะ "คนที่เพิ่งถูกเพิ่ม" — คนเดิมที่ยังอยู่ในลิสต์ไม่โดนแจ้งซ้ำ
 */
export async function setCardAssignees(
  ctx: KanbanCtx,
  cardId: string,
  userIds: string[],
): Promise<{ assigneeUserIds: string[]; added: string[] }> {
  const card = await requireCard(ctx, cardId);
  const ids = [...new Set(userIds)];
  await assertMembers(ctx.tenantId, ids);

  const { added } = await prisma.$transaction((tx) => writeAssignees(tx, ctx, card.id, ids));
  for (const userId of added) {
    await notifyCardAssigned(ctx.tenantId, ctx.systemId, card, userId);
  }
  return { assigneeUserIds: ids, added };
}

/** ผู้รับผิดชอบของการ์ด (เรียงตามเวลาที่ถูกมอบหมาย — คนแรก = เจ้าของช่องเดิม) */
export async function listCardAssignees(ctx: KanbanCtx, cardId: string): Promise<string[]> {
  const card = await requireCard(ctx, cardId);
  const rows = await prisma.kanbanCardAssignee.findMany({
    where: { cardId: card.id, tenantId: ctx.tenantId },
    orderBy: { assignedAt: "asc" },
    select: { userId: true },
  });
  return rows.map((r) => r.userId);
}

/**
 * ตัวเชื่อมช่วงเปลี่ยนผ่านสำหรับโค้ดที่ยังส่ง `assigneeUserId` เดี่ยว ๆ (createCard/updateCard/AI/actions เดิม)
 * — ทำให้ตารางผู้รับผิดชอบตรงกับช่องเดิมเสมอ โดยไม่แจ้งเตือน (ผู้เรียกแจ้งเองอยู่แล้ว)
 */
export async function syncSingleAssignee(
  ctx: KanbanCtx,
  cardId: string,
  assigneeUserId: string | null,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.kanbanCardAssignee.deleteMany({
      where: { cardId, userId: { notIn: assigneeUserId ? [assigneeUserId] : ["__none__"] } },
    });
    if (assigneeUserId) {
      await tx.kanbanCardAssignee.createMany({
        data: [{ cardId, userId: assigneeUserId, tenantId: ctx.tenantId, assignedById: ctx.actorUserId ?? null }],
        skipDuplicates: true,
      });
    }
  });
}
