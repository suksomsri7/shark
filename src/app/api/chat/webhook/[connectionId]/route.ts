import { NextResponse } from "next/server";
import { after } from "next/server"; // SVC D.9 ▸ W6: งานรูปทำหลังตอบ 200 ◂
import { prisma } from "@/lib/core/db";
import { Prisma, type ChatChannelConnection, type ChatChannelType } from "@prisma/client";
import { getAdapter, isSupported } from "@/lib/modules/chat/adapter";
import { replyLineMessages, pushLineMessagesToContact, type LineMessage } from "@/lib/modules/chat/line-flex";
import { normalizeLinkCode } from "@/lib/modules/chat/link-code";
import { credsOf, receiveInbound } from "@/lib/modules/chat/service";
import { dispatchPostback, handleLinkCodeText, type PostbackReply } from "@/lib/platform/postback-routes";

// LINE webhook (public — auth ด้วย signature ไม่ใช่ session)
// POST /api/chat/webhook/[connectionId]
// - resolve connection · verify x-line-signature · parseInbound → receiveInbound
// - ตอบ 200 เสมอ (ยกเว้น signature ผิด = 401) กัน LINE ปิด webhook
export async function POST(
  req: Request,
  { params }: { params: Promise<{ connectionId: string }> },
) {
  const { connectionId } = await params;
  const raw = await req.text();

  const connection = await prisma.chatChannelConnection.findUnique({
    where: { id: connectionId },
  });
  // ไม่พบ/ถูกถอด/ช่องทางยังไม่รองรับ → 200 เงียบ (log ด้านล่าง ไม่ throw ใส่ provider)
  if (!connection || connection.status === "DISABLED" || !isSupported(connection.type)) {
    return NextResponse.json({ ok: true });
  }

  const adapter = getAdapter(connection.type);
  const creds = credsOf(connection);

  const headers: Record<string, string | undefined> = {};
  req.headers.forEach((v, k) => (headers[k.toLowerCase()] = v));

  if (!adapter.verifyWebhook(raw, headers, creds)) {
    await logWebhook(connection.id, connection.type, "signature", "FAILED", "bad signature");
    return NextResponse.json({ error: "bad_signature" }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = raw ? JSON.parse(raw) : {};
  } catch {
    return NextResponse.json({ ok: true });
  }

  // ตอบ 200 ก่อน จากนั้นประมวลผล (P1 = inline; queue = เฟสถัดไป)
  try {
    const inbounds = adapter.parseInbound(payload, creds);
    for (const inbound of inbounds) {
      // dedupe ชั้น 1 — WebhookLog (กันประมวลซ้ำก่อนถึง ChatMessage)
      const first = await recordWebhook(connection.id, connection.type, inbound.externalMessageId);
      if (!first) continue;
      // SVC R0.7 ▸ ข้อความที่เป็นรูปรหัสผูก: ปิดบังเนื้อก่อนบันทึก (รหัสดิบไม่ค้างในห้องแชท/ตัวอย่างแจ้งเตือน/บอต)
      //   แล้วผูกรหัสด้วยข้อความจริงหลังบันทึก · ข้อความอื่นทุกชนิดเดินทางเดิมไม่เปลี่ยน ◂
      const linkText =
        connection.type === "LINE" && inbound.type === "TEXT" && inbound.body && normalizeLinkCode(inbound.body) ? inbound.body : null;
      await receiveInbound({ connection, inbound: linkText ? { ...inbound, body: LINK_CODE_MASK } : inbound });
      if (linkText) await handleLineLinkCode(connection, inbound.externalUserId, linkText, inbound.replyToken ?? null);
      // SVC D.9 ▸ รูปจากผู้เช่าหอ ⇒ แนบสลิปเข้าบิลค้างเดียวอัตโนมัติ (ไม่ใช่ผู้เช่า/กำกวม = รูปแชทธรรมดา) ◂
      if (connection.type === "LINE" && inbound.type === "IMAGE") await deferLineImage(connection, inbound.externalUserId, inbound.externalMessageId, inbound.replyToken ?? null);
    }
  } catch (e) {
    await logWebhook(
      connection.id,
      connection.type,
      "process",
      "FAILED",
      e instanceof Error ? e.message.slice(0, 200) : "error",
    );
  }

  // SVC R0.7 ▸ postback ของ LINE (ปุ่ม rich menu / Flex) — ctx มาจากแถว connection เสมอ ไม่อ่านจาก data ◂
  if (connection.type === "LINE") {
    for (const ev of lineEvents(payload)) {
      if (ev.type !== "postback") continue;
      try {
        await handleLinePostback(connection, ev);
      } catch {
        await logWebhook(connection.id, connection.type, "postback", "FAILED", "postback handler error");
      }
    }
  }

  return NextResponse.json({ ok: true });
}

// LINE ไม่ต้อง GET challenge — คืน 200 ให้ health check เฉย ๆ
export async function GET() {
  return NextResponse.json({ ok: true });
}

// dedupe ชั้น 1: insert WebhookLog (@@unique([connectionId, eventKey])) — ชน = ประมวลไปแล้ว
async function recordWebhook(
  connectionId: string,
  // 🔴 อ่านชนิดจาก enum จริง ห้ามพิมพ์ลิสต์ช่องทางซ้ำที่นี่ —
  //    ของเดิมพิมพ์ union ด้วยมือ พอเพิ่ม APP/TIKTOK เข้า enum ก็แดงทันที (WO-CW1)
  channelType: ChatChannelType,
  eventKey: string,
): Promise<boolean> {
  try {
    await prisma.chatWebhookLog.create({
      data: { connectionId, channelType, eventKey, status: "RECEIVED" },
    });
    return true;
  } catch {
    return false; // duplicate
  }
}

async function logWebhook(
  connectionId: string,
  channelType: ChatChannelType, // เหตุผลเดียวกับ recordWebhook — ชนิดมาจาก enum ที่เดียว
  eventKey: string,
  status: string,
  error?: string,
) {
  try {
    await prisma.chatWebhookLog.create({
      data: { connectionId, channelType, eventKey: `${eventKey}-${Date.now()}`, status, error },
    });
  } catch {
    /* noop */
  }
}

// ───────────── SVC R0.7 ▸ postback + รหัสผูก (LINE) ─────────────

/** ข้อความที่บันทึกแทนรหัสผูกที่ลูกค้าพิมพ์ */
const LINK_CODE_MASK = "[รหัสผูกบัญชี LINE]";

type LineEvent = {
  type?: string;
  webhookEventId?: string;
  replyToken?: string;
  timestamp?: number;
  source?: { userId?: string };
  postback?: { data?: string };
};

function lineEvents(payload: unknown): LineEvent[] {
  const events = (payload as { events?: unknown })?.events;
  return Array.isArray(events) ? events.filter((e): e is LineEvent => !!e && typeof e === "object") : [];
}

/** หา/สร้างผู้ติดต่อของ userId บน connection นี้ (ร้านของ connection เสมอ) */
async function contactOn(connection: ChatChannelConnection, externalUserId: string) {
  const where = { tenantId: connection.tenantId, systemId: connection.systemId, channel: connection.type, channelConnectionId: connection.id, externalUserId };
  const select = { id: true, partyId: true, blockedAt: true } as const;
  const found = await prisma.chatContact.findFirst({ where, select });
  if (found) return found;
  try {
    return await prisma.chatContact.create({ data: where, select });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return prisma.chatContact.findFirst({ where, select });
    throw e;
  }
}

function replyMessages(reply: PostbackReply | undefined): LineMessage[] {
  const out: LineMessage[] = [];
  if (reply?.text) out.push({ type: "text", text: reply.text.slice(0, 5000) });
  if (reply?.flex) out.push({ type: "flex", altText: reply.flex.altText, contents: reply.flex.contents });
  return out;
}

/** ตอบด้วย replyToken · token ใช้ไม่ได้แล้ว ⇒ push ถึงผู้ติดต่อแทน */
async function answer(connection: ChatChannelConnection, chatContactId: string, replyToken: string | null, reply: PostbackReply | undefined) {
  const messages = replyMessages(reply);
  if (!messages.length) return;
  const ctx = { tenantId: connection.tenantId };
  if (replyToken) {
    const r = await replyLineMessages(ctx, { replyToken, connectionId: connection.id, messages });
    if (r.ok) return;
  }
  await pushLineMessagesToContact(ctx, { chatContactId, connectionId: connection.id, messages });
}

async function handleLinePostback(connection: ChatChannelConnection, ev: LineEvent) {
  const userId = typeof ev.source?.userId === "string" ? ev.source.userId : "";
  const data = typeof ev.postback?.data === "string" ? ev.postback.data : "";
  if (!userId || !data) return;
  const eventKey = typeof ev.webhookEventId === "string" && ev.webhookEventId ? ev.webhookEventId : `postback-${userId}-${ev.timestamp ?? ""}-${data}`.slice(0, 190);
  if (!(await recordWebhook(connection.id, connection.type, eventKey))) return; // ส่งซ้ำ = ข้าม (X4)
  const contact = await contactOn(connection, userId);
  if (!contact || contact.blockedAt) return;
  const replyToken = typeof ev.replyToken === "string" && ev.replyToken ? ev.replyToken : null;
  const res = await dispatchPostback(
    { tenantId: connection.tenantId, connectionId: connection.id, chatContactId: contact.id, partyId: contact.partyId, replyToken },
    data,
  );
  if (res.handled) await answer(connection, contact.id, replyToken, res.reply);
}

async function handleLineLinkCode(connection: ChatChannelConnection, externalUserId: string, text: string, replyToken: string | null) {
  try {
    const contact = await prisma.chatContact.findFirst({
      where: { tenantId: connection.tenantId, channel: "LINE", channelConnectionId: connection.id, externalUserId, blockedAt: null },
      select: { id: true },
    });
    if (!contact) return;
    const res = await handleLinkCodeText({ tenantId: connection.tenantId, connectionId: connection.id, chatContactId: contact.id, replyToken }, text);
    if (res.matched) await answer(connection, contact.id, replyToken, res.reply);
  } catch {
    // ผูกรหัสพังไม่กระทบการรับข้อความ — ไม่ log ข้อความลูกค้า
  }
}

// SVC D.9 ▸ W6: รูปทำหลังตอบ 200 (after) — ไม่หน่วงคำตอบ LINE/postback ใน payload เดียวกัน · นอกขอบเขตคำขอ (สคริปต์/ข้อสอบ) ⇒ ทำทันที ◂
async function deferLineImage(connection: ChatChannelConnection, externalUserId: string, messageId: string, replyToken: string | null) {
  const run = () => handleLineImage(connection, externalUserId, messageId, replyToken);
  try {
    after(run);
  } catch {
    await run();
  }
}

// SVC D.9 ▸ รูปในแชท LINE → dorm-line.onLineImage (ctx จากแถว connection + ผู้ติดต่อเสมอ) · พังไม่ทำให้ webhook ตอบ non-200 · log ไม่มีเนื้อ ◂
async function handleLineImage(connection: ChatChannelConnection, externalUserId: string, messageId: string, replyToken: string | null) {
  try {
    const contact = await prisma.chatContact.findFirst({
      where: { tenantId: connection.tenantId, channel: "LINE", channelConnectionId: connection.id, externalUserId, blockedAt: null },
      select: { id: true, partyId: true },
    });
    if (!contact) return;
    const res = await (await import("@/lib/platform/dorm-line")).onLineImage(
      { tenantId: connection.tenantId, connectionId: connection.id, chatContactId: contact.id, partyId: contact.partyId, replyToken },
      { messageId },
    );
    if (res.reply) await answer(connection, contact.id, replyToken, res.reply);
  } catch {
    await logWebhook(connection.id, connection.type, "image", "FAILED", "image handler error");
  }
}
