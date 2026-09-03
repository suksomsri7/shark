import { NextResponse } from "next/server";
import { runRecurringRules } from "@/lib/modules/account/service";
import { logOps } from "@/lib/core/ops";
import { isCronAuthorized } from "@/lib/core/cron-auth";

// POST|GET /api/cron/account/recurring — สร้างเอกสารประจำที่ถึงรอบ (WO 1.9 · BLUEPRINT §0.3 ข้อ 7)
// auth: isCronAuthorized (Bearer SHARK_CRON_SECRET หรือ X-Cron-Secret — มาตรฐานเดียวกับ /api/cron/tick)
//
// 🔴 ปลอดภัยต่อการยิงซ้ำโดยสิ้นเชิง: กันซ้ำอยู่ที่ unique(ruleId, periodKey) ในฐานข้อมูล
//    ⇒ ยิงวันละ 10 ครั้งก็ยังได้เอกสารงวดละ 1 ใบ (จึงเปิด GET ให้ Vercel Cron เรียกได้ด้วย)
// รองรับทั้ง VPS cron (scripts/acc-v2-cron-recurring.mts เรียก service ตรง) และ Vercel Cron (HTTP)
export const dynamic = "force-dynamic";

async function handle(req: Request) {
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const result = await runRecurringRules(new Date());
    return NextResponse.json({ ok: true, ...result, at: new Date().toISOString() });
  } catch (e) {
    await logOps("ERROR", "cron", "runRecurringRules ล้มทั้งรอบ", {
      detail: e instanceof Error ? (e.stack ?? e.message) : String(e),
    });
    return NextResponse.json({ ok: false, error: "cron_failed" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  return handle(req);
}

export async function GET(req: Request) {
  return handle(req);
}
