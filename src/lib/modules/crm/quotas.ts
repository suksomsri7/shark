// quotas.ts — โควตาของ CRM v2 (ใบ C3.2 · พิมพ์เขียว §5.9 · §7.1 · §7.4 · §11.6 · addendum ผู้เขียนข้อสอบข้อ 1–6 · 13–14 · มติผู้คุมงาน 26 ก.ย.)
//
// ผิวของไฟล์ (สัญญาข้อสอบ qc-crm-c3.2):
//   setQuota(ctx, actor, input) → QuotaDto        (upsert ต่อ ระบบ+เจ้าของ+งวด · คีย์ crm.quota.manage · งวดที่จบแล้ว = MANAGER+ · audit)
//   listQuotas(ctx, actor, { periodKey?, ownerType? }) → QuotaDto[]
//   progress(ctx, actor, { ownerType, ownerId, periodKey, now? }) → QuotaProgressDto   (จาก "สมุดบัญชี" ล้วน)
//   checkReached(ctx, { quotaId } | { userId, at? }) → { emitted }   (ยิง `crm.quota.reached` ครั้งเดียวต่อ เจ้าของ+งวด+เกณฑ์)
//   quotaBoard(ctx, actor, { periodKey }) → QuotaBoard   (หน้า `/crm/settings/quotas` · ภาพ 10 ขวา)
//   reachedAfterCommit(ctx, { dealId }) · onReached(evt)   (ทางต่อของทางเดินเงิน/ย้ายขั้น และตัวรับ event)
//
// "สมุดบัญชี" (ledger) ของความคืบหน้า — ไม่มีคอลัมน์สะสมใด ๆ ที่อาจเพี้ยน:
//   ชนะ     = ดีล kind WON · ไม่เก็บถาวร · ผู้ดูแลปัจจุบัน ∈ เจ้าของ · แถว CrmDealStageHistory **ล่าสุด** ที่เข้าขั้นชนิด WON อยู่ในงวด
//             (ไม่ใช้ closedAt — ชนะ→เปิดใหม่→ชนะ นับที่ชนะครั้งหลัง · ชนะแล้วเปิดใหม่และยังเปิดอยู่ = ไม่นับ)
//   รับเงิน = Σ CrmDealPayment COUNTED ที่ countedAt อยู่ในงวด บนดีลที่ไม่เก็บถาวรของเจ้าของ (ดีลชนิดใดก็ได้ — มัดจำบนดีลเปิดนับ)
//   กิจกรรม = CrmActivity ที่ doneAt อยู่ในงวด ของเจ้าของ ยกเว้น NOTE/WEB/PORTAL (ไม่ใช่งานของพนักงาน)
//   ทีม     = สมาชิกปัจจุบันของทีม (TeamMember รวมหัวหน้า) · เป้าทีม = แถวของทีมเอง ไม่มี = Σ เป้า USER ของสมาชิก (§11.6)
//   %       = floor(ทำได้ × 100 / เป้า) · ทำได้ = รับเงิน เมื่อ settings.crm.commission.basis = PAID (ค่าเริ่มต้น) · อื่น = ชนะ
// 🔴 R-E.8: ทุกผลรวมคิดในฐานข้อมูลเป็น bigint แล้วแปลงเป็น number ที่ขอบ (ปลอดภัยถึง 9·10¹⁵)
// 🔴 AUDIT-CLASS X1: ทุกคำสั่งผูก tenantId + systemId ที่ resolve ใหม่ (ชนิด CRM ของร้านนี้) · มองไม่เห็น = NOT_FOUND
// 🔴 R-E.14: ระบบ uiVersion 1 ⇒ ทุกทางเข้าของคนตอบ CrmV2DisabledError (ไม่อ่าน/ไม่เขียน) · checkReached เงียบ ไม่เขียน
import { Prisma } from "@prisma/client";
import type { MemberActor } from "@/lib/modules/member";
import { logOps } from "@/lib/core/ops";
import { prisma } from "./db";
import { crmCan, crmForbiddenMessage } from "./access";
import { parseCrmSettings } from "./settings";
import { CrmV2DisabledError } from "./ui-version";
import { resolve as resolveVisibility, type CrmVisLevel } from "./visibility";
import {
  QUOTA_ACTIVITY_EXCLUDED,
  QUOTA_COUNT_MAX,
  QUOTA_NOTE_MAX,
  QUOTA_THRESHOLDS,
  QuotaError,
  isPeriodKey,
  periodEnded,
  periodKeyHint,
  periodKeysAt,
  periodLabel,
  periodRange,
  quotaBasisOf,
  quotaPct,
  type QuotaBasis,
  type QuotaBoard,
  type QuotaBoardRow,
  type QuotaDto,
  type QuotaOwnerType,
  type QuotaProgressDto,
  type SetQuotaInput,
} from "./quotas-shared";
import { CRM_HARD_CAPS } from "./limits-shared"; // CRM C3.9 ▸ เพดานตายตัวของโค้ดอยู่ที่เดียว ◂

export { QuotaError, QUOTA_THRESHOLDS };
export type { QuotaBoard, QuotaBoardRow, QuotaDto, QuotaOwnerType, QuotaProgressDto, SetQuotaInput };

export type QuotaCtx = { tenantId: string; systemId: string; actorUserId?: string | null };
type Actor = MemberActor;
type SysRow = { id: string; settings: Prisma.JsonValue };

/** ชนิดของ event ตัวเดียวของไฟล์นี้ (ป้าย: automation/labels.ts · ตัวรับ: outbox-consumers.ts — บล็อก C3.2) */
export const QUOTA_REACHED_EVENT = "crm.quota.reached";

