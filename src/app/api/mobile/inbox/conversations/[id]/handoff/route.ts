// POST /api/mobile/inbox/conversations/[id]/handoff — ส่งต่อห้องพร้อมเหตุผล (ห่อ `handoff` · ผู้ดูแล/ผู้ช่วย/ผู้มีคีย์มอบหมาย · 20/นาที · S1.24 · R-S1.21b/d)
import { z } from "zod";
import { handoff } from "@/lib/modules/chat/routing";
import { ASSIGN, can, fail, gate, limited, notFound, readBody, REPLY, systemOf, visibleConv, type RouteCtx } from "../../../_shared";

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
  const rl = await limited(c, "handoff", 20);
  if (rl) return rl;
  const r = await handoff({ tenantId: c.tenantId, systemId: sid, conversationId: id, byUserId: c.userId, toUserId: b.v.toUserId, reason: b.v.reason, unitAccess: c.ua, byCanAssign: can(c, ASSIGN) });
  if (r.ok) return Response.json({ ok: true });
  return "forbidden" in r && r.forbidden ? fail(403, "forbidden", r.reason) : fail(422, "invalid", r.reason);
}
