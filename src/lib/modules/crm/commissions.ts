// commissions.ts — คอมมิชชัน → เงินเดือน ของ CRM v2 (ใบ C3.3 · พิมพ์เขียว §5.9 · §11.6 · มติ C3 · addendum ข้อ 1–13 + มติผู้คุมงาน 26 ก.ย. 2569)
//
// ของที่ไฟล์นี้เป็นเจ้าของ: `CrmCommissionRule` · `CrmCommission` (ตารางของ crm_v2_c — ใบนี้ไม่มี migration)
//
// ทางเข้าของสะพาน (ไม่มี actor คน · ผู้เรียกผูกร้าน+ระบบมาแล้ว):
//   onPaid(ctx, {dealId, refType:"DEAL_PAYMENT", refId}) · onWon(ctx, {dealId}) · reverse(ctx, {refId, reason?}) · syncPayroll(ctx, {userId?})
//   + ตัวต่อของทางเดินเงิน/ดีล (หลัง commit เสมอ · ล้ม = WARN ไม่พาเงิน/ดีลล้ม): afterPaymentCounted · afterPaymentsReversed · afterDealMoved
//   + ผลของสายอนุมัติ (approval-effects.ts): applyApprovalDecision · ผลของรอบจ่ายเงินเดือน (hr.payroll.paid): onPayrollPaid
//   + ตัวรับ event ของตัวเอง (สำรองเมื่อโพรเซสตายกลางทาง): advanceById · handoffById · งานรายนาที: runPayrollSync
// ทางเข้าของคน (actor + คีย์ + การมองเห็น): listRules · createRule · updateRule · approve · approveMany · reject · mine · list · pending · report
//
// 🔴 AUDIT-CLASS X3 (เงินไม่หาย/ไม่จ่ายซ้ำเมื่อยิงพร้อมกัน):
//    • แถวคอมมิชชันเกิดจาก **conditional insert** (`createManyAndReturn` + skipDuplicates = INSERT … ON CONFLICT DO NOTHING) ใต้
//      unique `(dealId, ruleId, userId, refId)` — ไม่มี "เช็คแล้วค่อยใส่" ที่ชนะด้วยจังหวะ
//    • ส่วนแบ่งของการจ่ายบางส่วนคิดจาก **ผลรวมสะสม** ที่อ่าน "ใต้ advisory lock ต่อดีล" (`crm:commission:deal:<id>`) ⇒ สองงวดพร้อมกัน
//      ต่อคิวกันที่ฐาน · Σ ส่วนแบ่ง = คอมมิชชันเต็มพอดี (สตางค์ไม่หาย) · ภายในล็อกใช้ `tx` ตัวเดียว (ไม่เรียกฟังก์ชันที่เปิดธุรกรรมเอง —
//      แบบ `ensureAccountContact` ของ C0.3: connection ที่สองใต้ล็อก = pool ตันเมื่อยิง 12 ทาง)
// 🔴 AUDIT-CLASS X4 (ส่งซ้ำ): ทุกการเปลี่ยนสถานะเป็น `updateMany` ที่มี guard สถานะ · event ยิงใน tx เดียวกับการเปลี่ยนและเฉพาะเมื่อ
//    คำสั่งนั้นเป็นคนเปลี่ยนจริง · ส่งเข้าเงินเดือนใต้ล็อกแถวคอมมิชชัน (`FOR UPDATE`) + partial unique ของ HR ⇒ รายการเดียวเสมอ ·
//    ถอนคืน = แถว REVERSAL ใต้ unique เดียวกัน (refId = id ต้นทาง) ⇒ ถอนซ้ำกี่รอบก็แถวเดียว · ไม่แก้รอบจ่ายเงินเดือนที่ปิดแล้ว
// 🔴 AUDIT-CLASS X1: ทุกคำสั่งผูก tenantId + systemId ที่ resolve ใหม่ (ระบบชนิด CRM ของร้านนี้) · ของร้าน/ระบบอื่น = NOT_FOUND ·
//    แถวของคนอื่นเห็นได้เฉพาะคนที่มีคีย์ + มองเห็นดีลนั้น (visibleWhere ผ่าน `dealWhere`) · "ของฉัน" = แถวของตัวเองเท่านั้น
// 🔴 AUDIT-CLASS X8: payload ของ event = id + จำนวนสตางค์ + งวด (ไม่มีชื่อ/เบอร์/อีเมลลูกค้า) · โน้ตที่ส่ง HR เป็นข้อความกลาง
// 🔴 AUDIT-CLASS X9: สร้าง/แก้กฎ (before/after) · อนุมัติ · ไม่อนุมัติ (เหตุผล ≥ 5 ตัวอักษร) · ถอนคืน — มีแถว audit พร้อมเหตุผลทุกครั้ง
// 🔴 R-E.14: ระบบ uiVersion 1 — ทางเข้าของคน = CrmV2DisabledError · onPaid/onWon/syncPayroll = ไม่ทำอะไร (ไม่มีแถว ไม่มี event)
//    (การถอนคืนไม่มีประตูแบบเดียวกับทางเดินเงิน — แต่ระบบ v1 ไม่มีแถวให้ถอนอยู่แล้ว)
// 🔴 เงิน = สตางค์ BigInt ทั้งเส้น · ผลรวมรายงานคิดใน SQL เป็น bigint (R-E.8) แล้วคืนเป็น number (ปลอดภัย < 9·10¹⁵)

import { Prisma } from "@prisma/client";
import type { CrmCommission, CrmCommissionRule } from "@prisma/client";
import { writeAudit } from "@/lib/core/audit";
import { emitOutbox } from "@/lib/core/outbox";
import { logOps } from "@/lib/core/ops";
import type { MemberActor } from "@/lib/modules/member";
import { prisma } from "./db";
import { crmCan, crmParam, crmForbiddenMessage } from "./access";
import { dealWhere } from "./where";
import { parseCrmSettings, setCrmCommissionSettings } from "./settings";
import { z } from "zod";
import { CrmV2DisabledError } from "./ui-version";
import {
  COMMISSION_KINDS,
  COMMISSION_LIMITS,
  COMMISSION_REVERSAL_SETTLED_NOTE,
  COMMISSION_WAS_REJECTED_NOTE,
  PERIOD_KEY_RE,
  checkRuleConfig,
  commissionOf,
  commissionPeriodOf,
  commissionSettingsOf,
  cumulativeOf,
  describeRule,
  firstFreePeriod,
  payrollStateOf,
  splitParts,
  type CommissionBasis,
  type CommissionDto,
  type CommissionKind,
  type CommissionReport,
  type CommissionReportRow,
  type CommissionRuleDto,
  type CommissionSettings,
  type CommissionStatus,
  type RuleConfig,
} from "./commissions-shared";

export type { CommissionDto, CommissionReport, CommissionRuleDto } from "./commissions-shared";

const hrFacade = () => import("@/lib/modules/hr");
const approvalFacade = () => import("@/lib/modules/approval");
const accountFacade = () => import("@/lib/modules/account");

type Tx = Prisma.TransactionClient;
export type CommissionsCtx = { tenantId: string; systemId: string; actorUserId?: string | null };
type Scope = { tenantId: string; systemId: string };
type SysRow = { id: string; tenantId: string; settings: Prisma.JsonValue };

const TX_OPTS = { maxWait: 20_000, timeout: 40_000 } as const;
const ZERO = BigInt(0);
const REF_PAYMENT = "DEAL_PAYMENT";
const REF_WON = "DEAL_WON";
const REF_REVERSAL = "REVERSAL";
/**
 * รอบ 5 (มติผู้คุมงาน B1): refId ของคอมมิชชันผูกกับ "ร่าง" (incarnation) ของแถวรับเงิน = `<paymentId>#c<countedAt ms>`
 * — C2.7 ปลุกแถว DOC_SETTLE ด้วย id เดิมแต่ countedAt ใหม่ทุกครั้ง (รวมกรณีถอน+ปลุกในธุรกรรมเดียว ที่ REVERSED ไม่เคยให้ใครเห็น)
 * ⇒ "นับแล้ว" = มีแถวของร่างปัจจุบัน · แถวของร่างเก่าที่ยังไม่ถูกถอน = ค้าง (ถอนก่อนคิดใหม่) · cuid ไม่มี '#' ⇒ ส่วนหน้า '#' = id ของแถวรับเงิน
 * (สองการปลุกใน ms เดียวกันได้กุญแจเดียวกัน — เป็นไปไม่ได้ในทางปฏิบัติ · บันทึกเป็นข้อยอมรับ)
 */
const incKey = (paymentId: string, countedAt: Date) => `${paymentId}#c${countedAt.getTime()}`;
/**
 * รอบ 6 B-1: ธง "ประเมินแล้วไม่ตรง" ต่อ (ร่างของงวด, กฎ) — `OpsAlertState.source` (ตารางธงของแพลตฟอร์ม · ไม่มีข้อมูลลูกค้า)
 * ⇒ คิว (1ก) ไม่หยิบงวดที่ทุกกฎที่ใช้งานอยู่มีแถวหรือธงแล้ว (ไม่วนซ้ำตลอดไป) · แก้กฎที่เปลี่ยนการจับคู่ = ล้างธงของกฎนั้น
 */
const NOMATCH_PREFIX = "crm.commission.nomatch:";
const nomatchKey = (paymentKey: string, ruleId: string) => `${NOMATCH_PREFIX}${paymentKey}:${ruleId}`;
/**
 * รีวิวรอบ 6 (M15 ของ r7): "เวลานับครั้งแรก" ของงวดรับเงิน เก็บถาวรต่องวด (`OpsAlertState` `crm.commission.first:<paymentId>` = ค่าน้อยสุดที่เคยเห็น)
 * — หลักฐานในกุญแจของแถวเดิมหายไปพร้อมแถว PENDING ที่ถูกลบตอนปลุก ⇒ ทางที่คิดงวดนั้นใหม่ภายหลัง (revisit · งานรายนาที) ยังไม่ให้เครดิตย้อนหลัง
 */
const FIRST_PREFIX = "crm.commission.first:";
async function rememberFirstCounted(paymentId: string, at: Date): Promise<void> {
  const source = `${FIRST_PREFIX}${paymentId}`;
  await prisma.opsAlertState.createMany({ data: [{ source, lastAlertAt: at }], skipDuplicates: true });
  await prisma.opsAlertState.updateMany({ where: { source, lastAlertAt: { gt: at } }, data: { lastAlertAt: at } });
}
/** รีวิวรอบ 6 ข้อ 3: cursor ของคิว (1ก) ต่อระบบ (countedAt ของแถวสุดท้ายที่เดินถึง · ใหม่ → เก่า) */
const Q1A_CURSOR_PREFIX = "crm.commission.q1a.cursor:";
/** SQL: กุญแจร่างปัจจุบันของแถวรับเงิน `alias` (ตรงกับ `incKey`) */
const keySql = (alias: string) =>
  Prisma.sql`(${Prisma.raw(`${alias}."id"`)} || '#c' || (ROUND(EXTRACT(EPOCH FROM COALESCE(${Prisma.raw(`${alias}."countedAt"`)}, ${Prisma.raw(`${alias}."createdAt"`)})) * 1000))::bigint::text)`;
/** ms ของร่างจากกุญแจ (`#c<ms>`) — ไม่ใช่รูปแบบนี้ = null */
const incMsOf = (refId: string): number | null => {
  const m = /#c(\d+)$/.exec(refId);
  return m ? Number(m[1]) : null;
};
const payIdSql = (alias: string) => Prisma.sql`split_part(${Prisma.raw(`${alias}."refId"`)}, '#', 1)`;
const APPROVAL_ENTITY = "crm.commission";
const INT_MAX = 2_147_483_647;

export type CommissionErrorCode = "VALIDATION" | "NOT_FOUND" | "FORBIDDEN" | "APPROVAL_REQUIRED" | "CONFLICT";
export class CommissionsError extends Error {
  readonly code: CommissionErrorCode;
  constructor(code: CommissionErrorCode, message: string) {
    super(message);
    this.code = code;
    this.name = "CommissionsError";
  }
}
const fail = (code: CommissionErrorCode, message: string) => new CommissionsError(code, message);

const SYS_NOT_FOUND = "ไม่พบระบบ CRM นี้ในร้านที่เปิดอยู่ — รีเฟรชหน้าแล้วลองใหม่";
const ROW_NOT_FOUND = "ไม่พบรายการคอมมิชชันนี้ในระบบ CRM ที่เปิดอยู่ (อาจถูกย้ายหรืออยู่คนละระบบ) — รีเฟรชหน้าแล้วลองใหม่";
const RULE_NOT_FOUND = "ไม่พบกฎคอมมิชชันนี้ในระบบ CRM ที่เปิดอยู่ — รีเฟรชหน้าแล้วลองใหม่";
const DECIDED_MSG = "รายการนี้ถูกตัดสินไปแล้ว (อนุมัติ/ไม่อนุมัติ/ถอนคืน) — รีเฟรชหน้าเพื่อดูสถานะล่าสุด";
const OVER_CAP_MSG = "ยอดคอมมิชชันนี้เกินวงเงินที่บัญชีนี้อนุมัติได้ — รายการยังรออนุมัติอยู่ และระบบแจ้งผู้มีวงเงินพอ (เจ้าของร้าน) ให้แล้ว";

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const num = (v: bigint | number | null | undefined): number => (v === null || v === undefined ? 0 : Number(v));
const scopeOf = (ctx: Scope): Scope => ({ tenantId: ctx.tenantId, systemId: ctx.systemId });

// ───────────────────────── ระบบ · ประตู · สิทธิ์ ─────────────────────────

/** AUDIT-CLASS X1: ระบบ CRM ของร้านนี้จริง (id + tenant + type CRM) — ไม่พบ = null */
async function loadSystem(ctx: Scope): Promise<SysRow | null> {
  const tenantId = str(ctx?.tenantId);
  const systemId = str(ctx?.systemId);
  if (!tenantId || !systemId) return null;
  return prisma.appSystem.findFirst({ where: { id: systemId, tenantId, type: "CRM" }, select: { id: true, tenantId: true, settings: true } });
}
const isV2 = (sys: SysRow) => parseCrmSettings(sys.settings).uiVersion === 2;

/** ทางเข้าของสะพาน: ระบบของร้าน + uiVersion 2 — ไม่ผ่าน = null (เงียบ · R-E.14) */
async function bridgeSystem(ctx: Scope): Promise<SysRow | null> {
  const sys = await loadSystem(ctx);
  return sys && isV2(sys) ? sys : null;
}

/** ทางเข้าของคน: ระบบ (NOT_FOUND) → uiVersion 2 (CrmV2DisabledError) → เป็นพนักงาน (NOT_FOUND) */
async function enterHuman(ctx: Scope, actor: MemberActor | null | undefined): Promise<SysRow> {
  const sys = await loadSystem(ctx);
  if (!sys) throw fail("NOT_FOUND", SYS_NOT_FOUND);
  if (!isV2(sys)) throw new CrmV2DisabledError();
  if (!actor || actor.role === "CUSTOMER" || !str(actor.userId)) throw fail("NOT_FOUND", SYS_NOT_FOUND);
  return sys;
}

function need(actor: MemberActor, ...keys: string[]): void {
  if (keys.some((k) => crmCan(actor, k))) return;
  throw fail("FORBIDDEN", crmForbiddenMessage(keys[0]!));
}

async function audit(ctx: Scope, action: string, targetType: string, targetId: string, body: { before?: unknown; after?: unknown }, actorUserId: string | null): Promise<void> {
  await writeAudit({ tenantId: ctx.tenantId, actorId: actorUserId, actorType: actorUserId ? "USER" : "SYSTEM", action, targetType, targetId, ...body });
}

/** WARN ของ "ของแถม" — id ล้วน ไม่มีข้อความ error ดิบ (error ของ Prisma พาค่าฟิลด์ติดมาได้ — X8) */
async function warn(ctx: Scope, message: string, e: unknown, ids: Record<string, string | null | undefined>): Promise<void> {
  const kind = e instanceof CommissionsError ? `CommissionsError(${e.code})` : e instanceof Error ? e.name : "unknown";
  const detail = Object.entries({ systemId: ctx.systemId, ...ids }).map(([k, v]) => `${k}=${v ?? "-"}`).join(" ");
  await logOps("WARN", "crm", `คอมมิชชัน: ${message}`, { tenantId: ctx.tenantId, detail: `${detail} error=${kind}` }).catch(() => undefined);
}

// ───────────────────────── event (3 ทะเบียน · id ล้วน) ─────────────────────────

function payloadOf(c: CrmCommission, withAdjustment: boolean): Record<string, unknown> {
  return {
    commissionId: c.id,
    dealId: c.dealId,
    ruleId: c.ruleId,
    userId: c.userId,
    amountSatang: Number(c.amountSatang),
    periodKey: c.periodKey,
    status: c.status,
    reversedOfId: c.reversedOfId,
    systemId: c.systemId,
    ...(withAdjustment ? { hrPayAdjustmentId: c.hrPayAdjustmentId } : {}),
  };
}

/** AUDIT-CLASS X4: key `crm.commission.<verb>#<commissionId>` (R-C.8) — ยิงใน tx ของการเขียนเสมอ */
async function emitCommission(tx: Tx, c: CrmCommission, verb: "created" | "approved" | "reversed"): Promise<void> {
  await emitOutbox(tx, {
    tenantId: c.tenantId,
    systemId: c.systemId,
    type: `crm.commission.${verb}`,
    idempotencyKey: `crm.commission.${verb}#${c.id}`,
    payload: payloadOf(c, verb !== "created"),
  });
}

/** รอบ 5 N5: แถว PENDING ที่ถูกลบ (เงินถูกถอน · เปิดดีลใหม่) — `crm.commission.removed#<id>` ใน tx ของการลบ · payload id/สตางค์ล้วน */
async function emitRemoved(tx: Tx, c: CrmCommission): Promise<void> {
  await emitOutbox(tx, {
    tenantId: c.tenantId,
    systemId: c.systemId,
    type: "crm.commission.removed",
    idempotencyKey: `crm.commission.removed#${c.id}`,
    payload: { commissionId: c.id, dealId: c.dealId, ruleId: c.ruleId, userId: c.userId, amountSatang: Number(c.amountSatang), periodKey: c.periodKey, status: c.status, reversedOfId: null, systemId: c.systemId },
  });
}

