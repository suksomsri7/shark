"use client";
// HR H2.2 ▸ บอร์ดตารางกะ (client) — ตารางสัปดาห์ แถว = คน × คอลัมน์ = จันทร์–อาทิตย์ · ชิปกะ 3 แบบ + เส้นประ · แถบ "ยังไม่เผยแพร่" ·
//   แผงกฎ · ชิปสาขา · ลากวางด้วย pointer events (ไม่ใช้ HTML5 drag — มือถือไม่ยิง dragstart) + คีย์บอร์ด Shift+ลูกศร + แตะเปิดแผ่นคำสั่ง
//   • ทุกการเขียนผ่าน server action → แกน rosterOpCore → เครื่องยนต์ H2.1 · ผลเป็นรหัสสั้น → ข้อความจาก messages (ไม่แสดงข้อความดิบ)
//   • ลากวาง = ย้าย · กด Alt/Option ตอนวาง = คัดลอก · ทีละ 1 action ต่อการวาง (เข้าคิว ส่งทีละตัว) · optimistic + ถอนเฉพาะตัวที่ถูกปฏิเสธ
//   • จอแคบ (< 768px) = มุมมองรายวัน แตะอย่างเดียว ไม่มีลากวาง (Q8) · ไม่อ่านนาฬิกา/ไม่ใช้ Intl ใน client (วันนี้มาจาก server) ◂
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import {
  addRosterEntryAction,
  copyRosterWeekAction,
  generateRosterAction,
  moveRosterEntryAction,
  publishRosterAction,
  removeRosterEntryAction,
} from "./roster-actions";
import {
  applyOp,
  canDrop,
  chipRange,
  confirmOp,
  DATE_NAMES_TH,
  dayLabel,
  keyTarget,
  minOf,
  rangeLabel,
  rollback,
  weekLabel,
  isRosterMsgCode,
  isTempEntryId,
  type DateNames,
  type RosterBoardDto,
  type RosterCellDto,
  type RosterEntryDto,
  type RosterOp,
  type RosterOpResult,
  type RosterRowDto,
  type RosterRuleKey,
  type RosterShiftDto,
  type RosterTarget,
  type ShiftKind,
} from "./roster-board-shared";
import type { LaborDayDto, LaborWeekDto } from "./labor"; // HR H4.2 ▸ ชนิดข้อมูลค่าแรง/ความต้องการคน (ชนิดเท่านั้น — ข้อมูลมาจาก page) ◂

// HR H4.2 ▸ labor = สัปดาห์ (หัวคอลัมน์ จัด/ต้องการ · แถบท้าย) + วันของแผง "ความต้องการคนรายชั่วโมง" — page โหลดจาก labor.ts (ผู้ดูที่ไม่ผ่าน = null) ◂
export type RosterLabor = { week: LaborWeekDto; day: LaborDayDto | null; dayLabel: string }; // HR H4.2 ◂
type Props = { board: RosterBoardDto; systemId: string; basePath: string; labor?: RosterLabor | null }; // HR H4.2 ▸ + labor ◂
type Flash = { kind: "error" | "ok"; text: string } | null;
type Drag = { entry: RosterEntryDto; employeeId: string; day: string; x: number; y: number; active: boolean; target: RosterTarget | null };
type Sheet =
  | { kind: "picker"; row: RosterRowDto; cell: RosterCellDto }
  | { kind: "entry"; row: RosterRowDto; cell: RosterCellDto; entry: RosterEntryDto }
  | null;

const DRAG_THRESHOLD_PX = 4;
const LONG_PRESS_MS = 350;
const NARROW_Q = "(max-width: 767px)";
const subscribeNarrow = (cb: () => void) => {
  const m = window.matchMedia(NARROW_Q);
  m.addEventListener("change", cb);
  return () => m.removeEventListener("change", cb);
};
const hrs = (min: number) => String(Math.round((min / 60) * 10) / 10);
// HR H4.2 ▸ ฿ จำนวนเต็มบาท + ‰ → % (ไม่ใช้ Intl ใน client) ◂
const lBaht = (s: number) => `${s < 0 ? "−" : ""}฿${String(Math.round(Math.abs(s) / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`; // HR H4.2 ◂
const lPct = (t: number) => `${Math.floor(t / 10)}.${t % 10}%`; // HR H4.2 ◂

/** แบบชิปตามชนิดกะ (token เท่านั้น) */
const CHIP: Record<ShiftKind, string> = {
  m: "border-[1.5px] border-[color:var(--color-shift-1)] bg-[color:var(--color-surface)] text-[color:var(--color-ink)]",
  a: "border-[1.5px] border-transparent bg-[color:var(--color-shift-2)] text-[color:var(--color-ink)]",
  c: "border-[1.5px] border-transparent bg-[color:var(--color-shift-3)] text-[color:var(--color-surface)]",
  x: "border-[1.5px] border-dashed border-[color:var(--color-ink-soft)] bg-[color:var(--color-surface)] text-[color:var(--color-ink)]",
};
const LEGEND_SWATCH: Record<"m" | "a" | "c" | "leave", string> = {
  m: "border-[1.5px] border-[color:var(--color-shift-1)]",
  a: "bg-[color:var(--color-shift-2)]",
  c: "bg-[color:var(--color-shift-3)]",
  leave: "border-[1.5px] border-dashed border-[color:var(--color-danger)]",
};

