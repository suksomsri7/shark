// POST /api/mobile/secretary/calendar/items/[id]/snooze — เลื่อน (จอ 7 "เลื่อน 1 ชั่วโมง" / "เลื่อนไปพรุ่งนี้ 09:00" / เลือกเอง) · CAL1.6 · สัญญา §8 · ของคนอื่น = 404
import { z } from "zod";
import { snooze } from "@/lib/modules/calendar/items";
import { idParam, notFound, ok, readBody, type RouteCtx, withErrors } from "../../../../_shared";
import { calGate, calThrown, isoDate } from "../../../_cal";

const body = z.union([z.object({ preset: z.enum(["1h", "tomorrow9"]) }).strict(), z.object({ until: isoDate }).strict()]);

async function POST_(req: Request, ctx: RouteCtx) {
  const g = await calGate(req, "snooze", 60);
  if (!g.ok) return g.res;
  const id = await idParam(ctx, "id");
  if (!id) return notFound();
  const b = await readBody(req, body);
  if (!b.ok) return b.res;
  try {
    return ok({ item: await snooze(g.actor, id, b.v) });
  } catch (e) {
    return calThrown(e, "calendar/items/[id]/snooze POST");
  }
}

export const POST = withErrors("secretary/calendar/items/[id]/snooze POST", POST_);
