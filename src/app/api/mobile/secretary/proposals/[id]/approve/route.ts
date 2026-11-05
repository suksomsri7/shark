// POST /api/mobile/secretary/proposals/[id]/approve {confirm2x?} — อนุมัติ = `executeProposal` (ด่านมองเห็น → assertCan ของคนกด → ระดับต่อระบบ
//   → `approvalGate` ห้องเลขา OWNER/MANAGER (R-K4) → ยืนยัน 2 ชั้นของ DESTRUCTIVE) · ผลเป็นข้อความไทยเสมอ `{ok, note, needsSecondConfirm?, why?}` (รูปเดียวกับ proposals/confirm เดิม)
import { z } from "zod";
import { executeProposal } from "@/lib/ai/proposals";
import { wakeOutbox } from "@/lib/modules/crm";
import { gate, idParam, notFound, ok, readBody, thrown, withRateLimit, type RouteCtx } from "../../../_shared";

const Body = z.object({ confirm2x: z.boolean().optional() }).strict();

export async function POST(req: Request, ctx: RouteCtx) {
  const a = await gate(req);
  if (!a.ok) return a.res;
  const rl = await withRateLimit(`${a.c.tenantId}:${a.c.userId}`, "approve");
  if (rl) return rl;
  const b = await readBody(req, Body);
  if (!b.ok) return b.res;
  const id = await idParam(ctx, "id");
  if (!id) return notFound("ไม่พบข้อเสนอนี้");
  try {
    const res = await executeProposal(a.c.m, { tenantId: a.c.tenantId }, id, { confirm2x: b.v.confirm2x === true, userId: a.c.userId });
    if (res.ok) wakeOutbox();
    return ok(res);
  } catch (e) {
    return thrown(e, "proposals.approve");
  }
}