export function RosterBoard({ board, systemId, basePath, labor }: Props) { // HR H4.2 ▸ + labor ◂
  const t = useTranslations("hr.roster");
  const tl = useTranslations("hr.labor"); // HR H4.2 ◂
  const locale = useLocale();
  const router = useRouter();
  const [, startTransition] = useTransition();
  const narrow = useSyncExternalStore(subscribeNarrow, () => window.matchMedia(NARROW_Q).matches, () => false);

  // ── ชื่อวัน/เดือนตามภาษา (ไม่ใช้ Intl) ──
  const names: DateNames = useMemo(
    () =>
      locale === "th"
        ? DATE_NAMES_TH
        : {
            dow: Array.from({ length: 7 }, (_, i) => t(`dow.d${i}`)),
            month: Array.from({ length: 12 }, (_, i) => t(`month.m${i + 1}`)),
            yearOffset: 0,
          },
    [locale, t],
  );

  // ── สถานะบอร์ด (optimistic) ──
  const [local, setLocal] = useState<RosterBoardDto>(board);
  const queue = useRef<{ op: RosterOp; shiftId: string; times: { startMin: number; endMin: number } | null }[]>([]);
  const unconfirmed = useRef<RosterOp[]>([]);
  const pumping = useRef(false);
  useEffect(() => {
    // หน้าใหม่จาก server (revalidate) — ใส่ op ที่ยังรอผลกลับเข้าไป
    let nb = board;
    for (const op of unconfirmed.current) nb = applyOp(nb, op);
    setLocal(nb);
  }, [board]);
  const [flash, setFlash] = useState<Flash>(null);
  const [sheet, setSheet] = useState<Sheet>(null);
  // r2 m5: แผ่นคำสั่ง — โฟกัสเข้าแผ่นตอนเปิด · Esc ปิด · ปิดแล้วคืนโฟกัสให้ปุ่ม/ชิปที่เปิด (ถ้ายังอยู่ในหน้า)
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const openSheet = useCallback((s: NonNullable<Sheet>, opener: HTMLElement | null) => {
    openerRef.current = opener;
    setSheet(s);
  }, []);
  const closeSheet = useCallback(() => {
    setSheet(null);
    const el = openerRef.current;
    openerRef.current = null;
    if (el?.isConnected) window.setTimeout(() => el.focus(), 0);
  }, []);
  const sheetOpen = sheet !== null;
  useEffect(() => {
    if (!sheetOpen) return;
    sheetRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeSheet();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sheetOpen, closeSheet]);
  const [ruleOn, setRuleOn] = useState<RosterRuleKey | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [dialogKey, setDialogKey] = useState(0);
  const [dayTab, setDayTab] = useState<string>(() => (board.days.some((d) => d.key === board.todayKey) ? board.todayKey : board.monday));

  const b = local;
  const msgOf = useCallback((code: string) => (isRosterMsgCode(code) ? t(`msg.${code}`) : t("msg.failed")), [t]);
  const report = useCallback((r: RosterOpResult, okText: string) => setFlash(r.ok ? { kind: "ok", text: okText } : { kind: "error", text: msgOf(r.code) }), [msgOf]);
  const unitArg = b.unitSel === "all" ? null : b.unitSel;
  const sunday = b.days[6]?.key ?? b.monday;
  const range = rangeLabel(b.monday, names);
  const unitLabel = b.unitSel === "all" ? t("allUnits") : b.unitName;
  const hrefOf = (week: string, unit = b.unitSel) => `${basePath}?week=${week}&unit=${encodeURIComponent(unit)}`;
  const highlight = useMemo(() => new Set(ruleOn ? (b.rulePanel.rows.find((r) => r.rule === ruleOn)?.entryIds ?? []) : []), [ruleOn, b.rulePanel.rows]);
  const shiftOf = useMemo(() => new Map(b.shifts.map((s) => [s.id, s])), [b.shifts]);

  useEffect(() => {
    if (!focusId) return;
    const el = document.querySelector<HTMLElement>(`[data-entry-id="${CSS.escape(focusId)}"]`);
    el?.focus();
  }, [focusId, local]);

  // ── คิว op ลากวาง/คีย์บอร์ด: ส่งทีละตัว ──
  const pump = useCallback(async () => {
    if (pumping.current) return;
    pumping.current = true;
    while (queue.current.length) {
      const q = queue.current.shift()!;
      const { op } = q;
      let res: RosterOpResult;
      try {
        res =
          op.kind === "move"
            ? await moveRosterEntryAction({ systemId, entryId: op.entryId, date: op.to.day, employeeId: op.to.employeeId })
            : await addRosterEntryAction({ systemId, employeeId: op.to.employeeId, date: op.to.day, shiftId: q.shiftId, ...(q.times ?? {}) });
      } catch {
        res = { ok: false, code: "failed" };
      }
      unconfirmed.current = unconfirmed.current.filter((o) => o.id !== op.id);
      if (res.ok) {
        const realId = res.id ?? null;
        setLocal((l) => confirmOp(l, op.id, realId));
      } else {
        setLocal((l) => rollback(l, op.id));
        setFlash({ kind: "error", text: msgOf(res.code) });
      }
    }
    pumping.current = false;
    startTransition(() => router.refresh());
  }, [systemId, msgOf, router]);
  const opSeq = useRef(0);
  const enqueue = useCallback(
    (kind: "move" | "copy", entry: RosterEntryDto, to: RosterTarget) => {
      if (!canDrop(local, entry.id, to)) return;
      const op: RosterOp = { id: `op${++opSeq.current}`, kind, entryId: entry.id, to };
      const s = shiftOf.get(entry.shiftId);
      const sMin = minOf(entry.start) ?? 0;
      const eMin = minOf(entry.end) ?? 0;
      const times = !s || s.startMin !== sMin || s.endMin !== eMin ? { startMin: sMin, endMin: eMin } : null;
      unconfirmed.current.push(op);
      queue.current.push({ op, shiftId: entry.shiftId, times });
      setFlash(null);
      setLocal((l) => applyOp(l, op));
      if (kind === "move") setFocusId(entry.id);
      void pump();
    },
    [local, shiftOf, pump],
  );

  // ── ลากวาง (pointer events · เมาส์/ปากกาเริ่มเมื่อขยับ 4px · สัมผัส = กดค้าง 350ms) ──
  const [drag, setDrag] = useState<Drag | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const suppressClick = useRef(false);
  const pressTimer = useRef<number | null>(null);
  const setD = (d: Drag | null) => {
    dragRef.current = d;
    setDrag(d);
  };
  const targetAt = useCallback(
    (x: number, y: number, entryId: string): RosterTarget | null => {
      const el = document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-drop-emp]");
      if (!el) return null;
      const to = { employeeId: el.dataset.dropEmp ?? "", day: el.dataset.dropDay ?? "" };
      return canDrop(local, entryId, to) ? to : null;
    },
    [local],
  );
  const endDrag = useCallback(() => {
    if (pressTimer.current !== null) window.clearTimeout(pressTimer.current);
    pressTimer.current = null;
    setD(null);
  }, []);
  useEffect(() => {
    if (!drag) return;
    const sx = drag.x;
    const sy = drag.y;
    const move = (e: PointerEvent) => {
      const d = dragRef.current;
      if (!d) return;
      if (!d.active) {
        const far = Math.abs(e.clientX - sx) > DRAG_THRESHOLD_PX || Math.abs(e.clientY - sy) > DRAG_THRESHOLD_PX;
        if (!far) return;
        if (e.pointerType === "touch") return endDrag(); // ขยับก่อนครบเวลากดค้าง = เลื่อนจอ ไม่ใช่ลาก
        setD({ ...d, active: true, x: e.clientX, y: e.clientY, target: targetAt(e.clientX, e.clientY, d.entry.id) });
        return;
      }
      e.preventDefault();
      setD({ ...d, x: e.clientX, y: e.clientY, target: targetAt(e.clientX, e.clientY, d.entry.id) });
    };
    const up = (e: PointerEvent) => {
      const d = dragRef.current;
      if (d?.active) {
        // r2 m1: กันเฉพาะ click ที่ตามการปล่อยนี้ (ปล่อยนอกชิป ⇒ click ไปที่อื่น) — ล้างหลังจบ event นี้ ไม่ค้างไปกินแตะครั้งถัดไป
        suppressClick.current = true;
        window.setTimeout(() => {
          suppressClick.current = false;
        }, 0);
        const to = targetAt(e.clientX, e.clientY, d.entry.id);
        if (to) enqueue(e.altKey ? "copy" : "move", d.entry, to);
      }
      endDrag();
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") endDrag();
    };
    window.addEventListener("pointermove", move, { passive: false });
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", endDrag);
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", endDrag);
      window.removeEventListener("keydown", key);
    };
    // drag.entry.id เปลี่ยน = การลากใหม่ — ผูกตัวฟังใหม่ครั้งเดียวต่อการลาก
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag?.entry.id, drag === null]);
  const onChipPointerDown = (e: React.PointerEvent, row: RosterRowDto, cell: RosterCellDto, entry: RosterEntryDto) => {
    if (!b.canWrite || narrow || cell.state === "past" || e.button !== 0) return;
    const d: Drag = { entry, employeeId: row.employeeId, day: cell.day, x: e.clientX, y: e.clientY, active: false, target: null };
    setD(d);
    if (e.pointerType === "touch") {
      pressTimer.current = window.setTimeout(() => {
        const cur = dragRef.current;
        if (cur && !cur.active) setD({ ...cur, active: true, target: null });
      }, LONG_PRESS_MS);
    }
  };
  const onChipKey = (e: React.KeyboardEvent, row: RosterRowDto, cell: RosterCellDto, entry: RosterEntryDto) => {
    if (e.shiftKey && e.key.startsWith("Arrow")) {
      e.preventDefault();
      const to = keyTarget(local, entry.id, e.key);
      if (to) enqueue("move", entry, to);
    }
  };
  const openEntry = (ev: React.MouseEvent<HTMLElement>, row: RosterRowDto, cell: RosterCellDto, entry: RosterEntryDto) => {
    if (suppressClick.current) {
      suppressClick.current = false;
      return;
    }
    if (isTempEntryId(entry.id)) return; // r2 m3: ชิปชั่วคราว (ยังรอ server) — เปิด/แก้ไม่ได้
    openSheet({ kind: "entry", row, cell, entry }, ev.currentTarget);
  };

  // ── งานที่ไม่ผ่านตัวลดสถานะ (เพิ่ม · เปลี่ยนกะ · ลบ · คัดลอกสัปดาห์ · สร้างจากแม่แบบ · เผยแพร่) ──
  //   r2 MEDIUM-1: ทีละ 1 งาน — ระหว่างรอผล (busy) แตะซ้ำ/แตะกะอื่นไม่ส่ง action ที่สอง · ปุ่มในแผ่นคำสั่งถูกปิด
  const runningRef = useRef(false);
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<RosterOpResult>, okText: (r: Extract<RosterOpResult, { ok: true }>) => string) => {
    if (runningRef.current) return;
    runningRef.current = true;
    setBusy(true);
    let r: RosterOpResult;
    try {
      r = await fn();
    } catch {
      r = { ok: false, code: "failed" };
    } finally {
      runningRef.current = false;
      setBusy(false);
    }
    report(r, r.ok ? okText(r) : "");
    closeSheet();
    setDialogKey((k) => k + 1);
    startTransition(() => router.refresh());
  };
  const skipText = (r: Extract<RosterOpResult, { ok: true }>) => {
    const by = r.skippedBy ?? {};
    const parts = (["EXISTS", "NO_SHIFT", "HOLIDAY", "SHIFT_ARCHIVED", "OTHER"] as const).filter((k) => (by[k] ?? 0) > 0).map((k) => t(`skip.${k}`, { n: by[k] ?? 0 }));
    return [t("result.created", { created: r.created ?? 0, skipped: r.skipped ?? 0 }), ...parts].join(" · ");
  };
  const addShift = (row: RosterRowDto, day: string, shiftId: string, times?: { startMin: number; endMin: number }) =>
    run(() => addRosterEntryAction({ systemId, employeeId: row.employeeId, date: day, shiftId, ...(times ?? {}) }), () => t("result.saved"));

  // ── ส่วนย่อย ──
  const writableDay = (day: string) => b.canWrite && b.days.find((d) => d.key === day)?.past === false;
  const chip = (row: RosterRowDto, cell: RosterCellDto, e: RosterEntryDto) => {
    const temp = isTempEntryId(e.id); // r2 m3: ชิปชั่วคราวลาก/เปิด/ลบไม่ได้จนกว่า server ยืนยัน
    const editable = writableDay(cell.day) && !row.ended && !temp;
    const hl = highlight.has(e.id);
    return (
      <button
        key={e.id}
        type="button"
        data-testid={`hr-roster-entry-${e.id}`}
        data-entry-id={e.id}
        data-changed={e.published ? undefined : "1"}
        aria-disabled={temp ? true : undefined}
        data-highlight={hl ? "1" : undefined}
        aria-label={`${e.label} ${chipRange(e)}${e.overnight ? ` ${t("overnight")}` : ""}${e.published ? "" : ` · ${t("legend.changed")}`}`}
        className={`relative z-10 block min-h-[44px] w-full rounded-[10px] px-0.5 py-1.5 text-center text-[13.5px] font-bold leading-tight outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-ink)] ${CHIP[e.kind]} ${hl ? "ring-2 ring-[color:var(--color-danger)]" : ""} ${editable && !narrow ? "cursor-grab touch-none" : ""} ${drag?.active && drag.entry.id === e.id ? "opacity-40" : ""}`}
        onPointerDown={editable ? (ev) => onChipPointerDown(ev, row, cell, e) : undefined}
        onKeyDown={editable ? (ev) => onChipKey(ev, row, cell, e) : undefined}
        onClick={(ev) => openEntry(ev, row, cell, e)}
      >
        {e.label}
        <small className="block font-normal tabular-nums">
          {chipRange(e)}
          {e.overnight && (
            <span className="ml-0.5 text-[11px]" aria-label={t("overnight")}>
              {t("plusOne")}
            </span>
          )}
        </small>
        {!e.published && <span aria-label={t("legend.changed")} className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-[color:var(--color-accent)]" />}
      </button>
    );
  };
  const leaveChip = (cell: RosterCellDto) =>
    cell.leave ? (
      <span className="pointer-events-none relative z-10 block w-full rounded-[10px] border-[1.5px] border-dashed border-[color:var(--color-danger)] bg-[color:var(--color-surface)] px-0.5 py-1.5 text-center text-[13px] font-bold leading-tight text-[color:var(--color-danger)]">
        {cell.leave.label}
        {cell.leave.status === "PENDING" && <small className="block font-normal">{t("pending")}</small>}
      </span>
    ) : null;
  const cellBody = (row: RosterRowDto, cell: RosterCellDto) => {
    const canAdd = writableDay(cell.day) && !row.ended && (cell.state === "off" || cell.state === "work");
    const filled = cell.entries.length > 0 || !!cell.leave;
    const isTarget = drag?.active && drag.target?.employeeId === row.employeeId && drag.target.day === cell.day;
    return (
      <>
        {cell.entries.map((e) => chip(row, cell, e))}
        {leaveChip(cell)}
        {cell.entries.length === 0 && !cell.leave && cell.state !== "off" && <span className="text-[13.5px] text-[color:var(--color-muted)]">{t("outMark")}</span>}
        {/* r2 m2: ลาไม่บล็อกการจัดกะ (R10 · เครื่องยนต์แจ้ง ON_LEAVE เป็นข้อมูล) ⇒ ช่องที่มีลาเพิ่มกะได้ด้วยแตะ/คีย์บอร์ดเหมือนลากวาง */}
        {/* r3 V2/V3: ช่องว่าง = ปุ่ม "หยุด" เต็มช่อง (≥44px) · ช่องที่มีชิป/ลา = ปุ่มเพิ่มเป็นชั้นเต็มช่องใต้ชิป (absolute · ไม่ดันแถว ·
            พื้นที่ว่างรอบชิป = แตะเปิดตัวเลือก) + เครื่องหมาย "+" มุมช่องเมื่อ hover/โฟกัส (จอสัมผัสแสดงจาง ๆ ตลอด) */}
        {canAdd && !filled && (
          <button
            type="button"
            data-testid={`hr-roster-cell-${row.employeeId}-${cell.day}`}
            aria-label={t("addShift", { name: row.name, day: dayLabel(cell.day, names) })}
            className="min-h-[44px] w-full rounded-[10px] text-[13.5px] text-[color:var(--color-muted)] outline-none hover:bg-[color:var(--color-surface-2)] focus-visible:ring-2 focus-visible:ring-[color:var(--color-ink)]"
            onClick={(ev) => openSheet({ kind: "picker", row, cell }, ev.currentTarget)}
          >
            {t("off")}
          </button>
        )}
        {canAdd && filled && (
          <>
            <button
              type="button"
              data-testid={`hr-roster-cell-${row.employeeId}-${cell.day}`}
              aria-label={t("addShift", { name: row.name, day: dayLabel(cell.day, names) })}
              className="peer absolute inset-0 z-0 min-h-[44px] min-w-[44px] rounded-none outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[color:var(--color-ink)]"
              onClick={(ev) => openSheet({ kind: "picker", row, cell }, ev.currentTarget)}
            />
            <span
              aria-hidden="true"
              className="pointer-events-none absolute bottom-0.5 right-0.5 z-20 hidden h-5 w-5 place-items-center rounded-full border border-[color:var(--color-line)] bg-[color:var(--color-surface)] text-xs font-bold leading-none text-[color:var(--color-ink)] group-hover/cell:grid group-focus-within/cell:grid peer-focus-visible:grid pointer-coarse:grid pointer-coarse:opacity-60"
            >
              +
            </span>
          </>
        )}
        {!canAdd && cell.state === "off" && !cell.leave && <span className="text-[13.5px] text-[color:var(--color-muted)]">{t("off")}</span>}
        {isTarget && (
          <span aria-hidden="true" className="pointer-events-none absolute inset-1.5 z-20 rounded-xl border-2 border-dashed border-[color:var(--color-accent)] bg-[color:var(--color-accent-soft)]">
            <span className="absolute left-2 top-1 text-[12.5px] font-bold text-[color:var(--color-accent)]">{t("drop")}</span>
          </span>
        )}
      </>
    );
  };
  const rowSub = (row: RosterRowDto) =>
    [row.position, row.probation ? t("probation") : null, row.borrowed ? t("borrowed") : null].filter(Boolean).join(" · ") || " ";
  const hoursCell = (row: RosterRowDto) => {
    const over = row.weekWarnMin !== null;
    return (
      <div
        role="gridcell"
        data-testid={`hr-roster-hours-${row.employeeId}`}
        title={over && row.weekWarnMin !== row.weekMin ? t("allUnitsHours", { n: hrs(row.weekWarnMin ?? 0) }) : undefined}
        className={`flex flex-col items-center justify-center border-l border-[color:var(--color-line)] bg-[color:var(--color-surface-2)] px-1 py-2 text-center text-[15px] font-bold leading-tight tabular-nums ${over ? "text-[color:var(--color-danger)]" : ""}`}
      >
        {hrs(row.weekMin)}
        <small className={`text-xs font-normal ${over ? "text-[color:var(--color-danger)]" : "text-[color:var(--color-muted)]"}`}>
          {over ? t("over", { n: hrs(row.weekLimitMin ?? 0) }) : row.leaveDays > 0 ? t("leaveDays", { n: row.leaveDays }) : t("shiftCount", { n: row.shiftCount })}
        </small>
      </div>
    );
  };
  const rowHead = (row: RosterRowDto, tinted = false) => (
    <div role="rowheader" className={`sticky left-0 z-30 flex min-w-0 items-center gap-2 py-2 pl-3 pr-1 ${tinted ? "bg-[color:var(--color-surface-2)]" : "bg-[color:var(--color-surface)]"}`} title={row.homeUnitName ? t("borrowedFrom", { unit: row.homeUnitName }) : undefined}>
      <span aria-hidden="true" className="grid h-8 w-8 flex-none place-items-center rounded-full border border-[color:var(--color-line)] bg-[color:var(--color-surface-2)] text-sm">
        {row.initial}
      </span>
      <div className="min-w-0">
        <b className="block truncate text-[14.5px] font-semibold leading-tight">{row.name}</b>
        <small className="block truncate text-xs text-[color:var(--color-muted)]">{rowSub(row)}</small>
      </div>
    </div>
  );

  // ── หัว · ปุ่ม · สัปดาห์ · สาขา · แถบ ──
  const copyDisabled = !b.canWrite || b.allPast;
  const header = (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
      <div className="flex min-w-0 flex-col gap-1">
        <h1 data-testid="hr-roster-title" className="text-2xl font-semibold">
          {t("titleFull", { range, unit: unitLabel })}
        </h1>
        <p className="text-sm text-[color:var(--color-muted)]">
          {[t("people", { n: b.rows.length }) + (b.borrowedCount ? ` ${t("peopleBorrowed", { n: b.borrowedCount })}` : ""), ...b.shifts.slice(0, 4).map((s) => `${s.label} ${s.range}`)].join(" · ")}
        </p>
      </div>
      {b.canWrite && (
        <div className="flex flex-wrap items-center gap-2">
          {copyDisabled ? (
            <button type="button" disabled data-testid="hr-roster-copy-prev" title={t("pastHint")} className="btn btn-ghost min-h-[44px] text-sm opacity-50">
              {t("copyPrev")}
            </button>
          ) : (
            <ConfirmDialog
              key={`copy-${dialogKey}`}
              testId="hr-roster-copy-prev"
              triggerLabel={t("copyPrev")}
              triggerClassName="btn btn-ghost min-h-[44px] text-sm"
              title={t("copyTitle")}
              detail={t("copyDetail", { from: weekLabel(b.prevMonday, names), to: weekLabel(b.monday, names) })}
              confirmLabel={t("copyConfirm")}
              action={() => run(() => copyRosterWeekAction({ systemId, fromWeek: b.prevMonday, toWeek: b.monday, unitId: unitArg }), skipText)}
            />
          )}
          {copyDisabled ? (
            <button type="button" disabled data-testid="hr-roster-generate" title={t("pastHint")} className="btn btn-ghost min-h-[44px] text-sm opacity-50">
              {t("generate")}
            </button>
          ) : (
            <ConfirmDialog
              key={`gen-${dialogKey}`}
              testId="hr-roster-generate"
              triggerLabel={t("generate")}
              triggerClassName="btn btn-ghost min-h-[44px] text-sm"
              title={t("generateTitle")}
              detail={t("generateDetail", { range })}
              confirmLabel={t("generateConfirm")}
              action={() => run(() => generateRosterAction({ systemId, from: b.monday, to: sunday, unitId: unitArg }), skipText)}
            />
          )}
          <div data-testid="hr-roster-publish">
            {b.canPublish ? (
              <ConfirmDialog
                key={`pub-${dialogKey}`}
                testId="hr-roster-publish-confirm"
                triggerLabel={t("publish")}
                triggerClassName="btn btn-primary min-h-[44px] text-sm"
                title={t("publishTitle", { range, n: b.unpublishedCount })}
                detail={b.warnings.filter((w) => w.rule !== "HOLIDAY_WORK" && w.rule !== "ON_LEAVE").length ? t("publishWarn", { w: b.warnings.filter((w) => w.rule !== "HOLIDAY_WORK" && w.rule !== "ON_LEAVE").length }) : undefined}
                confirmLabel={t("publishConfirm")}
                action={() => run(() => publishRosterAction({ systemId, from: b.monday, to: sunday, unitId: unitArg }), (r) => t("result.published", { n: r.published ?? 0 }))}
              />
            ) : (
              <button type="button" disabled className="btn btn-primary min-h-[44px] text-sm opacity-50">
                {t("publish")}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
  const toolbar = (
    <div className="flex flex-wrap items-center gap-3">
      <div className="inline-flex h-[46px] items-center overflow-hidden rounded-[13px] border border-[color:var(--color-line)]">
        <a data-testid="hr-roster-week-prev" href={hrefOf(b.prevMonday)} aria-label={t("weekPrev")} className="grid h-full min-h-[44px] min-w-[44px] place-items-center px-3 text-[color:var(--color-ink-soft)]">
          ‹
        </a>
        <b data-testid="hr-roster-week-label" className="flex h-full items-center whitespace-nowrap border-x border-[color:var(--color-line)] px-3.5 text-[15px]">
          {weekLabel(b.monday, names)}
        </b>
        <a data-testid="hr-roster-week-next" href={hrefOf(b.nextMonday)} aria-label={t("weekNext")} className="grid h-full min-h-[44px] min-w-[44px] place-items-center px-3 text-[color:var(--color-ink-soft)]">
          ›
        </a>
      </div>
      {b.monday !== b.thisMonday && (
        <a data-testid="hr-roster-week-today" href={hrefOf(b.thisMonday)} className="btn btn-ghost min-h-[44px] text-sm">
          {t("weekToday")}
        </a>
      )}
      {b.unpublishedCount > 0 ? (
        <span data-testid="hr-roster-unpublished" className="inline-flex h-[46px] items-center whitespace-nowrap rounded-[13px] border-[1.5px] border-dashed border-[color:var(--color-accent)] bg-[color:var(--color-accent-soft)] px-3.5 text-sm font-bold text-[color:var(--color-accent)]">
          {t("unpublished", { n: b.unpublishedCount })}
        </span>
      ) : (
        <span data-testid="hr-roster-published-state" className="text-sm text-[color:var(--color-muted)]">
          {t("publishedState")}
        </span>
      )}
      <div data-testid="hr-roster-legend" className="flex flex-wrap items-center gap-4 text-[13px] text-[color:var(--color-ink-soft)] lg:ml-auto">
        {(["m", "a", "c", "leave"] as const).map((k) => (
          <span key={k} className="inline-flex items-center gap-1.5">
            <i aria-hidden="true" className={`inline-block h-3 w-5 rounded ${LEGEND_SWATCH[k]}`} />
            {t(`legend.${k}`)}
          </span>
        ))}
        <span className="inline-flex items-center gap-1.5">
          <i aria-hidden="true" className="inline-block h-2 w-2 rounded-full bg-[color:var(--color-accent)]" />
          {t("legend.changed")}
        </span>
      </div>
    </div>
  );
  const chips =
    b.units.length >= 2 ? (
      <nav aria-label={t("branches")} className="flex flex-wrap gap-2">
        {[{ id: "all", name: t("allUnits") }, ...b.units].map((u) => (
          <a
            key={u.id}
            data-testid={`hr-roster-branch-chip-${u.id}`}
            href={hrefOf(b.monday, u.id)}
            aria-current={b.unitSel === u.id ? "page" : undefined}
            className={`inline-flex min-h-[44px] items-center rounded-full border px-4 text-sm ${b.unitSel === u.id ? "border-[color:var(--color-ink)] bg-[color:var(--color-ink)] text-[color:var(--color-surface)]" : "border-[color:var(--color-line)] text-[color:var(--color-ink-soft)]"}`}
          >
            {u.name}
          </a>
        ))}
      </nav>
    ) : (
      <p className="text-sm text-[color:var(--color-muted)]">{unitLabel}</p>
    );

  // HR H4.2 ▸ ค่าแรง/ความต้องการคน (ภาพ 03): หัวคอลัมน์ จัด/ต้องการ ณ ชั่วโมงพีค (ขาด = สีอำพัน) · แถบท้าย ชม./ค่าแรง/labor % คาด · แผงรายชั่วโมง ◂
  const demandOf = new Map((labor?.week.days ?? []).map((d) => [d.day, d])); // HR H4.2 ◂
  const demandChip = (day: string) => { // HR H4.2 ◂
    const d = demandOf.get(day);
    if (!d || d.scheduledAtPeak === null || d.neededAtPeak === null) return null;
    const short = d.scheduledAtPeak < d.neededAtPeak;
    return (
      <span
        data-testid={`hr-roster-demand-${day}`}
        aria-label={tl("demandAria", { s: d.scheduledAtPeak, n: d.neededAtPeak })}
        className={`mt-1.5 inline-block rounded-[7px] border px-1.5 text-[12.5px] font-bold tabular-nums ${short ? "border-[color:var(--color-tag-amber)] bg-[color:var(--color-due-soon-bg)] text-[color:var(--color-tag-amber)]" : "border-[color:var(--color-line)] bg-[color:var(--color-surface)] text-[color:var(--color-ink-soft)]"}`}
      >
        {d.scheduledAtPeak}/{d.neededAtPeak}
      </span>
    );
  }; // HR H4.2 ◂
  const lf = labor?.week.footer; // HR H4.2 ◂
  const laborFoot = lf ? ( // HR H4.2 ◂
    <span data-testid="hr-roster-labor-foot" className="flex flex-wrap items-center gap-x-5 gap-y-1">
      <span>
        {tl("footHours", { h: hrs(lf.paidMinutes) })}
        {lf.costSatang !== undefined && (
          <>
            {" · "}
            {tl("footCost", { cost: lf.costSatang === null ? "—" : lBaht(lf.costSatang) })}
          </>
        )}
      </span>
      {lf.costSatang !== undefined && lf.forecastSalesSatang !== undefined && (
        <span>{tl("footPct", { pct: lf.pctTenths === null || lf.pctTenths === undefined ? "—" : lPct(lf.pctTenths), sales: lf.forecastSalesSatang === null ? "—" : lBaht(lf.forecastSalesSatang) })}</span>
      )}
      {lf.partial && <span>{tl("smallGroup", { n: lf.excludedHeadcount ?? 0 })}</span> /* HR H4.2 ▸ R1 (review) ◂ */}
      {(lf.truncated || labor?.week.flags.truncated) && <span role="alert" className="font-bold text-[color:var(--color-danger)]">{tl("truncated")}</span> /* HR H4.2 ▸ R4 (review) ◂ */}
    </span>
  ) : null; // HR H4.2 ◂
  const ld = labor?.day ?? null; // HR H4.2 ◂
  const demandPanel = labor ? ( // HR H4.2 ◂
    <section data-testid="hr-roster-demand-panel" className="card flex flex-col !p-5">
      <h2 className="text-[15px] font-bold">{tl("panelTitle")}</h2>
      <p className="mt-1 text-[12.5px] text-[color:var(--color-muted)]">{tl("panelSub", { day: labor.dayLabel })}</p>
      {!ld?.demand ? (
        <p className="mt-3 text-sm text-[color:var(--color-muted)]">{tl("setSplh")}</p>
      ) : (
        (() => {
          const hs = ld.demand.hours.filter((h) => h.scheduled > 0 || (h.needed ?? 0) > 0);
          const top = Math.max(1, ...hs.map((h) => Math.max(h.scheduled, h.needed ?? 0)));
          const shortHs = hs.filter((h) => h.needed !== null && h.scheduled < h.needed);
          const first = shortHs[0];
          let last = first;
          for (const h of shortHs) if (last && h.hour === last.hour + 1) last = h;
          const run = first && last ? shortHs.filter((h) => h.hour >= first.hour && h.hour <= last.hour) : [];
          const worst = run.reduce<(typeof run)[number] | null>((a, h) => (!a || (h.needed ?? 0) - h.scheduled > (a.needed ?? 0) - a.scheduled ? h : a), null);
          return (
            <>
              <div className="mt-4 flex h-[120px] items-end gap-1 border-b border-[color:var(--color-line)]" aria-hidden="true">
                {hs.map((h) => (
                  <div key={h.hour} className="flex h-full flex-1 items-end gap-px">
                    <i className="block flex-1 rounded-t-sm bg-[color:var(--color-ink)]" style={{ height: `${Math.round((h.scheduled / top) * 100)}%` }} />
                    <i
                      className={`block flex-1 rounded-t-sm border-[1.5px] border-b-0 bg-[color:var(--color-surface)] ${h.needed !== null && h.scheduled < h.needed ? "border-solid border-[color:var(--color-tag-amber)]" : "border-dashed border-[color:var(--color-muted)]"}`}
                      style={{ height: `${Math.round(((h.needed ?? 0) / top) * 100)}%` }}
                    />
                  </div>
                ))}
              </div>
              <div className="mt-1.5 flex gap-1" aria-hidden="true">
                {hs.map((h) => (
                  <span key={h.hour} className={`flex-1 text-center text-[11px] tabular-nums ${h.needed !== null && h.scheduled < h.needed ? "font-bold text-[color:var(--color-tag-amber)]" : "text-[color:var(--color-muted)]"}`}>
                    {h.label}
                  </span>
                ))}
              </div>
              <div className="mt-3 flex flex-wrap gap-4 text-[12.5px] text-[color:var(--color-ink-soft)]">
                <span className="inline-flex items-center gap-1.5">
                  <i className="inline-block h-3 w-5 rounded bg-[color:var(--color-ink)]" />
                  {tl("scheduled")}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <i className="inline-block h-3 w-5 rounded border-[1.5px] border-dashed border-[color:var(--color-muted)] bg-[color:var(--color-surface)]" />
                  {tl("neededLabel")}
                </span>
              </div>
              <p className={`mt-3 text-sm font-bold ${worst ? "text-[color:var(--color-tag-amber)]" : "text-[color:var(--color-muted)]"}`}>
                {worst && first && last
                  ? tl("short", { from: first.label, to: String(((last.hour + 1) % 24)).padStart(2, "0"), n: (worst.needed ?? 0) - worst.scheduled, s: worst.scheduled, d: worst.needed ?? 0 })
                  : tl("noShort")}
              </p>
            </>
          );
        })()
      )}
    </section>
  ) : null; // HR H4.2 ◂

  // ── ตารางสัปดาห์ (≥ 768px) ──
  // r3 V1: ชื่อ + ชม./สัปดาห์ กว้างคงที่ · 7 วันยืดตามกล่อง (≥64px) ⇒ 1440 พอดีกล่อง · แคบกว่า 668px เลื่อนแนวนอนในการ์ด (คอลัมน์ชื่อตรึง)
  const gridCols = { gridTemplateColumns: "136px repeat(7, minmax(64px, 1fr)) 76px" };
  const grid = (
    <div className="overflow-x-auto rounded-[18px] border border-[color:var(--color-line)] bg-[color:var(--color-surface)]">
      <div data-testid="hr-roster-grid" role="grid" aria-label={t("gridLabel")} aria-rowcount={b.rows.length + 1} aria-colcount={9} className="min-w-[668px]">
        <div role="row" className="grid border-b border-[color:var(--color-line)] bg-[color:var(--color-surface-2)] text-[13px] font-bold text-[color:var(--color-muted)]" style={gridCols}>
          <div role="columnheader" className="sticky left-0 z-30 bg-[color:var(--color-surface-2)] px-3 py-3">
            {t("colEmployee")}
          </div>
          {b.days.map((d) => (
            <div key={d.key} role="columnheader" data-testid={`hr-roster-day-${d.key}`} className={`border-l border-[color:var(--color-line)] px-1 py-3 text-center ${d.weekend ? "bg-[color:var(--color-stage)]" : ""}`}>
              <b className="block text-[14.5px] text-[color:var(--color-ink)]">{dayLabel(d.key, names)}</b>
              <span className="text-xs font-normal">
                {t("headcount", { n: d.headcount })}
                {d.holiday ? ` · ${d.holiday.name}` : ""}
              </span>
              {demandChip(d.key) /* HR H4.2 ◂ */}
            </div>
          ))}
          <div role="columnheader" className="border-l border-[color:var(--color-line)] px-1 py-3 text-center leading-tight">
            {t("colHours")}
          </div>
        </div>
        {b.rows.map((row) => {
          const rowHl = row.cells.some((c) => c.entries.some((e) => highlight.has(e.id)));
          return (
            <div
              key={row.employeeId}
              role="row"
              data-testid={`hr-roster-row-${row.employeeId}`}
              data-highlight={rowHl ? "1" : undefined}
              className={`grid border-b border-[color:var(--color-line)] last:border-b-0 ${row.warn || rowHl ? "bg-[color:var(--color-surface-2)]" : ""}`}
              style={gridCols}
            >
              {rowHead(row, row.warn || rowHl)}
              {row.cells.map((cell, i) => (
                <div
                  key={cell.day}
                  role="gridcell"
                  data-drop-emp={b.canWrite && cell.state !== "past" && !row.ended ? row.employeeId : undefined}
                  data-drop-day={b.canWrite && cell.state !== "past" && !row.ended ? cell.day : undefined}
                  data-drop={drag?.active && b.canWrite && cell.state !== "past" && !row.ended ? "1" : undefined}
                  className={`group/cell relative flex min-h-16 flex-col items-stretch justify-center gap-1 border-l border-[color:var(--color-line)] px-1 py-2.5 text-center ${b.days[i]?.weekend ? "bg-[color:var(--color-surface-2)]" : ""} ${cell.state === "past" ? "opacity-70" : ""}`}
                >
                  {cellBody(row, cell)}
                </div>
              ))}
              {hoursCell(row)}
            </div>
          );
        })}
        <div className="flex items-center gap-5 border-t border-[color:var(--color-line)] bg-[color:var(--color-surface-2)] px-4 py-3.5 text-[13.5px] text-[color:var(--color-muted)]">
          <span data-testid="hr-roster-total">{t("total", { n: hrs(b.totalMin) })}</span>
          {laborFoot /* HR H4.2 ◂ */}
        </div>
      </div>
    </div>
  );

  // ── มุมมองรายวัน (< 768px · แตะอย่างเดียว) ──
  const dayIdx = Math.max(0, b.days.findIndex((d) => d.key === dayTab));
  const dayView = (
    <div className="flex flex-col gap-3">
      <div role="tablist" className="-mx-1 flex gap-1 overflow-x-auto pb-1">
        {b.days.map((d) => (
          <button
            key={d.key}
            type="button"
            role="tab"
            aria-selected={d.key === b.days[dayIdx]?.key}
            data-testid={`hr-roster-daytab-${d.key}`}
            onClick={() => setDayTab(d.key)}
            className={`min-h-[44px] min-w-[52px] whitespace-nowrap rounded-xl border px-2 text-sm ${d.key === b.days[dayIdx]?.key ? "border-[color:var(--color-ink)] bg-[color:var(--color-ink)] text-[color:var(--color-surface)]" : "border-[color:var(--color-line)]"}`}
          >
            {dayLabel(d.key, names)}
          </button>
        ))}
      </div>
      <div data-testid="hr-roster-grid" role="grid" aria-label={t("gridLabel")} aria-rowcount={b.rows.length} aria-colcount={3} className="flex flex-col divide-y divide-[color:var(--color-line)] rounded-2xl border border-[color:var(--color-line)]">
        {b.rows.map((row) => {
          const cell = row.cells[dayIdx];
          return (
            <div key={row.employeeId} role="row" data-testid={`hr-roster-row-${row.employeeId}`} className={`grid grid-cols-[1fr_120px] items-center gap-2 px-2 py-2 ${row.warn ? "bg-[color:var(--color-surface-2)]" : ""}`}>
              <div className="min-w-0">
                {rowHead(row, row.warn)}
                <p data-testid={`hr-roster-hours-${row.employeeId}`} className={`pl-13 text-xs tabular-nums ${row.weekWarnMin !== null ? "text-[color:var(--color-danger)]" : "text-[color:var(--color-muted)]"}`}>
                  {t("weekHours", { n: hrs(row.weekMin) })} · {row.weekWarnMin !== null ? t("over", { n: hrs(row.weekLimitMin ?? 0) }) : t("shiftCount", { n: row.shiftCount })}
                </p>
              </div>
              <div role="gridcell" className="group/cell relative flex flex-col justify-center gap-1 self-stretch py-2.5 text-center">
                {cell ? cellBody(row, cell) : null}
              </div>
            </div>
          );
        })}
      </div>
      <p data-testid="hr-roster-total" className="text-sm text-[color:var(--color-muted)]">
        {t("total", { n: hrs(b.totalMin) })}
      </p>
      {laborFoot && <div className="text-sm text-[color:var(--color-muted)]">{laborFoot}</div> /* HR H4.2 ◂ */}
    </div>
  );

  // ── แผงกฎ ──
  const rules = (
    <section data-testid="hr-roster-rules" className="card flex flex-col !p-5">
      <h2 className="text-[15px] font-bold">{t("rules.title")}</h2>
      <p className="mt-1 text-[12.5px] text-[color:var(--color-muted)]">{t("rules.sub")}</p>
      <div className="mt-2 flex flex-col">
        {b.rulePanel.rows.map((r) => {
          const shown = r.names.slice(0, 3).join(", ") + (r.names.length > 3 ? ` ${t("rules.more", { n: r.names.length - 3 })}` : "") + (r.unnamed ? ` ${t("rules.unnamed", { n: r.unnamed })}` : "");
          const value = r.ok ? t("rules.pass") : t("rules.warn", { names: `${shown}${r.hours !== null ? ` ${hrs(r.hours * 60)}` : ""}`.trim() });
          return (
            <button
              key={r.rule}
              type="button"
              data-testid={`hr-roster-rule-${r.rule}`}
              data-highlight={ruleOn === r.rule ? "1" : undefined}
              aria-pressed={ruleOn === r.rule}
              disabled={r.ok}
              onClick={() => setRuleOn((x) => (x === r.rule ? null : r.rule))}
              className={`flex min-h-[44px] items-center gap-2.5 border-t border-[color:var(--color-line)] py-2.5 text-left text-sm first:border-t-0 ${r.ok ? "" : "text-[color:var(--color-danger)]"} ${ruleOn === r.rule ? "bg-[color:var(--color-surface-2)]" : ""}`}
            >
              <span>{r.rule === "OVERLAP" ? t("rule.OVERLAP") : t(`rule.${r.rule}`, { n: r.limit ?? 0 })}</span>
              <span className="flex-1" />
              <span className="font-bold">{value}</span>
            </button>
          );
        })}
      </div>
      {b.rulePanel.info.map((i) => (
        <p key={i.rule} className="mt-2 text-[12.5px] text-[color:var(--color-muted)]">
          {t(`info.${i.rule}`, { n: i.count })}
        </p>
      ))}
    </section>
  );

  // ── แผ่นคำสั่ง (ตัวเลือกกะ · คำสั่งของชิป) ──
  const sheetView = sheet && (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-[color:var(--color-ink)]/40 sm:items-center sm:p-4" onClick={closeSheet}>
      <div
        ref={sheetRef}
        tabIndex={-1}
        role="dialog"
        aria-busy={busy || undefined}
        aria-modal="true"
        data-testid={sheet.kind === "picker" ? "hr-roster-picker" : "hr-roster-entry-sheet"}
        className="max-h-[85vh] w-full max-w-sm overflow-y-auto rounded-t-2xl outline-none bg-[color:var(--color-surface)] p-5 shadow-lg sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {sheet.kind === "picker" ? (
          <PickerBody key={`${sheet.row.employeeId}-${sheet.cell.day}`} t={t} names={names} row={sheet.row} cell={sheet.cell} list={shiftsFor(b, sheet.cell)} busy={busy} onAdd={addShift} />
        ) : (
          <EntryBody
            key={sheet.entry.id}
            t={t}
            names={names}
            board={local}
            row={sheet.row}
            cell={sheet.cell}
            entry={sheet.entry}
            editable={writableDay(sheet.cell.day) && !sheet.row.ended}
            busy={busy}
            others={shiftsFor(b, sheet.cell).filter((s) => s.id !== sheet.entry.shiftId)}
            onGo={(kind, to) => {
              const entry = sheet.entry;
              closeSheet();
              enqueue(kind, entry, to);
            }}
            onChange={(sid) => run(() => moveRosterEntryAction({ systemId, entryId: sheet.entry.id, shiftId: sid }), () => t("result.saved"))}
            onRemove={() => run(() => removeRosterEntryAction({ systemId, entryId: sheet.entry.id }), () => t("result.saved"))}
          />
        )}
        <button type="button" className="btn btn-ghost mt-3 min-h-[44px] w-full text-sm" onClick={closeSheet}>
          {t("close")}
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col gap-5">
      {header}
      {chips}
      {toolbar}
      {flash && (
        <p
          data-testid="hr-roster-message"
          role={flash.kind === "error" ? "alert" : "status"}
          aria-live="polite"
          className={`rounded-xl border px-4 py-3 text-sm ${flash.kind === "error" ? "border-[color:var(--color-danger)] text-[color:var(--color-danger)]" : "border-[color:var(--color-line)] text-[color:var(--color-ink)]"}`}
        >
          {flash.text}
        </p>
      )}
      {b.loadFailed && (
        <p role="alert" className="rounded-xl border border-[color:var(--color-danger)] px-4 py-3 text-sm text-[color:var(--color-danger)]">
          {t("msg.failed")}
        </p>
      )}
      <div className="flex flex-col gap-5 xl:flex-row xl:items-start">
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          {b.rows.length === 0 ? (
            <p data-testid="hr-roster-empty" className="rounded-2xl border border-[color:var(--color-line)] px-4 py-8 text-center text-sm text-[color:var(--color-muted)]">
              {t("empty")}
            </p>
          ) : narrow ? (
            dayView
          ) : (
            grid
          )}
          {labor && <p className="text-[13px] text-[color:var(--color-muted)]">{tl("headNote")}</p> /* HR H4.2 ◂ */}
          {b.notes.length > 0 && (
            <div data-testid="hr-roster-note" role="note" className="rounded-xl bg-[color:var(--color-surface-2)] px-4 py-3 text-[13px] text-[color:var(--color-muted)]">
              {b.notes.map((n) => (
                <p key={n.day}>{t("holidayNote", { day: dayLabel(n.day, names), name: n.name, open: n.shopOpen ? t("shopOpen") : t("shopClosed") })}</p>
              ))}
            </div>
          )}
        </div>
        <aside className="flex w-full flex-col gap-5 xl:w-[370px] xl:flex-none">
          {demandPanel /* HR H4.2 ◂ */}
          {rules}
        </aside>
      </div>
      {drag?.active && (
        <div
          data-testid="hr-roster-drag-ghost"
          aria-hidden="true"
          className={`pointer-events-none fixed z-50 w-[120px] rounded-[10px] px-1 py-1.5 text-center text-[13.5px] font-bold shadow-xl motion-safe:-rotate-[4deg] ${CHIP[drag.entry.kind]}`}
          style={{ left: drag.x - 60, top: drag.y - 22 }}
        >
          {drag.entry.label}
          <small className="block font-normal tabular-nums">{chipRange(drag.entry)}</small>
        </div>
      )}
      {sheetView}
    </div>
  );
}
export default RosterBoard;

// ═════════════════════════ แผ่นคำสั่ง (คอมโพเนนต์ระดับบนสุด — state ของฟอร์มไม่หายตอนบอร์ดเรนเดอร์ใหม่) ═════════════════════════
type T = ReturnType<typeof useTranslations>;
/** กะที่ใช้กับช่องนี้ได้ = กะทั้งร้าน + กะของสาขาของวันนั้น */
function shiftsFor(b: RosterBoardDto, cell: RosterCellDto): RosterShiftDto[] {
  return b.shifts.filter((s) => s.unitId === null || s.unitId === (cell.unit ?? null));
}
function PickerBody({ t, names, row, cell, list, busy, onAdd }: { t: T; names: DateNames; row: RosterRowDto; cell: RosterCellDto; list: RosterShiftDto[]; busy: boolean; onAdd: (row: RosterRowDto, day: string, shiftId: string, times?: { startMin: number; endMin: number }) => void }) {
  const [sid, setSid] = useState(list[0]?.id ?? "");
  const [st, setSt] = useState("09:00");
  const [en, setEn] = useState("17:00");
  const addShift = onAdd;
  return (
      <div className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">{t("picker.title", { name: row.name, day: dayLabel(cell.day, names) })}</h2>
        {list.length === 0 && <p className="text-sm text-[color:var(--color-muted)]">{t("picker.none")}</p>}
        <div className="flex flex-col gap-2">
          {list.map((s) => (
            <button key={s.id} type="button" data-testid={`hr-roster-picker-shift-${s.id}`} disabled={busy} onClick={() => addShift(row, cell.day, s.id)} className={`min-h-[44px] rounded-[10px] px-3 py-2 text-left text-sm font-bold disabled:opacity-50 ${CHIP[s.kind]}`}>
              {s.label} <span className="font-normal tabular-nums">{s.range}</span>
            </button>
          ))}
        </div>
        {list.length > 0 && (
          <fieldset className="flex flex-col gap-2 border-t border-[color:var(--color-line)] pt-3">
            <legend className="text-sm font-medium">{t("picker.custom")}</legend>
            <select value={sid} onChange={(e) => setSid(e.target.value)} className="input min-h-[44px]" aria-label={t("picker.shift")}>
              {list.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label} {s.range}
                </option>
              ))}
            </select>
            <div className="grid grid-cols-2 gap-2">
              <label className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)]">
                {t("picker.start")}
                <input type="time" value={st} onChange={(e) => setSt(e.target.value)} className="input min-h-[44px]" />
              </label>
              <label className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)]">
                {t("picker.end")}
                <input type="time" value={en} onChange={(e) => setEn(e.target.value)} className="input min-h-[44px]" />
              </label>
            </div>
            <button
              type="button"
              className="btn btn-primary min-h-[44px] text-sm"
              disabled={busy || !sid || minOf(st) === null || minOf(en) === null}
              onClick={() => addShift(row, cell.day, sid, { startMin: minOf(st) ?? 0, endMin: minOf(en) ?? 0 })}
            >
              {t("picker.save")}
            </button>
          </fieldset>
        )}
      </div>
    );
  }
