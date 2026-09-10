// OverviewPage.tsx — มุมมองข้ามบอร์ดระดับองค์กร `/kanban/overview` (K3.8 · ledger/KANBAN-RUN.md §K3.8)
//
// โครงเดียวกับตารางของบอร์ดเดียว (`ledger/design-kanban/04-table.png` — ดู `TableView.tsx`) + ตัวเลข
// หัวหน้าเพจแบบ `SummaryView.tsx` (K2.4) แต่ **อ่านอย่างเดียว**: ไม่มีแก้ในช่อง/ลาก/เลือกหลายรายการ
// (bulk) เพราะแถวมาจากคนละบอร์ดกัน แก้ไม่ได้ด้วยสิทธิ์/แบบฟอร์มเดียว — คลิกแถวพาไปหลังการ์ดที่บอร์ดของ
// การ์ดนั้นจริง ๆ (`/kanban/b/{boardId}?card={cardId}` — ใช้หลังการ์ดที่มีอยู่แล้ว ไม่สร้างโมดัลใหม่)
//
// ⚠️ ห้ามใช้อีโมจิ — ไอคอนทุกตัวมาจาก <KanbanIcon> · ห้ามใช้ตัวแปลงวันที่ของเบราว์เซอร์/Intl (บทเรียน K1.5)
"use client";

import { useState, useSyncExternalStore, useTransition } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { KanbanIcon } from "./KanbanIcon";
import { Avatar, dueBadgeFrom, DUE_STYLE, formatCardDateTime, tagColorVar } from "./Card";
import { FilterBar } from "./FilterBar";
import { relativeThaiTime } from "@/lib/modules/kanban/activity-text";
import { describeSavedViewConfig, hrefForSavedView } from "@/lib/modules/kanban/filters";
import { saveViewAction, deleteViewAction } from "@/lib/modules/kanban/actions";
import type { BoardFilters } from "@/lib/modules/kanban/filters";
import type {
  CrossBoardBoardDto,
  CrossBoardFilters,
  CrossBoardGroupBy,
  CrossBoardResult,
  CrossBoardRowDto,
  CrossBoardSort,
  CrossBoardTotalsDto,
  SavedViewDto,
  ViewConfig,
} from "@/lib/modules/kanban/types";

// ── < 640px = มือถือ — `useSyncExternalStore` กัน hydration mismatch (แบบเดียวกับ K2.1 `TableView.tsx`) ──
const MOBILE_QUERY = "(max-width: 639px)";
function subscribeMobileQuery(onChange: () => void): () => void {
  const mql = window.matchMedia(MOBILE_QUERY);
  mql.addEventListener("change", onChange);
  return () => mql.removeEventListener("change", onChange);
}
const getMobileSnapshot = () => window.matchMedia(MOBILE_QUERY).matches;
const getMobileServerSnapshot = () => false;
function useIsMobileOverview(): boolean {
  return useSyncExternalStore(subscribeMobileQuery, getMobileSnapshot, getMobileServerSnapshot);
}

const GROUP_OPTIONS: { value: CrossBoardGroupBy | ""; label: string }[] = [
  { value: "", label: "ไม่จัดกลุ่ม" },
  { value: "board", label: "บอร์ด" },
  { value: "assignee", label: "ผู้รับผิดชอบ" },
  { value: "due", label: "กำหนดส่ง" },
];

const SORT_OPTIONS: { value: CrossBoardSort; label: string }[] = [
  { value: "position", label: "ลำดับบอร์ด" },
  { value: "due", label: "กำหนดส่ง" },
  { value: "created", label: "สร้างล่าสุด" },
  { value: "updated", label: "แก้ไขล่าสุด" },
];

const cellStyle: React.CSSProperties = { padding: "8px 10px", verticalAlign: "middle", fontSize: 12.5, borderBottom: "1px solid var(--color-line)" };
const ghostBtn: React.CSSProperties = {
  height: 30,
  padding: "0 10px",
  borderRadius: 7,
  fontSize: 12.5,
  border: "1px solid var(--color-line)",
  background: "var(--color-surface)",
  color: "var(--color-ink-soft)",
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  whiteSpace: "nowrap",
};

