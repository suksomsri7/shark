// comments.ts — ความเห็นในการ์ด + @mention (K1.8 · พิมพ์เขียว 13-kanban-v2 §3.4 · KANBAN-RUN §K1.8)
//
// markup ของ mention ในเนื้อความ = `@[ชื่อ](userId)` — เก็บชื่อไว้ในข้อความด้วยตั้งใจ:
// ชื่อคือค่า ณ เวลาที่พิมพ์ ⇒ คนเปลี่ยนชื่อ/ลาออกทีหลัง ข้อความเก่ายังอ่านรู้เรื่อง
// ส่วน `mentions` (Json string[]) = userId ที่ถอดจาก markup แล้ว **กรองเหลือเฉพาะพนักงานจริงของร้าน**
//
// 🔴 เขียนความเห็น = EDITOR ขึ้นไปของบอร์ด (`assertCardRole … "EDITOR"`) — มองไม่เห็นบอร์ด = 404 (§6.3)
// 🔴 แก้ได้เฉพาะผู้เขียน (แม้ OWNER ก็แก้คำพูดคนอื่นไม่ได้) · ลบได้ผู้เขียนหรือ ADMIN ของบอร์ด
// 🔴 ลบ = soft delete (`deletedAt`) — ประวัติกิจกรรม (K1.10) ต้องยังอ้างถึงได้
// 🔴 แจ้งเตือนยิง "ตรงคน" ผ่าน `notify.ts` (in-app + push รายคน + อีเมล) ไม่มีประกาศทั้งร้าน
//    คนที่ถูก mention แต่ยังมองไม่เห็นบอร์ด (PRIVATE) → ได้สิทธิ์ VIEWER อัตโนมัติ + บอกไว้ในข้อความ
//    ไม่งั้นแจ้งเตือนจะพาเขาไปหน้า 404 ซึ่งแย่กว่าไม่แจ้ง

import type { KanbanComment } from "@prisma/client";
import { emitOutbox } from "@/lib/core/outbox";
import { scheduleDrain } from "@/lib/outbox-consumers";
import { KanbanForbiddenError, KanbanNotFoundError } from "./access";
import { prisma } from "./db";
import { KANBAN_LIMITS } from "./limits";
import { assertBoardRole, assertCardRole, grantViewerForMention } from "./members";
import { cardLink, notifyKanbanUser } from "./notify";
import type { KanbanCommentDto, KanbanCtx } from "./types";

/** `@[ชื่อ](userId)` — ชื่อห้ามมี `]` และห้ามข้ามบรรทัด · userId เป็น cuid (ตัวอักษร/เลข/-/_) */
const MENTION_RE = /@\[([^\]\n]{1,80})\]\(([A-Za-z0-9_-]{1,64})\)/g;

/** userId ทั้งหมดที่ถูกพูดถึงในข้อความ (ตามลำดับที่พิมพ์ · ไม่ซ้ำ) — ยังไม่ตรวจว่ามีตัวตนจริง */
export function parseMentionIds(body: string): string[] {
  const ids: string[] = [];
  for (const m of body.matchAll(MENTION_RE)) {
    const id = m[2]!;
    if (!ids.includes(id)) ids.push(id);
  }
  return ids;
}

/**
 * กรอง mention ให้เหลือเฉพาะ "พนักงานจริงของร้านนี้" (Membership ที่ accepted แล้ว)
 * 🔴 ด่านนี้สำคัญ: `mentions` ถูกใช้เป็นรายชื่อ "คนที่จะได้สิทธิ์ดูบอร์ดอัตโนมัติ" ⇒ ถ้าปล่อยให้ใครก็ตาม
 *    ยัด userId มั่ว ๆ ในเนื้อความได้ ก็เท่ากับเปิดบอร์ดลับให้ id ที่เดาไว้ล่วงหน้า
 */
async function resolveMentions(tenantId: string, body: string): Promise<string[]> {
  const ids = parseMentionIds(body);
  if (ids.length === 0) return [];
  const rows = await prisma.membership.findMany({
    where: { tenantId, userId: { in: ids }, acceptedAt: { not: null } },
    select: { userId: true },
  });
  const ok = new Set(rows.map((r) => r.userId));
  return ids.filter((id) => ok.has(id));
}

function normalizeBody(raw: string): string {
  const body = raw.trim();
  if (!body) throw new Error("ต้องพิมพ์ข้อความก่อนจึงส่งความเห็นได้");
  if (body.length > KANBAN_LIMITS.commentMaxChars) {
    throw new Error(`ความเห็นยาวเกิน ${KANBAN_LIMITS.commentMaxChars} ตัวอักษร — ตัดให้สั้นลงก่อนส่ง`);
  }
  return body;
}

