import { NextResponse } from "next/server";
import { runAccountReminders } from "@/lib/modules/account/service";
import { logOps } from "@/lib/core/ops";
import { isCronAuthorized } from "@/lib/core/cron-auth";

// POST|GET /api/cron/account/reminders — เตือนครบกำหนด/พ้นกำหนด/ใบกำกับซื้อ/เช็ค/ภ.พ.30 (WO 1.9 · §0.3 ข้อ 4)
// auth: isCronAuthorized (Bearer SHARK_CRON_SECRET หรือ X-Cron-Secret)
//
// 🔴 ยิงซ้ำได้: ตัวเตือนกันซ้ำด้วย "เนื้อความเดิมภายในวันไทยเดียวกัน" (ดู notifyUsersOncePerDay)
export const dynamic = "force-dynamic";

async function handle(req: Request) {
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const result = await runAccountReminders(new Date());
    return NextResponse.json({ ok: true, ...result, at: new Date().toISOString() });
  } catch (e) {
    await logOps("ERROR", "cron", "runAccountReminders ล้มทั้งรอบ", {
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
