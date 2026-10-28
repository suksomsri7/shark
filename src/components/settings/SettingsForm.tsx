"use client";

// ─────────────────────────────────────────────────────────────
// SettingsForm.tsx — ตัววาดหน้าค่าตั้งจากทะเบียน (R0.4) · ใบสั่ง ledger/svc-briefs/svc-brief-r0.4.md §5
//
// รับโมเดล (JSON ล้วน จาก loadSettingsForm) + server actions ทาง props — หน้าห่อส่ง saveSettingsAction/resetSettingAction
// 🔴 ห้าม import ค่าจาก @/lib/core/settings (ลากถึง prisma) — ใช้ `import type` เท่านั้น · ห้าม useRouter (รีเฟรชผ่าน refresh() ใน action)
// 🔴 ต้อง render ได้ด้วย react-dom/server (ข้อสอบเรียก renderToStaticMarkup)
// กฎเหล็ก #16: หน้าตั้งค่าทุกหน้าของ RUN = หน้าห่อ + SettingsForm
// ─────────────────────────────────────────────────────────────
import { useMemo, useState } from "react";
import type { RemoveResult, SetResult, SettingIssue } from "@/lib/core/settings/types";
import {
  deepEqual,
  formatFieldValue,
  parseFieldInput,
  submissionFor,
  TABLE_KEY_TH,
  unitLabelTh,
  valueToInputText,
  type SettingsField,
  type SettingsFormModel,
} from "./settings-shared";

type Actions = {
  save(changes: unknown, opts?: { ackLegalWarn?: boolean }): Promise<SetResult>;
  reset(t: { key: string; scope: string; scopeId: string }): Promise<RemoveResult>;
};

const PENDING_BADGE = "⚠️ รอที่ปรึกษากฎหมายตรวจ";
const INTEGRATION_TH: Record<string, string> = {
  SLIP_VERIFY: "บริการตรวจสลิปโอนเงิน",
  LINE: "LINE Official Account",
  SMS: "บริการส่ง SMS",
};

// ───────────────────────── ตัวช่วยหน้าตา ─────────────────────────

const cx = (...a: (string | false | null | undefined)[]) => a.filter(Boolean).join(" ");
// ปุ่มทุกปุ่ม ≥ 44px (min-h-11) — วาง inline-flex นำหน้าเสมอ
const BTN = "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-sm transition-colors";
const BTN_PRIMARY = `${BTN} border-transparent bg-[color:var(--color-ink)] text-[color:var(--color-surface)]`;
const BTN_GHOST = `${BTN} bg-[color:var(--color-surface)] text-[color:var(--color-ink)] hover:bg-[color:var(--color-surface-2)]`;
const INPUT = "input min-h-11 w-full min-w-0 disabled:bg-[color:var(--color-surface-2)] disabled:text-[color:var(--color-muted)]";
const BADGE = "inline-flex items-center rounded-md border px-2 py-0.5 text-xs";

function Switch({ checked, onChange, disabled, label }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cx(
        "inline-flex min-h-11 min-w-[88px] items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium disabled:opacity-60",
        checked ? "border-transparent bg-[color:var(--color-ink)] text-[color:var(--color-surface)]" : "bg-[color:var(--color-surface)] text-[color:var(--color-ink)]",
      )}
    >
      {checked ? "เปิด" : "ปิด"}
    </button>
  );
}

// ───────────────────────── ตัวแก้ชนิดตาราง ─────────────────────────

type Json = null | string | number | boolean | Json[] | { [k: string]: Json };
const isObj = (v: unknown): v is { [k: string]: Json } => typeof v === "object" && v !== null && !Array.isArray(v);
const keyLabel = (k: string): string => TABLE_KEY_TH[k] ?? k;

/** ค่าว่างรูปเดียวกับตัวอย่าง (เพิ่มรายการใหม่ในรายการ) */
function blankLike(v: unknown): Json {
  if (typeof v === "number") return 0;
  if (typeof v === "boolean") return false;
  if (Array.isArray(v)) return [];
  if (isObj(v)) return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, blankLike(x)]));
  return "";
}

