// journeys.ts — journey อัตโนมัติของระบบสมาชิก (M3.3 · พิมพ์เขียว §4.1 §5.9 §7.3 §7.5 §11.6 · ภาพ 07 บน · 22)
//
// ── หน้าที่ของไฟล์นี้ ─────────────────────────────────────────────────────────
//   AutomationRule scope MEMBER_JOURNEY (ไม่มีตาราง Journey ใหม่ — D15) · เอนจินเดินทีละ "คน 1 คน × event 1 ใบ"
//   ด่านตามลำดับตายตัว: กันวน → เข้าซ้ำ → โควตา → เงื่อนไข (engine กลุ่มลูกค้า M3.1) → กลุ่มเทียบ → ลงมือ
//   "รอ n วันแล้วทำต่อ" = แถว AutomationRun สถานะ WAITING + scheduledAt · cron รายชั่วโมงมาเก็บ (runDueWaits)
//
// ── กติกาที่ห้ามหัก ────────────────────────────────────────────────────────────
// 1) **กันวนจบใน SQL คำสั่งเดียว**: unique(ruleId, customerId, eventKey) — event เดิมยิงซ้ำ/พร้อมกันกี่ครั้ง
//    ก็สร้างแถวได้ใบเดียว (อ่านแล้วค่อยเขียน = ยิงพร้อมกัน 2 เครื่องจะผ่านทั้งคู่ · บทเรียนตัวนับร่วม)
// 2) **กลุ่มเทียบห้ามสุ่มสด**: hash(ruleId:customerId) — คนเดิมอยู่กลุ่มเดิมเสมอ (สูตรเดียวกับแคมเปญ M3.2)
// 3) **ทุกการตัดสินใจทิ้งร่องรอย**: ข้าม/กลุ่มเทียบ/ล้ม ต้องมีแถว AutomationRun พร้อมเหตุผลไทย
//    (หน้ารายละเอียด journey คือที่เดียวที่ร้านจะรู้ว่า "ทำไมคนนี้ไม่ได้ของ")
// 4) **ของที่ส่งถึงลูกค้าเคารพความยินยอม ณ เวลาส่ง**: ถอนแล้ว (REVOKED) = ไม่ส่งไม่ว่าตัวส่งจะเป็นอะไร
//    ตัวส่งจริงปริยาย (composition root `src/lib/member-journey-senders.ts`) ส่งเฉพาะ GRANTED
// 5) **ขั้นหนึ่งพังไม่พาทั้งเส้นพัง**: ส่งไม่ถึง/ออกใบไม่ได้ = บันทึกในรายละเอียดของขั้นนั้น แล้วไปขั้นถัดไป
// 6) **ปิด journey = ยกเลิกขั้นที่รออยู่ทันที** (ไม่ใช่รอให้ cron ไปเจอแล้วค่อยข้าม)
//
// ── ทำไมอ่าน PosSale/Appointment/GiftCard/Voucher/OutboxEvent ตรง ────────────────
//   เป็นการ "อ่านอย่างเดียว" เพื่อตอบคำถามระดับชุด (event นี้เป็นของสมาชิกคนไหน · ใครใช้สิทธิ์แล้วบ้าง)
//   precedent เดียวกับ `member/segments.ts` (อ่าน Voucher/PointBalance) · การ "ลงมือ" ทุกอย่าง (ออกใบ/ให้แต้ม)
//   ผ่าน facade ของโมดูลนั้นเท่านั้น (voucher.issue · point.earnWithLot) · ตัวส่งแชท/บอร์ดงานถูกฉีดเข้ามา (deps)

import { Prisma } from "@prisma/client";
import { sha256 } from "@/lib/core/hash";
import { emitOutboxMany } from "@/lib/core/outbox";
import { issue as issueVoucher, VOUCHER_SYSTEM_ACTOR } from "@/lib/modules/voucher";
import { earnWithLot, getBalance, resolvePointSystemIds } from "@/lib/modules/point";
import { prisma } from "./db";
import { canReadMember, hasMemberPerm, type MemberActor } from "./access";
import { MemberForbiddenError, MemberInputError, MemberNotFoundError } from "./errors";
import { MEMBER_LIMITS, memberLimitError } from "./limits";
import { evaluateSegment, listSegmentFields } from "./segments";
import { describeDefinition, parseDefinition, type SegmentDefinition } from "./segments-shared";
import type { MemberCtx } from "./profile";
import { JOURNEY_PRESETS, TIER_AT_LEAST_PREFIX, journeyPreset } from "./journey-presets";
import {
  JOURNEY_ACTION_CHANNEL,
  JOURNEY_ACTION_TYPES,
  JOURNEY_ATTRIBUTION_DAYS,
  JOURNEY_CHANNEL_COST_SATANG,
  JOURNEY_CHANNEL_LABELS,
  JOURNEY_CRON_TRIGGERS,
  JOURNEY_MAX_ACTIONS,
  JOURNEY_MAX_HOLDOUT_PCT,
  JOURNEY_MAX_WAIT_DAYS,
  JOURNEY_MAX_WAIT_DEPTH,
  JOURNEY_TRIGGER_EVENTS,
  countActions,
  describeAction,
  describeJourney,
  describeTrigger,
  flattenActions,
  journeyActionLabel,
  journeyRoi,
  journeyTriggerDef,
  renderJourneyMessage,
  thenActionsOf,
  type JourneyAction,
  type JourneyChannel,
  type JourneyConsent,
  type JourneyDeps,
  type JourneyDryRun,
  type JourneyDto,
  type JourneyListRow,
  type JourneyMessageVars,
  type JourneyRecentRow,
  type JourneySendResult,
  type JourneyStatsView,
  type JourneyStepView,
  type JourneyTrigger,
  type SaveJourneyInput,
} from "./journeys-shared";

export { JOURNEY_PRESETS };

// ───────────────────────── ค่าคงที่ / ตัวช่วยเวลาไทย ─────────────────────────

const SCOPE = "MEMBER_JOURNEY" as const;
const DAY_MS = 86_400_000;
const BKK_MS = 7 * 3_600_000;
/** เพดานสมาชิกที่ cron รายวันยิง event ให้ต่อ journey ต่อรอบ (กันร้านใหญ่ยิงหมื่นใบในคำสั่งเดียว) */
const CRON_EMIT_CHUNK = 500;

/** "2026-09-11" ตามปฏิทินไทย */
const thaiDayKey = (d: Date): string => new Date(d.getTime() + BKK_MS).toISOString().slice(0, 10);

/** ต้นเดือนไทย — โควตา "ต่อเดือน" ต้องตรงกับเดือนที่เจ้าของร้านดู ไม่ใช่เดือน UTC */
function thaiMonthStart(now: Date): Date {
  const t = new Date(now.getTime() + BKK_MS);
  return new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), 1) - BKK_MS);
}

/** เดือน-วัน ("09-18") ของวันไทยที่ห่างจากวันนี้ `offsetDays` วัน */
function thaiMonthDay(now: Date, offsetDays: number): string {
  return new Date(now.getTime() + BKK_MS + offsetDays * DAY_MS).toISOString().slice(5, 10);
}

/** ตำแหน่งของสมาชิกบนเส้น 0–100 ของ journey นี้ (คงที่ตลอดกาล · สูตรเดียวกับแคมเปญ M3.2) */
function hashPct(ruleId: string, customerId: string): number {
  return (parseInt(sha256(`${ruleId}:${customerId}`).slice(0, 8), 16) % 10000) / 100;
}

function stableJson(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v ?? null);
  if (Array.isArray(v)) return `[${v.map(stableJson).join(",")}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o).sort().map((k) => `${JSON.stringify(k)}:${stableJson(o[k])}`).join(",")}}`;
}

const asJson = (v: unknown): Prisma.InputJsonValue => (v ?? {}) as Prisma.InputJsonValue;
const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
const numOr = (v: unknown, fallback: number): number => {
  // ว่าง/ไม่ส่ง = ใช้ค่าปริยาย (`Number("")` = 0 เคยทำให้ journeyDetail คิดสถิติแค่ 1 วันแทน 30)
  if (v === undefined || v === null || (typeof v === "string" && v.trim() === "")) return fallback;
  const n = typeof v === "number" ? v : Number(String(v).trim());
  return Number.isFinite(n) ? n : fallback;
};
const isP2002 = (e: unknown): boolean => e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";
const thaiDate = (d: Date): string => d.toLocaleDateString("th-TH", { day: "numeric", month: "short", timeZone: "Asia/Bangkok" });

// ───────────────────────── ชนิดข้อมูลภายใน ─────────────────────────

type RuleRow = {
  id: string;
  tenantId: string;
  name: string;
  enabled: boolean;
  event: string;
  conditions: Prisma.JsonValue;
  actions: Prisma.JsonValue;
  memberSystemId: string | null;
  holdoutPct: number;
  reentryDays: number | null;
  trigger: Prisma.JsonValue | null;
  createdAt: Date;
  updatedAt: Date;
};

const RULE_SELECT = {
  id: true,
  tenantId: true,
  name: true,
  enabled: true,
  event: true,
  conditions: true,
  actions: true,
  memberSystemId: true,
  holdoutPct: true,
  reentryDays: true,
  trigger: true,
  createdAt: true,
  updatedAt: true,
} as const;

type CustomerRow = {
  id: string;
  tenantId: string;
  memberSystemId: string;
  name: string | null;
  firstName: string | null;
  lastName: string | null;
  memberCode: string | null;
  email: string | null;
  phone: string | null;
  tierDefId: string | null;
  tier: string;
  tags: Prisma.JsonValue;
  status: string;
  homeUnitId: string | null;
};

const CUSTOMER_SELECT = {
  id: true,
  tenantId: true,
  memberSystemId: true,
  name: true,
  firstName: true,
  lastName: true,
  memberCode: true,
  email: true,
  phone: true,
  tierDefId: true,
  tier: true,
  tags: true,
  status: true,
  homeUnitId: true,
} as const;

const displayName = (c: { name: string | null; firstName: string | null; lastName: string | null }): string =>
  [c.firstName, c.lastName].filter(Boolean).join(" ").trim() || c.name || "สมาชิก";

/** ผลของ 1 ขั้น (เก็บใน payload.steps ของแถว run — สถิติรายขั้น/ต้นทุนข้อความอ่านจากตรงนี้) */
type StepOutcome = {
  i: number;
  type: string;
  ok: boolean;
  skipped?: boolean;
  note: string;
  channel?: JourneyChannel;
  voucherId?: string;
};

type JourneyEventRef = { type: string; payload: unknown };

type WaitPayload = {
  thenActions: JourneyAction[];
  ifVoucherUnused: boolean;
  voucherId: string | null;
  voucherCode: string | null;
  event: JourneyEventRef;
  parentRunId: string;
  baseIndex: number;
  depth: number;
  steps?: StepOutcome[];
};

// ───────────────────────── สิทธิ์ ─────────────────────────

function requireRead(actor: MemberActor): void {
  if (!canReadMember(actor)) {
    throw new MemberForbiddenError("บัญชีของคุณยังไม่ได้รับสิทธิ์เข้าโมดูลสมาชิก — ขอสิทธิ์จากเจ้าของร้านก่อน");
  }
}

/** สร้าง/แก้/เปิด-ปิด journey ได้ไหม — คีย์ `member.promo.manage` (§6.1) */
export function canManageJourneys(actor: MemberActor): boolean {
  return hasMemberPerm(actor, "member.promo.manage");
}

