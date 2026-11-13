"use client";
// TRIPS T1.2 ▸ จอปฏิทินรอบและที่ว่าง ฝั่งร้าน (ภาพ 11): แถบช่วงวัน · มุมมอง · ชิป · ตัวกรอง · ปฏิทิน | แผงรอบ + ต้องตัดสินใจ
//   ผังกว้าง: 2 คอลัมน์ (ตาราง | แผง 356px) เมื่อเนื้อหากว้าง ≥ 1100px (container query — เปลือกแอปมีแถบซ้าย) ไม่งั้นแผงลงใต้ตาราง
//   ข้อมูลทั้งหมดจากตัวโหลด (loadDepartureCalendarVM / loadDeparturePanelVM / loadDepartureSchedulesVM) · URL: ?view= &start= &month= &f= &dep= &decide=1
import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { DepartureCalendarVM, DeparturePanelVM, DepartureSchedulesVM } from "@/lib/modules/trips";
import { BTN, BTN_PRIMARY } from "./ProductsScreenParts";
import { SEG_OFF, SEG_ON, SEG_WRAP, calHref, useDepDates, useReasonText, type CalFilter, type CalQuery, type CalView } from "./DepartureParts";
import DeparturesCalendar from "./DeparturesCalendar";
import { DecisionsCard, DeparturePanel, PanelHint } from "./DeparturePanel";
import { CreateDepartureDialog, SchedulesDialog } from "./DepartureDialogs";

