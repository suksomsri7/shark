// visibility.ts — การมองเห็นของ CRM v2: OWN / TEAM / ALL (ใบ C1.7 · พิมพ์เขียว §5.9 · §6.2 · §6.4 · §11.6 · มติ C9 · R-C.3 · R-E.14)
//
// ผิวของไฟล์ (สัญญาใบ C1.7 — ข้อสอบ qc-crm-c1.7):
//   resolve(ctx, actor, entity, { pipelineId? }) → "OWN" | "TEAM" | "ALL"
//   visibleWhere(ctx, actor, entity, { pipelineId?, db? }) → Prisma where (ร้าน + ระบบ + การมองเห็น + คีย์อ่าน)
//   canSee(ctx, actor, entity, id) → boolean · policies.{ list, set, remove } (ต้องมี `crm.visibility.manage`)
//   recordVisibleWhere (id ที่ระบุเท่านั้น) · recordVisibilitySql (สำหรับรายการ — EXISTS ในฐานข้อมูล) · fileVisibleWhere (ต่อแม่ 1 ตัว)
//
// 🔴 R-E.14: การมองเห็นมีผลเฉพาะระบบ CRM ที่ `settings.crm.uiVersion = 2` — ระบบ uiVersion 1 (ทุกร้านบน prod จนกว่าเจ้าของเปิด v2)
//    ได้ขอบเขตเดิมก่อน C1.7 ทุกประการ: ร้าน + ระบบ ไม่มีกรอง OWN/TEAM/ALL ไม่มีด่านคีย์อ่าน (บอร์ดงานใช้ด่านโมดูลเดิมอย่างเดียว)
//
// ลำดับการตัดสิน (resolve):
//   OWNER ⇒ ALL เสมอ (แม้มี policy บทบาท OWNER) · คีย์ API ⇒ ALL แล้วแคบลงด้วยตัวกรอง `crm.filter.team:` / `crm.filter.owner:` ·
//   คนอื่น: policy (pipeline + ทีมของฉัน/ไม่ระบุทีม) → policy (ทีมของฉัน · ไม่ระบุ pipeline) → [ระดับของบทบาท = policy บทบาท
//   (ไม่ระบุทีม/pipeline) → `settings.crm.visibility[role]`] → ค่าเริ่มต้น C9 · หลาย policy ในชั้นเดียวกัน = อันที่กว้างที่สุด
//   🔴 หัวหน้าทีม (TeamMember LEAD ของทีมใดก็ได้) ที่เป็น STAFF: ได้อย่างน้อย TEAM ทุกชนิดข้อมูล — กว้างกว่าระดับของบทบาทเมื่อบทบาทแคบกว่า
//      (policy บทบาท STAFF/ค่าของร้านที่ตั้ง OWN ไม่ทำให้หัวหน้าทีมมองไม่เห็นทีมตัวเอง — เจตนา C9) · policy ต่อทีม/pipeline ยังชนะ
//   MANAGER ปริยาย ALL · STAFF ปริยาย ผู้ติดต่อ/บริษัท/ดีล TEAM · กิจกรรม/รายงาน OWN
// ความหมาย:
//   OWN  = ownerUserId = ฉัน (ดีล: หรือฉันอยู่ใน collaboratorUserIds)
//   TEAM = OWN หรือ teamId ∈ ทีมของฉัน หรือ ownerUserId ∈ สมาชิกของทีมที่ฉันอยู่/เป็นหัวหน้า (กิจกรรมไม่มี teamId → ตามผู้ดูแล)
//   กิจกรรมที่ไม่มีผู้ดูแล (ownerUserId null — แถวของระบบ/v1) บนดีล/ผู้ติดต่อที่ฉันเห็น = เห็น
//   ALL  = ขอบเขตสาขาของ actor: OWNER / unitAccess "*" / unitAccess [] (ทั้งร้าน — แบบ member/access.ts) = ทุกแถว · ถูกจำกัดสาขา =
//          แถวไม่มีทีม · ทีมที่ไม่ผูกสาขา · ทีมที่ผูกสาขาที่ดูแล (กิจกรรม: ตามดีล/ผู้ติดต่อ/บริษัท/รายการแม่)
//   ไฟล์แนบ/รายการวัตถุกำหนดเอง ตามระเบียนแม่ · รายการที่แม่ไม่ใช่ผู้ติดต่อ/บริษัท/ดีล = ขอบเขตสาขาอย่างเดียว
//
// 🔴 AUDIT-CLASS X1: ทุก where ผูก tenantId + systemId เสมอ · มองไม่เห็น = ผู้เรียกตอบ NOT_FOUND (404-not-403)
// 🔴 AUDIT-CLASS X1: **ไม่มีแคช** — ทีม/สมาชิกทีม/policy/settings อ่านจากฐานใหม่ทุกครั้งที่เรียก (ไม่มี Map ระดับโมดูล ไม่มี
//    unstable_cache) ⇒ ย้ายคนออกจากทีม (ผ่าน core teams หรือแก้ฐานตรง) มีผลตั้งแต่คำขอถัดไป (บทเรียน "ให้สิทธิ์ห้ามใช้คำตอบแคช")
// 🔴 ไม่มีรายการ id ไม่จำกัดขนาด: รายการวัตถุ/ไฟล์ ใช้ EXISTS ในฐานข้อมูล (recordVisibilitySql) หรือระบุ id/แม่ที่มีขนาดจำกัด ·
//    ผู้เรียกที่ถือล็อกแถวใน tx ส่ง `db: tx` มา — ทุกคิวรีของไฟล์นี้วิ่งบน client ที่ส่งมา (ไม่แย่ง connection จาก pool ขณะถือล็อก)
// 🔴 AUDIT-CLASS X2: คีย์ API ไม่มีคีย์อ่าน = ไม่เห็นอะไร (ไม่มี "อ่านโดยนัย") · ตัวกรองของคีย์ (R-C.3) ใช้ในนี้ที่เดียว
import { Prisma } from "@prisma/client";
import type { Role } from "@prisma/client";
import type { MemberActor } from "@/lib/modules/member";
import { prisma } from "./db";
import { crmCan, isApiActor } from "./access";
import { parseCrmSettings } from "./settings";
import {
  CRM_VIS_DEFAULT,
  CRM_VIS_RANK,
  VisibilityError,
  isVisEntity,
  isVisLevel,
  type CrmVisEntity,
  type CrmVisLevel,
  type SetPolicyInput,
  type VisibilityPolicyDto,
} from "./visibility-shared";

export { VisibilityError };
export type { CrmVisEntity, CrmVisLevel, VisibilityPolicyDto, SetPolicyInput };

export type VisCtx = { tenantId: string; systemId: string; actorUserId?: string | null };
/** client ของผู้เรียก (tx ที่ถือล็อกอยู่) — ไม่ส่ง = client หลัก */
export type VisDb = Prisma.TransactionClient;
export type VisOpts = { pipelineId?: string | null; db?: VisDb };
/** ชนิดที่ `canSee` / `fileWhere` รับ — 4 เอนทิตีหลัก + รายการวัตถุกำหนดเอง */
export type VisTarget = "CONTACT" | "COMPANY" | "DEAL" | "ACTIVITY" | "RECORD";

