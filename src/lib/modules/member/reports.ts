// reports.ts — รายงานสมาชิก 7 ชุด + CSV + ตั้งเวลาส่งอีเมล (M3.8 · §5.10 · §8 · ภาพ 25)
//
// สัญญา = หัวไฟล์ `scripts/qc-member-m3.8.mts`
//   overview · rfm · tiers · points · promotions · sources · cohort · exportCsv · getReportSchedule · setReportSchedule · runScheduledReports
//
// 🔴 ทุกรายงานรับ actor → ต้องมี `member.report.view` (ไม่มี = MemberForbiddenError ภาษาไทย)
// 🔴 ทุกรายงานรับ `{ now? }` — หน้าต่างเวลา = [now − n, now] · บิลที่ createdAt > now ไม่ถูกนับ ⇒ ส่ง now เดิม = ผลเดิมเป๊ะ
// 🔴 ไม่มี N+1: บิลรวมด้วย `posSale.groupBy` (ต่อสมาชิก 1 คำสั่ง) · แต้มรวมด้วย `aggregate/groupBy` ผ่าน relation `customer`
//    · ของที่ต้องจัดกลุ่ม "ตามเดือนไทย" (แต้มรายเดือน · cohort) ใช้ `$queryRaw` คำสั่งเดียว (Prisma groupBy จัดกลุ่มตามเดือนไม่ได้)
// 🔴 เดือน/วัน = ปฏิทินไทยเสมอ (ตัวช่วยใน reports-shared.ts · SQL ใช้ `createdAt + 7 ชม.`)
// 🔴 ต้นทุนแต้ม = แต้ม × `PointSettings.burnRateSatang` (มูลค่าแต้มตอนลูกค้าใช้แลก — พิมพ์เขียว §8 หนี้สินแต้ม)
//    ⇒ ปิดหนี้ M3.3 ข้อ 6: แต้มจาก GIVE_POINTS ของ journey ถูกคิดเป็นต้นทุนที่รายงานนี้ (journeys.ts ไม่ต้องรู้มูลค่าแต้ม)
// 🔴 อีเมลผ่านตัวส่งเดิม `core/email.sendEmail` (import แบบ dynamic — `@/lib/env` ตรวจ env ตอนโหลดไฟล์ · fitness โหมดไม่มี env)
//    ข้อสอบ/ผู้เรียกฉีด `deps.email` แทนได้ · ตัวส่งเดิมยังไม่รองรับไฟล์แนบ ⇒ ฉบับจริงส่ง KPI เป็นข้อความ + ลิงก์หน้ารายงาน

