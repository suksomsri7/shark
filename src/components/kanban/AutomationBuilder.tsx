// AutomationBuilder.tsx — ตัวสร้างกฎอัตโนมัติของบอร์ด (K2.9 · แบบ `ledger/design-kanban/08-automation.png`)
//
// โครงตามภาพ: หัว (ชื่อบอร์ด + ชิปโควตา + ปุ่มสร้างกฎใหม่) · ซ้าย "ประเภทอัตโนมัติ" ·
// กลาง ตัวสร้างกฎเป็น "ประโยคไทย" (เมื่อ / และถ้า / ให้ทำ / และ) · ล่างซ้าย ตารางกฎ ·
// ล่างขวา คำแนะนำจาก AI (K3.6 — ยังว่าง) + บันทึกการทำงานล่าสุด
//
// 🔴 client component — import เฉพาะ actions (`"use server"`) + ชนิดล้วน
//    ห้าม import `automation.ts` ตรง ๆ (ไฟล์นั้นแตะ prisma → ลาก `pg` เข้าบันเดิลฝั่งเบราว์เซอร์)
// 🔴 ห้าม `toLocale*` — เวลาไทย (+07:00) คำนวณเอง เหมือนทั้งโมดูล (`reference_thai_date_getday_trap`)
// 🔴 ห้ามอีโมจิ — ไอคอนทุกตัวจาก <KanbanIcon>
"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { KanbanIcon } from "./KanbanIcon";
import {
  createRuleAction,
  deleteRuleAction,
  dryRunAction,
  toggleRuleAction,
  updateRuleAction,
} from "@/lib/modules/kanban/automation-actions";

// ───────────────────────── ชนิดของข้อมูลที่ server ส่งมา ─────────────────────────

type Opt = { id: string; name: string };

export type AutomationRuleRow = {
  id: string;
  name: string;
  kind: string;
  event: string | null;
  enabled: boolean;
  runsThisMonth: number;
  sentence: string;
  conditions: unknown;
  actions: unknown;
  scheduleCron: string | null;
  dueOffsetDays: number | null;
};

export type AutomationRunRow = {
  id: string;
  ruleId: string;
  ruleName: string;
  status: "OK" | "FAILED";
  detail: string | null;
  cardId: string | null;
  cardTitle: string | null;
  createdAt: string;
};

export type AutomationPageData = {
  systemId: string;
  board: { id: string; name: string };
  boards: { id: string; name: string }[];
  usage: { used: number; limit: number };
  rules: AutomationRuleRow[];
  runs: AutomationRunRow[];
  events: { value: string; label: string }[];
  columns: Opt[];
  labels: Opt[];
  users: { userId: string; name: string }[];
  fields: Opt[];
  targetBoards: Opt[];
  targetColumns: { id: string; name: string; boardId: string }[];
};

// ───────────────────────── ทะเบียนเงื่อนไข/การกระทำของฟอร์ม ─────────────────────────
// (ตรงกับ zod ใน `automation.ts` — ที่นี่คือ "หน้าตา" ของตัวเลือกเดียวกัน)

type ValueKind = "none" | "column" | "label" | "user" | "number" | "source" | "text" | "field";

type CondDef = { key: string; label: string; field: string; op: string; value: ValueKind };

const COND_DEFS: CondDef[] = [
  { key: "column:is", label: "การ์ดอยู่ในคอลัมน์", field: "column", op: "is", value: "column" },
  { key: "column:is_not", label: "การ์ดไม่ได้อยู่ในคอลัมน์", field: "column", op: "is_not", value: "column" },
  { key: "label:has", label: "การ์ดมีป้ายกำกับ", field: "label", op: "has", value: "label" },
  { key: "label:not_has", label: "การ์ดไม่มีป้ายกำกับ", field: "label", op: "not_has", value: "label" },
  { key: "assignee:is_empty", label: "การ์ดยังไม่มีผู้รับผิดชอบ", field: "assignee", op: "is_empty", value: "none" },
  { key: "assignee:is", label: "ผู้รับผิดชอบคือ", field: "assignee", op: "is", value: "user" },
  { key: "due:within_days", label: "ครบกำหนดภายใน (วัน)", field: "due", op: "within_days", value: "number" },
  { key: "due:overdue", label: "การ์ดเลยกำหนดส่งแล้ว", field: "due", op: "overdue", value: "none" },
  { key: "due:none", label: "การ์ดยังไม่มีกำหนดส่ง", field: "due", op: "none", value: "none" },
  { key: "source:is", label: "การ์ดมาจาก", field: "source", op: "is", value: "source" },
  { key: "custom_field:eq", label: "ฟิลด์กำหนดเองเท่ากับ", field: "custom_field", op: "eq", value: "field" },
  { key: "custom_field:contains", label: "ฟิลด์กำหนดเองมีคำว่า", field: "custom_field", op: "contains", value: "field" },
];

const SOURCE_OPTS: Opt[] = [
  { id: "MANUAL", name: "คนสร้างเอง" },
  { id: "TEMPLATE", name: "เทมเพลตการ์ด" },
  { id: "CHAT", name: "แชท" },
  { id: "FORM", name: "ฟอร์ม" },
  { id: "EMAIL", name: "อีเมล" },
  { id: "AUTOMATION", name: "กฎอัตโนมัติ" },
  { id: "AI", name: "ผู้ช่วย AI" },
];

type ActDef = { type: string; label: string; value: ValueKind; extra?: "message" | "checklist" | "createCard" | "amount" };