function requireManage(actor: MemberActor): void {
  if (!canManageJourneys(actor)) {
    throw new MemberForbiddenError("บัญชีของคุณยังไม่ได้รับสิทธิ์จัดการ journey — ขอสิทธิ์ member.promo.manage จากเจ้าของร้านก่อน");
  }
}

// ───────────────────────── อ่าน/แปลงค่าที่เก็บไว้ ─────────────────────────

function triggerOf(row: Pick<RuleRow, "event" | "trigger">): JourneyTrigger {
  const t = (row.trigger ?? {}) as { event?: unknown; params?: unknown };
  const params = t.params && typeof t.params === "object" && !Array.isArray(t.params) ? (t.params as Record<string, unknown>) : undefined;
  return { event: row.event || str(t.event), ...(params ? { params } : {}) };
}

function actionsOf(row: Pick<RuleRow, "actions">): JourneyAction[] {
  const raw: unknown = row.actions;
  if (!Array.isArray(raw)) return [];
  return (raw as unknown[]).filter((a): a is JourneyAction => !!a && typeof a === "object" && typeof (a as { type?: unknown }).type === "string");
}

function conditionsOf(row: Pick<RuleRow, "conditions">): SegmentDefinition {
  try {
    return parseDefinition(row.conditions && !Array.isArray(row.conditions) ? row.conditions : { groups: [] });
  } catch {
    return { groups: [] };
  }
}

const hasConditions = (def: SegmentDefinition): boolean => def.groups.some((g) => g.conditions.length > 0);

function toDto(row: RuleRow): JourneyDto {
  return {
    id: row.id,
    name: row.name,
    enabled: row.enabled,
    trigger: triggerOf(row),
    conditions: conditionsOf(row),
    actions: actionsOf(row),
    holdoutPct: row.holdoutPct,
    reentryDays: row.reentryDays,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

async function loadRule(ctx: MemberCtx, id: string): Promise<RuleRow> {
  const row = await prisma.automationRule.findFirst({
    where: { id: String(id ?? ""), tenantId: ctx.tenantId, scope: SCOPE, memberSystemId: ctx.systemId },
    select: RULE_SELECT,
  });
  if (!row) throw new MemberNotFoundError("ไม่พบ journey นี้ — อาจถูกลบไปแล้ว");
  return row as RuleRow;
}

async function memberLimit(tenantId: string, key: "journeys" | "automationRunsPerMonth", fallback: number): Promise<number> {
  const t = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { limits: true } });
  const limits = (t?.limits ?? {}) as Record<string, unknown>;
  const member = (limits.member ?? {}) as Record<string, unknown>;
  const v = Number(member[key]);
  return Number.isFinite(v) && v >= 0 ? v : fallback;
}

// ───────────────────────── ตรวจ input ─────────────────────────

type CleanInput = {
  name: string;
  trigger: JourneyTrigger;
  conditions: SegmentDefinition;
  actions: JourneyAction[];
  holdoutPct: number;
  reentryDays: number | null;
  enabled: boolean;
};

function intIn(v: unknown, min: number, max: number, message: string): number {
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) throw new MemberInputError(message);
  return n;
}

async function cleanAction(ctx: MemberCtx, a: JourneyAction, depth: number): Promise<JourneyAction> {
  const type = str(a?.type);
  const p = (a?.params ?? {}) as Record<string, unknown>;
  if (type === "SET_TIER") {
    throw new MemberInputError("การตั้งระดับสมาชิกทำได้เฉพาะในกฎระดับสมาชิก (หน้า ระดับสมาชิก) — journey เลือกได้แค่ออกสิทธิ์/ส่งข้อความ/ติดแท็ก/แจ้งทีม");
  }
  if (!(JOURNEY_ACTION_TYPES as readonly string[]).includes(type)) {
    throw new MemberInputError(`ไม่รู้จักการกระทำ "${type || "(ว่าง)"}" — เลือกจากรายการที่หน้าจอแสดงเท่านั้น`);
  }
  const need = (v: unknown, what: string): string => {
    const s = str(v);
    if (!s) throw new MemberInputError(`ขั้น "${journeyActionLabel(type)}" ยังไม่ได้ใส่${what}`);
    if (s.length > 1000) throw new MemberInputError(`ขั้น "${journeyActionLabel(type)}" ${what}ยาวเกินไป — ใช้ได้ไม่เกิน 1,000 ตัวอักษร`);
    return s;
  };
  switch (type) {
    case "ISSUE_VOUCHER": {
      const templateId = need(p.templateId, "แบบ voucher");
      const tpl = await prisma.voucherTemplate.findFirst({ where: { id: templateId, tenantId: ctx.tenantId, systemId: ctx.systemId }, select: { id: true } });
      if (!tpl) throw new MemberInputError("ไม่พบแบบ voucher ที่เลือก — อาจถูกลบไปแล้ว เลือกแบบใหม่อีกครั้ง");
      return { type, params: { templateId } };
    }
    case "GIVE_POINTS": {
      const points = intIn(p.points, 1, 100_000, "จำนวนแต้มที่ให้ต้องเป็นจำนวนเต็ม 1–100,000");
      const exp = p.expiresDays === undefined || p.expiresDays === null || p.expiresDays === "" ? null : intIn(p.expiresDays, 1, 3650, "อายุแต้มต้องเป็นจำนวนวัน 1–3,650 (เว้นว่าง = ตามการตั้งค่าแต้มของร้าน)");
      return { type, params: { points, ...(exp ? { expiresDays: exp } : {}) } };
    }
    case "SEND_LINE":
    case "SEND_SMS":
      return { type, params: { template: need(p.template, "ข้อความ") } };
    case "SEND_EMAIL":
      return { type, params: { subject: need(p.subject, "หัวข้ออีเมล"), template: need(p.template, "เนื้อความ") } };
    case "SEND_PUSH":
      return { type, params: { title: need(p.title, "หัวข้อแจ้งเตือน"), template: need(p.template, "ข้อความ") } };
    case "ADD_TAG":
    case "REMOVE_TAG": {
      const tag = need(p.tag, "ชื่อแท็ก");
      if (tag.length > 40) throw new MemberInputError("ชื่อแท็กยาวเกินไป — ใช้ได้ไม่เกิน 40 ตัวอักษร");
      return { type, params: { tag } };
    }
    case "WAIT_THEN": {
      const days = intIn(p.days, 1, JOURNEY_MAX_WAIT_DAYS, `"รอ n วัน" ต้องเป็นจำนวนเต็ม 1–${JOURNEY_MAX_WAIT_DAYS} วัน — นานกว่านี้ลูกค้าลืมไปแล้ว`);
      if (depth >= JOURNEY_MAX_WAIT_DEPTH + 1) {
        throw new MemberInputError(`"รอ n วัน" ซ้อนกันได้ลึกสุด ${JOURNEY_MAX_WAIT_DEPTH + 1} ชั้น — แยกเป็น journey ใหม่จะดูแลง่ายกว่า`);
      }
      const inner = Array.isArray(p.thenActions) ? (p.thenActions as JourneyAction[]) : [];
      if (inner.length === 0) throw new MemberInputError(`ขั้น "รอ ${days} วัน" ยังไม่มีสิ่งที่ต้องทำหลังรอ — เพิ่มอย่างน้อย 1 ขั้น`);
      const thenActions: JourneyAction[] = [];
      for (const x of inner) thenActions.push(await cleanAction(ctx, x, depth + 1));
      return { type, params: { days, ...(p.ifVoucherUnused === true ? { ifVoucherUnused: true } : {}), thenActions } };
    }
    case "OPEN_KANBAN_CARD":
      return { type, params: { boardId: need(p.boardId, "บอร์ดปลายทาง"), title: need(p.title, "ชื่อการ์ด") } };
    case "NOTIFY_STAFF": {
      const title = need(p.title, "หัวข้อแจ้งเตือน");
      const role = str(p.role);
      const userIds = Array.isArray(p.userIds) ? (p.userIds as unknown[]).filter((u): u is string => typeof u === "string" && !!u).slice(0, 50) : [];
      if (role && !["OWNER", "MANAGER", "STAFF"].includes(role)) throw new MemberInputError("เลือกกลุ่มพนักงานที่จะแจ้งจากรายการเท่านั้น (เจ้าของ/ผู้จัดการ/พนักงาน)");
      return { type, params: { title, ...(role ? { role } : {}), ...(userIds.length ? { userIds } : {}) } };
    }
    default:
      return { type, params: {} };
  }
}

async function cleanInput(ctx: MemberCtx, input: SaveJourneyInput): Promise<CleanInput> {
  const name = str(input?.name);
  if (!name) throw new MemberInputError("ตั้งชื่อ journey ก่อนบันทึก — ชื่อช่วยให้ทีมรู้ว่า journey นี้ทำอะไร");
  if (name.length > 120) throw new MemberInputError("ชื่อ journey ยาวเกินไป — ใช้ได้ไม่เกิน 120 ตัวอักษร");

  const event = str(input?.trigger?.event);
  const def = journeyTriggerDef(event);
  if (!def) throw new MemberInputError(`ไม่รู้จักทริกเกอร์ "${event || "(ว่าง)"}" — journey เริ่มได้จากเหตุการณ์ของสมาชิกในรายการเท่านั้น`);
  const params: Record<string, unknown> = {};
  if (def.param) {
    const raw = input.trigger.params?.[def.param.key];
    params[def.param.key] = raw === undefined || raw === null || raw === ""
      ? def.param.def
      : intIn(raw, def.param.min, def.param.max, `"${def.param.label}" ต้องเป็นจำนวนเต็ม ${def.param.min}–${def.param.max} ${def.param.unit}`);
  }
  const trigger: JourneyTrigger = { event, ...(def.param ? { params } : {}) };

  const conditions = parseDefinition(input?.conditions ?? { groups: [] });
  if (hasConditions(conditions)) await evaluateSegment(ctx, conditions); // ฟิลด์/ค่าผิด → โยนไทยจาก engine M3.1

  const rawActions = Array.isArray(input?.actions) ? input.actions : [];
  if (rawActions.length === 0) throw new MemberInputError("ยังไม่มีสิ่งที่ต้องทำ — เพิ่มการกระทำอย่างน้อย 1 ขั้น");
  const actions: JourneyAction[] = [];
  for (const a of rawActions) actions.push(await cleanAction(ctx, a, 0));
  if (countActions(actions) > JOURNEY_MAX_ACTIONS) {
    throw new MemberInputError(`journey หนึ่งมีการกระทำได้ไม่เกิน ${JOURNEY_MAX_ACTIONS} ขั้น (รวมขั้นหลัง "รอ n วัน") — แยกเป็น 2 journey จะดูแลง่ายกว่า`);
  }

  const holdoutPct = intIn(input?.holdoutPct ?? 0, 0, JOURNEY_MAX_HOLDOUT_PCT, `กันกลุ่มเทียบได้ 0–${JOURNEY_MAX_HOLDOUT_PCT}% — มากกว่านี้เสียโอกาสขายมากกว่าที่ได้ความรู้`);
  const reentryDays = input?.reentryDays === undefined || input.reentryDays === null
    ? null
    : intIn(input.reentryDays, 1, 3650, "เข้าซ้ำได้หลังกี่วันต้องเป็นจำนวนเต็ม 1–3,650 (เว้นว่าง = เข้าได้ครั้งเดียวตลอดชีพ)");
  return { name, trigger, conditions, actions, holdoutPct, reentryDays, enabled: input?.enabled !== false };
}

// ───────────────────────── สร้าง / แก้ / เปิด-ปิด / ลบ ─────────────────────────