type Actor = MemberActor;
type Tx = Prisma.TransactionClient;

const READ_KEY: Readonly<Record<CrmVisEntity | "RECORD", string>> = {
  CONTACT: "crm.contact.read",
  COMPANY: "crm.company.read",
  DEAL: "crm.deal.read",
  ACTIVITY: "crm.activity.read",
  REPORT: "crm.report.view",
  RECORD: "crm.record.read",
};

const NOTHING = { id: { in: [] as string[] } };
/** เพดานของกิจกรรม "ไม่มีดีล/ผู้ติดต่อ" ที่ต้องซ่อนจากผู้ถูกจำกัดสาขา — เกินนี้ = ซ่อนกิจกรรมกลุ่มนี้ทั้งหมด (fail closed · ไม่สร้างรายการยาว) */
const ORPHAN_HIDE_CAP = 5_000;

const dbOf = (o?: { db?: VisDb } | null): VisDb => o?.db ?? prisma;

// ───────────────────────── ระบบ + ภาพสถานะ ณ คำขอนี้ (อ่านใหม่ทุกครั้ง · ไม่มีแคช) ─────────────────────────

type SysInfo = { v2: boolean; settingsVis: unknown };

/** ระบบ CRM ของ ctx (ร้านนี้ · ชนิด CRM) — `null` = ไม่พบ · v2 = uiVersion 2 (R-E.14) */
async function sysInfo(ctx: VisCtx, db: VisDb): Promise<SysInfo | null> {
  const sys =
    typeof ctx?.systemId === "string" && typeof ctx?.tenantId === "string" && ctx.systemId && ctx.tenantId
      ? await db.appSystem.findFirst({ where: { id: ctx.systemId, tenantId: ctx.tenantId, type: "CRM" }, select: { settings: true } })
      : null;
  if (!sys) return null;
  const s = sys.settings;
  const crm = s && typeof s === "object" && !Array.isArray(s) ? (s as Record<string, unknown>).crm : null;
  const settingsVis = crm && typeof crm === "object" && !Array.isArray(crm) ? (crm as Record<string, unknown>).visibility : undefined;
  return { v2: parseCrmSettings(s).uiVersion === 2, settingsVis };
}

type PolicyRow = { id: string; role: Role | null; teamId: string | null; pipelineId: string | null; entity: string; visibility: CrmVisLevel };

type Snapshot = {
  me: string;
  /** ทีม (ยังไม่เก็บถาวร) ที่ฉันอยู่ */
  teamIds: string[];
  isLead: boolean;
  /** userId ของสมาชิกทุกคนในทีมที่ฉันอยู่/เป็นหัวหน้า (รวมตัวฉัน) */
  teammateIds: string[];
  /** policy ของระบบนี้ (ทุกชนิดข้อมูล — ใช้ตัดสินทั้งเอนทิตีหลักและแม่ของกิจกรรม/รายการ) */
  policies: PolicyRow[];
  settingsVis: unknown;
};

/** AUDIT-CLASS X1: อ่านทีมของฉัน + สมาชิกทีม + policy จากฐาน **ทุกครั้ง** (คำขอถัดไปเห็นการเปลี่ยนแปลงทันที) */
async function snapshot(ctx: VisCtx, actor: Actor, info: SysInfo, db: VisDb): Promise<Snapshot> {
  const me = typeof actor.userId === "string" ? actor.userId : "";
  const mine = me
    ? await db.teamMember.findMany({
        where: { tenantId: ctx.tenantId, userId: me, team: { tenantId: ctx.tenantId, archivedAt: null } },
        select: { teamId: true, role: true },
      })
    : [];
  const teamIds = [...new Set(mine.map((m) => m.teamId))];
  const mates = teamIds.length ? await db.teamMember.findMany({ where: { tenantId: ctx.tenantId, teamId: { in: teamIds } }, select: { userId: true } }) : [];
  const policies = await db.crmVisibilityPolicy.findMany({
    where: { tenantId: ctx.tenantId, systemId: ctx.systemId },
    select: { id: true, role: true, teamId: true, pipelineId: true, entity: true, visibility: true },
  });
  return {
    me,
    teamIds,
    isLead: mine.some((m) => m.role === "LEAD"),
    teammateIds: [...new Set([...mates.map((m) => m.userId), ...(me ? [me] : [])])],
    policies: policies as PolicyRow[],
    settingsVis: info.settingsVis,
  };
}

const widest = (vals: CrmVisLevel[]): CrmVisLevel | null =>
  vals.length === 0 ? null : vals.reduce((a, b) => (CRM_VIS_RANK[b] > CRM_VIS_RANK[a] ? b : a));

const roleMatches = (p: PolicyRow, actor: Actor) => p.role === null || p.role === actor.role;

/** policy ระดับ pipeline ที่ใช้กับฉัน: pipeline ตรง · ทีมของฉันหรือไม่ระบุทีม · บทบาทของฉันหรือไม่ระบุ */
function pipelinePolicies(s: Snapshot, actor: Actor, entity: CrmVisEntity): Map<string, CrmVisLevel> {
  const by = new Map<string, CrmVisLevel[]>();
  for (const p of s.policies) {
    if (p.entity !== entity || !p.pipelineId || !roleMatches(p, actor)) continue;
    if (p.teamId !== null && !s.teamIds.includes(p.teamId)) continue;
    by.set(p.pipelineId, [...(by.get(p.pipelineId) ?? []), p.visibility]);
  }
  return new Map([...by.entries()].map(([k, v]) => [k, widest(v)!]));
}

/** ค่าจาก settings.crm.visibility[role] — สตริงเดียว = ทุกเอนทิตี · อ็อบเจกต์ = รายเอนทิตี · ค่าเพี้ยน = ไม่นับ */
function settingsLevel(raw: unknown, role: string, entity: CrmVisEntity): CrmVisLevel | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const v = (raw as Record<string, unknown>)[role];
  if (isVisLevel(v)) return v;
  if (v && typeof v === "object" && !Array.isArray(v)) {
    const e = (v as Record<string, unknown>)[entity];
    if (isVisLevel(e)) return e;
  }
  return null;
}

/** ชั้นที่ไม่ขึ้นกับ pipeline: policy ทีม → [policy บทบาท → settings] (หัวหน้าทีม ≥ TEAM) → ค่าเริ่มต้น C9 */
function baseLevel(s: Snapshot, actor: Actor, entity: CrmVisEntity): CrmVisLevel {
  const team = widest(
    s.policies.filter((p) => p.entity === entity && !p.pipelineId && p.teamId !== null && s.teamIds.includes(p.teamId) && roleMatches(p, actor)).map((p) => p.visibility),
  );
  if (team) return team;
  const rolePolicy = widest(s.policies.filter((p) => p.entity === entity && !p.pipelineId && p.teamId === null && p.role === actor.role).map((p) => p.visibility));
  const roleLevel = rolePolicy ?? settingsLevel(s.settingsVis, actor.role, entity);
  if (actor.role === "MANAGER") return roleLevel ?? CRM_VIS_DEFAULT.MANAGER[entity];
  // C9: หัวหน้าทีมเห็นทั้งทีมเสมอ — ระดับของบทบาทที่แคบกว่า (OWN) ไม่ลดหัวหน้าทีม · ที่กว้างกว่า (ALL) ยังใช้ได้
  if (s.isLead) return widest(["TEAM", ...(roleLevel ? [roleLevel] : [])])!;
  return roleLevel ?? CRM_VIS_DEFAULT.STAFF[entity];
}