const MSG_NO_SYSTEM = "ไม่พบระบบ CRM นี้ในร้านที่เปิดอยู่ — รีเฟรชหน้าแล้วลองใหม่";
const MSG_NO_TARGET = "ไม่พบโควตาหรือเจ้าของโควตานี้ในขอบเขตที่บัญชีนี้ดูได้ — เลือกจากรายการ";
const LIST_MAX = CRM_HARD_CAPS.quotaBoardRows; // CRM C3.9 ▸ เพดานตายตัวอยู่ที่ limits-shared (ค่าเดิม 500) ◂
const TEAM_MEMBERS_MAX = 2_000;

// ───────────────────────── ด่านทางเข้า ─────────────────────────

async function loadSystem(ctx: QuotaCtx): Promise<SysRow | null> {
  const ok = !!ctx && typeof ctx.tenantId === "string" && typeof ctx.systemId === "string" && !!ctx.tenantId && !!ctx.systemId;
  if (!ok) return null;
  // AUDIT-CLASS X1: ระบบต้องเป็น CRM ของร้านใน ctx — id ที่ส่งมาเชื่อไม่ได้ (ร้านอื่น/ระบบสมาชิก = ไม่พบ)
  return prisma.appSystem.findFirst({ where: { id: ctx.systemId, tenantId: ctx.tenantId, type: "CRM" }, select: { id: true, settings: true } });
}

/** ทางเข้าของคน: ระบบของร้าน (ไม่พบ = NOT_FOUND) → uiVersion 2 (ไม่ใช่ = CrmV2DisabledError · ไม่อ่าน/ไม่เขียน) */
async function enter(ctx: QuotaCtx, actor: Actor | null | undefined): Promise<SysRow> {
  if (!actor || actor.role === "CUSTOMER") throw new QuotaError("NOT_FOUND", MSG_NO_SYSTEM);
  const sys = await loadSystem(ctx);
  if (!sys) throw new QuotaError("NOT_FOUND", MSG_NO_SYSTEM);
  if (parseCrmSettings(sys.settings as Prisma.JsonValue).uiVersion !== 2) throw new CrmV2DisabledError();
  return sys;
}

const isManagerPlus = (a: Actor) => a.role === "OWNER" || a.role === "MANAGER";

// ───────────────────────── ขอบเขต "รายงาน" ของผู้ดู (ใช้ร่วมกับ home-data.ts) ─────────────────────────

export type ReportScope = {
  /** ระดับรายงาน: visibility.resolve(REPORT) กว้างขึ้นด้วยคีย์ crm.report.team / crm.report.all (แนวเดียวกับ C3.1) */
  level: CrmVisLevel;
  me: string;
  /** ทีม (ยังไม่เก็บถาวร) ที่ฉันอยู่ */
  teamIds: string[];
  /** สมาชิกทุกคนของทีมที่ฉันอยู่ (รวมฉัน) */
  mates: string[];
};

/**
 * AUDIT-CLASS X1: ขอบเขตรายงานของ actor — อ่านทีม/สมาชิกทีมจากฐาน **ทุกครั้ง** (ไม่มีแคช · ย้ายทีมมีผลคำขอถัดไป)
 * STAFF ปริยาย OWN · หัวหน้าทีม ≥ TEAM · MANAGER/OWNER ALL (ตาม visibility-shared) · คีย์ crm.report.team/all กว้างขึ้นได้
 */
export async function reportScopeOf(ctx: QuotaCtx, actor: Actor): Promise<ReportScope> {
  let level = await resolveVisibility({ tenantId: ctx.tenantId, systemId: ctx.systemId }, actor, "REPORT");
  if (level !== "ALL" && crmCan(actor, "crm.report.all")) level = "ALL";
  else if (level === "OWN" && crmCan(actor, "crm.report.team")) level = "TEAM";
  const me = typeof actor.userId === "string" ? actor.userId : "";
  const mine = me
    ? await prisma.teamMember.findMany({ where: { tenantId: ctx.tenantId, userId: me, team: { tenantId: ctx.tenantId, archivedAt: null } }, select: { teamId: true }, take: 200 })
    : [];
  const teamIds = [...new Set(mine.map((m) => m.teamId))];
  const mates = teamIds.length
    ? (await prisma.teamMember.findMany({ where: { tenantId: ctx.tenantId, teamId: { in: teamIds } }, select: { userId: true }, take: TEAM_MEMBERS_MAX })).map((m) => m.userId)
    : [];
  return { level, me, teamIds, mates: [...new Set([...mates, ...(me ? [me] : [])])] };
}

// ───────────────────────── สมุดบัญชี (ledger) — SQL รวมในฐานข้อมูล ─────────────────────────

type Ledger = { won: bigint; deals: number; paid: bigint; activities: number };
const ZERO: Ledger = { won: BigInt(0), deals: 0, paid: BigInt(0), activities: 0 };

/** เวลาเป็น literal `timestamp` (UTC ไม่มีโซน) — คอลัมน์ DateTime ของ Prisma เก็บ UTC แบบไม่มีโซน ⇒ ไม่ขึ้นกับ TimeZone ของ session */
const tsq = (d: Date) => Prisma.sql`${d.toISOString().slice(0, 23).replace("T", " ")}::timestamp`;

/**
 * ยอดของเจ้าของแต่ละคนในช่วง [from, to) — 3 คำสั่งรวม (GROUP BY ผู้ดูแล) ไม่ว่าเจ้าของกี่คน
 * AUDIT-CLASS X1: ผูก tenantId + systemId ของ ctx ทุกคำสั่ง
 */