import type { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { hasMemberPerm, type MemberActor } from "./access";
import { MemberForbiddenError, MemberInputError } from "./errors";
import { journeyReportRows } from "./journeys";
import { memberSourceLabel } from "./member-source-labels";
import type { MemberCtx } from "./profile";
import {
  DAY_MS,
  REPORT_SCHEDULE_DEFAULT,
  REPORT_SCHEDULE_MAX_EMAILS,
  REPORT_TABS,
  REPORT_TAB_LABELS,
  RFM_SEGMENTS,
  addMonthKey,
  baht,
  int,
  isReportTab,
  monthKeysBack,
  quintileScores,
  rfmSegmentOf,
  thaiDateKey,
  thaiHour,
  thaiMonthKey,
  thaiMonthStart,
  type ReportCampaignRow,
  type ReportCohort,
  type ReportJourneyRow,
  type ReportOverview,
  type ReportPoints,
  type ReportPromotions,
  type ReportRfm,
  type ReportSchedule,
  type ReportScheduleInput,
  type ReportSourceRow,
  type ReportSources,
  type ReportTab,
  type ReportTierRow,
  type ReportTiers,
  type RfmScore,
} from "./reports-shared";

// ───────────────────────── ตัวช่วยพื้นฐาน ─────────────────────────

type RangeOpts = { now?: Date };

function requireReportView(actor: MemberActor): void {
  if (!hasMemberPerm(actor, "member.report.view")) {
    throw new MemberForbiddenError("บัญชีของคุณยังไม่ได้รับสิทธิ์ดูรายงานระบบสมาชิก — ขอสิทธิ์ \"ดูรายงาน\" จากเจ้าของร้านก่อน");
  }
}

/** ค่าจำนวนเต็มในช่วง · ว่าง/ไม่ส่ง/ไม่ใช่ตัวเลข = ค่าปริยาย (`Number("")` = 0 เคยทำให้ journey คิดสถิติแค่ 1 วัน) */
function intOr(v: unknown, fallback: number, min: number, max: number): number {
  if (v === undefined || v === null || (typeof v === "string" && v.trim() === "")) return fallback;
  const n = typeof v === "number" ? v : Number(String(v).trim());
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
}

function nowOf(opts: RangeOpts | undefined): Date {
  const n = opts?.now;
  return n instanceof Date && Number.isFinite(n.getTime()) ? n : new Date();
}

const round1 = (n: number): number => Math.round(n * 10) / 10;
const pctOf = (a: number, b: number): number => (b > 0 ? (a / b) * 100 : 0);
const roiOf = (sale: number, cost: number): number | null => (cost > 0 ? round1(sale / cost) : null);
const numVal = (v: unknown): number => {
  if (typeof v === "number") return v;
  if (typeof v === "bigint") return Number(v);
  if (v && typeof v === "object" && "toNumber" in v && typeof (v as { toNumber: unknown }).toNumber === "function") {
    return (v as { toNumber: () => number }).toNumber();
  }
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

/** สมาชิกในระบบนี้ (ไม่นับคนที่ถูกรวมเข้าคนอื่นแล้ว) — ตัวกรองเดียวกันทุกรายงาน */
function memberWhere(ctx: MemberCtx): Prisma.CustomerWhereInput {
  return { tenantId: ctx.tenantId, memberSystemId: ctx.systemId, status: { not: "MERGED" } };
}

type MemberRow = { id: string; createdAt: Date; tierDefId: string | null; source: string | null; lastActivityAt: Date | null };

async function loadMembers(ctx: MemberCtx): Promise<MemberRow[]> {
  return prisma.customer.findMany({
    where: memberWhere(ctx),
    select: { id: true, createdAt: true, tierDefId: true, source: true, lastActivityAt: true },
  });
}

type BillAgg = { bills: number; satang: number; last: Date };

/**
 * บิล PAID ต่อสมาชิกในช่วง [from, to] — `groupBy` คำสั่งเดียว (ไม่วนต่อคน)
 * กรองด้วย memberId ไม่ว่าง แล้วคัดเฉพาะสมาชิกของระบบนี้ในหน่วยความจำ (ไม่ส่งรายชื่อ id ยาวเป็นพันเข้า SQL)
 */
async function billsByMember(ctx: MemberCtx, ids: ReadonlySet<string>, from: Date | null, to: Date): Promise<Map<string, BillAgg>> {
  const rows = await prisma.posSale.groupBy({
    by: ["memberId"],
    where: { tenantId: ctx.tenantId, status: "PAID", memberId: { not: null }, createdAt: from ? { gte: from, lte: to } : { lte: to } },
    _count: { _all: true },
    _sum: { grandTotalSatang: true },
    _max: { createdAt: true },
  });
  const out = new Map<string, BillAgg>();
  for (const r of rows) {
    if (!r.memberId || !ids.has(r.memberId)) continue;
    out.set(r.memberId, { bills: r._count._all, satang: numVal(r._sum.grandTotalSatang), last: r._max.createdAt ?? to });
  }
  return out;
}

/** มูลค่าแต้ม (สตางค์ต่อแต้ม) — ร้านที่ยังไม่มีแถวตั้งค่า = ค่าปริยายของ schema (10) · อ่านอย่างเดียว */
async function burnRateOf(tenantId: string): Promise<number> {
  const ps = await prisma.pointSettings.findUnique({ where: { tenantId }, select: { burnRateSatang: true } });
  return ps?.burnRateSatang ?? 10;
}

/** แต้มคงค้างรวมของสมาชิกในระบบ (ทุกระบบแต้มที่สมาชิกถืออยู่) */
async function outstandingOf(ctx: MemberCtx): Promise<number> {
  const agg = await prisma.pointBalance.aggregate({
    where: { tenantId: ctx.tenantId, customer: memberWhere(ctx) },
    _sum: { balance: true },
  });
  return numVal(agg._sum.balance);
}

/** ต้นทุน voucher ที่ถูกใช้ในช่วง (FIXED = มูลค่าใบ · ชนิดอื่น = ส่วนลดจริงที่บันทึกตอนใช้) — สูตรเดียวกับ journeyStats */
function voucherCost(v: { kind: string; value: number; usedRef: Prisma.JsonValue | null }): number {
  if (v.kind === "FIXED") return v.value;
  const ref = (v.usedRef ?? {}) as Record<string, unknown>;
  return Math.max(0, Math.round(numVal(ref.discountSatang)));
}

// ───────────────────────── 1) ภาพรวม ─────────────────────────

export async function overview(ctx: MemberCtx, actor: MemberActor, opts: { months?: number; now?: Date } = {}): Promise<ReportOverview> {
  requireReportView(actor);
  const now = nowOf(opts);
  const months = intOr(opts.months, 12, 1, 36);
  const windowDays = Math.round((months * 365) / 12);
  const from = new Date(now.getTime() - windowDays * DAY_MS);
  const d90 = new Date(now.getTime() - 90 * DAY_MS);
  const monthKeys = monthKeysBack(now, months);
  const curMonth = thaiMonthKey(now);
  const monthStart = thaiMonthStart(curMonth);

  const members = await loadMembers(ctx);
  const ids = new Set(members.map((m) => m.id));

  const [bills, bills90, shopAgg, outstanding, burnRate, vouchersUsed, promoPoints] = await Promise.all([
    billsByMember(ctx, ids, from, now),
    billsByMember(ctx, ids, d90, now),
    prisma.posSale.aggregate({ where: { tenantId: ctx.tenantId, status: "PAID", createdAt: { gte: from, lte: now } }, _sum: { grandTotalSatang: true } }),
    outstandingOf(ctx),
    burnRateOf(ctx.tenantId),
    prisma.voucher.findMany({
      where: { tenantId: ctx.tenantId, systemId: ctx.systemId, status: "USED", usedAt: { gte: monthStart, lte: now } },
      select: { kind: true, value: true, usedRef: true },
    }),
    // แต้มที่ "ร้านแจก" เพื่อโปรโมชัน (journey/แคมเปญ) เดือนนี้ — ไม่นับแต้มจากการซื้อปกติ
    // (PointLedger ไม่มี relation ไป Customer ⇒ รวมต่อคนแล้วคัดสมาชิกของระบบนี้ในหน่วยความจำ)
    prisma.pointLedger.groupBy({
      by: ["customerId"],
      where: { tenantId: ctx.tenantId, refType: { in: ["JOURNEY", "CAMPAIGN"] }, delta: { gt: 0 }, createdAt: { gte: monthStart, lte: now } },
      _sum: { delta: true },
    }),
  ]);

  let satang = 0;
  let billCount = 0;
  let repeat = 0;
  for (const b of bills.values()) {
    satang += b.satang;
    billCount += b.bills;
    if (b.bills >= 2) repeat += 1;
  }
  const buyers = bills.size;
  const shopSatang = numVal(shopAgg._sum.grandTotalSatang);

  const active = new Set<string>(bills90.keys());
  for (const m of members) if (m.lastActivityAt && m.lastActivityAt >= d90 && m.lastActivityAt <= now) active.add(m.id);

  const byMonth = new Map<string, number>();
  for (const m of members) {
    const k = thaiMonthKey(m.createdAt);
    byMonth.set(k, (byMonth.get(k) ?? 0) + 1);
  }

  const promoPointsTotal = promoPoints.reduce((s, p) => s + (ids.has(p.customerId) ? numVal(p._sum.delta) : 0), 0);
  const promoCost = vouchersUsed.reduce((s, v) => s + voucherCost(v), 0) + promoPointsTotal * burnRate;

  return {
    members: { total: members.length, newThisMonth: byMonth.get(curMonth) ?? 0, active90d: active.size },
    sales: {
      satang,
      billCount,
      perMemberSatang: Math.floor(satang / Math.max(1, buyers)),
      months,
      sharePct: shopSatang > 0 ? Math.round((satang / shopSatang) * 100) : null,
    },
    retentionPct: Math.round((repeat / Math.max(1, buyers)) * 100),
    pointsOutstanding: outstanding,
    pointsLiabilitySatang: outstanding * burnRate,
    promoCostMonthSatang: promoCost,
    newPerMonth: monthKeys.map((month) => ({ month, count: byMonth.get(month) ?? 0 })),
  };
}

// ───────────────────────── 2) RFM ─────────────────────────

export async function rfm(ctx: MemberCtx, actor: MemberActor, opts: { days?: number; now?: Date } = {}): Promise<ReportRfm> {
  requireReportView(actor);
  const now = nowOf(opts);
  const days = intOr(opts.days, 365, 1, 3650);
  const from = new Date(now.getTime() - days * DAY_MS);
  const members = await prisma.customer.findMany({ where: memberWhere(ctx), select: { id: true } });
  const bills = await billsByMember(ctx, new Set(members.map((m) => m.id)), from, now);

  const raw = [...bills.entries()].map(([customerId, b]) => ({
    customerId,
    recencyDays: Math.floor((now.getTime() - b.last.getTime()) / DAY_MS),
    frequency: b.bills,
    monetarySatang: b.satang,
  }));
  // R: ยิ่งซื้อล่าสุดยิ่งได้คะแนนสูง ⇒ เรียงด้วย −recencyDays
  const rs = quintileScores(raw.map((x) => -x.recencyDays));
  const fs = quintileScores(raw.map((x) => x.frequency));
  const ms = quintileScores(raw.map((x) => x.monetarySatang));
  const scores: RfmScore[] = raw.map((x, i) => {
    const s = { r: rs[i]!, f: fs[i]!, m: ms[i]! };
    return { ...x, ...s, segment: rfmSegmentOf({ ...s, frequency: x.frequency }) };
  });
  const count = new Map<string, number>();
  for (const s of scores) count.set(s.segment, (count.get(s.segment) ?? 0) + 1);

  return {
    days,
    total: scores.length,
    segments: RFM_SEGMENTS.map((g) => ({ key: g.key, label: g.label, count: count.get(g.key) ?? 0, description: g.description })),
    scores,
  };
}

// ───────────────────────── 3) ระดับ ─────────────────────────

export async function tiers(ctx: MemberCtx, actor: MemberActor, opts: RangeOpts = {}): Promise<ReportTiers> {
  requireReportView(actor);
  const now = nowOf(opts);
  const from = new Date(now.getTime() - 365 * DAY_MS);
  const members = await loadMembers(ctx);
  const ids = new Set(members.map((m) => m.id));
  const [defs, bills, balances] = await Promise.all([
    prisma.memberTierDef.findMany({
      where: { tenantId: ctx.tenantId, systemId: ctx.systemId },
      select: { id: true, name: true, color: true, sortOrder: true, archivedAt: true },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    }),
    billsByMember(ctx, ids, from, now),
    prisma.pointBalance.groupBy({
      by: ["customerId"],
      where: { tenantId: ctx.tenantId, customer: memberWhere(ctx) },
      _sum: { balance: true },
    }),
  ]);
  const balanceOf = new Map(balances.map((b) => [b.customerId, numVal(b._sum.balance)]));

  type Acc = { count: number; spend: number; points: number };
  const acc = new Map<string | null, Acc>();
  for (const m of members) {
    const a = acc.get(m.tierDefId) ?? { count: 0, spend: 0, points: 0 };
    a.count += 1;
    a.spend += bills.get(m.id)?.satang ?? 0;
    a.points += balanceOf.get(m.id) ?? 0;
    acc.set(m.tierDefId, a);
  }

  const row = (tierDefId: string | null, name: string, color: string): ReportTierRow => {
    const a = acc.get(tierDefId) ?? { count: 0, spend: 0, points: 0 };
    return { tierDefId, name, color, count: a.count, avgSpend12mSatang: a.count ? Math.floor(a.spend / a.count) : 0, pointsOutstanding: a.points };
  };
  const known = new Set(defs.map((d) => d.id));
  const rows: ReportTierRow[] = defs
    // ระดับที่เก็บเข้าคลังแล้วโชว์เฉพาะเมื่อยังมีคนค้างอยู่ (ไม่งั้นผลรวมไม่ครบ)
    .filter((d) => !d.archivedAt || (acc.get(d.id)?.count ?? 0) > 0)
    .map((d) => row(d.id, d.name, String(d.color)));
  // สมาชิกที่ tierDefId ว่าง/ชี้ระดับที่ไม่อยู่ในระบบนี้ → รวมเป็นแถวเดียว (ผลรวมต้องเท่าจำนวนสมาชิกเสมอ)
  const orphanIds = [...acc.keys()].filter((k) => k === null || !known.has(k));
  if (orphanIds.length) {
    const merged = orphanIds.reduce<Acc>((s, k) => {
      const a = acc.get(k)!;
      return { count: s.count + a.count, spend: s.spend + a.spend, points: s.points + a.points };
    }, { count: 0, spend: 0, points: 0 });
    acc.set(null, merged);
    rows.push(row(null, "ยังไม่มีระดับ", "SLATE"));
  }
  return { rows, total: members.length };
}

// ───────────────────────── 4) แต้ม ─────────────────────────

export async function points(ctx: MemberCtx, actor: MemberActor, opts: { months?: number; now?: Date } = {}): Promise<ReportPoints> {
  requireReportView(actor);
  const now = nowOf(opts);
  const months = intOr(opts.months, 6, 1, 24);
  const keys = monthKeysBack(now, months);
  const from = thaiMonthStart(keys[0]!);

  // จัดกลุ่มตามเดือนไทยใน SQL คำสั่งเดียว — เวลาใน DB เป็น UTC ไร้โซน ⇒ บวก 7 ชม. ก่อนตัดเดือน
  // พารามิเตอร์เวลาส่งเป็นข้อความ ISO แล้วแปลงเป็นเวลา UTC ไร้โซนเอง (ไม่ขึ้นกับ TimeZone ของ session)
  const [rows, outstanding, burnRateSatang] = await Promise.all([
    prisma.$queryRaw<{ month: string; earned: number; burned: number; expired: number }[]>`
      SELECT to_char(l."createdAt" + interval '7 hours', 'YYYY-MM') AS month,
             COALESCE(SUM(l."delta") FILTER (WHERE l."delta" > 0 AND l."type" <> 'EXPIRE'), 0)::float8 AS earned,
             COALESCE(-SUM(l."delta") FILTER (WHERE l."delta" < 0 AND l."type" <> 'EXPIRE'), 0)::float8 AS burned,
             COALESCE(-SUM(l."delta") FILTER (WHERE l."type" = 'EXPIRE'), 0)::float8 AS expired
      FROM "PointLedger" l
      WHERE l."tenantId" = ${ctx.tenantId}
        AND l."customerId" IN (
          SELECT c."id" FROM "Customer" c
          WHERE c."tenantId" = ${ctx.tenantId} AND c."memberSystemId" = ${ctx.systemId} AND c."status" <> 'MERGED'
        )
        AND l."createdAt" >= (${from.toISOString()}::timestamptz AT TIME ZONE 'UTC')
        AND l."createdAt" <= (${now.toISOString()}::timestamptz AT TIME ZONE 'UTC')
      GROUP BY 1
    `,
    outstandingOf(ctx),
    burnRateOf(ctx.tenantId),
  ]);
  const byMonth = new Map(rows.map((r) => [r.month, r]));
  const monthly = keys.map((month) => {
    const r = byMonth.get(month);
    return { month, earned: Math.round(numVal(r?.earned)), burned: Math.round(numVal(r?.burned)), expired: Math.round(numVal(r?.expired)) };
  });
  const totals = monthly.reduce(
    (s, m) => ({ earned: s.earned + m.earned, burned: s.burned + m.burned, expired: s.expired + m.expired }),
    { earned: 0, burned: 0, expired: 0 },
  );
  return { months, monthly, totals, outstanding, burnRateSatang, liabilitySatang: outstanding * burnRateSatang };
}

// ───────────────────────── 5) โปรโมชัน ─────────────────────────

/**
 * ROI + กลุ่มเทียบ ของ journey (ในหน้าต่าง days) และแคมเปญ (ทุกใบของระบบ · ผลสะสมตลอดอายุแคมเปญ)
 * - journey: ตัวเลขชุดเดียวกับ `journeyStats` (journeys.journeyReportRows) + ต้นทุนแต้มที่ให้ × มูลค่าแต้ม
 * - แคมเปญ: ผลที่ `campaignStats` บันทึกไว้ใน `CampaignVariantStat` (อัปเดตทุกครั้งที่ส่ง/ยกเลิก/มีคนใช้สิทธิ์/เปิดหน้า)
 *   🔴 โมดูลสมาชิก import โมดูลการตลาดไม่ได้ (F2) ⇒ อ่านผลที่บันทึกไว้แทนการเรียกฟังก์ชัน
 * - ROI ของรายงาน = ยอดที่เกิด ÷ ต้นทุน (เท่า · ภาพ 25 "31.6×") · ต้นทุน 0 = null
 */
export async function promotions(ctx: MemberCtx, actor: MemberActor, opts: { days?: number; now?: Date } = {}): Promise<ReportPromotions> {
  requireReportView(actor);
  const now = nowOf(opts);
  const days = intOr(opts.days, 90, 1, 365);
  const since = new Date(now.getTime() - days * DAY_MS);

  const [jRows, burnRate, campaigns] = await Promise.all([
    journeyReportRows(ctx, actor, { days, now }),
    burnRateOf(ctx.tenantId),
    prisma.mktCampaign.findMany({
      where: { tenantId: ctx.tenantId, memberSystemId: ctx.systemId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        status: true,
        sentAt: true,
        variantStats: { select: { variant: true, sent: true, used: true, saleSatang: true, costSatang: true } },
      },
    }),
  ]);

  // แต้มที่ journey ให้ในช่วงนี้ → ต้นทุนต่อ journey (PointLedger.refId = AutomationRun.id)
  const pointsByRun = jRows.length
    ? await prisma.pointLedger.groupBy({
        by: ["refId"],
        where: { tenantId: ctx.tenantId, refType: "JOURNEY", delta: { gt: 0 }, createdAt: { gte: since, lte: now } },
        _sum: { delta: true },
      })
    : [];
  const runIds = pointsByRun.map((p) => p.refId).filter((x): x is string => !!x);
  const runs = runIds.length
    ? await prisma.automationRun.findMany({ where: { tenantId: ctx.tenantId, id: { in: runIds } }, select: { id: true, ruleId: true } })
    : [];
  const ruleOfRun = new Map(runs.map((r) => [r.id, r.ruleId]));
  const pointsByRule = new Map<string, number>();
  for (const p of pointsByRun) {
    const ruleId = p.refId ? ruleOfRun.get(p.refId) : undefined;
    if (!ruleId) continue;
    pointsByRule.set(ruleId, (pointsByRule.get(ruleId) ?? 0) + numVal(p._sum.delta));
  }

  const journeys: ReportJourneyRow[] = jRows.map((j) => {
    const pointsCostSatang = (pointsByRule.get(j.id) ?? 0) * burnRate;
    const costSatang = j.costSatang + pointsCostSatang;
    return {
      id: j.id,
      name: j.name,
      enabled: j.enabled,
      entered: j.entered,
      used: j.used,
      saleSatang: j.saleSatang,
      costSatang,
      pointsCostSatang,
      roi: roiOf(j.saleSatang, costSatang),
      upliftPct: j.holdEntered > 0 ? round1(j.usedPct - j.convertedPct) : null,
    };
  });

  // จำนวนคนในกลุ่มเทียบของแต่ละแคมเปญ (ฐานของ % ใช้สิทธิ์กลุ่มเทียบ — สูตรเดียวกับ campaignStats)
  const holdReach = campaigns.length
    ? await prisma.mktRecipient.groupBy({
        by: ["campaignId"],
        where: { tenantId: ctx.tenantId, campaignId: { in: campaigns.map((c) => c.id) }, variant: "HOLDOUT" },
        _count: { _all: true },
      })
    : [];
  const reachOf = new Map(holdReach.map((h) => [h.campaignId, h._count._all]));

  const campaignRows: ReportCampaignRow[] = campaigns.map((c) => {
    const stats = c.variantStats;
    const reached = stats.filter((s) => s.variant !== "HOLDOUT");
    const hold = stats.find((s) => s.variant === "HOLDOUT") ?? null;
    const sent = reached.reduce((n, s) => n + s.sent, 0);
    const usedReached = reached.reduce((n, s) => n + s.used, 0);
    const saleSatang = stats.reduce((n, s) => n + numVal(s.saleSatang), 0);
    const costSatang = stats.reduce((n, s) => n + s.costSatang, 0);
    const reach = reachOf.get(c.id) ?? 0;
    return {
      id: c.id,
      name: c.name,
      status: String(c.status),
      sentAt: c.sentAt ? c.sentAt.toISOString() : null,
      sent,
      used: stats.reduce((n, s) => n + s.used, 0),
      saleSatang,
      costSatang,
      roi: roiOf(saleSatang, costSatang),
      upliftPct: reach > 0 ? round1(pctOf(usedReached, sent) - pctOf(hold?.used ?? 0, reach)) : null,
    };
  });

  const all = [...journeys, ...campaignRows];
  const costSatang = all.reduce((n, r) => n + r.costSatang, 0);
  const saleSatang = all.reduce((n, r) => n + r.saleSatang, 0);
  return { days, journeys, campaigns: campaignRows, totals: { costSatang, saleSatang, roi: roiOf(saleSatang, costSatang) } };
}

// ───────────────────────── 6) ช่องทางที่มา ─────────────────────────

/** ป้ายไทยของช่องทาง — บางชื่อเป็นอังกฤษล้วน (LINE OA · API) จึงเติมคำไทยนำหน้าให้คนอ่านรู้ว่าเป็น "ช่องทาง" */
function sourceLabel(source: string | null): string {
  if (!source) return "ไม่ระบุช่องทาง";
  const base = memberSourceLabel(source);
  return /[ก-๙]/.test(base) ? base : `ช่องทาง ${base}`;
}

/**
 * ต่อจาก M1.8 `reportBySource` แต่ฐานต่างกัน: ที่นี่นับตาม `Customer.source` (ช่องทางที่บันทึกตอนสมัคร)
 * ของสมาชิกที่สมัครในช่วง [now − days, now] — ตารางเดียวอ่านง่ายสำหรับเจ้าของร้าน (M1.8 = ละเอียดราย touch/ลิงก์)
 */
export async function sources(ctx: MemberCtx, actor: MemberActor, opts: { days?: number; now?: Date } = {}): Promise<ReportSources> {
  requireReportView(actor);
  const now = nowOf(opts);
  const days = intOr(opts.days, 90, 1, 3650);
  const from = new Date(now.getTime() - days * DAY_MS);

  const [grouped, joined, links] = await Promise.all([
    prisma.customer.groupBy({
      by: ["source"],
      where: { ...memberWhere(ctx), createdAt: { gte: from, lte: now } },
      _count: { _all: true },
    }),
    prisma.customer.findMany({ where: { ...memberWhere(ctx), createdAt: { gte: from, lte: now } }, select: { id: true, source: true } }),
    prisma.acquisitionLink.groupBy({
      by: ["source"],
      where: { tenantId: ctx.tenantId, systemId: ctx.systemId, createdAt: { gte: from, lte: now } },
      _sum: { costSatang: true },
    }),
  ]);
  // ซื้อครั้งแรก = สมาชิกใหม่ของช่วงนี้ที่มีบิล PAID แล้วอย่างน้อย 1 ใบ (ถึง now)
  const buyers = await billsByMember(ctx, new Set(joined.map((j) => j.id)), null, now);
  const firstBy = new Map<string | null, number>();
  for (const j of joined) if (buyers.has(j.id)) firstBy.set(j.source, (firstBy.get(j.source) ?? 0) + 1);
  const costBy = new Map(links.map((l) => [String(l.source), numVal(l._sum.costSatang)]));

  const rows: ReportSourceRow[] = grouped
    .map((g) => {
      const count = g._count._all;
      const costSatang = g.source ? costBy.get(String(g.source)) ?? 0 : 0;
      return {
        source: g.source ? String(g.source) : null,
        label: sourceLabel(g.source ? String(g.source) : null),
        count,
        firstPurchases: firstBy.get(g.source) ?? 0,
        costSatang,
        costPerMemberSatang: count > 0 ? Math.floor(costSatang / count) : 0,
      };
    })
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "th"));
  return { days, rows, total: rows.reduce((n, r) => n + r.count, 0) };
}

