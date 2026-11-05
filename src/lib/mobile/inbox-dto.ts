// inbox-dto.ts — ตัวแปลงข้อมูลแชทลูกค้า → DTO ของแอป (`/api/mobile/inbox/**` · ใบ SEC S1.21 · R-K13)
//
// 🔴 ทุก DTO ของกล่องแชทในแอปออกจากไฟล์นี้เท่านั้น — เลือกฟิลด์ทีละตัว (allowlist) ไม่ spread แถวจาก DB
//    ⇒ คอลัมน์ใหม่ในอนาคต (credentials/token/คีย์) ไม่มีทางหลุดออก API โดยไม่มีใครตั้งใจ
// 🔴 ช่องทาง: ไม่คืน credentials · webhookKey · tokenPreview · publicKey* (แคบกว่า `maskedConnection` ของเว็บโดยตั้งใจ — แอปไม่ใช่หน้าตั้งค่าช่องทาง)
// pure (ไม่แตะ DB) — route เป็นคนโหลด แล้วส่งของเข้ามาแปลง

import type { ChatAttachment, ChatChannelConnection, ChatContact, ChatConversation, ChatMessage, ChatRoutingRule } from "@prisma/client";
import { channelLabel } from "@/lib/modules/chat/channel-icon";
import { parseTags } from "@/lib/modules/chat/labels";

const iso = (d: Date | null | undefined): string | null => (d ? d.toISOString() : null);

export type InboxContactDto = { id: string; displayName: string | null; avatarUrl: string | null; customerId: string | null };
export function contactDto(c: Pick<ChatContact, "id" | "displayName" | "avatarUrl" | "customerId">): InboxContactDto {
  return { id: c.id, displayName: c.displayName ?? null, avatarUrl: c.avatarUrl ?? null, customerId: c.customerId ?? null };
}

/** นาทีที่ลูกค้ารอคำตอบแรก — เฉพาะห้อง OPEN ที่ยังไม่มีใครตอบ (ไม่งั้น null) */
export function waitingMinOf(c: Pick<ChatConversation, "status" | "firstResponseAt" | "firstCustomerMessageAt">, now: Date): number | null {
  if (c.status !== "OPEN" || c.firstResponseAt || !c.firstCustomerMessageAt) return null;
  return Math.max(0, Math.floor((now.getTime() - c.firstCustomerMessageAt.getTime()) / 60_000));
}

export type InboxConversationDto = {
  id: string;
  channel: string;
  contact: InboxContactDto;
  status: string;
  assigneeUserId: string | null;
  assigneeName: string | null;
  unitId: string | null;
  lastMessageAt: string | null;
  lastMessagePreview: string | null;
  staffUnreadCount: number;
  waitingMin: number | null;
  aiDraft: boolean;
  helpers: string[];
  /** ป้ายของห้อง (S1.14b · `parseTags` ตัวเดียวกับเว็บ · ค่าเพี้ยน = []) — "รอคน" = ป้ายส่งต่อคนของ S1.22 */
  tags: string[];
};
export function conversationDto(
  c: ChatConversation & { contact: ChatContact },
  x: { now: Date; names: ReadonlyMap<string, string>; aiDraft: boolean; helpers: string[] },
): InboxConversationDto {
  return {
    id: c.id,
    channel: c.channel,
    contact: contactDto(c.contact),
    status: c.status,
    assigneeUserId: c.assigneeUserId ?? null,
    assigneeName: c.assigneeUserId ? (x.names.get(c.assigneeUserId) ?? null) : null,
    unitId: c.unitId ?? null,
    lastMessageAt: iso(c.lastMessageAt),
    lastMessagePreview: c.lastMessagePreview ?? null,
    staffUnreadCount: c.staffUnreadCount,
    waitingMin: waitingMinOf(c, x.now),
    aiDraft: x.aiDraft,
    helpers: x.helpers,
    tags: parseTags(c.tags),
  };
}