async function ledgerByOwner(ctx: QuotaCtx, owners: string[], range: { from: Date; to: Date }): Promise<Map<string, Ledger>> {
  const out = new Map<string, Ledger>();
  const ids = [...new Set(owners.filter((x) => typeof x === "string" && x))];
  if (ids.length === 0) return out;
  const { tenantId, systemId } = ctx;
  const won = await prisma.$queryRaw<{ u: string; n: number; v: bigint }[]>`
    SELECT d."ownerUserId" AS "u", count(*)::int AS "n", COALESCE(sum(d."valueSatang"), 0)::bigint AS "v"
      FROM "CrmDeal" d
      JOIN LATERAL (
        SELECT max(h."enteredAt") AS "at" FROM "CrmDealStageHistory" h JOIN "CrmStage" st ON st."id" = h."toStageId"
         WHERE h."dealId" = d."id" AND st."kind" = 'WON'
      ) w ON TRUE
     WHERE d."tenantId" = ${tenantId} AND d."systemId" = ${systemId} AND d."kind" = 'WON' AND d."archivedAt" IS NULL
       AND d."ownerUserId" = ANY(${ids}::text[])
       AND w."at" >= ${tsq(range.from)} AND w."at" < ${tsq(range.to)}
     GROUP BY d."ownerUserId"`;
  const paid = await prisma.$queryRaw<{ u: string; v: bigint }[]>`
    SELECT d."ownerUserId" AS "u", COALESCE(sum(p."satang"), 0)::bigint AS "v"
      FROM "CrmDealPayment" p JOIN "CrmDeal" d ON d."id" = p."dealId"
     WHERE p."tenantId" = ${tenantId} AND p."systemId" = ${systemId} AND d."systemId" = ${systemId} AND p."status" = 'COUNTED'
       AND p."countedAt" >= ${tsq(range.from)} AND p."countedAt" < ${tsq(range.to)}
       AND d."archivedAt" IS NULL AND d."ownerUserId" = ANY(${ids}::text[])
     GROUP BY d."ownerUserId"`;
  const excluded = [...QUOTA_ACTIVITY_EXCLUDED] as string[];
  const acts = await prisma.$queryRaw<{ u: string; n: number }[]>`
    SELECT a."ownerUserId" AS "u", count(*)::int AS "n"
      FROM "CrmActivity" a
     WHERE a."tenantId" = ${tenantId} AND a."systemId" = ${systemId} AND a."ownerUserId" = ANY(${ids}::text[])
       AND a."doneAt" >= ${tsq(range.from)} AND a."doneAt" < ${tsq(range.to)}
       AND NOT (a."type"::text = ANY(${excluded}::text[]))
     GROUP BY a."ownerUserId"`;
  const get = (u: string) => out.get(u) ?? { ...ZERO };
  for (const r of won) out.set(r.u, { ...get(r.u), won: BigInt(r.v), deals: Number(r.n) });
  for (const r of paid) out.set(r.u, { ...get(r.u), paid: BigInt(r.v) });
  for (const r of acts) out.set(r.u, { ...get(r.u), activities: Number(r.n) });
  return out;
}

/**
 * รีวิวรอบ 2 SF-4 (มติ "ความจริงเดียว"): เงินรับชำระ COUNTED ในช่วงต่อผู้ดูแล — สูตรเดียวกับ `ledgerByOwner` (ที่ progress()/checkReached ใช้)
 * ให้หน้าแรก (KPI 3 + leaderboard) คิด % บนฐานเดียวกัน · `pipelineId` = ตัวกรองของหน้าแรก (ไม่ส่ง = ทุก pipeline)
 */
export async function paidByOwner(ctx: QuotaCtx, owners: string[], range: { from: Date; to: Date }, pipelineId?: string | null): Promise<Map<string, bigint>> {
  const out = new Map<string, bigint>();
  const ids = [...new Set(owners.filter((x) => typeof x === "string" && x))];
  if (ids.length === 0) return out;
  const pid = typeof pipelineId === "string" && pipelineId ? pipelineId : null;
  const rows = await prisma.$queryRaw<{ u: string; v: bigint }[]>`
    SELECT d."ownerUserId" AS "u", COALESCE(sum(p."satang"), 0)::bigint AS "v"
      FROM "CrmDealPayment" p JOIN "CrmDeal" d ON d."id" = p."dealId"
     WHERE p."tenantId" = ${ctx.tenantId} AND p."systemId" = ${ctx.systemId} AND d."systemId" = ${ctx.systemId} AND p."status" = 'COUNTED'
       AND p."countedAt" >= ${tsq(range.from)} AND p."countedAt" < ${tsq(range.to)}
       AND d."archivedAt" IS NULL AND d."ownerUserId" = ANY(${ids}::text[])
       AND (${pid}::text IS NULL OR d."pipelineId" = ${pid})
     GROUP BY d."ownerUserId"`;
  for (const r of rows) out.set(r.u, BigInt(r.v));
  return out;
}

const sumLedger = (m: Map<string, Ledger>): Ledger => {
  const t = { ...ZERO };
  for (const l of m.values()) {
    t.won += l.won;
    t.deals += l.deals;
    t.paid += l.paid;
    t.activities += l.activities;
  }
  return t;
};

/** สมาชิกปัจจุบันของทีม (รวมหัวหน้า) — ทีมของร้านนี้เท่านั้น */
async function teamMemberIds(tenantId: string, teamId: string): Promise<string[]> {
  const rows = await prisma.teamMember.findMany({ where: { tenantId, teamId, team: { tenantId } }, select: { userId: true }, take: TEAM_MEMBERS_MAX });
  return [...new Set(rows.map((r) => r.userId))];
}

type Target = { quotaId: string | null; targetSatang: bigint | null; targetDeals: number | null; targetActivities: number | null };

