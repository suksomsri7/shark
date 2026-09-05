// events.ts — เหตุการณ์บัญชีที่ออกทาง webhook ของแพลตฟอร์ม (WO 8.3 §9.5 + WO C4)
//
// 🔴 กติกาที่ทุกตัวในไฟล์นี้ต้องรักษา (ข้อสอบ `scripts/qc-account-api-webhooks.mts` ตรวจตามนี้):
//   1) **ยิงใน tx เดียวกับงานหลัก** — ทุกฟังก์ชันรับ `tx` เข้ามา (transactional outbox)
//      ⇒ งานหลัก rollback = ไม่มี event หลอก · งานหลักรอด = event รอดแน่นอน
//   2) **payload ห้ามมี tenantId/systemId** — `webhooks/service.dispatchWebhooks` ส่ง payload
//      ออกไปให้ปลายทาง**ตรง ๆ** (JSON.stringify({type,payload,sentAt})) ⇒ ใส่ไปคือรั่ว id ภายในของร้าน
//      (ทั้งคู่อยู่ที่ "ซอง" ของ OutboxEvent อยู่แล้ว — dispatch ใช้จากตรงนั้น)
//   3) **เงินเป็นสตางค์ (int) ชื่อลงท้าย `…Satang`** · วันที่ `YYYY-MM-DD` ปฏิทินไทย ·
//      เวลาจริงเป็น ISO ลงท้าย `…At` (กติกาเดียวกับ REST — คู่มือ ACCOUNT-API.md)
//   4) **idempotencyKey = `<type>#<id>[#…]`** — ชนคีย์เดิม = ไม่เพิ่มแถว (`@@unique(tenantId,idempotencyKey)`
//      + `createMany({skipDuplicates:true})`) ⇒ เส้นทาง UI/REST/AI ที่ลงเอยที่ service เดียวกัน
//      ยิงได้ครั้งเดียวเสมอ · จุดที่ห่อกันเป็นชั้น (เช่น `createGroupDoc` → `issueDocument`)
//      ก็ไม่ยิงซ้ำเพราะคีย์ผูกกับ **id ของเอกสาร** ไม่ใช่ทางเข้า
//   5) **เพิ่ม event ใหม่ต้องทำ 2 ที่เสมอ**: ป้ายไทยใน `src/lib/webhooks/labels.ts` (ไม่งั้นร้านเลือกสมัครไม่ได้)
//      + consumer ใน `src/lib/outbox-consumers.ts` (ไม่งั้น **ค้าง PENDING ตลอดกาล ทั้งคิว** — บทเรียน 30 ส.ค. 2026)
//
// ไฟล์นี้ **ไม่ import prisma** โดยตั้งใจ (fitness F5): มันคือตัวประกอบ payload + เขียนผ่าน `tx` ที่ผู้เรียกถืออยู่แล้ว

import type {
  AccountChequeDirection,
  AccountChequeStatus,
  AccountContactKind,
  AccountDocSource,
  AccountDocStatus,
  AccountDocType,
  AccountProductType,
  Prisma,
} from "@prisma/client";
import { emitOutboxMany } from "@/lib/core/outbox";

type Tx = Prisma.TransactionClient;

/** ร้าน + สมุดบัญชีที่ event สังกัด — ไปอยู่ที่ "ซอง" ของ OutboxEvent ไม่ใช่ใน payload */
export type AccountEventCtx = { tenantId: string; systemId: string };

/** ชนิด event บัญชีทั้งหมด — ต้องตรงกับ `webhooks/labels.ts` + `outbox-consumers.ts` เป๊ะ */
export const ACCOUNT_EVENT_TYPES = [
  "account.document.issued",
  "account.document.approved",
  "account.document.voided",
  "account.quotation.responded",
  "account.payment.recorded",
  "account.payment.voided",
  "account.invoice.paid",
  "account.payment_request.paid",
  "account.payment_request.expired",
  "account.contact.created",
  "account.contact.updated",
  "account.contact.merged",
  "account.product.created",
  "account.product.updated",
  "account.period.closed",
  // ── ชุดที่ 3 (WO D4 · ledger/ACCOUNT-API-RUN.md §D4 "event ที่เหลือ") ──────
  "account.cheque.changed",
  "account.reconcile.confirmed",
  "account.period.reopened",
  "account.asset.depreciated",
  "account.asset.disposed",
  "account.recurring.ran",
] as const;

