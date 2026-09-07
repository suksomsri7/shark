// cards.ts — การ์ด: ส่วนที่ K1.2 รับผิดชอบ = "ผู้รับผิดชอบหลายคน"
// (createCard/updateCard/moveCard ยังอยู่ service.ts — จะทยอยย้ายมาที่นี่ตามพิมพ์เขียว §5.4 ใน WO ถัดไป)
//
// 🔴 เขียนคู่ตลอด P1 (§4.6 ข้อ 5): `KanbanCardAssignee` (หลายคน) คู่กับ `KanbanCard.assigneeUserId`
//    (= คนแรกของลิสต์ · null เมื่อไม่มีใคร) เพราะหน้าจอ/รายงาน/AI รอบ deploy ก่อนยังอ่านช่องเดิมอยู่

import type { KanbanCard, Prisma } from "@prisma/client";
import { KanbanNotFoundError } from "./access";
import { emitOutbox } from "@/lib/core/outbox";
import { logActivity } from "./activity-log";
import { listAttachments } from "./attachments";
import { getCardChecklists } from "./checklists";
import { prisma } from "./db";
import { getCardFieldValues } from "./fields";
import { setCardLabels } from "./labels";
import { KANBAN_LIMITS } from "./limits";
import { assertBoardRole, assertCardRole } from "./members";
import { listComments } from "./comments";
import { moveCard } from "./moves";
import { notifyCardAssigned } from "./notify";
import { keyBetween } from "./ordering";
import { publishBoardSignal, boardSignal } from "./realtime";
import { sanitizeDescription } from "./sanitize";
import type { CardDetailDto, KanbanCtx } from "./types";

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
): Promise<{ added: string[]; removed: string[] }> {
  const before = await tx.kanbanCardAssignee.findMany({ where: { cardId }, select: { userId: true } });
  const had = new Set(before.map((r) => r.userId));
  await tx.kanbanCardAssignee.deleteMany({
    where: { cardId, userId: { notIn: userIds.length ? userIds : ["__none__"] } },
  });
  const added = userIds.filter((u) => !had.has(u));
  const removed = [...had].filter((u) => !userIds.includes(u));
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
  return { added, removed };
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

  // K1.10: กิจกรรมเขียนใน tx เดียวกับการมอบหมาย — มอบหมายสำเร็จแต่ประวัติหายเกิดไม่ได้
  const { added } = await prisma.$transaction(async (tx) => {
    const result = await writeAssignees(tx, ctx, card.id, ids);
    await logAssigneeChange(tx, ctx, card, result);
    return result;
  });
  for (const userId of added) {
    await notifyCardAssigned(ctx.tenantId, ctx.systemId, card, userId);
  }
  await publishBoardSignal(ctx, card.boardId, boardSignal({ type: "card.assignees", boardId: card.boardId, cardId: card.id }));
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
  const card = await prisma.kanbanCard.findFirst({
    where: { id: cardId, tenantId: ctx.tenantId, systemId: ctx.systemId },
    select: { id: true, boardId: true },
  });
  if (!card) return;
  await prisma.$transaction(async (tx) => {
    const before = await tx.kanbanCardAssignee.findMany({ where: { cardId }, select: { userId: true } });
    const had = before.map((r) => r.userId);
    await tx.kanbanCardAssignee.deleteMany({
      where: { cardId, userId: { notIn: assigneeUserId ? [assigneeUserId] : ["__none__"] } },
    });
    if (assigneeUserId) {
      await tx.kanbanCardAssignee.createMany({
        data: [{ cardId, userId: assigneeUserId, tenantId: ctx.tenantId, assignedById: ctx.actorUserId ?? null }],
        skipDuplicates: true,
      });
    }
    // K1.10: เส้นทางเก่า (createCard/updateCard/AI) ก็ต้องมีประวัติ — เขียนใน tx เดียวกันเหมือนเส้นทางใหม่
    await logAssigneeChange(tx, ctx, card, {
      added: assigneeUserId && !had.includes(assigneeUserId) ? [assigneeUserId] : [],
      removed: had.filter((u) => u !== assigneeUserId),
    });
  });
}

/**
 * K1.10 — CARD_ASSIGNED/CARD_UNASSIGNED ของการเปลี่ยนผู้รับผิดชอบ 1 ครั้ง (เขียนใน tx ที่ส่งเข้ามา)
 * มอบเพิ่ม 1 คน + ปลด 1 คนในคราวเดียว = 2 แถว (คนละความหมาย ไม่ยุบรวม)
 */
