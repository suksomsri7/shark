// reports.ts — รายงาน CRM 8 แท็บ + งานส่งออก CSV + ส่งรายงานทางอีเมลตามกำหนด (ใบ C3.1 · พิมพ์เขียว §5.9 · ภาพ 09)
//
// ผิวของไฟล์ (addendum ข้อ 1 ของ crm-brief-C3.1 · มติผู้คุมงาน 26 ก.ย. 2569):
//   overview · forecast · funnel · reps · activities · lostReasons · sources · scores   (ctx, actor, filters)
//   getReport(ctx, actor, tab, filters)  — ตัวแจกงานตัวเดียว (C3.4 crm_reports + งานส่งออก + ตัวส่งอีเมลใช้ตัวนี้)
//   startExport · runExportJobs · getExport — ส่งออก CSV เป็นงาน async เสมอ (`CrmImportJob` kind "REPORT_EXPORT" + lease)
//   listSchedules · saveSchedule · deleteSchedule · runScheduled — ตารางเวลาใน `settings.crm.reportSchedules[]` (R-E.6)
//
// 🔴 ตัวเลขทุกตัวรวมในฐานข้อมูล (`$queryRaw` + `count/sum … FILTER`) เป็น bigint แล้วแปลงเป็น number ที่ขอบ (R-E.8)
//    ไม่มีการโหลดแถวมานับในแอป · อ่านรายการแบบมีเพดานเสมอ (member audit M13)
// 🔴 ช่วงเวลา = วันไทยรวมปลาย [from 00:00 +07, to+1 00:00 +07) · เปิด (OPEN) = ภาพ ณ ตอนนี้ (ไม่ผูกช่วง) ·
//    ชนะ/แพ้ ตาม closedAt · รับชำระตาม countedAt · กิจกรรมที่ทำตาม doneAt · lead ใหม่ตาม createdAt ของผู้ติดต่อ
// 🔴 ขอบเขตรายงาน (AUDIT-CLASS X1) = widest(visibility.resolve(actor, "REPORT"), crm.report.team ⇒ TEAM, crm.report.all ⇒ ALL)
//    ใช้กับแต่ละชนิดตามความหมายของ visibility.ts · กิจกรรมที่ไม่มีผู้ดูแลนับเฉพาะระดับ ALL · ตัวกรองไม่เคยขยายขอบเขต
// 🔴 ไม่มีข้อมูลบุคคลของลูกค้า (ชื่อ/เบอร์/อีเมลผู้ติดต่อ · อะไรก็ตามของสมาชิกที่ผูก) ใน DTO / CSV / อีเมล (AUDIT-CLASS X8)

