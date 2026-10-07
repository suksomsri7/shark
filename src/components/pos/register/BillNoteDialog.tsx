"use client";

// BillNoteDialog.tsx — หมายเหตุบิล (POS P1.6 U · R5 · มติ P1.3 Q11) — ปุ่ม "หมายเหตุ" ในแผงตะกร้าเปิดกล่องนี้
//   ไม่มีภาพออกแบบของกล่อง ⇒ ใช้กล่องกลางจอ/แผ่นล่างแบบเดียวกับกล่องอื่นของหน้าขาย (RegisterDialog) · ช่องหลายบรรทัด ≤ REGISTER_NOTE_MAX
//   เก็บในตะกร้า (RegisterCart.note) แล้วส่งไปกับ submit เท่านั้น (quote ไม่ใช้) · ว่าง = ไม่มีหมายเหตุ

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { REGISTER_NOTE_MAX } from "@/lib/modules/pos/register-shared";
import { REG_DIALOG_PANEL, RegisterDialog, SheetGrab } from "./RegisterDialog";
import { RegisterIcon } from "./RegisterIcon";

type Props = { current: string | undefined; onSave: (note: string | undefined) => void; onClose: () => void };

export function BillNoteDialog({ current, onSave, onClose }: Props) {
  const t = useTranslations("pos.register");
  const [val, setVal] = useState(current ?? "");
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    ref.current?.focus();
  }, []);
  const tooLong = val.length > REGISTER_NOTE_MAX;
  const save = () => {
    if (tooLong) return;
    onSave(val.trim() ? val : undefined);
  };
  return (
    <RegisterDialog onDismiss={onClose}>
      <div data-testid="pos-reg-note-dialog" className={REG_DIALOG_PANEL} role="dialog" aria-modal="true" aria-label={t("note.title")}>
        <SheetGrab />
        <div className="flex items-center gap-3">
          <RegisterIcon name="edit" size={18} />
          <h2 className="flex-1 text-[19px] font-bold">{t("note.title")}</h2>
          <button
            data-testid="pos-reg-note-close"
            className="-mr-2 grid size-11 place-items-center rounded-[11px] text-[color:var(--color-muted)] hover:bg-[color:var(--color-surface-2)]"
            type="button"
            aria-label={t("cart.close")}
            onClick={onClose}
          >
            <RegisterIcon name="x" size={18} />
          </button>
        </div>
        <form
          data-testid="pos-reg-note-form"
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <textarea
            data-testid="pos-reg-note-input"
            className="input min-h-[120px] resize-y rounded-[13px] py-3 text-[15px] leading-[1.55]"
            ref={ref}
            value={val}
            placeholder={t("note.placeholder")}
            aria-label={t("note.title")}
            aria-invalid={tooLong}
            onChange={(e) => setVal(e.target.value)}
          />
          <p className={`text-right text-[12.5px] tabular-nums ${tooLong ? "text-[color:var(--color-danger)]" : "text-[color:var(--color-muted)]"}`} role={tooLong ? "alert" : undefined}>
            {tooLong ? t("note.tooLong", { max: REGISTER_NOTE_MAX }) : t("note.count", { count: val.length, max: REGISTER_NOTE_MAX })}
          </p>
          <div className="grid grid-cols-2 gap-2.5">
            <button
              data-testid="pos-reg-note-clear"
              className="btn btn-ghost h-12 rounded-[13px] text-[15px] disabled:opacity-50"
              type="button"
              disabled={!val && !current}
              onClick={() => onSave(undefined)}
            >
              {t("note.clear")}
            </button>
            <button data-testid="pos-reg-note-save" className="btn btn-primary h-12 rounded-[13px] text-[15px]" type="submit" disabled={tooLong}>
              {t("note.save")}
            </button>
          </div>
        </form>
      </div>
    </RegisterDialog>
  );
}
