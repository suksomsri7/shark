// home-data.ts — ข้อมูลของหน้าแรก CRM v2 (ใบ C3.2 · ภาพ 01 · พิมพ์เขียว §3.1 · RESOLUTIONS R-A · addendum ข้อ 7–11)
// 🔴 ชื่อไฟล์ต้องเป็น `home-data.ts` ไม่ใช่ `home.ts`: `home.tsx` มีอยู่แล้วและ `ui.tsx` import `./home` — ไฟล์ .ts ข้าง ๆ จะแย่งการ resolve
//
// ผิวของไฟล์: kpis · leaderboard · leadSources · unowned · homeData (ทุกตัวรับ HomeFilters { pipelineId?, ownerUserId?, periodKey?, now? })
// ด่าน (ลำดับ): ระบบ CRM ของร้าน (ไม่พบ = NOT_FOUND) → uiVersion 2 (ไม่ใช่ = CrmV2DisabledError) → คีย์ `crm.report.view`
//   (หน้าแรกคือ "รายงานของฉัน" · ไม่มีคีย์ = FORBIDDEN ข้อความไทย ไม่มีตัวเลขหลุดใน error) · "ไม่มีเจ้าของ" = คีย์ `crm.deal.reassign`
// 🔴 AUDIT-CLASS X1: ทุกตัวเลข = แถวที่ผ่าน **ระดับรายงาน** ของผู้ดู (`quotas.reportScopeOf` — STAFF ปริยาย OWN · หัวหน้าทีม ≥ TEAM ·
//    MANAGER/OWNER ALL) **∩** `visibleWhere` ของเอนทิตีนั้น (ขอบเขตสาขา · policy ต่อ pipeline · คีย์อ่าน · ตัวกรองของคีย์ API)
//    ⇒ thana เห็นแค่ของตัวเอง · nok (หัวหน้าทีม K) เห็นทีม K · เจ้าของร้านเห็นทั้งหมด · ตัวกรองผู้ดูแลแคบลงได้อย่างเดียว
// 🔴 R-E.8: ผลรวมทุกตัวคิดในฐานข้อมูล (aggregate/groupBy = SUM ของ Postgres เป็น bigint) — ไม่ดึงแถวมาบวกใน JS
//    ยอด "ถ่วงน้ำหนัก" = groupBy (ขั้น · ความน่าจะเป็นที่ตั้งเอง) ในฐานข้อมูล แล้วคูณ % ต่อกลุ่มด้วย BigInt (จำนวนกลุ่ม ≤ ขั้น × 101)
// 🔴 ช่วงเวลา = งวดเวลาไทยแบบครึ่งเปิด (`quotas-shared.periodRange`) · "ชนะ/แพ้ในงวด" = แถวประวัติขั้น **ล่าสุด** ที่เข้าขั้นชนิดนั้น
//    อยู่ในงวด (มีแถวในงวด และไม่มีแถวหลังจบงวด) — ไม่ใช้ closedAt
// 🔴 X8: DTO ไม่มีเบอร์/อีเมลของใคร (ชื่อดีล · ชื่อผู้ติดต่อในรายการ "ไม่มีเจ้าของ" · ชื่อพนักงาน)
import type { Prisma } from "@prisma/client";
import type { MemberActor } from "@/lib/modules/member";
import { prisma } from "./db";
import { crmCan, crmForbiddenMessage, isApiActor } from "./access";
import { crmScoringSettingsOf, parseCrmSettings } from "./settings";
import { CrmV2DisabledError } from "./ui-version";
import { visibleWhere } from "./visibility";
import { paidByOwner, reportScopeOf, type ReportScope } from "./quotas";
import {
  QuotaError,
  isPeriodKey,
  periodKeyHint,
  periodKeyOf,
  periodRange,
  prevPeriodKey,
  quotaBasisOf,
  quotaPct,
  winRatePct,
  type QuotaBasis,
  type HomeData,
  type HomeFilters,
  type HomeKpis,
  type HomeLeaderboard,
  type HomeLeaderRow,
  type HomeLeadSources,
  type HomeUnowned,
} from "./quotas-shared";
import { crmSystemRow } from "./visibility"; // CRM C5.1-fix ▸ ระบบ CRM ผ่านด่านรวมคำสั่งเดียว (memo ต่อคำขอ) ◂

export type { HomeData, HomeFilters, HomeKpis, HomeLeaderboard, HomeLeaderRow, HomeLeadSources, HomeUnowned };

export type HomeCtx = { tenantId: string; systemId: string; actorUserId?: string | null };
type Actor = MemberActor;
type Range = { from: Date; to: Date };

