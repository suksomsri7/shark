// rules.ts — กฎได้แต้มของร้าน (6 ชนิด) + ตัวคิดแต้มจากบิล/เหตุการณ์
//
// WO M2.1 · พิมพ์เขียว docs/modules/06-member-v2.md §4.3 §5.5 §11.4 §11.9
//
// กติกาประจำไฟล์
//   • ctx = { tenantId, systemId (= ระบบแต้ม), memberSystemId?, actorUserId? } · actor = สิทธิ์คนที่กด
//   • prisma ดิบผ่าน `./internal` (ซึ่งผ่าน `./db`) เท่านั้น (fitness F5.1)
//   • ข้ามโมดูลผ่าน facade/ไฟล์สาธารณะของสมาชิกเท่านั้น (`member/access` สิทธิ์ · `member/limits` เพดาน)
//   • `computeEarn` **ไม่เขียนฐานข้อมูล** — คิดอย่างเดียว ผู้เรียก (POS/consumer) เอาผลไปเข้า `earnWithLot`
//
// ลำดับการคิด (ตายตัวตาม §5.5 — เปลี่ยนลำดับ = ตัวเลขบนใบเสร็จเปลี่ยน)
//   ฐาน (BASE) → ตัวคูณระดับ (TIER_MULTIPLIER) → โบนัสสินค้า (ITEM_BONUS) → โบนัสหมวด (CATEGORY_BONUS)
//   → ตัวคูณช่วงเวลา (TIME_MULTIPLIER) → เพดานต่อวัน → บวกโบนัสเหตุการณ์ (EVENT_BONUS)
//
// 🔴 EVENT_BONUS อยู่ **นอกเพดานต่อวัน** โดยตั้งใจ (§11.4 "เพดานวัน: นับ EARN จากขาย ไม่รวม EVENT_BONUS")
//    ไม่งั้นแต้มต้อนรับ/วันเกิดจะหายไปเงียบ ๆ เมื่อลูกค้าซื้อของเยอะในวันเดียวกัน

import type { PointEventBonus, PointRuleKind, Prisma } from "@prisma/client";
import { z } from "zod";
import { canManageSettings, type MemberActor } from "@/lib/modules/member/access";
import { MEMBER_LIMITS, memberLimitError } from "@/lib/modules/member/limits";
import {
  bkkDayOfWeek,
  bkkDayStart,
  bkkMinuteOfDay,
  getSettings,
  parseHhMm,
  pointError,
  prisma,
  type PointCtx,
} from "./internal";
import type { EarnBreakdownRow } from "./lots";

export type { PointCtx };

export const POINT_RULE_KINDS: PointRuleKind[] = [
  "BASE",
  "TIER_MULTIPLIER",
  "ITEM_BONUS",
  "CATEGORY_BONUS",
  "TIME_MULTIPLIER",
  "EVENT_BONUS",
];

export const POINT_EVENT_BONUSES: PointEventBonus[] = [
  "SIGNUP",
  "BIRTHDAY",
  "REVIEW",
  "REFERRAL",
  "PROFILE_COMPLETE",
  "CHECKIN",
];

export type PointRuleDto = {
  id: string;
  kind: PointRuleKind;
  config: Record<string, unknown>;
  priority: number;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export type UpsertRuleInput = {
  id?: string;
  kind: PointRuleKind;
  config: unknown;
  priority?: number;
  active?: boolean;
};

// ───────────────────────── validate config ต่อชนิด ─────────────────────────

const hhmm = z.string().refine((v) => parseHhMm(v) !== null, "เวลาต้องอยู่ในรูป ชม:นาที เช่น 10:00");

const CONFIG_SCHEMA = {
  BASE: z.object({
    satangPerPoint: z.number().int().min(1),
    base: z.enum(["NET", "GROSS"]).default("NET"),
  }),
  TIER_MULTIPLIER: z.object({
    tierDefId: z.string().min(1),
    x: z.number().positive(),
  }),
  ITEM_BONUS: z.object({
    itemIds: z.array(z.string().min(1)).min(1),
    points: z.number().int().min(1),
  }),
  CATEGORY_BONUS: z
    .object({
      categoryIds: z.array(z.string().min(1)).min(1),
      x: z.number().positive().optional(),
      points: z.number().int().min(1).optional(),
    })
    .refine((c) => c.x !== undefined || c.points !== undefined, "ต้องระบุตัวคูณ (x) หรือแต้มคงที่ (points) อย่างน้อยหนึ่งอย่าง"),
  TIME_MULTIPLIER: z.object({
    dow: z.array(z.number().int().min(0).max(6)).min(1),
    from: hhmm,
    to: hhmm,
    x: z.number().positive(),
  }),
  EVENT_BONUS: z.object({
    event: z.enum(["SIGNUP", "BIRTHDAY", "REVIEW", "REFERRAL", "PROFILE_COMPLETE", "CHECKIN"]),
    points: z.number().int().min(1),
  }),
} as const;

const KIND_LABEL: Record<PointRuleKind, string> = {
  BASE: "อัตราแต้มพื้นฐาน",
  TIER_MULTIPLIER: "ตัวคูณตามระดับสมาชิก",
  ITEM_BONUS: "โบนัสตามสินค้า",
  CATEGORY_BONUS: "โบนัสตามหมวด",
  TIME_MULTIPLIER: "ตัวคูณตามช่วงเวลา",
  EVENT_BONUS: "โบนัสตามเหตุการณ์",
};

function parseConfig(kind: PointRuleKind, config: unknown): Prisma.InputJsonObject {
  const parsed = CONFIG_SCHEMA[kind].safeParse(config);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    const where = first?.path?.length ? ` (ช่อง "${first.path.join(".")}")` : "";
    throw pointError(`ตั้งค่ากฎ "${KIND_LABEL[kind]}" ยังไม่ครบหรือค่าไม่ถูกต้อง${where} — ตรวจค่าที่กรอกอีกครั้ง`);
  }
  return parsed.data as Prisma.InputJsonObject;
}

