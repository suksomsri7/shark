// TimelineView.tsx — มุมมองไทม์ไลน์ `?view=timeline` (K2.3 · พิมพ์เขียว 13-kanban-v2 §3.6 · ไม่มี mockup —
// เกณฑ์ §13 K2.3: แถบตรงช่วงวันจริง · ลากขอบแล้วค่า startAt/dueAt ใน DB เปลี่ยนตาม)
//
// หน้าที่: แถบงาน `startAt → dueAt` ของการ์ด ACTIVE ที่มี dueAt ในช่วงที่กำลังดู จัดกลุ่มตามคอลัมน์/คน/ป้าย
// ซูมได้ 3 ระดับ (สัปดาห์/เดือน/ไตรมาส — ความกว้างวันต่างกัน) · ลากขอบซ้าย/ขวาเปลี่ยนช่วงวัน
// (`setCardRangeAction`) · ลากตัวแถบเลื่อนทั้งช่วง (`shiftCardRangeAction`) · optimistic + rollback ผ่าน
// `overrides` (ไม่แก้ `data.rows` ตรง ๆ — การ์ดเดียวอาจอยู่หลายแถวเมื่อ group=assignee/label)
//
// ⚠️ pointer events เอง (ไม่ใช่ lib ลาก) — เหตุผลเดียวกับ `CalendarView.tsx`/`BoardView.tsx` (K1.5/K2.2)
// ⚠️ ห้ามใช้อีโมจิ — ไอคอนทุกตัวมาจาก <KanbanIcon> · ห้ามใช้ตัวแปลงวันที่ของเบราว์เซอร์/Intl (hydration — K1.5)
"use client";

import { useMemo, useRef, useState, useSyncExternalStore, useTransition } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { BoardHeader } from "./BoardHeader";
import { FilterBar } from "./FilterBar";
import { KanbanIcon } from "./KanbanIcon";
import { tagColorVar } from "./Card";
import { renameBoardAction, setCardRangeAction, shiftCardRangeAction, starBoardAction } from "@/lib/modules/kanban/actions";
import type { BoardFilters } from "@/lib/modules/kanban/filters";
import type { BoardTimelineDto, BoardViewDto, SavedViewDto, TimelineBarDto, TimelineGroupBy } from "@/lib/modules/kanban/types";

const BKK_OFFSET_MS = 7 * 60 * 60 * 1000; // Asia/Bangkok = UTC+7 ตายตัว (ไม่มี DST) — คำนวณเองล้วน
const DAY_MS = 86_400_000;
const TH_MONTH = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
const DRAG_THRESHOLD_PX = 4;
const LABEL_COL_W = 176;
const BAR_H = 24;
const BAR_GAP = 5;
const ROW_PAD_Y = 7;
const DEFAULT_START_HOUR_MS = 9 * 3600_000; // ไม่เคยมีวันเริ่ม → ลากขอบซ้ายครั้งแรกเริ่มที่ 09:00 ไทย

const ZOOMS: { value: "week" | "month" | "quarter"; label: string; dayWidth: number }[] = [
  { value: "week", label: "สัปดาห์", dayWidth: 64 },
  { value: "month", label: "เดือน", dayWidth: 27 },
  { value: "quarter", label: "ไตรมาส", dayWidth: 13 },
];
/** จำนวนวันของแต่ละระดับซูม (สัญญา K2.3) — ต้องตรงกับ `TIMELINE_SPAN_DAYS` ฝั่ง `page.tsx` เป๊ะ */
const ZOOM_SPAN: Record<"week" | "month" | "quarter", number> = { week: 14, month: 42, quarter: 91 };
const GROUPS: { value: TimelineGroupBy; label: string }[] = [
  { value: "column", label: "คอลัมน์" },
  { value: "assignee", label: "คน" },
  { value: "label", label: "ป้าย" },
];

const pad2 = (n: number) => (n < 10 ? `0${n}` : String(n));

/** "YYYY-MM-DD" → เลขวันไทยนับจาก epoch (ตัวผกผันของ `keyOfIndex`) */
function dayIndexOfKey(key: string): number {
  const [y, m, d] = key.split("-").map(Number) as [number, number, number];
  return Date.UTC(y, m - 1, d) / DAY_MS;
}

