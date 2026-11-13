"use client";
// TRIPS T1.3 ▸ กล่องโต้ตอบของจอการจอง: รับเงิน (เงินสด/พร้อมเพย์ QR ยอดล็อก/โอน/บัตร) · ยกเลิกการจองที่ยังไม่จ่าย · อนุมัติ/ปฏิเสธคำขอจอง · เงินสดหน้าร้านรายวัน
//   🔴 เขียนผ่าน action เดิมของ T0.6/T0.7a เท่านั้น (ด่านสิทธิ์อยู่ใน action) · สำเร็จ ⇒ ปิดกล่อง + รีเฟรชข้อมูลจอ · ผิดพลาด ⇒ ข้อความในกล่อง ไม่ปิด ไม่ทิ้งค่า
//   🔴 กันกดซ้ำต่อเจตนา: seed สุ่มครั้งเดียวตอนเปิดกล่อง → คีย์ = intentKey(ชนิด, seed, ค่าที่ส่ง) ⇒ กดซ้ำ/ส่งซ้ำ = คีย์เดิม · แก้ช่องใด ⇒ คีย์ใหม่
//   🔴 คอมโพเนนต์ไม่คิดเงิน — ยอดค้าง/ยอด QR/ยอดเงินสด มาจากตัวโหลดและบริการ · ยอดที่พิมพ์อ่านด้วย parseAmountSatang · เงินสดเก็บแยกจากลิ้นชักเครื่องขาย
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { BookingDetailVM, CashDayVM, PaymentIntentValue } from "@/lib/modules/trips";
import { amountProblemOf, intentKey, parseAmountSatang } from "@/lib/modules/trips/booking-view-core";
import { recordTripPaymentAction, tripPaymentIntentAction } from "@/lib/modules/trips/money-actions";
import { approveTripBookingAction, cancelTripBookingAction } from "@/lib/modules/trips/booking-actions";
import { BTN, BTN_PRIMARY, ErrorLine, Field, INPUT } from "./ProductsScreenParts";
import { BTN_DANGER } from "./DepartureParts";
import { BkDialog, FieldError, KV, NotYetButton, PAY_TENDERS, bkHref, useBkRunner, useBkText, useGuardedClose, type BkQuery, type PayTender } from "./BookingParts";
import { formatBaht } from "./trips-shared";

/** seed ของคีย์กันซ้ำ — สุ่มครั้งเดียวต่อการเปิดกล่อง (ตัวอักษร/ตัวเลข 24 ตัว) */
function newSeed(): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (x) => x.toString(16).padStart(2, "0")).join("");
}
const REFERENCE_RE = /^[A-Za-z0-9 ._/-]{1,64}$/;
const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

