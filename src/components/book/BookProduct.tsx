// components/book/BookProduct.tsx — หน้าสินค้าทัวร์ `/book/[shop]/t/[productSlug]` (ภาพ 19 จอใหญ่ · ภาพ 01ก มือถือ) · RUN TRIPS W1.1a
// แสดงผลเท่านั้น (อ่านอย่างเดียว): ปฏิทินที่ว่างจริง · วันที่เลือก · ตารางราคาต่อหน่วย · เนื้อหาร้าน — ยังไม่ถือที่/ไม่จอง ⇒ ปุ่มหลักปิดไว้
// จอใหญ่ (xl ขึ้นไป) = สองคอลัมน์ + แผงสรุปติดจอ 430 · เล็กกว่านั้น = คอลัมน์เดียว + แถบล่างติดจอ · ไม่มีตรรกะธุรกิจ/นาฬิกา/การคิดเงินในไฟล์นี้
import { formatYmd } from "@/components/trips/trips-shared";
import { bookHref, type BookCarry, type BookProductVM } from "@/lib/platform/trips-public-core";
import { BookCalendar } from "./BookCalendar";
import { BookSection, BookUntranslated } from "./BookContent";
import { BookCancel, BookPrices, bookMoney } from "./BookPrices";
import { BookShell } from "./BookShell";
import { bookDateNames, bookGmtOffset, bookT } from "./book-i18n";

const CTA = "inline-flex min-h-12 items-center justify-center rounded-xl bg-[color:var(--color-accent)] px-5 text-base font-semibold text-[color:var(--color-accent-fg)] disabled:cursor-not-allowed disabled:opacity-50";
const BADGE = "inline-flex w-fit items-center rounded-lg border px-2.5 py-1 text-sm font-medium group-data-[state=LOW]:border-dashed group-data-[state=LOW]:border-[color:var(--color-danger)] group-data-[state=LOW]:text-[color:var(--color-danger)]";