/** ตัดฟิลด์ `board` (ชนิด `string[]` ของภาพรวม) ออกก่อนส่งให้ `<FilterBar>` เดิม (ชนิด `BoardFilters` เดิม
 * ใช้ `board?: string` คนละความหมาย — ตัวเลือกบอร์ดของภาพรวมมี UI ของตัวเอง testid `overview-boards`) */
function toBoardFiltersForDisplay(f: CrossBoardFilters): BoardFilters {
  const { board: _board, ...rest } = f;
  return rest;
}

function KpiTile({ icon, label, value, tone }: { icon: string; label: string; value: number; tone?: "danger" }) {
  return (
    <div className="card flex flex-col gap-1.5" style={{ padding: 13 }}>
      <div className="flex items-center gap-1.5" style={{ fontSize: 12, color: "var(--color-muted)" }}>
        <KanbanIcon name={icon} size="sm" />
        {label}
      </div>
      <div className="tabular-nums" style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-.025em", color: tone === "danger" ? "var(--color-danger)" : "var(--color-ink)" }}>
        {value}
      </div>
    </div>
  );
}

export function OverviewPage({
  systemId,
  now,
  data,
  totals,
  filters,
  selectedBoardIds,
  group,
  sort,
  page,
  savedViews,
  isOwner,
  viewerUserId,
}: {
  systemId: string;
  /** ISO — เวลาอ้างอิงของ server ตอนเรนเดอร์ */
  now: string;
  data: CrossBoardResult;
  totals: CrossBoardTotalsDto;
  filters: CrossBoardFilters;
  selectedBoardIds: string[];
  group?: CrossBoardGroupBy;
  sort?: CrossBoardSort;
  page: number;
  savedViews: SavedViewDto[];
  /** มุมมองข้ามบอร์ดแบบ "ทั้งทีม" บันทึกได้เฉพาะ OWNER (สัญญา K3.8) */
  isOwner: boolean;
  viewerUserId: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const isMobile = useIsMobileOverview();
  const [, startTransition] = useTransition();
  const nowMs = Date.parse(now);
  const [boardsOpen, setBoardsOpen] = useState(false);

  const setParam = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === "") next.delete(k);
      else next.set(k, v);
    }
    startTransition(() => router.push(`${pathname}?${next.toString()}`, { scroll: false }));
  };

  const toggleBoard = (id: string) => {
    const next = selectedBoardIds.includes(id) ? selectedBoardIds.filter((b) => b !== id) : [...selectedBoardIds, id];
    setParam({ board: next.length > 0 ? next.join(",") : null, page: null });
  };

  const openCard = (row: CrossBoardRowDto) => {
    router.push(`/app/sys/${systemId}/kanban/b/${row.boardId}?card=${row.id}`);
  };

  const groupOf = data.groups
    ? data.groups.map((g) => ({ ...g, items: g.rowIds.map((id) => data.rows.find((r) => r.id === id)).filter((r): r is CrossBoardRowDto => !!r) }))
    : null;

  return (
    <div data-testid="overview-page" className="flex flex-col" style={{ gap: 16, padding: isMobile ? 0 : 4 }}>
      {/* ── ตัวเลขใหญ่ 4 ค่า (มือถือ 2 คอลัมน์ · เดสก์ท็อป 4 คอลัมน์) ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4" style={{ gap: 10, padding: isMobile ? "0 14px" : 0 }}>
        <KpiTile icon="list" label="ค้าง" value={totals.open} />
        <KpiTile icon="warn" label="เลยกำหนด" value={totals.overdue} tone="danger" />
        <KpiTile icon="clock" label="ถึงกำหนดวันนี้" value={totals.dueToday} />
        <KpiTile icon="cal" label="สัปดาห์นี้" value={totals.dueWeek} />
      </div>

      {/* ── แถบเครื่องมือ: เลือกบอร์ด · จัดกลุ่ม · เรียง · มุมมองที่บันทึกไว้ ── */}
      <div className="flex flex-none flex-wrap items-center" style={{ gap: 8, padding: isMobile ? "0 14px" : 0 }}>
        <span className="relative">
          <button type="button" data-testid="overview-boards" onClick={() => setBoardsOpen((o) => !o)} style={ghostBtn}>
            <KanbanIcon name="filter" size="sm" />
            บอร์ด {selectedBoardIds.length > 0 ? `(${selectedBoardIds.length})` : "ทั้งหมด"}
          </button>
          {boardsOpen && <BoardsDropdown boards={data.boards} selected={selectedBoardIds} onToggle={toggleBoard} onClear={() => setParam({ board: null, page: null })} onClose={() => setBoardsOpen(false)} />}
        </span>

        <label className="flex items-center gap-1.5" style={{ fontSize: 12.5, color: "var(--color-muted)" }}>
          จัดกลุ่ม:
          <select data-testid="overview-group" value={group ?? ""} onChange={(e) => setParam({ group: e.target.value || null, page: null })} style={{ ...ghostBtn, appearance: "auto" }}>
            {GROUP_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>

        <label className="flex items-center gap-1.5" style={{ fontSize: 12.5, color: "var(--color-muted)" }}>
          เรียง:
          <select value={sort ?? "position"} onChange={(e) => setParam({ sort: e.target.value, page: null })} style={{ ...ghostBtn, appearance: "auto" }}>
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>

        <span className="flex-1" />

        <OverviewSavedViews systemId={systemId} isOwner={isOwner} viewerUserId={viewerUserId} views={savedViews} pathname={pathname} searchParams={searchParams} />
      </div>

      <FilterBar filters={toBoardFiltersForDisplay(filters)} totalCount={totals.open} visibleCount={data.total} members={[]} columns={[]} />

      {isMobile ? (
        <div className="flex-1 overflow-y-auto">
          {data.rows.length === 0 ? (
            <EmptyState hasFilters={selectedBoardIds.length > 0 || Boolean(filters.q || filters.assignee || filters.label || filters.due || filters.status || filters.column)} onClear={() => router.push(pathname)} />
          ) : (
            data.rows.map((r) => (
              <button
                key={r.id}
                type="button"
                data-testid="overview-row"
                onClick={() => openCard(r)}
                className="flex w-full flex-col gap-1 border-b text-left"
                style={{ padding: "10px 14px", borderColor: "var(--color-line)" }}
              >
                <span className="flex items-center gap-2" style={{ fontSize: 13, fontWeight: 500 }}>
                  {r.cardNo && <span style={{ color: "var(--color-muted)", fontWeight: 400 }}>#{r.cardNo}</span>}
                  {r.title}
                </span>
                <span className="flex items-center gap-2" style={{ fontSize: 11.5, color: "var(--color-muted)" }}>
                  <span className="inline-flex items-center font-semibold" style={{ gap: 4, color: tagColorVar(r.boardColor) }}>
                    <span style={{ width: 8, height: 8, borderRadius: 2, background: tagColorVar(r.boardColor), display: "inline-block" }} />
                    {r.boardName}
                  </span>
                  · {r.columnName}
                  <DueChip row={r} nowMs={nowMs} />
                  {r.assignees.slice(0, 2).map((a) => (
                    <Avatar key={a.userId} name={a.name} size={18} />
                  ))}
                </span>
              </button>
            ))
          )}
        </div>
      ) : (
        <div data-testid="table-view" className="flex-1 overflow-auto">
          {data.rows.length === 0 ? (
            <EmptyState hasFilters={selectedBoardIds.length > 0 || Boolean(filters.q || filters.assignee || filters.label || filters.due || filters.status || filters.column)} onClear={() => router.push(pathname)} />
          ) : (
            <table className="w-full border-collapse" style={{ fontSize: 12.5 }}>
              <thead>
                <tr style={{ background: "var(--color-surface-2)", textAlign: "left" }}>
                  <th style={cellStyle}>การ์ด</th>
                  <th style={cellStyle}>บอร์ด</th>
                  <th style={cellStyle}>คอลัมน์</th>
                  <th style={cellStyle}>ผู้รับผิดชอบ</th>
                  <th style={cellStyle}>กำหนดส่ง</th>
                  <th style={cellStyle}>เช็คลิสต์</th>
                  <th style={cellStyle}>ป้ายกำกับ</th>
                  <th style={cellStyle}>เชื่อมระบบ</th>
                  <th style={cellStyle}>แก้ไขล่าสุด</th>
                </tr>
              </thead>
              <tbody>
                {groupOf
                  ? groupOf.map((g) => (
                      <OverviewGroupBlock key={g.key} label={g.label} items={g.items} nowMs={nowMs} onOpen={openCard} />
                    ))
                  : data.rows.map((r) => <OverviewRow key={r.id} row={r} nowMs={nowMs} onOpen={() => openCard(r)} />)}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ── ท้ายตาราง: จำนวน + แบ่งหน้า (ปิดเมื่อจัดกลุ่ม — กลุ่มโชว์ครบทุกใบอยู่แล้ว) ── */}
      <div className="flex flex-none items-center" style={{ gap: 10, padding: isMobile ? "0 14px 14px" : "0", fontSize: 12, color: "var(--color-muted)" }}>
        <span>
          แสดง {data.rows.length} จาก {data.total} การ์ด
        </span>
        {!group && data.total > data.pageSize && (
          <span className="ml-auto flex items-center gap-2">
            <button type="button" disabled={page <= 1} onClick={() => setParam({ page: String(page - 1) })} style={{ ...ghostBtn, opacity: page <= 1 ? 0.4 : 1 }}>
              ก่อนหน้า
            </button>
            <span>หน้า {page}</span>
            <button
              type="button"
              disabled={page * data.pageSize >= data.total}
              onClick={() => setParam({ page: String(page + 1) })}
              style={{ ...ghostBtn, opacity: page * data.pageSize >= data.total ? 0.4 : 1 }}
            >
              ถัดไป
            </button>
          </span>
        )}
      </div>
    </div>
  );
}

// ───────────────────────── ตัวเลือกบอร์ด (testid overview-boards) ─────────────────────────

function BoardsDropdown({
  boards,
  selected,
  onToggle,
  onClear,
  onClose,
}: {
  boards: CrossBoardBoardDto[];
  selected: string[];
  onToggle: (id: string) => void;
  onClear: () => void;
  onClose: () => void;
}) {
  return (
    <>
      <span className="fixed inset-0 z-40" onClick={onClose} />
      <div
        data-testid="overview-boards-list"
        className="absolute left-0 top-full z-50 mt-1 flex max-h-72 w-64 flex-col gap-0.5 overflow-y-auto rounded-xl border p-1.5"
        style={{ background: "var(--color-surface)", borderColor: "var(--color-line)", boxShadow: "0 14px 34px rgba(10,10,10,.14)" }}
      >
        {boards.length === 0 && (
          <span className="px-2 py-1.5" style={{ fontSize: 12.5, color: "var(--color-muted)" }}>
            ยังไม่มีบอร์ดที่มองเห็น
          </span>
        )}
        {boards.map((b) => (
          <button
            key={b.id}
            type="button"
            data-testid="overview-board-option"
            onClick={() => onToggle(b.id)}
            className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-left"
            style={{ fontSize: 12.5, background: selected.includes(b.id) ? "var(--color-surface-2)" : "transparent" }}
          >
            <span style={{ width: 10, height: 10, borderRadius: 3, background: tagColorVar(b.color), flexShrink: 0 }} />
            <span className="flex-1 truncate">{b.name}</span>
            <span style={{ color: "var(--color-muted)" }}>{b.count}</span>
          </button>
        ))}
        {selected.length > 0 && (
          <button type="button" onClick={onClear} className="mt-1 rounded-lg px-2 py-1.5 text-left underline" style={{ fontSize: 12, color: "var(--color-accent)" }}>
            ล้างตัวกรอง (ทุกบอร์ด)
          </button>
        )}
      </div>
    </>
  );
}

// ───────────────────────── จัดกลุ่ม ─────────────────────────

function OverviewGroupBlock({ label, items, nowMs, onOpen }: { label: string; items: CrossBoardRowDto[]; nowMs: number; onOpen: (row: CrossBoardRowDto) => void }) {
  return (
    <>
      <tr data-testid="overview-group">
        <td colSpan={9} style={{ padding: "8px 10px", fontSize: 12, fontWeight: 700, background: "var(--color-surface-2)", borderBottom: "1px solid var(--color-line)" }}>
          {label} <span style={{ fontWeight: 400, color: "var(--color-muted)" }}>({items.length})</span>
        </td>
      </tr>
      {items.map((r) => (
        <OverviewRow key={r.id} row={r} nowMs={nowMs} onOpen={() => onOpen(r)} />
      ))}
    </>
  );
}

// ───────────────────────── แถวการ์ด 1 ใบ (อ่านอย่างเดียว) ─────────────────────────

function OverviewRow({ row, nowMs, onOpen }: { row: CrossBoardRowDto; nowMs: number; onOpen: () => void }) {
  const due = dueBadgeFrom(row.dueAt, row.completedAt, nowMs);
  return (
    <tr data-testid="overview-row" data-card-id={row.id} style={{ cursor: "pointer" }} onClick={onOpen}>
      <td style={cellStyle}>
        <span className="flex items-center gap-1.5">
          {row.cardNo && <span className="tabular-nums" style={{ color: "var(--color-muted)" }}>#{row.cardNo}</span>}
          {row.title}
          {row.isRecurring && (
            <span title="งานประจำ — เกิดซ้ำตามกำหนด" style={{ color: "var(--color-muted)" }}>
              <KanbanIcon name="repeat" size="xs" />
            </span>
          )}
        </span>
      </td>
      <td style={cellStyle}>
        <span data-testid="overview-row-board" className="inline-flex items-center font-semibold" style={{ gap: 5, color: tagColorVar(row.boardColor) }}>
          <span style={{ width: 8, height: 8, borderRadius: 2, background: tagColorVar(row.boardColor), display: "inline-block" }} />
          {row.boardName}
        </span>
      </td>
      <td style={cellStyle}>{row.columnName}</td>
      <td style={cellStyle}>
        <span className="flex items-center" style={{ height: 24 }}>
          {row.assignees.map((a, i) => (
            <span key={a.userId} style={{ marginLeft: i === 0 ? 0 : -6, boxShadow: "0 0 0 2px var(--color-surface)", borderRadius: 999 }}>
              <Avatar name={a.name} size={22} />
            </span>
          ))}
          {row.assignees.length === 0 && <span style={{ color: "var(--color-muted)" }}>—</span>}
        </span>
      </td>
      <td style={cellStyle}>
        {due ? (
          <span
            className="inline-flex items-center font-semibold"
            style={{ gap: 3, height: 21, padding: "0 6px", borderRadius: 5, fontSize: 11, color: DUE_STYLE[due.tone].color, border: `1px solid ${DUE_STYLE[due.tone].border}`, background: DUE_STYLE[due.tone].background }}
          >
            {due.text}
          </span>
        ) : (
          <span style={{ color: "var(--color-muted)" }}>—</span>
        )}
      </td>
      <td style={cellStyle}>
        {row.checklistTotal > 0 ? (
          <span className="inline-flex items-center gap-1" style={{ color: "var(--color-muted)" }}>
            <KanbanIcon name="cklist" size="xs" />
            {row.checklistDone}/{row.checklistTotal}
          </span>
        ) : (
          <span style={{ color: "var(--color-muted)" }}>—</span>
        )}
      </td>
      <td style={cellStyle}>
        <span className="flex flex-wrap items-center gap-1">
          {row.labels.map((l) => (
            <span
              key={l.id}
              className="inline-flex items-center font-semibold"
              style={{ height: 17, padding: "0 6px", borderRadius: 5, fontSize: 10.5, color: tagColorVar(l.color), border: `1px solid ${tagColorVar(l.color)}` }}
            >
              {l.name}
            </span>
          ))}
          {row.labels.length === 0 && <span style={{ color: "var(--color-muted)" }}>—</span>}
        </span>
      </td>
      <td style={cellStyle}>
        {row.links.length > 0 ? row.links.map((l) => <span key={l.label}>{l.label}</span>) : <span style={{ color: "var(--color-muted)" }}>—</span>}
      </td>
      <td style={cellStyle}>
        <span title={formatCardDateTime(row.updatedAt)} style={{ color: "var(--color-muted)" }}>
          {relativeThaiTime(row.updatedAt, nowMs)}
        </span>
      </td>
    </tr>
  );
}

// ───────────────────────── ชิปกำหนดส่ง (มือถือ) ─────────────────────────

function DueChip({ row, nowMs }: { row: CrossBoardRowDto; nowMs: number }) {
  const due = dueBadgeFrom(row.dueAt, row.completedAt, nowMs);
  if (!due) return null;
  return (
    <span
      className="inline-flex items-center font-semibold"
      style={{ gap: 3, height: 17, padding: "0 5px", borderRadius: 5, fontSize: 10, color: DUE_STYLE[due.tone].color, border: `1px solid ${DUE_STYLE[due.tone].border}`, background: DUE_STYLE[due.tone].background }}
    >
      {due.text}
    </span>
  );
}

// ───────────────────────── empty state (§5.7) ─────────────────────────

function EmptyState({ hasFilters, onClear }: { hasFilters: boolean; onClear: () => void }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3" style={{ color: "var(--color-muted)", minHeight: 240 }}>
      <KanbanIcon name={hasFilters ? "filter" : "grid"} size="lg" />
      <p style={{ fontSize: 13 }}>{hasFilters ? "ไม่มีการ์ดตรงกับตัวกรอง" : "ยังไม่มีการ์ดค้างในบอร์ดที่มองเห็น"}</p>
      {hasFilters && (
        <button type="button" onClick={onClear} className="underline" style={{ fontSize: 13, color: "var(--color-accent)" }}>
          ล้างตัวกรอง
        </button>
      )}
    </div>
  );
}

// ───────────────────────── มุมมองที่บันทึกไว้ (testid overview-saved-views) ─────────────────────────
// เหมือน `SavedViewsMenu.tsx` (K2.5) แต่ `boardId: null` (ข้ามบอร์ด) — แยกไฟล์ในคอมโพเนนต์นี้เพราะ
// `SavedViewsMenu.tsx` รับ `boardId: string` (บังคับ) ผูกกับหน้าบอร์ดใบเดียวโดยตรง ไม่รองรับ null

function currentOverviewConfigFromParams(searchParams: URLSearchParams): ViewConfig {
  const filters: NonNullable<ViewConfig["filters"]> = {};
  const assignee = searchParams.get("assignee");
  const label = searchParams.get("label");
  const due = searchParams.get("due");
  const status = searchParams.get("status");
  const q = searchParams.get("q");
  const column = searchParams.get("column");
  const board = searchParams.get("board");
  if (assignee) filters.assignee = assignee;
  if (label) filters.label = label;
  if (due === "overdue" || due === "today" || due === "week" || due === "none") filters.due = due;
  if (status === "done" || status === "open") filters.status = status;
  if (q) filters.q = q;
  if (column) filters.column = column;
  if (board) filters.board = board;
  const sort = searchParams.get("sort");
  const group = searchParams.get("group");
  return {
    view: "table",
    ...(Object.keys(filters).length > 0 ? { filters } : {}),
    ...(sort ? { sort } : {}),
    ...(group ? { group } : {}),
  };
}

function OverviewSavedViews({
  systemId,
  isOwner,
  viewerUserId,
  views,
  pathname,
  searchParams,
}: {
  systemId: string;
  isOwner: boolean;
  viewerUserId: string;
  views: SavedViewDto[];
  pathname: string;
  searchParams: URLSearchParams;
}) {
  const [open, setOpen] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rows, setRows] = useState(views);

  const teamViews = rows.filter((v) => v.scope === "BOARD");
  const privateViews = rows.filter((v) => v.scope === "PRIVATE");
  const activeId = searchParams.get("savedView");

  const removeView = async (viewId: string) => {
    setBusyId(viewId);
    const res = await deleteViewAction({ systemId, boardId: null, viewId });
    setBusyId(null);
    if (res.ok) setRows((prev) => prev.filter((v) => v.id !== viewId));
  };

  return (
    <span className="relative">
      <button type="button" data-testid="overview-saved-views" onClick={() => setOpen((o) => !o)} style={ghostBtn}>
        <KanbanIcon name="book" size="sm" />
        มุมมอง
      </button>
      {open && (
        <>
          <span className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div
            data-testid="overview-saved-views-list"
            className="absolute right-0 top-full z-50 mt-1 flex w-72 flex-col gap-1 rounded-xl p-2"
            style={{ background: "var(--color-surface)", border: "1px solid var(--color-line)", boxShadow: "0 14px 34px rgba(10,10,10,.12)", fontSize: 12.5 }}
          >
            {rows.length === 0 && (
              <p className="px-2 py-3" style={{ color: "var(--color-muted)", fontSize: 12 }}>
                ยังไม่มีมุมมองที่บันทึกไว้ — ตั้งตัวกรอง/จัดกลุ่มที่ต้องการแล้วกด &ldquo;บันทึกมุมมองนี้&rdquo; ด้านล่าง
              </p>
            )}
            {teamViews.length > 0 && (
              <div className="flex flex-col gap-0.5">
                <span className="px-2 pt-1" style={{ fontSize: 10.5, color: "var(--color-muted)", textTransform: "uppercase", letterSpacing: ".04em" }}>
                  ทั้งทีม
                </span>
                {teamViews.map((v) => (
                  <OverviewSavedViewRow key={v.id} view={v} active={v.id === activeId} pathname={pathname} onClose={() => setOpen(false)} canDelete={isOwner} busy={busyId === v.id} onDelete={() => removeView(v.id)} />
                ))}
              </div>
            )}
            {privateViews.length > 0 && (
              <div className="flex flex-col gap-0.5">
                <span className="px-2 pt-1" style={{ fontSize: 10.5, color: "var(--color-muted)", textTransform: "uppercase", letterSpacing: ".04em" }}>
                  ส่วนตัว
                </span>
                {privateViews.map((v) => (
                  <OverviewSavedViewRow
                    key={v.id}
                    view={v}
                    active={v.id === activeId}
                    pathname={pathname}
                    onClose={() => setOpen(false)}
                    canDelete={v.ownerUserId === viewerUserId}
                    busy={busyId === v.id}
                    onDelete={() => removeView(v.id)}
                  />
                ))}
              </div>
            )}
            <button
              type="button"
              data-testid="overview-save-view-open"
              onClick={() => {
                setOpen(false);
                setSaveOpen(true);
              }}
              className="mt-1 flex items-center gap-1.5 rounded-lg px-2 py-2 text-left"
              style={{ borderTop: "1px solid var(--color-line)", color: "var(--color-accent)", fontWeight: 600 }}
            >
              <KanbanIcon name="plus" size="xs" />
              บันทึกมุมมองนี้
            </button>
          </div>
        </>
      )}
      {saveOpen && (
        <OverviewSaveViewModal
          systemId={systemId}
          isOwner={isOwner}
          config={currentOverviewConfigFromParams(searchParams)}
          onClose={() => setSaveOpen(false)}
          onSaved={(view) => setRows((prev) => [...prev, view])}
        />
      )}
    </span>
  );
}

function OverviewSavedViewRow({
  view,
  active,
  pathname,
  canDelete,
  busy,
  onClose,
  onDelete,
}: {
  view: SavedViewDto;
  active: boolean;
  pathname: string;
  canDelete: boolean;
  busy: boolean;
  onClose: () => void;
  onDelete: () => void;
}) {
  return (
    <span className="flex items-center gap-1">
      <a
        href={hrefForSavedView(pathname, view.id, view.config)}
        data-testid="overview-saved-view-item"
        onClick={onClose}
        className="flex min-w-0 flex-1 flex-col rounded-lg px-2 py-1.5"
        style={{ background: active ? "var(--color-surface-2)" : "transparent" }}
      >
        <span className="truncate" style={{ fontWeight: active ? 700 : 500, color: "var(--color-ink)" }}>
          {view.name}
        </span>
        <span className="truncate" style={{ fontSize: 11, color: "var(--color-muted)" }}>
          {describeSavedViewConfig(view.config)}
        </span>
      </a>
      {canDelete && (
        <button
          type="button"
          aria-label={`ลบมุมมอง ${view.name}`}
          title="ลบมุมมองนี้"
          disabled={busy}
          onClick={onDelete}
          className="grid shrink-0 place-items-center"
          style={{ width: 24, height: 24, borderRadius: 6, color: "var(--color-muted)" }}
        >
          <KanbanIcon name="trash" size="xs" />
        </button>
      )}
    </span>
  );
}

function OverviewSaveViewModal({
  systemId,
  isOwner,
  config,
  onClose,
  onSaved,
}: {
  systemId: string;
  isOwner: boolean;
  config: ViewConfig;
  onClose: () => void;
  onSaved: (view: SavedViewDto) => void;
}) {
  const [name, setName] = useState("");
  const [scope, setScope] = useState<"PRIVATE" | "BOARD">("PRIVATE");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("ต้องตั้งชื่อมุมมองก่อนจึงบันทึกได้");
      return;
    }
    setBusy(true);
    setError(null);
    const res = await saveViewAction({ systemId, boardId: null, name: trimmed, scope, config });
    setBusy(false);
    if (!res.ok) {
      setError(res.message);
      return;
    }
    onSaved(res.view);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center" style={{ background: "rgba(10,10,10,.35)" }}>
      <span className="fixed inset-0" onClick={onClose} aria-hidden />
      <div
        data-testid="overview-save-view-modal"
        role="dialog"
        aria-modal="true"
        aria-label="บันทึกมุมมองนี้"
        className="relative flex w-full max-w-[380px] flex-col gap-3 rounded-xl p-5"
        style={{ background: "var(--color-surface)", border: "1px solid var(--color-line)", boxShadow: "0 24px 60px rgba(10,10,10,.28)" }}
      >
        <h2 style={{ fontSize: 15, fontWeight: 700 }}>บันทึกมุมมองนี้</h2>
        <p style={{ fontSize: 12, color: "var(--color-muted)" }}>
          บันทึกตัวกรอง + บอร์ดที่เลือก + การจัดกลุ่ม/เรียงข้ามบอร์ดที่ตั้งอยู่ตอนนี้ ไว้เรียกกลับมาใช้ทีหลัง
        </p>
        <label className="flex flex-col gap-1" style={{ fontSize: 12.5 }}>
          ชื่อมุมมอง
          <input
            autoFocus
            data-testid="overview-save-view-name-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="input"
            aria-invalid={error ? "true" : undefined}
            placeholder="เช่น งานด่วนทั้งองค์กร"
          />
        </label>
        {isOwner && (
          <div className="flex flex-col gap-1.5" style={{ fontSize: 12.5 }}>
            <span>มองเห็นได้โดย</span>
            <div className="flex" style={{ gap: 6 }}>
              <ScopeChip testId="overview-save-view-scope-private" active={scope === "PRIVATE"} label="เฉพาะฉัน" onClick={() => setScope("PRIVATE")} />
              <ScopeChip testId="overview-save-view-scope-board" active={scope === "BOARD"} label="ทั้งทีม" onClick={() => setScope("BOARD")} />
            </div>
          </div>
        )}
        {error && (
          <p data-testid="overview-save-view-error" style={{ fontSize: 12, color: "var(--color-danger)" }}>
            {error}
          </p>
        )}
        <div className="mt-1 flex justify-end gap-2">
          <button type="button" className="btn btn-ghost text-sm" onClick={onClose} disabled={busy}>
            ยกเลิก
          </button>
          <button type="button" data-testid="overview-save-view-submit" className="btn btn-primary text-sm" onClick={submit} disabled={busy}>
            {busy ? "กำลังบันทึก…" : "บันทึกมุมมองนี้"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ScopeChip({ active, label, onClick, testId }: { active: boolean; label: string; onClick: () => void; testId?: string }) {
  return (
    <button
      type="button"
      data-testid={testId}
      onClick={onClick}
      className="inline-flex items-center"
      style={{
        height: 26,
        padding: "0 10px",
        borderRadius: 999,
        fontSize: 12,
        fontWeight: active ? 700 : 400,
        border: `1px solid ${active ? "var(--color-accent)" : "var(--color-line)"}`,
        background: active ? "var(--color-out)" : "var(--color-surface)",
        color: active ? "var(--color-accent)" : "var(--color-ink-soft)",
      }}
    >
      {label}
    </button>
  );
}

export default OverviewPage;
