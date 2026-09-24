// automation.ts — กฎอัตโนมัติ CRM (ใบ C2.1 · พิมพ์เขียว §7.3 · มติ C13/C18 · ภาพ 07 บน)
//
// ── หน้าที่ ─────────────────────────────────────────────────────────────────────
//   AutomationRule scope "CRM" + crmSystemId (+ pipelineId) — ตารางเดียวกับบอร์ดงาน/journey สมาชิก (D15 · C13)
//   · จัดการกฎ (สร้าง/แก้/เปิด-ปิด/ลบ · กฎเริ่มต้น · ทดลองรัน · โควตา · บันทึกการทำงาน)
//   · เอนจิน: event `crm.*` / `custom.record.*` (ผ่าน `src/lib/automation/engine.ts`) + trigger ตามรอบเวลา (cron รายวัน)
//   · ลงมือผ่าน **ตัวรันกลาง** `@/lib/automation/action-runner` (มติ C18 — ส่งข้อความ/ยินยอม ณ เวลาส่ง/WAIT_THEN/lease ชุดเดียวกับ
//     journey สมาชิก) — ไฟล์นี้คือ adapter "contact" ของตัวรันนั้น (ไม่มี lease/ตัวจองของตัวเอง)
//
// ── กติกาที่ห้ามหัก ────────────────────────────────────────────────────────────
// 1) ขอบเขต (AUDIT-CLASS X1): กฎของระบบ A ไม่มีวันทำงานกับ event/ผู้ติดต่อของระบบ B หรือร้านอื่น — ทุก id ใน payload ถูกโหลด
//    ใหม่ใน (tenantId, systemId) · การกระทำอ้างขั้น/pipeline/ผู้ใช้/บอร์ดนอกร้าน-ระบบไม่ได้ (ตรวจตอนบันทึก **และ** ตอนทำงาน)
// 2) กันซ้ำ (AUDIT-CLASS X4): 1 แถวหลักต่อ (กฎ, ผู้ติดต่อ, eventKey) — partial UNIQUE ของ C2.0 · event ที่ไม่มีผู้ติดต่อ
//    (บริษัท ฯลฯ) = advisory lock (กฎ, eventKey) + หาก่อนเขียน (addendum 6)
// 3) กันวน (AUDIT-CLASS X3): กฎเดิม + ผู้ติดต่อเดิม ทำงานซ้ำภายใน 60 วิ ด้วย event คนละใบ = ผลจากการกระทำของกฎเอง/กฎพี่น้อง
//    ⇒ ข้ามพร้อมเหตุผลไทย (แบบเดียวกับ K2.9) · โควตารายเดือนต่อร้าน (addendum 5) นับเฉพาะกฎ CRM
// 4) ความยินยอม ณ เวลาส่ง (AUDIT-CLASS X8): `consents.canContact` ตอนส่งจริง — ถอนระหว่างรอ = ไม่ส่ง · ข้อมูลที่เก็บใน run มีแต่ id
// 5) WEBHOOK ผ่าน `webhookTargetProblem` ทั้งตอนบันทึกและตอนยิง (AUDIT-CLASS X6) · ตัวแปรในข้อความแทนค่าครั้งเดียว
// 6) uiVersion 1 (กติกาถาวร R-E.14): กฎไม่ทำงาน (แถวคงไว้ · ขั้นที่รอคงสถานะ WAITING) · การจัดการทุกคำสั่งถูกปฏิเสธ
// 7) ขั้นหนึ่งพังไม่พาขั้นถัดไปพัง · เอนจินไม่ throw ออกไปหาคิว outbox
// 8) ทุกการเปลี่ยนแปลงของกฎเขียน AuditLog `crm.automation.*` (targetId = id ของกฎ · AUDIT-CLASS X9)

import { Prisma, type AutomationRule, type CrmContact, type CrmDeal } from "@prisma/client";
import { writeAudit } from "@/lib/core/audit";
import { logOps } from "@/lib/core/ops";
import type { MemberActor } from "@/lib/modules/member";
import {
  cancelWaiting,
  closeWait,
  eventKeyOf,
  executeActions as runSteps,
  renderTemplate,
  runDueWaits as runDueWaitsShared,
  subjectAdapter,
  type RunnerChannel,
  type RunnerConsent,
  type RunnerEnv,
  type RunnerEventInput,
  type RunnerSendCore,
  type RunnerSendResult,
  type StepOutcome,
  type SubjectAdapter,
  type WaitRow,
} from "@/lib/automation/action-runner";
import { prisma } from "./db";
import { crmCan, CrmForbiddenError } from "./access";
import { assertCrmV2, crmUiVersion } from "./ui-version";
import { canContact, memberSystemOf } from "./consents";
import { companyWhere, contactWhere } from "./where";
import * as contacts from "./contacts";
import * as deals from "./deals";
import * as activities from "./activities";
import { OBJECT_TEMPLATES } from "./templates/objects";
import {
  CRM_ACTION_LABELS,
  CRM_ACTION_TYPE_SET,
  CRM_AUTOMATION_RUNS_PER_MONTH,
  CRM_CONDITION_OP_SET,
  CRM_CRON_TRIGGER_VALUES,
  CRM_LOOP_GUARD_MS,
  CRM_MAX_ACTIONS,
  CRM_MAX_CONDITIONS,
  CRM_MAX_WAIT_DAYS,
  CRM_SCORE_BANDS,
  CRM_STARTER_RULES,
  CRM_TRIGGER_VALUES,
  CRM_VALUELESS_OPS,
  countCrmActions,
  parseConditionField,
  type CrmActionType,
  type CrmRuleAction,
  type CrmRuleCondition,
  type CrmRuleConditions,
  type CrmRuleInput,
  type CrmRuleTrigger,
} from "./automation-shared";

// ───────────────────────── ชนิด / ค่าคงที่ ─────────────────────────

export type CrmAutomationCtx = { tenantId: string; systemId: string; actorUserId?: string | null };

export type CrmSendRequest = {
  tenantId: string;
  systemId: string;
  ruleId: string;
  runId: string;
  contactId: string | null;
  partyId: string | null;
  channel: RunnerChannel;
  to: string;
  consent: RunnerConsent;
  body: string;
  subject?: string;
  title?: string;
};
export type CrmSendFn = (req: CrmSendRequest) => Promise<RunnerSendResult>;
export type CrmKanbanRequest = { tenantId: string; systemId: string; ruleId: string; runId: string; contactId: string | null; boardId: string; title: string; description: string; sourceKey: string };
export type CrmKanbanFn = (req: CrmKanbanRequest) => Promise<{ ok: boolean; cardId?: string; error?: string }>;
/** ตัวส่งที่ฉีดแทนได้ (ข้อสอบ) — ไม่ฉีด = ตัวจริงปริยาย (อีเมล: ยังไม่เปิดจนถึง C2.5 · LINE: แชท · push: พนักงาน · การ์ด: บอร์ดงาน · webhook: fetch 5 วิ) */
export type CrmRuleDeps = {
  email?: CrmSendFn;
  line?: CrmSendFn;
  push?: CrmSendFn;
  sms?: CrmSendFn;
  kanban?: CrmKanbanFn;
  post?: (url: string, body: unknown) => Promise<void>;
};

export type CrmAutomationErrorCode = "NOT_FOUND" | "FORBIDDEN" | "VALIDATION";
export class CrmAutomationError extends Error {
  readonly code: CrmAutomationErrorCode;
  constructor(code: CrmAutomationErrorCode, message: string) {
    super(message);
    this.name = "CrmAutomationError";
    this.code = code;
  }
}
const fail = (code: CrmAutomationErrorCode, message: string) => new CrmAutomationError(code, message);

const SCOPE = "CRM" as const;
const DAY_MS = 86_400_000;
const BKK_MS = 7 * 3_600_000;
const MANAGE_KEY = "crm.automation.manage";
const SYSTEM_NOT_FOUND = "ไม่พบระบบ CRM นี้ในร้านที่เปิดอยู่ — รีเฟรชหน้าแล้วลองใหม่";
const RULE_NOT_FOUND = "ไม่พบกฎนี้ในระบบ CRM นี้ (อาจถูกลบไปแล้ว) — รีเฟรชหน้าแล้วลองใหม่";
const EMAIL_NOT_READY = "ส่งอีเมลจากกฎยังไม่เปิด — มาพร้อมระบบอีเมล";
const ACTIVITY_TYPES = new Set(["CALL", "MEETING", "EMAIL", "LINE", "TASK", "NOTE", "CHAT", "SMS", "WHATSAPP", "VISIT", "WEB", "PORTAL"]);
const CHANNEL_LABEL: Record<RunnerChannel, string> = { LINE: "LINE", EMAIL: "อีเมล", SMS: "SMS", PUSH: "แจ้งเตือนบนมือถือของผู้ดูแล" };

const asJson = (v: unknown): Prisma.InputJsonValue => (v ?? {}) as Prisma.InputJsonValue;
const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const numOr = (v: unknown, fallback: number): number => {
  if (v === undefined || v === null || (typeof v === "string" && v.trim() === "")) return fallback;
  const n = typeof v === "number" ? v : Number(String(v).trim());
  return Number.isFinite(n) ? n : fallback;
};
const errText = (e: unknown, fallback = "ทำไม่สำเร็จ"): string => (e instanceof Error && e.message ? e.message : fallback).slice(0, 200);
const isP2002 = (e: unknown): boolean => !!e && typeof e === "object" && (e as { code?: unknown }).code === "P2002";

/** "2026-09-19" ตามปฏิทินไทย */
const thaiYmd = (d: Date): string => new Date(d.getTime() + BKK_MS).toISOString().slice(0, 10);
/** 00:00 ไทยของวันที่ `ymd` */
const thaiDayStart = (ymd: string): Date => new Date(new Date(`${ymd}T00:00:00.000Z`).getTime() - BKK_MS);
/** ต้นเดือนไทย — โควตา "ต่อเดือน" ตรงกับเดือนที่เจ้าของร้านดู */
function thaiMonthStart(now: Date): Date {
  const t = new Date(now.getTime() + BKK_MS);
  return new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), 1) - BKK_MS);
}

type RuleRow = Pick<AutomationRule, "id" | "tenantId" | "name" | "enabled" | "event" | "trigger" | "conditions" | "actions" | "crmSystemId" | "pipelineId" | "createdAt" | "updatedAt">;
const RULE_SELECT = {
  id: true, tenantId: true, name: true, enabled: true, event: true, trigger: true, conditions: true, actions: true, crmSystemId: true, pipelineId: true, createdAt: true, updatedAt: true,
} as const;

// ───────────────────────── ทางเข้า (ระบบ → uiVersion → สิทธิ์) ─────────────────────────

// AUDIT-CLASS X1: ctx.systemId ต้องเป็นระบบ CRM ของร้านนี้จริง (ห้ามเชื่อ id จากผู้เรียก) — ไม่พบ = NOT_FOUND ภาษาไทย
async function resolveSystem(ctx: CrmAutomationCtx): Promise<void> {
  const ok =
    typeof ctx?.tenantId === "string" && typeof ctx?.systemId === "string" && ctx.tenantId && ctx.systemId
      ? await prisma.appSystem.findFirst({ where: { id: ctx.systemId, tenantId: ctx.tenantId, type: "CRM" }, select: { id: true } })
      : null;
  if (!ok) throw fail("NOT_FOUND", SYSTEM_NOT_FOUND);
}

/** ลำดับตายตัว: ระบบ (NOT_FOUND) → uiVersion 2 (CRM_V2_DISABLED) → คีย์ crm.automation.manage (FORBIDDEN) */
/** ด่านเดียวกับบริการ (ระบบ NOT_FOUND → uiVersion 2 → คีย์) — server action ของหน้าเรียกตัวนี้ก่อนทุกอย่าง (N6) */
export async function assertAutomationAccess(ctx: CrmAutomationCtx, actor: MemberActor | null | undefined): Promise<MemberActor> {
  return enter(ctx, actor);
}

async function enter(ctx: CrmAutomationCtx, actor: MemberActor | null | undefined): Promise<MemberActor> {
  if (!actor || actor.role === "CUSTOMER") throw fail("NOT_FOUND", SYSTEM_NOT_FOUND);
  await resolveSystem(ctx);
  await assertCrmV2(ctx);
  if (!crmCan(actor, MANAGE_KEY)) throw new CrmForbiddenError(MANAGE_KEY);
  return actor;
}

async function audit(ctx: CrmAutomationCtx, action: string, ruleId: string, body: { before?: unknown; after?: unknown } = {}): Promise<void> {
  // AUDIT-CLASS X9: ทุกการเปลี่ยนแปลงของกฎ = AuditLog `crm.automation.*` (targetId = id ของกฎ)
  await writeAudit({
    tenantId: ctx.tenantId,
    actorId: ctx.actorUserId ?? null,
    actorType: ctx.actorUserId ? "USER" : "SYSTEM",
    action: `crm.automation.${action}`,
    targetType: "AutomationRule",
    targetId: ruleId,
    ...body,
  });
}

async function loadRule(ctx: CrmAutomationCtx, id: unknown): Promise<RuleRow> {
  const rid = str(id);
  const row = rid
    ? ((await prisma.automationRule.findFirst({ where: { id: rid, tenantId: ctx.tenantId, scope: SCOPE, crmSystemId: ctx.systemId }, select: RULE_SELECT })) as RuleRow | null)
    : null;
  if (!row) throw fail("NOT_FOUND", RULE_NOT_FOUND);
  return row;
}

// ───────────────────────── ตรวจ input (ภาษาไทย · ไม่เขียนอะไรถ้าไม่ผ่าน) ─────────────────────────

type CleanRule = { name: string; trigger: CrmRuleTrigger; conditions: CrmRuleConditions; actions: CrmRuleAction[]; pipelineId: string | null; enabled: boolean };

function intIn(v: unknown, min: number, max: number, message: string): number {
  const n = numOr(v, Number.NaN);
  if (!Number.isInteger(n) || n < min || n > max) throw fail("VALIDATION", message);
  return n;
}

async function isTenantMember(tenantId: string, userId: string): Promise<boolean> {
  if (!userId) return false;
  return !!(await prisma.membership.findFirst({ where: { tenantId, userId }, select: { id: true } }));
}

