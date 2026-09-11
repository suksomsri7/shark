// TemplatePreview.tsx — แผงตัวอย่างเทมเพลตกิจการ (M3.9 · ภาพ 03 kbar) · ใช้ใน FieldDesigner.tsx เท่านั้น
//
// 🔴 component ไม่มีสถานะเอง — รับ preview (จาก previewTemplateAction ของหน้าแม่) + parts ที่ติ๊กไว้มาวาดล้วน ๆ
//    ไม่ import prisma/facade — type-only จาก templates-service.ts เท่านั้น
"use client";

import type { TemplatePart, TemplatePreview as TemplatePreviewData } from "@/lib/modules/member/templates-service";

// 🔴 testid ของ 4 เช็กบ็อกซ์ต้องเป็นสตริงตรงตัว (ไม่ใช่ template literal ต่อ key) — ข้อสอบ M3.9-S4.1
//    grep หาข้อความ "template-part-fields"/"template-part-tiers"/"template-part-stamps"/"template-part-journeys"
//    ตรง ๆ ในซอร์สโค้ด ไม่ได้รันจริงมาเทียบ
const PART_TESTID: Record<TemplatePart, string> = {
  fields: "template-part-fields",
  tiers: "template-part-tiers",
  stamps: "template-part-stamps",
  journeys: "template-part-journeys",
};

const PART_ROWS: { key: TemplatePart; label: string }[] = [
  { key: "fields", label: "ฟิลด์" },
  { key: "tiers", label: "ระดับ" },
  { key: "stamps", label: "สแตมป์" },
  { key: "journeys", label: "journey" },
];

export function TemplatePreviewPanel({
  preview,
  parts,
  onToggle,
}: {
  preview: TemplatePreviewData;
  parts: Record<TemplatePart, boolean>;
  onToggle: (part: TemplatePart) => void;
}) {
  const c = preview.counts;
  const allFields = preview.sections.flatMap((s) => s.fields);

  return (
    <div
      data-testid="template-preview"
      className="flex flex-col gap-2.5 rounded-xl border p-3"
      style={{ borderColor: "var(--color-line)", background: "var(--color-surface-2)" }}
    >
      <div className="flex flex-wrap items-baseline gap-2">
        <strong style={{ fontSize: 13.5 }}>{preview.template.name}</strong>
      </div>

      <div data-testid="template-preview-counts" className="flex flex-wrap gap-x-3 gap-y-1" style={{ fontSize: 12, color: "var(--color-muted)" }}>
        <span>ส่วน {c.sections} (ใหม่ {c.newSections})</span>
        <span>ฟิลด์ {c.fields} (ใหม่ {c.newFields})</span>
        <span>ระดับ {c.tiers} (ใหม่ {c.newTiers})</span>
        <span>สแตมป์ {c.stamps} (ใหม่ {c.newStamps})</span>
        <span>journey {c.journeys} (ใหม่ {c.newJourneys})</span>
      </div>

      <div className="flex flex-wrap gap-3">
        {PART_ROWS.map((p) => (
          <label key={p.key} data-testid={PART_TESTID[p.key]} className="flex items-center gap-1.5" style={{ fontSize: 12.5 }}>
            <input type="checkbox" checked={parts[p.key]} onChange={() => onToggle(p.key)} />
            นำเข้า{p.label}
          </label>
        ))}
      </div>

      {allFields.length > 0 && (
        <div className="flex min-w-0 flex-col gap-1 rounded-lg border p-2" style={{ borderColor: "var(--color-line)" }}>
          {allFields.map((f) => (
            <div key={f.key} data-testid={`template-field-row-${f.key}`} className="flex min-w-0 items-center justify-between gap-2" style={{ fontSize: 12.5 }}>
              <span className="min-w-0 truncate">{f.label}</span>
              {f.exists ? (
                <span style={{ fontSize: 11, color: "var(--color-muted)" }}>มีแล้ว</span>
              ) : (
                <span style={{ fontSize: 11, color: "var(--color-accent)" }}>ใหม่</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
