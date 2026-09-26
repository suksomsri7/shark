// GET /api/mobile/crm/deals/[id][?systemId=] — ดีล 1 ใบ (เปิดจากแจ้งเตือน) · ใบ C3.7
// มองไม่เห็น / คนละระบบ / คนละร้าน = 404 (ไม่ใช่ 403 — ไม่บอกว่ามีดีลนี้อยู่)
import { requireMobile } from "@/lib/mobile/auth";
import { mobileCrmAuthError, runMobileCrm } from "@/lib/mobile/crm-routes";
import { mobile as crmMobile } from "@/lib/modules/crm";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const g = await requireMobile(req);
  if (!g.ok) return mobileCrmAuthError(g);
  const { id } = await params;
  return runMobileCrm(req, g, async (s) => ({ deal: await crmMobile.dealDetail(s.ctx, s.actor, id) }));
}
