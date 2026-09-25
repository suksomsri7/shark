// scoring.ts — คะแนนผู้ติดต่อ (lead scoring · ใบ C2.8 · พิมพ์เขียว §5.7 §11.5 §4.5 §7.1 §7.5 · ภาพ 05)
//
// ── หน้าที่ ─────────────────────────────────────────────────────────────────────
//   • กฎคะแนน (`CrmScoreRule`): กฎเริ่มต้น 8 ข้อจากข้อมูลกลางของ C1.11 + สร้าง/แก้/เปิด-ปิด/ลบ/เรียงลำดับ
//   • `onEvent` — ทางเข้าการให้คะแนนทางเดียวของระบบ (สะพาน `crm-bridges/scoring.ts` · ฟอร์ม · ข้อสอบเรียกตรง)
//   • `adjust` — ปรับคะแนนรายการเดียว (การกระทำ ADJUST_SCORE ของ C2.1 · `FormDef.scoreOnSubmit` ของ C2.6 · คนกดเอง)
//   • `decay` / `applyInactivity` — งานรายวัน `crm.scoring.decay` (หมดอายุแต้ม · หักแต้มคนที่เงียบหาย)
//   • `explain` (เหตุผล 3 ข้อล่าสุด — ภาพ 05) · `recompute` (คำนวณใหม่ · ทั้งร้าน = การกระทำอันตราย) · ตั้งค่าระดับคะแนน
//
// ── กติกาที่ห้ามหัก ────────────────────────────────────────────────────────────
// 1) AUDIT-CLASS X1 ขอบเขต: `ctx.systemId` ถูก resolve ใหม่ทุกคำสั่ง (id + ร้าน + ชนิด CRM) · ผู้ติดต่อ/กฎของระบบอื่นหรือร้านอื่น
//    = "ไม่พบ" (404 ไม่ใช่ 403) · ทุกการอ่านของคนผ่าน `contactWhere` (= `visibleWhere` ของ C1.7) · งานกวาดผูก tenantIds/systemIds
// 2) AUDIT-CLASS X3 ตัวนับร่วม: คะแนนขยับด้วย **คำสั่งเดียว** `SET "score" = GREATEST(0, "score" ± n)` (ไม่มีวันอ่านมาบวกใน JS)
//    · เพดาน `maxPerDay` ตัดสินด้วย **INSERT เงื่อนไขเดียว** ที่พา `count(...)` ของตัวเองไปด้วย ใต้ advisory lock ต่อ (กฎ, คน, วันไทย)
//    ⇒ ยิงพร้อมกัน 50 ใบจาก 5 โพรเซสก็ได้แถวตามเพดานพอดี (บทเรียน [[reference_atomic_counter_single_statement]])
// 3) AUDIT-CLASS X4 กันซ้ำ: แถวของกฎใช้ partial UNIQUE (ruleId, eventKey) ของ migration `*_crm_v2_b` เป็นด่านจริง
//    (`ON CONFLICT DO NOTHING` — ไม่ใช่ "นับก่อนเขียน") · แถวปรับมือ (ruleId ว่าง) ใช้ advisory lock + `WHERE NOT EXISTS`
// 4) AUDIT-CLASS X5 งานกวาด: `decay` จองเป็นชุดด้วย `FOR UPDATE SKIP LOCKED … RETURNING` แล้ว "สรุปยอดใหม่" ต่อคน
//    (score = GREATEST(0, Σ แต้มที่ยังไม่หมดอายุ)) **ในธุรกรรมเดียวกับการจอง** ⇒ รันซ้อนกัน/ถูกฆ่ากลางรอบ = ไม่มีวันหักซ้ำ
//    และไม่มีวันทิ้งคะแนนเพี้ยนค้าง (ธงหมดอายุกับคะแนนเปลี่ยนพร้อมกันเสมอ) · วนจนเงียบ
// 5) AUDIT-CLASS X8 ข้อมูลส่วนตัว: payload ของ event และ `CrmScoreLog.reason` มีแต่ id/ตัวเลข/ชื่อกฎ — ไม่มีชื่อ เบอร์ อีเมลของลูกค้า
// 6) AUDIT-CLASS X9 ประวัติ: ทุกการเปลี่ยนแปลงเขียน `AuditLog` `crm.score.*` **ใน tx เดียวกับการเปลี่ยนแปลง** ·
//    ลบกฎ / คำนวณใหม่ทั้งร้าน = ยืนยัน + เหตุผล ≥ 5 ตัวอักษร
// 7) uiVersion 1 (กติกาถาวร R-E.14): ไม่ให้คะแนน ไม่หมดอายุ ไม่หักแต้ม (แถวคงไว้ทั้งหมด) · คำสั่งจัดการถูกปฏิเสธ ·
//    เปิด 2 อีกครั้ง = ทำงานต่อจากของเดิมทันที
// 8) ระดับคะแนน (band) มาจาก `settings.crm.scoring` ของระบบนั้น ๆ ผ่าน `bandOf` ตัวเดียว (ไม่มีเพดานพิมพ์ซ้ำ)

import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { emitOutbox } from "@/lib/core/outbox";
import { logOps } from "@/lib/core/ops";
import type { MemberActor } from "@/lib/modules/member";
import { prisma } from "./db";
import { crmCan, CrmForbiddenError } from "./access";
import { assertCrmV2, CrmV2DisabledError } from "./ui-version";
import { contactWhere } from "./where";
import { crmScoringSettingsOf, parseCrmSettings, setCrmScoringKeys, type CrmScoringSettings } from "./settings";
import { CENTRAL_SCORE_RULES } from "./templates/business/central";
import { CRM_CONDITION_OP_SET, CRM_VALUELESS_OPS, parseConditionField } from "./automation-shared";
import {
  bandOf,
  SCORE_DECAY_BATCH,
  SCORE_DELETE_REASON_MIN,
  SCORE_EXPIRES_DAYS_MAX,
  SCORE_EXPLAIN_LIMIT,
  SCORE_EXPLAIN_LIMIT_MAX,
  SCORE_INACTIVE_DEFAULT_DAYS,
  SCORE_INACTIVE_EVENT,
  SCORE_MAX_CONDITIONS,
  SCORE_MAX_PER_DAY_MAX,
  SCORE_POINTS_MAX,
  SCORE_POINTS_MIN,
  SCORE_REASON_MAX,
  SCORE_RECOMPUTE_REASON_MIN,
  SCORE_RULE_CHOICE_VALUES,
  SCORE_RULE_NAME_MAX,
  scoreEventLabel,
  thaiDayStartMs,
  DAY_MS,
  type ScoreBand,
  type ScoreExplain,
  type ScoreExplainItem,
  type ScoreRuleDto,
  type ScoreRuleInput,
  type ScoringSettings,
} from "./scoring-shared";

// ───────────────────────── ชนิด / error ─────────────────────────

export type ScoringCtx = { tenantId: string; systemId: string; actorUserId?: string | null };
type Tx = Prisma.TransactionClient;

export type ScoringErrorCode = "VALIDATION" | "NOT_FOUND" | "FORBIDDEN" | "CRM_V2_DISABLED";

export class ScoringError extends Error {
  readonly code: ScoringErrorCode;
  constructor(code: ScoringErrorCode, message: string) {
    super(message);
    this.name = "ScoringError";
    this.code = code;
  }
}

const fail = (code: ScoringErrorCode, message: string) => new ScoringError(code, message);

const MANAGE_KEY = "crm.score.manage";
const READ_KEY = "crm.contact.read";
const SYSTEM_NOT_FOUND = "ไม่พบระบบ CRM นี้ในร้าน";
const CONTACT_NOT_FOUND = "ไม่พบผู้ติดต่อรายนี้ในระบบนี้";
const RULE_NOT_FOUND = "ไม่พบกฎคะแนนข้อนี้ในระบบนี้";
const TX = { maxWait: 30_000, timeout: 60_000 } as const;
/** ธุรกรรมของงานกวาด (จอง + สรุปยอดทั้งชุดในใบเดียว) — ชุดละ `batchSize` แถว ⇒ ให้เวลามากกว่าคำสั่งเดี่ยว */
const TX_SWEEP = { maxWait: 30_000, timeout: 180_000 } as const;

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
const idOf = (v: unknown): string | null => {
  const s = str(v);
  return s ? s : null;
};
const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));
/** ISO ของ `Date` สำหรับคอลัมน์ `TIMESTAMP(3)` (ไม่มีโซน) — คู่กับ `::timestamptz AT TIME ZONE 'UTC'` ในคำสั่ง SQL */
const iso = (d: Date | null): string | null => (d ? d.toISOString() : null);

export type OnEventResult = { logged: number; points: number; score: number | null; band: ScoreBand | null; skipped?: string };

export type ScoreAdjustInput = {
  contactId: string;
  points: number;
  reason: string;
  refType?: string | null;
  refId?: string | null;
  eventKey?: string | null;
  expiresDays?: number | null;
  now?: Date;
};

export type ScoreSweepOpts = {
  now?: Date;
  tenantIds?: readonly string[];
  systemIds?: readonly string[];
  batchSize?: number;
  /** จำนวน "ชุด" สูงสุดของการเรียกครั้งนี้ (ไม่ส่ง = วนจนเงียบ) — มีไว้ให้ผู้เรียกที่อยากคุมจังหวะเอง เช่น ตัวทดสอบการตายกลางรอบ */
  maxBatches?: number;
  deadline?: number;
  signal?: AbortSignal;
};

// ───────────────────────── ทางเข้า (ระบบ → uiVersion → สิทธิ์) ─────────────────────────

type SysInfo = { systemId: string; uiVersion: 1 | 2; scoring: CrmScoringSettings };

