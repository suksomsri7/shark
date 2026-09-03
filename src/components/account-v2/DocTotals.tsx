"use client";

import { useState } from "react";
import { MoneyInput } from "./MoneyInput";
import { MoneyText } from "@/components/ui/MoneyText";
import type { AmountOrPercent, DocTotals as Totals } from "@/lib/modules/account/totals";

// ─────────────────────────────────────────────────────────────
// DocTotals — ส่วน E ของ DESIGN-SPEC-V2 §5.2 · ภาพตายตัวคือ g1-invoice-form.png (บล็อกขวาล่าง)
// ลำดับบรรทัดห้ามสลับ: รวมเป็นเงิน · ส่วนลดรวม ✏ · หลังหักส่วนลด · VAT 7% ·
//                     [กล่องดำ] จำนวนเงินทั้งสิ้น + ตัวอักษรไทย ·
//                     หัก ณ ที่จ่าย · หักเงินมัดจำ · ยอดที่ต้องชำระ (ตัวหนา)
// ─────────────────────────────────────────────────────────────

function Row({
  label,
  satang,
  testId,
  negative,
  bold,
  action,
}: {
  label: React.ReactNode;
  satang: number;
  testId: string;
  negative?: boolean;
  bold?: boolean;
  action?: React.ReactNode;
}) {
  return (
    <div className={`flex items-center justify-between gap-3 py-1 text-sm ${bold ? "font-semibold" : ""}`}>
      <span className={`flex items-center gap-1 ${bold ? "" : "text-[color:var(--color-muted)]"}`}>
        {label}
        {action}
      </span>
      <span
        className="tabular-nums"
        style={negative && satang > 0 ? { color: "var(--color-danger)" } : undefined}
        data-testid={testId}
      >
        {negative && satang > 0 ? "−" : ""}
        <MoneyText satang={satang} decimals />
      </span>
    </div>
  );
}

export function DocTotals({
  totals,
  vatRateBp,
  vatRegistered,
  docDiscount,
  onDocDiscountChange,
}: {
  totals: Totals;
  vatRateBp: number;
  vatRegistered: boolean;
  docDiscount: AmountOrPercent;
  onDocDiscountChange: (v: AmountOrPercent) => void;
}) {
  const [editDiscount, setEditDiscount] = useState(false);

  return (
    <div className="ml-auto flex w-full max-w-md flex-col" data-testid="totals">
      <Row label="รวมเป็นเงิน" satang={totals.subTotal} testId="tot-sub" />

      <div className="flex items-center justify-between gap-3 py-1 text-sm">
        <span className="flex items-center gap-2 text-[color:var(--color-muted)]">
          ส่วนลดรวม
          <button
            type="button"
            aria-label="แก้ส่วนลดรวม"
            className="text-[color:var(--color-muted)]"
            onClick={() => setEditDiscount((v) => !v)}
            data-testid="tot-discount-edit"
          >
            ✏
          </button>
        </span>
        {editDiscount ? (
          <span className="flex items-center gap-1">
            <span className="flex overflow-hidden rounded-lg border text-xs">
              {(["amount", "percent"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  className="px-2 py-2"
                  aria-pressed={docDiscount.mode === m}
                  style={
                    docDiscount.mode === m ? { background: "var(--color-ink)", color: "var(--color-surface)" } : undefined
                  }
                  onClick={() => onDocDiscountChange({ ...docDiscount, mode: m })}
                >
                  {m === "amount" ? "฿" : "%"}
                </button>
              ))}
            </span>
            {docDiscount.mode === "amount" ? (
              <MoneyInput
                value={docDiscount.satang}
                onChangeSatang={(satang) => onDocDiscountChange({ ...docDiscount, satang })}
                testId="tot-discount-input"
              />
            ) : (
              <input
                type="number"
                inputMode="decimal"
                min={0}
                max={100}
                step="0.01"
                className="input w-24 text-right tabular-nums"
                value={docDiscount.percentBp / 100}
                onChange={(e) =>
                  onDocDiscountChange({ ...docDiscount, percentBp: Math.round(Number(e.target.value || 0) * 100) })
                }
                data-testid="tot-discount-percent"
              />
            )}
          </span>
        ) : (
          <span className="tabular-nums" data-testid="tot-discount">
            <MoneyText satang={totals.discountAmount} decimals />
          </span>
        )}
      </div>

      <Row label="หลังหักส่วนลด" satang={totals.afterDiscount} testId="tot-net" />
      {vatRegistered && <Row label={`VAT ${vatRateBp / 100}%`} satang={totals.vatAmount} testId="tot-vat" />}

      <div
        className="mt-2 flex items-center justify-between gap-3 rounded-xl px-4 py-3"
        style={{ background: "var(--color-ink)", color: "var(--color-surface)" }}
      >
        <span className="text-sm font-semibold">จำนวนเงินทั้งสิ้น</span>
        <span className="text-base font-semibold tabular-nums" data-testid="tot-grand">
          <MoneyText satang={totals.grandTotal} decimals />
        </span>
      </div>
      <div className="mt-1 text-right text-xs text-[color:var(--color-muted)]" data-testid="tot-words">
        ({totals.grandTotalWords})
      </div>

      <div className="mt-3 flex flex-col border-t pt-2">
        <Row label="หัก ณ ที่จ่าย" satang={totals.whtTotal} testId="tot-wht" negative />
        <Row label="หักเงินมัดจำ" satang={totals.depositDeducted} testId="tot-deposit" negative />
        <div className="border-t pt-1">
          <Row label="ยอดที่ต้องชำระ" satang={totals.dueTotal} testId="tot-due" bold />
        </div>
      </div>
    </div>
  );
}

/** แถบยอดติดล่างจอบนมือถือ (g17: จำนวนเงินทั้งสิ้น · ยอดที่ต้องชำระ · chevron) */
export function MobileTotalsBar({ totals, onToggle, open }: { totals: Totals; onToggle: () => void; open: boolean }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      className="flex w-full flex-col gap-0.5 border-t bg-[color:var(--color-surface)] px-4 py-2 text-left md:hidden"
      data-testid="totals-bar-m"
    >
      <span className="flex items-center justify-between text-sm">
        <span className="text-[color:var(--color-muted)]">จำนวนเงินทั้งสิ้น</span>
        <span className="tabular-nums" data-testid="tot-grand-m">
          <MoneyText satang={totals.grandTotal} decimals />
        </span>
      </span>
      <span className="flex items-center justify-between text-base font-semibold">
        <span>ยอดที่ต้องชำระ</span>
        <span className="flex items-center gap-1 tabular-nums" data-testid="tot-due-m">
          <MoneyText satang={totals.dueTotal} decimals />
          <span className={`text-[color:var(--color-muted)] transition-transform ${open ? "rotate-180" : ""}`}>▾</span>
        </span>
      </span>
    </button>
  );
}

export default DocTotals;
