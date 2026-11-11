"use client";

// CloseDateField.tsx — ช่อง "เลือกวัน" ของหน้าปิดวัน (POS P1.18U · มติ 9 date-input overlay) — ป้ายวันที่ตามภาษาจอ + input date ซ้อนทับ (ฟอร์ม GET name="date")
import { DATE_OVERLAY_INPUT, DateOverlay, openDatePicker } from "@/components/pos/DateOverlay";

export function CloseDateField({ value, max, label }: { value: string; max: string; label: string }) {
  return (
    <DateOverlay value={value} className="input min-h-[44px] w-full">
      <input data-testid="pos-close-date" type="date" name="date" defaultValue={value} max={max} aria-label={label} className={DATE_OVERLAY_INPUT} onClick={openDatePicker} />
    </DateOverlay>
  );
}
