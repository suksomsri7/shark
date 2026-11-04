// POST /api/mobile/inbox/conversations/[id]/assign — มอบหมายผู้ดูแล (ห่อ `assign` · ผู้รับต้องตอบได้ในหน่วย · S1.21/S1.24 · R-K14 · R-S1.21a)
//   ผู้มีคีย์ `chat.conversation.assign` (เหมือนเว็บ) = มอบหมาย/ถอดได้ทุกแบบ
//   ผู้มีแค่ `chat.message.send` = รับห้องที่ยังไม่มีผู้ดูแลให้ตัวเองเท่านั้น (updateMany มีเงื่อนไข · มีคนรับตัดหน้า = 409)
//     · มอบให้คนที่ดูแลอยู่แล้ว = ไม่เปลี่ยนอะไร ตอบ ok (ไม่ต้องใช้สิทธิ์)
import { z } from "zod";
import { assign } from "@/lib/modules/chat/service";
import { ASSIGN, can, fail, gate, limited, notFound, readBody, REPLY, systemOf, visibleConv, type RouteCtx } from "../../../_shared";

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
  const conv = await visibleConv(c, sid, id);
  if (!conv) return notFound();
  const rl = await limited(c, "assign", 60);
  if (rl) return rl;
  const to = b.v.assigneeUserId;
  const base = { tenantId: c.tenantId, systemId: sid, conversationId: id, assigneeUserId: to, actorUserId: c.userId, unitAccess: c.ua };
  if (can(c, ASSIGN)) {
    const r = await assign(base, { requireReplyPermission: true });
    return r.ok ? Response.json({ ok: true }) : fail(422, "invalid", r.reason ?? "มอบหมายไม่สำเร็จ");
  }
  if (to !== null && to === conv.assigneeUserId) return Response.json({ ok: true }); // ไม่มีอะไรเปลี่ยน
  if (to !== c.userId || conv.assigneeUserId !== null) {
    return fail(403, "forbidden", "บัญชีนี้รับได้เฉพาะห้องที่ยังไม่มีผู้ดูแลให้ตัวเอง — มอบหมายให้คนอื่นต้องมีสิทธิ์มอบหมายห้องแชท");
  }
  const r = await assign(base, { requireReplyPermission: true, onlyIfAssignee: null });
  return r.ok ? Response.json({ ok: true }) : fail(409, "conflict", r.reason ?? "ห้องนี้มีคนรับไปแล้ว");
}
