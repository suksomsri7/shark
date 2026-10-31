"use client";

// SVC B.14 — จอปฏิทินนัด (ภาพ จอง 02 · DESIGN-BOOKING-QUEUE R6 · ใบสั่ง §4) · เดสก์ท็อป 1440
//   วัน: คอลัมน์ = คน หรือ ห้อง/เตียง · สัปดาห์: 7 วันของคน/ห้องที่เลือก · ลากบล็อก = moveAppointmentAction (server ตัดสินชน/ว่างเสมอ —
//   client แค่แสดงตำแหน่งปลายทางระหว่างลาก · ล้ม ⇒ server redirect ?err= และบล็อกอยู่ที่เดิมเพราะไม่ย้ายฝั่ง client) ·
//   คลิกช่องว่าง/ปุ่ม "+ จองให้ลูกค้า" = ฟอร์มจอง (bookForCustomerAction) · กล่องข้าง: walk-in ตอนนี้ · ห้อง/เตียงตอนนี้ · การ์ดงาน
// 🔴 สัญญา DOM: [data-bq-calendar] · [data-cal-col=<key>][data-closed] · [data-cal-block=<id>] (movable ⇒ draggable="true" + data-movable) ·
//    [data-cal-range] · [data-cal-mode] · [data-cal-book] · [data-cal-prev] · [data-cal-next] · [data-cal-now] · [data-bq-walkin-now] · [data-bq-res-now] · [data-cal-card]
// 🔴 actions มาทาง props · ไม่ import ค่าจาก @/lib/modules/* (ยกเว้น pure) · @/lib/actions/* · core/db · @prisma/client · ไม่มีเบอร์ลูกค้า
import Link from "next/link";
import { useEffect, useRef, useState, useTransition, type DragEvent, type MouseEvent } from "react";
import type { CalBlock, CalColumn, CalendarView } from "@/lib/modules/booking/calendar";
import type { JobNotesMap } from "./JobNotes";
import { dayLabel, hhmm } from "./line-parts";
import BookDialog, { type BookAt } from "./calendar/BookDialog";
import { ROW_PX, SNAP_MIN, axisOf, calHref, hm, minOf, viewFields, type CalActions } from "./calendar/cal-utils";
import { JobCard, ResourcesNowBox, WalkInNowBox } from "./calendar/SidePanel";

type Props = { view: CalendarView; unitSlug: string; actions: CalActions; at?: string; err?: string; notes?: JobNotesMap };
type Drag = { id: string; colKey: string; durMin: number; grabMin: number; block: CalBlock };

const AXIS_W = 64;
const HEAD_H = 62;
const BODY_H = 588;

