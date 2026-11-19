// GET /api/mobile/secretary/calendar/travel?day=YYYY-MM-DD — ข้อเสนอเผื่อเวลาเดินทางของวันนั้น (Q8 · สัญญา §16.4) · ของผู้ดูเท่านั้น
import { travelForDay } from "@/lib/modules/calendar/travel-svc";
import { fail, ok, withErrors } from "../../_shared";
import { calGate, calThrown, dayNo } from "../_cal";

async function GET_(req: Request) {
  const g = await calGate(req, "travel", 60);
  if (!g.ok) return g.res;
  const day = new URL(req.url).searchParams.get("day");
  if (dayNo(day) === null) return fail(400, "invalid", "วันไม่ถูกต้อง");
  try {
    const r = await travelForDay(g.actor, day!);
    return ok({ day, suggestions: r.suggestions });
  } catch (e) {
    return calThrown(e, "calendar/travel GET");
  }
}

export const GET = withErrors("secretary/calendar/travel GET", GET_);