export async function createJourney(ctx: MemberCtx, actor: MemberActor, input: SaveJourneyInput): Promise<{ id: string }> {
  requireManage(actor);
  const v = await cleanInput(ctx, input);
  const cap = await memberLimit(ctx.tenantId, "journeys", MEMBER_LIMITS.journeys);
  const used = await prisma.automationRule.count({ where: { tenantId: ctx.tenantId, scope: SCOPE, memberSystemId: ctx.systemId } });
  if (used >= cap) {
    throw memberLimitError(`ระบบสมาชิกนี้มี journey ได้ ${cap} เส้น — ครบแล้ว ลบ journey ที่ไม่ใช้ก่อน หรืออัปแพ็กเกจ`);
  }
  const row = await prisma.automationRule.create({
    data: {
      tenantId: ctx.tenantId,
      systemId: ctx.systemId,
      name: v.name,
      event: v.trigger.event,
      enabled: v.enabled,
      // placeholder ของเอนจิน v1 (เอนจินเดิมกรอง scope = KANBAN อยู่แล้ว — ไม่มีวันเห็นแถวนี้)
      actionType: "NOTIFY",
      actionConfig: {},
      kind: "RULE",
      conditions: asJson(v.conditions),
      actions: asJson(v.actions),
      scope: SCOPE,
      memberSystemId: ctx.systemId,
      holdoutPct: v.holdoutPct,
      reentryDays: v.reentryDays,
      trigger: asJson(v.trigger),
    },
    select: { id: true },
  });
  return { id: row.id };
}

export async function updateJourney(ctx: MemberCtx, actor: MemberActor, id: string, input: SaveJourneyInput): Promise<{ id: string }> {
  requireManage(actor);
  const row = await loadRule(ctx, id);
  const v = await cleanInput(ctx, input);
  await prisma.automationRule.update({
    where: { id: row.id },
    data: {
      name: v.name,
      event: v.trigger.event,
      enabled: v.enabled,
      conditions: asJson(v.conditions),
      actions: asJson(v.actions),
      holdoutPct: v.holdoutPct,
      reentryDays: v.reentryDays,
      trigger: asJson(v.trigger),
    },
  });
  if (!v.enabled && row.enabled) await cancelWaiting(row.id, "ยกเลิก — journey ถูกปิดก่อนถึงเวลา");
  return { id: row.id };
}

async function cancelWaiting(ruleId: string, detail: string): Promise<number> {
  const r = await prisma.automationRun.updateMany({
    where: { ruleId, status: "WAITING" },
    data: { status: "CANCELLED", finishedAt: new Date(), detail },
  });
  return r.count;
}

/** เปิด/ปิด — ปิดแล้ว "ขั้นที่รออยู่" ทุกแถวถูกยกเลิกทันที (§11.6) */
export async function toggleJourney(ctx: MemberCtx, actor: MemberActor, id: string, enabled: boolean): Promise<{ enabled: boolean; cancelled: number }> {
  requireManage(actor);
  const row = await loadRule(ctx, id);
  await prisma.automationRule.update({ where: { id: row.id }, data: { enabled: !!enabled } });
  const cancelled = enabled ? 0 : await cancelWaiting(row.id, "ยกเลิก — journey ถูกปิดก่อนถึงเวลา");
  return { enabled: !!enabled, cancelled };
}

export async function deleteJourney(ctx: MemberCtx, actor: MemberActor, id: string): Promise<{ ok: true }> {
  requireManage(actor);
  const row = await loadRule(ctx, id);
  // run ของ journey หายตามด้วย FK journeyId (Cascade) — voucher/แต้มที่ออกไปแล้วยังอยู่กับลูกค้า
  await prisma.automationRule.delete({ where: { id: row.id } });
  return { ok: true };
}

/** ทำสำเนา (ปุ่มในหน้ารายละเอียด ภาพ 22) — ใบใหม่ปิดไว้ก่อนเสมอ ให้ร้านแก้แล้วค่อยเปิด */
export async function duplicateJourney(ctx: MemberCtx, actor: MemberActor, id: string): Promise<{ id: string }> {
  requireManage(actor);
  const row = await loadRule(ctx, id);
  const dto = toDto(row);
  return createJourney(ctx, actor, {
    name: `${dto.name} (สำเนา)`.slice(0, 120),
    trigger: dto.trigger,
    conditions: dto.conditions,
    actions: dto.actions,
    holdoutPct: dto.holdoutPct,
    reentryDays: dto.reentryDays,
    enabled: false,
  });
}

export async function getJourney(ctx: MemberCtx, actor: MemberActor, id: string): Promise<JourneyDto> {
  requireRead(actor);
  return toDto(await loadRule(ctx, id));
}

// ───────────────────────── สำเร็จรูป ─────────────────────────

/** แปลงค่าพิเศษ `@tier-at-least:<key>` → รหัสระดับจริงของร้านตั้งแต่ระดับนั้นขึ้นไป (ไม่มีระดับนั้น = ตัดเงื่อนไขทิ้ง) */
async function resolvePresetConditions(ctx: MemberCtx, def: SegmentDefinition): Promise<SegmentDefinition> {
  const tiers = await prisma.memberTierDef.findMany({
    where: { tenantId: ctx.tenantId, systemId: ctx.systemId, archivedAt: null },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: { key: true, sortOrder: true },
  });
  const groups = def.groups
    .map((g) => ({
      conditions: g.conditions.flatMap((c) => {
        const values = Array.isArray(c.value) ? c.value : [c.value];
        const marker = values.find((x) => typeof x === "string" && x.startsWith(TIER_AT_LEAST_PREFIX));
        if (typeof marker !== "string") return [c];
        const base = tiers.find((t) => t.key === marker.slice(TIER_AT_LEAST_PREFIX.length));
        if (!base) return [];
        return [{ ...c, value: tiers.filter((t) => t.sortOrder >= base.sortOrder).map((t) => t.key) }];
      }),
    }))
    .filter((g) => g.conditions.length > 0);
  return { groups };
}

function withTemplate(actions: JourneyAction[], templateId: string | null): JourneyAction[] {
  const out: JourneyAction[] = [];
  for (const a of actions) {
    if (a.type === "ISSUE_VOUCHER") {
      if (!templateId) continue; // ร้านยังไม่มีแบบ voucher เลย = ตัดขั้นนี้ทิ้ง (ดีกว่า journey ที่พังทุกครั้งที่วิ่ง)
      out.push({ type: a.type, params: { ...(a.params ?? {}), templateId } });
      continue;
    }
    if (a.type === "WAIT_THEN") {
      const inner = withTemplate(thenActionsOf(a), templateId);
      if (inner.length === 0) continue;
      out.push({ type: a.type, params: { ...(a.params ?? {}), thenActions: inner } });
      continue;
    }
    out.push({ type: a.type, params: { ...(a.params ?? {}) } });
  }
  return out;
}

export async function createFromPreset(
  ctx: MemberCtx,
  actor: MemberActor,
  key: string,
  opts: { templateId?: string | null; name?: string | null; enabled?: boolean } = {},
): Promise<{ id: string }> {
  requireManage(actor);
  const preset = journeyPreset(String(key ?? ""));
  if (!preset) throw new MemberInputError(`ไม่รู้จัก journey สำเร็จรูป "${key}" — เลือกจากรายการที่หน้าจอแสดง`);
  let templateId = str(opts.templateId) || null;
  if (!templateId) {
    const first = await prisma.voucherTemplate.findFirst({
      where: { tenantId: ctx.tenantId, systemId: ctx.systemId, active: true },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });
    templateId = first?.id ?? null;
  }
  return createJourney(ctx, actor, {
    name: str(opts.name) || preset.name,
    trigger: preset.trigger,
    conditions: await resolvePresetConditions(ctx, preset.conditions),
    actions: withTemplate(preset.actions, templateId),
    holdoutPct: preset.holdoutPct,
    reentryDays: preset.reentryDays,
    enabled: opts.enabled !== false,
  });
}

// ───────────────────────── เอนจิน: หา "ลูกค้าของ event นี้" ─────────────────────────

export type JourneyEvent = {
  tenantId: string;
  type: string;
  payload: unknown;
  /** กุญแจกันซ้ำของ event (OutboxEvent.idempotencyKey) — คิวส่ง `id` มาแทนได้ เอนจินไปอ่านกุญแจเอง */
  idempotencyKey?: string | null;
  id?: string | null;
};

export type JourneyRunOptions = { now?: Date; deps?: JourneyDeps };

const ID_KEYS = ["customerId", "memberId", "ownerCustomerId", "buyerCustomerId"] as const;

async function resolveCustomerId(tenantId: string, payload: unknown): Promise<string | null> {
  const p = (payload ?? {}) as Record<string, unknown>;
  for (const k of ID_KEYS) if (typeof p[k] === "string" && p[k]) return p[k] as string;
  if (typeof p.saleId === "string") {
    const s = await prisma.posSale.findFirst({ where: { id: p.saleId, tenantId }, select: { memberId: true } });
    if (s?.memberId) return s.memberId;
  }
  if (typeof p.appointmentId === "string") {
    const a = await prisma.appointment.findFirst({ where: { id: p.appointmentId, tenantId }, select: { customerId: true } });
    if (a?.customerId) return a.customerId;
  }
  if (typeof p.giftCardId === "string") {
    const g = await prisma.giftCard.findFirst({ where: { id: p.giftCardId, tenantId }, select: { ownerCustomerId: true } });
    if (g?.ownerCustomerId) return g.ownerCustomerId;
  }
  return null;
}

async function eventKeyOf(evt: JourneyEvent): Promise<string> {
  const direct = str(evt.idempotencyKey);
  if (direct) return direct.slice(0, 190);
  if (evt.id) {
    const row = await prisma.outboxEvent.findFirst({ where: { id: evt.id, tenantId: evt.tenantId }, select: { idempotencyKey: true } });
    if (row?.idempotencyKey) return row.idempotencyKey.slice(0, 190);
  }
  return `evt:${evt.type}:${sha256(stableJson(evt.payload)).slice(0, 24)}`;
}

/** พารามิเตอร์ของทริกเกอร์ตรงกับ event ไหม (วันเกิด 7 วัน ≠ วันเกิด 3 วัน) */
function paramsMatch(rule: RuleRow, payload: unknown): boolean {
  const def = journeyTriggerDef(rule.event);
  if (!def?.param) return true;
  const want = numOr(triggerOf(rule).params?.[def.param.key], def.param.def);
  const got = (payload ?? {}) as Record<string, unknown>;
  return numOr(got[def.param.key], Number.NaN) === want;
}

async function conditionsPass(ctx: MemberCtx, def: SegmentDefinition, customerId: string): Promise<{ ok: boolean; error?: string }> {
  if (!hasConditions(def)) return { ok: true };
  try {
    const where = await evaluateSegment(ctx, def);
    const hit = await prisma.customer.findFirst({ where: { AND: [where, { id: customerId }] }, select: { id: true } });
    return { ok: !!hit };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message.slice(0, 200) : "เงื่อนไขของ journey ใช้ไม่ได้แล้ว" };
  }
}

// ───────────────────────── เอนจิน: เข้า journey ─────────────────────────

/**
 * event 1 ใบ → ทุก journey ที่เปิดอยู่และฟัง event นี้ (เรียกจาก `outbox-consumers.ts` withAutomation · best-effort)
 * คืน `runs` = จำนวนแถวที่เกิดขึ้นรอบนี้ (เข้า/ข้าม/กลุ่มเทียบ — ไม่นับที่ตัวกันวนตัดทิ้ง)
 */
