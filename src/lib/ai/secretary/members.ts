// members.ts — ห้องร่วม (ใบ S1.6 · สัญญา docs/modules/31-secretary.md §5.6 + §7 · RESOLUTIONS R-K1 R-K2 R-S1.1c)
//
// สมาชิกห้อง = คนในกิจการที่ผู้เปิดห้องหรือ OWNER ชวนเข้าห้องงาน (แถว `AiRoomMember` · ผู้เปิดห้องไม่มีแถว)
//   เพิ่ม/เอาออก = ผู้เปิดห้อง หรือ OWNER เท่านั้น · สมาชิกออกเองได้ · ห้องที่มองไม่เห็น = not_found (ไม่บอกว่ามีอยู่)
//   ผู้ถูกเพิ่มต้องมี Membership ของกิจการเดียวกันที่รับแล้ว (acceptedAt ≠ null) · เพดาน 20 คน · ห้องปิดแล้วเพิ่มไม่ได้
//   ทุกการเปลี่ยน = ข้อความระบบในห้อง (AiMessage ASSISTANT · authorUserId = "system" · tokens 0) ใน transaction เดียวกับแถว
//   R-S1.6b: ข้อความระบบไม่นับ unread (rooms.listRooms · mobile/conversations) และไม่ป้อนเข้าประวัติของโมเดล (service.sendMessage)
//   R-S1.6c: สมาชิกที่ Membership ถูกถอน (acceptedAt = null) ไม่โผล่ใน listMembers/getRoom · ไม่นับเพดาน · ไม่ได้ push (`roomPushRecipients`)
// seeHistory (COMMON §C.8): สมาชิกที่ seeHistory=false เห็นเฉพาะข้อความ createdAt ≥ addedAt — บังคับในบริการ
//   (`visibleMessagesWhere` ใช้ใน service.listMessages + ประวัติที่ป้อนโมเดลใน sendMessage) ไม่ใช่ใน UI
//   R-S1.6a: ข้อเสนอ/แผนที่เกิดก่อน addedAt ก็มองไม่เห็นเช่นกัน (`visibleSinceFor`/`visibleSinceForUser` ใน proposals.ts · plans.ts)
//   ผู้เปิดห้อง · OWNER · สมาชิก seeHistory=true เห็นทั้งหมด · ห้องเดิม (ไม่มี AiRoom) = เดิม
//
// 🔴 ห้าม import `../service` หรือ `./rooms` (วงกลม: service → members · rooms → members) · ข้อความถึงผู้ใช้เป็นไทย

import type { Prisma, Role } from "@prisma/client";
import { prisma, tenantDb } from "@/lib/core/db";
import { isPhonePlaceholderEmail } from "@/lib/core/phone-auth";
import { actorProblem, type AiMemberActor } from "../actor";
import { conversationCreatorOf, type ConvCtx } from "../conversation-owner";

export const ROOM_MEMBERS_MAX = 20;
/** `AiMessage.authorUserId` ของข้อความระบบในห้อง (🔔 เพิ่ม/เอาออก) — R-S1.6b */
export const SYSTEM_AUTHOR = "system";
/** where ของข้อความที่ไม่ใช่ข้อความระบบ (authorUserId null ต้องผ่าน — `not` ของ Prisma ตัด null ทิ้ง) */
export const NOT_SYSTEM_MESSAGE: Prisma.AiMessageWhereInput = { OR: [{ authorUserId: null }, { authorUserId: { not: SYSTEM_AUTHOR } }] };

export type RoomMemberRow = {
  userId: string;
  name: string;
  role: "OWNER" | "MANAGER" | "STAFF";
  addedById: string;
  addedAt: Date;
  seeHistory: boolean;
};

export type AddMemberError = "not_found" | "forbidden" | "not_member_of_tenant" | "self" | "already" | "limit" | "closed" | "forbidden_chat";
export type RemoveMemberError = "not_found" | "forbidden" | "not_a_member";

