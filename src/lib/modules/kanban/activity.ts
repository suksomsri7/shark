// activity.ts — ประวัติกิจกรรมของบอร์ด/การ์ด (K1.10 · พิมพ์เขียว 13-kanban-v2 §3.5 · KANBAN-RUN §K1.10)
//
// 🔴 **append-only**: ไฟล์นี้ export แต่ตัวเขียนเพิ่ม (`logActivity`) กับตัวอ่าน — ไม่มี update/delete
//    ประวัติที่แก้ได้ = ประวัติที่เชื่อไม่ได้ (แถวหายทางเดียวคือการ์ด/บอร์ดถูกลบจริงแล้ว cascade ตามไป)
// 🔴 `logActivity(db|tx, …)` รับ **ตัวเชื่อมฐานข้อมูล** เป็นพารามิเตอร์แรกเสมอ เพื่อให้ผู้เรียกส่ง `tx`
//    ของงานจริงเข้ามาได้ ⇒ "งานสำเร็จแต่ประวัติหาย" (หรือกลับกัน) เกิดไม่ได้เลย
// 🔴 ไม่ใช่ของแทน `AuditLog` กลาง (K1.3 §6.5): เรื่องสิทธิ์/ความปลอดภัยยังเขียน AuditLog เหมือนเดิม
//    ตารางนี้คือ "สายกิจกรรมที่ทีมอ่าน" ในหลังการ์ด/หน้าบอร์ด
// 🔴 อ่านทุกเส้นผ่าน `assertCardRole`/`assertBoardRole` ⇒ บอร์ดที่มองไม่เห็น = 404 (§6.3)
//    ประวัติกิจกรรมรั่ว = ชื่อการ์ด/ชื่อคนของบอร์ดลับรั่ว ซึ่งแย่พอ ๆ กับตัวบอร์ดรั่วเอง
// 🔴 ชื่อ (คอลัมน์/ป้าย/คน/การ์ด) resolve ตอนอ่านแบบ **batch ต่อหน้า** ไม่ใช่ต่อแถว — สายกิจกรรม
//    50 รายการต้องใช้คิวรีคงที่ ไม่ใช่ 50 คิวรี (N+1 ที่โตตามการใช้งานจริงของบอร์ด)

import type { KanbanActivityType, Prisma } from "@prisma/client";
import { prisma } from "./db";
import { assertBoardRole, assertCardRole } from "./members";
import type {
  KanbanActivityDto,
  KanbanActivityNames,
  KanbanCommentDto,
  KanbanCtx,
  KanbanPage,
  KanbanTimelineFilter,
  KanbanTimelineItemDto,
} from "./types";

// ประโยคไทย/ไอคอนอยู่ไฟล์บริสุทธิ์แยก (client component import ไฟล์นี้ไม่ได้ — มี prisma ติดมา)
// re-export ไว้ให้ฝั่ง server เรียกชื่อเดียวกันตามสัญญา §K1.10
export { activityIconName, describeActivity, relativeThaiTime, thaiDayTime } from "./activity-text";
// ตัวเขียนอยู่ `activity-log.ts` (กัน import วนกลับกับ `members.ts` — อ่านเหตุผลในไฟล์นั้น)
// ผู้เรียกยัง `import { logActivity } from "./activity"` ได้เหมือนสัญญาทุกประการ
export { logActivity, type ActivityDb, type LogActivityInput } from "./activity-log";

// ───────────────────────── cursor ─────────────────────────
//
// 🔴 ไม่ใช้ cursor ของ Prisma (อิง id อย่างเดียว) เพราะเราเรียงด้วย `createdAt` เป็นหลัก และ "สายรวม"
//    ต้องใช้ cursor ตัวเดียวกันข้าม 2 ตาราง (ความเห็น + กิจกรรม) ⇒ cursor ต้องเป็น (เวลา, id) เสมอ
//    เทียบแบบ keyset: `createdAt < t OR (createdAt = t AND id < lastId)` — ข้ามหน้าไม่ซ้ำ/ไม่ตกหล่น
//    แม้หลายแถวจะเกิดในมิลลิวินาทีเดียวกัน

type CursorPos = { at: Date; id: string };

function encodeCursor(pos: CursorPos): string {
  return Buffer.from(`${pos.at.toISOString()}|${pos.id}`, "utf8").toString("base64url");
}

