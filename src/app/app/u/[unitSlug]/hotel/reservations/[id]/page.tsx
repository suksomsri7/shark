import { notFound } from "next/navigation";
import { requireUnit } from "@/lib/core/context";
import { evaluate } from "@/lib/core/rbac";
import { assignableRoomsFor, getBooking } from "@/lib/modules/hotel";
import {
  assignRoomAction,
  cancelBookingAction,
  confirmBookingAction,
  extendBookingAction,
  markNoShowAction,
  quoteExtendBookingAction,
  shortenBookingAction,
  takeBookingDepositAction,
  undoNoShowAction,
} from "@/lib/modules/hotel/actions";
import BookingDetail from "@/components/hotel/BookingDetail";

// SVC H.3 ▸ รายละเอียดการจอง (ใบสั่ง h.3 §4) — หน่วย HOTEL เท่านั้น · getBooking (ข้ามร้าน/หน่วย ⇒ notFound) · ปุ่มตามสิทธิ์จาก session
//   canManage ⇔ hotel.booking.manage · canCancel ⇔ hotel.reservation.cancel · ย้อน «ไม่มา» ⇔ ผู้จัดการ/เจ้าของ
export default async function HotelReservationDetailPage({ params }: { params: Promise<{ unitSlug: string; id: string }> }) {
  const { unitSlug, id } = await params;
  const { auth, unit } = await requireUnit(unitSlug);
  if (unit.type !== "HOTEL") notFound();
  const actor = {
    role: auth.active.role,
    unitAccess: Array.isArray(auth.active.unitAccess) ? (auth.active.unitAccess as string[]) : [],
    permissions: (auth.active.permissions ?? {}) as Record<string, unknown>,
    userId: auth.active.userId,
  };
  const ctx = { tenantId: auth.active.tenantId };
  const r = await getBooking(actor, ctx, { unitId: unit.id, id });
  if (!r.ok) notFound();
  const can = (action: string) => evaluate(actor, { module: "hotel", action, unitId: unit.id });
  const canManage = can("hotel.booking.manage");
  const rooms = canManage && (r.booking.status === "HOLD" || r.booking.status === "CONFIRMED") ? await assignableRoomsFor(actor, ctx, { unitId: unit.id, id }) : [];
  return (
    <BookingDetail
      booking={r.booking}
      unitSlug={unitSlug}
      perms={{ canManage, canCancel: can("hotel.reservation.cancel"), isManager: actor.role === "OWNER" || actor.role === "MANAGER" }}
      rooms={rooms}
      nowMs={Date.now()}
      actions={{
        confirm: confirmBookingAction.bind(null, unitSlug),
        cancel: cancelBookingAction.bind(null, unitSlug),
        extend: extendBookingAction.bind(null, unitSlug),
        quoteExtend: quoteExtendBookingAction.bind(null, unitSlug),
        shorten: shortenBookingAction.bind(null, unitSlug),
        assign: assignRoomAction.bind(null, unitSlug),
        noShow: markNoShowAction.bind(null, unitSlug),
        undo: undoNoShowAction.bind(null, unitSlug),
        takeDeposit: takeBookingDepositAction.bind(null, unitSlug),
      }}
    />
  );
}