async function cleanTrigger(ctx: CrmAutomationCtx, raw: unknown): Promise<CrmRuleTrigger> {
  const t = isObj(raw) ? raw : {};
  const event = str(t.event);
  if (!event || !CRM_TRIGGER_VALUES.has(event)) {
    throw fail("VALIDATION", `ไม่รู้จักเหตุการณ์เริ่มกฎ "${event.slice(0, 40)}" — เลือกจากรายการของ CRM (ผู้ติดต่อ · บริษัท · ดีล · กิจกรรม · ข้อมูลกำหนดเอง)`);
  }
  const p = isObj(t.params) ? t.params : {};
  if (event === "crm.deal.stale") return { event, params: { days: intIn(p.days ?? 14, 1, 365, "จำนวนวันที่ดีลนิ่งต้องเป็นจำนวนเต็ม 1–365 วัน") } };
  if (event === "crm.deal.close_due") return { event, params: { daysBefore: intIn(p.daysBefore ?? 3, 0, 365, "จำนวนวันก่อนปิดดีลต้องเป็นจำนวนเต็ม 0–365 วัน") } };
  if (event === "crm.score.threshold") {
    const band = str(p.band).toUpperCase();
    if (!(CRM_SCORE_BANDS as readonly string[]).includes(band)) throw fail("VALIDATION", "เลือกระดับคะแนน ร้อน · อุ่น · เย็น");
    return { event, params: { band } };
  }
  if (event === "custom.record.field_due") {
    const objectKey = str(p.objectKey);
    const fieldKey = str(p.fieldKey);
    const daysBefore = intIn(p.daysBefore ?? 7, 0, 365, "จำนวนวันก่อนถึงกำหนดต้องเป็นจำนวนเต็ม 0–365 วัน");
    const obj = objectKey ? await prisma.customObject.findFirst({ where: { tenantId: ctx.tenantId, systemId: ctx.systemId, key: objectKey }, select: { id: true } }) : null;
    if (!obj) throw fail("VALIDATION", "ไม่พบข้อมูลกำหนดเองที่เลือกในระบบ CRM นี้ — เลือกใหม่จากรายการ");
    const field = await prisma.memberField.findFirst({ where: { tenantId: ctx.tenantId, systemId: ctx.systemId, objectKey, key: fieldKey }, select: { type: true } });
    if (!field || (field.type !== "DATE" && field.type !== "DATETIME")) throw fail("VALIDATION", "ฟิลด์ที่เลือกต้องเป็นฟิลด์วันที่ของข้อมูลกำหนดเองนั้น — เลือกฟิลด์วันที่");
    return { event, params: { objectKey, fieldKey, daysBefore } };
  }
  return { event };
}

function cleanConditions(raw: unknown): CrmRuleConditions {
  if (raw === undefined || raw === null) return { mode: "AND", items: [] };
  const c = isObj(raw) ? raw : {};
  const mode = str(c.mode).toUpperCase() === "OR" ? "OR" : "AND";
  const list = Array.isArray(c.items) ? c.items : [];
  if (list.length > CRM_MAX_CONDITIONS) throw fail("VALIDATION", `เงื่อนไขได้ไม่เกิน ${CRM_MAX_CONDITIONS} ข้อต่อกฎ — รวมบางข้อหรือแยกเป็นกฎใหม่`);
  const items: CrmRuleCondition[] = list.map((it) => {
    const o = isObj(it) ? it : {};
    const f = parseConditionField(o.field);
    if (!f) throw fail("VALIDATION", `ไม่รู้จักช่องของเงื่อนไข "${str(o.field).slice(0, 40)}" — เลือกจากรายการ (ผู้ติดต่อ · บริษัท · ดีล · ฟิลด์กำหนดเอง)`);
    const op = str(o.op);
    if (!CRM_CONDITION_OP_SET.has(op)) throw fail("VALIDATION", `ไม่รู้จักตัวเปรียบเทียบ "${op.slice(0, 20)}" ของเงื่อนไข`);
    if (f.kind === "o" && !f.fieldKey && !["exists", "not_exists", "count_gte", "count_lte"].includes(op)) {
      throw fail("VALIDATION", "เงื่อนไขของข้อมูลกำหนดเองทั้งชุดใช้ได้แค่ มี · ไม่มี · จำนวนอย่างน้อย · จำนวนไม่เกิน");
    }
    if (CRM_VALUELESS_OPS.has(op)) return { field: String(o.field).trim(), op };
    const value = o.value;
    if (value === undefined || value === null || value === "") throw fail("VALIDATION", "ใส่ค่าของเงื่อนไขก่อน");
    if (op === "between" && !(Array.isArray(value) && value.length === 2)) throw fail("VALIDATION", "เงื่อนไข \"อยู่ระหว่าง\" ต้องมีค่าต่ำสุดและสูงสุด");
    if (op === "in" && !(Array.isArray(value) && value.length > 0 && value.length <= 50)) throw fail("VALIDATION", "เงื่อนไข \"เป็นหนึ่งใน\" ต้องมีรายการ 1–50 ค่า");
    return { field: String(o.field).trim(), op, value };
  });
  return { mode, items };
}

// AUDIT-CLASS X1: ทุกการอ้างอิงของการกระทำต้องอยู่ในร้าน/ระบบนี้ (ขั้น · pipeline · ผู้ใช้ · บอร์ด) · AUDIT-CLASS X6: URL ผ่าน webhookTargetProblem
async function cleanAction(ctx: CrmAutomationCtx, raw: unknown, depth: number): Promise<CrmRuleAction> {
  const a = isObj(raw) ? raw : {};
  const type = str(a.type);
  if (!CRM_ACTION_TYPE_SET.has(type)) throw fail("VALIDATION", `ไม่รู้จักการกระทำ "${type.slice(0, 30)}" — เลือกจากรายการของกฎ CRM`);
  const p = isObj(a.params) ? a.params : {};
  const label = CRM_ACTION_LABELS[type as CrmActionType];
  const need = (v: string, what: string) => {
    if (!v) throw fail("VALIDATION", `${label}: ใส่${what}ก่อน`);
    return v;
  };
  switch (type as CrmActionType) {
    case "MOVE_STAGE": {
      const stageId = need(str(p.stageId), "ขั้นปลายทาง");
      const st = await prisma.crmStage.findFirst({ where: { id: stageId, tenantId: ctx.tenantId, systemId: ctx.systemId }, select: { id: true } });
      if (!st) throw fail("VALIDATION", "ย้ายดีลไปขั้น: ไม่พบขั้นนี้ในระบบ CRM นี้ — เลือกขั้นใหม่จากรายการ");
      return { type, params: { stageId } };
    }
    case "ASSIGN": {
      const userId = need(str(p.userId), "ผู้ดูแล");
      if (!(await isTenantMember(ctx.tenantId, userId))) throw fail("VALIDATION", "มอบหมายผู้ดูแล: ผู้ใช้ที่เลือกไม่ได้อยู่ในร้านนี้ — เลือกจากรายชื่อพนักงาน");
      return { type, params: { userId } };
    }
    case "CREATE_ACTIVITY": {
      const actType = (str(p.type) || "TASK").toUpperCase();
      if (!ACTIVITY_TYPES.has(actType)) throw fail("VALIDATION", "สร้างงานติดตาม: เลือกชนิดงานจากรายการ");
      const title = need(str(p.title), "หัวเรื่องของงาน").slice(0, 200);
      const dueIn = p.dueIn === undefined || p.dueIn === null || p.dueIn === "" ? null : intIn(p.dueIn, 0, 365, "สร้างงานติดตาม: กำหนดส่งต้องเป็น 0–365 วัน");
      const assignTo = str(p.assignTo) || "owner";
      if (assignTo !== "owner" && !(await isTenantMember(ctx.tenantId, assignTo))) throw fail("VALIDATION", "สร้างงานติดตาม: ผู้รับงานไม่ได้อยู่ในร้านนี้ — เลือกผู้ดูแลหรือพนักงานในร้าน");
      return { type, params: { type: actType, title, ...(dueIn !== null ? { dueIn } : {}), assignTo } };
    }
    case "CREATE_DEAL": {
      const pipelineId = need(str(p.pipelineId), "pipeline");
      const pipe = await prisma.crmPipeline.findFirst({ where: { id: pipelineId, tenantId: ctx.tenantId, systemId: ctx.systemId, archivedAt: null }, select: { id: true } });
      if (!pipe) throw fail("VALIDATION", "เปิดดีลใหม่: ไม่พบ pipeline นี้ในระบบ CRM นี้ — เลือกใหม่จากรายการ");
      const titleTpl = need(str(p.titleTpl), "ชื่อดีล").slice(0, 200);
      const valueSatang = p.valueSatang === undefined || p.valueSatang === null || p.valueSatang === "" ? null : intIn(p.valueSatang, 0, 100_000_000_000, "เปิดดีลใหม่: มูลค่าต้องเป็นจำนวนเต็ม (สตางค์)");
      return { type, params: { pipelineId, titleTpl, ...(valueSatang !== null ? { valueSatang } : {}) } };
    }
    case "OPEN_KANBAN_CARD": {
      const boardId = need(str(p.boardId), "บอร์ดปลายทาง");
      const board = await prisma.kanbanBoard.findFirst({ where: { id: boardId, tenantId: ctx.tenantId }, select: { id: true } });
      if (!board) throw fail("VALIDATION", "เปิดการ์ดในบอร์ดงาน: ไม่พบบอร์ดนี้ในร้าน — เลือกบอร์ดใหม่จากรายการ");
      return { type, params: { boardId, title: need(str(p.title), "ชื่อการ์ด").slice(0, 200) } };
    }
    case "SEND_EMAIL":
      return { type, params: { subject: need(str(p.subject), "หัวเรื่องอีเมล").slice(0, 200), template: need(str(p.template), "ข้อความ").slice(0, 4000), to: "contact" } };
    case "SEND_LINE":
      return { type, params: { template: need(str(p.template), "ข้อความ").slice(0, 2000) } };
    case "SEND_PUSH":
      return { type, params: { to: "owner", title: str(p.title).slice(0, 120), template: need(str(p.template), "ข้อความ").slice(0, 500) } };
    case "ENROLL_SEQUENCE":
      return { type, params: { ...(str(p.sequenceId) ? { sequenceId: str(p.sequenceId) } : {}), ...(str(p.sequenceKey) ? { sequenceKey: str(p.sequenceKey) } : {}) } };
    case "STOP_SEQUENCE":
      return { type, params: {} };
    case "SET_FIELD": {
      const objectKey = str(p.objectKey) || "contact";
      if (objectKey !== "contact" && objectKey !== "deal") throw fail("VALIDATION", "ตั้งค่าฟิลด์: ตั้งได้เฉพาะฟิลด์ของผู้ติดต่อหรือดีล");
      const key = need(str(p.key), "ชื่อฟิลด์");
      if (!/^[a-zA-Z][a-zA-Z0-9_]{0,63}$/.test(key)) throw fail("VALIDATION", "ตั้งค่าฟิลด์: เลือกฟิลด์จากรายการ");
      const value = p.value;
      if (value !== null && !["string", "number", "boolean"].includes(typeof value)) throw fail("VALIDATION", "ตั้งค่าฟิลด์: ค่าต้องเป็นข้อความ ตัวเลข หรือ ใช่/ไม่ใช่");
      return { type, params: { objectKey, key, value: value ?? null } };
    }
    case "ADD_TAG":
    case "REMOVE_TAG": {
      const tag = need(str(p.tag), "แท็ก");
      if (tag.length > 40) throw fail("VALIDATION", `${label}: แท็กยาวได้ไม่เกิน 40 ตัวอักษร`);
      return { type, params: { tag } };
    }
    case "ADJUST_SCORE":
      return { type, params: { points: intIn(p.points ?? 0, -1000, 1000, "ปรับคะแนน: ใส่ −1,000 ถึง 1,000 แต้ม"), reason: str(p.reason).slice(0, 120) } };
    case "NOTIFY_STAFF": {
      const text = need(str(p.text), "ข้อความแจ้งเตือน").slice(0, 300);
      const ids = Array.isArray(p.userIds) ? [...new Set((p.userIds as unknown[]).filter((u): u is string => typeof u === "string" && !!u.trim()).map((u) => u.trim()))] : [];
      for (const u of ids) if (!(await isTenantMember(ctx.tenantId, u))) throw fail("VALIDATION", "แจ้งพนักงานในแอป: มีผู้ใช้ที่ไม่ได้อยู่ในร้านนี้ — เลือกจากรายชื่อพนักงาน");
      const to = ids.length ? "users" : str(p.to) === "managers" ? "managers" : "owner";
      return { type, params: { to, text, ...(ids.length ? { userIds: ids } : {}) } };
    }
    case "WEBHOOK": {
      const url = need(str(p.url), "URL ปลายทาง");
      const { webhookTargetProblem } = await import("@/lib/webhooks/service");
      const problem = await webhookTargetProblem(url);
      if (problem) throw fail("VALIDATION", `ส่ง webhook: ${problem}`);
      return { type, params: { url } };
    }
    case "WAIT_THEN": {
      if (depth > 0) throw fail("VALIDATION", "\"รอ n วันแล้วทำต่อ\" ซ้อนกันได้ชั้นเดียว — ย้ายขั้นที่ซ้อนออกมาไว้ในชั้นแรก");
      const days = intIn(p.days, 1, CRM_MAX_WAIT_DAYS, `รอได้ 1–${CRM_MAX_WAIT_DAYS} วัน — ใส่จำนวนวันใหม่`);
      const inner = Array.isArray(p.thenActions) ? p.thenActions : [];
      const thenActions: CrmRuleAction[] = [];
      for (const x of inner) thenActions.push(await cleanAction(ctx, x, depth + 1));
      return { type, params: { days, thenActions } };
    }
    case "ISSUE_VOUCHER":
      return { type, params: { templateId: need(str(p.templateId), "แม่แบบ voucher") } };
    case "GIVE_POINTS":
      return { type, params: { points: intIn(p.points, 1, 100_000, "ให้แต้ม: ใส่ 1–100,000 แต้ม") } };
  }
  throw fail("VALIDATION", `ไม่รู้จักการกระทำ "${type.slice(0, 30)}"`);
}

