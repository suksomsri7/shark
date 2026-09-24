// automation-shared.ts — ทะเบียนของ "กฎอัตโนมัติ CRM" (ใบ C2.1 · พิมพ์เขียว §7.3 · มติ C13/C18 · ภาพ 07 บน)
//
// 🔴 ไฟล์บริสุทธิ์: ไม่แตะ prisma / next / server-only — หน้า (server) อ่านแล้วส่งต่อให้ตัวสร้างกฎฝั่ง client เป็น props
//    (ไฟล์ 'use client' นอกโฟลเดอร์ CRM import ไฟล์นี้ตรงไม่ได้ — fitness F2.3) · เอนจิน `automation.ts` ใช้ชุดเดียวกันตรวจ input
// 🔴 trigger = ทุก event `crm.*` / `custom.record.*` ของทะเบียนกลาง `AUTOMATION_EVENTS` (ประกาศที่เดียว) + 5 trigger ตามรอบเวลา (cron)
// 🔴 ตัวเลขเพดาน: การกระทำ ≤ 20 ต่อกฎ (นับรวมที่ซ้อนใน "รอ n วัน") · รอได้ ≤ 90 วัน · ซ้อน "รอ" ได้ชั้นเดียว · โควตา 5,000 ครั้ง/เดือน/ร้าน

import { AUTOMATION_EVENTS } from "@/lib/automation/labels";

// ───────────────────────── trigger ─────────────────────────

export type CrmTriggerGroup = "contact" | "company" | "deal" | "activity" | "record" | "score";
export type CrmTriggerDef = {
  value: string;
  label: string;
  group: CrmTriggerGroup;
  /** true = cron รายวันเป็นคนยิง (ไม่มี outbox event) */
  cron?: boolean;
  /** ชื่อพารามิเตอร์ของ trigger ตามรอบเวลา */
  params?: readonly string[];
};

const groupOf = (value: string): CrmTriggerGroup =>
  value.startsWith("custom.record.") ? "record" : value.startsWith("crm.company.") ? "company" : value.startsWith("crm.deal.") ? "deal" : value.startsWith("crm.activity.") ? "activity" : value.startsWith("crm.score.") ? "score" : "contact";

export const CRM_CRON_TRIGGERS: readonly CrmTriggerDef[] = Object.freeze([
  { value: "crm.deal.stale", label: "เมื่อดีลนิ่ง (ไม่มีความเคลื่อนไหว) เกิน n วัน", group: "deal", cron: true, params: ["days"] },
  { value: "crm.activity.overdue", label: "เมื่องานติดตามเลยกำหนดแล้วยังไม่เสร็จ", group: "activity", cron: true, params: [] },
  { value: "crm.score.threshold", label: "เมื่อคะแนนผู้ติดต่อถึงระดับที่ตั้งไว้ (ร้อน/อุ่น/เย็น)", group: "score", cron: true, params: ["band"] },
  { value: "crm.deal.close_due", label: "ก่อนวันคาดว่าจะปิดดีล n วัน", group: "deal", cron: true, params: ["daysBefore"] },
  { value: "custom.record.field_due", label: "ก่อนวันที่ในฟิลด์ของข้อมูลกำหนดเองถึงกำหนด n วัน", group: "record", cron: true, params: ["objectKey", "fieldKey", "daysBefore"] },
]);

export const CRM_RULE_TRIGGERS: readonly CrmTriggerDef[] = Object.freeze([
  ...AUTOMATION_EVENTS.filter((e) => e.value.startsWith("crm.") || e.value.startsWith("custom.record.")).map((e) => ({ value: e.value, label: e.label, group: groupOf(e.value) })),
  ...CRM_CRON_TRIGGERS,
]);

export const CRM_TRIGGER_VALUES: ReadonlySet<string> = new Set(CRM_RULE_TRIGGERS.map((t) => t.value));
export const CRM_CRON_TRIGGER_VALUES: ReadonlySet<string> = new Set(CRM_CRON_TRIGGERS.map((t) => t.value));
export const crmTriggerDef = (value: string): CrmTriggerDef | undefined => CRM_RULE_TRIGGERS.find((t) => t.value === value);

export const CRM_SCORE_BANDS = ["HOT", "WARM", "COLD"] as const;
export const CRM_SCORE_BAND_LABELS: Readonly<Record<string, string>> = Object.freeze({ HOT: "ร้อน", WARM: "อุ่น", COLD: "เย็น" });

// ───────────────────────── การกระทำ ─────────────────────────

