// SavedViewsSettings.tsx — ตั้งค่าบอร์ด › "มุมมองที่บันทึกไว้" (K2.5 · ภาพ 10)
//
// รายการ + ป้าย ทั้งทีม/ส่วนตัว + คำบรรยายเงื่อนไข ("ตาราง · กรอง: เลยกำหนด · เรียงตามวันที่") + แก้ชื่อ/ลบ
// การ "บันทึกมุมมองปัจจุบัน" ทำที่หัวบอร์ด (`SavedViewsMenu.tsx`) เท่านั้น — หน้านี้ไม่มี "มุมมองปัจจุบัน"
// ให้บันทึก (เป็นหน้าตั้งค่าแยกจากบอร์ด ไม่ใช่แผงลอยบนบอร์ด)
"use client";

import { useState } from "react";
import { deleteViewAction, reorderViewsAction, updateViewAction } from "@/lib/modules/kanban/actions";
import { describeSavedViewConfig } from "@/lib/modules/kanban/filters";
import type { SavedViewDto } from "@/lib/modules/kanban/types";

export function SavedViewsSettings({
  systemId,
  boardId,
  isAdmin,
  viewerUserId,
  views,
}: {
  systemId: string;
  boardId: string;
  /** ADMIN ลบ/แก้มุมมอง "ทั้งทีม" ได้ — ส่วนตัวแก้/ลบได้เฉพาะเจ้าของ (`viewerUserId`) เสมอ */
  isAdmin: boolean;
  viewerUserId: string;
  views: SavedViewDto[];
}) {
  const [rows, setRows] = useState(views);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canEdit = (v: SavedViewDto) => (v.scope === "BOARD" ? isAdmin : v.ownerUserId === viewerUserId);

  const rename = async (view: SavedViewDto, name: string) => {
    const trimmed = name.trim();
    setEditingId(null);
    if (!trimmed || trimmed === view.name) return;
    setBusyId(view.id);
    setError(null);
    const res = await updateViewAction({ systemId, boardId, viewId: view.id, name: trimmed });
    setBusyId(null);
    if (!res.ok) {
      setError(res.message);
      return;
    }
    setRows((prev) => prev.map((r) => (r.id === view.id ? res.view : r)));
  };

  // K2.12 (หนี้ K2.5): ปุ่ม ↑↓ จัดลำดับมุมมอง (แพตเทิร์นเดียวกับ CustomFieldsSettings.tsx/CardTemplatesSettings.tsx
  // — ไม่ใช้ HTML5 drag) — เรียก `reorderViewsAction` → `views.ts#reorderViews`
  const move = async (view: SavedViewDto, direction: -1 | 1) => {
    const idx = rows.findIndex((r) => r.id === view.id);
    const targetIdx = idx + direction;
    if (idx < 0 || targetIdx < 0 || targetIdx >= rows.length) return;
    const next = [...rows];
    [next[idx], next[targetIdx]] = [next[targetIdx]!, next[idx]!];
    setRows(next);
    setError(null);
    const res = await reorderViewsAction({ systemId, boardId, ids: next.map((r) => r.id) });
    if (!res.ok) {
      setRows(rows); // revert
      setError(res.message);
    }
  };

  const remove = async (view: SavedViewDto) => {
    setBusyId(view.id);
    setError(null);
    const res = await deleteViewAction({ systemId, boardId, viewId: view.id });
    setBusyId(null);
    if (!res.ok) {
      setError(res.message);
      return;
    }
    setRows((prev) => prev.filter((r) => r.id !== view.id));
  };

  return (
    <div data-testid="saved-views-settings" className="card flex flex-col gap-3 p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium">มุมมองที่บันทึกไว้</h2>
        <span style={{ fontSize: 12, color: "var(--color-muted)" }}>{rows.length} มุมมอง</span>
      </div>
      <p style={{ fontSize: 12, color: "var(--color-muted)" }}>
        บันทึกมุมมองใหม่ได้จากปุ่ม &ldquo;มุมมอง&rdquo; ที่หัวบอร์ด — ที่นี่แก้ชื่อ/ลบมุมมองที่มีอยู่แล้วเท่านั้น
      </p>
      {error && (
        <p data-testid="saved-views-settings-error" style={{ fontSize: 12, color: "var(--color-danger)" }}>
          {error}
        </p>
      )}
      {rows.length === 0 ? (
        <p style={{ fontSize: 12.5, color: "var(--color-muted)" }}>ยังไม่มีมุมมองที่บันทึกไว้ในบอร์ดนี้</p>
      ) : (
        <ul className="flex flex-col divide-y" style={{ borderTop: "1px solid var(--color-line)" }}>
          {rows.map((v, i) => (
            <li key={v.id} data-testid="saved-view-settings-row" className="flex items-center gap-3 py-2.5">
              <div className="flex shrink-0 items-center gap-0.5">
                <button
                  type="button"
                  data-testid="view-reorder"
                  disabled={i === 0}
                  onClick={() => move(v, -1)}
                  aria-label={`เลื่อนมุมมอง ${v.name} ขึ้น`}
                  style={{ color: "var(--color-muted)", width: 16 }}
                >
                  ↑
                </button>
                <button
                  type="button"
                  data-testid="view-reorder"
                  disabled={i === rows.length - 1}
                  onClick={() => move(v, 1)}
                  aria-label={`เลื่อนมุมมอง ${v.name} ลง`}
                  style={{ color: "var(--color-muted)", width: 16 }}
                >
                  ↓
                </button>
              </div>
              <div className="flex min-w-0 flex-1 flex-col">
                {editingId === v.id ? (
                  <input
                    autoFocus
                    defaultValue={v.name}
                    className="input"
                    style={{ fontSize: 13, maxWidth: 320 }}
                    onBlur={(e) => rename(v, e.currentTarget.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") e.currentTarget.blur();
                      if (e.key === "Escape") setEditingId(null);
                    }}
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => canEdit(v) && setEditingId(v.id)}
                    className="truncate text-left"
                    title={canEdit(v) ? "คลิกเพื่อแก้ชื่อ" : v.name}
                    style={{ fontSize: 13.5, fontWeight: 600, cursor: canEdit(v) ? "text" : "default" }}
                  >
                    {v.name}
                  </button>
                )}
                <span className="truncate" style={{ fontSize: 12, color: "var(--color-muted)" }}>
                  {describeSavedViewConfig(v.config)}
                </span>
              </div>
              <span
                data-testid="saved-view-scope-badge"
                style={{
                  height: 22,
                  padding: "0 8px",
                  borderRadius: 999,
                  fontSize: 11,
                  fontWeight: 600,
                  display: "inline-flex",
                  alignItems: "center",
                  whiteSpace: "nowrap",
                  border: "1px solid var(--color-line)",
                  color: v.scope === "BOARD" ? "var(--color-accent)" : "var(--color-ink-soft)",
                  background: v.scope === "BOARD" ? "var(--color-out)" : "var(--color-surface-2)",
                }}
              >
                {v.scope === "BOARD" ? "ทั้งทีม" : "ส่วนตัว"}
              </span>
              {canEdit(v) && (
                <button
                  type="button"
                  disabled={busyId === v.id}
                  onClick={() => remove(v)}
                  className="shrink-0"
                  style={{ fontSize: 12, color: "var(--color-danger)" }}
                >
                  ลบ
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default SavedViewsSettings;
