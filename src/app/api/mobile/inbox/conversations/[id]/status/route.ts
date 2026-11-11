// POST /api/mobile/inbox/conversations/[id]/status — เปิด/รอ/ปิดห้อง (ห่อ `setStatus` · คีย์เดียวกับเว็บ · 60/นาที · S1.21)
import { z } from "zod";
import { setStatus } from "@/lib/modules/chat/service";
import { fail, gate, limited, notFound, readBody, SET_STATUS, systemOf, visibleConv, type RouteCtx, withErrors } from "../../../_shared";

const Body = z.object({ systemId: z.string().max(64).optional(), status: z.enum(["OPEN", "PENDING", "RESOLVED"]) }).strict();

async function POST_(req: Request, ctx: RouteCtx) {
  const a = await gate(req, [SET_STATUS]);
  if (!a.ok) return a.res;
  const { c } = a;
  const { id } = await ctx.params;
  const b = await readBody(req, Body);
  if (!b.ok) return b.res;
  const sid = await systemOf(c.tenantId, b.v.systemId);
  if (!sid) return notFound("ไม่พบระบบแชทนี้");
  if (!(await visibleConv(c, sid, id))) return notFound();
  const rl = await limited(c, "status", 60);
  if (rl) return rl;
  const r = await setStatus({ tenantId: c.tenantId, systemId: sid, conversationId: id, status: b.v.status, actorUserId: c.userId, unitAccess: c.ua });
  return r.ok ? Response.json({ ok: true }) : fail(422, "invalid", r.reason ?? "เปลี่ยนสถานะไม่สำเร็จ");
}

// SEC S3a.1-S2 ▸ R-Z20: exception ที่หลุด ⇒ {error, message} + logOps (ไม่มี 500 ดิบ) ◂
export const POST = withErrors("inbox/conversations/[id]/status POST", POST_);
