// FieldDesigner.tsx — ตัวออกแบบฟิลด์สมาชิก (M1.3 · ภาพ ledger/design-member/03-field-designer.png)
//
// 3 คอลัมน์ตามแบบ: palette ซ้าย (11 ชนิด ลากวางได้) · ผืนกลาง (ฟอร์มจริงพร้อมค่าตัวอย่าง แบ่งส่วน ลากเรียงได้
// ด้วย @dnd-kit) · แผงคุณสมบัติขวา (11 รายการของฟิลด์ที่เลือก)
//
// 🔴 ตีกลับรอบ 1 (Fable): งานที่แก้ "ในแผงคุณสมบัติ" (ป้าย/ตัวเลือก/บังคับกรอก/ค่าเริ่มต้น/ห้ามซ้ำ/ใช้กรอง/
//    แสดงในรายการ/ลูกค้าแก้เอง/อ่อนไหว/เก็บประวัติ) ตอนนี้ **บัฟเฟอร์ไว้ในเครื่อง** แล้วกดปุ่ม "บันทึก" มุมขวาบน
//    ค่อยยิง `updateFieldAction` ครั้งเดียว (แบบฟอร์มทั่วไป) — ต่างจากงานโครง (ลาก/เพิ่มส่วน-ฟิลด์/เก็บเข้าคลัง/
//    กู้คืน/ใช้เทมเพลต) ที่ยังบันทึกทันทีเหมือนเดิม (แบบเดียวกับฟิลด์กำหนดเองบอร์ดงาน K2.6)
//
// ⚠️ ห้ามใช้อีโมจิ — ไอคอนทุกตัวมาจาก <MemberIcon> · ห้ามใส่ hex สี — ใช้โทเคนจาก globals.css เท่านั้น
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { MemberFieldType, MemberLookupTarget } from "@prisma/client";

import { MemberIcon } from "./MemberIcon";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { FIELD_TYPE_HINTS, FIELD_TYPE_ICONS, FIELD_TYPE_LABELS, FIELD_TYPE_ORDER, LOOKUP_TARGET_LABELS } from "@/lib/modules/member/field-types";
import { MEMBER_LIMITS } from "@/lib/modules/member/limits";
import {
  applyTemplateAction,
  archiveFieldAction,
  createFieldAction,
  createSectionAction,
  deleteSectionAction,
  previewTemplateAction,
  reorderFieldsAction,
  reorderSectionsAction,
  restoreFieldAction,
  updateFieldAction,
  updateSectionAction,
} from "@/lib/modules/member/fields-actions";
import type {
  FieldDef,
  MemberFieldChoice,
  MemberFieldOptions,
  MemberFieldValueInput,
  SectionDef,
  UpdateFieldInput,
} from "@/lib/modules/member/fields";
import type { TemplatePart, TemplatePreview as TemplatePreviewData } from "@/lib/modules/member/templates-service";
import { TemplatePreviewPanel } from "./TemplatePreview";

const ALL_TEMPLATE_PARTS: TemplatePart[] = ["fields", "tiers", "stamps", "journeys"];

// ปลายทางของฟิลด์ LOOKUP (§4.2 `MemberLookupTarget`) — เขียนตรงตัวไว้ที่นี่ (ไม่ใช่แค่ import) เพราะแผงขวา
// ต้องมีปุ่มเลือกทั้ง 5 แบบจริง ๆ ไม่ใช่แค่รู้จักชื่อชนิด
const LOOKUP_TARGETS: { value: MemberLookupTarget; label: string }[] = [
  { value: "PRODUCT", label: LOOKUP_TARGET_LABELS.PRODUCT },
  { value: "SERVICE", label: LOOKUP_TARGET_LABELS.SERVICE },
  { value: "EMPLOYEE", label: LOOKUP_TARGET_LABELS.EMPLOYEE },
  { value: "UNIT", label: LOOKUP_TARGET_LABELS.UNIT },
  { value: "CUSTOMER", label: LOOKUP_TARGET_LABELS.CUSTOMER },
];

const CHOICE_COLORS: { key: string; label: string }[] = [
  { key: "slate", label: "เทา" },
  { key: "blue", label: "ฟ้า" },
  { key: "green", label: "เขียว" },
  { key: "amber", label: "อำพัน" },
  { key: "red", label: "แดง" },
  { key: "purple", label: "ม่วง" },
];

// ตัวอย่างค่าของฟิลด์ระบบ 26 ตัว (§11.2) — คงที่เสมอ ไม่ใช่ข้อมูลสมาชิกจริง (ผืนกลางเป็นแค่ตัวออกแบบฟอร์ม)
const SAMPLE_BY_SYSTEM_KEY: Record<string, string> = {
  memberCode: "SD-000123",
  firstName: "สมชาย",
  lastName: "ใจดี",
  nickname: "ชาย",
  titleTh: "นาย",
  birthDate: "12 ก.พ. 2533",
  gender: "ชาย",
  nationality: "ไทย",
  avatar: "รูปโปรไฟล์.jpg",
  phone: "081-234-5678",
  email: "somchai.j@gmail.com",
  lineUserId: "เชื่อมแล้ว",
  locale: "ไทย",
  preferredChannel: "LINE",
  tags: "VIP",
  note: "ลูกค้าประจำ",
  source: "walk-in",
  ownerUserId: "พนักงานขาย A",
  homeUnitId: "สาขาป่าตอง",
  addressLine1: "123 ถ.สุขุมวิท",
  addressSubdistrict: "ตลาดใหญ่",
  addressDistrict: "เมือง",
  addressProvince: "ภูเก็ต",
  addressPostcode: "83000",
  phone2: "—",
  facebook: "—",
};

