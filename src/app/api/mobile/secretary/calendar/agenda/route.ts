// GET /api/mobile/secretary/calendar/agenda?from=YYYY-MM-DD&to=YYYY-MM-DD — รายการวัน (จอ 3 · 4 · 10) · CAL1.6 · สัญญา §8 · §4.1
//   ช่วง ≤ 42 วัน (`to` ไม่ส่ง = from) · ตัวรวม = modules/calendar/agenda.ts (CAL1.3 เลน b)
import { agendaFor } from "@/lib/modules/calendar/agenda";
import { dayNoToYmd } from "@/lib/modules/calendar/next-fire";
import { fail, ok, withErrors } from "../../_shared";
import { calGate, calThrown, dayNo } from "../_cal";

async function GET_(req: Request) {
  const g = await calGate(req, "agenda", 60);
  if (!g.ok) return g.res;
  const q = new URL(req.url).searchParams;
  const f = dayNo(q.get("from"));
  const t = q.get("to") ? dayNo(q.get("to")) : f;
  if (f === null || t === null || t < f || t - f > 41) return fail(400, "invalid", "ช่วงวันไม่ถูกต้อง (ไม่เกิน 42 วัน)");
  try {
    return ok(await agendaFor(g.actor, { from: dayNoToYmd(f), to: dayNoToYmd(t) }));
  } catch (e) {
    return calThrown(e, "calendar/agenda GET");
  }
}

export const GET = withErrors("secretary/calendar/agenda GET", GET_);
