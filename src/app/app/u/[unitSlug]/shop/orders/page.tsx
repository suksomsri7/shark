import Link from "next/link";
import { requireUnit } from "@/lib/core/context";
import { listOrders } from "@/lib/modules/shop/service";
import { confirmOrderAction, cancelOrderAction } from "@/lib/modules/shop/actions";

const baht = (satang: number) => (satang / 100).toLocaleString("th-TH", { minimumFractionDigits: 0 });

const STATUS: Record<string, { label: string; cls: string }> = {
  PENDING_PAYMENT: { label: "รอชำระ", cls: "bg-amber-100 text-amber-800" },
  PAID: { label: "รับเงินแล้ว", cls: "bg-green-100 text-green-800" },
  CANCELLED: { label: "ยกเลิก", cls: "bg-gray-200 text-gray-700" },
};

// รายการออเดอร์ + ยืนยันรับเงิน / ยกเลิก — /app/u/[unitSlug]/shop/orders
export default async function ShopOrdersPage({
  params,
}: {
  params: Promise<{ unitSlug: string }>;
}) {
  const { unitSlug } = await params;
  const { auth, unit } = await requireUnit(unitSlug);
  const orders = await listOrders({ tenantId: auth.active.tenantId, unitId: unit.id }, {});

  return (
    <div className="flex max-w-2xl flex-col gap-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">ออเดอร์</h1>
        <Link href={`/app/u/${unitSlug}/shop`} className="btn btn-ghost text-sm">
          ← จัดการสินค้า
        </Link>
      </div>

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
          </div>
        );
      })}
    </div>
  );
}
