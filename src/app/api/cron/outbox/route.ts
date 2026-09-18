import { NextResponse } from "next/server";
import { drainAll } from "@/lib/outbox-consumers";
import { isCronAuthorized } from "@/lib/core/cron-auth";
import { logOps } from "@/lib/core/ops";
import { runMinuteJobs } from "@/lib/platform/minute-jobs";

// ระบาย outbox (~20 วิ) + งานรายนาที (งบ 20 วิ + บันทึกท้ายรอบ) ≈ 41–45 วิ — ค่าเริ่มต้นที่สั้นกว่าจะตัดคำตอบทิ้งพร้อมผลการระบาย
export const maxDuration = 60;

// POST /api/cron/outbox — drain outbox (เก็บตก event ที่ drain แบบ best-effort หลังบิลล้มเหลว · contract 2.4)
// auth: isCronAuthorized (X-Cron-Secret CRON_SECRET เดิม หรือ Bearer SHARK_CRON_SECRET — รวมมาตรฐาน)
export async function POST(req: Request) {
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const result = await drainAll();
  // AUDIT-CLASS X5: CRM C0.5 — งานรายนาทีเป็น "ของแถม" หลังระบายคิว (ทางเดินจริงคือ scripts/crm-cron.mts บน VPS
  //   เพราะ route นี้ไม่มีตัวตั้งเวลาใดชี้มา · R-C.6) · รอให้จบ (promise ลอยถูกแช่แข็งเมื่อคำตอบ serverless จบ)
  //   · try/catch ของตัวเอง ครอบเฉพาะงานรายนาที — ผลของ route ต้องเหมือนเดิมทุกไบต์ ไม่มีสรุปงานในคำตอบ
  try {
    await runMinuteJobs(new Date(), { entry: "route" });
  } catch (e) {
    await logOps("WARN", "minute-job", "dispatcher failed inside /api/cron/outbox", {
      detail: e instanceof Error ? `${e.name}: ${e.message}` : String(e),
    });
  }
  return NextResponse.json({ ok: true, ...result });
}
