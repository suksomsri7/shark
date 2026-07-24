"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { StatusChip } from "@/components/ui/StatusChip";
import {
  BOOKING_STATUS_LABEL,
  HOTEL_RESV_STATUS_LABEL,
  HR_LEAVE_STATUS_LABEL,
} from "@/lib/ui/status-labels";

// ── ปฏิทินกลางรวม (WO-0057) — READ-ONLY: grid เดือน + จุดสีต่อ kind + กดวันดูรายการ ──
// ไม่มีปุ่มสร้าง/แก้ไข (v1 อ่านอย่างเดียว — สร้างที่โมดูลต้นทาง)

export type CalEventKind = "APPOINTMENT" | "HOTEL_STAY" | "HR_LEAVE";
export type CalEventDTO = {
  id: string;
  kind: CalEventKind;
  title: string;
  start: string; // ISO
  end: string; // ISO
  status: string;
};

// สีแยก kind — ใช้ token เท่านั้น (ink=ดำ / accent=น้ำเงิน / muted=เทา) ไม่มีสีสด
const KIND: Record<CalEventKind, { label: string; color: string }> = {
  APPOINTMENT: { label: "นัดหมาย", color: "var(--color-ink)" },
  HOTEL_STAY: { label: "การเข้าพัก", color: "var(--color-accent)" },
  HR_LEAVE: { label: "วันลา", color: "var(--color-muted)" },
};
const KIND_ORDER: CalEventKind[] = ["APPOINTMENT", "HOTEL_STAY", "HR_LEAVE"];

const STATUS_LABEL: Record<CalEventKind, Record<string, string>> = {
  APPOINTMENT: BOOKING_STATUS_LABEL,
  HOTEL_STAY: HOTEL_RESV_STATUS_LABEL,
  HR_LEAVE: HR_LEAVE_STATUS_LABEL,
};

const WEEKDAYS = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];

const pad = (n: number) => String(n).padStart(2, "0");
// ขอบเขตวัน (BKK) เป็น Date — เที่ยงคืนไทย = +07:00
const dayStart = (y: number, m: number, d: number) => new Date(`${y}-${pad(m)}-${pad(d)}T00:00:00+07:00`);
// event ทับวัน D ⇔ start < สิ้นวัน (D+1 เที่ยงคืน) และ end > ต้นวัน D
function overlapsDay(ev: CalEventDTO, ds: Date, de: Date): boolean {
  return new Date(ev.start).getTime() < de.getTime() && new Date(ev.end).getTime() > ds.getTime();
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("th-TH", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Bangkok",
  });
}
function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("th-TH", {
    day: "numeric",
    month: "short",
    timeZone: "Asia/Bangkok",
  });
}
// บรรทัดเวลา/ช่วงของ event ในรายการวัน
function whenText(ev: CalEventDTO): string {
  if (ev.kind === "APPOINTMENT") return `${fmtTime(ev.start)} – ${fmtTime(ev.end)} น.`;
  return `${fmtDate(ev.start)} – ${fmtDate(ev.end)}`;
}