const MSG: Record<AddMemberError | RemoveMemberError, string> = {
  not_found: "ไม่พบห้องงานนี้",
  forbidden: "เพิ่มหรือเอาคนออกจากห้องได้เฉพาะผู้เปิดห้องหรือเจ้าของร้าน",
  not_member_of_tenant: "คนนี้ยังไม่ได้เป็นพนักงานของกิจการนี้ — เชิญเข้ากิจการก่อนแล้วค่อยชวนเข้าห้อง",
  self: "คนนี้อยู่ในห้องนี้อยู่แล้วในฐานะผู้เปิดห้อง",
  already: "คนนี้อยู่ในห้องแล้ว",
  limit: `ห้องนี้มีสมาชิกครบ ${ROOM_MEMBERS_MAX} คนแล้ว`,
  closed: "ห้องนี้ปิดงานแล้ว — เปิดห้องใหม่เพื่อชวนคนเพิ่ม",
  not_a_member: "คนนี้ไม่ได้อยู่ในห้องนี้",
  forbidden_chat: "ห้องนี้เป็นเรื่องของลูกค้าในแชท — ชวนได้เฉพาะคนที่มีสิทธิ์ดูแชทของสาขานั้น",
};

const MSG_OWNER_SELF = "คุณเห็นทุกห้องอยู่แล้วในฐานะเจ้าของร้าน — ไม่ต้องเพิ่มตัวเองเข้าห้อง";
const MSG_STARTER_LEAVE = "ผู้เปิดห้องออกไม่ได้ — ปิดห้องแทน";

const fail = <E extends AddMemberError | RemoveMemberError>(error: E, message: string = MSG[error]) => ({ ok: false as const, error, message });

/** ผู้กระทำที่จัดการห้องได้ = คนในร้าน (member) ที่ actor ถูกต้องเท่านั้น (คีย์ API / งานภายใน = มองไม่เห็นห้อง) */
function memberActorOf(ctx: { tenantId: string; actor?: unknown }): AiMemberActor | null {
  if (actorProblem(ctx)) return null;
  const a = ctx.actor as AiMemberActor;
  return a.kind === "member" ? a : null;
}

const cleanId = (v: unknown) => (typeof v === "string" ? v.trim() : "");

/** ชื่อที่แสดง (เหมือนการ์ดห้อง) — ชื่อ → ส่วนหน้าอีเมล → "สมาชิก" */
function displayName(u: { name: string | null; email: string } | null | undefined): string {
  return u?.name?.trim() || (isPhonePlaceholderEmail(u?.email) ? "" : u?.email.split("@")[0]) || "สมาชิก"; // R-Z26: placeholder = เบอร์ ⇒ "สมาชิก" ◂
}

async function namesOf(userIds: string[]): Promise<Map<string, string>> {
  const ids = [...new Set(userIds.filter(Boolean))];
  if (ids.length === 0) return new Map();
  const users = await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, email: true } });
  return new Map(users.map((u) => [u.id, displayName(u)]));
}

type RoomHead = { id: string; conversationId: string; startedById: string; closedAt: Date | null; contextJson?: Prisma.JsonValue | null; members: { userId: string }[] };

/** ห้องของร้านนี้ + ผู้ดูเห็นไหม (R-K1: ผู้เปิด · สมาชิก · OWNER) — ไม่เห็น/ไม่มี/ร้านอื่น = null */
async function visibleRoom(ctx: ConvCtx, roomId: string): Promise<{ actor: AiMemberActor; room: RoomHead } | null> {
  const actor = memberActorOf(ctx);
  const id = cleanId(roomId);
  if (!actor || !id) return null;
  const room = await tenantDb({ tenantId: ctx.tenantId }).aiRoom.findFirst({
    where: { id },
    select: { id: true, conversationId: true, startedById: true, closedAt: true, contextJson: true, members: { select: { userId: true } } },
  });
  if (!room) return null;
  const sees = actor.membership.role === "OWNER" || room.startedById === actor.userId || room.members.some((m) => m.userId === actor.userId);
  return sees ? { actor, room } : null;
}