function levelOf(s: Snapshot, actor: Actor, entity: CrmVisEntity, pipelineId: string | null): CrmVisLevel {
  if (pipelineId && entity === "DEAL") {
    const p = pipelinePolicies(s, actor, entity).get(pipelineId);
    if (p) return p;
  }
  return baseLevel(s, actor, entity);
}

/**
 * การมองเห็นของ actor ต่อเอนทิตีนี้ (ระบบ CRM ของ ctx) — คืนสตริง "OWN" | "TEAM" | "ALL"
 * AUDIT-CLASS X1: OWNER = ALL เสมอ · คีย์ API = ALL (แคบลงด้วยตัวกรองของคีย์ใน visibleWhere) · ระบบ uiVersion 1 = ALL (R-E.14) ·
 * อ่านทีม/policy ใหม่ทุกครั้ง
 */
export async function resolve(ctx: VisCtx, actor: Actor, entity: CrmVisEntity, opts: VisOpts = {}): Promise<CrmVisLevel> {
  if (!isVisEntity(entity)) throw new VisibilityError("VALIDATION", "ชนิดข้อมูลที่ขอดูการมองเห็นไม่ถูกต้อง");
  if (!actor || actor.role === "CUSTOMER") return "OWN";
  if (actor.role === "OWNER" || isApiActor(actor)) return "ALL";
  const db = dbOf(opts);
  const info = await sysInfo(ctx, db);
  if (!info || !info.v2) return "ALL";
  const s = await snapshot(ctx, actor, info, db);
  return levelOf(s, actor, entity, opts?.pipelineId ?? null);
}

// ───────────────────────── ขอบเขตสาขา (ALL) + ตัวกรองคีย์ API ─────────────────────────

/** actor ไม่ถูกจำกัดสาขา: OWNER · unitAccess "*" · unitAccess [] (= ทั้งร้าน แบบเดียวกับ member/access.ts) */
const wholeShop = (actor: Actor) => actor.role === "OWNER" || actor.unitAccess.length === 0 || actor.unitAccess.includes("*");

/** ทีมที่ actor ที่ถูกจำกัดสาขาเห็นได้ใน ALL — `null` = ไม่ถูกจำกัด (รายการทีมของร้าน · ขนาดจำกัดตามจำนวนทีม) */
async function unitTeams(ctx: VisCtx, actor: Actor, db: VisDb): Promise<string[] | null> {
  if (wholeShop(actor)) return null;
  const teams = await db.team.findMany({ where: { tenantId: ctx.tenantId }, select: { id: true, unitIds: true } });
  return teams.filter((t) => t.unitIds.length === 0 || t.unitIds.some((u) => actor.unitAccess.includes(u))).map((t) => t.id);
}

type KeyFilters = { teamIds: string[]; ownerIds: string[] };

/** AUDIT-CLASS X2: ตัวกรองของคีย์ API (R-C.3) — pseudo-scope ที่เก็บใน scopesJson → permissions */
function keyFilters(actor: Actor): KeyFilters {
  const out: KeyFilters = { teamIds: [], ownerIds: [] };
  if (!isApiActor(actor)) return out;
  for (const [k, v] of Object.entries(actor.permissions ?? {})) {
    if (v !== true) continue;
    if (k.startsWith("crm.filter.team:")) out.teamIds.push(k.slice("crm.filter.team:".length));
    else if (k.startsWith("crm.filter.owner:")) out.ownerIds.push(k.slice("crm.filter.owner:".length));
  }
  return out;
}

// ───────────────────────── ตัวสร้าง where ต่อเอนทิตี (Prisma) ─────────────────────────

type OwnedEntity = "CONTACT" | "COMPANY" | "DEAL";
type WhereOf = { CONTACT: Prisma.CrmContactWhereInput; COMPANY: Prisma.CrmCompanyWhereInput; DEAL: Prisma.CrmDealWhereInput; ACTIVITY: Prisma.CrmActivityWhereInput };

/** เงื่อนไขของระดับหนึ่งสำหรับตารางที่มี ownerUserId + teamId (ผู้ติดต่อ · บริษัท · ดีล) */
function ownedClause(entity: OwnedEntity, level: CrmVisLevel, s: Snapshot, allowedTeams: string[] | null): Prisma.CrmDealWhereInput {
  if (level === "ALL") return allowedTeams === null ? {} : { OR: [{ teamId: null }, { teamId: { in: allowedTeams } }] };
  const own: Prisma.CrmDealWhereInput[] = s.me
    ? [{ ownerUserId: s.me }, ...(entity === "DEAL" ? [{ collaboratorUserIds: { has: s.me } }] : [])]
    : [];
  if (level === "OWN") return own.length ? { OR: own } : NOTHING;
  const team: Prisma.CrmDealWhereInput[] = [
    ...own,
    ...(s.teamIds.length ? [{ teamId: { in: s.teamIds } }] : []),
    ...(s.teammateIds.length ? [{ ownerUserId: { in: s.teammateIds } }] : []),
  ];
  return team.length ? { OR: team } : NOTHING;
}

/** ดีลที่เห็น (ไม่รวมขอบเขตร้าน/ระบบ) — policy ต่อ pipeline มีผลเฉพาะแถวของ pipeline นั้น */
function dealClause(s: Snapshot, actor: Actor, allowed: string[] | null, pipelineId: string | null): Prisma.CrmDealWhereInput {
  if (pipelineId) return { AND: [{ pipelineId }, ownedClause("DEAL", levelOf(s, actor, "DEAL", pipelineId), s, allowed)] };
  const overrides = pipelinePolicies(s, actor, "DEAL");
  const base = ownedClause("DEAL", baseLevel(s, actor, "DEAL"), s, allowed);
  if (overrides.size === 0) return base;
  return {
    OR: [
      { AND: [{ pipelineId: { notIn: [...overrides.keys()] } }, base] },
      ...[...overrides.entries()].map(([p, lv]) => ({ AND: [{ pipelineId: p }, ownedClause("DEAL", lv, s, allowed)] })),
    ],
  };
}

/**
 * กิจกรรม (ไม่มี teamId): OWN = ของฉัน · TEAM = ผู้ดูแลเป็นเพื่อนร่วมทีม · ไม่มีผู้ดูแล = ตามดีล/ผู้ติดต่อที่ฉันเห็น ·
 * ALL ถูกจำกัดสาขา = ตามดีล / ผู้ติดต่อ / (ไม่มีทั้งสอง) บริษัท–รายการแม่ ผ่านรายการซ่อนที่มีเพดาน
 */
