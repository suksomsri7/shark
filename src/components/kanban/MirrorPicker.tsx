// MirrorPicker.tsx — ตัวเลือกปลายทางของ "สะท้อนการ์ด (Mirror)" (K3.7)
// เลือกบอร์ดที่เป็น EDITOR ขึ้นไป (ไม่ใช่บอร์ดปัจจุบัน) → คอลัมน์ (ปริยาย = คอลัมน์แรกของบอร์ด) → กดสะท้อน
// ⚠️ ห้ามใช้อีโมจิ — ไอคอนทุกตัวมาจาก <KanbanIcon>
"use client";

import { useEffect, useState } from "react";
import { KanbanIcon } from "./KanbanIcon";
import { listMirrorBoardsAction, listMirrorColumnsAction, mirrorCardAction } from "@/lib/modules/kanban/actions";

export type MirrorPickerResult = { mirrorId: string; boardId: string; boardName: string; cardNo: number | null };

export function MirrorPicker({
  systemId,
  boardId,
  cardId,
  onDone,
  onClose,
  onToast,
}: {
  systemId: string;
  /** บอร์ดปัจจุบันของการ์ด — ตัดออกจากรายการเลือก (สะท้อนไปบอร์ดเดิมไม่ได้) */
  boardId: string;
  cardId: string;
  onDone: (result: MirrorPickerResult) => void;
  onClose: () => void;
  onToast: (message: string) => void;
}) {
  const [boards, setBoards] = useState<{ id: string; name: string }[] | null>(null);
  const [boardTarget, setBoardTarget] = useState("");
  const [columns, setColumns] = useState<{ id: string; name: string }[] | null>(null);
  const [columnTarget, setColumnTarget] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    listMirrorBoardsAction({ systemId, boardId }).then((res) => {
      if (cancelled) return;
      if (!res.ok) {
        onToast(res.message);
        setBoards([]);
        return;
      }
      setBoards(res.boards);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- โหลดครั้งเดียวตอนเปิดตัวเลือก
  }, [systemId, boardId]);

  useEffect(() => {
    if (!boardTarget) {
      setColumns(null);
      setColumnTarget("");
      return;
    }
    let cancelled = false;
    listMirrorColumnsAction({ systemId, boardId: boardTarget }).then((res) => {
      if (cancelled) return;
      if (!res.ok) {
        onToast(res.message);
        return;
      }
      setColumns(res.columns);
      setColumnTarget(res.columns[0]?.id ?? "");
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- โหลดคอลัมน์ใหม่เฉพาะตอนเปลี่ยนบอร์ดปลายทาง
  }, [systemId, boardTarget]);

  const submit = () => {
    if (!boardTarget || busy) return;
    setBusy(true);
    mirrorCardAction({ systemId, cardId, toBoardId: boardTarget, toColumnId: columnTarget || undefined }).then((res) => {
      setBusy(false);
      if (!res.ok) {
        onToast(res.message);
        return;
      }
      onDone(res);
    });
  };

  return (
    <div
      data-testid="card-mirror-create"
      className="flex flex-col gap-1.5 rounded-lg border p-2"
      style={{ borderColor: "var(--color-line)", background: "var(--color-surface)" }}
    >
      <div className="flex items-center gap-1.5" style={{ fontSize: 12, fontWeight: 600 }}>
        <KanbanIcon name="swap" size="xs" />
        สะท้อนการ์ดไปบอร์ดอื่น
      </div>
      <select
        aria-label="เลือกบอร์ดปลายทาง"
        value={boardTarget}
        onChange={(e) => setBoardTarget(e.target.value)}
        className="rounded-lg border px-2"
        style={{ height: 30, fontSize: 12.5, borderColor: "var(--color-line)" }}
      >
        <option value="">เลือกบอร์ด…</option>
        {(boards ?? []).map((b) => (
          <option key={b.id} value={b.id}>
            {b.name}
          </option>
        ))}
      </select>
      {boards !== null && boards.length === 0 && (
        <p style={{ fontSize: 11.5, color: "var(--color-muted)" }}>ยังไม่มีบอร์ดอื่นที่คุณแก้ไขได้</p>
      )}
      {boardTarget && (
        <select
          aria-label="เลือกคอลัมน์ปลายทาง"
          value={columnTarget}
          onChange={(e) => setColumnTarget(e.target.value)}
          className="rounded-lg border px-2"
          style={{ height: 30, fontSize: 12.5, borderColor: "var(--color-line)" }}
        >
          {(columns ?? []).map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      )}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={submit}
          disabled={!boardTarget || busy}
          style={{ fontSize: 12, fontWeight: 600, color: !boardTarget || busy ? "var(--color-muted)" : "var(--color-accent)" }}
        >
          สะท้อน
        </button>
        <button type="button" onClick={onClose} style={{ fontSize: 12, color: "var(--color-muted)" }}>
          ยกเลิก
        </button>
      </div>
    </div>
  );
}

export default MirrorPicker;
