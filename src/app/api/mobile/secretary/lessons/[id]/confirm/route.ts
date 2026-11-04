// POST /api/mobile/secretary/lessons/[id]/confirm — ยืนยันบทเรียน (OWNER เท่านั้น · `confirmLesson` · คนอื่น = 403)
import { z } from "zod";
import { confirmLesson } from "@/lib/ai/secretary/learn";
import { gate, idParam, notFound, ok, readBody, thrown, withRateLimit, type RouteCtx } from "../../../_shared";

export async function POST(req: Request, ctx: RouteCtx) {
  const a = await gate(req);
  if (!a.ok) return a.res;
  const rl = await withRateLimit(`${a.c.tenantId}:${a.c.userId}`, "lessons");
  if (rl) return rl;
  const b = await readBody(req, z.object({}).strict());
  if (!b.ok) return b.res;
  const id = await idParam(ctx, "id");
  if (!id) return notFound("ไม่พบบทเรียนนี้");
  try {
    return (await confirmLesson(a.c.conv, id)) ? ok({ ok: true }) : notFound("ไม่พบบทเรียนนี้");
  } catch (e) {
    return thrown(e, "lessons.confirm");
  }
}
