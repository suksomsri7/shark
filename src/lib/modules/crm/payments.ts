// payments.ts — "ทางเดินเงิน" ของ CRM v2 (ใบ C2.7 · พิมพ์เขียว §7.2 · §9 แถว ACCOUNT/POS · มติ C3 · C29 · R-C.1/C.4/C.8 · R-E.7/E.8)
//
// ของที่ไฟล์นี้เป็นเจ้าของ
//   • `CrmDealPayment` — ตารางเงินของดีล (แถวเดียวต่อ (ดีล, ชนิด, id ของที่จ่าย) · unique คือ "ธง")
//   • ทางเข้าของสะพาน (ไม่มี actor คน · ผู้เรียกตัดสินประตูมาแล้ว): recordDocPayment · reverseDocPayment ·
//     flagDocumentVoided · countPosSale · reversePosSale
//   • ทางเข้าของคน (actor + คีย์ + การมองเห็น): linkSaleToDeal · openDealsForParty · dealForDoc · dealMoney
//
// 🔴 บทเรียนของรอบแก้ระบบสมาชิก (H5/M10) ที่เป็นทั้งข้อสอบของใบนี้ — AUDIT-CLASS X4:
//    **ปักธงก่อน แล้วค่อยบวก · ถอนคืนเฉพาะสิ่งที่เคยนับ · ตัวรับของ CRM เป็น "ของแถม" ที่ห้ามขวางบัญชี/บิล/แต้ม/ตรา**
//    ธง = แถว `CrmDealPayment` ใต้ unique `(dealId, refType, refId)` ⇒ ส่งซ้ำ/ยิงพร้อมกันกี่โพรเซส ก็ใส่ได้ครั้งเดียว
// 🔴 AUDIT-CLASS X3 (ลำดับล็อกของทั้งระบบ · หัวไฟล์ deals.ts): advisory lock ต่อดีล → แถวบริษัท → แถวผู้ติดต่อ → แถวดีล
//    ⇒ ไม่ย้อนลำดับกับ `deals.moveCore` / `deals.issueInvoice` (ทั้งคู่ล็อกบริษัทก่อนดีลเหมือนกัน)
// 🔴 AUDIT-CLASS X1: ทุกคำสั่งผูกร้าน + ระบบ CRM ที่ resolve ใหม่ (id จาก payload/ไคลเอนต์เชื่อไม่ได้) · มองไม่เห็น = NOT_FOUND
// 🔴 AUDIT-CLASS X8: event/log/audit ของไฟล์นี้มีแต่ id กับจำนวนสตางค์ — ไม่มีชื่อ/เบอร์/อีเมล/ชื่อเอกสาร
// 🔴 AUDIT-CLASS X9: การเปลี่ยนเงินทุกครั้งมีแถว audit (ทางอัตโนมัติ = actorType SYSTEM)
// 🔴 เงิน = สตางค์จำนวนเต็มเสมอ (BigInt ในฐาน) · ผลรวมข้ามแถวคำนวณที่ฐานข้อมูล (R-E.8) ไม่สะสมใน JS
// 🔴 ใบนี้ไม่เพิ่มคอลัมน์/ตาราง/ชนิด event ใด ๆ (R-C.1 · C29) — ธง "เอกสารถูกยกเลิก" = แท็กของดีล + กิจกรรม AUTO 1 ใบ

import { Prisma } from "@prisma/client";
import type { CrmDeal } from "@prisma/client";
import { writeAudit } from "@/lib/core/audit";
import { emitOutbox } from "@/lib/core/outbox";
import { logOps } from "@/lib/core/ops";
import type { MemberActor } from "@/lib/modules/member";
import { prisma } from "./db";
import { dealWhere } from "./where";
import { crmCan, crmForbiddenMessage } from "./access";
import * as companies from "./companies";
import { recordSystemActivityInTx, auditSystemActivity } from "./activities";
import { lifecycleAfterDealWon } from "./rules";
import { getCrmSettings } from "./settings";
import { crmUiVersion, CrmV2DisabledError } from "./ui-version";
import {
  ALL_MONEY_REF_TYPES,
  DEAL_VOIDED_TAG,
  DOC_SETTLE_REF_TYPE,
  MONEY_MAX_SATANG,
  MONEY_REF_TYPES,
  MONEY_STATUSES,
  PaymentsError,
  POS_LINK_LIMIT,
  isUsableSatang,
  type DealForDoc,
  type DealMoney,
  type DealMoneyRow,
  type MoneyRefType,
  type MoneyStatus,
  type OpenDealOption,
} from "./payments-shared";

export {
  ALL_MONEY_REF_TYPES,
  DEAL_VOIDED_TAG,
  DOC_SETTLE_REF_TYPE,
  MONEY_MAX_SATANG,
  MONEY_REF_TYPES,
  MONEY_STATUSES,
  POS_LINK_LIMIT,
  PaymentsError,
  isUsableSatang,
};
export type { DealForDoc, DealMoney, DealMoneyRow, MoneyRefType, MoneyStatus, OpenDealOption };

/**
 * 🔴 มติรอบ 2 (B2) — **ประตูห้ามการ "นับเข้า" ได้ แต่ห้ามการ "ถอนคืน" ไม่ได้**
 *    ร้านที่เคยนับเงินไว้แล้วปิดสะพาน/สลับกลับ v1 ต้องยังถอนคืนได้ ไม่งั้นยอดของดีลค้างเกินจริงตลอดกาล
 *    ⇒ `recordDocPayment` · `onInvoiceFullyPaid` · `countPosSale` · `linkSaleToDeal` · `openDealsForParty` ผ่าน `canCount`
 *      ส่วน `reverseDocPayment` · `reversePosSale` · `flagDocumentVoided` **ไม่มีประตู** (ยังผูกร้าน+ระบบเหมือนเดิม)
 * 🔴 มติรอบ 2 (SF-5) — ชนิดเอกสารที่ "รับชำระแล้วนับเข้าดีลได้": ใบแจ้งหนี้ + ใบรับมัดจำเท่านั้น
 *    ใบวางบิล (BILLING_NOTE) รวมหลายใบแจ้งหนี้ของหลายดีลได้ ⇒ C2.7 ไม่เดา บันทึก WARN ไว้ให้ใบ C3 ทำต่อ
 */
const PAYABLE_DOC_TYPES = new Set(["INVOICE", "DEPOSIT_RECEIPT"]);
const UNATTRIBUTED_DOC_TYPES = new Set(["BILLING_NOTE"]);

const accountFacade = () => import("@/lib/modules/account");

type Tx = Prisma.TransactionClient;
export type MoneyCtx = { tenantId: string; systemId: string };
const TX_OPTS = { maxWait: 20_000, timeout: 40_000 } as const;
/** ศูนย์ชนิด BigInt (target ของโปรเจกต์ต่ำกว่า ES2020 ⇒ เขียนลิเทอรัล 0n ตรง ๆ ไม่ได้) */
const ZERO = BigInt(0);
const NOT_FOUND_MSG = "ไม่พบดีลนี้ในระบบ CRM ที่เปิดอยู่ (อาจถูกลบหรืออยู่คนละระบบ) — รีเฟรชหน้าแล้วลองใหม่";
const SALE_NOT_FOUND_MSG = "ไม่พบบิลใบนี้ในร้านที่เปิดอยู่ — รีเฟรชหน้าขายแล้วลองใหม่";
const CLOSED_MSG = "ดีลนี้ปิดแล้ว (ชนะ/แพ้) จึงผูกบิลใหม่ไม่ได้ — ให้ผู้จัดการเปิดดีลใหม่ก่อนถ้าต้องการผูก";
/** มติรอบ 2 (B1): เงินก้อนเดียวห้ามนับสองดีล — ข้อความบอกทางออก ไม่โทษคนกด */
const SALE_TAKEN_MSG = "บิลใบนี้ถูกผูกกับดีลอื่นไปแล้ว — ถ้าผูกผิดดีล ให้ยกเลิกการผูกที่ดีลนั้นก่อนแล้วค่อยผูกใหม่";
/** มติรอบ 2 (N3): บิลบัตรกำนัล = รับเงินล่วงหน้า ไม่ใช่รายได้ของดีล (โมดูลบัตรกำนัลลงบัญชีเอง) */
const GIFTCARD_MSG = "บิลขาย/เติมบัตรกำนัลยังไม่นับเป็นเงินที่รับของดีล — ผูกดีลกับบิลที่เป็นการขายสินค้า/บริการแทน";

