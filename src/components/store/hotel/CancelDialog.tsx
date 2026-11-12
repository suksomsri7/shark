"use client";
// SVC H.8 ▸ ยกเลิกเอง (S5/S6) — แสดงยอดคืนตามเงื่อนไขที่จดไว้ตอนจอง ก่อนยืนยัน · ต้องกรอกอีเมลที่ใช้จอง · ส่งยอดที่เห็นไปให้เซิร์ฟเวอร์เทียบ (เปลี่ยน = ไม่ยกเลิก)
import { useState } from "react";
import { useFormStatus } from "react-dom";

export type CancelDialogLabels = { open: string; refund: string; email: string; confirm: string; close: string };

function Confirm({ label }: { label: string }) {
  const s = useFormStatus();
  return (
    <button type="submit" disabled={s.pending} className="min-h-[48px] flex-1 rounded-2xl bg-[color:var(--color-danger)] px-4 text-sm font-bold text-white disabled:opacity-60">
      {label}
    </button>
  );
}

export function CancelDialog(props: { action: (fd: FormData) => Promise<void>; hidden: Record<string, string>; confirmRefundSatang: number; labels: CancelDialogLabels }) {
  const [open, setOpen] = useState(false);
  const L = props.labels;
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="min-h-[44px] w-full rounded-2xl border border-[color:var(--color-line)] text-sm font-semibold" data-cancel-open="">
        {L.open}
      </button>
    );
  }
  return (
    <form action={props.action} className="flex flex-col gap-3 rounded-[18px] border border-[color:var(--color-line)] p-4" data-cancel-dialog="">
      {Object.entries(props.hidden).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <input type="hidden" name="confirmRefundSatang" value={String(props.confirmRefundSatang)} />
      <div className="text-sm font-semibold">{L.refund}</div>
      <label className="flex flex-col gap-0.5 rounded-2xl border border-[color:var(--color-line)] px-3 py-2">
        <span className="text-xs text-[color:var(--color-muted)]">{L.email}</span>
        <input name="email" type="email" required maxLength={120} className="w-full bg-transparent text-[15px] outline-none" />
      </label>
      <div className="flex gap-2">
        <button type="button" onClick={() => setOpen(false)} className="min-h-[48px] flex-1 rounded-2xl border border-[color:var(--color-line)] text-sm">
          {L.close}
        </button>
        <Confirm label={L.confirm} />
      </div>
    </form>
  );
}