/** รหัสห้องแชทลูกค้าของห้องเลขา (contextJson) — ไม่มี = null */
function chatContextOf(v: Prisma.JsonValue | null | undefined): string | null {
  const o = v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  const id = typeof o?.chatConversationId === "string" ? o.chatConversationId.trim() : "";
  return id || null;
}

const canManage = (actor: AiMemberActor, room: { startedById: string }) => actor.membership.role === "OWNER" || room.startedById === actor.userId;

const asRole = (r: Role | null | undefined): RoomMemberRow["role"] => (r === "OWNER" || r === "MANAGER" ? r : "STAFF");

/** ผู้ใช้ชุดนี้ที่ยังมี Membership ของร้านนี้ที่รับแล้ว (acceptedAt ≠ null) → role · 1 query */
async function acceptedRoles(db: Prisma.TransactionClient, tenantId: string, userIds: string[]): Promise<Map<string, Role>> {
  const ids = [...new Set(userIds.filter(Boolean))];
  if (ids.length === 0) return new Map();
  const rows = await db.membership.findMany({ where: { tenantId, userId: { in: ids }, acceptedAt: { not: null } }, select: { userId: true, role: true } });
  return new Map(rows.map((m) => [m.userId, m.role]));
}

/**
 * แถวสมาชิกของห้อง (ไม่ตรวจการมองเห็น — ผู้เรียกตรวจแล้ว) · เรียง addedAt เก่า→ใหม่ · ชื่อจาก User · บทบาทจาก Membership ของร้านนี้
 *   R-S1.6c: สมาชิกที่ Membership ถูกถอน (acceptedAt = null / ไม่มีแถว) ไม่แสดง (แถว AiRoomMember ยังอยู่ — รับสิทธิ์คืนแล้วกลับมาเห็น)
 */
export async function roomMemberRows(tenantId: string, roomId: string): Promise<RoomMemberRow[]> {
  const rows = await tenantDb({ tenantId }).aiRoomMember.findMany({
    where: { roomId },
    orderBy: [{ addedAt: "asc" }, { id: "asc" }],
    select: { userId: true, addedById: true, addedAt: true, seeHistory: true },
  });
  if (rows.length === 0) return [];
  const userIds = rows.map((r) => r.userId);
  const [names, roleOf] = await Promise.all([namesOf(userIds), acceptedRoles(prisma, tenantId, userIds)]);
  return rows.filter((r) => roleOf.has(r.userId)).map((r) => ({
    userId: r.userId,
    name: names.get(r.userId) ?? "สมาชิก",
    role: asRole(roleOf.get(r.userId)),
    addedById: r.addedById,
    addedAt: r.addedAt,
    seeHistory: r.seeHistory,
  }));
}

/** สมาชิกห้อง (ไม่รวมผู้เปิดห้อง) — มองไม่เห็นห้อง = null · เรียง addedAt เก่า→ใหม่ */
export async function listMembers(ctx: ConvCtx, roomId: string): Promise<RoomMemberRow[] | null> {
  const v = await visibleRoom(ctx, roomId);
  if (!v) return null;
  return roomMemberRows(ctx.tenantId, v.room.id);
}

/**
 * ผู้รับ push ของห้อง (R-S1.6c) = ผู้เปิดห้อง ∪ สมาชิกห้อง — เฉพาะคนที่ยังมี Membership ของร้านนี้ที่รับแล้ว (acceptedAt ≠ null)
 *   ไม่ตรวจการมองเห็น (ตัวรันเบื้องหลังเรียก) · ห้องไม่มี/ร้านอื่น = [] · 2 query
 */
