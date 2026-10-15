// ops/reports.ts — op รายงานขายของ POS (ใบ P0.2 → ใบ P2.13 · brief §1 #35–#45 + IN-B anomalies · มติ 8 10)
//
// P0.2: `sales.summary` / `sales.byDay` (คู่กับ tool เดิมของผู้ช่วย AI `sales_summary` / `sales_by_day` — tool ยังไม่สลับ · มติ 7)
// P2.13: ทุก op อ่านจากตัวอ่านรายงานของ POS (`reports.ts` — ตัวเดียวกับหน้ารายงาน) ด้วย actor สังเคราะห์ของคีย์
//   ช่วงวัน = วันธุรกิจไทย `from`..`to` (YYYY-MM-DD · ตัดวันตามค่าตั้งของร้าน · ≤ 92 วัน · รายชั่วโมง ≤ 31 วัน — ตัวอ่านตัดสิน)
//   ไม่ระบุ = 7 วันล่าสุดถึงวันนี้ · `unitId` ไม่บังคับ (ไม่ส่ง = ทุกสาขาที่คีย์อ่านได้ · ส่ง = ต้องผ่านด่านสาขา)
//   CSV = ส่ง `Accept: text/csv` (ไฟล์เดียวกับปุ่มส่งออกของหน้ารายงาน — reportCsv · BOM ใส่ที่แกน)
// 🔴 `sales.summary` = ผลรวมของรายงานรายวันช่วงเดียวกัน (totals ของตัวอ่าน — ไม่บวกเงินที่นี่)

import { z } from "zod";
import type { ApiActor } from "@/lib/api/actor";
import type { ApiOpCtx } from "@/lib/api/op";
import { bkkToday } from "../../index";
import {
  reportAnomalies,
  reportBranches,
  reportChannels,
  reportCsv,
  reportDailySales,
  reportHourly,
  reportMargin,
  reportPayments,
  reportProducts,
  reportShifts,
  reportStaff,
  reportTax,
  type ReportCtx,
  type ReportKind,
} from "../../reports";
import { posRegisterActorOf } from "../actor";
import { posData, posResult } from "../http-errors";
import { definePosOp, POS_SCOPES, type ApiOp } from "../op";
import { requirePosUnit } from "../units";

const DAY_MS = 86_400_000;
const DEFAULT_DAYS = 7;
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const reportInput = z
  .object({
    from: date.optional().describe(`First Thai business date YYYY-MM-DD (default: ${DEFAULT_DAYS - 1} days before to).`),
    to: date.optional().describe("Last Thai business date YYYY-MM-DD, inclusive (default: today). At most 92 days per call (31 for hourly)."),
    unitId: z.string().min(1).max(64).optional().describe("One branch. Absent = every branch the key may read."),
    limit: z.coerce.number().int().min(1).max(1000).optional().describe("Row limit of ranked reports (default 200)."),
  })
  .strict();
type ReportQuery = z.infer<typeof reportInput>;

/** ช่วงวันของคำขอ (ไม่ระบุ = 7 วันล่าสุด) */
function rangeOf(q: ReportQuery): { from: string; to: string } {
  const to = q.to ?? bkkToday();
  const from = q.from ?? new Date(Date.parse(`${to}T00:00:00Z`) - (DEFAULT_DAYS - 1) * DAY_MS).toISOString().slice(0, 10);
  return { from, to };
}

async function reportScope(actor: ApiActor, q: ReportQuery): Promise<ReportCtx> {
  const unitId = q.unitId ? await requirePosUnit(actor, q.unitId) : undefined;
  return { tenantId: actor.tenantId, systemId: actor.systemId, ...(unitId ? { unitId } : {}) };
}

type Reader = (ctx: ReportCtx, actor: ReturnType<typeof posRegisterActorOf>, input: { from: string; to: string; limit?: number }) => Promise<unknown>;

async function runReport(reader: Reader, actor: ApiActor, q: ReportQuery): Promise<unknown> {
  const ctx = await reportScope(actor, q);
  return posData(await reader(ctx, posRegisterActorOf(actor), { ...rangeOf(q), ...(q.limit ? { limit: q.limit } : {}) }));
}