const MSG_NO_SYSTEM = "ไม่พบระบบ CRM นี้ในร้านที่เปิดอยู่ — รีเฟรชหน้าแล้วลองใหม่";
const NOTHING = { id: { in: [] as string[] } };
/** เพดานรายการ "ไม่มีเจ้าของ" ที่แสดง (เกิน = ธง more · ไปจัดการต่อที่รายการดีล) */
export const HOME_UNOWNED_MAX = 50;
const MEMBERS_MAX = 5_000;
/** เพดานจำนวน "ผู้ดูแลที่ออกจากร้านแล้ว" ที่หาในรอบเดียว (รายการ "ไม่มีเจ้าของ") */
const DEPARTED_MAX = 500;
const STAGES_MAX = 1_000;

type Loaded = {
  ctx: HomeCtx;
  actor: Actor;
  settings: unknown;
  scope: ReportScope;
  periodKey: string;
  range: Range;
  prevRange: Range | null;
  pipelineId: string | null;
  ownerUserId: string | null;
  /** ดีลที่นับได้: visibleWhere(DEAL) ∩ ระดับรายงาน ∩ ตัวกรอง ∩ ไม่เก็บถาวร */
  dealW: Prisma.CrmDealWhereInput;
  /** รีวิว S6 (มติผู้คุมงาน): ตัวตั้งของ "ชนะ/อัตราชนะ" = ดีลที่ผู้ดูแลอยู่ในขอบเขต **ไม่นับดีลที่เป็นแค่ผู้ร่วม** ⇒ % หน้าแรก = progress() = leaderboard */
  dealOwnW: Prisma.CrmDealWhereInput;
  /** ฐานของ % โควตา (`settings.crm.commission.basis` — ค่าเริ่มต้น PAID) · ฐานเดียวกับ progress()/checkReached (รีวิวรอบ 2 SF-4) */
  basis: QuotaBasis;
  /** ผู้ติดต่อที่นับได้: visibleWhere(CONTACT) ∩ ระดับรายงาน ∩ ตัวกรองผู้ดูแล ∩ ยังใช้อยู่ (ไม่เก็บถาวร · ไม่ถูกรวม) */
  contactW: Prisma.CrmContactWhereInput;
};

// ───────────────────────── ด่าน + ขอบเขต ─────────────────────────

async function enter(ctx: HomeCtx, actor: Actor | null | undefined): Promise<{ settings: unknown }> {
  if (!actor || actor.role === "CUSTOMER") throw new QuotaError("NOT_FOUND", MSG_NO_SYSTEM);
  const ok = !!ctx && typeof ctx.tenantId === "string" && typeof ctx.systemId === "string" && !!ctx.tenantId && !!ctx.systemId;
  // AUDIT-CLASS X1: ระบบต้องเป็น CRM ของร้านใน ctx (ร้านอื่น/ระบบอื่นชนิด = ไม่พบ ไม่บอกว่ามีอยู่ที่อื่น)
  const sys = ok ? await crmSystemRow(ctx, prisma) : null;
  if (!sys) throw new QuotaError("NOT_FOUND", MSG_NO_SYSTEM);
  // R-E.14: ระบบที่ยังไม่เปิด CRM v2 — ไม่อ่านอะไรต่อ
  if (parseCrmSettings(sys.settings).uiVersion !== 2) throw new CrmV2DisabledError();
  return { settings: sys.settings };
}

/** AUDIT-CLASS X1: เงื่อนไขของ "ระดับรายงาน" บนตารางที่มี ownerUserId + teamId (ความหมายเดียวกับ visibility.ts) */
function reportOwned(scope: ReportScope, withCollaborators: boolean): Prisma.CrmDealWhereInput {
  if (scope.level === "ALL") return {};
  const own: Prisma.CrmDealWhereInput[] = scope.me ? [{ ownerUserId: scope.me }, ...(withCollaborators ? [{ collaboratorUserIds: { has: scope.me } }] : [])] : [];
  if (scope.level === "OWN") return own.length ? { OR: own } : NOTHING;
  const team: Prisma.CrmDealWhereInput[] = [
    ...own,
    ...(scope.teamIds.length ? [{ teamId: { in: scope.teamIds } }] : []),
    ...(scope.mates.length ? [{ ownerUserId: { in: scope.mates } }] : []),
  ];
  return team.length ? { OR: team } : NOTHING;
}

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

