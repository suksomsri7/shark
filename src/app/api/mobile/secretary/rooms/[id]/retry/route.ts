// POST /api/mobile/secretary/rooms/[id]/retry {jobId?} — 17 พ.ย. ปุ่ม "ลองอีกครั้ง" ของประกาศ "ไม่สำเร็จ" ในห้อง
//   งานล่าสุดของห้องที่ FAILED (ยังไม่มีคำตอบตามมา) กลับคิว — job เดิม · ไม่สร้างข้อความ USER ซ้ำ (`retryRoomJob`) → worker ใน `after()`
//   เพดานเดียวกับการส่งข้อความในห้อง (ถัง "send" 10/นาที) · มองไม่เห็นห้อง 404 · ไม่ใช่ผู้เปิดห้อง 403 · ห้องปิด 409 closed ·
//   ไม่ได้ล้มแล้ว/jobId ไม่ใช่งานล่าสุด 409 not_failed · ลองใหม่ครบ 409 exhausted
import { z } from "zod";
import { retryRoomJob, runRoomJobs } from "@/lib/ai/secretary/worker";
import { fail, forbidden, gate, ID_MAX, idParam, notFound, ok, readBody, runAfter, withRateLimit, type RouteCtx, withErrors } from "../../../_shared";

/** route นี้รัน worker (โมเดล) ใน `after()` — ค่าเดียวกับ rooms/[id]/send (R-Z5) */
export const maxDuration = 300;
const WORKER_DEADLINE_MS = 240_000;

const Body = z.object({ jobId: z.string().trim().min(1).max(ID_MAX).optional() }).strict();

async function POST_(req: Request, ctx: RouteCtx) {
  const start = Date.now();
  const a = await gate(req);
  if (!a.ok) return a.res;
  const rl = await withRateLimit(`${a.c.tenantId}:${a.c.userId}`, "send", 10);
  if (rl) return rl;
  const id = await idParam(ctx, "id");
  if (!id) return notFound("ไม่พบห้องงานนี้");
  const b = await readBody(req, Body);
  if (!b.ok) return b.res;
  const r = await retryRoomJob(a.c.conv, id, b.v.jobId ?? null);
  if (!r.ok) {
    if (r.error === "not_found") return notFound(r.message);
    if (r.error === "forbidden") return forbidden(r.message);
    return fail(409, r.error, r.message);
  }
  await runAfter(() => runRoomJobs({ jobIds: [r.jobId], limit: 1, deadline: start + WORKER_DEADLINE_MS }));
  return ok({ ok: true, jobId: r.jobId });
}

export const POST = withErrors("secretary/rooms/[id]/retry POST", POST_);
