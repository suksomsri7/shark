// BoardsHome.tsx — หน้ารวมบอร์ดใหม่ (K1.12 · เทียบ mockup `ledger/design-kanban/01-boards-home.png`)
//
// โครง (บนลงล่าง ตามแบบ): หัวเรื่อง+ค้นหา+สร้างบอร์ด → บอร์ดติดดาว → จัดกลุ่มตามหน่วยธุรกิจ →
// บอร์ดกลางองค์กร → แถวเทมเพลต · ว่างเปล่าทั้งหมด = empty state + เทมเพลตยังโชว์ (§5.7)
"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { Avatar } from "./Card";
import { CreateBoardModal, type CreateBoardUnit } from "./CreateBoardModal";
import { KanbanIcon } from "./KanbanIcon";
import { SearchPalette } from "./SearchPalette";
import { TemplatePicker } from "./TemplatePicker";
import { starBoardAction } from "@/lib/modules/kanban/actions";
import { relativeThaiTime } from "@/lib/modules/kanban/activity-text";
import type { BoardsHomeCardDto, BoardsHomeDto } from "@/lib/modules/kanban/types";

const muted = "text-[color:var(--color-muted)]";

function tagColorVar(color: string): string {
  return `var(--color-tag-${color.toLowerCase()})`;
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
      className="flex flex-col overflow-hidden rounded-xl"
      style={{ border: "1px solid var(--color-line)", background: "var(--color-surface)" }}
    >
      <div className="flex items-center justify-end px-2.5 py-1.5" style={{ background: tagColorVar(board.color), opacity: 0.16 }} />
      <div className="flex flex-col gap-1.5 p-3">
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
                <Avatar name={m.name} size={22} />
              </span>
            ))}
            {board.members.length > 3 && (
              <span className="grid place-items-center" style={{ marginLeft: -6, width: 22, height: 22, borderRadius: 7, fontSize: 10, background: "var(--color-surface-2)", border: "1px solid var(--color-line)" }}>
                +{board.members.length - 3}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
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

  return (
    <div className="flex flex-col gap-5">
      {/* หัวเรื่อง */}
      <div className="flex flex-wrap items-center gap-3">
        <h1 style={{ fontSize: 18, fontWeight: 700, letterSpacing: "-.02em" }}>บอร์ดงาน</h1>
        <span className={`text-sm ${muted}`}>
          {home.totals.boards} บอร์ด · การ์ดค้าง {home.totals.openCards} ใบ
        </span>
        <span className="flex-1" />
        <SearchPalette systemId={systemId} />
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
                {starredToShow.map((b) => (
                  <BoardTile key={b.id} board={b} systemId={systemId} starred nowMs={nowMs} onToggleStar={toggleStar} />
                ))}
              </div>
            </section>
          )}

          {home.byUnit.length > 0 && (
            <div data-testid="boards-by-unit" className="flex flex-col gap-5">
              {home.byUnit.map((group) => (
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

          {home.tenantWide.length > 0 && (
            <section data-testid="boards-tenant" className="flex flex-col gap-2.5">
              <div className="flex items-center gap-2">
                <KanbanIcon name="box" size="sm" />
                <h2 style={{ fontSize: 14.5, fontWeight: 700 }}>บอร์ดกลางองค์กร</h2>
                <span className={`text-xs ${muted}`}>{home.tenantWide.length} บอร์ด · ไม่ผูกหน่วย</span>
              </div>
              <div className="grid gap-2.5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))" }}>
                {home.tenantWide.map((b) => (
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
