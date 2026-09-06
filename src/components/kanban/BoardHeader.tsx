// BoardHeader.tsx — แถบหัวบอร์ด (K1.5) · แบบ: `.kbar` ใน `ledger/design-kanban/_kb.part` + ภาพ 02
//   ‹ กลับ · ชื่อบอร์ด (คลิกแก้ในที่ ถ้า ADMIN) · ดาว · ชิปสาขา · ชิปการมองเห็น ·
//   ตัวสลับมุมมอง 5 แบบ (P1 มีแค่ "บอร์ด") · ตัวกรอง (K1.11) · อัตโนมัติ (K2.9) · รูปทีม + เชิญ · ⋯
"use client";

import Link from "next/link";
import { useState } from "react";
import { KanbanIcon } from "./KanbanIcon";
import { Avatar } from "./Card";
import { BoardActivityPanel } from "./Timeline";
import type { BoardViewDto } from "@/lib/modules/kanban/types";

const VIEWS: { key: string; icon: string; label: string }[] = [
  { key: "board", icon: "grid", label: "บอร์ด" },
  { key: "table", icon: "list", label: "ตาราง" },
  { key: "calendar", icon: "cal", label: "ปฏิทิน" },
  { key: "timeline", icon: "chart", label: "ไทม์ไลน์" },
  { key: "summary", icon: "pct", label: "สรุป" },
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
}: {
  board: BoardViewDto;
  starred: boolean;
  onToggleStar: () => void;
  onRename: (name: string) => void;
}) {
  const [renaming, setRenaming] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  // K1.10 — แผงประวัติกิจกรรมของบอร์ด (เปิดจากเมนู ⋯) · เวลาอ้างอิงมาจาก server เหมือนที่อื่นทั้งหน้า
  const [activityOpen, setActivityOpen] = useState(false);
  const isAdmin = board.role === "ADMIN";

  return (
    <header
      data-testid="board-header"
      className="flex flex-none items-center overflow-x-auto"
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

      {/* ตัวสลับมุมมอง — P1 มีแค่ "บอร์ด" ตัวอื่นเป็น P2 (ปิดไว้พร้อมป้าย "เร็ว ๆ นี้") */}
      <div
        className="hidden lg:flex"
        style={{ gap: 2, border: "1px solid var(--color-line)", borderRadius: 8, padding: 2, marginLeft: 10 }}
      >
        {VIEWS.map((v) => {
          const active = v.key === "board";
          return (
            <span
              key={v.key}
              title={active ? undefined : "เร็ว ๆ นี้"}
              aria-disabled={!active}
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
            </span>
          );
        })}
      </div>

      <span className="flex-1" />

      <button type="button" disabled title="เร็ว ๆ นี้ (ตัวกรองอยู่ใน K1.11)" className="hidden items-center lg:flex" style={{ ...ghostBtn, gap: 7, color: "var(--color-muted)" }}>
        <KanbanIcon name="filter" size="sm" />
        ตัวกรอง
      </button>
      <button type="button" disabled title="เร็ว ๆ นี้" className="hidden items-center lg:flex" style={{ ...ghostBtn, gap: 7, color: "var(--color-muted)" }}>
        <KanbanIcon name="spark" size="sm" />
        อัตโนมัติ
      </button>

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
              <span className="px-2 py-2" style={{ color: "var(--color-muted)" }}>
                ตั้งค่าบอร์ด · ป้ายกำกับ · คลังเก็บ — เร็ว ๆ นี้
              </span>
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
    </header>
  );
}

export default BoardHeader;
