// POST /api/mobile/inbox/conversations/[id]/assign — มอบหมายผู้ดูแล (ห่อ `assign` · ผู้รับต้องตอบได้ในหน่วย · S1.21/S1.24 · R-K14)
//   ผู้กด: คีย์ตอบลูกค้า (เท่ากับ handoff ที่ผู้ตอบส่งต่อห้องได้) หรือคีย์มอบหมายของเว็บ
import { z } from "zod";
import { assign } from "@/lib/modules/chat/service";
import { ASSIGN, fail, gate, notFound, readBody, REPLY, systemOf, visibleConv, type RouteCtx } from "../../../_shared";

const Body = z.object({ systemId: z.string().max(64).optional(), assigneeUserId: z.string().max(64).nullable() }).strict();

export async function POST(req: Request, ctx: RouteCtx) {
  const a = await gate(req, [REPLY, ASSIGN]);
  if (!a.ok) return a.res;
  const { c } = a;
  const { id } = await ctx.params;
  const b = await readBody(req, Body);
  if (!b.ok) return b.res;
  const sid = await systemOf(c.tenantId, b.v.systemId);
  if (!sid) return notFound("ไม่พบระบบแชทนี้");
  if (!(await visibleConv(c, sid, id))) return notFound();
  const r = await assign(
    { tenantId: c.tenantId, systemId: sid, conversationId: id, assigneeUserId: b.v.assigneeUserId, actorUserId: c.userId, unitAccess: c.ua },
    { requireReplyPermission: true },
  );
  return r.ok ? Response.json({ ok: true }) : fail(422, "invalid", r.reason ?? "มอบหมายไม่สำเร็จ");
}
