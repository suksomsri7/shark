// GET/PATCH/DELETE /api/mobile/secretary/calendar/items/[id] — รายละเอียด (+phone สำหรับ "โทรเลย") · แก้ · ยกเลิก (= CANCELLED · ซ้ำได้)
//   CAL1.6 · สัญญา §8 · ของคนอื่น/ร้านอื่น = 404 (M3 · ไม่บอกว่ามีอยู่)
import { z } from "zod";
import { cancelItem, getItem, updateItem } from "@/lib/modules/calendar/items";
import { idParam, notFound, ok, readBody, type RouteCtx, withErrors } from "../../../_shared";
import { calGate, calThrown, itemFields } from "../../_cal";

const patchBody = z
  .object({
    kind: itemFields.kind.optional(),
    title: itemFields.title.optional(),
    note: itemFields.note.optional(),
    startAt: itemFields.startAt.optional(),
    endAt: itemFields.endAt.optional(),
    allDay: itemFields.allDay.optional(),
    repeat: itemFields.repeat.optional(),
    repeatDays: itemFields.repeatDays.optional(),
    leadMinutes: itemFields.leadMinutes.optional(),
    link: itemFields.link.optional(),
  })
  .strict();

async function GET_(req: Request, ctx: RouteCtx) {
  const g = await calGate(req, "item", 60);
  if (!g.ok) return g.res;
  const id = await idParam(ctx, "id");
  if (!id) return notFound();
  try {
    return ok(await getItem(g.actor, id));
  } catch (e) {
    return calThrown(e, "calendar/items/[id] GET");
  }
}

async function PATCH_(req: Request, ctx: RouteCtx) {
  const g = await calGate(req, "items-write", 30);
  if (!g.ok) return g.res;
  const id = await idParam(ctx, "id");
  if (!id) return notFound();
  const b = await readBody(req, patchBody);
  if (!b.ok) return b.res;
  try {
    return ok({ item: await updateItem(g.actor, id, b.v) });
  } catch (e) {
    return calThrown(e, "calendar/items/[id] PATCH");
  }
}

async function DELETE_(req: Request, ctx: RouteCtx) {
  const g = await calGate(req, "items-write", 30);
  if (!g.ok) return g.res;
  const id = await idParam(ctx, "id");
  if (!id) return notFound();
  try {
    return ok(await cancelItem(g.actor, id));
  } catch (e) {
    return calThrown(e, "calendar/items/[id] DELETE");
  }
}

export const GET = withErrors("secretary/calendar/items/[id] GET", GET_);
export const PATCH = withErrors("secretary/calendar/items/[id] PATCH", PATCH_);
export const DELETE = withErrors("secretary/calendar/items/[id] DELETE", DELETE_);
