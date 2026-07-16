import { NextResponse } from "next/server";
import { runDailyCron } from "@/lib/platform/cron";

// GET /api/cron/tick — งาน cron ประจำวัน (Vercel Cron เรียก 03:00 BKK)
// auth: header authorization ต้องเท่ากับ `Bearer ${SHARK_CRON_SECRET}` เป๊ะ
// ไม่มี secret ใน env หรือไม่ตรง → 401 ตอบสั้น ๆ (ไม่บอกรายละเอียด)
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const secret = process.env.SHARK_CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const result = await runDailyCron();
  return NextResponse.json({ ok: true, ...result, at: new Date().toISOString() });
}