/** ค่าตัวอย่างที่แสดงในผืนกลาง (ฟอร์มจริงพร้อมค่าตัวอย่าง — ไม่ใช่ชื่อ+ชนิดล้วน) */
function sampleValueFor(field: FieldDef): string {
  if (field.isSystem) {
    return SAMPLE_BY_SYSTEM_KEY[field.systemKey ?? field.key] ?? "—";
  }
  if (field.defaultValue !== null && field.defaultValue !== undefined && field.type !== "BOOLEAN") {
    if (Array.isArray(field.defaultValue)) {
      if (field.defaultValue.length > 0) return field.defaultValue.join(", ");
    } else {
      return String(field.defaultValue);
    }
  }
  switch (field.type) {
    case "SELECT": {
      const c = field.options.choices?.[0];
      return c ? c.label : "—";
    }
    case "MULTI_SELECT": {
      const cs = field.options.choices ?? [];
      return cs.length ? cs.slice(0, 2).map((c) => c.label).join(", ") : "—";
    }
    case "NUMBER":
      return "48";
    case "MONEY":
      return "฿1,500";
    case "DATE":
      return "15 มี.ค. 2570";
    case "DATETIME":
      return "15 มี.ค. 2570 09:30";
    case "BOOLEAN":
      return "ใช่";
    case "FILE":
      return "ไฟล์.pdf";
    case "LOOKUP":
      return "ปุ๊ก มณีรัตน์";
    case "TEXT":
    case "LONG_TEXT":
    default:
      return "—";
  }
}

export type TemplateOption = { key: string; name: string; description?: string; sectionsCount: number; fieldsCount: number };

function nextKey(existing: Set<string>, base: string): string {
  let n = 1;
  let key = `${base}${n}`;
  while (existing.has(key)) {
    n += 1;
    key = `${base}${n}`;
  }
  return key;
}

// ───────────────────────── บัฟเฟอร์แก้ไขของแผงคุณสมบัติ (ตีกลับรอบ 1 ข้อ 2) ─────────────────────────

type FieldDraft = {
  label: string;
  options: MemberFieldOptions;
  required: boolean;
  defaultValue: MemberFieldValueInput;
  unique: boolean;
  filterable: boolean;
  showInList: boolean;
  customerEditable: boolean;
  sensitive: boolean;
  trackHistory: boolean;
};

function draftFromField(field: FieldDef): FieldDraft {
  return {
    label: field.label,
    options: field.options,
    required: field.required,
    defaultValue: field.defaultValue,
    unique: field.unique,
    filterable: field.filterable,
    showInList: field.showInList,
    customerEditable: field.customerEditable,
    sensitive: field.sensitive,
    trackHistory: field.trackHistory,
  };
}

function draftEquals(a: FieldDraft, b: FieldDraft): boolean {
  return (
    a.label === b.label &&
    JSON.stringify(a.options) === JSON.stringify(b.options) &&
    a.required === b.required &&
    JSON.stringify(a.defaultValue) === JSON.stringify(b.defaultValue) &&
    a.unique === b.unique &&
    a.filterable === b.filterable &&
    a.showInList === b.showInList &&
    a.customerEditable === b.customerEditable &&
    a.sensitive === b.sensitive &&
    a.trackHistory === b.trackHistory
  );
}

/** patch ที่จะส่งจริง — ฟิลด์ระบบส่งได้เฉพาะคีย์ที่ `fields.ts` อนุญาต (options/unique/defaultValue ต้องไม่ส่ง) */
function buildPatch(field: FieldDef, draft: FieldDraft): UpdateFieldInput {
  const patch: UpdateFieldInput = {
    label: draft.label,
    required: draft.required,
    filterable: draft.filterable,
    showInList: draft.showInList,
    customerEditable: draft.customerEditable,
    sensitive: draft.sensitive,
    trackHistory: draft.trackHistory,
  };
  if (!field.isSystem) {
    patch.options = draft.options;
    patch.unique = draft.unique;
    patch.defaultValue = draft.defaultValue;
  }
  return patch;
}

// ───────────────────────── ชิ้นส่วนย่อยใช้ซ้ำ ─────────────────────────

function Chip({ tone, children }: { tone: "system" | "custom" | "sensitive"; children: React.ReactNode }) {
  const style =
    tone === "system"
      ? { color: "var(--color-muted)", borderColor: "var(--color-line)" }
      : tone === "sensitive"
        ? { color: "var(--color-danger)", borderColor: "var(--color-danger)" }
        : { color: "var(--color-accent)", borderColor: "var(--color-accent)" };
  return (
    <span className="rounded-full border px-2 py-0.5 text-[11px] whitespace-nowrap" style={style}>
      {children}
    </span>
  );
}

function Switch({
  testId,
  checked,
  onChange,
  disabled,
  ariaLabel,
}: {
  testId: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  ariaLabel: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      data-testid={testId}
      disabled={disabled}
      onClick={() => !disabled && onChange(!checked)}
      className="relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors disabled:opacity-40"
      style={{
        background: checked ? "var(--color-accent)" : "var(--color-surface-2)",
        borderColor: checked ? "var(--color-accent)" : "var(--color-line)",
      }}
    >
      <span
        className="inline-block h-3.5 w-3.5 rounded-full transition-transform"
        style={{ background: "var(--color-surface)", transform: checked ? "translateX(18px)" : "translateX(3px)" }}
      />
    </button>
  );
}

function PropRow({ testId, label, children }: { testId: string; label: string; children: React.ReactNode }) {
  return (
    <div data-testid={testId} className="flex items-start justify-between gap-3 py-1.5" style={{ borderBottom: "1px solid var(--color-line)" }}>
      <span className="pt-0.5" style={{ fontSize: 12, color: "var(--color-muted)" }}>
        {label}
      </span>
      <div className="flex flex-1 flex-col items-end gap-1.5">{children}</div>
    </div>
  );
}

// ───────────────────────── palette (ซ้าย) ─────────────────────────

function PaletteItem({ type }: { type: MemberFieldType }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: `pal:${type}` });
  return (
    <button
      ref={setNodeRef}
      type="button"
      data-testid={`field-palette-item-${type}`}
      {...listeners}
      {...attributes}
      title={FIELD_TYPE_HINTS[type]}
      className="flex shrink-0 items-center justify-between gap-2 rounded-lg border px-2.5 py-2 text-left"
      style={{
        borderColor: "var(--color-line)",
        background: isDragging ? "var(--color-surface-2)" : "var(--color-surface)",
        opacity: isDragging ? 0.5 : 1,
        fontSize: 12.5,
        minWidth: 132,
      }}
    >
      <span className="flex items-center gap-2">
        <MemberIcon name={FIELD_TYPE_ICONS[type]} size="sm" />
        {FIELD_TYPE_LABELS[type]}
      </span>
      <MemberIcon name="drag" size="xs" className="text-[color:var(--color-muted)]" />
    </button>
  );
}

// ───────────────────────── ฟิลด์ในผืนกลาง — กล่องฟอร์มจริงพร้อมค่าตัวอย่าง (ตีกลับรอบ 1 ข้อ 1) ─────────────────────────