/** ความเห็นต้องอยู่ในร้านของ ctx และการ์ดต้นทางต้องอยู่ใน systemId เดียวกัน (defense-in-depth) */
async function requireComment(
  ctx: KanbanCtx,
  commentId: string,
): Promise<{ id: string; cardId: string; authorUserId: string; body: string; mentions: string[]; deletedAt: Date | null }> {
  const row = await prisma.kanbanComment.findFirst({
    where: { id: commentId, tenantId: ctx.tenantId, card: { systemId: ctx.systemId } },
    select: { id: true, cardId: true, authorUserId: true, body: true, mentions: true, deletedAt: true },
  });
  if (!row) throw new KanbanNotFoundError("ไม่พบความเห็นนี้");
  return { ...row, mentions: toIdList(row.mentions) };
}

/** `mentions` ใน DB เป็น Json — อ่านออกมาเป็น string[] เสมอ (แถวเก่า/ค่าแปลก ๆ → []) */
function toIdList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

/**
 * แจ้งคนที่ถูก mention (ยกเว้นผู้เขียนเอง) — คนละใบต่อคน ยิงตรงคนเสมอ
 * คนที่ยังมองไม่เห็นบอร์ด → ให้สิทธิ์ VIEWER ก่อน แล้วบอกไว้ในข้อความว่าได้สิทธิ์ดูมาแล้ว
 */
async function notifyMentions(
  ctx: KanbanCtx,
  args: { cardId: string; boardId: string; authorUserId: string; targets: string[] },
): Promise<void> {
  const targets = args.targets.filter((u) => u !== args.authorUserId);
  if (targets.length === 0) return;
  const [card, board, author] = await Promise.all([
    prisma.kanbanCard.findFirst({ where: { id: args.cardId, tenantId: ctx.tenantId }, select: { title: true } }),
    prisma.kanbanBoard.findFirst({ where: { id: args.boardId, tenantId: ctx.tenantId }, select: { name: true } }),
    prisma.user.findUnique({ where: { id: args.authorUserId }, select: { name: true, email: true } }),
  ]);
  const who = author?.name ?? author?.email ?? "เพื่อนร่วมงาน";
  const link = cardLink(ctx.systemId, args.boardId, args.cardId);
  for (const userId of targets) {
    // ให้สิทธิ์ก่อนแจ้ง — ถ้าให้ไม่ได้ (บอร์ดเต็ม/ไม่มีสิทธิ์โมดูล) ก็ยังแจ้งตามปกติ
    const granted = await grantViewerForMention(ctx, args.boardId, userId).catch(() => false);
    await notifyKanbanUser({
      tenantId: ctx.tenantId,
      systemId: ctx.systemId,
      recipientUserId: userId,
      title: "มีคนพูดถึงคุณในการ์ด",
      body:
        `${who} พูดถึงคุณในการ์ด "${card?.title ?? "งาน"}"${board ? ` · บอร์ด ${board.name}` : ""} · ${link}` +
        (granted ? " · คุณได้รับสิทธิ์ดูบอร์ดนี้แล้ว (ผู้ดู)" : ""),
      data: { cardId: args.cardId, boardId: args.boardId, systemId: ctx.systemId },
      email: true,
    });
  }
}

// ───────────────────────── เขียน ─────────────────────────

/**
 * เพิ่มความเห็น (EDITOR+ ของบอร์ด) → แจ้งคนที่ถูก mention + ยิง outbox `kanban.comment.added`
 * idempotencyKey = `kanban.comment.added#<commentId>` (ความเห็น 1 ใบ = event 1 ใบตลอดกาล)
 * payload ไม่มี `tenantId` — ร้านอยู่ในตัว OutboxEvent อยู่แล้ว (ซ้ำ = ให้โอกาสหลุดข้ามร้าน)
 */
export async function addComment(ctx: KanbanCtx, cardId: string, rawBody: string): Promise<KanbanComment> {
  const { boardId } = await assertCardRole(ctx, cardId, "EDITOR");
  const authorUserId = ctx.actorUserId;
  if (!authorUserId) throw new KanbanForbiddenError("ต้องเข้าสู่ระบบก่อนจึงเขียนความเห็นได้");
  const body = normalizeBody(rawBody);
  const mentions = await resolveMentions(ctx.tenantId, body);

  const comment = await prisma.$transaction(async (tx) => {
    const row = await tx.kanbanComment.create({
      data: { tenantId: ctx.tenantId, cardId, authorUserId, body, mentions },
    });
    await emitOutbox(tx, {
      tenantId: ctx.tenantId,
      type: "kanban.comment.added",
      idempotencyKey: `kanban.comment.added#${row.id}`,
      payload: { commentId: row.id, cardId, boardId, authorUserId, mentions },
      systemId: ctx.systemId,
    });
    return row;
  });
  scheduleDrain();

  await notifyMentions(ctx, { cardId, boardId, authorUserId, targets: mentions });
  return comment;
}

/**
 * แก้ความเห็นของตัวเอง — `editedAt` ประทับเสมอ · `mentions` คำนวณใหม่จากข้อความใหม่
 * คนที่ "เพิ่งถูกเพิ่มเข้ามาใน mention" ได้แจ้งเตือนเหมือนตอนเขียนใหม่ (ไม่งั้นถูกพูดถึงแล้วไม่มีใครรู้)
 */
