// POST แชท AI → SSE (text/event-stream) · แต่ละ event = data: {type,...}\n\n จบด้วย done/error
// (ledger/MOBILE_PLAN.md M-11) — ครอบ sendMobileChat (wrap sendMessage เดิม)
import { requireMobile, mobileError } from "@/lib/mobile/auth";
import { mobileDenied, mobileAiCtx, AI_CHAT } from "@/lib/mobile/guard";
import { sendMobileChat } from "@/lib/mobile/chat";
import { errDetail, logOps } from "@/lib/core/ops"; // SEC S3a.1-S2 ▸ R-Z26 ◂

// SEC S3a.1-S2 ▸ R-Z26 (L6 M1): เหตุการณ์ error ของ SSE — ไม่มี e.message ดิบ (ชื่อตาราง/อาร์กิวเมนต์ของคำสั่ง) ◂
async function sseError(e: unknown): Promise<{ type: "error"; error: string; message: string }> {
  if (e instanceof Error && /[ก-๙]/.test(e.message) && !/prisma|invocation|invalid `|\bat \w+ \(/i.test(e.message)) {
    return { type: "error", error: "failed", message: e.message.split("\n")[0]!.slice(0, 300) };
  }
  await logOps("ERROR", "mobile-chat", "chat/send: ล้ม", { detail: errDetail(e) }).catch(() => {});
  return { type: "error", error: "server_error", message: "ผู้ช่วยตอบไม่สำเร็จชั่วคราว ลองใหม่อีกครั้ง" };
}

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
        // SEC S3a.1-S2 ▸ R-Z20/R-Z26: ไม่ส่ง e.message ดิบ — รูป {type, error, message} · ข้อความไทยของ lib ผ่าน (ไม่ใช่ข้อความของฐาน) · อื่น ๆ = ทั่วไป + logOps ◂
        const ev = await sseError(e);
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
