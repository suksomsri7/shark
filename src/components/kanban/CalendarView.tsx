// CalendarView.tsx — มุมมองปฏิทิน `?view=calendar` (K2.2 · แบบ `ledger/design-kanban/05-calendar.png` · §3.5)
//
// หน้าที่: เห็นภาระงานตามวัน (เวลาไทย) + ถาด "ยังไม่กำหนดวัน" · ลากการ์ด (จากถาดหรือระหว่างวัน) →
// `setCardDueFromCalendarAction` (optimistic + rollback) · ผสมงานอ่านอย่างเดียวจากปฏิทินกลางของร้าน
// (ใบลา/นัดหมาย/เข้าพัก) เมื่อสวิตช์ "แสดงงานจากระบบอื่นด้วย" เปิดอยู่ — งานพวกนี้คลิกแล้ว dropOnDay ไม่ได้
// (อ่านอย่างเดียว ไปหน้าต้นทางเท่านั้น)
//
// ⚠️ ทำไม pointer events ไม่ใช่ HTML5 drag-and-drop: เหตุผลเดียวกับ `BoardView.tsx` (K1.5) — มือถือไม่ยิง
//    dragstart เลย (ที่นี่มือถือปิดลากไปเลยตามสัญญา K2.2 แต่ desktop ยังใช้ pointer events แบบเดียวกันทั้งโมดูล)
// ⚠️ ห้ามใช้อีโมจิ — ไอคอนทุกตัวมาจาก <KanbanIcon> · ห้ามใช้ตัวแปลงวันที่ของเบราว์เซอร์/Intl ตัวไหนทั้งนั้น (บทเรียน K1.5: hydration)
"use client";

import { useEffect, useRef, useState, useSyncExternalStore, useTransition } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { BoardHeader } from "./BoardHeader";
import { FilterBar } from "./FilterBar";
import { KanbanIcon } from "./KanbanIcon";
import { renameBoardAction, setCardDueFromCalendarAction, starBoardAction } from "@/lib/modules/kanban/actions";
import type { BoardFilters } from "@/lib/modules/kanban/filters";
import type { BoardCalendarDto, BoardViewDto, CalCardDto, CalDayDto, CalExternalDto, SavedViewDto } from "@/lib/modules/kanban/types";

const BKK_OFFSET_MS = 7 * 60 * 60 * 1000; // Asia/Bangkok = UTC+7 ตายตัว (ไม่มี DST) — คำนวณเองล้วน
const DAY_MS = 86_400_000;
const TH_MONTH = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
const TH_WDAY_MON_FIRST = ["จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส.", "อา."];
const DRAG_THRESHOLD_PX = 4;

const pad2 = (n: number) => (n < 10 ? `0${n}` : String(n));

/** "YYYY-MM-DD" → ISO 8601 ที่เวลา `hour`:00 ของ "วันที่ไทย" นั้น (แบบเดียวกับ `fromBkk` ของ `ThaiDatePicker.tsx`) */
function dateAt(dateKey: string, hour: number): string {
  const [y, m, d] = dateKey.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d, hour, 0) - BKK_OFFSET_MS).toISOString();
}

/** เลขวันไทยนับจาก epoch ของปี/เดือน(0-11)/วัน — สอดคล้องกับ `dayIndexOf` ฝั่ง server (`filters.ts`) เมื่อคิดจากขอบวัน */
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

