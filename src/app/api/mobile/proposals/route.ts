// GET ข้อเสนอที่รอยืนยัน (PENDING) ของบทสนทนา — การ์ดยืนยันใต้แชท (ledger/MOBILE_PLAN.md M-11)
import { requireMobile, mobileError } from "@/lib/mobile/auth";
import { listPendingProposals } from "@/lib/ai/proposals";

export async function GET(req: Request) {
  const g = await requireMobile(req);
  if (!g.ok) return mobileError(g);
  const conversationId = new URL(req.url).searchParams.get("conversationId") ?? "";
  if (!conversationId) return Response.json({ proposals: [] });
  const rows = await listPendingProposals(g.ctx, conversationId);
  const proposals = rows.map((p) => ({
    id: p.id,
    kind: p.kind,
    risk: p.risk,
    summary: p.summary,
    createdAt: p.createdAt,
  }));
  return Response.json({ proposals });
}
