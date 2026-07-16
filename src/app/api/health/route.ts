import { NextResponse } from "next/server";
import { healthSnapshot } from "@/lib/core/ops";

// GET /api/health — สาธารณะ (ไม่มีข้อมูลลับ) · uptime probe เรียกได้
// DB พัง → 503 + ok:false · ปกติ → 200 + ok:true
export const dynamic = "force-dynamic";

export async function GET() {
  const h = await healthSnapshot();
  return NextResponse.json(
    { ok: h.db, db: h.db, outboxPending: h.outboxPending, at: new Date().toISOString() },
    { status: h.db ? 200 : 503 },
  );
}
