// automation.ts — ตัวสร้าง + เอนจินกฎอัตโนมัติของ "บอร์ดงาน" 5 ชนิด
// (K2.9 · พิมพ์เขียว 13-kanban-v2 §3.9/§4.5/§7.2/§7.3/§7.6 · สัญญา ledger/KANBAN-RUN.md §K2.9)
//
// ชนิดกฎ (`AutomationRule.kind`):
//   RULE         — ทริกเกอร์จาก outbox event ของบอร์ดงาน 8 ตัว (`KANBAN_AUTOMATION_EVENTS`)
//   CARD_BUTTON  — ปุ่มในหลังการ์ด (คนกดเป็นผู้ลงมือ)
//   BOARD_BUTTON — ปุ่มในหัวบอร์ด
//   SCHEDULED    — ตามเวลาไทย (cron subset · กวาดรายชั่วโมง)
//   DUE_DATE     — N วันก่อน/หลังวันครบกำหนดของการ์ด (กวาดรายวัน)
//
// 🔴 กติกาเหล็กของไฟล์นี้
//  1) **ไม่มี `any`** (ข้อสอบ K2.9-S11.2 อ่านไฟล์นี้ด้วย regex) · input จากภายนอกผ่าน zod ทุกเส้น
//  2) `sweepScheduledRules` / `sweepDueDateRules` รับ `now` จากผู้เรียกเสมอ — **ห้าม `new Date()` ข้างใน**
//     (ไม่งั้นข้อสอบ/cron ทดสอบวันอื่นไม่ได้ · บทเรียนเดียวกับ `recurrence.ts#sweepRecurringCards`)
//  3) วันไทยคำนวณเอง (+07:00) ห้าม `toLocale*` / `getDay()` — `reference_thai_date_getday_trap`
//  4) เอนจินนี้ **ห้าม throw** ตอนวิ่งจาก event (ปลายทางคือ consumer ของคิว) — ล้ม = `AutomationRun FAILED`
//  5) D21: การกระทำที่ k ล้ม → **หยุดกฎนั้นทันที** ไม่ทำที่เหลือ และ **ไม่ลองใหม่อัตโนมัติ**
//     (retry = ทำซ้ำการกระทำก่อนหน้าที่สำเร็จไปแล้ว เช่น ติดป้ายซ้ำ/สร้างการ์ดซ้ำ)
//  6) กฎของบอร์ดมี `boardId` เสมอ ⇒ เอนจินเดิม (`src/lib/automation/engine.ts`) ถูกจำกัดให้เห็นเฉพาะ
//     `boardId: null` และเรียกไฟล์นี้ต่อเมื่อ event ขึ้นต้น `kanban.` (lazy import กัน import วงกลม)
//
// 🔴 ทำไม `SYSTEM_ACTOR` ถึงมี `apiRole: "ADMIN"`: service เดิมของโมดูล (moveCard/checklists/archive)
//    ตรวจ "บทบาทในบอร์ด" ของผู้เรียกเสมอ แต่กฎอัตโนมัติไม่มีคน ⇒ ใช้ช่องทางเดียวกับคีย์ API (D18)
//    ที่มีอยู่แล้ว คือผู้เรียกที่ไม่ใช่คน · `actorUserId` ยังเป็น `null` ⇒ ประวัติกิจกรรมขึ้นว่า "ระบบทำ"
//    พร้อม `data.automation = { ruleId }` บอกว่าเพราะกฎใบไหน

import { z } from "zod";
import type { AutomationRule, Prisma } from "@prisma/client";
import { KANBAN_AUTOMATION_EVENTS } from "@/lib/automation/labels";
import { logOps } from "@/lib/core/ops";
// 🔴 เส้น `kanban→approval` — Fable อนุมัติล่วงหน้าใน ledger/KANBAN-RUN.md (ท้าย §K3.2) สำหรับ K2.9
//    (การกระทำ `open_approval`) · อยู่ใน `ALLOWED_EDGES` ของ `scripts/fitness.mts` แล้ว
import { submitForApproval } from "@/lib/modules/approval/service";
import { KanbanForbiddenError, KanbanNotFoundError } from "./access";
import { logActivity } from "./activity-log";
import { archiveCard, setCardAssignees, updateCardFields } from "./cards";
import { addItem as addChecklistItem, createChecklist } from "./checklists";
import { prisma } from "./db";
import { setCardLabels } from "./labels";
import { KANBAN_LIMITS } from "./limits";
import { assertBoardRole } from "./members";
import { moveCard } from "./moves";
import { cardLink, notifyKanbanUsers } from "./notify";
import { createCard } from "./service";
import type { KanbanActor, KanbanCtx } from "./types";

export { KANBAN_AUTOMATION_EVENTS } from "@/lib/automation/labels";

// ═══════════════════════════ เวลาไทย (คำนวณเอง +07:00) ═══════════════════════════

const BKK_OFFSET_MS = 7 * 60 * 60 * 1000;
const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;
/** ชื่อวันไทย เรียงตาม `getUTCDay()` (0 = อาทิตย์) — ตรงกับเลขวันของ cron */
const DOW_TH = ["อาทิตย์", "จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์"] as const;

type BkkParts = { hour: number; minute: number; weekday: number; dayIndex: number; hourIndex: number };

function bkk(d: Date): BkkParts {
  const ms = d.getTime() + BKK_OFFSET_MS;
  const u = new Date(ms);
  return {
    hour: u.getUTCHours(),
    minute: u.getUTCMinutes(),
    weekday: u.getUTCDay(),
    dayIndex: Math.floor(ms / DAY_MS),
    hourIndex: Math.floor(ms / HOUR_MS),
  };
}

/** "YYYY-MM-DD" ของวันไทยหมายเลข `dayIndex` */
function bkkDateStr(dayIndex: number): string {
  const d = new Date(dayIndex * DAY_MS);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

/** จุดเริ่มของวันไทยหมายเลข `dayIndex` ในเวลาจริง (UTC) */
function bkkDayStart(dayIndex: number): Date {
  return new Date(dayIndex * DAY_MS - BKK_OFFSET_MS);
}

/** จุดเริ่มของ "เดือนไทย" ที่ `now` อยู่ (ใช้นับโควตารายเดือน) */
function bkkMonthStart(now: Date): Date {
  const u = new Date(now.getTime() + BKK_OFFSET_MS);
  return new Date(Date.UTC(u.getUTCFullYear(), u.getUTCMonth(), 1) - BKK_OFFSET_MS);
}

// ═══════════════════════════ ชนิด + zod ═══════════════════════════

export const KANBAN_RULE_KINDS = ["RULE", "CARD_BUTTON", "BOARD_BUTTON", "SCHEDULED", "DUE_DATE"] as const;
export type KanbanRuleKind = (typeof KANBAN_RULE_KINDS)[number];

const CARD_SOURCE_TYPES = ["MANUAL", "TEMPLATE", "CHAT", "FORM", "EMAIL", "AUTOMATION", "AI"] as const;
const SOURCE_TH: Record<string, string> = {
  MANUAL: "คนสร้างเอง",
  TEMPLATE: "เทมเพลตการ์ด",
  CHAT: "แชท",
  FORM: "ฟอร์ม",
  EMAIL: "อีเมล",
  AUTOMATION: "กฎอัตโนมัติ",
  AI: "ผู้ช่วย AI",
};

const ConditionSchema = z.discriminatedUnion("field", [
  z.object({ field: z.literal("column"), op: z.enum(["is", "is_not"]), value: z.string().min(1).max(64) }),
  z.object({ field: z.literal("label"), op: z.enum(["has", "not_has"]), value: z.string().min(1).max(64) }),
  z.object({ field: z.literal("assignee"), op: z.enum(["is_empty", "is"]), value: z.string().min(1).max(64).optional() }),
  z.object({ field: z.literal("due"), op: z.enum(["within_days", "overdue", "none"]), value: z.number().int().min(0).max(365).optional() }),
  z.object({ field: z.literal("source"), op: z.literal("is"), value: z.enum(CARD_SOURCE_TYPES) }),
  z.object({
    field: z.literal("custom_field"),
    op: z.enum(["eq", "neq", "gt", "lt", "contains"]),
    value: z.object({ fieldId: z.string().min(1).max(64), value: z.union([z.string().max(500), z.number(), z.boolean()]) }),
  }),
]);

const NotifyTargetSchema = z.union([z.enum(["assignees", "admins", "creator"]), z.array(z.string().min(1).max(64)).min(1).max(20)]);

const ActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("move_column"), params: z.object({ columnId: z.string().min(1).max(64) }) }),
  z.object({ type: z.literal("add_label"), params: z.object({ labelId: z.string().min(1).max(64) }) }),
  z.object({ type: z.literal("remove_label"), params: z.object({ labelId: z.string().min(1).max(64) }) }),
  z.object({ type: z.literal("assign"), params: z.object({ userId: z.string().min(1).max(64) }) }),
  z.object({ type: z.literal("unassign_all"), params: z.object({}).optional() }),
  z.object({ type: z.literal("set_due"), params: z.object({ offsetDays: z.number().int().min(-365).max(365), keepTime: z.boolean().optional() }) }),
  z.object({
    type: z.literal("add_checklist"),
    params: z.object({
      title: z.string().min(1).max(120).optional(),
      items: z.array(z.string().min(1).max(200)).max(50).optional(),
      templateId: z.string().min(1).max(64).optional(),
    }),
  }),
  z.object({ type: z.literal("archive"), params: z.object({}).optional() }),
  z.object({ type: z.literal("comment"), params: z.object({ text: z.string().min(1).max(2000) }) }),
  z.object({ type: z.literal("notify"), params: z.object({ to: NotifyTargetSchema, message: z.string().min(1).max(500) }) }),
  z.object({ type: z.literal("open_approval"), params: z.object({ amountSatang: z.number().int().min(0).optional() }).optional() }),
  z.object({
    type: z.literal("create_card"),
    params: z.object({
      boardId: z.string().min(1).max(64),
      columnId: z.string().min(1).max(64).optional(),
      title: z.string().min(1).max(200),
      assigneeUserId: z.string().min(1).max(64).optional(),
    }),
  }),
  z.object({ type: z.literal("webhook"), params: z.object({ url: z.string().min(1).max(500) }) }),
]);

