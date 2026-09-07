// BoardHeader.tsx — แถบหัวบอร์ด (K1.5) · แบบ: `.kbar` ใน `ledger/design-kanban/_kb.part` + ภาพ 02
//   ‹ กลับ · ชื่อบอร์ด (คลิกแก้ในที่ ถ้า ADMIN) · ดาว · ชิปสาขา · ชิปการมองเห็น ·
//   ตัวสลับมุมมอง 5 แบบ (P1 มีแค่ "บอร์ด") · ตัวกรอง (K1.11) · อัตโนมัติ (K2.9) · รูปทีม + เชิญ · ⋯
"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { KanbanIcon } from "./KanbanIcon";
import { Avatar } from "./Card";
import { SearchPalette } from "./SearchPalette";
import { BoardActivityPanel } from "./Timeline";
// K2.5 — dropdown "มุมมองที่บันทึกไว้" + "บันทึกมุมมองนี้" (testid `saved-views`)
import { SavedViewsMenu } from "./SavedViewsMenu";
import { saveBoardAsTemplateAction, unwatchAction, watchAction } from "@/lib/modules/kanban/actions";
// K2.9 — ปุ่มอัตโนมัติของหัวบอร์ด (BOARD_BUTTON)
import { runButtonAction } from "@/lib/modules/kanban/automation-actions";
import type { BoardFilters, DueBucket } from "@/lib/modules/kanban/filters";
import type { BoardViewDto, SavedViewDto } from "@/lib/modules/kanban/types";

const DUE_OPTIONS: { value: DueBucket; label: string }[] = [
  { value: "overdue", label: "เลยกำหนด" },
  { value: "today", label: "วันนี้" },
  { value: "week", label: "สัปดาห์นี้" },
  { value: "none", label: "ไม่กำหนด" },
];

const VIEWS: { key: string; icon: string; label: string; ready?: boolean }[] = [
  { key: "board", icon: "grid", label: "บอร์ด", ready: true },
  // K2.1 — เปิดใช้จริงแล้ว (เดิม "เร็ว ๆ นี้")
  { key: "table", icon: "list", label: "ตาราง", ready: true },
  // K2.2 — เปิดใช้จริงแล้ว (เดิม "เร็ว ๆ นี้")
  { key: "calendar", icon: "cal", label: "ปฏิทิน", ready: true },
  // K2.3 — เปิดใช้จริงแล้ว (เดิม "เร็ว ๆ นี้")
  { key: "timeline", icon: "chart", label: "ไทม์ไลน์", ready: true },
  // K2.4 — เปิดใช้จริงแล้ว (เดิม "เร็ว ๆ นี้")
  { key: "summary", icon: "pct", label: "สรุป", ready: true },
];

const chipStyle: React.CSSProperties = {
  height: 22,
  padding: "0 8px",
  borderRadius: 6,
  border: "1px solid var(--color-line)",
  fontSize: 11.5,
  color: "var(--color-muted)",
  background: "var(--color-surface)",
  whiteSpace: "nowrap",
};

const ghostBtn: React.CSSProperties = {
  height: 31,
  padding: "0 10px",
  borderRadius: 7,
  fontSize: 12.5,
  border: "1px solid var(--color-line)",
  background: "var(--color-surface)",
  whiteSpace: "nowrap",
};

