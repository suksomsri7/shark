// GET /api/v1/appointments?take= — นัดหมายทุกกิจการของร้าน เรียงจากใหม่ไปเก่า (Wave6-D)
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
  // Appointment = unit-axis → วนทุกกิจการของร้าน (guard บังคับระบุ unitId ต่อ query)
  const units = await tenantDb({ tenantId: auth.tenantId }).businessUnit.findMany({ select: { id: true } });
  const perUnit = await Promise.all(
    units.map((u) =>
      tenantDb({ tenantId: auth.tenantId, unitId: u.id }).appointment.findMany({
        orderBy: { startAt: "desc" },
        take,
        select: {
          id: true,
          unitId: true,
          customerName: true,
          customerPhone: true,
          startAt: true,
          endAt: true,
          status: true,
          service: { select: { name: true } },
        },
      }),
    ),
  );
  const rows = perUnit
    .flat()
    .sort((a, b) => b.startAt.getTime() - a.startAt.getTime())
    .slice(0, take);
  const data = rows.map((a) => ({
    id: a.id,
    unitId: a.unitId,
    customerName: a.customerName,
    customerPhone: a.customerPhone,
    startAt: a.startAt,
    endAt: a.endAt,
    status: a.status,
    serviceName: a.service?.name ?? null,
  }));
  return apiJson({ data }, 200);
}
