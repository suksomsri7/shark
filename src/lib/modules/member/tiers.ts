// tiers.ts — เอนจิน "ระดับสมาชิก" ของระบบสมาชิก v2 (WO M1.9 · D1)
// พิมพ์เขียว docs/modules/06-member-v2.md §4.3 §5.4 §7.1 §7.3 §7.5 §11.3 §11.9
//
// กติกาประจำไฟล์
//   • ctx = { tenantId, systemId (= ระบบสมาชิก), actorUserId } · actor = สิทธิ์ของคนที่กด (access.ts)
//   • prisma ดิบผ่าน `./db` เท่านั้น (จุดเดียวของโมดูลที่ล้วง core — ดู member/db.ts)
//   • ข้ามโมดูลผ่าน facade เท่านั้น: `approval/service` (สายอนุมัติกลาง)
//     🔴 ห้าม import `@/lib/modules/pos|booking|chat|kanban|account` — ตาราง PosSale/Appointment/
//        MemberSubscription ถูกอ่านด้วย prisma **อ่านอย่างเดียว** ในฟังก์ชัน `collectEvidence()`
//        เหตุผล: "หลักฐาน" ของกฎระดับคือข้อมูลดิบข้ามโมดูล (ยอดซื้อ/จำนวนครั้งที่มา/แบบเสียเงิน)
//        ถ้าเรียกผ่าน service ของ POS/จอง จะกลายเป็นเส้นพึ่งพาสองทาง (POS ก็เรียกสมาชิกอยู่แล้ว)
//        ⇒ อ่านตารางตรงแบบเดียวกับที่ `profile.ts#connectionsOf` ทำกับตัวเลข "การเชื่อมต่อ"
//
// นิยามที่เลือกไว้ (เขียนไว้ให้คนอ่านทีหลังไม่ต้องเดา)
//   1) `visits12m` = **จำนวนวันที่ไม่ซ้ำกัน** ที่ลูกค้ามาใช้บริการใน 12 เดือน นับจาก
//      บิล PosSale สถานะ PAID (paidAt) + นัด Appointment สถานะ DONE/CONFIRMED ที่ถึงเวลาแล้ว (startAt ≤ now)
//      เลือก "วันไม่ซ้ำ" ไม่ใช่ "จำนวนบิล" เพราะลูกค้าที่จ่าย 3 บิลในวันเดียว = มาร้าน 1 ครั้ง
//      (ไม่ใช้ MemberActivity type VISIT เพราะโมดูลที่เขียนแถวนั้นยังไม่ครบทุกทางเข้า → M3.7)
//   2) `match` ("ALL"/"ANY") ของกฎเก็บที่ **`AutomationRule.actionConfig.match`**
//      เหตุผล: `conditions` ต้องคงรูป `[{field, op, value, windowMonths?}]` ให้ตรงกับที่
//      `scripts/member-backfill-tiers.mts` เขียนไว้แล้วบน prod (แถวเก่าไม่มี `match` = อ่านเป็น "ALL")
//      ⇒ ไม่ต้อง reseed / ไม่ต้อง migrate ข้อมูลกฎที่ backfill ลงไปแล้ว
//   3) "กฎคงระดับ" ที่ไม่ได้ตั้ง (keepRuleId = null) → ใช้ **กฎเลื่อนระดับของระดับนั้นเอง** เป็นเกณฑ์คง
//      (ยังเข้าเกณฑ์ที่ทำให้ได้ระดับนี้อยู่ไหม) — ไม่งั้นระดับที่ backfill สร้างจะไม่มีวันถูกทบทวนเลย

import type { MemberTier, Prisma, TierBenefitType, TierChangeReason } from "@prisma/client";
import { z } from "zod";
import { emitOutbox } from "@/lib/core/outbox";
import * as approval from "@/lib/modules/approval/service";
import { prisma } from "./db";
import { hasMemberPerm, type MemberActor } from "./access";
import { MemberForbiddenError, MemberInputError, MemberNotFoundError } from "./errors";
import { MEMBER_LIMITS, memberLimitError } from "./limits";
import type { MemberCtx } from "./privacy";

type Tx = Prisma.TransactionClient;
const db = (tx?: Tx) => tx ?? prisma;

export type { MemberCtx };

// ───────────────────────── ชนิดข้อมูลสาธารณะ ─────────────────────────

export type TierRef = { id: string; key: string; name: string };

export type TierBenefitDto = {
  id: string;
  type: TierBenefitType;
  config: Record<string, unknown>;
  active: boolean;
};

export type TierDefDto = {
  id: string;
  key: string;
  name: string;
  color: string;
  icon: string | null;
  sortOrder: number;
  description: string | null;
  isDefault: boolean;
  paidPlanId: string | null;
  legacyTier: MemberTier | null;
  keepRuleId: string | null;
  upgradeRuleId: string | null;
  reviewCron: string | null;
  graceDays: number;
  notifyBeforeDays: number;
  archivedAt: Date | null;
  memberCount: number;
  benefits: TierBenefitDto[];
};

export const RULE_FIELDS = [
  "spent12m",
  "spent",
  "visits12m",
  "visits",
  "tierPoints",
  "memberDays",
  "paidPlan",
  "referrals",
] as const;
export type RuleField = (typeof RULE_FIELDS)[number];

export const RULE_OPS = ["gte", "gt", "lte", "lt", "eq"] as const;
export type RuleOp = (typeof RULE_OPS)[number];

export type RuleCondition = {
  field: RuleField;
  op: RuleOp;
  value: number | boolean;
  windowMonths?: number;
};

export type RuleInput = { match: "ALL" | "ANY"; conditions: RuleCondition[] };

export type TierRulesDto = {
  upgrade: RuleInput | null;
  keep: RuleInput | null;
  reviewCron: string | null;
  graceDays: number;
  notifyBeforeDays: number;
};

export type TierEvidence = {
  /** ยอดซื้อรวม 12 เดือน (สตางค์) — PosSale สถานะ PAID ของสมาชิกคนนี้ */
  spent12m: number;
  /** จำนวนวันไม่ซ้ำที่มาใช้บริการใน 12 เดือน */
  visits12m: number;
  tierPoints: number;
  /** จำนวนวันตั้งแต่สมัคร */
  memberDays: number;
  referrals: number;
  paidPlan: boolean;
  /** ยอดซื้อรายหน้าต่างเดือน — มีเฉพาะหน้าต่างที่กฎของร้านใช้จริง */
  spentByWindow?: Record<number, number>;
  /** จำนวนวันไม่ซ้ำรายหน้าต่างเดือน */
  visitsByWindow?: Record<number, number>;
};

export type TierProgress = { field: RuleField; current: number; target: number; pct: number };

export type EvaluateResult = {
  current: TierRef | null;
  next: TierRef | null;
  evidence: TierEvidence;
  wouldUpgradeTo: TierRef | null;
  wouldDowngradeTo: TierRef | null;
  progressToNext: TierProgress | null;
};

export type ApplyResult = { changed: boolean; from: TierRef | null; to: TierRef | null; historyId?: string };

export type ReviewRow = { customerId: string; tier: string | null; toTier?: string | null; shortfall?: number };

export type ReviewResult = {
  evaluated: number;
  upgraded: ReviewRow[];
  kept: ReviewRow[];
  atRisk: ReviewRow[];
  downgraded: ReviewRow[];
  notified: ReviewRow[];
  skipped: ReviewRow[];
};

export type BenefitsDto = {
  tier: { key: string; name: string } | null;
  discountPct: number;
  discountMaxSatang: number;
  discountFixedSatang: number;
  pointMultiplier: number;
  priorityBookingDays: number;
  freeServices: string[];
  noPointExpiry: boolean;
  cancelFeeDiscountPct: number;
  exclusiveItemIds: string[];
  welcomeVoucherTemplateId: string | null;
  birthdayGift: Record<string, unknown> | null;
};

export type ManualTierResult =
  | { applied: true; pending?: false; from: TierRef | null; to: TierRef | null }
  | { applied: false; pending: true; approvalRequestId: string };

// ───────────────────────── zod: กฎ / สิทธิประโยชน์ ─────────────────────────

const conditionSchema = z
  .object({
    field: z.enum(RULE_FIELDS),
    op: z.enum(RULE_OPS),
    value: z.union([z.number(), z.boolean()]),
    windowMonths: z.number().int().min(1).max(60).optional(),
  })
  .refine((c) => typeof c.value === "boolean" || (Number.isFinite(c.value) && c.value >= 0), {
    message: "ค่าที่ใช้เทียบต้องไม่ติดลบ",
  });