function FieldRow({ field, selected, onSelect }: { field: FieldDef; selected: boolean; onSelect: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: `fld:${field.id}` });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };
  return (
    <div
      ref={setNodeRef}
      data-testid={`field-item-${field.key}`}
      onClick={onSelect}
      className="flex cursor-pointer flex-col gap-1 rounded-lg border px-3 py-2"
      style={{ ...style, borderColor: selected ? "var(--color-accent)" : "var(--color-line)", borderWidth: selected ? 2 : 1, background: "var(--color-surface)" }}
    >
      <div className="flex items-center justify-between gap-2">
        <span style={{ fontSize: 11, color: "var(--color-muted)" }}>
          {field.label}
          {field.required && <span style={{ color: "var(--color-danger)" }}> *</span>}
        </span>
        <span className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
          {field.isSystem && <Chip tone="system">ระบบ</Chip>}
          {field.sensitive && <MemberIcon name="lock" size="xs" className="text-[color:var(--color-danger)]" />}
          <span {...listeners} {...attributes} className="cursor-grab text-[color:var(--color-muted)]">
            <MemberIcon name="drag" size="xs" />
          </span>
        </span>
      </div>
      <span style={{ fontSize: 13.5, fontWeight: 700 }}>{sampleValueFor(field)}</span>
    </div>
  );
}

// ───────────────────────── การ์ดส่วน ─────────────────────────

function SectionCard({
  section,
  selectedFieldId,
  onSelectField,
  onAddField,
  onRenameSection,
  onDeleteSection,
}: {
  section: SectionDef;
  selectedFieldId: string | null;
  onSelectField: (id: string) => void;
  onAddField: (sectionId: string, type: MemberFieldType) => void;
  onRenameSection: (id: string, label: string) => void;
  onDeleteSection: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef: setSortableRef, transform, transition, isDragging } = useSortable({ id: `sec:${section.id}` });
  const { setNodeRef: setDropRef, isOver } = useDroppable({ id: `cvs:${section.id}` });
  const [addOpen, setAddOpen] = useState(false);
  const activeFields = section.fields.filter((f) => !f.archivedAt);

  return (
    <div
      ref={setSortableRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.6 : 1 }}
      data-testid={`field-section-${section.key}`}
      className="card flex flex-col gap-2.5"
    >
      <div className="flex items-center gap-2">
        <span {...listeners} {...attributes} className="cursor-grab text-[color:var(--color-muted)]">
          <MemberIcon name="drag" size="sm" />
        </span>
        <h2 style={{ fontSize: 13, fontWeight: 700 }}>{section.label}</h2>
        {section.isSystem ? <Chip tone="system">ระบบ</Chip> : <Chip tone="custom">กำหนดเอง</Chip>}
        {section.sensitive && (
          <Chip tone="sensitive">
            <span className="inline-flex items-center gap-1">
              <MemberIcon name="lock" size="xs" /> อ่อนไหว
            </span>
          </Chip>
        )}
        <span className="ml-auto" />
        <button type="button" onClick={() => setAddOpen((o) => !o)} className="rounded-md border p-1" style={{ borderColor: "var(--color-line)" }} title="เพิ่มฟิลด์">
          <MemberIcon name="plus" size="xs" />
        </button>
        {!section.isSystem && activeFields.length === 0 && (
          <button type="button" onClick={() => onDeleteSection(section.id)} className="rounded-md border p-1" style={{ borderColor: "var(--color-line)" }} title="ลบส่วน">
            <MemberIcon name="trash" size="xs" />
          </button>
        )}
      </div>

      {addOpen && (
        <div className="flex flex-wrap gap-1.5 rounded-lg p-2" style={{ background: "var(--color-surface-2)" }}>
          {FIELD_TYPE_ORDER.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => {
                onAddField(section.id, t);
                setAddOpen(false);
              }}
              className="rounded-md border px-2 py-1 text-[11.5px]"
              style={{ borderColor: "var(--color-line)", background: "var(--color-surface)" }}
            >
              {FIELD_TYPE_LABELS[t]}
            </button>
          ))}
        </div>
      )}

      <div
        ref={setDropRef}
        className="grid grid-cols-1 gap-2 rounded-lg sm:grid-cols-2"
        style={{ outline: isOver ? "2px dashed var(--color-accent)" : "none", outlineOffset: 2, minHeight: 40 }}
      >
        <SortableContext items={activeFields.map((f) => `fld:${f.id}`)} strategy={verticalListSortingStrategy}>
          {activeFields.map((f) => (
            <FieldRow key={f.id} field={f} selected={f.id === selectedFieldId} onSelect={() => onSelectField(f.id)} />
          ))}
        </SortableContext>
        {activeFields.length === 0 && (
          <p className="col-span-full" style={{ fontSize: 12, color: "var(--color-muted)" }}>
            ยังไม่มีฟิลด์ในส่วนนี้ — ลากชนิดฟิลด์จากซ้ายมาวาง หรือกด + ด้านบน
          </p>
        )}
      </div>

      {!section.isSystem && <RenameSectionInline label={section.label} onSave={(label) => onRenameSection(section.id, label)} />}
    </div>
  );
}

function RenameSectionInline({ label, onSave }: { label: string; onSave: (label: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(label);
  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => {
          setDraft(label);
          setEditing(true);
        }}
        className="self-start"
        style={{ fontSize: 11, color: "var(--color-muted)" }}
      >
        เปลี่ยนชื่อส่วน
      </button>
    );
  }
  return (
    <div className="flex items-center gap-2">
      <input autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} className="rounded-md border px-2 py-1 text-sm" style={{ borderColor: "var(--color-line)" }} />
      <button
        type="button"
        onClick={() => {
          setEditing(false);
          const trimmed = draft.trim();
          if (trimmed && trimmed !== label) onSave(trimmed);
        }}
        className="btn btn-ghost btn-sm"
      >
        บันทึก
      </button>
    </div>
  );
}

// ───────────────────────── ค่าเริ่มต้นตามชนิด (คุมจาก draft — ไม่ยิง action จนกว่าจะกดบันทึก) ─────────────────────────

