// Checklist.tsx — เช็คลิสต์ในหลังการ์ด (K1.7) · แบบ: `ledger/design-kanban/03-card-back.png` บล็อก "ขั้นตอนงาน"
// หลายชุดต่อการ์ด · แต่ละชุด: หัวข้อ (แก้ในที่) + แถบความคืบหน้า n/m + "ซ่อนรายการที่ทำแล้ว" + รายการ
// แต่ละรายการ: ติ๊ก · ข้อความ (แก้ในที่) · ชิปกำหนดวัน · avatar ผู้รับมอบหมาย · ย้ายลำดับ (↑↓) · ลบ
//
// ทุกการแก้ไข = optimistic ก่อน (แปะ state ในนี้ทันที) แล้วค่อยยิง action จริง — ผิดพลาด → revert + toast
// (แพตเทิร์นเดียวกับ CardBack.tsx) · ผลลัพธ์จาก action คือเช็คลิสต์ "ทั้งชุด" ของการ์ด ไม่ใช่ patch ย่อย
// เพราะชุดข้อมูลเล็ก (≤50 รายการ/การ์ด) — อ่านใหม่ทั้งหมดปลอดภัยกว่าประกอบเองฝั่ง client
"use client";

import { useCallback, useState } from "react";
import { KanbanIcon } from "./KanbanIcon";
import { Avatar, formatCardDate } from "./Card";
import {
  addChecklistItemAction,
  createChecklistAction,
  deleteChecklistAction,
  deleteChecklistItemAction,
  editChecklistItemAction,
  moveChecklistItemAction,
  renameChecklistAction,
  toggleChecklistItemAction,
} from "@/lib/modules/kanban/actions";
import type { BoardPersonDto, KanbanChecklistDto, KanbanChecklistItemDto } from "@/lib/modules/kanban/types";

export type ChecklistProps = {
  systemId: string;
  boardId: string;
  cardId: string;
  editable: boolean;
  checklists: KanbanChecklistDto[];
  members: BoardPersonDto[];
  nowMs: number;
  onChange: (checklists: KanbanChecklistDto[]) => void;
  onToast: (message: string) => void;
};

function sumProgress(checklists: KanbanChecklistDto[]): { done: number; total: number } {
  return checklists.reduce(
    (acc, c) => ({ done: acc.done + c.progress.done, total: acc.total + c.progress.total }),
    { done: 0, total: 0 },
  );
}

/** เรียกจาก CardBack เพื่อรวมความคืบหน้าทุกชุด → ตราบนตัวการ์ด (checklistDone/checklistTotal) */
export function checklistBadgeOf(checklists: KanbanChecklistDto[]): { done: number; total: number } {
  return sumProgress(checklists);
}

export function Checklist({ systemId, boardId, cardId, editable, checklists, members, nowMs, onChange, onToast }: ChecklistProps) {
  const [hideDone, setHideDone] = useState(false);

  const withRollback = useCallback(
    (before: KanbanChecklistDto[], optimistic: KanbanChecklistDto[], run: () => Promise<{ ok: true; checklists: KanbanChecklistDto[] } | { ok: false; message: string }>, fallbackMessage: string) => {
      onChange(optimistic);
      run().then((res) => {
        if (res.ok) {
          onChange(res.checklists);
          return;
        }
        onChange(before);
        onToast(res.message || fallbackMessage);
      });
    },
    [onChange, onToast],
  );

  const addChecklist = useCallback(() => {
    if (typeof window === "undefined") return;
    const title = window.prompt("ชื่อเช็คลิสต์", "ขั้นตอนงาน");
    if (title === null) return;
    createChecklistAction({ systemId, boardId, cardId, title }).then((res) => {
      if (!res.ok) {
        onToast(res.message || "สร้างเช็คลิสต์ไม่สำเร็จ");
        return;
      }
      onChange(res.checklists);
    });
  }, [systemId, boardId, cardId, onChange, onToast]);

  if (checklists.length === 0 && !editable) return null;

  return (
    <div className="flex flex-col gap-4" data-testid="checklist">
      {checklists.map((checklist) => (
        <ChecklistBlock
          key={checklist.id}
          systemId={systemId}
          boardId={boardId}
          cardId={cardId}
          editable={editable}
          checklist={checklist}
          allChecklists={checklists}
          members={members}
          nowMs={nowMs}
          hideDone={hideDone}
          onHideDoneChange={setHideDone}
          onChange={onChange}
          onToast={onToast}
          withRollback={withRollback}
        />
      ))}
      {editable && (
        <button
          type="button"
          onClick={addChecklist}
          className="inline-flex items-center gap-1.5 self-start rounded-lg border"
          style={{ height: 27, padding: "0 9px", fontSize: 12, borderColor: "var(--color-line)", color: "var(--color-ink-soft)", background: "var(--color-surface)" }}
        >
          <KanbanIcon name="plus" size="xs" />
          เพิ่มเช็คลิสต์
        </button>
      )}
    </div>
  );
}