export async function runForEvent(evt: JourneyEvent, opts: JourneyRunOptions = {}): Promise<{ runs: number }> {
  if (!evt?.tenantId || !JOURNEY_TRIGGER_EVENTS.has(evt.type)) return { runs: 0 };
  const rules = (await prisma.automationRule.findMany({
    where: { tenantId: evt.tenantId, scope: SCOPE, enabled: true, event: evt.type, memberSystemId: { not: null } },
    orderBy: { createdAt: "asc" },
    select: RULE_SELECT,
  })) as RuleRow[];
  if (rules.length === 0) return { runs: 0 };

  const customerId = await resolveCustomerId(evt.tenantId, evt.payload);
  if (!customerId) return { runs: 0 };
  const customer = (await prisma.customer.findFirst({ where: { id: customerId, tenantId: evt.tenantId }, select: CUSTOMER_SELECT })) as CustomerRow | null;
  if (!customer || customer.status === "MERGED") return { runs: 0 };

  const now = opts.now ?? new Date();
  const eventKey = await eventKeyOf(evt);
  let runs = 0;
  for (const rule of rules) {
    if (rule.memberSystemId !== customer.memberSystemId) continue;
    if (!paramsMatch(rule, evt.payload)) continue;
    try {
      if (await enterJourney(rule, customer, { type: evt.type, payload: evt.payload }, eventKey, now, opts.deps ?? {})) runs += 1;
    } catch {
      // journey เส้นหนึ่งพังต้องไม่ล้ม journey เส้นอื่นของ event เดียวกัน (แถวของมันถูกบันทึก FAILED ในตัวแล้วถ้าไปถึง)
    }
  }
  return { runs };
}

type RunSeed = { status: "OK" | "SKIPPED" | "HOLDOUT"; detail: string };

/** สร้างแถวหลัก (stepIndex = null) — ชน unique ของตัวกันวน = มีคนทำไปแล้ว → null */
async function insertMainRun(rule: RuleRow, customerId: string, eventKey: string, event: JourneyEventRef, seed: RunSeed): Promise<string | null> {
  try {
    const row = await prisma.automationRun.create({
      data: {
        tenantId: rule.tenantId,
        ruleId: rule.id,
        journeyId: rule.id,
        customerId,
        eventKey,
        status: seed.status,
        detail: seed.detail,
        payload: asJson({ event }),
        ...(seed.status === "OK" ? {} : { finishedAt: new Date() }),
      },
      select: { id: true },
    });
    return row.id;
  } catch (e) {
    if (isP2002(e)) return null;
    throw e;
  }
}

async function enterJourney(rule: RuleRow, customer: CustomerRow, event: JourneyEventRef, eventKey: string, now: Date, deps: JourneyDeps): Promise<boolean> {
  // 1) กันวน — event ใบเดิมกับคนเดิมใน journey เดิม = ทำไปแล้ว (unique ที่ฐานข้อมูลเป็นด่านจริงอีกชั้นตอน insert)
  const seen = await prisma.automationRun.findFirst({ where: { ruleId: rule.id, customerId: customer.id, eventKey }, select: { id: true } });
  if (seen) return false;

  // 2) เข้าซ้ำ — มีรอบก่อนหน้า (ที่ไม่ใช่ "ข้าม") ภายใน reentryDays (null = เคยเข้าเลย)
  const prior = await prisma.automationRun.findFirst({
    where: {
      ruleId: rule.id,
      customerId: customer.id,
      stepIndex: null,
      status: { in: ["OK", "HOLDOUT", "FAILED"] },
      ...(rule.reentryDays !== null ? { createdAt: { gte: new Date(now.getTime() - rule.reentryDays * DAY_MS) } } : {}),
    },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });
  if (prior) {
    const detail = rule.reentryDays === null
      ? `ข้าม (re-entry) — คนนี้เข้า journey นี้ไปแล้วเมื่อ ${thaiDate(prior.createdAt)} · journey นี้ตั้งให้เข้าได้ครั้งเดียวตลอดชีพ`
      : `ข้าม (re-entry) — คนนี้เข้า journey นี้ไปแล้วเมื่อ ${thaiDate(prior.createdAt)} · เข้าซ้ำได้หลัง ${rule.reentryDays} วัน`;
    return !!(await insertMainRun(rule, customer.id, eventKey, event, { status: "SKIPPED", detail }));
  }

  // 3) โควตารายเดือนของระบบสมาชิก (นับทุกแถวของทุก journey ในระบบนี้ เดือนไทยนี้)
  const cap = await memberLimit(rule.tenantId, "automationRunsPerMonth", MEMBER_LIMITS.automationRunsPerMonth);
  const used = await prisma.automationRun.count({
    where: { tenantId: rule.tenantId, rule: { memberSystemId: rule.memberSystemId }, createdAt: { gte: thaiMonthStart(now) } },
  });
  if (used >= cap) {
    const detail = `ข้าม (quota) — ระบบสมาชิกนี้ใช้โควตา journey ครบ ${cap.toLocaleString("th-TH")} ครั้งของเดือนนี้แล้ว · เดือนหน้าเริ่มนับใหม่ หรืออัปแพ็กเกจ`;
    return !!(await insertMainRun(rule, customer.id, eventKey, event, { status: "SKIPPED", detail }));
  }

  // 4) เงื่อนไข (engine เดียวกับกลุ่มลูกค้า M3.1)
  const ctx: MemberCtx = { tenantId: rule.tenantId, systemId: customer.memberSystemId, actorUserId: null };
  const cond = await conditionsPass(ctx, conditionsOf(rule), customer.id);
  if (!cond.ok) {
    const detail = cond.error
      ? `ข้าม (conditions) — เงื่อนไขของ journey ใช้ไม่ได้แล้ว: ${cond.error}`
      : "ข้าม (conditions) — คนนี้ไม่เข้าเงื่อนไขของ journey ณ ตอนที่เกิดเหตุการณ์";
    return !!(await insertMainRun(rule, customer.id, eventKey, event, { status: "SKIPPED", detail }));
  }

  // 5) กลุ่มเทียบ — ไม่ทำอะไรเลย แต่บันทึกไว้เพื่อวัดผลจริง (uplift)
  if (rule.holdoutPct > 0 && hashPct(rule.id, customer.id) < rule.holdoutPct) {
    const detail = `กลุ่มเทียบ (holdout ${rule.holdoutPct}%) — ไม่ได้ทำการกระทำใด ๆ เก็บไว้เทียบว่าคนที่ไม่ได้รับกลับมาซื้อเองกี่ %`;
    return !!(await insertMainRun(rule, customer.id, eventKey, event, { status: "HOLDOUT", detail }));
  }

  // 6) ลงมือ — จองแถวก่อน (ตัวกันวนตัดสินที่นี่) แล้วค่อยทำทีละขั้น
  const runId = await insertMainRun(rule, customer.id, eventKey, event, { status: "OK", detail: "กำลังทำตามขั้นตอนของ journey" });
  if (!runId) return false;
  try {
    const res = await executeActions(
      { rule, customer, runId, event, now, deps, voucherId: null, voucherCode: null },
      actionsOf(rule),
      0,
      0,
    );
    await prisma.automationRun.update({
      where: { id: runId },
      data: { status: "OK", detail: summarize(res.steps), finishedAt: new Date(), payload: asJson({ event, steps: res.steps, voucherId: res.voucherId }) },
    });
  } catch (e) {
    await prisma.automationRun.update({
      where: { id: runId },
      data: { status: "FAILED", finishedAt: new Date(), detail: `ทำไม่สำเร็จ — ${(e instanceof Error ? e.message : String(e)).slice(0, 300)}` },
    }).catch(() => null);
  }
  return true;
}

// ───────────────────────── เอนจิน: ทำตามขั้น ─────────────────────────

type ExecEnv = {
  rule: RuleRow;
  customer: CustomerRow;
  runId: string;
  event: JourneyEventRef;
  now: Date;
  deps: JourneyDeps;
  voucherId: string | null;
  voucherCode: string | null;
};

function summarize(steps: StepOutcome[]): string {
  if (steps.length === 0) return "ไม่มีขั้นที่ต้องทำ";
  const done = steps.filter((s) => s.ok).length;
  const parts = steps.map((s) => `${journeyActionLabel(s.type)}: ${s.ok ? "สำเร็จ" : s.skipped ? "ข้าม" : "ไม่สำเร็จ"}${s.note ? ` (${s.note})` : ""}`);
  return `ทำแล้ว ${done}/${steps.length} ขั้น — ${parts.join(" · ")}`.slice(0, 1500);
}

async function tierNameOf(c: CustomerRow): Promise<string> {
  if (!c.tierDefId) return c.tier;
  const t = await prisma.memberTierDef.findFirst({ where: { id: c.tierDefId }, select: { name: true } });
  return t?.name ?? c.tier;
}

async function varsFor(env: ExecEnv, template: string): Promise<Partial<JourneyMessageVars>> {
  const c = env.customer;
  const vars: Partial<JourneyMessageVars> = {
    ชื่อ: displayName(c),
    voucher: env.voucherCode ?? "",
    รหัสสมาชิก: c.memberCode ?? "",
  };
  if (template.includes("{ระดับ}")) vars.ระดับ = await tierNameOf(c);
  if (template.includes("{แต้ม}")) {
    const [pointSys] = await resolvePointSystemIds(c.tenantId, c.memberSystemId);
    vars.แต้ม = pointSys ? (await getBalance(pointSys, c.id)).toLocaleString("th-TH") : "0";
  }
  return vars;
}

async function consentOf(customerId: string, channel: JourneyChannel): Promise<JourneyConsent> {
  const row = await prisma.memberConsent.findUnique({ where: { customerId_channel: { customerId, channel } }, select: { granted: true } });
  if (!row) return "NONE";
  return row.granted ? "GRANTED" : "REVOKED";
}

async function addressOf(c: CustomerRow, channel: JourneyChannel): Promise<string> {
  if (channel === "EMAIL") return c.email?.trim() ?? "";
  if (channel === "SMS") return c.phone?.trim() ?? "";
  if (channel === "LINE") {
    const id = await prisma.memberChannelIdentity.findFirst({ where: { tenantId: c.tenantId, customerId: c.id, channel: "LINE" }, orderBy: { createdAt: "asc" }, select: { externalId: true } });
    return id?.externalId ?? "";
  }
  const devices = await prisma.memberPushDevice.findMany({ where: { tenantId: c.tenantId, customerId: c.id }, select: { token: true } });
  return devices.map((d) => d.token).join(",");
}

const NO_SENDER = async (): Promise<JourneySendResult> => ({ ok: false, skipped: true, error: "ยังไม่ได้เชื่อมตัวส่งของช่องทางนี้" });

async function logStep(env: ExecEnv, index: number, action: JourneyAction, note: string, refRunId: string): Promise<void> {
  await prisma.memberActivity.create({
    data: {
      tenantId: env.customer.tenantId,
      customerId: env.customer.id,
      module: "journey",
      type: "JOURNEY_STEP",
      refType: "AutomationRun",
      refId: refRunId,
      summary: `Journey "${env.rule.name}" — ${describeAction(action)}${note ? ` (${note})` : ""}`.slice(0, 500),
      data: asJson({ journeyId: env.rule.id, step: index, type: action.type }),
    },
  });
}