export function BoardHeader({
  board,
  starred,
  onToggleStar,
  onRename,
  filters,
  savedViews = [],
}: {
  board: BoardViewDto;
  starred: boolean;
  onToggleStar: () => void;
  onRename: (name: string) => void;
  /** K1.11 — ตัวกรองปัจจุบันของบอร์ด (มาจาก URL) ใช้แค่นับ pill ของปุ่ม "ตัวกรอง" + ทำ toggle ในเมนูเร็ว */
  filters: BoardFilters;
  /** K2.5 — มุมมองที่บันทึกไว้ของบอร์ดนี้ (ทั้งทีม + ของตัวเอง — `page.tsx` โหลดผ่าน `listViews` มาให้แล้ว) */
  savedViews?: SavedViewDto[];
}) {
  const [renaming, setRenaming] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  // K1.10 — แผงประวัติกิจกรรมของบอร์ด (เปิดจากเมนู ⋯) · เวลาอ้างอิงมาจาก server เหมือนที่อื่นทั้งหน้า
  const [activityOpen, setActivityOpen] = useState(false);
  // K1.12: "บันทึกเป็นเทมเพลต" — โมดัลเล็กในเมนู ⋯ (ADMIN เท่านั้น)
  const [saveTemplateOpen, setSaveTemplateOpen] = useState(false);
  // K2.9 — ปุ่มอัตโนมัติของบอร์ดที่กำลังทำงาน (กันกดรัว — กฎ 1 ใบทำได้หลายอย่างจริง ๆ)
  const [runningButton, setRunningButton] = useState<string | null>(null);
  const [buttonError, setButtonError] = useState<string | null>(null);
  // K2.11 — "ติดตามบอร์ด" (ของส่วนตัว) · ค่าเริ่มต้นมาจาก server พร้อมบอร์ด
  const [watching, setWatching] = useState(board.watched);
  const [watchBusy, setWatchBusy] = useState(false);
  const isAdmin = board.role === "ADMIN";
  const router = useRouter();

  /** สลับติดตามบอร์ด — optimistic · ล้มแล้วคืนค่าเดิม + ข้อความตรงจุด (ไม่ alert) */
  const toggleWatchBoard = async () => {
    const next = !watching;
    setWatchBusy(true);
    setWatching(next);
    const res = next
      ? await watchAction({ systemId: board.systemId, targetType: "BOARD", targetId: board.id })
      : await unwatchAction({ systemId: board.systemId, targetType: "BOARD", targetId: board.id });
    setWatchBusy(false);
    if (!res.ok) {
      setWatching(!next);
      setButtonError(res.message);
    }
  };

  /** กดปุ่มอัตโนมัติของบอร์ด → กฎวิ่งฝั่งเซิร์ฟเวอร์ แล้วโหลดบอร์ดใหม่ (ไม่เดาผลลัพธ์บนจอ) */
  const runBoardButton = async (ruleId: string, name: string) => {
    setRunningButton(ruleId);
    setButtonError(null);
    const res = await runButtonAction({ systemId: board.systemId, boardId: board.id, ruleId });
    setRunningButton(null);
    // ผิดพลาด = บอกตรงจุดที่กด ไม่ใช่ alert เด้ง (feedback_validation_inline_not_alert)
    if (!res.ok) {
      setButtonError(`${name}: ${res.message}`);
      return;
    }
    router.refresh();
  };
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const activeFilterCount = ["assignee", "label", "due", "status", "q", "column"].filter(
    (k) => Boolean((filters as Record<string, string | undefined>)[k]),
  ).length;

  /** ตั้ง/สลับพารามิเตอร์ตัวกรองตัวเดียว — กดค่าเดิมซ้ำ = ปลดออก (toggle) */
  const toggleParam = (key: "assignee" | "label" | "due" | "status", value: string) => {
    const next = new URLSearchParams(searchParams.toString());
    if (next.get(key) === value) next.delete(key);
    else next.set(key, value);
    const qs = next.toString();
    router.replace(`${pathname}${qs ? `?${qs}` : ""}`, { scroll: false });
  };

  // K2.1/K2.2/K2.3 — สลับมุมมอง (บอร์ด/ตาราง/ปฏิทิน/ไทม์ไลน์) คงตัวกรองไว้ (assignee/label/due/status/q) ·
  // ล้างพารามิเตอร์เฉพาะของมุมมองที่ไม่ได้ไป (table: sort/page · table+timeline: group · calendar: month/
  // mode/ext · timeline: zoom/from) — ไม่งั้นสลับกลับมาแล้วลิงก์ค้าง
  const rawView = searchParams.get("view");
  const currentView =
    rawView === "table"
      ? "table"
      : rawView === "calendar"
        ? "calendar"
        : rawView === "summary"
          ? "summary"
          : rawView === "timeline"
            ? "timeline"
            : "board";
  const hrefForView = (viewKey: string): string => {
    const next = new URLSearchParams(searchParams.toString());
    if (viewKey === "board") next.delete("view");
    else next.set("view", viewKey);
    if (viewKey !== "table") {
      next.delete("sort");
      next.delete("page");
    }
    if (viewKey !== "table" && viewKey !== "timeline") {
      next.delete("group");
    }
    if (viewKey !== "calendar") {
      next.delete("month");
      next.delete("mode");
      next.delete("ext");
    }
    if (viewKey !== "timeline") {
      next.delete("zoom");
      next.delete("from");
    }
    const qs = next.toString();
    return `${pathname}${qs ? `?${qs}` : ""}`;
  };

  return (
    <header
      data-testid="board-header"
      className="flex flex-none items-center overflow-x-auto lg:overflow-visible"
      style={{
        gap: 9,
        padding: "10px 20px",
        borderBottom: "1px solid var(--color-line)",
        background: "var(--color-surface)",
      }}
    >
      <Link
        href={`/app/sys/${board.systemId}/kanban/boards`}
        aria-label="กลับไปหน้ารวมบอร์ด"
        title="กลับไปหน้ารวมบอร์ด"
        style={{ color: "var(--color-muted)" }}
      >
        <KanbanIcon name="back" size="sm" />
      </Link>

      {renaming ? (
        <input
          autoFocus
          defaultValue={board.name}
          aria-label="ชื่อบอร์ด"
          onBlur={(e) => {
            const v = e.currentTarget.value.trim();
            if (v && v !== board.name) onRename(v);
            setRenaming(false);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
            if (e.key === "Escape") setRenaming(false);
          }}
          style={{ fontSize: 17, fontWeight: 700, border: "1px solid var(--color-accent)", borderRadius: 6, padding: "0 6px" }}
        />
      ) : (
        <h1
          onClick={() => isAdmin && setRenaming(true)}
          title={isAdmin ? "คลิกเพื่อเปลี่ยนชื่อบอร์ด" : board.name}
          className="truncate"
          style={{
            fontSize: 17,
            fontWeight: 700,
            letterSpacing: "-.02em",
            whiteSpace: "nowrap",
            maxWidth: "min(52vw, 420px)",
            cursor: isAdmin ? "text" : "default",
          }}
        >
          {board.name}
        </h1>
      )}

      <button
        type="button"
        onClick={onToggleStar}
        aria-label={starred ? "เอาดาวออก" : "ติดดาวบอร์ดนี้"}
        title={starred ? "เอาดาวออก" : "ติดดาวบอร์ดนี้"}
        style={{ color: starred ? "var(--color-tag-amber)" : "var(--color-muted)" }}
      >
        <KanbanIcon name="star" size="sm" className={starred ? "fill-current" : ""} />
      </button>

      {board.unitName && (
        <span className="hidden lg:inline-flex" style={chipStyle}>
          {board.unitName}
        </span>
      )}
      <span className="hidden items-center lg:inline-flex" style={{ ...chipStyle, gap: 5 }}>
        <KanbanIcon name="lock" size="xs" />
        {board.visibility === "PRIVATE" ? "เฉพาะสมาชิก" : "ทั้งร้านเห็น"}
      </span>

      {/* ตัวสลับมุมมอง (K2.1 เปิด "ตาราง") — ตัวที่ยังไม่มา (P2 ที่เหลือ) ปิดไว้พร้อมป้าย "เร็ว ๆ นี้" */}
      <div
        className="hidden lg:flex"
        style={{ gap: 2, border: "1px solid var(--color-line)", borderRadius: 8, padding: 2, marginLeft: 10 }}
      >
        {VIEWS.map((v) => {
          const active = v.key === currentView;
          if (!v.ready) {
            return (
              <span
                key={v.key}
                title="เร็ว ๆ นี้"
                aria-disabled="true"
                className="flex items-center"
                style={{ gap: 5, height: 26, padding: "0 9px", borderRadius: 6, fontSize: 12.5, color: "var(--color-muted)" }}
              >
                <KanbanIcon name={v.icon} size="xs" />
                {v.label}
              </span>
            );
          }
          return (
            <Link
              key={v.key}
              href={hrefForView(v.key)}
              data-testid={`board-view-${v.key}`}
              className="flex items-center"
              style={{
                gap: 5,
                height: 26,
                padding: "0 9px",
                borderRadius: 6,
                fontSize: 12.5,
                fontWeight: active ? 700 : 400,
                background: active ? "var(--color-ink)" : "transparent",
                color: active ? "var(--color-surface)" : "var(--color-muted)",
              }}
            >
              <KanbanIcon name={v.icon} size="xs" />
              {v.label}
            </Link>
          );
        })}
      </div>

      <span className="flex-1" />

      {/* ค้นหา (Ctrl/⌘ K) — เว้นไว้เห็นได้ทุกขนาดจอ (มือถือก็ค้นหาข้ามบอร์ดได้ ไม่ผูกกับ lg: เหมือนปุ่มอื่น) */}
      <SearchPalette systemId={board.systemId} />

      <span className="relative">
        <button
          type="button"
          data-testid="filter-button"
          onClick={() => setFilterOpen((o) => !o)}
          title="ตัวกรอง"
          className="hidden items-center lg:flex"
          style={{ ...ghostBtn, gap: 7, color: activeFilterCount > 0 ? "var(--color-ink)" : "var(--color-muted)" }}
        >
          <KanbanIcon name="filter" size="sm" />
          ตัวกรอง
          {activeFilterCount > 0 && (
            <span
              className="grid place-items-center font-bold"
              style={{ minWidth: 16, height: 16, borderRadius: 999, padding: "0 4px", fontSize: 10, background: "var(--color-ink)", color: "var(--color-surface)" }}
            >
              {activeFilterCount}
            </span>
          )}
        </button>
        {filterOpen && (
          <>
            <span className="fixed inset-0 z-10" onClick={() => setFilterOpen(false)} />
            <div
              className="absolute right-0 z-20 mt-1 flex w-64 flex-col gap-3 rounded-xl p-3"
              style={{ background: "var(--color-surface)", border: "1px solid var(--color-line)", boxShadow: "0 14px 34px rgba(10,10,10,.12)", fontSize: 12.5 }}
            >
              <div className="flex flex-col gap-1.5">
                <span style={{ color: "var(--color-muted)", fontSize: 11 }}>ผู้รับผิดชอบ</span>
                <div className="flex flex-wrap" style={{ gap: 5 }}>
                  <FilterChip active={filters.assignee === "me"} label="ฉัน" onClick={() => toggleParam("assignee", "me")} />
                  {board.members.map((m) => (
                    <FilterChip key={m.userId} active={filters.assignee === m.userId} label={m.name} onClick={() => toggleParam("assignee", m.userId)} />
                  ))}
                </div>
              </div>
              {board.labels.length > 0 && (
                <div className="flex flex-col gap-1.5">
                  <span style={{ color: "var(--color-muted)", fontSize: 11 }}>ป้ายกำกับ</span>
                  <div className="flex flex-wrap" style={{ gap: 5 }}>
                    {board.labels.map((l) => (
                      <FilterChip key={l.id} active={filters.label === l.name} label={l.name} onClick={() => toggleParam("label", l.name)} />
                    ))}
                  </div>
                </div>
              )}
              <div className="flex flex-col gap-1.5">
                <span style={{ color: "var(--color-muted)", fontSize: 11 }}>กำหนดส่ง</span>
                <div className="flex flex-wrap" style={{ gap: 5 }}>
                  {DUE_OPTIONS.map((d) => (
                    <FilterChip key={d.value} active={filters.due === d.value} label={d.label} onClick={() => toggleParam("due", d.value)} />
                  ))}
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <span style={{ color: "var(--color-muted)", fontSize: 11 }}>สถานะ</span>
                <div className="flex flex-wrap" style={{ gap: 5 }}>
                  <FilterChip active={filters.status === "done"} label="เสร็จ" onClick={() => toggleParam("status", "done")} />
                  <FilterChip active={filters.status === "open"} label="ยังไม่เสร็จ" onClick={() => toggleParam("status", "open")} />
                </div>
              </div>
            </div>
          </>
        )}
      </span>
      {/* K2.5 — dropdown "มุมมองที่บันทึกไว้" + "บันทึกมุมมองนี้" */}
      <SavedViewsMenu systemId={board.systemId} boardId={board.id} isAdmin={isAdmin} viewerUserId={board.viewerUserId} views={savedViews} />

      {/* K2.9 — ปุ่มอัตโนมัติของบอร์ด (kind BOARD_BUTTON) · โผล่เฉพาะคนที่กดได้ (server ส่ง [] ให้ VIEWER) */}
      {board.automationButtons.map((b) => (
        <button
          key={b.id}
          type="button"
          data-testid="board-button"
          disabled={runningButton !== null}
          onClick={() => runBoardButton(b.id, b.name)}
          title={`ปุ่มอัตโนมัติ: ${b.name}`}
          className="hidden items-center lg:flex"
          style={{ ...ghostBtn, gap: 7 }}
        >
          <KanbanIcon name="bolt" size="sm" />
          {runningButton === b.id ? "กำลังทำ…" : b.name}
        </button>
      ))}

      {buttonError && (
        <span data-testid="board-button-error" className="hidden lg:inline" style={{ fontSize: 11.5, color: "var(--color-danger)" }}>
          {buttonError}
        </span>
      )}

      {/* K2.9 — ตัวสร้างกฎอัตโนมัติของบอร์ดใบนี้ (ผู้ดูแลบอร์ดเท่านั้น — หน้านั้นก็ 404 ให้คนอื่น) */}
      {isAdmin ? (
        <Link
          href={`/app/sys/${board.systemId}/kanban/automation?board=${board.id}`}
          data-testid="board-automation-link"
          title="ตั้งกฎอัตโนมัติของบอร์ดนี้"
          className="hidden items-center lg:flex"
          style={{ ...ghostBtn, gap: 7, color: "var(--color-muted)" }}
        >
          <KanbanIcon name="spark" size="sm" />
          อัตโนมัติ
        </Link>
      ) : (
        <button type="button" disabled title="ตั้งกฎอัตโนมัติได้เฉพาะผู้ดูแลบอร์ด" className="hidden items-center lg:flex" style={{ ...ghostBtn, gap: 7, color: "var(--color-muted)" }}>
          <KanbanIcon name="spark" size="sm" />
          อัตโนมัติ
        </button>
      )}

      <div className="hidden lg:flex" style={{ margin: "0 4px" }}>
        {board.members.slice(0, 4).map((m, i) => (
          <span key={m.userId} style={{ marginLeft: i === 0 ? 0 : -6, boxShadow: "0 0 0 2px var(--color-surface)", borderRadius: 999 }}>
            <Avatar name={m.name} size={26} />
          </span>
        ))}
        {isAdmin && (
          <button
            type="button"
            aria-label="เชิญคนเข้าบอร์ด"
            title="เชิญคนเข้าบอร์ด (K1.3 มีบริการแล้ว · หน้าจอเชิญอยู่ K1.12)"
            className="grid place-items-center"
            style={{
              marginLeft: -6,
              width: 26,
              height: 26,
              borderRadius: 7,
              border: "1px dashed var(--color-line)",
              background: "var(--color-surface)",
              color: "var(--color-muted)",
            }}
          >
            <KanbanIcon name="plus" size="xs" />
          </button>
        )}
      </div>

      <span className="relative">
        <button
          type="button"
          aria-label="เมนูบอร์ด"
          title="เมนูบอร์ด"
          onClick={() => setMenuOpen((o) => !o)}
          className="grid place-items-center"
          style={{ ...ghostBtn, width: 34, padding: 0, color: "var(--color-muted)" }}
        >
          <KanbanIcon name="more" size="sm" />
        </button>
        {menuOpen && (
          <>
            <span className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
            <div
              className="absolute right-0 z-20 mt-1 flex w-60 flex-col rounded-xl p-1"
              style={{
                background: "var(--color-surface)",
                border: "1px solid var(--color-line)",
                boxShadow: "0 14px 34px rgba(10,10,10,.12)",
                fontSize: 13,
              }}
            >
              <Link href={`/app/sys/${board.systemId}/kanban/boards`} className="rounded-lg px-2 py-2" onClick={() => setMenuOpen(false)}>
                หน้ารวมบอร์ด
              </Link>
              {/* K2.11 — ติดตามทั้งบอร์ด: ได้ใบแจ้งเตือนของทุกการ์ดในบอร์ดนี้ (ของส่วนตัว · ทุกบทบาทกดได้) */}
              <button
                type="button"
                data-testid="board-watch"
                className="flex items-center gap-2 rounded-lg px-2 py-2 text-left"
                disabled={watchBusy}
                onClick={() => {
                  setMenuOpen(false);
                  void toggleWatchBoard();
                }}
              >
                <KanbanIcon name="eye" size="xs" />
                {watching ? "เลิกติดตามบอร์ด" : "ติดตามบอร์ด"}
              </button>
              <button
                type="button"
                data-testid="board-activity-open"
                className="flex items-center gap-2 rounded-lg px-2 py-2 text-left"
                onClick={() => {
                  setMenuOpen(false);
                  setActivityOpen(true);
                }}
              >
                <KanbanIcon name="clock" size="xs" />
                ประวัติกิจกรรมของบอร์ด
              </button>
              {isAdmin && (
                <button
                  type="button"
                  data-testid="board-save-as-template-open"
                  className="flex items-center gap-2 rounded-lg px-2 py-2 text-left"
                  onClick={() => {
                    setMenuOpen(false);
                    setSaveTemplateOpen(true);
                  }}
                >
                  <KanbanIcon name="copy" size="xs" />
                  บันทึกเป็นเทมเพลต
                </button>
              )}
              {/* K1.14 — คลังเก็บ: ที่หาของที่เผลอเก็บ (การ์ด + คอลัมน์) แล้วกู้คืน */}
              <Link
                href={`/app/sys/${board.systemId}/kanban/b/${board.id}/archive`}
                data-testid="board-archive-link"
                className="flex items-center gap-2 rounded-lg px-2 py-2"
                onClick={() => setMenuOpen(false)}
              >
                <KanbanIcon name="box" size="xs" />
                คลังเก็บ
              </Link>
              {/* K2.5 — โครงหน้าตั้งค่าบอร์ด 7 แท็บ (ภาพ 10) — ADMIN เท่านั้น (หน้าเองก็ 404 ให้คนอื่น) */}
              {isAdmin && (
                <Link
                  href={`/app/sys/${board.systemId}/kanban/b/${board.id}/settings/general`}
                  data-testid="board-settings-link"
                  className="flex items-center gap-2 rounded-lg px-2 py-2"
                  onClick={() => setMenuOpen(false)}
                >
                  <KanbanIcon name="gear" size="xs" />
                  ตั้งค่าบอร์ด
                </Link>
              )}
            </div>
          </>
        )}
      </span>

      {activityOpen && (
        <BoardActivityPanel
          systemId={board.systemId}
          boardId={board.id}
          nowMs={Date.parse(board.now)}
          onClose={() => setActivityOpen(false)}
        />
      )}

      {saveTemplateOpen && (
        <SaveAsTemplateModal
          systemId={board.systemId}
          boardId={board.id}
          defaultName={`${board.name} (เทมเพลต)`}
          onClose={() => setSaveTemplateOpen(false)}
        />
      )}
    </header>
  );
}

