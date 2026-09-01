import { createHash, randomBytes } from "node:crypto";
import { Prisma } from "@prisma/client";
import type {
  ChatAttachment,
  ChatChannelType,
  ChatChannelConnection,
  ChatConversation,
  ChatConversationStatus,
  ChatMessage,
  ChatMessageDirection,
  ChatMessageType,
  ChatSetting,
} from "@prisma/client";
import { prisma } from "@/lib/core/db";
import { emitOutbox } from "@/lib/core/outbox";
import { scheduleDrain } from "@/lib/outbox-consumers";
import * as member from "@/lib/modules/member/service";
import { getAdapter, isSupported, ChannelDeliveryError } from "./adapter";
import type { ChannelCreds, InboundMessage, OutboundMessage } from "./adapter";
import { readBusinessHours } from "./business-hours";
import type { BusinessDay, StoredBusinessHours } from "./business-hours";
import { encryptCreds, decryptCreds, mask } from "./crypto";
import { channelSentenceLabel } from "./channel-icon";
// ตัวคัดผู้รับแจ้งเตือนตัวเดียวกับที่ push ใช้ (core/push.ts) — ห้ามมีกติกา "ใครควรได้รู้" 2 ชุด
import { selectChatNotifyRecipients, toChatNotifyMember, VIEWING_WINDOW_MS } from "./notify";

// Chat service (P1 = LINE + WEBCHAT). scope = systemId (AppSystem type CHAT)
// query ทุกตัวผูก tenantId + systemId ตรง ๆ (ไม่พึ่ง tenantDb — เหมือน reward/meeting)
// dedup ด้วย @@unique([conversationId, externalMessageId]) กัน webhook ส่งซ้ำ
// reopen เธรด RESOLVED ≤24 ชม. · staffUnreadCount ต่อ conversation

const WEBCHAT_ACCOUNT = "webchat"; // externalAccountId คงที่ของ connection WEBCHAT ต่อ system
const REOPEN_WINDOW_MS = 24 * 60 * 60 * 1000;

// ───────────────────────── Staff ─────────────────────────

export type Staff = { userId: string; name: string; email: string };

export async function listStaff(tenantId: string): Promise<Staff[]> {
  const rows = await prisma.membership.findMany({
    where: { tenantId, acceptedAt: { not: null } },
    include: { user: true },
    orderBy: { createdAt: "asc" },
  });
  const seen = new Set<string>();
  const out: Staff[] = [];
  for (const m of rows) {
    if (seen.has(m.userId)) continue;
    seen.add(m.userId);
    out.push({ userId: m.userId, name: m.user.name ?? m.user.email, email: m.user.email });
  }
  return out;
}

// ───────────────────────── Connections ─────────────────────────

export function credsOf(conn: ChatChannelConnection): ChannelCreds {
  return decryptCreds<ChannelCreds>(conn.credentials);
}

// masked view สำหรับ API/UI — ห้าม leak ค่าลับ
export function maskedConnection(conn: ChatChannelConnection) {
  const creds = credsOf(conn);
  return {
    id: conn.id,
    type: conn.type,
    displayName: conn.displayName,
    status: conn.status,
    externalAccountId: conn.externalAccountId,
    webhookKey: conn.webhookKey,
    lastInboundAt: conn.lastInboundAt,
    lastError: conn.lastError,
    tokenPreview: mask(creds.channelAccessToken),
  };
}

export async function listConnections(tenantId: string, systemId: string) {
  return prisma.chatChannelConnection.findMany({
    where: { tenantId, systemId },
    orderBy: { createdAt: "asc" },
  });
}

// B1 (WO-C4): เดิมเป็น findUnique({ id }) เปล่า ๆ — ใครรู้ id ก็อ่าน connection ของร้านอื่นได้
// ตอนนี้บังคับ tenantId + systemId เสมอ (แกนเดียวกับ listConnections) · ไม่ตรง = null
// ⚠️ ทางเดียวที่ resolve connection โดยไม่มีบริบทร้านได้คือ webhook ขาเข้า
// (`api/chat/webhook/[connectionId]/route.ts`) ซึ่งพิสูจน์ตัวตนด้วย HMAC ของ provider ไม่ใช่ session
// → route นั้น query เองในไฟล์ตัวเอง ห้ามเอาฟังก์ชันนี้ไปใช้แล้วส่ง tenantId ที่มาจาก request
export async function getConnection(tenantId: string, systemId: string, connectionId: string) {
  return prisma.chatChannelConnection.findFirst({
    where: { id: connectionId, tenantId, systemId },
  });
}

// สร้าง/หา connection WEBCHAT (built-in — 1 ชุด/ระบบ) — lazy ตอนเปิดครั้งแรก
export async function ensureWebchatConnection(
  tenantId: string,
  systemId: string,
): Promise<ChatChannelConnection> {
  const existing = await prisma.chatChannelConnection.findFirst({
    where: { tenantId, systemId, type: "WEBCHAT" },
  });
  if (existing) return existing;
  try {
    return await prisma.chatChannelConnection.create({
      data: {
        tenantId,
        systemId,
        type: "WEBCHAT",
        displayName: "แชทหน้าเว็บ",
        externalAccountId: WEBCHAT_ACCOUNT,
        credentials: {},
      },
    });
  } catch {
    const again = await prisma.chatChannelConnection.findFirst({
      where: { tenantId, systemId, type: "WEBCHAT" },
    });
    if (again) return again;
    throw new Error("สร้างช่องแชทหน้าเว็บไม่สำเร็จ");
  }
}

// เชื่อม LINE OA (BYOK) — ตรวจ token ก่อน + ดึง bot userId เป็น externalAccountId
export async function connectLine(input: {
  tenantId: string;
  systemId: string;
  displayName: string;
  channelAccessToken: string;
  channelSecret: string;
}): Promise<{ ok: true; id: string } | { ok: false; reason: string }> {
  const creds: ChannelCreds = {
    channelAccessToken: input.channelAccessToken.trim(),
    channelSecret: input.channelSecret.trim(),
  };
  const health = await getAdapter("LINE").healthCheck(creds);
  if (!health.ok) return { ok: false, reason: health.detail ?? "เชื่อม LINE ไม่สำเร็จ" };
  const externalAccountId = health.externalAccountId ?? `line-${Date.now()}`;
  try {
    const conn = await prisma.chatChannelConnection.create({
      data: {
        tenantId: input.tenantId,
        systemId: input.systemId,
        type: "LINE",
        displayName: input.displayName.trim() || "LINE OA",
        externalAccountId,
        credentials: encryptCreds(creds),
        status: "CONNECTED",
      },
    });
    return { ok: true, id: conn.id };
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { ok: false, reason: "บัญชี LINE นี้ถูกเชื่อมในระบบนี้แล้ว" };
    }
    return { ok: false, reason: "บันทึกการเชื่อมต่อไม่สำเร็จ" };
  }
}

export async function setConnectionStatus(
  tenantId: string,
  connectionId: string,
  status: "CONNECTED" | "DISABLED" | "ERROR",
  error?: string,
) {
  await prisma.chatChannelConnection.updateMany({
    where: { id: connectionId, tenantId },
    data: { status, ...(error ? { lastError: error, lastErrorAt: new Date() } : {}) },
  });
}

// ───────────────────────── Settings ─────────────────────────

// WO-C2/M5: greetingMessage / offlineMessage เป็น **map ภาษาเปิด** ({ th, en, cn, ... })
// เพิ่มภาษาได้โดยไม่ต้อง migrate · อ่านค่าให้ใช้ resolveLocale() เสมอ ห้ามฮาร์ดโค้ด `.th`
export type LocaleMap = Record<string, string>;

// Json → map ภาษา (ทิ้งค่าที่ไม่ใช่สตริง — กันข้อมูลเก่า/มือแก้ผิดรูป)
export function toLocaleMap(value: unknown): LocaleMap {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: LocaleMap = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (typeof v === "string") out[k] = v;
  }
  return out;
}

/**
 * เลือกข้อความตามภาษา — ลำดับ: ภาษาที่ขอ → ภาษาฐาน (`th-TH` → `th`) → fallback → ภาษาแรกที่มี
 *
 * 🔴 ห้ามใช้ `||` ทั้งฟังก์ชันนี้: `""` คือ **การตั้งใจปิดข้อความ** ของร้าน (เช่น ไม่อยากมี greeting
 * ภาษาอังกฤษ) — `||` จะกลืนแล้วไหลไป fallback ทำให้ลูกค้าเห็นข้อความภาษาอื่นโผล่มาแทน
 * ([[feedback_render_all_locales_before_ship]]) → ตัดสินด้วย "มีคีย์นี้จริงไหม" ไม่ใช่ "ค่าจริงไหม"
 * ไม่มีภาษาไหนเลย → null (ผู้เรียกตัดสินเองว่าจะซ่อนหรือใช้ค่าตั้งต้น)
 */
export function resolveLocale(map: unknown, lang?: string | null, fallback = "th"): string | null {
  const m = toLocaleMap(map);
  const pick = (k?: string | null): string | undefined =>
    k && Object.prototype.hasOwnProperty.call(m, k) ? m[k] : undefined;

  const exact = pick(lang?.trim());
  if (exact !== undefined) return exact;

  const base = lang?.trim().split(/[-_]/)[0]?.toLowerCase();
  const baseHit = base && base !== lang?.trim() ? pick(base) : undefined;
  if (baseHit !== undefined) return baseHit;

  const fb = pick(fallback);
  if (fb !== undefined) return fb;

  const first = Object.keys(m)[0];
  return first === undefined ? null : m[first]!;
}

export type ChatSettingView = ChatSetting & { greeting: LocaleMap; offline: LocaleMap };

function withLocaleMaps(row: ChatSetting): ChatSettingView {
  return { ...row, greeting: toLocaleMap(row.greetingMessage), offline: toLocaleMap(row.offlineMessage) };
}

export async function getSetting(tenantId: string, systemId: string): Promise<ChatSettingView> {
  const existing = await prisma.chatSetting.findUnique({ where: { systemId } });
  if (existing) return withLocaleMaps(existing);
  return withLocaleMaps(await prisma.chatSetting.create({ data: { tenantId, systemId } }));
}

export async function setMemberSystem(
  tenantId: string,
  systemId: string,
  memberSystemId: string | null,
) {
  // เจ้าของกดเลือกเอง (รวมกรณีเลือก "ไม่เชื่อม") → ปักเวลาไว้ ระบบจะไม่ไปเชื่อมทับให้อีก
  await prisma.chatSetting.upsert({
    where: { systemId },
    create: { tenantId, systemId, memberSystemId, memberSystemChosenAt: new Date() },
    update: { memberSystemId, memberSystemChosenAt: new Date() },
  });
}

/**
 * เชื่อมระบบสมาชิกให้เองเมื่อ "ไม่มีอะไรให้เลือก" — ร้านมีระบบสมาชิกชุดเดียว
 * (เจ้าของถาม 31 ส.ค. 2026: ทำไมต้องมาตั้งเอง ในเมื่อเป็นระบบเดียวกัน — ถูกต้องสำหรับร้านทั่วไป)
 *
 * 🔴 มีระบบสมาชิก 2 ชุดขึ้นไป = **ห้ามเดา** — ร้านตั้งใจแยกฐานลูกค้าคนละชุด (เช่น สมาชิกร้านตัดผม
 *    กับ สมาชิกสปา) เชื่อมผิดชุด ลูกค้าจากแชทจะไหลไปรวมฐานที่ไม่ใช่ แก้ทีหลังยากกว่าตอนตั้ง
 * 🔴 เจ้าของเคยเลือกเองแล้ว (memberSystemChosenAt ไม่ null) = ไม่แตะ แม้เขาเลือก "ไม่เชื่อม"
 * 🔴 ตรวจว่าระบบแชทเป็นของร้านนี้จริงก่อนเขียน (กติกาเดียวกับ setBusinessHours · B1)
 *
 * คืน memberSystemId ที่ผูกอยู่หลังจบฟังก์ชัน (null = ยังไม่ผูก)
 */
export async function ensureMemberSystemLink(
  tenantId: string,
  systemId: string,
): Promise<string | null> {
  const chatSys = await prisma.appSystem.findFirst({
    where: { id: systemId, tenantId, type: "CHAT" },
    select: { id: true },
  });
  if (!chatSys) return null;

  const setting = await prisma.chatSetting.findUnique({ where: { systemId } });
  if (setting?.memberSystemId) return setting.memberSystemId;
  if (setting?.memberSystemChosenAt) return null; // เจ้าของตั้งใจไม่เชื่อม

  const members = await prisma.appSystem.findMany({
    where: { tenantId, type: "MEMBER", active: true },
    select: { id: true },
    take: 2, // รู้แค่ "ชุดเดียวหรือมากกว่า" ก็พอ
  });
  if (members.length !== 1) return null; // 0 = ยังไม่มีให้เชื่อม · 2+ = ต้องให้คนเลือก

  const memberSystemId = members[0]!.id;
  // ไม่ปัก chosenAt — ถือเป็นค่าที่ระบบเดาให้ เจ้าของยังเปลี่ยนได้ และถ้าเขาเลือกเองเมื่อไหร่ค่อยปัก
  await prisma.chatSetting.upsert({
    where: { systemId },
    create: { tenantId, systemId, memberSystemId },
    update: { memberSystemId },
  });
  return memberSystemId;
}

/**
 * ตั้ง/ล้างเวลาทำการของระบบแชท (WO-C16) · `null` = ยกเลิกการตั้งค่า (ลูกค้าจะไม่เห็นบรรทัดเวลาทำการ)
 *
 * 🔴 ตรวจรูปก่อนเรียกเสมอ (`validateBusinessHours`) — ที่นี่รับเฉพาะค่าที่ผ่านการตรวจแล้ว
 * 🔴 where ต้องมี `tenantId` เสมอ ห้าม upsert ด้วย `systemId` เปล่า ไม่งั้นรู้ systemId ของร้านอื่น
 *    ก็แก้เวลาทำการของเขาได้ (บทเรียนเดียวกับ `setRetentionDays` · B1)
 * คืน false = ระบบนี้ไม่ใช่ของร้านนี้ → ไม่แตะอะไรเลย
 */
