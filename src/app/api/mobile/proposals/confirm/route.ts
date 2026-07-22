// POST ยืนยันข้อเสนอ → ลงมือทำจริง (executeProposal เดิม · ตรวจสิทธิ์คนกดข้างใน)
// DESTRUCTIVE ไม่ส่ง confirm2x → คืน needsSecondConfirm (server บังคับเสมอ) (ledger/MOBILE_PLAN.md M-11)
import { requireMobile, mobileError } from "@/lib/mobile/auth";
import { executeProposal } from "@/lib/ai/proposals";

export async function POST(req: Request) {
  const g = await requireMobile(req);
  if (!g.ok) return mobileError(g);
  let body: { id?: string; confirm2x?: boolean };
  try {
    body = (await req.json()) as { id?: string; confirm2x?: boolean };
  } catch {
    return Response.json({ error: "bad_json" }, { status: 400 });
  }
  const id = typeof body.id === "string" ? body.id : "";
  if (!id) return Response.json({ error: "id_required" }, { status: 400 });
  // MembershipCtx ของคนกด (cast Json → type ให้ตรง rbac)
  const m = {
    role: g.membership.role,
    unitAccess: g.membership.unitAccess as string[],
    permissions: g.membership.permissions as Record<string, unknown>,
  };
  const res = await executeProposal(m, g.ctx, id, { confirm2x: body.confirm2x === true });
  return Response.json(res);
}
