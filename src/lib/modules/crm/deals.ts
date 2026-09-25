// deals.ts — บริการ "ดีล" ของ CRM v2 (ใบ C1.5 · พิมพ์เขียว §5.4 §3.2 §3.3 §11.3 · มติผู้คุมงาน C1.5 ข้อ 1–6 · R-A · R-C.8 · R-E.7/8 · มติ C28)
//
// ของที่ไฟล์นี้เป็นเจ้าของ
//   • CrmDeal: create · move (+เงื่อนไขก่อนเข้าขั้น · เหตุผลที่แพ้ · ประวัติขั้น) · reopen · reassign · forecast category · next step ·
//     collaborators · update · lines (+เพดานส่วนลด → สายอนุมัติ `crm.discount`) · ใบเสนอราคา/ใบแจ้งหนี้ · ย้าย pipeline · ลบ · กลุ่ม
//   • อ่าน: getDeal360 · listDeals · getBoard · forecast · exportDeals (+ ตัวเลือกของหน้าจอ)
//   • event `crm.deal.created / stage.changed / won / lost / reopened / reassigned / updated` — ยิงใน tx ของการเขียนเสมอ
//   • ทางเข้าของ v1 (`service.ts` createDeal/moveDeal/issueQuotation) และของ "แปลง lead" (`contacts.convertContact` → createDeal(…, tx))
//
// 🔴 คอลัมน์ที่ engine ฟิลด์ปฏิเสธ (GOVERNED_CRM_SYSTEM_KEYS.deal — มูลค่า ขั้น ผู้ดูแล ส่วนลด ฯลฯ) ไฟล์นี้เขียนเองที่เดียว
//    แล้วส่งเฉพาะ key ของฟิลด์กำหนดเองเข้า engine (เรียก `lockRecordForFieldWrite` ก่อนล็อกแถวทุกครั้งที่เขียนทั้งสองอย่างใน tx เดียว)
// 🔴 ลำดับล็อก (หัวไฟล์ companies.ts · มติผู้คุมงาน C1.5): ต้นไม้ → engine → เลขภาษี → Party → แถว CrmCompany (เรียง id) →
//    แถว CrmContact (เรียง id) → แถว CrmDeal (เรียง id) — ดีลล็อก "บริษัทก่อนดีล" เสมอ แม้แค่ย้ายขั้น
//    AUDIT-CLASS X3: บริษัทของดีลอาจเปลี่ยนระหว่างรอล็อก (รวมบริษัท) ⇒ ได้ล็อกแล้วอ่านแถวดีลใหม่ ถ้าบริษัทไม่ตรงกับที่ล็อกไว้ = เริ่ม tx ใหม่
// 🔴 การอ่าน "สิ่งที่ actor เห็น" ผ่าน `./where.ts` `dealWhere(ctx, actor)` เท่านั้น (R-A — C1.7 แทนไส้ใน)
// 🔴 facade บัญชี/สมาชิก/สายอนุมัติ/คลัง โหลดตอนใช้ (dynamic import) — crm facade ถูก import จากโมดูลบัญชี (account→crm) ⇒ import หัวไฟล์ = วงโหลด (TDZ)

import { randomUUID } from "node:crypto";
import { MemberSource, Prisma } from "@prisma/client";
import type { CrmDeal, CrmForecastCategory, CrmStage, CrmStageKind } from "@prisma/client";
import { writeAudit } from "@/lib/core/audit";
import { csvRow } from "@/lib/core/csv";
import { emitOutbox } from "@/lib/core/outbox";
import { logOps } from "@/lib/core/ops";
import type { MemberActor } from "@/lib/modules/member";
import { prisma } from "./db";
import { activityWhere, contactWhere, dealWhere } from "./where";
// CRM C1.7 ▸ คีย์สิทธิ์ตัวเดียวของ CRM (หลังการมองเห็นเสมอ) ◂
import { crmCan, crmForbiddenMessage, crmParam } from "./access";
import * as companies from "./companies";
import { CompaniesError } from "./companies-shared";
import { dealStateForStage, lifecycleAfterDealWon } from "./rules";
// CRM C2.7 ▸ ธง "เอกสารถูกยกเลิก" + เพดานของทางเดินเงิน อยู่ที่ `./payments-shared` (บริสุทธิ์ — `payments.ts` import `deals.ts` ทางเดียว ไม่มีวงโหลด) ◂
import { DEAL_VOIDED_TAG } from "./payments-shared";
// CRM C2.7 ▸ มติรอบ 2 (SF-3): ประตู uiVersion ของ "มูลค่าที่รับเงินจริง" ใน `moveCore` (ร้าน v1 = พฤติกรรมเดิมของ C1.5) ◂
import { crmUiVersion } from "./ui-version";
// CRM C1.6 ▸ การ์ดบอร์ดงานของดีลใน getDeal360 ◂
import { auditSystemActivity, dealKanbanCards, recordSystemActivityInTx, type DealKanbanCard } from "./activities";
import {
  DEAL_BOARD_CARDS_MAX,
  DEAL_BULK_MAX,
  DEAL_COLLABORATORS_MAX,
  DEAL_DISCOUNT_CAP_BP_DEFAULT,
  DEAL_EXPORT_MAX_ROWS,
  DEAL_KIND_LABEL,
  DEAL_NOTE_MAX,
  DEAL_PAGE_MAX,
  DEAL_REASON_MAX,
  DEAL_REASON_MIN,
  DEAL_SORTS,
  DEAL_TAG_MAX,
  DEAL_TAGS_MAX,
  DEAL_TITLE_MAX,
  DEAL_VALUE_MAX_SATANG,
  DealsError,
  FORECAST_CATEGORIES,
  FORECAST_CATEGORY_LABEL,
  FORECAST_GROUPS,
  FORECAST_NONE_KEY,
  STAGE_FILLABLE_SYSTEM_KEYS,
  STAGE_REQUIRABLE_LABEL,
  STAGE_REQUIRABLE_SYSTEM_KEYS,
  checkDealLines,
  dayKey,
  dealTotals,
  formatThaiMonth,
  lineAmountSatang,
  lineGrossSatang,
  linesFingerprint,
  thaiDayUtc,
  type BoardColumnDto,
  type BoardDto,
  type Deal360,
  type DealCardDto,
  type DealDocRow,
  type DealDto,
  type DealHistoryRow,
  type DealKind,
  type DealLineDto,
  type DealLineInput,
  type DealListInput,
  type DealListResult,
  type DealListRow,
  type DealSort,
  type DealTimelineItem,
  type ForecastCategory,
  type ForecastGroup,
  type ForecastResult,
  type ForecastRow,
  type NormalizedDealLine,
  type PipelineDto,
  type StageDto,
} from "./deals-shared";

export { DealsError };

const accountFacade = () => import("@/lib/modules/account");
const approvalFacade = () => import("@/lib/modules/approval");
const inventoryFacade = () => import("@/lib/modules/inventory");
const memberFacade = () => import("@/lib/modules/member");
/** engine ฟิลด์ตัวเดียวของระบบ (member facade → namespace `fields` · ใบ C1.2a) */
const engine = async () => (await memberFacade()).fields;

// ───────────────────────── ชนิด ─────────────────────────

export type DealsCtx = { tenantId: string; systemId: string; actorUserId: string | null };
type Tx = Prisma.TransactionClient;
type Db = typeof prisma | Tx;
/** ผู้กระทำ: actor จริง (หน้า/REST) · `null` = ทางเข้าของระบบ (v1 wrapper · effect ของสายอนุมัติ) — ไม่มีตัวกรองการมองเห็นเกินร้าน+ระบบ */
type Who = MemberActor | null;

export type CreateDealInput = {
  pipelineId: string;
  stageId?: string | null;
  title: string;
  contactId: string;
  companyId?: string | null;
  valueSatang?: number | null;
  lines?: DealLineInput[] | null;
  discountBp?: number | null;
  expectedCloseAt?: string | Date | null;
  ownerUserId?: string | null;
  collaboratorUserIds?: string[] | null;
  forecastCategory?: string | null;
  probabilityOverride?: number | null;
  nextStep?: string | null;
  sourceKind?: string | null;
  sourceDetail?: Record<string, unknown> | null;
  fields?: Record<string, unknown> | null;
  tags?: string[] | null;
};

export type MoveDealInput = {
  stageId: string;
  note?: string | null;
  lostReasonId?: string | null;
  lostNote?: string | null;
  /** ค่าที่กรอกจากโมดัล "เงื่อนไขก่อนเข้าขั้น" (ฟิลด์ระบบ expectedCloseAt/nextStep/probabilityOverride หรือ key ฟิลด์กำหนดเองของดีล) */
  requireFieldsValues?: Record<string, unknown> | null;
};

export type UpdateDealInput = {
  title?: string | null;
  expectedCloseAt?: string | Date | null;
  valueSatang?: number | null;
  probabilityOverride?: number | null;
  tags?: string[] | null;
  fields?: Record<string, unknown> | null;
};

export type DangerOpts = { confirm?: boolean | null; reason?: string | null };
export type SetLinesInput = { lines: DealLineInput[]; discountBp?: number | null };
export type SetLinesResult =
  | { status: "APPLIED"; deal: DealDto }
  | { status: "APPROVAL_REQUIRED"; approvalRequestId: string; deal: DealDto };
export type BulkResult = { ok: number; failed: { id: string; error: string }[] };

// ───────────────────────── ตัวช่วยพื้นฐาน ─────────────────────────

const EVT = {
  created: "crm.deal.created",
  stageChanged: "crm.deal.stage.changed",
  won: "crm.deal.won",
  lost: "crm.deal.lost",
  reopened: "crm.deal.reopened",
  reassigned: "crm.deal.reassigned",
  updated: "crm.deal.updated",
} as const;
const TX_OPTS = { maxWait: 20_000, timeout: 40_000 } as const;
const NOT_FOUND_MSG = "ไม่พบดีลนี้ในระบบ CRM ที่เปิดอยู่ (อาจถูกลบหรืออยู่คนละระบบ) — รีเฟรชหน้าแล้วลองใหม่";
const RACE_MSG = "ดีลนี้เพิ่งถูกแก้จากที่อื่นพร้อมกัน ระบบจึงยังไม่บันทึก — รีเฟรชหน้าแล้วลองอีกครั้ง";
const CLOSED_MSG = "ดีลนี้ปิดแล้ว (ชนะ/แพ้) จึงแก้รายการหรือมูลค่าไม่ได้ — ให้ผู้จัดการเปิดดีลใหม่ก่อนถ้าต้องการแก้";

const fail = (code: DealsError["code"], message: string, extra: { missing?: string[]; approvalRequestId?: string } = {}) => new DealsError(code, message, extra);
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const newSeq = () => randomUUID().replace(/-/g, "");
const iso = (d: Date | null | undefined): string | null => (d ? d.toISOString() : null);
const toNum = (v: bigint | number | null | undefined): number | null => (v === null || v === undefined ? null : Number(v));
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const isManager = (who: Who) => who === null || who.role === "OWNER" || who.role === "MANAGER";
const actorIdOf = (ctx: DealsCtx) => ctx.actorUserId ?? null;
const coCtx = (ctx: DealsCtx) => ({ tenantId: ctx.tenantId, systemId: ctx.systemId, actorUserId: ctx.actorUserId ?? null });
const identityScope = (ctx: DealsCtx) => ({ tenantId: ctx.tenantId, systemId: ctx.systemId });

/** เริ่ม tx ใหม่เพราะบริษัทของดีลเปลี่ยนระหว่างรอล็อก (ไม่ใช่ข้อผิดพลาดของผู้ใช้) */
class RelockNeeded extends Error {}

function assertActor(actor: MemberActor | null | undefined): asserts actor is MemberActor {
  // ลูกค้า (portal) ไม่มีทางเข้าบริการนี้ — ตอบ "ไม่พบ" (404-not-403)
  if (!actor || actor.role === "CUSTOMER") throw fail("NOT_FOUND", NOT_FOUND_MSG);
}

/** AUDIT-CLASS X1: ctx.systemId ต้องเป็นระบบ **CRM** ของร้านนี้จริง (ระบบร้านอื่น/ระบบชนิดอื่น = ไม่พบ) — ห้ามเชื่อ id จากผู้เรียก */
async function resolveSystem(ctx: DealsCtx, db: Db = prisma): Promise<void> {
  const sys =
    typeof ctx?.systemId === "string" && typeof ctx?.tenantId === "string" && ctx.systemId && ctx.tenantId
      ? await db.appSystem.findFirst({ where: { id: ctx.systemId, tenantId: ctx.tenantId, type: "CRM" }, select: { id: true } })
      : null;
  if (!sys) throw fail("NOT_FOUND", "ไม่พบระบบ CRM นี้ในร้านที่เปิดอยู่ — รีเฟรชหน้าแล้วลองใหม่");
}

async function enter(ctx: DealsCtx, actor: MemberActor | null | undefined, db: Db = prisma): Promise<MemberActor> {
  assertActor(actor);
  await resolveSystem(ctx, db);
  return actor;
}

/** AUDIT-CLASS X1: ขอบเขตการอ่านดีล — actor จริงผ่าน dealWhere · ทางเข้าของระบบ = ร้าน+ระบบ */
async function scopeOf(ctx: DealsCtx, who: Who, db: Db = prisma): Promise<Prisma.CrmDealWhereInput> {
  return who ? await dealWhere(ctx, who, { db }) : identityScope(ctx);
}

/** AUDIT-CLASS X1: ดีล 1 แถวผ่าน dealWhere — ระบบอื่น/ร้านอื่น = NOT_FOUND (ข้อความไม่สะท้อนข้อมูลของเขา) */
async function loadDeal(ctx: DealsCtx, who: Who, id: unknown, db: Db = prisma): Promise<CrmDeal> {
  const did = str(id);
  const row = did ? await db.crmDeal.findFirst({ where: { AND: [await scopeOf(ctx, who, db), { id: did }] } }) : null;
  if (!row) throw fail("NOT_FOUND", NOT_FOUND_MSG);
  return row;
}

// CRM C1.7 ▸ ลำดับในทุกคำสั่ง: ระบบ (enter) → การมองเห็น (loadDeal · มองไม่เห็น = NOT_FOUND) → คีย์ (need · เห็นแต่ไม่มีคีย์ = FORBIDDEN)
/** AUDIT-CLASS X2: คีย์สิทธิ์ผ่าน `crm/access.ts` — ทางเข้าของระบบ (who = null: v1 wrapper · ผลสายอนุมัติ) ไม่ตรวจคีย์ */
function need(who: Who, key: string): void {
  if (who && !crmCan(who, key)) throw fail("FORBIDDEN", crmForbiddenMessage(key));
}
// ◂ CRM C1.7

/** error จากบริการอื่น (บริษัท · engine ฟิลด์ · สมาชิก) → DealsError · error ของฐานข้อมูลโยนต่อตามจริง */
function mapError(e: unknown): unknown {
  if (e instanceof DealsError) return e;
  if (e instanceof CompaniesError) return fail(e.code === "PARTIAL" ? "CONFLICT" : e.code === "DUPLICATE" ? "CONFLICT" : e.code, e.message);
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

function fctx(ctx: DealsCtx, who: Who) {
  return { tenantId: ctx.tenantId, systemId: ctx.systemId, actorUserId: actorIdOf(ctx), objectKey: "deal", ...(who ? { actor: who } : {}) };
}

/**
 * AUDIT-CLASS X4: idempotencyKey `crm.deal.<type>#<dealId>#<seq>` (R-C.8) · emit ใน tx ของการเขียน
 * ⇒ เขียนไม่สำเร็จ = ไม่มี event · event เขียนไม่ได้ = การเขียนทั้งก้อนถูกยกเลิก
 * AUDIT-CLASS X8: payload = id/คีย์ล้วน (ไม่มีชื่อดีล/ชื่อคน/เบอร์/อีเมล/โน้ต) — รวม `crm.deal.won` (ล้างเป็น id ล้วนในใบ C1.8)
 */
async function emitDeal(tx: Tx, ctx: DealsCtx, type: (typeof EVT)[keyof typeof EVT], dealId: string, seq: string | null, payload: Record<string, unknown>): Promise<void> {
  // seq = null ⇒ key ต่อดีล (`<type>#<dealId>`) — ใช้เฉพาะ `crm.deal.won` ของทางเข้า v1 (คงพฤติกรรมเดิม: ยิงครั้งเดียวต่อดีลตลอดอายุ)
  await emitOutbox(tx, { tenantId: ctx.tenantId, systemId: ctx.systemId, type, idempotencyKey: seq === null ? `${type}#${dealId}` : `${type}#${dealId}#${seq}`, payload });
}

async function audit(ctx: DealsCtx, action: string, targetId: string, body: { before?: unknown; after?: unknown }): Promise<void> {
  await writeAudit({ tenantId: ctx.tenantId, actorId: actorIdOf(ctx), actorType: ctx.actorUserId ? "USER" : "SYSTEM", action, targetType: "CrmDeal", targetId, ...body });
}

async function lockDealRows(tx: Tx, ctx: DealsCtx, ids: string[]): Promise<void> {
  const sorted = [...new Set(ids.filter(Boolean))].sort();
  if (sorted.length === 0) return;
  await tx.$queryRaw`SELECT "id" FROM "CrmDeal" WHERE "id" = ANY(${sorted}::text[]) AND "tenantId" = ${ctx.tenantId} AND "systemId" = ${ctx.systemId} ORDER BY "id" FOR UPDATE`;
}

/** รีวิว C1.5 S6: ล็อกแถว pipeline แบบแชร์ (สร้างดีล/ย้าย pipeline หลายรายการพร้อมกันได้ · ขวางการเก็บถาวร) แล้วตรวจ archivedAt ใต้ล็อก */
async function lockPipelineShared(tx: Tx, ctx: DealsCtx, pipelineId: string): Promise<void> {
  const rows = await tx.$queryRaw<{ archivedAt: Date | null }[]>`SELECT "archivedAt" FROM "CrmPipeline" WHERE "id" = ${pipelineId} AND "tenantId" = ${ctx.tenantId} AND "systemId" = ${ctx.systemId} FOR SHARE`;
  if (rows.length === 0) throw fail("NOT_FOUND", "ไม่พบ pipeline นี้ในระบบ CRM ที่เปิดอยู่ — เลือกใหม่จากรายการ");
  if (rows[0]!.archivedAt) throw fail("VALIDATION", "pipeline นี้เพิ่งถูกเก็บถาวร — เลือก pipeline อื่น");
}

async function lockContactRow(tx: Tx, ctx: DealsCtx, id: string): Promise<void> {
  await tx.$queryRaw`SELECT "id" FROM "CrmContact" WHERE "id" = ${id} AND "tenantId" = ${ctx.tenantId} FOR UPDATE`;
}

/**
 * ธุรกรรมที่แก้ดีล 1 ใบ — AUDIT-CLASS X3 (ลำดับล็อกของทั้งระบบ): [engine] → แถวบริษัท → [แถวผู้ติดต่อ] → แถวดีล
 * ได้ล็อกแล้วอ่านแถวดีลใหม่ (READ COMMITTED · คำสั่งใหม่ = ภาพใหม่) ⇒ ทุกการตัดสินใน `fn` ใช้ค่าล่าสุดที่ commit แล้ว
 * บริษัทเปลี่ยนระหว่างรอ (รวมบริษัท/ย้ายบริษัท) ⇒ ยกเลิก tx นี้แล้วเริ่มใหม่กับบริษัทที่ถูก (ไม่ล็อกย้อนลำดับ)
 */
async function withDealLocks<T>(ctx: DealsCtx, who: Who, id: string, opts: { contact?: boolean; engine?: boolean }, fn: (tx: Tx, deal: CrmDeal) => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    const pre = await loadDeal(ctx, who, id);
    try {
      return await prisma.$transaction(async (tx) => {
        if (opts.engine) await (await engine()).lockRecordForFieldWrite(tx, pre.id);
        await companies.lockCompanyRowsInTx(tx, coCtx(ctx), [pre.companyId]);
        if (opts.contact) await lockContactRow(tx, ctx, pre.contactId);
        await lockDealRows(tx, ctx, [pre.id]);
        const cur = await tx.crmDeal.findFirst({ where: { ...identityScope(ctx), id: pre.id } });
        if (!cur) throw fail("NOT_FOUND", NOT_FOUND_MSG);
        if (cur.companyId !== pre.companyId || (opts.contact && cur.contactId !== pre.contactId)) throw new RelockNeeded();
        return fn(tx, cur);
      }, TX_OPTS);
    } catch (e) {
      if (e instanceof RelockNeeded) {
        if (attempt < 4) continue;
        throw fail("CONFLICT", RACE_MSG);
      }
      throw mapError(e);
    }
  }
}

