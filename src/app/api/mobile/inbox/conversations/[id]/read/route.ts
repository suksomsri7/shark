// POST /api/mobile/inbox/conversations/[id]/read — ทำเครื่องหมายว่าอ่านแล้ว (ห่อ `markRead` · คีย์เดียวกับเว็บ · S1.21)
import { z } from "zod";
import { markRead } from "@/lib/modules/chat/service";
import { gate, limited, MARK_READ, notFound, readBody, systemOf, visibleConv, type RouteCtx, withErrors } from "../../../_shared";

const Body = z.object({ systemId: z.string().max(64).optional(), lastReadMessageId: z.string().max(64).optional() }).strict();

async function POST_(req: Request, ctx: RouteCtx) {
  const a = await gate(req, [MARK_READ]);
  if (!a.ok) return a.res;
  const { c } = a;
  const rl = await limited(c, "read", 120); // SEC S3a.1-S2 ▸ R-Z20 ◂
  if (rl) return rl;
  const { id } = await ctx.params;
  const b = await readBody(req, Body);
  if (!b.ok) return b.res;
  const sid = await systemOf(c.tenantId, b.v.systemId);
  if (!sid) return notFound("ไม่พบระบบแชทนี้");
  if (!(await visibleConv(c, sid, id))) return notFound();
  await markRead({ tenantId: c.tenantId, systemId: sid, conversationId: id, userId: c.userId, lastReadMessageId: b.v.lastReadMessageId, unitAccess: c.ua });
  return Response.json({ ok: true });
}

// SEC S3a.1-S2 ▸ R-Z20: exception ที่หลุด ⇒ {error, message} + logOps (ไม่มี 500 ดิบ) ◂
export const POST = withErrors("inbox/conversations/[id]/read POST", POST_);
