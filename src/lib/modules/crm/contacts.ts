// contacts.ts — บริการ "ผู้ติดต่อ" ของ CRM v2 (ใบ C1.4 · พิมพ์เขียว §5.2 §3.5 §3.17 §11.1 · มติ C1 C20 · R-A · R-C.8 · R-E.11 ·
//               มติผู้คุมงาน C1.4 ข้อ 1–7 · CONTRACT BLOCK ของ scripts/qc-crm-c1.4.mts)
//
// ของที่ไฟล์นี้เป็นเจ้าของ
//   • CrmContact: create (ตรวจซ้ำเบอร์/อีเมล · Party PERSON · มอบหมาย stub) · update (+ Party ใน tx เดียวกัน · previousEmails) ·
//     lifecycle/leadStatus/tags/opt-out/assign/bulkAssign/archive · 360 · list (ทุกตัวกรอง · f.{key} · มุมมองบันทึก · cursor)
//   • แปลง lead (convertContact) — สมาชิก + บริษัท + ดีล ใน **ธุรกรรมเดียว** พร้อม idempotencyKey
//   • ตัวซ้ำ/รวม · นำเข้า (ผลตอบกลับทันที · ทีละชุด 200 · audit ใน finally) · ส่งออก (`csvRow`) · `briefFor`
//   • event `crm.contact.created/updated/assigned/converted/merged` (ยิงใน tx ของการเขียน · payload id ล้วน)
//
// 🔴 การอ่าน "สิ่งที่ actor เห็น" ผ่าน `./where.ts` (contactWhere/companyWhere/dealWhere/activityWhere — R-A · C1.7 แทนไส้ใน)
//    แต่การตรวจ "ซ้ำ/ตัวตน" ใช้ `identityScope` = ร้าน + ระบบ ล้วน ๆ (แถวที่ actor มองไม่เห็นก็ยังซ้ำอยู่ดี — บทเรียน C1.3 SF7)
// 🔴 ctx.systemId ถูก resolve ใหม่ทุกคำสั่ง (ต้องเป็นระบบ CRM ของร้านนี้) — ไม่เชื่อ id จากผู้เรียก
// 🔴 ผู้ติดต่อผูกได้เฉพาะ Party ชนิด "คน" — ไม่เคยผูก Party ชนิด COMPANY (กระจกของ blocker B1 ของ C1.3)
// 🔴 คอลัมน์ที่ engine ฟิลด์ปฏิเสธ (GOVERNED_CRM_SYSTEM_KEYS.contact) ไฟล์นี้เขียนเอง แล้วส่งเฉพาะ key ธรรมดาเข้า engine
// 🔴 ลำดับล็อก (สัญญาเดียวกับหัวไฟล์ companies.ts — กัน 40P01): advisory ของ engine (`lockRecordForFieldWrite`) / ของการแปลง →
//    advisory ตัวตน (เบอร์/อีเมล · Party) → แถว CrmCompany (FOR UPDATE · เรียง id) → แถว CrmContact (FOR UPDATE · เรียง id)
//    ทางที่ต้องย้าย "บริษัทหลัก" เรียก `companies.addContact/removeContact` (บริษัทก่อนผู้ติดต่อ) **หลัง** commit ของตัวเอง
//    ⇒ ไม่มีธุรกรรมไหนของไฟล์นี้ถือแถวผู้ติดต่อแล้วรอแถวบริษัท
// 🔴 ไฟล์นี้ไม่มีคำสั่งกับตาราง CrmCompany / ลิงก์ CrmCompanyContact (เขียน) / แคช CrmContact.companyId เลย (มติผู้คุมงาน C1.4 Option A):
//    แปลง/รวมใน tx เดียวใช้ `companies.createInTx · linkContactInTx · transferContactLinksInTx` · ชื่อบริษัทอ่านผ่าน `companies.liveCompanyRefs`
// 🔴 หน้า GET ไม่เขียนอะไร — ฟิลด์ระบบของผู้ติดต่อ seed ตอนเขียนครั้งแรก (สร้าง · แก้ · นำเข้า) แบบเดียวกับบริษัท

// CRM C3.5 ▸ ตัวตนพอร์ทัลเปลี่ยน/รวมผู้ติดต่อ ⇒ ตัด session + ต้องเชิญใหม่ (S4) ◂
import { portalIdentityChangedInTx } from "./portal-identity";
import { createHash, randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import type { CrmContact, CrmLeadStatus, CrmLifecycleStage, CrmScoreBand, MemberSource } from "@prisma/client";
import { ciEquals } from "@/lib/core/ci-equals"; // CRM C5.5-fix2 ◂
import { writeAudit } from "@/lib/core/audit";
import { consentChannels, isChannelKey } from "@/lib/core/channels";
import { csvRow } from "@/lib/core/csv";
import { logOps } from "@/lib/core/ops";
import { emitOutbox } from "@/lib/core/outbox";
import * as party from "@/lib/modules/party";
import type { MemberActor } from "@/lib/modules/member";
import { prisma } from "./db";
import { activityWhere, visibleContactSql, contactWhere, dealWhere } from "./where";
import { andSql, containsSql, cursorSql, enumEqSql, inOrder, orSql, orderBySql, sqlSortOf, withThaiCollation } from "./list-sql"; // CRM C5.1-fix ◂
import { normalizeThaiText, thaiSearchVariants } from "./thai-text"; // CRM C5.4-E ▸ L6-m3 ◂
import { resolveViewFilters, viewOptions } from "./views"; // CRM C3.2 ▸ มุมมองที่บันทึก (ทีมจริง) ◂
// CRM C1.7 ▸ คีย์สิทธิ์ตัวเดียวของ CRM ◂
import { crmCan, crmCanLinkCompany, crmForbiddenMessage } from "./access";
import { assertCrmLimit } from "./limits"; // CRM C3.9 ▸ เพดานผู้ติดต่อ ◂
import { CrmLimitError } from "./limits-shared"; // CRM C3.9 ◂
import { CRM_ERASE_AUDIT_ACTION } from "./privacy-shared"; // CRM C3.9 ▸ ธง "ลบแล้ว" ◂
import { cleanReferrer, cleanTrackedUrl, SOURCE_PAGE_UTM_KEEP } from "./tracking-shared"; // CRM C5.4-B L5-m6 ◂
import { listTargetCandidates, resolveCrmTargets } from "./integrations"; // CRM C3.6 ▸ ตัวตัดสินปลายทางตัวเดียว ◂
import * as assignment from "./assignment";
import * as companies from "./companies";
import * as consents from "./consents";
import * as objects from "./objects";
import { COMPANY_CONTACT_ROLES, CompaniesError, TAX_COMPANY_ARCHIVED_MSG, TAX_COMPANY_HIDDEN_MSG, normalizeCompanyTaxId, taxIdProblem, type CompanyContactRole } from "./companies-shared";
import { canAdvanceLifecycle } from "./rules";
// CRM C1.5 ▸ ดีลของ "แปลง lead" + ดีลเปิดที่ย้ายตามบริษัท เขียนผ่านบริการดีล (ผู้เขียนคอลัมน์ดีลที่เดียว) ◂
import * as deals from "./deals";
import { auditSystemActivity, recordSystemActivityInTx } from "./activities";
import { isErasedContact } from "./erased"; // CRM C3.9-fix ▸ มติข้อ 4 ◂
import { unverifiedEmailRefs } from "./email-flags"; // CRM C5.5-fix3b r2 ▸ RV-1 ◂
import { customFieldErrorKey, missingRequiredCustom, requiredCustomMessage } from "./field-errors-shared";
import { formatThaiDateTimeFull, thaiIsoDateTime } from "@/lib/ui/date"; // CRM C5.5-fix7 ▸ RV-3 ◂
import {
  CONTACT_BULK_MAX,
  CONTACT_PRIMARY_COMPANY_HIDDEN_MSG,
  LEGACY_NOTE_PREFIX,
  CONTACT_EXPORT_MAX_ROWS,
  CONTACT_IMPORT_BATCH,
  CONTACT_IMPORT_ERRORS_MAX,
  CONTACT_IMPORT_INLINE_MAX_ROWS,
  CONTACT_IMPORT_MAX_BYTES,
  CONTACT_IMPORT_MAX_ROWS,
  CONTACT_NAME_MAX,
  CONTACT_PAGE_MAX,
  CONTACT_REASON_MIN,
  CONTACT_SORTS,
  CONTACT_SOURCES,
  CONTACT_SOURCE_LABEL,
  CONTACT_SOURCE_TEXT_MAX,
  CONTACT_TEXT_MAX,
  ContactsError,
  IMPORT_DUPLICATE_MODES,
  IMPORT_TARGETS,
  LEAD_STATUSES,
  LEAD_STATUS_LABEL,
  LIFECYCLE_LABEL,
  LIFECYCLE_STAGES,
  MERGE_CHOICE_FIELDS,
  OPT_OUT_CHANNEL,
  SCORE_BANDS,
  cleanTags,
  contactLabel,
  maskPii,
  contactPhoneProblem,
  emailProblem,
  joinName,
  isReservedContactName,
  CONTACT_NAME_PLACEHOLDER, // CRM C3.9 ▸ ตัวแทนชื่อตัวเดียว (ตัวปิดข้อความของการลบ PDPA ข้ามค่านี้) ◂
  nameProblem,
  type Contact360,
  type Contact360Company,
  type Contact360Section,
  type Contact360TimelineItem,
  type ContactDto,
  type ContactLeadStatus,
  type ContactLifecycle,
  type ContactListInput,
  type ContactListItem,
  type ContactListResult,
  type ContactScoreBand,
  type ContactSort,
  type ContactSource,
  type ConvertInput,
  type ConvertOptions,
  type ConvertResult,
  type CreateContactResult,
  type DuplicateHit,
  type DuplicatePairItem,
  type ImportContactsInput,
  type ImportContactsResult,
  type ImportDuplicateMode,
  type ImportJob,
  type ImportJobStatus,
  type ImportResultEntry,
  type MergeChoiceField,
} from "./contacts-shared";
import { crmScope } from "./request-scope";
import { crmSystemRow } from "./visibility"; // CRM C5.1-fix ▸ ระบบ CRM ผ่านด่านรวมคำสั่งเดียว (memo ต่อคำขอ) ◂

export {
  CONTACT_BULK_MAX,
  CONTACT_IMPORT_MAX_BYTES,
  CONTACT_IMPORT_MAX_ROWS,
  CONTACT_NAME_MAX,
  CONTACT_REASON_MIN,
  ContactsError,
};
export { CONTACT_TAGS_MAX, CONTACT_TAG_MAX } from "./contacts-shared";
/** ตัวตัดสินการส่งตัวเดียว (C20) — re-export ให้ผู้ส่งที่ import บริการผู้ติดต่ออยู่แล้วไม่ต้องรู้จักอีกไฟล์ */
export const canContact = consents.canContact;

// facade สมาชิก **โหลดตอนใช้** (dynamic import): crm facade ถูก import จากโมดูลบัญชีและทะเบียน AI —
// import ค่าที่หัวไฟล์ = วงกลมตอนโหลด (TDZ · fitness F10.1 · เหตุผลเดียวกับ companies.ts/objects.ts) · หัวไฟล์ import ได้แค่ "ชนิด"
const memberFacade = () => import("@/lib/modules/member");
/** engine ฟิลด์ตัวเดียวของระบบ (member facade → namespace `fields` · ใบ C1.2a) */
const engine = async () => (await memberFacade()).fields;

// ───────────────────────── ชนิด ─────────────────────────

export type ContactsCtx = { tenantId: string; systemId: string; actorUserId?: string | null };
type Tx = Prisma.TransactionClient;
type Db = typeof prisma | Tx;

export type CreateContactInput = {
  firstName: string;
  lastName?: string | null;
  titleTh?: string | null;
  phone?: string | null;
  email?: string | null;
  companyId?: string | null;
  jobTitle?: string | null;
  department?: string | null;
  sourceKind?: string | null;
  sourceChannel?: string | null;
  sourceDetail?: Record<string, unknown> | null;
  fields?: Record<string, unknown> | null;
  tags?: string[] | null;
  ownerUserId?: string | null;
  lineUserId?: string | null;
  force?: boolean | null;
  // CRM C2.3 ▸ ภาษาที่ใช้คุยกับลูกค้า (`CrmContact.locale`) — เงื่อนไข "ภาษา" ของกฎมอบหมายอ่านค่านี้ ⇒ ต้องมาถึงตัวเลือกผู้ดูแล
  //   ก่อนแถวถูกเขียน (ส่งมาใน `fields: { locale }` ก็ได้ — ฟิลด์ระบบตัวเดียวกัน) · ไม่ส่ง = คอลัมน์ใช้ค่าเริ่มต้นเดิม ◂
  locale?: string | null;
};

export type UpdateContactPatch = {
  firstName?: string | null;
  lastName?: string | null;
  titleTh?: string | null;
  phone?: string | null;
  email?: string | null;
  jobTitle?: string | null;
  department?: string | null;
  lineUserId?: string | null;
  companyId?: string | null;
  /** เปลี่ยนบริษัทหลักแล้ว "ย้ายดีลที่ยังเปิดของบริษัทเดิมไปด้วยไหม" (R-A) */
  moveOpenDeals?: boolean | null;
  fields?: Record<string, unknown> | null;
};

export type DangerOpts = { confirm?: boolean | null; reason?: string | null };
export type MergeContactsInput = {
  keepId: string;
  mergeId: string;
  fieldChoices?: Partial<Record<MergeChoiceField, "keep" | "merge">> | null;
  confirm?: boolean | null;
  reason?: string | null;
};
export type MergeContactsResult = { keptId: string; mergedId: string; moved: { deals: number; activities: number; companies: number; dealContacts: number; files: number; records: number }; warnings: string[] };

// ───────────────────────── ตัวช่วยพื้นฐาน ─────────────────────────

const EVENT = {
  created: "crm.contact.created",
  updated: "crm.contact.updated",
  assigned: "crm.contact.assigned",
  converted: "crm.contact.converted",
  merged: "crm.contact.merged",
} as const;
const TX_OPTS = { maxWait: 15_000, timeout: 30_000 } as const;
/** การแปลงรอคิวกันเองที่ advisory lock ของผู้ติดต่อ (กดรัว/หลายเครื่อง) — เผื่อเวลารอคิวยาวกว่าธุรกรรมทั่วไป */
const CONVERT_TX_OPTS = { maxWait: 30_000, timeout: 120_000 } as const;
const NOT_FOUND_MSG = "ไม่พบผู้ติดต่อนี้ในระบบ CRM ที่เปิดอยู่ (อาจถูกลบหรืออยู่คนละระบบ) — รีเฟรชหน้าแล้วลองใหม่";
const MERGED_MSG = "ผู้ติดต่อนี้ถูกรวมเข้ากับอีกคนแล้ว — เปิดผู้ติดต่อที่เก็บไว้แทน";
const ARCHIVED_MSG = "ผู้ติดต่อนี้ถูกเก็บถาวรแล้ว จึงแก้ไขไม่ได้ — กู้คืนก่อนถ้าต้องการใช้งานต่อ";

const fail = (code: ContactsError["code"], message: string, extra: { duplicates?: DuplicateHit[]; field?: string } = {}) => new ContactsError(code, message, extra);
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : typeof v === "number" && Number.isFinite(v) ? String(v) : null);
const newSeq = () => randomUUID().replace(/-/g, "");
const lockKey = (tx: Tx, key: string) => tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/** AUDIT-CLASS X1 · บทเรียน C1.3 SF7: ขอบเขตของ "การตรวจซ้ำ/ตัวตน/การเขียนหลังล็อก" = ร้าน + ระบบ ล้วน ๆ (ไม่ผ่าน contactWhere) */
const identityScope = (ctx: ContactsCtx) => ({ tenantId: ctx.tenantId, systemId: ctx.systemId });
const actorId = (ctx: ContactsCtx): string | null => (typeof ctx.actorUserId === "string" && ctx.actorUserId ? ctx.actorUserId : null);
const coCtx = (ctx: ContactsCtx): companies.CompaniesCtx => ({ tenantId: ctx.tenantId, systemId: ctx.systemId, actorUserId: actorId(ctx) });

function assertActor(actor: MemberActor | null | undefined): asserts actor is MemberActor {
  // ลูกค้า (portal) ไม่มีทางเข้าบริการฝั่งพนักงาน — ตอบ "ไม่พบ" (404-not-403)
  if (!actor || actor.role === "CUSTOMER") throw fail("NOT_FOUND", NOT_FOUND_MSG);
}

/** AUDIT-CLASS X1: ctx.systemId ต้องเป็นระบบ **CRM** ของร้านนี้จริง (ระบบร้านอื่น/ระบบชนิดอื่น = ไม่พบ) */
async function resolveSystem(ctx: ContactsCtx, db: Db = prisma): Promise<void> {
  const sys =
    typeof ctx?.systemId === "string" && typeof ctx?.tenantId === "string" && ctx.systemId && ctx.tenantId
      ? await crmSystemRow(ctx, db)
      : null;
  if (!sys) throw fail("NOT_FOUND", "ไม่พบระบบ CRM นี้ในร้านที่เปิดอยู่ — รีเฟรชหน้าแล้วลองใหม่");
}

async function enter(ctx: ContactsCtx, actor: MemberActor | null | undefined): Promise<MemberActor> {
  assertActor(actor);
  await resolveSystem(ctx);
  return actor;
}

// CRM C1.7 ▸ ลำดับ: ระบบ (enter) → การมองเห็น (loadContact · NOT_FOUND) → คีย์ (need · FORBIDDEN ข้อความไทย) ◂
/** AUDIT-CLASS X2: คีย์สิทธิ์ผ่าน `crm/access.ts` เท่านั้น */
function need(a: MemberActor, key: string): void {
  if (!crmCan(a, key)) throw fail("FORBIDDEN", crmForbiddenMessage(key));
}

/** AUDIT-CLASS X1: ผู้ติดต่อ 1 แถวผ่าน contactWhere เท่านั้น — ระบบอื่น/ร้านอื่น = NOT_FOUND (ข้อความไม่สะท้อนข้อมูลของเขา) */
async function loadContact(ctx: ContactsCtx, actor: MemberActor, id: unknown, db: Db = prisma, opts: { live?: boolean } = {}): Promise<CrmContact> {
  const cid = str(id);
  const row = cid ? await db.crmContact.findFirst({ where: { AND: [await contactWhere(ctx, actor, { db }), { id: cid }] } }) : null;
  if (!row) throw fail("NOT_FOUND", NOT_FOUND_MSG);
  if (opts.live && row.mergedIntoId) throw fail("VALIDATION", MERGED_MSG);
  if (opts.live && row.archivedAt) throw fail("VALIDATION", ARCHIVED_MSG);
  return row;
}

/** ล็อกแถวผู้ติดต่อ (FOR UPDATE · เรียง id) — หลังล็อกบริษัทเสมอ */
async function lockContactRows(tx: Tx, ctx: ContactsCtx, ids: string[]): Promise<void> {
  const sorted = [...new Set(ids.filter(Boolean))].sort();
  if (sorted.length === 0) return;
  await tx.$queryRaw`SELECT "id" FROM "CrmContact" WHERE "id" = ANY(${sorted}::text[]) AND "tenantId" = ${ctx.tenantId} ORDER BY "id" FOR UPDATE`;
}

function toDto(row: CrmContact): ContactDto {
  return {
    id: row.id,
    systemId: row.systemId,
    partyId: row.partyId,
    name: row.name,
    firstName: row.firstName,
    lastName: row.lastName,
    titleTh: row.titleTh,
    phone: row.phone,
    email: row.email,
    lineUserId: row.lineUserId,
    jobTitle: row.jobTitle,
    department: row.department,
    companyId: row.companyId,
    companyText: row.company,
    lifecycleStage: row.lifecycleStage as ContactLifecycle,
    leadStatus: row.leadStatus as ContactLeadStatus,
    score: row.score,
    scoreBand: (row.scoreBand as ContactScoreBand | null) ?? null,
    ownerUserId: row.ownerUserId,
    teamId: row.teamId,
    assignedAt: row.assignedAt,
    tags: row.tags,
    sourceKind: (row.sourceKind as ContactSource | null) ?? null,
    sourceChannel: row.sourceChannel,
    marketingOptOut: row.marketingOptOut,
    emailOptOut: row.emailOptOut,
    trackingOptOut: row.trackingOptOut === true,
    emailBouncedAt: row.emailBouncedAt,
    memberCustomerId: row.memberCustomerId,
    convertedAt: row.convertedAt,
    lastActivityAt: row.lastActivityAt,
    mergedIntoId: row.mergedIntoId,
    archivedAt: row.archivedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/** error จาก engine ฟิลด์ / โมดูลสมาชิก / บริการบริษัท → ContactsError · error ของฐานข้อมูลโยนต่อตามจริง */
function mapError(e: unknown): unknown {
  if (e instanceof ContactsError) return e;
  // CRM C3.9 ▸ รีวิวรอบ 2 SF1: เกินเพดาน = ข้อผิดพลาดของบริการผู้ติดต่อ (ถาวร) — สะพานที่แยก "ถาวร (ContactsError) = WARN แล้วจบ"
  //   ออกจาก "ชั่วคราว = โยนให้คิวส่งใหม่" (forms · แชท · อีเมลขาเข้า · ข้อเสนอ AI) จึงไม่ส่ง event เดิมซ้ำ 5 รอบจน FAILED ◂
  if (e instanceof CrmLimitError) return fail("LIMIT", e.message);
  if (e instanceof CompaniesError) return fail(e.code === "PARTIAL" ? "CONFLICT" : e.code, e.message);
  if (e instanceof Prisma.PrismaClientKnownRequestError || e instanceof Prisma.PrismaClientUnknownRequestError || e instanceof Prisma.PrismaClientValidationError) {
    return e;
  }
  const name = e instanceof Error ? e.name : "";
  if (name === "MemberNotFoundError") return fail("NOT_FOUND", (e as Error).message);
  if (name === "MemberInputError") return fail("VALIDATION", (e as Error).message);
  if (name === "MemberForbiddenError") return fail("FORBIDDEN", (e as Error).message);
  if (name === "MemberConflictError") return fail("CONFLICT", (e as Error).message);
  if (e instanceof Error && e.constructor === Error && /[ก-๙]/.test(e.message)) return fail("VALIDATION", e.message);
  return e;
}

function fctx(ctx: ContactsCtx, actor: MemberActor | null) {
  return { tenantId: ctx.tenantId, systemId: ctx.systemId, actorUserId: actorId(ctx), objectKey: "contact", ...(actor ? { actor } : {}) };
}

/**
 * AUDIT-CLASS X4: idempotencyKey `crm.contact.<type>#<id>#<seq>` (R-C.8) · emit ใน tx ของการเขียน
 * ⇒ เขียนไม่สำเร็จ = ไม่มี event · event เขียนไม่ได้ = การเขียนทั้งก้อนถูกยกเลิก
 * AUDIT-CLASS X8: payload = id/คีย์ล้วน (ไม่มีชื่อ/เบอร์/อีเมล/LINE id)
 */
async function emitContactEvent(tx: Tx, ctx: ContactsCtx, kind: keyof typeof EVENT, keyId: string, seq: string, payload: Record<string, unknown>): Promise<void> {
  const type = EVENT[kind];
  await emitOutbox(tx, { tenantId: ctx.tenantId, systemId: ctx.systemId, type, idempotencyKey: `${type}#${keyId}#${seq}`, payload });
}

/** AUDIT-CLASS X9: การกระทำอันตรายต้องยืนยัน + เหตุผล ≥ CONTACT_REASON_MIN ตัวอักษร (ตรวจก่อนแตะอะไรทั้งหมด) */
function reasonOf(opts: DangerOpts | null | undefined, what: string): string {
  if (opts?.confirm !== true) throw fail("CONFIRM_REQUIRED", `การ${what}ต้องกดยืนยันก่อน — ติ๊กช่องยืนยันแล้วลองอีกครั้ง`);
  const reason = String(opts?.reason ?? "").trim();
  if (reason.length < CONTACT_REASON_MIN) throw fail("VALIDATION", `ใส่เหตุผลของการ${what}อย่างน้อย ${CONTACT_REASON_MIN} ตัวอักษร เพื่อให้ทีมย้อนดูได้ว่าทำไป เพราะอะไร`);
  if (reason.length > 500) throw fail("VALIDATION", "เหตุผลยาวเกิน 500 ตัวอักษร — ย่อให้สั้นลง");
  return reason;
}

async function assertMember(ctx: ContactsCtx, userId: string, db: Db = prisma): Promise<void> {
  const n = await db.membership.count({ where: { tenantId: ctx.tenantId, userId } });
  if (n === 0) throw fail("VALIDATION", "ผู้ดูแลที่เลือกไม่ได้อยู่ในร้านนี้ — เลือกใหม่จากรายชื่อทีม");
}

// ───────────────────────── ฟิลด์ระบบของผู้ติดต่อ (seed ตอนเขียนครั้งแรก) ─────────────────────────

const seededSystems = new Set<string>();

/**
 * ฟิลด์ระบบของผู้ติดต่อ (ตัวชี้คอลัมน์ · มติ C1.2a) — ใส่ให้ถ้ายังไม่มี (idempotent)
 * AUDIT-CLASS X3: advisory lock ต่อระบบ แล้วอ่าน-เติมใน tx เดียว · unique (systemId, objectKey, key) เป็นชั้นที่สอง (ชน = กลืน P2002)
 * 🔴 ไม่เรียกจากหน้า GET — เรียกจากทางเขียนแรก (สร้าง · แก้ · นำเข้า)
 */
export async function ensureContactFields(ctx: ContactsCtx, actor: MemberActor): Promise<void> {
  const a = await enter(ctx, actor);
  await applyContactFieldTemplate(ctx, a);
}

/** CRM C1.8 ▸ ตัว seed จริง — ใช้ร่วมระหว่างทางที่มีคน (ensureContactFields) กับทางของสะพาน (actor = null · engine ไม่ต้องการ actor สำหรับเทมเพลตระบบ) ◂ */
async function applyContactFieldTemplate(ctx: ContactsCtx, actor: MemberActor | null): Promise<void> {
  try {
    await prisma.$transaction(async (tx) => {
      await lockKey(tx, `crm:contact-fields:${ctx.systemId}`);
      await (await engine()).applyTemplate(fctx(ctx, actor), "system", {}, tx);
    }, TX_OPTS);
    seededSystems.add(ctx.systemId);
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return;
    throw mapError(e);
  }
}

/** best-effort: seed ไม่ได้ห้ามทำให้การสร้าง/แก้ผู้ติดต่อล้ม */
async function seedContactFields(ctx: ContactsCtx, actor: MemberActor | null): Promise<void> {
  if (seededSystems.has(ctx.systemId)) return;
  await applyContactFieldTemplate(ctx, actor).catch(() => undefined);
}

// ───────────────────────── ตรวจค่าที่กรอก (AUDIT-CLASS X6: ตัวตรวจชุดเดียวของสร้าง · แก้ · นำเข้า) ─────────────────────────

const textOrNull = (v: unknown, label: string, max = CONTACT_TEXT_MAX): string | null => {
  if (v === null || v === undefined) return null;
  if (typeof v !== "string" && typeof v !== "number") throw fail("VALIDATION", `${label}ต้องเป็นข้อความ`);
  const s = String(v).trim();
  if (s.length > max) throw fail("VALIDATION", `${label}ยาวเกิน ${max.toLocaleString("th-TH")} ตัวอักษร — ย่อให้สั้นลง`);
  return s || null;
};

function cleanName(v: unknown, label: string, required: boolean): string | null {
  const p = nameProblem(v, label, required);
  if (p) throw fail("VALIDATION", p);
  const out = str(typeof v === "number" ? String(v) : v);
  return out ? normalizeThaiText(out) : out; // CRM C5.4-E ▸ L6-m3: สระอำแบบแยก (ํ + า) เก็บเป็น "ำ" ตัวเดียว ◂
}

/** เบอร์ที่เก็บ: เบอร์ไทยเก็บรูป 0XXXXXXXXX (ตัวเดียวกับ Party) · เบอร์ต่างประเทศเก็บตามที่พิมพ์ */
function storePhone(raw: string | null): string | null {
  if (!raw) return null;
  const norm = party.normalizePartyPhone(raw);
  return /^0\d{8,9}$/.test(norm) ? norm : raw.trim();
}

function cleanPhone(v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v !== "string" && typeof v !== "number") throw fail("VALIDATION", "เบอร์โทรต้องเป็นข้อความ");
  // C5.4 (L6-m7): เลขไทย ๐–๙ = เบอร์ปกติที่พิมพ์ด้วยแป้นไทย ⇒ แปลงก่อนตรวจ (เดิมปฏิเสธ "ใช้ได้เฉพาะตัวเลข")
  const text = arabicDigits(String(v));
  const p = contactPhoneProblem(text);
  if (p) throw fail("VALIDATION", p);
  return storePhone(text.trim());
}

function cleanEmail(v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v !== "string") throw fail("VALIDATION", "อีเมลต้องเป็นข้อความ");
  const p = emailProblem(v);
  if (p) throw fail("VALIDATION", p);
  return v.trim().toLowerCase() || null;
}

/** รูปแบบทั้งหมดที่เบอร์เดียวกันอาจถูกเก็บไว้ (แถวเก่า v1 เก็บตามที่พิมพ์) */
function phoneVariants(phone: string): string[] {
  const out = new Set<string>([phone.trim()]);
  const norm = party.normalizePartyPhone(phone);
  if (norm) {
    out.add(norm);
    if (/^0\d{9}$/.test(norm)) {
      out.add(`${norm.slice(0, 3)}-${norm.slice(3, 6)}-${norm.slice(6)}`);
      out.add(`+66${norm.slice(1)}`);
      out.add(`66${norm.slice(1)}`);
    }
  }
  return [...out].filter(Boolean);
}

function parseSource(v: unknown): MemberSource | null {
  const s = str(v)?.toUpperCase() ?? null;
  if (!s) return null;
  if (!(CONTACT_SOURCES as readonly string[]).includes(s)) throw fail("VALIDATION", `ที่มา "${s.slice(0, 30)}" ยังไม่อยู่ในรายการ — เลือกจาก ${Object.values(CONTACT_SOURCE_LABEL).join(" · ")}`);
  return s as MemberSource;
}

function parseChannelKey(v: unknown): string | null {
  const s = str(v)?.toUpperCase() ?? null;
  if (!s) return null;
  if (!isChannelKey(s)) throw fail("VALIDATION", `ช่องทาง "${s.slice(0, 30)}" ยังไม่มีในทะเบียนช่องทางของระบบ`);
  return s;
}

const UTM_KEYS = ["source", "medium", "campaign", "term", "content"] as const;
// CRM C1.8 ▸ + submissionId (ลีดจากฟอร์มชี้คำตอบที่ทำให้เกิด — สะพานฟอร์ม · สัญญาข้อสอบ C1.8 S2.2) ◂
const SOURCE_DETAIL_KEYS = ["formId", "submissionId", "linkId", "pageUrl", "referrer", "chatContactId", "staffUserId", "importJobId", "campaignId"] as const;
// CRM C3.7 ▸ (รีวิว SF-5) ที่มาที่ "ระบบเป็นคนบอก" — `via` (ป้ายระบบ เช่น card-scan · chat-panel) + `proposalId` (ใบข้อเสนอ AI ที่ทำให้เกิด)
//   🔴 ไม่อยู่ในรายการคีย์ของผู้เรียก (SOURCE_DETAIL_KEYS) โดยเจตนา: คีย์ทั้งสองที่มากับ input ภายนอก (ฟอร์มหน้าเว็บ · REST `contacts.create` ·
//      เครื่องมือ AI) ถูกทิ้งเสมอ — ให้ผ่านได้เฉพาะพารามิเตอร์ภายใน `trusted` ของโค้ดฝั่งเซิร์ฟเวอร์: `calls.acceptLeadProposal`
//      (`{ via: "card-scan", proposalId }`) และ `leadFromBridge` ของแผงแชท (`via: "chat-panel"` — ค่าคงที่ในโค้ด)
export type TrustedSource = { via?: string | null; proposalId?: string | null };
const TRUSTED_VIA = /^[a-z0-9-]{1,40}$/;
const TRUSTED_PROPOSAL = /^[A-Za-z0-9_-]{1,64}$/;
// ◂ CRM C3.7

