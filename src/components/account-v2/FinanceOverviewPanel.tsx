"use client";

// FinanceOverviewPanel — หน้า "ดูภาพรวม" การเงิน V2 (WO 5.2 · DESIGN-SPEC-V2 §10.2)
// เฟรมอ้างอิง: docs/design/account-v2/f7-finance-overview.png (+ -menu.png) · checklist เต็มใน ledger/wo-notes/5.2.md
//
// โครงสร้างเหมือน f7: บัญชีเงินที่ติดตาม (การ์ด, ปักหมุด ≤4) → ตารางเงินเข้า-ออก (6 ไทล์ + ปฏิทินเดือน)
// → ขวา: กระทบยอดธนาคาร (สรุป/ลิงก์เท่านั้น — WO 5.3 ทำหน้าจับคู่จริง) + รายการที่กระทบยอดแล้ว + เงินคุณอยู่ไหน
import { useState, useTransition } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { AccountIcon } from "./AccountIcon";
import { SlideOver } from "./SlideOver";
import { DashPinModal } from "./DashPinModal";
import { FinanceSubTabsBar } from "./FinanceSubTabsBar";
import type { FinanceSubTab } from "./FinancePanel";
import { formatBaht } from "@/lib/ui/money";
import { formatDateTh } from "@/lib/ui/date";
import { pinFinanceAccountsAction } from "@/lib/modules/account/dashboard-actions";
import { financeDayDetailAction } from "@/app/app/sys/[id]/account/finance/overview/actions";
import type { FinanceOverview, FinanceDayDetail } from "@/lib/modules/account/finance-overview";

const THAI_MONTH_FULL = [
  "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
  "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
];
const THAI_WEEKDAY = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"]; // อาทิตย์เป็นวันแรก (ตรงภาพ f7 — ไม่ใช่จันทร์)

function monthLabelTh(monthKey: string): string {
  const [y, m] = monthKey.split("-").map(Number);
  return `${THAI_MONTH_FULL[m - 1] ?? monthKey} ${y}`;
}

// ตัวเลขล้วนไม่มี ฿ นำหน้า (f7: ในช่องปฏิทินโชว์ "+18,400"/"−3,250" ไม่มีสัญลักษณ์สกุลเงิน — ต่างจาก formatBaht ที่ใส่ ฿ เสมอ)
const plainAmount = (satang: number) => Math.round(satang / 100).toLocaleString("th-TH");

// "เงินคุณอยู่ไหน" — จานสีเดียวกับหน้าหลัก f1 เป๊ะ (ui.tsx dash-block-cash: financeGrays) ดำ→เทาอ่อน
const FINANCE_GRAYS = ["#0a0a0a", "#737373", "#a3a3a3", "#d4d4d4"];

function weekdayOf(dateIso: string): number {
  // เที่ยงวันตามเวลาไทย (+07:00) กันวันเพี้ยนข้าม UTC (บทเรียน reference_thai_date_getday_trap)
  return new Date(`${dateIso}T12:00:00+07:00`).getDay();
}