/** AUDIT-CLASS X1: ระบบต้องเป็น CRM ของร้านนี้จริง (ห้ามเชื่อ id จากผู้เรียก) — คืน null เมื่อไม่พบ */
async function sysOf(ctx: ScoringCtx): Promise<SysInfo | null> {
  if (!ctx || typeof ctx.tenantId !== "string" || typeof ctx.systemId !== "string" || !ctx.tenantId || !ctx.systemId) return null;
  const row = await prisma.appSystem.findFirst({ where: { id: ctx.systemId, tenantId: ctx.tenantId, type: "CRM" }, select: { id: true, settings: true } });
  if (!row) return null;
  return { systemId: row.id, uiVersion: parseCrmSettings(row.settings).uiVersion, scoring: crmScoringSettingsOf(row.settings) };
}

async function requireSystem(ctx: ScoringCtx): Promise<SysInfo> {
  const s = await sysOf(ctx);
  if (!s) throw fail("NOT_FOUND", SYSTEM_NOT_FOUND);
  return s;
}

/** ลำดับตายตัว: ระบบ (NOT_FOUND) → uiVersion 2 (CRM_V2_DISABLED) → คีย์ `crm.score.manage` (FORBIDDEN) */
async function enter(ctx: ScoringCtx, actor: MemberActor | null | undefined): Promise<SysInfo> {
  if (!actor || actor.role === "CUSTOMER") throw fail("NOT_FOUND", SYSTEM_NOT_FOUND);
  const sys = await requireSystem(ctx);
  await assertCrmV2(ctx);
  if (!crmCan(actor, MANAGE_KEY)) throw new CrmForbiddenError(MANAGE_KEY);
  return sys;
}

/** ด่านของการ "อ่านเหตุผล" — คีย์อ่านผู้ติดต่อเท่านั้น (ภาพ 05: พนักงานขายที่เปิดการ์ดลูกค้าได้ต้องเห็นเหตุผล) */
async function enterRead(ctx: ScoringCtx, actor: MemberActor | null | undefined): Promise<SysInfo> {
  if (!actor || actor.role === "CUSTOMER") throw fail("NOT_FOUND", SYSTEM_NOT_FOUND);
  const sys = await requireSystem(ctx);
  await assertCrmV2(ctx);
  if (!crmCan(actor, READ_KEY)) throw new CrmForbiddenError(READ_KEY);
  return sys;
}

/** ด่านสาธารณะของหน้า/server action (ลำดับเดียวกับบริการ) */
export async function assertScoringAccess(ctx: ScoringCtx, actor: MemberActor | null | undefined): Promise<MemberActor> {
  await enter(ctx, actor);
  return actor as MemberActor;
}

// AUDIT-CLASS X9: แถวประวัติเขียนใน tx เดียวกับการเปลี่ยนแปลง (แบบ `assignment.ts#auditInTx` ของ C2.3 — ตัวเขียนเดียวกันของโมดูล)
async function auditInTx(tx: Tx, ctx: ScoringCtx, action: string, targetType: string, targetId: string, body: { before?: unknown; after?: unknown } = {}): Promise<void> {
  await tx.auditLog.create({
    data: {
      tenantId: ctx.tenantId,
      actorType: ctx.actorUserId ? "USER" : "SYSTEM",
      actorId: ctx.actorUserId ?? null,
      action: `crm.score.${action}`,
      targetType,
      targetId,
      ...(body.before !== undefined ? { before: body.before as Prisma.InputJsonValue } : {}),
      ...(body.after !== undefined ? { after: body.after as Prisma.InputJsonValue } : {}),
    },
  });
}

// ───────────────────────── กฎ: ตรวจ input ─────────────────────────

type RuleRow = {
  id: string;
  tenantId: string;
  systemId: string;
  name: string;
  event: string;
  conditions: Prisma.JsonValue;
  points: number;
  expiresDays: number | null;
  maxPerDay: number | null;
  active: boolean;
  isSystem: boolean;
  sortOrder: number;
};

const RULE_SELECT = {
  id: true, tenantId: true, systemId: true, name: true, event: true, conditions: true, points: true,
  expiresDays: true, maxPerDay: true, active: true, isSystem: true, sortOrder: true,
} as const;

const seedKeyOf = (conditions: Prisma.JsonValue | null | undefined): string | null => {
  const c = isObj(conditions) ? conditions : null;
  return c && typeof c.seedKey === "string" && c.seedKey ? c.seedKey : null;
};

const daysOf = (conditions: Prisma.JsonValue | null | undefined): number | null => {
  const c = isObj(conditions) ? conditions : null;
  const n = Number(c?.days);
  return Number.isInteger(n) && n > 0 ? n : null;
};

type CleanConditions = { mode: "AND" | "OR"; items: { field: string; op: string; value?: unknown }[]; days: number | null };

function conditionsIn(raw: unknown): CleanConditions {
  const c = isObj(raw) ? raw : {};
  const mode = str(c.mode).toUpperCase() === "OR" ? "OR" : "AND";
  const list = Array.isArray(c.items) ? c.items : [];
  if (list.length > SCORE_MAX_CONDITIONS) throw fail("VALIDATION", `เงื่อนไขของกฎคะแนนใส่ได้ไม่เกิน ${SCORE_MAX_CONDITIONS} ข้อ`);
  const items = list.map((it) => {
    const o = isObj(it) ? it : {};
    const field = str(o.field);
    if (!parseConditionField(field)) {
      throw fail("VALIDATION", `ไม่รู้จักฟิลด์เงื่อนไข "${field.slice(0, 40)}" — เลือกจากรายการของ CRM (ผู้ติดต่อ · บริษัท · ดีล · ฟิลด์กำหนดเอง)`);
    }
    const op = str(o.op);
    if (!CRM_CONDITION_OP_SET.has(op)) throw fail("VALIDATION", `ไม่รู้จักการเปรียบเทียบ "${op.slice(0, 20)}" — เลือกจากรายการ`);
    if (!CRM_VALUELESS_OPS.has(op) && (o.value === undefined || o.value === null || o.value === "")) {
      throw fail("VALIDATION", "เงื่อนไขนี้ต้องมีค่าเทียบ — กรอกค่าก่อน");
    }
    return CRM_VALUELESS_OPS.has(op) ? { field, op } : { field, op, value: o.value };
  });
  const rawDays = c.days;
  let days: number | null = null;
  if (rawDays !== undefined && rawDays !== null) {
    const n = Number(rawDays);
    if (!Number.isInteger(n) || n < 1 || n > SCORE_EXPIRES_DAYS_MAX) throw fail("VALIDATION", `จำนวนวันที่เงียบหายต้องเป็นจำนวนเต็ม 1–${SCORE_EXPIRES_DAYS_MAX} วัน`);
    days = n;
  }
  return { mode, items, days };
}

function optInt(v: unknown, min: number, max: number, message: string): number | null {
  if (v === undefined || v === null || v === "") return null;
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) throw fail("VALIDATION", message);
  return n;
}

type CleanRule = {
  name: string;
  event: string;
  points: number;
  conditions: CleanConditions;
  expiresDays: number | null;
  maxPerDay: number | null;
  active: boolean;
};

function cleanInput(input: unknown, base?: RuleRow): CleanRule {
  const i = isObj(input) ? input : {};
  const name = str(i.name ?? base?.name);
  if (!name) throw fail("VALIDATION", "ตั้งชื่อกฎคะแนนก่อน (ชื่อนี้จะขึ้นเป็นเหตุผลบนการ์ดลูกค้า)");
  if (name.length > SCORE_RULE_NAME_MAX) throw fail("VALIDATION", `ชื่อกฎคะแนนยาวได้ไม่เกิน ${SCORE_RULE_NAME_MAX} ตัวอักษร`);
  const event = str(i.event ?? base?.event);
  // 🔴 รอบแก้ 25 ก.ย.: รับได้แค่เหตุการณ์ที่ **มีทางเดินมาถึงการให้คะแนนจริง** (`SCORE_RULE_EVENT_CHOICES` = สะพาน + เงียบหาย)
  //    กฎที่ตั้งบนเหตุการณ์ที่ไม่มีใครส่งมา = กฎที่ไม่มีวันทำงาน ⇒ ปฏิเสธตอนตั้ง ดีกว่าให้ร้านรอเก้อ (ช่องเลือกบนหน้าจอใช้ชุดเดียวกัน)
  if (!SCORE_RULE_CHOICE_VALUES.has(event)) {
    throw fail("VALIDATION", `ยังให้คะแนนจากเหตุการณ์ "${event.slice(0, 40)}" ไม่ได้ — เลือกจากรายการที่ระบบส่งสัญญาณมาให้ (ฟอร์ม · แชท · อีเมล · กิจกรรม · ใบเสนอราคา · เงียบหาย)`);
  }
  const rawPoints = i.points === undefined ? base?.points : i.points;
  const points = Number(rawPoints);
  if (!Number.isInteger(points) || points < SCORE_POINTS_MIN || points > SCORE_POINTS_MAX) {
    throw fail("VALIDATION", `แต้มของกฎต้องเป็นจำนวนเต็ม ${SCORE_POINTS_MIN.toLocaleString("th-TH")} ถึง ${SCORE_POINTS_MAX.toLocaleString("th-TH")}`);
  }
  if (points === 0) throw fail("VALIDATION", "กฎที่ให้ 0 แต้มไม่มีผลอะไร — ใส่จำนวนแต้มที่จะเพิ่มหรือหัก");
  const conditions = conditionsIn(i.conditions === undefined ? (base?.conditions ?? {}) : i.conditions);
  const expiresDays = i.expiresDays === undefined
    ? (base?.expiresDays ?? null)
    : optInt(i.expiresDays, 1, SCORE_EXPIRES_DAYS_MAX, `อายุของแต้มต้องเป็นจำนวนเต็ม 1–${SCORE_EXPIRES_DAYS_MAX} วัน (เว้นว่าง = ใช้ค่ากลางของร้าน)`);
  const maxPerDay = i.maxPerDay === undefined
    ? (base?.maxPerDay ?? null)
    : optInt(i.maxPerDay, 1, SCORE_MAX_PER_DAY_MAX, `จำนวนครั้งสูงสุดต่อวันต้องเป็นจำนวนเต็ม 1–${SCORE_MAX_PER_DAY_MAX} (เว้นว่าง = ไม่จำกัด)`);
  const active = i.active === undefined ? (base?.active ?? true) : i.active === true;
  return { name, event, points, conditions, expiresDays, maxPerDay, active };
}