const fail = (code: ConstructorParameters<typeof PaymentsError>[0], message: string) => new PaymentsError(code, message);

/**
 * 🔴 AUDIT-CLASS X4 · หัวใจของ "ปักธงก่อนแล้วค่อยบวก": ปักธงด้วย **คำสั่งเดียวที่ชนไม่ได้**
 *    `createMany({ skipDuplicates: true })` = `INSERT … ON CONFLICT DO NOTHING` ⇒ `count` บอกตรง ๆ ว่า
 *    "แถวนี้เป็นของเรา" (1) หรือ "มีคนปักไปแล้ว" (0) — ทั้งสองกรณี **ธุรกรรมยังใช้งานต่อได้**
 * 🔴 ทำไมห้ามจับ P2002 แล้วสั่งต่อ: Postgres ทำให้ทั้งธุรกรรมเข้าสถานะ aborted ทันทีที่คำสั่งใดละเมิด unique
 *    ("current transaction is aborted, commands ignored until end of transaction block") ⇒ การบวกเงิน/แถว audit
 *    ที่สั่งต่อจากนั้นจะตายทั้งชุด ทั้งที่แค่แพ้การแข่งกันปักธง (เหตุผลเดียวกับ `emitOutboxMany` ที่ core/outbox.ts)
 *    แบบนี้จึงไม่ต้องมี retry/ไม่ต้องเช็คก่อนเขียน — ผลของการชนกันถูกตัดสินในคำสั่งเดียวนั้นเอง
 * คืน true = แถวนี้เพิ่งถูกสร้างโดยเราในธุรกรรมนี้
 */
async function flagRowInTx(
  tx: Tx,
  ctx: MoneyCtx,
  row: { dealId: string; refType: MoneyRefType; refId: string; satang: bigint; status: MoneyStatus; countedAt?: Date | null },
): Promise<boolean> {
  const ins = await tx.crmDealPayment.createMany({
    data: [{ ...scopeOf(ctx), dealId: row.dealId, refType: row.refType, refId: row.refId, satang: row.satang, status: row.status, countedAt: row.countedAt ?? null }],
    skipDuplicates: true,
  });
  return ins.count === 1;
}
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const scopeOf = (ctx: MoneyCtx) => ({ tenantId: ctx.tenantId, systemId: ctx.systemId });
const num = (v: bigint | number | null | undefined): number => (v === null || v === undefined ? 0 : Number(v));

// ───────────────────────── ผลลัพธ์ของทางเข้าสะพาน ─────────────────────────

export type RecordDocPaymentResult = {
  counted: boolean;
  dealId: string | null;
  /** `DOC_TYPE` = มติรอบ 2 (SF-5): เอกสารชนิดนี้ยังไม่ผูกเงินเข้าดีลในใบนี้ (ใบวางบิล ฯลฯ) */
  skipped?: "V1" | "NO_DEAL" | "DUPLICATE" | "NOT_FOUND" | "DOC_TYPE";
};
export type ReverseResult = { reversed: boolean; dealId: string | null };
export type CountPosSaleResult = { counted: boolean; dealId: string | null };
export type LinkSaleResult = { ok: true; paymentId: string; counted: boolean };

// ───────────────────────── ตัวช่วยพื้นฐาน ─────────────────────────

/** AUDIT-CLASS X1: ctx.systemId ต้องเป็นระบบ **CRM** ของร้านนี้จริง (ระบบร้านอื่น/ชนิดอื่น = ไม่พบ) */
async function resolveSystem(ctx: MoneyCtx): Promise<void> {
  const ok =
    typeof ctx?.systemId === "string" && typeof ctx?.tenantId === "string" && ctx.systemId && ctx.tenantId
      ? await prisma.appSystem.findFirst({ where: { id: ctx.systemId, tenantId: ctx.tenantId, type: "CRM" }, select: { id: true } })
      : null;
  if (!ok) throw fail("NOT_FOUND", "ไม่พบระบบ CRM นี้ในร้านที่เปิดอยู่ — รีเฟรชหน้าแล้วลองใหม่");
}

/** ประตูรุ่นหน้าจอ (R-E.14): ร้านที่ยังอยู่ v1 ไม่มีหน้าจอ/การอ่านของ v2 (และไม่ไล่เก็บย้อนหลังตอนเปิด v2 — มติผู้คุมงาน C2.7 ข้อ 6) */
async function isV2(ctx: MoneyCtx): Promise<boolean> {
  return (await crmUiVersion(ctx)) === 2;
}

/**
 * ประตูของ "การนับเงินเข้า" (มติรอบ 2 · B2): ต้องเป็น v2 **และ** เปิดสะพาน — ตรงกับ `bridgeOpen` ของ crm-bridges
 * 🔴 ไม่มีคู่ตรงข้าม: การถอนคืนไม่เรียกฟังก์ชันนี้ (ประตูปิดแล้วเงินที่เคยนับต้องถอนได้เสมอ)
 */
async function canCount(ctx: MoneyCtx): Promise<boolean> {
  try {
    const s = await getCrmSettings(ctx);
    return s.uiVersion === 2 && s.bridgesEnabled === true;
  } catch {
    return false;
  }
}

function assertActor(actor: MemberActor | null | undefined): asserts actor is MemberActor {
  if (!actor || actor.role === "CUSTOMER") throw fail("NOT_FOUND", NOT_FOUND_MSG);
}

function need(actor: MemberActor, key: string): void {
  if (!crmCan(actor, key)) throw fail("FORBIDDEN", crmForbiddenMessage(key));
}

async function audit(ctx: MoneyCtx, action: string, targetId: string, body: { before?: unknown; after?: unknown }, actorUserId: string | null = null): Promise<void> {
  await writeAudit({ tenantId: ctx.tenantId, actorId: actorUserId, actorType: actorUserId ? "USER" : "SYSTEM", action, targetType: "CrmDeal", targetId, ...body });
}

/** AUDIT-CLASS X4: กุญแจ `crm.deal.updated#<dealId>#<seq>` (R-C.8) · ยิงใน tx ของการเขียนเสมอ · payload = id ล้วน (X8) */
async function emitMoneyUpdate(tx: Tx, ctx: MoneyCtx, dealId: string, seq: string, payload: Record<string, unknown>): Promise<void> {
  await emitOutbox(tx, {
    tenantId: ctx.tenantId,
    systemId: ctx.systemId,
    type: "crm.deal.updated",
    idempotencyKey: `crm.deal.updated#${dealId}#${seq}`,
    payload: { dealId, changedKeys: ["paidSatang"], ...payload },
  });
}

/** advisory lock ต่อดีลของ "ทางเดินเงิน" — ทุกเส้นทางที่แตะ paidSatang ถือใบนี้ใบเดียว (ข้ามโพรเซสก็เรียงคิวที่ฐาน) */
async function lockMoney(tx: Tx, dealId: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`crm:deal-money:${dealId}`}, 0))`;
}

/**
 * มติรอบ 2 (B1): advisory lock ต่อ **"ของที่จ่ายมา"** (บิลหน้าร้าน/การรับชำระ) — ไม่ใช่ต่อดีล
 * 🔴 unique `(dealId, refType, refId)` กันซ้ำได้แค่ "ดีลเดียวกัน" ⇒ ผูกบิลใบเดียวกันเข้าสองดีลพร้อมกัน
 *    ผ่าน unique ทั้งคู่ = เงินก้อนเดียวถูกนับสองรอบ · ล็อกใบนี้คือสิ่งที่ทำให้ "ด่านข้ามดีล" ตัดสินได้จริง
 * 🔴 ลำดับล็อกของทางเดินเงิน: ref → ดีล → บริษัท → ผู้ติดต่อ → แถวดีล (ห้ามสลับ ไม่งั้น deadlock)
 */
async function lockRef(tx: Tx, refType: string, refId: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`crm:money-ref:${refType}:${refId}`}, 0))`;
}

