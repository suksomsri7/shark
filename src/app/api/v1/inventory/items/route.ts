// GET /api/v1/inventory/items?take= — สินค้าคงคลังในระบบ INVENTORY ตัวแรกของร้าน (WO-0061)
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
  // ระบบคลัง (INVENTORY) ตัวแรกของร้าน — ไม่มีระบบ → คืนว่าง
  const inv = await db.appSystem.findFirst({ where: { type: "INVENTORY" }, orderBy: { createdAt: "asc" } });
  if (!inv) return apiJson({ data: [] }, 200);
  const rows = await tenantDb({ tenantId: auth.tenantId, systemId: inv.id }).invItem.findMany({
    where: { archivedAt: null },
    orderBy: { createdAt: "desc" },
    take,
  });
  const data = rows.map((i) => ({
    id: i.id,
    sku: i.sku,
    barcode: i.barcode,
    name: i.name,
    unitLabel: i.unitLabel,
    category: i.category,
    costSatang: i.costSatang,
    onHand: i.onHand,
    reorderPoint: i.reorderPoint,
    createdAt: i.createdAt,
  }));
  return apiJson({ data }, 200);
}
