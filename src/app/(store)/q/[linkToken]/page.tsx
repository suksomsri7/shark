// /q/<linkToken> — pre-order, pay first (POS P2.7 S · §1 b · ruling 3 4 11). Minimal server-rendered page; the P2.7U card restyles it.
// Public: no session, noindex, force-dynamic. One form: qty + options per item, pickup name + Thai phone (PDPA notice), note.
// The form carries a fresh idempotency key per render (a resubmit of the same page = the same order). Submit -> /q/o/<orderToken>.

import type { Metadata } from "next";
import { randomUUID } from "node:crypto";
import { notFound } from "next/navigation";
import { linkDoor } from "@/lib/modules/pos/qr-order";
import { isLinkToken, QR_NAME_MAX, QR_NOTE_MAX } from "@/lib/modules/pos/qr-order-shared";
import { preorderFormAction } from "../actions";
import { qrLocale, qrMoney, qrT } from "../qr-i18n";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function QrPreorderPage({ params, searchParams }: { params: Promise<{ linkToken: string }>; searchParams: Promise<{ lang?: string; e?: string }> }) {
  const { linkToken } = await params;
  if (!isLinkToken(linkToken)) notFound();
  const { lang, e } = await searchParams;
  const locale = await qrLocale(lang);
  const t = qrT(locale);
  const door = await linkDoor(linkToken);
  if (!door.ok) {
    return (
      <main className="mx-auto w-full max-w-md px-4 py-16 text-center" data-testid="qr-link-invalid">
        <p className="text-base text-[color:var(--color-danger)]">{t(door.messageKey)}</p>
      </main>
    );
  }
  const v = door.view;
  const action = preorderFormAction.bind(null, linkToken);
  const notice = typeof e === "string" && /^qr\.[a-zA-Z.]+$/.test(e) ? t(e) : null;
  const other = locale === "th" ? "en" : "th";
  return (
    <main className="mx-auto w-full max-w-md px-4 py-6" data-testid="qr-preorder">
      <header className="mb-4 flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">{t("preorder.title", { unit: v.unit.name })}</h1>
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
      <p className="mb-4 text-sm text-[color:var(--color-muted)]">
        {t("preorder.pickupOnly")} · {t("preorder.prepNote", { min: v.prepMinutes })}
      </p>
      <form action={action} className="flex flex-col gap-4">
        <input type="hidden" name="key" value={`qrp-${randomUUID()}`} />
        <input type="hidden" name="lang" value={locale} />
        <ul className="flex flex-col gap-3" data-testid="qr-menu">
          {v.menu.map((m) => (
            <li key={m.productId} className="rounded-md border p-3" data-testid="qr-menu-item">
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
                <input aria-label={t("common.qty")} className="mt-2 min-h-11 w-20 rounded-md border px-2" type="number" name={`q:${m.productId}`} min={0} max={50} defaultValue={0} />
              ) : null}
            </li>
          ))}
        </ul>
        {v.open ? (
          <fieldset className="flex flex-col gap-2" data-testid="qr-checkout">
            <legend className="font-semibold">{t("preorder.checkout")}</legend>
            <label className="flex flex-col gap-1 text-sm">
              {t("preorder.name")}
              <input className="min-h-11 rounded-md border px-2" name="name" required maxLength={QR_NAME_MAX} autoComplete="name" />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              {t("preorder.phone")}
              <input className="min-h-11 rounded-md border px-2" name="phone" required inputMode="tel" autoComplete="tel" />
            </label>
            <p className="text-xs text-[color:var(--color-muted)]">{t("preorder.pdpa")}</p>
            <label className="flex flex-col gap-1 text-sm">
              {t("common.note")}
              <textarea className="rounded-md border px-2" name="note" maxLength={QR_NOTE_MAX} rows={2} />
            </label>
            <button className="min-h-11 rounded-md border px-3 font-semibold" type="submit">
              {t("preorder.place")}
            </button>
          </fieldset>
        ) : null}
      </form>
    </main>
  );
}