/** รูปเริ่มต้นของค่าชนิดตารางที่ยังเป็น null และแม่แบบไม่มีตัวอย่างให้ (ผู้ใช้กด "ตั้งค่า" แล้วกรอกต่อ) */
const TABLE_STARTERS: Record<string, Json> = {
  "rooms.utility.elec.flat": { per: "ROOM", satang: 0 },
  "rooms.utility.water.flat": { per: "ROOM", satang: 0 },
  "rooms.utility.tariffTable": [],
  "messaging.quietHours": { start: "21:00", end: "08:00" },
};

function JsonNode({ value, onChange, disabled, proto, id }: { value: Json; onChange: (v: Json) => void; disabled: boolean; proto: Json | undefined; id: string }) {
  if (typeof value === "boolean") return <Switch checked={value} onChange={onChange} disabled={disabled} label={id} />;
  if (typeof value === "number") {
    return (
      <input
        id={id}
        type="number"
        inputMode="decimal"
        step="any"
        className={INPUT}
        disabled={disabled}
        value={Number.isFinite(value) ? value : ""}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (e.target.value !== "" && Number.isFinite(n)) onChange(n);
        }}
      />
    );
  }
  if (typeof value === "string") {
    const isTime = /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
    return <input id={id} type={isTime ? "time" : "text"} className={INPUT} disabled={disabled} value={value} onChange={(e) => onChange(e.target.value)} />;
  }
  if (Array.isArray(value)) {
    const sample: Json | undefined = value[0] ?? (Array.isArray(proto) ? proto[0] : undefined);
    return (
      <div className="flex flex-col gap-2">
        {value.length === 0 && <p className="text-xs text-[color:var(--color-muted)]">ยังไม่มีรายการ</p>}
        {value.map((item, i) => (
          <div key={i} className="flex min-w-0 items-start gap-2 rounded-lg border p-2">
            <div className="min-w-0 flex-1">
              <JsonNode
                id={`${id}-${i}`}
                value={item}
                disabled={disabled}
                proto={sample}
                onChange={(v) => onChange(value.map((x, j) => (j === i ? v : x)))}
              />
            </div>
            <button type="button" disabled={disabled} className={`${BTN_GHOST} shrink-0`} onClick={() => onChange(value.filter((_, j) => j !== i))}>
              ลบ
            </button>
          </div>
        ))}
        <div>
          <button type="button" disabled={disabled} className={BTN_GHOST} onClick={() => onChange([...value, blankLike(sample ?? "")])}>
            + เพิ่มรายการ
          </button>
        </div>
      </div>
    );
  }
  if (isObj(value)) {
    return (
      <div className="flex flex-col gap-2">
        {Object.entries(value).map(([k, v]) => (
          <div key={k} className="flex min-w-0 flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
            <label htmlFor={`${id}-${k}`} className="text-xs text-[color:var(--color-ink-soft)] sm:w-44 sm:shrink-0">
              {keyLabel(k)}
            </label>
            <div className="min-w-0 flex-1">
              <JsonNode
                id={`${id}-${k}`}
                value={v}
                disabled={disabled}
                proto={isObj(proto) ? proto[k] : undefined}
                onChange={(nv) => onChange({ ...value, [k]: nv })}
              />
            </div>
          </div>
        ))}
      </div>
    );
  }
  // null — ไม่รู้รูปแบบ ⇒ ตั้งได้ก็ต่อเมื่อมีตัวอย่างจากแม่แบบ
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs text-[color:var(--color-muted)]">ยังไม่ได้ตั้งค่า</span>
      <button type="button" disabled={disabled} className={BTN_GHOST} onClick={() => onChange(proto !== undefined && proto !== null ? (JSON.parse(JSON.stringify(proto)) as Json) : [])}>
        ตั้งค่า
      </button>
    </div>
  );
}

