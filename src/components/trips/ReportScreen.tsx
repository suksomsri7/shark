"use client";
// TRIPS T1.7a2 ▸ จอรายงานทัวร์ตามช่วงเวลา ฝั่งร้าน (ใบสั่ง §5 · ภาษาภาพเดียวกับจอต้นทุน)
//   หัว (กลับปฏิทิน · ชื่อ · ตัวเลขบริหาร · ยังไม่ลงบัญชี · ป้ายประมาณการ) → ตัวกรอง (ฟอร์ม GET) → แท็บ → KPI 6 ช่อง → เนื้อแท็บ → ตารางรอบแบ่งหน้า → ส่งออก
//   🔴 แสดงผลเท่านั้น — ทุกตัวเลขจาก VM (loadTripReportVM) · เงินผ่าน formatBaht · % ผ่าน pctText · บรรทัด VAT/คำว่า "ก่อน VAT" ตาม vatShown (Q11)
//   🔴 ไม่มี JavaScript ก็ใช้ได้: ตัวกรองเป็น <form method="get"> · แท็บ/ช่วงสำเร็จรูป/กลุ่ม/หน้า เป็นลิงก์ที่คงตัวกรอง (ไม่ใช้ hook ของ router)
//   🔴 ผู้ไม่เห็นต้นทุน: ไม่มี KPI/คอลัมน์ต้นทุน คอมมิชชัน กำไร และไม่มีข้อความรอบยังไม่หักต้นทุน (VM ให้ null)
//   🔴 390: KPI 2 คอลัมน์ · ตารางเป็นการ์ดต่อแถว · ไม่มีอะไรล้นจอ
import type { ReactNode } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { TripReportVM } from "@/lib/modules/trips";
import { CANCEL_STRIPES, SEG_OFF, SEG_ON, SEG_WRAP, useDepDates, useTitle } from "./DepartureParts";
import { BTN, BTN_PRIMARY } from "./ProductsScreenParts";
import { formatBaht } from "./trips-shared";
import { ESTIMATE_PILL, MGMT_LINE, WARN_LINE, bahtUnsigned, pctText, useMoneyWarnText, vatShown } from "./CostParts";
import ReportExport from "./ReportExport";

const CARD = "flex min-w-0 flex-col gap-3 rounded-2xl border border-[color:var(--color-line)] bg-[color:var(--color-surface)] p-4";
const H2 = "text-base font-bold text-[color:var(--color-ink)]";
const ROW = "flex min-w-0 flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2 text-sm";
const CELL = "whitespace-nowrap text-[color:var(--color-ink-soft)]";
const NUM = "tabular-nums text-[color:var(--color-ink)]";
const FIELD = "min-h-11 min-w-0 rounded-lg border border-[color:var(--color-line)] bg-[color:var(--color-surface)] px-3 text-sm text-[color:var(--color-ink)]";

type Patch = Partial<{ from: string; to: string; tab: string; group: string | null; page: number | null }>;
/** ลิงก์ที่คงตัวกรองปัจจุบัน (from · to · basis · product · channel · tab · group) — หน้ากลับเป็น 1 เว้นแต่ระบุ */
function linkOf(vm: TripReportVM, p: Patch & { keepGroup?: boolean }): string {
  const f = vm.filter;
  const sp = new URLSearchParams();
  sp.set("from", p.from ?? f.from);
  sp.set("to", p.to ?? f.to);
  if (f.basis !== "travel") sp.set("basis", f.basis);
  if (f.productId) sp.set("product", f.productId);
  if (f.channel) sp.set("channel", f.channel);
  sp.set("tab", p.tab ?? f.tab);
  const group = p.group !== undefined ? p.group : p.keepGroup ? f.group : null;
  if (group) sp.set("group", group);
  if (p.page && p.page > 1) sp.set("page", String(p.page));
  return `/app/u/${vm.unit.slug}/trips/reports?${sp.toString()}`;
}