import { createHash, randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { csvRow } from "@/lib/core/csv";
import { writeAudit } from "@/lib/core/audit";
import { logOps } from "@/lib/core/ops";
import type { MemberActor } from "@/lib/modules/member";
import { prisma } from "./db";
import { crmCan, crmForbiddenMessage, isApiActor } from "./access";
import { parseCrmSettings } from "./settings";
import { CrmV2DisabledError } from "./ui-version";
import { resolve as resolveVisibility, visibleWhere } from "./visibility";
import { CONTACT_SOURCE_LABEL } from "./contacts-shared";
import { ACTIVITY_TYPES, ACTIVITY_TYPE_LABEL } from "./activities-shared";
import { SCORE_BAND_LABELS } from "./scoring-shared";
import { FORECAST_CATEGORY_LABEL } from "./deals-shared";
import {
  FORECAST_GROUP_BYS,
  REPORT_EXPORT_DEAL_ROWS_MAX,
  REPORT_EXPORT_KIND,
  REPORT_LEASE_MS,
  REPORT_NONE_KEY,
  REPORT_SCHEDULES_MAX,
  REPORT_SCHEDULE_RECIPIENTS_MAX,
  REPORT_TABS,
  REPORT_TAB_TITLE,
  ReportsError,
  isReportFrequency,
  isReportTab,
  isThaiYmd,
  pct1,
  periodLabel,
  reportSlotOf,
  thaiDayStart,
  thaiMonthLabel,
  thaiYmdOf,
  type ActivitiesReport,
  type ActivityRow,
  type AnyReport,
  type ForecastGroupBy,
  type ForecastReport,
  type ForecastRow,
  type FunnelReport,
  type FunnelStageRow,
  type LostReport,
  type OverviewReport,
  type RepRow,
  type ReportExportDto,
  type ReportExportStatus,
  type ReportFilters,
  type ReportOf,
  type ReportSchedule,
  type ReportScheduleFrequency,
  type ReportScheduleInput,
  type ReportSlot,
  type ReportTab,
  type RepsReport,
  type ScoresReport,
  type SourceRow,
  type SourcesReport,
} from "./reports-shared";

export { REPORT_TABS, ReportsError };
export type { ReportFilters, ReportTab, ReportSchedule, ReportExportDto };

export type ReportsCtx = { tenantId: string; systemId: string; actorUserId?: string | null };
export type ForecastFilters = ReportFilters & { groupBy?: ForecastGroupBy | string | null };

type Actor = MemberActor;
type Lvl = "OWN" | "TEAM" | "ALL";
type Sql = Prisma.Sql;

const NOT_FOUND_MSG = "ไม่พบระบบ CRM นี้ในร้านที่เปิดอยู่ (อาจถูกลบหรืออยู่คนละร้าน) — รีเฟรชหน้าแล้วลองใหม่";
const TAB_MSG = "ไม่รู้จักแท็บรายงานนี้ — เลือกแท็บจากรายการของหน้ารายงาน";
const DATE_MSG = "วันที่ในตัวกรองอ่านไม่ออก — ใช้รูปแบบ ปี-เดือน-วัน แบบ ค.ศ. เช่น 2026-10-31";
const API_EXPORT_MSG = "การส่งออกไฟล์รายงานใช้ได้จากหน้าจอของพนักงานเท่านั้น (ยังไม่เปิดให้คีย์ API) — ใช้รายงานแบบอ่านค่าแทน หรือเข้าหน้ารายงานเพื่อส่งออก";
const RANGE_MSG = "ช่วงวันที่ในตัวกรองกลับด้าน (วันเริ่มอยู่หลังวันสิ้นสุด) — สลับวันแล้วลองใหม่";
const EXPORT_CSV_MAX_BYTES = 5 * 1024 * 1024;
const EXPORT_BATCH_MAX = 20;
/** N3: เพดานแถว "ต่อมิติ" ของแท็บที่มา (ที่มา · แคมเปญ · ลิงก์ — เรียงตาม lead มากสุด) ⇒ แคมเปญ utm ขยะเป็นพันไม่ดันแถวที่มา/ลิงก์ตกหาย */
const SOURCES_ROWS_PER_DIM = 200;
const fail = (code: ReportsError["code"], msg: string) => new ReportsError(code, msg);
const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
const idOk = (v: string) => /^[A-Za-z0-9_-]{1,64}$/.test(v);
const toNum = (v: unknown): number => (v === null || v === undefined ? 0 : Number(v));
const baht = (satang: number | null | undefined): number | null => (satang === null || satang === undefined ? null : Math.round(Number(satang)) / 100);
const A = (alias: string): Sql => Prisma.raw(alias);
/** เวลา → timestamp (UTC) ในคำสั่ง SQL ที่ไม่ขึ้นกับ TimeZone ของ session (แบบเดียวกับ minute-jobs.ts) */
const ts = (d: Date): Sql => Prisma.sql`(${d.toISOString()}::timestamptz AT TIME ZONE 'UTC')`;

// ───────────────────────── ทางเข้า: ระบบ → uiVersion → คีย์ ─────────────────────────

type Sys = { tenantId: string; systemId: string };

/** AUDIT-CLASS X1: ระบบ CRM ของร้านนี้เท่านั้น (อื่น = NOT_FOUND ข้อความไม่สะท้อนอะไรของอีกฝั่ง) · R-E.14 รุ่น 1 = ปฏิเสธ */
async function loadSystem(ctx: ReportsCtx): Promise<Sys> {
  const tenantId = str(ctx?.tenantId);
  const systemId = str(ctx?.systemId);
  const sys = tenantId && systemId ? await prisma.appSystem.findFirst({ where: { id: systemId, tenantId, type: "CRM" }, select: { settings: true } }) : null;
  if (!sys) throw fail("NOT_FOUND", NOT_FOUND_MSG);
  if (parseCrmSettings(sys.settings).uiVersion !== 2) throw new CrmV2DisabledError();
  return { tenantId, systemId };
}

/** ลำดับตายตัว: ระบบ (NOT_FOUND) → uiVersion 2 (CrmV2DisabledError) → คีย์ (FORBIDDEN ข้อความไทยไม่โทษผู้ใช้) */
async function enter(ctx: ReportsCtx, actor: Actor | null | undefined, key: string): Promise<{ sys: Sys; actor: Actor }> {
  const sys = await loadSystem(ctx);
  if (!actor || actor.role === "CUSTOMER" || typeof actor.userId !== "string") throw fail("FORBIDDEN", crmForbiddenMessage(key));
  // AUDIT-CLASS X2: คีย์ผ่านตัวตัดสินตัวเดียวของ CRM
  if (!crmCan(actor, key)) throw fail("FORBIDDEN", crmForbiddenMessage(key));
  return { sys, actor };
}

// ───────────────────────── ขอบเขตรายงาน (AUDIT-CLASS X1) ─────────────────────────

type Scope = Sys & {
  level: Lvl;
  me: string;
  teams: string[];
  mates: string[];
  /** ALL ของคนที่ถูกจำกัดสาขา: ทีมที่เห็นได้ (null = ไม่ถูกจำกัด) */
  allowedTeams: string[] | null;
  /** ALL ของคนที่ถูกจำกัดสาขา: กิจกรรมกำพร้าที่ visibleWhere(ACTIVITY) ไม่ให้เห็น ("ALL" = เกินเพดาน ⇒ ซ่อนกำพร้าที่ผูกบริษัท/รายการทั้งหมด) */
  hiddenOrphans: string[] | "ALL";
  /** ตัวกรองของคีย์ API (R-C.3) */
  keyTeams: string[];
  keyOwners: string[];
  keyTeamMembers: string[];
};

const RANK: Record<Lvl, number> = { OWN: 0, TEAM: 1, ALL: 2 };
/** เพดานของ "กิจกรรมกำพร้าที่ต้องซ่อน" (เท่ากับ ORPHAN_HIDE_CAP ของ visibility.ts) — เกิน = ซ่อนกิจกรรมกำพร้าทั้งกลุ่ม (fail closed) */
const ORPHAN_HIDE_CAP = 5_000;
const wholeShop = (actor: Actor) => actor.role === "OWNER" || actor.unitAccess.length === 0 || actor.unitAccess.includes("*");

/**
 * AUDIT-CLASS X1: ระดับรายงานของ actor = widest(policy REPORT ของ visibility.ts, crmCan(report.team) ⇒ TEAM, crmCan(report.all) ⇒ ALL)
 * (N1 · addendum ข้อ 4): ใช้ `crmCan` ตัวเดียวกับประตูตารางเวลา — MANAGER ได้ report.all ปริยาย ⇒ ALL (ถูกจำกัดสาขาแบบ visibleWhere ALL)
 * ทีม/สมาชิกทีม/สาขา อ่านจากฐานใหม่ทุกครั้ง (ไม่มีแคช — ย้ายคนออกจากทีมมีผลคำขอถัดไป)
 */
async function reportScope(sys: Sys, actor: Actor): Promise<Scope> {
  let level: Lvl = await resolveVisibility(sys, actor, "REPORT");
  if (crmCan(actor, "crm.report.all")) level = "ALL";
  else if (crmCan(actor, "crm.report.team") && RANK[level] < RANK.TEAM) level = "TEAM";
  const me = actor.userId;
  const sc: Scope = { ...sys, level, me, teams: [], mates: [me], allowedTeams: null, hiddenOrphans: [], keyTeams: [], keyOwners: [], keyTeamMembers: [] };
  if (level === "TEAM") {
    const [r] = await prisma.$queryRaw<{ teams: string[] | null; mates: string[] | null }[]>`
      WITH mine AS (
        SELECT tm."teamId" FROM "TeamMember" tm JOIN "Team" t ON t."id" = tm."teamId"
         WHERE tm."tenantId" = ${sys.tenantId} AND tm."userId" = ${me} AND t."tenantId" = ${sys.tenantId} AND t."archivedAt" IS NULL
      )
      SELECT (SELECT array_agg(DISTINCT "teamId") FROM mine) AS "teams",
             (SELECT array_agg(DISTINCT m."userId") FROM "TeamMember" m WHERE m."tenantId" = ${sys.tenantId} AND m."teamId" IN (SELECT "teamId" FROM mine)) AS "mates"`;
    sc.teams = r?.teams ?? [];
    sc.mates = [...new Set([me, ...(r?.mates ?? [])])];
  }
  if (level === "ALL" && !isApiActor(actor) && !wholeShop(actor)) {
    const rows = await prisma.$queryRaw<{ id: string }[]>`
      SELECT "id" FROM "Team" WHERE "tenantId" = ${sys.tenantId}
         AND (cardinality("unitIds") = 0 OR "unitIds" && ${actor.unitAccess}::text[]) LIMIT 1000`;
    sc.allowedTeams = rows.map((x) => x.id);
    // S3: กิจกรรม "กำพร้า" (ไม่มีดีล/ผู้ติดต่อ — ผูกบริษัท/รายการวัตถุ) ของสาขาอื่น — ใช้กฎของ visibility.ts ตรง ๆ (visibleWhere ACTIVITY)
    //   ไม่เขียนกฎชุดที่สอง: แถวกำพร้าที่ visibleWhere ไม่ให้เห็น = ซ่อนจากรายงานด้วย · มีเพดานแบบเดียวกับ visibility (เกิน = ซ่อนทั้งกลุ่ม)
    const vis = await visibleWhere(sys, actor, "ACTIVITY", { keyGate: false });
    const hidden = await prisma.crmActivity.findMany({
      where: { AND: [{ tenantId: sys.tenantId, systemId: sys.systemId, dealId: null, contactId: null }, { NOT: vis }] },
      select: { id: true },
      take: ORPHAN_HIDE_CAP + 1,
    });
    sc.hiddenOrphans = hidden.length > ORPHAN_HIDE_CAP ? "ALL" : hidden.map((x) => x.id);
  }
  if (isApiActor(actor)) {
    // AUDIT-CLASS X2: ตัวกรองของคีย์ API (pseudo-scope `crm.filter.team:` / `crm.filter.owner:`) — แคบลงเท่านั้น
    for (const [k, v] of Object.entries(actor.permissions ?? {})) {
      if (v !== true) continue;
      if (k.startsWith("crm.filter.team:")) sc.keyTeams.push(k.slice("crm.filter.team:".length));
      else if (k.startsWith("crm.filter.owner:")) sc.keyOwners.push(k.slice("crm.filter.owner:".length));
    }
    if (sc.keyTeams.length) {
      const rows = await prisma.$queryRaw<{ userId: string }[]>`
        SELECT DISTINCT "userId" FROM "TeamMember" WHERE "tenantId" = ${sys.tenantId} AND "teamId" = ANY(${sc.keyTeams}::text[]) LIMIT 5000`;
      sc.keyTeamMembers = rows.map((x) => x.userId);
    }
  }
  return sc;
}

const orSql = (parts: Sql[]): Sql => (parts.length ? Prisma.sql`(${Prisma.join(parts, " OR ")})` : Prisma.sql`FALSE`);
const andSql = (parts: Sql[]): Sql => (parts.length ? Prisma.join(parts, " AND ") : Prisma.sql`TRUE`);
const teamOk = (a: string, allowed: string[]): Sql => Prisma.sql`(${A(a)}."teamId" IS NULL OR ${A(a)}."teamId" = ANY(${allowed}::text[]))`;

/** ตารางที่มี ownerUserId + teamId (ดีล · ผู้ติดต่อ) — ดีล OWN รวมผู้ร่วมดูแล */
function ownedScope(sc: Scope, a: string, withCollab: boolean): Sql {
  const X = A(a);
  const keys: Sql[] = [];
  if (sc.keyTeams.length) keys.push(Prisma.sql`${X}."teamId" = ANY(${sc.keyTeams}::text[])`);
  if (sc.keyOwners.length) keys.push(Prisma.sql`${X}."ownerUserId" = ANY(${sc.keyOwners}::text[])`);
  let base: Sql;
  if (sc.level === "ALL") base = sc.allowedTeams === null ? Prisma.sql`TRUE` : teamOk(a, sc.allowedTeams);
  else {
    const own: Sql[] = [Prisma.sql`${X}."ownerUserId" = ${sc.me}`, ...(withCollab ? [Prisma.sql`${sc.me} = ANY(${X}."collaboratorUserIds")`] : [])];
    base =
      sc.level === "OWN"
        ? orSql(own)
        : orSql([...own, ...(sc.teams.length ? [Prisma.sql`${X}."teamId" = ANY(${sc.teams}::text[])`] : []), Prisma.sql`${X}."ownerUserId" = ANY(${sc.mates}::text[])`]);
  }
  return andSql([base, ...keys]);
}

/** กิจกรรม (ไม่มี teamId): OWN = ของฉัน · TEAM = ผู้ดูแลเป็นเพื่อนร่วมทีม · ไม่มีผู้ดูแล = นับเฉพาะ ALL (addendum ข้อ 4) */
function activityScope(sc: Scope, a: string): Sql {
  const X = A(a);
  const keys: Sql[] = [];
  if (sc.keyTeams.length) keys.push(Prisma.sql`${X}."ownerUserId" = ANY(${sc.keyTeamMembers}::text[])`);
  if (sc.keyOwners.length) keys.push(Prisma.sql`${X}."ownerUserId" = ANY(${sc.keyOwners}::text[])`);
  let base: Sql;
  if (sc.level === "ALL") {
    // ทั้งร้าน = ทุกแถว · ถูกจำกัดสาขา = เงื่อนไขเดียวกับ visibility.activityClause (ALL):
    //   มีดีล → ตามทีมของดีล · ไม่มีดีลแต่มีผู้ติดต่อ → ตามทีมของผู้ติดต่อ · กำพร้า → ยกเว้นแถวที่ visibleWhere ซ่อน (S3)
    base =
      sc.allowedTeams === null
        ? Prisma.sql`TRUE`
        : Prisma.sql`((${X}."dealId" IS NOT NULL AND EXISTS (SELECT 1 FROM "CrmDeal" xd WHERE xd."id" = ${X}."dealId" AND ${teamOk("xd", sc.allowedTeams)}))
            OR (${X}."dealId" IS NULL AND ${X}."contactId" IS NOT NULL AND EXISTS (SELECT 1 FROM "CrmContact" xc WHERE xc."id" = ${X}."contactId" AND ${teamOk("xc", sc.allowedTeams)}))
            OR (${X}."dealId" IS NULL AND ${X}."contactId" IS NULL AND ${
              sc.hiddenOrphans === "ALL"
                ? Prisma.sql`${X}."companyId" IS NULL AND ${X}."customRecordId" IS NULL`
                : sc.hiddenOrphans.length
                  ? Prisma.sql`NOT (${X}."id" = ANY(${sc.hiddenOrphans}::text[]))`
                  : Prisma.sql`TRUE`
            }))`;
  } else if (sc.level === "OWN") base = Prisma.sql`${X}."ownerUserId" = ${sc.me}`;
  else base = Prisma.sql`${X}."ownerUserId" = ANY(${sc.mates}::text[])`;
  return andSql([base, ...keys]);
}

// ───────────────────────── ตัวกรอง ─────────────────────────

type Clean = { from: string | null; to: string | null; lo: Date | null; hi: Date | null; teamId: string | null; pipelineId: string | null; ownerUserId: string | null };

/**
 * AUDIT-CLASS X1/X6: ตรวจตัวกรอง — วันไทยจริง · from ≤ to · id ทีม/pipeline/ผู้ดูแล ต้องเป็นของร้าน (+ ระบบ CRM นี้) ·
 * ตัวกรองแค่ "ตัดให้แคบลง" ต่อจากขอบเขตของผู้ขอ ไม่มีทางขยาย
 */
async function cleanFilters(sys: Sys, raw: unknown): Promise<Clean> {
  if (raw !== undefined && raw !== null && (typeof raw !== "object" || Array.isArray(raw))) throw fail("VALIDATION", "ตัวกรองของรายงานอ่านไม่ออก — เลือกตัวกรองจากหน้ารายงานใหม่");
  const f = (raw ?? {}) as Record<string, unknown>;
  const day = (v: unknown): string | null => {
    if (v === undefined || v === null || v === "") return null;
    if (!isThaiYmd(v)) throw fail("VALIDATION", DATE_MSG);
    return v;
  };
  const from = day(f.from);
  const to = day(f.to);
  if (from && to && from > to) throw fail("VALIDATION", RANGE_MSG);
  const idOf = (v: unknown, what: string): string | null => {
    if (v === undefined || v === null || v === "") return null;
    const s = str(v);
    if (!idOk(s)) throw fail("VALIDATION", `ไม่พบ${what}ที่เลือกในระบบนี้ — เลือกใหม่จากรายการ`);
    return s;
  };
  const teamId = idOf(f.teamId, "ทีม");
  const pipelineId = idOf(f.pipelineId, " pipeline ");
  const ownerUserId = idOf(f.ownerUserId, "ผู้ดูแล");
  if (teamId || pipelineId || ownerUserId) {
    const [r] = await prisma.$queryRaw<{ team: number; pipe: number; owner: number }[]>`
      SELECT (SELECT count(*) FROM "Team" WHERE "id" = ${teamId ?? ""} AND "tenantId" = ${sys.tenantId})::int AS "team",
             (SELECT count(*) FROM "CrmPipeline" WHERE "id" = ${pipelineId ?? ""} AND "tenantId" = ${sys.tenantId} AND "systemId" = ${sys.systemId})::int AS "pipe",
             (SELECT count(*) FROM "Membership" WHERE "userId" = ${ownerUserId ?? ""} AND "tenantId" = ${sys.tenantId})::int AS "owner"`;
    if (teamId && !r?.team) throw fail("VALIDATION", "ไม่พบทีมที่เลือกในร้านนี้ — เลือกทีมใหม่จากรายการ");
    if (pipelineId && !r?.pipe) throw fail("VALIDATION", "ไม่พบ pipeline ที่เลือกในระบบ CRM นี้ — เลือก pipeline ใหม่จากรายการ");
    if (ownerUserId && !r?.owner) throw fail("VALIDATION", "ไม่พบผู้ดูแลที่เลือกในร้านนี้ — เลือกผู้ดูแลใหม่จากรายการ");
  }
  return {
    from,
    to,
    lo: from ? thaiDayStart(from) : null,
    hi: to ? new Date(thaiDayStart(to).getTime() + 86_400_000) : null,
    teamId,
    pipelineId,
    ownerUserId,
  };
}

/** คอลัมน์อยู่ในหน้าต่างวันไทยของตัวกรอง (ไม่มีขอบ = TRUE · มีขอบกับคอลัมน์ NULL = ไม่เข้า) */
function per(col: string, f: Clean): Sql {
  const c = Prisma.raw(col);
  return Prisma.sql`(TRUE ${f.lo ? Prisma.sql`AND ${c} >= ${ts(f.lo)}` : Prisma.empty} ${f.hi ? Prisma.sql`AND ${c} < ${ts(f.hi)}` : Prisma.empty})`;
}
function dealBase(sc: Scope, f: Clean, a = "d"): Sql {
  const X = A(a);
  return Prisma.sql`${X}."tenantId" = ${sc.tenantId} AND ${X}."systemId" = ${sc.systemId} AND ${X}."archivedAt" IS NULL AND ${ownedScope(sc, a, true)}
    ${f.pipelineId ? Prisma.sql`AND ${X}."pipelineId" = ${f.pipelineId}` : Prisma.empty}
    ${f.teamId ? Prisma.sql`AND ${X}."teamId" = ${f.teamId}` : Prisma.empty}
    ${f.ownerUserId ? Prisma.sql`AND ${X}."ownerUserId" = ${f.ownerUserId}` : Prisma.empty}`;
}
/** ผู้ติดต่อ: ไม่ผูก pipeline (addendum ข้อ 3) · เก็บถาวร/ถูกรวมแล้วไม่นับ */
function contactBase(sc: Scope, f: Clean, a = "c"): Sql {
  const X = A(a);
  return Prisma.sql`${X}."tenantId" = ${sc.tenantId} AND ${X}."systemId" = ${sc.systemId} AND ${X}."archivedAt" IS NULL AND ${X}."mergedIntoId" IS NULL AND ${ownedScope(sc, a, false)}
    ${f.teamId ? Prisma.sql`AND ${X}."teamId" = ${f.teamId}` : Prisma.empty}
    ${f.ownerUserId ? Prisma.sql`AND ${X}."ownerUserId" = ${f.ownerUserId}` : Prisma.empty}`;
}
/** กิจกรรม: ตัวกรองทีม = ผู้ดูแลเป็นสมาชิกของทีมนั้น · ไม่ผูก pipeline */
function activityBase(sc: Scope, f: Clean, a = "a"): Sql {
  const X = A(a);
  return Prisma.sql`${X}."tenantId" = ${sc.tenantId} AND ${X}."systemId" = ${sc.systemId} AND ${activityScope(sc, a)}
    ${f.teamId ? Prisma.sql`AND ${X}."ownerUserId" IN (SELECT tm."userId" FROM "TeamMember" tm WHERE tm."tenantId" = ${sc.tenantId} AND tm."teamId" = ${f.teamId})` : Prisma.empty}
    ${f.ownerUserId ? Prisma.sql`AND ${X}."ownerUserId" = ${f.ownerUserId}` : Prisma.empty}`;
}

/**
 * N4: คอมมิชชันต่อคน — งวดตาม `periodKey` (เดือน ค.ศ. "YYYY-MM" ตามธรรมเนียม C3.3) ระหว่างเดือนไทยของ from/to (ไม่ใช่ createdAt) ·
 * LEFT JOIN ดีล ⇒ ค่าคอมของดีลที่ถูกเก็บถาวร/ลบแล้ว (ไม่มี FK — R schema C3.0) ยังนับให้คนนั้น · ขอบเขต = ตัวคน (ผู้รับค่าคอม) ตามระดับรายงาน ·
 * ตัวกรอง pipeline ผูกกับดีล (ดีลหายไปแล้ว = ไม่เข้า) · ตัวกรองทีม = ผู้รับเป็นสมาชิกทีม · ตัวกรองผู้ดูแล = ผู้รับคนนั้น
 */
function commissionBase(sc: Scope, f: Clean): Sql {
  const parts: Sql[] = [Prisma.sql`cc."tenantId" = ${sc.tenantId}`, Prisma.sql`cc."systemId" = ${sc.systemId}`];
  if (sc.level === "OWN") parts.push(Prisma.sql`cc."userId" = ${sc.me}`);
  else if (sc.level === "TEAM") parts.push(Prisma.sql`cc."userId" = ANY(${sc.mates}::text[])`);
  else if (sc.allowedTeams !== null) parts.push(Prisma.sql`(d."id" IS NULL OR ${teamOk("d", sc.allowedTeams)})`);
  if (sc.keyTeams.length) parts.push(Prisma.sql`cc."userId" = ANY(${sc.keyTeamMembers}::text[])`);
  if (sc.keyOwners.length) parts.push(Prisma.sql`cc."userId" = ANY(${sc.keyOwners}::text[])`);
  if (f.pipelineId) parts.push(Prisma.sql`d."pipelineId" = ${f.pipelineId}`);
  if (f.teamId) parts.push(Prisma.sql`cc."userId" IN (SELECT tm."userId" FROM "TeamMember" tm WHERE tm."tenantId" = ${sc.tenantId} AND tm."teamId" = ${f.teamId})`);
  if (f.ownerUserId) parts.push(Prisma.sql`cc."userId" = ${f.ownerUserId}`);
  if (f.from) parts.push(Prisma.sql`cc."periodKey" >= ${f.from.slice(0, 7)}`);
  if (f.to) parts.push(Prisma.sql`cc."periodKey" <= ${f.to.slice(0, 7)}`);
  return andSql(parts);
}

/** มูลค่าที่ชนะ (R-E.7) · ถ่วงน้ำหนัก (สูตรเดียวกับ deals.forecast) */
const WONV = Prisma.raw(`COALESCE(d."wonValueSatang", d."valueSatang"::bigint)`);
const WEIGHT = Prisma.raw(`round(d."valueSatang"::numeric * COALESCE(d."probabilityOverride", s."probability") / 100)`);

async function userLabels(ids: string[]): Promise<Map<string, string>> {
  const real = ids.filter((x) => x && x !== REPORT_NONE_KEY);
  if (!real.length) return new Map();
  const rows = await prisma.$queryRaw<{ id: string; name: string | null }[]>`SELECT "id", "name" FROM "User" WHERE "id" = ANY(${real}::text[]) LIMIT 2000`;
  return new Map(rows.map((u) => [u.id, (u.name ?? "").trim() || "พนักงาน (ยังไม่ตั้งชื่อ)"]));
}

// ───────────────────────── 8 แท็บ (ตัวทำงานภายใน — รับขอบเขตที่ resolve แล้ว) ─────────────────────────

type Run = { sys: Sys; actor: Actor; sc: Scope; f: Clean };

async function overviewOf({ sc, f }: Run): Promise<OverviewReport> {
  // 🔴 คำสั่งเดียว 4 ส่วน (ดีล · รับชำระ · กิจกรรม · lead ใหม่) — ด่านนับคิวรีของใบ (≤ 12 ต่อ overview)
  const [r] = await prisma.$queryRaw<Record<string, bigint | number | null>[]>`
    SELECT dd.*, pp."paid", aa."acts", cc."leads" FROM
      (SELECT count(*) FILTER (WHERE d."kind" = 'OPEN')::int AS "openDeals",
              COALESCE(sum(d."valueSatang") FILTER (WHERE d."kind" = 'OPEN'), 0)::bigint AS "openValue",
              COALESCE(sum(${WEIGHT}) FILTER (WHERE d."kind" = 'OPEN' AND d."forecastCategory" <> 'OMITTED'), 0)::bigint AS "weighted",
              count(*) FILTER (WHERE d."kind" = 'WON' AND ${per('d."closedAt"', f)})::int AS "wonDeals",
              COALESCE(sum(${WONV}) FILTER (WHERE d."kind" = 'WON' AND ${per('d."closedAt"', f)}), 0)::bigint AS "wonValue",
              count(*) FILTER (WHERE d."kind" = 'LOST' AND ${per('d."closedAt"', f)})::int AS "lostDeals"
         FROM "CrmDeal" d JOIN "CrmStage" s ON s."id" = d."stageId" WHERE ${dealBase(sc, f)}) dd,
      (SELECT COALESCE(sum(p."satang"), 0)::bigint AS "paid" FROM "CrmDealPayment" p JOIN "CrmDeal" d ON d."id" = p."dealId"
        WHERE ${dealBase(sc, f)} AND p."status" = 'COUNTED' AND ${per('p."countedAt"', f)}) pp,
      (SELECT count(*)::int AS "acts" FROM "CrmActivity" a WHERE ${activityBase(sc, f)} AND a."doneAt" IS NOT NULL AND ${per('a."doneAt"', f)}) aa,
      (SELECT count(*)::int AS "leads" FROM "CrmContact" c WHERE ${contactBase(sc, f)} AND ${per('c."createdAt"', f)}) cc`;
  const won = toNum(r?.wonDeals);
  const lost = toNum(r?.lostDeals);
  const wonV = toNum(r?.wonValue);
  return {
    openDeals: toNum(r?.openDeals),
    openValueSatang: toNum(r?.openValue),
    weightedSatang: toNum(r?.weighted),
    wonDeals: won,
    wonValueSatang: wonV,
    lostDeals: lost,
    winRatePct: pct1(won, won + lost),
    avgWonSatang: won > 0 ? Math.round(wonV / won) : null,
    paidSatang: toNum(r?.paid),
    activitiesDone: toNum(r?.acts),
    newLeads: toNum(r?.leads),
  };
}

function groupByOf(v: unknown): ForecastGroupBy {
  return (FORECAST_GROUP_BYS as readonly string[]).includes(String(v)) ? (v as ForecastGroupBy) : "month";
}

async function forecastOf({ sys, sc, f }: Run, groupBy: ForecastGroupBy): Promise<ForecastReport> {
  // กลุ่มเลือกจากรายการตายตัว (ไม่มีค่าจากผู้ใช้แทรกลงคำสั่ง) · เดือน = เดือนไทยของ expectedCloseAt (เปิด) / closedAt (ชนะ)
  const keyOpen =
    groupBy === "month" ? Prisma.raw(`COALESCE(to_char(d."expectedCloseAt" + interval '7 hours', 'YYYY-MM'), '${REPORT_NONE_KEY}')`)
      : groupBy === "owner" ? Prisma.raw(`COALESCE(d."ownerUserId", '${REPORT_NONE_KEY}')`)
        : Prisma.raw(`COALESCE(d."teamId", '${REPORT_NONE_KEY}')`);
  const keyWon = groupBy === "month" ? Prisma.raw(`to_char(d."closedAt" + interval '7 hours', 'YYYY-MM')`) : keyOpen;
  const rows = await prisma.$queryRaw<{ k: string; n: number; pipe: bigint; best: bigint; com: bigint; w: bigint; closed: bigint }[]>`
    WITH o AS (
      SELECT ${keyOpen} AS k, count(*)::int AS n, COALESCE(sum(d."valueSatang"), 0)::bigint AS pipe,
             COALESCE(sum(d."valueSatang") FILTER (WHERE d."forecastCategory" IN ('BEST_CASE', 'COMMIT')), 0)::bigint AS best,
             COALESCE(sum(d."valueSatang") FILTER (WHERE d."forecastCategory" = 'COMMIT'), 0)::bigint AS com,
             COALESCE(sum(${WEIGHT}), 0)::bigint AS w
        FROM "CrmDeal" d JOIN "CrmStage" s ON s."id" = d."stageId"
       WHERE ${dealBase(sc, f)} AND d."kind" = 'OPEN' AND d."forecastCategory" <> 'OMITTED' AND ${per('d."expectedCloseAt"', f)} GROUP BY 1
    ), c AS (
      SELECT ${keyWon} AS k, COALESCE(sum(${WONV}), 0)::bigint AS closed FROM "CrmDeal" d
       WHERE ${dealBase(sc, f)} AND d."kind" = 'WON' AND d."closedAt" IS NOT NULL AND ${per('d."closedAt"', f)} GROUP BY 1
    )
    SELECT COALESCE(o.k, c.k) AS k, COALESCE(o.n, 0)::int AS n, COALESCE(o.pipe, 0)::bigint AS pipe, COALESCE(o.best, 0)::bigint AS best,
           COALESCE(o.com, 0)::bigint AS com, COALESCE(o.w, 0)::bigint AS w, COALESCE(c.closed, 0)::bigint AS closed
      FROM o FULL OUTER JOIN c ON c.k = o.k`;
  const keys = rows.map((r) => String(r.k));
  let labels = new Map<string, string>();
  if (groupBy === "owner") labels = await userLabels(keys);
  if (groupBy === "team") {
    const real = keys.filter((k) => k !== REPORT_NONE_KEY);
    const teams = real.length ? await prisma.$queryRaw<{ id: string; name: string }[]>`SELECT "id", "name" FROM "Team" WHERE "tenantId" = ${sys.tenantId} AND "id" = ANY(${real}::text[]) LIMIT 1000` : [];
    labels = new Map(teams.map((t) => [t.id, t.name]));
  }
  const out: ForecastRow[] = rows.map((r) => {
    const key = String(r.k);
    return {
      key,
      label:
        groupBy === "month" ? thaiMonthLabel(key)
          : key === REPORT_NONE_KEY ? (groupBy === "owner" ? "ยังไม่มีผู้ดูแล" : "ไม่มีทีม")
            : (labels.get(key) ?? "ไม่ทราบชื่อ"),
      deals: toNum(r.n),
      pipelineSatang: toNum(r.pipe),
      bestCaseSatang: toNum(r.best),
      commitSatang: toNum(r.com),
      weightedSatang: toNum(r.w),
      closedSatang: toNum(r.closed),
      // ตัวยึดที่ (addendum ข้อ 6): โควตามากับใบ C3.2
      quotaSatang: null,
    };
  });
  out.sort((x, y) =>
    x.key === REPORT_NONE_KEY ? 1 : y.key === REPORT_NONE_KEY ? -1
      : groupBy === "month" ? x.key.localeCompare(y.key)
        : y.pipelineSatang - x.pipelineSatang || y.closedSatang - x.closedSatang || x.key.localeCompare(y.key),
  );
  return { groupBy, rows: out };
}

async function funnelOf({ sys, sc, f }: Run): Promise<FunnelReport> {
  const pipe = f.pipelineId
    ? await prisma.crmPipeline.findFirst({ where: { id: f.pipelineId, tenantId: sys.tenantId, systemId: sys.systemId }, select: { id: true, name: true } })
    : await prisma.crmPipeline.findFirst({
        where: { tenantId: sys.tenantId, systemId: sys.systemId, archivedAt: null },
        orderBy: [{ isDefault: "desc" }, { sortOrder: "asc" }, { createdAt: "asc" }, { id: "asc" }],
        select: { id: true, name: true },
      });
  if (!pipe) return { pipelineId: null, pipelineName: null, stages: [] };
  // ขั้น OPEN + WON ตามลำดับ (ขั้นแพ้อยู่แท็บเหตุผลแพ้) + ตัวเลขจาก CrmDealStageHistory ในคำสั่งเดียว
  const rows = await prisma.$queryRaw<{ id: string; name: string; kind: string; entered: number | null; lft: number | null; avgsec: number | null }[]>`
    WITH st AS (
      SELECT "id", "name", "kind"::text AS kind, "sortOrder" FROM "CrmStage" WHERE "pipelineId" = ${pipe.id} AND "kind"::text IN ('OPEN', 'WON')
    ), agg AS (
      SELECT h."toStageId" AS sid, count(DISTINCT h."dealId")::int AS entered,
             count(DISTINCT h."dealId") FILTER (WHERE h."leftAt" IS NOT NULL)::int AS lft,
             (avg(COALESCE(h."durationSec"::float8, extract(epoch FROM (h."leftAt" - h."enteredAt")))) FILTER (WHERE h."leftAt" IS NOT NULL))::float8 AS avgsec
        FROM "CrmDealStageHistory" h JOIN "CrmDeal" d ON d."id" = h."dealId"
       WHERE h."tenantId" = ${sys.tenantId} AND h."toStageId" IN (SELECT "id" FROM st) AND ${dealBase(sc, f)} AND ${per('h."enteredAt"', f)}
       GROUP BY 1
    )
    SELECT st."id", st."name", st.kind, agg.entered, agg.lft, agg.avgsec FROM st LEFT JOIN agg ON agg.sid = st."id"
     ORDER BY st."sortOrder" ASC, st."id" ASC`;
  let prev: number | null = null;
  const stages: FunnelStageRow[] = rows.map((r, i) => {
    const entered = toNum(r.entered);
    const ratePct = i === 0 ? (entered > 0 ? 100 : null) : prev && prev > 0 ? pct1(entered, prev) : null;
    prev = entered;
    const avg = r.avgsec === null || r.avgsec === undefined ? null : Number(r.avgsec);
    return { stageId: r.id, name: r.name, kind: r.kind === "WON" ? "WON" : "OPEN", entered, left: toNum(r.lft), ratePct, avgDays: avg === null ? null : Math.round((avg / 86_400) * 10) / 10 };
  });
  return { pipelineId: pipe.id, pipelineName: pipe.name, stages };
}

async function repsOf({ sc, f }: Run): Promise<RepsReport> {
  // 🔴 แถวของทุกคนที่มีดีลในขอบเขต (แม้ช่วงนี้เป็นศูนย์) + คนที่มีกิจกรรม/รับชำระ/คอมมิชชันในช่วง — รวมในคำสั่งเดียว
  const rows = await prisma.$queryRaw<{ k: string; won: number; wonv: bigint; open: number; openv: bigint; lost: number; paid: bigint; acts: number; comm: bigint }[]>`
    WITH dd AS (
      SELECT COALESCE(d."ownerUserId", ${REPORT_NONE_KEY}) AS k,
             count(*) FILTER (WHERE d."kind" = 'WON' AND ${per('d."closedAt"', f)})::int AS won,
             COALESCE(sum(${WONV}) FILTER (WHERE d."kind" = 'WON' AND ${per('d."closedAt"', f)}), 0)::bigint AS wonv,
             count(*) FILTER (WHERE d."kind" = 'OPEN')::int AS open,
             COALESCE(sum(d."valueSatang") FILTER (WHERE d."kind" = 'OPEN'), 0)::bigint AS openv,
             count(*) FILTER (WHERE d."kind" = 'LOST' AND ${per('d."closedAt"', f)})::int AS lost
        FROM "CrmDeal" d WHERE ${dealBase(sc, f)} GROUP BY 1
    ), pp AS (
      SELECT COALESCE(d."ownerUserId", ${REPORT_NONE_KEY}) AS k, COALESCE(sum(p."satang"), 0)::bigint AS paid
        FROM "CrmDealPayment" p JOIN "CrmDeal" d ON d."id" = p."dealId"
       WHERE ${dealBase(sc, f)} AND p."status" = 'COUNTED' AND ${per('p."countedAt"', f)} GROUP BY 1
    ), aa AS (
      SELECT a."ownerUserId" AS k, count(*)::int AS acts FROM "CrmActivity" a
       WHERE ${activityBase(sc, f)} AND a."ownerUserId" IS NOT NULL AND a."doneAt" IS NOT NULL AND ${per('a."doneAt"', f)} GROUP BY 1
    ), cm AS (
      SELECT cc."userId" AS k, COALESCE(sum(cc."amountSatang"), 0)::bigint AS comm
        FROM "CrmCommission" cc LEFT JOIN "CrmDeal" d ON d."id" = cc."dealId"
       WHERE ${commissionBase(sc, f)} AND cc."status"::text NOT IN ('REVERSED', 'REJECTED') GROUP BY 1
    ), ks AS (SELECT k FROM dd UNION SELECT k FROM pp UNION SELECT k FROM aa UNION SELECT k FROM cm)
    SELECT ks.k, COALESCE(dd.won, 0)::int AS won, COALESCE(dd.wonv, 0)::bigint AS wonv, COALESCE(dd.open, 0)::int AS open,
           COALESCE(dd.openv, 0)::bigint AS openv, COALESCE(dd.lost, 0)::int AS lost, COALESCE(pp.paid, 0)::bigint AS paid,
           COALESCE(aa.acts, 0)::int AS acts, COALESCE(cm.comm, 0)::bigint AS comm
      FROM ks LEFT JOIN dd ON dd.k = ks.k LEFT JOIN pp ON pp.k = ks.k LEFT JOIN aa ON aa.k = ks.k LEFT JOIN cm ON cm.k = ks.k
     LIMIT 2000`;
  const labels = await userLabels(rows.map((r) => r.k));
  const out: RepRow[] = rows.map((r) => ({
    key: r.k,
    label: r.k === REPORT_NONE_KEY ? "ยังไม่มีผู้ดูแล" : (labels.get(r.k) ?? "ไม่ทราบชื่อ"),
    wonDeals: toNum(r.won),
    wonValueSatang: toNum(r.wonv),
    openDeals: toNum(r.open),
    openValueSatang: toNum(r.openv),
    lostDeals: toNum(r.lost),
    paidSatang: toNum(r.paid),
    activitiesDone: toNum(r.acts),
    commissionSatang: toNum(r.comm),
    // ตัวยึดที่ (addendum ข้อ 6): โควตา/% ของโควตามากับใบ C3.2
    quotaSatang: null,
    attainmentPct: null,
  }));
  out.sort((x, y) => y.wonValueSatang - x.wonValueSatang || y.openValueSatang - x.openValueSatang || x.key.localeCompare(y.key));
  return { rows: out };
}

async function activitiesOf({ sc, f }: Run): Promise<ActivitiesReport> {
  const rows = await prisma.$queryRaw<{ k: string; t: string; done: number; open: number; secs: bigint }[]>`
    SELECT a."ownerUserId" AS k, a."type"::text AS t,
           count(*) FILTER (WHERE a."doneAt" IS NOT NULL AND ${per('a."doneAt"', f)})::int AS done,
           count(*) FILTER (WHERE a."doneAt" IS NULL)::int AS open,
           COALESCE(sum(a."durationSec") FILTER (WHERE a."doneAt" IS NOT NULL AND ${per('a."doneAt"', f)}), 0)::bigint AS secs
      FROM "CrmActivity" a WHERE ${activityBase(sc, f)} AND a."ownerUserId" IS NOT NULL GROUP BY 1, 2 LIMIT 20000`;
  const by = new Map<string, ActivityRow>();
  const seen = new Set<string>();
  for (const r of rows) {
    const x = by.get(r.k) ?? { key: r.k, label: "", done: 0, open: 0, calls: 0, callSeconds: 0, byType: {} };
    const done = toNum(r.done);
    x.done += done;
    x.open += toNum(r.open);
    if (r.t === "CALL") {
      x.calls += done;
      x.callSeconds += toNum(r.secs);
    }
    if (done > 0) {
      x.byType[r.t] = (x.byType[r.t] ?? 0) + done;
      seen.add(r.t);
    }
    by.set(r.k, x);
  }
  const labels = await userLabels([...by.keys()]);
  const out = [...by.values()].map((x) => ({ ...x, label: labels.get(x.key) ?? "ไม่ทราบชื่อ" }));
  out.sort((x, y) => y.done - x.done || y.open - x.open || x.key.localeCompare(y.key));
  const typeLabel = ACTIVITY_TYPE_LABEL as Record<string, string>;
  const types = [...(ACTIVITY_TYPES as readonly string[]).filter((t) => seen.has(t)), ...[...seen].filter((t) => !(ACTIVITY_TYPES as readonly string[]).includes(t))].map((t) => ({ key: t, label: typeLabel[t] ?? t }));
  return { rows: out, types };
}

async function lostOf({ sys, sc, f }: Run): Promise<LostReport> {
  const rows = await prisma.$queryRaw<{ k: string; n: number; v: bigint; label: string | null }[]>`
    SELECT g.k, g.n, g.v, r."label" FROM (
      SELECT COALESCE(d."lostReasonId", ${REPORT_NONE_KEY}) AS k, count(*)::int AS n, COALESCE(sum(d."valueSatang"), 0)::bigint AS v
        FROM "CrmDeal" d WHERE ${dealBase(sc, f)} AND d."kind" = 'LOST' AND ${per('d."closedAt"', f)} GROUP BY 1
    ) g LEFT JOIN "CrmLostReason" r ON r."id" = g.k AND r."tenantId" = ${sys.tenantId} AND r."systemId" = ${sys.systemId}
    ORDER BY g.n DESC, g.k ASC LIMIT 500`;
  const total = rows.reduce((s, r) => s + toNum(r.n), 0);
  return {
    total,
    valueSatang: rows.reduce((s, r) => s + toNum(r.v), 0),
    rows: rows.map((r) => ({
      key: r.k,
      label: r.k === REPORT_NONE_KEY ? "ไม่ระบุเหตุผล" : (r.label ?? "เหตุผลที่ถูกลบไปแล้ว"),
      deals: toNum(r.n),
      valueSatang: toNum(r.v),
      pct: pct1(toNum(r.n), total),
    })),
  };
}

async function sourcesOf({ sys, sc, f }: Run): Promise<SourcesReport> {
  // cohort = ผู้ติดต่อที่สร้างในช่วง · ที่มา = ของผู้ติดต่อ (ต้นทางของ lead — ดีลรับช่วงต่อ) · 3 มิติในคำสั่งเดียว
  const rows = await prisma.$queryRaw<{ dim: string; k: string; leads: number; deals: number; won: number; wonv: bigint }[]>`
    WITH cohort AS (
      SELECT c."id", COALESCE(c."sourceKind"::text, ${REPORT_NONE_KEY}) AS ks,
             COALESCE(c."sourceDetail"->>'campaignId', c."sourceDetail"->'utm'->>'campaign') AS kc,
             c."sourceDetail"->>'linkId' AS kl
        FROM "CrmContact" c WHERE ${contactBase(sc, f)} AND ${per('c."createdAt"', f)}
    ), dl AS (
      SELECT d."contactId", count(*)::int AS n, count(*) FILTER (WHERE d."kind" = 'WON')::int AS w,
             COALESCE(sum(${WONV}) FILTER (WHERE d."kind" = 'WON'), 0)::bigint AS wv
        FROM "CrmDeal" d WHERE ${dealBase(sc, f)} AND d."contactId" IN (SELECT "id" FROM cohort) GROUP BY 1
    ), j AS (
      SELECT cohort.*, COALESCE(dl.n, 0) AS n, COALESCE(dl.w, 0) AS w, COALESCE(dl.wv, 0) AS wv FROM cohort LEFT JOIN dl ON dl."contactId" = cohort."id"
    )
    (SELECT 'S' AS dim, ks AS k, count(*)::int AS leads, sum(n)::int AS deals, sum(w)::int AS won, sum(wv)::bigint AS wonv FROM j GROUP BY ks
      ORDER BY 3 DESC, 2 ASC LIMIT ${SOURCES_ROWS_PER_DIM})
    UNION ALL
    (SELECT 'C', kc, count(*)::int, sum(n)::int, sum(w)::int, sum(wv)::bigint FROM j WHERE kc IS NOT NULL GROUP BY kc
      ORDER BY 3 DESC, 2 ASC LIMIT ${SOURCES_ROWS_PER_DIM})
    UNION ALL
    (SELECT 'L', kl, count(*)::int, sum(n)::int, sum(w)::int, sum(wv)::bigint FROM j WHERE kl IS NOT NULL GROUP BY kl
      ORDER BY 3 DESC, 2 ASC LIMIT ${SOURCES_ROWS_PER_DIM})`;
  const row = (r: (typeof rows)[number], label: string): SourceRow => ({
    key: r.k,
    label,
    leads: toNum(r.leads),
    deals: toNum(r.deals),
    wonDeals: toNum(r.won),
    wonValueSatang: toNum(r.wonv),
    costSatang: null,
    roi: null,
  });
  const campKeys = rows.filter((r) => r.dim === "C").map((r) => r.k);
  const linkKeys = rows.filter((r) => r.dim === "L").map((r) => r.k);
  // ต้นทุนแคมเปญ = Σ CampaignVariantStat.costSatang เมื่อคีย์เป็นแคมเปญของร้านนี้ — ผ่าน facade การตลาด (มติผู้คุมงาน C3.1 ข้อ 4)
  //   โหลดแบบ lazy (facade การตลาดลากกราฟแคมเปญ/สมาชิก — ไม่ต้องโหลดตอน import โมดูล CRM)
  const camps: Map<string, { name: string; costSatang: number }> = campKeys.length
    ? await (await import("@/lib/modules/marketing")).campaignCostsByIds(sys.tenantId, campKeys)
    : new Map();
  const links = linkKeys.length
    ? await prisma.$queryRaw<{ id: string; name: string | null; code: string }[]>`
        SELECT "id", "name", "code" FROM "CrmTrackedLink" WHERE "tenantId" = ${sys.tenantId} AND "id" = ANY(${linkKeys}::text[]) LIMIT 1000`
    : [];
  const linkBy = new Map(links.map((l) => [l.id, l]));
  const srcLabel = CONTACT_SOURCE_LABEL as Record<string, string>;
  const bySource: SourceRow[] = [];
  const byCampaign: SourceRow[] = [];
  const byLink: SourceRow[] = [];
  for (const r of rows) {
    if (r.dim === "S") bySource.push(row(r, r.k === REPORT_NONE_KEY ? "ไม่ระบุที่มา" : (srcLabel[r.k] ?? r.k)));
    else if (r.dim === "C") {
      const c = camps.get(r.k);
      // AUDIT-CLASS X6: คีย์แคมเปญมาจาก utm ของฟอร์มสาธารณะ (ผู้โจมตีกำหนดได้) — ส่งออกผ่าน csvRow เท่านั้น · ตัดความยาว
      const x = row(r, c ? c.name : r.k.slice(0, 120));
      if (c) {
        x.costSatang = c.costSatang;
        x.roi = x.costSatang > 0 ? Math.round((x.wonValueSatang / x.costSatang) * 100) / 100 : null;
      }
      byCampaign.push(x);
    } else {
      const l = linkBy.get(r.k);
      byLink.push(row(r, l ? (l.name?.trim() || l.code) : `ลิงก์ ${r.k.slice(-6)}`));
    }
  }
  const order = (x: SourceRow, y: SourceRow) => y.leads - x.leads || y.wonValueSatang - x.wonValueSatang || x.key.localeCompare(y.key);
  return { bySource: bySource.sort(order), byCampaign: byCampaign.sort(order), byLink: byLink.sort(order) };
}

async function scoresOf({ sc, f }: Run): Promise<ScoresReport> {
  const bands = await prisma.$queryRaw<{ k: string; n: number; avg: number | null; wo: number; ww: number }[]>`
    SELECT COALESCE(c."scoreBand"::text, ${REPORT_NONE_KEY}) AS k, count(*)::int AS n, avg(c."score")::float8 AS avg,
           count(*) FILTER (WHERE EXISTS (SELECT 1 FROM "CrmDeal" d WHERE d."contactId" = c."id" AND ${dealBase(sc, f)} AND d."kind" = 'OPEN'))::int AS wo,
           count(*) FILTER (WHERE EXISTS (SELECT 1 FROM "CrmDeal" d WHERE d."contactId" = c."id" AND ${dealBase(sc, f)} AND d."kind" = 'WON'))::int AS ww
      FROM "CrmContact" c WHERE ${contactBase(sc, f)} GROUP BY 1 LIMIT 10`;
  const rules = await prisma.$queryRaw<{ k: string; n: number; pts: bigint; name: string | null }[]>`
    SELECT g.k, g.n, g.pts, r."name" FROM (
      SELECT l."ruleId" AS k, count(*)::int AS n, COALESCE(sum(l."points"), 0)::bigint AS pts
        FROM "CrmScoreLog" l JOIN "CrmContact" c ON c."id" = l."contactId"
       WHERE ${contactBase(sc, f)} AND l."ruleId" IS NOT NULL AND ${per('l."createdAt"', f)} GROUP BY 1 ORDER BY 3 DESC, 1 ASC LIMIT 10
    ) g LEFT JOIN "CrmScoreRule" r ON r."id" = g.k AND r."tenantId" = ${sc.tenantId}
    ORDER BY g.pts DESC, g.k ASC`;
  const bandLabel = SCORE_BAND_LABELS as Record<string, string>;
  const rank: Record<string, number> = { HOT: 0, WARM: 1, COLD: 2 };
  return {
    bands: bands
      .map((b) => ({
        key: b.k,
        label: b.k === REPORT_NONE_KEY ? "ยังไม่จัดระดับ" : (bandLabel[b.k] ?? b.k),
        contacts: toNum(b.n),
        avgScore: b.avg === null || b.avg === undefined ? null : Math.round(Number(b.avg) * 10) / 10,
        withOpenDeal: toNum(b.wo),
        withWonDeal: toNum(b.ww),
      }))
      .sort((x, y) => (rank[x.key] ?? 9) - (rank[y.key] ?? 9)),
    topRules: rules.map((r) => ({ key: r.k, label: r.name ?? "กฎที่ถูกลบไปแล้ว", logs: toNum(r.n), points: toNum(r.pts) })),
  };
}

async function compute<T extends ReportTab>(run: Run, tab: T, extra: { groupBy?: unknown } = {}): Promise<ReportOf[T]> {
  const out: AnyReport =
    tab === "overview" ? await overviewOf(run)
      : tab === "forecast" ? await forecastOf(run, groupByOf(extra.groupBy))
        : tab === "funnel" ? await funnelOf(run)
          : tab === "reps" ? await repsOf(run)
            : tab === "activities" ? await activitiesOf(run)
              : tab === "lost" ? await lostOf(run)
                : tab === "sources" ? await sourcesOf(run)
                  : await scoresOf(run);
  return out as ReportOf[T];
}

/** ทางเข้า + ขอบเขต + ตัวกรอง ของทุกแท็บ (ระบบ → uiVersion → คีย์ → scope → ตัวกรอง) */
async function prepare(ctx: ReportsCtx, actor: Actor | null | undefined, filters: unknown): Promise<Run> {
  const e = await enter(ctx, actor, "crm.report.view");
  // AUDIT-CLASS X1: ขอบเขตรายงานจากโมดูลการมองเห็น (visibility.resolve) — ไม่มีตัวเลขใดนอกขอบเขตนี้
  const sc = await reportScope(e.sys, e.actor);
  const f = await cleanFilters(e.sys, filters);
  return { sys: e.sys, actor: e.actor, sc, f };
}

// ───────────────────────── ผิวสาธารณะ: 8 แท็บ + ตัวแจกงาน ─────────────────────────

export async function overview(ctx: ReportsCtx, actor: Actor, filters: ReportFilters = {}): Promise<OverviewReport> {
  return compute(await prepare(ctx, actor, filters), "overview");
}
export async function forecast(ctx: ReportsCtx, actor: Actor, filters: ForecastFilters = {}): Promise<ForecastReport> {
  return compute(await prepare(ctx, actor, stripGroupBy(filters)), "forecast", { groupBy: filters?.groupBy });
}
export async function funnel(ctx: ReportsCtx, actor: Actor, filters: ReportFilters = {}): Promise<FunnelReport> {
  return compute(await prepare(ctx, actor, filters), "funnel");
}
export async function reps(ctx: ReportsCtx, actor: Actor, filters: ReportFilters = {}): Promise<RepsReport> {
  return compute(await prepare(ctx, actor, filters), "reps");
}
export async function activities(ctx: ReportsCtx, actor: Actor, filters: ReportFilters = {}): Promise<ActivitiesReport> {
  return compute(await prepare(ctx, actor, filters), "activities");
}
export async function lostReasons(ctx: ReportsCtx, actor: Actor, filters: ReportFilters = {}): Promise<LostReport> {
  return compute(await prepare(ctx, actor, filters), "lost");
}
export async function sources(ctx: ReportsCtx, actor: Actor, filters: ReportFilters = {}): Promise<SourcesReport> {
  return compute(await prepare(ctx, actor, filters), "sources");
}
export async function scores(ctx: ReportsCtx, actor: Actor, filters: ReportFilters = {}): Promise<ScoresReport> {
  return compute(await prepare(ctx, actor, filters), "scores");
}

function stripGroupBy(f: unknown): unknown {
  if (!f || typeof f !== "object" || Array.isArray(f)) return f;
  const { groupBy: _g, ...rest } = f as Record<string, unknown>;
  void _g;
  return rest;
}

/**
 * ตัวแจกงานตัวเดียวของรายงาน (C3.4 `crm_reports` · งานส่งออก · ตัวส่งอีเมล) — ผลเท่ากับฟังก์ชันของแท็บนั้นทุกไบต์
 * แท็บที่ไม่รู้จัก = VALIDATION (หลังผ่านด่านระบบ/คีย์ — คนที่ไม่มีคีย์ได้ FORBIDDEN เสมอ)
 */
export async function getReport(ctx: ReportsCtx, actor: Actor, tab: ReportTab | string, filters: ForecastFilters = {}): Promise<AnyReport> {
  const run = await prepare(ctx, actor, stripGroupBy(filters));
  if (!isReportTab(tab)) throw fail("VALIDATION", TAB_MSG);
  return compute(run, tab, { groupBy: filters?.groupBy });
}

// ───────────────────────── CSV (AUDIT-CLASS X6: ทุกบรรทัดผ่าน csvRow · ไม่มี BOM ในผลของบริการ) ─────────────────────────

const REPS_HEADER = ["ผู้ดูแล", "ชนะ (ดีล)", "มูลค่าที่ชนะ (บาท)", "ดีลเปิด", "มูลค่าดีลเปิด (บาท)", "แพ้ (ดีล)", "รับชำระแล้ว (บาท)", "กิจกรรมที่ทำ", "คอมมิชชัน (บาท)", "โควตา (บาท)", "% ของโควตา"];

type CsvOut = { csv: string; rowCount: number };

/** ส่วนรายชื่อดีลของ forecast (ชื่อดีลที่ผู้ใช้ตั้งเอง = ช่องอันตรายของ X6) — อยู่ใน visibleWhere(DEAL) ของผู้ขอด้วย */
async function forecastDealLines(run: Run): Promise<string[]> {
  const { sc, f } = run;
  const rows = await prisma.$queryRaw<{ id: string; title: string; owner: string | null; stage: string; cat: string; v: bigint; closeAt: Date | null }[]>`
    SELECT d."id", d."title", u."name" AS owner, s."name" AS stage, d."forecastCategory"::text AS cat, d."valueSatang"::bigint AS v, d."expectedCloseAt" AS "closeAt"
      FROM "CrmDeal" d JOIN "CrmStage" s ON s."id" = d."stageId" LEFT JOIN "User" u ON u."id" = d."ownerUserId"
     WHERE ${dealBase(sc, f)} AND d."kind" = 'OPEN' AND d."forecastCategory" <> 'OMITTED' AND ${per('d."expectedCloseAt"', f)}
     ORDER BY d."expectedCloseAt" ASC NULLS LAST, d."id" ASC LIMIT ${REPORT_EXPORT_DEAL_ROWS_MAX}`;
  if (!rows.length) return [];
  // AUDIT-CLASS X1: ผู้ที่เห็น "ยอดรวม" ของทีมอื่น (report.all) ยังไม่เห็น "ชื่อดีล" ที่ visibleWhere(DEAL) ของเขาไม่ให้เห็น
  const visible = await prisma.crmDeal.findMany({
    where: { AND: [await visibleWhere(run.sys, run.actor, "DEAL"), { id: { in: rows.map((r) => r.id) } }] },
    select: { id: true },
    take: REPORT_EXPORT_DEAL_ROWS_MAX,
  });
  const ok = new Set(visible.map((x) => x.id));
  const catLabel = FORECAST_CATEGORY_LABEL as Record<string, string>;
  return rows
    .filter((r) => ok.has(r.id))
    .map((r) => csvRow([r.title, (r.owner ?? "").trim() || "ยังไม่มีผู้ดูแล", r.stage, catLabel[r.cat] ?? r.cat, baht(toNum(r.v)), r.closeAt ? thaiYmdOf(r.closeAt) : ""]));
}

async function toCsv(run: Run, tab: ReportTab, rep: AnyReport): Promise<CsvOut> {
  const lines: string[] = [];
  let rowCount = 0;
  const push = (cells: (string | number | null | undefined)[]) => {
    lines.push(csvRow(cells));
    rowCount += 1;
  };
  if (tab === "overview") {
    const o = rep as OverviewReport;
    lines.push(csvRow(["ดีลเปิด", "มูลค่าดีลเปิด (บาท)", "มูลค่าถ่วงน้ำหนัก (บาท)", "ชนะ (ดีล)", "มูลค่าที่ชนะ (บาท)", "แพ้ (ดีล)", "อัตราชนะ (%)", "มูลค่าเฉลี่ยต่อดีลที่ชนะ (บาท)", "รับชำระแล้ว (บาท)", "กิจกรรมที่ทำ", "lead ใหม่"]));
    push([o.openDeals, baht(o.openValueSatang), baht(o.weightedSatang), o.wonDeals, baht(o.wonValueSatang), o.lostDeals, o.winRatePct, baht(o.avgWonSatang), baht(o.paidSatang), o.activitiesDone, o.newLeads]);
  } else if (tab === "forecast") {
    const fc = rep as ForecastReport;
    const head = fc.groupBy === "month" ? "เดือน" : fc.groupBy === "owner" ? "ผู้ดูแล" : "ทีม";
    lines.push(csvRow([head, "ดีล", "Pipeline (บาท)", "Best case (บาท)", "Commit (บาท)", "ถ่วงน้ำหนัก (บาท)", "Closed (บาท)", "โควตา (บาท)"]));
    for (const r of fc.rows) push([r.label, r.deals, baht(r.pipelineSatang), baht(r.bestCaseSatang), baht(r.commitSatang), baht(r.weightedSatang), baht(r.closedSatang), baht(r.quotaSatang)]);
    const deals = await forecastDealLines(run);
    lines.push("");
    lines.push(csvRow(["ชื่อดีล", "ผู้ดูแล", "ขั้น", "หมวดพยากรณ์", "มูลค่า (บาท)", "วันที่คาดว่าจะปิด"]));
    lines.push(...deals);
  } else if (tab === "funnel") {
    const fn = rep as FunnelReport;
    lines.push(csvRow(["ขั้น", "ชนิด", "เข้าขั้น (ดีล)", "ออกจากขั้น (ดีล)", "อัตรา (%)", "วันเฉลี่ยต่อขั้น"]));
    for (const s of fn.stages) push([s.name, s.kind === "WON" ? "ปิดชนะ" : "เปิด", s.entered, s.left, s.ratePct, s.avgDays]);
  } else if (tab === "reps") {
    lines.push(csvRow(REPS_HEADER));
    for (const r of (rep as RepsReport).rows)
      push([r.label, r.wonDeals, baht(r.wonValueSatang), r.openDeals, baht(r.openValueSatang), r.lostDeals, baht(r.paidSatang), r.activitiesDone, baht(r.commissionSatang), baht(r.quotaSatang), r.attainmentPct]);
  } else if (tab === "activities") {
    const ac = rep as ActivitiesReport;
    lines.push(csvRow(["ผู้ดูแล", "ทำแล้ว", "ค้างอยู่", "โทร (ครั้ง)", "เวลาโทรรวม (วินาที)", ...ac.types.map((t) => t.label)]));
    for (const r of ac.rows) push([r.label, r.done, r.open, r.calls, r.callSeconds, ...ac.types.map((t) => r.byType[t.key] ?? 0)]);
  } else if (tab === "lost") {
    const lo = rep as LostReport;
    lines.push(csvRow(["เหตุผลที่แพ้", "ดีล", "มูลค่า (บาท)", "สัดส่วน (%)"]));
    for (const r of lo.rows) push([r.label, r.deals, baht(r.valueSatang), r.pct]);
    lines.push(csvRow(["รวม", lo.total, baht(lo.valueSatang), lo.total > 0 ? 100 : null]));
  } else if (tab === "sources") {
    const so = rep as SourcesReport;
    lines.push(csvRow(["มิติ", "ที่มา", "lead", "ดีล", "ชนะ (ดีล)", "มูลค่าที่ชนะ (บาท)", "ต้นทุน (บาท)", "ROI (เท่า)"]));
    for (const [dim, list] of [["ที่มา", so.bySource], ["แคมเปญ", so.byCampaign], ["ลิงก์ติดตาม", so.byLink]] as [string, SourceRow[]][])
      for (const r of list) push([dim, r.label, r.leads, r.deals, r.wonDeals, baht(r.wonValueSatang), baht(r.costSatang), r.roi]);
  } else {
    const sc = rep as ScoresReport;
    lines.push(csvRow(["ระดับคะแนน", "ผู้ติดต่อ", "คะแนนเฉลี่ย", "มีดีลเปิด", "มีดีลที่ชนะ"]));
    for (const b of sc.bands) push([b.label, b.contacts, b.avgScore, b.withOpenDeal, b.withWonDeal]);
    if (sc.topRules.length) {
      lines.push("");
      lines.push(csvRow(["กฎให้คะแนน", "จำนวนครั้ง", "คะแนนรวม"]));
      for (const r of sc.topRules) push([r.label, r.logs, r.points]);
    }
  }
  return { csv: `${lines.join("\r\n")}\r\n`, rowCount };
}

const exportFilename = (tab: ReportTab, day: string) => `crm-report-${tab}-${day.replace(/-/g, "")}.csv`;

// ───────────────────────── ส่งออก = งาน async เสมอ (addendum ข้อ 7) ─────────────────────────

/**
 * ขอส่งออกแท็บหนึ่งเป็น CSV — เขียนแถว `CrmImportJob` kind REPORT_EXPORT (QUEUED) + audit `crm.report.export`
 * คำขอที่ผิด (แท็บ/วันที่/pipeline ของระบบอื่น) ถูกปฏิเสธ **ก่อน** เขียนอะไร (AUDIT-CLASS X6)
 */
export async function startExport(ctx: ReportsCtx, actor: Actor, input: { tab: ReportTab | string; filters?: ForecastFilters | null }): Promise<{ jobId: string; status: ReportExportStatus }> {
  const { sys, actor: a } = await enter(ctx, actor, "crm.report.view");
  // S2 (AUDIT-CLASS X2): ส่งออกเป็นของ "คน" เท่านั้น — คีย์ API ไม่มีตัวตนคงที่ให้ผูกผู้ขอ (createdById ของคีย์ = ผู้สร้างคีย์ ไม่ใช่ผู้เรียก)
  //   C3.8 (REST) ต้องสร้าง actor จากคีย์ใหม่ตอนรันและผูกงานกับ ApiKey.id ก่อนเปิดทางนี้
  if (isApiActor(a)) throw fail("FORBIDDEN", API_EXPORT_MSG);
  const tab = (input as { tab?: unknown } | null)?.tab;
  if (!isReportTab(tab)) throw fail("VALIDATION", TAB_MSG);
  const rawFilters = (input as { filters?: unknown } | null)?.filters ?? {};
  const f = await cleanFilters(sys, stripGroupBy(rawFilters));
  const groupBy = tab === "forecast" ? groupByOf((rawFilters as { groupBy?: unknown })?.groupBy) : null;
  const filters: Record<string, string> = {};
  for (const k of ["from", "to", "teamId", "pipelineId", "ownerUserId"] as const) if (f[k]) filters[k] = f[k] as string;
  const job = await prisma.crmImportJob.create({
    data: {
      tenantId: sys.tenantId,
      systemId: sys.systemId,
      kind: REPORT_EXPORT_KIND,
      status: "QUEUED",
      createdById: a.userId,
      // ตัวตนคงที่ของผู้ขอ = ชนิด USER + userId (getExport เทียบทั้งคู่ — ไม่มีทางที่คีย์ API ของผู้สร้างคีย์จะอ่านงานของคนได้)
      options: { tab, filters, requesterKind: "USER", requesterId: a.userId, ...(groupBy ? { groupBy } : {}) },
    },
    select: { id: true },
  });
  // AUDIT-CLASS X8: audit = รหัส + แท็บ + ตัวกรอง (id ล้วน) — ไม่มีข้อมูลบุคคล
  await writeAudit({ tenantId: sys.tenantId, actorId: a.userId, action: "crm.report.export", targetType: "CrmImportJob", targetId: job.id, after: { tab, filters, groupBy } });
  return { jobId: job.id, status: "QUEUED" };
}

/** actor ของพนักงานจาก Membership ปัจจุบัน (re-resolve ทุกครั้ง — ถูกเอาออกจากร้านแล้ว = null) */
async function staffActor(tenantId: string, userIds: string[]): Promise<Map<string, { actor: Actor; email: string | null }>> {
  if (!userIds.length) return new Map();
  const rows = await prisma.membership.findMany({
    where: { tenantId, userId: { in: userIds }, acceptedAt: { not: null } },
    select: { userId: true, role: true, unitAccess: true, permissions: true, user: { select: { email: true } } },
    take: 100,
  });
  return new Map(
    rows.map((m) => [
      m.userId,
      {
        actor: {
          userId: m.userId,
          role: m.role,
          unitAccess: Array.isArray(m.unitAccess) ? (m.unitAccess as string[]) : [],
          permissions: m.permissions && typeof m.permissions === "object" && !Array.isArray(m.permissions) ? (m.permissions as Record<string, unknown>) : {},
        },
        email: m.user?.email ?? null,
      },
    ]),
  );
}

type RunOpts = { now?: Date; tenantIds?: string[]; systemIds?: string[]; deadline?: number; signal?: AbortSignal };
const stopped = (o: RunOpts) => !!o.signal?.aborted || (typeof o.deadline === "number" && Date.now() >= o.deadline);
const clockOf = (now: unknown) => (now instanceof Date && !Number.isNaN(now.getTime()) ? now : new Date());

/**
 * AUDIT-CLASS X5: ทำงานส่งออกที่ค้าง — จองทีละแถวด้วย **lease** (RUNNING + leaseUntil = now + 15 นาที · ไม่ใช่สถานะปลายทาง)
 * ด้วย `FOR UPDATE SKIP LOCKED` ⇒ รอบที่ซ้อนกันกี่ตัวก็ทำงานละครั้งเดียว · โพรเซสตายหลังจอง = รอบหลัง lease หมดหยิบใหม่ได้ ·
 * จบแล้วเขียน DONE + ล้าง lease แบบมีเงื่อนไข (ต้องยังเป็น lease ของเรา) · ระบบรุ่น 1 ไม่ถูกหยิบ (R-E.14 — แถวคงอยู่)
 */
export async function runExportJobs(opts: RunOpts = {}): Promise<{ done: number; failed: number }> {
  const now = clockOf(opts?.now);
  const out = { done: 0, failed: 0 };
  const tenants = Array.isArray(opts?.tenantIds) ? opts.tenantIds.filter((x) => typeof x === "string") : null;
  const systems = Array.isArray(opts?.systemIds) ? opts.systemIds.filter((x) => typeof x === "string") : null;
  const t0 = Date.now();
  for (let i = 0; i < EXPORT_BATCH_MAX && !stopped(opts); i += 1) {
    // N6: นาฬิกาของการจองแต่ละครั้ง = now ของรอบ + เวลาจริงที่ผ่านไปในรอบนี้ (lease นับจาก "ตอนจอง" ไม่ใช่ตอนเริ่มรอบ)
    const claimNow = new Date(now.getTime() + (Date.now() - t0));
    const until = new Date(claimNow.getTime() + REPORT_LEASE_MS);
    const claimed = await prisma.$queryRaw<{ id: string; tenantId: string; systemId: string; createdById: string | null; options: unknown }[]>`
      UPDATE "CrmImportJob" j SET "status" = 'RUNNING', "leaseUntil" = ${ts(until)}, "startedAt" = COALESCE(j."startedAt", ${ts(claimNow)}), "updatedAt" = ${ts(claimNow)}
       WHERE j."id" = (
         SELECT x."id" FROM "CrmImportJob" x
          WHERE x."kind" = ${REPORT_EXPORT_KIND}
            AND (x."status" = 'QUEUED' OR (x."status" = 'RUNNING' AND (x."leaseUntil" IS NULL OR x."leaseUntil" <= ${ts(claimNow)})))
            ${tenants ? Prisma.sql`AND x."tenantId" = ANY(${tenants}::text[])` : Prisma.empty}
            ${systems ? Prisma.sql`AND x."systemId" = ANY(${systems}::text[])` : Prisma.empty}
            AND EXISTS (SELECT 1 FROM "AppSystem" s WHERE s."id" = x."systemId" AND s."type" = 'CRM' AND (s."settings"->'crm'->'uiVersion') = '2'::jsonb)
          ORDER BY x."createdAt" ASC, x."id" ASC
          LIMIT 1 FOR UPDATE SKIP LOCKED)
      RETURNING j."id", j."tenantId", j."systemId", j."createdById", j."options"`;
    const job = claimed[0];
    if (!job) break;
    const finish = async (data: Prisma.CrmImportJobUpdateManyMutationInput) =>
      (await prisma.crmImportJob.updateMany({ where: { id: job.id, status: "RUNNING", leaseUntil: until }, data: { ...data, leaseUntil: null, finishedAt: new Date() } })).count;
    try {
      const o = (job.options && typeof job.options === "object" && !Array.isArray(job.options) ? job.options : {}) as Record<string, unknown>;
      const tab = o.tab;
      if (!isReportTab(tab)) throw fail("VALIDATION", TAB_MSG);
      const who = (await staffActor(job.tenantId, job.createdById ? [job.createdById] : [])).get(job.createdById ?? "");
      if (!who) throw fail("FORBIDDEN", "ผู้ขอไฟล์นี้ไม่ได้เป็นพนักงานของร้านนี้แล้ว — ขอส่งออกใหม่จากบัญชีที่ยังใช้งานอยู่");
      const ctx = { tenantId: job.tenantId, systemId: job.systemId, actorUserId: who.actor.userId };
      const run = await prepare(ctx, who.actor, o.filters ?? {});
      const rep = await compute(run, tab, { groupBy: o.groupBy });
      const { csv, rowCount } = await toCsv(run, tab, rep);
      if (Buffer.byteLength(csv, "utf8") > EXPORT_CSV_MAX_BYTES) throw fail("VALIDATION", "ไฟล์ใหญ่เกินที่ส่งออกได้ในครั้งเดียว — กรองช่วงเวลา/ทีมให้แคบลงแล้วลองใหม่");
      const filename = exportFilename(tab, thaiYmdOf(now));
      const n = await finish({ status: "DONE", totalRows: rowCount, processedRows: rowCount, error: null, result: { tab, filename, rowCount, csv } });
      if (n > 0) out.done += 1;
    } catch (e) {
      // ทุก error ที่จับได้ = FAILED ทันที (ไม่ลองซ้ำ): ความผิดที่รู้จัก (แท็บ/ตัวกรอง/สิทธิ์/รุ่น 1) ได้ข้อความไทยของมัน ·
      //   error อื่น (เช่นฐานสะดุด) ได้ข้อความกลาง "กดส่งออกใหม่" — ผู้ใช้กดใหม่ได้เสมอ · โพรเซสที่ "ตาย" (ไม่ถึง catch) เท่านั้น
      //   ที่ถูกหยิบใหม่หลัง lease 15 นาทีหมด
      const known = e instanceof ReportsError || e instanceof CrmV2DisabledError;
      const msg = known ? (e as Error).message : "สร้างไฟล์ไม่สำเร็จเพราะระบบขัดข้องชั่วคราว — กดส่งออกใหม่อีกครั้ง";
      const n = await finish({ status: "FAILED", error: msg.slice(0, 500) }).catch(() => 0);
      if (n > 0) out.failed += 1;
    }
  }
  return out;
}

/** ผลของงานส่งออก — **เฉพาะผู้ขอ** (คนอื่น = NOT_FOUND) · ไม่มี URL ใด ๆ ใน DTO (AUDIT-CLASS X10: CSV ส่งถึงมือผู้ขอเท่านั้น) */
export async function getExport(ctx: ReportsCtx, actor: Actor, jobId: string): Promise<ReportExportDto> {
  const { sys, actor: a } = await enter(ctx, actor, "crm.report.view");
  if (isApiActor(a)) throw fail("FORBIDDEN", API_EXPORT_MSG);
  const id = str(jobId);
  const job = id
    ? await prisma.crmImportJob.findFirst({
        where: { id, tenantId: sys.tenantId, systemId: sys.systemId, kind: REPORT_EXPORT_KIND, createdById: a.userId },
        select: { id: true, status: true, options: true, result: true, totalRows: true, error: true },
      })
    : null;
  const o = (job?.options && typeof job.options === "object" && !Array.isArray(job.options) ? job.options : {}) as Record<string, unknown>;
  // S2: ผู้ขอต้องตรงทั้งชนิด (USER) และ userId — ไม่ใช่แค่ createdById
  if (!job || o.requesterKind !== "USER" || o.requesterId !== a.userId) throw fail("NOT_FOUND", "ไม่พบไฟล์ส่งออกนี้ (อาจเป็นของบัญชีอื่นหรือถูกล้างไปแล้ว) — กดส่งออกใหม่ได้เลย");
  const r = (job.result && typeof job.result === "object" && !Array.isArray(job.result) ? job.result : {}) as Record<string, unknown>;
  const status = (["QUEUED", "RUNNING", "DONE", "FAILED"].includes(job.status) ? job.status : "FAILED") as ReportExportStatus;
  return {
    jobId: job.id,
    tab: isReportTab(o.tab) ? o.tab : null,
    status,
    rowCount: job.totalRows,
    filename: typeof r.filename === "string" ? r.filename : null,
    csv: status === "DONE" && typeof r.csv === "string" ? r.csv : null,
    error: status === "FAILED" ? (job.error ?? "สร้างไฟล์ไม่สำเร็จ — กดส่งออกใหม่อีกครั้ง") : null,
  };
}

// ───────────────────────── ตารางเวลา: settings.crm.reportSchedules[] (R-E.6 · addendum ข้อ 9–10) ─────────────────────────

function parseSchedule(v: unknown): ReportSchedule | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const x = v as Record<string, unknown>;
  const id = str(x.id);
  if (!id || !isReportTab(x.tab) || !isReportFrequency(x.frequency)) return null;
  const f = (x.filters && typeof x.filters === "object" && !Array.isArray(x.filters) ? x.filters : {}) as Record<string, unknown>;
  const filters: ReportFilters = {};
  for (const k of ["teamId", "pipelineId", "ownerUserId"] as const) if (typeof f[k] === "string" && f[k]) filters[k] = f[k] as string;
  const n = (val: unknown, lo: number, hi: number) => (typeof val === "number" && Number.isInteger(val) && val >= lo && val <= hi ? val : lo);
  return {
    id,
    tab: x.tab,
    filters,
    frequency: x.frequency,
    weekday: n(x.weekday, 1, 7),
    dayOfMonth: n(x.dayOfMonth, 1, 28),
    recipientUserIds: Array.isArray(x.recipientUserIds) ? [...new Set(x.recipientUserIds.filter((u): u is string => typeof u === "string" && idOk(u)))].slice(0, REPORT_SCHEDULE_RECIPIENTS_MAX) : [],
    active: x.active !== false,
    createdById: typeof x.createdById === "string" ? x.createdById : null,
    createdAt: typeof x.createdAt === "string" ? x.createdAt : null,
  };
}

