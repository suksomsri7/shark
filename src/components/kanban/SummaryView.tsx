// SummaryView.tsx — มุมมองสรุป `?view=summary` (K2.4 · พิมพ์เขียว 13-kanban-v2 §3.7 · ไม่มี mockup — เกณฑ์
// เดียวกับภาพ 06 (ตัวเลขใหญ่หลายค่า): ตัวเลข 5 ค่า + 4 ไทล์ (คอลัมน์/คน/กำหนดส่ง/ป้าย) + throughput
//
// 🔴 หัวใจของ WO: ทุกไทล์เป็น `<Link href>` ไปตาราง `?view=table&...` ที่กรองแล้ว — ตัวเลขในไทล์ต้องเท่ากับ
// จำนวนแถวหลังกดเจาะลงเป๊ะ (สัญญา ledger/KANBAN-RUN.md §K2.4) — เพราะฉะนั้นห้ามคำนวณตัวเลขที่นี่เอง
// (อ่านอย่างเดียวจาก `BoardSummaryDto` ที่ `summary.ts` ประกอบมาให้ ไม่มี state/คำนวณซ้ำ)
//
// ⚠️ ห้ามใช้อีโมจิ — ไอคอนทุกตัวมาจาก <KanbanIcon> · ห้าม toLocale*/Intl (บทเรียน K1.5: hydration)
// ⚠️ มือถือ: ไทล์เรียง 1 คอลัมน์ (สัญญา §3.7) — ทำผ่าน CSS breakpoint ล้วน (ไม่มีการโต้ตอบที่ต่างกันระหว่าง
//    จอ ต่างจาก TableView/CalendarView ที่ต้องสลับ DOM ทั้งชุดเพราะมีแก้ในช่อง/ลากที่ไม่มีบนมือถือ)
"use client";

import { useState } from "react";
import Link from "next/link";
import { BoardHeader } from "./BoardHeader";
import { FilterBar } from "./FilterBar";
import { KanbanIcon } from "./KanbanIcon";
import { tagColorVar } from "./Card";
import { renameBoardAction, starBoardAction } from "@/lib/modules/kanban/actions";
import type { BoardFilters } from "@/lib/modules/kanban/filters";
import type { BoardSummaryDto, BoardViewDto, SummaryLabelTileDto, SummaryTileDto } from "@/lib/modules/kanban/types";

const TH_MONTH_SHORT = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];

/** "YYYY-MM-DD" → "2 ก.ย." (ป้ายแกน x ของกราฟ throughput) — คำนวณจากสตริงตรง ๆ ไม่ผ่าน Date/toLocale* */
function shortDateLabel(dateKey: string): string {
  const [, m, d] = dateKey.split("-").map(Number) as [number, number, number];
  return `${d} ${TH_MONTH_SHORT[m - 1]}`;
}