export function CalendarMonth({
  year,
  month, // 1–12
  events,
  prevYm,
  nextYm,
  todayStr, // "YYYY-MM-DD" ตามเวลาไทย
}: {
  year: number;
  month: number;
  events: CalEventDTO[];
  prevYm: string;
  nextYm: string;
  todayStr: string;
}) {
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  // วันในสัปดาห์ของวันที่ 1 (0=อาทิตย์) ตามเวลาไทย → จำนวนช่องว่างนำหน้า grid
  const startBlank = new Date(`${year}-${pad(month)}-01T12:00:00+07:00`).getUTCDay();

  // เตรียม kinds ต่อวัน (จุดสี) + จำนวน event ต่อวัน
  const perDay = useMemo(() => {
    const map = new Map<number, { kinds: Set<CalEventKind>; count: number }>();
    for (let d = 1; d <= daysInMonth; d++) {
      const ds = dayStart(year, month, d);
      const de = dayStart(year, month, d + 1);
      const kinds = new Set<CalEventKind>();
      let count = 0;
      for (const ev of events) {
        if (overlapsDay(ev, ds, de)) {
          kinds.add(ev.kind);
          count++;
        }
      }
      map.set(d, { kinds, count });
    }
    return map;
  }, [events, year, month, daysInMonth]);

  const todayInMonth =
    todayStr.startsWith(`${year}-${pad(month)}`) ? Number(todayStr.slice(8, 10)) : null;
  const [selected, setSelected] = useState<number | null>(todayInMonth);

  const selectedEvents = useMemo(() => {
    if (selected == null) return [];
    const ds = dayStart(year, month, selected);
    const de = dayStart(year, month, selected + 1);
    return events
      .filter((ev) => overlapsDay(ev, ds, de))
      .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
  }, [selected, events, year, month]);

  const monthLabel = new Date(`${year}-${pad(month)}-15T12:00:00+07:00`).toLocaleDateString("th-TH", {
    month: "long",
    year: "numeric",
    timeZone: "Asia/Bangkok",
  });

  const cells: (number | null)[] = [
    ...Array<null>(startBlank).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  return (
    <div className="flex flex-col gap-4">
      {/* แถบเดือน + ปุ่มก่อน/ถัดไป */}
      <div className="flex items-center justify-between">
        <Link href={`/app/calendar?ym=${prevYm}`} className="btn-sm" aria-label="เดือนก่อนหน้า">
          ← ก่อนหน้า
        </Link>
        <div className="text-base font-semibold">{monthLabel}</div>
        <Link href={`/app/calendar?ym=${nextYm}`} className="btn-sm" aria-label="เดือนถัดไป">
          ถัดไป →
        </Link>
      </div>

      {/* ตารางเดือน */}
      <div className="card p-3">
        <div className="grid grid-cols-7 gap-1 text-center text-xs text-[color:var(--color-muted)]">
          {WEEKDAYS.map((w) => (
            <div key={w} className="py-1">
              {w}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {cells.map((d, i) => {
            if (d == null) return <div key={`b-${i}`} className="aspect-square" />;
            const info = perDay.get(d);
            const isToday = todayInMonth === d;
            const isSel = selected === d;
            return (
              <button
                key={d}
                type="button"
                onClick={() => setSelected(d)}
                className={`flex aspect-square flex-col items-center justify-start rounded-lg border p-1 text-sm hover:bg-[color:var(--color-surface-2)] ${
                  isSel
                    ? "border-2 border-[color:var(--color-accent)]"
                    : "border-[color:var(--color-line)]"
                }`}
                aria-label={`วันที่ ${d}${info && info.count > 0 ? ` มี ${info.count} รายการ` : ""}`}
              >
                <span className={isToday ? "font-semibold text-[color:var(--color-accent)]" : ""}>{d}</span>
                <span className="mt-auto flex min-h-[8px] items-center gap-0.5">
                  {info &&
                    KIND_ORDER.filter((k) => info.kinds.has(k)).map((k) => (
                      <span
                        key={k}
                        className="h-1.5 w-1.5 rounded-full"
                        style={{ backgroundColor: KIND[k].color }}
                      />
                    ))}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* คำอธิบายสัญลักษณ์ */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-[color:var(--color-muted)]">
        {KIND_ORDER.map((k) => (
          <span key={k} className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: KIND[k].color }} />
            {KIND[k].label}
          </span>
        ))}
      </div>

      {/* รายการของวันที่เลือก (ใต้ตาราง — แบบที่เจ้าของสั่ง · วันเลือกมีขอบน้ำเงิน) */}
      <div className="flex flex-col gap-2">
        <h2 className="text-sm font-medium">
          {selected != null
            ? `รายการวันที่ ${selected} ${monthLabel}`
            : "แตะวันในปฏิทินเพื่อดูรายการ"}
        </h2>
        {selected != null && selectedEvents.length === 0 && (
          <div className="card py-6 text-center text-sm text-[color:var(--color-muted)]">
            ไม่มีรายการในวันนี้
          </div>
        )}
        {selectedEvents.map((ev) => (
          <div key={`${ev.kind}-${ev.id}`} className="card flex flex-col gap-1 p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                <span
                  className="mt-0.5 h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: KIND[ev.kind].color }}
                />
                <span className="text-sm font-medium">{ev.title}</span>
              </div>
              <StatusChip value={ev.status} map={STATUS_LABEL[ev.kind]} />
            </div>
            <div className="pl-4 text-xs text-[color:var(--color-muted)]">
              {KIND[ev.kind].label} · {whenText(ev)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default CalendarMonth;
