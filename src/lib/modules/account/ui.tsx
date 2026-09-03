import Link from "next/link";
import type { AccountDocStatus } from "@prisma/client";
import { StatusChip } from "@/components/ui/StatusChip";
import { MoneyText } from "@/components/ui/MoneyText";
import { formatBaht } from "@/lib/ui/money";
import { formatDateTh } from "@/lib/ui/date";
import { STATUS_LABEL, isOverdue } from "./service";
import { EXP_ROUTE } from "./expense";
import { loadDashboardHome, issuableDocTypes } from "./dashboard-home";
import { pinFinanceAccountsAction, pinLedgerAccountsAction } from "./dashboard-actions";
import { monthsToChartPoints, monthsToQuarters, prevPeriodKey, THAI_MONTH_SHORT, type ChartPoint } from "./dashboard-format";
import { categoryBreakdownFromRows } from "./dashboard";
import { getDashCollapsed } from "@/components/account-v2/dash-collapse";
import { DashCollapseToggle } from "@/components/account-v2/DashCollapseToggle";
import { DashCreateMenu } from "@/components/account-v2/DashCreateMenu";
import { DashChecklist } from "@/components/account-v2/DashChecklist";
import { DashChart } from "@/components/account-v2/DashChart";
import { DashDonut } from "@/components/account-v2/DashDonut";
import { DashShareBar } from "@/components/account-v2/DashShareBar";
import { DashSegToggle } from "@/components/account-v2/DashSegToggle";
import { DashQuerySelect } from "@/components/account-v2/DashQuerySelect";
import { DashPinModal } from "@/components/account-v2/DashPinModal";
import { AccountIcon } from "@/components/account-v2/AccountIcon";

// โทนสีสถานะบัญชี: อยู่ระหว่างทาง=muted · สำเร็จ/มีผล=strong · เสีย/ยกเลิก=danger
export function accountTone(status: string): "muted" | "strong" | "danger" {
  if (status === "REJECTED" || status === "VOIDED" || status === "CANCELLED") return "danger";
  if (
    status === "PAID" ||
    status === "ACCEPTED" ||
    status === "ISSUED" ||
    status === "APPROVED" ||
    status === "RECEIVED" ||
    status === "DEDUCTED"
  )
    return "strong";
  return "muted";
}

// ป้ายสถานะเอกสารบัญชี (ผ่าน StatusChip กลาง) — overdue = แดง "พ้นกำหนด"
export function StatusBadge({
  status,
  overdue,
}: {
  status: AccountDocStatus;
  overdue?: boolean;
}) {
  if (overdue) return <StatusChip value="พ้นกำหนด" tone="danger" />;
  return <StatusChip value={status} map={STATUS_LABEL} toneOf={accountTone} />;
}

// route จริงของเอกสารแต่ละชนิด — ฝั่งรายรับ 8 ชนิดอยู่ใต้ docs/<docType>/<id> (generic list route)
// ฝั่งรายจ่ายแยก slug ต่อชนิด (purchase/expense/po/asset-buy) — ทะเบียนกลาง EXP_ROUTE (expense.ts)
const EXP_SLUG: Partial<Record<string, string>> = EXP_ROUTE;
function docHref(base: string, docType: string, id: string): string {
  const slug = EXP_SLUG[docType];
  return slug ? `${base}${slug}/${id}` : `${base}/docs/${docType}/${id}`;
}

// ─────────────────────────────────────────────────────────────
// AccountContent — หน้าหลัก V2 (WO 2.2) · อ้าง DESIGN-SPEC-V2 §4 (ลำดับบล็อก) + f1/f2/f11 (mockup)
// server component + client island เล็ก ๆ ตามจุดที่ต้อง interactive จริง (ปี/เดือน/ตัวกรอง = query string
// ธรรมดา ไม่ใช้ client JS เลย ยกเว้น select ที่ auto-submit) · เรียก dashboardSnapshot ครั้งเดียวผ่าน
// loadDashboardHome() — ดู src/lib/modules/account/dashboard-home.ts (แยกจากไฟล์นี้เพื่อให้ QC import ตรงได้)
// ─────────────────────────────────────────────────────────────

