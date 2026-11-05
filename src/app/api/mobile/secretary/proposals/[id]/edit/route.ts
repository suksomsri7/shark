// POST /api/mobile/secretary/proposals/[id]/edit {patch} — แก้ก่อนอนุมัติ (S1.10 `editProposal` · Q9: เฉพาะ kind ของทะเบียน op · ตรวจด้วย schema ของ op)
//   R-S1.14i: เฉพาะผู้ที่อนุมัติข้อเสนอนี้ได้ (dry-run `views.proposalApprovableBy` = ด่านเดียวกับ approve) · สรุปต่อท้าย "(แก้แล้ว: ช่อง=ค่า …)" · คืน summary ใหม่
import { z } from "zod";
import { editProposal } from "@/lib/ai/secretary/teach";
import { proposalApprovableBy } from "@/lib/ai/secretary/views";
import { fail, forbidden, gate, idParam, notFound, ok, readBody, withRateLimit, type RouteCtx } from "../../../_shared";

const Body = z.object({ patch: z.record(z.string().max(80), z.unknown()) }).strict();

export async function POST(req: Request, ctx: RouteCtx) {
  const a = await gate(req);
  if (!a.ok) return a.res;
  const rl = await withRateLimit(`${a.c.tenantId}:${a.c.userId}`, "edit");
  if (rl) return rl;
  const b = await readBody(req, Body);
  if (!b.ok) return b.res;
  const id = await idParam(ctx, "id");
  if (!id) return notFound("ไม่พบข้อเสนอนี้");
  const can = await proposalApprovableBy(a.c, id);
  if (can === null) return notFound("ไม่พบข้อเสนอนี้ หรือถูกดำเนินการไปแล้ว");
  if (!can) return forbidden("แก้ก่อนอนุมัติได้เฉพาะผู้ที่อนุมัติรายการนี้ได้ (เจ้าของหรือผู้จัดการที่มีสิทธิ์)");
  const r = await editProposal(a.c.conv, id, b.v.patch as Record<string, unknown>);
  if (r.ok) {
    const input = r.payload && typeof r.payload === "object" ? (r.payload as Record<string, unknown>).input ?? null : null;
    return ok({ ok: true, input, summary: r.summary });
  }
  if (r.error === "not_found") return notFound(r.message);
  if (r.error === "not_pending") return fail(409, "not_pending", r.message);
  return fail(400, r.error, r.message); // not_editable · invalid
}