async function lockRows(tx: Tx, ctx: MoneyCtx, deal: { id: string; companyId: string | null; contactId: string }): Promise<CrmDeal | null> {
  await companies.lockCompanyRowsInTx(tx, { ...scopeOf(ctx), actorUserId: null }, [deal.companyId]);
  await tx.$queryRaw`SELECT "id" FROM "CrmContact" WHERE "id" = ${deal.contactId} AND "tenantId" = ${ctx.tenantId} FOR UPDATE`;
  await tx.$queryRaw`SELECT "id" FROM "CrmDeal" WHERE "id" = ${deal.id} AND "tenantId" = ${ctx.tenantId} AND "systemId" = ${ctx.systemId} FOR UPDATE`;
  return tx.crmDeal.findFirst({ where: { ...scopeOf(ctx), id: deal.id } });
}

// ───────────────────────── หาดีลจากเอกสารบัญชี (สายเอกสาร) ─────────────────────────

/**
 * AUDIT-CLASS X1: เอกสารใบนี้เป็นของดีลไหนในระบบ CRM นี้ — event ของบัญชีไม่มี partyId/sourceDocId (COMMON)
 * จึงไล่ตาม "สายเอกสาร" ผ่าน facade บัญชี: ใบนั้นเอง → `sourceDocId` ของมัน → ต่อไปอีกไม่เกิน 6 ทอด
 * (ใบเสร็จ/ใบกำกับที่ออกจากใบแจ้งหนี้ของดีล จึงนับเข้าดีลเดียวกัน) · ไม่พบ = null (ไม่ใช่ error)
 */
async function dealIdForDoc(ctx: MoneyCtx, docId: string): Promise<string | null> {
  const acc = await accountFacade();
  let cur: string | null = docId;
  for (let hop = 0; hop < 6 && cur; hop += 1) {
    const hits = await prisma.crmDeal.findMany({
      where: { ...scopeOf(ctx), OR: [{ invoiceDocId: cur }, { quotationDocId: cur }] },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: 5,
      select: { id: true },
    });
    const hit = hits[0] ?? null;
    // มติรอบ 2 (SF-4): เอกสารใบเดียวถูกอ้างโดยหลายดีล = ข้อมูลผิดรูปที่คนต้องมาแก้ — "ดีลที่เก่าที่สุดได้เงิน" เหมือนเดิม
    //   แต่ต้องดังพอให้เห็น ⇒ WARN (id ล้วน · AUDIT-CLASS X8) ทุกครั้งที่จับคู่ได้มากกว่าหนึ่ง
    if (hits.length > 1) {
      await logOps("WARN", "crm", `เอกสารบัญชีใบเดียวถูกผูกกับดีลมากกว่าหนึ่ง — นับเงินให้ดีลที่เก่าที่สุด (เอกสาร ${cur})`, {
        tenantId: ctx.tenantId,
        detail: `systemId=${ctx.systemId} documentId=${cur} dealIds=${hits.map((h) => h.id).join(",")} counted=${hit?.id ?? "-"}`,
      }).catch(() => undefined);
    }
    if (hit) return hit.id;
    const info: { docId: string; sourceDocId: string | null; refType: string | null; refId: string | null; refSystemId: string | null } | null =
      await acc.docLinkInfo(ctx.tenantId, cur).catch(() => null);
    if (!info) return null;
    if (info.refType === "CrmDeal" && info.refId && info.refSystemId === ctx.systemId) {
      const byRef = await prisma.crmDeal.findFirst({ where: { ...scopeOf(ctx), id: info.refId }, select: { id: true } });
      if (byRef) return byRef.id;
    }
    cur = info.sourceDocId;
  }
  return null;
}

/**
 * มติรอบ 2 (SF-1): แถวเงินไหน "เป็นของเอกสารใบนี้" — ต้องรู้ให้แน่ก่อนถอนคืน ไม่งั้นยกเลิกใบแจ้งหนี้
 * ไปถอนเงินมัดจำของอีกใบด้วย · อ่านผ่าน facade บัญชีเท่านั้น (`docLinkInfo` → systemId ของเอกสาร → `listDocPayments`)
 * คืน: id ของการรับชำระทั้งหมดของเอกสารใบนั้น (รวมที่ถูกยกเลิกไปแล้ว — เราตัดสินจากสถานะแถวของเราเอง)
 */
async function paymentIdsOfDoc(tenantId: string, documentId: string): Promise<string[]> {
  const acc = await accountFacade();
  const info = await acc.docLinkInfo(tenantId, documentId).catch(() => null);
  if (!info) return [];
  const rows = await acc.listDocPayments(tenantId, info.systemId, info.docId).catch(() => []);
  return rows.map((r: { id: string }) => r.id);
}

/** ยอดเต็มของ "เอกสารหลัก" ของดีล (ใบแจ้งหนี้ก่อน ไม่งั้นใบเสนอราคา) — R-E.7 ใช้เป็น `wonValueSatang` ฝั่งเอกสาร */
async function anchorGrandOf(ctx: MoneyCtx, deal: { invoiceDocId: string | null; quotationDocId: string | null }): Promise<number> {
  const anchor = deal.invoiceDocId ?? deal.quotationDocId;
  if (!anchor) return 0;
  const info = await (await accountFacade()).docLinkInfo(ctx.tenantId, anchor).catch(() => null);
  const grand = info ? Number(info.grandTotal) : 0;
  return Number.isFinite(grand) ? Math.max(0, Math.round(grand)) : 0;
}

/**
 * R-E.7: `wonValueSatang` = Σ ยอดเต็มของ "ของที่จ่ายเงินมา" ที่ถูกนับให้ดีลนี้แล้ว
 *   • ฝั่งเอกสาร = ยอดเต็มของเอกสารหลักของดีล (นับครั้งเดียว แม้จ่ายหลายงวด/มีใบเสร็จต่อท้าย)
 *   • ฝั่งหน้าร้าน = Σ ยอดบิล POS ที่ถูกนับ
 * ไม่มีแถวที่ถูกนับเลย = null (กลับไปเป็น "ยังไม่มีมูลค่าที่รับจริง") — คำนวณในธุรกรรมเดียวกับการเขียนเสมอ
 */
async function wonValueInTx(db: Tx | typeof prisma, ctx: MoneyCtx, dealId: string, anchorGrand: number): Promise<bigint | null> {
  const rows = await db.crmDealPayment.findMany({ where: { ...scopeOf(ctx), dealId, status: "COUNTED" }, select: { refType: true, refId: true } });
  if (rows.length === 0) return null;
  // ฝั่งเอกสารนับ "ยอดเต็มของเอกสารหลัก" ครั้งเดียว — ทั้งแถวรับชำระและแถวปิดยอด (SF-2) คือเงินของเอกสารใบเดียวกัน
  let won = rows.some((r) => r.refType === "PAYMENT" || r.refType === DOC_SETTLE_REF_TYPE) ? BigInt(anchorGrand) : ZERO;
  const saleIds = [...new Set(rows.filter((r) => r.refType === "POS_SALE").map((r) => r.refId))];
  if (saleIds.length > 0) {
    const sales = await db.posSale.findMany({ where: { tenantId: ctx.tenantId, id: { in: saleIds } }, select: { grandTotalSatang: true } });
    for (const sale of sales) won += BigInt(Math.max(0, sale.grandTotalSatang));
  }
  return won;
}

/**
 * R-E.7 สำหรับผู้เรียกนอกธุรกรรม (`deals.moveCore`) — มูลค่าที่ "รับเงินจริง" ของดีล หรือ null เมื่อยังไม่มีเงินเข้าเลย
 * อ่านยอดเอกสารผ่าน facade บัญชี (ห้ามอ่านตารางของโมดูลบัญชีเอง) · ยอดบิล POS อ่านเพื่อคิดเงินเท่านั้น
 */
