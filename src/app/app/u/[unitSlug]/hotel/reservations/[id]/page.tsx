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
import { assignableRooms, checkinView, listGuests, rr3Card } from "@/lib/modules/hotel"; // SVC H.4 ▸ แท็บแขก/เช็กอิน ◂
import CheckinPanel from "@/components/hotel/CheckinPanel"; // SVC H.4
import type { MembershipCtx } from "@/lib/core/rbac"; // SVC H.4
import type { BookingDetail as BookingDetailDto } from "@/lib/modules/hotel"; // SVC H.4

// SVC H.3 ▸ รายละเอียดการจอง (ใบสั่ง h.3 §4) — หน่วย HOTEL เท่านั้น · getBooking (ข้ามร้าน/หน่วย ⇒ notFound) · ปุ่มตามสิทธิ์จาก session
//   canManage ⇔ hotel.booking.manage · canCancel ⇔ hotel.reservation.cancel · ย้อน «ไม่มา» ⇔ ผู้จัดการ/เจ้าของ
export default async function HotelReservationDetailPage({ params, searchParams }: { params: Promise<{ unitSlug: string; id: string }>; searchParams?: Promise<{ tab?: string | string[] }> }) {
  const { unitSlug, id } = await params;
  const tab = (await searchParams)?.tab; // SVC H.4 ▸ ?tab=guests = แท็บแขก/เช็กอิน (ร.ร.3 · ตม.30) ◂
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
  // SVC H.4 ▸ แท็บ "แขก" → ทะเบียนผู้พัก/เช็กอิน V2 (CheckinPanel · ภาพ 09 ซ้าย) · ปุ่ม "เช็กอิน" = แผงนี้ (สิทธิ์จาก session · ไม่อ่านสิทธิ์จาก URL)
  const canGuests = can("hotel.reservation.checkIn") || can("hotel.guest.register") || can("hotel.guest.viewId");
  const guestsTab = tab === "guests" && canGuests ? await checkinTab(actor, ctx, unit.id, unitSlug, r.booking, can) : null;
  const guestsLink =
    !guestsTab && canGuests && ["CONFIRMED", "CHECKED_IN", "CHECKED_OUT"].includes(r.booking.status) ? (
      <a href={`/app/u/${unitSlug}/hotel/reservations/${id}?tab=guests`} data-guests-tab-link="" className="self-start rounded-xl border border-[color:var(--color-line)] px-4 py-2 text-sm font-bold">
        {r.booking.status === "CONFIRMED" ? "เช็กอิน · ลงทะเบียนผู้พัก (ร.ร.3) →" : "แขก · ทะเบียนผู้พัก (ร.ร.3) · ตม.30 →"}
      </a>
    ) : null;
  // ◂ SVC H.4
  return (
    <div className="flex w-full min-w-0 flex-col gap-4">
    {guestsTab}
    {guestsLink}
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
    </div>
  );
}

// SVC H.4 ▸ ข้อมูลแผงเช็กอิน/ทะเบียนผู้พัก (ผ่าน facade · ร้าน/ผู้กระทำจาก session) ◂
async function checkinTab(
  actor: MembershipCtx & { userId: string },
  ctx: { tenantId: string },
  unitId: string,
  unitSlug: string,
  b: BookingDetailDto,
  can: (action: string) => boolean,
) {
  const [view, rooms, list] = await Promise.all([checkinView(ctx, { unitId, reservationId: b.id }), assignableRooms(ctx, { reservationId: b.id }), listGuests(actor, ctx, { unitId, reservationId: b.id })]);
  if (!view.ok) return null;
  const guests = list.ok ? [...list.rows].reverse() : [];
  const card = guests[0] ? await rr3Card({ ...ctx, userId: actor.userId }, { guestId: guests[0].id }) : null;
  return (
    <CheckinPanel
      unitSlug={unitSlug}
      reservation={{
        id: b.id,
        code: b.code,
        status: b.status,
        guestName: b.guestName,
        roomTypeName: b.roomTypeName,
        roomId: b.roomId,
        roomNumber: b.roomNumber,
        checkIn: b.checkIn,
        checkOut: b.checkOut,
        checkedInAt: view.checkedInAt,
        source: b.source,
        adults: b.adults,
        children: b.children,
        depositDueSatang: b.depositPaidAt ? 0 : b.depositSatang,
        securityDepositSatang: view.securityDepositSatang,
        today: b.today,
      }}
      rooms={Array.isArray(rooms) ? rooms : []}
      guests={guests}
      perms={{ checkIn: can("hotel.reservation.checkIn"), register: can("hotel.guest.register"), canViewId: can("hotel.guest.viewId"), manage: can("hotel.booking.manage"), isManager: actor.role === "OWNER" || actor.role === "MANAGER" }}
      settings={view.settings}
      primaryCard={card && card.ok ? { recordedByName: card.recordedBy.name, signatureUrl: card.signatureUrl, idImageUrl: card.idImageUrl, signedOnPaper: card.signedOnPaper } : null}
      nowMs={Date.now()}
    />
  );
}
