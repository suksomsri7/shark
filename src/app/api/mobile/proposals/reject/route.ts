// POST ยกเลิกข้อเสนอ (PENDING → REJECTED) (ledger/MOBILE_PLAN.md M-11)
import { requireMobile, mobileError } from "@/lib/mobile/auth";
import { rejectProposal } from "@/lib/ai/proposals";

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
  const ok = await rejectProposal(g.ctx, id);
  return Response.json({ ok });
}