async function lockDeal(tx: Tx, dealId: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`crm:commission:deal:${dealId}`}, 0))`;
}
async function lockRow(tx: Tx, ctx: Scope, id: string): Promise<CrmCommission | null> {
  await tx.$queryRaw`SELECT "id" FROM "CrmCommission" WHERE "id" = ${id} AND "tenantId" = ${ctx.tenantId} AND "systemId" = ${ctx.systemId} FOR UPDATE`;
  return tx.crmCommission.findFirst({ where: { id, ...scopeOf(ctx) } });
}

// ───────────────────────── กฎ + ดีล + ขอบเขตของกฎ ─────────────────────────

type DealForCommission = {
  id: string;
  pipelineId: string;
  teamId: string | null;
  ownerUserId: string | null;
  collaboratorUserIds: string[];
  valueSatang: number;
  kind: string;
  stageId: string;
  closedAt: Date | null;
  invoiceDocId: string | null;
  quotationDocId: string | null;
};

async function loadDeal(ctx: Scope, dealId: string, db: Tx | typeof prisma = prisma): Promise<DealForCommission | null> {
  return db.crmDeal.findFirst({
    where: { id: dealId, ...scopeOf(ctx) },
    select: { id: true, pipelineId: true, teamId: true, ownerUserId: true, collaboratorUserIds: true, valueSatang: true, kind: true, stageId: true, closedAt: true, invoiceDocId: true, quotationDocId: true },
  });
}

/**
 * ฐาน T **ก่อน VAT** (มติผู้คุมงาน B1 · รีวิวเงิน) — `valueSatang` ถ้า > 0 · ไม่งั้นยอดก่อน VAT ของเงินที่นับแล้ว:
 * บิลหน้าร้าน Σ (grandTotalSatang − vatSatang) · เอกสาร = รายได้สุทธิก่อน VAT ของเอกสารหลักของดีล (facade บัญชี `docNetBeforeVat`)
 * 🔴 ค่านี้ใช้ได้เฉพาะ "แถวแรก" ของ (ดีล, กฎ) — หลังจากนั้น T ถูกแช่ไว้ที่ `basisSatang` ของแถวแรก (ดู `frozenTotal`)
 *    ⇒ บิล/เอกสารที่ตามมาทีหลังเปลี่ยนส่วนแบ่งของงวดที่จ่ายไปแล้วไม่ได้ (ไม่มี "ฐานลอย")
 */
async function baseTotalOf(ctx: Scope, deal: DealForCommission): Promise<bigint> {
  if (deal.valueSatang > 0) return BigInt(deal.valueSatang);
  const rows = await prisma.crmDealPayment.findMany({ where: { ...scopeOf(ctx), dealId: deal.id, status: "COUNTED" }, select: { refType: true, refId: true }, take: 500 });
  let total = ZERO;
  const saleIds = [...new Set(rows.filter((r) => r.refType === "POS_SALE").map((r) => r.refId))];
  if (saleIds.length > 0) {
    const sales = await prisma.posSale.findMany({ where: { tenantId: ctx.tenantId, id: { in: saleIds } }, select: { grandTotalSatang: true, vatSatang: true }, take: 500 });
    for (const s of sales) total += BigInt(Math.max(0, s.grandTotalSatang - s.vatSatang));
  }
  const anchor = deal.invoiceDocId ?? deal.quotationDocId;
  if (anchor && rows.some((r) => r.refType !== "POS_SALE")) {
    const net = await (await accountFacade()).docNetBeforeVat(ctx.tenantId, anchor);
    total += BigInt(Math.max(0, net ?? 0));
  }
  return total;
}

/**
 * T ของ (ดีล, กฎ) ใต้ล็อกต่อดีล (มติ B1 + รีวิวรอบ 2 R1):
 *   • ดีลที่มีมูลค่า (valueSatang > 0) — T แช่ไว้ที่ `basisSatang` ของแถวต้นทางแถวแรก (ไม่มีแถว = มูลค่าปัจจุบัน)
 *   • ดีลที่ไม่มีมูลค่า — T = max(T ที่เคยใช้สูงสุด, ยอดก่อน VAT ปัจจุบัน) **โตขึ้นได้อย่างเดียว** และแถวใหม่พก T นั้นไป
 *     ⇒ บิลที่ตามมาทีหลังได้ส่วนของตัวเอง (ไม่ใช่ 0) · ผลรวมสะสมยังพับเข้าหากันเพราะส่วนแบ่งคิดจาก F_T − ยอดที่เครดิตแล้ว
 */
async function frozenTotal(tx: Tx, ctx: Scope, dealId: string, ruleId: string, now: bigint, valueBased: boolean): Promise<bigint> {
  if (valueBased) {
    const first = await tx.crmCommission.findFirst({
      where: { ...ctx, dealId, ruleId, reversedOfId: null, basisSatang: { gt: ZERO } },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: { basisSatang: true },
    });
    return first ? first.basisSatang : now;
  }
  const agg = await tx.crmCommission.aggregate({ where: { ...ctx, dealId, ruleId, reversedOfId: null }, _max: { basisSatang: true } });
  const max = agg._max.basisSatang ?? ZERO;
  return max > now ? max : now;
}

type PayRow = { id: string; refType: string; refId: string; satang: bigint };

/**
 * รีวิวรอบ 6 (updateRule แบบ atomic): ล็อกแถวกฎ `FOR SHARE` ใต้ธุรกรรมที่จะเขียนแถวคอมมิชชัน · คืนเฉพาะกฎที่ยังเปิดและ `updatedAt` ตรงกับที่อ่านไว้
 * ⇒ updateRule (FOR UPDATE + นับแถวในธุรกรรมเดียว) กับการเขียนแถวไม่สลับกัน: ไม่มีแถวใต้ขอบเขตเก่าหลังขอบเขตถูกเปลี่ยน
 */
async function lockRules(tx: Tx, ctx: Scope, rules: CrmCommissionRule[]): Promise<Set<string>> {
  if (rules.length === 0) return new Set();
  const rows = await tx.$queryRaw<{ id: string; active: boolean; updatedAt: Date }[]>`
    SELECT "id", "active", "updatedAt" FROM "CrmCommissionRule"
    WHERE "id" = ANY(${rules.map((r) => r.id)}::text[]) AND "tenantId" = ${ctx.tenantId} AND "systemId" = ${ctx.systemId}
    ORDER BY "id" FOR SHARE`;
  const seen = new Map(rules.map((r) => [r.id, r.updatedAt.getTime()]));
  return new Set(rows.filter((r) => r.active && seen.get(r.id) === new Date(r.updatedAt).getTime()).map((r) => r.id));
}
type Ratio = { net: bigint; grand: bigint };
type Ratios = { payments: Map<string, Ratio>; docs: Map<string, Ratio>; anchor: Ratio | null };

/**
 * อัตราส่วนก่อน VAT ของ "เอกสารของแต่ละงวด" (รีวิวรอบ 2 S-a + รอบ 5 N6) — อ่านนอกล็อก (facade บัญชี `commissionDocRatios`)
 * รับชำระ (PAYMENT) → เอกสารที่การรับชำระนั้นลง · ปิดยอด (DOC_SETTLE) → เอกสารนั้นเอง · ไม่รู้ = ยอดเต็ม
 */
async function docRatiosOf(ctx: Scope, deal: DealForCommission): Promise<Ratios> {
  const rows = await prisma.crmDealPayment.findMany({ where: { ...scopeOf(ctx), dealId: deal.id, refType: { in: ["PAYMENT", "DOC_SETTLE"] } }, select: { refType: true, refId: true }, take: 500 });
  const anchorId = deal.invoiceDocId ?? deal.quotationDocId;
  // รอบ 6: fail CLOSED — อ่านไม่ได้ = โยน (ตัวต่อ WARN · งานรายนาทีลองใหม่) ไม่ใช่คิดเป็นยอดเต็มแบบเงียบ ๆ
  const r = await (await accountFacade()).commissionDocRatios(ctx.tenantId, {
    paymentIds: rows.filter((x) => x.refType === "PAYMENT").map((x) => x.refId),
    docIds: [...rows.filter((x) => x.refType === "DOC_SETTLE").map((x) => x.refId), ...(anchorId ? [anchorId] : [])],
  });
  const conv = (o: Record<string, { net: number; grand: number }>) =>
    new Map(Object.entries(o).filter(([, v]) => v.grand > 0).map(([k, v]) => [k, { net: BigInt(v.net), grand: BigInt(v.grand) }] as const));
  const docs = conv(r.docs);
  return { payments: conv(r.payments), docs, anchor: anchorId ? docs.get(anchorId) ?? null : null };
}

/**
 * ยอดก่อน VAT ของเงินแต่ละงวด (รีวิวรอบ 2 S-a) — T ก่อน VAT ⇒ เงินที่นับเข้า "ยอดสะสม" ต้องก่อน VAT ด้วย ไม่งั้นคอมมิชชันเต็มที่ 93.46 % ของเงินที่เก็บได้
 * บิลหน้าร้าน: satang × (grand − vat) / grand ของบิลนั้น · รับชำระ/ปิดยอดเอกสาร: satang × net / grand ของเอกสารหลัก (ปัดลงต่องวด · bigint)
 * ไม่รู้ VAT ของงวดนั้น (ไม่มีบิล/เอกสารจริง) = ยอดเต็ม · อ่านบิลด้วย tx ของผู้เรียก (ใต้ล็อก)
 */
async function netOfPayments(tx: Tx, ctx: Scope, rows: PayRow[], ratios: Ratios): Promise<bigint> {
  const saleIds = [...new Set(rows.filter((r) => r.refType === "POS_SALE").map((r) => r.refId))];
  const sales = saleIds.length
    ? new Map((await tx.posSale.findMany({ where: { tenantId: ctx.tenantId, id: { in: saleIds } }, select: { id: true, grandTotalSatang: true, vatSatang: true }, take: 500 })).map((x) => [x.id, x]))
    : new Map<string, { id: string; grandTotalSatang: number; vatSatang: number }>();
  let total = ZERO;
  for (const r of rows) {
    if (r.refType === "POS_SALE") {
      const sale = sales.get(r.refId);
      total += sale && sale.grandTotalSatang > 0 ? (r.satang * BigInt(Math.max(0, sale.grandTotalSatang - sale.vatSatang))) / BigInt(sale.grandTotalSatang) : r.satang;
    } else {
      const ratio = (r.refType === "PAYMENT" ? ratios.payments.get(r.refId) : ratios.docs.get(r.refId)) ?? null;
      total += ratio ? (r.satang * ratio.net) / ratio.grand : r.satang;
    }
  }
  return total;
}

async function activeRules(ctx: Scope, basis: CommissionBasis): Promise<CrmCommissionRule[]> {
  return prisma.crmCommissionRule.findMany({ where: { ...scopeOf(ctx), active: true, basis }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }, { id: "asc" }], take: 200 });
}

/** กฎที่ขอบเขตตรงกับดีล (AND ของ pipeline · ทีม · สินค้า — มติ ข) — กฎที่ตรงทุกกฎซ้อนกัน */
async function matchingRules(ctx: Scope, rules: CrmCommissionRule[], deal: DealForCommission): Promise<CrmCommissionRule[]> {
  let teams: string[] | null = null;
  let products: string[] | null = null;
  const out: CrmCommissionRule[] = [];
  for (const r of rules) {
    if (r.pipelineId && r.pipelineId !== deal.pipelineId) continue;
    if (r.teamId) {
      // ทีม = deal.teamId ถ้ามี · ไม่มี = ทีมของเจ้าของดีล ณ เวลาคิด
      if (deal.teamId) {
        if (deal.teamId !== r.teamId) continue;
      } else {
        teams ??= deal.ownerUserId ? await ownerTeams(ctx, deal.ownerUserId) : [];
        if (!teams.includes(r.teamId)) continue;
      }
    }
    if (r.productIds.length > 0) {
      products ??= (await prisma.crmDealLine.findMany({ where: { dealId: deal.id, tenantId: ctx.tenantId }, select: { productId: true }, take: 500 })).flatMap((l) => (l.productId ? [l.productId] : []));
      if (!r.productIds.some((p) => products!.includes(p))) continue;
    }
    out.push(r);
  }
  return out;
}

/** ทีมของเจ้าของดีล — มติผู้คุมงาน S5: ล้มแล้ว **โยนต่อ** (ทางเดิน retry) ไม่กลืนเป็น "ไม่อยู่ทีมไหน" (จ่ายผิดกฎเงียบ ๆ) */
async function ownerTeams(ctx: Scope, userId: string): Promise<string[]> {
  const { teamsOf } = await import("@/lib/core/teams");
  return (await teamsOf({ tenantId: ctx.tenantId }, userId)).map((t) => t.id);
}

const configOf = (r: CrmCommissionRule): RuleConfig => (r.config && typeof r.config === "object" && !Array.isArray(r.config) ? (r.config as RuleConfig) : {});

/** มติผู้คุมงาน B4: กฎนี้มีแถวบนดีลนี้ภายใต้ "ฐานอื่น" แล้ว (เคยเปลี่ยนฐาน) = ข้าม — กันจ่ายซ้ำสองฐาน (ชั้นที่สองนอกจาก updateRule) */
async function hasOtherBasisRows(tx: Tx, ctx: Scope, dealId: string, ruleId: string, basis: CommissionBasis): Promise<boolean> {
  return !!(await tx.crmCommission.findFirst({ where: { ...ctx, dealId, ruleId, basis: { not: basis } }, select: { id: true } }));
}

/** ธงครั้งเดียวต่อแถว (แถว AuditLog `action` + targetId ใต้ advisory lock) — true = เพิ่งปักโดยเรา */
async function flagOnce(ctx: Scope, action: string, targetId: string, after: Record<string, unknown>): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`crm:commission:flag:${action}:${targetId}`}, 0))`;
    const had = await tx.auditLog.findFirst({ where: { tenantId: ctx.tenantId, action, targetId }, select: { id: true } });
    if (had) return false;
    await tx.auditLog.create({ data: { tenantId: ctx.tenantId, actorType: "SYSTEM", action, targetType: "CrmCommission", targetId, after: after as Prisma.InputJsonValue } });
    return true;
  }, TX_OPTS);
}
async function hasFlag(ctx: Scope, action: string, targetId: string): Promise<boolean> {
  return !!(await prisma.auditLog.findFirst({ where: { tenantId: ctx.tenantId, action, targetId }, select: { id: true } }));
}

const noFreePeriod = () => fail("VALIDATION", "หางวดเงินเดือนที่ยังไม่มีรอบจ่ายไม่พบภายใน 20 ปีข้างหน้า — ตรวจรอบจ่ายเงินเดือนในระบบ HR");

// ═════════════════════════ ทางเข้าของสะพาน (ไม่มี actor คน) ═════════════════════════

/**
 * การรับเงินงวดหนึ่งของดีลถูกนับแล้ว (`CrmDealPayment` COUNTED) → แถวคอมมิชชันของกฎฐาน PAID ที่ตรง
 * 🔴 X1/X6: อ่านแถวรับเงินใหม่ (ร้าน + ระบบ + ดีล + COUNTED · `FOR SHARE` ใต้ล็อก — S8) และเชื่อ **เฉพาะ `satang` ในฐาน**
 * 🔴 X3 · มติผู้คุมงาน B2 (ผลรวมที่ "ซ่อมตัวเอง"): ส่วนแบ่ง = max(0, F_T(Σ งวดที่ยังนับอยู่ซึ่งคิดแล้ว + งวดนี้) − Σ ยอดแถวต้นทางของกฎนี้
 *    ที่งวดยังนับอยู่ (รวมแถวที่ไม่อนุมัติ)) — อ่านใต้ล็อกต่อดีล ⇒ งวดที่ถูกยกเลิกไปแล้ว งวดถัดไปได้คืนส่วนของมัน (สุทธิ = เต็มพอดี)
 *    · T แช่ไว้ที่แถวแรกของ (ดีล, กฎ) (B1) · ส่วนแบ่งยังเป็นสัดส่วนต่องวด (X3.1/X3.2) ไม่ว่าลำดับประมวลผล
 * 🔴 เครดิตเจ้าของดีล ณ เวลาจ่าย (มติ จ) · งวดนี้ได้แถวของกฎนี้ไปแล้ว (ใครก็ตาม) = ข้ามกฎนี้ (เจ้าของเปลี่ยนภายหลังไม่ได้แถวซ้ำ)
 */