function schedulesOf(settings: unknown): ReportSchedule[] {
  const crm = settings && typeof settings === "object" && !Array.isArray(settings) ? (settings as Record<string, unknown>).crm : null;
  const arr = crm && typeof crm === "object" && !Array.isArray(crm) ? (crm as Record<string, unknown>).reportSchedules : null;
  return Array.isArray(arr) ? arr.map(parseSchedule).filter((s): s is ReportSchedule => !!s) : [];
}

/** ตารางเวลาของระบบนี้ — คีย์ `crm.report.all` (OWNER/MANAGER ปริยาย) */
export async function listSchedules(ctx: ReportsCtx, actor: Actor): Promise<{ schedules: ReportSchedule[] }> {
  const { sys } = await enter(ctx, actor, "crm.report.all");
  const row = await prisma.appSystem.findFirst({ where: { id: sys.systemId, tenantId: sys.tenantId, type: "CRM" }, select: { settings: true } });
  return { schedules: schedulesOf(row?.settings) };
}

/** ค่า `settings.crm.reportSchedules` ปัจจุบันในรูปอาร์เรย์เสมอ (ในคำสั่ง SQL) */
const SCHED_ARR = Prisma.raw(`(CASE WHEN jsonb_typeof("settings"->'crm'->'reportSchedules') = 'array' THEN "settings"->'crm'->'reportSchedules' ELSE '[]'::jsonb END)`);
/** เขียน `settings.crm.reportSchedules = <expr>` ด้วย jsonb_set **คำสั่งเดียว** (คีย์พี่น้องใน crm/settings รอดเสมอ · ไม่มี read-modify-write) */
const setSchedules = (expr: Sql): Sql => Prisma.sql`
  "settings" = jsonb_set(
    CASE WHEN jsonb_typeof("settings") = 'object' THEN "settings" ELSE '{}'::jsonb END,
    '{crm}',
    (CASE WHEN jsonb_typeof("settings"->'crm') = 'object' THEN "settings"->'crm' ELSE '{}'::jsonb END) || jsonb_build_object('reportSchedules', ${expr}),
    true)`;