export async function roomPushRecipients(tenantId: string, roomId: string): Promise<string[]> {
  const id = cleanId(roomId);
  if (!tenantId || !id) return [];
  const room = await tenantDb({ tenantId }).aiRoom.findFirst({ where: { id }, select: { startedById: true, members: { select: { userId: true }, orderBy: { addedAt: "asc" } } } });
  if (!room) return [];
  const all = [...new Set([room.startedById, ...room.members.map((m) => m.userId)].filter((u) => typeof u === "string" && u))];
  const roleOf = await acceptedRoles(prisma, tenantId, all);
  return all.filter((u) => roleOf.has(u));
}

class AddRefused extends Error {
  constructor(readonly code: "closed" | "limit" | "already" | "not_found") {
    super(code);
  }
}

const isUniqueViolation = (e: unknown) => typeof e === "object" && e !== null && (e as { code?: unknown }).code === "P2002";

/**
 * ชวนคนในกิจการเข้าห้อง — ผู้เปิดห้อง/OWNER เท่านั้น
 *   ลำดับตรวจ: มองไม่เห็น (not_found) → ไม่ใช่ผู้ดูแลห้อง (forbidden) → ห้องปิด (closed) → ตัวเอง/ผู้เปิดห้อง (self)
 *   → ไม่มี Membership ที่รับแล้วในร้านนี้ (not_member_of_tenant) → ซ้ำ (already) → ครบ 20 (limit)
 *   เขียนใน tx เดียว: ล็อกแถว AiRoom (FOR UPDATE — เพิ่มพร้อมกันหลายทางไม่ทะลุเพดาน) → ตรวจปิด/จำนวนซ้ำ → แถวสมาชิก
 *   → ข้อความระบบ (สร้างหลังแถว ⇒ createdAt ≥ addedAt — สมาชิกใหม่เห็นข้อความนี้เป็นแถวแรก) → AiRoom.updatedAt
 */
