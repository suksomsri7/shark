"use client";

// InterimPayDialog.tsx — จอชำระเงินชั่วคราวของ P1.3 (มติ Q5): เงินสด (รับ/ทอน) + PromptPay QR ล็อกยอด ยืนยันด้วยมือ
//   P1.6 ลบไฟล์นี้ + SaleDone แล้วใส่ modal ตามภาพ 02 ด้วย props ชุดเดียวกัน (สเปก §1.3) — วงจรคีย์บิลอยู่ที่ RegisterScreen
//   รูปแบบ: ช่องวิธีจ่ายสูง 78 มุม 16 (ภาพ 02 .paym) · ยอดใหญ่ 40 หนา (19ค .due) · การ์ดข้อผิดพลาด ขอบ 1.5 สีอันตราย มุม 18 (19ค .errc)
// 🔴 ยอดที่จ่าย = ยอดจาก quote ของเซิร์ฟเวอร์เสมอ (dueSatang) · ทุกช่องจ่าย ≥ 1 สตางค์ · บิล 0 บาท = payMethods [] (ไม่มีช่องให้เลือก)
// 🔴 เงินสดรับน้อยกว่ายอด = ปุ่มยืนยันปิด · ผลยังไม่แน่ใจ (unknown) = มีแค่ "ลองอีกครั้ง" (ส่งชุดเดิม คีย์เดิม — สเปก §3.4 ข้อ 6)
// 🔴 ไม่แสดง message ของเซิร์ฟเวอร์เลย — ข้อความมาจากคีย์ errors.* (refusalMessageKey) · รหัสอยู่แค่ data-code ให้ข้อสอบอ่าน

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { PromptPayQr } from "@/components/PromptPayQr";
import { promptpayPayload } from "@/lib/payment/promptpay";
import { moneyText, type RegisterSaleStatus } from "@/lib/modules/pos/register-shared";
import { parseHundredths } from "./LineEditor";
import { REG_DIALOG_PANEL, RegisterDialog, SheetGrab } from "./RegisterDialog";
import { RegisterIcon } from "./RegisterIcon";

export type PayPhase = "form" | "sending" | "unknown" | "conflict";
export type PayError = { code: string; key: string; values?: Record<string, string | number> };
export type PayChoice = { method: "CASH" | "PROMPTPAY" | "NONE"; receivedSatang?: number };

type Props = {
  dueSatang: number;
  /** B2.2 N1: quote ของตะกร้าปัจจุบันยังไม่มา (เพิ่งแก้ตะกร้า/ถอดสมาชิก/PAYMENT_MISMATCH) ⇒ ยืนยันไม่ได้ + ป้าย "กำลังโหลด" */
  quotePending: boolean;
  /** B2.3 N-a: quote ของตะกร้าปัจจุบันล้ม ⇒ แสดงข้อความที่แปลงจากรหัสแล้ว (การ์ดข้อผิดพลาดเดียวกัน) + ยืนยันไม่ได้ (ไม่ใช่ "กำลังโหลด" ค้าง) */
  quoteError: PayError | null;
  itemCount: number;
  promptpayId: string | null;
  phase: PayPhase;
  error: PayError | null;
  conflict: { receiptNo: string | null; saleStatus: RegisterSaleStatus } | null;
  memberAttached: boolean;
  salesHref: string;
  onConfirm: (c: PayChoice) => void;
  onRetry: () => void;
  onClose: () => void;
  onNewBill: () => void;
  onRemoveMember: () => void;
};

const QUICK = [10_000, 50_000, 100_000];
const STATUS_KEY: Record<RegisterSaleStatus, string> = { PAID: "pay.statusPaid", VOIDED: "pay.statusVoided", REFUNDED: "pay.statusRefunded" };