async function load(ctx: HomeCtx, actor: Actor, f: HomeFilters | null | undefined): Promise<Loaded> {
  const { settings } = await enter(ctx, actor);
  // AUDIT-CLASS X2: หน้าแรก = รายงานของผู้ดู ⇒ คีย์ crm.report.view (STAFF ได้ปริยาย · คีย์ API ต้องมีใน scope)
  if (!crmCan(actor, "crm.report.view")) throw new QuotaError("FORBIDDEN", crmForbiddenMessage("crm.report.view"));
  const now = f?.now instanceof Date && Number.isFinite(f.now.getTime()) ? f.now : new Date();
  const periodKey = str(f?.periodKey) ?? periodKeyOf(now, "MONTH");
  if (!isPeriodKey(periodKey)) throw new QuotaError("VALIDATION", periodKeyHint(periodKey));
  const prev = prevPeriodKey(periodKey);
  const scope = await reportScopeOf(ctx, actor);
  const pipelineId = str(f?.pipelineId);
  const ownerUserId = str(f?.ownerUserId);
  const vis = { tenantId: ctx.tenantId, systemId: ctx.systemId };
  const dealVis = await visibleWhere(vis, actor, "DEAL");
  const dealFilters: Prisma.CrmDealWhereInput[] = [{ archivedAt: null }, ...(pipelineId ? [{ pipelineId }] : []), ...(ownerUserId ? [{ ownerUserId }] : [])];
  const dealW: Prisma.CrmDealWhereInput = { AND: [dealVis, reportOwned(scope, true), ...dealFilters] };
  const dealOwnW: Prisma.CrmDealWhereInput = { AND: [dealVis, reportOwned(scope, false), ...dealFilters] };
  const contactW: Prisma.CrmContactWhereInput = {
    AND: [
      await visibleWhere(vis, actor, "CONTACT"),
      reportOwned(scope, false) as Prisma.CrmContactWhereInput,
      { archivedAt: null, mergedIntoId: null },
      ...(ownerUserId ? [{ ownerUserId }] : []),
    ],
  };
  return { ctx, actor, settings, scope, periodKey, range: periodRange(periodKey), prevRange: prev ? periodRange(prev) : null, pipelineId, ownerUserId, dealW, dealOwnW, basis: quotaBasisOf(settings), contactW };
}

/**
 * รีวิว S1 + รอบ 2 SF-3 · AUDIT-CLASS X1: ผู้ดูระดับ ALL ที่ "ถูกจำกัด" — ผู้จัดการที่ดูแลบางสาขา (unitAccess ไม่ใช่ทั้งร้าน) หรือคีย์ API
 * ที่มีตัวกรอง `crm.filter.team:` / `crm.filter.owner:` — กรองผู้สมัคร (ที่หาด้วยกติกาเดียวกับทั้งร้าน) ด้วยชุดที่อนุญาต =
 *   ผู้ดูแลดีลที่มองเห็น ∪ สมาชิกของทีมที่อนุญาต (ทีมไม่ผูกสาขา/ผูกสาขาที่ดูแล · ∩ ทีมของคีย์) ∪ คนที่ไม่อยู่ทีมไหนเลย (เว้นเมื่อคีย์กรองทีม)
 *   แล้ว ∩ เจ้าของตามตัวกรองของคีย์ · ความหมายเดียวกับขอบเขตสาขาใน visibility.ts (`wholeShop` · `unitTeams` · `keyFilters`)
 * ⇒ ผู้จัดการที่ระบุทุกสาขา = ทีมทุกทีมผ่าน = ผลเหมือนทั้งร้านทุกตัวเลข (probe ของรอบ 2) · ไม่ถูกจำกัด = คืนผู้สมัครเดิม
 */
