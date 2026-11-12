"use client";
// SVC H.5 ▸ ยกเลิกรายการในบิลระหว่างพัก (ใบสั่ง h.5 §2.2) — เหตุผลบังคับอย่างน้อย 3 ตัวอักษร · ระบบลงแถวกลับรายการ (ไม่ลบของเดิม) · ลงวันที่วันนี้
import { useState } from "react";
import { bahtTh, type FolioAction, type FolioActionResult, type FolioItemDto } from "./folio-shared";

type Props = { item: FolioItemDto; onSubmit: FolioAction; onDone: (r: FolioActionResult) => void; onClose: () => void };
const BTN = "inline-flex min-h-11 items-center justify-center rounded-lg border border-[color:var(--color-line)] px-3 py-2 text-sm";
const BTN_DANGER = "inline-flex min-h-11 items-center justify-center rounded-lg bg-rose-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-50";

export default function VoidItemDialog({ item, onSubmit, onDone, onClose }: Props) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const tooShort = reason.trim().length < 3;
  async function submit() {
    if (busy || tooShort) return;
    setBusy(true);
    setError("");
    try {
      const r = await onSubmit({ itemId: item.id, reason: reason.trim() });
      if (!r.ok) setError(r.reason || "ยกเลิกรายการไม่สำเร็จ");
      else onDone(r);
    } catch {
      setError("เชื่อมต่อไม่สำเร็จ ลองใหม่อีกครั้ง");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div role="dialog" aria-modal="true" aria-label="ยกเลิกรายการ" data-void-dialog="" className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-3 sm:items-center">
      <div className="flex w-full max-w-md flex-col gap-4 rounded-2xl bg-[color:var(--color-surface)] p-5 shadow-xl">
        <header className="flex flex-col gap-1">
          <h2 className="text-lg font-bold">ยกเลิกรายการ</h2>
          <p className="text-sm text-[color:var(--color-muted)]">
            {item.description} · ฿{bahtTh(item.amountSatang)} — ระบบลงรายการกลับยอดวันนี้ ของเดิมยังเห็นในประวัติ
          </p>
        </header>
        <label className="flex flex-col gap-1 text-sm">
          <span>เหตุผล (อย่างน้อย 3 ตัวอักษร)</span>
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} rows={3} className="rounded-lg border border-[color:var(--color-line)] px-3 py-2" />
        </label>
        {error ? <p role="alert" className="text-sm text-[color:var(--color-danger)]">{error}</p> : null}
        <div className="flex justify-end gap-2">
          <button type="button" className={BTN} onClick={onClose} disabled={busy}>
            ปิด
          </button>
          <button type="button" className={BTN_DANGER} onClick={submit} disabled={busy || tooShort}>
            {busy ? "กำลังบันทึก…" : "ยืนยันยกเลิกรายการ"}
          </button>
        </div>
      </div>
    </div>
  );
}
