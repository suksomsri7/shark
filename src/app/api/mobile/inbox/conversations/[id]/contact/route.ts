// POST /api/mobile/inbox/conversations/[id]/contact — ผูก/ถอดสมาชิกกับผู้ติดต่อของห้อง (ห่อ `linkCustomer` · คีย์ chat.customer.link ของเว็บ · S1.21)
//   🔴 customerId มาจากเครื่องลูกข่าย ⇒ ต้องเป็นสมาชิกของร้านนี้ในระบบสมาชิกที่แชทเชื่อมไว้ (linkCustomer เดิมไม่ตรวจ — เว็บส่ง id จากรายการของร้านเอง)
import { z } from "zod";
import { tenantDb } from "@/lib/core/db";
import { linkCustomer } from "@/lib/modules/chat/service";
import { fail, gate, limited, LINK_CUSTOMER, notFound, readBody, systemOf, visibleConv, type RouteCtx } from "../../../_shared";

const Body = z.object({ systemId: z.string().max(64).optional(), customerId: z.string().min(1).max(64).nullable() }).strict();

export async function POST(req: Request, ctx: RouteCtx) {
  const a = await gate(req, [LINK_CUSTOMER]);
  if (!a.ok) return a.res;
  const { c } = a;
  const { id } = await ctx.params;
  const b = await readBody(req, Body);
  if (!b.ok) return b.res;
  const sid = await systemOf(c.tenantId, b.v.systemId);
  if (!sid) return notFound("ไม่พบระบบแชทนี้");
  const conv = await visibleConv(c, sid, id);
  if (!conv) return notFound();
  const rl = await limited(c, "contact", 60);
  if (rl) return rl;
  if (b.v.customerId) {
    const setting = await tenantDb({ tenantId: c.tenantId, systemId: sid }).chatSetting.findFirst({ where: { systemId: sid }, select: { memberSystemId: true } });
    const ok = setting?.memberSystemId
      ? await tenantDb({ tenantId: c.tenantId, systemId: setting.memberSystemId }).customer.findFirst({ where: { id: b.v.customerId, tenantId: c.tenantId, memberSystemId: setting.memberSystemId }, select: { id: true } })
      : null;
    if (setting?.memberSystemId && !ok) return fail(422, "invalid", "ไม่พบสมาชิกนี้");
  }
  const r = await linkCustomer({ tenantId: c.tenantId, systemId: sid, contactId: conv.contactId, actorUserId: c.userId, customerId: b.v.customerId, unitAccess: c.ua });
  return r.ok ? Response.json({ ok: true }) : fail(422, "invalid", r.reason ?? "ผูกสมาชิกไม่สำเร็จ");
}
