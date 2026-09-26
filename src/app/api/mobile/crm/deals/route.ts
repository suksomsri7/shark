// GET /api/mobile/crm/deals[?systemId=] — "ดีลของฉัน" ของแอปพนักงาน (ใบ C3.7 · ภาพ 13 ก)
// Bearer + X-Tenant-Id (requireMobile) → ระบบ CRM v2 ของร้าน → ดีล OPEN ของผู้ใช้คนนี้ภายในขอบเขตที่มองเห็น + ชิปขั้น
// ผล: { items: [{ id, title, valueSatang, stageId, stageName, stalledDays, nextActivityAt, company, contact{ id, name, phone } }], stages }
import { requireMobile } from "@/lib/mobile/auth";
import { mobileCrmAuthError, runMobileCrm } from "@/lib/mobile/crm-routes";
import { mobile as crmMobile } from "@/lib/modules/crm";

export async function GET(req: Request): Promise<Response> {
  const g = await requireMobile(req);
  if (!g.ok) return mobileCrmAuthError(g);
  return runMobileCrm(req, g, (s) => crmMobile.myDeals(s.ctx, s.actor));
}