/** AUDIT-CLASS X6: sourceDetail เก็บเฉพาะคีย์ที่รู้จัก · ค่าข้อความ ≤ 500 · url เฉพาะ http/https · utm 5 คีย์เรียงคงที่ */
function cleanSourceDetail(raw: unknown, trusted?: TrustedSource | null): Record<string, unknown> | null {
  const out: Record<string, unknown> = {};
  // CRM C3.7 ▸ ค่าที่ระบบบอกเอง (ดู TrustedSource) — รูปผิด = ไม่เก็บ (ไม่ throw: ที่มาไม่ควรทำให้ผู้ติดต่อหล่นหาย) ◂
  const tVia = str(trusted?.via);
  const tProp = str(trusted?.proposalId);
  if (tVia && TRUSTED_VIA.test(tVia)) out.via = tVia;
  if (tProp && TRUSTED_PROPOSAL.test(tProp)) out.proposalId = tProp;
  if (!isObj(raw)) return Object.keys(out).length > 0 ? out : null;
  if (isObj(raw.utm)) {
    const utm: Record<string, string> = {};
    for (const k of UTM_KEYS) {
      const v = str(raw.utm[k]);
      if (v) utm[k] = v.slice(0, CONTACT_SOURCE_TEXT_MAX);
    }
    if (Object.keys(utm).length > 0) out.utm = utm;
  }
  for (const k of SOURCE_DETAIL_KEYS) {
    const v = str(raw[k]);
    if (!v) continue;
    if ((k === "pageUrl" || k === "referrer") && !/^https?:\/\//i.test(v)) {
      throw fail("VALIDATION", "ลิงก์หน้าเว็บที่มา/ผู้แนะนำต้องขึ้นต้นด้วย http:// หรือ https://");
    }
    // CRM C5.4-B ▸ L5-m6: ลิงก์ที่มาเก็บแบบเดียวกับ web tracking — pageUrl คงเฉพาะ utm_source/medium/campaign (ตัด utm_term/content + ?email=&phone=&token= · #fragment — รีวิว note f) ·
    //   referrer ตัด query/fragment ทั้งหมด (tracking-shared · X8) ◂
    const cleaned = k === "pageUrl" ? cleanTrackedUrl(v, { keep: SOURCE_PAGE_UTM_KEEP }) : k === "referrer" ? cleanReferrer(v) : v;
    if (!cleaned) continue;
    out[k] = cleaned.slice(0, CONTACT_SOURCE_TEXT_MAX);
  }
  return Object.keys(out).length > 0 ? out : null;
}

/** คอลัมน์ของผู้ติดต่อที่ถ้าส่งมาใน `fields` จะถูกพาเข้าเส้นทางของไฟล์นี้ (Party ตรงกัน · ตัวตรวจชุดเดียว) */
const ROUTED_FIELD_KEYS = ["firstName", "lastName", "titleTh", "phone", "email", "jobTitle", "department", "lineUserId"] as const;
type RoutedKey = (typeof ROUTED_FIELD_KEYS)[number];
/** คอลัมน์ที่ patch ของ updateContact ห้ามแตะ (มีเมนูเฉพาะ: setOptOut · setLeadStatus · assign …) */
const PATCH_FORBIDDEN_MSG = (key: string) =>
  `ข้อมูล "${key}" ของผู้ติดต่อแก้ได้จากเมนูเฉพาะของมัน (เช่น ไม่รับข่าวสาร · สถานะ lead · ผู้ดูแล · แท็ก) — ในแบบฟอร์มจึงแสดงค่าอย่างเดียว`;

/** แยก `fields`: คอลัมน์ของผู้ติดต่อ → เส้นทางของไฟล์นี้ (ค่าที่ส่งตรงชนะ) · key ที่ engine ปฏิเสธ → VALIDATION · ที่เหลือ → engine */
async function splitFields<T extends Record<string, unknown>>(input: T, raw: unknown): Promise<{ merged: T; custom: Record<string, unknown> }> {
  const merged = { ...input };
  const custom: Record<string, unknown> = {};
  const bag = isObj(raw) ? raw : {};
  const keys = Object.keys(bag);
  if (keys.length === 0) return { merged, custom };
  const governed = (await engine()).GOVERNED_CRM_SYSTEM_KEYS.contact;
  const target = merged as Record<string, unknown>;
  for (const key of keys) {
    if ((ROUTED_FIELD_KEYS as readonly string[]).includes(key)) {
      if (target[key as RoutedKey] === undefined) target[key as RoutedKey] = bag[key];
      continue;
    }
    if (governed.has(key)) throw fail("VALIDATION", PATCH_FORBIDDEN_MSG(key));
    custom[key] = bag[key];
  }
  return { merged, custom };
}

type CreateClean = {
  firstName: string;
  lastName: string | null;
  titleTh: string | null;
  phone: string | null;
  email: string | null;
  jobTitle: string | null;
  department: string | null;
  lineUserId: string | null;
  sourceKind: MemberSource | null;
  sourceChannel: string | null;
  sourceDetail: Record<string, unknown> | null;
  tags: string[];
  ownerUserId: string | null;
  companyId: string | null;
  /** CRM C2.3 ▸ ภาษาของลูกค้า — ลงคอลัมน์ `locale` และเข้าร่าง lead ของกฎมอบหมาย (null = ใช้ค่าเริ่มต้นของคอลัมน์) ◂ */
  locale: string | null;
};

// CRM C2.3 ▸ รหัสภาษาของลูกค้า: BCP-47 หลายส่วนก็ได้ (`th` · `en` · `zh-hans` · `zh-hant-tw` — ตัวเล็กทั้งหมด · `_` แปลงเป็น `-`)
//   ผิดรูป/ว่าง = null
//   🔴 ไม่ throw: นี่คือทางรับ lead (ฟอร์ม/แชท/ระบบภายนอก) — ค่าที่อ่านไม่ออกต้องไม่ทำให้ลีดของร้านหล่นหาย
//      ผลของ null = เหมือนเดิมทุกไบต์ (คอลัมน์ใช้ default "th" · เงื่อนไขภาษาอ่านได้ "th")
function cleanLocale(v: unknown): string | null {
  const s = (str(v) ?? "").toLowerCase().replace(/_/g, "-");
  return /^[a-z]{2,3}(-[a-z0-9]{2,8})*$/.test(s) ? s.slice(0, 35) : null;
}
// ◂ CRM C2.3

function cleanCreate(input: CreateContactInput, trusted?: TrustedSource | null): CreateClean {
  const firstName = cleanName(input.firstName, "ชื่อจริง", true) as string;
  const lastName = cleanName(input.lastName, "นามสกุล", false);
  const tags = cleanTags(Array.isArray(input.tags) ? input.tags : []);
  if (tags.problem) throw fail("VALIDATION", tags.problem);
  return {
    firstName,
    lastName,
    titleTh: textOrNull(input.titleTh, "คำนำหน้า", 40),
    phone: cleanPhone(input.phone),
    email: cleanEmail(input.email),
    jobTitle: textOrNull(input.jobTitle, "ตำแหน่ง"),
    department: textOrNull(input.department, "แผนก"),
    lineUserId: textOrNull(input.lineUserId, "LINE user id", 100),
    sourceKind: parseSource(input.sourceKind),
    sourceChannel: parseChannelKey(input.sourceChannel),
    sourceDetail: cleanSourceDetail(input.sourceDetail, trusted), // CRM C3.7 ◂
    tags: tags.tags,
    ownerUserId: str(input.ownerUserId),
    companyId: str(input.companyId),
    locale: cleanLocale(input.locale), // CRM C2.3 ◂
  };
}

// ───────────────────────── ตัวตน (Party) + ตัวซ้ำ ─────────────────────────

/**
 * Party ชนิด "คน" ของผู้ติดต่อ — หา/สร้างผ่าน facade (taxId → เบอร์ → ชื่อ+อีเมล) ใน tx ของผู้เรียก
 * 🔴 ถ้าตัวที่จับได้เป็น Party บริษัท (เบอร์สำนักงานชนกัน ฯลฯ) ⇒ **ไม่ผูก** — สร้าง Party คนใหม่ที่ไม่มีกุญแจจับคู่ แล้วเติมเบอร์/อีเมล
 *    ผ่าน `updateContactInfo` (ค่าชนกับรายอื่น = บันทึกคู่ "อาจเป็นคนเดียวกัน" ไม่ใช่ล้ม)
 */
async function personParty(tx: Tx, tenantId: string, input: { name: string; phone: string | null; email: string | null }): Promise<string> {
  // CRM C1.8 ▸ AUDIT-CLASS X3: เบอร์/อีเมลเดียวกันจากหลายทาง (คนละระบบ CRM · สะพานแชท · คนละโพรเซส) ⇒ Party เดียว —
  //   advisory lock ระดับร้านต่อ (เบอร์ normalize) / (อีเมล) เรียงคีย์ ก่อนหา/สร้าง · ลำดับล็อกของทั้งไฟล์: ตัวตนระบบ (`crm:contact-ident:*`) → Party ◂
  const pKeys: string[] = [];
  if (input.phone) pKeys.push(`crm:person-party:${tenantId}:p:${party.normalizePartyPhone(input.phone) || input.phone}`);
  if (input.email) pKeys.push(`crm:person-party:${tenantId}:e:${input.email.toLowerCase()}`);
  for (const k of pKeys.sort()) await lockKey(tx, k);
  const hit = await party.findOrCreate(tenantId, { name: input.name, phone: input.phone, email: input.email, kind: "PERSON" }, tx);
  const prof = await party.getProfile(tenantId, hit.id, tx);
  if (prof && prof.kind !== "COMPANY" && !prof.mergedIntoId) return hit.id;
  const fresh = await party.findOrCreate(tenantId, { name: input.name, kind: "PERSON" }, tx);
  if (input.phone || input.email) await party.updateContactInfo(tenantId, fresh.id, { phone: input.phone, email: input.email }, tx);
  return fresh.id;
}

/**
 * รีวิว C1.4 S1 (กระจกของ C1.3 SF1): Party นี้มี "ผู้ถือคนเดียว" ไหม — ไม่มีสมาชิก (Customer) · ไม่มีผู้ติดต่อบัญชี (AccountContact) ·
 * ไม่มี CrmContact อื่นทุกระบบ · 🔴 นับอย่างเดียวใน tx ของผู้เรียก (แบบเดียวกับ companies.ts#isSoleHolder อ่าน AccountContact ตรง) —
 * facade ของสมาชิก/บัญชีไม่มีตัวนับตาม Party และการตัดสินนี้ต้องอยู่ใน tx เดียวกับการเขียน
 */
async function isSolePartyHolder(tx: Tx, tenantId: string, partyIds: string[], excludeContactIds: string[]): Promise<boolean> {
  const ids = [...new Set(partyIds.filter(Boolean))];
  if (ids.length === 0) return true;
  const customers = await tx.customer.count({ where: { tenantId, partyId: { in: ids } } });
  if (customers > 0) return false;
  const accounts = await tx.accountContact.count({ where: { tenantId, partyId: { in: ids } } });
  if (accounts > 0) return false;
  const others = await tx.crmContact.count({ where: { tenantId, partyId: { in: ids }, id: { notIn: excludeContactIds } } });
  return others === 0;
}

/**
 * Party หลังแก้ชื่อ/เบอร์/อีเมลของผู้ติดต่อ (ใน tx ของผู้เรียก):
 *   ผู้ถือคนเดียว ⇒ แก้ Party เดิมผ่าน `party.updateContactInfo` (เฉพาะช่องที่เปลี่ยน) ·
 *   ใช้ร่วมกับสมาชิก/บัญชี/ผู้ติดต่ออื่น ⇒ **ไม่แตะ Party ที่ใช้ร่วม** — ย้ายผู้ติดต่อนี้ไป `personParty(ค่าใหม่)` (ล้างเบอร์ไม่มีวันล้าง Party ของคนอื่น)
 */
async function partyAfterChange(
  tx: Tx,
  ctx: ContactsCtx,
  current: string | null,
  opts: { alsoPartyIds?: string[]; excludeContactIds: string[] },
  next: { name: string; phone: string | null; email: string | null },
  changed: { name?: boolean; phone?: boolean; email?: boolean },
): Promise<string> {
  if (!current) return personParty(tx, ctx.tenantId, next);
  const canonical = await party.resolveCanonical(ctx.tenantId, current, tx);
  const sole = await isSolePartyHolder(tx, ctx.tenantId, [current, canonical, ...(opts.alsoPartyIds ?? [])], opts.excludeContactIds);
  if (!sole) return personParty(tx, ctx.tenantId, next);
  const r = await party.updateContactInfo(
    ctx.tenantId,
    canonical,
    { ...(changed.name ? { name: next.name } : {}), ...(changed.phone ? { phone: next.phone } : {}), ...(changed.email ? { email: next.email } : {}) },
    tx,
  );
  return r.ok && r.partyId ? r.partyId : canonical;
}

/** ผู้ติดต่อที่ยังใช้งาน "ในระบบเดียวกัน" ที่เบอร์ (ทุกรูปแบบ) หรืออีเมล (ไม่สนตัวพิมพ์) ตรงกัน — ขอบเขตตัวตน ไม่ใช่การมองเห็น */
async function duplicateHits(db: Db, ctx: ContactsCtx, keys: { phone: string | null; email: string | null }, excludeId?: string | null): Promise<{ hits: DuplicateHit[]; rows: CrmContact[] }> {
  const OR: Prisma.CrmContactWhereInput[] = [];
  if (keys.phone) OR.push({ phone: { in: phoneVariants(keys.phone) } });
  if (keys.email) OR.push({ email: ciEquals(keys.email) }); // CRM C5.5-fix2 ▸ `a_b@` เคยเป็น "คนเดียวกับ" `a.b@` (lead จากฟอร์ม/อีเมลถูกรวมเข้าคนอื่น) ◂
  if (OR.length === 0) return { hits: [], rows: [] };
  const rows = await db.crmContact.findMany({
    where: { ...identityScope(ctx), mergedIntoId: null, archivedAt: null, OR, ...(excludeId ? { id: { not: excludeId } } : {}) },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: 10,
  });
  const norm = keys.phone ? party.normalizePartyPhone(keys.phone) : "";
  const hits = rows.map((r) => ({
    contactId: r.id,
    name: contactLabel(r),
    reason: (norm && r.phone && party.normalizePartyPhone(r.phone) === norm ? "PHONE" : "EMAIL") as DuplicateHit["reason"],
  }));
  return { hits, rows };
}

// ═════════════════════════ สร้าง ═════════════════════════

type CreateCoreOpts = {
  force: boolean;
  via: "USER" | "IMPORT" | "API";
  custom?: Record<string, unknown>;
  /** ช่องข้อความเดิมของ v1 (`company` · `source`) — ใช้โดยตัวห่อ v1 เท่านั้น */
  legacy?: { company?: string | null; source?: string | null; name?: string | null; note?: string | null };
  // CRM C2.3 ▸ `auto` = ใช้กฎมอบหมายแม้มีคนสร้าง (`ownerUserId: "auto"`) · `leave` = "ใครลาอยู่" ที่อ่านก่อนเปิด tx (assignment.leaveSnapshot) ◂
  auto?: boolean;
  leave?: assignment.AssignmentLeaveSnapshot | null;
  // CRM C2.6 ▸ กฎมอบหมายที่ "ต้นทาง" ระบุมาเจาะจง (ฟอร์มที่ตั้ง `FormDef.assignRuleId`) — ส่งต่อให้ `assignment.pick`
  //   ทางเดียวกับที่ผู้ใช้เลือกกฎเอง · ไม่ส่ง/ไม่ตรงระบบ = ใช้กฎตามลำดับเหมือนเดิม (C2.3 `pick` เป็นคนตัดสิน) ◂
  ruleId?: string | null;
  /** CRM C5.4-E r2 ▸ SF-3: งานเป็นชุด (นำเข้า) — event `assigned` ติดรหัสชุด ⇒ ตัวส่งแจ้งเตือนไม่แจ้งทีละแถว (ผู้เรียกส่งสรุปเอง 1 ใบ) ◂ */
  batchId?: string | null;
};
type CreateCoreResult = { row: CrmContact; created: boolean; duplicates: DuplicateHit[] };

/**
 * สร้างผู้ติดต่อ 1 แถว (ธุรกรรมเดียว: advisory ตัวตน → ตัวซ้ำ → Party → CrmContact → ฟิลด์กำหนดเอง → event)
 * AUDIT-CLASS X3: เบอร์/อีเมลเดียวกันยิงพร้อมกัน ⇒ advisory lock ต่อ (ระบบ, เบอร์ normalize) และ (ระบบ, อีเมล) เรียงคีย์ ·
 *   อ่านตัวซ้ำหลังได้ล็อก (READ COMMITTED = เห็นของคนก่อนหน้า) ⇒ ได้แถวเดียว ผู้แพ้ได้ `created:false` + ตัวซ้ำ
 */
async function createCore(ctx: ContactsCtx, actor: MemberActor | null, c: CreateClean, opts: CreateCoreOpts): Promise<CreateCoreResult> {
  // CRM C2.3 ▸ ทางอัตโนมัติ: อ่านสถานะลาก่อนเปิด tx (ใน tx ห้ามยืม connection ที่สอง) ◂
  const leave = opts.leave !== undefined ? opts.leave : await autoLeave(ctx, actor, c, opts);
  try {
    return await prisma.$transaction(async (tx) => {
      for (const k of identKeys(ctx, c.phone, c.email)) await lockKey(tx, k);
      const dup = await duplicateHits(tx, ctx, { phone: c.phone, email: c.email });
      if (dup.hits.length > 0 && !opts.force) return { row: dup.rows[0] as CrmContact, created: false, duplicates: dup.hits };
      const row = await insertContactInTx(tx, ctx, actor, c, { ...opts, leave });
      return { row, created: true, duplicates: dup.hits };
    }, TX_OPTS);
  } catch (e) {
    throw mapError(e);
  }
}

/** กุญแจ advisory ของตัวตนในระบบนี้ (เบอร์ normalize · อีเมลตัวเล็ก) เรียงแล้ว — ใช้ทุกทางที่สร้างผู้ติดต่อ (AUDIT-CLASS X3) */
function identKeys(ctx: ContactsCtx, phone: string | null, email: string | null): string[] {
  const keys: string[] = [];
  if (phone) keys.push(`crm:contact-ident:${ctx.systemId}:p:${party.normalizePartyPhone(phone) || phone}`);
  if (email) keys.push(`crm:contact-ident:${ctx.systemId}:e:${email.toLowerCase()}`);
  return keys.sort();
}

/**
 * เขียนแถวผู้ติดต่อใหม่ 1 แถวใน tx ของผู้เรียก (ผู้เรียกถือล็อกตัวตนแล้ว) — ผู้เขียนแถวใหม่ที่เดียวของไฟล์:
 * ผู้ดูแลจาก `assignment.pick` (ใบ C2.3 เปลี่ยนตัวเลือก) · Party (ส่งมา = ผูกตรง · ไม่ส่ง = `personParty`) · ฟิลด์กำหนดเอง ·
 * event `crm.contact.created` (+ `crm.contact.assigned` เมื่อได้ผู้ดูแล) ใน tx เดียวกัน
 */
async function insertContactInTx(tx: Tx, ctx: ContactsCtx, actor: MemberActor | null, c: CreateClean, opts: Omit<CreateCoreOpts, "force"> & { partyId?: string | null }): Promise<CrmContact> {
  // CRM C3.9 ▸ AUDIT-CLASS X3: เพดานผู้ติดต่อของระบบ (§11.9) — ตัวเขียนแถวใหม่ที่เดียวของไฟล์ ⇒ ทุกทางสร้าง (คน · ฟอร์ม · แชท · อีเมล ·
  //   นำเข้า · v1) ผ่านด่านนี้ใน tx เดียวกับ insert · เกิน = CrmLimitError (LIMIT · ไทย) และไม่มีอะไรถูกเขียน ◂
  await assertCrmLimit(ctx, "contacts", 1, tx);
  const name = opts.legacy?.name ?? joinName(c.firstName, c.lastName);
  assertNotReservedName(name); // CRM C3.9 ▸ ชื่อสงวนของการลบ PDPA (รีวิว S2) — ทุกทางสร้างผ่านบรรทัดนี้ ◂
  const custom = opts.custom ?? {};
  const partyId = opts.partyId ?? (await personParty(tx, ctx.tenantId, { name, phone: c.phone, email: c.email }));
  // CRM C2.3 ▸ ตัวเลือกผู้ดูแลจริง (แทน stub C1.4) — await ใน tx นี้ (cursor round-robin/เพดานงานค้างถอยพร้อม tx) · ร่าง lead ให้เงื่อนไขของกฎ
  //   "คนที่สร้าง" = actor ที่ยืนยันตัวแล้ว (ctx.actorUserId เป็นแค่สำเนา — ไม่ตรงกัน ให้ actor ชนะ) · ไม่มี actor (v1/ฟอร์ม/สะพาน) = ctx
  const pick = await assignment.pick(
    ctx,
    {
      fixedOwnerUserId: c.ownerUserId,
      creatorUserId: actor?.userId || actorId(ctx),
      via: opts.via,
      auto: opts.auto === true,
      ruleId: opts.ruleId ?? null, // CRM C2.6 ◂
      draft: { sourceKind: c.sourceKind, sourceChannel: c.sourceChannel, locale: c.locale, partyId, companyId: c.companyId, fields: custom },
      leave: opts.leave ?? null,
    },
    tx,
  );
  // ◂ CRM C2.3
  const now = new Date();
  const row = await tx.crmContact.create({
    data: {
      tenantId: ctx.tenantId,
      systemId: ctx.systemId,
      name,
      firstName: c.firstName,
      lastName: c.lastName,
      titleTh: c.titleTh,
      phone: c.phone,
      email: c.email,
      jobTitle: c.jobTitle,
      department: c.department,
      lineUserId: c.lineUserId,
      company: opts.legacy?.company ?? null,
      source: opts.legacy?.source ?? null,
      note: opts.legacy?.note ?? null,
      sourceKind: c.sourceKind,
      sourceChannel: c.sourceChannel,
      // CRM C2.3 ▸ ภาษาของลูกค้า — `undefined` (ไม่ส่งค่า) = คอลัมน์ใช้ default เดิม "th" ⇒ แถวของร้านที่ไม่ส่งภาษาเหมือนเดิมทุกไบต์ ◂
      locale: c.locale ?? undefined,
      sourceDetail: (c.sourceDetail ?? undefined) as Prisma.InputJsonValue | undefined,
      tags: c.tags,
      ownerUserId: pick.ownerUserId,
      assignedAt: pick.ownerUserId ? now : null,
      assignedBy: pick.ownerUserId ? pick.assignedBy : null,
      teamId: pick.ownerUserId ? pick.teamId : null, // CRM C2.3 ◂
      partyId,
    },
  });
  if (Object.keys(custom).length > 0) {
    await (await engine()).lockRecordForFieldWrite(tx, row.id);
    await (await engine()).setFieldValues(fctx(ctx, actor), row.id, custom, { via: opts.via === "IMPORT" ? "IMPORT" : opts.via === "API" ? "API" : "STAFF", byUserId: actorId(ctx) }, tx);
  }
  await emitContactEvent(tx, ctx, "created", row.id, "1", { contactId: row.id, partyId: row.partyId });
  if (row.ownerUserId) await emitContactEvent(tx, ctx, "assigned", row.id, "1", { contactId: row.id, ownerUserId: row.ownerUserId, previousOwnerUserId: null, ...(opts.batchId ? { batchId: opts.batchId } : {}) });
  // CRM C2.3 ▸ ไม่มีใครรับได้บนทางอัตโนมัติ (v2 เท่านั้น) ⇒ แจ้ง OWNER/MANAGER ใน tx นี้ (ผู้ติดต่อเกิดครั้งเดียว = แจ้งครั้งเดียว · id ล้วน) ◂
  if (pick.reason === "NOBODY") await assignment.notifyUnassigned(tx, ctx, row.id);
  return row;
}

// CRM C2.3 ▸ "ใครลาอยู่" ของทางอัตโนมัติ (ไม่มีผู้ดูแลที่เลือก · ไม่มีคนสร้างหรือขอ auto) — อ่านก่อนเปิด tx · ทางอื่น = null (ไม่อ่านอะไร)
async function autoLeave(ctx: ContactsCtx, actor: MemberActor | null, c: CreateClean, opts: { auto?: boolean }): Promise<assignment.AssignmentLeaveSnapshot | null> {
  if (c.ownerUserId) return null;
  if ((actor?.userId || actorId(ctx)) && opts.auto !== true) return null;
  return assignment.leaveSnapshot(ctx);
}
// ◂ CRM C2.3

/** ตรวจบริษัทที่เลือกให้ผู้ติดต่อ (ระบบเดียวกัน · ยังใช้งาน) */
async function assertCompany(ctx: ContactsCtx, actor: MemberActor, companyId: string): Promise<void> {
  const [co] = await companies.liveCompanyRefs(coCtx(ctx), actor, [companyId]);
  if (!co) throw fail("VALIDATION", "ไม่พบบริษัทที่เลือกในระบบ CRM นี้ (อาจถูกเก็บถาวรหรือรวมไปแล้ว) — เลือกใหม่จากรายการ");
}

/** ผูกบริษัทผ่านบริการบริษัท (บริษัทก่อนผู้ติดต่อ · เขียนแคช companyId ที่นั่นที่เดียว) — คืนข้อความเตือนถ้าไม่สำเร็จ */
async function linkCompany(ctx: ContactsCtx, actor: MemberActor, companyId: string, contactId: string, primary: boolean, jobTitle?: string | null): Promise<string | null> {
  try {
    await companies.addContact(coCtx(ctx), actor, companyId, { contactId, isPrimary: primary, ...(jobTitle ? { jobTitle } : {}) });
    return null;
  } catch (e) {
    const m = mapError(e);
    return m instanceof ContactsError ? m.message : "ผูกบริษัทไม่สำเร็จ — ผูกบริษัทได้จากหน้าผู้ติดต่อ";
  }
}

// CRM C3.7 ▸ `opts.trustedSource` = ที่มาที่โค้ดฝั่งเซิร์ฟเวอร์ยืนยันเอง (via/proposalId) — ผู้เรียกจากภายนอกไม่มีทางส่งค่านี้ (ไม่ใช่ช่องของ input) ◂
// C4.3-fix part 2 · round 2 ▸ `opts.requireCustom` = ทางเข้าที่คนกรอก (server action · REST `contacts.create`) บังคับฟิลด์กำหนดเองที่ต้องกรอก ·
//   ทางเข้าอัตโนมัติ (สายเข้า · แชท · นำเข้า · ฟอร์มหน้าเว็บ) ไม่มีค่าให้กรอก จึงไม่ส่งธงนี้ ◂
export async function createContact(ctx: ContactsCtx, actor: MemberActor, input: CreateContactInput, opts?: { trustedSource?: TrustedSource | null; requireCustom?: boolean }): Promise<CreateContactResult & { warnings: string[] }> {
  const a = await enter(ctx, actor);
  need(a, "crm.contact.create");
  const { merged, custom } = await splitFields((input ?? {}) as CreateContactInput, input?.fields);
  // CRM C2.3 ▸ `ownerUserId: "auto"` (พิมพ์เขียว §5.3) = ให้กฎมอบหมายเลือก · ระบุคน = คนนั้น · ไม่ระบุ = คนที่สร้าง (C1.4 เดิม)
  //   ภาษาของลูกค้าส่งมาได้ทั้ง `locale` ตรง ๆ และใน `fields: { locale }` (ฟิลด์ระบบตัวเดียวกัน) — อ่านค่าไว้ใช้ตัดสินผู้ดูแล
  //   โดย **ไม่ย้ายออกจาก bag** (engine ยังเป็นผู้เขียนค่าฟิลด์รอบหลัง insert เหมือนเดิม · ค่าเดียวกัน คอลัมน์เดียวกัน) ◂
  const auto = str(merged.ownerUserId) === "auto";
  const localeIn = merged.locale ?? (typeof custom.locale === "string" ? custom.locale : null);
  const clean = cleanCreate({ ...merged, locale: localeIn, ...(auto ? { ownerUserId: null } : {}) }, opts?.trustedSource ?? null);
  // ค่าที่มาทาง `fields.locale` ต้องลงคอลัมน์เป็นรูปเดียวกับที่ใช้ตัดสิน (engine เขียนทับรอบหลัง insert — "EN" ต้องไม่ชนะ "en")
  if (typeof custom.locale === "string" && clean.locale) custom.locale = clean.locale;
  if (clean.ownerUserId) await assertMember(ctx, clean.ownerUserId);
  // CRM C5.5-fix6 ▸ F3: ไม่มีสิทธิ์อ่านบริษัท = ช่องบริษัทถูกซ่อนในฟอร์ม · ส่ง companyId ตรง ๆ = ปฏิเสธก่อนเขียนด้วยข้อความเรื่องสิทธิ์
  //   (เดิม "ไม่พบบริษัทที่เลือก" ซึ่งชวนให้เลือกใหม่ทั้งที่ไม่มีทางเลือกได้) ◂
  if (clean.companyId) {
    need(a, "crm.company.read");
    // CRM C5.5-fix6 r2 ▸ F6-1: ผูกบริษัทต้องแก้บริษัทได้ด้วย (addContact ตรวจ crm.company.update) — เดิมสร้างผู้ติดต่อแล้วผูกไม่สำเร็จ + คำเตือน ·
    //   ตอนนี้ปฏิเสธก่อนเขียนอะไร (เหมือนทางแก้ไข · ช่องในฟอร์มซ่อนด้วยคีย์ชุดเดียวกัน crmCanLinkCompany) ◂
    need(a, "crm.company.update");
    await assertCompany(ctx, a, clean.companyId);
  }
  await seedContactFields(ctx, a);
  if (opts?.requireCustom) {
    // engine ตรวจเฉพาะ key ที่ส่งมา — ช่องบังคับที่ "ไม่ส่งเลย" ต้องตรวจที่นี่ (กติกาเดียวกับ objects.ts records.create)
    const miss = missingRequiredCustom(await (await engine()).listLayout(fctx(ctx, a)), custom);
    if (miss) throw fail("VALIDATION", requiredCustomMessage(miss.label), { field: customFieldErrorKey(miss.key) });
  }
  const res = await createCore(ctx, a, { ...clean, sourceKind: clean.sourceKind ?? "CRM" }, { force: input?.force === true, via: "USER", custom, auto });
  if (!res.created) return { contact: toDto(res.row), created: false, duplicates: res.duplicates, warnings: [] };
  const warnings: string[] = [];
  if (clean.companyId) {
    const w = await linkCompany(ctx, a, clean.companyId, res.row.id, false, clean.jobTitle);
    if (w) warnings.push(`เพิ่มผู้ติดต่อแล้ว แต่${w}`);
  }
  await writeAudit({
    tenantId: ctx.tenantId,
    actorId: actorId(ctx),
    action: "crm.contact.create",
    targetType: "CrmContact",
    targetId: res.row.id,
    after: { partyId: res.row.partyId, ownerUserId: res.row.ownerUserId, sourceKind: res.row.sourceKind, fields: Object.keys(custom), duplicates: res.duplicates.map((d) => d.contactId) },
  });
  const fresh = await prisma.crmContact.findFirst({ where: { ...identityScope(ctx), id: res.row.id } });
  return { contact: toDto(fresh ?? res.row), created: true, duplicates: res.duplicates, warnings };
}

/**
 * ทางเข้าของ v1 (ฟอร์มสาธารณะ · เครื่องมือ AI `crm_create_lead`) — ไม่มี actor คน
 * ชื่อเต็มแยกที่ช่องว่างแรก · `name` เดิมคงตามที่ส่งมา · ซ้ำ = สร้างเป็นคู่สงสัยซ้ำ (พฤติกรรม v1 คือสร้างทุกครั้ง)
 */
export async function createContactFromLegacy(
  ctx: ContactsCtx,
  input: { name: string; phone?: string | null; email?: string | null; company?: string | null; source?: string | null; ownerUserId?: string | null },
): Promise<{ id: string }> {
  await resolveSystem(ctx);
  const owner = str(input?.ownerUserId);
  if (owner) await assertMember(ctx, owner);
  const legacySource = str(input?.source);
  const args = legacyCreateArgs(input, owner);
  const res = await createCore(ctx, null, args.clean, { force: true, via: legacySource === "AI" ? "API" : "USER", legacy: args.legacy });
  await writeAudit({ tenantId: ctx.tenantId, actorId: actorId(ctx), action: "crm.contact.create", targetType: "CrmContact", targetId: res.row.id, after: { partyId: res.row.partyId, via: "v1", source: legacySource } });
  return { id: res.row.id };
}

