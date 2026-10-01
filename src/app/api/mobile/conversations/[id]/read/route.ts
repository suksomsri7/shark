// POST ทำเครื่องหมายว่าอ่านแล้ว (ledger/MOBILE_PLAN.md M-11)
import { requireMobile, mobileError } from "@/lib/mobile/auth";
import { mobileDenied, AI_CHAT } from "@/lib/mobile/guard";
import { markRead } from "@/lib/mobile/conversations";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await requireMobile(req);
  if (!g.ok) return mobileError(g);
  const denied = mobileDenied(g, AI_CHAT); // HOTFIX 2026-10-01: same key as the web door
  if (denied) return denied;
  const { id } = await params;
  const ok = await markRead(g.ctx, id);
  return Response.json({ ok });
}
