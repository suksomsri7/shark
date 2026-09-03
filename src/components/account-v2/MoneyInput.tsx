"use client";

import { useState } from "react";

// จำนวนเงินเก็บเป็น "สตางค์" (integer) เสมอ — ห้าม float บาท (BLUEPRINT §1 กติกาเงิน)
// แสดงผล "12,345.00" — แยก input ที่เห็น (มี comma พิมพ์ง่าย) ออกจาก hidden input ที่ส่งฟอร์มจริง (ตัวเลขสตางค์ล้วน)

export function parseMoneyInputToSatang(raw: string): number {
  const cleaned = raw.replace(/[^\d.-]/g, "");
  if (!cleaned || cleaned === "-") return 0;
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

export function formatSatangForInput(satang: number): string {
  const safe = Number.isFinite(satang) ? Math.round(satang) : 0;
  const sign = safe < 0 ? "-" : "";
  const abs = Math.abs(safe);
  const intPart = Math.floor(abs / 100).toLocaleString("en-US");
  const decPart = String(abs % 100).padStart(2, "0");
  return `${sign}${intPart}.${decPart}`;
}

export function MoneyInput({
  name,
  value,
  defaultValueSatang = 0,
  onChangeSatang,
  placeholder,
  required,
  disabled,
  id,
  testId,
}: {
  /** name ของ hidden input ที่ฟอร์มใช้จริง (ค่า = จำนวนสตางค์) */
  name?: string;
  /** โหมด controlled — ส่ง satang ปัจจุบัน */
  value?: number;
  defaultValueSatang?: number;
  onChangeSatang?: (satang: number) => void;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  id?: string;
  testId?: string;
}) {
  const controlled = value !== undefined;
  const [internal, setInternal] = useState(defaultValueSatang);
  const satang = controlled ? value! : internal;
  const [text, setText] = useState(() => formatSatangForInput(satang));
  const [focused, setFocused] = useState(false);

  const commit = (raw: string) => {
    const parsed = parseMoneyInputToSatang(raw);
    if (!controlled) setInternal(parsed);
    onChangeSatang?.(parsed);
    setText(formatSatangForInput(parsed));
  };

  return (
    <div className="relative">
      <input
        id={id}
        type="text"
        inputMode="decimal"
        className="input text-right tabular-nums"
        placeholder={placeholder ?? "0.00"}
        required={required}
        disabled={disabled}
        value={focused ? text : formatSatangForInput(satang)}
        onFocus={() => {
          setFocused(true);
          setText(formatSatangForInput(satang));
        }}
        onChange={(e) => setText(e.target.value)}
        onBlur={(e) => {
          setFocused(false);
          commit(e.target.value);
        }}
        data-testid={testId}
      />
      {name && <input type="hidden" name={name} value={satang} />}
    </div>
  );
}

export default MoneyInput;
