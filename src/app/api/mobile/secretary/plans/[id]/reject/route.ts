// POST /api/mobile/secretary/plans/[id]/reject — ยกเลิกแผน (`rejectPlan` · เฉพาะแผนในห้องที่ผู้กดเห็น)
import { z } from "zod";
import { rejectPlan } from "@/lib/ai/plans";
import { gate, idParam, notFound, ok, readBody, withRateLimit, type RouteCtx, withErrors } from "../../../_shared";

async function POST_(req: Request, ctx: RouteCtx) {
  const a = await gate(req);
  if (!a.ok) return a.res;
  const rl = await withRateLimit(`${a.c.tenantId}:${a.c.userId}`, "reject");
  if (rl) return rl;
  const b = await readBody(req, z.object({}).strict());
  if (!b.ok) return b.res;
  const id = await idParam(ctx, "id");
  if (id && (await rejectPlan(a.c.conv, id))) return ok({ ok: true });
  return notFound("ไม่พบแผนนี้ หรือถูกดำเนินการไปแล้ว");
}

// SEC S3a.1-S2 ▸ R-Z20: exception ที่หลุด ⇒ {error, message} + logOps (ไม่มี 500 ดิบ) ◂
export const POST = withErrors("secretary/plans/[id]/reject POST", POST_);