export const CRM_ACTION_TYPES = [
  "MOVE_STAGE",
  "ASSIGN",
  "CREATE_ACTIVITY",
  "OPEN_KANBAN_CARD",
  "SEND_EMAIL",
  "SEND_LINE",
  "SEND_PUSH",
  "ENROLL_SEQUENCE",
  "STOP_SEQUENCE",
  "SET_FIELD",
  "ADD_TAG",
  "REMOVE_TAG",
  "ADJUST_SCORE",
  "NOTIFY_STAFF",
  "WEBHOOK",
  "WAIT_THEN",
  "CREATE_DEAL",
  // RESOLUTIONS R-A — ของสมาชิก ผ่าน adapter ของสมาชิกเท่านั้น (ผู้ติดต่อที่ผูกสมาชิกแล้ว)
  "ISSUE_VOUCHER",
  "GIVE_POINTS",
] as const;
export type CrmActionType = (typeof CRM_ACTION_TYPES)[number];
export const CRM_ACTION_TYPE_SET: ReadonlySet<string> = new Set(CRM_ACTION_TYPES);

export const CRM_ACTION_LABELS: Readonly<Record<CrmActionType, string>> = Object.freeze({
  MOVE_STAGE: "ย้ายดีลไปขั้น",
  ASSIGN: "มอบหมายผู้ดูแล",
  CREATE_ACTIVITY: "สร้างงานติดตาม",
  OPEN_KANBAN_CARD: "เปิดการ์ดในบอร์ดงาน",
  SEND_EMAIL: "ส่งอีเมลหาผู้ติดต่อ",
  SEND_LINE: "ส่ง LINE หาผู้ติดต่อ",
  SEND_PUSH: "แจ้งเตือนผู้ดูแลบนมือถือ",
  ENROLL_SEQUENCE: "ลงทะเบียน sequence",
  STOP_SEQUENCE: "หยุด sequence",
  SET_FIELD: "ตั้งค่าฟิลด์",
  ADD_TAG: "ติดแท็ก",
  REMOVE_TAG: "เอาแท็กออก",
  ADJUST_SCORE: "ปรับคะแนน",
  NOTIFY_STAFF: "แจ้งพนักงานในแอป",
  WEBHOOK: "ส่ง webhook",
  WAIT_THEN: "รอ n วันแล้วทำต่อ",
  CREATE_DEAL: "เปิดดีลใหม่",
  ISSUE_VOUCHER: "ออก voucher (สมาชิก)",
  GIVE_POINTS: "ให้แต้ม (สมาชิก)",
});

export const CRM_MAX_ACTIONS = 20;
export const CRM_MAX_WAIT_DAYS = 90;
export const CRM_MAX_CONDITIONS = 20;
/** โควตาการทำงานของกฎ CRM ต่อเดือน (ต่อร้าน · นับทุกระบบ CRM ของร้าน) — ค่าในร้าน `Tenant.limits.crm.automationRunsPerMonth` ชนะ */
export const CRM_AUTOMATION_RUNS_PER_MONTH = 5000;
/** กฎเดิม + ผู้ติดต่อเดิม ทำงานซ้ำภายในช่วงนี้ด้วย event คนละใบ = วน (แบบเดียวกับ K2.9) */
export const CRM_LOOP_GUARD_MS = 60_000;

// ───────────────────────── เงื่อนไข ─────────────────────────

export const CRM_CONDITION_OPS = [
  "eq", "neq", "gt", "gte", "lt", "lte", "between", "in", "contains", "exists", "not_exists", "count_gte", "count_lte",
] as const;
export type CrmConditionOp = (typeof CRM_CONDITION_OPS)[number];
export const CRM_CONDITION_OP_SET: ReadonlySet<string> = new Set(CRM_CONDITION_OPS);
export const CRM_CONDITION_OP_LABELS: Readonly<Record<CrmConditionOp, string>> = Object.freeze({
  eq: "เท่ากับ", neq: "ไม่เท่ากับ", gt: "มากกว่า", gte: "อย่างน้อย", lt: "น้อยกว่า", lte: "ไม่เกิน", between: "อยู่ระหว่าง", in: "เป็นหนึ่งใน",
  contains: "มี", exists: "มีค่า", not_exists: "ไม่มีค่า", count_gte: "จำนวนอย่างน้อย", count_lte: "จำนวนไม่เกิน",
});
/** op ที่ไม่ต้องมีค่า */
export const CRM_VALUELESS_OPS: ReadonlySet<string> = new Set(["exists", "not_exists"]);

