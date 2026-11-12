"use client";
// SVC H.5 ▸ การ์ดเงินประกันห้อง (ภาพ 09 "เงินประกันห้อง ฿1,000 คืนแยก (เงินสด)" · ใบสั่ง h.5 §0 §3.5 · Q3)
//   เงินรับฝาก ไม่ใช่รายได้ · รับผ่านใบรับ POS (สิทธิ์ เช็กอิน หรือ ลงรายการ) · คืนเต็มผ่าน POS · ริบเต็มที่ไดอะล็อกเช็กเอาต์ (ผู้จัดการ)
import { useState } from "react";
import { PAY_OPTIONS, SECURITY_STATE_TH, bahtTh, satangOfInput, type FolioAction, type FolioActionResult, type FolioDto, type FolioRunner } from "./folio-shared";

type Props = { folio: FolioDto; canTake: boolean; canRefund: boolean; onTake: FolioAction; onRefund: FolioAction; onDone: (r: FolioActionResult) => void };
const BTN = "inline-flex min-h-11 items-center justify-center rounded-lg border border-[color:var(--color-line)] px-3 py-2 text-sm disabled:opacity-50";
const INPUT = "min-h-11 rounded-lg border border-[color:var(--color-line)] bg-[color:var(--color-surface)] px-3 py-2 text-sm";

export default function SecurityDepositCard({ folio, canTake, canRefund, onTake, onRefund, onDone }: Props) {
  const s = folio.security;
  const [open, setOpen] = useState(false);
  const [payType, setPayType] = useState("CASH");
  const [amountText, setAmountText] = useState("1000.00");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const showTake = canTake && folio.status === "OPEN" && s.state !== "HELD";
  const showRefund = canRefund && s.state === "HELD";
  async function run(fn: FolioRunner) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const r = await fn();
      if (!r.ok) setError(r.reason || "ทำรายการไม่สำเร็จ");
      else {
        setOpen(false);
        onDone(r);
      }
    } catch {
      setError("เชื่อมต่อไม่สำเร็จ ลองใหม่อีกครั้ง");
    } finally {
      setBusy(false);
    }
  }
  const amount = satangOfInput(amountText);
  return (
    <section data-security-card={s.state} className="flex flex-col gap-2 rounded-xl border border-[color:var(--color-line)] p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-bold">เงินประกันห้อง{s.state === "HELD" ? ` ฿${bahtTh(s.heldSatang)}` : ""}</h3>
          <p className="text-xs text-[color:var(--color-muted)]">{SECURITY_STATE_TH[s.state] ?? s.state} · เงินรับฝาก ไม่ใช่รายได้ · ไม่รวมในยอดชำระ</p>
        </div>
        <div className="flex gap-2">
          {showTake ? (
            <button type="button" className={BTN} onClick={() => setOpen(!open)} disabled={busy}>
              รับเงินประกัน
            </button>
          ) : null}
          {showRefund ? (
            <button type="button" className={BTN} onClick={() => run(() => onRefund({ reservationId: folio.reservation.id }))} disabled={busy}>
              คืนเงินประกันตอนนี้
            </button>
          ) : null}
        </div>
      </div>
      {open && showTake ? (
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-xs">
            <span>ยอด (บาท)</span>
            <input value={amountText} onChange={(e) => setAmountText(e.target.value)} inputMode="decimal" className={INPUT} />
          </label>
          <label className="flex flex-col gap-1 text-xs">
            <span>วิธีรับ</span>
            <select value={payType} onChange={(e) => setPayType(e.target.value)} className={INPUT}>
              {PAY_OPTIONS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.labelTh}
                </option>
              ))}
            </select>
          </label>
          <button type="button" className={BTN} disabled={busy || amount === null || amount === 0} onClick={() => run(() => onTake({ reservationId: folio.reservation.id, payType, amountSatang: amount ?? 0 }))}>
            {busy ? "กำลังบันทึก…" : "ยืนยันรับเงินประกัน"}
          </button>
        </div>
      ) : null}
      {error ? <p role="alert" className="text-xs text-[color:var(--color-danger)]">{error}</p> : null}
    </section>
  );
}
