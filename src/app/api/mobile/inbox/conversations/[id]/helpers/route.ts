// POST /api/mobile/inbox/conversations/[id]/helpers — เรียกเพื่อนมาช่วย (ห่อ `callHelper` · S1.24 · R-K14)
import { z } from "zod";
import { callHelper } from "@/lib/modules/chat/routing";
import { fail, gate, notFound, readBody, REPLY, systemOf, visibleConv, type RouteCtx } from "../../../_shared";

const Body = z.object({ systemId: z.string().max(64).optional(), helperUserId: z.string().min(1).max(64), note: z.string().max(500).optional() }).strict();

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
  const r = await callHelper({ tenantId: c.tenantId, systemId: sid, conversationId: id, byUserId: c.userId, helperUserId: b.v.helperUserId, note: b.v.note, unitAccess: c.ua });
  return r.ok ? Response.json({ ok: true }) : fail(422, "invalid", r.reason);
}