export function FinanceOverviewPanel({
  systemId,
  financePath,
  subTabs,
  data,
  monthPrevHref,
  monthNextHref,
  createHref,
  transferHref,
  todayIso,
}: {
  systemId: string;
  financePath: string;
  subTabs: FinanceSubTab[];
  data: FinanceOverview;
  monthPrevHref: string;
  monthNextHref: string;
  createHref: string;
  transferHref: string;
  todayIso: string;
}) {
  const [dayOpen, setDayOpen] = useState<string | null>(null);
  const [dayData, setDayData] = useState<FinanceDayDetail | null>(null);
  const [dayPending, startDay] = useTransition();

  const openDay = (dateIso: string) => {
    setDayOpen(dateIso);
    setDayData(null);
    startDay(async () => {
      const res = await financeDayDetailAction(systemId, dateIso);
      setDayData(res);
    });
  };
  const closeDay = () => {
    setDayOpen(null);
    setDayData(null);
  };

  const days = data.calendar.days;
  const leadPad = days.length > 0 ? weekdayOf(days[0].date) : 0;
  const tiles = data.calendar.tiles;

  // "เงินคุณอยู่ไหน" — สูตรเดียวกับหน้าหลัก f1 เป๊ะ (ui.tsx บรรทัด financeMax/financeMeterTotal)
  const financeMax = data.cash.accounts.map((a) => Math.max(a.balance, 1));
  const financeMeterTotal = data.cash.accounts.reduce((sum, a) => sum + a.balance, 0) || 1;

  return (
    <div className="flex flex-col gap-4 pb-24">
      <PageHeader
        title="การเงิน"
        actions={
          <>
            <Link href={transferHref} className="btn-sm hidden items-center gap-1.5 md:inline-flex" data-testid="fov-transfer-btn">
              <AccountIcon name="swap" className="h-4 w-4" /> โอนระหว่างช่องทาง
            </Link>
            <button type="button" className="btn-sm hidden items-center gap-1.5 md:inline-flex" onClick={() => window.print()} data-testid="fov-print">
              <AccountIcon name="report" className="h-4 w-4" /> พิมพ์รายงาน
            </button>
            <Link href={createHref} className="btn btn-primary" data-testid="fov-create-btn">
              + เพิ่มช่องทาง
            </Link>
          </>
        }
      />

      <FinanceSubTabsBar subTabs={subTabs} />

      {/* บัญชีเงินที่ติดตาม (§4 ข้อ 9 — ปักหมุด ≤4 เหมือนหน้าหลัก) */}
      <section className="card flex flex-col gap-4" data-testid="fov-tracked">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold">บัญชีเงินที่ติดตาม</h2>
          <span className="text-xs text-[color:var(--color-muted)]">ยอด ณ {formatDateTh(todayIso)}</span>
          <span className="flex-1" />
          <DashPinModal
            triggerLabel="เลือกบัญชี"
            title="เลือกบัญชีเงินที่ติดตาม"
            systemId={systemId}
            max={4}
            action={pinFinanceAccountsAction}
            testId="fov-pin-finance"
            items={data.cash.accounts.map((a) => ({ id: a.id, name: a.name, sub: formatBaht(a.balance, { decimals: true }), pinned: a.pinned }))}
          />
        </div>
        {data.tracked.length === 0 ? (
          <p className="text-sm text-[color:var(--color-muted)]">ยังไม่ได้ปักหมุดบัญชีเงิน — กด &quot;เลือกบัญชี&quot;</p>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {data.tracked.map((a) => (
              <div key={a.id} className="rounded-xl border p-4" style={{ borderColor: "var(--color-line)" }} data-testid={`fov-tracked-card-${a.code ?? a.id}`}>
                <div className="truncate text-sm font-medium">{a.name}</div>
                <div className="truncate text-xs text-[color:var(--color-muted)]">{a.subtitle}</div>
                <div className="mt-2 text-xl font-semibold" data-testid={`fov-tracked-balance-${a.id}`}>{formatBaht(a.balanceSatang, { decimals: true })}</div>
                <div className="mt-0.5 text-xs text-[color:var(--color-muted)]" data-testid={`fov-tracked-month-${a.id}`}>{a.monthText}</div>
              </div>
            ))}
          </div>
        )}
      </section>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* ตารางเงินเข้า-ออก (§10.2) */}
        <section className="card flex flex-col gap-4 lg:col-span-2" data-testid="fov-calendar-block">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold">ตารางเงินเข้า-ออก</h2>
            <span className="flex-1" />
            <Link href={monthPrevHref} className="btn-sm" aria-label="เดือนก่อนหน้า" data-testid="fov-month-prev">‹</Link>
            <span className="text-sm font-medium" data-testid="fov-month-label">{monthLabelTh(data.monthKey)}</span>
            <Link href={monthNextHref} className="btn-sm" aria-label="เดือนถัดไป" data-testid="fov-month-next">›</Link>
          </div>

          {/* 6 ไทล์ (ตรง f7 เป๊ะ — ไม่ใช่ "สุทธิ/ยอดคงเหลือรวม" ที่ร่างงานเดาไว้แต่แรก) */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3" data-testid="fov-tiles">
            <div className="rounded-xl border p-3" style={{ borderColor: "var(--color-line)" }} data-testid="fov-tile-inflow">
              <div className="flex items-center gap-1.5 text-xs text-[color:var(--color-muted)]"><AccountIcon name="in" className="h-3.5 w-3.5" /> เงินเข้า</div>
              <div className="mt-1 text-lg font-semibold">{formatBaht(tiles.inflow.amount, { decimals: true })}</div>
              <div className="text-xs text-[color:var(--color-muted)]">{tiles.inflow.count} รายการ</div>
            </div>
            <div className="rounded-xl border p-3" style={{ borderColor: "var(--color-danger)" }} data-testid="fov-tile-overdue-receivable">
              <div className="flex items-center gap-1.5 text-xs text-[color:var(--color-danger)]"><AccountIcon name="warn" className="h-3.5 w-3.5" /> ค้างรับเกินกำหนด</div>
              <div className="mt-1 text-lg font-semibold text-[color:var(--color-danger)]">{formatBaht(tiles.overdueReceivable.amount, { decimals: true })}</div>
              <div className="text-xs text-[color:var(--color-muted)]">{tiles.overdueReceivable.count} ใบ</div>
            </div>
            <div className="rounded-xl border p-3" style={{ borderColor: "var(--color-line)" }} data-testid="fov-tile-expected-in">
              <div className="flex items-center gap-1.5 text-xs text-[color:var(--color-muted)]"><AccountIcon name="clock" className="h-3.5 w-3.5" /> คาดว่าจะเข้า</div>
              <div className="mt-1 text-lg font-semibold">{formatBaht(tiles.expectedIn.amount, { decimals: true })}</div>
              <div className="text-xs text-[color:var(--color-muted)]">{tiles.expectedIn.count} ใบ</div>
            </div>
            <div className="rounded-xl border p-3" style={{ borderColor: "var(--color-line)" }} data-testid="fov-tile-outflow">
              <div className="flex items-center gap-1.5 text-xs text-[color:var(--color-muted)]"><AccountIcon name="out" className="h-3.5 w-3.5" /> เงินออก</div>
              <div className="mt-1 text-lg font-semibold">{formatBaht(tiles.outflow.amount, { decimals: true })}</div>
              <div className="text-xs text-[color:var(--color-muted)]">{tiles.outflow.count} รายการ</div>
            </div>
            <div className="rounded-xl border p-3" style={{ borderColor: "var(--color-danger)" }} data-testid="fov-tile-overdue-payable">
              <div className="flex items-center gap-1.5 text-xs text-[color:var(--color-danger)]"><AccountIcon name="warn" className="h-3.5 w-3.5" /> ค้างจ่ายเกินกำหนด</div>
              <div className="mt-1 text-lg font-semibold text-[color:var(--color-danger)]">{formatBaht(tiles.overduePayable.amount, { decimals: true })}</div>
              <div className="text-xs text-[color:var(--color-muted)]">{tiles.overduePayable.count} ใบ</div>
            </div>
            <div className="rounded-xl border p-3" style={{ borderColor: "var(--color-line)" }} data-testid="fov-tile-expected-out">
              <div className="flex items-center gap-1.5 text-xs text-[color:var(--color-muted)]"><AccountIcon name="clock" className="h-3.5 w-3.5" /> คาดว่าจะออก</div>
              <div className="mt-1 text-lg font-semibold">{formatBaht(tiles.expectedOut.amount, { decimals: true })}</div>
              <div className="text-xs text-[color:var(--color-muted)]">{tiles.expectedOut.count} ใบ</div>
            </div>
          </div>

          <div className="flex items-center gap-3 text-xs text-[color:var(--color-muted)]">
            <span className="flex items-center gap-1"><i className="h-2.5 w-2.5 rounded-sm bg-[color:var(--color-ink)]" /> เงินเข้า (+)</span>
            <span className="flex items-center gap-1"><i className="h-2.5 w-2.5 rounded-sm bg-[color:var(--color-muted)]" /> เงินออก (−)</span>
            <span className="flex-1" />
            <span>วันนี้ {formatDateTh(todayIso)}</span>
          </div>

          {/* ปฏิทิน — เดสก์ท็อป/แท็บเล็ต: กริด 7 คอลัมน์ (อา-ส) · มือถือ 390: รายการวันแบบเลื่อน (ตาม task) */}
          <div className="hidden md:block" data-testid="fov-calendar-grid">
            <div className="grid grid-cols-7 gap-px overflow-hidden rounded-lg border text-center text-xs text-[color:var(--color-muted)]" style={{ borderColor: "var(--color-line)" }}>
              {THAI_WEEKDAY.map((w) => (
                <div key={w} className="bg-[color:var(--color-surface-2)] py-1.5">{w}</div>
              ))}
              {Array.from({ length: leadPad }, (_, i) => (
                <div key={`pad-${i}`} className="min-h-[64px] bg-[color:var(--color-surface)]" />
              ))}
              {days.map((d) => {
                const isToday = d.date === todayIso;
                const dayNum = Number(d.date.slice(8, 10));
                return (
                  <button
                    key={d.date}
                    type="button"
                    onClick={() => openDay(d.date)}
                    className="flex min-h-[64px] flex-col items-start gap-0.5 bg-[color:var(--color-surface)] p-1.5 text-left hover:bg-[color:var(--color-surface-2)]"
                    data-testid={`fov-day-${d.date}`}
                  >
                    <span
                      className="flex h-5 w-5 items-center justify-center rounded-full text-xs"
                      style={isToday ? { background: "var(--color-accent)", color: "#fff" } : undefined}
                    >
                      {dayNum}
                    </span>
                    {d.inflow > 0 && <span className="text-xs font-semibold tabular-nums">+{plainAmount(d.inflow)}</span>}
                    {d.outflow > 0 && <span className="text-xs tabular-nums text-[color:var(--color-muted)]">−{plainAmount(d.outflow)}</span>}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="flex flex-col gap-1.5 md:hidden" data-testid="fov-calendar-list">
            {days.filter((d) => d.inflow > 0 || d.outflow > 0).length === 0 && (
              <p className="text-sm text-[color:var(--color-muted)]">ยังไม่มีรายการในเดือนนี้</p>
            )}
            {days.filter((d) => d.inflow > 0 || d.outflow > 0).map((d) => (
              <button
                key={d.date}
                type="button"
                onClick={() => openDay(d.date)}
                className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm"
                style={{ borderColor: "var(--color-line)" }}
                data-testid={`fov-day-m-${d.date}`}
              >
                <span className={d.date === todayIso ? "font-semibold" : ""}>
                  {formatDateTh(d.date, { withYear: false })}
                  {d.date === todayIso ? " (วันนี้)" : ""}
                </span>
                <span className="flex gap-2 tabular-nums">
                  {d.inflow > 0 && <span className="font-semibold">+{plainAmount(d.inflow)}</span>}
                  {d.outflow > 0 && <span className="text-[color:var(--color-muted)]">−{plainAmount(d.outflow)}</span>}
                </span>
              </button>
            ))}
          </div>
        </section>

        {/* ขวา: กระทบยอดธนาคาร (สรุป/ลิงก์) + รายการที่กระทบยอดแล้ว + เงินคุณอยู่ไหน */}
        <div className="flex flex-col gap-4">
          <section className="card flex flex-col gap-3" data-testid="fov-reconcile">
            <h2 className="text-sm font-semibold">กระทบยอดธนาคาร</h2>
            {data.reconcile.selectedChannelId ? (
              <>
                <div className="text-sm">{data.reconcile.selectedChannelLabel} · {monthLabelTh(data.monthKey)}</div>
                <div className="flex flex-col gap-1.5 text-sm">
                  <div className="flex justify-between">
                    <span className="text-[color:var(--color-muted)]">ยอดตาม statement</span>
                    <span className="tabular-nums" data-testid="fov-reconcile-statement">
                      {data.reconcile.statementBalanceSatang != null ? formatBaht(data.reconcile.statementBalanceSatang, { decimals: true }) : "ยังไม่นำเข้า statement"}
                    </span>
                  </div>
                  <div className="flex justify-between"><span className="text-[color:var(--color-muted)]">ยอดในระบบ</span><span className="tabular-nums" data-testid="fov-reconcile-system">{formatBaht(data.reconcile.systemBalanceSatang ?? 0, { decimals: true })}</span></div>
                  <div className="flex justify-between">
                    <span className="text-[color:var(--color-muted)]">ส่วนต่าง</span>
                    <span
                      className="tabular-nums"
                      style={data.reconcile.differenceSatang ? { color: "var(--color-danger)" } : undefined}
                      data-testid="fov-reconcile-diff"
                    >
                      {data.reconcile.differenceSatang != null ? formatBaht(data.reconcile.differenceSatang, { decimals: true }) : "—"}
                    </span>
                  </div>
                  {data.reconcile.statementBalanceSatang != null && (
                    <div className="flex justify-between">
                      <span className="text-[color:var(--color-muted)]">รายการรอจับคู่</span>
                      <span data-testid="fov-reconcile-pending">
                        {data.reconcile.confirmed ? "ยืนยันแล้ว" : `${data.reconcile.pendingCount} รายการ`}
                      </span>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <p className="text-sm text-[color:var(--color-muted)]">ยังไม่มีบัญชีธนาคาร — เพิ่มช่องทางประเภทธนาคารก่อน</p>
            )}
            <Link
              href={`${financePath}/reconcile?channel=${data.reconcile.selectedChannelId ?? ""}&month=${data.monthKey}`}
              className="btn btn-primary w-full justify-center"
              data-testid="fov-reconcile-import"
            >
              {data.reconcile.statementBalanceSatang != null ? "จับคู่รายการ" : "นำเข้า statement"}
            </Link>
          </section>

          <section className="card flex flex-col gap-2" data-testid="fov-reconciled-summary">
            <h2 className="text-sm font-semibold">รายการที่กระทบยอดแล้ว</h2>
            <p className="text-sm text-[color:var(--color-muted)]" data-testid="fov-reconciled-count">
              {data.reconcile.statementBalanceSatang == null
                ? `${data.reconciledCount} รายการ (ยังไม่เริ่มกระทบยอด)`
                : `${data.reconciledCount} รายการ`}
            </p>
          </section>

          <section className="card flex flex-col gap-2" data-testid="fov-cash">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold">เงินคุณอยู่ไหน</h2>
              <span className="flex-1" />
              <Link href={financePath} className="text-xs" style={{ color: "var(--color-accent)" }} data-testid="fov-cash-all-link">ทุกช่องทาง ›</Link>
            </div>
            <div className="text-xs text-[color:var(--color-muted)]">ยอดรวมทุกบัญชี</div>
            <div className="text-2xl font-semibold tabular-nums" data-testid="fov-cash-total">{formatBaht(data.cash.total, { decimals: true })}</div>
            {/* แท่งสัดส่วนเดียว (segment ต่อบัญชี ดำ→เทาอ่อน) — เหมือนหน้าหลัก f1 เป๊ะ (ui.tsx dash-block-cash)
                ไม่ใช่แท่งย่อยต่อแถวแบบ DashShareBar (round 2: เทียบ f7 แล้วพบว่าหน้าหลักใช้แท่งเดียว ไม่ใช่ต่อแถว) */}
            <div className="flex h-1.5 overflow-hidden rounded-full">
              {data.cash.accounts.map((a, i) => (
                <span key={a.id} style={{ width: `${(financeMax[i] / financeMeterTotal) * 100}%`, background: FINANCE_GRAYS[i] ?? "#d4d4d4" }} />
              ))}
            </div>
            <ul className="text-xs">
              {data.cash.accounts.map((a, i) => (
                <li key={a.id} className="flex items-center gap-2 py-1.5" data-testid={`fov-cash-row-${a.id}`}>
                  <i className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: FINANCE_GRAYS[i] ?? "#d4d4d4" }} />
                  <span className="min-w-0 flex-1 truncate">{a.name}</span>
                  <span className="tabular-nums">{formatBaht(a.balance, { decimals: true })}</span>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>

      {dayOpen && (
        <SlideOver open onClose={closeDay} title={formatDateTh(dayOpen)} testId="fov-day-modal">
          {dayPending || !dayData ? (
            <p className="text-sm text-[color:var(--color-muted)]">กำลังโหลด…</p>
          ) : dayData.rows.length === 0 ? (
            <p className="text-sm text-[color:var(--color-muted)]">ไม่มีรายการในวันนี้</p>
          ) : (
            <div className="flex flex-col gap-2" data-testid="fov-day-rows">
              <div className="flex justify-between text-xs text-[color:var(--color-muted)]">
                <span>เงินเข้า {formatBaht(dayData.totalIn, { decimals: true })}</span>
                <span>เงินออก {formatBaht(dayData.totalOut, { decimals: true })}</span>
              </div>
              {dayData.rows.map((r) => (
                <div key={r.id} className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm" style={{ borderColor: "var(--color-line)" }} data-testid={`fov-day-row-${r.id}`}>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{r.docNo ?? r.docType}</div>
                    <div className="truncate text-xs text-[color:var(--color-muted)]">{r.contactName ?? "—"} · {r.financeAccountName ?? "—"}</div>
                  </div>
                  <span className="tabular-nums" style={{ color: r.direction === "OUT" ? "var(--color-ink)" : "var(--color-muted)" }}>
                    {r.direction === "OUT" ? "+" : "−"}{formatBaht(r.amountSatang, { decimals: true })}
                  </span>
                </div>
              ))}
            </div>
          )}
        </SlideOver>
      )}
    </div>
  );
}

export default FinanceOverviewPanel;
