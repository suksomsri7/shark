// POST /api/mobile/secretary/team/threads/[id]/members {userIds[]} — เพิ่มคนในทีมเข้ากลุ่ม (ผู้ดูแลกลุ่มเท่านั้น · B27) · คนใหม่ไม่เห็นประวัติก่อนเข้า
import { z } from "zod";
import { addGroupMembers } from "@/lib/team-chat/service";
import { gate, ID_MAX, idParam, notFound, ok, readBody, withRateLimit, type RouteCtx, withErrors } from "../../../../_shared";
import { rlKey, teamCtx, teamFail } from "../../../_team";

const Body = z.object({ userIds: z.array(z.string().max(ID_MAX)).min(1).max(255) }).strict();

async function POST_(req: Request, ctx: RouteCtx<"id">) {
  const a = await gate(req, null);
  if (!a.ok) return a.res;
  const rl = await withRateLimit(rlKey(a.c), "team-thread-w");
  if (rl) return rl;
  const b = await readBody(req, Body);
  if (!b.ok) return b.res;
  const id = await idParam(ctx, "id");
  if (!id) return notFound();
  const r = await addGroupMembers(teamCtx(a.c), id, b.v.userIds);
  if (!r.ok) return teamFail(r);
  return ok({ ok: true, added: r.added });
}

export const POST = withErrors("secretary/team/threads/[id]/members POST", POST_);