export type AccountEventType = (typeof ACCOUNT_EVENT_TYPES)[number];

// วันปฏิทินไทย (UTC+7 ไม่มี DST) — วันที่ของเอกสารเก็บเป็นเที่ยงคืน UTC อยู่แล้ว จึงได้วันเดิม
// ส่วนค่าที่เป็น "เวลาจริง" (เช่น new Date() ตอนกดปุ่ม) จะได้วันตามปฏิทินไทยที่ผู้ใช้เห็นบนจอ
const BKK_DAY = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit" });
export const eventDay = (d: Date): string => BKK_DAY.format(d);

type EventRow = { type: AccountEventType; idempotencyKey: string; payload: Record<string, unknown> };

/** เขียนหลาย event ในคำสั่งเดียว (`createMany skipDuplicates`) — ชนคีย์เดิม = ข้ามเงียบ ๆ ไม่ abort tx */
async function emit(tx: Tx, ctx: AccountEventCtx, rows: EventRow[]): Promise<void> {
  await emitOutboxMany(
    tx,
    rows.map((r) => ({
      tenantId: ctx.tenantId,
      systemId: ctx.systemId,
      type: r.type,
      idempotencyKey: r.idempotencyKey,
      payload: r.payload,
    })),
  );
}

// ─────────────────── เอกสาร ───────────────────

export type IssuedDoc = {
  id: string;
  docType: AccountDocType;
  docNo: string | null;
  status: AccountDocStatus | string;
  contactId: string | null;
  grandTotal: number;
  issueDate: Date;
  source: AccountDocSource | string;
};

/**
 * "ออกเอกสารแล้ว" — ยิงจากทุกทางที่ทำให้เอกสารพ้นสถานะร่างและได้เลขที่จริง:
 * `issueDocument` (ขาย) · `issueExpenseDoc` (ซื้อ) · `submitForApproval` (ใบสั่งซื้อได้เลขที่ตอนส่งอนุมัติ) ·
 * `approveGoodsMovement` (ใบเบิก/คืนได้เลขที่ตอนอนุมัติ) · `createGroupDoc` ยิงผ่าน 2 ตัวแรก (ไม่ซ้ำ — คีย์ = docId)
 */
export async function emitDocumentIssued(tx: Tx, ctx: AccountEventCtx, doc: IssuedDoc): Promise<void> {
  await emit(tx, ctx, [
    {
      type: "account.document.issued",
      idempotencyKey: `account.document.issued#${doc.id}`,
      payload: {
        documentId: doc.id,
        type: doc.docType,
        docNo: doc.docNo,
        status: doc.status,
        contactId: doc.contactId,
        grandTotalSatang: doc.grandTotal,
        issueDate: eventDay(doc.issueDate),
        source: doc.source,
      },
    },
  ]);
}

/** "อนุมัติเอกสารแล้ว" (ใบสั่งซื้อ) — ยิงที่ service เพื่อให้ REST/AI/ปุ่มบนจอได้เหมือนกัน */
export async function emitDocumentApproved(
  tx: Tx,
  ctx: AccountEventCtx,
  doc: { id: string; docType: AccountDocType; approvedById: string | null },
): Promise<void> {
  await emit(tx, ctx, [
    {
      type: "account.document.approved",
      idempotencyKey: `account.document.approved#${doc.id}`,
      payload: { documentId: doc.id, docType: doc.docType, approvedById: doc.approvedById },
    },
  ]);
}

/** "ยกเลิกเอกสาร" — ทั้ง CANCELLED (ร่าง) และ VOIDED (เคยมีผล) ใช้ event เดียวกัน (สถานะปลายทางอ่านได้จาก REST) */
export async function emitDocumentVoided(
  tx: Tx,
  ctx: AccountEventCtx,
  doc: { id: string; docType: AccountDocType; docNo: string | null; reason: string },
): Promise<void> {
  await emit(tx, ctx, [
    {
      type: "account.document.voided",
      idempotencyKey: `account.document.voided#${doc.id}`,
      payload: { documentId: doc.id, type: doc.docType, docNo: doc.docNo, reason: doc.reason },
    },
  ]);
}