function blockClass(b: CalBlock): string {
  switch (b.status) {
    case "DONE":
    case "NO_SHOW":
      return "bg-[color:var(--color-surface-2)] text-[color:var(--color-muted)] border border-[color:var(--color-line)]";
    case "IN_SERVICE":
      return "bg-[color:var(--color-ink)] text-[color:var(--color-surface)] border border-[color:var(--color-ink)]";
    case "ARRIVED":
    case "QUEUED":
    case "CALLED":
      return "bg-[color:var(--color-surface)] border-[1.5px] border-[color:var(--color-ink)]";
    case "LATE":
      return "bg-[color:var(--color-surface)] border-[1.5px] border-dashed border-[color:var(--color-danger)]";
    default:
      return "bg-[color:var(--color-surface)] border-[1.5px] border-dashed border-[color:var(--color-ink)]";
  }
}
const HATCH = "[background:repeating-linear-gradient(135deg,var(--color-surface-2)_0_7px,var(--color-stage)_7px_14px)]";
const newKey = () => `cal-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

export default function CalendarBoard({ view, unitSlug, actions, at, err, notes }: Props) {
  const axis = axisOf(view);
  const bodyH = ((axis.endMin - axis.startMin) / 60) * ROW_PX;
  const topOf = (ms: number, ds: string) => ((minOf(ms, ds) - axis.startMin) / 60) * ROW_PX;
  const isToday = (ds: string) => ds === view.todayStr;
  const scrollRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [hover, setHover] = useState<{ colKey: string; startMin: number } | null>(null);
  const [moving, setMoving] = useState<string | null>(null);
  const [bookAt, setBookAt] = useState<BookAt | null>(null);
  const [, startTransition] = useTransition();
  const selected = view.card?.appointmentId ?? null;
  const side = view.walkInNow !== null || view.resourcesNow !== null || view.card !== null;

  // เลื่อนแกนเวลาให้เห็นช่วงที่ใช้งาน (วันนี้: 2 ชม. ก่อนตอนนี้ · วันอื่น: เวลาเปิดร้าน)
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const nowMin = minOf(view.nowMs, view.dateStr);
    const target = view.days.includes(view.todayStr) ? Math.floor(nowMin / 60) * 60 - 120 : (view.openMin ?? axis.startMin);
    el.scrollTop = Math.max(0, ((target - axis.startMin) / 60) * ROW_PX);
  }, [view.nowMs, view.dateStr, view.todayStr, view.days, view.openMin, axis.startMin]);
  useEffect(() => setMoving(null), [view]);

  const minAt = (e: DragEvent<HTMLElement> | MouseEvent<HTMLElement>, grabMin: number) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const raw = axis.startMin + ((e.clientY - rect.top) / ROW_PX) * 60 - grabMin;
    return Math.min(24 * 60 - SNAP_MIN, Math.max(0, Math.round(raw / SNAP_MIN) * SNAP_MIN));
  };
  const droppable = (c: CalColumn) => c.kind !== "UNASSIGNED";
  const onDragOver = (e: DragEvent<HTMLDivElement>, c: CalColumn) => {
    if (!drag || !droppable(c)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    const m = minAt(e, drag.grabMin);
    if (!hover || hover.colKey !== c.key || hover.startMin !== m) setHover({ colKey: c.key, startMin: m });
  };
  const onDrop = (e: DragEvent<HTMLDivElement>, c: CalColumn) => {
    if (!drag || !droppable(c)) return;
    e.preventDefault();
    const m = minAt(e, drag.grabMin);
    const b = drag.block;
    const fd = new FormData();
    fd.set("appointmentId", b.appointmentId);
    fd.set("dateStr", c.dateStr);
    fd.set("startMin", String(m));
    if (c.kind === "STAFF" && c.id) fd.set("staffId", c.id);
    if (c.kind === "RESOURCE" && c.id) fd.set("resourceId", c.id);
    fd.set("expectStartAt", new Date(b.startMs).toISOString());
    fd.set("expectStaffId", b.staffId ?? "");
    for (const [k, v] of Object.entries(viewFields(view, at))) fd.set(k, v);
    setMoving(b.appointmentId);
    setDrag(null);
    setHover(null);
    startTransition(async () => {
      await actions.move(fd);
    });
  };
  const onEmptyClick = (e: MouseEvent<HTMLDivElement>, c: CalColumn) => {
    if (!view.access.book || c.closed || c.kind === "UNASSIGNED") return;
    if ((e.target as HTMLElement).closest("[data-cal-block]")) return;
    const m = Math.floor((minAt(e, 0) - SNAP_MIN / 2) / SNAP_MIN) * SNAP_MIN + SNAP_MIN;
    setBookAt({ staffId: c.kind === "STAFF" ? c.id : null, dateStr: c.dateStr, startMin: Math.max(0, m), key: newKey() });
  };
  const openBook = () => {
    const nowMin = minOf(view.nowMs, view.dateStr);
    const base = isToday(view.dateStr) ? Math.ceil((nowMin + 1) / SNAP_MIN) * SNAP_MIN : (view.openMin ?? 10 * 60);
    setBookAt({ staffId: null, dateStr: view.dateStr, startMin: Math.min(24 * 60 - SNAP_MIN, base), key: newKey() });
  };

  const hours: number[] = [];
  for (let h = axis.startMin; h <= axis.endMin; h += 60) hours.push(h);
  const resLine = view.summary.resources.map((r) => `${r.labelTh} ${r.count}`).join(" · ");
  const summary = [
    view.openMin === null ? "ร้านปิดวันนี้" : `เปิด ${hm(view.openMin)}–${hm(view.closeMin ?? view.openMin)}`,
    `${view.providerLabel} ${view.summary.staffWorking} คนมาวันนี้${view.summary.staffOnLeave ? ` (ลา ${view.summary.staffOnLeave})` : ""}`,
    ...(resLine ? [resLine] : []),
  ].join(" · ");
  const focusName = view.focusOptions.find((o) => o.id === view.focusId)?.name ?? "";
  const title = view.range === "DAY" ? `ปฏิทินนัด · ${dayLabel(view.dateStr)}` : `ปฏิทินนัด · ${dayLabel(view.days[0])} – ${dayLabel(view.days[6])}`;
  const tog = "flex h-full items-center px-4 text-sm";
  const on = "bg-[color:var(--color-ink)] font-bold text-[color:var(--color-surface)]";
  const off = "text-[color:var(--color-ink-soft)] hover:bg-[color:var(--color-surface-2)]";
  const nowTop = topOf(view.nowMs, view.todayStr);
  const nowVisible = view.days.includes(view.todayStr) && nowTop >= 0 && nowTop <= bodyH;

  return (
    <div data-bq-calendar="" data-booking-wide="" className={"grid w-full min-w-0 gap-6 " + (side ? "xl:grid-cols-[minmax(0,1fr)_360px]" : "")}>
      <section className="flex min-w-0 flex-col gap-4">
        <div className="flex flex-wrap items-start gap-4">
          <div className="min-w-0 flex-1">
            <h1 className="text-[26px] font-bold tracking-tight">{title}</h1>
            <p className="mt-1 text-[13px] text-[color:var(--color-muted)]">{view.range === "WEEK" && focusName ? `${focusName} · ${summary}` : summary}</p>
          </div>
          {view.access.book ? (
            <button type="button" data-cal-book="" onClick={openBook} className="btn btn-primary min-h-[46px] rounded-[13px] px-5 text-[15px] font-bold">
              ＋ จองให้ลูกค้า
            </button>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="inline-flex h-[46px] items-center overflow-hidden rounded-[13px] border">
            <Link data-cal-prev="" href={calHref(unitSlug, view, at, { date: view.prevDateStr })} aria-label="ก่อนหน้า" className="grid h-full place-items-center px-3 text-[color:var(--color-ink-soft)] hover:bg-[color:var(--color-surface-2)]">
              ‹
            </Link>
            <b className="flex h-full items-center whitespace-nowrap border-x px-4">{view.range === "DAY" ? dayLabel(view.dateStr) : `${dayLabel(view.days[0])} – ${dayLabel(view.days[6])}`}</b>
            <Link data-cal-next="" href={calHref(unitSlug, view, at, { date: view.nextDateStr })} aria-label="ถัดไป" className="grid h-full place-items-center px-3 text-[color:var(--color-ink-soft)] hover:bg-[color:var(--color-surface-2)]">
              ›
            </Link>
          </div>
          <div className="inline-flex h-[46px] overflow-hidden rounded-[13px] border">
            <Link data-cal-range="DAY" href={calHref(unitSlug, view, at, { range: "DAY" })} className={`${tog} ${view.range === "DAY" ? on : off}`}>
              วัน
            </Link>
            <Link data-cal-range="WEEK" href={calHref(unitSlug, view, at, { range: "WEEK" })} className={`${tog} ${view.range === "WEEK" ? on : off}`}>
              สัปดาห์
            </Link>
          </div>
          {view.days.includes(view.todayStr) || view.dateStr === view.todayStr ? null : (
            <Link href={calHref(unitSlug, view, at, { date: view.todayStr })} className="btn-sm min-h-[40px]">
              วันนี้
            </Link>
          )}
          <span className="flex-1" />
          <div className="inline-flex h-[46px] overflow-hidden rounded-[13px] border">
            <Link data-cal-mode="STAFF" href={calHref(unitSlug, view, at, { mode: "STAFF" })} className={`${tog} ${view.mode === "STAFF" ? on : off}`}>
              ตาม{view.providerLabel}
            </Link>
            <Link data-cal-mode="RESOURCE" href={calHref(unitSlug, view, at, { mode: "RESOURCE" })} className={`${tog} ${view.mode === "RESOURCE" ? on : off}`}>
              ตามห้อง/เตียง
            </Link>
          </div>
        </div>

        {view.range === "WEEK" && view.focusOptions.length ? (
          <nav aria-label={view.mode === "STAFF" ? `เลือก${view.providerLabel}` : "เลือกห้อง/เตียง"} className="flex flex-wrap gap-2">
            {view.focusOptions.map((o) => (
              <Link
                key={o.id}
                data-cal-focus={o.id}
                href={calHref(unitSlug, view, at, { who: o.id })}
                className={"rounded-full border px-3 py-1.5 text-sm " + (o.id === view.focusId ? "border-[color:var(--color-ink)] bg-[color:var(--color-ink)] text-[color:var(--color-surface)]" : "hover:bg-[color:var(--color-surface-2)]")}
              >
                {o.name}
              </Link>
            ))}
          </nav>
        ) : null}

        {err ? (
          <p role="alert" data-cal-err="" className="rounded-xl border border-[color:var(--color-danger)] px-4 py-3 text-sm text-[color:var(--color-danger)]">
            {err}
          </p>
        ) : null}

        <div className="overflow-hidden rounded-[18px] border bg-[color:var(--color-surface)]">
          {view.columns.length === 0 ? (
            <p className="p-6 text-sm text-[color:var(--color-muted)]">{view.mode === "STAFF" ? `ยังไม่มี${view.providerLabel}ในสาขานี้` : "ยังไม่มีห้อง/เตียงในสาขานี้ — เพิ่มได้ที่ ตั้งค่า"}</p>
          ) : (
            <div ref={scrollRef} className="relative overflow-auto" style={{ maxHeight: BODY_H + HEAD_H }}>
              <div className="relative flex min-w-max">
                {/* แกนเวลา */}
                <div className="sticky left-0 z-20 flex-none bg-[color:var(--color-surface)]" style={{ width: AXIS_W }}>
                  <div className="sticky top-0 z-10 border-b bg-[color:var(--color-surface-2)]" style={{ height: HEAD_H }} />
                  <div className="relative" style={{ height: bodyH }}>
                    {hours.map((h) => (
                      <span key={h} className="absolute right-2.5 -translate-y-1/2 text-xs tabular-nums text-[color:var(--color-muted)]" style={{ top: ((h - axis.startMin) / 60) * ROW_PX + (h === axis.startMin ? 8 : 0) }}>
                        {hm(h)}
                      </span>
                    ))}
                    {nowVisible && view.range === "DAY" ? (
                      <span className="absolute left-1.5 z-10 -translate-y-1/2 rounded-md bg-[color:var(--color-accent)] px-1.5 py-px text-[11.5px] font-bold tabular-nums text-[color:var(--color-accent-fg)]" style={{ top: nowTop }}>
                        {hhmm(view.nowMs)}
                      </span>
                    ) : null}
                  </div>
                </div>

                {view.columns.map((c) => {
                  const closed = c.closed;
                  const head = view.range === "WEEK" ? dayLabel(c.dateStr) : c.name;
                  const sub = view.range === "WEEK" ? (isToday(c.dateStr) ? "วันนี้" : c.sub) : c.sub;
                  const parts = closed ? closed.reasonTh.split(" · ") : [];
                  return (
                    <div
                      key={c.key}
                      data-cal-col={c.key}
                      data-closed={closed ? closed.code : undefined}
                      className="flex min-w-[132px] flex-1 flex-col border-l"
                      style={{ width: view.range === "WEEK" ? 132 : undefined }}
                    >
                      <div className="sticky top-0 z-10 flex items-center gap-2.5 border-b bg-[color:var(--color-surface-2)] px-2.5" style={{ height: HEAD_H }}>
                        {c.kind === "STAFF" && view.range === "DAY" ? (
                          <span aria-hidden="true" className="grid h-7 w-7 flex-none place-items-center rounded-lg border bg-[color:var(--color-surface)] text-xs font-bold">
                            {c.name.slice(0, 1)}
                          </span>
                        ) : null}
                        <span className="min-w-0">
                          <b className={"block truncate text-[14.5px] leading-tight " + (isToday(c.dateStr) && view.range === "WEEK" ? "text-[color:var(--color-accent)]" : "")}>{head}</b>
                          <small className="block truncate text-xs text-[color:var(--color-muted)]">{sub}</small>
                        </span>
                      </div>
                      <div
                        className={"relative " + (closed ? HATCH : "") + (view.access.book && !closed && c.kind !== "UNASSIGNED" ? " cursor-cell" : "")}
                        style={{
                          height: bodyH,
                          ...(closed ? {} : { backgroundImage: "linear-gradient(to bottom, var(--color-line) 1px, transparent 1px)", backgroundSize: `100% ${ROW_PX}px` }),
                        }}
                        onDragOver={(e) => onDragOver(e, c)}
                        onDrop={(e) => onDrop(e, c)}
                        onClick={(e) => onEmptyClick(e, c)}
                      >
                        {c.maintenance.map((m) => {
                          const t = Math.max(0, topOf(m.startMs, c.dateStr));
                          const b = Math.min(bodyH, topOf(m.endMs, c.dateStr));
                          return b > t && !closed ? (
                            <div key={`${m.startMs}-${m.endMs}`} data-cal-maint="" className={"absolute inset-x-0 border-y border-dashed border-[color:var(--color-line)] " + HATCH} style={{ top: t, height: b - t }}>
                              <span className="m-1.5 inline-block rounded-md bg-[color:var(--color-surface)] px-1.5 text-[11px] text-[color:var(--color-muted)]">
                                ปิดซ่อม {hhmm(m.startMs)}–{hhmm(m.endMs)}
                              </span>
                            </div>
                          ) : null;
                        })}
                        {closed ? (
                          <div className="absolute inset-x-2.5 z-[1] rounded-xl border-[1.5px] border-dashed border-[color:var(--color-danger)] bg-[color:var(--color-surface)] px-1.5 py-2.5 text-center text-[13px] leading-normal" style={{ top: Math.min(Math.max(nowVisible ? nowTop + 30 : 40, 40), Math.max(40, bodyH - 120)) }}>
                            <span className="sr-only">{closed.reasonTh}</span>
                            <b aria-hidden="true" className="block font-bold text-[color:var(--color-danger)]">{parts[0]}</b>
                            {parts.length > 1 ? (
                              <small aria-hidden="true" className="block text-[color:var(--color-muted)]">{parts.slice(1).join(" · ")}</small>
                            ) : null}
                          </div>
                        ) : null}
                        {nowVisible && isToday(c.dateStr) && view.range === "WEEK" ? (
                          <i data-cal-now="" className="pointer-events-none absolute inset-x-0 z-[3] h-0.5 bg-[color:var(--color-accent)]" style={{ top: nowTop }} />
                        ) : null}
                        {c.blocks.map((b) => {
                          const t = topOf(b.startMs, c.dateStr);
                          const h = Math.max(30, topOf(b.endMs, c.dateStr) - t);
                          const sel = b.appointmentId === selected;
                          const dark = b.status === "IN_SERVICE";
                          const chips = view.mode === "STAFF" ? b.resourceNames.filter(Boolean) : [b.staffName ?? "ใครก็ได้", ...b.resourceNames.filter((n, i) => b.resourceIds[i] !== c.id && n)];
                          const head1 =
                            b.status === "DONE" || b.status === "NO_SHOW" ? b.serviceName
                              : b.kind === "WALKIN" || b.status === "IN_SERVICE" ? b.label
                              : `${hhmm(b.startMs)} ${b.label}`;
                          const line2 =
                            b.status === "DONE" ? `เสร็จ · ${b.label}`
                              : b.status === "NO_SHOW" ? "ไม่มา"
                              : b.status === "ARRIVED" ? `${b.ticketNumber ? `${b.ticketNumber} · ` : ""}เช็กอินแล้ว`
                              : b.status === "LATE" ? "สาย"
                              : null;
                          return (
                            <div
                              key={b.appointmentId}
                              data-cal-block={b.appointmentId}
                              data-status={b.status}
                              data-movable={b.movable ? "" : undefined}
                              draggable={b.movable ? true : undefined}
                              onDragStart={
                                b.movable
                                  ? (e) => {
                                      const rect = e.currentTarget.getBoundingClientRect();
                                      e.dataTransfer.effectAllowed = "move";
                                      e.dataTransfer.setData("text/plain", b.appointmentId);
                                      setDrag({ id: b.appointmentId, colKey: c.key, durMin: Math.round((b.endMs - b.startMs) / 60_000), grabMin: ((e.clientY - rect.top) / ROW_PX) * 60, block: b });
                                    }
                                  : undefined
                              }
                              onDragEnd={b.movable ? () => { setDrag(null); setHover(null); } : undefined}
                              title={`${hhmm(b.startMs)}–${hhmm(b.endMs)} · ${b.label} · ${b.serviceName}`}
                              className={
                                "absolute inset-x-1.5 z-[2] overflow-hidden rounded-[11px] text-xs leading-[1.38] " +
                                blockClass(b) +
                                (sel ? " ring-[3px] ring-[color:var(--color-accent)]" : "") +
                                (b.movable ? " cursor-grab active:cursor-grabbing" : "") +
                                (moving === b.appointmentId || drag?.id === b.appointmentId ? " opacity-50" : "")
                              }
                              style={{ top: t, height: h }}
                            >
                              <Link href={calHref(unitSlug, view, at, { appt: b.appointmentId })} draggable={false} className="block h-full px-2.5 py-[7px]" scroll={false}>
                                <b className="block truncate text-[13px]">{head1}</b>
                                {line2 ? <span className="block truncate">{line2}</span> : null}
                                {b.status === "DONE" || b.status === "NO_SHOW" ? null : <span className="block truncate">{b.serviceName}</span>}
                                {chips.length ? (
                                  <span className="mt-[3px] flex flex-wrap gap-1">
                                    {chips.map((n, i) => (
                                      <span
                                        key={`${n}-${i}`}
                                        className={
                                          "rounded-md px-1.5 text-[11.5px] font-bold " +
                                          (dark ? "bg-[color:var(--color-surface)] text-[color:var(--color-ink)]" : "border border-[color:var(--color-line)] bg-[color:var(--color-surface-2)]")
                                        }
                                      >
                                        {n}
                                      </span>
                                    ))}
                                  </span>
                                ) : null}
                                {moving === b.appointmentId ? <span className="block font-semibold">กำลังย้าย…</span> : null}
                              </Link>
                            </div>
                          );
                        })}
                        {drag && hover && hover.colKey === c.key ? (
                          <div
                            data-cal-ghost=""
                            className="pointer-events-none absolute inset-x-1.5 z-[4] rounded-[11px] border-2 border-dashed border-[color:var(--color-accent)] bg-[color:var(--color-accent-soft)] px-2.5 py-1.5 text-xs font-bold text-[color:var(--color-accent)]"
                            style={{ top: ((hover.startMin - axis.startMin) / 60) * ROW_PX, height: Math.max(30, (drag.durMin / 60) * ROW_PX) }}
                          >
                            ย้ายไป {hm(hover.startMin)}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
                {nowVisible && view.range === "DAY" ? (
                  <i data-cal-now="" className="pointer-events-none absolute right-0 z-[3] h-0.5 bg-[color:var(--color-accent)]" style={{ left: AXIS_W, top: HEAD_H + nowTop }} />
                ) : null}
              </div>
            </div>
          )}
        </div>
        {view.access.move ? <p className="text-xs text-[color:var(--color-muted)]">ลากนัดไปเวลา/{view.providerLabel}/ห้องใหม่ได้ — ระบบตรวจว่าง (คนและห้อง/เตียง) ก่อนย้ายทุกครั้ง</p> : null}
      </section>

      {side ? (
        <aside className="flex min-w-0 flex-col gap-6">
          {view.walkInNow !== null ? <WalkInNowBox view={view} /> : null}
          {view.resourcesNow !== null ? <ResourcesNowBox view={view} /> : null}
          {view.card ? <JobCard view={view} card={view.card} actions={actions} at={at} notes={notes} /> : null}
        </aside>
      ) : null}

      {bookAt ? <BookDialog key={bookAt.key} view={view} at={at} actions={actions} bookAt={bookAt} onClose={() => setBookAt(null)} /> : null}
    </div>
  );
}

