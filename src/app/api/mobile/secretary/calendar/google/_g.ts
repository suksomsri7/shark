// _g.ts — ตัวช่วยร่วมของ `calendar/google/*` (CAL1.8 · สัญญา §8 · §10) — ด่าน = userGate (ไม่ต้องมีร้าน · CalLink ต่อคน)
//   GoogleError → `{ error: code, message }` · อื่น ๆ → thrown() ของเลขา
import { GoogleError } from "@/lib/modules/calendar/google";
import { fail, thrown, userGate, withRateLimit } from "../../_shared";

export async function gGate(req: Request, route: string, perMinute: number): Promise<{ ok: true; userId: string } | { ok: false; res: Response }> {
  const u = await userGate(req);
  if (!u.ok) return u;
  const rl = await withRateLimit(u.userId, `cal-google-${route}`, perMinute);
  if (rl) return { ok: false, res: rl };
  return u;
}

export async function gThrown(e: unknown, where: string): Promise<Response> {
  if (e instanceof GoogleError) return fail(e.status, e.code, e.message);
  return thrown(e, where);
}