async function allowedAmong(ctx: HomeCtx, actor: Actor, cand: string[], visibleOwners: Set<string>): Promise<string[]> {
  const fTeams: string[] = [];
  const fOwners: string[] = [];
  if (isApiActor(actor)) {
    for (const [k, v] of Object.entries(actor.permissions ?? {})) {
      if (v !== true) continue;
      if (k.startsWith("crm.filter.team:")) fTeams.push(k.slice("crm.filter.team:".length));
      else if (k.startsWith("crm.filter.owner:")) fOwners.push(k.slice("crm.filter.owner:".length));
    }
  }
  const units = Array.isArray(actor.unitAccess) ? actor.unitAccess : [];
  const whole = actor.role === "OWNER" || units.length === 0 || units.includes("*");
  if ((whole && fTeams.length === 0 && fOwners.length === 0) || cand.length === 0) return cand;
  let allowedTeams: Set<string> | null = null;
  if (!whole) {
    const teams = await prisma.team.findMany({ where: { tenantId: ctx.tenantId }, select: { id: true, unitIds: true }, take: 1_000 });
    allowedTeams = new Set(teams.filter((t) => t.unitIds.length === 0 || t.unitIds.some((u) => units.includes(u))).map((t) => t.id));
  }
  if (fTeams.length) allowedTeams = new Set([...(allowedTeams ?? new Set(fTeams))].filter((t) => fTeams.includes(t)));
  const rows = await prisma.teamMember.findMany({ where: { tenantId: ctx.tenantId, userId: { in: cand } }, select: { userId: true, teamId: true }, take: MEMBERS_MAX });
  const teamsOf = new Map<string, string[]>();
  for (const r of rows) teamsOf.set(r.userId, [...(teamsOf.get(r.userId) ?? []), r.teamId]);
  return cand.filter((u) => {
    if (fOwners.length && !fOwners.includes(u)) return false;
    if (visibleOwners.has(u)) return true;
    const ts = teamsOf.get(u) ?? [];
    if (ts.length === 0) return fTeams.length === 0;
    return allowedTeams === null || ts.some((t) => allowedTeams!.has(t));
  });
}

/** id ของขั้นชนิดนี้ในระบบ (มีเพดาน — ระบบหนึ่งมีขั้นไม่กี่สิบขั้น) */
async function stageIdsOfKind(L: Loaded, kind: "WON" | "LOST"): Promise<string[]> {
  return (await prisma.crmStage.findMany({ where: { tenantId: L.ctx.tenantId, systemId: L.ctx.systemId, kind }, select: { id: true }, take: STAGES_MAX })).map((s) => s.id);
}

/**
 * ดีลที่ "ปิดเป็น kind ในงวด": ตอนนี้เป็น kind นั้น และแถวประวัติ **ล่าสุด** ที่เข้าขั้นชนิดนั้นอยู่ในงวด
 * (= มีแถวเข้าขั้นชนิดนั้นในงวด และไม่มีแถวเข้าขั้นชนิดนั้นหลังจบงวด) — ชนะ→เปิดใหม่→ชนะ นับที่ครั้งหลัง
 */
function closedIn(kind: "WON" | "LOST", stageIds: string[], r: Range): Prisma.CrmDealWhereInput {
  return {
    AND: [
      { kind },
      { stageHistory: { some: { toStageId: { in: stageIds }, enteredAt: { gte: r.from, lt: r.to } } } },
      { stageHistory: { none: { toStageId: { in: stageIds }, enteredAt: { gte: r.to } } } },
    ],
  };
}

/**
 * แถวของ leaderboard = ชุดผู้ใช้ของ KPI 3 (รีวิวรอบ 2 NOTE-3 — KPI 3 == Σ แถว leaderboard):
 *   OWN = ฉัน · TEAM = สมาชิกทีมที่ฉันอยู่ · ALL = ผู้ดูแลดีลที่มองเห็น (ตามตัวกรอง) ∪ ผู้ถือโควตา USER ของงวด (กรองด้วย `allowedAmong` เมื่อถูกจำกัด)
 *   ∩ ตัวกรองผู้ดูแล ∩ **สมาชิกที่ตอบรับแล้ว** (รีวิวรอบ 2 NOTE-9 — เกณฑ์เดียวกับ setQuota/quotaBoard/notifyStaff)
 */
async function boardUsers(L: Loaded): Promise<string[]> {
  let users: string[];
  if (L.scope.level === "OWN") users = L.scope.me ? [L.scope.me] : [];
  else if (L.scope.level === "TEAM") users = [...L.scope.mates];
  else {
    const [owners, holders] = await Promise.all([
      prisma.crmDeal.groupBy({ by: ["ownerUserId"], where: { AND: [L.dealW, { ownerUserId: { not: null } }] }, orderBy: { ownerUserId: "asc" }, take: MEMBERS_MAX }),
      prisma.crmQuota.findMany({ where: { tenantId: L.ctx.tenantId, systemId: L.ctx.systemId, ownerType: "USER", periodKey: L.periodKey }, select: { ownerId: true }, take: MEMBERS_MAX }),
    ]);
    const visibleOwners = new Set(owners.map((o) => o.ownerUserId).filter((x): x is string => !!x));
    users = await allowedAmong(L.ctx, L.actor, [...new Set([...visibleOwners, ...holders.map((h) => h.ownerId)])], visibleOwners);
  }
  if (L.ownerUserId) users = users.filter((u) => u === L.ownerUserId);
  if (users.length === 0) return [];
  const live = new Set((await prisma.membership.findMany({ where: { tenantId: L.ctx.tenantId, userId: { in: users }, acceptedAt: { not: null } }, select: { userId: true }, take: MEMBERS_MAX })).map((m) => m.userId));
  return users.filter((u) => live.has(u));
}

