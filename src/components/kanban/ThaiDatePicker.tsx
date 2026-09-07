// ThaiDatePicker.tsx — ชิปวันที่ไทย + popover ปฏิทิน (K1.6/K1.13 หนี้ UI: ห้ามใช้ native <input type="date"/"datetime-local">)
// ใช้แทนช่อง "กำหนดส่ง"/"วันเริ่ม" บนหลังการ์ด (`CardBack.tsx`) ตามแบบ `ledger/design-kanban/03-card-back.png`
// ⚠️ เวลา = Asia/Bangkok (UTC+7 ตายตัว ไม่มี DST) คำนวณเองล้วน — ห้าม toLocaleDateString/Intl (บทเรียน K1.5: hydration mismatch)
// ⚠️ ห้ามอีโมจิ — ไอคอนทุกตัวมาจาก <KanbanIcon>
"use client";

import { useEffect, useRef, useState } from "react";
import { KanbanIcon } from "./KanbanIcon";
import { DUE_STYLE, type DueBadge } from "./Card";

const BKK_OFFSET_MS = 7 * 60 * 60 * 1000;
const TH_MONTH = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
const TH_WDAY_LONG = ["อา.", "จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส."];
const TH_WDAY_SHORT = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];
const pad2 = (n: number) => (n < 10 ? `0${n}` : String(n));

type BkkDate = { year: number; month: number; day: number; hour: number; minute: number; weekday: number };

function toBkk(ms: number): BkkDate {
  const d = new Date(ms + BKK_OFFSET_MS);
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth(),
    day: d.getUTCDate(),
    hour: d.getUTCHours(),
    minute: d.getUTCMinutes(),
    weekday: d.getUTCDay(),
  };
}