function Kpi({ "data-testid": testid, label, value, danger, children }: { "data-testid": string; label: string; value: string; danger?: boolean; children?: ReactNode }) {
  return (
    <div data-testid={testid} data-negative={danger ? "1" : undefined} className="flex min-w-0 flex-col gap-1 rounded-2xl border border-[color:var(--color-line)] bg-[color:var(--color-surface)] p-4">
      <span className="text-sm text-[color:var(--color-muted)]">{label}</span>
      <b className={`flex min-w-0 items-center gap-1 text-lg font-bold leading-tight tabular-nums [overflow-wrap:anywhere] ${danger ? "text-[color:var(--color-danger)]" : "text-[color:var(--color-ink)]"}`}>
        {danger ? <span aria-hidden="true">▼</span> : null}
        {value}
      </b>
      {children ? <div className="flex min-w-0 flex-col gap-0.5 text-sm text-[color:var(--color-ink-soft)] [overflow-wrap:anywhere]">{children}</div> : null}
    </div>
  );
}

export default function ReportScreen({ vm, error }: { vm: TripReportVM; error: string | null }) {
  const t = useTranslations("trips");
  const D = useDepDates();
  const T = useTitle();
  const warnText = useMoneyWarnText();
  const f = vm.filter;
  const tot = vm.totals;
  const cv = vm.flags.costView;
  const noVat = !vatShown(tot);
  const money = (n: number | null) => (n === null ? "—" : formatBaht(n));
  const profitText = (gp: number | null) => (gp === null ? "—" : gp < 0 ? t("report.kpi.loss", { amount: bahtUnsigned(gp) }) : formatBaht(gp));
  const waitText = (w: { ended: number; upcoming: number } | null) => (w && w.ended + w.upcoming > 0 ? t("report.noCosts", { n: w.ended + w.upcoming, ended: w.ended, upcoming: w.upcoming }) : null);
  const kpiNote = waitText(tot.departuresWithoutCosts);
  const errorText = error === null ? null : error === "RANGE_TOO_LARGE" || error === "REPORT_TOO_LARGE" ? t(`errors.${error}`) : t("report.error.filter");
  const action = `/app/u/${vm.unit.slug}/trips/reports`;
  const empty = (tot.departures ?? 0) === 0 && tot.bookings === 0 && tot.cancelledBookings === 0 && tot.pendingRefundBookings === 0;
  const deps = vm.departures;

  return (
    <div data-testid="trips-rp" className="flex min-w-0 flex-col gap-4">
      {/* ── หัว ── */}
      <div className="flex min-w-0 flex-col gap-2">
        <nav className="flex min-w-0 flex-wrap items-center gap-x-1.5 text-sm text-[color:var(--color-muted)]">
          <Link data-testid="trips-rp-back" href={`/app/u/${vm.unit.slug}/trips/departures`} className="inline-flex min-h-11 items-center underline underline-offset-2">
            {t("report.back")}
          </Link>
        </nav>
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
          <h1 data-testid="trips-rp-title" className="min-w-0 text-xl font-bold text-[color:var(--color-ink)] [overflow-wrap:anywhere]">
            {t("report.title")}
          </h1>
          <span className="whitespace-nowrap text-sm text-[color:var(--color-ink-soft)]">{D.range(f.from, f.to)}</span>
          <span data-testid="trips-rp-estimate" className={ESTIMATE_PILL}>
            {t("report.estimate")}
          </span>
        </div>
        <p data-testid="trips-rp-mgmt" className={MGMT_LINE}>
          {t("report.mgmt")}
        </p>
        <p data-testid="trips-rp-accounting-note" className={MGMT_LINE}>
          {t("report.accounting")}
        </p>
      </div>

      {errorText ? (
        <p data-testid="trips-rp-error" role="alert" className="rounded-lg border border-[color:var(--color-danger)] px-3 py-2 text-sm text-[color:var(--color-danger)] [overflow-wrap:anywhere]">
          {errorText}
        </p>
      ) : null}

      {/* ── ตัวกรอง (ฟอร์ม GET · ใช้ได้โดยไม่มี JavaScript) ── */}
      <form data-testid="trips-rp-filters" method="get" action={action} aria-label={t("report.filter.aria")} className={CARD}>
        <input type="hidden" name="tab" value={f.tab} />
        <div className="flex min-w-0 flex-wrap items-end gap-3">
          <label className="flex min-w-0 flex-col gap-1 text-sm text-[color:var(--color-muted)]">
            {t("report.filter.from")}
            <input data-testid="trips-rp-from" type="date" name="from" defaultValue={f.from} className={FIELD} />
          </label>
          <label className="flex min-w-0 flex-col gap-1 text-sm text-[color:var(--color-muted)]">
            {t("report.filter.to")}
            <input data-testid="trips-rp-to" type="date" name="to" defaultValue={f.to} className={FIELD} />
          </label>
          <fieldset className="flex min-w-0 flex-col gap-1">
            <legend className="text-sm text-[color:var(--color-muted)]">{t("report.basis.label")}</legend>
            <div className="flex min-h-11 flex-wrap items-center gap-x-4 gap-y-1 text-sm text-[color:var(--color-ink)]">
              <label className="inline-flex items-center gap-1.5">
                <input data-testid="trips-rp-basis-travel" type="radio" name="basis" value="travel" defaultChecked={f.basis === "travel"} />
                {t("report.basis.travel")}
              </label>
              <label className="inline-flex items-center gap-1.5">
                <input data-testid="trips-rp-basis-booked" type="radio" name="basis" value="booked" defaultChecked={f.basis === "booked"} />
                {t("report.basis.booked")}
              </label>
            </div>
          </fieldset>
          <label className="flex min-w-0 max-w-full flex-col gap-1 text-sm text-[color:var(--color-muted)]">
            {t("report.filter.product")}
            <select data-testid="trips-rp-product" name="product" defaultValue={f.productId ?? ""} className={`${FIELD} max-w-full`}>
              <option value="">{t("report.filter.allProducts")}</option>
              {vm.products.map((p) => (
                <option key={p.id} value={p.id}>
                  {T(p.titleTh, p.titleEn)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex min-w-0 flex-col gap-1 text-sm text-[color:var(--color-muted)]">
            {t("report.filter.channel")}
            <select data-testid="trips-rp-channel" name="channel" defaultValue={f.channel ?? ""} className={FIELD}>
              <option value="">{t("report.filter.allChannels")}</option>
              {vm.channelOptions.map((c) => (
                <option key={c} value={c}>
                  {t(`report.channel.${c}`)}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" data-testid="trips-rp-apply" className={BTN_PRIMARY}>
            {t("report.filter.apply")}
          </button>
        </div>
        {vm.productsTruncated ? (
          <p data-testid="trips-rp-product-truncated" className={MGMT_LINE}>
            {t("report.products.truncated", { shown: vm.products.length, total: vm.productsTotal })}
          </p>
        ) : null}
        <nav aria-label={t("report.filter.presets")} className="flex min-w-0 flex-wrap gap-2">
          {vm.presets.map((p) => (
            <Link key={p.key} data-testid={`trips-rp-preset-${p.key}`} href={linkOf(vm, { from: p.from, to: p.to })} className={BTN}>
              {t(`report.preset.${p.key}`)}
            </Link>
          ))}
        </nav>
      </form>

      {/* ── แท็บ ── */}
      <nav aria-label={t("report.tab.aria")} className={SEG_WRAP}>
        {([
          ["sales", "trips-rp-tab-sales"],
          ["load", "trips-rp-tab-load"],
          ["lead", "trips-rp-tab-lead"],
          ["channel", "trips-rp-tab-channel"],
        ] as const).map(([k, testid]) => (
          <Link key={k} data-testid={testid} href={linkOf(vm, { tab: k, keepGroup: true })} aria-current={f.tab === k ? "page" : undefined} className={f.tab === k ? SEG_ON : SEG_OFF}>
            {t(`report.tab.${k}`)}
          </Link>
        ))}
      </nav>

      {/* ── ข้อความเงื่อนไข ── */}
      {vm.notes.basis ? (
        <p data-testid="trips-rp-basis-note" role="note" className={WARN_LINE}>
          {t("report.note.basis")}
        </p>
      ) : null}
      {vm.notes.channel ? (
        <p data-testid="trips-rp-channel-note" role="note" className={WARN_LINE}>
          {t("report.note.channel")}
        </p>
      ) : null}
      {tot.charterLikeDepartures !== null && tot.charterLikeDepartures > 0 ? (
        <p data-testid="trips-rp-charter-note" role="note" className={WARN_LINE}>
          {t("report.charter", { n: tot.charterLikeDepartures })}
        </p>
      ) : null}
      {vm.warnings.map((w) => (
        <p key={w.code} role="note" data-testid={`trips-rp-warn-${w.code}`} className={WARN_LINE}>
          {warnText(w)}
        </p>
      ))}

      {/* ── KPI ── */}
      <div data-testid="trips-rp-kpis" className="grid grid-cols-2 gap-3 xl:grid-cols-6">
        <Kpi data-testid="trips-rp-kpi-sales" label={t("report.kpi.sales")} value={formatBaht(tot.salesSatang)} />
        <Kpi data-testid="trips-rp-kpi-revenue" label={noVat ? t("report.kpi.revenueNoVat") : t("report.kpi.revenue")} value={formatBaht(tot.revenueExVatSatang)} />
        {cv ? (
          <Kpi data-testid="trips-rp-kpi-commission" label={t("report.kpi.commission")} value={money(tot.commissionCostSatang)}>
            {vm.flags.commissionWithVat ? <span>{t("report.kpi.commissionWithVat")}</span> : null}
          </Kpi>
        ) : null}
        {cv ? <Kpi data-testid="trips-rp-kpi-cost" label={t("report.kpi.cost")} value={tot.costRows ? money(tot.costSatang) : "—"} /> : null}
        {cv ? (
          <Kpi data-testid="trips-rp-kpi-profit" label={t("report.kpi.profit")} value={profitText(tot.grossProfitSatang)} danger={tot.grossProfitSatang !== null && tot.grossProfitSatang < 0}>
            {tot.marginBp !== null ? <span>{t("report.kpi.margin", { pct: pctText(tot.marginBp) })}</span> : null}
            {kpiNote ? <span data-testid="trips-rp-kpi-profit-note">{kpiNote}</span> : null}
          </Kpi>
        ) : null}
        <Kpi
          data-testid="trips-rp-kpi-load"
          label={t("report.kpi.load")}
          value={tot.capacity === null || tot.sold === null ? "—" : t("report.kpi.loadValue", { sold: tot.sold, capacity: tot.capacity, pct: pctText(tot.loadFactorBp) })}
        />
      </div>
      {noVat ? null : (
        <p data-testid="trips-rp-vat-line" className="text-sm text-[color:var(--color-ink-soft)] [overflow-wrap:anywhere]">
          {t("report.vat")} <b className={NUM}>{formatBaht(tot.vatSatang)}</b>
        </p>
      )}

      {empty ? (
        <p data-testid="trips-rp-empty" className="rounded-lg border border-dashed border-[color:var(--color-line)] px-3 py-6 text-center text-sm text-[color:var(--color-muted)]">
          {t("report.empty")}
        </p>
      ) : null}

      {/* ── เนื้อแท็บ ── */}
      {vm.periods ? (
        <section data-testid="trips-rp-periods" className={CARD}>
          <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
            <h2 className={H2}>{t("report.periods.title")}</h2>
            <nav aria-label={t("report.group.label")} className={SEG_WRAP}>
              {(["day", "week", "month"] as const)
                .filter((g) => g !== "day" || f.days <= 62)
                .map((g) => (
                  <Link key={g} data-testid={`trips-rp-group-${g}`} href={linkOf(vm, { group: g })} aria-current={f.group === g ? "page" : undefined} className={f.group === g ? SEG_ON : SEG_OFF}>
                    {t(`report.group.${g}`)}
                  </Link>
                ))}
            </nav>
          </div>
          <ul className="flex min-w-0 flex-col">
            {vm.periods.map((p, i) => {
              const note = waitText(p.departuresWithoutCosts);
              return (
                <li key={p.key} data-testid={`trips-rp-period-${i}`} className={`${ROW} ${i ? "border-t border-[color:var(--color-line)]" : ""}`}>
                  <b className="min-w-0 text-[color:var(--color-ink)] [overflow-wrap:anywhere]">{p.from === p.to ? D.short(p.from) : D.range(p.from, p.to)}</b>
                  <span className="flex min-w-0 flex-wrap gap-x-3 gap-y-0.5">
                    {p.departures !== null ? (
                      <span className={CELL}>
                        {t("report.periods.departures")} <b className={NUM}>{p.departures}</b>
                      </span>
                    ) : null}
                    <span className={CELL}>
                      {t("report.periods.bookings")} <b className={NUM}>{p.bookings}</b>
                    </span>
                    <span className={CELL}>
                      {t("report.periods.sales")} <b className={NUM}>{formatBaht(p.salesSatang)}</b>
                    </span>
                    {p.commissionCostSatang !== null ? (
                      <span className={CELL}>
                        {t("report.periods.commission")} <b className={NUM}>{formatBaht(p.commissionCostSatang)}</b>
                      </span>
                    ) : null}
                    {cv && p.costSatang !== null ? (
                      <span className={CELL}>
                        {t("report.periods.cost")} <b className={NUM}>{p.costRows ? formatBaht(p.costSatang) : "—"}</b>
                      </span>
                    ) : null}
                    {cv && p.costSatang !== null ? (
                      <span className={CELL}>
                        {t("report.periods.profit")} <b className={p.grossProfitSatang !== null && p.grossProfitSatang < 0 ? "tabular-nums text-[color:var(--color-danger)]" : NUM}>{profitText(p.grossProfitSatang)}</b>
                      </span>
                    ) : null}
                  </span>
                  {note ? (
                    <span data-testid={`trips-rp-period-note-${i}`} className="w-full text-sm text-[color:var(--color-muted)] [overflow-wrap:anywhere]">
                      {note}
                    </span>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {vm.load ? (
        <section data-testid="trips-rp-load" className={CARD}>
          <h2 className={H2}>{t("report.loadTab.title")}</h2>
          {vm.load.rows.length ? (
            <ul className="flex min-w-0 flex-col">
              {vm.load.rows.map((r, i) => (
                <li key={r.productId} data-testid={`trips-rp-load-${i}`} className={`${ROW} ${i ? "border-t border-[color:var(--color-line)]" : ""}`}>
                  <b className="min-w-0 text-[color:var(--color-ink)] [overflow-wrap:anywhere]">{T(r.titleTh, r.titleEn)}</b>
                  <span className="flex min-w-0 flex-wrap gap-x-3 gap-y-0.5">
                    <span className={CELL}>
                      {t("report.loadTab.departures")} <b className={NUM}>{r.departures}</b>
                    </span>
                    <span className={CELL}>
                      {t("report.loadTab.soldCapacity")} <b className={NUM}>{`${r.sold}/${r.capacity}`}</b>
                    </span>
                    <span className={CELL}>
                      {t("report.loadTab.pct")} <b className={NUM}>{pctText(r.loadFactorBp)}</b>
                    </span>
                    {r.charterLikeDepartures > 0 ? <span className={CELL}>{t("report.loadTab.charter", { n: r.charterLikeDepartures })}</span> : null}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-[color:var(--color-muted)]">{f.basis === "booked" || f.channel ? t("report.loadTab.none") : t("report.empty")}</p>
          )}
        </section>
      ) : null}

      {vm.lead ? (
        <section data-testid="trips-rp-lead" className={CARD}>
          <h2 className={H2}>{t("report.lead.title")}</h2>
          <p data-testid="trips-rp-lead-median" className="text-sm font-bold text-[color:var(--color-ink)]">
            {vm.lead.medianDays === null ? t("report.lead.medianNone") : t("report.lead.median", { n: vm.lead.medianDays })}
          </p>
          <ul className="flex min-w-0 flex-col">
            {vm.lead.buckets.map((b, i) => (
              <li key={b.key} data-testid={`trips-rp-lead-${b.key}`} className={`${ROW} ${i ? "border-t border-[color:var(--color-line)]" : ""}`}>
                <b className="min-w-0 text-[color:var(--color-ink)]">{t(`report.lead.${b.key}`)}</b>
                <span className="flex min-w-0 flex-wrap gap-x-3 gap-y-0.5">
                  <span className={CELL}>
                    {t("report.lead.bookings")} <b className={NUM}>{b.bookings}</b>
                  </span>
                  <span className={CELL}>
                    {t("report.lead.seats")} <b className={NUM}>{b.seats}</b>
                  </span>
                  <span className={CELL}>
                    {t("report.lead.sales")} <b className={NUM}>{formatBaht(b.salesSatang)}</b>
                  </span>
                </span>
              </li>
            ))}
          </ul>
          <p data-testid="trips-rp-lead-excluded" className={MGMT_LINE}>
            {t("report.lead.notCounted", { n: vm.lead.excludedImport })}
          </p>
          {vm.lead.excludedNegative > 0 ? (
            <p data-testid="trips-rp-lead-negative" className={MGMT_LINE}>
              {t("report.lead.negative", { n: vm.lead.excludedNegative })}
            </p>
          ) : null}
        </section>
      ) : null}

      {vm.channelsTab ? (
        <section data-testid="trips-rp-channels" className={CARD}>
          <h2 className={H2}>{t("report.channels.title")}</h2>
          {vm.channelsTab.groups.map((g) => (
            <div key={g.group} data-testid={`trips-rp-chgroup-${g.group}`} className="flex min-w-0 flex-col border-t border-[color:var(--color-line)] pt-2 first:border-t-0 first:pt-0">
              <div className={ROW}>
                <b className="min-w-0 text-[color:var(--color-ink)]">{t(`report.chgroup.${g.group}`)}</b>
                <span className="flex min-w-0 flex-wrap gap-x-3 gap-y-0.5">
                  <span className={CELL}>
                    {t("report.channels.bookings")} <b className={NUM}>{g.bookings}</b>
                  </span>
                  <span className={CELL}>
                    {t("report.channels.sales")} <b className={NUM}>{formatBaht(g.salesSatang)}</b>
                  </span>
                  {g.shareBp !== null ? (
                    <span className={CELL}>
                      {t("report.channels.share")} <b className={NUM}>{pctText(g.shareBp)}</b>
                    </span>
                  ) : null}
                  {g.commissionCostSatang !== null ? (
                    <span className={CELL}>
                      {t("report.channels.commission")} <b className={NUM}>{formatBaht(g.commissionCostSatang)}</b>
                    </span>
                  ) : null}
                </span>
              </div>
              <ul className="flex min-w-0 flex-col pl-3">
                {g.channels.map((c) => (
                  <li key={c.channel} data-testid={`trips-rp-ch-${c.channel}`} className={ROW}>
                    <span className="min-w-0 text-[color:var(--color-ink)] [overflow-wrap:anywhere]">{t(`report.channel.${c.channel}`)}</span>
                    <span className="flex min-w-0 flex-wrap gap-x-3 gap-y-0.5">
                      <span className={CELL}>
                        {t("report.channels.bookings")} <b className={NUM}>{c.bookings}</b>
                      </span>
                      <span className={CELL}>
                        {t("report.channels.seats")} <b className={NUM}>{c.seats}</b>
                      </span>
                      <span className={CELL}>
                        {t("report.channels.sales")} <b className={NUM}>{formatBaht(c.salesSatang)}</b>
                      </span>
                      {c.shareBp !== null ? (
                        <span className={CELL}>
                          {t("report.channels.share")} <b className={NUM}>{pctText(c.shareBp)}</b>
                        </span>
                      ) : null}
                      {c.cancelledBookings > 0 ? (
                        <span className={CELL}>
                          {t("report.channels.cancelled")} <b className={NUM}>{c.cancelledBookings}</b>
                        </span>
                      ) : null}
                      {c.commissionCostSatang !== null && c.commissionCostSatang !== 0 ? (
                        <span className={CELL}>
                          {t("report.channels.commission")} <b className={NUM}>{formatBaht(c.commissionCostSatang)}</b>
                        </span>
                      ) : null}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      ) : null}

      {/* ── ตารางรอบ (ฐานวันเดินทาง · ไม่กรองช่องทาง) ── */}
      {deps ? (
        <section data-testid="trips-rp-deps" className={CARD}>
          <h2 className={H2}>{t("report.deps.title")}</h2>
          <ul className="flex min-w-0 flex-col">
            {deps.rows.map((r, i) => (
              <li key={r.departureId} data-testid={`trips-rp-dep-${i}`} className={`${ROW} ${i ? "border-t border-[color:var(--color-line)]" : ""}`}>
                <span className="flex min-w-0 flex-col gap-0.5">
                  <b className="min-w-0 text-[color:var(--color-ink)] [overflow-wrap:anywhere]">
                    {D.short(r.localDate)} · {r.timeText} · {T(r.titleTh, r.titleEn)}
                    {r.optionTh ? ` · ${T(r.optionTh, r.optionEn)}` : ""}
                  </b>
                  <span className="flex min-w-0 flex-wrap items-center gap-2">
                    <span
                      data-state={r.state}
                      className={`inline-flex items-center whitespace-nowrap rounded-md border px-2 py-0.5 text-sm ${r.state === "CANCELLED" ? "border-[color:var(--color-line)] text-[color:var(--color-danger)]" : "border-[color:var(--color-line)] text-[color:var(--color-ink-soft)]"}`}
                      style={r.state === "CANCELLED" ? CANCEL_STRIPES : undefined}
                    >
                      {t(`costs.state.${r.state}`)}
                    </span>
                    <span className={ESTIMATE_PILL}>{t("report.estimate")}</span>
                    <Link data-testid={`trips-rp-dep-link-${i}`} href={`/app/u/${vm.unit.slug}/trips/departures?view=week&start=${r.localDate}&dep=${encodeURIComponent(r.departureId)}`} className="inline-flex min-h-11 items-center text-sm underline underline-offset-2">
                      {t("report.deps.open")}
                    </Link>
                  </span>
                </span>
                <span className="flex min-w-0 flex-wrap gap-x-3 gap-y-0.5">
                  <span className={CELL}>
                    {t("report.dep.load")} <b className={NUM}>{r.state === "CANCELLED" ? "—" : `${r.sold}/${r.capacity} · ${pctText(r.loadFactorBp)}`}</b>
                  </span>
                  <span className={CELL}>
                    {t("report.dep.sales")} <b className={NUM}>{formatBaht(r.salesSatang)}</b>
                  </span>
                  <span className={CELL}>
                    {t("report.dep.collected")} <b className={NUM}>{formatBaht(r.collectedSatang)}</b>
                  </span>
                  <span className={CELL}>
                    {t("report.dep.outstanding")} <b className={NUM}>{formatBaht(r.outstandingSatang)}</b>
                  </span>
                  {cv ? (
                    <span className={CELL}>
                      {t("report.dep.cost")} <b className={NUM}>{r.noCosts === true ? "—" : money(r.costSatang)}</b>
                    </span>
                  ) : null}
                  {cv ? (
                    <span className={CELL}>
                      {t("report.dep.profit")} <b className={r.grossProfitSatang !== null && r.grossProfitSatang < 0 ? "tabular-nums text-[color:var(--color-danger)]" : NUM}>{profitText(r.grossProfitSatang)}</b>
                    </span>
                  ) : null}
                </span>
                {/* J4: ข้อความยาวอยู่นอกเซลล์ห้ามตัดบรรทัด — ที่ 390 ขึ้นบรรทัดใหม่ได้ */}
                {cv && r.noCosts === true && r.state !== "CANCELLED" ? <span className="w-full text-sm text-[color:var(--color-muted)] [overflow-wrap:anywhere]">({t("report.dep.noCosts")})</span> : null}
              </li>
            ))}
          </ul>
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <span data-testid="trips-rp-page" className="text-sm text-[color:var(--color-ink-soft)]">
              {t("report.page", { page: deps.page, pageCount: deps.pageCount })}
            </span>
            {deps.page > 1 ? (
              <Link data-testid="trips-rp-page-prev" href={linkOf(vm, { page: deps.page - 1, keepGroup: true })} className={BTN}>
                {t("report.prev")}
              </Link>
            ) : null}
            {deps.page < deps.pageCount ? (
              <Link data-testid="trips-rp-page-next" href={linkOf(vm, { page: deps.page + 1, keepGroup: true })} className={BTN}>
                {t("report.next")}
              </Link>
            ) : null}
          </div>
        </section>
      ) : null}

      {/* ── ส่งออก ── */}
      {vm.flags.exportAvailable ? (
        <ReportExport vm={vm} />
      ) : (
        <p data-testid="trips-rp-export-note" className={MGMT_LINE}>
          {t("report.export.unavailable")}
        </p>
      )}
    </div>
  );
}