const ruleSchema = z.object({
  match: z.enum(["ALL", "ANY"]).default("ALL"),
  conditions: z.array(conditionSchema).min(1).max(10),
});

/** โครงของ config ต่อชนิดสิทธิประโยชน์ (§4.3) — ชนิดนอกทะเบียนนี้ = ตั้งไม่ได้ */
const benefitConfigSchemas: Record<TierBenefitType, z.ZodType> = {
  DISCOUNT_PCT: z.object({ pct: z.number().min(0).max(100), maxSatang: z.number().int().min(0).optional() }),
  DISCOUNT_FIXED: z.object({ satang: z.number().int().min(0) }),
  POINT_MULTIPLIER: z.object({ x: z.number().min(0).max(20) }),
  WELCOME_VOUCHER: z.object({ templateId: z.string().min(1) }),
  BIRTHDAY_GIFT: z.object({
    voucherTemplateId: z.string().min(1).optional(),
    rewardId: z.string().min(1).optional(),
    note: z.string().max(200).optional(),
  }),
  FREE_SERVICE: z.object({ itemIds: z.array(z.string().min(1)).min(1), perYear: z.number().int().min(1).optional() }),
  PRIORITY_BOOKING: z.object({ daysAhead: z.number().int().min(1).max(365) }),
  NO_POINT_EXPIRY: z.object({}),
  CANCEL_FEE_DISCOUNT: z.object({ pct: z.number().min(0).max(100) }),
  EXCLUSIVE_ITEMS: z.object({ itemIds: z.array(z.string().min(1)).min(1) }),
};

const BENEFIT_TYPES = Object.keys(benefitConfigSchemas) as TierBenefitType[];

/** zod ล้ม → ข้อความไทยที่บอกว่าช่องไหนผิด (ไม่โทษผู้ใช้ · บอกทางแก้) */
function badInput(what: string, err: unknown): never {
  const detail = err instanceof z.ZodError ? err.issues.map((i) => `${i.path.join(".") || "ค่า"}: ${i.message}`).join(" · ") : "";
  throw new MemberInputError(`${what}${detail ? ` — ${detail}` : ""}`);
}

// ───────────────────────── สิทธิ์ ─────────────────────────

function requireTierManage(actor: MemberActor): void {
  if (!hasMemberPerm(actor, "member.tier.manage")) {
    throw new MemberForbiddenError("บัญชีของคุณยังไม่ได้รับสิทธิ์จัดการระดับสมาชิก — ขอสิทธิ์จากเจ้าของร้านก่อน");
  }
}

function requireSetManual(actor: MemberActor): void {
  if (!hasMemberPerm(actor, "member.tier.setManual")) {
    throw new MemberForbiddenError("บัญชีของคุณยังไม่ได้รับสิทธิ์ตั้งระดับสมาชิกด้วยมือ — ขอสิทธิ์จากเจ้าของร้านก่อน");
  }
}

// ───────────────────────── ตัวช่วยเล็ก ๆ ─────────────────────────

const TIER_KEY_RE = /^[a-z][a-z0-9_]*$/;
const NOT_FOUND_TIER = "ไม่พบระดับสมาชิกนี้ในระบบสมาชิกที่เปิดอยู่";

function objectOf(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? { ...(value as Record<string, unknown>) } : {};
}

function asJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value ?? null)) as Prisma.InputJsonValue;
}

function monthsBefore(from: Date, months: number): Date {
  const d = new Date(from.getTime());
  d.setUTCMonth(d.getUTCMonth() - months);
  return d;
}

/**
 * รอบทบทวนถัดไปจาก `reviewCron` — รองรับรูปแบบเดียวที่ UI ให้ตั้งวันนี้คือ "0 3 1 * *"
 * = **วันที่ 1 ของเดือนถัดไป เวลา 03:00 ตามเวลาไทย** (UTC+7 ⇒ 20:00 UTC ของวันสุดท้ายเดือนก่อน)
 * 🔴 ตั้งใจทำแบบง่าย: ตัวแปล cron เต็มรูปแบบเป็นงานของ M1.10 (หน้าตั้งค่ารอบทบทวน)
 *    ผลลัพธ์ต้อง **มากกว่า** `from` เสมอ ไม่งั้นสมาชิกจะถูกทบทวนซ้ำในรอบเดียวกันไม่รู้จบ
 */
export function nextReviewAt(from: Date): Date {
  const bkk = new Date(from.getTime() + 7 * 3_600_000);
  return new Date(Date.UTC(bkk.getUTCFullYear(), bkk.getUTCMonth() + 1, 1, 3, 0, 0) - 7 * 3_600_000);
}

function tierRef(row: { id: string; key: string; name: string } | null | undefined): TierRef | null {
  return row ? { id: row.id, key: row.key, name: row.name } : null;
}

// ───────────────────────── โลกของระดับ (defs + กฎ) ─────────────────────────

type TierDefRow = {
  id: string;
  key: string;
  name: string;
  sortOrder: number;
  isDefault: boolean;
  legacyTier: MemberTier | null;
  keepRuleId: string | null;
  upgradeRuleId: string | null;
  reviewCron: string | null;
  graceDays: number;
  notifyBeforeDays: number;
};

type TierWorld = {
  /** ระดับที่ยังใช้งาน เรียงจากต่ำไปสูง */
  defs: TierDefRow[];
  byId: Map<string, TierDefRow>;
  upgradeOf: Map<string, RuleInput | null>;
  keepOf: Map<string, RuleInput | null>;
  fallbackTier: TierDefRow | null;
  /** หน้าต่างเดือนทั้งหมดที่กฎของร้านนี้ใช้จริง (ไว้คำนวณ evidence เท่าที่จำเป็น) */
  windows: number[];
};

/** อ่านกฎที่เก็บใน AutomationRule แล้วแปลงกลับเป็น RuleInput (แถวที่ backfill เขียนไม่มี `match` = ALL) */
function parseStoredRule(row: { conditions: Prisma.JsonValue; actionConfig: Prisma.JsonValue } | null | undefined): RuleInput | null {
  if (!row) return null;
  const raw = Array.isArray(row.conditions) ? (row.conditions as unknown[]) : [];
  const conditions: RuleCondition[] = [];
  for (const item of raw) {
    const c = objectOf(item);
    const field = String(c.field ?? "");
    const op = String(c.op ?? "");
    if (!(RULE_FIELDS as readonly string[]).includes(field)) continue;
    if (!(RULE_OPS as readonly string[]).includes(op)) continue;
    const value = typeof c.value === "boolean" ? c.value : Number(c.value ?? 0);
    const windowMonths = Number(c.windowMonths ?? 0);
    conditions.push({
      field: field as RuleField,
      op: op as RuleOp,
      value,
      ...(Number.isFinite(windowMonths) && windowMonths > 0 ? { windowMonths } : {}),
    });
  }
  if (conditions.length === 0) return null;
  const cfg = objectOf(row.actionConfig);
  const first = objectOf(raw[0]);
  const match = cfg.match === "ANY" || first.match === "ANY" ? "ANY" : "ALL";
  return { match, conditions };
}

async function loadWorld(ctx: MemberCtx, systemId: string, tx?: Tx): Promise<TierWorld> {
  const client = db(tx);
  const defs = (await client.memberTierDef.findMany({
    where: { tenantId: ctx.tenantId, systemId, archivedAt: null },
    orderBy: { sortOrder: "asc" },
    select: {
      id: true,
      key: true,
      name: true,
      sortOrder: true,
      isDefault: true,
      legacyTier: true,
      keepRuleId: true,
      upgradeRuleId: true,
      reviewCron: true,
      graceDays: true,
      notifyBeforeDays: true,
    },
  })) as TierDefRow[];

  const ruleIds = [
    ...new Set(defs.flatMap((d) => [d.upgradeRuleId, d.keepRuleId]).filter((x): x is string => !!x)),
  ];
  const rules = ruleIds.length
    ? await client.automationRule.findMany({
        where: { tenantId: ctx.tenantId, id: { in: ruleIds }, scope: "MEMBER_TIER" },
        select: { id: true, enabled: true, conditions: true, actionConfig: true },
      })
    : [];
  const ruleById = new Map(rules.map((r) => [r.id, r]));

  const upgradeOf = new Map<string, RuleInput | null>();
  const keepOf = new Map<string, RuleInput | null>();
  const windows = new Set<number>();
  const collectWindows = (rule: RuleInput | null) => {
    for (const c of rule?.conditions ?? []) if (c.windowMonths) windows.add(c.windowMonths);
  };
  for (const d of defs) {
    const up = d.upgradeRuleId ? ruleById.get(d.upgradeRuleId) : null;
    const keep = d.keepRuleId ? ruleById.get(d.keepRuleId) : null;
    const upRule = up?.enabled === false ? null : parseStoredRule(up);
    const keepRule = keep?.enabled === false ? null : parseStoredRule(keep);
    upgradeOf.set(d.id, upRule);
    keepOf.set(d.id, keepRule);
    collectWindows(upRule);
    collectWindows(keepRule);
  }

  return {
    defs,
    byId: new Map(defs.map((d) => [d.id, d])),
    upgradeOf,
    keepOf,
    fallbackTier: defs.find((d) => d.isDefault) ?? defs[0] ?? null,
    windows: [...windows],
  };
}