const num = (v: bigint | number | null | undefined) => Number(v ?? 0);

// ───────────────────────── KPI 6 ช่อง ─────────────────────────

async function kpisOf(L: Loaded): Promise<HomeKpis> {
  const [wonStages, lostStages] = await Promise.all([stageIdsOfKind(L, "WON"), stageIdsOfKind(L, "LOST")]);
  const openW: Prisma.CrmDealWhereInput = { AND: [L.dealW, { kind: "OPEN" }] };
  const staleW: Prisma.CrmDealWhereInput = { AND: [L.dealW, { kind: "OPEN", stalledAt: { not: null } }] };
  // รีวิว S6: ตัวตั้งของชนะ/อัตราชนะ = ดีลที่ผู้ดูแลอยู่ในขอบเขต (ไม่นับผู้ร่วม) — ตรงกับ progress()/leaderboard
  const wonW: Prisma.CrmDealWhereInput = { AND: [L.dealOwnW, closedIn("WON", wonStages, L.range)] };
  const lostW: Prisma.CrmDealWhereInput = { AND: [L.dealOwnW, closedIn("LOST", lostStages, L.range)] };
  const hot = crmScoringSettingsOf(L.settings).hot;
  const [open, byStage, board, lost, prevWon, prevLost, stale, hotCount, wonAll] = await Promise.all([
    // 1 · pipeline เปิด
    prisma.crmDeal.aggregate({ where: openW, _count: { _all: true }, _sum: { valueSatang: true } }),
    // 2 · ถ่วงน้ำหนัก — รวมต่อ (ขั้น · % ที่ตั้งเอง) ในฐานข้อมูล
    prisma.crmDeal.groupBy({ by: ["stageId", "probabilityOverride"], where: openW, _sum: { valueSatang: true } }),
    // 3 · ชนะในงวด vs โควตา = Σ แถวของ leaderboard (รีวิวรอบ 2 NOTE-3 · SF-4: % บนฐานเดียวกับ progress())
    boardOf(L),
    // 4 · อัตราชนะ (งวดนี้ + งวดก่อน)
    prisma.crmDeal.count({ where: lostW }),
    L.prevRange ? prisma.crmDeal.count({ where: { AND: [L.dealOwnW, closedIn("WON", wonStages, L.prevRange)] } }) : Promise.resolve(0),
    L.prevRange ? prisma.crmDeal.count({ where: { AND: [L.dealOwnW, closedIn("LOST", lostStages, L.prevRange)] } }) : Promise.resolve(0),
    // 5 · ดีลนิ่ง (ชุดเดียวกับการ์ด "ดีลที่ต้องดู" ของ C2.10 · ไม่ตัดจำนวน)
    prisma.crmDeal.aggregate({ where: staleW, _count: { _all: true }, _sum: { valueSatang: true } }),
    // 6 · lead ร้อน — ตัดสินด้วยคะแนนจริง (scoreBand อาจค้าง) · ทุก lifecycle
    prisma.crmContact.count({ where: { AND: [L.contactW, { score: { gte: hot } }] } }),
    // 4 · ตัวตั้งของอัตราชนะ = ดีลที่ชนะในงวด (ผู้ดูแลอยู่ในขอบเขต — dealOwnW)
    prisma.crmDeal.count({ where: wonW }),
  ]);
  const stageIds = [...new Set(byStage.map((g) => g.stageId))];
  const probs = stageIds.length
    ? new Map((await prisma.crmStage.findMany({ where: { tenantId: L.ctx.tenantId, systemId: L.ctx.systemId, id: { in: stageIds } }, select: { id: true, probability: true }, take: STAGES_MAX })).map((s) => [s.id, s.probability]))
    : new Map<string, number>();
  let weighted = BigInt(0);
  for (const g of byStage) weighted += BigInt(g._sum.valueSatang ?? 0) * BigInt(g.probabilityOverride ?? probs.get(g.stageId) ?? 0);
  const withTarget = board.rows.filter((r) => r.targetSatang !== null);
  const targetSatang = withTarget.length ? withTarget.reduce((n, r) => n + BigInt(r.targetSatang ?? 0), BigInt(0)) : null;
  const wonCount = board.rows.reduce((n, r) => n + r.wonCount, 0);
  const wonValue = board.rows.reduce((n, r) => n + BigInt(r.wonSatang), BigInt(0));
  const achieved = board.rows.reduce((n, r) => n + BigInt(r.achievedSatang), BigInt(0));
  const pct = winRatePct(wonAll, lost);
  const prevPct = L.prevRange ? winRatePct(prevWon, prevLost) : null;
  return {
    periodKey: L.periodKey,
    openPipeline: { count: open._count._all, valueSatang: num(open._sum.valueSatang) },
    // ปัดครึ่งขึ้นหนึ่งครั้งบนผลรวม (ไม่ใช่ปัดทีละดีล) — ค่าไม่ติดลบเสมอ
    weighted: { valueSatang: Number((weighted + BigInt(50)) / BigInt(100)) },
    won: { count: wonCount, valueSatang: Number(wonValue), targetSatang: targetSatang === null ? null : Number(targetSatang), pct: quotaPct(achieved, targetSatang), basis: board.basis, achievedSatang: Number(achieved) },
    winRate: { pct, prevPct, deltaPts: pct !== null && prevPct !== null ? pct - prevPct : null, won: wonAll, lost },
    stale: { count: stale._count._all, valueSatang: num(stale._sum.valueSatang) },
    hotLeads: { count: hotCount, threshold: hot },
  };
}

