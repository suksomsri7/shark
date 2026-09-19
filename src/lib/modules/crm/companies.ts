// companies.ts — บริการ "บริษัท" ของ CRM v2 (ใบ C1.3 · พิมพ์เขียว §5.3 §3.4 §11.1 · มติผู้คุมงาน C1.3 ข้อ 1–9 · R-A · R-C.8 · รีวิว C1.3)
//
// ของที่ไฟล์นี้เป็นเจ้าของ
//   • CrmCompany: create/update/archive/restore/setOwner/setParent · getCompany360 · listCompanies · export
//   • ผู้ติดต่อในบริษัท (CrmCompanyContact): addContact/removeContact/setPrimary/setRole — **ผู้ติดต่อหลัก 1 คนต่อบริษัท**
//   • แคช `CrmContact.companyId` (เขียนที่นี่ที่เดียว — มติข้อ 1) · แคช openDealCount/wonValueSatang/outstandingSatang
//   • ตัวซ้ำ (findDuplicates · mergeCompanies) · นำเข้า (importCompanies · importFromAccount)
//   • event `crm.company.created/updated/merged` (ยิงใน tx ของการเขียน) + ตัวรับ `onCompanyCreated` (ผูกผู้ติดต่อบัญชี + ไทม์ไลน์)
//
// 🔴 การอ่าน "สิ่งที่ actor เห็น" ผ่าน `./where.ts` เท่านั้น (companyWhere/contactWhere/dealWhere/activityWhere — R-A · C1.7 แทนไส้ใน)
//    แต่การตรวจ "ซ้ำ/ตัวตน" (เลขภาษี · Party) ใช้ `identityScope` = ร้าน + ระบบ ล้วน ๆ (รีวิว SF7): แถวที่ actor มองไม่เห็นก็ยังซ้ำอยู่ดี
// 🔴 ctx.systemId ถูก resolve ใหม่ทุกคำสั่ง (ต้องเป็นระบบ CRM ของร้านนี้) — ไม่เชื่อ id จากผู้เรียก
// 🔴 บริษัทผูกได้เฉพาะ Party ชนิด COMPANY (รีวิว B1) — `party.findOrCreateCompany` · ไม่รับ Party ของ "คน" · ไม่แก้/ไม่รวมตัวตนของคน
// 🔴 ตัวตนของ Party (ชื่อ/เลขภาษี/สาขา) เขียนได้เฉพาะเมื่อบริษัทนี้เป็น "ผู้ถือคนเดียว" (ไม่มี CrmCompany อื่นทุกระบบ · ไม่มี AccountContact)
//    ถ้าแชร์อยู่: เปลี่ยนเลขภาษี/สาขา = ย้ายบริษัทนี้ไป Party บริษัทของตัวตนใหม่ · เปลี่ยนชื่ออย่างเดียว/ล้างเลขภาษี = ไม่แตะ Party (รีวิว SF1)
// 🔴 คอลัมน์ที่ engine ฟิลด์ปฏิเสธ (GOVERNED_CRM_SYSTEM_KEYS.company) ไฟล์นี้เขียนเอง แล้วส่งเฉพาะ key ธรรมดาเข้า engine
// 🔴 ลำดับล็อก (กัน deadlock — รีวิว SF5): ต้นไม้ (crm:company-tree) → advisory ของ engine → เลขภาษี (crm:company-tax) →
//    Party (crm:company-party) → แถว CrmCompany (FOR UPDATE · เรียง id) → แถว CrmContact (FOR UPDATE · เรียง id)
//    ใบถัดไป (C1.4 contacts) ที่ล็อกทั้งผู้ติดต่อและบริษัท ต้องล็อก "บริษัทก่อนผู้ติดต่อ" ตามนี้
// 🔴 `ensureAccountContact` / `mergeContacts` (facade บัญชี) มี tx ของตัวเอง — เรียกนอกธุรกรรมเสมอ (CRM-RUN §4 หมายเหตุ C0.3)

import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import type { CrmCompany, CrmCompanySize, CrmContactRole, Role } from "@prisma/client";
import { writeAudit } from "@/lib/core/audit";
import { cell, columnIndex, csvRow, parseCsv } from "@/lib/core/csv";
import { logOps } from "@/lib/core/ops";
import { emitOutbox } from "@/lib/core/outbox";
import { evaluate } from "@/lib/core/rbac";
import * as party from "@/lib/modules/party";
// 🔴 facade บัญชี/สมาชิก **โหลดตอนใช้** (dynamic import): crm facade ถูก import จากโมดูลบัญชี (account→crm) และทะเบียน AI
//    ถ้า import ค่าที่หัวไฟล์ กราฟจะวน account → … → crm → companies → account แล้วตัวแปรระดับไฟล์ถูกอ่านก่อนประกาศ
//    (TDZ — fitness F10.1 · เหตุผลเดียวกับ objects.ts) · หัวไฟล์ import ได้เฉพาะ "ชนิด" (ถูกลบตอนคอมไพล์)
import type { CrmAccountContactBrief } from "@/lib/modules/account";
import type { MemberActor } from "@/lib/modules/member";
import { prisma } from "./db";
import { activityWhere, companyWhere, contactWhere, dealWhere } from "./where";
// CRM C1.7 ▸ คีย์สิทธิ์ตัวเดียวของ CRM ◂
import { crmCan, crmForbiddenMessage } from "./access";
import * as objects from "./objects";
import {
  COMPANY_CONTACT_ROLES,
  COMPANY_CONTACT_ROLE_LABEL,
  COMPANY_EXPORT_MAX_ROWS,
  COMPANY_IMPORT_ACCOUNT_MAX,
  COMPANY_IMPORT_MAX_BYTES,
  COMPANY_IMPORT_MAX_ROWS,
  COMPANY_NAME_MAX,
  COMPANY_NOTE_MAX,
  COMPANY_PAGE_MAX,
  COMPANY_REASON_MIN,
  COMPANY_SIZES,
  COMPANY_SIZE_LABEL,
  COMPANY_TEXT_MAX,
  CompaniesError,
  MERGE_CHOICE_FIELDS,
  branchCodeProblem,
  emailDomainProblem,
  emailProblem,
  normalizeCompanyTaxId,
  normalizeEmailDomain,
  phoneProblem,
  taxIdProblem,
  websiteProblem,
  type Company360,
  type CompanyCandidate,
  type CompanyContactRole,
  type CompanyContactRow,
  type CompanyDealRow,
  type CompanyDocRow,
  type CompanyDto,
  type CompanyLifecycle,
  type CompanyListInput,
  type CompanyListResult,
  type CompanySize,
  type CompanySort,
  type CompanyTimelineItem,
  type CreateCompanyResult,
  type DuplicatePairDto,
  type DuplicateReason,
  type ImportCompaniesResult,
  type MergeChoiceField,
} from "./companies-shared";

export { COMPANY_IMPORT_MAX_ROWS, COMPANY_IMPORT_MAX_BYTES, CompaniesError };

const accountFacade = () => import("@/lib/modules/account");
const memberFacade = () => import("@/lib/modules/member");
/** engine ฟิลด์ตัวเดียวของระบบ (member facade → namespace `fields` · ใบ C1.2a) */
const engine = async () => (await memberFacade()).fields;

// ───────────────────────── ชนิด ─────────────────────────

export type CompaniesCtx = { tenantId: string; systemId: string; actorUserId: string | null };
type Tx = Prisma.TransactionClient;
type Db = typeof prisma | Tx;

export type CompanyInput = {
  name?: string | null;
  legalName?: string | null;
  taxId?: string | null;
  branchCode?: string | null;
  emailDomain?: string | null;
  industry?: string | null;
  size?: string | null;
  website?: string | null;
  phone?: string | null;
  email?: string | null;
  note?: string | null;
  ownerUserId?: string | null;
  teamId?: string | null;
  parentCompanyId?: string | null;
  /** ฟิลด์กำหนดเอง (engine · objectKey "company") — key ที่เป็นคอลัมน์ของบริษัทถูกส่งเข้าเส้นทางของไฟล์นี้แทน */
  fields?: Record<string, unknown> | null;
};
export type CreateCompanyInput = CompanyInput & { name: string };
export type UpdateCompanyInput = Omit<CompanyInput, "ownerUserId" | "teamId" | "parentCompanyId">;

export type DangerOpts = { confirm?: boolean | null; reason?: string | null };
export type AddContactInput = { contactId: string; role?: string | null; jobTitle?: string | null; isPrimary?: boolean | null };
export type AddContactResult = { companyId: string; contactId: string; role: CompanyContactRole; jobTitle: string | null; isPrimary: boolean; created: boolean };
export type MergeCompaniesInput = {
  keepId: string;
  mergeId: string;
  confirm?: boolean | null;
  reason?: string | null;
  /** ค่าไหนของบริษัทที่ถูกรวมจะทับของบริษัทที่เก็บไว้ ("merge") — ไม่ระบุ = ใช้ของที่เก็บไว้ (ค่าว่างของที่เก็บไว้ = เติมจากอีกฝั่ง) */
  fieldChoices?: Partial<Record<MergeChoiceField, "keep" | "merge">> | null;
};
export type MergeCompaniesResult = {
  keptId: string;
  mergedId: string;
  moved: { contacts: number; contactsDeduped: number; deals: number; activities: number; subsidiaries: number; records: number };
  /** ย้ายเอกสารบัญชี: null = ไม่มีอะไรต้องย้าย */
  accountMerge: { ok: boolean; reason?: string } | null;
  /** ข้ามการย้ายเอกสารบัญชีเพราะผู้ทำไม่มีสิทธิ์ `account.contact.merge` (รีวิว SF2) */
  accountMergeSkipped: "NO_PERMISSION" | null;
  /** ขั้นหลัง commit ที่ไม่สำเร็จ (ข้อความไทย — ส่วน CRM รวมเสร็จแล้ว) */
  warnings: string[];
};
export type ImportFromAccountResult = { created: number; linked: number; skipped: number; errors: { accountContactId: string; reason: string }[] };

// ───────────────────────── ตัวช่วยพื้นฐาน ─────────────────────────

const EVENT = { created: "crm.company.created", updated: "crm.company.updated", merged: "crm.company.merged" } as const;
const TX_OPTS = { maxWait: 15_000, timeout: 30_000 } as const;
const NOT_FOUND_MSG = "ไม่พบบริษัทนี้ในระบบ CRM ที่เปิดอยู่ (อาจถูกลบหรืออยู่คนละระบบ) — รีเฟรชหน้าแล้วลองใหม่";
const RACE_MSG = "ข้อมูลบริษัทนี้เพิ่งถูกแก้จากที่อื่นระหว่างบันทึก — รีเฟรชหน้าแล้วลองใหม่";

const fail = (code: CompaniesError["code"], message: string, extra: { duplicateOf?: string } = {}) => new CompaniesError(code, message, extra);
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const newSeq = () => randomUUID().replace(/-/g, "");
const toNum = (v: bigint | number | null | undefined): number => (v === null || v === undefined ? 0 : Number(v));
const lockKey = (tx: Tx, key: string) => tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
const taxLock = (tx: Tx, ctx: CompaniesCtx, taxId: string) => lockKey(tx, `crm:company-tax:${ctx.tenantId}:${taxId}`);
const partyLock = (tx: Tx, ctx: CompaniesCtx, partyId: string) => lockKey(tx, `crm:company-party:${ctx.systemId}:${partyId}`);
const treeLock = (tx: Tx, ctx: CompaniesCtx) => lockKey(tx, `crm:company-tree:${ctx.systemId}`);

/**
 * AUDIT-CLASS X1 · รีวิว SF7: ขอบเขตของ "การตรวจซ้ำ/ตัวตน" = ร้าน + ระบบ CRM ล้วน ๆ (ไม่ผ่าน companyWhere)
 * — เมื่อ C1.7 จำกัดการมองเห็น บริษัทที่ actor มองไม่เห็นก็ยังต้องนับเป็นตัวซ้ำ (ไม่งั้นได้บริษัทซ้ำ/ชน unique)
 */
const identityScope = (ctx: CompaniesCtx) => ({ tenantId: ctx.tenantId, systemId: ctx.systemId });

function assertActor(actor: MemberActor | null | undefined): asserts actor is MemberActor {
  // ลูกค้า (portal) ไม่มีทางเข้าบริการนี้ — ตอบ "ไม่พบ" (404-not-403)
  if (!actor || actor.role === "CUSTOMER") throw fail("NOT_FOUND", NOT_FOUND_MSG);
}

/** AUDIT-CLASS X1: ctx.systemId ต้องเป็นระบบ **CRM** ของร้านนี้จริง (ระบบร้านอื่น/ระบบชนิดอื่น = ไม่พบ) — ห้ามเชื่อ id จากผู้เรียก */
async function resolveSystem(ctx: CompaniesCtx, db: Db = prisma): Promise<void> {
  const sys =
    typeof ctx?.systemId === "string" && typeof ctx?.tenantId === "string" && ctx.systemId && ctx.tenantId
      ? await db.appSystem.findFirst({ where: { id: ctx.systemId, tenantId: ctx.tenantId, type: "CRM" }, select: { id: true } })
      : null;
  if (!sys) throw fail("NOT_FOUND", "ไม่พบระบบ CRM นี้ในร้านที่เปิดอยู่ — รีเฟรชหน้าแล้วลองใหม่");
}

/** เตรียมทุกคำสั่ง: actor + ระบบ */
async function enter(ctx: CompaniesCtx, actor: MemberActor | null | undefined): Promise<MemberActor> {
  assertActor(actor);
  await resolveSystem(ctx);
  return actor;
}

// CRM C1.7 ▸ ลำดับ: ระบบ (enter) → การมองเห็น (loadCompany · NOT_FOUND) → คีย์ (need · FORBIDDEN ข้อความไทย) ◂
/** AUDIT-CLASS X2: คีย์สิทธิ์ผ่าน `crm/access.ts` เท่านั้น */
function need(a: MemberActor, key: string): void {
  if (!crmCan(a, key)) throw fail("FORBIDDEN", crmForbiddenMessage(key));
}

/** AUDIT-CLASS X1: อ่านบริษัท 1 แถวผ่าน companyWhere เท่านั้น — ระบบอื่น/ร้านอื่น = NOT_FOUND (ข้อความไม่สะท้อนข้อมูลของเขา) */
async function loadCompany(ctx: CompaniesCtx, actor: MemberActor, id: unknown, db: Db = prisma, opts: { live?: boolean } = {}): Promise<CrmCompany> {
  const cid = str(id);
  const row = cid ? await db.crmCompany.findFirst({ where: { AND: [await companyWhere(ctx, actor, { db }), { id: cid }] } }) : null;
  if (!row) throw fail("NOT_FOUND", NOT_FOUND_MSG);
  if (opts.live && row.mergedIntoId) throw fail("VALIDATION", "บริษัทนี้ถูกรวมเข้ากับบริษัทอื่นไปแล้ว — เปิดบริษัทที่เก็บไว้แทน");
  if (opts.live && row.archivedAt) throw fail("VALIDATION", "บริษัทนี้ถูกเก็บถาวรแล้ว จึงแก้ไขไม่ได้ — กู้คืนก่อนถ้าต้องการใช้งานต่อ");
  return row;
}

/** ล็อกแถวบริษัท (FOR UPDATE · ขอบเขตร้าน+ระบบ) — เรียงตาม id เสมอเมื่อมีหลายแถว */
async function lockCompanies(tx: Tx, ctx: CompaniesCtx, ids: string[]): Promise<void> {
  const sorted = [...new Set(ids.filter(Boolean))].sort();
  if (sorted.length === 0) return;
  await tx.$queryRaw`SELECT "id" FROM "CrmCompany" WHERE "id" = ANY(${sorted}::text[]) AND "tenantId" = ${ctx.tenantId} AND "systemId" = ${ctx.systemId} ORDER BY "id" FOR UPDATE`;
}

/** ล็อกแถวผู้ติดต่อ (หลังล็อกบริษัทเสมอ) */
async function lockContacts(tx: Tx, ctx: CompaniesCtx, ids: string[]): Promise<void> {
  const sorted = [...new Set(ids.filter(Boolean))].sort();
  if (sorted.length === 0) return;
  await tx.$queryRaw`SELECT "id" FROM "CrmContact" WHERE "id" = ANY(${sorted}::text[]) AND "tenantId" = ${ctx.tenantId} ORDER BY "id" FOR UPDATE`;
}

/**
 * แคช `CrmContact.companyId` (มติผู้คุมงาน C1.3 ข้อ 1): บริษัทของลิงก์ **หลัก** ที่ยังใช้งาน → ไม่มีก็ลิงก์ล่าสุดที่ยังใช้งาน → ไม่มีก็ null
 * ไม่มีวันชี้บริษัทที่ถูกรวม/เก็บถาวร · คำสั่งเดียวใน SQL (ไม่ใช่อ่าน → คิดในแอป → เขียน) และผู้เรียกล็อกแถวผู้ติดต่อไว้แล้ว
 * AUDIT-CLASS X3: ผู้เขียนแคชนี้มีที่เดียว (ไฟล์นี้) — ทุกการเปลี่ยนลิงก์ของผู้ติดต่อเรียกฟังก์ชันนี้ใน tx เดียวกัน
 */
async function recomputeContactCompanyCache(tx: Tx, ctx: CompaniesCtx, contactIds: string[]): Promise<void> {
  const ids = [...new Set(contactIds.filter(Boolean))];
  if (ids.length === 0) return;
  await tx.$executeRaw`
    UPDATE "CrmContact" c SET "companyId" = (
      SELECT l."companyId" FROM "CrmCompanyContact" l
        JOIN "CrmCompany" co ON co."id" = l."companyId"
       WHERE l."contactId" = c."id" AND l."endedAt" IS NULL
         AND co."archivedAt" IS NULL AND co."mergedIntoId" IS NULL AND co."systemId" = c."systemId"
       ORDER BY l."isPrimary" DESC, COALESCE(l."startedAt", l."createdAt") DESC, l."id" DESC
       LIMIT 1)
     WHERE c."id" = ANY(${ids}::text[]) AND c."tenantId" = ${ctx.tenantId}`;
}

