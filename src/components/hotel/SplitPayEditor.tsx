"use client";
// SVC H.5 ▸ แยกจ่าย (ใบสั่ง h.5 §2.7 · ภาพ 09 "แยกจ่าย 2 คน") — หลายแถว (≤ 6) · เงินสด/พร้อมเพย์/โอน/บัตร · ยอดรวมต้องเท่ายอดที่ต้องชำระ · เงินสดใส่เงินที่รับ → เงินทอน
import { PAY_OPTIONS, bahtTh, emptyRow, payMethodsOf, type PayRowDraft } from "./folio-shared";

type Props = { rows: PayRowDraft[]; payableSatang: number; onChange: (rows: PayRowDraft[]) => void };
const INPUT = "min-h-11 w-full rounded-lg border border-[color:var(--color-line)] bg-[color:var(--color-surface)] px-3 py-2 text-sm";
const MAX_ROWS = 6;

export default function SplitPayEditor({ rows, payableSatang, onChange }: Props) {
  const check = payMethodsOf(rows, payableSatang);
  function update(i: number, patch: Partial<PayRowDraft>) {
    onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  }
  return (
    <div data-split-pay="" className="flex flex-col gap-3">
      {rows.map((r, i) => (
        <div key={i} data-split-row={i} className="grid grid-cols-1 gap-2 rounded-xl border border-[color:var(--color-line)] p-3 sm:grid-cols-[9rem_1fr_1fr_auto]">
          <select aria-label="วิธีจ่าย" value={r.type} onChange={(e) => update(i, { type: e.target.value as PayRowDraft["type"] })} className={INPUT}>
            {PAY_OPTIONS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.labelTh}
              </option>
            ))}
          </select>
          <input aria-label="ยอด (บาท)" value={r.amountText} onChange={(e) => update(i, { amountText: e.target.value })} inputMode="decimal" placeholder="ยอด (บาท)" className={INPUT} />
          {r.type === "CASH" ? (
            <input aria-label="เงินที่รับมา (บาท)" value={r.tenderedText} onChange={(e) => update(i, { tenderedText: e.target.value })} inputMode="decimal" placeholder="รับเงินมา (บาท)" className={INPUT} />
          ) : (
            <input aria-label="เลขอ้างอิง" value={r.reference} onChange={(e) => update(i, { reference: e.target.value })} maxLength={64} placeholder="เลขอ้างอิง (ถ้ามี)" className={INPUT} />
          )}
          <button type="button" disabled={rows.length === 1} onClick={() => onChange(rows.filter((_, j) => j !== i))} className="min-h-11 rounded-lg px-3 text-sm text-rose-700 underline disabled:opacity-40">
            ลบแถว
          </button>
        </div>
      ))}
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <button type="button" disabled={rows.length >= MAX_ROWS} onClick={() => onChange([...rows, emptyRow("CASH", 0)])} className="min-h-11 rounded-lg border border-[color:var(--color-line)] px-3 disabled:opacity-40">
          + เพิ่มวิธีจ่าย
        </button>
        <span data-split-check={check.ok ? "ok" : "bad"} className={check.ok ? "text-emerald-700" : "text-[color:var(--color-muted)]"}>
          {check.ok ? `ครบยอด ฿${bahtTh(payableSatang)}${check.changeSatang ? ` · ทอน ฿${bahtTh(check.changeSatang)}` : ""}` : check.reasonTh}
        </span>
      </div>
    </div>
  );
}
