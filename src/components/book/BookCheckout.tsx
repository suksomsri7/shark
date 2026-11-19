// components/book/BookCheckout.tsx — หน้ายืนยัน: ผู้จอง + สรุปราคา + ผู้ขาย + เงื่อนไข/ความเป็นส่วนตัว + ยอมรับ (ภาพ 01ค · 19) · RUN TRIPS W1.2a
// แสดงผลเท่านั้น · ฟอร์มส่งด้วย <form action={server action}> (ไม่มี JS) · ฟอร์มไม่เติมค่าที่กรอกกลับ (ไม่มีค่าที่ผู้จองกรอกใน URL · มติ R11)
// เวลาถือที่เป็นข้อความเวลาของร้านจากตัวโหลด (ไม่มีนาฬิกา JS) · ยอดทุกตัวจาก VM
import { formatYmd } from "@/components/trips/trips-shared";
import { BOOK_TERMS_VERSION, type BookCheckoutVM, type BookErrorCode, type BookFormField } from "@/lib/platform/trips-book-core";
import type { BookBrandVM, BookLocale } from "@/lib/platform/trips-public-core";
import { BookUntranslated } from "./BookContent";
import { BookError, BookHidden, BookLines, BookShopBox, BookSteps, bookContactText } from "./BookFlowParts";
import { bookMoney } from "./BookPrices";
import { BookShell } from "./BookShell";
import { bookDateNames, bookT } from "./book-i18n";

const CTA = "inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-[color:var(--color-accent)] px-5 text-base font-semibold text-[color:var(--color-accent-fg)]";
const INPUT = "min-h-11 w-full rounded-xl border bg-[color:var(--color-surface)] px-3 text-base aria-[invalid=true]:border-2 aria-[invalid=true]:border-[color:var(--color-danger)]";

type Frame = { brand: BookBrandVM; locale: BookLocale; homeHref: string; langHrefs: { th: string; en: string } };