function toDto(row: CrmDeal): DealDto {
  return {
    id: row.id,
    systemId: row.systemId,
    title: row.title,
    contactId: row.contactId,
    companyId: row.companyId,
    pipelineId: row.pipelineId,
    stageId: row.stageId,
    kind: row.kind as DealKind,
    valueSatang: row.valueSatang,
    wonValueSatang: toNum(row.wonValueSatang),
    discountBp: row.discountBp,
    currency: row.currency,
    expectedCloseAt: dayKey(row.expectedCloseAt),
    closedAt: iso(row.closedAt),
    ownerUserId: row.ownerUserId,
    teamId: row.teamId,
    collaboratorUserIds: row.collaboratorUserIds,
    forecastCategory: row.forecastCategory as ForecastCategory,
    probabilityOverride: row.probabilityOverride,
    nextStep: row.nextStep,
    lostReasonId: row.lostReasonId,
    lostNote: row.lostReason,
    tags: row.tags,
    stageEnteredAt: row.stageEnteredAt.toISOString(),
    stalledAt: iso(row.stalledAt),
    reopenedCount: row.reopenedCount,
    quotationDocId: row.quotationDocId,
    invoiceDocId: row.invoiceDocId,
    pendingApprovalRequestId: row.pendingApprovalRequestId,
    hasPendingLines: row.pendingLines !== null && row.pendingLines !== undefined,
    sourceKind: row.sourceKind,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

// ───────────────────────── ตรวจค่าที่กรอก (AUDIT-CLASS X6) ─────────────────────────

function cleanTitle(v: unknown): string {
  const t = typeof v === "string" ? v.trim().replace(/\s+/g, " ") : "";
  if (!t) throw fail("VALIDATION", "ใส่ชื่อดีลก่อน — เช่น \"คอร์สดำน้ำพนักงาน 10 คน\"");
  if (t.length > DEAL_TITLE_MAX) throw fail("VALIDATION", `ชื่อดีลยาวเกิน ${DEAL_TITLE_MAX} ตัวอักษร — ย่อให้สั้นลง`);
  return t;
}

/** AUDIT-CLASS X6: มูลค่าดีล 0 … ฿20,000,000 (มติ C28) — จำนวนเต็มสตางค์ */
function cleanValue(v: unknown): number {
  if (v === undefined || v === null) return 0;
  if (typeof v !== "number" || !Number.isSafeInteger(v) || v < 0) throw fail("VALIDATION", "มูลค่าดีลต้องเป็นจำนวนเต็มสตางค์ตั้งแต่ 0 ขึ้นไป — ตรวจตัวเลขอีกครั้ง");
  if (v > DEAL_VALUE_MAX_SATANG) throw fail("VALIDATION", "มูลค่าดีลเกินเพดาน ฿20,000,000 ต่อดีล — แยกเป็นหลายดีล หรือแจ้งผู้ดูแลระบบถ้าต้องการเพดานสูงกว่านี้");
  return v;
}

function cleanClose(v: unknown): Date | null {
  const d = thaiDayUtc(v);
  if (d === undefined) throw fail("VALIDATION", "วันที่คาดว่าจะปิดอ่านไม่ออก — ใช้รูปแบบ ปี-เดือน-วัน (ค.ศ.) ที่มีอยู่จริง เช่น 2026-10-31");
  return d;
}

function cleanProbability(v: unknown): number | null {
  if (v === undefined || v === null || v === "") return null;
  if (typeof v !== "number" || !Number.isInteger(v) || v < 0 || v > 100) throw fail("VALIDATION", "โอกาสปิดต้องเป็นจำนวนเต็ม 0–100 (%)");
  return v;
}

function cleanNote(v: unknown, label: string): string | null {
  if (v === undefined || v === null) return null;
  if (typeof v !== "string") throw fail("VALIDATION", `${label}ต้องเป็นข้อความ`);
  const t = v.trim();
  if (!t) return null;
  if (t.length > DEAL_NOTE_MAX) throw fail("VALIDATION", `${label}ยาวเกิน ${DEAL_NOTE_MAX.toLocaleString("th-TH")} ตัวอักษร — ย่อให้สั้นลง`);
  return t;
}

function cleanTags(v: unknown): string[] {
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v)) throw fail("VALIDATION", "แท็กต้องเป็นรายการข้อความ");
  const out: string[] = [];
  for (const x of v) {
    const t = typeof x === "string" ? x.trim() : "";
    if (!t) continue;
    if (t.length > DEAL_TAG_MAX) throw fail("VALIDATION", `แท็กยาวเกิน ${DEAL_TAG_MAX} ตัวอักษร — ย่อให้สั้นลง`);
    if (!out.includes(t)) out.push(t);
  }
  if (out.length > DEAL_TAGS_MAX) throw fail("VALIDATION", `ดีลหนึ่งติดแท็กได้ไม่เกิน ${DEAL_TAGS_MAX} แท็ก — ลบแท็กที่ไม่ใช้ก่อน`);
  return out;
}

function cleanCategory(v: unknown): CrmForecastCategory {
  const s = typeof v === "string" ? v.trim().toUpperCase() : "";
  if (!(FORECAST_CATEGORIES as readonly string[]).includes(s)) {
    throw fail("VALIDATION", `หมวดพยากรณ์ต้องเป็นหนึ่งใน ${FORECAST_CATEGORIES.map((c) => FORECAST_CATEGORY_LABEL[c]).join(" · ")}`);
  }
  return s as CrmForecastCategory;
}

function cleanSource(v: unknown): MemberSource | null {
  const s = str(v);
  if (!s) return null;
  const up = s.toUpperCase();
  if (!(Object.values(MemberSource) as string[]).includes(up)) throw fail("VALIDATION", "ที่มาของดีลไม่อยู่ในรายการที่ระบบรู้จัก — เลือกใหม่จากรายการ");
  return up as MemberSource;
}

function reasonOf(opts: DangerOpts | null | undefined, what: string): string {
  // AUDIT-CLASS X9: การกระทำอันตรายต้องยืนยัน + เหตุผล ≥ DEAL_REASON_MIN ตัวอักษร (ตรวจก่อนแตะอะไรทั้งหมด)
  if (opts?.confirm !== true) throw fail("CONFIRM_REQUIRED", `การ${what}ต้องกดยืนยันก่อน — ติ๊กช่องยืนยันแล้วลองอีกครั้ง`);
  const reason = String(opts?.reason ?? "").trim();
  if (reason.length < DEAL_REASON_MIN) throw fail("VALIDATION", `ใส่เหตุผลของการ${what}อย่างน้อย ${DEAL_REASON_MIN} ตัวอักษร เพื่อให้ทีมย้อนดูได้ว่าทำไป เพราะอะไร`);
  if (reason.length > DEAL_REASON_MAX) throw fail("VALIDATION", `เหตุผลยาวเกิน ${DEAL_REASON_MAX} ตัวอักษร — ย่อให้สั้นลง`);
  return reason;
}

/** AUDIT-CLASS X9: รายการ id ของคำสั่งกลุ่ม — เพดาน DEAL_BULK_MAX ตรวจก่อนเขียนอะไรทั้งหมด */
function bulkIds(v: unknown): string[] {
  if (!Array.isArray(v)) throw fail("VALIDATION", "ยังไม่ได้เลือกดีล — ติ๊กดีลที่ต้องการก่อน");
  const ids = [...new Set(v.filter((x): x is string => typeof x === "string" && !!x.trim()).map((x) => x.trim()))];
  if (ids.length === 0) throw fail("VALIDATION", "ยังไม่ได้เลือกดีล — ติ๊กดีลที่ต้องการก่อน");
  if (ids.length > DEAL_BULK_MAX || v.length > DEAL_BULK_MAX) throw fail("VALIDATION", `ทำเป็นกลุ่มได้ครั้งละไม่เกิน ${DEAL_BULK_MAX} ดีล — แบ่งเป็นหลายรอบ`);
  return ids;
}

/** ผู้ใช้ต้องเป็นคนของร้านนี้ (Membership) — ของร้านอื่น = VALIDATION (ไม่บอกว่าเขามีตัวตนที่อื่นไหม) */
async function assertMembers(ctx: DealsCtx, ids: string[], db: Db = prisma, label = "ผู้ดูแล"): Promise<void> {
  const uniq = [...new Set(ids.filter(Boolean))];
  if (uniq.length === 0) return;
  const n = await db.membership.count({ where: { tenantId: ctx.tenantId, userId: { in: uniq } } });
  if (n !== uniq.length) throw fail("VALIDATION", `${label}ที่เลือกไม่ได้อยู่ในร้านนี้ — เลือกใหม่จากรายชื่อทีม`);
}

/** เพดานส่วนลดของผู้ทำ (bp) — `crm._maxDealDiscountBp` ในสิทธิ์ของเขา (แบบ `permissionValue`) · ไม่มี = ค่าเริ่มต้น 1000 */
function discountCapOf(who: Who): number {
  if (!who) return 10_000;
  const v = who.permissions?.["crm._maxDealDiscountBp"];
  return typeof v === "number" && Number.isFinite(v) ? Math.max(0, Math.min(10_000, Math.floor(v))) : DEAL_DISCOUNT_CAP_BP_DEFAULT;
}

/** ระบบคลังของร้าน (ปกติ 1) — ใช้หาสินค้าจาก productId ผ่าน facade คลัง */
async function inventoryItems(ctx: DealsCtx, productIds: string[]): Promise<Map<string, { priceSatang: number }>> {
  const out = new Map<string, { priceSatang: number }>();
  const ids = [...new Set(productIds.filter(Boolean))];
  if (ids.length === 0) return out;
  const systems = await prisma.appSystem.findMany({ where: { tenantId: ctx.tenantId, type: "INVENTORY" }, select: { id: true }, take: 20 });
  const inv = await inventoryFacade();
  // หนึ่งคำสั่งต่อระบบคลัง (ปกติร้านมีระบบเดียว) — ไม่ใช่ทีละสินค้า
  for (const s of systems) {
    const want = ids.filter((pid) => !out.has(pid));
    if (want.length === 0) break;
    for (const item of await inv.getItemsByIds({ tenantId: ctx.tenantId, systemId: s.id }, want)) out.set(item.id, { priceSatang: item.priceSatang });
  }
  return out;
}

/** รายการที่ผ่านตัวตรวจ + สินค้าต้องมีจริงในคลังของร้านนี้ (AUDIT-CLASS X1: สินค้าร้านอื่น = ไม่พบ) */
async function checkLinesOrThrow(ctx: DealsCtx, rawLines: unknown, dealBp: unknown) {
  const c = checkDealLines(rawLines, dealBp ?? 0);
  if (!c.ok) throw fail("VALIDATION", c.error);
  const pids = c.lines.map((l) => l.productId).filter((x): x is string => !!x);
  if (pids.length > 0) {
    const found = await inventoryItems(ctx, pids);
    const idx = c.lines.findIndex((l) => l.productId && !found.has(l.productId));
    if (idx >= 0) throw fail("NOT_FOUND", `บรรทัดที่ ${idx + 1}: ไม่พบสินค้านี้ในคลังของร้าน (อาจเลิกขายแล้ว) — เลือกสินค้าใหม่หรือลบการผูกสินค้า`);
  }
  return c;
}

// ───────────────────────── pipeline · ขั้น ─────────────────────────

type PipelineWithStages = Prisma.CrmPipelineGetPayload<{ include: { stages: true } }>;

async function loadPipeline(ctx: DealsCtx, id: unknown, db: Db = prisma, opts: { live?: boolean } = {}): Promise<PipelineWithStages> {
  const pid = str(id);
  const row = pid
    ? await db.crmPipeline.findFirst({ where: { ...identityScope(ctx), id: pid, ...(opts.live ? { archivedAt: null } : {}) }, include: { stages: { orderBy: [{ sortOrder: "asc" }, { id: "asc" }] } } })
    : null;
  if (!row) throw fail("NOT_FOUND", "ไม่พบ pipeline นี้ในระบบ CRM ที่เปิดอยู่ (อาจถูกเก็บถาวร) — เลือกใหม่จากรายการ");
  return row;
}

function stageDto(s: CrmStage): StageDto {
  return {
    id: s.id,
    name: s.name,
    kind: s.kind as DealKind,
    probability: s.probability,
    sortOrder: s.sortOrder,
    staleDays: s.staleDays,
    requireFields: s.requireFields,
    requireLines: s.requireLines,
    requireQuotation: s.requireQuotation,
    color: s.color,
    description: s.description,
  };
}

function pipelineDto(p: PipelineWithStages): PipelineDto {
  return { id: p.id, name: p.name, isDefault: p.isDefault, archivedAt: iso(p.archivedAt), stages: p.stages.map(stageDto) };
}

// ───────────────────────── เงื่อนไขก่อนเข้าขั้น ─────────────────────────

const REQUIRABLE_SYSTEM = new Set<string>(STAGE_REQUIRABLE_SYSTEM_KEYS);
const FILLABLE_SYSTEM = new Set<string>(STAGE_FILLABLE_SYSTEM_KEYS);

function blank(v: unknown): boolean {
  if (v === null || v === undefined) return true;
  if (typeof v === "string") return v.trim() === "";
  if (Array.isArray(v)) return v.length === 0;
  return false;
}

/** ค่าจากโมดัลเงื่อนไข → คอลัมน์ของดีล (ไฟล์นี้เขียน) + ค่าฟิลด์กำหนดเอง (engine เขียน) */
function splitRequireValues(values: Record<string, unknown>): { columns: Prisma.CrmDealUpdateInput; custom: Record<string, unknown> } {
  const columns: Prisma.CrmDealUpdateInput = {};
  const custom: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(values)) {
    if (FILLABLE_SYSTEM.has(k)) {
      if (k === "expectedCloseAt") columns.expectedCloseAt = cleanClose(v);
      else if (k === "nextStep") columns.nextStep = cleanNote(v, "ขั้นถัดไป");
      else if (k === "probabilityOverride") columns.probabilityOverride = cleanProbability(typeof v === "string" && v.trim() ? Number(v) : v);
    } else if (REQUIRABLE_SYSTEM.has(k)) {
      throw fail("VALIDATION", `"${STAGE_REQUIRABLE_LABEL[k as keyof typeof STAGE_REQUIRABLE_LABEL]}" แก้จากหน้าดีลโดยตรง ไม่ใช่จากหน้าต่างเงื่อนไข`);
    } else {
      custom[k] = v;
    }
  }
  return { columns, custom };
}

/** key ที่ยังขาดของขั้นปลายทาง (ฟิลด์ระบบ/ฟิลด์กำหนดเอง + "LINES" + "QUOTATION") — อ่านใน tx เดียวกับการย้าย */
async function missingFor(tx: Tx, ctx: DealsCtx, who: Who, deal: CrmDeal, stage: CrmStage): Promise<string[]> {
  const missing: string[] = [];
  const customKeys: string[] = [];
  for (const key of stage.requireFields) {
    if (!REQUIRABLE_SYSTEM.has(key)) {
      customKeys.push(key);
      continue;
    }
    const v =
      key === "valueSatang" ? (deal.valueSatang > 0 ? deal.valueSatang : null)
        : key === "tags" ? deal.tags
          : (deal as unknown as Record<string, unknown>)[key];
    if (blank(v)) missing.push(key);
  }
  if (customKeys.length > 0) {
    const vals = await (await engine()).getFieldValues(fctx(ctx, who), [deal.id], tx);
    const bag = vals[deal.id] ?? {};
    for (const key of customKeys) if (blank(bag[key])) missing.push(key);
  }
  if (stage.requireLines && (await tx.crmDealLine.count({ where: { dealId: deal.id } })) === 0) missing.push("LINES");
  if (stage.requireQuotation && !deal.quotationDocId) missing.push("QUOTATION");
  return missing;
}

async function missingMessage(ctx: DealsCtx, who: Who, stage: CrmStage, missing: string[]): Promise<string> {
  const custom = missing.filter((k) => !REQUIRABLE_SYSTEM.has(k) && k !== "LINES" && k !== "QUOTATION");
  const labels = new Map<string, string>();
  if (custom.length > 0) {
    try {
      const layout = await (await engine()).listLayout(fctx(ctx, who));
      for (const s of layout.sections) for (const f of s.fields) labels.set(f.key, f.label);
    } catch {
      /* ป้ายเป็นแค่ความสะดวก — ไม่มีก็ใช้ key */
    }
  }
  const parts = missing.map((k) =>
    k === "LINES" ? "รายการสินค้า" : k === "QUOTATION" ? "ใบเสนอราคา" : REQUIRABLE_SYSTEM.has(k) ? STAGE_REQUIRABLE_LABEL[k as keyof typeof STAGE_REQUIRABLE_LABEL] : (labels.get(k) ?? k),
  );
  return `ขั้น "${stage.name}" ต้องมีข้อมูลนี้ก่อน: ${parts.join(" · ")} — กรอกให้ครบแล้วย้ายอีกครั้ง`;
}

// ═════════════════════════ สร้าง ═════════════════════════

/**
 * สร้างดีล — ตรวจ pipeline/ขั้น/ผู้ติดต่อ/บริษัทของระบบนี้ + ผู้ติดต่อต้องอยู่ในบริษัทที่เลือก (ไม่ระบุ = บริษัทของผู้ติดต่อ) ·
 * ขั้นแรกที่เปิดอยู่เมื่อไม่ระบุ · แถวประวัติขั้นแถวแรก · มูลค่าจากรายการถ้ามี · event `crm.deal.created` ใน tx
 * `tx` = เข้าร่วมธุรกรรมของผู้เรียก (แปลง lead · C1.4) — ผู้เรียกถือล็อกบริษัท/ผู้ติดต่อไว้แล้ว · audit เป็นของผู้เรียก
 */
export async function createDeal(ctx: DealsCtx, actor: MemberActor, input: CreateDealInput, tx?: Tx): Promise<DealDto> {
  try {
    const a = await enter(ctx, actor, tx ?? prisma);
    need(a, "crm.deal.create");
    return await createCore(ctx, a, input, { tx });
  } catch (e) {
    throw mapError(e);
  }
}

