// AI Quality (self-improving item 2) — วัดคุณภาพ AI ระดับแพลตฟอร์ม (รวมทุกร้าน)
// platform scope: อ่านผ่าน base client `prisma` ข้ามทุก tenant (เหมือน platform/service.ts)
// ไม่ใช้ tenantDb — เจตนาให้เห็นสถิติ 👍👎 + คะแนนข้อสอบรวมทั้งแพลตฟอร์ม

import { prisma } from "@/lib/core/db";
import { scoreEvalWithHeuristic } from "@/lib/ai/eval";

export type PlatformFeedbackSummary = {
  up: number;
  down: number;
  total: number;
  ratePct: number; // สัดส่วน 👍 เป็น % (0 เมื่อ total=0 กันหารศูนย์)
  recentDown: { userText: string; note: string | null }[];
};

// สถิติ 👍👎 รวมทุกร้าน + ตัวอย่าง 👎 ล่าสุด (≤20) สำหรับวิเคราะห์คุณภาพ
export async function platformFeedbackSummary(): Promise<PlatformFeedbackSummary> {
  const [up, down, recentDown] = await Promise.all([
    prisma.aiFeedback.count({ where: { rating: "UP" } }),
    prisma.aiFeedback.count({ where: { rating: "DOWN" } }),
    prisma.aiFeedback.findMany({
      where: { rating: "DOWN" },
      select: { userText: true, note: true },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
  ]);
  const total = up + down;
  const ratePct = total === 0 ? 0 : Math.round((up / total) * 100);
  return { up, down, total, ratePct, recentDown };
}

export type PlatformEvalScore = { total: number; passed: number; pct: number };

// คะแนน "ข้อสอบ" เลือก tool ของ AI (baseline heuristic จาก ai/eval.ts)
export async function platformEvalScore(): Promise<PlatformEvalScore> {
  const r = scoreEvalWithHeuristic();
  const pct = r.total === 0 ? 0 : Math.round((r.passed / r.total) * 100);
  return { total: r.total, passed: r.passed, pct };
}