/**
 * C5.4 (L6-m4): คำนำหน้าชื่อที่รู้จัก — แยกออกเป็น `titleTh` ก่อนตัดชื่อ/นามสกุล (เดิม "นาย สมชาย ใจดี" ⇒ firstName "นาย" ⇒
 * อีเมล/ลำดับติดตาม `{{contact.firstName}}` = "เรียนคุณนาย") · `name` ของ v1 ยังเก็บตามที่พิมพ์ทุกตัวอักษร (จอ v1 ไม่เปลี่ยน)
 * - มีช่องว่างตามหลัง: ทุกคำในรายการ (รวม "คุณ" "นาง" และภาษาอังกฤษ Mr/Mrs/Ms/Miss/Dr — ไม่สนตัวพิมพ์)
 * - ติดกับชื่อ ("นายสมชาย" "นางสาวสมหญิง" "น.ส.สมหญิง"): เฉพาะคำที่ไม่ใช่ต้นชื่อจริงของคนไทย และตัวถัดไปต้องเป็นพยัญชนะ/สระหน้า
 *   ("นาง"/"คุณ" ติดกันไม่แยก: นางนวล · คุณากร · คุณวุฒิ เป็นชื่อจริง) · เหลือชื่อว่าง = ไม่แยก
 */
const HONORIFIC_SPACED = ["นางสาว", "นาง", "นาย", "น.ส.", "ด.ช.", "ด.ญ.", "เด็กชาย", "เด็กหญิง", "คุณ", "ดร.", "นพ.", "พญ.", "ทพ.", "ทพญ.", "mr.", "mr", "mrs.", "mrs", "ms.", "ms", "miss", "dr.", "dr"];
const HONORIFIC_GLUED = ["เด็กหญิง", "เด็กชาย", "นางสาว", "ทพญ.", "น.ส.", "ด.ช.", "ด.ญ.", "นาย", "ดร.", "นพ.", "พญ.", "ทพ."];
export function splitHonorific(full: string): { title: string | null; rest: string } {
  const text = full.trim();
  const sp = text.indexOf(" ");
  if (sp > 0) {
    const head = text.slice(0, sp);
    const rest = text.slice(sp + 1).trim();
    if (rest && HONORIFIC_SPACED.includes(head.toLowerCase())) return { title: head, rest };
  }
  for (const t of HONORIFIC_GLUED) {
    if (!text.startsWith(t)) continue;
    const rest = text.slice(t.length).trim();
    if (rest && /^[\u0E01-\u0E2E\u0E40-\u0E44]/.test(rest)) return { title: t, rest };
  }
  return { title: null, rest: text };
}

