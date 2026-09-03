"use client";

import { useState } from "react";
import { MoneyInput } from "./MoneyInput";

// ส่วนลด/หน่วย ที่สลับได้ระหว่างบาท (สตางค์) กับ % (DESIGN-SPEC-V2 §5.2 ส่วน C, E)
export type PercentOrAmount = { mode: "amount" | "percent"; amountSatang: number; percentBp: number };

export function PercentOrAmountInput({
  namePrefix,
  defaultValue = { mode: "amount", amountSatang: 0, percentBp: 0 },
  onChange,
  testId,
}: {
  /** ส่งฟอร์มเป็น hidden input `${namePrefix}Mode` / `${namePrefix}Satang` / `${namePrefix}PercentBp` */
  namePrefix: string;
  defaultValue?: PercentOrAmount;
  onChange?: (v: PercentOrAmount) => void;
  testId?: string;
}) {
  const [state, setState] = useState<PercentOrAmount>(defaultValue);

  const update = (patch: Partial<PercentOrAmount>) => {
    const next = { ...state, ...patch };
    setState(next);
    onChange?.(next);
  };

  return (
    <div className="flex items-center gap-1" data-testid={testId}>
      <div className="flex overflow-hidden rounded-lg border text-xs">
        <button
          type="button"
          className="px-2 py-2"
          aria-pressed={state.mode === "amount"}
          style={
            state.mode === "amount"
              ? { background: "var(--color-ink)", color: "var(--color-surface)" }
              : undefined
          }
          onClick={() => update({ mode: "amount" })}
        >
          ฿
        </button>
        <button
          type="button"
          className="px-2 py-2"
          aria-pressed={state.mode === "percent"}
          style={
            state.mode === "percent"
              ? { background: "var(--color-ink)", color: "var(--color-surface)" }
              : undefined
          }
          onClick={() => update({ mode: "percent" })}
        >
          %
        </button>
      </div>
      {state.mode === "amount" ? (
        <MoneyInput
          value={state.amountSatang}
          onChangeSatang={(amountSatang) => update({ amountSatang })}
          testId={testId ? `${testId}-amount` : undefined}
        />
      ) : (
        <input
          type="number"
          inputMode="decimal"
          className="input w-24 text-right tabular-nums"
          min={0}
          max={100}
          step="0.01"
          value={state.percentBp / 100}
          onChange={(e) => update({ percentBp: Math.round(Number(e.target.value || 0) * 100) })}
          data-testid={testId ? `${testId}-percent` : undefined}
        />
      )}
      <input type="hidden" name={`${namePrefix}Mode`} value={state.mode} />
      <input type="hidden" name={`${namePrefix}Satang`} value={state.amountSatang} />
      <input type="hidden" name={`${namePrefix}PercentBp`} value={state.percentBp} />
    </div>
  );
}

export default PercentOrAmountInput;