async function cleanInput(ctx: CrmAutomationCtx, raw: unknown): Promise<CleanRule> {
  const input = (isObj(raw) ? raw : {}) as Partial<CrmRuleInput> & Record<string, unknown>;
  const name = str(input.name);
  if (!name) throw fail("VALIDATION", "ตั้งชื่อกฎก่อน — เช่น \"ดีลนิ่ง 14 วัน — แจ้งหัวหน้าทีม\"");
  if (name.length > 120) throw fail("VALIDATION", "ชื่อกฎยาวได้ไม่เกิน 120 ตัวอักษร");
  const trigger = await cleanTrigger(ctx, input.trigger);
  const conditions = cleanConditions(input.conditions);
  const list = Array.isArray(input.actions) ? input.actions : [];
  if (list.length === 0) throw fail("VALIDATION", "กฎต้องมีการกระทำอย่างน้อย 1 อย่าง");
  // นับรวมขั้นที่ซ้อนใน "รอ n วัน" (ของที่ส่งมา — ก่อนตรวจรายตัว เพื่อไม่ยิง query ของ 500 ขั้น)
  if (countCrmActions(list.filter(isObj).map((x) => ({ type: str(x.type), params: isObj(x.params) ? x.params : {} }))) > CRM_MAX_ACTIONS) {
    throw fail("VALIDATION", `การกระทำได้ไม่เกิน ${CRM_MAX_ACTIONS} ขั้นต่อกฎ (รวมขั้นที่ซ้อนใน "รอ n วัน") — แยกเป็นกฎใหม่`);
  }
  const actions: CrmRuleAction[] = [];
  for (const a of list) actions.push(await cleanAction(ctx, a, 0));
  let pipelineId: string | null = null;
  if (str(input.pipelineId)) {
    const pipe = await prisma.crmPipeline.findFirst({ where: { id: str(input.pipelineId), tenantId: ctx.tenantId, systemId: ctx.systemId }, select: { id: true } });
    if (!pipe) throw fail("VALIDATION", "ไม่พบ pipeline ที่เลือกในระบบ CRM นี้ — เลือกใหม่จากรายการ หรือเลือก \"ทุก pipeline\"");
    pipelineId = pipe.id;
  }
  return { name, trigger, conditions, actions, pipelineId, enabled: input.enabled !== false };
}

// ───────────────────────── จัดการกฎ ─────────────────────────

export type CrmRuleDto = {
  id: string;
  name: string;
  enabled: boolean;
  trigger: CrmRuleTrigger;
  conditions: CrmRuleConditions;
  actions: CrmRuleAction[];
  pipelineId: string | null;
  starterKey: string | null;
  runsTotal: number;
  runsThisMonth: number;
  lastRunAt: string | null;
  createdAt: string;
};

function triggerOf(row: Pick<RuleRow, "event" | "trigger">): CrmRuleTrigger {
  const t = isObj(row.trigger) ? row.trigger : {};
  return { event: row.event, ...(isObj(t.params) ? { params: t.params } : {}) };
}
function conditionsOf(row: Pick<RuleRow, "conditions">): CrmRuleConditions {
  const c = isObj(row.conditions) ? row.conditions : {};
  return { mode: str(c.mode).toUpperCase() === "OR" ? "OR" : "AND", items: Array.isArray(c.items) ? (c.items as CrmRuleCondition[]) : [] };
}
function actionsOf(row: Pick<RuleRow, "actions">): CrmRuleAction[] {
  return Array.isArray(row.actions) ? (row.actions as unknown[]).filter((a): a is CrmRuleAction => isObj(a) && typeof a.type === "string") : [];
}
const starterKeyOf = (row: Pick<RuleRow, "trigger">): string | null => (isObj(row.trigger) && typeof row.trigger.starter === "string" ? row.trigger.starter : null);

function ruleData(ctx: CrmAutomationCtx, v: CleanRule, starter: string | null = null) {
  return {
    name: v.name,
    event: v.trigger.event,
    enabled: v.enabled,
    trigger: asJson({ event: v.trigger.event, ...(v.trigger.params ? { params: v.trigger.params } : {}), ...(starter ? { starter } : {}) }),
    conditions: asJson(v.conditions),
    actions: asJson(v.actions),
    pipelineId: v.pipelineId,
    crmSystemId: ctx.systemId,
  };
}

export async function createRule(ctx: CrmAutomationCtx, actor: MemberActor, input: CrmRuleInput): Promise<{ id: string }> {
  await enter(ctx, actor);
  const v = await cleanInput(ctx, input);
  const row = await prisma.automationRule.create({
    // actionType/actionConfig = placeholder (เอนจิน v1 กรอง scope KANBAN จึงไม่เคยเห็นแถวนี้)
    data: { tenantId: ctx.tenantId, scope: SCOPE, kind: "RULE", actionType: "NOTIFY", actionConfig: {}, ...ruleData(ctx, v) },
    select: { id: true },
  });
  await audit(ctx, "create", row.id, { after: { name: v.name, event: v.trigger.event, enabled: v.enabled, actions: v.actions.map((a) => a.type) } });
  return { id: row.id };
}

export async function updateRule(ctx: CrmAutomationCtx, actor: MemberActor, id: string, input: CrmRuleInput): Promise<{ id: string }> {
  await enter(ctx, actor);
  const row = await loadRule(ctx, id);
  const v = await cleanInput(ctx, input);
  await prisma.automationRule.update({ where: { id: row.id }, data: ruleData(ctx, v, starterKeyOf(row)) });
  if (!v.enabled && row.enabled) await cancelWaiting(row.id, "ยกเลิก — กฎถูกปิดก่อนถึงเวลา");
  await audit(ctx, "update", row.id, { before: { name: row.name, event: row.event, enabled: row.enabled }, after: { name: v.name, event: v.trigger.event, enabled: v.enabled, actions: v.actions.map((a) => a.type) } });
  return { id: row.id };
}

/** เปิด/ปิด — ปิดแล้ว "ขั้นที่รออยู่" ของกฎนี้ถูกยกเลิกทันที */
export async function toggleRule(ctx: CrmAutomationCtx, actor: MemberActor, id: string, enabled: boolean): Promise<{ enabled: boolean; cancelled: number }> {
  await enter(ctx, actor);
  const row = await loadRule(ctx, id);
  await prisma.automationRule.update({ where: { id: row.id }, data: { enabled: !!enabled } });
  const cancelled = enabled ? 0 : await cancelWaiting(row.id, "ยกเลิก — กฎถูกปิดก่อนถึงเวลา");
  await audit(ctx, enabled ? "enable" : "disable", row.id, { before: { enabled: row.enabled }, after: { enabled: !!enabled, cancelledWaits: cancelled } });
  return { enabled: !!enabled, cancelled };
}

/** ลบกฎ = การกระทำอันตราย (AUDIT-CLASS X9): ต้องยืนยัน + เหตุผลอย่างน้อย 5 ตัวอักษร · run ของกฎหายตามกฎ (FK journeyId) */
export async function deleteRule(ctx: CrmAutomationCtx, actor: MemberActor, id: string, opts: { confirm?: boolean | null; reason?: string | null } = {}): Promise<{ ok: true }> {
  await enter(ctx, actor);
  const row = await loadRule(ctx, id);
  if (opts?.confirm !== true) throw fail("VALIDATION", "ลบกฎแล้วกู้คืนไม่ได้ — กดยืนยันการลบก่อน");
  const reason = str(opts?.reason);
  if (reason.length < 5) throw fail("VALIDATION", "ใส่เหตุผลที่ลบกฎอย่างน้อย 5 ตัวอักษร (เก็บไว้ในประวัติการแก้ไข)");
  await prisma.automationRule.delete({ where: { id: row.id } });
  await audit(ctx, "delete", row.id, { before: { name: row.name, event: row.event, enabled: row.enabled }, after: { reason: reason.slice(0, 300) } });
  return { ok: true };
}

export async function listRules(ctx: CrmAutomationCtx, actor: MemberActor, now: Date = new Date()): Promise<CrmRuleDto[]> {
  await enter(ctx, actor);
  const rows = (await prisma.automationRule.findMany({
    where: { tenantId: ctx.tenantId, scope: SCOPE, crmSystemId: ctx.systemId },
    orderBy: { createdAt: "asc" },
    select: RULE_SELECT,
  })) as RuleRow[];
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const main = { ruleId: { in: ids }, stepIndex: null, status: { in: ["OK" as const, "FAILED" as const] } };
  const [total, month, last] = await Promise.all([
    prisma.automationRun.groupBy({ by: ["ruleId"], where: main, _count: { _all: true } }),
    prisma.automationRun.groupBy({ by: ["ruleId"], where: { ...main, createdAt: { gte: thaiMonthStart(now) } }, _count: { _all: true } }),
    prisma.automationRun.groupBy({ by: ["ruleId"], where: { ruleId: { in: ids } }, _max: { createdAt: true } }),
  ]);
  const tot = new Map(total.map((g) => [g.ruleId, g._count._all]));
  const mon = new Map(month.map((g) => [g.ruleId, g._count._all]));
  const lst = new Map(last.map((g) => [g.ruleId, g._max.createdAt]));
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    enabled: r.enabled,
    trigger: triggerOf(r),
    conditions: conditionsOf(r),
    actions: actionsOf(r),
    pipelineId: r.pipelineId,
    starterKey: starterKeyOf(r),
    runsTotal: tot.get(r.id) ?? 0,
    runsThisMonth: mon.get(r.id) ?? 0,
    lastRunAt: lst.get(r.id)?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
  }));
}

export type CrmRunDto = { id: string; ruleId: string; ruleName: string; status: string; detail: string; contactId: string | null; at: string; waiting: boolean; scheduledAt: string | null };

/** บันทึกการทำงาน (ใหม่สุดก่อน · 50 แถว) — detail มีแต่เหตุผล/ผลของขั้น ไม่มีเบอร์/อีเมล */
export async function listRuns(ctx: CrmAutomationCtx, actor: MemberActor, opts: { ruleId?: string | null } = {}): Promise<CrmRunDto[]> {
  await enter(ctx, actor);
  const rules = await prisma.automationRule.findMany({ where: { tenantId: ctx.tenantId, scope: SCOPE, crmSystemId: ctx.systemId }, select: { id: true, name: true } });
  const names = new Map(rules.map((r) => [r.id, r.name]));
  const only = str(opts?.ruleId);
  if (only && !names.has(only)) throw fail("NOT_FOUND", RULE_NOT_FOUND);
  const ids = only ? [only] : [...names.keys()];
  if (ids.length === 0) return [];
  const rows = await prisma.automationRun.findMany({
    where: { tenantId: ctx.tenantId, ruleId: { in: ids } },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: { id: true, ruleId: true, status: true, detail: true, crmContactId: true, createdAt: true, scheduledAt: true },
  });
  // N7: แถวของผู้ติดต่อที่ผู้ดูมองไม่เห็น = ไม่แสดง (ผู้จัดการที่เห็นเฉพาะทีม)
  const cids = [...new Set(rows.map((r) => r.crmContactId).filter((x): x is string => !!x))];
  const seen = new Set(cids.length ? (await prisma.crmContact.findMany({ where: { AND: [await contactWhere(ctx, actor), { id: { in: cids } }] }, select: { id: true } })).map((r) => r.id) : []);
  return rows.filter((r) => !r.crmContactId || seen.has(r.crmContactId)).map((r) => ({
    id: r.id,
    ruleId: r.ruleId,
    ruleName: names.get(r.ruleId) ?? "",
    status: r.status,
    detail: r.detail ?? "",
    contactId: r.crmContactId,
    at: r.createdAt.toISOString(),
    waiting: r.status === "WAITING",
    scheduledAt: r.scheduledAt?.toISOString() ?? null,
  }));
}

// ───────────────────────── โควตา (addendum 5: ต่อร้าน · นับทุกระบบ CRM ของร้าน · ไม่นับสมาชิก/บอร์ดงาน) ─────────────────────────

async function crmRunLimit(tenantId: string): Promise<number> {
  const t = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { limits: true } });
  const limits = isObj(t?.limits) ? t.limits : {};
  const crm = isObj(limits.crm) ? limits.crm : {};
  const v = Number(crm.automationRunsPerMonth);
  return Number.isFinite(v) && v >= 0 ? v : CRM_AUTOMATION_RUNS_PER_MONTH;
}

async function crmRunsUsed(tenantId: string, now: Date): Promise<number> {
  return prisma.automationRun.count({
    where: { tenantId, stepIndex: null, status: { in: ["OK", "FAILED"] }, createdAt: { gte: thaiMonthStart(now) }, rule: { scope: SCOPE } },
  });
}

/** โควตาเดือนนี้ของร้าน (กฎ CRM ทุกระบบของร้านรวมกัน) */
export async function usageThisMonth(ctx: CrmAutomationCtx, now: Date = new Date()): Promise<{ used: number; limit: number }> {
  await resolveSystem(ctx);
  const [used, limit] = await Promise.all([crmRunsUsed(ctx.tenantId, now), crmRunLimit(ctx.tenantId)]);
  return { used, limit };
}

// ───────────────────────── กฎเริ่มต้น ─────────────────────────

/**
 * กฎเริ่มต้น 6 ใบ (พิมพ์เขียว §7.3) + กฎ "ฟิลด์วันที่ใกล้ถึงกำหนด" 1 ใบต่อข้อมูลกำหนดเองที่สร้างจากเทมเพลต — **ปิดไว้ทุกใบ**
 * AUDIT-CLASS X3: ยิงซ้ำ/พร้อมกันกี่ครั้งก็ได้ชุดเดียว — advisory lock ต่อระบบ + หา "กุญแจกฎเริ่มต้น" (trigger.starter) ก่อนสร้าง
 */
