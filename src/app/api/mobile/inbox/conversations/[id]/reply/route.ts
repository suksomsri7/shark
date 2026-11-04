// POST /api/mobile/inbox/conversations/[id]/reply — ตอบลูกค้า/บันทึกภายใน (ห่อ `sendReply` · กันซ้ำ clientMessageId · 60 ครั้ง/นาที/ผู้ใช้ X7 · S1.21)
import { z } from "zod";
import { checkRateLimitDb } from "@/lib/core/rate-limit-db";
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
    clientMessageId: z.string().trim().min(1).max(100),
  })
  .strict();

export async function POST(req: Request, ctx: RouteCtx) {
  const a = await gate(req, [REPLY]);
  if (!a.ok) return a.res;
  const { c } = a;
  const { id } = await ctx.params;
  const b = await readBody(req, Body);
  if (!b.ok) return b.res;
  const sid = await systemOf(c.tenantId, b.v.systemId);
  if (!sid) return notFound("ไม่พบระบบแชทนี้");
  if (!(await visibleConv(c, sid, id))) return notFound();

  const rl = await checkRateLimitDb(`mobile:inbox:reply:${c.userId}`, REPLY_RATE);
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
    clientMessageId: b.v.clientMessageId,
  });
  if (r.duplicate && r.messageId) return Response.json({ duplicate: true, messageId: r.messageId });
  // บันทึกแล้วแต่ส่งออกช่องทางไม่ผ่าน = ฟองขึ้น ✗ ในห้อง (ทีมกดส่งใหม่ได้) — ไม่ใช่ข้อผิดพลาดของคำขอ
  if (r.messageId) return Response.json(r.ok ? { messageId: r.messageId } : { messageId: r.messageId, deliveryFailed: true, message: r.reason ?? "ส่งไม่สำเร็จ" });
  return fail(422, "invalid", r.reason ?? "ส่งข้อความไม่สำเร็จ ลองใหม่อีกครั้ง");
}