function ymdOfIndex(dayIndex: number): { y: number; m: number; d: number } {
  const dt = new Date(dayIndex * DAY_MS);
  return { y: dt.getUTCFullYear(), m: dt.getUTCMonth(), d: dt.getUTCDate() };
}

function keyOfIndex(dayIndex: number): string {
  const { y, m, d } = ymdOfIndex(dayIndex);
  return `${y}-${pad2(m + 1)}-${pad2(d)}`;
}

/** ms ตั้งแต่เที่ยงคืนไทยของวันนั้นถึงเวลา `iso` (เก็บ "เวลาในวัน" ไว้ตอนลากขอบ/ลากแถบ) */
function timeOfDayMsOf(iso: string): number {
  const ms = Date.parse(iso) + BKK_OFFSET_MS;
  return ((ms % DAY_MS) + DAY_MS) % DAY_MS;
}

/** สร้าง ISO ของ "วันไทยที่ dayIndex" + เวลาในวัน `timeMs` */
function isoAtDayIndex(dayIndex: number, timeMs: number): string {
  return new Date(dayIndex * DAY_MS + timeMs - BKK_OFFSET_MS).toISOString();
}

// ── < 768px (breakpoint md) = มือถือ — `useSyncExternalStore` กัน hydration mismatch (แบบเดียวกับ K2.1/K2.2) ──
const MOBILE_QUERY = "(max-width: 767px)";
function subscribeMobileQuery(onChange: () => void): () => void {
  const mql = window.matchMedia(MOBILE_QUERY);
  mql.addEventListener("change", onChange);
  return () => mql.removeEventListener("change", onChange);
}
const getMobileSnapshot = () => window.matchMedia(MOBILE_QUERY).matches;
const getMobileServerSnapshot = () => false;
function useIsMobileTimeline(): boolean {
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

/** สภาพแก้ไข optimistic ต่อการ์ด (ทับค่าจากเซิร์ฟเวอร์ตอนแสดงผลเท่านั้น — ไม่แก้ `data.rows` ตรง ๆ เพราะ
 * การ์ดเดียวอาจโผล่หลายแถวเมื่อ group=assignee/label) */
type Override = { startDay: string; endDay: string; startAt: string | null; dueAt: string; isOverdue: boolean };

type DragKind = "shift" | "resize-start" | "resize-end";
type DragState = { kind: DragKind; cardId: string; startX: number; deltaDays: number };

export function TimelineView({
  board,
  data,
  filters,
  zoom,
  group,
  from,
  savedViews = [],
}: {
  board: BoardViewDto;
  data: BoardTimelineDto;
  filters: BoardFilters;
  zoom: "week" | "month" | "quarter";
  group?: TimelineGroupBy;
  /** "YYYY-MM-DD" (ไทย) — วันเริ่มของช่วงที่กำลังแสดง (จันทร์ของสัปดาห์นั้นเสมอ) */
  from: string;
  savedViews?: SavedViewDto[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const systemId = board.systemId;
  const isMobile = useIsMobileTimeline();
  const [, startTransition] = useTransition();
  const canEdit = board.role === "ADMIN" || board.role === "EDITOR";
  const nowMs = Date.parse(board.now);

  const [boardName, setBoardName] = useState(board.name);
  const [starred, setStarred] = useState(board.starred);
  const [overrides, setOverrides] = useState<Record<string, Override>>({});
  const [toast, setToast] = useState<string | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);

  const dragRef = useRef<DragState | null>(null);
  const pendingRef = useRef<{ kind: DragKind; cardId: string; startX: number } | null>(null);
  const draggedAtRef = useRef(0);

  const showToast = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast((t) => (t === message ? null : t)), 4200);
  };

  const setParam = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === "") next.delete(k);
      else next.set(k, v);
    }
    router.push(`${pathname}?${next.toString()}`, { scroll: false });
  };

  // คลิกแถบ (ไม่ได้ลาก) → `?card=` เปิดหลังการ์ดทับ (คงตัวกรอง/ซูม/จัดกลุ่ม/ช่วงวันเดิมไว้ในคิวรี)
  const openCard = (cardId: string) => {
    if (Date.now() - draggedAtRef.current < 250) return; // เพิ่งลากเสร็จ ไม่ใช่การคลิกเปิดการ์ด
    const next = new URLSearchParams(searchParams.toString());
    next.set("card", cardId);
    router.push(`${pathname}?${next.toString()}`);
  };

  const rangeFromIdx = dayIndexOfKey(from);
  const totalDays = ZOOM_SPAN[zoom];
  const rangeToIdx = rangeFromIdx + totalDays - 1;
  const dayWidth = ZOOMS.find((z) => z.value === zoom)!.dayWidth;
  const showDayNumber = dayWidth >= 20;
  const todayIdx = Math.floor((nowMs + BKK_OFFSET_MS) / DAY_MS);

  const shiftFrom = (deltaDays: number): string => keyOfIndex(rangeFromIdx + deltaDays);

  // ───────────────────────── ลาก (pointer events) ─────────────────────────

  const barOf = (bar: TimelineBarDto): TimelineBarDto => {
    const ov = overrides[bar.cardId];
    return ov ? { ...bar, ...ov } : bar;
  };

  const applyOptimistic = (cardId: string, startIdx: number, endIdx: number, startTimeMs: number | null, dueTimeMs: number) => {
    const startAt = startTimeMs === null ? null : isoAtDayIndex(startIdx, startTimeMs);
    const dueAt = isoAtDayIndex(endIdx, dueTimeMs);
    const ov: Override = {
      startDay: keyOfIndex(startIdx),
      endDay: keyOfIndex(endIdx),
      startAt,
      dueAt,
      isOverdue: Date.parse(dueAt) < nowMs,
    };
    setOverrides((prev) => ({ ...prev, [cardId]: ov }));
    return { startAt, dueAt };
  };

  const rollback = (cardId: string, message: string) => {
    setOverrides((prev) => {
      const next = { ...prev };
      delete next[cardId];
      return next;
    });
    showToast(message);
  };

  const finishShift = (bar: TimelineBarDto, deltaDays: number) => {
    if (deltaDays === 0) return;
    const cur = barOf(bar);
    const startIdx = dayIndexOfKey(cur.startDay) + deltaDays;
    const endIdx = dayIndexOfKey(cur.endDay) + deltaDays;
    const startTimeMs = cur.startAt ? timeOfDayMsOf(cur.startAt) : null;
    applyOptimistic(bar.cardId, startIdx, endIdx, startTimeMs, timeOfDayMsOf(cur.dueAt));
    startTransition(async () => {
      const res = await shiftCardRangeAction({ systemId, boardId: board.id, cardId: bar.cardId, days: deltaDays });
      if (!res.ok) rollback(bar.cardId, res.message);
    });
  };

  const finishResize = (bar: TimelineBarDto, side: "start" | "end", deltaDays: number) => {
    if (deltaDays === 0) return;
    const cur = barOf(bar);
    let startIdx = dayIndexOfKey(cur.startDay);
    let endIdx = dayIndexOfKey(cur.endDay);
    if (side === "start") startIdx = Math.min(startIdx + deltaDays, endIdx);
    else endIdx = Math.max(endIdx + deltaDays, startIdx);
    const startTimeMs = cur.startAt ? timeOfDayMsOf(cur.startAt) : DEFAULT_START_HOUR_MS;
    const { startAt, dueAt } = applyOptimistic(bar.cardId, startIdx, endIdx, startTimeMs, timeOfDayMsOf(cur.dueAt));
    startTransition(async () => {
      const res = await setCardRangeAction({ systemId, boardId: board.id, cardId: bar.cardId, startAt, dueAt });
      if (!res.ok) rollback(bar.cardId, res.message);
    });
  };

  const onBarPointerDown = (bar: TimelineBarDto) => (e: React.PointerEvent<HTMLElement>) => {
    if (!canEdit || e.button !== 0) return;
    const el = e.target as HTMLElement;
    if (el.closest("[data-testid=timeline-handle]")) return; // แฮนเดิลจัดการเอง (stopPropagation แล้ว)
    if (el.closest("a, button")) return;
    e.preventDefault();
    pendingRef.current = { kind: "shift", cardId: bar.cardId, startX: e.clientX };
    beginDragListeners(bar, "shift");
  };

  const onHandlePointerDown = (bar: TimelineBarDto, side: "start" | "end") => (e: React.PointerEvent<HTMLElement>) => {
    if (!canEdit || e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    pendingRef.current = { kind: side === "start" ? "resize-start" : "resize-end", cardId: bar.cardId, startX: e.clientX };
    beginDragListeners(bar, side === "start" ? "resize-start" : "resize-end");
  };

  function beginDragListeners(bar: TimelineBarDto, kind: DragKind) {
    const onMove = (ev: PointerEvent) => {
      const pending = pendingRef.current;
      const active = dragRef.current;
      if (active) {
        ev.preventDefault();
        const deltaDays = Math.round((ev.clientX - active.startX) / dayWidth);
        const next = { ...active, deltaDays };
        dragRef.current = next;
        setDrag(next);
        return;
      }
      if (!pending) return;
      if (Math.abs(ev.clientX - pending.startX) > DRAG_THRESHOLD_PX) {
        const next: DragState = { kind: pending.kind, cardId: pending.cardId, startX: pending.startX, deltaDays: 0 };
        dragRef.current = next;
        setDrag(next);
      }
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      pendingRef.current = null;
      const active = dragRef.current;
      dragRef.current = null;
      setDrag(null);
      if (!active || active.deltaDays === 0) return; // ไม่ได้ลาก = ปล่อยให้ onClick เปิดการ์ดตามปกติ
      draggedAtRef.current = Date.now();
      if (kind === "shift") finishShift(bar, active.deltaDays);
      else finishResize(bar, kind === "resize-start" ? "start" : "end", active.deltaDays);
    };
    window.addEventListener("pointermove", onMove, { passive: false });
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  }

  // ───────────────────────── หัวตาราง: แถบเดือนไทย + วันที่ ─────────────────────────

  const dayIndices = useMemo(() => Array.from({ length: totalDays }, (_, i) => rangeFromIdx + i), [rangeFromIdx, totalDays]);
  const monthBands = useMemo(() => {
    const bands: { label: string; days: number }[] = [];
    for (const idx of dayIndices) {
      const { y, m } = ymdOfIndex(idx);
      const label = `${TH_MONTH[m]} ${y + 543}`;
      const last = bands[bands.length - 1];
      if (last && last.label === label) last.days += 1;
      else bands.push({ label, days: 1 });
    }
    return bands;
  }, [dayIndices]);

  const totalCardCount = board.columns.reduce((n, c) => n + c.cards.length, 0);
  const visibleCount = new Set(data.rows.flatMap((r) => r.bars.map((b) => b.cardId))).size;

  const header = (
    <>
      <BoardHeader
        board={{ ...board, name: boardName }}
        starred={starred}
        filters={filters}
        savedViews={savedViews}
        onToggleStar={() => {
          const next = !starred;
          setStarred(next);
          starBoardAction({ systemId, boardId: board.id, starred: next }).catch(() => {
            setStarred(!next);
            showToast("บันทึกดาวไม่สำเร็จ ลองใหม่อีกครั้ง");
          });
        }}
        onRename={(name) => {
          const before = boardName;
          setBoardName(name);
          renameBoardAction({ systemId, boardId: board.id, name }).catch(() => {
            setBoardName(before);
            showToast("เปลี่ยนชื่อบอร์ดไม่สำเร็จ ลองใหม่อีกครั้ง");
          });
        }}
      />
      <FilterBar filters={filters} totalCount={totalCardCount} visibleCount={visibleCount} members={board.members} columns={board.columns} />
      {!isMobile && (
        <div className="flex flex-none flex-wrap items-center" style={{ gap: 8, padding: "9px 20px", borderBottom: "1px solid var(--color-line)" }}>
          <div data-testid="timeline-zoom" className="flex" style={{ gap: 2, border: "1px solid var(--color-line)", borderRadius: 8, padding: 2 }}>
            {ZOOMS.map((z) => (
              <button
                key={z.value}
                type="button"
                aria-pressed={zoom === z.value}
                onClick={() => setParam({ zoom: z.value === "month" ? null : z.value })}
                style={{
                  height: 26,
                  padding: "0 10px",
                  borderRadius: 6,
                  fontSize: 12.5,
                  fontWeight: zoom === z.value ? 700 : 400,
                  background: zoom === z.value ? "var(--color-ink)" : "transparent",
                  color: zoom === z.value ? "var(--color-surface)" : "var(--color-muted)",
                }}
              >
                {z.label}
              </button>
            ))}
          </div>

          <label className="flex items-center gap-1.5" style={{ fontSize: 12.5, color: "var(--color-muted)" }}>
            จัดกลุ่ม:
            <select
              data-testid="timeline-group"
              value={group ?? "column"}
              onChange={(e) => setParam({ group: e.target.value === "column" ? null : e.target.value })}
              style={{ ...ghostBtn, appearance: "auto" }}
            >
              {GROUPS.map((g) => (
                <option key={g.value} value={g.value}>
                  {g.label}
                </option>
              ))}
            </select>
          </label>

          <span className="flex items-center" style={{ gap: 6 }}>
            <button type="button" aria-label="ช่วงก่อนหน้า" onClick={() => setParam({ from: shiftFrom(-totalDays) })} style={{ color: "var(--color-muted)" }}>
              <KanbanIcon name="back" size="sm" />
            </button>
            <span style={{ fontSize: 13, color: "var(--color-muted)" }}>
              {monthBands.map((b) => b.label).join(" – ")}
            </span>
            <button type="button" aria-label="ช่วงถัดไป" onClick={() => setParam({ from: shiftFrom(totalDays) })} style={{ color: "var(--color-muted)" }}>
              <KanbanIcon name="ar" size="sm" />
            </button>
          </span>
          <button type="button" data-testid="timeline-today-btn" onClick={() => setParam({ from: null })} style={ghostBtn}>
            วันนี้
          </button>
        </div>
      )}
    </>
  );

  // ───────────────────────── มือถือ: ข้อความชวนไปมุมมองตาราง ─────────────────────────

  if (isMobile) {
    // ลิงก์ชวนไปมุมมองตาราง — คงตัวกรองเดิมไว้ แต่ทิ้งพารามิเตอร์เฉพาะของไทม์ไลน์ (`?view=table` เสมอ)
    const tableHref = (() => {
      const next = new URLSearchParams(searchParams.toString());
      next.set("view", "table");
      next.delete("zoom");
      next.delete("group");
      next.delete("from");
      return `${pathname}?${next.toString()}`;
    })();
    return (
      <div data-testid="timeline-view" className="flex flex-col" style={{ height: "calc(100dvh - 3.5rem)", background: "var(--color-stage)" }}>
        {header}
        <div data-testid="timeline-mobile-hint" className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
          <span style={{ color: "var(--color-muted)" }}>
            <KanbanIcon name="chart" size="lg" />
          </span>
          <p style={{ fontSize: 13.5, color: "var(--color-ink-soft)" }}>ไทม์ไลน์ใช้บนจอกว้าง — บนมือถือลองมุมมองตารางแทน</p>
          <a href={tableHref} className="btn btn-primary text-sm">
            ไปมุมมองตาราง
          </a>
        </div>
      </div>
    );
  }

  // ───────────────────────── เดสก์ท็อป ─────────────────────────

  const chartW = totalDays * dayWidth;
  const rowHeights = data.rows.map((r) => rowHeightOf(r.bars.length ? packLanes(r.bars.map(barOf)).length : 1));
  const headerH = 46;
  const totalH = headerH + rowHeights.reduce((a, b) => a + b, 0);
  const todayVisible = todayIdx >= rangeFromIdx && todayIdx <= rangeToIdx;

  return (
    <div data-testid="timeline-view" className="flex flex-col" style={{ height: "calc(100dvh - 3.5rem)", background: "var(--color-stage)" }}>
      {header}
      <div className="flex-1 overflow-auto">
        <div style={{ width: LABEL_COL_W + chartW, minWidth: "100%", position: "relative" }}>
          {todayVisible && (
            <div
              data-testid="timeline-today"
              title="วันนี้"
              style={{
                position: "absolute",
                left: LABEL_COL_W + (todayIdx - rangeFromIdx) * dayWidth + dayWidth / 2,
                top: 0,
                height: totalH,
                width: 2,
                background: "var(--color-tag-red)",
                zIndex: 15,
                pointerEvents: "none",
              }}
            />
          )}

          {/* หัวตาราง: แถบเดือนไทย + เลขวัน */}
          <div className="flex" style={{ position: "sticky", top: 0, zIndex: 20, background: "var(--color-surface)", borderBottom: "1px solid var(--color-line)" }}>
            <div style={{ flex: `0 0 ${LABEL_COL_W}px`, position: "sticky", left: 0, zIndex: 21, background: "var(--color-surface)" }} />
            <div style={{ flex: `0 0 ${chartW}px` }}>
              <div className="flex" style={{ height: 20 }}>
                {monthBands.map((b, i) => (
                  <span key={i} style={{ width: b.days * dayWidth, fontSize: 11, fontWeight: 700, color: "var(--color-ink-soft)", padding: "2px 4px", borderLeft: "1px solid var(--color-line)" }}>
                    {b.label}
                  </span>
                ))}
              </div>
              <div className="flex" style={{ height: 26 }}>
                {dayIndices.map((idx) => {
                  const { d } = ymdOfIndex(idx);
                  return (
                    <span
                      key={idx}
                      style={{
                        width: dayWidth,
                        fontSize: 10.5,
                        textAlign: "center",
                        color: idx === todayIdx ? "var(--color-accent)" : "var(--color-muted)",
                        fontWeight: idx === todayIdx ? 700 : 400,
                        borderLeft: "1px solid var(--color-line)",
                      }}
                    >
                      {showDayNumber ? d : ""}
                    </span>
                  );
                })}
              </div>
            </div>
          </div>

          {/* แถวกลุ่ม */}
          {data.rows.map((row, ri) => {
            const bars = row.bars.map(barOf);
            const lanes = packLanes(bars);
            const rowH = rowHeights[ri]!;
            return (
              <div key={row.key} className="flex" style={{ borderBottom: "1px solid var(--color-line)" }}>
                <div
                  style={{
                    flex: `0 0 ${LABEL_COL_W}px`,
                    position: "sticky",
                    left: 0,
                    zIndex: 10,
                    background: "var(--color-surface)",
                    padding: `${ROW_PAD_Y}px 10px`,
                    borderRight: "1px solid var(--color-line)",
                  }}
                >
                  <p className="truncate" style={{ fontSize: 12.5, fontWeight: 600 }}>
                    {row.label} <span style={{ color: "var(--color-muted)", fontWeight: 400 }}>({row.bars.length})</span>
                  </p>
                </div>
                <div style={{ flex: `0 0 ${chartW}px`, position: "relative", height: rowH }}>
                  {lanes.map((lane, li) =>
                    lane.map((bar) => (
                      <TimelineBar
                        key={bar.cardId}
                        bar={bar}
                        laneIndex={li}
                        rangeFromIdx={rangeFromIdx}
                        rangeToIdx={rangeToIdx}
                        dayWidth={dayWidth}
                        drag={drag}
                        canEdit={canEdit}
                        onPointerDown={onBarPointerDown(bar)}
                        onHandlePointerDown={onHandlePointerDown}
                        onClick={() => openCard(bar.cardId)}
                      />
                    )),
                  )}
                </div>
              </div>
            );
          })}

          {data.unscheduled > 0 && (
            <div className="flex items-center" style={{ padding: "10px 14px", gap: 8, fontSize: 12.5, color: "var(--color-muted)" }}>
              <KanbanIcon name="cal" size="sm" />
              ยังไม่กำหนดวัน ({data.unscheduled}) — ตั้งกำหนดส่งจาก{" "}
              <a href={`${pathname}?view=calendar`} style={{ color: "var(--color-accent)", fontWeight: 600 }}>
                มุมมองปฏิทิน
              </a>
            </div>
          )}
        </div>
      </div>

      {toast && (
        <div className="pointer-events-none fixed inset-x-0 bottom-6 z-[70] flex justify-center px-4">
          <div
            role="status"
            data-testid="timeline-toast"
            className="pointer-events-auto flex items-center gap-2 rounded-full px-4 py-3"
            style={{ background: "var(--color-ink)", color: "var(--color-surface)", fontSize: 13, boxShadow: "0 8px 24px rgba(10,10,10,.24)" }}
          >
            <KanbanIcon name="warn" size="sm" />
            {toast}
          </div>
        </div>
      )}
    </div>
  );
}