function objectOf(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function numberOf(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function stringsOf(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

function toDto(row: {
  id: string;
  kind: PointRuleKind;
  config: unknown;
  priority: number;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}): PointRuleDto {
  return {
    id: row.id,
    kind: row.kind,
    config: objectOf(row.config),
    priority: row.priority,
    active: row.active,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function assertCanManage(actor: MemberActor): void {
  if (!canManageSettings(actor)) {
    throw pointError("ยังไม่ได้รับสิทธิ์ตั้งค่าระบบสมาชิก — ขอสิทธิ์ “ตั้งค่าระบบสมาชิก” จากเจ้าของร้านก่อน");
  }
}

// ───────────────────────── CRUD ─────────────────────────

/** กฎทั้งหมดของระบบแต้มนี้ เรียงตามลำดับที่ใช้คิด (priority น้อยมาก่อน) */
export async function listRules(ctx: PointCtx): Promise<PointRuleDto[]> {
  const rows = await prisma.pointRule.findMany({
    where: { tenantId: ctx.tenantId, systemId: ctx.systemId },
    orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
  });
  return rows.map(toDto);
}

export async function upsertRule(ctx: PointCtx, actor: MemberActor, input: UpsertRuleInput): Promise<PointRuleDto> {
  assertCanManage(actor);
  if (!POINT_RULE_KINDS.includes(input.kind)) {
    throw pointError("ยังไม่รองรับกฎแต้มชนิดนี้ — เลือกจากรายการที่มีให้");
  }
  const config = parseConfig(input.kind, input.config);
  const priority = Number.isInteger(input.priority) ? (input.priority as number) : 0;
  const active = input.active ?? true;

  if (input.id) {
    const found = await prisma.pointRule.findFirst({ where: { id: input.id, tenantId: ctx.tenantId, systemId: ctx.systemId } });
    if (!found) throw pointError("ไม่พบกฎแต้มที่จะแก้ไข — อาจถูกลบไปแล้ว ลองรีเฟรชหน้าอีกครั้ง");
    const updated = await prisma.pointRule.update({
      where: { id: found.id },
      data: { kind: input.kind, config, priority, active },
    });
    return toDto(updated);
  }

  const used = await prisma.pointRule.count({ where: { tenantId: ctx.tenantId, systemId: ctx.systemId } });
  if (used >= MEMBER_LIMITS.pointRules) {
    throw memberLimitError(
      `ตั้งกฎแต้มได้สูงสุด ${MEMBER_LIMITS.pointRules} ข้อต่อระบบแต้ม (ตอนนี้มี ${used} ข้อ) — ปิดหรือลบกฎที่ไม่ใช้แล้วก่อน`,
    );
  }
  const created = await prisma.pointRule.create({
    data: { tenantId: ctx.tenantId, systemId: ctx.systemId, kind: input.kind, config, priority, active },
  });
  return toDto(created);
}

/** เปิด/ปิดกฎ (ไม่ลบ — ร้านมักปิดชั่วคราวช่วงโปรโมชัน) */
export async function toggleRule(ctx: PointCtx, actor: MemberActor, id: string, active: boolean): Promise<PointRuleDto> {
  assertCanManage(actor);
  const found = await prisma.pointRule.findFirst({ where: { id, tenantId: ctx.tenantId, systemId: ctx.systemId } });
  if (!found) throw pointError("ไม่พบกฎแต้มข้อนี้ — อาจถูกลบไปแล้ว ลองรีเฟรชหน้าอีกครั้ง");
  const updated = await prisma.pointRule.update({ where: { id: found.id }, data: { active } });
  return toDto(updated);
}

export async function deleteRule(ctx: PointCtx, actor: MemberActor, id: string): Promise<{ deleted: boolean }> {
  assertCanManage(actor);
  const found = await prisma.pointRule.findFirst({ where: { id, tenantId: ctx.tenantId, systemId: ctx.systemId } });
  if (!found) return { deleted: false };
  await prisma.pointRule.delete({ where: { id: found.id } });
  return { deleted: true };
}

// ───────────────────────── คิดแต้ม ─────────────────────────

export type SaleLineInput = { itemId?: string | null; categoryId?: string | null; qty: number; netSatang: number };

export type SaleForEarn = {
  lines: SaleLineInput[];
  netSatang: number;
  grossSatang?: number;
  paidBy?: { giftCardSatang?: number; voucherSatang?: number; pointsSatang?: number };
};

export type ComputeEarnInput = {
  customerId: string;
  sale?: SaleForEarn;
  event?: PointEventBonus;
  now?: Date;
};

export type ComputeEarnResult = {
  points: number;
  breakdown: EarnBreakdownRow[];
  base: { satang: number; points: number };
  cappedBy?: "dailyCap";
};

const EMPTY_RESULT: ComputeEarnResult = { points: 0, breakdown: [], base: { satang: 0, points: 0 } };

/**
 * คิดแต้มที่สมาชิกจะได้จากบิล/เหตุการณ์ — **อ่านอย่างเดียว ไม่เขียนอะไรลงฐานข้อมูล**
 * (POS เรียกตอนแสดงตัวอย่างบนหน้าขาย แล้วเรียกอีกครั้งตอนปิดบิลจริง ⇒ ต้องไม่มีผลข้างเคียง)
 */
export async function computeEarn(ctx: PointCtx, input: ComputeEarnInput): Promise<ComputeEarnResult> {
  const now = input.now ?? new Date();
  const settings = await getSettings(prisma, ctx.tenantId);
  if (!settings.active) return { ...EMPTY_RESULT, breakdown: [] };

  const customer = await prisma.customer.findFirst({
    where: { id: input.customerId, tenantId: ctx.tenantId },
    select: { id: true, tierDefId: true },
  });
  if (!customer) throw pointError("ไม่พบสมาชิกคนนี้ในร้านนี้ — ตรวจว่าเลือกสมาชิกถูกคนแล้วหรือยัง");

  const rules = await prisma.pointRule.findMany({
    where: { tenantId: ctx.tenantId, systemId: ctx.systemId, active: true },
    orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
  });
  const of = (kind: PointRuleKind) => rules.filter((r) => r.kind === kind);

  const breakdown: EarnBreakdownRow[] = [];
  const sale = input.sale;

  // ── 1. ฐาน ──
  const baseRule = of("BASE")[0];
  const baseCfg = objectOf(baseRule?.config);
  const satangPerPoint = Math.max(1, Math.round(numberOf(baseCfg.satangPerPoint, settings.satangPerPoint)));
  const baseMode = typeof baseCfg.base === "string" ? baseCfg.base : settings.earnBase;

  let baseSatang = 0;
  let salePoints = 0;
  if (sale) {
    const gross = typeof sale.grossSatang === "number" ? sale.grossSatang : sale.netSatang;
    const paid = sale.paidBy ?? {};
    baseSatang = baseMode === "GROSS" ? gross : sale.netSatang;
    if (settings.excludeGiftCard) baseSatang -= numberOf(paid.giftCardSatang, 0);
    if (settings.excludeVoucher) baseSatang -= numberOf(paid.voucherSatang, 0);
    // ส่วนที่จ่ายด้วยแต้ม ตัดออกเสมอ — ไม่งั้นลูกค้าปั่นแต้มจากแต้มตัวเองได้
    baseSatang -= numberOf(paid.pointsSatang, 0);
    baseSatang = Math.max(0, Math.round(baseSatang));
    salePoints = Math.floor(baseSatang / satangPerPoint);
    breakdown.push({
      kind: "BASE",
      ruleId: baseRule?.id ?? null,
      points: salePoints,
      note: `${baseSatang} สตางค์ ÷ ${satangPerPoint} สตางค์/แต้ม`,
    });
  }
  const basePoints = salePoints;

  // ── 2. ตัวคูณตามระดับ ──
  if (sale && customer.tierDefId) {
    const tierRule = of("TIER_MULTIPLIER").find((r) => objectOf(r.config).tierDefId === customer.tierDefId);
    if (tierRule) {
      const x = numberOf(objectOf(tierRule.config).x, 1);
      const after = Math.floor(salePoints * x);
      const gain = after - salePoints;
      if (gain !== 0) {
        breakdown.push({ kind: "TIER_MULTIPLIER", ruleId: tierRule.id, points: gain, note: `ตัวคูณระดับ ×${x}` });
      }
      salePoints = after;
    }
  }

  // ── 3. โบนัสสินค้า (แต้มต่อชิ้น × จำนวน) ──
  if (sale) {
    for (const rule of of("ITEM_BONUS")) {
      const cfg = objectOf(rule.config);
      const ids = new Set(stringsOf(cfg.itemIds));
      const per = numberOf(cfg.points, 0);
      let gain = 0;
      for (const line of sale.lines) {
        if (line.itemId && ids.has(line.itemId)) gain += per * Math.max(0, Math.floor(line.qty));
      }
      if (gain > 0) {
        breakdown.push({ kind: "ITEM_BONUS", ruleId: rule.id, points: gain, note: `โบนัสสินค้า ${per} แต้ม/ชิ้น` });
        salePoints += gain;
      }
    }

    // ── 4. โบนัสหมวด (x = คูณแต้มฐานของบรรทัดนั้น · points = แต้มคงที่ต่อกฎ) ──
    for (const rule of of("CATEGORY_BONUS")) {
      const cfg = objectOf(rule.config);
      const ids = new Set(stringsOf(cfg.categoryIds));
      const matched = sale.lines.filter((line) => line.categoryId && ids.has(line.categoryId));
      if (matched.length === 0) continue;
      let gain = 0;
      let note = "";
      if (typeof cfg.x === "number") {
        const x = numberOf(cfg.x, 1);
        for (const line of matched) {
          const linePoints = Math.floor(Math.max(0, line.netSatang) / satangPerPoint);
          gain += Math.floor(linePoints * x) - linePoints;
        }
        note = `โบนัสหมวด ×${x}`;
      } else {
        gain = numberOf(cfg.points, 0);
        note = `โบนัสหมวด ${gain} แต้ม`;
      }
      if (gain > 0) {
        breakdown.push({ kind: "CATEGORY_BONUS", ruleId: rule.id, points: gain, note });
        salePoints += gain;
      }
    }

    // ── 5. ตัวคูณตามช่วงเวลา (เวลาไทย) ──
    for (const rule of of("TIME_MULTIPLIER")) {
      const cfg = objectOf(rule.config);
      const dows = Array.isArray(cfg.dow) ? cfg.dow.filter((d): d is number => typeof d === "number") : [];
      const from = typeof cfg.from === "string" ? parseHhMm(cfg.from) : null;
      const to = typeof cfg.to === "string" ? parseHhMm(cfg.to) : null;
      if (from === null || to === null) continue;
      if (!dows.includes(bkkDayOfWeek(now))) continue;
      const minute = bkkMinuteOfDay(now);
      const inWindow = from <= to ? minute >= from && minute <= to : minute >= from || minute <= to;
      if (!inWindow) continue;
      const x = numberOf(cfg.x, 1);
      const after = Math.floor(salePoints * x);
      const gain = after - salePoints;
      if (gain !== 0) {
        breakdown.push({ kind: "TIME_MULTIPLIER", ruleId: rule.id, points: gain, note: `ช่วงเวลาพิเศษ ×${x}` });
      }
      salePoints = after;
    }
  }

  // ── 6. เพดานต่อวัน (นับเฉพาะแต้มจากการขาย) ──
  let cappedBy: "dailyCap" | undefined;
  if (settings.dailyCap !== null && salePoints > 0) {
    const earnedToday = await prisma.pointLedger.aggregate({
      where: {
        tenantId: ctx.tenantId,
        systemId: ctx.systemId,
        customerId: input.customerId,
        type: "EARN",
        createdAt: { gte: bkkDayStart(now) },
      },
      _sum: { delta: true },
    });
    const already = earnedToday._sum.delta ?? 0;
    const room = Math.max(0, settings.dailyCap - already);
    if (salePoints > room) {
      breakdown.push({
        kind: "DAILY_CAP",
        ruleId: null,
        points: room - salePoints,
        note: `เพดานวันละ ${settings.dailyCap} แต้ม (วันนี้ได้ไปแล้ว ${already} แต้ม)`,
      });
      salePoints = room;
      cappedBy = "dailyCap";
    }
  }

  // ── 7. โบนัสเหตุการณ์ (นอกเพดาน) ──
  let total = salePoints;
  if (input.event) {
    for (const rule of of("EVENT_BONUS")) {
      const cfg = objectOf(rule.config);
      if (cfg.event !== input.event) continue;
      const gain = numberOf(cfg.points, 0);
      if (gain <= 0) continue;
      breakdown.push({ kind: "EVENT_BONUS", ruleId: rule.id, points: gain, note: `โบนัสเหตุการณ์ ${gain} แต้ม` });
      total += gain;
    }
  }

  return {
    points: total,
    breakdown,
    base: { satang: baseSatang, points: basePoints },
    ...(cappedBy ? { cappedBy } : {}),
  };
}