/**
 * แคชดีลของบริษัท — AUDIT-CLASS X3: ผู้เรียกล็อกแถวก่อน (คำสั่งแยก) แล้วค่อย UPDATE ด้วย subquery (คำสั่งใหม่ = snapshot ใหม่หลังได้ล็อก)
 * ⇒ คนที่คำนวณทีหลังสุดเห็นทุกการเปลี่ยนดีลที่ commit ก่อนตัวเองได้ล็อก · ไม่มี "อ่าน → คิดใน JS → เขียน"
 * `outstanding` (ยอดค้างจากสมุดบัญชี) เป็นภาพถ่ายของข้อมูลโมดูลอื่น: อ่านผ่าน facade ก่อนเข้า tx แล้วเขียนทับ (undefined = คงค่าเดิม)
 */
async function recomputeCachesInTx(tx: Tx, ctx: CompaniesCtx, companyId: string, outstanding?: number): Promise<void> {
  const out = outstanding === undefined ? null : BigInt(Math.max(0, Math.round(outstanding)));
  await tx.$executeRaw`
    UPDATE "CrmCompany" co SET
      "openDealCount" = (SELECT count(*)::int FROM "CrmDeal" d WHERE d."companyId" = co."id" AND d."systemId" = co."systemId" AND d."kind" = 'OPEN'::"CrmStageKind"),
      "wonValueSatang" = (SELECT COALESCE(sum(COALESCE(d."wonValueSatang", d."valueSatang")), 0)::bigint FROM "CrmDeal" d WHERE d."companyId" = co."id" AND d."systemId" = co."systemId" AND d."kind" = 'WON'::"CrmStageKind"),
      "outstandingSatang" = COALESCE(${out}::bigint, co."outstandingSatang")
     WHERE co."id" = ${companyId} AND co."tenantId" = ${ctx.tenantId} AND co."systemId" = ${ctx.systemId}`;
}

/** ยอดค้างชำระสดจากสมุดบัญชีที่เชื่อม (0 เมื่อไม่ได้เชื่อม/ยังไม่มีผู้ติดต่อฝั่งบัญชี) */
async function liveOutstanding(ctx: CompaniesCtx, accountContactId: string | null): Promise<number> {
  if (!accountContactId) return 0;
  const acc = await (await accountFacade()).accountSystemForCrm(ctx.tenantId, ctx.systemId);
  if (!acc) return 0;
  // 🔴 contactIds ต้องไม่ว่าง — outstandingByContacts ที่ได้อาร์เรย์ว่าง = "ทุกผู้ติดต่อของสมุด"
  const map = await (await accountFacade()).outstandingByContacts(ctx.tenantId, acc.systemId, [accountContactId]);
  return map.get(accountContactId) ?? 0;
}

/** Party ที่ใช้ได้กับบริษัท = ตัวปลายทางของสายการรวม และต้องเป็นชนิด COMPANY (B1) · อื่น ๆ = null */
async function companyPartyOrNull(ctx: CompaniesCtx, partyId: string | null | undefined, tx: Tx): Promise<string | null> {
  const asked = str(partyId);
  if (!asked) return null;
  const canonical = await party.resolveCanonical(ctx.tenantId, asked, tx);
  const prof = await party.getProfile(ctx.tenantId, canonical, tx);
  return prof && prof.kind === "COMPANY" && !prof.mergedIntoId ? canonical : null;
}

/**
 * บริษัทนี้เป็น "ผู้ถือคนเดียว" ของ Party ไหม (รีวิว SF1): ไม่มี CrmCompany อื่น (ทุกระบบ · รวมแถวที่ถูกรวม/เก็บถาวร) และไม่มี AccountContact
 * 🔴 อ่าน AccountContact ตรง (นับอย่างเดียว · แบบเดียวกับ member/profile.ts) — facade บัญชีไม่มีตัวนับข้ามสมุด และการตัดสินนี้ต้องอยู่ใน tx เดียวกับการเขียน
 */
async function isSoleHolder(tx: Tx, ctx: CompaniesCtx, companyId: string, partyId: string): Promise<boolean> {
  const [others, accounts] = await Promise.all([
    tx.crmCompany.count({ where: { tenantId: ctx.tenantId, partyId, id: { not: companyId } } }),
    tx.accountContact.count({ where: { tenantId: ctx.tenantId, partyId } }),
  ]);
  return others === 0 && accounts === 0;
}