const RuleInputSchema = z.object({
  boardId: z.string().min(1).max(64),
  name: z.string().min(1).max(120),
  kind: z.enum(KANBAN_RULE_KINDS),
  event: z.string().max(80).optional(),
  scheduleCron: z.string().max(80).optional(),
  dueOffsetDays: z.number().int().min(-30).max(30).optional(),
  conditions: z.array(ConditionSchema).max(20).optional(),
  actions: z.array(ActionSchema),
});

export type KanbanRuleCondition = z.infer<typeof ConditionSchema>;
export type KanbanRuleAction = z.infer<typeof ActionSchema>;
export type KanbanRuleInput = z.infer<typeof RuleInputSchema>;

export type KanbanRuleDto = {
  id: string;
  name: string;
  kind: KanbanRuleKind;
  event: string | null;
  enabled: boolean;
  runsThisMonth: number;
  sentence: string;
  conditions: KanbanRuleCondition[];
  actions: KanbanRuleAction[];
  scheduleCron: string | null;
  dueOffsetDays: number | null;
};

export type KanbanRuleRunDto = {
  id: string;
  ruleId: string;
  ruleName: string;
  status: "OK" | "FAILED";
  detail: string | null;
  cardId: string | null;
  cardTitle: string | null;
  createdAt: Date;
};

export type KanbanDryRunMatch = { cardId: string; cardNo: number | null; title: string; actions: string[] };
export type KanbanDryRunResult = { matched: KanbanDryRunMatch[]; total: number };

/** ชื่อที่ใช้แปลงกฎเป็นประโยคไทย (id → ชื่อที่คนอ่าน) */
export type KanbanRuleNames = {
  columns?: Record<string, string>;
  labels?: Record<string, string>;
  users?: Record<string, string>;
  fields?: Record<string, string>;
};

/** รูปกฎเท่าที่ `describeRule` ต้องใช้ — รับแถว `AutomationRule` ของ prisma ได้ตรง ๆ */
export type KanbanRuleLike = {
  name: string;
  kind: string;
  event?: string | null;
  conditions?: unknown;
  actions?: unknown;
  scheduleCron?: string | null;
  dueOffsetDays?: number | null;
};

function limitError(message: string): Error {
  const err = new Error(message);
  (err as Error & { code?: string }).code = "LIMIT_REACHED";
  return err;
}

// ═══════════════════════════ cron subset (เวลาไทย) ═══════════════════════════

export type KanbanCronSpec = { minute: number; hour: number; weekdays: number[] | null };

/**
 * รับ subset ของ cron เท่านั้น: `"นาที ชั่วโมง * * วัน"`
 * นาที 0–59 · ชั่วโมง 0–23 · วันของเดือน/เดือน ต้องเป็น `*` · วัน `*` หรือรายการ 0–6 คั่นด้วย `,`
 * 🔴 `*` ในช่องนาที/ชั่วโมง = "ทุกนาที/ทุกชั่วโมง" ซึ่งกฎของบอร์ดไม่รองรับ (cron ของเราเดินรายชั่วโมง
 *    และกฎที่วิ่งทุกชั่วโมงคือใบเรียกเก็บเงิน) → throw ไทยตรง ๆ ไม่ปล่อยให้บันทึกแล้วเงียบ
 */
export function parseKanbanCron(raw: string): KanbanCronSpec {
  const parts = (raw ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length !== 5) {
    throw new Error('รูปแบบเวลาไม่ถูกต้อง — ต้องเป็น "นาที ชั่วโมง * * วัน" เช่น "0 8 * * 3" (ทุกวันพุธ 08:00)');
  }
  const [minuteRaw, hourRaw, domRaw, monthRaw, dowRaw] = parts as [string, string, string, string, string];
  const minute = Number(minuteRaw);
  const hour = Number(hourRaw);
  if (!/^\d+$/.test(minuteRaw) || !Number.isInteger(minute) || minute < 0 || minute > 59) {
    throw new Error("ระบุนาทีเป็นตัวเลข 0–59 (ตั้งเวลาแบบทุกนาทีไม่ได้)");
  }
  if (!/^\d+$/.test(hourRaw) || !Number.isInteger(hour) || hour < 0 || hour > 23) {
    throw new Error("ระบุชั่วโมงเป็นตัวเลข 0–23 ตามเวลาไทย (ตั้งเวลาแบบทุกชั่วโมงไม่ได้)");
  }
  if (domRaw !== "*" || monthRaw !== "*") {
    throw new Error('ช่องวันที่ของเดือนและเดือนต้องเป็น "*" — เลือกวันของสัปดาห์ในช่องสุดท้ายแทน');
  }
  if (dowRaw === "*") return { minute, hour, weekdays: null };
  const weekdays = dowRaw.split(",").map((s) => Number(s.trim()));
  if (weekdays.length === 0 || weekdays.some((n) => !Number.isInteger(n) || n < 0 || n > 6)) {
    throw new Error("ระบุวันของสัปดาห์เป็นตัวเลข 0–6 (0 = อาทิตย์) คั่นด้วยเครื่องหมายจุลภาค");
  }
  return { minute, hour, weekdays: [...new Set(weekdays)].sort((a, b) => a - b) };
}

/** cron ตรงกับ "ชั่วโมงไทย" ของ `now` ไหม (กวาดรายชั่วโมง ⇒ ดูชั่วโมง+วัน ไม่ดูนาที) */
function cronMatchesBkkHour(spec: KanbanCronSpec, now: Date): boolean {
  const p = bkk(now);
  if (p.hour !== spec.hour) return false;
  return spec.weekdays === null || spec.weekdays.includes(p.weekday);
}

// ═══════════════════════════ สิทธิ์ ═══════════════════════════

/** ชั้นที่ 1 ของหน้ากฎอัตโนมัติ: OWNER (โดยนัย) หรือคีย์ `kanban.automation.manage` */
export function canManageAutomation(actor: KanbanActor): boolean {
  if (actor.role === "OWNER") return true;
  return actor.permissions["kanban.automation.manage"] === true;
}

/**
 * ด่านของทุก mutation ในหน้านี้ = (คีย์ automation) **และ** ADMIN ของบอร์ดใบนั้น
 * 🔴 สองชั้นจริง ๆ: ผู้จัดการที่เจ้าของติ๊กคีย์ให้ ยังตั้งกฎบนบอร์ดที่ตัวเองเป็นแค่ผู้ดูไม่ได้
 *    (กฎอัตโนมัติเขียนของลงบอร์ดได้ทุกอย่าง — ให้สิทธิ์กว้างกว่าที่คนคนนั้นทำมือได้ไม่ได้)
 */
async function assertRuleAdmin(ctx: KanbanCtx, actor: KanbanActor, boardId: string): Promise<{ boardName: string }> {
  const { board } = await assertBoardRole({ ...ctx, actor }, boardId, "ADMIN");
  if (!canManageAutomation(actor)) {
    throw new KanbanForbiddenError("ต้องมีสิทธิ์ “ตั้งกฎอัตโนมัติของบอร์ด” ถึงจะจัดการกฎได้");
  }
  return { boardName: board.name };
}

// ═══════════════════════════ ตรวจ input ═══════════════════════════

function parseRuleInput(raw: unknown): KanbanRuleInput {
  // เพดานการกระทำตรวจ **ก่อน** zod เพื่อให้ได้ error ที่มี `code = LIMIT_REACHED` (ไม่ใช่ข้อความรวมของ zod)
  const actionsRaw = (raw as { actions?: unknown } | null)?.actions;
  if (Array.isArray(actionsRaw) && actionsRaw.length > KANBAN_LIMITS.actionsPerRule) {
    throw limitError(`กฎเดียวมีการกระทำได้สูงสุด ${KANBAN_LIMITS.actionsPerRule} อย่าง — ตอนนี้ใส่มา ${actionsRaw.length} อย่าง`);
  }
  const parsed = RuleInputSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error("รูปแบบกฎไม่ถูกต้อง — ตรวจเงื่อนไขและการกระทำที่เลือกอีกครั้ง");
  }
  const input = parsed.data;
  if (input.actions.length === 0) throw new Error("ต้องเลือกอย่างน้อย 1 การกระทำก่อนจึงบันทึกกฎได้");
  if (input.kind === "RULE") {
    if (!input.event || !KANBAN_AUTOMATION_EVENTS.some((e) => e.value === input.event)) {
      throw new Error("ต้องเลือกเหตุการณ์ของบอร์ดงานที่จะให้กฎนี้ทำงาน");
    }
  }
  if (input.kind === "SCHEDULED") {
    if (!input.scheduleCron) throw new Error("กฎแบบตั้งเวลาต้องระบุเวลาที่จะให้ทำงาน");
    parseKanbanCron(input.scheduleCron); // ผิดรูป → throw ไทยจากตัวมันเอง
  }
  if (input.kind === "DUE_DATE" && input.dueOffsetDays === undefined) {
    throw new Error("กฎแบบตามวันครบกำหนดต้องระบุจำนวนวันก่อน/หลังกำหนดส่ง");
  }
  return input;
}