export async function applyStarterRules(ctx: CrmAutomationCtx, actor: MemberActor): Promise<{ created: number; total: number }> {
  await enter(ctx, actor);
  const objs = await prisma.customObject.findMany({
    where: { tenantId: ctx.tenantId, systemId: ctx.systemId, archivedAt: null, templateKey: { not: null } },
    orderBy: { createdAt: "asc" },
    select: { key: true, templateKey: true },
  });
  type Spec = { key: string; name: string; trigger: CrmRuleTrigger; conditions: CrmRuleConditions; actions: CrmRuleAction[] };
  const specs: Spec[] = CRM_STARTER_RULES.map((s) => ({ key: s.key, name: s.name, trigger: s.trigger, conditions: s.conditions ?? { mode: "AND", items: [] }, actions: s.actions }));
  for (const o of objs) {
    const tpl = OBJECT_TEMPLATES.find((t) => t.key === o.templateKey);
    if (!tpl?.starterRule) continue;
    const sr = tpl.starterRule;
    specs.push({
      key: `object:${o.key}:${sr.fieldKey}`,
      name: sr.name,
      trigger: { event: "custom.record.field_due", params: { objectKey: o.key, fieldKey: sr.fieldKey, daysBefore: sr.daysBefore } },
      conditions: { mode: "AND", items: [] },
      actions: [{ type: "NOTIFY_STAFF", params: { to: "owner", text: `${sr.name}: {ชื่อ}` } }],
    });
  }
  const created = await prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`crm:automation-starters:${ctx.systemId}`}, 0))`;
      const existing = await tx.automationRule.findMany({ where: { tenantId: ctx.tenantId, scope: SCOPE, crmSystemId: ctx.systemId }, select: { trigger: true } });
      const have = new Set(existing.map((r) => starterKeyOf(r)).filter((k): k is string => !!k));
      const ids: string[] = [];
      for (const s of specs) {
        if (have.has(s.key)) continue;
        const row = await tx.automationRule.create({
          data: {
            tenantId: ctx.tenantId, scope: SCOPE, kind: "RULE", actionType: "NOTIFY", actionConfig: {},
            ...ruleData(ctx, { name: s.name, trigger: s.trigger, conditions: s.conditions, actions: s.actions, pipelineId: null, enabled: false }, s.key),
          },
          select: { id: true },
        });
        ids.push(row.id);
      }
      return ids;
    },
    { maxWait: 20_000, timeout: 30_000 },
  );
  for (const id of created) await audit(ctx, "starter.create", id, { after: { enabled: false } });
  return { created: created.length, total: specs.length };
}

// ───────────────────────── ตัวตนของ event (โหลดด้วย id เสมอ) ─────────────────────────

type ActivityRef = { id: string; systemId: string; contactId: string | null; dealId: string | null; companyId: string | null };
type RecordRef = { id: string; systemId: string; objectId: string; parentType: string; parentId: string | null };

export type CrmSubject = {
  tenantId: string;
  systemId: string;
  contact: CrmContact | null;
  deal: CrmDeal | null;
  activity: ActivityRef | null;
  record: RecordRef | null;
  companyId: string | null;
};

type SubjectRefs = { contactId?: string | null; dealId?: string | null; activityId?: string | null; recordId?: string | null; companyId?: string | null };

/**
 * AUDIT-CLASS X1: ผู้ติดต่อ/ดีล/กิจกรรม/รายการของ event ถูกโหลดใหม่ด้วย id **ในร้านของ event** และทุกตัวต้องอยู่ระบบ CRM เดียวกัน
 * (= evt.systemId ถ้ามี) — id ปลอม/ข้ามร้าน/ข้ามระบบ ⇒ null (ไม่มีกฎไหนทำงาน · ไม่เขียนอะไร)
 */
async function resolveCrmSubject(tenantId: string, type: string, payload: unknown, systemHint: string | null | undefined): Promise<CrmSubject | null> {
  const p = isObj(payload) ? payload : {};
  const sid = (k: string): string | null => (typeof p[k] === "string" && (p[k] as string).trim() ? (p[k] as string).trim() : null);
  let systemId: string | null = str(systemHint) || null;
  const pin = (sys: string): boolean => {
    if (!systemId) systemId = sys;
    return systemId === sys;
  };
  let deal: CrmDeal | null = null;
  let activity: ActivityRef | null = null;
  let record: RecordRef | null = null;
  let contact: CrmContact | null = null;
  let companyId: string | null = null;

  const loadDeal = async (id: string): Promise<boolean> => {
    deal = await prisma.crmDeal.findFirst({ where: { id, tenantId } });
    return !!deal && pin(deal.systemId);
  };
  if (sid("dealId") && !(await loadDeal(sid("dealId")!))) return null;
  if (sid("activityId")) {
    activity = await prisma.crmActivity.findFirst({ where: { id: sid("activityId")!, tenantId }, select: { id: true, systemId: true, contactId: true, dealId: true, companyId: true } });
    if (!activity || !pin(activity.systemId)) return null;
    if (!deal && activity.dealId && !(await loadDeal(activity.dealId))) return null;
  }
  if (sid("recordId")) {
    record = await prisma.customRecord.findFirst({ where: { id: sid("recordId")!, tenantId }, select: { id: true, systemId: true, objectId: true, parentType: true, parentId: true } });
    if (!record || !pin(record.systemId)) return null;
    if (record.parentType === "DEAL" && record.parentId && !deal && !(await loadDeal(record.parentId))) return null;
    if (record.parentType === "COMPANY") companyId = record.parentId;
  }
  const contactRef = sid("contactId") ?? (type.startsWith("crm.contact.") ? (sid("keepId") ?? sid("keptId")) : null);
  const d = deal as CrmDeal | null;
  const contactId = contactRef ?? d?.contactId ?? activity?.contactId ?? (record?.parentType === "CONTACT" ? record.parentId : null);
  if (contactId) {
    contact = await prisma.crmContact.findFirst({ where: { id: contactId, tenantId } });
    if (!contact || !pin(contact.systemId) || contact.archivedAt || contact.mergedIntoId) return null;
  } else if (!d && !activity && !record) {
    const companyRef = sid("companyId") ?? (type.startsWith("crm.company.") ? sid("keepId") : null);
    if (!companyRef) return null;
    const co = await prisma.crmCompany.findFirst({ where: { id: companyRef, tenantId }, select: { id: true, systemId: true } });
    if (!co || !pin(co.systemId)) return null;
    companyId = co.id;
  }
  if (!systemId) return null;
  const sys = await prisma.appSystem.findFirst({ where: { id: systemId, tenantId, type: "CRM" }, select: { id: true } });
  if (!sys) return null;
  const c = contact as CrmContact | null;
  return { tenantId, systemId, contact: c, deal: d, activity, record, companyId: companyId ?? d?.companyId ?? c?.companyId ?? activity?.companyId ?? null };
}

async function subjectFromRefs(tenantId: string, systemId: string, refs: SubjectRefs): Promise<CrmSubject | null> {
  return resolveCrmSubject(tenantId, "crm.wait", { ...refs }, systemId);
}

const refsOf = (s: CrmSubject): SubjectRefs => ({
  contactId: s.contact?.id ?? null,
  dealId: s.deal?.id ?? null,
  activityId: s.activity?.id ?? null,
  recordId: s.record?.id ?? null,
  companyId: s.companyId,
});

// ───────────────────────── เงื่อนไข (ประเมินบนข้อมูลที่โหลดด้วย id ณ เวลาทำงาน) ─────────────────────────

type Scalar = string | number | boolean | Date | null | undefined;
type CondValue = Scalar | Scalar[];

function valueOfCell(v: { valueText: string | null; valueNumber: Prisma.Decimal | null; valueDate: Date | null; valueBool: boolean | null; valueOptions: string[]; valueRef: string | null }): CondValue {
  if (v.valueNumber !== null && v.valueNumber !== undefined) return Number(v.valueNumber);
  if (v.valueDate) return v.valueDate;
  if (v.valueBool !== null && v.valueBool !== undefined) return v.valueBool;
  if (v.valueOptions && v.valueOptions.length) return v.valueOptions;
  return v.valueText ?? v.valueRef ?? null;
}

const toCmp = (x: unknown): number | string | boolean | null => {
  if (x === null || x === undefined) return null;
  if (x instanceof Date) return x.getTime();
  if (typeof x === "number" || typeof x === "boolean") return x;
  const s = String(x).trim();
  if (/^-?\d+(\.\d+)?$/.test(s)) return Number(s);
  if (/^\d{4}-\d{2}-\d{2}/.test(s) && !Number.isNaN(Date.parse(s))) return Date.parse(s);
  return s.toLowerCase();
};
const present = (v: CondValue): boolean => (Array.isArray(v) ? v.length > 0 : v !== null && v !== undefined && v !== "");

function compare(value: CondValue, op: string, want: unknown): boolean {
  if (op === "exists") return present(value);
  if (op === "not_exists") return !present(value);
  if (op === "count_gte") return (Array.isArray(value) ? value.length : present(value) ? 1 : 0) >= numOr(want, 0);
  if (op === "count_lte") return (Array.isArray(value) ? value.length : present(value) ? 1 : 0) <= numOr(want, 0);
  if (Array.isArray(value)) {
    // ช่องหลายค่า (แท็ก/ตัวเลือกหลายข้อ): "มี"/"เท่ากับ" = มีค่านั้นอยู่ในรายการ
    const vals = value.map(toCmp);
    if (op === "contains" || op === "eq") return vals.includes(toCmp(want));
    if (op === "neq") return !vals.includes(toCmp(want));
    if (op === "in") return Array.isArray(want) && want.some((w) => vals.includes(toCmp(w)));
    return false;
  }
  const a = toCmp(value);
  if (op === "contains") return typeof a === "string" && a.includes(String(want ?? "").trim().toLowerCase());
  if (op === "in") return Array.isArray(want) && want.some((w) => toCmp(w) === a);
  if (op === "between") {
    if (!Array.isArray(want) || want.length !== 2 || a === null) return false;
    const lo = toCmp(want[0]);
    const hi = toCmp(want[1]);
    return lo !== null && hi !== null && a >= lo && a <= hi;
  }
  const b = toCmp(want);
  if (op === "eq") return a === b;
  if (op === "neq") return a !== b;
  if (a === null || b === null) return false;
  if (op === "gt") return a > b;
  if (op === "gte") return a >= b;
  if (op === "lt") return a < b;
  if (op === "lte") return a <= b;
  return false;
}

async function customFieldValue(s: CrmSubject, objectKey: "contact" | "deal", key: string): Promise<CondValue> {
  const recordId = objectKey === "contact" ? s.contact?.id : s.deal?.id;
  if (!recordId) return null;
  const field = await prisma.memberField.findFirst({ where: { tenantId: s.tenantId, systemId: s.systemId, objectKey, key }, select: { id: true } });
  if (!field) return null;
  const v = await prisma.customRecordValue.findFirst({ where: { tenantId: s.tenantId, recordId, fieldId: field.id } });
  return v ? valueOfCell(v) : null;
}

async function evalItem(s: CrmSubject, item: CrmRuleCondition, cache: Map<string, unknown>): Promise<boolean> {
  const f = parseConditionField(item.field);
  if (!f) return false;
  if (f.kind === "c") return compare(s.contact ? ((s.contact as unknown as Record<string, CondValue>)[f.column] ?? null) : null, item.op, item.value);
  if (f.kind === "d") return compare(s.deal ? ((s.deal as unknown as Record<string, CondValue>)[f.column] ?? null) : null, item.op, item.value);
  if (f.kind === "co") {
    if (!cache.has("co")) cache.set("co", s.companyId ? await prisma.crmCompany.findFirst({ where: { id: s.companyId, tenantId: s.tenantId, systemId: s.systemId } }) : null);
    const co = cache.get("co") as Record<string, CondValue> | null;
    return compare(co ? (co[f.column] ?? null) : null, item.op, item.value);
  }
  if (f.kind === "f") return compare(await customFieldValue(s, f.objectKey, f.key), item.op, item.value);
  if (f.kind !== "o") return false;
  // o.{objectKey}[.{fieldKey}] — รายการของข้อมูลกำหนดเองที่ผูกกับผู้ติดต่อนี้ (ไม่นับที่เก็บถาวร)
  if (!s.contact) return compare(f.fieldKey ? null : [], item.op, item.value);
  const obj = await prisma.customObject.findFirst({ where: { tenantId: s.tenantId, systemId: s.systemId, key: f.objectKey }, select: { id: true } });
  const recs = obj
    ? await prisma.customRecord.findMany({ where: { tenantId: s.tenantId, objectId: obj.id, parentType: "CONTACT", parentId: s.contact.id, archivedAt: null }, select: { id: true }, take: 500 })
    : [];
  if (!f.fieldKey) return compare(recs.map((r) => r.id), item.op, item.value);
  if (recs.length === 0) return item.op === "not_exists";
  const field = await prisma.memberField.findFirst({ where: { tenantId: s.tenantId, systemId: s.systemId, objectKey: f.objectKey, key: f.fieldKey }, select: { id: true } });
  if (!field) return item.op === "not_exists";
  const vals = await prisma.customRecordValue.findMany({ where: { tenantId: s.tenantId, fieldId: field.id, recordId: { in: recs.map((r) => r.id) } } });
  const byRec = new Map(vals.map((v) => [v.recordId, valueOfCell(v)]));
  // "มีรายการใดรายการหนึ่งของผู้ติดต่อนี้ที่ตรง" (ไม่มีค่า = ถือเป็นว่าง)
  return recs.some((r) => compare(byRec.get(r.id) ?? null, item.op, item.value));
}

async function conditionsPass(s: CrmSubject, cond: CrmRuleConditions): Promise<boolean> {
  if (cond.items.length === 0) return true;
  const cache = new Map<string, unknown>();
  if (cond.mode === "OR") {
    for (const it of cond.items) if (await evalItem(s, it, cache)) return true;
    return false;
  }
  for (const it of cond.items) if (!(await evalItem(s, it, cache))) return false;
  return true;
}

// ───────────────────────── adapter "contact" ของตัวรันกลาง (มติ C18) ─────────────────────────

/** ร่องรอยของการทำงาน 1 รอบ (AUDIT-CLASS X3): `chain` = กฎที่ส่งต่อกันมาจนถึงรอบนี้ · `touched` = รายการที่รอบนี้แก้/สร้าง */
type CrmTrace = { chain: string[]; touched: Set<string> };
type CrmEnv = RunnerEnv<CrmSubject> & { deps: CrmRuleDeps; rule: RuleRow & { tenantId: string; name: string }; trace: CrmTrace };

/** บันทึกว่ารอบนี้แตะรายการไหน (เขียนลงแถว run ทันที — event ที่การกระทำนี้ปล่อยออกไปจะถูกตรวจกับร่องรอยนี้) */
async function touch(env: CrmEnv, ...keys: (string | null | undefined)[]): Promise<void> {
  let changed = false;
  for (const k of keys) if (k && !env.trace.touched.has(k)) { env.trace.touched.add(k); changed = true; }
  if (!changed) return;
  const patch = JSON.stringify({ chain: env.trace.chain, touched: [...env.trace.touched] });
  await prisma.$executeRaw`UPDATE "AutomationRun" SET "payload" = COALESCE("payload", '{}'::jsonb) || ${patch}::jsonb WHERE "id" = ${env.runId}`.catch(() => null);
}
const traceJson = (t: CrmTrace) => ({ chain: t.chain, touched: [...t.touched] });

/** ผู้ทำการแทนระบบ (ประวัติขึ้นว่า "ระบบ") — userId = ผู้ดูแลที่งานจะตกไปหา (บริการใช้เป็นเจ้าของงาน/ผู้บันทึก) */
const systemActor = (userId: string): MemberActor => ({ userId, role: "OWNER", unitAccess: ["*"], permissions: {} });
const svcCtx = (s: CrmSubject) => ({ tenantId: s.tenantId, systemId: s.systemId, actorUserId: null });

async function tenantOwnerId(tenantId: string): Promise<string> {
  const m = await prisma.membership.findFirst({ where: { tenantId, role: "OWNER" }, orderBy: { createdAt: "asc" }, select: { userId: true } });
  return m?.userId ?? "";
}
async function ownerOf(s: CrmSubject): Promise<string> {
  return s.contact?.ownerUserId ?? s.deal?.ownerUserId ?? (await tenantOwnerId(s.tenantId));
}

const contactName = (c: CrmContact | null): string => (c ? c.name || [c.firstName, c.lastName].filter(Boolean).join(" ").trim() || "ลูกค้า" : "");

/** LINE ของผู้ติดต่อ: `lineUserId` ของ CRM ก่อน · ไม่มี = ตัวตน LINE ของสมาชิกที่ผูกไว้ (ผ่าน facade สมาชิก) */
async function lineAddressOf(c: CrmContact): Promise<string> {
  if (c.lineUserId?.trim()) return c.lineUserId.trim();
  if (!c.memberCustomerId) return "";
  const sys = await memberSystemOf(c.tenantId, c.memberCustomerId);
  if (!sys) return "";
  const m = await import("@/lib/modules/member");
  const ids = await m.listIdentities({ tenantId: c.tenantId, systemId: sys.systemId, actorUserId: null }, c.memberCustomerId);
  return ids.find((i) => i.channel === "LINE")?.externalId ?? "";
}

const skip = (i: number, type: string, note: string): StepOutcome => ({ i, type, ok: false, skipped: true, note });

async function runCrmDomainAction(kind: string, params: Record<string, unknown>, env: CrmEnv, at: { action: { type: string; params?: Record<string, unknown> }; index: number; depth: number }): Promise<StepOutcome> {
  const s = env.subject;
  const i = at.index;
  const ok = (note: string): StepOutcome => ({ i, type: kind, ok: true, note });
  const render = async (tpl: string) => renderTemplate(tpl, await crmVars(env, tpl));
  try {
    switch (kind) {
      case "MOVE_STAGE": {
        if (!s.deal) return skip(i, kind, "เหตุการณ์นี้ไม่มีดีล — ไม่มีดีลให้ย้ายขั้น");
        // AUDIT-CLASS X1: ขั้นปลายทางต้องอยู่ pipeline ของดีลนี้ ในระบบเดียวกัน (กันแถวกฎที่ถูกแก้ตรงในฐาน)
        const stage = await prisma.crmStage.findFirst({ where: { id: str(params.stageId), tenantId: s.tenantId, systemId: s.systemId, pipelineId: s.deal.pipelineId }, select: { id: true, name: true } });
        if (!stage) return skip(i, kind, "ขั้นปลายทางไม่อยู่ใน pipeline ของดีลนี้ — ไม่ได้ย้าย");
        if (s.deal.stageId === stage.id) return ok(`ดีลอยู่ขั้น "${stage.name}" อยู่แล้ว`);
        await touch(env, `deal:${s.deal.id}`);
        await deals.moveDeal(svcCtx(s), systemActor(await ownerOf(s)), s.deal.id, { stageId: stage.id });
        return ok(`ย้ายดีลไปขั้น "${stage.name}"`);
      }
      case "ASSIGN": {
        const userId = str(params.userId);
        if (!(await isTenantMember(s.tenantId, userId))) return skip(i, kind, "ผู้ดูแลที่ตั้งไว้ไม่ได้อยู่ในร้านนี้แล้ว — ไม่ได้มอบหมาย");
        if (s.contact) {
          await touch(env, `contact:${s.contact.id}`);
          await contacts.assignContact(svcCtx(s), systemActor(userId), s.contact.id, { userId });
          return ok("มอบหมายผู้ดูแลผู้ติดต่อแล้ว");
        }
        if (s.deal) {
          await touch(env, `deal:${s.deal.id}`);
          await deals.reassignDeal(svcCtx(s), systemActor(userId), s.deal.id, { ownerUserId: userId });
          return ok("มอบหมายผู้ดูแลดีลแล้ว");
        }
        return skip(i, kind, "เหตุการณ์นี้ไม่มีผู้ติดต่อหรือดีลให้มอบหมาย");
      }
      case "CREATE_ACTIVITY": {
        if (!s.contact && !s.deal) return skip(i, kind, "เหตุการณ์นี้ไม่มีผู้ติดต่อหรือดีล — ไม่มีที่ให้ผูกงาน");
        const assignTo = str(params.assignTo) || "owner";
        const owner = assignTo === "owner" ? await ownerOf(s) : (await isTenantMember(s.tenantId, assignTo)) ? assignTo : await ownerOf(s);
        if (!owner) return skip(i, kind, "ร้านนี้ยังไม่มีผู้ดูแลให้รับงาน");
        const dueIn = params.dueIn === undefined ? null : numOr(params.dueIn, 0);
        await touch(env, s.contact ? `contact:${s.contact.id}` : null, s.deal ? `deal:${s.deal.id}` : null);
        const act = await activities.logActivity(svcCtx(s), systemActor(owner), {
          type: str(params.type) || "TASK",
          title: (await render(str(params.title))) || CRM_ACTION_LABELS.CREATE_ACTIVITY,
          contactId: s.contact?.id ?? null,
          dealId: s.deal?.id ?? null,
          ...(dueIn !== null ? { dueAt: new Date(env.now.getTime() + dueIn * DAY_MS) } : {}),
        });
        await touch(env, `activity:${act.id}`);
        return ok("สร้างงานติดตามแล้ว");
      }
      case "CREATE_DEAL": {
        if (!s.contact) return skip(i, kind, "เหตุการณ์นี้ไม่มีผู้ติดต่อ — เปิดดีลให้ไม่ได้");
        const pipe = await prisma.crmPipeline.findFirst({ where: { id: str(params.pipelineId), tenantId: s.tenantId, systemId: s.systemId, archivedAt: null }, select: { id: true } });
        if (!pipe) return skip(i, kind, "pipeline ที่ตั้งไว้ไม่อยู่ในระบบ CRM นี้แล้ว — ไม่ได้เปิดดีล");
        const first = await prisma.crmStage.findFirst({ where: { pipelineId: pipe.id, kind: "OPEN" }, orderBy: { sortOrder: "asc" }, select: { id: true } });
        const owner = await ownerOf(s);
        await touch(env, `contact:${s.contact.id}`);
        const nd = await deals.createDeal(svcCtx(s), systemActor(owner), {
          pipelineId: pipe.id,
          stageId: first?.id ?? null,
          title: ((await render(str(params.titleTpl))) || "ดีลใหม่").slice(0, 200),
          contactId: s.contact.id,
          ...(params.valueSatang !== undefined ? { valueSatang: numOr(params.valueSatang, 0) } : {}),
          ...(owner ? { ownerUserId: owner } : {}),
        });
        await touch(env, `deal:${nd.id}`);
        return ok("เปิดดีลใหม่แล้ว");
      }
      case "SET_FIELD": {
        const key = str(params.key);
        const actor = systemActor(await ownerOf(s));
        if ((str(params.objectKey) || "contact") === "deal") {
          if (!s.deal) return skip(i, kind, "เหตุการณ์นี้ไม่มีดีล — ไม่มีฟิลด์ให้ตั้ง");
          await touch(env, `deal:${s.deal.id}`);
          await deals.updateDeal(svcCtx(s), actor, s.deal.id, { fields: { [key]: params.value ?? null } });
          return ok(`ตั้งค่าฟิลด์ "${key}" ของดีลแล้ว`);
        }
        if (!s.contact) return skip(i, kind, "เหตุการณ์นี้ไม่มีผู้ติดต่อ — ไม่มีฟิลด์ให้ตั้ง");
        await touch(env, `contact:${s.contact.id}`);
        await contacts.updateContact(svcCtx(s), actor, s.contact.id, { fields: { [key]: params.value ?? null } });
        return ok(`ตั้งค่าฟิลด์ "${key}" แล้ว`);
      }
      case "ADD_TAG":
      case "REMOVE_TAG": {
        if (!s.contact) return skip(i, kind, "เหตุการณ์นี้ไม่มีผู้ติดต่อ — ไม่มีที่ให้ติดแท็ก");
        const tag = str(params.tag);
        const fresh = await prisma.crmContact.findFirst({ where: { id: s.contact.id, tenantId: s.tenantId }, select: { tags: true } });
        const tags = fresh?.tags ?? [];
        const next = kind === "ADD_TAG" ? (tags.includes(tag) ? tags : [...tags, tag]) : tags.filter((t) => t !== tag);
        if (next.length !== tags.length) await touch(env, `contact:${s.contact.id}`);
        if (next.length !== tags.length) await contacts.setTags(svcCtx(s), systemActor(await ownerOf(s)), s.contact.id, next);
        return ok(kind === "ADD_TAG" ? `แท็ก "${tag}"` : `เอาแท็ก "${tag}" ออก`);
      }
      case "NOTIFY_STAFF": {
        const to = str(params.to);
        let recipients: string[] = [];
        if (Array.isArray(params.userIds) && params.userIds.length) {
          const ids = (params.userIds as unknown[]).filter((u): u is string => typeof u === "string");
          recipients = (await prisma.membership.findMany({ where: { tenantId: s.tenantId, userId: { in: ids } }, select: { userId: true } })).map((m) => m.userId);
        } else if (to === "managers") {
          recipients = (await prisma.membership.findMany({ where: { tenantId: s.tenantId, role: { in: ["OWNER", "MANAGER"] } }, select: { userId: true } })).map((m) => m.userId);
        } else {
          const o = await ownerOf(s);
          recipients = o ? [o] : [];
        }
        recipients = [...new Set(recipients)];
        if (recipients.length === 0) return skip(i, kind, "ไม่พบพนักงานที่ต้องแจ้ง");
        const title = ((await render(str(params.text))) || `กฎอัตโนมัติ "${env.rule.name}"`).slice(0, 200);
        // AUDIT-CLASS X8: เนื้อความมีแต่ชื่อกฎ + ลิงก์ (ไม่มีเบอร์/อีเมลของลูกค้า) — หน้าปลายทางตรวจสิทธิ์เอง
        const link = s.deal ? `/app/sys/${s.systemId}/crm/deals/${s.deal.id}` : s.contact ? `/app/sys/${s.systemId}/crm/contacts/${s.contact.id}` : `/app/sys/${s.systemId}/crm`;
        const body = `กฎอัตโนมัติ "${env.rule.name}" · เปิดดู ${link}`;
        await prisma.appNotification.createMany({ data: recipients.map((u) => ({ tenantId: s.tenantId, recipientUserId: u, title, body })) });
        return ok(`แจ้ง ${recipients.length} คน`);
      }
      case "OPEN_KANBAN_CARD": {
        // AUDIT-CLASS X1: บอร์ดต้องเป็นของร้านนี้ (ตรวจซ้ำตอนทำงาน)
        const board = await prisma.kanbanBoard.findFirst({ where: { id: str(params.boardId), tenantId: s.tenantId }, select: { id: true } });
        if (!board) return skip(i, kind, "บอร์ดปลายทางไม่อยู่ในร้านนี้แล้ว — ไม่ได้เปิดการ์ด");
        const r = await (env.deps.kanban ?? defaultKanban)({
          tenantId: s.tenantId,
          systemId: s.systemId,
          ruleId: env.rule.id,
          runId: env.runId,
          contactId: s.contact?.id ?? null,
          boardId: board.id,
          title: ((await render(str(params.title))) || env.rule.name).slice(0, 200),
          description: `จากกฎอัตโนมัติ CRM "${env.rule.name}"`,
          sourceKey: `crm-rule:${env.runId}:${i}`,
        });
        return { i, type: kind, ok: r.ok, note: r.ok ? "เปิดการ์ดแล้ว" : (r.error ?? "เปิดการ์ดไม่สำเร็จ") };
      }
      case "WEBHOOK": {
        const url = str(params.url);
        // AUDIT-CLASS X6: ด่าน SSRF ตัวเดียวของระบบ — ตรวจซ้ำตอนยิง (แถวกฎที่ถูกแก้ตรงในฐานก็ยิงหาเครือข่ายภายในไม่ได้)
        const { webhookTargetProblem } = await import("@/lib/webhooks/service");
        const problem = await webhookTargetProblem(url);
        if (problem) return { i, type: kind, ok: false, note: `ไม่ได้ส่ง webhook — ${problem}` };
        // AUDIT-CLASS X8: เนื้อความมีแต่ id (ไม่มีชื่อ/เบอร์/อีเมล)
        await (env.deps.post ?? postWebhook)(url, {
          event: env.event.type,
          ruleId: env.rule.id,
          runId: env.runId,
          systemId: s.systemId,
          contactId: s.contact?.id ?? null,
          dealId: s.deal?.id ?? null,
          activityId: s.activity?.id ?? null,
          recordId: s.record?.id ?? null,
          companyId: s.companyId,
          at: new Date().toISOString(),
        });
        return ok("ส่ง webhook แล้ว");
      }
      case "ENROLL_SEQUENCE":
      case "STOP_SEQUENCE":
        return skip(i, kind, "sequence ยังไม่เปิดใช้ — ขั้นนี้จะทำงานเมื่อระบบลำดับการติดตาม (sequence) เปิด");
      case "ADJUST_SCORE":
        return skip(i, kind, "ระบบคะแนนผู้ติดต่อยังไม่เปิดใช้ — ขั้นนี้จะทำงานเมื่อระบบคะแนนเปิด");
      case "ISSUE_VOUCHER":
      case "GIVE_POINTS": {
        // RESOLUTIONS R-A: ของสมาชิกผ่าน adapter ของสมาชิกเท่านั้น (ผู้ติดต่อที่ผูกสมาชิกแล้ว)
        const what = kind === "GIVE_POINTS" ? "ให้แต้ม" : "ออก voucher";
        if (!s.contact?.memberCustomerId) return skip(i, kind, `ผู้ติดต่อนี้ยังไม่ได้เป็นสมาชิก — ข้ามการ${what} (ผูกผู้ติดต่อกับสมาชิกก่อน)`);
        await import("@/lib/modules/member");
        const m = subjectAdapter("MEMBER_JOURNEY");
        if (!m?.makeEnv) return skip(i, kind, `ระบบสมาชิกยังไม่พร้อม — ข้ามการ${what}`);
        const customer = await m.resolveSubject({ tenantId: s.tenantId, type: env.event.type, payload: { customerId: s.contact.memberCustomerId } });
        if (!customer) return skip(i, kind, `ไม่พบสมาชิกที่ผูกกับผู้ติดต่อนี้แล้ว — ข้ามการ${what}`);
        const menv = m.makeEnv(customer, { rule: { id: env.rule.id, tenantId: env.rule.tenantId, name: env.rule.name }, runId: env.runId, event: env.event, now: env.now });
        const r = await m.runDomainAction(kind, params, menv, at);
        return { ...r, i, type: kind };
      }
      default:
        return skip(i, kind, "การกระทำนี้ไม่รองรับในกฎ CRM");
    }
  } catch (e) {
    // ขั้นหนึ่งพังไม่พาขั้นถัดไปพัง — บันทึกเหตุผลไว้ในขั้นนี้ (ข้อความบริการเป็นไทยและไม่มีข้อมูลลูกค้า)
    return { i, type: kind, ok: false, note: errText(e) };
  }
}

async function crmVars(env: CrmEnv, _text: string): Promise<Record<string, string | undefined>> {
  return { ชื่อ: contactName(env.subject.contact), ดีล: env.subject.deal?.title ?? "" };
}

async function postWebhook(url: string, body: unknown): Promise<void> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 5000);
  try {
    const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: ctrl.signal, redirect: "manual" });
    if (!res.ok) throw new Error(`ปลายทางตอบรหัส ${res.status}`);
  } finally {
    clearTimeout(timer);
  }
}

// ── ตัวส่งจริงปริยาย (ห้าม throw — คืน {ok:false} แทน) ──
const defaultKanban: CrmKanbanFn = async (req) => {
  try {
    const board = await prisma.kanbanBoard.findFirst({ where: { id: req.boardId, tenantId: req.tenantId }, select: { systemId: true } });
    if (!board) return { ok: false, error: "ไม่พบบอร์ดปลายทางของการ์ดนี้ — เลือกบอร์ดใหม่ในกฎ" };
    const { createCardFromExternal } = await import("@/lib/modules/kanban/links");
    const r = await createCardFromExternal(
      { tenantId: req.tenantId, systemId: board.systemId, actorUserId: null },
      { boardId: req.boardId, title: req.title, description: req.description, sourceType: "AUTOMATION", sourceKey: req.sourceKey },
    );
    return { ok: true, cardId: r.cardId };
  } catch (e) {
    return { ok: false, error: errText(e, "เปิดการ์ดงานไม่สำเร็จ") };
  }
};

export const CRM_DEFAULT_DEPS: Required<Omit<CrmRuleDeps, "kanban" | "post">> & Pick<CrmRuleDeps, "kanban" | "post"> = {
  // R-E.5 + addendum 2: อีเมลจากกฎยังไม่มีทางส่งจริงจนถึงใบ C2.5 — ขั้นถูก "ข้าม" พร้อมเหตุผล (ไม่ใช่ล้ม)
  email: async () => ({ ok: false, skipped: true, error: EMAIL_NOT_READY }),
  line: async (req) => {
    if (req.consent !== "GRANTED") return { ok: false, skipped: true, error: "ผู้ติดต่อยังไม่ได้ยินยอมรับข่าวสารทาง LINE" };
    try {
      const chat = await import("@/lib/modules/chat");
      if (req.to) {
        const r = await chat.pushToContact({ tenantId: req.tenantId, channel: "LINE", externalUserId: req.to, text: req.body, systemId: null });
        return { ok: r.ok, ...(r.reason ? { error: r.reason } : {}) };
      }
      if (req.partyId) {
        const r = await chat.sendLineToParty({ tenantId: req.tenantId }, { partyId: req.partyId, text: req.body });
        return { ok: r.ok, ...(r.reason ? { error: r.reason } : {}) };
      }
      return { ok: false, skipped: true, error: "ผู้ติดต่อนี้ยังไม่มีบัญชี LINE ที่ผูกไว้" };
    } catch (e) {
      return { ok: false, error: errText(e, "ส่ง LINE ไม่สำเร็จ") };
    }
  },
  push: async (req) => {
    if (!req.to) return { ok: false, skipped: true, error: "ผู้ติดต่อนี้ยังไม่มีผู้ดูแลให้แจ้งเตือน" };
    try {
      const { sendPushToUsers } = await import("@/lib/core/push");
      const r = await sendPushToUsers(req.tenantId, [req.to], { title: req.title || "CRM", body: req.body });
      return r.sent > 0 ? { ok: true } : { ok: false, skipped: true, error: "ผู้ดูแลยังไม่ได้ลงแอปหรือเปิดแจ้งเตือน" };
    } catch (e) {
      return { ok: false, error: errText(e, "แจ้งเตือนไม่สำเร็จ") };
    }
  },
  sms: async () => ({ ok: false, skipped: true, error: "ยังไม่เปิดส่ง SMS จากกฎ CRM" }),
};

const CRM_ADAPTER: SubjectAdapter<CrmSubject, CrmEnv> = {
  scope: SCOPE,
  resolveSubject: (evt: RunnerEventInput) => resolveCrmSubject(evt.tenantId, evt.type, evt.payload, evt.systemId),
  addressOf: async (s, channel) => {
    if (channel === "PUSH") return ownerOf(s);
    const c = s.contact;
    if (!c) return "";
    if (channel === "EMAIL") return c.email?.trim() ?? "";
    if (channel === "SMS") return c.phone?.trim() ?? "";
    return lineAddressOf(c);
  },
  // AUDIT-CLASS X8: ความยินยอม ณ เวลาส่ง — `consents.canContact` (ผูกสมาชิก ⇒ MemberConsent) · push หาพนักงาน = ไม่ใช่ข่าวสารถึงลูกค้า
  consentOf: async (s, channel) => {
    if (channel === "PUSH") return "GRANTED";
    if (!s.contact) return "REVOKED";
    const fresh = await prisma.crmContact.findFirst({ where: { id: s.contact.id, tenantId: s.tenantId } });
    if (!fresh) return "REVOKED";
    return (await canContact(fresh, channel)) ? "GRANTED" : "REVOKED";
  },
  runDomainAction: runCrmDomainAction,
  channelLabel: (channel) => CHANNEL_LABEL[channel],
  consentBlockedNote: (_channel, label) => `ไม่ได้ส่ง — ผู้ติดต่อไม่ได้ให้ความยินยอม (หรือขอไม่รับข่าวสาร) ทาง${label} ณ เวลาส่ง`,
  messageVars: crmVars,
  render: renderTemplate,
  send: async (env, core: RunnerSendCore) => {
    const sender = env.deps[core.channel.toLowerCase() as "line" | "email" | "sms" | "push"] ?? CRM_DEFAULT_DEPS[core.channel.toLowerCase() as "line" | "email" | "sms" | "push"];
    return sender({
      tenantId: env.subject.tenantId,
      systemId: env.subject.systemId,
      ruleId: env.rule.id,
      runId: env.runId,
      contactId: env.subject.contact?.id ?? null,
      partyId: env.subject.contact?.partyId ?? null,
      ...core,
    });
  },
  waitColumns: (s) => ({ crmContactId: s.contact?.id ?? null }),
  waitExtras: (env) => ({ payload: { refs: refsOf(env.subject), chain: env.trace.chain }, note: "" }),
};

function summarize(steps: StepOutcome[]): string {
  if (steps.length === 0) return "ไม่มีขั้นที่ต้องทำ";
  const done = steps.filter((s) => s.ok).length;
  const parts = steps.map((s) => `${CRM_ACTION_LABELS[s.type as CrmActionType] ?? s.type}: ${s.ok ? "สำเร็จ" : s.skipped ? "ข้าม" : "ไม่สำเร็จ"}${s.note ? ` (${s.note})` : ""}`);
  return `ทำแล้ว ${done}/${steps.length} ขั้น — ${parts.join(" · ")}`.slice(0, 1500);
}

// ───────────────────────── เอนจิน: event → กฎ ─────────────────────────

export type CrmRuleEvent = { tenantId: string; systemId?: string | null; type: string; payload: unknown; id?: string | null; idempotencyKey?: string | null };
export type CrmRunOptions = { now?: Date; deps?: CrmRuleDeps };

const isCrmEventType = (t: string): boolean => typeof t === "string" && (t.startsWith("crm.") || t.startsWith("custom.record."));

type MainSeed = { status: "OK" | "SKIPPED"; detail: string };

/** ระบบ CRM ที่เปิด uiVersion 2 (อ่านตรงใน SQL — ตรงกับ parseCrmSettings: ต้องเป็นตัวเลข 2) — ใช้กรองงานตามเวลาใน SQL (SF-3) */
async function v2SystemIds(tenantId?: string): Promise<string[]> {
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT "id" FROM "AppSystem"
    WHERE "type" = 'CRM'
      AND jsonb_typeof("settings"->'crm'->'uiVersion') = 'number'
      AND ("settings"->'crm'->>'uiVersion')::numeric = 2
      ${tenantId ? Prisma.sql`AND "tenantId" = ${tenantId}` : Prisma.empty}`;
  return rows.map((r) => r.id);
}

