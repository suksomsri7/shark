"use client";

// MergeFieldChoices.tsx — เลือกค่าต่อฟิลด์ในแผ่นรวมของผู้ติดต่อ 360 / บริษัท 360 (ใบ C1.11 · มติผู้คุมงาน C1.11 ข้อ 5 · รีวิว SF-5)
// แสดงค่าทั้งสองฝั่ง · เสนอเฉพาะฟิลด์ที่อีกฝั่งมีค่าและต่างจากฝั่งที่เก็บไว้ · ติ๊ก = `fieldChoices[field] = "merge"` (ใช้ค่าของรายการที่ถูกรวม)
// ไม่ติ๊ก = ใช้ค่าของรายการที่เก็บไว้ (ช่องที่ฝั่งที่เก็บไว้ว่าง บริการเติมจากอีกฝั่งให้เอง)
// 🔴 ไฟล์ client บริสุทธิ์ (ไม่ import โมดูล CRM) — ค่าทั้งสองฝั่งมาทาง props (ผ่านการมองเห็นฝั่งเซิร์ฟเวอร์แล้ว)

type Vals = Record<string, string | null>;

/** ฟิลด์ที่มีให้เลือกจริง: อีกฝั่งมีค่า และต่างจากฝั่งที่เก็บไว้ */
export function choosableFields(fields: { key: string; label: string }[], keep: Vals, other: Vals): { key: string; label: string }[] {
  return fields.filter((f) => (other[f.key] ?? "") !== "" && (other[f.key] ?? "") !== (keep[f.key] ?? ""));
}

export function MergeFieldChoices({
  fields,
  keepLabel,
  otherLabel,
  keep,
  other,
  value,
  onChange,
}: {
  fields: { key: string; label: string }[];
  keepLabel: string;
  otherLabel: string;
  keep: Vals;
  other: Vals;
  value: Record<string, boolean>;
  onChange: (next: Record<string, boolean>) => void;
}) {
  const list = choosableFields(fields, keep, other);
  if (list.length === 0) {
    return <p className="text-xs text-[color:var(--color-muted)]">ค่าที่กรอกไว้ไม่ขัดกัน — ช่องที่รายการที่เก็บไว้ว่างอยู่จะเติมจากอีกรายการให้</p>;
  }
  return (
    <fieldset className="flex min-w-0 flex-col gap-2 text-sm">
      <legend className="mb-1 text-xs text-[color:var(--color-muted)]">ค่าที่ต่างกัน — ติ๊กเพื่อใช้ค่าของ {otherLabel} แทนค่าของ {keepLabel}</legend>
      {list.map((f) => (
        <label key={f.key} className="flex min-w-0 items-start gap-2 rounded-lg border p-2" style={{ borderColor: "var(--color-line)" }}>
          <input type="checkbox" className="mt-1" checked={!!value[f.key]} onChange={(e) => onChange({ ...value, [f.key]: e.target.checked })} data-testid="crm-merge-choice" />
          <span className="flex min-w-0 flex-col">
            <span className="text-xs font-medium">{f.label}</span>
            <span className="min-w-0 break-words text-xs text-[color:var(--color-muted)]">เก็บไว้: {keep[f.key] || "(ว่าง)"}</span>
            <span className="min-w-0 break-words text-xs">ใช้แทน: {other[f.key]}</span>
          </span>
        </label>
      ))}
    </fieldset>
  );
}

/** `{ field: true }` → `fieldChoices` ที่ส่งให้บริการรวม (เฉพาะฟิลด์ที่ติ๊ก และยังเลือกได้จริง = "merge") */
export function toFieldChoices(value: Record<string, boolean>, allowed: { key: string }[]): Record<string, "merge"> {
  const ok = new Set(allowed.map((f) => f.key));
  return Object.fromEntries(Object.entries(value).filter(([k, v]) => v && ok.has(k)).map(([k]) => [k, "merge" as const]));
}
