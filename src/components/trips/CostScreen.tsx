"use client";
// TRIPS T1.7a1 ▸ จอ "ต้นทุนและกำไรของรอบ" ฝั่งร้าน (ใบสั่ง T1.7 §5.2 · ไม่มีภาพออกแบบ — ผังตามใบสั่ง · ภาษาภาพเดียวกับจอใบรายชื่อ)
//   หัว (กลับปฏิทิน · ชื่อ · สถานะรอบ · ป้ายประมาณการ) · บรรทัดตัวเลขบริหาร · การ์ด 6 ใบ · ที่มาของกำไร · คำเตือน · ตัวแก้ต้นทุน/รายการอ่านอย่างเดียว · ยอดตามช่องทาง
//   🔴 แสดงผลเท่านั้น — ทุกตัวเลขจาก VM (loadDepartureCostsVM) · เงินผ่าน formatBaht · % ผ่าน pctText ตัวเดียว · ร้านไม่จด VAT ⇒ ไม่มีบรรทัด VAT/คำว่า "ก่อน VAT"
//   🔴 390: การ์ด 2 คอลัมน์ · ตัวแก้เป็นการ์ดต่อแถว · ไม่มีอะไรล้นจอ
import type { ReactNode } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { DepartureCostsVM } from "@/lib/modules/trips";
import { CANCEL_STRIPES, useDepDates, useTitle } from "./DepartureParts";
import { formatBaht } from "./trips-shared";
import { ESTIMATE_PILL, MGMT_LINE, WARN_LINE, pctText, useMoneyWarnText } from "./CostParts";
import CostEditor, { CostRowsReadOnly } from "./CostEditor";

const CARD = "flex min-w-0 flex-col gap-3 rounded-2xl border border-[color:var(--color-line)] bg-[color:var(--color-surface)] p-4";
const H2 = "text-base font-bold text-[color:var(--color-ink)]";

function kpiSize(value: string): string {
  const n = value.length;
  if (n <= 9) return "text-xl";
  if (n <= 12) return "text-lg";
  if (n <= 14) return "text-base";
  return "text-sm";
}
function Kpi({ "data-testid": testid, label, value, danger, children }: { "data-testid": string; label: string; value: string; danger?: boolean; children?: ReactNode }) {
  return (
    <div data-testid={testid} data-negative={danger ? "1" : undefined} className="flex min-w-0 flex-col gap-1 rounded-2xl border border-[color:var(--color-line)] bg-[color:var(--color-surface)] p-4">
      <span className="text-sm text-[color:var(--color-muted)]">{label}</span>
      <b className={`${kpiSize(value)} flex items-center gap-1 whitespace-nowrap font-bold leading-tight tabular-nums ${danger ? "text-[color:var(--color-danger)]" : "text-[color:var(--color-ink)]"}`}>
        {danger ? <span aria-hidden="true">▼</span> : null}
        {value}
      </b>
      {children ? <div className="flex min-w-0 flex-col gap-0.5 text-sm text-[color:var(--color-ink-soft)] [overflow-wrap:anywhere]">{children}</div> : null}
    </div>
  );
}
/** แถวของที่มาของกำไร — ป้ายซ้าย ยอดขวา (เครื่องหมายเป็นข้อความ ไม่ใช่การคิด) */
function Line({ label, value, sign, strong, danger, testid }: { label: string; value: string; sign?: "−" | "="; strong?: boolean; danger?: boolean; testid?: string }) {
  return (
    <div data-testid={testid} className={`flex min-w-0 items-baseline justify-between gap-3 py-1.5 text-sm ${strong ? "border-t border-[color:var(--color-line)] font-bold" : ""}`}>
      <span className="min-w-0 text-[color:var(--color-ink-soft)] [overflow-wrap:anywhere]">
        {sign ? <span aria-hidden="true" className="mr-1 inline-block w-3 text-[color:var(--color-ink)]">{sign}</span> : null}
        {label}
      </span>
      <b className={`shrink-0 whitespace-nowrap tabular-nums ${danger ? "text-[color:var(--color-danger)]" : "text-[color:var(--color-ink)]"}`}>{value}</b>
    </div>
  );
}