const ACT_DEFS: ActDef[] = [
  { type: "move_column", label: "ย้ายไปคอลัมน์", value: "column" },
  { type: "add_label", label: "ติดป้าย", value: "label" },
  { type: "remove_label", label: "ปลดป้าย", value: "label" },
  { type: "assign", label: "มอบหมายให้", value: "user" },
  { type: "unassign_all", label: "ปลดผู้รับผิดชอบทั้งหมด", value: "none" },
  { type: "set_due", label: "ตั้งกำหนดส่ง (อีกกี่วัน)", value: "number" },
  { type: "add_checklist", label: "เพิ่มเช็คลิสต์", value: "none", extra: "checklist" },
  { type: "archive", label: "เก็บการ์ดเข้าคลัง", value: "none" },
  { type: "comment", label: "เขียนความเห็น", value: "text" },
  { type: "notify", label: "แจ้งเตือน", value: "none", extra: "message" },
  { type: "open_approval", label: "เปิดคำขออนุมัติ", value: "none", extra: "amount" },
  { type: "create_card", label: "สร้างการ์ด", value: "none", extra: "createCard" },
  { type: "webhook", label: "ยิงเว็บฮุค", value: "text" },
];

const NOTIFY_TO: Opt[] = [
  { id: "assignees", name: "ผู้รับผิดชอบ" },
  { id: "admins", name: "ผู้ดูแลบอร์ด" },
  { id: "creator", name: "ผู้สร้างการ์ด" },
];

const KIND_DEFS: { key: string; label: string; icon: string; soon?: boolean }[] = [
  { key: "RULE", label: "กฎ (Rule)", icon: "bolt" },
  { key: "CARD_BUTTON", label: "ปุ่มบนการ์ด", icon: "doc" },
  { key: "BOARD_BUTTON", label: "ปุ่มบนบอร์ด", icon: "grid" },
  { key: "SCHEDULED", label: "ตั้งเวลา", icon: "clock" },
  { key: "DUE_DATE", label: "ตามวันครบกำหนด", icon: "cal" },
  { key: "EMAIL_REPORT", label: "รายงานอีเมล", icon: "mail", soon: true },
];

const DOW_TH = ["อาทิตย์", "จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์"];

/** 1000 → "1,000" (คั่นหลักพันเอง — โมดูลนี้ห้าม `toLocale*` ทั้งวันที่และตัวเลข) */
const thousands = (n: number): string => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");

// ───────────────────────── เวลาไทยแบบคำนวณเอง ─────────────────────────

const BKK = 7 * 60 * 60 * 1000;
const p2 = (n: number) => (n < 10 ? `0${n}` : String(n));

/** "30 ก.ย. 09:41" ตามเวลาไทย (ห้าม toLocale* — บทเรียนของโมดูลนี้) */
function thaiStamp(iso: string): string {
  const M = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
  const d = new Date(Date.parse(iso) + BKK);
  return `${d.getUTCDate()} ${M[d.getUTCMonth()]} ${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())}`;
}

// ───────────────────────── ร่างกฎที่กำลังแก้อยู่ ─────────────────────────

type DraftCond = { key: string; value: string; fieldId: string };
type DraftAct = {
  type: string;
  value: string;
  /** notify */ to: string;
  message: string;
  /** add_checklist */ items: string;
  /** create_card */ boardId: string;
  columnId: string;
  title: string;
  /** open_approval */ amountBaht: string;
};

type Draft = {
  editingId: string | null;
  kind: string;
  event: string;
  cronHour: string;
  cronDow: string;
  dueDaysBefore: string;
  name: string;
  conditions: DraftCond[];
  actions: DraftAct[];
};

const emptyAct = (type: string): DraftAct => ({
  type,
  value: "",
  to: "assignees",
  message: "",
  items: "",
  boardId: "",
  columnId: "",
  title: "",
  amountBaht: "",
});

function newDraft(defaultEvent: string): Draft {
  return {
    editingId: null,
    kind: "RULE",
    event: defaultEvent,
    cronHour: "8",
    cronDow: "1",
    dueDaysBefore: "2",
    name: "",
    conditions: [],
    actions: [emptyAct("add_label")],
  };
}

/** ร่าง → รูปที่ `automation.ts` (zod) รับ — ค่าว่างถูกตัดออกให้ zod ฟ้องตรงจุด ไม่ใช่ส่งค่าปลอมไป */
function toRuleInput(draft: Draft, boardId: string): unknown {
  const conditions = draft.conditions
    .map((c) => {
      const def = COND_DEFS.find((d) => d.key === c.key);
      if (!def) return null;
      if (def.field === "custom_field") return { field: "custom_field", op: def.op, value: { fieldId: c.fieldId, value: c.value } };
      if (def.value === "none") return { field: def.field, op: def.op };
      if (def.value === "number") return { field: def.field, op: def.op, value: Number(c.value) };
      return { field: def.field, op: def.op, value: c.value };
    })
    .filter((c): c is NonNullable<typeof c> => c !== null);

  const actions = draft.actions
    .map((a) => {
      switch (a.type) {
        case "move_column":
          return { type: a.type, params: { columnId: a.value } };
        case "add_label":
        case "remove_label":
          return { type: a.type, params: { labelId: a.value } };
        case "assign":
          return { type: a.type, params: { userId: a.value } };
        case "unassign_all":
        case "archive":
          return { type: a.type, params: {} };
        case "set_due":
          return { type: a.type, params: { offsetDays: Number(a.value || 0) } };
        case "add_checklist":
          return {
            type: a.type,
            params: { title: a.title || "ขั้นตอนงาน", items: a.items.split("\n").map((s) => s.trim()).filter(Boolean) },
          };
        case "comment":
          return { type: a.type, params: { text: a.value } };
        case "notify":
          return { type: a.type, params: { to: a.to, message: a.message } };
        case "open_approval":
          return { type: a.type, params: a.amountBaht ? { amountSatang: Math.round(Number(a.amountBaht) * 100) } : {} };
        case "create_card":
          return { type: a.type, params: { boardId: a.boardId, columnId: a.columnId || undefined, title: a.title } };
        case "webhook":
          return { type: a.type, params: { url: a.value } };
        default:
          return null;
      }
    })
    .filter((a): a is NonNullable<typeof a> => a !== null);

  return {
    boardId,
    name: draft.name.trim() || "กฎใหม่",
    kind: draft.kind,
    ...(draft.kind === "RULE" ? { event: draft.event } : {}),
    ...(draft.kind === "SCHEDULED" ? { scheduleCron: `0 ${draft.cronHour} * * ${draft.cronDow}` } : {}),
    ...(draft.kind === "DUE_DATE" ? { dueOffsetDays: -Math.abs(Number(draft.dueDaysBefore || 0)) } : {}),
    conditions,
    actions,
  };
}