const dtoOf = (r: RuleRow): ScoreRuleDto => {
  const c = conditionsFromRow(r.conditions);
  return {
    id: r.id,
    name: r.name,
    event: r.event,
    eventLabel: scoreEventLabel(r.event),
    points: r.points,
    conditions: c,
    expiresDays: r.expiresDays,
    maxPerDay: r.maxPerDay,
    active: r.active,
    isSystem: r.isSystem,
    sortOrder: r.sortOrder,
    seedKey: seedKeyOf(r.conditions),
  };
};

function conditionsFromRow(raw: Prisma.JsonValue | null | undefined): CleanConditions {
  const c = isObj(raw) ? raw : {};
  const mode = str(c.mode).toUpperCase() === "OR" ? "OR" : "AND";
  const items = (Array.isArray(c.items) ? (c.items as unknown[]) : [])
    .filter((x): x is Record<string, unknown> => isObj(x))
    .map((o) => ({ field: str(o.field), op: str(o.op), ...(o.value === undefined ? {} : { value: o.value }) }));
  return { mode, items, days: daysOf(raw) };
}

const conditionsJson = (c: CleanConditions, seedKey: string | null): Prisma.InputJsonValue =>
  ({ mode: c.mode, items: c.items, ...(c.days !== null ? { days: c.days } : {}), ...(seedKey ? { seedKey } : {}) }) as Prisma.InputJsonValue;

async function loadRule(ctx: ScoringCtx, id: unknown): Promise<RuleRow> {
  const rid = idOf(id);
  const row = rid ? await prisma.crmScoreRule.findFirst({ where: { id: rid, tenantId: ctx.tenantId, systemId: ctx.systemId }, select: RULE_SELECT }) : null;
  if (!row) throw fail("NOT_FOUND", RULE_NOT_FOUND);
  return row as RuleRow;
}

// ───────────────────────── กฎเริ่มต้น 8 ข้อ ─────────────────────────

/**
 * สร้างกฎเริ่มต้น 8 ข้อของระบบนี้จากข้อมูลกลาง `CENTRAL_SCORE_RULES` (ใบ C1.11 เป็นเจ้าของตัวเลข — ที่นี่ไม่พิมพ์ซ้ำ)
 * ตัวตนของกฎ = `conditions.seedKey` (ตารางไม่มีคอลัมน์ key และใบนี้ไม่มี migration — วิธีเดียวกับ `trigger.starter` ของ C2.1)
 * AUDIT-CLASS X4: advisory lock ต่อระบบ + ตรวจ seedKey ใน tx เดียวกัน ⇒ เรียกซ้ำ/เรียกพร้อมกัน N ครั้ง = 8 แถวเท่าเดิม
 */