export async function addMember(
  ctx: ConvCtx,
  roomId: string,
  input: { userId: string; seeHistory?: boolean },
): Promise<{ ok: true; member: RoomMemberRow } | { ok: false; error: AddMemberError; message: string }> {
  const v = await visibleRoom(ctx, roomId);
  if (!v) return fail("not_found");
  const { actor, room } = v;
  if (!canManage(actor, room)) return fail("forbidden");
  if (room.closedAt) return fail("closed");
  const userId = cleanId(input?.userId);
  if (userId && userId === actor.userId && actor.membership.role === "OWNER" && userId !== room.startedById) return fail("self", MSG_OWNER_SELF); // R-S1.6d
  if (userId && (userId === actor.userId || userId === room.startedById)) return fail("self");
  if (!userId) return fail("not_member_of_tenant");
  const tenantId = ctx.tenantId;
  const membership = await prisma.membership.findUnique({
    where: { userId_tenantId: { userId, tenantId } },
    select: { role: true, acceptedAt: true, unitAccess: true, permissions: true, user: { select: { name: true, email: true } } },
  });
  if (!membership || membership.acceptedAt === null) return fail("not_member_of_tenant");
  // SEC S3a.1-S2 ▸ R-Z23 (L5 M2): ห้องที่มีบริบทลูกค้า (contextJson.chatConversationId) ⇒ ผู้ถูกเพิ่มต้องเห็นห้องแชทนั้นเอง
  //   (สิทธิ์อ่านแชท + สาขา · `visibleCustomerConversation` ตัวเดียวกับ startRoom) — ไม่งั้นสมาชิกใหม่ได้อ่านบริบทลูกค้าที่ตัวเองไม่มีสิทธิ์ ◂
  const chatConvId = chatContextOf(room.contextJson);
  if (chatConvId) {
    const { visibleCustomerConversation } = await import("./customer-context");
    const target: AiMemberActor = {
      kind: "member",
      tenantId,
      userId,
      membership: {
        role: membership.role,
        unitAccess: Array.isArray(membership.unitAccess) ? (membership.unitAccess as unknown[]).filter((u): u is string => typeof u === "string") : [],
        permissions: (membership.permissions ?? {}) as Record<string, unknown>,
      },
    };
    if (!(await visibleCustomerConversation(tenantId, { chatConversationId: chatConvId }, target))) return fail("forbidden_chat");
  }
  if (room.members.some((m) => m.userId === userId)) return fail("already");
  const seeHistory = input?.seeHistory === true;

  const names = await namesOf([actor.userId]);
  const actorName = names.get(actor.userId) ?? "สมาชิก";
  const memberName = displayName(membership.user);

  try {
    const row = await prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<{ closedAt: Date | null }[]>`
        SELECT "closedAt" FROM "AiRoom" WHERE id = ${room.id} AND "tenantId" = ${tenantId} FOR UPDATE`;
      if (locked.length === 0) throw new AddRefused("not_found");
      if (locked[0].closedAt) throw new AddRefused("closed");
      const existing = await tx.aiRoomMember.findMany({ where: { roomId: room.id, tenantId }, select: { userId: true } });
      if (existing.some((m) => m.userId === userId)) throw new AddRefused("already");
      // R-S1.6c: เพดานนับเฉพาะสมาชิกที่ Membership ยังรับอยู่ (ถูกถอน = ไม่กินที่)
      if ((await acceptedRoles(tx, tenantId, existing.map((m) => m.userId))).size >= ROOM_MEMBERS_MAX) throw new AddRefused("limit");
      const created = await tx.aiRoomMember.create({
        data: { tenantId, roomId: room.id, userId, addedById: actor.userId, seeHistory },
        select: { userId: true, addedById: true, addedAt: true, seeHistory: true },
      });
      await tx.aiMessage.create({
        data: { tenantId, conversationId: room.conversationId, role: "ASSISTANT", content: `🔔 ${actorName} เพิ่ม ${memberName} เข้าห้อง`, tokensIn: 0, tokensOut: 0, authorUserId: SYSTEM_AUTHOR },
      });
      await tx.aiRoom.updateMany({ where: { id: room.id, tenantId }, data: { updatedAt: new Date() } });
      return created;
    });
    return { ok: true, member: { ...row, name: memberName, role: asRole(membership.role) } };
  } catch (e) {
    if (e instanceof AddRefused) return fail(e.code);
    if (isUniqueViolation(e)) return fail("already");
    throw e;
  }
}

/**
 * เอาคนออกจากห้อง — ผู้เปิดห้อง/OWNER เอาใครออกก็ได้ · สมาชิกเอาตัวเองออกได้ (ออกจากห้อง) · คนอื่น = forbidden
 *   ไม่มีแถว (รวมผู้เปิดห้อง ซึ่งไม่มีแถวสมาชิก) = not_a_member · ลบแถว + ข้อความระบบ + AiRoom.updatedAt ใน tx เดียว
 *   ข้อความ: ออกเอง = "🔔 <ชื่อ> ออกจากห้อง" · ถูกเอาออก = "🔔 <ผู้ทำ> นำ <ชื่อ> ออกจากห้อง"
 */
