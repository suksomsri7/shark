// POST /api/mobile/secretary/calendar/travel/confirm — ผู้ใช้ยืนยันเผื่อเวลาเดินทาง (Q8 · §16.4) · เซิร์ฟเวอร์คำนวณคู่ใหม่ ไม่เชื่อเวลาจากแอป
import { z } from "zod";
import { confirmTravel } from "@/lib/modules/calendar/travel-svc";
import { ok, readBody, withErrors } from "../../../_shared";
import { calGate, calThrown } from "../../_cal";

const body = z.object({ pairKey: z.string().regex(/^[0-9a-f]{40}$/), day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), minutes: z.number().int(), remember: z.boolean() }).strict();

async function POST_(req: Request) {
  const g = await calGate(req, "travel-write", 30);
  if (!g.ok) return g.res;
  const b = await readBody(req, body);
  if (!b.ok) return b.res;
  try {
    return ok(await confirmTravel(g.actor, b.v));
  } catch (e) {
    return calThrown(e, "calendar/travel/confirm POST");
  }
}

export const POST = withErrors("secretary/calendar/travel/confirm POST", POST_);