/**
 * แถวหลัก (stepIndex = null) ของ (กฎ, ผู้ติดต่อ, eventKey) — ใครเขียนก่อนได้สิทธิ์ทำ (null = มีคนทำไปแล้ว)
 * AUDIT-CLASS X4: มีผู้ติดต่อ = partial UNIQUE(ruleId, crmContactId, eventKey) ของ C2.0 ตัดสินในคำสั่งเดียว (insert-first)
 *   ไม่มีผู้ติดต่อ (event ของบริษัท/รายการที่ไม่ผูกคน) = advisory lock (กฎ, eventKey) + หาก่อนเขียน ใน tx เดียว (addendum 6)
 */
async function insertMainRun(rule: RuleRow, contactId: string | null, eventKey: string, event: { type: string; payload: unknown }, seed: MainSeed, chain: string[]): Promise<string | null> {
  const data = {
    tenantId: rule.tenantId,
    ruleId: rule.id,
    journeyId: rule.id,
    crmContactId: contactId,
    eventKey,
    status: seed.status,
    detail: seed.detail,
    payload: asJson({ event, chain, touched: [] }),
    ...(seed.status === "OK" ? {} : { finishedAt: new Date() }),
  };
  if (contactId) {
    try {
      return (await prisma.automationRun.create({ data, select: { id: true } })).id;
    } catch (e) {
      if (isP2002(e)) return null;
      throw e;
    }
  }
  return prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`crm:automation-run:${rule.id}:${eventKey}`}, 0))`;
      const seen = await tx.automationRun.findFirst({ where: { ruleId: rule.id, crmContactId: null, customerId: null, eventKey, stepIndex: null }, select: { id: true } });
      if (seen) return null;
      return (await tx.automationRun.create({ data, select: { id: true } })).id;
    },
    { maxWait: 20_000, timeout: 30_000 },
  );
}

/** รายการหลักของ event (ตัวที่การกระทำของกฎจะไปปลุกซ้ำได้) — กิจกรรม/รายการ/ดีล/บริษัท ตามชนิด event · ไม่มี = ผู้ติดต่อ */
function entityKeyOf(type: string, s: CrmSubject): string | null {
  if (type.startsWith("crm.activity.") && s.activity) return `activity:${s.activity.id}`;
  if (type.startsWith("custom.record.") && s.record) return `record:${s.record.id}`;
  if (type.startsWith("crm.deal.") && s.deal) return `deal:${s.deal.id}`;
  if (type.startsWith("crm.company.") && s.companyId) return `company:${s.companyId}`;
  if (s.contact) return `contact:${s.contact.id}`;
  if (s.deal) return `deal:${s.deal.id}`;
  return s.companyId ? `company:${s.companyId}` : null;
}

/**
 * AUDIT-CLASS X3 กันวน (SF-1): รายการนี้ถูกแตะโดยรอบไหนของกฎ CRM ในร้านเมื่อไม่ถึง 60 วิ — คืน "สายกฎ" ที่พาไปถึงรายการนี้
 * (กฎที่อยู่ในสาย = ถูกปลุกซ้ำด้วยผลของตัวเอง/กฎพี่น้องที่ส่งต่อกันมา) · เทียบนาฬิกาจริง (createdAt/finishedAt คือนาฬิกาจริง)
 */
async function chainTouching(tenantId: string, entityKey: string): Promise<Set<string>> {
  const since = new Date(Date.now() - CRM_LOOP_GUARD_MS);
  const rows = await prisma.automationRun.findMany({
    where: { tenantId, rule: { scope: SCOPE }, OR: [{ createdAt: { gte: since } }, { finishedAt: { gte: since } }] },
    orderBy: { createdAt: "desc" },
    take: 1000,
    select: { payload: true },
  });
  const chain = new Set<string>();
  for (const r of rows) {
    const p = isObj(r.payload) ? r.payload : {};
    const t = Array.isArray(p.touched) ? p.touched : [];
    if (!t.includes(entityKey)) continue;
    for (const c of Array.isArray(p.chain) ? p.chain : []) if (typeof c === "string") chain.add(c);
  }
  return chain;
}

/**
 * กฎ 1 ใบ × ตัวตน 1 ชุด × event 1 ใบ — true = เกิดแถวหลักรอบนี้ (ทำ/ข้าม)
 * `cron` = มาจาก trigger ตามรอบเวลา ⇒ ไม่ใช้ตัวกันวน (SF-1a: ดีลนิ่ง 2 ใบ/งานค้าง 3 ใบของผู้ติดต่อเดียวกันต้องทำงานครบ)
 */
async function enterRule(rule: RuleRow, s: CrmSubject, evt: { type: string; payload: unknown }, eventKey: string, now: Date, deps: CrmRuleDeps, opts: { cron?: boolean } = {}): Promise<boolean> {
  const contactId = s.contact?.id ?? null;
  const event = { type: evt.type, payload: evt.payload };
  // 1) กันซ้ำ (ด่านจริงอยู่ที่ insertMainRun)
  const seen = await prisma.automationRun.findFirst({
    where: contactId ? { ruleId: rule.id, crmContactId: contactId, eventKey } : { ruleId: rule.id, crmContactId: null, customerId: null, eventKey, stepIndex: null },
    select: { id: true },
  });
  if (seen) return false;
  // 2) pipeline ของกฎ (null = ทุก pipeline) — กฎผูก pipeline ทำงานเฉพาะดีลของ pipeline นั้น
  if (rule.pipelineId && s.deal?.pipelineId !== rule.pipelineId) return false;
  // 3) เงื่อนไข — ไม่ตรง = ไม่ทำ และไม่บันทึก (แบบ K2.9: บันทึกทุกใบที่ไม่ตรง = บันทึกการทำงานอ่านไม่รู้เรื่อง)
  if (!(await conditionsPass(s, conditionsOf(rule)))) return false;
  // 4) AUDIT-CLASS X3 กันวน (event เท่านั้น): กฎนี้อยู่ในสายของรอบที่เพิ่งแตะรายการหลักของ event นี้ = ถูกปลุกด้วยผลของตัวเอง
  //    SF-1c: แถว "ข้าม (กันวน)" ใช้กุญแจแยก `loop#<eventKey>` — event ใบเดิมยังทำงานได้ในภายหลัง (ส่งซ้ำหลังพ้นหน้าต่าง)
  let chain = [rule.id];
  if (!opts.cron) {
    const entity = entityKeyOf(evt.type, s);
    const inherited = entity ? await chainTouching(rule.tenantId, entity) : new Set<string>();
    if (inherited.has(rule.id)) {
      const detail = "ข้าม (กันวน) — รายการนี้เพิ่งถูกแก้โดยกฎนี้เอง (หรือกฎอื่นที่ส่งต่อกันมา) เมื่อไม่ถึง 1 นาทีก่อน จึงหยุดไว้ไม่ให้วนไม่รู้จบ";
      return !!(await insertMainRun(rule, contactId, `loop#${eventKey}`.slice(0, 190), event, { status: "SKIPPED", detail }, [...inherited]));
    }
    chain = [...inherited, rule.id].slice(-20);
  }
  // 5) โควตารายเดือนของร้าน (กฎ CRM เท่านั้น)
  const cap = await crmRunLimit(rule.tenantId);
  if ((await crmRunsUsed(rule.tenantId, now)) >= cap) {
    const detail = `ข้าม (โควตา) — ร้านใช้โควตากฎอัตโนมัติ CRM ครบ ${cap.toLocaleString("th-TH")} ครั้งของเดือนนี้แล้ว · เดือนหน้าเริ่มนับใหม่ หรือขยายโควตาในแพ็กเกจ`;
    return !!(await insertMainRun(rule, contactId, eventKey, event, { status: "SKIPPED", detail }, chain));
  }
  // 6) ลงมือ — จองแถวก่อน (ตัวกันซ้ำตัดสินที่นี่) แล้วค่อยทำทีละขั้นผ่านตัวรันกลาง
  const runId = await insertMainRun(rule, contactId, eventKey, event, { status: "OK", detail: "กำลังทำตามขั้นตอนของกฎ" }, chain);
  if (!runId) return false;
  const trace: CrmTrace = { chain, touched: new Set() };
  try {
    const env: CrmEnv = { rule, subject: s, runId, event, now, deps, trace };
    const res = await runSteps(env, actionsOf(rule), 0, 0, CRM_ADAPTER);
    await prisma.automationRun.update({ where: { id: runId }, data: { status: "OK", detail: summarize(res.steps), finishedAt: new Date(), payload: asJson({ event, steps: res.steps, ...traceJson(trace) }) } });
  } catch (e) {
    await prisma.automationRun
      .update({ where: { id: runId }, data: { status: "FAILED", finishedAt: new Date(), detail: `ทำไม่สำเร็จ — ${errText(e)}` } })
      .catch(() => null);
  }
  return true;
}