export async function seedSystemRules(ctx: ScoringCtx, actor: MemberActor): Promise<{ created: number; total: number }> {
  await enter(ctx, actor);
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`crm:score-rules-seed:${ctx.systemId}`}, 0))`;
    const existing = await tx.crmScoreRule.findMany({ where: { tenantId: ctx.tenantId, systemId: ctx.systemId }, select: { id: true, conditions: true } });
    const have = new Set(existing.map((r) => seedKeyOf(r.conditions)).filter((k): k is string => !!k));
    const made: string[] = [];
    for (const [i, d] of CENTRAL_SCORE_RULES.entries()) {
      if (have.has(d.key)) continue;
      await tx.crmScoreRule.create({
        data: {
          tenantId: ctx.tenantId,
          systemId: ctx.systemId,
          name: d.label,
          event: d.event,
          points: d.points,
          maxPerDay: d.maxPerDay ?? null,
          expiresDays: d.expiresDays ?? null,
          active: true,
          isSystem: true,
          sortOrder: i,
          conditions: { seedKey: d.key } as Prisma.InputJsonValue,
        },
      });
      made.push(d.key);
    }
    if (made.length > 0) await auditInTx(tx, ctx, "rule.seed", "AppSystem", ctx.systemId, { after: { created: made } });
    const total = await tx.crmScoreRule.count({ where: { tenantId: ctx.tenantId, systemId: ctx.systemId } });
    return { created: made.length, total };
  }, TX);
}

// ───────────────────────── กฎ: CRUD ─────────────────────────

export async function listRules(ctx: ScoringCtx, actor: MemberActor): Promise<ScoreRuleDto[]> {
  await enter(ctx, actor);
  const rows = (await prisma.crmScoreRule.findMany({
    where: { tenantId: ctx.tenantId, systemId: ctx.systemId },
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
    select: RULE_SELECT,
  })) as RuleRow[];
  return rows.map(dtoOf);
}

export async function createRule(ctx: ScoringCtx, actor: MemberActor, input: ScoreRuleInput): Promise<ScoreRuleDto> {
  await enter(ctx, actor);
  const v = cleanInput(input);
  const dto = await prisma.$transaction(async (tx) => {
    const n = await tx.crmScoreRule.count({ where: { tenantId: ctx.tenantId, systemId: ctx.systemId } });
    const row = (await tx.crmScoreRule.create({
      data: {
        tenantId: ctx.tenantId,
        systemId: ctx.systemId,
        name: v.name,
        event: v.event,
        points: v.points,
        conditions: conditionsJson(v.conditions, null),
        expiresDays: v.expiresDays,
        maxPerDay: v.maxPerDay,
        active: v.active,
        isSystem: false,
        sortOrder: n,
      },
      select: RULE_SELECT,
    })) as RuleRow;
    await auditInTx(tx, ctx, "rule.create", "CrmScoreRule", row.id, { after: { name: v.name, event: v.event, points: v.points, active: v.active } });
    return dtoOf(row);
  }, TX);
  return dto;
}

export async function updateRule(ctx: ScoringCtx, actor: MemberActor, id: string, input: Partial<ScoreRuleInput>): Promise<ScoreRuleDto> {
  await enter(ctx, actor);
  const before = await loadRule(ctx, id);
  const v = cleanInput(input, before);
  return prisma.$transaction(async (tx) => {
    const row = (await tx.crmScoreRule.update({
      where: { id: before.id },
      data: {
        name: v.name,
        event: v.event,
        points: v.points,
        conditions: conditionsJson(v.conditions, seedKeyOf(before.conditions)),
        expiresDays: v.expiresDays,
        maxPerDay: v.maxPerDay,
        active: v.active,
      },
      select: RULE_SELECT,
    })) as RuleRow;
    await auditInTx(tx, ctx, "rule.update", "CrmScoreRule", row.id, {
      before: { name: before.name, event: before.event, points: before.points, active: before.active },
      after: { name: v.name, event: v.event, points: v.points, active: v.active },
    });
    return dtoOf(row);
  }, TX);
}

export async function toggleRule(ctx: ScoringCtx, actor: MemberActor, id: string, active: boolean): Promise<ScoreRuleDto> {
  await enter(ctx, actor);
  const before = await loadRule(ctx, id);
  return prisma.$transaction(async (tx) => {
    const row = (await tx.crmScoreRule.update({ where: { id: before.id }, data: { active: active === true }, select: RULE_SELECT })) as RuleRow;
    await auditInTx(tx, ctx, active ? "rule.enable" : "rule.disable", "CrmScoreRule", row.id, { before: { active: before.active }, after: { active: row.active } });
    return dtoOf(row);
  }, TX);
}

/**
 * ลบกฎ = การกระทำอันตราย (AUDIT-CLASS X9): ยืนยัน + เหตุผล ≥ 5 ตัวอักษร
 * 🔴 แถว `CrmScoreLog` ของกฎนี้ **คงไว้** (ruleId ไม่มี FK) — เหตุผลบนการ์ดลูกค้าคือประวัติ ไม่ใช่ของประดับ
 */
export async function deleteRule(ctx: ScoringCtx, actor: MemberActor, id: string, opts: { confirm?: boolean | null; reason?: string | null } = {}): Promise<{ ok: true }> {
  await enter(ctx, actor);
  const row = await loadRule(ctx, id);
  if (opts?.confirm !== true) throw fail("VALIDATION", "ลบกฎคะแนนแล้วกู้คืนไม่ได้ — กดยืนยันการลบก่อน (แต้มที่ให้ไปแล้วยังอยู่เป็นประวัติ)");
  const reason = str(opts?.reason);
  if (reason.length < SCORE_DELETE_REASON_MIN) throw fail("VALIDATION", `ใส่เหตุผลที่ลบกฎอย่างน้อย ${SCORE_DELETE_REASON_MIN} ตัวอักษร (เก็บไว้ในประวัติการแก้ไข)`);
  await prisma.$transaction(async (tx) => {
    await tx.crmScoreRule.delete({ where: { id: row.id } });
    await auditInTx(tx, ctx, "rule.delete", "CrmScoreRule", row.id, {
      before: { name: row.name, event: row.event, points: row.points },
      after: { reason: reason.slice(0, 300) },
    });
  }, TX);
  return { ok: true };
}

/** เรียงลำดับกฎ (id ที่ไม่ได้ส่งมาต่อท้ายตามลำดับเดิม) */
export async function reorderRules(ctx: ScoringCtx, actor: MemberActor, ids: readonly string[]): Promise<ScoreRuleDto[]> {
  await enter(ctx, actor);
  const rows = (await prisma.crmScoreRule.findMany({
    where: { tenantId: ctx.tenantId, systemId: ctx.systemId },
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
    select: RULE_SELECT,
  })) as RuleRow[];
  const wanted = (Array.isArray(ids) ? ids : []).map((x) => str(x)).filter((x) => rows.some((r) => r.id === x));
  const order = [...new Set([...wanted, ...rows.map((r) => r.id)])];
  await prisma.$transaction(async (tx) => {
    for (const [i, rid] of order.entries()) await tx.crmScoreRule.update({ where: { id: rid }, data: { sortOrder: i } });
    await auditInTx(tx, ctx, "rule.reorder", "AppSystem", ctx.systemId, { after: { order } });
  }, TX);
  return listRules(ctx, actor);
}

// ───────────────────────── ตั้งค่าระดับคะแนน ─────────────────────────

export async function getScoringSettings(ctx: ScoringCtx, actor: MemberActor): Promise<ScoringSettings> {
  const sys = await enter(ctx, actor);
  return { ...sys.scoring };
}

export async function setScoringSettings(ctx: ScoringCtx, actor: MemberActor, patch: Partial<ScoringSettings>): Promise<ScoringSettings> {
  const sys = await enter(ctx, actor);
  const p = isObj(patch) ? patch : {};
  const pick = (k: keyof ScoringSettings, label: string): number => {
    if (p[k] === undefined || p[k] === null) return sys.scoring[k];
    const n = Number(p[k]);
    if (!Number.isInteger(n)) throw fail("VALIDATION", `${label}ต้องเป็นจำนวนเต็ม`);
    return n;
  };
  const hot = pick("hot", "คะแนนขั้นต่ำของลูกค้า \"ร้อน\"");
  const warm = pick("warm", "คะแนนขั้นต่ำของลูกค้า \"อุ่น\"");
  const decayDays = pick("decayDays", "อายุของแต้ม (วัน)");
  if (warm < 0) throw fail("VALIDATION", "คะแนนขั้นต่ำของลูกค้า \"อุ่น\" ต้องไม่น้อยกว่า 0");
  if (hot <= warm) throw fail("VALIDATION", "คะแนน \"ร้อน\" ต้องมากกว่าคะแนน \"อุ่น\" — ปรับตัวเลขให้ไล่ระดับกัน");
  if (decayDays < 0 || decayDays > SCORE_EXPIRES_DAYS_MAX) throw fail("VALIDATION", `อายุของแต้มต้องเป็นจำนวนวันตั้งแต่ 0 ถึง ${SCORE_EXPIRES_DAYS_MAX} (0 = ไม่หมดอายุ)`);
  await prisma.$transaction(async (tx) => {
    const n = await setCrmScoringKeys(ctx, { hot, warm, decayDays }, tx);
    if (n === 0) throw fail("NOT_FOUND", SYSTEM_NOT_FOUND);
    await auditInTx(tx, ctx, "settings", "AppSystem", ctx.systemId, { before: sys.scoring, after: { hot, warm, decayDays } });
  }, TX);
  return { hot, warm, decayDays };
}

// ───────────────────────── แกนกลาง: เขียนแถวแต้ม + ขยับคะแนน (คำสั่งเดียว) ─────────────────────────

type BumpResult = { logId: string; points: number; from: number; to: number; fromBand: ScoreBand | null; toBand: ScoreBand };

/**
 * 🔴 **ลำดับล็อกของทั้งไฟล์: "แถวผู้ติดต่อก่อน แล้วค่อยแถวแต้ม" — ห้ามสลับ**
 *   การ INSERT `CrmScoreLog` จับ `FOR KEY SHARE` บนแถว `CrmContact` เอง (FK `CrmScoreLog_contactId_fkey`) ·
 *   KEY SHARE ของสองธุรกรรมเข้ากันได้ แต่ `FOR UPDATE` ชนกับ KEY SHARE ของอีกฝ่าย ⇒ ถ้าเขียนแถวแต้มก่อนแล้วค่อยล็อกคน
 *   สองรอบที่ยิงพร้อมกันบนลูกค้าคนเดียวจะ **deadlock** (40P01 · วัดได้จริงบน QC: 9 จาก 10 ใบล้ม)
 *   ⇒ ทุกทางเขียนคะแนนล็อกแถวผู้ติดต่อเป็นอย่างแรก ⇒ ทุกอย่างของลูกค้าคนหนึ่งเข้าคิวเรียงกัน (ไม่มีวงรอ)
 *   ผลพลอยได้: เพดานรายวันและกุญแจกันซ้ำถูกตัดสินใต้ล็อกนี้อยู่แล้ว (ไม่ต้องมี advisory lock ซ้อนอีกชั้น)
 * คืน null = ไม่พบผู้ติดต่อ (ถูกลบไปแล้ว) — ไม่ใช่ error
 */
async function lockContact(tx: Tx, ctx: ScoringCtx, contactId: string): Promise<{ from: number; fromBand: ScoreBand | null } | null> {
  const prev = await tx.$queryRaw<{ score: number; scoreBand: string | null }[]>`
    SELECT "score", "scoreBand" FROM "CrmContact" WHERE "id" = ${contactId} AND "tenantId" = ${ctx.tenantId} FOR UPDATE`;
  if (prev.length === 0) return null;
  return { from: Number(prev[0]?.score ?? 0), fromBand: (prev[0]?.scoreBand ?? null) as ScoreBand | null };
}

/**
 * AUDIT-CLASS X3: คะแนนขยับด้วย **คำสั่งเดียว** — บวก/หักใน SQL (`GREATEST(0, "score" ± n)`) ใต้ล็อกแถวที่ `lockContact`
 * ถือไว้ · ไม่มีจุดใดอ่านคะแนนมาคำนวณใน JS แล้วเขียนทับ (ยิงพร้อมกัน 20 ใบจาก 4 โพรเซส ⇒ ผลรวมตรงเป๊ะ — X3.1/X3.3)
 */
async function bumpScore(tx: Tx, ctx: ScoringCtx, contactId: string, points: number, at: Date, s: CrmScoringSettings, prev: { from: number; fromBand: ScoreBand | null }): Promise<{ from: number; to: number; fromBand: ScoreBand | null; toBand: ScoreBand }> {
  const from = prev.from;
  const fromBand = prev.fromBand;
  const rows = await tx.$queryRaw<{ score: number; scoreBand: string }[]>`
    UPDATE "CrmContact"
       SET "score" = GREATEST(0, "score" + ${points}::int),
           "scoreUpdatedAt" = (${at.toISOString()}::timestamptz AT TIME ZONE 'UTC'),
           "scoreBand" = (CASE WHEN GREATEST(0, "score" + ${points}::int) >= ${s.hot}::int THEN 'HOT'
                               WHEN GREATEST(0, "score" + ${points}::int) >= ${s.warm}::int THEN 'WARM'
                               ELSE 'COLD' END)::"CrmScoreBand"
     WHERE "id" = ${contactId} AND "tenantId" = ${ctx.tenantId}
    RETURNING "score", "scoreBand"`;
  const to = Number(rows[0]?.score ?? from);
  const toBand = (rows[0]?.scoreBand ?? bandOf(to, s)) as ScoreBand;
  return { from, to, fromBand, toBand };
}

/** AUDIT-CLASS X8: payload มีแต่ id + ตัวเลข + ระดับ (ไม่มีชื่อ เบอร์ อีเมล เหตุผลของลูกค้า) */
async function emitScoreEvents(tx: Tx, ctx: ScoringCtx, contactId: string, ruleId: string | null, logId: string, b: { from: number; to: number; fromBand: ScoreBand | null; toBand: ScoreBand }): Promise<void> {
  // 🔴 รอบแก้ 25 ก.ย.: "คะแนนเปลี่ยน" ต้องเปลี่ยนจริง — แถวแต้มที่ถูกตัดที่ 0 (เช่น −10 ตอนคะแนน 0) ไม่ได้ขยับคะแนนเลย
  //    ⇒ ยิง `crm.score.changed { from: 0, to: 0 }` = หลอกกฎ/เว็บฮุคของร้านว่ามีอะไรเกิดขึ้น (แถวแต้มยังอยู่เป็นประวัติตามเดิม)
  if (b.from !== b.to) {
    await emitOutbox(tx, {
      tenantId: ctx.tenantId,
      systemId: ctx.systemId,
      type: "crm.score.changed",
      idempotencyKey: `crm.score.changed#${contactId}#${logId}`,
      payload: { contactId, from: b.from, to: b.to, band: b.toBand, ruleId },
    });
  }
  if (b.fromBand !== b.toBand) {
    await emitOutbox(tx, {
      tenantId: ctx.tenantId,
      systemId: ctx.systemId,
      type: "crm.score.threshold",
      idempotencyKey: `crm.score.threshold#${contactId}#${b.toBand}#${logId}`,
      payload: { contactId, band: b.toBand },
    });
  }
}

/** อายุของแต้ม: `expiresDays` ของกฎ ⇒ ไม่มี ⇒ `settings.crm.scoring.decayDays` · ทั้งคู่ว่าง/0 = ไม่หมดอายุ */
function expiresAtOf(at: Date, ruleDays: number | null, decayDays: number): Date | null {
  const days = ruleDays && ruleDays > 0 ? ruleDays : decayDays > 0 ? decayDays : 0;
  return days > 0 ? new Date(at.getTime() + days * DAY_MS) : null;
}

