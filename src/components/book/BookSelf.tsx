// components/book/BookSelf.tsx — "การจองของฉัน": ก้อนจัดการการจอง · ยืนยันเบอร์ผู้จอง · หน้ายกเลิก (ยอดคืนจาก snapshot) · สถานะคำขอ (ภาพ 01ง · 07 · 15) · RUN TRIPS W1.3a
// แสดงผลเท่านั้น: ยอดทุกตัวมาจาก platform/trips-self (บริการ QUOTE · snapshot) — ไฟล์นี้ไม่บวก/คูณ/ปัดเงิน · ไม่มีนาฬิกา
// ฟอร์มเป็น <form action={server action}> (ไม่ต้องมี JS) · ไม่เติมค่าที่กรอกกลับ (ไม่มีเบอร์ในหน้า/URL) · ไม่แสดงเบอร์/ชื่อ/อีเมลผู้จอง
// ⚖️ ข้อความไม่สัญญาวันโอนคืน/การคืนเอง/การส่งข้อความ — บอกว่าร้านเป็นผู้พิจารณาและโอนคืน + ทางติดต่อร้านพร้อมรหัสการจอง (ใบสั่ง §8)
// มติ L7: ตัวเลขซื่อตรง (ค่าทัวร์คืน % ไม่ปัด · เงินเก็บแทนแยกบรรทัด · วันเดินทางวันนี้) · บอกว่าเป็นคำขอก่อนกด · ช่องทางติดต่อครั้งเดียว
// มติ L8: ร้านไม่มีเบอร์/LINE ⇒ ข้อความรูปไม่มีช่องทาง (คีย์ …Bare · ไม่มีชื่อร้านลอย ๆ · bookReachText)
import type { BookShopInfo } from "@/lib/platform/trips-book-core";
import type { BookLocale } from "@/lib/platform/trips-public-core";
import type { SelfCancelVM } from "@/lib/platform/trips-self";
import { selfDoneShown, selfRefundView, type SelfManageVM, type SelfOutcome, type SelfPageError, type SelfRefundView } from "@/lib/platform/trips-self-core";
import { BookHidden, bookReachText } from "./BookFlowParts";
import { bookMoney } from "./BookPrices";
import { bookT, type BookT } from "./book-i18n";

const BOX = "flex flex-col gap-3 rounded-2xl border bg-[color:var(--color-surface)] p-5";
const NOTE = "rounded-xl border px-4 py-3 text-sm";
const CTA = "inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-[color:var(--color-accent)] px-5 text-base font-semibold text-[color:var(--color-accent-fg)]";
const LINK = "inline-flex min-h-12 w-full items-center justify-center rounded-xl border px-5 text-base font-semibold";
const INPUT = "min-h-11 w-full rounded-xl border bg-[color:var(--color-surface)] px-3 text-base aria-[invalid=true]:border-2 aria-[invalid=true]:border-[color:var(--color-danger)]";
const PHONE_ERR_ID = "book-verify-phone-error";
type FormAction = (formData: FormData) => void | Promise<void>;

/** ข้อความที่มีช่องทางติดต่อร้าน: มีเบอร์/LINE ⇒ คีย์ปกติ · ไม่มี ⇒ คีย์รูปไม่มีช่องทาง (มติ L8) */
function withReach(t: BookT, reach: string, key: string, bareKey: string, vars: Record<string, string | number> = {}): string {
  return reach ? t(key, { ...vars, contact: reach }) : t(bareKey, vars);
}
/** ข้อความสถานะคำขอ (K8 · K10 · L3) — คีย์ตรงตัวต่อแบบ */
function refundText(t: BookT, reach: string, v: SelfRefundView, code: string, shown: SelfOutcome | null): string {
  const vars = { amount: bookMoney(t, v.satang), code };
  if (shown === "REFUND_REQUESTED") return withReach(t, reach, "self.cancel.requested", "self.cancel.requestedBare", vars);
  switch (v.kind) {
    case "QUOTED":
      return withReach(t, reach, "self.refund.QUOTED", "self.refund.QUOTEDBare", vars);
    case "APPROVED":
      return withReach(t, reach, "self.refund.APPROVED", "self.refund.APPROVEDBare", vars);
    case "REJECTED":
      return withReach(t, reach, "self.refund.REJECTED", "self.refund.REJECTEDBare", vars);
    case "byShopRejected":
      return withReach(t, reach, "self.refund.byShopRejected", "self.refund.byShopRejectedBare", vars);
    case "DONE":
      return withReach(t, reach, "self.refund.DONE", "self.refund.DONEBare", vars);
    case "byShop":
      return withReach(t, reach, "self.refund.byShop", "self.refund.byShopBare", vars);
    default:
      return withReach(t, reach, "self.cancel.cancelRequested", "self.cancel.cancelRequestedBare", vars);
  }
}