/** เกณฑ์ "คงระดับ" ที่ใช้จริง — ไม่ได้ตั้งกฎคง → ใช้กฎเลื่อนเข้าระดับนั้นเอง (ดูหัวไฟล์ ข้อ 3) */
function effectiveKeepRule(world: TierWorld, tierDefId: string): RuleInput | null {
  return world.keepOf.get(tierDefId) ?? world.upgradeOf.get(tierDefId) ?? null;
}

// ───────────────────────── หลักฐาน (evidence) ─────────────────────────

function numberOf(value: number | boolean): number {
  return typeof value === "boolean" ? (value ? 1 : 0) : value;
}

function actualOf(cond: RuleCondition, ev: TierEvidence): number {
  switch (cond.field) {
    case "spent12m":
      return ev.spent12m;
    case "spent":
      return cond.windowMonths ? (ev.spentByWindow?.[cond.windowMonths] ?? 0) : ev.spent12m;
    case "visits12m":
      return ev.visits12m;
    case "visits":
      return cond.windowMonths ? (ev.visitsByWindow?.[cond.windowMonths] ?? 0) : ev.visits12m;
    case "tierPoints":
      return ev.tierPoints;
    case "memberDays":
      return ev.memberDays;
    case "referrals":
      return ev.referrals;
    case "paidPlan":
      return ev.paidPlan ? 1 : 0;
  }
}

function condPasses(cond: RuleCondition, ev: TierEvidence): boolean {
  const a = actualOf(cond, ev);
  const v = numberOf(cond.value);
  switch (cond.op) {
    case "gte":
      return a >= v;
    case "gt":
      return a > v;
    case "lte":
      return a <= v;
    case "lt":
      return a < v;
    case "eq":
      return a === v;
  }
}

function rulePasses(rule: RuleInput | null, ev: TierEvidence): boolean {
  if (!rule || rule.conditions.length === 0) return false;
  return rule.match === "ANY"
    ? rule.conditions.some((c) => condPasses(c, ev))
    : rule.conditions.every((c) => condPasses(c, ev));
}

/** "ยังขาดอีกเท่าไร" ของกฎที่ไม่ผ่าน — ALL = ช่องว่างที่กว้างสุด · ANY = ช่องว่างที่แคบสุด (> 0 เสมอ) */
function shortfallOf(rule: RuleInput | null, ev: TierEvidence): number {
  if (!rule) return 1;
  const gaps: number[] = [];
  for (const c of rule.conditions) {
    if (condPasses(c, ev)) continue;
    const a = actualOf(c, ev);
    const v = numberOf(c.value);
    gaps.push(Math.abs(v - a) || 1);
  }
  if (gaps.length === 0) return 1;
  return rule.match === "ANY" ? Math.min(...gaps) : Math.max(...gaps);
}

type CustomerRow = {
  id: string;
  tenantId: string;
  memberSystemId: string;
  tierDefId: string | null;
  tierPoints: number;
  tierSince: Date | null;
  tierReviewAt: Date | null;
  createdAt: Date;
  homeUnitId: string | null;
};

const CUSTOMER_SELECT = {
  id: true,
  tenantId: true,
  memberSystemId: true,
  tierDefId: true,
  tierPoints: true,
  tierSince: true,
  tierReviewAt: true,
  createdAt: true,
  homeUnitId: true,
} as const;

const dayKey = (d: Date) => d.toISOString().slice(0, 10);

/**
 * รวบรวมหลักฐานของสมาชิก 1 คน ณ เวลา `now`
 * 🔴 อ่าน PosSale / Appointment / MemberSubscription ด้วย prisma ตรง — เหตุผลอยู่หัวไฟล์
 *    (อ่านอย่างเดียว · where ผูก tenantId + customerId ทุกตัว · ไม่เขียนอะไรลงตารางของโมดูลอื่น)
 */
async function collectEvidence(customer: CustomerRow, now: Date, windows: number[]): Promise<TierEvidence> {
  const since12 = monthsBefore(now, 12);
  const [sales, appointments, referrals, paidPlans] = await Promise.all([
    // 🔴 บิลไม่มีขอบบน (`lte: now`) โดยตั้งใจ: บิลที่ปิดแล้ว = เงินที่ร้านได้รับจริง ต่อให้วันที่บนบิล
    //    ถูกบันทึกล่วงหน้า (ร้านคีย์ย้อน/ล่วงหน้า · ชุดข้อมูลทดสอบ) ก็ต้องนับเข้ายอดของลูกค้าคนนั้น
    //    ตรงข้ามกับ "นัด" ข้างล่างที่ต้องถึงเวลาแล้วจริง ๆ ถึงจะเรียกว่า "มาใช้บริการ"
    prisma.posSale.findMany({
      where: { tenantId: customer.tenantId, memberId: customer.id, status: "PAID", paidAt: { gte: since12 } },
      select: { paidAt: true, grandTotalSatang: true },
    }),
    prisma.appointment.findMany({
      where: {
        tenantId: customer.tenantId,
        customerId: customer.id,
        status: { in: ["DONE", "CONFIRMED"] },
        startAt: { gte: since12, lte: now },
      },
      select: { startAt: true },
    }),
    prisma.customer.count({ where: { tenantId: customer.tenantId, referredById: customer.id } }),
    prisma.memberSubscription.count({
      where: { tenantId: customer.tenantId, customerId: customer.id, status: "ACTIVE", endAt: { gt: now } },
    }),
  ]);

  const visitDays = new Set<string>();
  let spent12m = 0;
  for (const s of sales) {
    spent12m += s.grandTotalSatang;
    if (s.paidAt) visitDays.add(dayKey(s.paidAt));
  }
  for (const a of appointments) visitDays.add(dayKey(a.startAt));

  const spentByWindow: Record<number, number> = {};
  const visitsByWindow: Record<number, number> = {};
  for (const w of windows) {
    const since = monthsBefore(now, w);
    let sum = 0;
    const days = new Set<string>();
    for (const s of sales) {
      if (!s.paidAt || s.paidAt < since) continue;
      sum += s.grandTotalSatang;
      days.add(dayKey(s.paidAt));
    }
    for (const a of appointments) if (a.startAt >= since) days.add(dayKey(a.startAt));
    spentByWindow[w] = sum;
    visitsByWindow[w] = days.size;
  }

  return {
    spent12m,
    visits12m: visitDays.size,
    tierPoints: customer.tierPoints,
    // ไม่ตัดที่ 0: สมาชิกที่ถูกนำเข้าพร้อมวันสมัคร "ในอนาคต" ต้องได้ค่าติดลบตามจริง จะได้เห็นว่าข้อมูลเพี้ยน
    // (ตัดเป็น 0 = กลืนความผิดปกติ แล้วกฎ "อายุสมาชิก" จะตัดสินจากค่าที่ไม่ใช่ของจริง)
    memberDays: Math.floor((now.getTime() - customer.createdAt.getTime()) / 86_400_000),
    referrals,
    paidPlan: paidPlans > 0,
    ...(windows.length ? { spentByWindow, visitsByWindow } : {}),
  };
}

// ───────────────────────── นิยามระดับ (CRUD) ─────────────────────────

async function loadTierDef(ctx: MemberCtx, id: string, tx?: Tx) {
  const row = await db(tx).memberTierDef.findFirst({ where: { id, tenantId: ctx.tenantId, systemId: ctx.systemId } });
  if (!row) throw new MemberNotFoundError(NOT_FOUND_TIER);
  return row;
}