type LogInput = {
  contactId: string;
  ruleId: string | null;
  points: number;
  reason: string;
  refType?: string | null;
  refId?: string | null;
  eventKey?: string | null;
  expiresAt: Date | null;
  maxPerDay?: number | null;
  at: Date;
};

/**
 * AUDIT-CLASS X3 + X4 — เขียนแถวแต้ม 1 แถวด้วย **INSERT เงื่อนไขเดียว**:
 *   • เพดานรายวัน: `WHERE (SELECT count(*) … วันไทยเดียวกัน) < maxPerDay` อยู่ในคำสั่ง INSERT เอง (ไม่ใช่ "นับใน JS ก่อนเขียน")
 *     — ใต้ advisory lock ต่อ (กฎ, คน, วันไทย) ที่ผู้เรียกถือไว้ก่อน ⇒ คำสั่งเห็นแถวที่ commit แล้วครบทุกใบ
 *   • กันซ้ำ: `ON CONFLICT DO NOTHING` = partial UNIQUE (ruleId, eventKey) ของ migration `*_crm_v2_b` (แถวของกฎ) ·
 *     แถวปรับมือ (ruleId ว่าง) ใช้ `WHERE NOT EXISTS (contactId, eventKey)` ในคำสั่งเดียวกัน
 * คืน null = "ไม่ได้เขียน" (ชนเพดาน หรือ event ใบนี้ให้แต้มไปแล้ว) — ไม่ใช่ error
 */
async function insertLog(tx: Tx, ctx: ScoringCtx, a: LogInput): Promise<{ id: string; points: number } | null> {
  const dayFrom = new Date(thaiDayStartMs(a.at.getTime()));
  const dayTo = new Date(dayFrom.getTime() + DAY_MS);
  const capGuard = a.maxPerDay && a.maxPerDay > 0 && a.ruleId
    ? Prisma.sql`(SELECT count(*) FROM "CrmScoreLog" l
                   WHERE l."ruleId" = ${a.ruleId} AND l."contactId" = ${a.contactId}
                     AND l."createdAt" >= (${dayFrom.toISOString()}::timestamptz AT TIME ZONE 'UTC')
                     AND l."createdAt" <  (${dayTo.toISOString()}::timestamptz AT TIME ZONE 'UTC')) < ${a.maxPerDay}::int`
    : Prisma.sql`true`;
  const keyGuard = !a.ruleId && a.eventKey
    ? Prisma.sql`NOT EXISTS (SELECT 1 FROM "CrmScoreLog" l WHERE l."contactId" = ${a.contactId} AND l."eventKey" = ${a.eventKey})`
    : Prisma.sql`true`;
  const rows = await tx.$queryRaw<{ id: string; points: number }[]>`
    INSERT INTO "CrmScoreLog" ("id","tenantId","contactId","ruleId","points","reason","refType","refId","eventKey","expiresAt","expired","createdAt")
    SELECT gen_random_uuid()::text, ${ctx.tenantId}, ${a.contactId}, ${a.ruleId}, ${a.points}::int, ${a.reason.slice(0, SCORE_REASON_MAX)},
           ${a.refType ?? null}, ${a.refId ?? null}, ${a.eventKey ?? null},
           (${iso(a.expiresAt)}::timestamptz AT TIME ZONE 'UTC'), false, (${a.at.toISOString()}::timestamptz AT TIME ZONE 'UTC')
     WHERE ${capGuard} AND ${keyGuard}
    ON CONFLICT DO NOTHING
    RETURNING "id", "points"`;
  const row = rows[0];
  return row ? { id: String(row.id), points: Number(row.points) } : null;
}

/**
 * เขียนแถวแต้ม + ขยับคะแนน + ยิง event ใน **ธุรกรรมเดียว**
 * ลำดับ: ล็อกแถวผู้ติดต่อ (ดู `lockContact` — ลำดับล็อกเดียวกันทุกทาง กัน deadlock) → INSERT เงื่อนไขเดียว (เพดานรายวัน +
 * กุญแจกันซ้ำตัดสินในคำสั่งนั้นเอง ใต้ล็อกที่เพิ่งจับ) → ขยับคะแนนคำสั่งเดียว → ยิง event ใน tx เดียวกัน
 */
async function applyPoints(ctx: ScoringCtx, s: CrmScoringSettings, a: LogInput, alsoInTx?: (tx: Tx, r: BumpResult) => Promise<void>): Promise<BumpResult | null> {
  return prisma.$transaction(async (tx) => {
    const prev = await lockContact(tx, ctx, a.contactId);
    if (!prev) return null;
    const log = await insertLog(tx, ctx, a);
    if (!log) return null;
    const b = await bumpScore(tx, ctx, a.contactId, log.points, a.at, s, prev);
    await emitScoreEvents(tx, ctx, a.contactId, a.ruleId, log.id, b);
    const r: BumpResult = { logId: log.id, points: log.points, ...b };
    // AUDIT-CLASS X9: แถวประวัติของผู้เรียก (วันนี้มีแต่ `adjust`) เขียน **ใน tx เดียวกับการเปลี่ยนแปลง** ไม่ใช่ tx ที่สองหลังจากนั้น
    if (alsoInTx) await alsoInTx(tx, r);
    return r;
  }, TX);
}

// ───────────────────────── onEvent ─────────────────────────

type Refs = { contactId: string | null; dealId: string | null; activityId: string | null };

const refsOf = (payload: unknown): Refs => {
  const p = isObj(payload) ? payload : {};
  return { contactId: idOf(p.contactId), dealId: idOf(p.dealId), activityId: idOf(p.activityId) };
};

/**
 * AUDIT-CLASS X1: ผู้ติดต่อของ event ถูกโหลดใหม่ด้วย id **ในร้าน + ระบบของ ctx** — ของระบบอื่น/ร้านอื่น/เก็บถาวร/ถูกรวมไปแล้ว = null
 * (ไม่ throw: "ไม่มีคนให้คะแนน" ไม่ใช่ความผิดพลาด)
 */
async function contactOfEvent(ctx: ScoringCtx, refs: Refs): Promise<{ id: string; dealId: string | null } | null> {
  const scope = { tenantId: ctx.tenantId, systemId: ctx.systemId };
  let contactId = refs.contactId;
  let dealId = refs.dealId;
  if (!contactId && dealId) {
    const d = await prisma.crmDeal.findFirst({ where: { id: dealId, ...scope }, select: { contactId: true } });
    contactId = d?.contactId ?? null;
  }
  if (!contactId && refs.activityId) {
    const act = await prisma.crmActivity.findFirst({ where: { id: refs.activityId, ...scope }, select: { contactId: true, dealId: true } });
    contactId = act?.contactId ?? null;
    dealId = dealId ?? act?.dealId ?? null;
  }
  if (!contactId) return null;
  const c = await prisma.crmContact.findFirst({ where: { id: contactId, ...scope, archivedAt: null, mergedIntoId: null }, select: { id: true } });
  return c ? { id: c.id, dealId } : null;
}

/** เงื่อนไขของกฎประเมินด้วย **เอนจินเดียวของระบบ** (`automation.ts` ของ C2.1) — โหลดตอนใช้ (กันวงโหลดไฟล์) */
async function conditionsOk(ctx: ScoringCtx, rule: RuleRow, contactId: string, dealId: string | null): Promise<boolean> {
  const cond = conditionsFromRow(rule.conditions);
  if (cond.items.length === 0) return true;
  const { conditionsPassForRefs } = await import("./automation");
  return conditionsPassForRefs({ tenantId: ctx.tenantId, systemId: ctx.systemId }, { contactId, dealId }, { mode: cond.mode, items: cond.items });
}

const NOTHING = (skipped: string): OnEventResult => ({ logged: 0, points: 0, score: null, band: null, skipped });

/**
 * ทางเข้าการให้คะแนนทางเดียว — 1 event → ทุกกฎที่เปิดอยู่ของ event นั้น (กฎไม่ใช่ตัวเลือกแทนกัน: ตรงกี่ข้อได้แต้มครบ)
 * `opts.now` = **นาฬิกาของรอบนี้** (วันไทยของเพดานรายวัน · อายุแต้ม · เวลาของแถว) · `opts.eventKey` = กุญแจกันซ้ำของ event ต้นทาง
 * uiVersion 1 ⇒ `{ logged: 0, skipped: "DISABLED" }` (R-E.14 — ไม่อ่านกฎ ไม่เขียนอะไร)
 */
export async function onEvent(ctx: ScoringCtx, eventType: string, payload: unknown, opts: { now?: Date; eventKey?: string | null } = {}): Promise<OnEventResult> {
  const at = opts?.now ?? new Date();
  const sys = await sysOf(ctx);
  if (!sys) return NOTHING("SYSTEM_NOT_FOUND");
  if (sys.uiVersion !== 2) return NOTHING("DISABLED");
  if (typeof eventType !== "string" || !eventType) return NOTHING("NO_EVENT");
  const rules = (await prisma.crmScoreRule.findMany({
    where: { tenantId: ctx.tenantId, systemId: ctx.systemId, event: eventType, active: true },
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
    select: RULE_SELECT,
  })) as RuleRow[];
  if (rules.length === 0) return NOTHING("NO_RULE");
  const contact = await contactOfEvent(ctx, refsOf(payload));
  if (!contact) return NOTHING("NO_CONTACT");
  const p = isObj(payload) ? payload : {};
  let logged = 0;
  let points = 0;
  let score: number | null = null;
  let band: ScoreBand | null = null;
  for (const rule of rules) {
    if (!(await conditionsOk(ctx, rule, contact.id, contact.dealId))) continue;
    const r = await applyPoints(ctx, sys.scoring, {
      contactId: contact.id,
      ruleId: rule.id,
      points: rule.points,
      reason: rule.name,
      refType: refTypeOf(eventType),
      refId: idOf(p.activityId) ?? idOf(p.dealId) ?? idOf(p.emailId) ?? idOf(p.submissionId) ?? idOf(p.conversationId) ?? null,
      eventKey: opts?.eventKey ?? null,
      expiresAt: expiresAtOf(at, rule.expiresDays, sys.scoring.decayDays),
      maxPerDay: rule.maxPerDay,
      at,
    });
    if (!r) continue;
    logged += 1;
    points += r.points;
    score = r.to;
    band = r.toBand;
  }
  if (score === null) {
    const c = await prisma.crmContact.findFirst({ where: { id: contact.id, tenantId: ctx.tenantId }, select: { score: true, scoreBand: true } });
    score = Number(c?.score ?? 0);
    band = (c?.scoreBand ?? bandOf(score, sys.scoring)) as ScoreBand;
  }
  return { logged, points, score, band };
}