/**
 * บันทึกตารางส่งรายงานทางอีเมล (สร้างใหม่ / แก้ตาม id) — คีย์ `crm.report.all` · ผู้รับ = user id ของพนักงานร้านนี้เท่านั้น (X8.2)
 * AUDIT-CLASS X6/X9: ตรวจทุกช่องก่อนเขียน (ไม่มีอะไรถูกเก็บเมื่อผิด) · audit `crm.report.schedule.save`
 */
export async function saveSchedule(ctx: ReportsCtx, actor: Actor, input: ReportScheduleInput): Promise<ReportSchedule> {
  const { sys, actor: a } = await enter(ctx, actor, "crm.report.all");
  const x = (input && typeof input === "object" && !Array.isArray(input) ? input : {}) as Record<string, unknown>;
  if (!isReportTab(x.tab)) throw fail("VALIDATION", TAB_MSG);
  if (!isReportFrequency(x.frequency)) throw fail("VALIDATION", "ความถี่ต้องเป็น ทุกวัน · ทุกสัปดาห์ · ทุกเดือน อย่างใดอย่างหนึ่ง");
  const intIn = (v: unknown, lo: number, hi: number, msg: string, dflt: number): number => {
    if (v === undefined || v === null) return dflt;
    if (typeof v !== "number" || !Number.isInteger(v) || v < lo || v > hi) throw fail("VALIDATION", msg);
    return v;
  };
  const weekday = intIn(x.weekday, 1, 7, "วันในสัปดาห์ต้องเป็น 1 (จันทร์) ถึง 7 (อาทิตย์)", 1);
  const dayOfMonth = intIn(x.dayOfMonth, 1, 28, "วันที่ของเดือนเลือกได้ 1–28 (เพื่อให้ทุกเดือนมีวันนั้นจริง)", 1);
  const rcp = Array.isArray(x.recipientUserIds) ? x.recipientUserIds : null;
  if (!rcp || rcp.length === 0) throw fail("VALIDATION", "เลือกผู้รับรายงานอย่างน้อย 1 คน");
  if (rcp.length > REPORT_SCHEDULE_RECIPIENTS_MAX) throw fail("VALIDATION", `ผู้รับต่อหนึ่งตารางได้ไม่เกิน ${REPORT_SCHEDULE_RECIPIENTS_MAX} คน`);
  // AUDIT-CLASS X8: ผู้รับเป็น "พนักงานของร้านนี้" เท่านั้น (id ผู้ใช้ — ไม่รับที่อยู่อีเมลดิบ · คนร้านอื่น/ไม่รู้จัก = ปฏิเสธทั้งชุด)
  const ids = [...new Set(rcp.map((u) => (typeof u === "string" ? u.trim() : "")))];
  const staffMsg = "ผู้รับรายงานต้องเป็นพนักงานของร้านนี้ — เลือกจากรายชื่อพนักงาน (ส่งไปที่อยู่อีเมลภายนอกไม่ได้)";
  if (ids.some((u) => !idOk(u))) throw fail("VALIDATION", staffMsg);
  const staff = await staffActor(sys.tenantId, ids);
  if (ids.some((u) => !staff.has(u))) throw fail("VALIDATION", staffMsg);
  // S5: ผู้รับที่ไม่มีคีย์ดูรายงาน = ไม่มีวันได้รับ (ตัวส่งข้าม) ⇒ ปฏิเสธตั้งแต่ตอนบันทึก ไม่ให้ตารางเงียบหาย
  const noKey = ids.filter((u) => !crmCan(staff.get(u)?.actor, "crm.report.view"));
  if (noKey.length) throw fail("VALIDATION", `ผู้รับ ${noKey.length} คนยังไม่มีสิทธิ์ "ดูรายงาน CRM" จึงรับรายงานไม่ได้ — เลือกเฉพาะพนักงานที่ดูรายงานได้ หรือให้เจ้าของร้านเปิดสิทธิ์ก่อน`);
  const f = await cleanFilters(sys, x.filters ?? {});
  const filters: ReportFilters = {};
  for (const k of ["teamId", "pipelineId", "ownerUserId"] as const) if (f[k]) filters[k] = f[k];
  const wantId = str(x.id);
  if (wantId && !idOk(wantId)) throw fail("NOT_FOUND", "ไม่พบตารางส่งรายงานนี้ (อาจถูกลบไปแล้ว) — รีเฟรชหน้าแล้วลองใหม่");
  const id = wantId || randomUUID();
  const patch = { tab: x.tab, filters, frequency: x.frequency, weekday, dayOfMonth, recipientUserIds: ids, active: x.active !== false };
  const fresh = { id, ...patch, createdById: a.userId, createdAt: new Date().toISOString() };
  const n = wantId
    ? await prisma.$executeRaw`
        UPDATE "AppSystem" SET ${setSchedules(Prisma.sql`(SELECT COALESCE(jsonb_agg(CASE WHEN e->>'id' = ${id} THEN e || ${JSON.stringify(patch)}::jsonb ELSE e END ORDER BY o), '[]'::jsonb) FROM jsonb_array_elements(${SCHED_ARR}) WITH ORDINALITY AS t(e, o))`)}
         WHERE "id" = ${sys.systemId} AND "tenantId" = ${sys.tenantId} AND "type" = 'CRM'
           AND EXISTS (SELECT 1 FROM jsonb_array_elements(${SCHED_ARR}) e WHERE e->>'id' = ${id})`
    : await prisma.$executeRaw`
        UPDATE "AppSystem" SET ${setSchedules(Prisma.sql`${SCHED_ARR} || jsonb_build_array(${JSON.stringify(fresh)}::jsonb)`)}
         WHERE "id" = ${sys.systemId} AND "tenantId" = ${sys.tenantId} AND "type" = 'CRM' AND jsonb_array_length(${SCHED_ARR}) < ${REPORT_SCHEDULES_MAX}`;
  if (n === 0) {
    if (wantId) throw fail("NOT_FOUND", "ไม่พบตารางส่งรายงานนี้ (อาจถูกลบไปแล้ว) — รีเฟรชหน้าแล้วลองใหม่");
    throw fail("VALIDATION", `ระบบนี้มีตารางส่งรายงานครบ ${REPORT_SCHEDULES_MAX} รายการแล้ว — ลบตารางที่ไม่ใช้ก่อนแล้วลองใหม่`);
  }
  await writeAudit({ tenantId: sys.tenantId, actorId: a.userId, action: "crm.report.schedule.save", targetType: "CrmReportSchedule", targetId: id, after: { tab: patch.tab, frequency: patch.frequency, weekday, dayOfMonth, recipients: ids.length, filters, created: !wantId } });
  const saved = (await listSchedules(ctx, a)).schedules.find((s) => s.id === id);
  return saved ?? { ...fresh, tab: x.tab, frequency: x.frequency as ReportScheduleFrequency, createdAt: fresh.createdAt };
}

