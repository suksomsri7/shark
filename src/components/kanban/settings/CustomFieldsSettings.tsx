// CustomFieldsSettings.tsx — ตั้งค่าบอร์ด › "ฟิลด์กำหนดเอง" (K2.6 · ภาพ 10)
//
// "n / 20" + รายการ (ชื่อ + ชนิด/ตัวเลือก + สลับแสดงบนการ์ด + เลื่อนขึ้น/ลง + ลบ) + ฟอร์มเพิ่มฟิลด์ใหม่
// จัดลำดับด้วยปุ่ม "เลื่อนขึ้น/ลง" (แบบเดียวกับ `Checklist.tsx` — ไม่ใช้ HTML5 drag) ไม่ใช่ลากเมาส์จริง
"use client";

import { useState } from "react";
import { KanbanIcon } from "../KanbanIcon";
import { createFieldAction, deleteFieldAction, reorderFieldsAction, updateFieldAction } from "@/lib/modules/kanban/actions";
import type { CustomFieldDto, KanbanCustomFieldType } from "@/lib/modules/kanban/types";
import { KANBAN_LIMITS } from "@/lib/modules/kanban/limits";

const TYPE_LABEL: Record<KanbanCustomFieldType, string> = {
  TEXT: "ข้อความ",
  NUMBER: "ตัวเลข",
  DATE: "วันที่",
  CHECKBOX: "ถูก/ไม่ถูก",
  SELECT: "ตัวเลือก",
};

function describeField(field: CustomFieldDto): string {
  if (field.type === "NUMBER") return field.options.unit ? `ตัวเลข (${field.options.unit})` : "ตัวเลข";
  if (field.type === "SELECT") return `ตัวเลือก: ${(field.options.choices ?? []).join(" / ")}`;
  return TYPE_LABEL[field.type];
}

function Toggle({ checked, onChange, disabled, label }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors"
      style={{ background: checked ? "var(--color-ink)" : "var(--color-line)" }}
    >
      <span
        className="inline-block h-4 w-4 rounded-full transition-transform"
        style={{ background: "var(--color-surface)", transform: `translateX(${checked ? 18 : 2}px)` }}
      />
    </button>
  );
}

