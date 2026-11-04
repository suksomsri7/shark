// POST /api/mobile/secretary/proposals/[id]/edit {patch} — แก้ก่อนอนุมัติ (S1.10 `editProposal` · Q9: เฉพาะ kind ของทะเบียน op · ตรวจด้วย schema ของ op)
import { z } from "zod";
import { editProposal } from "@/lib/ai/secretary/teach";
import { fail, gate, idParam, notFound, ok, readBody, withRateLimit, type RouteCtx } from "../../../_shared";

const Body = z.object({ patch: z.record(z.string().max(80), z.unknown()) }).strict();

export async function POST(req: Request, ctx: RouteCtx) {
  const a = await gate(req);
  if (!a.ok) return a.res;
  const rl = await withRateLimit(a.c.userId, "edit");
  if (rl) return rl;
  const b = await readBody(req, Body);
  if (!b.ok) return b.res;
  const id = await idParam(ctx, "id");
  if (!id) return notFound("ไม่พบข้อเสนอนี้");
  const r = await editProposal(a.c.conv, id, b.v.patch as Record<string, unknown>);
  if (r.ok) {
    const input = r.payload && typeof r.payload === "object" ? (r.payload as Record<string, unknown>).input ?? null : null;
    return ok({ ok: true, input });
  }
  if (r.error === "not_found") return notFound(r.message);
  if (r.error === "not_pending") return fail(409, "not_pending", r.message);
  return fail(400, r.error, r.message); // not_editable · invalid
}
