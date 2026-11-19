// POST /api/mobile/secretary/calendar/items/[id]/reopen — ติ๊กออก (DONE → OPEN · ทำซ้ำ = 409) · CAL1.6 · สัญญา §8 · ของคนอื่น = 404
import { z } from "zod";
import { reopen } from "@/lib/modules/calendar/items";
import { idParam, notFound, ok, readBody, type RouteCtx, withErrors } from "../../../../_shared";
import { calGate, calThrown } from "../../../_cal";

const body = z.object({}).strict();

async function POST_(req: Request, ctx: RouteCtx) {
  const g = await calGate(req, "reopen", 30);
  if (!g.ok) return g.res;
  const id = await idParam(ctx, "id");
  if (!id) return notFound();
  const b = await readBody(req, body);
  if (!b.ok) return b.res;
  try {
    return ok({ item: await reopen(g.actor, id) });
  } catch (e) {
    return calThrown(e, "calendar/items/[id]/reopen POST");
  }
}

export const POST = withErrors("secretary/calendar/items/[id]/reopen POST", POST_);
