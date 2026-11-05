// POST /api/mobile/inbox/conversations/[id]/ai-suggest — ร่างคำตอบของ AI แนะนำคำตอบ (ห่อ `suggestReply` source "app" · S1.14b · ตั๋ว R-S2.17)
//   ด่าน = `chat.ai.suggest` (คีย์เดียวกับเว็บ `suggestReplyAction` · R-S1.14b-a) · 10/นาที/ร้าน+ผู้ใช้ · ห้องที่มองไม่เห็น = 404
//   ผลที่ lib ปฏิเสธ (ร้านปิด AI แนะนำ · เครดิต/เพดานวัน · ยังไม่มีข้อความลูกค้า) = 200 `{ ok:false, reason }` (แอปซ่อนการ์ด · ไม่ใช่ 4xx)
//   ด่านเงิน (`canRunAi` scope assist) + มิเตอร์อยู่ใน `suggestReply` เดิม — เส้นนี้ไม่เรียกโมเดลเอง
import { z } from "zod";
import type { AccessQuery } from "@/lib/core/rbac";
import { logOps } from "@/lib/core/ops";
import { suggestReply } from "@/lib/modules/chat/ai-suggest";
import { fail, gate, limited, notFound, readBody, systemOf, visibleConv, type RouteCtx } from "../../../_shared";

/** คีย์เดียวกับ `assertChatCan(auth, "chat.ai.suggest")` ของเว็บ (ไม่มีค่าคงที่ใน chat/guard-keys.ts — ห้ามแตะ chat/** ในใบนี้) */
const AI_SUGGEST: AccessQuery = { module: "chat", action: "chat.ai.suggest" };

const Body = z.object({ systemId: z.string().max(64).optional() }).strict();

export async function POST(req: Request, ctx: RouteCtx) {
  const a = await gate(req, [AI_SUGGEST]);
  if (!a.ok) return a.res;
  const { c } = a;
  const { id } = await ctx.params;
  const b = await readBody(req, Body);
  if (!b.ok) return b.res;
  const sid = await systemOf(c.tenantId, b.v.systemId);
  if (!sid) return notFound("ไม่พบระบบแชทนี้");
  if (!(await visibleConv(c, sid, id))) return notFound();
  const rl = await limited(c, "ai-suggest", 10);
  if (rl) return rl;
  try {
    const r = await suggestReply({ tenantId: c.tenantId, systemId: sid, conversationId: id, userId: c.userId, source: "app" });
    if (!r.ok) return Response.json({ ok: false, reason: r.reason });
    // allowlist: id · body · warn (ไม่ส่ง sources — เป็นรหัสภายในของคลังความรู้)
    return Response.json({ ok: true, options: r.options.map((o) => ({ id: o.id, body: o.body, warn: o.warn })), sourceMessageId: r.sourceMessageId });
  } catch (e) {
    await logOps("WARN", "mobile-inbox", "ai-suggest: ล้ม", { detail: e instanceof Error ? (e.stack ?? e.message) : String(e), tenantId: c.tenantId }).catch(() => {});
    return fail(500, "server_error", "ระบบขัดข้องชั่วคราว ลองใหม่อีกครั้ง");
  }
}