export async function removeMember(
  ctx: ConvCtx,
  roomId: string,
  userId: string,
): Promise<{ ok: true } | { ok: false; error: RemoveMemberError; message: string }> {
  const v = await visibleRoom(ctx, roomId);
  if (!v) return fail("not_found");
  const { actor, room } = v;
  const target = cleanId(userId);
  const leaving = target !== "" && target === actor.userId;
  if (leaving && target === room.startedById) return fail("forbidden", MSG_STARTER_LEAVE); // R-S1.6d
  if (!leaving && !canManage(actor, room)) return fail("forbidden");
  if (!target || !room.members.some((m) => m.userId === target)) return fail("not_a_member");

  const tenantId = ctx.tenantId;
  const names = await namesOf([actor.userId, target]);
  const targetName = names.get(target) ?? "สมาชิก";
  const content = leaving ? `🔔 ${targetName} ออกจากห้อง` : `🔔 ${names.get(actor.userId) ?? "สมาชิก"} นำ ${targetName} ออกจากห้อง`;

  const removed = await prisma.$transaction(async (tx) => {
    const del = await tx.aiRoomMember.deleteMany({ where: { roomId: room.id, userId: target, tenantId } });
    if (del.count === 0) return false;
    await tx.aiMessage.create({
      data: { tenantId, conversationId: room.conversationId, role: "ASSISTANT", content, tokensIn: 0, tokensOut: 0, authorUserId: SYSTEM_AUTHOR },
    });
    await tx.aiRoom.updateMany({ where: { id: room.id, tenantId }, data: { updatedAt: new Date() } });
    return true;
  });
  return removed ? { ok: true } : fail("not_a_member");
}

/**
 * ขอบล่างของเวลาที่ผู้ใช้นี้เห็นในห้องเลขา (COMMON §C.8 · seeHistory · R-S1.6a) — ใช้กับข้อความ · ข้อเสนอ · แผน
 *   สมาชิก (ไม่ใช่ผู้เปิดห้อง · ไม่ใช่ OWNER) ที่ seeHistory=false ⇒ `{ gte: addedAt }` · อื่น ๆ ⇒ null (เห็นทั้งหมด)
 *   ห้องเดิม (ไม่มี AiRoom) / ไม่ใช่สมาชิก ⇒ null — การมองเห็นห้องตัดสินที่ conversations.ts แล้ว ที่นี่จำกัดแค่ช่วงเวลา
 *   OWNER / ผู้เปิดห้อง / ไม่มีผู้ใช้ = ไม่ query · ตัวนี้ใช้กับ "คนกดยืนยัน" (executeProposal/executePlan) ที่มีแค่ role + userId
 */
export async function visibleSinceForUser(
  tenantId: string,
  role: string | null | undefined,
  userId: string | null | undefined,
  conversationId: string | null | undefined,
): Promise<{ gte: Date } | null> {
  const id = cleanId(conversationId);
  const uid = cleanId(userId);
  if (!tenantId || !id || !uid || role === "OWNER") return null;
  const creator = conversationCreatorOf(id);
  if (creator?.kind === "member" && creator.id === uid) return null;
  const row = await tenantDb({ tenantId }).aiRoomMember.findFirst({
    where: { userId: uid, room: { conversationId: id } },
    select: { addedAt: true, seeHistory: true },
  });
  return row && !row.seeHistory ? { gte: row.addedAt } : null;
}

/** `visibleSinceForUser` ของผู้กระทำใน ctx — คีย์ API / งานภายใน / actor เสีย = null (การมองเห็นห้องตัดสินที่อื่น) */
export async function visibleSinceFor(ctx: ConvCtx, conversationId: string | null | undefined): Promise<{ gte: Date } | null> {
  const actor = memberActorOf(ctx);
  if (!actor) return null;
  return visibleSinceForUser(ctx.tenantId, actor.membership.role, actor.userId, conversationId);
}

/** เงื่อนไขเพิ่มของข้อความที่ผู้ดูนี้เห็น — `{ createdAt: { gte: addedAt } }` หรือ `{}` (ดู `visibleSinceFor`) */
export async function visibleMessagesWhere(ctx: ConvCtx, conversationId: string): Promise<Prisma.AiMessageWhereInput> {
  const since = await visibleSinceFor(ctx, conversationId);
  return since ? { createdAt: since } : {};
}

/** แถวนี้ (ข้อเสนอ/แผน/ข้อความ) อยู่ในช่วงที่ผู้ดูเห็นไหม — since null = เห็นทั้งหมด */
export const withinSight = (since: { gte: Date } | null, createdAt: Date) => since === null || createdAt.getTime() >= since.gte.getTime();
