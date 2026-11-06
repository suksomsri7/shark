// POST /api/mobile/secretary/plans/[id]/approve {confirm2x?} — อนุมัติแผน = `executePlan` (ด่านต่อขั้น · ห้องเลขา `planApprovalGate` ก่อน claim · R-S1.7a)
import { z } from "zod";
import { executePlan } from "@/lib/ai/plans";
import { wakeOutbox } from "@/lib/modules/crm";
import { gate, idParam, notFound, ok, readBody, thrown, withRateLimit, type RouteCtx, withErrors } from "../../../_shared";

const Body = z.object({ confirm2x: z.boolean().optional() }).strict();

async function POST_(req: Request, ctx: RouteCtx) {
  const a = await gate(req);
  if (!a.ok) return a.res;
  const rl = await withRateLimit(`${a.c.tenantId}:${a.c.userId}`, "approve");
  if (rl) return rl;
  const b = await readBody(req, Body);
  if (!b.ok) return b.res;
  const id = await idParam(ctx, "id");
  if (!id) return notFound("ไม่พบแผนนี้");
  try {
    const res = await executePlan(a.c.m, { tenantId: a.c.tenantId }, id, { confirm2x: b.v.confirm2x === true, userId: a.c.userId });
    if (res.doneCount > 0) wakeOutbox();
    return ok(res);
  } catch (e) {
    return thrown(e, "plans.approve");
  }
}

// SEC S3a.1-S2 ▸ R-Z20: exception ที่หลุด ⇒ {error, message} + logOps (ไม่มี 500 ดิบ) ◂
export const POST = withErrors("secretary/plans/[id]/approve POST", POST_);
