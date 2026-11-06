// POST /api/mobile/inbox/conversations/[id]/messages/[mid]/translate {systemId?, targetLang?} — แปลข้อความในห้องแชทลูกค้า (S3a.6 สัญญาข้อ 2)
//   ห่อ `translateMessage` เดิม (สวิตช์ร้าน → ข้อความ → แคช translatedBody → เครดิต → โมเดล · หัก CHAT_TRANSLATE) · ปลายทางปริยาย = staffLang
//   ด่าน: Bearer + x-tenant-id + อ่านแชท (`chat.conversation.read`) · ห้อง/ข้อความที่มองไม่เห็น ⇒ 403 · เพดาน 30/นาที/ร้าน+ผู้ใช้ (429)
//   ผลทุกแบบอื่น = 200 fail-soft: `{ok:true, text, cached, lang}` | `{ok:false, reason}` (ไทย — ปิดฟีเจอร์ · ไม่มีสิทธิ์แปล · เครดิตหมด · ว่าง)
import { z } from "zod";
import type { AccessQuery } from "@/lib/core/rbac";
import { tenantDb } from "@/lib/core/db";
import { isLangCode, normalizeLang, translateMessage } from "@/lib/modules/chat/translate";
import { can, fail, gate, limited, notFound, READ, readBody, systemOf, visibleConv, withErrors } from "../../../../../_shared";

const TRANSLATE: AccessQuery = { module: "chat", action: "chat.translate.use" };
const Body = z.object({ systemId: z.string().max(64).optional(), targetLang: z.string().max(16).refine(isLangCode, "รหัสภาษาไม่ถูกต้อง").optional() /* R-Z61b: ตรวจรูปร่างเท่านั้น (ภาษานอก LANG_NAME ใช้รหัสตรง ๆ) */ }).strict();
type Ctx = { params: Promise<{ id: string; mid: string }> };
const NOT_VISIBLE = "บัญชีนี้มองไม่เห็นห้องแชทนี้";

async function POST_(req: Request, ctx: Ctx) {
  const a = await gate(req, [READ]);
  if (!a.ok) return a.res;
  const { c } = a;
  const { id, mid } = await ctx.params;
  const b = await readBody(req, Body);
  if (!b.ok) return b.res;
  const sid = await systemOf(c.tenantId, b.v.systemId);
  if (!sid) return notFound("ไม่พบระบบแชทนี้");
  if (!(await visibleConv(c, sid, id))) return fail(403, "forbidden", NOT_VISIBLE);
  const msg = await tenantDb({ tenantId: c.tenantId, systemId: sid }).chatMessage.findFirst({ where: { id: String(mid ?? "").trim(), tenantId: c.tenantId, systemId: sid, conversationId: id }, select: { id: true } });
  if (!msg) return fail(403, "forbidden", NOT_VISIBLE);
  const rl = await limited(c, "translate", 30);
  if (rl) return rl;
  if (!can(c, TRANSLATE)) return Response.json({ ok: false, reason: "บัญชีนี้ยังไม่มีสิทธิ์ใช้การแปลข้อความ — ขอสิทธิ์จากเจ้าของร้าน" });
  const r = await translateMessage({ tenantId: c.tenantId, systemId: sid, messageId: msg.id, targetLang: b.v.targetLang ?? null, userId: c.userId });
  if (!r.ok) return Response.json({ ok: false, reason: r.reason });
  const setting = await tenantDb({ tenantId: c.tenantId, systemId: sid }).chatSetting.findFirst({ where: { tenantId: c.tenantId, systemId: sid }, select: { staffLang: true } });
  const lang = normalizeLang(b.v.targetLang) ?? normalizeLang(setting?.staffLang) ?? "th";
  return Response.json({ ok: true, text: r.text, cached: r.cached === true, lang });
}

export const POST = withErrors("inbox/conversations/[id]/messages/[mid]/translate POST", POST_);
