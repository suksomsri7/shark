// RecordForm.tsx — ฟอร์มเพิ่ม/แก้ไขรายการของวัตถุกำหนดเอง (CRM v2 · ใบ C1.9) + ปุ่มเก็บถาวรรายการ
// 🔴 'use client' — ชนิดจาก `./types` (บริสุทธิ์) · server action จาก `objects-actions.ts` ("use server" = ขอบเขต)
// 🔴 ข้อผิดพลาดแสดงในฟอร์ม (inline) ไม่ใช้ alert() · ข้อความไทยจากบริการ ไม่โทษผู้ใช้
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { archiveRecordAction, createRecordAction, updateRecordAction } from "@/lib/modules/crm/objects-actions";
import { isoToThaiInput, thaiInputToIso, type ObjectFormField, type ObjectValueView } from "@/components/crm/objects/types";

type Draft = Record<string, string | boolean | string[]>;

function toDraft(fields: ObjectFormField[], values: Record<string, ObjectValueView>): Draft {
  const d: Draft = {};
  for (const f of fields) {
    const v = values[f.key];
    if (f.type === "BOOLEAN") d[f.key] = v === true;
    else if (f.type === "MULTI_SELECT") d[f.key] = Array.isArray(v) ? v.map(String) : [];
    // รีวิว S1: DATETIME เก็บเป็น ISO (UTC) → แสดงในช่องเป็นเวลาไทย
    else if (f.type === "DATETIME") d[f.key] = typeof v === "string" ? isoToThaiInput(v) : "";
    else d[f.key] = v === null || v === undefined ? "" : Array.isArray(v) ? v.join(", ") : String(v);
  }
  return d;
}

/** ค่าในฟอร์ม → ค่าที่ engine รับ (ช่องว่าง = ไม่ส่ง ตอนสร้าง · = null ตอนแก้ไขช่องที่เคยมีค่า) */
function toValues(fields: ObjectFormField[], draft: Draft, initial: Draft | null): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of fields) {
    if (f.hidden) continue;
    const v = draft[f.key];
    if (initial && JSON.stringify(initial[f.key]) === JSON.stringify(v)) continue;
    if (f.type === "BOOLEAN") out[f.key] = v === true;
    else if (f.type === "MULTI_SELECT") out[f.key] = Array.isArray(v) ? v : [];
    else if (typeof v === "string" && v.trim() === "") {
      if (initial) out[f.key] = null;
    } else if (f.type === "NUMBER" || f.type === "MONEY") out[f.key] = Number(String(v).replace(/,/g, ""));
    // รีวิว S1: ช่อง datetime-local = เวลาไทย → ส่ง ISO พร้อม +07:00 (ไม่ปล่อยให้ตีความตามเขตเวลาของเซิร์ฟเวอร์)
    else if (f.type === "DATETIME") out[f.key] = thaiInputToIso(String(v));
    else out[f.key] = v;
  }
  return out;
}

const INPUT_TYPE: Record<string, string> = { NUMBER: "number", MONEY: "number", DATE: "date", DATETIME: "datetime-local" };

