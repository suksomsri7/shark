// POST /api/mobile/secretary/calendar/items/[id]/confirm — ยืนยันเตือนประจำจากแชท (DRAFT → OPEN · จอ 5 "ใช่ ตั้งเลย" · หมดอายุ 24 ชม. = 410) · CAL1.6 · สัญญา §8 · ของคนอื่น = 404
import { z } from "zod";
import { confirmItem } from "@/lib/modules/calendar/items";
import { idParam, notFound, ok, readBody, type RouteCtx, withErrors } from "../../../../_shared";
import { calGate, calThrown } from "../../../_cal";

const body = z.object({}).strict();

async function POST_(req: Request, ctx: RouteCtx) {
  const g = await calGate(req, "confirm", 30);
  if (!g.ok) return g.res;
  const id = await idParam(ctx, "id");
  if (!id) return notFound();
  const b = await readBody(req, body);
  if (!b.ok) return b.res;
  try {
    return ok({ item: await confirmItem(g.actor, id) });
  } catch (e) {
    return calThrown(e, "calendar/items/[id]/confirm POST");
  }
}

export const POST = withErrors("secretary/calendar/items/[id]/confirm POST", POST_);
