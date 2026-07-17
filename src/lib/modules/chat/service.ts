import { Prisma } from "@prisma/client";
import type {
  ChatChannelType,
  ChatChannelConnection,
  ChatConversation,
  ChatMessageType,
} from "@prisma/client";
import { prisma } from "@/lib/core/db";
import { emitOutbox } from "@/lib/core/outbox";
import { drainAll } from "@/lib/outbox-consumers";
import * as member from "@/lib/modules/member/service";
import { getAdapter, ChannelDeliveryError } from "./adapter";
import type { ChannelCreds, InboundMessage } from "./adapter";
import { encryptCreds, decryptCreds, mask } from "./crypto";

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

export async function getConnection(connectionId: string) {
  return prisma.chatChannelConnection.findUnique({ where: { id: connectionId } });
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

export async function getSetting(tenantId: string, systemId: string) {
  const existing = await prisma.chatSetting.findUnique({ where: { systemId } });
  if (existing) return existing;
  return prisma.chatSetting.create({ data: { tenantId, systemId } });
}

export async function setMemberSystem(
  tenantId: string,
  systemId: string,
  memberSystemId: string | null,
) {
  await prisma.chatSetting.upsert({
    where: { systemId },
    create: { tenantId, systemId, memberSystemId },
    update: { memberSystemId },
  });
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
  return (body ?? "").replace(/\s+/g, " ").trim().slice(0, 140);
}

const CHANNEL_LABEL_TH: Record<string, string> = {
  LINE: "LINE",
  WEBCHAT: "แชทหน้าเว็บ",
  FACEBOOK: "Facebook",
  INSTAGRAM: "Instagram",
  SHOPEE: "Shopee",
  LAZADA: "Lazada",
  WHATSAPP: "WhatsApp",
};

// ───────────────────────── "ปิดโมดูลเงียบ": แจ้งเตือน + outbox หลังรับ inbound ─────────────────────────
// เรียกหลัง insert ChatMessage(direction IN) สำเร็จ (ไม่ใช่ duplicate). ทำใน 1 transaction:
//   1) อัปเดต denorm ของ conversation (lastMessage*, staffUnreadCount, status)
//   2) AppNotification "ลูกค้าทักเข้ามา" — de-dup: สร้างเฉพาะตอนเธรดเปลี่ยน
//      "อ่านครบ (staffUnreadCount=0)" → "มี unread" ครั้งแรก (ใช้ updateMany แบบ atomic ตัดสิน
//      กัน race + ลูกค้าพิมพ์รัวหลายบรรทัด = 1 แจ้งเตือน จนกว่าพนักงานจะอ่าน)
//   3) emitOutbox "chat.message.received" ทุกข้อความ (idempotencyKey ผูก messageId กัน webhook ซ้ำ)
// AppNotification เป็น tenant-wide (schema ไม่มี user/role targeting) — ไปโผล่ /app/notifications
async function announceInbound(args: {
  tenantId: string;
  systemId: string;
  unitId: string | null;
  conv: ChatConversation;
  messageId: string;
  channel: ChatChannelType;
  contactLabel: string;
  previewText: string;
  sentAt: Date;
}): Promise<void> {
  const { tenantId, systemId, conv } = args;
  const nextStatus = conv.status === "PENDING" ? "OPEN" : conv.status;
  const denorm = {
    lastMessageAt: args.sentAt,
    lastMessagePreview: args.previewText,
    lastMessageDirection: "IN",
    status: nextStatus,
  } satisfies Prisma.ChatConversationUpdateManyMutationInput;

  await prisma.$transaction(async (tx) => {
    // atomic: เธรด "อ่านครบ" (0) → flip เป็น 1 = transition ครั้งแรก (คนเดียวชนะ) → แจ้งเตือน
    const flipped = await tx.chatConversation.updateMany({
      where: { id: conv.id, staffUnreadCount: 0 },
      data: { ...denorm, staffUnreadCount: 1 },
    });
    const firstUnread = flipped.count === 1;
    if (!firstUnread) {
      // เดิมมี unread ค้างอยู่แล้ว → เพิ่มตัวนับเฉย ๆ (ไม่แจ้งซ้ำ)
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
      const channelTh = CHANNEL_LABEL_TH[args.channel] ?? args.channel;
      await tx.appNotification.create({
        data: {
          tenantId,
          title: "ลูกค้าทักเข้ามา",
          body: `${args.contactLabel} (${channelTh}): ${args.previewText || "ข้อความใหม่"} · เปิดห้องแชท /app/sys/${systemId}/chat?c=${conv.id}`,
        },
      });
    }
  });

  // drain outbox (automation/webhooks) — fire-and-forget เหมือน POS ให้ event เดินทันที
  void drainAll().catch(() => {});
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

// hook: ถ้าเชื่อมระบบ Member และ contact มีเบอร์แต่ยังไม่ผูก → findOrCreate + link (opt-in)
async function maybeAutoLinkMember(tenantId: string, systemId: string, contactId: string) {
  const setting = await prisma.chatSetting.findUnique({ where: { systemId } });
  if (!setting?.memberSystemId) return;
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

export async function sendReply(args: {
  tenantId: string;
  systemId: string;
  conversationId: string;
  senderUserId: string;
  body: string;
  isInternal?: boolean;
  unitAccess?: string[]; // M11
}): Promise<{ ok: boolean; reason?: string; messageId?: string }> {
  const body = args.body.trim();
  if (!body) return { ok: false, reason: "ข้อความว่าง" };
  if (body.length > 4000) return { ok: false, reason: "ข้อความยาวเกิน 4,000 ตัวอักษร" };

  const conv = await prisma.chatConversation.findFirst({
    where: { id: args.conversationId, tenantId: args.tenantId, systemId: args.systemId },
    include: { contact: true },
  });
  if (!conv) return { ok: false, reason: "ไม่พบบทสนทนา" };
  if (!canAccessConvUnit(args.unitAccess, conv.unitId)) return { ok: false, reason: "ไม่มีสิทธิ์เข้าถึงบทสนทนานี้" }; // M11

  const isInternal = !!args.isInternal;
  // insert OUT ก่อน (ทีมเห็นทันที) — PENDING สำหรับช่องทางภายนอก, SENT สำหรับ internal/webchat
  const willSend = !isInternal;
  const msg = await prisma.chatMessage.create({
    data: {
      tenantId: args.tenantId,
      systemId: args.systemId,
      conversationId: conv.id,
      direction: "OUT",
      type: "TEXT",
      senderUserId: args.senderUserId,
      body,
      isInternal,
      deliveryStatus: willSend && conv.channel !== "WEBCHAT" ? "PENDING" : "SENT",
    },
  });

  let failReason: string | undefined;
  if (willSend && conv.channel !== "WEBCHAT") {
    const connection = conv.channelConnectionId
      ? await prisma.chatChannelConnection.findUnique({ where: { id: conv.channelConnectionId } })
      : null;
    if (!connection || connection.status === "DISABLED") {
      failReason = "CHANNEL_DISCONNECTED";
    } else {
      try {
        const adapter = getAdapter(conv.channel);
        const result = await adapter.sendMessage({
          creds: credsOf(connection),
          externalUserId: conv.contact.externalUserId,
          message: { type: "TEXT", body },
        });
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

  // อัปเดต denormalized — internal ไม่ขึ้น preview, staff ตอบ = ล้าง unread
  if (!isInternal) {
    await prisma.chatConversation.update({
      where: { id: conv.id },
      data: {
        lastMessageAt: msg.createdAt,
        lastMessagePreview: preview(body),
        lastMessageDirection: "OUT",
        staffUnreadCount: 0,
        firstResponseAt: conv.firstResponseAt ?? new Date(),
      },
    });
  }

  return failReason
    ? { ok: false, reason: failReason, messageId: msg.id }
    : { ok: true, messageId: msg.id };
}

// ───────────────────────── Inbox reads ─────────────────────────

// M11: RBAC ต่อ unit — unitAccess = ["*"] เห็นทุก unit; ไม่งั้นเห็นเฉพาะ unit ที่เข้าถึง + เธรดไม่ผูก unit (null = ระดับระบบ)
export function canAccessConvUnit(unitAccess: string[] | undefined, unitId: string | null): boolean {
  if (!unitAccess || unitAccess.includes("*")) return true;
  if (unitId === null) return true; // เธรดไม่ผูก unit — ทีมของระบบเห็นได้
  return unitAccess.includes(unitId);
}

function unitAccessWhere(unitAccess?: string[]): Prisma.ChatConversationWhereInput {
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
  });
  if (!conv) return { ok: false, reason: "ไม่พบบทสนทนา" };
  if (!canAccessConvUnit(args.unitAccess, conv.unitId)) return { ok: false, reason: "ไม่มีสิทธิ์เข้าถึงบทสนทนานี้" }; // M11
  if (conv.status === args.status) return { ok: true };
  await prisma.chatConversation.update({
    where: { id: conv.id },
    data: {
      status: args.status,
      resolvedAt: args.status === "RESOLVED" ? new Date() : args.status === "OPEN" ? null : conv.resolvedAt,
    },
  });
  await logEvent(conv.id, {
    tenantId: args.tenantId,
    systemId: args.systemId,
    type: "STATUS_CHANGED",
    actorUserId: args.actorUserId,
    meta: { from: conv.status, to: args.status },
  });
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
  await prisma.chatReadState.upsert({
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
  await prisma.chatConversation.update({
    where: { id: conv.id },
    data: { staffUnreadCount: 0 },
  });
}

// ผูก/ถอด contact เข้ากับสมาชิก (ต้องเชื่อม memberSystemId ก่อน)
export async function linkCustomer(args: {
  tenantId: string;
  systemId: string;
  contactId: string;
  actorUserId: string;
  phone?: string;
  customerId?: string | null;
}): Promise<{ ok: boolean; reason?: string }> {
  const setting = await prisma.chatSetting.findUnique({ where: { systemId: args.systemId } });
  if (!setting?.memberSystemId) return { ok: false, reason: "ยังไม่ได้เชื่อมระบบสมาชิก" };
  const contact = await prisma.chatContact.findFirst({
    where: { id: args.contactId, tenantId: args.tenantId, systemId: args.systemId },
  });
  if (!contact) return { ok: false, reason: "ไม่พบผู้ติดต่อ" };

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
  const conv = await prisma.chatConversation.findFirst({
    where: { systemId: args.systemId, contactId: contact.id },
    orderBy: { lastMessageAt: "desc" },
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

// public: อ่านเธรดของ guest (widget polling) — คืนเฉพาะฟิลด์ปลอดภัย ไม่รวม internal note
export async function getWebchatThread(connection: ChatChannelConnection, guestToken: string) {
  const contact = await prisma.chatContact.findFirst({
    where: { systemId: connection.systemId, channelConnectionId: connection.id, externalUserId: guestToken },
  });
  if (!contact) return { messages: [] as PublicMsg[] };
  const conv = await prisma.chatConversation.findFirst({
    where: { systemId: connection.systemId, contactId: contact.id },
    orderBy: { lastMessageAt: "desc" },
  });
  if (!conv) return { messages: [] as PublicMsg[] };
  const rows = await prisma.chatMessage.findMany({
    where: { systemId: connection.systemId, conversationId: conv.id, isInternal: false },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: 100,
  });
  return {
    conversationId: conv.id,
    messages: rows.map<PublicMsg>((m) => ({
      id: m.id,
      direction: m.direction,
      body: m.body,
      createdAt: m.createdAt.toISOString(),
    })),
  };
}

type PublicMsg = { id: string; direction: string; body: string | null; createdAt: string };