async function createCore(ctx: DealsCtx, who: Who, input: CreateDealInput, opts: { tx?: Tx; legacy?: boolean }): Promise<DealDto> {
  const db: Db = opts.tx ?? prisma;
  const title = cleanTitle(input?.title);
  // AUDIT-CLASS X1: pipeline/ขั้น/ผู้ติดต่อ/บริษัท/ผู้ดูแล ต้องเป็นของร้าน+ระบบนี้ทั้งหมด — ตรวจครบก่อนเปิดธุรกรรม
  const pipe = await loadPipeline(ctx, input?.pipelineId, db, { live: true });
  const wantStage = str(input?.stageId);
  const stage = wantStage ? pipe.stages.find((s) => s.id === wantStage) : pipe.stages.find((s) => s.kind === "OPEN");
  if (!stage) {
    throw wantStage
      ? fail("NOT_FOUND", "ขั้นที่เลือกไม่ได้อยู่ใน pipeline นี้ — เลือกขั้นใหม่จากรายการ")
      : fail("VALIDATION", "pipeline นี้ยังไม่มีขั้นที่เปิดอยู่ — เพิ่มขั้นในหน้าตั้งค่า pipeline ก่อนเปิดดีล");
  }
  if (!opts.legacy && stage.kind !== "OPEN") throw fail("VALIDATION", "ดีลใหม่ต้องเริ่มที่ขั้นที่ยังเปิดอยู่ — เลือกขั้นอื่น");
  const contactId = str(input?.contactId);
  const contact = contactId
    ? await db.crmContact.findFirst({ where: { AND: [who ? await contactWhere(ctx, who, { db }) : identityScope(ctx), { id: contactId }] }, select: { id: true, companyId: true, mergedIntoId: true, archivedAt: true } })
    : null;
  if (!contact) throw fail("NOT_FOUND", "ไม่พบผู้ติดต่อที่เลือกในระบบ CRM นี้ — เลือกใหม่จากรายการ");
  if (contact.mergedIntoId) throw fail("VALIDATION", "ผู้ติดต่อนี้ถูกรวมเข้ากับอีกคนแล้ว — เลือกผู้ติดต่อที่เก็บไว้แทน");
  if (contact.archivedAt) throw fail("VALIDATION", "ผู้ติดต่อนี้ถูกเก็บถาวรแล้ว — กู้คืนก่อนถ้าต้องการเปิดดีล");
  const askedCompany = str(input?.companyId);
  let companyId: string | null = null;
  if (askedCompany) {
    const [co] = await companies.companyRefsInTx(db, coCtx(ctx), who, [askedCompany], { live: true });
    if (!co) throw fail("NOT_FOUND", "ไม่พบบริษัทที่เลือกในระบบ CRM นี้ (อาจถูกเก็บถาวรหรือรวมไปแล้ว) — เลือกใหม่จากรายการ");
    companyId = co.id;
  } else {
    companyId = contact.companyId ?? null;
  }
  const owner = str(input?.ownerUserId) ?? actorIdOf(ctx) ?? (who && who.userId ? who.userId : null);
  if (owner) await assertMembers(ctx, [owner], db);
  const collaborators = Array.isArray(input?.collaboratorUserIds) ? [...new Set(input.collaboratorUserIds.filter((x) => typeof x === "string" && x))] : [];
  if (collaborators.length > DEAL_COLLABORATORS_MAX) throw fail("VALIDATION", `ผู้ร่วมดูแลได้ไม่เกิน ${DEAL_COLLABORATORS_MAX} คน`);
  await assertMembers(ctx, collaborators, db, "ผู้ร่วมดูแล");
  const expectedCloseAt = cleanClose(input?.expectedCloseAt);
  const forecastCategory = input?.forecastCategory ? cleanCategory(input.forecastCategory) : "PIPELINE";
  const probabilityOverride = cleanProbability(input?.probabilityOverride);
  const nextStep = cleanNote(input?.nextStep, "ขั้นถัดไป");
  const sourceKind = cleanSource(input?.sourceKind);
  const sourceDetail = isObj(input?.sourceDetail) ? input.sourceDetail : null;
  if (sourceDetail && JSON.stringify(sourceDetail).length > 4000) throw fail("VALIDATION", "รายละเอียดที่มาของดีลยาวเกินไป");
  const tags = cleanTags(input?.tags);
  let lines: NormalizedDealLine[] = [];
  let dealBp = 0;
  let valueSatang: number;
  if (Array.isArray(input?.lines) && input.lines.length > 0) {
    const c = await checkLinesOrThrow(ctx, input.lines, input.discountBp ?? 0);
    const cap = discountCapOf(who);
    if (c.dealDiscountBp > cap || c.lines.some((l) => l.discountBp > cap)) {
      throw fail("VALIDATION", "ส่วนลดเกินเพดานของบัญชีนี้ — สร้างดีลก่อน แล้วเพิ่มรายการที่หน้าดีลเพื่อขออนุมัติส่วนลด");
    }
    lines = c.lines;
    dealBp = c.dealDiscountBp;
    valueSatang = c.valueSatang;
  } else {
    if (input?.discountBp !== undefined && input?.discountBp !== null && input.discountBp !== 0) throw fail("VALIDATION", "ส่วนลดท้ายดีลใช้ได้เมื่อมีรายการสินค้า");
    valueSatang = cleanValue(input?.valueSatang);
  }
  const custom = isObj(input?.fields) ? input.fields : {};
  const customKeys = Object.keys(custom);

  const run = async (tx: Tx) => {
    // AUDIT-CLASS X3: ล็อกแถวบริษัทก่อนแถวดีลเสมอ (แคช openDealCount/wonValueSatang คำนวณใหม่ใต้ล็อกเดียวกัน)
    await companies.lockCompanyRowsInTx(tx, coCtx(ctx), [companyId]);
    // รีวิว C1.5 S5: ลำดับล็อก บริษัท → ผู้ติดต่อ → (แถวดีลใหม่) · อ่านผู้ติดต่อใหม่ใต้ล็อก — ถูกรวม/เก็บถาวรระหว่างรอ = ไม่รับ
    await lockContactRow(tx, ctx, contact.id);
    const live = await tx.crmContact.findFirst({ where: { ...identityScope(ctx), id: contact.id }, select: { companyId: true, mergedIntoId: true, archivedAt: true } });
    if (!live) throw fail("NOT_FOUND", "ไม่พบผู้ติดต่อที่เลือกในระบบ CRM นี้ — เลือกใหม่จากรายการ");
    if (live.mergedIntoId) throw fail("VALIDATION", "ผู้ติดต่อนี้เพิ่งถูกรวมเข้ากับอีกคน — เลือกผู้ติดต่อที่เก็บไว้แทน");
    if (live.archivedAt) throw fail("VALIDATION", "ผู้ติดต่อนี้เพิ่งถูกเก็บถาวร — กู้คืนก่อนถ้าต้องการเปิดดีล");
    // ไม่ระบุบริษัท ⇒ บริษัทของผู้ติดต่อจากแถวที่อ่านใหม่ · เปลี่ยนระหว่างรอล็อก (ไม่ใช่บริษัทที่ล็อกไว้) = ยกเลิกแทนการล็อกย้อนลำดับ
    if (!askedCompany && (live.companyId ?? null) !== companyId) {
      throw fail("CONFLICT", "บริษัทของผู้ติดต่อนี้เพิ่งถูกเปลี่ยนจากที่อื่นพร้อมกัน ระบบจึงยังไม่บันทึก — รีเฟรชหน้าแล้วลองอีกครั้ง");
    }
    // รีวิว C1.5 S6: pipeline ถูกเก็บถาวรระหว่างรอ (archivePipeline ล็อกแถวเดียวกันแบบ FOR UPDATE) = ไม่รับ
    await lockPipelineShared(tx, ctx, pipe.id);
    if (askedCompany) {
      // ลิงก์ผู้ติดต่อ↔บริษัท อ่านใต้ล็อกบริษัท (companies.ts เปลี่ยนลิงก์ใต้ล็อกเดียวกัน) — ไม่อยู่ในบริษัทนี้ = ไม่รับ
      const link = await tx.crmCompanyContact.findFirst({ where: { companyId: askedCompany, contactId: contact.id, endedAt: null }, select: { id: true } });
      if (!link) throw fail("VALIDATION", "ผู้ติดต่อคนนี้ไม่ได้อยู่ในบริษัทที่เลือก — เพิ่มผู้ติดต่อเข้าบริษัทก่อน หรือเลือกบริษัทของผู้ติดต่อ");
    }
    const now = new Date();
    const state = dealStateForStage(stage.kind, now);
    const row = await tx.crmDeal.create({
      data: {
        tenantId: ctx.tenantId,
        systemId: ctx.systemId,
        contactId: contact.id,
        companyId,
        pipelineId: pipe.id,
        stageId: stage.id,
        title,
        valueSatang,
        discountBp: dealBp,
        kind: state.kind,
        closedAt: state.closedAt,
        wonValueSatang: state.kind === "WON" ? BigInt(valueSatang) : null,
        expectedCloseAt,
        ownerUserId: owner,
        collaboratorUserIds: collaborators,
        forecastCategory,
        probabilityOverride,
        nextStep,
        sourceKind,
        ...(sourceDetail ? { sourceDetail: sourceDetail as Prisma.InputJsonValue } : {}),
        tags,
        stageEnteredAt: now,
      },
    });
    await tx.crmDealStageHistory.create({ data: { tenantId: ctx.tenantId, dealId: row.id, fromStageId: null, toStageId: stage.id, byUserId: actorIdOf(ctx), bySource: who ? "MANUAL" : "API", enteredAt: now } });
    if (lines.length > 0) await tx.crmDealLine.createMany({ data: lines.map((l, i) => lineRow(ctx, row.id, l, i)) });
    if (customKeys.length > 0) {
      // แถวใหม่: ยังไม่มีใครถือล็อก engine ของมันได้ (id เพิ่งเกิดใน tx นี้) — ล็อกก่อนเขียนค่าตามกติกาของ engine
      await (await engine()).lockRecordForFieldWrite(tx, row.id);
      await (await engine()).setFieldValues(fctx(ctx, who), row.id, custom, { via: "STAFF", byUserId: actorIdOf(ctx) }, tx);
    }
    await companies.recomputeDealCachesInTx(tx, coCtx(ctx), [companyId]);
    await emitDeal(tx, ctx, EVT.created, row.id, "1", { dealId: row.id, contactId: contact.id, companyId, pipelineId: pipe.id, stageId: stage.id, ownerUserId: owner });
    return row;
  };
  const row = opts.tx ? await run(opts.tx) : await prisma.$transaction(run, TX_OPTS);
  if (!opts.tx) {
    await audit(ctx, "crm.deal.create", row.id, { after: { pipelineId: row.pipelineId, stageId: row.stageId, contactId: row.contactId, companyId: row.companyId, valueSatang: row.valueSatang, lines: lines.length, fields: customKeys } });
  }
  return toDto(row);
}

function lineRow(ctx: DealsCtx, dealId: string, l: NormalizedDealLine, i: number): Prisma.CrmDealLineCreateManyInput {
  return { tenantId: ctx.tenantId, dealId, productId: l.productId, name: l.name, qty: l.qty, unitPriceSatang: l.unitPriceSatang, discountBp: l.discountBp, vatRateBp: l.vatRateBp, note: l.note, sortOrder: i };
}

// ═════════════════════════ ย้ายขั้น ═════════════════════════

/**
 * ย้ายดีลไปขั้นปลายทาง (ใน pipeline เดียวกัน) — AUDIT-CLASS X3: ต่อดีลเรียงคิวด้วยล็อกแถว (ข้ามโพรเซสก็เรียงที่ฐานข้อมูล)
 *   ⇒ แถวประวัติที่เปิดอยู่มีได้แถวเดียว · `crm.deal.won` ยิงครั้งเดียวต่อการเข้า WON หนึ่งครั้ง (คนที่มาทีหลังเห็นว่าอยู่ขั้นนั้นแล้ว = ไม่ทำอะไร)
 * เงื่อนไขของขั้นปลายทาง (requireFields/requireLines/requireQuotation) ไม่ครบ ⇒ STAGE_REQUIREMENTS + `.missing` — ไม่เขียนอะไรเลย
 * LOST ต้องมีเหตุผลที่ยังใช้งานของระบบนี้ · ออกจาก WON/LOST = เปิดใหม่ (MANAGER+ · reopenedCount + 1)
 */
export async function moveDeal(ctx: DealsCtx, actor: MemberActor, id: string, input: MoveDealInput): Promise<DealDto> {
  const a = await enter(ctx, actor);
  await loadDeal(ctx, a, id);
  need(a, "crm.deal.move");
  return (await moveCore(ctx, a, id, input, {})).deal;
}

type MoveOutcome = { deal: DealDto; changed: boolean; fromStageId: string; histId: string | null; reopened: boolean };

async function moveCore(ctx: DealsCtx, who: Who, id: string, input: MoveDealInput, opts: { legacy?: boolean; reopenReason?: string; flag?: BridgeMoveFlag }): Promise<MoveOutcome> {
  const stageId = str(input?.stageId);
  if (!stageId) throw fail("VALIDATION", "เลือกขั้นปลายทางก่อน");
  // AUDIT-CLASS X1: ขั้นต้องเป็นของระบบนี้ (ขั้นของระบบ/ร้านอื่น = ไม่พบ) · ต้องอยู่ใน pipeline ของดีล (ตรวจใต้ล็อก)
  const target = await prisma.crmStage.findFirst({ where: { ...identityScope(ctx), id: stageId } });
  if (!target) throw fail("NOT_FOUND", "ไม่พบขั้นนี้ในระบบ CRM ที่เปิดอยู่ — รีเฟรชหน้าแล้วลองใหม่");
  let lostReasonId: string | null = null;
  if (target.kind === "LOST") {
    const lr = str(input?.lostReasonId);
    if (lr) {
      const row = await prisma.crmLostReason.findFirst({ where: { ...identityScope(ctx), id: lr } });
      if (!row) throw fail("NOT_FOUND", "ไม่พบเหตุผลที่แพ้นี้ในระบบ CRM นี้ — เลือกใหม่จากรายการ");
      if (!row.active) throw fail("VALIDATION", "เหตุผลนี้ถูกปิดใช้งานแล้ว — เลือกเหตุผลอื่นจากรายการ");
      lostReasonId = row.id;
    } else if (!opts.legacy && !opts.flag) {
      throw fail("VALIDATION", "ก่อนปิดดีลเป็น \"แพ้\" เลือกเหตุผลที่แพ้ก่อน — ทีมจะใช้ดูว่าเสียดีลเพราะอะไรบ่อยที่สุด");
    }
  }
  const note = cleanNote(input?.note, "โน้ตการย้ายขั้น");
  const lostNote = target.kind === "LOST" ? cleanNote(input?.lostNote, "รายละเอียดที่แพ้") : null;
  const rfv = isObj(input?.requireFieldsValues) ? input.requireFieldsValues : {};
  const split = Object.keys(rfv).length > 0 ? splitRequireValues(rfv) : { columns: {}, custom: {} };
  const hasCustom = Object.keys(split.custom).length > 0;

  // CRM C2.7 ▸ R-E.7: ดีลที่ "รับเงินจริง" มาแล้ว (มีแถว CrmDealPayment ที่ถูกนับ) มีภาพมูลค่าของตัวเอง = ยอดเอกสาร/บิลที่รับเงิน
  //   ⇒ ย้ายขั้นต้องไม่ล้างค่านั้นทิ้ง และไม่ทับด้วย valueSatang · ยังไม่มีเงินเข้าเลย (null) = พฤติกรรมเดิมของ C1.5 ทุกประการ
  //   อ่านผ่าน `payments.ts` (เจ้าของตารางเงิน · อ่านยอดเอกสารผ่าน facade บัญชี) ด้วย dynamic import — ไม่มีวงโหลด
  // 🔴 มติรอบ 2 (SF-3): **อ่านใต้ล็อกด้วย tx ของการย้ายเสมอ** — อ่านก่อนล็อกแล้วเขียนทีหลังคือ TOCTOU:
  //    เงินที่เพิ่งถูกนับระหว่างรอล็อก (ตัวรับ `pos.sale.paid` / `account.payment.recorded`) จะถูกทับเป็น null ⇒ ยอดที่รับจริงหาย
  // 🔴 มติรอบ 2 (SF-3): ประตู v2 — ร้านที่ยังใช้ CRM รุ่นเดิมไม่มีทางเดินเงินของ v2 ⇒ ไม่อ่าน ไม่มีผลกับ `wonValueSatang` เดิมของ C1.5
  const moneyGate = (await crmUiVersion(identityScope(ctx))) === 2;
  let paidWonValue: bigint | null = null;
  const out = await withDealLocks(ctx, who, id, { contact: target.kind === "WON", engine: hasCustom }, async (tx, deal) => {
    // อ่านใต้ล็อกแถวดีล (withDealLocks ถือ `FOR UPDATE` ของแถวนี้แล้ว — ทางเดินเงินก็ล็อกแถวเดียวกันก่อนเขียน)
    //   relock/retry = อ่านซ้ำเองรอบใหม่ (ค่าเป็นของรอบนั้น ๆ เสมอ)
    paidWonValue = moneyGate ? await (await import("./payments")).countedWonValueOf(identityScope(ctx), deal.id, tx).catch(() => null) : null;
    if (target.pipelineId !== deal.pipelineId) throw fail("NOT_FOUND", "ขั้นนี้ไม่ได้อยู่ใน pipeline ของดีลนี้ — เลือกขั้นจากกระดานของดีลนี้");
    // CRM C1.8 ▸ AUDIT-CLASS X4 (H5): ย้ายจากสะพาน = "ตรวจธงก่อน" ใต้ advisory lock ต่อธง + ล็อกแถวดีล — ธงมีแล้ว = ไม่ทำอะไร ·
    //   แถวธง (กิจกรรม AUTO `sourceRef` = ธง) เขียน **ใน tx เดียวกับการย้าย และเฉพาะเมื่อย้ายจริง** (ไม่ย้าย = ไม่มีโน้ต) ·
    //   ย้ายล้ม (เงื่อนไขขั้น/ฐานข้อมูล) = ไม่มีทั้งการย้ายและธง ◂
    if (opts.flag) {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`crm:deal-bridge:${deal.id}:${opts.flag.ref}`}, 0))`;
      const done = await tx.crmActivity.findFirst({ where: { ...identityScope(ctx), dealId: deal.id, source: "AUTO", sourceRef: opts.flag.ref }, select: { id: true } });
      if (done) return { row: deal, changed: false, histId: null, from: deal.stageId, reopened: false };
    }
    // รีวิว C1.5 S7: อ่านชนิดของขั้นแบบ FOR SHARE (updateStage/deleteStage ล็อก FOR UPDATE) — ถูกเปลี่ยน/ลบระหว่างรอ = ไม่ย้าย
    const fresh = await tx.$queryRaw<{ kind: string; pipelineId: string }[]>`SELECT "kind"::text AS "kind", "pipelineId" FROM "CrmStage" WHERE "id" = ${target.id} AND "tenantId" = ${ctx.tenantId} AND "systemId" = ${ctx.systemId} FOR SHARE`;
    if (fresh.length === 0 || fresh[0]!.kind !== target.kind || fresh[0]!.pipelineId !== deal.pipelineId) {
      throw fail("CONFLICT", "ขั้นนี้เพิ่งถูกแก้ไขหรือลบจากหน้าตั้งค่า — รีเฟรชหน้าแล้วลองอีกครั้ง");
    }
    if (deal.stageId === target.id) return { row: deal, changed: false, histId: null, from: deal.stageId, reopened: false };
    const fromClosed = deal.kind !== "OPEN";
    // §11.3: ออกจาก WON/LOST = เปิดดีลใหม่ — ผู้จัดการ/เจ้าของร้านเท่านั้น
    if (fromClosed && !isManager(who)) {
      throw fail("FORBIDDEN", "ดีลที่ปิดแล้ว (ชนะ/แพ้) เปิดใหม่หรือย้ายได้เฉพาะผู้จัดการหรือเจ้าของร้าน — ขอให้ผู้จัดการช่วยดำเนินการ");
    }
    // รีวิว C1.5 S3 · AUDIT-CLASS X9: ปิด → เปิด = "เปิดดีลใหม่" ต้องผ่าน reopenDeal (ยืนยัน + เหตุผล) เท่านั้น · ทาง v1 คงพฤติกรรมเดิม
    if (fromClosed && target.kind === "OPEN" && opts.reopenReason === undefined && !opts.legacy) {
      throw fail("CONFIRM_REQUIRED", "ดีลนี้ปิดแล้ว การย้ายกลับไปขั้นที่เปิดอยู่คือ \"เปิดดีลใหม่\" — ใช้ปุ่มเปิดดีลใหม่ แล้วยืนยันพร้อมเหตุผล");
    }
    // รีวิว C1.5 S1: won/lost ยิงเฉพาะ "การเข้า" ขั้นชนิดนั้นจากชนิดอื่น — ย้ายระหว่างขั้นชนะ 2 ขั้น (หรือแพ้ 2 ขั้น) = stage.changed อย่างเดียว
    const intoWon = target.kind === "WON" && deal.kind !== "WON";
    const intoLost = target.kind === "LOST" && deal.kind !== "LOST";
    let working = deal;
    if (Object.keys(split.columns).length > 0) working = await tx.crmDeal.update({ where: { id: deal.id }, data: split.columns });
    if (hasCustom) await (await engine()).setFieldValues(fctx(ctx, who), deal.id, split.custom, { via: "STAFF", byUserId: actorIdOf(ctx) }, tx);
    const missing = await missingFor(tx, ctx, who, working, target);
    if (missing.length > 0) throw fail("STAGE_REQUIREMENTS", await missingMessage(ctx, who, target, missing), { missing });

    // ประวัติขั้น: ปิดแถวที่เปิดอยู่ (leftAt · durationSec เต็มวินาที) → เปิดแถวใหม่ · เวลาเดินหน้าเสมอ (เรียงลำดับได้แน่นอน)
    const open = await tx.crmDealStageHistory.findMany({ where: { dealId: deal.id, leftAt: null } });
    let now = new Date();
    const latest = open.reduce((m, h) => Math.max(m, h.enteredAt.getTime()), 0);
    if (now.getTime() <= latest) now = new Date(latest + 1);
    for (const h of open) {
      await tx.crmDealStageHistory.update({ where: { id: h.id }, data: { leftAt: now, durationSec: Math.max(0, Math.floor((now.getTime() - h.enteredAt.getTime()) / 1000)) } });
    }
    const hist = await tx.crmDealStageHistory.create({
      data: { tenantId: ctx.tenantId, dealId: deal.id, fromStageId: deal.stageId, toStageId: target.id, byUserId: actorIdOf(ctx), bySource: who ? "MANUAL" : "API", enteredAt: now, note: opts.reopenReason ?? note },
    });
    const state = dealStateForStage(target.kind as CrmStageKind, now);
    const reopened = fromClosed && target.kind === "OPEN";
    const row = await tx.crmDeal.update({
      where: { id: deal.id },
      data: {
        stageId: target.id,
        kind: state.kind,
        closedAt: state.closedAt,
        stageEnteredAt: now,
        stalledAt: null,
        lastActivityAt: now,
        lostReasonId: target.kind === "LOST" ? lostReasonId : null,
        lostReason: target.kind === "LOST" ? lostNote : reopened ? null : working.lostReason,
        // R-E.7 (มติผู้คุมงาน C1.5 ข้อ 3): เข้า WON = ถ่ายภาพมูลค่า ณ ตอนชนะ (ครั้งเดียวต่อการเข้า) · WON→WON คงภาพเดิม · C2.7 ปรับตามเอกสารที่รับเงินจริง
        wonValueSatang: paidWonValue !== null ? paidWonValue : intoWon ? BigInt(working.valueSatang) : target.kind === "WON" ? working.wonValueSatang : null,
        ...(reopened ? { reopenedCount: { increment: 1 } } : {}),
      },
    });
    // WON ⇒ lifecycle ของผู้ติดต่อตามกติกา (rules.lifecycleAfterDealWon) — แถวผู้ติดต่อล็อกไว้แล้ว (บริษัท → ผู้ติดต่อ → ดีล)
    const contact = intoWon ? await advanceLifecycleOnWin(tx, ctx, row.contactId) : null;
    // AUDIT-CLASS X3: แคชบริษัทคำนวณใหม่ใต้ล็อกแถวบริษัท (ใน tx เดียวกับการย้าย) ⇒ ตรงกับความจริงหลัง commit เสมอ
    await companies.recomputeDealCachesInTx(tx, coCtx(ctx), [row.companyId]);
    await emitDeal(tx, ctx, EVT.stageChanged, row.id, hist.id, { dealId: row.id, pipelineId: row.pipelineId, fromStageId: deal.stageId, toStageId: target.id, kind: row.kind });
    if (intoWon) {
      // CRM C1.8 ▸ AUDIT-CLASS X8: payload ของ `crm.deal.won` เป็น id ล้วน (มติผู้คุมงาน C1.5 ข้อ 1 · R-C.8) — ไม่มีชื่อ/เบอร์/อีเมล/ชื่อดีล
      //   ผู้รับ (สะพานสมาชิก `onCrmDealWon`) โหลดทุกอย่างจากฐานด้วย id เอง ◂
      // รีวิว C1.5 S2: ทาง v1 = key ต่อดีล (`crm.deal.won#<dealId>` — ยิงครั้งเดียวต่อดีลตลอดอายุ เหมือนก่อน C1.5) · ทาง v2 = ต่อการเข้า WON (`#<histId>`)
      await emitDeal(tx, ctx, EVT.won, row.id, opts.legacy ? null : hist.id, {
        dealId: row.id,
        contactId: row.contactId,
        companyId: row.companyId,
        partyId: contact?.partyId ?? null,
        valueSatang: row.valueSatang,
        ownerUserId: row.ownerUserId,
      });
    }
    if (intoLost) await emitDeal(tx, ctx, EVT.lost, row.id, hist.id, { dealId: row.id, lostReasonId });
    if (reopened) await emitDeal(tx, ctx, EVT.reopened, row.id, hist.id, { dealId: row.id, fromStageId: deal.stageId, toStageId: target.id });
    // CRM C1.8 ▸ ธงของสะพาน = กิจกรรม AUTO ผ่านผู้เขียนกิจกรรมที่เดียว (`activities.recordSystemActivityInTx` · ไม่ยิง crm.activity.logged) ◂
    const flagNote = opts.flag
      ? await recordSystemActivityInTx(tx, ctx, { type: "NOTE", source: "AUTO", sourceRef: opts.flag.ref, title: opts.flag.title, contactId: row.contactId, companyId: row.companyId, dealId: row.id })
      : null;
    return { row, changed: true, histId: hist.id, from: deal.stageId, reopened, flagNote };
  });
  if (out.changed && "flagNote" in out && out.flagNote) await auditSystemActivity(ctx, out.flagNote, "account.quotation.responded");
  if (out.changed) {
    await audit(ctx, out.reopened ? "crm.deal.reopen" : "crm.deal.move", out.row.id, {
      before: { stageId: out.from },
      after: { stageId: out.row.stageId, kind: out.row.kind, lostReasonId: out.row.lostReasonId, ...(opts.reopenReason ? { reason: opts.reopenReason } : {}) },
    });
  }
  return { deal: toDto(out.row), changed: out.changed, fromStageId: out.from, histId: out.histId, reopened: out.reopened };
}