/** id ทุกตัวที่กฎอ้างถึงต้องเป็นของบอร์ดใบนี้/ร้านนี้จริง — ตรวจให้ครบ **ก่อน** เขียนสักแถว */
async function assertRefsBelongToBoard(ctx: KanbanCtx, input: KanbanRuleInput): Promise<void> {
  const conditions = input.conditions ?? [];
  const columnIds = new Set<string>();
  const labelIds = new Set<string>();
  const fieldIds = new Set<string>();
  const userIds = new Set<string>();
  for (const c of conditions) {
    if (c.field === "column") columnIds.add(c.value);
    if (c.field === "label") labelIds.add(c.value);
    if (c.field === "assignee" && c.value) userIds.add(c.value);
    if (c.field === "custom_field") fieldIds.add(c.value.fieldId);
  }
  for (const a of input.actions) {
    if (a.type === "move_column") columnIds.add(a.params.columnId);
    if (a.type === "add_label" || a.type === "remove_label") labelIds.add(a.params.labelId);
    if (a.type === "assign") userIds.add(a.params.userId);
    if (a.type === "notify" && Array.isArray(a.params.to)) for (const u of a.params.to) userIds.add(u);
    if (a.type === "create_card" && a.params.assigneeUserId) userIds.add(a.params.assigneeUserId);
    if (a.type === "webhook" && !/^https:\/\//i.test(a.params.url.trim())) {
      throw new Error("ที่อยู่เว็บฮุคต้องขึ้นต้นด้วย https:// เท่านั้น");
    }
  }

  const scope = { tenantId: ctx.tenantId, systemId: ctx.systemId };
  if (columnIds.size > 0) {
    const rows = await prisma.kanbanColumn.findMany({ where: { id: { in: [...columnIds] }, boardId: input.boardId, ...scope }, select: { id: true } });
    if (rows.length !== columnIds.size) throw new Error("คอลัมน์ที่เลือกไม่ได้อยู่ในบอร์ดนี้");
  }
  if (labelIds.size > 0) {
    const rows = await prisma.kanbanLabel.findMany({ where: { id: { in: [...labelIds] }, boardId: input.boardId, ...scope }, select: { id: true } });
    if (rows.length !== labelIds.size) throw new Error("ป้ายกำกับที่เลือกไม่ได้อยู่ในบอร์ดนี้");
  }
  if (fieldIds.size > 0) {
    const rows = await prisma.kanbanCustomField.findMany({ where: { id: { in: [...fieldIds] }, boardId: input.boardId, tenantId: ctx.tenantId }, select: { id: true } });
    if (rows.length !== fieldIds.size) throw new Error("ฟิลด์กำหนดเองที่เลือกไม่ได้อยู่ในบอร์ดนี้");
  }
  if (userIds.size > 0) {
    const rows = await prisma.membership.findMany({ where: { tenantId: ctx.tenantId, userId: { in: [...userIds] }, acceptedAt: { not: null } }, select: { userId: true } });
    if (rows.length !== userIds.size) throw new Error("เลือกได้เฉพาะพนักงานในร้านนี้");
  }
  for (const a of input.actions) {
    if (a.type !== "create_card") continue;
    const target = await prisma.kanbanBoard.findFirst({ where: { id: a.params.boardId, ...scope, status: "ACTIVE" }, select: { id: true } });
    if (!target) throw new Error("บอร์ดปลายทางของการสร้างการ์ดไม่ถูกต้อง");
    if (a.params.columnId) {
      const col = await prisma.kanbanColumn.findFirst({ where: { id: a.params.columnId, boardId: a.params.boardId, ...scope, status: "ACTIVE" }, select: { id: true } });
      if (!col) throw new Error("คอลัมน์ปลายทางของการสร้างการ์ดไม่ถูกต้อง");
    }
  }
}

// ═══════════════════════════ ประโยคไทย (pure) ═══════════════════════════

const EVENT_PHRASE: Record<string, string> = {
  "kanban.card.created": "มีการ์ดใหม่",
  "kanban.card.moved": "การ์ดถูกย้ายคอลัมน์",
  "kanban.card.assigned": "มอบหมายงาน",
  "kanban.card.completed": "งานเสร็จ",
  "kanban.card.due_soon": "ใกล้ถึงกำหนดส่ง",
  "kanban.card.overdue": "เลยกำหนดส่ง",
  "kanban.checklist.completed": "เช็คลิสต์ครบทุกข้อ",
  "kanban.comment.added": "มีความเห็นใหม่ในการ์ด",
};

const CF_OP_TH: Record<string, string> = { eq: "เท่ากับ", neq: "ไม่เท่ากับ", gt: "มากกว่า", lt: "น้อยกว่า", contains: "มีคำว่า" };

const q = (s: string) => `“${s}”`;
const nameOf = (dict: Record<string, string> | undefined, id: string, fallback: string) => dict?.[id] ?? fallback;

/** อ่าน Json ที่เก็บไว้กลับมาเป็นเงื่อนไข/การกระทำ — เจอของเสียก็ข้ามใบนั้น ไม่ทำให้ทั้งหน้าล้ม */
export function readConditions(raw: unknown): KanbanRuleCondition[] {
  if (!Array.isArray(raw)) return [];
  const out: KanbanRuleCondition[] = [];
  for (const item of raw) {
    const p = ConditionSchema.safeParse(item);
    if (p.success) out.push(p.data);
  }
  return out;
}

export function readActions(raw: unknown): KanbanRuleAction[] {
  if (!Array.isArray(raw)) return [];
  const out: KanbanRuleAction[] = [];
  for (const item of raw) {
    const p = ActionSchema.safeParse(item);
    if (p.success) out.push(p.data);
  }
  return out;
}

/** เงื่อนไข 1 ข้อ → วลีไทย */
export function describeCondition(c: KanbanRuleCondition, names: KanbanRuleNames = {}): string {
  switch (c.field) {
    case "column":
      return `การ์ด${c.op === "is_not" ? "ไม่ได้" : ""}อยู่ในคอลัมน์ ${q(nameOf(names.columns, c.value, "ที่เลือก"))}`;
    case "label":
      return `การ์ด${c.op === "not_has" ? "ไม่" : ""}มีป้ายกำกับ ${q(nameOf(names.labels, c.value, "ที่เลือก"))}`;
    case "assignee":
      return c.op === "is_empty"
        ? "การ์ดยังไม่มีผู้รับผิดชอบ"
        : `ผู้รับผิดชอบคือ ${nameOf(names.users, c.value ?? "", "คนที่เลือก")}`;
    case "due":
      if (c.op === "overdue") return "การ์ดเลยกำหนดส่งแล้ว";
      if (c.op === "none") return "การ์ดยังไม่มีกำหนดส่ง";
      return `ครบกำหนดภายใน ${c.value ?? 0} วัน`;
    case "source":
      return `การ์ดมาจาก${SOURCE_TH[c.value] ?? c.value}`;
    case "custom_field":
      return `ฟิลด์ ${q(nameOf(names.fields, c.value.fieldId, "ที่เลือก"))} ${CF_OP_TH[c.op] ?? c.op} ${String(c.value.value)}`;
  }
}

/** การกระทำ 1 อย่าง → วลีไทย (ใช้ทั้งประโยคของกฎ และรายการผลทดลองรัน) */
export function describeAction(a: KanbanRuleAction, names: KanbanRuleNames = {}): string {
  switch (a.type) {
    case "move_column":
      return `ย้ายไปคอลัมน์ ${q(nameOf(names.columns, a.params.columnId, "ที่เลือก"))}`;
    case "add_label":
      return `ติดป้าย ${q(nameOf(names.labels, a.params.labelId, "ที่เลือก"))}`;
    case "remove_label":
      return `ปลดป้าย ${q(nameOf(names.labels, a.params.labelId, "ที่เลือก"))}`;
    case "assign":
      return `มอบหมายให้ ${nameOf(names.users, a.params.userId, "คนที่เลือก")}`;
    case "unassign_all":
      return "ปลดผู้รับผิดชอบทั้งหมด";
    case "set_due": {
      const n = a.params.offsetDays;
      if (n === 0) return "ตั้งกำหนดส่งเป็นวันนี้";
      return n > 0 ? `ตั้งกำหนดส่งเป็นอีก ${n} วัน` : `ตั้งกำหนดส่งย้อนไป ${Math.abs(n)} วัน`;
    }
    case "add_checklist":
      if (a.params.templateId) return "เพิ่มเช็คลิสต์จากเทมเพลตการ์ด";
      return `เพิ่มเช็คลิสต์ ${q(a.params.title ?? "ขั้นตอนงาน")} (${a.params.items?.length ?? 0} ข้อ)`;
    case "archive":
      return "เก็บการ์ดเข้าคลัง";
    case "comment":
      return `เขียนความเห็น ${q(a.params.text)}`;
    case "notify": {
      const to = a.params.to;
      const who = Array.isArray(to)
        ? to.map((u) => nameOf(names.users, u, "คนที่เลือก")).join(" และ ")
        : to === "assignees"
          ? "ผู้รับผิดชอบ"
          : to === "admins"
            ? "ผู้ดูแลบอร์ด"
            : "ผู้สร้างการ์ด";
      return `แจ้งเตือน${who} ${q(a.params.message)}`;
    }
    case "open_approval":
      return "เปิดคำขออนุมัติ แล้วผูกกลับมาที่การ์ด";
    case "create_card":
      return `สร้างการ์ด ${q(a.params.title)}`;
    case "webhook":
      return `ยิงเว็บฮุคไป ${a.params.url}`;
  }
}

