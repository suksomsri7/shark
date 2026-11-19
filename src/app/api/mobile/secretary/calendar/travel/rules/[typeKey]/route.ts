// PUT/DELETE /api/mobile/secretary/calendar/travel/rules/[typeKey] — แก้/ลบสิ่งที่เลขาจำ (จอ q8-3 · §16.4) · typeKey = encodeURIComponent
import { z } from "zod";
import { deleteTravelRule, putTravelRule } from "@/lib/modules/calendar/travel-svc";
import { fail, ok, readBody, type RouteCtx, withErrors } from "../../../../_shared";
import { calGate, calThrown } from "../../../_cal";

const body = z.object({ minutes: z.number().int(), label: z.string().max(120).nullable().optional() }).strict();

async function keyOf(ctx: RouteCtx<"typeKey">): Promise<string | null> {
  const raw = (await ctx.params).typeKey;
  try {
    const k = decodeURIComponent(String(raw ?? "")).trim();
    return k && k.length <= 200 ? k : null;
  } catch {
    return null;
  }
}

async function PUT_(req: Request, ctx: RouteCtx<"typeKey">) {
  const g = await calGate(req, "travel-write", 30);
  if (!g.ok) return g.res;
  const k = await keyOf(ctx);
  if (!k) return fail(400, "invalid", "ประเภทนัดไม่ถูกต้อง");
  const b = await readBody(req, body);
  if (!b.ok) return b.res;
  try {
    return ok({ rule: await putTravelRule(g.actor, k, b.v) });
  } catch (e) {
    return calThrown(e, "calendar/travel/rules PUT");
  }
}

async function DELETE_(req: Request, ctx: RouteCtx<"typeKey">) {
  const g = await calGate(req, "travel-write", 30);
  if (!g.ok) return g.res;
  const k = await keyOf(ctx);
  if (!k) return fail(400, "invalid", "ประเภทนัดไม่ถูกต้อง");
  try {
    return ok(await deleteTravelRule(g.actor, k));
  } catch (e) {
    return calThrown(e, "calendar/travel/rules DELETE");
  }
}

export const PUT = withErrors("secretary/calendar/travel/rules PUT", PUT_);
export const DELETE = withErrors("secretary/calendar/travel/rules DELETE", DELETE_);