/** WON → เลื่อน lifecycle ของผู้ติดต่อ (เขียนคอลัมน์ lifecycleStage คอลัมน์เดียว) แล้วคืน partyId ที่ payload (id ล้วน) ของ `crm.deal.won` ใช้ */
async function advanceLifecycleOnWin(tx: Tx, ctx: DealsCtx, contactId: string): Promise<{ partyId: string | null } | null> {
  const c = await tx.crmContact.findFirst({ where: { id: contactId, tenantId: ctx.tenantId }, select: { id: true, lifecycleStage: true, partyId: true } });
  if (!c) return null;
  const next = lifecycleAfterDealWon(c.lifecycleStage);
  if (next !== c.lifecycleStage) await tx.crmContact.updateMany({ where: { id: c.id, tenantId: ctx.tenantId }, data: { lifecycleStage: next } });
  return c;
}

/** §11.3: เปิดดีลที่ปิดแล้ว (WON/LOST) กลับเป็นเปิด — MANAGER+ · ยืนยัน + เหตุผล (AUDIT-CLASS X9) · ขั้นเปิดแรกเมื่อไม่ระบุ */
export async function reopenDeal(ctx: DealsCtx, actor: MemberActor, id: string, opts: DangerOpts & { stageId?: string | null }): Promise<DealDto> {
  const reason = reasonOf(opts, "เปิดดีลใหม่");
  const a = await enter(ctx, actor);
  if (!isManager(a)) throw fail("FORBIDDEN", "การเปิดดีลที่ปิดแล้วทำได้เฉพาะผู้จัดการหรือเจ้าของร้าน — ขอให้ผู้จัดการช่วยดำเนินการ");
  const deal = await loadDeal(ctx, a, id);
  need(a, "crm.deal.move");
  if (deal.kind === "OPEN") throw fail("VALIDATION", "ดีลนี้ยังเปิดอยู่ ไม่ต้องเปิดใหม่");
  const pipe = await loadPipeline(ctx, deal.pipelineId);
  const want = str(opts?.stageId);
  const stage = want ? pipe.stages.find((s) => s.id === want) : pipe.stages.find((s) => s.kind === "OPEN");
  if (!stage) throw fail(want ? "NOT_FOUND" : "VALIDATION", want ? "ขั้นที่เลือกไม่ได้อยู่ใน pipeline ของดีลนี้" : "pipeline นี้ไม่มีขั้นที่เปิดอยู่ — เพิ่มขั้นก่อน");
  if (stage.kind !== "OPEN") throw fail("VALIDATION", "เปิดดีลใหม่ต้องเลือกขั้นที่ยังเปิดอยู่");
  return (await moveCore(ctx, a, id, { stageId: stage.id }, { reopenReason: reason })).deal;
}

/** R-A: ย้ายดีลข้าม pipeline (MANAGER+) — ไปขั้นเปิดแรกของ pipeline ปลายทาง · บันทึกประวัติขั้น · ดีลที่ปิดแล้วต้องเปิดใหม่ก่อน */
export async function changePipeline(ctx: DealsCtx, actor: MemberActor, id: string, input: { pipelineId: string }): Promise<DealDto> {
  const a = await enter(ctx, actor);
  if (!isManager(a)) throw fail("FORBIDDEN", "การย้ายดีลข้าม pipeline ทำได้เฉพาะผู้จัดการหรือเจ้าของร้าน");
  await loadDeal(ctx, a, id);
  need(a, "crm.deal.update");
  const pipe = await loadPipeline(ctx, input?.pipelineId, prisma, { live: true });
  const first = pipe.stages.find((s) => s.kind === "OPEN");
  if (!first) throw fail("VALIDATION", "pipeline ปลายทางยังไม่มีขั้นที่เปิดอยู่ — เพิ่มขั้นก่อน");
  const out = await withDealLocks(ctx, a, id, {}, async (tx, deal) => {
    if (deal.pipelineId === pipe.id) return { row: deal, from: deal.stageId, fromPipe: deal.pipelineId, changed: false };
    if (deal.kind !== "OPEN") throw fail("VALIDATION", "ดีลที่ปิดแล้วย้าย pipeline ไม่ได้ — เปิดดีลใหม่ก่อน");
    await lockPipelineShared(tx, ctx, pipe.id);
    const firstNow = await tx.crmStage.findFirst({ where: { ...identityScope(ctx), id: first.id, pipelineId: pipe.id, kind: "OPEN" }, select: { id: true } });
    if (!firstNow) throw fail("CONFLICT", "ขั้นของ pipeline ปลายทางเพิ่งถูกแก้ — รีเฟรชหน้าแล้วลองใหม่");
    const open = await tx.crmDealStageHistory.findMany({ where: { dealId: deal.id, leftAt: null } });
    let now = new Date();
    const latest = open.reduce((m, h) => Math.max(m, h.enteredAt.getTime()), 0);
    if (now.getTime() <= latest) now = new Date(latest + 1);
    for (const h of open) {
      await tx.crmDealStageHistory.update({ where: { id: h.id }, data: { leftAt: now, durationSec: Math.max(0, Math.floor((now.getTime() - h.enteredAt.getTime()) / 1000)) } });
    }
    const hist = await tx.crmDealStageHistory.create({ data: { tenantId: ctx.tenantId, dealId: deal.id, fromStageId: deal.stageId, toStageId: first.id, byUserId: actorIdOf(ctx), bySource: "MANUAL", enteredAt: now, note: "ย้าย pipeline" } });
    const row = await tx.crmDeal.update({ where: { id: deal.id }, data: { pipelineId: pipe.id, stageId: first.id, kind: "OPEN", closedAt: null, stageEnteredAt: now, stalledAt: null, lastActivityAt: now } });
    await companies.recomputeDealCachesInTx(tx, coCtx(ctx), [row.companyId]);
    await emitDeal(tx, ctx, EVT.stageChanged, row.id, hist.id, { dealId: row.id, pipelineId: pipe.id, fromPipelineId: deal.pipelineId, fromStageId: deal.stageId, toStageId: first.id, kind: row.kind });
    return { row, from: deal.stageId, fromPipe: deal.pipelineId, changed: true };
  });
  if (out.changed) await audit(ctx, "crm.deal.change_pipeline", out.row.id, { before: { pipelineId: out.fromPipe, stageId: out.from }, after: { pipelineId: out.row.pipelineId, stageId: out.row.stageId } });
  return toDto(out.row);
}

// ═════════════════════════ แก้ฟิลด์ทีละเรื่อง ═════════════════════════

/** เขียนคอลัมน์ของดีล 1 ใบ + event `crm.deal.updated` (changedKeys) ใน tx เดียว — ค่าไม่เปลี่ยน = ไม่ยิง */
async function simpleUpdate(
  ctx: DealsCtx,
  who: Who,
  id: string,
  compute: (deal: CrmDeal) => { data: Prisma.CrmDealUpdateInput; keys: string[] },
  opts: { event?: "updated" | "reassigned"; engineValues?: Record<string, unknown>; action: string; guard?: (tx: Tx, deal: CrmDeal) => Promise<void> } = { action: "crm.deal.update" },
): Promise<DealDto> {
  const engineValues = opts.engineValues ?? {};
  const hasCustom = Object.keys(engineValues).length > 0;
  const out = await withDealLocks(ctx, who, id, { engine: hasCustom }, async (tx, deal) => {
    if (opts.guard) await opts.guard(tx, deal);
    const { data, keys } = compute(deal);
    let row = deal;
    if (Object.keys(data).length > 0) row = await tx.crmDeal.update({ where: { id: deal.id }, data });
    const changed = [...keys];
    if (hasCustom) {
      const r = await (await engine()).setFieldValues(fctx(ctx, who), deal.id, engineValues, { via: "STAFF", byUserId: actorIdOf(ctx) }, tx);
      changed.push(...r.changed.map((k) => `f.${k}`));
    }
    if (changed.length > 0) {
      if (opts.event === "reassigned") {
        await emitDeal(tx, ctx, EVT.reassigned, deal.id, newSeq(), { dealId: deal.id, ownerUserId: row.ownerUserId, previousOwnerUserId: deal.ownerUserId });
      } else {
        await emitDeal(tx, ctx, EVT.updated, deal.id, newSeq(), { dealId: deal.id, changedKeys: changed });
      }
    }
    return { row, before: deal, changed };
  });
  if (out.changed.length > 0) {
    const pick = (r: CrmDeal) => Object.fromEntries(out.changed.filter((k) => !k.startsWith("f.")).map((k) => [k, (r as unknown as Record<string, unknown>)[k] ?? null]));
    await audit(ctx, opts.action, out.row.id, { before: jsonSafe(pick(out.before)), after: { ...jsonSafe(pick(out.row)), changedKeys: out.changed } });
  }
  return toDto(out.row);
}

function jsonSafe(o: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(o).map(([k, v]) => [k, typeof v === "bigint" ? v.toString() : v instanceof Date ? v.toISOString() : v]));
}

// CRM C1.7 ▸ โอนดีล + ข้ามทีม (พิมพ์เขียว §6.2 · §6.3 · R-C.10 · มติผู้คุมงาน C1.7 ข้อ 7)
/**
 * โอนผู้ดูแล (ผู้ใช้ของร้านนี้เท่านั้น) — event `crm.deal.reassigned` + AuditLog `crm.deal.reassign` ใน tx เดียวกับการเขียน
 * ข้ามทีม = ดีลมีทีมอยู่แล้ว และ "ทีมปลายทาง" (teamId ที่ส่งมา · ไม่ส่ง = ทีมของผู้ดูแลคนใหม่ ถ้าเขาอยู่ทีมเดิมของดีลถือว่าไม่ข้าม)
 *   ต่างจากทีมของดีล ⇒ ต้องมีคีย์ `crm.deal.reassign` (ไม่มี = FORBIDDEN ข้อความไทย แถวไม่เปลี่ยน)
 * เพดานต่อวัน `crm._maxReassignPerDay` (ต่อผู้ทำ ต่อวันไทย · ไม่ตั้ง = ไม่จำกัด · OWNER ไม่มีเพดาน):
 *   ครบเพดานแล้ว ⇒ ยื่นสายอนุมัติ `crm.reassign` (entityId `<dealId>:<seq>`) — มีสาย = โยน APPROVAL_REQUIRED (+approvalRequestId)
 *   และดีลไม่เปลี่ยน · ไม่มีสาย = โอนเลย (ผลของการอนุมัติเป็นของใบ C3.2 — approval-effects)
 * AUDIT-CLASS X3: ตัวนับรายวันแม่นแม้ยิงพร้อมกันหลายโพรเซส — advisory lock ต่อ (ร้าน · ผู้ทำ · วันไทย) แล้ว "นับแถว audit
 *   ของการโอนข้ามทีมที่สำเร็จวันนี้ + เขียนดีล + เขียนแถว audit" ใน tx เดียว (ไม่อ่าน→คิดในแอป→เขียนข้าม tx)
 * teamId ที่ส่งมา = ดีลย้ายไปทีมนั้นด้วย (ต้องเป็นทีมของร้านนี้ที่ยังไม่เก็บถาวร) · ไม่ส่ง + ข้ามทีม = ดีลย้ายไปทีมของผู้ดูแลคนใหม่
 *   (อยู่ทีมเดียว = ทีมนั้น · ไม่อยู่ทีมไหน = ดีลไม่มีทีม · หลายทีม = VALIDATION ให้เลือกทีม พร้อมรายชื่อทีม) — รีวิว C1.7 ข้อ 7
 */
