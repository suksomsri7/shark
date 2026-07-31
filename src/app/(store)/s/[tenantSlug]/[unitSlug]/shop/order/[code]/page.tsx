import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import Link from "next/link";
import { resolveUnit, getOrderByCode, promptpayForOrder } from "@/lib/modules/shop/service";
import { getShipmentForOrder } from "@/lib/delivery/service";
import { ADAPTERS } from "@/lib/delivery/adapters";
import { PromptPayQr } from "@/components/PromptPayQr";
import { getLocaleFromCookie, makeT, type Locale } from "@/lib/i18n";

// ฿ คงเดิมทั้งสองภาษา · ตัวเลขจัดกลุ่มตาม locale (en ใช้ en-GB)
const baht = (satang: number, locale: Locale) =>
  (satang / 100).toLocaleString(locale === "en" ? "en-GB" : "th-TH", { minimumFractionDigits: 0 });

// สีของสถานะเท่านั้น — ป้ายข้อความอยู่ dict (shop.status.* / shop.ship.*) เพื่อให้แปลได้
const STATUS_CLS: Record<string, string> = {
  PENDING_PAYMENT: "bg-amber-100 text-amber-800",
  PAID: "bg-green-100 text-green-800",
  CANCELLED: "bg-gray-200 text-gray-700",
  REFUNDED: "bg-rose-100 text-rose-800",
};

const SHIP_CLS: Record<string, string> = {
  PREPARING: "bg-amber-100 text-amber-800",
  SHIPPED: "bg-blue-100 text-blue-800",
  DELIVERED: "bg-green-100 text-green-800",
  CANCELLED: "bg-gray-200 text-gray-700",
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
  const stCls = STATUS_CLS[order.status] ?? STATUS_CLS.PENDING_PAYMENT;
  const shipment = order.status === "PAID" ? await getShipmentForOrder(ctx, order.id) : null;

  const locale = getLocaleFromCookie((await cookies()).get("lang")?.value);
  const t = makeT(locale);
  const stLabel = t(`shop.status.${order.status}`);

  return (
    <main className="mx-auto w-full max-w-md flex-1 px-5 py-8">
      <div className="mb-5">
        <div className="text-xs font-semibold tracking-widest text-[color:var(--color-muted)]">
          {resolved.tenant.name}
        </div>
        <h1 className="text-2xl font-semibold">{t("shop.order.title", { code: order.code })}</h1>
        <span className={`mt-2 inline-block rounded-full px-3 py-1 text-xs font-medium ${stCls}`}>{stLabel}</span>
      </div>

      {/* สรุปรายการ */}
      <div className="card mb-4 flex flex-col gap-2">
        {order.lines.map((l) => (
          <div key={l.id} className="flex items-center justify-between text-sm">
            <span className="min-w-0 truncate">
              {l.name} × {l.qty}
            </span>
            <span className="shrink-0">฿{baht(l.lineTotalSatang, locale)}</span>
          </div>
        ))}
        <div className="mt-1 flex items-center justify-between border-t pt-2 font-semibold">
          <span>{t("shop.order.total")}</span>
          <span>฿{baht(order.totalSatang, locale)}</span>
        </div>
      </div>

      {/* QR PromptPay (เฉพาะยังไม่ชำระ) */}
      {order.status === "PENDING_PAYMENT" && (
        <div className="card flex flex-col items-center gap-3">
          {pp ? (
            <>
              <div className="text-sm font-medium">{t("shop.order.scanPay")}</div>
              <PromptPayQr payload={pp.payload} caption={`฿${baht(order.totalSatang, locale)}`} />
              {pp.displayName && (
                <div className="text-xs text-[color:var(--color-muted)]">{pp.displayName}</div>
              )}
              <p className="text-center text-sm text-[color:var(--color-muted)]">
                {t("shop.order.afterPay")}
              </p>
            </>
          ) : (
            <p className="text-center text-sm text-[color:var(--color-muted)]">
              {t("shop.order.noPromptpay")}
            </p>
          )}
        </div>
      )}

      {order.status === "PAID" && (
        <p className="text-center text-sm text-green-700">{t("shop.order.paid")}</p>
      )}

      {/* การจัดส่ง — เมื่อร้านสร้างใบจัดส่งแล้ว */}
      {shipment && (
        <div className="card mt-4 flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">{t("shop.order.shipping")}</span>
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                SHIP_CLS[shipment.status] ?? SHIP_CLS.PREPARING
              }`}
            >
              {t(`shop.ship.${shipment.status}`)}
            </span>
          </div>
          <div className="text-sm text-[color:var(--color-muted)]">
            {ADAPTERS[shipment.provider]?.label ?? shipment.provider}
          </div>
          {shipment.trackingNo && (
            <div className="text-sm">
              {t("shop.order.tracking")}: <span className="font-medium">{shipment.trackingNo}</span>
            </div>
          )}
        </div>
      )}
      {order.status === "CANCELLED" && (
        <p className="text-center text-sm text-[color:var(--color-muted)]">{t("shop.order.cancelled")}</p>
      )}
      {order.status === "REFUNDED" && (
        <p className="text-center text-sm text-[color:var(--color-muted)]">{t("shop.order.refunded")}</p>
      )}

      <div className="mt-6 text-center">
        <Link href={`/s/${tenantSlug}/${unitSlug}/shop`} className="text-sm underline">
          {t("shop.order.back")}
        </Link>
      </div>
    </main>
  );
}
