import Link from "next/link";
import { formatBaht } from "@/lib/ui/money";
import { getSettings } from "./service";
import { loadOverview, ISSUED_RANGE_OPTIONS, type OverviewParams } from "./overview";
import type { OverviewSide } from "./dashboard";
import { createDocMenuItems } from "./dashboard-home";
import { monthsToStackPoints, stackMonthsToQuarters } from "./dashboard-format";
import { TopListCard, TopRow, buildUrl } from "./ui";
import { DashQuerySelect } from "@/components/account-v2/DashQuerySelect";
import { DashSegToggle } from "@/components/account-v2/DashSegToggle";
import { DashShareBar } from "@/components/account-v2/DashShareBar";
import { DashStackChart } from "@/components/account-v2/DashStackChart";
import { OvCreateMenu } from "@/components/account-v2/OvCreateMenu";

// ─────────────────────────────────────────────────────────────
// OverviewPage — หน้า "ดูภาพรวม" รายรับ/รายจ่าย (WO 2.3) · อ้าง DESIGN-SPEC-V2 §6 + mockup f4 (รายจ่าย)
// server component + client island เล็ก ๆ (select ปี/ช่วงเวลา auto-submit ผ่าน query string เหมือนหน้าหลัก)
// ใช้ component กลางของ WO 2.2 ซ้ำ (DashQuerySelect/DashSegToggle/DashShareBar/TopListCard/TopRow)
// ตัวเดียวสร้างทั้ง 2 หน้า (side="revenue"|"expense") ตามที่ WO สั่ง — ต่างกันแค่ป้าย/ชุดข้อมูล
// ─────────────────────────────────────────────────────────────

const ISSUED_GRAYS = ["#0a0a0a", "#404040", "#737373", "#a3a3a3"];

