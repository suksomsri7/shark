// POST /api/mobile/inbox/conversations/[id]/reply — ตอบลูกค้า/บันทึกภายใน (ห่อ `sendReply` · กันซ้ำ clientMessageId · 60 ครั้ง/นาที/ผู้ใช้ X7 · S1.21)
//   S1.14b: `suggestionId?` = ส่งจากร่างของ AI แนะนำคำตอบ ⇒ หลังส่งสำเร็จบันทึกผล `recordSuggestionOutcome` (แบบเดียวกับเว็บ `sendReplyAction`)
//           ล้ม = ไม่กระทบคำตอบ · คืน `suggestionOutcome` เมื่อบันทึกได้ · ไม่ส่ง clientMessageId แต่มี suggestionId ⇒ กันซ้ำด้วย `sugg:<suggestionId>`
//           (R-S1.14b-g) suggestionId ที่ไม่ใช่ของห้อง/ระบบ/ร้านนี้ ⇒ 422 bad_suggestion ก่อนส่ง · บันทึกภายในใช้ `sugg:` แทน clientMessageId ไม่ได้
import { z } from "zod";
import { tenantDb } from "@/lib/core/db";
import { errDetail, logOps } from "@/lib/core/ops";
import { checkRateLimitDb } from "@/lib/core/rate-limit-db";
import { recordSuggestionOutcome } from "@/lib/modules/chat/ai-suggest";
import { sendReply } from "@/lib/modules/chat/service";
import { fail, gate, notFound, readBody, REPLY, systemOf, visibleConv, type RouteCtx, withErrors } from "../../../_shared";

export const REPLY_RATE = { limit: 60, windowMs: 60_000 };

const Attachment = z
  .object({
    url: z.string().max(2048),
    mimeType: z.string().max(200),
    fileName: z.string().max(255).optional(),
    // SEC S3a.1-S2 ▸ R-Z20 (L4): ขอบเขตตามคอลัมน์ INT4 + เพดานไฟล์แนบ (ไม่ใช่ 500 จากฐาน) ◂
    sizeBytes: z.number().int().nonnegative().max(10 * 1024 * 1024).optional(),
    width: z.number().int().nonnegative().max(20_000).optional(),
    height: z.number().int().nonnegative().max(20_000).optional(),
    durationMs: z.number().int().nonnegative().max(3_600_000).optional(),
    storageKey: z.string().max(1024).optional(),
  })
  .strict();
const Body = z
  .object({
    systemId: z.string().max(64).optional(),
    body: z.string().max(4000).optional(),
    attachments: z.array(Attachment).max(10).optional(),
    isInternal: z.boolean().optional(),
    clientMessageId: z.string().trim().min(1).max(100).optional(),
    suggestionId: z.string().trim().min(1).max(80).optional(),
  })
  .strict();

/** ร่าง AI ต้องเป็นของห้อง+ระบบ+ร้านนี้ (เดา id ของห้องอื่นไม่ได้ · R-S1.14b-g) */
async function suggestionInConv(tenantId: string, systemId: string, conversationId: string, suggestionId: string): Promise<boolean> {
  const sug = await tenantDb({ tenantId, systemId }).chatAiSuggestion.findFirst({
    where: { id: suggestionId, tenantId, systemId, conversationId },
    select: { id: true },
  });
  return !!sug;
}

/** บันทึกผลของร่าง AI (best-effort · ตรวจเจ้าของร่างแล้วก่อนส่ง) — ล้ม = undefined */
async function outcomeOf(args: { tenantId: string; systemId: string; suggestionId: string; messageId: string; body: string | undefined; userId: string }): Promise<string | undefined> {
  try {
    const r = await recordSuggestionOutcome({ tenantId: args.tenantId, systemId: args.systemId, suggestionId: args.suggestionId, sentMessageId: args.messageId, sentBody: args.body ?? "", userId: args.userId });
    return r.ok ? r.outcome : undefined;
  } catch (e) {
    await logOps("WARN", "mobile-inbox", "reply: บันทึกผลร่าง AI ล้ม", { detail: errDetail(e) }).catch(() => {});
    return undefined;
  }
}

