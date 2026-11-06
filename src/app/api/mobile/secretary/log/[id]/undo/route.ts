// POST /api/mobile/secretary/log/[id]/undo — ย้อนภายใน 24 ชม. (`undoAction` · 🔴 ไม่รับ `now` จากไคลเอนต์ — RESOLUTIONS §K) · ผล `{ok, note}` ไทยเสมอ
import { z } from "zod";
import { undoAction } from "@/lib/ai/secretary/actions";
import { wakeOutbox } from "@/lib/modules/crm";
import { gate, idParam, notFound, ok, readBody, thrown, withRateLimit, type RouteCtx, withErrors } from "../../../_shared";

async function POST_(req: Request, ctx: RouteCtx) {
  const a = await gate(req);
  if (!a.ok) return a.res;
  const rl = await withRateLimit(`${a.c.tenantId}:${a.c.userId}`, "undo");
  if (rl) return rl;
  const b = await readBody(req, z.object({}).strict());
  if (!b.ok) return b.res;
  const id = await idParam(ctx, "id");
  if (!id) return notFound("ไม่พบรายการ");
  try {
    const r = await undoAction(a.c.conv, id);
    if (r.ok) wakeOutbox();
    return ok(r);
  } catch (e) {
    return thrown(e, "log.undo");
  }
}

// SEC S3a.1-S2 ▸ R-Z20: exception ที่หลุด ⇒ {error, message} + logOps (ไม่มี 500 ดิบ) ◂
export const POST = withErrors("secretary/log/[id]/undo POST", POST_);