export async function onPaid(ctx: CommissionsCtx, input: { dealId: string; refType?: string; refId: string; firstCountedMs?: number | null }): Promise<{ created: number }> {
  const sys = await bridgeSystem(ctx);
  const dealId = str(input?.dealId);
  const refId = str(input?.refId);
  if (!sys || !dealId || !refId) return { created: 0 };
  if (input?.refType !== undefined && input.refType !== REF_PAYMENT) return { created: 0 };
  const s = scopeOf(ctx);
  const pay = await prisma.crmDealPayment.findFirst({ where: { id: refId, ...s, dealId, status: "COUNTED" }, select: { id: true, countedAt: true, createdAt: true } });
  if (!pay) return { created: 0 };
  const rules = await activeRules(s, "PAID");
  if (rules.length === 0) return { created: 0 };
  await rememberFirstCounted(pay.id, new Date(Math.min((pay.countedAt ?? pay.createdAt).getTime(), typeof input?.firstCountedMs === "number" && Number.isFinite(input.firstCountedMs) ? input.firstCountedMs : Number.POSITIVE_INFINITY)));
  const deal = await loadDeal(s, dealId);
  if (!deal) return { created: 0 };
  const matched = await matchingRules(s, rules, deal);
  // รอบ 6 B-1: กฎที่กรองใน SQL ไม่ได้ (ทีม/สินค้า) และไม่ตรงดีลนี้ ⇒ ธง "ประเมินแล้วไม่ตรง" ของร่างนี้
  const preKey = incKey(pay.id, pay.countedAt ?? pay.createdAt);
  // รีวิวรอบ 6 ข้อ 2: ดีลที่ยังไม่มีรายการสินค้าเลย ไม่ได้ธง "สินค้าไม่ตรง" (รายการที่เพิ่มทีหลังเปลี่ยนคำตอบได้ — มัดจำก่อนใส่สินค้า)
  const missed = rules.filter((r) => !matched.includes(r) && (r.teamId || r.productIds.length > 0));
  const hasLines = missed.some((r) => r.productIds.length > 0)
    ? !!(await prisma.crmDealLine.findFirst({ where: { dealId, tenantId: ctx.tenantId }, select: { id: true } }))
    : true;
  const unmatched = missed.filter((r) => r.productIds.length === 0 || hasLines).map((r) => r.id);
  if (unmatched.length) await setNomatch(preKey, unmatched);
  if (matched.length === 0) return { created: 0 };
  const tNow = await baseTotalOf(s, deal);
  const ratios = await docRatiosOf(s, deal);
  const zeroShare: string[] = [];

  const made = await prisma.$transaction(async (tx) => {
    await lockDeal(tx, dealId);
    // ใต้ล็อก (S8): ล็อกแถวรับเงินแบบ FOR SHARE — ยกเลิกรับชำระพร้อมกันต้องรอเรา แล้วตัวต่อถอนคืนเห็นแถวของเรา
    await tx.$queryRaw`SELECT "id" FROM "CrmDealPayment" WHERE "id" = ${pay.id} AND "tenantId" = ${ctx.tenantId} FOR SHARE`;
    const cur = await tx.crmDealPayment.findFirst({ where: { id: pay.id, ...s, status: "COUNTED" }, select: { id: true, satang: true, refType: true, refId: true, countedAt: true, createdAt: true } });
    const live = await loadDeal(s, dealId, tx);
    if (!cur || !live || !live.ownerUserId) return [];
    // รอบ 5 B1: กุญแจร่างปัจจุบัน (countedAt อ่านใต้ FOR SHARE) · N8: เวลานับ "ร่างแรก" = ms ที่น้อยที่สุดในกุญแจของแถวเดิมของงวดนี้ (ทุกกฎ) หรือร่างนี้
    const at = cur.countedAt ?? cur.createdAt;
    const key = incKey(cur.id, at);
    const earlier = await tx.$queryRaw<{ refId: string }[]>`
      SELECT DISTINCT c."refId" FROM "CrmCommission" c
      WHERE c."dealId" = ${dealId} AND c."tenantId" = ${ctx.tenantId} AND c."refType" = ${REF_PAYMENT} AND c."reversedOfId" IS NULL AND ${payIdSql("c")} = ${cur.id}
      LIMIT 200`;
    // รอบ 6 S-2: เวลานับร่างแรก = min(ร่างนี้ · กุญแจของแถวเดิม · ค่าที่ผู้เรียกอ่านไว้ก่อนลบแถว PENDING ของร่างเก่า · createdAt ของ DOC_SETTLE
    //   ที่เกิดมาเป็น COUNTED และการปลุกคง createdAt เดิม)
    const remembered = await tx.opsAlertState.findUnique({ where: { source: `${FIRST_PREFIX}${cur.id}` }, select: { lastAlertAt: true } });
    const firstMs = Math.min(
      at.getTime(),
      remembered ? remembered.lastAlertAt.getTime() : Number.POSITIVE_INFINITY,
      ...earlier.map((e) => incMsOf(e.refId) ?? Number.POSITIVE_INFINITY),
      typeof input?.firstCountedMs === "number" && Number.isFinite(input.firstCountedMs) ? input.firstCountedMs : Number.POSITIVE_INFINITY,
      cur.refType === "DOC_SETTLE" ? cur.createdAt.getTime() : Number.POSITIVE_INFINITY,
    );
    // รอบ 6: ร่างเก่าของงวดนี้เคยถูก "คน" ไม่อนุมัติ ⇒ ร่างใหม่เกิดเป็น PENDING พร้อมป้าย และไม่มีวันอนุมัติเอง (เคารพการตัดสินของคน)
    const wasRejected = !!(await tx.crmCommission.findFirst({
      where: { ...s, dealId, refType: REF_PAYMENT, reversedOfId: null, status: "REJECTED", NOT: { refId: key }, OR: [{ refId: cur.id }, { refId: { startsWith: `${cur.id}#` } }] },
      select: { id: true },
    }));
    const out: CrmCommission[] = [];
    const steady = await lockRules(tx, s, matched);
    for (const rule of matched) {
      if (!steady.has(rule.id)) continue; // กฎถูกแก้/ปิดระหว่างนั้น ⇒ รอบถัดไปคิดด้วยค่าชุดใหม่
      // รีวิวรอบ 2 + รอบ 5 N8: ไม่มีเครดิตย้อนหลัง — เงินที่ "นับครั้งแรก" ก่อนสร้างกฎ ไม่ได้คอมมิชชันของกฎนี้ (การปลุกไม่ทำให้กลายเป็นเงินใหม่)
      // รอบ 6 B-1: ทุกทางที่ "ประเมินแล้วไม่มีแถว" ติดธง nomatch ของร่างนี้ ⇒ คิว (1ก) ไม่หยิบซ้ำทุก 5 นาทีตลอดไป
      if (firstMs < rule.createdAt.getTime() || (await hasOtherBasisRows(tx, s, dealId, rule.id, "PAID"))) {
        zeroShare.push(rule.id);
        continue;
      }
      // รอบ 6 B-1: "นับแล้ว" ต่อ **กฎ** = มีแถวกุญแจร่างนี้ของกฎนี้ (ผู้ใช้ใดก็ได้ · รวมแถวที่ถูกถอนแล้ว) ⇒ ข้าม
      //   (เปลี่ยนเจ้าของ/ผู้ร่วมหลังเครดิต แล้วคิวหยิบซ้ำ ต้องไม่จ่ายงวดเดิมให้คนใหม่อีกรอบ — รอบ 5 N7 ถอนออกแล้ว)
      if (await tx.crmCommission.findFirst({ where: { ...s, dealId, ruleId: rule.id, refType: REF_PAYMENT, refId: key }, select: { id: true } })) continue;
      const T = await frozenTotal(tx, s, dealId, rule.id, tNow, live.valueSatang > 0);
      // ฐานนิ่งแล้ว (ดีลมีมูลค่า + กฎนี้มีแถวบนดีลนี้ ⇒ T แช่ที่แถวแรก) เท่านั้นที่ "ไม่มีแถว" เป็นคำตอบถาวร ⇒ ติดธงได้
      //   ฐานยังไม่นิ่ง (ไม่มีมูลค่า/ยังไม่มีแถว) = มูลค่าหรือเอกสารที่ตั้งทีหลังเปลี่ยนคำตอบได้ ⇒ ไม่ติดธง (มติ S-e: คิวยังหยิบให้)
      const settledBase = live.valueSatang > 0 && !!(await tx.crmCommission.findFirst({ where: { ...s, dealId, ruleId: rule.id, reversedOfId: null, basisSatang: { gt: ZERO } }, select: { id: true } }));
      // minDealSatang รวมค่าเท่ากับ: T < min ⇒ ไม่มีแถว
      if (T <= ZERO || (rule.minDealSatang !== null && T < rule.minDealSatang)) {
        if (settledBase) zeroShare.push(rule.id);
        continue;
      }
      // งวดอื่นที่ยังนับอยู่และคิดกฎนี้ใน "ร่างปัจจุบัน" แล้ว (ก่อน VAT) + ยอดคอมมิชชันที่เครดิตของร่างเหล่านั้น (ยังไม่ถูกถอน · SQL bigint)
      const creditedPays = await tx.$queryRaw<PayRow[]>`
        SELECT p."id", p."refType", p."refId", p."satang" FROM "CrmDealPayment" p
        WHERE p."dealId" = ${dealId} AND p."tenantId" = ${ctx.tenantId} AND p."status" = 'COUNTED' AND p."id" <> ${cur.id}
          AND EXISTS (SELECT 1 FROM "CrmCommission" c WHERE c."dealId" = ${dealId} AND c."ruleId" = ${rule.id} AND c."refType" = ${REF_PAYMENT} AND c."refId" = ${keySql("p")}
                      AND c."reversedOfId" IS NULL AND NOT EXISTS (SELECT 1 FROM "CrmCommission" r WHERE r."reversedOfId" = c."id"))
        LIMIT 1000`;
      const credited = await tx.$queryRaw<{ s: string }[]>`
        SELECT COALESCE(SUM(c."amountSatang"), 0)::text AS s FROM "CrmCommission" c JOIN "CrmDealPayment" p ON p."id" = ${payIdSql("c")}
        WHERE c."dealId" = ${dealId} AND c."ruleId" = ${rule.id} AND c."refType" = ${REF_PAYMENT} AND c."reversedOfId" IS NULL
          AND p."status" = 'COUNTED' AND p."id" <> ${cur.id} AND c."refId" = ${keySql("p")}
          AND NOT EXISTS (SELECT 1 FROM "CrmCommission" r WHERE r."reversedOfId" = c."id")`;
      const paid = await netOfPayments(tx, s, [...creditedPays, { id: cur.id, refType: cur.refType, refId: cur.refId, satang: cur.satang }], ratios);
      const full = commissionOf(rule.kind, configOf(rule), T);
      const share = cumulativeOf(full, T, paid) - BigInt(credited[0]?.s ?? "0");
      const parts = share > ZERO ? splitParts(share, rule.splitCollaboratorsBp, live.ownerUserId, live.collaboratorUserIds) : [];
      if (parts.length === 0) {
        if (settledBase) zeroShare.push(rule.id); // แถวยอด 0 ไม่ถูกเขียน (ผลรวมซ่อมตัวเอง) · ธงกันคิวหยิบซ้ำ — S1 ของรอบ 5 คิดใหม่ให้เมื่อมีงวดอื่นถูกถอน
        continue;
      }
      const refId = key;
      const periodKey = commissionPeriodOf(at, rule.payoutDelayDays);
      const rows = await tx.crmCommission.createManyAndReturn({
        data: parts.map((p) => ({
          ...s,
          dealId,
          ruleId: rule.id,
          userId: p.userId,
          amountSatang: p.amount,
          basisSatang: T,
          basis: "PAID" as const,
          status: "PENDING" as const,
          periodKey,
          refType: REF_PAYMENT,
          refId,
          ...(wasRejected ? { note: COMMISSION_WAS_REJECTED_NOTE } : {}),
        })),
        skipDuplicates: true,
      });
      for (const r of rows) {
        await emitCommission(tx, r, "created");
        out.push(r);
      }
    }
    return out;
  }, TX_OPTS);
  if (zeroShare.length) await setNomatch(preKey, zeroShare);
  for (const r of made) await advanceSafe(s, r.id);
  return { created: made.length };
}

/** ธง "ประเมินแล้วไม่ตรง" (idempotent · ไม่มี tenant/ข้อมูลลูกค้าในคีย์นอกจาก id) */
async function setNomatch(paymentKey: string, ruleIds: string[]): Promise<void> {
  const now = new Date();
  await prisma.opsAlertState.createMany({ data: ruleIds.map((r) => ({ source: nomatchKey(paymentKey, r), lastAlertAt: now })), skipDuplicates: true });
}

/**
 * ดีลเข้า WON → แถวของกฎฐาน WON ที่ตรง (refId '' · basisSatang = T ก่อน VAT · งวด = เดือนไทยของแถวประวัติที่เข้า WON ล่าสุด)
 * 🔴 มติ ค + S1: เปิดดีลใหม่ ⇒ แถวที่ยังไม่เคยถึงเงินเดือนถูก **ลบ** (ชนะอีกครั้ง = สร้างใหม่) · แถวที่เคยถึงเงินเดือนแล้ว = ถอนคืน
 *    และชนะอีกครั้ง **ไม่** สร้างแถวใหม่ให้เอง (unique กันอีกชั้น) · หน้าแสดง "เคยจ่ายแล้ว"
 */
export async function onWon(ctx: CommissionsCtx, input: { dealId: string }): Promise<{ created: number }> {
  const sys = await bridgeSystem(ctx);
  const dealId = str(input?.dealId);
  if (!sys || !dealId) return { created: 0 };
  const s = scopeOf(ctx);
  const rules = await activeRules(s, "WON");
  if (rules.length === 0) return { created: 0 };
  const deal = await loadDeal(s, dealId);
  if (!deal || deal.kind !== "WON" || !deal.ownerUserId) return { created: 0 };
  const matched = await matchingRules(s, rules, deal);
  if (matched.length === 0) return { created: 0 };
  // รอบ 6 B-2: `at` = แถวประวัติแรกของ "ช่วงชนะปัจจุบัน" (แถวล่าสุดที่เข้าขั้น WON จากขั้นที่ไม่ใช่ WON หรือจากไม่มีขั้น)
  //   ⇒ ย้ายระหว่างขั้น WON สองขั้น (WON→WON) ไม่ใช่ "ชนะใหม่" — ไม่ถอน ไม่ลบ ไม่มี event (ไม่เปลี่ยนอะไรเลย)
  const runStart = await prisma.$queryRaw<{ enteredAt: Date }[]>`
    SELECT h."enteredAt" FROM "CrmDealStageHistory" h
      JOIN "CrmStage" t ON t."id" = h."toStageId"
      LEFT JOIN "CrmStage" f ON f."id" = h."fromStageId"
    WHERE h."dealId" = ${dealId} AND h."tenantId" = ${ctx.tenantId} AND t."kind"::text = 'WON' AND (h."fromStageId" IS NULL OR COALESCE(f."kind"::text, '') <> 'WON')
    ORDER BY h."enteredAt" DESC, h."id" DESC LIMIT 1`;
  const at = runStart[0]?.enteredAt ?? deal.closedAt ?? new Date();
  // รอบ 5 S4: แถวที่ยังมีชีวิตของ "การชนะครั้งก่อน" (createdAt < เวลาเข้า WON ครั้งนี้ — แถวของ onWon ประทับ createdAt = เวลาเข้า WON)
  //   ⇒ ตัวต่อ "เปิดดีลใหม่" ถูกข้ามไป · จัดการก่อนคิดครั้งนี้: ยังไม่ถึงเงินเดือน = ลบแล้วคิดใหม่ตามมูลค่าปัจจุบัน · ถึงแล้ว = ถอนคืน (มติ ค)
  const prior = await prisma.crmCommission.findMany({
    where: { ...s, dealId, basis: "WON", refType: REF_WON, reversedOfId: null, status: { in: ["PENDING", "APPROVED", "PAID"] }, createdAt: { lt: at } },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: 100,
  });
  const priorLive = prior;
  if (priorLive.length) {
    const revd = new Set((await prisma.crmCommission.findMany({ where: { ...s, reversedOfId: { in: priorLive.map((r) => r.id) } }, select: { reversedOfId: true }, take: priorLive.length })).map((r) => r.reversedOfId));
    const stale = priorLive.filter((r) => !revd.has(r.id));
    if (stale.length) await retireWonRows(s, dealId, stale, { dealMayBeWon: true });
  }
  const tNow = await baseTotalOf(s, deal);

  const made = await prisma.$transaction(async (tx) => {
    await lockDeal(tx, dealId);
    const live = await loadDeal(s, dealId, tx);
    if (!live || live.kind !== "WON" || !live.ownerUserId) return [];
    const out: CrmCommission[] = [];
    const steady = await lockRules(tx, s, matched);
    for (const rule of matched) {
      if (!steady.has(rule.id)) continue;
      if (await hasOtherBasisRows(tx, s, dealId, rule.id, "WON")) continue;
      const done = await tx.crmCommission.findFirst({ where: { dealId, ruleId: rule.id, refId: "", ...s }, select: { id: true } });
      if (done) continue;
      const T = tNow;
      if (T <= ZERO) continue;
      if (rule.minDealSatang !== null && T < rule.minDealSatang) continue;
      const parts = splitParts(commissionOf(rule.kind, configOf(rule), T), rule.splitCollaboratorsBp, live.ownerUserId, live.collaboratorUserIds);
      if (parts.length === 0) continue;
      const periodKey = commissionPeriodOf(at, rule.payoutDelayDays);
      const rows = await tx.crmCommission.createManyAndReturn({
        // รอบ 5 S4: createdAt = เวลาเข้า WON ครั้งนี้ ⇒ "แถวของการชนะครั้งไหน" ตัดสินได้แน่นอน (ไม่ขึ้นกับนาฬิกาของฐาน)
        data: parts.map((p) => ({ ...s, dealId, ruleId: rule.id, userId: p.userId, amountSatang: p.amount, basisSatang: T, basis: "WON" as const, status: "PENDING" as const, periodKey, refType: REF_WON, refId: "", createdAt: at })),
        skipDuplicates: true,
      });
      for (const r of rows) {
        await emitCommission(tx, r, "created");
        out.push(r);
      }
    }
    return out;
  }, TX_OPTS);
  for (const r of made) await advanceSafe(s, r.id);
  return { created: made.length };
}

/**
 * ถอนคืนคอมมิชชันของ "แถวรับเงิน" หนึ่งแถว (refId = CrmDealPayment.id) — addendum ข้อ 9 + มติผู้คุมงาน B3
 *   PENDING → REJECTED (ไม่มีแถวติดลบ ไม่มีรายการ HR · ยกเลิกคำขออนุมัติที่ค้าง) · APPROVED/PAID → แถว REVERSED ติดลบ 1 แถว
 *   แล้วฝั่งเงินเดือน (handoff): ต้นทาง HR ยังไม่อนุมัติและยังไม่เข้ารอบ ⇒ **ถอนรายการเดิม** (ไม่หัก) · HR ไม่อนุมัติ ⇒ ไม่หัก ·
 *   อนุมัติแล้ว/เข้ารอบแล้ว ⇒ DEDUCTION ในงวดถัดไปที่ยังไม่มีรอบจ่าย · ต้นทางคงสถานะเดิม · ไม่แตะรอบจ่ายเงินเดือนใด ๆ
 * 🔴 ไม่มีประตู uiVersion (การถอนคืนต้องทำได้เสมอ — กติกาเดียวกับทางเดินเงิน มติ B2 ของ C2.7)
 */
export async function reverse(ctx: CommissionsCtx, input: { refId: string; reason?: string | null; keepKey?: string | null }): Promise<{ reversed: number; rejected: number }> {
  const sys = await loadSystem(ctx);
  const refId = str(input?.refId);
  if (!sys || !refId) return { reversed: 0, rejected: 0 };
  const payId = refId.split("#")[0]!;
  // รอบ 5 B1: `keepKey` = กุญแจร่างปัจจุบันของงวดที่ยังนับอยู่ ⇒ ถอนเฉพาะแถวของร่างเก่า ("ค้าง") · ไม่ระบุ = ถอนทุกร่างของงวดนี้
  const keep = str(input?.keepKey);
  const rows = await prisma.crmCommission.findMany({
    where: { ...scopeOf(ctx), refType: REF_PAYMENT, reversedOfId: null, OR: [{ refId: payId }, { refId: { startsWith: `${payId}#` } }], ...(keep ? { NOT: { refId: keep } } : {}) },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: 500,
  });
  return reverseRows(scopeOf(ctx), rows, str(input?.reason) ?? "ยกเลิกการรับชำระของดีล", ctx.actorUserId ?? null);
}

async function reverseRows(ctx: Scope, rows: CrmCommission[], reason: string, actorUserId: string | null): Promise<{ reversed: number; rejected: number }> {
  let reversed = 0;
  let rejected = 0;
  const hr = await hrFacade();
  for (const row of rows) {
    if (row.status !== "PENDING" && row.status !== "APPROVED" && row.status !== "PAID") continue;
    // งวดของแถวถอนคืน (อ่านนอกล็อก — ห้ามใช้ connection ที่สองใต้ล็อก): เดือนแรก > งวดเดิม (ของรายการ HR ถ้ามี ไม่งั้นของคอมมิชชัน) ที่ยังไม่มีรอบจ่าย
    const adj = row.hrPayAdjustmentId ? await hr.adjustmentOfCommission(ctx.tenantId, row.id) : null;
    const hrSystem = adj?.systemId ?? (await hr.payrollEmployeeOfUser(ctx.tenantId, row.userId))?.systemId ?? null;
    const taken = new Set(hrSystem ? await hr.payrollRunPeriods({ tenantId: ctx.tenantId, systemId: hrSystem }) : []);
    const periodKey = firstFreePeriod(adj?.periodKey ?? row.periodKey, taken, true);
    if (!periodKey) throw noFreePeriod();
    const out = await prisma.$transaction(async (tx) => {
      // รอบ 6 S-1: แถวของงวดรับเงิน — ล็อกแถวรับเงิน FOR SHARE แล้วอ่านกุญแจร่าง "ใต้ล็อก" · แถวของร่างปัจจุบันของงวดที่ยังนับอยู่ = ห้ามถอน
      //   (ตัวต่อสองตัวแข่งกัน ตัวที่อ่านกุญแจไว้ก่อนการปลุกจะไม่ถอนร่างใหม่ได้) · ลำดับล็อก: แถวรับเงิน → แถวคอมมิชชัน
      if (row.refType === REF_PAYMENT) {
        const payId = row.refId.split("#")[0]!;
        await tx.$queryRaw`SELECT "id" FROM "CrmDealPayment" WHERE "id" = ${payId} AND "tenantId" = ${ctx.tenantId} FOR SHARE`;
        const p = await tx.crmDealPayment.findFirst({ where: { id: payId, tenantId: ctx.tenantId }, select: { status: true, countedAt: true, createdAt: true } });
        if (p?.status === "COUNTED" && row.refId === incKey(payId, p.countedAt ?? p.createdAt)) return null;
      }
      const cur = await lockRow(tx, ctx, row.id);
      if (!cur) return null;
      if (cur.status === "PENDING") {
        // รอบ 4: PENDING ของเงินที่ถูกถอน = **ลบ** (ไม่ใช่ REJECTED — แถวที่ไม่อนุมัตินับเป็น "เครดิตแล้ว" ⇒ งวดที่ถูกปลุกกลับจะไม่ได้เครดิตอีก)
        //   แบบเดียวกับทางเปิดดีลที่ชนะแล้ว · ยกเลิกคำขออนุมัติ + audit `crm.commission.remove` หลัง commit
        const n = await tx.crmCommission.deleteMany({ where: { id: cur.id, ...ctx, status: "PENDING", hrPayAdjustmentId: null } });
        if (n.count !== 1) return null;
        await emitRemoved(tx, cur);
        return { kind: "removed" as const, cur, rev: null };
      }
      if (cur.status !== "APPROVED" && cur.status !== "PAID") return null;
      const made = await tx.crmCommission.createManyAndReturn({
        data: [{
          ...ctx,
          dealId: cur.dealId,
          ruleId: cur.ruleId,
          userId: cur.userId,
          amountSatang: -cur.amountSatang,
          basisSatang: -cur.basisSatang,
          basis: cur.basis,
          status: "REVERSED" as const,
          periodKey,
          refType: REF_REVERSAL,
          refId: cur.id,
          reversedOfId: cur.id,
          decidedAt: new Date(),
        }],
        skipDuplicates: true,
      });
      if (made.length === 0) return null; // ถอนไปแล้ว (unique (deal, rule, user, refId = id ต้นทาง))
      await emitCommission(tx, made[0]!, "reversed");
      return { kind: "reversed" as const, cur, rev: made[0]! };
    }, TX_OPTS);
    if (!out) continue;
    if (out.kind === "removed") {
      rejected += 1;
      if (out.cur.approvalRequestId) await (await approvalFacade()).cancelRequest({ tenantId: ctx.tenantId }, out.cur.approvalRequestId).catch(() => false);
      await audit(ctx, "crm.commission.remove", "CrmCommission", out.cur.id, {
        before: { status: "PENDING", amountSatang: num(out.cur.amountSatang), dealId: out.cur.dealId, ruleId: out.cur.ruleId, userId: out.cur.userId, refId: out.cur.refId },
        after: { removed: true, reason },
      }, actorUserId);
    } else if (out.rev) {
      reversed += 1;
      await audit(ctx, "crm.commission.reverse", "CrmCommission", out.cur.id, {
        before: { status: out.cur.status, amountSatang: num(out.cur.amountSatang) },
        after: { reversalId: out.rev.id, amountSatang: num(out.rev.amountSatang), periodKey: out.rev.periodKey, reason },
      }, actorUserId);
      await handoffSafe(ctx, out.rev.id);
    }
  }
  return { reversed, rejected };
}

