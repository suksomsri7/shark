"use client";
// TRIPS T1.6a1 ▸ ร้านยกเลิกรอบที่มีคนจอง (ใบสั่ง T1.6 §9): กล่องยืนยัน (พิมพ์จำนวนการจอง) · การ์ดสถานะของรอบที่ร้านยกเลิก · ส่วนทางออกในลิ้นชักการจอง
//   🔴 เขียนผ่าน cancel-departure-actions เท่านั้น · ชื่อช่องฟอร์มตาม §9 · ข้อความไม่มีรหัสดิบ · ไม่สัญญา "คืนอัตโนมัติ"/ระยะเวลา · a1 ไม่มีปุ่มย้าย
import { useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import type { DeparturePanelVM } from "@/lib/modules/trips";
import type { BookingCancelChoiceVM } from "@/lib/modules/trips/cancel-departure";
import { cancelDepartureWithBookingsAction, resolveCancelledBookingAction } from "@/lib/modules/trips/cancel-departure-actions";
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

/** การ์ดสถานะของรอบที่ร้านยกเลิก (trips-depcancel-status) + ลิงก์รายการการจองที่ยังรอ */
export function DepartureCancelStatus({ unitSlug, vm }: { unitSlug: string; vm: DeparturePanelVM }) {
  const t = useTranslations("trips");
  const s = vm.cancel?.status;
  if (!s) return null;
  return (
    <section data-testid="trips-depcancel-status" className={`${BOX} flex min-w-0 flex-col gap-1`}>
      <p className="font-bold">{t("depCancel.statusTitle")}</p>
      <p className="break-words">{t("depCancel.status", { a: s.pending, o: s.overdue, b: s.moved, c: s.refunding, y: formatBaht(s.toTransferSatang), d: s.refunded, e: s.noMoney })}</p>
      <Link data-testid="trips-depcancel-list" href={cancelListHref(unitSlug, "pending")} className="inline-flex min-h-11 items-center font-medium underline underline-offset-2">
        {t("depCancel.list")}
      </Link>
    </section>
  );
}

/** ส่วนทางออกในลิ้นชักการจอง: คืนเงินเต็ม (มีเงิน) · ปิดการจอง (ไม่มีเงิน) · คำเตือนโอนค้าง (ภายในร้าน · N5) */
export function BookingCancelChoice({ unitSlug, bookingId, tz, cc }: { unitSlug: string; bookingId: string; tz: string; cc: BookingCancelChoiceVM }) {
  const t = useTranslations("trips");
  const locale = useLocale();
  const { busy, error, run } = useRunner(t("common.failed"));
  const [reason, setReason] = useState("");
  const when = new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "th-TH", { dateStyle: "medium", timeStyle: "short", timeZone: tz }).format(new Date(cc.decideBy));
  const pending = cc.choice === "PENDING";
  const go = (choice: "REFUND" | "NO_MONEY") => {
    const f = new FormData();
    f.set("bookingId", bookingId);
    f.set("expectedVersion", String(cc.version));
    f.set("choice", choice);
    f.set("idempotencyKey", newKey(choice === "REFUND" ? "rf" : "nm"));
    if (reason.trim()) f.set("reason", reason.trim());
    return run(() => resolveCancelledBookingAction(unitSlug, f));
  };
  const reasonOk = !cc.reasonRequired || reason.trim().length >= 3;
  return (
    <section data-testid="trips-bk-depcancel" className={`${BOX} flex min-w-0 flex-col gap-2`}>
      <p className="font-bold">{t("depCancel.drawerTitle")}</p>
      {pending ? <p>{cc.overdue ? t("depCancel.drawerOverdue") : t("depCancel.drawerPending", { date: when })}</p> : null}
      {cc.choice === "REFUND" && cc.refund ? <p>{t("depCancel.choiceRefund", { x: formatBaht(cc.refund.amountSatang) })}</p> : null}
      {cc.choice === "NO_MONEY" ? <p>{t("depCancel.choiceNoMoney")}</p> : null}
      {cc.choice === "MOVED" ? <p>{t("depCancel.choiceMoved")}</p> : null}
      {cc.choice === "AGENCY_MONEY_HELD" ? <p>{t("depCancel.choiceAgency")}</p> : null}
      {cc.refund?.transferDue ? (
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
      {cc.canRefund ? (
        <button type="button" data-testid="trips-bk-resolve-refund" className={BTN} disabled={busy || !reasonOk} onClick={() => void go("REFUND")}>
          {t("depCancel.refund", { x: formatBaht(cc.moneySatang) })}
        </button>
      ) : null}
      {cc.canClose ? (
        <button type="button" data-testid="trips-bk-resolve-close" name="choice" value="NO_MONEY" className={BTN_DANGER} disabled={busy || !reasonOk} onClick={() => void go("NO_MONEY")}>
          {t("depCancel.close")}
        </button>
      ) : null}
      <ErrorLine text={error} />
    </section>
  );
}