export async function OverviewPage({
  systemId,
  tenantId,
  side,
  searchParams,
}: {
  systemId: string;
  tenantId: string;
  side: OverviewSide;
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const base = `/app/sys/${systemId}/account`;
  const [settings, data] = await Promise.all([
    getSettings(tenantId, systemId),
    loadOverview({ tenantId, systemId }, side, searchParams, { base }),
  ]);
  const currentQuery = searchParams;
  const params: OverviewParams = data.params;

  const title = side === "revenue" ? "ภาพรวมรายรับ" : "ภาพรวมรายจ่าย";
  const chartTitle = side === "revenue" ? "รายรับรายเดือน" : "ค่าใช้จ่ายรายเดือน";
  const totalLabel = side === "revenue" ? `รายรับรวมปี ${params.year}` : `ค่าใช้จ่ายรวมปี ${params.year}`;

  const monthPoints = monthsToStackPoints(data.series.months);
  const chartPoints = params.chartPeriod === "quarter" ? stackMonthsToQuarters(data.series.months) : monthPoints;

  const yearOptions = Array.from({ length: 3 }, (_, i) => params.year - 1 + i).map((y) => ({ value: String(y), label: `ปี ${y}` }));

  const createItems = createDocMenuItems(base, settings.vatRegistered)[side];
  const primaryTestId = side === "revenue" ? "INVOICE" : "EXPENSE";
  const primary = createItems.find((it) => it.testId === primaryTestId) ?? createItems[0];
  const createLabel = primary?.label ?? (side === "revenue" ? "สร้างเอกสาร" : "บันทึกค่าใช้จ่าย");

  const issuedMax = data.issued.total.amount || 1;
  const trackedTitle = side === "revenue" ? "ลูกหนี้ที่ติดตาม" : "เจ้าหนี้ที่ติดตาม";
  const trackedEmpty = side === "revenue" ? "ยังไม่มีลูกหนี้ค้างชำระ" : "ยังไม่มีเจ้าหนี้ค้างชำระ";
  const agingDirection = side === "revenue" ? "OUT" : "IN";

  return (
    <section className="flex flex-col gap-4" data-testid={side === "revenue" ? "ov-revenue" : "ov-expense"}>
      {/* ── header ── */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{title}</h1>
          <p className="text-sm text-[color:var(--color-muted)]">ปีบัญชี {params.year}</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href={`${base}/reports`} className="btn text-sm">
            พิมพ์รายงาน
          </Link>
          {createItems.length > 0 && <OvCreateMenu label={createLabel} items={createItems} />}
        </div>
      </div>

      {/* ── การ์ดกราฟ + เอกสารที่ออก ── */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        <div className="card flex min-w-0 flex-1 flex-col gap-3" data-testid="ov-chart-card">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
            <h2 className="text-sm font-medium">{chartTitle}</h2>
            <DashQuerySelect
              name="year"
              value={String(params.year)}
              options={yearOptions}
              basePath={base}
              currentQuery={currentQuery}
              ariaLabel="เลือกปี"
              testId="sel-ov-year"
            />
            <span className="flex-1" />
            <DashSegToggle
              ariaLabel="รายเดือน/รายไตรมาส"
              testIdPrefix="ov-period"
              current={params.chartPeriod}
              options={[
                { value: "month", label: "รายเดือน", href: buildUrl(base, currentQuery, { chartPeriod: undefined }) },
                { value: "quarter", label: "รายไตรมาส", href: buildUrl(base, currentQuery, { chartPeriod: "quarter" }) },
              ]}
            />
            <span className="ml-2 inline-flex items-center gap-3 text-xs text-[color:var(--color-muted)]" data-testid="ov-legend">
              <span className="inline-flex items-center gap-1">
                <i className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: "#0a0a0a" }} />
                ชำระแล้ว
              </span>
              <span className="inline-flex items-center gap-1">
                <i className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: "#a3a3a3" }} />
                รอชำระ
              </span>
              <span className="inline-flex items-center gap-1">
                <i className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: "#b91c1c" }} />
                พ้นกำหนด
              </span>
            </span>
          </div>
          <DashStackChart points={chartPoints} />
          <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            <OvStat testId="ov-total" label={totalLabel} value={data.series.total.grand} sub={`${data.series.total.grandCount} ใบ`} />
            <OvStat testId="ov-paid" label="ชำระแล้ว" value={data.series.total.paid} sub={`${data.series.total.paidCount} ใบ`} />
            <OvStat testId="ov-awaiting" label="รอชำระ" value={data.series.total.awaiting} sub={`${data.series.total.awaitingCount} ใบ`} />
            <OvStat testId="ov-overdue" label="พ้นกำหนดชำระ" value={data.series.total.overdue} sub={`${data.series.total.overdueCount} ใบ`} danger />
          </div>
        </div>

        <div className="card flex w-full flex-col gap-3 lg:w-[380px] lg:flex-none" data-testid="ov-issued-card">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-medium">เอกสารที่ออก</h2>
            <span className="flex-1" />
            <DashQuerySelect
              name="dr"
              value={params.issuedRange}
              options={ISSUED_RANGE_OPTIONS}
              basePath={base}
              currentQuery={currentQuery}
              ariaLabel="เลือกช่วงเวลา"
              testId="sel-ov-issued-range"
            />
          </div>
          <div>
            <div className="text-xs text-[color:var(--color-muted)]">รวม{data.issuedRangeLabel}</div>
            <div className="text-2xl font-semibold tabular-nums" data-testid="ov-issued-total">
              {formatBaht(data.issued.total.amount, { decimals: true })}
            </div>
          </div>
          <div className="flex h-1.5 overflow-hidden rounded-full">
            {data.issued.rows.map((r, i) => (
              <span key={r.docType} style={{ width: `${(r.amount / issuedMax) * 100}%`, background: ISSUED_GRAYS[i] ?? "#d4d4d4" }} />
            ))}
          </div>
          <div className="flex flex-col gap-1.5" data-testid="ov-issued-rows">
            {data.issued.rows.map((r, i) => (
              <DashShareBar
                key={r.docType}
                testId={`issued-type-${r.docType}`}
                label={`${r.label} (${r.count} ใบ)`}
                amountSatang={r.amount}
                percent={r.shareBp / 100}
                color={ISSUED_GRAYS[i] ?? "#d4d4d4"}
              />
            ))}
          </div>
        </div>
      </div>

      {/* ── การ์ดอันดับล่าง ── */}
      <div className={`grid grid-cols-1 gap-4 ${side === "revenue" ? "lg:grid-cols-3" : "lg:grid-cols-2"}`}>
        {side === "revenue" ? (
          <>
            <TopListCard testId="ov-top-products" title="ขายอะไรดีสุด" empty="ยังไม่มีข้อมูลการขาย">
              {data.topProducts.map((p) => (
                <TopRow key={p.productId ?? p.name} name={p.name} sub={`${p.qty} หน่วย`} amount={p.amount} max={data.topProducts[0]?.amount ?? 1} />
              ))}
            </TopListCard>
            <TopListCard testId="ov-top-customers" title="ขายใครได้มากที่สุด" empty="ยังไม่มีข้อมูลลูกค้า">
              {data.topCustomers.map((c) => (
                <TopRow key={c.contactId ?? c.name} name={c.name} sub={`${c.docCount} ใบ`} amount={c.amount} max={data.topCustomers[0]?.amount ?? 1} />
              ))}
            </TopListCard>
            <TopListCard testId="ov-top-income" title="รายได้อะไรมากที่สุด" empty="ยังไม่มีข้อมูลรายได้">
              {data.topIncomeCategories.rows.map((r) => (
                <TopRow key={r.accountCode || r.name} name={r.name} amount={r.amount} max={data.topIncomeCategories.rows[0]?.amount ?? 1} />
              ))}
            </TopListCard>
          </>
        ) : (
          <>
            <TopListCard testId="ov-top-vendors" title="คุณจ่ายให้ใครมากที่สุด" empty="ยังไม่มีข้อมูลผู้ขาย">
              {data.topVendors.map((v) => (
                <TopRow key={v.contactId ?? v.name} name={v.name} sub={`${v.docCount} ใบ`} amount={v.amount} max={data.topVendors[0]?.amount ?? 1} />
              ))}
            </TopListCard>
            <TopListCard testId="ov-top-expense-categories" title="คุณจ่ายค่าอะไรมากที่สุด" empty="ยังไม่มีข้อมูลค่าใช้จ่าย">
              {data.topExpenseCategories.rows.map((r) => (
                <TopRow key={r.accountCode || r.name} name={r.name} amount={r.amount} max={data.topExpenseCategories.rows[0]?.amount ?? 1} />
              ))}
            </TopListCard>
          </>
        )}
      </div>
      <div className="text-xs">
        <Link href={`${base}/reports/profit-loss`} style={{ color: "var(--color-accent)" }}>
          ดูรายงาน ›
        </Link>
      </div>

      {/* ── ลูกหนี้/เจ้าหนี้ที่ติดตาม (§6) — AccountContact ยังไม่มี pinned (WO 0.3 เพิ่มให้แค่ Finance/Ledger)
          ⇒ โชว์ top-5 ตามยอดค้างแทนการปักหมุด ตามที่ WO 2.3 สั่ง (ห้ามเพิ่ม schema) ── */}
      <div className="card flex flex-col gap-2" data-testid="ov-tracked-card">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-medium">{trackedTitle}</h2>
          <span className="text-xs text-[color:var(--color-muted)]">5 อันดับตามยอดค้าง</span>
        </div>
        {data.tracked.length === 0 && <p className="text-sm text-[color:var(--color-muted)]">{trackedEmpty}</p>}
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {data.tracked.map((t) => (
            <Link
              key={t.contactId}
              href={`${base}/contacts`}
              data-testid={`ov-tracked-${t.contactId}`}
              className="flex items-center gap-3 rounded-lg border px-3.5 py-3 hover:bg-[color:var(--color-surface-2)]"
            >
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{t.name}</div>
                <div className="text-xs text-[color:var(--color-muted)]">{t.count} ใบ</div>
              </div>
              <div className="tabular-nums text-sm font-medium">{formatBaht(t.outstanding, { decimals: true })}</div>
            </Link>
          ))}
        </div>
        <Link href={`${base}/aging?direction=${agingDirection}`} className="text-xs" style={{ color: "var(--color-accent)" }}>
          ดูรายงาน ›
        </Link>
      </div>
    </section>
  );
}

function OvStat({
  testId,
  label,
  value,
  sub,
  danger,
}: {
  testId: string;
  label: string;
  value: number;
  sub: string;
  danger?: boolean;
}) {
  return (
    <div>
      <div className="text-xs text-[color:var(--color-muted)]">{label}</div>
      <div className="text-base font-semibold tabular-nums" data-testid={testId} style={danger ? { color: "var(--color-danger)" } : undefined}>
        {formatBaht(value, { decimals: true })}
      </div>
      <div className="text-xs text-[color:var(--color-muted)]" style={danger ? { color: "var(--color-danger)" } : undefined}>
        {sub}
      </div>
    </div>
  );
}

export default OverviewPage;