async function runAction(env: ExecEnv, action: JourneyAction, index: number, depth: number): Promise<StepOutcome> {
  const p = (action.params ?? {}) as Record<string, unknown>;
  const c = env.customer;
  const base = { i: index, type: action.type };
  switch (action.type) {
    case "ISSUE_VOUCHER": {
      const templateId = str(p.templateId);
      try {
        const res = await issueVoucher(
          { tenantId: c.tenantId, systemId: c.memberSystemId, actorUserId: null },
          VOUCHER_SYSTEM_ACTOR,
          {
            customerIds: [c.id],
            templateId,
            origin: "JOURNEY",
            originRef: { journeyId: env.rule.id, runId: env.runId, step: index },
            reason: `journey ${env.rule.name}`,
          },
        );
        if ("pending" in res && res.pending) return { ...base, ok: false, note: "เกินเพดานที่ออกได้เอง — รออนุมัติ" };
        const v = "vouchers" in res ? res.vouchers[0] : undefined;
        if (!v) return { ...base, ok: false, note: "ออกใบไม่สำเร็จ (ใบซ้ำของรอบนี้)" };
        env.voucherId = v.id;
        env.voucherCode = v.code;
        return { ...base, ok: true, note: v.code, voucherId: v.id };
      } catch (e) {
        return { ...base, ok: false, note: (e instanceof Error ? e.message : String(e)).slice(0, 200) };
      }
    }
    case "GIVE_POINTS": {
      const points = Math.round(numOr(p.points, 0));
      const [pointSys] = await resolvePointSystemIds(c.tenantId, c.memberSystemId);
      if (!pointSys) return { ...base, ok: false, skipped: true, note: "ร้านยังไม่ได้เปิดระบบแต้มที่สาขาเดียวกับระบบสมาชิกนี้" };
      try {
        const expiresDays = p.expiresDays === undefined ? null : Math.round(numOr(p.expiresDays, 0));
        await earnWithLot(
          { tenantId: c.tenantId, systemId: pointSys, memberSystemId: c.memberSystemId },
          {
            customerId: c.id,
            points,
            refType: "JOURNEY",
            refId: env.runId,
            idempotencyKey: `journey:${env.runId}:${index}`,
            reason: `journey ${env.rule.name}`.slice(0, 120),
            ...(expiresDays && expiresDays > 0 ? { expiresAt: new Date(env.now.getTime() + expiresDays * DAY_MS) } : {}),
          },
        );
        return { ...base, ok: true, note: `+${points.toLocaleString("th-TH")} แต้ม` };
      } catch (e) {
        return { ...base, ok: false, note: (e instanceof Error ? e.message : String(e)).slice(0, 200) };
      }
    }
    case "SEND_LINE":
    case "SEND_EMAIL":
    case "SEND_SMS":
    case "SEND_PUSH": {
      const channel = JOURNEY_ACTION_CHANNEL[action.type] as JourneyChannel;
      const label = JOURNEY_CHANNEL_LABELS[channel];
      const consent = await consentOf(c.id, channel);
      if (consent === "REVOKED") return { ...base, ok: false, skipped: true, channel, note: `ลูกค้าถอนความยินยอมรับข่าวสารทาง${label}แล้ว` };
      const template = str(p.template);
      const vars = await varsFor(env, `${template} ${str(p.subject)} ${str(p.title)}`);
      const sender = env.deps[channel.toLowerCase() as "line" | "email" | "sms" | "push"] ?? NO_SENDER;
      let res: JourneySendResult;
      try {
        res = await sender({
          tenantId: c.tenantId,
          memberSystemId: c.memberSystemId,
          journeyId: env.rule.id,
          runId: env.runId,
          customerId: c.id,
          channel,
          to: await addressOf(c, channel),
          consent,
          body: renderJourneyMessage(template, vars),
          ...(action.type === "SEND_EMAIL" ? { subject: renderJourneyMessage(str(p.subject), vars) } : {}),
          ...(action.type === "SEND_PUSH" ? { title: renderJourneyMessage(str(p.title), vars) } : {}),
        });
      } catch (e) {
        res = { ok: false, error: (e instanceof Error ? e.message : String(e)).slice(0, 200) };
      }
      return { ...base, ok: res.ok, ...(res.skipped ? { skipped: true } : {}), channel, note: res.ok ? `ส่งทาง${label}แล้ว` : (res.error ?? "ส่งไม่สำเร็จ") };
    }
    case "ADD_TAG":
    case "REMOVE_TAG": {
      const tag = str(p.tag);
      const fresh = await prisma.customer.findUnique({ where: { id: c.id }, select: { tags: true } });
      const tags = (Array.isArray(fresh?.tags) ? (fresh.tags as unknown[]) : []).filter((t): t is string => typeof t === "string");
      const next = action.type === "ADD_TAG" ? (tags.includes(tag) ? tags : [...tags, tag]) : tags.filter((t) => t !== tag);
      if (next.length !== tags.length) await prisma.customer.update({ where: { id: c.id }, data: { tags: next } });
      return { ...base, ok: true, note: action.type === "ADD_TAG" ? `แท็ก "${tag}"` : `เอาแท็ก "${tag}" ออก` };
    }
    case "WAIT_THEN": {
      const days = Math.round(numOr(p.days, 1));
      const scheduledAt = new Date(env.now.getTime() + days * DAY_MS);
      const payload: WaitPayload = {
        thenActions: thenActionsOf(action),
        ifVoucherUnused: p.ifVoucherUnused === true,
        voucherId: env.voucherId,
        voucherCode: env.voucherCode,
        event: env.event,
        parentRunId: env.runId,
        baseIndex: index + 1,
        depth: depth + 1,
      };
      await prisma.automationRun.create({
        data: {
          tenantId: c.tenantId,
          ruleId: env.rule.id,
          journeyId: env.rule.id,
          customerId: c.id,
          status: "WAITING",
          stepIndex: index,
          scheduledAt,
          detail: `รอถึง ${thaiDate(scheduledAt)} แล้วค่อยทำต่อ${payload.ifVoucherUnused ? " (เฉพาะเมื่อยังไม่ใช้ voucher)" : ""}`,
          payload: asJson(payload),
        },
      });
      return { ...base, ok: true, note: `รอถึง ${thaiDate(scheduledAt)}` };
    }
    case "OPEN_KANBAN_CARD": {
      const sender = env.deps.kanban;
      if (!sender) return { ...base, ok: false, skipped: true, note: "ยังไม่ได้เชื่อมบอร์ดงาน" };
      const vars = await varsFor(env, str(p.title));
      try {
        const r = await sender({
          tenantId: c.tenantId,
          journeyId: env.rule.id,
          runId: env.runId,
          customerId: c.id,
          boardId: str(p.boardId),
          title: renderJourneyMessage(str(p.title), vars),
          description: `จาก journey "${env.rule.name}" · สมาชิก ${displayName(c)}${c.memberCode ? ` (${c.memberCode})` : ""}`,
          sourceKey: `journey:${env.runId}:${index}`,
        });
        return { ...base, ok: r.ok, note: r.ok ? "เปิดการ์ดแล้ว" : (r.error ?? "เปิดการ์ดไม่สำเร็จ") };
      } catch (e) {
        return { ...base, ok: false, note: (e instanceof Error ? e.message : String(e)).slice(0, 200) };
      }
    }
    case "NOTIFY_STAFF": {
      const vars = await varsFor(env, str(p.title));
      const title = renderJourneyMessage(str(p.title), vars) || `${displayName(c)} — journey ${env.rule.name}`;
      const body = `journey "${env.rule.name}" · สมาชิก ${displayName(c)}${c.memberCode ? ` (${c.memberCode})` : ""}`;
      const role = str(p.role);
      const userIds = Array.isArray(p.userIds) ? (p.userIds as unknown[]).filter((u): u is string => typeof u === "string") : [];
      let recipients: string[] = [];
      if (userIds.length || role) {
        const ms = await prisma.membership.findMany({
          where: { tenantId: c.tenantId, ...(userIds.length ? { userId: { in: userIds } } : {}), ...(role ? { role: role as "OWNER" | "MANAGER" | "STAFF" } : {}) },
          select: { userId: true },
        });
        recipients = [...new Set(ms.map((m) => m.userId))];
        if (recipients.length === 0) return { ...base, ok: false, skipped: true, note: "ไม่พบพนักงานที่ต้องแจ้ง" };
      }
      if (recipients.length === 0) {
        await prisma.appNotification.create({ data: { tenantId: c.tenantId, title, body } });
      } else {
        await prisma.appNotification.createMany({ data: recipients.map((u) => ({ tenantId: c.tenantId, recipientUserId: u, title, body })) });
      }
      return { ...base, ok: true, note: recipients.length ? `แจ้ง ${recipients.length} คน` : "แจ้งทั้งร้าน" };
    }
    case "REQUEST_REVIEW": {
      // 🔴 stub ของ M3.4: ใบนี้บันทึก "ขอรีวิวแล้ว" ลงไทม์ไลน์ผูกกับบิล/นัดต้นทาง — M3.4 เปลี่ยนเป็นส่งลิงก์รีวิวจริง
      const ep = (env.event.payload ?? {}) as Record<string, unknown>;
      const ref = typeof ep.saleId === "string" ? { refType: "PosSale", refId: ep.saleId } : typeof ep.appointmentId === "string" ? { refType: "Appointment", refId: ep.appointmentId } : { refType: "AutomationRun", refId: env.runId };
      await prisma.memberActivity.create({
        data: {
          tenantId: c.tenantId,
          customerId: c.id,
          module: "journey",
          type: "REVIEW_REQUESTED",
          ...ref,
          summary: `ขอรีวิวหลังใช้บริการ (journey "${env.rule.name}")`.slice(0, 500),
          data: asJson({ journeyId: env.rule.id, runId: env.runId }),
        },
      });
      return { ...base, ok: true, note: "บันทึกคำขอรีวิวแล้ว" };
    }
    default:
      return { ...base, ok: false, skipped: true, note: "การกระทำนี้ไม่รองรับใน journey" };
  }
}

/** ทำขั้นตามลำดับ · `baseIndex` = เลขขั้นแบบไล่ลึกของขั้นแรกในรายการนี้ (ตรงกับ flattenActions) */
async function executeActions(env: ExecEnv, actions: JourneyAction[], baseIndex: number, depth: number): Promise<{ steps: StepOutcome[]; voucherId: string | null }> {
  const steps: StepOutcome[] = [];
  let index = baseIndex;
  for (const action of actions) {
    const outcome = await runAction(env, action, index, depth);
    steps.push(outcome);
    if (outcome.ok) await logStep(env, index, action, outcome.note, env.runId).catch(() => null);
    index += 1 + countActions(thenActionsOf(action));
  }
  return { steps, voucherId: env.voucherId };
}

// ───────────────────────── cron รายชั่วโมง: ขั้นที่รอเวลา ─────────────────────────

function waitPayloadOf(v: Prisma.JsonValue | null): WaitPayload {
  const p = (v ?? {}) as Record<string, unknown>;
  const ev = (p.event ?? {}) as Record<string, unknown>;
  return {
    thenActions: Array.isArray(p.thenActions) ? (p.thenActions as JourneyAction[]) : [],
    ifVoucherUnused: p.ifVoucherUnused === true,
    voucherId: typeof p.voucherId === "string" ? p.voucherId : null,
    voucherCode: typeof p.voucherCode === "string" ? p.voucherCode : null,
    event: { type: typeof ev.type === "string" ? ev.type : "", payload: ev.payload ?? {} },
    parentRunId: typeof p.parentRunId === "string" ? p.parentRunId : "",
    baseIndex: numOr(p.baseIndex, 0),
    depth: numOr(p.depth, 1),
  };
}

