"use client";

// WeighDialog.tsx — สินค้าขายตามน้ำหนัก (POS P1.2 U · R9 R11 R12) — แตะการ์ดสินค้าชั่ง (หรือหลังเลือกตัวเลือก) แล้วเปิดกล่องนี้
//   ไม่มีภาพออกแบบ ⇒ กล่องกลางจอ/แผ่นล่างแบบเดียวกับกล่องอื่น (RegisterDialog) · ราคาต่อกิโลกรัม · ช่องน้ำหนัก (กรัม) · ราคาประมาณ
//   ทางหลัก = สแกนป้ายจากเครื่องชั่ง (ตัวจับสแกนของ RegisterScreen ทำงานได้ — กล่องนี้เปิดอยู่ ⇒ ผลสแกนบอก "ปิดกล่องก่อน")
//   ⇒ ข้อความในกล่องบอกให้ปิดแล้วสแกนป้าย · พิมพ์น้ำหนักเองต้องมีสิทธิ์ตั้งราคา (pos.sale.priceOverride · มติ P4) — ไม่มีสิทธิ์ = ไม่มีช่องกรอก
// 🔴 น้ำหนักจำนวนเต็ม 1–REGISTER_MAX_WEIGHT_GRAMS กรัม · ราคาบนจอเป็นค่าประมาณ (ปัดครึ่งขึ้น) — ยอดจริงมาจาก quote ของเซิร์ฟเวอร์เสมอ
// 🔴 ไม่มีข้อความไทยนอกคอมเมนต์ (S5.3)

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { displayName, moneyText, REGISTER_MAX_WEIGHT_GRAMS, type RegisterProduct } from "@/lib/modules/pos/register-shared";
import { REG_DIALOG_PANEL, RegisterDialog, SheetGrab } from "./RegisterDialog";
import { RegisterIcon } from "./RegisterIcon";

type Props = {
  product: RegisterProduct;
  locale: string;
  canOverridePrice: boolean;
  onAdd: (grams: number) => void;
  onClose: () => void;
};

export function WeighDialog({ product, locale, canOverridePrice, onAdd, onClose }: Props) {
  const t = useTranslations("pos.register");
  const [raw, setRaw] = useState("");
  const [err, setErr] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (canOverridePrice) ref.current?.focus();
  }, [canOverridePrice]);
  const grams = /^\d{1,5}$/.test(raw.trim()) ? Number(raw.trim()) : NaN;
  const ok = Number.isInteger(grams) && grams >= 1 && grams <= REGISTER_MAX_WEIGHT_GRAMS;
  const perKg = product.priceSatang;
  // ประมาณ = ปัดครึ่งขึ้นของ กรัม × ราคาต่อกก. / 1000 (สูตรเดียวกับ weighedPriceSatang ของเซิร์ฟเวอร์)
  const estimate = ok && perKg !== null ? Math.floor((2 * grams * perKg + 1000) / 2000) : null;
  const add = () => {
    if (!ok) return setErr(true);
    onAdd(grams);
  };
  return (
    <RegisterDialog onDismiss={onClose}>
      <div data-testid="pos-reg-weigh-dialog" className={REG_DIALOG_PANEL} role="dialog" aria-modal="true" aria-label={t("weigh.title")}>
        <SheetGrab />
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="text-[19px] font-bold">{t("weigh.title")}</h2>
            <p className="mt-0.5 break-words text-[14.5px] text-[color:var(--color-ink-soft)] [overflow-wrap:anywhere]">
              {displayName(product, locale)}
              {perKg !== null && <span className="tabular-nums text-[color:var(--color-muted)]">{` · ${t("weigh.perKg", { price: moneyText(perKg) })}`}</span>}
            </p>
          </div>
          <button
            data-testid="pos-reg-weigh-close"
            className="-mr-2 -mt-1 grid size-11 shrink-0 place-items-center rounded-[11px] text-[color:var(--color-muted)] hover:bg-[color:var(--color-surface-2)]"
            type="button"
            aria-label={t("cart.close")}
            onClick={onClose}
          >
            <RegisterIcon name="x" size={18} />
          </button>
        </div>

        <p className="flex items-start gap-2 rounded-[14px] bg-[color:var(--color-surface-2)] px-3.5 py-3 text-[13.5px] leading-[1.55] text-[color:var(--color-ink-soft)]">
          <RegisterIcon name="qr" size={16} className="mt-0.5" />
          <span>{t("weigh.scanHint")}</span>
        </p>

        {canOverridePrice ? (
          <form
            data-testid="pos-reg-weigh-form"
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              add();
            }}
          >
            <label className="flex flex-col gap-1.5 text-[13px] text-[color:var(--color-muted)]">
              {t("weigh.grams")}
              <input
                data-testid="pos-reg-weigh-grams"
                className="input h-14 rounded-[14px] text-[22px] font-bold tabular-nums text-[color:var(--color-ink)]"
                ref={ref}
                inputMode="numeric"
                autoComplete="off"
                value={raw}
                placeholder="0"
                aria-invalid={err && !ok}
                onChange={(e) => {
                  setRaw(e.target.value.replace(/[^\d]/g, "").slice(0, 5));
                  setErr(false);
                }}
              />
            </label>
            <div className="flex items-baseline justify-between rounded-[14px] bg-[color:var(--color-surface-2)] px-4 py-3">
              <span className="text-[14px] text-[color:var(--color-ink-soft)]">{t("weigh.estimate")}</span>
              <span data-testid="pos-reg-weigh-estimate" className="text-[22px] font-bold tabular-nums">
                {estimate === null ? "-" : moneyText(estimate)}
              </span>
            </div>
            {err && !ok && (
              <p className="text-[13.5px] text-[color:var(--color-danger)]" role="alert">
                {t("weigh.invalid", { max: REGISTER_MAX_WEIGHT_GRAMS.toLocaleString("th-TH") })}
              </p>
            )}
            <button data-testid="pos-reg-weigh-add" className="btn btn-primary h-12 rounded-[13px] text-[15px] font-bold" type="submit">
              {t("weigh.add")}
            </button>
          </form>
        ) : (
          <p className="text-[13.5px] text-[color:var(--color-muted)]">{t("errors.needPriceOverride")}</p>
        )}
      </div>
    </RegisterDialog>
  );
}