/** ปี/เดือน(0-11)/วัน/ชม./นาที ตีความเป็นเวลากรุงเทพฯ → ISO (UTC) — รูปแบบเดียวกับ `localToIso` เดิมใน CardBack */
function fromBkk(year: number, month: number, day: number, hour: number, minute: number): string {
  return new Date(Date.UTC(year, month, day, hour, minute) - BKK_OFFSET_MS).toISOString();
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

function formatChip(iso: string, withTime: boolean): string {
  const p = toBkk(Date.parse(iso));
  const datePart = `${TH_WDAY_LONG[p.weekday]} ${p.day} ${TH_MONTH[p.month]} ${p.year + 543}`;
  return withTime ? `${datePart} · ${pad2(p.hour)}:${pad2(p.minute)} น.` : datePart;
}

export type ThaiDatePickerTone = DueBadge["tone"];

export function ThaiDatePicker({
  value,
  onChange,
  editable,
  withTime = false,
  open,
  onOpenChange,
  nowMs,
  ariaLabel,
  chipTestId,
  pickerTestId,
  tone,
  chipText,
}: {
  /** ค่าปัจจุบัน — ISO UTC หรือ null (ไม่กำหนด) */
  value: string | null;
  /** เรียกทุกครั้งที่ค่าควรเปลี่ยน — ผู้เรียก (CardBack) เป็นคนยิง server action เอง */
  onChange: (next: string | null) => void;
  /** false = แสดงชิปอย่างเดียว คลิกไม่เปิด popover (โหมดอ่านอย่างเดียว/การ์ดในคลัง) */
  editable: boolean;
  /** true = มีช่องเวลา + ปุ่มลัด (กำหนดส่ง) · false = เลือกวันที่อย่างเดียว (วันเริ่ม) */
  withTime?: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** "เวลาปัจจุบัน" จาก server (K1.5 §12.2) — ใช้ไฮไลต์ "วันนี้" และปุ่มลัด ไม่ใช้ Date.now() ตรง ๆ */
  nowMs: number;
  ariaLabel: string;
  chipTestId: string;
  pickerTestId: string;
  /** โทนสีชิปตามความหมายกำหนดส่งแบบเดียวกับตัวการ์ด (`dueBadgeFrom`/`DUE_STYLE` ใน Card.tsx) — ไม่ใส่ = ชิปกลาง ๆ (วันเริ่ม) */
  tone?: ThaiDatePickerTone;
  /**
   * K2.12 (หนี้ parity ภาพ 04): ข้อความชิปแบบสัมพัทธ์แทนวันที่เต็ม เช่น `dueBadgeFrom(...).text`
   * ("วันนี้ 18:00" · "เลย 4 วัน" · "พรุ่งนี้") — ไม่ใส่ = ใช้วันที่เต็มแบบเดิม (`formatChip`) เหมือนหลังการ์ด
   * มีผลเฉพาะตอนปิด popover เท่านั้น — เปิดปฏิทินยังกางเป็นเดือน/วันเต็มตามปกติ
   */
  chipText?: string;
}) {
  const today = toBkk(nowMs);
  const selected = value ? toBkk(Date.parse(value)) : null;

  const [viewYear, setViewYear] = useState(selected?.year ?? today.year);
  const [viewMonth, setViewMonth] = useState(selected?.month ?? today.month);
  const [hh, setHh] = useState(pad2(selected?.hour ?? 9));
  const [mm, setMm] = useState(pad2(selected?.minute ?? 0));
  const wasOpen = useRef(open);

  // เปิด popover ใหม่ทุกครั้ง (transition false→true) → รีเซ็ตมุมมองเดือน/เวลาให้ตรงค่าปัจจุบัน
  useEffect(() => {
    if (open && !wasOpen.current) {
      const s = value ? toBkk(Date.parse(value)) : null;
      setViewYear(s?.year ?? today.year);
      setViewMonth(s?.month ?? today.month);
      setHh(pad2(s?.hour ?? 9));
      setMm(pad2(s?.minute ?? 0));
    }
    wasOpen.current = open;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- รีเซ็ตเฉพาะตอน "เปิด" ไม่ใช่ทุกครั้งที่ value/nowMs เปลี่ยนระหว่างเปิดอยู่
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onOpenChange(false);
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [open, onOpenChange]);

  const changeMonth = (delta: number) => {
    let y = viewYear;
    let m = viewMonth + delta;
    if (m < 0) {
      m = 11;
      y -= 1;
    } else if (m > 11) {
      m = 0;
      y += 1;
    }
    setViewYear(y);
    setViewMonth(m);
  };

  const currentHourMinute = () => ({
    hour: Math.min(23, Math.max(0, Number(hh) || 0)),
    minute: Math.min(59, Math.max(0, Number(mm) || 0)),
  });

  const selectDay = (day: number) => {
    const { hour, minute } = withTime ? currentHourMinute() : { hour: 0, minute: 0 };
    onChange(fromBkk(viewYear, viewMonth, day, hour, minute));
  };

  const commitTime = () => {
    const { hour, minute } = currentHourMinute();
    setHh(pad2(hour));
    setMm(pad2(minute));
    if (!value) return; // ยังไม่ได้เลือกวัน — เก็บเวลาไว้เป็นค่าตั้งต้น รอเลือกวันก่อนค่อยส่งจริง
    const s = toBkk(Date.parse(value));
    onChange(fromBkk(s.year, s.month, s.day, hour, minute));
  };

  const quickPick = (daysFromToday: number) => {
    const p = toBkk(nowMs + daysFromToday * 86_400_000);
    const { hour, minute } = currentHourMinute();
    setViewYear(p.year);
    setViewMonth(p.month);
    onChange(fromBkk(p.year, p.month, p.day, hour, minute));
  };

  const firstWeekday = new Date(Date.UTC(viewYear, viewMonth, 1)).getUTCDay();
  const totalDays = daysInMonth(viewYear, viewMonth);
  const cells: (number | null)[] = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: totalDays }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const toneStyle = value && tone ? DUE_STYLE[tone] : null;

  return (
    <div className="relative inline-block">
      <button
        type="button"
        data-testid={chipTestId}
        aria-label={ariaLabel}
        aria-haspopup="dialog"
        aria-expanded={open}
        title={chipText && value ? formatChip(value, withTime) : undefined}
        onClick={() => editable && onOpenChange(!open)}
        disabled={!editable}
        className="inline-flex items-center rounded-md border"
        style={{
          height: 24,
          padding: "0 8px",
          fontSize: 12.5,
          fontWeight: value ? 600 : 400,
          cursor: editable ? "pointer" : "default",
          borderStyle: value ? "solid" : "dashed",
          borderColor: toneStyle ? toneStyle.border : "var(--color-line)",
          color: toneStyle ? toneStyle.color : value ? "var(--color-ink-soft)" : "var(--color-muted)",
          background: toneStyle ? toneStyle.background : value ? "var(--color-surface-2)" : "transparent",
        }}
      >
        {value ? (chipText ?? formatChip(value, withTime)) : "ไม่กำหนด"}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => onOpenChange(false)} aria-hidden />
          <div
            data-testid={pickerTestId}
            role="dialog"
            aria-label={`เลือก${ariaLabel}`}
            className="absolute left-0 top-full z-50 mt-1 flex flex-col gap-2 rounded-xl border p-3"
            style={{
              width: 258,
              maxWidth: "calc(100vw - 24px)",
              background: "var(--color-surface)",
              borderColor: "var(--color-line)",
              boxShadow: "0 14px 34px rgba(10,10,10,.16)",
            }}
          >
            {/* หัวปฏิทิน: เดือน/ปี พ.ศ. + ปุ่มเลื่อนเดือน */}
            <div className="flex items-center justify-between">
              <button type="button" aria-label="เดือนก่อนหน้า" onClick={() => changeMonth(-1)} style={{ color: "var(--color-muted)" }}>
                <KanbanIcon name="back" size="xs" />
              </button>
              <span style={{ fontSize: 13, fontWeight: 700 }}>
                {TH_MONTH[viewMonth]} {viewYear + 543}
              </span>
              <button type="button" aria-label="เดือนถัดไป" onClick={() => changeMonth(1)} style={{ color: "var(--color-muted)" }}>
                <KanbanIcon name="ar" size="xs" />
              </button>
            </div>

            {/* หัวคอลัมน์วันในสัปดาห์ */}
            <div className="grid grid-cols-7" style={{ fontSize: 10.5, color: "var(--color-muted)", textAlign: "center" }}>
              {TH_WDAY_SHORT.map((w, i) => (
                <span key={i}>{w}</span>
              ))}
            </div>

            {/* ตารางวัน */}
            <div className="grid grid-cols-7 gap-y-0.5">
              {cells.map((day, i) => {
                if (day === null) return <span key={i} />;
                const isToday = today.year === viewYear && today.month === viewMonth && today.day === day;
                const isSelected = selected !== null && selected.year === viewYear && selected.month === viewMonth && selected.day === day;
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => selectDay(day)}
                    className="mx-auto flex items-center justify-center rounded-lg"
                    style={{
                      width: 28,
                      height: 28,
                      fontSize: 12,
                      fontWeight: isSelected || isToday ? 700 : 400,
                      background: isSelected ? "var(--color-accent)" : "transparent",
                      color: isSelected ? "#fff" : "var(--color-ink)",
                      border: isToday && !isSelected ? "1.5px solid var(--color-accent)" : "1.5px solid transparent",
                    }}
                  >
                    {day}
                  </button>
                );
              })}
            </div>

            {withTime && (
              <div className="flex items-center gap-1.5 border-t pt-2" style={{ borderColor: "var(--color-line)" }}>
                <KanbanIcon name="clock" size="xs" className="text-[color:var(--color-muted)]" />
                <input
                  aria-label="ชั่วโมง"
                  inputMode="numeric"
                  value={hh}
                  onChange={(e) => setHh(e.target.value.replace(/\D/g, "").slice(0, 2))}
                  onBlur={commitTime}
                  onKeyDown={(e) => e.key === "Enter" && commitTime()}
                  className="rounded border text-center"
                  style={{ width: 34, height: 24, fontSize: 12.5, borderColor: "var(--color-line)" }}
                />
                <span style={{ fontSize: 12.5, color: "var(--color-muted)" }}>:</span>
                <input
                  aria-label="นาที"
                  inputMode="numeric"
                  value={mm}
                  onChange={(e) => setMm(e.target.value.replace(/\D/g, "").slice(0, 2))}
                  onBlur={commitTime}
                  onKeyDown={(e) => e.key === "Enter" && commitTime()}
                  className="rounded border text-center"
                  style={{ width: 34, height: 24, fontSize: 12.5, borderColor: "var(--color-line)" }}
                />
                <span style={{ fontSize: 12.5, color: "var(--color-muted)" }}>น.</span>
              </div>
            )}

            {withTime && (
              <div className="flex flex-wrap gap-1.5">
                <QuickButton label="วันนี้" onClick={() => quickPick(0)} />
                <QuickButton label="พรุ่งนี้" onClick={() => quickPick(1)} />
                <QuickButton label="สัปดาห์หน้า" onClick={() => quickPick(7)} />
              </div>
            )}

            <div className="flex items-center justify-between border-t pt-2" style={{ borderColor: "var(--color-line)" }}>
              <button
                type="button"
                onClick={() => {
                  onChange(null);
                  onOpenChange(false);
                }}
                style={{ fontSize: 12, color: "var(--color-muted)" }}
              >
                ไม่กำหนด
              </button>
              <button type="button" onClick={() => onOpenChange(false)} style={{ fontSize: 12, fontWeight: 700, color: "var(--color-accent)" }}>
                เสร็จสิ้น
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function QuickButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-md border"
      style={{ height: 22, padding: "0 8px", fontSize: 11.5, borderColor: "var(--color-line)", color: "var(--color-ink-soft)" }}
    >
      {label}
    </button>
  );
}

export default ThaiDatePicker;