function KpiTile({ icon, label, value, tone }: { icon: string; label: string; value: number; tone?: "danger" }) {
  return (
    <div className="card flex flex-col gap-1.5" style={{ padding: 13 }}>
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

/** 1 ส่วนของไทล์ (คอลัมน์ / ผู้รับผิดชอบ / กำหนดส่ง / ป้ายกำกับ) — `group` = คีย์เครื่องอังกฤษล้วน
 *  (ใช้เป็น `data-tile-group` ให้ QC ภาพ/ปลั๊กอินทดสอบเลือก selector ได้แน่นอน ไม่ผูกกับข้อความไทยที่แก้ได้) */
function TileSection<T extends SummaryTileDto>({
  title,
  icon,
  group,
  tiles,
  dotColorOf,
}: {
  title: string;
  icon: string;
  group: "column" | "assignee" | "due" | "label";
  tiles: readonly T[];
  dotColorOf?: (tile: T) => string | undefined;
}) {
  return (
    <div className="card flex flex-col" style={{ padding: 14, gap: 8 }}>
      <div className="flex items-center gap-1.5" style={{ fontSize: 12.5, fontWeight: 700, color: "var(--color-ink-soft)" }}>
        <KanbanIcon name={icon} size="sm" />
        {title}
      </div>
      {tiles.length === 0 ? (
        <span style={{ fontSize: 12, color: "var(--color-muted)" }}>ไม่มีข้อมูล</span>
      ) : (
        <div className="flex flex-col" style={{ gap: 1 }}>
          {tiles.map((t) => {
            const dot = dotColorOf?.(t);
            return (
              <Link
                key={t.key}
                href={t.href}
                data-testid="summary-tile"
                data-tile-group={group}
                data-tile-key={t.key}
                data-tile-label={t.label}
                className="flex items-center justify-between rounded-lg"
                style={{ padding: "7px 9px", fontSize: 12.5, color: "var(--color-ink)" }}
              >
                <span className="flex min-w-0 flex-1 items-center gap-2 truncate">
                  {dot && <span style={{ width: 9, height: 9, borderRadius: 3, background: dot, flex: "none" }} />}
                  <span className="truncate">{t.label}</span>
                </span>
                <span className="tabular-nums font-semibold" style={{ marginLeft: 8 }}>
                  {t.count}
                </span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** กราฟ throughput รายสัปดาห์ (สร้าง vs เสร็จ) — SVG ล้วน ไม่เพิ่ม dependency ใหม่ (สัญญา §K2.4) */
function ThroughputChart({ weeks }: { weeks: BoardSummaryDto["throughput"] }) {
  const W = 640;
  const H = 180;
  const padTop = 12;
  const padBottom = 26;
  const padSide = 8;
  const plotH = H - padTop - padBottom;
  const max = Math.max(1, ...weeks.flatMap((w) => [w.created, w.completed]));
  const groupW = weeks.length > 0 ? (W - padSide * 2) / weeks.length : 0;
  const barW = Math.min(16, groupW / 3);

  return (
    <div className="flex flex-col" style={{ gap: 8 }}>
      <div className="flex items-center" style={{ gap: 14, fontSize: 11.5, color: "var(--color-muted)" }}>
        <span className="flex items-center gap-1.5">
          <span style={{ width: 9, height: 9, borderRadius: 2, background: "var(--color-accent)" }} />
          สร้างใหม่
        </span>
        <span className="flex items-center gap-1.5">
          <span style={{ width: 9, height: 9, borderRadius: 2, background: "var(--color-tag-green)" }} />
          เสร็จแล้ว
        </span>
      </div>
      <svg
        data-testid="summary-chart"
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        style={{ maxWidth: W, height: "auto" }}
        role="img"
        aria-label="กราฟจำนวนงานที่สร้างใหม่เทียบกับงานที่เสร็จ รายสัปดาห์ 8 สัปดาห์ล่าสุด"
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
              <text x={cx} y={H - padBottom + 14} textAnchor="middle" style={{ fontSize: 9.5, fill: "var(--color-muted)" }}>
                {shortDateLabel(w.weekStart)}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export function SummaryView({
  board,
  data,
  filters,
}: {
  board: BoardViewDto;
  data: BoardSummaryDto;
  filters: BoardFilters;
}) {
  const systemId = board.systemId;
  const [boardName, setBoardName] = useState(board.name);
  const [starred, setStarred] = useState(board.starred);
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast((t) => (t === message ? null : t)), 4200);
  };

  const totalCardCount = board.columns.reduce((n, c) => n + c.cards.length, 0);

  return (
    <div className="flex min-h-[calc(100dvh-3.5rem)] flex-col" style={{ background: "var(--color-stage)" }}>
      <BoardHeader
        board={{ ...board, name: boardName }}
        starred={starred}
        filters={filters}
        onToggleStar={() => {
          const next = !starred;
          setStarred(next);
          starBoardAction({ systemId, boardId: board.id, starred: next }).catch(() => {
            setStarred(!next);
            showToast("บันทึกดาวไม่สำเร็จ ลองใหม่อีกครั้ง");
          });
        }}
        onRename={(name) => {
          const before = boardName;
          setBoardName(name);
          renameBoardAction({ systemId, boardId: board.id, name }).catch(() => {
            setBoardName(before);
            showToast("เปลี่ยนชื่อบอร์ดไม่สำเร็จ ลองใหม่อีกครั้ง");
          });
        }}
      />
      <FilterBar filters={filters} totalCount={totalCardCount} visibleCount={data.totals.open + data.totals.done} members={board.members} columns={board.columns} />

      <div data-testid="summary-view" className="flex flex-1 flex-col" style={{ gap: 16, padding: 20 }}>
        {/* ── ตัวเลขใหญ่ 5 ค่า (มือถือ 2 คอลัมน์ · เดสก์ท็อป 5 คอลัมน์) ── */}
        <div className="grid grid-cols-2 sm:grid-cols-5" style={{ gap: 10 }}>
          <KpiTile icon="list" label="ค้าง" value={data.totals.open} />
          <KpiTile icon="warn" label="เลยกำหนด" value={data.totals.overdue} tone="danger" />
          <KpiTile icon="clock" label="ถึงกำหนดวันนี้" value={data.totals.dueToday} />
          <KpiTile icon="cal" label="สัปดาห์นี้" value={data.totals.dueWeek} />
          <KpiTile icon="check" label="เสร็จแล้ว" value={data.totals.done} />
        </div>

        {/* ── 4 ไทล์: การ์ดต่อคอลัมน์ / ต่อคน / ต่อกำหนดส่ง / ต่อป้าย ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2" style={{ gap: 12 }}>
          <TileSection title="การ์ดต่อคอลัมน์" icon="grid" group="column" tiles={data.byColumn} />
          <TileSection title="การ์ดต่อผู้รับผิดชอบ" icon="users" group="assignee" tiles={data.byAssignee} />
          <TileSection title="การ์ดต่อกำหนดส่ง" icon="cal" group="due" tiles={data.byDue} />
          <TileSection<SummaryLabelTileDto>
            title="การ์ดต่อป้ายกำกับ"
            icon="tag"
            group="label"
            tiles={data.byLabel}
            dotColorOf={(t) => tagColorVar(t.color)}
          />
        </div>

        {/* ── throughput รายสัปดาห์ (สร้าง vs เสร็จ) ── */}
        <div className="card flex flex-col" style={{ padding: 14, gap: 10 }}>
          <div className="flex items-center gap-1.5" style={{ fontSize: 12.5, fontWeight: 700, color: "var(--color-ink-soft)" }}>
            <KanbanIcon name="chart" size="sm" />
            ผลงานรายสัปดาห์ (8 สัปดาห์ล่าสุด)
          </div>
          <ThroughputChart weeks={data.throughput} />
        </div>
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

export default SummaryView;
