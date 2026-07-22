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

  yield { type: "done", result };
}
