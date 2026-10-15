// /q/t/<qrToken> — table QR on the POS door (POS P2.7 S · ruling 1 6 11 · CD7). Minimal server-rendered page; the P2.7U card restyles it.
// Public: no session, noindex, force-dynamic. Reading never opens a table session (the legacy page did on every view/poll).
// Ordering works without client JavaScript: one form per item (qty + options) posts to a server action that redirects back with ?e=<messageKey>.
// No locale-dependent date/number output in SSR — times are ISO strings, money via qrMoney.

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PromptPayQr } from "@/components/PromptPayQr";
import { tableBill, tableDoor } from "@/lib/modules/pos/qr-order";
import { isTableQrToken } from "@/lib/modules/pos/qr-order-shared";
import { tableRequestFormAction, tableRoundFormAction } from "../../actions";
import { qrLocale, qrMoney, qrT } from "../../qr-i18n";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function QrTablePage({ params, searchParams }: { params: Promise<{ qrToken: string }>; searchParams: Promise<{ lang?: string; e?: string }> }) {
  const { qrToken } = await params;
  if (!isTableQrToken(qrToken)) notFound();
  const { lang, e } = await searchParams;
  const locale = await qrLocale(lang);
  const t = qrT(locale);
  const door = await tableDoor(qrToken);
  if (!door.ok) {
    return (
      <main className="mx-auto w-full max-w-md px-4 py-16 text-center" data-testid="qr-table-invalid">
        <p className="text-base text-[color:var(--color-danger)]">{t(door.messageKey)}</p>
      </main>
    );
  }
  const v = door.view;
  const billRes = v.session ? await tableBill(qrToken) : null;
  const bill = billRes && billRes.ok ? billRes.bill : null;
  const roundAction = tableRoundFormAction.bind(null, qrToken);
  const requestAction = tableRequestFormAction.bind(null, qrToken);
  const notice = typeof e === "string" && /^qr\.[a-zA-Z.]+$/.test(e) ? t(e) : null;
  const other = locale === "th" ? "en" : "th";
  return (
    <main className="mx-auto w-full max-w-md px-4 py-6" data-testid="qr-table" data-ver={v.ver}>
      <header className="mb-4 flex items-center justify-between gap-3">
        <div>
          <div className="text-xs font-semibold tracking-widest text-[color:var(--color-muted)]">{v.unit.name}</div>
          <h1 className="text-xl font-semibold">{t("table.title", { table: v.table.name })}</h1>
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
      {!v.open ? (
        <p className="mb-4 rounded-md border px-3 py-2 text-sm" data-testid="qr-closed">
          {t("closed.banner")} · {t(`closed.${v.closedReason ?? "CHANNEL_OFF"}`)}
        </p>
      ) : null}
      {v.serviceChargeBp > 0 ? <p className="mb-2 text-xs text-[color:var(--color-muted)]">{t("table.serviceChargeNote", { rate: v.serviceChargeBp / 100 })}</p> : null}

      <section className="mb-6" data-testid="qr-menu">
        <h2 className="mb-2 font-semibold">{t("table.menu")}</h2>
        <ul className="flex flex-col gap-3">
          {v.menu.map((m) => (
            <li key={m.productId} className="rounded-md border p-3" data-testid="qr-menu-item">
              <form action={roundAction} className="flex flex-col gap-2">
                <input type="hidden" name="sessionId" value={v.session?.id ?? ""} />
                <input type="hidden" name="lang" value={locale} />
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{locale === "en" && m.nameEn ? m.nameEn : m.name}</span>
                  <span>{m.available ? t("common.baht", { amount: qrMoney(m.priceSatang) }) : t("item.soldOut")}</span>
                </div>
                {m.optionGroups.map((g) => (
                  <fieldset key={g.groupId} className="text-sm">
                    <legend>
                      {locale === "en" && g.nameEn ? g.nameEn : g.name} · {g.minSelect > 0 ? t("item.required", { min: g.minSelect }) : t("item.optional", { max: g.maxSelect })}
                    </legend>
                    {g.choices.map((c) => (
                      <label key={c.choiceId} className="mr-3 inline-flex min-h-11 items-center gap-1">
                        <input type={g.maxSelect === 1 ? "radio" : "checkbox"} name={`o:${m.productId}`} value={c.choiceId} disabled={!c.available} />
                        {locale === "en" && c.nameEn ? c.nameEn : c.name}
                        {c.priceDeltaSatang ? ` +${qrMoney(c.priceDeltaSatang)}` : ""}
                      </label>
                    ))}
                  </fieldset>
                ))}
                {v.open && m.available ? (
                  <div className="flex items-center gap-2">
                    <input aria-label={t("common.qty")} className="min-h-11 w-20 rounded-md border px-2" type="number" name={`q:${m.productId}`} min={1} max={50} defaultValue={1} />
                    <button className="min-h-11 flex-1 rounded-md border px-3 font-medium" type="submit">
                      {t("table.send")}
                    </button>
                  </div>
                ) : null}
              </form>
            </li>
          ))}
        </ul>
      </section>

      <section className="mb-6" data-testid="qr-rounds">
        <h2 className="mb-2 font-semibold">{t("table.rounds")}</h2>
        {v.session && v.session.rounds.length ? (
          <ul className="flex flex-col gap-2 text-sm">
            {v.session.rounds.map((r) => (
              <li key={r.id} className="rounded-md border p-2">
                <div className="font-medium">{t("table.roundNo", { no: r.no })}</div>
                {r.items.map((it, i) => (
                  <div key={i} className="flex justify-between gap-2">
                    <span>
                      {it.qty} × {it.name}
                      {it.options.length ? ` (${it.options.join(", ")})` : ""}
                    </span>
                    <span>{t(`kitchen.${it.status}`)}</span>
                  </div>
                ))}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-[color:var(--color-muted)]">{t("table.empty")}</p>
        )}
      </section>

      <section className="mb-6 flex gap-2">
        {(["CALL_STAFF", "REQUEST_BILL"] as const).map((k) => (
          <form key={k} action={requestAction} className="flex-1">
            <input type="hidden" name="kind" value={k} />
            <input type="hidden" name="lang" value={locale} />
            <button className="min-h-11 w-full rounded-md border px-3" type="submit">
              {t(k === "CALL_STAFF" ? "table.callStaff" : "table.requestBill")}
            </button>
          </form>
        ))}
      </section>

      {bill && bill.lines.length ? (
        <section className="mb-6" data-testid="qr-bill">
          <h2 className="mb-2 font-semibold">{t("table.bill")}</h2>
          <ul className="text-sm">
            {bill.lines.map((l, i) => (
              <li key={i} className="flex justify-between gap-2">
                <span>
                  {l.qty} × {l.name}
                  {l.options.length ? ` (${l.options.join(", ")})` : ""}
                </span>
                <span>{qrMoney(l.amountSatang)}</span>
              </li>
            ))}
          </ul>
          <div className="mt-2 flex justify-between text-sm">
            <span>{t("common.serviceCharge")}</span>
            <span>{qrMoney(bill.serviceChargeSatang)}</span>
          </div>
          <div className="flex justify-between font-semibold">
            <span>{t("common.total")}</span>
            <span>{t("common.baht", { amount: qrMoney(bill.totalSatang) })}</span>
          </div>
          {bill.payHidden ? (
            <p className="mt-2 text-sm">{t("table.payHidden")}</p>
          ) : bill.promptpayPayload ? (
            <div className="mt-3 flex flex-col items-center gap-2">
              <p className="text-sm">{t("table.payPromptpay")}</p>
              <PromptPayQr payload={bill.promptpayPayload} />
              <form action={requestAction} className="w-full">
                <input type="hidden" name="kind" value="PAY_PROMPTPAY" />
                <input type="hidden" name="lang" value={locale} />
                <button className="min-h-11 w-full rounded-md border px-3 font-medium" type="submit">
                  {t("table.notifyPaid")}
                </button>
              </form>
            </div>
          ) : null}
        </section>
      ) : null}
    </main>
  );
}
