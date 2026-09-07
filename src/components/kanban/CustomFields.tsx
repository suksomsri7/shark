// CustomFields.tsx — บล็อก "ฟิลด์กำหนดเอง" ในหลังการ์ด (K2.6 · แถบขวาของ `ledger/design-kanban/03-card-back.png`)
//
// แก้ค่าในที่ทุกชนิด (TEXT/NUMBER คลิกแล้วพิมพ์ · DATE = ThaiDatePicker · CHECKBOX = สลับ ✓ · SELECT = popover
// เลือกตัวเลือก) — optimistic ก่อนเสมอแล้วยิง `setCardFieldValueAction`, ผิดพลาด → revert + toast
// ⚠️ ห้ามใช้อีโมจิ — ไอคอนทุกตัวมาจาก <KanbanIcon> · ห้าม toLocaleDateString (บทเรียน K1.5)
"use client";

import { useState } from "react";
import { KanbanIcon } from "./KanbanIcon";
import { ThaiDatePicker } from "./ThaiDatePicker";
import { setCardFieldValueAction } from "@/lib/modules/kanban/actions";
import type { CardFieldValueDto } from "@/lib/modules/kanban/types";

export function CustomFields({
  systemId,
  boardId,
  cardId,
  editable,
  fields,
  nowMs,
  onChange,
  onToast,
}: {
  systemId: string;
  boardId: string;
  cardId: string;
  editable: boolean;
  fields: CardFieldValueDto[];
  nowMs: number;
  onChange: (fields: CardFieldValueDto[]) => void;
  onToast: (message: string) => void;
}) {
  if (fields.length === 0) {
    return <p style={{ fontSize: 11.5, color: "var(--color-muted)" }}>บอร์ดนี้ยังไม่มีฟิลด์กำหนดเอง — ตั้งได้ที่ตั้งค่าบอร์ด</p>;
  }

  const setValue = (field: CardFieldValueDto, value: string | number | boolean | null) => {
    setCardFieldValueAction({ systemId, boardId, cardId, fieldId: field.fieldId, type: field.type, value }).then((res) => {
      if (!res.ok) {
        onToast(res.message || "บันทึกฟิลด์ไม่สำเร็จ ลองใหม่อีกครั้ง");
        return;
      }
      onChange(fields.map((f) => (f.fieldId === field.fieldId ? res.field : f)));
    });
  };

  return (
    <div data-testid="custom-fields" className="flex flex-col gap-2.5">
      {fields.map((f) => (
        <FieldRow key={f.fieldId} field={f} editable={editable} nowMs={nowMs} onSetValue={(v) => setValue(f, v)} />
      ))}
    </div>
  );
}

function FieldRow({
  field,
  editable,
  nowMs,
  onSetValue,
}: {
  field: CardFieldValueDto;
  editable: boolean;
  nowMs: number;
  onSetValue: (value: string | number | boolean | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(field.value === null ? "" : String(field.value));
  const [dueOpen, setDueOpen] = useState(false);
  const [selectOpen, setSelectOpen] = useState(false);

  const commitText = () => {
    setEditing(false);
    const trimmed = draft.trim();
    onSetValue(trimmed === "" ? null : trimmed);
  };

  const commitNumber = () => {
    setEditing(false);
    const trimmed = draft.trim();
    if (trimmed === "") {
      onSetValue(null);
      return;
    }
    const n = Number(trimmed);
    if (!Number.isFinite(n)) return; // ปล่อยค่าค้าง — ไม่ยิงค่าผิดชนิดออกไป
    onSetValue(n);
  };

  return (
    <div data-testid="custom-field-row" className="flex flex-col gap-0.5">
      <div style={{ fontSize: 11, color: "var(--color-muted)" }}>{field.name}</div>

      {field.type === "CHECKBOX" ? (
        <button
          type="button"
          role="switch"
          aria-checked={field.value === true}
          disabled={!editable}
          onClick={() => onSetValue(field.value === true ? false : true)}
          className="inline-flex items-center gap-1.5 self-start"
          style={{ fontSize: 12.5, color: field.value === true ? "var(--color-ink)" : "var(--color-muted)" }}
        >
          <KanbanIcon name={field.value === true ? "check" : "x"} size="xs" />
          {field.display}
        </button>
      ) : field.type === "SELECT" ? (
        <div className="relative inline-block">
          <button
            type="button"
            disabled={!editable}
            onClick={() => setSelectOpen((o) => !o)}
            className="inline-flex items-center rounded-md border"
            style={{
              height: 22,
              padding: "0 8px",
              fontSize: 12,
              fontWeight: field.value ? 600 : 400,
              borderStyle: field.value ? "solid" : "dashed",
              borderColor: "var(--color-line)",
              color: field.value ? "var(--color-ink-soft)" : "var(--color-muted)",
              background: field.value ? "var(--color-surface-2)" : "transparent",
            }}
          >
            {field.display}
          </button>
          {selectOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setSelectOpen(false)} />
              <div
                className="absolute left-0 top-full z-50 mt-1 flex w-40 flex-col gap-0.5 rounded-xl border p-1.5"
                style={{ background: "var(--color-surface)", borderColor: "var(--color-line)", boxShadow: "0 14px 34px rgba(10,10,10,.14)" }}
              >
                {(field.options.choices ?? []).map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => {
                      onSetValue(c);
                      setSelectOpen(false);
                    }}
                    className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-left"
                    style={{ fontSize: 12.5, background: field.value === c ? "var(--color-surface-2)" : "transparent" }}
                  >
                    <span className="flex-1">{c}</span>
                    {field.value === c && <KanbanIcon name="check" size="xs" />}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => {
                    onSetValue(null);
                    setSelectOpen(false);
                  }}
                  className="rounded-lg px-2 py-1.5 text-left"
                  style={{ fontSize: 12, color: "var(--color-muted)" }}
                >
                  ไม่ระบุ
                </button>
              </div>
            </>
          )}
        </div>
      ) : field.type === "DATE" ? (
        <ThaiDatePicker
          value={typeof field.value === "string" ? field.value : null}
          onChange={(v) => onSetValue(v)}
          editable={editable}
          open={dueOpen}
          onOpenChange={setDueOpen}
          nowMs={nowMs}
          ariaLabel={field.name}
          chipTestId="custom-field-date-chip"
          pickerTestId="custom-field-date-picker"
        />
      ) : editing ? (
        <input
          autoFocus
          data-testid="custom-field-input"
          inputMode={field.type === "NUMBER" ? "decimal" : "text"}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={field.type === "NUMBER" ? commitNumber : commitText}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
            if (e.key === "Escape") {
              setDraft(field.value === null ? "" : String(field.value));
              setEditing(false);
            }
          }}
          className="rounded border px-1.5 py-0.5"
          style={{ fontSize: 12.5, borderColor: "var(--color-accent)", width: 120 }}
        />
      ) : (
        <button
          type="button"
          data-testid="custom-field-value"
          disabled={!editable}
          onClick={() => {
            setDraft(field.value === null ? "" : String(field.value));
            setEditing(true);
          }}
          className="text-left"
          style={{ fontSize: 12.5, color: field.value === null ? "var(--color-muted)" : "var(--color-ink)", cursor: editable ? "text" : "default" }}
        >
          {field.display}
        </button>
      )}
    </div>
  );
}

export default CustomFields;