/**
 * event `crm.*` / `custom.record.*` 1 ใบ → กฎ CRM ที่เปิดอยู่ของ **ระบบของ event** (ผ่าน engine.runForEvent · best-effort)
 * ห้าม throw · คืน `runs` = จำนวนแถวหลักที่เกิดรอบนี้ (ทำ/ข้าม) — ไม่นับที่ตัวกันซ้ำตัดทิ้ง
 */
export async function runForCrmEvent(evt: CrmRuleEvent, opts: CrmRunOptions = {}): Promise<{ runs: number }> {
  let runs = 0;
  try {
    if (!evt?.tenantId || !isCrmEventType(evt.type)) return { runs };
    // N1 ทางลัด: ร้านนี้ไม่มีกฎ CRM ที่เปิดอยู่สำหรับ event นี้ = จบทันที (index [tenantId, event, enabled]) — ไม่โหลดตัวตนใด ๆ
    if (!(await prisma.automationRule.findFirst({ where: { tenantId: evt.tenantId, event: evt.type, enabled: true, scope: SCOPE }, select: { id: true } }))) return { runs };
    const s = await resolveCrmSubject(evt.tenantId, evt.type, evt.payload, evt.systemId);
    if (!s) return { runs };
    // กติกาถาวร R-E.14: ระบบที่ยังอยู่ uiVersion 1 = กฎไม่ทำงาน (แถวกฎคงไว้ · เปิด 2 เมื่อไรทำงานต่อ)
    if ((await crmUiVersion(s)) !== 2) return { runs };
    const rules = (await prisma.automationRule.findMany({
      where: { tenantId: evt.tenantId, scope: SCOPE, crmSystemId: s.systemId, enabled: true, kind: "RULE", event: evt.type },
      orderBy: { createdAt: "asc" },
      take: 100,
      select: RULE_SELECT,
    })) as RuleRow[];
    if (rules.length === 0) return { runs };
    const eventKey = await eventKeyOf(evt as RunnerEventInput);
    const now = opts.now ?? new Date();
    const deps = opts.deps ?? {};
    for (const rule of rules) {
      try {
        if (await enterRule(rule, s, evt, eventKey, now, deps)) runs += 1;
      } catch (e) {
        // กฎใบหนึ่งพังต้องไม่ล้มกฎใบอื่นของ event เดียวกัน
        await logOps("WARN", "crm.automation", `กฎอัตโนมัติ CRM ${rule.id} ทำงานไม่สำเร็จ (${evt.type})`, { tenantId: evt.tenantId, detail: errText(e) }).catch(() => {});
      }
    }
  } catch (e) {
    await logOps("WARN", "crm.automation", `กฎอัตโนมัติ CRM ล้มทั้งรอบ (${String(evt?.type ?? "")})`, { tenantId: evt?.tenantId, detail: errText(e) }).catch(() => {});
  }
  return { runs };
}

