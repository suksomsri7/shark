"use client";

import { useState } from "react";

// จำนวน + ปุ่ม ± (DESIGN-SPEC-V2 §5.2 ส่วน C "จำนวน (step ±)")
export function QtyInput({
  name,
  value,
  defaultValue = 1,
  min = 0,
  step = 1,
  onChange,
  disabled,
  compact,
  testId,
}: {
  name?: string;
  value?: number;
  defaultValue?: number;
  min?: number;
  step?: number;
  onChange?: (n: number) => void;
  disabled?: boolean;
  /** ใช้ในตารางรายการ (คอลัมน์แคบ) — ปุ่ม ± เล็กลง ช่องตัวเลขยืดเต็มคอลัมน์ */
  compact?: boolean;
  testId?: string;
}) {
  const btn = compact ? "btn-sm h-9 w-7 shrink-0 px-0 text-xs" : "btn-sm h-11 w-11 shrink-0 px-0";
  const box = compact ? "input w-full min-w-0 px-1 text-center tabular-nums" : "input w-20 text-center tabular-nums";
  const controlled = value !== undefined;
  const [internal, setInternal] = useState(defaultValue);
  const qty = controlled ? value! : internal;

  const set = (n: number) => {
    const next = Math.max(min, n);
    if (!controlled) setInternal(next);
    onChange?.(next);
  };

  return (
    <div className={`flex items-center gap-1 ${compact ? "w-full min-w-0" : ""}`} data-testid={testId}>
      <button
        type="button"
        className={btn}
        aria-label="ลดจำนวน"
        disabled={disabled || qty <= min}
        onClick={() => set(qty - step)}
      >
        −
      </button>
      <input
        type="number"
        name={name}
        className={box}
        value={qty}
        min={min}
        step={step}
        disabled={disabled}
        onChange={(e) => set(Number(e.target.value) || 0)}
      />
      <button
        type="button"
        className={btn}
        aria-label="เพิ่มจำนวน"
        disabled={disabled}
        onClick={() => set(qty + step)}
      >
        +
      </button>
    </div>
  );
}

export default QtyInput;
