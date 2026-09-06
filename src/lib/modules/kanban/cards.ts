// cards.ts — การ์ด: ส่วนที่ K1.2 รับผิดชอบ = "ผู้รับผิดชอบหลายคน"
// (createCard/updateCard/moveCard ยังอยู่ service.ts — จะทยอยย้ายมาที่นี่ตามพิมพ์เขียว §5.4 ใน WO ถัดไป)
//
// 🔴 เขียนคู่ตลอด P1 (§4.6 ข้อ 5): `KanbanCardAssignee` (หลายคน) คู่กับ `KanbanCard.assigneeUserId`
//    (= คนแรกของลิสต์ · null เมื่อไม่มีใคร) เพราะหน้าจอ/รายงาน/AI รอบ deploy ก่อนยังอ่านช่องเดิมอยู่

import type { KanbanCard, Prisma } from "@prisma/client";
import { KanbanNotFoundError } from "./access";
import { listAttachments } from "./attachments";
import { getCardChecklists } from "./checklists";
import { prisma } from "./db";
import { assertBoardRole, assertCardRole } from "./members";
import { listComments } from "./comments";
import { notifyCardAssigned } from "./notify";
import { keyBetween } from "./ordering";
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

// ═══════════════════════════ K1.6: หลังการ์ด ═══════════════════════════
// แก้ฟิลด์ · ทำสำเนา · เก็บ/กู้คืน (พิมพ์เขียว §5.3 · KANBAN-RUN §K1.6)
// 🔴 ทุกตัวผ่าน `assertCardRole`/`assertBoardRole` ก่อนเสมอ (404 มองไม่เห็น · 403 ต่ำกว่า EDITOR)
// 🔴 TODO(K1.10): เมื่อ `KanbanActivity` มาแล้ว ทุกฟังก์ชันในบล็อกนี้ต้อง `logActivity` ในทรานแซกชันเดียวกัน
//    (UPDATED/DUE_SET/ARCHIVED/RESTORED) — ยังไม่มีตารางนี้ในโมดูลตอนนี้ จึงยังไม่เขียน

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
  // K1.7/K1.8/K1.9: หลังการ์ดโหลดเช็คลิสต์ + ความเห็น + ไฟล์แนบ พร้อมกับส่วนที่เหลือของการ์ดในเที่ยวเดียว
  // (ทุกตัวตรวจสิทธิ์ซ้ำในตัวเอง — เปิดหลังการ์ด 1 ครั้ง = ไม่ต้องยิง action เพิ่มอีกหลายรอบ)
  const [checklists, comments, attachments] = await Promise.all([
    getCardChecklists(ctx, cardId),
    listComments(ctx, cardId),
    listAttachments(ctx, cardId),
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
  await assertCardRole(ctx, cardId, "EDITOR");
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

  return prisma.kanbanCard.update({ where: { id: before.id }, data });
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
    return row;
  });

  return created;
}

/** เก็บการ์ดเข้าคลัง (ห้ามใช้คำว่า "ลบ" — §12.3) */
export async function archiveCard(ctx: KanbanCtx, cardId: string): Promise<KanbanCard> {
  await assertCardRole(ctx, cardId, "EDITOR");
  await prisma.kanbanCard.updateMany({
    where: { id: cardId, tenantId: ctx.tenantId, systemId: ctx.systemId, status: "ACTIVE" },
    data: { status: "ARCHIVED", archivedAt: new Date(), archivedById: ctx.actorUserId ?? null },
  });
  return prisma.kanbanCard.findFirstOrThrow({ where: { id: cardId, tenantId: ctx.tenantId, systemId: ctx.systemId } });
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

  await prisma.kanbanCard.updateMany({
    where: { id: card.id, tenantId: ctx.tenantId, systemId: ctx.systemId },
    data: { status: "ACTIVE", archivedAt: null, archivedById: null, columnId: targetColumnId, position },
  });
  return prisma.kanbanCard.findFirstOrThrow({ where: { id: card.id, tenantId: ctx.tenantId, systemId: ctx.systemId } });
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
