// POST /api/mobile/secretary/rooms/[id]/send {text, clientMessageId?} — สั่งเพิ่มในห้องเดิม (ไม่นับงาน · R-K6) · 10/นาที
//   `sendRoomMessage` (ข้อความ USER + job ใน tx เดียว) → worker ใน `after()` (R-K8) · ส่งซ้ำ clientMessageId เดิม = 200 `{duplicate:true}` ไม่สร้างซ้ำ
import { z } from "zod";
import { runRoomJobs, sendRoomMessage } from "@/lib/ai/secretary/worker";
import { claimClientMessageId, fail, gate, ID_MAX, idParam, notFound, ok, readBody, runAfter, thrown, withRateLimit, type RouteCtx } from "../../../_shared";

const Body = z.object({ text: z.string().max(4000), clientMessageId: z.string().trim().min(1).max(ID_MAX).optional() }).strict();

export async function POST(req: Request, ctx: RouteCtx) {
  const a = await gate(req);
  if (!a.ok) return a.res;
  const rl = await withRateLimit(a.c.userId, "send", 10);
  if (rl) return rl;
  const id = await idParam(ctx, "id");
  if (!id) return notFound("ไม่พบห้องงานนี้");
  const b = await readBody(req, Body);
  if (!b.ok) return b.res;
  const claim = b.v.clientMessageId ? await claimClientMessageId(a.c.tenantId, id, b.v.clientMessageId) : null;
  if (claim && !claim.first) return ok({ ok: true, duplicate: true });
  try {
    const r = await sendRoomMessage(a.c.conv, id, { text: b.v.text });
    if (!r.ok) {
      await claim?.release();
      if (r.error === "not_found") return notFound(r.message);
      if (r.error === "closed") return fail(409, "closed", r.message);
      return fail(400, "empty", r.message);
    }
    await runAfter(() => runRoomJobs());
    return ok({ ok: true, messageId: r.messageId, jobId: r.jobId });
  } catch (e) {
    await claim?.release();
    return thrown(e, "rooms.send");
  }
}