export async function reassignDeal(ctx: DealsCtx, actor: MemberActor, id: string, input: { ownerUserId: string | null; teamId?: string | null }): Promise<DealDto> {
  const a = await enter(ctx, actor);
  const pre = await loadDeal(ctx, a, id);
  need(a, "crm.deal.update");
  const owner = str(input?.ownerUserId);
  if (owner) await assertMembers(ctx, [owner]);
  const teamIn = str(input?.teamId);
  if (teamIn && !(await prisma.team.findFirst({ where: { id: teamIn, tenantId: ctx.tenantId, archivedAt: null }, select: { id: true } }))) {
    throw fail("NOT_FOUND", "ไม่พบทีมปลายทางในร้านนี้ — เลือกทีมจากรายการ");
  }
  const ownerTeams = owner
    ? (await prisma.teamMember.findMany({ where: { tenantId: ctx.tenantId, userId: owner, team: { archivedAt: null } }, select: { teamId: true }, orderBy: { joinedAt: "asc" } })).map((t) => t.teamId)
    : [];
  const crossOf = (dealTeam: string | null): boolean => {
    if (!dealTeam) return false;
    if (teamIn) return teamIn !== dealTeam;
    if (!owner) return false;
    return !ownerTeams.includes(dealTeam);
  };
  /** ทีมปลายทางของการโอนข้ามทีม (undefined = ไม่เปลี่ยนทีม) — ผู้ดูแลใหม่อยู่หลายทีมและไม่ได้เลือก = ถามกลับ */
  const ambiguousMsg = async () => {
    const names = (await prisma.team.findMany({ where: { id: { in: ownerTeams }, tenantId: ctx.tenantId }, select: { name: true }, orderBy: { name: "asc" } })).map((t) => t.name);
    return `ผู้ดูแลคนใหม่อยู่หลายทีม (${names.join(" · ")}) — เลือกทีมที่จะย้ายดีลไปก่อน แล้วลองอีกครั้ง`;
  };
  const targetTeamOf = (dealTeam: string | null): string | null | undefined | "AMBIGUOUS" => {
    if (teamIn) return teamIn;
    if (!crossOf(dealTeam)) return undefined;
    if (ownerTeams.length === 0) return null;
    return ownerTeams.length === 1 ? ownerTeams[0]! : "AMBIGUOUS";
  };
  if (crossOf(pre.teamId)) need(a, "crm.deal.reassign");
  if (targetTeamOf(pre.teamId) === "AMBIGUOUS") throw fail("VALIDATION", await ambiguousMsg());
  const cap = a.role === "OWNER" ? undefined : crmParam(a, "crm._maxReassignPerDay");
  const actorId = actorIdOf(ctx) ?? a.userId;
  const dayStart = thaiDayUtc(new Date())!;
  const dayFrom = new Date(dayStart.getTime() - 7 * 3_600_000); // 00:00 เวลาไทย = 17:00 UTC ของวันก่อน
  const apply = async (enforceCap: boolean) =>
    withDealLocks(ctx, a, id, {}, async (tx, deal) => {
      const cross = crossOf(deal.teamId);
      if (cross && !crmCan(a, "crm.deal.reassign")) throw fail("FORBIDDEN", crmForbiddenMessage("crm.deal.reassign"));
      if (cross && enforceCap && cap !== undefined) {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`crm:reassign-cap:${ctx.tenantId}:${actorId}:${dayKey(dayStart)}`}, 0))`;
        const used = await tx.auditLog.count({
          where: { tenantId: ctx.tenantId, actorId, action: "crm.deal.reassign", createdAt: { gte: dayFrom }, after: { path: ["crossTeam"], equals: true } },
        });
        if (used >= Math.max(0, Math.floor(cap))) return { over: true as const };
      }
      const data: Prisma.CrmDealUpdateInput = {};
      if (deal.ownerUserId !== owner) data.ownerUserId = owner;
      const target = targetTeamOf(deal.teamId);
      if (target === "AMBIGUOUS") throw fail("VALIDATION", "ผู้ดูแลคนใหม่อยู่หลายทีม — เลือกทีมที่จะย้ายดีลไปก่อน แล้วลองอีกครั้ง");
      if (target !== undefined && deal.teamId !== target) data.teamId = target;
      if (Object.keys(data).length === 0) return { over: false as const, row: deal, changed: false };
      const row = await tx.crmDeal.update({ where: { id: deal.id }, data });
      await emitDeal(tx, ctx, EVT.reassigned, deal.id, newSeq(), { dealId: deal.id, ownerUserId: row.ownerUserId, previousOwnerUserId: deal.ownerUserId, teamId: row.teamId, previousTeamId: deal.teamId });
      // AUDIT-CLASS X9: แถว audit อยู่ใน tx เดียวกับการเขียน — เป็นทั้งหลักฐานและ "ตัวนับ" ของเพดานรายวัน (crossTeam)
      await tx.auditLog.create({
        data: {
          tenantId: ctx.tenantId,
          actorType: ctx.actorUserId ? "USER" : "SYSTEM",
          actorId,
          action: "crm.deal.reassign",
          targetType: "CrmDeal",
          targetId: deal.id,
          before: { ownerUserId: deal.ownerUserId, teamId: deal.teamId },
          after: { ownerUserId: row.ownerUserId, teamId: row.teamId, crossTeam: cross },
        },
      });
      return { over: false as const, row, changed: true };
    });
  const first = await apply(true);
  if (!first.over) return toDto(first.row);
  // เกินเพดานของวันนี้ ⇒ สายอนุมัติ `crm.reassign` (R-C.10) — คำขอใหม่ต่อการยื่น · ดีลยังไม่เปลี่ยน
  const sub = await (await approvalFacade()).submitForApproval(
    { tenantId: ctx.tenantId },
    { entityType: "crm.reassign", entityId: `${pre.id}:${newSeq()}`, systemId: ctx.systemId, requestedById: a.userId },
  );
  if ("requestId" in sub) {
    await audit(ctx, "crm.deal.reassign.pending", pre.id, { after: { approvalRequestId: sub.requestId, ownerUserId: owner, teamId: teamIn ?? null } });
    throw fail("APPROVAL_REQUIRED", "โอนดีลข้ามทีมวันนี้ครบจำนวนที่ทำได้เองแล้ว ระบบส่งคำขออนุมัติให้ผู้จัดการแล้ว — ดีลจะย้ายเมื่อได้รับอนุมัติ", { approvalRequestId: sub.requestId });
  }
  const second = await apply(false);
  if (second.over) throw fail("CONFLICT", RACE_MSG);
  return toDto(second.row);
}
// ◂ CRM C1.7

/** หมวดพยากรณ์ (PIPELINE · BEST_CASE · COMMIT · OMITTED) */
export async function setForecastCategory(ctx: DealsCtx, actor: MemberActor, id: string, category: string): Promise<DealDto> {
  const a = await enter(ctx, actor);
  await loadDeal(ctx, a, id);
  need(a, "crm.deal.forecast");
  const cat = cleanCategory(category);
  return simpleUpdate(ctx, a, id, (d) => (d.forecastCategory === cat ? { data: {}, keys: [] } : { data: { forecastCategory: cat }, keys: ["forecastCategory"] }));
}

/** ขั้นถัดไป (ข้อความ ≤ DEAL_NOTE_MAX · ว่าง = ล้าง) */
export async function setNextStep(ctx: DealsCtx, actor: MemberActor, id: string, text: string | null): Promise<DealDto> {
  const a = await enter(ctx, actor);
  await loadDeal(ctx, a, id);
  need(a, "crm.deal.update");
  const v = cleanNote(text, "ขั้นถัดไป");
  return simpleUpdate(ctx, a, id, (d) => (d.nextStep === v ? { data: {}, keys: [] } : { data: { nextStep: v }, keys: ["nextStep"] }));
}

/** ผู้ร่วมดูแล (ผู้ใช้ของร้านนี้ · ≤ DEAL_COLLABORATORS_MAX) */
export async function setCollaborators(ctx: DealsCtx, actor: MemberActor, id: string, userIds: string[]): Promise<DealDto> {
  const a = await enter(ctx, actor);
  await loadDeal(ctx, a, id);
  need(a, "crm.deal.update");
  if (!Array.isArray(userIds)) throw fail("VALIDATION", "รายชื่อผู้ร่วมดูแลอ่านไม่ออก");
  const ids = [...new Set(userIds.filter((x) => typeof x === "string" && x))];
  if (ids.length > DEAL_COLLABORATORS_MAX) throw fail("VALIDATION", `ผู้ร่วมดูแลได้ไม่เกิน ${DEAL_COLLABORATORS_MAX} คน`);
  await assertMembers(ctx, ids, prisma, "ผู้ร่วมดูแล");
  return simpleUpdate(ctx, a, id, (d) => ([...d.collaboratorUserIds].sort().join("|") === [...ids].sort().join("|") ? { data: {}, keys: [] } : { data: { collaboratorUserIds: ids }, keys: ["collaboratorUserIds"] }));
}

/** แก้ฟิลด์ระบบที่ไม่มีกติกาเฉพาะ + ฟิลด์กำหนดเอง — มูลค่ากรอกมือได้เฉพาะดีลที่ไม่มีรายการสินค้า (§11.3) */
export async function updateDeal(ctx: DealsCtx, actor: MemberActor, id: string, input: UpdateDealInput): Promise<DealDto> {
  const a = await enter(ctx, actor);
  const pre = await loadDeal(ctx, a, id);
  need(a, "crm.deal.update");
  const fields = isObj(input?.fields) ? { ...input.fields } : {};
  const merged: UpdateDealInput = { ...input };
  // ฟิลด์ระบบที่ส่งมาใน `fields` → เส้นทางของไฟล์นี้ (ตัวตรวจเดียวกัน · วันไทย) · key ที่ engine ปฏิเสธ (governed) ถูก engine ปฏิเสธเอง
  for (const k of ["title", "expectedCloseAt", "probabilityOverride"] as const) {
    if (k in fields) {
      (merged as Record<string, unknown>)[k] = fields[k];
      delete fields[k];
    }
  }
  const data: Prisma.CrmDealUpdateInput = {};
  if (merged.title !== undefined) data.title = cleanTitle(merged.title);
  if (merged.expectedCloseAt !== undefined) data.expectedCloseAt = cleanClose(merged.expectedCloseAt);
  if (merged.probabilityOverride !== undefined) data.probabilityOverride = cleanProbability(merged.probabilityOverride);
  if (merged.tags !== undefined) data.tags = cleanTags(merged.tags);
  let wantValue: number | undefined;
  if (merged.valueSatang !== undefined && merged.valueSatang !== null) {
    wantValue = cleanValue(merged.valueSatang);
    if (pre.kind !== "OPEN") throw fail("VALIDATION", CLOSED_MSG);
  }
  return simpleUpdate(
    ctx,
    a,
    id,
    (d) => {
      const out: Prisma.CrmDealUpdateInput = { ...data };
      if (wantValue !== undefined) {
        if (d.kind !== "OPEN") throw fail("VALIDATION", CLOSED_MSG);
        out.valueSatang = wantValue;
      }
      const keys = Object.keys(out).filter((k) => {
        const cur = (d as unknown as Record<string, unknown>)[k];
        const nv = (out as Record<string, unknown>)[k];
        if (cur instanceof Date || nv instanceof Date) return (cur instanceof Date ? cur.getTime() : null) !== (nv instanceof Date ? nv.getTime() : null);
        if (Array.isArray(cur) && Array.isArray(nv)) return cur.join("") !== nv.join("");
        return cur !== nv;
      });
      return { data: Object.fromEntries(keys.map((k) => [k, (out as Record<string, unknown>)[k]])) as Prisma.CrmDealUpdateInput, keys };
    },
    {
      engineValues: fields,
      action: "crm.deal.update",
      // §11.3: มีรายการสินค้า ⇒ มูลค่ามาจากรายการเท่านั้น (แก้มือไม่ได้) — ตรวจใต้ล็อกแถวดีล (setLines ถือล็อกเดียวกัน)
      guard: async (tx, d) => {
        if (wantValue === undefined) return;
        if ((await tx.crmDealLine.count({ where: { dealId: d.id } })) > 0) {
          throw fail("VALIDATION", "ดีลนี้มีรายการสินค้าแล้ว มูลค่าจึงคิดจากรายการอัตโนมัติ — แก้ที่รายการสินค้าแทน");
        }
      },
    },
  );
}

// ═════════════════════════ รายการสินค้า + ส่วนลด (→ สายอนุมัติ crm.discount) ═════════════════════════

/**
 * แทนที่รายการสินค้าทั้งชุด — มูลค่า = Σ ยอดบรรทัด − ส่วนลดท้ายดีล (สุทธิ ก่อน VAT)
 * AUDIT-CLASS X3: แทนที่ทั้งชุดใน tx เดียวใต้ล็อกแถวดีล ⇒ ยิงพร้อมกันได้ชุดใดชุดหนึ่งเสมอ ไม่มีวันปนกัน (แถว + มูลค่า + ส่วนลดมาจากชุดเดียวกัน)
 * ส่วนลดบรรทัดใด/ท้ายดีล > เพดานของผู้ทำ (`crm._maxDealDiscountBp` ?? 1000) ⇒ ยื่นสายอนุมัติ `crm.discount` (คำขอใหม่ทุกครั้งที่ยื่น —
 *   entityId = `<dealId>:<รหัสการยื่น>`) · มีสายอนุมัติ ⇒ พักไว้ที่ pendingLines (รายการ/มูลค่าเดิมไม่ถูกแตะ) · ไม่มีสาย = ใช้ทันที
 */
export async function setLines(ctx: DealsCtx, actor: MemberActor, dealId: string, input: SetLinesInput): Promise<SetLinesResult> {
  const a = await enter(ctx, actor);
  try {
    // AUDIT-CLASS X6: ตัวตรวจเดียวกับหน้าจอ (deals-shared.checkDealLines) — จำนวน/ราคา/ส่วนลด/ชื่อ/จำนวนบรรทัด/เพดานมูลค่า
    const pre = await loadDeal(ctx, a, dealId);
    need(a, "crm.deal.lines");
    const c = await checkLinesOrThrow(ctx, input?.lines, input?.discountBp ?? 0);
    if (pre.kind !== "OPEN") throw fail("VALIDATION", CLOSED_MSG);
    const cap = discountCapOf(a);
    const over = c.dealDiscountBp > cap || c.lines.some((l) => l.discountBp > cap);
    if (over) {
      const submission = newSeq();
      const gross = c.lines.reduce((s, l) => s + lineGrossSatang(l), 0);
      const sub = await (await approvalFacade()).submitForApproval(
        { tenantId: ctx.tenantId },
        { entityType: "crm.discount", entityId: `${pre.id}:${submission}`, systemId: ctx.systemId, amountSatang: Math.max(0, gross - c.valueSatang), requestedById: a.userId },
      );
      if ("requestId" in sub) {
        const requestId = sub.requestId;
        const row = await withDealLocks(ctx, a, dealId, {}, async (tx, deal) => {
          if (deal.kind !== "OPEN") throw fail("VALIDATION", CLOSED_MSG);
          const r = await tx.crmDeal.update({
            where: { id: deal.id },
            data: { pendingLines: { lines: c.lines, discountBp: c.dealDiscountBp } as unknown as Prisma.InputJsonValue, pendingApprovalRequestId: requestId },
          });
          await emitDeal(tx, ctx, EVT.updated, deal.id, submission, { dealId: deal.id, changedKeys: ["pendingLines"], approvalRequestId: requestId });
          return r;
        });
        await audit(ctx, "crm.deal.lines.pending", row.id, { after: { approvalRequestId: requestId, lines: c.lines.length, valueSatang: c.valueSatang, discountBp: c.dealDiscountBp } });
        return { status: "APPROVAL_REQUIRED", approvalRequestId: requestId, deal: toDto(row) };
      }
    }
    const row = await withDealLocks(ctx, a, dealId, {}, async (tx, deal) => {
      if (deal.kind !== "OPEN") throw fail("VALIDATION", CLOSED_MSG);
      return applyLinesInTx(tx, ctx, deal, c.lines, c.dealDiscountBp, c.valueSatang, newSeq());
    });
    await audit(ctx, "crm.deal.lines.set", row.id, { after: { lines: c.lines.length, valueSatang: row.valueSatang, discountBp: row.discountBp } });
    return { status: "APPLIED", deal: toDto(row) };
  } catch (e) {
    throw mapError(e);
  }
}

/** ชื่อเดิมตามพิมพ์เขียว §5.4 (`lines.set`) */
export const lines = { set: setLines };

async function applyLinesInTx(tx: Tx, ctx: DealsCtx, deal: CrmDeal, ls: NormalizedDealLine[], dealBp: number, valueSatang: number, seq: string): Promise<CrmDeal> {
  await tx.crmDealLine.deleteMany({ where: { dealId: deal.id } });
  if (ls.length > 0) await tx.crmDealLine.createMany({ data: ls.map((l, i) => lineRow(ctx, deal.id, l, i)) });
  const row = await tx.crmDeal.update({
    where: { id: deal.id },
    data: { valueSatang, discountBp: dealBp, pendingLines: Prisma.DbNull, pendingApprovalRequestId: null, lastActivityAt: new Date() },
  });
  await emitDeal(tx, ctx, EVT.updated, deal.id, seq, { dealId: deal.id, changedKeys: ["lines", "valueSatang", "discountBp"] });
  return row;
}

/**
 * ผลของสายอนุมัติ `crm.discount` (เรียกจาก `src/lib/approval-effects.ts` ผ่าน crm facade)
 * AUDIT-CLASS X4: idempotent — ทำเฉพาะเมื่อดีลยังรอ "คำขอใบนี้" อยู่ (pendingApprovalRequestId ตรง) ใต้ล็อกแถว ·
 *   อนุมัติ = ใช้รายการที่พักไว้ครั้งเดียว · ปฏิเสธ = ล้างของที่พักไว้ (รายการ/มูลค่าเดิมคงอยู่) · ส่งซ้ำ/พร้อมกัน = ไม่มีผลเพิ่ม
 */
export async function applyDiscountDecision(input: { tenantId: string; requestId: string; entityId: string; approved: boolean }): Promise<void> {
  const dealId = String(input?.entityId ?? "").split(":")[0] ?? "";
  if (!dealId || !input.requestId || !input.tenantId) return;
  const pre = await prisma.crmDeal.findFirst({ where: { id: dealId, tenantId: input.tenantId }, select: { id: true, systemId: true, pendingApprovalRequestId: true } });
  if (!pre || pre.pendingApprovalRequestId !== input.requestId) return;
  const ctx: DealsCtx = { tenantId: input.tenantId, systemId: pre.systemId, actorUserId: null };
  const out = await withDealLocks(ctx, null, dealId, {}, async (tx, deal) => {
    if (deal.pendingApprovalRequestId !== input.requestId) return null;
    const pending = isObj(deal.pendingLines) ? deal.pendingLines : null;
    if (input.approved && deal.kind === "OPEN" && pending) {
      const c = checkDealLines(pending.lines, pending.discountBp ?? 0);
      if (c.ok) return { row: await applyLinesInTx(tx, ctx, deal, c.lines, c.dealDiscountBp, c.valueSatang, `approval-${input.requestId}`), applied: true };
    }
    const row = await tx.crmDeal.update({ where: { id: deal.id }, data: { pendingLines: Prisma.DbNull, pendingApprovalRequestId: null } });
    await emitDeal(tx, ctx, EVT.updated, deal.id, `approval-${input.requestId}`, { dealId: deal.id, changedKeys: ["pendingLines"], approvalRequestId: input.requestId });
    return { row, applied: false };
  });
  if (out) {
    await audit(ctx, input.approved ? "crm.deal.discount.approved" : "crm.deal.discount.rejected", dealId, { after: { approvalRequestId: input.requestId, applied: out.applied, valueSatang: out.row.valueSatang } });
  }
}

// ═════════════════════════ เอกสารบัญชี ═════════════════════════

type QuoteResult = { ok: true; docId: string; created: boolean } | { ok: false; reason: string };

async function dealDocInput(ctx: DealsCtx, deal: CrmDeal) {
  const [contact, ls] = await Promise.all([
    prisma.crmContact.findFirst({ where: { id: deal.contactId, tenantId: ctx.tenantId }, select: { id: true, name: true, phone: true, email: true, partyId: true } }),
    prisma.crmDealLine.findMany({ where: { dealId: deal.id }, orderBy: [{ sortOrder: "asc" }, { id: "asc" }] }),
  ]);
  const norm = ls.map((l) => ({ name: l.name, qty: l.qty.toNumber(), unitPriceSatang: l.unitPriceSatang, discountBp: l.discountBp, vatRateBp: l.vatRateBp }));
  const totals = dealTotals(norm, deal.discountBp);
  const accLines = norm.map((l) => {
    const gross = lineGrossSatang(l);
    return { description: l.name, qty: l.qty, unitPrice: l.unitPriceSatang, discount: Math.max(0, gross - lineAmountSatang(l)), ...(l.vatRateBp !== null ? { vatRateBp: l.vatRateBp } : {}) };
  });
  return { contact, norm, totals, accLines };
}

async function quoteCore(ctx: DealsCtx, who: Who, dealId: string, opts: { validDays?: number | null; note?: string | null }): Promise<QuoteResult> {
  const deal = await loadDeal(ctx, who, dealId);
  const validDays = opts?.validDays === undefined || opts?.validDays === null ? null : opts.validDays;
  if (validDays !== null && (!Number.isInteger(validDays) || validDays < 1 || validDays > 365)) throw fail("VALIDATION", "อายุใบเสนอราคาต้องเป็นจำนวนวัน 1–365");
  const note = cleanNote(opts?.note, "หมายเหตุใบเสนอราคา");
  const { contact, norm, totals, accLines } = await dealDocInput(ctx, deal);
  if (!contact) return { ok: false, reason: "ไม่พบผู้ติดต่อของดีลนี้" };
  if (norm.length === 0 && deal.valueSatang <= 0) return { ok: false, reason: "ดีลยังไม่มีมูลค่า — ใส่มูลค่าก่อนออกใบเสนอราคา" };
  const res = await (await accountFacade()).createExternalQuotation({
    tenantId: ctx.tenantId,
    sourceSystemId: ctx.systemId,
    sourceKind: "CRM",
    refType: "CrmDeal",
    refId: deal.id,
    title: deal.title,
    valueSatang: deal.valueSatang,
    customer: { name: contact.name, phone: contact.phone, email: contact.email },
    partyId: contact.partyId,
    sourceContactId: contact.id,
    ...(norm.length > 0 ? { lines: accLines, discountAmount: totals.discountSatang } : {}),
    ...(validDays !== null ? { validUntil: new Date(Date.now() + validDays * 86_400_000) } : {}),
    ...(note ? { note } : {}),
    createdById: actorIdOf(ctx),
  });
  if (!res.ok) return res;
  if (deal.quotationDocId !== res.docId) {
    await withDealLocks(ctx, who, deal.id, {}, async (tx, cur) => {
      if (cur.quotationDocId === res.docId) return;
      await tx.crmDeal.update({ where: { id: cur.id }, data: { quotationDocId: res.docId, lastActivityAt: new Date() } });
      await emitDeal(tx, ctx, EVT.updated, cur.id, `quote-${res.docId}`, { dealId: cur.id, changedKeys: ["quotationDocId"], documentId: res.docId });
    });
  }
  if (res.created) {
    // §11.3 "ต่างจากใบเสนอราคา": ลายนิ้วมือของรายการ ณ ตอนออกใบ (เทียบกับรายการปัจจุบันในดีล 360)
    await audit(ctx, "crm.deal.quote", deal.id, { after: { docId: res.docId, fingerprint: linesFingerprint(norm, deal.discountBp), valueSatang: totals.valueSatang || deal.valueSatang } });
  }
  return res;
}

/** ออกใบเสนอราคาจากรายการของดีล (ไม่มีรายการ = บรรทัดเดียวจากชื่อ+มูลค่าแบบเดิม) · idempotent ต่อดีล · เก็บ quotationDocId */
export async function issueQuotation(ctx: DealsCtx, actor: MemberActor, dealId: string, opts: { validDays?: number | null; note?: string | null } = {}): Promise<{ docId: string; created: boolean }> {
  const a = await enter(ctx, actor);
  await loadDeal(ctx, a, dealId);
  need(a, "crm.deal.quote");
  const r = await quoteCore(ctx, a, dealId, opts ?? {});
  if (!r.ok) throw fail("VALIDATION", r.reason);
  return { docId: r.docId, created: r.created };
}

/** ออกใบแจ้งหนี้ของดีล — ใบเสนอราคาที่ออกแล้ว (ไม่ใช่ร่าง) = แปลงต่อ · ไม่งั้นสร้างจากรายการของดีล · idempotent · เก็บ invoiceDocId */
export async function issueInvoice(ctx: DealsCtx, actor: MemberActor, dealId: string): Promise<{ docId: string; created: boolean }> {
  const a = await enter(ctx, actor);
  await loadDeal(ctx, a, dealId);
  need(a, "crm.deal.quote");
  return invoiceCore(ctx, a, dealId);
}

/** ไส้ในของ "ออกใบแจ้งหนี้ของดีล" — ผู้เรียก: `issueInvoice` (คน) · `autoInvoiceOnWonFromBridge` (ระบบ · who = null) */
async function invoiceCore(ctx: DealsCtx, who: Who, dealId: string): Promise<{ docId: string; created: boolean }> {
  const pre = await loadDeal(ctx, who, dealId);
  const acc = await accountFacade();
  // รีวิว C1.5 S9 · AUDIT-CLASS X3: ต่อดีลทำทีละคำขอ — advisory lock ตลอด "หา → สร้าง → เก็บ" (ข้ามโพรเซสก็เรียงคิวที่ฐานข้อมูล)
  //   ⇒ กดพร้อมกันกี่ครั้งได้ใบแจ้งหนี้ใบเดียว · ล็อกนี้ไม่มีเส้นทางอื่นถือ จึงไม่ชนลำดับล็อกของใคร (บริษัท → ดีล ถูกล็อกทีหลัง)
  const out = await prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`crm:deal-invoice:${pre.id}`}, 0))`;
      const deal = await tx.crmDeal.findFirst({ where: { ...identityScope(ctx), id: pre.id } });
      if (!deal) throw fail("NOT_FOUND", NOT_FOUND_MSG);
      if (deal.invoiceDocId && (await acc.docLinkInfo(ctx.tenantId, deal.invoiceDocId))) return { docId: deal.invoiceDocId, created: false, store: false };
      let docId: string | null = null;
      let created = true;
      if (deal.quotationDocId) {
        // §11.3: รายการเปลี่ยนหลังออกใบเสนอราคา ⇒ ออกใบแจ้งหนี้จากใบเดิมไม่ได้ (ยอดไม่ตรงดีล)
        if (await quotationDiffersFor(ctx, deal)) throw fail("VALIDATION", "รายการสินค้าเปลี่ยนหลังออกใบเสนอราคาแล้ว — ออกใบเสนอราคาใหม่ก่อน แล้วค่อยออกใบแจ้งหนี้");
        const q = await acc.docLinkInfo(ctx.tenantId, deal.quotationDocId);
        if (q && q.status !== "DRAFT" && q.status !== "VOIDED" && q.status !== "CANCELLED" && q.status !== "REJECTED") {
          const existing = await acc.invoiceConvertedFrom({ tenantId: ctx.tenantId, systemId: q.systemId }, q.docId);
          if (existing) {
            docId = existing.docId;
            created = false;
          } else {
            const r = await acc.convertQuotationToInvoice({ tenantId: ctx.tenantId, systemId: q.systemId }, q.docId, { createdById: actorIdOf(ctx) });
            if (r.ok) docId = r.docId;
          }
        }
      }
      if (!docId) {
        const { contact, norm, totals, accLines } = await dealDocInput(ctx, deal);
        if (!contact) throw fail("NOT_FOUND", "ไม่พบผู้ติดต่อของดีลนี้");
        if (norm.length === 0 && deal.valueSatang <= 0) throw fail("VALIDATION", "ดีลยังไม่มีมูลค่า — ใส่มูลค่าหรือรายการสินค้าก่อนออกใบแจ้งหนี้");
        const r = await acc.createExternalInvoice({
          tenantId: ctx.tenantId,
          sourceSystemId: ctx.systemId,
          sourceKind: "CRM",
          refType: "CrmDeal",
          refId: deal.id,
          title: deal.title,
          valueSatang: deal.valueSatang,
          customer: { name: contact.name, phone: contact.phone, email: contact.email },
          partyId: contact.partyId,
          sourceContactId: contact.id,
          ...(norm.length > 0 ? { lines: accLines, discountAmount: totals.discountSatang } : {}),
          createdById: actorIdOf(ctx),
        });
        if (!r.ok) throw fail("VALIDATION", r.reason);
        docId = r.docId;
        created = r.created;
      }
      // เก็บ invoiceDocId ใต้ลำดับล็อกปกติ (บริษัท → ดีล) ใน tx เดียวกับ advisory lock
      await companies.lockCompanyRowsInTx(tx, coCtx(ctx), [deal.companyId]);
      await lockDealRows(tx, ctx, [deal.id]);
      const cur = await tx.crmDeal.findFirst({ where: { ...identityScope(ctx), id: deal.id } });
      if (cur && cur.invoiceDocId !== docId) {
        await tx.crmDeal.update({ where: { id: cur.id }, data: { invoiceDocId: docId, lastActivityAt: new Date() } });
        await emitDeal(tx, ctx, EVT.updated, cur.id, `invoice-${docId}`, { dealId: cur.id, changedKeys: ["invoiceDocId"], documentId: docId });
      }
      return { docId, created, store: true };
    },
    { maxWait: 20_000, timeout: 60_000 },
  ).catch((e: unknown) => {
    throw mapError(e);
  });
  if (out.store) await audit(ctx, "crm.deal.invoice", pre.id, { after: { docId: out.docId, created: out.created } });
  return { docId: out.docId, created: out.created };
}

