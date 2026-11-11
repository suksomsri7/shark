"use client";

// ─────────────────────────────────────────────────────────────
// TableSpecEditor.tsx — ตัวแก้ค่าชนิดตารางที่ทะเบียนให้ป้ายช่องย่อยไว้ (def.tableTh) · SVC G1UI-1
//
// ค่าแบบออบเจกต์ ⇒ ช่องย่อยมีป้ายไทยต่อช่อง (% · นาที · เวลา HH:MM · ตัวเลือกป้ายไทย · สวิตช์)
// ค่าแบบรายการ ⇒ รายการป้ายไทย + ปุ่มเพิ่ม/เอาออก (+ เลื่อนขึ้นเมื่อมีลำดับ)
// ใช้ร่วม: SettingsForm (R0.4) · แถวกะทัดรัดจองคิว (B.11) — ไม่วาดต่อคีย์ (กติกาเหล็ก #16)
// 🔴 pure client: import ได้เฉพาะ settings-shared (pure) · ห้าม import @/lib/core/settings
// ─────────────────────────────────────────────────────────────
import { useState } from "react";
import { cellInputText, cellUnitTh, formatCell, parseCell, type TableCellSpecTh, type TableSpecTh } from "./settings-shared";

type Json = null | string | number | boolean | Json[] | { [k: string]: Json };
const isObj = (v: unknown): v is { [k: string]: Json } => typeof v === "object" && v !== null && !Array.isArray(v);
const clone = (v: unknown): Json => JSON.parse(JSON.stringify(v ?? null)) as Json;
const cx = (...a: (string | false | null | undefined)[]) => a.filter(Boolean).join(" ");

const INPUT = "input min-h-11 w-full min-w-0 disabled:bg-[color:var(--color-surface-2)] disabled:text-[color:var(--color-muted)]";
const BTN = "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg border bg-[color:var(--color-surface)] px-3 py-2 text-sm text-[color:var(--color-ink)] hover:bg-[color:var(--color-surface-2)] disabled:opacity-60";
const LABEL = "text-xs text-[color:var(--color-ink-soft)]";

function CellSwitch({ checked, onChange, disabled, label }: { checked: boolean; onChange: (v: boolean) => void; disabled: boolean; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center disabled:opacity-50"
    >
      <span className={cx("relative inline-block h-7 w-12 rounded-full transition-colors", checked ? "bg-[color:var(--color-ink)]" : "bg-[color:var(--color-line)]")}>
        <span className={cx("absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all", checked ? "left-6" : "left-1")} />
      </span>
    </button>
  );
}

/** ช่องกรอกตัวเลข/เวลา/ข้อความ — เก็บข้อความที่พิมพ์ไว้เอง แล้วส่งค่าเมื่อแปลงได้ */
function CellText({ id, cs, value, onChange, disabled }: { id: string; cs: TableCellSpecTh; value: unknown; onChange: (v: Json) => void; disabled: boolean }) {
  const [text, setText] = useState(() => cellInputText(cs, value));
  const [err, setErr] = useState<string | null>(null);
  const unit = cellUnitTh(cs);
  const numeric = cs.kind !== "text" && cs.kind !== "clock" && cs.kind !== "clockText";
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <div className="flex min-w-0 items-center gap-2">
        <input
          id={id}
          type="text"
          inputMode={numeric ? (cs.kind === "bp" ? "decimal" : "numeric") : undefined}
          placeholder={cs.kind === "clock" || cs.kind === "clockText" ? "HH:MM" : cs.nullTh && cs.nullTh !== "—" ? `ว่าง = ${cs.nullTh}` : undefined}
          className={INPUT}
          disabled={disabled}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            const r = parseCell(cs, e.target.value);
            if (r.ok) {
              setErr(null);
              onChange(r.value as Json);
            } else setErr(r.messageTh);
          }}
        />
        {unit && <span className="shrink-0 text-sm text-[color:var(--color-ink-soft)]">{unit}</span>}
      </div>
      {err && (
        <span role="alert" className="text-xs text-[color:var(--color-danger)]">
          {err}
        </span>
      )}
    </div>
  );
}

