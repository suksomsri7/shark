// GET /api/pos/print-agent/jobs — ตัวช่วยพิมพ์ LAN มารับงาน (P3-SKEL R13 · CD-S9) — Authorization: Bearer <โทเคน agent>
//
// ?wait=0 = ตอบทันที · ไม่ส่ง/ค่าอื่น = long-poll สูงสุด 25 วินาที (ตรวจทุก 1 วินาที · ผู้เรียกตัดสาย = จบ) · 200 {jobs:[{id, bytesB64, target, printer, …}]}
// งานหนึ่งถูกแจกครั้งเดียว (แม้ poll ซ้อน) · โทเคนไม่มี/ว่าง/ผิด/ถูกเพิกถอน = 401 · ไม่ใช้ session/คุกกี้
import { claimPrintJobs, PRINT_POLL_MAX_SEC } from "@/lib/modules/pos/print-relay";

export const dynamic = "force-dynamic";

const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((res) => {
    const t = setTimeout(res, ms);
    signal.addEventListener("abort", () => (clearTimeout(t), res()), { once: true });
  });

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const raw = url.searchParams.get("wait");
  const n = raw === null ? PRINT_POLL_MAX_SEC : Number(raw);
  const waitSec = Number.isFinite(n) ? Math.min(Math.max(Math.floor(n), 0), PRINT_POLL_MAX_SEC) : PRINT_POLL_MAX_SEC;
  const deadline = Date.now() + waitSec * 1000;
  const auth = req.headers.get("authorization");
  for (;;) {
    const r = await claimPrintJobs(auth);
    if (r.ok !== true) {
      if (r.code === "UNAUTHORIZED") return Response.json({ error: "unauthorized" }, { status: 401 });
      return Response.json({ error: "unavailable" }, { status: 503 });
    }
    if (r.jobs.length || Date.now() >= deadline || req.signal.aborted) return Response.json({ jobs: r.jobs }, { status: 200, headers: { "cache-control": "no-store" } });
    await sleep(Math.min(1000, Math.max(0, deadline - Date.now())), req.signal);
  }
}
