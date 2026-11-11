// inbox-dto.ts — ตัวแปลงข้อมูลแชทลูกค้า → DTO ของแอป (`/api/mobile/inbox/**` · ใบ SEC S1.21 · R-K13)
//
// 🔴 ทุก DTO ของกล่องแชทในแอปออกจากไฟล์นี้เท่านั้น — เลือกฟิลด์ทีละตัว (allowlist) ไม่ spread แถวจาก DB
//    ⇒ คอลัมน์ใหม่ในอนาคต (credentials/token/คีย์) ไม่มีทางหลุดออก API โดยไม่มีใครตั้งใจ
// 🔴 ช่องทาง: ไม่คืน credentials · webhookKey · tokenPreview · publicKey* (แคบกว่า `maskedConnection` ของเว็บโดยตั้งใจ — แอปไม่ใช่หน้าตั้งค่าช่องทาง)
// pure (ไม่แตะ DB) — route เป็นคนโหลด แล้วส่งของเข้ามาแปลง

import { normalizeLang } from "@/lib/modules/chat/lang";
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
/** S3a.6: `translate` = ร้านเปิดการแปล ∧ ผู้เรียกเห็นห้อง ∧ มีคีย์ `chat.translate.use` (คีย์เดียวกับปุ่มแปลบนเว็บ) */
export type InboxConversationCan = { reply: boolean; assign: boolean; setStatus: boolean; linkCustomer: boolean; aiSuggest: boolean; translate: boolean };
/** ห้องในจอเธรด = รายการ + หน้าต่างตอบกลับ + ปุ่มที่กดได้ (S1.14b) */
export type InboxConversationDetailDto = InboxConversationDto & {
  /** ตอบได้ถึงเมื่อไร = `ChatConversation.replyWindowExpiresAt` (FB/IG/WA · R-S1.14b-e) · LINE/WEBCHAT = null */
  replyWindowEndsAt: string | null;
  can: InboxConversationCan;
  /** S3a.6: ภาษาของทีม (`ChatSetting.staffLang` · ปริยาย th) · ภาษาลูกค้า (`ChatContact.lang` · ไม่รู้ = null) */
  staffLang: string;
  contactLang: string | null;
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
  /** S3a.6: คำแปลที่แคชไว้ (`ChatMessage.translatedBody/translatedLang`) · ไม่มี = null */
  translatedBody: string | null;
  translatedLang: string | null;
  /** S3a.6: ข้อความลูกค้า (IN) ที่ไม่มีตัวอักษรของสคริปต์ภาษาทีมเลยและมีตัวอักษร ≥ 3 ⇒ แอปแสดงปุ่ม "แปล" */
  needsTranslation: boolean;
};

/** สคริปต์ของภาษาทีม (ไม่รู้จัก = ละติน) — ใช้ตัดสิน `needsTranslation` */
const SCRIPT_OF: Record<string, RegExp> = {
  th: /\p{Script=Thai}/u,
  ja: /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/u,
  zh: /\p{Script=Han}/u,
  cn: /\p{Script=Han}/u, // R-Z61 M1: เว็บ/detectLang ใช้ cn
  ko: /\p{Script=Hangul}/u,
  ru: /\p{Script=Cyrillic}/u,
  ar: /\p{Script=Arabic}/u,
  my: /\p{Script=Myanmar}/u,
  lo: /\p{Script=Lao}/u,
  km: /\p{Script=Khmer}/u,
};
/**
 * S3a.6 ▸ ข้อความนี้ต้องแปลให้ทีมไหม — มีตัวอักษร (`\p{L}`) ≥ 3 ตัว และไม่มีตัวอักษรของสคริปต์ภาษาทีมเลย
 *   (th: ไม่มีอักษรไทย · ภาษาอื่น: ไม่มีอักษรของภาษานั้น) · อีโมจิ/ตัวเลข/สั้นกว่า 3 ตัวอักษร = false · pure
 */
export function needsTranslation(body: string | null | undefined, staffLang: string | null | undefined): boolean {
  // R-Z61 M2: ลิงก์ · อีเมล · #แท็ก · @ชื่อ ไม่ใช่ภาษา — ตัดก่อนนับตัวอักษร
  const text = String(body ?? "").replace(/https?:\/\/\S+|www\.\S+|\S+@\S+|[#@]\S+/gu, " ");
  const letters = text.match(/\p{L}/gu) ?? [];
  if (letters.length < 3) return false;
  const lang = normalizeLang(staffLang) ?? "th"; // R-Z61 M1: zh ≡ cn
  const script = SCRIPT_OF[lang] ?? /\p{Script=Latin}/u;
  return !letters.some((ch) => script.test(ch));
}
export function messageDto(
  m: ChatMessage,
  atts: readonly Pick<ChatAttachment, "fileName" | "url" | "kind" | "mimeType" | "durationMs">[],
  names: ReadonlyMap<string, string>,
  /** S3a.6: ภาษาทีม (ตัดสิน needsTranslation) · ไม่ส่ง = th */
  staffLang?: string,
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
    translatedBody: m.translatedBody ?? null,
    translatedLang: m.translatedLang ?? null,
    needsTranslation: m.direction === "IN" && !m.isInternal && !m.purgedAt && needsTranslation(m.body, staffLang ?? "th"),
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
