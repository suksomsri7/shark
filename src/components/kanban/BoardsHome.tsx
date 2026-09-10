// BoardsHome.tsx — หน้ารวมบอร์ดใหม่ (K1.12 · เทียบ mockup `ledger/design-kanban/01-boards-home.png`)
//
// โครง (บนลงล่าง ตามแบบ): หัวเรื่อง+ค้นหา+สร้างบอร์ด → บอร์ดติดดาว → จัดกลุ่มตามหน่วยธุรกิจ →
// บอร์ดกลางองค์กร → แถวเทมเพลต · ว่างเปล่าทั้งหมด = empty state + เทมเพลตยังโชว์ (§5.7)
"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { initialOf } from "./Card";
import { CreateBoardModal, type CreateBoardUnit } from "./CreateBoardModal";
import { KanbanIcon } from "./KanbanIcon";
import { SearchPalette } from "./SearchPalette";
import { TemplatePicker } from "./TemplatePicker";
import { starBoardAction } from "@/lib/modules/kanban/actions";
import { relativeThaiTime } from "@/lib/modules/kanban/activity-text";
import type { BoardsHomeCardDto, BoardsHomeDto } from "@/lib/modules/kanban/types";

const muted = "text-[color:var(--color-muted)]";

/** ค่าพิเศษของดรอปดาวน์กรองหน่วยธุรกิจ — เลือก "บอร์ดกลางองค์กร" (unitId = null) */
const TENANT_FILTER = "__tenant__";

function tagColorVar(color: string): string {
  return `var(--color-tag-${color.toLowerCase()})`;
}

/** avatar วงกลมของสมาชิกบนการ์ดบอร์ด (ตรง mockup 01 — ต่างจาก `Avatar` สี่เหลี่ยมมนใน Card.tsx ที่ใช้ในหลังการ์ด) */
function MemberAvatar({ name }: { name: string }) {
  return (
    <span
      title={name}
      className="grid shrink-0 place-items-center font-bold"
      style={{
        width: 22,
        height: 22,
        borderRadius: 999,
        background: "var(--color-surface-2)",
        border: "1px solid var(--color-line)",
        fontSize: 10.5,
        color: "var(--color-ink-soft)",
      }}
    >
      {initialOf(name)}
    </span>
  );
}

