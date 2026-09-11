// SegmentBuilder.tsx — ตัวสร้าง "กลุ่มลูกค้า" เป็นประโยคไทย (M3.1 · ภาพ 21 ขั้น 1)
//
// โครงตามภาพ: แถวเงื่อนไข = [สมาชิกที่ | และ] [ฟิลด์ ▾] [การเปรียบเทียบ ▾] [ค่า ▾] · แถวท้าย "+ เพิ่มเงื่อนไข"
// ใต้กล่อง: แถบฟ้า "n คน เข้าเงื่อนไข · ยอดซื้อ 12 เดือนเฉลี่ย ฿x/คน" + บรรทัด "ตัวอย่าง: ชื่อ ×5"
// แล้วปุ่ม "บันทึกเป็น Segment"
//
// 🔴 นับสดแบบหน่วงเวลา (500 มิลลิวินาที) — ผู้ใช้ลากตัวเลือกไปมาไม่ควรยิงนับทุกครั้งที่ขยับ
// 🔴 เงื่อนไขที่ "ยังเลือกค่าไม่เสร็จ" ไม่ถูกส่งไปนับ (ไม่ใช่ "ไม่ตรงใคร") — ระหว่างพิมพ์ ตัวเลขจึงไม่กระพริบเป็น 0
// 🔴 ทะเบียนฟิลด์/ป้ายไทยมาจาก `member/segments.ts` ทั้งหมด — ไฟล์นี้ไม่ตั้งชื่อฟิลด์เอง
"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MemberIcon } from "./MemberIcon";
import { countSegmentAction, saveSegmentAction } from "@/lib/modules/member/segments-actions";
// 🔴 client component ห้าม import `member/segments` (ลาก prisma เข้าบันเดิลเบราว์เซอร์ → next build พัง)
//    ของที่หน้าจอต้องใช้อยู่ในไฟล์บริสุทธิ์ `segments-shared` · ส่วนที่ต้องคิวรีเรียกผ่าน server action
import { SEGMENT_OP_LABELS, type SegmentCondition, type SegmentFieldDef, type SegmentGroup, type SegmentOp, type SegmentScope } from "@/lib/modules/member/segments-shared";

export type SegmentCountView = {
  count: number;
  avgSpend12mSatang: number;
  sampleNames: string[];
};

export type SegmentBuilderProps = {
  systemId: string;
  segmentId: string | null;
  initialName: string;
  initialScope: SegmentScope;
  initialGroups: SegmentGroup[];
  fields: SegmentFieldDef[];
  canManage: boolean;
  initialCount: SegmentCountView;
};

const MONEY_FIELDS = new Set(["spent12m"]);

function fieldOf(fields: SegmentFieldDef[], key: string): SegmentFieldDef | undefined {
  return fields.find((f) => f.key === key);
}

function blankCondition(fields: SegmentFieldDef[]): SegmentCondition {
  const def = fields[0];
  return { field: def?.key ?? "tier", op: def?.ops[0] ?? "in", value: def?.kind === "boolean" ? true : [] };
}

/** เงื่อนไขที่ยังเลือกค่าไม่เสร็จ = ยังไม่นับ (ไม่ใช่ "ไม่ตรงใคร") */
function isComplete(def: SegmentFieldDef | undefined, cond: SegmentCondition): boolean {
  if (!def) return false;
  if (cond.op === "isNull" || cond.op === "notNull") return true;
  if (def.kind === "boolean") return typeof cond.value === "boolean";
  if (Array.isArray(cond.value)) return cond.value.length > 0;
  return String(cond.value ?? "").trim() !== "";
}

function cleanGroups(fields: SegmentFieldDef[], groups: SegmentGroup[]): SegmentGroup[] {
  return groups
    .map((g) => ({ conditions: g.conditions.filter((c) => isComplete(fieldOf(fields, c.field), c)) }))
    .filter((g) => g.conditions.length > 0);
}

function bahtOf(satang: number): string {
  return Math.round(satang / 100).toLocaleString("th-TH");
}

