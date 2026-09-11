// JourneyBuilder.tsx — ตัวสร้าง journey เป็นประโยคไทย (M3.3 · ภาพ 07 บน)
//
// โครงตามภาพ: [เมื่อ][ทริกเกอร์ ▾][ค่า] → [และถ้า][ฟิลด์ ▾][ค่า ▾] [และ] … → [ให้ทำ][การกระทำ ▾][ค่า] → [และ] …
//             → แถว "+ เพิ่มเงื่อนไข หรือ เพิ่มการกระทำ" → ชื่อ journey + ทดลองรัน / ยกเลิก / บันทึก Journey
// 🔴 ทำไมไม่ใช้ AutomationBuilder ของบอร์ดงานตรง ๆ: ไวยากรณ์คนละชุด (เงื่อนไข = engine กลุ่มลูกค้า M3.1 ·
//    ทริกเกอร์มีพารามิเตอร์ · "รอ n วันแล้วทำต่อ" มีขั้นซ้อน) — เอาหน้าตาประโยคแบบเดียวกันมาใช้ แต่ไม่แตะไฟล์ของบอร์ดงาน
// 🔴 client component: import ได้เฉพาะไฟล์บริสุทธิ์ (`journeys-shared` · `journey-presets` · `segments-shared`)
//    + server action (`journeys-actions`) — ห้ามลาก `journeys.ts` (prisma) เข้าบันเดิลเบราว์เซอร์
// 🔴 ไม่มีอีโมจิ/สีฮาร์ดโค้ด: ไอคอนผ่าน MemberIcon · สีผ่านโทเคนของธีม
"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MemberIcon } from "./MemberIcon";
import { dryRunJourneyAction, saveJourneyAction } from "@/lib/modules/member/journeys-actions";
import {
  JOURNEY_ACTION_LABELS,
  JOURNEY_ACTION_TYPES,
  JOURNEY_MAX_HOLDOUT_PCT,
  JOURNEY_TRIGGERS,
  JOURNEY_VARS,
  journeyTriggerDef,
  type JourneyAction,
  type JourneyDryRun,
  type SaveJourneyInput,
} from "@/lib/modules/member/journeys-shared";
import { JOURNEY_PRESETS, presetToDraft, type JourneyBuilderInitial, type JourneyPreset } from "@/lib/modules/member/journey-presets";
import { SEGMENT_OP_LABELS, type SegmentCondition, type SegmentFieldDef, type SegmentOp } from "@/lib/modules/member/segments-shared";

export type JourneyBuilderProps = {
  systemId: string;
  /** มีค่า = แก้ไข journey เดิม */
  journeyId: string | null;
  initial: JourneyBuilderInitial;
  fields: SegmentFieldDef[];
  templates: { id: string; label: string }[];
  boards: { id: string; name: string }[];
  canManage: boolean;
  /** ยกเลิก = กลับหน้านี้ (ไม่ส่ง = ล้างตัวสร้างกลับค่าตั้งต้น) */
  cancelHref?: string;
};

type Draft = JourneyBuilderInitial;

const ACTION_ICON: Record<string, string> = {
  ISSUE_VOUCHER: "tag",
  GIVE_POINTS: "star",
  SEND_LINE: "chat",
  SEND_EMAIL: "mail",
  SEND_SMS: "chat",
  SEND_PUSH: "bell",
  ADD_TAG: "tag",
  REMOVE_TAG: "x",
  WAIT_THEN: "clock",
  OPEN_KANBAN_CARD: "doc",
  NOTIFY_STAFF: "bell",
  REQUEST_REVIEW: "star",
};

const chipDark = { background: "var(--color-ink)", color: "var(--color-surface)" };
const chipSoft = { borderColor: "var(--color-line)", color: "var(--color-muted)" };
const chipAccent = { borderColor: "var(--color-accent)", color: "var(--color-accent)" };

function RowLabel({ text, tone }: { text: string; tone: "dark" | "soft" | "accent" }) {
  return (
    <span
      className={`shrink-0 rounded-lg px-2.5 py-1 text-xs font-semibold ${tone === "dark" ? "" : "border"}`}
      style={tone === "dark" ? chipDark : tone === "soft" ? chipSoft : chipAccent}
    >
      {text}
    </span>
  );
}