// ── < 640px = มือถือ — `useSyncExternalStore` กัน hydration mismatch (แบบเดียวกับ K2.1 `TableView.tsx`) ──
const MOBILE_QUERY = "(max-width: 639px)";
function subscribeMobileQuery(onChange: () => void): () => void {
  const mql = window.matchMedia(MOBILE_QUERY);
  mql.addEventListener("change", onChange);
  return () => mql.removeEventListener("change", onChange);
}
const getMobileSnapshot = () => window.matchMedia(MOBILE_QUERY).matches;
const getMobileServerSnapshot = () => false;
function useIsMobileCalendar(): boolean {
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

type DragState = { card: CalCardDto; source: string | null; x: number; y: number; hover: string | null };

export function CalendarView({
  board,
  data,
  filters,
  month,
  mode,
  ext,
  savedViews = [],
}: {
  board: BoardViewDto;
  data: BoardCalendarDto;
  filters: BoardFilters;
  /** K2.5 — มุมมองที่บันทึกไว้ของบอร์ดนี้ (ทั้งทีม + ของตัวเอง) ส่งลง `BoardHeader` */
  savedViews?: SavedViewDto[];
  /** "YYYY-MM" (ตามเวลาไทย) — เดือนที่กำลังดู */
  month: string;
  mode: "week" | "month";
  ext: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const systemId = board.systemId;
  const nowMs = Date.parse(board.now);
  const isMobile = useIsMobileCalendar();
  const [, startTransition] = useTransition();
  const canEdit = board.role === "ADMIN" || board.role === "EDITOR";

  const [boardName, setBoardName] = useState(board.name);
  const [starred, setStarred] = useState(board.starred);
  const [days, setDays] = useState<Record<string, CalDayDto>>(data.days);
  const [unscheduled, setUnscheduled] = useState<CalCardDto[]>(data.unscheduled);
  const [toast, setToast] = useState<string | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);

  useEffect(() => {
    setDays(data.days);
    setUnscheduled(data.unscheduled);
  }, [data]);

  const dayRefs = useRef<Map<string, HTMLElement>>(new Map());
  const dragRef = useRef<DragState | null>(null);
  const pendingRef = useRef<{ card: CalCardDto; source: string | null; startX: number; startY: number } | null>(null);
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

  const openCard = (cardId: string) => {
    if (Date.now() - draggedAtRef.current < 250) return; // เพิ่งลากเสร็จ ไม่ใช่การคลิกเปิดการ์ด
    // คงตัวกรอง/เดือน/โหมดเดิมไว้ในคิวรี แค่เติม card= เข้าไป (หลังการ์ดเปิดทับ ไม่ล้าง state ปฏิทิน)
    const next = new URLSearchParams(searchParams.toString());
    next.set("card", cardId);
    router.push(`${pathname}?${next.toString()}`);
  };

  // ───────────────────────── ลาก-วาง (pointer events) ─────────────────────────

  const hoverAt = (x: number, y: number): string | null => {
    for (const [key, el] of dayRefs.current) {
      const r = el.getBoundingClientRect();
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return key;
    }
    return null;
  };

  /**
   * ย้ายการ์ดไปวันใหม่ (dropOnDay) — optimistic แล้วยิง `setCardDueFromCalendarAction` จริง
   * 🔴 ไม่เรียก `router.refresh()` ตอนสำเร็จ (แพตเทิร์นเดียวกับ `editDue`/`editColumn` ของ `TableView.tsx`
   *    K2.1 — แก้ฟิลด์เดียวของการ์ดใบเดียวจบที่ optimistic state พอ ไม่ต้องขอ RSC ใหม่ทั้งหน้า) เรียก
   *    เฉพาะตอนล้มเหลว (rollback) เท่านั้น — บั๊กภาพ "การ์ดที่ลากไปหายจากช่องปลายทาง" ที่เจอระหว่างพัฒนาจริง ๆ
   *    แล้วไม่ใช่เรื่อง refresh (สืบจนเจอว่าเป็น CSS: `flex-1 overflow-hidden` บนช่องวัน ดู §5 ใน wo-notes)
   */
  const dropOnDay = (card: CalCardDto, source: string | null, targetKey: string) => {
    const snapshotDays = days;
    const snapshotUnscheduled = unscheduled;
    const keepTime = source !== null;
    const isoTray = dateAt(targetKey, 18); // จากถาด: 18:00 ไทยของวันนั้น (สัญญา K2.2)

    if (source === null) setUnscheduled((prev) => prev.filter((c) => c.id !== card.id));
    else setDays((prev) => ({ ...prev, [source]: { ...prev[source]!, cards: prev[source]!.cards.filter((c) => c.id !== card.id) } }));
    setDays((prev) => ({
      ...prev,
      [targetKey]: {
        cards: [...(prev[targetKey]?.cards ?? []), { ...card, dueAt: isoTray, isOverdue: false }],
        external: prev[targetKey]?.external ?? [],
      },
    }));

    startTransition(async () => {
      const res = await setCardDueFromCalendarAction({
        systemId,
        boardId: board.id,
        cardId: card.id,
        date: keepTime ? dateAt(targetKey, 12) : isoTray,
        keepTime,
      });
      if (!res.ok) {
        setDays(snapshotDays);
        setUnscheduled(snapshotUnscheduled);
        showToast(res.message);
      }
    });
  };

  const onCardPointerDown = (card: CalCardDto, source: string | null) => (e: React.PointerEvent<HTMLElement>) => {
    if (!canEdit || e.button !== 0) return;
    const el = e.target as HTMLElement;
    if (el.closest("a, button")) return;
    // 🔴 กัน Chromium ตีความ mousedown+ลากบนตัวหนังสือเป็น "เลือกข้อความ" แทนที่จะเป็นการลากการ์ด
    //    (เจอจริงตอนถ่ายภาพ QC: ลากทับหัวข้อการ์ดโดยตรง → ทั้งแถบกลายเป็นแถบฟ้าเลือกข้อความ ไม่ใช่ลาก)
    e.preventDefault();
    pendingRef.current = { card, source, startX: e.clientX, startY: e.clientY };

    const onMove = (ev: PointerEvent) => {
      const pending = pendingRef.current;
      const active = dragRef.current;
      if (active) {
        ev.preventDefault();
        const next = { ...active, x: ev.clientX, y: ev.clientY, hover: hoverAt(ev.clientX, ev.clientY) };
        dragRef.current = next;
        setDrag(next);
        return;
      }
      if (!pending) return;
      if (Math.hypot(ev.clientX - pending.startX, ev.clientY - pending.startY) > DRAG_THRESHOLD_PX) {
        const next: DragState = { card: pending.card, source: pending.source, x: ev.clientX, y: ev.clientY, hover: pending.source };
        dragRef.current = next;
        setDrag(next);
      }
    };
    const onUp = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      pendingRef.current = null;
      const active = dragRef.current;
      dragRef.current = null;
      setDrag(null);
      if (!active) return; // ไม่ได้ลาก = ปล่อยให้ onClick เปิดการ์ดตามปกติ
      draggedAtRef.current = Date.now();
      const hover = hoverAt(ev.clientX, ev.clientY);
      if (hover && hover !== active.source) dropOnDay(active.card, active.source, hover);
    };
    window.addEventListener("pointermove", onMove, { passive: false });
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  };

  // ───────────────────────── กริดวัน (เดือน/สัปดาห์) ─────────────────────────

  const [yy, mm] = month.split("-").map(Number) as [number, number];
  const mIdx = mm - 1;
  const todayIndex = Math.floor((nowMs + BKK_OFFSET_MS) / DAY_MS);
  const firstOfMonthIdx = indexOfYmd(yy, mIdx, 1);
  const daysInMonth = new Date(Date.UTC(yy, mIdx + 1, 0)).getUTCDate();
  const lastOfMonthIdx = firstOfMonthIdx + daysInMonth - 1;
  const firstWeekday = ymdOfIndex(firstOfMonthIdx).weekday; // 0=อา..6=ส
  const gridStart = firstOfMonthIdx - ((firstWeekday + 6) % 7);
  const lastWeekday = ymdOfIndex(lastOfMonthIdx).weekday;
  const gridEnd = lastOfMonthIdx + ((7 - lastWeekday) % 7);
  const monthCells: number[] = [];
  for (let i = gridStart; i <= gridEnd; i++) monthCells.push(i);

  // สัปดาห์ที่แสดง (โหมดสัปดาห์ของเดสก์ท็อป + รายการวันต่อวันของมือถือ): สัปดาห์ของ "วันนี้" ถ้าอยู่ในเดือนที่
  // กำลังดู ไม่งั้นสัปดาห์แรกของเดือนนั้น (URL มีแค่ `month` — ไม่มีพารามิเตอร์สัปดาห์แยก ดู wo-notes §4)
  const weekAnchorIdx = todayIndex >= firstOfMonthIdx && todayIndex <= lastOfMonthIdx ? todayIndex : firstOfMonthIdx;
  const weekAnchorWeekday = ymdOfIndex(weekAnchorIdx).weekday;
  const weekStartIdx = weekAnchorIdx - ((weekAnchorWeekday + 6) % 7);
  const weekCells = Array.from({ length: 7 }, (_, i) => weekStartIdx + i);

  const shiftMonth = (delta: number): string => {
    const total = yy * 12 + mIdx + delta;
    const ny = Math.floor(total / 12);
    const nm = ((total % 12) + 12) % 12;
    return `${ny}-${pad2(nm + 1)}`;
  };

  const totalCardCount = board.columns.reduce((n, c) => n + c.cards.length, 0);
  const visibleCount = Object.values(days).reduce((n, d) => n + d.cards.length, 0) + unscheduled.length;

  const cells = mode === "month" ? monthCells : weekCells;

  const registerDayRef = (key: string) => (el: HTMLElement | null) => {
    if (el) dayRefs.current.set(key, el);
    else dayRefs.current.delete(key);
  };

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
      {/* ── แถบปฏิทิน: สัปดาห์/เดือน · ‹ เดือน ปีพ.ศ. › · วันนี้ ── */}
      <div className="flex flex-none flex-wrap items-center" style={{ gap: 8, padding: "9px 20px", borderBottom: "1px solid var(--color-line)" }}>
        <div className="flex" style={{ gap: 2, border: "1px solid var(--color-line)", borderRadius: 8, padding: 2 }}>
          <button
            type="button"
            data-testid="calendar-mode-week"
            aria-pressed={mode === "week"}
            onClick={() => setParam({ mode: "week" })}
            style={{ height: 26, padding: "0 10px", borderRadius: 6, fontSize: 12.5, fontWeight: mode === "week" ? 700 : 400, background: mode === "week" ? "var(--color-ink)" : "transparent", color: mode === "week" ? "var(--color-surface)" : "var(--color-muted)" }}
          >
            สัปดาห์
          </button>
          <button
            type="button"
            data-testid="calendar-mode-month"
            aria-pressed={mode === "month"}
            onClick={() => setParam({ mode: null })}
            style={{ height: 26, padding: "0 10px", borderRadius: 6, fontSize: 12.5, fontWeight: mode === "month" ? 700 : 400, background: mode === "month" ? "var(--color-ink)" : "transparent", color: mode === "month" ? "var(--color-surface)" : "var(--color-muted)" }}
          >
            เดือน
          </button>
        </div>
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

  // ───────────────────────── มือถือ: รายการวันต่อวัน ไม่มีลาก ─────────────────────────

  if (isMobile) {
    return (
      <div data-testid="calendar-view" className="flex flex-col" style={{ height: "calc(100dvh - 3.5rem)", background: "var(--color-stage)" }}>
        {header}
        <div className="flex flex-1 flex-col overflow-y-auto">
          <UnscheduledTray unscheduled={unscheduled} onOpenCard={openCard} ext={ext} setParam={setParam} mobile />
          {weekCells.map((idx) => {
            const key = keyOfIndex(idx);
            const { d, weekday } = ymdOfIndex(idx);
            const cell = days[key] ?? { cards: [], external: [] };
            return (
              <div key={key} className="border-b" style={{ padding: "8px 14px", borderColor: "var(--color-line)" }}>
                <p style={{ fontSize: 11.5, fontWeight: 700, color: idx === todayIndex ? "var(--color-accent)" : "var(--color-muted)" }}>
                  {TH_WDAY_MON_FIRST[(weekday + 6) % 7]} {d}
                </p>
                <div className="mt-1 flex flex-col gap-1">
                  {cell.cards.length === 0 && cell.external.length === 0 && <span style={{ fontSize: 11.5, color: "var(--color-muted)" }}>—</span>}
                  {cell.cards.map((c) => (
                    <DayCardChip key={c.id} card={c} onClick={() => openCard(c.id)} />
                  ))}
                  {cell.external.map((e) => (
                    <ExternalChip key={e.id} ev={e} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // ───────────────────────── เดสก์ท็อป ─────────────────────────

  return (
    <div data-testid="calendar-view" className="flex flex-col" style={{ height: "calc(100dvh - 3.5rem)", background: "var(--color-stage)" }}>
      {header}
      <div className="flex flex-1 overflow-hidden">
        <UnscheduledTray unscheduled={unscheduled} onOpenCard={openCard} onPointerDownCard={onCardPointerDown} canEdit={canEdit} ext={ext} setParam={setParam} />

        <div className="flex flex-1 flex-col overflow-auto">
          <div className="grid flex-none" style={{ gridTemplateColumns: "repeat(7, minmax(0, 1fr))", borderBottom: "1px solid var(--color-line)" }}>
            {TH_WDAY_MON_FIRST.map((w) => (
              <span key={w} style={{ padding: "6px 8px", fontSize: 11.5, color: "var(--color-muted)", textAlign: "center" }}>
                {w}
              </span>
            ))}
          </div>
          <div className="grid flex-1" style={{ gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gridAutoRows: mode === "month" ? undefined : "1fr" }}>
            {cells.map((idx) => {
              const key = keyOfIndex(idx);
              const { d } = ymdOfIndex(idx);
              const cell = days[key] ?? { cards: [], external: [] };
              const inCurrentMonth = mode === "week" || (idx >= firstOfMonthIdx && idx <= lastOfMonthIdx);
              return (
                <div
                  // 🔴 คีย์ผูกกับจำนวนการ์ด+งานภายนอก ไม่ใช่แค่วันที่ — เจอจริงว่า CSS Grid แถวสูงแบบ "auto"
                  //    ไม่คิดความสูงใหม่ตอน React แพตช์ลูกในโหนดเดิม (เพิ่มการ์ดใบที่ 2 เข้าไปในช่องที่มี
                  //    1 ใบอยู่แล้ว → ใบใหม่มีอยู่จริงใน DOM แต่ไม่ถูกวาด จนกว่าจะโหลดหน้าใหม่) บังคับ
                  //    React ถอด+สร้างโหนดใหม่ทั้งช่องเมื่อจำนวนเปลี่ยน ทำให้ Chromium คำนวณ layout ใหม่แน่นอน
                  key={`${key}:${cell.cards.length}:${cell.external.length}`}
                  ref={registerDayRef(key)}
                  data-testid="calendar-day"
                  data-date={key}
                  className="flex flex-col border-b border-r"
                  style={{
                    minHeight: mode === "month" ? 96 : 220,
                    padding: 6,
                    gap: 3,
                    borderColor: "var(--color-line)",
                    opacity: inCurrentMonth ? 1 : 0.4,
                    background: drag?.hover === key ? "var(--color-out)" : "var(--color-surface)",
                  }}
                >
                  <span
                    data-testid={idx === todayIndex ? "calendar-today" : undefined}
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
                  {/* 🔴 ห้ามใส่ `flex-1`/`overflow-hidden` ที่นี่ — คู่กับแถวกริดที่สูงแบบ "auto" (ไม่ได้ตั้งสูงตายตัว)
                      ทำให้ browser คำนวณความสูงจริงของช่องวันผิด (สูงเท่าตอนมีการ์ดใบเดียวค้างไว้แม้เพิ่มการ์ด
                      ใบที่ 2 เข้ามาแล้ว — ใบใหม่ถูก overflow ซ่อนไปเงียบ ๆ ทั้งที่ DOM มีอยู่จริง เจอจริงตอนถ่าย
                      ภาพ QC ลากการ์ดลงวันที่มีการ์ดอยู่แล้ว) ปล่อยให้สูงตามเนื้อหาไปเลย เหมือนมะ็อกอัพ 05
                      (แถวที่มีการ์ดเยอะกว่าก็สูงกว่าแถวข้างเคียงได้ ไม่ต้องเท่ากันทุกแถว) */}
                  <div className="flex flex-col" style={{ gap: 2 }}>
                    {cell.cards.map((c) => (
                      <DayCardChip
                        key={c.id}
                        card={c}
                        onPointerDown={canEdit ? onCardPointerDown(c, key) : undefined}
                        onClick={() => openCard(c.id)}
                        dimmed={drag?.card.id === c.id}
                      />
                    ))}
                    {cell.external.map((e) => (
                      <ExternalChip key={e.id} ev={e} />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── ใบลอยตามเมาส์ระหว่างลาก ── */}
      {drag && (
        <div
          className="pointer-events-none fixed z-[80] flex items-center rounded-lg border font-medium shadow-lg"
          style={{ left: drag.x + 12, top: drag.y + 12, gap: 5, padding: "4px 8px", fontSize: 12, background: "var(--color-surface)", borderColor: "var(--color-accent)", color: "var(--color-ink)" }}
        >
          <KanbanIcon name="drag" size="xs" />
          {drag.card.title}
        </div>
      )}

      {toast && (
        <div className="pointer-events-none fixed inset-x-0 bottom-6 z-[70] flex justify-center px-4">
          <div
            role="status"
            data-testid="calendar-toast"
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

// ───────────────────────── ถาด "ยังไม่กำหนดวัน" + สวิตช์ระบบอื่น + คำอธิบายสัญลักษณ์ ─────────────────────────

function UnscheduledTray({
  unscheduled,
  onOpenCard,
  onPointerDownCard,
  canEdit,
  ext,
  setParam,
  mobile,
}: {
  unscheduled: CalCardDto[];
  onOpenCard: (id: string) => void;
  onPointerDownCard?: (card: CalCardDto, source: string | null) => (e: React.PointerEvent<HTMLElement>) => void;
  canEdit?: boolean;
  ext: boolean;
  setParam: (patch: Record<string, string | null>) => void;
  /** true = จอมือถือ (รายการเต็มความกว้าง เรียงบนสุด ไม่ใช่แถบข้างตายตัว 230px ของเดสก์ท็อป) */
  mobile?: boolean;
}) {
  return (
    <aside
      data-testid="calendar-unscheduled"
      className={mobile ? "flex flex-col" : "flex flex-none flex-col overflow-y-auto border-r"}
      style={mobile ? { padding: 14, gap: 10, borderBottom: "1px solid var(--color-line)" } : { width: 230, padding: 14, gap: 10, borderColor: "var(--color-line)" }}
    >
      <div>
        <h2 style={{ fontSize: 13, fontWeight: 700 }}>ยังไม่กำหนดวัน ({unscheduled.length})</h2>
        <p style={{ fontSize: 11, color: "var(--color-muted)", marginTop: 2 }}>
          ลากการ์ดไปวางบนวันในปฏิทิน = ตั้งกำหนดส่ง
        </p>
      </div>

      <div className="flex flex-col" style={{ gap: 6 }}>
        {unscheduled.length === 0 && <span style={{ fontSize: 12, color: "var(--color-muted)" }}>ไม่มีการ์ดที่ยังไม่กำหนดวัน</span>}
        {unscheduled.map((c) => (
          <div
            key={c.id}
            data-testid="calendar-unscheduled-card"
            data-card-id={c.id}
            role="button"
            tabIndex={0}
            onPointerDown={canEdit && onPointerDownCard ? onPointerDownCard(c, null) : undefined}
            onClick={() => onOpenCard(c.id)}
            className="rounded-lg border"
            style={{ padding: "8px 9px", cursor: canEdit ? "grab" : "pointer", borderColor: "var(--color-line)", background: "var(--color-surface)", userSelect: "none", WebkitUserSelect: "none" }}
          >
            <p style={{ fontSize: 12.5, fontWeight: 500 }}>{c.title}</p>
            {c.labels.length > 0 && (
              <div className="mt-1 flex flex-wrap" style={{ gap: 4 }}>
                {c.labels.map((l) => (
                  <span
                    key={l.name}
                    className="inline-flex items-center font-semibold"
                    style={{ height: 16, padding: "0 6px", borderRadius: 5, fontSize: 10, color: `var(--color-tag-${l.color.toLowerCase()})`, border: `1px solid var(--color-tag-${l.color.toLowerCase()})` }}
                  >
                    {l.name}
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      <label className="mt-auto flex items-center justify-between" style={{ fontSize: 12, gap: 8 }}>
        <span>แสดงงานจากระบบอื่นด้วย</span>
        <input
          type="checkbox"
          data-testid="calendar-external-toggle"
          checked={ext}
          onChange={(e) => setParam({ ext: e.target.checked ? "1" : null })}
        />
      </label>

      <div className="flex flex-col" style={{ gap: 5, fontSize: 11, color: "var(--color-muted)" }}>
        <span className="flex items-center" style={{ gap: 6 }}>
          <span style={{ width: 7, height: 7, borderRadius: 999, background: "var(--color-ink)" }} />
          การ์ดในบอร์ดนี้
        </span>
        <span className="flex items-center" style={{ gap: 6 }}>
          <span style={{ width: 7, height: 7, borderRadius: 999, background: "var(--color-tag-red)" }} />
          เลยกำหนด
        </span>
        <span className="flex items-center" style={{ gap: 6 }}>
          <span style={{ width: 7, height: 7, borderRadius: 999, background: "var(--color-muted)" }} />
          จองทริป · ลา · ประชุม (อ่านอย่างเดียว)
        </span>
      </div>
    </aside>
  );
}

// ───────────────────────── ชิปการ์ด 1 ใบในวัน/ถาด ─────────────────────────

function DayCardChip({
  card,
  onPointerDown,
  onClick,
  dimmed,
}: {
  card: CalCardDto;
  onPointerDown?: (e: React.PointerEvent<HTMLElement>) => void;
  onClick: () => void;
  dimmed?: boolean;
}) {
  const dotColor = card.isOverdue ? "var(--color-tag-red)" : "var(--color-ink)";
  return (
    <div
      data-testid="calendar-card-chip"
      data-card-id={card.id}
      role="button"
      tabIndex={0}
      onPointerDown={onPointerDown}
      onClick={onClick}
      className="flex items-center truncate rounded"
      style={{ gap: 5, padding: "1px 4px", fontSize: 11, cursor: onPointerDown ? "grab" : "pointer", opacity: dimmed ? 0.35 : 1, userSelect: "none", WebkitUserSelect: "none" }}
    >
      <span style={{ width: 6, height: 6, borderRadius: 999, background: dotColor, flexShrink: 0 }} />
      <span className="truncate">{card.title}</span>
    </div>
  );
}

/** งานจากระบบอื่น (อ่านอย่างเดียว) — คลิกไปหน้าต้นทาง ไม่ใช่ตัวลาก ไม่ใช่หลังการ์ด */
function ExternalChip({ ev }: { ev: CalExternalDto }) {
  return (
    <a
      href={ev.href}
      data-testid="calendar-external-chip"
      title={`${ev.title} (อ่านอย่างเดียว)`}
      className="flex items-center truncate rounded"
      style={{ gap: 5, padding: "1px 4px", fontSize: 11, color: "var(--color-muted)" }}
    >
      <span style={{ width: 6, height: 6, borderRadius: 999, background: "var(--color-muted)", flexShrink: 0 }} />
      <span className="truncate">{ev.title}</span>
    </a>
  );
}

export default CalendarView;