export async function listTierDefs(
  ctx: MemberCtx,
  opts: { includeArchived?: boolean } = {},
): Promise<TierDefDto[]> {
  const defs = await prisma.memberTierDef.findMany({
    where: { tenantId: ctx.tenantId, systemId: ctx.systemId, ...(opts.includeArchived ? {} : { archivedAt: null }) },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
  if (defs.length === 0) return [];
  const ids = defs.map((d) => d.id);
  const [counts, benefits] = await Promise.all([
    prisma.customer.groupBy({
      by: ["tierDefId"],
      where: { tenantId: ctx.tenantId, memberSystemId: ctx.systemId, tierDefId: { in: ids } },
      _count: { _all: true },
    }),
    prisma.memberTierBenefit.findMany({
      where: { tenantId: ctx.tenantId, tierDefId: { in: ids } },
      orderBy: { createdAt: "asc" },
    }),
  ]);
  const countBy = new Map(counts.map((c) => [c.tierDefId ?? "", c._count._all]));
  return defs.map((d) => ({
    id: d.id,
    key: d.key,
    name: d.name,
    color: d.color,
    icon: d.icon,
    sortOrder: d.sortOrder,
    description: d.description,
    isDefault: d.isDefault,
    paidPlanId: d.paidPlanId,
    legacyTier: d.legacyTier,
    keepRuleId: d.keepRuleId,
    upgradeRuleId: d.upgradeRuleId,
    reviewCron: d.reviewCron,
    graceDays: d.graceDays,
    notifyBeforeDays: d.notifyBeforeDays,
    archivedAt: d.archivedAt,
    memberCount: countBy.get(d.id) ?? 0,
    benefits: benefits
      .filter((b) => b.tierDefId === d.id)
      .map((b) => ({ id: b.id, type: b.type, config: objectOf(b.config), active: b.active })),
  }));
}

const createTierSchema = z.object({
  key: z.string().trim().min(1).max(MEMBER_LIMITS.keyLength),
  name: z.string().trim().min(1).max(60),
  color: z.enum(["SLATE", "BLUE", "GREEN", "AMBER", "RED", "PURPLE"]),
  icon: z.string().trim().max(40).nullish(),
  description: z.string().trim().max(300).nullish(),
  isDefault: z.boolean().optional(),
  paidPlanId: z.string().trim().min(1).nullish(),
  legacyTier: z.enum(["MEMBER", "SILVER", "GOLD", "PLATINUM"]).nullish(),
});

export async function createTierDef(
  ctx: MemberCtx,
  actor: MemberActor,
  input: z.input<typeof createTierSchema>,
): Promise<TierDefDto> {
  requireTierManage(actor);
  const parsed = createTierSchema.safeParse(input);
  if (!parsed.success) badInput("ข้อมูลระดับสมาชิกยังไม่ครบหรือรูปแบบไม่ถูกต้อง", parsed.error);
  const data = parsed.data;
  if (!TIER_KEY_RE.test(data.key)) {
    throw new MemberInputError(`รหัสระดับ "${data.key}" ใช้ไม่ได้ — ใช้ตัวอักษรอังกฤษพิมพ์เล็ก ตัวเลข และ _ เท่านั้น และต้องขึ้นต้นด้วยตัวอักษร`);
  }
  const dup = await prisma.memberTierDef.findFirst({ where: { systemId: ctx.systemId, key: data.key } });
  if (dup) {
    throw new MemberInputError(
      `รหัสระดับ "${data.key}" มีอยู่แล้วในระบบสมาชิกนี้${dup.archivedAt ? " (อยู่ในคลัง — เอากลับมาใช้แทนการสร้างใหม่ได้)" : ""}`,
    );
  }
  const active = await prisma.memberTierDef.count({ where: { systemId: ctx.systemId, archivedAt: null } });
  if (active >= MEMBER_LIMITS.tiers) {
    throw memberLimitError(`ระบบสมาชิกนี้มีระดับครบ ${MEMBER_LIMITS.tiers} ระดับแล้ว — เก็บระดับที่ไม่ใช้เข้าคลังก่อนจึงจะเพิ่มใหม่ได้`);
  }
  const max = await prisma.memberTierDef.aggregate({ where: { systemId: ctx.systemId }, _max: { sortOrder: true } });

  const row = await prisma.$transaction(async (tx) => {
    if (data.isDefault) {
      await tx.memberTierDef.updateMany({ where: { systemId: ctx.systemId, isDefault: true }, data: { isDefault: false } });
    }
    return tx.memberTierDef.create({
      data: {
        tenantId: ctx.tenantId,
        systemId: ctx.systemId,
        key: data.key,
        name: data.name,
        color: data.color,
        icon: data.icon ?? null,
        description: data.description ?? null,
        isDefault: data.isDefault ?? false,
        paidPlanId: data.paidPlanId ?? null,
        legacyTier: data.legacyTier ?? null,
        sortOrder: (max._max.sortOrder ?? -1) + 1,
      },
    });
  });
  return (await listTierDefs(ctx, { includeArchived: true })).find((d) => d.id === row.id) as TierDefDto;
}

const updateTierSchema = createTierSchema.partial().omit({ key: true }).extend({
  reviewCron: z.string().trim().min(1).max(60).nullish(),
  graceDays: z.number().int().min(0).max(365).optional(),
  notifyBeforeDays: z.number().int().min(0).max(365).optional(),
});

export async function updateTierDef(
  ctx: MemberCtx,
  actor: MemberActor,
  id: string,
  patch: z.input<typeof updateTierSchema>,
): Promise<TierDefDto> {
  requireTierManage(actor);
  const current = await loadTierDef(ctx, id);
  const parsed = updateTierSchema.safeParse(patch);
  if (!parsed.success) badInput("ข้อมูลที่ส่งมาแก้ระดับสมาชิกไม่ถูกต้อง", parsed.error);
  const p = parsed.data;
  if (current.isDefault && p.isDefault === false) {
    throw new MemberInputError("ระบบสมาชิกต้องมีระดับปริยาย 1 ระดับเสมอ — ตั้งระดับอื่นเป็นปริยายก่อน");
  }
  await prisma.$transaction(async (tx) => {
    if (p.isDefault === true) {
      await tx.memberTierDef.updateMany({ where: { systemId: ctx.systemId, isDefault: true }, data: { isDefault: false } });
    }
    await tx.memberTierDef.update({
      where: { id },
      data: {
        ...(p.name === undefined ? {} : { name: p.name }),
        ...(p.color === undefined ? {} : { color: p.color }),
        ...(p.icon === undefined ? {} : { icon: p.icon ?? null }),
        ...(p.description === undefined ? {} : { description: p.description ?? null }),
        ...(p.isDefault === undefined ? {} : { isDefault: p.isDefault }),
        ...(p.paidPlanId === undefined ? {} : { paidPlanId: p.paidPlanId ?? null }),
        ...(p.legacyTier === undefined ? {} : { legacyTier: p.legacyTier ?? null }),
        ...(p.reviewCron === undefined ? {} : { reviewCron: p.reviewCron ?? null }),
        ...(p.graceDays === undefined ? {} : { graceDays: p.graceDays }),
        ...(p.notifyBeforeDays === undefined ? {} : { notifyBeforeDays: p.notifyBeforeDays }),
      },
    });
  });
  return (await listTierDefs(ctx, { includeArchived: true })).find((d) => d.id === id) as TierDefDto;
}

export async function reorderTierDefs(ctx: MemberCtx, actor: MemberActor, ids: string[]): Promise<TierDefDto[]> {
  requireTierManage(actor);
  if (!Array.isArray(ids) || ids.length === 0) throw new MemberInputError("ยังไม่ได้ส่งลำดับระดับมา — ส่งรายการ id ตามลำดับที่ต้องการ");
  const rows = await prisma.memberTierDef.findMany({ where: { tenantId: ctx.tenantId, systemId: ctx.systemId, id: { in: ids } }, select: { id: true } });
  if (rows.length !== ids.length) throw new MemberNotFoundError(NOT_FOUND_TIER);
  await prisma.$transaction(ids.map((id, i) => prisma.memberTierDef.update({ where: { id }, data: { sortOrder: i } })));
  return listTierDefs(ctx, {});
}

export async function archiveTierDef(
  ctx: MemberCtx,
  actor: MemberActor,
  id: string,
  opts: { moveToTierId?: string | null } = {},
): Promise<{ archived: true; moved: number }> {
  requireTierManage(actor);
  const tier = await loadTierDef(ctx, id);
  if (tier.archivedAt) return { archived: true, moved: 0 };
  if (tier.isDefault) throw new MemberInputError("ระดับปริยายเก็บเข้าคลังไม่ได้ — ตั้งระดับอื่นเป็นปริยายก่อน");
  const moveToTierId = opts.moveToTierId ?? null;
  if (!moveToTierId) {
    throw new MemberInputError("ต้องเลือกก่อนว่าจะย้ายสมาชิกในระดับนี้ไปอยู่ระดับไหน แล้วจึงเก็บระดับเข้าคลังได้");
  }
  if (moveToTierId === id) throw new MemberInputError("ย้ายสมาชิกไปยังระดับเดิมไม่ได้ — เลือกระดับปลายทางอื่น");
  const target = await loadTierDef(ctx, moveToTierId);
  if (target.archivedAt) throw new MemberInputError("ระดับปลายทางอยู่ในคลังแล้ว — เลือกระดับที่ยังใช้งานอยู่");

  const members = await prisma.customer.findMany({
    where: { tenantId: ctx.tenantId, memberSystemId: ctx.systemId, tierDefId: id },
    select: { id: true },
  });
  for (const m of members) {
    await applyTierChange(ctx, m.id, target.id, "MANUAL", { reason: `ระดับ "${tier.name}" ถูกเก็บเข้าคลัง`, archivedTierDefId: id }, { byUserId: ctx.actorUserId });
  }
  await prisma.memberTierDef.update({ where: { id }, data: { archivedAt: new Date() } });
  return { archived: true, moved: members.length };
}

// ───────────────────────── สิทธิประโยชน์ ─────────────────────────

export async function setBenefits(
  ctx: MemberCtx,
  actor: MemberActor,
  tierDefId: string,
  benefits: { type: string; config?: unknown; active?: boolean }[],
): Promise<TierBenefitDto[]> {
  requireTierManage(actor);
  await loadTierDef(ctx, tierDefId);
  if (!Array.isArray(benefits)) throw new MemberInputError("รายการสิทธิประโยชน์ต้องเป็นรายการ");
  const rows = benefits.map((b) => {
    if (!BENEFIT_TYPES.includes(b.type as TierBenefitType)) {
      throw new MemberInputError(`ยังไม่รองรับสิทธิประโยชน์ชนิด "${b.type}" — เลือกจากรายการที่มีให้`);
    }
    const type = b.type as TierBenefitType;
    const parsed = benefitConfigSchemas[type].safeParse(objectOf(b.config));
    if (!parsed.success) badInput(`ค่าของสิทธิประโยชน์ "${type}" ยังไม่ถูกต้อง`, parsed.error);
    return { type, config: asJson(parsed.data), active: b.active ?? true };
  });

  await prisma.$transaction(async (tx) => {
    await tx.memberTierBenefit.deleteMany({ where: { tenantId: ctx.tenantId, tierDefId } });
    for (const r of rows) {
      await tx.memberTierBenefit.create({ data: { tenantId: ctx.tenantId, tierDefId, type: r.type, config: r.config, active: r.active } });
    }
  });
  const saved = await prisma.memberTierBenefit.findMany({ where: { tenantId: ctx.tenantId, tierDefId }, orderBy: { createdAt: "asc" } });
  return saved.map((b) => ({ id: b.id, type: b.type, config: objectOf(b.config), active: b.active }));
}

export async function benefitsFor(ctx: MemberCtx, customerId: string): Promise<BenefitsDto> {
  const customer = await prisma.customer.findFirst({
    where: { id: customerId, tenantId: ctx.tenantId, memberSystemId: ctx.systemId },
    select: { id: true, tierDefId: true },
  });
  if (!customer) throw new MemberNotFoundError("ไม่พบสมาชิกคนนี้ในระบบสมาชิกที่เปิดอยู่");
  const tier = customer.tierDefId
    ? await prisma.memberTierDef.findFirst({ where: { id: customer.tierDefId, tenantId: ctx.tenantId } })
    : await prisma.memberTierDef.findFirst({ where: { tenantId: ctx.tenantId, systemId: ctx.systemId, isDefault: true, archivedAt: null } });

  const out: BenefitsDto = {
    tier: tier ? { key: tier.key, name: tier.name } : null,
    discountPct: 0,
    discountMaxSatang: 0,
    discountFixedSatang: 0,
    pointMultiplier: 1,
    priorityBookingDays: 0,
    freeServices: [],
    noPointExpiry: false,
    cancelFeeDiscountPct: 0,
    exclusiveItemIds: [],
    welcomeVoucherTemplateId: null,
    birthdayGift: null,
  };
  if (!tier) return out;

  const rows = await prisma.memberTierBenefit.findMany({ where: { tenantId: ctx.tenantId, tierDefId: tier.id, active: true } });
  const num = (v: unknown, fallback = 0) => (typeof v === "number" && Number.isFinite(v) ? v : fallback);
  const strList = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
  for (const b of rows) {
    const cfg = objectOf(b.config);
    switch (b.type) {
      case "DISCOUNT_PCT":
        out.discountPct = num(cfg.pct);
        out.discountMaxSatang = num(cfg.maxSatang);
        break;
      case "DISCOUNT_FIXED":
        out.discountFixedSatang = num(cfg.satang);
        break;
      case "POINT_MULTIPLIER":
        out.pointMultiplier = num(cfg.x, 1);
        break;
      case "PRIORITY_BOOKING":
        out.priorityBookingDays = num(cfg.daysAhead);
        break;
      case "FREE_SERVICE":
        out.freeServices = [...out.freeServices, ...strList(cfg.itemIds)];
        break;
      case "NO_POINT_EXPIRY":
        out.noPointExpiry = true;
        break;
      case "CANCEL_FEE_DISCOUNT":
        out.cancelFeeDiscountPct = num(cfg.pct);
        break;
      case "EXCLUSIVE_ITEMS":
        out.exclusiveItemIds = [...out.exclusiveItemIds, ...strList(cfg.itemIds)];
        break;
      case "WELCOME_VOUCHER":
        out.welcomeVoucherTemplateId = typeof cfg.templateId === "string" ? cfg.templateId : null;
        break;
      case "BIRTHDAY_GIFT":
        out.birthdayGift = cfg;
        break;
    }
  }
  return out;
}

// ───────────────────────── กฎเลื่อน/คงระดับ (AutomationRule scope MEMBER_TIER) ─────────────────────────

function normalizeRule(input: unknown, what: string): RuleInput {
  const parsed = ruleSchema.safeParse(input);
  if (!parsed.success) badInput(`${what}ยังตั้งไม่ถูกต้อง`, parsed.error);
  return parsed.data as RuleInput;
}

async function writeRule(
  ctx: MemberCtx,
  tier: { id: string; name: string },
  kind: "upgrade" | "keep",
  currentRuleId: string | null,
  rule: RuleInput,
): Promise<string> {
  const name = kind === "upgrade" ? `เลื่อนเป็น ${tier.name} อัตโนมัติ` : `คงระดับ ${tier.name}`;
  const data = {
    name,
    enabled: true,
    // 🔴 `conditions` เก็บรูปเดียวกับที่ backfill เขียน · `match` อยู่ที่ actionConfig (ดูหัวไฟล์ ข้อ 2)
    conditions: asJson(rule.conditions),
    actionConfig: asJson({ match: rule.match, tierRuleKind: kind }),
    actions: asJson([{ type: "SET_TIER", params: { tierDefId: tier.id } }]),
  };
  if (currentRuleId) {
    const existing = await prisma.automationRule.findFirst({ where: { id: currentRuleId, tenantId: ctx.tenantId, scope: "MEMBER_TIER" } });
    if (existing) {
      await prisma.automationRule.update({ where: { id: currentRuleId }, data });
      return currentRuleId;
    }
  }
  const row = await prisma.automationRule.create({
    data: {
      tenantId: ctx.tenantId,
      event: "", // กฎระดับถูกเรียกโดยเอนจินระดับ ไม่ได้ผูก outbox event ตัวใดตัวหนึ่ง
      // actionType/actionConfig = placeholder ตามคอมเมนต์ใน automation.prisma (แบบเดียวกับ K2.9)
      actionType: "NOTIFY",
      scope: "MEMBER_TIER",
      systemId: ctx.systemId,
      memberSystemId: ctx.systemId,
      tierDefId: tier.id,
      kind: "RULE",
      ...data,
    },
  });
  return row.id;
}

export async function setTierRules(
  ctx: MemberCtx,
  actor: MemberActor,
  tierDefId: string,
  input: {
    upgrade?: RuleInput | null;
    keep?: RuleInput | null;
    reviewCron?: string | null;
    graceDays?: number;
    notifyBeforeDays?: number;
  },
): Promise<TierRulesDto> {
  requireTierManage(actor);
  const tier = await loadTierDef(ctx, tierDefId);

  const patch: { upgradeRuleId?: string | null; keepRuleId?: string | null; reviewCron?: string | null; graceDays?: number; notifyBeforeDays?: number } = {};
  const drop: string[] = [];

  if (input.upgrade !== undefined) {
    if (input.upgrade === null) {
      if (tier.upgradeRuleId) drop.push(tier.upgradeRuleId);
      patch.upgradeRuleId = null;
    } else {
      patch.upgradeRuleId = await writeRule(ctx, tier, "upgrade", tier.upgradeRuleId, normalizeRule(input.upgrade, "กฎเลื่อนระดับ"));
    }
  }
  if (input.keep !== undefined) {
    if (input.keep === null) {
      if (tier.keepRuleId) drop.push(tier.keepRuleId);
      patch.keepRuleId = null;
    } else {
      patch.keepRuleId = await writeRule(ctx, tier, "keep", tier.keepRuleId, normalizeRule(input.keep, "กฎคงระดับ"));
    }
  }
  if (input.reviewCron !== undefined) patch.reviewCron = input.reviewCron ?? null;
  if (input.graceDays !== undefined) {
    if (!Number.isInteger(input.graceDays) || input.graceDays < 0 || input.graceDays > 365) {
      throw new MemberInputError("จำนวนวันผ่อนผันต้องเป็นจำนวนเต็ม 0–365 วัน");
    }
    patch.graceDays = input.graceDays;
  }
  if (input.notifyBeforeDays !== undefined) {
    if (!Number.isInteger(input.notifyBeforeDays) || input.notifyBeforeDays < 0 || input.notifyBeforeDays > 365) {
      throw new MemberInputError("จำนวนวันแจ้งล่วงหน้าต้องเป็นจำนวนเต็ม 0–365 วัน");
    }
    patch.notifyBeforeDays = input.notifyBeforeDays;
  }

  if (Object.keys(patch).length > 0) await prisma.memberTierDef.update({ where: { id: tierDefId }, data: patch });
  if (drop.length) await prisma.automationRule.deleteMany({ where: { tenantId: ctx.tenantId, id: { in: drop }, scope: "MEMBER_TIER" } });
  return getTierRules(ctx, tierDefId);
}

export async function getTierRules(ctx: MemberCtx, tierDefId: string): Promise<TierRulesDto> {
  const tier = await loadTierDef(ctx, tierDefId);
  const ids = [tier.upgradeRuleId, tier.keepRuleId].filter((x): x is string => !!x);
  const rules = ids.length
    ? await prisma.automationRule.findMany({ where: { tenantId: ctx.tenantId, id: { in: ids }, scope: "MEMBER_TIER" } })
    : [];
  const byId = new Map(rules.map((r) => [r.id, r]));
  return {
    upgrade: tier.upgradeRuleId ? parseStoredRule(byId.get(tier.upgradeRuleId)) : null,
    keep: tier.keepRuleId ? parseStoredRule(byId.get(tier.keepRuleId)) : null,
    reviewCron: tier.reviewCron,
    graceDays: tier.graceDays,
    notifyBeforeDays: tier.notifyBeforeDays,
  };
}

// ───────────────────────── ประเมินระดับ ─────────────────────────

async function loadMember(ctx: MemberCtx, customerId: string, tx?: Tx): Promise<CustomerRow> {
  const row = await db(tx).customer.findFirst({
    where: { id: customerId, tenantId: ctx.tenantId, memberSystemId: ctx.systemId },
    select: CUSTOMER_SELECT,
  });
  if (!row) throw new MemberNotFoundError("ไม่พบสมาชิกคนนี้ในระบบสมาชิกที่เปิดอยู่");
  return row;
}

function evaluateWorld(world: TierWorld, customer: CustomerRow, ev: TierEvidence): EvaluateResult {
  const current = (customer.tierDefId ? world.byId.get(customer.tierDefId) : null) ?? world.fallbackTier;
  const higher = current ? world.defs.filter((d) => d.sortOrder > current.sortOrder) : world.defs;
  const next = higher[0] ?? null;

  const passingHigher = higher.filter((d) => rulePasses(world.upgradeOf.get(d.id) ?? null, ev));
  const wouldUpgradeTo = passingHigher.length ? passingHigher[passingHigher.length - 1]! : null;

  let wouldDowngradeTo: TierDefRow | null = null;
  if (current && !current.isDefault) {
    const keepRule = effectiveKeepRule(world, current.id);
    if (keepRule && !rulePasses(keepRule, ev)) {
      const lower = world.defs.filter((d) => d.sortOrder < current.sortOrder);
      const passing = lower.filter((d) => rulePasses(world.upgradeOf.get(d.id) ?? null, ev));
      wouldDowngradeTo = passing.length ? passing[passing.length - 1]! : (world.fallbackTier ?? lower[0] ?? null);
      if (wouldDowngradeTo && wouldDowngradeTo.id === current.id) wouldDowngradeTo = null;
    }
  }

  let progressToNext: TierProgress | null = null;
  const nextRule = next ? world.upgradeOf.get(next.id) : null;
  const firstCond = nextRule?.conditions[0];
  if (firstCond) {
    const target = numberOf(firstCond.value);
    const cur = actualOf(firstCond, ev);
    progressToNext = {
      field: firstCond.field,
      current: cur,
      target,
      pct: target > 0 ? Math.max(0, Math.min(100, Math.round((cur / target) * 100))) : cur > 0 ? 100 : 0,
    };
  }

  return {
    current: tierRef(current),
    next: tierRef(next),
    evidence: ev,
    wouldUpgradeTo: tierRef(wouldUpgradeTo),
    wouldDowngradeTo: tierRef(wouldDowngradeTo),
    progressToNext,
  };
}

export async function evaluateMember(
  ctx: MemberCtx,
  customerId: string,
  opts: { now?: Date; evidenceOverride?: Partial<TierEvidence>; noCache?: boolean } = {},
): Promise<EvaluateResult> {
  const now = opts.now ?? new Date();
  const customer = await loadMember(ctx, customerId);
  const world = await loadWorld(ctx, ctx.systemId);
  const base = await collectEvidence(customer, now, world.windows);
  const overridden = !!opts.evidenceOverride && Object.keys(opts.evidenceOverride).length > 0;
  const ev: TierEvidence = overridden ? { ...base, ...opts.evidenceOverride } : base;

  // อัปเดตแคชรายวันของสมาชิก (หน้ารวม/รายงานอ่านจากตรงนี้) — ยกเว้นตอนจำลอง (override) หรือรอบ dry-run
  if (!overridden && !opts.noCache) {
    await prisma.customer.update({
      where: { id: customer.id },
      data: { spent12mSatang: BigInt(base.spent12m), visits12m: base.visits12m },
    });
  }
  return evaluateWorld(world, customer, ev);
}

// ───────────────────────── ใช้ระดับใหม่ ─────────────────────────

/** hook ให้โมดูลที่มีของแจกตอนขึ้นระดับมาต่อท้าย (M2.5 voucher ต้อนรับ) — ล้มแล้วห้ามพาการเลื่อนระดับล้ม */
export type TierChangedHook = (evt: {
  tenantId: string;
  systemId: string;
  customerId: string;
  fromTierDefId: string | null;
  toTierDefId: string;
  reason: TierChangeReason;
}) => Promise<void>;

const tierChangedHooks: TierChangedHook[] = [];
export function onTierChanged(hook: TierChangedHook): void {
  tierChangedHooks.push(hook);
}

export async function applyTierChange(
  ctx: MemberCtx,
  customerId: string,
  toTierDefId: string,
  reason: TierChangeReason,
  evidence: Record<string, unknown>,
  opts: {
    byUserId?: string | null;
    ruleId?: string | null;
    approvalRequestId?: string | null;
    manualUntil?: Date | null;
    notifiedAt?: Date | null;
    now?: Date;
    tx?: Tx;
  } = {},
): Promise<ApplyResult> {
  const now = opts.now ?? new Date();
  const run = async (tx: Tx): Promise<ApplyResult> => {
    const customer = await loadMember(ctx, customerId, tx);
    const target = await tx.memberTierDef.findFirst({ where: { id: toTierDefId, tenantId: ctx.tenantId, systemId: ctx.systemId } });
    if (!target) throw new MemberNotFoundError(NOT_FOUND_TIER);
    if (target.archivedAt) throw new MemberInputError(`ระดับ "${target.name}" อยู่ในคลังแล้ว — ย้ายสมาชิกไปยังระดับที่ยังใช้งานอยู่แทน`);
    const from = customer.tierDefId
      ? await tx.memberTierDef.findFirst({ where: { id: customer.tierDefId }, select: { id: true, key: true, name: true } })
      : null;
    if (from?.id === target.id) return { changed: false, from: tierRef(from), to: tierRef(target) };

    const history = await tx.memberTierHistory.create({
      data: {
        tenantId: ctx.tenantId,
        customerId,
        fromTierDefId: from?.id ?? null,
        toTierDefId: target.id,
        reason,
        ruleId: opts.ruleId ?? null,
        evidence: asJson({ ...evidence, ...(opts.manualUntil ? { manualUntil: opts.manualUntil.toISOString() } : {}) }),
        byUserId: opts.byUserId ?? ctx.actorUserId ?? null,
        approvalRequestId: opts.approvalRequestId ?? null,
        notifiedAt: opts.notifiedAt ?? null,
      },
    });

    await tx.customer.update({
      where: { id: customerId },
      data: {
        tierDefId: target.id,
        // §4.5 สะพานให้โค้ดเก่า (POS/จอง/การตลาด v1) — enum เดิมต้องตรงกับ legacyTier ของระดับใหม่เสมอ
        tier: target.legacyTier ?? "MEMBER",
        tierSince: now,
        tierReviewAt: opts.manualUntil ?? nextReviewAt(now),
      },
    });

    await emitOutbox(tx, {
      tenantId: ctx.tenantId,
      type: "member.tier.changed",
      idempotencyKey: `member.tier.changed#${history.id}`,
      systemId: ctx.systemId,
      unitId: customer.homeUnitId,
      payload: { customerId, from: from?.key ?? null, to: target.key, reason },
    });

    return { changed: true, from: tierRef(from), to: tierRef(target), historyId: history.id };
  };

  const result = opts.tx ? await run(opts.tx) : await prisma.$transaction(run);
  if (result.changed && result.to) {
    for (const hook of tierChangedHooks) {
      try {
        await hook({
          tenantId: ctx.tenantId,
          systemId: ctx.systemId,
          customerId,
          fromTierDefId: result.from?.id ?? null,
          toTierDefId: result.to.id,
          reason,
        });
      } catch {
        // hook ของโมดูลอื่นล้ม ต้องไม่ทำให้การเลื่อนระดับที่บันทึกไปแล้วกลายเป็นความผิดพลาด
      }
    }
  }
  return result;
}

/** เลื่อนขึ้นทันทีเมื่อหลักฐานถึงเกณฑ์ (เรียกหลังปิดบิล/สมัคร) — **ไม่ลดระดับ** (§11.3 ลดเฉพาะรอบทบทวน) */
export async function evaluateAndApply(
  ctx: MemberCtx,
  customerId: string,
  opts: { now?: Date } = {},
): Promise<{ changed: boolean; from?: TierRef | null; to?: TierRef | null }> {
  const now = opts.now ?? new Date();
  const ev = await evaluateMember(ctx, customerId, { now });
  if (!ev.wouldUpgradeTo) return { changed: false };
  const world = await loadWorld(ctx, ctx.systemId);
  const target = world.byId.get(ev.wouldUpgradeTo.id);
  const res = await applyTierChange(ctx, customerId, ev.wouldUpgradeTo.id, "RULE_UPGRADE", { ...ev.evidence }, {
    ruleId: target?.upgradeRuleId ?? null,
    now,
  });
  return { changed: res.changed, from: res.from, to: res.to };
}

// ───────────────────────── รอบทบทวนระดับ ─────────────────────────

type PendingManual = { manualUntil: Date | null };

/** ล็อกมือที่ยังไม่หมดอายุของสมาชิกคนนี้ (แถวที่ยัง "รออนุมัติ" ไม่นับ — ยังไม่มีผล) */
async function manualLockOf(ctx: MemberCtx, customerId: string, now: Date): Promise<PendingManual | null> {
  const rows = await prisma.memberTierHistory.findMany({
    where: { tenantId: ctx.tenantId, customerId, reason: "MANUAL" },
    orderBy: { createdAt: "desc" },
    take: 5,
  });
  for (const row of rows) {
    const ev = objectOf(row.evidence);
    if (ev.pending === true) continue;
    const until = typeof ev.manualUntil === "string" ? new Date(ev.manualUntil) : null;
    if (until && !Number.isNaN(until.getTime()) && until > now) return { manualUntil: until };
    return null; // แถว MANUAL ล่าสุดไม่มีวันหมดอายุ/หมดแล้ว = ไม่ล็อก
  }
  return null;
}

/**
 * เคยแจ้งเตือน "เสี่ยงหลุดระดับ" ในรอบปัจจุบันหรือยัง (แจ้ง 1 ครั้งต่อรอบ)
 * นับเฉพาะแถวที่เกิด **หลังการเปลี่ยนระดับครั้งล่าสุด** (`tierSince`) — ขึ้น/ลงระดับใหม่ = เริ่มนับรอบใหม่
 */
async function atRiskMarkOf(ctx: MemberCtx, customer: CustomerRow) {
  return prisma.memberTierHistory.findFirst({
    where: {
      tenantId: ctx.tenantId,
      customerId: customer.id,
      reason: "RULE_KEEP",
      evidence: { path: ["atRisk"], equals: true },
      ...(customer.tierSince ? { createdAt: { gte: customer.tierSince } } : {}),
    },
    orderBy: { createdAt: "desc" },
  });
}

async function writeAtRisk(
  ctx: MemberCtx,
  customer: CustomerRow,
  tier: TierDefRow,
  ev: TierEvidence,
  shortfall: number,
  now: Date,
  reviewAt: Date,
  moveReviewAt: boolean,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const history = await tx.memberTierHistory.create({
      data: {
        tenantId: ctx.tenantId,
        customerId: customer.id,
        fromTierDefId: tier.id,
        toTierDefId: tier.id,
        reason: "RULE_KEEP",
        ruleId: tier.keepRuleId ?? tier.upgradeRuleId ?? null,
        evidence: asJson({ ...ev, atRisk: true, shortfall, reviewAt: reviewAt.toISOString() }),
        notifiedAt: now,
      },
    });
    if (moveReviewAt) await tx.customer.update({ where: { id: customer.id }, data: { tierReviewAt: reviewAt } });
    await emitOutbox(tx, {
      tenantId: ctx.tenantId,
      type: "member.tier.at_risk",
      idempotencyKey: `member.tier.at_risk#${history.id}`,
      systemId: ctx.systemId,
      unitId: customer.homeUnitId,
      payload: { customerId: customer.id, tier: tier.key, shortfall, reviewAt: reviewAt.toISOString() },
    });
  });
}