/** ป้ายไทยของชนิดการกระทำ (ใช้ในข้อความ AutomationRun ที่ล้ม) */
function actionKindLabel(a: KanbanRuleAction): string {
  const s = describeAction(a);
  return s.split(" ")[0] ?? a.type;
}

/**
 * กฎ 1 ใบ → ประโยคไทยเต็ม (**pure** — ไม่แตะ DB · client เรียกได้)
 * "เมื่อ… และถ้า… ให้ทำ … และ …" · ไม่มี event code ในประโยค (ผู้ใช้ไม่ต้องรู้จัก `kanban.card.moved`)
 */
export function describeRule(rule: KanbanRuleLike, names: KanbanRuleNames = {}): string {
  const conditions = readConditions(rule.conditions);
  const actions = readActions(rule.actions);
  const kind = rule.kind;

  let when = "";
  let rest = conditions;
  if (kind === "RULE") {
    const phrase = EVENT_PHRASE[rule.event ?? ""] ?? "มีเหตุการณ์ในบอร์ดนี้";
    // คอลัมน์ของ event "ย้ายเข้า" อ่านรวมในประโยคเดียวเหมือนภาพ 08 (เมื่อ[ย้ายเข้าคอลัมน์][รอตรวจ][ในบอร์ดนี้])
    const hoist = rule.event === "kanban.card.moved" ? conditions.find((c) => c.field === "column" && c.op === "is") : undefined;
    if (hoist && hoist.field === "column") {
      when = `เมื่อการ์ดถูกย้ายเข้าคอลัมน์ ${q(nameOf(names.columns, hoist.value, "ที่เลือก"))} ในบอร์ดนี้`;
      rest = conditions.filter((c) => c !== hoist);
    } else {
      when = `เมื่อ${phrase} ในบอร์ดนี้`;
    }
  } else if (kind === "CARD_BUTTON") {
    when = `เมื่อกดปุ่ม ${q(rule.name)} บนการ์ด`;
  } else if (kind === "BOARD_BUTTON") {
    when = `เมื่อกดปุ่ม ${q(rule.name)} บนบอร์ด`;
  } else if (kind === "SCHEDULED") {
    when = describeCron(rule.scheduleCron ?? "");
  } else {
    const n = rule.dueOffsetDays ?? 0;
    when = n === 0 ? "วันครบกำหนดของการ์ด" : n < 0 ? `${Math.abs(n)} วันก่อนครบกำหนด` : `${n} วันหลังครบกำหนด`;
  }

  const ifs = rest.length > 0 ? ` และถ้า${rest.map((c) => describeCondition(c, names)).join(" และ ")}` : "";
  const then = actions.length > 0 ? actions.map((a) => describeAction(a, names)).join(" และ ") : "ยังไม่ได้เลือกการกระทำ";
  return `${when}${ifs} ให้ทำ ${then}`;
}

/** cron subset → ประโยคไทย ("ทุกวันพุธ 08:00") — cron เสียก็คืนข้อความกลาง ๆ ไม่ throw */
export function describeCron(raw: string): string {
  let spec: KanbanCronSpec;
  try {
    spec = parseKanbanCron(raw);
  } catch {
    return "ตามเวลาที่ตั้งไว้";
  }
  const time = `${String(spec.hour).padStart(2, "0")}:${String(spec.minute).padStart(2, "0")}`;
  if (spec.weekdays === null) return `ทุกวัน ${time}`;
  return `ทุกวัน${spec.weekdays.map((d) => DOW_TH[d] ?? "").join(" และ ")} ${time}`;
}

// ═══════════════════════════ โหลดชื่อของบอร์ด (สำหรับประโยค) ═══════════════════════════

async function loadNames(ctx: KanbanCtx, boardId: string): Promise<KanbanRuleNames> {
  const [columns, labels, fields, members] = await Promise.all([
    prisma.kanbanColumn.findMany({ where: { boardId, tenantId: ctx.tenantId }, select: { id: true, name: true } }),
    prisma.kanbanLabel.findMany({ where: { boardId, tenantId: ctx.tenantId }, select: { id: true, name: true } }),
    prisma.kanbanCustomField.findMany({ where: { boardId, tenantId: ctx.tenantId }, select: { id: true, name: true } }),
    prisma.membership.findMany({ where: { tenantId: ctx.tenantId }, select: { userId: true, user: { select: { name: true, email: true } } } }),
  ]);
  const dict = (rows: { id: string; name: string }[]) => Object.fromEntries(rows.map((r) => [r.id, r.name]));
  return {
    columns: dict(columns),
    labels: dict(labels),
    fields: dict(fields),
    users: Object.fromEntries(members.map((m) => [m.userId, m.user.name ?? m.user.email ?? "พนักงาน"])),
  };
}

// ═══════════════════════════ CRUD ═══════════════════════════

async function requireRule(ctx: KanbanCtx, ruleId: string): Promise<AutomationRule & { boardId: string }> {
  const row = await prisma.automationRule.findFirst({ where: { id: ruleId, tenantId: ctx.tenantId } });
  if (!row || !row.boardId) throw new KanbanNotFoundError("ไม่พบกฎอัตโนมัตินี้");
  return row as AutomationRule & { boardId: string };
}

const asJson = (v: unknown): Prisma.InputJsonValue => v as Prisma.InputJsonValue;

export async function createRule(ctx: KanbanCtx, actor: KanbanActor, raw: unknown): Promise<AutomationRule> {
  const input = parseRuleInput(raw);
  await assertRuleAdmin(ctx, actor, input.boardId);
  await assertRefsBelongToBoard(ctx, input);
  return prisma.automationRule.create({
    data: {
      tenantId: ctx.tenantId,
      systemId: ctx.systemId,
      boardId: input.boardId,
      name: input.name.trim(),
      kind: input.kind,
      // กฎที่ไม่ได้ผูก event (ปุ่ม/ตั้งเวลา/วันครบกำหนด) เก็บ "" — ช่องนี้ NOT NULL มาแต่เดิม
      event: input.kind === "RULE" ? (input.event ?? "") : "",
      conditions: asJson(input.conditions ?? []),
      actions: asJson(input.actions),
      scheduleCron: input.scheduleCron ?? null,
      dueOffsetDays: input.dueOffsetDays ?? null,
      // placeholder ของเอนจินเดิม (§4.5) — เอนจินบอร์ดอ่าน `actions` เท่านั้น
      actionType: "NOTIFY",
      actionConfig: {},
      enabled: true,
    },
  });
}

export async function updateRule(ctx: KanbanCtx, actor: KanbanActor, ruleId: string, patch: unknown): Promise<AutomationRule> {
  const current = await requireRule(ctx, ruleId);
  await assertRuleAdmin(ctx, actor, current.boardId);
  const p = (patch ?? {}) as Record<string, unknown>;
  // แก้บางส่วนได้ แต่ต้องผ่านด่านตรวจ **ทั้งใบ** เหมือนตอนสร้าง (กฎครึ่งใบที่ไม่ถูกต้องห้ามมีอยู่จริง)
  const merged = {
    boardId: current.boardId,
    name: typeof p.name === "string" ? p.name : current.name,
    kind: typeof p.kind === "string" ? p.kind : current.kind,
    event: "event" in p ? p.event : current.event || undefined,
    scheduleCron: "scheduleCron" in p ? p.scheduleCron : (current.scheduleCron ?? undefined),
    dueOffsetDays: "dueOffsetDays" in p ? p.dueOffsetDays : (current.dueOffsetDays ?? undefined),
    conditions: "conditions" in p ? p.conditions : readConditions(current.conditions),
    actions: "actions" in p ? p.actions : readActions(current.actions),
  };
  const input = parseRuleInput(merged);
  await assertRefsBelongToBoard(ctx, input);
  return prisma.automationRule.update({
    where: { id: current.id },
    data: {
      name: input.name.trim(),
      kind: input.kind,
      event: input.kind === "RULE" ? (input.event ?? "") : "",
      conditions: asJson(input.conditions ?? []),
      actions: asJson(input.actions),
      scheduleCron: input.scheduleCron ?? null,
      dueOffsetDays: input.dueOffsetDays ?? null,
    },
  });
}

export async function toggleRule(ctx: KanbanCtx, actor: KanbanActor, ruleId: string, enabled: boolean): Promise<AutomationRule> {
  const current = await requireRule(ctx, ruleId);
  await assertRuleAdmin(ctx, actor, current.boardId);
  return prisma.automationRule.update({ where: { id: current.id }, data: { enabled } });
}

/** ลบกฎถาวร — `AutomationRun` เก่ายังอยู่ (ประวัติว่าเคยมีอะไรเกิดขึ้นบนบอร์ดห้ามหายไปกับกฎ) */
export async function deleteRule(ctx: KanbanCtx, actor: KanbanActor, ruleId: string): Promise<void> {
  const current = await requireRule(ctx, ruleId);
  await assertRuleAdmin(ctx, actor, current.boardId);
  await prisma.automationRule.delete({ where: { id: current.id } });
}

/** รายการกฎของบอร์ด (VIEWER+ อ่านได้ — เห็นว่าอะไรทำงานอยู่เบื้องหลังการ์ดของตัวเอง) */
export async function listRules(ctx: KanbanCtx, actor: KanbanActor, boardId: string): Promise<KanbanRuleDto[]> {
  await assertBoardRole({ ...ctx, actor }, boardId, "VIEWER");
  const [rows, names] = await Promise.all([
    prisma.automationRule.findMany({ where: { tenantId: ctx.tenantId, boardId }, orderBy: { createdAt: "asc" } }),
    loadNames(ctx, boardId),
  ]);
  const since = bkkMonthStart(new Date());
  const counts = await prisma.automationRun.groupBy({
    by: ["ruleId"],
    where: { tenantId: ctx.tenantId, boardId, createdAt: { gte: since } },
    _count: { _all: true },
  });
  const byRule = new Map(counts.map((c) => [c.ruleId, c._count._all]));
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    kind: (KANBAN_RULE_KINDS as readonly string[]).includes(r.kind) ? (r.kind as KanbanRuleKind) : "RULE",
    event: r.event || null,
    enabled: r.enabled,
    runsThisMonth: byRule.get(r.id) ?? 0,
    sentence: describeRule(r, names),
    conditions: readConditions(r.conditions),
    actions: readActions(r.actions),
    scheduleCron: r.scheduleCron,
    dueOffsetDays: r.dueOffsetDays,
  }));
}