export default function DeparturesScreen({
  unitSlug,
  cal,
  panel,
  sched,
  openDecide,
}: {
  unitSlug: string;
  cal: DepartureCalendarVM;
  panel: DeparturePanelVM | null;
  sched: DepartureSchedulesVM | null;
  openDecide: boolean;
}) {
  const t = useTranslations("trips");
  const D = useDepDates();
  const reasonText = useReasonText();
  const base = `/app/u/${unitSlug}/trips/departures`;
  const q: CalQuery = {
    view: cal.view,
    start: cal.view === "week" ? cal.range.from : null,
    month: cal.view === "month" ? (cal.range.days[Math.floor(cal.range.days.length / 2)]?.slice(0, 7) ?? null) : null,
    filter: cal.filter,
    dep: panel?.departure.departureId ?? null,
  };
  const [dialog, setDialog] = useState<"create" | "schedules" | null>(null);
  const rangeLabel = cal.view === "week" ? D.range(cal.range.from, cal.range.to) : cal.view === "month" && q.month ? D.month(q.month) : t("departures.tripsView.range", { from: D.full(cal.range.from) });
  const navHref = (to: string) => (cal.view === "week" ? calHref(base, q, { start: to, dep: null }) : calHref(base, q, { month: to, dep: null }));
  const viewHref = (v: CalView) => calHref(base, q, { view: v, start: null, month: null, dep: null });
  const filterHref = (f: CalFilter) => calHref(base, q, { filter: f, dep: null });
  const cx = cal.counts.cancelled;
  const defaultDate = cal.range.from >= cal.unit.today ? cal.range.from : cal.unit.today;

  return (
    <div data-trips-departures="" className="@container flex min-w-0 flex-col gap-4">
      {/* ── แถบหัว: ช่วงวัน · มุมมอง · ชิป · ตัวกรอง · ปุ่มสร้าง ── */}
      <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
        <h1 className="w-full text-sm font-medium text-[color:var(--color-muted)]">{t("departures.title")}</h1>
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          {cal.nav ? (
            <Link data-testid="trips-cal-prev" href={navHref(cal.nav.prev)} scroll={false} aria-label={t("departures.prev")} className={`${BTN} px-3`}>
              ‹
            </Link>
          ) : null}
          <b data-testid="trips-cal-range" className="whitespace-nowrap text-xl text-[color:var(--color-ink)]">
            {rangeLabel}
          </b>
          {cal.nav ? (
            <>
              <Link data-testid="trips-cal-next" href={navHref(cal.nav.next)} scroll={false} aria-label={t("departures.next")} className={`${BTN} px-3`}>
                ›
              </Link>
              <Link data-testid="trips-cal-today" href={navHref(cal.nav.today)} scroll={false} className={BTN}>
                {t("departures.today")}
              </Link>
            </>
          ) : null}
        </div>
        <nav aria-label={t("departures.viewAria")} className={SEG_WRAP}>
          <SegLink data-testid="trips-cal-view-week" href={viewHref("week")} on={cal.view === "week"} label={t("departures.view.week")} />
          <SegLink data-testid="trips-cal-view-month" href={viewHref("month")} on={cal.view === "month"} label={t("departures.view.month")} />
          <SegLink data-testid="trips-cal-view-trips" href={viewHref("trips")} on={cal.view === "trips"} label={t("departures.view.trips")} />
        </nav>
        <span className="hidden flex-1 @min-[900px]:block" />
        {cal.view !== "trips" && cal.counts.belowMin > 0 ? (
          <Link data-testid="trips-cal-attention" href="#trips-decisions" className="inline-flex min-h-11 items-center rounded-lg border-2 border-dashed border-[color:var(--color-danger)] px-3 text-sm font-bold text-[color:var(--color-danger)]">
            {t("departures.attention", { n: cal.counts.belowMin })}
          </Link>
        ) : cal.view !== "trips" ? (
          <span data-testid="trips-cal-attention" className="inline-flex min-h-11 items-center rounded-lg border border-[color:var(--color-line)] px-3 text-sm text-[color:var(--color-muted)]">
            {t("departures.attentionNone")}
          </span>
        ) : null}
        {cx.departures > 0 ? (
          <span data-testid="trips-cal-cancelled" className="inline-flex min-h-11 max-w-full items-center rounded-lg border border-[color:var(--color-line)] px-3 text-sm text-[color:var(--color-ink-soft)] [overflow-wrap:anywhere]">
            {t("departures.cancelledChip", { n: cx.departures })}
            {cx.reasons[0] ? ` · ${reasonText(cx.reasons[0].text) ?? ""}` : ""}
            {cx.pax > 0 ? ` · ${t("departures.cell.cancelledPax", { n: cx.pax })}` : ""}
          </span>
        ) : null}
        <nav aria-label={t("departures.filterAria")} className={SEG_WRAP}>
          <SegLink data-testid="trips-cal-filter-all" href={filterHref("all")} on={cal.filter === "all"} label={t("departures.filter.all")} />
          <SegLink data-testid="trips-cal-filter-tour" href={filterHref("tour")} on={cal.filter === "tour"} label={t("departures.filter.tour")} />
          <SegLink data-testid="trips-cal-filter-dive" href={filterHref("dive")} on={cal.filter === "dive"} label={t("departures.filter.dive")} />
        </nav>
        {sched ? (
          <div className="flex flex-wrap gap-2">
            <button type="button" data-testid="trips-dep-schedules" className={BTN} onClick={() => setDialog("schedules")}>
              {t("departures.actions.schedules")}
            </button>
            <button type="button" data-testid="trips-dep-add" className={BTN_PRIMARY} onClick={() => setDialog("create")}>
              {t("departures.actions.add")}
            </button>
          </div>
        ) : null}
      </div>

      {/* ── เนื้อหา: ตาราง | แผง ── */}
      {/* 2 คอลัมน์เมื่อเนื้อหา ≥ 1060px (1440 + แถบซ้าย = 1104 · มีแถบเลื่อน ≈ 1087): ตาราง ≥ 1087 − 340 − 16 = 731 → ในกรอบ 705 ≥ ตาราง 704 */}
      <div className="grid min-w-0 grid-cols-1 items-start gap-4 @min-[1060px]:grid-cols-[minmax(0,1fr)_340px]">
        <DeparturesCalendar vm={cal} base={base} q={q} />
        <div className="flex min-w-0 flex-col gap-4">
          {panel ? <DeparturePanel key={panel.departure.departureId} unitSlug={unitSlug} vm={panel} base={base} q={q} resources={sched?.resources ?? null} openDecide={openDecide} /> : <PanelHint />}
          <DecisionsCard vm={cal} base={base} q={q} />
        </div>
      </div>

      {dialog === "create" && sched ? <CreateDepartureDialog unitSlug={unitSlug} sched={sched} defaultDate={defaultDate} onClose={() => setDialog(null)} /> : null}
      {dialog === "schedules" && sched ? <SchedulesDialog unitSlug={unitSlug} sched={sched} defaultDate={defaultDate} onClose={() => setDialog(null)} /> : null}
    </div>
  );
}

function SegLink({ href, on, label, "data-testid": testid }: { href: string; on: boolean; label: string; "data-testid": string }) {
  return (
    <Link data-testid={testid} href={href} scroll={false} aria-current={on ? "page" : undefined} className={on ? SEG_ON : SEG_OFF}>
      {label}
    </Link>
  );
}
