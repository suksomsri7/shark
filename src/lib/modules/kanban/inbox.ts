// inbox.ts — กล่องงานเข้าส่วนตัว (K2.8 · พิมพ์เขียว 13-kanban-v2 §3.8/§4.3/§9.2 · สัญญา ledger/KANBAN-RUN.md §K2.8)
//
// "ที่พักงานส่วนตัว" ก่อนจัดลงบอร์ด — จดเร็ว (`quickAdd` · source MANUAL) หรือมาจากภายนอก
// (`addFromSource` · CHAT/EMAIL/FORM/AI ผ่าน `sourceKey` กันสร้างซ้ำ) แล้วค่อย "ส่งเข้าบอร์ด"
// (`moveToBoard`) กลายเป็นการ์ดจริงตอนพร้อม — หรือ "ไม่เอาแล้ว" (`dismiss`)
//
// 🔴 ความเป็นส่วนตัว: กล่องของใคร เห็น/แก้ได้เฉพาะเจ้าของ (`ownerUserId === ctx.actorUserId`) เท่านั้น
//    แม้ OWNER ของร้านก็ดูของคนอื่นไม่ได้ (สัญญา K2.8 — ต่างจากบอร์ด/การ์ดทั่วไปที่ OWNER เห็นหมด)
// 🔴 K2.8 override (ledger/KANBAN-RUN.md §K2.8 หมายเหตุจาก Fable): `service.createCard` ยังไม่มี
//    พารามิเตอร์ `sourceKey` — ตั้งแต่ K3.1 `KanbanCard.sourceKey` มีจริงแล้ว ⇒ `moveToBoard` ส่งกุญแจ
//    ของต้นทางต่อไปที่การ์ดด้วย (`sourceType` + `sourceId` + `sourceKey`) แล้วเก็บ `movedCardId`
//    ไว้ที่ตัวรายการเอง — ต้นทางเดียวกันจึงกลายเป็นการ์ดได้ใบเดียวทั้งระบบ
//
// 🔴 ไฟล์นี้แตะ prisma โดยตรง ⇒ **server-only** — ห้าม client component import จากที่นี่เด็ดขาด
//    (บทเรียนจาก K1.11/K1.12/K1.13: Turbopack ลากทั้งไฟล์เข้าบันเดิลฝั่ง browser ถ้า client component
//    import ชื่อใดก็ได้จากไฟล์เดียวกัน) — DTO อยู่ใน `types.ts` (บริสุทธิ์) ให้ `InboxPanel.tsx`
//    `import type` ตรง ๆ ได้โดยไม่ลาก `db.ts` → `pg` ไปด้วย

import type { KanbanCardSourceType, Prisma } from "@prisma/client";
import { emitOutbox } from "@/lib/core/outbox";
import { boardRole, hasBoardRole, KanbanForbiddenError, KanbanNotFoundError, visibleBoardsWhere } from "./access";
import { logActivity } from "./activity-log";
import { setCardAssignees } from "./cards";
import { prisma } from "./db";
import { KANBAN_LIMITS } from "./limits";
import { assertColumnRole } from "./members";
import { keyBetween } from "./ordering";
import { publishBoardSignal, boardSignal } from "./realtime";
import type { KanbanActor, InboxItemDto, KanbanCtx, KanbanInboxSource } from "./types";

export type { InboxItemDto, KanbanInboxSource } from "./types";

type InboxRow = {
  id: string;
  title: string;
  note: string | null;
  source: string;
  sourceKey: string | null;
  fileIds: Prisma.JsonValue;
  status: "OPEN" | "MOVED" | "DISMISSED";
  ownerUserId: string;
  movedCardId: string | null;
  createdAt: Date;
};

/** ป้ายไทยของที่มา (ภาพ 06 — ชิปที่มา) — ค่าแปลก/ไม่รู้จัก → "จดไว้เอง" (fail-safe ไปทาง MANUAL) */
const SOURCE_LABEL: Record<string, string> = {
  MANUAL: "จดไว้เอง",
  CHAT: "จากแชท",
  EMAIL: "ส่งต่อทางอีเมล",
  FORM: "จากฟอร์ม",
  AI: "ผู้ช่วย AI",
};

