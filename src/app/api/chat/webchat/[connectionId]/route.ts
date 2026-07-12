import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/core/db";
import { receiveWebchatInbound, getWebchatThread } from "@/lib/modules/chat/service";

// Webchat widget (public — auth ด้วย guest token ownership)
// POST = ลูกค้าส่งข้อความ · GET = poll เธรดของ guest
const sendSchema = z.object({
  guestToken: z.string().min(8).max(80),
  body: z.string().trim().min(1).max(4000),
  displayName: z.string().trim().max(80).optional(),
  clientMessageId: z.string().max(64).optional(),
});

async function resolveWebchat(connectionId: string) {
  const conn = await prisma.chatChannelConnection.findUnique({ where: { id: connectionId } });
  if (!conn || conn.type !== "WEBCHAT" || conn.status === "DISABLED") return null;
  return conn;
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ connectionId: string }> },
) {
  const { connectionId } = await params;
  const conn = await resolveWebchat(connectionId);
  if (!conn) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const parsed = sendSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  const b = parsed.data;

  const res = await receiveWebchatInbound({
    connection: conn,
    guestToken: b.guestToken,
    body: b.body,
    displayName: b.displayName,
    clientMessageId: b.clientMessageId,
  });
  if (!res.ok) return NextResponse.json({ error: "rejected", reason: res.reason }, { status: 422 });
  return NextResponse.json({ ok: true, conversationId: res.conversationId });
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ connectionId: string }> },
) {
  const { connectionId } = await params;
  const conn = await resolveWebchat(connectionId);
  if (!conn) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const guestToken = new URL(req.url).searchParams.get("guestToken") ?? "";
  if (guestToken.length < 8) return NextResponse.json({ messages: [] });

  const thread = await getWebchatThread(conn, guestToken);
  return NextResponse.json(thread);
}