// ───────────────────────── ชุดเดียว ─────────────────────────

function ChecklistBlock({
  systemId,
  boardId,
  cardId,
  editable,
  checklist,
  allChecklists,
  members,
  nowMs,
  hideDone,
  onHideDoneChange,
  onChange,
  onToast,
  withRollback,
}: {
  systemId: string;
  boardId: string;
  cardId: string;
  editable: boolean;
  checklist: KanbanChecklistDto;
  allChecklists: KanbanChecklistDto[];
  members: BoardPersonDto[];
  nowMs: number;
  hideDone: boolean;
  onHideDoneChange: (v: boolean) => void;
  onChange: (checklists: KanbanChecklistDto[]) => void;
  onToast: (message: string) => void;
  withRollback: (
    before: KanbanChecklistDto[],
    optimistic: KanbanChecklistDto[],
    run: () => Promise<{ ok: true; checklists: KanbanChecklistDto[] } | { ok: false; message: string }>,
    fallbackMessage: string,
  ) => void;
}) {
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(checklist.title);
  const [newText, setNewText] = useState("");
  const [assigneeOpenFor, setAssigneeOpenFor] = useState<string | null>(null);

  const pct = checklist.progress.total > 0 ? Math.round((checklist.progress.done / checklist.progress.total) * 100) : 0;
  const visibleItems = hideDone ? checklist.items.filter((i) => !i.done) : checklist.items;

  const patchOther = useCallback(
    (updated: KanbanChecklistDto): KanbanChecklistDto[] => allChecklists.map((c) => (c.id === checklist.id ? updated : c)),
    [allChecklists, checklist.id],
  );

  const saveTitle = useCallback(() => {
    const next = titleDraft.trim();
    setEditingTitle(false);
    if (!next || next === checklist.title) return;
    withRollback(
      allChecklists,
      patchOther({ ...checklist, title: next }),
      () => renameChecklistAction({ systemId, boardId, cardId, checklistId: checklist.id, title: next }),
      "เปลี่ยนชื่อเช็คลิสต์ไม่สำเร็จ",
    );
  }, [titleDraft, checklist, allChecklists, patchOther, withRollback, systemId, boardId, cardId]);

  const removeChecklist = useCallback(() => {
    if (typeof window !== "undefined" && !window.confirm(`ลบเช็คลิสต์ "${checklist.title}" ทั้งชุด?`)) return;
    withRollback(
      allChecklists,
      allChecklists.filter((c) => c.id !== checklist.id),
      () => deleteChecklistAction({ systemId, boardId, cardId, checklistId: checklist.id }),
      "ลบเช็คลิสต์ไม่สำเร็จ",
    );
  }, [checklist, allChecklists, withRollback, systemId, boardId, cardId]);

  const toggle = useCallback(
    (item: KanbanChecklistItemDto, done: boolean) => {
      const items = checklist.items.map((i) => (i.id === item.id ? { ...i, done, doneAt: done ? new Date().toISOString() : null } : i));
      const updated = { ...checklist, items, progress: { done: items.filter((i) => i.done).length, total: items.length } };
      withRollback(
        allChecklists,
        patchOther(updated),
        () => toggleChecklistItemAction({ systemId, boardId, cardId, itemId: item.id, done }),
        "ติ๊กรายการไม่สำเร็จ",
      );
    },
    [checklist, allChecklists, patchOther, withRollback, systemId, boardId, cardId],
  );

  const addItem = useCallback(() => {
    const text = newText.trim();
    if (!text) return;
    setNewText("");
    withRollback(
      allChecklists,
      allChecklists, // ไม่รู้ id/position จริงจนกว่า server ตอบ — โชว์ของเดิมไปก่อนแล้วรอผลจริงมาแทน
      () => addChecklistItemAction({ systemId, boardId, cardId, checklistId: checklist.id, text }),
      "เพิ่มรายการไม่สำเร็จ",
    );
  }, [newText, checklist.id, allChecklists, withRollback, systemId, boardId, cardId]);

  const editText = useCallback(
    (item: KanbanChecklistItemDto, text: string) => {
      const value = text.trim();
      if (!value || value === item.text) return;
      const items = checklist.items.map((i) => (i.id === item.id ? { ...i, text: value } : i));
      withRollback(
        allChecklists,
        patchOther({ ...checklist, items }),
        () => editChecklistItemAction({ systemId, boardId, cardId, itemId: item.id, text: value }),
        "แก้รายการไม่สำเร็จ",
      );
    },
    [checklist, allChecklists, patchOther, withRollback, systemId, boardId, cardId],
  );

  const setAssignee = useCallback(
    (item: KanbanChecklistItemDto, userId: string | null) => {
      setAssigneeOpenFor(null);
      const items = checklist.items.map((i) => (i.id === item.id ? { ...i, assigneeUserId: userId } : i));
      withRollback(
        allChecklists,
        patchOther({ ...checklist, items }),
        () => editChecklistItemAction({ systemId, boardId, cardId, itemId: item.id, assigneeUserId: userId }),
        "มอบหมายรายการไม่สำเร็จ",
      );
    },
    [checklist, allChecklists, patchOther, withRollback, systemId, boardId, cardId],
  );

  const setDue = useCallback(
    (item: KanbanChecklistItemDto, dueAt: string | null) => {
      const items = checklist.items.map((i) => (i.id === item.id ? { ...i, dueAt } : i));
      withRollback(
        allChecklists,
        patchOther({ ...checklist, items }),
        () => editChecklistItemAction({ systemId, boardId, cardId, itemId: item.id, dueAt }),
        "ตั้งกำหนดวันไม่สำเร็จ",
      );
    },
    [checklist, allChecklists, patchOther, withRollback, systemId, boardId, cardId],
  );

  const removeItem = useCallback(
    (item: KanbanChecklistItemDto) => {
      const items = checklist.items.filter((i) => i.id !== item.id);
      withRollback(
        allChecklists,
        patchOther({ ...checklist, items, progress: { done: items.filter((i) => i.done).length, total: items.length } }),
        () => deleteChecklistItemAction({ systemId, boardId, cardId, itemId: item.id }),
        "ลบรายการไม่สำเร็จ",
      );
    },
    [checklist, allChecklists, patchOther, withRollback, systemId, boardId, cardId],
  );

  const moveItem = useCallback(
    (item: KanbanChecklistItemDto, direction: -1 | 1) => {
      const idx = checklist.items.findIndex((i) => i.id === item.id);
      const targetIdx = idx + direction;
      const target = checklist.items[targetIdx];
      if (!target) return;
      const items = [...checklist.items];
      items[idx] = target;
      items[targetIdx] = item;
      withRollback(
        allChecklists,
        patchOther({ ...checklist, items }),
        () =>
          direction === -1
            ? moveChecklistItemAction({ systemId, boardId, cardId, itemId: item.id, beforeItemId: target.id })
            : moveChecklistItemAction({ systemId, boardId, cardId, itemId: item.id, afterItemId: target.id }),
        "จัดลำดับรายการไม่สำเร็จ",
      );
    },
    [checklist, allChecklists, patchOther, withRollback, systemId, boardId, cardId],
  );

  return (
    <div data-testid="checklist" className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <KanbanIcon name="cklist" size="sm" className="text-[color:var(--color-muted)]" />
        {editingTitle ? (
          <input
            autoFocus
            value={titleDraft}
            onChange={(e) => setTitleDraft(e.target.value)}
            onBlur={saveTitle}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                saveTitle();
              }
              if (e.key === "Escape") {
                e.preventDefault();
                setEditingTitle(false);
                setTitleDraft(checklist.title);
              }
            }}
            className="rounded border px-1.5 py-0.5"
            style={{ fontSize: 13, fontWeight: 700, borderColor: "var(--color-accent)" }}
          />
        ) : (
          <span
            onClick={() => editable && setEditingTitle(true)}
            style={{ fontSize: 13, fontWeight: 700, cursor: editable ? "text" : "default" }}
          >
            {checklist.title} {checklist.progress.total > 0 && `${checklist.progress.done}/${checklist.progress.total}`}
          </span>
        )}
        <span className="flex-1" />
        <button
          type="button"
          onClick={() => onHideDoneChange(!hideDone)}
          style={{ fontSize: 11.5, color: "var(--color-muted)", textDecoration: "underline" }}
        >
          {hideDone ? "แสดงรายการที่ทำแล้ว" : "ซ่อนรายการที่ทำแล้ว"}
        </button>
        {editable && (
          <button type="button" onClick={removeChecklist} aria-label="ลบเช็คลิสต์" style={{ color: "var(--color-muted)" }}>
            <KanbanIcon name="trash" size="xs" />
          </button>
        )}
      </div>

      {checklist.progress.total > 0 && (
        <div
          data-testid="checklist-progress"
          className="h-1.5 w-full overflow-hidden rounded-full"
          style={{ background: "var(--color-surface-2)" }}
        >
          <div
            className="h-full rounded-full"
            style={{ width: `${pct}%`, background: pct === 100 ? "var(--color-tag-green)" : "var(--color-accent)" }}
          />
        </div>
      )}

      <div className="flex flex-col gap-1">
        {visibleItems.map((item, idx) => {
          const overdue = !item.done && item.dueAt && Date.parse(item.dueAt) < nowMs;
          const assignee = members.find((m) => m.userId === item.assigneeUserId);
          return (
            <div key={item.id} data-testid="checklist-item" className="group flex items-center gap-2 rounded-lg px-1 py-1">
              <button
                type="button"
                role="checkbox"
                aria-checked={item.done}
                aria-label={item.done ? "ทำเสร็จแล้ว" : "ยังไม่เสร็จ"}
                disabled={!editable}
                onClick={() => toggle(item, !item.done)}
                className="grid shrink-0 place-items-center"
                style={{
                  width: 16,
                  height: 16,
                  borderRadius: 4,
                  border: `1.5px solid ${item.done ? "var(--color-tag-green)" : "var(--color-line)"}`,
                  background: item.done ? "var(--color-tag-green)" : "transparent",
                }}
              >
                {item.done && <KanbanIcon name="check" size="xs" className="text-white" />}
              </button>
              <ItemText item={item} editable={editable} onSave={(text) => editText(item, text)} />
              <ItemDueChip item={item} editable={editable} overdue={Boolean(overdue)} onChange={(dueAt) => setDue(item, dueAt)} />
              <div className="relative shrink-0">
                <button
                  type="button"
                  disabled={!editable}
                  aria-label="มอบหมายรายการ"
                  onClick={() => setAssigneeOpenFor((v) => (v === item.id ? null : item.id))}
                >
                  {assignee ? <Avatar name={assignee.name} size={20} /> : editable && (
                    <span
                      className="grid place-items-center"
                      style={{ width: 20, height: 20, borderRadius: 6, border: "1px dashed var(--color-line)", color: "var(--color-muted)" }}
                    >
                      <KanbanIcon name="users" size="xs" />
                    </span>
                  )}
                </button>
                {assigneeOpenFor === item.id && editable && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setAssigneeOpenFor(null)} />
                    <div
                      className="absolute right-0 top-full z-50 mt-1 flex max-h-56 w-48 flex-col gap-0.5 overflow-y-auto rounded-xl border p-1.5"
                      style={{ background: "var(--color-surface)", borderColor: "var(--color-line)", boxShadow: "0 14px 34px rgba(10,10,10,.14)" }}
                    >
                      <button
                        type="button"
                        onClick={() => setAssignee(item, null)}
                        className="rounded-lg px-2 py-1.5 text-left"
                        style={{ fontSize: 12.5, color: "var(--color-muted)" }}
                      >
                        ไม่มีผู้รับมอบหมาย
                      </button>
                      {members.map((m) => (
                        <button
                          key={m.userId}
                          type="button"
                          onClick={() => setAssignee(item, m.userId)}
                          className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-left"
                          style={{ fontSize: 12.5, background: item.assigneeUserId === m.userId ? "var(--color-surface-2)" : "transparent" }}
                        >
                          <Avatar name={m.name} size={18} /> {m.name}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
              {editable && (
                <div className="flex shrink-0 items-center opacity-0 group-hover:opacity-100">
                  {/* ลำดับอิงรายการจริง (ไม่ใช่รายการที่กรองแล้ว) — ปิดปุ่มเมื่อซ่อนรายการที่ทำแล้วอยู่
                      กันสับสน: เพื่อนบ้านจริงของรายการอาจถูกซ่อนอยู่ ทำให้ "ย้าย" แล้วดูเหมือนไม่ขยับ */}
                  <button
                    type="button"
                    disabled={hideDone || idx === 0}
                    onClick={() => moveItem(item, -1)}
                    aria-label="เลื่อนขึ้น"
                    style={{ color: "var(--color-muted)", width: 16 }}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    disabled={hideDone || idx === visibleItems.length - 1}
                    onClick={() => moveItem(item, 1)}
                    aria-label="เลื่อนลง"
                    style={{ color: "var(--color-muted)", width: 16 }}
                  >
                    ↓
                  </button>
                  <button type="button" onClick={() => removeItem(item)} aria-label="ลบรายการ" style={{ color: "var(--color-muted)" }}>
                    <KanbanIcon name="x" size="xs" />
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {editable && (
        <input
          value={newText}
          onChange={(e) => setNewText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addItem();
            }
          }}
          placeholder="+ เพิ่มรายการ"
          className="rounded-lg border px-2 py-1.5"
          style={{ fontSize: 12.5, borderColor: "var(--color-line)" }}
        />
      )}

      <p style={{ fontSize: 11, color: "var(--color-muted)" }}>
        แต่ละรายการมอบหมายได้ + กำหนดวันได้ · รายการที่ถึงกำหนดจะโผล่ใน &ldquo;งานของฉัน&rdquo;
      </p>
    </div>
  );
}

function ItemText({ item, editable, onSave }: { item: KanbanChecklistItemDto; editable: boolean; onSave: (text: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(item.text);

  if (editing) {
    return (
      <input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          setEditing(false);
          onSave(draft);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            setEditing(false);
            onSave(draft);
          }
          if (e.key === "Escape") {
            e.preventDefault();
            setEditing(false);
            setDraft(item.text);
          }
        }}
        className="min-w-0 flex-1 rounded border px-1.5 py-0.5"
        style={{ fontSize: 12.5, borderColor: "var(--color-accent)" }}
      />
    );
  }
  return (
    <span
      onClick={() => {
        if (!editable) return;
        setDraft(item.text);
        setEditing(true);
      }}
      className="min-w-0 flex-1"
      style={{
        fontSize: 12.5,
        cursor: editable ? "text" : "default",
        textDecoration: item.done ? "line-through" : "none",
        color: item.done ? "var(--color-muted)" : "var(--color-ink-soft)",
      }}
    >
      {item.text}
    </span>
  );
}

/** ชิปกำหนดวันของรายการ — ไม่มีวัน + แก้ได้ = ไอคอนนาฬิกาจาง ๆ · มีวันแล้ว = ชิปคลิกแก้/ล้างได้ */
function ItemDueChip({
  item,
  editable,
  overdue,
  onChange,
}: {
  item: KanbanChecklistItemDto;
  editable: boolean;
  overdue: boolean;
  onChange: (dueAt: string | null) => void;
}) {
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <input
        type="date"
        autoFocus
        aria-label="ตั้งกำหนดวันของรายการ"
        defaultValue={item.dueAt ? item.dueAt.slice(0, 10) : ""}
        onBlur={(e) => {
          setEditing(false);
          onChange(e.target.value ? new Date(`${e.target.value}T00:00:00Z`).toISOString() : null);
        }}
        className="shrink-0 rounded border px-1 py-0.5"
        style={{ fontSize: 11, borderColor: "var(--color-line)" }}
      />
    );
  }

  if (item.dueAt) {
    return (
      <button
        type="button"
        disabled={!editable}
        onClick={() => setEditing(true)}
        title={editable ? "คลิกเพื่อแก้กำหนดวัน" : undefined}
        className="inline-flex shrink-0 items-center whitespace-nowrap font-semibold"
        style={{
          height: 18,
          padding: "0 6px",
          borderRadius: 5,
          fontSize: 10.5,
          border: `1px solid ${overdue ? "var(--color-tag-red)" : "var(--color-tag-amber)"}`,
          color: overdue ? "var(--color-tag-red)" : "var(--color-tag-amber)",
        }}
      >
        {formatCardDate(item.dueAt)}
      </button>
    );
  }

  if (!editable) return null;
  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      aria-label="ตั้งกำหนดวัน"
      className="shrink-0 opacity-0 group-hover:opacity-100"
      style={{ color: "var(--color-muted)" }}
    >
      <KanbanIcon name="clock" size="xs" />
    </button>
  );
}

export default Checklist;
