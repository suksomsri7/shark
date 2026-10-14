"use client";

// OrderSheets.tsx — กล่อง/แผ่นเล็กของจอ 09 (POS P2.8U · มติ 2/5): ปฏิเสธ (เหตุผล ORDER_REJECT_REASONS + หมายเหตุ) ·
//   ยกเลิกออเดอร์ (เหตุผล · มีบิล = บิลถูกยกเลิกด้วย) · ปิดรับชั่วคราว 15/30/60 นาที / จนกว่าจะเปิดเอง · แก้เวลาเตรียม (−/+ 5 นาที)
//   โครงกล่องเดียวกับหน้าขาย (RegisterDialog · แผ่นล่างบนมือถือ / กลางจอ md+) · Esc ปิดอยู่ที่ตัวจับแป้นของ OrdersScreen
//   🔴 ข้อความผิดพลาดมาจากคีย์ (ผู้เรียกแปลแล้วส่ง error เป็นข้อความ) — ไม่โชว์ message ภาษาไทยของเซิร์ฟเวอร์ · ไม่มีข้อความไทยนอก t()

import { useState } from "react";
import { useTranslations } from "next-intl";
import { ORDER_PREP_MAX, ORDER_PREP_MIN, ORDER_REJECT_REASONS, type OrderRejectReason } from "@/lib/modules/pos/order-shared";
import { REGISTER_NOTE_MAX } from "@/lib/modules/pos/register-shared";
import { RegisterDialog, REG_DIALOG_PANEL, SheetGrab } from "@/components/pos/register/RegisterDialog";
import { RegisterIcon } from "@/components/pos/register/RegisterIcon";
import { PAUSE_CHOICES } from "./orders-ui";

const ErrorLine = ({ text }: { text: string | null }) =>
  text ? (
    <p role="alert" data-testid="pos-ord-sheet-error" className="text-[13px] text-[color:var(--color-danger)]">
      {text}
    </p>
  ) : null;

export function RejectDialog(p: { refText: string; busy: boolean; error: string | null; onConfirm: (reason: OrderRejectReason, note: string) => void; onClose: () => void }) {
  const t = useTranslations("pos.orders");
  const [reason, setReason] = useState<OrderRejectReason>("OUT_OF_STOCK");
  const [note, setNote] = useState("");
  return (
    <RegisterDialog onDismiss={p.onClose} locked={p.busy}>
      <div data-testid="pos-ord-reject-sheet" role="dialog" aria-modal="true" aria-label={t("reject.title")} className={REG_DIALOG_PANEL}>
        <SheetGrab />
        <h2 className="text-[19px] font-bold">{t("reject.title")}</h2>
        <p className="text-[13px] text-[color:var(--color-muted)]">{p.refText}</p>
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-[13px] font-bold text-[color:var(--color-ink-soft)]">{t("reject.reason")}</legend>
          {ORDER_REJECT_REASONS.map((r) => (
            <button
              key={r}
              type="button"
              role="radio"
              aria-checked={reason === r}
              data-testid={`pos-ord-reject-reason-${r}`}
              className={`flex min-h-11 items-center gap-3 rounded-[12px] border px-4 text-left text-[15px] ${reason === r ? "border-[color:var(--color-ink)] font-bold" : "border-[color:var(--color-line)]"}`}
              onClick={() => setReason(r)}
            >
              <span className={`grid size-5 place-items-center rounded-full border ${reason === r ? "border-[color:var(--color-ink)]" : ""}`}>{reason === r ? <span className="size-2.5 rounded-full bg-[color:var(--color-ink)]" /> : null}</span>
              {t(`reject.${r}`)}
            </button>
          ))}
        </fieldset>
        <label className="flex flex-col gap-1 text-[13px] text-[color:var(--color-ink-soft)]">
          {t("reject.note")}
          <textarea
            data-testid="pos-ord-reject-note"
            value={note}
            maxLength={REGISTER_NOTE_MAX}
            onChange={(e) => setNote(e.target.value)}
            className="input min-h-[64px] resize-y rounded-[13px] py-2.5 text-[15px] leading-[1.5]"
          />
        </label>
        <ErrorLine text={p.error} />
        <button
          type="button"
          data-testid="pos-ord-reject-confirm"
          disabled={p.busy}
          className="btn h-12 rounded-[14px] bg-[color:var(--color-danger)] text-[16px] font-bold text-[color:var(--color-surface)] disabled:opacity-50"
          onClick={() => p.onConfirm(reason, note.trim())}
        >
          {t("reject.confirm")}
        </button>
      </div>
    </RegisterDialog>
  );
}