export async function setBusinessHours(
  tenantId: string,
  systemId: string,
  value: StoredBusinessHours | null,
): Promise<boolean> {
  // Json? ต้องใช้ Prisma.DbNull ถึงจะเป็น SQL NULL จริง (JsonNull = ค่า null ใน JSON คนละความหมาย)
  const businessHours = value === null ? Prisma.DbNull : (value as unknown as Prisma.InputJsonValue);
  const res = await prisma.chatSetting.updateMany({
    where: { tenantId, systemId },
    data: { businessHours },
  });
  if (res.count > 0) return true;

  const sys = await prisma.appSystem.findFirst({
    where: { id: systemId, tenantId, type: "CHAT" },
    select: { id: true },
  });
  if (!sys) return false;
  await prisma.chatSetting.create({ data: { tenantId, systemId, businessHours } });
  return true;
}

// ───────────────────────── Contact + conversation (core) ─────────────────────────

// M9: ปิด flow เมื่อ webchat สร้าง contact ใหม่เกินโควตา/ชม. ต่อ connection (กัน DoS ท่วม inbox)
export class ContactCapError extends Error {
  constructor() {
    super("รับผู้ติดต่อใหม่เกินขีดจำกัดชั่วคราว กรุณาลองใหม่ภายหลัง");
    this.name = "ContactCapError";
  }
}
const NEW_CONTACT_CAP_PER_HOUR = 60;

// หา/สร้าง contact ต่อช่องทาง (find-or-create — channelConnectionId ผูกเสมอ)
// capNewPerHour: จำกัดจำนวน contact ใหม่/ชม.ต่อ connection (webchat public) — provider (LINE) ไม่ต้อง
async function findOrCreateContact(args: {
  tenantId: string;
  systemId: string;
  channel: ChatChannelType;
  connectionId: string;
  externalUserId: string;
  profile?: { displayName?: string; avatarUrl?: string };
  capNewPerHour?: number;
}) {
  const existing = await prisma.chatContact.findFirst({
    where: {
      systemId: args.systemId,
      channel: args.channel,
      channelConnectionId: args.connectionId,
      externalUserId: args.externalUserId,
    },
  });
  if (existing) {
    if (args.profile?.displayName && !existing.displayName) {
      return prisma.chatContact.update({
        where: { id: existing.id },
        data: {
          displayName: args.profile.displayName,
          avatarUrl: args.profile.avatarUrl ?? existing.avatarUrl,
          lastSeenAt: new Date(),
        },
      });
    }
    return prisma.chatContact.update({
      where: { id: existing.id },
      data: { lastSeenAt: new Date() },
    });
  }

  if (args.capNewPerHour != null) {
    const since = new Date(Date.now() - 60 * 60 * 1000);
    const recent = await prisma.chatContact.count({
      where: { systemId: args.systemId, channelConnectionId: args.connectionId, createdAt: { gte: since } },
    });
    if (recent >= args.capNewPerHour) throw new ContactCapError();
  }

  try {
    return await prisma.chatContact.create({
      data: {
        tenantId: args.tenantId,
        systemId: args.systemId,
        channel: args.channel,
        channelConnectionId: args.connectionId,
        externalUserId: args.externalUserId,
        displayName: args.profile?.displayName ?? null,
        avatarUrl: args.profile?.avatarUrl ?? null,
      },
    });
  } catch (e) {
    // race: อีก request สร้าง contact เดียวกันชนะก่อน (unique [systemId,channel,connectionId,externalUserId])
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      const won = await prisma.chatContact.findFirst({
        where: {
          systemId: args.systemId,
          channel: args.channel,
          channelConnectionId: args.connectionId,
          externalUserId: args.externalUserId,
        },
      });
      if (won) return won;
    }
    throw e;
  }
}