// ───────────────────────── 7) Cohort ─────────────────────────

/**
 * cohort รายเดือน: สมาชิกที่สมัครในเดือนไทย M · retained[k] = % ของกลุ่มที่มีบิล PAID ในเดือนไทย M + k
 * (เฉพาะเดือนที่ไม่เลยเดือนของ now · ปัด 0 ตำแหน่ง) · เรียงเก่า → ใหม่
 */
export async function cohort(ctx: MemberCtx, actor: MemberActor, opts: { months?: number; now?: Date } = {}): Promise<ReportCohort> {
  requireReportView(actor);
  const now = nowOf(opts);
  const months = intOr(opts.months, 6, 1, 24);
  const keys = monthKeysBack(now, months);
  const nowKey = thaiMonthKey(now);
  const start = thaiMonthStart(keys[0]!);

  const [members, billMonths] = await Promise.all([
    prisma.customer.findMany({ where: { ...memberWhere(ctx), createdAt: { gte: start } }, select: { id: true, createdAt: true } }),
    // (สมาชิก, เดือนไทยที่มีบิล) ไม่ซ้ำ — คำสั่งเดียว · จำกัดเฉพาะสมาชิกที่สมัครตั้งแต่ต้น cohort แรก
    prisma.$queryRaw<{ memberId: string; month: string }[]>`
      SELECT DISTINCT s."memberId" AS "memberId", to_char(s."createdAt" + interval '7 hours', 'YYYY-MM') AS month
      FROM "PosSale" s
      WHERE s."tenantId" = ${ctx.tenantId}
        AND s."status" = 'PAID'
        AND s."memberId" IN (
          SELECT c."id" FROM "Customer" c
          WHERE c."tenantId" = ${ctx.tenantId} AND c."memberSystemId" = ${ctx.systemId} AND c."status" <> 'MERGED'
            AND c."createdAt" >= (${start.toISOString()}::timestamptz AT TIME ZONE 'UTC')
        )
        AND s."createdAt" >= (${start.toISOString()}::timestamptz AT TIME ZONE 'UTC')
        AND s."createdAt" <= (${now.toISOString()}::timestamptz AT TIME ZONE 'UTC')
    `,
  ]);
  const active = new Set(billMonths.map((b) => `${b.memberId}|${b.month}`));
  const rows = keys.map((month) => {
    const group = members.filter((m) => thaiMonthKey(m.createdAt) === month);
    const retained: number[] = [];
    for (let k = 0; k < months; k += 1) {
      const target = addMonthKey(month, k);
      if (target > nowKey) break;
      const n = group.filter((m) => active.has(`${m.id}|${target}`)).length;
      retained.push(group.length ? Math.round((n / group.length) * 100) : 0);
    }
    return { month, size: group.length, retained };
  });
  return { months, rows };
}

