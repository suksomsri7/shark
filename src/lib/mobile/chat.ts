// Mobile: แชท AI แบบสตรีม — ครอบ sendMessage เดิม (ห้าม fork logic) แล้ว yield เป็น event ให้ route ทำ SSE
// ลำดับ: status "กำลังคิด" → await sendMessage → done (มี conversationId) · error → yield error
// จบสำเร็จ = set lastReadAt ของห้อง (คนส่งกำลังอ่านคำตอบอยู่แล้ว ไม่ต้องขึ้น unread เอง)

import { sendMessage, type Ctx, type SendResult } from "@/lib/ai/service";
import { tenantDb } from "@/lib/core/db";

type ChatInput = { conversationId?: string; text: string; imageUrls?: string[] };
export type ChatEvent =
  | { type: "status"; label: string }
  | { type: "done"; result: Extract<SendResult, { ok: true }> }
  | { type: "error"; error: string };

export async function* sendMobileChat(
  ctx: Ctx,
  input: ChatInput,
  deps?: Parameters<typeof sendMessage>[2],
): AsyncGenerator<ChatEvent> {
  yield { type: "status", label: "กำลังคิด" };

  let result: SendResult;
  try {
    result = await sendMessage(ctx, input, deps);
  } catch (e) {
    yield { type: "error", error: e instanceof Error ? e.message : "ผู้ช่วยตอบไม่ได้ชั่วคราว" };
    return;
  }

  if (!result.ok) {
    yield { type: "error", error: result.error };
    return;
  }

  // คนส่งอ่านคำตอบทันที → mark ห้องนี้ว่าอ่านแล้ว (best-effort ห้ามให้พังการตอบ)
  try {
    await tenantDb(ctx).aiConversation.updateMany({
      where: { id: result.conversationId },
      data: { lastReadAt: new Date() },
    });
  } catch {
    // ข้าม — mark read พลาดไม่กระทบคำตอบ
  }

  // ตั้งชื่อห้องอัตโนมัติจากคำถามแรก (คำสั่งเจ้าของ: "วิเคราะห์ตามที่ user ถาม")
  // best-effort: AI fast-tier ตั้งชื่อสั้น · พลาด = ตัดข้อความแรก 40 ตัว — ห้ามพังการตอบ
  try {
    await autoTitle(ctx, result.conversationId, input.text);
  } catch {
    // ข้าม
  }

  yield { type: "done", result };
}

// ตั้งชื่อห้องจากคำถามแรก — ทำเฉพาะห้องที่ยังไม่มีชื่อ (title ว่าง) · ชื่อ ≤40 ตัวอักษร
async function autoTitle(ctx: Ctx, conversationId: string, firstText: string): Promise<void> {
  const db = tenantDb(ctx);
  const conv = await db.aiConversation.findFirst({ where: { id: conversationId } });
  if (!conv || conv.title.trim() !== "") return;
  const fallback = firstText.trim().replace(/\s+/g, " ").slice(0, 40);
  let title = fallback;
  try {
    const { resolveProvider } = await import("@/lib/ai/provider");
    const provider = resolveProvider("fast");
    if (provider) {
      const reply = await provider.chat(
        [{ role: "user", content: `ตั้งชื่อหัวข้อสั้น ๆ ภาษาไทยไม่เกิน 30 ตัวอักษร สรุปว่าผู้ใช้ต้องการอะไรจากข้อความนี้ ตอบเฉพาะชื่อหัวข้อ ห้ามมีเครื่องหมายคำพูด:\n${firstText.slice(0, 500)}` }],
        { maxTokens: 60 },
      );
      const t = (reply.text ?? "").trim().replace(/^["'“”]+|["'“”]+$/g, "").slice(0, 40);
      if (t.length >= 2) title = t;
    }
  } catch {
    // ใช้ fallback
  }
  await db.aiConversation.updateMany({ where: { id: conversationId }, data: { title } });
}
