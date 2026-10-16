// /q/o/<orderToken> — order status of a pre-order (POS P2.7 S · §1 c · ruling 3 4 11). Minimal server-rendered page; the P2.7U card restyles it
// (client poll with sinceVer + Page Visibility pause + countdown). Here: a plain 5 s meta refresh while the order is open; the read writes nothing
// except the one-time expiry when payBy has passed (S2). Times are ISO strings (no locale formatting in SSR).

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PromptPayQr } from "@/components/PromptPayQr";
import { orderStatus } from "@/lib/modules/pos/qr-order";
import { isOrderToken, QR_STATUS_POLL_MS } from "@/lib/modules/pos/qr-order-shared";
import { claimPaidFormAction } from "../../actions";
import { qrLocale, qrMoney, qrT } from "../../qr-i18n";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { robots: { index: false, follow: false } };

const STATUS_KEY: Record<string, string> = {
  ACCEPTED: "status.accepted",
  PREPARING: "status.preparing",
  READY: "status.ready",
  HANDED: "status.handed",
  REJECTED: "status.rejected",
  CANCELLED: "status.cancelled",
};

export default async function QrOrderStatusPage({ params, searchParams }: { params: Promise<{ orderToken: string }>; searchParams: Promise<{ lang?: string; e?: string }> }) {
  const { orderToken } = await params;
  if (!isOrderToken(orderToken)) notFound();
  const { lang, e } = await searchParams;
  const locale = await qrLocale(lang);
  const t = qrT(locale);
  const r = await orderStatus(orderToken, {});
  if (!r.ok) {
    return (
      <main className="mx-auto w-full max-w-md px-4 py-16 text-center" data-testid="qr-order-invalid">
        <p className="text-base text-[color:var(--color-danger)]">{t(r.messageKey)}</p>
      </main>
    );
  }
  if (!r.changed) notFound();
  const v = r.view;
  const pending = v.status === "NEW" && v.paymentState === "PENDING_PAYMENT";
  const open = v.status !== "HANDED" && v.status !== "REJECTED" && v.status !== "CANCELLED";
  const claim = claimPaidFormAction.bind(null, orderToken);
  const notice = typeof e === "string" && /^qr\.[a-zA-Z.]+$/.test(e) ? t(e) : null;
  const other = locale === "th" ? "en" : "th";
  const headline =
    v.closedReason === "PAYMENT_EXPIRED"
      ? t("status.expired")
      : pending
        ? v.claimedAt
          ? t("status.claimed")
          : t("status.pay")
        : v.status === "NEW"
          ? t("status.paid")
          : t(STATUS_KEY[v.status] ?? "status.accepted");
  return (
    <main className="mx-auto w-full max-w-md px-4 py-6" data-testid="qr-order" data-ver={r.ver} data-status={v.status} data-payment={v.paymentState}>
      {open ? <meta httpEquiv="refresh" content={String(QR_STATUS_POLL_MS / 1000)} /> : null}
      <header className="mb-4 flex items-center justify-between gap-3">
        <div>
          <div className="text-xs font-semibold tracking-widest text-[color:var(--color-muted)]">{v.unit.name}</div>
          <h1 className="text-xl font-semibold">{t("status.title", { code: v.code })}</h1>
        </div>
        <a className="text-sm underline" href={`?lang=${other}`}>
          {t(`common.${other}`)}
        </a>
      </header>
      {notice ? (
        <p className="mb-4 rounded-md border px-3 py-2 text-sm" data-testid="qr-notice">
          {notice}
        </p>
      ) : null}
      <p className="mb-4 text-lg font-semibold" data-testid="qr-order-headline">
        {headline}
      </p>
      {pending && v.pay ? (
        <section className="mb-6 flex flex-col items-center gap-2" data-testid="qr-order-pay">
          <div className="text-sm">{t("status.payAmount")}</div>
          <div className="text-2xl font-semibold">{t("common.baht", { amount: qrMoney(v.pay.amountSatang) })}</div>
          <PromptPayQr payload={v.pay.qrPayload} />
          <div className="text-sm">
            {t("status.payBy")} <time dateTime={v.pay.expiresAt}>{v.pay.expiresAt}</time>
          </div>
          {v.pay.kind === "PROMPTPAY_STATIC" && !v.claimedAt ? (
            <form action={claim} className="w-full">
              <input type="hidden" name="lang" value={locale} />
              <button className="min-h-11 w-full rounded-md border px-3 font-medium" type="submit">
                {t("status.claim")}
              </button>
            </form>
          ) : null}
        </section>
      ) : null}
      {v.readyEta && open ? (
        <p className="mb-4 text-sm">
          {t("status.readyEta")} <time dateTime={v.readyEta}>{v.readyEta}</time>
        </p>
      ) : null}
      {v.refundPending ? <p className="mb-4 text-sm">{t("status.refund")}</p> : null}
      {v.receiptToken ? (
        <p className="mb-4">
          <a className="underline" href={`/r/${v.receiptToken}?lang=${locale}`}>
            {t("status.receipt")}
          </a>
        </p>
      ) : null}
      <section data-testid="qr-order-lines">
        <h2 className="mb-2 font-semibold">{t("status.items")}</h2>
        <ul className="text-sm">
          {v.lines.map((l, i) => (
            <li key={i} className="flex justify-between gap-2">
              <span>
                {l.qty} × {l.name}
                {l.options.length ? ` (${l.options.join(", ")})` : ""}
              </span>
              <span>{qrMoney(l.lineTotalSatang)}</span>
            </li>
          ))}
        </ul>
        <div className="mt-2 flex justify-between font-semibold">
          <span>{t("common.total")}</span>
          <span>{t("common.baht", { amount: qrMoney(v.totalSatang) })}</span>
        </div>
        {v.phoneMasked ? (
          <p className="mt-2 text-xs text-[color:var(--color-muted)]">
            {t("status.phone")} {v.phoneMasked}
          </p>
        ) : null}
      </section>
    </main>
  );
}