/** `KanbanInboxItem.source` (String อิสระ) → `KanbanCard.sourceType` (enum) ตอน moveToBoard — subset เดียวกัน */
const CARD_SOURCE_TYPE_OF: Record<string, KanbanCardSourceType> = {
  MANUAL: "MANUAL",
  CHAT: "CHAT",
  EMAIL: "EMAIL",
  FORM: "FORM",
  AI: "AI",
};

const VALID_SOURCES = new Set<KanbanInboxSource>(["MANUAL", "CHAT", "EMAIL", "FORM", "AI"]);

function fileIdsOf(v: Prisma.JsonValue): string[] {
  return Array.isArray(v) ? v.filter((f): f is string => typeof f === "string") : [];
}

function toDto(row: InboxRow): InboxItemDto {
  return {
    id: row.id,
    ownerUserId: row.ownerUserId,
    title: row.title,
    note: row.note,
    source: VALID_SOURCES.has(row.source as KanbanInboxSource) ? (row.source as KanbanInboxSource) : "MANUAL",
    sourceLabel: SOURCE_LABEL[row.source] ?? "จดไว้เอง",
    fileIds: fileIdsOf(row.fileIds),
    status: row.status,
    movedCardId: row.movedCardId,
    createdAt: row.createdAt.toISOString(),
  };
}

function requireActor(ctx: KanbanCtx): string {
  if (!ctx.actorUserId) throw new KanbanForbiddenError("ต้องเข้าสู่ระบบก่อน");
  return ctx.actorUserId;
}

// ───────────────────────── อ่าน ─────────────────────────

/**
 * รายการ OPEN ของ `userId` เท่านั้น — ใหม่ก่อน · จำกัด `KANBAN_LIMITS.inboxOpenMax`
 * 🔴 `userId` ต้อง `=== ctx.actorUserId` เสมอ — ผู้ดูแลก็ดูของคนอื่นไม่ได้ (สัญญา K2.8)
 */
export async function listInbox(ctx: KanbanCtx, userId: string): Promise<InboxItemDto[]> {
  const actorUserId = requireActor(ctx);
  if (actorUserId !== userId) {
    throw new KanbanForbiddenError("ดูกล่องงานเข้าของคนอื่นไม่ได้ — แม้เป็นผู้ดูแลร้านก็ตาม");
  }
  const rows = await prisma.kanbanInboxItem.findMany({
    where: { tenantId: ctx.tenantId, systemId: ctx.systemId, ownerUserId: userId, status: "OPEN" },
    orderBy: { createdAt: "desc" },
    take: KANBAN_LIMITS.inboxOpenMax,
  });
  return rows.map(toDto);
}

// ───────────────────────── เขียน — จดเร็ว ─────────────────────────

/** จดงานเร็วจากช่อง Enter บนหน้า "งานของฉัน" — เจ้าของ = คนกด · source = MANUAL เสมอ */
export async function quickAdd(ctx: KanbanCtx, input: { title: string }): Promise<InboxItemDto> {
  const actorUserId = requireActor(ctx);
  const title = input.title.trim();
  if (!title) throw new Error("พิมพ์ชื่องานก่อนกด Enter");

  const openCount = await prisma.kanbanInboxItem.count({
    where: { tenantId: ctx.tenantId, systemId: ctx.systemId, ownerUserId: actorUserId, status: "OPEN" },
  });
  if (openCount >= KANBAN_LIMITS.inboxOpenMax) {
    throw new Error(`กล่องงานเข้าเต็มแล้ว (สูงสุด ${KANBAN_LIMITS.inboxOpenMax} รายการ) — จัดรายการเก่าก่อนจึงจดใหม่ได้`);
  }

  const row = await prisma.kanbanInboxItem.create({
    data: { tenantId: ctx.tenantId, systemId: ctx.systemId, ownerUserId: actorUserId, title, source: "MANUAL" },
  });
  return toDto(row);
}

// ───────────────────────── เขียน — มาจากภายนอก (§9.2) ─────────────────────────

export type AddFromSourceInput = {
  ownerUserId: string;
  source: string;
  /** idempotency — event/ข้อความซ้ำ (retry ของ consumer) ต้องไม่สร้างรายการที่สอง */
  sourceKey: string;
  title: string;
  /** สรุปจาก AI / เนื้อหาจากต้นทาง (แนบอีเมล/ข้อความแชท) */
  note?: string | null;
  fileIds?: string[];
};