// ───────────────────────── CSV ─────────────────────────

const BOM = "﻿";

/** ครอบ " เมื่อค่ามี , " หรือขึ้นบรรทัด (มาตรฐาน RFC 4180 · Excel ภาษาไทยเปิดได้เพราะมี BOM) */
function csvCell(v: string | number | null): string {
  const s = v === null ? "" : typeof v === "number" ? (Number.isFinite(v) ? String(v) : "") : v;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const bahtCell = (satang: number): string => (Math.round(satang) / 100).toFixed(2);

function csvOf(rows: (string | number | null)[][]): string {
  return BOM + rows.map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

async function csvRows(ctx: MemberCtx, actor: MemberActor, tab: ReportTab, now: Date): Promise<(string | number | null)[][]> {
  switch (tab) {
    case "overview": {
      const o = await overview(ctx, actor, { months: 12, now });
      return [
        ["หัวข้อ", "ค่า"],
        ["สมาชิกทั้งหมด (คน)", o.members.total],
        ["สมาชิกใหม่เดือนนี้ (คน)", o.members.newThisMonth],
        ["สมาชิกที่ใช้งานใน 90 วัน (คน)", o.members.active90d],
        [`ยอดขายสมาชิก ${o.sales.months} เดือน (บาท)`, bahtCell(o.sales.satang)],
        [`จำนวนบิลสมาชิก ${o.sales.months} เดือน`, o.sales.billCount],
        ["ยอดเฉลี่ย/คน (บาท)", bahtCell(o.sales.perMemberSatang)],
        ["อัตรารักษาลูกค้า (%)", o.retentionPct],
        ["แต้มคงค้าง (แต้ม)", o.pointsOutstanding],
        ["หนี้สินแต้มคงค้าง (บาท)", bahtCell(o.pointsLiabilitySatang)],
        ["ต้นทุนโปรโมชันเดือนนี้ (บาท)", bahtCell(o.promoCostMonthSatang)],
        ["เดือน", "สมาชิกใหม่ต่อเดือน (คน)"],
        ...o.newPerMonth.map((m) => [m.month, m.count]),
      ];
    }
    case "rfm": {
      const r = await rfm(ctx, actor, { now });
      return [["กลุ่ม", "ชื่อกลุ่ม", "จำนวนสมาชิก", "คำอธิบาย"], ...r.segments.map((s) => [s.key, s.label, s.count, s.description])];
    }
    case "tiers": {
      const t = await tiers(ctx, actor, { now });
      return [["ระดับ", "จำนวนสมาชิก", "ยอดเฉลี่ย 12 เดือน (บาท)", "แต้มคงค้าง"], ...t.rows.map((r) => [r.name, r.count, bahtCell(r.avgSpend12mSatang), r.pointsOutstanding])];
    }
    case "points": {
      const p = await points(ctx, actor, { now });
      return [
        ["เดือน", "แต้มที่ออก", "แต้มที่ใช้", "แต้มหมดอายุ"],
        ...p.monthly.map((m) => [m.month, m.earned, m.burned, m.expired]),
        ["รวม", p.totals.earned, p.totals.burned, p.totals.expired],
        ["แต้มคงค้าง", p.outstanding, "มูลค่าแต้ม (สตางค์/แต้ม)", p.burnRateSatang],
        ["หนี้สินแต้มคงค้าง (บาท)", bahtCell(p.liabilitySatang), "", ""],
      ];
    }
    case "promotions": {
      const p = await promotions(ctx, actor, { now });
      return [
        ["ประเภท", "ชื่อ", "เข้า/ส่งถึง (คน)", "ใช้สิทธิ์ (คน)", "ยอดที่เกิด (บาท)", "ต้นทุน (บาท)", "ROI (เท่า)", "uplift เทียบกลุ่มเทียบ (%)"],
        ...p.journeys.map((j) => ["Journey", j.name, j.entered, j.used, bahtCell(j.saleSatang), bahtCell(j.costSatang), j.roi, j.upliftPct]),
        ...p.campaigns.map((c) => ["แคมเปญ", c.name, c.sent, c.used, bahtCell(c.saleSatang), bahtCell(c.costSatang), c.roi, c.upliftPct]),
        ["รวม", "", "", "", bahtCell(p.totals.saleSatang), bahtCell(p.totals.costSatang), p.totals.roi, ""],
      ];
    }
    case "sources": {
      const s = await sources(ctx, actor, { now });
      return [
        ["ช่องทาง", "สมาชิกใหม่ (คน)", "ซื้อครั้งแรกแล้ว (คน)", "ค่าใช้จ่ายช่องทาง (บาท)", "ต้นทุนต่อสมาชิก (บาท)"],
        ...s.rows.map((r) => [r.label, r.count, r.firstPurchases, bahtCell(r.costSatang), bahtCell(r.costPerMemberSatang)]),
        ["รวม", s.total, "", "", ""],
      ];
    }
    case "cohort": {
      const c = await cohort(ctx, actor, { now });
      const width = c.months;
      return [
        ["เดือนที่สมัคร", "จำนวนสมาชิก", ...Array.from({ length: width }, (_, k) => `เดือนที่ ${k} (%)`)],
        ...c.rows.map((r) => [r.month, r.size, ...Array.from({ length: width }, (_, k) => (k < r.retained.length ? r.retained[k]! : null))]),
      ];
    }
  }
}

export async function exportCsv(ctx: MemberCtx, actor: MemberActor, tab: string, opts: RangeOpts = {}): Promise<{ filename: string; csv: string }> {
  requireReportView(actor);
  if (!isReportTab(tab)) {
    throw new MemberInputError(`ยังไม่มีรายงานชื่อ "${String(tab)}" — เลือกได้: ${REPORT_TABS.map((t) => REPORT_TAB_LABELS[t]).join(" · ")}`);
  }
  const now = nowOf(opts);
  const rows = await csvRows(ctx, actor, tab, now);
  return { filename: `member-report-${tab}-${thaiDateKey(now)}.csv`, csv: csvOf(rows) };
}

// ───────────────────────── ตั้งเวลาส่งอีเมล ─────────────────────────

const EMAIL_RE = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]{2,}$/;

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

/** อ่าน `settings.member.reports.schedule` แบบทนข้อมูลเสีย — ช่องไหนผิดรูปใช้ค่าปริยายของช่องนั้น */
function readSchedule(settings: unknown): ReportSchedule {
  const raw = asRecord(asRecord(asRecord(asRecord(settings)?.member)?.reports)?.schedule) ?? {};
  const emails = Array.isArray(raw.emails) ? raw.emails.filter((e): e is string => typeof e === "string" && EMAIL_RE.test(e)).slice(0, REPORT_SCHEDULE_MAX_EMAILS) : [];
  const tabs = Array.isArray(raw.tabs) ? raw.tabs.filter(isReportTab) : [...REPORT_SCHEDULE_DEFAULT.tabs];
  const hour = typeof raw.hour === "number" && Number.isInteger(raw.hour) && raw.hour >= 0 && raw.hour <= 23 ? raw.hour : REPORT_SCHEDULE_DEFAULT.hour;
  return {
    enabled: raw.enabled === true,
    emails,
    hour,
    tabs: tabs.length ? tabs : [...REPORT_SCHEDULE_DEFAULT.tabs],
    lastSentDate: typeof raw.lastSentDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw.lastSentDate) ? raw.lastSentDate : null,
  };
}

