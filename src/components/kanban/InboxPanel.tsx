// InboxPanel.tsx — กล่องงานเข้าส่วนตัว (K2.8 · แบบ `ledger/design-kanban/06-my-tasks.png` ฝั่งซ้าย)
//
// จดเร็ว (Enter) · รายการพร้อมชิปที่มา + เวลา + ป้าย "AI ตั้งชื่อ + สรุปให้แล้ว" (เมื่อมี note) ·
// ปุ่ม "ส่งเข้าบอร์ด" (popover เลือกบอร์ด→คอลัมน์→กำหนดส่งไม่บังคับ) + "ไม่เอาแล้ว"
//
// 🔴 client component — import เฉพาะ actions (`"use server"`) + type จาก `types.ts` (บริสุทธิ์)
//    ห้าม import จาก `inbox.ts` ตรง ๆ (ไฟล์นั้นแตะ prisma → ลาก `db.ts` → `pg` เข้าบันเดิลฝั่ง browser)
"use client";

import { useCallback, useState } from "react";
import { KanbanIcon } from "./KanbanIcon";
import { dismissInboxAction, moveInboxToBoardAction, quickAddInboxAction } from "@/lib/modules/kanban/actions";
import type { InboxItemDto } from "@/lib/modules/kanban/types";

const BKK_OFFSET_MS = 7 * 60 * 60 * 1000; // Asia/Bangkok = UTC+7 ตายตัว ไม่มี DST — คำนวณเองล้วน (ห้าม toLocale*)
const pad2 = (n: number) => (n < 10 ? `0${n}` : String(n));

