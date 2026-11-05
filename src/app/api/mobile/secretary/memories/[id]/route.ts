// DELETE /api/mobile/secretary/memories/[id] — ลบความจำของร้าน (OWNER · `rejectMemory` · ไม่รวมความจำส่วนตัวของคนอื่น)
import { rejectMemory } from "@/lib/ai/secretary/teach";
import { forbidden, gate, idParam, notFound, ok, withRateLimit, type RouteCtx } from "../../_shared";

export async function DELETE(req: Request, ctx: RouteCtx) {
  const a = await gate(req);
  if (!a.ok) return a.res;
  const rl = await withRateLimit(`${a.c.tenantId}:${a.c.userId}`, "memories");
  if (rl) return rl;
  if (a.c.m.role !== "OWNER") return forbidden("ลบความจำของร้านได้เฉพาะเจ้าของกิจการ");
  const id = await idParam(ctx, "id");
  return id && (await rejectMemory(a.c.conv, id)) ? ok({ ok: true }) : notFound("ไม่พบความจำนี้");
}
