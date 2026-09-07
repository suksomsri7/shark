// TableView.tsx — มุมมองตาราง `?view=table` (K2.1 · แบบ `ledger/design-kanban/04-table.png` · §3.4)
//
// หน้าที่: แก้งานหลายใบเร็ว ๆ แบบสเปรดชีต — แก้ในช่อง (คอลัมน์/ผู้รับผิดชอบ/กำหนดส่ง/ป้าย/ชื่อ) ·
// เลือกหลายรายการแล้วทำทีเดียว (`cards.bulkUpdate`) · จัดกลุ่ม · ส่งออก CSV
//
// ⚠️ ห้ามใช้อีโมจิ — ไอคอนทุกตัวมาจาก <KanbanIcon> · ห้ามใช้ตัวแปลงวันที่ของเบราว์เซอร์/Intl (บทเรียน K1.5: hydration)
// ⚠️ ห้ามใช้กล่องเตือนของเบราว์เซอร์ — "เก็บเข้าคลัง" ยืนยันแบบ inline สองขั้น (แบบเดียวกับทั้งโมดูล)
"use client";

import { useEffect, useState, useSyncExternalStore, useTransition } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { BoardHeader } from "./BoardHeader";
import { FilterBar } from "./FilterBar";
import { KanbanIcon } from "./KanbanIcon";
import { Avatar, dueBadgeFrom, DUE_STYLE, formatCardDateTime, tagColorVar } from "./Card";
import { ThaiDatePicker } from "./ThaiDatePicker";
import { relativeThaiTime } from "@/lib/modules/kanban/activity-text";
import {
  bulkUpdateAction,
  createCardAction,
  exportBoardCsvAction,
  moveCardAction,
  renameBoardAction,
  setCardAssigneesAction,
  setCardLabelsAction,
  starBoardAction,
  updateCardFieldsAction,
  type BulkUpdateActionPatch,
} from "@/lib/modules/kanban/actions";
import type { BoardFilters } from "@/lib/modules/kanban/filters";
import type {
  BoardLabelDto,
  BoardPersonDto,
  BoardViewDto,
  SavedViewDto,
  TableGroupBy,
  TableGroupDto,
  TableRowDto,
  TableSort,
} from "@/lib/modules/kanban/types";

export type TableViewData = {
  rows: TableRowDto[];
  total: number;
  page: number;
  pageSize: number;
  groups?: TableGroupDto[];
  /** K2.6: ชื่อฟิลด์กำหนดเองที่ `showOnCard=true` ของบอร์ด เรียงตาม sortOrder — 1 คอลัมน์ตารางต่อชื่อ */
  customFieldColumns: string[];
};

// ── < 640px = มือถือ — `useSyncExternalStore` กัน hydration mismatch (แบบเดียวกับ K1.13 `BoardView.tsx`) ──
const MOBILE_QUERY = "(max-width: 639px)";
function subscribeMobileQuery(onChange: () => void): () => void {
  const mql = window.matchMedia(MOBILE_QUERY);
  mql.addEventListener("change", onChange);
  return () => mql.removeEventListener("change", onChange);
}
const getMobileSnapshot = () => window.matchMedia(MOBILE_QUERY).matches;
const getMobileServerSnapshot = () => false;
function useIsMobileTable(): boolean {
  return useSyncExternalStore(subscribeMobileQuery, getMobileSnapshot, getMobileServerSnapshot);
}

const GROUP_OPTIONS: { value: TableGroupBy | ""; label: string }[] = [
  { value: "", label: "ไม่จัดกลุ่ม" },
  { value: "column", label: "คอลัมน์" },
  { value: "assignee", label: "ผู้รับผิดชอบ" },
  { value: "label", label: "ป้ายกำกับ" },
];