// ───────────────────────── ตัวเลือกค่าแบบติ๊กหลายอัน (ชิปปิดอยู่ + แผงติ๊ก) ─────────────────────────

function ValuePicker({
  def,
  cond,
  disabled,
  onChange,
}: {
  def: SegmentFieldDef;
  cond: SegmentCondition;
  disabled: boolean;
  onChange: (value: unknown) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = useMemo(() => (Array.isArray(cond.value) ? cond.value.map(String) : cond.value === undefined || cond.value === null ? [] : [String(cond.value)]), [cond.value]);
  const labels = selected.map((v) => def.options?.find((o) => o.value === v)?.label ?? v);
  const single = cond.op === "eq" || cond.op === "neq";

  const toggle = (value: string) => {
    if (single) {
      onChange(value);
      setOpen(false);
      return;
    }
    const next = selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value];
    onChange(next);
  };

  return (
    <span className="relative inline-flex">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex max-w-[220px] items-center gap-1 truncate rounded-lg border px-2.5 py-1.5 text-sm"
        style={{
          borderColor: labels.length ? "var(--color-accent)" : "var(--color-line)",
          color: labels.length ? "var(--color-accent)" : "var(--color-muted)",
          background: labels.length ? "var(--color-accent-soft)" : "var(--color-surface)",
        }}
      >
        <span className="truncate">{labels.length ? labels.join(", ") : "เลือก"}</span>
        <MemberIcon name="chevronDown" size="sm" />
      </button>
      {open && (
        <span
          className="absolute left-0 top-full z-20 mt-1 flex max-h-64 w-56 flex-col gap-1 overflow-auto rounded-xl border p-2 text-sm"
          style={{ borderColor: "var(--color-line)", background: "var(--color-surface)", boxShadow: "0 8px 24px rgba(0,0,0,0.08)" }}
        >
          {(def.options ?? []).map((o) => (
            <label key={o.value} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1" style={{ background: selected.includes(o.value) ? "var(--color-surface-2)" : "transparent" }}>
              <input type={single ? "radio" : "checkbox"} checked={selected.includes(o.value)} onChange={() => toggle(o.value)} />
              <span className="truncate">{o.label}</span>
            </label>
          ))}
          {(def.options ?? []).length === 0 && <span style={{ color: "var(--color-muted)" }}>ยังไม่มีตัวเลือกให้เลือกในร้านนี้</span>}
        </span>
      )}
    </span>
  );
}

