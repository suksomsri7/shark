"use client";

// TableDialogs.tsx — กล่องเล็กของจอโต๊ะ (POS P2.4U): เปิดโต๊ะ (จำนวนลูกค้า) · ยกเลิกรายการ (เหตุผล · มติ 3) · ปิดโต๊ะ (⋯ · TABLE_HAS_UNPAID)
//   โครงกล่องเดียวกับหน้าขาย (RegisterDialog · แผ่นล่างบนมือถือ / กลางจอ md+) · ปิดด้วย Esc อยู่ที่ตัวจับแป้นของ TablesScreen
//   🔴 ข้อความผิดพลาดมาจากคีย์ (pos.register.errors.* / pos.tables.*) — ไม่โชว์ message ภาษาไทยของเซิร์ฟเวอร์

import { useState } from "react";
import { useTranslations } from "next-intl";
import { RegisterDialog, REG_DIALOG_PANEL, SheetGrab } from "@/components/pos/register/RegisterDialog";
import { RegisterIcon } from "@/components/pos/register/RegisterIcon";

const GUESTS_MAX = 99;

export function OpenTableDialog(p: {
  name: string;
  seats: number;
  /** การจองที่กันโต๊ะนี้อยู่ (เปิดให้คนอื่น = จองถูกข้าม · toast ของเซิร์ฟเวอร์บอก) */
  reservedNote: string | null;
  busy: boolean;
  error: string | null;
  onConfirm: (guests: number) => void;
  onClose: () => void;
}) {
  const t = useTranslations("pos.tables");
  const [n, setN] = useState(Math.min(Math.max(p.seats > 0 ? Math.min(p.seats, 2) : 2, 1), GUESTS_MAX));
  return (
    <RegisterDialog onDismiss={p.onClose} locked={p.busy}>
      <div data-testid="pos-tbl-open-dialog" role="dialog" aria-modal="true" aria-label={t("open.title", { name: p.name })} className={REG_DIALOG_PANEL}>
        <SheetGrab />
        <h2 className="text-[19px] font-bold">{t("open.title", { name: p.name })}</h2>
        {p.reservedNote && <p className="rounded-[12px] border px-3 py-2 text-[13px] text-[color:var(--color-ink-soft)]">{p.reservedNote}</p>}
        <div className="flex items-center justify-between gap-3">
          <span className="text-[14px] text-[color:var(--color-ink-soft)]">{t("open.guests")}</span>
          <div className="flex items-center gap-2">
            <button data-testid="pos-tbl-open-less" type="button" aria-label={t("open.less")} disabled={n <= 1} className="grid size-11 place-items-center rounded-[12px] border disabled:opacity-40" onClick={() => setN((v) => Math.max(1, v - 1))}>
              <RegisterIcon name="minus" size={14} />
            </button>
            <span data-testid="pos-tbl-open-guests" className="w-10 text-center text-[20px] font-bold tabular-nums">
              {n}
            </span>
            <button data-testid="pos-tbl-open-more" type="button" aria-label={t("open.more")} disabled={n >= GUESTS_MAX} className="grid size-11 place-items-center rounded-[12px] border disabled:opacity-40" onClick={() => setN((v) => Math.min(GUESTS_MAX, v + 1))}>
              <RegisterIcon name="plus" size={14} />
            </button>
          </div>
        </div>
        {p.error && (
          <p role="alert" className="text-[13px] text-[color:var(--color-danger)]">
            {p.error}
          </p>
        )}
        <button data-testid="pos-tbl-open-confirm" type="button" disabled={p.busy} className="btn btn-primary h-12 rounded-[14px] text-[16px] font-bold" onClick={() => p.onConfirm(n)}>
          {t("open.confirm")}
        </button>
      </div>
    </RegisterDialog>
  );
}

export function CancelItemDialog(p: { name: string; busy: boolean; error: string | null; onConfirm: (reason: string) => void; onClose: () => void }) {
  const t = useTranslations("pos.tables");
  const [reason, setReason] = useState("");
  return (
    <RegisterDialog onDismiss={p.onClose} locked={p.busy}>
      <div data-testid="pos-tbl-cancel-dialog" role="dialog" aria-modal="true" aria-label={t("panel.cancelTitle", { name: p.name })} className={REG_DIALOG_PANEL}>
        <SheetGrab />
        <h2 className="text-[19px] font-bold">{t("panel.cancelTitle", { name: p.name })}</h2>
        <p className="text-[13.5px] text-[color:var(--color-ink-soft)]">{t("panel.cancelBody")}</p>
        <label className="flex flex-col gap-1.5 text-[13px] text-[color:var(--color-ink-soft)]">
          {t("panel.cancelReason")}
          <input
            data-testid="pos-tbl-cancel-reason"
            className="h-12 rounded-[12px] border bg-[color:var(--color-surface)] px-3 text-[15px] text-[color:var(--color-ink)]"
            value={reason}
            maxLength={200}
            onChange={(e) => setReason(e.target.value)}
          />
        </label>
        {p.error && (
          <p role="alert" className="text-[13px] text-[color:var(--color-danger)]">
            {p.error}
          </p>
        )}
        <div className="grid grid-cols-2 gap-2">
          <button data-testid="pos-tbl-cancel-back" type="button" disabled={p.busy} className="btn btn-ghost h-12 rounded-[14px] text-[15px]" onClick={p.onClose}>
            {t("panel.back")}
          </button>
          <button
            data-testid="pos-tbl-cancel-confirm"
            type="button"
            disabled={p.busy || !reason.trim()}
            className="btn h-12 rounded-[14px] bg-[color:var(--color-danger)] text-[15px] font-bold text-white disabled:opacity-50"
            onClick={() => p.onConfirm(reason.trim())}
          >
            {t("panel.cancelConfirm")}
          </button>
        </div>
      </div>
    </RegisterDialog>
  );
}

export function CloseTableDialog(p: { name: string; busy: boolean; error: string | null; onConfirm: () => void; onClose: () => void }) {
  const t = useTranslations("pos.tables");
  return (
    <RegisterDialog onDismiss={p.onClose} locked={p.busy}>
      <div data-testid="pos-tbl-close-dialog" role="dialog" aria-modal="true" aria-label={t("panel.closeTitle", { name: p.name })} className={REG_DIALOG_PANEL}>
        <SheetGrab />
        <h2 className="text-[19px] font-bold">{t("panel.closeTitle", { name: p.name })}</h2>
        <p className="text-[13.5px] text-[color:var(--color-ink-soft)]">{t("panel.closeBody")}</p>
        {p.error && (
          <p role="alert" className="text-[13px] text-[color:var(--color-danger)]">
            {p.error}
          </p>
        )}
        <div className="grid grid-cols-2 gap-2">
          <button data-testid="pos-tbl-close-back" type="button" disabled={p.busy} className="btn btn-ghost h-12 rounded-[14px] text-[15px]" onClick={p.onClose}>
            {t("panel.back")}
          </button>
          <button data-testid="pos-tbl-close-confirm" type="button" disabled={p.busy} className="btn btn-primary h-12 rounded-[14px] text-[15px] font-bold" onClick={p.onConfirm}>
            {t("actions.closeTable")}
          </button>
        </div>
      </div>
    </RegisterDialog>
  );
}