async function activityClause(ctx: VisCtx, actor: Actor, s: Snapshot, allowed: string[] | null, db: VisDb): Promise<Prisma.CrmActivityWhereInput> {
  const level = levelOf(s, actor, "ACTIVITY", null);
  if (level === "ALL") {
    if (allowed === null) return {};
    const unit = { OR: [{ teamId: null }, { teamId: { in: allowed } }] };
    const hidden = await hiddenOrphanActivities(ctx, actor, allowed, db);
    return {
      OR: [
        { deal: { is: unit } },
        { dealId: null, contact: { is: unit } },
        { dealId: null, contactId: null, companyId: null, customRecordId: null },
        ...(hidden === "ALL" ? [] : [{ dealId: null, contactId: null, NOT: { AND: [{ companyId: null }, { customRecordId: null }] }, ...(hidden.length ? { id: { notIn: hidden } } : {}) }]),
      ],
    };
  }
  const dealVis = dealClause(s, actor, allowed, null);
  const contactVis = ownedClause("CONTACT", baseLevel(s, actor, "CONTACT"), s, allowed) as Prisma.CrmContactWhereInput;
  const ownerless: Prisma.CrmActivityWhereInput[] = [
    { ownerUserId: null, deal: { is: dealVis } },
    { ownerUserId: null, dealId: null, contact: { is: contactVis } },
  ];
  if (!s.me) return { OR: ownerless };
  if (level === "OWN") return { OR: [{ ownerUserId: s.me }, ...ownerless] };
  return { OR: [{ ownerUserId: { in: s.teammateIds.length ? s.teammateIds : [s.me] } }, ...ownerless] };
}

/**
 * กิจกรรม "ไม่มีดีล/ผู้ติดต่อ" ที่ผูกบริษัท/รายการ ที่ผู้ถูกจำกัดสาขาต้องไม่เห็น (บริษัท/แม่ของรายการอยู่ทีมของสาขาอื่น ·
 * รายการที่ไม่มีแม่เป็นคน/บริษัท/ดีลอยู่สาขาอื่น) — คิวรีเดียว มีเพดาน: เกิน ORPHAN_HIDE_CAP ⇒ "ALL" = ซ่อนกลุ่มนี้ทั้งหมด
 */
async function hiddenOrphanActivities(ctx: VisCtx, actor: Actor, allowed: string[], db: VisDb): Promise<string[] | "ALL"> {
  const units = actor.unitAccess;
  const teamOk = (alias: string) => Prisma.sql`(${Prisma.raw(alias)}."teamId" IS NULL OR ${Prisma.raw(alias)}."teamId" = ANY(${allowed}::text[]))`;
  const rows = await db.$queryRaw<{ id: string }[]>`
    SELECT a."id" FROM "CrmActivity" a
    LEFT JOIN "CrmCompany" c ON c."id" = a."companyId"
    LEFT JOIN "CustomRecord" r ON r."id" = a."customRecordId"
    WHERE a."tenantId" = ${ctx.tenantId} AND a."systemId" = ${ctx.systemId} AND a."dealId" IS NULL AND a."contactId" IS NULL
      AND (a."companyId" IS NOT NULL OR a."customRecordId" IS NOT NULL)
      AND NOT (
        (a."companyId" IS NOT NULL AND c."id" IS NOT NULL AND ${teamOk("c")})
        OR (a."companyId" IS NULL AND r."id" IS NOT NULL AND (
          (r."parentType"::text = 'CONTACT' AND EXISTS (SELECT 1 FROM "CrmContact" p WHERE p."id" = r."parentId" AND ${teamOk("p")}))
          OR (r."parentType"::text = 'COMPANY' AND EXISTS (SELECT 1 FROM "CrmCompany" p WHERE p."id" = r."parentId" AND ${teamOk("p")}))
          OR (r."parentType"::text = 'DEAL' AND EXISTS (SELECT 1 FROM "CrmDeal" p WHERE p."id" = r."parentId" AND ${teamOk("p")}))
          OR (r."parentType"::text NOT IN ('CONTACT', 'COMPANY', 'DEAL') AND (r."unitId" IS NULL OR r."unitId" = ANY(${units}::text[])))
        ))
      )
    LIMIT ${ORPHAN_HIDE_CAP + 1}`;
  return rows.length > ORPHAN_HIDE_CAP ? "ALL" : rows.map((r) => r.id);
}

function keyFilterClause(entity: CrmVisEntity, f: KeyFilters, teamMembers: string[]): Prisma.CrmDealWhereInput | Prisma.CrmActivityWhereInput | null {
  const parts: Record<string, unknown>[] = [];
  if (entity === "ACTIVITY") {
    if (f.teamIds.length) parts.push({ ownerUserId: { in: teamMembers } });
    if (f.ownerIds.length) parts.push({ ownerUserId: { in: f.ownerIds } });
  } else {
    if (f.teamIds.length) parts.push({ teamId: { in: f.teamIds } });
    if (f.ownerIds.length) parts.push({ ownerUserId: { in: f.ownerIds } });
  }
  return parts.length ? ({ AND: parts } as Prisma.CrmDealWhereInput) : null;
}

type WhereOpts = VisOpts & {
  /** false = ไม่ตรวจคีย์อ่านของเอนทิตีนี้ (ใช้ตอนตัดสิน "แม่" ของไฟล์/รายการวัตถุ — ตัวลูกมีคีย์อ่านของมันเอง) */
  keyGate?: boolean;
};

async function keyTeamMembers(ctx: VisCtx, f: KeyFilters, db: VisDb): Promise<string[]> {
  return f.teamIds.length ? (await db.teamMember.findMany({ where: { tenantId: ctx.tenantId, teamId: { in: f.teamIds } }, select: { userId: true } })).map((m) => m.userId) : [];
}

/**
 * AUDIT-CLASS X1: where ของแถวที่ actor เห็น (ร้าน + ระบบ CRM ของ ctx + การมองเห็น + คีย์อ่าน) — ใช้เป็น Prisma where ได้ตรง ๆ
 * ดีล: policy ระดับ pipeline มีผลเฉพาะแถวของ pipeline นั้น (ไม่ส่ง pipelineId = รวมทุก pipeline ด้วย OR ต่อ pipeline)
 * R-E.14: ระบบ uiVersion 1 = ขอบเขตร้าน + ระบบ แบบก่อน C1.7 (ไม่กรองการมองเห็น ไม่มีด่านคีย์อ่าน)
 */
