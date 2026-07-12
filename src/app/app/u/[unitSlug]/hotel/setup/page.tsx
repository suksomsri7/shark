import Link from "next/link";
import { requireUnit } from "@/lib/core/context";
import { listRoomTypes, listRooms } from "@/lib/modules/hotel/service";
import {
  addRoomTypeAction,
  removeRoomTypeAction,
  addRoomAction,
  removeRoomAction,
  setRoomStatusAction,
} from "@/lib/modules/hotel/actions";
import { PageHeader } from "@/components/ui/PageHeader";
import { formatBaht } from "@/lib/ui/money";
import { HOTEL_ROOM_STATUS_LABEL } from "@/lib/ui/status-labels";

const ROOM_STATUS = ["AVAILABLE", "CLEANING", "OOO"] as const;

export default async function HotelSetupPage({
  params,
}: {
  params: Promise<{ unitSlug: string }>;
}) {
  const { unitSlug } = await params;
  const { auth, unit } = await requireUnit(unitSlug);
  const tenantId = auth.active.tenantId;
  const [roomTypes, rooms] = await Promise.all([
    listRoomTypes(tenantId, unit.id),
    listRooms(tenantId, unit.id),
  ]);

  return (
    <div className="flex max-w-2xl flex-col gap-8">
      <PageHeader title="ตั้งค่าโรงแรม" back={{ href: `/app/u/${unitSlug}/hotel`, label: "โรงแรม · วันนี้" }} />

      {/* ประเภทห้อง */}
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium">ประเภทห้อง</h2>
        {roomTypes.length === 0 && (
          <p className="text-sm text-[color:var(--color-muted)]">ยังไม่มีประเภทห้อง เพิ่มด้านล่าง</p>
        )}
        {roomTypes.map((t) => (
          <div key={t.id} className="flex items-center justify-between rounded-lg border px-3 py-2">
            <div className="text-sm">
              <span className="font-medium">{t.name}</span>
              {t.code ? <span className="text-[color:var(--color-muted)]"> ({t.code})</span> : null}
              <span className="text-[color:var(--color-muted)]">
                {" "}
                · {t.capacity} คน · {formatBaht(t.baseRateSatang)}/คืน · {t._count.rooms} ห้อง
              </span>
            </div>
            <form action={removeRoomTypeAction.bind(null, unitSlug)}>
              <input type="hidden" name="id" value={t.id} />
              <button className="text-xs text-[color:var(--color-danger)] underline">ลบ</button>
            </form>
          </div>
        ))}
        <form
          action={addRoomTypeAction.bind(null, unitSlug)}
          className="grid grid-cols-2 gap-2 sm:grid-cols-[1fr_auto_auto_auto_auto] sm:items-end"
        >
          <label className="col-span-2 flex flex-col gap-1 sm:col-span-1">
            <span className="text-xs text-[color:var(--color-muted)]">ชื่อประเภท</span>
            <input name="name" required placeholder="เช่น Deluxe" className="w-full rounded-lg border px-3 py-2 text-sm" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-[color:var(--color-muted)]">รหัส</span>
            <input name="code" placeholder="DLX" className="w-full rounded-lg border px-2 py-2 text-sm sm:w-20" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-[color:var(--color-muted)]">จุคน</span>
            <input name="capacity" type="number" defaultValue={2} min={1} className="w-full rounded-lg border px-2 py-2 text-sm sm:w-16" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-[color:var(--color-muted)]">฿/คืน</span>
            <input name="rateBaht" type="number" defaultValue={0} min={0} className="w-full rounded-lg border px-2 py-2 text-sm sm:w-24" />
          </label>
          <button className="btn btn-primary col-span-2 text-sm sm:col-span-1">เพิ่ม</button>
        </form>
      </section>

      {/* ห้องพัก */}
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium">ห้องพัก</h2>
        {roomTypes.length === 0 ? (
          <p className="text-xs text-[color:var(--color-muted)]">เพิ่มประเภทห้องก่อนจึงเพิ่มห้องได้</p>
        ) : (
          <>
            {rooms.length === 0 && (
              <p className="text-sm text-[color:var(--color-muted)]">ยังไม่มีห้อง เพิ่มด้านล่าง</p>
            )}
            {rooms.map((r) => (
              <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2">
                <div className="text-sm">
                  <span className="font-medium">ห้อง {r.number}</span>
                  {r.floor ? <span className="text-[color:var(--color-muted)]"> · ชั้น {r.floor}</span> : null}
                  <span className="text-[color:var(--color-muted)]"> · {r.roomType.name}</span>
                </div>
                <div className="flex items-center gap-2">
                  <form action={setRoomStatusAction.bind(null, unitSlug)} className="flex items-center gap-1">
                    <input type="hidden" name="id" value={r.id} />
                    <select
                      name="status"
                      defaultValue={r.status}
                      className="rounded-lg border px-2 py-2 text-sm"
                    >
                      {ROOM_STATUS.map((s) => (
                        <option key={s} value={s}>
                          {HOTEL_ROOM_STATUS_LABEL[s]}
                        </option>
                      ))}
                      {r.status === "OCCUPIED" && (
                        <option value="OCCUPIED">{HOTEL_ROOM_STATUS_LABEL.OCCUPIED}</option>
                      )}
                    </select>
                    <button className="btn-sm">บันทึก</button>
                  </form>
                  <form action={removeRoomAction.bind(null, unitSlug)}>
                    <input type="hidden" name="id" value={r.id} />
                    <button className="text-xs text-[color:var(--color-danger)] underline">ลบ</button>
                  </form>
                </div>
              </div>
            ))}
            <form
              action={addRoomAction.bind(null, unitSlug)}
              className="grid grid-cols-2 gap-2 sm:grid-cols-[1fr_auto_auto_auto] sm:items-end"
            >
              <label className="col-span-2 flex flex-col gap-1 sm:col-span-1">
                <span className="text-xs text-[color:var(--color-muted)]">ประเภท</span>
                <select name="roomTypeId" required className="w-full rounded-lg border px-3 py-2 text-sm">
                  {roomTypes.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs text-[color:var(--color-muted)]">เลขห้อง</span>
                <input name="number" required placeholder="203" className="w-full rounded-lg border px-2 py-2 text-sm sm:w-24" />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs text-[color:var(--color-muted)]">ชั้น</span>
                <input name="floor" placeholder="2" className="w-full rounded-lg border px-2 py-2 text-sm sm:w-16" />
              </label>
              <button className="btn btn-primary col-span-2 text-sm sm:col-span-1">เพิ่มห้อง</button>
            </form>
          </>
        )}
      </section>
    </div>
  );
}