export async function countedWonValueOf(ctx: MoneyCtx, dealId: string, tx?: Tx): Promise<bigint | null> {
  const did = str(dealId);
  if (!did) return null;
  // 🔴 มติรอบ 2 (SF-3): ผู้เรียกที่ถือล็อกของดีลอยู่ (`deals.moveCore`) ต้องส่ง `tx` เข้ามา แล้วอ่าน "ในล็อก"
  //    ไม่งั้นอ่านก่อนล็อกแล้วเขียนทีหลัง = ค่าที่เพิ่งนับเข้าระหว่างนั้นถูกทับเป็น null (TOCTOU)
  const db: Tx | typeof prisma = tx ?? prisma;
  const deal = await db.crmDeal.findFirst({ where: { ...scopeOf(ctx), id: did }, select: { invoiceDocId: true, quotationDocId: true } });
  if (!deal) return null;
  const anchorGrand = await anchorGrandOf(ctx, deal);
  return wonValueInTx(db, ctx, did, anchorGrand);
}

/** WON/รับเงินแล้ว ⇒ lifecycle ของผู้ติดต่อเป็น CUSTOMER (กติกาเดียวกับ `deals.moveCore` · ไม่มีวันถอยหลัง) */
async function advanceLifecycleInTx(tx: Tx, ctx: MoneyCtx, contactId: string): Promise<void> {
  const c = await tx.crmContact.findFirst({ where: { id: contactId, tenantId: ctx.tenantId }, select: { id: true, lifecycleStage: true } });
  if (!c) return;
  const next = lifecycleAfterDealWon(c.lifecycleStage);
  if (next !== c.lifecycleStage) await tx.crmContact.updateMany({ where: { id: c.id, tenantId: ctx.tenantId }, data: { lifecycleStage: next } });
}

/** ผลข้างเคียงร่วมของทุกเส้นทางที่เปลี่ยนยอดเงินของดีล (ในธุรกรรมเดียวกับการเปลี่ยน) */
async function afterMoneyChangedInTx(
  tx: Tx,
  ctx: MoneyCtx,
  deal: CrmDeal,
  opts: { deltaSatang: bigint; anchorGrand: number; lifecycle: boolean },
): Promise<void> {
  if (opts.deltaSatang !== ZERO) {
    await tx.crmDeal.update({
      where: { id: deal.id },
      data: { paidSatang: opts.deltaSatang > ZERO ? { increment: opts.deltaSatang } : { decrement: -opts.deltaSatang }, lastActivityAt: new Date() },
    });
  }
  const won = await wonValueInTx(tx, ctx, deal.id, opts.anchorGrand);
  // 🔴 `wonValueSatang` เป็นคอลัมน์ที่ **ใบ C1.5 ปกครอง** (ข้อสอบ C1.5-S0.8: เขียนได้จาก `crm/deals*.ts` เท่านั้น)
  //    ⇒ ทางเดินเงินสั่งผ่านประตูของ deals.ts ในธุรกรรมของตัวเอง (dynamic import — deals.ts ก็เรียก payments.ts แบบเดียวกัน)
  await (await import("./deals")).setWonValueInTx(tx, ctx, deal.id, won);
  if (opts.lifecycle) await advanceLifecycleInTx(tx, ctx, deal.contactId);
  await companies.recomputeDealCachesInTx(tx, { ...scopeOf(ctx), actorUserId: null }, [deal.companyId]);
}

// ═════════════════════════ ทางเข้าของสะพาน (ไม่มี actor คน) ═════════════════════════

/**
 * `account.payment.recorded` → นับเงินงวดนี้ให้ดีลที่เอกสารใบนั้นสังกัด
 * AUDIT-CLASS X4 (บทเรียน H5/M10): **ปักธงก่อน** — INSERT `CrmDealPayment(dealId,"PAYMENT",paymentId)` ใต้ unique
 *   ⇒ ใส่ได้ครั้งเดียวเท่านั้น · ใส่ติดแล้วจึงบวก `paidSatang` / คิด `wonValueSatang` / เลื่อน lifecycle / แคชบริษัท ใน tx เดียวกัน
 * AUDIT-CLASS X6: payload ที่เชื่อไม่ได้ (ติดลบ · ทศนิยม · มหึมา · id ว่าง) = ปฏิเสธ ไม่เขียนอะไรเลย
 */
export async function recordDocPayment(
  ctx: MoneyCtx,
  input: { documentId: string; paymentId: string; amountSatang: number; docType?: string },
  opts: { now?: Date } = {},
): Promise<RecordDocPaymentResult> {
  const documentId = str(input?.documentId);
  const paymentId = str(input?.paymentId);
  if (!documentId || !paymentId) throw fail("VALIDATION", "ข้อมูลการรับชำระไม่ครบ (ไม่มีเลขเอกสารหรือเลขการชำระ) — ระบบจึงยังไม่บันทึกเข้าดีล");
  if (!isUsableSatang(input?.amountSatang)) throw fail("VALIDATION", "ยอดรับชำระที่ส่งมาไม่ใช่จำนวนเต็มสตางค์ที่ใช้ได้ — ระบบจึงยังไม่บันทึกเข้าดีล");
  await resolveSystem(ctx);
  if (!(await canCount(ctx))) return { counted: false, dealId: null, skipped: "V1" };
  // มติรอบ 2 (SF-5): ชนิดเอกสารมาจาก facade บัญชี ไม่ใช่จาก payload (X1 — id/ชนิดที่ส่งมาเชื่อไม่ได้)
  const info = await (await accountFacade()).docLinkInfo(ctx.tenantId, documentId).catch(() => null);
  const docType = String(info?.docType ?? input?.docType ?? "");
  if (UNATTRIBUTED_DOC_TYPES.has(docType)) {
    // ใบวางบิลใบเดียวเก็บเงินหลายใบแจ้งหนี้ (หลายดีล) ⇒ เดาไม่ได้ว่าเงินก้อนนี้เป็นของดีลไหน — ปล่อยให้คนตัดสิน (หนี้ของใบ C3)
    await logOps("WARN", "crm", `รับชำระจากใบวางบิล — ยังไม่นับเข้าดีลในใบ C2.7 (เอกสาร ${documentId})`, {
      tenantId: ctx.tenantId,
      detail: `systemId=${ctx.systemId} documentId=${documentId} paymentId=${paymentId} docType=${docType} satang=${input.amountSatang}`,
    }).catch(() => undefined);
    return { counted: false, dealId: null, skipped: "DOC_TYPE" };
  }
  if (docType && !PAYABLE_DOC_TYPES.has(docType)) return { counted: false, dealId: null, skipped: "DOC_TYPE" };
  const dealId = await dealIdForDoc(ctx, documentId);
  if (!dealId) return { counted: false, dealId: null, skipped: "NO_DEAL" };
  const pre = await prisma.crmDeal.findFirst({ where: { ...scopeOf(ctx), id: dealId } });
  if (!pre) return { counted: false, dealId: null, skipped: "NOT_FOUND" };
  const anchorGrand = await anchorGrandOf(ctx, pre);
  const now = opts.now ?? new Date();

  const out = await prisma.$transaction(async (tx) => {
    await lockMoney(tx, dealId);
    const deal = await lockRows(tx, ctx, pre);
    if (!deal) return { counted: false as const, skipped: "NOT_FOUND" as const };
    // ธงคือแถวใต้ unique `(dealId, refType, refId)` — ปักด้วยคำสั่งเดียวที่ชนไม่ได้ (ดู `flagRowInTx`)
    const mine = await flagRowInTx(tx, ctx, { dealId: deal.id, refType: "PAYMENT", refId: paymentId, satang: BigInt(input.amountSatang), status: "COUNTED", countedAt: now });
    if (!mine) return { counted: false as const, skipped: "DUPLICATE" as const };
    await afterMoneyChangedInTx(tx, ctx, deal, { deltaSatang: BigInt(input.amountSatang), anchorGrand, lifecycle: true });
    await emitMoneyUpdate(tx, ctx, deal.id, `pay-${paymentId}`, { paymentId, documentId, satang: input.amountSatang });
    return { counted: true as const, skipped: undefined };
  }, TX_OPTS);

  if (out.counted) {
    await audit(ctx, "crm.deal.payment", dealId, { after: { refType: "PAYMENT", refId: paymentId, documentId, satang: input.amountSatang } });
    await afterCounted(ctx, dealId);
  }
  return { counted: out.counted, dealId, ...(out.skipped ? { skipped: out.skipped } : {}) };
}