/**
 * ขั้น "รอ n วัน" ที่ถึงเวลาแล้ว (ทุกร้าน · cron รายชั่วโมง) — journey ปิด/ลบ → ยกเลิก · ใช้ voucher แล้ว (ifVoucherUnused) → ข้าม
 * 🔴 จองแถวด้วย updateMany เงื่อนไข "ยังรอ + ยังไม่มีใครหยิบ" ⇒ cron 2 ตัวซ้อนกันหยิบแถวเดียวกันไม่ได้
 */
export async function runDueWaits(opts: { now?: Date; deps?: JourneyDeps; tenantId?: string; limit?: number } = {}): Promise<{ ran: number }> {
  const now = opts.now ?? new Date();
  const due = await prisma.automationRun.findMany({
    where: { status: "WAITING", finishedAt: null, scheduledAt: { lte: now }, journeyId: { not: null }, ...(opts.tenantId ? { tenantId: opts.tenantId } : {}) },
    orderBy: { scheduledAt: "asc" },
    take: Math.min(Math.max(opts.limit ?? 500, 1), 2000),
    select: { id: true, tenantId: true, ruleId: true, customerId: true, stepIndex: true, payload: true },
  });
  let ran = 0;
  for (const w of due) {
    const claimed = await prisma.automationRun.updateMany({ where: { id: w.id, status: "WAITING", finishedAt: null }, data: { finishedAt: new Date() } });
    if (claimed.count !== 1) continue;
    ran += 1;
    try {
      await finishWait(w, now, opts.deps ?? {});
    } catch (e) {
      await prisma.automationRun.update({
        where: { id: w.id },
        data: { status: "FAILED", detail: `ทำขั้นหลังรอไม่สำเร็จ — ${(e instanceof Error ? e.message : String(e)).slice(0, 300)}` },
      }).catch(() => null);
    }
  }
  return { ran };
}

async function finishWait(
  w: { id: string; tenantId: string; ruleId: string; customerId: string | null; payload: Prisma.JsonValue | null },
  now: Date,
  deps: JourneyDeps,
): Promise<void> {
  const done = (status: "OK" | "SKIPPED" | "CANCELLED", detail: string, extra: Record<string, unknown> = {}) =>
    prisma.automationRun.update({ where: { id: w.id }, data: { status, detail, payload: asJson({ ...(w.payload as Record<string, unknown> ?? {}), ...extra }) } });

  const rule = (await prisma.automationRule.findFirst({ where: { id: w.ruleId, tenantId: w.tenantId }, select: RULE_SELECT })) as RuleRow | null;
  if (!rule || !rule.enabled) {
    await done("CANCELLED", "ยกเลิก — journey ถูกปิดหรือลบก่อนถึงเวลา");
    return;
  }
  const customer = w.customerId
    ? ((await prisma.customer.findFirst({ where: { id: w.customerId, tenantId: w.tenantId }, select: CUSTOMER_SELECT })) as CustomerRow | null)
    : null;
  if (!customer || customer.status === "MERGED") {
    await done("CANCELLED", "ยกเลิก — สมาชิกคนนี้ถูกลบหรือรวมเข้ากับอีกคนไปแล้ว");
    return;
  }
  const p = waitPayloadOf(w.payload);
  if (p.ifVoucherUnused && p.voucherId) {
    const v = await prisma.voucher.findFirst({ where: { id: p.voucherId, tenantId: w.tenantId }, select: { status: true } });
    if (v?.status === "USED") {
      await done("SKIPPED", "ข้าม — ลูกค้าใช้ voucher แล้ว (used) ไม่ต้องตามซ้ำ");
      return;
    }
  }
  const env: ExecEnv = { rule, customer, runId: w.id, event: p.event, now, deps, voucherId: p.voucherId, voucherCode: p.voucherCode };
  const res = await executeActions(env, p.thenActions, p.baseIndex, p.depth);
  await done("OK", summarize(res.steps), { steps: res.steps });
}

// ───────────────────────── cron รายวัน: ยิง event ตามรอบเวลา ─────────────────────────

type CronGroup = { tenantId: string; memberSystemId: string; event: string; paramKey: string | null; value: number; rules: RuleRow[] };

function groupCronRules(rules: RuleRow[]): CronGroup[] {
  const map = new Map<string, CronGroup>();
  for (const r of rules) {
    if (!r.memberSystemId) continue;
    const def = journeyTriggerDef(r.event);
    if (!def?.cron) continue;
    const value = def.param ? numOr(triggerOf(r).params?.[def.param.key], def.param.def) : 0;
    const key = `${r.tenantId}|${r.memberSystemId}|${r.event}|${value}`;
    const g = map.get(key) ?? { tenantId: r.tenantId, memberSystemId: r.memberSystemId, event: r.event, paramKey: def.param?.key ?? null, value, rules: [] };
    g.rules.push(r);
    map.set(key, g);
  }
  return [...map.values()];
}

const notMerged: Prisma.CustomerWhereInput = { status: { not: "MERGED" } };

/**
 * ผู้เข้าเกณฑ์ของทริกเกอร์รอบเวลา
 *   mode "today"  = ของวันนี้ (cron ยิงจริง) · mode "window" = ย้อนหลัง `days` วัน (ทดลองรัน)
 * 🔴 "ไม่ซื้อ/ไม่จอง n วัน" ใช้ lastActivityAt และตกไปใช้วันสมัครเมื่อยังไม่เคยมีกิจกรรม —
 *    ไม่งั้นสมาชิกที่เพิ่งสมัครเมื่อวาน (ยังไม่มีกิจกรรม) จะถูกนับว่า "หายไปนาน" ตั้งแต่วันแรก
 */
async function cronCandidates(g: { tenantId: string; memberSystemId: string; event: string; value: number }, now: Date, mode: "today" | "window", days = 30): Promise<string[]> {
  const base: Prisma.CustomerWhereInput = { tenantId: g.tenantId, memberSystemId: g.memberSystemId, ...notMerged };
  if (g.event === "member.birthday.upcoming") {
    const targets = new Set<string>();
    const span = mode === "today" ? 1 : Math.max(1, Math.min(days, 366));
    for (let k = 0; k < span; k += 1) targets.add(thaiMonthDay(now, g.value - k));
    // ปีที่ไม่มี 29 ก.พ. — คนเกิด 29 ก.พ. ได้ของขวัญวันที่ 28 แทน (ไม่ใช่ไม่ได้เลย)
    const y = new Date(now.getTime() + BKK_MS).getUTCFullYear();
    const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
    const rows = await prisma.customer.findMany({ where: { ...base, birthDate: { not: null } }, select: { id: true, birthDate: true } });
    return rows
      .filter((r) => {
        const md = r.birthDate!.toISOString().slice(5, 10);
        return targets.has(md) || (!leap && md === "02-29" && targets.has("02-28"));
      })
      .map((r) => r.id);
  }
  if (g.event === "member.inactive") {
    const cutoff = new Date(now.getTime() - g.value * DAY_MS);
    const rows = await prisma.customer.findMany({
      where: { ...base, OR: [{ lastActivityAt: { lte: cutoff } }, { lastActivityAt: null, createdAt: { lte: cutoff } }] },
      select: { id: true },
    });
    return rows.map((r) => r.id);
  }
  if (g.event === "member.tier.review_due") {
    const dayStart = (offset: number) => new Date(Date.parse(`${thaiDayKey(new Date(now.getTime() + offset * DAY_MS))}T00:00:00+07:00`));
    const from = mode === "today" ? dayStart(g.value) : dayStart(0);
    const to = mode === "today" ? dayStart(g.value + 1) : dayStart(g.value + 1);
    const rows = await prisma.customer.findMany({ where: { ...base, tierReviewAt: { gte: from, lt: to } }, select: { id: true } });
    return rows.map((r) => r.id);
  }
  return [];
}

/** คนที่ "เข้าไปแล้วภายในหน้าต่างเข้าซ้ำ" ของ journey เส้นนี้ */
async function reentryBlocked(rule: RuleRow, customerIds: string[], now: Date): Promise<Set<string>> {
  if (customerIds.length === 0) return new Set();
  const rows = await prisma.automationRun.findMany({
    where: {
      ruleId: rule.id,
      customerId: { in: customerIds },
      stepIndex: null,
      status: { in: ["OK", "HOLDOUT", "FAILED"] },
      ...(rule.reentryDays !== null ? { createdAt: { gte: new Date(now.getTime() - rule.reentryDays * DAY_MS) } } : {}),
    },
    select: { customerId: true },
  });
  return new Set(rows.map((r) => r.customerId).filter((x): x is string => !!x));
}

async function passingConditions(ctx: MemberCtx, def: SegmentDefinition, customerIds: string[]): Promise<Set<string>> {
  if (customerIds.length === 0) return new Set();
  if (!hasConditions(def)) return new Set(customerIds);
  try {
    const where = await evaluateSegment(ctx, def);
    const rows = await prisma.customer.findMany({ where: { AND: [where, { id: { in: customerIds } }] }, select: { id: true } });
    return new Set(rows.map((r) => r.id));
  } catch {
    return new Set();
  }
}

/** คนที่เพิ่งถูก "ข้าม" (เงื่อนไข/โควตา) ในเส้นนี้ภายใน `days` วัน — cron ไม่ยิงซ้ำทุกวัน รอตรวจใหม่รอบถัดไป */
async function recentlySkipped(rule: RuleRow, customerIds: string[], now: Date, days: number): Promise<Set<string>> {
  if (customerIds.length === 0) return new Set();
  const rows = await prisma.automationRun.findMany({
    where: { ruleId: rule.id, customerId: { in: customerIds }, stepIndex: null, status: "SKIPPED", createdAt: { gte: new Date(now.getTime() - days * DAY_MS) } },
    select: { customerId: true },
  });
  return new Set(rows.map((r) => r.customerId).filter((x): x is string => !!x));
}

/** cron ตรวจคนที่เคยถูกข้ามซ้ำทุกกี่วัน (ไม่ใช่ทุกวัน — แถว "ข้าม" นับรวมในโควตาเดือนด้วย) */
const CRON_SKIP_RECHECK_DAYS = 7;

/**
 * cron รายวัน — ยิง event ของทริกเกอร์รอบเวลา (วันเกิด · หายไปนาน · ใกล้รอบทบทวนระดับ) ให้เฉพาะ
 * ค่าพารามิเตอร์ที่มี journey เปิดใช้อยู่จริง · idempotencyKey ต่อ (ทริกเกอร์, คน, วันไทย, ค่าพารามิเตอร์)
 * 🔴 คัดคนที่ "ยิงไปก็เปล่า" ออกก่อน: เข้าไปแล้วในหน้าต่างเข้าซ้ำ · หรือเพิ่งถูกข้ามใน 7 วัน (ตรวจใหม่สัปดาห์ละครั้ง)
 *    ไม่งั้นคนหายไปนาน 2,000 คนที่ไม่เข้าเงื่อนไขจะกลายเป็นแถว "ข้าม" 2,000 แถวทุกวัน แล้วกินโควตาเดือนหมดใน 3 วัน
 *    (ไม่คัดด้วยเงื่อนไขล่วงหน้า — ร้านต้องเห็นในหน้ารายละเอียดว่าใครถูกข้ามเพราะเงื่อนไขอะไร)
 */
