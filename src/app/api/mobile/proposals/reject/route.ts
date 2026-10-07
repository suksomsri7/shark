// POST ยกเลิกข้อเสนอ (PENDING → REJECTED) (ledger/MOBILE_PLAN.md M-11)
import { requireMobile, mobileError } from "@/lib/mobile/auth";
import { rejectProposal } from "@/lib/ai/proposals";
import { aiBridges } from "@/lib/modules/crm";
import { mobileAiCtx } from "@/lib/mobile/guard";

export async function POST(req: Request) {
  const g = await requireMobile(req);
  if (!g.ok) return mobileError(g);
  let body: { id?: string };
  try {
    body = (await req.json()) as { id?: string };
  } catch {
    return Response.json({ error: "bad_json" }, { status: 400 });
  }
  const id = typeof body.id === "string" ? body.id : "";
  if (!id) return Response.json({ error: "id_required" }, { status: 400 });
  // CRM C3.4 ▸ ข้อเสนอของ CRM ยกเลิกได้เฉพาะคนที่ยืนยันได้ (addendum ข้อ 9) — ประตู CRM + สิทธิ์จาก Membership ของผู้ใช้แอป ◂
  const m = g.membership;
  const crm = await aiBridges.cancelProposalById(
    g.ctx.tenantId,
    { userId: g.user.id, role: m.role, unitAccess: Array.isArray(m.unitAccess) ? (m.unitAccess as string[]) : [], permissions: (m.permissions ?? {}) as Record<string, unknown> },
    id,
  );
  if (crm.handled) return Response.json({ ok: crm.ok, ...(crm.ok ? {} : { error: crm.note }) });
  const ok = await rejectProposal(mobileAiCtx(g), id); // CRM C5.5-G2: proposals of own rooms only
  return Response.json({ ok });
}