/**
 * `account.invoice.paid` → เงินงวดต่าง ๆ เข้ามาทาง `account.payment.recorded` แล้ว — ที่นี่ทำสองอย่าง
 *  1. 🔴 มติรอบ 2 (SF-2) **ปิดยอดเอกสาร**: `amountSatang` ของ event รับชำระคือ "เงินเข้าจริง" ซึ่ง **ไม่รวมภาษีหัก ณ ที่จ่าย**
 *     แต่บัญชีตัดหนี้ด้วย เงิน+WHT และประกาศว่าใบแจ้งหนี้ชำระครบ ⇒ ถ้าไม่เติมส่วนต่าง ดีลจะ "ได้เงินไม่ครบ" ตลอดไป
 *     และ `autoWonOnPaid` ของใบที่ลูกค้าหัก 3% จะไม่มีวันทำงาน · เติมเป็นแถวเดียว `DOC_SETTLE` ต่อเอกสาร (unique = กันซ้ำ)
 *  2. ตรวจ "จ่ายครบแล้วชนะอัตโนมัติไหม" (pipeline.autoWonOnPaid) — ส่งซ้ำกี่รอบก็ไม่มีผลข้างเคียง
 * ประตู: เป็นการ "นับเข้า" ⇒ ผ่าน `canCount` (มติรอบ 2 · B2)
 */
export async function onInvoiceFullyPaid(ctx: MoneyCtx, input: { documentId: string }): Promise<{ dealId: string | null; settledSatang: number }> {
  const documentId = str(input?.documentId);
  if (!documentId) return { dealId: null, settledSatang: 0 };
  await resolveSystem(ctx);
  if (!(await canCount(ctx))) return { dealId: null, settledSatang: 0 };
  const info = await (await accountFacade()).docLinkInfo(ctx.tenantId, documentId).catch(() => null);
  if (!info) return { dealId: null, settledSatang: 0 };
  const dealId = await dealIdForDoc(ctx, documentId);
  if (!dealId) return { dealId: null, settledSatang: 0 };
  const pre = await prisma.crmDeal.findFirst({ where: { ...scopeOf(ctx), id: dealId } });
  if (!pre) return { dealId: null, settledSatang: 0 };
  const grand = Math.max(0, Math.round(Number(info.grandTotal) || 0));
  const paidTotal = Math.max(0, Math.round(Number(info.paidTotal) || 0));
  // ปิดยอดได้ก็ต่อเมื่อ "บัญชีเองบอกว่าครบแล้ว" (ส่ง event ซ้ำหลังยกเลิกการชำระ = paidTotal ลดลง ⇒ ไม่ปิดยอด)
  const settleable = grand > 0 && paidTotal >= grand && PAYABLE_DOC_TYPES.has(String(info.docType));
  let settled = 0;
  if (settleable) {
    const payIds = await paymentIdsOfDoc(ctx.tenantId, documentId);
    const anchorGrand = await anchorGrandOf(ctx, pre);
    settled = await prisma.$transaction(async (tx) => {
      await lockRef(tx, DOC_SETTLE_REF_TYPE, documentId);
      await lockMoney(tx, dealId);
      const deal = await lockRows(tx, ctx, pre);
      if (!deal) return 0;
      // เงินของ "เอกสารใบนี้" ที่ดีลนับไปแล้ว = แถวรับชำระของใบนี้ + แถวปิดยอดของใบนี้ (ไม่ใช่ทั้งดีล — SF-1)
      const mineRows = await tx.crmDealPayment.findMany({
        where: {
          ...scopeOf(ctx), dealId: deal.id, status: "COUNTED",
          OR: [{ refType: "PAYMENT", refId: { in: payIds.length > 0 ? payIds : ["-"] } }, { refType: DOC_SETTLE_REF_TYPE, refId: documentId }],
        },
        select: { satang: true },
      });
      const already = mineRows.reduce((n, r) => n + Number(r.satang), 0);
      const diff = grand - already;
      if (diff <= 0 || !isUsableSatang(diff)) return 0;
      const mine = await flagRowInTx(tx, ctx, { dealId: deal.id, refType: DOC_SETTLE_REF_TYPE, refId: documentId, satang: BigInt(diff), status: "COUNTED", countedAt: new Date() });
      if (!mine) return 0;
      await afterMoneyChangedInTx(tx, ctx, deal, { deltaSatang: BigInt(diff), anchorGrand, lifecycle: true });
      await emitMoneyUpdate(tx, ctx, deal.id, `docsettle-${documentId}`, { documentId, satang: diff });
      return diff;
    }, TX_OPTS);
    if (settled > 0) {
      await audit(ctx, "crm.deal.payment", dealId, { after: { refType: DOC_SETTLE_REF_TYPE, refId: documentId, satang: settled, reason: "DOC_FULLY_PAID" } });
    }
  }
  await afterCounted(ctx, dealId);
  return { dealId, settledSatang: settled };
}

/**
 * ยกเลิกการรับชำระ (`account.payment.voided`) — AUDIT-CLASS X4 (M10): **ถอนคืนเฉพาะสิ่งที่เคยนับ**
 * แถวสถานะ COUNTED เท่านั้นที่กลายเป็น REVERSED แล้วลบยอดออก "เท่าที่แถวนั้นเคยนับ" (ไม่ใช่ยอดใน event) ·
 * แถว LINKED (ไม่เคยนับ) = ทำเครื่องหมายอย่างเดียว ไม่ลบยอด · ยกเลิกซ้ำ = ไม่มีอะไรเปลี่ยน
 * 🔴 มติรอบ 2 (SF-2): ถอนแถว "ปิดยอดเอกสาร" ของเอกสารใบเดียวกันด้วย — ใบแจ้งหนี้ไม่ครบแล้ว ส่วนต่าง WHT จึงต้องหายตาม
 */
export async function reverseDocPayment(ctx: MoneyCtx, input: { documentId?: string; paymentId: string; amountSatang?: number; reason?: string }): Promise<ReverseResult> {
  return reverseRow(ctx, "PAYMENT", str(input?.paymentId), "crm.deal.payment.reverse", { documentId: str(input?.documentId) });
}

/** `pos.sale.voided` → ถอนคืนบิลหน้าร้านใบนั้น (กติกาเดียวกับ `reverseDocPayment`) */
export async function reversePosSale(ctx: MoneyCtx, input: { saleId: string }): Promise<ReverseResult> {
  return reverseRow(ctx, "POS_SALE", str(input?.saleId), "crm.deal.pos.reverse");
}

/**
 * ถอนคืนทุกแถวของ "ของที่จ่ายมา" ชิ้นนั้น
 * 🔴 มติรอบ 2 (B2) — **ไม่มีประตู uiVersion/สะพานตรงนี้**: ร้านที่ปิดสะพานหรือสลับกลับ v1 หลังจากนับเงินไปแล้ว
 *    ต้องถอนคืนได้ ไม่งั้นยอดของดีลค้างเกินจริงถาวร (ประตูห้ามการนับเข้าได้ ห้ามการถอนคืนไม่ได้) · ยังผูกร้าน+ระบบเสมอ
 * 🔴 มติรอบ 2 (B1) — `findMany` ไม่ใช่ `findFirst`: ถ้าเคยมีแถวของบิลใบเดียวกันค้างอยู่หลายดีล (ข้อมูลเก่า/แข่งกันเขียน)
 *    ต้องถอนคืน **ทุกแถว** ไม่งั้นเหลือแถว COUNTED/LINKED ลอยอยู่บนดีลที่ไม่มีใครมอง
 * แต่ละแถวจบในธุรกรรมของตัวเอง (ล็อก ref → ดีล) ⇒ ยกเลิกซ้ำ/ขนานกี่รอบก็ลบยอดครั้งเดียวต่อแถว
 */
