// POST แชท AI → SSE (text/event-stream) · แต่ละ event = data: {type,...}\n\n จบด้วย done/error
// (ledger/MOBILE_PLAN.md M-11) — ครอบ sendMobileChat (wrap sendMessage เดิม)
import { requireMobile, mobileError } from "@/lib/mobile/auth";
import { mobileDenied, mobileAiCtx, AI_CHAT } from "@/lib/mobile/guard";
import { sendMobileChat } from "@/lib/mobile/chat";
import { checkRateLimitDb } from "@/lib/core/rate-limit-db"; // SEC S3a.1-S1 R-Z9
import { isSecretaryRoomConversation } from "@/lib/ai/secretary/rooms"; // SEC S3a.1-S1 R-Z9

/** SEC S3a.1-S1 ▸ R-Z9: เพดานต่อคนต่อร้าน 20/นาที (ถังเดียวกับ action เว็บ `ai-chat:<ร้าน>:<ผู้ใช้>`) ◂ */
const CHAT_SEND_PER_MINUTE = 20;

export async function POST(req: Request) {
  const g = await requireMobile(req);
  if (!g.ok) return mobileError(g);
  const denied = mobileDenied(g, AI_CHAT); // HOTFIX 2026-10-01: same key as the web door
  if (denied) return denied;
  // SEC S3a.1-S1 ▸ R-Z9: เพดานอัตรา (ก่อนอ่าน body · 429 มาตรฐาน + Retry-After) ◂
  const rl = await checkRateLimitDb(`ai-chat:${g.ctx.tenantId}:${g.user.id}`, { limit: CHAT_SEND_PER_MINUTE, windowMs: 60_000 });
  if (!rl.ok) {
    const retryAfterSec = rl.retryAfterSec ?? 60;
    return Response.json({ error: "rate_limited", message: "ส่งข้อความถี่เกินไป รอสักครู่แล้วลองใหม่", retryAfterSec }, { status: 429, headers: { "Retry-After": String(retryAfterSec) } });
  }

  let body: { conversationId?: string; text?: string; imageUrls?: string[] };
  try {
    body = (await req.json()) as { conversationId?: string; text?: string; imageUrls?: string[] };
  } catch {
    return Response.json({ error: "bad_json" }, { status: 400 });
  }

  const input = {
    conversationId: typeof body.conversationId === "string" ? body.conversationId : undefined,
    text: typeof body.text === "string" ? body.text : "",
    imageUrls: Array.isArray(body.imageUrls) ? body.imageUrls.map(String) : undefined,
  };

  // SEC S3a.1-S1 ▸ R-Z9: ห้องเลขาใช้ได้เฉพาะเส้นห้อง (`/api/mobile/secretary/rooms/[id]/send` — คิว · ตัวนับงาน · ด่านอนุมัติ) ◂
  if (await isSecretaryRoomConversation(g.ctx.tenantId, input.conversationId)) {
    return Response.json({ error: "secretary_room", message: "ห้องนี้เป็นห้องงานของเลขา — ส่งข้อความจากหน้าห้องงานแทน" }, { status: 409 });
  }

  // CRM C5.5-G1 ▸ ผู้กระทำ = เจ้าของโทเค็น + Membership ของร้านที่ X-Tenant-Id (requireMobile ตรวจแล้ว) ◂
  //   CRM C5.5-G2: the same actor is the viewer — sendMessage continues only rooms this user can see ◂
  const ctx = mobileAiCtx(g);
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const ev of sendMobileChat(ctx, input)) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(ev)}\n\n`));
        }
      } catch (e) {
        const ev = { type: "error", error: e instanceof Error ? e.message : "error" };
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(ev)}\n\n`));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache",
    },
  });
}