export async function visibleWhere(ctx: VisCtx, actor: Actor, entity: "CONTACT", opts?: WhereOpts): Promise<Prisma.CrmContactWhereInput>;
export async function visibleWhere(ctx: VisCtx, actor: Actor, entity: "COMPANY", opts?: WhereOpts): Promise<Prisma.CrmCompanyWhereInput>;
export async function visibleWhere(ctx: VisCtx, actor: Actor, entity: "DEAL", opts?: WhereOpts): Promise<Prisma.CrmDealWhereInput>;
export async function visibleWhere(ctx: VisCtx, actor: Actor, entity: "ACTIVITY", opts?: WhereOpts): Promise<Prisma.CrmActivityWhereInput>;
export async function visibleWhere(ctx: VisCtx, actor: Actor, entity: Exclude<CrmVisEntity, "REPORT">, opts?: WhereOpts): Promise<WhereOf[keyof WhereOf]>;
export async function visibleWhere(ctx: VisCtx, actor: Actor, entity: Exclude<CrmVisEntity, "REPORT">, opts: WhereOpts = {}): Promise<WhereOf[keyof WhereOf]> {
  const scope = { tenantId: ctx.tenantId, systemId: ctx.systemId };
  // ลูกค้า (portal) ไม่มีทางเข้าบริการฝั่งพนักงาน
  if (!actor || actor.role === "CUSTOMER") return { ...scope, ...NOTHING };
  if (!isVisEntity(entity) || (entity as string) === "REPORT") throw new VisibilityError("VALIDATION", "ชนิดข้อมูลที่ขอดูการมองเห็นไม่ถูกต้อง");
  const db = dbOf(opts);
  const info = await sysInfo(ctx, db);
  if (!info) return { ...scope, ...NOTHING };
  // R-E.14: ระบบที่ยังไม่เปิด CRM v2 = ขอบเขตเดิมก่อน C1.7 ทุกประการ
  if (!info.v2) return scope;
  // AUDIT-CLASS X2: ไม่มีคีย์อ่าน = ไม่เห็นอะไร (คีย์ API ไม่มี "อ่านโดยนัย")
  if (opts.keyGate !== false && !crmCan(actor, READ_KEY[entity])) return { ...scope, ...NOTHING };
  if (actor.role === "OWNER") return scope;
  if (isApiActor(actor)) {
    const f = keyFilters(actor);
    const narrow = keyFilterClause(entity, f, await keyTeamMembers(ctx, f, db));
    const allowed = await unitTeams(ctx, actor, db);
    const all = entity === "ACTIVITY" ? (allowed === null ? {} : await activityClause(ctx, actor, emptySnap(), allowed, db)) : ownedClause(entity, "ALL", emptySnap(), allowed);
    return { AND: [scope, all, ...(narrow ? [narrow] : [])] } as WhereOf[keyof WhereOf];
  }
  const s = await snapshot(ctx, actor, info, db);
  const allowed = await unitTeams(ctx, actor, db);
  if (entity === "ACTIVITY") return { AND: [scope, await activityClause(ctx, actor, s, allowed, db)] };
  if (entity === "DEAL") return { AND: [scope, dealClause(s, actor, allowed, opts.pipelineId ?? null)] };
  return { AND: [scope, ownedClause(entity, baseLevel(s, actor, entity), s, allowed)] } as WhereOf[keyof WhereOf];
}

function emptySnap(): Snapshot {
  return { me: "", teamIds: [], isLead: false, teammateIds: [], policies: [], settingsVis: undefined };
}

// ───────────────────────── เงื่อนไขเดียวกันในรูป SQL (EXISTS ของรายการวัตถุ · ไม่มีรายการ id) ─────────────────────────

const sqlTrue = Prisma.sql`TRUE`;
const sqlFalse = Prisma.sql`FALSE`;
const orSql = (parts: Prisma.Sql[]) => (parts.length ? Prisma.sql`(${Prisma.join(parts, " OR ")})` : sqlFalse);

/** ownedClause ในรูป SQL ของแถว alias `p` (ผู้ติดต่อ/บริษัท/ดีล) */
function ownedSql(entity: OwnedEntity, level: CrmVisLevel, s: Snapshot, allowed: string[] | null, p: string): Prisma.Sql {
  const a = Prisma.raw(p);
  if (level === "ALL") return allowed === null ? sqlTrue : Prisma.sql`(${a}."teamId" IS NULL OR ${a}."teamId" = ANY(${allowed}::text[]))`;
  const own: Prisma.Sql[] = s.me ? [Prisma.sql`${a}."ownerUserId" = ${s.me}`, ...(entity === "DEAL" ? [Prisma.sql`${s.me} = ANY(${a}."collaboratorUserIds")`] : [])] : [];
  if (level === "OWN") return orSql(own);
  return orSql([
    ...own,
    ...(s.teamIds.length ? [Prisma.sql`${a}."teamId" = ANY(${s.teamIds}::text[])`] : []),
    ...(s.teammateIds.length ? [Prisma.sql`${a}."ownerUserId" = ANY(${s.teammateIds}::text[])`] : []),
  ]);
}

function dealSql(s: Snapshot, actor: Actor, allowed: string[] | null, p: string): Prisma.Sql {
  const overrides = pipelinePolicies(s, actor, "DEAL");
  const base = ownedSql("DEAL", baseLevel(s, actor, "DEAL"), s, allowed, p);
  if (overrides.size === 0) return base;
  const a = Prisma.raw(p);
  return orSql([
    Prisma.sql`(NOT (${a}."pipelineId" = ANY(${[...overrides.keys()]}::text[])) AND ${base})`,
    ...[...overrides.entries()].map(([pid, lv]) => Prisma.sql`(${a}."pipelineId" = ${pid} AND ${ownedSql("DEAL", lv, s, allowed, p)})`),
  ]);
}

/**
 * AUDIT-CLASS X1: เงื่อนไข SQL (ใช้กับแถว `CustomRecord` alias `r`) ว่า actor เห็นรายการไหน — แม่เป็นผู้ติดต่อ/บริษัท/ดีล = EXISTS
 * ของแม่ที่เห็น · แม่อื่น = ขอบเขตสาขา · ต้องมีคีย์ `crm.record.read`
 * คืน `null` = เห็นทุกรายการของระบบ (ระบบ uiVersion 1 · OWNER · ไม่ถูกจำกัดใด ๆ) — ผู้เรียกไม่ต้องกรองเพิ่ม
 */
