// POST /api/mobile/secretary/memories/[id]/confirm — ยืนยันความจำของร้าน (OWNER · `confirmMemory`) · คนอื่น 403 · ไม่พบ/ไม่รอยืนยัน 404
import { z } from "zod";
import { confirmMemory } from "@/lib/ai/secretary/teach";
import { forbidden, gate, idParam, notFound, ok, readBody, withRateLimit, type RouteCtx } from "../../../_shared";

export async function POST(req: Request, ctx: RouteCtx) {
  const a = await gate(req);
  if (!a.ok) return a.res;
  const rl = await withRateLimit(a.c.userId, "memories");
  if (rl) return rl;
  const b = await readBody(req, z.object({}).strict());
  if (!b.ok) return b.res;
  if (a.c.m.role !== "OWNER") return forbidden("ยืนยันความจำของร้านได้เฉพาะเจ้าของกิจการ");
  const id = await idParam(ctx, "id");
  return id && (await confirmMemory(a.c.conv, id)) ? ok({ ok: true }) : notFound("ไม่พบความจำที่รอยืนยันนี้");
}