export function CancelDialog(p: { refText: string; receiptNo: string | null; busy: boolean; error: string | null; onConfirm: (reason: string) => void; onClose: () => void }) {
  const t = useTranslations("pos.orders");
  const [reason, setReason] = useState("");
  return (
    <RegisterDialog onDismiss={p.onClose} locked={p.busy}>
      <div data-testid="pos-ord-cancel-sheet" role="dialog" aria-modal="true" aria-label={t("cancel.title")} className={REG_DIALOG_PANEL}>
        <SheetGrab />
        <h2 className="text-[19px] font-bold">{t("cancel.title")}</h2>
        <p className="text-[13px] text-[color:var(--color-muted)]">{p.refText}</p>
        {p.receiptNo ? (
          <p className="rounded-[12px] border border-dashed px-3 py-2 text-[13px] text-[color:var(--color-ink-soft)]">{t("cancel.voidNote", { receipt: p.receiptNo })}</p>
        ) : null}
        <label className="flex flex-col gap-1 text-[13px] text-[color:var(--color-ink-soft)]">
          {t("cancel.reason")}
          <textarea
            data-testid="pos-ord-cancel-reason"
            value={reason}
            maxLength={REGISTER_NOTE_MAX}
            onChange={(e) => setReason(e.target.value)}
            className="input min-h-[72px] resize-y rounded-[13px] py-2.5 text-[15px] leading-[1.5]"
          />
        </label>
        <ErrorLine text={p.error} />
        <button
          type="button"
          data-testid="pos-ord-cancel-confirm"
          disabled={p.busy || !reason.trim()}
          className="btn h-12 rounded-[14px] bg-[color:var(--color-danger)] text-[16px] font-bold text-[color:var(--color-surface)] disabled:opacity-50"
          onClick={() => p.onConfirm(reason.trim())}
        >
          {t("cancel.confirm")}
        </button>
      </div>
    </RegisterDialog>
  );
}

export function PauseDialog(p: { targetLabel: string; busy: boolean; error: string | null; onPick: (minutes: number | null) => void; onClose: () => void }) {
  const t = useTranslations("pos.orders");
  return (
    <RegisterDialog onDismiss={p.onClose} locked={p.busy}>
      <div data-testid="pos-ord-pause-sheet" role="dialog" aria-modal="true" aria-label={t("rail.pause")} className={REG_DIALOG_PANEL}>
        <SheetGrab />
        <h2 className="text-[19px] font-bold">{t("rail.pause")}</h2>
        <p className="text-[13px] text-[color:var(--color-muted)]">{t("rail.appliesTo", { target: p.targetLabel })}</p>
        <div className="grid grid-cols-2 gap-2">
          {PAUSE_CHOICES.map((m) => (
            <button
              key={m ?? "open"}
              type="button"
              data-testid={`pos-ord-pause-${m ?? "open"}`}
              disabled={p.busy}
              className={`btn btn-ghost h-12 rounded-[14px] text-[15px] disabled:opacity-50 ${m === null ? "col-span-2" : ""}`}
              onClick={() => p.onPick(m)}
            >
              {m === null ? t("rail.pauseUntilReopen") : t("rail.pauseFor", { n: m })}
            </button>
          ))}
        </div>
        <p className="text-[12px] leading-[1.5] text-[color:var(--color-muted)]">{t("rail.pauseHint")}</p>
        <ErrorLine text={p.error} />
      </div>
    </RegisterDialog>
  );
}

export function PrepDialog(p: { initial: number; title: string; busy: boolean; error: string | null; onConfirm: (n: number) => void; onClose: () => void }) {
  const t = useTranslations("pos.orders");
  const [n, setN] = useState(Math.min(ORDER_PREP_MAX, Math.max(ORDER_PREP_MIN, p.initial)));
  const step = (d: number) => setN((v) => Math.min(ORDER_PREP_MAX, Math.max(ORDER_PREP_MIN, v + d)));
  return (
    <RegisterDialog onDismiss={p.onClose} locked={p.busy}>
      <div data-testid="pos-ord-prep-sheet" role="dialog" aria-modal="true" aria-label={p.title} className={REG_DIALOG_PANEL}>
        <SheetGrab />
        <h2 className="text-[19px] font-bold">{p.title}</h2>
        <div className="flex items-center justify-center gap-3">
          <button type="button" data-testid="pos-ord-prep-less" aria-label={t("prep.less")} disabled={n <= ORDER_PREP_MIN} className="grid size-12 place-items-center rounded-[12px] border disabled:opacity-40" onClick={() => step(-5)}>
            <RegisterIcon name="minus" size={14} />
          </button>
          <span data-testid="pos-ord-prep-value" className="min-w-24 text-center text-[22px] font-bold tabular-nums">
            {t("rail.prepMinutes", { n })}
          </span>
          <button type="button" data-testid="pos-ord-prep-more" aria-label={t("prep.more")} disabled={n >= ORDER_PREP_MAX} className="grid size-12 place-items-center rounded-[12px] border disabled:opacity-40" onClick={() => step(5)}>
            <RegisterIcon name="plus" size={14} />
          </button>
        </div>
        <ErrorLine text={p.error} />
        <button type="button" data-testid="pos-ord-prep-confirm" disabled={p.busy} className="btn btn-primary h-12 rounded-[14px] text-[16px] font-bold disabled:opacity-50" onClick={() => p.onConfirm(n)}>
          {t("prep.confirm")}
        </button>
      </div>
    </RegisterDialog>
  );
}
