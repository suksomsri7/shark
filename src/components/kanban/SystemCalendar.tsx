// SystemCalendar.tsx — ปฏิทินรวมทุกบอร์ดที่มองเห็น `/kanban/calendar` (K2.12 · ปิดหนี้ P2)
//
// อ่านอย่างเดียวเสมอ (ไม่มีถาดลาก — ต่างจาก `CalendarView.tsx` ของบอร์ดใบเดียว): เห็นเดือน/สัปดาห์
// เดียวกับปฏิทินของบอร์ด (โครงกริดเดียวกัน reuse ความคิดจาก `CalendarView.tsx` K2.2) แต่รวมทุกบอร์ด ·
// ชิปการ์ดมีสีตาม**บอร์ด** (ไม่ใช่ป้ายกำกับ) + ชื่อบอร์ดกำกับ · คลิกการ์ด → หน้าบอร์ดของการ์ดนั้น `?card=`
// ตัวกรองเลือกบอร์ด (testid `calendar-boards`) เปลี่ยนแล้ว navigate ใหม่ (server คำนวณซ้ำ)
//
// ⚠️ ห้ามใช้อีโมจิ — ไอคอนทุกตัวมาจาก <KanbanIcon> · ห้ามใช้ตัวแปลงวันที่ของเบราว์เซอร์/Intl (บทเรียน K1.5)
"use client";

import { useState, useSyncExternalStore, useTransition } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { KanbanIcon } from "./KanbanIcon";
import { tagColorVar } from "./Card";
import type { SystemCalDayDto, SystemCalendarDto } from "@/lib/modules/kanban/types";

const BKK_OFFSET_MS = 7 * 60 * 60 * 1000; // Asia/Bangkok = UTC+7 ตายตัว (ไม่มี DST) — คำนวณเองล้วน
const DAY_MS = 86_400_000;
const TH_MONTH = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
const TH_WDAY_MON_FIRST = ["จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส.", "อา."];

const pad2 = (n: number) => (n < 10 ? `0${n}` : String(n));

function indexOfYmd(y: number, m: number, d: number): number {
  return Date.UTC(y, m, d) / DAY_MS;
}
function ymdOfIndex(dayIndex: number): { y: number; m: number; d: number; weekday: number } {
  const dt = new Date(dayIndex * DAY_MS);
  return { y: dt.getUTCFullYear(), m: dt.getUTCMonth(), d: dt.getUTCDate(), weekday: dt.getUTCDay() };
}
function keyOfIndex(dayIndex: number): string {
  const { y, m, d } = ymdOfIndex(dayIndex);
  return `${y}-${pad2(m + 1)}-${pad2(d)}`;
}

// ── < 640px = มือถือ — `useSyncExternalStore` กัน hydration mismatch (แบบเดียวกับ K2.1/K2.2 TableView/CalendarView) ──
const MOBILE_QUERY = "(max-width: 639px)";
function subscribeMobileQuery(onChange: () => void): () => void {
  const mql = window.matchMedia(MOBILE_QUERY);
  mql.addEventListener("change", onChange);
  return () => mql.removeEventListener("change", onChange);
}
const getMobileSnapshot = () => window.matchMedia(MOBILE_QUERY).matches;
const getMobileServerSnapshot = () => false;
function useIsMobileSystemCalendar(): boolean {
  return useSyncExternalStore(subscribeMobileQuery, getMobileSnapshot, getMobileServerSnapshot);
}

const ghostBtn: React.CSSProperties = {
  height: 30,
  padding: "0 10px",
  borderRadius: 7,
  fontSize: 12.5,
  border: "1px solid var(--color-line)",
  background: "var(--color-surface)",
  color: "var(--color-ink-soft)",
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  whiteSpace: "nowrap",
};

