// POST /api/mobile/crm/scan-card/[proposalId]/accept[?systemId=] — "สร้าง lead" จากร่างนามบัตร (ใบ C3.7 · ภาพ 13 ค)
// → `calls.acceptLeadProposal` (ใบ C2.4: จอง PENDING→EXECUTED ก่อนลงมือ) → { contactId } ·
// ใบของระบบ CRM อื่น = 404 · กดซ้ำ/ถูกรับไปแล้ว = 409
import { requireMobile } from "@/lib/mobile/auth";
import { mobileCrmAuthError, runMobileCrm } from "@/lib/mobile/crm-routes";
import { calls } from "@/lib/modules/crm";

export async function POST(req: Request, { params }: { params: Promise<{ proposalId: string }> }): Promise<Response> {
  const g = await requireMobile(req);
  if (!g.ok) return mobileCrmAuthError(g);
  const { proposalId } = await params;
  return runMobileCrm(req, g, (s) => calls.acceptLeadProposal(s.ctx, s.actor, proposalId));
}