function defaultParams(type: string, templates: { id: string }[], boards: { id: string }[]): Record<string, unknown> {
  switch (type) {
    case "ISSUE_VOUCHER":
      return { templateId: templates[0]?.id ?? "" };
    case "GIVE_POINTS":
      return { points: 100 };
    case "SEND_LINE":
    case "SEND_SMS":
      return { template: "สวัสดีค่ะคุณ {ชื่อ} " };
    case "SEND_EMAIL":
      return { subject: "ข่าวดีสำหรับคุณ {ชื่อ}", template: "" };
    case "SEND_PUSH":
      return { title: "ข่าวดีจากร้าน", template: "" };
    case "ADD_TAG":
    case "REMOVE_TAG":
      return { tag: "" };
    case "WAIT_THEN":
      return { days: 7, thenActions: [{ type: "SEND_LINE", params: { template: "คุณ {ชื่อ} คะ " } }] };
    case "OPEN_KANBAN_CARD":
      return { boardId: boards[0]?.id ?? "", title: "ติดตามคุณ {ชื่อ}" };
    case "NOTIFY_STAFF":
      return { title: "{ชื่อ} — ติดต่อกลับ" };
    default:
      return {};
  }
}

// ───────────────────────── ค่าเงื่อนไข ─────────────────────────

function isComplete(def: SegmentFieldDef | undefined, c: SegmentCondition): boolean {
  if (!def) return false;
  if (c.op === "isNull" || c.op === "notNull") return true;
  if (def.kind === "boolean") return typeof c.value === "boolean";
  if (Array.isArray(c.value)) return c.value.length > 0;
  return String(c.value ?? "").trim() !== "";
}

/** "≥ Silver" เมื่อค่าที่เลือกคือระดับ Silver ขึ้นไปทั้งหมด (แบบในภาพ 07) · ไม่งั้นเป็นรายชื่อ */
function valueSummary(def: SegmentFieldDef, value: unknown): string {
  const list = (Array.isArray(value) ? value : [value]).map(String);
  const opts = def.options ?? [];
  if (list.length === 0) return "เลือก…";
  if (def.key === "tier" && opts.length > 1) {
    const at = opts.findIndex((o) => o.value === list[0]);
    const tail = at >= 0 ? opts.slice(at).map((o) => o.value) : [];
    if (at > 0 && tail.length === list.length && tail.every((v, i) => v === list[i])) return `≥ ${opts[at]!.label}`;
  }
  return list.map((v) => opts.find((o) => o.value === v)?.label ?? v).join(", ");
}

