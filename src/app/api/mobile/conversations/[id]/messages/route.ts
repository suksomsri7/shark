// GET ข้อความในห้อง (จอแชทเปิดห้องเก่า) — listMessages เดิมผ่าน tenantDb (ข้าม tenant = ว่าง)
import { requireMobile, mobileError } from "@/lib/mobile/auth";
import { listMessages } from "@/lib/ai/service";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const g = await requireMobile(req);
  if (!g.ok) return mobileError(g);
  const { id } = await ctx.params;
  const rows = await listMessages(g.ctx, id);
  return Response.json({
    messages: rows.map((m) => ({ id: m.id, role: m.role, content: m.content, createdAt: m.createdAt })),
  });
}