function withSchedule(settings: unknown, schedule: ReportSchedule): Prisma.InputJsonValue {
  const root = asRecord(settings) ?? {};
  const member = asRecord(root.member) ?? {};
  const reports = asRecord(member.reports) ?? {};
  return { ...root, member: { ...member, reports: { ...reports, schedule } } } as Prisma.InputJsonValue;
}

export async function getReportSchedule(ctx: MemberCtx): Promise<ReportSchedule> {
  const sys = await prisma.appSystem.findFirst({ where: { id: ctx.systemId, tenantId: ctx.tenantId }, select: { settings: true } });
  return readSchedule(sys?.settings ?? null);
}

function normalizeEmails(raw: unknown): string[] {
  const list = Array.isArray(raw) ? raw : typeof raw === "string" ? raw.split(/[\s,;]+/) : null;
  if (!list) throw new MemberInputError("รายชื่ออีเมลผู้รับต้องเป็นรายการ เช่น owner@shop.com, acc@shop.com");
  const out: string[] = [];
  for (const item of list) {
    const e = String(item ?? "").trim().toLowerCase();
    if (!e) continue;
    if (!EMAIL_RE.test(e)) throw new MemberInputError(`อีเมล "${String(item)}" ยังไม่อยู่ในรูปแบบที่ส่งได้ — ตัวอย่างที่ถูกต้อง: name@shop.com`);
    if (!out.includes(e)) out.push(e);
  }
  if (out.length > REPORT_SCHEDULE_MAX_EMAILS) {
    throw new MemberInputError(`ส่งรายงานได้สูงสุด ${REPORT_SCHEDULE_MAX_EMAILS} อีเมล — ลดรายชื่อผู้รับให้เหลือไม่เกิน ${REPORT_SCHEDULE_MAX_EMAILS}`);
  }
  return out;
}