/**
 * ส่งแถวที่อนุมัติแล้วแต่ยังไม่มีรายการ HR เข้าเงินเดือน (ปุ่ม "ส่ง payroll" + งานรายนาที `crm.commissions.payroll`)
 * มติผู้คุมงาน S3: คัดใน SQL เฉพาะแถวที่ "ส่งได้จริง" — ต้นทางที่ไม่มีแถวถอนคืน · แถวถอนคืนที่ต้นทางเคยส่ง HR และยังไม่ปิดเรื่อง ·
 * ยอด ≤ เพดาน HR · ต้นทางต้องมีพนักงาน active (ตัวอ่านของ HR) · เดินด้วย cursor (ไม่วนแถวที่ส่งไม่ได้ซ้ำไปมา)
 * N6: แถวถอนคืนไม่ขึ้นกับสวิตช์ payrollLink (ต้นทางเคยถูกส่งตอนสวิตช์เปิดอยู่ ต้องหักคืนเสมอ)
 */
export async function syncPayroll(ctx: CommissionsCtx, input: { userId?: string | null } = {}, opts: { deadline?: number } = {}): Promise<{ requested: number }> {
  const sys = await bridgeSystem(ctx);
  if (!sys) return { requested: 0 };
  const link = commissionSettingsOf(sys.settings).payrollLink;
  const userId = str(input?.userId);
  const s = scopeOf(ctx);
  const hr = await hrFacade();
  const userFilter = userId ? Prisma.sql`AND c."userId" = ${userId}` : Prisma.empty;
  const originals = link ? Prisma.sql`(c."reversedOfId" IS NULL AND c."status"::text IN ('APPROVED','PAID') AND NOT EXISTS (SELECT 1 FROM "CrmCommission" r WHERE r."reversedOfId" = c."id"))` : Prisma.sql`FALSE`;
  let cursor = "";
  let requested = 0;
  for (let page = 0; page < 20; page += 1) {
    if (opts.deadline !== undefined && Date.now() >= opts.deadline) break;
    const rows = await prisma.$queryRaw<{ id: string; userId: string; reversedOfId: string | null }[]>`
      SELECT c."id", c."userId", c."reversedOfId" FROM "CrmCommission" c
      WHERE c."tenantId" = ${s.tenantId} AND c."systemId" = ${s.systemId} AND c."hrPayAdjustmentId" IS NULL AND c."id" > ${cursor} ${userFilter}
        AND ABS(c."amountSatang") <= ${BigInt(COMMISSION_LIMITS.hrMaxSatang)}
        AND (c."note" IS NULL OR c."note" <> ${COMMISSION_REVERSAL_SETTLED_NOTE})
        AND (${originals}
          OR (c."reversedOfId" IS NOT NULL AND c."status"::text = 'REVERSED'
              AND EXISTS (SELECT 1 FROM "CrmCommission" o WHERE o."id" = c."reversedOfId" AND o."hrPayAdjustmentId" IS NOT NULL)))
      ORDER BY c."id" ASC LIMIT 200`;
    if (rows.length === 0) break;
    cursor = rows[rows.length - 1]!.id;
    const linked = new Set(await hr.activeLinkedUserIds(s.tenantId, rows.filter((r) => !r.reversedOfId).map((r) => r.userId)));
    for (const r of rows) {
      if (!r.reversedOfId && !linked.has(r.userId)) continue; // รอผูกพนักงาน
      if (await handoff(s, r.id)) requested += 1;
    }
    if (rows.length < 200) break;
  }
  return { requested };
}

// ───────────────────────── สถานะ: ยื่นอนุมัติ → อนุมัติ → ส่ง HR ─────────────────────────

/**
 * ขั้นถัดไปของแถว (idempotent · เรียกซ้ำ/พร้อมกันได้) — มติผู้คุมงาน S6:
 *   ร้านปิด approvalRequired = อนุมัติทันที · เปิดอยู่ = ยื่นสายอนุมัติ `crm.commission` → มีสาย = รอสาย ·
 *   **ไม่มีสาย = คง PENDING** (ไม่อนุมัติเอง) + แจ้งเจ้าของร้าน `commission.pending` ครั้งเดียวต่อแถว → อนุมัติแล้ว = ส่ง HR
 */
async function advance(ctx: Scope, id: string): Promise<void> {
  const row = await prisma.crmCommission.findFirst({ where: { id, ...ctx } });
  if (!row) return;
  if (row.status === "PENDING" && !row.approvalRequestId && !row.reversedOfId) {
    const sys = await loadSystem(ctx);
    if (!sys) return;
    const settings = commissionSettingsOf(sys.settings);
    if (row.note === COMMISSION_WAS_REJECTED_NOTE && !settings.approvalRequired) {
      await escalateOnce(ctx, row); // รอบ 6: งวดที่เคยถูกคนไม่อนุมัติ — ไม่อนุมัติเอง ให้เจ้าของร้านตัดสิน
    } else if (!settings.approvalRequired) {
      if (await claimApproved(ctx, row.id, {})) await audit(ctx, "crm.commission.approve", "CrmCommission", row.id, { after: { status: "APPROVED", via: "AUTO" } }, null);
    } else {
      const r = await (await approvalFacade()).submitForApproval(
        { tenantId: ctx.tenantId },
        { entityType: APPROVAL_ENTITY, entityId: row.id, systemId: ctx.systemId, amountSatang: Math.min(INT_MAX, num(row.amountSatang)), requestedById: row.userId },
      );
      if ("requestId" in r) {
        await prisma.crmCommission.updateMany({ where: { id: row.id, ...ctx, status: "PENDING", approvalRequestId: null }, data: { approvalRequestId: r.requestId } });
      } else {
        await escalateOnce(ctx, row); // ไม่มีสายอนุมัติ ⇒ คง PENDING ให้เจ้าของร้านอนุมัติเอง
      }
    }
  }
  await handoff(ctx, row.id);
}

async function advanceSafe(ctx: Scope, id: string): Promise<void> {
  try {
    await advance(ctx, id);
  } catch (e) {
    // แถวเขียนแล้ว (event crm.commission.created ยิงไปแล้ว) ⇒ ตัวรับ event / งานรายนาทีเก็บต่อ — ไม่ทำให้ทางเดินเงินล้ม
    await warn(ctx, "ยื่นอนุมัติหรือส่งเงินเดือนไม่สำเร็จ — งานเบื้องหลังจะลองใหม่", e, { commissionId: id });
  }
}

/**
 * PENDING → APPROVED (guard สถานะ + คำขอ) · ยิง `crm.commission.approved` ใน tx เดียวกัน เฉพาะเมื่อคำสั่งนี้เป็นคนเปลี่ยน
 * `requestId` = มาจากสายอนุมัติ (แถวต้องยังผูกคำขอใบนี้หรือยังไม่ผูกใบไหน)
 */
async function claimApproved(ctx: Scope, id: string, opts: { requestId?: string }): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const where: Prisma.CrmCommissionWhereInput = {
      id,
      ...ctx,
      status: "PENDING",
      reversedOfId: null,
      ...(opts.requestId ? { OR: [{ approvalRequestId: opts.requestId }, { approvalRequestId: null }] } : {}),
    };
    const n = await tx.crmCommission.updateMany({ where, data: { status: "APPROVED", decidedAt: new Date(), ...(opts.requestId ? { approvalRequestId: opts.requestId } : {}) } });
    if (n.count !== 1) return false;
    const row = await tx.crmCommission.findFirst({ where: { id, ...ctx } });
    if (row) await emitCommission(tx, row, "approved");
    return true;
  }, TX_OPTS);
}

/** ผู้อนุมัติด้วยมือของแถว (แถว audit ล่าสุด) — ส่งเป็น `requestedById` ให้ HR ⇒ กติกา 4 ตาของ HR ห้ามคนเดียวกันอนุมัติซ้ำ (S2) */
async function approverOf(ctx: Scope, id: string): Promise<string | null> {
  const a = await prisma.auditLog.findFirst({ where: { tenantId: ctx.tenantId, action: "crm.commission.approve", targetId: id, actorId: { not: null } }, orderBy: { createdAt: "desc" }, select: { actorId: true } });
  return a?.actorId ?? null;
}

/**
 * ส่งเข้าเงินเดือน (addendum ข้อ 8 + มติผู้คุมงาน B3 · S2 · S4):
 *   ต้นทาง APPROVED/PAID → COMMISSION ของพนักงาน **active** ที่ผูกกับผู้ใช้ (requestedById = ผู้อนุมัติด้วยมือ — HR 4 ตา)
 *   แถวถอนคืน → ดูรายการต้นทาง: ไม่มี/HR ไม่อนุมัติ ⇒ ปิดเรื่อง (ไม่หัก) · HR ยังไม่อนุมัติและยังไม่เข้ารอบ ⇒ ถอนรายการต้นทาง (ไม่หัก) ·
 *   อนุมัติแล้ว/เข้ารอบแล้ว ⇒ DEDUCTION (จำนวนบวก) ของพนักงานคนเดียวกับรายการต้นทาง
 *   งวด = เดือนแรก ≥ งวดของแถวที่ยังไม่มีรอบจ่าย — คำนวณ **ใต้ล็อก** ด้วย tx เดียวกัน · HR ตอบ PERIOD_CLOSED = เลื่อนเดือนถัดไป
 * 🔴 X4: ใต้ `FOR UPDATE` ของแถวคอมมิชชัน + เขียนรายการ HR ด้วย tx เดียวกัน (partial unique เป็นด่านสุดท้าย) ⇒ รายการเดียวเสมอ
 */
async function handoff(ctx: Scope, id: string): Promise<boolean> {
  const row = await prisma.crmCommission.findFirst({ where: { id, ...ctx } });
  if (!row || row.hrPayAdjustmentId) return false;
  if (row.note === COMMISSION_REVERSAL_SETTLED_NOTE) return false;
  const sys = await loadSystem(ctx);
  if (!sys) return false;
  const hr = await hrFacade();
  if (row.reversedOfId) return handoffReversal(ctx, row, hr);
  if (!commissionSettingsOf(sys.settings).payrollLink) return false;
  if (row.status !== "APPROVED" && row.status !== "PAID") return false;
  const emp = await hr.payrollEmployeeOfUser(ctx.tenantId, row.userId);
  if (!emp) return false; // รอผูกพนักงาน (ไม่มี หรือพ้นสภาพพนักงานแล้ว) — ห้ามจ่ายผิดคน
  if (row.amountSatang <= ZERO) return false;
  if (row.amountSatang > BigInt(COMMISSION_LIMITS.hrMaxSatang)) {
    if (await flagOnce(ctx, "crm.commission.warn.hrmax", row.id, { amountSatang: num(row.amountSatang) })) {
      await warn(ctx, "ยอดเกินที่ระบบเงินเดือนรับได้ต่อรายการ — ต้องส่งด้วยมือ", null, { commissionId: row.id });
    }
    return false;
  }
  // รีวิวรอบ 2 S-d: HR 4 ตาต้องมี "ผู้ยื่น" เสมอ — ผู้อนุมัติ (มือ/สาย) ไม่งั้นเจ้าของรายการเอง
  const requestedById = (await approverOf(ctx, row.id)) ?? row.userId;
  return prisma.$transaction(async (tx) => {
    const cur = await lockRow(tx, ctx, row.id);
    if (!cur || cur.hrPayAdjustmentId) return false;
    if (cur.status !== "APPROVED" && cur.status !== "PAID") return false;
    // ถูกถอนคืนระหว่างรอ (ยังไม่เคยส่ง) = ไม่ส่งทั้งคู่ (หักล้างกันเอง)
    if (await tx.crmCommission.findFirst({ where: { reversedOfId: cur.id, ...ctx }, select: { id: true } })) return false;
    const adjId = await requestInTx(tx, ctx, hr, cur, { systemId: emp.systemId, employeeId: emp.employeeId, kind: "COMMISSION", amount: cur.amountSatang, base: cur.periodKey,
      note: `ค่าคอมมิชชัน CRM · งวด ${cur.periodKey} · อ้างอิง ${cur.id}`, requestedById });
    return adjId !== null;
  }, TX_OPTS);
}

type HrFacade = Awaited<ReturnType<typeof hrFacade>>;

/** ยื่นรายการ HR ใต้ล็อกของผู้เรียก — เลื่อนเดือนเมื่อ HR ตอบว่างวดนั้นมีรอบแล้ว (S4) · ลิงก์สองทาง · คืน id รายการ (null = ไม่ได้ยื่น) */
async function requestInTx(
  tx: Tx,
  ctx: Scope,
  hr: HrFacade,
  cur: CrmCommission,
  p: { systemId: string; employeeId: string; kind: "COMMISSION" | "DEDUCTION"; amount: bigint; base: string; note: string; requestedById: string | null },
): Promise<string | null> {
  const taken = new Set(await hr.payrollRunPeriods({ tenantId: ctx.tenantId, systemId: p.systemId }, { tx }));
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const periodKey = firstFreePeriod(p.base, taken, false);
    if (!periodKey) throw noFreePeriod();
    const r = await hr.requestAdjustment(
      { tenantId: ctx.tenantId, systemId: p.systemId },
      { employeeId: p.employeeId, periodKey, kind: p.kind, amountSatang: Number(p.amount), note: p.note, requestedById: p.requestedById, crmCommissionId: cur.id },
      { tx },
    );
    if (r.code === "PERIOD_CLOSED") {
      taken.add(periodKey);
      continue;
    }
    const adjId = r.ok && r.id ? r.id : (await hr.adjustmentOfCommission(ctx.tenantId, cur.id, { tx }))?.id ?? null;
    if (!adjId) return null;
    await tx.crmCommission.updateMany({ where: { id: cur.id, ...ctx, hrPayAdjustmentId: null }, data: { hrPayAdjustmentId: adjId } });
    return r.ok ? adjId : null;
  }
  return null;
}

/**
 * ฝั่งเงินเดือนของแถวถอนคืน (มติผู้คุมงาน B3 + รีวิวรอบ 2 S-b) — **ตัดสินเรื่องเงินใต้ล็อกเท่านั้น**:
 * ล็อกแถวถอนคืน + แถวต้นทาง → อ่านรายการ HR ของต้นทางใหม่ด้วย tx เดียวกัน → ตัดสิน
 *   ไม่มี/HR ไม่อนุมัติ ⇒ ปิดเรื่อง (ไม่หัก) · HR ยังไม่อนุมัติและยังไม่เข้ารอบ ⇒ ถอนรายการต้นทาง (guard) แล้วปิดเรื่อง ·
 *   อื่น ๆ (อนุมัติแล้ว/เข้ารอบแล้ว) ⇒ DEDUCTION — ไม่มีการใช้ค่าที่อ่านก่อนเข้าล็อกมาตัดสินเงิน
 */
async function handoffReversal(ctx: Scope, row: CrmCommission, hr: HrFacade): Promise<boolean> {
  if (row.status !== "REVERSED" || !row.reversedOfId) return false;
  const origId = row.reversedOfId;
  const out = await prisma.$transaction(async (tx) => {
    const rev = await lockRow(tx, ctx, row.id);
    const orig = await lockRow(tx, ctx, origId);
    if (!rev || rev.hrPayAdjustmentId || rev.note || rev.status !== "REVERSED") return { kind: "noop" as const };
    if (!orig?.hrPayAdjustmentId) return { kind: "noop" as const }; // ต้นทางไม่เคยส่ง HR ⇒ ไม่มีอะไรต้องหักคืน (S5.4)
    const adj = await hr.adjustmentOfCommission(ctx.tenantId, orig.id, { tx });
    const settle = async () => {
      await tx.crmCommission.updateMany({ where: { id: rev.id, ...ctx, hrPayAdjustmentId: null, note: null }, data: { note: COMMISSION_REVERSAL_SETTLED_NOTE } });
    };
    if (!adj || adj.id !== orig.hrPayAdjustmentId || adj.status === "REJECTED") {
      await settle();
      return { kind: "settled" as const, why: adj ? (adj.status === "REJECTED" ? "HR_REJECTED" : "HR_LINK_MOVED") : "HR_ADJUSTMENT_GONE", adjustmentId: adj?.id ?? null };
    }
    if (adj.status === "PENDING" && !adj.runId) {
      if (await hr.withdrawCommissionAdjustment({ tenantId: ctx.tenantId, systemId: adj.systemId }, { adjustmentId: adj.id, crmCommissionId: orig.id }, { tx })) {
        await tx.crmCommission.updateMany({ where: { id: orig.id, ...ctx }, data: { hrPayAdjustmentId: null } });
        await settle();
        return { kind: "settled" as const, why: "HR_PENDING_WITHDRAWN", adjustmentId: adj.id };
      }
      // ถอนไม่ได้ทั้งที่ถือล็อกคอมมิชชันอยู่ = HR เพิ่งตัดสินในเสี้ยววินาทีนั้น ⇒ อ่านใหม่แล้วตัดสินอีกรอบ
      const again = await hr.adjustmentOfCommission(ctx.tenantId, orig.id, { tx });
      if (!again || again.status === "REJECTED") {
        await settle();
        return { kind: "settled" as const, why: "HR_REJECTED", adjustmentId: adj.id };
      }
    }
    const amount = -rev.amountSatang;
    if (amount <= ZERO) return { kind: "noop" as const };
    const adjId = await requestInTx(tx, ctx, hr, rev, { systemId: adj.systemId, employeeId: adj.employeeId, kind: "DEDUCTION", amount, base: rev.periodKey,
      note: `หักคืนค่าคอมมิชชัน CRM (รายการรับเงินถูกยกเลิก) · อ้างอิง ${orig.id}`, requestedById: null });
    return { kind: adjId ? ("deducted" as const) : ("noop" as const) };
  }, TX_OPTS);
  if (out.kind === "settled") {
    await audit(ctx, "crm.commission.reverse.settle", "CrmCommission", row.id, { after: { originalId: origId, why: out.why, adjustmentId: out.adjustmentId } }, null);
  }
  return out.kind === "deducted";
}