/** §11.3 "ต่างจากใบเสนอราคา": ลายนิ้วมือของรายการ ณ ตอนออกใบ (audit `crm.deal.quote`) เทียบกับรายการปัจจุบัน */
async function quotationDiffersFor(ctx: DealsCtx, deal: CrmDeal, current?: { name: string; qty: number; unitPriceSatang: number; discountBp: number }[]): Promise<boolean> {
  if (!deal.quotationDocId) return false;
  const q = await prisma.auditLog.findFirst({ where: { tenantId: ctx.tenantId, targetType: "CrmDeal", targetId: deal.id, action: "crm.deal.quote" }, orderBy: { createdAt: "desc" }, select: { after: true } });
  const after = isObj(q?.after) ? (q?.after as Record<string, unknown>) : null;
  if (!after || after.docId !== deal.quotationDocId || typeof after.fingerprint !== "string") return false;
  const lines =
    current ??
    (await prisma.crmDealLine.findMany({ where: { dealId: deal.id }, orderBy: [{ sortOrder: "asc" }, { id: "asc" }] })).map((l) => ({ name: l.name, qty: l.qty.toNumber(), unitPriceSatang: l.unitPriceSatang, discountBp: l.discountBp }));
  return after.fingerprint !== linesFingerprint(lines, deal.discountBp);
}

// ═════════════════════════ ลบ · กลุ่ม ═════════════════════════

/**
 * ลบดีลถาวร (มติผู้คุมงาน C1.5 ข้อ 2 — ไม่มีคอลัมน์ archivedAt จนถึง C2.0) — AUDIT-CLASS X9: ยืนยัน + เหตุผล
 * ปฏิเสธเมื่อดีลชนะแล้ว หรือมีเอกสารบัญชีผูกอยู่ (ใบเสนอราคา/ใบแจ้งหนี้) · audit เก็บเหตุผล + ภาพถ่ายของดีล
 * กิจกรรมของดีลไม่ถูกลบ (ถอดการผูกดีล — ยังอยู่ในไทม์ไลน์ผู้ติดต่อ) · รายการ/ประวัติขั้น/ผู้ร่วมดีลลบตาม
 */
export async function deleteDeal(ctx: DealsCtx, actor: MemberActor, id: string, opts: DangerOpts): Promise<{ ok: true }> {
  const reason = reasonOf(opts, "ลบดีล");
  const a = await enter(ctx, actor);
  await loadDeal(ctx, a, id);
  need(a, "crm.deal.delete");
  const out = await withDealLocks(ctx, a, id, {}, async (tx, deal) => {
    if (deal.kind === "WON") throw fail("CONFLICT", "ดีลที่ชนะแล้วลบไม่ได้ (เป็นประวัติยอดขาย) — ถ้าบันทึกผิด ให้ผู้จัดการเปิดดีลใหม่แล้วย้ายเป็นแพ้พร้อมเหตุผล");
    if (deal.quotationDocId || deal.invoiceDocId) throw fail("CONFLICT", "ดีลนี้มีเอกสารบัญชีผูกอยู่ (ใบเสนอราคา/ใบแจ้งหนี้) จึงลบไม่ได้ — ย้ายเป็นแพ้พร้อมเหตุผลแทน");
    // รีวิว C1.5 S8: รายการวัตถุกำหนดเองที่ยังใช้งานและผูกดีลนี้ = ไม่ลบ (ผู้ใช้เก็บถาวรรายการเหล่านั้นก่อน — ไม่มีแม่กำพร้า)
    const records = await tx.customRecord.count({ where: { tenantId: ctx.tenantId, systemId: ctx.systemId, parentType: "DEAL", parentId: deal.id, archivedAt: null } });
    if (records > 0) throw fail("CONFLICT", `ดีลนี้ยังมีรายการที่ผูกอยู่ ${records.toLocaleString("th-TH")} รายการ (วัตถุกำหนดเอง) — เก็บถาวรรายการเหล่านั้นก่อนแล้วค่อยลบดีล`);
    // ไฟล์แนบของดีล: ถอดการผูก (ตัวไฟล์ FileAsset เป็นของเส้นทางไฟล์ · ไม่ลบที่นี่)
    await tx.crmFileLink.deleteMany({ where: { tenantId: ctx.tenantId, systemId: ctx.systemId, entityType: "DEAL", entityId: deal.id } });
    await tx.crmActivity.updateMany({ where: { tenantId: ctx.tenantId, dealId: deal.id }, data: { dealId: null } });
    await tx.customRecordValue.deleteMany({ where: { tenantId: ctx.tenantId, recordType: "DEAL", recordId: deal.id } });
    await tx.crmDealLine.deleteMany({ where: { dealId: deal.id } });
    await tx.crmDealStageHistory.deleteMany({ where: { dealId: deal.id } });
    await tx.crmDealContact.deleteMany({ where: { dealId: deal.id } });
    await tx.crmDeal.delete({ where: { id: deal.id } });
    await companies.recomputeDealCachesInTx(tx, coCtx(ctx), [deal.companyId]);
    return deal;
  });
  // รีวิว C1.5 S8: คำขออนุมัติส่วนลดที่ยังรออยู่ของดีลที่ถูกลบ = ยกเลิก (ไม่ให้ผู้อนุมัติกดผ่านของที่ไม่มีแล้ว) — ผ่าน facade สายอนุมัติ
  if (out.pendingApprovalRequestId) {
    await (await approvalFacade()).cancelRequest({ tenantId: ctx.tenantId }, out.pendingApprovalRequestId).catch(() => false);
  }
  await audit(ctx, "crm.deal.delete", out.id, {
    before: { title: out.title, valueSatang: out.valueSatang, stageId: out.stageId, companyId: out.companyId, contactId: out.contactId },
    after: { reason, deleted: true },
  });
  return { ok: true };
}

/** ย้ายขั้นเป็นกลุ่ม — AUDIT-CLASS X9: ยืนยัน + เหตุผล · ≤ DEAL_BULK_MAX · ทีละดีลตามกติกาเดียวกับ moveDeal */
export async function bulkMove(ctx: DealsCtx, actor: MemberActor, input: { ids: string[]; stageId: string; confirm?: boolean | null; reason?: string | null }): Promise<BulkResult> {
  const reason = reasonOf(input, "ย้ายดีลเป็นกลุ่ม");
  const ids = bulkIds(input?.ids);
  const a = await enter(ctx, actor);
  need(a, "crm.deal.move");
  const res: BulkResult = { ok: 0, failed: [] };
  for (const id of ids) {
    try {
      await moveCore(ctx, a, id, { stageId: input.stageId, note: reason }, {});
      res.ok += 1;
    } catch (e) {
      res.failed.push({ id, error: e instanceof DealsError ? e.message : "ย้ายดีลนี้ไม่สำเร็จ ลองใหม่อีกครั้ง" });
    }
  }
  await writeAudit({ tenantId: ctx.tenantId, actorId: actorIdOf(ctx), action: "crm.deal.bulk_move", targetType: "CrmDeal", after: { reason, stageId: input.stageId, ids, ok: res.ok, failed: res.failed.length } });
  return res;
}

/** โอนผู้ดูแลเป็นกลุ่ม — AUDIT-CLASS X9: ยืนยัน + เหตุผล · ≤ DEAL_BULK_MAX · event reassigned ต่อดีล */
export async function bulkReassign(ctx: DealsCtx, actor: MemberActor, input: { ids: string[]; ownerUserId: string | null; teamId?: string | null; confirm?: boolean | null; reason?: string | null }): Promise<BulkResult> {
  const reason = reasonOf(input, "โอนดีลเป็นกลุ่ม");
  const ids = bulkIds(input?.ids);
  const a = await enter(ctx, actor);
  const owner = str(input?.ownerUserId);
  if (owner) await assertMembers(ctx, [owner]);
  const res: BulkResult = { ok: 0, failed: [] };
  for (const id of ids) {
    try {
      // CRM C1.7 ▸ ทีมปลายทางเดียวกับการโอนทีละดีล (teamId ที่เลือก · ไม่เลือก = ทีมของผู้ดูแลใหม่) ◂
      await reassignDeal(ctx, a, id, { ownerUserId: owner, teamId: str(input?.teamId) });
      res.ok += 1;
    } catch (e) {
      res.failed.push({ id, error: e instanceof DealsError ? e.message : "โอนดีลนี้ไม่สำเร็จ ลองใหม่อีกครั้ง" });
    }
  }
  await writeAudit({ tenantId: ctx.tenantId, actorId: actorIdOf(ctx), action: "crm.deal.bulk_reassign", targetType: "CrmDeal", after: { reason, ownerUserId: owner, teamId: str(input?.teamId), ids, ok: res.ok, failed: res.failed.length } });
  return res;
}

/** ติดแท็กเป็นกลุ่ม (ไม่ใช่การกระทำอันตราย) · ≤ DEAL_BULK_MAX */
export async function bulkTag(ctx: DealsCtx, actor: MemberActor, input: { ids: string[]; tag: string }): Promise<BulkResult> {
  const ids = bulkIds(input?.ids);
  const [tag] = cleanTags([input?.tag]);
  if (!tag) throw fail("VALIDATION", "ใส่แท็กก่อน");
  const a = await enter(ctx, actor);
  need(a, "crm.deal.update");
  const res: BulkResult = { ok: 0, failed: [] };
  for (const id of ids) {
    try {
      await simpleUpdate(ctx, a, id, (d) => {
        if (d.tags.includes(tag)) return { data: {}, keys: [] };
        if (d.tags.length >= DEAL_TAGS_MAX) throw fail("VALIDATION", `ดีลนี้มีแท็กครบ ${DEAL_TAGS_MAX} แล้ว`);
        return { data: { tags: [...d.tags, tag] }, keys: ["tags"] };
      });
      res.ok += 1;
    } catch (e) {
      res.failed.push({ id, error: e instanceof DealsError ? e.message : "ติดแท็กดีลนี้ไม่สำเร็จ" });
    }
  }
  return res;
}

/**
 * R-A (C1.4): ผู้ติดต่อย้ายบริษัท → ดีลที่ยังเปิดของบริษัทเดิมย้ายตาม (ผู้ใช้เลือก) — ผู้เขียนคอลัมน์ดีลคือไฟล์นี้ที่เดียว
 * AUDIT-CLASS X3: ล็อกแถวบริษัททั้งสอง (เรียง id) → แถวดีล (เรียง id) → ย้าย → แคชทั้งสองบริษัทใน tx เดียว
 */
export async function moveOpenDealsOfContact(ctx: DealsCtx, contactId: string, fromCompanyId: string, toCompanyId: string): Promise<number> {
  await resolveSystem(ctx);
  if (!contactId || !fromCompanyId || !toCompanyId || fromCompanyId === toCompanyId) return 0;
  return prisma.$transaction(async (tx) => {
    await companies.lockCompanyRowsInTx(tx, coCtx(ctx), [fromCompanyId, toCompanyId]);
    const rows = await tx.crmDeal.findMany({ where: { ...identityScope(ctx), contactId, companyId: fromCompanyId, kind: "OPEN" }, select: { id: true } });
    if (rows.length === 0) return 0;
    await lockDealRows(tx, ctx, rows.map((r) => r.id));
    const n = (await tx.crmDeal.updateMany({ where: { ...identityScope(ctx), id: { in: rows.map((r) => r.id) }, companyId: fromCompanyId, kind: "OPEN" }, data: { companyId: toCompanyId } })).count;
    for (const r of rows) await emitDeal(tx, ctx, EVT.updated, r.id, newSeq(), { dealId: r.id, changedKeys: ["companyId"] });
    await companies.recomputeDealCachesInTx(tx, coCtx(ctx), [fromCompanyId, toCompanyId]);
    return n;
  }, TX_OPTS);
}

// ═════════════════════════ อ่าน: รายการ · กระดาน · พยากรณ์ · 360 · ส่งออก ═════════════════════════

const SORTS: Record<DealSort, Prisma.CrmDealOrderByWithRelationInput[]> = {
  "-createdAt": [{ createdAt: "desc" }, { id: "desc" }],
  createdAt: [{ createdAt: "asc" }, { id: "asc" }],
  "-valueSatang": [{ valueSatang: "desc" }, { id: "desc" }],
  expectedCloseAt: [{ expectedCloseAt: { sort: "asc", nulls: "last" } }, { id: "asc" }],
  "-stageEnteredAt": [{ stageEnteredAt: "desc" }, { id: "desc" }],
  title: [{ title: "asc" }, { id: "asc" }],
};

/** ตัวกรองของ URL (§2.3) + มุมมองที่บันทึกไว้ (MemberSavedView objectKey "deal") → where เดียว — ขอบเขตผ่าน dealWhere เสมอ */
async function listWhere(ctx: DealsCtx, a: MemberActor, raw: DealListInput): Promise<Prisma.CrmDealWhereInput> {
  let input: DealListInput = { ...(raw ?? {}) };
  const viewId = str(raw?.savedViewId);
  if (viewId) {
    // AUDIT-CLASS X1: มุมมองต้องเป็นของระบบนี้ + ของตัวเองหรือระดับทีม — ของระบบ/คนอื่น = ไม่พบ
    const view = await prisma.memberSavedView.findFirst({ where: { id: viewId, tenantId: ctx.tenantId, systemId: ctx.systemId, objectKey: "deal", OR: [{ ownerUserId: a.userId }, { scope: "TEAM" }] } });
    if (!view) throw fail("NOT_FOUND", "ไม่พบมุมมองที่บันทึกไว้นี้ในระบบ CRM นี้ — เลือกมุมมองใหม่");
    const vf = isObj(view.filters) ? (view.filters as Record<string, unknown>) : {};
    const fromView: DealListInput = {
      pipelineId: str(vf.pipelineId) ?? str(vf.pipeline),
      owner: str(vf.owner),
      team: str(vf.team),
      stage: str(vf.stage),
      closeFrom: str(vf.closeFrom),
      closeTo: str(vf.closeTo),
      stale: vf.stale === true || vf.stale === "1" || vf.stale === "true" ? true : null,
      tag: str(vf.tag),
      q: str(vf.q),
      companyId: str(vf.companyId),
      f: isObj(vf.f) ? (Object.fromEntries(Object.entries(vf.f).filter(([, v]) => typeof v === "string")) as Record<string, string>) : null,
    };
    const explicit = Object.fromEntries(Object.entries(raw ?? {}).filter(([, v]) => v !== undefined && v !== null && v !== "")) as DealListInput;
    input = { ...fromView, ...explicit };
  }
  const AND: Prisma.CrmDealWhereInput[] = [await dealWhere(ctx, a)];
  const pipelineId = str(input.pipelineId);
  if (pipelineId) AND.push({ pipelineId });
  const owner = str(input.owner);
  if (owner) AND.push({ ownerUserId: owner === "none" ? null : owner });
  const team = str(input.team);
  if (team) AND.push({ teamId: team === "none" ? null : team });
  const stage = str(input.stage);
  if (stage) AND.push({ stageId: stage });
  const kind = str(input.kind);
  if (kind && ["OPEN", "WON", "LOST"].includes(kind)) AND.push({ kind: kind as CrmStageKind });
  const from = input.closeFrom ? cleanClose(input.closeFrom) : null;
  const to = input.closeTo ? cleanClose(input.closeTo) : null;
  if (from || to) AND.push({ expectedCloseAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } });
  if (input.stale === true) AND.push({ stalledAt: { not: null } });
  const tag = str(input.tag);
  if (tag) AND.push({ tags: { has: tag } });
  const q = str(input.q)?.slice(0, 100);
  if (q) AND.push({ title: { contains: q, mode: "insensitive" } });
  const companyId = str(input.companyId);
  if (companyId) AND.push({ companyId });
  const contactId = str(input.contactId);
  if (contactId) AND.push({ contactId });
  if (isObj(input.f) && Object.keys(input.f).length > 0) {
    const f = Object.fromEntries(Object.entries(input.f).filter(([, v]) => typeof v === "string" && v !== "")) as Record<string, string>;
    if (Object.keys(f).length > 0) {
      try {
        AND.push((await (await engine()).fieldFilterWhere({ ...fctx(ctx, a), objectKey: "deal" }, f)) as Prisma.CrmDealWhereInput);
      } catch (e) {
        throw mapError(e);
      }
    }
  }
  return { AND };
}

type CardRow = Prisma.CrmDealGetPayload<{ include: { contact: { select: { name: true; score: true } }; stage: { select: { name: true; probability: true } } } }>;

async function userNames(ctx: DealsCtx, ids: (string | null | undefined)[]): Promise<Map<string, string>> {
  const uniq = [...new Set(ids.filter((x): x is string => !!x))];
  if (uniq.length === 0) return new Map();
  const rows = await prisma.membership.findMany({ where: { tenantId: ctx.tenantId, userId: { in: uniq } }, select: { user: { select: { id: true, name: true, email: true } } } });
  return new Map(rows.map((r) => [r.user.id, r.user.name ?? r.user.email ?? "ผู้ใช้"]));
}

async function companyNames(ctx: DealsCtx, ids: (string | null | undefined)[]): Promise<Map<string, string>> {
  const uniq = [...new Set(ids.filter((x): x is string => !!x))];
  if (uniq.length === 0) return new Map();
  const rows = await companies.companyRefsInTx(prisma, coCtx(ctx), null, uniq);
  return new Map(rows.map((r) => [r.id, r.name]));
}

async function toCards(ctx: DealsCtx, rows: CardRow[]): Promise<DealCardDto[]> {
  const [owners, cos] = await Promise.all([userNames(ctx, rows.map((r) => r.ownerUserId)), companyNames(ctx, rows.map((r) => r.companyId))]);
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    companyId: r.companyId,
    companyName: r.companyId ? (cos.get(r.companyId) ?? null) : null,
    contactName: r.contact?.name ?? "",
    valueSatang: r.valueSatang,
    ownerUserId: r.ownerUserId,
    ownerName: r.ownerUserId ? (owners.get(r.ownerUserId) ?? null) : null,
    expectedCloseAt: dayKey(r.expectedCloseAt),
    stale: !!r.stalledAt,
    stalledAt: iso(r.stalledAt),
    score: r.contact?.score ?? 0,
    nextActivityAt: iso(r.nextActivityAt),
    nextStep: r.nextStep,
    kind: r.kind as DealKind,
    stageId: r.stageId,
    probability: r.probabilityOverride ?? r.stage?.probability ?? 0,
    tags: r.tags,
  }));
}

const CARD_INCLUDE = { contact: { select: { name: true, score: true } }, stage: { select: { name: true, probability: true } } } as const;