export function BookCheckout({
  vm,
  frame,
  action,
  error,
}: {
  vm: BookCheckoutVM;
  frame: Frame;
  action: (formData: FormData) => void | Promise<void>;
  error: { code: BookErrorCode; fields: BookFormField[]; wait?: number } | null;
}) {
  const t = bookT(vm.locale);
  const names = bookDateNames(vm.locale);
  const bad = (f: BookFormField): boolean => error?.code === "INVALID" && error.fields.includes(f);
  return (
    <BookShell brand={frame.brand} locale={vm.locale} homeHref={frame.homeHref} langHrefs={frame.langHrefs}>
      <div data-testid="book-checkout" className="mx-auto grid w-full max-w-[1100px] grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_400px] xl:gap-10">
        <div className="flex min-w-0 flex-col gap-5">
          <BookSteps current="details" locale={vm.locale} />
          <header className="flex flex-wrap items-baseline justify-between gap-2">
            <h1 className="text-2xl font-semibold">{t("checkout.title")}</h1>
            {/* เวลาที่ยืนยันได้จริง (เวลาหมดถือ − ระยะที่ใช้ยืนยันไม่ได้) ตัดสินในตัวโหลด (มติ Y1) · คีย์เดิม checkout.holdUntil ข้อความใหม่ "กรอกและยืนยันภายใน" */}
            <p data-testid="book-hold-until" className="text-sm font-semibold text-[color:var(--color-accent)]">
              {t("checkout.holdUntil", { time: vm.confirmByLocal })}
            </p>
          </header>
          {error ? <BookError code={error.code} fields={error.fields} locale={vm.locale} wait={error.wait} contact={bookContactText(vm.shop)} /> : null}
          <form action={action} className="flex flex-col gap-4 rounded-2xl border bg-[color:var(--color-surface)] p-5">
            <BookHidden q={{ nonce: vm.form.nonce, seen: String(vm.summary.totalSatang), lang: vm.locale }} />
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium">{t("checkout.name")}</span>
              <input data-testid="book-booker-name" name="name" type="text" required maxLength={100} autoComplete="name" aria-invalid={bad("name") ? "true" : undefined} className={INPUT} />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium">{t("checkout.phone")}</span>
              <input data-testid="book-booker-phone" name="phone" type="tel" required maxLength={30} autoComplete="tel" inputMode="tel" aria-invalid={bad("phone") ? "true" : undefined} className={INPUT} />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium">{t("checkout.email")}</span>
              <input data-testid="book-booker-email" name="email" type="email" maxLength={200} autoComplete="email" aria-invalid={bad("email") ? "true" : undefined} className={INPUT} />
            </label>
            <p className="text-sm text-[color:var(--color-muted)]">{t("checkout.noAccount")}</p>
            <div data-testid="book-legal" className="flex flex-col gap-2 rounded-xl border p-3 text-sm text-[color:var(--color-ink-soft)]">
              <p>{t("checkout.legal")}</p>
              <p data-testid="book-privacy">{t("checkout.privacy")}</p>
              <p data-testid="book-terms-version" className="text-xs text-[color:var(--color-muted)]">
                {t("checkout.termsVersion", { v: vm.legal.termsVersion || BOOK_TERMS_VERSION })}
              </p>
            </div>
            <label className="flex min-h-11 cursor-pointer items-start gap-3">
              <input data-testid="book-accept" name="accept" value="on" type="checkbox" required className="mt-1 h-5 w-5 shrink-0" aria-invalid={error?.code === "ACCEPT_REQUIRED" ? "true" : undefined} />
              <span className="text-sm">{t("checkout.accept")}</span>
            </label>
            <button data-testid="book-pay-submit" type="submit" className={CTA}>
              {t("checkout.pay")}
            </button>
            <p className="text-sm text-[color:var(--color-muted)]">{t("checkout.receiptNote")}</p>
          </form>
        </div>

        <aside className="flex min-w-0 flex-col gap-4 xl:sticky xl:top-6 xl:self-start">
          <section className="flex flex-col gap-3 rounded-2xl border bg-[color:var(--color-surface)] p-5">
            <h2 className="break-words text-lg font-semibold">{vm.product.title.text}</h2>
            {vm.product.title.fallback ? <BookUntranslated locale={vm.locale} /> : null}
            <p className="text-sm text-[color:var(--color-ink-soft)]">
              {formatYmd(vm.date, names)} · {vm.timeText}
            </p>
            <BookLines lines={vm.summary.lines} locale={vm.locale} />
            <div className="flex items-baseline justify-between gap-3 border-t pt-3">
              <span className="text-base font-semibold">{t("summary.total")}</span>
              <span data-testid="book-total" className="text-2xl font-semibold tabular-nums">
                {bookMoney(t, vm.summary.totalSatang)}
              </span>
            </div>
            {vm.summary.passThroughSatang > 0 ? <p className="text-sm text-[color:var(--color-ink-soft)]">{t("summary.passThrough", { amount: bookMoney(t, vm.summary.passThroughSatang) })}</p> : null}
            <p className="text-sm text-[color:var(--color-ink-soft)]">{t(`price.vat.${vm.summary.vatNote}`)}</p>
          </section>
          <section className="rounded-2xl border bg-[color:var(--color-surface)] p-5">
            <BookCancelRows rows={vm.cancelRows} locale={vm.locale} />
          </section>
          <BookShopBox shop={vm.shop} licenseNo={vm.legal.licenseNo} locale={vm.locale} />
        </aside>
      </div>
    </BookShell>
  );
}

