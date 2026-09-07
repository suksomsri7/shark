// CardTemplatesSettings.tsx — ตั้งค่าบอร์ด › "เทมเพลตการ์ด" (K2.7 · ไม่มี mockup — ใช้โครงเดียวกับ K2.5/K2.6)
//
// "n / 30" + รายการ (แก้ชื่อ inline + เลื่อนขึ้น/ลง + ลบ) — แพตเทิร์นเดียวกับ `settings/CustomFieldsSettings.tsx` (K2.6)
// 🔴 อยู่ระดับบนสุดของ `components/kanban/` (ไม่ใช่ `settings/` เหมือน K2.5/K2.6) ตามสัญญา oracle K2.7
"use client";

import { useState } from "react";
import { KanbanIcon } from "./KanbanIcon";
import { deleteCardTemplateAction, reorderCardTemplatesAction, updateCardTemplateAction } from "@/lib/modules/kanban/actions";
import type { CardTemplateDto } from "@/lib/modules/kanban/types";
import { KANBAN_LIMITS } from "@/lib/modules/kanban/limits";

export function CardTemplatesSettings({ systemId, boardId, templates }: { systemId: string; boardId: string; templates: CardTemplateDto[] }) {
  const [rows, setRows] = useState(templates);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  // K2.12 (หนี้ K2.7): แก้ "ชื่อการ์ด/รายละเอียด" ของเทมเพลต (สิ่งที่การ์ดใหม่จะได้ไปตอนสร้างจากเทมเพลตนี้)
  // — ต่างจาก `name` (แค่ชื่อเทมเพลตในลิสต์นี้) ก่อนหน้านี้แก้ได้แค่ตอนบันทึกครั้งแรกจากการ์ด
  const [editingTitleId, setEditingTitleId] = useState<string | null>(null);
  const [titleDraft, setTitleDraft] = useState("");
  const [descDraft, setDescDraft] = useState("");

  // เพดาน 30 ต่อบอร์ด (KANBAN_LIMITS.cardTemplatesPerBoard) — เขียนเลข 30 ตรง ๆ ในป้าย "n / 30" ด้านล่าง
  // (แบบเดียวกับ CustomFieldsSettings.tsx §4 ข้อ 2 ของ K2.6 — เปลี่ยนเพดานต้องแก้ 2 จุดนี้คู่กัน)
  void KANBAN_LIMITS.cardTemplatesPerBoard;

  const rename = async (t: CardTemplateDto, name: string) => {
    const trimmed = name.trim();
    setEditingId(null);
    if (!trimmed || trimmed === t.name) return;
    setBusyId(t.id);
    setError(null);
    const res = await updateCardTemplateAction({ systemId, boardId, templateId: t.id, name: trimmed });
    setBusyId(null);
    if (!res.ok) {
      setError(res.message);
      return;
    }
    setRows((prev) => prev.map((r) => (r.id === t.id ? res.template : r)));
  };

  const startEditTitle = (t: CardTemplateDto) => {
    setEditingTitleId(t.id);
    setTitleDraft(t.title);
    setDescDraft("");
  };

  const saveTitle = async (t: CardTemplateDto) => {
    const title = titleDraft.trim();
    setEditingTitleId(null);
    if (!title) return;
    setBusyId(t.id);
    setError(null);
    const res = await updateCardTemplateAction({ systemId, boardId, templateId: t.id, title, description: descDraft });
    setBusyId(null);
    if (!res.ok) {
      setError(res.message);
      return;
    }
    setRows((prev) => prev.map((r) => (r.id === t.id ? res.template : r)));
  };

  const remove = async (t: CardTemplateDto) => {
    setBusyId(t.id);
    setError(null);
    const res = await deleteCardTemplateAction({ systemId, boardId, templateId: t.id });
    setBusyId(null);
    if (!res.ok) {
      setError(res.message);
      return;
    }
    setRows((prev) => prev.filter((r) => r.id !== t.id));
  };

  const move = async (t: CardTemplateDto, direction: -1 | 1) => {
    const idx = rows.findIndex((r) => r.id === t.id);
    const targetIdx = idx + direction;
    if (idx < 0 || targetIdx < 0 || targetIdx >= rows.length) return;
    const next = [...rows];
    [next[idx], next[targetIdx]] = [next[targetIdx]!, next[idx]!];
    setRows(next);
    setError(null);
    const res = await reorderCardTemplatesAction({ systemId, boardId, ids: next.map((r) => r.id) });
    if (!res.ok) {
      setRows(rows); // revert
      setError(res.message);
    }
  };

  return (
    <div data-testid="card-templates-settings" className="card flex flex-col gap-3 p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium">เทมเพลตการ์ด</h2>
        <span data-testid="card-templates-count" style={{ fontSize: 12, color: "var(--color-muted)" }}>
          {rows.length} / 30
        </span>
      </div>
      <p style={{ fontSize: 12, color: "var(--color-muted)" }}>
        บันทึกได้จากเมนู ⋯ ของการ์ด (&ldquo;บันทึกเป็นเทมเพลตการ์ด&rdquo;) — นำมาสร้างการ์ดใหม่ซ้ำได้จากปุ่ม &ldquo;จากเทมเพลต ▾&rdquo; ในทุกคอลัมน์
      </p>

      {error && (
        <p data-testid="card-templates-settings-error" style={{ fontSize: 12, color: "var(--color-danger)" }}>
          {error}
        </p>
      )}

      {rows.length === 0 ? (
        <p style={{ fontSize: 12.5, color: "var(--color-muted)" }}>บอร์ดนี้ยังไม่มีเทมเพลตการ์ด — เปิดการ์ดที่มีอยู่แล้วบันทึกเป็นเทมเพลตได้จากเมนู ⋯</p>
      ) : (
        <ul className="flex flex-col divide-y" style={{ borderTop: "1px solid var(--color-line)" }}>
          {rows.map((t, i) => (
            <li key={t.id} data-testid="card-template-settings-row" className="flex items-center gap-3 py-2.5">
              <div className="flex min-w-0 flex-1 flex-col">
                {editingId === t.id ? (
                  <input
                    autoFocus
                    defaultValue={t.name}
                    data-testid="card-template-name-input"
                    className="input"
                    style={{ fontSize: 13.5, maxWidth: 240 }}
                    onBlur={(e) => rename(t, e.currentTarget.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") e.currentTarget.blur();
                      if (e.key === "Escape") setEditingId(null);
                    }}
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => setEditingId(t.id)}
                    className="truncate text-left"
                    title="คลิกเพื่อแก้ชื่อ"
                    style={{ fontSize: 13.5, fontWeight: 600, cursor: "text" }}
                  >
                    {t.name}
                  </button>
                )}
                {editingTitleId === t.id ? (
                  <div className="flex flex-col gap-1.5" style={{ maxWidth: 320 }}>
                    <input
                      autoFocus
                      value={titleDraft}
                      data-testid="template-edit-title-input"
                      className="input"
                      placeholder="ชื่อการ์ด"
                      style={{ fontSize: 12.5 }}
                      onChange={(e) => setTitleDraft(e.target.value)}
                      onKeyDown={(e) => e.key === "Escape" && setEditingTitleId(null)}
                    />
                    <textarea
                      value={descDraft}
                      data-testid="template-edit-description-input"
                      className="input"
                      placeholder="รายละเอียด (ไม่บังคับ)"
                      rows={2}
                      style={{ fontSize: 12.5 }}
                      onChange={(e) => setDescDraft(e.target.value)}
                    />
                    <div className="flex items-center gap-2">
                      <button type="button" onClick={() => saveTitle(t)} className="btn btn-primary text-xs">
                        บันทึก
                      </button>
                      <button type="button" onClick={() => setEditingTitleId(null)} className="btn btn-ghost text-xs">
                        ยกเลิก
                      </button>
                    </div>
                  </div>
                ) : (
                  <span className="flex items-center gap-1.5 truncate" style={{ fontSize: 12, color: "var(--color-muted)" }}>
                    {t.title} · {t.labelCount} ป้าย · {t.checklistItemCount} รายการเช็คลิสต์
                    <button
                      type="button"
                      data-testid="template-edit-title"
                      aria-label={`แก้ชื่อการ์ด/รายละเอียดของเทมเพลต ${t.name}`}
                      onClick={() => startEditTitle(t)}
                      style={{ color: "var(--color-accent)" }}
                    >
                      <KanbanIcon name="edit" size="xs" />
                    </button>
                  </span>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-0.5">
                <button type="button" disabled={i === 0} onClick={() => move(t, -1)} aria-label="เลื่อนขึ้น" style={{ color: "var(--color-muted)", width: 16 }}>
                  ↑
                </button>
                <button type="button" disabled={i === rows.length - 1} onClick={() => move(t, 1)} aria-label="เลื่อนลง" style={{ color: "var(--color-muted)", width: 16 }}>
                  ↓
                </button>
                <button
                  type="button"
                  disabled={busyId === t.id}
                  onClick={() => remove(t)}
                  aria-label={`ลบเทมเพลต ${t.name}`}
                  style={{ color: "var(--color-danger)" }}
                >
                  <KanbanIcon name="trash" size="xs" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default CardTemplatesSettings;
