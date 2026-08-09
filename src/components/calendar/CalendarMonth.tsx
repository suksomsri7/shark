"use client";

// ── ปฏิทินเต็มเดือน (WO-0057) — READ-ONLY: grid เดือน + จุดสีต่อ kind + กดวันดูรายการ ──
// ใช้ที่หน้า /app/calendar เท่านั้น · หน้าแรกใช้ CalendarDayNav (แถบวัน + ปฏิทินใน modal)
// ชิ้นส่วน (grid / รายการ / คำอธิบายสัญลักษณ์) อยู่ใน ./shared เพื่อให้สองที่ไม่เพี้ยนจากกัน
// ไม่มีปุ่มสร้าง/แก้ไข (v1 อ่านอย่างเดียว — สร้างที่โมดูลต้นทาง)

import { useEffect, useState } from "react";
import {
  EventList,
  KindLegend,
  MonthGrid,
  eventsOfDay,
  monthLabelOf,
  pad,
  shiftMonth,
  type CalEventDTO,
} from "./shared";

export type { CalEventDTO, CalEventKind } from "./shared";

export function CalendarMonth({
  year: initialYear,
  month: initialMonth, // 1–12
  events: initialEvents,
  todayStr, // "YYYY-MM-DD" ตามเวลาไทย
}: {
  year: number;
  month: number;
  events: CalEventDTO[];
  todayStr: string;
}) {
  // เปลี่ยนเดือนฝั่ง client ล้วน (ไม่ reload หน้า) — โหลดเดือนใหม่จาก /api/calendar/month + cache + สไลด์
  const ymOf = (y: number, m: number) => `${y}-${pad(m)}`;
  const [view, setView] = useState({ year: initialYear, month: initialMonth });
  const [monthCache, setMonthCache] = useState<Record<string, CalEventDTO[]>>({
    [ymOf(initialYear, initialMonth)]: initialEvents,
  });
  const [dir, setDir] = useState<"L" | "R">("R");
  const [loadingMonth, setLoadingMonth] = useState(false);
  const year = view.year;
  const month = view.month;
  const ymKey = ymOf(year, month);
  const events = monthCache[ymKey] ?? [];

  async function goMonth(delta: -1 | 1) {
    const { year: ny, month: nm } = shiftMonth(year, month, delta);
    const key = ymOf(ny, nm);
    setDir(delta === 1 ? "R" : "L");
    // optimistic: สไลด์เดือนใหม่ทันที (จุดสีตามมาเมื่อโหลดเสร็จ) — เดิมรอ fetch ก่อนค่อยเลื่อน = ค้าง ~3 วิ
    setView({ year: ny, month: nm });
    if (!monthCache[key]) {
      setLoadingMonth(true);
      try {
        const res = await fetch(`/api/calendar/month?ym=${key}`);
        const data = (await res.json()) as { events?: CalEventDTO[] };
        setMonthCache((c) => ({ ...c, [key]: data.events ?? [] }));
      } catch {
        setMonthCache((c) => ({ ...c, [key]: [] }));
      } finally {
        setLoadingMonth(false);
      }
    }
  }

  const todayInMonth = todayStr.startsWith(`${year}-${pad(month)}`)
    ? Number(todayStr.slice(8, 10))
    : null;
  const [selected, setSelected] = useState<number | null>(todayInMonth);
  // เปลี่ยนเดือน → เลือกวันนี้ถ้าอยู่เดือนนั้น ไม่งั้นล้างการเลือก
  useEffect(() => {
    setSelected(todayStr.startsWith(`${year}-${pad(month)}`) ? Number(todayStr.slice(8, 10)) : null);
  }, [year, month, todayStr]);

  const monthLabel = monthLabelOf(year, month);
  const selectedEvents = selected == null ? [] : eventsOfDay(events, year, month, selected);

  return (
    <div className="flex flex-col gap-4">
      {/* แถบเดือน + ปุ่มก่อน/ถัดไป */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => void goMonth(-1)}
          disabled={loadingMonth}
          className="btn-sm"
          aria-label="เดือนก่อนหน้า"
        >
          ← ก่อนหน้า
        </button>
        <div className="text-base font-semibold">{monthLabel}</div>
        <button
          type="button"
          onClick={() => void goMonth(1)}
          disabled={loadingMonth}
          className="btn-sm"
          aria-label="เดือนถัดไป"
        >
          ถัดไป →
        </button>
      </div>

      {/* ตารางเดือน — key ต่อเดือน + สไลด์ตามทิศ */}
      <div key={ymKey} className={dir === "R" ? "cal-slide-r card p-3" : "cal-slide-l card p-3"}>
        <MonthGrid
          year={year}
          month={month}
          events={events}
          todayStr={todayStr}
          selected={selected}
          onSelect={setSelected}
        />
      </div>

      <KindLegend />

      {/* รายการของวันที่เลือก (ใต้ตาราง — แบบที่เจ้าของสั่ง · วันเลือกมีขอบน้ำเงิน) */}
      <div className="flex flex-col gap-2">
        <h2 className="text-sm font-medium">
          {selected != null ? `รายการวันที่ ${selected} ${monthLabel}` : "แตะวันในปฏิทินเพื่อดูรายการ"}
        </h2>
        {selected != null && <EventList events={selectedEvents} emptyText="ไม่มีรายการในวันนี้" />}
      </div>
    </div>
  );
}

export default CalendarMonth;