export async function setReportSchedule(ctx: MemberCtx, actor: MemberActor, input: ReportScheduleInput): Promise<ReportSchedule> {
  if (!hasMemberPerm(actor, "member.settings.manage")) {
    throw new MemberForbiddenError("บัญชีของคุณยังไม่ได้รับสิทธิ์ตั้งเวลาส่งรายงาน — ขอสิทธิ์ \"ตั้งค่าระบบสมาชิก\" จากเจ้าของร้านก่อน");
  }
  const patch = (input ?? {}) as Record<string, unknown>;
  const sys = await prisma.appSystem.findFirst({ where: { id: ctx.systemId, tenantId: ctx.tenantId, type: "MEMBER" }, select: { settings: true } });
  if (!sys) throw new MemberInputError("ไม่พบระบบสมาชิกนี้ในร้าน — รีเฟรชหน้าแล้วลองใหม่");
  const cur = readSchedule(sys.settings);
  const next: ReportSchedule = { ...cur, emails: [...cur.emails], tabs: [...cur.tabs] };

  if (patch.emails !== undefined) next.emails = normalizeEmails(patch.emails);
  if (patch.hour !== undefined && !(typeof patch.hour === "string" && patch.hour.trim() === "")) {
    const h = typeof patch.hour === "number" ? patch.hour : Number(String(patch.hour).trim());
    if (!Number.isInteger(h) || h < 0 || h > 23) throw new MemberInputError("ชั่วโมงที่ส่งต้องเป็น 0–23 (เวลาไทย) เช่น 6 = 06:00 น.");
    next.hour = h;
  }
  if (patch.tabs !== undefined) {
    if (!Array.isArray(patch.tabs)) throw new MemberInputError("เลือกแท็บรายงานที่จะแนบเป็นรายการ");
    const bad = patch.tabs.find((t) => !isReportTab(t));
    if (bad !== undefined) {
      throw new MemberInputError(`ยังไม่มีรายงาน "${String(bad)}" ให้แนบ — เลือกได้: ${REPORT_TABS.map((t) => REPORT_TAB_LABELS[t]).join(" · ")}`);
    }
    const tabs = REPORT_TABS.filter((t) => (patch.tabs as unknown[]).includes(t));
    if (tabs.length === 0) throw new MemberInputError("เลือกรายงานที่จะแนบอย่างน้อย 1 แท็บ");
    next.tabs = tabs;
  }
  if (patch.enabled !== undefined) next.enabled = patch.enabled === true;
  if (next.enabled && next.emails.length === 0) {
    throw new MemberInputError("เปิดส่งอัตโนมัติต้องมีอีเมลผู้รับอย่างน้อย 1 รายการ");
  }
  await prisma.appSystem.update({ where: { id: ctx.systemId }, data: { settings: withSchedule(sys.settings, next) } });
  return next;
}