/** กล่องผิดพลาดของใบนี้ (รหัสในรายการเท่านั้น · ข้อความจากไฟล์ภาษา) · `id` = ให้ช่องกรอกชี้ด้วย aria-describedby */
export function BookSelfError({ code, locale, id }: { code: SelfPageError; locale: BookLocale; id?: string }) {
  const t = bookT(locale);
  return (
    <p id={id} data-testid="book-self-error" data-code={code} role="alert" className={`${NOTE} border-[color:var(--color-danger)] text-[color:var(--color-danger)]`}>
      {code === "LOCKED" ? t("self.err.RATE_LIMITED") : t(`self.err.${code}`)}
    </p>
  );
}

/** ก้อน "จัดการการจอง" บนหน้าการจอง: ปุ่มยกเลิก (ลิงก์ GET ?do=cancel) / เหตุที่ปิด / สถานะคำขอ / ผลที่เพิ่งทำ — ช่องทางติดต่อร้านขึ้นครั้งเดียว */
/** `cancelledBySelf` = การยกเลิกเป็นของเส้นลูกค้า (แบนเนอร์ ?done=CANCELLED · V2 · ไม่ส่ง = ไม่ใช่) */
export function BookSelfManage({ manage, shop, code, locale, cancelHref, done, state, cancelledBySelf }: { manage: SelfManageVM; shop: BookShopInfo; code: string; locale: BookLocale; cancelHref: string; done: SelfOutcome | null; state: string; cancelledBySelf?: boolean }) {
  const t = bookT(locale);
  const reach = bookReachText(shop);
  const rf = manage.refund;
  const view = rf ? selfRefundView(rf) : null;
  // ผลที่เพิ่งทำ (จาก ?done) แสดงเมื่อสภาพจริงตรงเท่านั้น — ไม่เชื่อพารามิเตอร์อย่างเดียว
  const shown = selfDoneShown(done, state, rf, cancelledBySelf === true);
  const statusText = view ? refundText(t, reach, view, code, shown) : null;
  return (
    <section data-testid="book-manage" data-block={manage.block ?? ""} className={BOX}>
      <h2 className="text-base font-semibold">{t("self.manage.title")}</h2>
      {shown ? (
        <div data-testid="book-cancel-done" role="status" className={NOTE}>
          <p className="font-semibold">{t("self.cancel.done")}</p>
          {shown === "CANCELLED" ? <p>{t("self.cancel.unpaidDone")}</p> : null}
        </div>
      ) : null}
      {rf && statusText ? (
        <p data-testid="book-refund-status" data-status={rf.status} data-mine={rf.mine ? "true" : "false"} className={NOTE}>
          {statusText}
        </p>
      ) : null}
      {manage.cancel ? (
        <a data-testid="book-manage-cancel" href={cancelHref} className={LINK}>
          {manage.cancel === "CANCEL_REQUEST" ? t("self.manage.cancelOnly") : t("self.manage.cancel")}
        </a>
      ) : null}
      {manage.block && !statusText ? <p className="text-sm">{t(`self.block.${manage.block}`)}</p> : null}
      {manage.block && !statusText ? (
        <p data-testid="book-manage-contact" className="text-sm text-[color:var(--color-ink-soft)]">
          {manage.block === "AGENT" ? t("self.manage.agent") : withReach(t, reach, "self.manage.contact", "self.manage.contactBare", { code })}
        </p>
      ) : null}
    </section>
  );
}

/** ยืนยันว่าเป็นผู้จอง (ลิงก์ + เบอร์ · OQ37) — ฟอร์ม POST ไม่ต้องมี JS · เบอร์ผิดรูป ⇒ ข้อความผูกช่องด้วย aria-describedby (L7 ง) */
export function BookSelfVerify({ action, nonce, locale, error }: { action: FormAction; nonce: string; locale: BookLocale; error: SelfPageError | null }) {
  const t = bookT(locale);
  const phoneErr = error === "INVALID_PHONE";
  return (
    <section data-testid="book-verify" className={BOX}>
      <h2 className="text-lg font-semibold">{t("self.verify.title")}</h2>
      <p className="text-sm text-[color:var(--color-ink-soft)]">{t("self.verify.help")}</p>
      {error && !phoneErr ? <BookSelfError code={error} locale={locale} /> : null}
      <form action={action} className="flex flex-col gap-3">
        <BookHidden q={{ nonce, lang: locale }} />
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">{t("self.verify.phone")}</span>
          <input
            data-testid="book-verify-phone"
            name="phone"
            type="tel"
            required
            maxLength={30}
            autoComplete="tel"
            inputMode="tel"
            aria-invalid={phoneErr || error === "VERIFY_FAILED" ? "true" : undefined}
            aria-describedby={phoneErr ? PHONE_ERR_ID : undefined}
            className={INPUT}
          />
        </label>
        {phoneErr ? <BookSelfError code="INVALID_PHONE" locale={locale} id={PHONE_ERR_ID} /> : null}
        <button data-testid="book-verify-submit" type="submit" className={CTA}>
          {t("self.verify.submit")}
        </button>
      </form>
    </section>
  );
}