/** ชนิดของ "ที่มา" ที่เก็บในแถวแต้ม (id ล้วน · ไม่มีข้อมูลลูกค้า — X8) */
function refTypeOf(eventType: string): string | null {
  if (eventType.startsWith("crm.activity.")) return "CrmActivity";
  if (eventType.startsWith("crm.deal.")) return "CrmDeal";
  if (eventType.startsWith("crm.email.")) return "CrmEmail";
  if (eventType === "forms.submission.received") return "FormSubmission";
  if (eventType.startsWith("chat.")) return "ChatConversation";
  if (eventType === "crm.web.identified") return "CrmWebSession";
  return null;
}

// ───────────────────────── adjust (ADJUST_SCORE · scoreOnSubmit · คนกดเอง) ─────────────────────────

/**
 * ปรับคะแนนรายการเดียว — `actor` เป็น null = เอนจิน/สะพาน (ไม่ต้องมีคีย์) · เป็นคน = ต้องมีคีย์ `crm.score.manage`
 * `eventKey` ที่ส่งมาทำให้เรียกซ้ำไม่บวกซ้ำ (แถวนี้ ruleId ว่าง ⇒ partial UNIQUE ไม่คุม — ใช้ `WHERE NOT EXISTS` ในคำสั่งเดียวกัน)
 */
export async function adjust(ctx: ScoringCtx, actor: MemberActor | null, input: ScoreAdjustInput): Promise<{ logId: string | null; score: number; band: ScoreBand }> {
  const sys = await requireSystem(ctx);
  if (sys.uiVersion !== 2) throw new CrmV2DisabledError();
  if (actor) {
    if (actor.role === "CUSTOMER") throw fail("NOT_FOUND", SYSTEM_NOT_FOUND);
    if (!crmCan(actor, MANAGE_KEY)) throw new CrmForbiddenError(MANAGE_KEY);
  }
  const contactId = idOf(input?.contactId);
  const points = Number(input?.points);
  if (!Number.isInteger(points) || points === 0 || points < SCORE_POINTS_MIN || points > SCORE_POINTS_MAX) {
    throw fail("VALIDATION", `แต้มที่ปรับต้องเป็นจำนวนเต็ม ${SCORE_POINTS_MIN.toLocaleString("th-TH")} ถึง ${SCORE_POINTS_MAX.toLocaleString("th-TH")} และไม่เป็น 0`);
  }
  const reason = str(input?.reason);
  if (!reason) throw fail("VALIDATION", "ใส่เหตุผลที่ปรับคะแนน (ขึ้นเป็นเหตุผลบนการ์ดลูกค้า)");
  const where = actor ? await contactWhere(ctx, actor) : { tenantId: ctx.tenantId, systemId: ctx.systemId };
  const c = contactId
    ? await prisma.crmContact.findFirst({ where: { AND: [where, { id: contactId, archivedAt: null, mergedIntoId: null }] }, select: { id: true } })
    : null;
  if (!c) throw fail("NOT_FOUND", CONTACT_NOT_FOUND);
  const at = input?.now ?? new Date();
  const expiresDays = optInt(input?.expiresDays, 1, SCORE_EXPIRES_DAYS_MAX, `อายุของแต้มต้องเป็นจำนวนเต็ม 1–${SCORE_EXPIRES_DAYS_MAX} วัน`);
  const r = await applyPoints(
    ctx,
    sys.scoring,
    {
      contactId: c.id,
      ruleId: null,
      points,
      reason,
      refType: idOf(input?.refType),
      refId: idOf(input?.refId),
      eventKey: idOf(input?.eventKey),
      expiresAt: expiresAtOf(at, expiresDays, sys.scoring.decayDays),
      maxPerDay: null,
      at,
    },
    // AUDIT-CLASS X9 (รอบแก้ 25 ก.ย.): ประวัติอยู่ใน tx เดียวกับแถวแต้ม + การขยับคะแนน — ของเดิมเขียนใน tx ที่สอง
    //   ⇒ ตายคาระหว่างสอง tx = แต้มขึ้นแล้วแต่ไม่มีประวัติว่าใครสั่ง (สัญญาข้อ A ของใบนี้ห้ามไว้)
    async (tx, done) =>
      auditInTx(tx, ctx, "adjust", "CrmContact", c.id, {
        after: { logId: done.logId, points: done.points, from: done.from, to: done.to, band: done.toBand, refType: idOf(input?.refType) },
      }),
  );
  if (!r) {
    const cur = await prisma.crmContact.findFirst({ where: { id: c.id, tenantId: ctx.tenantId }, select: { score: true, scoreBand: true } });
    const score = Number(cur?.score ?? 0);
    return { logId: null, score, band: (cur?.scoreBand ?? bandOf(score, sys.scoring)) as ScoreBand };
  }
  return { logId: r.logId, score: r.to, band: r.toBand };
}

// ───────────────────────── explain (ภาพ 05) ─────────────────────────

export async function explain(ctx: ScoringCtx, actor: MemberActor, contactId: string, opts: { limit?: number } = {}): Promise<ScoreExplain> {
  const sys = await enterRead(ctx, actor);
  const where = await contactWhere(ctx, actor);
  const id = idOf(contactId);
  const c = id ? await prisma.crmContact.findFirst({ where: { AND: [where, { id }] }, select: { id: true, score: true, scoreBand: true } }) : null;
  if (!c) throw fail("NOT_FOUND", CONTACT_NOT_FOUND);
  const limit = clamp(Math.trunc(Number(opts?.limit ?? SCORE_EXPLAIN_LIMIT)) || SCORE_EXPLAIN_LIMIT, 1, SCORE_EXPLAIN_LIMIT_MAX);
  const logs = await prisma.crmScoreLog.findMany({
    where: { tenantId: ctx.tenantId, contactId: c.id, expired: false },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit,
    select: { id: true, points: true, reason: true, ruleId: true, refType: true, refId: true, createdAt: true, expiresAt: true },
  });
  const items: ScoreExplainItem[] = logs.map((l) => ({
    logId: l.id,
    points: l.points,
    reason: l.reason,
    ruleId: l.ruleId,
    refType: l.refType,
    refId: l.refId,
    at: l.createdAt.toISOString(),
    expiresAt: l.expiresAt ? l.expiresAt.toISOString() : null,
  }));
  const score = Number(c.score ?? 0);
  return { score, band: (c.scoreBand ?? bandOf(score, sys.scoring)) as ScoreBand, items };
}

// ───────────────────────── recompute ─────────────────────────

export type RecomputeTarget = { contactId: string } | { all: true };
export type RecomputeItem = { contactId: string; from: number; to: number; band: ScoreBand };
export type RecomputeResult = { contacts: number; changed: number; items?: RecomputeItem[] };

/** AUDIT-CLASS X5: สรุปยอดใหม่ด้วย **คำสั่งเดียว** — score = GREATEST(0, Σ แต้มที่ยังไม่หมดอายุ) */
async function reconcile(tx: Tx, ctx: ScoringCtx, contactId: string, at: Date, s: CrmScoringSettings): Promise<{ from: number; to: number; fromBand: ScoreBand | null; toBand: ScoreBand } | null> {
  const prev = await tx.$queryRaw<{ score: number; scoreBand: string | null }[]>`
    SELECT "score", "scoreBand" FROM "CrmContact" WHERE "id" = ${contactId} AND "tenantId" = ${ctx.tenantId} FOR UPDATE`;
  if (prev.length === 0) return null;
  const from = Number(prev[0]?.score ?? 0);
  const fromBand = (prev[0]?.scoreBand ?? null) as ScoreBand | null;
  const rows = await tx.$queryRaw<{ score: number; scoreBand: string }[]>`
    UPDATE "CrmContact" c
       SET "score" = t."s",
           "scoreUpdatedAt" = (${at.toISOString()}::timestamptz AT TIME ZONE 'UTC'),
           "scoreBand" = (CASE WHEN t."s" >= ${s.hot}::int THEN 'HOT' WHEN t."s" >= ${s.warm}::int THEN 'WARM' ELSE 'COLD' END)::"CrmScoreBand"
      FROM (SELECT GREATEST(0, COALESCE(SUM(l."points"), 0))::int AS "s"
              FROM "CrmScoreLog" l WHERE l."contactId" = ${contactId} AND l."expired" = false) t
     WHERE c."id" = ${contactId} AND c."tenantId" = ${ctx.tenantId}
    RETURNING c."score", c."scoreBand"`;
  const to = Number(rows[0]?.score ?? from);
  return { from, to, fromBand, toBand: (rows[0]?.scoreBand ?? bandOf(to, s)) as ScoreBand };
}