function DefaultValueEditor({
  type,
  options,
  value,
  onChange,
}: {
  type: MemberFieldType;
  options: MemberFieldOptions;
  value: MemberFieldValueInput;
  onChange: (v: MemberFieldValueInput) => void;
}) {
  if (type === "BOOLEAN") {
    return <Switch testId="field-prop-default-switch" ariaLabel="ค่าเริ่มต้น" checked={value === true} onChange={(v) => onChange(v)} />;
  }
  if (type === "SELECT") {
    const choices = options.choices ?? [];
    return (
      <select
        value={typeof value === "string" ? value : ""}
        onChange={(e) => onChange(e.target.value === "" ? null : e.target.value)}
        className="rounded-md border px-2 py-1 text-sm"
        style={{ borderColor: "var(--color-line)" }}
      >
        <option value="">— ไม่ตั้งค่าเริ่มต้น —</option>
        {choices.map((c) => (
          <option key={c.value} value={c.value}>
            {c.label}
          </option>
        ))}
      </select>
    );
  }
  if (type === "MULTI_SELECT" || type === "FILE" || type === "LOOKUP") {
    return <span style={{ fontSize: 12, color: "var(--color-muted)" }}>—</span>;
  }
  const strValue = value === null || value === undefined ? "" : String(value);
  return (
    <input
      value={strValue}
      onChange={(e) => {
        const raw = e.target.value;
        if (raw === "") {
          onChange(null);
          return;
        }
        if (type === "NUMBER" || type === "MONEY") {
          const n = Number(raw);
          onChange(Number.isFinite(n) ? n : value);
          return;
        }
        onChange(raw);
      }}
      type={type === "NUMBER" || type === "MONEY" ? "text" : type === "DATE" ? "date" : type === "DATETIME" ? "datetime-local" : "text"}
      className="rounded-md border px-2 py-1 text-sm"
      style={{ borderColor: "var(--color-line)", width: 150 }}
    />
  );
}

// ───────────────────────── ตัวเลือกเพิ่มเติมตามชนิด (field-prop-options · คุมจาก draft) ─────────────────────────

function ChoicesEditor({ options, onChange }: { options: MemberFieldOptions; onChange: (choices: MemberFieldChoice[]) => void }) {
  const choices = options.choices ?? [];
  const update = (idx: number, patch: Partial<MemberFieldChoice>) => onChange(choices.map((c, i) => (i === idx ? { ...c, ...patch } : c)));
  const remove = (idx: number) => onChange(choices.filter((_, i) => i !== idx));
  const add = () => {
    if (choices.length >= MEMBER_LIMITS.choices) return;
    const value = nextKey(new Set(choices.map((c) => c.value)), "option");
    onChange([...choices, { value, label: `ตัวเลือก ${choices.length + 1}` }]);
  };
  return (
    <div className="flex w-full flex-col gap-1.5">
      {choices.map((c, i) => (
        <div key={c.value} className="flex items-center gap-1.5">
          <input
            value={c.label}
            onChange={(e) => update(i, { label: e.target.value })}
            className="min-w-0 flex-1 rounded-md border px-2 py-1 text-xs"
            style={{ borderColor: "var(--color-line)" }}
          />
          <select value={c.color ?? ""} onChange={(e) => update(i, { color: e.target.value || undefined })} className="rounded-md border px-1 py-1 text-xs" style={{ borderColor: "var(--color-line)" }}>
            <option value="">สี</option>
            {CHOICE_COLORS.map((cc) => (
              <option key={cc.key} value={cc.key}>
                {cc.label}
              </option>
            ))}
          </select>
          <button type="button" onClick={() => remove(i)} title="ลบตัวเลือก">
            <MemberIcon name="x" size="xs" className="text-[color:var(--color-muted)]" />
          </button>
        </div>
      ))}
      <button type="button" onClick={add} className="self-start" style={{ fontSize: 11.5, color: "var(--color-accent)" }}>
        + เพิ่มตัวเลือก
      </button>
    </div>
  );
}

function FieldOptions({ type, options, onChange }: { type: MemberFieldType; options: MemberFieldOptions; onChange: (options: MemberFieldOptions) => void }) {
  if (type === "SELECT" || type === "MULTI_SELECT") {
    return <ChoicesEditor options={options} onChange={(choices) => onChange({ ...options, choices })} />;
  }
  if (type === "LOOKUP") {
    return (
      <select
        value={options.target ?? "CUSTOMER"}
        onChange={(e) => onChange({ ...options, target: e.target.value as MemberLookupTarget })}
        className="rounded-md border px-2 py-1 text-sm"
        style={{ borderColor: "var(--color-line)" }}
      >
        {LOOKUP_TARGETS.map((t) => (
          <option key={t.value} value={t.value}>
            {t.label}
          </option>
        ))}
      </select>
    );
  }
  if (type === "NUMBER" || type === "MONEY") {
    return (
      <input
        value={options.unit ?? ""}
        placeholder="หน่วย เช่น ไดฟ์, บาท"
        onChange={(e) => onChange({ ...options, unit: e.target.value || undefined })}
        className="rounded-md border px-2 py-1 text-sm"
        style={{ borderColor: "var(--color-line)" }}
      />
    );
  }
  if (type === "TEXT" || type === "LONG_TEXT") {
    return (
      <input
        value={options.maxLength ? String(options.maxLength) : ""}
        placeholder="ความยาวสูงสุด (ตัวอักษร)"
        onChange={(e) => {
          const n = Number(e.target.value);
          onChange({ ...options, maxLength: Number.isFinite(n) && n > 0 ? n : undefined });
        }}
        className="rounded-md border px-2 py-1 text-sm"
        style={{ borderColor: "var(--color-line)" }}
      />
    );
  }
  return <span style={{ fontSize: 12, color: "var(--color-muted)" }}>ชนิดนี้ไม่มีค่าตั้งเพิ่มเติม</span>;
}

// ───────────────────────── ส่วนประกอบหลัก ─────────────────────────

