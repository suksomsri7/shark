// members.ts — ห้องร่วม (ใบ S1.6 · สัญญา docs/modules/31-secretary.md §5.6 + §7 · RESOLUTIONS R-K1 R-K2 R-S1.1c)
//
// สมาชิกห้อง = คนในกิจการที่ผู้เปิดห้องหรือ OWNER ชวนเข้าห้องงาน (แถว `AiRoomMember` · ผู้เปิดห้องไม่มีแถว)
//   เพิ่ม/เอาออก = ผู้เปิดห้อง หรือ OWNER เท่านั้น · สมาชิกออกเองได้ · ห้องที่มองไม่เห็น = not_found (ไม่บอกว่ามีอยู่)
//   ผู้ถูกเพิ่มต้องมี Membership ของกิจการเดียวกันที่รับแล้ว (acceptedAt ≠ null) · เพดาน 20 คน · ห้องปิดแล้วเพิ่มไม่ได้
//   ทุกการเปลี่ยน = ข้อความระบบในห้อง (AiMessage ASSISTANT · authorUserId null · tokens 0) ใน transaction เดียวกับแถว
// seeHistory (COMMON §C.8): สมาชิกที่ seeHistory=false เห็นเฉพาะข้อความ createdAt ≥ addedAt — บังคับในบริการ
//   (`visibleMessagesWhere` ใช้ใน service.listMessages + ประวัติที่ป้อนโมเดลใน sendMessage) ไม่ใช่ใน UI
//   ผู้เปิดห้อง · OWNER · สมาชิก seeHistory=true เห็นทั้งหมด · ห้องเดิม (ไม่มี AiRoom) = เดิม
//
// 🔴 ห้าม import `../service` หรือ `./rooms` (วงกลม: service → members · rooms → members) · ข้อความถึงผู้ใช้เป็นไทย

import type { Prisma, Role } from "@prisma/client";
import { prisma, tenantDb } from "@/lib/core/db";
import { actorProblem, type AiMemberActor } from "../actor";
import { conversationCreatorOf, type ConvCtx } from "../conversation-owner";

export const ROOM_MEMBERS_MAX = 20;

export type RoomMemberRow = {
  userId: string;
  name: string;
  role: "OWNER" | "MANAGER" | "STAFF";
  addedById: string;
  addedAt: Date;
  seeHistory: boolean;
};

export type AddMemberError = "not_found" | "forbidden" | "not_member_of_tenant" | "self" | "already" | "limit" | "closed";
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
};

const fail = <E extends AddMemberError | RemoveMemberError>(error: E) => ({ ok: false as const, error, message: MSG[error] });

/** ผู้กระทำที่จัดการห้องได้ = คนในร้าน (member) ที่ actor ถูกต้องเท่านั้น (คีย์ API / งานภายใน = มองไม่เห็นห้อง) */
function memberActorOf(ctx: { tenantId: string; actor?: unknown }): AiMemberActor | null {
  if (actorProblem(ctx)) return null;
  const a = ctx.actor as AiMemberActor;
  return a.kind === "member" ? a : null;
}

const cleanId = (v: unknown) => (typeof v === "string" ? v.trim() : "");

/** ชื่อที่แสดง (เหมือนการ์ดห้อง) — ชื่อ → ส่วนหน้าอีเมล → "สมาชิก" */
function displayName(u: { name: string | null; email: string } | null | undefined): string {
  return u?.name?.trim() || u?.email.split("@")[0] || "สมาชิก";
}

async function namesOf(userIds: string[]): Promise<Map<string, string>> {
  const ids = [...new Set(userIds.filter(Boolean))];
  if (ids.length === 0) return new Map();
  const users = await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, email: true } });
  return new Map(users.map((u) => [u.id, displayName(u)]));
}

type RoomHead = { id: string; conversationId: string; startedById: string; closedAt: Date | null; members: { userId: string }[] };

/** ห้องของร้านนี้ + ผู้ดูเห็นไหม (R-K1: ผู้เปิด · สมาชิก · OWNER) — ไม่เห็น/ไม่มี/ร้านอื่น = null */
async function visibleRoom(ctx: ConvCtx, roomId: string): Promise<{ actor: AiMemberActor; room: RoomHead } | null> {
  const actor = memberActorOf(ctx);
  const id = cleanId(roomId);
  if (!actor || !id) return null;
  const room = await tenantDb({ tenantId: ctx.tenantId }).aiRoom.findFirst({
    where: { id },
    select: { id: true, conversationId: true, startedById: true, closedAt: true, members: { select: { userId: true } } },
  });
  if (!room) return null;
  const sees = actor.membership.role === "OWNER" || room.startedById === actor.userId || room.members.some((m) => m.userId === actor.userId);
  return sees ? { actor, room } : null;
}

