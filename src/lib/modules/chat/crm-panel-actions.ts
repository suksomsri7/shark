"use server";

// crm-panel-actions.ts — server action ของแผงข้าง "CRM" ในห้องแชท (ใบ C1.11 · พิมพ์เขียว §3.18 · ภาพ 26 สมาชิก + ปุ่ม)
//
// 🔴 ตัวเดียวที่ `src/components/chat/crm/ChatCrmPanel.tsx` เรียก · ข้อมูล CRM มาทาง facade `@/lib/modules/crm` เท่านั้น (เส้น chat→crm ใน F2.1)
// 🔴 ด่าน (ทุก action): สิทธิ์อ่านแชท (`requireChatRead` — chat.conversation.read) → ห้องค้นด้วย id + ร้านของ session (AUDIT-CLASS X1)
//    → ระบบ CRM ปลายทาง = ระบบ CRM ตัวแรกของร้าน (createdAt asc · กติกาเดียวกับ crm-bridges/chat.ts จนถึง C2.4) และต้องเปิด CRM ใหม่
//    (`crmUiVersion` = 2 — ไม่ใช่ = ไม่มีข้อมูล ปุ่มเขียนถูกปฏิเสธ ไม่มีอะไรถูกเขียน · กฎถาวร uiVersion) → คีย์ `crm.*` ของผู้ดู
//    → ผู้ติดต่อผ่าน `briefFor` (การมองเห็นของ C1.7 — มองไม่เห็น = ไม่มีชื่อ/บริษัท/ดีล/id ของเขาในผลเลย)
// 🔴 AUDIT-CLASS X8: ผลไม่มีเบอร์/อีเมล · ไม่ log ชื่อ/เบอร์/อีเมล · ไม่มีข้อมูลคลินิก (brief.ts อ่านเฉพาะตาราง Crm*)
// 🔴 "สร้าง lead จากแชท" = คนกดเอง ⇒ ทำงานแม้ `settings.crm.chatToLead` ปิด (มติผู้คุมงาน C1.11 ข้อ 3) · ใช้ตัวเขียนเดียวกับสะพาน
//    (`contacts.leadFromBridge` kind CHAT — ล็อกต่อ Party ⇒ กดพร้อมกันกี่ครั้ง = lead เดียว · มีผู้ติดต่อของ Party แล้ว = ไม่สร้างใหม่)

import { requireChatRead } from "./guard";
import { prisma } from "./db";
import { linkChatContactParty } from "./party-bridge";
import { toMemberActor, type MemberActor } from "@/lib/modules/member";
import * as crm from "@/lib/modules/crm";
import { CHAT_CRM_ACTIVITY_TYPES, type ChatCrmPanelResult } from "./crm-panel-shared";

type Fail = { ok: false; error: string; code?: string };

const NOT_OPEN = "ร้านนี้ยังไม่ได้เปิดใช้ CRM ใหม่ — ปุ่มนี้จะใช้ได้เมื่อเจ้าของร้านเปิด CRM ใหม่";
const NO_KEY = "บัญชีนี้ยังไม่ได้รับสิทธิ์ในระบบ CRM — ขอให้เจ้าของร้านเปิดสิทธิ์ให้ แล้วลองอีกครั้ง";

type Gate = {
  tenantId: string;
  userId: string;
  actor: MemberActor;
  chatContact: { id: string; partyId: string | null; displayName: string | null; phone: string | null; email: string | null } | null;
  /** ระบบ CRM ปลายทาง — null = ร้านไม่มีระบบ CRM หรือระบบตัวแรกยังเป็นหน้าจอเดิม (uiVersion 1) */
  systemId: string | null;
};

class PanelError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "PanelError";
  }
}

async function gate(conversationId: string): Promise<Gate> {
  const auth = await requireChatRead();
  const tenantId = auth.active.tenantId;
  const actor = toMemberActor(auth.user.id, auth.active);
  // SF-2 (รีวิว C1.11): ตัดสิน "เปิด CRM ใหม่ไหม" ก่อนแตะอะไรของแชท — ร้าน v1/ไม่มี CRM = จบที่นี่ (ไม่อ่านห้อง ไม่อ่านผู้ติดต่อแชท)
  //   กฎถาวร uiVersion: ประตูอ่านครั้งเดียวต่อคำขอผ่าน `crmUiVersion` ของระบบปลายทาง (ไม่มีแคช)
  const target = await crm.crmPanelTarget(tenantId);
  const open = target ? (await crm.crmUiVersion({ tenantId, systemId: target.systemId })) === 2 : false;
  if (!open || !target) return { tenantId, userId: auth.user.id, actor, chatContact: null, systemId: null };
  const id = typeof conversationId === "string" ? conversationId.trim() : "";
  const conv = id ? await prisma.chatConversation.findFirst({ where: { id, tenantId }, select: { contactId: true } }) : null;
  if (!conv) throw new PanelError("NOT_FOUND", "ไม่พบห้องแชทนี้ — รีเฟรชหน้าแล้วลองใหม่");
  const chatContact = await prisma.chatContact.findFirst({
    where: { id: conv.contactId, tenantId },
    select: { id: true, partyId: true, displayName: true, phone: true, email: true },
  });
  return { tenantId, userId: auth.user.id, actor, chatContact, systemId: target.systemId };
}