async function handoffSafe(ctx: Scope, id: string): Promise<void> {
  try {
    await handoff(ctx, id);
  } catch (e) {
    await warn(ctx, "ส่งรายการเข้าเงินเดือนไม่สำเร็จ — งานรายนาทีจะลองใหม่", e, { commissionId: id });
  }
}

/**
 * มติผู้คุมงาน S4 + รีวิวรอบ 2 S-c: รายการ HR ของคอมมิชชันที่ "ค้าง" (งวดของมันมีรอบจ่ายแล้ว ⇒ จะไม่ถูกดึงอีก)
 * → **ย้ายงวดในที่เดิม** ไปเดือนถัดไปที่ว่าง (ไม่ลบ-สร้างใหม่ · ไม่เสียประวัติการยื่น) · เฉพาะ PENDING ที่ยังไม่เข้ารอบ
 * (guard ในคำสั่งเดียว) — รายการที่ HR อนุมัติแล้วไม่ถูกแตะเด็ดขาด (`createPayrollRun` ไม่อยู่ใน tx เดียว ⇒ แตะของอนุมัติแล้ว = เสี่ยงจ่ายซ้ำ)
 * ใต้ `FOR UPDATE` ของแถวคอมมิชชัน · ย้ายไม่ได้ = โยน (ผู้เรียก WARN แล้วรอบหน้าลองใหม่)
 */
async function rehomeStranded(ctx: Scope, adj: { id: string; systemId: string; periodKey: string; status: string; crmCommissionId: string | null }): Promise<boolean> {
  if (!adj.crmCommissionId || adj.status !== "PENDING") return false;
  const hr = await hrFacade();
  return prisma.$transaction(async (tx) => {
    const cur = await lockRow(tx, ctx, adj.crmCommissionId!);
    if (!cur || cur.hrPayAdjustmentId !== adj.id) return false;
    const taken = new Set(await hr.payrollRunPeriods({ tenantId: ctx.tenantId, systemId: adj.systemId }, { tx }));
    const periodKey = firstFreePeriod(adj.periodKey, taken, false);
    if (!periodKey) throw noFreePeriod();
    const moved = await hr.moveCommissionAdjustmentPeriod({ tenantId: ctx.tenantId, systemId: adj.systemId }, { adjustmentId: adj.id, crmCommissionId: cur.id, periodKey }, { tx });
    if (!moved) throw new Error(`rehome ของรายการ HR ${adj.id} ไม่ได้ย้ายแถวใดเลย (HR ตัดสิน/ดึงเข้ารอบระหว่างนั้น)`);
    return true;
  }, TX_OPTS);
}

// ───────────────────────── ตัวต่อของทางเดินเงิน / ดีล / สายอนุมัติ / เงินเดือน ─────────────────────────

/** ทางเดินเงิน (payments.ts) นับเงินงวดหนึ่งแล้ว — หลัง commit · ล้ม = WARN (ทางเดินเงินไม่ล้มตาม) */
export async function afterPaymentCounted(ctx: Scope, input: { dealId: string | null | undefined; refType: string; refId: string | null | undefined }): Promise<void> {
  const dealId = str(input?.dealId);
  const refId = str(input?.refId);
  if (!dealId || !refId) return;
  try {
    const row = await prisma.crmDealPayment.findFirst({ where: { ...scopeOf(ctx), dealId, refType: input.refType, refId, status: "COUNTED" }, select: { id: true, countedAt: true, createdAt: true } });
    if (!row) return;
    // รอบ 6 S-2: เวลานับร่างแรกอ่าน **ก่อน** ลบแถว PENDING ของร่างเก่า (ไม่งั้นหลักฐานหายไปกับแถวที่ถูกลบ)
    const olds = await prisma.crmCommission.findMany({ where: { ...scopeOf(ctx), dealId, refType: REF_PAYMENT, reversedOfId: null, OR: [{ refId: row.id }, { refId: { startsWith: `${row.id}#` } }] }, select: { refId: true }, take: 200 });
    const firstCountedMs = Math.min(Number.POSITIVE_INFINITY, ...olds.map((o) => incMsOf(o.refId) ?? Number.POSITIVE_INFINITY));
    // รอบ 5 B1 + รอบ 6 S-1: แถวถูก "ปลุก" (ถอน+นับใหม่ในธุรกรรมเดียว) ⇒ ถอนแถวของร่างเก่าก่อน — ร่างปัจจุบันถูกกันไว้ใต้ล็อกใน reverseRows
    const gone = await reverse(scopeOf(ctx), { refId: row.id, reason: "แถวรับเงินถูกนับใหม่ (ยอดเปลี่ยน)" });
    await onPaid(scopeOf(ctx), { dealId, refType: REF_PAYMENT, refId: row.id, firstCountedMs: Number.isFinite(firstCountedMs) ? firstCountedMs : null });
    // รีวิวรอบ 6 ข้อ 1: การปลุกที่ "ยอดหด" ถอนเครดิตของร่างเก่า ⇒ งวดอื่นที่เคยได้ส่วนแบ่ง 0 อาจได้ส่วนของตัวเองคืน (ทางเดียวกับการถอน)
    if (gone.reversed + gone.rejected > 0) await revisitCounted(ctx, dealId);
  } catch (e) {
    await warn(ctx, "คิดคอมมิชชันของเงินงวดนี้ไม่สำเร็จ — งานรายนาทีจะลองใหม่", e, { dealId, refType: input.refType });
  }
}

/**
 * รอบ 5 S1 + รีวิวรอบ 6 ข้อ 1 — คิดใหม่ **ต่อกฎ**: งวดที่ยังนับอยู่ซึ่งมีกฎ PAID ที่เปิดอยู่ "อย่างน้อยหนึ่งกฎ" ที่ยังไม่มีแถวของร่างปัจจุบัน
 * (ส่วนแบ่งเคยเป็น 0 · ร่างเก่าเพิ่งถูกถอน) ⇒ onPaid (ข้ามกฎที่มีแถวแล้วเอง) — ไม่ดูธง nomatch (การถอนเปลี่ยนคำตอบของส่วนแบ่ง 0)
 * ⚠️ หยิบ 50 งวดต่อครั้ง (§8) · ผู้เรียก: afterPaymentsReversed · afterPaymentCounted เมื่อการปลุกถอนอะไรออกไป · งานรายนาที (2) ผ่าน afterPaymentsReversed
 */
async function revisitCounted(ctx: Scope, dealId: string): Promise<void> {
  const counted = await prisma.$queryRaw<{ id: string }[]>`
    SELECT p."id" FROM "CrmDealPayment" p
    WHERE p."tenantId" = ${ctx.tenantId} AND p."systemId" = ${ctx.systemId} AND p."dealId" = ${dealId} AND p."status" = 'COUNTED'
      AND EXISTS (SELECT 1 FROM "CrmCommissionRule" r WHERE r."systemId" = p."systemId" AND r."active" AND r."basis"::text = 'PAID'
            AND NOT EXISTS (SELECT 1 FROM "CrmCommission" c WHERE c."dealId" = p."dealId" AND c."ruleId" = r."id" AND c."refType" = ${REF_PAYMENT}
                            AND c."refId" = ${keySql("p")} AND c."reversedOfId" IS NULL))
    ORDER BY p."countedAt" ASC, p."id" ASC LIMIT 50`;
  for (const p of counted) await onPaid(scopeOf(ctx), { dealId, refType: REF_PAYMENT, refId: p.id });
}

/** ทางเดินเงินถอนคืนแถวรับเงินของดีลนี้ (ยกเลิกรับชำระ · ยกเลิกเอกสาร · ยกเลิกบิล) — ถอนคอมมิชชันของทุกแถวที่ถูกถอนแล้ว */
export async function afterPaymentsReversed(ctx: Scope, input: { dealId: string | null | undefined }): Promise<void> {
  const dealId = str(input?.dealId);
  if (!dealId) return;
  try {
    // รอบ 5 B1: งวดที่ถูกถอน **หรือ** งวดที่ยังนับอยู่แต่แถวคอมมิชชันเป็นของร่างเก่า (ถูกปลุกใหม่)
    const refs = await prisma.$queryRaw<{ payId: string }[]>`
      SELECT DISTINCT p."id" AS "payId" FROM "CrmCommission" c JOIN "CrmDealPayment" p ON p."id" = ${payIdSql("c")}
      WHERE c."tenantId" = ${ctx.tenantId} AND c."systemId" = ${ctx.systemId} AND c."dealId" = ${dealId} AND c."refType" = ${REF_PAYMENT}
        AND c."reversedOfId" IS NULL AND c."status"::text IN ('PENDING','APPROVED','PAID')
        AND (p."status" = 'REVERSED' OR (p."status" = 'COUNTED' AND c."refId" <> ${keySql("p")}))
        AND NOT EXISTS (SELECT 1 FROM "CrmCommission" r WHERE r."reversedOfId" = c."id")
      LIMIT 200`;
    // รอบ 6 S-1: ไม่ส่งกุญแจที่อ่านนอกล็อก — reverseRows ตัดสิน "ร่างปัจจุบัน" ใต้ FOR SHARE ของแถวรับเงินเอง
    for (const r of refs) await reverse(scopeOf(ctx), { refId: r.payId, reason: "ยกเลิกการรับชำระ/เอกสาร/บิลของดีล" });
    await revisitCounted(ctx, dealId);
  } catch (e) {
    await warn(ctx, "ถอนคืนคอมมิชชันของเงินที่ถูกยกเลิกไม่สำเร็จ — งานรายนาทีจะลองใหม่", e, { dealId });
  }
}

/**
 * แถวฐาน WON ของ "การชนะครั้งก่อน" (มติ S1 + รอบ 5 S4) — ยังไม่ถึงเงินเดือนจริง ⇒ ลบ (+ ยกเลิกคำขอ + audit + `crm.commission.removed`) ·
 * ถึงแล้ว ⇒ ถอนคืน (มติ ค) · `dealMayBeWon` = ผู้เรียกคือ onWon ของการชนะครั้งใหม่ (ดีลอยู่ที่ WON แล้ว แต่แถวเป็นของครั้งก่อน)
 */
async function retireWonRows(ctx: Scope, dealId: string, rows: CrmCommission[], opts: { dealMayBeWon: boolean }): Promise<void> {
  if (rows.length === 0) return;
  const hr = await hrFacade();
  const keep: CrmCommission[] = [];
  for (const row of rows) {
    const adj = row.hrPayAdjustmentId ? await hr.adjustmentOfCommission(ctx.tenantId, row.id) : null;
    // รอบ 4: แยก "ดีลชนะกลับมาแล้ว (ข้ามทั้งหมด)" ออกจาก "ลบไม่ได้ ⇒ ถอนคืน" — เดิมทั้งคู่ตกไปที่ถอนคืน (แถวของดีลที่ชนะอยู่ถูกถอนผิด)
    const res = await prisma.$transaction(async (tx) => {
      // รีวิวรอบ 2: ตรวจชนิดของดีล "ตอนนี้" ใต้ล็อกต่อดีล (ชนะกลับมาอีกระหว่างนั้น = ไม่ลบ ไม่ถอน) — ลำดับล็อก: ดีล → แถว (เหมือน onWon)
      await lockDeal(tx, dealId);
      const nowDeal = await tx.crmDeal.findFirst({ where: { id: dealId, ...scopeOf(ctx) }, select: { kind: true } });
      if (nowDeal?.kind === "WON" && !opts.dealMayBeWon) return { kind: "skip" as const };
      const cur = await lockRow(tx, ctx, row.id);
      if (!cur || cur.status === "REJECTED" || cur.status === "REVERSED") return { kind: "skip" as const };
      if (await tx.crmCommission.findFirst({ where: { reversedOfId: cur.id, ...ctx }, select: { id: true } })) return { kind: "skip" as const };
      if (cur.status === "PAID") return { kind: "keep" as const };
      if (cur.hrPayAdjustmentId) {
        if (!adj || adj.id !== cur.hrPayAdjustmentId || adj.status !== "PENDING" || adj.runId) return { kind: "keep" as const };
        if (!(await hr.withdrawCommissionAdjustment({ tenantId: ctx.tenantId, systemId: adj.systemId }, { adjustmentId: adj.id, crmCommissionId: cur.id }, { tx }))) return { kind: "keep" as const };
      }
      const n = await tx.crmCommission.deleteMany({ where: { id: cur.id, ...ctx, status: { in: ["PENDING", "APPROVED"] } } });
      if (n.count !== 1) return { kind: "keep" as const };
      await emitRemoved(tx, cur);
      return { kind: "removed" as const, cur };
    }, TX_OPTS);
    if (res.kind === "skip") continue;
    if (res.kind === "keep") {
      keep.push(row);
      continue;
    }
    const removed = res.cur;
    if (removed.approvalRequestId) await (await approvalFacade()).cancelRequest({ tenantId: ctx.tenantId }, removed.approvalRequestId).catch(() => false);
    await audit(ctx, "crm.commission.remove", "CrmCommission", removed.id, {
      before: { status: removed.status, amountSatang: num(removed.amountSatang), dealId, ruleId: removed.ruleId, userId: removed.userId, hrPayAdjustmentId: removed.hrPayAdjustmentId },
      after: { reason: "ดีลถูกเปิดใหม่ก่อนคอมมิชชันฐานปิดการขายจะถูกจ่าย — ชนะอีกครั้งจะคิดใหม่" },
    }, null);
  }
  if (keep.length > 0) await reverseRows(scopeOf(ctx), keep, "ดีลถูกเปิดใหม่หรือไม่ได้อยู่ในขั้นชนะแล้ว", null);
}

/**
 * ดีลย้ายขั้นแล้ว (deals.ts · หลัง commit): อยู่ที่ WON = คิดกฎฐาน WON · ออกจาก WON (มติผู้คุมงาน S1):
 *   แถวฐาน WON ที่ **ยังไม่เคยถึงเงินเดือนจริง** (ไม่มีรายการ HR หรือรายการ HR ยังไม่อนุมัติและยังไม่เข้ารอบ — ถอนได้) ⇒ ลบแถว
 *   (+ ยกเลิกคำขออนุมัติ + audit) ⇒ ชนะอีกครั้งสร้างใหม่ได้ · แถวที่ถึงเงินเดือนแล้ว ⇒ ถอนคืน (มติ ค: ชนะอีกไม่สร้างใหม่ · ป้าย "เคยจ่ายแล้ว")
 */
export async function afterDealMoved(ctx: Scope, input: { dealId: string; kind: string }): Promise<void> {
  const dealId = str(input?.dealId);
  if (!dealId) return;
  try {
    if (input.kind === "WON") {
      await onWon(scopeOf(ctx), { dealId });
      return;
    }
    const rows = await prisma.crmCommission.findMany({
      where: { ...scopeOf(ctx), dealId, basis: "WON", refType: REF_WON, reversedOfId: null, status: { in: ["PENDING", "APPROVED", "PAID"] } },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: 100,
    });
    await retireWonRows(scopeOf(ctx), dealId, rows, { dealMayBeWon: false });
  } catch (e) {
    await warn(ctx, "คิด/ถอนคอมมิชชันฐานปิดการขายไม่สำเร็จ — งานรายนาทีจะลองใหม่", e, { dealId });
  }
}

/**
 * ผลของสายอนุมัติ `crm.commission` (approval-effects.ts · ขั้นแรกที่ retry ได้) — guard: แถวยัง PENDING และผูกคำขอใบนี้
 * (หรือยังไม่ผูก) ⇒ ส่งซ้ำ/พร้อมกัน/มาช้าหลังคนตัดสินเอง = ไม่เปลี่ยนอะไร · อนุมัติ = ส่ง HR ครั้งเดียว
 */
export async function applyApprovalDecision(input: { tenantId: string; requestId: string; entityId: string; approved: boolean }): Promise<void> {
  const id = str(input?.entityId);
  const requestId = str(input?.requestId);
  if (!id || !requestId || !str(input?.tenantId)) return;
  const row = await prisma.crmCommission.findFirst({ where: { id, tenantId: input.tenantId }, select: { id: true, systemId: true, approvalRequestId: true, userId: true } });
  if (!row || (row.approvalRequestId && row.approvalRequestId !== requestId)) return;
  const ctx: Scope = { tenantId: input.tenantId, systemId: row.systemId };
  // รีวิวรอบ 2 S-d + รอบ 5 S2/S3: ผู้ตัดสินของสาย = ผู้อนุมัติ (ส่งให้ HR เป็น requestedById) — อ่านแบบ **fail closed** (ฐานข้อมูลล้ม = โยน ⇒ event
  //   ถูกส่งใหม่ ไม่ข้ามด่าน) · ผู้ตัดสินคือเจ้าของรายการเอง (ไม่ใช่เจ้าของร้าน) ⇒ **คง PENDING** (ผูกคำขอไว้ · note) + แจ้งเจ้าของร้านให้ตัดสินแทน
  const decision = await (await approvalFacade()).lastDecisionOf({ tenantId: input.tenantId }, requestId);
  const decider = decision?.decidedById ?? null;
  if (input.approved) {
    if (decider && decider === row.userId) {
      const m = await prisma.membership.findFirst({ where: { tenantId: input.tenantId, userId: decider }, select: { role: true } });
      if (m?.role !== "OWNER") {
        const note = "ผู้ตัดสินในสายอนุมัติเป็นเจ้าของรายการคอมมิชชันนี้เอง — รายการจึงยังรออนุมัติ และระบบแจ้งเจ้าของร้านให้ตัดสินแทนแล้ว";
        const full = await prisma.crmCommission.findFirst({ where: { id: row.id, ...ctx } });
        if (full?.status !== "PENDING") return;
        // รอบ 6: แจ้งก่อน · แจ้งไม่สำเร็จ = ยังไม่ติดป้าย/ธง และ **โยน** ⇒ approval-effects ส่ง event ใหม่ตาม backoff (คิว (3ข) ของงานรายนาทีเป็นสำรอง)
        if (!(await escalateOnce(ctx, full))) throw new Error(`แจ้งเจ้าของร้านเรื่องคอมมิชชัน ${row.id} ไม่สำเร็จ — ลองใหม่`);
        await prisma.crmCommission.updateMany({
          where: { id: row.id, ...ctx, status: "PENDING", OR: [{ approvalRequestId: requestId }, { approvalRequestId: null }] },
          data: { approvalRequestId: requestId, note },
        });
        await flagOnce(ctx, "crm.commission.selfdecide", row.id, { requestId, deciderId: decider, note });
        return;
      }
    }
    if (await claimApproved(ctx, row.id, { requestId })) {
      await audit(ctx, "crm.commission.approve", "CrmCommission", row.id, { after: { status: "APPROVED", via: "APPROVAL", requestId } }, decider);
    }
    await handoff(ctx, row.id);
    return;
  }
  const n = await prisma.crmCommission.updateMany({
    where: { id: row.id, ...ctx, status: "PENDING", OR: [{ approvalRequestId: requestId }, { approvalRequestId: null }] },
    data: { status: "REJECTED", decidedAt: new Date(), approvalRequestId: requestId },
  });
  if (n.count === 1) await audit(ctx, "crm.commission.reject", "CrmCommission", row.id, { after: { status: "REJECTED", via: "APPROVAL", requestId } }, null);
}