/** กฎที่บันทึกไว้ → ร่าง (ปุ่ม "แก้" โหลดเข้าฟอร์มเดิม) */
function draftOfRule(rule: AutomationRuleRow, defaultEvent: string): Draft {
  const conds = Array.isArray(rule.conditions) ? (rule.conditions as Record<string, unknown>[]) : [];
  const acts = Array.isArray(rule.actions) ? (rule.actions as Record<string, unknown>[]) : [];
  const cronParts = (rule.scheduleCron ?? "0 8 * * 1").split(/\s+/);
  return {
    editingId: rule.id,
    kind: rule.kind,
    event: rule.event ?? defaultEvent,
    cronHour: cronParts[1] ?? "8",
    cronDow: cronParts[4] ?? "1",
    dueDaysBefore: String(Math.abs(rule.dueOffsetDays ?? 2)),
    name: rule.name,
    conditions: conds.map((c) => {
      const value = c.value;
      const isField = c.field === "custom_field";
      const inner = isField && value && typeof value === "object" ? (value as { fieldId?: string; value?: unknown }) : null;
      return {
        key: `${String(c.field)}:${String(c.op)}`,
        value: inner ? String(inner.value ?? "") : value === undefined || value === null ? "" : String(value),
        fieldId: inner?.fieldId ?? "",
      };
    }),
    actions: acts.map((a) => {
      const params = (a.params ?? {}) as Record<string, unknown>;
      const base = emptyAct(String(a.type));
      const str = (k: string) => (params[k] === undefined || params[k] === null ? "" : String(params[k]));
      return {
        ...base,
        value: str("columnId") || str("labelId") || str("userId") || str("text") || str("url") || str("offsetDays"),
        to: typeof params.to === "string" ? params.to : "assignees",
        message: str("message"),
        items: Array.isArray(params.items) ? (params.items as string[]).join("\n") : "",
        boardId: a.type === "create_card" ? str("boardId") : "",
        columnId: a.type === "create_card" ? str("columnId") : "",
        title: str("title"),
        amountBaht: typeof params.amountSatang === "number" ? String(params.amountSatang / 100) : "",
      };
    }),
  };
}

// ───────────────────────── ชิ้นส่วนเล็ก ๆ ─────────────────────────

const selCls = "rounded-lg border px-2";
const selStyle: React.CSSProperties = { height: 30, fontSize: 12.5, borderColor: "var(--color-line)", background: "var(--color-surface)", maxWidth: 230 };
const tagStyle: React.CSSProperties = {
  height: 26,
  padding: "0 9px",
  borderRadius: 7,
  fontSize: 12,
  fontWeight: 700,
  background: "var(--color-surface-2)",
  color: "var(--color-ink-soft)",
  border: "1px solid var(--color-line)",
};

function Pick({ value, onChange, options, placeholder, ariaLabel }: { value: string; onChange: (v: string) => void; options: Opt[]; placeholder: string; ariaLabel: string }) {
  return (
    <select aria-label={ariaLabel} className={selCls} style={selStyle} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{placeholder}</option>
      {options.map((o) => (
        <option key={o.id} value={o.id}>
          {o.name}
        </option>
      ))}
    </select>
  );
}

function Card({ children, testId, className }: { children: React.ReactNode; testId?: string; className?: string }) {
  return (
    <section
      data-testid={testId}
      className={`flex flex-col rounded-xl ${className ?? ""}`}
      style={{ background: "var(--color-surface)", border: "1px solid var(--color-line)", padding: 14, gap: 10 }}
    >
      {children}
    </section>
  );
}

// ───────────────────────── ตัวหลัก ─────────────────────────

