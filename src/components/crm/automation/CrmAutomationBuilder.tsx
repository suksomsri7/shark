// CrmAutomationBuilder.tsx — ตัวสร้างกฎอัตโนมัติ CRM (ใบ C2.1 · พิมพ์เขียว §7.3 · ภาพ ledger/design-crm/07 ส่วนบน)
//
// โครงตามภาพ: หัว (ชื่อ + ชิป scope/โควตา + ปุ่มกฎเริ่มต้น/สร้างกฎใหม่) · การ์ดตัวสร้างกฎเป็น "ประโยคไทย"
//   (เมื่อ / และถ้า / ให้ทำ / และ) + ชื่อกฎ + ทดลองรัน/ยกเลิก/บันทึก · รายการกฎที่มี (รันแล้ว · เดือนนี้ · เปิด/ปิด) · บันทึกการทำงานล่าสุด
// 🔴 client component — import เฉพาะ server actions ของหน้า + ชิ้นส่วนประโยคกลาง (`@/components/automation/SentenceParts` — ชุดเดียวกับ K2.9)
//    ห้าม import โมดูล CRM ตรง (แตะ prisma · fitness F2.3) — ทะเบียน trigger/การกระทำ/ตัวเลือกมาจากหน้าเป็น props
// 🔴 ข้อผิดพลาดแสดงในหน้า (ไม่ใช้ alert) · ข้อความไม่โทษผู้ใช้ · เวลาไทยคำนวณเอง (+07:00)
"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, selCls, selStyle, tagStyle, type Opt } from "@/components/automation/SentenceParts";
import {
  applyCrmStarterRulesAction,
  createCrmRuleAction,
  deleteCrmRuleAction,
  dryRunCrmRuleAction,
  toggleCrmRuleAction,
  updateCrmRuleAction,
} from "@/app/app/sys/[id]/crm/settings/automation/actions";
import type { CrmAutoAction, CrmAutoCondition, CrmAutomationPageData, CrmAutoRuleInput, CrmAutoRuleRow } from "./types";

type DraftCond = { field: string; op: string; value: string };
type Draft = {
  id: string | null;
  name: string;
  event: string;
  params: Record<string, string>;
  pipelineId: string;
  mode: "AND" | "OR";
  conds: DraftCond[];
  actions: CrmAutoAction[];
  enabled: boolean;
};

const BKK = 7 * 60 * 60 * 1000;
const p2 = (n: number) => (n < 10 ? `0${n}` : String(n));
function thaiStamp(iso: string): string {
  const d = new Date(new Date(iso).getTime() + BKK);
  return `${p2(d.getUTCDate())}/${p2(d.getUTCMonth() + 1)} ${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())}`;
}
const thousands = (n: number): string => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
const inputStyle: React.CSSProperties = { ...selStyle, minWidth: 0, width: "100%", maxWidth: 260 };
const rowCls = "flex flex-wrap items-center rounded-lg";
const rowStyle: React.CSSProperties = { gap: 8, padding: 10, border: "1px solid var(--color-line)" };
const btnStyle: React.CSSProperties = { height: 30, fontSize: 12.5, borderColor: "var(--color-line)" };
const STATUS_TH: Record<string, string> = { OK: "สำเร็จ", FAILED: "ไม่สำเร็จ", SKIPPED: "ข้าม", WAITING: "รอเวลา", CANCELLED: "ยกเลิก", HOLDOUT: "กลุ่มเทียบ" };
const ACTIVITY_TYPES: Opt[] = [
  { id: "TASK", name: "งาน" },
  { id: "CALL", name: "โทร" },
  { id: "MEETING", name: "นัดพบ" },
  { id: "VISIT", name: "เข้าพบ" },
];

function emptyDraft(defaultEvent: string): Draft {
  return { id: null, name: "", event: defaultEvent, params: {}, pipelineId: "", mode: "AND", conds: [], actions: [{ type: "CREATE_ACTIVITY", params: { type: "TASK", title: "", dueIn: 1, assignTo: "owner" } }], enabled: true };
}

function draftOf(r: CrmAutoRuleRow): Draft {
  const params: Record<string, string> = {};
  for (const [k, v] of Object.entries(r.trigger.params ?? {})) params[k] = String(v ?? "");
  return {
    id: r.id,
    name: r.name,
    event: r.trigger.event,
    params,
    pipelineId: r.pipelineId ?? "",
    mode: r.conditions.mode,
    conds: r.conditions.items.map((c) => ({ field: c.field, op: c.op, value: Array.isArray(c.value) ? c.value.join(",") : c.value === undefined || c.value === null ? "" : String(c.value) })),
    actions: r.actions,
    enabled: r.enabled,
  };
}