/** เวลาแบบย่อของรายการ — < 1 ชม. = "n นาทีที่แล้ว" · < 24 ชม. = "n ชม.ที่แล้ว" · เกิน = เวลาไทย HH:MM */
function itemTimeLabel(iso: string, nowMs: number): string {
  const t = Date.parse(iso);
  const diffMin = Math.max(0, Math.round((nowMs - t) / 60000));
  if (diffMin < 1) return "เมื่อสักครู่";
  if (diffMin < 60) return `${diffMin} นาทีที่แล้ว`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr} ชม.ที่แล้ว`;
  const d = new Date(t + BKK_OFFSET_MS);
  return `${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}`;
}

export type InboxBoardOption = { id: string; name: string; columns: { id: string; name: string }[] };

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="inline-flex items-center font-medium"
      style={{
        height: 19,
        padding: "0 7px",
        borderRadius: 5,
        fontSize: 10.5,
        color: "var(--color-muted)",
        border: "1px solid var(--color-line)",
        background: "var(--color-surface-2)",
      }}
    >
      {children}
    </span>
  );
}

function MoveToBoardPopover({
  systemId,
  item,
  boards,
  onClose,
  onMoved,
}: {
  systemId: string;
  item: InboxItemDto;
  boards: InboxBoardOption[];
  onClose: () => void;
  onMoved: () => void;
}) {
  const [boardId, setBoardId] = useState(boards[0]?.id ?? "");
  const board = boards.find((b) => b.id === boardId) ?? boards[0];
  const [columnId, setColumnId] = useState(board?.columns[0]?.id ?? "");
  const [dueAt, setDueAt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const changeBoard = useCallback(
    (id: string) => {
      setBoardId(id);
      const b = boards.find((x) => x.id === id);
      setColumnId(b?.columns[0]?.id ?? "");
    },
    [boards],
  );

  const submit = useCallback(async () => {
    if (!boardId || !columnId || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await moveInboxToBoardAction({
        systemId,
        itemId: item.id,
        boardId,
        columnId,
        dueAt: dueAt || undefined,
      });
      if (res.ok) onMoved();
      else setError(res.message);
    } finally {
      setBusy(false);
    }
  }, [systemId, item.id, boardId, columnId, dueAt, busy, onMoved]);

  if (boards.length === 0) {
    return (
      <div data-testid="inbox-move-popover" className="rounded-lg border p-3" style={{ borderColor: "var(--color-line)", fontSize: 12.5 }}>
        <p style={{ color: "var(--color-muted)" }}>ยังไม่มีบอร์ดที่คุณแก้ไขได้ — สร้างหรือขอเข้าบอร์ดก่อน</p>
        <button type="button" onClick={onClose} className="btn btn-ghost mt-2 text-xs">
          ปิด
        </button>
      </div>
    );
  }

  return (
    <div data-testid="inbox-move-popover" className="flex flex-col gap-2 rounded-lg border p-3" style={{ borderColor: "var(--color-line)" }}>
      <label className="flex flex-col gap-1" style={{ fontSize: 11.5 }}>
        บอร์ด
        <select
          data-testid="inbox-move-board"
          value={boardId}
          onChange={(e) => changeBoard(e.target.value)}
          className="rounded-md border px-2 py-1.5 text-sm"
          style={{ borderColor: "var(--color-line)" }}
        >
          {boards.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1" style={{ fontSize: 11.5 }}>
        คอลัมน์
        <select
          data-testid="inbox-move-column"
          value={columnId}
          onChange={(e) => setColumnId(e.target.value)}
          className="rounded-md border px-2 py-1.5 text-sm"
          style={{ borderColor: "var(--color-line)" }}
        >
          {(board?.columns ?? []).map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1" style={{ fontSize: 11.5 }}>
        กำหนดส่ง (ไม่บังคับ)
        <input
          data-testid="inbox-move-due"
          type="date"
          value={dueAt}
          onChange={(e) => setDueAt(e.target.value)}
          className="rounded-md border px-2 py-1.5 text-sm"
          style={{ borderColor: "var(--color-line)" }}
        />
      </label>
      {error && (
        <p style={{ fontSize: 11.5, color: "var(--color-danger)" }}>{error}</p>
      )}
      <div className="flex gap-2">
        <button
          type="button"
          data-testid="inbox-move-confirm"
          disabled={busy || !columnId}
          onClick={submit}
          className="btn btn-primary flex-1 text-xs disabled:opacity-50"
        >
          ส่งเข้าบอร์ด
        </button>
        <button type="button" data-testid="inbox-move-cancel" onClick={onClose} className="btn btn-ghost text-xs">
          ยกเลิก
        </button>
      </div>
    </div>
  );
}

export function InboxPanel({
  systemId,
  items: initialItems,
  boards,
  nowMs,
}: {
  systemId: string;
  items: InboxItemDto[];
  boards: InboxBoardOption[];
  nowMs: number;
}) {
  const [items, setItems] = useState(initialItems);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const submitQuickAdd = useCallback(async () => {
    const title = draft.trim();
    if (!title || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await quickAddInboxAction({ systemId, title });
      if (res.ok) {
        setItems((prev) => [res.item, ...prev]);
        setDraft("");
      } else {
        setError(res.message);
      }
    } finally {
      setBusy(false);
    }
  }, [draft, busy, systemId]);

  const dismiss = useCallback(
    async (id: string) => {
      const prev = items;
      setItems((cur) => cur.filter((i) => i.id !== id));
      const res = await dismissInboxAction({ systemId, itemId: id }).catch(() => ({ ok: false as const, message: "" }));
      if (!res.ok) setItems(prev);
    },
    [items, systemId],
  );

  return (
    <div id="inbox" data-testid="inbox-panel" className="card flex flex-col gap-3" style={{ padding: 15 }}>
      <div className="flex items-center gap-2">
        <KanbanIcon name="in" size="sm" />
        <h2 style={{ fontSize: 13.5, fontWeight: 700 }}>กล่องงานเข้าของฉัน</h2>
        <span
          className="grid place-items-center rounded-md"
          style={{ minWidth: 18, height: 18, padding: "0 5px", fontSize: 10.5, fontWeight: 700, background: "var(--color-danger)", color: "var(--color-surface)" }}
        >
          {items.length}
        </span>
      </div>
      <p style={{ fontSize: 11.5, color: "var(--color-muted)" }}>ที่พักงานส่วนตัว ยังไม่อยู่บอร์ดไหน — เคลียร์ให้ว่างทุกวัน</p>

      <input
        id="inbox-quick-add-input"
        data-testid="inbox-quick-add"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.nativeEvent.isComposing) {
            e.preventDefault();
            void submitQuickAdd();
          }
        }}
        placeholder="พิมพ์แล้วกด Enter เพื่อจดงานใหม่…"
        disabled={busy}
        className="w-full rounded-lg border px-3 py-2 text-sm disabled:opacity-60"
        style={{ borderColor: "var(--color-line)" }}
      />
      {error && <p style={{ fontSize: 11.5, color: "var(--color-danger)" }}>{error}</p>}

      {items.length === 0 ? (
        <p style={{ fontSize: 13, color: "var(--color-muted)", padding: "8px 2px" }}>
          กล่องงานเข้าว่างแล้ว — จดงานใหม่ได้ที่ช่องด้านบน
        </p>
      ) : (
        <ul className="flex flex-col">
          {items.map((item) => (
            <li key={item.id} data-testid="inbox-item" className="flex flex-col gap-1.5 border-t py-2.5 first:border-t-0" style={{ borderColor: "var(--color-line)" }}>
              <div className="flex items-start justify-between gap-2">
                <span style={{ fontSize: 13, fontWeight: 500 }}>{item.title}</span>
                <span style={{ fontSize: 10.5, color: "var(--color-muted)", whiteSpace: "nowrap" }}>{itemTimeLabel(item.createdAt, nowMs)}</span>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {/* server ส่ง sourceLabel มาให้แล้ว (inbox.ts#SOURCE_LABEL) — "จดไว้เอง" กันไว้เผื่อค่าว่าง (MANUAL ปริยาย) */}
                <Chip>{item.sourceLabel || "จดไว้เอง"}</Chip>
                {item.note && <Chip>AI ตั้งชื่อ + สรุปให้แล้ว</Chip>}
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  data-testid="inbox-move-to-board"
                  onClick={() => setOpenId((cur) => (cur === item.id ? null : item.id))}
                  className="btn btn-primary text-xs"
                >
                  ส่งเข้าบอร์ด
                </button>
                <button type="button" data-testid="inbox-dismiss" onClick={() => dismiss(item.id)} className="btn btn-ghost text-xs">
                  ไม่เอาแล้ว
                </button>
              </div>
              {openId === item.id && (
                <MoveToBoardPopover
                  systemId={systemId}
                  item={item}
                  boards={boards}
                  onClose={() => setOpenId(null)}
                  onMoved={() => {
                    setItems((prev) => prev.filter((i) => i.id !== item.id));
                    setOpenId(null);
                  }}
                />
              )}
            </li>
          ))}
        </ul>
      )}

      <p style={{ fontSize: 10.5, color: "var(--color-muted)" }}>
        ลากการ์ดไปวางบนบอร์ด หรือกด &quot;ส่งเข้าบอร์ด&quot; เพื่อจัดที่อยู่ให้งาน
      </p>
    </div>
  );
}

export default InboxPanel;