async function logAssigneeChange(
  tx: Tx,
  ctx: KanbanCtx,
  card: { id: string; boardId: string },
  change: { added: string[]; removed: string[] },
): Promise<void> {
  const base = { tenantId: ctx.tenantId, boardId: card.boardId, cardId: card.id, actorUserId: ctx.actorUserId ?? null };
  if (change.added.length > 0) {
    await logActivity(tx, { ...base, type: "CARD_ASSIGNED", data: { userIds: change.added } });
  }
  if (change.removed.length > 0) {
    await logActivity(tx, { ...base, type: "CARD_UNASSIGNED", data: { userIds: change.removed } });
  }
}

// ═══════════════════════════ K1.6: หลังการ์ด ═══════════════════════════
// แก้ฟิลด์ · ทำสำเนา · เก็บ/กู้คืน (พิมพ์เขียว §5.3 · KANBAN-RUN §K1.6)
// 🔴 ทุกตัวผ่าน `assertCardRole`/`assertBoardRole` ก่อนเสมอ (404 มองไม่เห็น · 403 ต่ำกว่า EDITOR)
// 🔴 K1.10: ทุกฟังก์ชันที่เขียนในบล็อกนี้ `logActivity` ใน **ทรานแซกชันเดียวกับงาน**
//    (UPDATED/DUE_SET/CREATED/ARCHIVED/RESTORED) — ของเดิมเป็น update เดี่ยว ๆ จึงถูกห่อ tx เพิ่มให้

/**
 * ส่วนของการ์ดที่หน้าบอร์ดไม่ดึงมา (description/startAt/reminder/สถานะคลัง) — `CardBack` เรียกตอนเปิด
 * VIEWER อ่านได้ (แค่ดู ไม่ใช่แก้)
 */
export async function getCardDetail(ctx: KanbanCtx, cardId: string): Promise<CardDetailDto> {
  await assertCardRole(ctx, cardId, "VIEWER");
  const card = await prisma.kanbanCard.findFirst({
    where: { id: cardId, tenantId: ctx.tenantId, systemId: ctx.systemId },
    select: {
      id: true,
      description: true,
      dueAt: true,
      startAt: true,
      reminderMinutesBefore: true,
      archivedAt: true,
      archivedById: true,
      status: true,
    },
  });
  if (!card) throw new KanbanNotFoundError("ไม่พบการ์ดนี้");
  // K1.7/K1.8/K1.9/K2.6: หลังการ์ดโหลดเช็คลิสต์ + ความเห็น + ไฟล์แนบ + ค่าฟิลด์กำหนดเอง พร้อมกับส่วนที่
  // เหลือของการ์ดในเที่ยวเดียว (ทุกตัวตรวจสิทธิ์ซ้ำในตัวเอง — เปิดหลังการ์ด 1 ครั้ง = ไม่ต้องยิง action เพิ่มอีกหลายรอบ)
  const [checklists, comments, attachments, customFields] = await Promise.all([
    getCardChecklists(ctx, cardId),
    listComments(ctx, cardId),
    listAttachments(ctx, cardId),
    getCardFieldValues(ctx, undefined, cardId),
  ]);
  return {
    id: card.id,
    description: card.description,
    dueAt: card.dueAt ? card.dueAt.toISOString() : null,
    startAt: card.startAt ? card.startAt.toISOString() : null,
    reminderMinutesBefore: card.reminderMinutesBefore,
    archivedAt: card.archivedAt ? card.archivedAt.toISOString() : null,
    archivedById: card.archivedById,
    status: card.status as CardDetailDto["status"],
    checklists,
    comments,
    attachments,
    customFields,
  };
}

export type UpdateCardFieldsInput = {
  title?: string;
  description?: string | null;
  dueAt?: Date | null;
  startAt?: Date | null;
  reminderMinutesBefore?: number | null;
};

/**
 * แก้ฟิลด์หลักของการ์ด (ชื่อ/รายละเอียด/กำหนดส่ง/วันเริ่ม/เตือนล่วงหน้า) — ทุกฟิลด์ optional เขียนเฉพาะที่ส่งมา
 * - ชื่อ trim ว่าง → error ไทย (ไม่เขียนอะไรเลย)
 * - รายละเอียดผ่าน `sanitizeDescription` เสมอ (กันสคริปต์หลุดมาจาก textarea)
 * - วันเริ่มหลังกำหนดส่ง → error ไทย
 * - ล้างกำหนดส่ง (`dueAt: null`) → ล้างเตือนล่วงหน้า + `reminderSentAt` ด้วยเสมอ (แจ้งเตือนที่ตั้งไว้ไม่มีความหมายแล้ว)
 */
