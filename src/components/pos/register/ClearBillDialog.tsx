"use client";

// ClearBillDialog.tsx — ยืนยันล้างบิล (Esc บนตะกร้าที่มีของ · สเปก §3.6 ข้อ 3 · UI_STANDARD §0.7 ทำลายข้อมูลต้องยืนยัน)
//   โฟกัสเริ่มที่ "ยกเลิก" — เครื่องสแกนส่ง Enter ตามรหัสเสมอ: Enter หลงเข้ามาต้องไม่ล้างบิล
//   ยืนยัน = ล้างตะกร้า + คีย์บิลใหม่ (RegisterScreen) · ห้ามเปิดระหว่างส่งบิล/ผลยังไม่แน่ใจ (สเปก §3.4 ข้อ 7)

import { useTranslations } from "next-intl";
import { REG_DIALOG_PANEL, RegisterDialog, SheetGrab } from "./RegisterDialog";

export function ClearBillDialog({ onConfirm, onClose }: { onConfirm: () => void; onClose: () => void }) {
  const t = useTranslations("pos.register");
  const tc = useTranslations("common");
  return (
    <RegisterDialog onDismiss={onClose}>
      <div data-testid="pos-reg-clear-dialog" className={REG_DIALOG_PANEL} role="alertdialog" aria-modal="true" aria-label={t("clear.title")}>
        <SheetGrab />
        <h2 className="text-[19px] font-bold">{t("clear.title")}</h2>
        <p className="text-[14.5px] leading-[1.6] text-[color:var(--color-ink-soft)]">{t("clear.detail")}</p>
        <div className="grid grid-cols-2 gap-2.5">
          <button data-testid="pos-reg-clear-cancel" className="btn btn-ghost h-12 rounded-[13px] text-[15px]" type="button" autoFocus onClick={onClose}>
            {tc("cancel")}
          </button>
          <button
            data-testid="pos-reg-clear-confirm"
            className="btn btn-primary h-12 rounded-[13px] text-[15px]"
            type="button"
            style={{ background: "var(--color-danger)" }}
            onClick={onConfirm}
          >
            {t("clear.confirm")}
          </button>
        </div>
      </div>
    </RegisterDialog>
  );
}