/**
 * รายการที่มาจากภายนอก (แชท/อีเมล/ฟอร์ม/ผู้ช่วย AI · §9.2) — idempotent ด้วย `(tenantId, sourceKey)`
 * ยิงซ้ำ (เช่น consumer ถูก retry) → คืนรายการเดิม ไม่สร้างซ้ำ
 * 🔴 เรียกจาก composition root เท่านั้น (`outbox-consumers.ts`) — `ctx.actorUserId` เป็น `null` ได้
 *    (ระบบเป็นคนทำ ไม่ใช่คนกด) จึงไม่เรียก `requireActor`/เช็คความเป็นเจ้าของแบบ `quickAdd`
 */
export async function addFromSource(ctx: KanbanCtx, input: AddFromSourceInput): Promise<InboxItemDto> {
  const title = input.title.trim();
  if (!title) throw new Error("ชื่องานว่างไม่ได้");
  const sourceKey = input.sourceKey.trim();
  if (!sourceKey) throw new Error("รายการจากภายนอกต้องมี sourceKey เสมอ (กันสร้างซ้ำ)");
  const owner = await prisma.membership.findFirst({
    where: { tenantId: ctx.tenantId, userId: input.ownerUserId, acceptedAt: { not: null } },
    select: { userId: true },
  });
  if (!owner) throw new Error("เจ้าของกล่องงานเข้าต้องเป็นพนักงานของร้านนี้");
  const source: KanbanInboxSource = VALID_SOURCES.has(input.source as KanbanInboxSource) ? (input.source as KanbanInboxSource) : "MANUAL";

  const existing = await prisma.kanbanInboxItem.findFirst({ where: { tenantId: ctx.tenantId, sourceKey } });
  if (existing) return toDto(existing);

  try {
    const row = await prisma.kanbanInboxItem.create({
      data: {
        tenantId: ctx.tenantId,
        systemId: ctx.systemId,
        ownerUserId: input.ownerUserId,
        title,
        note: input.note?.trim() || null,
        source,
        sourceKey,
        fileIds: (input.fileIds ?? []) as Prisma.InputJsonValue,
      },
    });
    return toDto(row);
  } catch {
    // ชนกัน unique(tenantId, sourceKey) เพราะยิงพร้อมกัน (สอง consumer/retry แข่งกัน) — อ่านซ้ำแล้วคืนของเดิม
    const again = await prisma.kanbanInboxItem.findFirst({ where: { tenantId: ctx.tenantId, sourceKey } });
    if (again) return toDto(again);
    throw new Error("บันทึกรายการกล่องงานเข้าไม่สำเร็จ");
  }
}

// ───────────────────────── เขียน — ส่งเข้าบอร์ด ─────────────────────────

export type MoveInboxToBoardInput = {
  itemId: string;
  boardId: string;
  columnId: string;
  dueAt?: Date | null;
  assigneeUserIds?: string[];
};

export type MoveInboxToBoardResult = { ok: true; cardId: string };

/**
 * "ส่งเข้าบอร์ด" — สร้างการ์ดจริงในคอลัมน์ที่เลือก แล้วปิดรายการเป็น MOVED (ใน tx เดียวกัน)
 * ผู้ส่ง (`ctx.actorUserId` = เจ้าของรายการเสมอ) เป็นผู้รับผิดชอบปริยาย · ไฟล์ที่ติดมากับรายการผูกเป็น
 * ไฟล์แนบให้ทันที (อ้าง `FileAsset` เดิม ไม่อัปซ้ำ) · ส่งซ้ำรายการที่ MOVED/DISMISSED ไปแล้ว → throw ไทย
 */