export async function runTierReview(
  ctx: MemberCtx,
  systemId: string,
  now: Date = new Date(),
  opts: { dryRun?: boolean; customerIds?: string[] } = {},
): Promise<ReviewResult> {
  const dryRun = !!opts.dryRun;
  const scope: MemberCtx = { ...ctx, systemId };
  const world = await loadWorld(scope, systemId);
  const out: ReviewResult = { evaluated: 0, upgraded: [], kept: [], atRisk: [], downgraded: [], notified: [], skipped: [] };
  if (world.defs.length === 0) return out;

  const maxNotify = Math.max(0, ...world.defs.map((d) => d.notifyBeforeDays));
  let due: CustomerRow[] = [];
  let notifyPool: CustomerRow[] = [];

  if (opts.customerIds?.length) {
    // เจาะจงรายคน (ทดลองรัน/หน้าจอ) — ประเมินทุกคนที่ส่งมาไม่ว่าถึงรอบหรือยัง
    due = (await prisma.customer.findMany({
      where: { tenantId: ctx.tenantId, memberSystemId: systemId, id: { in: opts.customerIds }, status: "ACTIVE" },
      select: CUSTOMER_SELECT,
    })) as CustomerRow[];
    out.evaluated = due.length;
  } else {
    due = (await prisma.customer.findMany({
      where: { tenantId: ctx.tenantId, memberSystemId: systemId, status: "ACTIVE", tierReviewAt: { lte: now } },
      select: CUSTOMER_SELECT,
    })) as CustomerRow[];
    out.evaluated = due.length;
    if (maxNotify > 0) {
      notifyPool = (await prisma.customer.findMany({
        where: {
          tenantId: ctx.tenantId,
          memberSystemId: systemId,
          status: "ACTIVE",
          tierReviewAt: { gt: now, lte: new Date(now.getTime() + maxNotify * 86_400_000) },
        },
        select: CUSTOMER_SELECT,
      })) as CustomerRow[];
    }
  }

  const reviewOne = async (customer: CustomerRow): Promise<void> => {
    const tier = (customer.tierDefId ? world.byId.get(customer.tierDefId) : null) ?? world.fallbackTier;
    if (!tier) return;
    const row: ReviewRow = { customerId: customer.id, tier: tier.key };

    // §11.3 — ห้ามลดระดับคนที่ถูกล็อกมือไว้ หรือคนที่จ่ายค่าสมาชิกรายเดือนอยู่
    const lock = await manualLockOf(scope, customer.id, now);
    if (lock) {
      out.skipped.push(row);
      return;
    }
    const paid = await prisma.memberSubscription.count({
      where: { tenantId: ctx.tenantId, customerId: customer.id, status: "ACTIVE", endAt: { gt: now } },
    });
    if (paid > 0) {
      out.skipped.push(row);
      return;
    }

    const isDue = !!customer.tierReviewAt && customer.tierReviewAt <= now;
    const inNotifyWindow =
      !isDue &&
      !!customer.tierReviewAt &&
      tier.notifyBeforeDays > 0 &&
      customer.tierReviewAt.getTime() <= now.getTime() + tier.notifyBeforeDays * 86_400_000;
    if (!isDue && !inNotifyWindow) return;

    const ev = await collectEvidence(customer, now, world.windows);
    const view = evaluateWorld(world, customer, ev);

    if (!isDue) {
      // แจ้งล่วงหน้าก่อนถึงรอบ — ไม่ขยับ tierReviewAt · แจ้งครั้งเดียวต่อรอบ
      const keepRule = effectiveKeepRule(world, tier.id);
      if (!keepRule || rulePasses(keepRule, ev)) return;
      if (await atRiskMarkOf(scope, customer)) return;
      out.notified.push({ ...row, shortfall: shortfallOf(keepRule, ev) });
      if (!dryRun) {
        await writeAtRisk(scope, customer, tier, ev, shortfallOf(keepRule, ev), now, customer.tierReviewAt ?? nextReviewAt(now), false);
      }
      return;
    }

    // ถึงรอบแล้ว — เลื่อนขึ้นก่อน (ถ้าเข้าเกณฑ์ระดับสูงกว่า) แล้วค่อยตัดสินคง/เสี่ยง/ลด
    if (view.wouldUpgradeTo) {
      out.upgraded.push({ ...row, toTier: view.wouldUpgradeTo.key });
      if (!dryRun) {
        await applyTierChange(scope, customer.id, view.wouldUpgradeTo.id, "RULE_UPGRADE", { ...ev }, {
          ruleId: world.byId.get(view.wouldUpgradeTo.id)?.upgradeRuleId ?? null,
          now,
        });
      }
      return;
    }

    const keepRule = effectiveKeepRule(world, tier.id);
    if (!keepRule || rulePasses(keepRule, ev)) {
      out.kept.push(row);
      if (!dryRun) await prisma.customer.update({ where: { id: customer.id }, data: { tierReviewAt: nextReviewAt(now) } });
      return;
    }

    const shortfall = shortfallOf(keepRule, ev);
    const mark = await atRiskMarkOf(scope, customer);
    if (!mark) {
      const graceAt = new Date(now.getTime() + tier.graceDays * 86_400_000);
      out.atRisk.push({ ...row, shortfall });
      if (!dryRun) await writeAtRisk(scope, customer, tier, ev, shortfall, now, graceAt, true);
      return;
    }

    const target = view.wouldDowngradeTo ?? tierRef(world.fallbackTier);
    if (!target || target.id === tier.id) {
      out.kept.push(row);
      if (!dryRun) await prisma.customer.update({ where: { id: customer.id }, data: { tierReviewAt: nextReviewAt(now) } });
      return;
    }
    out.downgraded.push({ ...row, toTier: target.key, shortfall });
    if (!dryRun) {
      await applyTierChange(scope, customer.id, target.id, "RULE_DOWNGRADE", { ...ev, shortfall }, {
        ruleId: tier.keepRuleId ?? tier.upgradeRuleId ?? null,
        now,
      });
    }
  };

  for (const c of due) await reviewOne(c);
  for (const c of notifyPool) await reviewOne(c);
  return out;
}

