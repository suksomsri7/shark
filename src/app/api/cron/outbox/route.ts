import { NextResponse } from "next/server";
import { drainAll } from "@/lib/outbox-consumers";

// POST /api/cron/outbox — drain outbox (ผู้ใช้ CRON_SECRET รายแรกของแพลตฟอร์ม)
// เก็บตก event ที่ drain แบบ best-effort หลังบิลล้มเหลว (contract 2.4)
// auth: header X-Cron-Secret === CRON_SECRET (ไม่ตรง = 401)
export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("x-cron-secret") !== secret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const result = await drainAll();
  return NextResponse.json({ ok: true, ...result });
}
