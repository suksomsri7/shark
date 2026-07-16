import { NextResponse } from "next/server";
import { runDailyCron } from "@/lib/platform/cron";
import { logOps } from "@/lib/core/ops";

// GET /api/cron/tick — งาน cron ประจำวัน (Vercel Cron เรียก 03:00 BKK)
// auth: header authorization ต้องเท่ากับ `Bearer ${SHARK_CRON_SECRET}` เป๊ะ
// ไม่มี secret ใน env หรือไม่ตรง → 401 ตอบสั้น ๆ (ไม่บอกรายละเอียด)
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const secret = process.env.SHARK_CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
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
