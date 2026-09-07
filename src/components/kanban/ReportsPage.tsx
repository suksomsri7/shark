// ReportsPage.tsx — รายงานในแอป `/kanban/reports` (K2.10 · พิมพ์เขียว 13-kanban-v2 §3.7/§11.10 · ไม่มี
// mockup — เกณฑ์ §13 K2.10) · 5 แท็บ: ค้าง / เลยกำหนด / ภาระงาน / ผลงานรายสัปดาห์ / อายุงาน
//
// 🔴 อ่านอย่างเดียวล้วน (เหมือน SummaryView K2.4) — ไม่มี state ของข้อมูล มีแค่ state UI (แท็บที่เปิดอยู่/
//    กำลังส่งออก/toast) ตัวเลข/แถวทั้งหมดมาจาก props ที่ `page.tsx` เรียก 5 ฟังก์ชันของ `reports.ts` มาให้
// 🔴 หน้ารายงาน = อ่านยาวกว่าจอปกติเสมอ (5 แท็บ + กราฟ) → ใช้ `min-h-[calc(100dvh-3.5rem)]` ปล่อย scroll
//    ธรรมชาติ **ห้ามก็อป fixed-viewport ของ Table/Calendar** (บทเรียน K2.4 §4.1 ที่ฝากไว้ตรง ๆ ให้ WO นี้)
// ⚠️ ห้ามใช้อีโมจิเป็นไอคอน UI (ใช้ <KanbanIcon> ทั้งหมด) — ยกเว้นข้อความ empty state ตามแบบ §5.7 ที่มี
//    "🎉" อยู่ในตัวอย่างคำเดิม (เหมือน MyTasks.tsx) · ห้าม toLocale*/Intl (server ส่ง string ไทยมาให้แล้ว)
"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { KanbanIcon } from "./KanbanIcon";
import { Avatar } from "./Card";
import { exportReportCsvAction } from "@/lib/modules/kanban/actions";
import type {
  ReportAgingDto,
  ReportKind,
  ReportOpenCardsDto,
  ReportOverdueDto,
  ReportThroughputWeekDto,
  ReportWorkloadDto,
} from "@/lib/modules/kanban/types";

const TH_MONTH_SHORT = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];

/** "YYYY-MM-DD" → "2 ก.ย." (ป้ายแกน x ของกราฟ) — คำนวณจากสตริงตรง ๆ ไม่ผ่าน Date/toLocale* (เหมือน SummaryView) */
function shortDateLabel(dateKey: string): string {
  const [, m, d] = dateKey.split("-").map(Number) as [number, number, number];
  return `${d} ${TH_MONTH_SHORT[m - 1]}`;
}

/** "YYYY-MM-DDTHH:mm:ss.sssZ" (UTC) → "5 ก.ย. 2569" (ไทย พ.ศ. — คิด +07:00 เอง ห้าม toLocale*) */
function shortThaiDate(iso: string): string {
  const ms = Date.parse(iso) + 7 * 60 * 60 * 1000;
  const d = new Date(ms);
  return `${d.getUTCDate()} ${TH_MONTH_SHORT[d.getUTCMonth()]} ${d.getUTCFullYear() + 543}`;
}

function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

type TabKey = "open" | "overdue" | "workload" | "throughput" | "aging";

const TABS: { key: TabKey; label: string; icon: string; exportKind?: ReportKind; exportFile: string }[] = [
  { key: "open", label: "ค้าง", icon: "list", exportFile: "kanban-ค้าง.csv" },
  { key: "overdue", label: "เลยกำหนด", icon: "warn", exportKind: "overdue", exportFile: "kanban-เลยกำหนด.csv" },
  { key: "workload", label: "ภาระงาน", icon: "users", exportKind: "workload", exportFile: "kanban-ภาระงาน.csv" },
  { key: "throughput", label: "ผลงานรายสัปดาห์", icon: "chart", exportKind: "throughput", exportFile: "kanban-ผลงานรายสัปดาห์.csv" },
  { key: "aging", label: "อายุงาน", icon: "clock", exportKind: "aging", exportFile: "kanban-อายุงาน.csv" },
];

