// POST /api/mobile/crm/scan-card/[proposalId]/reject[?systemId=] — "ทิ้งร่าง" นามบัตร (ใบ C3.7 · รีวิว · C2.4 F8)
// → `calls.rejectLeadProposal` (ใบ C2.4: PENDING→REJECTED อะตอมมิก + ล้างชื่อ/เบอร์/อีเมลออกจากแถวข้อเสนอ) → { ok: true } ·
// ใบของระบบ CRM อื่น = 404 · ถูกจัดการไปแล้ว = 409
import { requireMobile } from "@/lib/mobile/auth";
import { mobileCrmAuthError, runMobileCrm } from "@/lib/mobile/crm-routes";
import { calls } from "@/lib/modules/crm";

export async function POST(req: Request, { params }: { params: Promise<{ proposalId: string }> }): Promise<Response> {
  const g = await requireMobile(req);
  if (!g.ok) return mobileCrmAuthError(g);
  const { proposalId } = await params;
  return runMobileCrm(req, g, (s) => calls.rejectLeadProposal(s.ctx, s.actor, proposalId));
}