/** รายการดีล (ตาราง) — ตัวกรอง §2.3 · มุมมองที่บันทึก · เรียง · cursor (id) */
export async function listDeals(ctx: DealsCtx, actor: MemberActor, input: DealListInput = {}): Promise<DealListResult> {
  const a = await enter(ctx, actor);
  const where = await listWhere(ctx, a, input ?? {});
  // (อ่านผ่าน dealWhere — ประกอบใน listWhere)
  const pageSize = Math.min(DEAL_PAGE_MAX, Math.max(1, Math.floor(Number(input?.pageSize) || 50)));
  const sortKey = input?.sort;
  const orderBy = typeof sortKey === "string" && (DEAL_SORTS as readonly string[]).includes(sortKey) ? SORTS[sortKey as DealSort] : SORTS["-createdAt"];
  const cursor = str(input?.cursor);
  const rows = await prisma.crmDeal.findMany({
    where: { AND: [where, await dealWhere(ctx, a)] },
    include: CARD_INCLUDE,
    orderBy,
    take: pageSize + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });
  const more = rows.length > pageSize;
  const page = more ? rows.slice(0, pageSize) : rows;
  const cards = await toCards(ctx, page);
  const items: DealListRow[] = cards.map((c, i) => ({ ...c, pipelineId: page[i]!.pipelineId, stageName: page[i]!.stage?.name ?? "", forecastCategory: page[i]!.forecastCategory as ForecastCategory }));
  return { items, nextCursor: more ? (page[page.length - 1]?.id ?? null) : null };
}

/** id ของดีลในขอบเขตที่ actor เห็น + ตัวกรอง (where ของ Prisma ผ่าน dealWhere) — ยอดเงินรวมทำใน SQL ต่อจากนี้ (R-E.8) */
async function scopedDealIds(where: Prisma.CrmDealWhereInput): Promise<string[]> {
  return (await prisma.crmDeal.findMany({ where, select: { id: true } })).map((r) => r.id);
}

/**
 * กระดาน: หนึ่งคอลัมน์ต่อขั้น (เรียง sortOrder) · จำนวน/ยอดรวม/ยอดถ่วงน้ำหนักต่อคอลัมน์รวมใน SQL (groupBy) · การ์ดต่อคอลัมน์ ≤ DEAL_BOARD_CARDS_MAX
 * ถ่วงน้ำหนัก = เฉพาะดีลเปิด · หมวด OMITTED ไม่นับ · (probabilityOverride ?? stage.probability)
 */
export async function getBoard(ctx: DealsCtx, actor: MemberActor, input: DealListInput & { pipelineId?: string | null } = {}): Promise<BoardDto> {
  const a = await enter(ctx, actor);
  const pid =
    str(input?.pipelineId) ??
    (await prisma.crmPipeline.findFirst({ where: { ...identityScope(ctx), archivedAt: null }, orderBy: [{ isDefault: "desc" }, { sortOrder: "asc" }, { createdAt: "asc" }], select: { id: true } }))?.id;
  const pipe = await loadPipeline(ctx, pid);
  const where: Prisma.CrmDealWhereInput = { AND: [await dealWhere(ctx, a), await listWhere(ctx, a, { ...(input ?? {}), pipelineId: pipe.id, stage: null }), { pipelineId: pipe.id }] };
  // R-E.8 (รีวิว C1.5): จำนวน/ยอด/ถ่วงน้ำหนักต่อคอลัมน์รวมใน SQL เป็น bigint (ยอดรวม > 2³¹ ไม่ล้น) — ขอบเขตจาก dealWhere
  const ids = await scopedDealIds(where);
  const agg = ids.length
    ? await prisma.$queryRaw<{ stageId: string; n: number; sum: bigint; weighted: bigint }[]>`
        SELECT d."stageId" AS "stageId", count(*)::int AS "n",
               COALESCE(sum(d."valueSatang"), 0)::bigint AS "sum",
               COALESCE(sum(CASE WHEN d."kind" = 'OPEN' AND d."forecastCategory" <> 'OMITTED'
                                 THEN round(d."valueSatang"::numeric * COALESCE(d."probabilityOverride", s."probability") / 100) ELSE 0 END), 0)::bigint AS "weighted"
          FROM "CrmDeal" d JOIN "CrmStage" s ON s."id" = d."stageId"
         WHERE d."id" = ANY(${ids}::text[]) AND d."tenantId" = ${ctx.tenantId} AND d."systemId" = ${ctx.systemId}
         GROUP BY d."stageId"`
    : [];
  const aggBy = new Map(agg.map((g) => [g.stageId, g]));
  const cardsByStage = await Promise.all(
    pipe.stages.map((s) => prisma.crmDeal.findMany({ where: { AND: [where, { stageId: s.id }] }, include: CARD_INCLUDE, orderBy: [{ stageEnteredAt: "desc" }, { id: "desc" }], take: DEAL_BOARD_CARDS_MAX })),
  );
  const cards = await toCards(ctx, cardsByStage.flat());
  const byId = new Map(cards.map((c) => [c.id, c]));
  const columns: BoardColumnDto[] = pipe.stages.map((s, i) => {
    const g = aggBy.get(s.id);
    const count = g?.n ?? 0;
    const sumSatang = Number(g?.sum ?? 0);
    const weightedSatang = Number(g?.weighted ?? 0);
    return {
      stageId: s.id,
      name: s.name,
      kind: s.kind as DealKind,
      probability: s.probability,
      count,
      sumSatang,
      weightedSatang,
      cards: (cardsByStage[i] ?? []).map((r) => byId.get(r.id)).filter((x): x is DealCardDto => !!x),
    };
  });
  return { pipeline: pipelineDto(pipe), columns };
}

/**
 * พยากรณ์ (R-E.8 ยอดรวมใน SQL): เฉพาะดีลเปิด · OMITTED ไม่นับ · ถ่วงน้ำหนัก = value × (probabilityOverride ?? stage.probability) / 100 ·
 * groupBy month = "YYYY-MM" ของวันที่คาดว่าจะปิด (วันไทยเก็บเป็นเที่ยงคืน UTC — 31 ต.ค. ไม่ไหลไปเดือนอื่น) · ไม่มีวันที่ = กลุ่ม "none"
 */
export async function forecast(ctx: DealsCtx, actor: MemberActor, input: { pipelineId?: string | null; groupBy?: string | null; category?: string | null; from?: string | null; to?: string | null } = {}): Promise<ForecastResult> {
  const a = await enter(ctx, actor);
  const groupBy: ForecastGroup = (FORECAST_GROUPS as readonly string[]).includes(String(input?.groupBy)) ? (input.groupBy as ForecastGroup) : "month";
  const AND: Prisma.CrmDealWhereInput[] = [await dealWhere(ctx, a), { kind: "OPEN" }, { forecastCategory: { not: "OMITTED" } }];
  const pid = str(input?.pipelineId);
  if (pid) {
    await loadPipeline(ctx, pid);
    AND.push({ pipelineId: pid });
  }
  if (input?.category) AND.push({ forecastCategory: cleanCategory(input.category) });
  const from = input?.from ? cleanClose(input.from) : null;
  const to = input?.to ? cleanClose(input.to) : null;
  if (from || to) AND.push({ expectedCloseAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } });
  const where: Prisma.CrmDealWhereInput = { AND };
  // R-E.8 (รีวิว C1.5): รวมต่อ "ถัง" ที่ขอใน SQL (bigint) · ถังเลือกจากรายการตายตัว (ไม่มีค่าจากผู้ใช้แทรกลงคำสั่ง) · ขอบเขตจาก dealWhere
  const bucket =
    groupBy === "month" ? Prisma.sql`COALESCE(to_char(d."expectedCloseAt", 'YYYY-MM'), ${FORECAST_NONE_KEY})`
      : groupBy === "owner" ? Prisma.sql`COALESCE(d."ownerUserId", ${FORECAST_NONE_KEY})`
        : Prisma.sql`COALESCE(d."teamId", ${FORECAST_NONE_KEY})`;
  const ids = await scopedDealIds(where);
  const agg = ids.length
    ? await prisma.$queryRaw<{ key: string; n: number; value: bigint; weighted: bigint }[]>`
        SELECT ${bucket} AS "key", count(*)::int AS "n",
               COALESCE(sum(d."valueSatang"), 0)::bigint AS "value",
               COALESCE(sum(round(d."valueSatang"::numeric * COALESCE(d."probabilityOverride", s."probability") / 100)), 0)::bigint AS "weighted"
          FROM "CrmDeal" d JOIN "CrmStage" s ON s."id" = d."stageId"
         WHERE d."id" = ANY(${ids}::text[]) AND d."tenantId" = ${ctx.tenantId} AND d."systemId" = ${ctx.systemId}
         GROUP BY 1`
    : [];
  const acc = new Map<string, { valueSatang: number; weightedSatang: number; count: number }>(agg.map((g) => [g.key, { valueSatang: Number(g.value), weightedSatang: Number(g.weighted), count: g.n }]));
  const keys = [...acc.keys()];
  let labels = new Map<string, string>();
  if (groupBy === "owner") labels = await userNames(ctx, keys);
  if (groupBy === "team") {
    const teams = await prisma.team.findMany({ where: { tenantId: ctx.tenantId, id: { in: keys.filter((k) => k !== FORECAST_NONE_KEY) } }, select: { id: true, name: true } });
    labels = new Map(teams.map((t) => [t.id, t.name]));
  }
  const rows: ForecastRow[] = keys
    .map((key) => ({
      key,
      label:
        groupBy === "month" ? formatThaiMonth(key)
          : key === FORECAST_NONE_KEY ? (groupBy === "owner" ? "ยังไม่มีผู้ดูแล" : "ไม่มีทีม")
            : (labels.get(key) ?? "ไม่ทราบชื่อ"),
      ...acc.get(key)!,
    }))
    .sort((x, y) => (x.key === FORECAST_NONE_KEY ? 1 : y.key === FORECAST_NONE_KEY ? -1 : x.key.localeCompare(y.key)));
  return { groupBy, rows };
}

/** ดีล 360 (ภาพ 03): หัว · stepper ขั้น · รายการ (+ป้ายราคาเปลี่ยน) · ประวัติขั้น · บริษัท · ผู้ติดต่อ · ผู้ร่วม · เอกสาร · ไทม์ไลน์ */
export async function getDeal360(ctx: DealsCtx, actor: MemberActor, id: string): Promise<Deal360 & { kanbanCards: DealKanbanCard[] } /* CRM C1.6 ▸ การ์ดบอร์ดงานของดีล ◂ */> {
  const a = await enter(ctx, actor);
  const did = str(id);
  // AUDIT-CLASS X1: อ่านผ่าน dealWhere — ดีลของระบบ/ร้านอื่น = ไม่พบ (ข้อความไม่สะท้อนข้อมูลของเขา)
  const deal = did ? await prisma.crmDeal.findFirst({ where: { AND: [await dealWhere(ctx, a), { id: did }] } }) : null;
  if (!deal) throw fail("NOT_FOUND", NOT_FOUND_MSG);
  const [pipe, lineRows, hist, contact, company, lostReason, acts] = await Promise.all([
    loadPipeline(ctx, deal.pipelineId),
    prisma.crmDealLine.findMany({ where: { dealId: deal.id }, orderBy: [{ sortOrder: "asc" }, { id: "asc" }] }),
    prisma.crmDealStageHistory.findMany({ where: { dealId: deal.id, tenantId: ctx.tenantId }, orderBy: [{ enteredAt: "desc" }, { id: "desc" }], take: 200 }),
    prisma.crmContact.findFirst({ where: { AND: [await contactWhere(ctx, a), { id: deal.contactId }] }, select: { id: true, name: true } }),
    deal.companyId ? companies.companyRefsInTx(prisma, coCtx(ctx), a, [deal.companyId]).then((r) => r[0] ?? null) : Promise.resolve(null),
    deal.lostReasonId ? prisma.crmLostReason.findFirst({ where: { ...identityScope(ctx), id: deal.lostReasonId }, select: { id: true, label: true } }) : Promise.resolve(null),
    prisma.crmActivity.findMany({ where: { AND: [await activityWhere(ctx, a), { dealId: deal.id }] }, orderBy: [{ createdAt: "desc" }], take: 30, select: { id: true, type: true, title: true, createdAt: true, doneAt: true, dueAt: true } }),
  ]);
  const pids = lineRows.map((l) => l.productId).filter((x): x is string => !!x);
  const prices = pids.length ? await inventoryItems(ctx, pids) : new Map<string, { priceSatang: number }>();
  const lines: DealLineDto[] = lineRows.map((l) => {
    const qty = l.qty.toNumber();
    const cur = l.productId ? (prices.get(l.productId)?.priceSatang ?? null) : null;
    return {
      id: l.id,
      productId: l.productId,
      name: l.name,
      qty,
      unitPriceSatang: l.unitPriceSatang,
      discountBp: l.discountBp,
      vatRateBp: l.vatRateBp,
      note: l.note,
      amountSatang: lineAmountSatang({ qty, unitPriceSatang: l.unitPriceSatang, discountBp: l.discountBp }),
      priceChanged: cur !== null && cur !== l.unitPriceSatang,
      currentPriceSatang: cur,
    };
  });
  const totals = dealTotals(lines, deal.discountBp);
  const stageIds = [...new Set(hist.flatMap((h) => [h.fromStageId, h.toStageId]).filter((x): x is string => !!x))];
  const allStages = stageIds.length ? await prisma.crmStage.findMany({ where: { ...identityScope(ctx), id: { in: stageIds } }, select: { id: true, name: true } }) : [];
  const stageName = new Map(allStages.map((s) => [s.id, s.name]));
  const people = await userNames(ctx, [deal.ownerUserId, ...deal.collaboratorUserIds, ...hist.map((h) => h.byUserId)]);
  const history: DealHistoryRow[] = hist.map((h) => ({
    id: h.id,
    fromStageId: h.fromStageId,
    fromStageName: h.fromStageId ? (stageName.get(h.fromStageId) ?? "ขั้นที่ถูกลบ") : null,
    toStageId: h.toStageId,
    toStageName: stageName.get(h.toStageId) ?? "ขั้นที่ถูกลบ",
    byUserId: h.byUserId,
    byName: h.byUserId ? (people.get(h.byUserId) ?? null) : h.bySource === "MANUAL" ? null : "ระบบ",
    bySource: h.bySource,
    enteredAt: h.enteredAt.toISOString(),
    leftAt: iso(h.leftAt),
    durationSec: h.durationSec,
    note: h.note,
  }));
  const acc = await accountFacade();
  const docIds = [deal.quotationDocId, deal.invoiceDocId].filter((x): x is string => !!x);
  const docs: DealDocRow[] = [];
  for (const d of docIds) {
    const info = await acc.docLinkInfo(ctx.tenantId, d).catch(() => null);
    if (info) docs.push({ id: info.docId, docType: info.docType, docNo: info.docNo, status: info.status, grandTotal: info.grandTotal, paidTotal: info.paidTotal });
  }
  const quotationDiffers = await quotationDiffersFor(ctx, deal, lines);
  // CRM C2.7 ▸ ธง "เอกสารบัญชีของดีลนี้ถูกยกเลิก" = แท็กของดีล (ไม่มีคอลัมน์ · R-C.1) ◂
  const documentVoided = deal.tags.includes(DEAL_VOIDED_TAG);
  const timeline: DealTimelineItem[] = [
    ...history.map((h) => ({ at: h.enteredAt, kind: (h.fromStageId ? "STAGE" : "CREATED") as DealTimelineItem["kind"], title: h.fromStageId ? `ย้ายขั้น ${h.fromStageName} → ${h.toStageName}` : `สร้างดีลที่ขั้น ${h.toStageName}`, detail: h.byName })),
    ...acts.map((x) => ({ at: x.createdAt.toISOString(), kind: "ACTIVITY" as const, title: x.title, detail: x.doneAt ? "เสร็จแล้ว" : x.dueAt ? "ค้างอยู่" : null })),
    ...docs.map((d) => ({ at: deal.updatedAt.toISOString(), kind: "DOC" as const, title: `${d.docType === "QUOTATION" ? "ใบเสนอราคา" : d.docType === "INVOICE" ? "ใบแจ้งหนี้" : "เอกสาร"} ${d.docNo ?? "(ร่าง)"}`, detail: null })),
  ].sort((x, y) => y.at.localeCompare(x.at));
  const pending = isObj(deal.pendingLines) && Array.isArray(deal.pendingLines.lines) ? (deal.pendingLines.lines as DealLineInput[]) : null;
  return {
    deal: toDto(deal),
    pipeline: { id: pipe.id, name: pipe.name },
    stages: pipe.stages.map((s) => ({ ...stageDto(s), current: s.id === deal.stageId })),
    lines,
    pendingLines: pending,
    subtotalSatang: totals.subtotalSatang,
    discountSatang: totals.discountSatang,
    history,
    company: company ? { id: company.id, name: company.name } : null,
    contact: { id: deal.contactId, name: contact?.name ?? "ผู้ติดต่อที่มองไม่เห็น" },
    owner: deal.ownerUserId ? { id: deal.ownerUserId, name: people.get(deal.ownerUserId) ?? "ผู้ใช้" } : null,
    collaborators: deal.collaboratorUserIds.map((u) => ({ id: u, name: people.get(u) ?? "ผู้ใช้" })),
    lostReason: lostReason ? { id: lostReason.id, label: lostReason.label } : null,
    docs,
    timeline,
    quotationDiffers,
    documentVoided,
    // CRM C2.7 ▸ เงินที่รับจริงของดีล (คอลัมน์ `paidSatang` ที่ `payments.ts` บวก/ลบให้ในธุรกรรมของการรับเงิน) ◂
    paidSatang: Number(deal.paidSatang ?? 0),
    daysInStage: Math.max(0, Math.floor((Date.now() - deal.stageEnteredAt.getTime()) / 86_400_000)),
    // CRM C1.6 ▸ การ์ดบอร์ดงานที่ผูกดีลนี้ (ลิงก์ DEAL · อ่านผ่าน kanban/links.listCardsForTarget — กรองบอร์ดที่ผู้ดูเห็นเอง) · มติผู้คุมงาน C1.6 ข้อ 2
    kanbanCards: await dealKanbanCards(ctx, a, deal.id),
    // ◂ CRM C1.6
  };
}

/** ส่งออก CSV (AUDIT-CLASS X6: ทุกบรรทัดผ่าน `csvRow` — เซลล์ขึ้นต้น = + - @ ถูกทำให้เป็นกลาง) · ≤ DEAL_EXPORT_MAX_ROWS */
export async function exportDeals(ctx: DealsCtx, actor: MemberActor, filters: DealListInput = {}): Promise<string> {
  const a = await enter(ctx, actor);
  const where: Prisma.CrmDealWhereInput = { AND: [await dealWhere(ctx, a), await listWhere(ctx, a, { ...(filters ?? {}), cursor: null })] };
  const total = await prisma.crmDeal.count({ where });
  if (total > DEAL_EXPORT_MAX_ROWS) throw fail("VALIDATION", `ผลลัพธ์มี ${total.toLocaleString("th-TH")} ดีล — ส่งออกได้ครั้งละไม่เกิน ${DEAL_EXPORT_MAX_ROWS.toLocaleString("th-TH")} ดีล กรองให้แคบลงก่อน`);
  const rows = await prisma.crmDeal.findMany({ where, include: { contact: { select: { name: true } }, stage: { select: { name: true, probability: true } }, pipeline: { select: { name: true } } }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], take: DEAL_EXPORT_MAX_ROWS });
  const [owners, cos] = await Promise.all([userNames(ctx, rows.map((r) => r.ownerUserId)), companyNames(ctx, rows.map((r) => r.companyId))]);
  const header = ["ชื่อดีล", "บริษัท", "ผู้ติดต่อ", "pipeline", "ขั้น", "สถานะ", "มูลค่า (บาท)", "หมวดพยากรณ์", "โอกาสปิด (%)", "วันที่คาดว่าจะปิด", "ผู้ดูแล", "แท็ก", "เพิ่มเมื่อ"];
  const out = [csvRow(header)];
  for (const r of rows) {
    out.push(
      csvRow([
        r.title,
        r.companyId ? (cos.get(r.companyId) ?? "") : "",
        r.contact?.name ?? "",
        r.pipeline?.name ?? "",
        r.stage?.name ?? "",
        DEAL_KIND_LABEL[r.kind as DealKind],
        r.valueSatang / 100,
        FORECAST_CATEGORY_LABEL[r.forecastCategory as ForecastCategory],
        r.probabilityOverride ?? r.stage?.probability ?? 0,
        dayKey(r.expectedCloseAt) ?? "",
        r.ownerUserId ? (owners.get(r.ownerUserId) ?? "") : "",
        r.tags.join(" "),
        dayKey(thaiDayUtc(r.createdAt) ?? null) ?? "",
      ]),
    );
  }
  await writeAudit({ tenantId: ctx.tenantId, actorId: actorIdOf(ctx), action: "crm.deal.export", targetType: "CrmDeal", after: { rows: rows.length } });
  return out.join("\n");
}

// ═════════════════════════ ตัวเลือกของหน้าจอ (อ่านอย่างเดียว · ค้นฝั่งเซิร์ฟเวอร์) ═════════════════════════

/** pipeline ของระบบนี้ (ที่ยังใช้งาน) พร้อมขั้น — ตัวเลือกบนกระดาน/ฟอร์มเพิ่มดีล */
export async function pipelineOptions(ctx: DealsCtx, actor: MemberActor): Promise<PipelineDto[]> {
  await enter(ctx, actor);
  const rows = await prisma.crmPipeline.findMany({ where: { ...identityScope(ctx), archivedAt: null }, include: { stages: { orderBy: [{ sortOrder: "asc" }, { id: "asc" }] } }, orderBy: [{ isDefault: "desc" }, { sortOrder: "asc" }, { createdAt: "asc" }], take: 50 });
  return rows.map(pipelineDto);
}

