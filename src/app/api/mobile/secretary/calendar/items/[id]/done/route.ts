// POST /api/mobile/secretary/calendar/items/[id]/done — ติ๊กเสร็จ (จอ 3 วงกลม/ปัดขวา · จอ 7 ปุ่ม "เสร็จแล้ว" ส่ง occ ของ push กลับ) · CAL1.6 · สัญญา §8 · ของคนอื่น = 404
import { z } from "zod";
import { markDone } from "@/lib/modules/calendar/items";
import { idParam, notFound, ok, readBody, type RouteCtx, withErrors } from "../../../../_shared";
import { calGate, calThrown, isoDate } from "../../../_cal";

const body = z.object({ occ: isoDate.optional() }).strict();

async function POST_(req: Request, ctx: RouteCtx) {
  const g = await calGate(req, "done", 60);
  if (!g.ok) return g.res;
  const id = await idParam(ctx, "id");
  if (!id) return notFound();
  const b = await readBody(req, body);
  if (!b.ok) return b.res;
  try {
    return ok({ item: await markDone(g.actor, id, { occ: b.v.occ }) });
  } catch (e) {
    return calThrown(e, "calendar/items/[id]/done POST");
  }
}

export const POST = withErrors("secretary/calendar/items/[id]/done POST", POST_);