export function SystemCalendar({
  systemId,
  data,
  month,
  now,
  selectedBoardIds,
}: {
  systemId: string;
  data: SystemCalendarDto;
  /** "YYYY-MM" (เวลาไทย) — เดือนที่กำลังดู */
  month: string;
  /** ISO — เวลาอ้างอิงของ server ตอนเรนเดอร์ (คำนวณ "วันนี้") */
  now: string;
  /** บอร์ดที่ถูกเลือกไว้ตอนนี้ (ว่าง = ทุกบอร์ด) */
  selectedBoardIds: string[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const isMobile = useIsMobileSystemCalendar();
  const [, startTransition] = useTransition();
  const [boardsOpen, setBoardsOpen] = useState(false);
  const nowMs = Date.parse(now);

  const setParam = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === "") next.delete(k);
      else next.set(k, v);
    }
    startTransition(() => router.push(`${pathname}?${next.toString()}`, { scroll: false }));
  };

  const openCard = (boardId: string, cardId: string) => {
    router.push(`/app/sys/${systemId}/kanban/b/${boardId}?card=${cardId}`);
  };

  const [yy, mm] = month.split("-").map(Number) as [number, number];
  const mIdx = mm - 1;
  const todayIndex = Math.floor((nowMs + BKK_OFFSET_MS) / DAY_MS);
  const firstOfMonthIdx = indexOfYmd(yy, mIdx, 1);
  const daysInMonth = new Date(Date.UTC(yy, mIdx + 1, 0)).getUTCDate();
  const lastOfMonthIdx = firstOfMonthIdx + daysInMonth - 1;
  const firstWeekday = ymdOfIndex(firstOfMonthIdx).weekday;
  const gridStart = firstOfMonthIdx - ((firstWeekday + 6) % 7);
  const lastWeekday = ymdOfIndex(lastOfMonthIdx).weekday;
  const gridEnd = lastOfMonthIdx + ((7 - lastWeekday) % 7);
  const cells: number[] = [];
  for (let i = gridStart; i <= gridEnd; i++) cells.push(i);

  const shiftMonth = (delta: number): string => {
    const total = yy * 12 + mIdx + delta;
    const ny = Math.floor(total / 12);
    const nm = ((total % 12) + 12) % 12;
    return `${ny}-${pad2(nm + 1)}`;
  };

  const toggleBoard = (id: string) => {
    const next = selectedBoardIds.includes(id) ? selectedBoardIds.filter((b) => b !== id) : [...selectedBoardIds, id];
    setParam({ board: next.length > 0 ? next.join(",") : null });
  };

  const header = (
    <>
      <div className="flex flex-none flex-wrap items-center justify-between" style={{ gap: 8, padding: "10px 20px", borderBottom: "1px solid var(--color-line)" }}>
        <h1 style={{ fontSize: 15, fontWeight: 700 }}>ปฏิทินงาน</h1>
        <span className="relative">
          <button type="button" data-testid="calendar-boards" onClick={() => setBoardsOpen((o) => !o)} style={ghostBtn}>
            <KanbanIcon name="filter" size="sm" />
            บอร์ด {selectedBoardIds.length > 0 ? `(${selectedBoardIds.length})` : "ทั้งหมด"}
          </button>
          {boardsOpen && (
            <>
              <span className="fixed inset-0 z-40" onClick={() => setBoardsOpen(false)} />
              <div
                className="absolute right-0 top-full z-50 mt-1 flex max-h-72 w-64 flex-col gap-0.5 overflow-y-auto rounded-xl border p-1.5"
                style={{ background: "var(--color-surface)", borderColor: "var(--color-line)", boxShadow: "0 14px 34px rgba(10,10,10,.14)" }}
              >
                {data.boards.length === 0 && (
                  <span className="px-2 py-1.5" style={{ fontSize: 12.5, color: "var(--color-muted)" }}>
                    ยังไม่มีบอร์ดที่มองเห็น
                  </span>
                )}
                {data.boards.map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => toggleBoard(b.id)}
                    className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-left"
                    style={{ fontSize: 12.5, background: selectedBoardIds.includes(b.id) ? "var(--color-surface-2)" : "transparent" }}
                  >
                    <span style={{ width: 10, height: 10, borderRadius: 3, background: tagColorVar(b.color), flexShrink: 0 }} />
                    <span className="flex-1 truncate">{b.name}</span>
                    <span style={{ color: "var(--color-muted)" }}>{b.count}</span>
                  </button>
                ))}
                {selectedBoardIds.length > 0 && (
                  <button type="button" onClick={() => setParam({ board: null })} className="mt-1 rounded-lg px-2 py-1.5 text-left underline" style={{ fontSize: 12, color: "var(--color-accent)" }}>
                    ล้างตัวกรอง (ทุกบอร์ด)
                  </button>
                )}
              </div>
            </>
          )}
        </span>
      </div>
      <div className="flex flex-none flex-wrap items-center" style={{ gap: 8, padding: "9px 20px", borderBottom: "1px solid var(--color-line)" }}>
        <span className="flex items-center" style={{ gap: 6 }}>
          <button type="button" aria-label="เดือนก่อนหน้า" onClick={() => setParam({ month: shiftMonth(-1) })} style={{ color: "var(--color-muted)" }}>
            <KanbanIcon name="back" size="sm" />
          </button>
          <span style={{ fontSize: 13.5, fontWeight: 700, minWidth: 140, textAlign: "center" }}>
            {TH_MONTH[mIdx]} {yy + 543}
          </span>
          <button type="button" aria-label="เดือนถัดไป" onClick={() => setParam({ month: shiftMonth(1) })} style={{ color: "var(--color-muted)" }}>
            <KanbanIcon name="ar" size="sm" />
          </button>
        </span>
        <button type="button" data-testid="calendar-today-btn" onClick={() => setParam({ month: null })} style={ghostBtn}>
          วันนี้
        </button>
      </div>
    </>
  );

  if (isMobile) {
    return (
      <div data-testid="system-calendar" className="flex flex-col" style={{ background: "var(--color-stage)" }}>
        {header}
        <div className="flex flex-col overflow-y-auto">
          {cells
            .filter((idx) => idx >= firstOfMonthIdx && idx <= lastOfMonthIdx)
            .map((idx) => {
              const key = keyOfIndex(idx);
              const { d, weekday } = ymdOfIndex(idx);
              const cell: SystemCalDayDto = data.days[key] ?? { cards: [] };
              return (
                <div key={key} className="border-b" style={{ padding: "8px 14px", borderColor: "var(--color-line)" }}>
                  <p style={{ fontSize: 11.5, fontWeight: 700, color: idx === todayIndex ? "var(--color-accent)" : "var(--color-muted)" }}>
                    {TH_WDAY_MON_FIRST[(weekday + 6) % 7]} {d}
                  </p>
                  <div className="mt-1 flex flex-col gap-1">
                    {cell.cards.length === 0 && <span style={{ fontSize: 11.5, color: "var(--color-muted)" }}>—</span>}
                    {cell.cards.map((c) => (
                      <SystemCalCardChip key={`${c.boardId}:${c.id}`} card={c} onClick={() => openCard(c.boardId, c.id)} />
                    ))}
                  </div>
                </div>
              );
            })}
        </div>
      </div>
    );
  }

  return (
    <div data-testid="system-calendar" className="flex flex-col" style={{ background: "var(--color-stage)" }}>
      {header}
      <div className="grid flex-none" style={{ gridTemplateColumns: "repeat(7, minmax(0, 1fr))", borderBottom: "1px solid var(--color-line)" }}>
        {TH_WDAY_MON_FIRST.map((w) => (
          <span key={w} style={{ padding: "6px 8px", fontSize: 11.5, color: "var(--color-muted)", textAlign: "center" }}>
            {w}
          </span>
        ))}
      </div>
      <div className="grid" style={{ gridTemplateColumns: "repeat(7, minmax(0, 1fr))" }}>
        {cells.map((idx) => {
          const key = keyOfIndex(idx);
          const { d } = ymdOfIndex(idx);
          const cell: SystemCalDayDto = data.days[key] ?? { cards: [] };
          const inCurrentMonth = idx >= firstOfMonthIdx && idx <= lastOfMonthIdx;
          return (
            <div
              key={key}
              data-testid="system-calendar-day"
              data-date={key}
              className="flex flex-col border-b border-r"
              style={{ minHeight: 96, padding: 6, gap: 3, borderColor: "var(--color-line)", opacity: inCurrentMonth ? 1 : 0.4 }}
            >
              <span
                data-testid={idx === todayIndex ? "system-calendar-today" : undefined}
                className="inline-flex items-center justify-center self-start"
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: 999,
                  fontSize: 12,
                  fontWeight: idx === todayIndex ? 700 : 400,
                  background: idx === todayIndex ? "var(--color-accent)" : "transparent",
                  color: idx === todayIndex ? "#fff" : "var(--color-ink-soft)",
                }}
              >
                {d}
              </span>
              <div className="flex flex-col" style={{ gap: 2 }}>
                {cell.cards.map((c) => (
                  <SystemCalCardChip key={`${c.boardId}:${c.id}`} card={c} onClick={() => openCard(c.boardId, c.id)} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ───────────────────────── ชิปการ์ด 1 ใบ (สีตามบอร์ด + ชื่อบอร์ดกำกับ) ─────────────────────────

function SystemCalCardChip({ card, onClick }: { card: SystemCalendarDto["days"][string]["cards"][number]; onClick: () => void }) {
  const color = tagColorVar(card.boardColor);
  return (
    <div
      data-testid="system-calendar-card-chip"
      data-card-id={card.id}
      data-board-id={card.boardId}
      role="button"
      tabIndex={0}
      onClick={onClick}
      className="flex flex-col truncate rounded"
      style={{ gap: 1, padding: "2px 5px", fontSize: 11, cursor: "pointer", borderLeft: `3px solid ${color}`, background: "var(--color-surface)" }}
    >
      <span className="flex items-center truncate" style={{ gap: 4 }}>
        {card.isOverdue && <span style={{ width: 6, height: 6, borderRadius: 999, background: "var(--color-tag-red)", flexShrink: 0 }} />}
        <span className="truncate">{card.title}</span>
      </span>
      <span className="truncate" style={{ fontSize: 9.5, color, fontWeight: 600 }}>
        {card.boardName}
      </span>
    </div>
  );
}

export default SystemCalendar;
