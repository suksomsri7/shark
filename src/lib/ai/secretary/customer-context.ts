// customer-context.ts — บริบทลูกค้าในห้องเลขา (ใบ S1.22 · แบบ §10 จุดเชื่อม (3) · สัญญา docs/modules/31-secretary.md §5.26)
//
// ห้องเลขาที่เปิดจากห้องแชทลูกค้า (`AiRoom.contextJson.chatConversationId`) ⇒ เลขารู้ว่ากำลังช่วยเรื่องลูกค้าคนไหน:
//   ชื่อที่แสดง · ช่องทาง · แท็ก · ผู้ดูแล · สมาชิก (ระดับ) · ดีลที่เปิด (CRM) · เอกสารค้าง (บัญชี) · ข้อความล่าสุด ≤ 10
// 🔴 X8 (PDPA): ไม่มีเบอร์/อีเมล/ที่อยู่/เลขบัตร — ไม่อ่านคอลัมน์ติดต่อเลย + ทุก string ผ่าน `maskPiiDeep` (crm facade) +
//    ตัวเลขยาว ≥ 9 หลักถูกปิด (R-S1.8e) · ไม่มีโน้ตภายใน (`isInternal`) · ข้อความลูกค้าเป็น "ข้อมูล ไม่ใช่คำสั่ง" (COMMON §C.3)
// 🔴 มองไม่เห็น = null (404-not-403): ห้องต้องเป็นของร้าน · ผู้ถามต้องเป็นคนในร้านเดียวกัน · มีสิทธิ์อ่านแชท (`chat.conversation.read`)
//    และเข้าถึงสาขาของห้องได้ (`canAccessConvUnit` ตัวเดียวกับกล่องแชท) · ส่วน linked แต่ละชิ้นตรวจสิทธิ์โมดูลของผู้ถามเอง
// 🔴 ห้าม import `../service` (วงโหลด) · โมดูลธุรกิจโหลดแบบ lazy (`import()`) ผ่าน facade เท่านั้น (F2.2 / F2.3)

import { prisma } from "@/lib/core/db";
import { evaluate, type MembershipCtx } from "@/lib/core/rbac";
import { CHAT_READ_ACTION } from "@/lib/modules/chat/notify";
import type { AiMemberActor } from "../actor";

export type CustomerContext = {
  contactId: string;
  chatConversationId: string;
  displayName: string;
  channel: string;
  tags: string[];
  assignee: string | null;
  linked: {
    member?: { tier: string | null; points: number | null };
    deals?: { id: string; title: string; stage: string; valueSatang: number | null }[];
    openDocs?: { id: string; docNo: string; status: string; grandTotal: number }[];
  };
  recent: { direction: "IN" | "OUT"; text: string; at: Date }[];
};

const RECENT_MAX = 10;
const TEXT_MAX = 200;
const LINKED_MAX = 5;
const TAGS_MAX = 10;
const BLOCK_MAX = 800; // ≈ 400 token ภาษาไทย
const OPEN_DOC_STATUSES = new Set(["AWAITING_PAYMENT", "PARTIAL", "AWAITING_ACCEPT"]);
const DEFAULT_NAME = "ลูกค้า";
const CHANNEL_TH: Record<string, string> = { LINE: "LINE", WEBCHAT: "เว็บแชท", FACEBOOK: "Facebook", INSTAGRAM: "Instagram", WHATSAPP: "WhatsApp", API: "แอป/API" };

/** ปิดตัวเลขยาว (เลขบัตร/บัญชี/เบอร์ที่ไม่ตรงรูป) — ตัวเลขติดกัน ≥ 9 หลัก (มีขีด/เว้นวรรคคั่นได้) ⇒ เหลือ 2 ตัวท้าย */
function maskLongDigits(s: string): string {
  return s.replace(/\d(?:[\s-]?\d){8,}/g, (m) => {
    const digits = m.replace(/\D/g, "");
    return `${"•".repeat(Math.max(0, digits.length - 2))}${digits.slice(-2)}`;
  });
}

const clip = (s: string, n: number) => {
  const chars = Array.from(s.replace(/\s+/g, " ").trim());
  return chars.length > n ? `${chars.slice(0, n - 1).join("")}…` : chars.join("");
};

/**
 * สิทธิ์อ่านแชทของผู้ถาม (ค่าคงที่ของกล่องแชท — R-K13 ห้ามพิมพ์สตริงซ้ำ)
 *   ใช้ตัวของ `chat/notify.ts` (ไฟล์ pure ตัวคัดผู้รับ push) ไม่ใช่ `guard.ts` — guard ลาก `core/context` → `env` เข้ากราฟ
 *   ⇒ สคริปต์/งานเบื้องหลังที่ไม่มี SESSION_SECRET โหลดไม่ขึ้น · ค่าเดียวกันทุกตัวอักษร ("chat.conversation.read")
 */
