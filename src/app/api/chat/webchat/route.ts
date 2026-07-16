import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { prisma } from "@/lib/core/db";
import { receiveWebchatInbound } from "@/lib/modules/chat/service";
import { checkRateLimit } from "@/lib/core/rate-limit";

// POST /api/chat/webchat — public webchat inbound (surface สาธารณะ · connectionId ใน body)
// WO-0043 hardening: rate limit ต่อ session (guest cookie) + fallback IP ด้วย core checkRateLimit → 429
//   - guest token = httpOnly cookie (CSPRNG randomUUID) · ไม่รับ token จาก body/query (กัน IDOR)
//   - session: 20 ข้อความ/นาที ต่อ token+connection · IP fallback: 100/นาที ต่อ ip+connection (กันสแปมข้าม session)
// (endpoint แบบ path param `/api/chat/webchat/[connectionId]` ยังคงไว้เพื่อ backward-compat)
const SESSION_LIMIT = { limit: 20, windowMs: 60_000 };
const IP_LIMIT = { limit: 100, windowMs: 60_000 };

const sendSchema = z.object({
  connectionId: z.string().min(1),
  body: z.string().trim().min(1).max(4000),
  displayName: z.string().trim().max(80).optional(),
  clientMessageId: z.string().max(64).optional(),
});

function clientIp(headers: Headers): string {
  const xff = headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim();
  return headers.get("x-real-ip")?.trim() || "unknown";
}

function cookieName(connectionId: string): string {
  return `swc_${connectionId}`;
}

export async function POST(req: Request) {
  const parsed = sendSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  const b = parsed.data;

  const conn = await prisma.chatChannelConnection.findUnique({ where: { id: b.connectionId } });
  if (!conn || conn.type !== "WEBCHAT" || conn.status === "DISABLED") {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  // guest token จาก httpOnly cookie เท่านั้น — ไม่มี → mint ใหม่ (set บน response)
  const store = await cookies();
  const existing = store.get(cookieName(b.connectionId))?.value;
  const hasCookie = !!existing && existing.length >= 8;
  const token = hasCookie ? existing! : `web-${randomUUID()}`;

  const ip = clientIp(req.headers);
  const rlSession = checkRateLimit(`webchat:${token}:${b.connectionId}`, SESSION_LIMIT);
  const rlIp = checkRateLimit(`webchat-ip:${ip}:${b.connectionId}`, IP_LIMIT);
  if (!rlSession.ok || !rlIp.ok) {
    const retryAfterSec = Math.max(rlSession.retryAfterSec ?? 1, rlIp.retryAfterSec ?? 1);
    return NextResponse.json(
      { error: "rate_limited", message: "ส่งข้อความถี่เกินไป กรุณารอสักครู่แล้วลองใหม่" },
      { status: 429, headers: { "Retry-After": String(retryAfterSec) } },
    );
  }

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
  if (!hasCookie) {
    res.cookies.set(cookieName(b.connectionId), token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 90 * 24 * 60 * 60, // 90 วัน
    });
  }
  return res;
}
