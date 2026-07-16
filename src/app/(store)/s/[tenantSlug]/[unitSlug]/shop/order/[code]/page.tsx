import { notFound } from "next/navigation";
import Link from "next/link";
import { resolveUnit, getOrderByCode, promptpayForOrder } from "@/lib/modules/shop/service";
import { PromptPayQr } from "@/components/PromptPayQr";

const baht = (satang: number) => (satang / 100).toLocaleString("th-TH", { minimumFractionDigits: 0 });

const STATUS: Record<string, { label: string; cls: string }> = {
  PENDING_PAYMENT: { label: "รอชำระเงิน", cls: "bg-amber-100 text-amber-800" },
  PAID: { label: "ชำระเงินแล้ว", cls: "bg-green-100 text-green-800" },
  CANCELLED: { label: "ยกเลิกแล้ว", cls: "bg-gray-200 text-gray-700" },
};

// หน้าสถานะออเดอร์ + QR PromptPay — /s/[tenantSlug]/[unitSlug]/shop/order/[code]
export default async function StoreShopOrderPage({
  params,
}: {
  params: Promise<{ tenantSlug: string; unitSlug: string; code: string }>;
}) {
  const { tenantSlug, unitSlug, code } = await params;
  const resolved = await resolveUnit(tenantSlug, unitSlug);
  if (!resolved) notFound();
  const ctx = { tenantId: resolved.tenant.id, unitId: resolved.unit.id };
  const order = await getOrderByCode(ctx, code);
  if (!order) notFound();

  const pp = order.status === "PENDING_PAYMENT" ? await promptpayForOrder(ctx, order.id) : null;
  const st = STATUS[order.status] ?? STATUS.PENDING_PAYMENT;

  return (
    <main className="mx-auto w-full max-w-md flex-1 px-5 py-8">
      <div className="mb-5">
        <div className="text-xs font-semibold tracking-widest text-[color:var(--color-muted)]">
          {resolved.tenant.name}
        </div>
        <h1 className="text-2xl font-semibold">คำสั่งซื้อ {order.code}</h1>
        <span className={`mt-2 inline-block rounded-full px-3 py-1 text-xs font-medium ${st.cls}`}>{st.label}</span>
      </div>

      {/* สรุปรายการ */}
      <div className="card mb-4 flex flex-col gap-2">
        {order.lines.map((l) => (
          <div key={l.id} className="flex items-center justify-between text-sm">
            <span className="min-w-0 truncate">
              {l.name} × {l.qty}
            </span>
            <span className="shrink-0">฿{baht(l.lineTotalSatang)}</span>
          </div>
        ))}
        <div className="mt-1 flex items-center justify-between border-t pt-2 font-semibold">
          <span>ยอดรวม</span>
          <span>฿{baht(order.totalSatang)}</span>
        </div>
      </div>

      {/* QR PromptPay (เฉพาะยังไม่ชำระ) */}
      {order.status === "PENDING_PAYMENT" && (
        <div className="card flex flex-col items-center gap-3">
          {pp ? (
            <>
              <div className="text-sm font-medium">สแกนจ่ายด้วย PromptPay</div>
              <PromptPayQr payload={pp.payload} caption={`฿${baht(order.totalSatang)}`} />
              {pp.displayName && (
                <div className="text-xs text-[color:var(--color-muted)]">{pp.displayName}</div>
              )}
              <p className="text-center text-sm text-[color:var(--color-muted)]">
                โอนแล้วแจ้งร้านได้เลย ร้านจะยืนยันในระบบ
              </p>
            </>
          ) : (
            <p className="text-center text-sm text-[color:var(--color-muted)]">
              ร้านยังไม่ได้ตั้งค่า PromptPay — กรุณาติดต่อร้านเพื่อชำระเงิน
            </p>
          )}
        </div>
      )}

      {order.status === "PAID" && (
        <p className="text-center text-sm text-green-700">รับชำระเงินเรียบร้อยแล้ว ขอบคุณค่ะ 🎉</p>
      )}
      {order.status === "CANCELLED" && (
        <p className="text-center text-sm text-[color:var(--color-muted)]">ออเดอร์นี้ถูกยกเลิกแล้ว</p>
      )}

      <div className="mt-6 text-center">
        <Link href={`/s/${tenantSlug}/${unitSlug}/shop`} className="text-sm underline">
          ← กลับไปเลือกสินค้าเพิ่ม
        </Link>
      </div>
    </main>
  );
}
