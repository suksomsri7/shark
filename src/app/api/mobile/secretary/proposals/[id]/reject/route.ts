// POST /api/mobile/secretary/proposals/[id]/reject {note?, remember?} — ตีกลับ
//   `rejectFor` (S3a.1-S2 R-Z20): มี note = ตีกลับพร้อมเหตุผล (remember true/"RULE" = จดเป็นกติกา) · ประตู CRM ยกเลิกด้วยสิทธิ์คนกดก่อน
import { z } from "zod";
import { rejectFor } from "@/lib/ai/secretary/teach";
import { fail, gate, idParam, notFound, ok, readBody, withRateLimit, type RouteCtx, withErrors } from "../../../_shared";

const Body = z.object({ note: z.string().max(2000).optional(), remember: z.union([z.boolean(), z.enum(["JOB", "RULE"])]).optional() }).strict();

async function POST_(req: Request, ctx: RouteCtx) {
  const a = await gate(req);
  if (!a.ok) return a.res;
  const rl = await withRateLimit(`${a.c.tenantId}:${a.c.userId}`, "reject");
  if (rl) return rl;
  const b = await readBody(req, Body);
  if (!b.ok) return b.res;
  const id = await idParam(ctx, "id");
  if (!id) return notFound("ไม่พบข้อเสนอนี้");
  // SEC S3a.1-S2 ▸ R-Z20: ทางเดียว (rejectFor) — ประตู CRM ยกเลิกด้วยสิทธิ์คนกดแล้วบันทึกเหตุผล · ไม่มีสิทธิ์ 403 · ไม่ PENDING 409 ทั้งมี/ไม่มี note ◂
  const note = (b.v.note ?? "").trim();
  const remember = b.v.remember === true || b.v.remember === "RULE" ? "RULE" : "JOB";
  const r = await rejectFor(a.c.conv, id, { note, remember });
  if (r.ok) return ok({ ok: true, ...(r.memoryId ? { memoryId: r.memoryId } : {}) });
  if (r.error === "not_found") return notFound(r.message);
  if (r.error === "not_pending") return fail(409, "not_pending", r.message);
  if (r.error === "forbidden") return fail(403, "forbidden", r.message);
  return fail(400, r.error, r.message); // empty · pii
}

// SEC S3a.1-S2 ▸ R-Z20: exception ที่หลุด ⇒ {error, message} + logOps (ไม่มี 500 ดิบ) ◂
export const POST = withErrors("secretary/proposals/[id]/reject POST", POST_);
