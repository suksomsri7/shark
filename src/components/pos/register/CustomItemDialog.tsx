"use client";

// CustomItemDialog.tsx — รายการกำหนดเอง: ชื่อ + ราคา (บาท) (สเปก §1.1 แถว 8 · §4.6)
//   ต้องมีสิทธิ์ pos.sale.priceOverride (มติ Q8) — ปุ่มเปิดกล่องเช็กแล้ว · ตัวตัดสินจริง = เซิร์ฟเวอร์ (quote/submit = PERMISSION_DENIED)
//   ราคา 0 ได้ (ของแถม) · ทศนิยมไม่เกิน 2 ตำแหน่ง · ชื่อไม่เกิน 120 ตัว

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { parseHundredths } from "./LineEditor";
import { REG_DIALOG_PANEL, RegisterDialog, SheetGrab } from "./RegisterDialog";

type Err = { key: string; values?: Record<string, string | number> };

export function CustomItemDialog({ onAdd, onClose }: { onAdd: (name: string, priceSatang: number) => Err | null; onClose: () => void }) {
  const t = useTranslations("pos.register");
  const tc = useTranslations("common");
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [err, setErr] = useState<Err | null>(null);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => ref.current?.focus(), []);
  const add = () => {
    const nm = name.trim();
    if (!nm) return setErr({ key: "errors.nameRequired" });
    const p = parseHundredths(price);
    if (p === null || price.trim() === "") return setErr({ key: "errors.amountInvalid" });
    setErr(onAdd(nm.slice(0, 120), p));
  };
  return (
    <RegisterDialog onDismiss={onClose}>
      <div data-testid="pos-reg-custom-dialog" className={REG_DIALOG_PANEL} role="dialog" aria-modal="true" aria-label={t("search.customItem")}>
        <SheetGrab />
        <h2 className="text-[19px] font-bold">{t("search.customItem")}</h2>
        <form
          data-testid="pos-reg-custom-form"
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            add();
          }}
        >
          <label className="flex flex-col gap-1.5 text-[13px] text-[color:var(--color-muted)]">
            {t("custom.name")}
            <input
              data-testid="pos-reg-custom-name"
              className="input h-12 rounded-[13px] text-[16px] text-[color:var(--color-ink)]"
              ref={ref}
              value={name}
              maxLength={120}
              autoComplete="off"
              onChange={(e) => {
                setName(e.target.value);
                setErr(null);
              }}
            />
          </label>
          <label className="flex flex-col gap-1.5 text-[13px] text-[color:var(--color-muted)]">
            {t("custom.price")}
            <input
              data-testid="pos-reg-custom-price"
              className="input h-12 rounded-[13px] text-[16px] tabular-nums text-[color:var(--color-ink)]"
              inputMode="decimal"
              value={price}
              placeholder="0"
              onChange={(e) => {
                setPrice(e.target.value);
                setErr(null);
              }}
            />
          </label>
          {err && (
            <p data-testid="pos-reg-custom-error" className="text-[13.5px] text-[color:var(--color-danger)]" role="alert">
              {t(err.key, err.values)}
            </p>
          )}
          <div className="grid grid-cols-2 gap-2.5">
            <button data-testid="pos-reg-custom-cancel" className="btn btn-ghost h-12 rounded-[13px] text-[15px]" type="button" onClick={onClose}>
              {tc("cancel")}
            </button>
            <button data-testid="pos-reg-custom-add" className="btn btn-primary h-12 rounded-[13px] text-[15px]" type="submit">
              {t("custom.add")}
            </button>
          </div>
        </form>
      </div>
    </RegisterDialog>
  );
}