const SORT_OPTIONS: { value: TableSort; label: string }[] = [
  { value: "position", label: "ลำดับบนบอร์ด" },
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

export function TableView({
  board,
  table,
  filters,
  group,
  sort,
  page,
  savedViews = [],
}: {
  board: BoardViewDto;
  table: TableViewData;
  filters: BoardFilters;
  group?: TableGroupBy;
  sort?: TableSort;
  page: number;
  /** K2.5 — มุมมองที่บันทึกไว้ของบอร์ดนี้ (ทั้งทีม + ของตัวเอง) ส่งลง `BoardHeader` */
  savedViews?: SavedViewDto[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const systemId = board.systemId;
  const nowMs = Date.parse(board.now);
  const isMobile = useIsMobileTable();
  const [, startTransition] = useTransition();

  const [rows, setRows] = useState<TableRowDto[]>(table.rows);
  const [boardName, setBoardName] = useState(board.name);
  const [starred, setStarred] = useState(board.starred);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<string | null>(null);
  const [q, setQ] = useState(filters.q ?? "");
  const [archiveConfirm, setArchiveConfirm] = useState(false);
  const [bulkOpen, setBulkOpen] = useState<"column" | "assignee" | "label" | "due" | null>(null);
  const [addingIn, setAddingIn] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState("");

  // อ่านผลจาก server ใหม่ทุกครั้งที่ navigate (filters/group/sort/page เปลี่ยน) — ไม่งั้น state เก่าค้าง
  useEffect(() => {
    setRows(table.rows);
    setSelected(new Set());
  }, [table]);

  const showToast = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast((t) => (t === message ? null : t)), 4200);
  };

  const setParam = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === "") next.delete(k);
      else next.set(k, v);
    }
    router.push(`${pathname}?${next.toString()}`, { scroll: false });
  };

  const columns = board.columns.map((c) => ({ id: c.id, name: c.name }));
  const firstColumnId = columns[0]?.id ?? null;
  const customFieldColumns = table.customFieldColumns;
  const baseColSpan = 9 + customFieldColumns.length;

  const patchRow = (id: string, patch: Partial<TableRowDto>) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  };

  // ───────────────────────── แก้ในช่อง (แถวเดียว) ─────────────────────────

  const editTitle = (row: TableRowDto, title: string) => {
    const before = row.title;
    patchRow(row.id, { title });
    startTransition(async () => {
      const res = await updateCardFieldsAction({ systemId, boardId: board.id, cardId: row.id, title });
      if (!res.ok) {
        patchRow(row.id, { title: before });
        showToast(res.message);
      }
    });
  };

  const editColumn = (row: TableRowDto, toColumnId: string) => {
    const before = { columnId: row.columnId, columnName: row.columnName };
    const name = columns.find((c) => c.id === toColumnId)?.name ?? row.columnName;
    patchRow(row.id, { columnId: toColumnId, columnName: name });
    startTransition(async () => {
      const res = await moveCardAction({ systemId, boardId: board.id, cardId: row.id, toColumnId });
      if (!res.ok) {
        patchRow(row.id, before);
        showToast(res.message);
      }
    });
  };

  const editDue = (row: TableRowDto, dueAt: string | null) => {
    const before = row.dueAt;
    patchRow(row.id, { dueAt });
    startTransition(async () => {
      const res = await updateCardFieldsAction({ systemId, boardId: board.id, cardId: row.id, dueAt });
      if (!res.ok) {
        patchRow(row.id, { dueAt: before });
        showToast(res.message);
      }
    });
  };

  const toggleAssignee = (row: TableRowDto, person: BoardPersonDto) => {
    const has = row.assignees.some((a) => a.userId === person.userId);
    const next = has ? row.assignees.filter((a) => a.userId !== person.userId) : [...row.assignees, person];
    patchRow(row.id, { assignees: next });
    startTransition(async () => {
      const res = await setCardAssigneesAction({ systemId, boardId: board.id, cardId: row.id, userIds: next.map((a) => a.userId) });
      if (!res.ok) {
        patchRow(row.id, { assignees: row.assignees });
        showToast(res.message);
      }
    });
  };

  const toggleLabel = (row: TableRowDto, label: BoardLabelDto) => {
    const has = row.labels.some((l) => l.id === label.id);
    const next = has ? row.labels.filter((l) => l.id !== label.id) : [...row.labels, label];
    patchRow(row.id, { labels: next });
    startTransition(async () => {
      const res = await setCardLabelsAction({ systemId, boardId: board.id, cardId: row.id, labelIds: next.map((l) => l.id) });
      if (!res.ok) {
        patchRow(row.id, { labels: row.labels });
        showToast(res.message);
      }
    });
  };

  // ───────────────────────── เลือกหลายรายการ ─────────────────────────

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const runBulk = (patch: BulkUpdateActionPatch, doneMessage: string) => {
    const ids = [...selected];
    setBulkOpen(null);
    startTransition(async () => {
      const res = await bulkUpdateAction({ systemId, boardId: board.id, cardIds: ids, patch });
      if (!res.ok) {
        showToast(res.message);
        return;
      }
      showToast(res.skipped.length > 0 ? `${doneMessage} · ข้าม ${res.skipped.length} ใบ` : doneMessage);
      setSelected(new Set());
      router.refresh();
    });
  };

  const confirmArchiveSelected = () => {
    setArchiveConfirm(false);
    runBulk({ archive: true }, `เก็บเข้าคลัง ${selected.size} การ์ดแล้ว`);
  };

  // ───────────────────────── เพิ่มการ์ด / ส่งออก CSV ─────────────────────────

  const submitNewCard = (columnId: string) => {
    const title = newTitle.trim();
    if (!title) {
      setAddingIn(null);
      return;
    }
    setAddingIn(null);
    setNewTitle("");
    startTransition(async () => {
      const res = await createCardAction({ systemId, boardId: board.id, columnId, title });
      if (!res.ok) showToast(res.message);
      else router.refresh();
    });
  };

  const exportCsv = () => {
    startTransition(async () => {
      const res = await exportBoardCsvAction({ systemId, boardId: board.id, filters });
      if (!res.ok) {
        showToast(res.message);
        return;
      }
      const blob = new Blob([res.csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${board.name.replace(/[\\/:*?"<>|]/g, "_")}-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    });
  };

  const totalCardCount = board.columns.reduce((n, c) => n + c.cards.length, 0);

  // ───────────────────────── มือถือ: รายการ 2 บรรทัด ไม่มีแก้ในช่อง ─────────────────────────

  if (isMobile) {
    return (
      <div className="flex flex-col" style={{ height: "calc(100dvh - 3.5rem)", background: "var(--color-stage)" }}>
        <BoardHeader
          board={{ ...board, name: boardName }}
          starred={starred}
          filters={filters}
          savedViews={savedViews}
          onToggleStar={() => toggleStar(starred, setStarred, systemId, board.id, showToast)}
          onRename={(name) => renameBoard(name, boardName, setBoardName, systemId, board.id, showToast)}
        />
        <FilterBar filters={filters} totalCount={totalCardCount} visibleCount={table.total} members={board.members} columns={board.columns} />
        <div className="flex-1 overflow-y-auto">
          {rows.length === 0 ? (
            <EmptyState hasFilters={Boolean(filters.q || filters.assignee || filters.label || filters.due || filters.status || filters.column)} onClear={() => router.push(pathname)} />
          ) : (
            rows.map((r) => (
              <button
                key={r.id}
                type="button"
                data-testid="table-row"
                onClick={() => router.push(`${pathname}?card=${r.id}`)}
                className="flex w-full flex-col gap-1 border-b text-left"
                style={{ padding: "10px 14px", borderColor: "var(--color-line)" }}
              >
                <span className="flex items-center gap-2" style={{ fontSize: 13, fontWeight: 500 }}>
                  {r.cardNo && <span style={{ color: "var(--color-muted)", fontWeight: 400 }}>#{r.cardNo}</span>}
                  {r.title}
                </span>
                <span className="flex items-center gap-2" style={{ fontSize: 11.5, color: "var(--color-muted)" }}>
                  {r.columnName}
                  <DueChip row={r} nowMs={nowMs} />
                  {r.assignees.slice(0, 2).map((a) => (
                    <Avatar key={a.userId} name={a.name} size={18} />
                  ))}
                </span>
              </button>
            ))
          )}
        </div>
      </div>
    );
  }

  // ───────────────────────── เดสก์ท็อป ─────────────────────────

  const groupOf = table.groups
    ? table.groups.map((g) => ({ ...g, items: g.rowIds.map((id) => rows.find((r) => r.id === id)).filter((r): r is TableRowDto => !!r) }))
    : null;

  return (
    <div className="flex flex-col" style={{ height: "calc(100dvh - 3.5rem)", background: "var(--color-stage)" }}>
      <BoardHeader
        board={{ ...board, name: boardName }}
        starred={starred}
        filters={filters}
        savedViews={savedViews}
        onToggleStar={() => toggleStar(starred, setStarred, systemId, board.id, showToast)}
        onRename={(name) => renameBoard(name, boardName, setBoardName, systemId, board.id, showToast)}
      />
      <FilterBar filters={filters} totalCount={totalCardCount} visibleCount={table.total} members={board.members} columns={board.columns} />

      {/* ── แถบเครื่องมือ: ค้นในบอร์ดนี้ · จัดกลุ่ม · เรียง · ส่งออก CSV · เพิ่มการ์ด ── */}
      <div className="flex flex-none flex-wrap items-center" style={{ gap: 8, padding: "9px 20px", borderBottom: "1px solid var(--color-line)" }}>
        <span className="relative flex items-center" style={{ minWidth: 220 }}>
          <KanbanIcon name="search" size="sm" className="absolute" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") setParam({ q: q.trim() || null });
            }}
            onBlur={() => setParam({ q: q.trim() || null })}
            placeholder="ค้นในบอร์ดนี้…"
            aria-label="ค้นในบอร์ดนี้"
            className="w-full rounded-lg border"
            style={{ height: 30, padding: "0 10px 0 28px", fontSize: 12.5, borderColor: "var(--color-line)" }}
          />
        </span>

        <label className="flex items-center gap-1.5" style={{ fontSize: 12.5, color: "var(--color-muted)" }}>
          จัดกลุ่ม:
          <select
            value={group ?? ""}
            onChange={(e) => setParam({ group: e.target.value || null })}
            style={{ ...ghostBtn, appearance: "auto" }}
          >
            {GROUP_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>

        <label className="flex items-center gap-1.5" style={{ fontSize: 12.5, color: "var(--color-muted)" }}>
          เรียง:
          <select value={sort ?? "position"} onChange={(e) => setParam({ sort: e.target.value })} style={{ ...ghostBtn, appearance: "auto" }}>
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>

        <span className="flex-1" />

        <button type="button" onClick={exportCsv} style={ghostBtn}>
          <KanbanIcon name="out" size="sm" />
          ส่งออก CSV
        </button>
        {firstColumnId && (
          <button type="button" onClick={() => setAddingIn(firstColumnId)} style={ghostBtn}>
            <KanbanIcon name="plus" size="sm" />
            เพิ่มการ์ด
          </button>
        )}
      </div>

      {/* ── แถบเลือกหลายรายการ — แถบฟ้าบนตาราง (ledger/design-kanban/04-table.png) ไม่ใช่ pill ลอยล่างจอ ── */}
      {selected.size > 0 && (
        <div
          data-testid="bulk-bar"
          className="flex flex-none flex-wrap items-center justify-between gap-2"
          style={{
            padding: "8px 20px",
            background: "color-mix(in srgb, var(--color-accent) 12%, var(--color-surface))",
            borderBottom: "1px solid var(--color-accent)",
            color: "var(--color-accent)",
            fontSize: 12.5,
          }}
        >
          <span className="flex items-center gap-2 font-semibold">
            <KanbanIcon name="check" size="sm" />
            เลือก {selected.size} การ์ด
          </span>

          <span className="flex flex-wrap items-center gap-3">
            <span className="relative">
              <button type="button" onClick={() => setBulkOpen((o) => (o === "column" ? null : "column"))} className="underline-offset-2 hover:underline">
                ย้ายไปคอลัมน์
              </button>
              {bulkOpen === "column" && (
                <MiniPopover onClose={() => setBulkOpen(null)}>
                  {columns.map((c) => (
                    <MiniPopoverRow key={c.id} onClick={() => runBulk({ toColumnId: c.id }, `ย้าย ${selected.size} การ์ดไปคอลัมน์ "${c.name}" แล้ว`)}>
                      {c.name}
                    </MiniPopoverRow>
                  ))}
                </MiniPopover>
              )}
            </span>

            <span className="relative">
              <button type="button" onClick={() => setBulkOpen((o) => (o === "assignee" ? null : "assignee"))} className="underline-offset-2 hover:underline">
                มอบหมาย
              </button>
              {bulkOpen === "assignee" && (
                <MiniPopover onClose={() => setBulkOpen(null)}>
                  {board.members.length === 0 && <span className="px-2 py-1" style={{ opacity: 0.7 }}>บอร์ดนี้ยังไม่มีสมาชิก</span>}
                  {board.members.map((m) => (
                    <MiniPopoverRow key={m.userId} onClick={() => runBulk({ addAssigneeUserIds: [m.userId] }, `มอบหมาย ${selected.size} การ์ดให้ ${m.name} แล้ว`)}>
                      <Avatar name={m.name} size={18} /> {m.name}
                    </MiniPopoverRow>
                  ))}
                </MiniPopover>
              )}
            </span>

            <span className="relative">
              <button type="button" onClick={() => setBulkOpen((o) => (o === "label" ? null : "label"))} className="underline-offset-2 hover:underline">
                ติดป้าย
              </button>
              {bulkOpen === "label" && (
                <MiniPopover onClose={() => setBulkOpen(null)}>
                  {board.labels.length === 0 && <span className="px-2 py-1" style={{ opacity: 0.7 }}>บอร์ดนี้ยังไม่มีป้ายกำกับ</span>}
                  {board.labels.map((l) => (
                    <MiniPopoverRow key={l.id} onClick={() => runBulk({ addLabelIds: [l.id] }, `ติดป้าย "${l.name}" ให้ ${selected.size} การ์ดแล้ว`)}>
                      <span style={{ width: 10, height: 10, borderRadius: 3, background: tagColorVar(l.color), display: "inline-block" }} /> {l.name}
                    </MiniPopoverRow>
                  ))}
                </MiniPopover>
              )}
            </span>

            <span className="relative">
              <button type="button" onClick={() => setBulkOpen((o) => (o === "due" ? null : "due"))} className="underline-offset-2 hover:underline">
                ตั้งกำหนดส่ง
              </button>
              {bulkOpen === "due" && (
                <div className="absolute left-0 top-full z-50 mt-1 rounded-xl p-2" style={{ background: "var(--color-surface)", border: "1px solid var(--color-line)", boxShadow: "0 14px 34px rgba(10,10,10,.14)", color: "var(--color-ink)" }}>
                  <ThaiDatePicker
                    value={null}
                    onChange={(dueAt) => runBulk({ dueAt }, `ตั้งกำหนดส่ง ${selected.size} การ์ดแล้ว`)}
                    editable
                    withTime
                    open
                    onOpenChange={(o) => !o && setBulkOpen(null)}
                    nowMs={nowMs}
                    ariaLabel="ตั้งกำหนดส่งหลายการ์ด"
                    chipTestId="bulk-due-chip"
                    pickerTestId="bulk-due-picker"
                  />
                </div>
              )}
            </span>

            {archiveConfirm ? (
              <span className="flex items-center gap-1.5">
                ยืนยันเก็บ {selected.size} การ์ดเข้าคลัง?
                <button type="button" onClick={confirmArchiveSelected} className="font-semibold underline">
                  ยืนยัน
                </button>
                <button type="button" onClick={() => setArchiveConfirm(false)} className="underline" style={{ opacity: 0.8 }}>
                  ยกเลิก
                </button>
              </span>
            ) : (
              <button type="button" onClick={() => setArchiveConfirm(true)} className="flex items-center gap-1 underline-offset-2 hover:underline">
                <KanbanIcon name="box" size="xs" /> เก็บเข้าคลัง
              </button>
            )}

            <button type="button" aria-label="ล้างการเลือก" onClick={() => setSelected(new Set())} style={{ opacity: 0.75 }}>
              <KanbanIcon name="x" size="xs" />
            </button>
          </span>
        </div>
      )}

      <div data-testid="table-view" className="flex-1 overflow-auto">
        {rows.length === 0 ? (
          <EmptyState hasFilters={Boolean(filters.q || filters.assignee || filters.label || filters.due || filters.status || filters.column)} onClear={() => router.push(pathname)} />
        ) : (
          <table className="w-full border-collapse" style={{ fontSize: 12.5 }}>
            <thead>
              <tr style={{ background: "var(--color-surface-2)", textAlign: "left" }}>
                <th style={{ ...cellStyle, width: 32 }} />
                <th style={cellStyle}>การ์ด</th>
                <th style={cellStyle}>คอลัมน์</th>
                <th style={cellStyle}>ผู้รับผิดชอบ</th>
                <th style={cellStyle}>กำหนดส่ง</th>
                <th style={cellStyle}>เช็คลิสต์</th>
                <th style={cellStyle}>ป้ายกำกับ</th>
                {customFieldColumns.map((name) => (
                  <th key={name} data-testid="table-custom-field-column" style={cellStyle}>
                    {name}
                  </th>
                ))}
                <th style={cellStyle}>เชื่อมระบบ</th>
                <th style={cellStyle}>แก้ไขล่าสุด</th>
              </tr>
            </thead>
            <tbody>
              {groupOf
                ? groupOf.map((g) => (
                    <TableGroupBlock
                      key={g.key}
                      group={g}
                      board={board}
                      selected={selected}
                      onToggleSelect={toggleSelect}
                      nowMs={nowMs}
                      columns={columns}
                      customFieldColumns={customFieldColumns}
                      colSpan={baseColSpan}
                      onEditTitle={editTitle}
                      onEditColumn={editColumn}
                      onEditDue={editDue}
                      onToggleAssignee={toggleAssignee}
                      onToggleLabel={toggleLabel}
                      addingIn={addingIn}
                      newTitle={newTitle}
                      setNewTitle={setNewTitle}
                      onSubmitNewCard={submitNewCard}
                      onOpenAdd={setAddingIn}
                    />
                  ))
                : (
                  <>
                    {rows.map((r) => (
                      <TableRowView
                        key={r.id}
                        row={r}
                        board={board}
                        selected={selected.has(r.id)}
                        onToggleSelect={() => toggleSelect(r.id)}
                        nowMs={nowMs}
                        columns={columns}
                        customFieldColumns={customFieldColumns}
                        onEditTitle={(t) => editTitle(r, t)}
                        onEditColumn={(c) => editColumn(r, c)}
                        onEditDue={(d) => editDue(r, d)}
                        onToggleAssignee={(p) => toggleAssignee(r, p)}
                        onToggleLabel={(l) => toggleLabel(r, l)}
                      />
                    ))}
                    {firstColumnId && (
                      <AddCardRow
                        columnId={firstColumnId}
                        columnName={columns[0]?.name ?? ""}
                        adding={addingIn === firstColumnId}
                        title={newTitle}
                        setTitle={setNewTitle}
                        colSpan={baseColSpan}
                        onOpen={() => setAddingIn(firstColumnId)}
                        onSubmit={() => submitNewCard(firstColumnId)}
                      />
                    )}
                  </>
                )}
            </tbody>
          </table>
        )}
      </div>

      {/* ── ท้ายตาราง: จำนวน + คำอธิบาย + แบ่งหน้า (ปิดเมื่อจัดกลุ่ม — กลุ่มโชว์ครบทุกใบอยู่แล้ว) ── */}
      <div className="flex flex-none items-center" style={{ gap: 10, padding: "9px 20px", borderTop: "1px solid var(--color-line)", fontSize: 12, color: "var(--color-muted)" }}>
        <span>
          แสดง {rows.length} จาก {table.total} การ์ด · แก้ค่าในช่องได้ทันที (คลิกที่ช่อง)
        </span>
        {!group && table.total > table.pageSize && (
          <span className="ml-auto flex items-center gap-2">
            <button type="button" disabled={page <= 1} onClick={() => setParam({ page: String(page - 1) })} style={{ ...ghostBtn, opacity: page <= 1 ? 0.4 : 1 }}>
              ก่อนหน้า
            </button>
            <span>หน้า {page}</span>
            <button
              type="button"
              disabled={page * table.pageSize >= table.total}
              onClick={() => setParam({ page: String(page + 1) })}
              style={{ ...ghostBtn, opacity: page * table.pageSize >= table.total ? 0.4 : 1 }}
            >
              ถัดไป
            </button>
          </span>
        )}
      </div>

      {toast && (
        <div className="pointer-events-none fixed inset-x-0 bottom-20 z-[70] flex justify-center px-4">
          <div
            role="status"
            data-testid="table-toast"
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

// ───────────────────────── ตัวช่วยระดับบน (star/rename) ─────────────────────────
// เดินเรื่องเดียวกับ `BoardView.tsx` (optimistic + revert เมื่อ server ปฏิเสธ) — แยกฟังก์ชันไว้กันโค้ดซ้ำ

function toggleStar(
  starred: boolean,
  setStarred: (v: boolean) => void,
  systemId: string,
  boardId: string,
  showToast: (m: string) => void,
) {
  const next = !starred;
  setStarred(next);
  starBoardAction({ systemId, boardId, starred: next }).catch(() => {
    setStarred(!next);
    showToast("บันทึกดาวไม่สำเร็จ ลองใหม่อีกครั้ง");
  });
}

function renameBoard(
  name: string,
  before: string,
  setBoardName: (v: string) => void,
  systemId: string,
  boardId: string,
  showToast: (m: string) => void,
) {
  setBoardName(name);
  renameBoardAction({ systemId, boardId, name }).catch(() => {
    setBoardName(before);
    showToast("เปลี่ยนชื่อบอร์ดไม่สำเร็จ ลองใหม่อีกครั้ง");
  });
}

// ───────────────────────── ชิปกำหนดส่ง (มือถือ — อ่านอย่างเดียว) ─────────────────────────

function DueChip({ row, nowMs }: { row: TableRowDto; nowMs: number }) {
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

// ───────────────────────── กลุ่ม (จัดกลุ่ม: คอลัมน์/ผู้รับผิดชอบ/ป้าย) ─────────────────────────

type GroupWithItems = TableGroupDto & { items: TableRowDto[] };

function TableGroupBlock({
  group,
  board,
  selected,
  onToggleSelect,
  nowMs,
  columns,
  customFieldColumns,
  colSpan,
  onEditTitle,
  onEditColumn,
  onEditDue,
  onToggleAssignee,
  onToggleLabel,
  addingIn,
  newTitle,
  setNewTitle,
  onSubmitNewCard,
  onOpenAdd,
}: {
  group: GroupWithItems;
  board: BoardViewDto;
  selected: Set<string>;
  onToggleSelect: (id: string) => void;
  nowMs: number;
  columns: { id: string; name: string }[];
  /** K2.6: ชื่อคอลัมน์ฟิลด์กำหนดเอง (เรียง sortOrder) — ส่งต่อให้ `TableRowView` เรนเดอร์ค่าให้ตรงคอลัมน์ */
  customFieldColumns: string[];
  /** K2.6: จำนวนคอลัมน์ทั้งหมดของตาราง (9 คงที่ + ฟิลด์กำหนดเอง) — ใช้กับ `colSpan` ของแถวหัวกลุ่ม/เพิ่มการ์ด */
  colSpan: number;
  onEditTitle: (row: TableRowDto, title: string) => void;
  onEditColumn: (row: TableRowDto, columnId: string) => void;
  onEditDue: (row: TableRowDto, dueAt: string | null) => void;
  onToggleAssignee: (row: TableRowDto, person: BoardPersonDto) => void;
  onToggleLabel: (row: TableRowDto, label: BoardLabelDto) => void;
  addingIn: string | null;
  newTitle: string;
  setNewTitle: (v: string) => void;
  onSubmitNewCard: (columnId: string) => void;
  onOpenAdd: (columnId: string) => void;
}) {
  // การ์ดในกลุ่มนี้ (ถ้าจัดกลุ่มตามคอลัมน์ — "เพิ่มการ์ดใหม่ในคอลัมน์ X" ต่อท้ายกลุ่มนั้นเลยด้วย group.key เป็น columnId)
  const addTargetColumnId = columns.some((c) => c.id === group.key) ? group.key : null;
  return (
    <>
      <tr data-testid="table-group">
        <td colSpan={colSpan} style={{ padding: "8px 10px", fontSize: 12, fontWeight: 700, background: "var(--color-surface-2)", borderBottom: "1px solid var(--color-line)" }}>
          {group.label} <span style={{ fontWeight: 400, color: "var(--color-muted)" }}>({group.items.length})</span>
        </td>
      </tr>
      {group.items.map((r) => (
        <TableRowView
          key={r.id}
          row={r}
          board={board}
          selected={selected.has(r.id)}
          onToggleSelect={() => onToggleSelect(r.id)}
          nowMs={nowMs}
          columns={columns}
          customFieldColumns={customFieldColumns}
          onEditTitle={(t) => onEditTitle(r, t)}
          onEditColumn={(c) => onEditColumn(r, c)}
          onEditDue={(d) => onEditDue(r, d)}
          onToggleAssignee={(p) => onToggleAssignee(r, p)}
          onToggleLabel={(l) => onToggleLabel(r, l)}
        />
      ))}
      {addTargetColumnId && (
        <AddCardRow
          columnId={addTargetColumnId}
          columnName={group.label}
          adding={addingIn === addTargetColumnId}
          title={newTitle}
          setTitle={setNewTitle}
          colSpan={colSpan}
          onOpen={() => onOpenAdd(addTargetColumnId)}
          onSubmit={() => onSubmitNewCard(addTargetColumnId)}
        />
      )}
    </>
  );
}

// ───────────────────────── แถวเพิ่มการ์ดใหม่ ─────────────────────────

function AddCardRow({
  columnId,
  columnName,
  adding,
  title,
  setTitle,
  colSpan,
  onOpen,
  onSubmit,
}: {
  columnId: string;
  columnName: string;
  adding: boolean;
  title: string;
  setTitle: (v: string) => void;
  /** K2.6: 9 คงที่ + จำนวนคอลัมน์ฟิลด์กำหนดเอง */
  colSpan: number;
  onOpen: () => void;
  onSubmit: () => void;
}) {
  if (adding) {
    return (
      <tr>
        <td colSpan={colSpan} style={{ ...cellStyle, background: "var(--color-surface)" }}>
          <input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onSubmit();
              if (e.key === "Escape") onSubmit();
            }}
            onBlur={onSubmit}
            placeholder={`ชื่องานใหม่ในคอลัมน์ ${columnName}…`}
            className="w-full rounded border px-2 py-1"
            style={{ borderColor: "var(--color-line)", fontSize: 12.5 }}
          />
        </td>
      </tr>
    );
  }
  return (
    <tr>
      <td colSpan={colSpan} style={{ ...cellStyle, color: "var(--color-muted)" }}>
        <button type="button" onClick={onOpen} className="inline-flex items-center gap-1.5">
          <KanbanIcon name="plus" size="xs" />
          เพิ่มการ์ดใหม่ในคอลัมน์ {columnName}
        </button>
      </td>
    </tr>
  );
}

// ───────────────────────── แถวการ์ด 1 ใบ (แก้ในช่องได้ทุกคอลัมน์) ─────────────────────────

function TableRowView({
  row,
  board,
  selected,
  onToggleSelect,
  nowMs,
  columns,
  customFieldColumns,
  onEditTitle,
  onEditColumn,
  onEditDue,
  onToggleAssignee,
  onToggleLabel,
}: {
  row: TableRowDto;
  board: BoardViewDto;
  selected: boolean;
  onToggleSelect: () => void;
  nowMs: number;
  columns: { id: string; name: string }[];
  /** K2.6: ชื่อคอลัมน์ฟิลด์กำหนดเอง (เรียง sortOrder) — จับคู่กับ `row.fieldsOnCard` ด้วยชื่อ */
  customFieldColumns: string[];
  onEditTitle: (title: string) => void;
  onEditColumn: (columnId: string) => void;
  onEditDue: (dueAt: string | null) => void;
  onToggleAssignee: (person: BoardPersonDto) => void;
  onToggleLabel: (label: BoardLabelDto) => void;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(row.title);
  const [duePicker, setDuePicker] = useState(false);
  const [assigneesOpen, setAssigneesOpen] = useState(false);
  const [labelsOpen, setLabelsOpen] = useState(false);

  useEffect(() => setTitleDraft(row.title), [row.title]);

  const due = dueBadgeFrom(row.dueAt, row.completedAt, nowMs);

  return (
    <tr data-testid="table-row" data-card-id={row.id} style={selected ? { background: "var(--color-out)" } : undefined}>
      <td style={cellStyle}>
        <input
          type="checkbox"
          data-testid="row-select"
          aria-label={`เลือกการ์ด ${row.title}`}
          checked={selected}
          onChange={onToggleSelect}
        />
      </td>

      <td style={cellStyle}>
        {editingTitle ? (
          <input
            autoFocus
            data-testid="table-title-input"
            value={titleDraft}
            onChange={(e) => setTitleDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
              if (e.key === "Escape") {
                setTitleDraft(row.title);
                setEditingTitle(false);
              }
            }}
            onBlur={() => {
              setEditingTitle(false);
              const v = titleDraft.trim();
              if (v && v !== row.title) onEditTitle(v);
              else setTitleDraft(row.title);
            }}
            className="w-full rounded border px-1.5 py-0.5"
            style={{ borderColor: "var(--color-accent)", fontSize: 12.5 }}
          />
        ) : (
          <span className="flex items-center gap-1.5">
            <button type="button" data-testid="table-title-cell" onClick={() => setEditingTitle(true)} className="text-left">
              {row.cardNo && <span className="tabular-nums" style={{ color: "var(--color-muted)" }}>#{row.cardNo}</span>} {row.title}
            </button>
            {/* K2.7 — การ์ดแม่ของงานประจำ (มี recurrenceRule) */}
            {row.isRecurring && (
              <span data-testid="card-recurring" title="งานประจำ — เกิดซ้ำตามกำหนด" style={{ color: "var(--color-muted)" }}>
                <KanbanIcon name="repeat" size="xs" />
              </span>
            )}
            <button
              type="button"
              aria-label="เปิดการ์ดเต็มจอ"
              title="เปิดการ์ด"
              onClick={() => router.push(`${pathname}?card=${row.id}`)}
              style={{ color: "var(--color-muted)", opacity: 0.6 }}
            >
              <KanbanIcon name="ar" size="xs" />
            </button>
          </span>
        )}
      </td>

      <td style={cellStyle}>
        <select value={row.columnId} onChange={(e) => onEditColumn(e.target.value)} className="rounded border" style={{ borderColor: "var(--color-line)", fontSize: 12, padding: "2px 4px" }}>
          {columns.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </td>

      <td style={cellStyle}>
        <span className="relative flex items-center" style={{ height: 24 }}>
          {row.assignees.map((a, i) => (
            <span key={a.userId} style={{ marginLeft: i === 0 ? 0 : -6, boxShadow: "0 0 0 2px var(--color-surface)", borderRadius: 999 }}>
              <Avatar name={a.name} size={22} />
            </span>
          ))}
          <button
            type="button"
            aria-label="แก้ผู้รับผิดชอบ"
            onClick={() => setAssigneesOpen((o) => !o)}
            className="grid place-items-center"
            style={{ marginLeft: row.assignees.length ? -6 : 0, width: 22, height: 22, borderRadius: 999, border: "1px dashed var(--color-line)", color: "var(--color-muted)" }}
          >
            <KanbanIcon name="plus" size="xs" />
          </button>
          {assigneesOpen && (
            <MiniPopover onClose={() => setAssigneesOpen(false)}>
              {board.members.length === 0 && <span className="px-2 py-1" style={{ color: "var(--color-muted)" }}>บอร์ดนี้ยังไม่มีสมาชิก</span>}
              {board.members.map((m) => (
                <MiniPopoverRow key={m.userId} checked={row.assignees.some((a) => a.userId === m.userId)} onClick={() => onToggleAssignee(m)}>
                  <Avatar name={m.name} size={18} /> {m.name}
                </MiniPopoverRow>
              ))}
            </MiniPopover>
          )}
        </span>
      </td>

      <td style={cellStyle}>
        <span className="relative">
          <ThaiDatePicker
            value={row.dueAt}
            onChange={(d) => {
              onEditDue(d);
              setDuePicker(false);
            }}
            editable
            withTime
            open={duePicker}
            onOpenChange={setDuePicker}
            nowMs={nowMs}
            ariaLabel={`กำหนดส่ง ${row.title}`}
            chipTestId="table-due-chip"
            pickerTestId="table-due-picker"
            tone={due?.tone}
            chipText={due?.text}
          />
        </span>
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
        <span className="relative flex flex-wrap items-center gap-1">
          {row.labels.map((l) => (
            <span
              key={l.id}
              className="inline-flex items-center font-semibold"
              style={{ height: 17, padding: "0 6px", borderRadius: 5, fontSize: 10.5, color: tagColorVar(l.color), border: `1px solid ${tagColorVar(l.color)}` }}
            >
              {l.name}
            </span>
          ))}
          <button
            type="button"
            aria-label="แก้ป้ายกำกับ"
            onClick={() => setLabelsOpen((o) => !o)}
            className="inline-flex items-center justify-center"
            style={{ height: 17, width: 20, borderRadius: 5, border: "1px dashed var(--color-line)", color: "var(--color-muted)" }}
          >
            <KanbanIcon name="plus" size="xs" />
          </button>
          {labelsOpen && (
            <MiniPopover onClose={() => setLabelsOpen(false)}>
              {board.labels.length === 0 && <span className="px-2 py-1" style={{ color: "var(--color-muted)" }}>บอร์ดนี้ยังไม่มีป้ายกำกับ</span>}
              {board.labels.map((l) => (
                <MiniPopoverRow key={l.id} checked={row.labels.some((x) => x.id === l.id)} onClick={() => onToggleLabel(l)}>
                  <span style={{ width: 10, height: 10, borderRadius: 3, background: tagColorVar(l.color), display: "inline-block" }} /> {l.name}
                </MiniPopoverRow>
              ))}
            </MiniPopover>
          )}
        </span>
      </td>

      {customFieldColumns.map((name) => (
        <td key={name} data-testid="table-custom-field-cell" style={cellStyle}>
          {row.fieldsOnCard.find((f) => f.name === name)?.display ?? <span style={{ color: "var(--color-muted)" }}>—</span>}
        </td>
      ))}

      <td style={cellStyle}>
        {row.links.length > 0 ? (
          row.links.map((l) => <span key={l.label}>{l.label}</span>)
        ) : (
          <span style={{ color: "var(--color-muted)" }}>—</span>
        )}
      </td>

      <td style={cellStyle}>
        <TimeAgo iso={row.updatedAt} nowMs={nowMs} />
      </td>
    </tr>
  );
}

/** K2.12: คอลัมน์ "แก้ไขล่าสุด" แบบสัมพัทธ์ ("2 ชม." · "เมื่อวาน") — ใช้ `relativeThaiTime` ตัวเดียวกับ
 * Comments.tsx/Timeline.tsx/BoardsHome.tsx (ห้ามคำนวณเวลาสัมพัทธ์ซ้ำหลายที่) วันเต็มยังอยู่ใน title */
function TimeAgo({ iso, nowMs }: { iso: string; nowMs: number }) {
  return (
    <span title={formatCardDateTime(iso)} style={{ color: "var(--color-muted)" }}>
      {relativeThaiTime(iso, nowMs)}
    </span>
  );
}

// ───────────────────────── empty state (§5.7) ─────────────────────────

function EmptyState({ hasFilters, onClear }: { hasFilters: boolean; onClear: () => void }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3" style={{ color: "var(--color-muted)", minHeight: 240 }}>
      <KanbanIcon name={hasFilters ? "filter" : "list"} size="lg" />
      <p style={{ fontSize: 13 }}>{hasFilters ? "ไม่มีการ์ดตรงกับตัวกรอง" : "บอร์ดนี้ยังไม่มีการ์ด"}</p>
      {hasFilters && (
        <button type="button" onClick={onClear} className="underline" style={{ fontSize: 13, color: "var(--color-accent)" }}>
          ล้างตัวกรอง
        </button>
      )}
    </div>
  );
}

// ───────────────────────── popover เล็ก (ใช้ในตาราง — ต่างจาก `Popover` ของ `CardBack.tsx`) ─────────────────────────

function MiniPopover({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <>
      <span className="fixed inset-0 z-40" onClick={onClose} />
      <div
        className="absolute left-0 top-full z-50 mt-1 flex max-h-64 w-56 flex-col gap-0.5 overflow-y-auto rounded-xl border p-1.5"
        style={{ background: "var(--color-surface)", borderColor: "var(--color-line)", boxShadow: "0 14px 34px rgba(10,10,10,.14)", color: "var(--color-ink)" }}
      >
        {children}
      </div>
    </>
  );
}

function MiniPopoverRow({ children, onClick, checked }: { children: React.ReactNode; onClick: () => void; checked?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-left"
      style={{ fontSize: 12.5, background: checked ? "var(--color-surface-2)" : "transparent" }}
    >
      <span className="flex flex-1 items-center gap-1.5">{children}</span>
      {checked && <KanbanIcon name="check" size="xs" />}
    </button>
  );
}

export default TableView;
