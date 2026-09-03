"use client";

import { useState } from "react";
import { formatDateTh } from "@/lib/ui/date";

// วันที่: input จริงเป็น ISO (yyyy-mm-dd, ผ่านฟอร์มตรง ๆ) + แสดงผลไทย "24 ก.ย. 2026" ข้าง ๆ (ค.ศ. ตามกติกาโมดูลบัญชี)
export function DateInput({
  name,
  value,
  defaultValue,
  onChange,
  required,
  disabled,
  id,
  testId,
}: {
  name?: string;
  value?: string; // ISO yyyy-mm-dd (controlled)
  defaultValue?: string;
  onChange?: (iso: string) => void;
  required?: boolean;
  disabled?: boolean;
  id?: string;
  testId?: string;
}) {
  const controlled = value !== undefined;
  const [internal, setInternal] = useState(defaultValue ?? "");
  const iso = controlled ? value! : internal;

  return (
    <div className="flex items-center gap-2">
      <input
        id={id}
        type="date"
        name={name}
        className="input w-auto"
        required={required}
        disabled={disabled}
        value={iso}
        onChange={(e) => {
          if (!controlled) setInternal(e.target.value);
          onChange?.(e.target.value);
        }}
        data-testid={testId}
      />
      {iso && (
        <span className="text-sm text-[color:var(--color-muted)]" data-testid={testId ? `${testId}-th` : undefined}>
          {formatDateTh(iso)}
        </span>
      )}
    </div>
  );
}

export default DateInput;
