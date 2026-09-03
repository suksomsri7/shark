import {
  monthlyStatusSeries,
  issuedByType,
  topCustomers,
  topProducts,
  topVendors,
  topExpenseCategories,
  topIncomeCategories,
  topTrackedContacts,
  periodKeyBkk,
  monthStart,
  monthEndExclusive,
  type DashCtx,
  type QueryMeter,
  type OverviewSide,
  type MonthlyStatusSeries,
  type IssuedByType,
  type TopContactRow,
  type TopProductRow,
  type CategorySlice,
  type TrackedContactRow,
} from "./dashboard";

// ─────────────────────────────────────────────────────────────
// overview.ts — "data function" ของหน้า "ดูภาพรวม" รายรับ/รายจ่าย (WO 2.3)
// แยกจาก overview-ui.tsx (React) โดยตั้งใจ เพื่อให้ scripts/qc-acc-v2-overview.mts import ตรง ๆ ได้
// (เหมือน dashboard-home.ts ของหน้าหลัก WO 2.2) · อ้าง DESIGN-SPEC-V2 §6
//
// งบ query (BLUEPRINT §3 WO 2.3 กำหนดจาก 2.1): ≤ 8 query ต่อหน้า — วัดจริงจาก meter ที่ผ่านทุกฟังก์ชัน
// ─────────────────────────────────────────────────────────────

export type OverviewRangeKey = "this-month" | "last-month" | "this-year";

export type OverviewParams = {
  year: number;
  chartPeriod: "month" | "quarter";
  issuedRange: OverviewRangeKey;
};

type RawParams = Record<string, string | string[] | undefined>;

function one(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

function parseYear(v: string | undefined, fallback: number): number {
  const n = Number(v);
  return Number.isInteger(n) && n >= 2000 && n <= 2100 ? n : fallback;
}

/** ตัวเลือกของ "เอกสารที่ออก ▾" (ช่วงเวลา) — ตาม f4 mockup (เม็ดเดียว ไม่มีตัวเลือกชนิดเอกสารแยก
 * เพราะการ์ดนี้โชว์ breakdown ตามชนิดคงที่ 4 ชนิดต่อฝั่งอยู่แล้ว — ดู dashboard.REVENUE_ISSUED_TYPES/EXPENSE_ISSUED_TYPES) */
export const ISSUED_RANGE_OPTIONS: { value: OverviewRangeKey; label: string }[] = [
  { value: "this-month", label: "เดือนนี้" },
  { value: "last-month", label: "เดือนก่อน" },
  { value: "this-year", label: "ปีนี้" },
];

function normalizeParams(raw: RawParams, currentYear: number): OverviewParams {
  const dr = one(raw.dr);
  return {
    year: parseYear(one(raw.year), currentYear),
    chartPeriod: one(raw.chartPeriod) === "quarter" ? "quarter" : "month",
    issuedRange: ISSUED_RANGE_OPTIONS.some((o) => o.value === dr) ? (dr as OverviewRangeKey) : "this-month",
  };
}

function issuedRangeDates(key: OverviewRangeKey, now: Date): { from: Date; to: Date; label: string } {
  const periodKey = periodKeyBkk(now);
  if (key === "this-year") {
    const y = Number(periodKey.slice(0, 4));
    return { from: monthStart(`${y}-01`), to: monthEndExclusive(`${y}-12`), label: `ปี ${y}` };
  }
  if (key === "last-month") {
    const [y, m] = periodKey.split("-").map(Number);
    const py = m === 1 ? y - 1 : y;
    const pm = m === 1 ? 12 : m - 1;
    const pk = `${py}-${String(pm).padStart(2, "0")}`;
    return { from: monthStart(pk), to: monthEndExclusive(pk), label: "เดือนก่อน" };
  }
  return { from: monthStart(periodKey), to: monthEndExclusive(periodKey), label: "เดือนนี้" };
}

export type OverviewData = {
  side: OverviewSide;
  now: Date;
  base: string;
  params: OverviewParams;
  series: MonthlyStatusSeries;
  issued: IssuedByType;
  issuedRangeLabel: string;
  /** "จ่ายให้ใครมากที่สุด" (ฝั่งรายจ่าย) — ว่างที่ฝั่งรายรับ */
  topVendors: TopContactRow[];
  /** "ขายใครได้มากที่สุด" (ฝั่งรายรับ) — ว่างที่ฝั่งรายจ่าย */
  topCustomers: TopContactRow[];
  /** "ขายอะไรดีสุด" (ฝั่งรายรับ) — ว่างที่ฝั่งรายจ่าย */
  topProducts: TopProductRow[];
  /** "ค่าใช้จ่ายตามหมวดบัญชี" (ฝั่งรายจ่าย) — ว่างที่ฝั่งรายรับ */
  topExpenseCategories: { total: number; rows: CategorySlice[] };
  /** "รายได้อะไรมากที่สุด" (ฝั่งรายรับ) — ว่างที่ฝั่งรายจ่าย */
  topIncomeCategories: { total: number; rows: CategorySlice[] };
  /** "ลูกหนี้/เจ้าหนี้ที่ติดตาม" — top-5 ตามยอดค้าง (ไม่มี pinned บน AccountContact) */
  tracked: TrackedContactRow[];
  queryCount: number;
};

export async function loadOverview(
  ctx: DashCtx,
  side: OverviewSide,
  raw: RawParams,
  opts: { now?: Date; base: string },
): Promise<OverviewData> {
  const now = opts.now ?? new Date();
  const base = opts.base;
  const currentYear = Number(periodKeyBkk(now).slice(0, 4));
  const params = normalizeParams(raw, currentYear);
  const issuedRange = issuedRangeDates(params.issuedRange, now);
  const yearRange = { from: monthStart(`${params.year}-01`), to: monthEndExclusive(`${params.year}-12`) };
  const yearKeyRange = { fromKey: `${params.year}-01`, toKey: `${params.year}-12` };

  const meter: QueryMeter = { count: 0 };

  const [series, issued, tracked, sideLists] = await Promise.all([
    monthlyStatusSeries(ctx, side, params.year, meter),
    issuedByType(ctx, side, issuedRange, meter),
    topTrackedContacts(ctx, side, 5, meter),
    side === "revenue"
      ? Promise.all([
          topProducts(ctx, yearRange, 5, meter),
          topCustomers(ctx, yearRange, 5, meter),
          topIncomeCategories(ctx, yearKeyRange, 5, meter),
        ])
      : Promise.all([topVendors(ctx, yearRange, 5, meter), topExpenseCategories(ctx, yearKeyRange, 5, meter)]),
  ]);

  const common = {
    side,
    now,
    base,
    params,
    series,
    issued,
    issuedRangeLabel: issuedRange.label,
    tracked,
    queryCount: meter.count,
  };

  if (side === "revenue") {
    const [products, customers, incomeCategories] = sideLists as [
      TopProductRow[],
      TopContactRow[],
      { total: number; rows: CategorySlice[] },
    ];
    return {
      ...common,
      topProducts: products,
      topCustomers: customers,
      topIncomeCategories: incomeCategories,
      topVendors: [],
      topExpenseCategories: { total: 0, rows: [] },
    };
  }
  const [vendors, expenseCategories] = sideLists as [TopContactRow[], { total: number; rows: CategorySlice[] }];
  return {
    ...common,
    topVendors: vendors,
    topExpenseCategories: expenseCategories,
    topProducts: [],
    topCustomers: [],
    topIncomeCategories: { total: 0, rows: [] },
  };
}
