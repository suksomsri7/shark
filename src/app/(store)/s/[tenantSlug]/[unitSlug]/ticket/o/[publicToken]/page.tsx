import Link from "next/link";
import { cookies } from "next/headers";
import { resolveUnit, getPublicOrder, promptpayForOrder } from "@/lib/modules/ticket/service";
import { AutoRefresh } from "@/components/queue-auto-refresh";
import { PromptPayQr } from "@/components/PromptPayQr";
import { QrCode } from "@/components/qr-code";
import { getLocaleFromCookie, makeT, type Locale } from "@/lib/i18n";

export const dynamic = "force-dynamic";

// ฿ คงเดิมทั้งสองภาษา · ตัวเลข/วันที่จัดรูปตาม locale (en ใช้ en-GB)
const baht = (satang: number, locale: Locale) =>
  (satang / 100).toLocaleString(locale === "en" ? "en-GB" : "th-TH", { minimumFractionDigits: 0 });

function fmtEvent(d: Date, locale: Locale) {
  return d.toLocaleString(locale === "en" ? "en-GB" : "th-TH", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Bangkok",
  });
}

// ป้ายสถานะออเดอร์ (ลูกค้าเห็น) — คืน "คีย์" ให้หน้าเป็นคนแปล
function statusMeta(status: string) {
  if (status === "PAID") return { key: "ticket.st.PAID", tone: "done" as const };
  if (status === "CANCELLED") return { key: "ticket.st.cancelledOrder", tone: "gone" as const };
  return { key: "ticket.st.PENDING", tone: "wait" as const }; // PENDING
}

// หน้าจ่ายเงิน + ตั๋ว QR (public จาก publicToken)
//   PENDING → PromptPayQr (ยอดตั๋ว) + "สแกนจ่ายแล้วรอร้านยืนยัน" + auto-refresh
//   PAID    → ตั๋ว QR รายใบ (admission.code) + ชื่องาน/วันเวลา → เปิดโชว์ให้สแกนเข้างาน
//   CANCELLED → แจ้งยกเลิก
export default async function PublicTicketOrderPage({
  params,
}: {
  params: Promise<{ tenantSlug: string; unitSlug: string; publicToken: string }>;
}) {
  const { tenantSlug, unitSlug, publicToken } = await params;
  const base = `/s/${tenantSlug}/${unitSlug}/ticket`;
  const locale = getLocaleFromCookie((await cookies()).get("lang")?.value);
  const t = makeT(locale);

  const resolved = await resolveUnit(tenantSlug, unitSlug);
  if (!resolved) {
    return (
      <main className="mx-auto w-full max-w-md flex-1 px-5 py-16 text-center">
        <div className="text-lg font-semibold">{t("ticket.notFound.title")}</div>
        <p className="mt-2 text-sm text-[color:var(--color-muted)]">{t("ticket.notFound.desc")}</p>
      </main>
    );
  }
  const { tenant, unit } = resolved;

  // กัน cross-tenant: token ต้องเป็นของ unit นี้ (ไม่งั้น leak ตั๋ว/PII ร้านอื่น)
  const order = await getPublicOrder(unit.id, publicToken);
  if (!order) {
    return (
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center gap-4 px-5 py-16 text-center">
        <div className="text-lg font-semibold">{t("ticket.o.notFoundOrder.title")}</div>
        <p className="text-sm text-[color:var(--color-muted)]">{t("ticket.o.notFoundOrder.desc")}</p>
        <Link href={base} className="btn btn-primary min-h-[48px] w-full max-w-xs text-base">
          {t("ticket.o.buyCta")}
        </Link>
      </main>
    );
  }

  const meta = statusMeta(order.status);
  const awaitingPayment = order.status === "PENDING";
  const pp = awaitingPayment ? await promptpayForOrder(tenant.id, unit.id, order.id) : null;
  // ตั๋วที่ยังใช้ได้ (ไม่นับ VOID) — โชว์ QR เมื่อจ่ายแล้ว
  const tickets = order.admissions.filter((a) => a.status !== "VOID");

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-5 px-5 py-8">
      {awaitingPayment && <AutoRefresh ms={15000} />}

      <header className="text-center">
        <div className="text-base font-semibold">{unit.name}</div>
        <div className="text-xs text-[color:var(--color-muted)]">{tenant.name}</div>
      </header>

      {/* สรุปออเดอร์ */}
      <section className="card flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">{t("ticket.o.orderNo", { no: order.orderNo })}</span>
          <span
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              meta.tone === "wait"
                ? "bg-amber-100 text-amber-800"
                : meta.tone === "done"
                  ? "bg-green-100 text-green-800"
                  : "bg-gray-200 text-gray-700"
            }`}
          >
            {t(meta.key)}
          </span>
        </div>
        <div className="text-sm font-medium">{order.event.name}</div>
        <div className="text-xs text-[color:var(--color-muted)]">
          {fmtEvent(order.event.startAt, locale)}
          {order.event.venue ? ` · ${order.event.venue}` : ""}
        </div>
        <div className="text-xs text-[color:var(--color-muted)]">
          {order.buyerName} · {t("ticket.o.count", { n: tickets.length })}
        </div>
        <div className="mt-1 flex items-center justify-between border-t pt-2 text-sm">
          <span className="text-[color:var(--color-muted)]">{t("ticket.o.total")}</span>
          <span className="font-semibold">฿{baht(order.totalSatang, locale)}</span>
        </div>
      </section>

      {/* จ่ายเงิน (เฉพาะยังไม่จ่าย) */}
      {awaitingPayment && (
        <section className="card flex flex-col items-center gap-3">
          {pp ? (
            <>
              <div className="text-sm font-medium">{t("ticket.o.scanPay")}</div>
              <PromptPayQr payload={pp.payload} caption={`฿${baht(order.totalSatang, locale)}`} />
              {pp.displayName && (
                <div className="text-xs text-[color:var(--color-muted)]">{pp.displayName}</div>
              )}
              <p className="text-center text-sm text-[color:var(--color-muted)]">
                {t("ticket.o.afterScan")}
              </p>
            </>
          ) : (
            <p className="text-center text-sm text-[color:var(--color-muted)]">
              {t("ticket.o.noPromptpay")}
            </p>
          )}
        </section>
      )}

      {/* ตั๋ว QR (เฉพาะจ่ายแล้ว) */}
      {order.status === "PAID" && (
        <section className="flex flex-col gap-3">
          <p className="text-center text-sm text-green-700">
            {t("ticket.o.paidShowQr")}
          </p>
          {tickets.map((a, i) => (
            <div key={a.id} className="card flex flex-col items-center gap-2">
              <div className="text-sm font-medium">
                {t("ticket.o.ticketNo", { n: i + 1 })} · {a.ticketType.name}
              </div>
              <QrCode value={a.code} caption={a.code} />
              {a.status === "CHECKED_IN" && (
                <span className="rounded-full bg-gray-200 px-3 py-1 text-xs font-medium text-gray-700">
                  {t("ticket.o.checkedIn")}
                </span>
              )}
            </div>
          ))}
        </section>
      )}

      {order.status === "CANCELLED" && (
        <p className="text-center text-sm text-[color:var(--color-muted)]">
          {t("ticket.o.cancelled")}
        </p>
      )}

      <div className="text-center">
        <Link href={base} className="text-sm underline">
          {t("ticket.o.back")}
        </Link>
      </div>
    </main>
  );
}