export function InterimPayDialog(p: Props) {
  const t = useTranslations("pos.register");
  const tc = useTranslations("common");
  const [method, setMethod] = useState<"CASH" | "PROMPTPAY">("CASH");
  const [received, setReceived] = useState("");
  const recvRef = useRef<HTMLInputElement>(null);
  const zero = p.dueSatang === 0;
  // error ของการส่งมาก่อน (ผลของการกดยืนยันครั้งล่าสุด) · ไม่มี ⇒ error ของ quote ปัจจุบัน
  const err = p.error ?? p.quoteError;
  const busy = p.phase !== "form";
  const recvSatang = parseHundredths(received);
  const cashOk = recvSatang !== null && received.trim() !== "" && recvSatang >= p.dueSatang;
  const change = cashOk ? recvSatang - p.dueSatang : null;
  // QR ล็อกยอดตาม quote ล่าสุด (ไม่ใช่ static) — ID ผิดรูป = ไม่มี QR (กล่องช่วยเหลือของ PromptPayQr)
  const qr = useMemo(() => {
    if (!p.promptpayId || zero) return null;
    try {
      return promptpayPayload({ id: p.promptpayId, amountSatang: p.dueSatang });
    } catch {
      return null;
    }
  }, [p.promptpayId, p.dueSatang, zero]);
  useEffect(() => {
    if (method === "CASH" && !zero) recvRef.current?.focus();
  }, [method, zero]);

  const canConfirm = !busy && !p.quotePending && !p.quoteError && (zero || (method === "CASH" ? cashOk : !!p.promptpayId));
  const confirm = () => {
    if (!canConfirm) return;
    if (zero) p.onConfirm({ method: "NONE" });
    else if (method === "CASH") p.onConfirm({ method: "CASH", receivedSatang: recvSatang ?? 0 });
    else p.onConfirm({ method: "PROMPTPAY" });
  };
  const tile = (on: boolean, off = false) =>
    `flex h-[78px] flex-col items-center justify-center gap-1.5 rounded-[16px] border text-[15px] font-semibold ${
      on ? "border-[color:var(--color-ink)] bg-[color:var(--color-surface-2)] shadow-[inset_0_0_0_1px_var(--color-ink)]" : ""
    } ${off ? "text-[color:var(--color-muted)]" : ""}`;

  return (
    <RegisterDialog onDismiss={p.onClose} locked={busy}>
      <div data-testid="pos-reg-paydlg" className={`${REG_DIALOG_PANEL} md:w-[480px]`} role="dialog" aria-modal="true" aria-label={t("pay.title")}>
        <SheetGrab />
        <div className="flex items-center gap-3">
          <RegisterIcon name="cash" size={18} />
          <h2 className="text-[19px] font-bold">{t("pay.title")}</h2>
          <span className="inline-flex h-7 items-center rounded-[8px] border px-[11px] text-[13px] text-[color:var(--color-ink-soft)]">{t("cart.itemCount", { count: p.itemCount })}</span>
          <span className="flex-1" />
          {!busy && (
            <button
              data-testid="pos-reg-paydlg-close"
              className="-mr-2 grid size-11 place-items-center rounded-[11px] text-[color:var(--color-muted)] hover:bg-[color:var(--color-surface-2)]"
              type="button"
              aria-label={t("cart.close")}
              onClick={p.onClose}
            >
              <RegisterIcon name="x" size={18} />
            </button>
          )}
        </div>

        <div>
          <div className="text-[13px] text-[color:var(--color-muted)]">{t("pay.due")}</div>
          <div data-testid="pos-reg-paydlg-due" className="text-[40px] font-bold leading-[1.1] tracking-[-0.02em] tabular-nums">
            {moneyText(p.dueSatang)}
          </div>
        </div>

        {err && (
          <div data-testid="pos-reg-paydlg-error" data-code={err.code} className="flex flex-col gap-3 rounded-[18px] border-[1.5px] border-[color:var(--color-danger)] p-5" role="alert">
            <div className="flex items-start gap-2.5 text-[17px] font-bold text-[color:var(--color-danger)]">
              <RegisterIcon name="warn" size={18} className="mt-0.5" />
              <span>{t.rich(err.key, { ...(err.values ?? {}), b: (c) => <b>{c}</b> })}</span>
            </div>
            {err.code === "MEMBER_RIGHTS_UNSUPPORTED" && p.memberAttached && (
              <button
                data-testid="pos-reg-paydlg-remove-member"
                className="btn btn-ghost h-11 self-start rounded-[13px] px-5 text-[15px]"
                type="button"
                onClick={p.onRemoveMember}
              >
                {t("pay.removeMember")}
              </button>
            )}
          </div>
        )}

        {p.phase === "conflict" && p.conflict && (
          <div data-testid="pos-reg-paydlg-conflict" className="flex flex-col gap-3 rounded-[18px] border-[1.5px] border-[color:var(--color-danger)] p-5" role="alert">
            <div className="flex items-start gap-2.5 text-[17px] font-bold text-[color:var(--color-danger)]">
              <RegisterIcon name="warn" size={18} className="mt-0.5" />
              <span>{t("errors.idempotencyConflict")}</span>
            </div>
            <p className="text-[14.5px] leading-[1.65] text-[color:var(--color-ink-soft)]">
              {t("pay.existingBill", { no: p.conflict.receiptNo ?? "-", status: t(STATUS_KEY[p.conflict.saleStatus]) })}
            </p>
            <div className="flex flex-wrap gap-2.5">
              <button data-testid="pos-reg-paydlg-new-bill" className="btn btn-primary h-12 rounded-[13px] px-5 text-[15px]" type="button" autoFocus onClick={p.onNewBill}>
                {t("pay.newBill")}
              </button>
              <Link data-testid="pos-reg-paydlg-bills" className="btn btn-ghost h-12 rounded-[13px] px-5 text-[15px]" href={p.salesHref}>
                {t("tabs.bills")}
              </Link>
            </div>
          </div>
        )}

        {p.phase === "unknown" && (
          <div data-testid="pos-reg-paydlg-unknown" className="flex flex-col gap-3 rounded-[18px] border-[1.5px] border-[color:var(--color-danger)] p-5" role="alert">
            <div className="flex items-start gap-2.5 text-[17px] font-bold text-[color:var(--color-danger)]">
              <RegisterIcon name="warn" size={18} className="mt-0.5" />
              <span>{t("errors.unknownResult")}</span>
            </div>
            <button data-testid="pos-reg-paydlg-retry" className="btn btn-primary h-14 rounded-[16px] text-[16px] font-bold" type="button" autoFocus onClick={p.onRetry}>
              {t("pay.retry")}
            </button>
          </div>
        )}

        {(p.phase === "form" || p.phase === "sending") && (
          <form
            data-testid="pos-reg-paydlg-form"
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              confirm();
            }}
          >
            {!zero && (
              <div className="grid grid-cols-2 gap-4" role="group" aria-label={t("pay.title")}>
                <button
                  data-testid="pos-reg-paydlg-method-cash"
                  className={tile(method === "CASH")}
                  type="button"
                  aria-pressed={method === "CASH"}
                  disabled={busy}
                  onClick={() => setMethod("CASH")}
                >
                  <RegisterIcon name="cash" size={18} />
                  {t("pay.cash")}
                </button>
                <button
                  data-testid="pos-reg-paydlg-method-promptpay"
                  className={tile(method === "PROMPTPAY", !p.promptpayId)}
                  type="button"
                  aria-pressed={method === "PROMPTPAY"}
                  disabled={busy || !p.promptpayId}
                  onClick={() => setMethod("PROMPTPAY")}
                >
                  <RegisterIcon name="qr" size={18} />
                  {t("pay.promptpay")}
                  {!p.promptpayId && <small className="px-2 text-center text-[12.5px] font-normal leading-tight">{t("pay.noPromptPay")}</small>}
                </button>
              </div>
            )}

            {!zero && method === "CASH" && (
              <div className="flex flex-col gap-3">
                <label className="flex flex-col gap-1.5 text-[13px] text-[color:var(--color-muted)]">
                  {t("pay.received")}
                  <input
                    data-testid="pos-reg-paydlg-received"
                    className="input h-14 rounded-[14px] text-[22px] font-bold tabular-nums text-[color:var(--color-ink)]"
                    ref={recvRef}
                    inputMode="decimal"
                    value={received}
                    placeholder="0"
                    disabled={busy}
                    onChange={(e) => setReceived(e.target.value)}
                  />
                </label>
                <div className="flex flex-wrap gap-2">
                  <button
                    data-testid="pos-reg-paydlg-quick-exact"
                    className="btn btn-ghost h-11 rounded-[13px] px-4 text-[15px]"
                    type="button"
                    disabled={busy}
                    onClick={() => setReceived(String(p.dueSatang / 100))}
                  >
                    {t("pay.exact")}
                  </button>
                  {QUICK.filter((v) => v >= p.dueSatang).map((v) => (
                    <button
                      key={v}
                      data-testid={`pos-reg-paydlg-quick-${v / 100}`}
                      className="btn btn-ghost h-11 rounded-[13px] px-4 text-[15px] tabular-nums"
                      type="button"
                      disabled={busy}
                      onClick={() => setReceived(String(v / 100))}
                    >
                      {moneyText(v)}
                    </button>
                  ))}
                </div>
                <div className="flex items-baseline justify-between rounded-[14px] bg-[color:var(--color-surface-2)] px-4 py-3">
                  <span className="text-[14px] text-[color:var(--color-ink-soft)]">{t("pay.change")}</span>
                  <span data-testid="pos-reg-paydlg-change" className="text-[22px] font-bold tabular-nums">
                    {change === null ? "-" : moneyText(change)}
                  </span>
                </div>
              </div>
            )}

            {!zero && method === "PROMPTPAY" && p.promptpayId && (
              <div className="flex flex-col items-center gap-3 rounded-[16px] border bg-[color:var(--color-surface-2)] p-4">
                <PromptPayQr payload={qr} size={170} caption={moneyText(p.dueSatang)} />
                <p className="text-center text-[13.5px] text-[color:var(--color-ink-soft)]">{t("pay.scanToPay")}</p>
              </div>
            )}

            <button
              data-testid="pos-reg-paydlg-confirm"
              className="btn btn-primary h-14 rounded-[16px] text-[16px] font-bold disabled:cursor-not-allowed disabled:border disabled:bg-[color:var(--color-surface-2)] disabled:text-[color:var(--color-muted)]"
              type="submit"
              disabled={!canConfirm}
            >
              {p.phase === "sending"
                ? t("pay.sending")
                : p.quotePending
                  ? tc("loading")
                  : zero
                  ? t("pay.confirmFree")
                  : method === "CASH"
                    ? t("pay.confirmCash", { amount: moneyText(p.dueSatang) })
                    : t("pay.confirmPromptPay")}
            </button>
          </form>
        )}
      </div>
    </RegisterDialog>
  );
}