/** บันทึกการทำงานล่าสุดของบอร์ด (ใหม่ก่อน) — ผู้ดูแลบอร์ดเท่านั้น (detail มี URL ปลายทาง/ข้อความระบบ) */
export async function listRuns(
  ctx: KanbanCtx,
  actor: KanbanActor,
  boardId: string,
  opts?: { take?: number },
): Promise<KanbanRuleRunDto[]> {
  await assertRuleAdmin(ctx, actor, boardId);
  const take = Math.min(Math.max(opts?.take ?? 50, 1), 200);
  const runs = await prisma.automationRun.findMany({
    where: { tenantId: ctx.tenantId, boardId },
    orderBy: { createdAt: "desc" },
    take,
  });
  const ruleIds = [...new Set(runs.map((r) => r.ruleId))];
  const cardIds = [...new Set(runs.map((r) => r.cardId).filter((v): v is string => !!v))];
  const [rules, cards] = await Promise.all([
    ruleIds.length ? prisma.automationRule.findMany({ where: { id: { in: ruleIds } }, select: { id: true, name: true } }) : [],
    cardIds.length ? prisma.kanbanCard.findMany({ where: { id: { in: cardIds } }, select: { id: true, title: true } }) : [],
  ]);
  const ruleName = new Map(rules.map((r) => [r.id, r.name]));
  const cardTitle = new Map(cards.map((c) => [c.id, c.title]));
  return runs.map((r) => ({
    id: r.id,
    ruleId: r.ruleId,
    ruleName: ruleName.get(r.ruleId) ?? "กฎที่ถูกลบไปแล้ว",
    // M3.3 — enum AutomationRunStatus ได้ค่าเพิ่ม (WAITING/HOLDOUT/SKIPPED/CANCELLED ของ journey สมาชิก)
    //   แถวของบอร์ดงานมีแค่ OK/FAILED เสมอ (journey ไม่มี boardId) — แคบชนิดกลับเป็นสัญญาเดิมของ DTO
    status: r.status === "FAILED" ? "FAILED" : "OK",
    detail: r.detail,
    cardId: r.cardId,
    cardTitle: r.cardId ? (cardTitle.get(r.cardId) ?? null) : null,
    createdAt: r.createdAt,
  }));
}

/** โควตาของบอร์ดในเดือนไทยนี้ */
export async function usageThisMonth(ctx: KanbanCtx, boardId: string, now: Date = new Date()): Promise<{ used: number; limit: number }> {
  const used = await prisma.automationRun.count({
    where: { tenantId: ctx.tenantId, boardId, createdAt: { gte: bkkMonthStart(now) } },
  });
  return { used, limit: KANBAN_LIMITS.automationRunsPerMonth };
}

// ═══════════════════════════ การ์ดสำหรับประเมินเงื่อนไข ═══════════════════════════

type FieldValue = { text: string | null; number: number | null; date: Date | null; bool: boolean | null; option: string | null };

type RuleCard = {
  id: string;
  cardNo: number | null;
  title: string;
  boardId: string;
  columnId: string;
  dueAt: Date | null;
  completedAt: Date | null;
  sourceType: string;
  createdById: string | null;
  labelIds: string[];
  assigneeIds: string[];
  fields: Map<string, FieldValue>;
};

const CARD_SELECT = {
  id: true,
  cardNo: true,
  title: true,
  boardId: true,
  columnId: true,
  dueAt: true,
  completedAt: true,
  sourceType: true,
  createdById: true,
} as const;

type CardRow = {
  id: string;
  cardNo: number | null;
  title: string;
  boardId: string;
  columnId: string;
  dueAt: Date | null;
  completedAt: Date | null;
  sourceType: string;
  createdById: string | null;
};

async function hydrateCards(tenantId: string, rows: CardRow[]): Promise<RuleCard[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const [labels, assignees, values] = await Promise.all([
    prisma.kanbanCardLabel.findMany({ where: { cardId: { in: ids }, tenantId }, select: { cardId: true, labelId: true } }),
    prisma.kanbanCardAssignee.findMany({ where: { cardId: { in: ids }, tenantId }, select: { cardId: true, userId: true } }),
    prisma.kanbanCustomFieldValue.findMany({ where: { cardId: { in: ids }, tenantId } }),
  ]);
  const group = (list: { cardId: string; value: string }[]): Map<string, string[]> => {
    const m = new Map<string, string[]>();
    for (const row of list) m.set(row.cardId, [...(m.get(row.cardId) ?? []), row.value]);
    return m;
  };
  const labelMap = group(labels.map((r) => ({ cardId: r.cardId, value: r.labelId })));
  const assigneeMap = group(assignees.map((r) => ({ cardId: r.cardId, value: r.userId })));
  const fieldMap = new Map<string, Map<string, FieldValue>>();
  for (const v of values) {
    const m = fieldMap.get(v.cardId) ?? new Map<string, FieldValue>();
    m.set(v.fieldId, {
      text: v.valueText,
      number: v.valueNumber === null ? null : Number(v.valueNumber),
      date: v.valueDate,
      bool: v.valueBool,
      option: v.valueOption,
    });
    fieldMap.set(v.cardId, m);
  }
  return rows.map((r) => ({
    ...r,
    labelIds: labelMap.get(r.id) ?? [],
    assigneeIds: assigneeMap.get(r.id) ?? [],
    fields: fieldMap.get(r.id) ?? new Map<string, FieldValue>(),
  }));
}

async function loadRuleCard(tenantId: string, cardId: string): Promise<RuleCard | null> {
  const row = await prisma.kanbanCard.findFirst({ where: { id: cardId, tenantId, status: "ACTIVE" }, select: CARD_SELECT });
  if (!row) return null;
  const [card] = await hydrateCards(tenantId, [row]);
  return card ?? null;
}

function fieldMatches(fv: FieldValue | undefined, op: string, want: string | number | boolean): boolean {
  if (!fv) return false;
  const actual: string | number | boolean | null =
    fv.number !== null ? fv.number : fv.bool !== null ? fv.bool : (fv.option ?? fv.text ?? (fv.date ? fv.date.toISOString() : null));
  if (actual === null) return false;
  if (op === "contains") return String(actual).includes(String(want));
  if (op === "eq") return String(actual) === String(want);
  if (op === "neq") return String(actual) !== String(want);
  const a = Number(actual);
  const b = Number(want);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  return op === "gt" ? a > b : a < b;
}

/** เงื่อนไขทั้งชุดเป็น AND — ชุดว่าง = ตรงเสมอ */
export function matchesConditions(card: RuleCard, conditions: KanbanRuleCondition[], now: Date): boolean {
  for (const c of conditions) {
    switch (c.field) {
      case "column":
        if ((card.columnId === c.value) !== (c.op === "is")) return false;
        break;
      case "label":
        if (card.labelIds.includes(c.value) !== (c.op === "has")) return false;
        break;
      case "assignee":
        if (c.op === "is_empty") {
          if (card.assigneeIds.length > 0) return false;
        } else if (!c.value || !card.assigneeIds.includes(c.value)) return false;
        break;
      case "due":
        if (c.op === "none") {
          if (card.dueAt) return false;
        } else if (c.op === "overdue") {
          if (!card.dueAt || card.dueAt.getTime() >= now.getTime() || card.completedAt) return false;
        } else if (!card.dueAt || card.dueAt.getTime() > now.getTime() + (c.value ?? 0) * DAY_MS) return false;
        break;
      case "source":
        if (card.sourceType !== c.value) return false;
        break;
      case "custom_field":
        if (!fieldMatches(card.fields.get(c.value.fieldId), c.op, c.value.value)) return false;
        break;
    }
  }
  return true;
}

// ═══════════════════════════ ลงมือทำ (actions) ═══════════════════════════

/**
 * ผู้เรียกที่ "ไม่ใช่คน" ของกฎอัตโนมัติ — ดูหัวไฟล์ว่าทำไมถึงใช้ `apiRole`
 * `userId` ว่างโดยตั้งใจ: ไม่มีคนไหนเป็นเจ้าของการกระทำนี้ (ประวัติจึงขึ้นว่าระบบทำ)
 */
const SYSTEM_ACTOR: KanbanActor = { userId: "", role: "OWNER", unitAccess: ["*"], permissions: {}, apiRole: "ADMIN" };

export type AutomationDepsK = { post?: (url: string, body: unknown) => Promise<void> };

async function postWebhook(url: string, body: unknown): Promise<void> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 5000);
  try {
    const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: ctrl.signal });
    if (!res.ok) throw new Error(`ปลายทางตอบรหัส ${res.status}`);
  } finally {
    clearTimeout(timer);
  }
}

type RunScope = {
  tenantId: string;
  systemId: string;
  boardId: string;
  boardName: string;
  ruleId: string;
  ruleName: string;
  /** null = กฎทำเอง (ประวัติขึ้นว่าระบบทำ) · มีค่า = คนกดปุ่ม */
  actorUserId: string | null;
  actor: KanbanActor;
};