async function reverseRow(ctx: MoneyCtx, refType: MoneyRefType, refId: string | null, action: string, opts: { documentId?: string | null } = {}): Promise<ReverseResult> {
  if (!refId) return { reversed: false, dealId: null };
  await resolveSystem(ctx);
  const targets: { id: string; dealId: string; refType: string; refId: string }[] = await prisma.crmDealPayment.findMany({
    where: { ...scopeOf(ctx), refType, refId },
    orderBy: [{ dealId: "asc" }, { id: "asc" }],
    select: { id: true, dealId: true, refType: true, refId: true },
  });
  const docId = refType === "PAYMENT" ? str(opts.documentId ?? null) : null;
  if (docId) {
    // SF-2: แถวปิดยอดของเอกสารใบเดียวกัน (ถ้ามี) ถอนพร้อมกันเสมอ
    const settle = await prisma.crmDealPayment.findMany({
      where: { ...scopeOf(ctx), refType: DOC_SETTLE_REF_TYPE, refId: docId },
      orderBy: [{ dealId: "asc" }, { id: "asc" }],
      select: { id: true, dealId: true, refType: true, refId: true },
    });
    for (const row of settle) if (!targets.some((t) => t.id === row.id)) targets.push(row);
  }
  if (targets.length === 0) return { reversed: false, dealId: null };

  let anyReversed = false;
  let firstDeal: string | null = null;
  for (const target of targets) {
    const pre = await prisma.crmDeal.findFirst({ where: { ...scopeOf(ctx), id: target.dealId } });
    if (!pre) continue;
    const anchorGrand = await anchorGrandOf(ctx, pre);
    const out = await prisma.$transaction(async (tx) => {
      await lockRef(tx, target.refType, target.refId);
      await lockMoney(tx, target.dealId);
      const deal = await lockRows(tx, ctx, pre);
      if (!deal) return { reversed: false as const, satang: ZERO };
      const cur = await tx.crmDealPayment.findFirst({ where: { id: target.id }, select: { id: true, status: true, satang: true } });
      if (!cur || cur.status === "REVERSED") return { reversed: false as const, satang: ZERO };
      const wasCounted = cur.status === "COUNTED";
      const n = await tx.crmDealPayment.updateMany({ where: { id: cur.id, status: cur.status }, data: { status: "REVERSED", reversedAt: new Date() } });
      if (n.count !== 1) return { reversed: false as const, satang: ZERO };
      await afterMoneyChangedInTx(tx, ctx, deal, { deltaSatang: wasCounted ? -cur.satang : ZERO, anchorGrand, lifecycle: false });
      await emitMoneyUpdate(tx, ctx, deal.id, `reverse-${target.refType.toLowerCase()}-${target.refId}`, { refType: target.refType, refId: target.refId, satang: wasCounted ? Number(cur.satang) : 0 });
      return { reversed: true as const, satang: wasCounted ? cur.satang : ZERO };
    }, TX_OPTS);
    if (out.reversed) {
      anyReversed = true;
      firstDeal = firstDeal ?? target.dealId;
      await audit(ctx, action, target.dealId, { after: { refType: target.refType, refId: target.refId, satang: Number(out.satang) } });
    }
  }
  return { reversed: anyReversed, dealId: firstDeal ?? targets[0]?.dealId ?? null };
}

/**
 * `account.document.voided` → ธง "เอกสารถูกยกเลิก" ของทุกดีลที่ผูกเอกสารใบนั้น (มติผู้คุมงาน C2.7 addendum 3)
 * ธง = แท็ก `DEAL_VOIDED_TAG` ใน `CrmDeal.tags` (ใส่ครั้งเดียว) + กิจกรรม AUTO 1 ใบ (ธงกันซ้ำคือ `sourceRef`)
 * 🔴 มติรอบ 2 (SF-1) — ถอนคืน **เฉพาะแถวที่เป็นของเอกสารใบที่ถูกยกเลิก**: การรับชำระของใบนั้น (ถามจาก facade บัญชี)
 *    + แถวปิดยอดของใบนั้น · เดิมกวาดทุกแถว PAYMENT ของดีล ⇒ ยกเลิกใบแจ้งหนี้ไปลบเงินมัดจำของอีกใบทิ้งด้วย
 * 🔴 มติรอบ 2 (SF-4) — หลายดีลอ้างเอกสารใบเดียวกัน: **ปักธงทุกดีล** แต่ดีลที่ไม่เคยถูกนับก็ไม่มีแถวให้ถอน
 *    ⇒ ผลลัพธ์สอดคล้องกับ "ดีลที่เก่าที่สุดได้เงิน" โดยอัตโนมัติ
 * 🔴 มติรอบ 2 (B2) — ไม่มีประตู uiVersion/สะพาน (เป็นการถอนคืน)
 */
export async function flagDocumentVoided(ctx: MoneyCtx, input: { documentId: string; reason?: string }): Promise<{ deals: number }> {
  const documentId = str(input?.documentId);
  if (!documentId) return { deals: 0 };
  await resolveSystem(ctx);
  const rows = await prisma.crmDeal.findMany({
    where: { ...scopeOf(ctx), OR: [{ invoiceDocId: documentId }, { quotationDocId: documentId }] },
    orderBy: { id: "asc" },
  });
  if (rows.length === 0) return { deals: 0 };
  const payIds = await paymentIdsOfDoc(ctx.tenantId, documentId);
  const sourceRef = `account.document.voided#${documentId}`;
  let flagged = 0;
  for (const pre of rows) {
    const anchorGrand = await anchorGrandOf(ctx, pre);
    const done = await prisma.$transaction(async (tx) => {
      await lockMoney(tx, pre.id);
      const deal = await lockRows(tx, ctx, pre);
      if (!deal) return null;
      const already = await tx.crmActivity.findFirst({ where: { ...scopeOf(ctx), dealId: deal.id, source: "AUTO", sourceRef }, select: { id: true } });
      if (already) return null;
      const tags = deal.tags.includes(DEAL_VOIDED_TAG) ? deal.tags : [...deal.tags, DEAL_VOIDED_TAG];
      await tx.crmDeal.update({ where: { id: deal.id }, data: { tags } });
      // เฉพาะเงิน "ของเอกสารใบนี้" เท่านั้น (SF-1) — ไม่มีแถวของใบนี้ = ไม่ถอนอะไรเลย
      const counted = await tx.crmDealPayment.findMany({
        where: {
          ...scopeOf(ctx), dealId: deal.id, status: "COUNTED",
          OR: [{ refType: "PAYMENT", refId: { in: payIds.length > 0 ? payIds : ["-"] } }, { refType: DOC_SETTLE_REF_TYPE, refId: documentId }],
        },
        select: { id: true, satang: true },
      });
      let reversed = ZERO;
      for (const c of counted) {
        const n = await tx.crmDealPayment.updateMany({ where: { id: c.id, status: "COUNTED" }, data: { status: "REVERSED", reversedAt: new Date() } });
        if (n.count === 1) reversed += c.satang;
      }
      await afterMoneyChangedInTx(tx, ctx, deal, { deltaSatang: -reversed, anchorGrand, lifecycle: false });
      // AUDIT-CLASS X8: หัวเรื่องกิจกรรมเป็นข้อความไทยกลาง ๆ — ไม่มีเลขที่เอกสาร ชื่อคน หรือยอดเงิน
      const act = await recordSystemActivityInTx(tx, ctx, {
        type: "NOTE",
        source: "AUTO",
        sourceRef,
        title: "เอกสารบัญชีของดีลนี้ถูกยกเลิก — ตรวจยอดเงินของดีลอีกครั้ง",
        contactId: deal.contactId,
        companyId: deal.companyId,
        dealId: deal.id,
      });
      await emitMoneyUpdate(tx, ctx, deal.id, `docvoid-${documentId}`, { documentId, reversedSatang: Number(reversed) });
      return { act, reversed: Number(reversed) };
    }, TX_OPTS);
    if (!done) continue;
    flagged += 1;
    await auditSystemActivity(ctx, done.act, "account.document.voided");
    await audit(ctx, "crm.deal.doc.voided", pre.id, { after: { documentId, tag: DEAL_VOIDED_TAG, reversedSatang: done.reversed } });
  }
  return { deals: flagged };
}