export async function emitJourneyCronEvents(opts: { now?: Date; tenantId?: string } = {}): Promise<{ emitted: number; byEvent: Record<string, number> }> {
  const now = opts.now ?? new Date();
  const rules = (await prisma.automationRule.findMany({
    where: { scope: SCOPE, enabled: true, event: { in: [...JOURNEY_CRON_TRIGGERS] }, memberSystemId: { not: null }, ...(opts.tenantId ? { tenantId: opts.tenantId } : {}) },
    select: RULE_SELECT,
  })) as RuleRow[];
  const day = thaiDayKey(now);
  const byEvent: Record<string, number> = {};
  let emitted = 0;
  for (const g of groupCronRules(rules)) {
    try {
      const candidates = await cronCandidates(g, now, "today");
      if (candidates.length === 0) continue;
      const eligible = new Set<string>();
      for (const rule of g.rules) {
        const blocked = await reentryBlocked(rule, candidates, now);
        const skipped = await recentlySkipped(rule, candidates, now, CRON_SKIP_RECHECK_DAYS);
        for (const id of candidates) if (!blocked.has(id) && !skipped.has(id)) eligible.add(id);
      }
      const ids = [...eligible];
      for (let i = 0; i < ids.length; i += CRON_EMIT_CHUNK) {
        await emitOutboxMany(
          prisma,
          ids.slice(i, i + CRON_EMIT_CHUNK).map((customerId) => ({
            tenantId: g.tenantId,
            type: g.event,
            idempotencyKey: `journey-cron:${g.event}:${customerId}:${day}${g.paramKey ? `:${g.value}` : ""}`,
            systemId: g.memberSystemId,
            payload: { customerId, ...(g.paramKey ? { [g.paramKey]: g.value } : {}), day },
          })),
        );
      }
      byEvent[g.event] = (byEvent[g.event] ?? 0) + ids.length;
      emitted += ids.length;
    } catch {
      // กลุ่มหนึ่ง (ร้าน/ระบบ) พังต้องไม่ล้มทั้งรอบ — พรุ่งนี้ได้ใหม่
    }
  }
  return { emitted, byEvent };
}

// ───────────────────────── ทดลองรัน ─────────────────────────

/** สมาชิกที่ "เกิด event นี้" ย้อนหลัง `days` วัน (อ่าน OutboxEvent · แปลงบิล/นัด/บัตรเป็นสมาชิกทีเดียวทั้งชุด) */
async function eventCandidates(rule: RuleRow, memberSystemId: string, now: Date, days: number): Promise<string[]> {
  const events = await prisma.outboxEvent.findMany({
    where: { tenantId: rule.tenantId, type: rule.event, createdAt: { gte: new Date(now.getTime() - days * DAY_MS) } },
    select: { payload: true },
    take: 5000,
    orderBy: { createdAt: "desc" },
  });
  const ids = new Set<string>();
  const sales: string[] = [];
  const appts: string[] = [];
  const cards: string[] = [];
  for (const e of events) {
    const p = (e.payload ?? {}) as Record<string, unknown>;
    const direct = ID_KEYS.map((k) => p[k]).find((v): v is string => typeof v === "string" && !!v);
    if (direct) ids.add(direct);
    else if (typeof p.saleId === "string") sales.push(p.saleId);
    else if (typeof p.appointmentId === "string") appts.push(p.appointmentId);
    else if (typeof p.giftCardId === "string") cards.push(p.giftCardId);
  }
  if (sales.length) for (const s of await prisma.posSale.findMany({ where: { tenantId: rule.tenantId, id: { in: sales } }, select: { memberId: true } })) if (s.memberId) ids.add(s.memberId);
  if (appts.length) for (const a of await prisma.appointment.findMany({ where: { tenantId: rule.tenantId, id: { in: appts } }, select: { customerId: true } })) if (a.customerId) ids.add(a.customerId);
  if (cards.length) for (const g of await prisma.giftCard.findMany({ where: { tenantId: rule.tenantId, id: { in: cards } }, select: { ownerCustomerId: true } })) if (g.ownerCustomerId) ids.add(g.ownerCustomerId);
  if (ids.size === 0) return [];
  const rows = await prisma.customer.findMany({ where: { tenantId: rule.tenantId, memberSystemId, id: { in: [...ids] }, ...notMerged }, select: { id: true } });
  return rows.map((r) => r.id);
}

/**
 * ทดลองรัน — **ไม่เขียนอะไรเลย** · ทริกเกอร์รอบเวลา = ใครเข้าเกณฑ์ (ย้อนหลัง `days` วันของวันเกิด · หายไปนาน ณ ตอนนี้)
 * ทริกเกอร์เหตุการณ์ = ใครเกิด event นี้ย้อนหลัง `days` วัน · แล้วไล่ด่านเดียวกับของจริง (เงื่อนไข → เข้าซ้ำ → กลุ่มเทียบ)
 */
export async function dryRun(ctx: MemberCtx, actor: MemberActor, journeyId: string, opts: { days?: number } = {}): Promise<JourneyDryRun & { skippedByReentry: number; days: number }> {
  requireRead(actor);
  return dryRunRule(ctx, await loadRule(ctx, journeyId), opts.days);
}

/** ทดลองรัน journey ที่ยังไม่ได้บันทึก (ตัวสร้างกด "ทดลองรัน" ก่อน "บันทึก Journey") — ตรวจ input ชุดเดียวกับตอนบันทึก */
export async function dryRunDraft(ctx: MemberCtx, actor: MemberActor, input: SaveJourneyInput, opts: { days?: number } = {}): Promise<JourneyDryRun & { skippedByReentry: number; days: number }> {
  requireRead(actor);
  const v = await cleanInput(ctx, input);
  const now = new Date();
  const draft: RuleRow = {
    id: `draft:${ctx.systemId}`,
    tenantId: ctx.tenantId,
    name: v.name,
    enabled: true,
    event: v.trigger.event,
    conditions: v.conditions as unknown as Prisma.JsonValue,
    actions: v.actions as unknown as Prisma.JsonValue,
    memberSystemId: ctx.systemId,
    holdoutPct: v.holdoutPct,
    reentryDays: v.reentryDays,
    trigger: v.trigger as unknown as Prisma.JsonValue,
    createdAt: now,
    updatedAt: now,
  };
  return dryRunRule(ctx, draft, opts.days);
}

async function dryRunRule(ctx: MemberCtx, rule: RuleRow, daysIn?: number): Promise<JourneyDryRun & { skippedByReentry: number; days: number }> {
  const days = Math.max(1, Math.min(Math.round(numOr(daysIn, 30)), 365));
  const now = new Date();
  const def = journeyTriggerDef(rule.event);
  const value = def?.param ? numOr(triggerOf(rule).params?.[def.param.key], def.param.def) : 0;
  const candidates = def?.cron
    ? await cronCandidates({ tenantId: ctx.tenantId, memberSystemId: ctx.systemId, event: rule.event, value }, now, "window", days)
    : await eventCandidates(rule, ctx.systemId, now, days);
  const passing = [...(await passingConditions(ctx, conditionsOf(rule), candidates))];
  const blocked = await reentryBlocked(rule, passing, now);
  const open = passing.filter((id) => !blocked.has(id));
  const holdout = rule.holdoutPct > 0 ? open.filter((id) => hashPct(rule.id, id) < rule.holdoutPct).length : 0;
  const wouldEnter = open.length - holdout;
  return {
    candidates: candidates.length,
    wouldEnter,
    holdout,
    skippedByConditions: candidates.length - passing.length,
    skippedByReentry: blocked.size,
    days,
    perStep: flattenActions(actionsOf(rule)).map((s) => ({ index: s.index, type: s.action.type, label: describeAction(s.action), count: wouldEnter })),
  };
}

// ───────────────────────── สถิติ ─────────────────────────

type StatsCore = {
  entered: number;
  sent: number;
  used: number;
  saleSatang: number;
  costSatang: number;
  holdEntered: number;
  holdConverted: number;
  perStep: { index: number; label: string; count: number }[];
  daily: { date: string; used: number }[];
  recent: JourneyRecentRow[];
  waitingByCustomer: Map<string, number>;
};

async function computeStats(rule: RuleRow, since: Date, now: Date, days: number, detail: boolean): Promise<StatsCore> {
  const mains = await prisma.automationRun.findMany({
    where: { ruleId: rule.id, stepIndex: null, status: { in: ["OK", "HOLDOUT"] }, createdAt: { gte: since } },
    select: { id: true, customerId: true, status: true, createdAt: true, payload: true },
    orderBy: { createdAt: "asc" },
  });
  const stepsRows = await prisma.automationRun.findMany({
    where: { ruleId: rule.id, stepIndex: { not: null }, createdAt: { gte: since } },
    select: { customerId: true, status: true, stepIndex: true, payload: true, scheduledAt: true },
  });
  const vouchers = await prisma.voucher.findMany({
    where: { tenantId: rule.tenantId, origin: "JOURNEY", originRef: { path: ["journeyId"], equals: rule.id }, issuedAt: { gte: since } },
    select: { customerId: true, status: true, kind: true, value: true, usedAt: true, usedRef: true, originRef: true },
  });

  // เข้าครั้งแรกในหน้าต่างของแต่ละคน (คนเดียวเข้าหลายรอบ = นับครั้งแรก เพื่อไม่ให้ยอดซื้อถูกนับซ้ำ)
  const firstEntry = new Map<string, { at: Date; holdout: boolean }>();
  for (const m of mains) if (m.customerId && !firstEntry.has(m.customerId)) firstEntry.set(m.customerId, { at: m.createdAt, holdout: m.status === "HOLDOUT" });
  const cids = [...firstEntry.keys()];
  const sales = cids.length
    ? await prisma.posSale.findMany({
        where: { tenantId: rule.tenantId, memberId: { in: cids }, status: "PAID", createdAt: { gte: since } },
        select: { memberId: true, grandTotalSatang: true, paidAt: true, createdAt: true },
        orderBy: { createdAt: "asc" },
      })
    : [];

  const window = JOURNEY_ATTRIBUTION_DAYS * DAY_MS;
  const usedAtBy = new Map<string, Date>();
  let saleSatang = 0;
  let holdConverted = 0;
  for (const [cid, entry] of firstEntry) {
    const sale = sales.find((s) => s.memberId === cid && (s.paidAt ?? s.createdAt).getTime() >= entry.at.getTime() && (s.paidAt ?? s.createdAt).getTime() <= entry.at.getTime() + window);
    if (entry.holdout) {
      if (sale) holdConverted += 1;
      continue;
    }
    const v = vouchers.find((x) => x.customerId === cid && x.status === "USED" && x.usedAt && x.usedAt.getTime() >= entry.at.getTime());
    const at = sale ? (sale.paidAt ?? sale.createdAt) : v?.usedAt ?? null;
    if (at) {
      usedAtBy.set(cid, at);
      if (sale) saleSatang += sale.grandTotalSatang;
    }
  }

  let costSatang = 0;
  for (const v of vouchers) {
    if (v.status !== "USED") continue;
    const ref = (v.usedRef ?? {}) as Record<string, unknown>;
    costSatang += v.kind === "FIXED" ? v.value : Math.max(0, Math.round(numOr(ref.discountSatang, 0)));
  }
  const outcomes: StepOutcome[] = [];
  for (const r of [...mains, ...stepsRows]) {
    const p = (r.payload ?? {}) as { steps?: unknown };
    if (Array.isArray(p.steps)) outcomes.push(...(p.steps as StepOutcome[]));
  }
  for (const o of outcomes) if (o.ok && o.channel) costSatang += JOURNEY_CHANNEL_COST_SATANG[o.channel] ?? 0;

  const okCount = mains.filter((m) => m.status === "OK").length;
  const holdEntered = mains.filter((m) => m.status === "HOLDOUT").length;

  const flat = flattenActions(actionsOf(rule));
  const perStep = flat.map((s) => {
    let count = 0;
    if (s.action.type === "ISSUE_VOUCHER") count = vouchers.filter((v) => numOr((v.originRef as Record<string, unknown> | null)?.step, -1) === s.index).length;
    else if (s.action.type === "WAIT_THEN") count = stepsRows.filter((r) => r.stepIndex === s.index && (r.status === "WAITING" || r.status === "OK")).length;
    else count = outcomes.filter((o) => o.i === s.index && o.ok).length;
    return { index: s.index, label: `${s.depth > 0 ? "หลังรอ: " : ""}${describeAction(s.action)}`, count };
  });

  const waitingByCustomer = new Map<string, number>();
  for (const r of stepsRows) if (r.status === "WAITING" && r.customerId && r.stepIndex !== null) waitingByCustomer.set(r.customerId, r.stepIndex);

  const daily: { date: string; used: number }[] = [];
  const recent: JourneyRecentRow[] = [];
  if (detail) {
    for (let k = days - 1; k >= 0; k -= 1) {
      const key = thaiDayKey(new Date(now.getTime() - k * DAY_MS));
      daily.push({ date: key, used: [...usedAtBy.values()].filter((d) => thaiDayKey(d) === key).length });
    }
    const latest = [...mains].reverse().slice(0, 20);
    const names = latest.length
      ? await prisma.customer.findMany({ where: { id: { in: latest.map((m) => m.customerId).filter((x): x is string => !!x) } }, select: { id: true, name: true, firstName: true, lastName: true } })
      : [];
    const nameOf = new Map(names.map((n) => [n.id, displayName(n)]));
    for (const m of latest) {
      if (!m.customerId) continue;
      const waitIdx = waitingByCustomer.get(m.customerId);
      const waitStep = waitIdx !== undefined ? flat.find((s) => s.index === waitIdx) : undefined;
      const p = (m.payload ?? {}) as { steps?: StepOutcome[] };
      const lastOk = Array.isArray(p.steps) ? [...p.steps].reverse().find((s) => s.ok && s.type !== "WAIT_THEN") : undefined;
      const stepLabel = m.status === "HOLDOUT"
        ? "กลุ่มเทียบ (ไม่ได้ส่ง)"
        : waitStep
          ? describeAction(waitStep.action)
          : lastOk
            ? describeAction(flat.find((s) => s.index === lastOk.i)?.action ?? { type: lastOk.type })
            : "จบ journey";
      recent.push({
        customerId: m.customerId,
        name: nameOf.get(m.customerId) ?? "สมาชิก",
        enteredAt: m.createdAt,
        stepLabel,
        status: m.status === "HOLDOUT" ? "กลุ่มเทียบ" : waitStep ? "รอ" : "จบแล้ว",
        used: usedAtBy.has(m.customerId),
      });
    }
  }

  return {
    entered: mains.length,
    sent: okCount,
    used: usedAtBy.size,
    saleSatang,
    costSatang,
    holdEntered,
    holdConverted,
    perStep,
    daily,
    recent,
    waitingByCustomer,
  };
}

