// ArchiveBoardButton.tsx — ปุ่มอันตราย "เก็บบอร์ดเข้าคลัง" (ภาพ 10) — ยืนยัน 2 ขั้นแบบ inline
// (feedback: ห้ามใช้กล่องเตือนของเบราว์เซอร์ — แบบเดียวกับ "เก็บเข้าคลัง" ใน `TableView.tsx`)
"use client";

import { useState } from "react";
import { KanbanIcon } from "../KanbanIcon";
import { archiveBoardAction } from "@/lib/modules/kanban/actions";

export function ArchiveBoardButton({ systemId, boardId }: { systemId: string; boardId: string }) {
  const [confirm, setConfirm] = useState(false);

  if (confirm) {
    return (
      <form action={archiveBoardAction} className="flex flex-col gap-1.5 rounded-lg px-3 py-2" style={{ background: "var(--color-surface-2)" }}>
        <input type="hidden" name="systemId" value={systemId} />
        <input type="hidden" name="boardId" value={boardId} />
        <span style={{ fontSize: 12.5 }}>ยืนยันเก็บบอร์ดนี้เข้าคลัง? กู้คืนได้ทีหลังจากหน้ารวมบอร์ด</span>
        <div className="flex gap-2">
          <button type="submit" data-testid="board-settings-archive-confirm" className="font-semibold" style={{ fontSize: 12.5, color: "var(--color-danger)" }}>
            ยืนยันเก็บเข้าคลัง
          </button>
          <button type="button" onClick={() => setConfirm(false)} style={{ fontSize: 12.5, color: "var(--color-muted)" }}>
            ยกเลิก
          </button>
        </div>
      </form>
    );
  }

  return (
    <button
      type="button"
      data-testid="board-settings-archive-board"
      onClick={() => setConfirm(true)}
      className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm"
      style={{ color: "var(--color-danger)" }}
    >
      <KanbanIcon name="warn" size="xs" />
      เก็บบอร์ดเข้าคลัง
    </button>
  );
}

export default ArchiveBoardButton;