export async function updateCardFields(
  ctx: KanbanCtx,
  cardId: string,
  input: UpdateCardFieldsInput,
): Promise<KanbanCard> {
  const { boardId } = await assertCardRole(ctx, cardId, "EDITOR");
  const before = await prisma.kanbanCard.findFirst({
    where: { id: cardId, tenantId: ctx.tenantId, systemId: ctx.systemId },
    select: { id: true, dueAt: true, startAt: true },
  });
  if (!before) throw new KanbanNotFoundError("ไม่พบการ์ดนี้");

  const data: Prisma.KanbanCardUpdateInput = {};

  if (input.title !== undefined) {
    const title = input.title.trim();
    if (!title) throw new Error("ต้องตั้งชื่อการ์ดก่อนจึงบันทึกได้");
    data.title = title;
  }
  if (input.description !== undefined) {
    data.description = input.description === null ? null : sanitizeDescription(input.description);
  }

  const nextStartAt = input.startAt !== undefined ? input.startAt : before.startAt;
  const nextDueAt = input.dueAt !== undefined ? input.dueAt : before.dueAt;
  if (nextStartAt && nextDueAt && nextStartAt.getTime() > nextDueAt.getTime()) {
    throw new Error("วันเริ่มต้องไม่หลังกำหนดส่ง");
  }

  if (input.reminderMinutesBefore !== undefined) data.reminderMinutesBefore = input.reminderMinutesBefore;
  if (input.startAt !== undefined) data.startAt = input.startAt;
  if (input.dueAt !== undefined) {
    data.dueAt = input.dueAt;
    // ล้างกำหนดส่ง = ล้างเตือนล่วงหน้าเสมอ ไม่ว่าผู้เรียกจะส่ง reminderMinutesBefore มาด้วยหรือไม่
    if (input.dueAt === null) {
      data.reminderMinutesBefore = null;
      data.reminderSentAt = null;
    }
  }

  // K1.10 — 2 แถวจากการกดบันทึกครั้งเดียวได้ (เช่นแก้ชื่อ + ตั้งกำหนดส่ง): CARD_UPDATED บอกว่า
  // "แตะฟิลด์ไหนบ้าง" ส่วน CARD_DUE_SET เป็นชนิดของตัวเองเพราะกำหนดส่งคือสิ่งที่ทีมตามหาในประวัติบ่อยที่สุด
  const fields = Object.keys(input).filter((k) => input[k as keyof UpdateCardFieldsInput] !== undefined);
  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.kanbanCard.update({ where: { id: before.id }, data });
    const base = { tenantId: ctx.tenantId, boardId, cardId: before.id, actorUserId: ctx.actorUserId ?? null };
    if (fields.length > 0) await logActivity(tx, { ...base, type: "CARD_UPDATED", data: { fields } });
    if (input.dueAt !== undefined) {
      await logActivity(tx, {
        ...base,
        type: "CARD_DUE_SET",
        data: { dueAt: input.dueAt ? input.dueAt.toISOString() : null },
      });
    }
    return row;
  });

  // หลัง commit (ดูหัวไฟล์ realtime.ts) — จออื่นของบอร์ดนี้จะ refresh มาเห็นชื่อ/กำหนดส่งใหม่
  await publishBoardSignal(ctx, boardId, boardSignal({ type: "card.updated", boardId, cardId: before.id }));
  return updated;
}

/**
 * ทำสำเนาการ์ด — คอลัมน์เดียวกัน ต่อจากต้นฉบับทันที · cardNo ใหม่ (D14) · ชื่อ + " (สำเนา)"
 * คัดลอก: description/dueAt/startAt/reminderMinutesBefore/ป้าย/ผู้รับผิดชอบ
 * ไม่คัดลอก: completedAt/reminderSentAt (สำเนาคืองานใหม่ ยังไม่เคยเสร็จ/ยังไม่เคยเตือน)
 */