const pct1 = (a: number, b: number): number => (b > 0 ? Math.round((a / b) * 1000) / 10 : 0);

export async function journeyStats(ctx: MemberCtx, actor: MemberActor, id: string, opts: { days?: number } = {}): Promise<JourneyStatsView> {
  requireRead(actor);
  const rule = await loadRule(ctx, id);
  const days = Math.max(1, Math.min(Math.round(numOr(opts.days, 30)), 365));
  const now = new Date();
  const s = await computeStats(rule, new Date(now.getTime() - days * DAY_MS), now, days, true);
  const usedPct = pct1(s.used, s.sent);
  const convertedPct = pct1(s.holdConverted, s.holdEntered);
  const view: JourneyStatsView = {
    entered: s.entered,
    perStep: s.perStep,
    holdout: { entered: s.holdEntered, converted: s.holdConverted, convertedPct },
    results: { sent: s.sent, used: s.used, usedPct, saleSatang: s.saleSatang, costSatang: s.costSatang, roi: journeyRoi(s.saleSatang, s.costSatang) },
    uplift: Math.round((usedPct - convertedPct) * 10) / 10,
    daily: s.daily,
    recent: s.recent,
  };
  await prisma.automationRule.update({
    where: { id: rule.id },
    data: {
      journeyStats: asJson({
        at: now.toISOString(),
        days,
        entered: view.entered,
        results: view.results,
        holdout: view.holdout,
        uplift: view.uplift,
        perStep: view.perStep,
      }),
    },
  });
  return view;
}

export async function listJourneys(ctx: MemberCtx, actor: MemberActor): Promise<JourneyListRow[]> {
  requireRead(actor);
  const rows = (await prisma.automationRule.findMany({
    where: { tenantId: ctx.tenantId, scope: SCOPE, memberSystemId: ctx.systemId },
    orderBy: { createdAt: "asc" },
    select: RULE_SELECT,
    take: 200,
  })) as RuleRow[];
  if (rows.length === 0) return [];
  const fields = await listSegmentFields(ctx).catch(() => []);
  const now = new Date();
  // 🔴 ตัวเลขในตารางคือ "เดือนนี้" (หัวคอลัมน์ภาพ 07 = ส่งเดือนนี้) — นับตั้งแต่ต้นเดือนไทย
  const since = thaiMonthStart(now);
  const out: JourneyListRow[] = [];
  for (const r of rows) {
    const s = await computeStats(r, since, now, 30, false);
    const def = conditionsOf(r);
    out.push({
      id: r.id,
      name: r.name,
      enabled: r.enabled,
      trigger: triggerOf(r),
      summary: describeJourney(triggerOf(r), actionsOf(r), hasConditions(def) ? describeDefinition(fields, def) : ""),
      stats30d: { entered: s.sent, used: s.used, saleSatang: s.saleSatang, costSatang: s.costSatang, roi: journeyRoi(s.saleSatang, s.costSatang) },
    });
  }
  return out;
}

// ───────────────────────── หน้ารายละเอียด (ภาพ 22) ─────────────────────────

export type JourneyDetailView = {
  journey: JourneyDto;
  conditionSummary: string;
  triggerSummary: string;
  steps: JourneyStepView[];
  stats: JourneyStatsView;
};

/** การ์ดขั้นตอนตามภาพ 22: เมื่อ → ถ้า → ให้ทำ (ขั้นติดกันรวมการ์ดเดียว) → รอ n วัน → หลังรอ */
export async function journeyDetail(ctx: MemberCtx, actor: MemberActor, id: string, opts: { days?: number } = {}): Promise<JourneyDetailView> {
  requireRead(actor);
  const rule = await loadRule(ctx, id);
  const stats = await journeyStats(ctx, actor, id, opts);
  const journey = toDto(rule);
  const fields = await listSegmentFields(ctx).catch(() => []);
  const conditionSummary = hasConditions(journey.conditions) ? describeDefinition(fields, journey.conditions) : "สมาชิกทุกคน";
  const def = journeyTriggerDef(journey.trigger.event);
  const since = new Date(Date.now() - (opts.days ?? 30) * DAY_MS);
  const touched = await prisma.automationRun.count({ where: { ruleId: rule.id, stepIndex: null, createdAt: { gte: since } } });
  const countOf = (index: number) => stats.perStep.find((s) => s.index === index)?.count ?? 0;

  const steps: JourneyStepView[] = [
    {
      index: -2,
      kind: "TRIGGER",
      tag: "เมื่อ (trigger)",
      title: describeTrigger(journey.trigger),
      note: def?.cron ? "ตรวจทุกวัน 06:00" : "ทันทีที่เกิดเหตุการณ์",
      count: touched,
      countLabel: "คนเข้า",
    },
    {
      index: -1,
      kind: "CONDITION",
      tag: "ถ้า (เงื่อนไข)",
      title: conditionSummary,
      note: journey.holdoutPct > 0 ? `กรองก่อนออกสิทธิ์ · กันกลุ่มเทียบ ${journey.holdoutPct}%` : "กรองก่อนออกสิทธิ์",
      count: stats.entered,
      countLabel: "คนผ่าน",
    },
  ];
  const flat = flattenActions(journey.actions);
  const pushGroup = (group: typeof flat, tag: string) => {
    if (group.length === 0) return;
    steps.push({
      index: group[0]!.index,
      kind: "ACTION",
      tag,
      title: group.map((g) => describeAction(g.action)).join(" + "),
      note: group.map((g) => g.action.type === "ISSUE_VOUCHER" ? "ออกเป็นรายคน" : g.action.type === "GIVE_POINTS" ? "เข้ากระเป๋าแต้มทันที" : "").filter(Boolean)[0] ?? "ทำทันที",
      count: Math.min(...group.map((g) => countOf(g.index))),
      countLabel: "ได้รับ",
    });
  };
  const walk = (list: JourneyAction[], start: number, depth: number, afterWait: string | null) => {
    let group: typeof flat = [];
    let index = start;
    for (const a of list) {
      const me = flat.find((f) => f.index === index)!;
      if (a.type === "WAIT_THEN") {
        pushGroup(group, afterWait ?? "ให้ทำ");
        group = [];
        const p = a.params ?? {};
        steps.push({
          index,
          kind: "WAIT",
          tag: `รอ ${numOr(p.days, 0)} วัน`,
          title: p.ifVoucherUnused === true ? "ถ้ายังไม่ใช้ voucher" : "แล้วค่อยทำต่อ",
          note: p.ifVoucherUnused === true ? "เข้าเงื่อนไขจึงส่งซ้ำ" : "นับจากขั้นก่อนหน้า",
          count: countOf(index),
          countLabel: p.ifVoucherUnused === true ? "ยังไม่ใช้" : "รอ/ทำแล้ว",
        });
        walk(thenActionsOf(a), index + 1, depth + 1, `หลังรอ ${numOr(p.days, 0)} วัน`);
      } else {
        group.push(me);
      }
      index += 1 + countActions(thenActionsOf(a));
    }
    pushGroup(group, afterWait ?? "ให้ทำ");
  };
  walk(journey.actions, 0, 0, null);
  return { journey, conditionSummary, triggerSummary: describeTrigger(journey.trigger), steps, stats };
}

/** ตัวเลือกของตัวสร้าง (ฟิลด์เงื่อนไข · แบบ voucher · บอร์ดงาน) — หน้าจอเรียกตัวนี้ทีเดียว */
export async function journeyBuilderOptions(ctx: MemberCtx, actor: MemberActor): Promise<{
  fields: Awaited<ReturnType<typeof listSegmentFields>>;
  templates: { id: string; label: string }[];
  boards: { id: string; name: string }[];
}> {
  requireRead(actor);
  const [fields, templates, boards] = await Promise.all([
    listSegmentFields(ctx),
    prisma.voucherTemplate.findMany({
      where: { tenantId: ctx.tenantId, systemId: ctx.systemId, active: true },
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true, kind: true, value: true, validDays: true },
      take: 100,
    }),
    prisma.kanbanBoard.findMany({ where: { tenantId: ctx.tenantId, status: "ACTIVE" }, orderBy: { createdAt: "asc" }, select: { id: true, name: true }, take: 100 }),
  ]);
  return {
    fields,
    templates: templates.map((t) => ({
      id: t.id,
      label: `${t.kind === "FIXED" ? `฿${Math.round(t.value / 100).toLocaleString("th-TH")}` : t.kind === "PERCENT" ? `${t.value}%` : t.name} · อายุ ${t.validDays} วัน · ${t.name}`,
    })),
    boards,
  };
}