export async function recordVisibilitySql(ctx: VisCtx, actor: Actor, opts: { db?: VisDb; alias?: string } = {}): Promise<Prisma.Sql | null> {
  const db = dbOf(opts);
  const r = Prisma.raw(opts.alias ?? "r");
  if (!actor || actor.role === "CUSTOMER") return sqlFalse;
  const info = await sysInfo(ctx, db);
  if (!info) return sqlFalse;
  if (!info.v2) return null;
  if (!crmCan(actor, READ_KEY.RECORD)) return sqlFalse;
  if (actor.role === "OWNER") return null;
  let contact: Prisma.Sql;
  let company: Prisma.Sql;
  let deal: Prisma.Sql;
  const allowed = await unitTeams(ctx, actor, db);
  if (isApiActor(actor)) {
    const f = keyFilters(actor);
    const narrow = (p: string) => {
      const a = Prisma.raw(p);
      const parts = [
        ...(f.teamIds.length ? [Prisma.sql`${a}."teamId" = ANY(${f.teamIds}::text[])`] : []),
        ...(f.ownerIds.length ? [Prisma.sql`${a}."ownerUserId" = ANY(${f.ownerIds}::text[])`] : []),
      ];
      return parts.length ? Prisma.sql`(${Prisma.join(parts, " AND ")})` : sqlTrue;
    };
    contact = narrow("p");
    company = narrow("p");
    deal = narrow("p");
    if (f.teamIds.length === 0 && f.ownerIds.length === 0 && allowed === null) return null;
  } else {
    const s = await snapshot(ctx, actor, info, db);
    const cl = baseLevel(s, actor, "CONTACT");
    const col = baseLevel(s, actor, "COMPANY");
    contact = ownedSql("CONTACT", cl, s, allowed, "p");
    company = ownedSql("COMPANY", col, s, allowed, "p");
    deal = dealSql(s, actor, allowed, "p");
    if (allowed === null && cl === "ALL" && col === "ALL" && baseLevel(s, actor, "DEAL") === "ALL" && pipelinePolicies(s, actor, "DEAL").size === 0) return null;
  }
  const unit = wholeShop(actor) ? sqlTrue : Prisma.sql`(${r}."unitId" IS NULL OR ${r}."unitId" = ANY(${actor.unitAccess}::text[]))`;
  return Prisma.sql`(
    (${r}."parentType"::text = 'CONTACT' AND EXISTS (SELECT 1 FROM "CrmContact" p WHERE p."id" = ${r}."parentId" AND p."tenantId" = ${ctx.tenantId} AND p."systemId" = ${ctx.systemId} AND ${contact}))
    OR (${r}."parentType"::text = 'COMPANY' AND EXISTS (SELECT 1 FROM "CrmCompany" p WHERE p."id" = ${r}."parentId" AND p."tenantId" = ${ctx.tenantId} AND p."systemId" = ${ctx.systemId} AND ${company}))
    OR (${r}."parentType"::text = 'DEAL' AND EXISTS (SELECT 1 FROM "CrmDeal" p WHERE p."id" = ${r}."parentId" AND p."tenantId" = ${ctx.tenantId} AND p."systemId" = ${ctx.systemId} AND ${deal}))
    OR (${r}."parentType"::text NOT IN ('CONTACT', 'COMPANY', 'DEAL') AND ${unit})
  )`;
}

/**
 * AUDIT-CLASS X1: รายการวัตถุกำหนดเองที่ actor เห็น **จากชุด id ที่ระบุ** (1 รายการ หรือชุดที่มีเพดานของผู้เรียก เช่นงานกลุ่ม ≤ 500)
 * คิวรีเดียว (EXISTS ของแม่) — ไม่ดึงรายการ id ของแม่ทั้งระบบ · ไม่ระบุ id = ไม่เห็นอะไร (รายการยาวใช้ recordVisibilitySql)
 */
export async function recordVisibleWhere(ctx: VisCtx, actor: Actor, target: { recordId?: string | null; recordIds?: readonly string[] | null; db?: VisDb }): Promise<Prisma.CustomRecordWhereInput> {
  const scope = { tenantId: ctx.tenantId, systemId: ctx.systemId };
  const ids = [...new Set([...(target.recordIds ?? []), ...(target.recordId ? [target.recordId] : [])].filter((x): x is string => typeof x === "string" && !!x))];
  if (ids.length === 0) return { ...scope, ...NOTHING };
  const db = dbOf(target);
  const vis = await recordVisibilitySql(ctx, actor, { db });
  if (vis === null) return { ...scope, id: { in: ids } };
  const rows = await db.$queryRaw<{ id: string }[]>`
    SELECT r."id" FROM "CustomRecord" r
    WHERE r."tenantId" = ${ctx.tenantId} AND r."systemId" = ${ctx.systemId} AND r."id" = ANY(${ids}::text[]) AND ${vis}`;
  return { ...scope, id: { in: rows.map((x) => x.id) } };
}

/** แปลงชนิดของ CrmFileLink.entityType → เป้าของการมองเห็น */
const FILE_TARGET: Readonly<Record<string, VisTarget>> = { CONTACT: "CONTACT", COMPANY: "COMPANY", DEAL: "DEAL", ACTIVITY: "ACTIVITY", RECORD: "RECORD" };

/**
 * AUDIT-CLASS X1: ลิงก์ไฟล์ของระเบียนแม่ 1 ตัวที่ actor เห็น (ต้องอ่านระเบียนแม่ได้ รวมคีย์อ่านของแม่) — ต้องระบุแม่เสมอ
 * (ไม่มีทาง "ไฟล์ทั้งระบบ" ที่ต้องดึงรายการแม่ทั้งหมด) · ระบบ uiVersion 1 = ขอบเขตเดิม
 */
export async function fileVisibleWhere(ctx: VisCtx, actor: Actor, parent: { entityType: string; entityId: string }, opts: { db?: VisDb } = {}): Promise<Prisma.CrmFileLinkWhereInput> {
  const scope = { tenantId: ctx.tenantId, systemId: ctx.systemId };
  if (!actor || actor.role === "CUSTOMER" || !parent) return { ...scope, ...NOTHING };
  const t = FILE_TARGET[parent.entityType];
  if (!t || !(await canSee(ctx, actor, t, parent.entityId, opts))) return { ...scope, ...NOTHING };
  return { ...scope, entityType: parent.entityType, entityId: parent.entityId };
}

/** AUDIT-CLASS X1: actor เห็นแถวนี้ไหม (มองไม่เห็น/ไม่มีคีย์อ่าน/คนละระบบ = false) — ผู้เรียกแปลง false เป็น 404 · คิวรีนับครั้งเดียว */
export async function canSee(ctx: VisCtx, actor: Actor, entity: VisTarget | CrmVisEntity, id: string, opts: { db?: VisDb } = {}): Promise<boolean> {
  const rid = typeof id === "string" ? id.trim() : "";
  if (!rid || !actor) return false;
  const db = dbOf(opts);
  if (entity === "CONTACT") return (await db.crmContact.count({ where: { AND: [await visibleWhere(ctx, actor, "CONTACT", opts), { id: rid }] } })) > 0;
  if (entity === "COMPANY") return (await db.crmCompany.count({ where: { AND: [await visibleWhere(ctx, actor, "COMPANY", opts), { id: rid }] } })) > 0;
  if (entity === "DEAL") return (await db.crmDeal.count({ where: { AND: [await visibleWhere(ctx, actor, "DEAL", opts), { id: rid }] } })) > 0;
  if (entity === "ACTIVITY") return (await db.crmActivity.count({ where: { AND: [await visibleWhere(ctx, actor, "ACTIVITY", opts), { id: rid }] } })) > 0;
  if (entity === "RECORD") return (await db.customRecord.count({ where: await recordVisibleWhere(ctx, actor, { recordId: rid, db }) })) > 0;
  return false;
}

/**
 * ตัวช่วยของผู้ใช้นอกบริการ (การ์ดบอร์ดงาน · แจ้งเตือน): จาก id ชุดหนึ่งของชนิดเดียว คืนเฉพาะ id ที่ actor เห็น
 * ต่อ (ระบบ · ชนิด): where การมองเห็น 1 ครั้ง + findMany ของ id ที่ขอ 1 ครั้ง (ไม่ canSee ทีละ id) · ระบบ uiVersion 1 = เห็นทุก id
 * (R-E.14 — ด่านโมดูลเดิมของผู้เรียกตัดสินเอง) · ระบบ CRM ของแต่ละแถวอ่านจากแถวนั้นเอง (การ์ดอาจชี้หลายระบบของร้านเดียวกัน)
 */
