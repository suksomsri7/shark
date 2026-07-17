// feedback — ปุ่ม 👍👎 ใต้คำตอบ AI (self-improving item 3) → ข้อมูลติดป้ายสำหรับวัดคุณภาพ + เทรน
// ⚠️ PDPA: anonymize userText + replyText ก่อนเก็บเสมอ (เบอร์/อีเมล → placeholder) reuse dataset.anonymize
import { tenantDb } from "@/lib/core/db";
import { anonymize } from "@/lib/ai/dataset";

export type FeedbackCtx = { tenantId: string };
export type FeedbackRating = "UP" | "DOWN";
export type FeedbackInput = {
  conversationId?: string;
  userText: string;
  replyText: string;
  rating: FeedbackRating;
  note?: string;
};

/**
 * เก็บ 1 feedback ของคำตอบ AI (👍 = UP / 👎 = DOWN)
 * - rating นอก "UP"/"DOWN" → throw (ข้อความไทย)
 * - anonymize userText + replyText ก่อนเก็บ (เบอร์/อีเมล)
 * - tenantDb create ใส่ tenantId ตรง ๆ
 */
export async function recordFeedback(ctx: FeedbackCtx, input: FeedbackInput): Promise<{ id: string }> {
  if (input.rating !== "UP" && input.rating !== "DOWN") {
    throw new Error("คะแนนไม่ถูกต้อง ต้องเป็น 👍 หรือ 👎 เท่านั้น");
  }
  const note = input.note?.trim() ? input.note.trim() : null;
  const row = await tenantDb(ctx).aiFeedback.create({
    data: {
      tenantId: ctx.tenantId,
      conversationId: input.conversationId ?? null,
      userText: anonymize(input.userText),
      replyText: anonymize(input.replyText),
      rating: input.rating,
      note,
    },
    select: { id: true },
  });
  return { id: row.id };
}

export type FeedbackStats = {
  up: number;
  down: number;
  total: number;
  downSamples: { userText: string; note: string | null }[];
};

/**
 * สรุปสถิติ feedback ของร้าน — up/down/total + ตัวอย่าง 👎 ล่าสุด (≤20) สำหรับวิเคราะห์ปรับปรุง
 */
export async function feedbackStats(ctx: FeedbackCtx): Promise<FeedbackStats> {
  const db = tenantDb(ctx);
  const [up, down, downRows] = await Promise.all([
    db.aiFeedback.count({ where: { rating: "UP" } }),
    db.aiFeedback.count({ where: { rating: "DOWN" } }),
    db.aiFeedback.findMany({
      where: { rating: "DOWN" },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: { userText: true, note: true },
    }),
  ]);
  return {
    up,
    down,
    total: up + down,
    downSamples: downRows.map((r) => ({ userText: r.userText, note: r.note })),
  };
}
