"use client";
// TRIPS T1.2 ▸ ตัวปฏิทินรอบ (ภาพ 11 :15–:44): สัปดาห์ = ตาราง สินค้า × วัน (จอ ≥ md) / รายการต่อวัน (มือถือ) · เดือน = ตาราง 7 คอลัมน์แบบจุด/จำนวน · ทริปหลายวัน = รายการ
//   🔴 แสดงผลเท่านั้น: สถานะ · ที่ว่าง · เหตุผล มาจากตัวโหลด · ช่องเดียวบอก ใช้แล้ว/ความจุ + สถานะแยกรูปทรง
//   🔴 กล่องตาราง = relative min-w-0 overflow-x-auto · ไฟล์นี้ไม่มีป้ายซ่อนสำหรับโปรแกรมอ่านจอ (บทเรียนล้นแนวนอน 497/390 ของ T1.1)
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { DepartureCalendarVM, DepartureCellVM } from "@/lib/modules/trips";
import { calHref, cellShape, cellStyle, useCellText, useDepDates, UsedBar, type CalQuery } from "./DepartureParts";

type Props = { vm: DepartureCalendarVM; base: string; q: CalQuery };

export default function DeparturesCalendar({ vm, base, q }: Props) {
  const t = useTranslations("trips");
  const D = useDepDates();
  return (
    <section data-testid="trips-cal" className="flex min-w-0 flex-col gap-3 rounded-2xl border border-[color:var(--color-line)] bg-[color:var(--color-surface)] p-3.5">
      {vm.products.length === 0 ? (
        <p data-testid="trips-cal-empty" className="p-2 text-sm text-[color:var(--color-muted)]">
          {t("departures.empty")}
        </p>
      ) : vm.view === "week" ? (
        <>
          <WeekTable vm={vm} base={base} q={q} />
          <DayList vm={vm} base={base} q={q} />
        </>
      ) : vm.view === "month" ? (
        <MonthGrid vm={vm} base={base} q={q} />
      ) : (
        <TripsList vm={vm} base={base} q={q} />
      )}
      {vm.truncated || vm.productsTruncated || vm.tripsTruncated ? (
        <p data-testid="trips-cal-truncated" role="status" className="rounded-lg border border-dashed border-[color:var(--color-line)] px-3 py-2 text-sm text-[color:var(--color-ink-soft)]">
          {[
            vm.truncated ? t("departures.truncated", { shown: vm.shown, total: vm.total, date: vm.shownUntil ? D.full(vm.shownUntil) : "" }) : null,
            vm.productsTruncated ? t("departures.productsTruncated", { shown: vm.products.length, total: vm.productsTotal }) : null,
            vm.tripsTruncated ? t("departures.tripsTruncated", { n: vm.trips.length }) : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
      ) : null}
      {vm.view !== "trips" && vm.products.length > 0 ? <Legend /> : null}
    </section>
  );
}

function Legend() {
  const t = useTranslations("trips");
  const item = "inline-flex items-center gap-2";
  const sw = "inline-block h-4 w-6 shrink-0 rounded";
  return (
    <div data-testid="trips-cal-legend" className="flex flex-wrap gap-x-5 gap-y-2 px-1 text-sm text-[color:var(--color-muted)]">
      <span className={item}>{t("departures.legend.number")}</span>
      <span className={item}>
        <span aria-hidden="true" className={`${sw} border-[3px] border-[color:var(--color-ink)]`} />
        {t("departures.legend.full")}
      </span>
      <span className={item}>
        <span aria-hidden="true" className={`${sw} border-2 border-dashed border-[color:var(--color-danger)]`} />
        {t("departures.legend.belowMin")}
      </span>
      <span className={item}>
        <span aria-hidden="true" className={`${sw} border border-[color:var(--color-line)]`} style={cellStyle("CANCELLED")} />
        {t("departures.legend.cancelled")}
      </span>
      <span className={item}>
        <span aria-hidden="true" className={`${sw} border border-[color:var(--color-line)] bg-[color:var(--color-surface-2)]`} />
        {t("departures.legend.past")}
      </span>
    </div>
  );
}

/** ข้อความรอง "เรือราชา 1 · 24 ที่ · ขั้นต่ำ 8" (ภาพ :17) */
function useHeaderLine() {
  const t = useTranslations("trips");
  return (p: DepartureCalendarVM["products"][number]) => {
    const h = p.header;
    const unit = t(`departures.unit.${h.unitWord}`);
    return [
      h.boats.length === 1 ? h.boats[0] : h.boats.length > 1 ? t("departures.header.boatsN", { n: h.boats.length }) : null,
      h.capacity !== null ? t("departures.header.cap", { n: h.capacity, unit }) : null,
      h.minPax !== null ? t("departures.header.minPax", { n: h.minPax }) : null,
    ]
      .filter(Boolean)
      .join(" · ");
  };
}

/** ช่องของรอบ (ลิงก์เปิดแผง) */
function CellLink({ c, base, q, compact }: { c: DepartureCellVM; base: string; q: CalQuery; compact?: boolean }) {
  const T = useCellText();
  const selected = q.dep === c.departureId;
  return (
    <Link
      href={calHref(base, q, { dep: c.departureId, decide: false })}
      scroll={false}
      data-testid={`trips-cal-cell-${c.departureId}`}
      data-state={c.state}
      aria-current={selected ? "true" : undefined}
      className={`${cellShape(c.state, selected)} min-h-11 hover:bg-[color:var(--color-surface-2)]`}
      style={cellStyle(c.state)}
    >
      <b className={`text-base leading-tight ${c.state === "CANCELLED" ? "text-[color:var(--color-danger)]" : "text-[color:var(--color-ink)]"}`}>{T.line1(c)}</b>
      <span className={`text-sm leading-snug [overflow-wrap:anywhere] ${c.state === "BELOW_MIN" ? "font-bold text-[color:var(--color-danger)]" : c.state === "CANCELLED" ? "text-[color:var(--color-danger)]" : "text-[color:var(--color-ink-soft)]"}`}>{T.line2(c)}</span>
      {c.state !== "CANCELLED" && !compact ? <UsedBar used={c.used} capacity={c.capacity} /> : null}
    </Link>
  );
}

function NoneBox({ id, skipped }: { id: string; skipped: boolean }) {
  const t = useTranslations("trips");
  return (
    <div data-testid={`trips-cal-none-${id}`} className="flex min-h-[72px] flex-col items-center justify-center rounded-lg border border-dashed border-[color:var(--color-line)] px-1 py-1.5 text-center text-sm text-[color:var(--color-muted)]">
      <span>{t("departures.cell.noDeparture")}</span>
      {skipped ? <span>{t("departures.cell.skipped")}</span> : null}
    </div>
  );
}

function useNextTripText() {
  const t = useTranslations("trips");
  const D = useDepDates();
  return (p: DepartureCalendarVM["products"][number]) => {
    const n = p.nextTrip;
    if (!n) return t("departures.cell.noTrip");
    const dates = n.endDate !== n.localDate ? D.range(n.localDate, n.endDate) : D.full(n.localDate);
    return t("departures.cell.nextTrip", { dates, sold: n.sold, cap: n.capacity, unit: t(`departures.unit.${p.header.unitWord}`) });
  };
}

// ═══════════════ สัปดาห์: ตาราง (จอ ≥ md) ═══════════════
function WeekTable({ vm, base, q }: Props) {
  const t = useTranslations("trips");
  const D = useDepDates();
  const headerLine = useHeaderLine();
  const nextText = useNextTripText();
  const skipped = new Set(vm.emptyDays.map((e) => `${e.productId}|${e.localDate}`));
  const byKey = new Map<string, DepartureCellVM[]>();
  for (const c of vm.cells) byKey.set(`${c.productId}|${c.localDate}`, [...(byKey.get(`${c.productId}|${c.localDate}`) ?? []), c]);
  const rowHas = new Set(vm.cells.map((c) => c.productId));
  return (
    <div data-testid="trips-cal-week" className="relative hidden md:block min-w-0 overflow-x-auto">
      <table className="w-full min-w-[700px] table-fixed border-separate border-spacing-0.5">
        <colgroup>
          <col className="w-[152px]" />
          {vm.range.days.map((d) => (
            <col key={d} />
          ))}
        </colgroup>
        <thead>
          <tr>
            <th scope="col" className="p-1 text-left text-sm font-medium text-[color:var(--color-muted)]">
              {t("departures.productCol")}
            </th>
            {vm.range.days.map((d) => {
              const h = D.head(d);
              const isToday = d === vm.unit.today;
              return (
                <th key={d} scope="col" data-testid={`trips-cal-day-${d}`} className="p-1 text-left text-sm font-medium text-[color:var(--color-ink-soft)]">
                  <span className="whitespace-nowrap">
                    {h.wd} <b className="text-base text-[color:var(--color-ink)]">{h.d}</b>
                  </span>
                  {isToday ? <span className="ml-1 inline-block rounded border border-[color:var(--color-ink)] px-1 text-sm text-[color:var(--color-ink)]">{t("departures.today")}</span> : null}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {vm.products.map((p) => (
            <tr key={p.id} data-testid={`trips-cal-row-${p.id}`}>
              <th scope="row" className="rounded-lg border border-[color:var(--color-line)] p-2 text-left align-top">
                <span className="block text-sm font-bold leading-snug text-[color:var(--color-ink)] [overflow-wrap:anywhere]">{p.titleTh}</span>
                <span className="block text-sm font-normal leading-snug text-[color:var(--color-muted)] [overflow-wrap:anywhere]">{headerLine(p)}</span>
              </th>
              {!rowHas.has(p.id) && vm.emptyDays.every((e) => e.productId !== p.id) ? (
                <td colSpan={vm.range.days.length} className="align-middle">
                  <div data-testid={`trips-cal-next-trip-${p.id}`} className="flex min-h-[52px] items-center justify-center rounded-lg border border-dashed border-[color:var(--color-line)] px-3 py-2 text-center text-sm text-[color:var(--color-ink-soft)]">
                    {p.nextTrip ? (
                      <Link href={calHref(base, q, { dep: p.nextTrip.departureId, decide: false })} scroll={false} className="underline-offset-2 hover:underline">
                        {nextText(p)}
                      </Link>
                    ) : (
                      nextText(p)
                    )}
                  </div>
                </td>
              ) : (
                vm.range.days.map((d) => {
                  const list = byKey.get(`${p.id}|${d}`) ?? [];
                  return (
                    <td key={d} className="align-top">
                      {list.length ? (
                        <div className="flex flex-col gap-1">
                          {list.map((c) => (
                            <CellLink key={c.departureId} c={c} base={base} q={q} />
                          ))}
                        </div>
                      ) : vm.shownUntil !== null && d > vm.shownUntil ? null : (
                        <NoneBox id={`${p.id}-${d}`} skipped={skipped.has(`${p.id}|${d}`)} />
                      )}
                    </td>
                  );
                })
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ═══════════════ สัปดาห์: รายการต่อวัน (มือถือ) ═══════════════
function DayList({ vm, base, q }: Props) {
  const t = useTranslations("trips");
  const D = useDepDates();
  const nextText = useNextTripText();
  const titleOf = new Map(vm.products.map((p) => [p.id, p.titleTh]));
  const withoutCells = vm.products.filter((p) => !vm.cells.some((c) => c.productId === p.id));
  return (
    <div data-testid="trips-cal-daylist" className="flex min-w-0 flex-col gap-4 md:hidden">
      {vm.range.days.map((d) => {
        const list = vm.cells.filter((c) => c.localDate === d);
        const skips = vm.emptyDays.filter((e) => e.localDate === d);
        return (
          <div key={d} className="flex min-w-0 flex-col gap-2">
            <h3 className="flex items-center gap-2 text-sm font-bold text-[color:var(--color-ink)]">
              {D.short(d)}
              {d === vm.unit.today ? <span className="rounded border border-[color:var(--color-ink)] px-1 text-sm font-normal">{t("departures.today")}</span> : null}
            </h3>
            {list.length === 0 && skips.length === 0 ? <p className="text-sm text-[color:var(--color-muted)]">{t("departures.cell.noDeparture")}</p> : null}
            {list.map((c) => (
              <div key={c.departureId} className="flex min-w-0 flex-col gap-1">
                <span className="text-sm text-[color:var(--color-ink-soft)] [overflow-wrap:anywhere]">
                  {titleOf.get(c.productId) ?? ""} · {c.timeText}
                </span>
                <CellLink c={c} base={base} q={q} />
              </div>
            ))}
            {skips.map((e) => (
              <p key={e.productId} className="rounded-lg border border-dashed border-[color:var(--color-line)] px-3 py-2 text-sm text-[color:var(--color-muted)] [overflow-wrap:anywhere]">
                {titleOf.get(e.productId) ?? ""} · {t("departures.cell.noDeparture")} · {t("departures.cell.skipped")}
              </p>
            ))}
          </div>
        );
      })}
      {withoutCells.map((p) => (
        <p key={p.id} className="rounded-lg border border-dashed border-[color:var(--color-line)] px-3 py-2 text-sm text-[color:var(--color-ink-soft)] [overflow-wrap:anywhere]">
          <b className="text-[color:var(--color-ink)]">{p.titleTh}</b> · {nextText(p)}
        </p>
      ))}
    </div>
  );
}

// ═══════════════ เดือน ═══════════════
function MonthGrid({ vm, base, q }: Props) {
  const D = useDepDates();
  const T = useCellText();
  const t = useTranslations("trips");
  const month = vm.range.days[Math.floor(vm.range.days.length / 2)]?.slice(0, 7) ?? "";
  const titleOf = new Map(vm.products.map((p) => [p.id, p.titleTh]));
  const MAX = 3;
  return (
    <div data-testid="trips-cal-month" className="relative min-w-0 overflow-x-auto">
      <div className="grid min-w-0 grid-cols-7 gap-1">
        {D.mondayFirst.map((w) => (
          <div key={w} className="px-1 py-1 text-sm font-medium text-[color:var(--color-muted)]">
            {w}
          </div>
        ))}
        {vm.range.days.map((d) => {
          const list = vm.cells.filter((c) => c.localDate === d);
          const out = d.slice(0, 7) !== month;
          return (
            <div
              key={d}
              data-testid={`trips-cal-day-${d}`}
              className={`flex min-h-[64px] min-w-0 flex-col gap-1 rounded-lg border p-1 md:min-h-[96px] ${d === vm.unit.today ? "border-2 border-[color:var(--color-ink)]" : "border-[color:var(--color-line)]"} ${out ? "bg-[color:var(--color-surface-2)]" : ""}`}
            >
              <span className={`text-sm ${out ? "text-[color:var(--color-muted)]" : "font-bold text-[color:var(--color-ink)]"}`}>{Number(d.slice(8))}</span>
              {/* มือถือ: จุดแยกรูปทรงต่อรอบ + จำนวน */}
              {list.length ? (
                <span className="flex flex-wrap items-center gap-1 md:hidden">
                  {list.slice(0, 4).map((c) => (
                    <Link key={c.departureId} href={calHref(base, q, { dep: c.departureId, decide: false })} scroll={false} aria-label={`${titleOf.get(c.productId) ?? ""} ${T.line1(c)}`} className="inline-flex min-h-6 min-w-6 items-center justify-center">
                      <span aria-hidden="true" className={`block h-3 w-3 rounded-full ${dotShape(c.state)}`} style={c.state === "CANCELLED" ? { backgroundImage: "repeating-linear-gradient(135deg, var(--color-surface) 0px, var(--color-surface) 2px, var(--color-ink-soft) 2px, var(--color-ink-soft) 3px)" } : undefined} />
                    </Link>
                  ))}
                  {list.length > 4 ? <span className="text-sm text-[color:var(--color-muted)]">{t("departures.cell.more", { n: list.length - 4 })}</span> : null}
                </span>
              ) : null}
              {/* จอกว้าง: ช่องย่อ ใช้แล้ว/ความจุ */}
              <span className="hidden min-w-0 flex-col gap-1 md:flex">
                {list.slice(0, MAX).map((c) => (
                  <Link
                    key={c.departureId}
                    href={calHref(base, q, { dep: c.departureId, decide: false })}
                    scroll={false}
                    data-testid={`trips-cal-cell-${c.departureId}`}
                    data-state={c.state}
                    title={titleOf.get(c.productId) ?? ""}
                    className={`${cellShape(c.state, q.dep === c.departureId)} min-h-7 py-0.5 text-sm`}
                    style={cellStyle(c.state)}
                  >
                    <span className="truncate">
                      <b>{T.line1(c)}</b> {(titleOf.get(c.productId) ?? "").slice(0, 10)}
                    </span>
                  </Link>
                ))}
                {list.length > MAX ? <span className="text-sm text-[color:var(--color-muted)]">{t("departures.cell.more", { n: list.length - MAX })}</span> : null}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
function dotShape(state: DepartureCellVM["state"]): string {
  switch (state) {
    case "BELOW_MIN":
      return "border-2 border-dashed border-[color:var(--color-danger)]";
    case "FULL":
      return "border-[3px] border-[color:var(--color-ink)] bg-[color:var(--color-ink)]";
    case "CANCELLED":
      return "border border-[color:var(--color-ink-soft)]";
    case "PAST":
    case "DEPARTED_TODAY":
      return "bg-[color:var(--color-line)]";
    default:
      return "border border-[color:var(--color-ink)] bg-[color:var(--color-ink-soft)]";
  }
}

// ═══════════════ ทริปหลายวัน ═══════════════
function TripsList({ vm, base, q }: Props) {
  const t = useTranslations("trips");
  const D = useDepDates();
  return (
    <div data-testid="trips-cal-trips" className="flex min-w-0 flex-col gap-2">
      {vm.trips.length === 0 ? <p className="text-sm text-[color:var(--color-muted)]">{t("departures.tripsView.empty")}</p> : null}
      {vm.trips.map((x) => (
        <Link
          key={x.departureId}
          href={calHref(base, q, { dep: x.departureId, decide: false })}
          scroll={false}
          data-testid={`trips-cal-cell-${x.departureId}`}
          data-state={x.state}
          className={`${cellShape(x.state, q.dep === x.departureId)} min-h-11 flex-row flex-wrap items-center justify-between gap-x-4`}
          style={cellStyle(x.state)}
        >
          <span className="min-w-0 text-sm [overflow-wrap:anywhere]">
            <b className="text-[color:var(--color-ink)]">{x.titleTh}</b> · {D.range(x.localDate, x.endDate)}
          </span>
          <span className="text-sm text-[color:var(--color-ink-soft)]">
            <b className="text-base text-[color:var(--color-ink)]">{t("departures.cell.used", { used: x.sold + x.held, cap: x.capacity })}</b> · {t(`departures.state.${x.state}`)}
          </span>
        </Link>
      ))}
    </div>
  );
}