/** ตัวแก้ "บัญชีรับเงิน" — ช่องพร้อมเพย์ + ชื่อบัญชี + เลขบัญชี */
function ReceiverEditor({ id, value, onChange, disabled }: { id: string; value: unknown; onChange: (v: unknown) => void; disabled: boolean }) {
  const obj = isObj(value) ? value : null;
  if (obj && typeof obj.paymentProfileId === "string") {
    return (
      <div className="flex flex-col gap-2 text-sm">
        <p>ผูกกับโปรไฟล์รับเงินของร้าน{typeof obj.labelTh === "string" && obj.labelTh ? ` · ${obj.labelTh}` : ""}</p>
        <div>
          <button type="button" disabled={disabled} className={BTN_GHOST} onClick={() => onChange({ promptpayId: "" })}>
            เปลี่ยนเป็นพร้อมเพย์
          </button>
        </div>
      </div>
    );
  }
  const pp = typeof obj?.promptpayId === "string" ? obj.promptpayId : "";
  const name = typeof obj?.displayName === "string" ? obj.displayName : "";
  const bank = typeof obj?.bankAccount === "string" ? obj.bankAccount : "";
  const emit = (next: { promptpayId: string; displayName: string; bankAccount: string }) => {
    if (!next.promptpayId && !next.displayName && !next.bankAccount) return onChange(null);
    onChange({
      promptpayId: next.promptpayId,
      ...(next.displayName ? { displayName: next.displayName } : {}),
      ...(next.bankAccount ? { bankAccount: next.bankAccount } : {}),
    });
  };
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <label htmlFor={`${id}-pp`} className="text-xs text-[color:var(--color-ink-soft)]">
          เบอร์พร้อมเพย์ (มือถือ 10 หลัก) หรือเลขผู้เสียภาษี 13 หลัก
        </label>
        <input
          id={`${id}-pp`}
          type="text"
          inputMode="numeric"
          maxLength={13}
          className={INPUT}
          disabled={disabled}
          value={pp}
          placeholder="0812345678"
          onChange={(e) => emit({ promptpayId: e.target.value.replace(/\D/g, ""), displayName: name, bankAccount: bank })}
        />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor={`${id}-name`} className="text-xs text-[color:var(--color-ink-soft)]">
          ชื่อบัญชี
        </label>
        <input id={`${id}-name`} type="text" className={INPUT} disabled={disabled} value={name} onChange={(e) => emit({ promptpayId: pp, displayName: e.target.value, bankAccount: bank })} />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor={`${id}-bank`} className="text-xs text-[color:var(--color-ink-soft)]">
          เลขบัญชีธนาคาร (ถ้ามี)
        </label>
        <input id={`${id}-bank`} type="text" inputMode="numeric" className={INPUT} disabled={disabled} value={bank} onChange={(e) => emit({ promptpayId: pp, displayName: name, bankAccount: e.target.value })} />
      </div>
    </div>
  );
}

/** ตัวแก้ชนิดแม่แบบข้อความ — ช่องข้อความ + ปุ่มตัวแปร + ตัวอย่าง */
function TemplateEditor({ field, value, onChange, disabled, id }: { field: SettingsField; value: unknown; onChange: (v: unknown) => void; disabled: boolean; id: string }) {
  const asObj = isObj(value) ? value : null;
  const text = typeof value === "string" ? value : typeof asObj?.th === "string" ? asObj.th : "";
  const en = typeof asObj?.en === "string" ? asObj.en : null;
  const setTh = (t: string) => onChange(asObj ? { ...asObj, th: t } : t);
  const vars = field.templateVars ?? [];
  const sample = text.replace(/\{([^{}]+)\}/g, (_m, n: string) => `‹${n.trim()}›`);
  return (
    <div className="flex flex-col gap-2">
      <textarea id={id} rows={4} className={`${INPUT} min-h-[96px] py-2`} disabled={disabled} value={text} onChange={(e) => setTh(e.target.value)} />
      {vars.length > 0 && (
        <div className="flex flex-col gap-1">
          <span className="text-xs text-[color:var(--color-muted)]">ใส่ตัวแปรที่ระบบเติมให้ (แตะเพื่อเพิ่มท้ายข้อความ)</span>
          <div className="flex flex-wrap gap-2">
            {vars.map((v) => (
              <button key={v} type="button" disabled={disabled} className={BTN_GHOST} onClick={() => setTh(`${text}{${v}}`)}>
                {`{${v}}`}
              </button>
            ))}
          </div>
        </div>
      )}
      {asObj && en !== null && (
        <div className="flex flex-col gap-1">
          <label htmlFor={`${id}-en`} className="text-xs text-[color:var(--color-ink-soft)]">
            ข้อความภาษาอังกฤษ (ไม่บังคับ)
          </label>
          <textarea id={`${id}-en`} rows={3} className={`${INPUT} min-h-[72px] py-2`} disabled={disabled} value={en} onChange={(e) => onChange({ ...asObj, en: e.target.value })} />
        </div>
      )}
      <p className="rounded-lg bg-[color:var(--color-surface-2)] px-3 py-2 text-xs text-[color:var(--color-ink-soft)]">ตัวอย่างข้อความ: {sample || "—"}</p>
    </div>
  );
}