/** ค่าที่พิมพ์ → ชนิดที่บริการรับ (ตัวเลขเป็นตัวเลข · "ระหว่าง"/"เป็นหนึ่งใน" คั่นด้วยจุลภาค) */
function condValue(op: string, raw: string): unknown {
  const one = (s: string): unknown => (/^-?\d+(\.\d+)?$/.test(s.trim()) ? Number(s.trim()) : s.trim());
  if (op === "between" || op === "in") return raw.split(",").map((s) => s.trim()).filter(Boolean).map(one);
  return one(raw);
}

function toInput(d: Draft, valueless: Set<string>): CrmAutoRuleInput {
  const params: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(d.params)) if (v !== "") params[k] = /^\d+$/.test(v) ? Number(v) : v;
  const items: CrmAutoCondition[] = d.conds.map((c) => (valueless.has(c.op) ? { field: c.field, op: c.op } : { field: c.field, op: c.op, value: condValue(c.op, c.value) }));
  return {
    name: d.name,
    trigger: { event: d.event, ...(Object.keys(params).length ? { params } : {}) },
    conditions: { mode: d.mode, items },
    actions: d.actions,
    pipelineId: d.pipelineId || null,
    enabled: d.enabled,
  };
}

const str = (v: unknown): string => (v === undefined || v === null ? "" : String(v));

// ───────────────────────── ตัวแก้ 1 การกระทำ ─────────────────────────