export async function AccountContent({
  systemId,
  tenantId,
  searchParams,
}: {
  systemId: string;
  tenantId: string;
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const base = `/app/sys/${systemId}/account`;
  const [home, ssrCollapsed] = await Promise.all([
    loadDashboardHome({ tenantId, systemId }, searchParams, { base }),
    getDashCollapsed(),
  ]);

  const showChecklist = home.params.forceChecklist || !home.checklist.allDone;
  const s = home.snapshot;
  const monthPoints: ChartPoint[] = monthsToChartPoints(s.series.months);
  const chartPoints = home.params.chartPeriod === "quarter" ? monthsToQuarters(s.series.months) : monthPoints;
  const currentQuery = searchParams;

  const arap = home.params.side === "payable" ? s.arap.payable : s.arap.receivable;
  const agingRows: { key: keyof typeof arap.aging; label: string; danger?: boolean }[] = [
    { key: "notDueSatang", label: "ยังไม่ครบกำหนด" },
    { key: "d1_30Satang", label: "1–30 วัน" },
    { key: "d31_60Satang", label: "31–60 วัน" },
    { key: "d61_90Satang", label: "61–90 วัน" },
    { key: "d90plusSatang", label: "เกิน 90 วัน", danger: true },
  ];
  const agingGrays = ["#d4d4d4", "#a3a3a3", "#737373", "#404040", "#b91c1c"];

  const yoy = (bp: number | null) => (bp === null ? "—" : `${bp >= 0 ? "+" : ""}${(bp / 100).toFixed(1)}% เทียบปีก่อน`);

  const incomeSlices = home.income.rows.map((r, i) => ({
    name: r.name,
    amount: r.amount,
    color: i === 0 ? "#1d4ed8" : ["#404040", "#737373", "#a3a3a3", "#d4d4d4"][i - 1] ?? "#d4d4d4",
  }));
  const expenseSlices = home.expense.rows.map((r, i) => ({
    name: r.name,
    amount: r.amount,
    color: ["#0a0a0a", "#404040", "#737373", "#a3a3a3", "#d4d4d4"][i] ?? "#d4d4d4",
  }));

  // "เทียบเดือนก่อน" ใต้โดนัท (§4 ข้อ 5) — สรุปจาก glRows เดิม (0 query เพิ่ม เหมือน im/em)
  const incomeMomPrev = categoryBreakdownFromRows(s.glRows, prevPeriodKey(home.params.incomeMonth), "income", 0).total;
  const incomeMomDelta = home.income.total - incomeMomPrev;
  const incomeMomPct = incomeMomPrev !== 0 ? (incomeMomDelta / Math.abs(incomeMomPrev)) * 100 : null;
  const expenseMomPrev = categoryBreakdownFromRows(s.glRows, prevPeriodKey(home.params.expenseMonth), "expense", 0).total;
  const expenseMomDelta = home.expense.total - expenseMomPrev;
  const expenseMomPct = expenseMomPrev !== 0 ? (expenseMomDelta / Math.abs(expenseMomPrev)) * 100 : null;

  const pendingRows = [
    { key: "quotationAwaitingAccept", label: "ใบเสนอราคารอลูกค้าตอบรับ", icon: "doc", href: `${base}/docs/QUOTATION?tab=awaiting` },
    { key: "poAwaitingApproval", label: "ใบสั่งซื้อรออนุมัติ", icon: "check", href: `${base}/po?tab=awaiting_approval` },
    { key: "depositAwaitingDeduct", label: "มัดจำรอนำไปหัก", icon: "cash", href: `${base}/docs/DEPOSIT_RECEIPT?tab=deduct` },
    { key: "needsReview", label: "รายการที่ต้องตรวจในสมุดรายวัน", icon: "flag", href: `${base}/journal`, danger: true },
    { key: "purchaseTaxAwaiting", label: "ใบกำกับภาษีซื้อรอรับจากผู้ขาย", icon: "file", href: `${base}/asset-buy?docType=PURCHASE_TAX_INVOICE&tab=awaiting_receive` },
    { key: "recurringDraftsAwaiting", label: "เอกสารประจำรอตรวจ", icon: "clock", href: `${base}/recurring` },
  ] as const;

  const financeMax = s.cash.accounts.map((a) => Math.max(a.balance, 1));
  const financeMeterTotal = s.cash.accounts.reduce((sum, a) => sum + a.balance, 0) || 1;
  const financeGrays = ["#0a0a0a", "#737373", "#a3a3a3", "#d4d4d4"];

  const docTypeOptions = issuableDocTypes(base, home.vatRegistered);
  const yearOptions = Array.from({ length: 3 }, (_, i) => s.year - 1 + i).map((y) => ({ value: String(y), label: `ปี ${y}` }));
  const monthOptions = (yearBase: number) =>
    Array.from({ length: 24 }, (_, i) => {
      const d = new Date(Date.UTC(yearBase - 1, 0, 1));
      d.setUTCMonth(d.getUTCMonth() + i);
      const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
      return { value: key, label: `${THAI_MONTH_SHORT[d.getUTCMonth()]} ${d.getUTCFullYear()}` };
    });

  const createMenuBtn = <DashCreateMenu menu={home.createMenu} />;

  return (
    <section className="flex flex-col gap-4" data-testid="dash-home">
      {/* ── header (§4 ข้อ 1) ── */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">หน้าหลัก</h1>
          <p className="text-sm text-[color:var(--color-muted)]">ข้อมูล ณ {formatDateTh(new Date(`${s.asOf}T00:00:00Z`))}</p>
        </div>
        <div className="hidden items-center gap-2 lg:flex">
          <DashCollapseToggle ssrCollapsed={ssrCollapsed} />
          {createMenuBtn}
        </div>
      </div>
      <div className="lg:hidden">
        <DashCreateMenu menu={home.createMenu} fullWidth testId="btn-create-doc-m" menuTestId="create-doc-menu-m" />
      </div>
      <div className="lg:hidden">
        <DashCollapseToggle ssrCollapsed={ssrCollapsed} />
      </div>

      {/* ── เช็กลิสต์เริ่มต้น 5 ขั้น (§0.3 ข้อ 2) ── */}
      {showChecklist && <DashChecklist checklist={home.checklist} />}

      {/* ── KPI 4 การ์ด (§4 ข้อ 2) ── */}
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <KpiCard testId="kpi-receivable" icon="in" label="ค้างรับ (ลูกหนี้)" amount={s.kpi.receivable.amount} sub={`${s.kpi.receivable.count} ใบ`} />
        <KpiCard testId="kpi-payable" icon="out" label="ค้างจ่าย (เจ้าหนี้)" amount={s.kpi.payable.amount} sub={`${s.kpi.payable.count} ใบ`} />
        <KpiCard testId="kpi-overdue" icon="warn" label="พ้นกำหนดชำระ" amount={s.kpi.overdue.amount} sub={`${s.kpi.overdue.count} ใบ`} danger />
        <KpiCard testId="kpi-cash" icon="wallet" label="เงินคงเหลือรวม" amount={s.kpi.cashTotal} sub={`${s.cash.accounts.length} บัญชีเงิน`} />
      </div>

      {/* ── กราฟรายรับ-รายจ่าย + รอรับชำระ/รอชำระ (§4 ข้อ 3–4) ── */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        <details open data-dash-collapsible="1" className="group card flex min-w-0 flex-1 flex-col gap-0 p-0" data-testid="dash-block-chart">
          <summary className="flex cursor-pointer list-none flex-wrap items-center gap-2 px-5 py-4">
            <h2 className="text-sm font-medium">ภาพรวมรายรับและรายจ่าย</h2>
            <DashQuerySelect
              name="year"
              value={String(s.year)}
              options={yearOptions}
              basePath={base}
              currentQuery={currentQuery}
              ariaLabel="เลือกปี"
              testId="sel-chart-year"
            />
            <span className="flex-1" />
            <DashSegToggle
              ariaLabel="รายเดือน/รายไตรมาส"
              testIdPrefix="chart-period"
              current={home.params.chartPeriod}
              options={[
                { value: "month", label: "รายเดือน", href: buildUrl(base, currentQuery, { chartPeriod: undefined }) },
                { value: "quarter", label: "รายไตรมาส", href: buildUrl(base, currentQuery, { chartPeriod: "quarter" }) },
              ]}
            />
            <span className="ml-2 inline-flex items-center gap-3 text-xs text-[color:var(--color-muted)]">
              <span className="inline-flex items-center gap-1">
                <i className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: "#1d4ed8" }} />
                รายได้
              </span>
              <span className="inline-flex items-center gap-1">
                <i className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: "#a3a3a3" }} />
                ค่าใช้จ่าย
              </span>
              <span className="inline-flex items-center gap-1">
                <i className="inline-block h-0.5 w-3" style={{ background: "#0a0a0a" }} />
                กำไร/ขาดทุน
              </span>
            </span>
            <span aria-hidden className="text-[color:var(--color-muted)] transition-transform group-open:rotate-180">▾</span>
          </summary>
          <div className="flex min-w-0 flex-col gap-3 px-5 pb-5">
            <div className="grid grid-cols-3 gap-3 text-sm">
              <StatBlock label={`รายได้ปี ${s.year}`} value={s.series.total.revenue} note={yoy(s.series.yoyBp.revenue)} />
              <StatBlock label={`ค่าใช้จ่ายปี ${s.year}`} value={s.series.total.expense} note={yoy(s.series.yoyBp.expense)} />
              <StatBlock label={`กำไรสุทธิปี ${s.year}`} value={s.series.total.profit} note={yoy(s.series.yoyBp.profit)} />
            </div>
            <DashChart points={chartPoints} />
          </div>
        </details>

        <details open data-dash-collapsible="1" className="group card flex w-full flex-col gap-0 p-0 lg:w-[380px] lg:flex-none" data-testid="dash-block-arap">
          <summary className="flex cursor-pointer list-none flex-wrap items-center gap-2 px-5 py-4">
            <h2 className="text-sm font-medium">รอรับชำระ / รอชำระ</h2>
            <span className="flex-1" />
            <DashSegToggle
              ariaLabel="ลูกหนี้หรือเจ้าหนี้"
              testIdPrefix="arap-side"
              current={home.params.side}
              options={[
                { value: "receivable", label: "ลูกหนี้", href: buildUrl(base, currentQuery, { side: undefined }) },
                { value: "payable", label: "เจ้าหนี้", href: buildUrl(base, currentQuery, { side: "payable" }) },
              ]}
            />
            <span aria-hidden className="text-[color:var(--color-muted)] transition-transform group-open:rotate-180">▾</span>
          </summary>
          <div className="flex flex-col gap-3 px-5 pb-5">
            <div className="grid grid-cols-3 gap-3 text-sm">
              <StatBlock label="ใบรอชำระ" value={null} display={`${arap.count} ใบ`} />
              <StatBlock label={home.params.side === "payable" ? "ยอดค้างจ่าย" : "ยอดค้างรับ"} value={arap.amount} />
              <StatBlock label="พ้นกำหนด" value={arap.overdueAmount} danger note={`${arap.overdueCount} ใบ`} />
            </div>
            <div className="hr border-t" />
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium">อายุหนี้ 5 ช่วง</span>
              <span className="text-[color:var(--color-muted)]">รวม {formatBaht(arap.aging.totalSatang)}</span>
            </div>
            <div className="flex flex-col gap-1.5" data-testid="aging-bars">
              {agingRows.map((r, i) => (
                <DashShareBar
                  key={r.key}
                  testId={`aging-${r.key}`}
                  label={r.label}
                  amountSatang={arap.aging[r.key]}
                  percent={arap.aging.totalSatang > 0 ? (arap.aging[r.key] / arap.aging.totalSatang) * 100 : 0}
                  color={agingGrays[i]}
                  danger={r.danger}
                />
              ))}
            </div>
            <Link href={`${base}/aging`} className="text-xs" style={{ color: "var(--color-accent)" }}>
              ดูรายงานอายุหนี้ทั้งหมด ›
            </Link>
          </div>
        </details>
      </div>

      {/* ── โดนัทรายได้/ค่าใช้จ่ายเดือนนี้ + เงินคุณอยู่ไหน (§4 ข้อ 5) ── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <details open data-dash-collapsible="1" className="group card flex flex-col gap-0 p-0" data-testid="dash-block-income">
          <summary className="flex cursor-pointer list-none items-center gap-2 px-5 py-4">
            <h2 className="text-sm font-medium">รายได้เดือนนี้</h2>
            <span className="flex-1" />
            <DashQuerySelect name="im" value={home.params.incomeMonth} options={monthOptions(s.year)} basePath={base} currentQuery={currentQuery} ariaLabel="เลือกเดือนรายได้" testId="sel-income-month" />
            <span aria-hidden className="text-[color:var(--color-muted)] transition-transform group-open:rotate-180">▾</span>
          </summary>
          <div className="flex flex-col gap-3 px-5 pb-5">
            <div className="flex items-center gap-3.5">
              <DashDonut title="รายได้เดือนนี้" total={home.income.total} slices={incomeSlices} />
              <ul className="min-w-0 flex-1 text-xs">
                {home.income.rows.map((r, i) => (
                  <li key={r.accountCode || r.name} className="flex items-center gap-2 py-1">
                    <i className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: incomeSlices[i]?.color }} />
                    <span className="min-w-0 flex-1 truncate">{r.name}</span>
                    <span className="tabular-nums">{formatBaht(r.amount)}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="hr border-t" />
            <div className="flex items-center text-xs">
              <span className="text-[color:var(--color-muted)]">เทียบเดือนก่อน</span>
              <span className="ml-1.5 font-medium tabular-nums">
                {incomeMomDelta >= 0 ? "+" : "−"}
                {formatBaht(Math.abs(incomeMomDelta))} ({incomeMomPct === null ? "—" : `${incomeMomPct >= 0 ? "+" : ""}${incomeMomPct.toFixed(1)}%`})
              </span>
              <span className="flex-1" />
              <Link href={`${base}/reports/profit-loss`} style={{ color: "var(--color-accent)" }}>
                ดูรายงาน ›
              </Link>
            </div>
          </div>
        </details>

        <details open data-dash-collapsible="1" className="group card flex flex-col gap-0 p-0" data-testid="dash-block-expense">
          <summary className="flex cursor-pointer list-none items-center gap-2 px-5 py-4">
            <h2 className="text-sm font-medium">ค่าใช้จ่ายเดือนนี้</h2>
            <span className="flex-1" />
            <DashQuerySelect name="em" value={home.params.expenseMonth} options={monthOptions(s.year)} basePath={base} currentQuery={currentQuery} ariaLabel="เลือกเดือนค่าใช้จ่าย" testId="sel-expense-month" />
            <span aria-hidden className="text-[color:var(--color-muted)] transition-transform group-open:rotate-180">▾</span>
          </summary>
          <div className="flex flex-col gap-3 px-5 pb-5">
            <div className="flex items-center gap-3.5">
              <DashDonut title="ค่าใช้จ่ายเดือนนี้" total={home.expense.total} slices={expenseSlices} />
              <ul className="min-w-0 flex-1 text-xs">
                {home.expense.rows.map((r, i) => (
                  <li key={r.accountCode || r.name} className="flex items-center gap-2 py-1">
                    <i className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: expenseSlices[i]?.color }} />
                    <span className="min-w-0 flex-1 truncate">{r.name}</span>
                    <span className="tabular-nums">{formatBaht(r.amount)}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="hr border-t" />
            <div className="flex items-center text-xs">
              <span className="text-[color:var(--color-muted)]">เทียบเดือนก่อน</span>
              <span className="ml-1.5 font-medium tabular-nums">
                {expenseMomDelta >= 0 ? "+" : "−"}
                {formatBaht(Math.abs(expenseMomDelta))} ({expenseMomPct === null ? "—" : `${expenseMomPct >= 0 ? "+" : ""}${expenseMomPct.toFixed(1)}%`})
              </span>
              <span className="flex-1" />
              <Link href={`${base}/reports/profit-loss`} style={{ color: "var(--color-accent)" }}>
                ดูรายงาน ›
              </Link>
            </div>
          </div>
        </details>

        <details open data-dash-collapsible="1" className="group card flex flex-col gap-0 p-0" data-testid="dash-block-cash">
          <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-4">
            <h2 className="text-sm font-medium">เงินคุณอยู่ไหน</h2>
            <span aria-hidden className="text-[color:var(--color-muted)] transition-transform group-open:rotate-180">▾</span>
          </summary>
          <div className="flex flex-col gap-2 px-5 pb-5">
            <div className="text-xs text-[color:var(--color-muted)]">ยอดรวมทุกบัญชี</div>
            <div className="text-2xl font-semibold tabular-nums">{formatBaht(s.cash.total)}</div>
            <div className="flex h-1.5 overflow-hidden rounded-full">
              {s.cash.accounts.map((a, i) => (
                <span key={a.id} style={{ width: `${(financeMax[i] / financeMeterTotal) * 100}%`, background: financeGrays[i] ?? "#d4d4d4" }} />
              ))}
            </div>
            <ul className="text-xs">
              {s.cash.accounts.map((a, i) => (
                <li key={a.id} className="flex items-center gap-2 py-1.5">
                  <i className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: financeGrays[i] ?? "#d4d4d4" }} />
                  <span className="min-w-0 flex-1 truncate">{a.name}</span>
                  <span className="tabular-nums">{formatBaht(a.balance)}</span>
                </li>
              ))}
            </ul>
          </div>
        </details>
      </div>

      {/* ── เอกสารที่ออก (§4 ข้อ 6) ── */}
      <details open data-dash-collapsible="1" className="group card flex flex-col gap-0 p-0" data-testid="dash-block-issued">
        <summary className="flex cursor-pointer list-none flex-wrap items-center gap-2 px-5 py-4">
          <h2 className="text-sm font-medium">เอกสารที่ออก</h2>
          <DashQuerySelect name="dt" value={home.params.issuedDocType} options={docTypeOptions} basePath={base} currentQuery={currentQuery} ariaLabel="เลือกชนิดเอกสาร" testId="sel-issued-doctype" />
          <span className="text-xs text-[color:var(--color-muted)]">ปี {s.year}</span>
          <span className="flex-1" />
          <span aria-hidden className="text-[color:var(--color-muted)] transition-transform group-open:rotate-180">▾</span>
        </summary>
        <div className="flex flex-col gap-1.5 px-5 pb-5">
          {s.issued.rows.map((r) => (
            <DashShareBar
              key={r.key}
              testId={`issued-${r.key}`}
              label={`${r.label} (${r.count})`}
              amountSatang={r.amount}
              percent={r.shareBp / 100}
              color="#1d4ed8"
            />
          ))}
        </div>
      </details>

      {/* ── งานที่รอคุณ + เอกสารล่าสุด (§4 ข้อ 7) ── */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        <details open data-dash-collapsible="1" className="group card flex w-full flex-col gap-0 p-0 lg:w-[336px] lg:flex-none" data-testid="dash-block-pending">
          <summary className="flex cursor-pointer list-none items-center gap-2 px-5 py-4">
            <h2 className="text-sm font-medium">งานที่รอคุณ</h2>
            <span className="flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-xs" style={{ background: "var(--color-ink)", color: "var(--color-surface)" }}>
              {s.pending.total}
            </span>
            <span className="flex-1" />
            <span aria-hidden className="text-[color:var(--color-muted)] transition-transform group-open:rotate-180">▾</span>
          </summary>
          <div className="flex flex-col gap-1 px-5 pb-5" data-testid="pending-tasks">
            {pendingRows
              .filter((r) => s.pending[r.key] > 0)
              .map((r) => (
                <Link key={r.key} href={r.href} className="flex items-center gap-2 rounded-lg px-1.5 py-1.5 text-sm hover:bg-[color:var(--color-surface-2)]" data-testid={`pending-row-${r.key}`}>
                  <AccountIcon
                    name={r.icon}
                    className={`h-4 w-4 shrink-0 ${"danger" in r && r.danger ? "text-[color:var(--color-danger)]" : "text-[color:var(--color-muted)]"}`}
                  />
                  <span className="min-w-0 flex-1 truncate" style={"danger" in r && r.danger ? { color: "var(--color-danger)" } : undefined}>
                    {r.label}
                  </span>
                  <span
                    className="flex h-5 min-w-5 items-center justify-center rounded-full border px-1.5 text-xs"
                    style={"danger" in r && r.danger ? { borderColor: "var(--color-danger)", color: "var(--color-danger)" } : undefined}
                  >
                    {s.pending[r.key]}
                  </span>
                  <span aria-hidden className="text-[color:var(--color-muted)]">›</span>
                </Link>
              ))}
            {s.pending.total === 0 && <p className="px-1.5 py-2 text-sm text-[color:var(--color-muted)]">ไม่มีงานค้างตอนนี้</p>}
          </div>
        </details>

        <details open data-dash-collapsible="1" className="group card flex min-w-0 flex-1 flex-col gap-0 p-0" data-testid="dash-block-recent">
          <summary className="flex cursor-pointer list-none items-center gap-2 px-5 py-4">
            <h2 className="text-sm font-medium">เอกสารล่าสุด</h2>
            <span className="flex-1" />
            <Link href={`${base}/docs/INVOICE?tab=all`} className="text-xs" style={{ color: "var(--color-accent)" }}>
              ดูทั้งหมด ›
            </Link>
            <span aria-hidden className="text-[color:var(--color-muted)] transition-transform group-open:rotate-180">▾</span>
          </summary>
          <div className="px-5 pb-5">
            {/* เดสก์ท็อป: ตาราง (f1) */}
            <table className="hidden w-full text-sm sm:table" data-testid="recent-table">
              <thead>
                <tr className="text-left text-xs text-[color:var(--color-muted)]">
                  <th className="pb-2 font-normal">เลขที่</th>
                  <th className="pb-2 font-normal">ชนิด</th>
                  <th className="pb-2 font-normal">ผู้ติดต่อ</th>
                  <th className="pb-2 text-right font-normal">ยอดรวม</th>
                  <th className="pb-2 font-normal">สถานะ</th>
                </tr>
              </thead>
              <tbody>
                {s.recent.map((r) => {
                  const overdue = isOverdue({
                    status: r.status,
                    dueDate: r.dueDate ? new Date(r.dueDate) : null,
                    validUntil: r.validUntil ? new Date(r.validUntil) : null,
                  });
                  return (
                    <tr key={r.id} className="border-t" data-testid={`recent-row-${r.id}`}>
                      <td className="py-2">
                        <Link href={docHref(base, r.docType, r.id)} style={{ color: "var(--color-accent)" }}>
                          {r.docNo ?? "(ร่าง)"}
                        </Link>
                      </td>
                      <td className="py-2 text-[color:var(--color-muted)]">{r.docTypeLabel}</td>
                      <td className="py-2">{r.contactName}</td>
                      <td className="py-2 text-right tabular-nums">
                        <MoneyText satang={r.grandTotal} />
                      </td>
                      <td className="py-2">
                        <StatusBadge status={r.status} overdue={overdue} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {/* มือถือ: การ์ดแถว (f11) */}
            <div className="flex flex-col gap-2 sm:hidden">
              {s.recent.map((r) => {
                const overdue = isOverdue({ status: r.status, dueDate: r.dueDate ? new Date(r.dueDate) : null, validUntil: r.validUntil ? new Date(r.validUntil) : null });
                return (
                  <Link key={r.id} href={docHref(base, r.docType, r.id)} className="flex flex-col gap-0.5 rounded-lg border px-3 py-2 text-sm" data-testid={`recent-card-${r.id}`}>
                    <div className="flex items-center justify-between gap-2">
                      <span style={{ color: "var(--color-accent)" }}>{r.docNo ?? "(ร่าง)"}</span>
                      <StatusBadge status={r.status} overdue={overdue} />
                    </div>
                    <div className="text-[color:var(--color-muted)]">{r.contactName}</div>
                    <div className="tabular-nums">
                      <MoneyText satang={r.grandTotal} />
                    </div>
                  </Link>
                );
              })}
            </div>
            {s.recent.length === 0 && <p className="py-4 text-sm text-[color:var(--color-muted)]">ยังไม่มีเอกสาร</p>}
          </div>
        </details>
      </div>

      {/* ── ขายอะไรดีสุด / ขายใครได้มากที่สุด / รายได้อะไรมากที่สุด (§4 ข้อ 8) ── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <TopListCard testId="top-products" title="ขายอะไรดีสุด" empty="ยังไม่มีข้อมูลการขาย">
          {home.snapshot.topProducts.map((p) => (
            <TopRow key={p.productId ?? p.name} name={p.name} sub={`${p.qty} หน่วย`} amount={p.amount} max={home.snapshot.topProducts[0]?.amount ?? 1} />
          ))}
        </TopListCard>
        <TopListCard testId="top-customers" title="ขายใครได้มากที่สุด" empty="ยังไม่มีข้อมูลลูกค้า">
          {home.snapshot.topCustomers.map((c) => (
            <TopRow key={c.contactId ?? c.name} name={c.name} sub={`${c.docCount} ใบ`} amount={c.amount} max={home.snapshot.topCustomers[0]?.amount ?? 1} />
          ))}
        </TopListCard>
        <TopListCard testId="top-income" title="รายได้อะไรมากที่สุด" empty="ยังไม่มีข้อมูลรายได้">
          {home.topIncomeCategories.rows.map((r) => (
            <TopRow key={r.accountCode || r.name} name={r.name} amount={r.amount} max={home.topIncomeCategories.rows[0]?.amount ?? 1} />
          ))}
        </TopListCard>
      </div>

      {/* ── บัญชีเงินที่ติดตาม + บัญชีที่ติดตาม (§4 ข้อ 9) ── */}
      <details open data-dash-collapsible="1" className="group card flex flex-col gap-0 p-0" data-testid="dash-block-pinned-finance">
        <summary className="flex cursor-pointer list-none flex-wrap items-center gap-2 px-5 py-4">
          <h2 className="text-sm font-medium">บัญชีเงินที่ติดตาม</h2>
          <span className="text-xs text-[color:var(--color-muted)]">ปักหมุดได้สูงสุด 4 บัญชี</span>
          <span className="flex-1" />
          <DashPinModal
            triggerLabel="เลือกบัญชี"
            title="เลือกบัญชีเงินที่ติดตาม"
            systemId={systemId}
            max={4}
            action={pinFinanceAccountsAction}
            testId="pin-finance"
            items={s.cash.accounts.map((a) => ({ id: a.id, name: a.name, sub: formatBaht(a.balance), pinned: a.pinned }))}
          />
          <span aria-hidden className="text-[color:var(--color-muted)] transition-transform group-open:rotate-180">▾</span>
        </summary>
        <div className="grid grid-cols-1 gap-2 px-5 pb-5 sm:grid-cols-2 lg:grid-cols-3">
          {s.cash.accounts.filter((a) => a.pinned).length === 0 && (
            <p className="text-sm text-[color:var(--color-muted)]">ยังไม่ได้ปักหมุดบัญชีเงิน — กด &quot;+ เลือกบัญชี&quot;</p>
          )}
          {s.cash.accounts
            .filter((a) => a.pinned)
            .map((a) => (
              <div key={a.id} className="flex items-center gap-3 rounded-lg border px-3.5 py-3">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{a.name}</div>
                </div>
                <div className="text-right">
                  <div className="tabular-nums font-medium">{formatBaht(a.balance)}</div>
                  <div className="text-xs text-[color:var(--color-muted)]">
                    เดือนนี้ {a.monthDelta >= 0 ? "+" : "−"}
                    {formatBaht(Math.abs(a.monthDelta))}
                  </div>
                </div>
              </div>
            ))}
        </div>
      </details>

      <details open data-dash-collapsible="1" className="group card flex flex-col gap-0 p-0" data-testid="dash-block-pinned-ledger">
        <summary className="flex cursor-pointer list-none flex-wrap items-center gap-2 px-5 py-4">
          <h2 className="text-sm font-medium">บัญชีที่ติดตาม</h2>
          <span className="text-xs text-[color:var(--color-muted)]">ปักหมุดได้สูงสุด 4 บัญชี</span>
          <span className="flex-1" />
          <DashPinModal
            triggerLabel="เลือกบัญชี"
            title="เลือกบัญชีที่ติดตาม"
            systemId={systemId}
            max={4}
            action={pinLedgerAccountsAction}
            testId="pin-ledger"
            items={home.ledgerAccounts.map((l) => ({ id: l.id, name: `${l.code} ${l.name}`, pinned: l.pinned }))}
          />
          <span aria-hidden className="text-[color:var(--color-muted)] transition-transform group-open:rotate-180">▾</span>
        </summary>
        <div className="grid grid-cols-1 gap-2 px-5 pb-5 sm:grid-cols-2 lg:grid-cols-3">
          {home.ledgerAccounts.filter((l) => l.pinned).length === 0 && (
            <p className="text-sm text-[color:var(--color-muted)]">ยังไม่ได้ปักหมุดบัญชี — กด &quot;+ เลือกบัญชี&quot;</p>
          )}
          {home.ledgerAccounts
            .filter((l) => l.pinned)
            .map((l) => (
              <Link key={l.id} href={`${base}/ledger?account=${l.id}`} className="flex items-center gap-3 rounded-lg border px-3.5 py-3 hover:bg-[color:var(--color-surface-2)]">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{l.name}</div>
                  <div className="text-xs text-[color:var(--color-muted)]">{l.code}</div>
                </div>
              </Link>
            ))}
        </div>
      </details>
    </section>
  );
}

// ─────────────────── การ์ดเล็ก/แถวย่อย ───────────────────

function KpiCard({
  icon,
  label,
  amount,
  sub,
  danger,
  testId,
}: {
  icon: string;
  label: string;
  amount: number;
  sub: string;
  danger?: boolean;
  testId: string;
}) {
  return (
    <div className="card" data-testid={testId}>
      <div className="flex items-center gap-1.5 text-xs text-[color:var(--color-muted)]">
        <AccountIcon name={icon} className="h-4 w-4" />
        {label}
      </div>
      <div className="text-lg font-semibold tabular-nums" style={danger ? { color: "var(--color-danger)" } : undefined}>
        {formatBaht(amount)}
      </div>
      <div className="text-xs text-[color:var(--color-muted)]">{sub}</div>
    </div>
  );
}

function StatBlock({
  label,
  value,
  display,
  note,
  danger,
}: {
  label: string;
  value: number | null;
  display?: string;
  note?: string;
  danger?: boolean;
}) {
  return (
    <div>
      <div className="text-xs text-[color:var(--color-muted)]">{label}</div>
      <div className="text-base font-semibold tabular-nums" style={danger ? { color: "var(--color-danger)" } : undefined}>
        {display ?? (value !== null ? formatBaht(value) : "—")}
      </div>
      {note && <div className="text-xs text-[color:var(--color-muted)]">{note}</div>}
    </div>
  );
}

function TopListCard({
  testId,
  title,
  empty,
  children,
}: {
  testId: string;
  title: string;
  empty: string;
  children: React.ReactNode;
}) {
  const hasChildren = Array.isArray(children) ? children.length > 0 : Boolean(children);
  return (
    <div className="card flex flex-col gap-2" data-testid={testId}>
      <h2 className="text-sm font-medium">{title}</h2>
      {hasChildren ? <div className="flex flex-col gap-2">{children}</div> : <p className="text-sm text-[color:var(--color-muted)]">{empty}</p>}
    </div>
  );
}

function TopRow({ name, sub, amount, max }: { name: string; sub?: string; amount: number; max: number }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between gap-2 text-sm">
        <span className="min-w-0 flex-1 truncate">{name}</span>
        <span className="tabular-nums font-medium">{formatBaht(amount)}</span>
      </div>
      <div className="flex items-center gap-2">
        {sub && <span className="w-16 shrink-0 text-xs text-[color:var(--color-muted)]">{sub}</span>}
        <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-[color:var(--color-surface-2)]">
          <span className="block h-full rounded-full" style={{ width: `${max > 0 ? Math.max((amount / max) * 100, 2) : 0}%`, background: "#1d4ed8" }} />
        </span>
      </div>
    </div>
  );
}

// สร้าง href ใหม่จาก query ปัจจุบัน — ใช้กับ toggle ที่เป็นลิงก์ล้วน (ไม่มี client JS)
function buildUrl(
  pathname: string,
  current: Record<string, string | string[] | undefined>,
  patch: Record<string, string | undefined>,
): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(current)) {
    if (v === undefined) continue;
    if (Array.isArray(v)) v.forEach((vv) => p.append(k, vv));
    else p.set(k, v);
  }
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined || v === "") p.delete(k);
    else p.set(k, v);
  }
  const qs = p.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}