function decodeCursor(cursor: string | null | undefined): CursorPos | null {
  if (!cursor) return null;
  try {
    const raw = Buffer.from(cursor, "base64url").toString("utf8");
    const sep = raw.lastIndexOf("|");
    if (sep < 0) return null;
    const at = new Date(raw.slice(0, sep));
    const id = raw.slice(sep + 1);
    if (Number.isNaN(at.getTime()) || !id) return null;
    return { at, id };
  } catch {
    return null; // cursor เพี้ยน/ถูกแก้มือ → เริ่มหน้าแรกใหม่ ดีกว่าโยน error ใส่ผู้ใช้
  }
}

/** เงื่อนไข "เก่ากว่า cursor" (เรียงล่าสุดก่อน) — ใช้ได้กับทั้ง KanbanActivity และ KanbanComment */
function olderThan(pos: CursorPos | null) {
  if (!pos) return {};
  return { OR: [{ createdAt: { lt: pos.at } }, { createdAt: pos.at, id: { lt: pos.id } }] };
}

const DEFAULT_TAKE = 50;
const MAX_TAKE = 200;

function clampTake(take?: number): number {
  if (!take || !Number.isFinite(take) || take < 1) return DEFAULT_TAKE;
  return Math.min(Math.floor(take), MAX_TAKE);
}

// ───────────────────────── resolve ชื่อ (batch) ─────────────────────────

type ActivityRow = {
  id: string;
  boardId: string;
  cardId: string | null;
  actorUserId: string | null;
  type: KanbanActivityType;
  data: Prisma.JsonValue;
  createdAt: Date;
};