/**
 * K1.12 — โมดัลเล็ก "บันทึกเป็นเทมเพลต" (ชื่อ + คำอธิบาย) — validation อยู่ในตัว ไม่ใช้ `alert()`
 * (feedback: ตรวจสอบข้อมูลต้องแจ้งในหน้า ไม่ใช่กล่องเตือนของเบราว์เซอร์)
 */
function SaveAsTemplateModal({
  systemId,
  boardId,
  defaultName,
  onClose,
}: {
  systemId: string;
  boardId: string;
  defaultName: string;
  onClose: () => void;
}) {
  const [name, setName] = useState(defaultName);
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("ต้องตั้งชื่อเทมเพลตก่อนจึงบันทึกได้");
      return;
    }
    setBusy(true);
    setError(null);
    const res = await saveBoardAsTemplateAction({ systemId, boardId, name: trimmed, description: description.trim() || undefined });
    setBusy(false);
    if (!res.ok) {
      setError(res.message);
      return;
    }
    setDone(true);
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center" style={{ background: "rgba(10,10,10,.35)" }}>
      <span className="fixed inset-0" onClick={onClose} aria-hidden />
      <div
        data-testid="save-as-template-modal"
        role="dialog"
        aria-modal="true"
        aria-label="บันทึกเป็นเทมเพลต"
        className="relative flex w-full max-w-[420px] flex-col gap-3 rounded-xl p-5"
        style={{ background: "var(--color-surface)", border: "1px solid var(--color-line)", boxShadow: "0 24px 60px rgba(10,10,10,.28)" }}
      >
        {done ? (
          <>
            <h2 style={{ fontSize: 15, fontWeight: 700 }}>บันทึกเทมเพลตแล้ว</h2>
            <p style={{ fontSize: 12.5, color: "var(--color-muted)" }}>
              เทมเพลต &ldquo;{name.trim()}&rdquo; พร้อมใช้สร้างบอร์ดใหม่จากหน้ารวมบอร์ดแล้ว
            </p>
            <button type="button" className="btn btn-primary self-end text-sm" onClick={onClose}>
              ปิด
            </button>
          </>
        ) : (
          <>
            <h2 style={{ fontSize: 15, fontWeight: 700 }}>บันทึกบอร์ดนี้เป็นเทมเพลต</h2>
            <p style={{ fontSize: 12, color: "var(--color-muted)" }}>
              คัดลอกคอลัมน์ + ป้ายกำกับ + การ์ดที่ยังไม่เก็บเข้าคลัง (ไม่คัดลอกผู้รับผิดชอบ/กำหนดส่ง) ไว้ให้ร้านใช้สร้างบอร์ดใหม่ได้ทันที
            </p>
            <label className="flex flex-col gap-1" style={{ fontSize: 12.5 }}>
              ชื่อเทมเพลต
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="input"
                aria-invalid={error ? "true" : undefined}
              />
            </label>
            <label className="flex flex-col gap-1" style={{ fontSize: 12.5 }}>
              คำอธิบาย (ไม่บังคับ)
              <textarea value={description} onChange={(e) => setDescription(e.target.value)} className="input" rows={2} />
            </label>
            {error && (
              <p data-testid="save-as-template-error" style={{ fontSize: 12, color: "var(--color-danger)" }}>
                {error}
              </p>
            )}
            <div className="mt-1 flex justify-end gap-2">
              <button type="button" className="btn btn-ghost text-sm" onClick={onClose} disabled={busy}>
                ยกเลิก
              </button>
              <button type="button" className="btn btn-primary text-sm" onClick={submit} disabled={busy}>
                {busy ? "กำลังบันทึก…" : "บันทึกเป็นเทมเพลต"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/** ชิปเลือก/ยกเลิกตัวกรองแกนเดียวในแผง "ตัวกรอง" — กดซ้ำที่ค่าเดิม = ปลด (`toggleParam`) */
function FilterChip({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center"
      style={{
        height: 24,
        padding: "0 9px",
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

export default BoardHeader;