/**
 * `pos.sale.paid` → แถวที่พนักงานผูกไว้ (LINKED) กลายเป็น COUNTED และบวกยอดเข้าดีลครั้งเดียว
 * ไม่มีแถว (พนักงานไม่ได้เลือกดีล หรือ action ผูกยังมาไม่ถึง) = ไม่ทำอะไร และไม่ใช่ error —
 * ทางผูกจะนับเองใน tx ของมัน (ใครถึงก่อนนับ อีกฝ่าย no-op บน unique เดียวกัน · มติผู้คุมงาน C2.7 ข้อ 2)
 * 🔴 มติรอบ 2 (B1): ไล่ **ทุกแถว** ของบิลใบนี้ (findMany) — ถ้ามีแถวค้างอยู่หลายดีลจากข้อมูลเก่า จะได้ไม่มีแถวไหนถูกลืมไว้
 * 🔴 มติรอบ 2 (N3): บิล "ขาย/เติมบัตรกำนัล" ไม่ใช่รายได้ของดีล (โมดูลบัตรกำนัลลงเป็นรับเงินล่วงหน้า) ⇒ ไม่นับ
 */
export async function countPosSale(ctx: MoneyCtx, input: { saleId: string }): Promise<CountPosSaleResult> {
  const saleId = str(input?.saleId);
  if (!saleId) return { counted: false, dealId: null };
  await resolveSystem(ctx);
  if (!(await canCount(ctx))) return { counted: false, dealId: null };
  const sale = await prisma.posSale.findFirst({ where: { id: saleId, tenantId: ctx.tenantId }, select: { id: true, giftCardId: true } });
  if (sale?.giftCardId) return { counted: false, dealId: null };
  const targets = await prisma.crmDealPayment.findMany({
    where: { ...scopeOf(ctx), refType: "POS_SALE", refId: saleId },
    orderBy: [{ dealId: "asc" }, { id: "asc" }],
    select: { id: true, dealId: true },
  });
  if (targets.length === 0) return { counted: false, dealId: null };

  let anyCounted = false;
  for (const row of targets) {
    const pre = await prisma.crmDeal.findFirst({ where: { ...scopeOf(ctx), id: row.dealId } });
    if (!pre) continue;
    const anchorGrand = await anchorGrandOf(ctx, pre);
    const out = await prisma.$transaction(async (tx) => {
      await lockRef(tx, "POS_SALE", saleId);
      await lockMoney(tx, row.dealId);
      const deal = await lockRows(tx, ctx, pre);
      if (!deal) return { counted: false as const };
      const counted = await countLinkedRowInTx(tx, ctx, deal, row.id, anchorGrand);
      if (!counted) return { counted: false as const };
      await emitMoneyUpdate(tx, ctx, deal.id, `pos-${saleId}`, { saleId, satang: Number(counted) });
      return { counted: true as const };
    }, TX_OPTS);
    if (out.counted) {
      anyCounted = true;
      await audit(ctx, "crm.deal.pos.count", row.dealId, { after: { refType: "POS_SALE", refId: saleId } });
      await afterCounted(ctx, row.dealId);
    }
  }
  return { counted: anyCounted, dealId: targets[0]?.dealId ?? null };
}

/** LINKED → COUNTED ใต้ล็อกที่ผู้เรียกถืออยู่ — คืนยอดที่เพิ่งนับ (0 = ไม่ได้นับ เพราะนับไปแล้ว/ถูกถอนคืนแล้ว) */
async function countLinkedRowInTx(tx: Tx, ctx: MoneyCtx, deal: CrmDeal, rowId: string, anchorGrand: number): Promise<bigint> {
  const cur = await tx.crmDealPayment.findFirst({ where: { id: rowId }, select: { id: true, status: true, satang: true } });
  if (!cur || cur.status !== "LINKED") return ZERO;
  const n = await tx.crmDealPayment.updateMany({ where: { id: cur.id, status: "LINKED" }, data: { status: "COUNTED", countedAt: new Date() } });
  if (n.count !== 1) return ZERO;
  await afterMoneyChangedInTx(tx, ctx, deal, { deltaSatang: cur.satang, anchorGrand, lifecycle: true });
  return cur.satang;
}

/** หลังเงินเข้าครบ: ชนะอัตโนมัติถ้า pipeline ตั้งไว้ (นอก tx — `deals.moveCore` เปิดธุรกรรมของตัวเอง) */
async function afterCounted(ctx: MoneyCtx, dealId: string): Promise<void> {
  const deals = await import("./deals");
  await deals.autoWinOnPaidFromBridge(ctx, { dealId });
}

// ═════════════════════════ ทางเข้าของคน (actor + คีย์ + การมองเห็น) ═════════════════════════

/**
 * ผูกบิลหน้าร้านเข้ากับดีล (ปุ่มของแคชเชียร์ · ยิงต่อจาก `createSale` ที่สำเร็จแล้ว)
 * 🔴 มติผู้คุมงาน C2.7 ข้อ 2: บิลที่ **จ่ายแล้ว** ตอนที่แถวลิงก์ถูกเขียน ต้องถูก "นับในธุรกรรมเดียวกัน" —
 *    ไม่งั้นเงินหาย เพราะ `pos.sale.paid` ถูกระบายไปก่อนหน้านั้นแล้วและตอนนั้นยังไม่มีแถวให้นับ
 * 🔴 มติรอบ 2 (B1): บิลใบเดียว = เงินก้อนเดียว ⇒ ผูกได้ดีลเดียวเท่านั้น · ด่านนี้ตัดสินใต้ **ล็อกของบิล** (`lockRef`)
 *    เพราะ unique ของตารางเป็นราย "ดีล" จึงกันข้ามดีลไม่ได้ · ผูกซ้ำดีลเดิม = no-op เหมือนเดิม
 * 🔴 มติรอบ 2 (N3): บิลขาย/เติมบัตรกำนัลไม่ใช่รายได้ของดีล ⇒ ปฏิเสธพร้อมเหตุผลไทย (ไม่ใช่ความผิดของแคชเชียร์)
 * 🔴 มติรอบ 2 (B2): การผูก = การนับเข้า ⇒ ต้อง v2 **และ** สะพานเปิด (`canCount`)
 * ลำดับ: ประตู → การมองเห็น (ไม่เห็น = NOT_FOUND) → คีย์ `crm.deal.update` → บิลต้องเป็นของร้านนี้
 */
