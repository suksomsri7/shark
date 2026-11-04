// POST /api/mobile/secretary/support/cases/[id]/reply {body, attachments?} — ร้านตอบในเคส (`addShopMessage` · เคสปิดแล้วเปิดใหม่) · ไม่เห็น = 404
import { z } from "zod";
import { addShopMessage } from "@/lib/support/service";
import { gate, idParam, notFound, ok, readBody, withRateLimit, type RouteCtx } from "../../../../_shared";
import { AttachmentsSchema, visibleCase } from "../../../_case";

const Body = z.object({ body: z.string().trim().min(1).max(4000), attachments: AttachmentsSchema.optional() }).strict();

export async function POST(req: Request, ctx: RouteCtx) {
  const a = await gate(req, null);
  if (!a.ok) return a.res;
  const rl = await withRateLimit(a.c.userId, "support");
  if (rl) return rl;
  const b = await readBody(req, Body);
  if (!b.ok) return b.res;
  const id = await idParam(ctx, "id");
  const c = id ? await visibleCase(a.c, id) : null;
  if (!c) return notFound("ไม่พบเรื่องนี้");
  if (!(await addShopMessage({ tenantId: a.c.tenantId }, c.id, a.c.userId, b.v.body, b.v.attachments))) return notFound("ไม่พบเรื่องนี้");
  return ok({ ok: true });
}
