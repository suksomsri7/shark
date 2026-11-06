// POST /api/mobile/inbox/conversations/[id]/translate-draft {systemId?, body, targetLang?} — แปลร่างคำตอบของทีมก่อนส่ง (S3a.6 สัญญาข้อ 3)
//   ห่อ `translateDraft` เดิม (**ไม่ส่งเอง** — คืนคำแปลให้ทีมยืนยัน · หัก CHAT_TRANSLATE) · ปลายทางปริยาย = contactLang (ไม่รู้ ⇒ en)
//   ด่าน: Bearer + x-tenant-id + อ่านแชท · ห้องที่มองไม่เห็น ⇒ 403 · เพดาน 30/นาที/ร้าน+ผู้ใช้ · อื่น ๆ 200 fail-soft `{ok:false, reason}`
import { z } from "zod";
import type { AccessQuery } from "@/lib/core/rbac";
import { translateDraft } from "@/lib/modules/chat/translate";
import { can, fail, gate, limited, notFound, READ, readBody, systemOf, visibleConv, type RouteCtx, withErrors } from "../../../_shared";

const TRANSLATE: AccessQuery = { module: "chat", action: "chat.translate.use" };
const Body = z.object({ systemId: z.string().max(64).optional(), body: z.string().max(4000), targetLang: z.string().max(16).optional() }).strict();

async function POST_(req: Request, ctx: RouteCtx) {
  const a = await gate(req, [READ]);
  if (!a.ok) return a.res;
  const { c } = a;
  const { id } = await ctx.params;
  const b = await readBody(req, Body);
  if (!b.ok) return b.res;
  const sid = await systemOf(c.tenantId, b.v.systemId);
  if (!sid) return notFound("ไม่พบระบบแชทนี้");
  if (!(await visibleConv(c, sid, id))) return fail(403, "forbidden", "บัญชีนี้มองไม่เห็นห้องแชทนี้");
  const rl = await limited(c, "translate", 30);
  if (rl) return rl;
  if (!can(c, TRANSLATE)) return Response.json({ ok: false, reason: "บัญชีนี้ยังไม่มีสิทธิ์ใช้การแปลข้อความ — ขอสิทธิ์จากเจ้าของร้าน" });
  const r = await translateDraft({ tenantId: c.tenantId, systemId: sid, conversationId: id, body: b.v.body, targetLang: b.v.targetLang ?? null, userId: c.userId });
  return r.ok ? Response.json({ ok: true, text: r.text }) : Response.json({ ok: false, reason: r.reason });
}

export const POST = withErrors("inbox/conversations/[id]/translate-draft POST", POST_);