/** ตารางยกเลิกจากบรรทัดที่ตัวโหลดตัดสินแล้ว (cancelRowsOf) — จอแปลเป็นข้อความอย่างเดียว */
export function BookCancelRows({ rows, locale }: { rows: BookCheckoutVM["cancelRows"]; locale: BookLocale }) {
  const t = bookT(locale);
  if (!rows.length) return null;
  return (
    <div data-testid="book-cancel">
      <h2 className="text-base font-semibold">{t("cancel.title")}</h2>
      <ul className="mt-2 flex flex-col gap-1.5 text-sm text-[color:var(--color-ink-soft)]">
        {rows.map((r, i) => (
          <li key={i}>{r.kind === "FROM_DAYS" ? t("cancel.row", { days: r.days, pct: r.pct }) : r.kind === "LATER_PCT" ? t("cancel.rowLast", { pct: r.pct }) : t("cancel.noRefund")}</li>
        ))}
      </ul>
    </div>
  );
}

/**
 * หน้ายืนยันที่ใช้ต่อไม่ได้: ราคาเปลี่ยน (ยอดเดิม · ยอดใหม่ · ถือใหม่) / เงื่อนไขเปลี่ยนแต่ยอดเท่าเดิม / หมดเวลา / ปิดจอง / อื่น — ไม่มีฟอร์มผู้จอง
 * ถือใหม่ = ฟอร์ม POST ไป action ที่ปล่อยที่ถือของตะกร้านี้ก่อนพากลับหน้าสินค้า (มติ W2 · ไม่ต้องมี JS)
 */
export function BookCheckoutStop({
  code,
  frame,
  rehold,
  heldTotalSatang,
  totalSatang,
}: {
  code: BookErrorCode;
  frame: Frame;
  rehold: ((formData: FormData) => void | Promise<void>) | null;
  heldTotalSatang: number | null;
  totalSatang: number | null;
}) {
  const t = bookT(frame.locale);
  const again = (label: string, testId?: string) =>
    rehold ? (
      <form action={rehold}>
        <BookHidden q={{ lang: frame.locale }} />
        <button data-testid={testId} type="submit" className={CTA}>
          {label}
        </button>
      </form>
    ) : null;
  const priced = code === "PRICE_CHANGED" && heldTotalSatang !== null && totalSatang !== null;
  return (
    <BookShell brand={frame.brand} locale={frame.locale} homeHref={frame.homeHref} langHrefs={frame.langHrefs}>
      <div data-testid="book-checkout" className="mx-auto flex w-full max-w-[640px] flex-col gap-5">
        <BookSteps current="details" locale={frame.locale} />
        {priced && heldTotalSatang !== totalSatang ? (
          <section data-testid="book-price-changed" role="alert" className="flex flex-col gap-3 rounded-2xl border border-[color:var(--color-danger)] bg-[color:var(--color-surface)] p-5">
            <h1 className="text-lg font-semibold">{t("priceChanged.title")}</h1>
            <p className="text-base tabular-nums">{t("priceChanged.old", { amount: bookMoney(t, heldTotalSatang ?? 0) })}</p>
            <p className="text-base font-semibold tabular-nums">{t("priceChanged.new", { amount: bookMoney(t, totalSatang ?? 0) })}</p>
            {again(t("priceChanged.rehold"), "book-rehold")}
          </section>
        ) : priced ? (
          // ยอดเท่าเดิมแต่ใบเสนอราคาเปลี่ยน (เงื่อนไข/ตารางยกเลิก/รายการ) — ไม่โชว์ยอดเดิม/ใหม่ที่เท่ากัน (มติ W5)
          <section data-testid="book-price-changed" data-same-total="true" role="alert" className="flex flex-col gap-3 rounded-2xl border border-[color:var(--color-danger)] bg-[color:var(--color-surface)] p-5">
            <h1 className="text-lg font-semibold">{t("priceChanged.termsTitle")}</h1>
            <p className="text-base">{t("priceChanged.termsBody")}</p>
            {again(t("priceChanged.reholdTerms"), "book-rehold")}
          </section>
        ) : (
          <>
            <BookError code={code} locale={frame.locale} />
            {again(t("checkout.back"))}
          </>
        )}
      </div>
    </BookShell>
  );
}
