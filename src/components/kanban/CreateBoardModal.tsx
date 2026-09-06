// CreateBoardModal.tsx — สร้างบอร์ดใหม่ (K1.12 · หน้ารวมบอร์ด `ledger/design-kanban/01-boards-home.html`)
//
// ชื่อบอร์ด · หน่วยธุรกิจ (ไม่บังคับ = กลางองค์กร) · การมองเห็น (PRIVATE/TENANT) · เทมเพลต (ไม่บังคับ = บอร์ดเปล่า)
// validation ทั้งหมดแสดงในโมดัลเอง (ข้อความไทย) — ห้ามใช้ `alert()` (feedback: inline ไม่ใช่ alert)
//
// 🔴 เรียก `createBoardFromTemplateAction` ตัวเดียวจบทั้งสองทาง (templateId ว่าง = บอร์ดเปล่า) —
//    ดู deviation ที่บันทึกไว้ใน `actions.ts`/wo-notes
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { KanbanIcon } from "./KanbanIcon";
import { createBoardFromTemplateAction } from "@/lib/modules/kanban/actions";
import type { BoardTemplateDto } from "@/lib/modules/kanban/types";

export type CreateBoardUnit = { id: string; name: string };

export function CreateBoardModal({
  open,
  onClose,
  systemId,
  units,
  templates,
  presetTemplateId,
}: {
  open: boolean;
  onClose: () => void;
  systemId: string;
  units: CreateBoardUnit[];
  templates: BoardTemplateDto[];
  /** เปิดโมดัลมาพร้อมเทมเพลตที่เลือกไว้แล้ว (จาก `TemplatePicker`) — "" = บอร์ดเปล่า */
  presetTemplateId?: string;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [unitId, setUnitId] = useState("");
  const [visibility, setVisibility] = useState<"PRIVATE" | "TENANT">("PRIVATE");
  const [templateId, setTemplateId] = useState(presetTemplateId ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // เปิดใหม่ทุกครั้ง = เคลียร์ฟอร์ม (กันชื่อ/ข้อผิดพลาดของรอบก่อนค้าง)
  useEffect(() => {
    if (open) {
      const preset = templates.find((t) => t.id === presetTemplateId);
      setName(preset ? preset.name : "");
      setUnitId("");
      setVisibility("PRIVATE");
      setTemplateId(presetTemplateId ?? "");
      setError(null);
      setBusy(false);
    }
  }, [open, presetTemplateId, templates]);

  if (!open) return null;

  const selectedTemplate = templates.find((t) => t.id === templateId) ?? null;

  const submit = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("ต้องตั้งชื่อบอร์ดก่อนจึงสร้างได้");
      return;
    }
    setBusy(true);
    setError(null);
    const res = await createBoardFromTemplateAction({
      systemId,
      templateId: templateId || null,
      name: trimmed,
      unitId: unitId || null,
      visibility,
    });
    if (!res.ok) {
      setBusy(false);
      setError(res.message);
      return;
    }
    router.push(`/app/sys/${systemId}/kanban/b/${res.boardId}`);
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4" style={{ background: "rgba(10,10,10,.35)" }}>
      <span className="fixed inset-0" onClick={onClose} aria-hidden />
      <div
        data-testid="create-board-modal"
        role="dialog"
        aria-modal="true"
        aria-label="สร้างบอร์ดใหม่"
        className="relative flex w-full max-w-[440px] flex-col gap-3 rounded-xl p-5"
        style={{ background: "var(--color-surface)", border: "1px solid var(--color-line)", boxShadow: "0 24px 60px rgba(10,10,10,.28)" }}
      >
        <div className="flex items-center justify-between">
          <h2 style={{ fontSize: 15, fontWeight: 700 }}>สร้างบอร์ดใหม่</h2>
          <button type="button" onClick={onClose} aria-label="ปิด" style={{ color: "var(--color-muted)" }}>
            <KanbanIcon name="x" size="sm" />
          </button>
        </div>

        <label className="flex flex-col gap-1" style={{ fontSize: 12.5 }}>
          ชื่อบอร์ด
          <input
            autoFocus
            data-testid="create-board-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="เช่น งานเปิดสาขาใหม่"
            className="input"
            aria-invalid={error ? "true" : undefined}
          />
        </label>

        <label className="flex flex-col gap-1" style={{ fontSize: 12.5 }}>
          หน่วยธุรกิจ
          <select data-testid="create-board-unit" value={unitId} onChange={(e) => setUnitId(e.target.value)} className="input">
            <option value="">กลางองค์กร (ไม่ผูกสาขา)</option>
            {units.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1" style={{ fontSize: 12.5 }}>
          การมองเห็น
          <select
            data-testid="create-board-visibility"
            value={visibility}
            onChange={(e) => setVisibility(e.target.value === "TENANT" ? "TENANT" : "PRIVATE")}
            className="input"
          >
            <option value="PRIVATE">เฉพาะสมาชิกที่เชิญ</option>
            <option value="TENANT">ทั้งร้านเห็น</option>
          </select>
        </label>

        <label className="flex flex-col gap-1" style={{ fontSize: 12.5 }}>
          เริ่มจาก
          <select data-testid="create-board-template" value={templateId} onChange={(e) => setTemplateId(e.target.value)} className="input">
            <option value="">บอร์ดเปล่า (รอทำ / กำลังทำ / เสร็จ)</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
                {t.scope === "TENANT" ? " · ของร้าน" : ""}
              </option>
            ))}
          </select>
        </label>

        {selectedTemplate && (
          <div
            data-testid="create-board-template-preview"
            className="flex flex-wrap gap-1.5 rounded-lg p-2.5"
            style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-line)" }}
          >
            {selectedTemplate.structure.columns.map((c) => (
              <span
                key={c.name}
                className="inline-flex items-center"
                style={{ height: 20, padding: "0 8px", borderRadius: 999, fontSize: 11, border: "1px solid var(--color-line)", background: "var(--color-surface)" }}
              >
                {c.name}
              </span>
            ))}
          </div>
        )}

        {error && (
          <p data-testid="create-board-error" style={{ fontSize: 12, color: "var(--color-danger)" }}>
            {error}
          </p>
        )}

        <div className="mt-1 flex justify-end gap-2">
          <button type="button" className="btn btn-ghost text-sm" onClick={onClose} disabled={busy}>
            ยกเลิก
          </button>
          <button type="button" data-testid="create-board-submit" className="btn btn-primary text-sm" onClick={submit} disabled={busy}>
            {busy ? "กำลังสร้าง…" : "สร้างบอร์ด"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default CreateBoardModal;