export type ReportEmailRequest = {
  to: string[];
  subject: string;
  text: string;
  attachments: { filename: string; content: string; contentType: "text/csv" }[];
};
export type ReportEmailSender = (req: ReportEmailRequest) => Promise<unknown>;

/** ตัวส่งจริงปริยาย — `core/email.sendEmail` (ข้อความล้วน ส่งทีละผู้รับ · ยังแนบไฟล์ไม่ได้ → บอกทางไปหน้ารายงานในเนื้อความ) */
const defaultEmailSender: ReportEmailSender = async (req) => {
  const { sendEmail } = await import("@/lib/core/email");
  const text = req.attachments.length
    ? `${req.text}\n\nไฟล์ CSV (${req.attachments.map((a) => a.filename).join(", ")}) ดาวน์โหลดได้จากปุ่ม "ส่งออก CSV" ในหน้ารายงาน`
    : req.text;
  for (const to of req.to) await sendEmail(to, req.subject, text);
  return { ok: true };
};

/** actor ของ cron — ทำงานแทนเจ้าของร้านที่ตั้งเวลาไว้ (สิทธิ์ถูกตรวจแล้วตอนกดบันทึกการตั้งเวลา) */
const SYSTEM_ACTOR: MemberActor = { userId: "system", role: "OWNER", unitAccess: ["*"], permissions: {} };

