import { notFound } from "next/navigation";
import { requireUnit } from "@/lib/core/context";
import { evaluate } from "@/lib/core/rbac";
import { assignableRoomsFor, getBooking, getFolio } from "@/lib/modules/hotel";
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
  // SVC H.5 ▸ บิลระหว่างพัก · เช็กเอาต์ POS ใบเดียว · เงินประกัน ◂
  postFolioItemAction,
  voidFolioItemAction,
  prepareCheckoutAction,
  settleAndCheckOutAction,
  takeSecurityDepositAction,
  refundSecurityDepositAction,
  forfeitSecurityDepositAction,
} from "@/lib/modules/hotel/actions";
import BookingDetail from "@/components/hotel/BookingDetail";
import FolioPanel from "@/components/hotel/FolioPanel"; // SVC H.5 ◂

// SVC H.3 ▸ รายละเอียดการจอง (ใบสั่ง h.3 §4) — หน่วย HOTEL เท่านั้น · getBooking (ข้ามร้าน/หน่วย ⇒ notFound) · ปุ่มตามสิทธิ์จาก session
//   canManage ⇔ hotel.booking.manage · canCancel ⇔ hotel.reservation.cancel · ย้อน «ไม่มา» ⇔ ผู้จัดการ/เจ้าของ
// SVC H.5 ▸ แท็บ "เงิน" = บิลระหว่างพัก (FolioPanel ฝังใน BookingDetail · ภาพ 09 ขวา) แทนปุ่มเช็กเอาต์ P1 · ?tab=money เปิดแท็บเงิน · ?checkout=1 เปิดไดอะล็อกเช็กเอาต์ (ภาพ h.5) ◂
type SearchP = Promise<{ [k: string]: string | string[] | undefined }>;
export default async function HotelReservationDetailPage({ params, searchParams }: { params: Promise<{ unitSlug: string; id: string }>; searchParams?: SearchP }) {
  const { unitSlug, id } = await params;
  const sp: { [k: string]: string | string[] | undefined } = searchParams ? await searchParams : {};
  const tab = typeof sp.tab === "string" ? sp.tab : "";
  const wantCheckout = sp.checkout === "1";
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
  // SVC H.5 ▸ folio มีเมื่อยืนยันแล้ว (สิทธิ์อ่าน folio ไม่มี = ไม่แสดง) ◂
  const folioRes = ["CONFIRMED", "BOOKED", "CHECKED_IN", "CHECKED_OUT", "REFUNDED"].includes(r.booking.status) ? await getFolio(actor, ctx, { reservationId: id, unitId: unit.id }) : null;
  const renderFolio = () => {
    if (!folioRes || !folioRes.ok) return null;
    return (
    <div id="folio" data-detail-folio={tab === "money" ? "money" : ""}>
      <FolioPanel
        folio={folioRes.folio}
        printHref={`/app/u/${unitSlug}/hotel/reservations/${id}/folio/print`}
        openCheckout={wantCheckout}
        actions={{
          post: postFolioItemAction.bind(null, unitSlug),
          void: voidFolioItemAction.bind(null, unitSlug),
          prepare: prepareCheckoutAction.bind(null, unitSlug),
          settle: settleAndCheckOutAction.bind(null, unitSlug),
          takeSecurity: takeSecurityDepositAction.bind(null, unitSlug),
          refundSecurity: refundSecurityDepositAction.bind(null, unitSlug),
          forfeitSecurity: forfeitSecurityDepositAction.bind(null, unitSlug),
        }}
      />
    </div>
    );
  };
  return (
      <BookingDetail
      moneyPanel={renderFolio()}
      initialTab={tab === "money" || wantCheckout ? "money" : undefined}
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