export async function duplicateCard(ctx: KanbanCtx, cardId: string): Promise<KanbanCard> {
  await assertCardRole(ctx, cardId, "EDITOR");
  const original = await prisma.kanbanCard.findFirst({
    where: { id: cardId, tenantId: ctx.tenantId, systemId: ctx.systemId },
  });
  if (!original) throw new KanbanNotFoundError("ไม่พบการ์ดนี้");

  const [labelIds, assigneeIds, siblings, checklists] = await Promise.all([
    prisma.kanbanCardLabel.findMany({ where: { cardId: original.id }, select: { labelId: true } }).then((r) => r.map((x) => x.labelId)),
    prisma.kanbanCardAssignee.findMany({ where: { cardId: original.id }, select: { userId: true } }).then((r) => r.map((x) => x.userId)),
    prisma.kanbanCard.findMany({
      where: { columnId: original.columnId, tenantId: ctx.tenantId, systemId: ctx.systemId, status: "ACTIVE" },
      orderBy: [{ position: { sort: "asc", nulls: "first" } }, { sortOrder: "asc" }, { createdAt: "asc" }],
      select: { id: true, position: true },
    }),
    // K1.7: เช็คลิสต์ก็อปไปด้วย — รายการเป็น "ยังไม่ทำ" ทั้งหมด ไม่มีผู้รับมอบหมาย (งานใหม่ ยังไม่เคยมอบใคร)
    prisma.kanbanChecklist.findMany({
      where: { cardId: original.id },
      orderBy: { position: "asc" },
      include: { items: { orderBy: { position: "asc" } } },
    }),
  ]);
  const idx = siblings.findIndex((s) => s.id === original.id);
  const nextPos = idx >= 0 ? (siblings[idx + 1]?.position ?? null) : null;
  const position = keyBetween(original.position, nextPos);

  const created = await prisma.$transaction(async (tx) => {
    const seq = await tx.$queryRaw<{ cardNoSeq: number }[]>`
      UPDATE "KanbanBoard" SET "cardNoSeq" = "cardNoSeq" + 1 WHERE id = ${original.boardId} RETURNING "cardNoSeq"
    `;
    const row = await tx.kanbanCard.create({
      data: {
        tenantId: ctx.tenantId,
        systemId: ctx.systemId,
        boardId: original.boardId,
        columnId: original.columnId,
        title: `${original.title} (สำเนา)`,
        description: original.description,
        dueAt: original.dueAt,
        startAt: original.startAt,
        reminderMinutesBefore: original.reminderMinutesBefore,
        labels: (original.labels ?? []) as Prisma.InputJsonValue,
        sortOrder: 0,
        position,
        cardNo: seq[0]?.cardNoSeq ?? null,
        sourceType: original.sourceType,
        createdById: ctx.actorUserId ?? null,
      },
    });
    if (labelIds.length > 0) {
      await tx.kanbanCardLabel.createMany({
        data: labelIds.map((labelId) => ({ cardId: row.id, labelId, tenantId: ctx.tenantId })),
        skipDuplicates: true,
      });
    }
    if (assigneeIds.length > 0) {
      await tx.kanbanCardAssignee.createMany({
        data: assigneeIds.map((userId) => ({ cardId: row.id, userId, tenantId: ctx.tenantId, assignedById: ctx.actorUserId ?? null })),
        skipDuplicates: true,
      });
    }
    // K1.7: คัดลอกเช็คลิสต์ — ตำแหน่งเดิมใช้ซ้ำได้ตรง ๆ (position เทียบกันเฉพาะภายในชุด/การ์ดเดียวกัน
    // ไม่ใช่ค่าที่ต้อง unique ข้ามทั้งตาราง) · เก็บกำหนดวันไว้ แต่ล้างสถานะเสร็จ/ผู้รับมอบหมาย
    for (const checklist of checklists) {
      const newChecklist = await tx.kanbanChecklist.create({
        data: { tenantId: ctx.tenantId, cardId: row.id, title: checklist.title, position: checklist.position },
      });
      if (checklist.items.length > 0) {
        await tx.kanbanChecklistItem.createMany({
          data: checklist.items.map((item) => ({
            tenantId: ctx.tenantId,
            checklistId: newChecklist.id,
            text: item.text,
            position: item.position,
            done: false,
            assigneeUserId: null,
            dueAt: item.dueAt,
            doneAt: null,
            doneById: null,
          })),
        });
      }
    }
    await logActivity(tx, {
      tenantId: ctx.tenantId,
      boardId: original.boardId,
      cardId: row.id,
      actorUserId: ctx.actorUserId ?? null,
      type: "CARD_CREATED",
      data: { title: row.title, columnId: row.columnId, duplicatedFromCardId: original.id },
    });
    return row;
  });

  return created;
}