/** คอลัมน์ที่ใช้ในเงื่อนไขได้ (prefix `c.` ผู้ติดต่อ · `co.` บริษัท · `d.` ดีล) — ป้ายไทยสำหรับตัวสร้างกฎ */
export const CRM_CONDITION_FIELDS: Readonly<Record<"c" | "co" | "d", Readonly<Record<string, string>>>> = Object.freeze({
  c: {
    lifecycleStage: "ขั้นของลูกค้า (lifecycle)",
    leadStatus: "สถานะ lead",
    score: "คะแนน",
    scoreBand: "ระดับคะแนน",
    tags: "แท็ก",
    ownerUserId: "ผู้ดูแล",
    teamId: "ทีม",
    sourceKind: "ที่มา",
    sourceChannel: "ช่องทางที่มา",
    source: "ที่มา (ข้อความ)",
    companyId: "บริษัท",
    memberCustomerId: "เป็นสมาชิก",
    marketingOptOut: "ขอไม่รับข่าวสาร",
    lastActivityAt: "กิจกรรมล่าสุด",
    createdAt: "วันที่สร้าง",
    locale: "ภาษา",
  },
  co: {
    industry: "อุตสาหกรรม",
    size: "ขนาดบริษัท",
    lifecycleStage: "ขั้นของบริษัท",
    score: "คะแนนบริษัท",
    ownerUserId: "ผู้ดูแลบริษัท",
    emailDomain: "โดเมนอีเมล",
  },
  d: {
    valueSatang: "มูลค่าดีล (สตางค์)",
    stageId: "ขั้นของดีล",
    pipelineId: "pipeline",
    kind: "สถานะดีล (เปิด/ชนะ/แพ้)",
    ownerUserId: "ผู้ดูแลดีล",
    teamId: "ทีมของดีล",
    expectedCloseAt: "วันที่คาดว่าจะปิด",
    forecastCategory: "หมวดพยากรณ์",
    tags: "แท็กของดีล",
    quotationDocId: "ใบเสนอราคา",
    stageEnteredAt: "วันที่เข้าขั้นนี้",
    lastActivityAt: "กิจกรรมล่าสุดของดีล",
    probabilityOverride: "โอกาสปิด (กำหนดเอง)",
    createdAt: "วันที่เปิดดีล",
  },
});

/** รูปของ field ในเงื่อนไข: `c.x` · `co.x` · `d.x` · `f.key` (ฟิลด์กำหนดเองของผู้ติดต่อ) · `d.f.key` (ของดีล) · `o.obj` · `o.obj.field` */
export type CrmConditionField =
  | { kind: "c" | "co" | "d"; column: string }
  | { kind: "f"; objectKey: "contact" | "deal"; key: string }
  | { kind: "o"; objectKey: string; fieldKey: string | null };

const KEY_RE = /^[a-zA-Z][a-zA-Z0-9_]{0,63}$/;

export function parseConditionField(raw: unknown): CrmConditionField | null {
  const s = typeof raw === "string" ? raw.trim() : "";
  if (!s) return null;
  const parts = s.split(".");
  if (parts[0] === "d" && parts[1] === "f" && parts.length === 3 && KEY_RE.test(parts[2]!)) return { kind: "f", objectKey: "deal", key: parts[2]! };
  if ((parts[0] === "c" || parts[0] === "co" || parts[0] === "d") && parts.length === 2) {
    const col = parts[1]!;
    return Object.prototype.hasOwnProperty.call(CRM_CONDITION_FIELDS[parts[0]], col) ? { kind: parts[0], column: col } : null;
  }
  if (parts[0] === "f" && parts.length === 2 && KEY_RE.test(parts[1]!)) return { kind: "f", objectKey: "contact", key: parts[1]! };
  if (parts[0] === "o" && (parts.length === 2 || parts.length === 3) && parts.slice(1).every((p) => KEY_RE.test(p))) {
    return { kind: "o", objectKey: parts[1]!, fieldKey: parts[2] ?? null };
  }
  return null;
}

// ───────────────────────── input ─────────────────────────

export type CrmRuleTrigger = { event: string; params?: Record<string, unknown> };
export type CrmRuleCondition = { field: string; op: string; value?: unknown };
export type CrmRuleConditions = { mode: "AND" | "OR"; items: CrmRuleCondition[] };
export type CrmRuleAction = { type: string; params?: Record<string, unknown> };
export type CrmRuleInput = {
  name: string;
  trigger: CrmRuleTrigger;
  conditions?: CrmRuleConditions | null;
  actions: CrmRuleAction[];
  pipelineId?: string | null;
  enabled?: boolean;
};

/** ขั้นที่ซ้อนอยู่ใน "รอ n วัน" (ไฟล์บริสุทธิ์ — ใช้ได้ทั้งหน้าและเอนจิน) */
export function crmThenActionsOf(a: CrmRuleAction): CrmRuleAction[] {
  const raw = a.params?.thenActions;
  return Array.isArray(raw) ? raw.filter((x): x is CrmRuleAction => !!x && typeof x === "object" && typeof (x as CrmRuleAction).type === "string") : [];
}