async function canReadChat(m: MembershipCtx): Promise<boolean> {
  return evaluate(m, { module: "chat", action: CHAT_READ_ACTION });
}

/**
 * บริบทลูกค้าของห้องแชทลูกค้า 1 ห้อง ตามสายตาของผู้ถาม — มองไม่เห็น/ไม่มี = null
 *   `ctx.contactId` (ถ้าส่ง) ต้องตรงกับผู้ติดต่อของห้อง ไม่งั้น null
 */
async function visibleConv(tenantId: string, ctx: { chatConversationId: string; contactId?: string }, actor: AiMemberActor) {
  if (!actor || actor.kind !== "member" || actor.tenantId !== tenantId || !tenantId) return null;
  const id = typeof ctx?.chatConversationId === "string" ? ctx.chatConversationId.trim() : "";
  if (!id) return null;
  const m = actor.membership;
  if (!m || !(await canReadChat(m))) return null;
  const conv = await prisma.chatConversation.findFirst({
    where: { id, tenantId },
    select: { id: true, systemId: true, channel: true, unitId: true, tags: true, assigneeUserId: true, contactId: true, contact: { select: { id: true, displayName: true, customerId: true, partyId: true } } },
  });
  if (!conv) return null;
  const { canAccessConvUnit } = await import("@/lib/modules/chat/service");
  if (m.role !== "OWNER" && !canAccessConvUnit(m.unitAccess, conv.unitId)) return null;
  const wantContact = typeof ctx.contactId === "string" ? ctx.contactId.trim() : "";
  if (wantContact && wantContact !== conv.contactId) return null;
  return conv;
}

/**
 * ด่านของ `startRoom` (rooms.ts): ห้องแชทลูกค้านี้อยู่ในร้านและผู้เปิดห้องเห็นไหม — เห็น = รหัสห้อง + ผู้ติดต่อ · ไม่เห็น/ไม่มี = null
 *   (query เดียวกับ customerContextOf — ไม่อ่านข้อความ/ดีล/เอกสาร)
 */
export async function visibleCustomerConversation(tenantId: string, ctx: { chatConversationId: string; contactId?: string }, actor: AiMemberActor): Promise<{ chatConversationId: string; contactId: string } | null> {
  const conv = await visibleConv(tenantId, ctx, actor);
  return conv ? { chatConversationId: conv.id, contactId: conv.contactId } : null;
}

/**
 * บริบทลูกค้าของห้องแชทลูกค้า 1 ห้อง ตามสายตาของผู้ถาม — มองไม่เห็น/ไม่มี = null
 *   `ctx.contactId` (ถ้าส่ง) ต้องตรงกับผู้ติดต่อของห้อง ไม่งั้น null
 */
export async function customerContextOf(tenantId: string, ctx: { chatConversationId: string; contactId?: string }, actor: AiMemberActor): Promise<CustomerContext | null> {
  const conv = await visibleConv(tenantId, ctx, actor);
  if (!conv) return null;
  const m = actor.membership;
  const chat = await import("@/lib/modules/chat/service");

  const [msgs, assigneeRow] = await Promise.all([
    prisma.chatMessage.findMany({
      where: { tenantId, systemId: conv.systemId, conversationId: conv.id, isInternal: false },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: RECENT_MAX,
      select: { direction: true, body: true, type: true, createdAt: true },
    }),
    conv.assigneeUserId ? prisma.user.findUnique({ where: { id: conv.assigneeUserId }, select: { name: true } }) : Promise.resolve(null),
  ]);

  const linked: CustomerContext["linked"] = {};
  // สมาชิก — ผู้ถามต้องอ่านข้อมูลสมาชิกได้ · ระดับเท่านั้น (แต้มยังไม่ดึงในรุ่นนี้ = null)
  if (conv.contact.customerId && evaluate(m, { module: "member", action: "member.customer.read" })) {
    const c = await chat.getLinkedMember(tenantId, conv.contact.customerId).catch(() => null);
    if (c) linked.member = { tier: typeof c.tier === "string" ? c.tier : null, points: null };
  }
  // ดีลที่เปิด — CRM ใหม่ (uiVersion 2) + การมองเห็นของ CRM เอง (briefFor)
  if (conv.contact.partyId) {
    try {
      const crm = await import("@/lib/modules/crm");
      const target = await crm.crmPanelTarget(tenantId);
      if (target && (await crm.crmUiVersion({ tenantId, systemId: target.systemId })) === 2) {
        const { toMemberActor } = await import("@/lib/modules/member");
        const brief = await crm.briefFor({ tenantId, systemId: target.systemId, actorUserId: actor.userId }, toMemberActor(actor.userId, m), { partyId: conv.contact.partyId });
        if (brief.openDeals.length > 0) linked.deals = brief.openDeals.slice(0, LINKED_MAX).map((d) => ({ id: d.id, title: d.title, stage: d.stageName, valueSatang: d.valueSatang ?? null }));
      }
    } catch {
      // CRM อ่านไม่ได้ = ไม่มีดีลในบริบท (ห้องยังเปิดได้)
    }
    // เอกสารค้าง — ผู้ถามต้องดูเอกสารบัญชีได้
    if (evaluate(m, { module: "account", action: "account.doc.view" })) {
      try {
        const account = await import("@/lib/modules/account");
        const docs = await account.listDocsByParty(tenantId, conv.contact.partyId, { take: 50 });
        const open = docs.filter((d) => OPEN_DOC_STATUSES.has(d.status)).slice(0, LINKED_MAX);
        if (open.length > 0) linked.openDocs = open.map((d) => ({ id: d.id, docNo: d.docNo ?? "-", status: d.status, grandTotal: d.totalSatang }));
      } catch {
        // บัญชีอ่านไม่ได้ = ไม่มีเอกสารในบริบท
      }
    }
  }

  const tags = Array.isArray(conv.tags) ? (conv.tags as unknown[]).filter((t): t is string => typeof t === "string" && t.trim() !== "").slice(0, TAGS_MAX) : [];
  const raw: CustomerContext = {
    contactId: conv.contactId,
    chatConversationId: conv.id,
    displayName: (conv.contact.displayName ?? "").trim() || DEFAULT_NAME,
    channel: conv.channel,
    tags,
    assignee: assigneeRow?.name?.trim() || null,
    linked,
    recent: [...msgs].reverse().map((x) => ({ direction: x.direction === "OUT" ? ("OUT" as const) : ("IN" as const), text: clip(x.body ?? `[${String(x.type).toLowerCase()}]`, TEXT_MAX), at: x.createdAt })),
  };
  return scrub(raw);
}