/** เหตุผลที่แพ้ที่ยังใช้งาน — โมดัล "แพ้" */
export async function lostReasonOptions(ctx: DealsCtx, actor: MemberActor): Promise<{ id: string; label: string }[]> {
  await enter(ctx, actor);
  return prisma.crmLostReason.findMany({ where: { ...identityScope(ctx), active: true }, select: { id: true, label: true }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }], take: 100 });
}

/** ผู้ดูแลที่เลือกได้ (คนของร้าน) */
export async function ownerOptions(ctx: DealsCtx, actor: MemberActor): Promise<{ id: string; name: string }[]> {
  const a = await enter(ctx, actor);
  return companies.ownerOptions(coCtx(ctx), a);
}

/** บริษัทที่ผู้ติดต่อคนนี้อยู่ (ลิงก์ที่ยังใช้งาน) — ช่องเลือกบริษัทของฟอร์มเพิ่มดีล */
export async function contactCompanyOptions(ctx: DealsCtx, actor: MemberActor, contactId: string): Promise<{ id: string; name: string; primary: boolean }[]> {
  const a = await enter(ctx, actor);
  const cid = str(contactId);
  if (!cid) return [];
  const contact = await prisma.crmContact.findFirst({ where: { AND: [await contactWhere(ctx, a), { id: cid }] }, select: { id: true } });
  if (!contact) return [];
  const links = await prisma.crmCompanyContact.findMany({ where: { contactId: contact.id, endedAt: null }, select: { companyId: true, isPrimary: true } });
  const cos = await companies.companyRefsInTx(prisma, coCtx(ctx), a, links.map((l) => l.companyId), { live: true });
  const primary = new Set(links.filter((l) => l.isPrimary).map((l) => l.companyId));
  return cos.map((c) => ({ id: c.id, name: c.name, primary: primary.has(c.id) })).sort((x, y) => Number(y.primary) - Number(x.primary));
}

/** ชื่อบริษัท (สำหรับเติมฟอร์มจาก ?companyId=) — ต้องมองเห็นได้และยังใช้งาน */
export async function companyRef(ctx: DealsCtx, actor: MemberActor, companyId: string): Promise<{ id: string; name: string } | null> {
  const a = await enter(ctx, actor);
  const id = str(companyId);
  if (!id) return null;
  const [co] = await companies.companyRefsInTx(prisma, coCtx(ctx), a, [id], { live: true });
  return co ?? null;
}

/** ผู้ติดต่อหลักของบริษัท (เติมฟอร์มเพิ่มดีลจากบริษัท 360) */
export async function companyContactOptions(ctx: DealsCtx, actor: MemberActor, companyId: string): Promise<{ id: string; name: string }[]> {
  const a = await enter(ctx, actor);
  const co = await companyRef(ctx, a, companyId);
  if (!co) return [];
  const links = await prisma.crmCompanyContact.findMany({ where: { companyId: co.id, endedAt: null }, orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }], select: { contactId: true }, take: 50 });
  const rows = await prisma.crmContact.findMany({ where: { AND: [await contactWhere(ctx, a), { id: { in: links.map((l) => l.contactId) }, mergedIntoId: null, archivedAt: null }] }, select: { id: true, name: true } });
  const order = new Map(links.map((l, i) => [l.contactId, i]));
  return rows.sort((x, y) => (order.get(x.id) ?? 0) - (order.get(y.id) ?? 0));
}

/** มุมมองที่บันทึกไว้ของดีล (ของตัวเอง + ระดับทีม) */
export async function savedViewOptions(ctx: DealsCtx, actor: MemberActor): Promise<{ id: string; name: string }[]> {
  const a = await enter(ctx, actor);
  return prisma.memberSavedView.findMany({
    where: { tenantId: ctx.tenantId, systemId: ctx.systemId, objectKey: "deal", OR: [{ ownerUserId: a.userId }, { scope: "TEAM" }] },
    select: { id: true, name: true },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    take: 100,
  });
}

/** ฟิลด์กำหนดเองของดีล (โมดัลเงื่อนไขก่อนเข้าขั้น · ตัวกรอง f.<key>) */
export async function dealFieldLayout(ctx: DealsCtx, actor: MemberActor): Promise<{ key: string; label: string; type: string; filterable: boolean; isSystem: boolean }[]> {
  const a = await enter(ctx, actor);
  try {
    const layout = await (await engine()).listLayout(fctx(ctx, a));
    return layout.sections.flatMap((s) => s.fields.map((f) => ({ key: f.key, label: f.label, type: String(f.type), filterable: !!f.filterable, isSystem: !!f.isSystem })));
  } catch {
    return [];
  }
}

// ═════════════════════════ ทางเข้าของ v1 (`service.ts` — ลายเซ็นเดิม) ═════════════════════════
//   ผู้เรียก: หน้า/ฟอร์มรุ่นเก่า (actions.ts ตรวจ assertCan แล้ว) · เครื่องมือเดิม — ไม่มี actor ⇒ ขอบเขต = ร้าน + ระบบ ·
//   v1 ไม่เคยบังคับเหตุผลที่แพ้/จำกัดการย้ายออกจากขั้นปิด ⇒ ทางนี้คงพฤติกรรมนั้น (เงื่อนไขก่อนเข้าขั้นยังบังคับ)

export async function createDealFromLegacy(
  ctx: { tenantId: string; systemId: string },
  input: { contactId: string; pipelineId: string; stageId: string; title: string; valueSatang: number; expectedCloseAt?: Date | null },
): Promise<{ id: string }> {
  const c: DealsCtx = { tenantId: ctx.tenantId, systemId: ctx.systemId, actorUserId: null };
  try {
    await resolveSystem(c);
    const v = Math.max(0, Math.round(Number(input?.valueSatang) || 0));
    const dto = await createCore(c, null, { contactId: input.contactId, pipelineId: input.pipelineId, stageId: input.stageId, title: input.title, valueSatang: v, expectedCloseAt: input.expectedCloseAt ?? null }, { legacy: true });
    return { id: dto.id };
  } catch (e) {
    throw mapError(e);
  }
}

export async function moveDealFromLegacy(ctx: { tenantId: string; systemId: string }, dealId: string, stageId: string): Promise<void> {
  const c: DealsCtx = { tenantId: ctx.tenantId, systemId: ctx.systemId, actorUserId: null };
  await resolveSystem(c);
  await moveCore(c, null, dealId, { stageId }, { legacy: true });
}

export async function issueQuotationFromLegacy(ctx: { tenantId: string; systemId: string }, dealId: string): Promise<QuoteResult> {
  const c: DealsCtx = { tenantId: ctx.tenantId, systemId: ctx.systemId, actorUserId: null };
  await resolveSystem(c);
  try {
    return await quoteCore(c, null, dealId, {});
  } catch (e) {
    if (e instanceof DealsError && e.code === "NOT_FOUND") return { ok: false, reason: "ไม่พบดีล" };
    throw e;
  }
}

// CRM C1.8 ▸ ทางเข้าของสะพาน (composition root `src/lib/platform/crm-bridges/`) — ไม่มี actor คน · ผู้เรียกตัดสินประตู
//   (uiVersion 2 · bridgesEnabled) มาก่อนแล้ว · AUDIT-CLASS X1: ทุกคำสั่งผูกร้าน + ระบบที่ resolve ใหม่ (resolveSystem)

/** ธงของการย้ายจากสะพาน: `ref` = กุญแจของเหตุการณ์ต้นทาง (หนึ่งธง = ย้ายได้ครั้งเดียว) · `title` = หัวเรื่องกิจกรรม AUTO (ไม่มีข้อมูลบุคคล) */
type BridgeMoveFlag = { ref: string; title: string };

/**
 * `account.quotation.responded` → ดีลที่เปิดอยู่ของระบบนี้ที่ `quotationDocId` = ใบนั้น ย้ายไปขั้นที่ pipeline ตั้งไว้
 * (`stageOnQuoteAcceptedId` / `stageOnQuoteRejectedId` · ไม่ได้ตั้ง = ไม่ย้าย) ผ่าน moveCore (แถวประวัติ + `crm.deal.stage.changed` ใน tx เดียว)
 * AUDIT-CLASS X4: ครั้งเดียวต่อ (เอกสาร, คำตอบ) — ธง `account.quotation.responded#<docId>#<A|R>` ปักใน tx เดียวกับการย้าย
 * คืนจำนวนดีลที่ย้ายจริง
 */
export async function applyQuotationResponse(ctx: { tenantId: string; systemId: string }, input: { documentId: string; accepted: boolean }): Promise<number> {
  const c: DealsCtx = { tenantId: ctx.tenantId, systemId: ctx.systemId, actorUserId: null };
  const docId = str(input?.documentId);
  if (!docId) return 0;
  await resolveSystem(c);
  const rows = await prisma.crmDeal.findMany({
    where: { ...identityScope(c), quotationDocId: docId, kind: "OPEN" },
    select: { id: true, pipeline: { select: { stageOnQuoteAcceptedId: true, stageOnQuoteRejectedId: true } } },
    orderBy: { id: "asc" },
  });
  let moved = 0;
  let firstError: unknown = null;
  for (const d of rows) {
    const stageId = input.accepted ? d.pipeline.stageOnQuoteAcceptedId : d.pipeline.stageOnQuoteRejectedId;
    if (!stageId) continue;
    const flag: BridgeMoveFlag = {
      ref: `account.quotation.responded#${docId}#${input.accepted ? "A" : "R"}`,
      title: input.accepted ? "ลูกค้าตอบรับใบเสนอราคา — ย้ายดีลตามขั้นที่ตั้งไว้" : "ลูกค้าปฏิเสธใบเสนอราคา — ย้ายดีลตามขั้นที่ตั้งไว้",
    };
    // ดีลหนึ่งย้ายไม่ได้ (เงื่อนไขของขั้น/ชนกัน) ต้องไม่ขวางดีลอื่นของใบเดียวกัน — ล้มตัวแรกโยนต่อท้ายสุด (ผู้เรียกบันทึก WARN)
    try {
      const out = await moveCore(c, null, d.id, { stageId }, { flag });
      if (out.changed) {
        moved += 1;
        // CRM C2.7 ▸ แจ้งเจ้าของดีล 1 ใบต่อ (เอกสาร, คำตอบ) — ผูกกับ "การย้ายที่เกิดจริง" ซึ่งธงของ moveCore การันตีว่าเกิดครั้งเดียว
        //   AUDIT-CLASS X8: ข้อความไทยกลาง ๆ + id ล้วน (ไม่มีชื่อลูกค้า/เบอร์/อีเมล/ชื่อดีล/เลขที่เอกสาร) ◂
        await notifyQuoteResponse(c, out.deal.id, out.deal.ownerUserId, input.accepted);
      }
    } catch (e) {
      // เงื่อนไขของขั้นปลายทางไม่ครบ = ส่งซ้ำก็ไม่ผ่าน ⇒ บันทึก WARN (id ล้วน · AUDIT-CLASS X8) แล้วไปดีลถัดไป — ไม่ใช่ความล้มชั่วคราว
      if (e instanceof DealsError && (e.code === "STAGE_REQUIREMENTS" || e.code === "VALIDATION" || e.code === "NOT_FOUND")) {
        await logOps("WARN", "crm", `ย้ายดีลตามคำตอบใบเสนอราคาไม่ได้ (${e.code}) — ดีล ${d.id} · เอกสาร ${docId} · ขั้น ${stageId}`, { tenantId: c.tenantId });
        continue;
      }
      firstError ??= e;
    }
  }
  if (firstError) throw firstError;
  return moved;
}

/** CRM C2.7 ▸ แจ้งเตือนในแอปให้เจ้าของดีล (ไม่มีเจ้าของ = ไม่แจ้ง) — ล้มแล้วไม่ย้อนการย้าย (WARN แล้วไปต่อ) */
async function notifyQuoteResponse(ctx: DealsCtx, dealId: string, ownerUserId: string | null, accepted: boolean): Promise<void> {
  if (!ownerUserId) return;
  try {
    await prisma.appNotification.create({
      data: {
        tenantId: ctx.tenantId,
        recipientUserId: ownerUserId,
        title: accepted ? "ลูกค้าตอบรับใบเสนอราคาแล้ว" : "ลูกค้าปฏิเสธใบเสนอราคา",
        body: `ดีลถูกย้ายไปขั้นที่ตั้งไว้ในไปป์ไลน์แล้ว — เปิดดูได้ที่ /app/sys/${ctx.systemId}/crm/deals/${dealId}`,
      },
    });
  } catch (e) {
    await logOps("WARN", "crm", `แจ้งเตือนคำตอบใบเสนอราคาไม่สำเร็จ — ดีล ${dealId}`, { tenantId: ctx.tenantId, detail: e instanceof Error ? `${e.name}: ${e.message}` : String(e) });
  }
}

/**
 * `account.document.issued` (ใบแจ้งหนี้ที่แปลงมาจากใบเสนอราคาของดีล) → `CrmDeal.invoiceDocId` ของดีลในระบบนี้
 * AUDIT-CLASS X4: conditional updateMany (`invoiceDocId IS NULL`) ต่อดีลใต้ล็อกแถว ⇒ ส่งซ้ำ/พร้อมกัน = เขียนครั้งเดียว + event ครั้งเดียว
 * ดีลที่มีใบแจ้งหนี้อยู่แล้ว = ไม่ทับ · คืนจำนวนดีลที่ผูก
 */
export async function linkInvoiceFromBridge(ctx: { tenantId: string; systemId: string }, input: { quotationDocId: string; invoiceDocId: string }): Promise<number> {
  const c: DealsCtx = { tenantId: ctx.tenantId, systemId: ctx.systemId, actorUserId: null };
  const qt = str(input?.quotationDocId);
  const inv = str(input?.invoiceDocId);
  if (!qt || !inv) return 0;
  await resolveSystem(c);
  const rows = await prisma.crmDeal.findMany({ where: { ...identityScope(c), quotationDocId: qt, invoiceDocId: null }, select: { id: true }, orderBy: { id: "asc" } });
  let linked = 0;
  for (const d of rows) {
    const done = await prisma.$transaction(async (tx) => {
      await lockDealRows(tx, c, [d.id]);
      const n = await tx.crmDeal.updateMany({ where: { ...identityScope(c), id: d.id, quotationDocId: qt, invoiceDocId: null }, data: { invoiceDocId: inv } });
      if (n.count !== 1) return false;
      await emitDeal(tx, c, EVT.updated, d.id, `invoice-${inv}`, { dealId: d.id, changedKeys: ["invoiceDocId"], documentId: inv });
      return true;
    }, TX_OPTS);
    if (done) {
      linked += 1;
      await audit(c, "crm.deal.invoice.link", d.id, { after: { invoiceDocId: inv, via: "account.document.issued" } });
    }
  }
  return linked;
}
// ◂ CRM C1.8

// CRM C2.7 ▸ ทางเดินเงิน: ป้าย "ต่างจากใบเสนอราคา" · ออกใบแจ้งหนี้อัตโนมัติตอนชนะ · ชนะอัตโนมัติเมื่อจ่ายครบ
//   (ตารางเงิน/ตัวรับ event อยู่ที่ `payments.ts` + `platform/crm-bridges/money.ts` — ที่นี่มีเฉพาะสิ่งที่เป็นของ "ดีล")

/**
 * ประตูเขียน `CrmDeal.wonValueSatang` ให้ "ทางเดินเงิน" (`payments.ts`) ใช้ในธุรกรรมของมันเอง
 * 🔴 ทำไมต้องอยู่ไฟล์นี้: คอลัมน์ที่ควบคุมของดีล (มูลค่า · ขั้น · ชนิด · มูลค่าตอนชนะ …) เขียนได้จาก `crm/deals*.ts`
 *    เท่านั้น (ข้อสอบ C1.5-S0.8) — ผู้เรียกถือ advisory lock ของดีล + ล็อกแถวไว้แล้ว ที่นี่จึงเป็นการเขียนค่าเดียว
 * null = ยังไม่มีเงินเข้าเลย ⇒ กลับไปเป็น "ไม่มีมูลค่าที่รับจริง" (R-E.7)
 */
export async function setWonValueInTx(
  tx: Prisma.TransactionClient,
  ctx: { tenantId: string; systemId: string },
  dealId: string,
  wonValueSatang: bigint | null,
): Promise<void> {
  await tx.crmDeal.updateMany({ where: { id: dealId, tenantId: ctx.tenantId, systemId: ctx.systemId }, data: { wonValueSatang } });
}

/** §11.3: รายการของดีลต่างจากใบเสนอราคาที่ออกไปแล้วไหม (ป้ายบนดีล 360 · ด่านของ `issueInvoice`) */
export async function quotationDiffers(ctx: DealsCtx, actor: MemberActor, dealId: string): Promise<boolean> {
  const a = await enter(ctx, actor);
  const deal = await loadDeal(ctx, a, dealId);
  return quotationDiffersFor(ctx, deal);
}

/**
 * `crm.deal.won` → pipeline ที่ตั้ง `autoInvoiceOnWon` = ออกใบแจ้งหนี้ให้ดีลนั้น **ใบเดียว**
 * AUDIT-CLASS X4: `issueInvoice` ถือ advisory lock ต่อดีลและคืนใบเดิมเมื่อมี `invoiceDocId` แล้ว ⇒ ส่งซ้ำ/พร้อมกัน = ใบเดียว
 * AUDIT-CLASS X9: audit `crm.deal.invoice.auto` (actorType SYSTEM) · ออกไม่ได้ (ยังไม่เชื่อมบัญชี/รายการต่าง) = โยนให้ผู้เรียก WARN —
 *   ดีลยังชนะตามปกติ (การออกบิลเป็น "ของแถม" ของการชนะ ไม่ใช่เงื่อนไข)
 */
export async function autoInvoiceOnWonFromBridge(ctx: { tenantId: string; systemId: string }, input: { dealId: string }): Promise<{ docId: string | null; created: boolean }> {
  const c: DealsCtx = { tenantId: ctx.tenantId, systemId: ctx.systemId, actorUserId: null };
  const dealId = str(input?.dealId);
  if (!dealId) return { docId: null, created: false };
  await resolveSystem(c);
  const deal = await prisma.crmDeal.findFirst({ where: { ...identityScope(c), id: dealId }, select: { id: true, kind: true, invoiceDocId: true, pipeline: { select: { autoInvoiceOnWon: true } } } });
  if (!deal || deal.kind !== "WON" || !deal.pipeline.autoInvoiceOnWon) return { docId: null, created: false };
  if (deal.invoiceDocId) return { docId: deal.invoiceDocId, created: false };
  const out = await invoiceCore(c, null, deal.id);
  if (out.created) await audit(c, "crm.deal.invoice.auto", deal.id, { after: { docId: out.docId, via: "crm.deal.won" } });
  return out;
}

/**
 * เงินเข้าครบ → pipeline ที่ตั้ง `autoWonOnPaid` ย้ายดีลไปขั้นชนะ **ครั้งเดียวต่อดีล**
 * AUDIT-CLASS X4: ใช้ธงของสะพาน (`moveCore` + กิจกรรม AUTO `sourceRef`) ⇒ ยิงซ้ำ/พร้อมกันกี่รอบก็ย้ายครั้งเดียว
 * AUDIT-CLASS X9: audit `crm.deal.won.auto` (actorType SYSTEM — ไม่ผูกกับพนักงานที่บังเอิญกดปุ่มผูกบิล)
 */
export async function autoWinOnPaidFromBridge(ctx: { tenantId: string; systemId: string }, input: { dealId: string }): Promise<{ won: boolean }> {
  const c: DealsCtx = { tenantId: ctx.tenantId, systemId: ctx.systemId, actorUserId: null };
  const dealId = str(input?.dealId);
  if (!dealId) return { won: false };
  await resolveSystem(c);
  const deal = await prisma.crmDeal.findFirst({
    where: { ...identityScope(c), id: dealId },
    select: { id: true, kind: true, valueSatang: true, paidSatang: true, pipelineId: true, pipeline: { select: { autoWonOnPaid: true } } },
  });
  if (!deal || deal.kind !== "OPEN" || !deal.pipeline.autoWonOnPaid) return { won: false };
  if (deal.valueSatang <= 0 || deal.paidSatang < BigInt(deal.valueSatang)) return { won: false };
  const stage = await prisma.crmStage.findFirst({ where: { ...identityScope(c), pipelineId: deal.pipelineId, kind: "WON" }, orderBy: [{ sortOrder: "asc" }, { id: "asc" }], select: { id: true } });
  if (!stage) return { won: false };
  const flag: BridgeMoveFlag = { ref: `crm.deal.paid.autowon#${deal.id}`, title: "รับเงินครบตามมูลค่าดีล — ย้ายดีลไปขั้นชนะอัตโนมัติ" };
  const out = await moveCore(c, null, deal.id, { stageId: stage.id }, { flag });
  if (out.changed) await audit(c, "crm.deal.won.auto", deal.id, { after: { stageId: stage.id, paidSatang: Number(deal.paidSatang), valueSatang: deal.valueSatang } });
  return { won: out.changed };
}
// ◂ CRM C2.7
