// pos-seam.ts — รอยต่อของโมดูลแชทสำหรับข้อความอัตโนมัติจากจุดขาย (POS P3.7 · R1 · มติผู้คุม 2 9)
//
// ผู้เรียกคือ composition root `src/lib/pos-chat-bridges.ts` (POS ไม่รู้จักแชท · แชทไม่รู้จัก POS) — ไฟล์นี้ **ไม่ import อะไรจาก POS/root**
// ทำไมต้องมีรอยต่อ (ไม่ใช้ของเดิม):
//   - `sendReply` ต้องมีพนักงานผู้ส่ง (senderUserId) — ข้อความของระบบไม่มีคนส่ง (คอลัมน์ยอมให้ null = "ระบบ/อัตโนมัติ")
//   - `pushToContact` ตั้งใจ "ไม่เขียนลงห้อง" (แคมเปญ) — แต่ใบเสร็จ/สถานะ/บอท ทีมต้องเห็นในห้อง เพื่อรับช่วงต่อได้ครบบริบท
//
// 🔴 ส่ง "ไม่เกินครั้งเดียว" (at-most-once · มติ 2): เขียนแถวก่อน (unique ChatMessage(conversationId, clientMessageId) = คีย์กันซ้ำของผู้เรียก)
//    แล้วจึงส่ง **นอกทรานแซกชัน** · ชนคีย์ (P2002) = {ok:true, duplicated:true} ไม่ส่งซ้ำ · ส่งไม่ผ่าน = แถว FAILED (+ เหตุการณ์ DELIVERY_FAILED
//    แบบเดียวกับ markDeliveryFailed) ไม่ลองใหม่เอง · ตายกลางทางหลังเขียนแถว = แถวค้าง PENDING (ไม่ส่งซ้ำ — ทีมเห็นและส่งเองได้)
// 🔴 ไม่เขียนแถวเลยเมื่อ: ไม่มีตัวตนแชท (NO_CHAT_IDENTITY) · ถูกบล็อก (BLOCKED) · ไม่มีห้อง (NO_CONVERSATION) · ไม่มีการเชื่อมต่อที่ใช้งาน (NO_CONNECTION)
// 🔴 ห้องเปลี่ยนเฉพาะ lastMessageAt/Preview/Direction — ไม่แตะสถานะ · ตัวนับยังไม่อ่าน · SLA (firstResponseAt) · ผู้รับผิดชอบ · ไม่แจ้งเตือนทีม
// 🔴 ไม่มีตรรกะความยินยอมที่นี่ (กติกาเดียวกับ party-bridge — ผู้เรียกตัดสิน) · ผู้ติดต่อของ Party/สมาชิก = LINE เท่านั้น (WEBCHAT ได้เฉพาะห้องที่ระบุตรง)
// 🔴 prisma ผ่าน `./db` · ทุก where ผูก tenantId · ไม่ throw ไม่ว่ากรณีใด · ไม่พิมพ์เนื้อความ/LINE id/เบอร์ลง log
import type { ChatChannelConnection, ChatChannelType, Prisma } from "@prisma/client";
import { prisma } from "./db";
import { ChannelDeliveryError, getAdapter, isSupported } from "./adapter";
import { credsOf, setConnectionStatus } from "./service";