// หา conversation active ของ contact — ไม่มี → สร้าง / RESOLVED ≤24 ชม. → reopen
// M12: หุ้ม $transaction + pg_advisory_xact_lock(contactId) — serialize ต่อ contact กัน race
// (2 ข้อความพร้อมกันของ contact เดียว สร้าง conversation ซ้ำ / ข้อความหาย). lock ปลดเมื่อ tx จบ
async function getOrOpenConversation(args: {
  tenantId: string;
  systemId: string;
  channel: ChatChannelType;
  connectionId: string;
  contactId: string;
  unitId?: string | null;
}): Promise<ChatConversation> {
  return prisma.$transaction(async (tx) => {
    // lock ต่อ contact — คำขอที่ contact เดียวกันรอคิว, คนละ contact ไม่บล็อกกัน
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${args.contactId}, 0))`;

    const active = await tx.chatConversation.findFirst({
      where: { systemId: args.systemId, contactId: args.contactId, status: { not: "RESOLVED" } },
      orderBy: { lastMessageAt: "desc" },
    });
    if (active) return active;

    const lastResolved = await tx.chatConversation.findFirst({
      where: { systemId: args.systemId, contactId: args.contactId, status: "RESOLVED" },
      orderBy: { resolvedAt: "desc" },
    });
    if (lastResolved?.resolvedAt && Date.now() - lastResolved.resolvedAt.getTime() <= REOPEN_WINDOW_MS) {
      const reopened = await tx.chatConversation.update({
        where: { id: lastResolved.id },
        data: { status: "OPEN", resolvedAt: null, reopenedCount: { increment: 1 } },
      });
      await tx.chatConversationEvent.create({
        data: { tenantId: args.tenantId, systemId: args.systemId, conversationId: reopened.id, type: "REOPENED" },
      });
      return reopened;
    }

    const created = await tx.chatConversation.create({
      data: {
        tenantId: args.tenantId,
        systemId: args.systemId,
        channel: args.channel,
        channelConnectionId: args.connectionId,
        contactId: args.contactId,
        unitId: args.unitId ?? null,
        status: "OPEN",
        firstCustomerMessageAt: new Date(),
      },
    });
    await tx.chatConversationEvent.create({
      data: { tenantId: args.tenantId, systemId: args.systemId, conversationId: created.id, type: "CREATED" },
    });
    return created;
  });
}

async function logEvent(
  conversationId: string,
  args: {
    tenantId: string;
    systemId: string;
    type: "CREATED" | "ASSIGNED" | "STATUS_CHANGED" | "CUSTOMER_LINKED" | "REOPENED" | "DELIVERY_FAILED";
    actorUserId?: string | null;
    meta?: Prisma.InputJsonValue;
  },
) {
  await prisma.chatConversationEvent.create({
    data: {
      tenantId: args.tenantId,
      systemId: args.systemId,
      conversationId,
      type: args.type,
      actorUserId: args.actorUserId ?? null,
      meta: args.meta,
    },
  });
}

function preview(body?: string | null, type?: ChatMessageType): string {
  if (type === "IMAGE") return "[รูปภาพ]";
  if (type === "STICKER") return "[สติกเกอร์]";
  if (type === "FILE") return "[ไฟล์]";
  return (body ?? "").replace(/\s+/g, " ").trim().slice(0, 140);
}

// ───────── เวลาจริงของข้อความ (`sentAt`) — WO-C3b ─────────
// ระบบต้นทางที่ย้ายประวัติเข้ามาต้องประทับ "เวลาที่ข้อความถูกส่งจริง" ไม่ใช่เวลาที่ย้าย
// ไม่งั้นทั้งเธรดได้เวลาเดียวกันหมด → เรียงผิด อ่านไม่รู้เรื่อง และ retention (WO-C12) นับอายุผิด
// 🔴 ค่าที่รับต้องมีขอบทั้งสองด้าน:
//    · อนาคตไกล = ข้อความลอยอยู่บนสุดของ inbox ตลอดกาลและ SLA คำนวณติดลบ
//      (เผื่อนาฬิกาเครื่องต้นทางเพี้ยนได้ 1 วัน — ไม่ใช่ 0 ไม่งั้น clock skew ปกติก็ถูกปฏิเสธ)
//    · เก่าเกินเหตุ = อาการของหน่วยเวลาผิด (วินาที vs มิลลิวินาที) ไม่ใช่ประวัติจริง
// 🔴 ผู้เรียกที่เป็นเบราว์เซอร์ (widget) ห้ามตั้งค่านี้ — ตัดสินที่ชั้น 2 ก่อนถึงที่นี่ (§3.1)
const SENT_AT_FUTURE_TOLERANCE_MS = 24 * 60 * 60 * 1000; // 1 วัน
const SENT_AT_MAX_AGE_MS = 5 * 365 * 24 * 60 * 60 * 1000; // 5 ปี

function resolveSentAt(
  sentAt: Date | undefined,
  now: Date = new Date(),
): { ok: true; at: Date } | { ok: false; reason: string } {
  if (!sentAt) return { ok: true, at: now };
  const t = sentAt.getTime();
  if (!Number.isFinite(t)) return { ok: false, reason: "sentAt ไม่ใช่วันเวลาที่ถูกต้อง" };
  if (t > now.getTime() + SENT_AT_FUTURE_TOLERANCE_MS) {
    return { ok: false, reason: "sentAt เป็นเวลาในอนาคตเกิน 1 วัน" };
  }
  if (t < now.getTime() - SENT_AT_MAX_AGE_MS) {
    return { ok: false, reason: "sentAt เก่าเกิน 5 ปี" };
  }
  return { ok: true, at: sentAt };
}

// 🔴 หนี้ H4 (ปิด 1 ก.ย. 2026): ป้ายช่องทางเคยถูกพิมพ์มือไว้ 3 ที่ (ที่นี่ · ai/tools.ts · chat/ui.tsx)
//    ลิสต์ที่พิมพ์ซ้ำเพี้ยนเสมอ — รอบก่อน `APP`/`TIKTOK` ตกไปใช้ค่าดิบ ⇒ แจ้งเตือนขึ้นว่า
//    "ลูกค้าทักเข้ามา · APP" เป็นอังกฤษกลางข้อความไทย
//    ⇒ ตอนนี้เหลือทะเบียนเดียวที่ `chat/channel-icon.tsx` ซึ่งผูกกับ `Record<ChatChannelType, …>`
//      เต็มรูป: เพิ่มค่าใน enum แล้วลืมป้าย = typecheck แดงทันที (ที่นี่ไม่ต้องแก้ตามอีกแล้ว)
//    ⚠️ ใช้ `channelSentenceLabel` (ป้ายยาว "แชทหน้าเว็บ") ไม่ใช่ `channelLabel` (ป้ายสั้น "เว็บ")
//      เพราะข้อความแจ้งเตือนเป็นประโยคที่คนอ่าน ไม่ใช่ชิปในตาราง

/**
 * เว้นช่วงเกินเท่านี้ = ถือว่าเป็นการทักรอบใหม่ ต้องแจ้งเตือนทีมอีกครั้ง
 * 🔴 ตัวเลขนี้คือเส้นแบ่งระหว่าง "พิมพ์รัวหลายบรรทัด" (ห้ามแจ้ง 5 ครั้ง) กับ
 *    "กลับมาทักใหม่" (ต้องแจ้ง) — 3 นาทีครอบคลุมการพิมพ์ต่อเนื่องของคนทั่วไป
 */
const INBOUND_NOTIFY_GAP_MS = 3 * 60_000;

// ───────────────────────── "ปิดโมดูลเงียบ": แจ้งเตือน + outbox หลังรับ inbound ─────────────────────────
// เรียกหลัง insert ChatMessage(direction IN) สำเร็จ (ไม่ใช่ duplicate). ทำใน 1 transaction:
//   1) อัปเดต denorm ของ conversation (lastMessage*, staffUnreadCount, status)
//   2) AppNotification "ลูกค้าทักเข้ามา" — de-dup: สร้างเฉพาะตอนเธรดเปลี่ยน
//      "อ่านครบ (staffUnreadCount=0)" → "มี unread" ครั้งแรก (ใช้ updateMany แบบ atomic ตัดสิน
//      กัน race + ลูกค้าพิมพ์รัวหลายบรรทัด = 1 แจ้งเตือน จนกว่าพนักงานจะอ่าน)
//   3) emitOutbox "chat.message.received" ทุกข้อความ (idempotencyKey ผูก messageId กัน webhook ซ้ำ)
// แล้ว **นอกทรานแซกชัน**:
//   4) push เข้ามือถือทีมงาน (sendPushToTenant) — de-dup ด้วย `firstUnread` ตัวเดียวกับข้อ 2
// AppNotification เขียน **รายผู้รับ** (`recipientUserId`) ที่ผ่านด่าน `chat.conversation.read`
// จริงเท่านั้น — ไปโผล่ /app/notifications ของคนนั้นคนเดียว (ปิดหนี้ G11 · 1 ก.ย. 2026)
// 🔴 ตั้งชื่อ type ของพารามิเตอร์แทนการเขียน object ยัดในวงเล็บ — เพื่อให้เครื่องมือที่ "ตัดตัว
//    ฟังก์ชันด้วยการนับปีกกา" (ข้อสอบ/สคริปต์ตรวจ) อ่านตัวฟังก์ชันได้จริง ไม่ใช่ได้แต่รูปพารามิเตอร์
type AnnounceInboundArgs = {
  tenantId: string;
  systemId: string;
  unitId: string | null;
  conv: ChatConversation;
  messageId: string;
  channel: ChatChannelType;
  contactLabel: string;
  previewText: string;
  sentAt: Date;
};

async function announceInbound(args: AnnounceInboundArgs): Promise<void> {
  const { tenantId, systemId, conv } = args;
  const nextStatus = conv.status === "PENDING" ? "OPEN" : conv.status;
  const channelTh = channelSentenceLabel(args.channel);
  const denorm = {
    lastMessageAt: args.sentAt,
    lastMessagePreview: args.previewText,
    lastMessageDirection: "IN",
    status: nextStatus,
  } satisfies Prisma.ChatConversationUpdateManyMutationInput;

  // 🔴 เจ้าของเจอจริง 30 ส.ค. 2026: "ข้อความมาแต่ไม่ได้รับ notification"
  //    de-dup เดิมคือ "แจ้งครั้งเดียวจนกว่าทีมจะอ่าน" ⇒ ถ้าตัวนับค้าง ทีมจะเงียบไปตลอดกาล
  //    เจตนาเดิมคือกัน "ลูกค้าพิมพ์รัวหลายบรรทัด = แจ้ง 5 ครั้ง" ซึ่งวัดด้วย **เวลา** ได้ตรงกว่า
  //    ⇒ เว้นช่วงจากข้อความก่อนหน้าเกินหน้าต่างนี้ = ถือเป็นการทักรอบใหม่ ต้องแจ้งอีกครั้ง
  const gapMs = args.sentAt.getTime() - (conv.lastMessageAt?.getTime() ?? 0);
  const newBurst = gapMs > INBOUND_NOTIFY_GAP_MS;

  // ผลของ flip 0→1 ต้องอ่านได้จากนอกทรานแซกชันด้วย — push ใช้กติกา de-dup ตัวเดียวกับ AppNotification
  let firstUnread = false;
  await prisma.$transaction(async (tx) => {
    // atomic: เธรด "อ่านครบ" (0) → flip เป็น 1 = transition ครั้งแรก (คนเดียวชนะ) → แจ้งเตือน
    const flipped = await tx.chatConversation.updateMany({
      where: { id: conv.id, staffUnreadCount: 0 },
      data: { ...denorm, staffUnreadCount: 1 },
    });
    // 🔴 `flipped` ตัดสิน **ตัวนับ** · `firstUnread` ตัดสิน **การแจ้งเตือน** — คนละเรื่องกัน
    //    ตัวนับต้องเดินตามจริงเสมอ แต่การแจ้งเตือนต้องกลับมาเมื่อเป็นการทักรอบใหม่ (เว้นช่วงนาน)
    //    แม้ตัวนับจะยังค้างอยู่ ไม่งั้นทีมจะเงียบไปตลอดกาลถ้าเผลอไม่เคลียร์ unread
    const flippedNow = flipped.count === 1;
    firstUnread = flippedNow || newBurst;
    if (!flippedNow) {
      // เดิมมี unread ค้างอยู่แล้ว → เพิ่มตัวนับเฉย ๆ
      await tx.chatConversation.update({
        where: { id: conv.id },
        data: { ...denorm, staffUnreadCount: { increment: 1 } },
      });
    }

    // outbox ทุกข้อความ — automation/webhook ราย event (dedup ด้วย messageId)
    await emitOutbox(tx, {
      tenantId,
      type: "chat.message.received",
      idempotencyKey: `chat.msg.${args.messageId}`,
      payload: { conversationId: conv.id, channel: args.channel },
      systemId,
      unitId: args.unitId,
    });

    if (firstUnread) {
      // 🔴 ปิดหนี้ G11 (1 ก.ย. 2026) — มาตรการชั่วคราวของ 31 ส.ค. ถูกถอดออกแล้ว
      //    ของเดิม: `AppNotification` เป็น **ประกาศทั้งร้าน** (สคีมาไม่มีช่องผู้รับ) ⇒ ใครที่เข้า
      //    แอปของร้านได้ เปิด `/app/notifications` อ่าน "ตัวอย่างข้อความลูกค้า" ได้หมด แม้ไม่มี
      //    สิทธิ์แชทสักข้อ ⇒ รอบนั้นจึงต้อง **ตัดเนื้อความออก** เป็นการชั่วคราว
      //    ของใหม่: สคีมามี `recipientUserId` แล้ว ⇒ เขียน **รายผู้รับ** ที่ผ่านด่านสิทธิ์จริง
      //    ⇒ ใส่ตัวอย่างข้อความกลับเข้าไปได้ (ประโยชน์หลักของการแจ้งเตือนคือรู้ว่าเรื่องด่วนแค่ไหน
      //      โดยไม่ต้องเปิดเข้าไปดูทีละห้อง)
      //
      // 🔴 ใช้ `selectChatNotifyRecipients` ตัวเดียวกับ push (`core/push.ts`) — ห้ามพิมพ์กติกา
      //    "ใครควรได้รู้" ชุดที่ 2 ที่นี่ · ผลลัพธ์ 2 ทางต้องตรงกันเสมอ ไม่งั้นวันหนึ่งมือถือเด้ง
      //    แต่ศูนย์แจ้งเตือนว่าง (หรือกลับกัน) แล้วไม่มีใครรู้ว่าอันไหนถูก
      // 🔴 ไม่มีผู้รับที่มีสิทธิ์เลย = **ไม่สร้างแถว** ห้ามตกกลับไปเป็นประกาศทั้งร้าน
      //    (นั่นคือช่องโหว่เดิมกลับมาทางประตูหลัง)
      // ⚠️ อ่าน 3 ตารางนี้เฉพาะตอนจะแจ้งจริง (throttle ด้วย `firstUnread` แล้ว) — ไม่ใช่ทุกข้อความ
      const [memberRows, readerRows, mutedRows] = await Promise.all([
        // คนที่ถูกถอนสิทธิ์ (acceptedAt=null) ไม่ใช่สมาชิกที่ใช้งานอยู่ — ตรงกับด่านใน core/context.ts
        tx.membership.findMany({
          where: { tenantId, acceptedAt: { not: null } },
          select: { userId: true, role: true, unitAccess: true, permissions: true },
        }),
        // อ่านเฉพาะ read state ที่ยังสด — เก่ากว่าหน้าต่างแปลว่าไม่ได้เปิดห้องค้างอยู่แล้ว
        tx.chatReadState.findMany({
          where: {
            conversationId: conv.id,
            lastReadAt: { gte: new Date(args.sentAt.getTime() - VIEWING_WINDOW_MS) },
          },
          select: { userId: true, lastReadAt: true },
        }),
        // คนที่ปิดเสียงห้องนี้ไว้ (รายคน · WO-CV10) — เงียบแล้วต้องเงียบทั้งมือถือและในเว็บ
        tx.chatConversationPref.findMany({
          where: { conversationId: conv.id, mutedUntil: { gt: args.sentAt } },
          select: { userId: true },
        }),
      ]);
      const recipientUserIds = selectChatNotifyRecipients({
        members: memberRows.map(toChatNotifyMember),
        unitId: conv.unitId,
        assigneeUserId: conv.assigneeUserId,
        readers: readerRows,
        mutedUserIds: mutedRows.map((r) => r.userId),
        now: args.sentAt,
      });
      // ⚠️ เขียนทีละแถว ไม่ใช่ `createMany` โดยตั้งใจ: จำนวนผู้รับคือ "คนในร้านที่มีสิทธิ์อ่านแชท"
      //    ซึ่งเป็นหลักหน่วย และ insert สั้น ๆ ในทรานแซกชันเดียวกันอยู่แล้ว ⇒ กำไรจากการยุบเป็น
      //    คำสั่งเดียวน้อยมาก · แลกกับการที่ทุกเครื่องมือ (รวม fake prisma ของชุดข้อสอบเดิม
      //    `qc-chat-push-badge`) เดินเส้นทางนี้ได้เหมือนกันหมด — ถ้าวันหนึ่งร้านมีพนักงานหลักร้อย
      //    ค่อยเปลี่ยนเป็น createMany พร้อมกับสอน fake ให้รู้จักคำสั่งนั้น
      for (const recipientUserId of recipientUserIds) {
        await tx.appNotification.create({
          data: {
            tenantId,
            recipientUserId,
            title: "ลูกค้าทักเข้ามา",
            body: `${args.contactLabel} (${channelTh}): ${args.previewText.trim() === "" ? "ข้อความใหม่" : args.previewText.trim().slice(0, 140)} · เปิดห้องแชท /app/sys/${systemId}/chat?c=${conv.id}`,
          },
        });
      }
    }
  });

  // ── push เข้ามือถือทีมงาน (WO-C14 · เจ้าของแจ้ง 29 ส.ค. "ไม่เห็นแจ้งเตือนเลย") ──
  // 🔴 อยู่ **นอกทรานแซกชัน** เสมอ: push เป็น network call — ถ้า Expo ตอบช้าแล้วเราขังไว้ใน tx
  //    จะถือ connection ของ Neon ค้าง → pool ตันทั้งแพลตฟอร์ม (บทเรียนเดียวกับการส่งออก adapter
  //    ใน sendReply ที่ถูกย้ายออกนอก tx แล้ว · ข้อสอบ XC-3.7)
  // 🔴 de-dup กติกาเดียวกับ AppNotification เป๊ะ — ใช้ `firstUnread` ตัวเดียวกัน:
  //    ลูกค้าพิมพ์รัว 5 บรรทัด = แจ้งเตือน 1 ครั้ง จนกว่าทีมจะกดอ่าน (markRead → staffUnreadCount 0)
  // 🔴 ห้าม throw: ส่งแจ้งเตือนพลาดต้องไม่ทำให้ข้อความลูกค้าหาย (ข้อความถูกบันทึกไปแล้วก่อนถึงตรงนี้)
  //    sendPushToTenant เองก็ best-effort อยู่แล้ว — try/catch นี้กันแค่ตอน import โมดูลพัง
  // 🔴 WO-CW3 (สัญญากับสาย E): เดิมเป็น `sendPushToTenant` = ยิงทุกเครื่องในร้าน (G9)
  //    ⇒ พนักงานที่ไม่มีสิทธิ์แชทก็ได้เนื้อความลูกค้าเด้งขึ้นหน้าจอล็อก = ข้อมูลรั่วนอก RBAC
  //    ตัวใหม่คัดผู้รับจาก `chat.conversation.read` + ให้ผู้รับผิดชอบเธรดมาก่อน
  if (firstUnread) {
    try {
      const { sendPushToChatStaff } = await import("@/lib/core/push");
      await sendPushToChatStaff({
        tenantId,
        systemId,
        conversationId: conv.id,
        assigneeUserId: conv.assigneeUserId,
        title: `ลูกค้าทักเข้ามา · ${channelTh}`,
        body: `${args.contactLabel}: ${args.previewText || "ข้อความใหม่"}`.slice(0, 140),
        // ⚠️ แอปมือถือยัง deep link เข้ากล่องแชทลูกค้าไม่ได้ (ยังไม่มีจอนั้น) — listener ใน
        //    apps/mobile อ่านเฉพาะ `data.conversationId` แล้วเปิด /chat/<id> ซึ่งเป็นห้อง **แชท AI**
        //    คนละชนิดกับ ChatConversation ⇒ ใส่คีย์นั้น = พาไปจอที่โหลดไม่ขึ้น
        //    จึงตั้งชื่อคีย์คนละตัวไว้ก่อน (แตะแจ้งเตือน = เปิดแอปเฉย ๆ ไม่เด้งผิดจอ)
        //    เมื่อแอปมีจอ inbox แล้วค่อยให้ listener อ่าน `chatConversationId`/`url`
        data: {
          kind: "chat.inbound",
          chatConversationId: conv.id,
          systemId,
          url: `/app/sys/${systemId}/chat?c=${conv.id}`,
        },
      });
    } catch {
      // push พัง → เงียบ (ข้อความลูกค้า + แจ้งเตือนในเว็บ บันทึกครบแล้ว)
    }
  }

  // drain outbox (automation/webhooks) — fire-and-forget เหมือน POS ให้ event เดินทันที
  scheduleDrain();
}

// ───────────────────────── Inbound ─────────────────────────

// รับข้อความจากช่องทางภายนอก (LINE) — เรียกจาก webhook route หลัง verify signature
export async function receiveInbound(args: {
  connection: ChatChannelConnection;
  inbound: InboundMessage;
}): Promise<{ ok: boolean; conversationId?: string; duplicate?: boolean }> {
  const { connection, inbound } = args;
  const { tenantId, systemId } = connection;
  const channel = connection.type;

  // profile (ครั้งแรก) — ผ่าน adapter (LINE)
  let profile: { displayName?: string; avatarUrl?: string } | undefined;
  const adapter = getAdapter(channel);
  if (adapter.getProfile) {
    profile = await adapter.getProfile(credsOf(connection), inbound.externalUserId).catch(() => ({}));
  }

  const contact = await findOrCreateContact({
    tenantId,
    systemId,
    channel,
    connectionId: connection.id,
    externalUserId: inbound.externalUserId,
    profile,
  });
  if (contact.blockedAt) return { ok: true }; // block spam — เก็บเงียบ ไม่สร้างเธรด

  const conv = await getOrOpenConversation({
    tenantId,
    systemId,
    channel,
    connectionId: connection.id,
    contactId: contact.id,
    unitId: connection.defaultUnitId,
  });

  const msgType: ChatMessageType = inbound.type;
  let msg;
  try {
    msg = await prisma.chatMessage.create({
      data: {
        tenantId,
        systemId,
        conversationId: conv.id,
        direction: "IN",
        type: msgType,
        body: inbound.body ?? null,
        stickerMeta: inbound.stickerMeta
          ? (inbound.stickerMeta as Prisma.InputJsonValue)
          : undefined,
        externalMessageId: inbound.externalMessageId,
        deliveryStatus: "SENT",
      },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { ok: true, conversationId: conv.id, duplicate: true }; // webhook ซ้ำ → ไม่แจ้งเตือนซ้ำ
    }
    throw e;
  }

  // อัปเดต denorm + แจ้งเตือนพนักงาน (de-dup) + outbox
  await announceInbound({
    tenantId,
    systemId,
    unitId: connection.defaultUnitId,
    conv,
    messageId: msg.id,
    channel,
    contactLabel: contact.displayName ?? contact.phone ?? "ลูกค้า",
    previewText: preview(inbound.body, msgType),
    sentAt: inbound.sentAt,
  });
  await prisma.chatChannelConnection.update({
    where: { id: connection.id },
    data: { lastInboundAt: new Date() },
  });

  await maybeAutoLinkMember(tenantId, systemId, contact.id);
  return { ok: true, conversationId: conv.id };
}

// รับข้อความจาก webchat widget (public) — auth ด้วย guest token ownership
export async function receiveWebchatInbound(args: {
  connection: ChatChannelConnection;
  guestToken: string;
  body: string;
  displayName?: string;
  clientMessageId?: string;
}): Promise<{ ok: boolean; conversationId?: string; reason?: string }> {
  const { connection } = args;
  const { tenantId, systemId } = connection;
  const body = args.body.trim();
  if (!body) return { ok: false, reason: "ข้อความว่าง" };
  if (body.length > 4000) return { ok: false, reason: "ข้อความยาวเกินไป" };

  let contact;
  try {
    contact = await findOrCreateContact({
      tenantId,
      systemId,
      channel: "WEBCHAT",
      connectionId: connection.id,
      externalUserId: args.guestToken,
      profile: args.displayName ? { displayName: args.displayName } : undefined,
      capNewPerHour: NEW_CONTACT_CAP_PER_HOUR, // M9: กัน DoS สร้าง contact ท่วม
    });
  } catch (e) {
    if (e instanceof ContactCapError) return { ok: false, reason: e.message };
    throw e;
  }
  if (contact.blockedAt) return { ok: true };

  const conv = await getOrOpenConversation({
    tenantId,
    systemId,
    channel: "WEBCHAT",
    connectionId: connection.id,
    contactId: contact.id,
    unitId: connection.defaultUnitId,
  });

  let msg;
  try {
    msg = await prisma.chatMessage.create({
      data: {
        tenantId,
        systemId,
        conversationId: conv.id,
        direction: "IN",
        type: "TEXT",
        body,
        clientMessageId: args.clientMessageId ?? null,
        deliveryStatus: "SENT",
      },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { ok: true, conversationId: conv.id }; // ส่งซ้ำ (clientMessageId เดิม) → ไม่แจ้งเตือนซ้ำ
    }
    throw e;
  }

  // อัปเดต denorm + แจ้งเตือนพนักงาน (de-dup) + outbox
  await announceInbound({
    tenantId,
    systemId,
    unitId: connection.defaultUnitId,
    conv,
    messageId: msg.id,
    channel: "WEBCHAT",
    contactLabel: contact.displayName ?? contact.phone ?? "ลูกค้า",
    previewText: preview(body),
    sentAt: new Date(),
  });
  return { ok: true, conversationId: conv.id };
}

// ───────────────────────── Inbound จากระบบภายนอก (server-to-server) ─────────────────────────
// WO-C2: ทางเข้าของ "ชั้น 2" (`/api/v1/chat/messages`) — SiamDive และ widget ฝังในอนาคตใช้เส้นนี้
//
// 🔴 กฎเหล็กข้อ 1 (§2 ของแผน): ห้าม fork logic — ต้องเดินผ่าน findOrCreateContact +
//    getOrOpenConversation (advisory lock) + announceInbound ตัวเดียวกับ webchat/LINE
//    ไม่งั้นลูกค้าแต่ละช่องทางจะได้พฤติกรรม race lock / unread / แจ้งเตือน คนละแบบ
// ส่วนที่ "เพิ่ม" จาก webchat มีแค่ข้อมูลที่ระบบต้นทางรู้แต่ widget ไม่รู้:
//    lang / verifiedEmail / externalRef (→ ChatContact, M2) · context (→ ChatConversation.meta, M3)
//    และไฟล์แนบ (→ ChatAttachment)
export type ExternalAttachmentInput = {
  url: string;
  mimeType: string;
  fileName?: string;
  sizeBytes?: number;
  width?: number;
  height?: number;
  storageKey?: string;
};

const MAX_EXTERNAL_ATTACHMENTS = 10;

export type ExternalIdentityFields = {
  email?: string;
  phone?: string;
  lang?: string;
  verifiedEmail?: boolean;
  externalRef?: string;
};

// ตัวตนที่ระบบต้นทางรู้ (M2) — เขียนเฉพาะที่ส่งมาและค่าเปลี่ยนจริง
// 🔴 มีที่เดียว: ทั้ง `receiveExternalInbound` (ส่งข้อความ) และ `upsertExternalIdentity`
//    (POST /identities) ต้องได้กติกาเดียวกัน ไม่งั้นผูกตัวตนคนละแบบตามเส้นที่เรียกเข้ามา
async function applyContactIdentity<T extends { id: string; lang: string | null; externalRef: string | null; email: string | null; phone: string | null; verifiedEmail: boolean }>(
  contact: T,
  args: ExternalIdentityFields,
): Promise<T> {
  const patch: Prisma.ChatContactUpdateInput = {};
  if (args.lang?.trim() && args.lang.trim() !== contact.lang) patch.lang = args.lang.trim();
  if (args.externalRef?.trim() && args.externalRef.trim() !== contact.externalRef) {
    patch.externalRef = args.externalRef.trim();
  }
  if (args.email?.trim() && args.email.trim() !== contact.email) patch.email = args.email.trim();
  if (args.phone?.trim() && args.phone.trim() !== contact.phone) patch.phone = args.phone.trim();
  // verifiedEmail พลิกได้ทางเดียว (false→true): ต้นทางยืนยันแล้วห้ามถูกถอนด้วย payload รอบถัดไป
  if (args.verifiedEmail === true && !contact.verifiedEmail) patch.verifiedEmail = true;
  if (Object.keys(patch).length === 0) return contact;
  return (await prisma.chatContact.update({ where: { id: contact.id }, data: patch })) as unknown as T;
}

// IMAGE เมื่อ mimeType ขึ้นต้น image/ · นอกนั้น FILE (สติกเกอร์มาจาก provider เท่านั้น ไม่รับทางนี้)
function attachmentKind(mimeType: string): ChatMessageType {
  return mimeType.trim().toLowerCase().startsWith("image/") ? "IMAGE" : "FILE";
}

function fileNameFromUrl(url: string): string {
  const last = url.split("?")[0]!.split("#")[0]!.split("/").filter(Boolean).pop();
  return last && last.length <= 200 ? decodeURIComponent(last) : "ไฟล์แนบ";
}

export async function receiveExternalInbound(args: {
  connection: ChatChannelConnection;
  externalUserId: string;
  body?: string;
  attachments?: ExternalAttachmentInput[];
  clientMessageId?: string;
  displayName?: string;
  email?: string;
  phone?: string;
  lang?: string;
  verifiedEmail?: boolean;
  externalRef?: string;
  context?: Record<string, unknown>;
  /** WO-C3b: เวลาจริงของข้อความ (เชื่อได้เฉพาะ secret key) — ไม่ระบุ = ตอนนี้ */
  sentAt?: Date;
}): Promise<{
  ok: boolean;
  conversationId?: string;
  messageId?: string;
  createdAt?: string;
  duplicate?: boolean;
  reason?: string;
}> {
  const { connection } = args;
  const { tenantId, systemId } = connection;
  const channel = connection.type;

  const externalUserId = (args.externalUserId ?? "").trim();
  if (!externalUserId) return { ok: false, reason: "ไม่ได้ระบุผู้ใช้ต้นทาง" };

  const when = resolveSentAt(args.sentAt);
  if (!when.ok) return { ok: false, reason: when.reason };
  const at = when.at;

  const body = (args.body ?? "").trim();
  const attachments = (args.attachments ?? []).filter((a) => a?.url?.trim() && a?.mimeType?.trim());
  if (!body && attachments.length === 0) return { ok: false, reason: "ข้อความว่าง" };
  if (body.length > 4000) return { ok: false, reason: "ข้อความยาวเกิน 4,000 ตัวอักษร" };
  if (attachments.length > MAX_EXTERNAL_ATTACHMENTS) {
    return { ok: false, reason: `แนบไฟล์ได้ไม่เกิน ${MAX_EXTERNAL_ATTACHMENTS} รายการต่อข้อความ` };
  }

  let contact;
  try {
    contact = await findOrCreateContact({
      tenantId,
      systemId,
      channel,
      connectionId: connection.id,
      externalUserId,
      profile: args.displayName ? { displayName: args.displayName } : undefined,
      capNewPerHour: NEW_CONTACT_CAP_PER_HOUR, // เพดานเดียวกับ webchat (M9) — s2s ก็ท่วม inbox ได้
    });
  } catch (e) {
    if (e instanceof ContactCapError) return { ok: false, reason: e.message };
    throw e;
  }
  if (contact.blockedAt) return { ok: true }; // block spam — เก็บเงียบ ไม่สร้างเธรด

  contact = await applyContactIdentity(contact, args);

  const conv = await getOrOpenConversation({
    tenantId,
    systemId,
    channel,
    connectionId: connection.id,
    contactId: contact.id,
    unitId: connection.defaultUnitId,
  });

  // บริบทลูกค้า §3.3 (pageUrl/country/userAgent/…) — merge ทับของเดิม ทีมงานเห็นว่าลูกค้าดูหน้าไหน
  if (args.context && Object.keys(args.context).length > 0) {
    const prev =
      conv.meta && typeof conv.meta === "object" && !Array.isArray(conv.meta)
        ? (conv.meta as Record<string, unknown>)
        : {};
    await prisma.chatConversation.update({
      where: { id: conv.id },
      data: { meta: { ...prev, ...args.context } as Prisma.InputJsonValue },
    });
  }

  const msgType: ChatMessageType =
    attachments.length > 0 ? attachmentKind(attachments[0]!.mimeType) : "TEXT";

  let msg;
  try {
    // ข้อความ + ไฟล์แนบต้อง atomic — ไม่งั้นเหลือข้อความเปล่าที่รูปหาย (ลูกค้าเห็นช่องว่าง = B3 ซ้ำรอย)
    msg = await prisma.$transaction(async (tx) => {
      const created = await tx.chatMessage.create({
        data: {
          tenantId,
          systemId,
          conversationId: conv.id,
          direction: "IN",
          type: msgType,
          body: body || null,
          clientMessageId: args.clientMessageId ?? null,
          deliveryStatus: "SENT",
          createdAt: at, // ไม่ระบุ sentAt = now() ตามเดิม
        },
      });
      for (const a of attachments) {
        await tx.chatAttachment.create({
          data: {
            tenantId,
            systemId,
            messageId: created.id,
            kind: attachmentKind(a.mimeType),
            storageKey: a.storageKey?.trim() || a.url.trim(),
            url: a.url.trim(),
            fileName: a.fileName?.trim() || fileNameFromUrl(a.url.trim()),
            mimeType: a.mimeType.trim(),
            sizeBytes: a.sizeBytes ?? 0,
            width: a.width ?? null,
            height: a.height ?? null,
          },
        });
      }
      return created;
    });
  } catch (e) {
    // ส่งซ้ำ (clientMessageId เดิม) → ไม่แจ้งเตือนซ้ำ เหมือน webchat
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { ok: true, conversationId: conv.id, duplicate: true };
    }
    throw e;
  }

  await announceInbound({
    tenantId,
    systemId,
    unitId: connection.defaultUnitId,
    conv,
    messageId: msg.id,
    channel,
    contactLabel: contact.displayName ?? contact.phone ?? "ลูกค้า",
    previewText: preview(body, msgType),
    sentAt: at,
  });
  // 🔴 lastInboundAt = "ช่องทางนี้มีสัญญาณล่าสุดเมื่อไหร่" (สุขภาพการเชื่อมต่อ) — ไม่ใช่เวลาของ
  //    ข้อความ ⇒ ประวัติเก่าที่ย้ายเข้ามาต้องไม่ทำให้ช่องทางดูเหมือน "เงียบมา 3 ปี"
  await prisma.chatChannelConnection.update({
    where: { id: connection.id },
    data: { lastInboundAt: new Date() },
  });

  await maybeAutoLinkMember(tenantId, systemId, contact.id);
  return { ok: true, conversationId: conv.id, messageId: msg.id, createdAt: msg.createdAt.toISOString() };
}

// hook: ถ้าเชื่อมระบบ Member และ contact มีเบอร์แต่ยังไม่ผูก → findOrCreate + link (opt-in)
async function maybeAutoLinkMember(tenantId: string, systemId: string, contactId: string) {
  // ร้านที่มีระบบสมาชิกชุดเดียวและยังไม่เคยตั้งค่า → เชื่อมให้ตรงนี้เลย
  // (ไม่ต้องรอเจ้าของเปิดหน้า "เชื่อมช่องทาง" — ลูกค้าคนแรกที่ทักเข้ามาก็ถูกผูกเป็นสมาชิกแล้ว)
  const memberSystemId = await ensureMemberSystemLink(tenantId, systemId);
  if (!memberSystemId) return;
  const setting = { memberSystemId };
  const contact = await prisma.chatContact.findFirst({ where: { id: contactId, systemId } });
  if (!contact || contact.customerId || !contact.phone) return;
  try {
    const c = await member.findOrCreate({
      tenantId,
      memberSystemId: setting.memberSystemId,
      phone: contact.phone,
      name: contact.displayName ?? undefined,
      source: "AUTO",
    });
    await prisma.chatContact.update({
      where: { id: contact.id },
      data: { customerId: c.id, linkedAt: new Date() },
    });
  } catch {
    // ไม่ block flow แชท
  }
}

// ───────────────────────── Outbound (staff ตอบ) ─────────────────────────

/**
 * ประกอบข้อความขาออกที่จะยิงเข้า adapter — 1 ข้อความในระบบอาจกลายเป็นหลายชิ้นบนช่องทาง
 * (LINE ส่ง text กับ image เป็นคนละ message object) · ไฟล์ที่ไม่ใช่รูปส่งเป็นลิงก์
 * 🔴 ห้ามทิ้งไฟล์เงียบ ๆ: ทีมกดส่งรูปแล้วลูกค้าไม่ได้รับ = ความเสียหายที่ไม่มีใครเห็นจนสายเกินไป
 */
function buildOutboundMessages(
  body: string,
  attachments: ExternalAttachmentInput[],
): OutboundMessage[] {
  const out: OutboundMessage[] = [];
  if (body) out.push({ type: "TEXT", body });
  for (const a of attachments) {
    const url = a.url.trim();
    const name = a.fileName?.trim() || fileNameFromUrl(url);
    if (attachmentKind(a.mimeType) === "IMAGE") out.push({ type: "IMAGE", body: name, imageUrl: url });
    else out.push({ type: "TEXT", body: `[ไฟล์] ${name}\n${url}` });
  }
  if (out.length === 0) out.push({ type: "TEXT", body });
  return out;
}

export async function sendReply(args: {
  tenantId: string;
  systemId: string;
  conversationId: string;
  senderUserId: string;
  body?: string;
  attachments?: ExternalAttachmentInput[];
  isInternal?: boolean;
  senderName?: string;
  originalBody?: string;
  unitAccess?: string[];
}): Promise<{ ok: boolean; reason?: string; messageId?: string }> {
  // 🔴 เงื่อนไขเดิมคือ `if (!body) return` ⇒ ทีมส่ง "รูปอย่างเดียว" ไม่ได้เลย (G3)
  //    กติกาใหม่: ต้องมีอย่างน้อย body **หรือ** ไฟล์แนบ (ตรงกับขาเข้า receiveExternalInbound)
  const body = (args.body ?? "").trim();
  const attachments = (args.attachments ?? []).filter((a) => a?.url?.trim() && a?.mimeType?.trim());
  if (!body && attachments.length === 0) {
    return { ok: false, reason: "ต้องมีข้อความหรือไฟล์แนบอย่างน้อยหนึ่งอย่าง" };
  }
  if (body.length > 4000) return { ok: false, reason: "ข้อความยาวเกิน 4,000 ตัวอักษร" };
  if (attachments.length > MAX_EXTERNAL_ATTACHMENTS) {
    return { ok: false, reason: `แนบไฟล์ได้ไม่เกิน ${MAX_EXTERNAL_ATTACHMENTS} รายการต่อข้อความ` };
  }

  const conv = await prisma.chatConversation.findFirst({
    where: { id: args.conversationId, tenantId: args.tenantId, systemId: args.systemId },
    include: { contact: true },
  });
  if (!conv) return { ok: false, reason: "ไม่พบบทสนทนา" };
  if (!canAccessConvUnit(args.unitAccess, conv.unitId)) return { ok: false, reason: "ไม่มีสิทธิ์เข้าถึงบทสนทนานี้" }; // M11

  const isInternal = !!args.isInternal;
  // insert OUT ก่อน (ทีมเห็นทันที) — PENDING สำหรับช่องทางภายนอก, SENT สำหรับ internal/webchat
  const willSend = !isInternal;
  // ชนิดข้อความตามไฟล์ชิ้นแรก (กติกาเดียวกับขาเข้า) — mime ขึ้นต้น image/ → IMAGE · อื่น ๆ → FILE
  const msgType: ChatMessageType =
    attachments.length > 0 ? attachmentKind(attachments[0]!.mimeType) : "TEXT";
  // 🔴 preview ของข้อความที่มีแต่ไฟล์ต้องไม่ว่าง — ไม่งั้นหน้ารายการ inbox ขึ้นบรรทัดเปล่า
  //    (preview() ตัดสินจาก type ก่อนเสมอ → ได้ "[รูปภาพ]" / "[ไฟล์]")
  const previewText = preview(body, msgType);
  // ต้นฉบับที่ทีมพิมพ์ก่อนกด "แปลก่อนส่ง" — เก็บไว้ให้ทีมย้อนดูว่าตัวเองพิมพ์อะไร (§5.2)
  const originalBody = args.originalBody?.trim() || null;

  // ชื่อที่ลูกค้าควรเห็น (M5) — นามแฝงของร้าน ไม่ใช่ชื่อพนักงานจริง
  // เก็บบนแถวเฉพาะที่ระบุมาเจาะจง · null = ให้ publicThread ตกไปใช้ senderAlias ตอนอ่าน
  // (แก้นามแฝงทีหลังแล้วข้อความเก่าเปลี่ยนตาม — ตามเจตนาใน chat.prisma:190)
  const setting = isInternal
    ? null
    : await prisma.chatSetting.findUnique({ where: { systemId: args.systemId } });
  const rowSenderName = args.senderName?.trim() || null;
  const shownSenderName = rowSenderName ?? setting?.senderAlias ?? null;

  // 🔴 B4 (WO-C2): "เขียนข้อความ + emitOutbox + denorm" ต้องอยู่ทรานแซกชันเดียว
  //    (ข้อความรอด = event รอด — แบบเดียวกับ announceInbound ขาเข้า)
  //    แต่ **การส่งออกช่องทางภายนอกเป็น network call → ต้องอยู่นอกทรานแซกชันเสมอ**
  //    LINE ตอบช้า/ค้าง = ถือ connection ของ Neon ค้างไปด้วย → pool ตันทั้งแพลตฟอร์ม
  //    ⇒ ลำดับคือ [tx: insert+outbox+denorm] → [นอก tx: ยิง adapter] → [นอก tx: อัปเดตผลส่ง]
  //    ผลข้างเคียงที่ยอมรับ: ยิงส่งไม่ผ่าน (deliveryStatus=FAILED) event ก็ออกไปแล้ว
  //    ผู้รับ webhook ต้องถือว่า "แอดมินตอบแล้ว" ไม่ใช่ "ถึงมือลูกค้าแล้ว" (ดู §3.4)
  //    🔴 ไฟล์ถูก **อัปโหลดเสร็จก่อน**เข้ามาถึงฟังก์ชันนี้แล้ว (ชั้น action) — ที่นี่รับแต่ url
  //       ถ้าเอา Bunny มาไว้ในนี้ = network call ในทรานแซกชัน = ถือ connection ของ Neon ค้าง
  const msg = await prisma.$transaction(async (tx) => {
    const created = await tx.chatMessage.create({
      data: {
        tenantId: args.tenantId,
        systemId: args.systemId,
        conversationId: conv.id,
        direction: "OUT",
        type: msgType,
        senderUserId: args.senderUserId,
        senderName: rowSenderName,
        body: body || null,
        isInternal,
        ...(originalBody ? { meta: { originalBody } as Prisma.InputJsonValue } : {}),
        deliveryStatus: willSend && conv.channel !== "WEBCHAT" ? "PENDING" : "SENT",
      },
    });

    // ข้อความ + ไฟล์แนบต้อง atomic — ไฟล์กำพร้า/ข้อความที่รูปหาย = ผู้ใช้เห็นของไม่ครบ
    for (const a of attachments) {
      await tx.chatAttachment.create({
        data: {
          tenantId: args.tenantId,
          systemId: args.systemId,
          messageId: created.id,
          kind: attachmentKind(a.mimeType),
          storageKey: a.storageKey?.trim() || a.url.trim(),
          url: a.url.trim(),
          fileName: a.fileName?.trim() || fileNameFromUrl(a.url.trim()),
          mimeType: a.mimeType.trim(),
          sizeBytes: a.sizeBytes ?? 0,
          width: a.width ?? null,
          height: a.height ?? null,
        },
      });
    }

    // 🔴 โน้ตภายในไม่ใช่ข้อความถึงลูกค้า — ห้ามยิง event และห้ามขึ้น preview
    if (!isInternal) {
      await emitOutbox(tx, {
        tenantId: args.tenantId,
        type: "chat.message.sent",
        // ขาเข้าใช้ `chat.msg.<id>` — ขาออกต้องคนละ namespace ไม่งั้นชนกันแล้ว event หายเงียบ
        idempotencyKey: `chat.sent.${created.id}`,
        payload: {
          conversationId: conv.id,
          messageId: created.id,
          externalUserId: conv.contact.externalUserId,
          channel: conv.channel,
          preview: previewText,
          // 🔴 ข้อความเต็ม — `preview` ถูกตัดที่ 140 ตัวอักษร (preview()) ซึ่งพอสำหรับแจ้งเตือน
          //    แต่ **ไม่พอสำหรับผู้รับที่เอาไปแสดงเป็นข้อความจริง** (SiamDive โหมด dual สะท้อน
          //    คำตอบกลับเข้า DB ตัวเอง — ใช้ preview = ลูกค้าเห็นข้อความโดนตัดกลางคัน)
          //    เพิ่มฟิลด์ล้วน ผู้รับเดิมที่อ่าน preview ไม่กระทบ
          body,
          senderName: shownSenderName,
        },
        systemId: args.systemId,
        unitId: conv.unitId,
      });
      // denormalized — staff ตอบ = ล้าง unread
      await tx.chatConversation.update({
        where: { id: conv.id },
        data: {
          lastMessageAt: created.createdAt,
          lastMessagePreview: previewText,
          lastMessageDirection: "OUT",
          staffUnreadCount: 0,
          firstResponseAt: conv.firstResponseAt ?? new Date(),
        },
      });
    }
    return created;
  });

  let failReason: string | undefined;
  if (willSend && conv.channel !== "WEBCHAT") {
    const connection = conv.channelConnectionId
      ? await prisma.chatChannelConnection.findUnique({ where: { id: conv.channelConnectionId } })
      : null;
    if (!connection || connection.status === "DISABLED") {
      failReason = "CHANNEL_DISCONNECTED";
    } else if (!isSupported(conv.channel)) {
      // 🔴 ช่องทางที่ยังไม่มี adapter (Messenger/IG/TikTok/…): ข้อความของทีม **ต้องไม่หาย**
      //    ⇒ บันทึกในระบบตามปกติ ไม่ throw · แต่สถานะต้องบอกความจริงว่า "ยังไม่ถึงลูกค้า"
      //    (SENT ทั้งที่ไม่มีทางส่งได้ = ทีมเข้าใจว่าตอบไปแล้ว แล้วลูกค้ารอเก้อ)
      await prisma.chatMessage.update({
        where: { id: msg.id },
        data: { deliveryStatus: "FAILED", deliveryError: "CHANNEL_NOT_SUPPORTED" },
      });
      await logEvent(conv.id, {
        tenantId: args.tenantId,
        systemId: args.systemId,
        type: "DELIVERY_FAILED",
        actorUserId: args.senderUserId,
        meta: { messageId: msg.id, reason: "CHANNEL_NOT_SUPPORTED" },
      });
    } else {
      try {
        const adapter = getAdapter(conv.channel);
        // 1 ข้อความในระบบ → หลายชิ้นบนช่องทาง (ข้อความ + รูปแต่ละใบ) · ยิงเรียงตามลำดับที่ทีมเห็น
        let result: { externalMessageId?: string } = {};
        for (const outbound of buildOutboundMessages(body, attachments)) {
          result = await adapter.sendMessage({
            creds: credsOf(connection),
            externalUserId: conv.contact.externalUserId,
            message: outbound,
          });
        }
        await prisma.chatMessage.update({
          where: { id: msg.id },
          data: { deliveryStatus: "SENT", externalMessageId: result.externalMessageId ?? null },
        });
      } catch (e) {
        failReason = e instanceof ChannelDeliveryError ? e.reason : "SEND_FAILED";
        if (failReason === "TOKEN_EXPIRED" && connection) {
          await setConnectionStatus(args.tenantId, connection.id, "ERROR", "TOKEN_EXPIRED");
        }
      }
    }
    if (failReason) {
      await prisma.chatMessage.update({
        where: { id: msg.id },
        data: { deliveryStatus: "FAILED", deliveryError: failReason },
      });
      await logEvent(conv.id, {
        tenantId: args.tenantId,
        systemId: args.systemId,
        type: "DELIVERY_FAILED",
        actorUserId: args.senderUserId,
        meta: { messageId: msg.id, reason: failReason },
      });
    }
  }

  // drain outbox (automation/webhooks) — fire-and-forget เหมือนขาเข้า ให้ event เดินทันที
  if (!isInternal) scheduleDrain();

  return failReason
    ? { ok: false, reason: failReason, messageId: msg.id }
    : { ok: true, messageId: msg.id };
}

// ─────────────── คำตอบของทีมงานที่ถูก "สะท้อน" มาจากระบบภายนอก (WO-C3b) ───────────────
// ทางเข้าของ `POST /api/v1/chat/replies` — 🔴 secret key เท่านั้น (ชั้น 2 กันไว้)
// ถ้าหลุดถึง widget = ใครก็ปลอมเป็นทีมงานคุยกับลูกค้าได้ในนามร้าน
//
// ทำไมต้องมี: ช่วงเปลี่ยนผ่าน (WO-C6/C7) ทีมงานของพาร์ตเนอร์ยังตอบอยู่ในหน้าจอเดิมของตัวเอง
//   ไม่มีทางนี้ = SHARK เก็บได้แต่ข้อความฝั่งลูกค้า ⇒ inbox ทีมอ่านไม่รู้เรื่อง และประวัติที่ย้ายมา
//   ได้ครึ่งเดียว
//
// 🔴 ต่างจาก `sendReply` 3 ข้อ และทั้ง 3 ข้อคือเหตุผลที่เอา `sendReply` มาใช้ตรง ๆ ไม่ได้:
//   1. **ห้ามยิงออกช่องทางภายนอกซ้ำ** — ข้อความถูกส่งถึงลูกค้าไปแล้วโดยระบบต้นทาง
//      ยิงซ้ำ = ลูกค้าได้ข้อความ 2 รอบ ⇒ เส้นนี้ไม่แตะ adapter เลย · `deliveryStatus = SENT`
//      ตั้งแต่แรก (สถานะสะท้อนความจริง: ส่งถึงแล้ว แค่ไม่ได้ส่งโดยเรา)
//   2. **ห้าม emit `chat.message.sent`** — §3.4 ตกลงความหมายไว้ว่า "แอดมินตอบแล้ว" และ WO-C6
//      ผูก event นี้เข้ากับการ push แจ้งลูกค้า · ยิงกลับไปหาระบบที่เพิ่งส่งข้อความนั้นเอง =
//      ลูกค้าได้ push ซ้ำ และเปิดทางวนลูป (ต้นทางตอบ → mirror → event → ต้นทางแจ้ง/เขียนซ้ำ)
//      ⇒ ใช้ type ใหม่ `chat.message.mirrored` = "คัดลอกเข้ามาแล้ว ไม่ต้องส่งอะไรต่อ"
//      (ห้ามแก้ความหมายของ `chat.message.sent` แทน — ผู้รับรายอื่นพึ่งความหมายเดิมอยู่)
//   3. `senderUserId = null` — คนตอบไม่ใช่ผู้ใช้ใน SHARK ห้ามชี้ไปที่พนักงานคนไหนของร้าน
//
// ⚠️ ส่วน **denormalized ต้องเหมือน `sendReply` เป๊ะ** (lastMessage* · staffUnreadCount: 0 ·
//    firstResponseAt) ไม่งั้นกล่อง "รอตอบ" ของทีมไม่ลดและ SLA โกหก — แก้ที่หนึ่งต้องดูอีกที่เสมอ
export async function receiveExternalReply(args: {
  connection: ChatChannelConnection;
  externalUserId: string;
  body: string;
  /** ชื่อที่ลูกค้าเห็นเฉพาะข้อความนี้ · ไม่ใส่ = ตกไปใช้ ChatSetting.senderAlias ตอนอ่าน */
  senderName?: string;
  clientMessageId?: string;
  sentAt?: Date;
  isInternal?: boolean;
}): Promise<{
  ok: boolean;
  conversationId?: string;
  messageId?: string;
  createdAt?: string;
  duplicate?: boolean;
  reason?: string;
}> {
  const { connection } = args;
  const { tenantId, systemId } = connection;

  const externalUserId = (args.externalUserId ?? "").trim();
  if (!externalUserId) return { ok: false, reason: "ไม่ได้ระบุผู้ใช้ต้นทาง" };

  const body = (args.body ?? "").trim();
  if (!body) return { ok: false, reason: "ข้อความว่าง" };
  if (body.length > 4000) return { ok: false, reason: "ข้อความยาวเกิน 4,000 ตัวอักษร" };

  const when = resolveSentAt(args.sentAt);
  if (!when.ok) return { ok: false, reason: when.reason };
  const at = when.at;

  // 🔴 ห้ามสร้าง contact ที่นี่: "คำตอบ" ต้องมีคนถามก่อนเสมอ · สร้างเองเมื่อไม่เจอ =
  //    ระบบต้นทางพิมพ์ externalUserId ผิดตัวเดียวแล้วได้เธรดผีที่ทีมต้องมานั่งปิดเอง
  //    (และเปิดช่องให้ท่วม inbox โดยข้ามเพดาน contact ใหม่/ชม.ของ findOrCreateContact)
  const contact = await prisma.chatContact.findFirst({
    where: { systemId, channelConnectionId: connection.id, externalUserId },
  });
  if (!contact) {
    return { ok: false, reason: "ไม่พบผู้ใช้ต้นทางนี้ — ส่งข้อความของลูกค้าหรือเรียก /identities ก่อน" };
  }
  if (contact.blockedAt) return { ok: true }; // เหมือนขาเข้า: เก็บเงียบ ไม่ปลุกเธรด

  // ใช้ตัวเดิม (advisory lock) — ห้าม fork logic การเปิด/รื้อฟื้นเธรด (กฎเหล็กข้อ 1)
  const conv = await getOrOpenConversation({
    tenantId,
    systemId,
    channel: connection.type,
    connectionId: connection.id,
    contactId: contact.id,
    unitId: connection.defaultUnitId,
  });

  const isInternal = !!args.isInternal;
  const previewText = preview(body);
  const rowSenderName = args.senderName?.trim() || null;
  const setting = isInternal ? null : await prisma.chatSetting.findUnique({ where: { systemId } });
  const shownSenderName = rowSenderName ?? setting?.senderAlias ?? null;

  let msg;
  try {
    // เขียนข้อความ + event + denorm ในทรานแซกชันเดียว (ข้อความรอด = event รอด) เหมือน sendReply
    // ที่นี่ไม่มี network call ให้ต้องกันออกนอก tx เลย เพราะเส้นนี้ไม่ยิงออกช่องทางภายนอก
    msg = await prisma.$transaction(async (tx) => {
      const created = await tx.chatMessage.create({
        data: {
          tenantId,
          systemId,
          conversationId: conv.id,
          direction: "OUT",
          type: "TEXT",
          senderUserId: null, // ไม่ใช่พนักงานใน SHARK
          senderName: rowSenderName,
          body,
          isInternal,
          clientMessageId: args.clientMessageId ?? null,
          deliveryStatus: "SENT", // ถึงลูกค้าไปแล้วโดยระบบต้นทาง
          createdAt: at,
        },
      });

      // 🔴 โน้ตภายในไม่ใช่ข้อความถึงลูกค้า — ห้ามยิง event และห้ามขึ้น preview (เหมือน sendReply)
      if (!isInternal) {
        await emitOutbox(tx, {
          tenantId,
          type: "chat.message.mirrored",
          // namespace ที่ 3 — ห้ามชน `chat.msg.` (ขาเข้า) และ `chat.sent.` (แอดมินใน SHARK ตอบ)
          idempotencyKey: `chat.mirrored.${created.id}`,
          payload: {
            conversationId: conv.id,
            messageId: created.id,
            externalUserId: contact.externalUserId,
            channel: conv.channel,
            preview: previewText,
            senderName: shownSenderName,
          },
          systemId,
          unitId: conv.unitId,
        });
        // denorm — ชุดฟิลด์ต้องตรงกับ sendReply (ทีมตอบแล้ว = ล้าง unread + ประทับ SLA)
        await tx.chatConversation.update({
          where: { id: conv.id },
          data: {
            lastMessageAt: at,
            lastMessagePreview: previewText,
            lastMessageDirection: "OUT",
            staffUnreadCount: 0,
            firstResponseAt: conv.firstResponseAt ?? at,
          },
        });
      }
      return created;
    });
  } catch (e) {
    // ส่งซ้ำ (clientMessageId เดิม) → ไม่เขียนซ้ำ ไม่ยิง event ซ้ำ — WO-C7 รันย้ายข้อมูลซ้ำได้
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { ok: true, conversationId: conv.id, duplicate: true };
    }
    throw e;
  }

  if (!isInternal) scheduleDrain();

  return {
    ok: true,
    conversationId: conv.id,
    messageId: msg.id,
    createdAt: msg.createdAt.toISOString(),
  };
}

// ───────────────────────── Inbox reads ─────────────────────────

// M11: RBAC ต่อ unit — unitAccess = ["*"] เห็นทุก unit; ไม่งั้นเห็นเฉพาะ unit ที่เข้าถึง + เธรดไม่ผูก unit (null = ระดับระบบ)
export function canAccessConvUnit(unitAccess: string[] | undefined, unitId: string | null): boolean {
  if (!unitAccess || unitAccess.includes("*")) return true;
  if (unitId === null) return true; // เธรดไม่ผูก unit — ทีมของระบบเห็นได้
  return unitAccess.includes(unitId);
}

/**
 * ตัวกรอง unit สำหรับ where ของ `ChatConversation` (ด่าน M11)
 *
 * 🔴 export ตั้งแต่ 1 ก.ย. — ก่อนหน้านี้เป็น private แล้ว `inbox-actions.ts` ต้องเขียนซ้ำอีกชุด
 *    **ตรรกะความปลอดภัยที่มี 2 ชุด = วันที่ทำให้ชุดหนึ่งเข้มขึ้น อีกชุดจะหลวมอยู่เงียบ ๆ**
 *    (สาย C รายงานเอง ไม่ได้ปล่อยผ่าน) · ผู้เรียกทุกคนต้องใช้ตัวนี้ ห้ามเขียน OR/unitId เอง
 */
export function unitAccessWhere(unitAccess?: string[]): Prisma.ChatConversationWhereInput {
  if (!unitAccess || unitAccess.includes("*")) return {};
  return { OR: [{ unitId: null }, { unitId: { in: unitAccess } }] };
}

export async function listConversations(args: {
  tenantId: string;
  systemId: string;
  status?: "OPEN" | "PENDING" | "RESOLVED";
  channel?: ChatChannelType;
  assignee?: string; // userId | "me"(caller resolve) | "none"
  callerUserId?: string;
  q?: string;
  limit?: number;
  unitAccess?: string[]; // M11 — จาก auth.active.unitAccess
}) {
  const where: Prisma.ChatConversationWhereInput = {
    tenantId: args.tenantId,
    systemId: args.systemId,
    ...unitAccessWhere(args.unitAccess),
  };
  if (args.status) where.status = args.status;
  if (args.channel) where.channel = args.channel;
  if (args.assignee === "none") where.assigneeUserId = null;
  else if (args.assignee === "me" && args.callerUserId) where.assigneeUserId = args.callerUserId;
  else if (args.assignee) where.assigneeUserId = args.assignee;
  if (args.q?.trim()) {
    where.contact = {
      is: {
        OR: [
          { displayName: { contains: args.q.trim(), mode: "insensitive" } },
          { phone: { contains: args.q.trim() } },
        ],
      },
    };
  }
  return prisma.chatConversation.findMany({
    where,
    include: { contact: true },
    orderBy: { lastMessageAt: "desc" },
    take: args.limit ?? 50,
  });
}

export async function getThread(args: {
  tenantId: string;
  systemId: string;
  conversationId: string;
  limit?: number;
  unitAccess?: string[]; // M11
}) {
  const conversation = await prisma.chatConversation.findFirst({
    where: { id: args.conversationId, tenantId: args.tenantId, systemId: args.systemId },
    include: { contact: true },
  });
  if (!conversation) return null;
  if (!canAccessConvUnit(args.unitAccess, conversation.unitId)) return null; // M11: IDOR ต่าง unit
  const messages = await prisma.chatMessage.findMany({
    where: { systemId: args.systemId, conversationId: conversation.id },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: args.limit ?? 100,
  });
  return { conversation, messages };
}

export async function unreadCount(tenantId: string, systemId: string): Promise<number> {
  const rows = await prisma.chatConversation.aggregate({
    where: { tenantId, systemId, staffUnreadCount: { gt: 0 } },
    _count: { _all: true },
  });
  return rows._count._all;
}

// ───────────────────────── Conversation mutations ─────────────────────────

export async function setStatus(args: {
  tenantId: string;
  systemId: string;
  conversationId: string;
  status: "OPEN" | "PENDING" | "RESOLVED";
  actorUserId: string;
  unitAccess?: string[]; // M11
}): Promise<{ ok: boolean; reason?: string }> {
  const conv = await prisma.chatConversation.findFirst({
    where: { id: args.conversationId, tenantId: args.tenantId, systemId: args.systemId },
    include: { contact: true },
  });
  if (!conv) return { ok: false, reason: "ไม่พบบทสนทนา" };
  if (!canAccessConvUnit(args.unitAccess, conv.unitId)) return { ok: false, reason: "ไม่มีสิทธิ์เข้าถึงบทสนทนานี้" }; // M11
  if (conv.status === args.status) return { ok: true }; // ไม่เปลี่ยนจริง = ไม่ยิง event (กัน webhook รัว)

  // WO-C2: เปลี่ยนสถานะ + event log + outbox อยู่ทรานแซกชันเดียว (ไม่มี network call ในนี้)
  // idempotencyKey ผูก id ของ ChatConversationEvent → เปิด/ปิดสลับกี่รอบก็ได้ key ไม่ชนกันเอง
  // (ผูกกับ conversationId เฉย ๆ จะยิงได้ครั้งเดียวตลอดชีพเธรด)
  await prisma.$transaction(async (tx) => {
    await tx.chatConversation.update({
      where: { id: conv.id },
      data: {
        status: args.status,
        resolvedAt: args.status === "RESOLVED" ? new Date() : args.status === "OPEN" ? null : conv.resolvedAt,
      },
    });
    const evt = await tx.chatConversationEvent.create({
      data: {
        tenantId: args.tenantId,
        systemId: args.systemId,
        conversationId: conv.id,
        type: "STATUS_CHANGED",
        actorUserId: args.actorUserId,
        meta: { from: conv.status, to: args.status },
      },
    });
    await emitOutbox(tx, {
      tenantId: args.tenantId,
      type: "chat.conversation.status",
      idempotencyKey: `chat.status.${evt.id}`,
      payload: {
        conversationId: conv.id,
        status: args.status,
        externalUserId: conv.contact.externalUserId,
      },
      systemId: args.systemId,
      unitId: conv.unitId,
    });
  });
  scheduleDrain();
  return { ok: true };
}

export async function assign(args: {
  tenantId: string;
  systemId: string;
  conversationId: string;
  assigneeUserId: string | null;
  actorUserId: string;
  unitAccess?: string[]; // M11
}): Promise<{ ok: boolean; reason?: string }> {
  const conv = await prisma.chatConversation.findFirst({
    where: { id: args.conversationId, tenantId: args.tenantId, systemId: args.systemId },
  });
  if (!conv) return { ok: false, reason: "ไม่พบบทสนทนา" };
  if (!canAccessConvUnit(args.unitAccess, conv.unitId)) return { ok: false, reason: "ไม่มีสิทธิ์เข้าถึงบทสนทนานี้" }; // M11
  // B5 (WO-C4): assigneeUserId มาจาก form ตรง ๆ — ถ้าไม่ตรวจ จะมอบหมายเธรดให้ user ของร้านอื่นได้
  // (เธรดหลุดไปอยู่ในมือคนนอก + ชื่อคนนอกโผล่ในหน้าจอทีม) · null = ปล่อยว่าง ไม่ต้องตรวจ
  if (args.assigneeUserId) {
    const staff = await listStaff(args.tenantId);
    if (!staff.some((s) => s.userId === args.assigneeUserId)) {
      return { ok: false, reason: "ผู้รับมอบหมายไม่ใช่สมาชิกของร้านนี้" };
    }
  }
  await prisma.chatConversation.update({
    where: { id: conv.id },
    data: { assigneeUserId: args.assigneeUserId },
  });
  await logEvent(conv.id, {
    tenantId: args.tenantId,
    systemId: args.systemId,
    type: "ASSIGNED",
    actorUserId: args.actorUserId,
    meta: { fromUserId: conv.assigneeUserId, toUserId: args.assigneeUserId },
  });
  return { ok: true };
}

export async function markRead(args: {
  tenantId: string;
  systemId: string;
  conversationId: string;
  userId: string;
  lastReadMessageId?: string;
  unitAccess?: string[]; // M11
}): Promise<void> {
  const conv = await prisma.chatConversation.findFirst({
    where: { id: args.conversationId, tenantId: args.tenantId, systemId: args.systemId },
  });
  if (!conv) return;
  if (!canAccessConvUnit(args.unitAccess, conv.unitId)) return; // M11

  // 🔴 "ทีมเพิ่งกดอ่าน" = ตอนที่ยังมี unread ค้างอยู่เท่านั้น
  //    หน้า inbox เรียก markRead ทุกครั้งที่เปิดห้อง/รีเฟรช ⇒ ถ้ายิง event ทุกครั้ง
  //    ระบบปลายทางจะโดนถล่มด้วย event ที่ไม่ได้เปลี่ยนอะไรเลย
  const hadUnread = conv.staffUnreadCount > 0;
  // กุญแจกันซ้ำ = "อ่านถึงเวลาไหนของห้องนี้" — ลูกค้าทักใหม่ `lastMessageAt` ขยับ ⇒ ได้กุญแจใหม่
  // ⚠️ ใช้ค่าที่ denormalize ไว้บนห้องอยู่แล้ว ไม่ไปไล่หาข้อความล่าสุด — ประหยัด query หนึ่งคำสั่ง
  //    และไม่ต้องพึ่งลำดับ (การเรียงข้อความที่ createdAt ชนกันไม่มีคำตอบเดียว)
  const readMark = hadUnread ? (conv.lastMessageAt?.toISOString() ?? "none") : null;
  // ⚠️ อ่านแยกคำสั่ง ไม่ใช้ `include` — ตัวตนของลูกค้าจำเป็นเฉพาะตอนจะยิง event เท่านั้น
  //    (การกดอ่านซ้ำ ๆ ซึ่งเป็นกรณีส่วนใหญ่ จึงไม่ต้องแบก join ทุกครั้ง)
  const contact = hadUnread
    ? await prisma.chatContact.findUnique({
        where: { id: conv.contactId },
        select: { externalUserId: true },
      })
    : null;

  await prisma.$transaction(async (tx) => {
    await tx.chatReadState.upsert({
      where: { conversationId_userId: { conversationId: conv.id, userId: args.userId } },
      create: {
        tenantId: args.tenantId,
        systemId: args.systemId,
        conversationId: conv.id,
        userId: args.userId,
        lastReadMessageId: args.lastReadMessageId ?? null,
      },
      update: { lastReadMessageId: args.lastReadMessageId ?? null, lastReadAt: new Date() },
    });
    await tx.chatConversation.update({
      where: { id: conv.id },
      data: { staffUnreadCount: 0 },
    });
    // ระบบปลายทาง (เช่น SiamDive) เอาไปทำติ๊กคู่ ✓✓ ให้ลูกค้าเห็นว่าทีมอ่านแล้ว
    // แม้ทีมจะยังไม่ได้พิมพ์ตอบ — พฤติกรรมเดียวกับ WhatsApp (เจ้าของสั่ง 29 ส.ค. 2026)
    if (hadUnread) {
      await emitOutbox(tx, {
        tenantId: args.tenantId,
        type: "chat.conversation.read",
        idempotencyKey: `chat.read.${conv.id}.${readMark}`,
        payload: {
          conversationId: conv.id,
          externalUserId: contact?.externalUserId ?? null,
          channel: conv.channel,
          lastReadMessageId: args.lastReadMessageId ?? null,
        },
        systemId: args.systemId,
        unitId: conv.unitId,
      });
    }
  });
  // 🔴 ปลุกตัวส่ง outbox ทันที — ไม่งั้น event นอนรอ cron รายชั่วโมง
  //    ปลายทางจะเห็นติ๊กคู่ ✓✓ ช้าเป็นชั่วโมง = เท่ากับใช้งานไม่ได้ (เจ้าของเจอจริง 30 ส.ค. 2026)
  //    ทุกจุดที่ emit ในไฟล์นี้ทำแบบเดียวกันหมด (ข้อสอบ CP-5 ล็อกไว้ว่าห้ามลืม)
  if (hadUnread) scheduleDrain();
}

// ผูก/ถอด contact เข้ากับสมาชิก (ต้องเชื่อม memberSystemId ก่อน)
export async function linkCustomer(args: {
  tenantId: string;
  systemId: string;
  contactId: string;
  actorUserId: string;
  phone?: string;
  customerId?: string | null;
  unitAccess?: string[]; // M11/B6
}): Promise<{ ok: boolean; reason?: string }> {
  const setting = await prisma.chatSetting.findUnique({ where: { systemId: args.systemId } });
  if (!setting?.memberSystemId) return { ok: false, reason: "ยังไม่ได้เชื่อมระบบสมาชิก" };
  const contact = await prisma.chatContact.findFirst({
    where: { id: args.contactId, tenantId: args.tenantId, systemId: args.systemId },
  });
  if (!contact) return { ok: false, reason: "ไม่พบผู้ติดต่อ" };

  // B6 (WO-C4): ChatContact ไม่มี unitId ของตัวเอง — unit ผูกอยู่ที่ conversation
  // → ใช้เธรดล่าสุดของ contact เป็นตัวตัดสินสิทธิ์ เหมือน getThread/sendReply/assign (M11)
  // (เธรดนี้คือตัวเดียวกับที่ใช้ลง CUSTOMER_LINKED ท้ายฟังก์ชัน — query ครั้งเดียวพอ)
  // contact ที่ยังไม่มีเธรดเลย = ไม่ผูก unit → ไม่มีอะไรให้รั่วข้าม unit
  const conv = await prisma.chatConversation.findFirst({
    where: { systemId: args.systemId, contactId: contact.id },
    orderBy: { lastMessageAt: "desc" },
  });
  if (conv && !canAccessConvUnit(args.unitAccess, conv.unitId)) {
    return { ok: false, reason: "ไม่มีสิทธิ์เข้าถึงบทสนทนานี้" };
  }

  // ถอด
  if (args.customerId === null) {
    await prisma.chatContact.update({
      where: { id: contact.id },
      data: { customerId: null, linkedAt: null, linkedByUserId: null },
    });
    return { ok: true };
  }

  let customerId = args.customerId ?? null;
  // ผูกจากเบอร์ → findOrCreate สมาชิก
  if (!customerId && args.phone?.trim()) {
    const c = await member.findOrCreate({
      tenantId: args.tenantId,
      memberSystemId: setting.memberSystemId,
      phone: args.phone.trim(),
      name: contact.displayName ?? undefined,
      source: "STAFF",
    });
    customerId = c.id;
  }
  if (!customerId) return { ok: false, reason: "ระบุเบอร์หรือสมาชิกที่จะผูก" };

  await prisma.chatContact.update({
    where: { id: contact.id },
    data: {
      customerId,
      phone: args.phone?.trim() || contact.phone,
      linkedAt: new Date(),
      linkedByUserId: args.actorUserId,
    },
  });
  if (conv) {
    await logEvent(conv.id, {
      tenantId: args.tenantId,
      systemId: args.systemId,
      type: "CUSTOMER_LINKED",
      actorUserId: args.actorUserId,
      meta: { contactId: contact.id, customerId },
    });
  }
  return { ok: true };
}

// อ่านโปรไฟล์สมาชิกที่ผูก (panel ข้างจอ) — ผ่าน read service ของ Member
export async function getLinkedMember(tenantId: string, customerId: string) {
  try {
    const p = await member.getProfile(tenantId, customerId);
    return p?.customer ?? null;
  } catch {
    return null;
  }
}

// ───────────────────────── public thread (สัญญา §3.2 — ใช้ร่วมกันทุกช่องทาง) ─────────────────────────
// 🔴 B3: ของเดิม (`getWebchatThread`) คืนแค่ 4 ฟิลด์ — ไม่มี `type`/`attachments` ⇒ รูป/สติกเกอร์/ไฟล์
//    แสดงเป็นช่องว่างในฝั่งลูกค้า · shape นี้เป็น "สัญญาสาธารณะ" เปลี่ยนทีหลัง = ลูกค้าพัง (D2)
// 🔴 กติกาที่ห้ามหลุด: `isInternal: false` — โน้ตภายในของทีมห้ามถึงลูกค้าเด็ดขาด

// 🔴 กติกาที่ห้ามหลุด ประกาศ **ที่เดียว**: ทุกจุดที่ตอบลูกค้า (อ่านเธรด/นับที่ยังไม่อ่าน/…)
//    ต้องใช้ตัวนี้ ห้ามพิมพ์เงื่อนไขซ้ำ — เขียนซ้ำเมื่อไหร่คือวันที่ลืมข้อหนึ่งแล้วโน้ตทีมหลุด
const CUSTOMER_VISIBLE = { isInternal: false } as const;

export type PublicAttachment = {
  url: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
};

export type PublicMsg = {
  id: string;
  direction: ChatMessageDirection;
  type: ChatMessageType;
  body: string | null;
  attachments: PublicAttachment[];
  senderName: string | null;
  createdAt: string;
};

export type PublicThread = {
  conversationId?: string;
  status?: ChatConversationStatus;
  messages: PublicMsg[];
};

const PUBLIC_THREAD_MAX = 200;

function toPublicMsg(
  m: ChatMessage & { attachments?: ChatAttachment[] },
  alias: string | null,
): PublicMsg {
  return {
    id: m.id,
    direction: m.direction,
    type: m.type,
    body: m.body ?? null,
    attachments: (m.attachments ?? []).map((a) => ({
      url: a.url,
      name: a.fileName,
      mimeType: a.mimeType,
      sizeBytes: a.sizeBytes,
      width: a.width ?? null,
      height: a.height ?? null,
    })),
    // ลูกค้าเห็นได้เฉพาะชื่อฝั่งร้าน (นามแฝง) — ห้ามหลุดชื่อพนักงานจริง · IN = ตัวเขาเอง ไม่ต้องมีชื่อ
    senderName: m.direction === "OUT" ? (m.senderName ?? alias) : null,
    createdAt: m.createdAt.toISOString(),
  };
}

export async function publicThread(args: {
  connection: ChatChannelConnection;
  externalUserId: string;
  after?: Date;
  limit?: number;
}): Promise<PublicThread> {
  const { connection } = args;
  const contact = await prisma.chatContact.findFirst({
    where: {
      systemId: connection.systemId,
      channelConnectionId: connection.id,
      externalUserId: args.externalUserId,
    },
  });
  if (!contact) return { messages: [] };
  const conv = await prisma.chatConversation.findFirst({
    where: { systemId: connection.systemId, contactId: contact.id },
    orderBy: { lastMessageAt: "desc" },
  });
  if (!conv) return { messages: [] };

  const rows = await prisma.chatMessage.findMany({
    where: {
      systemId: connection.systemId,
      conversationId: conv.id,
      ...CUSTOMER_VISIBLE, // 🔴 โน้ตภายในห้ามหลุดถึงลูกค้า
      ...(args.after ? { createdAt: { gt: args.after } } : {}),
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: Math.min(Math.max(args.limit ?? 100, 1), PUBLIC_THREAD_MAX),
    include: { attachments: true },
  });

  const setting = await prisma.chatSetting.findUnique({ where: { systemId: connection.systemId } });
  const alias = setting?.senderAlias ?? null;

  return {
    conversationId: conv.id,
    status: conv.status,
    messages: rows.map((m) => toPublicMsg(m, alias)),
  };
}

// public: อ่านเธรดของ guest (widget polling) — ห่อ publicThread ตัวเดียวกับ API v1
// (ห้ามเขียน logic ซ้ำ 2 ที่ ไม่งั้น widget กับ SiamDive เห็นข้อความไม่เหมือนกัน)
export async function getWebchatThread(
  connection: ChatChannelConnection,
  guestToken: string,
): Promise<PublicThread> {
  return publicThread({ connection, externalUserId: guestToken });
}

// ═════════════ ชั้น 1 สำหรับ Public API v1 (WO-C3) ═════════════
// ทุกอย่างที่ `/api/v1/chat/*` ต้องใช้ อยู่ที่นี่ทั้งหมด — ชั้น route ห้ามมี logic ธุรกิจ
// (กฎเหล็กข้อ 1 §2: ไม่งั้น widget ฝังกับ SiamDive จะได้พฤติกรรมคนละแบบ)

// ───────────────────────── กุญแจสาธารณะของ widget (M1) ─────────────────────────
// รูปแบบเดียวกับ ApiKey ทุกประการ: raw = `swk_` + 16 ไบต์สุ่ม (hex 32) โชว์ **ครั้งเดียว**
// DB เก็บเฉพาะ sha256(raw) ใน publicKeyHash · prefix 12 ตัวแรกไว้โชว์ในตาราง
// (คนละ prefix กับ secret key `shark_` — สลับกันใช้แล้วต้องหลุด 401 ทั้งสองทาง)

const WIDGET_KEY_PREFIX = "swk_";
const sha256hex = (s: string) => createHash("sha256").update(s).digest("hex");

/** origin ให้เทียบกันได้: ตัวพิมพ์เล็ก + ไม่มี / ปิดท้าย · ไม่ใช่ origin ที่ถูกต้อง → null */
export function normalizeOrigin(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const raw = value.trim().replace(/\/+$/, "");
  if (!raw) return null;
  try {
    const u = new URL(raw);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.origin.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * รายการ origin ที่ connection นี้ยอมให้เรียกจากเบราว์เซอร์
 * 🔴 ว่าง = **ปฏิเสธทุก origin** (ปลอดภัยโดยปริยาย) ไม่ใช่ยอมทุกอัน — ห้ามแปลงเป็น "*"
 */
export function originAllowlistOf(conn: { originAllowlist: Prisma.JsonValue }): string[] {
  const raw = conn.originAllowlist;
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const v of raw) {
    const n = normalizeOrigin(v);
    if (n && !out.includes(n)) out.push(n);
  }
  return out;
}

export function isOriginAllowed(
  conn: { originAllowlist: Prisma.JsonValue },
  origin: string | null,
): boolean {
  const n = normalizeOrigin(origin);
  if (!n) return false; // ไม่มี Origin = ตัดสินไม่ได้ = ไม่อนุญาต
  return originAllowlistOf(conn).includes(n);
}

export type CreatedWidgetKey = { rawKey: string; prefix: string };

/** ออกกุญแจ widget ใหม่ให้ connection (ทับของเดิม = หมุนกุญแจ) — คืน raw ให้โชว์ครั้งเดียว */
export async function createWidgetKey(
  tenantId: string,
  systemId: string,
  connectionId: string,
): Promise<CreatedWidgetKey | null> {
  const conn = await getConnection(tenantId, systemId, connectionId);
  if (!conn) return null;
  const rawKey = `${WIDGET_KEY_PREFIX}${randomBytes(16).toString("hex")}`;
  await prisma.chatChannelConnection.update({
    where: { id: conn.id },
    data: { publicKeyHash: sha256hex(rawKey), publicKeyPrefix: rawKey.slice(0, 12) },
  });
  return { rawKey, prefix: rawKey.slice(0, 12) };
}

/** ยกเลิกกุญแจ widget (widget ที่ฝังไว้จะใช้ไม่ได้ทันที) */
export async function revokeWidgetKey(
  tenantId: string,
  systemId: string,
  connectionId: string,
): Promise<boolean> {
  const conn = await getConnection(tenantId, systemId, connectionId);
  if (!conn) return false;
  await prisma.chatChannelConnection.update({
    where: { id: conn.id },
    data: { publicKeyHash: null, publicKeyPrefix: null },
  });
  return true;
}

/** ตั้งรายชื่อโดเมนที่ฝัง widget ได้ — ค่าที่ไม่ใช่ origin จะถูกทิ้ง (ไม่เงียบ: คืนรายการที่บันทึกจริง) */
export async function setOriginAllowlist(
  tenantId: string,
  systemId: string,
  connectionId: string,
  origins: unknown[],
): Promise<string[] | null> {
  const conn = await getConnection(tenantId, systemId, connectionId);
  if (!conn) return null;
  const clean: string[] = [];
  for (const o of origins) {
    const n = normalizeOrigin(o);
    if (n && !clean.includes(n)) clean.push(n);
  }
  await prisma.chatChannelConnection.update({
    where: { id: conn.id },
    data: { originAllowlist: clean },
  });
  return clean;
}

/**
 * หา connection จากกุญแจ widget ดิบ — เทียบด้วย hash เท่านั้น (raw ไม่เคยถูกเก็บ)
 * ไม่ขึ้นต้น `swk_` → null ทันที ⇒ secret key (`shark_`) เอามาใส่ `X-Shark-Widget` ไม่ได้
 */
export async function getConnectionByPublicKey(
  rawKey: unknown,
): Promise<ChatChannelConnection | null> {
  if (typeof rawKey !== "string" || !rawKey.startsWith(WIDGET_KEY_PREFIX)) return null;
  const conn = await prisma.chatChannelConnection.findUnique({
    where: { publicKeyHash: sha256hex(rawKey) },
  });
  if (!conn || conn.status === "DISABLED") return null;
  return conn;
}

/**
 * preflight (OPTIONS) มาถึงก่อนเบราว์เซอร์ส่ง `X-Shark-Widget` เสมอ (spec ของ CORS)
 * ⇒ ตัดสินได้แค่ว่า "origin นี้มีร้านไหนอนุญาตไว้บ้างไหม" · ปลอดภัยเพราะ preflight ไม่พาข้อมูลใด ๆ
 *   คำขอจริงยังถูกตรวจกับ allowlist ของ connection ที่เป็นเจ้าของกุญแจอีกชั้น
 * (แถวที่ต้องอ่านคือ connection ที่เปิด widget เท่านั้น — วันนี้นับหลักสิบ · เกินหลักพันเมื่อไหร่
 *  ค่อยเปลี่ยนไปใช้ `array_contains` ที่ระดับ DB)
 */
export async function isOriginAllowedForAnyWidget(origin: string | null): Promise<boolean> {
  const n = normalizeOrigin(origin);
  if (!n) return false;
  const rows = await prisma.chatChannelConnection.findMany({
    where: { publicKeyHash: { not: null }, status: { not: "DISABLED" } },
    select: { originAllowlist: true },
    take: 1000,
  });
  return rows.some((r) => originAllowlistOf(r).includes(n));
}

// ───────────────────────── resolve ระบบ CHAT จากกุญแจ (secret mode) ─────────────────────────
// 🔴 API key ผูกกับ **ร้าน** ไม่ใช่ระบบ — แต่ข้อมูลแชทอยู่ใต้ระบบ (AppSystem type CHAT)
//    กติกา §2 ข้อ 2: tenantId มาจากกุญแจเสมอ · systemId จึงต้อง resolve จาก tenant ของกุญแจ
//    ร้านที่มีระบบ CHAT หลายชุด ระบุเจาะจงได้ด้วย header แต่ **ต้องเป็นระบบของร้านตัวเองเท่านั้น**
export async function resolveChatSystemId(
  tenantId: string,
  requestedSystemId?: string | null,
): Promise<string | null> {
  const want = requestedSystemId?.trim();
  if (want) {
    const sys = await prisma.appSystem.findFirst({
      where: { id: want, tenantId, type: "CHAT", active: true },
    });
    return sys?.id ?? null; // ระบบของร้านอื่น/ไม่ใช่ CHAT → null (ผู้เรียกตอบ 403)
  }
  const first = await prisma.appSystem.findFirst({
    where: { tenantId, type: "CHAT", active: true },
    orderBy: { createdAt: "asc" },
  });
  return first?.id ?? null;
}

// ───────────────────────── POST /identities (secret) ─────────────────────────
// ออก/ผูก contact ล่วงหน้าโดยยังไม่มีข้อความ — SiamDive เรียกตอนผู้ใช้ยืนยันอีเมล/เปลี่ยนภาษา
// 🔴 ไม่สร้าง conversation ใหม่: เธรดเปล่าที่ไม่มีข้อความจะไปโผล่ในกล่องงานของทีมโดยไม่มีอะไรให้ตอบ
//    → คืน conversationId เฉพาะเธรดที่ "มีอยู่แล้ว" เท่านั้น
export async function upsertExternalIdentity(args: {
  connection: ChatChannelConnection;
  externalUserId: string;
  displayName?: string;
  meta?: Record<string, unknown>;
} & ExternalIdentityFields): Promise<
  { ok: true; contactId: string; conversationId?: string } | { ok: false; reason: string }
> {
  const { connection } = args;
  const externalUserId = (args.externalUserId ?? "").trim();
  if (!externalUserId) return { ok: false, reason: "ไม่ได้ระบุผู้ใช้ต้นทาง" };

  let contact;
  try {
    contact = await findOrCreateContact({
      tenantId: connection.tenantId,
      systemId: connection.systemId,
      channel: connection.type,
      connectionId: connection.id,
      externalUserId,
      profile: args.displayName ? { displayName: args.displayName } : undefined,
      capNewPerHour: NEW_CONTACT_CAP_PER_HOUR,
    });
  } catch (e) {
    if (e instanceof ContactCapError) return { ok: false, reason: e.message };
    throw e;
  }
  contact = await applyContactIdentity(contact, args);

  const conv = await prisma.chatConversation.findFirst({
    where: { systemId: connection.systemId, contactId: contact.id },
    orderBy: { lastMessageAt: "desc" },
  });
  // meta (บริบท §3.3) เขียนได้เฉพาะเมื่อมีเธรดอยู่แล้ว — merge ทับของเดิมเหมือนขาส่งข้อความ
  if (conv && args.meta && Object.keys(args.meta).length > 0) {
    const prev =
      conv.meta && typeof conv.meta === "object" && !Array.isArray(conv.meta)
        ? (conv.meta as Record<string, unknown>)
        : {};
    await prisma.chatConversation.update({
      where: { id: conv.id },
      data: { meta: { ...prev, ...args.meta } as Prisma.InputJsonValue },
    });
  }
  return { ok: true, contactId: contact.id, ...(conv ? { conversationId: conv.id } : {}) };
}

// ───────────────────────── ลูกค้าอ่าน / ยังไม่ได้อ่าน (POST /read · GET /unread) ─────────────────────────
// ⚠️ ข้อจำกัดของ schema วันนี้: ไม่มีที่เก็บ "ลูกค้าอ่านถึงไหน" แยกต่างหาก
//    (`ChatConversation.staffUnreadCount` เป็นของทีมงาน — เอามาใช้ = แบดจ์ของทีมหายเวลาลูกค้าเปิดอ่าน)
//    → ใช้ `ChatReadState` ร่วมกัน โดยตั้ง userId = `contact:<contactId>`
//    ชนกับ userId จริงไม่ได้เพราะ id ของผู้ใช้เป็น cuid ที่ไม่มี ":" · ห้ามแตะ schema ในรอบนี้ (WO-C3)
const CUSTOMER_READER = (contactId: string) => `contact:${contactId}`;

async function publicContact(connection: ChatChannelConnection, externalUserId: string) {
  return prisma.chatContact.findFirst({
    where: {
      systemId: connection.systemId,
      channelConnectionId: connection.id,
      externalUserId,
    },
  });
}

export async function markCustomerRead(args: {
  connection: ChatChannelConnection;
  externalUserId: string;
  lastReadMessageId?: string;
}): Promise<{ ok: boolean; conversationId?: string }> {
  const { connection } = args;
  const contact = await publicContact(connection, args.externalUserId);
  if (!contact) return { ok: true }; // ยังไม่เคยทัก = ไม่มีอะไรให้ทำเครื่องหมาย (ไม่ใช่ error)
  const conv = await prisma.chatConversation.findFirst({
    where: { systemId: connection.systemId, contactId: contact.id },
    orderBy: { lastMessageAt: "desc" },
  });
  if (!conv) return { ok: true };
  const userId = CUSTOMER_READER(contact.id);
  await prisma.chatReadState.upsert({
    where: { conversationId_userId: { conversationId: conv.id, userId } },
    create: {
      tenantId: connection.tenantId,
      systemId: connection.systemId,
      conversationId: conv.id,
      userId,
      lastReadMessageId: args.lastReadMessageId ?? null,
    },
    update: { lastReadMessageId: args.lastReadMessageId ?? null, lastReadAt: new Date() },
  });
  return { ok: true, conversationId: conv.id };
}

/** จำนวนข้อความจากร้านที่ลูกค้ายังไม่ได้อ่าน (ไม่นับโน้ตภายใน — ลูกค้าไม่เคยเห็นอยู่แล้ว) */
export async function customerUnreadCount(args: {
  connection: ChatChannelConnection;
  externalUserId: string;
}): Promise<number> {
  const { connection } = args;
  const contact = await publicContact(connection, args.externalUserId);
  if (!contact) return 0;
  const conv = await prisma.chatConversation.findFirst({
    where: { systemId: connection.systemId, contactId: contact.id },
    orderBy: { lastMessageAt: "desc" },
  });
  if (!conv) return 0;
  const state = await prisma.chatReadState.findUnique({
    where: {
      conversationId_userId: { conversationId: conv.id, userId: CUSTOMER_READER(contact.id) },
    },
  });
  return prisma.chatMessage.count({
    where: {
      systemId: connection.systemId,
      conversationId: conv.id,
      direction: "OUT",
      ...CUSTOMER_VISIBLE, // โน้ตภายในไม่นับ — ลูกค้าไม่เคยเห็นอยู่แล้ว
      ...(state?.lastReadAt ? { createdAt: { gt: state.lastReadAt } } : {}),
    },
  });
}

// ───────────────────────── GET /config (widget + secret) ─────────────────────────
export type PublicConfig = {
  greeting: string | null;
  offlineMessage: string | null;
  locales: string[];
  theme: Record<string, unknown>;
  widgetEnabled: boolean;
  /** เวลาทำการของทีมตอบแชท (WO-C16) · null = ร้านยังไม่ได้ตั้ง → ผู้รับ fallback เอง */
  businessHours: PublicBusinessHours | null;
};

export type PublicBusinessHours = {
  tz: string;
  note: string | null;
  days: BusinessDay[];
  holidays: string[];
};

/** หน้าตา/ข้อความต้อนรับของ widget ตามภาษาที่ขอ — ผ่าน resolveLocale เสมอ (ห้ามฮาร์ดโค้ด .th) */
export async function publicConfig(
  connection: ChatChannelConnection,
  lang?: string | null,
): Promise<PublicConfig> {
  const row = await prisma.chatSetting.findUnique({ where: { systemId: connection.systemId } });
  const greetingMap = toLocaleMap(row?.greetingMessage);
  const offlineMap = toLocaleMap(row?.offlineMessage);
  const locales = [...new Set([...Object.keys(greetingMap), ...Object.keys(offlineMap)])];
  const theme =
    row?.theme && typeof row.theme === "object" && !Array.isArray(row.theme)
      ? (row.theme as Record<string, unknown>)
      : {};
  return {
    greeting: resolveLocale(greetingMap, lang),
    offlineMessage: resolveLocale(offlineMap, lang),
    locales,
    theme,
    widgetEnabled: row?.widgetEnabled ?? true,
    businessHours: publicBusinessHours(row?.businessHours, lang),
  };
}

/**
 * แปลงค่าที่เก็บไว้เป็นรูปตามสัญญา §3.2 · ไม่ได้ตั้ง/รูปเพี้ยน → null
 *
 * `note` รองรับทั้งสตริงเดียวและ map ภาษา:
 * 🔴 คลี่ด้วย `resolveLocale` **ก่อน** แล้วค่อยแปลง "" เป็น null — ห้ามสลับลำดับ
 *    เพราะ `""` ของภาษาหนึ่งคือ "ร้านตั้งใจไม่ให้มีข้อความในภาษานี้" ถ้าตัดทิ้งก่อน resolve
 *    ตัวคลี่จะไหลไปหยิบข้อความภาษาอื่นมาแสดงแทน ([[feedback_render_all_locales_before_ship]])
 */
export function publicBusinessHours(raw: unknown, lang?: string | null): PublicBusinessHours | null {
  const bh = readBusinessHours(raw);
  if (!bh) return null;
  const resolved = typeof bh.note === "string" ? bh.note : resolveLocale(bh.note, lang);
  return {
    tz: bh.tz,
    note: resolved === null || resolved === "" ? null : resolved,
    days: bh.days,
    holidays: bh.holidays,
  };
}