export function RecordForm({
  systemId,
  objectKey,
  fields,
  parentId,
  recordId,
  initial,
  onDone,
}: {
  systemId: string;
  objectKey: string;
  fields: ObjectFormField[];
  parentId?: string | null;
  /** มี = โหมดแก้ไข */
  recordId?: string;
  initial?: Record<string, ObjectValueView>;
  onDone?: () => void;
}) {
  const router = useRouter();
  // CRM C1.9 ▸ รีวิว B1: ช่องที่ผู้ดูไม่มีสิทธิ์เห็นค่าอ่อนไหว = ไม่มีในฟอร์มทั้งตอนเพิ่มและแก้ไข · มีสิทธิ์ (เช่นเจ้าของร้าน) = กรอก/แก้ได้ปกติ ◂
  const editable = fields.filter((f) => !f.hidden);
  const start = recordId ? toDraft(editable, initial ?? {}) : null;
  const [draft, setDraft] = useState<Draft>(() => start ?? toDraft(editable, {}));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    setError(null);
    const values = toValues(editable, draft, start);
    startTransition(async () => {
      const res = recordId
        ? await updateRecordAction(systemId, objectKey, recordId, { values })
        : await createRecordAction(systemId, objectKey, { parentId: parentId ?? null, values });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      onDone?.();
      router.refresh();
    });
  }

  return (
    <form
      data-testid="object-record-form"
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
        {editable.map((f) => (
          <label key={f.key} className="flex min-w-0 flex-col gap-1 text-xs text-[color:var(--color-muted)]">
            <span>
              {f.label}
              {f.required ? " *" : ""}
            </span>
            {f.type === "BOOLEAN" ? (
              <input
                type="checkbox"
                data-testid={`object-record-field-${f.key}`}
                checked={draft[f.key] === true}
                onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.checked }))}
                className="h-4 w-4"
              />
            ) : f.type === "SELECT" ? (
              <select
                data-testid={`object-record-field-${f.key}`}
                value={String(draft[f.key] ?? "")}
                onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))}
                className="input text-sm"
              >
                <option value="">— ไม่ระบุ —</option>
                {f.choices.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            ) : f.type === "MULTI_SELECT" ? (
              <select
                multiple
                data-testid={`object-record-field-${f.key}`}
                value={Array.isArray(draft[f.key]) ? (draft[f.key] as string[]) : []}
                onChange={(e) => setDraft((d) => ({ ...d, [f.key]: Array.from(e.target.selectedOptions).map((o) => o.value) }))}
                className="input text-sm"
              >
                {f.choices.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            ) : f.type === "LONG_TEXT" ? (
              <textarea
                data-testid={`object-record-field-${f.key}`}
                value={String(draft[f.key] ?? "")}
                onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))}
                rows={3}
                className="input text-sm"
              />
            ) : (
              <input
                type={INPUT_TYPE[f.type] ?? "text"}
                data-testid={`object-record-field-${f.key}`}
                value={String(draft[f.key] ?? "")}
                onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))}
                step={f.type === "NUMBER" || f.type === "MONEY" ? "any" : undefined}
                className="input text-sm"
              />
            )}
          </label>
        ))}
      </div>
      {editable.length === 0 && <p className="text-sm text-[color:var(--color-muted)]">วัตถุนี้ยังไม่มีฟิลด์ — เพิ่มฟิลด์ได้ที่หน้าตั้งค่าวัตถุ แล้วกลับมาเพิ่มรายการ</p>}
      {error && (
        <p className="text-sm" style={{ color: "var(--color-danger)" }} role="alert" data-testid="object-record-form-error">
          {error}
        </p>
      )}
      <div className="flex flex-wrap justify-end gap-2">
        {onDone && (
          <button type="button" className="btn btn-ghost text-sm" onClick={onDone} data-testid="object-record-cancel">
            ยกเลิก
          </button>
        )}
        <button type="submit" className="btn btn-primary text-sm" disabled={pending} data-testid="object-record-save">
          {pending ? "กำลังบันทึก…" : recordId ? "บันทึกการแก้ไข" : "เพิ่มรายการ"}
        </button>
      </div>
    </form>
  );
}

/** ปุ่ม "+ เพิ่ม<วัตถุ>" ที่เปิดฟอร์มในที่ (แท็บในหน้า 360 · หน้ารายการของวัตถุที่ไม่ผูกกับใคร) */
export function NewRecordToggle({ systemId, objectKey, label, fields, parentId }: { systemId: string; objectKey: string; label: string; fields: ObjectFormField[]; parentId?: string | null }) {
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <button type="button" className="btn btn-ghost w-full border-dashed text-sm" onClick={() => setOpen(true)} data-testid="object-record-new-btn">
        + เพิ่ม{label}
      </button>
    );
  }
  return (
    <div className="rounded-xl border p-3" style={{ borderColor: "var(--color-line)" }}>
      <RecordForm systemId={systemId} objectKey={objectKey} fields={fields} parentId={parentId} onDone={() => setOpen(false)} />
    </div>
  );
}

/** แก้ไขรายการ (หน้ารายการเดี่ยว) — ฟอร์มพับไว้ก่อน */
export function EditRecordToggle(props: { systemId: string; objectKey: string; recordId: string; fields: ObjectFormField[]; initial: Record<string, ObjectValueView> }) {
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <button type="button" className="btn btn-ghost text-sm" onClick={() => setOpen(true)} data-testid="object-record-edit-btn">
        แก้ไขข้อมูล
      </button>
    );
  }
  return (
    <div className="w-full rounded-xl border p-3" style={{ borderColor: "var(--color-line)" }}>
      <RecordForm {...props} onDone={() => setOpen(false)} />
    </div>
  );
}

/** เก็บถาวรรายการ (กู้คืนได้โดยผู้ดูแล — รายการไม่ถูกลบ) · ยืนยันสองจังหวะในปุ่มเดียว */
export function ArchiveRecordButton({ systemId, objectKey, recordId, listHref }: { systemId: string; objectKey: string; recordId: string; listHref: string }) {
  const router = useRouter();
  const [armed, setArmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        className="btn btn-ghost text-sm"
        style={armed ? { color: "var(--color-danger)", borderColor: "var(--color-danger)" } : undefined}
        disabled={pending}
        data-testid="object-record-archive-btn"
        onClick={() => {
          if (!armed) {
            setArmed(true);
            return;
          }
          setError(null);
          startTransition(async () => {
            const res = await archiveRecordAction(systemId, objectKey, recordId);
            if (!res.ok) {
              setError(res.error);
              setArmed(false);
              return;
            }
            router.push(listHref);
          });
        }}
      >
        {armed ? "กดอีกครั้งเพื่อเก็บถาวร" : "เก็บถาวร"}
      </button>
      {error && (
        <span className="text-xs" style={{ color: "var(--color-danger)" }} role="alert" data-testid="object-record-archive-error">
          {error}
        </span>
      )}
    </div>
  );
}