/** `hr.payroll.paid {runId}` → คอมมิชชัน APPROVED ที่รายการ HR อยู่ในรอบนั้น = PAID (guard สถานะ · แถว REVERSED ไม่ถูกแตะ) */
export async function onPayrollPaid(input: { tenantId: string; hrSystemId: string | null; runId: string | null }): Promise<{ paid: number }> {
  const tenantId = str(input?.tenantId);
  const systemId = str(input?.hrSystemId);
  const runId = str(input?.runId);
  if (!tenantId || !systemId || !runId) return { paid: 0 };
  const hr = await hrFacade();
  const run = await hr.adjustmentsOfRun({ tenantId, systemId }, runId);
  if (run.status !== "PAID" || run.items.length === 0) return { paid: 0 };
  let paid = 0;
  for (let i = 0; i < run.items.length; i += 500) {
    const n = await prisma.crmCommission.updateMany({
      where: { tenantId, status: "APPROVED", reversedOfId: null, OR: run.items.slice(i, i + 500).map((it) => ({ id: it.crmCommissionId, hrPayAdjustmentId: it.id })) },
      data: { status: "PAID" },
    });
    paid += n.count;
  }
  return { paid };
}

/** ตัวรับ event ของตัวเอง (สำรองกรณีโพรเซสตายหลัง commit) — ยื่นอนุมัติ/ส่ง HR ต่อจากที่ค้าง */
export async function advanceById(input: { tenantId: string; commissionId: string | null }): Promise<void> {
  const id = str(input?.commissionId);
  if (!id || !str(input?.tenantId)) return;
  const row = await prisma.crmCommission.findFirst({ where: { id, tenantId: input.tenantId }, select: { systemId: true } });
  if (row) await advance({ tenantId: input.tenantId, systemId: row.systemId }, id);
}

// ═════════════════════════ งานรายนาที `crm.commissions.payroll` ═════════════════════════

/**
 * ทุกระบบ CRM v2 ที่มีเรื่องคอมมิชชันค้าง (มติผู้คุมงาน S3 · S4 — คัดใน SQL + cursor ไม่วนแถวที่ไม่มีวันสำเร็จ):
 * (1) เงินที่นับแล้ว/ดีลที่ชนะแล้วแต่ยังไม่มีแถวของกฎที่ตรง pipeline และเกิดหลังสร้างกฎ (โพรเซสตายหลัง commit) ·
 * (2) เงิน/ดีลที่ถูกถอนแล้วแต่คอมมิชชันยังไม่ถอน · (3) PENDING ที่ยังไม่ได้ยื่นอนุมัติ (ไม่รวมแถวที่แจ้งเจ้าของร้านไปแล้ว) ·
 * (4) ส่งเงินเดือนแถวที่พนักงานเพิ่งถูกผูก · (5) รายการ HR ค้างในงวดที่มีรอบแล้ว → ถอนแล้วยื่นใหม่เดือนถัดไป
 * ทุกขั้น idempotent (unique + guard สถานะ + ล็อกแถว + partial unique ของ HR) ⇒ route + crontab ยิงซ้อนกันได้ · เคารพ deadline
 */
export async function runPayrollSync(now: Date, opts: { deadline?: number; signal?: AbortSignal; tenantIds?: string[] } = {}): Promise<{ systems: number; requested: number }> {
  const timeUp = () => opts.signal?.aborted === true || (opts.deadline !== undefined && Date.now() >= opts.deadline);
  // `tenantIds` = จำกัดร้าน (ผู้เรียกที่ไม่ใช่ตัวรันรายนาที เช่น probe/ข้อสอบบนฐาน QC ที่ใช้ร่วมกัน) · ไม่ระบุ = ทุกร้าน
  const only = opts.tenantIds && opts.tenantIds.length ? Prisma.sql`AND s."tenantId" = ANY(${opts.tenantIds}::text[])` : Prisma.empty;
  const systems = await prisma.$queryRaw<{ id: string; tenantId: string }[]>`
    SELECT s."id", s."tenantId" FROM "AppSystem" s
    WHERE s."type" = 'CRM' AND (s."settings"->'crm'->>'uiVersion') = '2' ${only}
      AND (EXISTS (SELECT 1 FROM "CrmCommissionRule" r WHERE r."systemId" = s."id" AND r."active")
        OR EXISTS (SELECT 1 FROM "CrmCommission" c WHERE c."systemId" = s."id" AND c."hrPayAdjustmentId" IS NULL AND c."status"::text IN ('PENDING','APPROVED','REVERSED')))
    ORDER BY s."id" LIMIT 500`;
  const since = new Date(now.getTime() - 3 * 86_400_000);
  const stale = new Date(now.getTime() - 2 * 60_000);
  let requested = 0;
  const tenantsDone = new Set<string>();
  for (const sys of systems) {
    if (timeUp()) break;
    const ctx: Scope = { tenantId: sys.tenantId, systemId: sys.id };
    try {
      // (1ก) เงินงวดที่นับแล้ว (3 วัน · หรือทุกช่วงถ้าดีลยังไม่มีแถวของกฎนั้นเลย): มีกฎ PAID ที่ตรง pipeline · สร้างก่อนเงินเข้า · ยังไม่มีแถวของกฎนั้นสำหรับงวดนี้
      //   รีวิวรอบ 6 ข้อ 3: **ใหม่ก่อน** (countedAt DESC) — หน้าแรกเริ่มจากบนสุดทุกรอบ (ตัวต่อที่ล้มของเงินใหม่ถึงในรอบถัดไปเสมอ) ·
      //   หน้าที่เหลือเดินต่อจาก cursor ที่จำไว้ต่อระบบ (`OpsAlertState` `crm.commission.q1a.cursor:<systemId>` = countedAt ของแถวสุดท้าย) · สุดทางแล้วล้าง cursor (วนใหม่)
      const q1a = (before: Date | null) => prisma.$queryRaw<{ id: string; dealId: string; at: Date }[]>`
        SELECT p."id", p."dealId", COALESCE(p."countedAt", p."createdAt") AS "at" FROM "CrmDealPayment" p JOIN "CrmDeal" d ON d."id" = p."dealId"
        WHERE p."tenantId" = ${ctx.tenantId} AND p."systemId" = ${ctx.systemId} AND p."status" = 'COUNTED'
          ${before ? Prisma.sql`AND COALESCE(p."countedAt", p."createdAt") <= ${before}` : Prisma.empty}
          AND d."ownerUserId" IS NOT NULL
          AND EXISTS (SELECT 1 FROM "CrmCommissionRule" r WHERE r."systemId" = p."systemId" AND r."active" AND r."basis"::text = 'PAID'
                AND (r."pipelineId" IS NULL OR r."pipelineId" = d."pipelineId") AND (r."teamId" IS NULL OR d."teamId" IS NULL OR r."teamId" = d."teamId")
                AND p."countedAt" >= r."createdAt"
                -- รอบ 6 B-1: กรองใน SQL เท่าที่ทำได้ (มูลค่าขั้นต่ำ — ข้ามเมื่อดีลมีแถวของกฎนี้แล้ว เพราะ T แช่ที่แถวแรก ไม่ใช่มูลค่าปัจจุบัน) ·
                --   กฎที่กรองไม่ได้ (ทีม/สินค้า) หรือส่วนแบ่ง 0 บนฐานนิ่ง = ธง "ประเมินแล้วไม่ตรง" ⇒ ไม่หยิบซ้ำ
                AND (r."minDealSatang" IS NULL OR d."valueSatang" = 0 OR d."valueSatang" >= r."minDealSatang"
                     OR EXISTS (SELECT 1 FROM "CrmCommission" c1 WHERE c1."dealId" = d."id" AND c1."ruleId" = r."id"))
                AND NOT EXISTS (SELECT 1 FROM "OpsAlertState" o WHERE o."source" = ${NOMATCH_PREFIX} || ${keySql("p")} || ':' || r."id")
                -- รีวิวรอบ 2 S-e: ดีลที่ยังไม่มีแถวของกฎนี้เลย = ไม่จำกัด 3 วัน (มูลค่า/เอกสารถูกตั้งทีหลังก็ยังได้เครดิต)
                AND (p."countedAt" >= ${since} OR NOT EXISTS (SELECT 1 FROM "CrmCommission" c0 WHERE c0."dealId" = d."id" AND c0."ruleId" = r."id"))
                -- รอบ 5 B1 · N4: ยังไม่มีแถวของ "ร่างปัจจุบัน" ของงวดนี้ในกฎนี้ (ดีลเดียวกัน)
                AND NOT EXISTS (SELECT 1 FROM "CrmCommission" c WHERE c."dealId" = p."dealId" AND c."ruleId" = r."id" AND c."refId" = ${keySql("p")}))
        ORDER BY COALESCE(p."countedAt", p."createdAt") DESC, p."id" DESC LIMIT 100`;
      const cursorKey = `${Q1A_CURSOR_PREFIX}${ctx.systemId}`;
      const head = await q1a(null);
      for (const p of head) if (!timeUp()) await onPaid(ctx, { dealId: p.dealId, refType: REF_PAYMENT, refId: p.id });
      if (head.length < 100) {
        await prisma.opsAlertState.deleteMany({ where: { source: cursorKey } });
      } else {
        const saved = await prisma.opsAlertState.findUnique({ where: { source: cursorKey }, select: { lastAlertAt: true } });
        let before: Date = saved?.lastAlertAt ?? new Date(head[head.length - 1]!.at);
        for (let page = 1; page < 10 && !timeUp(); page += 1) {
          const pays = await q1a(before);
          for (const p of pays) if (!timeUp()) await onPaid(ctx, { dealId: p.dealId, refType: REF_PAYMENT, refId: p.id });
          if (pays.length < 100) {
            await prisma.opsAlertState.deleteMany({ where: { source: cursorKey } });
            break;
          }
          // `<=` + ms เดียวกันหลายแถวข้ามหน้า = หยิบซ้ำได้ (onPaid idempotent) · ไม่ขยับ = ถอย 1 ms กันวนที่เดิม
          const last = new Date(pays[pays.length - 1]!.at);
          before = last.getTime() < before.getTime() ? last : new Date(before.getTime() - 1);
          await prisma.opsAlertState.upsert({ where: { source: cursorKey }, create: { source: cursorKey, lastAlertAt: before }, update: { lastAlertAt: before } });
        }
      }
      // (1ข) ดีลที่ชนะใน 3 วัน: มีกฎ WON ที่ตรง pipeline · สร้างก่อนชนะ · ยังไม่มีแถวของกฎนั้น (cursor)
      let cursor = "";
      for (let page = 0; page < 10 && !timeUp(); page += 1) {
        const won = await prisma.$queryRaw<{ id: string }[]>`
          SELECT d."id" FROM "CrmDeal" d
          WHERE d."tenantId" = ${ctx.tenantId} AND d."systemId" = ${ctx.systemId} AND d."kind"::text = 'WON' AND d."closedAt" >= ${since} AND d."id" > ${cursor}
            AND d."ownerUserId" IS NOT NULL
            AND EXISTS (SELECT 1 FROM "CrmCommissionRule" r WHERE r."systemId" = d."systemId" AND r."active" AND r."basis"::text = 'WON'
                  AND (r."pipelineId" IS NULL OR r."pipelineId" = d."pipelineId") AND (r."teamId" IS NULL OR d."teamId" IS NULL OR r."teamId" = d."teamId")
                  AND d."closedAt" >= r."createdAt"
                  AND NOT EXISTS (SELECT 1 FROM "CrmCommission" c WHERE c."dealId" = d."id" AND c."ruleId" = r."id"))
          ORDER BY d."id" ASC LIMIT 100`;
        if (won.length === 0) break;
        cursor = won[won.length - 1]!.id;
        for (const d of won) if (!timeUp()) await onWon(ctx, { dealId: d.id });
        if (won.length < 100) break;
      }
      // (2) ถอนที่ค้าง: เงินถูกยกเลิกแล้ว · ดีลไม่อยู่ WON แล้ว
      const moneyDeals = await prisma.$queryRaw<{ dealId: string }[]>`
        SELECT DISTINCT c."dealId" FROM "CrmCommission" c JOIN "CrmDealPayment" p ON p."id" = ${payIdSql("c")}
        WHERE c."tenantId" = ${ctx.tenantId} AND c."systemId" = ${ctx.systemId} AND c."refType" = ${REF_PAYMENT} AND c."reversedOfId" IS NULL
          AND c."status"::text IN ('PENDING','APPROVED','PAID') AND (p."status" = 'REVERSED' OR (p."status" = 'COUNTED' AND c."refId" <> ${keySql("p")}))
          AND NOT EXISTS (SELECT 1 FROM "CrmCommission" r WHERE r."reversedOfId" = c."id") LIMIT 50`;
      // รอบ 6: ดีลที่มีการถอนเงินใน 7 วัน ⇒ เรียกตัวต่อซ้ำ (idempotent) — ครอบกรณีโพรเซสตายระหว่าง "ถอน" กับ "คิดงวดที่ไม่มีแถวใหม่" (S1 ของรอบ 5)
      const recent = await prisma.$queryRaw<{ dealId: string }[]>`
        SELECT DISTINCT p."dealId" FROM "CrmDealPayment" p
        WHERE p."tenantId" = ${ctx.tenantId} AND p."systemId" = ${ctx.systemId} AND p."status" = 'REVERSED' AND p."reversedAt" >= ${new Date(now.getTime() - 7 * 86_400_000)}
        ORDER BY p."dealId" ASC LIMIT 50`;
      const deals2 = [...new Set([...moneyDeals.map((d) => d.dealId), ...recent.map((d) => d.dealId)])];
      for (const d of deals2) if (!timeUp()) await afterPaymentsReversed(ctx, { dealId: d });
      const lostWon = await prisma.$queryRaw<{ dealId: string }[]>`
        SELECT DISTINCT c."dealId" FROM "CrmCommission" c JOIN "CrmDeal" d ON d."id" = c."dealId"
        WHERE c."tenantId" = ${ctx.tenantId} AND c."systemId" = ${ctx.systemId} AND c."refType" = ${REF_WON} AND c."reversedOfId" IS NULL
          AND c."status"::text IN ('PENDING','APPROVED','PAID') AND d."kind"::text <> 'WON'
          AND NOT EXISTS (SELECT 1 FROM "CrmCommission" r WHERE r."reversedOfId" = c."id") LIMIT 50`;
      for (const d of lostWon) if (!timeUp()) await afterDealMoved(ctx, { dealId: d.dealId, kind: "OPEN" });
      // (3) PENDING ที่ยังไม่ได้ยื่นอนุมัติ (เกิน 2 นาที — กันชนกับทางปกติ) และยังไม่ได้แจ้งเจ้าของร้าน (ไม่มีสาย = รอเจ้าของร้าน)
      //     ร้านที่ปิด approvalRequired ภายหลัง: แถวที่เคยแจ้งเจ้าของร้านไว้ก็ถูกหยิบด้วย (advance = อนุมัติทันที — หนี้ §8 ปิดในบรรทัดนี้)
      const autoApprove = !commissionSettingsOf((await loadSystem(ctx))?.settings ?? null).approvalRequired;
      const pend = await prisma.$queryRaw<{ id: string }[]>`
        SELECT c."id" FROM "CrmCommission" c
        WHERE c."tenantId" = ${ctx.tenantId} AND c."systemId" = ${ctx.systemId} AND c."status"::text = 'PENDING' AND c."approvalRequestId" IS NULL
          AND c."reversedOfId" IS NULL AND c."createdAt" < ${stale}
          AND (${autoApprove} OR NOT EXISTS (SELECT 1 FROM "AuditLog" a WHERE a."tenantId" = c."tenantId" AND a."action" = 'crm.commission.escalate' AND a."targetId" = c."id"))
          -- รีวิวรอบ 6: ร่างใหม่ของงวดที่คนเคยไม่อนุมัติ + แจ้งเจ้าของร้านแล้ว = รอคน (ไม่หยิบซ้ำทุกรอบ)
          AND NOT (c."note" IS NOT NULL AND c."note" = ${COMMISSION_WAS_REJECTED_NOTE}
                   AND EXISTS (SELECT 1 FROM "AuditLog" a2 WHERE a2."tenantId" = c."tenantId" AND a2."action" = 'crm.commission.escalate' AND a2."targetId" = c."id"))
        ORDER BY c."id" ASC LIMIT 100`;
      for (const r of pend) if (!timeUp()) await advanceSafe(ctx, r.id);
      // (3ข) รอบ 6 + รีวิวรอบ 6 ข้อ 4 (สำรองของ event ที่ล้ม): PENDING ที่ผูกคำขอ · ไม่มีธง "ผู้ตัดสินคือเจ้าของรายการ" ⇒ ใช้ผลของคำขอที่ **ตัดสินแล้ว**
      //   (APPROVED/REJECTED) ซ้ำ · คำขอที่ยังรอผู้อนุมัติ (PENDING) ถูกคัดออกทีละหน้าผ่าน facade (cursor ตาม id — ไม่อดเพราะแถวที่รอคนเต็มหน้า)
      let wCursor = "";
      for (let page = 0; page < 10 && !timeUp(); page += 1) {
        const waiting = await prisma.$queryRaw<{ id: string; approvalRequestId: string }[]>`
          SELECT c."id", c."approvalRequestId" FROM "CrmCommission" c
          WHERE c."tenantId" = ${ctx.tenantId} AND c."systemId" = ${ctx.systemId} AND c."status"::text = 'PENDING' AND c."approvalRequestId" IS NOT NULL
            AND c."reversedOfId" IS NULL AND c."createdAt" < ${stale} AND c."id" > ${wCursor}
            AND NOT EXISTS (SELECT 1 FROM "AuditLog" a WHERE a."tenantId" = c."tenantId" AND a."action" = 'crm.commission.selfdecide' AND a."targetId" = c."id")
          ORDER BY c."id" ASC LIMIT 200`;
        if (waiting.length === 0) break;
        wCursor = waiting[waiting.length - 1]!.id;
        const st = await (await approvalFacade()).requestStatuses({ tenantId: ctx.tenantId }, waiting.map((w) => w.approvalRequestId));
        for (const w of waiting) {
          const decided = st[w.approvalRequestId];
          if (timeUp() || (decided !== "APPROVED" && decided !== "REJECTED")) continue;
          await applyApprovalDecision({ tenantId: ctx.tenantId, requestId: w.approvalRequestId, entityId: w.id, approved: decided === "APPROVED" }).catch((e) => warn(ctx, "ใช้ผลสายอนุมัติซ้ำไม่สำเร็จ", e, { commissionId: w.id }));
        }
        if (waiting.length < 200) break;
      }
      // (4) ส่งเงินเดือน
      if (!timeUp()) requested += (await syncPayroll(ctx, {}, { deadline: opts.deadline })).requested;
      // (5) รายการ HR ค้างในงวดที่มีรอบแล้ว (ต่อร้าน ครั้งเดียวต่อรอบ)
      if (!tenantsDone.has(ctx.tenantId) && !timeUp()) {
        tenantsDone.add(ctx.tenantId);
        const hr = await hrFacade();
        for (const adj of await hr.strandedCommissionAdjustments(ctx.tenantId, 50)) {
          if (timeUp() || !adj.crmCommissionId) continue;
          const owner = await prisma.crmCommission.findFirst({ where: { id: adj.crmCommissionId, tenantId: ctx.tenantId }, select: { systemId: true } });
          if (owner) await rehomeStranded({ tenantId: ctx.tenantId, systemId: owner.systemId }, adj).catch((e) => warn(ctx, "ย้ายรายการเงินเดือนที่ค้างไม่สำเร็จ", e, { commissionId: adj.crmCommissionId }));
        }
      }
    } catch (e) {
      await warn(ctx, "งานรายนาทีของคอมมิชชันล้มกลางทาง — รอบถัดไปทำต่อ", e, {});
    }
  }
  return { systems: systems.length, requested };
}

