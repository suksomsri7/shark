import { notFound } from "next/navigation";
import { requireUnit } from "@/lib/core/context";
import { evaluate } from "@/lib/core/rbac";
import { listBookings, listUnmatchedRoomCharges } from "@/lib/modules/hotel";
import { attachRoomChargeAction } from "@/lib/modules/hotel/actions";
import UnmatchedChargesList from "@/components/hotel/UnmatchedChargesList";

// SVC H.5 ▸ คิว "บิลลงห้องที่ยังไม่ผูกห้อง" (ใบสั่ง h.5 §0 §4) — หน่วย HOTEL เท่านั้น · สิทธิ์ hotel.folio.post หรือ hotel.booking.manage (ไม่มี ⇒ notFound)
//   แถว = บิล POS ที่จ่าย ROOM_CHARGE แล้วยังไม่มีรายการในบิลห้องใดอ้าง · ผูกกับแขกที่เข้าพักอยู่ (listBookings CHECKED_IN) ผ่าน attachRoomChargeAction
export default async function HotelUnmatchedChargesPage({ params }: { params: Promise<{ unitSlug: string }> }) {
  const { unitSlug } = await params;
  const { auth, unit } = await requireUnit(unitSlug);
  if (unit.type !== "HOTEL") notFound();
  const actor = {
    role: auth.active.role,
    unitAccess: Array.isArray(auth.active.unitAccess) ? (auth.active.unitAccess as string[]) : [],
    permissions: (auth.active.permissions ?? {}) as Record<string, unknown>,
    userId: auth.active.userId,
  };
  const ctx = { tenantId: auth.active.tenantId };
  const r = await listUnmatchedRoomCharges(actor, ctx, { unitId: unit.id });
  if (!r.ok) notFound();
  const canAttach = evaluate(actor, { module: "hotel", action: "hotel.folio.post", unitId: unit.id });
  const inHouse = canAttach ? await listBookings(actor, ctx, { unitId: unit.id, status: "CHECKED_IN", page: 1, pageSize: 200 }) : null;
  const guests = inHouse && inHouse.ok ? inHouse.rows.map((b) => ({ id: b.id, label: `${b.roomNumber ? `ห้อง ${b.roomNumber} · ` : ""}${b.code} · ${b.guestName}` })) : [];
  return <UnmatchedChargesList rows={r.rows} guests={guests} canAttach={canAttach} onAttach={attachRoomChargeAction.bind(null, unitSlug)} />;
}