function MultiPick({ def, value, disabled, onChange }: { def: SegmentFieldDef; value: unknown; disabled: boolean; onChange: (v: string[]) => void }) {
  const [open, setOpen] = useState(false);
  const list = (Array.isArray(value) ? value : value === undefined || value === null ? [] : [value]).map(String);
  const toggle = (v: string) => onChange(list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  return (
    <span className="relative min-w-0">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className="flex max-w-full items-center gap-1 rounded-lg border px-2.5 py-1 text-sm font-medium"
        style={chipAccent}
      >
        <span className="truncate">{valueSummary(def, list)}</span>
        <MemberIcon name="chevronDown" size="xs" />
      </button>
      {open && (
        <span className="card absolute left-0 top-full z-20 mt-1 flex max-h-64 w-56 flex-col gap-1 overflow-auto p-2 text-sm">
          {(def.options ?? []).map((o) => (
            <label key={o.value} className="flex cursor-pointer items-center gap-2 rounded px-1 py-0.5">
              <input type="checkbox" checked={list.includes(o.value)} onChange={() => toggle(o.value)} />
              <span className="truncate">{o.label}</span>
            </label>
          ))}
          <button type="button" className="btn mt-1 text-xs" onClick={() => setOpen(false)}>
            เสร็จ
          </button>
        </span>
      )}
    </span>
  );
}

function CondValue({ def, cond, disabled, onChange }: { def: SegmentFieldDef; cond: SegmentCondition; disabled: boolean; onChange: (v: unknown) => void }) {
  if (cond.op === "isNull" || cond.op === "notNull") return null;
  if (def.kind === "boolean") {
    return (
      <select
        disabled={disabled}
        value={cond.value === false ? "false" : "true"}
        onChange={(e) => onChange(e.target.value === "true")}
        className="input w-auto max-w-full min-w-0 py-1 text-sm font-medium"
        style={chipAccent}
        aria-label={`ค่าของ ${def.label}`}
      >
        <option value="true">ใช่</option>
        <option value="false">ไม่ใช่</option>
      </select>
    );
  }
  if ((def.kind === "select" || def.kind === "multi") && (def.options?.length ?? 0) > 0) {
    if (cond.op === "eq" || cond.op === "neq") {
      return (
        <select disabled={disabled} value={String(cond.value ?? "")} onChange={(e) => onChange(e.target.value)} className="input w-auto max-w-full min-w-0 py-1 text-sm font-medium" style={chipAccent} aria-label={`ค่าของ ${def.label}`}>
          <option value="">เลือก…</option>
          {(def.options ?? []).map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      );
    }
    return <MultiPick def={def} value={cond.value} disabled={disabled} onChange={onChange} />;
  }
  const type = def.kind === "number" || def.kind === "money" ? "number" : def.kind === "date" ? "date" : "text";
  return (
    <span className="flex min-w-0 items-center gap-1">
      <input
        disabled={disabled}
        type={type}
        value={String(cond.value ?? "")}
        onChange={(e) => onChange(type === "number" ? (e.target.value === "" ? "" : Number(e.target.value)) : e.target.value)}
        className="input py-1 w-32 min-w-0 text-sm"
        style={chipAccent}
        aria-label={`ค่าของ ${def.label}`}
      />
      {def.unit && <span className="text-xs" style={{ color: "var(--color-muted)" }}>{def.unit}</span>}
    </span>
  );
}

// ───────────────────────── ค่าของการกระทำ ─────────────────────────

function ActionParams({
  action,
  templates,
  boards,
  disabled,
  onChange,
}: {
  action: JourneyAction;
  templates: { id: string; label: string }[];
  boards: { id: string; name: string }[];
  disabled: boolean;
  onChange: (params: Record<string, unknown>) => void;
}) {
  const p = action.params ?? {};
  const set = (k: string, v: unknown) => onChange({ ...p, [k]: v });
  const text = (k: string, placeholder: string, wide = false) => (
    <input
      disabled={disabled}
      value={String(p[k] ?? "")}
      onChange={(e) => set(k, e.target.value)}
      placeholder={placeholder}
      className={`input min-w-0 py-1 text-sm font-medium ${wide ? "flex-1 basis-full sm:basis-0" : "w-40"}`}
      style={chipAccent}
      aria-label={placeholder}
    />
  );
  switch (action.type) {
    case "ISSUE_VOUCHER":
      return (
        <select disabled={disabled} value={String(p.templateId ?? "")} onChange={(e) => set("templateId", e.target.value)} className="input w-auto max-w-full min-w-0 py-1 text-sm font-medium" style={chipAccent} aria-label="แบบ voucher">
          {templates.length === 0 && <option value="">ยังไม่มีแบบ voucher — สร้างที่หน้า Voucher ก่อน</option>}
          {templates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </select>
      );
    case "GIVE_POINTS":
      return (
        <span className="flex flex-wrap items-center gap-2">
          <span className="flex items-center gap-1">
            <input disabled={disabled} type="number" min={1} value={String(p.points ?? "")} onChange={(e) => set("points", e.target.value === "" ? "" : Number(e.target.value))} className="input py-1 w-24 text-sm font-medium" style={chipAccent} aria-label="จำนวนแต้ม" />
            <span className="text-sm" style={{ color: "var(--color-accent)" }}>แต้ม</span>
          </span>
          <input
            disabled={disabled}
            type="number"
            min={1}
            value={p.expiresDays === undefined || p.expiresDays === null ? "" : String(p.expiresDays)}
            onChange={(e) => onChange(e.target.value === "" ? Object.fromEntries(Object.entries(p).filter(([k]) => k !== "expiresDays")) : { ...p, expiresDays: Number(e.target.value) })}
            placeholder="ไม่หมดอายุ"
            className="input py-1 w-28 text-sm"
            aria-label="อายุแต้ม (วัน)"
          />
        </span>
      );
    case "SEND_LINE":
    case "SEND_SMS":
      return text("template", "ข้อความ — ใช้ {ชื่อ} {voucher} ได้", true);
    case "SEND_EMAIL":
      return (
        <span className="flex min-w-0 flex-1 flex-wrap gap-2">
          {text("subject", "หัวข้ออีเมล")}
          {text("template", "เนื้อความ", true)}
        </span>
      );
    case "SEND_PUSH":
      return (
        <span className="flex min-w-0 flex-1 flex-wrap gap-2">
          {text("title", "หัวข้อแจ้งเตือน")}
          {text("template", "ข้อความ", true)}
        </span>
      );
    case "ADD_TAG":
    case "REMOVE_TAG":
      return text("tag", "ชื่อแท็ก");
    case "OPEN_KANBAN_CARD":
      return (
        <span className="flex min-w-0 flex-1 flex-wrap gap-2">
          <select disabled={disabled} value={String(p.boardId ?? "")} onChange={(e) => set("boardId", e.target.value)} className="input w-auto max-w-full min-w-0 py-1 text-sm font-medium" style={chipAccent} aria-label="บอร์ดปลายทาง">
            {boards.length === 0 && <option value="">ยังไม่มีบอร์ดงาน</option>}
            {boards.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
          {text("title", "ชื่อการ์ด", true)}
        </span>
      );
    case "NOTIFY_STAFF":
      return (
        <span className="flex min-w-0 flex-1 flex-wrap gap-2">
          <select disabled={disabled} value={String(p.role ?? "")} onChange={(e) => onChange(e.target.value ? { ...p, role: e.target.value } : Object.fromEntries(Object.entries(p).filter(([k]) => k !== "role")))} className="input w-auto max-w-full py-1 text-sm" aria-label="แจ้งใคร">
            <option value="">ทั้งร้าน</option>
            <option value="OWNER">เจ้าของ</option>
            <option value="MANAGER">ผู้จัดการ</option>
            <option value="STAFF">พนักงาน</option>
          </select>
          {text("title", "หัวข้อแจ้งเตือน", true)}
        </span>
      );
    case "REQUEST_REVIEW":
      return <span className="text-sm" style={{ color: "var(--color-muted)" }}>ส่งคำขอรีวิวให้ลูกค้า</span>;
    default:
      return null;
  }
}

function TypePicker({ value, disabled, nested, onChange }: { value: string; disabled: boolean; nested: boolean; onChange: (t: string) => void }) {
  return (
    <span className="flex items-center gap-1 rounded-lg border px-2 py-0.5" style={{ borderColor: "var(--color-line)" }}>
      <MemberIcon name={ACTION_ICON[value] ?? "bolt"} size="sm" />
      <select disabled={disabled} value={value} onChange={(e) => onChange(e.target.value)} className="min-w-0 bg-transparent py-0.5 text-sm font-medium outline-none" aria-label="การกระทำ">
        {JOURNEY_ACTION_TYPES.filter((t) => !(nested && t === "WAIT_THEN")).map((t) => (
          <option key={t} value={t}>
            {JOURNEY_ACTION_LABELS[t]}
          </option>
        ))}
      </select>
    </span>
  );
}

// ───────────────────────── ตัวสร้าง ─────────────────────────

export function JourneyBuilder(props: JourneyBuilderProps) {
  const { systemId, journeyId, fields, templates, boards, canManage } = props;
  const router = useRouter();
  const [busy, start] = useTransition();
  const [draft, setDraft] = useState<Draft>(props.initial);
  const [error, setError] = useState<string | null>(null);
  const [dry, setDry] = useState<(JourneyDryRun & { skippedByReentry: number; days: number }) | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const disabled = !canManage || busy;

  const fieldOf = (key: string) => fields.find((f) => f.key === key);
  const trigDef = journeyTriggerDef(draft.trigger.event);
  const groups = useMemo(() => {
    const out = new Map<string, typeof JOURNEY_TRIGGERS[number][]>();
    for (const t of JOURNEY_TRIGGERS) out.set(t.group, [...(out.get(t.group) ?? []), t]);
    return [...out.entries()];
  }, []);

  const patch = (p: Partial<Draft>) => {
    setDraft((d) => ({ ...d, ...p }));
    setDry(null);
  };

  const setTrigger = (event: string) => {
    const def = journeyTriggerDef(event);
    patch({ trigger: { event, ...(def?.param ? { params: { [def.param.key]: def.param.def } } : {}) } });
  };

  const setCond = (i: number, c: SegmentCondition) => patch({ conditions: draft.conditions.map((x, k) => (k === i ? c : x)) });
  const addCond = () => {
    const def = fields[0];
    if (!def) return;
    patch({ conditions: [...draft.conditions, { field: def.key, op: def.ops[0] ?? "in", value: def.kind === "boolean" ? true : [] }] });
  };
  const setAction = (i: number, a: JourneyAction) => patch({ actions: draft.actions.map((x, k) => (k === i ? a : x)) });
  const addAction = () => patch({ actions: [...draft.actions, { type: "SEND_LINE", params: defaultParams("SEND_LINE", templates, boards) }] });

  const input = (): SaveJourneyInput => ({
    name: draft.name,
    trigger: draft.trigger,
    conditions: { groups: [{ conditions: draft.conditions.filter((c) => isComplete(fieldOf(c.field), c)) }].filter((g) => g.conditions.length > 0) },
    actions: draft.actions,
    holdoutPct: draft.holdoutPct,
    reentryDays: draft.reentryDays,
    enabled: draft.enabled,
  });

  const save = () => {
    setError(null);
    start(async () => {
      const res = await saveJourneyAction(systemId, journeyId, input());
      if (!res.ok) {
        setError(res.reason);
        return;
      }
      router.push(`/app/sys/${systemId}/member/journeys/${res.data.id}`);
      router.refresh();
    });
  };

  const tryRun = () => {
    setError(null);
    start(async () => {
      const res = await dryRunJourneyAction(systemId, journeyId, input(), 30);
      if (!res.ok) {
        setError(res.reason);
        return;
      }
      setDry(res.data);
    });
  };

  const cancel = () => {
    if (props.cancelHref) {
      router.push(props.cancelHref);
      return;
    }
    setDraft(props.initial);
    setDry(null);
    setError(null);
  };

  const loadPreset = (p: JourneyPreset) => {
    setDraft(presetToDraft(p, fields, templates));
    setDry(null);
    setError(null);
  };

  const renderAction = (a: JourneyAction, i: number, list: JourneyAction[], onSet: (a: JourneyAction) => void, onRemove: () => void, nested: boolean) => {
    const inner = Array.isArray(a.params?.thenActions) ? (a.params.thenActions as JourneyAction[]) : [];
    const setInner = (next: JourneyAction[]) => onSet({ ...a, params: { ...(a.params ?? {}), thenActions: next } });
    return (
      <div key={`${nested ? "n" : "a"}-${i}`} data-testid="journey-action" className="flex min-w-0 flex-col gap-2 border-t px-3 py-2.5 first:border-t-0" style={{ borderColor: "var(--color-line)" }}>
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <RowLabel text={nested ? (i === 0 ? "แล้ว" : "และ") : i === 0 ? "ให้ทำ" : "และ"} tone="accent" />
          <TypePicker value={a.type} disabled={disabled} nested={nested} onChange={(t) => onSet({ type: t, params: defaultParams(t, templates, boards) })} />
          {a.type === "WAIT_THEN" ? (
            <span className="flex flex-wrap items-center gap-2">
              <input disabled={disabled} type="number" min={1} max={90} value={String(a.params?.days ?? "")} onChange={(e) => onSet({ ...a, params: { ...(a.params ?? {}), days: e.target.value === "" ? "" : Number(e.target.value) } })} className="input py-1 w-20 text-sm font-medium" style={chipAccent} aria-label="รอกี่วัน" />
              <span className="text-sm" style={{ color: "var(--color-accent)" }}>วัน</span>
              <label className="flex items-center gap-1 text-sm" style={{ color: "var(--color-muted)" }}>
                <input type="checkbox" disabled={disabled} checked={a.params?.ifVoucherUnused === true} onChange={(e) => onSet({ ...a, params: { ...(a.params ?? {}), ifVoucherUnused: e.target.checked } })} />
                เฉพาะคนที่ยังไม่ใช้ voucher
              </label>
            </span>
          ) : (
            <ActionParams action={a} templates={templates} boards={boards} disabled={disabled} onChange={(params) => onSet({ ...a, params })} />
          )}
          <span className="flex-1" />
          {list.length > 1 || nested ? (
            <button type="button" className="btn px-2 text-xs" disabled={disabled} onClick={onRemove} aria-label="ลบขั้นนี้">
              <MemberIcon name="x" size="xs" />
            </button>
          ) : null}
        </div>
        {a.type === "WAIT_THEN" && (
          <div className="ml-2 flex min-w-0 flex-col rounded-xl border sm:ml-10" style={{ borderColor: "var(--color-line)" }}>
            {inner.map((x, k) =>
              renderAction(
                x,
                k,
                inner,
                (nx) => setInner(inner.map((y, j) => (j === k ? nx : y))),
                () => setInner(inner.filter((_, j) => j !== k)),
                true,
              ),
            )}
            <button type="button" className="flex items-center gap-1 px-3 py-2 text-left text-xs" style={{ color: "var(--color-muted)" }} disabled={disabled} onClick={() => setInner([...inner, { type: "SEND_LINE", params: defaultParams("SEND_LINE", templates, boards) }])}>
              <MemberIcon name="plus" size="xs" /> เพิ่มขั้นหลังรอ
            </button>
          </div>
        )}
      </div>
    );
  };

  return (
    <section data-testid="journeys-builder" className="card flex min-w-0 flex-col gap-3 p-4">
      <div className="flex min-w-0 flex-wrap items-start gap-2">
        <MemberIcon name="bolt" />
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="text-sm font-semibold">
            {journeyId ? "แก้ไข Journey" : "Journey ใหม่"} — {draft.name.trim() || "ยังไม่ได้ตั้งชื่อ"}
          </span>
          <span className="text-xs" style={{ color: "var(--color-muted)" }}>
            ประโยคไทยเหมือนตัวสร้างกฎอัตโนมัติของบอร์ดงาน · เลือกจากรายการ ไม่ต้องเขียนโค้ด
          </span>
        </div>
        <span className="rounded-lg border px-2.5 py-0.5 text-xs font-semibold" style={chipAccent}>
          ทดลองรันย้อนหลังได้
        </span>
      </div>

      {canManage && !journeyId && (
        <div data-testid="journeys-presets" className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="text-xs" style={{ color: "var(--color-muted)" }}>
            เริ่มจากสำเร็จรูป:
          </span>
          {JOURNEY_PRESETS.map((p) => (
            <button key={p.key} type="button" className="btn text-xs" disabled={busy} onClick={() => loadPreset(p)} title={p.desc}>
              {p.name.split(" — ")[0]}
            </button>
          ))}
        </div>
      )}

      <div className="flex min-w-0 flex-col rounded-xl border" style={{ borderColor: "var(--color-line)" }}>
        {/* เมื่อ */}
        <div data-testid="journey-trigger" className="flex min-w-0 flex-wrap items-center gap-2 px-3 py-2.5">
          <RowLabel text="เมื่อ" tone="dark" />
          <select disabled={disabled} value={draft.trigger.event} onChange={(e) => setTrigger(e.target.value)} className="input w-auto max-w-full min-w-0 py-1 text-sm font-medium" style={chipAccent} aria-label="ทริกเกอร์">
            {!trigDef && <option value="">เลือกเหตุการณ์…</option>}
            {groups.map(([g, list]) => (
              <optgroup key={g} label={g}>
                {list.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          {trigDef?.param && (
            <span className="flex items-center gap-1 text-sm" style={{ color: "var(--color-accent)" }}>
              {trigDef.param.label}
              <input
                disabled={disabled}
                type="number"
                min={trigDef.param.min}
                max={trigDef.param.max}
                value={String(draft.trigger.params?.[trigDef.param.key] ?? "")}
                onChange={(e) => patch({ trigger: { ...draft.trigger, params: { [trigDef.param!.key]: e.target.value === "" ? "" : Number(e.target.value) } } })}
                className="input py-1 w-20 text-sm font-medium"
                style={chipAccent}
                aria-label={trigDef.param.label}
              />
              {trigDef.param.unit}
            </span>
          )}
        </div>

        {/* และถ้า */}
        {draft.conditions.map((c, i) => {
          const def = fieldOf(c.field);
          return (
            <div key={`c-${i}`} data-testid="journey-condition" className="flex min-w-0 flex-wrap items-center gap-2 border-t px-3 py-2.5" style={{ borderColor: "var(--color-line)" }}>
              <RowLabel text={i === 0 ? "และถ้า" : "และ"} tone="soft" />
              <select
                disabled={disabled}
                value={c.field}
                onChange={(e) => {
                  const nd = fieldOf(e.target.value);
                  setCond(i, { field: e.target.value, op: (nd?.ops[0] ?? "in") as SegmentOp, value: nd?.kind === "boolean" ? true : [] });
                }}
                className="input w-auto max-w-full min-w-0 py-1 text-sm font-medium"
                aria-label="เงื่อนไข"
              >
                {!def && <option value={c.field}>{c.field}</option>}
                {fields.map((f) => (
                  <option key={f.key} value={f.key}>
                    {f.label}
                  </option>
                ))}
              </select>
              {def && def.ops.length > 1 && (
                <select disabled={disabled} value={c.op} onChange={(e) => setCond(i, { ...c, op: e.target.value as SegmentOp })} className="input w-auto max-w-full py-1 text-sm" aria-label="การเปรียบเทียบ">
                  {def.ops.map((o) => (
                    <option key={o} value={o}>
                      {SEGMENT_OP_LABELS[o]}
                    </option>
                  ))}
                </select>
              )}
              {def && <CondValue def={def} cond={c} disabled={disabled} onChange={(v) => setCond(i, { ...c, value: v })} />}
              <span className="flex-1" />
              <button type="button" className="btn px-2 text-xs" disabled={disabled} onClick={() => patch({ conditions: draft.conditions.filter((_, k) => k !== i) })} aria-label="ลบเงื่อนไขนี้">
                <MemberIcon name="x" size="xs" />
              </button>
            </div>
          );
        })}

        {/* ให้ทำ */}
        <div className="flex min-w-0 flex-col border-t" style={{ borderColor: "var(--color-line)" }}>
          {draft.actions.map((a, i) =>
            renderAction(
              a,
              i,
              draft.actions,
              (na) => setAction(i, na),
              () => patch({ actions: draft.actions.filter((_, k) => k !== i) }),
              false,
            ),
          )}
        </div>

        {/* + เพิ่ม */}
        <div data-testid="journey-add" className="flex min-w-0 flex-wrap items-center gap-2 border-t px-3 py-2.5 text-sm" style={{ borderColor: "var(--color-line)", background: "var(--color-bg)", color: "var(--color-muted)" }}>
          <button type="button" className="flex items-center gap-1" disabled={disabled} onClick={() => setAddOpen((o) => !o)}>
            <MemberIcon name="plus" size="sm" /> เพิ่มเงื่อนไข หรือ เพิ่มการกระทำ
          </button>
          {addOpen && (
            <span className="flex flex-wrap gap-2">
              <button type="button" className="btn text-xs" disabled={disabled || fields.length === 0} onClick={() => { addCond(); setAddOpen(false); }}>
                <MemberIcon name="filter" size="xs" /> เงื่อนไข
              </button>
              <button type="button" className="btn text-xs" disabled={disabled} onClick={() => { addAction(); setAddOpen(false); }}>
                <MemberIcon name="bolt" size="xs" /> การกระทำ
              </button>
            </span>
          )}
        </div>
      </div>

      <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2 text-xs" style={{ color: "var(--color-muted)" }}>
        <label className="flex items-center gap-1">
          กันกลุ่มเทียบ (holdout)
          <input disabled={disabled} type="number" min={0} max={JOURNEY_MAX_HOLDOUT_PCT} value={String(draft.holdoutPct)} onChange={(e) => patch({ holdoutPct: e.target.value === "" ? 0 : Number(e.target.value) })} className="input py-1 w-16 text-xs" aria-label="กันกลุ่มเทียบ (%)" />%
        </label>
        <label className="flex items-center gap-1">
          เข้าซ้ำได้หลัง
          <input disabled={disabled} type="number" min={1} value={draft.reentryDays === null ? "" : String(draft.reentryDays)} onChange={(e) => patch({ reentryDays: e.target.value === "" ? null : Number(e.target.value) })} placeholder="ครั้งเดียว" className="input py-1 w-24 text-xs" aria-label="เข้าซ้ำได้หลังกี่วัน" />
          วัน
        </label>
        <label className="flex items-center gap-1">
          <input type="checkbox" disabled={disabled} checked={draft.enabled} onChange={(e) => patch({ enabled: e.target.checked })} />
          เปิดใช้ทันทีหลังบันทึก
        </label>
        <span className="truncate">ตัวแปรในข้อความ: {JOURNEY_VARS.map((v) => v.token).join(" ")}</span>
      </div>

      {dry && (
        <div data-testid="journey-dryrun-result" className="flex flex-col gap-1 rounded-xl border px-3 py-2.5 text-sm" style={{ borderColor: "var(--color-accent)", background: "var(--color-accent-soft)" }}>
          <span>
            ทดลองรันย้อนหลัง {dry.days} วัน: เข้าเกณฑ์ <strong>{dry.candidates.toLocaleString("th-TH")} คน</strong> · ไม่ผ่านเงื่อนไข {dry.skippedByConditions.toLocaleString("th-TH")} · เคยเข้าแล้ว{" "}
            {dry.skippedByReentry.toLocaleString("th-TH")} · กลุ่มเทียบ {dry.holdout.toLocaleString("th-TH")} · <strong>จะได้รับ {dry.wouldEnter.toLocaleString("th-TH")} คน</strong>
          </span>
          <span className="text-xs" style={{ color: "var(--color-muted)" }}>
            ทดลองรันไม่ส่งอะไรออกไปและไม่บันทึกข้อมูล
          </span>
        </div>
      )}

      {error && (
        <p className="text-sm" style={{ color: "var(--color-danger)" }}>
          {error}
        </p>
      )}

      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <label className="flex min-w-0 flex-1 basis-full items-center gap-2 rounded-xl border px-3 py-1.5 text-sm sm:basis-0" style={{ borderColor: "var(--color-line)" }}>
          <span className="shrink-0" style={{ color: "var(--color-muted)" }}>
            ชื่อ journey:
          </span>
          <input data-testid="journey-name" disabled={disabled} value={draft.name} onChange={(e) => patch({ name: e.target.value })} className="min-w-0 flex-1 bg-transparent font-semibold outline-none" aria-label="ชื่อ journey" />
        </label>
        <button data-testid="journey-dryrun" type="button" className="btn btn-ghost text-sm" disabled={busy} onClick={tryRun}>
          ทดลองรัน
        </button>
        <button type="button" className="btn btn-ghost text-sm" disabled={busy} onClick={cancel}>
          ยกเลิก
        </button>
        <button data-testid="journeys-save" type="button" className="btn btn-primary text-sm" disabled={disabled} onClick={save}>
          บันทึก Journey
        </button>
      </div>
    </section>
  );
}

export default JourneyBuilder;