// ───────────────────────── ตั้งระดับด้วยมือ (+ สายอนุมัติ) ─────────────────────────

export async function setManualTier(
  ctx: MemberCtx,
  actor: MemberActor,
  customerId: string,
  input: { tierDefId: string; reason: string; until?: Date | null },
): Promise<ManualTierResult> {
  requireSetManual(actor);
  const reason = typeof input.reason === "string" ? input.reason.trim() : "";
  if (!reason) throw new MemberInputError("ตั้งระดับด้วยมือต้องระบุเหตุผล — เหตุผลนี้จะถูกเก็บไว้ในประวัติของสมาชิก");
  const customer = await loadMember(ctx, customerId);
  const target = await prisma.memberTierDef.findFirst({
    where: { id: input.tierDefId, tenantId: ctx.tenantId, systemId: ctx.systemId },
  });
  if (!target) throw new MemberNotFoundError(NOT_FOUND_TIER);
  if (target.archivedAt) throw new MemberInputError(`ระดับ "${target.name}" อยู่ในคลังแล้ว — เลือกระดับที่ยังใช้งานอยู่`);
  if (customer.tierDefId === target.id) {
    throw new MemberInputError(`สมาชิกคนนี้อยู่ระดับ "${target.name}" อยู่แล้ว — ไม่ต้องตั้งซ้ำ`);
  }
  const until = input.until ? new Date(input.until) : null;
  if (until && Number.isNaN(until.getTime())) throw new MemberInputError("วันสิ้นสุดของระดับที่ตั้งด้วยมือไม่ถูกต้อง");

  const apply = async (approvalRequestId?: string | null): Promise<ManualTierResult> => {
    const res = await applyTierChange(ctx, customerId, target.id, "MANUAL", { reason }, {
      byUserId: ctx.actorUserId,
      manualUntil: until,
      approvalRequestId: approvalRequestId ?? null,
    });
    return { applied: true, from: res.from, to: res.to };
  };

  // เจ้าของร้านตั้งได้ทันที · ผู้จัดการต้องผ่านสายอนุมัติกลาง (ไม่มีนโยบาย = autoApproved ⇒ ทำทันที)
  if (actor.role === "OWNER") return apply();

  const submitted = await approval.submitForApproval(
    { tenantId: ctx.tenantId },
    {
      entityType: "member.tier.manual",
      entityId: customerId,
      systemId: ctx.systemId,
      unitId: customer.homeUnitId,
      requestedById: ctx.actorUserId ?? actor.userId,
    },
  );
  if ("autoApproved" in submitted) return apply();

  // เก็บ "คำขอที่รออนุมัติ" ไว้ในประวัติระดับ (evidence.pending = true) ให้ approval-effects หยิบไปใช้ตอนอนุมัติ
  await prisma.memberTierHistory.create({
    data: {
      tenantId: ctx.tenantId,
      customerId,
      fromTierDefId: customer.tierDefId,
      toTierDefId: target.id,
      reason: "MANUAL",
      evidence: asJson({ pending: true, reason, ...(until ? { manualUntil: until.toISOString() } : {}) }),
      byUserId: ctx.actorUserId,
      approvalRequestId: submitted.requestId,
    },
  });
  return { applied: false, pending: true, approvalRequestId: submitted.requestId };
}

