// POST /api/mobile/secretary/calendar/google/sync — ซิงก์ทันที (ดึงลงรีเฟรช จอ 3 · จอ 9) · CAL1.8 · สัญญา §8 · §10.2
//   1 ครั้ง/2 นาที/ผู้ใช้ (เกิน = 429 "เพิ่งซิงก์ไป รออีกสักครู่") · 404 ไม่เชื่อม · 409 needs_reconnect
import { z } from "zod";
import { checkRateLimitDb } from "@/lib/core/rate-limit-db";
import { syncGoogle } from "@/lib/modules/calendar/google";
import { ok, readBody, userGate, withErrors } from "../../../_shared";
import { gThrown } from "../_g";

const body = z.object({}).strict();

async function POST_(req: Request) {
  const u = await userGate(req);
  if (!u.ok) return u.res;
  const b = await readBody(req, body);
  if (!b.ok) return b.res;
  const rl = await checkRateLimitDb(`sec:cal-google-sync:${u.userId}`, { limit: 1, windowMs: 120_000 });
  if (!rl.ok) {
    const retryAfterSec = rl.retryAfterSec ?? 120;
    return Response.json({ error: "rate_limited", message: "เพิ่งซิงก์ไป รออีกสักครู่", retryAfterSec }, { status: 429, headers: { "Retry-After": String(retryAfterSec) } });
  }
  try {
    return ok(await syncGoogle(u.userId, { reason: "manual" }));
  } catch (e) {
    return gThrown(e, "calendar/google/sync POST");
  }
}

export const POST = withErrors("secretary/calendar/google/sync POST", POST_);
