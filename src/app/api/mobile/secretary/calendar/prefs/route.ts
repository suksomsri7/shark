// GET/PUT /api/mobile/secretary/calendar/prefs — ตั้งค่าปฏิทิน (จอ 8) · CAL1.6 · สัญญา §8 · M2 ค่าเริ่ม (เช้าเปิด 08:00 · เย็นปิด 19:00)
import { z } from "zod";
import { getPrefs, setPrefs } from "@/lib/modules/calendar/prefs";
import { ok, readBody, withErrors } from "../../_shared";
import { calGate, calThrown } from "../_cal";

const slot = z.object({ on: z.boolean().optional(), minute: z.number().int().optional() }).strict();
const body = z
  .object({
    morning: slot.optional(),
    evening: slot.optional(),
    travelMinutes: z.number().int().optional(),
    sources: z.record(z.string().max(20), z.boolean()).optional(),
  })
  .strict();

async function GET_(req: Request) {
  const g = await calGate(req, "prefs", 60);
  if (!g.ok) return g.res;
  try {
    return ok(await getPrefs(g.actor));
  } catch (e) {
    return calThrown(e, "calendar/prefs GET");
  }
}

async function PUT_(req: Request) {
  const g = await calGate(req, "prefs-write", 30);
  if (!g.ok) return g.res;
  const b = await readBody(req, body);
  if (!b.ok) return b.res;
  try {
    return ok(await setPrefs(g.actor, b.v));
  } catch (e) {
    return calThrown(e, "calendar/prefs PUT");
  }
}

export const GET = withErrors("secretary/calendar/prefs GET", GET_);
export const PUT = withErrors("secretary/calendar/prefs PUT", PUT_);
