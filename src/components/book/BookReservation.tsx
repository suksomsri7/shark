// components/book/BookReservation.tsx — หน้าการจองของลูกค้า: จ่าย (QR ยอดล็อก) / วอเชอร์ + สิ่งที่ต้องทำ / หมดเวลา / ยกเลิก / จบแล้ว (ภาพ 01ง · 07) · RUN TRIPS W1.2a
// แสดงผลเท่านั้น: สถานะ · ยอด · เวลา "โอนภายใน" · QR มาจากตัวโหลดทั้งหมด (ตัวโหลดตัดสินว่าออก QR ได้ไหม) — ไม่มีนาฬิกา/การคิดเงินในไฟล์นี้
// ไม่สัญญาสิ่งที่ระบบทำไม่ได้: ไม่มี "ยืนยันอัตโนมัติ" · ไม่อ้างว่าส่งใบเสร็จแล้ว (OQ21)
import type { ReactNode } from "react";
import { formatYmd } from "@/components/trips/trips-shared";
import type { BookReservationVM } from "@/lib/platform/trips-book-core";
import type { BookLocale } from "@/lib/platform/trips-public-core";
import { BookCancelRows } from "./BookCheckout";
import { BookUntranslated } from "./BookContent";
import { BookFull } from "./BookFull"; // TRIPS W1.4a ▸ ◂
import { BookLines, BookShopBox, BookSteps, bookContactText } from "./BookFlowParts";
import { bookMoney } from "./BookPrices";
import { BookShell } from "./BookShell";
import { bookDateNames, bookT } from "./book-i18n";

type Frame = { locale: BookLocale; homeHref: string; langHrefs: { th: string; en: string } };
const BOX = "flex flex-col gap-3 rounded-2xl border bg-[color:var(--color-surface)] p-5";
const NOTE = "rounded-xl border px-4 py-3 text-sm";