/** ลบตารางส่งรายงาน (ลบเฉพาะรายการนั้น · คีย์พี่น้องรอด) + ล้างสถานะการส่งของตารางนั้น · audit `crm.report.schedule.delete` */
export async function deleteSchedule(ctx: ReportsCtx, actor: Actor, id: string): Promise<{ ok: true }> {
  const { sys, actor: a } = await enter(ctx, actor, "crm.report.all");
  const sid = str(id);
  const n = sid && idOk(sid)
    ? await prisma.$executeRaw`
        UPDATE "AppSystem" SET ${setSchedules(Prisma.sql`(SELECT COALESCE(jsonb_agg(e ORDER BY o), '[]'::jsonb) FROM jsonb_array_elements(${SCHED_ARR}) WITH ORDINALITY AS t(e, o) WHERE e->>'id' IS DISTINCT FROM ${sid})`)}
         WHERE "id" = ${sys.systemId} AND "tenantId" = ${sys.tenantId} AND "type" = 'CRM'
           AND EXISTS (SELECT 1 FROM jsonb_array_elements(${SCHED_ARR}) e WHERE e->>'id' = ${sid})`
    : 0;
  if (n === 0) throw fail("NOT_FOUND", "ไม่พบตารางส่งรายงานนี้ (อาจถูกลบไปแล้ว) — รีเฟรชหน้าแล้วลองใหม่");
  // N7: ล้างสถานะการส่งของตารางนี้ (คีย์ผูกร้าน + ระบบ + ตาราง — ไม่แตะของตารางอื่น)
  await prisma.opsAlertState.deleteMany({ where: { source: { startsWith: stateBase(sys, sid) } } });
  await writeAudit({ tenantId: sys.tenantId, actorId: a.userId, action: "crm.report.schedule.delete", targetType: "CrmReportSchedule", targetId: sid });
  return { ok: true };
}

