import { requireUnit } from "@/lib/core/context";
import {
  listReservations,
  listRoomTypes,
  assignableRooms,
  todayBkk,
  addDaysStr,
} from "@/lib/modules/hotel/service";
import {
  checkInAction,
  checkOutAction,
  cancelReservationAction,
  refundStayAction,
} from "@/lib/modules/hotel/actions";
import { ReservationForm } from "../reservation-form";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusChip } from "@/components/ui/StatusChip";
import { MoneyText } from "@/components/ui/MoneyText";
import { EmptyState } from "@/components/ui/EmptyState";
import { HOTEL_RESV_STATUS_LABEL } from "@/lib/ui/status-labels";

const resvTone = (v: string) =>
  v === "CANCELLED" || v === "REFUNDED" ? "danger" : v === "BOOKED" ? "muted" : "strong";

function fmtDate(d: Date) {
  return d.toLocaleDateString("th-TH", { day: "numeric", month: "short", timeZone: "UTC" });
}

export default async function HotelReservationsPage({
  params,
}: {
  params: Promise<{ unitSlug: string }>;
}) {
  const { unitSlug } = await params;
  const { auth, unit } = await requireUnit(unitSlug);
  const tenantId = auth.active.tenantId;

  const [roomTypes, reservations] = await Promise.all([
    listRoomTypes(tenantId, unit.id),
    listReservations(tenantId, unit.id),
  ]);

  // ห้องที่ assign ได้ต่อการจอง BOOKED (สำหรับ dropdown เช็คอิน)
  const booked = reservations.filter((r) => r.status === "BOOKED");
  const roomsByRes = new Map<string, { id: string; number: string; floor: string | null }[]>();
  await Promise.all(
    booked.map(async (r) => {
      roomsByRes.set(r.id, await assignableRooms(tenantId, unit.id, r.id));
    }),
  );

  const today = todayBkk();
  const tomorrow = addDaysStr(today, 1);

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <PageHeader title="การจอง" back={{ href: `/app/u/${unitSlug}/hotel`, label: "โรงแรม · วันนี้" }} />

      <ReservationForm
        unitSlug={unitSlug}
        today={today}
        tomorrow={tomorrow}
        roomTypes={roomTypes.map((t) => ({
          id: t.id,
          name: t.name,
          baseRateSatang: t.baseRateSatang,
        }))}
      />

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-medium">รายการจอง</h2>
        {reservations.length === 0 ? (
          <EmptyState text="ยังไม่มีการจอง — เพิ่มการจองใหม่ด้านบน" />
        ) : (
          reservations.map((r) => {
            const rooms = roomsByRes.get(r.id) ?? [];
            return (
              <div key={r.id} className="rounded-xl border p-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-sm font-medium">
                      {r.guestName} · {r.roomType.name}
                      {r.room ? ` · ห้อง ${r.room.number}` : ""}
                    </div>
                    <div className="text-xs text-[color:var(--color-muted)]">
                      {r.code} · {fmtDate(r.checkInDate)}–{fmtDate(r.checkOutDate)} · {r.nights} คืน ·{" "}
                      <MoneyText satang={r.totalSatang} />
                      {r.guestPhone ? ` · ${r.guestPhone}` : ""}
                    </div>
                  </div>
                  <StatusChip value={r.status} map={HOTEL_RESV_STATUS_LABEL} toneOf={resvTone} />
                </div>

                {r.status === "BOOKED" && (
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    {rooms.length > 0 ? (
                      <form
                        action={checkInAction.bind(null, unitSlug)}
                        className="flex items-center gap-2"
                      >
                        <input type="hidden" name="id" value={r.id} />
                        <select name="roomId" className="rounded-lg border px-2 py-2 text-sm">
                          {rooms.map((rm) => (
                            <option key={rm.id} value={rm.id}>
                              ห้อง {rm.number}
                              {rm.floor ? ` (ชั้น ${rm.floor})` : ""}
                            </option>
                          ))}
                        </select>
                        <SubmitButton variant="ghost">เช็คอิน</SubmitButton>
                      </form>
                    ) : (
                      <span className="text-xs text-[color:var(--color-danger)]">
                        ไม่มีห้องว่างให้ assign
                      </span>
                    )}
                    <CancelBtn slug={unitSlug} id={r.id} />
                  </div>
                )}

                {r.status === "CHECKED_IN" && (
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <ConfirmDialog
                      triggerLabel="เช็คเอาท์"
                      triggerClassName="btn-sm"
                      title="เช็คเอาท์ห้องนี้?"
                      detail="ระบบจะปิดการเข้าพักและปล่อยห้องให้ว่าง"
                      confirmLabel="ยืนยันเช็คเอาท์"
                      danger
                      action={checkOutAction.bind(null, unitSlug)}
                      fields={{ id: r.id }}
                    />
                    <CancelBtn slug={unitSlug} id={r.id} />
                  </div>
                )}

                {r.status === "CHECKED_OUT" && (
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <RefundBtn slug={unitSlug} id={r.id} />
                  </div>
                )}
              </div>
            );
          })
        )}
      </section>
    </div>
  );
}

function RefundBtn({ slug, id }: { slug: string; id: string }) {
  return (
    <ConfirmDialog
      triggerLabel="คืนเงิน"
      triggerClassName="btn-sm text-[color:var(--color-danger)]"
      title="คืนเงินการจองนี้?"
      detail="ระบบจะยกเลิกบิลค่าห้อง (คืนเงินเข้าบัญชีและคืนแต้มสมาชิก) แก้ไขไม่ได้"
      confirmLabel="ยืนยันคืนเงิน"
      danger
      action={refundStayAction.bind(null, slug)}
      fields={{ id }}
    />
  );
}

function CancelBtn({ slug, id }: { slug: string; id: string }) {
  return (
    <ConfirmDialog
      triggerLabel="ยกเลิก"
      triggerClassName="btn-sm text-[color:var(--color-danger)]"
      title="ยกเลิกการจองนี้?"
      detail="การจองจะถูกยกเลิกและปล่อยห้องคืน แก้ไขไม่ได้"
      confirmLabel="ยืนยันยกเลิก"
      danger
      action={cancelReservationAction.bind(null, slug)}
      fields={{ id }}
    />
  );
}
