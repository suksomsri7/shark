// GET /api/v1/customers?take= — รายชื่อสมาชิกในระบบ MEMBER ตัวแรกของร้าน (WO-0061)
import { tenantDb } from "@/lib/core/db";
import { apiJson, authenticateApiRequest } from "@/lib/api-keys/route-auth";

function parseTake(url: string): number {
  const raw = Number.parseInt(new URL(url).searchParams.get("take") ?? "", 10);
  if (!Number.isFinite(raw) || raw <= 0) return 50;
  return Math.min(raw, 200);
}

export async function GET(req: Request): Promise<Response> {
  const auth = await authenticateApiRequest(req);
  if (!auth.ok) return auth.response;
  const take = parseTake(req.url);
  const db = tenantDb({ tenantId: auth.tenantId });
  // ระบบสมาชิก (MEMBER) ตัวแรกของร้าน — ไม่มีระบบ → คืนว่าง
  const member = await db.appSystem.findFirst({ where: { type: "MEMBER" }, orderBy: { createdAt: "asc" } });
  if (!member) return apiJson({ data: [] }, 200);
  const rows = await tenantDb({ tenantId: auth.tenantId, systemId: member.id }).customer.findMany({
    orderBy: { createdAt: "desc" },
    take,
  });
  const data = rows.map((c) => ({
    id: c.id,
    memberCode: c.memberCode,
    name: c.name,
    phone: c.phone,
    email: c.email,
    tier: c.tier,
    totalSpentSatang: c.totalSpentSatang,
    visitCount: c.visitCount,
    createdAt: c.createdAt,
  }));
  return apiJson({ data }, 200);
}
