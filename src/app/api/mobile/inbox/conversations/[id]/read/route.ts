// POST /api/mobile/inbox/conversations/[id]/read — ทำเครื่องหมายว่าอ่านแล้ว (ห่อ `markRead` · คีย์เดียวกับเว็บ · S1.21)
import { z } from "zod";
import { markRead } from "@/lib/modules/chat/service";
import { gate, MARK_READ, notFound, readBody, systemOf, visibleConv, type RouteCtx } from "../../../_shared";

const Body = z.object({ systemId: z.string().max(64).optional(), lastReadMessageId: z.string().max(64).optional() }).strict();

export async function POST(req: Request, ctx: RouteCtx) {
  const a = await gate(req, [MARK_READ]);
  if (!a.ok) return a.res;
  const { c } = a;
  const { id } = await ctx.params;
  const b = await readBody(req, Body);
  if (!b.ok) return b.res;
  const sid = await systemOf(c.tenantId, b.v.systemId);
  if (!sid) return notFound("ไม่พบระบบแชทนี้");
  if (!(await visibleConv(c, sid, id))) return notFound();
  await markRead({ tenantId: c.tenantId, systemId: sid, conversationId: id, userId: c.userId, lastReadMessageId: b.v.lastReadMessageId, unitAccess: c.ua });
  return Response.json({ ok: true });
}
