// POST /api/mobile/secretary/team/threads/[id]/read {} — อ่านถึงล่าสุด (อีกฝ่ายเห็น "อ่านแล้ว" · badge ทีมลด) · 120/นาที · ไม่ใช่สมาชิก = 404 (B27)
import { z } from "zod";
import { markRead } from "@/lib/team-chat/service";
import { gate, idParam, notFound, ok, readBody, withRateLimit, type RouteCtx, withErrors } from "../../../../_shared";
import { rlKey, teamCtx } from "../../../_team";

const Body = z.object({}).strict();

async function POST_(req: Request, ctx: RouteCtx<"id">) {
  const a = await gate(req, null);
  if (!a.ok) return a.res;
  const rl = await withRateLimit(rlKey(a.c), "team-read", 120);
  if (rl) return rl;
  const b = await readBody(req, Body);
  if (!b.ok) return b.res;
  const id = await idParam(ctx, "id");
  if (!id || !(await markRead(teamCtx(a.c), id))) return notFound("ไม่พบห้องแชทนี้ หรือคุณไม่ได้อยู่ในห้องนี้");
  return ok({ ok: true });
}

export const POST = withErrors("secretary/team/threads/[id]/read POST", POST_);