/** เก็บการ์ดเข้าคลัง (ห้ามใช้คำว่า "ลบ" — §12.3) */
export async function archiveCard(ctx: KanbanCtx, cardId: string): Promise<KanbanCard> {
  const { boardId } = await assertCardRole(ctx, cardId, "EDITOR");
  const archived = await prisma.$transaction(async (tx) => {
    await tx.kanbanCard.updateMany({
      where: { id: cardId, tenantId: ctx.tenantId, systemId: ctx.systemId, status: "ACTIVE" },
      data: { status: "ARCHIVED", archivedAt: new Date(), archivedById: ctx.actorUserId ?? null },
    });
    await logActivity(tx, {
      tenantId: ctx.tenantId,
      boardId,
      cardId,
      actorUserId: ctx.actorUserId ?? null,
      type: "CARD_ARCHIVED",
    });
    const row = await tx.kanbanCard.findFirstOrThrow({ where: { id: cardId, tenantId: ctx.tenantId, systemId: ctx.systemId } });
    // K1.15 — เหตุการณ์ `kanban.card.archived` ใน tx เดียวกับการเก็บ · คีย์กันซ้ำผูกเวลาที่เก็บ
    // (เก็บ→กู้คืน→เก็บอีก = คนละใบ ตามความจริง)
    await emitOutbox(tx, {
      tenantId: ctx.tenantId,
      systemId: ctx.systemId,
      type: "kanban.card.archived",
      idempotencyKey: `kanban.card.archived#${cardId}#${(row.archivedAt ?? row.updatedAt).getTime()}`,
      payload: { cardId, boardId, cardNo: row.cardNo, title: row.title },
    });
    return row;
  });
  await publishBoardSignal(ctx, boardId, boardSignal({ type: "card.archived", boardId, cardId }));
  return archived;
}

/**
 * กู้คืนการ์ดจากคลัง — คอลัมน์เดิมยังใช้งานได้ → กลับไปคอลัมน์เดิม (ท้ายคอลัมน์)
 * คอลัมน์เดิมถูกเก็บไปแล้ว → ไปคอลัมน์แรกของบอร์ด (เรียงเหมือน `getBoard`)
 */
export async function restoreCard(ctx: KanbanCtx, cardId: string): Promise<KanbanCard> {
  await assertCardRole(ctx, cardId, "EDITOR");
  const card = await prisma.kanbanCard.findFirst({
    where: { id: cardId, tenantId: ctx.tenantId, systemId: ctx.systemId },
    select: { id: true, boardId: true, columnId: true },
  });
  if (!card) throw new KanbanNotFoundError("ไม่พบการ์ดนี้");

  const originalColumn = await prisma.kanbanColumn.findFirst({
    where: { id: card.columnId, tenantId: ctx.tenantId, systemId: ctx.systemId, status: "ACTIVE" },
    select: { id: true },
  });
  let targetColumnId = originalColumn?.id ?? null;
  if (!targetColumnId) {
    const firstColumn = await prisma.kanbanColumn.findFirst({
      where: { boardId: card.boardId, tenantId: ctx.tenantId, systemId: ctx.systemId, status: "ACTIVE" },
      orderBy: [{ position: { sort: "asc", nulls: "first" } }, { sortOrder: "asc" }, { createdAt: "asc" }],
      select: { id: true },
    });
    if (!firstColumn) throw new Error("บอร์ดนี้ไม่มีคอลัมน์ที่ใช้งานได้แล้ว — สร้างคอลัมน์ก่อนจึงกู้คืนการ์ดได้");
    targetColumnId = firstColumn.id;
  }

  const last = await prisma.kanbanCard.findFirst({
    where: { columnId: targetColumnId, tenantId: ctx.tenantId, systemId: ctx.systemId, status: "ACTIVE", position: { not: null } },
    orderBy: { position: "desc" },
    select: { position: true },
  });
  const position = keyBetween(last?.position ?? null, null);

  const restored = await prisma.$transaction(async (tx) => {
    await tx.kanbanCard.updateMany({
      where: { id: card.id, tenantId: ctx.tenantId, systemId: ctx.systemId },
      data: { status: "ACTIVE", archivedAt: null, archivedById: null, columnId: targetColumnId, position },
    });
    await logActivity(tx, {
      tenantId: ctx.tenantId,
      boardId: card.boardId,
      cardId: card.id,
      actorUserId: ctx.actorUserId ?? null,
      type: "CARD_RESTORED",
      data: { columnId: targetColumnId },
    });
    return tx.kanbanCard.findFirstOrThrow({ where: { id: card.id, tenantId: ctx.tenantId, systemId: ctx.systemId } });
  });
  await publishBoardSignal(ctx, card.boardId, boardSignal({ type: "card.restored", boardId: card.boardId, cardId: card.id, columnId: targetColumnId }));
  return restored;
}