/** ถูกล็อกจากการลองเบอร์ผิดครบเพดาน (K6) ⇒ ลองใหม่ได้ใน 24 ชั่วโมง หรือติดต่อร้าน */
export function BookSelfLocked({ shop, code, locale }: { shop: BookShopInfo; code: string; locale: BookLocale }) {
  const t = bookT(locale);
  return (
    <section data-testid="book-self-locked" role="alert" className={BOX}>
      <h2 className="text-lg font-semibold">{t("self.verify.title")}</h2>
      <p className="text-base">{withReach(t, bookReachText(shop), "self.verify.locked", "self.verify.lockedBare", { code })}</p>
    </section>
  );
}

/** ขั้นของตาราง: วันนี้ = ข้อความเฉพาะ · 1 วัน/หลายวัน · ค่าทัวร์คืน % ไม่ปัด (L7 ก ค) */
function stepText(t: BookT, vm: SelfCancelVM, refundShown: boolean): string {
  if (vm.daysBefore <= 0) return t("self.cancel.today");
  const one = vm.daysBefore === 1;
  if (refundShown && vm.refundPct !== null) return t(one ? "self.cancel.stepOne" : "self.cancel.step", { days: vm.daysBefore, pct: String(vm.refundPct) });
  return t(one ? "self.cancel.stepDaysOne" : "self.cancel.stepDays", { days: vm.daysBefore });
}

/** หน้ายกเลิก (ภาพ 15): ยอดจ่าย/คืน/เก็บ/ขั้นจากบริการ · ยังไม่จ่าย ⇒ คำเตือน "ถ้าโอนแล้ว อย่ายกเลิกที่นี่" (K9) · คำขอ ⇒ บอกว่าเป็นคำขอก่อนปุ่ม (L7 ข) · ยอมรับ + ยืนยัน */
export function BookSelfCancel({ vm, action, shop, code, locale, error }: { vm: SelfCancelVM; action: FormAction; shop: BookShopInfo; code: string; locale: BookLocale; error: SelfPageError | null }) {
  const t = bookT(locale);
  const reach = bookReachText(shop);
  const refundShown = vm.kind === "REFUND_REQUEST";
  const isRequest = vm.kind !== "UNPAID";
  return (
    <section data-testid="book-cancel-quote" data-kind={vm.kind} className={BOX}>
      <h2 className="text-lg font-semibold">{vm.kind === "CANCEL_REQUEST" ? t("self.manage.cancelOnly") : t("self.cancel.title")}</h2>
      {error ? <BookSelfError code={error} locale={locale} /> : null}
      {vm.kind === "UNPAID" ? (
        <p data-testid="book-cancel-paid-warning" role="alert" className={`${NOTE} border-[color:var(--color-danger)] font-semibold text-[color:var(--color-danger)]`}>
          {withReach(t, reach, "self.cancel.paidWarning", "self.cancel.paidWarningBare", { code })}
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
            {vm.passThroughSatang !== null ? (
              <div data-testid="book-cancel-pass-through" className="flex items-baseline justify-between gap-3 py-2">
                <dt>{t("self.cancel.passThrough")}</dt>
                <dd className="font-medium tabular-nums">{bookMoney(t, vm.passThroughSatang)}</dd>
              </div>
            ) : null}
            <div data-testid="book-cancel-refund" className="flex items-baseline justify-between gap-3 py-2">
              <dt className="text-base font-semibold">{t("self.cancel.refund")}</dt>
              <dd className="text-xl font-semibold tabular-nums">{bookMoney(t, vm.refundSatang)}</dd>
            </div>
          </>
        ) : null}
      </dl>
      <p data-testid="book-cancel-step" className="text-sm text-[color:var(--color-ink-soft)]">
        {stepText(t, vm, refundShown)}
      </p>
      {refundShown ? <p className="text-sm text-[color:var(--color-ink-soft)]">{withReach(t, reach, "self.cancel.legal", "self.cancel.legalBare", { code })}</p> : null}
      {refundShown && vm.partPaid ? <p className="text-sm text-[color:var(--color-ink-soft)]">{t("self.cancel.partPaid")}</p> : null}
      {isRequest ? (
        <p data-testid="book-cancel-request-note" className={NOTE}>
          {t("self.cancel.requestNote")}
        </p>
      ) : null}
      <form action={action} className="flex flex-col gap-3">
        <BookHidden q={{ nonce: vm.form.nonce, kind: vm.form.kind, v: vm.form.v, kv: vm.form.kv, seen: String(vm.refundSatang), lang: locale }} />
        <label className="flex min-h-11 cursor-pointer items-start gap-3">
          <input data-testid="book-cancel-accept" name="accept" value="on" type="checkbox" required className="mt-1 h-5 w-5 shrink-0" aria-invalid={error === "ACCEPT_REQUIRED" ? "true" : undefined} />
          <span className="text-sm">{isRequest ? t("self.cancel.acceptRequest") : t("self.cancel.accept")}</span>
        </label>
        <button data-testid="book-cancel-submit" type="submit" className={CTA}>
          {vm.kind === "CANCEL_REQUEST" ? t("self.manage.cancelOnly") : vm.kind === "REFUND_REQUEST" ? t("self.cancel.submitRequest") : t("self.cancel.submit")}
        </button>
      </form>
    </section>
  );
}
