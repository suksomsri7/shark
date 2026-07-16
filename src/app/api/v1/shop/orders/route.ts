// GET /api/v1/shop/orders?take= — คำสั่งซื้อร้านค้าออนไลน์ทุกกิจการของร้าน เรียงใหม่ก่อน (WO-0061)
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
  // ShopOrder เป็น unit-scoped → ต้องวนทุกกิจการของร้าน (guard บังคับระบุ unitId ต่อ query)
  const units = await tenantDb({ tenantId: auth.tenantId }).businessUnit.findMany({ select: { id: true } });
  const perUnit = await Promise.all(
    units.map((u) =>
      tenantDb({ tenantId: auth.tenantId, unitId: u.id }).shopOrder.findMany({
        orderBy: { createdAt: "desc" },
      }),
    ),
  );
  const rows = perUnit
    .flat()
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, take);
  const data = rows.map((o) => ({
    id: o.id,
    unitId: o.unitId,
    code: o.code,
    status: o.status,
    customerName: o.customerName,
    customerPhone: o.customerPhone,
    totalSatang: o.totalSatang,
    paidAt: o.paidAt,
    cancelledAt: o.cancelledAt,
    createdAt: o.createdAt,
  }));
  return apiJson({ data }, 200);
}