export function BookProduct({ vm, carry }: { vm: BookProductVM; carry: BookCarry }) {
  const t = bookT(vm.locale);
  const names = bookDateNames(vm.locale);
  const shop = vm.shop.slug;
  const slug = vm.product.slug;
  const sel = vm.selected;
  const first = sel?.slots[0] ?? null;
  const price = sel?.price ?? null;
  const view = { a: carry.a, m: vm.month, d: sel?.date ?? null };
  /** "YYYY-MM-DD HH:MM" (เวลาร้านจาก VM) ⇒ วันแบบอ่านง่าย + เวลา */
  const closeText = (cutoffLocal: string): string => {
    const [ymd, hm] = cutoffLocal.split(" ");
    return `${formatYmd(ymd ?? "", names)} ${hm ?? ""}`.trim();
  };

  return (
    <BookShell
      brand={vm.shop}
      locale={vm.locale}
      homeHref={bookHref(shop, null, { lang: carry.lang, a: carry.a })}
      langHrefs={{ th: bookHref(shop, slug, { ...view, lang: "th" }), en: bookHref(shop, slug, { ...view, lang: "en" }) }}
      bottomBar
    >
      <article data-testid="book-product" className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_430px] xl:gap-10">
        <div className="flex min-w-0 flex-col gap-5">
          <header className="flex flex-col gap-2">
            <h1 data-testid="book-title" lang={vm.product.title.fallback ? "th" : vm.locale} className="break-words text-2xl font-semibold lg:text-3xl">
              {vm.product.title.text}
            </h1>
            {vm.product.title.fallback ? <BookUntranslated locale={vm.locale} /> : null}
            {first ? (
              <p data-testid="book-meta" className="flex flex-wrap gap-x-3 gap-y-1 text-base text-[color:var(--color-ink-soft)]">
                <span>{first.timeText}</span>
                {first.optionName.text ? <span>{first.optionName.text}</span> : null}
                <span>{t("product.capacity", { n: first.capacity })}</span>
              </p>
            ) : null}
            {vm.product.summary.text ? (
              <p lang={vm.product.summary.fallback ? "th" : vm.locale} className="whitespace-pre-line break-words text-base text-[color:var(--color-ink-soft)]">
                {vm.product.summary.text}
              </p>
            ) : null}
          </header>

          {vm.requestedUnavailable ? (
            <p data-testid="book-requested-unavailable" role="status" className="rounded-xl border border-[color:var(--color-danger)] bg-[color:var(--color-surface)] px-4 py-3 text-sm text-[color:var(--color-danger)]">
              {t("unavailable.requested")}
            </p>
          ) : null}

          <BookCalendar vm={vm} carry={carry} />
          {sel ? <BookPrices price={price} locale={vm.locale} /> : null}
          <BookSection testId="book-itinerary" title={t("product.itinerary")} value={vm.product.itinerary} locale={vm.locale} />
          <BookSection testId="book-includes" title={t("product.includes")} value={vm.product.includes} locale={vm.locale} />
          <BookSection testId="book-meeting" title={t("product.meeting")} value={vm.product.meeting} locale={vm.locale} />
        </div>

        <aside className="min-w-0 xl:sticky xl:top-6 xl:self-start">
          <div data-testid="book-selected" className="flex flex-col gap-4 rounded-2xl border bg-[color:var(--color-surface)] p-5">
            <h2 className="text-lg font-semibold">{t("product.summary")}</h2>
            {sel ? (
              <div className="flex flex-col gap-3">
                <p data-testid="book-selected-date" className="text-xl font-semibold">
                  {formatYmd(sel.date, names)}
                </p>
                <ul className="flex flex-col gap-3">
                  {sel.slots.map((s, i) => (
                    <li key={i} data-testid={`book-slot-${i}`} data-state={s.state} className="group flex flex-col gap-1.5 rounded-xl border p-3">
                      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                        <span className="text-base font-semibold">{s.timeText}</span>
                        <span className={BADGE}>{t(`slotState.${s.state}`, { n: s.left ?? 0 })}</span>
                      </div>
                      <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm text-[color:var(--color-ink-soft)]">
                        {s.optionName.text ? <span>{s.optionName.text}</span> : null}
                        <span>{t("product.capacity", { n: s.capacity })}</span>
                      </div>
                      {s.guaranteed ? <div className="text-sm font-medium">{t("slot.guaranteed")}</div> : null}
                      <div className="text-sm text-[color:var(--color-ink-soft)]">{t("slot.closesAt", { at: closeText(s.cutoffLocal) })}</div>
                    </li>
                  ))}
                </ul>
                {price?.headline ? (
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-t pt-3">
                    <span className="text-sm text-[color:var(--color-ink-soft)]">{t("price.from")}</span>
                    <span className="text-xl font-semibold tabular-nums">{bookMoney(t, price.headline.unitSatang)}</span>
                  </div>
                ) : null}
              </div>
            ) : (
              <p className="text-base text-[color:var(--color-ink-soft)]">{t("product.noDates")}</p>
            )}
            <button data-testid="book-cta" type="button" disabled className={`${CTA} w-full`}>
              {t("cta.continue")}
            </button>
            <p data-testid="book-cta-note" className="text-sm text-[color:var(--color-ink-soft)]">
              {t("cta.notYet")}
            </p>
            {price ? (
              <div className="border-t pt-4">
                <BookCancel ladder={price.cancelLadder} locale={vm.locale} />
              </div>
            ) : null}
            <p data-testid="book-tz-note" className="break-words border-t pt-4 text-sm text-[color:var(--color-muted)]">
              {t("tz.note", { zone: vm.tz.name, offset: bookGmtOffset(vm.tz.offsetMin) })}
            </p>
          </div>
        </aside>
      </article>

      {/* แถบล่างติดจอ (จอเล็กกว่า xl): ราคาเริ่มต้นต่อคน + ปุ่มหลัก (ยังปิด) — เปลือกเว้นท้ายหน้าไว้แล้ว ไม่บังเนื้อหา */}
      <div data-testid="book-bottom-bar" className="fixed inset-x-0 bottom-0 z-10 border-t bg-[color:var(--color-surface)] px-4 py-3 xl:hidden">
        <div className="mx-auto flex w-full max-w-[1360px] items-center justify-between gap-3">
          <div className="min-w-0">
            {price?.headline ? (
              <div className="flex flex-col">
                <span className="text-sm text-[color:var(--color-ink-soft)]">{t("price.from")}</span>
                <span className="text-lg font-semibold tabular-nums">{bookMoney(t, price.headline.unitSatang)}</span>
              </div>
            ) : (
              <span className="text-sm text-[color:var(--color-ink-soft)]">{t("cta.notYet")}</span>
            )}
          </div>
          <button type="button" disabled className={`${CTA} shrink-0`}>
            {t("cta.continue")}
          </button>
        </div>
      </div>
    </BookShell>
  );
}