/** ปุ่มที่ผู้เรียกกดได้ในห้อง (S1.14b · ตัดสินจากคีย์ของผู้เรียกฝั่ง server — แอปไม่คำนวณเอง) */
/** S1.14c: `aiSuggest` = คีย์ `chat.ai.suggest` (ปุ่ม "ให้ AI ร่าง" · ด่านเดียวกับ POST …/ai-suggest) */
export type InboxConversationCan = { reply: boolean; assign: boolean; setStatus: boolean; linkCustomer: boolean; aiSuggest: boolean };
/** ห้องในจอเธรด = รายการ + หน้าต่างตอบกลับ + ปุ่มที่กดได้ (S1.14b) */
export type InboxConversationDetailDto = InboxConversationDto & {
  /** ตอบได้ถึงเมื่อไร = `ChatConversation.replyWindowExpiresAt` (FB/IG/WA · R-S1.14b-e) · LINE/WEBCHAT = null */
  replyWindowEndsAt: string | null;
  can: InboxConversationCan;
};

/** สมาชิกที่ผูกกับห้อง — เบอร์ปิดเลขกลางเสมอ (`maskPhone` ของโมดูลสมาชิก · ไม่มีเบอร์เต็มใน DTO · R-S2.17 ตั๋ว) */
export type InboxLinkedMemberDto = { id: string; name: string | null; phoneMasked: string | null };

/**
 * ป้ายข้อความที่เลขาส่ง (RESOLUTIONS §M · S1.12): meta แบนคีย์ `ai_roomId` `ai_proposalId` `ai_approvedBy`
 *   → `{ roomId, proposalId, approvedBy }` · ไม่มี `ai_proposalId` = ไม่ใช่ข้อความของเลขา (null)
 */
export function aiMetaOf(meta: unknown): { roomId: string | null; proposalId: string; approvedBy: string | null } | null {
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return null;
  const m = meta as Record<string, unknown>;
  const s = (v: unknown) => (typeof v === "string" && v.trim() ? v : null);
  const proposalId = s(m.ai_proposalId);
  if (!proposalId) return null;
  return { roomId: s(m.ai_roomId), proposalId, approvedBy: s(m.ai_approvedBy) };
}

export type InboxMessageDto = {
  id: string;
  direction: string;
  type: string;
  body: string | null;
  senderUserId: string | null;
  senderName: string | null;
  isInternal: boolean;
  /** PENDING (รอส่ง/รอแปลงเสียง) · SENT · FAILED (ฟองขึ้น ✗) — R-S1.21f */
  deliveryStatus: string;
  stickerMeta: unknown;
  attachments: { name: string; url: string; kind: string; mimeType: string; durationMs: number | null }[];
  meta: { ai: NonNullable<ReturnType<typeof aiMetaOf>> } | null;
  createdAt: string;
};
export function messageDto(
  m: ChatMessage,
  atts: readonly Pick<ChatAttachment, "fileName" | "url" | "kind" | "mimeType" | "durationMs">[],
  names: ReadonlyMap<string, string>,
): InboxMessageDto {
  const ai = aiMetaOf(m.meta);
  return {
    id: m.id,
    direction: m.direction,
    type: m.type,
    body: m.body ?? null,
    senderUserId: m.senderUserId ?? null,
    // ทีมเห็นชื่อพนักงานจริง (ไม่ใช่นามแฝงที่ลูกค้าเห็น) · ระบบ/ไม่รู้จัก = ชื่อที่เก็บบนแถว
    senderName: (m.senderUserId ? names.get(m.senderUserId) : undefined) ?? m.senderName ?? null,
    isInternal: m.isInternal,
    deliveryStatus: m.deliveryStatus,
    stickerMeta: m.stickerMeta ?? null,
    attachments: atts.map((a) => ({ name: a.fileName, url: a.url, kind: a.kind, mimeType: a.mimeType, durationMs: a.durationMs ?? null })),
    meta: ai ? { ai } : null,
    createdAt: m.createdAt.toISOString(),
  };
}

export type InboxConnectionDto = { id: string; type: string; label: string; displayName: string; status: string; lastInboundAt: string | null; lastErrorAt: string | null };
export function connectionDto(c: Pick<ChatChannelConnection, "id" | "type" | "displayName" | "status" | "lastInboundAt" | "lastErrorAt">): InboxConnectionDto {
  return { id: c.id, type: c.type, label: channelLabel(c.type), displayName: c.displayName, status: c.status, lastInboundAt: iso(c.lastInboundAt), lastErrorAt: iso(c.lastErrorAt) };
}

export type InboxRuleDto = { id: string; channel: string | null; mode: string; enabled: boolean; order: number };
export function ruleDto(r: ChatRoutingRule): InboxRuleDto {
  return { id: r.id, channel: r.channel ?? null, mode: r.mode, enabled: r.enabled, order: r.order };
}

export { iso as isoOrNull };