/** เป้าของเจ้าของในงวด — ทีมที่ไม่ได้ตั้งเอง = Σ เป้า USER ของสมาชิก (ไม่มีสักแถว = null) */
async function targetOf(ctx: QuotaCtx, ownerType: QuotaOwnerType, ownerId: string, periodKey: string, members: string[]): Promise<Target> {
  const own = await prisma.crmQuota.findFirst({
    where: { tenantId: ctx.tenantId, systemId: ctx.systemId, ownerType, ownerId, periodKey },
    select: { id: true, targetSatang: true, targetDeals: true, targetActivities: true },
  });
  if (own) return { quotaId: own.id, targetSatang: own.targetSatang, targetDeals: own.targetDeals, targetActivities: own.targetActivities };
  if (ownerType !== "TEAM" || members.length === 0) return { quotaId: null, targetSatang: null, targetDeals: null, targetActivities: null };
  const agg = await prisma.crmQuota.aggregate({
    where: { tenantId: ctx.tenantId, systemId: ctx.systemId, ownerType: "USER", periodKey, ownerId: { in: members } },
    _sum: { targetSatang: true, targetDeals: true, targetActivities: true },
    _count: { _all: true },
  });
  if (agg._count._all === 0) return { quotaId: null, targetSatang: null, targetDeals: null, targetActivities: null };
  return { quotaId: null, targetSatang: agg._sum.targetSatang ?? BigInt(0), targetDeals: agg._sum.targetDeals ?? null, targetActivities: agg._sum.targetActivities ?? null };
}

/** ความคืบหน้าของเจ้าของหนึ่งราย (ไม่มีด่านผู้ดู — ผู้เรียกตัดสินแล้ว) */
async function computeProgress(ctx: QuotaCtx, sys: SysRow, ownerType: QuotaOwnerType, ownerId: string, periodKey: string): Promise<QuotaProgressDto> {
  const range = periodRange(periodKey);
  const owners = ownerType === "USER" ? [ownerId] : await teamMemberIds(ctx.tenantId, ownerId);
  const led = sumLedger(await ledgerByOwner(ctx, owners, range));
  const t = await targetOf(ctx, ownerType, ownerId, periodKey, owners);
  const basis: QuotaBasis = quotaBasisOf(sys.settings);
  const achieved = basis === "PAID" ? led.paid : led.won;
  return {
    quotaId: t.quotaId,
    won: Number(led.won),
    deals: led.deals,
    paid: Number(led.paid),
    activities: led.activities,
    targetSatang: t.targetSatang === null ? null : Number(t.targetSatang),
    targetDeals: t.targetDeals,
    targetActivities: t.targetActivities,
    basis,
    pct: quotaPct(achieved, t.targetSatang),
  };
}

const cleanOwnerType = (v: unknown): QuotaOwnerType => {
  if (v === "USER" || v === "TEAM") return v;
  throw new QuotaError("VALIDATION", "เลือกเจ้าของโควตาเป็นพนักงาน (USER) หรือทีม (TEAM)");
};
const cleanPeriod = (v: unknown): string => {
  if (!isPeriodKey(v)) throw new QuotaError("VALIDATION", periodKeyHint(v));
  return v;
};
const cleanId = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

// ───────────────────────── progress ─────────────────────────

/**
 * ความคืบหน้าโควตา (จากสมุดบัญชีล้วน) — ผู้ดูเห็นได้เมื่อ: ตัวเอง · ทีมที่ตัวเองอยู่ · เพื่อนร่วมทีม (ระดับรายงาน TEAM) ·
 * ระดับรายงาน ALL หรือมีคีย์ crm.quota.manage — อย่างอื่น NOT_FOUND (AUDIT-CLASS X1 · 404-not-403)
 */
export async function progress(ctx: QuotaCtx, actor: Actor, input: { ownerType: string; ownerId: string; periodKey: string; now?: Date }): Promise<QuotaProgressDto> {
  const sys = await enter(ctx, actor);
  const ownerType = cleanOwnerType(input?.ownerType);
  const ownerId = cleanId(input?.ownerId);
  const periodKey = cleanPeriod(input?.periodKey);
  if (!ownerId) throw new QuotaError("NOT_FOUND", MSG_NO_TARGET);
  if (!crmCan(actor, "crm.quota.manage")) {
    const scope = await reportScopeOf(ctx, actor);
    const ok =
      scope.level === "ALL" ||
      (ownerType === "USER" && (ownerId === scope.me || (scope.level === "TEAM" && scope.mates.includes(ownerId)))) ||
      (ownerType === "TEAM" && scope.teamIds.includes(ownerId));
    if (!ok) throw new QuotaError("NOT_FOUND", MSG_NO_TARGET);
  }
  if (ownerType === "TEAM" && !(await prisma.team.findFirst({ where: { id: ownerId, tenantId: ctx.tenantId }, select: { id: true } }))) {
    throw new QuotaError("NOT_FOUND", MSG_NO_TARGET);
  }
  return computeProgress(ctx, sys, ownerType, ownerId, periodKey);
}

// ───────────────────────── set / list ─────────────────────────

const toDto = (r: { id: string; ownerType: string; ownerId: string; periodKey: string; targetSatang: bigint; targetDeals: number | null; targetActivities: number | null; note: string | null }): QuotaDto => ({
  id: r.id,
  ownerType: r.ownerType === "TEAM" ? "TEAM" : "USER",
  ownerId: r.ownerId,
  periodKey: r.periodKey,
  targetSatang: Number(r.targetSatang),
  targetDeals: r.targetDeals,
  targetActivities: r.targetActivities,
  note: r.note,
});

const auditBody = (r: { targetSatang: bigint | number; targetDeals: number | null; targetActivities: number | null; note: string | null; ownerType: string; ownerId: string; periodKey: string }) => ({
  ownerType: r.ownerType,
  ownerId: r.ownerId,
  periodKey: r.periodKey,
  targetSatang: Number(r.targetSatang),
  targetDeals: r.targetDeals,
  targetActivities: r.targetActivities,
  note: r.note,
});

