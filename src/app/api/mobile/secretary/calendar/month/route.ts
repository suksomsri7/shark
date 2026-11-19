// GET /api/mobile/secretary/calendar/month?ym=YYYY-MM — จุดสีต่อวัน (จอ 3 แถบสัปดาห์ · จอ 4) · CAL1.6 · สัญญา §8
import { monthDots } from "@/lib/modules/calendar/agenda";
import { fail, ok, withErrors } from "../../_shared";
import { calGate, calThrown } from "../_cal";

async function GET_(req: Request) {
  const g = await calGate(req, "month", 60);
  if (!g.ok) return g.res;
  const ym = new URL(req.url).searchParams.get("ym") ?? "";
  const m = /^(\d{4})-(\d{2})$/.exec(ym);
  if (!m || +m[2]! < 1 || +m[2]! > 12 || +m[1]! < 2000 || +m[1]! > 2100) return fail(400, "invalid", "เดือนไม่ถูกต้อง");
  try {
    return ok({ ym, days: await monthDots(g.actor, ym) });
  } catch (e) {
    return calThrown(e, "calendar/month GET");
  }
}

export const GET = withErrors("secretary/calendar/month GET", GET_);