const canManage = (actor: AiMemberActor, room: { startedById: string }) => actor.membership.role === "OWNER" || room.startedById === actor.userId;

const asRole = (r: Role | null | undefined): RoomMemberRow["role"] => (r === "OWNER" || r === "MANAGER" ? r : "STAFF");

/** แถวสมาชิกของห้อง (ไม่ตรวจการมองเห็น — ผู้เรียกตรวจแล้ว) · เรียง addedAt เก่า→ใหม่ · ชื่อจาก User · บทบาทจาก Membership ของร้านนี้ */
export async function roomMemberRows(tenantId: string, roomId: string): Promise<RoomMemberRow[]> {
  const rows = await tenantDb({ tenantId }).aiRoomMember.findMany({
    where: { roomId },
    orderBy: [{ addedAt: "asc" }, { id: "asc" }],
    select: { userId: true, addedById: true, addedAt: true, seeHistory: true },
  });
  if (rows.length === 0) return [];
  const userIds = rows.map((r) => r.userId);
  const [names, memberships] = await Promise.all([
    namesOf(userIds),
    prisma.membership.findMany({ where: { tenantId, userId: { in: userIds } }, select: { userId: true, role: true } }),
  ]);
  const roleOf = new Map(memberships.map((m) => [m.userId, m.role]));
  return rows.map((r) => ({
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
  if (userId && (userId === actor.userId || userId === room.startedById)) return fail("self");
  if (!userId) return fail("not_member_of_tenant");
  const tenantId = ctx.tenantId;
  const membership = await prisma.membership.findUnique({
    where: { userId_tenantId: { userId, tenantId } },
    select: { role: true, acceptedAt: true, user: { select: { name: true, email: true } } },
  });
  if (!membership || membership.acceptedAt === null) return fail("not_member_of_tenant");
  if (room.members.some((m) => m.userId === userId)) return fail("already");
  if (room.members.length >= ROOM_MEMBERS_MAX) return fail("limit");
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
      if (existing.length >= ROOM_MEMBERS_MAX) throw new AddRefused("limit");
      const created = await tx.aiRoomMember.create({
        data: { tenantId, roomId: room.id, userId, addedById: actor.userId, seeHistory },
        select: { userId: true, addedById: true, addedAt: true, seeHistory: true },
      });
      await tx.aiMessage.create({
        data: { tenantId, conversationId: room.conversationId, role: "ASSISTANT", content: `🔔 ${actorName} เพิ่ม ${memberName} เข้าห้อง`, tokensIn: 0, tokensOut: 0, authorUserId: null },
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
      data: { tenantId, conversationId: room.conversationId, role: "ASSISTANT", content, tokensIn: 0, tokensOut: 0, authorUserId: null },
    });
    await tx.aiRoom.updateMany({ where: { id: room.id, tenantId }, data: { updatedAt: new Date() } });
    return true;
  });
  return removed ? { ok: true } : fail("not_a_member");
}

/**
 * เงื่อนไขเพิ่มของข้อความที่ผู้ดูนี้เห็นในห้องเลขา (COMMON §C.8 · seeHistory)
 *   สมาชิก (ไม่ใช่ผู้เปิดห้อง · ไม่ใช่ OWNER) ที่ seeHistory=false ⇒ `{ createdAt: { gte: addedAt } }` · อื่น ๆ ⇒ `{}` (เห็นทั้งหมด)
 *   ห้องเดิม (ไม่มี AiRoom) / ไม่ใช่สมาชิก ⇒ `{}` — การมองเห็นห้องตัดสินที่ conversations.ts แล้ว ที่นี่จำกัดแค่ช่วงเวลา
 *   OWNER / ผู้เปิดห้อง / คีย์ API / งานภายใน = ไม่ query
 */
export async function visibleMessagesWhere(ctx: ConvCtx, conversationId: string): Promise<Prisma.AiMessageWhereInput> {
  const actor = memberActorOf(ctx);
  const id = cleanId(conversationId);
  if (!actor || !id || actor.membership.role === "OWNER") return {};
  const creator = conversationCreatorOf(id);
  if (creator?.kind === "member" && creator.id === actor.userId) return {};
  const row = await tenantDb({ tenantId: ctx.tenantId }).aiRoomMember.findFirst({
    where: { userId: actor.userId, room: { conversationId: id } },
    select: { addedAt: true, seeHistory: true },
  });
  return row && !row.seeHistory ? { createdAt: { gte: row.addedAt } } : {};
}