function cleanCount(v: unknown, label: string): number | null {
  if (v === undefined || v === null || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isInteger(n) || n < 0 || n > QUOTA_COUNT_MAX) throw new QuotaError("VALIDATION", `${label}ต้องเป็นจำนวนเต็มตั้งแต่ 0 ถึง ${QUOTA_COUNT_MAX.toLocaleString("th-TH")}`);
  return n;
}

/**
 * ตั้งโควตา (มีแล้ว = แก้ · ไม่มี = สร้าง) หนึ่งแถวต่อ (ระบบ · ชนิดเจ้าของ · เจ้าของ · งวด)
 * AUDIT-CLASS X9: คีย์ `crm.quota.manage` · งวดที่จบแล้ว (ปลายช่วง ≤ ตอนนี้) ต้อง MANAGER/OWNER (§11.6 แก้ย้อนหลัง) ·
 *   แถว AuditLog `crm.quota.set` (ก่อน/หลัง) ใน tx เดียวกับการเขียน
 * AUDIT-CLASS X3: เขียนใต้ advisory lock ต่อ (ระบบ · เจ้าของ · งวด) ⇒ ยิงพร้อมกันกี่ทางก็ได้แถวเดียว และ "ก่อน" ของ audit ตรงความจริง
 * AUDIT-CLASS X1: USER ต้องเป็นสมาชิกของร้าน · TEAM ต้องเป็นทีมของร้าน — ไม่งั้น NOT_FOUND ไม่เขียนอะไร
 */