/**
 * "ลูกค้าตอบใบเสนอราคา" — คีย์มี `accepted` ต่อท้ายโดยตั้งใจ: ตอบรับแล้วเปลี่ยนใจเป็นปฏิเสธ
 * (หรือกลับกัน) เป็นเหตุการณ์คนละใบที่ปลายทางต้องรู้ทั้งคู่ ⇒ คีย์เดียวจะกลืนใบที่สอง
 */
export async function emitQuotationResponded(
  tx: Tx,
  ctx: AccountEventCtx,
  doc: { id: string; docNo: string | null; accepted: boolean },
): Promise<void> {
  await emit(tx, ctx, [
    {
      type: "account.quotation.responded",
      idempotencyKey: `account.quotation.responded#${doc.id}#${doc.accepted}`,
      payload: { documentId: doc.id, docNo: doc.docNo, accepted: doc.accepted },
    },
  ]);
}

// ─────────────────── การชำระเงิน ───────────────────

/** "ยกเลิกการรับ/จ่ายชำระ" — ยิงจาก `voidPayment` (ขาย) และ `voidVendorPayment` (ซื้อ) ⇒ `voidPaymentAny` ครอบทั้งคู่ */
export async function emitPaymentVoided(
  tx: Tx,
  ctx: AccountEventCtx,
  input: { paymentId: string; documentId: string; docNo: string | null; amountSatang: number; reason: string },
): Promise<void> {
  await emit(tx, ctx, [
    {
      type: "account.payment.voided",
      idempotencyKey: `account.payment.voided#${input.paymentId}`,
      payload: {
        paymentId: input.paymentId,
        documentId: input.documentId,
        docNo: input.docNo,
        amountSatang: input.amountSatang,
        reason: input.reason,
      },
    },
  ]);
}

/** "ลิงก์ขอชำระเงินถูกจ่ายแล้ว" — ทั้งทาง Beam webhook และทางคนกด "ยืนยันรับเงินแล้ว" (QR นิ่ง) */
export async function emitPaymentRequestPaid(
  tx: Tx,
  ctx: AccountEventCtx,
  input: {
    requestId: string;
    documentId: string;
    docNo: string | null;
    amountSatang: number;
    provider: "PROMPTPAY_STATIC" | "BEAM";
    paymentId: string | null;
  },
): Promise<void> {
  await emit(tx, ctx, [
    {
      type: "account.payment_request.paid",
      idempotencyKey: `account.payment_request.paid#${input.requestId}`,
      payload: {
        requestId: input.requestId,
        documentId: input.documentId,
        docNo: input.docNo,
        amountSatang: input.amountSatang,
        provider: input.provider,
        paymentId: input.paymentId,
      },
    },
  ]);
}

/**
 * "ลิงก์ขอชำระเงินหมดอายุ" — มาจาก cron ที่กวาด **ข้ามร้าน** ⇒ ต่างจากตัวอื่นตรงที่รับ ctx มาต่อแถว
 * (event ของร้านไหนต้องสังกัดร้านนั้น ไม่ใช่ร้านของแถวแรก)
 */
export async function emitPaymentRequestsExpired(
  tx: Tx,
  rows: {
    ctx: AccountEventCtx;
    requestId: string;
    documentId: string;
    docNo: string | null;
    amountSatang: number;
  }[],
): Promise<void> {
  if (rows.length === 0) return;
  await emitOutboxMany(
    tx,
    rows.map((r) => ({
      tenantId: r.ctx.tenantId,
      systemId: r.ctx.systemId,
      type: "account.payment_request.expired",
      idempotencyKey: `account.payment_request.expired#${r.requestId}`,
      payload: {
        requestId: r.requestId,
        documentId: r.documentId,
        docNo: r.docNo,
        amountSatang: r.amountSatang,
      },
    })),
  );
}

// ─────────────────── ผู้ติดต่อ ───────────────────

export type ContactEventRow = {
  id: string;
  code: string | null;
  name: string;
  kind: AccountContactKind | string;
  taxId: string | null;
  phone: string | null;
  email: string | null;
};

export async function emitContactCreated(tx: Tx, ctx: AccountEventCtx, c: ContactEventRow): Promise<void> {
  await emit(tx, ctx, [
    {
      type: "account.contact.created",
      idempotencyKey: `account.contact.created#${c.id}`,
      payload: contactPayload(c),
    },
  ]);
}