export type PosNotifyTarget = { conversationId: string } | { partyId: string } | { customerId: string };
export type PosNotifyCode = "NO_CHAT_IDENTITY" | "BLOCKED" | "NO_CONNECTION" | "NO_CONVERSATION" | "SEND_FAILED" | "VALIDATION";
export type NotifyCustomerInput = {
  tenantId: string;
  target: PosNotifyTarget;
  /** ข้อความ (≤ 1000 ตัวอักษร · ผู้เรียกรับผิดชอบไม่ใส่ข้อมูลส่วนตัว) */
  text: string;
  /** คีย์กันซ้ำ (≤ 100) → ChatMessage.clientMessageId */
  dedupeKey: string;
  /** ชนิดข้อความของผู้เรียก (receipt · refund · order · ordpay · bot …) → meta.kind */
  kind: string;
  /** ระบบแชทที่อยากใช้ก่อน (ผู้ติดต่อของ Party/สมาชิก) — ไม่บังคับ */
  preferSystemId?: string | null;
};
export type NotifyCustomerResult =
  | { ok: true; duplicated?: boolean; messageId?: string; conversationId?: string; /** สถานะส่งของแถว (ซ้ำ = ของแถวเดิม · fix round 2 F2) */ deliveryStatus?: "PENDING" | "SENT" | "FAILED" }
  | { ok: false; code: PosNotifyCode; messageId?: string; conversationId?: string };
/** ตัวส่งที่ฉีดได้ (ข้อสอบ/ผู้เรียก) — throw = ส่งไม่สำเร็จ · ไม่ฉีด = adapter ของช่องทาง */
export type PosSeamSend = (m: { channel: ChatChannelType; externalUserId: string; text: string; tenantId: string; systemId: string; connectionId: string }) => Promise<{ externalMessageId?: string }>;
export type NotifyCustomerDeps = { send?: PosSeamSend };

const TEXT_MAX = 1000;
const KEY_MAX = 100;
const PREVIEW_MAX = 140;
const BODY_PEEK_MAX = 500;
const isStr = (v: unknown, max = 200): v is string => typeof v === "string" && v.trim().length > 0 && v.length <= max && !v.includes("\u0000");
const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const isUnique = (e: unknown) => (e as { code?: unknown } | null)?.code === "P2002";
const contactSelect = { id: true, systemId: true, channel: true, channelConnectionId: true, externalUserId: true, blockedAt: true } as const;

/** ผู้ติดต่อ LINE ล่าสุดที่ไม่ถูกบล็อกของ Party/สมาชิก (ระบบที่อยากใช้ก่อน) — ไม่มีเลย = NO_CHAT_IDENTITY · มีแต่ถูกบล็อก = BLOCKED */
async function lineContactOf(tenantId: string, by: { partyId: string } | { customerId: string }, prefer: string | null) {
  const base = { tenantId, channel: "LINE" as const, ...("partyId" in by ? { partyId: by.partyId } : { customerId: by.customerId }) };
  const order = [{ lastSeenAt: "desc" as const }, { createdAt: "desc" as const }];
  const live =
    (prefer ? await prisma.chatContact.findFirst({ where: { ...base, blockedAt: null, systemId: prefer }, orderBy: order, select: contactSelect }) : null) ??
    (await prisma.chatContact.findFirst({ where: { ...base, blockedAt: null }, orderBy: order, select: contactSelect }));
  if (live) return { contact: live } as const;
  const blocked = await prisma.chatContact.findFirst({ where: base, select: { id: true } });
  return { code: blocked ? ("BLOCKED" as const) : ("NO_CHAT_IDENTITY" as const) };
}

async function senderAliasOf(tenantId: string, systemId: string): Promise<string | null> {
  const s = await prisma.chatSetting.findFirst({ where: { systemId, tenantId }, select: { senderAlias: true } }).catch(() => null);
  return s?.senderAlias ?? null;
}

/**
 * ส่งข้อความของระบบ (ร้าน → ลูกค้า) ลงห้องแชท + ออกช่องทาง — ไม่เกินครั้งเดียวต่อ dedupeKey ต่อร้าน (ทุกห้อง · fix round 2 F3) · ไม่ throw
 * ลำดับ: ผู้ติดต่อ → ห้อง → การเชื่อมต่อ → เขียนแถว OUT (PENDING · senderUserId null) → ส่ง (นอก tx) → SENT/FAILED → denorm ห้อง
 */
