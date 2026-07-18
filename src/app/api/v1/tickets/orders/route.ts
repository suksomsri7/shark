// GET /api/v1/tickets/orders?take= — คำสั่งซื้อตั๋วทุกกิจการของร้าน เรียงจากใหม่ไปเก่า (Wave6-D)
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
  // TicketOrder = unit-axis → วนทุกกิจการของร้าน (guard บังคับระบุ unitId ต่อ query)
  const units = await tenantDb({ tenantId: auth.tenantId }).businessUnit.findMany({ select: { id: true } });
  const perUnit = await Promise.all(
    units.map((u) =>
      tenantDb({ tenantId: auth.tenantId, unitId: u.id }).ticketOrder.findMany({
        orderBy: { createdAt: "desc" },
        take,
        select: {
          id: true,
          unitId: true,
          orderNo: true,
          buyerName: true,
          buyerPhone: true,
          status: true,
          totalSatang: true,
          paidAt: true,
          createdAt: true,
        },
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
    orderNo: o.orderNo,
    buyerName: o.buyerName,
    buyerPhone: o.buyerPhone,
    status: o.status,
    totalSatang: o.totalSatang,
    paidAt: o.paidAt,
    createdAt: o.createdAt,
  }));
  return apiJson({ data }, 200);
}
