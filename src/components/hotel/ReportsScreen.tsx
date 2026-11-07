"use client";
// SVC H.7 ▸ จอ "รายงานโรงแรม" (ใบสั่ง h.7 §4 · PARITY โครงกับรายงานหอ dorm/reports) — KPI 4 การ์ด · ตัวกรองช่วง/กลุ่ม · แท็บ
//   อัตราเข้าพัก (กราฟเส้น SVG + ตาราง) · รายได้ตามแหล่ง/แผน/ประเภท · การจอง (ฟันเนล) · ล่วงหน้า 30 วัน (แถบ) · แม่บ้าน · มัดจำ · ปุ่ม CSV ทุกตาราง
//   ข้อมูลทั้งหมดมาจากหน้า (RSC อ่านรายงานจาก facade) · ไฟล์นี้ import จากโมดูลได้เฉพาะ type · ไม่มีข้อมูลแขก
import { useState } from "react";
import type { DepositsReport, ForecastReport, FunnelReport, HousekeepingReport, OccupancyReport, RevenueReport, UnitKpi } from "@/lib/modules/hotel";
import KpiCards from "./KpiCards";
import ReportTable from "./ReportTable";
import ForecastChart from "./ForecastChart";
import { REPORT_TABS, REVENUE_GROUPS, exportHref, fmtBaht, fmtInt, fmtThaiDate, type ReportColumn, type ReportTabKey } from "./reports-shared";

export type ReportsScreenProps = {
  base: string;
  tab: ReportTabKey;
  from: string;
  to: string;
  groupBy: string;
  canAudit: boolean;
  pendingAudit: string | null;
  kpi: UnitKpi | null;
  summary: OccupancyReport["total"] | null;
  occupancy: OccupancyReport | null;
  revenue: RevenueReport | null;
  funnel: FunnelReport | null;
  forecast: ForecastReport | null;
  housekeeping: HousekeepingReport | null;
  deposits: DepositsReport | null;
};

const SOFT = "text-[color:var(--color-ink-soft)]";
const CARD = "min-w-0 rounded-2xl border border-[color:var(--color-line)] bg-[color:var(--color-surface)]";

const OCC_COLS: ReportColumn[] = [
  { key: "label", label: "ช่วง", kind: "text" },
  { key: "occupied", label: "ห้องที่มีแขก", kind: "int" },
  { key: "available", label: "ห้องขายได้", kind: "int" },
  { key: "occupancyBps", label: "อัตราเข้าพัก", kind: "pct" },
  { key: "revenueSatang", label: "รายได้ห้อง", kind: "baht" },
  { key: "adrSatang", label: "ADR", kind: "baht" },
  { key: "revparSatang", label: "RevPAR", kind: "baht" },
  { key: "state", label: "สถานะ", kind: "text" },
];
const REV_COLS: ReportColumn[] = [
  { key: "label", label: "กลุ่ม", kind: "text" },
  { key: "roomRevenueSatang", label: "รายได้ห้อง", kind: "baht" },
  { key: "otherRevenueSatang", label: "รายได้อื่น (บริการ · มินิบาร์ · ลงห้อง)", kind: "baht" },
  { key: "totalSatang", label: "รวม", kind: "baht" },
];
const FUNNEL_COLS: ReportColumn[] = [
  { key: "label", label: "แหล่งจอง", kind: "text" },
  { key: "created", label: "จอง", kind: "int" },
  { key: "confirmed", label: "ยืนยัน", kind: "int" },
  { key: "cancelled", label: "ยกเลิก", kind: "int" },
  { key: "noShow", label: "ไม่มา", kind: "int" },
  { key: "confirmRateBps", label: "อัตรายืนยัน", kind: "pct" },
  { key: "cancelRateBps", label: "อัตรายกเลิก", kind: "pct" },
  { key: "leadTimeDaysAvg", label: "จองล่วงหน้า (วัน)", kind: "num" },
  { key: "alosNights", label: "พักเฉลี่ย (คืน)", kind: "num" },
];
const FORECAST_COLS: ReportColumn[] = [
  { key: "label", label: "วันที่", kind: "text" },
  { key: "onBooks", label: "ห้องที่จองแล้ว", kind: "int" },
  { key: "available", label: "ห้องขายได้", kind: "int" },
  { key: "occupancyBps", label: "อัตราเข้าพัก", kind: "pct" },
];
const HK_DAY_COLS: ReportColumn[] = [
  { key: "label", label: "วันที่", kind: "text" },
  { key: "cleaned", label: "ห้องที่ทำเสร็จ", kind: "int" },
];
const HK_USER_COLS: ReportColumn[] = [
  { key: "name", label: "พนักงาน", kind: "text" },
  { key: "cleaned", label: "ห้องที่ทำเสร็จ", kind: "int" },
];