export async function setQuota(ctx: QuotaCtx, actor: Actor, input: SetQuotaInput, opts: { now?: Date } = {}): Promise<QuotaDto> {
  await enter(ctx, actor);
  if (!crmCan(actor, "crm.quota.manage")) throw new QuotaError("FORBIDDEN", crmForbiddenMessage("crm.quota.manage"));
  const ownerType = cleanOwnerType(input?.ownerType);
  const periodKey = cleanPeriod(input?.periodKey);
  const target = input?.targetSatang;
  if (typeof target !== "number" || !Number.isSafeInteger(target) || target < 0) {
    throw new QuotaError("VALIDATION", "เป้ายอดขายต้องเป็นจำนวนเต็มสตางค์ตั้งแต่ 0 ขึ้นไป (เช่น ฿350,000 = 35000000 สตางค์)");
  }
  // รีวิว S2: คีย์ที่ไม่ได้ส่งมา (`undefined`) = คงค่าเดิมตอนแก้ · ส่ง `null` = ล้างค่า · สร้างใหม่ = null
  const targetDeals = input?.targetDeals === undefined ? undefined : cleanCount(input.targetDeals, "เป้าจำนวนดีล");
  const targetActivities = input?.targetActivities === undefined ? undefined : cleanCount(input.targetActivities, "เป้าจำนวนกิจกรรม");
  let note: string | null | undefined;
  if (input?.note !== undefined) {
    const noteRaw = typeof input.note === "string" ? input.note.trim() : "";
    if (noteRaw.length > QUOTA_NOTE_MAX) throw new QuotaError("VALIDATION", `บันทึกของโควตายาวได้ไม่เกิน ${QUOTA_NOTE_MAX} ตัวอักษร`);
    note = noteRaw || null;
  }
  const ownerId = cleanId(input?.ownerId);
  if (!ownerId) throw new QuotaError("NOT_FOUND", MSG_NO_TARGET);
  if (ownerType === "USER") {
    // รีวิว N14: เฉพาะสมาชิกที่ตอบรับคำเชิญแล้ว (acceptedAt) — เกณฑ์เดียวกับผู้รับแจ้งเตือนของ notifyStaff
    const m = await prisma.membership.findFirst({ where: { tenantId: ctx.tenantId, userId: ownerId, acceptedAt: { not: null } }, select: { id: true } });
    if (!m) throw new QuotaError("NOT_FOUND", "ไม่พบพนักงานคนนี้ในร้าน — เลือกพนักงานจากรายการ");
  } else {
    const t = await prisma.team.findFirst({ where: { id: ownerId, tenantId: ctx.tenantId, archivedAt: null }, select: { id: true } });
    if (!t) throw new QuotaError("NOT_FOUND", "ไม่พบทีมนี้ในร้าน — เลือกทีมจากรายการ");
  }
  const now = opts.now instanceof Date && Number.isFinite(opts.now.getTime()) ? opts.now : new Date();
  if (periodEnded(periodKey, now) && !isManagerPlus(actor)) {
    throw new QuotaError("FORBIDDEN", `งวด ${periodLabel(periodKey)} จบไปแล้ว — การแก้โควตาย้อนหลังต้องให้ผู้จัดการหรือเจ้าของร้านทำ`);
  }
  const row = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`crm:quota:${ctx.systemId}:${ownerType}:${ownerId}:${periodKey}`}, 0))`;
    const before = await tx.crmQuota.findFirst({ where: { tenantId: ctx.tenantId, systemId: ctx.systemId, ownerType, ownerId, periodKey } });
    const saved = before
      ? await tx.crmQuota.update({
          where: { id: before.id },
          data: {
            targetSatang: BigInt(target),
            ...(targetDeals !== undefined ? { targetDeals } : {}),
            ...(targetActivities !== undefined ? { targetActivities } : {}),
            ...(note !== undefined ? { note } : {}),
          },
        })
      : await tx.crmQuota.create({
          data: { tenantId: ctx.tenantId, systemId: ctx.systemId, ownerType, ownerId, periodKey, targetSatang: BigInt(target), targetDeals: targetDeals ?? null, targetActivities: targetActivities ?? null, note: note ?? null },
        });
    // รีวิว S3: ผู้กระทำใน audit = ctx.actorUserId ?? actor.userId (แบบเดียวกับ views.ts)
    const actorId = ctx.actorUserId ?? actor.userId ?? null;
    await tx.auditLog.create({
      data: {
        tenantId: ctx.tenantId,
        actorType: actorId ? "USER" : "SYSTEM",
        actorId,
        action: "crm.quota.set",
        targetType: "CrmQuota",
        targetId: saved.id,
        ...(before ? { before: auditBody(before) as Prisma.InputJsonValue } : {}),
        after: auditBody(saved) as Prisma.InputJsonValue,
      },
    });
    return saved;
  });
  return toDto(row);
}

/**
 * รายการโควตา — คีย์ crm.quota.manage หรือระดับรายงาน ALL = ทุกแถวของระบบ · อื่น ๆ = ของตัวเอง + ทีมที่ตัวเองอยู่
 * (มีเพดาน LIST_MAX · เรียงงวด → ชนิด → เจ้าของ)
 */
export async function listQuotas(ctx: QuotaCtx, actor: Actor, input: { periodKey?: string | null; ownerType?: string | null } = {}): Promise<QuotaDto[]> {
  await enter(ctx, actor);
  const where: Prisma.CrmQuotaWhereInput = { tenantId: ctx.tenantId, systemId: ctx.systemId };
  if (input?.periodKey) where.periodKey = cleanPeriod(input.periodKey);
  if (input?.ownerType) where.ownerType = cleanOwnerType(input.ownerType);
  const AND: Prisma.CrmQuotaWhereInput[] = [where];
  if (!crmCan(actor, "crm.quota.manage")) {
    const scope = await reportScopeOf(ctx, actor);
    if (scope.level !== "ALL") {
      AND.push({
        OR: [
          { ownerType: "USER", ownerId: { in: scope.level === "TEAM" ? scope.mates : [scope.me] } },
          { ownerType: "TEAM", ownerId: { in: scope.teamIds } },
        ],
      });
    }
  }
  const rows = await prisma.crmQuota.findMany({ where: { AND }, orderBy: [{ periodKey: "asc" }, { ownerType: "asc" }, { ownerId: "asc" }], take: LIST_MAX });
  return rows.map(toDto);
}

// ───────────────────────── หน้าตั้งโควตา (ภาพ 10 ขวา) ─────────────────────────

/**
 * ตารางโควตาของงวด: พนักงานทุกคนของร้าน + ทุกทีม — เป้า (แถวของตัวเอง · ทีมที่ไม่ได้ตั้ง = Σ สมาชิกแบบจาง) + ทำได้ + %
 * คีย์ crm.quota.manage (ไม่มี = NOT_FOUND — หน้า 404) · ยอด "ทำได้" คิดใน 3 คำสั่งรวมสำหรับทุกคนพร้อมกัน
 */
export async function quotaBoard(ctx: QuotaCtx, actor: Actor, input: { periodKey: string; now?: Date }): Promise<QuotaBoard> {
  const sys = await enter(ctx, actor);
  if (!crmCan(actor, "crm.quota.manage")) throw new QuotaError("NOT_FOUND", MSG_NO_SYSTEM);
  const periodKey = cleanPeriod(input?.periodKey);
  const now = input?.now instanceof Date ? input.now : new Date();
  const basis = quotaBasisOf(sys.settings);
  // รีวิว N14: เฉพาะสมาชิกที่ตอบรับแล้ว · เพดาน LIST_MAX คน (เกิน = ธง truncated → หน้าแสดง "แสดง 500 คนแรก")
  const memberRows = await prisma.membership.findMany({
    where: { tenantId: ctx.tenantId, acceptedAt: { not: null } },
    select: { userId: true, user: { select: { name: true } } },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: LIST_MAX + 1,
  });
  const truncated = memberRows.length > LIST_MAX;
  const members = memberRows.slice(0, LIST_MAX);
  const teams = await prisma.team.findMany({ where: { tenantId: ctx.tenantId, archivedAt: null }, select: { id: true, name: true }, orderBy: { name: "asc" }, take: 200 });
  const teamRows = teams.length
    ? await prisma.teamMember.findMany({ where: { tenantId: ctx.tenantId, teamId: { in: teams.map((t) => t.id) } }, select: { teamId: true, userId: true }, take: TEAM_MEMBERS_MAX })
    : [];
  const quotas = await prisma.crmQuota.findMany({ where: { tenantId: ctx.tenantId, systemId: ctx.systemId, periodKey }, take: LIST_MAX * 2 });
  const qBy = new Map(quotas.map((q) => [`${q.ownerType}:${q.ownerId}`, q]));
  const everyone = [...new Set([...members.map((m) => m.userId), ...teamRows.map((r) => r.userId)])];
  const led = await ledgerByOwner(ctx, everyone, periodRange(periodKey));
  const achievedOf = (l: Ledger | undefined) => (l ? (basis === "PAID" ? l.paid : l.won) : BigInt(0));
  const rows: QuotaBoardRow[] = members.map((m) => {
    const q = qBy.get(`USER:${m.userId}`);
    const a = achievedOf(led.get(m.userId));
    return {
      ownerType: "USER",
      ownerId: m.userId,
      name: m.user?.name?.trim() || "พนักงาน",
      quotaId: q?.id ?? null,
      targetSatang: q ? Number(q.targetSatang) : null,
      targetDeals: q?.targetDeals ?? null,
      derived: false,
      achievedSatang: Number(a),
      pct: quotaPct(a, q?.targetSatang ?? null),
    };
  });
  for (const t of teams) {
    const ids = [...new Set(teamRows.filter((r) => r.teamId === t.id).map((r) => r.userId))];
    let a = BigInt(0);
    for (const u of ids) a += achievedOf(led.get(u));
    const own = qBy.get(`TEAM:${t.id}`);
    const memberQ = ids.map((u) => qBy.get(`USER:${u}`)).filter((x): x is NonNullable<typeof x> => !!x);
    const target = own ? own.targetSatang : memberQ.length ? memberQ.reduce((s, q) => s + q.targetSatang, BigInt(0)) : null;
    const deals = own ? own.targetDeals : memberQ.some((q) => q.targetDeals !== null) ? memberQ.reduce((s, q) => s + (q.targetDeals ?? 0), 0) : null;
    rows.push({ ownerType: "TEAM", ownerId: t.id, name: t.name, quotaId: own?.id ?? null, targetSatang: target === null ? null : Number(target), targetDeals: deals, derived: !own && target !== null, achievedSatang: Number(a), pct: quotaPct(a, target) });
  }
  return { periodKey, periodLabel: periodLabel(periodKey), basis, ended: periodEnded(periodKey, now), canEditEnded: isManagerPlus(actor), truncated, rows };
}

// ───────────────────────── checkReached — `crm.quota.reached` ครั้งเดียวต่อ เจ้าของ+งวด+เกณฑ์ ─────────────────────────

/** คีย์กันซ้ำของ event (R-C.8 ใช้ `#`) — มี systemId เพราะคนหนึ่งถือโควตาได้ในสองระบบ CRM ของร้านเดียวกัน · ไม่ใช้ id ของโควตา
 *  (ลบแล้วสร้างใหม่ต้องไม่ยิงซ้ำ) */