export function AutomationBuilder({ data }: { data: AutomationPageData }) {
  const router = useRouter();
  const defaultEvent = data.events[0]?.value ?? "kanban.card.moved";
  const [draft, setDraft] = useState<Draft>(() => newDraft(defaultEvent));
  const [open, setOpen] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dry, setDry] = useState<{ cardId: string; cardNo: number | null; title: string; actions: string[] }[] | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));
  const countOf = (kind: string) => data.rules.filter((r) => r.kind === kind).length;
  const columnsOfBoard = useMemo(
    () => (boardId: string) => data.targetColumns.filter((c) => c.boardId === boardId).map((c) => ({ id: c.id, name: c.name })),
    [data.targetColumns],
  );
  const userOpts = data.users.map((u) => ({ id: u.userId, name: u.name }));

  const patchCond = (i: number, patch: Partial<DraftCond>) =>
    setDraft((d) => ({ ...d, conditions: d.conditions.map((c, k) => (k === i ? { ...c, ...patch } : c)) }));
  const patchAct = (i: number, patch: Partial<DraftAct>) =>
    setDraft((d) => ({ ...d, actions: d.actions.map((a, k) => (k === i ? { ...a, ...patch } : a)) }));

  const save = async () => {
    setBusy(true);
    setError(null);
    const input = toRuleInput(draft, data.board.id);
    const res = draft.editingId
      ? await updateRuleAction({ systemId: data.systemId, ruleId: draft.editingId, patch: input })
      : await createRuleAction({ systemId: data.systemId, rule: input });
    setBusy(false);
    if (!res.ok) {
      setError(res.message);
      return;
    }
    setDraft(newDraft(defaultEvent));
    setDry(null);
    setOpen(false);
    router.refresh();
  };

  const tryRun = async () => {
    setBusy(true);
    setError(null);
    const res = await dryRunAction({ systemId: data.systemId, rule: toRuleInput(draft, data.board.id) });
    setBusy(false);
    if (!res.ok) {
      setError(res.message);
      setDry(null);
      return;
    }
    setDry(res.result.matched);
  };

  const toggle = async (ruleId: string, enabled: boolean) => {
    const res = await toggleRuleAction({ systemId: data.systemId, ruleId, enabled });
    if (!res.ok) setError(res.message);
    router.refresh();
  };

  const remove = async (ruleId: string) => {
    const res = await deleteRuleAction({ systemId: data.systemId, ruleId });
    setConfirmDelete(null);
    if (!res.ok) setError(res.message);
    router.refresh();
  };

  return (
    <div className="flex flex-col" style={{ gap: 12 }}>
      {/* ── หัว ── */}
      <header className="flex flex-wrap items-center" style={{ gap: 10 }}>
        <Link href={`/app/sys/${data.systemId}/kanban/b/${data.board.id}`} aria-label="กลับไปที่บอร์ด" style={{ color: "var(--color-muted)" }}>
          <KanbanIcon name="back" size="sm" />
        </Link>
        <h1 style={{ fontSize: 17, fontWeight: 800 }}>อัตโนมัติ — บอร์ด {data.board.name}</h1>
        <span className="flex-1" />
        {data.boards.length > 1 && (
          <select
            aria-label="เลือกบอร์ด"
            className={selCls}
            style={selStyle}
            value={data.board.id}
            onChange={(e) => router.push(`/app/sys/${data.systemId}/kanban/automation?board=${e.target.value}`)}
          >
            {data.boards.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        )}
        <span
          data-testid="automation-usage"
          className="inline-flex items-center"
          title="โควตากฎอัตโนมัติของบอร์ด: 1,000 ครั้งต่อเดือน (นับตามเดือนไทย)"
          style={{ height: 28, padding: "0 10px", borderRadius: 8, fontSize: 12, color: "var(--color-muted)", border: "1px solid var(--color-line)", background: "var(--color-surface)" }}
        >
          ใช้ไป {thousands(data.usage.used)} / {thousands(data.usage.limit)} ครั้งเดือนนี้
        </span>
        <button
          type="button"
          data-testid="automation-new-rule"
          onClick={() => {
            setDraft(newDraft(defaultEvent));
            setDry(null);
            setOpen(true);
          }}
          className="inline-flex items-center"
          style={{ height: 30, padding: "0 12px", borderRadius: 8, gap: 6, fontSize: 12.5, fontWeight: 700, background: "var(--color-ink)", color: "var(--color-surface)" }}
        >
          <KanbanIcon name="plus" size="xs" />
          สร้างกฎใหม่
        </button>
      </header>

      <div className="flex flex-col lg:flex-row" style={{ gap: 12, alignItems: "flex-start" }}>
        {/* ── ซ้าย: ประเภทอัตโนมัติ ── */}
        <nav data-testid="automation-kinds" className="w-full lg:w-[210px] lg:flex-none flex flex-col" style={{ gap: 4 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: "var(--color-muted)", letterSpacing: ".02em" }}>ประเภทอัตโนมัติ</span>
          {KIND_DEFS.map((k) => (
            <span
              key={k.key}
              className="flex items-center rounded-lg"
              style={{
                gap: 8,
                padding: "7px 9px",
                fontSize: 12.5,
                fontWeight: draft.kind === k.key && !k.soon ? 700 : 500,
                color: k.soon ? "var(--color-muted)" : "var(--color-ink)",
                background: draft.kind === k.key && !k.soon ? "var(--color-surface-2)" : "transparent",
              }}
            >
              <KanbanIcon name={k.icon} size="sm" />
              {k.soon ? (
                <span>{k.label}</span>
              ) : (
                <button type="button" onClick={() => { set({ kind: k.key }); setOpen(true); }} style={{ textAlign: "left" }}>
                  {k.label}
                </button>
              )}
              <span className="flex-1" />
              <span style={{ fontSize: 11.5, color: "var(--color-muted)" }}>{k.soon ? "เร็ว ๆ นี้" : countOf(k.key)}</span>
            </span>
          ))}
          <span style={{ borderTop: "1px solid var(--color-line)", margin: "6px 0" }} />
          <span className="flex items-center rounded-lg" style={{ gap: 8, padding: "7px 9px", fontSize: 12.5, color: "var(--color-muted)" }}>
            <KanbanIcon name="spark" size="sm" />
            คำแนะนำจาก AI
            <span className="flex-1" />
            <span style={{ fontSize: 11.5 }}>เร็ว ๆ นี้</span>
          </span>
          <a href="#runs-log" className="flex items-center rounded-lg" style={{ gap: 8, padding: "7px 9px", fontSize: 12.5, color: "var(--color-ink)" }}>
            <KanbanIcon name="clock" size="sm" />
            บันทึกการทำงาน
          </a>
        </nav>

        {/* ── กลาง + ล่าง ── */}
        <div className="min-w-0 flex-1 flex flex-col" style={{ gap: 12 }}>
          {open && (
            <Card testId="rule-builder">
              <div className="flex flex-wrap items-center" style={{ gap: 8 }}>
                <KanbanIcon name="bolt" size="sm" />
                <strong style={{ fontSize: 13.5 }}>{draft.editingId ? "แก้กฎ" : "กฎใหม่"} — ยังไม่บันทึก</strong>
                <span style={{ fontSize: 12, color: "var(--color-muted)" }}>อ่านเป็นประโยคไทยได้ตรง ๆ · เลือกจากรายการ ไม่ต้องเขียนโค้ด</span>
                <span className="flex-1" />
                <span style={{ ...tagStyle, color: "var(--color-accent)", display: "inline-flex", alignItems: "center" }}>ทดลองรันย้อนหลังได้</span>
              </div>

              {/* เมื่อ … */}
              <div data-testid="rule-when" className="flex flex-wrap items-center rounded-lg" style={{ gap: 8, padding: 10, border: "1px solid var(--color-line)" }}>
                <span style={{ ...tagStyle, background: "var(--color-ink)", color: "var(--color-surface)", display: "inline-flex", alignItems: "center" }}>เมื่อ</span>
                <select aria-label="ชนิดของกฎ" className={selCls} style={selStyle} value={draft.kind} onChange={(e) => set({ kind: e.target.value })}>
                  {KIND_DEFS.filter((k) => !k.soon).map((k) => (
                    <option key={k.key} value={k.key}>
                      {k.label}
                    </option>
                  ))}
                </select>
                {draft.kind === "RULE" && (
                  <select aria-label="เหตุการณ์" className={selCls} style={selStyle} value={draft.event} onChange={(e) => set({ event: e.target.value })}>
                    {data.events.map((e) => (
                      <option key={e.value} value={e.value}>
                        {e.label}
                      </option>
                    ))}
                  </select>
                )}
                {draft.kind === "SCHEDULED" && (
                  <>
                    <select aria-label="วันของสัปดาห์" className={selCls} style={selStyle} value={draft.cronDow} onChange={(e) => set({ cronDow: e.target.value })}>
                      <option value="*">ทุกวัน</option>
                      {DOW_TH.map((d, i) => (
                        <option key={d} value={String(i)}>
                          ทุกวัน{d}
                        </option>
                      ))}
                    </select>
                    <select aria-label="เวลา (นาฬิกาไทย)" className={selCls} style={selStyle} value={draft.cronHour} onChange={(e) => set({ cronHour: e.target.value })}>
                      {Array.from({ length: 24 }, (_, h) => (
                        <option key={h} value={String(h)}>
                          {p2(h)}:00 น.
                        </option>
                      ))}
                    </select>
                  </>
                )}
                {draft.kind === "DUE_DATE" && (
                  <>
                    <input
                      aria-label="กี่วันก่อนครบกำหนด"
                      inputMode="numeric"
                      className={selCls}
                      style={{ ...selStyle, width: 70 }}
                      value={draft.dueDaysBefore}
                      onChange={(e) => set({ dueDaysBefore: e.target.value })}
                    />
                    <span style={{ fontSize: 12.5 }}>วันก่อนครบกำหนด</span>
                  </>
                )}
                <span style={{ fontSize: 12.5, color: "var(--color-muted)" }}>ในบอร์ดนี้</span>
                {draft.kind === "RULE" && (
                  <span style={{ fontSize: 11, color: "var(--color-muted)" }}>{draft.event}</span>
                )}
              </div>

              {/* และถ้า … */}
              {draft.conditions.map((c, i) => {
                const def = COND_DEFS.find((d) => d.key === c.key);
                return (
                  <div key={`${c.key}-${i}`} data-testid="rule-if" className="flex flex-wrap items-center rounded-lg" style={{ gap: 8, padding: 10, border: "1px solid var(--color-line)" }}>
                    <span style={{ ...tagStyle, display: "inline-flex", alignItems: "center" }}>และถ้า</span>
                    <select aria-label="เงื่อนไข" className={selCls} style={selStyle} value={c.key} onChange={(e) => patchCond(i, { key: e.target.value, value: "" })}>
                      {COND_DEFS.map((d) => (
                        <option key={d.key} value={d.key}>
                          {d.label}
                        </option>
                      ))}
                    </select>
                    {def?.value === "column" && <Pick ariaLabel="คอลัมน์" placeholder="เลือกคอลัมน์" value={c.value} onChange={(v) => patchCond(i, { value: v })} options={data.columns} />}
                    {def?.value === "label" && <Pick ariaLabel="ป้ายกำกับ" placeholder="เลือกป้าย" value={c.value} onChange={(v) => patchCond(i, { value: v })} options={data.labels} />}
                    {def?.value === "user" && <Pick ariaLabel="พนักงาน" placeholder="เลือกคน" value={c.value} onChange={(v) => patchCond(i, { value: v })} options={userOpts} />}
                    {def?.value === "source" && <Pick ariaLabel="ที่มาของการ์ด" placeholder="เลือกที่มา" value={c.value} onChange={(v) => patchCond(i, { value: v })} options={SOURCE_OPTS} />}
                    {def?.value === "number" && (
                      <input aria-label="จำนวนวัน" inputMode="numeric" className={selCls} style={{ ...selStyle, width: 70 }} value={c.value} onChange={(e) => patchCond(i, { value: e.target.value })} />
                    )}
                    {def?.value === "field" && (
                      <>
                        <Pick ariaLabel="ฟิลด์กำหนดเอง" placeholder="เลือกฟิลด์" value={c.fieldId} onChange={(v) => patchCond(i, { fieldId: v })} options={data.fields} />
                        <input aria-label="ค่าที่เทียบ" className={selCls} style={{ ...selStyle, width: 150 }} value={c.value} onChange={(e) => patchCond(i, { value: e.target.value })} />
                      </>
                    )}
                    <span className="flex-1" />
                    <button type="button" aria-label="ลบเงื่อนไขนี้" onClick={() => setDraft((d) => ({ ...d, conditions: d.conditions.filter((_, k) => k !== i) }))} style={{ color: "var(--color-muted)" }}>
                      <KanbanIcon name="x" size="sm" />
                    </button>
                  </div>
                );
              })}

              {/* ให้ทำ … และ … */}
              {draft.actions.map((a, i) => {
                const def = ACT_DEFS.find((d) => d.type === a.type);
                return (
                  <div key={`${a.type}-${i}`} data-testid="rule-then" className="flex flex-wrap items-center rounded-lg" style={{ gap: 8, padding: 10, border: "1px solid var(--color-line)" }}>
                    <span style={{ ...tagStyle, background: i === 0 ? "var(--color-ink)" : "var(--color-surface-2)", color: i === 0 ? "var(--color-surface)" : "var(--color-ink-soft)", display: "inline-flex", alignItems: "center" }}>
                      {i === 0 ? "ให้ทำ" : "และ"}
                    </span>
                    <select aria-label="การกระทำ" className={selCls} style={selStyle} value={a.type} onChange={(e) => patchAct(i, { ...emptyAct(e.target.value) })}>
                      {ACT_DEFS.map((d) => (
                        <option key={d.type} value={d.type}>
                          {d.label}
                        </option>
                      ))}
                    </select>
                    {def?.value === "column" && <Pick ariaLabel="คอลัมน์ปลายทาง" placeholder="เลือกคอลัมน์" value={a.value} onChange={(v) => patchAct(i, { value: v })} options={data.columns} />}
                    {def?.value === "label" && <Pick ariaLabel="ป้ายกำกับ" placeholder="เลือกป้าย" value={a.value} onChange={(v) => patchAct(i, { value: v })} options={data.labels} />}
                    {def?.value === "user" && <Pick ariaLabel="ผู้รับผิดชอบ" placeholder="เลือกคน" value={a.value} onChange={(v) => patchAct(i, { value: v })} options={userOpts} />}
                    {def?.value === "number" && (
                      <input aria-label="จำนวนวัน" inputMode="numeric" className={selCls} style={{ ...selStyle, width: 70 }} value={a.value} onChange={(e) => patchAct(i, { value: e.target.value })} />
                    )}
                    {def?.value === "text" && (
                      <input
                        aria-label={a.type === "webhook" ? "ที่อยู่เว็บฮุค (https)" : "ข้อความ"}
                        className={selCls}
                        style={{ ...selStyle, width: 300, maxWidth: "100%" }}
                        placeholder={a.type === "webhook" ? "https://…" : "ข้อความ"}
                        value={a.value}
                        onChange={(e) => patchAct(i, { value: e.target.value })}
                      />
                    )}
                    {def?.extra === "message" && (
                      <>
                        <Pick ariaLabel="แจ้งใคร" placeholder="แจ้งใคร" value={a.to} onChange={(v) => patchAct(i, { to: v })} options={NOTIFY_TO} />
                        <input
                          aria-label="ข้อความแจ้งเตือน"
                          className={selCls}
                          style={{ ...selStyle, width: 300, maxWidth: "100%" }}
                          placeholder="การ์ด {ชื่อการ์ด} รออนุมัติ"
                          value={a.message}
                          onChange={(e) => patchAct(i, { message: e.target.value })}
                        />
                      </>
                    )}
                    {def?.extra === "checklist" && (
                      <>
                        <input aria-label="ชื่อเช็คลิสต์" className={selCls} style={{ ...selStyle, width: 170 }} placeholder="ขั้นตอนงาน" value={a.title} onChange={(e) => patchAct(i, { title: e.target.value })} />
                        <textarea aria-label="รายการในเช็คลิสต์ (บรรทัดละข้อ)" rows={2} className="rounded-lg border px-2 py-1" style={{ fontSize: 12.5, borderColor: "var(--color-line)", width: 240 }} value={a.items} onChange={(e) => patchAct(i, { items: e.target.value })} />
                      </>
                    )}
                    {def?.extra === "amount" && (
                      <input aria-label="ยอดเงิน (บาท)" inputMode="decimal" className={selCls} style={{ ...selStyle, width: 120 }} placeholder="ยอด (บาท)" value={a.amountBaht} onChange={(e) => patchAct(i, { amountBaht: e.target.value })} />
                    )}
                    {def?.extra === "createCard" && (
                      <>
                        <Pick ariaLabel="บอร์ดปลายทาง" placeholder="เลือกบอร์ด" value={a.boardId} onChange={(v) => patchAct(i, { boardId: v, columnId: "" })} options={data.targetBoards} />
                        <Pick ariaLabel="คอลัมน์ปลายทาง" placeholder="คอลัมน์แรก" value={a.columnId} onChange={(v) => patchAct(i, { columnId: v })} options={columnsOfBoard(a.boardId)} />
                        <input aria-label="ชื่อการ์ดใหม่" className={selCls} style={{ ...selStyle, width: 200 }} placeholder="ชื่อการ์ด" value={a.title} onChange={(e) => patchAct(i, { title: e.target.value })} />
                      </>
                    )}
                    <span className="flex-1" />
                    {draft.actions.length > 1 && (
                      <button type="button" aria-label="ลบการกระทำนี้" onClick={() => setDraft((d) => ({ ...d, actions: d.actions.filter((_, k) => k !== i) }))} style={{ color: "var(--color-muted)" }}>
                        <KanbanIcon name="x" size="sm" />
                      </button>
                    )}
                  </div>
                );
              })}

              <div className="flex flex-wrap items-center" style={{ gap: 8, fontSize: 12.5 }}>
                <button
                  type="button"
                  data-testid="rule-add-condition"
                  onClick={() => setDraft((d) => ({ ...d, conditions: [...d.conditions, { key: COND_DEFS[0]!.key, value: "", fieldId: "" }] }))}
                  style={{ color: "var(--color-accent)", fontWeight: 600 }}
                >
                  + เพิ่มเงื่อนไข
                </button>
                <span style={{ color: "var(--color-muted)" }}>หรือ</span>
                <button
                  type="button"
                  data-testid="rule-add-action"
                  disabled={draft.actions.length >= 20}
                  onClick={() => setDraft((d) => ({ ...d, actions: [...d.actions, emptyAct("comment")] }))}
                  style={{ color: draft.actions.length >= 20 ? "var(--color-muted)" : "var(--color-accent)", fontWeight: 600 }}
                >
                  เพิ่มการกระทำ
                </button>
                <span style={{ color: "var(--color-muted)" }}>(สูงสุด 20 การกระทำต่อ 1 กฎ)</span>
              </div>

              <div className="flex flex-wrap items-center" style={{ gap: 8, borderTop: "1px solid var(--color-line)", paddingTop: 10 }}>
                <label htmlFor="rule-name" style={{ fontSize: 12.5, color: "var(--color-muted)" }}>
                  ชื่อกฎ:
                </label>
                <input
                  id="rule-name"
                  data-testid="rule-name"
                  className={`${selCls} flex-1`}
                  style={{ ...selStyle, maxWidth: "none", minWidth: 200 }}
                  placeholder="ย้ายเข้ารอตรวจ + ป้ายการเงิน → ส่งอนุมัติ"
                  value={draft.name}
                  onChange={(e) => set({ name: e.target.value })}
                />
                <button type="button" data-testid="rule-dry-run" disabled={busy} onClick={tryRun} className="rounded-lg border px-3" style={{ height: 30, fontSize: 12.5, borderColor: "var(--color-line)" }}>
                  ทดลองรัน
                </button>
                <button
                  type="button"
                  data-testid="rule-cancel"
                  onClick={() => {
                    setDraft(newDraft(defaultEvent));
                    setDry(null);
                    setError(null);
                    setOpen(false);
                  }}
                  className="rounded-lg border px-3"
                  style={{ height: 30, fontSize: 12.5, borderColor: "var(--color-line)", color: "var(--color-muted)" }}
                >
                  ยกเลิก
                </button>
                <button
                  type="button"
                  data-testid="rule-save"
                  disabled={busy}
                  onClick={save}
                  className="rounded-lg px-3"
                  style={{ height: 30, fontSize: 12.5, fontWeight: 700, background: "var(--color-ink)", color: "var(--color-surface)" }}
                >
                  บันทึกกฎ
                </button>
              </div>

              {error && (
                <p data-testid="rule-error" style={{ fontSize: 12, color: "var(--color-danger)" }}>
                  {error}
                </p>
              )}

              {dry && (
                <div data-testid="rule-dry-run-result" className="rounded-lg" style={{ border: "1px dashed var(--color-line)", padding: 10, background: "var(--color-surface-2)" }}>
                  <strong style={{ fontSize: 12.5 }}>จะทำอะไรกับใบไหน ({dry.length} ใบใน 30 วันที่ผ่านมา)</strong>
                  {dry.length === 0 ? (
                    <p style={{ fontSize: 12, color: "var(--color-muted)", marginTop: 4 }}>ยังไม่มีการ์ดที่เข้าเงื่อนไขนี้ — บันทึกกฎไว้ได้ กฎจะทำงานกับใบต่อ ๆ ไป</p>
                  ) : (
                    <ul style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 5 }}>
                      {dry.slice(0, 12).map((m) => (
                        <li key={m.cardId} style={{ fontSize: 12.5 }}>
                          <span style={{ color: "var(--color-muted)" }}>#{m.cardNo ?? "-"}</span> {m.title}
                          <span style={{ color: "var(--color-ink-soft)" }}> — {m.actions.join(" และ ")}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </Card>
          )}

          <div className="flex flex-col lg:flex-row" style={{ gap: 12, alignItems: "flex-start" }}>
            {/* ── ตารางกฎ ── */}
            <div className="min-w-0 flex-1">
              <Card testId="rules-table">
                <div className="flex items-baseline" style={{ gap: 8 }}>
                  <strong style={{ fontSize: 13.5 }}>กฎที่เปิดใช้อยู่</strong>
                  <span style={{ fontSize: 12, color: "var(--color-muted)" }}>{data.rules.length} กฎ</span>
                </div>
                {data.rules.length === 0 ? (
                  <p style={{ fontSize: 12.5, color: "var(--color-muted)" }}>ยังไม่มีกฎในบอร์ดนี้ — กด “สร้างกฎใหม่” แล้วเลือกจากรายการได้เลย</p>
                ) : (
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ fontSize: 11, color: "var(--color-muted)", textAlign: "left" }}>
                        <th style={{ padding: "4px 0", fontWeight: 600 }}>กฎ</th>
                        <th style={{ padding: "4px 0", fontWeight: 600, width: 82, textAlign: "right" }}>รันเดือนนี้</th>
                        <th style={{ padding: "4px 0", fontWeight: 600, width: 130, textAlign: "right" }}>สถานะ</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.rules.map((r) => (
                        <tr key={r.id} data-testid="rule-row" style={{ borderTop: "1px solid var(--color-line)" }}>
                          <td style={{ padding: "9px 0" }}>
                            <div style={{ fontSize: 12.5, fontWeight: 700 }}>{r.name}</div>
                            <div style={{ fontSize: 11.5, color: "var(--color-muted)" }}>{r.sentence}</div>
                          </td>
                          <td style={{ padding: "9px 0", fontSize: 12.5, textAlign: "right" }}>{r.runsThisMonth}</td>
                          <td style={{ padding: "9px 0", textAlign: "right" }}>
                            <div className="inline-flex items-center" style={{ gap: 8 }}>
                              <button
                                type="button"
                                role="switch"
                                aria-checked={r.enabled}
                                aria-label={`เปิด/ปิดกฎ ${r.name}`}
                                data-testid="rule-toggle"
                                onClick={() => toggle(r.id, !r.enabled)}
                                style={{ width: 34, height: 19, borderRadius: 999, background: r.enabled ? "var(--color-ink)" : "var(--color-line)", position: "relative" }}
                              >
                                <span style={{ position: "absolute", top: 2, left: r.enabled ? 17 : 2, width: 15, height: 15, borderRadius: 999, background: "var(--color-surface)" }} />
                              </button>
                              <button type="button" data-testid="rule-edit" aria-label={`แก้กฎ ${r.name}`} onClick={() => { setDraft(draftOfRule(r, defaultEvent)); setOpen(true); setDry(null); }} style={{ color: "var(--color-muted)" }}>
                                <KanbanIcon name="edit" size="sm" />
                              </button>
                              {confirmDelete === r.id ? (
                                <span className="inline-flex items-center" style={{ gap: 4, fontSize: 11.5 }}>
                                  <button type="button" data-testid="rule-delete-confirm" onClick={() => remove(r.id)} style={{ color: "var(--color-danger)", fontWeight: 700 }}>
                                    ลบเลย
                                  </button>
                                  <button type="button" onClick={() => setConfirmDelete(null)} style={{ color: "var(--color-muted)" }}>
                                    ไม่ลบ
                                  </button>
                                </span>
                              ) : (
                                <button type="button" data-testid="rule-delete" aria-label={`ลบกฎ ${r.name}`} onClick={() => setConfirmDelete(r.id)} style={{ color: "var(--color-muted)" }}>
                                  <KanbanIcon name="trash" size="sm" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </Card>
            </div>

            {/* ── คำแนะนำจาก AI + บันทึกการทำงาน ── */}
            <div className="w-full lg:w-[330px] lg:flex-none flex flex-col" style={{ gap: 12 }}>
              <Card testId="ai-suggestions">
                <div className="flex items-center" style={{ gap: 8 }}>
                  <KanbanIcon name="spark" size="sm" />
                  <strong style={{ fontSize: 13.5 }}>คำแนะนำจาก AI</strong>
                </div>
                <p style={{ fontSize: 12.5, color: "var(--color-muted)" }}>
                  เร็ว ๆ นี้ — ระบบจะดูพฤติกรรมจริงบนบอร์ดนี้ (เช่น ย้ายการ์ดชุดเดิมซ้ำ ๆ) แล้วเสนอกฎให้กดสร้างทีเดียว
                </p>
              </Card>

              <Card testId="runs-log">
                <div id="runs-log" className="flex items-center" style={{ gap: 8 }}>
                  <KanbanIcon name="clock" size="sm" />
                  <strong style={{ fontSize: 13.5 }}>บันทึกการทำงานล่าสุด</strong>
                </div>
                {data.runs.length === 0 ? (
                  <p style={{ fontSize: 12.5, color: "var(--color-muted)" }}>ยังไม่มีบันทึก — กฎจะเริ่มบันทึกทันทีที่ทำงานครั้งแรก</p>
                ) : (
                  <ul className="flex flex-col" style={{ gap: 9 }}>
                    {data.runs.map((run) => (
                      <li key={run.id} data-testid="run-row" className="flex" style={{ gap: 8, borderTop: "1px solid var(--color-line)", paddingTop: 8 }}>
                        <span
                          className="inline-flex flex-none items-center justify-center"
                          style={{
                            height: 19,
                            minWidth: 30,
                            padding: "0 6px",
                            borderRadius: 6,
                            fontSize: 10.5,
                            fontWeight: 700,
                            color: "var(--color-surface)",
                            background: run.status === "OK" ? "var(--color-tag-green)" : "var(--color-danger)",
                          }}
                        >
                          {run.status === "OK" ? "OK" : "ล้ม"}
                        </span>
                        <span className="min-w-0">
                          <span style={{ display: "block", fontSize: 12.5, fontWeight: 600 }}>{run.ruleName}</span>
                          <span style={{ display: "block", fontSize: 11.5, color: "var(--color-muted)" }}>
                            {thaiStamp(run.createdAt)}
                            {run.cardTitle ? ` · ${run.cardTitle}` : ""}
                          </span>
                          {run.status === "FAILED" && (
                            <span style={{ display: "block", fontSize: 11.5, color: "var(--color-danger)" }}>
                              {run.detail ?? "ทำไม่สำเร็จ"} — ตรวจ URL ปลายทางแล้วกดรันใหม่
                            </span>
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default AutomationBuilder;