function BoardTile({
  board,
  systemId,
  starred,
  onToggleStar,
  nowMs,
}: {
  board: BoardsHomeCardDto;
  systemId: string;
  starred: boolean;
  onToggleStar: (boardId: string, next: boolean) => void;
  nowMs: number;
}) {
  return (
    <div
      className="flex overflow-hidden rounded-xl"
      style={{ border: "1px solid var(--color-line)", background: "var(--color-surface)" }}
    >
      {/* แถบสีซ้าย (แทนแถบบนเดิม) — เต็มความสูงการ์ดโดยอัตโนมัติเพราะ align-items ของ flex เป็น stretch */}
      <div className="shrink-0" style={{ width: 5, background: tagColorVar(board.color) }} />
      <div className="flex flex-1 flex-col gap-1.5 p-3">
        <div className="flex items-start justify-between gap-2">
          <Link href={`/app/sys/${systemId}/kanban/b/${board.id}`} className="truncate font-medium" style={{ fontSize: 13 }}>
            {board.name}
          </Link>
          <button
            type="button"
            data-testid="board-star-toggle"
            aria-label={starred ? "เอาดาวออก" : "ติดดาวบอร์ดนี้"}
            onClick={() => onToggleStar(board.id, !starred)}
            style={{ color: starred ? "var(--color-tag-amber)" : "var(--color-muted)" }}
          >
            <KanbanIcon name="star" size="sm" className={starred ? "fill-current" : ""} />
          </button>
        </div>
        <span className={`text-xs ${muted}`}>
          {board.cardCount} การ์ด · อัปเดต {relativeThaiTime(board.updatedAt, nowMs)}
        </span>
        <div className="flex items-center gap-2">
          {board.overdueCount > 0 && (
            <span
              className="inline-flex items-center"
              style={{ height: 19, padding: "0 7px", borderRadius: 5, fontSize: 10.5, fontWeight: 700, color: "var(--color-danger)", background: "color-mix(in srgb, var(--color-danger) 10%, white)" }}
            >
              เลยกำหนด {board.overdueCount} ใบ
            </span>
          )}
          <span className="flex-1" />
          <div className="flex">
            {board.members.slice(0, 3).map((m, i) => (
              <span key={m.userId} style={{ marginLeft: i === 0 ? 0 : -6, boxShadow: "0 0 0 2px var(--color-surface)", borderRadius: 999 }}>
                <MemberAvatar name={m.name} />
              </span>
            ))}
            {board.members.length > 3 && (
              <span
                className="grid place-items-center"
                style={{ marginLeft: -6, width: 22, height: 22, borderRadius: 999, fontSize: 10, background: "var(--color-surface-2)", border: "1px solid var(--color-line)", boxShadow: "0 0 0 2px var(--color-surface)" }}
              >
                +{board.members.length - 3}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/** การ์ดเส้นประ "สร้างบอร์ดใหม่" — ท้ายแถวบอร์ดติดดาว ขนาดช่องกริดเท่าการ์ดบอร์ดจริง (mockup 01) */
function CreateBoardTile({ onOpen }: { onOpen: () => void }) {
  return (
    <button
      type="button"
      data-testid="create-board-tile"
      onClick={onOpen}
      className="flex flex-col items-center justify-center gap-1 rounded-xl p-3 text-center"
      style={{ border: "1px dashed var(--color-line)", background: "var(--color-surface)" }}
    >
      <KanbanIcon name="plus" size="md" className="text-[color:var(--color-muted)]" />
      <span style={{ fontSize: 13, fontWeight: 600 }}>สร้างบอร์ดใหม่</span>
      <span className={`text-xs ${muted}`}>เปล่า หรือเริ่มจากเทมเพลต</span>
    </button>
  );
}

export function BoardsHome({
  systemId,
  home,
  units,
  nowMs,
}: {
  systemId: string;
  home: BoardsHomeDto;
  units: CreateBoardUnit[];
  nowMs: number;
}) {
  const [, startTransition] = useTransition();
  const [starredIds, setStarredIds] = useState<Set<string>>(new Set(home.starred.map((b) => b.id)));
  const [createOpen, setCreateOpen] = useState(false);
  const [presetTemplateId, setPresetTemplateId] = useState<string | undefined>(undefined);
  const [unitFilter, setUnitFilter] = useState<string>("");
  const templatesRef = useRef<HTMLDivElement | null>(null);

  const toggleStar = (boardId: string, next: boolean) => {
    setStarredIds((prev) => {
      const copy = new Set(prev);
      if (next) copy.add(boardId);
      else copy.delete(boardId);
      return copy;
    });
    startTransition(async () => {
      await starBoardAction({ systemId, boardId, starred: next }).catch(() => {});
    });
  };

  const openCreate = (templateId?: string) => {
    setPresetTemplateId(templateId);
    setCreateOpen(true);
  };

  const isEmpty = home.totals.boards === 0;

  const starredBoards = home.starred.filter((b) => starredIds.has(b.id));
  // บอร์ดที่ถูกกดดาวเพิ่มระหว่างอยู่หน้านี้ (ยังไม่อยู่ใน home.starred ที่โหลดมาตอนแรก) — หาให้ครบจากทุกกลุ่ม
  const allBoards = [...home.starred, ...home.tenantWide, ...home.byUnit.flatMap((u) => u.boards)];
  const extraStarred = allBoards.filter((b) => starredIds.has(b.id) && !home.starred.some((s) => s.id === b.id));
  const starredToShow = [...starredBoards, ...extraStarred];

  // dropdown กรองหน่วยธุรกิจ — กรองล้วนฝั่ง client (ไม่ยิงคำขอใหม่) "" = ทุกหน่วยธุรกิจ · TENANT_FILTER = บอร์ดกลางองค์กร (unitId=null)
  const unitMatches = (unitId: string | null) => {
    if (unitFilter === "") return true;
    if (unitFilter === TENANT_FILTER) return unitId === null;
    return unitId === unitFilter;
  };
  const starredFiltered = starredToShow.filter((b) => unitMatches(b.unitId));
  const byUnitFiltered = home.byUnit.filter((group) => unitMatches(group.unit.id));
  const tenantWideFiltered = home.tenantWide.filter((b) => unitMatches(b.unitId));
  const isFilterActive = unitFilter !== "";
  const noFilterMatches =
    isFilterActive && !isEmpty && starredFiltered.length === 0 && byUnitFiltered.length === 0 && tenantWideFiltered.length === 0;

  return (
    <div className="flex flex-col gap-5">
      {/* หัวเรื่อง */}
      <div className="flex flex-wrap items-center gap-3">
        <h1 style={{ fontSize: 18, fontWeight: 700, letterSpacing: "-.02em" }}>บอร์ดงาน</h1>
        <span className={`text-sm ${muted}`}>
          {home.totals.boards} บอร์ด · การ์ดค้าง {home.totals.openCards} ใบ
        </span>
        <span className="flex-1" />
        {/* K3.8 — ทางเข้าภาพรวมข้ามบอร์ดระดับองค์กร (`/kanban/overview`) จากหน้ารวมบอร์ด */}
        <Link href={`/app/sys/${systemId}/kanban/overview`} data-testid="boards-overview-link" className="btn btn-ghost text-sm">
          <KanbanIcon name="grid" size="sm" />
          ภาพรวมทุกบอร์ด
        </Link>
        <SearchPalette systemId={systemId} />
        <div
          className="flex items-center gap-1.5 rounded-lg px-2.5"
          style={{ border: "1px solid var(--color-line)", background: "var(--color-surface)" }}
        >
          <KanbanIcon name="filter" size="sm" className="text-[color:var(--color-muted)]" />
          <select
            data-testid="boards-unit-filter"
            aria-label="กรองตามหน่วยธุรกิจ"
            value={unitFilter}
            onChange={(e) => setUnitFilter(e.target.value)}
            className="border-0 bg-transparent py-2 pr-1 text-sm outline-none"
            style={{ color: "var(--color-ink)" }}
          >
            <option value="">หน่วยธุรกิจ: ทั้งหมด</option>
            {home.byUnit.map((group) => (
              <option key={group.unit.id} value={group.unit.id}>
                {group.unit.name}
              </option>
            ))}
            <option value={TENANT_FILTER}>บอร์ดกลางองค์กร</option>
          </select>
        </div>
        <button type="button" data-testid="create-board" className="btn btn-primary text-sm" onClick={() => openCreate(undefined)}>
          <KanbanIcon name="plus" size="sm" />
          สร้างบอร์ด
        </button>
      </div>

      {isEmpty ? (
        <div className="flex flex-col items-start gap-3 rounded-xl p-6" style={{ border: "1px dashed var(--color-line)", background: "var(--color-surface)" }}>
          <p style={{ fontSize: 13.5 }}>ยังไม่มีบอร์ด — เริ่มจากเทมเพลตเร็วกว่าสร้างเอง</p>
          <div className="flex gap-2">
            <button type="button" className="btn btn-primary text-sm" onClick={() => templatesRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}>
              เลือกเทมเพลต
            </button>
            <button type="button" className="btn btn-ghost text-sm" onClick={() => openCreate(undefined)}>
              สร้างบอร์ดเปล่า
            </button>
          </div>
        </div>
      ) : noFilterMatches ? (
        <div className="flex flex-col items-start gap-2.5 rounded-xl p-5" style={{ border: "1px dashed var(--color-line)", background: "var(--color-surface)" }}>
          <p style={{ fontSize: 13.5 }}>ไม่พบบอร์ดในหน่วยธุรกิจที่เลือก</p>
          <button type="button" className="btn btn-ghost text-sm" onClick={() => setUnitFilter("")}>
            ล้างตัวกรอง
          </button>
        </div>
      ) : (
        <>
          {starredToShow.length > 0 && (
            <section data-testid="boards-starred" className="flex flex-col gap-2.5">
              <div className="flex items-center gap-2">
                <KanbanIcon name="star" size="sm" className="text-[color:var(--color-tag-amber)]" />
                <h2 style={{ fontSize: 14.5, fontWeight: 700 }}>บอร์ดติดดาว</h2>
                <span className={`text-xs ${muted}`}>ปักหมุดไว้บนสุดเสมอ</span>
              </div>
              <div className="grid gap-2.5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))" }}>
                {starredFiltered.map((b) => (
                  <BoardTile key={b.id} board={b} systemId={systemId} starred nowMs={nowMs} onToggleStar={toggleStar} />
                ))}
                <CreateBoardTile onOpen={() => openCreate(undefined)} />
              </div>
            </section>
          )}

          {byUnitFiltered.length > 0 && (
            <div data-testid="boards-by-unit" className="flex flex-col gap-5">
              {byUnitFiltered.map((group) => (
                <section key={group.unit.id} className="flex flex-col gap-2.5">
                  <div className="flex items-center gap-2">
                    <KanbanIcon name="shop" size="sm" />
                    <h2 style={{ fontSize: 14.5, fontWeight: 700 }}>{group.unit.name}</h2>
                    <span className={`text-xs ${muted}`}>{group.boards.length} บอร์ด</span>
                  </div>
                  <div className="grid gap-2.5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))" }}>
                    {group.boards.map((b) => (
                      <BoardTile key={b.id} board={b} systemId={systemId} starred={starredIds.has(b.id)} nowMs={nowMs} onToggleStar={toggleStar} />
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}

          {tenantWideFiltered.length > 0 && (
            <section data-testid="boards-tenant" className="flex flex-col gap-2.5">
              <div className="flex items-center gap-2">
                <KanbanIcon name="box" size="sm" />
                <h2 style={{ fontSize: 14.5, fontWeight: 700 }}>บอร์ดกลางองค์กร</h2>
                <span className={`text-xs ${muted}`}>{tenantWideFiltered.length} บอร์ด · ไม่ผูกหน่วย</span>
              </div>
              <div className="grid gap-2.5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))" }}>
                {tenantWideFiltered.map((b) => (
                  <BoardTile key={b.id} board={b} systemId={systemId} starred={starredIds.has(b.id)} nowMs={nowMs} onToggleStar={toggleStar} />
                ))}
              </div>
            </section>
          )}
        </>
      )}

      <div ref={templatesRef}>
        <TemplatePicker templates={home.templates} onUseTemplate={(id) => openCreate(id)} />
      </div>

      <CreateBoardModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        systemId={systemId}
        units={units}
        templates={home.templates}
        presetTemplateId={presetTemplateId}
      />
    </div>
  );
}

export default BoardsHome;
