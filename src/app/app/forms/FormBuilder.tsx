"use client";

import { useState } from "react";
import { SubmitButton } from "@/components/ui/SubmitButton";

// ชนิดช่องกรอกที่รองรับ (ตรงกับ service.FIELD_TYPES)
const TYPES: { value: string; label: string }[] = [
  { value: "text", label: "ข้อความ" },
  { value: "phone", label: "เบอร์โทร" },
  { value: "email", label: "อีเมล" },
  { value: "select", label: "ตัวเลือก" },
  { value: "textarea", label: "ข้อความยาว" },
];

export type BuilderField = {
  key: string;
  label: string;
  type: string;
  required: boolean;
  options?: string[];
};

type Props = {
  action: (formData: FormData) => void;
  formId?: string;
  initial?: {
    name: string;
    description: string;
    crmEnabled: boolean;
    fields: BuilderField[];
  };
  submitLabel: string;
  serverError?: string;
};

const inputCls = "input";
let seq = 0;
const nextKey = () => `field_${Date.now().toString(36)}${(seq++).toString(36)}`;

export function FormBuilder({ action, formId, initial, submitLabel, serverError }: Props) {
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [crmEnabled, setCrmEnabled] = useState(initial?.crmEnabled ?? false);
  const [fields, setFields] = useState<BuilderField[]>(
    initial?.fields?.length
      ? initial.fields
      : [{ key: "name", label: "ชื่อ", type: "text", required: true }],
  );
  const [error, setError] = useState("");

  const patch = (i: number, p: Partial<BuilderField>) =>
    setFields((fs) => fs.map((f, idx) => (idx === i ? { ...f, ...p } : f)));
  const add = () =>
    setFields((fs) => [...fs, { key: nextKey(), label: "", type: "text", required: false }]);
  const remove = (i: number) => setFields((fs) => fs.filter((_, idx) => idx !== i));
  const move = (i: number, dir: -1 | 1) =>
    setFields((fs) => {
      const j = i + dir;
      if (j < 0 || j >= fs.length) return fs;
      const copy = [...fs];
      [copy[i], copy[j]] = [copy[j], copy[i]];
      return copy;
    });

  // ตรวจฝั่ง client ก่อนส่ง (server เป็นตัวตัดสินสุดท้าย) — กันส่งข้อมูลพัง
  const validate = (): string => {
    if (!name.trim()) return "กรุณาระบุชื่อฟอร์ม";
    if (fields.length === 0) return "ต้องมีช่องกรอกอย่างน้อย 1 ช่อง";
    const keys = new Set<string>();
    for (const f of fields) {
      if (!f.key.trim()) return "ทุกช่องต้องมีชื่อฟิลด์ (key)";
      if (!f.label.trim()) return "ทุกช่องต้องมีป้ายชื่อ";
      if (keys.has(f.key)) return `ชื่อฟิลด์ซ้ำ: ${f.key}`;
      keys.add(f.key);
      if (f.type === "select" && !(f.options ?? []).some((o) => o.trim()))
        return `ช่อง "${f.label}" ต้องมีตัวเลือกอย่างน้อย 1 รายการ`;
    }
    return "";
  };

  const serialized = JSON.stringify(
    fields.map((f) => ({
      key: f.key.trim(),
      label: f.label.trim(),
      type: f.type,
      required: f.required,
      ...(f.type === "select"
        ? { options: (f.options ?? []).map((o) => o.trim()).filter(Boolean) }
        : {}),
    })),
  );

  return (
    <form
      action={action}
      onSubmit={(e) => {
        const msg = validate();
        if (msg) {
          e.preventDefault();
          setError(msg);
        }
      }}
      className="flex flex-col gap-5"
    >
      {formId && <input type="hidden" name="id" value={formId} />}
      <input type="hidden" name="fields" value={serialized} />
      {crmEnabled && <input type="hidden" name="crmEnabled" value="on" />}

      {(error || serverError) && (
        <p className="rounded-lg bg-[color:var(--color-surface-2)] p-2 text-sm text-[color:var(--color-danger)]">
          {error || serverError}
        </p>
      )}

      <div className="card flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)]">
          <span>
            ชื่อฟอร์ม<span className="text-[color:var(--color-danger)]"> *</span>
          </span>
          <input
            name="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="เช่น ฟอร์มสนใจคอร์ส"
            className={inputCls}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)]">
          <span>คำอธิบาย (ไม่บังคับ)</span>
          <textarea
            name="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            className={inputCls}
          />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={crmEnabled}
            onChange={(e) => setCrmEnabled(e.target.checked)}
          />
          <span>ส่งผู้กรอกเข้าระบบ CRM เป็นลูกค้ามุ่งหวัง (ต้องเปิดระบบ CRM)</span>
        </label>
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium">ช่องกรอก ({fields.length})</h2>
          <button type="button" onClick={add} className="btn btn-ghost text-sm">
            + เพิ่มช่อง
          </button>
        </div>

        {fields.map((f, i) => (
          <div key={i} className="card flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <div className="flex flex-col">
                <button
                  type="button"
                  onClick={() => move(i, -1)}
                  disabled={i === 0}
                  aria-label="เลื่อนขึ้น"
                  className="text-xs leading-none disabled:opacity-30"
                >
                  ▲
                </button>
                <button
                  type="button"
                  onClick={() => move(i, 1)}
                  disabled={i === fields.length - 1}
                  aria-label="เลื่อนลง"
                  className="text-xs leading-none disabled:opacity-30"
                >
                  ▼
                </button>
              </div>
              <input
                value={f.label}
                onChange={(e) => patch(i, { label: e.target.value })}
                placeholder="ป้ายชื่อ เช่น เบอร์โทร"
                className={`${inputCls} flex-1`}
              />
              <button
                type="button"
                onClick={() => remove(i)}
                aria-label="ลบช่อง"
                className="text-sm text-[color:var(--color-danger)]"
              >
                ลบ
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <select
                value={f.type}
                onChange={(e) => patch(i, { type: e.target.value })}
                className={inputCls}
              >
                {TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
              <input
                value={f.key}
                onChange={(e) => patch(i, { key: e.target.value })}
                placeholder="key (อังกฤษ)"
                className={`${inputCls} w-32`}
              />
              <label className="flex items-center gap-1 text-xs text-[color:var(--color-muted)]">
                <input
                  type="checkbox"
                  checked={f.required}
                  onChange={(e) => patch(i, { required: e.target.checked })}
                />
                จำเป็น
              </label>
            </div>

            {f.type === "select" && (
              <input
                value={(f.options ?? []).join(", ")}
                onChange={(e) => patch(i, { options: e.target.value.split(",") })}
                placeholder="ตัวเลือก คั่นด้วยจุลภาค เช่น คอร์ส A, คอร์ส B"
                className={inputCls}
              />
            )}
          </div>
        ))}
      </div>

      <SubmitButton>{submitLabel}</SubmitButton>
    </form>
  );
}