export async function notifyCustomer(input: NotifyCustomerInput, deps?: NotifyCustomerDeps): Promise<NotifyCustomerResult> {
  try {
    if (!isRecord(input) || !isStr(input.tenantId) || !isRecord(input.target) || !isStr(input.dedupeKey, KEY_MAX) || !isStr(input.kind, 40)) return { ok: false, code: "VALIDATION" };
    const text = typeof input.text === "string" ? input.text.trim() : "";
    if (!text || text.length > TEXT_MAX) return { ok: false, code: "VALIDATION" };
    const tenantId = input.tenantId;
    const t = input.target as Record<string, unknown>;

    // ── ผู้ติดต่อ + ห้อง ──
    let conv: { id: string; systemId: string; channel: ChatChannelType; channelConnectionId: string | null; contactId: string } | null = null;
    let contact: { id: string; systemId: string; channel: ChatChannelType; channelConnectionId: string | null; externalUserId: string; blockedAt: Date | null } | null = null;
    if (isStr(t.conversationId)) {
      const c = await prisma.chatConversation.findFirst({
        where: { id: t.conversationId, tenantId },
        select: { id: true, systemId: true, channel: true, channelConnectionId: true, contactId: true, contact: { select: contactSelect } },
      });
      if (!c) return { ok: false, code: "NO_CONVERSATION" };
      if (c.contact.blockedAt) return { ok: false, code: "BLOCKED", conversationId: c.id };
      conv = { id: c.id, systemId: c.systemId, channel: c.channel, channelConnectionId: c.channelConnectionId, contactId: c.contactId };
      contact = c.contact;
    } else if (isStr(t.partyId) || isStr(t.customerId)) {
      const by = isStr(t.partyId) ? { partyId: t.partyId } : { customerId: t.customerId as string };
      const r = await lineContactOf(tenantId, by, isStr(input.preferSystemId) ? input.preferSystemId : null);
      if (!("contact" in r) || !r.contact) return { ok: false, code: r.code ?? "NO_CHAT_IDENTITY" };
      contact = r.contact;
      const c = await prisma.chatConversation.findFirst({
        where: { tenantId, contactId: contact.id },
        orderBy: [{ lastMessageAt: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
        select: { id: true, systemId: true, channel: true, channelConnectionId: true, contactId: true },
      });
      if (!c) return { ok: false, code: "NO_CONVERSATION" };
      conv = c;
    } else return { ok: false, code: "VALIDATION" };

    // ── คีย์นี้เคยส่งแล้วในห้องใดของร้าน (fix round 2 F3) — ห้องล่าสุดของผู้ติดต่อเปลี่ยนได้ (ห้องใหม่หลังปิดเรื่อง) ⇒ ห้ามส่งซ้ำในห้องใหม่ ──
    const seen = await prisma.chatMessage.findFirst({
      where: { tenantId, clientMessageId: input.dedupeKey, direction: "OUT", meta: { path: ["source"], equals: "pos" } },
      select: { id: true, conversationId: true, deliveryStatus: true },
    });
    if (seen) return { ok: true, duplicated: true, messageId: seen.id, conversationId: seen.conversationId, deliveryStatus: seen.deliveryStatus };

    // ── การเชื่อมต่อที่ใช้งานอยู่ของช่องทางนี้ ──
    const connId = conv.channelConnectionId ?? contact.channelConnectionId;
    const conn: ChatChannelConnection | null = connId ? await prisma.chatChannelConnection.findFirst({ where: { id: connId, tenantId } }) : null;
    if (!conn || conn.status !== "CONNECTED" || !isSupported(conv.channel)) return { ok: false, code: "NO_CONNECTION", conversationId: conv.id };

    // ── เขียนแถวก่อน (คีย์กันซ้ำ) ──
    const senderName = await senderAliasOf(tenantId, conv.systemId);
    let messageId: string;
    try {
      const row = await prisma.chatMessage.create({
        data: {
          tenantId,
          systemId: conv.systemId,
          conversationId: conv.id,
          direction: "OUT",
          type: "TEXT",
          senderUserId: null,
          senderName,
          body: text,
          clientMessageId: input.dedupeKey,
          deliveryStatus: "PENDING",
          meta: { source: "pos", kind: input.kind } as Prisma.InputJsonValue,
        },
        select: { id: true },
      });
      messageId = row.id;
    } catch (e) {
      if (isUnique(e)) {
        const prev = await prisma.chatMessage.findFirst({ where: { tenantId, conversationId: conv.id, clientMessageId: input.dedupeKey }, select: { id: true, deliveryStatus: true } }).catch(() => null);
        return { ok: true, duplicated: true, conversationId: conv.id, ...(prev ? { messageId: prev.id, deliveryStatus: prev.deliveryStatus } : {}) };
      }
      throw e;
    }

    // ── ส่ง (นอกทรานแซกชัน) ──
    let fail: string | null = null;
    let externalMessageId: string | null = null;
    try {
      if (deps?.send) {
        const r = await deps.send({ channel: conv.channel, externalUserId: contact.externalUserId, text, tenantId, systemId: conv.systemId, connectionId: conn.id });
        externalMessageId = typeof r?.externalMessageId === "string" ? r.externalMessageId : null;
      } else {
        const r = await getAdapter(conv.channel).sendMessage({ creds: credsOf(conn), externalUserId: contact.externalUserId, message: { type: "TEXT", body: text } });
        externalMessageId = typeof r?.externalMessageId === "string" ? r.externalMessageId : null;
      }
    } catch (e) {
      fail = e instanceof ChannelDeliveryError ? e.reason : "SEND_FAILED";
      if (fail === "TOKEN_EXPIRED") await setConnectionStatus(tenantId, conn.id, "ERROR", "TOKEN_EXPIRED").catch(() => undefined);
    }
    const now = new Date();
    if (fail) {
      await prisma.chatMessage.updateMany({ where: { id: messageId, tenantId }, data: { deliveryStatus: "FAILED", deliveryError: fail.slice(0, 100) } }).catch(() => undefined);
      await prisma.chatConversationEvent
        .create({ data: { tenantId, systemId: conv.systemId, conversationId: conv.id, type: "DELIVERY_FAILED", actorUserId: null, meta: { messageId, reason: fail.slice(0, 100) } } })
        .catch(() => undefined);
    } else {
      await prisma.chatMessage.updateMany({ where: { id: messageId, tenantId }, data: { deliveryStatus: "SENT", externalMessageId } }).catch(() => undefined);
    }
    // denorm เฉพาะ "ข้อความล่าสุด" (ไม่แตะสถานะ/ตัวนับ/SLA/ผู้รับผิดชอบ)
    await prisma.chatConversation
      .updateMany({ where: { id: conv.id, tenantId }, data: { lastMessageAt: now, lastMessagePreview: text.slice(0, PREVIEW_MAX), lastMessageDirection: "OUT" } })
      .catch(() => undefined);
    return fail ? { ok: false, code: "SEND_FAILED", messageId, conversationId: conv.id } : { ok: true, duplicated: false, messageId, conversationId: conv.id, deliveryStatus: "SENT" };
  } catch (e) {
    console.error("[chat/pos-seam] notifyCustomer", e instanceof Error ? e.name : "Error");
    return { ok: false, code: "SEND_FAILED" };
  }
}

export type PosBotContext = {
  conversationId: string;
  systemId: string;
  channel: ChatChannelType;
  unitId: string | null;
  contact: { id: string; partyId: string | null; customerId: string | null; lang: string | null };
  assigneeUserId: string | null;
  /** ISO · null = ไม่ได้พักบอท */
  posBotPausedUntil: string | null;
  /** ข้อความล่าสุดที่พนักงานส่ง (OUT · มีผู้ส่ง) — ISO · null = ไม่มี */
  lastStaffOutAt: string | null;
  lastIn: { id: string; type: string; body: string | null; at: string } | null;
  /** ข้อความเข้าที่ระบุ (input.messageId · ต้องเป็น IN ของห้องนี้) — ไม่ระบุ/ไม่พบ = null */
  message: { id: string; type: string; body: string | null; at: string } | null;
};

/** บริบทของห้องสำหรับบอทตามกฎ (อ่านอย่างเดียว) — ห้องของร้านอื่น/ไม่มี = null · ไม่ throw */
export async function botContext(input: { tenantId: string; conversationId: string; messageId?: string | null }): Promise<PosBotContext | null> {
  try {
    if (!isRecord(input) || !isStr(input.tenantId) || !isStr(input.conversationId)) return null;
    const { tenantId, conversationId } = input;
    const c = await prisma.chatConversation.findFirst({
      where: { id: conversationId, tenantId },
      select: { id: true, systemId: true, channel: true, unitId: true, assigneeUserId: true, meta: true, contact: { select: { id: true, partyId: true, customerId: true, lang: true } } },
    });
    if (!c) return null;
    const peek = { id: true, type: true, body: true, createdAt: true } as const;
    const [staff, lastIn, one] = await Promise.all([
      prisma.chatMessage.findFirst({ where: { tenantId, conversationId, direction: "OUT", senderUserId: { not: null } }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], select: { createdAt: true } }),
      prisma.chatMessage.findFirst({ where: { tenantId, conversationId, direction: "IN" }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], select: peek }),
      isStr(input.messageId) ? prisma.chatMessage.findFirst({ where: { id: input.messageId, tenantId, conversationId, direction: "IN" }, select: peek }) : Promise.resolve(null),
    ]);
    const view = (m: { id: string; type: string; body: string | null; createdAt: Date } | null) => (m ? { id: m.id, type: m.type, body: m.body ? m.body.slice(0, BODY_PEEK_MAX) : null, at: m.createdAt.toISOString() } : null);
    const raw = isRecord(c.meta) ? c.meta.posBotPausedUntil : null;
    const paused = typeof raw === "string" && Number.isFinite(Date.parse(raw)) ? new Date(raw).toISOString() : null;
    return {
      conversationId: c.id,
      systemId: c.systemId,
      channel: c.channel,
      unitId: c.unitId,
      contact: { id: c.contact.id, partyId: c.contact.partyId, customerId: c.contact.customerId, lang: c.contact.lang },
      assigneeUserId: c.assigneeUserId,
      posBotPausedUntil: paused,
      lastStaffOutAt: staff ? staff.createdAt.toISOString() : null,
      lastIn: view(lastIn),
      message: view(one),
    };
  } catch (e) {
    console.error("[chat/pos-seam] botContext", e instanceof Error ? e.name : "Error");
    return null;
  }
}

/** พัก/เลิกพักบอทของห้อง — เขียน meta.posBotPausedUntil เท่านั้น (คีย์อื่นของ meta คงเดิม) · ห้องของร้านอื่น = ok:false · ไม่ throw */
export async function setBotPaused(input: { tenantId: string; conversationId: string; until: Date | null }): Promise<{ ok: boolean; until?: string | null }> {
  try {
    if (!isRecord(input) || !isStr(input.tenantId) || !isStr(input.conversationId)) return { ok: false };
    const until = input.until instanceof Date && Number.isFinite(input.until.getTime()) ? input.until.toISOString() : null;
    const n = await prisma.$executeRaw`
      UPDATE "ChatConversation"
      SET "meta" = CASE WHEN jsonb_typeof("meta") = 'object' THEN "meta" ELSE '{}'::jsonb END || jsonb_build_object('posBotPausedUntil', ${until}::text)
      WHERE id = ${input.conversationId} AND "tenantId" = ${input.tenantId}`;
    return n === 1 ? { ok: true, until } : { ok: false };
  } catch (e) {
    console.error("[chat/pos-seam] setBotPaused", e instanceof Error ? e.name : "Error");
    return { ok: false };
  }
}
