import { NextResponse } from "next/server";
import { drainAll } from "@/lib/outbox-consumers";
import { isCronAuthorized } from "@/lib/core/cron-auth";

// POST /api/cron/outbox — drain outbox (เก็บตก event ที่ drain แบบ best-effort หลังบิลล้มเหลว · contract 2.4)
// auth: isCronAuthorized (X-Cron-Secret CRON_SECRET เดิม หรือ Bearer SHARK_CRON_SECRET — รวมมาตรฐาน)
export async function POST(req: Request) {
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const result = await drainAll();
  return NextResponse.json({ ok: true, ...result });
}
