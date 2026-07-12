import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { prisma } from "@/lib/core/db";
import { receiveWebchatInbound, getWebchatThread } from "@/lib/modules/chat/service";
import { rateLimit, clientIp } from "@/lib/modules/chat/rate-limit";

// Webchat widget (public)
// M10: guest token = CSPRNG (randomUUID) ที่ server สร้าง + httpOnly cookie ผูก connection
//      client อ่าน/เดา/ปลอม token ไม่ได้ (ปิด IDOR) — ไม่รับ guestToken จาก body/query อีกต่อไป
// M9: rate limit ต่อ IP+connectionId (POST 20/นาที) + cap contact ใหม่/ชม. (ใน service)
const POST_LIMIT = 20;
const WINDOW_MS = 60_000;

const sendSchema = z.object({
  body: z.string().trim().min(1).max(4000),
  displayName: z.string().trim().max(80).optional(),
  clientMessageId: z.string().max(64).optional(),
});

function cookieName(connectionId: string) {
  return `swc_${connectionId}`;
}

async function resolveWebchat(connectionId: string) {
  const conn = await prisma.chatChannelConnection.findUnique({ where: { id: connectionId } });
  if (!conn || conn.type !== "WEBCHAT" || conn.status === "DISABLED") return null;
  return conn;
}

// อ่าน guest token จาก httpOnly cookie — ไม่มี → mint ใหม่ (mint=true เพื่อ set cookie บน response)
async function guestTokenFromCookie(connectionId: string): Promise<{ token: string; mint: boolean }> {
  const store = await cookies();
  const existing = store.get(cookieName(connectionId))?.value;
  if (existing && existing.length >= 8) return { token: existing, mint: false };
  return { token: `web-${randomUUID()}`, mint: true };
}

function setGuestCookie(res: NextResponse, connectionId: string, token: string) {
  res.cookies.set(cookieName(connectionId), token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 90 * 24 * 60 * 60, // 90 วัน
  });
}

export async function POST(req: Request, { params }: { params: Promise<{ connectionId: string }> }) {
  const { connectionId } = await params;
  const conn = await resolveWebchat(connectionId);
  if (!conn) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const ip = clientIp(req.headers);
  if (!rateLimit(`webchat:${ip}:${connectionId}`, POST_LIMIT, WINDOW_MS)) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const parsed = sendSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  const b = parsed.data;

  const { token, mint } = await guestTokenFromCookie(connectionId);
  const result = await receiveWebchatInbound({
    connection: conn,
    guestToken: token,
    body: b.body,
    displayName: b.displayName,
    clientMessageId: b.clientMessageId,
  });
  const res = result.ok
    ? NextResponse.json({ ok: true, conversationId: result.conversationId })
    : NextResponse.json({ error: "rejected", reason: result.reason }, { status: 422 });
  if (mint) setGuestCookie(res, connectionId, token);
  return res;
}

export async function GET(req: Request, { params }: { params: Promise<{ connectionId: string }> }) {
  const { connectionId } = await params;
  const conn = await resolveWebchat(connectionId);
  if (!conn) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const { token, mint } = await guestTokenFromCookie(connectionId);
  // เพิ่ง mint (ยังไม่เคยส่ง) → ยังไม่มีเธรด แต่ set cookie ให้ก่อนเพื่อผูกตัวตน
  const thread = mint ? { messages: [] } : await getWebchatThread(conn, token);
  const res = NextResponse.json(thread);
  if (mint) setGuestCookie(res, connectionId, token);
  return res;
}