// ───────────────────────── งานตามเวลา: งบเวลา ─────────────────────────

export type CrmJobControl = { signal?: AbortSignal; deadline?: number };
const stopper = (c: CrmJobControl) => () => !!c.signal?.aborted || (typeof c.deadline === "number" && Date.now() > c.deadline - 500);

// ───────────────────────── ขั้นที่รอเวลา (ตัวเก็บกลาง + handler ของ CRM) ─────────────────────────

/**
 * ขั้น "รอ n วัน" ของกฎ CRM ที่ถึงเวลา — การจอง (lease 15 นาที) อยู่ที่ตัวรันกลาง `action-runner.runDueWaits` (ที่เดียวของระบบ)
 * AUDIT-CLASS X5: ส่ง handler ของ scope CRM อย่างเดียว ⇒ ไม่แตะแถวของ journey สมาชิก
 * SF-3: กรองเฉพาะกฎของระบบ uiVersion 2 **ใน SQL** — แถวของระบบ uiVersion 1 ไม่ถูกดึงเลย (ไม่จอง ไม่ยกเลิก คงสถานะ WAITING
 *   จนกว่าจะเปิด 2 อีกครั้ง) และไม่แย่งที่ของแถวระบบ 2 · ไล่ทีละหน้าจนหมดหรือหมดงบเวลา
 */
export async function runDueWaits(opts: { now?: Date; tenantId?: string; deps?: CrmRuleDeps; limit?: number } & CrmJobControl = {}): Promise<{ ran: number }> {
  const deps = opts.deps ?? {};
  const ids = await v2SystemIds(opts.tenantId);
  if (ids.length === 0) return { ran: 0 };
  return runDueWaitsShared(
    { now: opts.now, tenantId: opts.tenantId, limit: opts.limit, drain: true, shouldStop: stopper(opts) },
    { [SCOPE]: { ruleWhere: { crmSystemId: { in: ids } }, resume: (w, now) => finishCrmWait(w, now, deps) } },
  );
}

async function finishCrmWait(w: WaitRow, now: Date, deps: CrmRuleDeps): Promise<void> {
  const rule = (await prisma.automationRule.findFirst({ where: { id: w.ruleId, tenantId: w.tenantId, scope: SCOPE }, select: RULE_SELECT })) as RuleRow | null;
  if (!rule || !rule.enabled || !rule.crmSystemId) {
    await closeWait(w, "CANCELLED", "ยกเลิก — กฎถูกปิดหรือลบก่อนถึงเวลา");
    return;
  }
  const p = isObj(w.payload) ? w.payload : {};
  const refs = (isObj(p.refs) ? p.refs : {}) as SubjectRefs;
  const s = await subjectFromRefs(w.tenantId, rule.crmSystemId, { ...refs, contactId: w.crmContactId ?? refs.contactId ?? null });
  if (!s || (w.crmContactId && !s.contact)) {
    await closeWait(w, "CANCELLED", "ยกเลิก — ผู้ติดต่อหรือดีลของขั้นนี้ถูกลบ ย้ายระบบ หรือรวมกับรายการอื่นไปแล้ว");
    return;
  }
  const ev = isObj(p.event) ? p.event : {};
  const event = { type: typeof ev.type === "string" ? ev.type : rule.event, payload: ev.payload ?? {} };
  const thenActions = Array.isArray(p.thenActions) ? (p.thenActions as CrmRuleAction[]) : [];
  const chain = (Array.isArray(p.chain) ? p.chain : [rule.id]).filter((c): c is string => typeof c === "string");
  const trace: CrmTrace = { chain, touched: new Set() };
  const env: CrmEnv = { rule, subject: s, runId: w.id, event, now, deps, trace };
  const res = await runSteps(env, thenActions, numOr(p.baseIndex, 0), numOr(p.depth, 1), CRM_ADAPTER);
  await closeWait(w, "OK", summarize(res.steps), { steps: res.steps, ...traceJson(trace) });
}

// ───────────────────────── trigger ตามรอบเวลา (cron รายวัน) ─────────────────────────

type CronCandidate = { payload: Record<string, unknown>; key: string };
const CRON_PAGE = 500;
/** close_due / field_due: ตามเก็บวันที่รอบก่อนพลาด (ตัดงบ/เครื่องดับ) ย้อนได้ถึง 7 วัน — กุญแจผูกกับ "วันที่ของรายการ" ไม่ใช่วันที่ cron รัน */
const CRON_CATCHUP_DAYS = 7;

/**
 * ผู้เข้าเกณฑ์ของ trigger ตามรอบเวลา 1 กฎ ณ `now` — ทีละหน้า (เรียงตาม id + cursor) จนหมด ไม่มีเพดาน 500 ที่ทำให้แถวท้าย ๆ ไม่เคยถูกทำ (SF-2)
 * อ่านอย่างเดียว (ใช้ทั้ง cron และทดลองรัน) · กุญแจกันซ้ำ:
 *   close_due / field_due = (กฎ, รายการ, วันที่ของรายการ) — รอบถัดไปตามเก็บของที่รอบก่อนพลาดได้ · activity.overdue = ครั้งเดียวต่องาน ·
 *   deal.stale = ครั้งเดียวต่อช่วงที่นิ่ง · score.threshold = ครั้งเดียวต่อการอัปเดตคะแนน
 */
async function* cronCandidatePages(tenantId: string, systemId: string, trigger: CrmRuleTrigger, now: Date): AsyncGenerator<CronCandidate[]> {
  const p = trigger.params ?? {};
  const after = (cursor: string | null) => (cursor ? { id: { gt: cursor } } : {});
  switch (trigger.event) {
    case "crm.deal.close_due": {
      const d = Math.round(numOr(p.daysBefore, 3));
      const from = thaiDayStart(thaiYmd(new Date(now.getTime() + Math.max(0, d - CRON_CATCHUP_DAYS) * DAY_MS)));
      const to = new Date(thaiDayStart(thaiYmd(new Date(now.getTime() + d * DAY_MS))).getTime() + DAY_MS);
      for (let cursor: string | null = null; ; ) {
        const rows: { id: string; expectedCloseAt: Date | null }[] = await prisma.crmDeal.findMany({
          where: { tenantId, systemId, kind: "OPEN", archivedAt: null, expectedCloseAt: { gte: from, lt: to }, ...after(cursor) },
          orderBy: { id: "asc" },
          take: CRON_PAGE,
          select: { id: true, expectedCloseAt: true },
        });
        if (rows.length) yield rows.map((r) => ({ payload: { dealId: r.id, daysBefore: d }, key: `crm.deal.close_due#${d}#${r.id}#${thaiYmd(r.expectedCloseAt ?? now)}` }));
        if (rows.length < CRON_PAGE) return;
        cursor = rows[rows.length - 1]!.id;
      }
    }
    case "custom.record.field_due": {
      const objectKey = str(p.objectKey);
      const fieldKey = str(p.fieldKey);
      const d = Math.round(numOr(p.daysBefore, 7));
      const obj = await prisma.customObject.findFirst({ where: { tenantId, systemId, key: objectKey }, select: { id: true } });
      const field = obj ? await prisma.memberField.findFirst({ where: { tenantId, systemId, objectKey, key: fieldKey }, select: { id: true } }) : null;
      if (!obj || !field) return;
      // ฟิลด์ DATE เก็บเป็นเที่ยงคืน UTC ของวันในปฏิทิน (engine ฟิลด์ parseYmd) ⇒ เทียบ "วันที่" ตรง ๆ
      const from = new Date(`${thaiYmd(new Date(now.getTime() + Math.max(0, d - CRON_CATCHUP_DAYS) * DAY_MS))}T00:00:00.000Z`);
      const to = new Date(new Date(`${thaiYmd(new Date(now.getTime() + d * DAY_MS))}T00:00:00.000Z`).getTime() + DAY_MS);
      for (let cursor: string | null = null; ; ) {
        const vals: { id: string; recordId: string; valueDate: Date | null }[] = await prisma.customRecordValue.findMany({
          where: { tenantId, fieldId: field.id, valueDate: { gte: from, lt: to }, ...after(cursor) },
          orderBy: { id: "asc" },
          take: CRON_PAGE,
          select: { id: true, recordId: true, valueDate: true },
        });
        if (vals.length) {
          const recs = await prisma.customRecord.findMany({ where: { tenantId, systemId, objectId: obj.id, archivedAt: null, id: { in: vals.map((v) => v.recordId) } }, select: { id: true } });
          const live = new Set(recs.map((r) => r.id));
          const page = vals
            .filter((v) => live.has(v.recordId))
            .map((v) => ({ payload: { recordId: v.recordId, objectKey, fieldKey, daysBefore: d }, key: `custom.record.field_due#${objectKey}.${fieldKey}#${d}#${v.recordId}#${(v.valueDate ?? now).toISOString().slice(0, 10)}` }));
          if (page.length) yield page;
        }
        if (vals.length < CRON_PAGE) return;
        cursor = vals[vals.length - 1]!.id;
      }
    }
    case "crm.activity.overdue": {
      for (let cursor: string | null = null; ; ) {
        const rows: { id: string }[] = await prisma.crmActivity.findMany({
          where: { tenantId, systemId, doneAt: null, dueAt: { lt: now, gte: new Date(now.getTime() - 60 * DAY_MS) }, ...after(cursor) },
          orderBy: { id: "asc" },
          take: CRON_PAGE,
          select: { id: true },
        });
        // 1 ครั้งต่องานที่เลยกำหนด (ไม่ใช่ทุกวัน — งานค้างใบเดียวไม่ควรเตือนซ้ำไม่รู้จบ)
        if (rows.length) yield rows.map((r) => ({ payload: { activityId: r.id }, key: `crm.activity.overdue#${r.id}` }));
        if (rows.length < CRON_PAGE) return;
        cursor = rows[rows.length - 1]!.id;
      }
    }
    case "crm.deal.stale": {
      const days = Math.round(numOr(p.days, 14));
      const cutoff = new Date(now.getTime() - days * DAY_MS);
      for (let cursor: string | null = null; ; ) {
        const rows: { id: string; lastActivityAt: Date | null; stageEnteredAt: Date }[] = await prisma.crmDeal.findMany({
          where: { tenantId, systemId, kind: "OPEN", archivedAt: null, OR: [{ lastActivityAt: { lte: cutoff } }, { lastActivityAt: null, stageEnteredAt: { lte: cutoff } }], ...after(cursor) },
          orderBy: { id: "asc" },
          take: CRON_PAGE,
          select: { id: true, lastActivityAt: true, stageEnteredAt: true },
        });
        // 1 ครั้งต่อ "ช่วงที่นิ่ง" (จุดยึด = กิจกรรมล่าสุด/วันเข้าขั้น) — มีกิจกรรมใหม่แล้วนิ่งอีก = นับรอบใหม่
        if (rows.length) yield rows.map((r) => ({ payload: { dealId: r.id, days }, key: `crm.deal.stale#${days}#${r.id}#${(r.lastActivityAt ?? r.stageEnteredAt).toISOString()}` }));
        if (rows.length < CRON_PAGE) return;
        cursor = rows[rows.length - 1]!.id;
      }
    }
    case "crm.score.threshold": {
      const band = str(p.band).toUpperCase();
      if (!(CRM_SCORE_BANDS as readonly string[]).includes(band)) return;
      for (let cursor: string | null = null; ; ) {
        const rows: { id: string; scoreUpdatedAt: Date | null }[] = await prisma.crmContact.findMany({
          where: { tenantId, systemId, archivedAt: null, mergedIntoId: null, scoreBand: band as (typeof CRM_SCORE_BANDS)[number], ...after(cursor) },
          orderBy: { id: "asc" },
          take: CRON_PAGE,
          select: { id: true, scoreUpdatedAt: true },
        });
        if (rows.length) yield rows.map((r) => ({ payload: { contactId: r.id, band }, key: `crm.score.threshold#${band}#${r.id}#${r.scoreUpdatedAt?.toISOString() ?? "0"}` }));
        if (rows.length < CRON_PAGE) return;
        cursor = rows[rows.length - 1]!.id;
      }
    }
  }
}

