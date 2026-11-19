// GET /api/mobile/secretary/calendar/travel/rules — สิ่งที่เลขาจำไว้ (จอ q8-3 · §16.4)
import { listTravelRules } from "@/lib/modules/calendar/travel-svc";
import { ok, withErrors } from "../../../_shared";
import { calGate, calThrown } from "../../_cal";

async function GET_(req: Request) {
  const g = await calGate(req, "travel", 60);
  if (!g.ok) return g.res;
  try {
    return ok({ rules: await listTravelRules(g.actor) });
  } catch (e) {
    return calThrown(e, "calendar/travel/rules GET");
  }
}

export const GET = withErrors("secretary/calendar/travel/rules GET", GET_);
