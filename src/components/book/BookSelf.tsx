// components/book/BookSelf.tsx — "การจองของฉัน": ก้อนจัดการการจอง · ยืนยันเบอร์ผู้จอง · หน้ายกเลิก (ยอดคืนจาก snapshot) · สถานะคำขอ (ภาพ 01ง · 07 · 15) · RUN TRIPS W1.3a
// แสดงผลเท่านั้น: ยอดทุกตัวมาจาก platform/trips-self (บริการ QUOTE · snapshot) — ไฟล์นี้ไม่บวก/คูณ/ปัดเงิน · ไม่มีนาฬิกา
// ฟอร์มเป็น <form action={server action}> (ไม่ต้องมี JS) · ไม่เติมค่าที่กรอกกลับ (ไม่มีเบอร์ในหน้า/URL) · ไม่แสดงเบอร์/ชื่อ/อีเมลผู้จอง
// ⚖️ ข้อความไม่สัญญาวันโอนคืน/การคืนเอง/การส่งข้อความ — บอกว่าร้านเป็นผู้พิจารณาและโอนคืน + ทางติดต่อร้านพร้อมรหัสการจอง (ใบสั่ง §8)
import type { BookShopInfo } from "@/lib/platform/trips-book-core";
import type { BookLocale } from "@/lib/platform/trips-public-core";
import type { SelfCancelVM } from "@/lib/platform/trips-self";
import { selfDoneShown, selfRefundView, type SelfManageVM, type SelfOutcome, type SelfPageError, type SelfRefundView } from "@/lib/platform/trips-self-core";
import { BookHidden, bookContactText } from "./BookFlowParts";
import { bookMoney } from "./BookPrices";
import { bookT } from "./book-i18n";

const BOX = "flex flex-col gap-3 rounded-2xl border bg-[color:var(--color-surface)] p-5";
const NOTE = "rounded-xl border px-4 py-3 text-sm";
const CTA = "inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-[color:var(--color-accent)] px-5 text-base font-semibold text-[color:var(--color-accent-fg)]";
const LINK = "inline-flex min-h-12 w-full items-center justify-center rounded-xl border px-5 text-base font-semibold";
const INPUT = "min-h-11 w-full rounded-xl border bg-[color:var(--color-surface)] px-3 text-base aria-[invalid=true]:border-2 aria-[invalid=true]:border-[color:var(--color-danger)]";
type FormAction = (formData: FormData) => void | Promise<void>;
/** คีย์ข้อความของสถานะคำขอ (K8 · K10) */
function refundKey(v: SelfRefundView): string {
  switch (v.kind) {
    case "QUOTED":
      return "self.refund.QUOTED";
    case "APPROVED":
      return "self.refund.APPROVED";
    case "REJECTED":
      return "self.refund.REJECTED";
    case "DONE":
      return "self.refund.DONE";
    case "byShop":
      return "self.refund.byShop";
    default:
      return "self.cancel.cancelRequested";
  }
}

/** กล่องผิดพลาดของใบนี้ (รหัสในรายการเท่านั้น · ข้อความจากไฟล์ภาษา) */
export function BookSelfError({ code, locale }: { code: SelfPageError; locale: BookLocale }) {
  const t = bookT(locale);
  return (
    <p data-testid="book-self-error" data-code={code} role="alert" className={`${NOTE} border-[color:var(--color-danger)] text-[color:var(--color-danger)]`}>
      {code === "LOCKED" ? t("self.err.RATE_LIMITED") : t(`self.err.${code}`)}
    </p>
  );
}