export type ArchivedCardRow = {
  id: string;
  cardNo: number | null;
  title: string;
  archivedAt: Date | null;
  archivedById: string | null;
  columnName: string | null;
};

/** รายการการ์ดในคลังของบอร์ด (VIEWER ดูได้ — เป็นแค่การอ่าน) */
export async function listArchivedCards(
  ctx: KanbanCtx,
  boardId: string,
  opts?: { q?: string },
): Promise<ArchivedCardRow[]> {
  await assertBoardRole(ctx, boardId, "VIEWER");
  const q = opts?.q?.trim();
  const rows = await prisma.kanbanCard.findMany({
    where: {
      boardId,
      tenantId: ctx.tenantId,
      systemId: ctx.systemId,
      status: "ARCHIVED",
      ...(q ? { title: { contains: q, mode: "insensitive" as const } } : {}),
    },
    orderBy: { archivedAt: "desc" },
    include: { column: { select: { name: true } } },
  });
  return rows.map((r) => ({
    id: r.id,
    cardNo: r.cardNo,
    title: r.title,
    archivedAt: r.archivedAt,
    archivedById: r.archivedById,
    columnName: r.column?.name ?? null,
  }));
}

// ═══════════════════════════ K2.1: bulkUpdate — แถบ "เลือกหลายรายการ" ของมุมมองตาราง ═══════════════════════════
// สัญญา ledger/KANBAN-RUN.md §K2.1: ต่อใบในทรานแซกชันของตัวเอง (ใบหนึ่งพังไม่ล้มทั้งชุด) · id ต่างบอร์ด/
// ไม่มี → skipped ไม่ throw · EDITOR+ ของบอร์ด (ไม่งั้น throw) · เกิน `KANBAN_LIMITS.bulkMax` → throw ไทย ·
// ย้ายผ่าน `moveCard` (ต่อท้ายคอลัมน์) · กิจกรรมรายใบ (เกิดเองจากฟังก์ชันย่อยที่เรียก) · `publishBoardSignal`
// ครั้งเดียวท้ายชุด
//
// 🔴 "บอร์ดของชุดนี้" คำนวณจาก **การ์ดใบแรกที่มีอยู่จริง** ใน `cardIds` (ฟังก์ชันนี้ไม่รับ `boardId` แยก) —
//    ใบไหนอยู่บอร์ดอื่นถือว่า "ไม่ใช่ชุดนี้" แล้ว skip แม้ actor จะมีสิทธิ์เห็นบอร์ดนั้นด้วยก็ตาม (เช่น OWNER
//    เป็น ADMIN ทุกบอร์ด) — ผู้ใช้เลือกแถวจากตารางของบอร์ดเดียวเสมอ ข้าม id ก็ไม่ควรเผลอไปแตะบอร์ดอื่น

export type BulkUpdatePatch = {
  toColumnId?: string;
  addAssigneeUserIds?: string[];
  removeAssigneeUserIds?: string[];
  addLabelIds?: string[];
  removeLabelIds?: string[];
  /** ไม่ส่งคีย์นี้เลย = ไม่แตะกำหนดส่ง · ส่ง `null` = ล้างกำหนดส่ง */
  dueAt?: Date | null;
  archive?: true;
};

export type BulkUpdateResult = { updated: number; skipped: { id: string; reason: string }[] };

