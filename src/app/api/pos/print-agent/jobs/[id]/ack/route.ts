// POST /api/pos/print-agent/jobs/[id]/ack — ผลการพิมพ์จากตัวช่วยพิมพ์ LAN (P3-SKEL R13 · CD-S9) — Authorization: Bearer <โทเคน agent>
// body {ok: boolean, error?: string} → 200 {status DONE|FAILED} · งานของ agent อื่น/ไม่มี = 404 · จบแล้ว/หมดอายุ = 409 · โทเคนผิด/เพิกถอน = 401 · body ผิด = 400
import { ackPrintJob } from "@/lib/modules/pos/print-relay";

export const dynamic = "force-dynamic";

const STATUS: Record<string, number> = { UNAUTHORIZED: 401, NOT_FOUND: 404, CONFLICT: 409, VALIDATION: 400 };

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  let body: unknown = null;
  try {
    const text = await req.text();
    body = text.length <= 4096 ? JSON.parse(text) : null;
  } catch {
    body = null;
  }
  const p = await ctx.params;
  const r = await ackPrintJob(req.headers.get("authorization"), String(p?.id ?? ""), body);
  if (r.ok === true) return Response.json({ status: r.status }, { status: 200 });
  return Response.json({ error: r.code.toLowerCase() }, { status: STATUS[r.code] ?? 503 });
}