// ───────────────────────── ช่องหนึ่งคีย์ ─────────────────────────

type FieldCtx = {
  edits: Record<string, unknown>;
  raw: Record<string, string>;
  errors: Record<string, string>;
  follow: ReadonlySet<string>;
  setValue(f: SettingsField, v: unknown): void;
  setText(f: SettingsField, t: string): void;
  undo(f: SettingsField): void;
  toggleFollow(f: SettingsField, on: boolean): void;
};

function FieldBox({ f, c }: { f: SettingsField; c: FieldCtx }) {
  const id = `f-${f.key}`;
  const following = c.follow.has(f.key);
  const disabled = !f.editable || following;
  const cur = Object.prototype.hasOwnProperty.call(c.edits, f.key) ? c.edits[f.key] : f.value;
  const err = c.errors[f.key];
  const unit = unitLabelTh(f.type);
  const help = f.helpTh && f.pendingLegalReview ? f.helpTh.replace(/^⚠️ รอที่ปรึกษากฎหมายตรวจ\s*[—-]\s*/, "") : f.helpTh;

  let widget: React.ReactNode;
  switch (f.type) {
    case "bool":
      widget = <Switch checked={cur === true} disabled={disabled} label={f.labelTh} onChange={(v) => c.setValue(f, v)} />;
      break;
    case "enum": {
      const opts = f.options ?? [];
      // ตัวเลือกน้อยและป้ายสั้น ⇒ ปุ่มเลือก (แบบภาพ 17) · ไม่งั้นรายการเลื่อนลง
      const pills = opts.length >= 2 && opts.length <= 4 && opts.every((o) => o.labelTh.length <= 26) && !f.nullable;
      widget = pills ? (
        <div role="radiogroup" aria-label={f.labelTh} className="flex flex-wrap gap-2">
          {opts.map((o) => {
            const on = cur === o.value;
            return (
              <button
                key={o.value}
                type="button"
                role="radio"
                aria-checked={on}
                disabled={disabled}
                onClick={() => c.setValue(f, o.value)}
                className={cx(
                  "inline-flex min-h-11 items-center justify-center rounded-full border px-4 py-2 text-sm font-medium disabled:opacity-60",
                  on ? "border-transparent bg-[color:var(--color-ink)] text-[color:var(--color-surface)]" : "bg-[color:var(--color-surface)] text-[color:var(--color-ink)]",
                )}
              >
                {o.labelTh}
              </button>
            );
          })}
        </div>
      ) : (
        <select id={id} className={INPUT} disabled={disabled} value={typeof cur === "string" ? cur : ""} onChange={(e) => c.setValue(f, e.target.value)}>
          {f.nullable && <option value="">ไม่ระบุ</option>}
          {opts.map((o) => (
            <option key={o.value} value={o.value}>
              {o.labelTh}
            </option>
          ))}
        </select>
      );
      break;
    }
    case "int":
    case "money":
    case "percent":
    case "minutes":
    case "days": {
      const text = c.raw[f.key] ?? valueToInputText(f, cur);
      widget = (
        <div className="flex items-center gap-2">
          <input
            id={id}
            type="text"
            inputMode={f.type === "money" || f.type === "percent" ? "decimal" : "numeric"}
            className={INPUT}
            disabled={disabled}
            value={text}
            onChange={(e) => c.setText(f, e.target.value)}
          />
          {unit && <span className="shrink-0 text-sm text-[color:var(--color-ink-soft)]">{unit}</span>}
        </div>
      );
      break;
    }
    case "time":
      widget = <input id={id} type="time" className={INPUT} disabled={disabled} value={typeof cur === "string" ? cur : ""} onChange={(e) => c.setText(f, e.target.value)} />;
      break;
    case "template":
      widget = <TemplateEditor field={f} value={cur} id={id} disabled={disabled} onChange={(v) => c.setValue(f, v)} />;
      break;
    case "table":
      widget =
        f.key === "payments.receiver" ? (
          <ReceiverEditor id={id} value={cur} disabled={disabled} onChange={(v) => c.setValue(f, v)} />
        ) : (
          <div className="flex flex-col gap-2">
            <JsonNode
              id={id}
              value={(cur ?? null) as Json}
              disabled={disabled}
              proto={(f.templateValue ?? TABLE_STARTERS[f.key] ?? undefined) as Json | undefined}
              onChange={(v) => c.setValue(f, v)}
            />
            {f.nullable && cur !== null && cur !== undefined && (
              <div>
                <button type="button" disabled={disabled} className={BTN_GHOST} onClick={() => c.setValue(f, null)}>
                  ไม่ตั้งค่านี้
                </button>
              </div>
            )}
          </div>
        );
      break;
    default: {
      const text = typeof cur === "string" ? cur : cur === null || cur === undefined ? "" : String(cur);
      const long = text.length > 60 || text.includes("\n");
      widget = long ? (
        <textarea id={id} rows={3} className={`${INPUT} min-h-[72px] py-2`} disabled={disabled} value={text} onChange={(e) => c.setText(f, e.target.value)} />
      ) : (
        <input id={id} type="text" className={INPUT} disabled={disabled} value={text} placeholder={f.masked ? "ซ่อนไว้" : undefined} onChange={(e) => c.setText(f, e.target.value)} />
      );
    }
  }

  const own = f.hasOwn && f.editable;
  return (
    <div data-setting-key={f.key} data-kind={f.type} className="flex min-w-0 flex-col gap-2 rounded-lg border px-3 py-3 text-sm">
      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
        <label htmlFor={id} className="min-w-0 font-medium">
          {f.labelTh}
        </label>
        {f.differsFromTemplate && <span className={cx(BADGE, "border-[color:var(--color-accent)] text-[color:var(--color-accent)]")}>ต่างจากแม่แบบ</span>}
        {f.overrideCount > 0 && <span className={cx(BADGE, "text-[color:var(--color-ink-soft)]")}>{`ปรับรายคน ${f.overrideCount}`}</span>}
        {f.ownerOnly && <span className={cx(BADGE, "text-[color:var(--color-ink-soft)]")}>เฉพาะเจ้าของ</span>}
        {f.pendingLegalReview && <span className={cx(BADGE, "border-[color:var(--color-note-line)] bg-[color:var(--color-note)] text-[color:var(--color-note-ink)]")}>{PENDING_BADGE}</span>}
      </div>
      {help && <p className="text-xs text-[color:var(--color-muted)]">{help}</p>}
      {widget}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[color:var(--color-muted)]">
        <span>{f.sourceLabelTh}</span>
        {f.differsFromTemplate && !f.masked && <span>{`ค่าแม่แบบ: ${formatFieldValue(f, f.templateValue)}`}</span>}
        {f.requiresIntegration && <span>{`ต้องเชื่อมต่อ${INTEGRATION_TH[f.requiresIntegration] ?? "บริการภายนอก"}ก่อนจึงจะเปิดใช้ได้`}</span>}
      </div>
      {own && (
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className={BTN_GHOST} onClick={() => c.undo(f)}>
            คืนค่า
          </button>
          <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 text-sm">
            <input type="checkbox" className="h-5 w-5" checked={following} onChange={(e) => c.toggleFollow(f, e.target.checked)} />
            ตามชั้นบน
          </label>
        </div>
      )}
      {following && <p className="text-xs text-[color:var(--color-ink-soft)]">เมื่อบันทึก ค่านี้จะใช้ตามชั้นบน (ลบค่าที่ตั้งไว้ที่นี่)</p>}
      {!f.editable && f.lockedReasonTh && <p className="text-xs text-[color:var(--color-ink-soft)]">{`🔒 ${f.lockedReasonTh}`}</p>}
      {err && (
        <p role="alert" className="text-xs text-[color:var(--color-danger)]">
          {err}
        </p>
      )}
    </div>
  );
}