// ───────────────────────── leaderboard ─────────────────────────

const boardMemo = new WeakMap<Loaded, Promise<HomeLeaderboard>>();

/** leaderboard (คิดครั้งเดียวต่อการโหลด — KPI 3 ใช้ผลเดียวกัน) */
function boardOf(L: Loaded): Promise<HomeLeaderboard> {
  let p = boardMemo.get(L);
  if (!p) {
    p = computeBoard(L);
    boardMemo.set(L, p);
  }
  return p;
}

/**
 * แถวละคนของ `boardUsers` — ชนะ/ดีลเปิด = ดีลที่มองเห็นและผู้ดูแลคือคนนั้น · ทำได้ (achieved) = ฐานเดียวกับ progress()/checkReached
 * (รีวิวรอบ 2 SF-4 · PAID = เงินรับชำระ COUNTED ในงวดจาก `quotas.paidByOwner` · WON = ยอดชนะ) · pct = floor(ทำได้ × 100 / เป้า USER)
 */
async function computeBoard(L: Loaded): Promise<HomeLeaderboard> {
  const users = await boardUsers(L);
  if (users.length === 0) return { periodKey: L.periodKey, basis: L.basis, rows: [] };
  const wonStages = await stageIdsOfKind(L, "WON");
  const inUsers: Prisma.CrmDealWhereInput = { ownerUserId: { in: users } };
  const [wonBy, openBy, targets, names, paid] = await Promise.all([
    prisma.crmDeal.groupBy({ by: ["ownerUserId"], where: { AND: [L.dealW, inUsers, closedIn("WON", wonStages, L.range)] }, _sum: { valueSatang: true }, _count: { _all: true }, orderBy: { ownerUserId: "asc" }, take: MEMBERS_MAX }),
    prisma.crmDeal.groupBy({ by: ["ownerUserId"], where: { AND: [L.dealW, inUsers, { kind: "OPEN" }] }, _count: { _all: true }, orderBy: { ownerUserId: "asc" }, take: MEMBERS_MAX }),
    prisma.crmQuota.findMany({ where: { tenantId: L.ctx.tenantId, systemId: L.ctx.systemId, ownerType: "USER", periodKey: L.periodKey, ownerId: { in: users } }, select: { ownerId: true, targetSatang: true }, take: MEMBERS_MAX }),
    prisma.membership.findMany({ where: { tenantId: L.ctx.tenantId, userId: { in: users } }, select: { userId: true, user: { select: { name: true } } }, take: MEMBERS_MAX }),
    L.basis === "PAID" ? paidByOwner(L.ctx, users, L.range, L.pipelineId) : Promise.resolve(new Map<string, bigint>()),
  ]);
  const wonOf = new Map(wonBy.map((g) => [g.ownerUserId ?? "", { v: BigInt(g._sum?.valueSatang ?? 0), n: typeof g._count === "object" && g._count ? g._count._all ?? 0 : 0 }]));
  const openOf = new Map(openBy.map((g) => [g.ownerUserId ?? "", typeof g._count === "object" && g._count ? g._count._all ?? 0 : 0]));
  const targetOf = new Map(targets.map((t) => [t.ownerId, t.targetSatang]));
  const nameOf = new Map(names.map((m) => [m.userId, m.user?.name?.trim() || "พนักงาน"]));
  const rows: HomeLeaderRow[] = users.map((u) => {
    const w = wonOf.get(u);
    const t = targetOf.get(u) ?? null;
    const achieved = L.basis === "PAID" ? (paid.get(u) ?? BigInt(0)) : (w?.v ?? BigInt(0));
    return { userId: u, name: nameOf.get(u) ?? "พนักงาน", wonSatang: Number(w?.v ?? 0), wonCount: w?.n ?? 0, achievedSatang: Number(achieved), targetSatang: t === null ? null : Number(t), pct: quotaPct(achieved, t), openDeals: openOf.get(u) ?? 0 };
  });
  // เรียง: ยอดชนะมาก → % มาก (ไม่มีเป้าไว้ท้าย) → userId (คงที่ ไม่กระโดดระหว่างรีเฟรช)
  rows.sort((a, b) => b.wonSatang - a.wonSatang || (b.pct ?? -1) - (a.pct ?? -1) || (a.userId < b.userId ? -1 : a.userId > b.userId ? 1 : 0));
  return { periodKey: L.periodKey, basis: L.basis, rows };
}