const liveSumSql = (contactId: string) => Prisma.sql`
  GREATEST(0, COALESCE((SELECT SUM(l."points") FROM "CrmScoreLog" l WHERE l."contactId" = ${contactId} AND l."expired" = false), 0))::int`;

/**
 * คำนวณคะแนนใหม่จากแถวแต้มที่ยังไม่หมดอายุ · `{ all: true }` = การกระทำอันตราย (X9: ยืนยัน + เหตุผล ≥ 5 ตัวอักษร)
 * `dryRun` ไม่เขียนอะไรเลย (ไม่มีคะแนน ไม่มีประวัติ ไม่มี event) — ปุ่มบนหน้าจอจึง "ดูก่อนกด" ได้ ⇒ ทางดูจึงไม่ต้องยืนยัน
 */
export async function recompute(ctx: ScoringCtx, actor: MemberActor, target: RecomputeTarget, opts: { dryRun?: boolean; confirm?: boolean; reason?: string } = {}): Promise<RecomputeResult> {
  const sys = await enter(ctx, actor);
  const dryRun = opts?.dryRun === true;
  const at = new Date();
  const all = isObj(target) && (target as { all?: unknown }).all === true;
  if (all && !dryRun) {
    if (opts?.confirm !== true) throw fail("VALIDATION", "คำนวณคะแนนใหม่ทั้งร้านกระทบผู้ติดต่อทุกคนในระบบนี้ — กดยืนยันก่อน");
    const reason = str(opts?.reason);
    if (reason.length < SCORE_RECOMPUTE_REASON_MIN) throw fail("VALIDATION", `ใส่เหตุผลที่คำนวณคะแนนใหม่อย่างน้อย ${SCORE_RECOMPUTE_REASON_MIN} ตัวอักษร (เก็บไว้ในประวัติการแก้ไข)`);
  }
  const items: RecomputeItem[] = [];
  let contacts = 0;
  let changed = 0;

  // AUDIT-CLASS X8 (รอบแก้ 25 ก.ย.): การคำนวณใหม่ก็ "ขยับคะแนนของลูกค้า" เหมือนกัน ⇒ ต้องบอกกฎ/เว็บฮุคของร้านด้วย
  //   กุญแจลงท้าย `#recompute-<runId>` (หนึ่ง runId ต่อการเรียกหนึ่งครั้ง) ⇒ คำนวณใหม่รอบละครั้งได้ event ชุดละครั้ง
  //   ไม่ชนกับกุญแจของ event สด (`…#<logId>`) และไม่ชนกับรอบก่อน · payload = id/ตัวเลข/ระดับ ล้วน · ทางดู (dryRun) ไม่ยิงอะไรเลย
  const runId = randomUUID();
  const emitRecompute = async (tx: Tx, contactId: string, rec: { from: number; to: number; fromBand: ScoreBand | null; toBand: ScoreBand }): Promise<void> => {
    if (rec.to !== rec.from) {
      await emitOutbox(tx, {
        tenantId: ctx.tenantId,
        systemId: ctx.systemId,
        type: "crm.score.changed",
        idempotencyKey: `crm.score.changed#${contactId}#recompute-${runId}`,
        payload: { contactId, from: rec.from, to: rec.to, band: rec.toBand, ruleId: null },
      });
    }
    if (rec.fromBand !== rec.toBand) {
      await emitOutbox(tx, {
        tenantId: ctx.tenantId,
        systemId: ctx.systemId,
        type: "crm.score.threshold",
        idempotencyKey: `crm.score.threshold#${contactId}#${rec.toBand}#recompute-${runId}`,
        payload: { contactId, band: rec.toBand },
      });
    }
  };

  const one = async (contactId: string, from: number, want: number): Promise<void> => {
    contacts += 1;
    const band = bandOf(want, sys.scoring);
    if (dryRun) {
      if (want !== from) {
        changed += 1;
        items.push({ contactId, from, to: want, band });
      }
      return;
    }
    const r = await prisma.$transaction(async (tx) => {
      const rec = await reconcile(tx, ctx, contactId, at, sys.scoring);
      if (rec) await emitRecompute(tx, contactId, rec);
      return rec;
    }, TX);
    if (!r) return;
    if (r.to !== r.from || r.fromBand !== r.toBand) changed += 1;
    if (r.to !== r.from) items.push({ contactId, from: r.from, to: r.to, band: r.toBand });
  };

  if (!all) {
    const where = await contactWhere(ctx, actor);
    const id = idOf((target as { contactId?: unknown })?.contactId);
    const c = id ? await prisma.crmContact.findFirst({ where: { AND: [where, { id }] }, select: { id: true, score: true } }) : null;
    if (!c) throw fail("NOT_FOUND", CONTACT_NOT_FOUND);
    const want = await prisma.$queryRaw<{ s: number }[]>`SELECT ${liveSumSql(c.id)} AS "s"`;
    await one(c.id, Number(c.score ?? 0), Number(want[0]?.s ?? 0));
  } else {
    let cursor = "";
    for (;;) {
      const rows = await prisma.$queryRaw<{ id: string; score: number; want: number }[]>`
        SELECT c."id", c."score",
               GREATEST(0, COALESCE((SELECT SUM(l."points") FROM "CrmScoreLog" l WHERE l."contactId" = c."id" AND l."expired" = false), 0))::int AS "want"
          FROM "CrmContact" c
         WHERE c."tenantId" = ${ctx.tenantId} AND c."systemId" = ${ctx.systemId} AND c."id" > ${cursor}
         ORDER BY c."id" ASC LIMIT ${SCORE_DECAY_BATCH}`;
      if (rows.length === 0) break;
      for (const r of rows) await one(String(r.id), Number(r.score ?? 0), Number(r.want ?? 0));
      cursor = String(rows[rows.length - 1]?.id ?? "");
    }
  }
  if (!dryRun) {
    await prisma.$transaction(async (tx) => {
      await auditInTx(tx, ctx, "recompute", all ? "AppSystem" : "CrmContact", all ? ctx.systemId : String((target as { contactId?: string }).contactId ?? ""), {
        after: { scope: all ? "ALL" : "ONE", contacts, changed, reason: all ? str(opts?.reason).slice(0, 300) : undefined },
      });
    }, TX);
  }
  return { contacts, changed, items };
}

// ───────────────────────── งานรายวัน: decay + applyInactivity ─────────────────────────

const stopper = (o: ScoreSweepOpts) => () => !!o.signal?.aborted || (typeof o.deadline === "number" && Date.now() > o.deadline - 500);

/** ตัวกรองขอบเขตของงานกวาด — ระบบต้องเป็น CRM ที่ `settings.crm.uiVersion = 2` เสมอ (R-E.14 · ตรวจใน SQL) */
const v2Filter = (alias: string) => Prisma.sql`
  ${Prisma.raw(`"${alias}"`)}."type" = 'CRM'
  AND jsonb_typeof(${Prisma.raw(`"${alias}"`)}."settings"->'crm'->'uiVersion') = 'number'
  AND (${Prisma.raw(`"${alias}"`)}."settings"->'crm'->>'uiVersion')::numeric = 2`;

const inFilter = (col: Prisma.Sql, ids: readonly string[] | undefined): Prisma.Sql =>
  ids && ids.length > 0 ? Prisma.sql`AND ${col} IN (${Prisma.join(ids.map((x) => Prisma.sql`${x}`))})` : Prisma.empty;

type SysScoring = Map<string, { tenantId: string; scoring: CrmScoringSettings }>;

/** ตัวอ่านที่ใช้ได้ทั้ง `prisma` และ `tx` — งานกวาดอ่าน "เจ้าของแถว" ใต้ธุรกรรมเดียวกับการจอง (ไม่ยืมคอนเนกชันใบที่สอง) */
type Reader = Pick<Tx, "crmContact" | "appSystem">;

async function systemsOf(db: Reader, contactIds: readonly string[]): Promise<Map<string, { systemId: string; tenantId: string }>> {
  if (contactIds.length === 0) return new Map();
  const rows = await db.crmContact.findMany({ where: { id: { in: [...contactIds] } }, select: { id: true, systemId: true, tenantId: true } });
  return new Map(rows.map((r) => [r.id, { systemId: r.systemId, tenantId: r.tenantId }]));
}

async function scoringOf(db: Reader, systemIds: readonly string[], cache: SysScoring): Promise<SysScoring> {
  const missing = [...new Set(systemIds)].filter((s) => !cache.has(s));
  if (missing.length > 0) {
    const rows = await db.appSystem.findMany({ where: { id: { in: missing }, type: "CRM" }, select: { id: true, tenantId: true, settings: true } });
    for (const r of rows) cache.set(r.id, { tenantId: r.tenantId, scoring: crmScoringSettingsOf(r.settings) });
  }
  return cache;
}

/**
 * งานรายวัน (ครึ่งแรก) — แต้มที่ถึงกำหนดหมดอายุ
 * AUDIT-CLASS X5: จองเป็นชุดด้วย `FOR UPDATE SKIP LOCKED … RETURNING` (คำสั่งเดียว) ⇒ สองรอบที่วิ่งซ้อนกันไม่มีวัน
 *   หมดอายุแถวเดียวกันสองครั้ง · แล้ว "สรุปยอดใหม่" ต่อคน (Σ ที่ยังไม่หมดอายุ) ⇒ ไม่มีวันหักซ้ำ (การหักแบบ `score - n` ตรง ๆ จะติดลบ)
 * 🔴 **การจอง + การสรุปยอดของทั้งชุด = ธุรกรรมเดียว** (รอบแก้ 25 ก.ย.) ⇒ ตายกลางทาง = rollback ทั้งชุด ไม่มีแถวที่ถูกจองแล้ว
 *   แต่คะแนนยังไม่ถูกสรุป (ของเดิมทิ้งค่าเพี้ยนค้างถาวร เพราะรอบถัดไปจองได้ 0 แถวแล้วเลิก) · วนจนเงียบหรือหมดงบเวลา
 */