// ───────────────────────── ตัวส่งตามกำหนด (งานรายวัน `crm.reports.scheduled`) ─────────────────────────

/** คำขอที่ส่งถึงตัวส่งอีเมล — ไม่มีข้อมูลลูกค้า (AUDIT-CLASS X8) · ที่อยู่ = User.email ของพนักงานผู้รับ */
export type ReportEmailRequest = {
  to: string;
  userId: string;
  scheduleId: string;
  slot: string;
  subject: string;
  html: string;
  attachments: { filename: string; content: string; contentType: string }[];
};
export type ReportDeps = { email?: (req: ReportEmailRequest) => Promise<{ ok: boolean }> };

/**
 * สถานะการส่งอยู่ในแถว `OpsAlertState` (แพตเทิร์นเดียวกับ lease ของ minute-jobs · ไม่มีตารางใหม่ · ไม่มี JSON รวมให้ทับกัน)
 * N7: คีย์ผูกร้าน + ระบบ + ตาราง ⇒ `crm.report.schedule:<tenantId>:<systemId>:<sid>:…`
 *   …:lease:<slot>  lastAlertAt = เวลาที่ lease หมด (ลบทิ้งเมื่อปล่อย)
 *   …:sent:<userId> lastAlertAt = ต้นช่องล่าสุดที่ส่งถึงคนนี้สำเร็จ (ครั้งเดียวต่อคนต่อช่อง)
 *   …:done          lastAlertAt = ต้นช่องล่าสุดที่ส่งครบทุกคนแล้ว (ใช้เรียงคิว "ค้างนานสุดก่อน" ด้วย — S1)
 *   …:warn          lastAlertAt = ต้นช่องล่าสุดที่เตือน OpsEvent เรื่องตัวกรองใช้ไม่ได้แล้ว (เตือนครั้งเดียวต่อช่อง)
 */
