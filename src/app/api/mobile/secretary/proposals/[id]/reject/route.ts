// POST /api/mobile/secretary/proposals/[id]/reject {note?, remember?} — ตีกลับ
//   มี note ⇒ `rejectWithNote` (S1.10 · remember true/"RULE" = จดเป็นกติกา · อื่น = "JOB" ไม่จด) · ไม่มี note ⇒ ทางเดิม (ประตู CRM ก่อน แล้ว `rejectProposal`)
import { z } from "zod";
import { rejectProposal } from "@/lib/ai/proposals";
import { rejectWithNote } from "@/lib/ai/secretary/teach";
import { aiBridges } from "@/lib/modules/crm";
import { fail, gate, idParam, notFound, ok, readBody, withRateLimit, type RouteCtx } from "../../../_shared";

const Body = z.object({ note: z.string().max(2000).optional(), remember: z.union([z.boolean(), z.enum(["JOB", "RULE"])]).optional() }).strict();

export async function POST(req: Request, ctx: RouteCtx) {
  const a = await gate(req);
  if (!a.ok) return a.res;
  const rl = await withRateLimit(`${a.c.tenantId}:${a.c.userId}`, "reject");
  if (rl) return rl;
  const b = await readBody(req, Body);
  if (!b.ok) return b.res;
  const id = await idParam(ctx, "id");
  if (!id) return notFound("ไม่พบข้อเสนอนี้");
  const note = (b.v.note ?? "").trim();
  if (note) {
    const remember = b.v.remember === true || b.v.remember === "RULE" ? "RULE" : "JOB";
    const r = await rejectWithNote(a.c.conv, id, { note, remember });
    if (r.ok) return ok({ ok: true, ...(r.memoryId ? { memoryId: r.memoryId } : {}) });
    if (r.error === "not_found") return notFound(r.message);
    if (r.error === "not_pending") return fail(409, "not_pending", r.message);
    return fail(400, r.error, r.message); // empty · pii
  }
  // ประตู CRM: ข้อเสนอของ CRM ยกเลิกได้เฉพาะคนที่ยืนยันได้ (ทางเดียวกับ /api/mobile/proposals/reject)
  const crm = await aiBridges.cancelProposalById(a.c.tenantId, { userId: a.c.userId, role: a.c.m.role, unitAccess: a.c.m.unitAccess, permissions: a.c.m.permissions }, id);
  if (crm.handled) return crm.ok ? ok({ ok: true }) : fail(409, "not_pending", crm.note);
  if (await rejectProposal(a.c.conv, id)) return ok({ ok: true });
  return notFound("ไม่พบข้อเสนอนี้ หรือถูกดำเนินการไปแล้ว");
}