function scopeCtx(scope: RunScope): KanbanCtx {
  return {
    tenantId: scope.tenantId,
    systemId: scope.systemId,
    actorUserId: scope.actorUserId,
    actor: scope.actor,
    automation: { ruleId: scope.ruleId },
  };
}

/** แทนค่าตัวแปรในข้อความแจ้งเตือน/ความเห็น */
async function fillTemplate(text: string, scope: RunScope, card: RuleCard | null): Promise<string> {
  if (!card) return text.replaceAll("{บอร์ด}", scope.boardName);
  const col = await prisma.kanbanColumn.findFirst({ where: { id: card.columnId }, select: { name: true } });
  return text
    .replaceAll("{ชื่อการ์ด}", card.title)
    .replaceAll("{บอร์ด}", scope.boardName)
    .replaceAll("{คอลัมน์}", col?.name ?? "")
    .replaceAll("{เลขการ์ด}", card.cardNo === null ? "" : `#${card.cardNo}`);
}

async function boardAdminUserIds(scope: RunScope): Promise<string[]> {
  const [members, owners] = await Promise.all([
    prisma.kanbanBoardMember.findMany({ where: { boardId: scope.boardId, tenantId: scope.tenantId, role: "ADMIN" }, select: { userId: true } }),
    prisma.membership.findMany({ where: { tenantId: scope.tenantId, role: "OWNER", acceptedAt: { not: null } }, select: { userId: true } }),
  ]);
  return [...new Set([...members.map((m) => m.userId), ...owners.map((m) => m.userId)])];
}

/** เจ้าของร้าน (ใช้เป็นผู้ยื่นคำขออนุมัติ/ผู้เขียนความเห็นเมื่อไม่รู้ว่าใครสร้างการ์ด) */
async function fallbackOwnerId(tenantId: string): Promise<string | null> {
  const m = await prisma.membership.findFirst({ where: { tenantId, role: "OWNER", acceptedAt: { not: null } }, select: { userId: true }, orderBy: { createdAt: "asc" } });
  return m?.userId ?? null;
}

/**
 * เขียนความเห็นในนามของกฎ
 * 🔴 ทำไมไม่เรียก `comments.addComment`: `KanbanComment.authorUserId` เป็น NOT NULL และตัวนั้นบังคับว่า
 *    ผู้เขียนต้องเป็นคนที่ล็อกอินอยู่ (EDITOR ของบอร์ด) — กฎอัตโนมัติไม่มีคน ⇒ เขียนแถวตรงที่นี่
 *    โดยลงชื่อผู้สร้างการ์ด (ตกไปที่เจ้าของร้าน) และบันทึกประวัติเป็น "ระบบทำ" + `data.automation`
 *    (ไม่ยิง outbox `kanban.comment.added` โดยตั้งใจ — ไม่งั้นกฎที่ฟัง "มีความเห็นใหม่" จะวนใส่ตัวเอง)
 */
async function writeAutomationComment(scope: RunScope, card: RuleCard, body: string): Promise<void> {
  const authorUserId = scope.actorUserId ?? card.createdById ?? (await fallbackOwnerId(scope.tenantId));
  if (!authorUserId) throw new Error("ร้านนี้ยังไม่มีเจ้าของที่จะลงชื่อความเห็นอัตโนมัติได้");
  await prisma.$transaction(async (tx) => {
    // K2.12: ลงชื่อว่ากฎเขียนความเห็นนี้ (ไม่ใช่คน) — `authorUserId` ยังเก็บไว้เป็นผู้รับผิดชอบ audit เดิม
    // (ผู้สร้างการ์ด/เจ้าของร้าน) แต่จอต้องแสดงชิป "โดยกฎอัตโนมัติ" แทนชื่อคนเมื่อฟิลด์นี้ไม่ null
    const row = await tx.kanbanComment.create({
      data: { tenantId: scope.tenantId, cardId: card.id, authorUserId, body, mentions: [], automationRuleId: scope.ruleId },
    });
    await logActivity(tx, {
      tenantId: scope.tenantId,
      boardId: scope.boardId,
      cardId: card.id,
      actorUserId: scope.actorUserId,
      type: "COMMENT_ADDED",
      data: { commentId: row.id },
      automation: { ruleId: scope.ruleId },
    });
  });
}

async function firstActiveColumnId(tenantId: string, systemId: string, boardId: string): Promise<string | null> {
  const col = await prisma.kanbanColumn.findFirst({
    where: { boardId, tenantId, systemId, status: "ACTIVE" },
    orderBy: [{ position: { sort: "asc", nulls: "first" } }, { sortOrder: "asc" }, { createdAt: "asc" }],
    select: { id: true },
  });
  return col?.id ?? null;
}

/** ลงมือทำ 1 การกระทำ — ล้มแล้ว throw ข้อความไทย (ผู้เรียกจับไปเขียน AutomationRun FAILED) */
async function runAction(action: KanbanRuleAction, scope: RunScope, card: RuleCard | null, deps?: AutomationDepsK): Promise<void> {
  const ctx = scopeCtx(scope);
  const needCard = (): RuleCard => {
    if (!card) throw new Error("การกระทำนี้ต้องทำกับการ์ด แต่กฎนี้ไม่ได้ผูกกับการ์ดใบไหน");
    return card;
  };

  switch (action.type) {
    case "move_column": {
      const c = needCard();
      const res = await moveCard(ctx, { cardId: c.id, toColumnId: action.params.columnId });
      if (!res.ok) throw new Error(res.message);
      return;
    }
    case "add_label": {
      const c = needCard();
      if (c.labelIds.includes(action.params.labelId)) return;
      await setCardLabels(ctx, c.id, [...c.labelIds, action.params.labelId]);
      c.labelIds = [...c.labelIds, action.params.labelId];
      return;
    }
    case "remove_label": {
      const c = needCard();
      if (!c.labelIds.includes(action.params.labelId)) return;
      const next = c.labelIds.filter((id) => id !== action.params.labelId);
      await setCardLabels(ctx, c.id, next);
      c.labelIds = next;
      return;
    }
    case "assign": {
      const c = needCard();
      if (c.assigneeIds.includes(action.params.userId)) return;
      const next = [...c.assigneeIds, action.params.userId];
      // notify:false — กฎมีการกระทำ `notify` ของตัวเองให้ผู้ตั้งกฎเลือกข้อความเอง (ดู cards.ts)
      await setCardAssignees(ctx, c.id, next, { notify: false });
      c.assigneeIds = next;
      return;
    }
    case "unassign_all": {
      const c = needCard();
      if (c.assigneeIds.length === 0) return;
      await setCardAssignees(ctx, c.id, [], { notify: false });
      c.assigneeIds = [];
      return;
    }
    case "set_due": {
      const c = needCard();
      const base = action.params.keepTime && c.dueAt ? c.dueAt : new Date();
      const dueAt = new Date(base.getTime() + action.params.offsetDays * DAY_MS);
      await updateCardFields(ctx, c.id, { dueAt });
      c.dueAt = dueAt;
      return;
    }
    case "add_checklist": {
      const c = needCard();
      if (action.params.templateId) {
        const tpl = await prisma.kanbanCardTemplate.findFirst({
          where: { id: action.params.templateId, tenantId: scope.tenantId, boardId: scope.boardId },
          select: { checklists: true },
        });
        if (!tpl) throw new Error("ไม่พบเทมเพลตการ์ดที่กฎนี้อ้างถึงในบอร์ดนี้");
        const groups = Array.isArray(tpl.checklists) ? tpl.checklists : [];
        for (const g of groups) {
          const group = g as { title?: unknown; items?: unknown };
          const title = typeof group.title === "string" && group.title.trim() ? group.title : "ขั้นตอนงาน";
          const list = await createChecklist(ctx, c.id, title);
          const items = Array.isArray(group.items) ? group.items : [];
          for (const it of items) {
            const text = typeof it === "string" ? it : typeof (it as { text?: unknown })?.text === "string" ? String((it as { text: string }).text) : "";
            if (text.trim()) await addChecklistItem(ctx, list.id, text);
          }
        }
        return;
      }
      const list = await createChecklist(ctx, c.id, action.params.title ?? "ขั้นตอนงาน");
      for (const text of action.params.items ?? []) await addChecklistItem(ctx, list.id, text);
      return;
    }
    case "archive": {
      const c = needCard();
      await archiveCard(ctx, c.id);
      return;
    }
    case "comment": {
      const c = needCard();
      await writeAutomationComment(scope, c, await fillTemplate(action.params.text, scope, c));
      return;
    }
    case "notify": {
      const to = action.params.to;
      let recipients: string[];
      if (Array.isArray(to)) {
        recipients = to;
      } else if (to === "admins") {
        recipients = await boardAdminUserIds(scope);
      } else if (to === "creator") {
        const creator = needCard().createdById;
        recipients = creator ? [creator] : [];
      } else {
        recipients = needCard().assigneeIds;
      }
      if (recipients.length === 0) return;
      const message = await fillTemplate(action.params.message, scope, card);
      const link = card ? cardLink(scope.systemId, scope.boardId, card.id) : "";
      // K3.9 — กฎเดียวแจ้งหลายคน (ผู้ดูแลบอร์ด/ผู้รับผิดชอบ) ⇒ push รอบเดียว ไม่ใช่ต่อคน
      await notifyKanbanUsers({
        tenantId: scope.tenantId,
        systemId: scope.systemId,
        recipientUserIds: recipients,
        title: scope.ruleName,
        body: link ? `${message} · ดูงาน ${link}` : message,
        ...(card ? { data: { cardId: card.id, boardId: scope.boardId, systemId: scope.systemId } } : {}),
        // คงพฤติกรรมเดิมของกฎ: เขียนใบแจ้งไม่ได้ = การรันกฎรอบนี้ถือว่าล้ม (ผู้ตั้งกฎต้องเห็นในบันทึกการรัน)
        strict: true,
      });
      return;
    }
    case "open_approval": {
      const c = needCard();
      const requestedById = c.createdById ?? (await fallbackOwnerId(scope.tenantId));
      if (!requestedById) throw new Error("ร้านนี้ยังไม่มีผู้ยื่นคำขออนุมัติที่ใช้ได้");
      const res = await submitForApproval(
        { tenantId: scope.tenantId },
        {
          entityType: "kanban.card",
          entityId: c.id,
          systemId: scope.systemId,
          amountSatang: action.params?.amountSatang ?? null,
          requestedById,
        },
      );
      if ("requestId" in res) {
        await writeAutomationComment(scope, c, `รออนุมัติ · ดูคำขอ /app/approvals?id=${res.requestId}`);
      }
      return;
    }
    case "create_card": {
      const columnId = action.params.columnId ?? (await firstActiveColumnId(scope.tenantId, scope.systemId, action.params.boardId));
      if (!columnId) throw new Error("บอร์ดปลายทางไม่มีคอลัมน์ที่ใช้งานได้");
      const created = await createCard({
        tenantId: scope.tenantId,
        systemId: scope.systemId,
        columnId,
        title: await fillTemplate(action.params.title, scope, card),
        assigneeUserId: action.params.assigneeUserId ?? null,
        sourceType: "AUTOMATION",
        sourceId: scope.ruleId,
        createdById: scope.actorUserId,
      });
      if (!created) throw new Error("สร้างการ์ดในบอร์ดปลายทางไม่สำเร็จ (คอลัมน์ถูกเก็บเข้าคลังแล้ว)");
      return;
    }
    case "webhook": {
      const post = deps?.post ?? postWebhook;
      await post(action.params.url, {
        event: "kanban.automation",
        rule: { id: scope.ruleId, name: scope.ruleName },
        card: card ? { id: card.id, cardNo: card.cardNo, boardId: scope.boardId } : null,
      });
      return;
    }
  }
}