function failOf(e: unknown, fallback: string): Fail {
  if (e instanceof PanelError) return { ok: false, error: e.message, code: e.code };
  const name = e instanceof Error ? e.name : "";
  if (name === "ForbiddenError" || name === "CrmForbiddenError") return { ok: false, error: "บัญชีนี้ยังไม่ได้รับสิทธิ์ทำรายการนี้ — ขอให้เจ้าของร้านเปิดสิทธิ์ให้ แล้วลองอีกครั้ง", code: "FORBIDDEN" };
  const code = e && typeof e === "object" && "code" in e && typeof (e as { code: unknown }).code === "string" ? (e as { code: string }).code : undefined;
  console.error(`[chat.crm-panel] action ล้มเหลว — ${name || "unknown"}`);
  // ข้อความไทยจากบริการ CRM (ไม่มีข้อมูลบุคคล) ส่งต่อได้ · อย่างอื่น = ข้อความกลาง
  if (e instanceof Error && /[ก-๙]/.test(e.message)) return { ok: false, error: e.message, ...(code ? { code } : {}) };
  return { ok: false, error: fallback };
}

const ctxOf = (g: Gate, systemId: string) => ({ tenantId: g.tenantId, systemId, actorUserId: g.userId });

/** แผงข้าง CRM ของห้องที่เปิดอยู่ — `data: null` = ไม่มีอะไรให้แสดง (ร้านยังไม่เปิด CRM ใหม่ · ไม่มีคีย์ CRM) */
export async function getChatCrmPanelAction(conversationId: string): Promise<ChatCrmPanelResult> {
  try {
    const g = await gate(conversationId);
    if (!g.systemId || !crm.crmCan(g.actor, "crm.contact.read")) return { ok: true, data: null };
    const partyId = g.chatContact?.partyId ?? null;
    const brief = partyId
      ? await crm.briefFor(ctxOf(g, g.systemId), g.actor, { partyId })
      : { systemId: g.systemId, contactState: "none" as const, contact: null, company: null, openDeals: [], score: null };
    return {
      ok: true,
      data: {
        systemId: g.systemId,
        contactState: brief.contactState,
        contact: brief.contact ? { id: brief.contact.id, name: brief.contact.name, lifecycleStage: brief.contact.lifecycleStage, leadStatus: brief.contact.leadStatus } : null,
        company: brief.company,
        openDeals: brief.openDeals,
        score: brief.score,
        can: {
          // N-4: เสนอสร้าง lead เฉพาะเมื่อแน่ใจว่าไม่มีผู้ติดต่อของ Party นี้ในระบบ (ไม่ใช่แค่ "มองไม่เห็น")
          createLead: brief.contactState === "none" && !!g.chatContact && crm.crmCan(g.actor, "crm.contact.create"),
          logActivity: !!brief.contact && crm.crmCan(g.actor, "crm.activity.create"),
          openDeal: !!brief.contact && crm.crmCan(g.actor, "crm.deal.create"),
        },
      },
    };
  } catch (e) {
    return failOf(e, "โหลดข้อมูล CRM ของห้องนี้ไม่สำเร็จ — ลองอีกครั้งในอีกสักครู่");
  }
}