const STATE_PREFIX = "crm.report.schedule:";
const stateBase = (sys: Sys, sid: string) => `${STATE_PREFIX}${sys.tenantId}:${sys.systemId}:${sid}:`;
const leaseKey = (sys: Sys, sid: string, slot: string) => `${stateBase(sys, sid)}lease:${slot}`;
const sentKey = (sys: Sys, sid: string, uid: string) => `${stateBase(sys, sid)}sent:${uid}`;
const doneKey = (sys: Sys, sid: string) => `${stateBase(sys, sid)}done`;
const warnKey = (sys: Sys, sid: string) => `${stateBase(sys, sid)}warn`;

async function readStates(keys: string[]): Promise<Map<string, Date>> {
  const out = new Map<string, Date>();
  for (let i = 0; i < keys.length; i += 1000) {
    const chunk = keys.slice(i, i + 1000);
    const rows = await prisma.opsAlertState.findMany({ where: { source: { in: chunk } }, select: { source: true, lastAlertAt: true }, take: chunk.length });
    for (const r of rows) out.set(r.source, r.lastAlertAt);
  }
  return out;
}
/** ไม่ถอยหลัง: ต้นช่องใหม่กว่าเท่านั้นที่ทับได้ (รอบที่ตื่นช้าเขียนช่องเก่าทับช่องใหม่ไม่ได้) · คืนจำนวนแถวที่เปลี่ยน (0 = มีค่าเท่า/ใหม่กว่าอยู่แล้ว) */
async function markState(key: string, at: Date): Promise<number> {
  return prisma.$executeRaw`
    INSERT INTO "OpsAlertState" ("id", "source", "lastAlertAt") VALUES (${randomUUID()}, ${key}, ${ts(at)})
    ON CONFLICT ("source") DO UPDATE SET "lastAlertAt" = EXCLUDED."lastAlertAt" WHERE "OpsAlertState"."lastAlertAt" < EXCLUDED."lastAlertAt"`;
}