/**
 * ลงมือทำทั้งชุดตามลำดับ + บันทึก `AutomationRun` 1 แถวต่อการทำงาน 1 ครั้ง
 * 🔴 D21: การกระทำที่ k ล้ม = **หยุด** (ไม่ทำที่เหลือ · ไม่ลองใหม่อัตโนมัติ) แล้วบันทึก FAILED
 */
async function executeActions(
  scope: RunScope,
  actions: KanbanRuleAction[],
  card: RuleCard | null,
  deps?: AutomationDepsK,
  detailPrefix?: string,
): Promise<"OK" | "FAILED"> {
  const prefix = detailPrefix ? `${detailPrefix} · ` : "";
  for (let i = 0; i < actions.length; i++) {
    const action = actions[i]!;
    try {
      await runAction(action, scope, card, deps);
    } catch (e) {
      const why = e instanceof Error ? e.message : String(e);
      const detail = `${prefix}การกระทำที่ ${i + 1} (${actionKindLabel(action)}): ${why}`.slice(0, 500);
      await prisma.automationRun
        .create({ data: { tenantId: scope.tenantId, ruleId: scope.ruleId, status: "FAILED", detail, boardId: scope.boardId, cardId: card?.id ?? null } })
        .catch(() => {});
      return "FAILED";
    }
  }
  await prisma.automationRun
    .create({ data: { tenantId: scope.tenantId, ruleId: scope.ruleId, status: "OK", detail: detailPrefix ?? null, boardId: scope.boardId, cardId: card?.id ?? null } })
    .catch(() => {});
  return "OK";
}

async function scopeOfRule(rule: AutomationRule & { boardId: string }, actorUserId: string | null, actor: KanbanActor): Promise<RunScope | null> {
  const board = await prisma.kanbanBoard.findFirst({ where: { id: rule.boardId, tenantId: rule.tenantId }, select: { id: true, name: true, systemId: true, status: true } });
  if (!board || board.status !== "ACTIVE") return null;
  return {
    tenantId: rule.tenantId,
    systemId: rule.systemId ?? board.systemId,
    boardId: board.id,
    boardName: board.name,
    ruleId: rule.id,
    ruleName: rule.name,
    actorUserId,
    actor,
  };
}

// ═══════════════════════════ ทดลองรันย้อนหลัง (ไม่เขียน DB เลย) ═══════════════════════════

/**
 * "จะทำอะไรกับใบไหน" ถ้าเปิดกฎนี้ — **ห้ามเขียนอะไรลง DB แม้แต่ `AutomationRun`**
 * (เกณฑ์ตรวจรับ §13 K2.9: นับจำนวนแถวก่อน-หลังต้องเท่ากันเป๊ะทุกตาราง)
 */
export async function dryRun(
  ctx: KanbanCtx,
  actor: KanbanActor,
  raw: unknown,
  opts?: { days?: number; now?: Date },
): Promise<KanbanDryRunResult> {
  const input = parseRuleInput(raw);
  await assertRuleAdmin(ctx, actor, input.boardId);
  await assertRefsBelongToBoard(ctx, input);

  const now = opts?.now ?? new Date();
  const days = Math.min(Math.max(opts?.days ?? 30, 1), 365);
  const names = await loadNames(ctx, input.boardId);
  const actionText = input.actions.map((a) => describeAction(a, names));

  // ปุ่ม/ตั้งเวลา ไม่ได้ผูกกับการ์ดใบไหน — แสดงเฉพาะ "การกระทำที่จะทำ"
  if (input.kind !== "RULE" && input.kind !== "DUE_DATE") return { matched: [], total: 0 };

  const conditions = input.conditions ?? [];
  const base: Prisma.KanbanCardWhereInput = {
    tenantId: ctx.tenantId,
    systemId: ctx.systemId,
    boardId: input.boardId,
    status: "ACTIVE",
  };
  if (input.kind === "DUE_DATE") {
    base.dueAt = { gte: now, lte: new Date(now.getTime() + days * DAY_MS) };
  } else if (input.event === "kanban.card.created") {
    base.createdAt = { gte: new Date(now.getTime() - days * DAY_MS) };
  } else {
    base.updatedAt = { gte: new Date(now.getTime() - days * DAY_MS) };
  }
  // เงื่อนไขที่ผลักลง SQL ได้ (คอลัมน์/ป้าย) — ที่เหลือกรองด้วยตัวประเมินตัวเดียวกับตอนรันจริง
  for (const c of conditions) {
    if (c.field === "column") base.columnId = c.op === "is" ? c.value : { not: c.value };
    if (c.field === "label" && c.op === "has") base.cardLabels = { some: { labelId: c.value } };
  }

  const rows = await prisma.kanbanCard.findMany({ where: base, orderBy: { updatedAt: "desc" }, take: 200, select: CARD_SELECT });
  const cards = await hydrateCards(ctx.tenantId, rows);
  const matched = cards
    .filter((c) => matchesConditions(c, conditions, now))
    .map((c) => ({ cardId: c.id, cardNo: c.cardNo, title: c.title, actions: actionText }));
  return { matched, total: matched.length };
}

// ═══════════════════════════ รันจริงจาก event ═══════════════════════════

const LOOP_GUARD_MS = 60_000;

/** กฎใบเดิม + การ์ดใบเดิม เพิ่งวิ่งไปภายใน 60 วิ = ข้าม (กันกฎ 2 ใบผลักการ์ดกลับไปกลับมาไม่รู้จบ) */
async function ranRecently(ruleId: string, cardId: string, now: Date): Promise<boolean> {
  const recent = await prisma.automationRun.findFirst({
    where: { ruleId, cardId, createdAt: { gte: new Date(now.getTime() - LOOP_GUARD_MS) } },
    select: { id: true },
  });
  return !!recent;
}

/** เกินโควตาเดือนนี้ไหม — เกินแล้วเตือนใน OpsEvent วันละครั้ง (ไม่ใช่ทุกครั้งที่การ์ดขยับ) */
async function overQuota(tenantId: string, boardId: string, boardName: string, now: Date): Promise<boolean> {
  const used = await prisma.automationRun.count({ where: { tenantId, boardId, createdAt: { gte: bkkMonthStart(now) } } });
  if (used < KANBAN_LIMITS.automationRunsPerMonth) return false;
  const dayStart = bkkDayStart(bkk(now).dayIndex);
  const warned = await prisma.opsEvent.findFirst({
    where: { tenantId, source: "kanban.automation", message: { contains: boardId }, createdAt: { gte: dayStart } },
    select: { id: true },
  });
  if (!warned) {
    await logOps("WARN", "kanban.automation", `บอร์ด ${boardName} (${boardId}) ใช้โควตากฎอัตโนมัติครบ ${KANBAN_LIMITS.automationRunsPerMonth} ครั้งของเดือนนี้แล้ว — กฎที่เหลือถูกข้าม`, { tenantId });
  }
  return true;
}

function payloadString(payload: unknown, key: string): string | null {
  if (!payload || typeof payload !== "object") return null;
  const v = (payload as Record<string, unknown>)[key];
  return typeof v === "string" && v ? v : null;
}

/**
 * เอนจินของกฎชนิด RULE — เรียกจาก `src/lib/automation/engine.ts` หลัง consumer ของ event ทำงานเสร็จ
 * คืน = จำนวนกฎที่ "ตรงเงื่อนไขแล้วลงมือ" (สำเร็จหรือล้มก็นับ) · **ห้าม throw**
 */