// ═════════════════════════ ทางเข้าของคน — กฎ ═════════════════════════

export type RuleInput = {
  name: string;
  basis?: CommissionBasis;
  kind: CommissionKind;
  config: unknown;
  pipelineId?: string | null;
  teamId?: string | null;
  productIds?: string[] | null;
  minDealSatang?: number | null;
  splitCollaboratorsBp?: number;
  payoutDelayDays?: number;
  active?: boolean;
  sortOrder?: number;
};

function ruleDto(r: CrmCommissionRule): CommissionRuleDto {
  const cfg = configOf(r);
  return {
    id: r.id,
    name: r.name,
    basis: r.basis as CommissionBasis,
    kind: r.kind as CommissionKind,
    config: cfg,
    description: describeRule(r.kind, cfg, r.splitCollaboratorsBp),
    pipelineId: r.pipelineId,
    teamId: r.teamId,
    productIds: r.productIds,
    minDealSatang: r.minDealSatang === null ? null : Number(r.minDealSatang),
    splitCollaboratorsBp: r.splitCollaboratorsBp,
    payoutDelayDays: r.payoutDelayDays,
    active: r.active,
    sortOrder: r.sortOrder,
  };
}

const isInt = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v);

/** AUDIT-CLASS X6/X9: ตรวจค่าทุกช่องก่อนเขียน — ผิดข้อใด = VALIDATION ข้อความไทย (ไม่เขียนอะไรเลย) */
async function normalizeRule(ctx: Scope, input: RuleInput): Promise<Omit<Prisma.CrmCommissionRuleUncheckedCreateInput, "tenantId" | "systemId">> {
  const name = str(input?.name);
  if (!name) throw fail("VALIDATION", "ตั้งชื่อกฎก่อนบันทึก เช่น \"ขายองค์กร B2B — มาตรฐาน\"");
  if (name.length > COMMISSION_LIMITS.nameMax) throw fail("VALIDATION", `ชื่อกฎยาวได้ไม่เกิน ${COMMISSION_LIMITS.nameMax} ตัวอักษร`);
  const basis = input.basis ?? "PAID";
  if (basis !== "PAID" && basis !== "WON") throw fail("VALIDATION", "ฐานของกฎต้องเป็น \"เมื่อรับเงิน\" หรือ \"เมื่อปิดการขาย\"");
  if (!COMMISSION_KINDS.includes(input.kind)) throw fail("VALIDATION", "ชนิดของกฎต้องเป็น เปอร์เซ็นต์ · คงที่ต่อดีล · หรือขั้นบันได");
  const cfg = checkRuleConfig(input.kind, input.config);
  if (!cfg.ok) throw fail("VALIDATION", cfg.message);
  const split = input.splitCollaboratorsBp ?? 0;
  if (!isInt(split) || split < 0 || split > COMMISSION_LIMITS.bpMax) throw fail("VALIDATION", "สัดส่วนที่แบ่งให้ผู้ร่วมดูแลต้องอยู่ระหว่าง 0–100%");
  const delay = input.payoutDelayDays ?? 0;
  if (!isInt(delay) || delay < 0 || delay > COMMISSION_LIMITS.delayDaysMax) throw fail("VALIDATION", `จำนวนวันที่เลื่อนจ่ายต้องอยู่ระหว่าง 0–${COMMISSION_LIMITS.delayDaysMax} วัน`);
  const min = input.minDealSatang ?? null;
  if (min !== null && (!isInt(min) || min < 0)) throw fail("VALIDATION", "มูลค่าดีลขั้นต่ำต้องเป็น 0 บาทขึ้นไป (เว้นว่าง = ไม่มีขั้นต่ำ)");
  const sortOrder = input.sortOrder ?? 0;
  if (!isInt(sortOrder)) throw fail("VALIDATION", "ลำดับการแสดงผลต้องเป็นจำนวนเต็ม");
  const pipelineId = str(input.pipelineId);
  if (pipelineId) {
    // AUDIT-CLASS X1: pipeline ต้องเป็นของระบบนี้ (ของระบบ/ร้านอื่น = ไม่พบ — ไม่บอกว่ามีอยู่ที่อื่น)
    const p = await prisma.crmPipeline.findFirst({ where: { id: pipelineId, ...ctx }, select: { id: true } });
    if (!p) throw fail("VALIDATION", "ไม่พบ pipeline นี้ในระบบ CRM นี้ — เลือกจากรายการ pipeline ของระบบนี้");
  }
  const teamId = str(input.teamId);
  if (teamId) {
    const { getTeam } = await import("@/lib/core/teams");
    if (!(await getTeam({ tenantId: ctx.tenantId }, teamId).catch(() => null))) throw fail("VALIDATION", "ไม่พบทีมขายนี้ในร้าน — เลือกจากรายการทีม");
  }
  const productIds = [...new Set((input.productIds ?? []).filter((p): p is string => typeof p === "string" && !!p.trim()).map((p) => p.trim()))];
  if (productIds.length > COMMISSION_LIMITS.productIdsMax) throw fail("VALIDATION", `ระบุสินค้าได้ไม่เกิน ${COMMISSION_LIMITS.productIdsMax} รายการต่อกฎ`);
  return {
    name,
    basis,
    kind: input.kind,
    config: cfg.config as Prisma.InputJsonValue,
    pipelineId,
    teamId,
    productIds,
    minDealSatang: min === null ? null : BigInt(min),
    splitCollaboratorsBp: split,
    payoutDelayDays: delay,
    active: input.active !== false,
    sortOrder,
  };
}