/**
 * trigger ตามรอบเวลา (รายวัน · ทุกร้าน หรือร้านเดียว) — กุญแจกันซ้ำต่อ (trigger, รายการ, วัน/ช่วง) ⇒ cron ซ้อนกันกี่ตัวก็ได้ผลเดียว
 * SF-2: กฎและผู้เข้าเกณฑ์ไล่ทีละหน้า (ไม่มีเพดาน) · ตัดของที่ทำแล้วด้วยกุญแจก่อนโหลดตัวตน · หมดงบเวลา = หยุดแล้วคืน `cutOff`
 *   (รอบถัดไปตามเก็บต่อได้ — close_due/field_due ย้อนเก็บวันที่พลาดได้ 7 วัน) · SF-3: เฉพาะระบบ uiVersion 2 (กรองใน SQL)
 */
export async function runCronTriggers(opts: { now?: Date; tenantId?: string; deps?: CrmRuleDeps } & CrmJobControl = {}): Promise<{ runs: number; cutOff: boolean }> {
  const now = opts.now ?? new Date();
  const stop = stopper(opts);
  let runs = 0;
  const ids = await v2SystemIds(opts.tenantId);
  if (ids.length === 0) return { runs, cutOff: false };
  for (let cursor: string | null = null; ; ) {
    const rules = (await prisma.automationRule.findMany({
      where: { scope: SCOPE, enabled: true, kind: "RULE", crmSystemId: { in: ids }, event: { in: [...CRM_CRON_TRIGGER_VALUES] }, ...(opts.tenantId ? { tenantId: opts.tenantId } : {}), ...(cursor ? { id: { gt: cursor } } : {}) },
      orderBy: { id: "asc" },
      take: 500,
      select: RULE_SELECT,
    })) as RuleRow[];
    for (const rule of rules) {
      const sys = rule.crmSystemId!;
      try {
        for await (const page of cronCandidatePages(rule.tenantId, sys, triggerOf(rule), now)) {
          const done = new Set(
            (await prisma.automationRun.findMany({ where: { ruleId: rule.id, eventKey: { in: page.map((c) => c.key) } }, select: { eventKey: true } })).map((r) => r.eventKey),
          );
          for (const c of page) {
            if (done.has(c.key)) continue;
            if (stop()) return { runs, cutOff: true };
            const s = await resolveCrmSubject(rule.tenantId, rule.event, c.payload, sys);
            if (!s) continue;
            if (await enterRule(rule, s, { type: rule.event, payload: c.payload }, c.key, now, opts.deps ?? {}, { cron: true })) runs += 1;
          }
        }
      } catch (e) {
        await logOps("WARN", "crm.automation", `trigger ตามรอบเวลาของกฎ ${rule.id} ทำงานไม่สำเร็จ`, { tenantId: rule.tenantId, detail: errText(e) }).catch(() => {});
      }
      if (stop()) return { runs, cutOff: true };
    }
    if (rules.length < 500) return { runs, cutOff: false };
    cursor = rules[rules.length - 1]!.id;
  }
}

// ───────────────────────── การมองเห็นของผู้ดู (N7) ─────────────────────────

/** ตัวกรอง "ผู้ดูคนนี้เห็นรายการนี้ไหม" — ผู้ติดต่อผ่าน contactWhere · รายการไม่มีผู้ติดต่อ (บริษัท) ผ่าน companyWhere */
async function visibleSubjects(ctx: CrmAutomationCtx, actor: MemberActor, subjects: Pick<CrmSubject, "contact" | "companyId">[]): Promise<(s: Pick<CrmSubject, "contact" | "companyId">) => boolean> {
  const cids = [...new Set(subjects.map((s) => s.contact?.id).filter((x): x is string => !!x))];
  const coids = [...new Set(subjects.filter((s) => !s.contact && s.companyId).map((s) => s.companyId!))];
  const seeC = new Set(cids.length ? (await prisma.crmContact.findMany({ where: { AND: [await contactWhere(ctx, actor), { id: { in: cids } }] }, select: { id: true } })).map((r) => r.id) : []);
  const seeCo = new Set(coids.length ? (await prisma.crmCompany.findMany({ where: { AND: [await companyWhere(ctx, actor), { id: { in: coids } }] }, select: { id: true } })).map((r) => r.id) : []);
  return (s) => (s.contact ? seeC.has(s.contact.id) : s.companyId ? seeCo.has(s.companyId) : true);
}

// ───────────────────────── ทดลองรัน (ไม่เขียนอะไรเลย) ─────────────────────────

export type CrmDryRunMatch = { contactId?: string; dealId?: string; recordId?: string; activityId?: string; companyId?: string; label: string };

/**
 * ทดลองรันร่างกฎกับข้อมูลจริงย้อนหลัง `days` วัน (ค่าเริ่มต้น 30 · สูงสุด 90) — trigger ตามรอบเวลาใช้เกณฑ์ของวันนี้
 * 🔴 อ่านอย่างเดียว: ไม่มี AutomationRun · ไม่มี outbox · ไม่มี audit · ไม่เรียกตัวส่ง
 */
export async function dryRun(ctx: CrmAutomationCtx, actor: MemberActor, input: CrmRuleInput, opts: { days?: number; now?: Date } = {}): Promise<{ matched: CrmDryRunMatch[]; total: number; days: number }> {
  await enter(ctx, actor);
  const v = await cleanInput(ctx, input);
  const now = opts.now ?? new Date();
  const days = Math.min(Math.max(Math.round(numOr(opts?.days, 30)), 1), 90);
  const since = new Date(now.getTime() - days * DAY_MS);
  const T = ctx.tenantId;
  const S = ctx.systemId;
  const ev = v.trigger.event;
  let cands: Record<string, unknown>[] = [];
  if (CRM_CRON_TRIGGER_VALUES.has(ev)) {
    for await (const page of cronCandidatePages(T, S, v.trigger, now)) {
      cands.push(...page.map((c) => c.payload));
      if (cands.length >= 300) break;
    }
  }
  else if (ev.startsWith("crm.deal.")) cands = (await prisma.crmDeal.findMany({ where: { tenantId: T, systemId: S, archivedAt: null, updatedAt: { gte: since } }, orderBy: { updatedAt: "desc" }, take: 300, select: { id: true } })).map((r) => ({ dealId: r.id }));
  else if (ev.startsWith("crm.contact.")) cands = (await prisma.crmContact.findMany({ where: { tenantId: T, systemId: S, archivedAt: null, updatedAt: { gte: since } }, orderBy: { updatedAt: "desc" }, take: 300, select: { id: true } })).map((r) => ({ contactId: r.id }));
  else if (ev.startsWith("crm.activity.")) cands = (await prisma.crmActivity.findMany({ where: { tenantId: T, systemId: S, createdAt: { gte: since } }, orderBy: { createdAt: "desc" }, take: 300, select: { id: true } })).map((r) => ({ activityId: r.id }));
  else if (ev.startsWith("custom.record.")) cands = (await prisma.customRecord.findMany({ where: { tenantId: T, systemId: S, updatedAt: { gte: since } }, orderBy: { updatedAt: "desc" }, take: 300, select: { id: true } })).map((r) => ({ recordId: r.id }));
  else if (ev.startsWith("crm.company.")) cands = (await prisma.crmCompany.findMany({ where: { tenantId: T, systemId: S, updatedAt: { gte: since } }, orderBy: { updatedAt: "desc" }, take: 300, select: { id: true } })).map((r) => ({ companyId: r.id }));
  const hits: CrmSubject[] = [];
  for (const payload of cands.slice(0, 300)) {
    const s = await resolveCrmSubject(T, ev, payload, S);
    if (!s) continue;
    if (v.pipelineId && s.deal?.pipelineId !== v.pipelineId) continue;
    if (!(await conditionsPass(s, v.conditions))) continue;
    hits.push(s);
  }
  // N7: ผลทดลองรันเคารพการมองเห็นของผู้ดู (ผู้จัดการที่เห็นเฉพาะทีมเห็นเฉพาะรายการที่ตัวเองเห็นได้)
  const vis = await visibleSubjects(ctx, actor, hits);
  const matched: CrmDryRunMatch[] = [];
  let total = 0;
  for (const s of hits) {
    if (!vis(s)) continue;
    total += 1;
    if (matched.length < 50) {
      matched.push({
        ...(s.contact ? { contactId: s.contact.id } : {}),
        ...(s.deal ? { dealId: s.deal.id } : {}),
        ...(s.record ? { recordId: s.record.id } : {}),
        ...(s.activity ? { activityId: s.activity.id } : {}),
        ...(s.companyId ? { companyId: s.companyId } : {}),
        label: s.deal?.title ?? contactName(s.contact) ?? "",
      });
    }
  }
  return { matched, total, days };
}

// ───────────────────────── ตัวเลือกของตัวสร้างกฎ (หน้า) ─────────────────────────

export type CrmAutomationBuilderOptions = {
  pipelines: { id: string; name: string; stages: { id: string; name: string }[] }[];
  users: { id: string; name: string }[];
  boards: { id: string; name: string }[];
  objects: { key: string; label: string; dateFields: { key: string; label: string }[] }[];
  contactFields: { key: string; label: string }[];
};

export async function builderOptions(ctx: CrmAutomationCtx, actor: MemberActor): Promise<CrmAutomationBuilderOptions> {
  await enter(ctx, actor);
  const [pipes, members, boards, objs, fields] = await Promise.all([
    prisma.crmPipeline.findMany({ where: { tenantId: ctx.tenantId, systemId: ctx.systemId, archivedAt: null }, orderBy: { sortOrder: "asc" }, select: { id: true, name: true, stages: { orderBy: { sortOrder: "asc" }, select: { id: true, name: true } } } }),
    prisma.membership.findMany({ where: { tenantId: ctx.tenantId }, select: { userId: true, user: { select: { name: true, email: true } } } }),
    prisma.kanbanBoard.findMany({ where: { tenantId: ctx.tenantId }, orderBy: { createdAt: "asc" }, take: 100, select: { id: true, name: true } }),
    prisma.customObject.findMany({ where: { tenantId: ctx.tenantId, systemId: ctx.systemId, archivedAt: null }, orderBy: { sortOrder: "asc" }, select: { key: true, label: true } }),
    prisma.memberField.findMany({ where: { tenantId: ctx.tenantId, systemId: ctx.systemId }, select: { key: true, label: true, type: true, objectKey: true } }),
  ]);
  return {
    pipelines: pipes.map((p) => ({ id: p.id, name: p.name, stages: p.stages })),
    users: members.map((m) => ({ id: m.userId, name: m.user?.name || "พนักงาน" })),
    boards,
    objects: objs.map((o) => ({ key: o.key, label: o.label, dateFields: fields.filter((f) => f.objectKey === o.key && (f.type === "DATE" || f.type === "DATETIME")).map((f) => ({ key: f.key, label: f.label })) })),
    contactFields: fields.filter((f) => f.objectKey === "contact").map((f) => ({ key: f.key, label: f.label })),
  };
}

// CRM C2.2 ▸ ลำดับการติดตาม (`sequences.ts`) ส่งผ่านตัวรันกลางด้วย adapter ของตัวเอง แต่ใช้ "ที่อยู่ LINE" ชุดเดียวกับกฎ CRM
//   (lineUserId ของ CRM ก่อน · ไม่มี = ตัวตน LINE ของสมาชิกที่ผูกไว้) — ไม่มีตัวหาที่อยู่ชุดที่สอง
export const crmLineAddressOf = lineAddressOf;
// ◂ CRM C2.2