// ───────────────────────── ฟอร์ม ─────────────────────────

const fmtAt = (iso: string): string => {
  try {
    return new Date(iso).toLocaleString("th-TH", { timeZone: "Asia/Bangkok", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  } catch {
    return iso;
  }
};

export default function SettingsForm({ model, actions }: { model: SettingsFormModel; actions: Actions }) {
  const [edits, setEdits] = useState<Record<string, unknown>>({});
  const [raw, setRaw] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [follow, setFollow] = useState<ReadonlySet<string>>(new Set());
  const [onlyChanged, setOnlyChanged] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const [approval, setApproval] = useState<SettingIssue[] | null>(null);
  const [ack, setAck] = useState(false);
  const [reason, setReason] = useState("");

  const byKey = useMemo(() => {
    const m = new Map<string, SettingsField>();
    for (const g of model.groups) for (const f of g.fields) m.set(f.key, f);
    return m;
  }, [model]);

  const sub = useMemo(() => submissionFor(model, edits, follow), [model, edits, follow]);
  const dirty = sub.changes.length + sub.resets.length > 0;

  const setError = (key: string, msg: string | null) =>
    setErrors((p) => {
      const n = { ...p };
      if (msg) n[key] = msg;
      else delete n[key];
      return n;
    });
  const setEdit = (f: SettingsField, v: unknown) =>
    setEdits((p) => {
      const n = { ...p };
      if (deepEqual(v, f.value)) delete n[f.key];
      else n[f.key] = v;
      return n;
    });

  const ctx: FieldCtx = {
    edits,
    raw,
    errors,
    follow,
    setValue: (f, v) => {
      setError(f.key, null);
      setEdit(f, v);
    },
    setText: (f, t) => {
      setRaw((p) => ({ ...p, [f.key]: t }));
      const r = parseFieldInput(f, t);
      if (r.ok) {
        setError(f.key, null);
        setEdit(f, r.value);
      } else {
        setError(f.key, r.messageTh);
        setEdits((p) => {
          const n = { ...p };
          delete n[f.key];
          return n;
        });
      }
    },
    undo: (f) => {
      setEdits((p) => {
        const n = { ...p };
        delete n[f.key];
        return n;
      });
      setRaw((p) => {
        const n = { ...p };
        delete n[f.key];
        return n;
      });
      setError(f.key, null);
      setFollow((p) => {
        const n = new Set(p);
        n.delete(f.key);
        return n;
      });
    },
    toggleFollow: (f, on) =>
      setFollow((p) => {
        const n = new Set(p);
        if (on) n.add(f.key);
        else n.delete(f.key);
        return n;
      }),
  };

  const discard = () => {
    setEdits({});
    setRaw({});
    setErrors({});
    setFollow(new Set());
    setApproval(null);
    setAck(false);
    setReason("");
    setNotice(null);
  };

  const applyIssues = (issues: SettingIssue[]): string[] => {
    const loose: string[] = [];
    const next: Record<string, string> = {};
    for (const i of issues) {
      if (i.key && byKey.has(i.key)) next[i.key] = next[i.key] ? `${next[i.key]} · ${i.messageTh}` : i.messageTh;
      else loose.push(i.messageTh);
    }
    setErrors((p) => ({ ...p, ...next }));
    return loose;
  };

  async function onSave(ackLegal: boolean) {
    if (busy) return;
    if (Object.keys(errors).length > 0) {
      setNotice({ tone: "err", text: "ยังมีช่องที่กรอกไม่ถูกต้อง — แก้ตามข้อความสีแดงใต้ช่องก่อนบันทึก" });
      return;
    }
    const s = submissionFor(model, edits, follow);
    if (s.changes.length + s.resets.length === 0) {
      setNotice({ tone: "ok", text: "ยังไม่มีค่าที่แก้ไข" });
      return;
    }
    setBusy(true);
    setNotice(null);
    try {
      if (s.changes.length > 0) {
        const payload = ackLegal ? s.changes.map((ch) => ({ ...ch, reason: reason.trim() })) : s.changes;
        const r = await actions.save(payload, ackLegal ? { ackLegalWarn: true } : undefined);
        if (!r.ok) {
          if (r.code === "NEEDS_APPROVAL") {
            if (typeof r.approvalId === "string" && r.approvalId) {
              setApproval(null);
              setAck(false);
              setReason("");
              setEdits({});
              setRaw({});
              setFollow(new Set());
              setNotice({ tone: "ok", text: "ส่งให้เจ้าของอนุมัติแล้ว — ค่าจะมีผลเมื่อเจ้าของอนุมัติ" });
            } else {
              setApproval(r.issues);
              setNotice(null);
            }
            return;
          }
          // VALIDATION · PERMISSION · LEGAL_BLOCK · อื่น ๆ — แสดง messageTh ใต้ช่องตามคีย์
          const loose = applyIssues(r.issues);
          setNotice({ tone: "err", text: loose.length ? loose.join(" · ") : "บันทึกไม่สำเร็จ — ดูข้อความใต้ช่องที่มีปัญหา" });
          return;
        }
      }
      for (const t of s.resets) {
        const r = await actions.reset(t);
        if (!r.ok) {
          const loose = applyIssues(r.issues);
          setNotice({ tone: "err", text: loose.length ? loose.join(" · ") : "คืนค่าตามชั้นบนไม่สำเร็จ" });
          return;
        }
      }
      setEdits({});
      setRaw({});
      setFollow(new Set());
      setErrors({});
      setApproval(null);
      setAck(false);
      setReason("");
      setNotice({ tone: "ok", text: "บันทึกแล้ว" });
    } catch {
      setNotice({ tone: "err", text: "เชื่อมต่อไม่สำเร็จ ลองใหม่อีกครั้ง" });
    } finally {
      setBusy(false);
    }
  }

  const visibleGroups = model.groups
    .map((g) => ({ ...g, fields: onlyChanged ? g.fields.filter((f) => f.differsFromTemplate || f.hasOwn || edits[f.key] !== undefined || follow.has(f.key)) : g.fields }))
    .filter((g) => g.fields.length > 0);
  const tplText = model.templates.filter((t) => t.key).map((t) => t.labelTh ?? t.key).join(" · ");

  return (
    <div className="flex min-w-0 flex-col gap-5">
      {/* หัวฟอร์ม */}
      <div className="card flex flex-col gap-3 p-4">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
          {tplText ? (
            <>
              <span>{`แม่แบบที่ใช้: ${tplText}`}</span>
              <span className="font-medium">{`ปรับจากแม่แบบ ${model.differsCount} ข้อ`}</span>
            </>
          ) : (
            <span className="text-[color:var(--color-muted)]">{`ยังไม่ได้เลือกแม่แบบ · ปรับจากค่าเริ่มต้น ${model.differsCount} ข้อ`}</span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 text-sm">
            <input type="checkbox" className="h-5 w-5" checked={onlyChanged} onChange={(e) => setOnlyChanged(e.target.checked)} />
            ดูเฉพาะที่ปรับ
          </label>
          <button type="button" className={BTN_GHOST} aria-expanded={showHistory} onClick={() => setShowHistory((v) => !v)}>
            ประวัติ
          </button>
        </div>
        {showHistory && (
          <div className="flex flex-col gap-2 border-t pt-3">
            {model.history.length === 0 ? (
              <p className="text-sm text-[color:var(--color-muted)]">ยังไม่มีประวัติการแก้ไข</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {model.history.map((h) => (
                  <li key={h.id} className="flex min-w-0 flex-col gap-0.5 rounded-lg bg-[color:var(--color-surface-2)] px-3 py-2 text-xs">
                    <span className="font-medium">{h.labelTh}</span>
                    <span className="break-words">{h.masked ? "ซ่อนไว้" : `${h.beforeTh} → ${h.afterTh}`}</span>
                    <span className="text-[color:var(--color-muted)]">{fmtAt(h.at)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      {notice && (
        <p
          role={notice.tone === "err" ? "alert" : "status"}
          className={cx("rounded-lg border px-3 py-2 text-sm", notice.tone === "err" ? "border-[color:var(--color-danger)] text-[color:var(--color-danger)]" : "bg-[color:var(--color-accent-soft)]")}
        >
          {notice.text}
        </p>
      )}

      {/* กลุ่มค่าตั้ง */}
      {visibleGroups.map((g) => (
        <section key={`${g.domain}|${g.key}`} className="card flex min-w-0 flex-col gap-3 p-4">
          <h2 className="text-base font-semibold">{g.labelTh}</h2>
          <div className="flex flex-col gap-3">
            {g.fields.map((f) => (
              <FieldBox key={f.key} f={f} c={ctx} />
            ))}
          </div>
        </section>
      ))}
      {visibleGroups.length === 0 && <p className="text-sm text-[color:var(--color-muted)]">ไม่มีค่าตั้งที่ตรงเงื่อนไข</p>}

      {/* NEEDS_APPROVAL — ต้องยอมรับคำเตือนกฎหมาย + เหตุผล */}
      {approval && (
        <section role="alertdialog" aria-label="คำเตือนกฎหมาย" className="card flex flex-col gap-3 border-[color:var(--color-note-line)] bg-[color:var(--color-note)] p-4">
          <h2 className="text-base font-semibold text-[color:var(--color-note-ink)]">ค่าที่ตั้งอยู่นอกเกณฑ์กฎหมาย — ต้องยืนยันก่อนบันทึก</h2>
          <ul className="flex list-disc flex-col gap-1 pl-5 text-sm">
            {approval.map((i, n) => (
              <li key={`${i.code}-${n}`}>{i.messageTh}</li>
            ))}
          </ul>
          <label className="flex min-h-11 cursor-pointer items-start gap-2 text-sm">
            <input type="checkbox" className="mt-0.5 h-5 w-5 shrink-0" checked={ack} onChange={(e) => setAck(e.target.checked)} />
            ฉันรับทราบคำเตือนข้างต้น และขอบันทึกต่อด้วยความรับผิดชอบของร้าน
          </label>
          <div className="flex flex-col gap-1">
            <label htmlFor="svc-ack-reason" className="text-sm font-medium">
              เหตุผล (อย่างน้อย 10 ตัวอักษร)
            </label>
            <textarea id="svc-ack-reason" rows={3} className={`${INPUT} min-h-[72px] py-2`} value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={BTN_PRIMARY} disabled={busy || !ack || reason.trim().length < 10} onClick={() => void onSave(true)}>
              ยืนยันและบันทึก
            </button>
            <button type="button" className={BTN_GHOST} onClick={() => { setApproval(null); setAck(false); setReason(""); }}>
              ยกเลิก
            </button>
          </div>
        </section>
      )}

      {/* แถบบันทึก */}
      <div className="sticky bottom-0 z-10 -mx-1 flex flex-wrap items-center gap-2 border-t bg-[color:var(--color-surface)] px-1 py-3">
        <button type="button" className={BTN_PRIMARY} disabled={busy || !dirty} onClick={() => void onSave(false)}>
          {busy ? "กำลังบันทึก…" : "บันทึก"}
        </button>
        <button type="button" className={BTN_GHOST} disabled={busy || !dirty} onClick={discard}>
          ยกเลิกการแก้
        </button>
        {dirty && <span className="text-xs text-[color:var(--color-muted)]">{`แก้ไขแล้ว ${sub.changes.length + sub.resets.length} รายการ`}</span>}
      </div>
    </div>
  );
}
