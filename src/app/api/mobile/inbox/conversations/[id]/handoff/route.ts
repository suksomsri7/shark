// POST /api/mobile/inbox/conversations/[id]/handoff — ส่งต่อห้องพร้อมเหตุผล (ห่อ `handoff` · S1.24 · R-K14)
import { z } from "zod";
import { handoff } from "@/lib/modules/chat/routing";
import { fail, gate, notFound, readBody, REPLY, systemOf, visibleConv, type RouteCtx } from "../../../_shared";

const Body = z.object({ systemId: z.string().max(64).optional(), toUserId: z.string().min(1).max(64), reason: z.string().min(1).max(500) }).strict();

export async function POST(req: Request, ctx: RouteCtx) {
  const a = await gate(req, [REPLY]);
  if (!a.ok) return a.res;
  const { c } = a;
  const { id } = await ctx.params;
  const b = await readBody(req, Body);
  if (!b.ok) return b.res;
  const sid = await systemOf(c.tenantId, b.v.systemId);
  if (!sid) return notFound("ไม่พบระบบแชทนี้");
  if (!(await visibleConv(c, sid, id))) return notFound();
  const r = await handoff({ tenantId: c.tenantId, systemId: sid, conversationId: id, byUserId: c.userId, toUserId: b.v.toUserId, reason: b.v.reason, unitAccess: c.ua });
  return r.ok ? Response.json({ ok: true }) : fail(422, "invalid", r.reason);
}