/** งานย่อยของการ์ด 1 ใบ — เก็บเข้าคลังแล้วไม่ทำอย่างอื่นต่อ (จะแก้ป้าย/กำหนดส่งของการ์ดที่เก็บไปแล้วก็ไม่มีความหมาย) */
async function applyBulkPatch(ctx: KanbanCtx, cardId: string, patch: BulkUpdatePatch): Promise<void> {
  if (patch.archive) {
    await archiveCard(ctx, cardId);
    return;
  }
  if (patch.toColumnId) {
    const res = await moveCard(ctx, { cardId, toColumnId: patch.toColumnId });
    if (!res.ok) throw new Error(res.message);
  }
  if ((patch.addAssigneeUserIds?.length ?? 0) > 0 || (patch.removeAssigneeUserIds?.length ?? 0) > 0) {
    const current = await prisma.kanbanCardAssignee.findMany({ where: { cardId }, select: { userId: true } });
    const next = new Set(current.map((r) => r.userId));
    for (const u of patch.addAssigneeUserIds ?? []) next.add(u);
    for (const u of patch.removeAssigneeUserIds ?? []) next.delete(u);
    await setCardAssignees(ctx, cardId, [...next]);
  }
  if ((patch.addLabelIds?.length ?? 0) > 0 || (patch.removeLabelIds?.length ?? 0) > 0) {
    const current = await prisma.kanbanCardLabel.findMany({ where: { cardId }, select: { labelId: true } });
    const next = new Set(current.map((r) => r.labelId));
    for (const l of patch.addLabelIds ?? []) next.add(l);
    for (const l of patch.removeLabelIds ?? []) next.delete(l);
    await setCardLabels(ctx, cardId, [...next]);
  }
  if ("dueAt" in patch) {
    await updateCardFields(ctx, cardId, { dueAt: patch.dueAt ?? null });
  }
}

/**
 * แก้หลายการ์ดพร้อมกันจากแถบ "เลือกหลายรายการ" ของมุมมองตาราง (K2.1)
 * ผ่านฟังก์ชันย่อยที่มีอยู่แล้ว (`moveCard`/`setCardAssignees`/`setCardLabels`/`updateCardFields`/
 * `archiveCard`) ทั้งหมด — ไม่เขียน query ตรงในนี้ นอกจากอ่านค่าปัจจุบันก่อนรวม add/remove
 */
export async function bulkUpdate(
  ctx: KanbanCtx,
  cardIds: string[],
  patch: BulkUpdatePatch,
): Promise<BulkUpdateResult> {
  if (cardIds.length > KANBAN_LIMITS.bulkMax) {
    throw new Error(`เลือกได้ครั้งละไม่เกิน ${KANBAN_LIMITS.bulkMax} การ์ด`);
  }
  if (cardIds.length === 0) return { updated: 0, skipped: [] };

  const found = await prisma.kanbanCard.findMany({
    where: { id: { in: [...new Set(cardIds)] }, tenantId: ctx.tenantId, systemId: ctx.systemId },
    select: { id: true, boardId: true },
  });
  const byId = new Map(found.map((c) => [c.id, c]));

  let boardId: string | null = null;
  for (const id of cardIds) {
    const c = byId.get(id);
    if (c) {
      boardId = c.boardId;
      break;
    }
  }
  if (!boardId) return { updated: 0, skipped: cardIds.map((id) => ({ id, reason: "ไม่พบการ์ดนี้" })) };

  // ด่านสิทธิ์เดียวของทั้งชุด (มองไม่เห็น = 404 · ยศไม่ถึง = 403) — ผ่านแล้วทุกใบที่อยู่บอร์ดนี้ทำได้หมด
  await assertBoardRole(ctx, boardId, "EDITOR");

  const skipped: { id: string; reason: string }[] = [];
  let updated = 0;
  for (const id of cardIds) {
    const card = byId.get(id);
    if (!card) {
      skipped.push({ id, reason: "ไม่พบการ์ดนี้" });
      continue;
    }
    if (card.boardId !== boardId) {
      skipped.push({ id, reason: "การ์ดนี้อยู่คนละบอร์ดกับชุดที่เลือก" });
      continue;
    }
    try {
      await applyBulkPatch(ctx, id, patch);
      updated++;
    } catch (e) {
      skipped.push({ id, reason: e instanceof Error ? e.message : "ทำรายการไม่สำเร็จ" });
    }
  }

  // K2.1 — สัญญาณเดียวท้ายชุด (ไม่ใช่ต่อใบ) กันช่องของบอร์ดถูกยิงถี่เกินตอนเลือกทีเดียวหลายสิบใบ
  await publishBoardSignal(ctx, boardId, boardSignal({ type: "card.updated", boardId }));
  return { updated, skipped };
}
