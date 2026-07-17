import Link from "next/link";
import { requireUnit } from "@/lib/core/context";
import { listOrders } from "@/lib/modules/shop/service";
import { confirmOrderAction, cancelOrderAction, refundOrderAction } from "@/lib/modules/shop/actions";
import { getShipmentForOrder } from "@/lib/delivery/service";
import { listAdapters } from "@/lib/delivery/adapters";
import { createShipmentAction, updateShipmentStatusAction } from "@/lib/delivery/actions";
import ConfirmDialog from "@/components/ui/ConfirmDialog";

const baht = (satang: number) => (satang / 100).toLocaleString("th-TH", { minimumFractionDigits: 0 });

const STATUS: Record<string, { label: string; cls: string }> = {
  PENDING_PAYMENT: { label: "รอชำระ", cls: "bg-amber-100 text-amber-800" },
  PAID: { label: "รับเงินแล้ว", cls: "bg-green-100 text-green-800" },
  CANCELLED: { label: "ยกเลิก", cls: "bg-gray-200 text-gray-700" },
  REFUNDED: { label: "คืนเงินแล้ว", cls: "bg-rose-100 text-rose-800" },
};

const SHIP_STATUS: Record<string, { label: string; cls: string }> = {
  PREPARING: { label: "เตรียมจัดส่ง", cls: "bg-amber-100 text-amber-800" },
  SHIPPED: { label: "จัดส่งแล้ว", cls: "bg-blue-100 text-blue-800" },
  DELIVERED: { label: "ถึงผู้รับแล้ว", cls: "bg-green-100 text-green-800" },
  CANCELLED: { label: "ยกเลิกจัดส่ง", cls: "bg-gray-200 text-gray-700" },
};