export function FieldDesigner({
  systemId,
  initialSections,
  templates,
}: {
  systemId: string;
  initialSections: SectionDef[];
  templates: TemplateOption[];
}) {
  const router = useRouter();
  const [sections, setSections] = useState<SectionDef[]>(initialSections);
  useEffect(() => setSections(initialSections), [initialSections]);

  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);
  const [fieldDraft, setFieldDraft] = useState<FieldDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [mobilePreviewOpen, setMobilePreviewOpen] = useState(false);
  const [addingSection, setAddingSection] = useState(false);
  const [newSectionLabel, setNewSectionLabel] = useState("");
  const [templateKey, setTemplateKey] = useState(templates[0]?.key ?? "");
  const [templatePreview, setTemplatePreview] = useState<TemplatePreviewData | null>(null);
  const [templateParts, setTemplateParts] = useState<Record<TemplatePart, boolean>>({ fields: true, tiers: true, stamps: true, journeys: true });
  const [templateApplyResult, setTemplateApplyResult] = useState<{ sections: number; fields: number; tiers: number; stamps: number; journeys: number } | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const allFieldsFlat = useMemo(() => sections.flatMap((s) => s.fields), [sections]);
  const activeFieldCount = useMemo(() => allFieldsFlat.filter((f) => !f.archivedAt).length, [allFieldsFlat]);
  const archivedFields = useMemo(() => allFieldsFlat.filter((f) => f.archivedAt), [allFieldsFlat]);
  const fieldById = useMemo(() => new Map(allFieldsFlat.map((f) => [f.id, f])), [allFieldsFlat]);
  const selectedField = selectedFieldId ? (fieldById.get(selectedFieldId) ?? null) : null;
  const selectedTemplate = templates.find((t) => t.key === templateKey) ?? null;

  // บัฟเฟอร์ของแผงคุณสมบัติ — รีเซ็ตเฉพาะตอน "เปลี่ยนฟิลด์ที่เลือก" (ไม่ใช่ทุกครั้งที่ sections เปลี่ยนจากที่อื่น
  // ไม่งั้นการแก้ไขที่ยังไม่บันทึกจะหายเงียบ ๆ เวลามีคนอื่นแก้ฟิลด์อื่นพร้อมกัน)
  useEffect(() => {
    setFieldDraft(selectedField ? draftFromField(selectedField) : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedFieldId]);

  // เลือกเทมเพลตใหม่ → ดึงแผงตัวอย่าง (มีแล้ว/ใหม่ ต่อฟิลด์ + นับทุกส่วน) จาก server action เสมอ
  useEffect(() => {
    let cancelled = false;
    setTemplateApplyResult(null);
    if (!templateKey) {
      setTemplatePreview(null);
      return;
    }
    void previewTemplateAction({ systemId, templateKey }).then((res) => {
      if (cancelled) return;
      if (!res.ok) {
        setTemplatePreview(null);
        return;
      }
      setTemplatePreview(res.data);
    });
    return () => {
      cancelled = true;
    };
  }, [systemId, templateKey]);

  const dirty = !!(selectedField && fieldDraft && !draftEquals(fieldDraft, draftFromField(selectedField)));

  function showError(reason: string) {
    setToast(reason);
  }

  function updateDraft(patch: Partial<FieldDraft>) {
    setFieldDraft((prev) => (prev ? { ...prev, ...patch } : prev));
  }

  async function handleAddField(sectionId: string, type: MemberFieldType) {
    if (activeFieldCount >= MEMBER_LIMITS.fields) {
      showError(`ระบบสมาชิกนี้มีฟิลด์ครบ ${MEMBER_LIMITS.fields} ฟิลด์แล้ว`);
      return;
    }
    const key = nextKey(new Set(allFieldsFlat.map((f) => f.key)), FIELD_TYPE_ICONS[type]);
    const options =
      type === "SELECT" || type === "MULTI_SELECT"
        ? { choices: [{ value: "option1", label: "ตัวเลือก 1" }] }
        : type === "LOOKUP"
          ? { target: "CUSTOMER" as MemberLookupTarget }
          : undefined;
    const res = await createFieldAction({ systemId, sectionId, key, label: FIELD_TYPE_LABELS[type], type, options });
    if (!res.ok) {
      showError(res.reason);
      return;
    }
    setSections((prev) => prev.map((s) => (s.id === sectionId ? { ...s, fields: [...s.fields, res.data] } : s)));
    setSelectedFieldId(res.data.id);
  }

  async function handleAddSection() {
    const label = newSectionLabel.trim();
    if (!label) return;
    const key = nextKey(new Set(sections.map((s) => s.key)), "custom");
    const res = await createSectionAction({ systemId, key, label });
    if (!res.ok) {
      showError(res.reason);
      return;
    }
    setSections((prev) => [...prev, { ...res.data, fields: [] }]);
    setNewSectionLabel("");
    setAddingSection(false);
  }

  async function handleRenameSection(id: string, label: string) {
    const res = await updateSectionAction({ systemId, id, patch: { label } });
    if (!res.ok) {
      showError(res.reason);
      return;
    }
    setSections((prev) => prev.map((s) => (s.id === id ? { ...s, label: res.data.label } : s)));
  }

  async function handleDeleteSection(id: string) {
    const res = await deleteSectionAction({ systemId, id });
    if (!res.ok) {
      showError(res.reason);
      return;
    }
    setSections((prev) => prev.filter((s) => s.id !== id));
  }

  /** ตีกลับรอบ 1 ข้อ 2 — ปุ่ม "บันทึก" ของแผงคุณสมบัติ: ยิง updateFieldAction ครั้งเดียวจากบัฟเฟอร์ */
  async function handleSaveField() {
    if (!selectedField || !fieldDraft || !dirty) return;
    setSaving(true);
    try {
      const patch = buildPatch(selectedField, fieldDraft);
      const res = await updateFieldAction({ systemId, id: selectedField.id, patch });
      if (!res.ok) {
        showError(res.reason);
        return;
      }
      setSections((prev) => prev.map((s) => (s.id === selectedField.sectionId ? { ...s, fields: s.fields.map((f) => (f.id === selectedField.id ? res.data : f)) } : s)));
      setFieldDraft(draftFromField(res.data));
    } finally {
      setSaving(false);
    }
  }

  async function confirmArchive(fd: FormData) {
    const id = String(fd.get("id") ?? "");
    const res = await archiveFieldAction({ systemId, id });
    if (!res.ok) {
      showError(res.reason);
      return;
    }
    setSections((prev) => prev.map((s) => ({ ...s, fields: s.fields.map((f) => (f.id === id ? res.data : f)) })));
    setSelectedFieldId(null);
  }

  async function handleRestore(id: string) {
    const res = await restoreFieldAction({ systemId, id });
    if (!res.ok) {
      showError(res.reason);
      return;
    }
    setSections((prev) => prev.map((s) => ({ ...s, fields: s.fields.map((f) => (f.id === id ? res.data : f)) })));
  }

  function toggleTemplatePart(part: TemplatePart) {
    setTemplateParts((prev) => ({ ...prev, [part]: !prev[part] }));
  }

  async function confirmApplyTemplate() {
    if (!templateKey) return;
    const parts = ALL_TEMPLATE_PARTS.filter((p) => templateParts[p]);
    const res = await applyTemplateAction({ systemId, templateKey, parts });
    if (!res.ok) {
      showError(res.reason);
      return;
    }
    setTemplateApplyResult(res.data.added);
    const pv = await previewTemplateAction({ systemId, templateKey });
    if (pv.ok) setTemplatePreview(pv.data);
    router.refresh();
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over) return;
    const activeId = String(active.id);
    const overId = String(over.id);

    if (activeId.startsWith("pal:")) {
      const type = activeId.slice(4) as MemberFieldType;
      const targetSectionId = overId.startsWith("cvs:")
        ? overId.slice(4)
        : overId.startsWith("fld:")
          ? (fieldById.get(overId.slice(4))?.sectionId ?? null)
          : overId.startsWith("sec:")
            ? overId.slice(4)
            : null;
      if (targetSectionId) void handleAddField(targetSectionId, type);
      return;
    }

    if (activeId.startsWith("sec:") && overId.startsWith("sec:") && activeId !== overId) {
      const a = activeId.slice(4);
      const o = overId.slice(4);
      const ids = sections.map((s) => s.id);
      const oldIndex = ids.indexOf(a);
      const newIndex = ids.indexOf(o);
      if (oldIndex < 0 || newIndex < 0) return;
      const nextOrder = arrayMove(ids, oldIndex, newIndex);
      setSections((prev) => nextOrder.map((id) => prev.find((s) => s.id === id)!));
      void reorderSectionsAction({ systemId, ids: nextOrder }).then((res) => {
        if (!res.ok) showError(res.reason);
      });
      return;
    }

    if (activeId.startsWith("fld:") && overId.startsWith("fld:") && activeId !== overId) {
      const a = activeId.slice(4);
      const o = overId.slice(4);
      const activeFieldRow = fieldById.get(a);
      const overFieldRow = fieldById.get(o);
      if (!activeFieldRow || !overFieldRow || activeFieldRow.sectionId !== overFieldRow.sectionId) return;
      const sectionId = activeFieldRow.sectionId;
      const section = sections.find((s) => s.id === sectionId);
      if (!section) return;
      const ids = section.fields.filter((f) => !f.archivedAt).map((f) => f.id);
      const oldIndex = ids.indexOf(a);
      const newIndex = ids.indexOf(o);
      if (oldIndex < 0 || newIndex < 0) return;
      const nextIds = arrayMove(ids, oldIndex, newIndex);
      setSections((prev) =>
        prev.map((s) => {
          if (s.id !== sectionId) return s;
          const byId = new Map(s.fields.map((f) => [f.id, f]));
          const archived = s.fields.filter((f) => f.archivedAt);
          return { ...s, fields: [...nextIds.map((id) => byId.get(id)!), ...archived] };
        }),
      );
      void reorderFieldsAction({ systemId, sectionId, ids: nextIds }).then((res) => {
        if (!res.ok) showError(res.reason);
      });
    }
  }

  return (
    <div data-testid="field-designer" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <span style={{ fontSize: 12, color: "var(--color-muted)" }}>เทมเพลต:</span>
        <select
          data-testid="field-template-select"
          value={templateKey}
          onChange={(e) => setTemplateKey(e.target.value)}
          className="rounded-lg border px-2.5 py-1.5 text-sm"
          style={{ borderColor: "var(--color-line)" }}
        >
          {templates.length === 0 && <option value="">ยังไม่มีเทมเพลต</option>}
          {templates.map((t) => (
            <option key={t.key} value={t.key}>
              {t.name}
            </option>
          ))}
        </select>
        {selectedTemplate && (
          <ConfirmDialog
            testId="field-apply-template"
            triggerLabel="ใช้เทมเพลต"
            triggerClassName="btn btn-ghost btn-sm"
            title={`ใช้เทมเพลต "${selectedTemplate.name}"?`}
            detail={`จะเพิ่ม ${selectedTemplate.sectionsCount} ส่วน / ${selectedTemplate.fieldsCount} ฟิลด์ที่ยังไม่มี — ไม่ทับของเดิมที่ตั้งไว้แล้ว`}
            confirmLabel="ใช้เทมเพลตนี้"
            action={confirmApplyTemplate}
          />
        )}
        <span className="flex-1" />
        <button type="button" onClick={() => setMobilePreviewOpen((o) => !o)} className="btn btn-ghost btn-sm">
          <MemberIcon name="cam" size="xs" /> ตัวอย่างมือถือ
        </button>
        {dirty && (
          <span style={{ fontSize: 11.5, color: "var(--color-accent)" }}>มีการแก้ไขที่ยังไม่บันทึก</span>
        )}
        <button
          type="button"
          data-testid="field-save"
          onClick={() => void handleSaveField()}
          disabled={!dirty || saving}
          className="btn btn-primary btn-sm disabled:opacity-40"
        >
          <MemberIcon name="check" size="xs" /> {saving ? "กำลังบันทึก…" : "บันทึก"}
        </button>
      </div>

      {templatePreview && (
        <TemplatePreviewPanel preview={templatePreview} parts={templateParts} onToggle={toggleTemplatePart} />
      )}
      {templateApplyResult && (
        <div data-testid="template-apply-result" style={{ fontSize: 12.5, color: "var(--color-muted)" }}>
          เพิ่มส่วน {templateApplyResult.sections} · ฟิลด์ {templateApplyResult.fields} · ระดับ {templateApplyResult.tiers} · สแตมป์ {templateApplyResult.stamps} · journey {templateApplyResult.journeys}
        </div>
      )}

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <div className="flex flex-col gap-3 md:flex-row md:items-start">
          {/* ซ้าย: palette ชนิดฟิลด์ — แถบเลื่อนบนมือถือ · คอลัมน์บนเดสก์ท็อป */}
          <div
            data-testid="field-palette"
            className="flex gap-1.5 overflow-x-auto rounded-xl border p-2 md:w-52 md:shrink-0 md:flex-col md:overflow-visible"
            style={{ borderColor: "var(--color-line)", background: "var(--color-surface-2)" }}
          >
            {FIELD_TYPE_ORDER.map((t) => (
              <PaletteItem key={t} type={t} />
            ))}
          </div>

          {/* กลาง: ผืนฟอร์มจริงพร้อมค่าตัวอย่าง */}
          <div className="flex min-w-0 flex-1 flex-col gap-3">
            <SortableContext items={sections.map((s) => `sec:${s.id}`)} strategy={verticalListSortingStrategy}>
              {sections.map((s) => (
                <SectionCard
                  key={s.id}
                  section={s}
                  selectedFieldId={selectedFieldId}
                  onSelectField={setSelectedFieldId}
                  onAddField={handleAddField}
                  onRenameSection={handleRenameSection}
                  onDeleteSection={handleDeleteSection}
                />
              ))}
            </SortableContext>

            {addingSection ? (
              <div className="flex items-center gap-2 rounded-xl border p-2.5" style={{ borderColor: "var(--color-line)" }}>
                <input
                  autoFocus
                  value={newSectionLabel}
                  onChange={(e) => setNewSectionLabel(e.target.value)}
                  placeholder="ชื่อส่วนใหม่ เช่น ข้อมูลอุปกรณ์"
                  className="flex-1 rounded-md border px-2 py-1.5 text-sm"
                  style={{ borderColor: "var(--color-line)" }}
                />
                <button type="button" onClick={handleAddSection} className="btn btn-primary btn-sm">
                  เพิ่ม
                </button>
                <button type="button" onClick={() => setAddingSection(false)} className="btn btn-ghost btn-sm">
                  ยกเลิก
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setAddingSection(true)}
                disabled={sections.length >= MEMBER_LIMITS.sections}
                className="flex items-center justify-center gap-1.5 rounded-xl border border-dashed py-2.5 disabled:opacity-40"
                style={{ borderColor: "var(--color-line)", color: "var(--color-muted)", fontSize: 12.5 }}
              >
                <MemberIcon name="plus" size="sm" /> เพิ่มส่วน
              </button>
            )}

            {archivedFields.length > 0 && (
              <div className="flex flex-col gap-1.5 rounded-xl border p-2.5" style={{ borderColor: "var(--color-line)" }}>
                <span style={{ fontSize: 11.5, color: "var(--color-muted)" }}>ฟิลด์ที่เก็บเข้าคลัง ({archivedFields.length})</span>
                {archivedFields.map((f) => (
                  <div key={f.id} className="flex items-center justify-between gap-2">
                    <span style={{ fontSize: 12.5 }}>{f.label}</span>
                    <button type="button" onClick={() => void handleRestore(f.id)} className="inline-flex items-center gap-1" style={{ fontSize: 11.5, color: "var(--color-accent)" }}>
                      <MemberIcon name="restore" size="xs" /> กู้คืน
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* แถบล่างของผืนฟอร์ม (ตีกลับรอบ 1 ข้อ 3) — ตัวนับย้ายมาจากแถบบน */}
            <div className="flex items-center justify-between rounded-b-xl border-t px-1 pt-2" style={{ borderColor: "var(--color-line)" }}>
              <span data-testid="field-counter" style={{ fontSize: 12, color: "var(--color-muted)" }}>
                ฟิลด์ {activeFieldCount} / {MEMBER_LIMITS.fields}
              </span>
              <span style={{ fontSize: 11.5, color: "var(--color-muted)" }}>ฟิลด์ระบบซ่อนได้ ลบไม่ได้</span>
            </div>
          </div>

          {/* ขวา: คุณสมบัติฟิลด์ — sidebar บนเดสก์ท็อป (แสดงเสมอ) · sheet ล่างติดจอบนมือถือ (ซ่อนถ้ายังไม่เลือกฟิลด์ — ตีกลับรอบ 1 ข้อ 5) */}
          <aside
            data-testid="field-props"
            className={`flex-col gap-1.5 rounded-t-2xl border p-3 md:static md:inset-auto md:z-auto md:flex md:w-80 md:shrink-0 md:rounded-2xl ${selectedField ? "flex fixed inset-x-0 bottom-0 z-30" : "hidden"}`}
            style={{ borderColor: "var(--color-line)", background: "var(--color-surface)", maxHeight: "70vh", overflowY: "auto" }}
          >
            <div className="flex items-center justify-between">
              <span data-testid="field-props-label" style={{ fontSize: 12, fontWeight: 600, color: "var(--color-muted)" }}>
                {selectedField ? `คุณสมบัติฟิลด์ — ${selectedField.label}` : "คุณสมบัติฟิลด์"}
              </span>
              {selectedField && (
                <button type="button" onClick={() => setSelectedFieldId(null)} className="md:hidden" title="ปิด">
                  <MemberIcon name="x" size="xs" />
                </button>
              )}
            </div>
            {!selectedField && <p style={{ fontSize: 12, color: "var(--color-muted)" }}>เลือกฟิลด์ทางซ้ายเพื่อแก้ไขคุณสมบัติ</p>}
            {selectedField && fieldDraft && (
              <FieldPropsPanel key={selectedField.id} field={selectedField} draft={fieldDraft} onDraftChange={updateDraft} onArchive={confirmArchive} />
            )}
          </aside>
        </div>
      </DndContext>

      {mobilePreviewOpen && (
        <div
          data-testid="field-preview-mobile"
          className="fixed bottom-4 right-4 z-40 flex w-64 flex-col gap-2 rounded-2xl border p-3 shadow-lg"
          style={{ borderColor: "var(--color-line)", background: "var(--color-surface)", maxHeight: "70vh", overflowY: "auto" }}
        >
          <div className="flex items-center justify-between">
            <span style={{ fontSize: 12, fontWeight: 600 }}>ตัวอย่างมือถือ</span>
            <button type="button" onClick={() => setMobilePreviewOpen(false)}>
              <MemberIcon name="x" size="xs" />
            </button>
          </div>
          {templatePreview ? (
            // เลือกเทมเพลตไว้ (ยังไม่ apply) — โชว์ฟิลด์ของเทมเพลตนั้น (ภาพ 03: "ตัวอย่างมือถือ" คู่กับแผงตัวอย่าง)
            templatePreview.sections.map((s) => (
              <div key={s.key} className="flex flex-col gap-1 rounded-lg p-2" style={{ background: "var(--color-surface-2)" }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: "var(--color-muted)" }}>{s.label}</span>
                {s.fields.map((f) => (
                  <span key={f.key} style={{ fontSize: 11.5 }}>
                    {f.label} {f.exists && <em style={{ fontStyle: "normal", color: "var(--color-muted)" }}>(มีแล้ว)</em>}
                  </span>
                ))}
              </div>
            ))
          ) : (
            sections.map((s) => {
              const active = s.fields.filter((f) => !f.archivedAt);
              if (active.length === 0) return null;
              return (
                <div key={s.id} className="flex flex-col gap-1 rounded-lg p-2" style={{ background: "var(--color-surface-2)" }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: "var(--color-muted)" }}>{s.label}</span>
                  {active.map((f) => (
                    <span key={f.id} style={{ fontSize: 11.5 }}>
                      {f.label}: {sampleValueFor(f)}
                    </span>
                  ))}
                </div>
              );
            })
          )}
        </div>
      )}

      {toast && (
        <div
          role="alert"
          className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-xl border px-4 py-2"
          style={{ borderColor: "var(--color-danger)", background: "var(--color-surface)", color: "var(--color-danger)", fontSize: 13 }}
          onClick={() => setToast(null)}
        >
          {toast}
        </div>
      )}
    </div>
  );
}