/** CSV ของรายงานชนิดนี้ = ไฟล์ของปุ่มส่งออก (reportCsv) */
function csvOf(kind: ReportKind) {
  return async (ctx: ApiOpCtx<unknown>): Promise<string> => {
    const q = ctx.input as ReportQuery;
    const r = posResult(await reportCsv(await reportScope(ctx.actor, q), posRegisterActorOf(ctx.actor), { kind, ...rangeOf(q) }));
    return r.body;
  };
}

const salesSummary = definePosOp({
  id: "sales.summary",
  method: "GET",
  path: "/reports/summary",
  kind: "read",
  rate: "report",
  action: POS_SCOPES.reportView,
  summary: "Totals of paid sales over a range of Thai business days (default the last 7 including today): bills, gross, discounts, net sales after refunds and voids, VAT, tips, voids and refunds in satang.",
  label: "สรุปยอดขายช่วงวัน",
  test: "POS-P0.2-OP.1",
  input: reportInput,
  async handler({ actor, input }) {
    const r = (await runReport(reportDailySales as Reader, actor, input)) as { from: string; to: string; unitId: string | null; totals: Record<string, unknown> };
    return { from: r.from, to: r.to, unitId: r.unitId, ...r.totals };
  },
});

const salesByDay = definePosOp({
  id: "sales.byDay",
  method: "GET",
  path: "/reports/daily",
  kind: "read",
  rate: "report",
  action: POS_SCOPES.reportView,
  summary: "Sales per Thai business day over a range: bills, gross, discounts, net sales, VAT, tips, voids, refunds and average bill (satang), with totals. CSV with Accept: text/csv.",
  label: "ยอดขายรายวัน",
  test: "POS-P0.2-OP.2",
  input: reportInput,
  csv: csvOf("daily"),
  async handler({ actor, input }) {
    return runReport(reportDailySales as Reader, actor, input);
  },
});

const reportsProducts = definePosOp({
  id: "reports.products",
  method: "GET",
  path: "/reports/products",
  kind: "read",
  rate: "report",
  action: POS_SCOPES.reportView,
  summary: "Best sellers over a range: quantity, weight, bills and sales per product, ranked. CSV with Accept: text/csv.",
  label: "รายงานสินค้าขายดี",
  test: "reports.products",
  input: reportInput,
  csv: csvOf("products"),
  async handler({ actor, input }) {
    return runReport(reportProducts as Reader, actor, input);
  },
});

const reportsStaff = definePosOp({
  id: "reports.staff",
  method: "GET",
  path: "/reports/staff",
  kind: "read",
  rate: "report",
  action: POS_SCOPES.reportView,
  summary: "Sales per seller over a range: bills, net sales after refunds, discounts, tips, voids. Bills sold through the API are listed under the API key id, named 'API: <key name>'. CSV with Accept: text/csv.",
  label: "รายงานยอดขายพนักงาน",
  test: "reports.staff",
  input: reportInput,
  csv: csvOf("staff"),
  async handler({ actor, input }) {
    return runReport(reportStaff as Reader, actor, input);
  },
});

const reportsPayments = definePosOp({
  id: "reports.payments",
  method: "GET",
  path: "/reports/payments",
  kind: "read",
  rate: "report",
  action: POS_SCOPES.reportView,
  summary: "Money received per payment method over a range, net of refunds, with cash tendered and change. CSV with Accept: text/csv.",
  label: "รายงานวิธีชำระเงิน",
  test: "reports.payments",
  input: reportInput,
  csv: csvOf("payments"),
  async handler({ actor, input }) {
    return runReport(reportPayments as Reader, actor, input);
  },
});

const reportsMargin = definePosOp({
  id: "reports.margin",
  method: "GET",
  path: "/reports/margin",
  kind: "read",
  rate: "report",
  action: POS_SCOPES.reportView,
  summary: "Gross margin per product over a range: revenue, cost (stock cost at sale time, estimated where missing) and margin in satang and basis points. CSV with Accept: text/csv.",
  label: "รายงานกำไรขั้นต้น",
  test: "reports.margin",
  input: reportInput,
  csv: csvOf("margin"),
  async handler({ actor, input }) {
    return runReport(reportMargin as Reader, actor, input);
  },
});

