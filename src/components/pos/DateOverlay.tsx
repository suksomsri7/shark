"use client";

// DateOverlay.tsx — ช่องวันที่แบบป้ายตามภาษาจอ (POS P1.18U · มติ 9 / Q9 "date-input overlay" · ทางเดียวกับหน้าบิลวันนี้ P1.16 F6)
//   ป้ายที่เห็น = วันที่ตามภาษาจอ (th "30 ก.ย. 2569" พ.ศ. · en "30 Sep 2026" ค.ศ.) · <input type="date"> ของผู้เรียกซ้อนทับโปร่งใส (แตะ = เปิดตัวเลือกวัน)
//   ⇒ ไม่ขึ้นกับรูปแบบวันที่ของเบราว์เซอร์ (mm/dd/yyyy) อีก · ใช้กับช่องที่ควบคุมด้วย state (value) และช่องในฟอร์ม GET (defaultValue)
//   ผู้เรียกเขียน input type date (คลาส DATE_OVERLAY_INPUT · onClick openDatePicker · testid ตัวอักษรตรงบนแท็ก) เป็น children
// 🔴 ไม่มีข้อความไทยนอกคอมเมนต์ · ป้ายเป็น aria-hidden (ชื่อช่องอยู่ที่ aria-label ของ input)

import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { useLocale } from "next-intl";

/** "YYYY-MM-DD" (วันตามเวลาไทย) → ป้ายตามภาษา · ค่าผิดรูป = สตริงเดิม */
export function posDateLabel(date: string, locale: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return date;
  return new Intl.DateTimeFormat(locale.startsWith("en") ? "en-GB" : "th-TH", { timeZone: "Asia/Bangkok", day: "numeric", month: "short", year: "numeric" }).format(new Date(`${date}T12:00:00+07:00`));
}

/** คลาสของ input ที่ซ้อนทับ (เต็มกรอบ · โปร่งใส) */
export const DATE_OVERLAY_INPUT = "absolute inset-0 h-full w-full cursor-pointer opacity-0";

/** แตะช่อง = เปิดตัวเลือกวันของเบราว์เซอร์ (ไม่รองรับ showPicker = ปล่อยให้แตะปกติทำงาน) */
export function openDatePicker(e: MouseEvent<HTMLInputElement>) {
  try {
    e.currentTarget.showPicker?.();
  } catch {
    /* เบราว์เซอร์ไม่รองรับ showPicker */
  }
}

export function DateOverlay({ value, className = "", icon, children }: { value: string; className?: string; icon?: ReactNode; children: ReactNode }) {
  const locale = useLocale();
  const box = useRef<HTMLSpanElement>(null);
  const [shown, setShown] = useState(value);
  useEffect(() => setShown(value), [value]);
  // ช่องในฟอร์ม (defaultValue) ไม่มี state ของผู้เรียก — ฟังการเปลี่ยนของ input ข้างในเอง
  useEffect(() => {
    const input = box.current?.querySelector("input");
    if (!input) return;
    const on = () => setShown(input.value);
    input.addEventListener("change", on);
    input.addEventListener("input", on);
    return () => {
      input.removeEventListener("change", on);
      input.removeEventListener("input", on);
    };
  }, []);
  return (
    <span ref={box} className={`relative inline-flex min-h-11 cursor-pointer items-center gap-2 ${className}`}>
      {icon}
      <span aria-hidden className="whitespace-nowrap tabular-nums">
        {shown ? posDateLabel(shown, locale) : "—"}
      </span>
      {children}
    </span>
  );
}