async function leaderboardOf(L: Loaded): Promise<HomeLeaderboard> {
  return boardOf(L);
}

// ───────────────────────── ที่มา lead ─────────────────────────

async function leadSourcesOf(L: Loaded): Promise<HomeLeadSources> {
  const groups = await prisma.crmContact.groupBy({
    by: ["sourceKind"],
    where: { AND: [L.contactW, { createdAt: { gte: L.range.from, lt: L.range.to } }] },
    _count: { _all: true },
    orderBy: { sourceKind: "asc" },
    take: 100,
  });
  const acc = new Map<string, number>();
  for (const g of groups) {
    const k = g.sourceKind ?? "OTHER"; // ไม่ระบุที่มา = "อื่น ๆ" (รวมกับแถวที่ระบุ OTHER เอง)
    const n = typeof g._count === "object" && g._count ? g._count._all ?? 0 : 0;
    acc.set(k, (acc.get(k) ?? 0) + n);
  }
  const items = [...acc.entries()].map(([sourceKind, count]) => ({ sourceKind, count })).sort((a, b) => b.count - a.count || (a.sourceKind < b.sourceKind ? -1 : a.sourceKind > b.sourceKind ? 1 : 0));
  return { periodKey: L.periodKey, items };
}

// ───────────────────────── "ไม่มีเจ้าของ" (R-A · §11.6) ─────────────────────────

async function unownedOf(ctx: HomeCtx, actor: Actor): Promise<HomeUnowned> {
  const vis = { tenantId: ctx.tenantId, systemId: ctx.systemId };
  // รีวิว S5 + รอบ 2 SF-2/NOTE-9: SQL หา **เฉพาะ id ของผู้ดูแลที่ออกจากร้านแล้ว** (ไม่มี Membership ที่ตอบรับแล้ว · DISTINCT · LIMIT 500)
  //   แล้วค่อยหาแถวด้วย Prisma **หลัง** visibleWhere (AUDIT-CLASS X1) ⇒ เพดาน 51 ใช้กับแถวที่ผู้ดูเห็นจริง —
  //   ผู้จัดการสาขา B ไม่ได้ 0 แถวเพราะ 51 แถวแรกของทั้งร้านอยู่สาขาอื่น · ไม่ดึงรายชื่อสมาชิกทั้งร้านมาทำ `notIn`
  const lim = HOME_UNOWNED_MAX + 1;
  const [goneDealOwners, goneContactOwners] = await Promise.all([
    prisma.$queryRaw<{ u: string }[]>`
      SELECT DISTINCT d."ownerUserId" AS "u" FROM "CrmDeal" d
       WHERE d."tenantId" = ${ctx.tenantId} AND d."systemId" = ${ctx.systemId} AND d."kind" = 'OPEN' AND d."archivedAt" IS NULL
         AND d."ownerUserId" IS NOT NULL
         AND NOT EXISTS (SELECT 1 FROM "Membership" m WHERE m."tenantId" = d."tenantId" AND m."userId" = d."ownerUserId" AND m."acceptedAt" IS NOT NULL)
       LIMIT ${DEPARTED_MAX}`,
    prisma.$queryRaw<{ u: string }[]>`
      SELECT DISTINCT c."ownerUserId" AS "u" FROM "CrmContact" c
       WHERE c."tenantId" = ${ctx.tenantId} AND c."systemId" = ${ctx.systemId} AND c."archivedAt" IS NULL AND c."mergedIntoId" IS NULL
         AND c."ownerUserId" IS NOT NULL
         AND NOT EXISTS (SELECT 1 FROM "Membership" m WHERE m."tenantId" = c."tenantId" AND m."userId" = c."ownerUserId" AND m."acceptedAt" IS NOT NULL)
       LIMIT ${DEPARTED_MAX}`,
  ]);
  const orphanOf = (rows: { u: string }[]) => ({ OR: [{ ownerUserId: null }, ...(rows.length ? [{ ownerUserId: { in: rows.map((r) => r.u) } }] : [])] });
  const [deals, contacts] = await Promise.all([
    prisma.crmDeal.findMany({
      where: { AND: [await visibleWhere(vis, actor, "DEAL"), { kind: "OPEN", archivedAt: null }, orphanOf(goneDealOwners)] },
      orderBy: [{ valueSatang: "desc" }, { id: "asc" }],
      select: { id: true, title: true, valueSatang: true },
      take: lim,
    }),
    prisma.crmContact.findMany({
      where: { AND: [await visibleWhere(vis, actor, "CONTACT"), { archivedAt: null, mergedIntoId: null }, orphanOf(goneContactOwners)] },
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      select: { id: true, name: true },
      take: lim,
    }),
  ]);
  return {
    deals: deals.slice(0, HOME_UNOWNED_MAX).map((d) => ({ id: d.id, title: d.title, valueSatang: d.valueSatang })),
    contacts: contacts.slice(0, HOME_UNOWNED_MAX).map((c) => ({ id: c.id, name: c.name })),
    moreDeals: deals.length > HOME_UNOWNED_MAX,
    moreContacts: contacts.length > HOME_UNOWNED_MAX,
  };
}