/**
 * ผลของการอนุมัติ "ตั้งระดับด้วยมือ" — เรียกจาก `src/lib/approval-effects.ts` เท่านั้น
 * idempotent: แถวคำขอถูกปิด (`pending` = false) ในคำสั่งเดียวกับที่ใช้ระดับใหม่ ⇒ drain ซ้ำไม่ทำซ้ำ
 */
export async function applyManualTierApproved(
  ctx: MemberCtx,
  input: { customerId: string; approvalRequestId: string; approved: boolean; approvedById?: string | null },
): Promise<{ applied: boolean }> {
  const row = await prisma.memberTierHistory.findFirst({
    where: { tenantId: ctx.tenantId, customerId: input.customerId, approvalRequestId: input.approvalRequestId, reason: "MANUAL" },
    orderBy: { createdAt: "desc" },
  });
  if (!row) return { applied: false };
  const ev = objectOf(row.evidence);
  if (ev.pending !== true) return { applied: false };

  await prisma.memberTierHistory.update({
    where: { id: row.id },
    data: { evidence: asJson({ ...ev, pending: false, decidedAt: new Date().toISOString(), approved: input.approved }) },
  });
  if (!input.approved || !row.toTierDefId) return { applied: false };

  const until = typeof ev.manualUntil === "string" ? new Date(ev.manualUntil) : null;
  await applyTierChange(ctx, input.customerId, row.toTierDefId, "MANUAL", { reason: ev.reason ?? "", approvedBy: input.approvedById ?? null }, {
    byUserId: input.approvedById ?? row.byUserId,
    manualUntil: until && !Number.isNaN(until.getTime()) ? until : null,
    approvalRequestId: input.approvalRequestId,
  });
  return { applied: true };
}
