// GET ข้อความในห้อง (จอแชทเปิดห้องเก่า) — listMessages เดิมผ่าน tenantDb (ข้าม tenant = ว่าง)
import { requireMobile, mobileError } from "@/lib/mobile/auth";
import { mobileDenied, mobileAiCtx, AI_CHAT } from "@/lib/mobile/guard";
import { listMessages } from "@/lib/ai/service";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const g = await requireMobile(req);
  if (!g.ok) return mobileError(g);
  const denied = mobileDenied(g, AI_CHAT); // HOTFIX 2026-10-01: same key as the web door
  if (denied) return denied;
  const { id } = await ctx.params;
  const rows = await listMessages(mobileAiCtx(g), id); // CRM C5.5-G2: someone else's room = empty, like a missing id
  return Response.json({
    messages: rows.map((m) => ({ id: m.id, role: m.role, content: m.content, createdAt: m.createdAt })),
  });
}
