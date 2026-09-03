"use client";

import { useEffect, useRef, useState } from "react";
import { formatDateTh } from "@/lib/ui/date";

// วันที่ (DESIGN-SPEC-V2 §5.2 B · g1-invoice-form.png: ช่องวันที่อ่านว่า "18 ก.ย. 2026")
//
// 🔴 ห้ามโชว์รูปแบบของเบราว์เซอร์ (`09/30/2026`) — เจ้าของอ่านไม่รู้เรื่องและไม่ตรงแบบ
//    วิธี: ไม่โฟกัส = `type="text"` โชว์ไทย ค.ศ. · โฟกัส/คลิก = สลับเป็น `type="date"` แล้วเปิดปฏิทินเครื่อง
//    (`showPicker()` ต้องเรียกตอนมี user activation — ห่อ try ไว้ เบราว์เซอร์เก่าที่ไม่มีก็ยังพิมพ์เองได้)
// 🔴 ค่าที่ส่งไปกับฟอร์มอยู่ใน `<input type="hidden">` เสมอ (ISO) — ช่องที่มองเห็นไม่มี `name`
//    ไม่งั้นตอนไม่โฟกัส ฟอร์มจะส่งข้อความไทยไปแทนวันที่ ISO
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
  const [editing, setEditing] = useState(false);
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!editing) return;
    const el = ref.current as (HTMLInputElement & { showPicker?: () => void }) | null;
    try {
      el?.showPicker?.();
    } catch {
      // เบราว์เซอร์บล็อกเพราะไม่มี user activation — ผู้ใช้กดที่ไอคอนปฏิทินเองได้อยู่ดี
    }
  }, [editing]);

  return (
    <span className="relative block w-full">
      {name && <input type="hidden" name={name} value={iso} />}
      <input
        ref={ref}
        id={id}
        type={editing ? "date" : "text"}
        className="input w-full min-w-0"
        required={required}
        disabled={disabled}
        placeholder="เลือกวันที่"
        readOnly={!editing}
        value={editing ? iso : iso ? formatDateTh(iso) : ""}
        onFocus={() => setEditing(true)}
        onBlur={() => setEditing(false)}
        onChange={(e) => {
          if (!controlled) setInternal(e.target.value);
          onChange?.(e.target.value);
        }}
        data-testid={testId}
      />
    </span>
  );
}

export default DateInput;
