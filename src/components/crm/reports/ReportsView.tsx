// ReportsView.tsx — หน้าตารายงาน CRM (ใบ C3.1 · ภาพ 09) — คอมโพเนนต์แสดงผล (server · ไม่มี hook)
// โครงของภาพ 09: แถบหัว (← รายงาน CRM · ส่งออก CSV · ตั้งเวลาส่งอีเมล) → แท็บ 8 → แถบตัวกรอง → การ์ดของแท็บ
// 🔴 ไม่ import โมดูล CRM (F2.3) — ข้อมูลทั้งหมดผ่านการมองเห็น/ขอบเขตรายงานมาแล้วจากหน้า (`crm/reports/**`)
// 🔴 390 px: การ์ดเรียงลงเต็มความกว้าง · ตารางกว้างเลื่อนแนวนอน "ในการ์ด" (หน้าไม่ล้น) · ข้อความยาวตัดด้วย truncate

import Link from "next/link";
import type { ReactNode } from "react";
import { ReportExportButton } from "./ReportExportButton";
import { ReportFilterBar } from "./ReportFilterBar";
import { ReportScheduleButton } from "./ReportScheduleButton";
import type { RvActivities, RvData, RvFilterState, RvForecast, RvFunnel, RvLost, RvOption, RvOverview, RvRepRow, RvSchedulePanel, RvScores, RvSourceRow, RvSources, RvTabKey } from "./types";

const muted = "text-[color:var(--color-muted)]";
const th = "px-3 py-2 text-left text-xs font-medium text-[color:var(--color-muted)] whitespace-nowrap";
const thr = `${th} text-right`;
const td = "px-3 py-2 text-sm";
const tdn = "px-3 py-2 text-right text-sm tabular-nums whitespace-nowrap";

const baht = (satang: number | null | undefined): string => {
  if (satang === null || satang === undefined) return "—";
  const v = Number(satang) / 100;
  return `฿${v.toLocaleString("th-TH", { minimumFractionDigits: 0, maximumFractionDigits: v % 1 === 0 ? 0 : 2 })}`;
};
const num = (n: number | null | undefined): string => (n === null || n === undefined ? "—" : Number(n).toLocaleString("th-TH"));
const pct = (n: number | null | undefined): string => (n === null || n === undefined ? "—" : `${Number(n).toLocaleString("th-TH", { maximumFractionDigits: 1 })}%`);
const days = (n: number | null | undefined): string => (n === null || n === undefined ? "—" : Number(n).toLocaleString("th-TH", { maximumFractionDigits: 1 }));

function Card({ title, sub, children, testid, flush }: { title: string; sub?: string; children: ReactNode; testid?: string; flush?: boolean }) {
  return (
    <section className={`card flex min-w-0 flex-col gap-3 ${flush ? "p-0 pt-4" : "p-4"}`} data-testid={testid}>
      <div className={`flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1 ${flush ? "px-4" : ""}`}>
        <h2 className="text-sm font-semibold">{title}</h2>
        {sub && <span className={`text-xs ${muted}`}>{sub}</span>}
      </div>
      {children}
    </section>
  );
}