export function reachedKey(systemId: string, ownerType: string, ownerId: string, periodKey: string, threshold: number): string {
  return `${QUOTA_REACHED_EVENT}#${systemId}:${ownerType}:${ownerId}:${periodKey}#${threshold}`;
}

type QuotaRow = { id: string; ownerType: string; ownerId: string; periodKey: string };

/**
 * ตรวจว่าโควตาถึงเกณฑ์ 80/100 % หรือยัง แล้วยิง `crm.quota.reached` ของทุกเกณฑ์ที่ถึง (0 → 200 % ในก้าวเดียว = ทั้งสองเกณฑ์)
 * AUDIT-CLASS X3: ยิงด้วย **INSERT … ON CONFLICT DO NOTHING** บน unique (tenantId, idempotencyKey) — ไม่ใช่ "เช็คก่อนแล้วสร้าง"
 *   (`emitOutbox`) ⇒ ผู้เรียกพร้อมกันกี่ทาง/กี่โพรเซส ได้แถวเดียวต่อเกณฑ์ และการชนไม่ทำให้ tx ของใคร abort
 * AUDIT-CLASS X4: ครั้งเดียว "ตลอดไป" ต่อ (ระบบ · เจ้าของ · งวด · เกณฑ์) — ถอนเงินจนต่ำกว่าแล้วกลับขึ้นมา / ขยับเป้า ไม่ยิงซ้ำ
 * AUDIT-CLASS X8: payload เป็น id ล้วน { quotaId, ownerType, ownerId, periodKey, threshold, pct } · OutboxEvent.systemId = ระบบ CRM
 * 🔴 ต้องถูกเรียก **หลัง** tx ของการรับเงิน/การชนะ commit แล้ว (ใน tx สองการจ่ายขนานกันต่างเห็นแค่แถวของตัวเอง ⇒ ไม่มีใครข้าม 100)
 * R-E.14: ระบบ uiVersion 1 / ไม่ใช่ระบบของร้าน / โควตาของระบบอื่น ⇒ คืนเงียบ ๆ ไม่เขียนอะไร
 */
export async function checkReached(ctx: QuotaCtx, target: { quotaId: string } | { userId: string; at?: Date }): Promise<{ emitted: { quotaId: string; threshold: number }[] }> {
  const emitted: { quotaId: string; threshold: number }[] = [];
  const sys = await loadSystem(ctx);
  if (!sys || parseCrmSettings(sys.settings as Prisma.JsonValue).uiVersion !== 2) return { emitted };
  let rows: QuotaRow[] = [];
  const sel = { id: true, ownerType: true, ownerId: true, periodKey: true } as const;
  if (target && "quotaId" in target) {
    const id = cleanId(target.quotaId);
    rows = id ? await prisma.crmQuota.findMany({ where: { id, tenantId: ctx.tenantId, systemId: ctx.systemId }, select: sel, take: 1 }) : [];
  } else if (target && "userId" in target) {
    const userId = cleanId(target.userId);
    if (!userId) return { emitted };
    const at = target.at instanceof Date && Number.isFinite(target.at.getTime()) ? target.at : new Date();
    const teamIds = (await prisma.teamMember.findMany({ where: { tenantId: ctx.tenantId, userId }, select: { teamId: true }, take: 200 })).map((r) => r.teamId);
    rows = await prisma.crmQuota.findMany({
      where: {
        tenantId: ctx.tenantId,
        systemId: ctx.systemId,
        periodKey: { in: periodKeysAt(at) },
        OR: [{ ownerType: "USER", ownerId: userId }, ...(teamIds.length ? [{ ownerType: "TEAM" as const, ownerId: { in: teamIds } }] : [])],
      },
      select: sel,
      take: 50,
    });
  }
  for (const q of rows) {
    if (!isPeriodKey(q.periodKey)) continue; // แถวเก่ารูปแบบ พ.ศ. (ก่อนมติ) — ไม่มีช่วงเวลาให้คิด
    const ownerType: QuotaOwnerType = q.ownerType === "TEAM" ? "TEAM" : "USER";
    const p = await computeProgress(ctx, sys, ownerType, q.ownerId, q.periodKey);
    if (p.pct === null) continue;
    for (const threshold of QUOTA_THRESHOLDS) {
      if (p.pct < threshold) continue;
      const r = await prisma.outboxEvent.createMany({
        data: [{
          tenantId: ctx.tenantId,
          systemId: ctx.systemId,
          type: QUOTA_REACHED_EVENT,
          idempotencyKey: reachedKey(ctx.systemId, ownerType, q.ownerId, q.periodKey, threshold),
          payload: { quotaId: q.id, ownerType, ownerId: q.ownerId, periodKey: q.periodKey, threshold, pct: p.pct },
        }],
        skipDuplicates: true,
      });
      if (r.count === 1) emitted.push({ quotaId: q.id, threshold });
    }
  }
  return { emitted };
}