/** JSON ที่ลำดับคีย์คงที่ (jsonb เรียงคีย์ใหม่ตอนเก็บ — เทียบ config ตรง ๆ จะเห็น "เปลี่ยน" ทั้งที่ไม่ได้เปลี่ยน) */
function stableJson(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stableJson).join(",")}]`;
  if (v && typeof v === "object") return `{${Object.keys(v as Record<string, unknown>).sort().map((k) => `${JSON.stringify(k)}:${stableJson((v as Record<string, unknown>)[k])}`).join(",")}}`;
  return JSON.stringify(v ?? null);
}

const ruleSnapshot = (r: CrmCommissionRule) => ({ ...ruleDto(r), description: undefined });

export async function listRules(ctx: CommissionsCtx, actor: MemberActor): Promise<CommissionRuleDto[]> {
  await enterHuman(ctx, actor);
  need(actor, "crm.settings.manage", "crm.commission.approve", "crm.commission.view");
  const rows = await prisma.crmCommissionRule.findMany({ where: scopeOf(ctx), orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }, { id: "asc" }], take: 500 });
  return rows.map(ruleDto);
}

export async function createRule(ctx: CommissionsCtx, actor: MemberActor, input: RuleInput): Promise<CommissionRuleDto> {
  const sys = await enterHuman(ctx, actor);
  need(actor, "crm.settings.manage");
  // ไม่ระบุฐาน = ฐานปริยายของร้าน (`settings.crm.commission.basis`)
  const data = await normalizeRule(scopeOf(ctx), { ...input, basis: input?.basis ?? commissionSettingsOf(sys.settings).basis });
  const row = await prisma.crmCommissionRule.create({ data: { ...scopeOf(ctx), ...data } });
  await audit(scopeOf(ctx), "crm.commission.rule.create", "CrmCommissionRule", row.id, { after: ruleSnapshot(row) }, actor.userId);
  return ruleDto(row);
}

export async function updateRule(ctx: CommissionsCtx, actor: MemberActor, id: string, patch: Partial<RuleInput>): Promise<CommissionRuleDto> {
  await enterHuman(ctx, actor);
  need(actor, "crm.settings.manage");
  const rid = str(id);
  const cur = rid ? await prisma.crmCommissionRule.findFirst({ where: { id: rid, ...scopeOf(ctx) } }) : null;
  if (!cur) throw fail("NOT_FOUND", RULE_NOT_FOUND);
  const p = (patch ?? {}) as Partial<RuleInput>;
  const merged: RuleInput = {
    name: p.name ?? cur.name,
    basis: p.basis ?? (cur.basis as CommissionBasis),
    kind: p.kind ?? (cur.kind as CommissionKind),
    config: p.config ?? cur.config,
    pipelineId: p.pipelineId !== undefined ? p.pipelineId : cur.pipelineId,
    teamId: p.teamId !== undefined ? p.teamId : cur.teamId,
    productIds: p.productIds !== undefined ? p.productIds : cur.productIds,
    minDealSatang: p.minDealSatang !== undefined ? p.minDealSatang : cur.minDealSatang === null ? null : Number(cur.minDealSatang),
    splitCollaboratorsBp: p.splitCollaboratorsBp ?? cur.splitCollaboratorsBp,
    payoutDelayDays: p.payoutDelayDays ?? cur.payoutDelayDays,
    active: p.active ?? cur.active,
    sortOrder: p.sortOrder ?? cur.sortOrder,
  };
  // มติผู้คุมงาน B4: กฎที่มีแถวแล้วห้ามเปลี่ยนฐาน (PAID ↔ WON = จ่ายซ้ำสองฐานบนดีลเดียวกัน)
  //   รีวิวรอบ 2: รวมถึงชนิด/อัตรา/มูลค่าขั้นต่ำ — ยอดของงวดที่จ่ายไปแล้วคิดจากค่าชุดเดิม (เปลี่ยนกลางทาง = ส่วนแบ่งไม่พับเข้าหากัน)
  const data = await normalizeRule(scopeOf(ctx), merged);
  const money =
    merged.basis !== cur.basis ||
    data.kind !== cur.kind ||
    stableJson(data.config) !== stableJson(cur.config) ||
    (data.minDealSatang ?? null) !== (cur.minDealSatang ?? null);
  // CRM C3.3 ▸ มติ S0.6: ขอบเขตการจับคู่ (pipeline · ทีม · สินค้า) ของกฎที่มีแถวแล้วก็ห้ามเปลี่ยนเหมือนฐาน/อัตรา — ไม่งั้นการล้างธง
  //   "ประเมินแล้วไม่ตรง" ทำให้เงินเก่าถูกหยิบและเครดิตย้อนหลังภายใต้ขอบเขตใหม่ · ชื่อ/เปิด-ปิด/ลำดับ แก้ได้เสมอ
  const scope =
    (data.pipelineId ?? null) !== (cur.pipelineId ?? null) ||
    (data.teamId ?? null) !== (cur.teamId ?? null) ||
    stableJson([...(Array.isArray(data.productIds) ? data.productIds : [])].sort()) !== stableJson([...cur.productIds].sort());
  // รีวิวรอบ 6 ข้อ 5: เปิดกฎกลับ (ปิด → เปิด) หรือเปลี่ยนขอบเขต/ฐานของกฎที่ยังไม่มีแถว ⇒ `createdAt = ตอนนี้` — กฎคิดเฉพาะเงินที่เข้ามาหลังจากนี้
  //   (ไม่มีเครดิตย้อนหลังให้เงินที่นับไว้ระหว่างกฎปิด/ก่อนแก้ — ทุกทางเข้าเทียบ "เวลานับร่างแรก" กับ createdAt ของกฎ)
  const restart = (cur.active === false && data.active === true) || scope || money;
  // รีวิวรอบ 6: ตรวจ + เขียนในธุรกรรมเดียว — ล็อกแถวกฎ FOR UPDATE แล้วนับแถวคอมมิชชันใต้ล็อก · ทางที่เขียนแถว (onPaid/onWon) ล็อกกฎ FOR SHARE
  //   และข้ามกฎที่ updatedAt เปลี่ยน ⇒ ไม่มีแถวใต้ค่าชุดเก่าเกิดหลังการเปลี่ยนขอบเขต/ฐาน
  await prisma.$transaction(async (tx) => {
    const locked = await tx.$queryRaw<{ updatedAt: Date }[]>`
      SELECT "updatedAt" FROM "CrmCommissionRule" WHERE "id" = ${cur.id} AND "tenantId" = ${ctx.tenantId} AND "systemId" = ${ctx.systemId} FOR UPDATE`;
    if (!locked[0]) throw fail("NOT_FOUND", RULE_NOT_FOUND);
    if (new Date(locked[0].updatedAt).getTime() !== cur.updatedAt.getTime()) throw fail("CONFLICT", "กฎนี้เพิ่งถูกแก้จากอีกหน้าจอ — โหลดหน้าใหม่แล้วลองอีกครั้ง");
    if ((money || scope) && (await tx.crmCommission.findFirst({ where: { ...scopeOf(ctx), ruleId: cur.id }, select: { id: true } }))) {
      throw fail("VALIDATION", "กฎนี้มีค่าคอมมิชชันแล้ว เปลี่ยนขอบเขต/ฐานไม่ได้ — สร้างกฎใหม่แทน");
    }
    const n = await tx.crmCommissionRule.updateMany({ where: { id: cur.id, ...scopeOf(ctx) }, data: { ...data, ...(restart ? { createdAt: new Date() } : {}) } });
    if (n.count !== 1) throw fail("NOT_FOUND", RULE_NOT_FOUND);
  }, TX_OPTS);
  // ◂ CRM C3.3
  // รอบ 6 B-1 + มติ S0.6: เปลี่ยนขอบเขต/ฐานได้เฉพาะกฎที่ยังไม่มีแถว ⇒ ล้างธง "ประเมินแล้วไม่ตรง" ของกฎนั้น (คิวประเมินใหม่ · ไม่มีอะไรเคยจ่าย)
  //   เปิด/ปิดกฎไม่เปลี่ยนคำตอบของการจับคู่ ⇒ ธงคงไว้
  if (scope || money) {
    await prisma.opsAlertState.deleteMany({ where: { source: { startsWith: NOMATCH_PREFIX, endsWith: `:${cur.id}` } } });
  }
  const row = await prisma.crmCommissionRule.findFirst({ where: { id: cur.id, ...scopeOf(ctx) } });
  if (!row) throw fail("NOT_FOUND", RULE_NOT_FOUND);
  await audit(scopeOf(ctx), "crm.commission.rule.update", "CrmCommissionRule", row.id, { before: ruleSnapshot(cur), after: ruleSnapshot(row) }, actor.userId);
  return ruleDto(row);
}

// ═════════════════════════ ทางเข้าของคน — ค่าตั้งของร้าน `settings.crm.commission` ═════════════════════════

const SettingsPatch = z
  .object({
    approvalRequired: z.boolean().optional(),
    payrollLink: z.boolean().optional(),
    basis: z.enum(["PAID", "WON"]).optional(),
  })
  .strict();

/** ค่าปัจจุบัน (ค่าเพี้ยน/ไม่ได้ตั้ง = ค่าเริ่มต้นที่ปลอดภัย: ต้องอนุมัติ · ส่งเงินเดือน · ฐาน PAID) */
export async function getCommissionSettings(ctx: CommissionsCtx, actor: MemberActor): Promise<CommissionSettings> {
  const sys = await enterHuman(ctx, actor);
  need(actor, "crm.settings.manage", "crm.commission.approve");
  return commissionSettingsOf(sys.settings);
}

/**
 * แก้ค่าตั้งของร้าน (คีย์ `crm.settings.manage`) — ตรวจด้วย zod (คีย์แปลก/ชนิดผิด = VALIDATION ไม่เขียนอะไร) ·
 * เขียนคำสั่งเดียวผ่าน `settings.setCrmCommissionSettings` · audit `crm.commission.settings` before/after (AUDIT-CLASS X9)
 * 🔴 มีผลกับแถวที่เกิด **หลังจากนี้** เท่านั้น (แถว PENDING ที่ยื่นอนุมัติไปแล้วยังรอสายอนุมัติเดิม)
 */
export async function setCommissionSettings(ctx: CommissionsCtx, actor: MemberActor, input: unknown): Promise<CommissionSettings> {
  const sys = await enterHuman(ctx, actor);
  need(actor, "crm.settings.manage");
  const parsed = SettingsPatch.safeParse(input);
  if (!parsed.success) throw fail("VALIDATION", "ค่าตั้งคอมมิชชันไม่ถูกต้อง — เลือกเปิด/ปิด และฐานของกฎเป็น \"เมื่อรับเงิน\" หรือ \"เมื่อปิดการขาย\" เท่านั้น");
  const before = commissionSettingsOf(sys.settings);
  await setCrmCommissionSettings(scopeOf(ctx), parsed.data);
  const fresh = await loadSystem(ctx);
  const after = commissionSettingsOf(fresh?.settings ?? null);
  await audit(scopeOf(ctx), "crm.commission.settings", "AppSystem", ctx.systemId, { before, after }, actor.userId);
  return after;
}

// ═════════════════════════ ทางเข้าของคน — อนุมัติ / ไม่อนุมัติ ═════════════════════════

/** แถวที่ actor เห็น (ของตัวเอง หรือมองเห็นดีลนั้น) — ไม่เห็น = NOT_FOUND (X1: 404 ไม่ใช่ 403) */
async function visibleRow(ctx: Scope, actor: MemberActor, id: unknown): Promise<CrmCommission> {
  const rid = str(id);
  const row = rid ? await prisma.crmCommission.findFirst({ where: { id: rid, ...ctx } }) : null;
  if (!row) throw fail("NOT_FOUND", ROW_NOT_FOUND);
  if (row.userId === actor.userId || actor.role === "OWNER") return row;
  const vis = await visibleDealSet(ctx, actor, [row.dealId]);
  if (vis && !vis.has(row.dealId)) throw fail("NOT_FOUND", ROW_NOT_FOUND);
  return row;
}

/** null = เห็นทุกดีลของระบบ (OWNER) · ไม่งั้นชุด id ของดีลที่เห็น (จากชุดที่ถาม) */
async function visibleDealSet(ctx: Scope, actor: MemberActor, dealIds: string[]): Promise<Set<string> | null> {
  if (actor.role === "OWNER") return null;
  const ids = [...new Set(dealIds)];
  if (ids.length === 0) return new Set();
  const rows = await prisma.crmDeal.findMany({ where: { AND: [await dealWhere(ctx, actor), { id: { in: ids } }] }, select: { id: true }, take: ids.length });
  return new Set(rows.map((r) => r.id));
}

/**
 * อนุมัติด้วยมือ (คีย์ `crm.commission.approve`) — เพดาน `crm._maxCommissionApproveSatang` ของผู้กด (ไม่กรอก = ไม่จำกัด · OWNER ไม่จำกัด ·
 * ≤ เพดานรวมค่าเท่ากับ) · เกินเพดาน = APPROVAL_REQUIRED แถวไม่เปลี่ยน (ยังผูกคำขอเดิม) · ไม่มีสายอนุมัติ = แจ้งเจ้าของร้านครั้งเดียวต่อแถว (มติ ง)
 * อนุมัติแล้ว = ยกเลิกคำขอที่ค้าง (สายมาช้าไม่ทำอะไรซ้ำ) → ส่ง HR
 */
export async function approve(ctx: CommissionsCtx, actor: MemberActor, input: { id: string; reason?: string | null }): Promise<CommissionDto> {
  await enterHuman(ctx, actor);
  need(actor, "crm.commission.approve");
  const s = scopeOf(ctx);
  const row = await visibleRow(s, actor, input?.id);
  // มติผู้คุมงาน S2: ห้ามอนุมัติคอมมิชชันของตัวเอง (ยกเว้นเจ้าของร้าน)
  if (actor.role !== "OWNER" && row.userId === actor.userId) throw fail("FORBIDDEN", "อนุมัติคอมมิชชันของตัวเองไม่ได้ — ให้ผู้จัดการคนอื่นหรือเจ้าของร้านอนุมัติแทน");
  if (row.status !== "PENDING" || row.reversedOfId) throw fail("CONFLICT", DECIDED_MSG);
  const reason = str(input?.reason);
  if (reason && reason.length > COMMISSION_LIMITS.reasonMax) throw fail("VALIDATION", `เหตุผลยาวได้ไม่เกิน ${COMMISSION_LIMITS.reasonMax} ตัวอักษร`);
  if (actor.role !== "OWNER") {
    const cap = crmParam(actor, "crm._maxCommissionApproveSatang");
    if (cap !== undefined && row.amountSatang > BigInt(Math.max(0, Math.floor(cap)))) {
      if (!row.approvalRequestId) await escalateOnce(s, row);
      throw fail("APPROVAL_REQUIRED", OVER_CAP_MSG);
    }
  }
  if (!(await claimApproved(s, row.id, {}))) throw fail("CONFLICT", DECIDED_MSG);
  if (row.approvalRequestId) await (await approvalFacade()).cancelRequest({ tenantId: ctx.tenantId }, row.approvalRequestId).catch(() => false);
  await audit(s, "crm.commission.approve", "CrmCommission", row.id, { before: { status: "PENDING" }, after: { status: "APPROVED", amountSatang: num(row.amountSatang), reason } }, actor.userId);
  await handoffSafe(s, row.id);
  return (await toDtos(s, [await reload(s, row.id)]))[0]!;
}

/** "อนุมัติที่เลือก" — ทีละแถว (แต่ละแถวผ่านเพดาน/สถานะของตัวเอง) · แถวที่ไม่ผ่านบอกเหตุผลไทย ไม่ล้มทั้งชุด */
export async function approveMany(ctx: CommissionsCtx, actor: MemberActor, input: { ids: string[]; reason?: string | null }): Promise<{ done: number; failed: { id: string; code: string; message: string }[] }> {
  await enterHuman(ctx, actor);
  need(actor, "crm.commission.approve");
  const ids = [...new Set((input?.ids ?? []).filter((x): x is string => typeof x === "string" && !!x))].slice(0, 100);
  const out = { done: 0, failed: [] as { id: string; code: string; message: string }[] };
  for (const id of ids) {
    try {
      await approve(ctx, actor, { id, reason: input?.reason ?? null });
      out.done += 1;
    } catch (e) {
      if (!(e instanceof CommissionsError)) throw e;
      out.failed.push({ id, code: e.code, message: e.message });
    }
  }
  return out;
}

/** ไม่อนุมัติ — ต้องมีเหตุผล ≥ 5 ตัวอักษร (X9) · ยกเลิกคำขอที่ค้าง · audit พร้อมเหตุผล */
export async function reject(ctx: CommissionsCtx, actor: MemberActor, input: { id: string; reason: string }): Promise<CommissionDto> {
  await enterHuman(ctx, actor);
  need(actor, "crm.commission.approve");
  const s = scopeOf(ctx);
  const reason = str(input?.reason) ?? "";
  if (reason.length < COMMISSION_LIMITS.reasonMin) throw fail("VALIDATION", `ระบุเหตุผลที่ไม่อนุมัติอย่างน้อย ${COMMISSION_LIMITS.reasonMin} ตัวอักษร — พนักงานจะเห็นเหตุผลนี้`);
  if (reason.length > COMMISSION_LIMITS.reasonMax) throw fail("VALIDATION", `เหตุผลยาวได้ไม่เกิน ${COMMISSION_LIMITS.reasonMax} ตัวอักษร`);
  const row = await visibleRow(s, actor, input?.id);
  if (row.status !== "PENDING" || row.reversedOfId) throw fail("CONFLICT", DECIDED_MSG);
  const n = await prisma.crmCommission.updateMany({ where: { id: row.id, ...s, status: "PENDING" }, data: { status: "REJECTED", decidedAt: new Date(), note: reason.slice(0, COMMISSION_LIMITS.reasonMax) } });
  if (n.count !== 1) throw fail("CONFLICT", DECIDED_MSG);
  if (row.approvalRequestId) await (await approvalFacade()).cancelRequest({ tenantId: ctx.tenantId }, row.approvalRequestId).catch(() => false);
  await audit(s, "crm.commission.reject", "CrmCommission", row.id, { before: { status: "PENDING" }, after: { status: "REJECTED", reason } }, actor.userId);
  return (await toDtos(s, [await reload(s, row.id)]))[0]!;
}

/**
 * มติ ง + มติผู้คุมงาน S6: ไม่มีสายอนุมัติ (หรือเกินวงเงินของผู้กดและไม่มีคำขอ) ⇒ คง PENDING · แจ้งเจ้าของร้านด้วยเทมเพลต
 * `commission.pending` **ครั้งเดียวต่อแถว** (ref = CrmCommission/<id> — ตัวกันซ้ำของ notifyStaff) · ธง AuditLog `crm.commission.escalate`
 * ปักเฉพาะเมื่อแจ้งถึงอย่างน้อยหนึ่งช่องทางจริง (ถึงไม่ได้ = งานรายนาทีลองใหม่รอบหน้า)
 */
async function escalateOnce(ctx: Scope, row: CrmCommission): Promise<boolean> {
  if (await hasFlag(ctx, "crm.commission.escalate", row.id)) return true;
  try {
    const owners = await prisma.membership.findMany({ where: { tenantId: ctx.tenantId, role: "OWNER", acceptedAt: { not: null } }, select: { userId: true }, take: 20 });
    const { notifyStaff } = await import("./notifications");
    const r = await notifyStaff({ ...ctx, actorUserId: null }, { key: "commission.pending", refType: "CrmCommission", refId: row.id, userIds: owners.map((o) => o.userId) });
    // รีวิวรอบ 2: เรียกสำเร็จ = ถึงแล้ว แม้นับได้ 0 (ทุกคนปิดเรื่องนี้ไว้ หรือได้ใบของวันนี้ไปแล้ว) — ไม่วน advance ซ้ำตลอดไป
    await flagOnce(ctx, "crm.commission.escalate", row.id, { amountSatang: num(row.amountSatang), delivered: r.inApp + r.push + r.email + r.deferred });
    return true;
  } catch (e) {
    await warn(ctx, "แจ้งเจ้าของร้านเรื่องคอมมิชชันรออนุมัติไม่สำเร็จ — งานรายนาทีจะลองใหม่", e, { commissionId: row.id });
    return false;
  }
}

// ═════════════════════════ ทางเข้าของคน — อ่าน ═════════════════════════

export type CommissionFilter = { periodKey?: string | null; status?: string | null; userId?: string | null };

function whereOf(ctx: Scope, f: CommissionFilter | null | undefined): Prisma.CrmCommissionWhereInput {
  const periodKey = str(f?.periodKey);
  const status = str(f?.status);
  if (periodKey && !PERIOD_KEY_RE.test(periodKey)) throw fail("VALIDATION", "งวดต้องอยู่ในรูป ปี-เดือน เช่น 2026-09");
  if (status && !["PENDING", "APPROVED", "PAID", "REVERSED", "REJECTED"].includes(status)) throw fail("VALIDATION", "สถานะที่เลือกไม่อยู่ในรายการ");
  return { ...ctx, ...(periodKey ? { periodKey } : {}), ...(status ? { status: status as CommissionStatus } : {}) };
}

/** "คอมมิชชันของฉัน" — แถวของตัวเองในระบบนี้เท่านั้น (พนักงาน CRM v2 ทุกคนอ่านได้ ไม่ต้องมีคีย์) */
export async function mine(ctx: CommissionsCtx, actor: MemberActor, f: CommissionFilter = {}): Promise<CommissionDto[]> {
  await enterHuman(ctx, actor);
  const s = scopeOf(ctx);
  const rows = await prisma.crmCommission.findMany({ where: { ...whereOf(s, f), userId: actor.userId }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: COMMISSION_LIMITS.listMax });
  return toDtos(s, rows);
}

/** ยอดรวม "ของฉัน" ต่อสถานะ — ผลรวมใน SQL เป็น bigint (มติผู้คุมงาน S7 · R-E.8) ไม่ใช่รวมใน JS จาก 500 แถว */
export async function mineTotals(ctx: CommissionsCtx, actor: MemberActor, f: CommissionFilter = {}): Promise<{ pendingSatang: number; approvedSatang: number; paidSatang: number; reversedSatang: number; netSatang: number }> {
  await enterHuman(ctx, actor);
  const s = scopeOf(ctx);
  const w = whereOf(s, f);
  const periodKey = typeof w.periodKey === "string" ? w.periodKey : null;
  const status = typeof w.status === "string" ? w.status : null;
  const rows = await prisma.$queryRaw<{ st: string; s: string }[]>`
    SELECT c."status"::text AS st, SUM(c."amountSatang")::text AS s FROM "CrmCommission" c
    WHERE c."tenantId" = ${s.tenantId} AND c."systemId" = ${s.systemId} AND c."userId" = ${actor.userId}
      ${periodKey ? Prisma.sql`AND c."periodKey" = ${periodKey}` : Prisma.empty}
      ${status ? Prisma.sql`AND c."status"::text = ${status}` : Prisma.empty}
    GROUP BY 1`;
  const by = new Map(rows.map((r) => [r.st, BigInt(r.s ?? "0")]));
  const g = (k: string) => by.get(k) ?? ZERO;
  return {
    pendingSatang: Number(g("PENDING")),
    approvedSatang: Number(g("APPROVED")),
    paidSatang: Number(g("PAID")),
    reversedSatang: Number(g("REVERSED")),
    netSatang: Number(g("APPROVED") + g("PAID") + g("REVERSED")),
  };
}

/** ทุกแถวของระบบ (คีย์ `crm.commission.view`) — กรองด้วยการมองเห็นดีล (OWNER เห็นทั้งหมด · แถวของตัวเองเห็นเสมอ) */
export async function list(ctx: CommissionsCtx, actor: MemberActor, f: CommissionFilter = {}): Promise<CommissionDto[]> {
  await enterHuman(ctx, actor);
  need(actor, "crm.commission.view");
  const s = scopeOf(ctx);
  const userId = str(f?.userId);
  const rows = await prisma.crmCommission.findMany({ where: { ...whereOf(s, f), ...(userId ? { userId } : {}) }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: COMMISSION_LIMITS.listMax });
  return toDtos(s, await filterVisible(s, actor, rows));
}

/** รายการรออนุมัติ (คีย์ `crm.commission.approve`) — ภาพ 10 ขวา "คอมมิชชันรออนุมัติ" */
export async function pending(ctx: CommissionsCtx, actor: MemberActor): Promise<CommissionDto[]> {
  await enterHuman(ctx, actor);
  need(actor, "crm.commission.approve");
  const s = scopeOf(ctx);
  // มติผู้คุมงาน S2: ผู้อนุมัติที่ไม่ใช่เจ้าของร้านไม่เห็นแถวของตัวเองในรายการรออนุมัติ
  const own: Prisma.CrmCommissionWhereInput = actor.role === "OWNER" ? {} : { userId: { not: actor.userId } };
  const rows = await prisma.crmCommission.findMany({ where: { ...s, status: "PENDING", ...own }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], take: COMMISSION_LIMITS.listMax });
  return toDtos(s, (await filterVisible(s, actor, rows)).filter((r) => actor.role === "OWNER" || r.userId !== actor.userId));
}

async function filterVisible(ctx: Scope, actor: MemberActor, rows: CrmCommission[]): Promise<CrmCommission[]> {
  const vis = await visibleDealSet(ctx, actor, rows.map((r) => r.dealId));
  return vis === null ? rows : rows.filter((r) => r.userId === actor.userId || vis.has(r.dealId));
}

/**
 * รายงานต่อคนของงวด (คีย์ `crm.report.view` หรือ `crm.commission.view`) — ไม่มี commission.view = เห็นแถวของตัวเองเท่านั้น
 * ผลรวมคิดใน SQL เป็น bigint (R-E.8) · net = อนุมัติ + จ่ายแล้ว + ถอนคืน (ติดลบ) · count ไม่นับ REJECTED · เรียง net มาก→น้อย แล้ว userId
 */
export async function report(ctx: CommissionsCtx, actor: MemberActor, input: { periodKey: string }): Promise<CommissionReport> {
  await enterHuman(ctx, actor);
  need(actor, "crm.report.view", "crm.commission.view");
  const s = scopeOf(ctx);
  const periodKey = str(input?.periodKey);
  if (!periodKey || !PERIOD_KEY_RE.test(periodKey)) throw fail("VALIDATION", "เลือกงวดของรายงานในรูป ปี-เดือน เช่น 2026-09");
  const all = crmCan(actor, "crm.commission.view");
  let dealFilter = Prisma.empty;
  if (!all) {
    dealFilter = Prisma.sql`AND c."userId" = ${actor.userId}`;
  } else if (actor.role !== "OWNER") {
    const dealIds = (await prisma.crmCommission.findMany({ where: { ...s, periodKey }, distinct: ["dealId"], select: { dealId: true }, take: 10_000 })).map((r) => r.dealId);
    const vis = [...((await visibleDealSet(s, actor, dealIds)) ?? new Set<string>())];
    dealFilter = Prisma.sql`AND (c."userId" = ${actor.userId} OR c."dealId" = ANY(${vis}::text[]))`;
  }
  const sums = await prisma.$queryRaw<{ userId: string; st: string; s: string; c: number }[]>`
    SELECT c."userId", c."status"::text AS st, SUM(c."amountSatang")::text AS s, COUNT(*)::int AS c
    FROM "CrmCommission" c
    WHERE c."tenantId" = ${s.tenantId} AND c."systemId" = ${s.systemId} AND c."periodKey" = ${periodKey} ${dealFilter}
    GROUP BY 1, 2`;
  type Acc = { pending: bigint; approved: bigint; paid: bigint; reversed: bigint; count: number };
  const by = new Map<string, Acc>();
  for (const r of sums) {
    const cur = by.get(r.userId) ?? { pending: ZERO, approved: ZERO, paid: ZERO, reversed: ZERO, count: 0 };
    const v = BigInt(r.s ?? "0");
    if (r.st === "PENDING") cur.pending += v;
    else if (r.st === "APPROVED") cur.approved += v;
    else if (r.st === "PAID") cur.paid += v;
    else if (r.st === "REVERSED") cur.reversed += v;
    if (r.st !== "REJECTED") cur.count += Number(r.c);
    by.set(r.userId, cur);
  }
  const names = await userNames([...by.keys()]);
  const rows = [...by.entries()]
    .filter(([, a]) => a.count > 0)
    .map(([userId, a]) => ({ userId, a, net: a.approved + a.paid + a.reversed }))
    .sort((x, y) => (y.net > x.net ? 1 : y.net < x.net ? -1 : x.userId < y.userId ? -1 : x.userId > y.userId ? 1 : 0));
  const tot = rows.reduce((t, r) => ({ pending: t.pending + r.a.pending, approved: t.approved + r.a.approved, paid: t.paid + r.a.paid, reversed: t.reversed + r.a.reversed, count: t.count + r.a.count, net: t.net + r.net }), { pending: ZERO, approved: ZERO, paid: ZERO, reversed: ZERO, count: 0, net: ZERO });
  const outRows: CommissionReportRow[] = rows.map((r) => ({
    userId: r.userId,
    userName: names.get(r.userId) ?? null,
    pendingSatang: Number(r.a.pending),
    approvedSatang: Number(r.a.approved),
    paidSatang: Number(r.a.paid),
    reversedSatang: Number(r.a.reversed),
    netSatang: Number(r.net),
    count: r.a.count,
  }));
  return {
    periodKey,
    rows: outRows,
    totals: { pendingSatang: Number(tot.pending), approvedSatang: Number(tot.approved), paidSatang: Number(tot.paid), reversedSatang: Number(tot.reversed), netSatang: Number(tot.net), count: tot.count },
  };
}

// ───────────────────────── DTO ─────────────────────────

async function reload(ctx: Scope, id: string): Promise<CrmCommission> {
  const row = await prisma.crmCommission.findFirst({ where: { id, ...ctx } });
  if (!row) throw fail("NOT_FOUND", ROW_NOT_FOUND);
  return row;
}

async function userNames(ids: string[]): Promise<Map<string, string>> {
  const uniq = [...new Set(ids.filter(Boolean))];
  if (uniq.length === 0) return new Map();
  const rows = await prisma.user.findMany({ where: { id: { in: uniq } }, select: { id: true, name: true }, take: uniq.length });
  return new Map(rows.map((u) => [u.id, u.name ?? ""]));
}

/** AUDIT-CLASS X8: DTO มีแต่ id · จำนวนเงิน · ชื่อดีล · ชื่อกฎ · ชื่อพนักงาน — ไม่มีชื่อ/เบอร์/อีเมลของลูกค้า */
async function toDtos(ctx: Scope, rows: CrmCommission[]): Promise<CommissionDto[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const [deals, rules, names, revs] = await Promise.all([
    prisma.crmDeal.findMany({ where: { ...ctx, id: { in: [...new Set(rows.map((r) => r.dealId))] } }, select: { id: true, title: true, kind: true }, take: rows.length }),
    prisma.crmCommissionRule.findMany({ where: { ...ctx, id: { in: [...new Set(rows.map((r) => r.ruleId))] } }, select: { id: true, name: true }, take: rows.length }),
    userNames(rows.map((r) => r.userId)),
    prisma.crmCommission.findMany({ where: { ...ctx, reversedOfId: { in: ids } }, select: { reversedOfId: true }, take: ids.length * 2 }),
  ]);
  const dealBy = new Map(deals.map((d) => [d.id, d]));
  const ruleBy = new Map(rules.map((r) => [r.id, r.name]));
  const reversed = new Set(revs.map((r) => r.reversedOfId ?? ""));
  return rows.map((r) => {
    const deal = dealBy.get(r.dealId);
    const isReversed = reversed.has(r.id);
    return {
      id: r.id,
      dealId: r.dealId,
      dealTitle: deal?.title ?? null,
      ruleId: r.ruleId,
      ruleName: ruleBy.get(r.ruleId) ?? null,
      userId: r.userId,
      userName: names.get(r.userId) ?? null,
      amountSatang: Number(r.amountSatang),
      basisSatang: Number(r.basisSatang),
      basis: r.basis as CommissionBasis,
      status: r.status as CommissionStatus,
      periodKey: r.periodKey,
      refType: r.refType,
      refId: r.refId,
      reversedOfId: r.reversedOfId,
      approvalRequestId: r.approvalRequestId,
      hrPayAdjustmentId: r.hrPayAdjustmentId,
      payroll: payrollStateOf(r, isReversed),
      rewon: r.basis === "WON" && !r.reversedOfId && isReversed && deal?.kind === "WON" && (r.status === "APPROVED" || r.status === "PAID"),
      createdAt: r.createdAt.toISOString(),
      decidedAt: r.decidedAt ? r.decidedAt.toISOString() : null,
    };
  });
}