const reportsShifts = definePosOp({
  id: "reports.shifts",
  method: "GET",
  path: "/reports/shifts",
  kind: "read",
  rate: "report",
  action: POS_SCOPES.reportView,
  summary: "Shifts of a range with their Z totals, counted cash and over/short. CSV with Accept: text/csv.",
  label: "รายงานกะ",
  test: "reports.shifts",
  input: reportInput,
  csv: csvOf("shifts"),
  async handler({ actor, input }) {
    return runReport(reportShifts as Reader, actor, input);
  },
});

const reportsTax = definePosOp({
  id: "reports.tax",
  method: "GET",
  path: "/reports/tax",
  kind: "read",
  rate: "report",
  action: POS_SCOPES.reportView,
  summary: "Output VAT over a range per Thai business day and branch: first and last receipt number, bills, gross, VAT base and VAT, net of refunds. CSV with Accept: text/csv.",
  label: "รายงานภาษีขาย",
  test: "reports.tax",
  input: reportInput,
  csv: csvOf("tax"),
  async handler({ actor, input }) {
    return runReport(reportTax as Reader, actor, input);
  },
});

const reportsChannels = definePosOp({
  id: "reports.channels",
  method: "GET",
  path: "/reports/channels",
  kind: "read",
  rate: "report",
  action: POS_SCOPES.reportView,
  summary: "Sales per sales channel over a range: bills, gross, refunds, platform commission and net. CSV with Accept: text/csv.",
  label: "รายงานยอดขายตามช่องทาง",
  test: "reports.channels",
  input: reportInput,
  csv: csvOf("channels"),
  async handler({ actor, input }) {
    return runReport(reportChannels as Reader, actor, input);
  },
});

const reportsBranches = definePosOp({
  id: "reports.branches",
  method: "GET",
  path: "/reports/branches",
  kind: "read",
  rate: "report",
  action: POS_SCOPES.reportView,
  summary: "Sales per branch over a range with a total row (same numbers as the per branch reports). CSV with Accept: text/csv.",
  label: "รายงานยอดขายตามสาขา",
  test: "reports.branches",
  input: reportInput,
  csv: csvOf("branches"),
  async handler({ actor, input }) {
    return runReport(reportBranches as Reader, actor, input);
  },
});

const reportsHourly = definePosOp({
  id: "reports.hourly",
  method: "GET",
  path: "/reports/hourly",
  kind: "read",
  rate: "report",
  action: POS_SCOPES.reportView,
  summary: "Sales per hour of the business day over a range (at most 31 days), with a same weekday forecast. CSV with Accept: text/csv.",
  label: "รายงานยอดขายรายชั่วโมง",
  test: "reports.hourly",
  input: reportInput,
  csv: csvOf("hourly"),
  async handler({ actor, input }) {
    return runReport(reportHourly as Reader, actor, input);
  },
});

const reportsAnomalies = definePosOp({
  id: "reports.anomalies",
  method: "GET",
  path: "/reports/anomalies",
  kind: "read",
  rate: "report",
  action: POS_SCOPES.reportAnomaly,
  summary: "Anomaly report over a range: hits of the anomaly rules against the shop thresholds, per branch, day and staff member. Needs pos.report.anomaly and pos.report.view. CSV with Accept: text/csv.",
  label: "รายงานจุดผิดปกติ",
  test: "reports.anomalies",
  input: reportInput,
  csv: csvOf("anomalies"),
  async handler({ actor, input }) {
    return runReport(reportAnomalies as Reader, actor, input);
  },
});

export const REPORTS_OPS: ApiOp[] = [
  salesSummary,
  salesByDay,
  reportsProducts,
  reportsStaff,
  reportsPayments,
  reportsMargin,
  reportsShifts,
  reportsTax,
  reportsChannels,
  reportsBranches,
  reportsHourly,
  reportsAnomalies,
];
