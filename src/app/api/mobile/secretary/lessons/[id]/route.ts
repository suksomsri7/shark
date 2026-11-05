// DELETE /api/mobile/secretary/lessons/[id] — ไม่รับบทเรียน (→ REJECTED · OWNER เท่านั้น · `rejectLesson`)
import { rejectLesson } from "@/lib/ai/secretary/learn";
import { gate, idParam, notFound, ok, thrown, withRateLimit, type RouteCtx } from "../../_shared";

export async function DELETE(req: Request, ctx: RouteCtx) {
  const a = await gate(req);
  if (!a.ok) return a.res;
  const rl = await withRateLimit(`${a.c.tenantId}:${a.c.userId}`, "lessons");
  if (rl) return rl;
  const id = await idParam(ctx, "id");
  if (!id) return notFound("ไม่พบบทเรียนนี้");
  try {
    return (await rejectLesson(a.c.conv, id)) ? ok({ ok: true }) : notFound("ไม่พบบทเรียนนี้");
  } catch (e) {
    return thrown(e, "lessons.delete");
  }
}
