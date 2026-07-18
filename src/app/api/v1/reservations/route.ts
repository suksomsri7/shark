// GET /api/v1/reservations?take= — การจองห้องพักทุกกิจการของร้าน เรียงจากเช็คอินล่าสุด (Wave6-D)
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
  // HotelReservation = unit-axis → วนทุกกิจการของร้าน (guard บังคับระบุ unitId ต่อ query)
  const units = await tenantDb({ tenantId: auth.tenantId }).businessUnit.findMany({ select: { id: true } });
  const perUnit = await Promise.all(
    units.map((u) =>
      tenantDb({ tenantId: auth.tenantId, unitId: u.id }).hotelReservation.findMany({
        orderBy: { checkInDate: "desc" },
        take,
        select: {
          id: true,
          unitId: true,
          code: true,
          guestName: true,
          guestPhone: true,
          checkInDate: true,
          checkOutDate: true,
          status: true,
          roomType: { select: { name: true } },
        },
      }),
    ),
  );
  const rows = perUnit
    .flat()
    .sort((a, b) => b.checkInDate.getTime() - a.checkInDate.getTime())
    .slice(0, take);
  const data = rows.map((r) => ({
    id: r.id,
    unitId: r.unitId,
    code: r.code,
    guestName: r.guestName,
    guestPhone: r.guestPhone,
    checkInDate: r.checkInDate,
    checkOutDate: r.checkOutDate,
    status: r.status,
    roomTypeName: r.roomType?.name ?? null,
  }));
  return apiJson({ data }, 200);
}