function EntryBody({
  t,
  names,
  board,
  row,
  cell,
  entry,
  editable,
  busy,
  others,
  onGo,
  onChange,
  onRemove,
}: {
  t: T;
  names: DateNames;
  board: RosterBoardDto;
  row: RosterRowDto;
  cell: RosterCellDto;
  entry: RosterEntryDto;
  editable: boolean;
  busy: boolean;
  others: RosterShiftDto[];
  onGo: (kind: "move" | "copy", to: RosterTarget) => void;
  onChange: (shiftId: string) => void;
  onRemove: () => void;
}) {
  const futureDays = board.days.filter((d) => !d.past);
  const people = board.rows.filter((r) => !r.ended);
  const [day, setDay] = useState(futureDays.find((d) => d.key !== cell.day)?.key ?? cell.day);
  const [emp, setEmp] = useState(row.employeeId);
  const [sid, setSid] = useState(others[0]?.id ?? "");
  const to = { employeeId: emp, day };
  const ok = canDrop(board, entry.id, to);
  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold">
        {entry.label} {chipRange(entry)} · {row.name} · {dayLabel(cell.day, names)}
      </h2>
      {!entry.published && <p className="text-sm text-[color:var(--color-accent)]">{t("legend.changed")}</p>}
      {!editable && <p className="text-sm text-[color:var(--color-muted)]">{cell.state === "past" ? t("msg.past") : t("readOnly")}</p>}
      {editable && (
        <>
          <fieldset className="flex flex-col gap-2">
            <legend className="text-sm font-medium">{t("entry.where")}</legend>
            <select value={emp} onChange={(e) => setEmp(e.target.value)} className="input min-h-[44px]" aria-label={t("entry.person")}>
              {people.map((p) => (
                <option key={p.employeeId} value={p.employeeId}>
                  {p.name}
                </option>
              ))}
            </select>
            <select value={day} onChange={(e) => setDay(e.target.value)} className="input min-h-[44px]" aria-label={t("entry.day")}>
              {futureDays.map((d) => (
                <option key={d.key} value={d.key}>
                  {dayLabel(d.key, names)}
                </option>
              ))}
            </select>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" className="btn btn-ghost min-h-[44px] text-sm" disabled={busy || !ok} onClick={() => onGo("move", to)}>
                {t("entry.move")}
              </button>
              <button type="button" className="btn btn-ghost min-h-[44px] text-sm" disabled={busy || !ok} onClick={() => onGo("copy", to)}>
                {t("entry.copy")}
              </button>
            </div>
          </fieldset>
          {others.length > 0 && (
            <fieldset className="flex flex-col gap-2 border-t border-[color:var(--color-line)] pt-3">
              <legend className="text-sm font-medium">{t("entry.change")}</legend>
              <select value={sid} onChange={(e) => setSid(e.target.value)} className="input min-h-[44px]" aria-label={t("picker.shift")}>
                {others.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label} {s.range}
                  </option>
                ))}
              </select>
              <button type="button" className="btn btn-ghost min-h-[44px] text-sm" disabled={busy || !sid} onClick={() => onChange(sid)}>
                {t("entry.change")}
              </button>
            </fieldset>
          )}
          <div className="border-t border-[color:var(--color-line)] pt-3">
            <ConfirmDialog
              testId="hr-roster-entry-remove"
              triggerLabel={t("entry.remove")}
              triggerClassName="btn btn-ghost min-h-[44px] w-full text-sm text-[color:var(--color-danger)]"
              title={t("entry.removeTitle")}
              detail={t("entry.removeDetail", { label: `${entry.label} ${chipRange(entry)}`, day: dayLabel(cell.day, names) })}
              confirmLabel={t("entry.remove")}
              danger
              action={onRemove}
            />
          </div>
        </>
      )}
    </div>
  );
}
// ◂ HR H2.2