/** C5.4 (L6-m7): เลขไทย ๐–๙ → 0–9 (ฟอร์ม/แชทที่พิมพ์ด้วยแป้นไทย) */
const arabicDigits = (v: string) => v.replace(/[\u0E50-\u0E59]/g, (d) => String(d.charCodeAt(0) - 0x0e50));
/** C5.4 (L6-m7): "02-123-4567 ต่อ 12" / "… ext. 12" / "… #12" → ส่วนเบอร์หลัก (ใช้จับคู่ได้) · ไม่มีเบอร์ต่อ = null */
const EXT_RE = /^(.*?\d)\s*(?:ต่อ|ext\.?|x|#)\s*\d{1,6}\s*$/i;

/**
 * ค่าที่ทางเข้า v1 ส่งให้ `createCore` (ใช้ร่วมกับสะพานฟอร์ม C1.8 — ฟอร์มสาธารณะต้องเข้า CRM ได้เสมอ ไม่ว่าจะพิมพ์เบอร์/อีเมลรูปแบบไหน)
 * ชื่อเต็มแยกที่ช่องว่างแรก · v1 ไม่เคยตรวจรูปแบบเบอร์/อีเมล · รีวิว C1.4 S7: ค่าที่รูปแบบผิด **ไม่ทิ้ง** — เก็บตามที่พิมพ์ไว้ในโน้ต
 * (ไม่ใช้จับคู่ Party/ตัวซ้ำ) ให้พนักงานแก้เอง
 */
function legacyCreateArgs(
  input: { name: string; phone?: string | null; email?: string | null; company?: string | null; source?: string | null },
  owner: string | null,
): { clean: CreateClean; legacy: NonNullable<CreateCoreOpts["legacy"]> } {
  const full = String(input?.name ?? "").trim().replace(/\s+/g, " ");
  // C5.4 (L6-m4): คำนำหน้า → titleTh ก่อนตัดชื่อ (ดู `splitHonorific`)
  const honor = splitHonorific(full);
  const given = honor.rest;
  const at = given.indexOf(" ");
  const firstName = (at < 0 ? given : given.slice(0, at)).slice(0, CONTACT_NAME_MAX);
  const lastName = at < 0 ? null : given.slice(at + 1).slice(0, CONTACT_NAME_MAX) || null;
  const rawPhone = str(input?.phone);
  const rawEmail = str(input?.email);
  // C5.4 (L6-m7 · มติรอบ 2): คอลัมน์ `phone` เก็บเฉพาะเบอร์ที่ถูกต้อง (หรือ null) · เลขไทยแปลงเป็นอารบิกก่อน (๐๘๑… = เบอร์ปกติ) ·
  //   มีเบอร์ต่อ = คอลัมน์ได้เบอร์หลัก · ข้อความที่กรอกจริงเมื่อไม่ผ่านตามรูป (รวมเบอร์ต่อ) เก็บในโน้ตหัว LEGACY_NOTE_PREFIX ซึ่งจอ v1
  //   อ่านกลับมาแสดง (`legacyTypedPhone`) ⇒ ผู้ใช้ v1 เห็นเบอร์ตามที่กรอกเหมือนเดิม
  const phoneIn = rawPhone ? arabicDigits(rawPhone).trim() : null;
  const valid = phoneIn && !contactPhoneProblem(phoneIn) ? storePhone(phoneIn) : null;
  const extBase = !valid && phoneIn ? (EXT_RE.exec(phoneIn)?.[1] ?? null) : null;
  const phone = valid ?? (extBase && !contactPhoneProblem(extBase) ? storePhone(extBase) : null);
  // C5.4 (L6-m7): ช่องอีเมลของฟอร์มที่ใส่มาหลายที่อยู่ ("a@x.com, b@y.com") — ใช้ที่อยู่แรกที่ถูกรูปแบบ (เดิมทิ้งทั้งช่องลงโน้ต)
  //   ข้อความเต็มยังเก็บในโน้ตเมื่อมีมากกว่าหนึ่งที่อยู่/รูปแบบไม่ตรง (ที่อยู่ที่เหลือไม่หาย)
  const emailWhole = rawEmail && !emailProblem(rawEmail) ? rawEmail.toLowerCase() : null;
  const email = emailWhole ?? (rawEmail ? (rawEmail.split(/[\s,;]+/).find((x) => x && !emailProblem(x))?.toLowerCase() ?? null) : null);
  const kept = [phoneIn && !valid ? `เบอร์: ${phoneIn.slice(0, 100)}` : null, rawEmail && !emailWhole ? `อีเมล: ${rawEmail.slice(0, 200)}` : null].filter(Boolean);
  const note = kept.length > 0 ? `${LEGACY_NOTE_PREFIX}${kept.join(" · ")}` : null;
  const legacySource = str(input?.source);
  const sourceKind: MemberSource = legacySource === "FORM" ? "WEB_FORM" : legacySource === "AI" ? "API" : "CRM";
  return {
    clean: {
      firstName: firstName || CONTACT_NAME_PLACEHOLDER,
      lastName,
      titleTh: honor.title ? honor.title.slice(0, 40) : null,
      phone,
      email,
      jobTitle: null,
      department: null,
      lineUserId: null,
      sourceKind,
      sourceChannel: null,
      sourceDetail: null,
      tags: [],
      ownerUserId: owner,
      companyId: null,
      locale: null, // CRM C2.3 ▸ ทางห่อ v1/สะพานไม่รู้ภาษา (คอลัมน์ใช้ค่าเริ่มต้นเดิม) — สะพานที่รู้ภาษาส่งผ่าน `BridgeLeadInput.locale` ◂
    },
    legacy: { company: str(input?.company)?.slice(0, CONTACT_TEXT_MAX) ?? null, source: legacySource, name: full || CONTACT_NAME_PLACEHOLDER, note },
  };
}

// ═════════════════════════ แก้ไข ═════════════════════════

const PATCH_KEYS = new Set(["firstName", "lastName", "titleTh", "phone", "email", "jobTitle", "department", "lineUserId", "companyId", "moveOpenDeals", "fields"]);

export async function updateContact(ctx: ContactsCtx, actor: MemberActor, id: string, patch: UpdateContactPatch): Promise<ContactDto> {
  return updateContactCore(ctx, actor, id, patch, false);
}

/**
 * CRM C1.11 ▸ (มติผู้คุมงาน C1.11 ข้อ 6 · รีวิว SF-4) `fillBlanksOnly` = นำเข้าแบบ "อัปเดตคนเดิม": เขียนเฉพาะช่องที่คนเดิมยังว่าง
 *   ตัดสินจากแถวที่อ่าน **หลังล็อกใน tx เดียวกับที่เขียน** (ฟิลด์ระบบ + ค่าฟิลด์กำหนดเองที่มีอยู่) — ไม่มีช่องว่างระหว่างอ่านกับเขียน ◂
 */
async function updateContactCore(ctx: ContactsCtx, actor: MemberActor, id: string, patch: UpdateContactPatch, fillBlanksOnly: boolean): Promise<ContactDto> {
  const a = await enter(ctx, actor);
  const raw = (isObj(patch) ? patch : {}) as Record<string, unknown>;
  for (const k of Object.keys(raw)) {
    if (!PATCH_KEYS.has(k)) throw fail("VALIDATION", PATCH_FORBIDDEN_MSG(k));
  }
  const current = await loadContact(ctx, a, id, prisma, { live: true });
  need(a, "crm.contact.update");
  const { merged, custom } = await splitFields(raw as UpdateContactPatch, raw.fields);
  // ── ตรวจทุกค่าก่อนแตะอะไร ──
  const data: Prisma.CrmContactUpdateInput = {};
  let nextFirst = merged.firstName !== undefined ? cleanName(merged.firstName, "ชื่อจริง", true) : undefined;
  let nextLast = merged.lastName !== undefined ? cleanName(merged.lastName, "นามสกุล", false) : undefined;
  let nextPhone = merged.phone !== undefined ? cleanPhone(merged.phone) : undefined;
  let nextEmail = merged.email !== undefined ? cleanEmail(merged.email) : undefined;
  const simple: [keyof UpdateContactPatch, string, number][] = [["titleTh", "คำนำหน้า", 40], ["jobTitle", "ตำแหน่ง", CONTACT_TEXT_MAX], ["department", "แผนก", CONTACT_TEXT_MAX], ["lineUserId", "LINE user id", 100]];
  const simpleVals: Record<string, string | null> = {};
  for (const [k, label, max] of simple) if (merged[k] !== undefined) simpleVals[k] = textOrNull(merged[k], label, max);
  let wantCompany = merged.companyId !== undefined ? str(merged.companyId) : undefined;
  // CRM C5.5-fix6 ▸ F3: บริษัทหลักเปลี่ยน (ผูก · ย้าย · ถอด) ได้เฉพาะคนที่ผูกบริษัทได้ (crmCanLinkCompany: อ่าน + แก้บริษัท — คีย์เดียวกับ
  //   ช่องเลือกในหน้า) — ตรวจ **ก่อนเขียนอะไร** (เดิม: ช่องอื่น commit + audit/event บอกว่า companyId เปลี่ยน แล้วขั้นบริษัทล้มทีหลัง) ·
  //   ค่าเดิมที่ส่งกลับมา (client ที่ส่ง DTO ที่อ่านไปคืน) ไม่ใช่การเปลี่ยน ⇒ คนที่ไม่มีสิทธิ์อ่านบริษัทไม่โดนปฏิเสธและบริษัทเดิมคงอยู่ ◂
  // CRM C5.5-fix7 ▸ F6-5: ค่าเดิมที่ส่งกลับมา **ไม่ใช่การเปลี่ยน สำหรับทุกคน** (เดิมยกเว้นเฉพาะคนที่ไม่มีสิทธิ์อ่านบริษัท ⇒ คนที่อ่านได้แต่
  //   มองไม่เห็นบริษัทปัจจุบันส่ง DTO คืน = VALIDATION ทั้งก้อน) · ตัดเป็น "ไม่ได้ส่ง" ตั้งแต่ตรงนี้ ⇒ ใน tx ไม่มีทางบันทึก companyId ว่าเปลี่ยน
  //   เพราะมีคนย้ายบริษัทระหว่างที่เราอ่าน `current` กับเปิด tx (เดิม audit/event บอกว่าเปลี่ยนทั้งที่ไม่มีลิงก์ไหนถูกแตะ) ◂
  if (wantCompany !== undefined && wantCompany === current.companyId) wantCompany = undefined;
  if (wantCompany !== undefined) {
    need(a, "crm.company.read");
    need(a, "crm.company.update");
    // CRM C5.5-fix6 r2 ▸ F6-2/F6-3: ถอด/ย้ายออกจากบริษัทปัจจุบัน = ต้องมองเห็นบริษัทปัจจุบัน — ตรวจก่อน tx (เดิม: ช่องอื่น commit แล้ว
    //   removeContact ล้ม NOT_FOUND · หรือย้ายผู้ติดต่อ+ดีลที่เปิดออกจากบริษัทที่มองไม่เห็นได้) · บริษัทปลายทางตรวจด้วย assertCompany ด้านล่างเหมือนเดิม ◂
    // CRM C5.5-fix7 ▸ R2F-1: มองไม่เห็น = ข้อความของตัวเอง (เดิม "ไม่พบบริษัทนี้ … รีเฟรชหน้า" ซึ่งรีเฟรชแล้วก็ไม่หาย) — ข้อความเดียวกันไม่ว่า
    //   บริษัทที่ซ่อนอยู่ยังใช้งาน/เก็บถาวร/ถูกรวม (การมองเห็นตัดสินก่อนสถานะ ⇒ ไม่มีช่องให้เดา) · ไม่มีชื่อ/รหัสบริษัทในข้อความ ◂
    // CRM C5.5-fix7 ▸ R2F-2: "ถอด" (ค่าว่าง) ต้องผ่าน removeContact ซึ่งแก้ลิงก์ของบริษัทที่เก็บถาวร/ถูกรวมไม่ได้ (กติกาของบริการบริษัท:
    //   กู้คืนก่อน) ⇒ ตรวจสถานะนั้น **ก่อน tx** ด้วย (เดิม: แถวผู้ติดต่อ + audit + event commit แล้วค่อยล้ม VALIDATION) · "ย้าย" ไปบริษัทอื่น
    //   ไม่แตะลิงก์เดิม (addContact ของบริษัทปลายทาง) ⇒ ย้ายออกจากบริษัทที่เก็บถาวรได้เหมือนเดิม ◂
    if (current.companyId) {
      await companies.assertCompanyVisible(coCtx(ctx), a, current.companyId, { live: wantCompany === null }).catch((e: unknown) => {
        const m = mapError(e);
        if (m instanceof ContactsError && m.code === "NOT_FOUND") throw fail("NOT_FOUND", CONTACT_PRIMARY_COMPANY_HIDDEN_MSG);
        throw m;
      });
    }
  }
  if (wantCompany) await assertCompany(ctx, a, wantCompany);
  await seedContactFields(ctx, a);

  let changedKeys: string[] = [];
  const before: Record<string, unknown> = {};
  const after: Record<string, unknown> = {};
  let row: CrmContact = current;
  try {
    row = await prisma.$transaction(async (tx) => {
      // ลำดับล็อก: engine → advisory ตัวตน (เบอร์/อีเมลใหม่) → แถวผู้ติดต่อ (ไม่มีแถวบริษัทใน tx นี้ — ย้ายบริษัทหลักทำผ่านบริการบริษัทหลัง commit)
      await (await engine()).lockRecordForFieldWrite(tx, current.id);
      const identKeys: string[] = [];
      if (nextPhone) identKeys.push(`crm:contact-ident:${ctx.systemId}:p:${party.normalizePartyPhone(nextPhone) || nextPhone}`);
      if (nextEmail) identKeys.push(`crm:contact-ident:${ctx.systemId}:e:${nextEmail.toLowerCase()}`);
      for (const k of identKeys.sort()) await lockKey(tx, k);
      await lockContactRows(tx, ctx, [current.id]);
      const pre = await tx.crmContact.findFirst({ where: { ...identityScope(ctx), id: current.id } });
      if (!pre) throw fail("NOT_FOUND", NOT_FOUND_MSG);
      if (pre.mergedIntoId) throw fail("VALIDATION", MERGED_MSG);
      if (pre.archivedAt) throw fail("VALIDATION", ARCHIVED_MSG);
      // CRM C1.11 ▸ fillBlanksOnly: ช่องที่คนเดิมมีค่าแล้ว = ไม่แตะ (ตัดสินจากแถวที่ล็อกอยู่) ◂
      if (fillBlanksOnly) {
        const has = (v: unknown) => v !== null && v !== undefined && String(v).trim() !== "";
        if (has(pre.firstName)) nextFirst = undefined;
        if (has(pre.lastName)) nextLast = undefined;
        if (has(pre.phone)) nextPhone = undefined;
        if (has(pre.email)) nextEmail = undefined;
        for (const k of Object.keys(simpleVals)) if (has((pre as Record<string, unknown>)[k])) delete simpleVals[k];
        const ck = Object.keys(custom);
        if (ck.length > 0) {
          const defs = await tx.memberField.findMany({ where: { tenantId: ctx.tenantId, systemId: ctx.systemId, objectKey: "contact", key: { in: ck } }, select: { id: true, key: true } });
          const filled = new Set((await tx.customRecordValue.findMany({ where: { tenantId: ctx.tenantId, recordType: "CONTACT", recordId: pre.id, fieldId: { in: defs.map((d) => d.id) } }, select: { fieldId: true } })).map((v) => v.fieldId));
          for (const d of defs) if (filled.has(d.id)) delete custom[d.key];
        }
      }
      const keys: string[] = [];
      const first = nextFirst !== undefined ? (nextFirst as string) : pre.firstName;
      const last = nextLast !== undefined ? nextLast : pre.lastName;
      if (nextFirst !== undefined && nextFirst !== pre.firstName) { data.firstName = nextFirst; keys.push("firstName"); }
      if (nextLast !== undefined && nextLast !== pre.lastName) { data.lastName = nextLast; keys.push("lastName"); }
      const nextName = joinName(first, last) || pre.name;
      const nameChanged = (keys.includes("firstName") || keys.includes("lastName")) && nextName !== pre.name;
      if (nameChanged) assertNotReservedName(nextName); // CRM C3.9 ▸ รีวิว S2 ◂
      if (nameChanged) data.name = nextName;
      const phoneChanged = nextPhone !== undefined && nextPhone !== pre.phone;
      const emailChangedPre = nextEmail !== undefined && (nextEmail ?? "").toLowerCase() !== (pre.email ?? "").toLowerCase();
      if ((phoneChanged && nextPhone) || (emailChangedPre && nextEmail)) {
        // AUDIT-CLASS X3: เบอร์/อีเมลใหม่ชนผู้ติดต่ออื่นของระบบนี้ = DUPLICATE (หลังล็อกตัวตน · ขอบเขตตัวตน ไม่ใช่การมองเห็น)
        const dup = await duplicateHits(tx, ctx, { phone: phoneChanged ? (nextPhone ?? null) : null, email: emailChangedPre ? (nextEmail ?? null) : null }, pre.id);
        if (dup.hits.length > 0) {
          throw fail("DUPLICATE", "เบอร์หรืออีเมลใหม่ตรงกับผู้ติดต่ออีกคนในระบบนี้อยู่แล้ว — ตรวจว่าเป็นคนเดียวกันไหม (รวมผู้ติดต่อได้จากเมนู …)", { duplicates: dup.hits });
        }
      }
      if (phoneChanged) { data.phone = nextPhone; keys.push("phone"); }
      const emailChanged = nextEmail !== undefined && (nextEmail ?? null) !== (pre.email ?? null);
      if (emailChanged) {
        data.email = nextEmail;
        keys.push("email");
        // R-A: อีเมลเก่าเก็บไว้ (C2.5 ใช้จับคู่อีเมลขาเข้า) · ไม่ซ้ำ · ไม่มีอีเมลปัจจุบันในรายการ · เก็บล่าสุด 20
        const prev = [...pre.previousEmails, ...(pre.email ? [pre.email] : [])].filter((x) => x && x.toLowerCase() !== (nextEmail ?? "").toLowerCase());
        data.previousEmails = [...new Set(prev)].slice(-20);
        // อีเมลใหม่ = สถานะ "เด้ง" ของอีเมลเก่าไม่เกี่ยวแล้ว
        if (pre.emailBouncedAt) data.emailBouncedAt = null;
      }
      for (const [k, v] of Object.entries(simpleVals)) {
        if (v !== (pre as Record<string, unknown>)[k]) {
          (data as Record<string, unknown>)[k] = v;
          keys.push(k);
        }
      }
      if (wantCompany !== undefined && wantCompany !== pre.companyId) keys.push("companyId");
      // Party ใน tx เดียวกัน — ผู้ถือคนเดียวเท่านั้นที่แก้ Party ได้ · ใช้ร่วม = ย้ายไป Party ของค่าใหม่ (รีวิว C1.4 S1)
      if (nameChanged || phoneChanged || emailChanged) {
        const np = await partyAfterChange(
          tx,
          ctx,
          pre.partyId,
          { excludeContactIds: [pre.id] },
          { name: nextName, phone: nextPhone !== undefined ? nextPhone : pre.phone, email: nextEmail !== undefined ? nextEmail : pre.email },
          { name: nameChanged, phone: phoneChanged, email: emailChanged },
        );
        if (np !== pre.partyId) data.partyId = np;
      }
      // CRM C3.9-fix ▸ H8 (ล่าความปลอดภัย M3): แถว audit ไม่เก็บค่าที่ระบุตัว (ชื่อ · นามสกุล · เบอร์ · อีเมล · LINE id · โน้ต) — เก็บแค่ว่า "เปลี่ยน"
      //   (เดิมปิดแค่เบอร์/อีเมล ⇒ ชื่อเก่า/ใหม่ค้างใน AuditLog หลังลบตาม PDPA) · คีย์ที่เปลี่ยนยังอยู่ครบใน changedKeys ◂
      for (const k of keys) {
        before[k] = AUDIT_IDENTITY_KEYS.has(k) ? AUDIT_CHANGED_MARK : (pre as Record<string, unknown>)[k];
        after[k] = AUDIT_IDENTITY_KEYS.has(k) ? AUDIT_CHANGED_MARK : (data as Record<string, unknown>)[k] ?? (k === "companyId" ? wantCompany : null);
      }
      let out = pre;
      if (Object.keys(data).length > 0) out = await tx.crmContact.update({ where: { id: pre.id }, data });
      // CRM C3.5 ▸ (มติผู้คุมงาน S4) ตัวตนที่ใช้เข้าพอร์ทัล (อีเมล · เบอร์ · LINE) เปลี่ยน ⇒ session พอร์ทัลของผู้ติดต่อนี้ตายทันที +
      //   ต้องเชิญใหม่ (ไม่มีคอลัมน์เก็บ "ตัวตนตอนเชิญ" บน CrmPortalAccess และใบนี้ไม่มี migration) — ใน tx เดียวกับการแก้ ◂
      if (keys.includes("phone") || keys.includes("email") || keys.includes("lineUserId")) await portalIdentityChangedInTx(tx, ctx.tenantId, [pre.id]);
      if (Object.keys(custom).length > 0) {
        const r = await (await engine()).setFieldValues(fctx(ctx, a), pre.id, custom, { via: "STAFF", byUserId: actorId(ctx) }, tx);
        keys.push(...r.changed.map((k) => `f.${k}`));
      }
      changedKeys = keys;
      if (keys.length > 0) await emitContactEvent(tx, ctx, "updated", pre.id, newSeq(), { contactId: pre.id, changedKeys: keys });
      return out;
    }, TX_OPTS);
  } catch (e) {
    throw mapError(e);
  }

  // รีวิว C1.4 S5: audit ของส่วนที่ commit แล้วเขียน **ก่อน** ขั้นบริษัท (ขั้นบริษัทล้ม ≠ ไม่มีร่องรอยของการแก้ที่สำเร็จไปแล้ว)
  if (changedKeys.length > 0) {
    await writeAudit({ tenantId: ctx.tenantId, actorId: actorId(ctx), action: "crm.contact.update", targetType: "CrmContact", targetId: current.id, before, after: { ...after, changedKeys } });
  }
  // ── บริษัทหลัก: ผ่านบริการบริษัท (tx ของมัน: แถวบริษัท → แถวผู้ติดต่อ) หลัง commit ของเรา — มี audit ของตัวเอง ──
  if (wantCompany !== undefined && wantCompany !== current.companyId) {
    if (wantCompany) {
      try {
        await companies.addContact(coCtx(ctx), a, wantCompany, { contactId: current.id, isPrimary: true });
      } catch (e) {
        throw mapError(e);
      }
    } else if (current.companyId) {
      await companies.removeContact(coCtx(ctx), a, current.companyId, current.id).catch((e: unknown) => {
        throw mapError(e);
      });
    }
    if (merged.moveOpenDeals === true && current.companyId && wantCompany) {
      const moved = await moveOpenDeals(ctx, current.id, current.companyId, wantCompany);
      if (moved > 0) {
        await writeAudit({ tenantId: ctx.tenantId, actorId: actorId(ctx), action: "crm.contact.move_open_deals", targetType: "CrmContact", targetId: current.id, after: { from: current.companyId, to: wantCompany, moved } });
      }
    }
  }
  const fresh = await prisma.crmContact.findFirst({ where: { ...identityScope(ctx), id: current.id } });
  return toDto(fresh ?? row);
}

/**
 * R-A: ผู้ติดต่อเปลี่ยนบริษัท → ดีลที่ยังเปิดของบริษัทเดิมย้ายตามไปด้วย (ผู้ใช้เลือก)
 * คำสั่งเดียว (updateMany มีเงื่อนไข) ถือแค่ล็อกแถวดีลชั่วขณะ — ไม่ถือแถวผู้ติดต่อ/บริษัท จึงไม่มีวงล็อกกับการรวมบริษัท (บริษัท → ดีล) ·
 * แคชของทั้งสองบริษัทคำนวณใหม่ผ่านบริการบริษัท (ล็อกแถวบริษัทเอง)
 */
async function moveOpenDeals(ctx: ContactsCtx, contactId: string, fromCompanyId: string, toCompanyId: string): Promise<number> {
  // CRM C1.5 ▸ ผู้เขียนคอลัมน์ดีลคือ `deals.ts` ที่เดียว (ล็อกบริษัท → ดีล · แคชทั้งสองบริษัทใน tx เดียว · event crm.deal.updated) ◂
  return deals.moveOpenDealsOfContact({ tenantId: ctx.tenantId, systemId: ctx.systemId, actorUserId: actorId(ctx) }, contactId, fromCompanyId, toCompanyId);
}

// ═════════════════════════ คำสั่งเดี่ยว (สถานะ · แท็ก · ความยินยอม · มอบหมาย · เก็บถาวร) ═════════════════════════

type Mutation = {
  data: Prisma.CrmContactUpdateInput;
  kind: "updated" | "assigned";
  payload: Record<string, unknown>;
  before?: unknown;
  after?: unknown;
  /** แถวความยินยอมที่ต้องเพิ่มใน tx เดียวกัน (setOptOut) */
  consentRow?: { granted: boolean; source: string };
};

/**
 * แก้ผู้ติดต่อ 1 คนแบบ "ล็อกแถว → อ่านใหม่ → ตัดสิน → เขียน → event" ใน tx เดียว
 * AUDIT-CLASS X3: ยิงพร้อมกันกี่ทางก็เรียงคิวที่แถว (FOR UPDATE) — คอลัมน์กับแถวประวัติไม่มีวันขัดกัน
 */
async function mutate(
  ctx: ContactsCtx,
  actor: MemberActor,
  id: string,
  action: string,
  decide: (pre: CrmContact) => Mutation | null,
  opts: { allowArchived?: boolean; reason?: string } = {},
): Promise<ContactDto> {
  const current = await loadContact(ctx, actor, id, prisma, { live: !opts.allowArchived });
  need(actor, action === "crm.contact.archive" || action === "crm.contact.restore" ? "crm.contact.delete" : "crm.contact.update");
  let audit: { before?: unknown; after?: unknown } | null = null;
  const row = await prisma.$transaction(async (tx) => {
    await lockContactRows(tx, ctx, [current.id]);
    const pre = await tx.crmContact.findFirst({ where: { ...identityScope(ctx), id: current.id } });
    if (!pre) throw fail("NOT_FOUND", NOT_FOUND_MSG);
    if (pre.mergedIntoId) throw fail("VALIDATION", MERGED_MSG);
    if (pre.archivedAt && !opts.allowArchived) throw fail("VALIDATION", ARCHIVED_MSG);
    const m = decide(pre);
    if (!m) return pre;
    // CRM C3.9 ▸ กู้คืน: ผู้ติดต่อที่ถูกลบตาม PDPA (ธง = แถว audit) กู้คืนไม่ได้ · กู้คืน = กลับมานับในเพดานผู้ติดต่อ (ล็อก + นับใน tx เดียว) ◂
    if (action === "crm.contact.restore") {
      if (await tx.auditLog.count({ where: { tenantId: ctx.tenantId, action: CRM_ERASE_AUDIT_ACTION, targetId: pre.id } })) {
        throw fail("VALIDATION", "ผู้ติดต่อนี้ถูกลบข้อมูลส่วนบุคคลตาม PDPA แล้ว จึงกู้คืนไม่ได้ — เพิ่มเป็นผู้ติดต่อใหม่ถ้าลูกค้ากลับมาติดต่อ");
      }
      await assertCrmLimit(ctx, "contacts", 1, tx);
    }
    const out = Object.keys(m.data).length > 0 ? await tx.crmContact.update({ where: { id: pre.id }, data: m.data }) : pre;
    if (m.consentRow) {
      // AUDIT-CLASS X8: การขอไม่รับข่าวสาร **เพิ่มแถวประวัติเสมอ** (append-only · เวลาหลังได้ล็อก ⇒ ลำดับตรงลำดับจริง)
      await tx.crmContactConsent.create({
        data: { tenantId: ctx.tenantId, systemId: pre.systemId, contactId: pre.id, channel: OPT_OUT_CHANNEL, granted: m.consentRow.granted, source: m.consentRow.source, createdById: actorId(ctx), createdAt: new Date() },
      });
    }
    await emitContactEvent(tx, ctx, m.kind, pre.id, newSeq(), m.payload);
    audit = { before: m.before, after: m.after };
    return out;
  }, TX_OPTS);
  if (audit) {
    const au = audit as { before?: unknown; after?: unknown };
    await writeAudit({ tenantId: ctx.tenantId, actorId: actorId(ctx), action, targetType: "CrmContact", targetId: current.id, before: au.before, after: opts.reason ? { ...(au.after as object), reason: opts.reason } : au.after });
  }
  return toDto(row);
}

export async function setLeadStatus(ctx: ContactsCtx, actor: MemberActor, id: string, status: string): Promise<ContactDto> {
  const a = await enter(ctx, actor);
  const s = String(status ?? "").trim().toUpperCase();
  if (!(LEAD_STATUSES as readonly string[]).includes(s)) throw fail("VALIDATION", `สถานะ lead ต้องเป็นหนึ่งใน ${Object.values(LEAD_STATUS_LABEL).join(" · ")}`);
  return mutate(ctx, a, id, "crm.contact.lead_status", (pre) =>
    pre.leadStatus === s ? null : { data: { leadStatus: s as CrmLeadStatus }, kind: "updated", payload: { contactId: pre.id, changedKeys: ["leadStatus"] }, before: { leadStatus: pre.leadStatus }, after: { leadStatus: s } },
  );
}

export async function setLifecycle(ctx: ContactsCtx, actor: MemberActor, id: string, stage: string): Promise<ContactDto> {
  const a = await enter(ctx, actor);
  const s = String(stage ?? "").trim().toUpperCase();
  if (!(LIFECYCLE_STAGES as readonly string[]).includes(s)) throw fail("VALIDATION", `ขั้นของผู้ติดต่อต้องเป็นหนึ่งใน ${Object.values(LIFECYCLE_LABEL).join(" · ")}`);
  // CRM C5.4-E ▸ L6-m5: ปิดดีลเป็น "ชนะ" ผิด ⇒ ผู้ติดต่อเป็น "ลูกค้า" ถาวร (ย้ายดีลกลับไม่ถอยให้ เพราะ "ลูกค้า" มีได้หลายที่มา: จ่ายเงิน ·
  //   ซื้อหน้าร้าน · แปลง lead) ⇒ ผู้จัดการ/เจ้าของร้าน **แก้ย้อน** ลูกค้า → มีโอกาส ได้ขั้นเดียว (audit บอกว่าเป็นการแก้ย้อน) ·
  //   ลูกค้า → ผู้สนใจ ยังไม่รับ (C1.4-S3.1) · พนักงานยังเดินหน้าทางเดียวตามเดิม ◂
  const manager = a.role === "OWNER" || a.role === "MANAGER";
  return mutate(ctx, a, id, "crm.contact.lifecycle", (pre) => {
    if (pre.lifecycleStage === s) return null;
    const correction = manager && pre.lifecycleStage === "CUSTOMER" && s === "PROSPECT";
    if (!correction && !canAdvanceLifecycle(pre.lifecycleStage, s as CrmLifecycleStage)) {
      const back = pre.lifecycleStage === "CUSTOMER" && (s === "PROSPECT" || s === "LEAD") ? " — ถ้าปิดดีลเป็นชนะโดยไม่ตั้งใจ ผู้จัดการหรือเจ้าของร้านแก้ย้อนเป็น \"มีโอกาส\" ได้" : "";
      throw fail("VALIDATION", `เปลี่ยนจาก "${LIFECYCLE_LABEL[pre.lifecycleStage as ContactLifecycle]}" เป็น "${LIFECYCLE_LABEL[s as ContactLifecycle]}" ไม่ได้ — ขั้นของผู้ติดต่อเดินหน้าได้ทางเดียว (เลิกเป็นลูกค้าได้เฉพาะคนที่เป็นลูกค้าแล้ว)${back}`);
    }
    return { data: { lifecycleStage: s as CrmLifecycleStage }, kind: "updated", payload: { contactId: pre.id, changedKeys: ["lifecycleStage"] }, before: { lifecycleStage: pre.lifecycleStage }, after: { lifecycleStage: s, ...(correction ? { correction: true } : {}) } };
  });
}

export async function setTags(ctx: ContactsCtx, actor: MemberActor, id: string, tags: string[]): Promise<ContactDto> {
  const a = await enter(ctx, actor);
  // AUDIT-CLASS X6: แท็กตัดช่องว่าง · ไม่ซ้ำ · ≤ CONTACT_TAGS_MAX ตัว · ตัวละ ≤ CONTACT_TAG_MAX — เกิน = ปฏิเสธ (ไม่ตัดเงียบ)
  const t = cleanTags(Array.isArray(tags) ? tags : []);
  if (t.problem) throw fail("VALIDATION", t.problem);
  return mutate(ctx, a, id, "crm.contact.tags", (pre) =>
    pre.tags.join("\u0000") === t.tags.join("\u0000") ? null : { data: { tags: t.tags }, kind: "updated", payload: { contactId: pre.id, changedKeys: ["tags"] }, before: { tags: pre.tags }, after: { tags: t.tags } },
  );
}

/**
 * ไม่รับข่าวสารการตลาด (เปิด/ปิด) — ทางเดียวที่แก้ `marketingOptOut` ได้ (updateContact ปฏิเสธ)
 * AUDIT-CLASS X8: ทุกครั้งเพิ่มแถว CrmContactConsent (ช่องทางเทียม MARKETING · granted = !optOut) ใน tx เดียวกับคอลัมน์
 */
export async function setOptOut(ctx: ContactsCtx, actor: MemberActor, id: string, input: { optOut: boolean; source?: string | null }): Promise<ContactDto> {
  const a = await enter(ctx, actor);
  // CRM C1.7 ▸ มองเห็น + คีย์ก่อนแตะฝั่งสมาชิก (การถอนความยินยอมของสมาชิกเกิดก่อน mutate) ◂
  await loadContact(ctx, a, id);
  need(a, "crm.contact.update");
  const optOut = input?.optOut === true;
  const source = String(input?.source ?? "STAFF").trim().toUpperCase() || "STAFF";
  if (!/^[A-Z_]{2,30}$/.test(source)) throw fail("VALIDATION", "ที่มาของการขอไม่รับข่าวสารไม่ถูกต้อง");
  // B1 (รีวิว C1.4 · C20 แหล่งเดียว): ผู้ติดต่อที่ผูกสมาชิก — ขอไม่รับ = ถอนความยินยอมทุกช่องทางการตลาดฝั่งสมาชิก (facade) **ก่อน**
  //   บันทึกคอลัมน์ฝั่ง CRM (คอลัมน์เป็นกระจก) · ถอนไม่ครบ = ไม่บันทึกอะไรฝั่ง CRM (ที่ถอนไปแล้วปลอดภัย — ถอนไม่เคยทำร้ายลูกค้า)
  //   ยกเลิกการขอไม่รับ = ไม่คืนความยินยอมให้สมาชิกเอง (ต้องขอใหม่รายช่องทาง)
  const current = await loadContact(ctx, a, id, prisma, { live: true });
  if (optOut && current.memberCustomerId && (await consents.memberSystemOf(ctx.tenantId, current.memberCustomerId))) {
    const r = await consents.revokeOnMember(ctx, a, current.memberCustomerId, consentChannels().map((c) => c.key));
    if (r.failed.length > 0) {
      throw fail("CONFLICT", "ถอนความยินยอมในระบบสมาชิกได้ไม่ครบทุกช่องทาง ระบบจึงยังไม่บันทึกการขอไม่รับ — ลองใหม่อีกครั้ง (ช่องทางที่ถอนแล้วยังถอนอยู่)");
    }
  }
  return mutate(ctx, a, id, "crm.contact.opt_out", (pre) => {
    // AUDIT-CLASS X3: ผูกสมาชิกระหว่างทาง (แปลงพร้อมกัน) ⇒ ยังไม่ได้ถอนฝั่งสมาชิก — ไม่บันทึก ให้ลองใหม่ (รอบใหม่จะถอนฝั่งสมาชิกก่อน)
    if (optOut && pre.memberCustomerId && pre.memberCustomerId !== current.memberCustomerId) {
      throw fail("CONFLICT", "ผู้ติดต่อนี้เพิ่งถูกผูกกับสมาชิกระหว่างบันทึก — รีเฟรชหน้าแล้วกดขอไม่รับข่าวสารอีกครั้ง");
    }
    return {
    data: pre.marketingOptOut === optOut ? {} : { marketingOptOut: optOut },
    kind: "updated",
    payload: { contactId: pre.id, changedKeys: ["marketingOptOut"] },
    before: { marketingOptOut: pre.marketingOptOut },
    after: { marketingOptOut: optOut, source },
    consentRow: { granted: !optOut, source },
    };
  });
}

/**
 * CRM C5.4-B ▸ L5-M4 (พิมพ์เขียว §11.4 · `trackingOptOut`): ลูกค้าขอ "ไม่ให้ติดตาม" — ไม่ใส่ pixel เปิดอ่าน · ไม่ห่อลิงก์ · ไม่ผูกการเข้าเว็บ
 * (ยังรับอีเมลได้ตามความยินยอมเดิม) — ทางเดียวที่แก้ธงนี้จากพนักงาน/REST (updateContact ปฏิเสธ) · audit `crm.contact.tracking_opt_out`
 * + event `crm.contact.updated` ใน tx เดียวกับคอลัมน์ · ลูกค้ากดเองจากหน้า /u/<token> ใช้ `markTrackingOptOutInTx`
 */
export async function setTrackingOptOut(
  ctx: ContactsCtx,
  actor: MemberActor,
  id: string,
  input: { optOut: boolean; source?: string | null } | boolean,
): Promise<ContactDto> {
  const a = await enter(ctx, actor);
  await loadContact(ctx, a, id);
  need(a, "crm.contact.update");
  const optOut = typeof input === "boolean" ? input : input?.optOut === true;
  const source = (typeof input === "object" && input ? String(input.source ?? "STAFF") : "STAFF").trim().toUpperCase() || "STAFF";
  if (!/^[A-Z_]{2,30}$/.test(source)) throw fail("VALIDATION", "ที่มาของการขอไม่ให้ติดตามไม่ถูกต้อง");
  return mutate(ctx, a, id, "crm.contact.tracking_opt_out", (pre) =>
    pre.trackingOptOut === optOut
      ? null
      : {
          data: { trackingOptOut: optOut },
          kind: "updated",
          payload: { contactId: pre.id, changedKeys: ["trackingOptOut"] },
          before: { trackingOptOut: pre.trackingOptOut },
          after: { trackingOptOut: optOut, source },
        },
  );
}

export async function assignContact(ctx: ContactsCtx, actor: MemberActor, id: string, input: { userId: string | null }): Promise<ContactDto> {
  const a = await enter(ctx, actor);
  // CRM C1.10 ▸ ผู้ติดต่อก่อน (การมองเห็น · มองไม่เห็น = NOT_FOUND) แล้วค่อยตรวจผู้ดูแลปลายทาง — ไม่บอกผลตรวจผู้ใช้กับระเบียนนอกขอบเขต ◂
  await loadContact(ctx, a, id);
  const userId = str(input?.userId);
  if (userId) await assertMember(ctx, userId);
  return mutate(ctx, a, id, "crm.contact.assign", (pre) =>
    pre.ownerUserId === userId
      ? null
      : {
          data: { ownerUserId: userId, assignedAt: userId ? new Date() : null, assignedBy: userId ? `USER:${actorId(ctx) ?? a.userId}` : null },
          kind: "assigned",
          payload: { contactId: pre.id, ownerUserId: userId, previousOwnerUserId: pre.ownerUserId },
          before: { ownerUserId: pre.ownerUserId },
          after: { ownerUserId: userId },
        },
  );
}

/** AUDIT-CLASS X9: โอนเป็นกลุ่ม = ยืนยัน + เหตุผล · ≤ CONTACT_BULK_MAX · id ทุกตัวต้องเป็นของระบบนี้ (ไม่งั้นไม่เขียนสักแถว) · audit เก็บเหตุผล */
export async function bulkAssign(
  ctx: ContactsCtx,
  actor: MemberActor,
  input: { ids: string[]; userId: string | null; confirm?: boolean | null; reason?: string | null },
): Promise<{ updated: number; ids: string[] }> {
  const reason = reasonOf(input, "โอนผู้ติดต่อเป็นกลุ่ม");
  const a = await enter(ctx, actor);
  need(a, "crm.contact.update");
  const ids = [...new Set((Array.isArray(input?.ids) ? input.ids : []).map((x) => String(x ?? "").trim()).filter(Boolean))];
  if (ids.length === 0) throw fail("VALIDATION", "เลือกผู้ติดต่ออย่างน้อย 1 คนก่อนโอน");
  if (ids.length > CONTACT_BULK_MAX) throw fail("VALIDATION", `โอนได้ครั้งละไม่เกิน ${CONTACT_BULK_MAX.toLocaleString("th-TH")} คน — แบ่งเป็นหลายรอบ`);
  const userId = str(input?.userId);
  if (userId) await assertMember(ctx, userId);
  const visible = await prisma.crmContact.findMany({ where: { AND: [await contactWhere(ctx, a), { id: { in: ids }, mergedIntoId: null }] }, select: { id: true } });
  if (visible.length !== ids.length) throw fail("NOT_FOUND", "มีผู้ติดต่อบางคนในรายการที่ไม่พบในระบบ CRM นี้ (อาจถูกลบหรือรวมไปแล้ว) — รีเฟรชหน้าแล้วเลือกใหม่");
  const changed: string[] = [];
  const batchId = randomUUID(); // CRM C5.4-E r2 ▸ SF-3: โอนเป็นกลุ่ม = แจ้งผู้ดูแลใหม่ 1 ใบต่อชุด (ไม่ใช่ทีละคน) ◂
  await prisma.$transaction(async (tx) => {
    await lockContactRows(tx, ctx, ids);
    const rows = await tx.crmContact.findMany({ where: { ...identityScope(ctx), id: { in: ids } }, select: { id: true, ownerUserId: true, mergedIntoId: true } });
    const now = new Date();
    for (const r of rows) {
      if (r.mergedIntoId || r.ownerUserId === userId) continue;
      await tx.crmContact.update({ where: { id: r.id }, data: { ownerUserId: userId, assignedAt: userId ? now : null, assignedBy: userId ? `USER:${actorId(ctx) ?? a.userId}` : null } });
      await emitContactEvent(tx, ctx, "assigned", r.id, newSeq(), { contactId: r.id, ownerUserId: userId, previousOwnerUserId: r.ownerUserId, batchId });
      changed.push(r.id);
    }
  }, { maxWait: 15_000, timeout: 120_000 });
  await writeAudit({ tenantId: ctx.tenantId, actorId: actorId(ctx), action: "crm.contact.bulk_assign", targetType: "CrmContact", targetId: ctx.systemId, after: { reason, ownerUserId: userId, requested: ids.length, updated: changed.length, ids: changed } });
  if (userId && changed.length > 0) {
    await (await import("./notify-senders")).leadsAssignedBatch(ctx, { batchId, actorUserId: actorId(ctx) ?? a.userId, owners: new Map([[userId, changed.length]]) }).catch(() => undefined);
  }
  return { updated: changed.length, ids: changed };
}

/** AUDIT-CLASS X9: เก็บถาวร = ยืนยัน + เหตุผล · แถวคงอยู่ (ซ่อนจากรายการ · includeArchived เห็น) */
export async function archiveContact(ctx: ContactsCtx, actor: MemberActor, id: string, opts: DangerOpts): Promise<ContactDto> {
  const reason = reasonOf(opts, "เก็บถาวรผู้ติดต่อ");
  const a = await enter(ctx, actor);
  return mutate(
    ctx,
    a,
    id,
    "crm.contact.archive",
    (pre) => (pre.archivedAt ? null : { data: { archivedAt: new Date() }, kind: "updated", payload: { contactId: pre.id, changedKeys: ["archivedAt"] }, before: { archivedAt: null }, after: { archived: true } }),
    { allowArchived: true, reason },
  );
}
export const archive = archiveContact;

export async function restoreContact(ctx: ContactsCtx, actor: MemberActor, id: string, opts: DangerOpts): Promise<ContactDto> {
  const reason = reasonOf(opts, "กู้คืนผู้ติดต่อ");
  const a = await enter(ctx, actor);
  return mutate(
    ctx,
    a,
    id,
    "crm.contact.restore",
    (pre) => (!pre.archivedAt ? null : { data: { archivedAt: null }, kind: "updated", payload: { contactId: pre.id, changedKeys: ["archivedAt"] }, before: { archived: true }, after: { archived: false } }),
    { allowArchived: true, reason },
  );
}

// ═════════════════════════ 360 ═════════════════════════

// CRM C5.5-fix7 ▸ RV-3: DATETIME = ขณะจริง (เก็บเป็น UTC) — หน้า 360 แสดงวันเวลาไทยแบบเดียวกับหน้าระเบียนของพนักงาน (formatThaiDateTimeFull ·
//   lib/ui/date) · ไฟล์ส่งออก (`mode: "export"`) เป็นข้อมูล ⇒ ISO เวลาไทยที่บอกเขตเวลาเอง (thaiIsoDateTime) ซึ่งนำเข้ากลับได้ขณะเดิม ·
//   เดิมทั้งสองทางตัดสตริง UTC "2026-10-08 17:30" (ไม่บอกเขตเวลา · นำเข้าบนเครื่องเวลาไทยเพี้ยน 7 ชม.) · DATE ไม่เปลี่ยน ◂
function displayOf(type: string, value: unknown, choices: { value: string; label: string }[] | undefined, mode: "page" | "export" = "page"): string {
  if (value === null || value === undefined || value === "") return "";
  if (Array.isArray(value)) return value.map((v) => choices?.find((c) => c.value === v)?.label ?? String(v)).join(", ");
  if (typeof value === "boolean") return value ? "ใช่" : "ไม่ใช่";
  if (type === "SELECT") return choices?.find((c) => c.value === value)?.label ?? String(value);
  if (type === "MONEY" && typeof value === "number") return `฿${(value / 100).toLocaleString("th-TH", { maximumFractionDigits: 2 })}`;
  if (type === "DATETIME" && typeof value === "string") return mode === "export" ? thaiIsoDateTime(value) : formatThaiDateTimeFull(value);
  if (type === "DATE" && typeof value === "string") return value.slice(0, 10);
  return String(value);
}

/** CRM C5.1-fix ▸ F4: กิจกรรม 2 กิ่ง (แต่ละกิ่งใช้ดัชนีของตัวเอง) รวมกันแบบไม่ซ้ำ เรียงใหม่ล่าสุดก่อน — ผลเท่า `OR` ของสองกิ่ง ◂ */
async function unionActivities(vis: Prisma.CrmActivityWhereInput, a: Prisma.CrmActivityWhereInput, b: Prisma.CrmActivityWhereInput, take: number) {
  const orderBy: Prisma.CrmActivityOrderByWithRelationInput[] = [{ createdAt: "desc" }, { id: "desc" }];
  const [x, y] = await Promise.all([
    prisma.crmActivity.findMany({ where: { AND: [vis, a] }, orderBy, take }),
    prisma.crmActivity.findMany({ where: { AND: [vis, b] }, orderBy, take }),
  ]);
  const seen = new Set<string>();
  return [...x, ...y]
    .filter((r) => (seen.has(r.id) ? false : (seen.add(r.id), true)))
    .sort((p, q) => q.createdAt.getTime() - p.createdAt.getTime() || (q.id < p.id ? -1 : q.id > p.id ? 1 : 0))
    .slice(0, take);
}

/**
 * CRM C5.5-fix7 ▸ R2F-1: บริษัทหลักปัจจุบันของผู้ติดต่อ (`contact.companyId`) อยู่นอกการมองเห็นของ actor ไหม — ด่านเดียวกับที่ updateContact ใช้
 *   ปฏิเสธการย้าย/ถอด (assertCompanyVisible · ไม่บังคับ live) ⇒ หน้า 360 ซ่อนช่องเลือกบริษัทที่กดอะไรก็ถูกปฏิเสธ · อ่านไม่สำเร็จ = ถือว่ามองไม่เห็น
 *   (ซ่อนช่องไว้ก่อน — บริการยังเป็นผู้ตัดสินจริง) · ไม่มีบริษัท = false ◂
 */
export async function isCurrentCompanyHidden(ctx: ContactsCtx, actor: MemberActor, companyId: string | null | undefined): Promise<boolean> {
  const id = str(companyId);
  if (!id) return false;
  return companies.assertCompanyVisible(coCtx(ctx), actor, id).then(
    () => false,
    () => true,
  );
}

export async function getContact360(ctx: ContactsCtx, actor: MemberActor, id: string): Promise<Contact360> {
  return crmScope(() => getContact360In(ctx, actor, id));
}

async function getContact360In(ctx: ContactsCtx, actor: MemberActor, id: string): Promise<Contact360> {
  const a = await enter(ctx, actor);
  const row = await loadContact(ctx, a, id);
  const eng = await engine();
  // R-A: ลิงก์/ดีล/กิจกรรมผ่านตัวช่วยของ where.ts — C1.7 เปลี่ยนการมองเห็นที่ไฟล์เดียว
  const [links, deals, activities, owner, layout, values, consent, objectTabs] = await Promise.all([
    prisma.crmCompanyContact.findMany({
      where: { contactId: row.id, tenantId: ctx.tenantId },
      orderBy: [{ endedAt: { sort: "asc", nulls: "first" } }, { isPrimary: "desc" }, { createdAt: "desc" }],
      take: 50,
    }),
    prisma.crmDeal.findMany({
      where: { AND: [await dealWhere(ctx, a), { contactId: row.id }] },
      include: { stage: { select: { name: true } }, pipeline: { select: { name: true } } },
      orderBy: [{ createdAt: "desc" }],
      take: 100,
    }),
    // CRM C5.1-fix ▸ F4: เดิม OR(contactId, deal.contactId) = LEFT JOIN + OR ⇒ สแกนกิจกรรมทั้งร้าน (โตตามทั้งร้าน ไม่ใช่ตามคนนี้) ·
    //   ใหม่ = สองกิ่งที่ใช้ดัชนีได้ (contactId · ดีลของคนนี้) วิ่งพร้อมกัน แล้วรวม/ตัดซ้ำ/เรียง (createdAt desc, id desc) เหลือ 50 ◂
    unionActivities(await activityWhere(ctx, a), { contactId: row.id }, { deal: { contactId: row.id } }, 50),
    row.ownerUserId ? prisma.membership.findFirst({ where: { tenantId: ctx.tenantId, userId: row.ownerUserId }, select: { user: { select: { id: true, name: true } } } }) : Promise.resolve(null),
    eng.listLayout(fctx(ctx, a)),
    // AUDIT-CLASS X8: ค่าอ่อนไหวผ่าน engine เท่านั้น (D8 ตัดสิน · เห็นจริง = แถว MemberAccessLog page "crm.contact")
    eng.getFieldValues(fctx(ctx, a), [row.id]),
    consents.current(ctx, a, row.id),
    objects.tabsFor(coCtx(ctx), a, "CONTACT", row.id).catch(() => []),
  ]);
  const bag = values[row.id] ?? {};
  const sections: Contact360Section[] = layout.sections.map((s) => ({
    key: s.key,
    label: s.label,
    sensitive: s.sensitive,
    isSystem: s.isSystem,
    fields: s.fields.map((f) => {
      const value = bag[f.key] ?? null;
      const hidden = (s.sensitive || f.sensitive) && !(f.key in bag);
      return { key: f.key, label: f.label, type: f.type, value: hidden ? null : value, display: hidden ? "" : displayOf(f.type, value, f.options?.choices), hidden };
    }),
  }));

  let member: Contact360["member"] = null;
  if (row.memberCustomerId) {
    const sys = await consents.memberSystemOf(ctx.tenantId, row.memberCustomerId);
    member = { customerId: row.memberCustomerId, systemId: sys?.systemId ?? null, memberCode: sys?.memberCode ?? null, name: sys?.name ?? null, tierName: null, phoneMasked: null };
    if (sys) {
      const briefs = await (await memberFacade()).briefFor({ tenantId: ctx.tenantId, systemId: sys.systemId, actorUserId: actorId(ctx) }, a, [row.memberCustomerId]).catch(() => []);
      const b = briefs[0];
      if (b) member = { ...member, tierName: b.tier?.name ?? null, phoneMasked: b.phoneMasked };
    }
  }
  // ชื่อบริษัทผ่านบริการบริษัท (companyWhere · ยังใช้งาน) — ลิงก์ไปบริษัทที่ถูกรวม/เก็บถาวร/มองไม่เห็น ไม่แสดง
  const coRefs = new Map((await companies.liveCompanyRefs(coCtx(ctx), a, links.map((l) => l.companyId))).map((c) => [c.id, c.name]));
  const companiesOut: Contact360Company[] = links
    .filter((l) => coRefs.has(l.companyId))
    .map((l) => ({ id: l.companyId, name: coRefs.get(l.companyId) ?? "", role: l.role, jobTitle: l.jobTitle, isPrimary: l.isPrimary, current: !l.endedAt }));
  const primary = (row.companyId ? companiesOut.find((c) => c.id === row.companyId && c.current) : null) ?? companiesOut.find((c) => c.current) ?? null;
  // CRM C5.5 ▸ (fix3b r2 · รีวิว RV-1) การ์ด "🕒 ไทม์ไลน์" ขึ้นป้าย "ไม่ยืนยันผู้ส่ง" แบบเดียวกับบล็อกกิจกรรม (คิวรีเดียวต่อหน้า · ร้าน+ระบบเดียวกัน) ◂
  const unverified = await unverifiedEmailRefs(ctx, activities);
  const timeline: Contact360TimelineItem[] = activities.map((t) => ({
    id: t.id,
    at: t.startAt ?? t.doneAt ?? t.createdAt,
    type: t.type,
    title: t.title,
    source: t.source,
    done: !!t.doneAt,
    ...(unverified.has(t.id) ? { unverifiedFrom: true as const } : {}),
  }));
  timeline.sort((x, y) => y.at.getTime() - x.at.getTime());
  return {
    contact: toDto(row),
    owner: owner?.user ? { id: owner.user.id, name: owner.user.name ?? "ผู้ใช้" } : null,
    member,
    company: primary,
    companies: companiesOut,
    deals: deals.map((d) => ({ id: d.id, title: d.title, stageName: d.stage?.name ?? "", kind: d.kind, valueSatang: d.valueSatang, expectedCloseAt: d.expectedCloseAt, pipelineName: d.pipeline?.name ?? "" })),
    fields: { sections },
    timeline,
    consent,
    objectTabs: objectTabs.map((t) => ({ objectKey: t.objectKey, label: t.label, labelPlural: t.labelPlural, count: t.count })),
    previousEmails: row.previousEmails,
    sourceDetail: isObj(row.sourceDetail) ? row.sourceDetail : null,
  };
}

// ═════════════════════════ รายการ ═════════════════════════

const SORTS: Record<ContactSort, Prisma.CrmContactOrderByWithRelationInput[]> = {
  "-createdAt": [{ createdAt: "desc" }, { id: "desc" }],
  createdAt: [{ createdAt: "asc" }, { id: "asc" }],
  name: [{ name: "asc" }, { id: "asc" }],
  "-lastActivityAt": [{ lastActivityAt: { sort: "desc", nulls: "last" } }, { id: "desc" }],
  "-score": [{ score: "desc" }, { id: "desc" }],
};

function enumOrNull<T extends string>(v: unknown, list: readonly T[], label: string): T | null {
  const s = str(v)?.toUpperCase() ?? null;
  if (!s) return null;
  if (!(list as readonly string[]).includes(s)) throw fail("VALIDATION", `ตัวกรอง${label} "${s.slice(0, 30)}" ไม่อยู่ในรายการ`);
  return s as T;
}

/** ตัวกรองฟิลด์ `f.<key>` ที่มีค่า (ค่าว่างไม่นับ) */
function listFieldFilters(flt: ContactListInput): Record<string, string> {
  return isObj(flt.f) ? (Object.fromEntries(Object.entries(flt.f).filter(([, v]) => v !== undefined && v !== null && String(v) !== "").map(([k, v]) => [k, String(v)])) as Record<string, string>) : {};
}

/** ตัวกรองที่ใช้จริง = มุมมองที่บันทึก (ถ้ามี) ทับด้วยตัวกรองที่ส่งมา — ใช้ร่วมกันทั้ง where ของ Prisma และ SQL (C5.1-fix) */
async function effectiveListInput(ctx: ContactsCtx, actor: MemberActor, input: ContactListInput): Promise<ContactListInput> {
  let flt: ContactListInput = { ...(input ?? {}) };
  const viewId = str(input?.savedViewId);
  if (viewId) {
    // มุมมองบันทึก (MemberSavedView objectKey "contact") ของระบบนี้ · ของคนอื่นที่ไม่ได้แชร์/ระบบอื่น = ไม่พบ (ไม่ใช่ "ไม่กรอง")
    // CRM C3.2 ▸ AUDIT-CLASS X1: กติกาการมองเห็นของมุมมองอยู่ที่ `views.ts` ที่เดียว — TEAM = เจ้าของ + สมาชิกปัจจุบันของทีมนั้น
    //   (แถว TEAM เดิมที่ไม่มี teamId = ทั้งร้าน) · ตัวกรองที่ได้ผ่าน whitelist ของ objectKey แล้ว ◂
    const vfRaw = await resolveViewFilters(ctx, actor, "contact", viewId);
    if (!vfRaw) throw fail("NOT_FOUND", "ไม่พบมุมมองที่บันทึกไว้นี้ในระบบ CRM นี้ — เลือกมุมมองใหม่");
    const vf = vfRaw as ContactListInput;
    const explicit = Object.fromEntries(Object.entries(input ?? {}).filter(([, v]) => v !== undefined && v !== null && v !== ""));
    flt = { ...vf, ...explicit, f: { ...(isObj(vf.f) ? (vf.f as Record<string, string>) : {}), ...(isObj(input?.f) ? input.f : {}) } };
  }
  return flt;
}

async function listWhere(ctx: ContactsCtx, actor: MemberActor, input: ContactListInput): Promise<Prisma.CrmContactWhereInput> {
  return listWhereFrom(ctx, actor, await effectiveListInput(ctx, actor, input));
}

async function listWhereFrom(ctx: ContactsCtx, actor: MemberActor, flt: ContactListInput): Promise<Prisma.CrmContactWhereInput> {
  // AUDIT-CLASS X1: ขอบเขตผ่าน contactWhere เสมอ · ผู้ติดต่อที่ถูกรวมไม่โผล่ (แถวคงอยู่เป็นประวัติ)
  const AND: Prisma.CrmContactWhereInput[] = [await contactWhere(ctx, actor), { mergedIntoId: null }];
  if (!flt.includeArchived) AND.push({ archivedAt: null });
  const q = str(flt.q)?.slice(0, 100);
  if (q) {
    const digits = q.replace(/\D/g, "");
    // CRM C5.4-E ▸ L6-m3: ชื่อค้นทุกรูปของสระอำ (ชื่อเก่าที่เก็บ ํ + า ก็เจอ) ◂
    const OR: Prisma.CrmContactWhereInput[] = [
      ...thaiSearchVariants(q).flatMap((v): Prisma.CrmContactWhereInput[] => [
        { name: { contains: v, mode: "insensitive" } },
        { firstName: { contains: v, mode: "insensitive" } },
        { lastName: { contains: v, mode: "insensitive" } },
      ]),
      { email: { contains: q.toLowerCase(), mode: "insensitive" } },
    ];
    if (digits.length >= 3) {
      OR.push({ phone: { contains: digits } });
      const norm = party.normalizePartyPhone(digits);
      if (norm && norm !== digits) OR.push({ phone: { contains: norm } });
      OR.push({ phone: { contains: q } });
    }
    AND.push({ OR });
  }
  const stage = enumOrNull(flt.stage, LIFECYCLE_STAGES, "ขั้น");
  if (stage) AND.push({ lifecycleStage: stage });
  const lead = enumOrNull(flt.leadStatus, LEAD_STATUSES, "สถานะ lead");
  if (lead) AND.push({ leadStatus: lead });
  const band = enumOrNull(flt.scoreBand, SCORE_BANDS, "ระดับคะแนน");
  if (band) AND.push({ scoreBand: band as CrmScoreBand });
  // CRM C3.2 ▸ (รีวิว N9) คะแนนขั้นต่ำ — จำนวนเต็ม 0–1,000,000 · ค่าอื่น = VALIDATION ◂
  if (flt.minScore !== undefined && flt.minScore !== null) {
    const ms = Number(flt.minScore);
    if (!Number.isInteger(ms) || ms < 0 || ms > 1_000_000) throw fail("VALIDATION", "คะแนนขั้นต่ำต้องเป็นจำนวนเต็มตั้งแต่ 0 ขึ้นไป");
    AND.push({ score: { gte: ms } });
  }
  const source = enumOrNull(flt.source, CONTACT_SOURCES, "ที่มา");
  if (source) AND.push({ sourceKind: source as MemberSource });
  const owner = str(flt.owner);
  if (owner) AND.push(owner === "none" ? { ownerUserId: null } : { ownerUserId: owner });
  const team = str(flt.team);
  if (team) AND.push({ teamId: team });
  const companyId = str(flt.companyId);
  if (companyId) AND.push({ OR: [{ companyId }, { companyLinks: { some: { companyId, endedAt: null } } }] });
  const filters = listFieldFilters(flt);
  if (Object.keys(filters).length > 0) {
    // ตัวกรอง f.{key} = engine ตัวเดียว (objectKey "contact") · key ที่ไม่มี/กรองไม่ได้/อ่อนไหวไม่มีสิทธิ์ = VALIDATION
    try {
      AND.push((await (await engine()).fieldFilterWhere(fctx(ctx, actor), filters)) as Prisma.CrmContactWhereInput);
    } catch (e) {
      throw mapError(e);
    }
  }
  return { AND };
}

// CRM C5.1-fix ▸ F1: where เดียวกับ listWhere ในรูป SQL ของแถว alias (ตัวกรองฟิลด์ = EXISTS ในฐานข้อมูล — ไม่มีรายการ id) ·
//   ใช้เมื่อมีตัวกรองฟิลด์ (`f.<key>`) เท่านั้น — ไม่มีตัวกรองฟิลด์ = ทาง Prisma เดิมทุกตัวอักษร · เทียบผล: qc-crm-c51fix-equiv ◂
async function listSqlWhere(ctx: ContactsCtx, actor: MemberActor, flt: ContactListInput, c = "c"): Promise<Prisma.Sql> {
  const A = Prisma.raw(c);
  const AND: Prisma.Sql[] = [await visibleContactSql(ctx, actor, c), Prisma.sql`${A}."mergedIntoId" IS NULL`];
  if (!flt.includeArchived) AND.push(Prisma.sql`${A}."archivedAt" IS NULL`);
  const q = str(flt.q)?.slice(0, 100);
  if (q) {
    const digits = q.replace(/\D/g, "");
    const OR: Prisma.Sql[] = [
      ...thaiSearchVariants(q).flatMap((v) => [containsSql(c, "name", v, true), containsSql(c, "firstName", v, true), containsSql(c, "lastName", v, true)]), // CRM C5.4-E ▸ L6-m3 ◂
      containsSql(c, "email", q.toLowerCase(), true),
    ];
    if (digits.length >= 3) {
      OR.push(containsSql(c, "phone", digits, false));
      const norm = party.normalizePartyPhone(digits);
      if (norm && norm !== digits) OR.push(containsSql(c, "phone", norm, false));
      OR.push(containsSql(c, "phone", q, false));
    }
    AND.push(orSql(OR));
  }
  const stage = enumOrNull(flt.stage, LIFECYCLE_STAGES, "ขั้น");
  if (stage) AND.push(enumEqSql(c, "lifecycleStage", "CrmLifecycleStage", stage));
  const lead = enumOrNull(flt.leadStatus, LEAD_STATUSES, "สถานะ lead");
  if (lead) AND.push(enumEqSql(c, "leadStatus", "CrmLeadStatus", lead));
  const band = enumOrNull(flt.scoreBand, SCORE_BANDS, "ระดับคะแนน");
  if (band) AND.push(enumEqSql(c, "scoreBand", "CrmScoreBand", band));
  if (flt.minScore !== undefined && flt.minScore !== null) {
    const ms = Number(flt.minScore);
    if (!Number.isInteger(ms) || ms < 0 || ms > 1_000_000) throw fail("VALIDATION", "คะแนนขั้นต่ำต้องเป็นจำนวนเต็มตั้งแต่ 0 ขึ้นไป");
    AND.push(Prisma.sql`${A}."score" >= ${ms}`);
  }
  const source = enumOrNull(flt.source, CONTACT_SOURCES, "ที่มา");
  if (source) AND.push(enumEqSql(c, "sourceKind", "MemberSource", source));
  const owner = str(flt.owner);
  if (owner) AND.push(owner === "none" ? Prisma.sql`${A}."ownerUserId" IS NULL` : Prisma.sql`${A}."ownerUserId" = ${owner}`);
  const team = str(flt.team);
  if (team) AND.push(Prisma.sql`${A}."teamId" = ${team}`);
  const companyId = str(flt.companyId);
  if (companyId) {
    AND.push(Prisma.sql`(${A}."companyId" = ${companyId} OR EXISTS (SELECT 1 FROM "CrmCompanyContact" cl WHERE cl."contactId" = ${A}."id" AND cl."companyId" = ${companyId} AND cl."endedAt" IS NULL))`);
  }
  const filters = listFieldFilters(flt);
  if (Object.keys(filters).length > 0) {
    try {
      AND.push(await (await engine()).fieldFilterSql({ ...fctx(ctx, actor), objectKey: "contact" }, filters, c));
    } catch (e) {
      throw mapError(e);
    }
  }
  return andSql(AND);
}

/** id ของหน้า (ทาง SQL) — ลำดับ/cursor แบบ Prisma (list-sql.ts) */
async function pageIdsSql(where: Prisma.Sql, orderBy: readonly Record<string, unknown>[], take: number, cursor: string | null): Promise<string[]> {
  const sort = withThaiCollation(sqlSortOf(orderBy), ["name"]); // CRM C5.4-E ▸ L6-m3: ชื่อเรียงแบบพจนานุกรมไทย ◂
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT c."id" FROM "CrmContact" c
     WHERE ${where} ${cursor ? Prisma.sql`AND ${cursorSql("c", "CrmContact", sort, cursor)}` : Prisma.empty}
     ORDER BY ${orderBySql("c", sort)} LIMIT ${take} OFFSET ${cursor ? 1 : 0}`;
  return rows.map((r) => r.id);
}

async function ownerNames(ctx: ContactsCtx, ids: (string | null)[]): Promise<Map<string, string>> {
  const uniq = [...new Set(ids.filter((x): x is string => !!x))];
  if (uniq.length === 0) return new Map();
  // CRM C5.1-fix ▸ ถาม User ตรง + กรอง "เป็นสมาชิกร้านนี้" ด้วย relation filter = 1 คำสั่ง (เดิม Membership + include User = 2) ·
  //   ชุดผลเท่าเดิม (Membership @@unique[userId, tenantId] ⇒ 1 คน 1 แถวต่อร้าน — วิธีเดียวกับ account/attachment.ts) ◂
  const rows = await prisma.user.findMany({ where: { id: { in: uniq }, memberships: { some: { tenantId: ctx.tenantId } } }, select: { id: true, name: true, email: true } });
  return new Map(rows.map((r) => [r.id, r.name ?? r.email ?? "ผู้ใช้"]));
}

// CRM C3.2 ▸ (รีวิวรอบ 2 NOTE-6) ตรวจตัวกรองของมุมมองที่บันทึก "โดยไม่โหลดการ์ด" — where เดียวกับ listContacts + ดึง id 1 แถว ·
//   ตัวกรองที่ใช้ไม่ได้ = ContactsError VALIDATION จาก listWhere เหมือนหน้ารายการจริง ◂
/** ตรวจว่าตัวกรองชุดนี้ใช้กับรายการผู้ติดต่อได้ (อ่าน 1 id · ไม่เติมชื่อบริษัท/ผู้ดูแล) */
export async function probeContactFilters(ctx: ContactsCtx, actor: MemberActor, input: ContactListInput): Promise<void> {
  const a = await enter(ctx, actor);
  // CRM C5.1-fix ▸ มีตัวกรองฟิลด์ = ตรวจด้วย SQL (ไม่มีรายการ id) ◂
  const flt = await effectiveListInput(ctx, a, input ?? {});
  if (Object.keys(listFieldFilters(flt)).length > 0) {
    await prisma.$queryRaw`SELECT c."id" FROM "CrmContact" c WHERE ${await listSqlWhere(ctx, a, flt)} LIMIT 1`;
    return;
  }
  await prisma.crmContact.findFirst({ where: await listWhereFrom(ctx, a, flt), select: { id: true } });
}

export async function listContacts(ctx: ContactsCtx, actor: MemberActor, input: ContactListInput = {}): Promise<ContactListResult> {
  return crmScope(() => listContactsIn(ctx, actor, input));
}

async function listContactsIn(ctx: ContactsCtx, actor: MemberActor, input: ContactListInput = {}): Promise<ContactListResult> {
  const a = await enter(ctx, actor);
  // CRM C5.1-fix ▸ F1: มีตัวกรองฟิลด์ = เลือก id ของหน้าด้วย SQL (EXISTS · ไม่มีรายการ id) แล้วอ่านแถวเต็มด้วย Prisma ·
  //   ไม่มีตัวกรองฟิลด์ = ทาง Prisma เดิม ◂
  const flt = await effectiveListInput(ctx, a, input ?? {});
  const sortKey = input?.sort;
  // CRM C5.4-E ▸ L6-m3: เรียงตามชื่อ = ทาง SQL ด้วย (collation ภาษาไทย — Prisma ตั้ง collation ใน orderBy ไม่ได้) ◂
  const sqlPath = Object.keys(listFieldFilters(flt)).length > 0 || sortKey === "name" ? await listSqlWhere(ctx, a, flt) : null;
  const where = sqlPath ? null : await listWhereFrom(ctx, a, flt);
  const pageSize = Math.min(CONTACT_PAGE_MAX, Math.max(1, Math.floor(Number(input?.pageSize) || 50)));
  const orderBy = typeof sortKey === "string" && (CONTACT_SORTS as readonly string[]).includes(sortKey) ? SORTS[sortKey as ContactSort] : SORTS["-createdAt"];
  const cursor = str(input?.cursor);
  if (cursor) {
    const ok = await prisma.crmContact.findFirst({ where: { AND: [await contactWhere(ctx, a), { id: cursor }] }, select: { id: true } });
    if (!ok) throw fail("VALIDATION", "ลิงก์หน้าถัดไปหมดอายุแล้ว — กลับไปหน้าแรกของรายการ");
  }
  const rows = sqlPath
    ? await (async () => {
        const ids = await pageIdsSql(sqlPath, orderBy, pageSize + 1, cursor);
        return ids.length ? inOrder(ids, await prisma.crmContact.findMany({ where: { id: { in: ids } } })) : [];
      })()
    : await prisma.crmContact.findMany({ where: where!, orderBy, take: pageSize + 1, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}) });
  const more = rows.length > pageSize;
  const page = more ? rows.slice(0, pageSize) : rows;
  const coIds = [...new Set(page.map((r) => r.companyId).filter((x): x is string => !!x))];
  const [cos, owners] = await Promise.all([
    companies.liveCompanyRefs(coCtx(ctx), a, coIds),
    ownerNames(ctx, page.map((r) => r.ownerUserId)),
  ]);
  const coName = new Map(cos.map((c) => [c.id, c.name]));
  const items: ContactListItem[] = page.map((r) => ({ ...toDto(r), companyName: (r.companyId ? coName.get(r.companyId) : null) ?? r.company ?? null, ownerName: r.ownerUserId ? (owners.get(r.ownerUserId) ?? null) : null }));
  return { items, nextCursor: more ? (page[page.length - 1]?.id ?? null) : null };
}

/** มุมมองบันทึกของผู้ติดต่อที่ actor ใช้ได้ (ของตัวเอง + ที่แชร์ทั้งร้าน) — สำหรับตัวเลือกบนหน้ารายการ */
export async function savedViewOptions(ctx: ContactsCtx, actor: MemberActor): Promise<{ id: string; name: string }[]> {
  const a = await enter(ctx, actor);
  // CRM C3.2 ▸ กติกาเดียวกับ listViews (`views.ts`) — ทีมจริง ไม่ใช่ "ทั้งร้าน" ◂
  return (await viewOptions(ctx, a, "contact")).map((v) => ({ id: v.id, name: v.name }));
}

/** ช่องเลือกผู้ติดต่อ (ค้นฝั่งเซิร์ฟเวอร์ — บทเรียน C1.3 SF11) */
export async function contactOptions(ctx: ContactsCtx, actor: MemberActor, opts: { q?: string | null; excludeId?: string | null } = {}): Promise<{ id: string; name: string }[]> {
  const a = await enter(ctx, actor);
  const where = await listWhere(ctx, a, { q: opts.q ?? null });
  const rows = await prisma.crmContact.findMany({
    where: { AND: [where, ...(opts.excludeId ? [{ id: { not: opts.excludeId } }] : [])] },
    select: { id: true, name: true, firstName: true, lastName: true, phone: true },
    orderBy: [{ createdAt: "desc" }],
    take: 30,
  });
  return rows.map((r) => ({ id: r.id, name: `${contactLabel(r)}${r.phone ? ` · ${r.phone.slice(0, 3)}-xxx-${r.phone.slice(-4)}` : ""}` }));
}

/** ตัวเลือกของโมดัลแปลง: ระบบสมาชิกของร้าน · pipeline ของระบบนี้ (ขั้นที่ยังเปิด) */
export async function convertOptions(ctx: ContactsCtx, actor: MemberActor): Promise<ConvertOptions> {
  await enter(ctx, actor);
  // CRM C3.6 ▸ ตัวเลือกระบบสมาชิก = raw lookup ตัวเดียว (`listTargetCandidates`) · ค่าตั้งต้น (แถวแรก = ที่โมดัลเลือกไว้ให้) =
  //   ปลายทางจากตัวตัดสิน (`resolveCrmTargets`: ที่ร้านเลือก → ผูกสาขา → ระบบเดียว) — DTO `ConvertOptions` ไม่เปลี่ยนรูป ◂
  const [candidates, targets, pipes] = await Promise.all([
    listTargetCandidates(ctx.tenantId, "member"),
    resolveCrmTargets(ctx.tenantId, ctx.systemId, ["member"]),
    prisma.crmPipeline.findMany({
      where: { ...identityScope(ctx), archivedAt: null },
      include: { stages: { where: { kind: "OPEN" }, orderBy: { sortOrder: "asc" }, select: { id: true, name: true } } },
      orderBy: [{ isDefault: "desc" }, { sortOrder: "asc" }],
      take: 50,
    }),
  ]);
  const systems = candidates
    .sort((a, b) => Number(b.id === targets.member) - Number(a.id === targets.member))
    .slice(0, 20)
    .map((c) => ({ id: c.id, name: c.name }));
  return { memberSystems: systems, pipelines: pipes.map((p) => ({ id: p.id, name: p.name, isDefault: p.isDefault, stages: p.stages })) };
}

// ═════════════════════════ แปลง lead (สมาชิก + บริษัท + ดีล ในธุรกรรมเดียว) ═════════════════════════

/**
 * แปลงผู้ติดต่อ — ติ๊กได้ 3 อย่าง: สมาชิก (ผ่าน `member.createMember` ที่รับ tx ของเรา · source CRM) · บริษัท (ใหม่/เดิม + ลิงก์หลัก) ·
 * ดีล (ขั้นเปิดแรกตาม sortOrder เมื่อไม่ระบุ) · ผู้ติดต่อได้ memberCustomerId/companyId/convertedAt/lifecycle
 * AUDIT-CLASS X3: **ชุดเดียวเสมอ** — advisory lock ต่อผู้ติดต่อเป็นล็อกแรกของธุรกรรม (ข้ามโพรเซส/ข้ามเครื่องก็เรียงคิวที่ฐานข้อมูล) ·
 *   หลังได้ล็อก: event `crm.contact.converted#<id>#<hash(key)>` มีแล้ว = คำขอซ้ำของคีย์เดิม ⇒ คืน id ชุดเดิม (ไม่สร้างอะไร) ·
 *   ผู้ติดต่อถูกแปลงแล้วด้วยคีย์อื่น (คนที่สองกดพร้อมกัน) ⇒ CONFLICT ข้อความไทยสุภาพ
 * AUDIT-CLASS X1: ระบบสมาชิกต้องเป็น MEMBER ของร้านนี้ · บริษัท/pipeline/ขั้นต้องเป็นของระบบ CRM นี้ — ตรวจครบก่อนเปิดธุรกรรม
 * ล้มตรงไหนก็ตาม (รวม event เขียนไม่ได้) ⇒ ไม่มีอะไรค้าง: สมาชิก · Party บริษัท · บริษัท · ลิงก์ · ดีล · ความยินยอม · event
 * 🔴 ดีลเขียนตรงและไม่ยิง `crm.deal.*` (มติผู้คุมงาน C1.4 ข้อ 5 — ยังไม่มี consumer) · ใบ C1.5 ต้องเปลี่ยนเป็น `deals.createDeal(…, tx)`
 */
export async function convertContact(ctx: ContactsCtx, actor: MemberActor, id: string, input: ConvertInput): Promise<ConvertResult> {
  const key = str(input?.idempotencyKey);
  if (!key || key.length > 200) throw fail("VALIDATION", "คำขอแปลงต้องมีรหัสกันกดซ้ำ (idempotencyKey) — รีเฟรชหน้าแล้วกดแปลงอีกครั้ง");
  const a = await enter(ctx, actor);
  const contact = await loadContact(ctx, a, id, prisma, { live: true });
  need(a, "crm.contact.convert");
  const wantMember = isObj(input?.member);
  const wantCompany = isObj(input?.company);
  const wantDeal = isObj(input?.deal);
  if (!wantMember && !wantCompany && !wantDeal) throw fail("VALIDATION", "ติ๊กเลือกอย่างน้อย 1 อย่าง (สมาชิก · บริษัท · ดีล) ก่อนกดแปลง");

  // ── ตรวจเป้าหมายทั้งหมดก่อนเปิดธุรกรรม (AUDIT-CLASS X1) ──
  let memberSystemId: string | null = null;
  if (wantMember) {
    // CRM C3.6 ▸ ไม่ระบุระบบ = ปลายทางจากตัวตัดสิน · ระบุ = ต้องเป็นระบบสมาชิกของร้านนี้ (ตัวเลือกจาก raw lookup ตัวเดียว) ◂
    const sid = str((input.member as { systemId?: unknown }).systemId) ?? (await resolveCrmTargets(ctx.tenantId, ctx.systemId, ["member"])).member;
    const sys = sid ? (await listTargetCandidates(ctx.tenantId, "member")).find((c) => c.id === sid) ?? null : null;
    if (!sys) throw fail("NOT_FOUND", "ไม่พบระบบสมาชิกที่เลือกในร้านนี้ — เลือกใหม่จากรายการ");
    memberSystemId = sys.id;
  }
  let companyExisting: string | null = null;
  let companyNewName: string | null = null;
  let companyNewTaxId: string | null = null;
  let companyRole: CompanyContactRole | null = null;
  if (wantCompany) {
    const c = input.company as Record<string, unknown>;
    // C4.4-fix ▸ US2: บทบาทของผู้ติดต่อในบริษัท (ไม่ส่ง/ว่าง = ไม่แตะ) · ค่านอกรายการ = ปฏิเสธก่อนเปิดธุรกรรม ◂
    const rawRole = typeof c.role === "string" ? c.role.trim() : c.role ?? null;
    if (rawRole !== null && rawRole !== "") {
      if (typeof rawRole !== "string" || !(COMPANY_CONTACT_ROLES as readonly string[]).includes(rawRole)) {
        throw fail("VALIDATION", "บทบาทในบริษัทที่เลือกไม่อยู่ในรายการ — เลือกใหม่จากรายการ (เช่น ผู้ตัดสินใจ · ผู้ประสาน · การเงิน)");
      }
      companyRole = rawRole as CompanyContactRole;
    }
    if (isObj(c.new)) {
      companyNewName = cleanName(c.new.name, "ชื่อบริษัท", true);
      // C4.4-fix ▸ US2: เลขภาษีของบริษัทใหม่ — ตัวตรวจชุดเดียวกับ companies.createCompany (taxIdProblem · ข้อความเดียวกัน) ◂
      const rawTax = c.new.taxId;
      if (rawTax !== undefined && rawTax !== null) {
        if (typeof rawTax !== "string") throw fail("VALIDATION", "เลขประจำตัวผู้เสียภาษีต้องเป็นตัวเลขเท่านั้น (เว้นวรรคหรือขีดคั่นได้)");
        const p = taxIdProblem(rawTax);
        if (p) throw fail("VALIDATION", p, { field: "taxId" });
        companyNewTaxId = normalizeCompanyTaxId(rawTax) || null;
      }
    } else {
      const cid = str(c.id);
      if (cid) need(a, "crm.company.read"); // CRM C5.5-fix6 ▸ F3: "ผูกบริษัทที่มีอยู่" ซ่อนสำหรับคนที่ไม่มีสิทธิ์อ่านบริษัท — ส่งตรงได้ข้อความเรื่องสิทธิ์ ◂
      const [co] = cid ? await companies.liveCompanyRefs(coCtx(ctx), a, [cid]) : [];
      if (!co) throw fail("NOT_FOUND", "ไม่พบบริษัทที่เลือกในระบบ CRM นี้ (อาจถูกเก็บถาวรหรือรวมไปแล้ว) — เลือกใหม่จากรายการ");
      companyExisting = co.id;
    }
  }
  let dealPlan: { pipelineId: string; stageId: string; stageKind: "OPEN" | "WON" | "LOST"; title: string; valueSatang: number } | null = null;
  if (wantDeal) {
    const d = input.deal as Record<string, unknown>;
    const pid = str(d.pipelineId);
    const pipe = pid
      ? await prisma.crmPipeline.findFirst({ where: { ...identityScope(ctx), id: pid, archivedAt: null }, include: { stages: { orderBy: { sortOrder: "asc" } } } })
      : null;
    if (!pipe) throw fail("NOT_FOUND", "ไม่พบ pipeline ที่เลือกในระบบ CRM นี้ — เลือกใหม่จากรายการ");
    const sid = str(d.stageId);
    const stage = sid ? pipe.stages.find((s) => s.id === sid) : pipe.stages.find((s) => s.kind === "OPEN");
    if (!stage) throw fail("VALIDATION", sid ? "ขั้นที่เลือกไม่ได้อยู่ใน pipeline นี้ — เลือกขั้นใหม่" : "pipeline นี้ยังไม่มีขั้นที่เปิดอยู่ — เพิ่มขั้นก่อนเปิดดีล");
    if (stage.kind !== "OPEN") throw fail("VALIDATION", "ดีลใหม่ต้องเริ่มที่ขั้นที่ยังเปิดอยู่ — เลือกขั้นอื่น");
    const title = cleanName(d.title, "ชื่อดีล", true) as string;
    const v = d.valueSatang === undefined || d.valueSatang === null || d.valueSatang === "" ? 0 : Number(d.valueSatang);
    if (!Number.isSafeInteger(v) || v < 0 || v > 2_147_483_647) throw fail("VALIDATION", "มูลค่าดีลต้องเป็นจำนวนเต็มสตางค์ 0 ถึง ฿21,474,836 — ตรวจตัวเลขอีกครั้ง");
    dealPlan = { pipelineId: pipe.id, stageId: stage.id, stageKind: stage.kind, title, valueSatang: v };
  }

  // C4.4-fix รอบ 2 (M2): การมองเห็นบริษัทของผู้กด คำนวณก่อนเปิด tx (ใน tx อ่านแค่แถวเดียวด้วย where นี้ — ไม่แย่ง pool ขณะถือล็อก)
  const companyVisible = companyNewName ? await companies.companyVisibility(coCtx(ctx), a) : null;
  // สมาชิกที่ผูกอยู่แล้ว: หาระบบสมาชิกไว้ก่อนเปิด tx (ถอนความยินยอมใน tx ต้องไม่เปิด connection ที่สองระหว่างถือล็อก)
  const linkedMemberSystem = wantMember && contact.memberCustomerId ? ((await consents.memberSystemOf(ctx.tenantId, contact.memberCustomerId))?.systemId ?? null) : null;
  const keyHash = createHash("sha256").update(key).digest("hex").slice(0, 32);
  const eventKey = `${EVENT.converted}#${contact.id}#${keyHash}`;
  type Outcome = { replayed: boolean; customerId: string | null; companyId: string | null; dealId: string | null; memberCreated: boolean; companyCreated: boolean; partyId: string | null; revoked: string[]; reusedCompany?: { id: string; name: string } | null };
  let out: Outcome;
  try {
    out = await prisma.$transaction(async (tx): Promise<Outcome> => {
      // ① ล็อกแรกของธุรกรรม: คิวการแปลงของผู้ติดต่อคนนี้ (ไม่มีทางอื่นถือล็อกนี้ ⇒ ไม่ชนลำดับล็อกของใคร)
      await lockKey(tx, `crm:contact-convert:${contact.id}`);
      const prior = await tx.outboxEvent.findUnique({ where: { tenantId_idempotencyKey: { tenantId: ctx.tenantId, idempotencyKey: eventKey } }, select: { payload: true } });
      if (prior) {
        const p = (isObj(prior.payload) ? prior.payload : {}) as Record<string, unknown>;
        return { replayed: true, customerId: str(p.customerId), companyId: str(p.companyId), dealId: str(p.dealId), memberCreated: false, companyCreated: false, partyId: null, revoked: [] };
      }
      const pre = await tx.crmContact.findFirst({ where: { ...identityScope(ctx), id: contact.id } });
      if (!pre) throw fail("NOT_FOUND", NOT_FOUND_MSG);
      if (pre.mergedIntoId) throw fail("VALIDATION", MERGED_MSG);
      if (pre.archivedAt) throw fail("VALIDATION", ARCHIVED_MSG);
      if (pre.convertedAt) {
        throw fail("CONFLICT", "ผู้ติดต่อนี้เพิ่งถูกแปลงไปแล้ว (อาจมีเพื่อนร่วมทีมกดพร้อมกัน) — รีเฟรชหน้าเพื่อดูสมาชิก บริษัท และดีลที่สร้างไว้");
      }
      const now = new Date();

      // ② บริษัท + ลิงก์ผ่านบริการบริษัทที่เข้าร่วม tx นี้ (มติ C1.4 Option A): Party COMPANY advisory → แถวบริษัท → แถวผู้ติดต่อ
      let companyId: string | null = companyExisting;
      let companyCreated = false;
      let reusedCompany: { id: string; name: string } | null = null;
      if (companyNewName) {
        const co = await companies
          .createInTx(tx, coCtx(ctx), { name: companyNewName, taxId: companyNewTaxId, ownerUserId: pre.ownerUserId ?? actorId(ctx), visible: companyVisible })
          .catch((e: unknown) => {
            // รอบ 3: ข้อความเรื่องเลขภาษีซ้ำ (เก็บถาวร/มองไม่เห็น) แสดงใต้ช่องเลขภาษี
            if (e instanceof CompaniesError && (e.message === TAX_COMPANY_ARCHIVED_MSG || e.message === TAX_COMPANY_HIDDEN_MSG)) throw fail("VALIDATION", e.message, { field: "taxId" });
            throw e;
          });
        companyId = co.id;
        companyCreated = co.created;
        // C4.4-fix รอบ 2 (M2 · S2): createInTx คืน "บริษัทเดิม" ได้ (เลขภาษีซ้ำ) — ต้องผ่านการมองเห็นเดียวกับทาง "เลือกบริษัท"
        //   (ไม่เห็น = ยกเลิกทั้งก้อน ไม่บอกชื่อ/id ของบริษัทนั้น) · เห็น = ใช้บริษัทเดิมและบอกผู้ใช้ในผลลัพธ์ (ไม่ใช้เงียบ ๆ) ·
        //   บริษัทใหม่ที่ผู้กดมองไม่เห็น (ไม่มีสิทธิ์อ่านบริษัท) + ติ๊กดีล = บอกเรื่องสิทธิ์ตรง ๆ แทน "ไม่พบบริษัทที่เลือก" จากบริการดีล ◂
        if (!co.created || dealPlan) {
          const seen = companyVisible ? await companies.visibleCompanyInTx(tx, companyVisible, co.id) : null;
          if (!co.created && !seen) {
            throw fail("VALIDATION", TAX_COMPANY_HIDDEN_MSG, { field: "taxId" });
          }
          if (co.created && !seen) {
            throw fail("FORBIDDEN", "บัญชีนี้ยังไม่มีสิทธิ์ดูข้อมูลบริษัท จึงเปิดดีลที่ผูกกับบริษัทใหม่ไม่ได้ — ระบบยกเลิกการแปลงทั้งหมดให้แล้ว (ข้อมูลไม่เปลี่ยน) · ขอให้ผู้ดูแลเพิ่มสิทธิ์ดูบริษัท หรือเอาติ๊กดีลออกแล้วลองใหม่");
          }
          if (!co.created && seen) reusedCompany = seen;
        }
      }
      // CRM C1.5 ▸ รีวิว C1.5 S4 (ลำดับล็อก บริษัท → ผู้ติดต่อ → ดีล): ล็อกบริษัทปัจจุบันของผู้ติดต่อ + บริษัทที่เลือก (เรียง id) ก่อนแถวผู้ติดต่อ
      //   — ดีลที่สร้างใน ⑤ ผูกบริษัทใดบริษัทหนึ่งในชุดนี้ ⇒ บริการดีลไม่ต้องล็อกบริษัทใหม่หลังถือแถวผู้ติดต่อแล้ว ◂ CRM C1.5
      const lockedCompanies = [pre.companyId, companyId].filter((x): x is string => !!x);
      await companies.lockCompanyRowsInTx(tx, coCtx(ctx), lockedCompanies);
      if (companyId) await companies.linkContactInTx(tx, coCtx(ctx), companyId, pre.id, { primaryIfNone: true, jobTitle: pre.jobTitle, ...(companyRole ? { role: companyRole } : {}) });

      // ③ แถวผู้ติดต่อ (หลังแถวบริษัท · ล็อกซ้ำใน tx เดียวกันได้) แล้ว **อ่านใหม่** (รีวิว C1.4 S3): รวม/เก็บถาวร/แปลงด้วยคีย์อื่น
      //    ที่ commit ระหว่างรอล็อก = ปฏิเสธ · ความยินยอมอ่านหลังล็อกนี้ (setOptOut/consents.set ล็อกแถวเดียวกัน)
      await lockContactRows(tx, ctx, [pre.id]);
      const cur = await tx.crmContact.findFirst({ where: { ...identityScope(ctx), id: pre.id } });
      if (!cur) throw fail("NOT_FOUND", NOT_FOUND_MSG);
      if (cur.mergedIntoId) throw fail("VALIDATION", MERGED_MSG);
      if (cur.archivedAt) throw fail("VALIDATION", ARCHIVED_MSG);
      if (cur.convertedAt) throw fail("CONFLICT", "ผู้ติดต่อนี้เพิ่งถูกแปลงไปแล้ว (อาจมีเพื่อนร่วมทีมกดพร้อมกัน) — รีเฟรชหน้าเพื่อดูสมาชิก บริษัท และดีลที่สร้างไว้");

      // ④ สมาชิก (ภายใน tx เดียวกัน · ผูกแล้ว = ใช้คนเดิม · มีคนเดิมในระบบสมาชิกด้วยเบอร์/อีเมล = ผูกคนนั้น)
      let customerId: string | null = null;
      let memberCreated = false;
      if (memberSystemId) {
        if (cur.memberCustomerId) {
          customerId = cur.memberCustomerId;
        } else {
          if (!cur.phone && !cur.email) throw fail("VALIDATION", "ผู้ติดต่อนี้ยังไม่มีเบอร์โทรหรืออีเมล — เพิ่มอย่างใดอย่างหนึ่งก่อนสร้างสมาชิก (ใช้ยืนยันตัวสมาชิกครั้งต่อไป)");
          // R-E.11 · มติ C1.4 ข้อ 3: สถานะความยินยอมล่าสุดฝั่ง CRM คัดลอกไปสมาชิก "ครั้งเดียว" (ที่มา STAFF = คนที่กดแปลง)
          // B1 (รีวิว C1.4 · "เข้มสุดชนะ"): ขอไม่รับ (marketing/อีเมล) = ถอนช่องทางนั้นบนสมาชิกใหม่ด้วย — ไม่มีวันให้เกินที่ CRM มี
          const states = await consents.latestCrmStates(tx, ctx.tenantId, cur.id);
          const copy = new Map<string, boolean>([...states.entries()].map(([ch, st]) => [ch, st.granted]));
          for (const ch of await consents.crmRevocations(tx, ctx.tenantId, cur)) copy.set(ch, false);
          const r = await (await memberFacade()).createMember(
            { tenantId: ctx.tenantId, systemId: memberSystemId, actorUserId: actorId(ctx) },
            a,
            {
              firstName: cur.firstName ?? cur.name,
              lastName: cur.lastName,
              phone: cur.phone,
              email: cur.email,
              source: "CRM",
              sourceDetail: { crmContactId: cur.id, crmSystemId: ctx.systemId },
              consents: [...copy.entries()].map(([channel, granted]) => ({ channel, granted, source: "STAFF" })),
            },
            tx,
          );
          customerId = r.customerId;
          memberCreated = r.created;
        }
      }
      // B1 (b) (รีวิว C1.4 · มติผู้คุมงาน: atomic): ผูกกับสมาชิกที่ **มีอยู่แล้ว** — ช่องทางที่ฝั่ง CRM ถอน/ขอไม่รับ ถูกถอนบนสมาชิก
      //   ผ่าน facade ใน tx เดียวกัน (ลำดับล็อก: แถว CrmContact ข้างบน → แถว Customer ใน setConsent) · ถอนไม่ได้ = การแปลงทั้งก้อนย้อนกลับ
      //   ถอนอย่างเดียว ไม่เคยให้ (แคมเปญ/journey ของสมาชิกอ่าน MemberConsent ตรง — ถอนหลัง commit = มีช่วงที่ส่งหาคนที่ขอไม่รับ)
      let revoked: string[] = [];
      if (customerId && !memberCreated) {
        if (cur.memberCustomerId && cur.memberCustomerId !== contact.memberCustomerId) {
          throw fail("CONFLICT", "ผู้ติดต่อนี้เพิ่งถูกผูกกับสมาชิกระหว่างแปลง — รีเฟรชหน้าแล้วลองใหม่");
        }
        const sysId = cur.memberCustomerId ? linkedMemberSystem : memberSystemId;
        const chans = await consents.crmRevocations(tx, ctx.tenantId, cur);
        try {
          revoked = (await consents.revokeOnMember(ctx, a, customerId, chans, { tx, memberSystemId: sysId })).revoked;
        } catch {
          throw fail("CONFLICT", "ถอนความยินยอมในระบบสมาชิกไม่สำเร็จ ระบบจึงยกเลิกการแปลงทั้งหมดให้แล้ว (ข้อมูลไม่เปลี่ยน) — ลองใหม่อีกครั้ง");
        }
      }

      // ⑤ ดีล — CRM C1.5 ▸ ผ่านบริการดีล v2 ใน tx เดียวกัน (หนี้ C1.4 ข้อ 5): แถวประวัติขั้นแรก + แคชบริษัท +
      //   event `crm.deal.created` หนึ่งตัวใน tx นี้ ⇒ event เขียนไม่ได้ = การแปลงทั้งก้อนย้อนกลับ ◂ CRM C1.5
      let dealId: string | null = null;
      if (dealPlan) {
        // CRM C1.5 ▸ รีวิว C1.5 S4: ส่งบริษัทของดีลให้ชัด (บริษัทที่เลือก หรือบริษัทปัจจุบันของผู้ติดต่อที่อ่านใหม่หลังล็อก) ·
        //   บริษัทปัจจุบันเปลี่ยนระหว่างรอล็อก (ไม่อยู่ในชุดที่ล็อกไว้) = ยกเลิกทั้งก้อน แทนการล็อกย้อนลำดับ ◂ CRM C1.5
        const dealCompanyId = companyId ?? cur.companyId ?? null;
        if (dealCompanyId && !lockedCompanies.includes(dealCompanyId)) {
          throw fail("CONFLICT", "บริษัทของผู้ติดต่อนี้เพิ่งถูกเปลี่ยนระหว่างแปลง ระบบจึงยกเลิกให้ทั้งหมด (ข้อมูลไม่เปลี่ยน) — รีเฟรชหน้าแล้วลองใหม่");
        }
        const d = await deals.createDeal(
          { tenantId: ctx.tenantId, systemId: ctx.systemId, actorUserId: actorId(ctx) },
          a,
          {
            pipelineId: dealPlan.pipelineId,
            stageId: dealPlan.stageId,
            title: dealPlan.title,
            contactId: cur.id,
            companyId: dealCompanyId,
            valueSatang: dealPlan.valueSatang,
            ownerUserId: cur.ownerUserId ?? actorId(ctx),
            sourceKind: cur.sourceKind,
          },
          tx,
        );
        dealId = d.id;
      }

      // ⑥ ผู้ติดต่อ: สมาชิก · convertedAt · ขั้น (สมาชิก = ลูกค้า · มีดีล = มีโอกาส · เดินหน้าอย่างเดียว)
      const target: CrmLifecycleStage = customerId ? "CUSTOMER" : dealId ? "PROSPECT" : cur.lifecycleStage;
      const lifecycleStage = target !== cur.lifecycleStage && canAdvanceLifecycle(cur.lifecycleStage, target) ? target : cur.lifecycleStage;
      // payload ของ event (id ล้วน) ประกอบก่อนเขียนแถว — แคช companyId ของผู้ติดต่อเขียนโดยบริการบริษัท (linkContactInTx) ไม่ใช่ที่นี่
      const convertedPayload = { contactId: cur.id, customerId, companyId, dealId, partyId: cur.partyId };
      const outcome: Outcome = { replayed: false, customerId, companyId, dealId, memberCreated, companyCreated, partyId: cur.partyId, revoked, reusedCompany };
      await tx.crmContact.update({ where: { id: cur.id }, data: { convertedAt: now, lifecycleStage, ...(customerId ? { memberCustomerId: customerId } : {}) } });

      // ⑦ event ใน tx เดียวกัน (key ผูกคีย์กันซ้ำ = แถวนี้คือ "ใบเสร็จ" ของคำขอ) · payload id ล้วน
      await emitOutbox(tx, { tenantId: ctx.tenantId, systemId: ctx.systemId, type: EVENT.converted, idempotencyKey: eventKey, payload: convertedPayload });
      return outcome;
    }, CONVERT_TX_OPTS);
  } catch (e) {
    throw mapError(e);
  }

  if (!out.replayed) {
    await writeAudit({
      tenantId: ctx.tenantId,
      actorId: actorId(ctx),
      action: "crm.contact.convert",
      targetType: "CrmContact",
      targetId: contact.id,
      after: { customerId: out.customerId, memberCreated: out.memberCreated, companyId: out.companyId, companyCreated: out.companyCreated, dealId: out.dealId, key: keyHash, memberConsentRevoked: out.revoked },
    });
    // setConsent ที่รับ tx ไม่เขียน audit เอง ⇒ เขียนแทนหลัง commit (ช่องทางที่ถอนจริงบนสมาชิก)
    if (out.customerId && out.revoked.length > 0) {
      await writeAudit({ tenantId: ctx.tenantId, actorId: actorId(ctx), action: "member.privacy.consent", targetType: "Customer", targetId: out.customerId, after: { revoked: out.revoked, granted: false, source: "STAFF", via: "crm.contact.convert" } });
    }
    // createMember ที่รับ tx ไม่เขียน audit เอง (เขียนนอก tx ก่อน commit = audit ของสมาชิกที่อาจไม่มีจริง) ⇒ เขียนแทนหลัง commit
    if (out.memberCreated && out.customerId) {
      await writeAudit({ tenantId: ctx.tenantId, actorId: actorId(ctx), action: "member.created", targetType: "Customer", targetId: out.customerId, after: { source: "CRM", via: "crm.contact.convert", crmContactId: contact.id } });
    }
    if (out.companyCreated && out.companyId) {
      await writeAudit({ tenantId: ctx.tenantId, actorId: actorId(ctx), action: "crm.company.create", targetType: "CrmCompany", targetId: out.companyId, after: { via: "crm.contact.convert", contactId: contact.id } });
    }
    if (out.companyId && out.dealId) await companies.recomputeCaches(coCtx(ctx), out.companyId).catch(() => undefined);
  }
  return { contactId: contact.id, customerId: out.customerId, companyId: out.companyId, dealId: out.dealId, replayed: out.replayed, reusedCompany: out.reusedCompany ?? null };
}

// ═════════════════════════ ตัวซ้ำ · รวม ═════════════════════════

/** คู่ที่น่าจะเป็นคนเดียวกันในระบบนี้ (เบอร์ · อีเมล · ชื่อเหมือนกันทุกตัวอักษร) — ผ่าน contactWhere (เห็นแค่ที่มองเห็นได้) */
export async function findDuplicates(ctx: ContactsCtx, actor: MemberActor, opts: { limit?: number } = {}): Promise<{ items: DuplicatePairItem[] }> {
  const a = await enter(ctx, actor);
  const limit = Math.min(500, Math.max(1, Math.floor(Number(opts?.limit) || 200)));
  const base: Prisma.CrmContactWhereInput[] = [await contactWhere(ctx, a), { mergedIntoId: null, archivedAt: null }];
  const [phones, emails, names] = await Promise.all([
    prisma.crmContact.groupBy({ by: ["phone"], where: { AND: [...base, { phone: { not: null } }] }, having: { phone: { _count: { gt: 1 } } }, orderBy: { phone: "asc" }, take: 200 }),
    prisma.crmContact.groupBy({ by: ["email"], where: { AND: [...base, { email: { not: null } }] }, having: { email: { _count: { gt: 1 } } }, orderBy: { email: "asc" }, take: 200 }),
    prisma.crmContact.groupBy({ by: ["name"], where: { AND: base }, having: { name: { _count: { gt: 1 } } }, orderBy: { name: "asc" }, take: 200 }),
  ]);
  const items: DuplicatePairItem[] = [];
  const seen = new Set<string>();
  const addPairs = async (reason: DuplicatePairItem["reason"], where: Prisma.CrmContactWhereInput) => {
    const rows = await prisma.crmContact.findMany({ where: { AND: [...base, where] }, select: { id: true, name: true, firstName: true, lastName: true, phone: true, email: true }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], take: 2000 });
    const groups = new Map<string, typeof rows>();
    for (const r of rows) {
      const k = reason === "PHONE" ? (r.phone ?? "") : reason === "EMAIL" ? (r.email ?? "").toLowerCase() : r.name;
      if (!k) continue;
      groups.set(k, [...(groups.get(k) ?? []), r]);
    }
    for (const g of groups.values()) {
      const [first, ...rest] = g;
      if (!first) continue;
      for (const r of rest) {
        const pk = [first.id, r.id].sort().join("|");
        if (seen.has(pk) || items.length >= limit) continue;
        seen.add(pk);
        items.push({ a: first.id, b: r.id, aName: contactLabel(first), bName: contactLabel(r), reason });
      }
    }
  };
  if (phones.length) await addPairs("PHONE", { phone: { in: phones.map((p) => p.phone).filter((x): x is string => !!x) } });
  if (emails.length) await addPairs("EMAIL", { email: { in: emails.map((p) => p.email).filter((x): x is string => !!x) } });
  if (names.length) await addPairs("NAME", { name: { in: names.map((p) => p.name) } });
  return { items };
}

/**
 * รวมผู้ติดต่อ (`mergeId` → `keepId`) — ไม่ลบแถว: แถวที่ถูกรวมได้ `mergedIntoId` + `archivedAt`
 * ย้าย: ดีล · กิจกรรม · ผู้ร่วมดีล (ชน = ทิ้งแถวของคนที่ถูกรวม) · บทบาทในบริษัท (ชน = ของคนที่เก็บไว้ชนะ) · ไฟล์แนบ · รายการวัตถุ (parent CONTACT)
 * Party ของคนที่ถูกรวม → รวมเข้า Party ของคนที่เก็บไว้ (เฉพาะ Party ชนิดคน) · สองคนผูกสมาชิกคนละคน = ไม่รวม (§11.1 — ไปรวมที่ระบบสมาชิก)
 * AUDIT-CLASS X9: ยืนยัน + เหตุผล ≥ 5 · audit ทั้งสองแถวเก็บเหตุผล
 */
export async function mergeContacts(ctx: ContactsCtx, actor: MemberActor, input: MergeContactsInput): Promise<MergeContactsResult> {
  const reason = reasonOf(input, "รวมผู้ติดต่อ");
  const a = await enter(ctx, actor);
  const keep = await loadContact(ctx, a, input?.keepId, prisma, { live: true });
  const drop = await loadContact(ctx, a, input?.mergeId, prisma, { live: true });
  need(a, "crm.contact.merge");
  if (keep.id === drop.id) throw fail("VALIDATION", "เลือกผู้ติดต่อคนเดียวกันทั้งสองช่อง — เลือกคนที่จะรวมเป็นอีกคนหนึ่ง");
  const DIFF_MEMBER = "สองคนนี้เป็นสมาชิกคนละคนในระบบสมาชิก จึงรวมที่นี่ไม่ได้ — รวมสมาชิกที่หน้าระบบสมาชิกก่อน แล้วค่อยกลับมารวมผู้ติดต่อ";
  if (keep.memberCustomerId && drop.memberCustomerId && keep.memberCustomerId !== drop.memberCustomerId) throw fail("VALIDATION", DIFF_MEMBER);
  const choices = (isObj(input?.fieldChoices) ? input.fieldChoices : {}) as Partial<Record<MergeChoiceField, "keep" | "merge">>;
  const moved = { deals: 0, activities: 0, companies: 0, dealContacts: 0, files: 0, records: 0 };
  let customValuesMoved = 0; // CRM C1.10 ▸ ค่าฟิลด์กำหนดเองที่ย้ายมา (ลง audit) ◂
  // CRM C5.4-E ▸ L6-M3: ของที่ย้ายเพิ่ม (ลง audit — รูปผลลัพธ์ `moved` ของ REST คงเดิม) ◂
  const movedMore = { emails: 0, enrollments: 0, enrollmentsStopped: 0, scoreLogs: 0, scoreAdded: 0, webSessions: 0, clicks: 0, portalRequests: 0 };
  const seqSvc = await import("./sequences");
  const scoreSvc = await import("./scoring");
  let keepPartyAfter: string | null = keep.partyId;
  let memberRevoked: string[] = [];
  // ผลลัพธ์ที่จะผูกสมาชิก: หาระบบสมาชิกไว้ก่อนเปิด tx (ถอนความยินยอมใน tx ต้องไม่เปิด connection ที่สองระหว่างถือล็อก)
  const memberPlanned = keep.memberCustomerId ?? drop.memberCustomerId ?? null;
  const memberSystemPlanned = memberPlanned ? ((await consents.memberSystemOf(ctx.tenantId, memberPlanned))?.systemId ?? null) : null;
  try {
    await prisma.$transaction(async (tx) => {
      // ลำดับล็อก: engine (keep) → แถวบริษัทของทั้งสองคน → แถวผู้ติดต่อทั้งสอง (เรียง id)
      await (await engine()).lockRecordForFieldWrite(tx, keep.id);
      // บทบาทในบริษัท: บริการบริษัทล็อกแถวบริษัทที่แตะ (เรียง id) → แถวผู้ติดต่อทั้งสอง แล้วย้าย/ลบแถวชน + คำนวณแคชใหม่
      moved.companies = (await companies.transferContactLinksInTx(tx, coCtx(ctx), drop.id, keep.id)).moved;
      await lockContactRows(tx, ctx, [keep.id, drop.id]);
      const k = await tx.crmContact.findFirst({ where: { ...identityScope(ctx), id: keep.id } });
      const m = await tx.crmContact.findFirst({ where: { ...identityScope(ctx), id: drop.id } });
      if (!k || !m) throw fail("NOT_FOUND", NOT_FOUND_MSG);
      if (k.mergedIntoId || m.mergedIntoId) throw fail("VALIDATION", MERGED_MSG);
      if (k.archivedAt || m.archivedAt) throw fail("VALIDATION", ARCHIVED_MSG);
      if (k.memberCustomerId && m.memberCustomerId && k.memberCustomerId !== m.memberCustomerId) throw fail("VALIDATION", DIFF_MEMBER);
      // รีวิว C1.4 S2: Party สองรายที่ผูกกับ "สมาชิกคนละคน" หรือ "ผู้ติดต่อบัญชีคนละรายในสมุดเดียวกัน" = คนละคนในโมดูลอื่น
      //   ⇒ ไม่รวมเงียบ ๆ (การรวม Party จะเอาตัวตนของสองคนมาทับกัน) — นับอย่างเดียวใน tx (เหตุผลเดียวกับ isSolePartyHolder)
      if (k.partyId && m.partyId && k.partyId !== m.partyId) {
        const pids = [k.partyId, m.partyId];
        const custs = await tx.customer.findMany({ where: { tenantId: ctx.tenantId, partyId: { in: pids }, mergedIntoId: null }, select: { id: true, partyId: true } });
        const kc = new Set(custs.filter((c) => c.partyId === k.partyId).map((c) => c.id));
        const mc = custs.filter((c) => c.partyId === m.partyId).map((c) => c.id);
        if (kc.size > 0 && mc.some((id) => !kc.has(id))) throw fail("VALIDATION", DIFF_MEMBER);
        const accs = await tx.accountContact.findMany({ where: { tenantId: ctx.tenantId, partyId: { in: pids }, mergedIntoId: null }, select: { id: true, systemId: true, partyId: true } });
        for (const sys of new Set(accs.map((x) => x.systemId))) {
          const ka = new Set(accs.filter((x) => x.systemId === sys && x.partyId === k.partyId).map((x) => x.id));
          const ma = accs.filter((x) => x.systemId === sys && x.partyId === m.partyId).map((x) => x.id);
          if (ka.size > 0 && ma.some((id) => !ka.has(id))) {
            throw fail("VALIDATION", "สองคนนี้เป็นผู้ติดต่อคนละรายในสมุดบัญชีเดียวกัน จึงรวมที่นี่ไม่ได้ — รวมผู้ติดต่อซ้ำที่หน้าระบบบัญชีก่อน แล้วค่อยกลับมารวมผู้ติดต่อ");
          }
        }
      }
      const now = new Date();

      // ผู้ร่วมดีล (unique dealId+contactId — ชน/เป็นดีลของคนที่เก็บไว้เอง = ทิ้งแถวของคนที่ถูกรวม)
      const mDc = await tx.crmDealContact.findMany({ where: { tenantId: ctx.tenantId, contactId: m.id }, include: { deal: { select: { contactId: true } } } });
      for (const dc of mDc) {
        const clash = await tx.crmDealContact.findUnique({ where: { dealId_contactId: { dealId: dc.dealId, contactId: k.id } }, select: { id: true } });
        if (clash || dc.deal.contactId === k.id || dc.deal.contactId === m.id) await tx.crmDealContact.delete({ where: { id: dc.id } });
        else await tx.crmDealContact.update({ where: { id: dc.id }, data: { contactId: k.id } });
        moved.dealContacts += 1;
      }
      moved.deals = (await tx.crmDeal.updateMany({ where: { ...identityScope(ctx), contactId: m.id }, data: { contactId: k.id } })).count;
      moved.activities = (await tx.crmActivity.updateMany({ where: { ...identityScope(ctx), contactId: m.id }, data: { contactId: k.id } })).count;
      moved.files = (await tx.crmFileLink.updateMany({ where: { ...identityScope(ctx), entityType: "CONTACT", entityId: m.id }, data: { entityId: k.id } })).count;
      // CRM C1.10 ▸ หนี้ C1.4 (S11.6): ค่าฟิลด์กำหนดเองของคนที่ถูกรวม ย้ายมาที่คนที่เก็บไว้ **เฉพาะฟิลด์ที่คนที่เก็บไว้ยังไม่มีค่า**
      //   (ค่าของคนที่เก็บไว้ชนะเสมอ) · คำสั่งเดียวใน tx เดียวกัน (unique recordId+fieldId ไม่ชนเพราะ NOT EXISTS) · engine ล็อก keep ไว้แล้ว
      customValuesMoved = await tx.$executeRaw`
        UPDATE "CustomRecordValue" v SET "recordId" = ${k.id}
        WHERE v."tenantId" = ${ctx.tenantId} AND v."recordType" = 'CONTACT' AND v."recordId" = ${m.id}
          AND NOT EXISTS (SELECT 1 FROM "CustomRecordValue" kv WHERE kv."recordId" = ${k.id} AND kv."fieldId" = v."fieldId")`;
      // ◂ CRM C1.10
      // CRM C5.4-E ▸ L6-M3 (พิมพ์เขียว §11.1/§5.2): ของที่ผูกกับคนที่ถูกรวมย้ายมาที่คนที่เก็บไว้ครบ — อีเมล (ไทม์ไลน์/เธรดไม่แยกสองแถว) ·
      //   ลำดับการติดตาม (คง ACTIVE เดียวต่อลำดับ — ตัวรันไม่หยุดเป็น CONTACT_GONE) · แต้มคะแนน (+ คะแนนรวม) · การเข้าชมเว็บ/คลิกลิงก์ ·
      //   คำขอจากพอร์ทัล · ใน tx เดียวกับการรวม (ล้ม = ย้อนทั้งก้อน) ◂
      movedMore.emails = (await tx.crmEmailMessage.updateMany({ where: { tenantId: ctx.tenantId, contactId: m.id }, data: { contactId: k.id } })).count;
      const enr = await seqSvc.transferEnrollmentsInTx(tx, ctx, m.id, k.id, now);
      movedMore.enrollments = enr.moved;
      movedMore.enrollmentsStopped = enr.stopped;
      const sc = await scoreSvc.transferScoreInTx(tx, ctx, m.id, k.id, now);
      movedMore.scoreLogs = sc.logs;
      movedMore.scoreAdded = sc.to - sc.from;
      movedMore.webSessions = (await tx.crmWebSession.updateMany({ where: { tenantId: ctx.tenantId, contactId: m.id }, data: { contactId: k.id } })).count;
      movedMore.clicks = (await tx.crmTrackedClick.updateMany({ where: { tenantId: ctx.tenantId, contactId: m.id }, data: { contactId: k.id } })).count;
      movedMore.portalRequests = (await tx.crmPortalRequest.updateMany({ where: { tenantId: ctx.tenantId, contactId: m.id }, data: { contactId: k.id } })).count;

      // ค่าของคนที่เก็บไว้: ผู้ใช้เลือก "merge" = ใช้ค่าของคนที่ถูกรวม · ค่าว่างของคนที่เก็บไว้ = เติมจากอีกฝั่ง
      const data: Prisma.CrmContactUpdateInput = {};
      const bag = data as Record<string, unknown>;
      for (const f of MERGE_CHOICE_FIELDS) {
        const kv = (k as Record<string, unknown>)[f] ?? null;
        const mv = (m as Record<string, unknown>)[f] ?? null;
        if ((choices[f] === "merge" && mv !== null) || (kv === null && mv !== null)) if (mv !== kv) bag[f] = mv;
      }
      const first = (bag.firstName as string | undefined) ?? k.firstName;
      const last = bag.lastName !== undefined ? (bag.lastName as string | null) : k.lastName;
      if (bag.firstName !== undefined || bag.lastName !== undefined) data.name = joinName(first, last) || k.name; // CRM C3.9 ▸ รีวิว S2 ↓ ◂
      if (typeof data.name === "string") assertNotReservedName(data.name);
      const nextEmail = bag.email !== undefined ? (bag.email as string | null) : k.email;
      const prevEmails = [...k.previousEmails, ...m.previousEmails, ...(k.email ? [k.email] : []), ...(m.email ? [m.email] : [])].filter((x) => x && x.toLowerCase() !== (nextEmail ?? "").toLowerCase());
      data.previousEmails = [...new Set(prevEmails)].slice(-20);
      data.tags = cleanTags([...k.tags, ...m.tags]).tags.slice(0, 50);
      if (!k.memberCustomerId && m.memberCustomerId) data.memberCustomerId = m.memberCustomerId;
      if (!k.ownerUserId && m.ownerUserId) {
        data.ownerUserId = m.ownerUserId;
        data.assignedAt = m.assignedAt ?? now;
        data.assignedBy = m.assignedBy;
      }
      if (m.lastActivityAt && (!k.lastActivityAt || m.lastActivityAt > k.lastActivityAt)) data.lastActivityAt = m.lastActivityAt;
      // AUDIT-CLASS X8: คนใดคนหนึ่งขอไม่รับข่าวสาร ⇒ คนที่เก็บไว้ไม่รับด้วย (ปลอดภัยไว้ก่อน) + แถวประวัติ
      if (m.marketingOptOut && !k.marketingOptOut) {
        data.marketingOptOut = true;
        await tx.crmContactConsent.create({ data: { tenantId: ctx.tenantId, systemId: k.systemId, contactId: k.id, channel: OPT_OUT_CHANNEL, granted: false, source: "STAFF", note: "รวมผู้ติดต่อ — อีกคนขอไม่รับข่าวสารไว้", createdById: actorId(ctx), createdAt: now } });
      }
      if (m.emailOptOut && !k.emailOptOut) data.emailOptOut = true;
      // CRM C5.4-B ▸ L5-M4: "ไม่ให้ติดตาม" ตามมาด้วย (เข้มสุดชนะ — เหมือนธงขอไม่รับ)
      if (m.trackingOptOut && !k.trackingOptOut) data.trackingOptOut = true;
      // B1 (c) (รีวิว C1.4 · "เข้มสุดชนะ"): ความยินยอมที่คนถูกรวม **ถอนไว้** ตามมาที่คนที่เก็บไว้ — ไม่มีวันให้เพิ่ม
      //   ผลลัพธ์ไม่ผูกสมาชิก ⇒ เพิ่มแถวถอนฝั่ง CRM (append-only) · ผูกสมาชิก ⇒ ถอนบนสมาชิกผ่าน facade หลัง commit
      //   (ใช้เฉพาะฝั่งที่ความจริงอยู่ใน CRM — ผู้ติดต่อที่ผูกสมาชิกอยู่แล้วมีสมาชิกเป็นแหล่งเดียว)
      const dropRevs = m.memberCustomerId ? [] : await consents.crmRevocations(tx, ctx.tenantId, m);
      const keepRevs = k.memberCustomerId ? [] : await consents.crmRevocations(tx, ctx.tenantId, k);
      const memberAfter = k.memberCustomerId ?? m.memberCustomerId ?? null;
      if (memberAfter) {
        if (memberAfter !== memberPlanned) throw fail("CONFLICT", "ผู้ติดต่อคนใดคนหนึ่งเพิ่งถูกผูกกับสมาชิกระหว่างรวม — รีเฟรชหน้าแล้วลองใหม่");
        // มติผู้คุมงาน C1.4 (atomic): ถอนบนสมาชิกใน tx เดียวกัน (ลำดับล็อก: แถว CrmContact → แถว Customer) · ไม่ได้ = รวมทั้งก้อนย้อนกลับ
        const memberRevs = [...new Set([...dropRevs, ...keepRevs])].sort();
        try {
          memberRevoked = (await consents.revokeOnMember(ctx, a, memberAfter, memberRevs, { tx, memberSystemId: memberSystemPlanned })).revoked;
        } catch {
          throw fail("CONFLICT", "ถอนความยินยอมในระบบสมาชิกไม่สำเร็จ ระบบจึงยกเลิกการรวมทั้งหมดให้แล้ว (ข้อมูลไม่เปลี่ยน) — ลองใหม่อีกครั้ง");
        }
      } else if (dropRevs.length > 0) {
        const keepNow = await consents.latestCrmStates(tx, ctx.tenantId, k.id);
        for (const ch of dropRevs) {
          if (keepNow.get(ch)?.granted === false) continue;
          await tx.crmContactConsent.create({ data: { tenantId: ctx.tenantId, systemId: k.systemId, contactId: k.id, channel: ch, granted: false, source: "STAFF", note: "รวมผู้ติดต่อ — อีกคนถอนความยินยอมช่องทางนี้ไว้", createdById: actorId(ctx), createdAt: now } });
        }
      }

      // Party: รวมเฉพาะ Party ชนิดคน · แล้วค่อยเขียนชื่อ/เบอร์/อีเมลที่เลือกลง Party ของคนที่เก็บไว้
      if (k.partyId && m.partyId && k.partyId !== m.partyId) {
        const [kp, mp] = await Promise.all([party.getProfile(ctx.tenantId, k.partyId, tx), party.getProfile(ctx.tenantId, m.partyId, tx)]);
        if (kp && mp && kp.kind !== "COMPANY" && mp.kind !== "COMPANY") await party.mergeParties(ctx.tenantId, k.partyId, m.partyId, tx);
      } else if (!k.partyId && m.partyId) {
        data.partyId = m.partyId;
      }
      const partyId = (data.partyId as string | undefined) ?? k.partyId;
      const nameChanged = data.name !== undefined;
      const phoneChanged = bag.phone !== undefined;
      const emailChanged = bag.email !== undefined;
      if (emailChanged) data.emailBouncedAt = m.emailBouncedAt; // อีเมลมาจากคนที่ถูกรวม = สถานะเด้งของอีเมลนั้น
      if (partyId && (nameChanged || phoneChanged || emailChanged)) {
        // รีวิว C1.4 S1: Party ที่ใช้ร่วมกับสมาชิก/บัญชี/ผู้ติดต่ออื่น ไม่ถูกแก้ — คนที่เก็บไว้ย้ายไป Party ของค่าใหม่แทน
        const np = await partyAfterChange(
          tx,
          ctx,
          partyId,
          { alsoPartyIds: m.partyId ? [m.partyId] : [], excludeContactIds: [k.id, m.id] },
          { name: (data.name as string | undefined) ?? k.name, phone: phoneChanged ? (bag.phone as string | null) : k.phone, email: nextEmail },
          { name: nameChanged, phone: phoneChanged, email: emailChanged },
        );
        if (np !== partyId) data.partyId = np;
      }
      keepPartyAfter = (data.partyId as string | undefined) ?? partyId ?? null;
      await tx.crmContact.update({ where: { id: k.id }, data });
      await tx.crmContact.update({ where: { id: m.id }, data: { mergedIntoId: k.id, archivedAt: now } });
      // CRM C3.5 ▸ (มติผู้คุมงาน S4) รวมผู้ติดต่อ ⇒ session พอร์ทัลของทั้งสองคนตาย + ต้องเชิญใหม่ (ตัวตนของคนที่เก็บไว้อาจเปลี่ยน) ◂
      await portalIdentityChangedInTx(tx, ctx.tenantId, [k.id, m.id]);
      await emitContactEvent(tx, ctx, "merged", m.id, newSeq(), { keptId: k.id, mergedId: m.id });
    }, { maxWait: 15_000, timeout: 60_000 });
  } catch (e) {
    throw mapError(e);
  }

  // ── หลัง commit: ส่วน CRM รวมเสร็จแล้ว — ขั้นต่อจากนี้ห้ามโยน (รายงานใน warnings) ──
  const warnings: string[] = [];
  try {
    const recs = await prisma.customRecord.findMany({
      where: { ...identityScope(ctx), parentType: "CONTACT", parentId: drop.id, archivedAt: null },
      select: { id: true, object: { select: { key: true } } },
      take: 5_000,
    });
    let failed = 0;
    for (const r of recs) {
      try {
        await objects.records.move(coCtx(ctx), a, r.object.key, r.id, keep.id);
        moved.records += 1;
      } catch {
        failed += 1;
      }
    }
    if (failed > 0) {
      warnings.push(`ย้ายรายการที่ผูกกับผู้ติดต่อที่ถูกรวมไม่สำเร็จ ${failed.toLocaleString("th-TH")} รายการ — ย้ายเองได้จากหน้ารายการนั้น`);
      await logOps("WARN", "crm.contacts", "รวมผู้ติดต่อแล้ว แต่ย้ายรายการวัตถุกำหนดเองบางรายการไม่สำเร็จ", { tenantId: ctx.tenantId, detail: `systemId=${ctx.systemId} merged=${drop.id} failed=${failed}` });
    }
  } catch {
    warnings.push("ยังไม่ได้ย้ายรายการที่ผูกกับผู้ติดต่อที่ถูกรวม — ย้ายเองได้จากหน้ารายการนั้น");
  }
  const auditBody = { keptId: keep.id, mergedId: drop.id, reason, moved, movedMore /* CRM C5.4-E */, customValuesMoved /* CRM C1.10 */, keepPartyId: keepPartyAfter, memberConsentRevoked: memberRevoked, warnings: warnings.length };
  if (memberPlanned && memberRevoked.length > 0) {
    await writeAudit({ tenantId: ctx.tenantId, actorId: actorId(ctx), action: "member.privacy.consent", targetType: "Customer", targetId: memberPlanned, after: { revoked: memberRevoked, granted: false, source: "STAFF", via: "crm.contact.merge" } });
  }
  await writeAudit({ tenantId: ctx.tenantId, actorId: actorId(ctx), action: "crm.contact.merge", targetType: "CrmContact", targetId: keep.id, after: auditBody });
  await writeAudit({ tenantId: ctx.tenantId, actorId: actorId(ctx), action: "crm.contact.merged", targetType: "CrmContact", targetId: drop.id, before: { mergedIntoId: null }, after: auditBody });
  return { keptId: keep.id, mergedId: drop.id, moved, warnings };
}

// ═════════════════════════ นำเข้า ═════════════════════════

const importMessage = (e: unknown): string => {
  const m = mapError(e);
  // AUDIT-CLASS X8: ข้อความของแถวเสียเก็บลง audit/ส่งกลับหน้าจอ — ปิดบังเบอร์/อีเมลที่ตัวตรวจยกมาอ้าง
  if (m instanceof ContactsError) return maskPii(m.message);
  return "บันทึกแถวนี้ไม่สำเร็จ ระบบข้ามแถวนี้ให้แล้ว — ตรวจข้อมูลในแถวแล้วนำเข้าอีกครั้ง";
};

/**
 * นำเข้าผู้ติดต่อ (มติผู้คุมงาน C1.4 ข้อ 4): ผลตอบกลับทันที + `jobId` (อ่านย้อนได้ด้วย getImportJob) · ทีละชุด 200 แถว
 * AUDIT-CLASS X6: เพดานแถว/ขนาดตรวจ **ก่อนเขียนอะไรทั้งหมด** · ค่าที่ขึ้นต้น = + - @ เก็บเป็นข้อความตามที่พิมพ์ (ไม่ประเมิน ไม่ทิ้ง) ·
 *   แถวเสียรายงานพร้อมเลขแถว (ไม่โยน) · audit เขียนใน finally เสมอ (สำเร็จ/ล้มกลางทางก็มีร่องรอย)
 * ซ้ำ (เบอร์/อีเมลในระบบนี้): update = เติมค่าที่ส่งมาลงคนเดิม · skip = ข้าม · candidate = สร้างใหม่แล้วนับเป็นคู่สงสัยซ้ำ
 */
export async function importContacts(ctx: ContactsCtx, actor: MemberActor, input: ImportContactsInput): Promise<ImportJob> {
  const rows = Array.isArray(input?.rows) ? input.rows : null;
  if (!rows) throw fail("VALIDATION", "ไม่พบข้อมูลแถวที่จะนำเข้า — เลือกไฟล์อีกครั้ง");
  if (rows.length > CONTACT_IMPORT_MAX_ROWS) {
    throw fail("VALIDATION", `ไฟล์มี ${rows.length.toLocaleString("th-TH")} แถว — นำเข้าได้ครั้งละไม่เกิน ${CONTACT_IMPORT_MAX_ROWS.toLocaleString("th-TH")} แถว แบ่งไฟล์แล้วนำเข้าทีละส่วน`);
  }
  const bytes = Buffer.byteLength(JSON.stringify(rows), "utf8");
  if (bytes > CONTACT_IMPORT_MAX_BYTES) throw fail("VALIDATION", "ไฟล์ใหญ่เกิน 10 MB — แบ่งไฟล์แล้วนำเข้าทีละส่วน");
  // รีวิว C1.4 S4: นำเข้าแบบตอบผลทันทีรับได้ครั้งละไม่เกิน CONTACT_IMPORT_INLINE_MAX_ROWS (งานเบื้องหลังจริงมากับ C2.0)
  if (rows.length > CONTACT_IMPORT_INLINE_MAX_ROWS) {
    throw fail("VALIDATION", `ตอนนี้นำเข้าได้ครั้งละไม่เกิน ${CONTACT_IMPORT_INLINE_MAX_ROWS.toLocaleString("th-TH")} แถว — แบ่งไฟล์ (${rows.length.toLocaleString("th-TH")} แถว) เป็นหลายไฟล์แล้วนำเข้าทีละไฟล์`);
  }
  const mapping = isObj(input?.mapping) ? input.mapping : {};
  const targets = Object.entries(mapping).filter(([, t]) => typeof t === "string" && t !== "") as [string, string][];
  for (const [header, t] of targets) {
    if (!(IMPORT_TARGETS as readonly string[]).includes(t) && !/^f\.[A-Za-z][A-Za-z0-9_]{0,63}$/.test(t)) {
      throw fail("VALIDATION", `คอลัมน์ "${header.slice(0, 40)}" จับคู่กับช่องที่ระบบไม่รู้จัก — เลือกช่องใหม่`);
    }
  }
  // CRM C1.11 ▸ (รีวิว SF-4) `f.<key>` ของฟิลด์ระบบ (ชื่อ/เบอร์/อีเมล/ตำแหน่ง/แผนก/LINE/คำนำหน้า … และคอลัมน์ที่บริการเป็นเจ้าของ) ไม่ใช่ช่องกำหนดเอง
  //   — ต้องจับคู่กับช่องของมันเอง (ที่ "อัปเดตคนเดิม" เติมเฉพาะช่องว่าง) ไม่งั้นทางลัดนี้จะเขียนทับค่าที่มีอยู่ได้ ◂
  const governedKeys = (await engine()).GOVERNED_CRM_SYSTEM_KEYS.contact;
  for (const [header, t] of targets) {
    const k = t.startsWith("f.") ? t.slice(2) : "";
    if (k && ((ROUTED_FIELD_KEYS as readonly string[]).includes(k) || governedKeys.has(k))) {
      throw fail("VALIDATION", `คอลัมน์ "${header.slice(0, 40)}" จับคู่กับฟิลด์ระบบ "${k}" แบบฟิลด์กำหนดเอง — เลือกช่องของมันโดยตรงจากรายการแทน`);
    }
  }
  if (!targets.some(([, t]) => t === "firstName" || t === "lastName")) throw fail("VALIDATION", "จับคู่คอลัมน์ชื่อก่อน (ชื่อจริง หรือ นามสกุล) — ระบบต้องรู้ว่าคอลัมน์ไหนคือชื่อ");
  const modeRaw = str(input?.options?.onDuplicate) ?? "skip";
  if (!(IMPORT_DUPLICATE_MODES as readonly string[]).includes(modeRaw)) throw fail("VALIDATION", "เลือกวิธีจัดการแถวที่ซ้ำ: อัปเดตคนเดิม · ข้าม · สร้างเป็นคู่สงสัยซ้ำ");
  const mode = modeRaw as ImportDuplicateMode;
  const sourceKind = parseSource(input?.options?.source) ?? "IMPORT";
  const a = await enter(ctx, actor);
  need(a, "crm.contact.import");
  await seedContactFields(ctx, a);

  const jobId = randomUUID();
  const importedOwners = new Map<string, number>(); // CRM C5.4-E r2 ▸ SF-3: ผู้ดูแล → จำนวน lead ที่ได้จากงานนี้ ◂
  const result: ImportContactsResult = { created: 0, updated: 0, skipped: 0, candidates: 0, failed: 0, errors: [] };
  let status: ImportJobStatus = "RUNNING";
  const companyIds = new Map<string, string>();
  // CRM C5.5-fix6 r2 ▸ F6-1 (นำเข้า): ขั้นผูกบริษัทของแถวที่เพิ่ม/อัปเดตผู้ติดต่อสำเร็จแล้ว ล้มได้โดยไม่ทำให้แถวนั้นนับเป็น "มีปัญหา" ซ้ำ
  //   (เดิม: createCompany โยน ⇒ แถวเดียวนับทั้ง created และ failed · linkCompany ล้ม ⇒ เงียบ) — บอกเป็นหมายเหตุของแถว (ไม่นับ failed) ·
  //   ผูกบริษัทไม่ได้ (crmCanLinkCompany ไม่ผ่าน) = ไม่ค้น/ไม่สร้างบริษัทเลย (ไม่มีบริษัทกำพร้า) + บอกครั้งเดียว ◂
  const canLink = crmCanLinkCompany(a);
  let linkDeniedNoted = false;
  // CRM C5.5-fix7 ▸ R2F-3: แถวที่ล้มจริง (นับใน failed) กับหมายเหตุของแถวที่บันทึกแล้ว แยกกองกัน · ต่อกันตอนจบโดยแถวที่ล้มขึ้นก่อน ⇒
  //   หมายเหตุจำนวนมาก (เช่น ทุกแถวผูกบริษัทไม่ได้) ดันแถวที่ล้มจริงออกจากเพดาน 500 / 50 แถวแรกที่หน้าจอและ audit เก็บไม่ได้ ·
  //   แต่ละรายการบอก `kind` ("error" | "note") — ช่อง row/message เดิมครบ (เพิ่มอย่างเดียว) ◂
  const fails: ImportResultEntry[] = [];
  const notes: ImportResultEntry[] = [];
  const addNote = (row: number, message: string) => {
    if (notes.length < CONTACT_IMPORT_ERRORS_MAX) notes.push({ row, message, kind: "note" });
  };
  const linkRow = async (companyName: string, contactId: string, rowNo: number, done: string): Promise<void> => {
    if (!canLink) {
      if (!linkDeniedNoted) addNote(rowNo, `${done}แล้ว แต่ไม่ได้ผูกบริษัทให้แถวที่มีชื่อบริษัท — ${crmForbiddenMessage(crmCan(a, "crm.company.read") ? "crm.company.update" : "crm.company.read")}`);
      linkDeniedNoted = true;
      return;
    }
    try {
      const coId = await companyFor(companyName);
      const w = coId ? await linkCompany(ctx, a, coId, contactId, false) : null;
      if (w) addNote(rowNo, `${done}แล้ว แต่${w}`);
    } catch (e) {
      addNote(rowNo, `${done}แล้ว แต่ผูกบริษัทไม่สำเร็จ — ${importMessage(e)}`);
    }
  };
  const addError = (row: number, message: string) => {
    result.failed += 1;
    if (fails.length < CONTACT_IMPORT_ERRORS_MAX) fails.push({ row, message, kind: "error" });
  };

  const companyFor = async (name: string): Promise<string | null> => {
    const k = name.trim();
    if (!k) return null;
    const hit = companyIds.get(k);
    if (hit) return hit;
    const existing = (await companies.companyOptions(coCtx(ctx), a, { q: k })).find((c) => c.name === k) ?? null;
    const id = existing?.id ?? (await companies.createCompany(coCtx(ctx), a, { name: k }).then((r) => r.company.id || r.duplicateOf || null));
    if (id) companyIds.set(k, id);
    return id ?? null;
  };

  const importOne = async (raw: Record<string, unknown>, rowNo: number): Promise<void> => {
    const vals: Record<string, string> = {};
    const custom: Record<string, unknown> = {};
    for (const [header, t] of targets) {
      const v = raw?.[header];
      const s = v === null || v === undefined ? "" : String(v).trim();
      if (!s) continue;
      if (t.startsWith("f.")) custom[t.slice(2)] = s;
      else vals[t] = s;
    }
    if (!vals.firstName && !vals.lastName && !vals.phone && !vals.email) {
      addError(rowNo, "แถวนี้ว่าง (ไม่มีชื่อ เบอร์ หรืออีเมล) — ระบบข้ามให้แล้ว");
      return;
    }
    let first: string | null = vals.firstName ?? null;
    let last: string | null = vals.lastName ?? null;
    if (!first && last) {
      first = last;
      last = null;
    }
    const tags = vals.tags ? vals.tags.split(/[;,]/) : [];
    try {
      const clean = cleanCreate({ firstName: first ?? "", lastName: last, phone: vals.phone ?? null, email: vals.email ?? null, jobTitle: vals.jobTitle ?? null, tags, sourceKind });
      const companyName = vals.company ?? null;
      if (mode === "update") {
        const dup = await duplicateHits(prisma, ctx, { phone: clean.phone, email: clean.email });
        const target = dup.rows[0];
        if (target) {
          // CRM C1.11 ▸ มติผู้คุมงาน C1.11 ข้อ 6: "อัปเดตคนเดิม" = เติมเฉพาะช่องที่คนเดิมยังว่าง — ตัดสินใน tx ของการเขียน (updateContactCore fillBlanksOnly)
          const patch: UpdateContactPatch = {
            ...(vals.lastName ? { lastName: clean.lastName } : {}),
            ...(clean.email ? { email: clean.email } : {}),
            ...(clean.phone ? { phone: clean.phone } : {}),
            ...(vals.jobTitle ? { jobTitle: clean.jobTitle } : {}),
            ...(Object.keys(custom).length > 0 ? { fields: custom } : {}),
          };
          // ◂ CRM C1.11
          await updateContactCore(ctx, a, target.id, patch, true); // CRM C1.11 ◂
          if (clean.tags.length > 0) {
            const merged = cleanTags([...target.tags, ...clean.tags]);
            if (!merged.problem) await setTags(ctx, a, target.id, merged.tags);
          }
          result.updated += 1;
          if (companyName) await linkRow(companyName, target.id, rowNo, "อัปเดตผู้ติดต่อ");
          return;
        }
      }
      const res = await createCore(ctx, a, clean, { force: mode === "candidate", via: "IMPORT", custom, batchId: jobId });
      if (!res.created) {
        result.skipped += 1;
        return;
      }
      result.created += 1;
      if (res.row.ownerUserId) importedOwners.set(res.row.ownerUserId, (importedOwners.get(res.row.ownerUserId) ?? 0) + 1); // CRM C5.4-E r2 ▸ SF-3 ◂
      if (res.duplicates.length > 0) result.candidates += 1;
      if (companyName) await linkRow(companyName, res.row.id, rowNo, "เพิ่มผู้ติดต่อ");
    } catch (e) {
      addError(rowNo, importMessage(e));
    }
  };

  try {
    for (let start = 0; start < rows.length; start += CONTACT_IMPORT_BATCH) {
      const batch = rows.slice(start, start + CONTACT_IMPORT_BATCH);
      for (let i = 0; i < batch.length; i += 1) await importOne(batch[i] as Record<string, unknown>, start + i + 1);
    }
    status = "DONE";
  } catch (e) {
    status = "FAILED";
    addError(0, importMessage(e));
  } finally {
    result.errors = [...fails, ...notes].slice(0, CONTACT_IMPORT_ERRORS_MAX); // CRM C5.5-fix7 ▸ R2F-3 ◂
    await writeAudit({
      tenantId: ctx.tenantId,
      actorId: actorId(ctx),
      action: "crm.contact.import",
      targetType: "CrmSystem",
      targetId: ctx.systemId,
      after: { jobId, status, rows: rows.length, onDuplicate: mode, source: sourceKind, created: result.created, updated: result.updated, skipped: result.skipped, candidates: result.candidates, failed: result.failed, aborted: status === "FAILED", errors: result.errors.slice(0, 50) },
    });
  }
  // CRM C5.4-E r2 ▸ SF-3 (มติผู้คุมงาน): lead จากการนำเข้า = สรุป 1 ใบต่อผู้ดูแลต่องาน (ไม่แจ้งคนที่นำเข้าเองถึงตัวเอง) — ล้ม = ไม่กระทบผลนำเข้า ◂
  await (await import("./notify-senders")).leadsAssignedBatch(ctx, { batchId: jobId, actorUserId: actorId(ctx) ?? a.userId, owners: importedOwners }).catch(() => undefined);
  return { jobId, status, result };
}

/** สถานะ/ผลของงานนำเข้า (อ่านจากร่องรอย audit ของงานนั้น — ตาราง job จริงมากับ C2.0) */
export async function getImportJob(ctx: ContactsCtx, actor: MemberActor, jobId: string): Promise<ImportJob> {
  await enter(ctx, actor);
  const id = str(jobId);
  const row = id
    ? await prisma.auditLog.findFirst({ where: { tenantId: ctx.tenantId, action: "crm.contact.import", targetId: ctx.systemId, after: { path: ["jobId"], equals: id } }, select: { after: true } })
    : null;
  if (!row || !isObj(row.after)) throw fail("NOT_FOUND", "ไม่พบงานนำเข้านี้ในระบบ CRM นี้");
  const x = row.after;
  const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
  // CRM C5.5-fix7 ▸ R2F-3: แถว audit ก่อนใบนี้ไม่มี `kind` = รายการที่ล้ม (ก่อน fix6 r2 ไม่มีหมายเหตุ) ◂
  const errors: ImportResultEntry[] = Array.isArray(x.errors)
    ? (x.errors as { row?: unknown; message?: unknown; kind?: unknown }[]).map((e): ImportResultEntry => ({ row: Number(e?.row ?? 0), message: String(e?.message ?? ""), kind: e?.kind === "note" ? "note" : "error" }))
    : [];
  return {
    jobId: String(x.jobId),
    status: (x.status === "DONE" || x.status === "FAILED" || x.status === "RUNNING" ? x.status : "DONE") as ImportJobStatus,
    result: { created: n(x.created), updated: n(x.updated), skipped: n(x.skipped), candidates: n(x.candidates), failed: n(x.failed), errors },
  };
}
export const importStatus = getImportJob;

// ═════════════════════════ ส่งออก ═════════════════════════

/**
 * ส่งออก CSV (ยืนยัน + เหตุผล — AUDIT-CLASS X9) · ขอบเขตเดียวกับรายการ (contactWhere) · เพดาน CONTACT_EXPORT_MAX_ROWS (เกิน = ให้กรองให้แคบลง)
 * AUDIT-CLASS X6: ทุกบรรทัดผ่าน `csvRow` (ช่องที่ขึ้นต้น = + - @ ถูกทำให้เป็นข้อความ)
 * AUDIT-CLASS X8: ค่าฟิลด์อ่อนไหวของผู้ติดต่อผ่าน engine (D8 ตัดสินต่อคน · เห็นจริง = แถว MemberAccessLog page "crm.contact") ·
 *   ไม่ส่งออกข้อมูลของระบบสมาชิกที่ผูกไว้ (แค่รหัสอ้างอิง) — ข้อมูลอ่อนไหวของสมาชิกไม่มีทางหลุดผ่านไฟล์นี้
 */
export async function exportContacts(ctx: ContactsCtx, actor: MemberActor, opts: ContactListInput & DangerOpts = {}): Promise<string> {
  const reason = reasonOf(opts, "ส่งออกรายชื่อผู้ติดต่อ");
  const a = await enter(ctx, actor);
  need(a, "crm.contact.export");
  // CRM C5.1-fix ▸ F1: มีตัวกรองฟิลด์ = นับ/เลือก id ด้วย SQL แล้วอ่านแถวเป็นชุดละ ≤ 5,000 id (ไม่ติดเพดาน bind) ◂
  const flt = await effectiveListInput(ctx, a, opts ?? {});
  const sqlWhere = Object.keys(listFieldFilters(flt)).length > 0 ? await listSqlWhere(ctx, a, flt) : null;
  const where = sqlWhere ? null : await listWhereFrom(ctx, a, flt);
  const total = sqlWhere
    ? ((await prisma.$queryRaw<{ n: number }[]>`SELECT count(*)::int AS "n" FROM "CrmContact" c WHERE ${sqlWhere}`)[0]?.n ?? 0)
    : await prisma.crmContact.count({ where: where! });
  if (total > CONTACT_EXPORT_MAX_ROWS) {
    throw fail("VALIDATION", `ผลลัพธ์มี ${total.toLocaleString("th-TH")} คน — ส่งออกได้ครั้งละไม่เกิน ${CONTACT_EXPORT_MAX_ROWS.toLocaleString("th-TH")} คน กรองให้แคบลงก่อน`);
  }
  let rows: CrmContact[];
  if (sqlWhere) {
    const ids = await pageIdsSql(sqlWhere, [{ createdAt: "asc" }, { id: "asc" }], CONTACT_EXPORT_MAX_ROWS, null);
    rows = [];
    for (let i = 0; i < ids.length; i += 5_000) {
      const chunk = ids.slice(i, i + 5_000);
      rows.push(...inOrder(chunk, await prisma.crmContact.findMany({ where: { id: { in: chunk } } })));
    }
  } else {
    rows = await prisma.crmContact.findMany({ where: where!, orderBy: [{ createdAt: "asc" }, { id: "asc" }], take: CONTACT_EXPORT_MAX_ROWS });
  }
  const eng = await engine();
  const layout = await eng.listLayout(fctx(ctx, a));
  const customFields = layout.sections.flatMap((s) => s.fields.filter((f) => !f.isSystem).map((f) => ({ key: f.key, label: f.label, type: f.type, choices: f.options?.choices })));
  const values: Record<string, Record<string, unknown>> = {};
  if (customFields.length > 0) {
    for (let i = 0; i < rows.length; i += 500) Object.assign(values, await eng.getFieldValues(fctx(ctx, a), rows.slice(i, i + 500).map((r) => r.id)));
  }
  const coIds = [...new Set(rows.map((r) => r.companyId).filter((x): x is string => !!x))];
  const [cos, owners] = await Promise.all([
    companies.liveCompanyRefs(coCtx(ctx), a, coIds),
    ownerNames(ctx, rows.map((r) => r.ownerUserId)),
  ]);
  const coName = new Map(cos.map((c) => [c.id, c.name]));
  const header = ["ชื่อจริง", "นามสกุล", "เบอร์โทร", "อีเมล", "ตำแหน่ง", "บริษัท", "ขั้น", "สถานะ lead", "ผู้ดูแล", "แท็ก", "ที่มา", "ไม่รับข่าวสาร", "รหัสสมาชิกที่ผูก", "เพิ่มเมื่อ", ...customFields.map((f) => f.label)];
  const lines = [csvRow(header)];
  for (const r of rows) {
    const bag = values[r.id] ?? {};
    lines.push(
      csvRow([
        r.firstName ?? r.name,
        r.lastName,
        r.phone,
        r.email,
        r.jobTitle,
        (r.companyId ? coName.get(r.companyId) : null) ?? r.company,
        LIFECYCLE_LABEL[r.lifecycleStage as ContactLifecycle],
        LEAD_STATUS_LABEL[r.leadStatus as ContactLeadStatus],
        r.ownerUserId ? (owners.get(r.ownerUserId) ?? "") : "",
        r.tags.join("; "),
        r.sourceKind ? CONTACT_SOURCE_LABEL[r.sourceKind as ContactSource] : "",
        r.marketingOptOut ? "ใช่" : "",
        r.memberCustomerId ? "ผูกแล้ว" : "",
        r.createdAt.toISOString().slice(0, 10),
        ...customFields.map((f) => displayOf(f.type, bag[f.key] ?? null, f.choices, "export")),
      ]),
    );
  }
  await writeAudit({ tenantId: ctx.tenantId, actorId: actorId(ctx), action: "crm.contact.export", targetType: "CrmSystem", targetId: ctx.systemId, after: { reason, rows: rows.length, filters: { ...opts, q: opts?.q ? maskPii(opts.q) : opts?.q, confirm: undefined, reason: undefined } } });
  return `﻿${lines.join("\r\n")}\r\n`;
}

// ═════════════════════════ briefFor (facade ให้แชท/สมาชิก/บัญชี) ═════════════════════════

export type ContactBrief = {
  contactId: string;
  name: string;
  lifecycleStage: ContactLifecycle;
  leadStatus: ContactLeadStatus;
  scoreBand: ContactScoreBand | null;
  ownerUserId: string | null;
  companyId: string | null;
  companyName: string | null;
  memberCustomerId: string | null;
  openDealCount: number;
};

/**
 * การ์ดย่อของผู้ติดต่อในระบบ CRM นี้จาก contactId หรือ partyId (ไม่มีข้อมูลติดต่อ) — Party ของร้านอื่น/ระบบอื่น = null
 * CRM C1.8 ▸ (หนี้ C1.4) `actor` **บังคับ** และการอ่านผ่าน `contactWhere` (การมองเห็นของ C1.7) — ไม่มี actor / ลูกค้า = null
 *   มองไม่เห็นผู้ติดต่อ = null เหมือน "ไม่มี" (AUDIT-CLASS X1: ไม่บอกว่ามีอยู่นอกขอบเขต) ◂
 */
export async function briefFor(ctx: ContactsCtx, actor: MemberActor | null | undefined, key: { contactId?: string | null; partyId?: string | null }): Promise<ContactBrief | null> {
  if (!actor || actor.role === "CUSTOMER") return null;
  await resolveSystem(ctx);
  const cid = str(key?.contactId);
  const pid = str(key?.partyId);
  if (!cid && !pid) return null;
  let partyIds: string[] = [];
  if (!cid && pid) partyIds = [...new Set([pid, await party.resolveCanonical(ctx.tenantId, pid)])];
  const row = await prisma.crmContact.findFirst({
    where: { AND: [await contactWhere(ctx, actor), { ...identityScope(ctx), mergedIntoId: null, ...(cid ? { id: cid } : { partyId: { in: partyIds }, archivedAt: null }) }] },
    orderBy: [{ createdAt: "asc" }],
  });
  if (!row) return null;
  const open = await prisma.crmDeal.count({ where: { AND: [await dealWhere(ctx, actor), { ...identityScope(ctx), contactId: row.id, kind: "OPEN" }] } });
  return {
    contactId: row.id,
    name: contactLabel(row),
    lifecycleStage: row.lifecycleStage as ContactLifecycle,
    leadStatus: row.leadStatus as ContactLeadStatus,
    scoreBand: (row.scoreBand as ContactScoreBand | null) ?? null,
    ownerUserId: row.ownerUserId,
    companyId: row.companyId,
    companyName: row.company ?? null,
    memberCustomerId: row.memberCustomerId,
    openDealCount: open,
  };
}

// CRM C1.8 ▸ ทางเข้าของสะพาน (composition root `src/lib/platform/crm-bridges/`) — ไม่มี actor คน · ผู้เรียกตัดสินประตูมาก่อนแล้ว
//   (uiVersion · bridgesEnabled · ระบบปลายทาง `resolveFormCrmSystem`) · ที่นี่ resolve ระบบ CRM ของร้านใหม่เสมอ (AUDIT-CLASS X1)

export type BridgeLeadKind =
  /** ฟอร์ม v2: ผู้ติดต่อเดิม (อีเมลไม่สนตัวพิมพ์ / เบอร์) = ใช้ตัวเดิม · ไม่มี = lead ใหม่ · กิจกรรม WEB 1 รายการต่อคำตอบ */
  | "FORM"
  /** ฟอร์มของระบบ uiVersion 1: พฤติกรรม v1 เดิม — ผู้ติดต่อใหม่ 1 รายต่อคำตอบ (ไม่จับคู่ตัวซ้ำ · ไม่มีกิจกรรม) */
  | "FORM_V1"
  /** แชท: ผู้ติดต่อของ Party นี้มีแล้ว = ตัวเดิม · ไม่มี = lead ใหม่ที่ผูก Party ของห้องแชท (ไม่มีกิจกรรมต่อข้อความ) */
  | "CHAT"
  // CRM C2.5 ▸ อีเมลขาเข้าจากคนแปลกหน้า (`crm/emails.ts#ingestInbound` · สวิตช์ `settings.crm.email.strangerToLead`):
  //   ผู้ติดต่อที่อีเมลนี้มีแล้ว = ตัวเดิม · ไม่มี = lead ใหม่ (`source`/`sourceChannel` = EMAIL · leadStatus NEW)
  //   ไม่มีกิจกรรมที่นี่ — กิจกรรม EMAIL/IN ถูกเขียนโดยตัวเก็บจดหมายในธุรกรรมของแถวจดหมายเอง
  /** อีเมล: จับคู่ด้วยอีเมลของผู้ส่ง (ไม่สนตัวพิมพ์) — `email` บังคับ ◂ */
  | "EMAIL";

export type BridgeLeadInput = {
  kind: BridgeLeadKind;
  /** ชื่อตามที่ลูกค้าพิมพ์/ชื่อที่แชทรู้ (ว่าง = CONTACT_NAME_PLACEHOLDER) */
  name: string | null;
  phone?: string | null;
  email?: string | null;
  /** CHAT: Party ของผู้ติดต่อแชท (บังคับ) */
  partyId?: string | null;
  /** FORM/FORM_V1: คำตอบฟอร์มที่ทำให้เกิด (บังคับ — เป็น "ธง" ของการประมวลผลครั้งเดียว) */
  submissionId?: string | null;
  sourceDetail?: Record<string, unknown> | null;
  /** FORM: หัวเรื่องกิจกรรม (ไม่มีข้อมูลบุคคล) */
  activityTitle?: string | null;
  // CRM C2.3 ▸ ภาษาที่ลูกค้าใช้ (ถ้าสะพานรู้ เช่น `ChatContact.lang` / คำตอบช่องภาษาของฟอร์ม) — ลงคอลัมน์ `locale` และเข้าเงื่อนไข "ภาษา" ของกฎ
  locale?: string | null;
  /**
   * CRM C2.3 ▸ ค่าฟิลด์กำหนดเองที่มากับสะพาน (คีย์ = key ของฟิลด์) — ไหลเข้าทางเดียวกับ `createContact({ fields })`
   * 🔴 การ "จับคู่คำตอบฟอร์ม → ฟิลด์กำหนดเอง" เป็นของใบ C2.6 · ที่นี่แค่เปิดทางให้ค่าที่ผู้เรียกจับคู่มาแล้วไม่ตกหาย ◂
   */
  fields?: Record<string, unknown> | null;
  // CRM C2.6 ▸ กฎมอบหมายที่ต้นทางระบุ (`FormDef.assignRuleId`) — ส่งตรงเข้า `assignment.pick` ◂
  ruleId?: string | null;
  // CRM C1.11 ▸ (รีวิว SF-6) คนกดเอง (ปุ่ม "สร้าง lead จากแชท") — audit เป็น USER คนนี้ · ไม่ส่ง = SYSTEM (สะพานอัตโนมัติ) ◂
  actorUserId?: string | null;
  /** ช่องทางที่บันทึกใน audit (`after.via`) — ไม่ส่ง = "bridge" */
  via?: "chat-panel" | null;
};

export type BridgeLeadResult = {
  contactId: string;
  /** สร้างผู้ติดต่อใหม่ในรอบนี้ */
  created: boolean;
  /** event เดิมถูกประมวลผลไปแล้ว (ส่งซ้ำ) — ไม่มีอะไรถูกเขียนในรอบนี้ */
  repeated: boolean;
  memberCustomerId: string | null;
};

const formsFacade = () => import("@/lib/modules/forms");

/**
 * ลีดจากสะพาน (ฟอร์ม/แชท) — ธุรกรรมเดียว: advisory lock (ธง + ตัวตน) → ตรวจธง → จับคู่/สร้างผู้ติดต่อ → กิจกรรม → ผูกธง → event
 * AUDIT-CLASS X4 (H5): ธงของฟอร์ม (ทั้ง v1 และ v2) = `FormSubmission.crmContactId` อ่าน/เขียนผ่าน facade ฟอร์ม **ใน tx เดียวกัน**
 *   ใต้ล็อก `crm:bridge-lead:<ระบบ>:forms.submission#<คำตอบ>` · ธงของแชท = ผู้ติดต่อที่ยังใช้งานของ Party (canonical) ใต้ล็อก
 *   `crm:contact-party:<ระบบ>:<Party canonical>` ⇒ ส่งซ้ำ/พร้อมกันกี่รอบ = ผลครั้งเดียว · ล้มกลางทาง = ไม่มีอะไรถูกเขียนเลย (คิวส่งใหม่ได้)
 * AUDIT-CLASS X3: ฟอร์มทั้ง v1 และ v2 ถือล็อกตัวตน (`crm:contact-ident:*` เรียงคีย์) ก่อน `personParty` ⇒ เบอร์/อีเมลเดียวกันพร้อมกัน
 *   (คนละโพรเซส) = Party เดียว · v2 = ผู้ติดต่อเดียว + กิจกรรมตามจำนวนคำตอบ
 * แถวผู้ติดต่อเขียนผ่าน `insertContactInTx` (ตัวเดียวกับ createContact: assignment.pick · ผู้ดูแล · crm.contact.assigned) ·
 *   กิจกรรมผ่าน `activities.recordSystemActivityInTx` (ไม่ยิง crm.activity.logged — กันไทม์ไลน์ซ้ำ) · audit ทั้งสองแถวหลัง commit
 * AUDIT-CLASS X8: ไม่ log ชื่อ/เบอร์/อีเมล · event เป็น id ล้วน
 */
export async function leadFromBridge(ctx: ContactsCtx, input: BridgeLeadInput): Promise<BridgeLeadResult> {
  await resolveSystem(ctx);
  const kind = input?.kind;
  const subId = str(input?.submissionId);
  const partyIn = str(input?.partyId);
  if ((kind === "FORM" || kind === "FORM_V1") && !subId) throw fail("VALIDATION", "ไม่พบรหัสคำตอบของฟอร์ม — ข้ามรายการนี้");
  if (kind === "CHAT" && !partyIn) throw fail("VALIDATION", "ไม่พบตัวตนกลางของผู้ติดต่อแชท — ข้ามรายการนี้");
  // CRM C2.5 ▸ ทางอีเมลต้องมีอีเมลของผู้ส่ง (ตัวจับคู่/กุญแจกันซ้ำของทางนี้คืออีเมล) ◂
  if (kind === "EMAIL" && !str(input?.email)) throw fail("VALIDATION", "ไม่พบอีเมลของผู้ส่ง — ข้ามรายการนี้");
  const sourceWord = kind === "CHAT" ? null : kind === "EMAIL" ? "EMAIL" : "FORM";
  const base = legacyCreateArgs({ name: str(input?.name) ?? CONTACT_NAME_PLACEHOLDER, phone: input?.phone ?? null, email: input?.email ?? null, source: sourceWord }, null);
  const clean: CreateClean = {
    ...base.clean,
    sourceKind: kind === "CHAT" ? "CHAT" : kind === "EMAIL" ? "OTHER" : "WEB_FORM",
    // CRM C2.5 ▸ ช่องทางที่มาของ lead จากอีเมล (ทะเบียนช่องทางกลาง D19 มี EMAIL อยู่แล้ว) ◂
    sourceChannel: kind === "EMAIL" ? "EMAIL" : base.clean.sourceChannel,
    // CRM C3.7 ▸ `via` ของแผงแชทเป็นค่าคงที่ในชนิด ("chat-panel") ⇒ ส่งเป็นที่มาที่เชื่อถือได้ · `sourceDetail.via` ที่มากับ input ถูกทิ้ง ◂
    sourceDetail: cleanSourceDetail(input?.sourceDetail ?? null, input?.via === "chat-panel" ? { via: "chat-panel" } : null),
    locale: cleanLocale(input?.locale ?? null), // CRM C2.3 ◂
  };
  // CRM C2.3 ▸ ค่าฟิลด์กำหนดเองที่สะพานจับคู่มาแล้ว (ไม่มี = {} เหมือนเดิม)
  //   🔴 เก็บเฉพาะคีย์ที่ร้านนี้ "มีฟิลด์นั้นจริง" (ไม่ใช่ฟิลด์ระบบ · ไม่เก็บเข้าคลัง) — คีย์ที่ไม่รู้จักถูกทิ้งเงียบ ๆ
  //      เพราะ engine จะปฏิเสธทั้งรายการ ⇒ **ลีดจากฟอร์ม/แชทจะหล่นหาย** เพียงเพราะการจับคู่ของใบ C2.6 ยังไม่ตรง ◂
  const bridgeCustom: Record<string, unknown> = {};
  if (isObj(input?.fields)) {
    const wanted = Object.keys(input.fields as Record<string, unknown>).slice(0, 50);
    const known = wanted.length
      ? new Set(
          (
            await prisma.memberField.findMany({
              where: { tenantId: ctx.tenantId, systemId: ctx.systemId, objectKey: "contact", key: { in: wanted }, isSystem: false, archivedAt: null },
              select: { key: true },
            })
          ).map((f) => f.key),
        )
      : new Set<string>();
    for (const k of wanted) if (known.has(k)) bridgeCustom[k] = (input.fields as Record<string, unknown>)[k];
  }
  const legacy = { ...base.legacy, source: sourceWord, note: kind === "CHAT" ? null : base.legacy.note };
  const canonical = kind === "CHAT" ? await party.resolveCanonical(ctx.tenantId, partyIn as string) : null;
  const flagRef = kind === "CHAT" ? `chat.party#${canonical}` : kind === "EMAIL" ? `crm.email#${clean.email ?? ""}` : `forms.submission#${subId}`;
  // CRM C2.5 ▸ ทางอีเมลไม่เกี่ยวกับฟอร์ม — ไม่โหลด facade ฟอร์ม (และไม่ผูกธงคำตอบฟอร์ม) ◂
  const forms = kind === "CHAT" || kind === "EMAIL" ? null : await formsFacade();
  await seedContactFields(ctx, null);
  // CRM C2.3 ▸ สะพาน (ไม่มีคนสร้าง) = ทางอัตโนมัติ ⇒ อ่านสถานะลาก่อนเปิด tx · คนกดเอง (chat-panel) = คนนั้นเป็นผู้ดูแลตามเดิม ◂
  const leave = await autoLeave(ctx, null, clean, {});
  try {
    const out = await prisma.$transaction(async (tx) => {
      const keys = kind === "CHAT" ? [`crm:contact-party:${ctx.systemId}:${canonical}`] : [`crm:bridge-lead:${ctx.systemId}:${flagRef}`, ...identKeys(ctx, clean.phone, clean.email)];
      for (const k of [...new Set(keys)].sort()) await lockKey(tx, k);
      const memberOf = async (id: string) => (await tx.crmContact.findFirst({ where: { ...identityScope(ctx), id }, select: { memberCustomerId: true } }))?.memberCustomerId ?? null;

      // ── ธง ──
      let existing: CrmContact | null = null;
      if (kind === "EMAIL") {
        // CRM C2.5 ▸ กันซ้ำด้วย "ตัวตน" (อีเมลของผู้ส่ง) — ล็อก `crm:contact-ident:*` ถือไว้แล้วข้างบน
        //   ⇒ จดหมายของคนแปลกหน้าคนเดียวกันที่เข้ามาพร้อมกันหลายฉบับได้ lead **รายเดียว** ◂
        existing = (await duplicateHits(tx, ctx, { phone: clean.phone, email: clean.email })).rows[0] ?? null;
        if (existing) return { contactId: existing.id, created: false, repeated: true, memberCustomerId: existing.memberCustomerId, row: null, activity: null };
      } else if (forms) {
        const linked = await forms.submissionCrmContactId(tx, ctx.tenantId, subId as string);
        if (linked) return { contactId: linked, created: false, repeated: true, memberCustomerId: await memberOf(linked), row: null, activity: null };
        if (kind === "FORM") existing = (await duplicateHits(tx, ctx, { phone: clean.phone, email: clean.email })).rows[0] ?? null;
      } else {
        const hit = await tx.crmContact.findFirst({
          where: { ...identityScope(ctx), partyId: { in: [...new Set([partyIn as string, canonical as string])] }, mergedIntoId: null, archivedAt: null },
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
          select: { id: true, memberCustomerId: true },
        });
        if (hit) return { contactId: hit.id, created: false, repeated: true, memberCustomerId: hit.memberCustomerId, row: null, activity: null };
      }

      // ── ผู้ติดต่อ (ตัวเขียนเดียวกับ createContact) ──
      // CRM C2.3 ▸ `fields` ของสะพานไหลเข้า engine ฟิลด์ทางเดียวกับ createContact (ไม่ส่ง = ไม่มีอะไรเปลี่ยน) ◂
      const row =
        existing ??
        (await insertContactInTx(tx, ctx, null, clean, {
          via: "API",
          legacy,
          partyId: kind === "CHAT" ? canonical : null,
          leave,
          custom: bridgeCustom /* CRM C2.3 ◂ */,
          ruleId: str(input?.ruleId) ?? null /* CRM C2.6 ◂ */,
        }));
      const created = !existing;

      // ── กิจกรรม (ฟอร์ม v2 · 1 รายการต่อคำตอบ) + ธงของฟอร์ม ──
      const activity =
        kind === "FORM"
          ? await recordSystemActivityInTx(tx, ctx, { type: "WEB", source: "WEB", sourceRef: flagRef, title: str(input?.activityTitle) ?? "ลูกค้ากรอกฟอร์มเข้ามา", contactId: row.id, companyId: row.companyId, dealId: null })
          : null;
      if (forms) await forms.linkSubmissionCrmContact(tx, ctx.tenantId, subId as string, row.id);
      return { contactId: row.id, created, repeated: false, memberCustomerId: row.memberCustomerId, row: created ? row : null, activity };
    }, TX_OPTS);
    if (out.row) {
      await writeAudit({
        tenantId: ctx.tenantId,
        // CRM C1.11 ▸ SF-6: คนกด = USER · สะพานอัตโนมัติ = SYSTEM ◂
        actorId: str(input?.actorUserId) ?? null,
        actorType: str(input?.actorUserId) ? "USER" : "SYSTEM",
        action: "crm.contact.create",
        targetType: "CrmContact",
        targetId: out.row.id,
        after: { partyId: out.row.partyId, ownerUserId: out.row.ownerUserId, sourceKind: out.row.sourceKind, via: input?.via === "chat-panel" ? "chat-panel" : "bridge", kind },
      });
    }
    if (out.activity) await auditSystemActivity(ctx, out.activity, kind === "FORM" ? "forms.submission.received" : "bridge");
    return { contactId: out.contactId, created: out.created, repeated: out.repeated, memberCustomerId: out.memberCustomerId };
  } catch (e) {
    throw mapError(e);
  }
}

/**
 * `member.created` → ผู้ติดต่อที่ยังใช้งานของระบบนี้ที่ Party เดียวกันและยังไม่ผูกสมาชิก ⇒ `memberCustomerId` (ผูกแล้ว = ไม่ทับ)
 * ผู้เรียก (สะพาน) ตรวจประตู + สมาชิกเป็นของร้านนี้มาแล้ว · AUDIT-CLASS X4: advisory lock ต่อ (ระบบ, Party) + conditional updateMany ·
 * event `crm.contact.updated#<id>#member-<สมาชิก>` + แถว audit เฉพาะแถวที่เปลี่ยนจริง · คืนจำนวนที่ผูก
 */
export async function linkMemberFromBridge(ctx: { tenantId: string; systemId: string }, input: { customerId: string; partyIds: string[] }): Promise<number> {
  const c: ContactsCtx = { tenantId: ctx.tenantId, systemId: ctx.systemId, actorUserId: null };
  const customerId = str(input?.customerId);
  const partyIds = [...new Set((input?.partyIds ?? []).filter((x): x is string => typeof x === "string" && !!x))].sort();
  if (!customerId || partyIds.length === 0) return 0;
  await resolveSystem(c);
  const changed = await prisma.$transaction(async (tx) => {
    for (const pid of partyIds) await lockKey(tx, `crm:member-link:${c.systemId}:${pid}`);
    const rows = await tx.crmContact.findMany({ where: { ...identityScope(c), partyId: { in: partyIds }, memberCustomerId: null, mergedIntoId: null }, select: { id: true } });
    const done: string[] = [];
    for (const r of rows) {
      const n = await tx.crmContact.updateMany({ where: { ...identityScope(c), id: r.id, memberCustomerId: null }, data: { memberCustomerId: customerId } });
      if (n.count !== 1) continue;
      done.push(r.id);
      await emitContactEvent(tx, c, "updated", r.id, `member-${customerId}`, { contactId: r.id, changedKeys: ["memberCustomerId"] });
    }
    return done;
  }, TX_OPTS);
  for (const id of changed) {
    await writeAudit({ tenantId: c.tenantId, actorId: null, actorType: "SYSTEM", action: "crm.contact.member.link", targetType: "CrmContact", targetId: id, after: { memberCustomerId: customerId, via: "member.created" } });
  }
  return changed.length;
}

/**
 * `member.merged` → ผู้ติดต่อของระบบนี้ที่ชี้สมาชิกที่ถูกรวม ⇒ ชี้ตัวที่เก็บไว้ (หนี้ C1.4 · canContact อ่านความยินยอมของตัวที่เหลือ)
 * AUDIT-CLASS X4: advisory lock ต่อ (ระบบ, สมาชิกที่ถูกรวม) + conditional updateMany · event + audit เฉพาะแถวที่เปลี่ยนจริง
 */
export async function repointMemberFromBridge(ctx: { tenantId: string; systemId: string }, input: { keepId: string; mergedId: string }): Promise<number> {
  const c: ContactsCtx = { tenantId: ctx.tenantId, systemId: ctx.systemId, actorUserId: null };
  const keepId = str(input?.keepId);
  const mergedId = str(input?.mergedId);
  if (!keepId || !mergedId || keepId === mergedId) return 0;
  await resolveSystem(c);
  const changed = await prisma.$transaction(async (tx) => {
    await lockKey(tx, `crm:member-merge:${c.systemId}:${mergedId}`);
    const rows = await tx.crmContact.findMany({ where: { ...identityScope(c), memberCustomerId: mergedId }, select: { id: true } });
    const done: string[] = [];
    for (const r of rows) {
      const n = await tx.crmContact.updateMany({ where: { ...identityScope(c), id: r.id, memberCustomerId: mergedId }, data: { memberCustomerId: keepId } });
      if (n.count !== 1) continue;
      done.push(r.id);
      await emitContactEvent(tx, c, "updated", r.id, `member-${keepId}`, { contactId: r.id, changedKeys: ["memberCustomerId"] });
    }
    return done;
  }, TX_OPTS);
  for (const id of changed) {
    await writeAudit({ tenantId: c.tenantId, actorId: null, actorType: "SYSTEM", action: "crm.contact.member.repoint", targetType: "CrmContact", targetId: id, after: { from: mergedId, to: keepId, via: "member.merged" } });
  }
  return changed.length;
}

/**
 * Party ชนิด "คน" จากเบอร์/อีเมล (ตรรกะเดียวกับ `personParty` — ไม่มีวันคืน Party บริษัท) ในธุรกรรมของตัวเอง ·
 * ผู้เรียก: สะพานแชท (ห้องที่ยังไม่รู้ว่าเป็นใคร) · AUDIT-CLASS X3: ล็อก Party ระดับร้านใน `personParty` ⇒ พร้อมกันกี่ทาง = Party เดียว
 * ไม่มีทั้งเบอร์และอีเมล = null (ระบบไม่เดาจากชื่อ)
 */
export async function personPartyFor(tenantId: string, input: { name: string | null; phone: string | null; email: string | null }): Promise<string | null> {
  const rawPhone = str(input?.phone);
  const rawEmail = str(input?.email);
  const phone = rawPhone && !contactPhoneProblem(rawPhone) ? storePhone(rawPhone) : null;
  const email = rawEmail && !emailProblem(rawEmail) ? rawEmail.toLowerCase() : null;
  if (!tenantId || (!phone && !email)) return null;
  const name = str(input?.name) ?? phone ?? email ?? CONTACT_NAME_PLACEHOLDER;
  return prisma.$transaction((tx) => personParty(tx, tenantId, { name, phone, email }), TX_OPTS);
}
// ◂ CRM C1.8

/** ตัวเลือกผู้ดูแล (สมาชิกของร้าน) — ใช้ของบริการบริษัทตัวเดียวกัน */
export async function ownerOptions(ctx: ContactsCtx, actor: MemberActor): Promise<{ id: string; name: string }[]> {
  const a = await enter(ctx, actor);
  return companies.ownerOptions(coCtx(ctx), a);
}

/** ตัวเลือกบริษัท (ค้นฝั่งเซิร์ฟเวอร์) — ใช้ของบริการบริษัทตัวเดียวกัน */
export async function companyOptions(ctx: ContactsCtx, actor: MemberActor, q?: string | null): Promise<{ id: string; name: string }[]> {
  const a = await enter(ctx, actor);
  return companies.companyOptions(coCtx(ctx), a, { q: q ?? null });
}

/** ฟิลด์กำหนดเองของผู้ติดต่อสำหรับฟอร์มเพิ่ม (ไม่รวมฟิลด์ระบบ/อ่อนไหว — ค่าอ่อนไหวกรอกที่หน้า 360 ที่มีการตัดสินสิทธิ์) */
export async function customFieldLayout(ctx: ContactsCtx, actor: MemberActor): Promise<{ key: string; label: string; type: string; required: boolean; choices: { value: string; label: string }[] }[]> {
  const a = await enter(ctx, actor);
  const layout = await (await engine()).listLayout(fctx(ctx, a));
  return layout.sections
    .filter((s) => !s.sensitive)
    .flatMap((s) => s.fields.filter((f) => !f.isSystem && !f.sensitive && ["TEXT", "LONG_TEXT", "NUMBER", "SELECT", "DATE", "BOOLEAN"].includes(f.type)))
    .map((f) => ({ key: f.key, label: f.label, type: f.type, required: f.required, choices: f.options?.choices ?? [] }));
}

// CRM C1.11 ▸ ค่าของฟิลด์ที่เลือกได้ตอนรวม (MERGE_CHOICE_FIELDS) ของผู้ติดต่อตาม id ที่ผู้ดูมองเห็น — ผู้ใช้: หน้าผู้ติดต่อที่น่าจะซ้ำ ·
//   แผ่นรวมในผู้ติดต่อ 360 (แสดงค่าทั้งสองฝั่ง) · อ่านผ่าน contactWhere (AUDIT-CLASS X1 — มองไม่เห็น = ไม่มีในผล) · สูงสุด 500 id
export async function mergeValuesFor(ctx: ContactsCtx, actor: MemberActor, ids: readonly string[]): Promise<{ id: string; name: string; values: Record<string, string | null> }[]> {
  const a = await enter(ctx, actor);
  const list = [...new Set(ids.filter((x) => typeof x === "string" && x))].slice(0, 500);
  if (list.length === 0) return [];
  const rows = await prisma.crmContact.findMany({
    where: { AND: [await contactWhere(ctx, a), { ...identityScope(ctx), id: { in: list }, mergedIntoId: null }] },
    select: { id: true, name: true, firstName: true, lastName: true, titleTh: true, phone: true, email: true, lineUserId: true, jobTitle: true, department: true },
  });
  return rows.map((r) => {
    const bag = r as unknown as Record<string, string | null>;
    return { id: r.id, name: r.name, values: Object.fromEntries(MERGE_CHOICE_FIELDS.map((f) => [f, bag[f] ?? null])) };
  });
}
// ◂ CRM C1.11

// CRM C2.5 ▸ ตัวเขียนแคบ ๆ ของ "ธงอีเมลของผู้ติดต่อ" ที่ระบบอีเมล (ใบ C2.5) เรียกในธุรกรรมของตัวเอง
//   กติกาถาวร (ข้อสอบ C1.4-S0.8): คอลัมน์ที่มีเจ้าของ (`emailOptOut` · `email` · `phone` · `tags` …) เขียนได้จาก
//   `contacts*.ts` / `consents.ts` เท่านั้น — ไม่ใช่เรื่องรูปแบบ: ธง "ขอไม่รับ" ต้องพลิกแบบมีเงื่อนไข
//   (คนละคำสั่ง ๆ กัน) และต้องพลิก "ครั้งเดียว" เท่านั้น เพราะผู้เรียกเอาค่า "พลิกจริงไหม"
//   ไปตัดสินว่าจะลงแถวความยินยอม/หยุดลำดับการติดตามหรือเปล่า
//   🔴 แถวประวัติความยินยอม **ไม่** อยู่ที่นี่: มันเป็นของ `consents.set` ตัวเดียวของระบบ (ผู้ติดต่อ
//     ที่ผูกบัญชีสมาชิกแล้ว ต้องลงที่ฝั่งสมาชิก ไม่ใช่แถว CrmContactConsent) — ผู้เรียกเรียกต่อหลังจาก tx สำเร็จ

/** ธง "ขอไม่รับอีเมล" (governed column) — คืน true เมื่อรอบนี้เป็นคนพลิกจริง */
export async function markEmailOptOutInTx(
  tx: Tx,
  ctx: { tenantId: string; systemId: string },
  contactId: string,
): Promise<boolean> {
  const id = String(contactId ?? "");
  if (!id || !ctx?.tenantId) return false;
  const n = await tx.crmContact.updateMany({
    where: { id, tenantId: ctx.tenantId, systemId: ctx.systemId, emailOptOut: false },
    data: { emailOptOut: true },
  });
  return n.count === 1;
}

/** C5.4-B L5-M4: ธง "ไม่ให้ติดตาม" จากลิงก์ในอีเมล (ลูกค้ากดเอง) — คืน true เมื่อรอบนี้เป็นคนพลิกจริง */
export async function markTrackingOptOutInTx(
  tx: Tx,
  ctx: { tenantId: string; systemId: string },
  contactId: string,
): Promise<boolean> {
  const id = String(contactId ?? "");
  if (!id || !ctx?.tenantId) return false;
  const n = await tx.crmContact.updateMany({
    where: { id, tenantId: ctx.tenantId, systemId: ctx.systemId, trackingOptOut: false },
    data: { trackingOptOut: true },
  });
  // รีวิว C5.4-B note (d): event เดียวกับทางของพนักงาน (setTrackingOptOut → mutate) — ใน tx เดียวกับคอลัมน์ · เฉพาะรอบที่พลิกจริง
  if (n.count === 1) await emitContactEvent(tx, ctx, "updated", id, newSeq(), { contactId: id, changedKeys: ["trackingOptOut"] });
  return n.count === 1;
}

/** ธง "อีเมลนี้ตีกลับถาวร" — คืน true เมื่อรอบนี้เป็นคนพลิกจริง (อยู่ที่นี่คู่กันกับที่เหลือ) */
export async function markEmailBouncedInTx(
  tx: Tx,
  ctx: { tenantId: string; systemId: string },
  contactId: string,
  at: Date,
): Promise<boolean> {
  const id = String(contactId ?? "");
  if (!id || !ctx?.tenantId) return false;
  const n = await tx.crmContact.updateMany({
    where: { id, tenantId: ctx.tenantId, systemId: ctx.systemId, emailBouncedAt: null },
    data: { emailBouncedAt: at instanceof Date && !Number.isNaN(at.getTime()) ? at : new Date() },
  });
  return n.count === 1;
}
// ◂ CRM C2.5

// CRM C2.9 ▸ "ลูกค้าคนนี้ทำธุรกรรมจริงแล้ว" จากสะพานเหตุการณ์ธุรกิจ (`crm-bridges/business.ts`) — ผู้เขียนคอลัมน์
//   `lifecycleStage` ยังมีที่เดียวคือไฟล์นี้ (กติกาถาวรของ C1.4 · กติกาข้อ 6 ของโฟลเดอร์สะพาน)
//   🔴 เดินหน้าทางเดียว: LEAD | PROSPECT | CHURNED ⇒ CUSTOMER · CUSTOMER อยู่เฉย ๆ (ไม่เขียนซ้ำ ไม่มี event ซ้ำ) ·
//      **LOST ปล่อยไว้ LOST** (มติผู้คุมงาน C2.9 ข้อ 11: คนที่ทีมขายปิดว่า "แพ้" แล้วกลับมาซื้อ = เรื่องที่ร้านต้องเห็นและตัดสินเอง
//      การเลื่อนขั้นเงียบ ๆ จะกลบมันหายไป) ⇒ เงื่อนไขเป็นรายการขั้นที่อนุญาต ไม่ใช่ "ไม่ใช่ CUSTOMER"
//   AUDIT-CLASS X4: คำสั่งเดียวแบบมีเงื่อนไข (`updateMany` + `lifecycleStage in (…)`) ⇒ ส่ง event ซ้ำ/ยิงพร้อมกันกี่ทาง
//      เลื่อนขั้นครั้งเดียว · event `crm.contact.updated` + แถว audit เกิดเฉพาะรอบที่เปลี่ยนจริง (คืน 0 = ไม่มีอะไรเกิดขึ้น)
//   AUDIT-CLASS X1: ระบบต้องเป็นระบบ CRM ของร้านนี้ (resolveSystem) · แถวผูก (ร้าน, ระบบ) เสมอ
//   AUDIT-CLASS X8: ไม่มีข้อมูลบุคคลในผู้ใช้/audit/event — id ล้วน
/** ขั้นที่เลื่อนขึ้น CUSTOMER ได้ — **อนุมานจาก `canAdvanceLifecycle` ตัวเดียวของระบบ** (COMMON: ห้ามมีเครื่องกติกาตัวที่สอง)
 *  ⇒ LOST หลุดออกเองเพราะกติกาห้าม LOST→CUSTOMER (มติผู้คุมงาน C2.9 ข้อ 11) · CUSTOMER ตัดออกเพราะ "อยู่เฉย ๆ"
 *    (ไม่เขียนซ้ำ ไม่มี event ซ้ำ) · แก้กติกาใน `rules.ts` วันหลัง = ที่นี่เดินตามทันทีโดยไม่ต้องแก้ */
const BRIDGE_PROMOTABLE_STAGES: CrmLifecycleStage[] = (LIFECYCLE_STAGES as readonly CrmLifecycleStage[]).filter(
  (from) => from !== "CUSTOMER" && canAdvanceLifecycle(from, "CUSTOMER"),
);

export async function markCustomerFromBridge(ctx: { tenantId: string; systemId: string }, input: { contactId: string }): Promise<number> {
  const c: ContactsCtx = { tenantId: ctx.tenantId, systemId: ctx.systemId, actorUserId: null };
  const contactId = str(input?.contactId);
  if (!contactId) return 0;
  await resolveSystem(c);
  // CRM C3.9-fix ▸ มติข้อ 4: ผู้ติดต่อที่ถูกลบตาม PDPA ไม่ถูกเลื่อนขั้นจากเหตุการณ์ธุรกิจ (ข้ามเงียบ — WARN อยู่ที่ตัวเขียนกิจกรรมของสะพานเดียวกัน) ◂
  if (await isErasedContact(ctx.tenantId, contactId)) return 0;
  const out = await prisma.$transaction(async (tx) => {
    // ขั้นก่อนหน้าอ่าน **ในธุรกรรมเดียวกับการเลื่อนขั้น** → แถว audit มี before จริง (ผู้ตรวจต้องเห็นว่ามาจาก LEAD/PROSPECT
    //   หรือกลับมาจาก CHURNED — "after เพียว ๆ" ตอบคำถามนี้ไม่ได้ และไล่ย้อนจากที่อื่นไม่ได้เพราะค่าถูกทับแล้ว)
    const pre = await tx.crmContact.findFirst({
      where: { ...identityScope(c), id: contactId, mergedIntoId: null },
      select: { lifecycleStage: true },
    });
    const n = await tx.crmContact.updateMany({
      where: { ...identityScope(c), id: contactId, mergedIntoId: null, lifecycleStage: { in: BRIDGE_PROMOTABLE_STAGES } },
      data: { lifecycleStage: "CUSTOMER" },
    });
    if (n.count !== 1) return { changed: 0, before: null as CrmLifecycleStage | null };
    // 🔴 seq ต้องใหม่ทุกครั้ง (`newSeq()` เหมือนจุด "updated" อื่นทั้งหมด) — ห้ามใช้ค่าคงที่:
    //   ลูกค้าที่ซื้อ → CUSTOMER → ร้านตั้งเป็น CHURNED เอง → กลับมาซื้ออีก = เลื่อนขั้นครั้งที่สอง ถ้า key ซ้ำใบเดิม
    //   (`crm.contact.updated#<id>#lifecycle-customer`) คิวจะกลืนทิ้งเงียบ ⇒ แถว+audit เปลี่ยนแต่ **ไม่มี event** ⇒
    //   กติกา/เว็บฮุค "ลูกค้ากลับมา" (win-back) ไม่ทำงานเลย
    await emitContactEvent(tx, c, "updated", contactId, newSeq(), { contactId, changedKeys: ["lifecycleStage"] });
    return { changed: 1, before: pre?.lifecycleStage ?? null };
  }, TX_OPTS);
  if (out.changed === 1) {
    await writeAudit({
      tenantId: c.tenantId,
      actorId: null,
      actorType: "SYSTEM",
      action: "crm.contact.lifecycle",
      targetType: "CrmContact",
      targetId: contactId,
      before: { lifecycleStage: out.before },
      after: { lifecycleStage: "CUSTOMER", via: "business" },
    });
  }
  return out.changed;
}
// ◂ CRM C2.9

// CRM C3.5 ▸ ผูก LINE ให้ผู้ติดต่อจากพอร์ทัล (รับคำเชิญด้วย LINE ที่ตัวตนตรง · อนุมัติคำขอ LINE_IDENTITY ที่ระบบสร้าง) — ผู้เขียน `lineUserId`
//   ยังมีที่เดียวคือไฟล์นี้ (ข้อสอบ C1.4-S0.8) · ใน tx ของผู้เรียก · ผูกเฉพาะเมื่อผู้ติดต่อยังไม่มี LINE (ไม่ทับของเดิม) และไม่มีผู้ติดต่ออื่น
//   ในระบบนี้ใช้ LINE นี้อยู่ · ผู้ติดต่อที่ถูกเก็บ/ถูกรวม = ไม่ผูก · คืน true เมื่อผูกจริง ◂
export async function bindPortalLineUserIdInTx(tx: Tx, input: { tenantId: string; systemId: string; contactId: string; lineUserId: string }): Promise<boolean> {
  const lineUserId = str(input.lineUserId);
  if (!lineUserId || lineUserId.length > 100) return false;
  const taken = await tx.crmContact.count({ where: { tenantId: input.tenantId, systemId: input.systemId, lineUserId, id: { not: input.contactId } } });
  if (taken > 0) return false;
  const r = await tx.crmContact.updateMany({
    where: { id: input.contactId, tenantId: input.tenantId, systemId: input.systemId, lineUserId: null, archivedAt: null, mergedIntoId: null },
    data: { lineUserId },
  });
  return r.count === 1;
}
// ◂ CRM C3.5

// CRM C3.9 ▸ PDPA — ทำให้แถวผู้ติดต่อไม่ระบุตัวตน (ผู้เรียก: `privacy.ts#eraseContact` ใน tx ที่ถือ FOR UPDATE ของแถวนี้แล้ว)
//   อยู่ในไฟล์นี้เพราะคอลัมน์ที่มีกฎธุรกิจ (เบอร์ · อีเมล · opt-out · แท็ก · อีเมลเก่า · LINE) เขียนได้เฉพาะบริการผู้ติดต่อ (C1.4-S0.8)
//   ชื่อ = ธง "ลบแล้ว" · ปิดทุกช่องทางติดต่อ (opt-out ทั้งหมด = ไม่มีผู้ส่งเส้นทางไหนติดต่อได้อีก) · เก็บถาวร (หลุดจากรายการ/งานอัตโนมัติ) ·
//   ดีล/ผู้ดูแล/ทีม/คะแนนคงเดิม (ตัวเลข) · `unlinkParty` = ตัดการผูก Party ที่ยังมีผู้ถืออื่น
export async function anonymizeContactInTx(
  tx: Tx,
  ctx: { tenantId: string; systemId: string },
  contactId: string,
  o: { name: string; now: Date; keepArchivedAt: Date | null; unlinkParty: boolean },
): Promise<void> {
  const n = await tx.crmContact.updateMany({
    where: { id: contactId, tenantId: ctx.tenantId, systemId: ctx.systemId },
    data: {
      name: o.name,
      firstName: null,
      lastName: null,
      titleTh: null,
      phone: null,
      email: null,
      company: null,
      note: null,
      jobTitle: null,
      department: null,
      lineUserId: null,
      previousEmails: [],
      tags: [],
      sourceDetail: Prisma.DbNull,
      sourceChannel: null,
      attributionId: null,
      portalAccessAt: null,
      emailOptOut: true,
      marketingOptOut: true,
      trackingOptOut: true,
      archivedAt: o.keepArchivedAt ?? o.now,
      ...(o.unlinkParty ? { partyId: null } : {}),
    },
  });
  if (n.count !== 1) throw fail("NOT_FOUND", NOT_FOUND_MSG);
}
// ◂ CRM C3.9

// CRM C3.9-fix ▸ H8: คีย์ที่ระบุตัวของผู้ติดต่อ — แถว audit ของตัวเขียนผู้ติดต่อเก็บแค่เครื่องหมาย "เปลี่ยน" (ไม่มีค่าเก่า/ใหม่) ◂
export const AUDIT_IDENTITY_KEYS: ReadonlySet<string> = new Set(["name", "firstName", "lastName", "phone", "email", "lineUserId", "note", "previousEmails"]);
export const AUDIT_CHANGED_MARK = "(เปลี่ยน)";

// CRM C3.9 ▸ รีวิว S2 (มติผู้คุมงาน): ชื่อ "ลบตามคำขอ PDPA" สงวนไว้ให้ป้ายของผู้ติดต่อที่ถูกลบ (ธงจริงคือแถว audit) —
//   ทุกตัวเขียนชื่อของบริการนี้ (สร้าง · แก้ · นำเข้า · ฟอร์ม/แชท/อีเมล · รวม) ปฏิเสธชื่อนี้ ⇒ คนกรอกฟอร์มพิมพ์ชื่อนี้เพื่อหลบงานอายุเก็บ/ตัวนับ Party ไม่ได้
function assertNotReservedName(name: string | null | undefined): void {
  if (isReservedContactName(name)) throw fail("VALIDATION", "ชื่อนี้ระบบสงวนไว้สำหรับผู้ติดต่อที่ถูกลบข้อมูลตาม PDPA — ใช้ชื่ออื่นแล้วบันทึกอีกครั้ง");
}
// ◂ CRM C3.9
