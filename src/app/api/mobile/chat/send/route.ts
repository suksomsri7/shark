// POST แชท AI → SSE (text/event-stream) · แต่ละ event = data: {type,...}\n\n จบด้วย done/error
// (ledger/MOBILE_PLAN.md M-11) — ครอบ sendMobileChat (wrap sendMessage เดิม)
import { requireMobile, mobileError } from "@/lib/mobile/auth";
import { mobileDenied, mobileAiCtx, AI_CHAT } from "@/lib/mobile/guard";
import { sendMobileChat } from "@/lib/mobile/chat";

export async function POST(req: Request) {
  const g = await requireMobile(req);
  if (!g.ok) return mobileError(g);
  const denied = mobileDenied(g, AI_CHAT); // HOTFIX 2026-10-01: same key as the web door
  if (denied) return denied;

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
