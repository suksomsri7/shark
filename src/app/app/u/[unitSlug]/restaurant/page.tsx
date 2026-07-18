import Link from "next/link";
import { requireUnit } from "@/lib/core/context";
import { floorPlan } from "@/lib/modules/restaurant/table";
import { listServiceRequests, ordersToday, billsToday } from "@/lib/modules/restaurant/order";
import { getSetting } from "@/lib/modules/restaurant/menu";
import { kitchenOpenNow } from "@/lib/modules/restaurant/scope";
import { openSessionAction, ackRequestAction, doneRequestAction, kitchenPauseAction, voidCheckoutAction, confirmPromptpayPaymentAction } from "@/lib/actions/restaurant";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatBaht } from "@/lib/ui/money";

function minsSince(d: Date | null) {
  if (!d) return 0;
  return Math.floor((Date.now() - d.getTime()) / 60000);
}

export default async function RestaurantPage({
  params,
  searchParams,
}: {
  params: Promise<{ unitSlug: string }>;
  searchParams: Promise<{ err?: string }>;
}) {
  const { unitSlug } = await params;
  const { err } = await searchParams;
  const { auth, unit } = await requireUnit(unitSlug);
  const { tenantId } = auth.active;
  const [tables, requests, today, setting, bills] = await Promise.all([
    floorPlan(tenantId, unit.id),
    listServiceRequests(tenantId, unit.id),
    ordersToday(tenantId, unit.id),
    getSetting(tenantId, unit.id),
    billsToday(tenantId, unit.id),
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

      {err && (
        <div className="rounded-lg border border-[color:var(--color-danger)] bg-rose-50 px-3 py-2 text-sm text-[color:var(--color-danger)]">
          {err}
        </div>
      )}

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
          {requests.map((r) => {
            const isPay = r.type === "PAY_PROMPTPAY";
            const label = r.type === "CALL_STAFF" ? "เรียกพนักงาน" : isPay ? "ลูกค้าแจ้งชำระ (พร้อมเพย์)" : "ขอเช็คบิล";
            return (
              <div key={r.id} className={`flex items-center justify-between rounded-xl border p-3 ${isPay ? "border-2 border-[color:var(--color-ink)]" : ""}`}>
                <div>
                  <div className="text-sm font-medium">
                    โต๊ะ {r.session.table.name} · {label}
                    {r.status === "ACKED" ? " · รับเรื่องแล้ว" : ""}
                  </div>
                  {r.note && <div className="text-xs text-[color:var(--color-muted)]">{r.note}</div>}
                  {isPay && <div className="text-xs text-[color:var(--color-muted)]">ตรวจยอดเงินเข้าบัญชีก่อน แล้วกดยืนยันรับเงินเพื่อปิดบิล</div>}
                </div>
                <div className="flex gap-2">
                  {isPay && (
                    <ConfirmDialog
                      triggerLabel="ยืนยันรับเงิน"
                      triggerClassName="btn-sm btn-primary"
                      title={`ยืนยันรับเงินโต๊ะ ${r.session.table.name}?`}
                      detail="ยืนยันว่าเงินพร้อมเพย์เข้าบัญชีร้านแล้ว — ระบบจะปิดบิล ลงบัญชี และปิดโต๊ะให้อัตโนมัติ"
                      confirmLabel="ยืนยันรับเงินแล้ว"
                      action={confirmPromptpayPaymentAction.bind(null, unitSlug)}
                      fields={{ sessionId: r.sessionId, requestId: r.id }}
                    />
                  )}
                  {r.status === "PENDING" && !isPay && (
                    <form action={ackRequestAction.bind(null, unitSlug)}>
                      <input type="hidden" name="id" value={r.id} />
                      <button className="btn-sm">รับเรื่อง</button>
                    </form>
                  )}
                  <form action={doneRequestAction.bind(null, unitSlug)}>
                    <input type="hidden" name="id" value={r.id} />
                    <button className="btn-sm">{isPay ? "ปิดคำขอ" : "เสร็จ"}</button>
                  </form>
                </div>
              </div>
            );
          })}
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
                        t.hasPayNotified ? "border-2 border-[color:var(--color-ink)]" : t.hasBillRequest ? "border-2 border-[color:var(--color-danger)]" : t.hasRequest ? "border-2" : ""
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
                          {t.hasPayNotified && (
                            <div className="text-xs font-medium text-[color:var(--color-ink)]">ลูกค้าแจ้งชำระ (พร้อมเพย์)</div>
                          )}
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

      {/* บิลวันนี้ — ยกเลิก/คืนเงินหลังชำระ */}
      {bills.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-medium">บิลวันนี้</h2>
          <p className="text-xs text-[color:var(--color-muted)]">กดผิด/ต้องคืนเงิน — ยกเลิกบิลได้ที่นี่ (เงินจะกลับเข้าบัญชีอัตโนมัติ)</p>
          {bills.map((b) => (
            <div key={b.sessionId} className="flex items-center justify-between rounded-xl border p-3">
              <div>
                <div className="text-sm font-medium">
                  โต๊ะ {b.tableName} · {formatBaht(b.totalSatang)}
                  {b.allVoided && (
                    <span className="ml-2 rounded bg-rose-100 px-1.5 py-0.5 text-xs text-[color:var(--color-danger)]">ยกเลิกแล้ว</span>
                  )}
                </div>
                {b.receiptNos.length > 0 && (
                  <div className="text-xs text-[color:var(--color-muted)]">ใบเสร็จ {b.receiptNos.join(", ")}</div>
                )}
              </div>
              {b.voidable && (
                <ConfirmDialog
                  triggerLabel="ยกเลิกบิล/คืนเงิน"
                  triggerClassName="btn-sm text-[color:var(--color-danger)]"
                  title={`ยกเลิกบิลโต๊ะ ${b.tableName}?`}
                  detail="เงินจะถูกคืนเข้าบัญชี รายการอาหารกลับมาแก้ไข/คิดเงินใหม่ได้ และโต๊ะจะเปิดกลับมา"
                  confirmLabel="ยืนยันยกเลิกบิล"
                  danger
                  action={voidCheckoutAction.bind(null, unitSlug)}
                  fields={{ sessionId: b.sessionId }}
                />
              )}
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
