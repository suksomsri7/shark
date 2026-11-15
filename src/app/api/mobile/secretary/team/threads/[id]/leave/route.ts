// POST /api/mobile/secretary/team/threads/[id]/leave {} — ออกจากกลุ่ม (ผู้ดูแลคนสุดท้ายออก ⇒ คนที่อยู่นานสุดเป็นผู้ดูแลแทน · B27)
import { z } from "zod";
import { leaveGroup } from "@/lib/team-chat/service";
import { gate, idParam, notFound, ok, readBody, withRateLimit, type RouteCtx, withErrors } from "../../../../_shared";
import { rlKey, teamCtx, teamFail } from "../../../_team";

const Body = z.object({}).strict();

async function POST_(req: Request, ctx: RouteCtx<"id">) {
  const a = await gate(req, null);
  if (!a.ok) return a.res;
  const rl = await withRateLimit(rlKey(a.c), "team-thread-w");
  if (rl) return rl;
  const b = await readBody(req, Body);
  if (!b.ok) return b.res;
  const id = await idParam(ctx, "id");
  if (!id) return notFound();
  const r = await leaveGroup(teamCtx(a.c), id);
  if (!r.ok) return teamFail(r);
  return ok({ ok: true });
}

export const POST = withErrors("secretary/team/threads/[id]/leave POST", POST_);