function KpiChip({ icon, label, value, tone }: { icon: string; label: string; value: number; tone?: "danger" }) {
  return (
    <div className="card flex flex-none flex-col gap-1.5 sm:flex-auto" style={{ padding: 13, minWidth: 140 }}>
      <div className="flex items-center gap-1.5" style={{ fontSize: 12, color: "var(--color-muted)" }}>
        <KanbanIcon name={icon} size="sm" />
        {label}
      </div>
      <div
        className="tabular-nums"
        style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-.025em", color: tone === "danger" ? "var(--color-danger)" : "var(--color-ink)" }}
      >
        {value}
      </div>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="card flex items-center justify-center" style={{ padding: 28, fontSize: 13, color: "var(--color-muted)" }}>
      {text}
    </div>
  );
}

// ───────────────────────── ค้าง (ต่อบอร์ด) ─────────────────────────

function OpenBoardsList({ systemId, data }: { systemId: string; data: ReportOpenCardsDto }) {
  if (data.byBoard.length === 0) return <EmptyState text="ยังไม่มีบอร์ดให้ดูรายงาน" />;
  const allZero = data.total === 0;
  return (
    <div className="card flex flex-col" style={{ padding: 6, gap: 1 }}>
      {allZero && (
        <div style={{ padding: "14px 10px", fontSize: 13, color: "var(--color-muted)" }}>ยังไม่มีการ์ดค้าง 🎉</div>
      )}
      {data.byBoard.map((b) => (
        <Link
          key={b.boardId}
          href={`/app/sys/${systemId}/kanban/b/${b.boardId}?view=table`}
          className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-lg"
          style={{ padding: "10px 10px", fontSize: 13 }}
        >
          <span className="min-w-0 flex-1 truncate font-medium" style={{ color: "var(--color-ink)" }}>
            {b.boardName}
          </span>
          <span className="flex flex-none flex-wrap items-center gap-x-4 gap-y-0.5 tabular-nums" style={{ fontSize: 12.5, color: "var(--color-ink-soft)" }}>
            <span>ค้าง {b.open}</span>
            <span style={{ color: b.overdue > 0 ? "var(--color-danger)" : undefined }}>เลยกำหนด {b.overdue}</span>
            <span>วันนี้ {b.dueToday}</span>
            <span>สัปดาห์นี้ {b.dueWeek}</span>
          </span>
        </Link>
      ))}
    </div>
  );
}

// ───────────────────────── เลยกำหนด ─────────────────────────