function toDto(row: CrmCompany): CompanyDto {
  return {
    id: row.id,
    systemId: row.systemId,
    partyId: row.partyId,
    name: row.name,
    legalName: row.legalName,
    taxId: row.taxId,
    branchCode: row.branchCode,
    industry: row.industry,
    size: (row.size as CompanySize | null) ?? null,
    website: row.website,
    emailDomain: row.emailDomain,
    phone: row.phone,
    email: row.email,
    lifecycleStage: row.lifecycleStage as CompanyLifecycle,
    score: row.score,
    ownerUserId: row.ownerUserId,
    teamId: row.teamId,
    parentCompanyId: row.parentCompanyId,
    accountContactId: row.accountContactId,
    note: row.note,
    tags: row.tags,
    lastActivityAt: row.lastActivityAt,
    openDealCount: row.openDealCount,
    wonValueSatang: toNum(row.wonValueSatang),
    outstandingSatang: toNum(row.outstandingSatang),
    mergedIntoId: row.mergedIntoId,
    archivedAt: row.archivedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/** error จาก engine ฟิลด์ → CompaniesError · error ของฐานข้อมูลโยนต่อตามจริง */
function engineError(e: unknown): unknown {
  if (e instanceof CompaniesError) return e;
  if (e instanceof Prisma.PrismaClientKnownRequestError || e instanceof Prisma.PrismaClientUnknownRequestError || e instanceof Prisma.PrismaClientValidationError) {
    return e;
  }
  const name = e instanceof Error ? e.name : "";
  if (name === "MemberNotFoundError") return fail("NOT_FOUND", (e as Error).message);
  if (name === "MemberInputError") return fail("VALIDATION", (e as Error).message);
  if (name === "MemberForbiddenError") return fail("FORBIDDEN", (e as Error).message);
  if (e instanceof Error && e.constructor === Error && /[ก-๙]/.test(e.message)) return fail("VALIDATION", e.message);
  return e;
}

function fctx(ctx: CompaniesCtx, actor: MemberActor) {
  return { tenantId: ctx.tenantId, systemId: ctx.systemId, actorUserId: ctx.actorUserId, objectKey: "company", actor };
}

/**
 * AUDIT-CLASS X4: idempotencyKey `crm.company.<type>#<id>#<seq>` (R-C.8) · emit ใน tx ของการเขียน
 * ⇒ เขียนไม่สำเร็จ = ไม่มี event · event เขียนไม่ได้ = การเขียนทั้งก้อนถูกยกเลิก
 * AUDIT-CLASS X8: payload = id/คีย์ล้วน (ไม่มีชื่อ/เบอร์/อีเมล/เว็บไซต์/เลขภาษี)
 */
async function emitCompanyEvent(tx: Tx, ctx: CompaniesCtx, kind: keyof typeof EVENT, keyId: string, seq: string, payload: Record<string, unknown>): Promise<void> {
  const type = EVENT[kind];
  await emitOutbox(tx, { tenantId: ctx.tenantId, systemId: ctx.systemId, type, idempotencyKey: `${type}#${keyId}#${seq}`, payload });
}

/** วงวนของบริษัทแม่: บรรพบุรุษของ `startId` (รวมตัวเอง) — ผู้เรียกถือ tree lock */
async function ancestorsOf(tx: Tx, ctx: CompaniesCtx, startId: string): Promise<string[]> {
  const rows = await tx.$queryRaw<{ id: string }[]>`
    WITH RECURSIVE up AS (
      SELECT "id", "parentCompanyId", 1 AS depth FROM "CrmCompany" WHERE "id" = ${startId} AND "tenantId" = ${ctx.tenantId} AND "systemId" = ${ctx.systemId}
      UNION ALL
      SELECT c."id", c."parentCompanyId", up.depth + 1 FROM "CrmCompany" c JOIN up ON c."id" = up."parentCompanyId"
       WHERE c."tenantId" = ${ctx.tenantId} AND c."systemId" = ${ctx.systemId} AND up.depth < 60)
    SELECT "id" FROM up`;
  return rows.map((r) => r.id);
}

// ───────────────────────── ฟิลด์ระบบของบริษัท (seed ตอนเขียนครั้งแรก — รีวิว SF12) ─────────────────────────

/** ระบบที่ seed แล้วในโพรเซสนี้ (ทางลัด — seed เองเป็น idempotent อยู่แล้ว) */
const seededSystems = new Set<string>();

/**
 * ฟิลด์ระบบของบริษัท (ตัวชี้คอลัมน์ · มติ C1.2a) — ใส่ให้ถ้ายังไม่มี (idempotent)
 * AUDIT-CLASS X3: เปิดพร้อมกันหลายทาง/หลายโพรเซส ⇒ advisory lock ต่อระบบ แล้วค่อยอ่าน-เติมใน tx เดียว (applyTemplate เทียบด้วย key
 *   หลังได้ล็อก = คนที่มาทีหลังเห็นของคนแรกครบ) · ชั้นที่สอง: unique (systemId, objectKey, key) ของ MemberSection/MemberField — ชนก็กลืน P2002
 * 🔴 ไม่เรียกจากหน้า GET (รีวิว SF12) — เรียกจากทางเขียนแรก (สร้าง · แก้ · นำเข้า) ผ่าน `seedCompanyFields`
 */
export async function ensureCompanyFields(ctx: CompaniesCtx, actor: MemberActor): Promise<void> {
  const a = await enter(ctx, actor);
  try {
    await prisma.$transaction(async (tx) => {
      await lockKey(tx, `crm:company-fields:${ctx.systemId}`);
      await (await engine()).applyTemplate(fctx(ctx, a), "system", {}, tx);
    }, TX_OPTS);
    seededSystems.add(ctx.systemId);
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return;
    throw engineError(e);
  }
}

/** best-effort: ฟิลด์ระบบหาย/seed ไม่ได้ ห้ามทำให้การสร้าง/แก้บริษัทล้ม (หน้าจอทำงานได้แม้ยังไม่ seed) */
async function seedCompanyFields(ctx: CompaniesCtx, actor: MemberActor): Promise<void> {
  if (seededSystems.has(ctx.systemId)) return;
  await ensureCompanyFields(ctx, actor).catch(() => undefined);
}

// ───────────────────────── ตรวจค่าที่กรอก ─────────────────────────

/** คอลัมน์ของบริษัทที่ถ้าส่งมาใน `fields` จะถูกพาเข้าเส้นทางของไฟล์นี้ (Party ตรงกัน · ตัวตรวจ X6 ตัวเดียวกัน) */
const ROUTED_FIELD_KEYS = ["name", "legalName", "taxId", "branchCode", "industry", "size", "website", "emailDomain", "phone", "email", "note"] as const;
type RoutedKey = (typeof ROUTED_FIELD_KEYS)[number];

type CleanPatch = {
  name?: string;
  legalName?: string | null;
  taxId?: string | null;
  branchCode?: string;
  emailDomain?: string | null;
  industry?: string | null;
  size?: CrmCompanySize | null;
  website?: string | null;
  phone?: string | null;
  email?: string | null;
  note?: string | null;
};

const textOrNull = (v: unknown, label: string, max = COMPANY_TEXT_MAX): string | null => {
  if (v === null || v === undefined) return null;
  if (typeof v !== "string" && typeof v !== "number") throw fail("VALIDATION", `${label}ต้องเป็นข้อความ`);
  const s = String(v).trim();
  if (s.length > max) throw fail("VALIDATION", `${label}ยาวเกิน ${max.toLocaleString("th-TH")} ตัวอักษร — ย่อให้สั้นลง`);
  return s || null;
};

function parseSize(v: unknown): CrmCompanySize | null {
  const s = str(typeof v === "string" ? v : v === null || v === undefined ? null : String(v));
  if (!s) return null;
  const up = s.toUpperCase();
  if ((COMPANY_SIZES as readonly string[]).includes(up)) return up as CrmCompanySize;
  const byLabel = (Object.entries(COMPANY_SIZE_LABEL) as [CompanySize, string][]).find(([, label]) => label === s);
  if (byLabel) return byLabel[0];
  throw fail("VALIDATION", `ขนาดกิจการต้องเป็นหนึ่งใน ${Object.values(COMPANY_SIZE_LABEL).join(" / ")}`);
}

/**
 * แยก `fields`: key ที่เป็นคอลัมน์ของบริษัท → เส้นทางของไฟล์นี้ (ค่าที่ส่งตรงมาชนะ) · key ที่ engine ปฏิเสธ → VALIDATION ·
 * ที่เหลือ = ฟิลด์กำหนดเอง/ฟิลด์ระบบธรรมดา ส่งให้ engine
 */
async function splitFields(input: CompanyInput): Promise<{ merged: CompanyInput; custom: Record<string, unknown> }> {
  const merged: CompanyInput = { ...input };
  const custom: Record<string, unknown> = {};
  const raw = input.fields && typeof input.fields === "object" && !Array.isArray(input.fields) ? input.fields : {};
  const keys = Object.keys(raw);
  if (keys.length === 0) return { merged, custom };
  const governed = (await engine()).GOVERNED_CRM_SYSTEM_KEYS.company;
  const bag = merged as Record<string, unknown>;
  for (const key of keys) {
    const value = raw[key];
    if ((ROUTED_FIELD_KEYS as readonly string[]).includes(key)) {
      if (bag[key as RoutedKey] === undefined) bag[key as RoutedKey] = value;
      continue;
    }
    if (governed.has(key)) {
      throw fail("VALIDATION", `ข้อมูล "${key}" ของบริษัทแก้ได้จากเมนูเฉพาะของมัน (เช่น เปลี่ยนผู้ดูแล · ตั้งบริษัทแม่) — ในแบบฟอร์มฟิลด์จึงแสดงค่าอย่างเดียว`);
    }
    custom[key] = value;
  }
  return { merged, custom };
}

/** AUDIT-CLASS X6: ตัวตรวจชุดเดียวของทุกทางเข้า (สร้าง · แก้ · นำเข้า) — ค่าเสียตัวเดียว = ไม่เขียนอะไรเลย */
function cleanPatch(input: CompanyInput, mode: "create" | "update"): CleanPatch {
  const out: CleanPatch = {};
  if (mode === "create" || input.name !== undefined) {
    const name = textOrNull(input.name, "ชื่อบริษัท", COMPANY_NAME_MAX);
    if (!name) throw fail("VALIDATION", "ใส่ชื่อบริษัทก่อนบันทึก");
    out.name = name;
  }
  if (input.legalName !== undefined) out.legalName = textOrNull(input.legalName, "ชื่อตามทะเบียน", COMPANY_NAME_MAX);
  if (input.taxId !== undefined) {
    const p = taxIdProblem(input.taxId);
    if (p) throw fail("VALIDATION", p);
    out.taxId = normalizeCompanyTaxId(input.taxId) || null;
  }
  if (input.branchCode !== undefined) {
    const p = branchCodeProblem(input.branchCode);
    if (p) throw fail("VALIDATION", p);
    out.branchCode = String(input.branchCode ?? "").trim() || "00000";
  }
  if (input.emailDomain !== undefined) {
    const p = emailDomainProblem(input.emailDomain);
    if (p) throw fail("VALIDATION", p);
    out.emailDomain = normalizeEmailDomain(input.emailDomain) || null;
  }
  if (input.industry !== undefined) out.industry = textOrNull(input.industry, "อุตสาหกรรม", 100);
  if (input.size !== undefined) out.size = parseSize(input.size);
  if (input.website !== undefined) {
    // AUDIT-CLASS X6: http(s) เท่านั้น
    const p = websiteProblem(input.website);
    if (p) throw fail("VALIDATION", p);
    out.website = String(input.website ?? "").trim() || null;
  }
  if (input.phone !== undefined) {
    const p = phoneProblem(input.phone);
    if (p) throw fail("VALIDATION", p);
    out.phone = String(input.phone ?? "").trim() || null;
  }
  if (input.email !== undefined) {
    const p = emailProblem(input.email);
    if (p) throw fail("VALIDATION", p);
    out.email = String(input.email ?? "").trim().toLowerCase() || null;
  }
  if (input.note !== undefined) out.note = textOrNull(input.note, "โน้ต", COMPANY_NOTE_MAX);
  return out;
}

async function assertMember(ctx: CompaniesCtx, userId: string, db: Db = prisma): Promise<void> {
  const n = await db.membership.count({ where: { tenantId: ctx.tenantId, userId } });
  if (n === 0) throw fail("VALIDATION", "ผู้ดูแลที่เลือกไม่ได้อยู่ในร้านนี้ — เลือกใหม่จากรายชื่อทีม");
}

async function assertTeam(ctx: CompaniesCtx, teamId: string, db: Db = prisma): Promise<void> {
  const n = await db.team.count({ where: { id: teamId, tenantId: ctx.tenantId, archivedAt: null } });
  if (n === 0) throw fail("VALIDATION", "ไม่พบทีมที่เลือกในร้านนี้ — เลือกใหม่จากรายการทีม");
}

function parseRole(v: unknown, fallback: CompanyContactRole | null): CompanyContactRole {
  if (v === undefined || v === null || v === "") {
    if (fallback) return fallback;
    return "OTHER";
  }
  const s = String(v).trim().toUpperCase();
  if ((COMPANY_CONTACT_ROLES as readonly string[]).includes(s)) return s as CompanyContactRole;
  throw fail("VALIDATION", `บทบาทต้องเป็นหนึ่งใน ${Object.values(COMPANY_CONTACT_ROLE_LABEL).join(" · ")}`);
}

function reasonOf(opts: DangerOpts | null | undefined, what: string): string {
  // AUDIT-CLASS X9: การกระทำอันตรายต้องยืนยัน + เหตุผล ≥ COMPANY_REASON_MIN ตัวอักษร (ตรวจก่อนแตะอะไรทั้งหมด)
  if (opts?.confirm !== true) throw fail("CONFIRM_REQUIRED", `การ${what}ต้องกดยืนยันก่อน — ติ๊กช่องยืนยันแล้วลองอีกครั้ง`);
  const reason = String(opts?.reason ?? "").trim();
  if (reason.length < COMPANY_REASON_MIN) throw fail("VALIDATION", `ใส่เหตุผลของการ${what}อย่างน้อย ${COMPANY_REASON_MIN} ตัวอักษร เพื่อให้ทีมย้อนดูได้ว่าทำไป เพราะอะไร`);
  if (reason.length > 500) throw fail("VALIDATION", "เหตุผลยาวเกิน 500 ตัวอักษร — ย่อให้สั้นลง");
  return reason;
}

// ───────────────────────── ชื่อคล้าย (ตัวซ้ำ) ─────────────────────────

const LEGAL_WORDS: RegExp[] = [
  /ห้างหุ้นส่วนสามัญนิติบุคคล/g, /ห้างหุ้นส่วนจำกัด/g, /ห้างหุ้นส่วน/g, /บริษัทมหาชน/g, /บริษัท/g, /จำกัด/g, /มหาชน/g,
  /บจก\.?/g, /บมจ\.?/g, /หจก\.?/g, /หสน\.?/g,
  /\bco\.?,?\s*ltd\.?/gi, /\bcompany\b/gi, /\blimited\b/gi, /\bltd\.?/gi, /\bco\.?(?=\s|$)/gi, /\binc\.?/gi, /\bcorp(oration)?\.?/gi, /\bpcl\.?/gi, /\bplc\.?/gi,
];

/** ชื่อแกนสำหรับเทียบ — ตัดคำนำหน้า/ต่อท้ายนิติบุคคล · ตัวพิมพ์เล็ก · ตัดวรรคตอน */
export function companyNameCore(name: string): string {
  let s = ` ${String(name ?? "").toLowerCase()} `;
  for (const re of LEGAL_WORDS) s = s.replace(re, " ");
  return s.replace(/[()"'.,\-_/&]+/g, " ").replace(/\s+/g, " ").trim();
}

const NAME_SIMILAR_MIN = 0.85;

function nameScore(a: string, b: string): number {
  const ca = companyNameCore(a);
  const cb = companyNameCore(b);
  if (!ca || !cb) return 0;
  if (ca === cb) return 1;
  return party.nameSimilarity(ca, cb);
}

/** คำค้นที่ใช้ดึงบริษัทที่อาจชื่อคล้าย: คำที่ยาวที่สุดของชื่อแกน */
function nameProbe(name: string): string | null {
  const tokens = companyNameCore(name).split(" ").filter((t) => t.length >= 2);
  if (tokens.length === 0) return null;
  return tokens.sort((a, b) => b.length - a.length)[0]!.slice(0, 60);
}

async function findCandidates(ctx: CompaniesCtx, actor: MemberActor, input: { name: string; emailDomain?: string | null; excludeId?: string | null }): Promise<CompanyCandidate[]> {
  const probe = nameProbe(input.name);
  const OR: Prisma.CrmCompanyWhereInput[] = [];
  if (probe) OR.push({ name: { contains: probe, mode: "insensitive" } });
  if (input.emailDomain) OR.push({ emailDomain: input.emailDomain });
  if (OR.length === 0) return [];
  // ผลลัพธ์ส่งกลับให้ผู้ใช้เห็นชื่อ ⇒ ใช้ขอบเขตการมองเห็น (companyWhere) ไม่ใช่ identityScope
  const rows = await prisma.crmCompany.findMany({
    where: { AND: [await companyWhere(ctx, actor), { mergedIntoId: null, archivedAt: null, OR }, ...(input.excludeId ? [{ id: { not: input.excludeId } }] : [])] },
    select: { id: true, name: true, emailDomain: true },
    take: 300,
    orderBy: { createdAt: "desc" },
  });
  const out: CompanyCandidate[] = [];
  for (const r of rows) {
    if (input.emailDomain && r.emailDomain === input.emailDomain) {
      out.push({ companyId: r.id, name: r.name, reason: "DOMAIN" });
      continue;
    }
    const score = nameScore(input.name, r.name);
    if (score >= NAME_SIMILAR_MIN) out.push({ companyId: r.id, name: r.name, reason: "NAME", score: Math.round(score * 100) / 100 });
  }
  return out.sort((a, b) => (a.reason === b.reason ? (b.score ?? 1) - (a.score ?? 1) : a.reason === "DOMAIN" ? -1 : 1)).slice(0, 10);
}

// ═════════════════════════ สร้าง ═════════════════════════

type CreateCoreOpts = { partyId?: string | null; accountContactId?: string | null; custom?: Record<string, unknown> };
type CreateCoreResult = { row: CrmCompany; created: boolean };

/**
 * สร้างบริษัท 1 แถว (ธุรกรรมเดียว: Party → CrmCompany → ฟิลด์กำหนดเอง → event)
 * AUDIT-CLASS X3: เลขภาษีเดียวกันยิงพร้อมกัน ⇒ advisory lock ต่อ (ร้าน, เลขภาษี) — Party เป็นระดับร้าน จึงล็อกระดับร้าน ·
 *   อ่านซ้ำหลังได้ล็อก (READ COMMITTED) ⇒ ได้บริษัทเดียว Party เดียว · ผู้แพ้ได้ `created:false` + บริษัทเดิม (ไม่มี P2002 ดิบ)
 * ตัวซ้ำ = (เลขภาษี, สาขา) ในระบบนี้ รวมบริษัทที่เก็บถาวร (รีวิว SF6/หมายเหตุ) · ตัวตน (systemId, partyId) ซ้ำ = unique ของตาราง
 * B1: Party ที่ส่งมา (นำเข้าจากบัญชี) ที่ไม่ใช่ชนิด COMPANY ⇒ ไม่รับ — สร้าง/หา Party บริษัทของตัวเองแทน
 */
async function createCore(ctx: CompaniesCtx, actor: MemberActor, clean: CleanPatch, extra: { ownerUserId: string | null; teamId: string | null; parentCompanyId: string | null }, opts: CreateCoreOpts = {}): Promise<CreateCoreResult> {
  const custom = opts.custom ?? {};
  const taxId = clean.taxId ?? null;
  const branchCode = clean.branchCode ?? "00000";
  try {
    return await prisma.$transaction(async (tx) => {
      if (extra.parentCompanyId) await treeLock(tx, ctx);
      if (taxId) {
        await taxLock(tx, ctx, taxId);
        const dup = await tx.crmCompany.findFirst({
          where: { ...identityScope(ctx), taxId, branchCode, mergedIntoId: null },
          orderBy: [{ archivedAt: { sort: "asc", nulls: "first" } }, { createdAt: "asc" }],
        });
        if (dup) return { row: dup, created: false };
      }
      const given = opts.partyId ? await companyPartyOrNull(ctx, opts.partyId, tx) : null;
      const partyId = given ?? (await party.findOrCreateCompany(ctx.tenantId, { name: clean.name ?? "", taxId, branchCode }, tx)).id;
      await partyLock(tx, ctx, partyId);
      const same = await tx.crmCompany.findFirst({ where: { ...identityScope(ctx), partyId } });
      if (same) {
        if (opts.accountContactId && !same.accountContactId) {
          await tx.crmCompany.updateMany({ where: { id: same.id, accountContactId: null }, data: { accountContactId: opts.accountContactId } });
          return { row: { ...same, accountContactId: opts.accountContactId }, created: false };
        }
        return { row: same, created: false };
      }
      if (extra.parentCompanyId) {
        const parent = await tx.crmCompany.findFirst({ where: { ...identityScope(ctx), id: extra.parentCompanyId, mergedIntoId: null, archivedAt: null }, select: { id: true } });
        if (!parent) throw fail("VALIDATION", "บริษัทแม่ที่เลือกเพิ่งถูกเก็บถาวรหรือรวมไป — เลือกใหม่จากรายการ");
      }
      const row = await tx.crmCompany.create({
        data: {
          tenantId: ctx.tenantId,
          systemId: ctx.systemId,
          partyId,
          name: clean.name ?? "",
          legalName: clean.legalName ?? null,
          taxId,
          branchCode,
          industry: clean.industry ?? null,
          size: clean.size ?? null,
          website: clean.website ?? null,
          emailDomain: clean.emailDomain ?? null,
          phone: clean.phone ?? null,
          email: clean.email ?? null,
          note: clean.note ?? null,
          ownerUserId: extra.ownerUserId ?? ctx.actorUserId ?? null,
          teamId: extra.teamId,
          parentCompanyId: extra.parentCompanyId,
          accountContactId: opts.accountContactId ?? null,
        },
      });
      if (Object.keys(custom).length > 0) {
        await lockRecordForEngine(tx, row.id);
        await (await engine()).setFieldValues(fctx(ctx, actor), row.id, custom, { via: "STAFF", byUserId: ctx.actorUserId }, tx);
      }
      await emitCompanyEvent(tx, ctx, "created", row.id, "1", { companyId: row.id, partyId: row.partyId });
      return { row, created: true };
    }, TX_OPTS);
  } catch (e) {
    throw engineError(e);
  }
}

async function lockRecordForEngine(tx: Tx, id: string): Promise<void> {
  await (await engine()).lockRecordForFieldWrite(tx, id);
}

/** ผูก accountContactId ถ้าตัวตนนี้มีผู้ติดต่อในสมุดบัญชีที่เชื่อมอยู่แล้ว (อ่านอย่างเดียว · นอกธุรกรรม · เขียนแบบมีเงื่อนไข) */
async function linkExistingAccountContact(ctx: CompaniesCtx, row: CrmCompany): Promise<CrmCompany> {
  if (row.accountContactId) return row;
  const acc = await (await accountFacade()).accountSystemForCrm(ctx.tenantId, ctx.systemId, { partyId: row.partyId });
  if (!acc?.contactOfParty) return row;
  await prisma.crmCompany.updateMany({ where: { id: row.id, tenantId: ctx.tenantId, systemId: ctx.systemId, accountContactId: null }, data: { accountContactId: acc.contactOfParty } });
  return (await prisma.crmCompany.findFirst({ where: { id: row.id, tenantId: ctx.tenantId, systemId: ctx.systemId } })) ?? row;
}

export async function createCompany(ctx: CompaniesCtx, actor: MemberActor, input: CreateCompanyInput): Promise<CreateCompanyResult> {
  const a = await enter(ctx, actor);
  need(a, "crm.company.create");
  const { merged, custom } = await splitFields(input ?? ({} as CreateCompanyInput));
  const clean = cleanPatch(merged, "create");
  const ownerUserId = str(merged.ownerUserId);
  if (ownerUserId) await assertMember(ctx, ownerUserId);
  const teamId = str(merged.teamId);
  if (teamId) await assertTeam(ctx, teamId);
  const parentCompanyId = str(merged.parentCompanyId);
  if (parentCompanyId) {
    const parent = await prisma.crmCompany.findFirst({ where: { AND: [await companyWhere(ctx, a), { id: parentCompanyId, mergedIntoId: null, archivedAt: null }] }, select: { id: true } });
    if (!parent) throw fail("VALIDATION", "ไม่พบบริษัทแม่ที่เลือกในระบบ CRM นี้ — เลือกใหม่จากรายการ");
  }
  await seedCompanyFields(ctx, a);
  // ไม่มีเลขภาษี: หาบริษัทที่ "อาจซ้ำ" (โดเมนอีเมล → ชื่อคล้าย) ไว้บอกผู้ใช้ — ไม่รวมเงียบ ๆ (§11.1)
  const candidates = clean.taxId ? [] : await findCandidates(ctx, a, { name: clean.name ?? "", emailDomain: clean.emailDomain ?? null });
  const res = await createCore(ctx, a, clean, { ownerUserId, teamId, parentCompanyId }, { custom });
  if (!res.created) {
    return { company: toDto(res.row), created: false, duplicateOf: res.row.id, duplicateArchived: !!res.row.archivedAt, candidates: [] };
  }
  const row = await linkExistingAccountContact(ctx, res.row);
  await writeAudit({
    tenantId: ctx.tenantId,
    actorId: ctx.actorUserId,
    action: "crm.company.create",
    targetType: "CrmCompany",
    targetId: row.id,
    after: { partyId: row.partyId, fields: Object.keys(custom), candidates: candidates.map((c) => c.companyId) },
  });
  return { company: toDto(row), created: true, duplicateOf: null, candidates };
}

// ═════════════════════════ แก้ไข ═════════════════════════

const DIFF_KEYS: (keyof CleanPatch)[] = ["name", "legalName", "taxId", "branchCode", "emailDomain", "industry", "size", "website", "phone", "email", "note"];

export async function updateCompany(ctx: CompaniesCtx, actor: MemberActor, id: string, patch: UpdateCompanyInput): Promise<CompanyDto> {
  const a = await enter(ctx, actor);
  const current = await loadCompany(ctx, a, id, prisma, { live: true });
  need(a, "crm.company.update");
  const { merged, custom } = await splitFields((patch ?? {}) as CompanyInput);
  const clean = cleanPatch(merged, "update");
  await seedCompanyFields(ctx, a);
  const lockTax = clean.taxId && clean.taxId !== current.taxId ? clean.taxId : null;
  let changedKeys: string[] = [];
  let repointed = false;
  const before: Record<string, unknown> = {};
  const after: Record<string, unknown> = {};
  try {
    await prisma.$transaction(async (tx) => {
      // ลำดับล็อก (SF5): engine → เลขภาษี → Party → แถวบริษัท
      await lockRecordForEngine(tx, current.id);
      if (lockTax) await taxLock(tx, ctx, lockTax);
      const pre = await tx.crmCompany.findFirst({ where: { ...identityScope(ctx), id: current.id } });
      if (!pre) throw fail("NOT_FOUND", NOT_FOUND_MSG);
      const nextName = clean.name ?? pre.name;
      const nextTax = clean.taxId !== undefined ? clean.taxId : pre.taxId;
      const nextBranch = clean.branchCode ?? pre.branchCode ?? "00000";
      const nameChanged = nextName !== pre.name;
      const taxChanged = (nextTax ?? null) !== (pre.taxId ?? null) || nextBranch !== (pre.branchCode ?? "00000");
      // ── ตัดสินว่าตัวตน (Party) จะไปทางไหน (SF1 · B1) ──
      let mode: "none" | "write" | "repoint" = "none";
      let targetParty = pre.partyId;
      if (nameChanged || taxChanged) {
        const companyParty = await companyPartyOrNull(ctx, pre.partyId, tx);
        const sole = companyParty !== null && (await isSoleHolder(tx, ctx, pre.id, companyParty));
        if (sole) mode = "write";
        else if (taxChanged && nextTax) mode = "repoint";
        else if (companyParty === null) mode = "repoint"; // ผูกกับ Party ของ "คน" (ข้อมูลเก่า) → ย้ายไป Party บริษัทของตัวเอง
        if (mode === "repoint") targetParty = (await party.findOrCreateCompany(ctx.tenantId, { name: nextName, taxId: nextTax, branchCode: nextBranch }, tx)).id;
        await partyLock(tx, ctx, targetParty);
      }
      await lockCompanies(tx, ctx, [pre.id]);
      const row = await loadCompany(ctx, a, pre.id, tx, { live: true });
      if (row.partyId !== pre.partyId) throw fail("VALIDATION", RACE_MSG);
      const data: Prisma.CrmCompanyUpdateInput = {};
      const bag = data as Record<string, unknown>;
      for (const k of DIFF_KEYS) {
        if (clean[k] === undefined) continue;
        const next = clean[k];
        const prev = (row as Record<string, unknown>)[k] ?? null;
        if ((next ?? null) === prev) continue;
        bag[k] = next;
        before[k] = prev;
        after[k] = next;
      }
      if (taxChanged && nextTax) {
        // ตัวซ้ำ = (เลขภาษี, สาขา) ในระบบนี้ รวมที่เก็บถาวร (SF6/SF7 — identityScope ไม่ใช่ companyWhere)
        const dup = await tx.crmCompany.findFirst({
          where: { ...identityScope(ctx), taxId: nextTax, branchCode: nextBranch, mergedIntoId: null, id: { not: row.id } },
          select: { id: true },
        });
        if (dup) throw fail("DUPLICATE", "เลขภาษี (และสาขา) นี้เป็นของบริษัทอื่นในระบบนี้อยู่แล้ว — เปิดบริษัทนั้น หรือใช้เมนูรวมบริษัทซ้ำ", { duplicateOf: dup.id });
      }
      if (mode === "repoint" && targetParty !== row.partyId) {
        const holder = await tx.crmCompany.findFirst({ where: { ...identityScope(ctx), partyId: targetParty, id: { not: row.id } }, select: { id: true } });
        if (holder) throw fail("DUPLICATE", "ตัวตนใหม่นี้เป็นของบริษัทอื่นในระบบนี้อยู่แล้ว — ใช้เมนูรวมบริษัทซ้ำแทน", { duplicateOf: holder.id });
        bag.partyId = targetParty;
        // ผู้ติดต่อบัญชีเดิมเป็นของตัวตนเก่า — ผูกใหม่หลัง commit (ถ้าตัวตนใหม่มีผู้ติดต่อในสมุดที่เชื่อม)
        bag.accountContactId = null;
        before.partyId = row.partyId;
        after.partyId = targetParty;
        repointed = true;
      }
      const columnKeys = Object.keys(data);
      if (columnKeys.length > 0) {
        await tx.crmCompany.update({ where: { id: row.id }, data });
        // Party คือแหล่งจริงของชื่อ/เลขภาษีเมื่อบริษัทนี้ถือคนเดียว (มติข้อ 3/4 · SF1) — ใน tx เดียวกัน (event ล้ม = Party ไม่เปลี่ยนด้วย)
        if (mode === "write") {
          await party.updateCompanyIdentity(
            ctx.tenantId,
            row.partyId,
            { ...(nameChanged ? { name: nextName } : {}), ...(taxChanged ? { taxId: nextTax, branchCode: nextBranch } : {}) },
            tx,
          );
        }
      }
      let customChanged: string[] = [];
      if (Object.keys(custom).length > 0) {
        customChanged = (await (await engine()).setFieldValues(fctx(ctx, a), row.id, custom, { via: "STAFF", byUserId: ctx.actorUserId }, tx)).changed;
      }
      changedKeys = [...columnKeys, ...customChanged.map((k) => `f.${k}`)];
      if (changedKeys.length === 0) return;
      await emitCompanyEvent(tx, ctx, "updated", row.id, newSeq(), { companyId: row.id, changedKeys });
    }, TX_OPTS);
  } catch (e) {
    throw engineError(e);
  }
  if (repointed) {
    const fresh = await prisma.crmCompany.findFirst({ where: { ...identityScope(ctx), id: current.id } });
    if (fresh) await linkExistingAccountContact(ctx, fresh);
  }
  if (changedKeys.length > 0) {
    await writeAudit({ tenantId: ctx.tenantId, actorId: ctx.actorUserId, action: "crm.company.update", targetType: "CrmCompany", targetId: current.id, before, after: { ...after, changedKeys } });
  }
  return toDto(await loadCompany(ctx, a, current.id));
}

/** ข้อมูลของบริษัทเปลี่ยน (ผู้ดูแล/บริษัทแม่/เก็บถาวร) → event updated + audit */
async function simpleUpdate(
  ctx: CompaniesCtx,
  actor: MemberActor,
  id: string,
  action: string,
  changedKeys: string[],
  body: (tx: Tx, row: CrmCompany) => Promise<{ before?: unknown; after?: unknown; changed: boolean }>,
  opts: { live?: boolean; treeLock?: boolean } = {},
): Promise<CompanyDto> {
  const current = await loadCompany(ctx, actor, id, prisma, { live: opts.live ?? true });
  let audit: { before?: unknown; after?: unknown; changed: boolean } = { changed: false };
  await prisma.$transaction(async (tx) => {
    if (opts.treeLock) await treeLock(tx, ctx);
    await lockCompanies(tx, ctx, [current.id]);
    const row = await loadCompany(ctx, actor, current.id, tx, { live: opts.live ?? true });
    audit = await body(tx, row);
    if (audit.changed) await emitCompanyEvent(tx, ctx, "updated", row.id, newSeq(), { companyId: row.id, changedKeys });
  }, TX_OPTS);
  if (audit.changed) {
    await writeAudit({ tenantId: ctx.tenantId, actorId: ctx.actorUserId, action, targetType: "CrmCompany", targetId: current.id, before: audit.before, after: audit.after });
  }
  return toDto(await loadCompany(ctx, actor, current.id));
}

/** AUDIT-CLASS X9: เก็บถาวร = ยืนยัน + เหตุผล · แถวคงอยู่ (archivedAt) · แคชของผู้ติดต่อไม่ชี้บริษัทที่เก็บแล้ว */
export async function archiveCompany(ctx: CompaniesCtx, actor: MemberActor, id: string, opts: DangerOpts): Promise<CompanyDto> {
  const reason = reasonOf(opts, "เก็บถาวรบริษัท");
  const a = await enter(ctx, actor);
  await loadCompany(ctx, a, id);
  need(a, "crm.company.delete");
  return simpleUpdate(
    ctx,
    a,
    id,
    "crm.company.archive",
    ["archivedAt"],
    async (tx, row) => {
      if (row.archivedAt || row.mergedIntoId) return { changed: false };
      const res = await tx.crmCompany.updateMany({ where: { id: row.id, archivedAt: null, mergedIntoId: null }, data: { archivedAt: new Date() } });
      if (res.count === 0) return { changed: false };
      const linked = await tx.crmCompanyContact.findMany({ where: { companyId: row.id }, select: { contactId: true } });
      await lockContacts(tx, ctx, linked.map((l) => l.contactId));
      await recomputeContactCompanyCache(tx, ctx, linked.map((l) => l.contactId));
      return { changed: true, before: { archivedAt: null }, after: { archivedAt: "now", reason } };
    },
    { live: false },
  );
}

/**
 * กู้คืนบริษัทที่เก็บถาวร (รีวิว SF6) — AUDIT-CLASS X9: ยืนยัน + เหตุผล · audit เก็บเหตุผล
 * บริษัทที่ถูกรวมไปแล้วกู้ไม่ได้ · เลขภาษี (+สาขา) ที่ตอนนี้มีบริษัทอื่นใช้อยู่ = DUPLICATE (ตรวจใต้ล็อกเลขภาษี)
 */
export async function restoreCompany(ctx: CompaniesCtx, actor: MemberActor, id: string, opts: DangerOpts): Promise<CompanyDto> {
  const reason = reasonOf(opts, "กู้คืนบริษัท");
  const a = await enter(ctx, actor);
  const current = await loadCompany(ctx, a, id);
  need(a, "crm.company.delete");
  if (current.mergedIntoId) throw fail("VALIDATION", "บริษัทนี้ถูกรวมเข้ากับบริษัทอื่นแล้ว จึงกู้คืนไม่ได้ — เปิดบริษัทที่เก็บไว้แทน");
  if (!current.archivedAt) return toDto(current);
  let changed = false;
  await prisma.$transaction(async (tx) => {
    if (current.taxId) await taxLock(tx, ctx, current.taxId);
    await lockCompanies(tx, ctx, [current.id]);
    const row = await loadCompany(ctx, a, current.id, tx);
    if (row.mergedIntoId || !row.archivedAt) return;
    if (row.taxId) {
      const dup = await tx.crmCompany.findFirst({
        where: { ...identityScope(ctx), taxId: row.taxId, branchCode: row.branchCode ?? "00000", mergedIntoId: null, archivedAt: null, id: { not: row.id } },
        select: { id: true },
      });
      if (dup) throw fail("DUPLICATE", "เลขภาษีนี้มีบริษัทอื่นที่ใช้งานอยู่ในระบบนี้แล้ว — รวมสองบริษัทแทนการกู้คืน", { duplicateOf: dup.id });
    }
    await tx.crmCompany.update({ where: { id: row.id }, data: { archivedAt: null } });
    const linked = await tx.crmCompanyContact.findMany({ where: { companyId: row.id, endedAt: null }, select: { contactId: true } });
    await lockContacts(tx, ctx, linked.map((l) => l.contactId));
    await recomputeContactCompanyCache(tx, ctx, linked.map((l) => l.contactId));
    await emitCompanyEvent(tx, ctx, "updated", row.id, newSeq(), { companyId: row.id, changedKeys: ["archivedAt"] });
    changed = true;
  }, TX_OPTS);
  if (changed) {
    await writeAudit({ tenantId: ctx.tenantId, actorId: ctx.actorUserId, action: "crm.company.restore", targetType: "CrmCompany", targetId: current.id, before: { archivedAt: current.archivedAt }, after: { archivedAt: null, reason } });
  }
  return toDto(await loadCompany(ctx, a, current.id));
}

export async function setOwner(ctx: CompaniesCtx, actor: MemberActor, id: string, userId: string | null): Promise<CompanyDto> {
  const a = await enter(ctx, actor);
  await loadCompany(ctx, a, id, prisma, { live: true });
  need(a, "crm.company.update");
  const next = str(userId);
  if (next) await assertMember(ctx, next);
  return simpleUpdate(ctx, a, id, "crm.company.owner", ["ownerUserId"], async (tx, row) => {
    if ((row.ownerUserId ?? null) === next) return { changed: false };
    await tx.crmCompany.update({ where: { id: row.id }, data: { ownerUserId: next } });
    return { changed: true, before: { ownerUserId: row.ownerUserId }, after: { ownerUserId: next } };
  });
}

/** บริษัทแม่ (บริษัทในเครือ) — ระบบเดียวกัน · ตัวเอง/วงวน = VALIDATION · advisory lock ของต้นไม้ต่อระบบ กันสองคำสั่งสร้างวงพร้อมกัน */
export async function setParent(ctx: CompaniesCtx, actor: MemberActor, id: string, parentId: string | null): Promise<CompanyDto> {
  const a = await enter(ctx, actor);
  const child = await loadCompany(ctx, a, id, prisma, { live: true });
  need(a, "crm.company.update");
  const next = str(parentId);
  if (next === child.id) throw fail("VALIDATION", "บริษัทเป็นบริษัทแม่ของตัวเองไม่ได้ — เลือกบริษัทอื่น");
  if (next) {
    const parent = await prisma.crmCompany.findFirst({ where: { AND: [await companyWhere(ctx, a), { id: next, mergedIntoId: null, archivedAt: null }] }, select: { id: true } });
    if (!parent) throw fail("VALIDATION", "ไม่พบบริษัทแม่ที่เลือกในระบบ CRM นี้ — เลือกใหม่จากรายการ");
  }
  return simpleUpdate(
    ctx,
    a,
    child.id,
    "crm.company.parent",
    ["parentCompanyId"],
    async (tx, row) => {
      if ((row.parentCompanyId ?? null) === next) return { changed: false };
      if (next && (await ancestorsOf(tx, ctx, next)).includes(row.id)) {
        throw fail("VALIDATION", "ตั้งไม่ได้ — บริษัทที่เลือกเป็นบริษัทลูกของบริษัทนี้อยู่แล้ว (จะเกิดวงวน)");
      }
      await tx.crmCompany.update({ where: { id: row.id }, data: { parentCompanyId: next } });
      return { changed: true, before: { parentCompanyId: row.parentCompanyId }, after: { parentCompanyId: next } };
    },
    { treeLock: true },
  );
}

// ═════════════════════════ ผู้ติดต่อในบริษัท ═════════════════════════

async function loadContactInSystem(ctx: CompaniesCtx, actor: MemberActor, contactId: unknown, db: Db = prisma): Promise<{ id: string }> {
  const id = str(contactId);
  // AUDIT-CLASS X1: แม่ทั้งสองของลิงก์ต้องอยู่ระบบ CRM เดียวกัน (CRM-RUN §4 หมายเหตุ C1.1) — ผู้ติดต่อระบบอื่น/ร้านอื่น = ไม่พบ
  const row = id ? await db.crmContact.findFirst({ where: { AND: [await contactWhere(ctx, actor, { db }), { id, archivedAt: null, mergedIntoId: null }] }, select: { id: true } }) : null;
  if (!row) throw fail("NOT_FOUND", "ไม่พบผู้ติดต่อนี้ในระบบ CRM ที่เปิดอยู่ — รีเฟรชหน้าแล้วลองใหม่");
  return row;
}

/**
 * AUDIT-CLASS X3: ผู้ติดต่อหลัก **หนึ่งคนต่อบริษัท** — ทุกคำสั่งที่แตะลิงก์ถือล็อกแถวบริษัท (FOR UPDATE) ก่อน
 * ⇒ setPrimary พร้อมกันกี่ทาง/กี่โพรเซสก็เรียงคิวที่ฐานข้อมูล · ในล็อก: ปลดหลักคนอื่นทั้งหมดแล้วตั้งคนนี้ (สองคำสั่งใน tx เดียว)
 */
async function makePrimaryInTx(tx: Tx, companyId: string, contactId: string): Promise<string[]> {
  const prev = await tx.crmCompanyContact.findMany({ where: { companyId, isPrimary: true, contactId: { not: contactId } }, select: { contactId: true } });
  await tx.crmCompanyContact.updateMany({ where: { companyId, isPrimary: true, contactId: { not: contactId } }, data: { isPrimary: false } });
  await tx.crmCompanyContact.updateMany({ where: { companyId, contactId, endedAt: null }, data: { isPrimary: true } });
  return prev.map((p) => p.contactId);
}

export async function addContact(ctx: CompaniesCtx, actor: MemberActor, companyId: string, input: AddContactInput): Promise<AddContactResult> {
  const a = await enter(ctx, actor);
  const company = await loadCompany(ctx, a, companyId, prisma, { live: true });
  const contact = await loadContactInSystem(ctx, a, input?.contactId);
  need(a, "crm.company.update");
  const wantRole = input?.role === undefined || input?.role === null || input?.role === "" ? null : parseRole(input.role, null);
  const jobTitle = input?.jobTitle === undefined ? undefined : textOrNull(input.jobTitle, "ตำแหน่ง", COMPANY_TEXT_MAX);
  const wantPrimary = input?.isPrimary === true;
  let result: AddContactResult | null = null;
  let changed = false;
  await prisma.$transaction(async (tx) => {
    await lockCompanies(tx, ctx, [company.id]);
    await loadCompany(ctx, a, company.id, tx, { live: true });
    const existing = await tx.crmCompanyContact.findUnique({ where: { companyId_contactId: { companyId: company.id, contactId: contact.id } } });
    const prevPrimaries = wantPrimary
      ? (await tx.crmCompanyContact.findMany({ where: { companyId: company.id, isPrimary: true, contactId: { not: contact.id } }, select: { contactId: true } })).map((p) => p.contactId)
      : [];
    await lockContacts(tx, ctx, [contact.id, ...prevPrimaries]);
    let created = false;
    if (existing && !existing.endedAt) {
      // ลิงก์ยังใช้งานอยู่ = รับซ้ำแบบ idempotent (ไม่มีแถวที่สอง ไม่ทับบทบาทเดิม) · ขอเป็นหลัก = ตั้งหลักให้
      if (wantPrimary && !existing.isPrimary) {
        await makePrimaryInTx(tx, company.id, contact.id);
        changed = true;
      }
    } else if (existing) {
      await tx.crmCompanyContact.update({
        where: { id: existing.id },
        data: { endedAt: null, startedAt: new Date(), isPrimary: false, role: wantRole ?? existing.role, ...(jobTitle !== undefined ? { jobTitle } : {}) },
      });
      created = true;
      changed = true;
    } else {
      await tx.crmCompanyContact.create({
        data: { tenantId: ctx.tenantId, companyId: company.id, contactId: contact.id, role: wantRole ?? "OTHER", jobTitle: jobTitle ?? null, isPrimary: false, startedAt: new Date() },
      });
      created = true;
      changed = true;
    }
    if (created && wantPrimary) await makePrimaryInTx(tx, company.id, contact.id);
    if (changed) {
      await recomputeContactCompanyCache(tx, ctx, [contact.id, ...prevPrimaries]);
      await emitCompanyEvent(tx, ctx, "updated", company.id, newSeq(), { companyId: company.id, changedKeys: ["contacts"], contactId: contact.id });
    }
    const link = await tx.crmCompanyContact.findUniqueOrThrow({ where: { companyId_contactId: { companyId: company.id, contactId: contact.id } } });
    result = { companyId: company.id, contactId: contact.id, role: link.role as CompanyContactRole, jobTitle: link.jobTitle, isPrimary: link.isPrimary, created };
  }, TX_OPTS);
  const out = result as AddContactResult | null;
  if (!out) throw fail("VALIDATION", "เพิ่มผู้ติดต่อไม่สำเร็จ — ลองใหม่อีกครั้ง");
  await writeAudit({
    tenantId: ctx.tenantId,
    actorId: ctx.actorUserId,
    action: "crm.company.contact.add",
    targetType: "CrmCompany",
    targetId: company.id,
    after: { contactId: contact.id, role: out.role, isPrimary: out.isPrimary, created: out.created, changed },
  });
  return out;
}

/** ลิงก์ผู้ติดต่อของบริษัทที่ยังใช้งาน (บริษัทที่เก็บถาวร/ถูกรวม = แก้ไม่ได้ — หมายเหตุรีวิว) */
async function linkMutation(
  ctx: CompaniesCtx,
  actor: MemberActor,
  companyId: string,
  contactId: string,
  action: string,
  body: (tx: Tx, link: { id: string; companyId: string; contactId: string; isPrimary: boolean; role: CrmContactRole }) => Promise<{ affected: string[]; before?: unknown; after?: unknown; changed: boolean }>,
): Promise<void> {
  const company = await loadCompany(ctx, actor, companyId, prisma, { live: true });
  const cid = str(contactId);
  let audit: { before?: unknown; after?: unknown; changed: boolean } = { changed: false };
  await prisma.$transaction(async (tx) => {
    await lockCompanies(tx, ctx, [company.id]);
    await loadCompany(ctx, actor, company.id, tx, { live: true });
    const link = cid ? await tx.crmCompanyContact.findFirst({ where: { companyId: company.id, contactId: cid, endedAt: null, tenantId: ctx.tenantId } }) : null;
    if (!link) throw fail("NOT_FOUND", "ผู้ติดต่อนี้ไม่ได้อยู่ในบริษัทนี้แล้ว — รีเฟรชหน้าแล้วลองใหม่");
    const prevPrimaries = (await tx.crmCompanyContact.findMany({ where: { companyId: company.id, isPrimary: true }, select: { contactId: true } })).map((p) => p.contactId);
    await lockContacts(tx, ctx, [link.contactId, ...prevPrimaries]);
    const res = await body(tx, link);
    audit = res;
    if (!res.changed) return;
    await recomputeContactCompanyCache(tx, ctx, [link.contactId, ...res.affected]);
    await emitCompanyEvent(tx, ctx, "updated", company.id, newSeq(), { companyId: company.id, changedKeys: ["contacts"], contactId: link.contactId });
  }, TX_OPTS);
  await writeAudit({ tenantId: ctx.tenantId, actorId: ctx.actorUserId, action, targetType: "CrmCompany", targetId: company.id, before: audit.before, after: { ...(audit.after as object), contactId: cid } });
}

/** ถอดผู้ติดต่อ — แถวคงอยู่ (endedAt = ประวัติ) · หลุดจากการเป็นหลัก · แคช companyId ของเขาคำนวณใหม่ */
export async function removeContact(ctx: CompaniesCtx, actor: MemberActor, companyId: string, contactId: string): Promise<{ ok: true }> {
  const a = await enter(ctx, actor);
  await loadCompany(ctx, a, companyId);
  need(a, "crm.company.update");
  await linkMutation(ctx, a, companyId, contactId, "crm.company.contact.remove", async (tx, link) => {
    await tx.crmCompanyContact.updateMany({ where: { id: link.id, endedAt: null }, data: { endedAt: new Date(), isPrimary: false } });
    return { affected: [], changed: true, before: { role: link.role, isPrimary: link.isPrimary }, after: { endedAt: "now" } };
  });
  return { ok: true };
}

export async function setPrimary(ctx: CompaniesCtx, actor: MemberActor, companyId: string, contactId: string): Promise<{ ok: true }> {
  const a = await enter(ctx, actor);
  await loadCompany(ctx, a, companyId);
  need(a, "crm.company.update");
  await linkMutation(ctx, a, companyId, contactId, "crm.company.contact.primary", async (tx, link) => {
    // คนนี้เป็นหลักอยู่แล้ว = ยังล้างหลักซ้อน (ถ้ามีจากข้อมูลเก่า) ให้เหลือคนเดียว
    const others = await makePrimaryInTx(tx, link.companyId, link.contactId);
    return { affected: others, changed: !link.isPrimary || others.length > 0, before: { primary: others }, after: { isPrimary: true } };
  });
  return { ok: true };
}

export async function setRole(ctx: CompaniesCtx, actor: MemberActor, companyId: string, contactId: string, role: string): Promise<{ ok: true }> {
  const next = parseRole(role, null);
  const a = await enter(ctx, actor);
  await loadCompany(ctx, a, companyId);
  need(a, "crm.company.update");
  await linkMutation(ctx, a, companyId, contactId, "crm.company.contact.role", async (tx, link) => {
    if (link.role === next) return { affected: [], changed: false };
    await tx.crmCompanyContact.update({ where: { id: link.id }, data: { role: next } });
    return { affected: [], changed: true, before: { role: link.role }, after: { role: next } };
  });
  return { ok: true };
}

// ═════════════════════════ 360 ═════════════════════════

export async function getCompany360(ctx: CompaniesCtx, actor: MemberActor, id: string): Promise<Company360> {
  const a = await enter(ctx, actor);
  const row = await loadCompany(ctx, a, id);
  const acc = await (await accountFacade()).accountSystemForCrm(ctx.tenantId, ctx.systemId);

  // R-A (รีวิว SF8): ลิงก์/ดีล/กิจกรรมผ่านตัวช่วยของ where.ts — C1.7 เปลี่ยนการมองเห็นที่ไฟล์เดียว
  const [links, deals, agg, parent, subs, owner, team, activities] = await Promise.all([
    prisma.crmCompanyContact.findMany({
      where: { companyId: row.id, tenantId: ctx.tenantId, endedAt: null, contact: await contactWhere(ctx, a) },
      include: { contact: { select: { id: true, name: true, phone: true, email: true, lineUserId: true } } },
      orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
    }),
    prisma.crmDeal.findMany({
      where: { AND: [await dealWhere(ctx, a), { companyId: row.id }] },
      include: { stage: { select: { name: true } } },
      orderBy: [{ createdAt: "desc" }],
      take: 500,
    }),
    // R-E.8: ผลรวมข้ามดีลคำนวณในฐานข้อมูล (bigint) ไม่ใช่บวกใน JS
    prisma.crmDeal.groupBy({ by: ["kind"], where: { AND: [await dealWhere(ctx, a), { companyId: row.id }] }, _count: { _all: true }, _sum: { wonValueSatang: true } }),
    row.parentCompanyId
      ? prisma.crmCompany.findFirst({ where: { AND: [await companyWhere(ctx, a), { id: row.parentCompanyId }] }, select: { id: true, name: true } })
      : Promise.resolve(null),
    prisma.crmCompany.findMany({ where: { AND: [await companyWhere(ctx, a), { parentCompanyId: row.id, mergedIntoId: null }] }, select: { id: true, name: true }, orderBy: { name: "asc" }, take: 200 }),
    row.ownerUserId
      ? prisma.membership.findFirst({ where: { tenantId: ctx.tenantId, userId: row.ownerUserId }, select: { user: { select: { id: true, name: true } } } })
      : Promise.resolve(null),
    row.teamId ? prisma.team.findFirst({ where: { id: row.teamId, tenantId: ctx.tenantId }, select: { id: true, name: true } }) : Promise.resolve(null),
    // ไทม์ไลน์ = กิจกรรม "เกี่ยวกับบริษัทนี้" เท่านั้น (ผูกบริษัท หรือผูกดีลของบริษัท) — ไม่ใช่ทุกกิจกรรมของผู้ติดต่อ (SF8)
    prisma.crmActivity.findMany({
      where: { AND: [await activityWhere(ctx, a), { OR: [{ companyId: row.id }, { deal: { companyId: row.id } }] }] },
      include: { contact: { select: { name: true } } },
      orderBy: [{ createdAt: "desc" }],
      take: 50,
    }),
  ]);

  const [outstanding, docs, objectTabs] = await Promise.all([
    liveOutstanding(ctx, row.accountContactId),
    acc ? (await accountFacade()).listDocsByParty(ctx.tenantId, row.partyId, { take: 100 }) : Promise.resolve([]),
    objects.tabsFor(ctx, a, "COMPANY", row.id).catch(() => []),
  ]);

  const contacts: CompanyContactRow[] = links.map((l) => ({
    contactId: l.contactId,
    name: l.contact.name,
    role: l.role as CompanyContactRole,
    roleLabel: COMPANY_CONTACT_ROLE_LABEL[l.role as CompanyContactRole] ?? l.role,
    jobTitle: l.jobTitle,
    isPrimary: l.isPrimary,
    channel: l.contact.lineUserId ? "LINE" : l.contact.email ? "EMAIL" : l.contact.phone ? "PHONE" : null,
    startedAt: l.startedAt,
  }));
  const dealRows: CompanyDealRow[] = deals.map((d) => ({
    id: d.id,
    title: d.title,
    stageName: d.stage?.name ?? "",
    kind: d.kind,
    valueSatang: d.valueSatang,
    wonValueSatang: d.wonValueSatang === null ? null : Number(d.wonValueSatang),
    expectedCloseAt: d.expectedCloseAt,
    closedAt: d.closedAt,
  }));
  const documents: CompanyDocRow[] = docs
    .filter((d) => d.systemId === acc?.systemId)
    .map((d) => ({ id: d.id, docNo: d.docNo, docType: d.docType, docLabel: d.docLabel, status: d.status, statusLabel: d.statusLabel, totalSatang: d.totalSatang, issuedAt: d.issuedAt, href: d.href }));
  const timeline: CompanyTimelineItem[] = activities.map((t) => ({
    id: t.id,
    at: t.startAt ?? t.doneAt ?? t.createdAt,
    type: t.type,
    title: t.title,
    source: t.source,
    contactId: t.contactId,
    contactName: t.contact?.name ?? null,
    dealId: t.dealId,
  }));
  timeline.sort((x, y) => y.at.getTime() - x.at.getTime());
  const open = agg.find((g) => g.kind === "OPEN");
  const won = agg.find((g) => g.kind === "WON");
  // ACCEPTANCE-FIX (controller · C1.3 parity): ดีล WON ก่อน C1.5 ไม่มี wonValueSatang ⇒ นับ valueSatang แทน (สูตรเดียวกับ recompute)
  const wonNoSnap = won ? await prisma.crmDeal.aggregate({ where: { AND: [await dealWhere(ctx, a), { companyId: row.id, kind: "WON", wonValueSatang: null }] }, _sum: { valueSatang: true } }) : null;
  return {
    company: toDto(row),
    owner: owner?.user ? { id: owner.user.id, name: owner.user.name ?? "ผู้ใช้" } : null,
    team: team ? { id: team.id, name: team.name } : null,
    kpis: {
      openDealCount: open?._count._all ?? 0,
      wonDealCount: won?._count._all ?? 0,
      wonValueSatang: toNum(won?._sum.wonValueSatang ?? 0) + toNum(wonNoSnap?._sum.valueSatang ?? 0),
      outstandingSatang: outstanding,
      lastActivityAt: row.lastActivityAt,
    },
    contacts,
    deals: dealRows,
    documents,
    timeline,
    parent: parent ? { id: parent.id, name: parent.name } : null,
    subsidiaries: subs.map((s) => ({ id: s.id, name: s.name })),
    objectTabs: objectTabs.map((t) => ({ objectKey: t.objectKey, label: t.label, labelPlural: t.labelPlural, count: t.count })),
    accountLinked: !!acc,
  };
}

// ═════════════════════════ รายการ ═════════════════════════

const SORTS: Record<CompanySort, Prisma.CrmCompanyOrderByWithRelationInput[]> = {
  name: [{ name: "asc" }, { id: "asc" }],
  "-name": [{ name: "desc" }, { id: "desc" }],
  createdAt: [{ createdAt: "asc" }, { id: "asc" }],
  "-createdAt": [{ createdAt: "desc" }, { id: "desc" }],
  lastActivityAt: [{ lastActivityAt: { sort: "asc", nulls: "last" } }, { id: "asc" }],
  "-lastActivityAt": [{ lastActivityAt: { sort: "desc", nulls: "last" } }, { id: "desc" }],
  openDealCount: [{ openDealCount: "asc" }, { id: "asc" }],
  "-openDealCount": [{ openDealCount: "desc" }, { id: "desc" }],
  wonValueSatang: [{ wonValueSatang: "asc" }, { id: "asc" }],
  "-wonValueSatang": [{ wonValueSatang: "desc" }, { id: "desc" }],
};

async function listWhere(ctx: CompaniesCtx, actor: MemberActor, input: CompanyListInput): Promise<Prisma.CrmCompanyWhereInput> {
  // AUDIT-CLASS X1: ขอบเขตผ่าน companyWhere เสมอ · บริษัทที่ถูกรวมไม่โผล่ในรายการ (แถวคงอยู่เป็นประวัติ)
  const AND: Prisma.CrmCompanyWhereInput[] = [await companyWhere(ctx, actor), { mergedIntoId: null }];
  if (!input.includeArchived) AND.push({ archivedAt: null });
  const q = str(input.q)?.slice(0, 100);
  if (q) {
    const digits = q.replace(/[\s-]/g, "");
    AND.push({
      OR: [
        { name: { contains: q, mode: "insensitive" } },
        { legalName: { contains: q, mode: "insensitive" } },
        { emailDomain: { contains: q.toLowerCase() } },
        ...(/^\d{3,13}$/.test(digits) ? [{ taxId: { contains: digits } }] : []),
      ],
    });
  }
  const owner = str(input.owner);
  if (owner) AND.push(owner === "none" ? { ownerUserId: null } : { ownerUserId: owner });
  const team = str(input.team);
  if (team) AND.push({ teamId: team });
  const industry = str(input.industry);
  if (industry) AND.push({ industry: { equals: industry, mode: "insensitive" } });
  if (input.size !== undefined && input.size !== null && input.size !== "") AND.push({ size: parseSize(input.size) });
  if (input.hasOpenDeals === true) AND.push({ openDealCount: { gt: 0 } });
  if (input.hasOpenDeals === false) AND.push({ openDealCount: 0 });
  const filters = input.f ?? {};
  if (Object.keys(filters).length > 0) {
    // ตัวกรอง f.{key} = engine ตัวเดียว (objectKey "company") · key ที่ไม่มี/กรองไม่ได้/อ่อนไหวไม่มีสิทธิ์ = VALIDATION
    try {
      AND.push((await (await engine()).fieldFilterWhere(fctx(ctx, actor), filters)) as Prisma.CrmCompanyWhereInput);
    } catch (e) {
      throw engineError(e);
    }
  }
  return { AND };
}

export async function listCompanies(ctx: CompaniesCtx, actor: MemberActor, input: CompanyListInput = {}): Promise<CompanyListResult> {
  const a = await enter(ctx, actor);
  const where = await listWhere(ctx, a, input ?? {});
  const pageSize = Math.min(COMPANY_PAGE_MAX, Math.max(1, Math.floor(Number(input?.pageSize) || 50)));
  const page = Math.max(1, Math.floor(Number(input?.page) || 1));
  const sortKey = input?.sort;
  const orderBy = typeof sortKey === "string" && Object.hasOwn(SORTS, sortKey) ? SORTS[sortKey] : SORTS.name;
  const [total, rows] = await Promise.all([
    prisma.crmCompany.count({ where }),
    prisma.crmCompany.findMany({ where, orderBy, skip: (page - 1) * pageSize, take: pageSize }),
  ]);
  return { items: rows.map(toDto), total, page, pageSize };
}

/**
 * AUDIT-CLASS X6: ทุกบรรทัดสร้างด้วย `csvRow` (ช่องที่ขึ้นต้น = + - @ ถูกทำให้เป็นข้อความ) · ขอบเขตเดียวกับรายการ (companyWhere)
 * เพดาน COMPANY_EXPORT_MAX_ROWS — เกิน = ปฏิเสธ (ให้กรองให้แคบลง) ไม่ใช่ตัดท้ายเงียบ ๆ
 */
export async function exportCompanies(ctx: CompaniesCtx, actor: MemberActor, opts: Omit<CompanyListInput, "page" | "pageSize" | "sort"> = {}): Promise<string> {
  const a = await enter(ctx, actor);
  const where = await listWhere(ctx, a, opts ?? {});
  const total = await prisma.crmCompany.count({ where });
  if (total > COMPANY_EXPORT_MAX_ROWS) {
    throw fail("VALIDATION", `ส่งออกได้ครั้งละไม่เกิน ${COMPANY_EXPORT_MAX_ROWS.toLocaleString("th-TH")} บริษัท (ตัวกรองนี้มี ${total.toLocaleString("th-TH")} บริษัท) — กรองให้แคบลงแล้วส่งออกเป็นรอบ`);
  }
  const lines = [csvRow(["name", "legalName", "taxId", "branchCode", "industry", "size", "website", "emailDomain", "phone", "email", "openDeals", "wonValueBaht", "outstandingBaht", "createdAt"])];
  let cursor: string | null = null;
  let count = 0;
  for (;;) {
    const batch: CrmCompany[] = await prisma.crmCompany.findMany({ where, orderBy: { id: "asc" }, take: 1_000, ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}) });
    for (const r of batch) {
      if (count >= COMPANY_EXPORT_MAX_ROWS) break;
      lines.push(
        csvRow([
          r.name, r.legalName, r.taxId, r.branchCode, r.industry, r.size ? COMPANY_SIZE_LABEL[r.size as CompanySize] : null, r.website, r.emailDomain, r.phone, r.email,
          r.openDealCount, Math.round(toNum(r.wonValueSatang) / 100), Math.round(toNum(r.outstandingSatang) / 100), r.createdAt.toISOString(),
        ]),
      );
      count += 1;
    }
    if (batch.length < 1_000 || count >= COMPANY_EXPORT_MAX_ROWS) break;
    cursor = batch[batch.length - 1]!.id;
  }
  await writeAudit({ tenantId: ctx.tenantId, actorId: ctx.actorUserId, action: "crm.company.export", targetType: "AppSystem", targetId: ctx.systemId, after: { rows: count } });
  return lines.join("\n");
}

// ═════════════════════════ ตัวซ้ำ · รวม ═════════════════════════

const DUP_SCAN_MAX = 5_000;

/** คู่ที่อาจซ้ำ: (เลขภาษี, สาขา) เดียวกัน (แน่นอน) → โดเมนอีเมลเดียวกัน → ชื่อคล้าย (§11.1) — เฉพาะบริษัทที่ยังใช้งาน */
export async function findDuplicates(ctx: CompaniesCtx, actor: MemberActor, opts: { limit?: number } = {}): Promise<{ items: DuplicatePairDto[] }> {
  const a = await enter(ctx, actor);
  const rows = await prisma.crmCompany.findMany({
    where: { AND: [await companyWhere(ctx, a), { mergedIntoId: null, archivedAt: null }] },
    select: { id: true, name: true, taxId: true, branchCode: true, emailDomain: true },
    orderBy: { createdAt: "desc" },
    take: DUP_SCAN_MAX,
  });
  const limit = Math.min(500, Math.max(1, Math.floor(Number(opts?.limit) || 200)));
  const seen = new Set<string>();
  const items: DuplicatePairDto[] = [];
  const byId = new Map(rows.map((r) => [r.id, r]));
  const add = (x: string, y: string, reason: DuplicateReason, score?: number) => {
    const [p, q] = x < y ? [x, y] : [y, x];
    const key = `${p}#${q}`;
    if (seen.has(key)) return;
    seen.add(key);
    items.push({ aId: p, aName: byId.get(p)?.name ?? "", bId: q, bName: byId.get(q)?.name ?? "", reason, ...(score !== undefined ? { score } : {}) });
  };
  const group = (keyOf: (r: (typeof rows)[number]) => string | null, reason: DuplicateReason) => {
    const m = new Map<string, string[]>();
    for (const r of rows) {
      const k = keyOf(r);
      if (k) m.set(k, [...(m.get(k) ?? []), r.id]);
    }
    for (const ids of m.values()) for (let i = 0; i < ids.length; i += 1) for (let j = i + 1; j < ids.length; j += 1) add(ids[i]!, ids[j]!, reason);
  };
  group((r) => (r.taxId ? `${r.taxId}#${r.branchCode ?? "00000"}` : null), "TAX_ID");
  group((r) => r.emailDomain, "DOMAIN");
  // ชื่อคล้าย: เทียบในกลุ่มที่ชื่อแกนขึ้นต้นเหมือนกัน (2 ตัวแรก) — O(n²) เฉพาะในถัง ไม่ใช่ทั้งระบบ
  const buckets = new Map<string, { id: string; name: string }[]>();
  for (const r of rows) {
    const core = companyNameCore(r.name);
    if (!core) continue;
    const k = core.slice(0, 2);
    buckets.set(k, [...(buckets.get(k) ?? []), { id: r.id, name: r.name }]);
  }
  for (const list of buckets.values()) {
    for (let i = 0; i < list.length; i += 1) {
      for (let j = i + 1; j < list.length; j += 1) {
        const s = nameScore(list[i]!.name, list[j]!.name);
        if (s >= NAME_SIMILAR_MIN) add(list[i]!.id, list[j]!.id, "NAME", Math.round(s * 100) / 100);
      }
    }
  }
  const rank: Record<DuplicateReason, number> = { TAX_ID: 0, DOMAIN: 1, NAME: 2 };
  items.sort((x, y) => rank[x.reason] - rank[y.reason] || (y.score ?? 1) - (x.score ?? 1));
  return { items: items.slice(0, limit) };
}

/**
 * รวมบริษัท (§11.1 · มติข้อ 7 · รีวิว B1/SF2/SF3/SF4) — AUDIT-CLASS X9: ยืนยัน + เหตุผล · AUDIT-CLASS X1: ทั้งสอง id ต้องอยู่ในขอบเขต
 * เลขภาษีมีทั้งคู่แต่ต่างกัน = คนละนิติบุคคล → ปฏิเสธ · เลขภาษี/สาขาของบริษัทที่ถูกรวมเติมให้บริษัทที่เก็บไว้เมื่ออีกฝั่งว่าง
 * ธุรกรรม CRM (ลำดับล็อก: ต้นไม้ → เลขภาษี → แถวบริษัททุกแถวที่แตะ เรียง id → ผู้ติดต่อ): ย้ายลิงก์ผู้ติดต่อ (บทบาทชน = ของที่เก็บไว้ชนะ) ·
 *   ดีล · กิจกรรม · บริษัทลูก → ตรวจวงวนแบบ setParent → แถวที่ถูกรวมคงอยู่ (mergedIntoId + archivedAt) →
 *   Party รวมเฉพาะเมื่อทั้งสองฝั่งเป็น Party บริษัท (B1) → แคชผู้ติดต่อ + แคชดีล → event merged
 * หลัง commit (ไม่ย้อนส่วน CRM · ความล้มเหลวรายงานใน `warnings`): เอกสารบัญชีผ่าน facade `mergeContacts` **เฉพาะผู้มีสิทธิ์
 *   `account.contact.merge`** (ไม่มี = ข้าม · accountMergeSkipped) · วัตถุกำหนดเองผ่าน objects.records.move · แคชยอดค้าง
 */
export async function mergeCompanies(ctx: CompaniesCtx, actor: MemberActor, input: MergeCompaniesInput): Promise<MergeCompaniesResult> {
  const reason = reasonOf(input, "รวมบริษัท");
  const a = await enter(ctx, actor);
  const keep = await loadCompany(ctx, a, input?.keepId, prisma, { live: true });
  const drop = await loadCompany(ctx, a, input?.mergeId, prisma, { live: true });
  need(a, "crm.company.merge");
  if (keep.id === drop.id) throw fail("VALIDATION", "เลือกบริษัทเดียวกันทั้งสองช่อง — เลือกบริษัทที่จะรวมเป็นอีกบริษัทหนึ่ง");
  const differentEntity = (k: CrmCompany, m: CrmCompany) => !!k.taxId && !!m.taxId && k.taxId !== m.taxId;
  const DIFF_MSG = "สองบริษัทนี้มีเลขประจำตัวผู้เสียภาษีต่างกัน แปลว่าเป็นคนละนิติบุคคล จึงรวมกันไม่ได้ — ตรวจเลขภาษีของแต่ละบริษัทก่อน";
  if (differentEntity(keep, drop)) throw fail("VALIDATION", DIFF_MSG);
  const carryTax = !keep.taxId && drop.taxId ? { taxId: drop.taxId, branchCode: drop.branchCode ?? "00000" } : null;
  const choices = input.fieldChoices ?? {};
  const moved = { contacts: 0, contactsDeduped: 0, deals: 0, activities: 0, subsidiaries: 0, records: 0 };
  let keptAc: string | null = keep.accountContactId;
  await prisma.$transaction(async (tx) => {
    await treeLock(tx, ctx);
    if (carryTax) await taxLock(tx, ctx, carryTax.taxId);
    const children = (await tx.crmCompany.findMany({ where: { ...identityScope(ctx), parentCompanyId: drop.id, id: { not: keep.id } }, select: { id: true } })).map((c) => c.id);
    // SF4: ทุกแถวบริษัทที่แตะ ล็อกครั้งเดียวตั้งแต่ต้น เรียง id
    await lockCompanies(tx, ctx, [keep.id, drop.id, ...children]);
    const k = await loadCompany(ctx, a, keep.id, tx, { live: true });
    const m = await loadCompany(ctx, a, drop.id, tx, { live: true });
    if (differentEntity(k, m)) throw fail("VALIDATION", DIFF_MSG);
    if (carryTax) {
      const dup = await tx.crmCompany.findFirst({
        where: { ...identityScope(ctx), taxId: carryTax.taxId, branchCode: carryTax.branchCode, mergedIntoId: null, id: { notIn: [k.id, m.id] } },
        select: { id: true },
      });
      if (dup) throw fail("DUPLICATE", "เลขภาษีของบริษัทที่ถูกรวมเป็นของบริษัทที่สามในระบบนี้ด้วย — รวมบริษัทนั้นก่อน", { duplicateOf: dup.id });
    }
    const mLinks = await tx.crmCompanyContact.findMany({ where: { companyId: m.id, endedAt: null } });
    const kLinks = await tx.crmCompanyContact.findMany({ where: { companyId: k.id } });
    const cached = await tx.crmContact.findMany({ where: { tenantId: ctx.tenantId, systemId: ctx.systemId, companyId: m.id }, select: { id: true } });
    const touched = [...new Set([...mLinks.map((l) => l.contactId), ...cached.map((c) => c.id)])];
    await lockContacts(tx, ctx, touched);
    const kByContact = new Map(kLinks.map((l) => [l.contactId, l]));
    const kHasPrimary = kLinks.some((l) => l.isPrimary && !l.endedAt);
    const now = new Date();
    for (const l of mLinks) {
      const kl = kByContact.get(l.contactId);
      if (kl && !kl.endedAt) {
        // บทบาทชน → ของบริษัทที่เก็บไว้ชนะ · แถวของบริษัทที่ถูกรวมปิดเป็นประวัติ
        await tx.crmCompanyContact.update({ where: { id: l.id }, data: { endedAt: now, isPrimary: false } });
        moved.contactsDeduped += 1;
      } else if (kl) {
        await tx.crmCompanyContact.update({ where: { id: kl.id }, data: { endedAt: null, startedAt: now, role: l.role, jobTitle: l.jobTitle ?? kl.jobTitle, isPrimary: false } });
        await tx.crmCompanyContact.update({ where: { id: l.id }, data: { endedAt: now, isPrimary: false } });
        moved.contacts += 1;
      } else {
        await tx.crmCompanyContact.update({ where: { id: l.id }, data: { companyId: k.id, isPrimary: l.isPrimary && !kHasPrimary } });
        moved.contacts += 1;
      }
    }
    moved.deals = (await tx.crmDeal.updateMany({ where: { tenantId: ctx.tenantId, systemId: ctx.systemId, companyId: m.id }, data: { companyId: k.id } })).count;
    moved.activities = (await tx.crmActivity.updateMany({ where: { tenantId: ctx.tenantId, systemId: ctx.systemId, companyId: m.id }, data: { companyId: k.id } })).count;
    if (children.length) {
      moved.subsidiaries = (await tx.crmCompany.updateMany({ where: { ...identityScope(ctx), id: { in: children }, parentCompanyId: m.id }, data: { parentCompanyId: k.id } })).count;
    }
    const keepData: Prisma.CrmCompanyUpdateInput = {};
    const bag = keepData as Record<string, unknown>;
    for (const f of MERGE_CHOICE_FIELDS) {
      const kv = (k as Record<string, unknown>)[f] ?? null;
      const mv = (m as Record<string, unknown>)[f] ?? null;
      if (choices[f] === "merge" || (kv === null && mv !== null)) if (mv !== kv) bag[f] = mv;
    }
    if (carryTax) {
      keepData.taxId = carryTax.taxId;
      keepData.branchCode = carryTax.branchCode;
    }
    if (k.parentCompanyId === m.id) keepData.parentCompanyId = m.parentCompanyId === k.id ? null : m.parentCompanyId;
    if (!k.accountContactId && m.accountContactId) {
      keepData.accountContactId = m.accountContactId;
      keptAc = m.accountContactId;
    }
    if (m.lastActivityAt && (!k.lastActivityAt || m.lastActivityAt > k.lastActivityAt)) keepData.lastActivityAt = m.lastActivityAt;
    if (Object.keys(keepData).length > 0) await tx.crmCompany.update({ where: { id: k.id }, data: keepData });
    await tx.crmCompany.update({ where: { id: m.id }, data: { mergedIntoId: k.id, archivedAt: now } });
    // SF4: ตรวจวงวนแบบเดียวกับ setParent หลังย้ายบริษัทลูก (เช่น บริษัทที่เก็บไว้อยู่ใต้บริษัทลูกของบริษัทที่ถูกรวม)
    //   ทุกเส้นใหม่ชี้เข้า k ⇒ ถ้ามีวง วงนั้นต้องผ่าน k — เดินจากบริษัทแม่ของ k ขึ้นไปแล้วเจอ k = วงวน
    if (await hasCycleFrom(tx, ctx, k.id)) {
      throw fail("VALIDATION", "รวมไม่ได้ — บริษัทที่เก็บไว้อยู่ใต้บริษัทในเครือของบริษัทที่ถูกรวม (จะเกิดวงวนบริษัทแม่-ลูก) · ย้ายบริษัทแม่ของบริษัทที่เก็บไว้ออกก่อน");
    }
    // B1: รวมตัวตนกลางเฉพาะเมื่อทั้งสองฝั่งเป็น Party บริษัท — ไม่แตะตัวตนของคน
    const kp = await companyPartyOrNull(ctx, k.partyId, tx);
    const mp = await companyPartyOrNull(ctx, m.partyId, tx);
    if (kp && mp && kp !== mp) await party.mergeParties(ctx.tenantId, kp, mp, tx);
    // SF3 + SF1: เลขภาษีที่เติมให้บริษัทที่เก็บไว้ → Party ของมันด้วย เมื่อบริษัทนี้ถือ Party คนเดียว
    if (carryTax && kp && (await isSoleHolder(tx, ctx, k.id, kp))) {
      await party.updateCompanyIdentity(ctx.tenantId, kp, { taxId: carryTax.taxId, branchCode: carryTax.branchCode }, tx);
    }
    await recomputeContactCompanyCache(tx, ctx, touched);
    await recomputeCachesInTx(tx, ctx, k.id);
    await recomputeCachesInTx(tx, ctx, m.id, 0);
    await emitCompanyEvent(tx, ctx, "merged", m.id, newSeq(), { keptId: k.id, mergedId: m.id });
  }, TX_OPTS);

  // ── หลัง commit: ส่วน CRM รวมเสร็จแล้ว — ทุกขั้นต่อจากนี้ห้ามโยน (รายงานใน warnings แทน · รีวิว SF9) ──
  const warnings: string[] = [];
  let accountMerge: MergeCompaniesResult["accountMerge"] = null;
  let accountMergeSkipped: MergeCompaniesResult["accountMergeSkipped"] = null;
  if (keptAc && drop.accountContactId && keptAc !== drop.accountContactId) {
    const canMergeAccount = evaluate(
      { role: a.role as Role, unitAccess: a.unitAccess, permissions: a.permissions },
      { module: "account", action: "account.contact.merge" },
    );
    if (!canMergeAccount) {
      accountMergeSkipped = "NO_PERMISSION";
      warnings.push("ยังไม่ได้ย้ายเอกสารบัญชี เพราะบัญชีนี้ไม่มีสิทธิ์รวมผู้ติดต่อในระบบบัญชี — ให้ผู้มีสิทธิ์รวมผู้ติดต่อซ้ำที่หน้าระบบบัญชี");
    } else {
      try {
        const acc = await (await accountFacade()).accountSystemForCrm(ctx.tenantId, ctx.systemId);
        if (acc) {
          const r = await (await accountFacade()).mergeContacts({ tenantId: ctx.tenantId, systemId: acc.systemId }, { primaryId: keptAc, secondaryId: drop.accountContactId, actorId: ctx.actorUserId });
          accountMerge = r.ok ? { ok: true } : { ok: false, reason: r.reason };
        }
      } catch {
        accountMerge = { ok: false, reason: "ระบบบัญชีไม่ตอบรับการย้ายเอกสาร" };
      }
      if (accountMerge && !accountMerge.ok) {
        warnings.push(`รวมบริษัทแล้ว แต่ย้ายเอกสารบัญชีไม่สำเร็จ (${accountMerge.reason ?? "ไม่ทราบสาเหตุ"}) — รวมผู้ติดต่อซ้ำที่หน้าระบบบัญชีเอง`);
        await logOps("WARN", "crm.companies", "รวมบริษัทแล้ว แต่ย้ายเอกสารบัญชีไม่สำเร็จ", { tenantId: ctx.tenantId, detail: `systemId=${ctx.systemId} kept=${keep.id} merged=${drop.id}` });
      }
    }
  }
  // วัตถุกำหนดเองที่ผูกกับบริษัทที่ถูกรวม → ย้ายไปบริษัทที่เก็บไว้ (ผ่านบริการของวัตถุ — event/ประวัติครบ)
  try {
    const recs = await prisma.customRecord.findMany({
      where: { tenantId: ctx.tenantId, systemId: ctx.systemId, parentType: "COMPANY", parentId: drop.id, archivedAt: null },
      select: { id: true, object: { select: { key: true } } },
      take: 5_000,
    });
    let failed = 0;
    for (const r of recs) {
      try {
        await objects.records.move(ctx, a, r.object.key, r.id, keep.id);
        moved.records += 1;
      } catch {
        failed += 1;
      }
    }
    if (failed > 0) {
      warnings.push(`ย้ายรายการที่ผูกกับบริษัทที่ถูกรวมไม่สำเร็จ ${failed.toLocaleString("th-TH")} รายการ — ย้ายเองได้จากหน้ารายการนั้น`);
      await logOps("WARN", "crm.companies", "รวมบริษัทแล้ว แต่ย้ายรายการวัตถุกำหนดเองบางรายการไม่สำเร็จ", { tenantId: ctx.tenantId, detail: `systemId=${ctx.systemId} merged=${drop.id} failed=${failed}` });
    }
  } catch {
    warnings.push("ยังไม่ได้ย้ายรายการที่ผูกกับบริษัทที่ถูกรวม — ลองรวมผู้ติดต่อ/รายการเองภายหลัง");
  }
  await recomputeCaches(ctx, keep.id).catch(() => undefined);
  const auditBody = { keptId: keep.id, mergedId: drop.id, reason, moved, accountMerge, accountMergeSkipped, warnings: warnings.length };
  await writeAudit({ tenantId: ctx.tenantId, actorId: ctx.actorUserId, action: "crm.company.merge", targetType: "CrmCompany", targetId: keep.id, before: { mergedName: drop.name }, after: auditBody });
  await writeAudit({ tenantId: ctx.tenantId, actorId: ctx.actorUserId, action: "crm.company.merged", targetType: "CrmCompany", targetId: drop.id, before: { mergedIntoId: null }, after: auditBody });
  return { keptId: keep.id, mergedId: drop.id, moved, accountMerge, accountMergeSkipped, warnings };
}

/** มีวงวนบนเส้นบรรพบุรุษของ `startId` ไหม (เดินขึ้นไปแล้ววนกลับมาเจอตัวเอง) — ผู้เรียกถือ tree lock */
async function hasCycleFrom(tx: Tx, ctx: CompaniesCtx, startId: string): Promise<boolean> {
  const row = await tx.crmCompany.findFirst({ where: { ...identityScope(ctx), id: startId }, select: { parentCompanyId: true } });
  if (!row?.parentCompanyId) return false;
  return (await ancestorsOf(tx, ctx, row.parentCompanyId)).includes(startId);
}

// ═════════════════════════ แคช ═════════════════════════

/**
 * แคช openDealCount / wonValueSatang (ความจริงจากดีล) + outstandingSatang (สมุดบัญชี) — ระบบเรียก (C1.5 หลัง event ดีล · C2.10 รายวัน)
 * AUDIT-CLASS X3: ถูกต้องแม้ยิงพร้อมกันหลายโพรเซส — ล็อกแถว (FOR UPDATE) แล้วคำนวณใน SQL คำสั่งถัดไป (ดู recomputeCachesInTx)
 * บริษัทของระบบอื่น/ร้านอื่น = NOT_FOUND (ไม่เขียนอะไร)
 */
export async function recomputeCaches(ctx: CompaniesCtx, companyId: string): Promise<{ openDealCount: number; wonValueSatang: number; outstandingSatang: number }> {
  await resolveSystem(ctx);
  const id = str(companyId);
  const row = id ? await prisma.crmCompany.findFirst({ where: { ...identityScope(ctx), id }, select: { id: true, accountContactId: true } }) : null;
  if (!row) throw fail("NOT_FOUND", NOT_FOUND_MSG);
  const outstanding = await liveOutstanding(ctx, row.accountContactId);
  return prisma.$transaction(async (tx) => {
    await lockCompanies(tx, ctx, [row.id]);
    await recomputeCachesInTx(tx, ctx, row.id, outstanding);
    const after = await tx.crmCompany.findFirstOrThrow({ where: { id: row.id }, select: { openDealCount: true, wonValueSatang: true, outstandingSatang: true } });
    return { openDealCount: after.openDealCount, wonValueSatang: toNum(after.wonValueSatang), outstandingSatang: toNum(after.outstandingSatang) };
  }, TX_OPTS);
}

// ═════════════════════════ นำเข้า ═════════════════════════

const IMPORT_COLUMNS: Record<RoutedKey, string[]> = {
  name: ["name", "ชื่อ", "ชื่อบริษัท", "company", "companyname"],
  legalName: ["legalname", "ชื่อตามทะเบียน", "ชื่อจดทะเบียน"],
  taxId: ["taxid", "เลขภาษี", "เลขประจำตัวผู้เสียภาษี", "เลขผู้เสียภาษี"],
  branchCode: ["branchcode", "รหัสสาขา", "สาขา"],
  industry: ["industry", "อุตสาหกรรม", "ประเภทธุรกิจ"],
  size: ["size", "ขนาด", "ขนาดกิจการ"],
  website: ["website", "เว็บไซต์", "เว็บ", "url"],
  emailDomain: ["emaildomain", "domain", "โดเมน", "โดเมนอีเมล"],
  phone: ["phone", "โทรศัพท์", "เบอร์", "เบอร์โทร"],
  email: ["email", "อีเมล"],
  note: ["note", "โน้ต", "หมายเหตุ"],
};

/**
 * นำเข้า CSV (หัวตาราง: name,taxId,website,industry,… · ไทยได้) — ทีละแถวผ่านตัวตรวจ/การสร้างชุดเดียวกับ createCompany
 * AUDIT-CLASS X6: เพดานขนาด/จำนวนแถวตรวจ **ก่อน** แตะฐานข้อมูล (เกิน = ปฏิเสธทั้งไฟล์) · แถวเสีย = errors (เหตุผลไทย) ไม่สร้าง
 * (เลขภาษี, สาขา) ซ้ำในไฟล์/ซ้ำกับของเดิม = skipped
 * รีวิว SF9: แต่ละแถว commit ของตัวเอง ⇒ หยุดกลางทาง = PARTIAL บอกจำนวนที่บันทึกไปแล้ว · audit เขียนเสมอ (finally) พร้อม aborted
 */
export async function importCompanies(ctx: CompaniesCtx, actor: MemberActor, input: { csv: string }): Promise<ImportCompaniesResult> {
  const csv = typeof input?.csv === "string" ? input.csv : "";
  if (Buffer.byteLength(csv, "utf8") > COMPANY_IMPORT_MAX_BYTES) {
    throw fail("VALIDATION", `ไฟล์ใหญ่เกิน ${(COMPANY_IMPORT_MAX_BYTES / 1024 / 1024).toLocaleString("th-TH")} MB — แบ่งเป็นหลายไฟล์แล้วนำเข้าทีละไฟล์`);
  }
  const table = parseCsv(csv);
  if (table.rows.length > COMPANY_IMPORT_MAX_ROWS) {
    throw fail("VALIDATION", `นำเข้าได้ครั้งละไม่เกิน ${COMPANY_IMPORT_MAX_ROWS.toLocaleString("th-TH")} แถว (ไฟล์นี้มี ${table.rows.length.toLocaleString("th-TH")} แถว) — แบ่งไฟล์แล้วนำเข้าทีละส่วน`);
  }
  const a = await enter(ctx, actor);
  need(a, "crm.company.create");
  const idx = Object.fromEntries((Object.keys(IMPORT_COLUMNS) as RoutedKey[]).map((k) => [k, columnIndex(table.headers, IMPORT_COLUMNS[k])])) as Record<RoutedKey, number>;
  if (table.rows.length > 0 && idx.name < 0) throw fail("VALIDATION", "ไม่พบคอลัมน์ชื่อบริษัท — ใส่หัวคอลัมน์ name (หรือ ชื่อบริษัท) ในแถวแรกของไฟล์");
  if (table.rows.length > 0) await seedCompanyFields(ctx, a);
  const result: ImportCompaniesResult = { created: 0, skipped: 0, errors: [] };
  const seenTax = new Set<string>();
  let aborted = false;
  let processed = 0;
  try {
    for (let i = 0; i < table.rows.length; i += 1) {
      const r = table.rows[i]!;
      const rowNo = i + 2;
      const raw: CompanyInput = {};
      for (const k of Object.keys(IMPORT_COLUMNS) as RoutedKey[]) {
        if (idx[k] < 0) continue;
        const v = cell(r, idx[k]);
        if (v !== "") (raw as Record<string, unknown>)[k] = v;
      }
      try {
        const clean = cleanPatch({ ...raw, name: raw.name ?? "" }, "create");
        if (clean.taxId) {
          const key = `${clean.taxId}#${clean.branchCode ?? "00000"}`;
          if (seenTax.has(key)) {
            result.skipped += 1;
            processed += 1;
            continue;
          }
          seenTax.add(key);
        }
        const res = await createCore(ctx, a, clean, { ownerUserId: null, teamId: null, parentCompanyId: null });
        if (res.created) {
          result.created += 1;
          await linkExistingAccountContact(ctx, res.row).catch(() => res.row);
        } else result.skipped += 1;
      } catch (e) {
        if (e instanceof CompaniesError && (e.code === "VALIDATION" || e.code === "DUPLICATE")) {
          result.errors.push({ row: rowNo, reason: e.message });
          processed += 1;
          continue;
        }
        aborted = true;
        throw fail(
          "PARTIAL",
          `นำเข้าหยุดกลางทางที่แถว ${rowNo.toLocaleString("th-TH")} — ${result.created.toLocaleString("th-TH")} บริษัทก่อนหน้านั้นบันทึกแล้ว (ไม่ต้องนำเข้าซ้ำ ระบบข้ามเลขภาษีเดิมให้) · แถว ${rowNo.toLocaleString("th-TH")} ขึ้นไปยังไม่ได้นำเข้า ลองนำเข้าไฟล์เดิมอีกครั้ง`,
        );
      }
      processed += 1;
    }
  } finally {
    await writeAudit({
      tenantId: ctx.tenantId,
      actorId: ctx.actorUserId,
      action: "crm.company.import",
      targetType: "AppSystem",
      targetId: ctx.systemId,
      after: { created: result.created, skipped: result.skipped, errors: result.errors.length, rows: table.rows.length, processed, aborted },
    });
  }
  return result;
}

/**
 * นำเข้าจากสมุดบัญชีที่เชื่อม (legalType COMPANY เท่านั้น · สมุดอื่น/ร้านอื่น/บุคคล = ข้าม) — idempotent (ผูกแล้ว = ข้าม)
 * ผลลัพธ์ปกติ: CrmCompany.accountContactId = ผู้ติดต่อนั้น และ CrmCompany.partyId === AccountContact.partyId (ตัวตนเดียวสองฝั่ง)
 * B1: Party ของผู้ติดต่อบัญชีที่ไม่ใช่ชนิด COMPANY (ข้อมูลเก่า) ⇒ บริษัทได้ Party บริษัทของตัวเอง (ไม่รับตัวตนของคน)
 * ผู้ติดต่อบัญชีที่ยังไม่มี Party: สร้าง/หา Party บริษัทจากเลขภาษี แล้วให้ facade `ensureAccountContact` เติม partyId ให้ฝั่งบัญชีเอง
 *   (ไม่มีเลขภาษีด้วย = ผูกตัวตนไม่ได้อย่างปลอดภัย → รายงานใน errors ให้ไปกด "ผูกตัวตน" ที่หน้าผู้ติดต่อบัญชีก่อน)
 */
export async function importFromAccount(ctx: CompaniesCtx, actor: MemberActor, input: { accountContactIds: string[] }): Promise<ImportFromAccountResult> {
  const ids = Array.isArray(input?.accountContactIds) ? [...new Set(input.accountContactIds.filter((x) => typeof x === "string" && x))] : [];
  if (ids.length > COMPANY_IMPORT_ACCOUNT_MAX) throw fail("VALIDATION", `นำเข้าจากบัญชีได้ครั้งละไม่เกิน ${COMPANY_IMPORT_ACCOUNT_MAX} ราย — เลือกให้น้อยลงแล้วทำเป็นรอบ`);
  const a = await enter(ctx, actor);
  need(a, "crm.company.create");
  const acct = await accountFacade();
  const acc = await acct.accountSystemForCrm(ctx.tenantId, ctx.systemId, { contactIds: ids });
  if (!acc) throw fail("VALIDATION", "ระบบ CRM นี้ยังไม่ได้เชื่อมกับระบบบัญชี — เชื่อมที่หน้าตั้งค่าการเชื่อมต่อของระบบบัญชีก่อน");
  if (ids.length > 0) await seedCompanyFields(ctx, a);
  const byId = new Map<string, CrmAccountContactBrief>(acc.contacts.map((c) => [c.id, c]));
  const result: ImportFromAccountResult = { created: 0, linked: 0, skipped: 0, errors: [] };
  for (const id of ids) {
    const c = byId.get(id);
    if (!c) {
      result.skipped += 1;
      result.errors.push({ accountContactId: id, reason: "ไม่พบผู้ติดต่อนี้ในสมุดบัญชีที่เชื่อมกับระบบ CRM นี้" });
      continue;
    }
    if (c.legalType !== "COMPANY") {
      result.skipped += 1;
      continue;
    }
    // SF7: idempotency ใช้ขอบเขตตัวตน (ร้าน+ระบบ) ไม่ใช่การมองเห็น
    const already = await prisma.crmCompany.findFirst({ where: { ...identityScope(ctx), accountContactId: c.id }, select: { id: true } });
    if (already) {
      result.skipped += 1;
      continue;
    }
    const tax = c.taxId && !taxIdProblem(c.taxId) ? normalizeCompanyTaxId(c.taxId) : null;
    const branch = c.branchCode && /^\d{5}$/.test(c.branchCode) ? c.branchCode : "00000";
    if (!c.partyId && !tax) {
      result.skipped += 1;
      result.errors.push({ accountContactId: c.id, reason: "ผู้ติดต่อฝั่งบัญชีรายนี้ยังไม่ผูกตัวตนกลางและไม่มีเลขภาษี — กด \"ผูกตัวตน\" ที่หน้าผู้ติดต่อในระบบบัญชีก่อน แล้วนำเข้าอีกครั้ง" });
      continue;
    }
    try {
      const clean = cleanPatch(
        { name: c.name.slice(0, COMPANY_NAME_MAX), taxId: tax, branchCode: branch, phone: c.phone && !phoneProblem(c.phone) ? c.phone : null, email: c.email && !emailProblem(c.email) ? c.email : null },
        "create",
      );
      // Party ของบัญชี: createCore รับเฉพาะ Party บริษัท (B1) — Party ของคน = ถูกข้ามแล้วสร้าง/หา Party บริษัทแทน
      const res = await createCore(ctx, a, clean, { ownerUserId: null, teamId: null, parentCompanyId: null }, { partyId: c.partyId, accountContactId: c.id });
      if (res.created) result.created += 1;
      else if (res.row.accountContactId === c.id) result.linked += 1;
      else {
        result.skipped += 1;
        result.errors.push({ accountContactId: c.id, reason: "มีบริษัทของตัวตนเดียวกันอยู่แล้วและผูกกับผู้ติดต่อบัญชีอีกราย — ตรวจที่หน้ารวมผู้ติดต่อซ้ำของระบบบัญชี" });
        continue;
      }
      // ฝั่งบัญชียังไม่มี partyId → ให้บัญชีเติมเอง (เลขภาษี+สาขาตรง = ผู้ติดต่อรายเดิม) · นอกธุรกรรม (ensureAccountContact ไม่รับ tx)
      if (!c.partyId && tax) {
        const got = await acct.ensureAccountContact({ tenantId: ctx.tenantId, systemId: acc.systemId }, { partyId: res.row.partyId, name: c.name, taxId: tax, branchCode: branch, legalType: "COMPANY" });
        if (got.id !== c.id) {
          await logOps("WARN", "crm.companies", "นำเข้าจากบัญชี: ผู้ติดต่อฝั่งบัญชีที่ได้ไม่ตรงกับรายที่เลือก — ตรวจรายการซ้ำในบัญชี", {
            tenantId: ctx.tenantId,
            detail: `systemId=${ctx.systemId} asked=${c.id} got=${got.id}`,
          });
        }
      }
    } catch (e) {
      if (e instanceof CompaniesError) {
        result.skipped += 1;
        result.errors.push({ accountContactId: c.id, reason: e.message });
        continue;
      }
      throw e;
    }
  }
  await writeAudit({ tenantId: ctx.tenantId, actorId: ctx.actorUserId, action: "crm.company.import_account", targetType: "AppSystem", targetId: ctx.systemId, after: { ...result, errors: result.errors.length, asked: ids.length } });
  return result;
}

// ═════════════════════════ ตัวช่วยของหน้าจอ (ค้นฝั่งเซิร์ฟเวอร์ — รีวิว SF11) ═════════════════════════

const PICK_MAX = 30;

/** ผู้ติดต่อของระบบนี้ที่ยังไม่อยู่ในบริษัท (ช่อง "เพิ่มผู้ติดต่อ") — ค้นด้วยชื่อ · ชื่ออย่างเดียว */
export async function contactOptions(ctx: CompaniesCtx, actor: MemberActor, companyId: string, q?: string | null): Promise<{ id: string; name: string }[]> {
  const a = await enter(ctx, actor);
  const company = await loadCompany(ctx, a, companyId);
  const term = str(q)?.slice(0, 100);
  return prisma.crmContact.findMany({
    where: {
      AND: [
        await contactWhere(ctx, a),
        { archivedAt: null, mergedIntoId: null, companyLinks: { none: { companyId: company.id, endedAt: null } } },
        ...(term ? [{ name: { contains: term, mode: "insensitive" as const } }] : []),
      ],
    },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
    take: PICK_MAX,
  });
}

/** รายชื่อทีมงานของร้าน (ช่องผู้ดูแล) */
export async function ownerOptions(ctx: CompaniesCtx, actor: MemberActor): Promise<{ id: string; name: string }[]> {
  await enter(ctx, actor);
  const rows = await prisma.membership.findMany({
    where: { tenantId: ctx.tenantId },
    select: { user: { select: { id: true, name: true } } },
    take: 500,
  });
  return rows.map((r) => ({ id: r.user.id, name: r.user.name ?? "ผู้ใช้" })).sort((x, y) => x.name.localeCompare(y.name, "th"));
}

/** บริษัทที่เลือกเป็นบริษัทแม่/คู่รวมได้ (ยังใช้งาน · ระบบเดียวกัน) — ค้นด้วยชื่อ/เลขภาษี */
export async function companyOptions(ctx: CompaniesCtx, actor: MemberActor, opts: { excludeId?: string | null; q?: string | null } = {}): Promise<{ id: string; name: string }[]> {
  const a = await enter(ctx, actor);
  const term = str(opts.q)?.slice(0, 100);
  const digits = term?.replace(/[\s-]/g, "") ?? "";
  return prisma.crmCompany.findMany({
    where: {
      AND: [
        await companyWhere(ctx, a),
        { mergedIntoId: null, archivedAt: null },
        ...(opts.excludeId ? [{ id: { not: opts.excludeId } }] : []),
        ...(term ? [{ OR: [{ name: { contains: term, mode: "insensitive" as const } }, ...(/^\d{3,13}$/.test(digits) ? [{ taxId: { contains: digits } }] : [])] }] : []),
      ],
    },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
    take: PICK_MAX,
  });
}

/** เลย์เอาต์ฟิลด์กำหนดเองของบริษัท (ไม่รวมฟิลด์ระบบ) สำหรับฟอร์มเพิ่มบริษัท — อ่านอย่างเดียว (ยังไม่ seed ก็แสดงได้) */
export async function customFieldLayout(ctx: CompaniesCtx, actor: MemberActor): Promise<{ key: string; label: string; type: string; required: boolean; choices: { value: string; label: string }[] }[]> {
  const a = await enter(ctx, actor);
  try {
    const layout = await (await engine()).listLayout(fctx(ctx, a), {});
    const out: { key: string; label: string; type: string; required: boolean; choices: { value: string; label: string }[] }[] = [];
    for (const s of layout.sections) {
      for (const f of s.fields) {
        if (f.isSystem || s.sensitive || f.sensitive) continue;
        if (!["TEXT", "LONG_TEXT", "NUMBER", "SELECT", "DATE", "BOOLEAN", "URL", "EMAIL", "PHONE"].includes(f.type)) continue;
        const choices = (f.options?.choices ?? []).map((c) => ({ value: c.value, label: c.label }));
        out.push({ key: f.key, label: f.label, type: f.type, required: f.required, choices });
      }
    }
    return out;
  } catch (e) {
    throw engineError(e);
  }
}

// ═════════════════════════ ตัวรับ event (composition root เรียกผ่าน facade) ═════════════════════════

type OutboxEvt = { id: string; tenantId: string; type: string; payload: unknown; systemId: string | null; unitId: string | null };

/**
 * `crm.company.created` → (1) ผู้ติดต่อฝั่งบัญชีของ Party บริษัท ในสมุดที่เชื่อมกับระบบ CRM นี้ (`ensureAccountContact` — **นอก tx**) ·
 * ผูก `accountContactId` · (2) แถวไทม์ไลน์ CrmActivity 1 แถว (source AUTO · มติข้อ 6)
 * AUDIT-CLASS X4: ส่งซ้ำ/ส่งพร้อมกัน ⇒ ผู้ติดต่อบัญชี 1 ราย (facade ล็อกที่ฐานต่อ (สมุด, Party)) · ปักธงก่อนแล้วค่อยทำ:
 *   advisory lock ต่อบริษัท + แถวธง (`sourceRef` = คีย์ของ event) ตรวจในล็อก ⇒ ไทม์ไลน์ 1 แถว · ผูกด้วย updateMany แบบมีเงื่อนไข
 * บริษัทถูกรวมไปก่อน event ถึง ⇒ ไม่สร้างผู้ติดต่อบัญชี · แถวไทม์ไลน์ไปอยู่ที่บริษัทที่เก็บไว้ (ตามสาย mergedIntoId)
 * ไม่มีสมุดบัญชีที่เชื่อม = ข้ามส่วนบัญชีเงียบ ๆ (ไม่ throw — ของแถมของ CRM ห้ามทำคิวตัน) · ไม่ log ชื่อ/เบอร์/อีเมล (X8)
 */
export async function onCompanyCreated(evt: OutboxEvt): Promise<void> {
  const p = evt.payload && typeof evt.payload === "object" ? (evt.payload as Record<string, unknown>) : {};
  const companyId = str(p.companyId);
  if (!companyId) return;
  const row = await prisma.crmCompany.findFirst({ where: { id: companyId, tenantId: evt.tenantId } });
  if (!row) return;
  // ตามสายการรวมไปบริษัทปลายทาง (ระบบเดียวกัน · กันวน 20 ชั้น)
  let target = row;
  for (let i = 0; i < 20 && target.mergedIntoId; i += 1) {
    const next = await prisma.crmCompany.findFirst({ where: { id: target.mergedIntoId, tenantId: evt.tenantId, systemId: row.systemId } });
    if (!next) break;
    target = next;
  }
  let accountContactId = row.accountContactId;
  if (!accountContactId && !row.mergedIntoId && !row.archivedAt) {
    const acct = await accountFacade();
    const acc = await acct.accountSystemForCrm(evt.tenantId, row.systemId);
    if (acc) {
      const got = await acct.ensureAccountContact(
        { tenantId: evt.tenantId, systemId: acc.systemId },
        { partyId: row.partyId, name: row.name, taxId: row.taxId, branchCode: row.branchCode, phone: row.phone, email: row.email, legalType: "COMPANY" },
      );
      accountContactId = got.id;
    }
  }
  const marker = `${EVENT.created}#${row.id}`;
  await prisma.$transaction(async (tx) => {
    await lockKey(tx, `crm:company-created:${row.id}`);
    if (accountContactId && !row.accountContactId && !row.mergedIntoId) {
      await tx.crmCompany.updateMany({ where: { id: row.id, tenantId: evt.tenantId, accountContactId: null }, data: { accountContactId } });
    }
    const done = await tx.crmActivity.findFirst({ where: { tenantId: evt.tenantId, source: "AUTO", sourceRef: marker }, select: { id: true } });
    if (done) return;
    await tx.crmActivity.create({
      data: {
        tenantId: evt.tenantId,
        systemId: target.systemId,
        companyId: target.id,
        type: "NOTE",
        title: accountContactId && target.id === row.id ? "เพิ่มบริษัทเข้าระบบ CRM · เชื่อมกับผู้ติดต่อในระบบบัญชีแล้ว" : "เพิ่มบริษัทเข้าระบบ CRM",
        source: "AUTO",
        sourceRef: marker,
        startAt: row.createdAt,
        doneAt: row.createdAt,
        createdAt: row.createdAt,
      },
    });
  }, TX_OPTS);
}

// CRM C1.8 ▸ ทางเข้าของสะพาน `account.contact.merged` (composition root `src/lib/platform/crm-bridges/core.ts` · R-A)
//   ไฟล์นี้ยังเป็นผู้เขียน CrmCompany ที่เดียว (หนี้ C1.3 · ข้อสอบ C1.6-S0.6) — สะพานตรวจประตู + ผู้ติดต่อบัญชีที่เก็บไว้ว่าเป็นของร้านนี้มาก่อนแล้ว
/**
 * `CrmCompany.accountContactId` ที่ชี้ผู้ติดต่อบัญชีที่ถูกรวม (`mergedId`) ⇒ ชี้ตัวที่เก็บไว้ (`keepId`) — ในระบบนี้เท่านั้น (AUDIT-CLASS X1)
 * AUDIT-CLASS X4: advisory lock ต่อ (ระบบ, ตัวที่ถูกรวม) + updateMany แบบมีเงื่อนไข ⇒ ส่งซ้ำ/พร้อมกัน = เขียนครั้งเดียว + `crm.company.updated` ครั้งเดียว
 */
export async function repointAccountContactFromBridge(ctx: { tenantId: string; systemId: string }, input: { keepId: string; mergedId: string }): Promise<number> {
  const keepId = str(input?.keepId);
  const mergedId = str(input?.mergedId);
  if (!keepId || !mergedId || keepId === mergedId) return 0;
  const c: CompaniesCtx = { tenantId: ctx.tenantId, systemId: ctx.systemId, actorUserId: null };
  return prisma.$transaction(async (tx) => {
    await lockKey(tx, `crm:account-contact-merge:${c.systemId}:${mergedId}`);
    const rows = await tx.crmCompany.findMany({ where: { ...identityScope(c), accountContactId: mergedId }, select: { id: true } });
    let n = 0;
    for (const r of rows) {
      const u = await tx.crmCompany.updateMany({ where: { ...identityScope(c), id: r.id, accountContactId: mergedId }, data: { accountContactId: keepId } });
      if (u.count !== 1) continue;
      n += 1;
      await emitCompanyEvent(tx, c, "updated", r.id, `account-${keepId}`, { companyId: r.id, changedKeys: ["accountContactId"] });
    }
    return n;
  }, TX_OPTS);
}
// ◂ CRM C1.8

// CRM C1.4 ▸ ทางเข้าที่ "เข้าร่วม transaction ของผู้เรียก" (มติผู้คุมงาน C1.4 — Option A) ให้บริการผู้ติดต่อ (`contacts.ts`)
//   ใช้ตอน "แปลง lead" (สมาชิก + บริษัท + ดีล ในธุรกรรมเดียว) และ "รวมผู้ติดต่อ" — ไฟล์นี้ยังเป็นเจ้าของการเขียน CrmCompany /
//   CrmCompanyContact / แคช CrmContact.companyId ที่เดียว (contacts*.ts ไม่มีคำสั่งกับตารางบริษัทเลย)
//   🔴 ลำดับล็อกเดิมของหัวไฟล์: ผู้เรียกถือ advisory ของ engine/การแปลงได้ · createInTx = ชั้น Party advisory ·
//      linkContactInTx / transferContactLinksInTx = แถว CrmCompany (เรียง id) → แถว CrmContact (เรียง id)
//      ⇒ ผู้เรียกต้องไม่ล็อกแถวผู้ติดต่อก่อนเรียกสองตัวหลัง (ล็อกซ้ำหลังจากนั้นได้ — FOR UPDATE ซ้อนใน tx เดียวกัน)
//   🔴 ไม่ resolve ระบบ/ไม่ตรวจ actor — ผู้เรียก (บริการผู้ติดต่อ) ทำแล้วก่อนเปิด tx · ทุก where ผูก tenant + ระบบ (AUDIT-CLASS X1)

/** สร้างบริษัทใหม่ (Party ชนิด COMPANY เท่านั้น — B1) ใน tx ของผู้เรียก · Party เดิมของระบบนี้ = คืนบริษัทเดิม · event created ใน tx เดียวกัน */
export async function createInTx(tx: Tx, ctx: CompaniesCtx, input: { name: string; ownerUserId?: string | null }): Promise<{ id: string; partyId: string; created: boolean }> {
  const name = textOrNull(input?.name, "ชื่อบริษัท", COMPANY_NAME_MAX);
  if (!name) throw fail("VALIDATION", "ใส่ชื่อบริษัทก่อนบันทึก");
  const partyId = (await party.findOrCreateCompany(ctx.tenantId, { name }, tx)).id;
  await partyLock(tx, ctx, partyId);
  const same = await tx.crmCompany.findFirst({ where: { ...identityScope(ctx), partyId }, select: { id: true } });
  if (same) return { id: same.id, partyId, created: false };
  const row = await tx.crmCompany.create({
    data: { tenantId: ctx.tenantId, systemId: ctx.systemId, partyId, name, branchCode: "00000", ownerUserId: str(input?.ownerUserId) ?? ctx.actorUserId ?? null },
  });
  await emitCompanyEvent(tx, ctx, "created", row.id, "1", { companyId: row.id, partyId: row.partyId });
  return { id: row.id, partyId, created: true };
}

/**
 * ผูกผู้ติดต่อเข้าบริษัทใน tx ของผู้เรียก (แถวบริษัท → แถวผู้ติดต่อ) · ลิงก์ที่ใช้อยู่ = ไม่สร้างแถวที่สอง · ลิงก์ที่จบไปแล้ว = เปิดใหม่ ·
 * `primaryIfNone` = เป็นผู้ติดต่อหลักเมื่อบริษัทยังไม่มีคนหลัก (ไม่แย่งหลักของคนอื่น) · แคช companyId ของผู้ติดต่อคำนวณใหม่ใน tx เดียวกัน
 */
export async function linkContactInTx(
  tx: Tx,
  ctx: CompaniesCtx,
  companyId: string,
  contactId: string,
  opts: { primaryIfNone?: boolean; jobTitle?: string | null } = {},
): Promise<{ created: boolean; isPrimary: boolean }> {
  await lockCompanies(tx, ctx, [companyId]);
  const co = await tx.crmCompany.findFirst({ where: { ...identityScope(ctx), id: companyId, mergedIntoId: null, archivedAt: null }, select: { id: true } });
  if (!co) throw fail("NOT_FOUND", NOT_FOUND_MSG);
  await lockContacts(tx, ctx, [contactId]);
  const now = new Date();
  const jobTitle = opts.jobTitle === undefined ? undefined : textOrNull(opts.jobTitle, "ตำแหน่ง", COMPANY_TEXT_MAX);
  const link = await tx.crmCompanyContact.findUnique({ where: { companyId_contactId: { companyId, contactId } } });
  const others = opts.primaryIfNone ? await tx.crmCompanyContact.count({ where: { companyId, isPrimary: true, endedAt: null, contactId: { not: contactId } } }) : 1;
  const asPrimary = !!opts.primaryIfNone && others === 0;
  let created = false;
  let changed = false;
  let isPrimary = false;
  if (link && !link.endedAt) {
    isPrimary = link.isPrimary;
    if (asPrimary && !link.isPrimary) {
      await tx.crmCompanyContact.update({ where: { id: link.id }, data: { isPrimary: true } });
      isPrimary = changed = true;
    }
  } else if (link) {
    await tx.crmCompanyContact.update({ where: { id: link.id }, data: { endedAt: null, startedAt: now, isPrimary: asPrimary, jobTitle: link.jobTitle ?? jobTitle ?? null } });
    isPrimary = asPrimary;
    created = changed = true;
  } else {
    await tx.crmCompanyContact.create({ data: { tenantId: ctx.tenantId, companyId, contactId, role: "OTHER", jobTitle: jobTitle ?? null, isPrimary: asPrimary, startedAt: now } });
    isPrimary = asPrimary;
    created = changed = true;
  }
  if (changed) {
    await recomputeContactCompanyCache(tx, ctx, [contactId]);
    await emitCompanyEvent(tx, ctx, "updated", companyId, newSeq(), { companyId, changedKeys: ["contacts"], contactId });
  }
  return { created, isPrimary };
}

/**
 * รวมผู้ติดต่อ: ย้ายบทบาทในบริษัทของ `fromContactId` ไป `toContactId` ใน tx ของผู้เรียก (แถวบริษัททุกแถวที่แตะ → แถวผู้ติดต่อทั้งสอง)
 * บทบาทชน (บริษัทเดียวกัน) = แถวของคนที่เก็บไว้ชนะ และแถวของคนที่ถูกรวม **ถูกลบ** (1 แถวต่อบริษัท) · ลิงก์ที่จบแล้วของคนที่เก็บไว้
 * แต่ของคนที่ถูกรวมยังใช้อยู่ = เปิดลิงก์ของคนที่เก็บไว้ใหม่ด้วยค่าของอีกฝั่ง · แคช companyId ทั้งสองคนคำนวณใหม่
 */
export async function transferContactLinksInTx(tx: Tx, ctx: CompaniesCtx, fromContactId: string, toContactId: string): Promise<{ moved: number; companyIds: string[] }> {
  // รีวิว C1.4: ชุดบริษัทอ่านก่อนล็อก ⇒ อ่านซ้ำหลังล็อกบริษัท จนไม่มีบริษัทใหม่โผล่ (มีคนผูกเพิ่มระหว่างรอ) — ครบก่อนค่อยล็อกผู้ติดต่อ
  const locked = new Set<string>();
  for (let round = 0; round < 5; round += 1) {
    const all = await tx.crmCompanyContact.findMany({ where: { tenantId: ctx.tenantId, contactId: { in: [fromContactId, toContactId] } }, select: { companyId: true } });
    const extra = [...new Set(all.map((l) => l.companyId))].filter((id) => !locked.has(id));
    if (extra.length === 0) break;
    await lockCompanies(tx, ctx, extra);
    for (const id of extra) locked.add(id);
  }
  const companyIds = [...locked].sort();
  await lockContacts(tx, ctx, [fromContactId, toContactId]);
  const mLinks = await tx.crmCompanyContact.findMany({ where: { tenantId: ctx.tenantId, contactId: fromContactId } });
  const kLinks = await tx.crmCompanyContact.findMany({ where: { tenantId: ctx.tenantId, contactId: toContactId } });
  const kBy = new Map(kLinks.map((l) => [l.companyId, l]));
  const now = new Date();
  let moved = 0;
  for (const l of mLinks) {
    const kl = kBy.get(l.companyId);
    if (kl) {
      if (kl.endedAt && !l.endedAt) {
        await tx.crmCompanyContact.update({ where: { id: kl.id }, data: { endedAt: null, startedAt: l.startedAt ?? now, role: l.role, jobTitle: l.jobTitle ?? kl.jobTitle, isPrimary: l.isPrimary } });
      } else if (!kl.endedAt && !l.endedAt && l.isPrimary && !kl.isPrimary) {
        // บทบาทชน: แถวของคนที่เก็บไว้ชนะ แต่ถ้าแถวที่ถูกลบเป็น "ผู้ติดต่อหลัก" — บริษัทต้องไม่เสียผู้ติดต่อหลัก ⇒ ยกธงหลักให้แถวที่เหลือ
        await tx.crmCompanyContact.update({ where: { id: kl.id }, data: { isPrimary: true } });
      }
      await tx.crmCompanyContact.delete({ where: { id: l.id } });
    } else {
      await tx.crmCompanyContact.update({ where: { id: l.id }, data: { contactId: toContactId } });
    }
    moved += 1;
  }
  await recomputeContactCompanyCache(tx, ctx, [fromContactId, toContactId]);
  return { moved, companyIds };
}

/** ชื่อบริษัทที่ยังใช้งาน (ไม่ถูกรวม/เก็บถาวร) ที่ actor มองเห็น — อ่านอย่างเดียว (companyWhere) · id ที่ไม่อยู่ในผลลัพธ์ = ไม่พบ/ไม่ใช้งานแล้ว */
export async function liveCompanyRefs(ctx: CompaniesCtx, actor: MemberActor, ids: string[]): Promise<{ id: string; name: string }[]> {
  const a = await enter(ctx, actor);
  const list = [...new Set((ids ?? []).filter((x) => typeof x === "string" && x))].slice(0, 5_000);
  if (list.length === 0) return [];
  return prisma.crmCompany.findMany({ where: { AND: [await companyWhere(ctx, a), { id: { in: list }, mergedIntoId: null, archivedAt: null }] }, select: { id: true, name: true } });
}
// ◂ CRM C1.4

// CRM C1.5 ▸ ทางเข้าแคชดีลของบริษัทที่ "เข้าร่วม tx ของผู้เรียก" (บริการดีล `deals.ts`) — SQL ของแคชยังเป็นของไฟล์นี้ที่เดียว
//   ลำดับล็อก (หัวไฟล์): … → แถว CrmCompany (เรียง id) → แถว CrmContact → แถว CrmDeal ⇒ ดีลล็อกบริษัทก่อนเสมอด้วยตัวนี้
//   AUDIT-CLASS X3: ผู้เรียกถือล็อกแถวบริษัทไว้ตลอด tx (lockCompanyRowsInTx) แล้วค่อยคำนวณ ⇒ แคชเท่ากับความจริงหลัง commit เสมอ
/** ล็อกแถวบริษัท (FOR UPDATE · เรียง id · ขอบเขตร้าน+ระบบ) ใน tx ของผู้เรียก */
export async function lockCompanyRowsInTx(tx: Tx, ctx: CompaniesCtx, ids: (string | null | undefined)[]): Promise<void> {
  await lockCompanies(tx, ctx, ids.filter((x): x is string => typeof x === "string" && !!x));
}
/** คำนวณแคช openDealCount / wonValueSatang ใหม่ (outstanding คงค่าเดิม) — ผู้เรียกล็อกแถวบริษัทไว้แล้ว */
export async function recomputeDealCachesInTx(tx: Tx, ctx: CompaniesCtx, ids: (string | null | undefined)[]): Promise<void> {
  const uniq = [...new Set(ids.filter((x): x is string => typeof x === "string" && !!x))].sort();
  for (const id of uniq) await recomputeCachesInTx(tx, ctx, id);
}
/**
 * ชื่อบริษัทสำหรับบริการดีล — อ่านผ่าน companyWhere (actor จริง) หรือขอบเขตร้าน+ระบบ (ทางเข้าของระบบ: v1 wrapper/สายอนุมัติ)
 * `db` = client ของผู้เรียก (tx ของ "แปลง lead" เห็นบริษัทที่เพิ่งสร้างใน tx นั้น) · `live` = เฉพาะที่ยังใช้งาน (ไม่ถูกรวม/เก็บถาวร)
 * AUDIT-CLASS X1: id ที่ไม่อยู่ในผลลัพธ์ = ไม่พบ/มองไม่เห็น (ไม่บอกว่ามีอยู่ที่อื่นไหม)
 */
export async function companyRefsInTx(db: Db, ctx: CompaniesCtx, actor: MemberActor | null, ids: (string | null | undefined)[], opts: { live?: boolean } = {}): Promise<{ id: string; name: string }[]> {
  const list = [...new Set(ids.filter((x): x is string => typeof x === "string" && !!x))].slice(0, 5_000);
  if (list.length === 0) return [];
  const scope: Prisma.CrmCompanyWhereInput = actor ? await companyWhere(ctx, actor, { db }) : identityScope(ctx);
  return db.crmCompany.findMany({ where: { AND: [scope, { id: { in: list } }, ...(opts.live ? [{ mergedIntoId: null, archivedAt: null }] : [])] }, select: { id: true, name: true } });
}
// ◂ CRM C1.5

// CRM C1.6 ▸ `lastActivityAt` ของบริษัท (หนี้ C1.3 · มติผู้คุมงาน C1.6 ข้อ 3) — ผู้เขียน CrmCompany ยังมีที่เดียว (ไฟล์นี้)
//   ผู้เรียก: `activities.ts#logActivity` ใน tx ของการบันทึกกิจกรรม (ถือล็อกแถวบริษัทแล้วตามลำดับ บริษัท → ผู้ติดต่อ → ดีล)
//   AUDIT-CLASS X3: คำสั่งเดียวใน SQL — `GREATEST(ค่าเดิม, at)` ⇒ ยิงพร้อมกันกี่ทางก็ได้ค่าสูงสุดเสมอ ไม่ถอยหลัง
//   (ไม่อ่าน → คิดในแอป → เขียน) · `at` ผู้เรียกบีบไม่ให้เกินเวลาปัจจุบันแล้ว · GREATEST ของ Postgres ข้าม NULL เอง
/** ขยับ `CrmCompany.lastActivityAt` ไปที่ `at` ถ้าใหม่กว่าค่าเดิม (ขอบเขตร้าน+ระบบ) — คืนจำนวนแถวที่แตะ */
export async function touchLastActivityInTx(tx: Tx, ctx: CompaniesCtx, ids: (string | null | undefined)[], at: Date): Promise<number> {
  const sorted = [...new Set(ids.filter((x): x is string => typeof x === "string" && !!x))].sort();
  if (sorted.length === 0 || !Number.isFinite(at.getTime())) return 0;
  const iso = at.toISOString();
  return tx.$executeRaw`UPDATE "CrmCompany" SET "lastActivityAt" = GREATEST("lastActivityAt", (${iso}::timestamptz AT TIME ZONE 'UTC')) WHERE "id" = ANY(${sorted}::text[]) AND "tenantId" = ${ctx.tenantId} AND "systemId" = ${ctx.systemId}`;
}
// ◂ CRM C1.6
