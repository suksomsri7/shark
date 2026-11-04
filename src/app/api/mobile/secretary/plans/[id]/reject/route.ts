// POST /api/mobile/secretary/plans/[id]/reject — ยกเลิกแผน (`rejectPlan` · เฉพาะแผนในห้องที่ผู้กดเห็น)
import { z } from "zod";
import { rejectPlan } from "@/lib/ai/plans";
import { gate, idParam, notFound, ok, readBody, withRateLimit, type RouteCtx } from "../../../_shared";

export async function POST(req: Request, ctx: RouteCtx) {
  const a = await gate(req);
  if (!a.ok) return a.res;
  const rl = await withRateLimit(a.c.userId, "reject");
  if (rl) return rl;
  const b = await readBody(req, z.object({}).strict());
  if (!b.ok) return b.res;
  const id = await idParam(ctx, "id");
  if (id && (await rejectPlan(a.c.conv, id))) return ok({ ok: true });
  return notFound("ไม่พบแผนนี้ หรือถูกดำเนินการไปแล้ว");
}
