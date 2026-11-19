// GET/PUT /api/mobile/inbox/ai-settings — สวิตช์ "AI แนะนำคำตอบ" · "การแปลข้อความ" · ภาษาที่ทีมอ่าน ของระบบแชท (17 พ.ย. 2026 · B27)
//   อ่าน = สิทธิ์ดูแชท (READ) · ผล `{ systemId, aiSuggestEnabled, translateEnabled, staffLang, langs[], canEdit }` (ยังไม่มีแถว = ค่าเริ่มต้น ปิด/ปิด/th)
//   แก้ = คีย์ `chat.setting.setMemberSystem` (ด่านเดียวกับฟอร์มเว็บ `setChatAiSettingsAction`) · ไม่มีคีย์ = 403 ไทย · 30/นาที/ร้าน+ผู้ใช้
//   body `{ systemId?, aiSuggestEnabled, translateEnabled, staffLang ∈ STAFF_LANGS }` (.strict · ส่งครบทั้งชุด) · ภาษานอกชุด = 422
//   ตัวเขียน = `writeChatAiSettings` ตัวเดียวกับเว็บ · ระบบแชทของร้านอื่น = 404 (systemOf)
import { z } from "zod";
import type { AccessQuery } from "@/lib/core/rbac";
import { CHAT_SETTING_ACTION } from "@/lib/modules/chat/guard";
import { readChatAiSettings, STAFF_LANGS, writeChatAiSettings, type ChatAiSettings } from "@/lib/modules/chat/ai-settings";
import { can, fail, gate, limited, notFound, READ, readBody, systemOf, type InboxCtx, withErrors } from "../_shared";

const SETTING: AccessQuery = { module: "chat", action: CHAT_SETTING_ACTION };

const dto = (c: InboxCtx, systemId: string, v: ChatAiSettings) => ({
  systemId,
  aiSuggestEnabled: v.aiSuggestEnabled,
  translateEnabled: v.translateEnabled,
  staffLang: v.staffLang,
  langs: [...STAFF_LANGS],
  canEdit: can(c, SETTING),
});

async function GET_(req: Request) {
  const a = await gate(req, [READ]);
  if (!a.ok) return a.res;
  const sid = await systemOf(a.c.tenantId, new URL(req.url).searchParams.get("systemId"));
  if (!sid) return notFound("ไม่พบระบบแชทนี้");
  return Response.json(dto(a.c, sid, await readChatAiSettings(a.c.tenantId, sid)));
}

const Body = z
  .object({
    systemId: z.string().max(64).optional(),
    aiSuggestEnabled: z.boolean(),
    translateEnabled: z.boolean(),
    staffLang: z.enum(STAFF_LANGS),
  })
  .strict();

async function PUT_(req: Request) {
  const a = await gate(req, [READ]);
  if (!a.ok) return a.res;
  if (!can(a.c, SETTING)) return fail(403, "forbidden", "ตั้งค่า AI และการแปลได้เฉพาะเจ้าของร้าน หรือคนที่ได้รับสิทธิ์ตั้งค่าแชท");
  const rl = await limited(a.c, "ai-settings", 30);
  if (rl) return rl;
  const b = await readBody(req, Body);
  if (!b.ok) return b.res;
  const sid = await systemOf(a.c.tenantId, b.v.systemId);
  if (!sid) return notFound("ไม่พบระบบแชทนี้");
  const v = await writeChatAiSettings(a.c.tenantId, sid, { aiSuggestEnabled: b.v.aiSuggestEnabled, translateEnabled: b.v.translateEnabled, staffLang: b.v.staffLang });
  if (!v) return notFound("ไม่พบระบบแชทนี้");
  return Response.json(dto(a.c, sid, v));
}

// SEC S3a.1-S2 ▸ R-Z20: exception ที่หลุด ⇒ {error, message} + logOps (ไม่มี 500 ดิบ) ◂
export const GET = withErrors("inbox/ai-settings GET", GET_);
export const PUT = withErrors("inbox/ai-settings PUT", PUT_);
