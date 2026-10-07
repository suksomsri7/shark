"use client";

// ReportsClient.tsx — POS P1.17 U จอรายงาน 7 ชุด (ภาพ 08 บางส่วน): แท็บชนิด · ช่วงวันที่ · สาขา · ตาราง + แถวรวม · CSV · กราฟแท่งรายวัน
// 🔴 เงินเป็นสตางค์ Int จากเซิร์ฟเวอร์ — จอแค่จัดรูป (MoneyText ทศนิยม 2 ตำแหน่ง) ไม่คำนวณยอดเอง
// 🔴 คำปฏิเสธแสดงด้วยคีย์ pos.report.errors.* ตามรหัส (ไม่แสดง message ไทยของเซิร์ฟเวอร์ · ไม่แสดงรหัสดิบ)
// 🔴 CSV: เนื้อไฟล์มี BOM มาจากเซิร์ฟเวอร์แล้ว — ห้ามเติมซ้ำ
// สถานะอยู่ใน URL (?kind=&from=&to=&unit=) ผ่าน history.replaceState — ไม่โหลดหน้าใหม่

import { useCallback, useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { MoneyText } from "@/components/ui/MoneyText";
import { formatBaht } from "@/lib/ui/money";
import { posReportAction, posReportCsvAction } from "@/lib/modules/pos/report-actions";
import type {
  AnyReportResult,
  DailyRow,
  DailyTotals,
  MarginRow,
  MarginTotals,
  PaymentRow,
  PaymentTotals,
  ProductRow,
  ProductTotals,
  Report,
  ReportKind,
  ShiftRow,
  ShiftTotals,
  StaffRow,
  StaffTotals,
  TaxRow,
  TaxTotals,
} from "@/lib/modules/pos/reports";

type Unit = { id: string; name: string };
type View = { kind: ReportKind; from: string; to: string; unitId: string };
type Props = { systemId: string; units: Unit[]; initial: View; today: string; maxDays: number };
type T = (key: string, values?: Record<string, string | number>) => string;
type Loaded = Exclude<AnyReportResult, { ok: false }>["report"];

/** ลำดับแท็บตามสเปก: daily · products · staff · payments · margin · shifts · tax */
const KINDS: readonly ReportKind[] = ["daily", "products", "staff", "payments", "margin", "shifts", "tax"];
const DAY_MS = 86_400_000;
const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(Date.parse(`${s}T00:00:00Z`)) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;
const spanDays = (from: string, to: string) => (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS + 1;
/** รหัสปฏิเสธ → คีย์ใต้ pos.report (INTERNAL/อื่น ๆ = unknown) */
const REFUSAL_KEY: Record<string, string> = { VALIDATION: "errors.validation", NOT_FOUND: "errors.notFound", PERMISSION_DENIED: "errors.permissionDenied" };
const refusalKey = (code: string) => (Object.prototype.hasOwnProperty.call(REFUSAL_KEY, code) ? REFUSAL_KEY[code]! : "errors.unknown");
const METHOD_KEYS = new Set(["CASH", "CARD", "PROMPTPAY", "TRANSFER", "DEPOSIT", "ROOM_CHARGE"]);
/** เวลาไทยสั้น ๆ (วัน/เดือน ชม:นาที) */
const bkkTime = (iso: string | null, locale: string) =>
  iso ? new Intl.DateTimeFormat(locale.startsWith("en") ? "en-GB" : "th-TH", { timeZone: "Asia/Bangkok", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(iso)) : "—";
/** YYYY-MM-DD → วันที่สั้นตามภาษาจอ (ไม่เลื่อนวัน: ตีความเป็น UTC เที่ยงวัน) */
const shortDate = (d: string, locale: string) =>
  new Intl.DateTimeFormat(locale.startsWith("en") ? "en-GB" : "th-TH", { timeZone: "UTC", day: "numeric", month: "short" }).format(new Date(`${d}T12:00:00Z`));
const pct = (bp: number | null) => (bp === null ? "—" : `${(bp / 100).toFixed(2)}%`);

// ═══════════ ตารางกลาง ═══════════
type Col<R> = { key: string; header: string; num?: boolean; cell: (r: R) => React.ReactNode };

function Table<R>({ cols, rows, rowKey, total, minWidth, testId }: { cols: Col<R>[]; rows: R[]; rowKey: (r: R, i: number) => string; total?: React.ReactNode[]; minWidth: number; testId: string }) {
  return (
    <div className="w-full min-w-0 overflow-x-auto" data-testid={testId}>
      <table className="w-full border-collapse text-sm" style={{ minWidth }}>
        <thead>
          <tr>
            {cols.map((c) => (
              <th key={c.key} scope="col" className={`whitespace-nowrap border-b px-3 pb-2 text-xs font-medium text-[color:var(--color-muted)] ${c.num ? "text-right" : "text-left"}`}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={rowKey(r, i)}>
              {cols.map((c) => (
                <td key={c.key} className={`border-b border-[color:var(--color-line)] px-3 py-2 ${c.num ? "whitespace-nowrap text-right tabular-nums" : ""}`}>
                  {c.cell(r)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        {total && (
          <tfoot>
            <tr className="bg-[color:var(--color-surface-2)] font-semibold" data-testid={`${testId}-total`}>
              {total.map((v, i) => (
                <td key={cols[i]?.key ?? i} className={`px-3 py-2 ${cols[i]?.num ? "whitespace-nowrap text-right tabular-nums" : ""}`}>
                  {v}
                </td>
              ))}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

const M = (v: number | null | undefined) => (v === null || v === undefined ? "—" : <MoneyText satang={v} decimals />);

// ═══════════ กราฟแท่งรายวัน (CSS ล้วน · ไม่มีไลบรารีกราฟ) ═══════════
function DailyChart({ rows, t, locale }: { rows: DailyRow[]; t: T; locale: string }) {
  const max = Math.max(0, ...rows.map((r) => r.netSalesSatang));
  // ป้ายแกน X: วันแรก · กลาง · สุดท้าย (ไม่ล้นจอแคบแม้ 92 แท่ง)
  const ticks = rows.length <= 2 ? rows : [rows[0]!, rows[Math.floor((rows.length - 1) / 2)]!, rows[rows.length - 1]!];
  return (
    <div className="flex flex-col gap-2" data-testid="pos-report-chart">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-medium">{t("chartTitle")}</h2>
        <span className="text-xs text-[color:var(--color-muted)] tabular-nums">{formatBaht(max)}</span>
      </div>
      <div className="flex h-40 items-end gap-px border-b border-[color:var(--color-line)]" role="img" aria-label={t("chartTitle")}>
        {rows.map((r) => (
          <div key={r.businessDate} className="flex h-full min-w-0 flex-1 items-end" title={`${shortDate(r.businessDate, locale)} · ${formatBaht(r.netSalesSatang, { decimals: true })}`}>
            <div className="w-full rounded-t-sm bg-[color:var(--color-ink)]" style={{ height: max > 0 ? `${(r.netSalesSatang / max) * 100}%` : 0 }} />
          </div>
        ))}
      </div>
      <div className="flex justify-between gap-2 text-[10px] text-[color:var(--color-muted)] tabular-nums">
        {ticks.map((r) => (
          <span key={r.businessDate} className="whitespace-nowrap">
            {shortDate(r.businessDate, locale)}
          </span>
        ))}
      </div>
    </div>
  );
}

// ═══════════ ตารางต่อชนิด (คอลัมน์ตามลำดับ R5–R10) ═══════════
function ReportBody({ rep, t, tc, locale }: { rep: Loaded; t: T; tc: T; locale: string }) {
  const c = (k: string) => t(`cols.${k}`);
  const empty = <p className="py-6 text-center text-sm text-[color:var(--color-muted)]" data-testid="pos-report-empty">{t("empty")}</p>;
  const limited = (shown: number, total: number) =>
    shown < total ? <p className="text-xs text-[color:var(--color-muted)]" data-testid="pos-report-row-limit">{t("rowLimit", { shown, total })}</p> : null;

  switch (rep.kind) {
    case "daily": {
      const x = rep as Report<"daily", DailyRow, DailyTotals>;
      if (x.totals.billCount === 0 && x.totals.voidCount === 0) return empty;
      const cols: Col<DailyRow>[] = [
        { key: "date", header: c("date"), cell: (r) => <span className="whitespace-nowrap tabular-nums">{r.businessDate}</span> },
        { key: "bills", header: c("bills"), num: true, cell: (r) => r.billCount },
        { key: "gross", header: c("gross"), num: true, cell: (r) => M(r.grossSatang) },
        { key: "discount", header: c("discount"), num: true, cell: (r) => M(r.discountSatang) },
        { key: "service", header: c("serviceCharge"), num: true, cell: (r) => M(r.serviceChargeSatang) },
        { key: "net", header: c("netSales"), num: true, cell: (r) => <b>{M(r.netSalesSatang)}</b> },
        { key: "vat", header: c("vat"), num: true, cell: (r) => M(r.vatSatang) },
        { key: "exvat", header: c("netExVat"), num: true, cell: (r) => M(r.netExVatSatang) },
        { key: "tip", header: c("tip"), num: true, cell: (r) => M(r.tipSatang) },
        { key: "voids", header: c("voids"), num: true, cell: (r) => r.voidCount },
        { key: "voidTotal", header: c("voidTotal"), num: true, cell: (r) => M(r.voidTotalSatang) },
        { key: "avg", header: c("avgBill"), num: true, cell: (r) => M(r.avgBillSatang) },
      ];
      const tt = x.totals;
      return (
        <div className="flex flex-col gap-4">
          <DailyChart rows={x.rows} t={t} locale={locale} />
          <Table
            testId="pos-report-table"
            cols={cols}
            rows={x.rows}
            rowKey={(r) => r.businessDate}
            minWidth={1080}
            total={[t("total"), tt.billCount, M(tt.grossSatang), M(tt.discountSatang), M(tt.serviceChargeSatang), M(tt.netSalesSatang), M(tt.vatSatang), M(tt.netExVatSatang), M(tt.tipSatang), tt.voidCount, M(tt.voidTotalSatang), M(tt.avgBillSatang)]}
          />
        </div>
      );
    }
    case "products": {
      const x = rep as Report<"products", ProductRow, ProductTotals>;
      if (x.rows.length === 0) return empty;
      const cols: Col<ProductRow>[] = [
        { key: "name", header: c("product"), cell: (r) => r.name },
        { key: "qty", header: c("qty"), num: true, cell: (r) => r.qty },
        { key: "weight", header: c("weight"), num: true, cell: (r) => (r.weightGrams > 0 ? r.weightGrams.toLocaleString("th-TH") : "—") },
        { key: "lines", header: c("lines"), num: true, cell: (r) => r.lineCount },
        { key: "bills", header: c("bills"), num: true, cell: (r) => r.billCount },
        { key: "gross", header: c("fullPrice"), num: true, cell: (r) => M(r.grossSatang) },
        { key: "ldisc", header: c("lineDiscount"), num: true, cell: (r) => M(r.lineDiscountSatang) },
        { key: "sales", header: c("sales"), num: true, cell: (r) => <b>{M(r.salesSatang)}</b> },
      ];
      const tt = x.totals;
      return (
        <div className="flex flex-col gap-2">
          <Table
            testId="pos-report-table"
            cols={cols}
            rows={x.rows}
            rowKey={(r) => r.key}
            minWidth={760}
            total={[t("total"), tt.qty, tt.weightGrams > 0 ? tt.weightGrams.toLocaleString("th-TH") : "—", tt.lineCount, tt.billCount, M(tt.grossSatang), M(tt.lineDiscountSatang), M(tt.salesSatang)]}
          />
          {limited(x.rows.length, tt.rowCount)}
        </div>
      );
    }
    case "staff": {
      const x = rep as Report<"staff", StaffRow, StaffTotals>;
      if (x.rows.length === 0) return empty;
      const cols: Col<StaffRow>[] = [
        { key: "name", header: c("staff"), cell: (r) => (r.userId === null ? <span className="text-[color:var(--color-muted)]">{t("unknownSeller")}</span> : (r.name ?? r.userId)) },
        { key: "bills", header: c("bills"), num: true, cell: (r) => r.billCount },
        { key: "net", header: c("netSales"), num: true, cell: (r) => <b>{M(r.netSalesSatang)}</b> },
        { key: "discount", header: c("discount"), num: true, cell: (r) => M(r.discountSatang) },
        { key: "tip", header: c("tip"), num: true, cell: (r) => M(r.tipSatang) },
        { key: "voids", header: c("voids"), num: true, cell: (r) => r.voidCount },
        { key: "voidTotal", header: c("voidTotal"), num: true, cell: (r) => M(r.voidTotalSatang) },
        { key: "avg", header: c("avgBill"), num: true, cell: (r) => M(r.avgBillSatang) },
      ];
      const tt = x.totals;
      return (
        <Table
          testId="pos-report-table"
          cols={cols}
          rows={x.rows}
          rowKey={(r) => r.userId ?? "∅"}
          minWidth={760}
          total={[t("total"), tt.billCount, M(tt.netSalesSatang), M(tt.discountSatang), M(tt.tipSatang), tt.voidCount, M(tt.voidTotalSatang), M(tt.avgBillSatang)]}
        />
      );
    }
    case "payments": {
      const x = rep as Report<"payments", PaymentRow, PaymentTotals>;
      if (x.rows.length === 0) return empty;
      const cols: Col<PaymentRow>[] = [
        { key: "method", header: c("method"), cell: (r) => (METHOD_KEYS.has(r.type) ? tc(`method.${r.type}`) : r.label) },
        { key: "count", header: c("payments"), num: true, cell: (r) => r.count },
        { key: "bills", header: c("bills"), num: true, cell: (r) => r.billCount },
        { key: "amount", header: c("amount"), num: true, cell: (r) => <b>{M(r.amountSatang)}</b> },
        { key: "tendered", header: c("tendered"), num: true, cell: (r) => M(r.cashTenderedSatang) },
        { key: "change", header: c("change"), num: true, cell: (r) => M(r.changeSatang) },
      ];
      const tt = x.totals;
      return (
        <div className="flex flex-col gap-2">
          <Table
            testId="pos-report-table"
            cols={cols}
            rows={x.rows}
            rowKey={(r) => r.type}
            minWidth={620}
            total={[t("total"), x.rows.reduce((s, r) => s + r.count, 0) /* R2 F3: แสดงผลอย่างเดียว — แถววิธีชำระไม่ถูกตัด (≤ 6 แถว) */, tt.billCount, M(tt.totalPaidSatang), "", ""]}
          />
          <p className="text-xs text-[color:var(--color-muted)] tabular-nums" data-testid="pos-report-summary">
            {t("summary.salesPlusTip", { sales: formatBaht(tt.salesSatang, { decimals: true }), tip: formatBaht(tt.tipSatang, { decimals: true }), paid: formatBaht(tt.totalPaidSatang, { decimals: true }) })}
          </p>
        </div>
      );
    }
    case "margin": {
      const x = rep as Report<"margin", MarginRow, MarginTotals>;
      if (x.rows.length === 0) return empty;
      const tag = (label: string) => <span className="ml-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-xs text-[color:var(--color-muted)]">{label}</span>;
      const cols: Col<MarginRow>[] = [
        { key: "name", header: c("product"), cell: (r) => r.name },
        { key: "qty", header: c("qty"), num: true, cell: (r) => r.qty },
        { key: "revenue", header: c("revenue"), num: true, cell: (r) => M(r.revenueSatang) },
        {
          key: "cost",
          header: c("cost"),
          num: true,
          cell: (r) =>
            r.costSatang === null ? (
              <span className="text-[color:var(--color-muted)]">{t("noCost")}</span>
            ) : (
              <>
                {M(r.costSatang)}
                {r.estimatedCostSatang > 0 ? tag(t("estimated")) : null}
              </>
            ),
        },
        { key: "est", header: c("estimatedCost"), num: true, cell: (r) => (r.estimatedCostSatang > 0 ? M(r.estimatedCostSatang) : "—") },
        { key: "uncosted", header: c("uncosted"), num: true, cell: (r) => r.uncostedLineCount },
        { key: "margin", header: c("margin"), num: true, cell: (r) => <b>{M(r.marginSatang)}</b> },
        { key: "pct", header: c("marginPct"), num: true, cell: (r) => pct(r.marginBp) },
      ];
      const tt = x.totals;
      const line = (label: string, v: number, id: string) => (
        <div className="flex justify-between gap-2 border-b py-1.5 text-sm last:border-0" data-testid={id}>
          <span className="text-[color:var(--color-muted)]">{label}</span>
          <MoneyText satang={v} decimals />
        </div>
      );
      return (
        <div className="flex flex-col gap-4">
          <Table
            testId="pos-report-table"
            cols={cols}
            rows={x.rows}
            rowKey={(r) => r.key}
            minWidth={860}
            total={[t("total"), "—" /* R2 F2: ยอดรวมมาจากเซิร์ฟเวอร์เท่านั้น — แถวกำไรถูกตัดที่ 200 จึงไม่รวม qty ฝั่งจอ */, M(tt.revenueSatang), M(tt.costSatang), tt.estimatedCostSatang > 0 ? M(tt.estimatedCostSatang) : "—", tt.uncostedLineCount, M(tt.grossMarginSatang), pct(tt.grossMarginBp)]}
          />
          {x.rows.length >= 200 ? <p className="text-xs text-[color:var(--color-muted)]" data-testid="pos-report-row-limit">{t("rowLimitAtLeast", { shown: 200 })}</p> : null}
          <div className="rounded-xl border p-3" data-testid="pos-report-summary">
            {line(t("summary.costedRevenue"), tt.costedRevenueSatang, "pos-report-margin-costed")}
            {line(t("summary.uncostedRevenue"), tt.uncostedRevenueSatang, "pos-report-margin-uncosted")}
            {line(t("summary.netExVat"), tt.netExVatSatang, "pos-report-margin-netexvat")}
            {line(t("summary.netMargin"), tt.netMarginSatang, "pos-report-margin-net")}
          </div>
        </div>
      );
    }
    case "shifts": {
      const x = rep as Report<"shifts", ShiftRow, ShiftTotals>;
      if (x.rows.length === 0) return empty;
      const status = (s: string) => (s === "OPEN" ? tc("statusOpen") : s === "FORCE_CLOSED" ? tc("statusForced") : tc("statusClosed"));
      const cols: Col<ShiftRow>[] = [
        { key: "no", header: c("shiftNo"), num: true, cell: (r) => r.shiftNo },
        { key: "z", header: c("zNo"), num: true, cell: (r) => r.zNumber ?? "—" },
        { key: "unit", header: c("unit"), cell: (r) => r.unitName ?? r.unitId },
        { key: "device", header: c("device"), cell: (r) => r.deviceLabel ?? r.deviceId },
        { key: "status", header: c("status"), cell: (r) => <span className="whitespace-nowrap rounded-full border px-2 py-0.5 text-xs">{status(r.status)}</span> },
        { key: "by", header: c("openedBy"), cell: (r) => r.openedByName ?? r.openedByUserId },
        { key: "openedAt", header: c("openedAt"), cell: (r) => <span className="whitespace-nowrap tabular-nums">{bkkTime(r.openedAt, locale)}</span> },
        { key: "closedAt", header: c("closedAt"), cell: (r) => <span className="whitespace-nowrap tabular-nums">{bkkTime(r.closedAt, locale)}</span> },
        { key: "bills", header: c("bills"), num: true, cell: (r) => r.billCount },
        { key: "sales", header: c("sales"), num: true, cell: (r) => <b>{M(r.salesTotalSatang)}</b> },
        { key: "tip", header: c("tip"), num: true, cell: (r) => M(r.tipSatang) },
        { key: "expected", header: c("expectedCash"), num: true, cell: (r) => M(r.expectedCashSatang) },
        { key: "counted", header: c("countedCash"), num: true, cell: (r) => M(r.countedCashSatang) },
        {
          key: "overShort",
          header: c("overShort"),
          num: true,
          cell: (r) => (
            <span className={r.overShortSatang !== null && r.overShortSatang < 0 ? "text-[color:var(--color-danger)]" : undefined}>
              {M(r.overShortSatang)}
              {r.recountVarianceSatang !== null ? (
                <span className="block text-xs text-[color:var(--color-muted)]">
                  {c("recount")} <MoneyText satang={r.recountVarianceSatang} decimals />
                </span>
              ) : null}
            </span>
          ),
        },
      ];
      const tt = x.totals;
      return (
        <div className="flex flex-col gap-2">
          <Table
            testId="pos-report-table"
            cols={cols}
            rows={x.rows}
            rowKey={(r) => r.shiftId}
            minWidth={1240}
            total={[t("total"), "", "", "", "", "", "", "", tt.billCount, M(tt.salesTotalSatang), M(tt.tipSatang), "", "", M(tt.overShortSatang)]}
          />
          <p className="text-xs text-[color:var(--color-muted)]" data-testid="pos-report-summary">
            {t("summary.shiftCounts", { shifts: tt.shiftCount, short: tt.shortCount, over: tt.overCount, forced: tt.forcedCount, open: tt.openCount })}
          </p>
        </div>
      );
    }
    case "tax": {
      const x = rep as Report<"tax", TaxRow, TaxTotals>;
      if (x.rows.length === 0) return empty;
      const cols: Col<TaxRow>[] = [
        { key: "date", header: c("date"), cell: (r) => <span className="whitespace-nowrap tabular-nums">{r.businessDate}</span> },
        { key: "unit", header: c("unit"), cell: (r) => r.unitName },
        { key: "first", header: c("firstReceipt"), cell: (r) => <span className="whitespace-nowrap tabular-nums">{r.firstReceiptNo ?? "—"}</span> },
        { key: "last", header: c("lastReceipt"), cell: (r) => <span className="whitespace-nowrap tabular-nums">{r.lastReceiptNo ?? "—"}</span> },
        { key: "bills", header: c("bills"), num: true, cell: (r) => r.billCount },
        { key: "gross", header: c("taxGross"), num: true, cell: (r) => <b>{M(r.grossSatang)}</b> },
        { key: "vat", header: c("vat"), num: true, cell: (r) => M(r.vatSatang) },
        { key: "base", header: c("taxBase"), num: true, cell: (r) => M(r.baseSatang) },
        { key: "vatable", header: c("vatable"), num: true, cell: (r) => M(r.vatableGrossSatang) },
        { key: "nonVat", header: c("nonVat"), num: true, cell: (r) => M(r.nonVatGrossSatang) },
        { key: "voids", header: c("voids"), num: true, cell: (r) => r.voidCount },
        { key: "voidNos", header: c("voidReceipts"), cell: (r) => <span className="tabular-nums">{r.voidReceiptNos.length > 0 ? r.voidReceiptNos.join(" ") : "—"}</span> },
      ];
      const tt = x.totals;
      return (
        <Table
          testId="pos-report-table"
          cols={cols}
          rows={x.rows}
          rowKey={(r) => `${r.businessDate}|${r.unitId}`}
          minWidth={1160}
          total={[t("total"), "", "", "", tt.billCount, M(tt.grossSatang), M(tt.vatSatang), M(tt.baseSatang), M(tt.vatableGrossSatang), M(tt.nonVatGrossSatang), tt.voidCount, ""]}
        />
      );
    }
  }
}

// ═══════════ จอหลัก ═══════════
export function ReportsClient({ systemId, units, initial, today, maxDays }: Props) {
  const t = useTranslations("pos.report");
  const tc = useTranslations("pos.shift"); // ป้ายวิธีชำระ + สถานะกะ (ใช้ร่วมกับจอกะ)
  const [view, setView] = useState<View>(initial);
  const [report, setReport] = useState<Loaded | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [csvBusy, setCsvBusy] = useState(false);
  const [csvErrorCode, setCsvErrorCode] = useState<string | null>(null);
  const locale = useLocale();
  const seq = useRef(0);

  // ตรวจช่วงที่จอ (สเปก: 92 วัน ฝั่งจอ + คำปฏิเสธของเซิร์ฟเวอร์ก็แสดง)
  const rangeError = !isDate(view.from) || !isDate(view.to) ? "errors.validation" : view.from > view.to ? "errors.rangeOrder" : spanDays(view.from, view.to) > maxDays ? "errors.rangeTooLong" : null;
  const target = useCallback((v: View) => ({ systemId, kind: v.kind, from: v.from, to: v.to, ...(v.unitId ? { unitId: v.unitId } : {}) }), [systemId]);

  const load = useCallback(
    async (v: View) => {
      const my = ++seq.current; // คำขอเก่าที่ตอบช้ากว่าห้ามทับผลใหม่
      setLoading(true);
      setErrorCode(null);
      try {
        const r = await posReportAction(target(v));
        if (my !== seq.current) return;
        if (r.ok) setReport(r.report);
        else {
          setReport(null);
          setErrorCode(r.code);
        }
      } catch {
        if (my === seq.current) {
          setReport(null);
          setErrorCode("INTERNAL");
        }
      } finally {
        if (my === seq.current) setLoading(false);
      }
    },
    [target],
  );

  // เปลี่ยนมุมมอง → เขียน URL (ไม่โหลดหน้าใหม่) + โหลดรายงาน (ช่วงผิดที่จอ = ไม่เรียกเซิร์ฟเวอร์)
  useEffect(() => {
    const q = new URLSearchParams({ kind: view.kind, from: view.from, to: view.to });
    if (view.unitId) q.set("unit", view.unitId);
    try {
      window.history.replaceState(null, "", `${window.location.pathname}?${q.toString()}`);
    } catch {
      /* URL เป็นแค่ความสะดวก — พังไม่กระทบรายงาน */
    }
    if (rangeError) {
      seq.current++;
      setReport(null);
      setLoading(false);
      return;
    }
    void load(view);
  }, [view, rangeError, load]);

  const downloadCsv = async () => {
    if (csvBusy || rangeError) return;
    setCsvBusy(true);
    setCsvErrorCode(null);
    try {
      const r = await posReportCsvAction(target(view));
      if (!r.ok) {
        setCsvErrorCode(r.code);
        return;
      }
      // เนื้อไฟล์มี BOM แล้ว (Excel ไทย) — ส่งต่อทั้งก้อน ไม่เติมซ้ำ
      const url = URL.createObjectURL(new Blob([r.body], { type: r.contentType }));
      const a = document.createElement("a");
      a.href = url;
      a.download = r.filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      setCsvErrorCode("INTERNAL");
    } finally {
      setCsvBusy(false);
    }
  };

  const set = (patch: Partial<View>) => {
    setCsvErrorCode(null); // ข้อความ CSV เป็นของมุมมองเดิม
    setView((v) => ({ ...v, ...patch }));
  };
  const shownError = rangeError ? t(rangeError) : errorCode ? t(refusalKey(errorCode)) : null;

  return (
    <div className="flex w-full min-w-0 flex-col gap-4" data-testid="pos-reports">
      {/* แท็บชนิดรายงาน — มือถือเลื่อนแนวนอนในแถบเอง */}
      <div role="tablist" aria-label={t("kindsLabel")} className="-mx-1 flex min-w-0 gap-1 overflow-x-auto px-1 pb-1" data-testid="pos-report-kinds">
        {KINDS.map((k) => {
          const on = view.kind === k;
          return (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={on}
              data-testid={`pos-report-kind-${k}`}
              className={`min-h-[44px] shrink-0 whitespace-nowrap rounded-full border px-4 text-sm ${on ? "border-[color:var(--color-ink)] bg-[color:var(--color-ink)] text-[color:var(--color-surface)]" : "text-[color:var(--color-ink-soft)] hover:bg-[color:var(--color-surface-2)]"}`}
              onClick={() => set({ kind: k })}
            >
              {t(`kinds.${k}`)}
            </button>
          );
        })}
      </div>

      {/* ตัวกรอง: วันที่ · สาขา · CSV */}
      <div className="grid grid-cols-2 gap-3 sm:flex sm:flex-wrap sm:items-end">
        <label className="flex min-w-0 flex-col gap-1 text-sm">
          <span className="text-[color:var(--color-muted)]">{t("from")}</span>
          <input data-testid="pos-report-from" type="date" className="input min-h-[44px] w-full min-w-0" value={view.from} max={view.to || today} onChange={(e) => set({ from: e.target.value })} />
        </label>
        <label className="flex min-w-0 flex-col gap-1 text-sm">
          <span className="text-[color:var(--color-muted)]">{t("to")}</span>
          <input data-testid="pos-report-to" type="date" className="input min-h-[44px] w-full min-w-0" value={view.to} min={view.from || undefined} onChange={(e) => set({ to: e.target.value })} />
        </label>
        <label className="col-span-2 flex min-w-0 flex-col gap-1 text-sm sm:col-span-1">
          <span className="text-[color:var(--color-muted)]">{t("unit")}</span>
          <select data-testid="pos-report-unit" className="input min-h-[44px] w-full min-w-0" value={view.unitId} onChange={(e) => set({ unitId: e.target.value })}>
            <option value="">{t("allUnits")}</option>
            {units.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </label>
        <button data-testid="pos-report-csv" type="button" className="btn btn-ghost col-span-2 min-h-[44px] text-sm sm:col-span-1 sm:ml-auto" disabled={csvBusy || !!rangeError || loading} onClick={() => void downloadCsv()}>
          {csvBusy ? t("downloading") : t("downloadCsv")}
        </button>
      </div>
      <p className="-mt-2 text-xs text-[color:var(--color-muted)]">{t("rangeHint")}</p>

      {csvErrorCode && (
        <div role="alert" className="rounded-xl border border-[color:var(--color-danger)] p-3 text-sm text-[color:var(--color-danger)]" data-testid="pos-report-csv-error">
          {t(refusalKey(csvErrorCode))}
        </div>
      )}

      <section className="card flex min-w-0 flex-col gap-3" aria-busy={loading} data-testid="pos-report-card">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-base font-semibold">{t(`kinds.${view.kind}`)}</h2>
          {report && !loading ? (
            <span className="text-xs text-[color:var(--color-muted)]" data-testid="pos-report-generated">
              {view.from} – {view.to} · {t("generatedAt", { time: bkkTime(report.generatedAt, locale) })}
            </span>
          ) : null}
        </div>
        {shownError ? (
          <div role="alert" className="flex flex-col items-start gap-2 rounded-xl border border-[color:var(--color-danger)] p-3 text-sm text-[color:var(--color-danger)]" data-testid="pos-report-error">
            <span>{shownError}</span>
            {!rangeError && (
              <button data-testid="pos-report-retry" type="button" className="btn btn-ghost min-h-[44px] text-sm" onClick={() => void load(view)}>
                {t("retry")}
              </button>
            )}
          </div>
        ) : loading || !report ? (
          <p className="py-6 text-center text-sm text-[color:var(--color-muted)]" data-testid="pos-report-loading">
            {t("loading")}
          </p>
        ) : (
          <ReportBody rep={report} t={t} tc={tc} locale={locale} />
        )}
      </section>
    </div>
  );
}
