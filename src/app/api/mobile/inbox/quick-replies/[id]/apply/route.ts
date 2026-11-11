// POST /api/mobile/inbox/quick-replies/[id]/apply — หยิบคำตอบสำเร็จรูปใส่กล่องพิมพ์ (ห่อ `applyQuickReply` · แทนตัวแปร + นับ usageCount · ไม่ส่งข้อความ · R-S1.21f)
import { z } from "zod";
import { applyQuickReply } from "@/lib/modules/chat/quick-reply";
import { fail, gate, limited, notFound, readBody, REPLY, staffNames, systemOf, visibleConv, type RouteCtx, withErrors } from "../../../_shared";

const Body = z.object({ systemId: z.string().max(64).optional(), conversationId: z.string().min(1).max(64) }).strict();

async function POST_(req: Request, ctx: RouteCtx) {
  const a = await gate(req, [REPLY]);
  if (!a.ok) return a.res;
  const { c } = a;
  const rl = await limited(c, "qr-apply", 60); // SEC S3a.1-S2 ▸ R-Z20 ◂
  if (rl) return rl;
  const { id } = await ctx.params;
  const b = await readBody(req, Body);
  if (!b.ok) return b.res;
  const sid = await systemOf(c.tenantId, b.v.systemId);
  if (!sid) return notFound("ไม่พบระบบแชทนี้");
  if (!(await visibleConv(c, sid, b.v.conversationId))) return notFound();
  const staffName = (await staffNames(c.tenantId)).get(c.userId) ?? null;
  const r = await applyQuickReply({ tenantId: c.tenantId, systemId: sid, conversationId: b.v.conversationId, quickReplyId: id, staffName });
  return r.ok && typeof r.body === "string" ? Response.json({ body: r.body }) : fail(422, "invalid", r.reason ?? "ใช้คำตอบนี้ไม่ได้");
}

// SEC S3a.1-S2 ▸ R-Z20: exception ที่หลุด ⇒ {error, message} + logOps (ไม่มี 500 ดิบ) ◂
export const POST = withErrors("inbox/quick-replies/[id]/apply POST", POST_);