export async function moveToBoard(ctx: KanbanCtx, input: MoveInboxToBoardInput): Promise<MoveInboxToBoardResult> {
  const actorUserId = requireActor(ctx);

  const item = await prisma.kanbanInboxItem.findFirst({
    where: { id: input.itemId, tenantId: ctx.tenantId, systemId: ctx.systemId },
  });
  // มองไม่เห็น = ไม่ใช่ของตัวเอง → 404 เหมือนกัน (ไม่บอกว่ามีอยู่จริงแต่เป็นของคนอื่น — กติกา 404-not-403)
  if (!item || item.ownerUserId !== actorUserId) throw new KanbanNotFoundError("ไม่พบรายการนี้ในกล่องงานเข้าของคุณ");
  if (item.status !== "OPEN") throw new Error("รายการนี้ถูกจัดการไปแล้ว — ส่งเข้าบอร์ดซ้ำไม่ได้");

  // หาบอร์ดจากคอลัมน์จริง ไม่เชื่อ `input.boardId` ที่ผู้เรียกส่งมา (แพตเทิร์นเดียวกับ card-templates.ts)
  const { boardId } = await assertColumnRole(ctx, input.columnId, "EDITOR");
  if (boardId !== input.boardId) throw new KanbanNotFoundError("ไม่พบคอลัมน์นี้ในบอร์ดที่ระบุ");

  const sourceType = CARD_SOURCE_TYPE_OF[item.source] ?? "MANUAL";
  const fileIds = fileIdsOf(item.fileIds);

  // K3.1 — การ์ดที่เกิดจากรายการภายนอกพก `sourceKey` เดียวกับต้นทางไปด้วย (unique(tenantId, sourceKey))
  // 🔴 ตรวจก่อนเข้า tx: ถ้าต้นทางชิ้นนี้เคยกลายเป็นการ์ดไปแล้วทางอื่น (consumer/แชท) การชน unique
  //    ระหว่าง tx จะโผล่เป็น error ดิบให้ผู้ใช้เห็น ⇒ บอกตรง ๆ ว่ามีการ์ดอยู่แล้วดีกว่า
  if (item.sourceKey) {
    const dup = await prisma.kanbanCard.findFirst({
      where: { tenantId: ctx.tenantId, sourceKey: item.sourceKey },
      select: { cardNo: true },
    });
    if (dup) throw new Error(`เรื่องนี้ถูกสร้างเป็นการ์ด${dup.cardNo ? ` #${dup.cardNo}` : ""} ไปแล้ว`);
  }

  const created = await prisma.$transaction(async (tx) => {
    // claim อะตอมมิก — กันกดส่งเข้าบอร์ดพร้อมกัน 2 แท็บสร้างการ์ดซ้ำ (เช็คสถานะนอก tx อาจเพี้ยนได้)
    const claim = await tx.kanbanInboxItem.updateMany({
      where: { id: item.id, tenantId: ctx.tenantId, status: "OPEN" },
      data: { status: "MOVED" },
    });
    if (claim.count === 0) throw new Error("รายการนี้ถูกจัดการไปแล้ว — ส่งเข้าบอร์ดซ้ำไม่ได้");

    const last = await tx.kanbanCard.findFirst({
      where: { columnId: input.columnId, tenantId: ctx.tenantId, systemId: ctx.systemId, status: "ACTIVE", position: { not: null } },
      orderBy: { position: "desc" },
      select: { position: true },
    });
    const position = keyBetween(last?.position ?? null, null);
    const count = await tx.kanbanCard.count({
      where: { columnId: input.columnId, tenantId: ctx.tenantId, systemId: ctx.systemId, status: "ACTIVE" },
    });
    const seq = await tx.$queryRaw<{ cardNoSeq: number }[]>`
      UPDATE "KanbanBoard" SET "cardNoSeq" = "cardNoSeq" + 1 WHERE id = ${boardId} RETURNING "cardNoSeq"
    `;
    const card = await tx.kanbanCard.create({
      data: {
        tenantId: ctx.tenantId,
        systemId: ctx.systemId,
        boardId,
        columnId: input.columnId,
        title: item.title,
        description: item.note ?? null,
        assigneeUserId: actorUserId,
        dueAt: input.dueAt ?? null,
        sortOrder: count,
        position,
        cardNo: seq[0]?.cardNoSeq ?? null,
        sourceType,
        sourceId: item.sourceKey ?? item.id,
        sourceKey: item.sourceKey,
        createdById: actorUserId,
      },
    });
    await tx.kanbanCardAssignee.createMany({
      data: [{ cardId: card.id, userId: actorUserId, tenantId: ctx.tenantId, assignedById: actorUserId }],
      skipDuplicates: true,
    });
    if (fileIds.length > 0) {
      const assets = await tx.fileAsset.findMany({
        where: { id: { in: fileIds }, tenantId: ctx.tenantId },
        select: { id: true, contentType: true, bytes: true, path: true },
      });
      if (assets.length > 0) {
        await tx.kanbanAttachment.createMany({
          data: assets.map((a) => ({
            tenantId: ctx.tenantId,
            cardId: card.id,
            fileId: a.id,
            name: a.path.split("/").pop() || "ไฟล์แนบ",
            contentType: a.contentType,
            bytes: a.bytes,
            uploadedById: actorUserId,
          })),
        });
      }
    }
    await logActivity(tx, {
      tenantId: ctx.tenantId,
      boardId,
      cardId: card.id,
      actorUserId,
      type: "CARD_CREATED",
      data: { title: card.title, columnId: input.columnId, sourceType: card.sourceType, fromInbox: true },
    });
    await emitOutbox(tx, {
      tenantId: ctx.tenantId,
      systemId: ctx.systemId,
      type: "kanban.card.created",
      idempotencyKey: `kanban.card.created#${card.id}`,
      payload: { cardId: card.id, boardId, columnId: input.columnId, cardNo: card.cardNo, title: card.title, sourceType: card.sourceType },
    });
    await tx.kanbanInboxItem.update({ where: { id: item.id }, data: { movedCardId: card.id } });
    return card;
  });

  if (input.assigneeUserIds && input.assigneeUserIds.length > 0) {
    const ids = [...new Set([actorUserId, ...input.assigneeUserIds])];
    await setCardAssignees(ctx, created.id, ids);
  }

  await publishBoardSignal(ctx, boardId, boardSignal({ type: "card.created", boardId, cardId: created.id, columnId: input.columnId }));

  return { ok: true, cardId: created.id };
}

// ───────────────────────── เขียน — ไม่เอาแล้ว ─────────────────────────

/** "ไม่เอาแล้ว" — ปิดรายการโดยไม่สร้างการ์ด (ของตัวเองเท่านั้น · ต้องยัง OPEN) */
export async function dismiss(ctx: KanbanCtx, itemId: string): Promise<{ ok: true }> {
  const actorUserId = requireActor(ctx);
  const res = await prisma.kanbanInboxItem.updateMany({
    where: { id: itemId, tenantId: ctx.tenantId, systemId: ctx.systemId, ownerUserId: actorUserId, status: "OPEN" },
    data: { status: "DISMISSED" },
  });
  if (res.count === 0) throw new KanbanNotFoundError("ไม่พบรายการนี้ในกล่องงานเข้าของคุณ");
  return { ok: true };
}

// ───────────────────────── บอร์ด/คอลัมน์ปลายทางของปุ่ม "ส่งเข้าบอร์ด" ─────────────────────────

export type InboxBoardOption = { id: string; name: string; columns: { id: string; name: string }[] };

/** บอร์ด ACTIVE ที่ `actor` เป็น EDITOR ขึ้นไป (ต้องแก้ได้จริงถึงจะสร้างการ์ดในนั้นได้) พร้อมคอลัมน์ ACTIVE ของแต่ละบอร์ด */
export async function listInboxTargets(ctx: KanbanCtx, actor: KanbanActor): Promise<InboxBoardOption[]> {
  const boards = await prisma.kanbanBoard.findMany({
    where: { AND: [{ tenantId: ctx.tenantId, systemId: ctx.systemId, status: "ACTIVE" }, visibleBoardsWhere(actor)] },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: { id: true, name: true, unitId: true, visibility: true },
  });
  if (boards.length === 0) return [];

  const memberRows = await prisma.kanbanBoardMember.findMany({
    where: { boardId: { in: boards.map((b) => b.id) }, tenantId: ctx.tenantId, userId: actor.userId },
    select: { boardId: true, userId: true, role: true },
  });
  const membersOf = new Map<string, { userId: string; role: "VIEWER" | "EDITOR" | "ADMIN" }[]>();
  for (const m of memberRows) membersOf.set(m.boardId, [...(membersOf.get(m.boardId) ?? []), { userId: m.userId, role: m.role }]);

  const editable = boards.filter((b) => hasBoardRole(boardRole(actor, b, membersOf.get(b.id) ?? []), "EDITOR"));
  if (editable.length === 0) return [];

  const cols = await prisma.kanbanColumn.findMany({
    where: { boardId: { in: editable.map((b) => b.id) }, tenantId: ctx.tenantId, systemId: ctx.systemId, status: "ACTIVE" },
    orderBy: [{ position: "asc" }, { sortOrder: "asc" }],
    select: { id: true, name: true, boardId: true },
  });
  const colsOf = new Map<string, { id: string; name: string }[]>();
  for (const c of cols) colsOf.set(c.boardId, [...(colsOf.get(c.boardId) ?? []), { id: c.id, name: c.name }]);

  return editable.map((b) => ({ id: b.id, name: b.name, columns: colsOf.get(b.id) ?? [] }));
}