/** ก้อน "การจองของฉัน" ของ W1.3a ที่หน้าประกอบมาแล้ว: `selfTop` = ยืนยันเบอร์/ยกเลิก (ใต้หัวการจอง) · `selfManage` = ก้อนจัดการ (ใต้สิ่งที่ต้องทำ) */
export function BookReservation({ vm, frame, selfTop, selfManage }: { vm: BookReservationVM; frame: Frame; selfTop?: ReactNode; selfManage?: ReactNode }) {
  const t = bookT(vm.locale);
  const names = bookDateNames(vm.locale);
  const pay = vm.pay;
  const ex = vm.expired ?? null;
  return (
    <BookShell brand={vm.brand} locale={vm.locale} homeHref={frame.homeHref} langHrefs={frame.langHrefs}>
      <div data-testid="book-res" data-state={vm.state} className="mx-auto flex w-full max-w-[640px] flex-col gap-5">
        <BookSteps current={vm.state === "PAY" ? "pay" : "done"} locale={vm.locale} />
        <header className={BOX}>
          <p data-testid="book-res-code" className="text-xl font-semibold">
            {t("res.code", { code: vm.code })}
          </p>
          <div>
            <p className="break-words text-base font-semibold">{vm.product.title.text}</p>
            {vm.product.title.fallback ? <BookUntranslated locale={vm.locale} /> : null}
            <p className="text-sm text-[color:var(--color-ink-soft)]">
              {formatYmd(vm.date, names)} · {vm.timeText}
            </p>
          </div>
        </header>

        {selfTop ?? null}

        {vm.state === "PAY" ? (
          <section data-testid="book-pay" className={BOX}>
            <h1 className="text-lg font-semibold">{t("res.pay.title")}</h1>
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-sm text-[color:var(--color-ink-soft)]">{t("res.total")}</span>
              <span data-testid="book-res-total" className="text-base font-semibold tabular-nums">
                {bookMoney(t, vm.totalSatang)}
              </span>
            </div>
            {pay && "amountSatang" in pay ? (
              <>
                <div className="flex items-baseline justify-between gap-3 border-t pt-3">
                  <span className="text-base font-semibold">{t("res.pay.amountNow")}</span>
                  <span data-testid="book-pay-amount" className="text-2xl font-semibold tabular-nums">
                    {bookMoney(t, pay.amountSatang)}
                  </span>
                </div>
                <img data-testid="book-pay-qr" src={pay.qrSvgDataUrl} alt={t("res.pay.amount", { amount: bookMoney(t, pay.amountSatang) })} className="mx-auto h-60 w-60 rounded-xl border bg-white p-2" />
                <p className="text-center text-sm">{t("res.pay.receiver", { name: pay.receiverName })}</p>
                {vm.payByLocal ? (
                  <p data-testid="book-pay-by" className="text-center text-base font-semibold text-[color:var(--color-danger)]">
                    {t("res.pay.payBy", { date: vm.payByDate ? formatYmd(vm.payByDate, names) : "", time: vm.payByLocal })}
                  </p>
                ) : null}
                <p className="text-sm text-[color:var(--color-ink-soft)]">{t("res.pay.note")}</p>
              </>
            ) : pay && pay.unavailable === "TOO_LATE" ? (
              <p data-testid="book-pay-too-late" role="alert" className={`${NOTE} border-[color:var(--color-danger)] text-[color:var(--color-danger)]`}>
                {t("res.pay.tooLate")}
              </p>
            ) : pay && pay.unavailable === "NOTHING_DUE" ? (
              <p data-testid="book-pay-nothing-due" className={NOTE}>
                {t("res.pay.nothingDue", { contact: bookContactText(vm.shop), code: vm.code })}
              </p>
            ) : pay && pay.unavailable === "AGENT_COLLECTS" ? (
              <p data-testid="book-pay-agent" className={NOTE}>
                {t("res.pay.agentCollects")}
              </p>
            ) : pay && pay.unavailable === "NOT_SHOP" ? (
              <p data-testid="book-pay-not-shop" className={NOTE}>
                {t("res.pay.notShop", { contact: bookContactText(vm.shop), code: vm.code })}
              </p>
            ) : (
              <p data-testid="book-pay-unavailable" className={NOTE}>
                {t("res.pay.unavailable")}
              </p>
            )}
            {vm.holdUntilLocal ? <p className="text-sm text-[color:var(--color-muted)]">{t("res.pay.holdUntil", { time: vm.holdUntilLocal })}</p> : null}
            <p className="text-sm text-[color:var(--color-muted)]">{t("checkout.receiptNote")}</p>
          </section>
        ) : null}

        {vm.state === "VOUCHER" && vm.voucher ? (
          <section data-testid="book-voucher" className={BOX}>
            <h1 className="text-lg font-semibold">{t("res.voucher.title")}</h1>
            <img data-testid="book-voucher-qr" src={vm.voucher.qrSvgDataUrl} alt={t("res.voucher.title")} className="mx-auto h-56 w-56 rounded-xl border bg-white p-2" />
            <p className="text-center text-sm text-[color:var(--color-ink-soft)]">{t("res.voucher.qrNote")}</p>
            <div className="flex items-baseline justify-between gap-3 border-t pt-3 text-sm">
              <span>{t("res.pay.paid", { amount: bookMoney(t, vm.paidSatang) })}</span>
              <span className="tabular-nums">{t("res.pay.outstanding", { amount: bookMoney(t, vm.outstandingSatang) })}</span>
            </div>
          </section>
        ) : null}

        {vm.state === "EXPIRED" ? (
          <section data-testid="book-res-expired" role="status" className={BOX}>
            {/* TRIPS W1.4a ▸ เกิดอะไร · เงินอยู่ไหน · ทำอะไรต่อ (ใบสั่ง W1.4 §4.2 · ลิงก์ GET ไม่ต้องมี JS · ไม่สัญญาระยะเวลา OQ76) ◂ */}
            <h1 className="text-lg font-semibold">{t(ex ? "res.expiredTitle" : "res.expired")}</h1>
            {ex?.heldUntilLocal && ex.heldUntilDate ? <p data-testid="book-res-expired-when" className="text-base">{t("res.expiredWhen", { time: ex.heldUntilLocal, date: formatYmd(ex.heldUntilDate, names) })}</p> : null}
            {ex && vm.paidSatang === 0 ? <p data-testid="book-res-expired-money" className="text-base">{t("res.expiredMoney")}</p> : null}
            {ex?.now && (ex.open || ex.now.state === "FULL" || ex.now.state === "CLOSED") ? (
              <p data-testid="book-res-expired-now" data-state={ex.now.state} className="text-base font-semibold">
                {ex.now.state === "CLOSED" ? t("res.expiredNowClosed") : ex.now.state === "FULL" ? t("res.expiredNowFull") : t("res.expiredNowOpen", { n: ex.now.left })}
              </p>
            ) : null}
            {ex?.rehold ? (
              <div data-testid="book-res-rehold" className="flex flex-col gap-2">
                {ex.rehold.partial ? <p data-testid="book-res-rehold-partial" className={`${NOTE} border-[color:var(--color-danger)]`}>{t("res.reholdPartial")}</p> : null}
                <a href={ex.rehold.href} className="inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-[color:var(--color-accent)] px-5 text-base font-semibold text-[color:var(--color-accent-fg)]">
                  {t("res.reholdSubmit")}
                </a>
                <p className="text-sm text-[color:var(--color-ink-soft)]">{t("res.reholdNote")}</p>
              </div>
            ) : null}
            <div data-testid="book-res-expired-paid" className="flex flex-col gap-1 border-t pt-3">
              {ex ? <h2 className="text-base font-semibold">{t("res.expiredPaidTitle")}</h2> : null}
              <p data-testid="book-expired-contact" className="text-base">
                {t("res.expiredPaid", { contact: bookContactText(vm.shop), code: vm.code })}
              </p>
              {ex && !ex.agency ? <p className="text-sm text-[color:var(--color-ink-soft)]">{t("res.expiredPaidHow")}</p> : null}
            </div>
          </section>
        ) : null}
        {vm.state === "EXPIRED" && vm.expired?.full ? <BookFull full={vm.expired.full} locale={vm.locale} /> : null}
        {vm.state === "CANCELLED" ? (
          <section data-testid="book-res-cancelled" role="status" className={BOX}>
            <h1 className="text-lg font-semibold">{t("res.cancelled")}</h1>
          </section>
        ) : null}
        {vm.state === "ENDED" ? (
          <section data-testid="book-res-ended" role="status" className={BOX}>
            <h1 className="text-lg font-semibold">{t("res.ended")}</h1>
          </section>
        ) : null}

        {vm.state === "PAY" || vm.state === "VOUCHER" ? (
          <section data-testid="book-todo" className={BOX}>
            <h2 className="text-base font-semibold">{t("todo.title")}</h2>
            <ul className="flex flex-col divide-y">
              {vm.todo.map((x) => (
                <li key={x.key} data-testid={`book-todo-${x.key}`} data-done={x.done ? "true" : "false"} className="flex items-center gap-3 py-2.5 text-sm">
                  <span aria-hidden="true" className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded border ${x.done ? "bg-[color:var(--color-ink)] text-[color:var(--color-surface)]" : ""}`}>
                    {x.done ? "✓" : ""}
                  </span>
                  <span className="min-w-0 flex-1">{"count" in x ? t(`todo.${x.key}`, { count: x.count, total: x.total }) : t(`todo.${x.key}`)}</span>
                  <span className="sr-only">{x.done ? t("todo.done") : t("todo.pending")}</span>
                </li>
              ))}
            </ul>
            <p className="text-sm text-[color:var(--color-muted)]">{t("todo.later")}</p>
          </section>
        ) : null}

        {selfManage ?? null}

        <section className={BOX}>
          <h2 className="text-base font-semibold">{t("res.lines")}</h2>
          <BookLines lines={vm.lines} locale={vm.locale} />
          <div className="flex items-baseline justify-between gap-3 border-t pt-3">
            <span className="text-base font-semibold">{t("summary.total")}</span>
            <span className="text-lg font-semibold tabular-nums">{bookMoney(t, vm.totalSatang)}</span>
          </div>
        </section>

        <section className={BOX}>
          <BookCancelRows rows={vm.cancelRows} locale={vm.locale} />
          {vm.cancelUntil.length ? (
            <ul data-testid="book-cancel-until" className="flex flex-col gap-1 text-sm">
              {vm.cancelUntil.map((c, i) => (
                <li key={i}>{t("cancel.until", { date: formatYmd(c.date, names), pct: c.pct })}</li>
              ))}
            </ul>
          ) : null}
        </section>

        <BookShopBox shop={vm.shop} locale={vm.locale} />
      </div>
    </BookShell>
  );
}
