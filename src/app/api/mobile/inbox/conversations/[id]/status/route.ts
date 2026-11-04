// POST /api/mobile/inbox/conversations/[id]/status — เปิด/รอ/ปิดห้อง (ห่อ `setStatus` · คีย์เดียวกับเว็บ · S1.21)
import { z } from "zod";
import { setStatus } from "@/lib/modules/chat/service";
import { fail, gate, notFound, readBody, SET_STATUS, systemOf, visibleConv, type RouteCtx } from "../../../_shared";

const Body = z.object({ systemId: z.string().max(64).optional(), status: z.enum(["OPEN", "PENDING", "RESOLVED"]) }).strict();

export async function POST(req: Request, ctx: RouteCtx) {
  const a = await gate(req, [SET_STATUS]);
  if (!a.ok) return a.res;
  const { c } = a;
  const { id } = await ctx.params;
  const b = await readBody(req, Body);
  if (!b.ok) return b.res;
  const sid = await systemOf(c.tenantId, b.v.systemId);
  if (!sid) return notFound("ไม่พบระบบแชทนี้");
  if (!(await visibleConv(c, sid, id))) return notFound();
  const r = await setStatus({ tenantId: c.tenantId, systemId: sid, conversationId: id, status: b.v.status, actorUserId: c.userId, unitAccess: c.ua });
  return r.ok ? Response.json({ ok: true }) : fail(422, "invalid", r.reason ?? "เปลี่ยนสถานะไม่สำเร็จ");
}