export async function visibleIdsAmong(tenantId: string, actor: Actor, entity: VisTarget, ids: readonly string[], opts: { db?: VisDb } = {}): Promise<Set<string>> {
  const want = [...new Set(ids.filter((x) => typeof x === "string" && x))];
  const out = new Set<string>();
  if (want.length === 0 || !actor) return out;
  const db = dbOf(opts);
  const base = { tenantId, id: { in: want } };
  const rows =
    entity === "DEAL"
      ? await db.crmDeal.findMany({ where: base, select: { id: true, systemId: true } })
      : entity === "CONTACT"
        ? await db.crmContact.findMany({ where: base, select: { id: true, systemId: true } })
        : entity === "COMPANY"
          ? await db.crmCompany.findMany({ where: base, select: { id: true, systemId: true } })
          : entity === "RECORD"
            ? await db.customRecord.findMany({ where: base, select: { id: true, systemId: true } })
            : await db.crmActivity.findMany({ where: base, select: { id: true, systemId: true } });
  for (const systemId of new Set(rows.map((r) => r.systemId))) {
    const ctx = { tenantId, systemId };
    const inSys = rows.filter((r) => r.systemId === systemId).map((r) => r.id);
    const pick = { AND: [{ id: { in: inSys } }] };
    let seen: { id: string }[];
    if (entity === "DEAL") seen = await db.crmDeal.findMany({ where: { AND: [await visibleWhere(ctx, actor, "DEAL", { db }), pick] }, select: { id: true } });
    else if (entity === "CONTACT") seen = await db.crmContact.findMany({ where: { AND: [await visibleWhere(ctx, actor, "CONTACT", { db }), pick] }, select: { id: true } });
    else if (entity === "COMPANY") seen = await db.crmCompany.findMany({ where: { AND: [await visibleWhere(ctx, actor, "COMPANY", { db }), pick] }, select: { id: true } });
    else if (entity === "ACTIVITY") seen = await db.crmActivity.findMany({ where: { AND: [await visibleWhere(ctx, actor, "ACTIVITY", { db }), pick] }, select: { id: true } });
    else seen = await db.customRecord.findMany({ where: await recordVisibleWhere(ctx, actor, { recordIds: inSys, db }), select: { id: true } });
    for (const x of seen) out.add(x.id);
  }
  return out;
}

/**
 * ผู้ดูจากโมดูลอื่น (การ์ดบอร์ดงาน — kanban link resolvers): id ชุดนี้ของชนิดนี้ ผู้ดูคนนี้เห็นตัวไหนบ้าง
 * actor สร้างด้วย `toMemberActor` เท่านั้น · คีย์ API ของบอร์ดงาน: ระบบ v2 = ไม่เห็น (AUDIT-CLASS X2) · ระบบ v1 = ด่านโมดูลเดิม (R-E.14)
 */
export async function visibleIdsForViewer(
  tenantId: string,
  viewer: { userId: string; role: Role; unitAccess: string[]; permissions: Record<string, unknown>; apiKey?: boolean },
  entity: VisTarget,
  ids: readonly string[],
): Promise<Set<string>> {
  if (!viewer) return new Set();
  const { toMemberActor } = await import("@/lib/modules/member");
  const actor = toMemberActor(viewer.userId, viewer);
  if (!viewer.apiKey) return visibleIdsAmong(tenantId, actor, entity, ids);
  // คีย์ API ของโมดูลอื่น: ระบบ uiVersion 1 เท่านั้นที่ผ่าน (ขอบเขตเดิม) — หา id ของระบบ v1 ด้วย where ของ v1 (คืนขอบเขตร้าน+ระบบ)
  const all = await visibleIdsAmong(tenantId, actor, entity, ids);
  const out = new Set<string>();
  const want = [...all];
  if (want.length === 0) return out;
  const rows =
    entity === "DEAL"
      ? await prisma.crmDeal.findMany({ where: { tenantId, id: { in: want } }, select: { id: true, systemId: true } })
      : entity === "CONTACT"
        ? await prisma.crmContact.findMany({ where: { tenantId, id: { in: want } }, select: { id: true, systemId: true } })
        : entity === "COMPANY"
          ? await prisma.crmCompany.findMany({ where: { tenantId, id: { in: want } }, select: { id: true, systemId: true } })
          : entity === "RECORD"
            ? await prisma.customRecord.findMany({ where: { tenantId, id: { in: want } }, select: { id: true, systemId: true } })
            : await prisma.crmActivity.findMany({ where: { tenantId, id: { in: want } }, select: { id: true, systemId: true } });
  for (const systemId of new Set(rows.map((r) => r.systemId))) {
    const info = await sysInfo({ tenantId, systemId }, prisma);
    if (info && !info.v2) for (const r of rows) if (r.systemId === systemId) out.add(r.id);
  }
  return out;
}

// ───────────────────────── policies (ต้องมี crm.visibility.manage) ─────────────────────────

async function resolveSystemOrThrow(ctx: VisCtx): Promise<void> {
  const sys =
    typeof ctx?.systemId === "string" && typeof ctx?.tenantId === "string" && ctx.systemId && ctx.tenantId
      ? await prisma.appSystem.findFirst({ where: { id: ctx.systemId, tenantId: ctx.tenantId, type: "CRM" }, select: { id: true } })
      : null;
  if (!sys) throw new VisibilityError("NOT_FOUND", "ไม่พบระบบ CRM นี้ในร้านที่เปิดอยู่ — รีเฟรชหน้าแล้วลองใหม่");
}

/** AUDIT-CLASS X2: ตั้ง/ลบ/ดู policy = คีย์ `crm.visibility.manage` (OWNER หรือได้รับชัดเจน · MANAGER ปริยายไม่ได้) */
async function enterManage(ctx: VisCtx, actor: Actor): Promise<void> {
  if (!actor || actor.role === "CUSTOMER") throw new VisibilityError("NOT_FOUND", "ไม่พบระบบ CRM นี้ในร้านที่เปิดอยู่ — รีเฟรชหน้าแล้วลองใหม่");
  await resolveSystemOrThrow(ctx);
  if (!crmCan(actor, "crm.visibility.manage")) {
    throw new VisibilityError("FORBIDDEN", "บัญชีนี้ยังไม่ได้รับสิทธิ์ \"ตั้งค่าการมองเห็นข้อมูลขาย\" — ขอให้เจ้าของร้านเปิดสิทธิ์ให้ แล้วลองอีกครั้ง");
  }
}

function toPolicyDto(r: { id: string; role: Role | null; teamId: string | null; pipelineId: string | null; entity: string; visibility: CrmVisLevel; updatedAt: Date }): VisibilityPolicyDto {
  return { id: r.id, role: r.role, teamId: r.teamId, pipelineId: r.pipelineId, entity: isVisEntity(r.entity) ? r.entity : "DEAL", visibility: r.visibility, updatedAt: r.updatedAt.toISOString() };
}