function Table({ head, children }: { head: string[]; children: ReactNode }) {
  return (
    <div className="min-w-0 overflow-x-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b bg-[color:var(--color-surface-2)]">
            {head.map((h, i) => (
              <th key={h} className={i === 0 ? th : thr}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y">{children}</tbody>
      </table>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <p className={`px-4 pb-4 text-sm ${muted}`}>{text}</p>;
}

// ───────────── การ์ดของภาพ 09 ─────────────

function ForecastCard({ data }: { data: RvForecast }) {
  const rows = data.rows;
  const max = Math.max(1, ...rows.map((r) => Math.max(r.pipelineSatang + r.closedSatang, r.quotaSatang ?? 0)));
  return (
    <Card title="Forecast รายเดือน × หมวด" sub="PIPELINE · BEST CASE · COMMIT · CLOSED" testid="crm-report-forecast-card">
      {rows.length === 0 ? (
        <Empty text="ยังไม่มีดีลที่คาดว่าจะปิดในช่วงนี้" />
      ) : (
        <>
          <Table head={["เดือน", "Pipeline", "Best case", "Commit", "Closed", "โควตา"]}>
            {rows.map((r) => (
              <tr key={r.key}>
                <td className={`${td} whitespace-nowrap`}>{r.label}</td>
                <td className={tdn}>{baht(r.pipelineSatang)}</td>
                <td className={tdn}>{baht(r.bestCaseSatang)}</td>
                <td className={tdn}>{baht(r.commitSatang)}</td>
                <td className={`${tdn} ${r.closedSatang ? "" : muted}`}>{r.closedSatang ? baht(r.closedSatang) : "—"}</td>
                <td className={`${tdn} ${muted}`}>{baht(r.quotaSatang)}</td>
              </tr>
            ))}
          </Table>
          {/* แท่งซ้อน: Closed (ดำ) · Commit (อำพัน) · Pipeline ที่เหลือ (เทา) — สูงตามสัดส่วนของเดือนที่มากสุด */}
          <div className="flex min-w-0 flex-col gap-1" aria-hidden="true">
            <div className="flex h-24 min-w-0 items-end gap-1">
              {rows.map((r) => {
                const total = r.pipelineSatang + r.closedSatang;
                const h = Math.max(4, Math.round((total / max) * 100));
                const closed = total ? (r.closedSatang / total) * 100 : 0;
                const commit = total ? (r.commitSatang / total) * 100 : 0;
                return (
                  <i
                    key={r.key}
                    className="block min-w-0 flex-1 rounded-t"
                    style={{
                      height: `${h}%`,
                      background: `linear-gradient(to top, var(--color-ink) 0 ${closed}%, var(--color-tag-amber) ${closed}% ${closed + commit}%, var(--color-line) ${closed + commit}% 100%)`,
                    }}
                  />
                );
              })}
            </div>
            <div className="flex min-w-0 gap-1">
              {rows.map((r) => (
                <span key={r.key} className={`min-w-0 flex-1 truncate text-center text-[10px] ${muted}`}>
                  {r.label.split(" ")[0]}
                </span>
              ))}
            </div>
            <div className={`flex flex-wrap gap-3 text-[11px] ${muted}`}>
              <span className="inline-flex items-center gap-1"><i className="inline-block h-2 w-2 rounded-sm bg-[color:var(--color-ink)]" />Closed</span>
              <span className="inline-flex items-center gap-1"><i className="inline-block h-2 w-2 rounded-sm bg-[color:var(--color-tag-amber)]" />Commit</span>
              <span className="inline-flex items-center gap-1"><i className="inline-block h-2 w-2 rounded-sm bg-[color:var(--color-line)]" />Pipeline</span>
            </div>
          </div>
        </>
      )}
    </Card>
  );
}

function FunnelCard({ data, full }: { data: RvFunnel; full?: boolean }) {
  const last = data.stages.length - 1;
  return (
    <Card title="Funnel ต่อขั้น" sub={full && data.pipelineName ? `อัตรา · วันเฉลี่ย · ${data.pipelineName}` : "อัตรา · วันเฉลี่ย"} testid="crm-report-funnel-card" flush>
      {data.stages.length === 0 ? (
        <Empty text="pipeline นี้ยังไม่มีขั้น" />
      ) : (
        <Table head={full ? ["ขั้น", "เข้าขั้น", "ออกจากขั้น", "อัตรา", "วัน/ขั้น"] : ["ขั้น", "จำนวน", "อัตรา", "วัน/ขั้น"]}>
          {data.stages.map((s, i) => (
            <tr key={s.stageId}>
              <td className={td}>{s.name}</td>
              <td className={tdn}>{num(s.entered)}</td>
              {full && <td className={tdn}>{num(s.left)}</td>}
              <td className={`${tdn} ${i === last && s.kind === "WON" && s.ratePct !== null ? "font-bold text-[color:var(--color-tag-green)]" : ""}`}>{i === 0 && s.ratePct === null ? "—" : pct(s.ratePct)}</td>
              <td className={tdn}>{days(s.avgDays)}</td>
            </tr>
          ))}
        </Table>
      )}
    </Card>
  );
}

const initial = (s: string) => (s.trim()[0] ?? "?").toUpperCase();

function RepsCard({ rows, full }: { rows: RvRepRow[]; full?: boolean }) {
  const shown = full ? rows : rows.slice(0, 6);
  return (
    <Card title={full ? "ยอดต่อคน" : "ยอดต่อคน vs โควตา"} testid="crm-report-reps-card" flush>
      {shown.length === 0 ? (
        <Empty text="ยังไม่มียอดในช่วงนี้" />
      ) : full ? (
        <Table head={["พนักงาน", "ชนะ", "มูลค่าที่ชนะ", "ดีลเปิด", "มูลค่าดีลเปิด", "แพ้", "รับชำระแล้ว", "กิจกรรม", "คอมมิชชัน", "โควตา", "%"]}>
          {shown.map((r) => (
            <tr key={r.key}>
              <td className={`${td} whitespace-nowrap`}>{r.label}</td>
              <td className={tdn}>{num(r.wonDeals)}</td>
              <td className={tdn}>{baht(r.wonValueSatang)}</td>
              <td className={tdn}>{num(r.openDeals)}</td>
              <td className={tdn}>{baht(r.openValueSatang)}</td>
              <td className={tdn}>{num(r.lostDeals)}</td>
              <td className={tdn}>{baht(r.paidSatang)}</td>
              <td className={tdn}>{num(r.activitiesDone)}</td>
              <td className={tdn}>{baht(r.commissionSatang)}</td>
              <td className={`${tdn} ${muted}`}>{baht(r.quotaSatang)}</td>
              <td className={tdn}>{pct(r.attainmentPct)}</td>
            </tr>
          ))}
        </Table>
      ) : (
        <Table head={["พนักงาน", "ชนะ", "มูลค่า", "โควตา", "%"]}>
          {shown.map((r) => (
            <tr key={r.key}>
              <td className={td}>
                <span className="inline-flex min-w-0 items-center gap-2">
                  <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[9px]">{initial(r.label)}</span>
                  <span className="truncate">{r.label}</span>
                </span>
              </td>
              <td className={tdn}>{num(r.wonDeals)}</td>
              <td className={tdn}>{baht(r.wonValueSatang)}</td>
              <td className={`${tdn} ${muted}`}>{baht(r.quotaSatang)}</td>
              <td className={`${tdn} font-bold`}>{pct(r.attainmentPct)}</td>
            </tr>
          ))}
        </Table>
      )}
    </Card>
  );
}

function LostCard({ data, sub }: { data: RvLost; sub: string }) {
  const max = Math.max(1, ...data.rows.map((r) => r.deals));
  return (
    <Card title="เหตุผลแพ้" sub={`${num(data.total)} ดีล · ${sub}`} testid="crm-report-lost-card">
      {data.rows.length === 0 ? (
        <p className={`text-sm ${muted}`}>ไม่มีดีลที่แพ้ในช่วงนี้</p>
      ) : (
        <div className="flex min-w-0 flex-col gap-2">
          {data.rows.map((r) => (
            <div key={r.key} className="grid min-w-0 grid-cols-[minmax(0,9rem)_minmax(0,1fr)_auto] items-center gap-3 text-sm">
              <span className="truncate font-medium">{r.label}</span>
              <span className="h-3 min-w-0 overflow-hidden rounded bg-[color:var(--color-surface-2)]">
                <i className="block h-full rounded bg-[color:var(--color-ink)]" style={{ width: `${Math.round((r.deals / max) * 100)}%` }} />
              </span>
              <span className="tabular-nums font-semibold">{num(r.deals)}</span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function SourceTable({ rows, head }: { rows: RvSourceRow[]; head: string }) {
  return (
    <Table head={[head, "Lead", "ดีล", "ชนะ", "ROI"]}>
      {rows.map((r) => (
        <tr key={r.key}>
          <td className={`${td} max-w-[14rem] truncate`}>{r.label}</td>
          <td className={tdn}>{num(r.leads)}</td>
          <td className={tdn}>{num(r.deals)}</td>
          <td className={tdn}>{num(r.wonDeals)}</td>
          <td className={`${tdn} ${r.roi !== null && r.roi >= 1 ? "font-bold text-[color:var(--color-tag-green)]" : ""}`}>{r.roi === null ? "—" : `${r.roi.toLocaleString("th-TH", { maximumFractionDigits: 1 })}×`}</td>
        </tr>
      ))}
    </Table>
  );
}

function SourcesCard({ data }: { data: RvSources }) {
  return (
    <Card title="ที่มา / ROI" testid="crm-report-sources-card" flush>
      {data.bySource.length === 0 ? <Empty text="ยังไม่มี lead ใหม่ในช่วงนี้" /> : <SourceTable rows={data.bySource.slice(0, 6)} head="ที่มา" />}
    </Card>
  );
}

// ───────────── แท็บ ─────────────

function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="card flex min-w-0 flex-col gap-1 p-4">
      <span className={`text-xs ${muted}`}>{label}</span>
      <span className="truncate text-xl font-semibold tabular-nums">{value}</span>
      {hint && <span className={`truncate text-xs ${muted}`}>{hint}</span>}
    </div>
  );
}

function OverviewTab({ o, reps, lost, periodText }: { o: RvOverview; reps?: RvRepRow[]; lost?: RvLost; periodText: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-4" data-testid="crm-report-overview">
      <div className="grid min-w-0 grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="ดีลเปิดตอนนี้" value={num(o.openDeals)} hint={baht(o.openValueSatang)} />
        <Kpi label="มูลค่าถ่วงน้ำหนัก" value={baht(o.weightedSatang)} hint="ตามความน่าจะเป็นของขั้น" />
        <Kpi label="ชนะ" value={num(o.wonDeals)} hint={baht(o.wonValueSatang)} />
        <Kpi label="แพ้" value={num(o.lostDeals)} hint={`อัตราชนะ ${pct(o.winRatePct)}`} />
        <Kpi label="มูลค่าเฉลี่ยต่อดีลที่ชนะ" value={baht(o.avgWonSatang)} />
        <Kpi label="รับชำระแล้ว" value={baht(o.paidSatang)} />
        <Kpi label="กิจกรรมที่ทำ" value={num(o.activitiesDone)} />
        <Kpi label="lead ใหม่" value={num(o.newLeads)} />
      </div>
      <div className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-[1.2fr_1fr]">
        {reps && <RepsCard rows={reps} />}
        {lost && <LostCard data={lost} sub={periodText} />}
      </div>
    </div>
  );
}

function ForecastTab({ d, periodText }: { d: RvData; periodText: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-4" data-testid="crm-report-forecast">
      <div className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-[1.5fr_1fr]">
        {d.forecast && <ForecastCard data={d.forecast} />}
        {d.funnel && <FunnelCard data={d.funnel} />}
      </div>
      <div className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-[1.2fr_1fr_1.2fr]">
        {d.reps && <RepsCard rows={d.reps.rows} />}
        {d.lost && <LostCard data={d.lost} sub={periodText} />}
        {d.sources && <SourcesCard data={d.sources} />}
      </div>
    </div>
  );
}

function ActivitiesTab({ a }: { a: RvActivities }) {
  return (
    <Card title="กิจกรรมต่อคน" sub="ทำแล้วในช่วงนี้ · ค้างอยู่ตอนนี้" testid="crm-report-activities-card" flush>
      {a.rows.length === 0 ? (
        <Empty text="ยังไม่มีกิจกรรมในช่วงนี้" />
      ) : (
        <Table head={["พนักงาน", "ทำแล้ว", "ค้างอยู่", "โทร", "เวลาโทร (นาที)", ...a.types.map((t) => t.label)]}>
          {a.rows.map((r) => (
            <tr key={r.key}>
              <td className={`${td} whitespace-nowrap`}>{r.label}</td>
              <td className={tdn}>{num(r.done)}</td>
              <td className={tdn}>{num(r.open)}</td>
              <td className={tdn}>{num(r.calls)}</td>
              <td className={tdn}>{num(Math.round(r.callSeconds / 60))}</td>
              {a.types.map((t) => (
                <td key={t.key} className={tdn}>{num(r.byType[t.key] ?? 0)}</td>
              ))}
            </tr>
          ))}
        </Table>
      )}
    </Card>
  );
}

function LostTab({ l, periodText }: { l: RvLost; periodText: string }) {
  return (
    <div className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-2">
      <LostCard data={l} sub={periodText} />
      <Card title="รายละเอียดเหตุผลแพ้" sub={`มูลค่ารวม ${baht(l.valueSatang)}`} testid="crm-report-lost-table" flush>
        {l.rows.length === 0 ? (
          <Empty text="ไม่มีดีลที่แพ้ในช่วงนี้" />
        ) : (
          <Table head={["เหตุผล", "ดีล", "มูลค่า", "สัดส่วน"]}>
            {l.rows.map((r) => (
              <tr key={r.key}>
                <td className={td}>{r.label}</td>
                <td className={tdn}>{num(r.deals)}</td>
                <td className={tdn}>{baht(r.valueSatang)}</td>
                <td className={tdn}>{pct(r.pct)}</td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </div>
  );
}

function SourcesTab({ s }: { s: RvSources }) {
  const block = (title: string, head: string, rows: RvSourceRow[], empty: string, testid: string) => (
    <Card title={title} testid={testid} flush>
      {rows.length === 0 ? <Empty text={empty} /> : <SourceTable rows={rows} head={head} />}
    </Card>
  );
  return (
    <div className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-3">
      {block("ตามที่มาของ lead", "ที่มา", s.bySource, "ยังไม่มี lead ใหม่ในช่วงนี้", "crm-report-sources-by-source")}
      {block("ตามแคมเปญ (ROI)", "แคมเปญ", s.byCampaign, "ยังไม่มี lead ที่มาจากแคมเปญ", "crm-report-sources-by-campaign")}
      {block("ตามลิงก์ติดตาม", "ลิงก์", s.byLink, "ยังไม่มี lead ที่มาจากลิงก์ติดตาม", "crm-report-sources-by-link")}
    </div>
  );
}

function ScoresTab({ s }: { s: RvScores }) {
  return (
    <div className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-2">
      <Card title="ผู้ติดต่อตามระดับคะแนน" testid="crm-report-score-bands" flush>
        <Table head={["ระดับ", "ผู้ติดต่อ", "คะแนนเฉลี่ย", "มีดีลเปิด", "มีดีลที่ชนะ"]}>
          {s.bands.map((b) => (
            <tr key={b.key}>
              <td className={td}>{b.label}</td>
              <td className={tdn}>{num(b.contacts)}</td>
              <td className={tdn}>{days(b.avgScore)}</td>
              <td className={tdn}>{num(b.withOpenDeal)}</td>
              <td className={tdn}>{num(b.withWonDeal)}</td>
            </tr>
          ))}
        </Table>
      </Card>
      <Card title="กฎที่ให้คะแนนมากที่สุด" sub="10 อันดับในช่วงนี้" testid="crm-report-score-rules" flush>
        {s.topRules.length === 0 ? (
          <Empty text="ยังไม่มีการให้คะแนนในช่วงนี้" />
        ) : (
          <Table head={["กฎ", "ครั้ง", "คะแนนรวม"]}>
            {s.topRules.map((r) => (
              <tr key={r.key}>
                <td className={td}>{r.label}</td>
                <td className={tdn}>{num(r.logs)}</td>
                <td className={tdn}>{num(r.points)}</td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </div>
  );
}

// ───────────── หน้า ─────────────

export function ReportsView({
  systemId,
  tab,
  tabs,
  query,
  filters,
  filterState,
  periods,
  teams,
  pipelines,
  periodText,
  data,
  error,
  schedule,
}: {
  systemId: string;
  tab: RvTabKey;
  tabs: { key: RvTabKey; label: string }[];
  /** query string ปัจจุบัน (พาไปทุกแท็บ) */
  query: string;
  filters: Record<string, string>;
  filterState: RvFilterState;
  periods: RvOption[];
  teams: RvOption[];
  pipelines: RvOption[];
  periodText: string;
  data: RvData;
  error: string | null;
  /** null = ไม่มีคีย์ `crm.report.all` (ไม่แสดงปุ่มตั้งเวลา) */
  schedule: RvSchedulePanel | null;
}) {
  const base = `/app/sys/${systemId}`;
  const hrefOf = (k: RvTabKey) => `${base}/crm/reports${k === "overview" ? "" : `/${k}`}${query ? `?${query}` : ""}`;
  const pathOf = `${base}/crm/reports${tab === "overview" ? "" : `/${tab}`}`;
  return (
    <div className="flex min-w-0 flex-col gap-4" data-testid="crm-reports">
      <div className="flex min-w-0 flex-wrap items-center gap-2 border-b pb-3">
        <Link href={base} className={`inline-flex h-8 w-8 items-center justify-center rounded-lg ${muted}`} aria-label="กลับหน้าแรก CRM" data-testid="crm-report-back">
          ‹
        </Link>
        <h1 className="min-w-0 flex-1 truncate text-lg font-semibold">รายงาน CRM</h1>
        <div className="flex min-w-0 flex-wrap items-start justify-end gap-2">
          <ReportExportButton systemId={systemId} tab={tab} filters={filters} />
          {schedule && <ReportScheduleButton systemId={systemId} currentTab={tab} filters={filters} panel={schedule} />}
        </div>
      </div>

      <nav className="-mx-1 flex min-w-0 gap-1 overflow-x-auto border-b" aria-label="แท็บรายงาน">
        {tabs.map((t) => (
          <Link
            key={t.key}
            href={hrefOf(t.key)}
            aria-current={t.key === tab ? "page" : undefined}
            className={`whitespace-nowrap px-3 py-2 text-sm ${t.key === tab ? "border-b-2 border-[color:var(--color-ink)] font-semibold" : muted}`}
            data-testid={`crm-report-tab-${t.key}`}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      <ReportFilterBar basePath={pathOf} state={filterState} periods={periods} teams={teams} pipelines={pipelines} />

      {error && (
        <p className="rounded-lg border border-[color:var(--color-danger)] px-3 py-2 text-sm text-[color:var(--color-danger)]" role="alert">
          {error}
        </p>
      )}

      {tab === "overview" && data.overview && <OverviewTab o={data.overview} reps={data.reps?.rows} lost={data.lost} periodText={periodText} />}
      {tab === "forecast" && <ForecastTab d={data} periodText={periodText} />}
      {tab === "funnel" && data.funnel && <FunnelCard data={data.funnel} full />}
      {tab === "reps" && data.reps && <RepsCard rows={data.reps.rows} full />}
      {tab === "activities" && data.activities && <ActivitiesTab a={data.activities} />}
      {tab === "lost" && data.lost && <LostTab l={data.lost} periodText={periodText} />}
      {tab === "sources" && data.sources && <SourcesTab s={data.sources} />}
      {tab === "scores" && data.scores && <ScoresTab s={data.scores} />}
    </div>
  );
}