export function countCrmActions(actions: CrmRuleAction[]): number {
  let n = 0;
  for (const a of actions) n += 1 + countCrmActions(crmThenActionsOf(a));
  return n;
}

// ───────────────────────── กฎเริ่มต้น 6 ใบ (พิมพ์เขียว §7.3 · ปิดไว้ทุกใบ) ─────────────────────────

export type CrmStarterRule = {
  key: string;
  name: string;
  trigger: CrmRuleTrigger;
  conditions?: CrmRuleConditions;
  actions: CrmRuleAction[];
};

export const CRM_STARTER_RULES: readonly CrmStarterRule[] = Object.freeze([
  {
    key: "new-lead",
    name: "lead ใหม่ — งานต้อนรับ + แจ้งผู้ดูแล",
    trigger: { event: "crm.contact.created" },
    actions: [
      { type: "CREATE_ACTIVITY", params: { type: "TASK", title: "ต้อนรับและติดต่อกลับ {ชื่อ}", dueIn: 1, assignTo: "owner" } },
      { type: "NOTIFY_STAFF", params: { to: "owner", text: "มีผู้สนใจใหม่: {ชื่อ}" } },
    ],
  },
  {
    key: "deal-stale-14",
    name: "ดีลนิ่ง 14 วัน — งานติดตาม + แจ้งหัวหน้าทีม",
    trigger: { event: "crm.deal.stale", params: { days: 14 } },
    actions: [
      { type: "CREATE_ACTIVITY", params: { type: "TASK", title: "ติดตามดีลที่นิ่ง: {ดีล}", dueIn: 1, assignTo: "owner" } },
      { type: "NOTIFY_STAFF", params: { to: "managers", text: "ดีลนิ่งเกิน 14 วัน: {ดีล}" } },
    ],
  },
  {
    key: "score-hot",
    name: "คะแนนถึงระดับร้อน — แจ้งผู้ดูแลทันที",
    trigger: { event: "crm.score.threshold", params: { band: "HOT" } },
    actions: [{ type: "NOTIFY_STAFF", params: { to: "owner", text: "ลูกค้าคะแนนร้อน: {ชื่อ} — ติดต่อตอนนี้" } }],
  },
  {
    key: "quote-no-reply-5",
    name: "ใบเสนอราคาไม่ตอบ 5 วัน — sequence ติดตาม",
    trigger: { event: "crm.deal.stale", params: { days: 5 } },
    conditions: { mode: "AND", items: [{ field: "d.quotationDocId", op: "exists" }] },
    actions: [{ type: "ENROLL_SEQUENCE", params: { sequenceKey: "quote-follow-up" } }],
  },
  {
    key: "deal-lost-winback",
    name: "ดีลแพ้ — รอ 90 วันแล้วดึงกลับ",
    trigger: { event: "crm.deal.lost" },
    actions: [{ type: "WAIT_THEN", params: { days: 90, thenActions: [{ type: "ENROLL_SEQUENCE", params: { sequenceKey: "win-back" } }] } }],
  },
  {
    key: "deal-won-invoice",
    name: "ลูกค้าตกลง — งานออกใบแจ้งหนี้",
    trigger: { event: "crm.deal.won" },
    actions: [
      { type: "CREATE_ACTIVITY", params: { type: "TASK", title: "ออกใบแจ้งหนี้: {ดีล}", dueIn: 1, assignTo: "owner" } },
      { type: "NOTIFY_STAFF", params: { to: "owner", text: "ลูกค้าตกลงแล้ว: {ดีล} — ออกใบแจ้งหนี้" } },
    ],
  },
]);

// ───────────────────────── ประโยคไทย (ตารางกฎ) ─────────────────────────

export function describeCrmTrigger(t: CrmRuleTrigger): string {
  const def = crmTriggerDef(t.event);
  const p = t.params ?? {};
  if (!def) return t.event;
  if (t.event === "crm.deal.stale") return `ดีลนิ่งเกิน ${Number(p.days ?? 0)} วัน`;
  if (t.event === "crm.deal.close_due") return `ก่อนวันคาดว่าจะปิดดีล ${Number(p.daysBefore ?? 0)} วัน`;
  if (t.event === "crm.score.threshold") return `คะแนนถึงระดับ${CRM_SCORE_BAND_LABELS[String(p.band ?? "")] ?? String(p.band ?? "")}`;
  if (t.event === "custom.record.field_due") return `ก่อน ${String(p.objectKey ?? "")}.${String(p.fieldKey ?? "")} ถึงกำหนด ${Number(p.daysBefore ?? 0)} วัน`;
  return def.label;
}

export function describeCrmActions(actions: CrmRuleAction[]): string {
  return actions
    .slice(0, 3)
    .map((a) => CRM_ACTION_LABELS[a.type as CrmActionType] ?? a.type)
    .join(" + ");
}