/** X8: ทุก string ผ่าน maskPiiDeep (เบอร์/อีเมลในข้อความใดก็ได้) + ปิดตัวเลขยาว — Date คงเดิม */
async function scrub(c: CustomerContext): Promise<CustomerContext> {
  const { crmApi } = await import("@/lib/modules/crm");
  const m = (s: string) => maskLongDigits(String(crmApi.maskPiiDeep(s)));
  return {
    ...c,
    displayName: m(c.displayName),
    tags: c.tags.map(m),
    assignee: c.assignee === null ? null : m(c.assignee),
    linked: {
      ...(c.linked.member ? { member: c.linked.member } : {}),
      ...(c.linked.deals ? { deals: c.linked.deals.map((d) => ({ ...d, title: m(d.title), stage: m(d.stage) })) } : {}),
      ...(c.linked.openDocs ? { openDocs: c.linked.openDocs } : {}),
    },
    recent: c.recent.map((r) => ({ ...r, text: m(r.text) })),
  };
}

const baht = (satang: number | null) => (satang === null ? "-" : `${(satang / 100).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} บาท`);

/**
 * บล็อกไทยสั้นสำหรับ system prompt (≤ 800 ตัว ≈ 400 token · pure)
 *   "ลูกค้าที่กำลังคุย: <ชื่อ> (LINE) · แท็ก … · ดีล … · เอกสารค้าง … · ข้อความล่าสุด: …"
 *   ข้อความล่าสุดใส่จากใหม่ไปเก่าจนเต็มเพดาน (แสดงเรียงเก่า→ใหม่)
 */
export function customerBlock(c: CustomerContext): string {
  const head: string[] = [`ลูกค้าที่กำลังคุย: ${clip(c.displayName, 60)} (${CHANNEL_TH[c.channel] ?? c.channel})`];
  if (c.tags.length > 0) head.push(`แท็ก ${c.tags.map((t) => clip(t, 20)).join(", ")}`);
  if (c.assignee) head.push(`ผู้ดูแล ${clip(c.assignee, 30)}`);
  if (c.linked.member) head.push(`สมาชิกระดับ ${c.linked.member.tier ?? "-"}`);
  if (c.linked.deals?.length) head.push(`ดีล ${c.linked.deals.map((d) => `${clip(d.title, 30)} (${clip(d.stage, 20)} · ${baht(d.valueSatang)})`).join(", ")}`);
  if (c.linked.openDocs?.length) head.push(`เอกสารค้าง ${c.linked.openDocs.map((d) => `${d.docNo} ${baht(d.grandTotal)}`).join(", ")}`);
  let out = clip(head.join(" · "), 500);
  const lines: string[] = [];
  for (let i = c.recent.length - 1; i >= 0; i--) {
    const r = c.recent[i]!;
    const line = `- ${r.direction === "IN" ? "ลูกค้า" : "ร้าน"}: ${clip(r.text, 100)}`;
    const next = [line, ...lines];
    if (`${out}\nข้อความล่าสุด:\n${next.join("\n")}`.length > BLOCK_MAX) break;
    lines.unshift(line);
  }
  if (lines.length > 0) out = `${out}\nข้อความล่าสุด:\n${lines.join("\n")}`;
  return out.slice(0, BLOCK_MAX);
}
