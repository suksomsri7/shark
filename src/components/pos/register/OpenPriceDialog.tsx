"use client";

// OpenPriceDialog.tsx — ตั้งราคาขายครั้งนี้ ให้สินค้าที่ยังไม่ตั้งราคา (สเปก §5 "Price not set" · §4.6)
//   เปิดได้เฉพาะผู้มี pos.sale.priceOverride (ไม่มีสิทธิ์ = เตือน errors.priceNotSet ที่ RegisterScreen) · ห้ามขายที่ 0/ราคาทุนแทน (R2)
//   บรรทัดได้ openPriceSatang → คำขอ quote/submit ส่ง openPrice: true + unitPriceSatang (เซิร์ฟเวอร์ตรวจสิทธิ์ซ้ำ S3.23)

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { parseHundredths } from "./LineEditor";
import { REG_DIALOG_PANEL, RegisterDialog, SheetGrab } from "./RegisterDialog";

export function OpenPriceDialog({ name, onAdd, onClose }: { name: string; onAdd: (priceSatang: number) => void; onClose: () => void }) {
  const t = useTranslations("pos.register");
  const tc = useTranslations("common");
  const [price, setPrice] = useState("");
  const [bad, setBad] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => ref.current?.focus(), []);
  return (
    <RegisterDialog onDismiss={onClose}>
      <div data-testid="pos-reg-open-price-dialog" className={REG_DIALOG_PANEL} role="dialog" aria-modal="true" aria-label={t("openPrice.title")}>
        <SheetGrab />
        <h2 className="text-[19px] font-bold">{t("openPrice.title")}</h2>
        <p className="break-words text-[14.5px] leading-[1.6] text-[color:var(--color-ink-soft)] [overflow-wrap:anywhere]">{t("openPrice.hint", { name })}</p>
        <form
          data-testid="pos-reg-open-price-form"
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            const p = parseHundredths(price);
            if (p === null || p <= 0) return setBad(true);
            onAdd(p);
          }}
        >
          <input
            data-testid="pos-reg-open-price-input"
            className="input h-12 rounded-[13px] text-[16px] tabular-nums"
            ref={ref}
            inputMode="decimal"
            value={price}
            placeholder="0"
            aria-label={t("custom.price")}
            onChange={(e) => {
              setPrice(e.target.value);
              setBad(false);
            }}
          />
          {bad && (
            <p data-testid="pos-reg-open-price-error" className="text-[13.5px] text-[color:var(--color-danger)]" role="alert">
              {t("errors.amountInvalid")}
            </p>
          )}
          <div className="grid grid-cols-2 gap-2.5">
            <button data-testid="pos-reg-open-price-cancel" className="btn btn-ghost h-12 rounded-[13px] text-[15px]" type="button" onClick={onClose}>
              {tc("cancel")}
            </button>
            <button data-testid="pos-reg-open-price-add" className="btn btn-primary h-12 rounded-[13px] text-[15px]" type="submit">
              {t("custom.add")}
            </button>
          </div>
        </form>
      </div>
    </RegisterDialog>
  );
}