export async function decay(opts: ScoreSweepOpts = {}): Promise<{ expired: number; contacts: number; cutOff: boolean }> {
  const now = opts?.now ?? new Date();
  const batch = clamp(Math.trunc(Number(opts?.batchSize ?? SCORE_DECAY_BATCH)) || SCORE_DECAY_BATCH, 1, 5000);
  const stop = stopper(opts);
  const cache: SysScoring = new Map();
  const touched = new Set<string>();
  const maxBatches = Number.isInteger(opts?.maxBatches) && Number(opts?.maxBatches) > 0 ? Number(opts?.maxBatches) : Number.POSITIVE_INFINITY;
  let expired = 0;
  let cutOff = false;
  let batches = 0;
  for (;;) {
    if (stop()) {
      cutOff = true;
      break;
    }
    if (batches >= maxBatches) {
      cutOff = true;
      break;
    }
    batches += 1;
    // 🔴 รอบแก้ 25 ก.ย. — **การจองกับการสรุปยอดอยู่ในธุรกรรมเดียวกัน** (ของเดิมจอง (`$queryRaw` เปล่า ๆ) แล้วค่อยสรุปใน tx อื่น
    //    ⇒ โพรเซสที่ตายคาระหว่างสองอย่าง ทิ้งแถวที่ `expired = true` ไว้กับคะแนนเดิม และ **รอบถัดไปจองได้ 0 แถวแล้วเลิก**
    //    ⇒ คะแนนของคนนั้นเพี้ยนค้างตลอดไป ไม่มีใครซ่อม) · ตอนนี้ตายที่ไหนก็ rollback ทั้งชุด: ธงกับคะแนนไปพร้อมกันเสมอ
    //    ⇒ ค่าคงที่ที่จริงทุกขณะ: `score = GREATEST(0, Σ แต้มที่ยังไม่หมดอายุ)`
    //    SKIP LOCKED ยังทำงานเหมือนเดิม (รอบที่วิ่งซ้อนกันจองแถวคนละชุด) · ลำดับล็อก "แถวแต้ม → แถวผู้ติดต่อ" เหมือนกันทุกรอบ
    //    (ทางเขียนคะแนนล็อกผู้ติดต่อก่อนแล้ว "แทรก" แถวแต้มใบใหม่ ไม่ได้ล็อกแถวเก่า ⇒ ไม่มีวงรอ)
    const claimed = await prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<{ id: string; contactId: string }[]>`
        UPDATE "CrmScoreLog" SET "expired" = true
         WHERE "id" IN (
           SELECT l."id"
             FROM "CrmScoreLog" l
             JOIN "CrmContact" c ON c."id" = l."contactId"
             JOIN "AppSystem" s ON s."id" = c."systemId"
            WHERE l."expired" = false
              AND l."expiresAt" IS NOT NULL
              AND l."expiresAt" <= (${now.toISOString()}::timestamptz AT TIME ZONE 'UTC')
              AND ${v2Filter("s")}
              ${inFilter(Prisma.sql`l."tenantId"`, opts?.tenantIds)}
              ${inFilter(Prisma.sql`c."systemId"`, opts?.systemIds)}
            ORDER BY l."expiresAt" ASC, l."id" ASC
            LIMIT ${batch}
            FOR UPDATE OF l SKIP LOCKED)
        RETURNING "id", "contactId"`;
      if (rows.length === 0) return 0;
      const ids = [...new Set(rows.map((r) => String(r.contactId)))];
      const owners = await systemsOf(tx, ids);
      await scoringOf(tx, [...new Set([...owners.values()].map((o) => o.systemId))], cache);
      for (const contactId of ids) {
        const owner = owners.get(contactId);
        if (!owner) continue;
        const s = cache.get(owner.systemId);
        if (!s) continue;
        touched.add(contactId);
        const ctx: ScoringCtx = { tenantId: owner.tenantId, systemId: owner.systemId, actorUserId: null };
        const rec = await reconcile(tx, ctx, contactId, now, s.scoring);
        if (rec && rec.fromBand !== rec.toBand) {
          await emitOutbox(tx, {
            tenantId: ctx.tenantId,
            systemId: ctx.systemId,
            type: "crm.score.threshold",
            idempotencyKey: `crm.score.threshold#${contactId}#${rec.toBand}#decay#${new Date(thaiDayStartMs(now.getTime())).toISOString().slice(0, 10)}`,
            payload: { contactId, band: rec.toBand },
          });
        }
      }
      return rows.length;
    }, TX_SWEEP);
    if (claimed === 0) break;
    expired += claimed;
  }
  return { expired, contacts: touched.size, cutOff };
}

/**
 * งานรายวัน (ครึ่งหลัง) — event **เสมือน** `crm.contact.inactive`: คนที่เงียบเกิน `conditions.days ?? 30` วัน เสียแต้มตามกฎ
 * ครั้งเดียวต่อ "ช่วงที่เงียบ" — กุญแจ `crm.contact.inactive#<คน>#<เวลาความเคลื่อนไหวล่าสุด>` + partial UNIQUE (ruleId, eventKey)
 * ⇒ กวาดซ้ำวันเดียวกัน/วันถัดไปไม่หักซ้ำ · มีความเคลื่อนไหวใหม่แล้วเงียบอีกรอบ = ช่วงใหม่ = หักได้อีกครั้ง
 */
export async function applyInactivity(opts: ScoreSweepOpts = {}): Promise<{ logged: number; contacts: number; cutOff: boolean }> {
  const now = opts?.now ?? new Date();
  const batch = clamp(Math.trunc(Number(opts?.batchSize ?? SCORE_DECAY_BATCH)) || SCORE_DECAY_BATCH, 1, 5000);
  const stop = stopper(opts);
  let logged = 0;
  let cutOff = false;
  const touched = new Set<string>();
  const rules = await prisma.$queryRaw<{ id: string; tenantId: string; systemId: string; name: string; points: number; conditions: Prisma.JsonValue; expiresDays: number | null }[]>`
    SELECT r."id", r."tenantId", r."systemId", r."name", r."points", r."conditions", r."expiresDays"
      FROM "CrmScoreRule" r
      JOIN "AppSystem" s ON s."id" = r."systemId"
     WHERE r."event" = ${SCORE_INACTIVE_EVENT} AND r."active" = true
       AND ${v2Filter("s")}
       ${inFilter(Prisma.sql`r."tenantId"`, opts?.tenantIds)}
       ${inFilter(Prisma.sql`r."systemId"`, opts?.systemIds)}
     ORDER BY r."sortOrder" ASC, r."id" ASC`;
  const cache: SysScoring = new Map();
  for (const rule of rules) {
    if (stop()) {
      cutOff = true;
      break;
    }
    await scoringOf(prisma, [rule.systemId], cache);
    const s = cache.get(rule.systemId);
    if (!s) continue;
    const days = daysOf(rule.conditions) ?? SCORE_INACTIVE_DEFAULT_DAYS;
    const cut = new Date(now.getTime() - days * DAY_MS);
    const ctx: ScoringCtx = { tenantId: rule.tenantId, systemId: rule.systemId, actorUserId: null };
    let cursor = "";
    for (;;) {
      if (stop()) {
        cutOff = true;
        break;
      }
      const rows = await prisma.$queryRaw<{ id: string; anchor: Date }[]>`
        SELECT c."id", COALESCE(c."lastActivityAt", c."createdAt") AS "anchor"
          FROM "CrmContact" c
         WHERE c."tenantId" = ${rule.tenantId} AND c."systemId" = ${rule.systemId}
           AND c."archivedAt" IS NULL AND c."mergedIntoId" IS NULL
           AND COALESCE(c."lastActivityAt", c."createdAt") <= (${cut.toISOString()}::timestamptz AT TIME ZONE 'UTC')
           AND c."id" > ${cursor}
         ORDER BY c."id" ASC LIMIT ${batch}`;
      if (rows.length === 0) break;
      for (const row of rows) {
        const contactId = String(row.id);
        const anchor = new Date(row.anchor).toISOString();
        const r = await applyPoints(ctx, s.scoring, {
          contactId,
          ruleId: rule.id,
          points: rule.points,
          reason: rule.name,
          refType: null,
          refId: null,
          eventKey: `${SCORE_INACTIVE_EVENT}#${contactId}#${anchor}`,
          expiresAt: expiresAtOf(now, rule.expiresDays, s.scoring.decayDays),
          maxPerDay: null,
          at: now,
        });
        if (r) {
          logged += 1;
          touched.add(contactId);
        }
      }
      cursor = String(rows[rows.length - 1]?.id ?? "");
    }
  }
  return { logged, contacts: touched.size, cutOff };
}

/** ตัวงานของ `crm.scoring.decay` (ทะเบียนอยู่ที่ `src/lib/platform/minute-jobs.ts`) — หมดอายุแต้ม แล้วหักแต้มคนที่เงียบหาย */
export async function runDailyScoring(opts: ScoreSweepOpts = {}): Promise<{ expired: number; logged: number; cutOff: boolean }> {
  const d = await decay(opts);
  const i = await applyInactivity(opts);
  if (d.expired + i.logged > 0) {
    await logOps("INFO", "crm.scoring", `งานคะแนนรายวัน — แต้มหมดอายุ ${d.expired} แถว · หักคนที่เงียบหาย ${i.logged} แถว`, {}).catch(() => {});
  }
  return { expired: d.expired, logged: i.logged, cutOff: d.cutOff || i.cutOff };
}
