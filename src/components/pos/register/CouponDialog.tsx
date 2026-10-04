"use client";

// CouponDialog.tsx — คูปอง: สถานะ "เร็ว ๆ นี้" เท่านั้น (มติ Q12 = DEFER · Addendum 2: pos-reg-coupon-line ไม่บังคับใน P1.3)
//   การใช้คูปองเป็นเส้นทางเงินที่ต้องตัดสิทธิ์พร้อมบิล (atomic) และไปกับสิทธิ์สมาชิก ⇒ P1.12 เปลี่ยนไฟล์นี้เป็นช่องกรอกโค้ดจริง
//   ฝั่งเซิร์ฟเวอร์ปฏิเสธ couponCode/couponDiscountSatang จาก client อยู่แล้ว (VALIDATION) — จอนี้จึงไม่ส่งอะไรเลย

import { useTranslations } from "next-intl";
import { REG_DIALOG_PANEL, RegisterDialog, SheetGrab } from "./RegisterDialog";
import { RegisterIcon } from "./RegisterIcon";

export function CouponDialog({ onClose }: { onClose: () => void }) {
  const t = useTranslations("pos.register");
  return (
    <RegisterDialog onDismiss={onClose}>
      <div data-testid="pos-reg-coupon-dialog" className={REG_DIALOG_PANEL} role="dialog" aria-modal="true" aria-label={t("coupon.label")}>
        <SheetGrab />
        <div className="flex items-center gap-3">
          <span className="grid size-14 shrink-0 place-items-center rounded-[16px] border bg-[color:var(--color-surface-2)] text-[color:var(--color-ink-soft)]">
            <RegisterIcon name="tag" size={24} />
          </span>
          <h2 className="flex-1 text-[19px] font-bold">{t("coupon.label")}</h2>
        </div>
        <p className="text-[14.5px] leading-[1.6] text-[color:var(--color-ink-soft)]">{t("coupon.soonBody")}</p>
        <button data-testid="pos-reg-coupon-close" className="btn btn-ghost h-12 rounded-[13px] text-[15px]" type="button" onClick={onClose}>
          {t("cart.close")}
        </button>
      </div>
    </RegisterDialog>
  );
}