// ───────────────────────── แผงคุณสมบัติของฟิลด์ที่เลือก (คุมจาก draft — บันทึกรวมที่ปุ่มบนสุด) ─────────────────────────

function FieldPropsPanel({
  field,
  draft,
  onDraftChange,
  onArchive,
}: {
  field: FieldDef;
  draft: FieldDraft;
  onDraftChange: (patch: Partial<FieldDraft>) => void;
  onArchive: (fd: FormData) => void | Promise<void>;
}) {
  const locked = field.isSystem; // ฟิลด์ระบบ: แก้ type/key/options/unique/defaultValue/archive ไม่ได้ (§11.2)

  return (
    <div className="flex flex-col">
      {locked && (
        <p className="mb-1.5 flex items-center gap-1.5" style={{ fontSize: 11.5, color: "var(--color-muted)" }}>
          <MemberIcon name="lock" size="xs" /> ฟิลด์ระบบ — แก้ชนิด/ตัวเลือก/ห้ามซ้ำ/ค่าเริ่มต้นไม่ได้
        </p>
      )}

      <PropRow testId="field-prop-label" label="ป้าย">
        <input value={draft.label} onChange={(e) => onDraftChange({ label: e.target.value })} className="w-full rounded-md border px-2 py-1 text-sm" style={{ borderColor: "var(--color-line)" }} />
      </PropRow>

      <PropRow testId="field-prop-type" label="ชนิด">
        <span style={{ fontSize: 12.5 }}>{FIELD_TYPE_LABELS[field.type]}</span>
      </PropRow>

      <PropRow testId="field-prop-options" label="ตัวเลือก">
        {locked ? (
          <span style={{ fontSize: 12, color: "var(--color-muted)" }}>ฟิลด์ระบบ — แก้ไม่ได้</span>
        ) : (
          <FieldOptions type={field.type} options={draft.options} onChange={(options) => onDraftChange({ options })} />
        )}
      </PropRow>

      <PropRow testId="field-prop-required" label="บังคับกรอก">
        <Switch testId="field-prop-required-switch" ariaLabel="บังคับกรอก" checked={draft.required} onChange={(v) => onDraftChange({ required: v })} />
      </PropRow>

      <PropRow testId="field-prop-default" label="ค่าเริ่มต้น">
        {locked ? (
          <span style={{ fontSize: 12, color: "var(--color-muted)" }}>—</span>
        ) : (
          <DefaultValueEditor type={field.type} options={draft.options} value={draft.defaultValue} onChange={(v) => onDraftChange({ defaultValue: v })} />
        )}
      </PropRow>

      <PropRow testId="field-prop-unique" label="ห้ามซ้ำ">
        <Switch testId="field-prop-unique-switch" ariaLabel="ห้ามซ้ำ" checked={draft.unique} disabled={locked} onChange={(v) => onDraftChange({ unique: v })} />
      </PropRow>

      <PropRow testId="field-prop-filterable" label="ใช้กรอง/แคมเปญ">
        <Switch testId="field-prop-filterable-switch" ariaLabel="ใช้กรองได้" checked={draft.filterable} onChange={(v) => onDraftChange({ filterable: v })} />
      </PropRow>

      <PropRow testId="field-prop-showInList" label="แสดงในรายการ">
        <Switch testId="field-prop-showInList-switch" ariaLabel="แสดงในรายการ" checked={draft.showInList} onChange={(v) => onDraftChange({ showInList: v })} />
      </PropRow>

      <PropRow testId="field-prop-customerEditable" label="ลูกค้าแก้เองบน LINE">
        <Switch
          testId="field-prop-customerEditable-switch"
          ariaLabel="ลูกค้าแก้เองบน LINE"
          checked={draft.customerEditable}
          onChange={(v) => onDraftChange({ customerEditable: v && draft.sensitive ? false : v })}
        />
        {draft.sensitive && <span style={{ fontSize: 10.5, color: "var(--color-danger)" }}>ฟิลด์ข้อมูลอ่อนไหว — ไม่ควรเปิดให้ลูกค้าแก้เอง</span>}
      </PropRow>

      <PropRow testId="field-prop-sensitive" label="ข้อมูลอ่อนไหว">
        <Switch testId="field-prop-sensitive-switch" ariaLabel="ข้อมูลอ่อนไหว" checked={draft.sensitive} onChange={(v) => onDraftChange({ sensitive: v })} />
      </PropRow>

      <PropRow testId="field-prop-trackHistory" label="เก็บประวัติการแก้">
        <Switch testId="field-prop-trackHistory-switch" ariaLabel="เก็บประวัติการแก้" checked={draft.trackHistory} onChange={(v) => onDraftChange({ trackHistory: v })} />
      </PropRow>

      {!locked && (
        <div className="mt-2">
          <ConfirmDialog
            testId="field-archive"
            triggerLabel={
              <span className="inline-flex items-center gap-1.5">
                <MemberIcon name="trash" size="xs" /> เก็บฟิลด์เข้าคลัง
              </span>
            }
            triggerClassName="text-left"
            title={`เก็บฟิลด์ "${field.label}" เข้าคลัง?`}
            detail="ฟิลด์นี้จะซ่อนจากฟอร์ม — ค่าของสมาชิกเดิมยังอยู่ครบ กู้คืนได้ภายหลัง"
            confirmLabel="เก็บเข้าคลัง"
            danger
            fields={{ id: field.id }}
            action={onArchive}
          />
        </div>
      )}
    </div>
  );
}

export default FieldDesigner;
