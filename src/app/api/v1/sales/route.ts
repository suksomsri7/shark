// GET /api/v1/sales?take= — รายการขาย POS (PAID) ล่าสุดของร้าน ทุกระบบ POS (Wave6-C)
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
  // PosSale = system-axis → enumerate ระบบ POS ทุกตัวของร้านแล้ว query ต่อระบบ (scope guard)
  const posSystems = await tenantDb({ tenantId: auth.tenantId }).appSystem.findMany({
    where: { type: "POS" },
    select: { id: true },
  });
  if (posSystems.length === 0) return apiJson({ data: [] }, 200);

  const sel = {
    id: true,
    receiptNo: true,
    grandTotalSatang: true,
    status: true,
    memberId: true,
    createdAt: true,
  } as const;
  const all = (
    await Promise.all(
      posSystems.map((s) =>
        tenantDb({ tenantId: auth.tenantId, systemId: s.id }).posSale.findMany({
          where: { status: "PAID" },
          orderBy: { createdAt: "desc" },
          take,
          select: sel,
        }),
      ),
    )
  ).flat();
  all.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  return apiJson({ data: all.slice(0, take) }, 200);
}
