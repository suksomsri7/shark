"use client";
// SVC H.3 ▸ กล่องรับมัดจำการจอง (ใบสั่ง h.3 §4 · มติ 12) — เลือกวิธีรับเงินจริง 4 แบบ (เงินสด · พร้อมเพย์ · โอน · บัตร) แล้วส่งให้ takeBookingDepositAction
//   เงินผ่าน POS เท่านั้น (ใบรับมัดจำ) · ปุ่มกดได้ครั้งเดียวต่อการส่ง · ข้อความไทยทั้งหมด
import { useState } from "react";
import { PAY_TYPES, moneyTh, type DepositSubmit, type ResultHandler, type VoidHandler } from "./booking-shared";

type Props = {
  amountSatang: number;
  code: string;
  onSubmit: DepositSubmit;
  onDone: ResultHandler;
  onClose: VoidHandler;
};

const BTN = "inline-flex min-h-11 items-center justify-center rounded-lg border border-[color:var(--color-line)] px-3 py-2 text-sm";
const BTN_PRIMARY = "inline-flex min-h-11 items-center justify-center rounded-lg bg-[color:var(--color-accent)] px-4 py-2 text-sm font-bold text-white disabled:opacity-50";

export default function BookingDepositDialog({ amountSatang, code, onSubmit, onDone, onClose }: Props) {
  const [payType, setPayType] = useState("PROMPTPAY");
  const [reference, setReference] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const needsRef = payType === "CARD" || payType === "TRANSFER";
  const submit = async () => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const r = await onSubmit({ payType, reference: reference.trim() || null });
      if (!r.ok) setError(r.reason || "รับมัดจำไม่สำเร็จ");
      onDone(r);
    } catch {
      setError("เชื่อมต่อไม่สำเร็จ ลองใหม่อีกครั้ง");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div role="dialog" aria-modal="true" aria-label="รับมัดจำ" data-deposit-dialog="" className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-3 sm:items-center">
      <div className="flex w-full max-w-md flex-col gap-4 rounded-2xl bg-[color:var(--color-surface)] p-5 shadow-xl">
        <header className="flex flex-col gap-1">
          <h2 className="text-lg font-bold text-[color:var(--color-ink)]">รับมัดจำ {code}</h2>
          <p className="text-sm text-[color:var(--color-muted)]">ยอดมัดจำ ฿{moneyTh(amountSatang)} · ออกใบรับเงินมัดจำผ่านระบบขายหน้าร้าน</p>
        </header>
        <fieldset className="grid grid-cols-2 gap-2">
          <legend className="mb-1 text-sm font-medium">วิธีรับเงิน</legend>
          {PAY_TYPES.map((p) => (
            <label key={p.value} data-pay-type={p.value} className={`${BTN} cursor-pointer ${payType === p.value ? "border-[color:var(--color-accent)] font-bold" : ""}`}>
              <input type="radio" name="payType" value={p.value} checked={payType === p.value} onChange={() => setPayType(p.value)} className="sr-only" />
              {p.labelTh}
            </label>
          ))}
        </fieldset>
        {needsRef ? (
          <label className="flex flex-col gap-1 text-sm">
            <span>เลขอ้างอิง (ถ้ามี)</span>
            <input value={reference} onChange={(e) => setReference(e.target.value)} maxLength={64} className="min-h-11 rounded-lg border border-[color:var(--color-line)] px-3 py-2" />
          </label>
        ) : null}
        {error ? <p role="alert" className="text-sm text-[color:var(--color-danger)]">{error}</p> : null}
        <div className="flex justify-end gap-2">
          <button type="button" className={BTN} onClick={onClose} disabled={busy}>
            ปิด
          </button>
          <button type="button" className={BTN_PRIMARY} onClick={submit} disabled={busy}>
            {busy ? "กำลังบันทึก…" : "ยืนยันรับมัดจำ"}
          </button>
        </div>
      </div>
    </div>
  );
}
