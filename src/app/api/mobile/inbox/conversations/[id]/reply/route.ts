// POST /api/mobile/inbox/conversations/[id]/reply — ตอบลูกค้า/บันทึกภายใน (ห่อ `sendReply` · กันซ้ำ clientMessageId · 60 ครั้ง/นาที/ผู้ใช้ X7 · S1.21)
//   S1.14b: `suggestionId?` = ส่งจากร่างของ AI แนะนำคำตอบ ⇒ หลังส่งสำเร็จบันทึกผล `recordSuggestionOutcome` (แบบเดียวกับเว็บ `sendReplyAction`)
//           ล้ม = ไม่กระทบคำตอบ · คืน `suggestionOutcome` เมื่อบันทึกได้ · ไม่ส่ง clientMessageId แต่มี suggestionId ⇒ กันซ้ำด้วย `sugg:<suggestionId>`
import { z } from "zod";
import { tenantDb } from "@/lib/core/db";
import { logOps } from "@/lib/core/ops";
import { checkRateLimitDb } from "@/lib/core/rate-limit-db";
import { recordSuggestionOutcome } from "@/lib/modules/chat/ai-suggest";
import { sendReply } from "@/lib/modules/chat/service";
import { fail, gate, notFound, readBody, REPLY, systemOf, visibleConv, type RouteCtx } from "../../../_shared";

export const REPLY_RATE = { limit: 60, windowMs: 60_000 };

const Attachment = z
  .object({
    url: z.string().max(2048),
    mimeType: z.string().max(200),
    fileName: z.string().max(255).optional(),
    sizeBytes: z.number().int().nonnegative().optional(),
    width: z.number().int().nonnegative().optional(),
    height: z.number().int().nonnegative().optional(),
    durationMs: z.number().optional(),
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

/** บันทึกผลของร่าง AI (best-effort) — ร่างต้องเป็นของห้องนี้ (เดา id ของห้องอื่นไม่ได้) · ล้ม/ไม่พบ = undefined */
async function outcomeOf(args: { tenantId: string; systemId: string; conversationId: string; suggestionId: string; messageId: string; body: string | undefined; userId: string }): Promise<string | undefined> {
  try {
    const sug = await tenantDb({ tenantId: args.tenantId, systemId: args.systemId }).chatAiSuggestion.findFirst({
      where: { id: args.suggestionId, tenantId: args.tenantId, systemId: args.systemId, conversationId: args.conversationId },
      select: { id: true },
    });
    if (!sug) return undefined;
    const r = await recordSuggestionOutcome({ tenantId: args.tenantId, systemId: args.systemId, suggestionId: sug.id, sentMessageId: args.messageId, sentBody: args.body ?? "", userId: args.userId });
    return r.ok ? r.outcome : undefined;
  } catch (e) {
    await logOps("WARN", "mobile-inbox", "reply: บันทึกผลร่าง AI ล้ม", { detail: e instanceof Error ? e.message : String(e) }).catch(() => {});
    return undefined;
  }
}

export async function POST(req: Request, ctx: RouteCtx) {
  const a = await gate(req, [REPLY]);
  if (!a.ok) return a.res;
  const { c } = a;
  const { id } = await ctx.params;
  const b = await readBody(req, Body);
  if (!b.ok) return b.res;
  const clientMessageId = b.v.clientMessageId ?? (b.v.suggestionId ? `sugg:${b.v.suggestionId}` : undefined);
  if (!clientMessageId) return fail(422, "invalid", "ข้อมูลที่ส่งมาไม่ครบหรือไม่ถูกต้อง");
  const sid = await systemOf(c.tenantId, b.v.systemId);
  if (!sid) return notFound("ไม่พบระบบแชทนี้");
  if (!(await visibleConv(c, sid, id))) return notFound();

  // ถังต่อ (ร้าน, ผู้ใช้) = ต่อ Membership — ถังของร้านหนึ่งไม่กินโควตาตอบลูกค้าของอีกร้าน ◂
  const rl = await checkRateLimitDb(`mobile:inbox:reply:${c.tenantId}:${c.userId}`, REPLY_RATE);
  if (!rl.ok) {
    return Response.json(
      { error: "rate_limited", message: "ส่งถี่เกินไป รอสักครู่แล้วลองใหม่" },
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
        ? await outcomeOf({ tenantId: c.tenantId, systemId: sid, conversationId: id, suggestionId: b.v.suggestionId, messageId: r.messageId, body: b.v.body, userId: c.userId })
        : undefined;
    const extra = suggestionOutcome ? { suggestionOutcome } : {};
    // บันทึกแล้วแต่ส่งออกช่องทางไม่ผ่าน = ฟองขึ้น ✗ ในห้อง (ทีมกดส่งใหม่ได้) — ไม่ใช่ข้อผิดพลาดของคำขอ
    return Response.json(r.ok ? { messageId: r.messageId, ...extra } : { messageId: r.messageId, deliveryFailed: true, message: r.reason ?? "ส่งไม่สำเร็จ", ...extra });
  }
  return fail(422, "invalid", r.reason ?? "ส่งข้อความไม่สำเร็จ ลองใหม่อีกครั้ง");
}