export function CustomFieldsSettings({ systemId, boardId, fields }: { systemId: string; boardId: string; fields: CustomFieldDto[] }) {
  const [rows, setRows] = useState(fields);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  // K2.12 (หนี้ K2.6): แก้ตัวเลือก SELECT / หน่วย NUMBER ได้หลังสร้างฟิลด์แล้ว (ก่อนหน้านี้แก้ได้แค่ตอนสร้าง)
  const [editingOptionsId, setEditingOptionsId] = useState<string | null>(null);
  const [optionsDraft, setOptionsDraft] = useState("");
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState<KanbanCustomFieldType>("TEXT");
  const [newUnit, setNewUnit] = useState("");
  const [newChoices, setNewChoices] = useState("");

  const limit = KANBAN_LIMITS.customFieldsPerBoard;

  const rename = async (field: CustomFieldDto, name: string) => {
    const trimmed = name.trim();
    setEditingId(null);
    if (!trimmed || trimmed === field.name) return;
    setBusyId(field.id);
    setError(null);
    const res = await updateFieldAction({ systemId, boardId, fieldId: field.id, name: trimmed });
    setBusyId(null);
    if (!res.ok) {
      setError(res.message);
      return;
    }
    setRows((prev) => prev.map((r) => (r.id === field.id ? res.field : r)));
  };

  const toggleShowOnCard = async (field: CustomFieldDto) => {
    setBusyId(field.id);
    setError(null);
    const res = await updateFieldAction({ systemId, boardId, fieldId: field.id, showOnCard: !field.showOnCard });
    setBusyId(null);
    if (!res.ok) {
      setError(res.message);
      return;
    }
    setRows((prev) => prev.map((r) => (r.id === field.id ? res.field : r)));
  };

  const remove = async (field: CustomFieldDto) => {
    setBusyId(field.id);
    setError(null);
    const res = await deleteFieldAction({ systemId, boardId, fieldId: field.id });
    setBusyId(null);
    if (!res.ok) {
      setError(res.message);
      return;
    }
    setRows((prev) => prev.filter((r) => r.id !== field.id));
  };

  const move = async (field: CustomFieldDto, direction: -1 | 1) => {
    const idx = rows.findIndex((r) => r.id === field.id);
    const targetIdx = idx + direction;
    if (idx < 0 || targetIdx < 0 || targetIdx >= rows.length) return;
    const next = [...rows];
    [next[idx], next[targetIdx]] = [next[targetIdx]!, next[idx]!];
    setRows(next);
    setError(null);
    const res = await reorderFieldsAction({ systemId, boardId, ids: next.map((r) => r.id) });
    if (!res.ok) {
      setRows(rows); // revert
      setError(res.message);
    }
  };

  const startEditOptions = (field: CustomFieldDto) => {
    setEditingOptionsId(field.id);
    setOptionsDraft(field.type === "SELECT" ? (field.options.choices ?? []).join(", ") : (field.options.unit ?? ""));
  };

  const saveOptions = async (field: CustomFieldDto) => {
    setEditingOptionsId(null);
    setError(null);
    const options =
      field.type === "SELECT"
        ? { choices: optionsDraft.split(",").map((c) => c.trim()).filter(Boolean) }
        : { unit: optionsDraft.trim() || undefined };
    setBusyId(field.id);
    const res = await updateFieldAction({ systemId, boardId, fieldId: field.id, options });
    setBusyId(null);
    if (!res.ok) {
      setError(res.message);
      return;
    }
    setRows((prev) => prev.map((r) => (r.id === field.id ? res.field : r)));
  };

  const submitNew = async () => {
    const name = newName.trim();
    if (!name) return;
    setError(null);
    const options =
      newType === "NUMBER"
        ? { unit: newUnit.trim() || undefined }
        : newType === "SELECT"
          ? { choices: newChoices.split(",").map((c) => c.trim()).filter(Boolean) }
          : undefined;
    const res = await createFieldAction({ systemId, boardId, name, type: newType, options });
    if (!res.ok) {
      setError(res.message);
      return;
    }
    setRows((prev) => [...prev, res.field]);
    setNewName("");
    setNewUnit("");
    setNewChoices("");
    setNewType("TEXT");
    setAdding(false);
  };

  return (
    <div data-testid="custom-fields-settings" className="card flex flex-col gap-3 p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium">ฟิลด์กำหนดเอง</h2>
        <div className="flex items-center gap-3">
          {/* ตัวเลข 20 ตรงนี้ต้องอิง KANBAN_LIMITS.customFieldsPerBoard เสมอ (ตรวจด้วยตาแล้วว่าเท่ากับ `limit`
              ด้านล่าง — เขียนเป็นตัวเลขตรง ๆ เพื่อให้ตรงป้าย "n / 20" ในภาพ 10 · เปลี่ยนเพดานต้องแก้ 2 จุดนี้คู่กัน) */}
          <span data-testid="custom-fields-count" style={{ fontSize: 12, color: "var(--color-muted)" }}>
            {rows.length} / 20
          </span>
          {!adding && rows.length < limit && (
            <button type="button" onClick={() => setAdding(true)} className="btn btn-ghost text-xs">
              <KanbanIcon name="plus" size="xs" /> เพิ่ม
            </button>
          )}
        </div>
      </div>

      {error && (
        <p data-testid="custom-fields-settings-error" style={{ fontSize: 12, color: "var(--color-danger)" }}>
          {error}
        </p>
      )}

      {rows.length === 0 && !adding ? (
        <p style={{ fontSize: 12.5, color: "var(--color-muted)" }}>บอร์ดนี้ยังไม่มีฟิลด์กำหนดเอง — เพิ่มได้จากปุ่ม &ldquo;เพิ่ม&rdquo; ด้านบน</p>
      ) : (
        <ul className="flex flex-col divide-y" style={{ borderTop: rows.length ? "1px solid var(--color-line)" : undefined }}>
          {rows.map((f, i) => (
            <li key={f.id} data-testid="custom-field-settings-row" className="flex items-center gap-3 py-2.5">
              <div className="flex min-w-0 flex-1 flex-col">
                {editingId === f.id ? (
                  <input
                    autoFocus
                    defaultValue={f.name}
                    data-testid="custom-field-name-input"
                    className="input"
                    style={{ fontSize: 13.5, maxWidth: 240 }}
                    onBlur={(e) => rename(f, e.currentTarget.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") e.currentTarget.blur();
                      if (e.key === "Escape") setEditingId(null);
                    }}
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => setEditingId(f.id)}
                    className="truncate text-left"
                    title="คลิกเพื่อแก้ชื่อ"
                    style={{ fontSize: 13.5, fontWeight: 600, cursor: "text" }}
                  >
                    {f.name}
                  </button>
                )}
                {editingOptionsId === f.id ? (
                  <input
                    autoFocus
                    value={optionsDraft}
                    data-testid="field-edit-options-input"
                    className="input"
                    style={{ fontSize: 12, maxWidth: 280 }}
                    placeholder={f.type === "SELECT" ? "ตัวเลือก คั่นด้วยจุลภาค" : "หน่วย เช่น บาท"}
                    onChange={(e) => setOptionsDraft(e.target.value)}
                    onBlur={() => saveOptions(f)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") e.currentTarget.blur();
                      if (e.key === "Escape") setEditingOptionsId(null);
                    }}
                  />
                ) : (
                  <span className="flex items-center gap-1.5 truncate" style={{ fontSize: 12, color: "var(--color-muted)" }}>
                    {describeField(f)}
                    {(f.type === "SELECT" || f.type === "NUMBER") && (
                      <button
                        type="button"
                        data-testid="field-edit-options"
                        aria-label={`แก้ตัวเลือกของฟิลด์ ${f.name}`}
                        onClick={() => startEditOptions(f)}
                        style={{ color: "var(--color-accent)" }}
                      >
                        <KanbanIcon name="edit" size="xs" />
                      </button>
                    )}
                  </span>
                )}
              </div>
              <label className="flex items-center gap-1.5" style={{ fontSize: 11.5, color: "var(--color-muted)" }}>
                <Toggle checked={f.showOnCard} disabled={busyId === f.id} onChange={() => toggleShowOnCard(f)} label={`แสดงบนการ์ด — ${f.name}`} />
                แสดงบนการ์ด
              </label>
              <div className="flex shrink-0 items-center gap-0.5">
                <button type="button" disabled={i === 0} onClick={() => move(f, -1)} aria-label="เลื่อนขึ้น" style={{ color: "var(--color-muted)", width: 16 }}>
                  ↑
                </button>
                <button type="button" disabled={i === rows.length - 1} onClick={() => move(f, 1)} aria-label="เลื่อนลง" style={{ color: "var(--color-muted)", width: 16 }}>
                  ↓
                </button>
                <button
                  type="button"
                  disabled={busyId === f.id}
                  onClick={() => remove(f)}
                  aria-label={`ลบฟิลด์ ${f.name}`}
                  style={{ color: "var(--color-danger)" }}
                >
                  <KanbanIcon name="trash" size="xs" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {adding && (
        <div data-testid="custom-field-add-form" className="flex flex-col gap-2 rounded-lg border p-3" style={{ borderColor: "var(--color-line)" }}>
          <input
            autoFocus
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="ชื่อฟิลด์"
            className="input"
            style={{ fontSize: 13 }}
          />
          <select value={newType} onChange={(e) => setNewType(e.target.value as KanbanCustomFieldType)} className="input" style={{ fontSize: 13 }}>
            {(Object.keys(TYPE_LABEL) as KanbanCustomFieldType[]).map((t) => (
              <option key={t} value={t}>
                {TYPE_LABEL[t]}
              </option>
            ))}
          </select>
          {newType === "NUMBER" && (
            <input value={newUnit} onChange={(e) => setNewUnit(e.target.value)} placeholder="หน่วย (ไม่บังคับ) เช่น บาท" className="input" style={{ fontSize: 13 }} />
          )}
          {newType === "SELECT" && (
            <input
              value={newChoices}
              onChange={(e) => setNewChoices(e.target.value)}
              placeholder="ตัวเลือก คั่นด้วยจุลภาค เช่น สูง, กลาง, ต่ำ"
              className="input"
              style={{ fontSize: 13 }}
            />
          )}
          <div className="flex items-center gap-2">
            <button type="button" onClick={submitNew} className="btn btn-primary text-xs">
              บันทึก
            </button>
            <button type="button" onClick={() => setAdding(false)} className="btn btn-ghost text-xs">
              ยกเลิก
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default CustomFieldsSettings;