/** ก้อน "จัดการการจอง" บนหน้าการจอง: ปุ่มยกเลิก (ลิงก์ GET ?do=cancel) / เหตุที่ปิด + ติดต่อร้าน / สถานะคำขอ / ผลที่เพิ่งทำ */
export function BookSelfManage({ manage, shop, code, locale, cancelHref, done, state }: { manage: SelfManageVM; shop: BookShopInfo; code: string; locale: BookLocale; cancelHref: string; done: SelfOutcome | null; state: string }) {
  const t = bookT(locale);
  const contact = bookContactText(shop);
  const rf = manage.refund;
  const view = rf ? selfRefundView(rf) : null;
  // ผลที่เพิ่งทำ (จาก ?done) แสดงเมื่อสภาพจริงตรงเท่านั้น — ไม่เชื่อพารามิเตอร์อย่างเดียว
  const shown = selfDoneShown(done, state, rf);
  const doneText =
    shown === "CANCELLED" ? t("self.cancel.unpaidDone") : shown === "REFUND_REQUESTED" ? t("self.cancel.requested", { contact, code }) : shown === "CANCEL_REQUESTED" ? t("self.cancel.cancelRequested", { contact, code }) : null;
  return (
    <section data-testid="book-manage" data-block={manage.block ?? ""} className={BOX}>
      <h2 className="text-base font-semibold">{t("self.manage.title")}</h2>
      {doneText ? (
        <div data-testid="book-cancel-done" role="status" className={NOTE}>
          <p className="font-semibold">{t("self.cancel.done")}</p>
          <p>{doneText}</p>
        </div>
      ) : null}
      {rf && view ? (
        <p data-testid="book-refund-status" data-status={rf.status} data-mine={rf.mine ? "true" : "false"} className={NOTE}>
          {t(refundKey(view), { amount: bookMoney(t, view.satang), contact, code })}
        </p>
      ) : null}
      {manage.cancel ? (
        <a data-testid="book-manage-cancel" href={cancelHref} className={LINK}>
          {manage.cancel === "CANCEL_REQUEST" ? t("self.manage.cancelOnly") : t("self.manage.cancel")}
        </a>
      ) : null}
      {manage.block ? (
        <>
          {manage.block === "REFUND_IN_PROGRESS" && rf ? null : <p className="text-sm">{t(`self.block.${manage.block}`)}</p>}
          <p data-testid="book-manage-contact" className="text-sm text-[color:var(--color-ink-soft)]">
            {manage.block === "AGENT" ? t("self.manage.agent") : t("self.manage.contact", { contact, code })}
          </p>
        </>
      ) : null}
    </section>
  );
}

/** ยืนยันว่าเป็นผู้จอง (ลิงก์ + เบอร์ · OQ37) — ฟอร์ม POST ไม่ต้องมี JS */
export function BookSelfVerify({ action, nonce, locale, error }: { action: FormAction; nonce: string; locale: BookLocale; error: SelfPageError | null }) {
  const t = bookT(locale);
  return (
    <section data-testid="book-verify" className={BOX}>
      <h2 className="text-lg font-semibold">{t("self.verify.title")}</h2>
      <p className="text-sm text-[color:var(--color-ink-soft)]">{t("self.verify.help")}</p>
      {error ? <BookSelfError code={error} locale={locale} /> : null}
      <form action={action} className="flex flex-col gap-3">
        <BookHidden q={{ nonce, lang: locale }} />
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">{t("self.verify.phone")}</span>
          <input data-testid="book-verify-phone" name="phone" type="tel" required maxLength={30} autoComplete="tel" inputMode="tel" aria-invalid={error === "VERIFY_FAILED" || error === "INVALID" ? "true" : undefined} className={INPUT} />
        </label>
        <button data-testid="book-verify-submit" type="submit" className={CTA}>
          {t("self.verify.submit")}
        </button>
      </form>
    </section>
  );
}

/** ถูกล็อกจากการลองเบอร์ผิดครบเพดาน (K6) ⇒ ติดต่อร้าน */
export function BookSelfLocked({ shop, code, locale }: { shop: BookShopInfo; code: string; locale: BookLocale }) {
  const t = bookT(locale);
  return (
    <section data-testid="book-self-locked" role="alert" className={BOX}>
      <h2 className="text-lg font-semibold">{t("self.verify.title")}</h2>
      <p className="text-base">{t("self.verify.locked", { contact: bookContactText(shop), code })}</p>
    </section>
  );
}