export async function runForKanbanEvent(
  evt: { tenantId: string; type: string; payload: unknown },
  deps?: AutomationDepsK,
): Promise<number> {
  try {
    const boardId = payloadString(evt.payload, "boardId");
    const cardId = payloadString(evt.payload, "cardId");
    if (!boardId || !cardId) return 0;
    const rules = await prisma.automationRule.findMany({
      where: { tenantId: evt.tenantId, boardId, enabled: true, kind: "RULE", event: evt.type },
      orderBy: { createdAt: "asc" },
      take: 50,
    });
    if (rules.length === 0) return 0;
    const card = await loadRuleCard(evt.tenantId, cardId);
    if (!card || card.boardId !== boardId) return 0;

    const now = new Date();
    let fired = 0;
    for (const rule of rules) {
      if (!rule.boardId) continue;
      const conditions = readConditions(rule.conditions);
      // ไม่ตรงเงื่อนไข = ไม่รัน **และไม่บันทึก** (บันทึกทุกใบที่ไม่ตรง = บันทึกการทำงานอ่านไม่รู้เรื่อง)
      if (!matchesConditions(card, conditions, now)) continue;
      if (await ranRecently(rule.id, card.id, now)) continue;
      const scope = await scopeOfRule(rule as AutomationRule & { boardId: string }, null, SYSTEM_ACTOR);
      if (!scope) continue;
      if (await overQuota(scope.tenantId, scope.boardId, scope.boardName, now)) continue;
      fired++;
      await executeActions(scope, readActions(rule.actions), card, deps);
    }
    return fired;
  } catch (e) {
    await logOps("WARN", "kanban.automation", `กฎอัตโนมัติของบอร์ดล้มทั้งรอบ (${evt.type})`, {
      tenantId: evt.tenantId,
      detail: e instanceof Error ? (e.stack ?? e.message) : String(e),
    }).catch(() => {});
    return 0;
  }
}

// ═══════════════════════════ cron: ตั้งเวลา + ตามวันครบกำหนด ═══════════════════════════

/**
 * กฎ SCHEDULED ที่ถึงชั่วโมงไทยของ `now` → ลงมือทำ 1 ครั้ง (best-effort · เรียกจาก `/api/cron/hourly`)
 * คืน = **จำนวนกฎ** ที่ทำงานในรอบนี้ · กันรันซ้ำในชั่วโมงเดียวกันด้วย `lastRunAt`
 * 🔴 `now` มาจากผู้เรียกเสมอ (ห้าม `new Date()` ที่นี่ — ไม่งั้นทดสอบวันอื่นไม่ได้)
 */
export async function sweepScheduledRules(now: Date): Promise<number> {
  const rules = await prisma.automationRule.findMany({
    where: { enabled: true, kind: "SCHEDULED", boardId: { not: null } },
    orderBy: { createdAt: "asc" },
    take: 500,
  });
  const nowHour = bkk(now).hourIndex;
  let fired = 0;
  for (const rule of rules) {
    if (!rule.boardId || !rule.scheduleCron) continue;
    let spec: KanbanCronSpec;
    try {
      spec = parseKanbanCron(rule.scheduleCron);
    } catch {
      continue; // cron เสีย (ไม่ควรเกิด — ตรวจตอนบันทึกแล้ว) — ข้ามอย่างเงียบ ๆ ไม่ล้มทั้งรอบ
    }
    if (!cronMatchesBkkHour(spec, now)) continue;
    if (rule.lastRunAt && bkk(rule.lastRunAt).hourIndex === nowHour) continue;
    const scope = await scopeOfRule(rule as AutomationRule & { boardId: string }, null, SYSTEM_ACTOR);
    if (!scope) continue;
    if (await overQuota(scope.tenantId, scope.boardId, scope.boardName, now)) continue;
    // ประทับ lastRunAt **ก่อน** ลงมือ: ลงมือแล้วล้มก็ต้องไม่วิ่งซ้ำในชั่วโมงเดียวกัน (D21 ไม่ retry)
    await prisma.automationRule.update({ where: { id: rule.id }, data: { lastRunAt: now } });
    fired++;
    await executeActions(scope, readActions(rule.actions), null, undefined);
  }
  return fired;
}

/**
 * กฎ DUE_DATE — การ์ดที่ (วันไทยของ dueAt) = (วันไทยของ now) − dueOffsetDays
 * คืน = **จำนวนกฎ** ที่มีการ์ดอย่างน้อย 1 ใบทำงานในรอบนี้ (บอร์ดหนึ่งมีการ์ดถึงกำหนดพร้อมกันได้หลายใบ)
 * idempotent ต่อ (กฎ, การ์ด, วันไทย) ผ่าน `AutomationRun.detail` ที่ขึ้นต้น `due:YYYY-MM-DD`
 * 🔴 `now` มาจากผู้เรียกเสมอ
 */
export async function sweepDueDateRules(now: Date): Promise<number> {
  const rules = await prisma.automationRule.findMany({
    where: { enabled: true, kind: "DUE_DATE", boardId: { not: null } },
    orderBy: { createdAt: "asc" },
    take: 500,
  });
  const today = bkk(now).dayIndex;
  const dayKey = `due:${bkkDateStr(today)}`;
  let fired = 0;
  for (const rule of rules) {
    if (!rule.boardId) continue;
    const targetDay = today - (rule.dueOffsetDays ?? 0);
    const rows = await prisma.kanbanCard.findMany({
      where: {
        tenantId: rule.tenantId,
        boardId: rule.boardId,
        status: "ACTIVE",
        completedAt: null,
        dueAt: { gte: bkkDayStart(targetDay), lt: bkkDayStart(targetDay + 1) },
      },
      orderBy: { dueAt: "asc" },
      take: 200,
      select: CARD_SELECT,
    });
    if (rows.length === 0) continue;
    const scope = await scopeOfRule(rule as AutomationRule & { boardId: string }, null, SYSTEM_ACTOR);
    if (!scope) continue;
    const conditions = readConditions(rule.conditions);
    const actions = readActions(rule.actions);
    const cards = await hydrateCards(rule.tenantId, rows);
    let any = false;
    for (const card of cards) {
      if (!matchesConditions(card, conditions, now)) continue;
      const already = await prisma.automationRun.findFirst({
        where: { ruleId: rule.id, cardId: card.id, detail: { startsWith: dayKey } },
        select: { id: true },
      });
      if (already) continue;
      if (await overQuota(scope.tenantId, scope.boardId, scope.boardName, now)) break;
      any = true;
      await executeActions(scope, actions, card, undefined, dayKey);
    }
    if (any) fired++;
  }
  return fired;
}

// ═══════════════════════════ ปุ่ม (CARD_BUTTON / BOARD_BUTTON) ═══════════════════════════

/**
 * กดปุ่มอัตโนมัติ — EDITOR ของบอร์ดขึ้นไป (คนกดเป็น "ผู้ลงมือ" ⇒ ประวัติขึ้นชื่อคนนั้น ไม่ใช่ระบบ)
 * ไม่มีตัวกันวน 60 วิ โดยตั้งใจ: คนกดเองคือเจตนาชัดเจน กดซ้ำต้องได้ผลซ้ำ
 */
export async function runButton(
  ctx: KanbanCtx,
  actor: KanbanActor,
  ruleId: string,
  input?: { cardId?: string },
): Promise<{ ok: true }> {
  const rule = await requireRule(ctx, ruleId);
  if (rule.kind !== "CARD_BUTTON" && rule.kind !== "BOARD_BUTTON") throw new KanbanNotFoundError("กฎนี้ไม่ใช่ปุ่มอัตโนมัติ");
  if (!rule.enabled) throw new Error("ปุ่มนี้ถูกปิดใช้งานอยู่");
  await assertBoardRole({ ...ctx, actor }, rule.boardId, "EDITOR");

  let card: RuleCard | null = null;
  if (rule.kind === "CARD_BUTTON") {
    if (!input?.cardId) throw new Error("ปุ่มบนการ์ดต้องระบุการ์ดที่จะทำ");
    card = await loadRuleCard(ctx.tenantId, input.cardId);
    if (!card || card.boardId !== rule.boardId) throw new KanbanNotFoundError("ไม่พบการ์ดนี้ในบอร์ดของปุ่ม");
  }
  const scope = await scopeOfRule(rule, actor.userId, actor);
  if (!scope) throw new KanbanNotFoundError("ไม่พบบอร์ดของปุ่มนี้");
  if (await overQuota(scope.tenantId, scope.boardId, scope.boardName, new Date())) {
    throw limitError(`บอร์ดนี้ใช้โควตากฎอัตโนมัติครบ ${KANBAN_LIMITS.automationRunsPerMonth} ครั้งของเดือนนี้แล้ว`);
  }
  const status = await executeActions(scope, readActions(rule.actions), card, undefined);
  if (status === "FAILED") {
    const last = await prisma.automationRun.findFirst({ where: { ruleId: rule.id }, orderBy: { createdAt: "desc" }, select: { detail: true } });
    throw new Error(last?.detail ?? "ทำรายการของปุ่มนี้ไม่สำเร็จ");
  }
  return { ok: true };
}

/** ปุ่มของบอร์ด/การ์ดที่ควรแสดงบนจอ (VIEWER อ่านได้ แต่กดต้อง EDITOR — ปุ่มโชว์เฉพาะคนที่กดได้) */
export async function listButtons(
  ctx: KanbanCtx,
  actor: KanbanActor,
  boardId: string,
  kind: "CARD_BUTTON" | "BOARD_BUTTON",
): Promise<{ id: string; name: string }[]> {
  const { role } = await assertBoardRole({ ...ctx, actor }, boardId, "VIEWER");
  if (role === "VIEWER") return [];
  const rows = await prisma.automationRule.findMany({
    where: { tenantId: ctx.tenantId, boardId, kind, enabled: true },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true },
  });
  return rows;
}