function asRecord(value: Prisma.JsonValue): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function idsOf(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

function idOf(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

/**
 * แปลงแถวดิบ → DTO พร้อมชื่อที่ resolve แล้ว (คิวรีคงที่ 4 ตัวต่อหน้า ไม่ว่าจะกี่แถว)
 * ของที่ถูกลบไปแล้วจะไม่มีชื่อ — จอมีประโยคสำรองให้ (`describeActivity`) ไม่โชว์ id ดิบ
 */
async function toDtos(ctx: KanbanCtx, rows: ActivityRow[]): Promise<KanbanActivityDto[]> {
  if (rows.length === 0) return [];
  const userIds = new Set<string>();
  const columnIds = new Set<string>();
  const labelIds = new Set<string>();
  const cardIds = new Set<string>();

  for (const row of rows) {
    if (row.actorUserId) userIds.add(row.actorUserId);
    if (row.cardId) cardIds.add(row.cardId);
    const data = asRecord(row.data);
    for (const u of idsOf(data.userIds)) userIds.add(u);
    for (const l of idsOf(data.labelIds)) labelIds.add(l);
    for (const key of ["columnId", "fromColumnId", "toColumnId"]) {
      const v = idOf(data[key]);
      if (v) columnIds.add(v);
    }
    const single = idOf(data.userId);
    if (single) userIds.add(single);
  }

  const [users, columns, labels, cards] = await Promise.all([
    userIds.size > 0
      ? prisma.user.findMany({ where: { id: { in: [...userIds] } }, select: { id: true, name: true, email: true } })
      : Promise.resolve([]),
    columnIds.size > 0
      ? prisma.kanbanColumn.findMany({
          where: { id: { in: [...columnIds] }, tenantId: ctx.tenantId, systemId: ctx.systemId },
          select: { id: true, name: true },
        })
      : Promise.resolve([]),
    labelIds.size > 0
      ? prisma.kanbanLabel.findMany({
          where: { id: { in: [...labelIds] }, tenantId: ctx.tenantId, systemId: ctx.systemId },
          select: { id: true, name: true },
        })
      : Promise.resolve([]),
    cardIds.size > 0
      ? prisma.kanbanCard.findMany({
          where: { id: { in: [...cardIds] }, tenantId: ctx.tenantId, systemId: ctx.systemId },
          select: { id: true, title: true, cardNo: true },
        })
      : Promise.resolve([]),
  ]);

  const nameOfUser = new Map(users.map((u) => [u.id, u.name ?? u.email ?? u.id]));
  const nameOfColumn = new Map(columns.map((c) => [c.id, c.name]));
  const nameOfLabel = new Map(labels.map((l) => [l.id, l.name]));
  const titleOfCard = new Map(cards.map((c) => [c.id, c.cardNo ? `#${c.cardNo} ${c.title}` : c.title]));

  return rows.map((row) => {
    const data = asRecord(row.data);
    const names: KanbanActivityNames = {};
    const userList = [...idsOf(data.userIds), ...(idOf(data.userId) ? [idOf(data.userId)!] : [])]
      .map((id) => nameOfUser.get(id))
      .filter((n): n is string => typeof n === "string");
    if (userList.length > 0) names.users = userList;
    const labelList = idsOf(data.labelIds)
      .map((id) => nameOfLabel.get(id))
      .filter((n): n is string => typeof n === "string");
    if (labelList.length > 0) names.labels = labelList;
    const from = idOf(data.fromColumnId);
    const to = idOf(data.toColumnId);
    const col = idOf(data.columnId);
    if (from && nameOfColumn.has(from)) names.fromColumn = nameOfColumn.get(from);
    if (to && nameOfColumn.has(to)) names.toColumn = nameOfColumn.get(to);
    if (col && nameOfColumn.has(col)) names.column = nameOfColumn.get(col);
    if (row.cardId && titleOfCard.has(row.cardId)) names.card = titleOfCard.get(row.cardId);

    return {
      id: row.id,
      type: row.type as KanbanActivityDto["type"],
      boardId: row.boardId,
      cardId: row.cardId,
      actor: row.actorUserId
        ? { userId: row.actorUserId, name: nameOfUser.get(row.actorUserId) ?? row.actorUserId }
        : null,
      data,
      names,
      createdAt: row.createdAt.toISOString(),
    };
  });
}

const ACTIVITY_SELECT = {
  id: true,
  boardId: true,
  cardId: true,
  actorUserId: true,
  type: true,
  data: true,
  createdAt: true,
} as const;

const ACTIVITY_ORDER = [{ createdAt: "desc" as const }, { id: "desc" as const }];

/** ตัดหน้าให้ได้ `take` รายการ + cursor ของหน้าถัดไป (อ่านมา take+1 เพื่อรู้ว่ายังมีต่อไหม) */
function paginate<T extends { id: string; createdAt: Date }>(rows: T[], take: number): { page: T[]; nextCursor: string | null } {
  if (rows.length <= take) return { page: rows, nextCursor: null };
  const page = rows.slice(0, take);
  const last = page[page.length - 1]!;
  return { page, nextCursor: encodeCursor({ at: last.createdAt, id: last.id }) };
}

export type ActivityQuery = { take?: number; cursor?: string | null };

// ───────────────────────── อ่าน: สายของการ์ด ─────────────────────────

/** กิจกรรมของการ์ด 1 ใบ — ล่าสุดก่อน · VIEWER อ่านได้ · บอร์ดที่มองไม่เห็น = 404 */
export async function listCardActivity(
  ctx: KanbanCtx,
  cardId: string,
  opts: ActivityQuery = {},
): Promise<KanbanPage<KanbanActivityDto>> {
  await assertCardRole(ctx, cardId, "VIEWER");
  const take = clampTake(opts.take);
  const rows = await prisma.kanbanActivity.findMany({
    where: { cardId, tenantId: ctx.tenantId, ...olderThan(decodeCursor(opts.cursor)) },
    orderBy: ACTIVITY_ORDER,
    take: take + 1,
    select: ACTIVITY_SELECT,
  });
  const { page, nextCursor } = paginate(rows, take);
  return { items: await toDtos(ctx, page), nextCursor };
}

// ───────────────────────── อ่าน: สายของบอร์ด ─────────────────────────

/** กิจกรรมทั้งบอร์ด (รวมระดับบอร์ด + ทุกการ์ด) — ล่าสุดก่อน · VIEWER อ่านได้ */
export async function listBoardActivity(
  ctx: KanbanCtx,
  boardId: string,
  opts: ActivityQuery = {},
): Promise<KanbanPage<KanbanActivityDto>> {
  await assertBoardRole(ctx, boardId, "VIEWER");
  const take = clampTake(opts.take);
  const rows = await prisma.kanbanActivity.findMany({
    where: { boardId, tenantId: ctx.tenantId, ...olderThan(decodeCursor(opts.cursor)) },
    orderBy: ACTIVITY_ORDER,
    take: take + 1,
    select: ACTIVITY_SELECT,
  });
  const { page, nextCursor } = paginate(rows, take);
  return { items: await toDtos(ctx, page), nextCursor };
}

// ───────────────────────── อ่าน: สายรวม (ความเห็น + กิจกรรม) ─────────────────────────

/** `mentions` ใน DB เป็น Json — อ่านออกมาเป็น string[] เสมอ (เหมือน `comments.ts`) */
function toIdList(value: Prisma.JsonValue): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

/**
 * สายรวมของหลังการ์ด — ความเห็น + กิจกรรม เรียงล่าสุดก่อน (แท็บ ทั้งหมด / ความเห็น / กิจกรรม)
 *
 * 🔴 `filter: "all"` **ไม่รวมกิจกรรมชนิด COMMENT_ADDED**: ตัวความเห็นเองอยู่ในสายอยู่แล้ว การโชว์
 *    "เขียนความเห็น" ซ้อนอีกบรรทัดคือข้อมูลซ้ำเปล่า ๆ (Trello ก็ไม่โชว์) — แท็บ "กิจกรรม" ยังเห็น
 *    เพราะแท็บนั้นซ่อนตัวความเห็นไปแล้ว ประวัติจึงต้องบอกว่าเคยมีความเห็นเกิดขึ้น
 * 🔴 cursor ตัวเดียวใช้ได้ทั้ง 2 ตาราง (เป็น (เวลา, id) ล้วน) ⇒ กด "โหลดเพิ่ม" แล้วไม่มีรายการซ้ำ/ตกหล่น
 */
export async function listCardTimeline(
  ctx: KanbanCtx,
  cardId: string,
  opts: { filter?: KanbanTimelineFilter; take?: number; cursor?: string | null } = {},
): Promise<KanbanPage<KanbanTimelineItemDto>> {
  await assertCardRole(ctx, cardId, "VIEWER");
  const filter: KanbanTimelineFilter = opts.filter ?? "all";
  const take = clampTake(opts.take);
  const pos = decodeCursor(opts.cursor);
  const older = olderThan(pos);

  const wantComments = filter === "all" || filter === "comments";
  const wantActivity = filter === "all" || filter === "activity";

  const [commentRows, activityRows] = await Promise.all([
    wantComments
      ? prisma.kanbanComment.findMany({
          where: { cardId, tenantId: ctx.tenantId, deletedAt: null, ...older },
          orderBy: ACTIVITY_ORDER,
          take: take + 1,
        })
      : Promise.resolve([]),
    wantActivity
      ? prisma.kanbanActivity.findMany({
          where: {
            cardId,
            tenantId: ctx.tenantId,
            ...(filter === "all" ? { type: { not: "COMMENT_ADDED" as KanbanActivityType } } : {}),
            ...older,
          },
          orderBy: ACTIVITY_ORDER,
          take: take + 1,
          select: ACTIVITY_SELECT,
        })
      : Promise.resolve([]),
  ]);

  // ชื่อผู้เขียนความเห็น (batch เดียวกับที่ `listComments` ทำ — ไม่ยิงต่อแถว)
  const authorIds = [...new Set(commentRows.map((c) => c.authorUserId))];
  const [authors, activityDtos] = await Promise.all([
    authorIds.length > 0
      ? prisma.user.findMany({ where: { id: { in: authorIds } }, select: { id: true, name: true, email: true } })
      : Promise.resolve([]),
    toDtos(ctx, activityRows),
  ]);
  const nameOfAuthor = new Map(authors.map((u) => [u.id, u.name ?? u.email ?? u.id]));

  const merged: (KanbanTimelineItemDto & { createdAtMs: number })[] = [
    ...commentRows.map((row) => {
      const comment: KanbanCommentDto = {
        id: row.id,
        body: row.body,
        author: { userId: row.authorUserId, name: nameOfAuthor.get(row.authorUserId) ?? row.authorUserId },
        mentions: toIdList(row.mentions),
        createdAt: row.createdAt.toISOString(),
        editedAt: row.editedAt ? row.editedAt.toISOString() : null,
      };
      return {
        kind: "comment" as const,
        id: row.id,
        createdAt: comment.createdAt,
        createdAtMs: row.createdAt.getTime(),
        comment,
      };
    }),
    ...activityDtos.map((activity) => ({
      kind: "activity" as const,
      id: activity.id,
      createdAt: activity.createdAt,
      createdAtMs: Date.parse(activity.createdAt),
      activity,
    })),
  ].sort((a, b) => b.createdAtMs - a.createdAtMs || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0));

  const hasMore = merged.length > take;
  const page = merged.slice(0, take);
  const last = page[page.length - 1];
  return {
    items: page.map(({ createdAtMs: _ms, ...item }) => item),
    nextCursor: hasMore && last ? encodeCursor({ at: new Date(last.createdAtMs), id: last.id }) : null,
  };
}