async function reportLink(systemId: string): Promise<string> {
  try {
    const { publicOrigin } = await import("@/lib/core/origin");
    return `${await publicOrigin()}/app/sys/${systemId}/member/reports`;
  } catch {
    return "";
  }
}

/**
 * cron รายชั่วโมง (`platform/cron.ts` → `memberReportsEmail`) — ทุกระบบ MEMBER ที่เปิดส่ง:
 * ชั่วโมงไทยของ now ≥ hour และยังไม่ได้ส่งวันไทยนี้ → อีเมล 1 ฉบับ/ระบบ แล้วบันทึก lastSentDate
 * 🔴 จองวันก่อนส่งด้วย compare-and-set (`updatedAt` เดิม) ⇒ cron ซ้อนกันไม่ส่งซ้ำ · ส่งพังคืนค่าเดิมให้รอบถัดไปลองใหม่
 */
export async function runScheduledReports(opts: { now?: Date; deps?: { email?: ReportEmailSender } } = {}): Promise<{ sent: number; skipped: number; failed: number }> {
  const now = nowOf(opts);
  const today = thaiDateKey(now);
  const hourNow = thaiHour(now);
  const send = opts.deps?.email ?? defaultEmailSender;
  const systems = await prisma.appSystem.findMany({
    where: { type: "MEMBER", active: true, settings: { path: ["member", "reports", "schedule", "enabled"], equals: true } },
    select: { id: true, tenantId: true, name: true, settings: true, updatedAt: true },
    take: 1000,
  });
  let sent = 0;
  let skipped = 0;
  let failed = 0;
  for (const sys of systems) {
    const schedule = readSchedule(sys.settings);
    if (!schedule.enabled || schedule.emails.length === 0 || hourNow < schedule.hour || schedule.lastSentDate === today) {
      skipped += 1;
      continue;
    }
    const claimed = await prisma.appSystem.updateMany({
      where: { id: sys.id, updatedAt: sys.updatedAt },
      data: { settings: withSchedule(sys.settings, { ...schedule, lastSentDate: today }) },
    });
    if (claimed.count !== 1) {
      skipped += 1;
      continue;
    }
    const ctx: MemberCtx = { tenantId: sys.tenantId, systemId: sys.id, actorUserId: null };
    try {
      const [tenant, ov, link] = await Promise.all([
        prisma.tenant.findUnique({ where: { id: sys.tenantId }, select: { name: true } }),
        overview(ctx, SYSTEM_ACTOR, { months: 12, now }),
        reportLink(sys.id),
      ]);
      const attachments: ReportEmailRequest["attachments"] = [];
      for (const tab of schedule.tabs) {
        const f = await exportCsv(ctx, SYSTEM_ACTOR, tab, { now });
        attachments.push({ filename: f.filename, content: f.csv, contentType: "text/csv" });
      }
      const shop = tenant?.name ?? sys.name;
      const dateTh = now.toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Bangkok" });
      const text = [
        `รายงานสมาชิก ${shop} ประจำวันที่ ${dateTh}`,
        "",
        `สมาชิกทั้งหมด ${int(ov.members.total)} คน (ใหม่เดือนนี้ ${int(ov.members.newThisMonth)} คน · ใช้งานใน 90 วัน ${int(ov.members.active90d)} คน)`,
        `ยอดขายสมาชิก ${ov.sales.months} เดือน ${baht(ov.sales.satang)} · เฉลี่ย/คน ${baht(ov.sales.perMemberSatang)}`,
        `อัตรารักษาลูกค้า ${ov.retentionPct}%`,
        `แต้มคงค้าง ${int(ov.pointsOutstanding)} แต้ม (หนี้สินประมาณ ${baht(ov.pointsLiabilitySatang)})`,
        `ต้นทุนโปรโมชันเดือนนี้ ${baht(ov.promoCostMonthSatang)}`,
        ...(link ? ["", `ดูรายงานเต็ม: ${link}`] : []),
      ].join("\n");
      await send({ to: schedule.emails, subject: `รายงานสมาชิก ${shop} · ${dateTh}`, text, attachments });
      sent += 1;
    } catch (e) {
      failed += 1;
      // คืนวันส่งล่าสุดเดิม ⇒ cron รอบถัดไปของวันเดียวกันลองใหม่ได้
      const fresh = await prisma.appSystem.findUnique({ where: { id: sys.id }, select: { settings: true } });
      await prisma.appSystem
        .update({ where: { id: sys.id }, data: { settings: withSchedule(fresh?.settings ?? sys.settings, { ...readSchedule(fresh?.settings ?? sys.settings), lastSentDate: schedule.lastSentDate }) } })
        .catch(() => undefined);
      console.warn(`[member-reports] ส่งอีเมลรายงานของระบบ ${sys.id} ไม่สำเร็จ:`, e instanceof Error ? e.message : e);
    }
  }
  return { sent, skipped, failed };
}
