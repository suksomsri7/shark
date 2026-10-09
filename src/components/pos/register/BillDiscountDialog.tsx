"use client";

// BillDiscountDialog.tsx — ส่วนลดท้ายบิล ฿ / % (สเปก §1.1 แถว 21 · §4.6) + ทางเข้าคูปอง (เร็ว ๆ นี้ — มติ Q12 = DEFER ไป P1.12)
//   เกินเพดานส่วนลดของบัญชี = ข้อความใต้ช่อง (errors.discountExceedsLimit {limit}%) ไม่ตัดให้พอดี (P1.15 = PIN ผู้จัดการ)
// 🔴 ตรวจด้วย priceCart ก่อนใช้ (RegisterScreen.tryBill) — คืนข้อผิดพลาด = กล่องค้าง

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import type { PriceDiscount } from "@/lib/modules/pos/pricing-shared";
import { hundredthsText, parseHundredths } from "./LineEditor";
import { REG_DIALOG_PANEL, RegisterDialog, SheetGrab } from "./RegisterDialog";
import { RegisterIcon } from "./RegisterIcon";

type Err = { key: string; values?: Record<string, string | number> };
type Props = {
  current: PriceDiscount | undefined;
  /** POS P1.15U ▸ เพดานส่วนลดของผู้ขาย (bp · null = ไม่จำกัด · undefined = ไม่แสดง) — เกินเพดาน = แผ่นส่วนลดเกินสิทธิ์ (RegisterScreen) ◂ */
  capBp?: number | null;
  onApply: (d: PriceDiscount | undefined) => Err | null;
  onCoupon: () => void;
  onClose: () => void;
};

export function BillDiscountDialog({ current, capBp, onApply, onCoupon, onClose }: Props) {
  const t = useTranslations("pos.register");
  const tc = useTranslations("common");
  const [mode, setMode] = useState<"AMOUNT" | "PERCENT">(current?.type ?? "AMOUNT");
  const [val, setVal] = useState(current ? hundredthsText(current.value) : "");
  const [err, setErr] = useState<Err | null>(null);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => ref.current?.focus(), []);
  const apply = () => {
    const v = parseHundredths(val);
    if (v === null || (mode === "PERCENT" && v > 10_000)) return setErr({ key: "errors.amountInvalid" });
    setErr(onApply(v > 0 ? { type: mode, value: v } : undefined));
  };
  const seg = (on: boolean) =>
    `h-11 flex-1 rounded-[11px] text-[14px] ${on ? "bg-[color:var(--color-ink)] font-bold text-[color:var(--color-surface)]" : "text-[color:var(--color-ink-soft)]"}`;
  return (
    <RegisterDialog onDismiss={onClose}>
      <div data-testid="pos-reg-bill-discount-dialog" className={REG_DIALOG_PANEL} role="dialog" aria-modal="true" aria-label={t("actions.billDiscount")}>
        <SheetGrab />
        <h2 className="text-[19px] font-bold">{t("actions.billDiscount")}</h2>
        {typeof capBp === "number" && (
          <p data-testid="pos-reg-bill-discount-cap" className="-mt-2 text-[13px] text-[color:var(--color-muted)]">
            {t("discountOver.yourCap", { cap: String(Number((capBp / 100).toFixed(2))) })}
          </p>
        )}
        <form
          data-testid="pos-reg-bill-discount-form"
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            apply();
          }}
        >
          <div className="flex gap-1 rounded-[13px] border p-1" role="group" aria-label={t("actions.billDiscount")}>
            <button data-testid="pos-reg-bill-discount-amount" className={seg(mode === "AMOUNT")} type="button" aria-pressed={mode === "AMOUNT"} onClick={() => setMode("AMOUNT")}>
              {t("editor.baht")}
            </button>
            <button data-testid="pos-reg-bill-discount-percent" className={seg(mode === "PERCENT")} type="button" aria-pressed={mode === "PERCENT"} onClick={() => setMode("PERCENT")}>
              {t("editor.percent")}
            </button>
          </div>
          <input
            data-testid="pos-reg-bill-discount-value"
            className="input h-12 rounded-[13px] text-[16px] tabular-nums"
            ref={ref}
            inputMode="decimal"
            value={val}
            placeholder="0"
            aria-label={`${t("billDiscount.value")} (${mode === "AMOUNT" ? t("editor.baht") : t("editor.percent")})`}
            onChange={(e) => {
              setVal(e.target.value);
              setErr(null);
            }}
          />
          {err && (
            <p data-testid="pos-reg-bill-discount-error" className="text-[13.5px] text-[color:var(--color-danger)]" role="alert">
              {t(err.key, err.values)}
            </p>
          )}
          <button data-testid="pos-reg-bill-discount-apply" className="btn btn-primary h-12 rounded-[13px] text-[15px]" type="submit">
            {t("billDiscount.apply")}
          </button>
          <div className="grid grid-cols-2 gap-2.5">
            <button
              data-testid="pos-reg-bill-discount-clear"
              className="btn btn-ghost h-12 rounded-[13px] text-[15px]"
              type="button"
              onClick={() => setErr(onApply(undefined))}
            >
              {t("billDiscount.remove")}
            </button>
            <button data-testid="pos-reg-bill-discount-cancel" className="btn btn-ghost h-12 rounded-[13px] text-[15px]" type="button" onClick={onClose}>
              {tc("cancel")}
            </button>
          </div>
        </form>
        <div className="flex items-center gap-3 border-t pt-4">
          <span className="flex-1 text-[14px] text-[color:var(--color-ink-soft)]">{t("coupon.label")}</span>
          <button
            data-testid="pos-reg-coupon"
            className="btn btn-ghost h-11 gap-2 rounded-[13px] px-4 text-[14px] text-[color:var(--color-ink-soft)]"
            type="button"
            aria-disabled="true"
            onClick={onCoupon}
          >
            <RegisterIcon name="tag" size={14} />
            {t("coupon.placeholder")}
            <span className="rounded-[6px] border px-1.5 text-[11px] leading-[18px] text-[color:var(--color-muted)]">{t("soonChip")}</span>
          </button>
        </div>
      </div>
    </RegisterDialog>
  );
}