async function POST_(req: Request, ctx: RouteCtx) {
  const a = await gate(req, [REPLY]);
  if (!a.ok) return a.res;
  const { c } = a;
  const { id } = await ctx.params;
  const b = await readBody(req, Body);
  if (!b.ok) return b.res;
  // คีย์ `sugg:` เฉพาะคำตอบจริง (บันทึกภายในต้องส่ง clientMessageId เอง)
  const clientMessageId = b.v.clientMessageId ?? (b.v.suggestionId && b.v.isInternal !== true ? `sugg:${b.v.suggestionId}` : undefined);
  if (!clientMessageId) return fail(422, "invalid", "ข้อมูลที่ส่งมาไม่ครบหรือไม่ถูกต้อง");
  const sid = await systemOf(c.tenantId, b.v.systemId);
  if (!sid) return notFound("ไม่พบระบบแชทนี้");
  if (!(await visibleConv(c, sid, id))) return notFound();
  if (b.v.suggestionId && !(await suggestionInConv(c.tenantId, sid, id, b.v.suggestionId))) {
    return fail(422, "bad_suggestion", "ร่างคำตอบนี้ไม่ใช่ของบทสนทนานี้ — ขอร่างใหม่แล้วลองอีกครั้ง");
  }

  // ถังต่อ (ร้าน, ผู้ใช้) = ต่อ Membership — ถังของร้านหนึ่งไม่กินโควตาตอบลูกค้าของอีกร้าน ◂
  const rl = await checkRateLimitDb(`mobile:inbox:reply:${c.tenantId}:${c.userId}`, REPLY_RATE);
  if (!rl.ok) {
    return Response.json(
      { error: "rate_limited", message: "ส่งถี่เกินไป รอสักครู่แล้วลองใหม่", retryAfterSec: rl.retryAfterSec ?? 60 },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSec ?? 60) } },
    );
  }

  const r = await sendReply({
    tenantId: c.tenantId,
    systemId: sid,
    conversationId: id,
    senderUserId: c.userId,
    body: b.v.body,
    attachments: b.v.attachments,
    isInternal: b.v.isInternal === true,
    unitAccess: c.ua,
    clientMessageId,
  });
  if (r.duplicate && r.messageId) return Response.json({ duplicate: true, messageId: r.messageId });
  if (r.messageId) {
    // เว็บบันทึกผลเมื่อมีข้อความ (ส่งออกช่องทางล้มก็ยังนับว่าทีมใช้ร่างนี้) · บันทึกภายในไม่นับ
    const suggestionOutcome =
      b.v.suggestionId && b.v.isInternal !== true
        ? await outcomeOf({ tenantId: c.tenantId, systemId: sid, suggestionId: b.v.suggestionId, messageId: r.messageId, body: b.v.body, userId: c.userId })
        : undefined;
    const extra = suggestionOutcome ? { suggestionOutcome } : {};
    // บันทึกแล้วแต่ส่งออกช่องทางไม่ผ่าน = ฟองขึ้น ✗ ในห้อง (ทีมกดส่งใหม่ได้) — ไม่ใช่ข้อผิดพลาดของคำขอ
    return Response.json(r.ok ? { messageId: r.messageId, ...extra } : { messageId: r.messageId, deliveryFailed: true, message: r.reason ?? "ส่งไม่สำเร็จ", ...extra });
  }
  return fail(422, "invalid", r.reason ?? "ส่งข้อความไม่สำเร็จ ลองใหม่อีกครั้ง");
}

// SEC S3a.1-S2 ▸ R-Z20: exception ที่หลุด ⇒ {error, message} + logOps (ไม่มี 500 ดิบ) ◂
export const POST = withErrors("inbox/conversations/[id]/reply POST", POST_);