// ───────────────────────── ทางเข้าสาธารณะ ─────────────────────────

/** KPI 6 ช่องของภาพ 01 (pipeline เปิด · ถ่วงน้ำหนัก · ชนะงวดนี้ vs โควตา · อัตราชนะ · ดีลนิ่ง · lead ร้อน) */
export async function kpis(ctx: HomeCtx, actor: Actor, f: HomeFilters = {}): Promise<HomeKpis> {
  return kpisOf(await load(ctx, actor, f));
}

/** Leaderboard ทีมขายของงวด (ภาพ 01 ล่าง) */
export async function leaderboard(ctx: HomeCtx, actor: Actor, f: HomeFilters = {}): Promise<HomeLeaderboard> {
  return leaderboardOf(await load(ctx, actor, f));
}

/** ที่มา lead ของงวด (ผู้ติดต่อที่ **สร้าง** ในงวด แยกตาม sourceKind · ไม่ระบุ = OTHER) */
export async function leadSources(ctx: HomeCtx, actor: Actor, f: HomeFilters = {}): Promise<HomeLeadSources> {
  return leadSourcesOf(await load(ctx, actor, f));
}

/**
 * ดีลเปิด + ผู้ติดต่อที่ยังใช้อยู่ ซึ่ง "ไม่มีเจ้าของ" (ผู้ดูแลว่าง หรือไม่ได้เป็นสมาชิกของร้านแล้ว) — R-A: ผู้จัดการโอนเป็นกลุ่มผ่าน
 * `deals.bulkReassign` เดิม (ไม่มีทางที่สอง) · คีย์ `crm.deal.reassign` (MANAGER/OWNER ปริยาย · STAFF = FORBIDDEN)
 */
export async function unowned(ctx: HomeCtx, actor: Actor): Promise<HomeUnowned> {
  await enter(ctx, actor);
  if (!crmCan(actor, "crm.deal.reassign")) throw new QuotaError("FORBIDDEN", crmForbiddenMessage("crm.deal.reassign"));
  return unownedOf(ctx, actor);
}

/** ข้อมูลทั้งหน้าแรกในการเรียกเดียว (ขอบเขต/ตัวกรองคิดครั้งเดียว) — `unowned` = null สำหรับคนที่ไม่มีคีย์ crm.deal.reassign */
export async function homeData(ctx: HomeCtx, actor: Actor, f: HomeFilters = {}): Promise<HomeData> {
  const L = await load(ctx, actor, f);
  const [k, b, s, u] = await Promise.all([
    kpisOf(L),
    leaderboardOf(L),
    leadSourcesOf(L),
    crmCan(actor, "crm.deal.reassign") ? unownedOf(ctx, actor) : Promise.resolve(null),
  ]);
  return { kpis: k, leaderboard: b, leadSources: s, unowned: u };
}