export async function linkSaleToDeal(ctx: MoneyCtx, actor: MemberActor, input: { dealId: string; saleId: string }): Promise<LinkSaleResult> {
  assertActor(actor);
  await resolveSystem(ctx);
  if (!(await canCount(ctx))) throw new CrmV2DisabledError();
  const dealId = str(input?.dealId);
  const saleId = str(input?.saleId);
  if (!dealId || !saleId) throw fail("NOT_FOUND", NOT_FOUND_MSG);
  const pre = await prisma.crmDeal.findFirst({ where: { AND: [await dealWhere(ctx, actor), { id: dealId }] } });
  if (!pre) throw fail("NOT_FOUND", NOT_FOUND_MSG);
  need(actor, "crm.deal.update");
  if (pre.kind !== "OPEN") throw fail("VALIDATION", CLOSED_MSG);
  // AUDIT-CLASS X1: บิลต้องเป็นของร้านเดียวกัน (อ่านอย่างเดียวเพื่อตรวจร้าน/สถานะ — ไม่มีการเขียนตารางของโมดูล POS)
  const sale = await prisma.posSale.findFirst({ where: { id: saleId, tenantId: ctx.tenantId }, select: { id: true, status: true, grandTotalSatang: true, giftCardId: true } });
  if (!sale) throw fail("NOT_FOUND", SALE_NOT_FOUND_MSG);
  if (sale.giftCardId) throw fail("VALIDATION", GIFTCARD_MSG);
  const anchorGrand = await anchorGrandOf(ctx, pre);
  const satang = BigInt(Math.max(0, sale.grandTotalSatang));

  const out = await prisma.$transaction(async (tx) => {
    await lockRef(tx, "POS_SALE", sale.id);
    await lockMoney(tx, pre.id);
    const deal = await lockRows(tx, ctx, pre);
    if (!deal) throw fail("NOT_FOUND", NOT_FOUND_MSG);
    // มติรอบ 2 (B1): บิลใบนี้ถูกผูกกับดีลอื่นไปแล้วหรือยัง — ตัดสินใต้ล็อกของบิล ⇒ ยิงพร้อมกันก็ได้ผูกดีลเดียว
    const other = await tx.crmDealPayment.findFirst({
      where: { ...scopeOf(ctx), refType: "POS_SALE", refId: sale.id, dealId: { not: deal.id } },
      select: { id: true, dealId: true, status: true },
    });
    if (other) throw fail("CONFLICT", SALE_TAKEN_MSG);
    // ปักธงด้วยคำสั่งเดียวที่ชนไม่ได้ (ตัวรับ `pos.sale.paid` อาจผูก/นับไปแล้ว — ใครถึงก่อนนับ อีกฝ่าย no-op)
    const created = await flagRowInTx(tx, ctx, { dealId: deal.id, refType: "POS_SALE", refId: sale.id, satang, status: "LINKED" });
    const existing = await tx.crmDealPayment.findFirst({ where: { ...scopeOf(ctx), dealId: deal.id, refType: "POS_SALE", refId: sale.id } });
    if (!existing) throw fail("NOT_FOUND", NOT_FOUND_MSG); // เป็นไปไม่ได้ (เพิ่งปักธงหรือมีอยู่แล้ว) — กันชนิดให้ชัด
    // บิลจ่ายแล้ว ⇒ นับทันทีใน tx เดียวกัน (ตัวรับ `pos.sale.paid` วิ่งไปก่อนหน้านี้แล้วและตอนนั้นยังไม่มีแถวให้นับ)
    let counted = existing.status === "COUNTED";
    let justCounted = false;
    if (sale.status === "PAID" && existing.status === "LINKED") {
      const got = await countLinkedRowInTx(tx, ctx, deal, existing.id, anchorGrand);
      justCounted = got > ZERO;
      counted = justCounted;
    }
    if (created) await emitMoneyUpdate(tx, ctx, deal.id, `pos-link-${sale.id}`, { saleId: sale.id, satang: Number(satang), counted });
    // มติรอบ 2 (N4): แถว LINKED ที่มีอยู่ก่อนแล้วถูกนับโดยการผูกครั้งนี้ ก็ต้องมี event เหมือนตอนตัวรับนับเอง
    if (justCounted) await emitMoneyUpdate(tx, ctx, deal.id, `pos-${sale.id}`, { saleId: sale.id, satang: Number(satang) });
    return { paymentId: existing.id, counted, created };
  }, TX_OPTS);

  await audit(ctx, "crm.deal.pos.link", pre.id, { after: { saleId: sale.id, satang: Number(satang), counted: out.counted } }, actor.userId ?? null);
  if (out.counted) await afterCounted(ctx, pre.id);
  return { ok: true, paymentId: out.paymentId, counted: out.counted };
}

/**
 * ดีลที่ยังเปิดอยู่ของ Party นี้ ที่ actor มองเห็น (หน้าขายใช้เติมช่อง "ดีล")
 * 🔴 ไม่มีคีย์ `crm.deal.read` = รายการว่าง **ไม่ใช่ error** — หน้าขายต้องขายต่อได้เสมอ · ร้าน v1 = ว่างเช่นกัน
 */
export async function openDealsForParty(ctx: MoneyCtx, actor: MemberActor, partyId: string): Promise<OpenDealOption[]> {
  const pid = str(partyId);
  if (!pid || !actor || actor.role === "CUSTOMER") return [];
  await resolveSystem(ctx);
  if (!(await isV2(ctx))) return [];
  if (!crmCan(actor, "crm.deal.read")) return [];
  const [contacts, comps] = await Promise.all([
    prisma.crmContact.findMany({ where: { ...scopeOf(ctx), partyId: pid }, select: { id: true } }),
    prisma.crmCompany.findMany({ where: { ...scopeOf(ctx), partyId: pid }, select: { id: true } }),
  ]);
  if (contacts.length === 0 && comps.length === 0) return [];
  const rows = await prisma.crmDeal.findMany({
    where: {
      AND: [
        await dealWhere(ctx, actor),
        { kind: "OPEN", archivedAt: null },
        { OR: [{ contactId: { in: contacts.map((c) => c.id) } }, { companyId: { in: comps.map((c) => c.id) } }] },
      ],
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: POS_LINK_LIMIT,
    select: { id: true, title: true, valueSatang: true, ownerUserId: true, stage: { select: { name: true } } },
  });
  return rows.map((d) => ({ id: d.id, title: d.title, valueSatang: d.valueSatang, stageName: d.stage.name, ownerUserId: d.ownerUserId }));
}

/**
 * เอกสารบัญชีใบนี้เป็นของดีลไหน (บล็อก "ดีล" บนหน้าเอกสาร · เส้น account→crm เดิม)
 * 🔴 ต้องระบุ `tenantId` เสมอ (มติผู้คุมงาน C2.7 ข้อ 4 — AUDIT-CLASS X1) · ส่ง actor มาด้วย = กรองตามการมองเห็น
 * เอกสารของร้านอื่น / ไม่มีดีล / ดีลที่ผู้ดูมองไม่เห็น / ระบบยัง v1 = null (ไม่ throw)
 */
export async function dealForDoc(tenantId: string, docId: string, actor?: MemberActor | null): Promise<DealForDoc | null> {
  const tid = str(tenantId);
  const did = str(docId);
  if (!tid || !did) return null;
  const systems = await prisma.appSystem.findMany({ where: { tenantId: tid, type: "CRM" }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], select: { id: true } });
  for (const sys of systems) {
    const ctx: MoneyCtx = { tenantId: tid, systemId: sys.id };
    if (!(await isV2(ctx))) continue;
    const dealId = await dealIdForDoc(ctx, did);
    if (!dealId) continue;
    const where: Prisma.CrmDealWhereInput = actor ? { AND: [await dealWhere(ctx, actor), { id: dealId }] } : { ...scopeOf(ctx), id: dealId };
    const deal = await prisma.crmDeal.findFirst({ where, select: { id: true, title: true } });
    if (!deal) continue;
    return { dealId: deal.id, systemId: sys.id, title: deal.title, path: `/app/sys/${sys.id}/crm/deals/${deal.id}` };
  }
  return null;
}

/** ยอดเงินของดีล 1 ใบ (แท็บเงินของดีล 360 · REST ในใบหลัง) — มองไม่เห็นดีล = NOT_FOUND */
export async function dealMoney(ctx: MoneyCtx, actor: MemberActor, dealId: string): Promise<DealMoney> {
  assertActor(actor);
  await resolveSystem(ctx);
  const did = str(dealId);
  const deal = did ? await prisma.crmDeal.findFirst({ where: { AND: [await dealWhere(ctx, actor), { id: did }] } }) : null;
  if (!deal) throw fail("NOT_FOUND", NOT_FOUND_MSG);
  const rows = await prisma.crmDealPayment.findMany({ where: { ...scopeOf(ctx), dealId: deal.id }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
  return {
    paidSatang: num(deal.paidSatang),
    wonValueSatang: num(deal.wonValueSatang),
    documentVoided: deal.tags.includes(DEAL_VOIDED_TAG),
    payments: rows.map((r) => ({
      id: r.id,
      refType: r.refType as MoneyRefType,
      refId: r.refId,
      satang: num(r.satang),
      status: r.status as MoneyStatus,
      countedAt: r.countedAt,
    })),
  };
}