export default function CostScreen({ vm }: { vm: DepartureCostsVM }) {
  const t = useTranslations("trips");
  const D = useDepDates();
  const T = useTitle();
  const warnText = useMoneyWarnText();
  const d = vm.departure;
  const m = vm.money;
  const noVat = m.vatMode === "NOT_REGISTERED";
  const base = `/app/u/${vm.unit.slug}/trips/departures`;
  const backHref = `${base}?view=week&start=${d.localDate}&dep=${encodeURIComponent(d.id)}`;
  const title = T(d.titleTh, d.titleEn);
  const gp = m.grossProfitSatang ?? 0;
  const loss = gp < 0;
  const vatNote = m.vatMode === "REGISTERED" ? t("costs.editor.vatNote.registered") : m.vatMode === "NOT_REGISTERED" ? t("costs.editor.vatNote.notRegistered") : t("costs.editor.vatNote.unknown");
  const money = (n: number | null) => (n === null ? "—" : formatBaht(n));

  return (
    <div data-testid="trips-cost" className="flex min-w-0 flex-col gap-4">
      {/* ── หัว ── */}
      <div className="flex min-w-0 flex-col gap-2">
        <nav className="flex min-w-0 flex-wrap items-center gap-x-1.5 text-sm text-[color:var(--color-muted)]">
          <Link data-testid="trips-cost-back" href={backHref} className="inline-flex min-h-11 items-center underline underline-offset-2">
            {t("costs.back")}
          </Link>
          <span aria-hidden="true">›</span>
          <span className="whitespace-nowrap">{D.full(d.localDate)}</span>
        </nav>
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
          <h1 data-testid="trips-cost-title" className="min-w-0 text-xl font-bold text-[color:var(--color-ink)] [overflow-wrap:anywhere]">
            {t("costs.title", { title })}
          </h1>
          <span
            data-testid="trips-cost-state"
            data-state={d.state}
            className={`inline-flex items-center whitespace-nowrap rounded-md border px-2 py-0.5 text-sm ${d.state === "CANCELLED" ? "border-[color:var(--color-line)] text-[color:var(--color-danger)]" : d.state === "ENDED" ? "border-transparent bg-[color:var(--color-surface-2)] text-[color:var(--color-muted)]" : "border-[color:var(--color-ink)] text-[color:var(--color-ink)]"}`}
            style={d.state === "CANCELLED" ? CANCEL_STRIPES : undefined}
          >
            {t(`costs.state.${d.state}`)}
          </span>
          <span data-testid="trips-cost-estimate" className={ESTIMATE_PILL}>
            {t("costs.estimate")}
          </span>
        </div>
        <p className="text-sm text-[color:var(--color-ink-soft)] [overflow-wrap:anywhere]">
          {D.short(d.localDate)} · {d.timeText}
          {d.optionTh ? ` · ${T(d.optionTh, d.optionEn)}` : ""}
        </p>
        <p data-testid="trips-cost-mgmt" className={MGMT_LINE}>
          {t("costs.mgmt")}
        </p>
        <p data-testid="trips-cost-accounting-note" className={MGMT_LINE}>
          {t("costs.accounting")}
        </p>
      </div>

      {/* ── การ์ด 6 ใบ ── */}
      <div data-testid="trips-cost-kpis" className="grid grid-cols-2 gap-3 xl:grid-cols-6">
        <Kpi data-testid="trips-cost-kpi-sales" label={t("costs.kpi.sales")} value={formatBaht(m.salesSatang)} />
        <Kpi data-testid="trips-cost-kpi-revenue" label={noVat ? t("costs.kpi.revenueNoVat") : t("costs.kpi.revenue")} value={formatBaht(m.revenueExVatSatang)} />
        <Kpi data-testid="trips-cost-kpi-commission" label={t("costs.kpi.commission")} value={money(m.commissionCostSatang)} />
        <Kpi data-testid="trips-cost-kpi-cost" label={t("costs.kpi.cost")} value={money(m.costSatang)}>
          {vm.costs.perSeatSatang !== null ? <span>{t("costs.kpi.perSeat", { amount: formatBaht(vm.costs.perSeatSatang) })}</span> : null}
        </Kpi>
        <Kpi data-testid="trips-cost-kpi-profit" label={t("costs.kpi.profit")} value={money(m.grossProfitSatang)} danger={loss}>
          {loss ? <span className="text-[color:var(--color-danger)]">{t("costs.kpi.loss")}</span> : m.marginBp !== null ? <span>{pctText(m.marginBp)}</span> : null}
        </Kpi>
        <Kpi data-testid="trips-cost-kpi-load" label={t("costs.kpi.load")} value={t("costs.kpi.loadValue", { sold: m.sold, capacity: m.capacity, pct: pctText(m.loadFactorBp) })}>
          {m.charterLike ? (
            <span data-testid="trips-cost-charter" className="rounded-md border border-dashed border-[color:var(--color-line)] px-2 py-0.5">
              {t("costs.charter")}
            </span>
          ) : null}
        </Kpi>
      </div>

      {m.warnings.length ? (
        <div className="flex min-w-0 flex-col gap-2">
          {m.warnings.map((w) => (
            <p key={w.code} role="note" data-testid={`trips-cost-warn-${w.code}`} className={WARN_LINE}>
              {warnText(w)}
            </p>
          ))}
        </div>
      ) : null}

      <div className="grid min-w-0 grid-cols-1 gap-4 xl:grid-cols-2">
        {/* ── ที่มาของกำไร ── */}
        <section data-testid="trips-cost-breakdown" className={CARD}>
          <h2 className={H2}>{t("costs.breakdown.title")}</h2>
          <div className="flex min-w-0 flex-col">
            <Line label={t("costs.breakdown.sales")} value={formatBaht(m.salesSatang)} />
            {noVat ? null : <Line testid="trips-cost-vat-line" sign="−" label={t("costs.breakdown.vat")} value={formatBaht(m.vatSatang)} />}
            <Line strong label={noVat ? t("costs.breakdown.revenueNoVat") : t("costs.breakdown.revenue")} value={formatBaht(m.revenueExVatSatang)} />
            <Line sign="−" label={noVat ? t("costs.breakdown.commissionWithVat") : t("costs.breakdown.commission")} value={money(m.commissionCostSatang)} />
            <Line sign="−" label={t("costs.breakdown.cost")} value={money(m.costSatang)} />
            <Line strong sign="=" danger={loss} label={noVat ? t("costs.breakdown.profitNoVat") : t("costs.breakdown.profit")} value={money(m.grossProfitSatang)} />
          </div>
          <h3 className="pt-1 text-sm font-bold text-[color:var(--color-ink)]">{t("costs.breakdown.split")}</h3>
          <div className="flex min-w-0 flex-col">
            <Line label={t("costs.breakdown.passThrough")} value={formatBaht(m.passThroughSatang)} />
            <Line label={t("costs.breakdown.collected")} value={formatBaht(m.collectedSatang)} />
            <Line label={t("costs.breakdown.outstanding")} value={formatBaht(m.outstandingSatang)} />
            {m.agentCollectBookings > 0 ? <Line label={t("costs.breakdown.agentCollect", { n: m.agentCollectBookings })} value="" /> : null}
            {m.pendingRefundBookings > 0 ? <Line danger label={t("costs.breakdown.pendingRefund", { n: m.pendingRefundBookings })} value={formatBaht(m.heldSatang)} /> : null}
            {m.cancelledBookings > 0 ? <Line label={t("costs.breakdown.retained", { n: m.cancelledBookings, amount: formatBaht(m.retainedSatang) })} value="" /> : null}
            {m.noShowUnpaid > 0 ? <Line label={t("costs.breakdown.noShow", { n: m.noShowUnpaid })} value="" /> : null}
            {m.pendingBookings > 0 ? <Line label={t("costs.breakdown.pendingHold", { n: m.pendingBookings })} value="" /> : null}
          </div>
        </section>

        {/* ── ต้นทุนของรอบ ── */}
        <section className={CARD}>
          <h2 className={H2}>{t("costs.editor.title")}</h2>
          {vm.flags.canEdit ? <CostEditor key={vm.costs.token} vm={vm} /> : <CostRowsReadOnly vm={vm} />}
          <p data-testid="trips-cost-vat-note" className={MGMT_LINE}>
            {vatNote}
          </p>
        </section>
      </div>

      {/* ── ยอดตามช่องทาง ── */}
      <section data-testid="trips-cost-channels" className={CARD}>
        <h2 className={H2}>{t("costs.channels.title")}</h2>
        {vm.channels.length ? (
          <ul className="flex min-w-0 flex-col">
            {vm.channels.map((c, i) => (
              <li key={c.channel} className={`flex min-w-0 flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2 text-sm ${i ? "border-t border-[color:var(--color-line)]" : ""}`}>
                <b className="min-w-0 text-[color:var(--color-ink)] [overflow-wrap:anywhere]">{t(`departures.channel.${c.channel}`)}</b>
                <span className="flex min-w-0 flex-wrap gap-x-3 gap-y-0.5 text-[color:var(--color-ink-soft)]">
                  <span className="whitespace-nowrap">
                    {t("costs.channels.bookings")} {c.bookings}
                  </span>
                  <span className="whitespace-nowrap">
                    {t("costs.channels.seats")} {c.seats}
                  </span>
                  <span className="whitespace-nowrap">
                    {t("costs.channels.sales")} <b className="tabular-nums text-[color:var(--color-ink)]">{formatBaht(c.salesSatang)}</b>
                  </span>
                  {c.commissionCostSatang > 0 ? (
                    <span className="whitespace-nowrap">
                      {t("costs.channels.commission")} <b className="tabular-nums text-[color:var(--color-ink)]">{formatBaht(c.commissionCostSatang)}</b>
                    </span>
                  ) : null}
                  {c.cancelledBookings > 0 ? (
                    <span className="whitespace-nowrap">
                      {t("costs.channels.cancelled")} {c.cancelledBookings}
                    </span>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-[color:var(--color-muted)]">{t("costs.channels.none")}</p>
        )}
      </section>
    </div>
  );
}
