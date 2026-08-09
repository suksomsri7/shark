"use client";

// แถบวันบนหน้าแรก (คำสั่งเจ้าของ 9 ส.ค. 2026)
//   ‹ ก่อนหน้า   [ วันที่ ]   ถัดไป ›     ← กดวันที่ = เปิดปฏิทินกลางจอ
// เดิมหน้าแรกแปะตารางเดือนทั้งใบ กินพื้นที่เกือบครึ่งจอทั้งที่ส่วนใหญ่เจ้าของดูแค่ "วันนี้มีอะไร"
//
// ข้อมูล: โหลดทีละเดือนจาก /api/calendar/month แล้ว cache ไว้ — เดินวันข้ามเดือนจึงไม่กระตุก
// เดือนแรกมาพร้อมหน้า (server) ไม่ต้องยิงเพิ่ม

import { useCallback, useEffect, useRef, useState } from "react";
import {
  EventList,
  KindLegend,
  MonthGrid,
  daysInMonthOf,
  eventsOfDay,
  monthLabelOf,
  pad,
  shiftMonth,
  type CalEventDTO,
} from "./shared";

type Ymd = { year: number; month: number; day: number };

const ymOf = (y: number, m: number) => `${y}-${pad(m)}`;

/** เดินวัน ±1 ข้ามเดือน/ปีถูกต้อง */
function shiftDay(d: Ymd, delta: -1 | 1): Ymd {
  const next = d.day + delta;
  if (next >= 1 && next <= daysInMonthOf(d.year, d.month)) return { ...d, day: next };
  const m = shiftMonth(d.year, d.month, delta);
  return { ...m, day: delta === 1 ? 1 : daysInMonthOf(m.year, m.month) };
}

/** "อาทิตย์ 9 ส.ค. 2569" — สั้นพอสำหรับจอมือถือแต่ยังบอกวันในสัปดาห์ */
function dayLabel(d: Ymd): string {
  return new Date(`${d.year}-${pad(d.month)}-${pad(d.day)}T12:00:00+07:00`).toLocaleDateString("th-TH", {
    weekday: "long",
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Bangkok",
  });
}

