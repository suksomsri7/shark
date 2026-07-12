import { NextResponse } from "next/server";
import { prisma } from "@/lib/core/db";
import { getAdapter, isSupported } from "@/lib/modules/chat/adapter";
import { credsOf, receiveInbound } from "@/lib/modules/chat/service";

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
      await receiveInbound({ connection, inbound });
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

  return NextResponse.json({ ok: true });
}

// LINE ไม่ต้อง GET challenge — คืน 200 ให้ health check เฉย ๆ
export async function GET() {
  return NextResponse.json({ ok: true });
}

// dedupe ชั้น 1: insert WebhookLog (@@unique([connectionId, eventKey])) — ชน = ประมวลไปแล้ว
async function recordWebhook(
  connectionId: string,
  channelType: "LINE" | "WEBCHAT" | "FACEBOOK" | "INSTAGRAM" | "SHOPEE" | "LAZADA" | "WHATSAPP",
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
  channelType: "LINE" | "WEBCHAT" | "FACEBOOK" | "INSTAGRAM" | "SHOPEE" | "LAZADA" | "WHATSAPP",
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