/**
 * AUDIT-CLASS X5: จอง (schedule, ช่อง) ด้วย lease 15 นาที — INSERT … ON CONFLICT DO UPDATE WHERE lease หมดแล้ว ในคำสั่งเดียว
 * ⇒ รอบที่ซ้อนกันชนะได้ตัวเดียว · ไม่มี "ส่งแล้ว" ล่วงหน้า (โพรเซสที่ตายกลางการส่ง = ช่องนี้ว่างอีกครั้งหลัง 15 นาที)
 */
async function claimSlot(sys: Sys, sid: string, slot: ReportSlot, now: Date): Promise<Date | null> {
  const until = new Date(now.getTime() + REPORT_LEASE_MS);
  const rows = await prisma.$queryRaw<{ n: number }[]>`
    INSERT INTO "OpsAlertState" ("id", "source", "lastAlertAt") VALUES (${randomUUID()}, ${leaseKey(sys, sid, slot.key)}, ${ts(until)})
    ON CONFLICT ("source") DO UPDATE SET "lastAlertAt" = EXCLUDED."lastAlertAt" WHERE "OpsAlertState"."lastAlertAt" <= ${ts(now)}
    RETURNING 1 AS n`;
  return rows.length ? until : null;
}
/** ปล่อย lease เฉพาะเมื่อยังเป็นของเรา (compare-and-delete ด้วยเวลาหมดอายุที่เราเขียน) — รอบที่ตื่นช้าไม่ไปลบ lease ของคนอื่น */
async function releaseSlot(sys: Sys, sid: string, slot: ReportSlot, until: Date): Promise<void> {
  await prisma.$executeRaw`DELETE FROM "OpsAlertState" WHERE "source" = ${leaseKey(sys, sid, slot.key)} AND "lastAlertAt" = ${ts(until)}`;
}

/** ตัวส่งจริงของแพลตฟอร์ม (โหลดแบบ dynamic — ไม่ลาก env เข้ากราฟของ facade) · ยังไม่เสียบคีย์อีเมล = ไม่ส่งและไม่โกหกว่าส่งแล้ว */
async function platformEmail(req: ReportEmailRequest): Promise<{ ok: boolean }> {
  const { emailEnabled } = await import("@/lib/env");
  if (!emailEnabled) return { ok: false };
  const { sendEmailRich } = await import("@/lib/core/email");
  // ชั้นส่งไฟล์ (เหมือนปุ่มดาวน์โหลด) เติม BOM ให้ Excel อ่านภาษาไทยถูก · ผลของบริการไม่มี BOM
  const r = await sendEmailRich({
    to: [req.to],
    subject: req.subject,
    html: req.html,
    attachments: req.attachments.map((x) => ({ filename: x.filename, contentType: x.contentType, content: Buffer.from(`\uFEFF${x.content}`, "utf8").toString("base64") })),
    idempotencyKey: `crm.report#${req.scheduleId}#${req.slot}#${req.userId}`,
  });
  return { ok: r.ok };
}

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);

type SchedOpts = RunOpts & { deps?: ReportDeps };

/**
 * ส่งรายงานตามตารางเวลาของทุกระบบ CRM รุ่น 2 (ตัวงานรายวัน `crm.reports.scheduled` — ชื่อ/รอบเดิมของ C2.10)
 * `now` = นาฬิกาเดียวของรอบ · ช่อง = วันไทย / สัปดาห์ ISO / เดือนไทย (พลาดแล้วตามส่งครั้งเดียวในช่องเดียวกัน)
 * AUDIT-CLASS X5: lease ต่อ (schedule, ช่อง) · ผู้รับได้ช่องละ 1 ฉบับ · ส่งไม่สำเร็จ = ปล่อย lease ให้รอบหลังในช่องเดียวกันลองใหม่
 * AUDIT-CLASS X8: ผู้รับ re-resolve จาก Membership ตอนส่ง (ออกจากร้าน/ไม่มีคีย์รายงาน = ข้าม) และแต่ละคนได้รายงาน
 *   ที่คำนวณด้วยขอบเขตของตัวเอง · ไม่มีข้อมูลลูกค้าในหัวเรื่อง/เนื้อความ/ไฟล์แนบ
 * R-E.14: ระบบรุ่น 1 ถูกข้ามทั้งระบบ (ตารางคงอยู่ · กลับเป็น 2 แล้วส่งต่อ)
 */
export async function runScheduled(opts: SchedOpts = {}): Promise<{ sent: number; skipped: number; failed: number }> {
  const now = clockOf(opts?.now);
  const out = { sent: 0, skipped: 0, failed: 0 };
  const send = opts?.deps?.email ?? platformEmail;
  const tenants = Array.isArray(opts?.tenantIds) ? opts.tenantIds.filter((x) => typeof x === "string") : null;
  const systems = Array.isArray(opts?.systemIds) ? opts.systemIds.filter((x) => typeof x === "string") : null;
  const rows = await prisma.$queryRaw<{ id: string; tenantId: string; s: unknown }[]>`
    SELECT "id", "tenantId", "settings"->'crm'->'reportSchedules' AS s FROM "AppSystem"
     WHERE "type" = 'CRM' AND ("settings"->'crm'->'uiVersion') = '2'::jsonb
       AND jsonb_typeof("settings"->'crm'->'reportSchedules') = 'array' AND jsonb_array_length("settings"->'crm'->'reportSchedules') > 0
       ${tenants ? Prisma.sql`AND "tenantId" = ANY(${tenants}::text[])` : Prisma.empty}
       ${systems ? Prisma.sql`AND "id" = ANY(${systems}::text[])` : Prisma.empty}
     LIMIT 5000`;
  const queue: { sys: Sys; sched: ReportSchedule }[] = [];
  for (const sysRow of rows) {
    const list = Array.isArray(sysRow.s) ? sysRow.s.map(parseSchedule).filter((x): x is ReportSchedule => !!x && x.active) : [];
    for (const sched of list) queue.push({ sys: { tenantId: sysRow.tenantId, systemId: sysRow.id }, sched });
  }
  // S1: คิว "ส่งครบล่าสุดเก่าที่สุดก่อน" (ยังไม่เคยส่ง = ก่อนสุด) — ไม่ใช่ตาม id ⇒ รอบที่ถูกตัดงบไม่ทำให้ร้านท้ายคิวอดตลอดไป
  //   รอบถัดไป (งานรายวัน หรือ `crm.reports.sweep` รายชั่วโมง) เริ่มจากตารางที่ค้างก่อนเสมอ
  const done = await readStates(queue.map((q) => doneKey(q.sys, q.sched.id)));
  const at = (q: { sys: Sys; sched: ReportSchedule }) => done.get(doneKey(q.sys, q.sched.id))?.getTime() ?? Number.NEGATIVE_INFINITY;
  //   ตารางที่ "เก่าเท่ากัน" (ธง done = ต้นช่องเดียวกัน) เรียงด้วยแฮชของ (id, วันไทย) ⇒ ลำดับหมุนทุกวัน ไม่มีร้านไหนอยู่ท้ายคิวถาวร
  const day = thaiYmdOf(now);
  const rot = new Map(queue.map((q) => [q.sched.id, createHash("sha1").update(`${q.sched.id}|${day}`).digest("hex")]));
  queue.sort((x, y) => at(x) - at(y) || (rot.get(x.sched.id) ?? "").localeCompare(rot.get(y.sched.id) ?? ""));
  for (const q of queue) {
    if (stopped(opts)) return out;
    try {
      await sendOne(q.sys, q.sched, now, send, opts, out, done.get(doneKey(q.sys, q.sched.id)) ?? null);
    } catch {
      // ตารางหนึ่งพังต้องไม่พาตารางอื่นล้ม — lease ของมันหมดเองใน 15 นาที
      out.failed += 1;
    }
  }
  return out;
}

async function sendOne(
  sys: Sys,
  sched: ReportSchedule,
  now: Date,
  send: NonNullable<ReportDeps["email"]>,
  opts: RunOpts,
  out: { sent: number; skipped: number; failed: number },
  done0: Date | null,
): Promise<void> {
  const slot = reportSlotOf(sched, now);
  if (now.getTime() < slot.trigger.getTime()) return;
  if (done0 && done0.getTime() >= slot.start.getTime()) return;
  const until = await claimSlot(sys, sched.id, slot, now);
  if (!until) {
    out.skipped += 1;
    return;
  }
  let allResolved = true;
  try {
    // อ่านสถานะซ้ำ **หลัง** จอง: รอบที่เพิ่งส่งเสร็จเขียน done ก่อนปล่อย lease เสมอ ⇒ ที่นี่เห็นแน่นอน
    const st = await readStates([doneKey(sys, sched.id), ...sched.recipientUserIds.map((u) => sentKey(sys, sched.id, u))]);
    const done = st.get(doneKey(sys, sched.id));
    if (done && done.getTime() >= slot.start.getTime()) return;
    const staff = await staffActor(sys.tenantId, sched.recipientUserIds);
    for (const uid of sched.recipientUserIds) {
      if (stopped(opts)) {
        allResolved = false;
        break;
      }
      const sentAt = st.get(sentKey(sys, sched.id, uid));
      if (sentAt && sentAt.getTime() >= slot.start.getTime()) continue;
      const who = staff.get(uid);
      // AUDIT-CLASS X8: ไม่ใช่พนักงานของร้านแล้ว / ไม่มีอีเมล / ไม่มีคีย์ดูรายงาน = ข้าม (ไม่ส่งออกนอกร้าน)
      if (!who || !who.email || !crmCan(who.actor, "crm.report.view")) {
        out.skipped += 1;
        continue;
      }
      let req: ReportEmailRequest;
      try {
        const run = await prepare({ ...sys, actorUserId: uid }, who.actor, { ...sched.filters, from: slot.periodFrom, to: slot.periodTo });
        const rep = await compute(run, sched.tab);
        const { csv, rowCount } = await toCsv(run, sched.tab, rep);
        const title = REPORT_TAB_TITLE[sched.tab];
        const period = periodLabel({ from: slot.periodFrom, to: slot.periodTo });
        req = {
          to: who.email,
          userId: uid,
          scheduleId: sched.id,
          slot: slot.key,
          // AUDIT-CLASS X6: หัวเรื่องประกอบจากป้ายตายตัวของระบบเท่านั้น (ไม่มี CR/LF · ไม่มีข้อมูลลูกค้า)
          subject: `รายงาน CRM · ${title} · ${slot.label}`.replace(/[\r\n]+/g, " "),
          html: `<p>รายงาน CRM ตามกำหนด — <b>${escapeHtml(title)}</b></p><p>ช่วงข้อมูล: ${escapeHtml(period)} · ${rowCount} แถว</p><p>ไฟล์ CSV แนบมากับอีเมลนี้ (เปิดด้วย Excel หรือ Google Sheets ได้) · ตัวเลขคำนวณตามสิทธิ์การมองเห็นของผู้รับ</p>`,
          attachments: [{ filename: exportFilename(sched.tab, slot.periodTo), content: csv, contentType: "text/csv; charset=utf-8" }],
        };
      } catch (e) {
        if (e instanceof ReportsError && e.code === "FORBIDDEN") {
          out.skipped += 1;
          continue;
        }
        out.failed += 1;
        allResolved = false;
        // N7: ตัวกรองที่ใช้ไม่ได้แล้ว (ทีม/pipeline ถูกลบ) = เตือน OpsEvent WARN **ครั้งเดียวต่อช่อง** (รหัสล้วน · ไม่มีข้อมูลบุคคล)
        //   แทนการล้มเงียบทุกวัน · ตารางยังอยู่ (เจ้าของร้านแก้ตัวกรองหรือลบเองได้)
        if (e instanceof ReportsError && e.code === "VALIDATION" && (await markState(warnKey(sys, sched.id), slot.start)) > 0) {
          await logOps("WARN", "crm.reports", `ตารางส่งรายงาน ${sched.id} ใช้ตัวกรองที่ไม่มีอยู่แล้ว — ช่อง ${slot.key} ไม่ถูกส่ง`, {
            tenantId: sys.tenantId,
            detail: JSON.stringify({ systemId: sys.systemId, scheduleId: sched.id, slot: slot.key, filters: sched.filters }),
          });
        }
        continue;
      }
      let ok = false;
      try {
        ok = (await send(req))?.ok === true;
      } catch {
        ok = false;
      }
      if (ok) {
        await markState(sentKey(sys, sched.id, uid), slot.start);
        out.sent += 1;
      } else {
        out.failed += 1;
        allResolved = false;
      }
    }
    // "ส่งครบช่องนี้แล้ว" เขียนก่อนปล่อย lease เสมอ (รอบถัดไปที่จองได้จะเห็นทันที) · ส่งไม่ครบ = ไม่เขียน (รอบหลังลองคนที่เหลือ)
    if (allResolved) await markState(doneKey(sys, sched.id), slot.start);
  } finally {
    await releaseSlot(sys, sched.id, slot, until).catch(() => undefined);
  }
}