/** AUDIT-CLASS X9: แถว AuditLog `crm.visibility.*` เขียน **ใน tx เดียวกับการเปลี่ยน policy** (targetId = id ของ policy · ก่อน/หลัง) */
async function auditInTx(tx: Tx, ctx: VisCtx, action: string, targetId: string, body: { before?: unknown; after?: unknown }): Promise<void> {
  await tx.auditLog.create({
    data: {
      tenantId: ctx.tenantId,
      actorType: ctx.actorUserId ? "USER" : "SYSTEM",
      actorId: ctx.actorUserId ?? null,
      action,
      targetType: "CrmVisibilityPolicy",
      targetId,
      ...(body.before !== undefined ? { before: body.before as Prisma.InputJsonValue } : {}),
      ...(body.after !== undefined ? { after: body.after as Prisma.InputJsonValue } : {}),
    },
  });
}

const ROLES = new Set(["OWNER", "MANAGER", "STAFF"]);
const cleanId = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

async function list(ctx: VisCtx, actor: Actor): Promise<VisibilityPolicyDto[]> {
  await enterManage(ctx, actor);
  const rows = await prisma.crmVisibilityPolicy.findMany({
    where: { tenantId: ctx.tenantId, systemId: ctx.systemId },
    orderBy: [{ entity: "asc" }, { createdAt: "asc" }],
  });
  return rows.map(toPolicyDto);
}

/** ล็อกแถว policy ของระบบนี้ทั้งชุด (advisory ต่อระบบ) — ค้น-แล้ว-เขียนแบบ NULL-safe ภายใต้ล็อกเดียว */
const lockPolicies = (tx: Tx, systemId: string) => tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`crm:visibility-policy:${systemId}`}, 0))`;

/**
 * ตั้ง policy (มีอยู่แล้ว = แก้ระดับ · ไม่มี = สร้าง) — หนึ่งแถวต่อ (ระบบ · บทบาท · ทีม · pipeline · เอนทิตี)
 * AUDIT-CLASS X3: unique index ของตารางมีคอลัมน์ nullable (Postgres ถือ NULL ไม่ซ้ำกัน) ⇒ ยิงพร้อมกันจะได้แถวซ้ำ ถ้าไม่ล็อก —
 *   ที่นี่ค้นด้วย `IS NULL` ตรง ๆ แล้วเขียนภายใต้ advisory lock ต่อระบบใน tx เดียว ⇒ พร้อมกันกี่ทาง/กี่โพรเซสก็ได้แถวเดียว
 */
async function set(ctx: VisCtx, actor: Actor, input: SetPolicyInput): Promise<VisibilityPolicyDto> {
  await enterManage(ctx, actor);
  const entity = input?.entity;
  const visibility = input?.visibility;
  if (!isVisEntity(entity)) throw new VisibilityError("VALIDATION", "เลือกชนิดข้อมูล (ผู้ติดต่อ บริษัท ดีล กิจกรรม หรือรายงาน)");
  if (!isVisLevel(visibility)) throw new VisibilityError("VALIDATION", "เลือกระดับการมองเห็น: ของตัวเอง ทั้งทีม หรือทั้งร้าน");
  const roleIn = cleanId(input?.role);
  if (roleIn !== null && !ROLES.has(roleIn)) throw new VisibilityError("VALIDATION", "บทบาทที่เลือกไม่ถูกต้อง");
  const role = roleIn as Role | null;
  const teamId = cleanId(input?.teamId);
  const pipelineId = cleanId(input?.pipelineId);
  if (!role && !teamId && !pipelineId) throw new VisibilityError("VALIDATION", "เลือกบทบาท ทีม หรือ pipeline อย่างน้อยหนึ่งอย่าง");
  if (pipelineId && entity !== "DEAL") throw new VisibilityError("VALIDATION", "การตั้งค่าต่อ pipeline ใช้ได้กับดีลเท่านั้น");
  // AUDIT-CLASS X1: ทีมต้องเป็นของร้านนี้ · pipeline ต้องเป็นของระบบ CRM นี้ — ไม่พบ = ไม่บอกว่ามีอยู่ที่อื่นไหม
  if (teamId && !(await prisma.team.findFirst({ where: { id: teamId, tenantId: ctx.tenantId }, select: { id: true } }))) {
    throw new VisibilityError("NOT_FOUND", "ไม่พบทีมนี้ในร้าน — เลือกทีมจากรายการ");
  }
  if (pipelineId && !(await prisma.crmPipeline.findFirst({ where: { id: pipelineId, tenantId: ctx.tenantId, systemId: ctx.systemId }, select: { id: true } }))) {
    throw new VisibilityError("NOT_FOUND", "ไม่พบ pipeline นี้ในระบบ CRM ที่เปิดอยู่ — เลือกจากรายการ");
  }
  const out = await prisma.$transaction(async (tx) => {
    await lockPolicies(tx, ctx.systemId);
    const cur = await tx.crmVisibilityPolicy.findFirst({
      where: { tenantId: ctx.tenantId, systemId: ctx.systemId, entity, role: role ?? null, teamId: teamId ?? null, pipelineId: pipelineId ?? null },
    });
    const after = { role, teamId, pipelineId, entity, visibility };
    if (cur) {
      const row = cur.visibility === visibility ? cur : await tx.crmVisibilityPolicy.update({ where: { id: cur.id }, data: { visibility } });
      await auditInTx(tx, ctx, "crm.visibility.policy.update", row.id, { before: { visibility: cur.visibility }, after });
      return row;
    }
    const row = await tx.crmVisibilityPolicy.create({ data: { tenantId: ctx.tenantId, systemId: ctx.systemId, role, teamId, pipelineId, entity, visibility } });
    await auditInTx(tx, ctx, "crm.visibility.policy.create", row.id, { after });
    return row;
  });
  return toPolicyDto(out);
}

/** ลบ policy (กลับไปใช้ชั้นถัดไปของลำดับ) — ไม่พบ/ระบบอื่น = NOT_FOUND */
async function remove(ctx: VisCtx, actor: Actor, id: string): Promise<{ ok: true }> {
  await enterManage(ctx, actor);
  const pid = cleanId(id);
  await prisma.$transaction(async (tx) => {
    await lockPolicies(tx, ctx.systemId);
    const cur = pid ? await tx.crmVisibilityPolicy.findFirst({ where: { id: pid, tenantId: ctx.tenantId, systemId: ctx.systemId } }) : null;
    if (!cur) throw new VisibilityError("NOT_FOUND", "ไม่พบการตั้งค่านี้ (อาจถูกลบไปแล้ว) — รีเฟรชหน้าแล้วลองใหม่");
    await tx.crmVisibilityPolicy.delete({ where: { id: cur.id } });
    await auditInTx(tx, ctx, "crm.visibility.policy.remove", cur.id, {
      before: { role: cur.role, teamId: cur.teamId, pipelineId: cur.pipelineId, entity: cur.entity, visibility: cur.visibility },
    });
  });
  return { ok: true };
}

export const policies = { list, set, remove };
