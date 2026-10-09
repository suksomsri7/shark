"use client";

// CouponDialog.tsx — ช่องใส่โค้ดคูปองจริง (POS P1.12U มติ 8 · เดิม P1.3 = "เร็ว ๆ นี้")
//   ช่องโค้ด (ตัวพิมพ์ใหญ่ · ตัดช่องว่าง) → "ใช้คูปอง" = ตั้ง couponCode ของตะกร้าแล้ว quote ใหม่ (RegisterScreen)
//   quote ไม่มีข้อขัดของคูปอง ⇒ กล่องปิดเอง · มี ⇒ ข้อความในกล่อง (refusalMessageKey) + ช่องยังแก้ได้ (ตะกร้าคืนโค้ดเดิม)
//   มีคูปองอยู่แล้ว = บรรทัด "คูปองของบิลนี้" + "ลบคูปอง" · ใช้ได้ทั้งลูกค้าทั่วไปและสมาชิก
//   เปิดจาก: แถว "คูปอง" ในกล่องส่วนลดท้ายบิล (จุดเดิมของ P1.3) · "ใส่คูปอง" ในจอชำระ
// 🔴 ไม่มีข้อความไทยนอกคอมเมนต์ (S5.3) · ส่วนลดคูปองคิดที่เซิร์ฟเวอร์เท่านั้น — จอส่งแค่โค้ด

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { normalizeCouponCode } from "@/lib/modules/pos/register-member-shared";
import { REG_DIALOG_PANEL, RegisterDialog, SheetGrab } from "./RegisterDialog";
import { RegisterIcon } from "./RegisterIcon";

export function CouponDialog(p: {
  /** โค้ดที่ตะกร้าใช้อยู่ (null = ยังไม่มี) */
  current: string | null;
  /** กำลังรอ quote ของโค้ดที่เพิ่งใส่ */
  pending: boolean;
  /** คีย์ข้อความใต้ pos.register (ข้อขัดของคูปองจาก quote) · null = ไม่มี */
  errorKey: string | null;
  onApply: (code: string) => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  const t = useTranslations("pos.register");
  const [code, setCode] = useState(p.current ?? "");
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    inputRef.current?.focus({ preventScroll: true });
  }, []);
  const norm = normalizeCouponCode(code);
  const apply = () => {
    if (!norm || p.pending) return;
    p.onApply(norm);
  };
  return (
    <RegisterDialog onDismiss={p.onClose}>
      <div data-testid="pos-reg-coupon-dialog" className={REG_DIALOG_PANEL} role="dialog" aria-modal="true" aria-label={t("coupon.label")}>
        <SheetGrab />
        <div className="flex items-center gap-3">
          <span className="grid size-14 shrink-0 place-items-center rounded-[16px] border bg-[color:var(--color-surface-2)] text-[color:var(--color-ink-soft)]">
            <RegisterIcon name="tag" size={24} />
          </span>
          <h2 className="flex-1 text-[19px] font-bold">{t("coupon.label")}</h2>
        </div>
        <p className="text-[13.5px] leading-[1.6] text-[color:var(--color-ink-soft)]">{t("coupon.hint")}</p>
        {p.current && (
          <div className="flex items-center gap-3 rounded-[13px] bg-[color:var(--color-surface-2)] px-4 py-2">
            <span data-testid="pos-reg-coupon-current" className="min-w-0 flex-1 truncate text-[14px] font-semibold">
              {t("coupon.current", { code: p.current })}
            </span>
            <button
              data-testid="pos-reg-coupon-remove"
              className="h-11 shrink-0 px-1 text-[13.5px] font-bold text-[color:var(--color-danger)] disabled:opacity-50"
              type="button"
              disabled={p.pending}
              onClick={p.onRemove}
            >
              {t("coupon.remove")}
            </button>
          </div>
        )}
        <form
          data-testid="pos-reg-coupon-form"
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            apply();
          }}
        >
          <input
            data-testid="pos-reg-coupon-input"
            ref={inputRef}
            className="input h-12 rounded-[12px] text-[16px] font-bold uppercase tracking-[0.04em]"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            maxLength={64}
            aria-label={t("coupon.label")}
            placeholder={t("coupon.placeholder")}
            aria-invalid={!!p.errorKey || undefined}
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
          />
          {p.errorKey && (
            <p data-testid="pos-reg-coupon-error" className="text-[13.5px] font-semibold text-[color:var(--color-danger)]" role="alert">
              {t(p.errorKey)}
            </p>
          )}
          <button
            data-testid="pos-reg-coupon-apply"
            className="btn btn-primary h-12 rounded-[13px] text-[15px] font-bold disabled:cursor-not-allowed disabled:border disabled:bg-[color:var(--color-surface-2)] disabled:text-[color:var(--color-muted)]"
            type="submit"
            disabled={!norm || p.pending}
          >
            {p.pending ? t("coupon.checking") : t("coupon.apply")}
          </button>
        </form>
        <button data-testid="pos-reg-coupon-close" className="btn btn-ghost h-12 rounded-[13px] text-[15px]" type="button" onClick={p.onClose}>
          {t("cart.close")}
        </button>
      </div>
    </RegisterDialog>
  );
}
