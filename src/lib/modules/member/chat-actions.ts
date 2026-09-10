"use server";

// chat-actions.ts — server action ของแผงข้าง "สมาชิก" ในห้องแชท (M1.12 · ภาพ 26 · 28)
//
// 🔴 ตัวเดียวที่ UI (`ChatMemberPanel.tsx`) เรียก — ห้ามให้ client component ยิง `chat-bridge.ts` ตรง
//    (ต้องผ่านด่านสิทธิ์ที่นี่ก่อนเสมอ: `linkContact`/`registerFromChat` facade ไม่รับ actor เอง
//    เพราะถูกออกแบบให้ทั้งระบบภายใน (`chat/service.ts#maybeAutoLinkMember` — ไม่มีคนกด) และ UI
//    (ต้องมีคนกด + มีสิทธิ์) เรียกได้ทั้งคู่ — ด่านสิทธิ์ของฝั่ง UI จึงอยู่ที่ไฟล์นี้)
// 🔴 หา "ระบบสมาชิกของห้องแชทนี้" จาก `ChatSetting.memberSystemId` ตรง ๆ ผ่าน prisma (ไม่เรียกฟังก์ชัน
//    ของโมดูลแชท — F2 ไม่มี edge "member→chat")

import { requireTenant } from "@/lib/core/context";
import { assertCan, ForbiddenError } from "@/lib/core/rbac";
import { prisma } from "./db";
import { canReadMember, hasMemberPerm, toMemberActor, type MemberActor } from "./access";
import { chatPanelFor, linkContact, registerFromChat, type ChatPanelResult, type LinkContactResult, type RegisterFromChatResult } from "./chat-bridge";
import type { MemberCtx } from "./privacy";

async function memberScopeForConversation(tenantId: string, conversationId: string): Promise<{ systemId: string; contactId: string } | null> {
  const conv = await prisma.chatConversation.findFirst({ where: { id: conversationId, tenantId }, select: { systemId: true, contactId: true } });
  if (!conv) return null;
  const setting = await prisma.chatSetting.findUnique({ where: { systemId: conv.systemId }, select: { memberSystemId: true } });
  if (!setting?.memberSystemId) return null;
  return { systemId: setting.memberSystemId, contactId: conv.contactId };
}

async function gate(conversationId: string): Promise<{ ctx: MemberCtx; actor: MemberActor; contactId: string }> {
  const auth = await requireTenant();
  const actor = toMemberActor(auth.user.id, auth.active);
  // ด่านชั้นที่ 1 — เข้าโมดูลสมาชิกได้ไหม (read-โดยนัย) — แบบเดียวกับ `fields-actions.ts#gate`
  //   (F6 authz coverage สแกนหาการเรียก `assertCan` จริง ไม่ใช่แค่ตรวจสตริง — ที่นี่เรียกจริงเหมือนกัน)
  if (!canReadMember(actor)) {
    assertCan(
      { role: auth.active.role, unitAccess: actor.unitAccess, permissions: actor.permissions },
      { module: "member", action: "member.customer.read" },
    );
  }
  const scope = await memberScopeForConversation(auth.active.tenantId, conversationId);
  if (!scope) throw new Error("ห้องแชทนี้ยังไม่ได้เชื่อมกับระบบสมาชิก");
  return { ctx: { tenantId: auth.active.tenantId, systemId: scope.systemId, actorUserId: auth.user.id }, actor, contactId: scope.contactId };
}

const errorReason = (e: unknown, fallback: string) => (e instanceof Error ? e.message : fallback);

export type ChatMemberPanelActionResult = { ok: true; data: ChatPanelResult } | { ok: false; reason: string };

/** โหลดแผงข้าง "สมาชิก" ของห้องแชทที่เปิดอยู่ (ChatMemberPanel.tsx เรียกตอนเปิดห้อง) */
export async function getChatMemberPanelAction(conversationId: string): Promise<ChatMemberPanelActionResult> {
  try {
    const g = await gate(conversationId);
    const data = await chatPanelFor(g.ctx, g.actor, { conversationId });
    return { ok: true, data };
  } catch (e) {
    return { ok: false, reason: errorReason(e, "โหลดข้อมูลสมาชิกไม่สำเร็จ ลองอีกครั้งในอีกสักครู่") };
  }
}

export type LinkContactActionInput = { contactId: string; customerId?: string; method?: "AUTO" | "MANUAL" };
export type LinkContactActionResult = { ok: true; data: LinkContactResult } | { ok: false; reason: string };

/** เลือกผูกจาก candidates หรือกด "ผูกรวม" — ต้องมีสิทธิ์แก้ไขสมาชิก (`member.customer.update`) */
export async function linkContactAction(conversationId: string, input: LinkContactActionInput): Promise<LinkContactActionResult> {
  try {
    const g = await gate(conversationId);
    if (!hasMemberPerm(g.actor, "member.customer.update")) {
      throw new ForbiddenError({ module: "member", action: "member.customer.update" });
    }
    const data = await linkContact(g.ctx, { contactId: input.contactId, customerId: input.customerId, method: input.method ?? "MANUAL" });
    return { ok: true, data };
  } catch (e) {
    return { ok: false, reason: errorReason(e, "ผูกสมาชิกไม่สำเร็จ ลองอีกครั้งในอีกสักครู่") };
  }
}

export type RegisterFromChatActionInput = { contactId: string; firstName?: string; lastName?: string; phone?: string; email?: string };
export type RegisterFromChatActionResult = { ok: true; data: RegisterFromChatResult } | { ok: false; reason: string };

/** ปุ่ม "สมัครใหม่จากแชท" — ต้องมีสิทธิ์เพิ่มสมาชิกใหม่ (`member.customer.create`) */
export async function registerFromChatAction(conversationId: string, input: RegisterFromChatActionInput): Promise<RegisterFromChatActionResult> {
  try {
    const g = await gate(conversationId);
    if (!hasMemberPerm(g.actor, "member.customer.create")) {
      throw new ForbiddenError({ module: "member", action: "member.customer.create" });
    }
    const data = await registerFromChat(g.ctx, g.actor, input);
    return { ok: true, data };
  } catch (e) {
    return { ok: false, reason: errorReason(e, "สมัครสมาชิกไม่สำเร็จ ลองอีกครั้งในอีกสักครู่") };
  }
}
