import Link from "next/link";
import { requireUnit } from "@/lib/core/context";
import { floorPlan } from "@/lib/modules/restaurant/table";
import { listServiceRequests, ordersToday } from "@/lib/modules/restaurant/order";
import { getSetting } from "@/lib/modules/restaurant/menu";
import { kitchenOpenNow } from "@/lib/modules/restaurant/scope";
import { openSessionAction, ackRequestAction, doneRequestAction, kitchenPauseAction } from "@/lib/actions/restaurant";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatBaht } from "@/lib/ui/money";

function minsSince(d: Date | null) {
  if (!d) return 0;
  return Math.floor((Date.now() - d.getTime()) / 60000);
}

export default async function RestaurantPage({
  params,
}: {
  params: Promise<{ unitSlug: string }>;
}) {
  const { unitSlug } = await params;
  const { auth, unit } = await requireUnit(unitSlug);
  const { tenantId } = auth.active;
  const [tables, requests, today, setting] = await Promise.all([
    floorPlan(tenantId, unit.id),
    listServiceRequests(tenantId, unit.id),
    ordersToday(tenantId, unit.id),
    getSetting(tenantId, unit.id),
  ]);
  const kitchen = kitchenOpenNow(setting);
  const byZone = new Map<string, typeof tables>();
  for (const t of tables) {
    const arr = byZone.get(t.zoneName) ?? [];
    arr.push(t);
    byZone.set(t.zoneName, arr);
  }

  return (
    <div className="flex max-w-4xl flex-col gap-6">
      <PageHeader
        title="ร้านอาหาร · หน้างาน"
        back={{ href: `/app/u/${unitSlug}`, label: unit.name }}
        actions={
          <>
            <Link href={`/app/u/${unitSlug}/restaurant/order`} className="btn btn-primary text-sm">
              + คีย์ออเดอร์
            </Link>
            <Link href={`/app/u/${unitSlug}/restaurant/kds`} className="btn btn-ghost text-sm">
              จอครัว (KDS)
            </Link>
            <Link href={`/app/u/${unitSlug}/restaurant/menu`} className="btn btn-ghost text-sm">
              เมนู
            </Link>
            <Link href={`/app/u/${unitSlug}/restaurant/setup`} className="btn btn-ghost text-sm">
              ตั้งค่า
            </Link>
          </>
        }
      />

      {/* สรุปวันนี้ + สถานะครัว */}
      <section className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className="card text-center">
          <div className="text-xl font-semibold">{today.count}</div>
          <div className="text-xs text-[color:var(--color-muted)]">ออเดอร์วันนี้</div>
        </div>
        <div className="card text-center">
          <div className="text-xl font-semibold">{formatBaht(today.revenueSatang)}</div>
          <div className="text-xs text-[color:var(--color-muted)]">ยอดชำระแล้ว</div>
        </div>
        <div className="card text-center">
          <div className="text-xl font-semibold">{tables.filter((t) => t.sessionId).length}</div>
          <div className="text-xs text-[color:var(--color-muted)]">โต๊ะมีลูกค้า</div>
        </div>
        <div className={`card text-center ${kitchen.open ? "" : "border-[color:var(--color-danger)]"}`}>
          <div className="text-sm font-semibold">{kitchen.open ? "ครัวเปิด" : "ครัวปิด"}</div>
          <form action={kitchenPauseAction.bind(null, unitSlug)} className="mt-1">
            <input type="hidden" name="paused" value={setting.kitchenPaused ? "false" : "true"} />
            <button className="text-xs underline text-[color:var(--color-muted)]">
              {setting.kitchenPaused ? "เปิดครัว" : "ปิดครัวฉุกเฉิน"}
            </button>
          </form>
        </div>
      </section>

      {/* เรียกพนักงาน / ขอเช็คบิล */}
      {requests.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-medium">คำขอจากลูกค้า ({requests.length})</h2>
          {requests.map((r) => (
            <div key={r.id} className="flex items-center justify-between rounded-xl border p-3">
              <div>
                <div className="text-sm font-medium">
                  โต๊ะ {r.session.table.name} · {r.type === "CALL_STAFF" ? "เรียกพนักงาน" : "ขอเช็คบิล"}
                  {r.status === "ACKED" ? " · รับเรื่องแล้ว" : ""}
                </div>
                {r.note && <div className="text-xs text-[color:var(--color-muted)]">{r.note}</div>}
              </div>
              <div className="flex gap-2">
                {r.status === "PENDING" && (
                  <form action={ackRequestAction.bind(null, unitSlug)}>
                    <input type="hidden" name="id" value={r.id} />
                    <button className="btn-sm">รับเรื่อง</button>
                  </form>
                )}
                <form action={doneRequestAction.bind(null, unitSlug)}>
                  <input type="hidden" name="id" value={r.id} />
                  <button className="btn-sm">เสร็จ</button>
                </form>
              </div>
            </div>
          ))}
        </section>
      )}

      {/* Floor plan */}
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium">ผังโต๊ะ</h2>
        {tables.length === 0 ? (
          <EmptyState
            text="ยังไม่มีโต๊ะ — เพิ่มโซนและโต๊ะในหน้าตั้งค่าก่อนเปิดร้าน"
            action={{ href: `/app/u/${unitSlug}/restaurant/setup`, label: "ไปหน้าตั้งค่า" }}
          />
        ) : (
          [...byZone.entries()].map(([zone, ts]) => (
            <div key={zone} className="flex flex-col gap-2">
              <div className="text-xs text-[color:var(--color-muted)]">{zone}</div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {ts.map((t) => {
                  const busy = !!t.sessionId;
                  const inactive = t.status === "INACTIVE";
                  return (
                    <div
                      key={t.id}
                      className={`rounded-xl border p-3 ${busy ? "bg-[color:var(--color-surface-2)]" : ""} ${
                        t.hasBillRequest ? "border-2 border-[color:var(--color-danger)]" : t.hasRequest ? "border-2" : ""
                      } ${inactive ? "opacity-40" : ""}`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="font-medium">{t.name}</div>
                        <div className="text-xs text-[color:var(--color-muted)]">{t.seats} ที่</div>
                      </div>
                      {inactive ? (
                        <div className="mt-1 text-xs text-[color:var(--color-muted)]">ปิดใช้งาน</div>
                      ) : busy ? (
                        <div className="mt-1 flex flex-col gap-1">
                          <div className="text-sm font-semibold">{formatBaht(t.totalSatang)}</div>
                          <div className="text-xs text-[color:var(--color-muted)]">
                            {t.guestCount ? `${t.guestCount} คน · ` : ""}
                            {minsSince(t.openedAt)} นาที
                          </div>
                          {(t.hasRequest || t.hasBillRequest) && (
                            <div className="text-xs text-[color:var(--color-danger)]">
                              {t.hasBillRequest ? "ขอเช็คบิล" : "เรียกพนักงาน"}
                            </div>
                          )}
                          <div className="mt-1 flex flex-wrap gap-1.5">
                            <Link
                              href={`/app/u/${unitSlug}/restaurant/tables/${t.sessionId}`}
                              className="btn-sm"
                            >
                              ดูโต๊ะ
                            </Link>
                            <Link
                              href={`/app/u/${unitSlug}/restaurant/checkout/${t.sessionId}`}
                              className="btn-sm"
                            >
                              เช็คบิล
                            </Link>
                          </div>
                        </div>
                      ) : (
                        <form action={openSessionAction.bind(null, unitSlug)} className="mt-2">
                          <input type="hidden" name="tableId" value={t.id} />
                          <button className="btn-sm w-full">เปิดโต๊ะ</button>
                        </form>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </section>
    </div>
  );
}
