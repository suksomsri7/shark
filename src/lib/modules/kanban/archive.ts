// archive.ts — "คลังเก็บ" ของบอร์ด (K1.14 · แบบ §5.3 หน้า 11 · คำไทย §5.5 "เก็บเข้าคลัง" ห้ามใช้ "ลบ")
//
// หน้าที่: อ่านรายการของที่ถูกเก็บ (การ์ด + คอลัมน์) ของบอร์ดใบเดียว · กู้คืนคอลัมน์
// (กู้คืนการ์ดใช้ `cards.restoreCard` ที่มีอยู่แล้วตั้งแต่ K1.6 — ไม่ทำซ้ำ)
//
// 🔴 สิทธิ์: อ่าน = VIEWER (เป็นการอ่านล้วน) · กู้คืนคอลัมน์ = ADMIN (คู่กับ `archiveColumn` ตาม D16)
//    บอร์ดที่ผู้ใช้มองไม่เห็น → `KanbanNotFoundError` (404 ไม่ใช่ 403 · §6.3) — มาจาก `assertBoardRole`
// 🔴 ค้นหา: `contains` ของ Prisma escape `%`/`_` ให้เองอยู่แล้ว (คนละทางกับ raw ILIKE ที่ K1.11 เจอปัญหา)

import { prisma } from "./db";
import { KANBAN_LIMITS } from "./limits";
import { assertBoardRole, assertColumnRole } from "./members";
import { keyBetween } from "./ordering";
import { logActivity } from "./activity-log";
import { publishBoardSignal, boardSignal } from "./realtime";
import type { ArchivedCardDto, ArchivedColumnDto, ArchiveListDto, KanbanCtx } from "./types";

/**
 * รายการในคลังของบอร์ด — การ์ดและคอลัมน์ที่ถูกเก็บ เรียง "ล่าสุดก่อน"
 * `q` กรองเฉพาะชื่อการ์ด/ชื่อคอลัมน์ (ไม่ค้นในรายละเอียด — หน้าคลังคือที่ "หาของที่เผลอเก็บ" ไม่ใช่ search engine)
 */
export async function listArchived(
  ctx: KanbanCtx,
  boardId: string,
  opts: { q?: string } = {},
): Promise<ArchiveListDto> {
  await assertBoardRole(ctx, boardId, "VIEWER");
  const q = opts.q?.trim() ?? "";
  const like = q ? { contains: q, mode: "insensitive" as const } : undefined;

  const [cardRows, columnRows] = await Promise.all([
    prisma.kanbanCard.findMany({
      where: {
        boardId,
        tenantId: ctx.tenantId,
        systemId: ctx.systemId,
        status: "ARCHIVED",
        ...(like ? { title: like } : {}),
      },
      orderBy: [{ archivedAt: "desc" }, { updatedAt: "desc" }],
      take: KANBAN_LIMITS.archivePageSize,
      select: {
        id: true,
        cardNo: true,
        title: true,
        archivedAt: true,
        archivedById: true,
        column: { select: { name: true } },
      },
    }),
    prisma.kanbanColumn.findMany({
      where: {
        boardId,
        tenantId: ctx.tenantId,
        systemId: ctx.systemId,
        status: "ARCHIVED",
        ...(like ? { name: like } : {}),
      },
      orderBy: [{ archivedAt: "desc" }, { updatedAt: "desc" }],
      take: KANBAN_LIMITS.archivePageSize,
      select: { id: true, name: true, archivedAt: true, _count: { select: { cards: true } } },
    }),
  ]);

  // ชื่อคนที่กดเก็บ — ดึงเป็นก้อนเดียว (N+1 บนหน้าที่มีของเป็นร้อยใบคือคำขอ DB เป็นร้อยครั้ง)
  const byIds = [...new Set(cardRows.map((c) => c.archivedById).filter((v): v is string => !!v))];
  const users = byIds.length
    ? await prisma.user.findMany({ where: { id: { in: byIds } }, select: { id: true, name: true, email: true } })
    : [];
  const nameOf = new Map(users.map((u) => [u.id, u.name?.trim() || u.email]));

  const cards: ArchivedCardDto[] = cardRows.map((c) => ({
    id: c.id,
    cardNo: c.cardNo,
    title: c.title,
    archivedAt: c.archivedAt?.toISOString() ?? null,
    archivedBy: c.archivedById ? { userId: c.archivedById, name: nameOf.get(c.archivedById) ?? "ผู้ใช้ที่ถูกลบ" } : null,
    columnName: c.column?.name ?? null,
  }));

  const columns: ArchivedColumnDto[] = columnRows.map((c) => ({
    id: c.id,
    name: c.name,
    archivedAt: c.archivedAt?.toISOString() ?? null,
    cardCount: c._count.cards,
  }));

  return { cards, columns };
}