function ValueInput({ def, cond, disabled, onChange }: { def: SegmentFieldDef; cond: SegmentCondition; disabled: boolean; onChange: (value: unknown) => void }) {
  const boxStyle = { borderColor: "var(--color-line)" };
  if (cond.op === "isNull" || cond.op === "notNull") return null;

  if (def.options && def.options.length > 0 && (def.kind === "select" || def.kind === "multi")) {
    return <ValuePicker def={def} cond={cond} disabled={disabled} onChange={onChange} />;
  }

  if (def.kind === "boolean") {
    return (
      <select
        aria-label="ค่า"
        disabled={disabled}
        className="rounded-lg border px-2.5 py-1.5 text-sm"
        style={boxStyle}
        value={cond.value === false ? "no" : "yes"}
        onChange={(e) => onChange(e.target.value === "yes")}
      >
        <option value="yes">ใช่</option>
        <option value="no">ไม่ใช่</option>
      </select>
    );
  }

  if (def.kind === "date") {
    const raw = typeof cond.value === "string" ? cond.value.slice(0, 10) : "";
    return (
      <input
        aria-label="ค่า"
        type="date"
        disabled={disabled}
        className="rounded-lg border px-2.5 py-1.5 text-sm"
        style={boxStyle}
        value={raw}
        onChange={(e) => onChange(e.target.value ? new Date(`${e.target.value}T00:00:00Z`).toISOString() : "")}
      />
    );
  }

  if (def.kind === "number" || def.kind === "money") {
    const money = MONEY_FIELDS.has(def.key) || def.kind === "money";
    const shown = typeof cond.value === "number" ? (money ? Math.round(cond.value / 100) : cond.value) : "";
    return (
      <span className="inline-flex items-center gap-1">
        {money && <span style={{ color: "var(--color-muted)" }}>฿</span>}
        <input
          aria-label="ค่า"
          type="number"
          min={0}
          disabled={disabled}
          className="w-24 rounded-lg border px-2.5 py-1.5 text-sm"
          style={boxStyle}
          value={shown}
          onChange={(e) => {
            const n = e.target.value === "" ? "" : Math.max(0, Number(e.target.value) || 0);
            onChange(n === "" ? "" : money ? n * 100 : n);
          }}
        />
        {def.unit && !money && <span style={{ color: "var(--color-muted)" }}>{def.unit}</span>}
      </span>
    );
  }

  if (def.kind === "multi") {
    const text = Array.isArray(cond.value) ? cond.value.join(", ") : String(cond.value ?? "");
    return (
      <input
        aria-label="ค่า"
        type="text"
        disabled={disabled}
        placeholder="คั่นหลายอันด้วยจุลภาค"
        className="w-48 rounded-lg border px-2.5 py-1.5 text-sm"
        style={boxStyle}
        value={text}
        onChange={(e) => onChange(e.target.value.split(",").map((s) => s.trim()).filter(Boolean))}
      />
    );
  }

  return (
    <input
      aria-label="ค่า"
      type="text"
      disabled={disabled}
      className="w-44 rounded-lg border px-2.5 py-1.5 text-sm"
      style={boxStyle}
      value={typeof cond.value === "string" ? cond.value : Array.isArray(cond.value) ? cond.value.join(", ") : ""}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

// ───────────────────────── แถวเงื่อนไข ─────────────────────────

function ConditionRow({
  fields,
  cond,
  lead,
  disabled,
  onChange,
  onRemove,
}: {
  fields: SegmentFieldDef[];
  cond: SegmentCondition;
  /** ป้ายหน้าแถว: แถวแรกของกลุ่ม = "สมาชิกที่" · แถวถัดไป = "และ" */
  lead: "first" | "and";
  disabled: boolean;
  onChange: (c: SegmentCondition) => void;
  onRemove: () => void;
}) {
  const def = fieldOf(fields, cond.field);
  const ops = def?.ops ?? [];
  return (
    <div data-testid="segment-condition" className="flex flex-wrap items-center gap-2 border-t px-3 py-2 first:border-t-0" style={{ borderColor: "var(--color-line)" }}>
      {lead === "first" ? (
        <span className="rounded-lg px-2 py-1 text-xs font-semibold" style={{ background: "var(--color-ink)", color: "var(--color-surface)" }}>
          สมาชิกที่
        </span>
      ) : (
        <span className="rounded-lg border px-2 py-1 text-xs" style={{ borderColor: "var(--color-line)", color: "var(--color-muted)" }}>
          และ
        </span>
      )}

      <select
        aria-label="ฟิลด์"
        disabled={disabled}
        className="max-w-[240px] rounded-lg border px-2.5 py-1.5 text-sm"
        style={{ borderColor: "var(--color-line)" }}
        value={cond.field}
        onChange={(e) => {
          const next = fieldOf(fields, e.target.value);
          onChange({
            field: e.target.value,
            op: next?.ops[0] ?? "eq",
            value: next?.kind === "boolean" ? true : [],
          });
        }}
      >
        {fields.map((f) => (
          <option key={f.key} value={f.key}>
            {f.label}
          </option>
        ))}
      </select>

      {ops.length > 1 && (
        <select
          aria-label="การเปรียบเทียบ"
          disabled={disabled}
          className="rounded-lg border px-2.5 py-1.5 text-sm"
          style={{ borderColor: "var(--color-line)" }}
          value={cond.op}
          onChange={(e) => onChange({ ...cond, op: e.target.value as SegmentOp })}
        >
          {ops.map((op) => (
            <option key={op} value={op}>
              {SEGMENT_OP_LABELS[op]}
            </option>
          ))}
        </select>
      )}

      {def && <ValueInput def={def} cond={cond} disabled={disabled} onChange={(value) => onChange({ ...cond, value })} />}

      <span className="ml-auto">
        <button type="button" aria-label="ลบเงื่อนไข" disabled={disabled} onClick={onRemove} style={{ color: "var(--color-muted)" }}>
          <MemberIcon name="x" size="sm" />
        </button>
      </span>
    </div>
  );
}

// ───────────────────────── ตัวหลัก ─────────────────────────

export function SegmentBuilder({ systemId, segmentId, initialName, initialScope, initialGroups, fields, canManage, initialCount }: SegmentBuilderProps) {
  const router = useRouter();
  const [groups, setGroups] = useState<SegmentGroup[]>(initialGroups.length ? initialGroups : [{ conditions: [blankCondition(fields)] }]);
  const [name, setName] = useState(initialName);
  const [scope, setScope] = useState<SegmentScope>(initialScope);
  const [view, setView] = useState<SegmentCountView>(initialCount);
  const [counting, setCounting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();

  const cleaned = useMemo(() => cleanGroups(fields, groups), [fields, groups]);
  const signature = useMemo(() => JSON.stringify(cleaned), [cleaned]);
  const lastSignature = useRef(JSON.stringify(cleanGroups(fields, initialGroups)));

  useEffect(() => {
    if (signature === lastSignature.current) return;
    let alive = true;
    setCounting(true);
    const timer = setTimeout(async () => {
      const res = await countSegmentAction(systemId, { groups: cleaned });
      if (!alive) return;
      lastSignature.current = signature;
      setCounting(false);
      if (!res.ok) {
        setError(res.reason);
        return;
      }
      setError(null);
      setView({
        count: res.data.count,
        avgSpend12mSatang: res.data.avgSpend12mSatang,
        sampleNames: res.data.sample.map((s) => s.name),
      });
    }, 500);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [signature, cleaned, systemId]);

  const patchGroup = useCallback((gi: number, next: SegmentGroup) => {
    setGroups((prev) => prev.map((g, i) => (i === gi ? next : g)));
  }, []);

  const save = () => {
    setError(null);
    startSaving(async () => {
      const res = await saveSegmentAction({ systemId, id: segmentId, name, definition: { groups: cleaned }, scope });
      if (!res.ok) {
        setError(res.reason);
        return;
      }
      router.push(`/app/sys/${systemId}/member/segments/${res.data.id}`);
      router.refresh();
    });
  };

  return (
    <div data-testid="segments-builder" className="card p-0">
      <div className="flex flex-wrap items-center gap-2 px-4 pt-4">
        <span className="flex h-5 w-5 items-center justify-center rounded-md text-xs font-semibold" style={{ background: "var(--color-ink)", color: "var(--color-surface)" }}>
          1
        </span>
        <h2 className="text-sm font-semibold">กลุ่มเป้าหมาย</h2>
        <span className="text-xs" style={{ color: "var(--color-muted)" }}>
          Segment builder — เลือกจากฟิลด์สมาชิกทั้งหมด รวมฟิลด์กำหนดเอง
        </span>
      </div>

      <div className="flex flex-col gap-3 p-4">
        {groups.map((group, gi) => (
          <div key={gi} className="flex flex-col gap-2">
            {gi > 0 && (
              <div className="flex items-center gap-2 text-xs" style={{ color: "var(--color-muted)" }}>
                <span className="rounded-lg border px-2 py-1" style={{ borderColor: "var(--color-line)" }}>
                  หรือ
                </span>
                <span>สมาชิกที่เข้ากลุ่มเงื่อนไขใดเงื่อนไขหนึ่งก็ถือว่าเข้ากลุ่มนี้</span>
              </div>
            )}
            <div data-testid="segment-group" className="rounded-xl border" style={{ borderColor: "var(--color-line)" }}>
              {group.conditions.map((cond, ci) => (
                <ConditionRow
                  key={ci}
                  fields={fields}
                  cond={cond}
                  lead={gi === 0 && ci === 0 ? "first" : "and"}
                  disabled={!canManage}
                  onChange={(next) => patchGroup(gi, { conditions: group.conditions.map((c, i) => (i === ci ? next : c)) })}
                  onRemove={() => patchGroup(gi, { conditions: group.conditions.filter((_, i) => i !== ci) })}
                />
              ))}
              <button
                type="button"
                data-testid="segment-add-condition"
                disabled={!canManage}
                onClick={() => patchGroup(gi, { conditions: [...group.conditions, blankCondition(fields)] })}
                className="flex w-full items-center gap-2 border-t px-3 py-2 text-sm"
                style={{ borderColor: "var(--color-line)", background: "var(--color-surface-2)", color: "var(--color-muted)" }}
              >
                <MemberIcon name="plus" size="sm" />
                เพิ่มเงื่อนไข
              </button>
            </div>
          </div>
        ))}

        <div>
          <button
            type="button"
            data-testid="segment-add-group"
            disabled={!canManage}
            onClick={() => setGroups((prev) => [...prev, { conditions: [blankCondition(fields)] }])}
            className="inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm"
            style={{ borderColor: "var(--color-line)", color: "var(--color-muted)" }}
          >
            <MemberIcon name="plus" size="sm" />
            หรือ เพิ่มกลุ่มเงื่อนไข
          </button>
        </div>

        <div
          data-testid="segment-count"
          className="flex items-start gap-2 rounded-xl border px-3 py-3 text-sm"
          style={{ borderColor: "var(--color-accent)", background: "var(--color-accent-soft)" }}
        >
          <span style={{ color: "var(--color-accent)" }}>
            <MemberIcon name="users" size="md" />
          </span>
          <span className="flex flex-col gap-0.5">
            <span>
              <strong>{view.count.toLocaleString("th-TH")} คน</strong> เข้าเงื่อนไข · ยอดซื้อ 12 เดือนเฉลี่ย <strong>฿{bahtOf(view.avgSpend12mSatang)}</strong>/คน
              {counting && (
                <span className="ml-2 text-xs" style={{ color: "var(--color-muted)" }}>
                  กำลังนับใหม่…
                </span>
              )}
            </span>
            <span data-testid="segment-sample" className="text-xs" style={{ color: "var(--color-muted)" }}>
              {view.sampleNames.length > 0 ? `ตัวอย่าง: ${view.sampleNames.join(", ")}` : "ตัวอย่าง: ยังไม่มีใครเข้าเงื่อนไขนี้"}
            </span>
          </span>
        </div>

        {error && (
          <p className="text-sm" style={{ color: "var(--color-danger)" }}>
            {error}
          </p>
        )}

        {canManage && (
          <div className="flex flex-wrap items-center gap-2">
            <input
              aria-label="ชื่อกลุ่ม"
              type="text"
              placeholder="ตั้งชื่อกลุ่ม เช่น Gold ที่ไม่มา 30 วัน"
              className="w-64 rounded-lg border px-3 py-1.5 text-sm"
              style={{ borderColor: "var(--color-line)" }}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <select
              aria-label="ใครเห็นกลุ่มนี้"
              className="rounded-lg border px-2.5 py-1.5 text-sm"
              style={{ borderColor: "var(--color-line)" }}
              value={scope}
              onChange={(e) => setScope(e.target.value === "PRIVATE" ? "PRIVATE" : "TEAM")}
            >
              <option value="TEAM">ทั้งทีมเห็น</option>
              <option value="PRIVATE">เห็นคนเดียว</option>
            </select>
            <button type="button" data-testid="segments-save" disabled={saving} onClick={save} className="btn btn-primary text-sm">
              {saving ? "กำลังบันทึก…" : "บันทึกเป็น Segment"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default SegmentBuilder;