function ActionEditor({ data, action, depth, onChange, onRemove }: { data: CrmAutomationPageData; action: CrmAutoAction; depth: number; onChange: (a: CrmAutoAction) => void; onRemove: () => void }) {
  const p = action.params ?? {};
  const set = (k: string, v: unknown) => onChange({ ...action, params: { ...p, [k]: v } });
  const actionOpts: Opt[] = data.actions.filter((a) => depth === 0 || a.value !== "WAIT_THEN").map((a) => ({ id: a.value, name: a.label }));
  const stageOpts: Opt[] = data.pipelines.flatMap((pl) => pl.stages.map((s) => ({ id: s.id, name: `${pl.name} · ${s.name}` })));
  const inner = Array.isArray(p.thenActions) ? (p.thenActions as CrmAutoAction[]) : [];
  return (
    <div className={rowCls} style={{ ...rowStyle, marginLeft: depth ? 18 : 0 }}>
      <span style={{ ...tagStyle, display: "inline-flex", alignItems: "center" }}>{depth ? "แล้ว" : "ให้ทำ"}</span>
      <select data-testid="crm-auto-action-type" aria-label="การกระทำ" className={selCls} style={selStyle} value={action.type} onChange={(e) => onChange({ type: e.target.value, params: e.target.value === "WAIT_THEN" ? { days: 1, thenActions: [] } : {} })}>
        {actionOpts.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </select>
      {action.type === "MOVE_STAGE" && (
        <select data-testid="crm-auto-action-stage" aria-label="ขั้นปลายทาง" className={selCls} style={selStyle} value={str(p.stageId)} onChange={(e) => set("stageId", e.target.value)}>
          <option value="">เลือกขั้น</option>
          {stageOpts.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
      )}
      {action.type === "ASSIGN" && (
        <select data-testid="crm-auto-action-user" aria-label="ผู้ดูแล" className={selCls} style={selStyle} value={str(p.userId)} onChange={(e) => set("userId", e.target.value)}>
          <option value="">เลือกผู้ดูแล</option>
          {data.users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>
      )}
      {action.type === "CREATE_ACTIVITY" && (
        <>
          <select data-testid="crm-auto-action-activity-type" aria-label="ชนิดงาน" className={selCls} style={selStyle} value={str(p.type) || "TASK"} onChange={(e) => set("type", e.target.value)}>
            {ACTIVITY_TYPES.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
          <input data-testid="crm-auto-action-title" aria-label="หัวเรื่องงาน" placeholder="เช่น โทรหา {ชื่อ}" className={selCls} style={inputStyle} value={str(p.title)} onChange={(e) => set("title", e.target.value)} />
          <input data-testid="crm-auto-action-due" aria-label="ภายในกี่วัน" type="number" min={0} max={365} className={selCls} style={{ ...selStyle, width: 80 }} value={str(p.dueIn)} onChange={(e) => set("dueIn", e.target.value === "" ? undefined : Number(e.target.value))} />
          <span style={{ fontSize: 12, color: "var(--color-muted)" }}>วัน</span>
        </>
      )}
      {action.type === "CREATE_DEAL" && (
        <>
          <select data-testid="crm-auto-action-pipeline" aria-label="pipeline" className={selCls} style={selStyle} value={str(p.pipelineId)} onChange={(e) => set("pipelineId", e.target.value)}>
            <option value="">เลือก pipeline</option>
            {data.pipelines.map((pl) => (
              <option key={pl.id} value={pl.id}>
                {pl.name}
              </option>
            ))}
          </select>
          <input data-testid="crm-auto-action-deal-title" aria-label="ชื่อดีล" placeholder="เช่น ต่ออายุ {ชื่อ}" className={selCls} style={inputStyle} value={str(p.titleTpl)} onChange={(e) => set("titleTpl", e.target.value)} />
        </>
      )}
      {action.type === "OPEN_KANBAN_CARD" && (
        <>
          <select data-testid="crm-auto-action-board" aria-label="บอร์ดงาน" className={selCls} style={selStyle} value={str(p.boardId)} onChange={(e) => set("boardId", e.target.value)}>
            <option value="">เลือกบอร์ด</option>
            {data.boards.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
          <input data-testid="crm-auto-action-card-title" aria-label="ชื่อการ์ด" placeholder="เช่น ตามงาน {ชื่อ}" className={selCls} style={inputStyle} value={str(p.title)} onChange={(e) => set("title", e.target.value)} />
        </>
      )}
      {action.type === "SEND_EMAIL" && (
        <input data-testid="crm-auto-action-subject" aria-label="หัวเรื่องอีเมล" placeholder="หัวเรื่องอีเมล" className={selCls} style={inputStyle} value={str(p.subject)} onChange={(e) => set("subject", e.target.value)} />
      )}
      {(action.type === "SEND_EMAIL" || action.type === "SEND_LINE" || action.type === "SEND_PUSH") && (
        <input data-testid="crm-auto-action-message" aria-label="ข้อความ" placeholder="ข้อความ (ใช้ {ชื่อ} {ดีล} ได้)" className={selCls} style={inputStyle} value={str(p.template)} onChange={(e) => set("template", e.target.value)} />
      )}
      {action.type === "SET_FIELD" && (
        <>
          <select data-testid="crm-auto-action-field" aria-label="ฟิลด์" className={selCls} style={selStyle} value={str(p.key)} onChange={(e) => onChange({ ...action, params: { ...p, objectKey: "contact", key: e.target.value } })}>
            <option value="">เลือกฟิลด์ของผู้ติดต่อ</option>
            {data.contactFields.map((f) => (
              <option key={f.key} value={f.key}>
                {f.label}
              </option>
            ))}
          </select>
          <input data-testid="crm-auto-action-value" aria-label="ค่า" placeholder="ค่า" className={selCls} style={inputStyle} value={str(p.value)} onChange={(e) => set("value", /^-?\d+(\.\d+)?$/.test(e.target.value) ? Number(e.target.value) : e.target.value)} />
        </>
      )}
      {(action.type === "ADD_TAG" || action.type === "REMOVE_TAG") && (
        <input data-testid="crm-auto-action-tag" aria-label="แท็ก" placeholder="แท็ก" className={selCls} style={inputStyle} value={str(p.tag)} onChange={(e) => set("tag", e.target.value)} />
      )}
      {(action.type === "ADJUST_SCORE" || action.type === "GIVE_POINTS") && (
        <input data-testid="crm-auto-action-points" aria-label="แต้ม" type="number" className={selCls} style={{ ...selStyle, width: 100 }} value={str(p.points)} onChange={(e) => set("points", e.target.value === "" ? undefined : Number(e.target.value))} />
      )}
      {action.type === "ISSUE_VOUCHER" && (
        <input data-testid="crm-auto-action-voucher" aria-label="แม่แบบ voucher" placeholder="รหัสแม่แบบ voucher" className={selCls} style={inputStyle} value={str(p.templateId)} onChange={(e) => set("templateId", e.target.value)} />
      )}
      {action.type === "NOTIFY_STAFF" && (
        <>
          <select data-testid="crm-auto-action-notify-to" aria-label="แจ้งใคร" className={selCls} style={selStyle} value={str(p.to) || "owner"} onChange={(e) => set("to", e.target.value)}>
            <option value="owner">ผู้ดูแล</option>
            <option value="managers">หัวหน้า/ผู้จัดการ</option>
          </select>
          <input data-testid="crm-auto-action-text" aria-label="ข้อความแจ้งเตือน" placeholder="ข้อความ (ใช้ {ชื่อ} {ดีล} ได้)" className={selCls} style={inputStyle} value={str(p.text)} onChange={(e) => set("text", e.target.value)} />
        </>
      )}
      {action.type === "WEBHOOK" && (
        <input data-testid="crm-auto-action-url" aria-label="URL ปลายทาง" placeholder="https://…" className={selCls} style={inputStyle} value={str(p.url)} onChange={(e) => set("url", e.target.value)} />
      )}
      {(action.type === "ENROLL_SEQUENCE" || action.type === "STOP_SEQUENCE") && <span style={{ fontSize: 12, color: "var(--color-muted)" }}>ทำงานเมื่อระบบ sequence เปิด</span>}
      {action.type === "WAIT_THEN" && (
        <>
          <input data-testid="crm-auto-action-days" aria-label="รอกี่วัน" type="number" min={1} max={data.maxWaitDays} className={selCls} style={{ ...selStyle, width: 80 }} value={str(p.days)} onChange={(e) => set("days", e.target.value === "" ? undefined : Number(e.target.value))} />
          <span style={{ fontSize: 12, color: "var(--color-muted)" }}>วัน แล้วทำต่อ</span>
        </>
      )}
      <button type="button" data-testid="crm-auto-action-remove" aria-label="เอาการกระทำนี้ออก" onClick={onRemove} className="rounded-lg border px-2" style={btnStyle}>
        เอาออก
      </button>
      {action.type === "WAIT_THEN" && (
        <div className="flex w-full flex-col" style={{ gap: 6 }}>
          {inner.map((a, i) => (
            <ActionEditor
              key={`${a.type}-${i}`}
              data={data}
              action={a}
              depth={depth + 1}
              onChange={(n) => set("thenActions", inner.map((x, j) => (j === i ? n : x)))}
              onRemove={() => set("thenActions", inner.filter((_, j) => j !== i))}
            />
          ))}
          <button type="button" data-testid="crm-auto-add-then" onClick={() => set("thenActions", [...inner, { type: "CREATE_ACTIVITY", params: { type: "TASK", title: "", dueIn: 1, assignTo: "owner" } }])} className="self-start rounded-lg border px-2" style={btnStyle}>
            + เพิ่มสิ่งที่ทำหลังรอ
          </button>
        </div>
      )}
    </div>
  );
}

// ───────────────────────── ตัวหลัก ─────────────────────────

export function CrmAutomationBuilder({ data }: { data: CrmAutomationPageData }) {
  const router = useRouter();
  const defaultEvent = data.triggers.find((t) => t.value === "crm.deal.stale")?.value ?? data.triggers[0]?.value ?? "";
  const [open, setOpen] = useState(data.rules.length === 0);
  const [draft, setDraft] = useState<Draft>(() => emptyDraft(defaultEvent));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [dry, setDry] = useState<{ total: number; days: number; labels: string[] } | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const valueless = useMemo(() => new Set(data.ops.filter((o) => o.valueless).map((o) => o.value)), [data.ops]);
  const trig = data.triggers.find((t) => t.value === draft.event);
  const obj = data.objects.find((o) => o.key === draft.params.objectKey);
  const setParam = (k: string, v: string) => setDraft({ ...draft, params: { ...draft.params, [k]: v } });

  const run = async <T,>(fn: () => Promise<T>): Promise<T | null> => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      return await fn();
    } catch {
      setError("ติดต่อเซิร์ฟเวอร์ไม่สำเร็จ — ลองใหม่อีกครั้ง");
      return null;
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    const input = toInput(draft, valueless);
    const r = await run(() => (draft.id ? updateCrmRuleAction(data.systemId, draft.id, input) : createCrmRuleAction(data.systemId, input)));
    if (!r) return;
    if (!r.ok) return setError(r.error);
    setOpen(false);
    setDraft(emptyDraft(defaultEvent));
    setDry(null);
    setNotice("บันทึกกฎแล้ว");
    router.refresh();
  };
  const tryRun = async () => {
    const r = await run(() => dryRunCrmRuleAction(data.systemId, toInput(draft, valueless)));
    if (!r) return;
    if (!r.ok) return setError(r.error);
    setDry({ total: r.total, days: r.days, labels: r.labels });
  };
  const toggle = async (row: CrmAutoRuleRow) => {
    const r = await run(() => toggleCrmRuleAction(data.systemId, row.id, !row.enabled));
    if (r && !r.ok) return setError(r.error);
    router.refresh();
  };
  const remove = async (id: string) => {
    const r = await run(() => deleteCrmRuleAction(data.systemId, id, reason));
    if (!r) return;
    if (!r.ok) return setError(r.error);
    setDeleting(null);
    setReason("");
    router.refresh();
  };
  const starters = async () => {
    const r = await run(() => applyCrmStarterRulesAction(data.systemId));
    if (!r) return;
    if (!r.ok) return setError(r.error);
    setNotice(r.created > 0 ? `เพิ่มกฎเริ่มต้น ${r.created} กฎ (ปิดไว้ก่อน — เปิดใช้ทีละกฎได้ในรายการ)` : "มีกฎเริ่มต้นครบแล้ว");
    router.refresh();
  };

  const condField = (c: DraftCond, i: number, patch: Partial<DraftCond>) => setDraft({ ...draft, conds: draft.conds.map((x, j) => (j === i ? { ...x, ...patch } : x)) });

  return (
    <div data-testid="crm-auto-page" className="flex min-w-0 flex-col" style={{ gap: 14 }}>
      <div className="flex flex-wrap items-center" style={{ gap: 8 }}>
        <span style={{ ...tagStyle, display: "inline-flex", alignItems: "center" }}>scope: CRM</span>
        <span data-testid="crm-auto-usage" style={{ ...tagStyle, display: "inline-flex", alignItems: "center" }}>
          ใช้ไป {thousands(data.usage.used)} / {thousands(data.usage.limit)} ครั้งเดือนนี้
        </span>
        <div className="ml-auto flex flex-wrap" style={{ gap: 8 }}>
          <button type="button" data-testid="crm-auto-starters" disabled={busy} onClick={starters} className="rounded-lg border px-3" style={btnStyle}>
            ใช้กฎเริ่มต้น 6 กฎ
          </button>
          <button
            type="button"
            data-testid="crm-auto-new"
            onClick={() => {
              setDraft(emptyDraft(defaultEvent));
              setDry(null);
              setError(null);
              setOpen(true);
            }}
            className="rounded-lg px-3"
            style={{ height: 30, fontSize: 12.5, background: "var(--color-ink)", color: "var(--color-surface)", fontWeight: 700 }}
          >
            + สร้างกฎใหม่
          </button>
        </div>
      </div>
      {data.timerStale && (
        <p data-testid="crm-auto-timer-notice" role="status" className="rounded-lg" style={{ fontSize: 12.5, padding: "8px 10px", border: "1px solid var(--color-line)", background: "var(--color-surface-2)", color: "var(--color-ink-soft)" }}>
          ตัวจับเวลาของระบบยังไม่ทำงาน — ขั้น &quot;รอ&quot; และกฎตามเวลา (ดีลนิ่ง · คะแนนถึงเกณฑ์ · ใบเสนอราคาไม่ตอบ · ใกล้วันปิดดีล · วันที่ในข้อมูลกำหนดเอง) จะยังไม่ทำงานจนกว่าจะเปิด
        </p>
      )}
      {notice && (
        <p data-testid="crm-auto-notice" style={{ fontSize: 12.5, color: "var(--color-ink-soft)" }}>
          {notice}
        </p>
      )}
      {error && !open && (
        <p data-testid="crm-auto-list-error" style={{ fontSize: 12.5, color: "var(--color-danger)" }}>
          {error}
        </p>
      )}

      {open && (
        <Card testId="crm-auto-builder">
          <div className="flex flex-wrap items-center" style={{ gap: 8 }}>
            <strong style={{ fontSize: 14 }}>{draft.id ? "แก้กฎ" : "กฎใหม่"}{draft.name ? ` — ${draft.name}` : ""}</strong>
            <span style={{ fontSize: 12, color: "var(--color-muted)" }}>ประโยคไทย เลือกจากรายการ ไม่ต้องเขียนโค้ด</span>
            {dry && (
              <span data-testid="crm-auto-dry-result" className="ml-auto" style={{ ...tagStyle, display: "inline-flex", alignItems: "center", color: "var(--color-accent, #1d4ed8)" }}>
                ทดลองรัน: ตรง {thousands(dry.total)} รายการ (ย้อนหลัง {dry.days} วัน){dry.labels.length ? ` · ${dry.labels.slice(0, 3).join(", ")}` : ""}
              </span>
            )}
          </div>

          <div className={rowCls} style={rowStyle}>
            <span style={{ ...tagStyle, display: "inline-flex", alignItems: "center", background: "var(--color-ink)", color: "var(--color-surface)" }}>เมื่อ</span>
            <select data-testid="crm-auto-trigger" aria-label="เหตุการณ์เริ่มกฎ" className={selCls} style={selStyle} value={draft.event} onChange={(e) => setDraft({ ...draft, event: e.target.value, params: {} })}>
              {data.triggers.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
            {trig?.params.includes("days") && (
              <input data-testid="crm-auto-param-days" aria-label="จำนวนวัน" type="number" min={1} max={365} placeholder="14" className={selCls} style={{ ...selStyle, width: 80 }} value={draft.params.days ?? ""} onChange={(e) => setParam("days", e.target.value)} />
            )}
            {trig?.params.includes("band") && (
              <select data-testid="crm-auto-param-band" aria-label="ระดับคะแนน" className={selCls} style={selStyle} value={draft.params.band ?? ""} onChange={(e) => setParam("band", e.target.value)}>
                <option value="">เลือกระดับ</option>
                {data.bands.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            )}
            {trig?.params.includes("objectKey") && (
              <>
                <select data-testid="crm-auto-param-object" aria-label="ข้อมูลกำหนดเอง" className={selCls} style={selStyle} value={draft.params.objectKey ?? ""} onChange={(e) => setDraft({ ...draft, params: { ...draft.params, objectKey: e.target.value, fieldKey: "" } })}>
                  <option value="">เลือกข้อมูลกำหนดเอง</option>
                  {data.objects.map((o) => (
                    <option key={o.key} value={o.key}>
                      {o.label}
                    </option>
                  ))}
                </select>
                <select data-testid="crm-auto-param-field" aria-label="ฟิลด์วันที่" className={selCls} style={selStyle} value={draft.params.fieldKey ?? ""} onChange={(e) => setParam("fieldKey", e.target.value)}>
                  <option value="">เลือกฟิลด์วันที่</option>
                  {(obj?.dateFields ?? []).map((f) => (
                    <option key={f.key} value={f.key}>
                      {f.label}
                    </option>
                  ))}
                </select>
              </>
            )}
            {trig?.params.includes("daysBefore") && (
              <>
                <span style={{ fontSize: 12, color: "var(--color-muted)" }}>ล่วงหน้า</span>
                <input data-testid="crm-auto-param-days-before" aria-label="ล่วงหน้ากี่วัน" type="number" min={0} max={365} placeholder="7" className={selCls} style={{ ...selStyle, width: 80 }} value={draft.params.daysBefore ?? ""} onChange={(e) => setParam("daysBefore", e.target.value)} />
                <span style={{ fontSize: 12, color: "var(--color-muted)" }}>วัน</span>
              </>
            )}
            <select data-testid="crm-auto-pipeline" aria-label="pipeline" className={selCls} style={selStyle} value={draft.pipelineId} onChange={(e) => setDraft({ ...draft, pipelineId: e.target.value })}>
              <option value="">ทุก pipeline</option>
              {data.pipelines.map((pl) => (
                <option key={pl.id} value={pl.id}>
                  {pl.name}
                </option>
              ))}
            </select>
          </div>

          {trig?.cron && (
            <p data-testid="crm-auto-cron-help" style={{ fontSize: 12, color: "var(--color-muted)" }}>
              กฎตามเวลาตรวจวันละครั้ง: งานเลยกำหนดเตือนครั้งเดียวต่องาน · ดีลนิ่งเตือนครั้งเดียวต่อช่วงที่นิ่ง · คะแนนเตือนครั้งเดียวต่อการอัปเดตคะแนน · ใกล้วันปิดดีล/วันที่ในข้อมูลเตือนครั้งเดียวต่อรายการ — เปิดกฎแล้ว ทุกรายการที่ตรงอยู่แล้วจะถูกเตือนในรอบถัดไป
            </p>
          )}
          {draft.conds.length > 1 && (
            <div className="flex flex-wrap items-center" style={{ gap: 8 }}>
              <span style={{ fontSize: 12, color: "var(--color-muted)" }}>เงื่อนไขทุกข้อต้อง</span>
              <select data-testid="crm-auto-cond-mode" aria-label="และ/หรือ" className={selCls} style={selStyle} value={draft.mode} onChange={(e) => setDraft({ ...draft, mode: e.target.value === "OR" ? "OR" : "AND" })}>
                <option value="AND">ตรงทุกข้อ (และ)</option>
                <option value="OR">ตรงข้อใดข้อหนึ่ง (หรือ)</option>
              </select>
            </div>
          )}
          {draft.conds.map((c, i) => (
            <div key={`c-${i}`} className={rowCls} style={rowStyle}>
              <span style={{ ...tagStyle, display: "inline-flex", alignItems: "center" }}>{i === 0 ? "และถ้า" : draft.mode === "OR" ? "หรือ" : "และ"}</span>
              <select data-testid="crm-auto-cond-field" aria-label="ช่องของเงื่อนไข" className={selCls} style={selStyle} value={c.field} onChange={(e) => condField(c, i, { field: e.target.value })}>
                <option value="">เลือกช่อง</option>
                {data.conditionFields.map((f) => (
                  <option key={f.value} value={f.value}>
                    {f.label}
                  </option>
                ))}
              </select>
              <select data-testid="crm-auto-cond-op" aria-label="ตัวเปรียบเทียบ" className={selCls} style={selStyle} value={c.op} onChange={(e) => condField(c, i, { op: e.target.value })}>
                {data.ops.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              {!valueless.has(c.op) && (
                <input data-testid="crm-auto-cond-value" aria-label="ค่า" placeholder={c.op === "between" ? "ต่ำสุด,สูงสุด" : c.op === "in" ? "ค่า1,ค่า2" : "ค่า"} className={selCls} style={inputStyle} value={c.value} onChange={(e) => condField(c, i, { value: e.target.value })} />
              )}
              <button type="button" data-testid="crm-auto-cond-remove" aria-label="เอาเงื่อนไขนี้ออก" onClick={() => setDraft({ ...draft, conds: draft.conds.filter((_, j) => j !== i) })} className="rounded-lg border px-2" style={btnStyle}>
                เอาออก
              </button>
            </div>
          ))}

          {draft.actions.map((a, i) => (
            <ActionEditor
              key={`a-${i}`}
              data={data}
              action={a}
              depth={0}
              onChange={(n) => setDraft({ ...draft, actions: draft.actions.map((x, j) => (j === i ? n : x)) })}
              onRemove={() => setDraft({ ...draft, actions: draft.actions.filter((_, j) => j !== i) })}
            />
          ))}

          <div className="flex flex-wrap items-center" style={{ gap: 8, fontSize: 12.5, color: "var(--color-muted)" }}>
            <button type="button" data-testid="crm-auto-add-condition" onClick={() => setDraft({ ...draft, conds: [...draft.conds, { field: "", op: "eq", value: "" }] })} className="rounded-lg border px-2" style={btnStyle}>
              + เพิ่มเงื่อนไข
            </button>
            <button
              type="button"
              data-testid="crm-auto-add-action"
              disabled={draft.actions.length >= data.maxActions}
              onClick={() => setDraft({ ...draft, actions: [...draft.actions, { type: "NOTIFY_STAFF", params: { to: "owner", text: "" } }] })}
              className="rounded-lg border px-2"
              style={btnStyle}
            >
              + เพิ่มการกระทำ ({data.actions.length} ชนิด)
            </button>
          </div>

          <div className="flex flex-wrap items-center" style={{ gap: 8 }}>
            <input data-testid="crm-auto-name" aria-label="ชื่อกฎ" placeholder="ชื่อกฎ เช่น ดีลนิ่ง 14 วัน — แจ้งหัวหน้าทีม" className={`${selCls} min-w-0 flex-1`} style={{ ...selStyle, maxWidth: "none", minWidth: 180 }} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
            <button type="button" data-testid="crm-auto-dry-run" disabled={busy} onClick={tryRun} className="rounded-lg border px-3" style={btnStyle}>
              ทดลองรัน
            </button>
            <button type="button" data-testid="crm-auto-cancel" onClick={() => { setOpen(false); setError(null); setDry(null); }} className="rounded-lg border px-3" style={btnStyle}>
              ยกเลิก
            </button>
            <button type="button" data-testid="crm-auto-save" disabled={busy} onClick={save} className="rounded-lg px-3" style={{ height: 30, fontSize: 12.5, background: "var(--color-ink)", color: "var(--color-surface)", fontWeight: 700 }}>
              บันทึกกฎ
            </button>
          </div>
          {error && (
            <p data-testid="crm-auto-error" style={{ fontSize: 12, color: "var(--color-danger)" }}>
              {error}
            </p>
          )}
        </Card>
      )}

      <Card testId="crm-auto-rules">
        <div className="flex flex-wrap items-baseline" style={{ gap: 8 }}>
          <strong style={{ fontSize: 14 }}>กฎที่มีอยู่</strong>
          <span style={{ fontSize: 12, color: "var(--color-muted)" }}>{data.rules.length} กฎ · เปิดอยู่ {data.rules.filter((r) => r.enabled).length}</span>
        </div>
        {data.rules.length === 0 ? (
          <p style={{ fontSize: 12.5, color: "var(--color-muted)" }}>ยังไม่มีกฎ — กด &quot;ใช้กฎเริ่มต้น 6 กฎ&quot; หรือ &quot;สร้างกฎใหม่&quot;</p>
        ) : (
          <ul className="flex flex-col" style={{ gap: 0 }}>
            {data.rules.map((r) => (
              <li key={r.id} data-testid="crm-auto-rule-row" className="flex flex-wrap items-center" style={{ gap: 10, borderTop: "1px solid var(--color-line)", padding: "10px 0", opacity: r.enabled ? 1 : 0.65 }}>
                <div className="min-w-0 flex-1" style={{ minWidth: 180 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 700, overflowWrap: "anywhere" }}>{r.name}</div>
                  <div style={{ fontSize: 12, color: "var(--color-muted)", overflowWrap: "anywhere" }}>{r.summary}</div>
                </div>
                <span style={{ fontSize: 12, color: "var(--color-muted)" }}>รันแล้ว {thousands(r.runsTotal)} · เดือนนี้ {thousands(r.runsThisMonth)}</span>
                <button
                  type="button"
                  data-testid="crm-auto-rule-toggle"
                  role="switch"
                  aria-checked={r.enabled}
                  aria-label={`${r.enabled ? "ปิด" : "เปิด"}กฎ ${r.name}`}
                  disabled={busy}
                  onClick={() => toggle(r)}
                  className="rounded-full"
                  style={{ width: 40, height: 22, background: r.enabled ? "var(--color-ink)" : "var(--color-line)", position: "relative" }}
                >
                  <span style={{ position: "absolute", top: 3, left: r.enabled ? 21 : 3, width: 16, height: 16, borderRadius: 999, background: "var(--color-surface)" }} />
                </button>
                <button type="button" data-testid="crm-auto-rule-edit" aria-label={`แก้กฎ ${r.name}`} onClick={() => { setDraft(draftOf(r)); setDry(null); setError(null); setOpen(true); }} className="rounded-lg border px-2" style={btnStyle}>
                  แก้
                </button>
                {deleting === r.id ? (
                  <span className="flex w-full flex-wrap items-center" style={{ gap: 6 }}>
                    <input data-testid="crm-auto-delete-reason" aria-label="เหตุผลที่ลบ" placeholder="เหตุผลที่ลบ (อย่างน้อย 5 ตัวอักษร)" className={`${selCls} min-w-0 flex-1`} style={{ ...selStyle, maxWidth: "none" }} value={reason} onChange={(e) => setReason(e.target.value)} />
                    <button type="button" data-testid="crm-auto-delete-confirm" disabled={busy} onClick={() => remove(r.id)} className="rounded-lg border px-2" style={{ ...btnStyle, color: "var(--color-danger)", fontWeight: 700 }}>
                      ยืนยันลบ
                    </button>
                    <button type="button" data-testid="crm-auto-delete-cancel" onClick={() => { setDeleting(null); setReason(""); }} className="rounded-lg border px-2" style={btnStyle}>
                      ไม่ลบ
                    </button>
                  </span>
                ) : (
                  <button type="button" data-testid="crm-auto-rule-delete" aria-label={`ลบกฎ ${r.name}`} onClick={() => { setDeleting(r.id); setReason(""); }} className="rounded-lg border px-2" style={btnStyle}>
                    ลบ
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card testId="crm-auto-runs">
        <strong style={{ fontSize: 14 }}>บันทึกการทำงานล่าสุด</strong>
        {data.runs.length === 0 ? (
          <p style={{ fontSize: 12.5, color: "var(--color-muted)" }}>ยังไม่มีการทำงาน</p>
        ) : (
          <ul className="flex flex-col" style={{ gap: 6 }}>
            {data.runs.map((run) => (
              <li key={run.id} data-testid="crm-auto-run-row" className="flex flex-wrap" style={{ gap: 8, borderTop: "1px solid var(--color-line)", paddingTop: 6, fontSize: 12 }}>
                <span style={{ color: "var(--color-muted)" }}>{thaiStamp(run.at)}</span>
                <strong>{run.ruleName}</strong>
                <span style={{ ...tagStyle, height: 20, fontSize: 11, display: "inline-flex", alignItems: "center" }}>{STATUS_TH[run.status] ?? run.status}</span>
                <span className="min-w-0" style={{ color: "var(--color-ink-soft)", overflowWrap: "anywhere", flexBasis: "100%" }}>{run.detail}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

export default CrmAutomationBuilder;
