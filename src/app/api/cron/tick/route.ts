import { NextResponse } from "next/server";
import { runDailyCron } from "@/lib/platform/cron";
import { logOps } from "@/lib/core/ops";
import { isCronAuthorized } from "@/lib/core/cron-auth";

// GET /api/cron/tick — งาน cron ประจำวัน (Vercel Cron เรียก 03:00 BKK)
// auth: isCronAuthorized (Bearer SHARK_CRON_SECRET หรือ X-Cron-Secret — รวมมาตรฐาน)
// ไม่มี secret ใน env หรือไม่ตรง → 401 ตอบสั้น ๆ (ไม่บอกรายละเอียด)
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  // runDailyCron ห่อ try/catch งานย่อยเองแล้ว — ห่ออีกชั้นเผื่อพังทั้งรอบ → logOps ERROR
  let result;
  try {
    result = await runDailyCron();
  } catch (e) {
    await logOps("ERROR", "cron", "runDailyCron ล้มทั้งรอบ", {
      detail: e instanceof Error ? (e.stack ?? e.message) : String(e),
    });
    return NextResponse.json({ ok: false, error: "cron_failed" }, { status: 500 });
  }
  return NextResponse.json({ ok: true, ...result, at: new Date().toISOString() });
}
