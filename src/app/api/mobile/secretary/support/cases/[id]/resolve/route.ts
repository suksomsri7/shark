// POST /api/mobile/secretary/support/cases/[id]/resolve — ร้านกด "แก้แล้ว" (`setResolvedByShop` · เฉพาะเรื่องที่ผู้ใช้เห็น)
import { z } from "zod";
import { setResolvedByShop } from "@/lib/support/service";
import { gate, idParam, notFound, ok, readBody, withRateLimit, type RouteCtx } from "../../../../_shared";

export async function POST(req: Request, ctx: RouteCtx) {
  const a = await gate(req, null);
  if (!a.ok) return a.res;
  const rl = await withRateLimit(a.c.userId, "support");
  if (rl) return rl;
  const b = await readBody(req, z.object({}).strict());
  if (!b.ok) return b.res;
  const id = await idParam(ctx, "id");
  return id && (await setResolvedByShop({ tenantId: a.c.tenantId }, a.c.userId, a.c.m.role, id)) ? ok({ ok: true }) : notFound("ไม่พบเรื่องนี้");
}