/**
 * แก้ผู้ติดต่อ — คีย์มี `updatedAt` (มิลลิวินาที) ต่อท้าย เพราะ "แก้" เกิดซ้ำได้ไม่จำกัดครั้ง
 * 🔴 `updatedAt` ต้องอ่าน **หลังเขียน ใน tx เดียวกัน** ไม่งั้นได้ค่าเก่า → แก้ 2 ครั้งติดกันจะได้ event ใบเดียว
 */
export async function emitContactUpdated(
  tx: Tx,
  ctx: AccountEventCtx,
  c: ContactEventRow & { updatedAt: Date },
): Promise<void> {
  await emit(tx, ctx, [
    {
      type: "account.contact.updated",
      idempotencyKey: `account.contact.updated#${c.id}#${c.updatedAt.getTime()}`,
      payload: contactPayload(c),
    },
  ]);
}

function contactPayload(c: ContactEventRow): Record<string, unknown> {
  return { contactId: c.id, code: c.code, name: c.name, kind: c.kind, taxId: c.taxId, phone: c.phone, email: c.email };
}

/** "รวมผู้ติดต่อซ้ำ" — ปลายทางต้องรู้ว่า id ตัวรองใช้ไม่ได้แล้ว ให้ชี้ไป `keepId` แทน */
export async function emitContactMerged(
  tx: Tx,
  ctx: AccountEventCtx,
  input: {
    keepId: string;
    mergedId: string;
    moved: { documents: number; journalLines: number; groups: number; recurringRules: number };
  },
): Promise<void> {
  await emit(tx, ctx, [
    {
      type: "account.contact.merged",
      idempotencyKey: `account.contact.merged#${input.mergedId}`,
      payload: { keepId: input.keepId, mergedId: input.mergedId, moved: input.moved },
    },
  ]);
}

// ─────────────────── สินค้า/บริการ ───────────────────

export type ProductEventRow = {
  id: string;
  code: string | null;
  sku: string | null;
  name: string;
  type: AccountProductType | string;
  salePrice: number | null;
};

export async function emitProductCreated(tx: Tx, ctx: AccountEventCtx, p: ProductEventRow): Promise<void> {
  await emit(tx, ctx, [
    {
      type: "account.product.created",
      idempotencyKey: `account.product.created#${p.id}`,
      payload: productPayload(p),
    },
  ]);
}

/** เหตุผลเดียวกับ `emitContactUpdated` — `updatedAt` ต้องอ่านหลังเขียนใน tx เดียวกัน */
export async function emitProductUpdated(
  tx: Tx,
  ctx: AccountEventCtx,
  p: ProductEventRow & { updatedAt: Date },
): Promise<void> {
  await emit(tx, ctx, [
    {
      type: "account.product.updated",
      idempotencyKey: `account.product.updated#${p.id}#${p.updatedAt.getTime()}`,
      payload: productPayload(p),
    },
  ]);
}

function productPayload(p: ProductEventRow): Record<string, unknown> {
  return { productId: p.id, code: p.code, sku: p.sku, name: p.name, type: p.type, salePriceSatang: p.salePrice };
}

// ─────────────────── เช็ค / กระทบยอด / งวด / สินทรัพย์ / เอกสารประจำ (WO D4) ───────────────────

/**
 * "สถานะเช็คเปลี่ยน" — ยิงจากทุก transition ใน `cheque.ts` (นำฝาก · เรียกเก็บ · เด้ง · ยกเลิก)
 * คีย์มี `status` ต่อท้ายโดยตั้งใจ (เหมือน `quotation.responded`): เช็คใบเดียวเปลี่ยนสถานะหลายรอบตลอด
 * อายุของมัน แต่ละรอบเป็นเหตุการณ์คนละใบที่ปลายทางต้องรู้ทั้งหมด ⇒ คีย์เดียวจะกลืนรอบถัดไป
 */
export async function emitChequeChanged(
  tx: Tx,
  ctx: AccountEventCtx,
  c: {
    chequeId: string;
    direction: AccountChequeDirection;
    chequeNo: string;
    status: AccountChequeStatus;
    amountSatang: number;
  },
): Promise<void> {
  await emit(tx, ctx, [
    {
      type: "account.cheque.changed",
      idempotencyKey: `account.cheque.changed#${c.chequeId}#${c.status}`,
      payload: {
        chequeId: c.chequeId,
        direction: c.direction,
        chequeNo: c.chequeNo,
        status: c.status,
        amountSatang: c.amountSatang,
      },
    },
  ]);
}

