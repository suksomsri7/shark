// POST /api/mobile/secretary/memories/[id]/confirm — ยืนยันความจำของร้าน (OWNER · `confirmMemory`) · คนอื่น 403 · ไม่พบ/ไม่รอยืนยัน 404
import { z } from "zod";
import { confirmMemory } from "@/lib/ai/secretary/teach";
import { forbidden, gate, idParam, notFound, ok, readBody, withRateLimit, type RouteCtx, withErrors } from "../../../_shared";

async function POST_(req: Request, ctx: RouteCtx) {
  const a = await gate(req);
  if (!a.ok) return a.res;
  const rl = await withRateLimit(`${a.c.tenantId}:${a.c.userId}`, "memories");
  if (rl) return rl;
  const b = await readBody(req, z.object({}).strict());
  if (!b.ok) return b.res;
  if (a.c.m.role !== "OWNER") return forbidden("ยืนยันความจำของร้านได้เฉพาะเจ้าของกิจการ");
  const id = await idParam(ctx, "id");
  return id && (await confirmMemory(a.c.conv, id)) ? ok({ ok: true }) : notFound("ไม่พบความจำที่รอยืนยันนี้");
}

// SEC S3a.1-S2 ▸ R-Z20: exception ที่หลุด ⇒ {error, message} + logOps (ไม่มี 500 ดิบ) ◂
export const POST = withErrors("secretary/memories/[id]/confirm POST", POST_);
