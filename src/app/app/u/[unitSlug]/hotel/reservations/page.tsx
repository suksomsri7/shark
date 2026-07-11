import Link from "next/link";
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
} from "@/lib/modules/hotel/actions";
import { ReservationForm } from "../reservation-form";

const STATUS_LABEL: Record<string, string> = {
  BOOKED: "จองแล้ว",
  CHECKED_IN: "เข้าพัก",
  CHECKED_OUT: "ออกแล้ว",
  CANCELLED: "ยกเลิก",
};

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
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm text-[color:var(--color-muted)]">{unit.name}</div>
          <h1 className="text-2xl font-semibold">การจอง</h1>
        </div>
        <Link href={`/app/u/${unitSlug}/hotel`} className="btn btn-ghost text-sm">
          ← วันนี้
        </Link>
      </div>

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
        <h2 className="font-medium">รายการจอง</h2>
        {reservations.length === 0 ? (
          <p className="text-sm text-[color:var(--color-muted)]">ยังไม่มีการจอง</p>
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
                      {r.code} · {fmtDate(r.checkInDate)}–{fmtDate(r.checkOutDate)} · {r.nights} คืน ·
                      ฿{(r.totalSatang / 100).toLocaleString("th-TH")}
                      {r.guestPhone ? ` · ${r.guestPhone}` : ""}
                    </div>
                  </div>
                  <span className="whitespace-nowrap rounded-full border px-2 py-0.5 text-xs text-[color:var(--color-muted)]">
                    {STATUS_LABEL[r.status]}
                  </span>
                </div>

                {r.status === "BOOKED" && (
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    {rooms.length > 0 ? (
                      <form
                        action={checkInAction.bind(null, unitSlug)}
                        className="flex items-center gap-2"
                      >
                        <input type="hidden" name="id" value={r.id} />
                        <select name="roomId" className="rounded-lg border px-2 py-1.5 text-xs">
                          {rooms.map((rm) => (
                            <option key={rm.id} value={rm.id}>
                              ห้อง {rm.number}
                              {rm.floor ? ` (ชั้น ${rm.floor})` : ""}
                            </option>
                          ))}
                        </select>
                        <button className="rounded-lg border px-2.5 py-1 text-xs hover:bg-[color:var(--color-surface-2)]">
                          เช็คอิน
                        </button>
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
                    <form action={checkOutAction.bind(null, unitSlug)}>
                      <input type="hidden" name="id" value={r.id} />
                      <button className="rounded-lg border px-2.5 py-1 text-xs hover:bg-[color:var(--color-surface-2)]">
                        เช็คเอาท์
                      </button>
                    </form>
                    <CancelBtn slug={unitSlug} id={r.id} />
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

function CancelBtn({ slug, id }: { slug: string; id: string }) {
  return (
    <form action={cancelReservationAction.bind(null, slug)}>
      <input type="hidden" name="id" value={id} />
      <button className="rounded-lg border px-2.5 py-1 text-xs text-[color:var(--color-danger)] hover:bg-[color:var(--color-surface-2)]">
        ยกเลิก
      </button>
    </form>
  );
}
