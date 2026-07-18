// GET /api/v1/queue/tickets?date=&take= — บัตรคิวตามวัน (ค่าเริ่มต้น=วันนี้ตามเวลาไทย) ทุกกิจการ (Wave6-D)
import { tenantDb } from "@/lib/core/db";
import { apiJson, authenticateApiRequest } from "@/lib/api-keys/route-auth";
import { businessDateOf } from "@/lib/modules/queue/service";

function parseTake(url: string): number {
  const raw = Number.parseInt(new URL(url).searchParams.get("take") ?? "", 10);
  if (!Number.isFinite(raw) || raw <= 0) return 50;
  return Math.min(raw, 200);
}

export async function GET(req: Request): Promise<Response> {
  const auth = await authenticateApiRequest(req);
  if (!auth.ok) return auth.response;
  const take = parseTake(req.url);
  // date=YYYY-MM-DD (business date ตามโซนร้าน) — ไม่ส่ง → วันนี้
  const dateParam = new URL(req.url).searchParams.get("date")?.trim();
  const businessDate = dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : businessDateOf();
  // QueueTicket = unit-axis → วนทุกกิจการของร้าน (guard บังคับระบุ unitId ต่อ query)
  const units = await tenantDb({ tenantId: auth.tenantId }).businessUnit.findMany({ select: { id: true } });
  const perUnit = await Promise.all(
    units.map((u) =>
      tenantDb({ tenantId: auth.tenantId, unitId: u.id }).queueTicket.findMany({
        where: { businessDate },
        orderBy: { createdAt: "desc" },
        take,
        select: {
          id: true,
          unitId: true,
          number: true,
          status: true,
          businessDate: true,
          createdAt: true,
        },
      }),
    ),
  );
  const rows = perUnit
    .flat()
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, take);
  const data = rows.map((t) => ({
    id: t.id,
    unitId: t.unitId,
    number: t.number,
    status: t.status,
    businessDate: t.businessDate,
    issuedAt: t.createdAt, // QueueTicket ไม่มีฟิลด์ issuedAt → ใช้ createdAt (เวลาออกบัตร)
  }));
  return apiJson({ data, date: businessDate }, 200);
}