/** หน้ายกเลิก (ภาพ 15): ยอดจ่าย/คืน/เก็บ/ขั้นจากบริการ · ยังไม่จ่าย ⇒ คำเตือน "ถ้าโอนแล้ว อย่ายกเลิกที่นี่" (K9) · ยอมรับ + ยืนยัน */
export function BookSelfCancel({ vm, action, shop, code, locale, error }: { vm: SelfCancelVM; action: FormAction; shop: BookShopInfo; code: string; locale: BookLocale; error: SelfPageError | null }) {
  const t = bookT(locale);
  const contact = bookContactText(shop);
  const refundShown = vm.kind === "REFUND_REQUEST";
  return (
    <section data-testid="book-cancel-quote" data-kind={vm.kind} className={BOX}>
      <h2 className="text-lg font-semibold">{vm.kind === "CANCEL_REQUEST" ? t("self.manage.cancelOnly") : t("self.cancel.title")}</h2>
      {error ? <BookSelfError code={error} locale={locale} /> : null}
      {vm.kind === "UNPAID" ? (
        <p data-testid="book-cancel-paid-warning" role="alert" className={`${NOTE} border-[color:var(--color-danger)] font-semibold text-[color:var(--color-danger)]`}>
          {t("self.cancel.paidWarning", { contact, code })}
        </p>
      ) : null}
      <dl className="flex flex-col divide-y text-sm">
        <div data-testid="book-cancel-paid" className="flex items-baseline justify-between gap-3 py-2">
          <dt>{t("self.cancel.paid")}</dt>
          <dd className="font-medium tabular-nums">{bookMoney(t, vm.paidSatang)}</dd>
        </div>
        {refundShown ? (
          <>
            <div data-testid="book-cancel-kept" className="flex items-baseline justify-between gap-3 py-2">
              <dt>{t("self.cancel.kept")}</dt>
              <dd className="font-medium tabular-nums">{bookMoney(t, vm.keptSatang)}</dd>
            </div>
            <div data-testid="book-cancel-refund" className="flex items-baseline justify-between gap-3 py-2">
              <dt className="text-base font-semibold">{t("self.cancel.refund")}</dt>
              <dd className="text-xl font-semibold tabular-nums">{bookMoney(t, vm.refundSatang)}</dd>
            </div>
          </>
        ) : null}
      </dl>
      <p data-testid="book-cancel-step" className="text-sm text-[color:var(--color-ink-soft)]">
        {refundShown && vm.refundPct !== null ? t("self.cancel.step", { days: vm.daysBefore, pct: vm.refundPct }) : t("self.cancel.stepDays", { days: vm.daysBefore })}
      </p>
      {refundShown ? <p className="text-sm text-[color:var(--color-ink-soft)]">{t("self.cancel.legal", { contact, code })}</p> : null}
      <form action={action} className="flex flex-col gap-3">
        <BookHidden q={{ nonce: vm.form.nonce, seen: String(vm.refundSatang), lang: locale }} />
        <label className="flex min-h-11 cursor-pointer items-start gap-3">
          <input data-testid="book-cancel-accept" name="accept" value="on" type="checkbox" required className="mt-1 h-5 w-5 shrink-0" aria-invalid={error === "ACCEPT_REQUIRED" ? "true" : undefined} />
          <span className="text-sm">{t("self.cancel.accept")}</span>
        </label>
        <button data-testid="book-cancel-submit" type="submit" className={CTA}>
          {vm.kind === "CANCEL_REQUEST" ? t("self.manage.cancelOnly") : t("self.cancel.submit")}
        </button>
      </form>
    </section>
  );
}