/** ปุ่ม "สร้าง lead จากแชท" — ผู้ติดต่อของ Party นี้มีแล้ว = คืนตัวเดิม (created:false) ไม่สร้างซ้ำ */
export async function createLeadFromChatAction(conversationId: string): Promise<{ ok: true; contactId: string; created: boolean } | Fail> {
  try {
    const g = await gate(conversationId);
    if (!g.systemId) return { ok: false, error: NOT_OPEN, code: "FORBIDDEN" };
    if (!crm.crmCan(g.actor, "crm.contact.create")) return { ok: false, error: NO_KEY, code: "FORBIDDEN" };
    const cc = g.chatContact;
    if (!cc) return { ok: false, error: "ไม่พบข้อมูลลูกค้าของห้องนี้ — รีเฟรชหน้าแล้วลองใหม่", code: "NOT_FOUND" };
    let partyId = cc.partyId;
    if (!partyId) {
      // ห้องที่ยังไม่ผูกตัวตนกลาง: Party ชนิดคนจากเบอร์/อีเมลของผู้ติดต่อแชท (ตัวเดียวกับสะพาน C1.8) แล้วผูกผ่านตัวเขียนของแชท
      const found = await crm.contacts.personPartyFor(g.tenantId, { name: cc.displayName, phone: cc.phone, email: cc.email });
      partyId = found ? await linkChatContactParty({ tenantId: g.tenantId, actorUserId: g.userId }, { chatContactId: cc.id, partyId: found }) : null;
    }
    if (!partyId) return { ok: false, error: "ห้องนี้ยังไม่มีเบอร์หรืออีเมลของลูกค้า — ขอเบอร์หรืออีเมลในแชทก่อน แล้วกดสร้าง lead อีกครั้ง", code: "VALIDATION" };
    const ctx = ctxOf(g, g.systemId);
    // SF-6: คนกดเอง ⇒ audit เป็น USER (ผู้กด) · via chat-panel
    const r = await crm.contacts.leadFromBridge(ctx, { kind: "CHAT", name: cc.displayName, phone: cc.phone, email: cc.email, partyId, sourceDetail: { chatContactId: cc.id, via: "chat-panel" }, actorUserId: g.userId, via: "chat-panel" });
    // AUDIT-CLASS X1: ผู้ติดต่อที่ได้ต้องอยู่ในขอบเขตที่ผู้กดมองเห็น — ไม่เห็น = ไม่คืน id/ชื่อ (ไม่สร้างซ้ำอยู่แล้ว)
    const seen = await crm.briefFor(ctx, g.actor, { contactId: r.contactId });
    if (!seen.contact) {
      return r.created
        ? { ok: false, error: "สร้าง lead แล้ว และระบบมอบให้ผู้ดูแลคนอื่น — บัญชีนี้จึงยังเปิดดูไม่ได้ ติดต่อหัวหน้าทีมถ้าต้องดูแลต่อ", code: "NOT_VISIBLE" }
        : { ok: false, error: "ลูกค้ารายนี้มีผู้ดูแลในระบบ CRM อยู่แล้ว — ติดต่อหัวหน้าทีมถ้าต้องการดูแลต่อ", code: "NOT_VISIBLE" };
    }
    return { ok: true, contactId: r.contactId, created: r.created };
  } catch (e) {
    return failOf(e, "สร้าง lead ไม่สำเร็จ — ลองอีกครั้งในอีกสักครู่");
  }
}

/** ปุ่ม "บันทึกกิจกรรม" — บันทึกบนผู้ติดต่อของห้องนี้ (ต้องมีผู้ติดต่อที่มองเห็นได้ก่อน) */
export async function logActivityFromChatAction(
  conversationId: string,
  input: { type: string; title: string; outcome?: string | null; dealId?: string | null },
): Promise<{ ok: true; activityId: string } | Fail> {
  try {
    const g = await gate(conversationId);
    if (!g.systemId) return { ok: false, error: NOT_OPEN, code: "FORBIDDEN" };
    if (!crm.crmCan(g.actor, "crm.activity.create")) return { ok: false, error: NO_KEY, code: "FORBIDDEN" };
    const type = String(input?.type ?? "").toUpperCase();
    if (!CHAT_CRM_ACTIVITY_TYPES.some((t) => t.value === type)) return { ok: false, error: "เลือกชนิดกิจกรรม: โน้ต · โทร · คุยแชท · นัดพบ", code: "VALIDATION" };
    const title = String(input?.title ?? "").trim();
    if (!title) return { ok: false, error: "ใส่หัวข้อกิจกรรมก่อน — เช่น \"ลูกค้าขอใบเสนอราคา\"", code: "VALIDATION" };
    if (title.length > 200) return { ok: false, error: "หัวข้อยาวเกิน 200 ตัวอักษร — ย่อให้สั้นลง", code: "VALIDATION" };
    const partyId = g.chatContact?.partyId ?? null;
    const ctx = ctxOf(g, g.systemId);
    const brief = partyId ? await crm.briefFor(ctx, g.actor, { partyId }) : null;
    if (!brief?.contact) return { ok: false, error: "ลูกค้ารายนี้ยังไม่มีผู้ติดต่อใน CRM ที่บัญชีนี้ดูได้ — กด \"สร้าง lead จากแชท\" ก่อน", code: "NOT_FOUND" };
    const dealId = input?.dealId ? String(input.dealId) : null;
    if (dealId && !brief.openDeals.some((d) => d.id === dealId)) return { ok: false, error: "ดีลที่เลือกไม่ใช่ดีลที่เปิดอยู่ของลูกค้ารายนี้ — เลือกใหม่", code: "VALIDATION" };
    const outcome = input?.outcome ? String(input.outcome).trim() || null : null;
    const r = await crm.activities.logActivity(ctx, g.actor, { type, title, outcome, contactId: brief.contact.id, dealId });
    return { ok: true, activityId: r.id };
  } catch (e) {
    return failOf(e, "บันทึกกิจกรรมไม่สำเร็จ ข้อมูลไม่เปลี่ยน — ลองอีกครั้ง");
  }
}