/**
 * กู้คืนคอลัมน์ — กลับมาเป็น ACTIVE ที่ **ท้ายบอร์ด** เสมอ
 *
 * 🔴 ทำไมท้ายบอร์ดไม่ใช่ตำแหน่งเดิม: ระหว่างที่มันอยู่ในคลัง คนอื่นสลับ/เพิ่มคอลัมน์ไปแล้ว
 *    "ตำแหน่งเดิม" ที่จำไว้จึงหมายถึงที่คนละที่กับตอนเก็บ · ท้ายบอร์ดคือที่ที่ไม่ทำให้ผังของคนอื่นเลื่อน
 *    (การ์ดในคอลัมน์ที่กู้คืนยังผูกกับคอลัมน์เดิมอยู่แล้ว — กลับมาพร้อมกันทั้งกอง)
 */
export async function restoreColumn(ctx: KanbanCtx, columnId: string): Promise<{ ok: true; boardId: string }> {
  const { boardId } = await assertColumnRole(ctx, columnId, "ADMIN");

  const last = await prisma.kanbanColumn.findFirst({
    where: { boardId, tenantId: ctx.tenantId, systemId: ctx.systemId, status: "ACTIVE", position: { not: null } },
    orderBy: { position: "desc" },
    select: { position: true },
  });
  const position = keyBetween(last?.position ?? null, null);

  await prisma.$transaction(async (tx) => {
    const col = await tx.kanbanColumn.findFirst({
      where: { id: columnId, tenantId: ctx.tenantId, systemId: ctx.systemId, status: "ARCHIVED" },
      select: { id: true, name: true },
    });
    if (!col) return; // กดกู้คืนซ้ำจากอีกแท็บ = ไม่ใช่ error ของผู้ใช้ (idempotent)
    const nextSort = await tx.kanbanColumn.count({
      where: { boardId, tenantId: ctx.tenantId, systemId: ctx.systemId, status: "ACTIVE" },
    });
    await tx.kanbanColumn.updateMany({
      where: { id: columnId, tenantId: ctx.tenantId, systemId: ctx.systemId },
      data: { status: "ACTIVE", archivedAt: null, position, sortOrder: nextSort },
    });
    await logActivity(tx, {
      tenantId: ctx.tenantId,
      boardId,
      actorUserId: ctx.actorUserId ?? null,
      // ยังไม่มีชนิด COLUMN_RESTORED ในเอนัม (การเพิ่มค่าเอนัม = ไมเกรชันที่ P1 ไม่ต้องการ) —
      // ใช้ COLUMN_UPDATED + ธง `restored` แล้วให้ `activity-text.ts` อ่านเป็นประโยค "กู้คืนคอลัมน์ …"
      type: "COLUMN_UPDATED",
      data: { columnId, name: col.name, restored: true },
    });
  });

  // หลัง commit เท่านั้น (ดูหัวไฟล์ realtime.ts ข้อ 2)
  await publishBoardSignal(ctx, boardId, boardSignal({ type: "column.changed", boardId, columnId }));
  return { ok: true, boardId };
}
