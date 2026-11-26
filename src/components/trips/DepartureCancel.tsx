"use client";
// TRIPS T1.6a1 ▸ ร้านยกเลิกรอบที่มีคนจอง (ใบสั่ง T1.6 §9): กล่องยืนยัน (พิมพ์จำนวนการจอง) · การ์ดสถานะของรอบที่ร้านยกเลิก · ส่วนทางออกในลิ้นชักการจอง
//   🔴 เขียนผ่าน cancel-departure-actions เท่านั้น · ชื่อช่องฟอร์มตาม §9 · ข้อความไม่มีรหัสดิบ · ไม่สัญญา "คืนอัตโนมัติ"/ระยะเวลา · a1 ไม่มีปุ่มย้าย
import { useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import type { DeparturePanelVM } from "@/lib/modules/trips";
import type { BookingCancelChoiceVM } from "@/lib/modules/trips/cancel-departure";
import { cancelDepartureWithBookingsAction, resolveCancelledBookingAction } from "@/lib/modules/trips/cancel-departure-actions";
import { decideTripRefundAction, executeTripRefundAction } from "@/lib/modules/trips/money-actions";
import { BTN, Dialog, ErrorLine, INPUT, useRunner } from "./ProductsScreenParts";
import { BTN_DANGER, useDepDates, useTitle } from "./DepartureParts";
import { formatBaht } from "./trips-shared";

const KINDS = ["EXTERNAL", "MIN_NOT_MET", "SHOP_FAULT"] as const;
const TRANSFER_DUE_DAYS = 3;
const BOX = "rounded-lg border border-[color:var(--color-line)] bg-[color:var(--color-surface-2)] px-3 py-2 text-sm text-[color:var(--color-ink)]";
const newKey = (p: string) => `${p}${globalThis.crypto.randomUUID().replace(/-/g, "")}`;
/** ลิงก์รายการการจองที่กรอง "รอทางเลือก" (ช่อง dep ของ URL เดิม · ตัวโหลดแปลงค่า cancel:*) */
export const cancelListHref = (unitSlug: string, mode: "pending" | "overdue") => `/app/u/${unitSlug}/trips/bookings?when=all&dep=${encodeURIComponent(`cancel:${mode}`)}`;

/** กล่องยืนยันยกเลิกรอบที่มีคน (trips-depcancel-dialog) */
export function DepartureCancelDialog({ unitSlug, vm, onClose }: { unitSlug: string; vm: DeparturePanelVM; onClose: () => void }) {
  const t = useTranslations("trips");
  const T = useTitle();
  const D = useDepDates();
  const { busy, error, run } = useRunner(t("common.failed"));
  const d = vm.departure;
  const c = vm.cancel?.confirm ?? { bookings: 0, heldSatang: 0, agency: 0, noMoney: 0 };
  const [kind, setKind] = useState<(typeof KINDS)[number]>("EXTERNAL");
  const [reason, setReason] = useState("");
  const [typed, setTyped] = useState("");
  const [key] = useState(() => newKey("dc"));
  const valid = reason.trim().length >= 3 && reason.trim().length <= 500 && typed.trim() === String(c.bookings);
  const submit = (form: FormData) => run(() => cancelDepartureWithBookingsAction(unitSlug, form), onClose);
  return (
    <Dialog title={t("depCancel.title", { date: D.short(d.localDate), title: T(d.productTitle, d.productTitleEn) })} onClose={onClose} closeLabel={t("common.close")} busy={busy} dirty={reason !== "" || typed !== ""}>
      <form
        data-testid="trips-depcancel-dialog"
        className="flex min-w-0 flex-col gap-3 pb-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (valid && !busy) void submit(new FormData(e.currentTarget));
        }}
      >
        <input type="hidden" name="departureId" value={d.departureId} />
        <input type="hidden" name="expectedVersion" value={d.version} />
        <input type="hidden" name="idempotencyKey" value={key} />
        <fieldset className="flex min-w-0 flex-col gap-2">
          <legend className="text-sm font-bold text-[color:var(--color-ink)]">{t("depCancel.kindLegend")}</legend>
          {KINDS.map((k) => (
            <label key={k} className="flex min-h-11 items-center gap-2 text-sm text-[color:var(--color-ink)]">
              <input type="radio" name="kind" value={k} data-testid={`trips-depcancel-kind-${k}`} checked={kind === k} onChange={() => setKind(k)} />
              {t(`depCancel.kind.${k}`)}
            </label>
          ))}
        </fieldset>
        <label className="flex min-w-0 flex-col gap-1 text-sm text-[color:var(--color-ink)]">
          {t("depCancel.reasonLabel")}
          <textarea name="reason" className={`${INPUT} min-h-20`} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />
        </label>
        <p role="status" className={BOX}>
          {t("depCancel.summary", { n: c.bookings, x: formatBaht(c.heldSatang), m: c.agency, k: c.noMoney })}
        </p>
        <p className="text-sm text-[color:var(--color-muted)]">{t("depCancel.note")}</p>
        <label className="flex min-w-0 flex-col gap-1 text-sm text-[color:var(--color-ink)]">
          {t("depCancel.confirmLabel", { n: c.bookings })}
          <input name="confirmBookings" inputMode="numeric" autoComplete="off" className={INPUT} value={typed} onChange={(e) => setTyped(e.target.value.replace(/\D/g, ""))} />
        </label>
        {typed !== "" && typed !== String(c.bookings) ? (
          <p data-testid="trips-depcancel-mismatch" role="status" className="text-sm text-[color:var(--color-danger)]">
            {t("depCancel.mismatch", { typed, n: c.bookings })}
          </p>
        ) : null}
        {error ? (
          <p data-testid="trips-depcancel-error" role="alert" className="rounded-lg border border-[color:var(--color-danger)] px-3 py-2 text-sm text-[color:var(--color-danger)]">
            {error}
          </p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <button type="submit" data-testid="trips-depcancel-submit" className={BTN_DANGER} disabled={busy || !valid}>
            {t("depCancel.submit")}
          </button>
          <button type="button" className={BTN} onClick={onClose} disabled={busy}>
            {t("common.cancel")}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

/** การ์ดสถานะของรอบที่ร้านยกเลิก (trips-depcancel-status) + ลิงก์รายการการจองที่ยังรอ · a1 ไม่แสดงจำนวนย้าย (H6) · รออนุมัติแยกจากต้องโอน (H1) */
export function DepartureCancelStatus({ unitSlug, vm }: { unitSlug: string; vm: DeparturePanelVM }) {
  const t = useTranslations("trips");
  const s = vm.cancel?.status;
  if (!s) return null;
  return (
    <section data-testid="trips-depcancel-status" className={`${BOX} flex min-w-0 flex-col gap-1`}>
      <p className="font-bold">{t("depCancel.statusTitle")}</p>
      <p className="break-words">
        {t("depCancel.status", { a: s.pending, o: s.overdue, qa: s.awaitingApproval, q: formatBaht(s.awaitingApprovalSatang), c: s.approved, y: formatBaht(s.toTransferSatang), d: s.refunded, e: s.noMoney })}
      </p>
      <Link data-testid="trips-depcancel-list" href={cancelListHref(unitSlug, "pending")} className="inline-flex min-h-11 items-center font-medium underline underline-offset-2">
        {t("depCancel.list")}
      </Link>
    </section>
  );
}

/** ปุ่มกดครั้งเดียว (H2): กันกดซ้ำแบบ synchronous (ref) · กุญแจเดียวต่อปุ่มหนึ่งตัวที่เรนเดอร์ (กดหลายครั้ง = คำขอเดียว) · ผิดพลาด ⇒ รีเฟรชลิ้นชักให้เห็นสถานะจริง */
function OnceButton({ testid, prefix, className, disabled, label, act, name, value }: { testid: string; prefix: string; className: string; disabled?: boolean; label: string; act: (key: string) => Promise<{ ok: boolean; message?: string; messageTh?: string; code?: string }>; name?: string; value?: string }) {
  const t = useTranslations("trips");
  const { busy, error, run, router } = useRunner(t("common.failed"));
  const [key] = useState(() => newKey(prefix));
  const inflight = useRef(false);
  const click = async () => {
    if (inflight.current) return;
    inflight.current = true;
    try {
      if (!(await run(() => act(key)))) router.refresh();
    } finally {
      inflight.current = false;
    }
  };
  return (
    <>
      <button type="button" data-testid={testid} name={name} value={value} className={className} disabled={busy || disabled} onClick={() => void click()}>
        {label}
      </button>
      <ErrorLine text={error} />
    </>
  );
}

/** ฟอร์มอนุมัติ/บันทึกโอนคืนของคำขอติดป้าย (H1): ช่องตรงกับ input ของ action เดิม (ไม่มีช่องปรับยอด) · กุญแจซ่อนหนึ่งตัวต่อการเรนเดอร์ · กันกดซ้ำ (ref) · ผิดพลาด ⇒ รีเฟรช */
function RefundForm({ testid, prefix, label, act, children }: { testid: string; prefix: string; label: string; act: (input: Record<string, string>) => Promise<{ ok: boolean; message?: string; messageTh?: string; code?: string }>; children: ReactNode }) {
  const t = useTranslations("trips");
  const { busy, error, run, router } = useRunner(t("common.failed"));
  const [key] = useState(() => newKey(prefix));
  const inflight = useRef(false);
  const submit = async (form: HTMLFormElement) => {
    if (inflight.current) return;
    inflight.current = true;
    try {
      const input = Object.fromEntries([...new FormData(form).entries()].map(([k, v]) => [k, String(v)]));
      if (!(await run(() => act(input)))) router.refresh();
    } finally {
      inflight.current = false;
    }
  };
  return (
    <form
      data-testid={testid}
      className="flex min-w-0 flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        void submit(e.currentTarget);
      }}
    >
      {children}
      <input type="hidden" name="idempotencyKey" value={key} />
      <button type="submit" className={BTN} disabled={busy}>
        {label}
      </button>
      <ErrorLine text={error} />
    </form>
  );
}

/** ส่วนทางออกในลิ้นชักการจอง: คืนเงินเต็ม (มีเงิน) · ปิดการจอง (ไม่มีเงิน) · อนุมัติ/บันทึกโอนคืนของคำขอติดป้าย (H1 · action เดิม) · คำเตือนโอนค้าง (ภายในร้าน · N5) */
export function BookingCancelChoice({ unitSlug, bookingId, tz, cc }: { unitSlug: string; bookingId: string; tz: string; cc: BookingCancelChoiceVM }) {
  const t = useTranslations("trips");
  const locale = useLocale();
  const [reason, setReason] = useState("");
  const when = new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "th-TH", { dateStyle: "medium", timeStyle: "short", timeZone: tz }).format(new Date(cc.decideBy));
  const pending = cc.choice === "PENDING";
  const rq = cc.refund;
  const resolve = (choice: "REFUND" | "NO_MONEY") => (key: string) => {
    const f = new FormData();
    f.set("bookingId", bookingId);
    f.set("expectedVersion", String(cc.version));
    f.set("choice", choice);
    f.set("idempotencyKey", key);
    if (reason.trim()) f.set("reason", reason.trim());
    return resolveCancelledBookingAction(unitSlug, f);
  };
  const reasonOk = !cc.reasonRequired || reason.trim().length >= 3;
  const statusText = rq ? (rq.status === "QUOTED" ? "depCancel.reqQuoted" : rq.status === "APPROVED" ? "depCancel.reqApproved" : rq.status === "DONE" ? "depCancel.reqDone" : "depCancel.choiceRefund") : null;
  return (
    <section data-testid="trips-bk-depcancel" className={`${BOX} flex min-w-0 flex-col gap-2`}>
      <p className="font-bold">{t("depCancel.drawerTitle")}</p>
      {pending ? <p>{cc.overdue ? t("depCancel.drawerOverdue") : t("depCancel.drawerPending", { date: when })}</p> : null}
      {cc.choice === "REFUND" && rq && statusText ? <p data-testid="trips-bk-depcancel-state">{t(statusText, { x: formatBaht(rq.amountSatang) })}</p> : null}
      {cc.choice === "NO_MONEY" ? <p>{t("depCancel.choiceNoMoney")}</p> : null}
      {cc.choice === "MOVED" ? <p>{t("depCancel.choiceMoved")}</p> : null}
      {cc.choice === "AGENCY_MONEY_HELD" ? <p>{t("depCancel.choiceAgency")}</p> : null}
      {rq?.transferDue ? (
        <p data-testid="trips-bk-refund-transfer-due" role="alert" className="text-[color:var(--color-danger)]">
          {t("depCancel.transferDue", { days: TRANSFER_DUE_DAYS })}
        </p>
      ) : null}
      {pending && cc.reasonRequired && (cc.canRefund || cc.canClose) ? (
        <label className="flex min-w-0 flex-col gap-1">
          {t("depCancel.reasonAgency")}
          <input name="reason" className={INPUT} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />
        </label>
      ) : null}
      {cc.canRefund ? <OnceButton testid="trips-bk-resolve-refund" prefix="rf" className={BTN} disabled={!reasonOk} label={t("depCancel.refund", { x: formatBaht(cc.moneySatang) })} act={resolve("REFUND")} /> : null}
      {cc.canClose ? <OnceButton testid="trips-bk-resolve-close" prefix="nm" name="choice" value="NO_MONEY" className={BTN_DANGER} disabled={!reasonOk} label={t("depCancel.close")} act={resolve("NO_MONEY")} /> : null}
      {cc.canApprove && rq ? (
        <RefundForm testid="trips-bk-depcancel-approve" prefix="ap" label={t("depCancel.approve", { x: formatBaht(rq.amountSatang) })} act={(input) => decideTripRefundAction(unitSlug, input)}>
          <input type="hidden" name="requestId" value={rq.requestId} />
          <input type="hidden" name="decision" value="APPROVE" />
        </RefundForm>
      ) : null}
      {cc.canExecute && rq ? (
        <RefundForm testid="trips-bk-depcancel-transfer" prefix="ex" label={t("depCancel.execute", { x: formatBaht(rq.amountSatang) })} act={(input) => executeTripRefundAction(unitSlug, input)}>
          <input type="hidden" name="requestId" value={rq.requestId} />
          <label className="flex min-w-0 flex-col gap-1">
            {t("depCancel.executeTender")}
            <select name="bankTender" className={INPUT} defaultValue="TRANSFER">
              <option value="TRANSFER">{t("depCancel.tenderTransfer")}</option>
              <option value="PROMPTPAY">{t("depCancel.tenderPromptpay")}</option>
            </select>
          </label>
        </RefundForm>
      ) : null}
    </section>
  );
}