export async function editComment(ctx: KanbanCtx, commentId: string, rawBody: string): Promise<KanbanComment> {
  const current = await requireComment(ctx, commentId);
  const { boardId } = await assertCardRole(ctx, current.cardId, "EDITOR");
  if (!ctx.actorUserId || current.authorUserId !== ctx.actorUserId) {
    throw new KanbanForbiddenError("แก้ได้เฉพาะความเห็นที่ตัวเองเขียน");
  }
  if (current.deletedAt) throw new KanbanNotFoundError("ความเห็นนี้ถูกลบไปแล้ว");
  const body = normalizeBody(rawBody);
  const mentions = await resolveMentions(ctx.tenantId, body);

  const updated = await prisma.kanbanComment.update({
    where: { id: current.id },
    data: { body, mentions, editedAt: new Date() },
  });
  const added = mentions.filter((u) => !current.mentions.includes(u));
  await notifyMentions(ctx, { cardId: current.cardId, boardId, authorUserId: current.authorUserId, targets: added });
  return updated;
}

/** ลบความเห็น (ผู้เขียน หรือ ADMIN ของบอร์ด) — soft delete เสมอ · ลบซ้ำไม่ error */
export async function deleteComment(ctx: KanbanCtx, commentId: string): Promise<void> {
  const current = await requireComment(ctx, commentId);
  const card = await prisma.kanbanCard.findFirst({
    where: { id: current.cardId, tenantId: ctx.tenantId, systemId: ctx.systemId },
    select: { boardId: true },
  });
  if (!card) throw new KanbanNotFoundError("ไม่พบการ์ดนี้");
  const { role } = await assertBoardRole(ctx, card.boardId, "VIEWER");
  const isAuthor = !!ctx.actorUserId && current.authorUserId === ctx.actorUserId;
  if (!isAuthor && role !== "ADMIN") {
    throw new KanbanForbiddenError("ลบได้เฉพาะความเห็นของตัวเอง — ความเห็นของคนอื่นต้องเป็นผู้ดูแลบอร์ด");
  }
  if (current.deletedAt) return;
  await prisma.kanbanComment.update({ where: { id: current.id }, data: { deletedAt: new Date() } });
}

// ───────────────────────── อ่าน ─────────────────────────

/** ความเห็นทั้งหมดของการ์ด เรียงเก่า→ใหม่ (ไม่รวมที่ถูกลบ) — VIEWER อ่านได้ */
export async function listComments(ctx: KanbanCtx, cardId: string): Promise<KanbanCommentDto[]> {
  await assertCardRole(ctx, cardId, "VIEWER");
  const rows = await prisma.kanbanComment.findMany({
    where: { cardId, tenantId: ctx.tenantId, deletedAt: null },
    orderBy: { createdAt: "asc" },
  });
  if (rows.length === 0) return [];
  const userIds = Array.from(new Set(rows.map((r) => r.authorUserId)));
  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, name: true, email: true },
  });
  const nameOf = new Map(users.map((u) => [u.id, u.name ?? u.email ?? u.id]));
  return rows.map((r) => ({
    id: r.id,
    body: r.body,
    author: { userId: r.authorUserId, name: nameOf.get(r.authorUserId) ?? r.authorUserId },
    mentions: toIdList(r.mentions),
    createdAt: r.createdAt.toISOString(),
    editedAt: r.editedAt ? r.editedAt.toISOString() : null,
  }));
}

/** จำนวนความเห็นของการ์ด 1 ใบ (ตราท้ายการ์ด — ใช้ตอนคืนการ์ดเดี่ยวจาก action) */
export async function commentCountOfCard(ctx: KanbanCtx, cardId: string): Promise<number> {
  await assertCardRole(ctx, cardId, "VIEWER");
  return prisma.kanbanComment.count({ where: { cardId, tenantId: ctx.tenantId, deletedAt: null } });
}

/**
 * รายชื่อ "คนที่ mention ได้" = พนักงานของร้านนี้ที่ยัง accepted (เมนู `@` ในกล่องเขียนความเห็น)
 * 🔴 ผูกกับบอร์ดเสมอ: ต้องมองเห็นบอร์ดใบนั้นก่อนถึงจะขอรายชื่อได้ (ห้ามใช้เป็นช่องดูดรายชื่อพนักงาน)
 */
export async function listMentionTargets(
  ctx: KanbanCtx,
  boardId: string,
): Promise<{ userId: string; name: string }[]> {
  await assertBoardRole(ctx, boardId, "VIEWER");
  const rows = await prisma.membership.findMany({
    where: { tenantId: ctx.tenantId, acceptedAt: { not: null } },
    select: { userId: true, user: { select: { name: true, email: true } } },
  });
  return rows
    .map((r) => ({ userId: r.userId, name: r.user.name ?? r.user.email ?? r.userId }))
    .sort((a, b) => a.name.localeCompare(b.name, "th"));
}