function OverdueList({ systemId, data }: { systemId: string; data: ReportOverdueDto }) {
  if (data.rows.length === 0) return <EmptyState text="ไม่มีการ์ดเลยกำหนดส่ง 🎉" />;
  return (
    <div className="card flex flex-col" style={{ padding: 6, gap: 1 }}>
      {data.rows.map((r) => (
        <Link
          key={r.cardId}
          data-testid="reports-overdue-row"
          href={`/app/sys/${systemId}/kanban/b/${r.boardId}?card=${r.cardId}`}
          className="flex flex-col gap-1 rounded-lg"
          style={{ padding: "10px 10px", fontSize: 13, borderBottom: "1px solid var(--color-line)" }}
        >
          <span className="flex items-center gap-1.5">
            {r.cardNo != null && <span style={{ color: "var(--color-muted)" }}>#{r.cardNo}</span>}
            <span className="min-w-0 flex-1 truncate font-medium" style={{ color: "var(--color-ink)" }}>{r.title}</span>
            <span className="flex-none tabular-nums" style={{ color: "var(--color-danger)", fontWeight: 600 }}>
              เลย {r.daysOverdue} วัน
            </span>
          </span>
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1" style={{ fontSize: 12, color: "var(--color-muted)" }}>
            <span className="truncate">{r.boardName} · {r.columnName}</span>
            <span>ครบกำหนด {shortThaiDate(r.dueAt)}</span>
            {r.assignees.length > 0 && (
              <span className="flex items-center gap-1">
                {r.assignees.map((a) => (
                  <Avatar key={a.userId} name={a.name} size={18} />
                ))}
              </span>
            )}
          </span>
        </Link>
      ))}
    </div>
  );
}

// ───────────────────────── ภาระงาน ─────────────────────────

function WorkloadSvg({ rows }: { rows: ReportWorkloadDto["rows"] }) {
  const W = 640;
  const rowH = 26;
  const H = Math.max(rowH, rows.length * rowH) + 8;
  const labelW = 130;
  const numW = 34; // เผื่อที่ให้ตัวเลขท้ายแท่ง (สูงสุด 3 หลัก) ไม่ล้นขอบ viewBox เมื่อแท่งยาวสุด
  const max = Math.max(1, ...rows.map((r) => r.open));
  const plotW = W - labelW - numW;

  return (
    <svg
      data-testid="reports-workload-chart"
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      style={{ maxWidth: W, height: "auto" }}
      role="img"
      aria-label="กราฟภาระงานต่อคน — จำนวนการ์ดค้าง แยกส่วนที่เลยกำหนด"
    >
      {rows.map((r, i) => {
        const y = i * rowH + 4;
        const barH = rowH - 8;
        const openW = (r.open / max) * plotW;
        const overdueW = r.open > 0 ? (r.overdue / r.open) * openW : 0;
        return (
          <g key={r.userId}>
            <text x={0} y={y + barH / 2 + 4} style={{ fontSize: 11, fill: "var(--color-ink-soft)" }}>
              {r.name.length > 16 ? `${r.name.slice(0, 15)}…` : r.name}
            </text>
            <rect x={labelW} y={y} width={Math.max(openW, 1)} height={barH} rx={3} fill="var(--color-accent)" />
            {overdueW > 0 && <rect x={labelW} y={y} width={overdueW} height={barH} rx={3} fill="var(--color-tag-red)" />}
            <text x={labelW + Math.max(openW, 1) + 6} y={y + barH / 2 + 4} style={{ fontSize: 11, fill: "var(--color-muted)" }}>
              {r.open}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function WorkloadSection({ data }: { data: ReportWorkloadDto }) {
  if (data.rows.length === 0) return <EmptyState text="ยังไม่มีการ์ดที่มีผู้รับผิดชอบให้ดูภาระงาน" />;
  return (
    <div className="flex flex-col" style={{ gap: 12 }}>
      <div className="card" style={{ padding: 14 }}>
        <div className="flex items-center gap-4" style={{ marginBottom: 10, fontSize: 11.5, color: "var(--color-muted)" }}>
          <span className="flex items-center gap-1.5">
            <span style={{ width: 9, height: 9, borderRadius: 2, background: "var(--color-accent)" }} />
            ค้าง
          </span>
          <span className="flex items-center gap-1.5">
            <span style={{ width: 9, height: 9, borderRadius: 2, background: "var(--color-tag-red)" }} />
            เลยกำหนด
          </span>
        </div>
        <WorkloadSvg rows={data.rows} />
      </div>
      <div className="card flex flex-col" style={{ padding: 6, gap: 1 }}>
        {data.rows.map((r) => (
          <div
            key={r.userId}
            data-testid="reports-workload-row"
            className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-lg"
            style={{ padding: "9px 10px", fontSize: 13 }}
          >
            <span className="min-w-0 flex-1 truncate font-medium" style={{ color: "var(--color-ink)" }}>{r.name}</span>
            <span className="flex flex-none flex-wrap items-center gap-x-4 gap-y-0.5 tabular-nums" style={{ fontSize: 12.5, color: "var(--color-ink-soft)" }}>
              <span>ค้าง {r.open}</span>
              <span style={{ color: r.overdue > 0 ? "var(--color-danger)" : undefined }}>เลยกำหนด {r.overdue}</span>
              <span>สัปดาห์นี้ {r.dueWeek}</span>
              <span>เสร็จ 30 วัน {r.done30d}</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ───────────────────────── ผลงานรายสัปดาห์ ─────────────────────────

function ThroughputSvg({ weeks }: { weeks: ReportThroughputWeekDto[] }) {
  const W = 720;
  const H = 200;
  const padTop = 12;
  const padBottom = 28;
  const padSide = 8;
  const plotH = H - padTop - padBottom;
  const max = Math.max(1, ...weeks.flatMap((w) => [w.created, w.completed]));
  const groupW = weeks.length > 0 ? (W - padSide * 2) / weeks.length : 0;
  const barW = Math.min(12, groupW / 3);

  return (
    <svg
      data-testid="reports-throughput-chart"
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      style={{ maxWidth: W, height: "auto" }}
      role="img"
      aria-label={`กราฟจำนวนงานที่สร้างใหม่เทียบกับงานที่เสร็จ รายสัปดาห์ ${weeks.length} สัปดาห์ล่าสุด`}
    >
      <line x1={padSide} y1={H - padBottom} x2={W - padSide} y2={H - padBottom} stroke="var(--color-line)" strokeWidth={1} />
      {weeks.map((w, i) => {
        const cx = padSide + i * groupW + groupW / 2;
        const createdH = (w.created / max) * plotH;
        const completedH = (w.completed / max) * plotH;
        return (
          <g key={w.weekStart}>
            <rect x={cx - barW - 1.5} y={H - padBottom - createdH} width={barW} height={createdH} rx={2} fill="var(--color-accent)" />
            <rect x={cx + 1.5} y={H - padBottom - completedH} width={barW} height={completedH} rx={2} fill="var(--color-tag-green)" />
            {(i % Math.max(1, Math.ceil(weeks.length / 12)) === 0 || i === weeks.length - 1) && (
              <text x={cx} y={H - padBottom + 14} textAnchor="middle" style={{ fontSize: 9.5, fill: "var(--color-muted)" }}>
                {shortDateLabel(w.weekStart)}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

function ThroughputSection({ weeks }: { weeks: ReportThroughputWeekDto[] }) {
  return (
    <div className="card flex flex-col" style={{ padding: 14, gap: 10 }}>
      <div className="flex items-center gap-4" style={{ fontSize: 11.5, color: "var(--color-muted)" }}>
        <span className="flex items-center gap-1.5">
          <span style={{ width: 9, height: 9, borderRadius: 2, background: "var(--color-accent)" }} />
          สร้างใหม่
        </span>
        <span className="flex items-center gap-1.5">
          <span style={{ width: 9, height: 9, borderRadius: 2, background: "var(--color-tag-green)" }} />
          เสร็จแล้ว
        </span>
      </div>
      <ThroughputSvg weeks={weeks} />
    </div>
  );
}

// ───────────────────────── อายุงาน ─────────────────────────

function AgingSvg({ buckets }: { buckets: ReportAgingDto["buckets"] }) {
  const W = 480;
  const H = 160;
  const padBottom = 26;
  const padTop = 20; // เผื่อที่ให้ตัวเลขจำนวนเหนือแท่งที่สูงสุด (แท่งเต็ม plotH) ไม่ชนขอบบนของ viewBox
  const plotH = H - padTop - padBottom;
  const max = Math.max(1, ...buckets.map((b) => b.count));
  const groupW = W / buckets.length;
  const barW = Math.min(64, groupW * 0.5);

  return (
    <svg
      data-testid="reports-aging-chart"
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      style={{ maxWidth: W, height: "auto" }}
      role="img"
      aria-label="กราฟจำนวนการ์ดค้างแยกตามอายุ 4 ช่วง"
    >
      <line x1={0} y1={H - padBottom} x2={W} y2={H - padBottom} stroke="var(--color-line)" strokeWidth={1} />
      {buckets.map((b, i) => {
        const cx = i * groupW + groupW / 2;
        const barH = (b.count / max) * plotH;
        return (
          <g key={b.key}>
            <rect x={cx - barW / 2} y={H - padBottom - barH} width={barW} height={Math.max(barH, b.count > 0 ? 2 : 0)} rx={3} fill="var(--color-accent)" />
            <text x={cx} y={H - padBottom - barH - 6} textAnchor="middle" style={{ fontSize: 11, fontWeight: 700, fill: "var(--color-ink)" }}>
              {b.count}
            </text>
            <text x={cx} y={H - padBottom + 14} textAnchor="middle" style={{ fontSize: 10, fill: "var(--color-muted)" }}>
              {b.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function AgingSection({ data }: { data: ReportAgingDto }) {
  const allZero = data.byColumn.length === 0;
  return (
    <div className="flex flex-col" style={{ gap: 12 }}>
      <div className="card" style={{ padding: 14 }}>
        <AgingSvg buckets={data.buckets} />
      </div>
      {allZero ? (
        <EmptyState text="ยังไม่มีการ์ดค้างให้ดูอายุงาน 🎉" />
      ) : (
        <div className="card flex flex-col" style={{ padding: 6, gap: 1 }}>
          {data.byColumn.map((c) => (
            <div
              key={`${c.boardId}::${c.columnName}`}
              data-testid="reports-aging-row"
              className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-lg"
              style={{ padding: "9px 10px", fontSize: 13 }}
            >
              <span className="min-w-0 flex-1 truncate">
                <span className="font-medium" style={{ color: "var(--color-ink)" }}>{c.columnName}</span>
                <span style={{ color: "var(--color-muted)" }}> · {c.boardName}</span>
              </span>
              <span className="flex flex-none flex-wrap items-center gap-x-4 gap-y-0.5 tabular-nums" style={{ fontSize: 12.5, color: "var(--color-ink-soft)" }}>
                <span>ค้าง {c.open}</span>
                <span>เฉลี่ย {c.avgDays} วัน</span>
                <span>สูงสุด {c.maxDays} วัน</span>
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ───────────────────────── หน้าหลัก ─────────────────────────

export function ReportsPage({
  systemId,
  boards,
  selectedBoardId,
  openCards,
  overdue,
  workload,
  throughput,
  aging,
}: {
  systemId: string;
  boards: { id: string; name: string }[];
  selectedBoardId?: string;
  openCards: ReportOpenCardsDto;
  overdue: ReportOverdueDto;
  workload: ReportWorkloadDto;
  throughput: ReportThroughputWeekDto[];
  aging: ReportAgingDto;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<TabKey>("open");
  const [exporting, setExporting] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast((t) => (t === message ? null : t)), 4200);
  };

  const dueTodayTotal = openCards.byBoard.reduce((n, b) => n + b.dueToday, 0);
  const dueWeekTotal = openCards.byBoard.reduce((n, b) => n + b.dueWeek, 0);
  const activeTab = TABS.find((t) => t.key === tab)!;

  const onBoardChange = (value: string) => {
    const params = new URLSearchParams();
    if (value) params.set("board", value);
    params.set("tab", tab);
    router.push(`?${params.toString()}`);
  };

  const onExport = async () => {
    if (!activeTab.exportKind) return;
    setExporting(true);
    try {
      const res = await exportReportCsvAction({ systemId, kind: activeTab.exportKind, boardId: selectedBoardId });
      if (res.ok) downloadCsv(activeTab.exportFile, res.csv);
      else showToast(res.message);
    } catch {
      showToast("ส่งออกไม่สำเร็จ ลองใหม่อีกครั้ง");
    } finally {
      setExporting(false);
    }
  };

  return (
    <div data-testid="reports-page" className="flex min-h-[calc(100dvh-3.5rem)] flex-col" style={{ gap: 16 }}>
      {/* ตัวเลขใหญ่ 4 ค่า — มือถือ = ชิปเลื่อนแนวนอน · sm ขึ้นไป = grid 4 คอลัมน์ */}
      <div className="flex gap-2 overflow-x-auto sm:grid sm:grid-cols-4 sm:overflow-visible" style={{ paddingBottom: 2 }}>
        <KpiChip icon="list" label="ค้าง" value={openCards.total} />
        <KpiChip icon="warn" label="เลยกำหนด" value={openCards.overdue} tone="danger" />
        <KpiChip icon="clock" label="ถึงกำหนดวันนี้" value={dueTodayTotal} />
        <KpiChip icon="cal" label="สัปดาห์นี้" value={dueWeekTotal} />
      </div>

      {/* แถบเครื่องมือ: แท็บ (เลื่อนแนวนอนทั้งมือถือ/เดสก์ท็อป) + ตัวกรองบอร์ด + ส่งออก */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="-mx-1 flex gap-1 overflow-x-auto" style={{ paddingBottom: 2 }}>
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              data-testid="reports-tab"
              data-tab-key={t.key}
              onClick={() => setTab(t.key)}
              className="flex flex-none items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-2 text-sm transition-colors"
              style={{
                border: "1px solid var(--color-line)",
                background: tab === t.key ? "var(--color-ink)" : "var(--color-surface)",
                color: tab === t.key ? "var(--color-surface)" : "var(--color-ink-soft)",
              }}
            >
              <KanbanIcon name={t.icon} size="sm" />
              {t.label}
            </button>
          ))}
        </div>
        <div className="flex flex-none items-center gap-2">
          <select
            data-testid="reports-board-filter"
            value={selectedBoardId ?? ""}
            onChange={(e) => onBoardChange(e.target.value)}
            className="h-9 rounded-lg px-2 text-sm"
            style={{ border: "1px solid var(--color-line)", background: "var(--color-surface)", color: "var(--color-ink)" }}
          >
            <option value="">ทุกบอร์ด</option>
            {boards.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
          {activeTab.exportKind && (
            <button
              type="button"
              data-testid="reports-export"
              disabled={exporting}
              onClick={onExport}
              className="flex h-9 flex-none items-center gap-1.5 rounded-lg px-3 text-sm"
              style={{ border: "1px solid var(--color-line)", background: "var(--color-surface)", color: "var(--color-ink-soft)", opacity: exporting ? 0.6 : 1 }}
            >
              <KanbanIcon name="upload" size="sm" />
              ส่งออก CSV
            </button>
          )}
        </div>
      </div>

      {/* เนื้อหาของแท็บที่เปิดอยู่ */}
      <div className="flex-1">
        {tab === "open" && <OpenBoardsList systemId={systemId} data={openCards} />}
        {tab === "overdue" && <OverdueList systemId={systemId} data={overdue} />}
        {tab === "workload" && <WorkloadSection data={workload} />}
        {tab === "throughput" && <ThroughputSection weeks={throughput} />}
        {tab === "aging" && <AgingSection data={aging} />}
      </div>

      {toast && (
        <div className="pointer-events-none fixed inset-x-0 bottom-20 z-[70] flex justify-center px-4">
          <div
            role="status"
            className="pointer-events-auto flex items-center gap-2 rounded-full px-4 py-3"
            style={{ background: "var(--color-ink)", color: "var(--color-surface)", fontSize: 13, boxShadow: "0 8px 24px rgba(10,10,10,.24)" }}
          >
            <KanbanIcon name="warn" size="sm" />
            {toast}
          </div>
        </div>
      )}
    </div>
  );
}

export default ReportsPage;