export function CalendarDayNav({
  year: initialYear,
  month: initialMonth,
  events: initialEvents,
  todayStr, // "YYYY-MM-DD" ตามเวลาไทย
}: {
  year: number;
  month: number;
  events: CalEventDTO[];
  todayStr: string;
}) {
  const today: Ymd = {
    year: Number(todayStr.slice(0, 4)),
    month: Number(todayStr.slice(5, 7)),
    day: Number(todayStr.slice(8, 10)),
  };
  // เริ่มที่วันนี้ถ้าอยู่ในเดือนที่ server ส่งมา ไม่งั้นวันที่ 1 ของเดือนนั้น
  const [sel, setSel] = useState<Ymd>(
    todayStr.startsWith(ymOf(initialYear, initialMonth))
      ? today
      : { year: initialYear, month: initialMonth, day: 1 },
  );
  const [cache, setCache] = useState<Record<string, CalEventDTO[]>>({
    [ymOf(initialYear, initialMonth)]: initialEvents,
  });
  const [open, setOpen] = useState(false);
  // เดือนที่กำลังดูใน modal (แยกจากวันที่เลือก — เปิดปฏิทินแล้วพลิกดูเดือนอื่นได้โดยยังไม่เลือก)
  const [view, setView] = useState({ year: sel.year, month: sel.month });

  // โหลดเดือนที่ยังไม่มีใน cache (ทั้งเดือนของวันที่เลือก และเดือนที่เปิดดูใน modal)
  // ใช้ ref กันยิงซ้ำแทนการอ่าน cache ใน closure — ไม่งั้น callback เปลี่ยน identity ทุกครั้งที่ cache ขยับ
  // แล้ว effect จะวิ่งวนไม่จบ
  const requested = useRef<Set<string>>(new Set([ymOf(initialYear, initialMonth)]));
  const [loading, setLoading] = useState(false);
  const ensureMonth = useCallback(async (y: number, m: number) => {
    const key = ymOf(y, m);
    if (requested.current.has(key)) return;
    requested.current.add(key);
    setLoading(true);
    try {
      const res = await fetch(`/api/calendar/month?ym=${key}`);
      const data = (await res.json()) as { events?: CalEventDTO[] };
      setCache((c) => ({ ...c, [key]: data.events ?? [] }));
    } catch {
      setCache((c) => ({ ...c, [key]: [] })); // โหลดไม่ได้ = ถือว่าไม่มีรายการ ห้ามให้หน้าพัง
    } finally {
      setLoading(false);
    }
  }, [initialYear, initialMonth]);

  useEffect(() => {
    void ensureMonth(sel.year, sel.month);
  }, [sel.year, sel.month, ensureMonth]);
  useEffect(() => {
    if (open) void ensureMonth(view.year, view.month);
  }, [open, view.year, view.month, ensureMonth]);

  // ปิด modal ด้วย Esc — ปุ่มปิดอย่างเดียวไม่พอสำหรับคนใช้คีย์บอร์ด
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const selKey = ymOf(sel.year, sel.month);
  const selLoaded = selKey in cache;
  const dayEvents = eventsOfDay(cache[selKey] ?? [], sel.year, sel.month, sel.day);
  void loading;
  const isToday =
    sel.year === today.year && sel.month === today.month && sel.day === today.day;

  function openPicker() {
    setView({ year: sel.year, month: sel.month });
    setOpen(true);
  }

  return (
    <div className="flex flex-col gap-3">
      {/* แถบเดินวัน — ‹ ก่อนหน้า | วันที่ | ถัดไป › */}
      <div className="card flex items-center justify-between gap-2 p-2">
        <button
          type="button"
          onClick={() => setSel((d) => shiftDay(d, -1))}
          aria-label="วันก่อนหน้า"
          className="flex min-h-[40px] shrink-0 items-center gap-1 rounded-lg px-2 text-sm hover:bg-[color:var(--color-surface-2)]"
        >
          <span aria-hidden>‹</span> ก่อนหน้า
        </button>

        <button
          type="button"
          onClick={openPicker}
          aria-haspopup="dialog"
          className="flex min-w-0 flex-1 flex-col items-center rounded-lg px-2 py-1 hover:bg-[color:var(--color-surface-2)]"
        >
          <span className="truncate text-sm font-semibold">{dayLabel(sel)}</span>
          <span className="text-[11px] text-[color:var(--color-muted)]">
            {isToday ? "วันนี้ · แตะเพื่อเลือกวัน" : "แตะเพื่อเลือกวัน"}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setSel((d) => shiftDay(d, 1))}
          aria-label="วันถัดไป"
          className="flex min-h-[40px] shrink-0 items-center gap-1 rounded-lg px-2 text-sm hover:bg-[color:var(--color-surface-2)]"
        >
          ถัดไป <span aria-hidden>›</span>
        </button>
      </div>

      {!isToday && (
        <button
          type="button"
          onClick={() => setSel(today)}
          className="self-start text-xs text-[color:var(--color-accent)] underline"
        >
          กลับไปวันนี้
        </button>
      )}

      {selLoaded ? (
        <EventList events={dayEvents} emptyText="ไม่มีรายการในวันนี้" />
      ) : (
        // ยังโหลดเดือนนี้ไม่เสร็จ — ห้ามขึ้น "ไม่มีรายการ" ทั้งที่ยังไม่รู้ (เข้าใจผิดง่ายมาก)
        <div className="card py-6 text-center text-sm text-[color:var(--color-muted)]">กำลังโหลด…</div>
      )}

      {/* ปฏิทินกลางจอ */}
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-label="เลือกวัน"
        >
          <div className="absolute inset-0 bg-black/30" onClick={() => setOpen(false)} />
          <div className="relative w-full rounded-t-2xl bg-[color:var(--color-surface)] p-4 shadow-[0_-4px_20px_rgba(0,0,0,0.12)] sm:max-w-md sm:rounded-2xl">
            <div className="mb-3 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setView((v) => shiftMonth(v.year, v.month, -1))}
                aria-label="เดือนก่อนหน้า"
                className="flex h-10 w-10 items-center justify-center rounded-lg text-lg hover:bg-[color:var(--color-surface-2)]"
              >
                ‹
              </button>
              <div className="text-base font-semibold">{monthLabelOf(view.year, view.month)}</div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setView((v) => shiftMonth(v.year, v.month, 1))}
                  aria-label="เดือนถัดไป"
                  className="flex h-10 w-10 items-center justify-center rounded-lg text-lg hover:bg-[color:var(--color-surface-2)]"
                >
                  ›
                </button>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="ปิด"
                  className="flex h-10 w-10 items-center justify-center rounded-lg text-xl leading-none hover:bg-[color:var(--color-surface-2)]"
                >
                  ✕
                </button>
              </div>
            </div>

            <MonthGrid
              year={view.year}
              month={view.month}
              events={cache[ymOf(view.year, view.month)] ?? []}
              todayStr={todayStr}
              selected={
                sel.year === view.year && sel.month === view.month ? sel.day : null
              }
              onSelect={(day) => {
                setSel({ year: view.year, month: view.month, day });
                setOpen(false); // เลือกแล้วปิดเลย — เจ้าของร้านมาเลือกวัน ไม่ได้มาอ่านปฏิทิน
              }}
            />

            <div className="mt-3 flex items-center justify-between gap-2">
              <KindLegend />
              <button
                type="button"
                onClick={() => {
                  setSel(today);
                  setOpen(false);
                }}
                className="shrink-0 text-xs text-[color:var(--color-accent)] underline"
              >
                วันนี้
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default CalendarDayNav;
