import { NextResponse } from "next/server";
import { runScheduledTasks } from "@/lib/ai/scheduled";
import { sweepPendingVoiceDelivery } from "@/lib/platform/cron";
import { logOps } from "@/lib/core/ops";
import { isCronAuthorized } from "@/lib/core/cron-auth";

// GET /api/cron/hourly — งานประจำของผู้ช่วย AI (Vercel Cron เรียกทุกต้นชั่วโมง)
// auth: isCronAuthorized (Bearer SHARK_CRON_SECRET หรือ X-Cron-Secret) — ผิด/ไม่มี → 401 สั้น ๆ
// รัน runScheduledTasks(now): task ที่ถึงชั่วโมงไทยตอนนี้และยังไม่ได้รันวันนี้ → สรุปเป็น AppNotification
// + WO-CV13: ตาข่ายเก็บตกข้อความเสียงที่ค้างรอส่งเข้าช่องทาง (เผื่อ cron บน VPS ตาย)
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  // runScheduledTasks catch งานย่อยรายตัวเองแล้ว — ห่ออีกชั้นเผื่อพังทั้งรอบ → logOps ERROR
  let ran: number;
  try {
    ran = await runScheduledTasks(new Date());
  } catch (e) {
    await logOps("ERROR", "cron", "runScheduledTasks ล้มทั้งรอบ", {
      detail: e instanceof Error ? (e.stack ?? e.message) : String(e),
    });
    return NextResponse.json({ ok: false, error: "cron_failed" }, { status: 500 });
  }
  // best-effort — ตัวนี้ล้มห้ามทำให้ cron รอบนี้แดง (งานหลักของ route คือ runScheduledTasks)
  const voiceSent = await sweepPendingVoiceDelivery();
  return NextResponse.json({ ok: true, ran, voiceSent, at: new Date().toISOString() });
}
