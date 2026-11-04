// conversations.ts — ตัวอ่านบทสนทนา AI "ที่ผู้ดูนี้เห็น" (CRM C5.5-G2 · กติกาอยู่ที่ ./conversation-owner.ts)
// ทุกประตูที่รับ conversationId จากภายนอก (เว็บ · แอป · REST · หน้าผู้ช่วยของโมดูล · sendMessage) ต้องผ่านที่นี่ —
// มองไม่เห็น = null แบบเดียวกับ "ไม่มีอยู่"
// S1.4 (R-K1) ▸ ห้องเลขาร่วม: ผู้สร้าง ∪ สมาชิกห้อง (`AiRoomMember`) ∪ เจ้าของร้าน (role OWNER · เฉพาะห้องที่มีแถว `AiRoom`)
//   อ่าน DB ที่นี่ที่เดียว (conversation-owner.ts ยังเบา) · ห้องเดิมที่ไม่มี AiRoom = กติกาเดิมทุกตัวอักษร ◂

import { tenantDb } from "@/lib/core/db";
import type { MembershipCtx } from "@/lib/core/rbac";
import { actorProblem } from "./actor";
import {
  canSeeConversation, canSeeConversationId, sightOf, sightOfConfirmer, visibleConversationWhere, withRoomSight,
  type ConvCtx, type ConvSight,
} from "./conversation-owner";

/**
 * S1.4 (R-K1) ▸ sight ของผู้ดู + ห้องเลขาร่วม — 1 query ต่อ request (สมาชิกห้อง) · `tenantRooms` = role OWNER
 *   ผู้กระทำที่ไม่ใช่คนในร้าน (คีย์ API / งานภายใน) หรือ actor เสีย = `sightOf` เดิม (ไม่ query) ◂
 */
export async function roomSightFor(ctx: ConvCtx): Promise<ConvSight> {
  const s = sightOf(ctx);
  if (actorProblem(ctx) || ctx.actor.kind !== "member" || !s.own) return s;
  const rows = await tenantDb({ tenantId: ctx.tenantId }).aiRoomMember.findMany({
    where: { userId: ctx.actor.userId },
    select: { room: { select: { conversationId: true } } },
  });
  return withRoomSight(s, { memberOf: rows.map((r) => r.room.conversationId), tenantRooms: ctx.actor.membership.role === "OWNER" });
}

/** บทสนทนารหัสนี้ ถ้าผู้ดูเห็น (ไม่เห็น / ไม่มี / ร้านอื่น = null) — แถวมี `room` (null = ห้องแชท AI เดิม) */
export async function findVisibleConversation(ctx: ConvCtx, conversationId: string | null | undefined) {
  const id = typeof conversationId === "string" ? conversationId.trim() : "";
  if (!id) return null;
  // ห้องของตัวเอง/ห้องเดิมที่เห็นจากรหัส = ไม่ต้องอ่านสมาชิก (ทางเดิม) · ไม่งั้นค่อยดูห้องร่วม
  const base = sightOf(ctx);
  const s = canSeeConversationId(base, id) ? base : await roomSightFor(ctx);
  if (!canSeeConversationId(s, id) && s.tenantRooms !== true) return null;
  const row = await tenantDb({ tenantId: ctx.tenantId }).aiConversation.findFirst({ where: { id }, include: { room: true } });
  return row && canSeeConversation(s, row) ? row : null;
}

/**
 * S1.4 (R-K1) ▸ ผู้ดูนี้เห็นบทสนทนารหัสนี้ไหม โดยไม่ต้องโหลดแถวบทสนทนา (ประตูยกเลิกข้อเสนอ)
 *   = ตรวจรหัสแบบเดิม · ไม่ผ่าน + เป็นคนในร้าน ⇒ ดูห้องเลขาร่วม ◂
 */
export async function canSeeConversationById(ctx: ConvCtx, conversationId: string | null | undefined): Promise<boolean> {
  if (canSeeConversationId(sightOf(ctx), conversationId)) return true;
  if (actorProblem(ctx) || ctx.actor.kind !== "member") return false;
  return roomAllows(ctx.tenantId, ctx.actor.membership?.role, ctx.actor.userId, conversationId);
}

/**
 * S1.4 (R-K1) ▸ "คนกดยืนยัน" (Membership + userId ของประตูยืนยันข้อเสนอ/แผน) เห็นบทสนทนานี้ไหม
 *   = ตรวจรหัสแบบเดิม (`sightOfConfirmer`) || (บทสนทนามีแถว AiRoom ของร้านนี้ && (role OWNER || เป็นสมาชิกห้อง)) ◂
 */
export async function canConfirmerSeeConversation(
  tenantId: string,
  m: Pick<MembershipCtx, "role">,
  userId: string | null | undefined,
  conversationId: string | null | undefined,
): Promise<boolean> {
  if (canSeeConversationId(sightOfConfirmer(m, userId ?? null), conversationId)) return true;
  return roomAllows(tenantId, m?.role, userId, conversationId);
}

/** ห้องเลขาของร้านนี้ (ตามรหัสบทสนทนา) เปิดให้ผู้ใช้นี้ไหม — OWNER ทุกห้อง · คนอื่นต้องเป็นสมาชิก (1 query) */
async function roomAllows(tenantId: string, role: string | undefined, userId: string | null | undefined, conversationId: string | null | undefined): Promise<boolean> {
  const id = typeof conversationId === "string" ? conversationId : "";
  if (!id || !tenantId) return false;
  const owner = role === "OWNER";
  const uid = typeof userId === "string" && userId ? userId : null;
  if (!owner && !uid) return false;
  const room = await tenantDb({ tenantId }).aiRoom.findFirst({
    where: { conversationId: id },
    select: { id: true, members: { where: { userId: uid ?? "", tenantId }, select: { id: true }, take: 1 } },
  });
  if (!room) return false;
  return owner || room.members.length > 0;
}

/**
 * บทสนทนาล่าสุด **ของผู้ดูเอง** (แชทเว็บเปิดห้องนี้) — ไม่มี = null (เว็บเปิดห้องใหม่)
 * CRM C5.5-G3 (รีวิว G2-5) ▸ เดิม = ห้องล่าสุดที่เห็น ⇒ เจ้าของร้านเปิดแชทแล้วเจอห้องของคีย์ API / งานประจำแทนห้องตัวเอง
 *   ตอนนี้ = ห้องที่ผู้ดูสร้างเองเท่านั้น · ห้องรุ่นเดิม/คีย์/งานประจำยังเปิดได้จากรายการห้อง (แอป) และด้วยรหัสห้อง ◂
 */
export async function latestVisibleConversation(ctx: ConvCtx) {
  const s = sightOf(ctx);
  const own: ConvSight = { own: s.own, ownerExtras: false };
  const rows = await tenantDb({ tenantId: ctx.tenantId }).aiConversation.findMany({
    where: visibleConversationWhere(own),
    orderBy: { updatedAt: "desc" },
    take: 10,
  });
  return rows.find((r) => canSeeConversationId(own, r.id)) ?? null;
}
