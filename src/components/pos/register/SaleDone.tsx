"use client";

// SaleDone.tsx — ขายสำเร็จ (ชั่วคราวของ P1.3 · P1.6 ลบพร้อม InterimPayDialog) — ยอด · เลขใบเสร็จ · เงินทอน · "ขายบิลถัดไป"
//   "สำเร็จ" = หมึกตัวหนา + ไอคอนถูก (ไม่ใช่สีเขียว — UI_STANDARD §0.1) · ปุ่มถัดไปสูง 56 โฟกัสรอ (Enter = บิลถัดไป)
// 🔴 duplicated:true ก็คือขายสำเร็จบิลเดิม (ไม่ใช่สัญญาณ "พิมพ์ครั้งเดียว" — สเปกโน้ต §6) · การพิมพ์ใบเสร็จ = P1.10

import { useTranslations } from "next-intl";
import { moneyText } from "@/lib/modules/pos/register-shared";
import { REG_DIALOG_PANEL, RegisterDialog, SheetGrab } from "./RegisterDialog";
import { RegisterIcon } from "./RegisterIcon";

export function SaleDone({ receiptNo, totalSatang, changeSatang, onNext }: { receiptNo: string | null; totalSatang: number; changeSatang: number; onNext: () => void }) {
  const t = useTranslations("pos.register");
  return (
    <RegisterDialog onDismiss={onNext}>
      <div data-testid="pos-reg-done" className={`${REG_DIALOG_PANEL} items-center text-center`} role="dialog" aria-modal="true" aria-label={t("done.title")}>
        <SheetGrab />
        <span className="mt-2 grid size-14 place-items-center rounded-[16px] border bg-[color:var(--color-surface-2)] text-[color:var(--color-ink)]">
          <RegisterIcon name="check" size={26} strokeWidth={2.2} />
        </span>
        <h2 className="text-[21px] font-bold">{t("done.title")}</h2>
        <div className="text-[40px] font-bold leading-[1.1] tracking-[-0.02em] tabular-nums">{moneyText(totalSatang)}</div>
        <p data-testid="pos-reg-done-receipt" className="text-[14.5px] text-[color:var(--color-ink-soft)]">
          {t("done.receipt", { no: receiptNo ?? "-" })}
        </p>
        {changeSatang > 0 && (
          <div className="flex w-full items-baseline justify-between rounded-[14px] bg-[color:var(--color-surface-2)] px-4 py-3">
            <span className="text-[14px] text-[color:var(--color-ink-soft)]">{t("pay.change")}</span>
            <span data-testid="pos-reg-done-change" className="text-[24px] font-bold tabular-nums">
              {moneyText(changeSatang)}
            </span>
          </div>
        )}
        <button data-testid="pos-reg-done-next" className="btn btn-primary h-14 w-full rounded-[16px] text-[16px] font-bold" type="button" autoFocus onClick={onNext}>
          {t("done.next")}
        </button>
      </div>
    </RegisterDialog>
  );
}