// รายการออเดอร์ + ยืนยันรับเงิน / ยกเลิก — /app/u/[unitSlug]/shop/orders
export default async function ShopOrdersPage({
  params,
  searchParams,
}: {
  params: Promise<{ unitSlug: string }>;
  searchParams: Promise<{ err?: string }>;
}) {
  const { unitSlug } = await params;
  const { err } = await searchParams;
  const { auth, unit } = await requireUnit(unitSlug);
  const ctx = { tenantId: auth.active.tenantId, unitId: unit.id };
  const orders = await listOrders(ctx, {});
  const adapters = listAdapters();

  // ใบจัดส่งของ order ที่ชำระเงินแล้ว (order ละ 1 ใบ)
  const shipments = new Map<string, Awaited<ReturnType<typeof getShipmentForOrder>>>();
  for (const o of orders) {
    if (o.status === "PAID") shipments.set(o.id, await getShipmentForOrder(ctx, o.id));
  }

  return (
    <div className="flex max-w-2xl flex-col gap-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">ออเดอร์</h1>
        <Link href={`/app/u/${unitSlug}/shop`} className="btn btn-ghost text-sm">
          ← จัดการสินค้า
        </Link>
      </div>

      {err && (
        <div className="rounded-lg border border-[color:var(--color-danger)] bg-rose-50 px-3 py-2 text-sm text-[color:var(--color-danger)]">
          {err}
        </div>
      )}

      {orders.length === 0 && <p className="text-sm text-[color:var(--color-muted)]">ยังไม่มีออเดอร์</p>}

      {orders.map((o) => {
        const st = STATUS[o.status] ?? STATUS.PENDING_PAYMENT;
        return (
          <div key={o.id} className="card flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <div>
                <span className="font-medium">{o.code}</span>{" "}
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${st.cls}`}>{st.label}</span>
              </div>
              <span className="font-semibold">฿{baht(o.totalSatang)}</span>
            </div>
            <div className="text-sm text-[color:var(--color-muted)]">
              {o.customerName} · {o.customerPhone}
              {o.note && ` · ${o.note}`}
            </div>
            <div className="text-xs text-[color:var(--color-muted)]">
              {o.lines.map((l) => `${l.name}×${l.qty}`).join(", ")}
            </div>
            {o.status === "PENDING_PAYMENT" && (
              <div className="flex gap-2 pt-1">
                <form action={confirmOrderAction.bind(null, unitSlug, o.id)}>
                  <button className="btn btn-primary text-sm">ยืนยันรับเงิน</button>
                </form>
                <form action={cancelOrderAction.bind(null, unitSlug, o.id)}>
                  <button className="rounded-lg border px-3 py-1.5 text-sm hover:bg-[color:var(--color-surface-2)]">
                    ยกเลิก
                  </button>
                </form>
              </div>
            )}

            {/* การจัดส่ง — เฉพาะออเดอร์ที่ชำระเงินแล้ว */}
            {o.status === "PAID" && (() => {
              const sh = shipments.get(o.id);
              if (!sh) {
                return (
                  <form
                    action={createShipmentAction.bind(null, unitSlug, o.id)}
                    className="mt-1 flex flex-col gap-2 border-t pt-3"
                  >
                    <div className="text-sm font-medium">จัดส่ง</div>
                    <select name="provider" className="input text-sm" defaultValue={adapters[0]?.key}>
                      {adapters.map((a) => (
                        <option key={a.key} value={a.key}>
                          {a.label}
                        </option>
                      ))}
                    </select>
                    <input
                      name="trackingNo"
                      placeholder="เลขพัสดุ (ถ้ามี)"
                      className="input text-sm"
                      maxLength={80}
                    />
                    <button className="btn btn-primary self-start text-sm">สร้างใบจัดส่ง</button>
                  </form>
                );
              }
              const sst = SHIP_STATUS[sh.status] ?? SHIP_STATUS.PREPARING;
              return (
                <div className="mt-1 flex flex-col gap-2 border-t pt-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">การจัดส่ง</span>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${sst.cls}`}>{sst.label}</span>
                  </div>
                  <div className="text-xs text-[color:var(--color-muted)]">
                    {(adapters.find((a) => a.key === sh.provider)?.label ?? sh.provider)}
                    {sh.trackingNo && ` · เลขพัสดุ ${sh.trackingNo}`}
                  </div>
                  {sh.status !== "CANCELLED" && sh.status !== "DELIVERED" && (
                    <div className="flex flex-wrap gap-2">
                      {sh.status === "PREPARING" && (
                        <form action={updateShipmentStatusAction.bind(null, unitSlug, sh.id, "SHIPPED")}>
                          <button className="rounded-lg border px-3 py-1.5 text-sm hover:bg-[color:var(--color-surface-2)]">
                            ส่งแล้ว
                          </button>
                        </form>
                      )}
                      {sh.status === "SHIPPED" && (
                        <form action={updateShipmentStatusAction.bind(null, unitSlug, sh.id, "DELIVERED")}>
                          <button className="rounded-lg border px-3 py-1.5 text-sm hover:bg-[color:var(--color-surface-2)]">
                            ถึงแล้ว
                          </button>
                        </form>
                      )}
                      <form action={updateShipmentStatusAction.bind(null, unitSlug, sh.id, "CANCELLED")}>
                        <button className="rounded-lg border px-3 py-1.5 text-sm text-red-600 hover:bg-[color:var(--color-surface-2)]">
                          ยกเลิกจัดส่ง
                        </button>
                      </form>
                    </div>
                  )}
                </div>
              );
            })()}

            {/* คืนเงิน — เฉพาะออเดอร์ที่รับเงินแล้ว (void บิล + คืนสต็อก) */}
            {o.status === "PAID" && (
              <div className="mt-1 border-t pt-3">
                <ConfirmDialog
                  triggerLabel="คืนเงิน"
                  triggerClassName="rounded-lg border border-[color:var(--color-danger)] px-3 py-1.5 text-sm text-[color:var(--color-danger)] hover:bg-[color:var(--color-surface-2)]"
                  title={`คืนเงินออเดอร์ ${o.code}?`}
                  detail={`ยกเลิกบิลและคืนเงิน ฿${baht(o.totalSatang)} — ระบบจะกลับรายการขาย คืนแต้ม/คูปอง และคืนสต็อกสินค้าให้อัตโนมัติ (ทำแล้วย้อนไม่ได้)`}
                  confirmLabel="ยืนยันคืนเงิน"
                  danger
                  action={refundOrderAction.bind(null, unitSlug, o.id)}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