function CellEditor({ id, cs, value, onChange, disabled }: { id: string; cs: TableCellSpecTh; value: unknown; onChange: (v: Json) => void; disabled: boolean }) {
  if (cs.kind === "bool") return <CellSwitch checked={value === true} disabled={disabled} label={cs.labelTh} onChange={onChange} />;
  if (cs.kind === "enum") {
    const opts = Object.entries(cs.options ?? {});
    return (
      <select id={id} className={INPUT} disabled={disabled} value={typeof value === "string" ? value : ""} onChange={(e) => onChange(e.target.value === "" ? null : e.target.value)}>
        {(cs.nullTh !== undefined || typeof value !== "string") && <option value="">{cs.nullTh ?? "— เลือก"}</option>}
        {opts.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    );
  }
  if (cs.kind === "object") {
    const obj = isObj(value) ? value : {};
    return <FieldList id={id} fields={cs.fields ?? {}} value={obj} disabled={disabled} onChange={onChange} />;
  }
  return <CellText id={id} cs={cs} value={value} disabled={disabled} onChange={onChange} />;
}

/** ช่องย่อยของออบเจกต์ — ป้ายซ้าย ตัวแก้ขวา (มือถือ: ซ้อนบนล่าง) */
function FieldList({
  id,
  fields,
  value,
  onChange,
  disabled,
  onKeyChange,
}: {
  id: string;
  fields: Record<string, TableCellSpecTh>;
  value: { [k: string]: Json };
  onChange: (v: Json) => void;
  disabled: boolean;
  onKeyChange?: (k: string, v: Json) => Json | null;
}) {
  const keys = Object.keys(fields).filter((k) => Object.prototype.hasOwnProperty.call(value, k) || fields[k].optional);
  return (
    <div className="flex min-w-0 flex-col gap-2">
      {keys.map((k) => {
        const cs = fields[k];
        const cid = `${id}-${k}`;
        return (
          <div key={k} data-table-cell={k} className="flex min-w-0 flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
            <label htmlFor={cid} className={cx(LABEL, "sm:w-48 sm:shrink-0")}>
              {cs.labelTh}
            </label>
            <div className="min-w-0 flex-1">
              <CellEditor
                id={cid}
                cs={cs}
                value={value[k]}
                disabled={disabled}
                onChange={(nv) => {
                  const swapped = onKeyChange?.(k, nv);
                  onChange(swapped ?? { ...value, [k]: nv });
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** รายการตัวเลือก (เช่น ช่องทาง · ภาษา · กลุ่มได้คิวก่อน) — แถวละรายการ + เพิ่มจากที่เหลือ */
function EnumList({ id, cs, value, ordered, onChange, disabled, emptyTh }: { id: string; cs: TableCellSpecTh; value: Json[]; ordered: boolean; onChange: (v: Json) => void; disabled: boolean; emptyTh?: string }) {
  const opts = cs.options ?? {};
  const rest = Object.keys(opts).filter((o) => !value.includes(o));
  return (
    <div data-table-list={id} className="flex min-w-0 flex-col gap-2">
      {value.length === 0 && <p className="text-xs text-[color:var(--color-muted)]">{emptyTh ?? "ยังไม่มีรายการ"}</p>}
      {value.map((v, i) => (
        <div key={`${String(v)}-${i}`} className="flex min-w-0 flex-wrap items-center gap-2 rounded-lg border px-3 py-1">
          <span className="min-w-0 flex-1 text-sm">
            {ordered ? `${i + 1}. ` : ""}
            {formatCell(cs, v)}
          </span>
          {ordered && i > 0 && (
            <button type="button" disabled={disabled} className={BTN} aria-label={`เลื่อน ${formatCell(cs, v)} ขึ้น`} onClick={() => onChange(value.map((x, j) => (j === i - 1 ? v : j === i ? value[i - 1] : x)))}>
              ↑ ขึ้น
            </button>
          )}
          <button type="button" disabled={disabled} className={BTN} onClick={() => onChange(value.filter((_, j) => j !== i))}>
            เอาออก
          </button>
        </div>
      ))}
      {rest.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {rest.map((o) => (
            <button key={o} type="button" disabled={disabled} className={BTN} onClick={() => onChange([...value, o])}>
              {`+ ${opts[o]}`}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** รายการค่าทั่วไป (ตัวเลข/ข้อความ) — แถวละช่อง + ลบ + เพิ่ม */
function ValueList({ id, cs, value, onChange, disabled, emptyTh }: { id: string; cs: TableCellSpecTh; value: Json[]; onChange: (v: Json) => void; disabled: boolean; emptyTh?: string }) {
  const blank: Json = cs.kind === "text" || cs.kind === "clockText" ? "" : 0;
  return (
    <div data-table-list={id} className="flex min-w-0 flex-col gap-2">
      {value.length === 0 && <p className="text-xs text-[color:var(--color-muted)]">{emptyTh ?? "ยังไม่มีรายการ"}</p>}
      {value.map((v, i) => (
        <div key={i} className="flex min-w-0 items-start gap-2">
          <div className="min-w-0 flex-1">
            <CellEditor id={`${id}-${i}`} cs={cs} value={v} disabled={disabled} onChange={(nv) => onChange(value.map((x, j) => (j === i ? nv : x)))} />
          </div>
          <button type="button" disabled={disabled} className={cx(BTN, "shrink-0")} onClick={() => onChange(value.filter((_, j) => j !== i))}>
            ลบ
          </button>
        </div>
      ))}
      <div>
        <button type="button" disabled={disabled} className={BTN} onClick={() => onChange([...value, blank])}>
          + เพิ่มรายการ
        </button>
      </div>
    </div>
  );
}

/** ค่าเริ่มเมื่อกด "ตั้งค่า" จากค่าว่าง: starter ของทะเบียน → ค่าแม่แบบ → รูปว่างจากช่องย่อย */
function starterOf(spec: TableSpecTh, proto: unknown): Json {
  if (spec.starter !== undefined && spec.starter !== null) return clone(spec.starter);
  if (proto !== undefined && proto !== null) return clone(proto);
  if (spec.item) return [];
  const o: { [k: string]: Json } = {};
  for (const [k, cs] of Object.entries(spec.fields ?? {})) if (!cs.optional) o[k] = cs.kind === "bool" ? false : cs.kind === "text" || cs.kind === "clockText" ? "" : cs.nullTh !== undefined ? null : 0;
  return o;
}

export default function TableSpecEditor({
  id,
  spec,
  value,
  onChange,
  disabled,
  nullable,
  proto,
}: {
  id: string;
  spec: TableSpecTh;
  value: unknown;
  onChange: (v: unknown) => void;
  disabled: boolean;
  nullable: boolean;
  proto?: unknown;
}) {
  if (value === null || value === undefined) {
    return (
      <div data-table-spec={id} className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-[color:var(--color-muted)]">{spec.nullTh ?? "ยังไม่ได้ตั้งค่า"}</span>
        <button type="button" disabled={disabled} className={BTN} onClick={() => onChange(starterOf(spec, proto))}>
          ตั้งค่า
        </button>
      </div>
    );
  }
  let body: React.ReactNode;
  if (spec.item && Array.isArray(value)) {
    const list = value as Json[];
    body =
      spec.item.kind === "enum" ? (
        <EnumList id={id} cs={spec.item} value={list} ordered={spec.ordered === true} disabled={disabled} emptyTh={spec.emptyTh} onChange={onChange} />
      ) : (
        <ValueList id={id} cs={spec.item} value={list} disabled={disabled} emptyTh={spec.emptyTh} onChange={onChange} />
      );
  } else if (spec.fields && isObj(value)) {
    const obj = value;
    const disc = spec.discriminator;
    body = (
      <FieldList
        id={id}
        fields={spec.fields}
        value={obj}
        disabled={disabled}
        onChange={onChange}
        onKeyChange={
          disc
            ? (k, nv) => {
                if (k !== disc.key || typeof nv !== "string") return null;
                // เปลี่ยนชนิด ⇒ ช่องของชนิดใหม่ (คงค่าเดิมถ้ามีช่องชื่อเดียวกัน) · ช่องของชนิดเก่าหายไป
                const variant = disc.variants[nv] ?? {};
                const next: { [x: string]: Json } = { [disc.key]: nv };
                for (const [vk, vd] of Object.entries(variant)) next[vk] = Object.prototype.hasOwnProperty.call(obj, vk) ? obj[vk] : clone(vd);
                return next;
              }
            : undefined
        }
      />
    );
  } else {
    body = <p className="text-sm">{formatCell({ kind: "text", labelTh: "" }, value)}</p>;
  }
  return (
    <div data-table-spec={id} className="flex min-w-0 flex-col gap-2">
      {body}
      {nullable && (
        <div>
          <button type="button" disabled={disabled} className={BTN} onClick={() => onChange(null)}>
            {spec.nullTh ? `เปลี่ยนเป็น “${spec.nullTh}”` : "ไม่ตั้งค่านี้"}
          </button>
        </div>
      )}
    </div>
  );
}