/** "ยืนยันกระทบยอดธนาคารของเดือนนี้แล้ว" — ยิงจาก `reconcile.confirmMonth` */
export async function emitReconcileConfirmed(
  tx: Tx,
  ctx: AccountEventCtx,
  input: { financeId: string; periodKey: string; matched: number; statementBalanceSatang: number | null },
): Promise<void> {
  await emit(tx, ctx, [
    {
      type: "account.reconcile.confirmed",
      idempotencyKey: `account.reconcile.confirmed#${input.financeId}#${input.periodKey}`,
      payload: {
        financeId: input.financeId,
        periodKey: input.periodKey,
        matched: input.matched,
        statementBalanceSatang: input.statementBalanceSatang,
      },
    },
  ]);
}

/**
 * "เปิดงวดที่ปิดแล้วกลับมา" — ยิงจาก `period-close.reopenPeriodV2` · คีย์มีเวลาต่อท้ายเพราะงวดเดียวกัน
 * เปิด-ปิด-เปิดสลับกันได้หลายรอบ (ทุกรอบมี `reopenLog` ของตัวเอง) ⇒ คีย์ตายตัวจะกลืนรอบถัดไป
 */
export async function emitPeriodReopened(
  tx: Tx,
  ctx: AccountEventCtx,
  input: { periodKey: string; reason: string; reopenedById: string | null; at: Date },
): Promise<void> {
  await emit(tx, ctx, [
    {
      type: "account.period.reopened",
      idempotencyKey: `account.period.reopened#${ctx.systemId}#${input.periodKey}#${input.at.getTime()}`,
      payload: { periodKey: input.periodKey, reason: input.reason, reopenedById: input.reopenedById },
    },
  ]);
}

/** "คิดค่าเสื่อมของสินทรัพย์ 1 ตัวในงวดนี้แล้ว" — ยิงต่อสินทรัพย์ที่โพสต์สำเร็จใน `asset.runDepreciation` */
export async function emitAssetDepreciated(
  tx: Tx,
  ctx: AccountEventCtx,
  input: { assetId: string; code: string; periodKey: string; amountSatang: number },
): Promise<void> {
  await emit(tx, ctx, [
    {
      type: "account.asset.depreciated",
      idempotencyKey: `account.asset.depreciated#${input.assetId}#${input.periodKey}`,
      payload: { assetId: input.assetId, code: input.code, periodKey: input.periodKey, amountSatang: input.amountSatang },
    },
  ]);
}

/** "ขาย/ตัดจำหน่ายสินทรัพย์" — ยิงจาก `asset.disposeAsset` */
export async function emitAssetDisposed(
  tx: Tx,
  ctx: AccountEventCtx,
  input: { assetId: string; code: string; mode: "SELL" | "WRITE_OFF"; proceedsSatang: number; gainLossSatang: number; disposedAt: Date },
): Promise<void> {
  await emit(tx, ctx, [
    {
      type: "account.asset.disposed",
      idempotencyKey: `account.asset.disposed#${input.assetId}`,
      payload: {
        assetId: input.assetId,
        code: input.code,
        mode: input.mode,
        proceedsSatang: input.proceedsSatang,
        gainLossSatang: input.gainLossSatang,
        disposedAt: eventDay(input.disposedAt),
      },
    },
  ]);
}

/**
 * "เอกสารประจำทำงานแล้ว" — ยิงจาก `service.generateOneRecurringDocument` ทุกครั้งที่สร้างเอกสารสำเร็จ
 * (ข้าม "skipped" — งวดนั้นไม่มีอะไรใหม่ให้บอกปลายทาง) · คีย์มี `runDate` ต่อท้ายเพราะกฎเดียวรันได้ทุกงวด
 */
export async function emitRecurringRan(
  tx: Tx,
  ctx: AccountEventCtx,
  input: { ruleId: string; documentId: string; docType: AccountDocType; runDate: Date; issued: boolean },
): Promise<void> {
  const runDate = eventDay(input.runDate);
  await emit(tx, ctx, [
    {
      type: "account.recurring.ran",
      idempotencyKey: `account.recurring.ran#${input.ruleId}#${runDate}`,
      payload: { ruleId: input.ruleId, documentId: input.documentId, docType: input.docType, runDate, issued: input.issued },
    },
  ]);
}