export default function ReportsScreen(p: ReportsScreenProps) {
  const [from, setFrom] = useState(p.from);
  const [to, setTo] = useState(p.to);
  const q = { from: p.from, to: p.to };
  const tabHref = (t: ReportTabKey) => `${p.base}/hotel/reports?tab=${t}&from=${p.from}&to=${p.to}`;
  const rangeLabel = `${fmtThaiDate(p.from)} – ${fmtThaiDate(p.to)}`;
  const s = p.summary;
  const hasReasons = p.funnel ? p.funnel.rows.some((r) => { return r.cancelReasons.length > 0; }) : false;
  return (
    <div data-hotel-reports="" data-tab={p.tab} className="flex min-w-0 flex-col gap-5">
      <header className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold">รายงานโรงแรม</h1>
        <span className="flex-1" />
        {p.canAudit ? (
          <a href={`${p.base}/hotel/reports/audit`} className="flex min-h-[44px] items-center rounded-xl border border-[color:var(--color-line)] px-4 text-sm font-medium">
            {p.pendingAudit ? `ปิดวัน · ค้าง ${fmtThaiDate(p.pendingAudit)}` : "ปิดวัน (night audit)"}
          </a>
        ) : null}
      </header>

      <KpiCards
        occupancyTodayBps={p.kpi?.occupancyTodayBps ?? 0}
        arrivalsToday={p.kpi?.arrivalsToday ?? 0}
        roomRevenueYesterdaySatang={p.kpi?.roomRevenueYesterdaySatang ?? 0}
        adrSatang={s?.adrSatang ?? 0}
        revparSatang={s?.revparSatang ?? 0}
        rangeLabel={rangeLabel}
      />

      <form method="get" className={`${CARD} flex flex-wrap items-end gap-3 p-4`}>
        <input type="hidden" name="tab" value={p.tab} />
        {p.tab === "revenue" ? <input type="hidden" name="groupBy" value={p.groupBy} /> : null}
        {p.tab === "occupancy" ? (
          <label className="flex flex-col gap-1 text-sm">
            <span className={SOFT}>จัดกลุ่ม</span>
            <select name="groupBy" defaultValue={p.groupBy === "month" ? "month" : "day"} className="min-h-[44px] rounded-xl border border-[color:var(--color-line)] px-3">
              <option value="day">รายวัน</option>
              <option value="month">รายเดือน</option>
            </select>
          </label>
        ) : null}
        <label className="flex flex-col gap-1 text-sm">
          <span className={SOFT}>ตั้งแต่</span>
          <input type="date" name="from" value={from} onChange={(e) => setFrom(e.target.value)} className="min-h-[44px] rounded-xl border border-[color:var(--color-line)] px-3" />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className={SOFT}>ถึง</span>
          <input type="date" name="to" value={to} min={from} onChange={(e) => setTo(e.target.value)} className="min-h-[44px] rounded-xl border border-[color:var(--color-line)] px-3" />
        </label>
        <button type="submit" className="min-h-[44px] rounded-xl bg-[color:var(--color-ink)] px-4 text-sm font-semibold text-[color:var(--color-surface)]">
          แสดง
        </button>
        <span className={`text-xs ${SOFT}`}>เลือกได้ไม่เกิน 366 วัน · วันที่ปิดแล้วใช้ตัวเลขจากการปิดวัน วันที่ยังไม่ปิดคำนวณสด</span>
      </form>

      <nav aria-label="ชนิดรายงาน" data-scroll-hint="" className="flex overflow-x-auto rounded-xl border border-[color:var(--color-line)] bg-[color:var(--color-surface-2)] p-1">
        {REPORT_TABS.map((t) => (
          <a
            key={t.key}
            href={tabHref(t.key)}
            aria-current={t.key === p.tab ? "page" : undefined}
            data-report-tab={t.key}
            className={`flex min-h-[40px] shrink-0 items-center whitespace-nowrap rounded-lg px-4 text-sm ${t.key === p.tab ? "bg-[color:var(--color-surface)] font-semibold shadow-sm" : SOFT}`}
          >
            {t.label}
          </a>
        ))}
      </nav>

      {p.tab === "occupancy" && p.occupancy ? (
        <>
          <ForecastChart title="อัตราเข้าพัก" mode="line" points={p.occupancy.rows.map((r) => ({ key: r.period, label: fmtThaiDate(r.period), bps: r.occupancyBps }))} />
          <ReportTable
            title={p.occupancy.groupBy === "month" ? "อัตราเข้าพักรายเดือน" : "อัตราเข้าพักรายวัน"}
            columns={OCC_COLS}
            rowKey="period"
            rows={p.occupancy.rows.map((r) => ({ ...r, label: fmtThaiDate(r.period), state: r.closed ? "ปิดวันแล้ว" : "ยังไม่ปิด (สด)" }))}
            csvHref={exportHref(p.base, "occupancy", { ...q, groupBy: p.occupancy.groupBy })}
          />
        </>
      ) : null}

      {p.tab === "revenue" && p.revenue ? (
        <>
          <nav aria-label="จัดกลุ่มรายได้" className="flex flex-wrap gap-2">
            {REVENUE_GROUPS.map((g) => (
              <a
                key={g.key}
                href={`${p.base}/hotel/reports?tab=revenue&groupBy=${g.key}&from=${p.from}&to=${p.to}`}
                aria-current={g.key === p.revenue?.groupBy ? "page" : undefined}
                className={`flex min-h-[40px] items-center rounded-xl border border-[color:var(--color-line)] px-3 text-sm ${g.key === p.revenue?.groupBy ? "font-semibold" : SOFT}`}
              >
                {g.label}
              </a>
            ))}
          </nav>
          <ReportTable title="รายได้" columns={REV_COLS} rowKey="key" rows={p.revenue.rows} csvHref={exportHref(p.base, "revenue", { ...q, groupBy: p.revenue.groupBy })} />
          <p className={`text-sm ${SOFT}`}>{`รวมรายได้ห้อง ${fmtBaht(p.revenue.total.roomRevenueSatang)} · รายได้อื่น ${fmtBaht(p.revenue.total.otherRevenueSatang)} · ไม่นับรายการที่ยกเลิกแล้ว`}</p>
        </>
      ) : null}

      {p.tab === "funnel" && p.funnel ? (
        <>
          <ReportTable title="การจองตามแหล่ง" columns={FUNNEL_COLS} rowKey="source" rows={p.funnel.rows} csvHref={exportHref(p.base, "funnel", q)} />
          <section className={`${CARD} flex flex-col gap-2 p-5`}>
            <h2 className="text-base font-bold">เหตุผลที่ยกเลิก</h2>
            {hasReasons ? (
              <ul className="flex flex-col gap-1 text-sm">
                {p.funnel.rows.flatMap((r) =>
                  r.cancelReasons.map((c) => (
                    <li key={`${r.source}-${c.reason}`} className="flex gap-2">
                      <span className={SOFT}>{r.label}</span>
                      <span className="flex-1">{c.reason}</span>
                      <span className="tabular-nums">{`${fmtInt(c.count)} ครั้ง`}</span>
                    </li>
                  )),
                )}
              </ul>
            ) : (
              <p className={`text-sm ${SOFT}`}>ไม่มีการยกเลิกในช่วงนี้</p>
            )}
            <p className={`text-xs ${SOFT}`}>{`จองล่วงหน้าเฉลี่ย ${p.funnel.leadTimeDaysAvg} วัน · พักเฉลี่ย ${p.funnel.alosNights} คืน`}</p>
          </section>
        </>
      ) : null}

      {p.tab === "forecast" && p.forecast ? (
        <>
          <ForecastChart title="ห้องที่จองแล้ว ล่วงหน้า 30 วัน" mode="bar" points={p.forecast.rows.map((r) => ({ key: r.date, label: fmtThaiDate(r.date), bps: r.occupancyBps }))} />
          <ReportTable title="ล่วงหน้า 30 วัน" columns={FORECAST_COLS} rowKey="date" rows={p.forecast.rows.map((r) => ({ ...r, label: fmtThaiDate(r.date) }))} csvHref={exportHref(p.base, "forecast", {})} />
        </>
      ) : null}

      {p.tab === "housekeeping" && p.housekeeping ? (
        <>
          <p className={`text-sm ${SOFT}`}>{`ห้องปิดซ่อมค้างอยู่ตอนนี้ ${fmtInt(p.housekeeping.oooOutstanding)} ห้อง`}</p>
          <ReportTable title="แม่บ้าน · ห้องที่ทำเสร็จรายวัน" columns={HK_DAY_COLS} rowKey="date" rows={p.housekeeping.byDay.map((r) => ({ ...r, label: fmtThaiDate(r.date) }))} csvHref={exportHref(p.base, "housekeeping", q)} />
          <ReportTable title="แม่บ้าน · ต่อคน" columns={HK_USER_COLS} rowKey="userId" rows={p.housekeeping.byUser} />
        </>
      ) : null}

      {p.tab === "deposits" && p.deposits ? (
        <section className={`${CARD} flex flex-col gap-3 p-5`}>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-bold">มัดจำและการถือห้อง</h2>
            <span className="flex-1" />
            <a href={exportHref(p.base, "deposits", q)} className="flex min-h-[40px] items-center rounded-xl border border-[color:var(--color-line)] px-3 text-sm font-medium">
              ส่งออก CSV
            </a>
          </div>
          <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <div className="flex flex-col gap-1">
              <dt className={SOFT}>ถือห้องรอมัดจำ</dt>
              <dd className="text-xl font-bold tabular-nums">{`${fmtInt(p.deposits.holdActive)} รายการ`}</dd>
            </div>
            <div className="flex flex-col gap-1">
              <dt className={SOFT}>มัดจำค้างรับ</dt>
              <dd className="text-xl font-bold tabular-nums">{fmtBaht(p.deposits.depositPendingSatang)}</dd>
            </div>
            <div className="flex flex-col gap-1">
              <dt className={SOFT}>มัดจำที่ริบ (ไม่มา)</dt>
              <dd className="text-xl font-bold tabular-nums">{fmtBaht(p.deposits.forfeitedSatang)}</dd>
            </div>
            <div className="flex flex-col gap-1">
              <dt className={SOFT}>มัดจำที่คืน</dt>
              <dd className="text-xl font-bold tabular-nums">{fmtBaht(p.deposits.refundedSatang)}</dd>
            </div>
          </dl>
          <p className={`text-xs ${SOFT}`}>{`ถือห้องที่หมดเวลาแล้วแต่ยังไม่ถูกยกเลิก ${fmtInt(p.deposits.holdExpired)} รายการ · ริบ/คืนนับในช่วง ${rangeLabel}`}</p>
        </section>
      ) : null}
    </div>
  );
}