// ═══════════════ รับเงิน ═══════════════
export function PayDialog({ unitSlug, vm, initialTender, onClose }: { unitSlug: string; vm: BookingDetailVM; initialTender: PayTender; onClose: () => void }) {
  const X = useBkText();
  const { t } = X;
  const { busy, error, setError, run, failText } = useBkRunner();
  const [seed] = useState(() => newSeed());
  const bookingId = vm.row.bookingId;
  const due = vm.outstandingSatang;
  const initialAmount = formatBaht(due);
  const [amountText, setAmountText] = useState(initialAmount);
  const [tender, setTender] = useState<PayTender>(initialTender);
  const [reference, setReference] = useState("");
  const [qr, setQr] = useState<PaymentIntentValue | null>(null);
  const [qrBusy, setQrBusy] = useState(false);
  const dirty = amountText !== initialAmount || reference !== "" || tender !== initialTender;
  const close = useGuardedClose(onClose, busy, dirty);

  const promptpay = tender === "PROMPTPAY";
  // พร้อมเพย์: บริการออก QR ยอดล็อกเท่านั้น (ไม่รับยอดที่พิมพ์) ⇒ ช่องยอดอ่านอย่างเดียว · ยอดที่บันทึก = ยอดล็อกของ QR (จากบริการ)
  const amount = promptpay ? (qr ? qr.amountSatang : null) : parseAmountSatang(amountText);
  const problem = promptpay ? null : amountProblemOf(amountText);
  const amountError = promptpay
    ? null
    : problem === "tooHigh"
      ? t("bookings.pay.amountTooHigh", { due: formatBaht(due) })
      : problem === "zero"
        ? t("bookings.pay.amountZero")
        : problem === "format" || amount === null
          ? t("bookings.pay.invalidAmount")
          : amount > due
            ? t("bookings.pay.overOutstanding", { due: formatBaht(due) })
            : null;
  const ref = tender === "CASH" ? "" : reference.trim();
  const referenceError = ref !== "" && !REFERENCE_RE.test(ref) ? t("bookings.pay.invalidReference") : null;
  const canSubmit = amount !== null && amountError === null && referenceError === null;

  const showQr = async () => {
    if (qrBusy) return;
    setQrBusy(true);
    setError(null);
    try {
      const r = await tripPaymentIntentAction(unitSlug, { bookingId });
      if (r.ok) setQr(r.value);
      else setError(failText(r));
    } catch {
      setError(t("common.failed"));
    } finally {
      setQrBusy(false);
    }
  };
  // เปิดจากปุ่ม "QR พร้อมเพย์" ⇒ ขอ QR ทันทีครั้งเดียว
  const autoQr = useRef(initialTender === "PROMPTPAY");
  useEffect(() => {
    if (!autoQr.current) return;
    autoQr.current = false;
    void showQr();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submit = () => {
    if (amount === null || !canSubmit) return;
    const idempotencyKey = intentKey("pay", seed, [bookingId, amount, tender, ref === "" ? null : ref]);
    void run(() => recordTripPaymentAction(unitSlug, { bookingId, amountSatang: amount, tender, idempotencyKey, ...(ref === "" ? {} : { reference: ref }) }), onClose);
  };

  return (
    <BkDialog
      data-testid="trips-pay-dialog"
      title={t("bookings.pay.title", { code: vm.row.code })}
      busy={busy}
      dirty={dirty}
      onClose={onClose}
      footer={
        <>
          <button type="button" data-testid="trips-pay-confirm" className={BTN_PRIMARY} disabled={busy || qrBusy || !canSubmit} onClick={submit}>
            {promptpay ? t("bookings.pay.received") : t("bookings.pay.confirm")}
          </button>
          <button type="button" className={BTN} onClick={close}>
            {t("common.cancel")}
          </button>
        </>
      }
    >
      <KV label={t("bookings.detail.outstanding")} value={X.money(due)} strong />
      <div className="flex min-w-0 flex-col gap-1">
        <span className="text-sm font-medium text-[color:var(--color-ink)]">{t("bookings.pay.tender")}</span>
        <div role="group" aria-label={t("bookings.pay.tender")} className="grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-4">
          {PAY_TENDERS.map((code) => (
            <button
              key={code}
              type="button"
              data-testid={`trips-pay-tender-${code}`}
              aria-pressed={tender === code}
              disabled={busy}
              onClick={() => setTender(code)}
              className={`inline-flex min-h-11 items-center justify-center rounded-lg px-3 text-sm ${
                tender === code ? "border-2 border-[color:var(--color-ink)] font-bold text-[color:var(--color-ink)]" : "border border-[color:var(--color-line)] text-[color:var(--color-ink-soft)] hover:bg-[color:var(--color-surface-2)]"
              }`}
            >
              {X.tender(code)}
            </button>
          ))}
        </div>
      </div>

      {promptpay ? (
        <div className="flex min-w-0 flex-col items-start gap-2">
          <div className="w-full min-w-0">
            <Field label={t("bookings.pay.amountLocked")} hint={t("bookings.pay.promptpayLocked")}>
              <input data-testid="trips-pay-amount-locked" className={`${INPUT} bg-[color:var(--color-surface-2)] text-right tabular-nums`} readOnly aria-readonly="true" value={formatBaht(qr ? qr.amountSatang : due)} />
            </Field>
          </div>
          {qr ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img data-testid="trips-pay-qr" src={qr.svgDataUrl} alt={t("bookings.pay.qrAlt", { name: qr.displayName })} className="h-56 w-56 max-w-full rounded-lg border border-[color:var(--color-line)] bg-white p-2" />
              <p className="text-sm text-[color:var(--color-ink)] [overflow-wrap:anywhere]">{qr.displayName}</p>
              <p className="text-base font-bold tabular-nums text-[color:var(--color-ink)]">{t("bookings.pay.qrAmount", { amount: formatBaht(qr.amountSatang) })}</p>
            </>
          ) : (
            <>
              <button type="button" data-testid="trips-pay-show-qr" className={BTN} disabled={busy || qrBusy} onClick={() => void showQr()}>
                {qrBusy ? t("bookings.pay.qrLoading") : t("bookings.pay.showQr")}
              </button>
              <p className="text-sm text-[color:var(--color-ink-soft)]">{t("bookings.pay.qrFirst")}</p>
            </>
          )}
        </div>
      ) : (
        <div className="flex min-w-0 flex-col gap-1">
          <Field label={t("bookings.pay.amount")} hint={t("bookings.pay.outstanding", { due: formatBaht(due) })}>
            <input
              data-testid="trips-pay-amount"
              className={`${INPUT} text-right tabular-nums`}
              inputMode="decimal"
              autoComplete="off"
              value={amountText}
              aria-invalid={amountError !== null}
              aria-describedby={amountError !== null ? "trips-pay-amount-error" : undefined}
              onChange={(e) => setAmountText(e.target.value)}
            />
          </Field>
          <FieldError id="trips-pay-amount-error" text={amountError} />
        </div>
      )}

      {tender === "CASH" ? (
        <p data-testid="trips-pay-cash-note" className="rounded-lg border border-dashed border-[color:var(--color-ink-soft)] px-3 py-2 text-sm font-medium text-[color:var(--color-ink)]">
          {t("bookings.pay.cashNote")}
        </p>
      ) : (
        <div className="flex min-w-0 flex-col gap-1">
          <Field label={t("bookings.pay.reference")}>
            <input
              data-testid="trips-pay-reference"
              className={INPUT}
              maxLength={64}
              autoComplete="off"
              value={reference}
              aria-invalid={referenceError !== null}
              aria-describedby={referenceError !== null ? "trips-pay-reference-error" : undefined}
              onChange={(e) => setReference(e.target.value)}
            />
          </Field>
          <FieldError id="trips-pay-reference-error" text={referenceError} />
        </div>
      )}
      <ErrorLine text={error} />
    </BkDialog>
  );
}

// ═══════════════ ยกเลิกการจองที่ยังไม่จ่าย (ถือที่ / รออนุมัติ) ═══════════════
export function CancelBookingDialog({ unitSlug, vm, onClose }: { unitSlug: string; vm: BookingDetailVM; onClose: () => void }) {
  const { t } = useBkText();
  const { busy, error, run } = useBkRunner();
  const [seed] = useState(() => newSeed());
  const [reason, setReason] = useState("");
  const text = reason.trim();
  const dirty = reason !== "";
  const close = useGuardedClose(onClose, busy, dirty);
  const bookingId = vm.row.bookingId;
  const submit = () => {
    if (text === "") return;
    void run(() => cancelTripBookingAction(unitSlug, { bookingId, mode: "EXECUTE", reason: text, reasonKind: "CUSTOMER", idempotencyKey: intentKey("cxl", seed, [bookingId, text]) }), onClose);
  };
  return (
    <BkDialog
      data-testid="trips-cancel-bk-dialog"
      title={t("bookings.cancel.title", { code: vm.row.code })}
      busy={busy}
      dirty={dirty}
      onClose={onClose}
      footer={
        <>
          <button type="button" data-testid="trips-cancel-bk-confirm" className={BTN_DANGER} disabled={busy || text === ""} onClick={submit}>
            {t("bookings.cancel.confirm")}
          </button>
          <button type="button" className={BTN} onClick={close}>
            {t("common.close")}
          </button>
        </>
      }
    >
      <p className="text-sm text-[color:var(--color-ink)]">{t("bookings.cancel.summary", { seats: vm.travellers.seats })}</p>
      <Field label={t("bookings.cancel.reason")} hint={t("bookings.cancel.reasonHint")}>
        <textarea data-testid="trips-cancel-bk-reason" className={`${INPUT} min-h-24`} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />
      </Field>
      <ErrorLine text={error} />
    </BkDialog>
  );
}

// ═══════════════ อนุมัติ / ปฏิเสธคำขอจอง ═══════════════
export function ApproveDialog({ unitSlug, vm, decision, onClose }: { unitSlug: string; vm: BookingDetailVM; decision: "APPROVE" | "REJECT"; onClose: () => void }) {
  const X = useBkText();
  const { t, D, T } = X;
  const { busy, error, run } = useBkRunner();
  const [reason, setReason] = useState("");
  const text = reason.trim();
  const dirty = reason !== "";
  const close = useGuardedClose(onClose, busy, dirty);
  const reject = decision === "REJECT";
  const row = vm.row;
  const submit = () => {
    if (reject && text === "") return;
    void run(
      () => approveTripBookingAction(unitSlug, { bookingId: row.bookingId, expectedVersion: row.version, decision, ...(text === "" ? {} : { reason: text }) }),
      onClose,
      (out) => (out.code === "STATE_CONFLICT" ? t("bookings.approve.conflict") : null),
    );
  };
  return (
    <BkDialog
      data-testid="trips-approve-dialog"
      title={t("bookings.approve.title", { code: row.code })}
      busy={busy}
      dirty={dirty}
      onClose={onClose}
      footer={
        <>
          <button type="button" data-testid="trips-approve-confirm" className={reject ? BTN_DANGER : BTN_PRIMARY} disabled={busy || (reject && text === "")} onClick={submit}>
            {t("bookings.approve.confirm")}
          </button>
          <button type="button" className={BTN} onClick={close}>
            {t("common.close")}
          </button>
        </>
      }
    >
      <p className="text-base font-bold text-[color:var(--color-ink)]">{reject ? t("bookings.approve.reject") : t("bookings.approve.approve")}</p>
      <p className="text-sm text-[color:var(--color-ink)] [overflow-wrap:anywhere]">
        {t("bookings.approve.summary", { customer: vm.customer.name ?? t("bookings.row.noBooker"), trip: T(row.productTitleTh, row.productTitleEn), date: D.short(row.travelDate), amount: formatBaht(vm.payableSatang) })}
      </p>
      <p className="text-sm text-[color:var(--color-ink-soft)]">{X.paxLine(row)}</p>
      <Field label={t("bookings.approve.reason")} hint={reject ? t("bookings.approve.reasonRequired") : t("bookings.approve.reasonOptional")}>
        <textarea data-testid="trips-approve-reason" className={`${INPUT} min-h-24`} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />
      </Field>
      <ErrorLine text={error} />
    </BkDialog>
  );
}

// ═══════════════ เงินสดหน้าร้านรายวัน (อ่านอย่างเดียว · ปิดยอดยังไม่เปิดใช้) ═══════════════
export function CashDialog({ cash, base, q, onClose }: { cash: CashDayVM; base: string; q: BkQuery; onClose: () => void }) {
  const X = useBkText();
  const { t, D } = X;
  const router = useRouter();
  const pickDay = (value: string) => {
    if (YMD_RE.test(value) && value !== cash.businessDate) router.push(bkHref(base, q, { day: value }), { scroll: false });
  };
  return (
    <BkDialog
      data-testid="trips-cash-dialog"
      title={t("bookings.cash.dialogTitle", { date: D.short(cash.businessDate) })}
      busy={false}
      dirty={false}
      onClose={onClose}
      wide
      footer={
        <>
          <NotYetButton data-testid="trips-cash-close" label={t("bookings.cash.close")} hint={t("bookings.notYet.cashClose")} />
          <button type="button" className={BTN} onClick={onClose}>
            {t("common.close")}
          </button>
        </>
      }
    >
      <p className="rounded-lg border border-dashed border-[color:var(--color-ink-soft)] px-3 py-2 text-sm font-medium text-[color:var(--color-ink)]">{t("bookings.cash.separate")}</p>
      <Field label={t("bookings.cash.date")}>
        <input data-testid="trips-cash-date" type="date" className={INPUT} defaultValue={cash.businessDate} key={cash.businessDate} max={cash.unit.today} onChange={(e) => pickDay(e.target.value)} />
      </Field>
      <KV label={t("bookings.cash.expected", { date: D.short(cash.businessDate) })} value={X.money(cash.expectedSatang)} strong />
      <KV label={t("bookings.cash.totalReceived")} value={formatBaht(cash.receivedSatang)} />
      <KV label={t("bookings.cash.totalRefunded")} value={formatBaht(cash.refundedSatang)} />

      <h3 className="pt-1 text-sm font-bold text-[color:var(--color-ink)]">{t("bookings.cash.byTender")}</h3>
      <ul className="flex min-w-0 flex-col">
        {PAY_TENDERS.map((code) => (
          <li key={code} data-testid={`trips-cash-tender-${code}`} className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 border-b border-[color:var(--color-line)] py-2 text-sm last:border-b-0">
            <span className="font-medium text-[color:var(--color-ink)]">{X.tender(code)}</span>
            <span className="tabular-nums text-[color:var(--color-ink-soft)]">
              {t("bookings.cash.received", { amount: formatBaht(cash.byTender[code].receivedSatang) })} · {t("bookings.cash.refunded", { amount: formatBaht(cash.byTender[code].refundedSatang) })}
            </span>
          </li>
        ))}
      </ul>

      <h3 className="pt-1 text-sm font-bold text-[color:var(--color-ink)]">{t("bookings.cash.events")}</h3>
      {cash.events.length === 0 ? (
        <p className="text-sm text-[color:var(--color-ink-soft)]">{t("bookings.cash.noEvents")}</p>
      ) : (
        <ul className="flex min-w-0 flex-col">
          {cash.events.map((e) => (
            <li key={e.id} className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 border-b border-[color:var(--color-line)] py-2 text-sm last:border-b-0">
              <span className="min-w-0 [overflow-wrap:anywhere]">
                {X.stamp(e.atLocal)} ·{" "}
                <Link href={bkHref(base, q, { b: e.bookingId })} scroll={false} onClick={onClose} className="inline-flex min-h-11 items-center font-medium underline underline-offset-2">
                  {e.code}
                </Link>{" "}
                · {X.eventKind(e.kind)} · {X.tender(e.tender)}
              </span>
              <span className="shrink-0 tabular-nums text-[color:var(--color-ink)]">{formatBaht(e.amountSatang)}</span>
            </li>
          ))}
        </ul>
      )}
      {cash.truncated ? (
        <p role="status" className="text-sm font-medium text-[color:var(--color-ink)]">
          {t("bookings.cash.truncated", { shown: cash.shown, total: cash.total })}
        </p>
      ) : null}
    </BkDialog>
  );
}