function rowHeightOf(laneCount: number): number {
  const n = Math.max(1, laneCount);
  return ROW_PAD_Y * 2 + n * BAR_H + (n - 1) * BAR_GAP;
}

/** จัดแถบที่ช่วงวันทับกันให้อยู่คนละ "เลน" แนวตั้งภายในแถวเดียวกัน (แบบเดียวกับ Gantt ทั่วไป) — bars เข้ามา
 * เรียง startDay จากเซิร์ฟเวอร์อยู่แล้ว (สัญญา K2.3: "แถบในแถวเรียง startDay") */
function packLanes(bars: readonly TimelineBarDto[]): TimelineBarDto[][] {
  const lanes: { endIdx: number; bars: TimelineBarDto[] }[] = [];
  for (const bar of bars) {
    const startIdx = dayIndexOfKey(bar.startDay);
    const endIdx = dayIndexOfKey(bar.endDay);
    const lane = lanes.find((l) => l.endIdx < startIdx);
    if (lane) {
      lane.bars.push(bar);
      lane.endIdx = endIdx;
    } else {
      lanes.push({ endIdx, bars: [bar] });
    }
  }
  return lanes.map((l) => l.bars);
}

// ───────────────────────── แถบงาน 1 ใบ ─────────────────────────

function TimelineBar({
  bar,
  laneIndex,
  rangeFromIdx,
  rangeToIdx,
  dayWidth,
  drag,
  canEdit,
  onPointerDown,
  onHandlePointerDown,
  onClick,
}: {
  bar: TimelineBarDto;
  laneIndex: number;
  rangeFromIdx: number;
  rangeToIdx: number;
  dayWidth: number;
  drag: DragState | null;
  canEdit: boolean;
  onPointerDown: (e: React.PointerEvent<HTMLElement>) => void;
  onHandlePointerDown: (bar: TimelineBarDto, side: "start" | "end") => (e: React.PointerEvent<HTMLElement>) => void;
  onClick: () => void;
}) {
  let startIdx = dayIndexOfKey(bar.startDay);
  let endIdx = dayIndexOfKey(bar.endDay);
  const active = drag && drag.cardId === bar.cardId ? drag : null;
  if (active) {
    if (active.kind === "shift") {
      startIdx += active.deltaDays;
      endIdx += active.deltaDays;
    } else if (active.kind === "resize-start") {
      startIdx = Math.min(startIdx + active.deltaDays, endIdx);
    } else {
      endIdx = Math.max(endIdx + active.deltaDays, startIdx);
    }
  }
  // ตัดแสดงจาก `from`/`to` ของช่วงที่กำลังดู — ค่า `startDay`/`endDay` จริงของการ์ดไม่เปลี่ยน (สัญญา K2.3)
  const clippedStart = Math.max(startIdx, rangeFromIdx);
  const clippedEnd = Math.min(endIdx, rangeToIdx);
  if (clippedEnd < clippedStart) return null;
  const left = (clippedStart - rangeFromIdx) * dayWidth;
  const width = Math.max(dayWidth - 4, (clippedEnd - clippedStart + 1) * dayWidth - 4);
  const top = ROW_PAD_Y + laneIndex * (BAR_H + BAR_GAP);
  const color = bar.color ? tagColorVar(bar.color) : "var(--color-ink)";

  return (
    <div
      data-testid="timeline-bar"
      data-card-id={bar.cardId}
      role="button"
      tabIndex={0}
      onPointerDown={onPointerDown}
      onClick={onClick}
      className="absolute flex items-center truncate rounded"
      style={{
        left,
        top,
        width,
        height: BAR_H,
        gap: 5,
        padding: "0 8px",
        fontSize: 11,
        fontWeight: 600,
        color: "#fff",
        background: color,
        opacity: bar.isDone ? 0.45 : 1,
        border: bar.isOverdue ? "2px solid var(--color-tag-red)" : "1px solid transparent",
        cursor: canEdit ? "grab" : "pointer",
        userSelect: "none",
        WebkitUserSelect: "none",
      }}
    >
      {canEdit && (
        <span
          data-testid="timeline-handle"
          data-side="start"
          onPointerDown={onHandlePointerDown(bar, "start")}
          className="absolute inset-y-0 left-0"
          style={{ width: 6, cursor: "ew-resize" }}
        />
      )}
      <span className="truncate">{bar.title}</span>
      {canEdit && (
        <span
          data-testid="timeline-handle"
          data-side="end"
          onPointerDown={onHandlePointerDown(bar, "end")}
          className="absolute inset-y-0 right-0"
          style={{ width: 6, cursor: "ew-resize" }}
        />
      )}
    </div>
  );
}

export default TimelineView;