/**
 * ทางต่อ "หลัง commit" ของทางเดินเงิน (payments.ts#afterCounted) และการย้ายเข้า WON (deals.ts#moveCore) —
 * หาผู้ดูแลปัจจุบันของดีลแล้ว checkReached ของเขา (โควตา USER + โควตาทีมของเขา · งวดที่ครอบ `at`)
 * 🔴 รีวิว N1 + รอบ 2 NOTE-1: `at` = เวลาของ "แถวในสมุดบัญชี" ที่ผู้เรียกเพิ่งเขียน (countedAt ของเงิน / enteredAt ของแถวประวัติที่เข้า WON)
 *    ส่งมาโดยผู้เรียกทุกทาง — ไม่มี `at` = รอบนี้ไม่ได้นับอะไรใหม่ ⇒ ไม่ตรวจ (ไม่เดาจาก "แถวล่าสุด" และไม่ใช้นาฬิกาตอนตรวจ)
 * 🔴 เป็น "ของแถม": ล้ม = WARN ใน OpsEvent (ไม่มีชื่อ/เบอร์) ไม่ทำให้การรับเงิน/การย้ายขั้นที่ commit แล้วดูเหมือนล้ม
 */
export async function reachedAfterCommit(ctx: { tenantId: string; systemId: string }, input: { dealId: string; at?: Date | null }): Promise<void> {
  try {
    const deal = await prisma.crmDeal.findFirst({ where: { id: input.dealId, tenantId: ctx.tenantId, systemId: ctx.systemId }, select: { ownerUserId: true } });
    if (!deal?.ownerUserId) return;
    const at = input.at instanceof Date && Number.isFinite(input.at.getTime()) ? input.at : null;
    if (!at) return;
    await checkReached(ctx, { userId: deal.ownerUserId, at });
  } catch (e) {
    await logOps("WARN", "crm", "ตรวจโควตาหลังรับเงิน/ปิดดีลไม่สำเร็จ — ความคืบหน้ายังถูกต้อง (คิดจากสมุดบัญชี) แต่การแจ้งเตือนรอบนี้อาจตกหล่น", {
      tenantId: ctx.tenantId,
      detail: `systemId=${ctx.systemId} dealId=${input.dealId} ${e instanceof Error ? e.name : "error"}`,
    }).catch(() => undefined);
  }
}

// ───────────────────────── ตัวรับ event `crm.quota.reached` ─────────────────────────

type OutboxEvt = { id?: string; tenantId: string; type?: string; payload: unknown; systemId?: string | null };

/**
 * `crm.quota.reached` → แจ้งเจ้าของโควตา (USER) หรือหัวหน้า + สมาชิกทีม (TEAM) ด้วยเทมเพลต `quota.progress` ของ C2.10
 * AUDIT-CLASS X4: ส่งซ้ำ/ส่งพร้อมกันไม่แจ้งซ้ำ — ตัวแจ้งเตือนกันซ้ำต่อ (ผู้รับ · เทมเพลต · ระเบียน · วันไทย) ใต้ล็อก
 * มติผู้คุมงาน (ข้อ 6 · 26 ก.ย.): refId ของใบแจ้ง = `${quotaId}#${threshold}` (คีย์ event ไม่เปลี่ยน) ⇒ กุญแจกันซ้ำรายวันของ notifyStaff
 *   แยกต่อเกณฑ์ — 80 % ตอนเช้ากับ 100 % ตอนบ่ายวันเดียวกันได้ใบละใบ (เดิมใบ 100 ถูกกลืน) · `{{count}}` = เกณฑ์ของ event นั้น
 *   (ลิงก์ของใบตัด `#` ออกตาม `refIdParam` ⇒ `r=<quotaId><threshold>` ยังต่างกันต่อเกณฑ์)
 */
export async function onReached(evt: OutboxEvt): Promise<void> {
  const p = (evt?.payload && typeof evt.payload === "object" ? evt.payload : {}) as Record<string, unknown>;
  const systemId = typeof evt?.systemId === "string" ? evt.systemId : "";
  const quotaId = typeof p.quotaId === "string" ? p.quotaId : "";
  if (!systemId || !quotaId || !evt?.tenantId) return;
  const q = await prisma.crmQuota.findFirst({ where: { id: quotaId, tenantId: evt.tenantId, systemId }, select: { id: true, ownerType: true, ownerId: true, periodKey: true } });
  if (!q) return; // ลบโควตาไปแล้ว — ไม่มีอะไรให้แจ้ง
  let userIds: string[];
  if (q.ownerType === "TEAM") {
    const team = await prisma.team.findFirst({ where: { id: q.ownerId, tenantId: evt.tenantId }, select: { leadUserId: true } });
    userIds = [...new Set([...(team?.leadUserId ? [team.leadUserId] : []), ...(await teamMemberIds(evt.tenantId, q.ownerId))])];
  } else userIds = [q.ownerId];
  if (userIds.length === 0) return;
  const threshold = (QUOTA_THRESHOLDS as readonly number[]).find((t) => t === Number(p.threshold));
  if (threshold === undefined) return; // payload เพี้ยน (ไม่ใช่เกณฑ์ที่รู้จัก) — ไม่แจ้งตัวเลขที่ไม่มีจริง
  const { notifyStaff } = await import("./notifications");
  await notifyStaff({ tenantId: evt.tenantId, systemId, actorUserId: null }, { key: "quota.progress", userIds, refType: "CrmQuota", refId: `${q.id}#${threshold}`, vars: { count: threshold }, linkQuery: { period: q.periodKey } });
}
