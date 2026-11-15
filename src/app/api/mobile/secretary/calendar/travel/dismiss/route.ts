// POST /api/mobile/secretary/calendar/travel/dismiss — "ข้าม"/"ไม่ต้อง" ของคู่นัดนี้ (Q8 · §16.4) · ซ้ำได้
import { z } from "zod";
import { dismissTravel } from "@/lib/modules/calendar/travel-svc";
import { ok, readBody, withErrors } from "../../../_shared";
import { calGate, calThrown } from "../../_cal";

const body = z.object({ pairKey: z.string().regex(/^[0-9a-f]{40}$/), day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }).strict();

async function POST_(req: Request) {
  const g = await calGate(req, "travel-write", 30);
  if (!g.ok) return g.res;
  const b = await readBody(req, body);
  if (!b.ok) return b.res;
  try {
    return ok(await dismissTravel(g.actor, b.v));
  } catch (e) {
    return calThrown(e, "calendar/travel/dismiss POST");
  }
}

export const POST = withErrors("secretary/calendar/travel/dismiss POST", POST_);
