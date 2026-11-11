"use client";

// HeldDialogs.tsx — กล่องเล็กของพักบิล (POS P1.5)
//   HoldLabelDialog: ปุ่ม "พักบิล" → ตั้งป้าย (ไม่บังคับ ≤ 60 ตัว) แล้วพัก · F8 = พักทันทีไม่ถามป้าย (ทางลัดแป้นพิมพ์)
//   HeldRecallConfirmDialog (มติ 4 · ภาพ 14B): เรียกคืนขณะตะกร้ามีของ ⇒ ถาม "พักตะกร้านี้ก่อน?" (พักก่อน / ยกเลิก) — ไม่ทับตะกร้าเงียบ ๆ
//   โฟกัสเริ่มที่ช่องป้าย / ปุ่มยกเลิก (Enter หลงจากเครื่องสแกนต้องไม่ทำอะไรที่ย้อนไม่ได้)

import { useState } from "react";
import { useTranslations } from "next-intl";
import { HELD_CART_LABEL_MAX, moneyText, type HeldCartSummary } from "@/lib/modules/pos/register-shared";
import { REG_DIALOG_PANEL, RegisterDialog, SheetGrab } from "./RegisterDialog";

export function HoldLabelDialog({ busy, onHold, onClose }: { busy: boolean; onHold: (label: string) => void; onClose: () => void }) {
  const t = useTranslations("pos.register");
  const tc = useTranslations("common");
  const [label, setLabel] = useState("");
  return (
    <RegisterDialog onDismiss={onClose}>
      <form
        data-testid="pos-reg-hold-dialog"
        className={REG_DIALOG_PANEL}
        role="dialog"
        aria-modal="true"
        aria-label={t("held.holdTitle")}
        onSubmit={(e) => {
          e.preventDefault();
          if (!busy) onHold(label);
        }}
      >
        <SheetGrab />
        <h2 className="text-[19px] font-bold">{t("held.holdTitle")}</h2>
        <label className="flex flex-col gap-1.5 text-[14px] font-semibold">
          {t("held.label")}
          <input
            data-testid="pos-reg-hold-label"
            className="input h-12 rounded-[13px] text-[16px] text-[color:var(--color-ink)]"
            value={label}
            maxLength={HELD_CART_LABEL_MAX}
            autoComplete="off"
            autoFocus
            placeholder={t("held.labelPlaceholder")}
            onChange={(e) => setLabel(e.target.value)}
          />
        </label>
        <div className="grid grid-cols-2 gap-2.5">
          <button data-testid="pos-reg-hold-cancel" className="btn btn-ghost h-12 rounded-[13px] text-[15px]" type="button" onClick={onClose}>
            {tc("cancel")}
          </button>
          <button data-testid="pos-reg-hold-confirm" className="btn btn-primary h-12 rounded-[13px] text-[15px]" type="submit" disabled={busy}>
            {t("cart.hold")}
          </button>
        </div>
      </form>
    </RegisterDialog>
  );
}

export function HeldRecallConfirmDialog({
  item,
  currentCount,
  currentTotal,
  busy,
  onHoldFirst,
  onClose,
}: {
  item: HeldCartSummary;
  currentCount: number;
  currentTotal: string | null;
  busy: boolean;
  onHoldFirst: () => void;
  onClose: () => void;
}) {
  const t = useTranslations("pos.register");
  const tc = useTranslations("common");
  const name = item.label ?? t("held.untitledShort");
  return (
    <RegisterDialog onDismiss={onClose}>
      <div data-testid="pos-reg-held-confirm" className={REG_DIALOG_PANEL} role="alertdialog" aria-modal="true" aria-label={t("held.confirmTitle", { label: name, total: moneyText(item.approxTotalSatang) })}>
        <SheetGrab />
        <h2 className="text-[19px] font-bold">{t("held.confirmTitle", { label: name, total: moneyText(item.approxTotalSatang) })}</h2>
        <p className="text-[14.5px] leading-[1.6] text-[color:var(--color-ink-soft)]">
          {t("held.confirmDetail", { count: currentCount })}
          {currentTotal ? ` (${currentTotal})` : ""}
        </p>
        <button data-testid="pos-reg-held-confirm-hold" className="btn btn-primary h-12 rounded-[13px] text-[15px]" type="button" disabled={busy} onClick={onHoldFirst}>
          {t("held.confirmHoldFirst")}
        </button>
        <button data-testid="pos-reg-held-confirm-cancel" className="btn btn-ghost h-12 rounded-[13px] text-[15px]" type="button" autoFocus onClick={onClose}>
          {tc("cancel")}
        </button>
      </div>
    </RegisterDialog>
  );
}
