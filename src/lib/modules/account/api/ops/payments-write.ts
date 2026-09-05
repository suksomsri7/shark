// ops/payments-write.ts — WRITE ของงานรับ/จ่ายเงิน (WO C2)
//
// 10 op: บันทึกรับ/จ่ายชำระ (หลายครั้ง · WHT · ค่าธรรมเนียม · เช็ค) · อ่านแผงการชำระ · ยกเลิกการชำระ ·
//        คืนมัดจำ · ลิงก์+QR พร้อมเพย์ (สร้าง/ยืนยัน/ยกเลิก) · ใบวางบิลรวม (ใบที่หยิบได้ ·
//        รับชำระกลุ่ม · ยกเลิกการชำระกลุ่ม)
// (การอ่านรายการลิงก์ = `GET /payment-requests` ของ B3 `finance-read.ts` อยู่แล้ว — ไม่ทำซ้ำ)
//
// 🔴 กติกาของชั้นนี้ (เหมือน `documents-write.ts` + ข้อเฉพาะของ "เงิน"):
//   1) ห้ามแตะ prisma ตรง ๆ · ผลลัพธ์ผ่าน `../serialize.ts` เท่านั้น (fitness F5)
//   2) **ห้ามตัดสินสถานะเอกสารก่อนเรียก service** — ด่านกันจ่ายเกิน/จ่ายซ้ำอยู่ใน transaction ที่
//      `SELECT … FOR UPDATE` แถวเอกสารไว้แล้ว (service.recordPayment) ถ้าชั้นนี้อ่านสถานะมาตัดสินเอง
//      ก่อน คำขอ 2 ใบที่มาพร้อมกันจะ "ผ่านด่านของเรา" ทั้งคู่แล้วไปสร้าง payment ซ้อนกัน
//      ⇒ ที่นี่ทำได้อย่างเดียวคือ **แปลผลที่ service ตัดสินแล้ว** ให้เป็น HTTP
//   3) คีย์กันซ้ำ 2 ชั้นคนละความหมาย และต้องมีทั้งคู่:
//      · ชั้น API (`api/idempotency.ts`) กัน "คำขอเดิมที่ยิงซ้ำ" — หมดอายุใน 24 ชม.
//      · ชั้นบริการ (`keyBase`/`clientKey`) กัน "รายการชำระซ้ำ" — ผูกกับแถว payment ตลอดไป
//      ⇒ retry ที่มาหลังแถวกันซ้ำหมดอายุ ยังไม่สร้างเงินซ้ำ เพราะชั้นบริการยังจำได้
//   4) เงินเป็นสตางค์จำนวนเต็ม · วันที่เป็น `YYYY-MM-DD` (วันไทย) · body ทุกตัว `.strict()`

import { createHash } from "node:crypto";
import type { AccountDocType } from "@prisma/client";
import { z } from "zod";
import { ERR } from "../../errors";
import {
  listGroupCandidates,
  recordGroupPayment,
  voidGroupPayment,
  type GroupPaymentDraft,
} from "../../group";
import { paymentPanelData, recordPayments, voidPaymentAny, type PaymentDraft } from "../../payment";
import {
  cancelPaymentRequest,
  confirmStaticPaymentRequest,
  createPaymentRequest,
} from "../../payment-request";
import { getDocRef, refundDeposit } from "../../service";
import { actorRefId } from "../actor";
import { defineOp, type ApiOp } from "../op";
import { ApiError } from "../respond";
import { groupCandidateView, paymentPanelView } from "../serialize";
import { paymentRequestView } from "../serialize-finance";
import { toWhtIncomeType, whtIncomeTypeField } from "../wht-income";

// ── ตัวช่วยร่วม ─────────────────────────────────────────────────────────────

const YMD = /^\d{4}-\d{2}-\d{2}$/;
/** จำนวนตัวอักษรของ `note` ที่เก็บได้จริง (service ตัดที่ 20) — บอกผู้เรียกตรง ๆ ดีกว่าตัดเงียบ */
const MAX_NOTE = 20;
const MAX_ROWS = 20;

const ymdField = (what: string) =>
  z
    .string()
    .regex(YMD, `${what} ต้องเป็นวันที่รูปแบบ YYYY-MM-DD`)
    .describe(`${what} (Thai calendar day, YYYY-MM-DD).`);

const idField = (what: string) => z.string().min(1).max(40).describe(what);

const noBody = z.object({}).strict();

function notFoundDoc(): ApiError {
  return new ApiError(404, "not_found", ERR.DOC_NOT_FOUND, "The document was not found in this accounting book.");
}

function stateConflict(message_th: string): ApiError {
  return new ApiError(409, "state_conflict", message_th, "The record is not in a state that allows this operation.");
}

/**
 * `{ ok:false, reason }` ของ service → error ที่ `mapError` แปลต่อได้
 * ข้อความที่ mapError จับคำไม่ถึง (ไม่มี "ร่าง"/"สถานะ"/"ซ้ำ") แต่ความหมายคือ "สถานะไม่ให้ทำ"
 * ต้องบังคับเป็น 409 ที่นี่ — ไม่ใช่ไปแก้ข้อความใน service ซึ่งมีคนอ่านบนหน้าจออยู่
 */
function failPayment(reason: string): never {
  if (reason.includes("เกินยอดคงเหลือ") || reason.includes("ถูกยกเลิกแล้ว") || reason.includes("ไม่มียอดคงค้าง")) {
    throw stateConflict(reason);
  }
  throw new Error(reason);
}

/**
 * คีย์กันซ้ำของชั้นบริการ — มาจาก (คีย์ที่ยิง, ค่า Idempotency-Key ของคำขอ) เสมอ
 * ⇒ แอปคนละตัวที่บังเอิญใช้ค่า Idempotency-Key เดียวกัน ไม่ไปอ่านผลของกันและกัน
 */
function serviceKey(keyId: string, idempotencyKey: string | null, requestId: string): string {
  return `api:${keyId}:${idempotencyKey ?? requestId}`;
}

/**
 * คีย์กันซ้ำของ "การชำระกลุ่ม" — `group.groupBatchKey` หนีบ clientKey ไว้ที่ 60 ตัวอักษร
 * (batchKey ต้องพอใส่ใน path ของ endpoint ยกเลิก) ⇒ ส่งสตริงยาวเข้าไปตรง ๆ เสี่ยงถูกตัดจน
 * ส่วนที่ทำให้ "ต่างคำขอ" หายไป แล้วคำขอคนละใบได้ batchKey เดียวกัน = ผลของใบแรกถูกคืนซ้ำ
 * ⇒ ย่อด้วย sha256 ให้ยาวคงที่ 40 ตัว (ยังคงเป็นฟังก์ชันของคำขอเดิม ⇒ retry ได้ผลเดิมเป๊ะ)
 */
function groupClientKey(keyId: string, idempotencyKey: string | null, requestId: string): string {
  return createHash("sha256").update(serviceKey(keyId, idempotencyKey, requestId)).digest("hex").slice(0, 40);
}

// ── 1. บันทึกรับ/จ่ายชำระ ───────────────────────────────────────────────────

const chequeInput = z
  .object({
    chequeNo: z.string().min(1).max(40).describe("Cheque number as printed on the cheque."),
    bankName: z.string().min(1).max(80).describe("Name of the bank that issued the cheque."),
    chequeDate: ymdField("chequeDate"),
  })
  .strict()
  .describe(
    "Present when this payment is settled by cheque. The money is not in the bank account yet, so the cheque is " +
      "registered in the cheque book and the finance account is only touched when the cheque clears.",
  );

const paymentRowInput = z
  .object({
    paidAt: ymdField("paidAt"),
    financeAccountId: idField("Id of the finance account (cash box, bank account, wallet) the money moves through. May be null only when `cheque` is sent.").nullish(),
    amountSatang: z
      .number()
      .int()
      .positive()
      .describe("Money actually received or paid in satang (integer), excluding any withholding tax. 1,070.00 baht is 107000."),
    /**
     * WO D1: **ไม่บังคับแม้จะหักภาษีไว้** — ประเภทเงินได้เป็นของ "ใบ 50 ทวิ" ไม่ใช่ของ "การจ่ายเงิน"
     * (C2 เคยบังคับไว้ แล้วปิดทางเดินจริงของสำนักงานบัญชี: จ่ายเงินวันนี้ ตกลงประเภทเงินได้กับผู้ขาย
     * ทีหลัง แล้วค่อยออกใบด้วย `POST /wht/certs`) · ส่งมาที่นี่ = ออกใบให้เลยตอนบันทึกจ่าย
     */
    whtIncomeType: whtIncomeTypeField.nullish(),
    whtRateBp: z
      .number()
      .int()
      .min(0)
      .max(10000)
      .nullish()
      .describe("Withholding tax rate in basis points: 300 = 3%. Printed on the certificate."),
    whtAmountSatang: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe("Withholding tax in satang. It settles the invoice as well, so amountSatang plus this is what clears the debt. Default 0."),
    feeSatang: z.number().int().min(0).optional().describe("Bank or gateway fee in satang, booked as an expense. Default 0."),
    note: z.string().max(MAX_NOTE).nullish().describe(`Short note kept on the payment row, at most ${MAX_NOTE} characters.`),
    cheque: chequeInput.nullish(),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (!v.financeAccountId && !v.cheque) {
      ctx.addIssue({ code: "custom", path: ["financeAccountId"], message: "ต้องระบุช่องทางการเงิน (ยกเว้นการชำระด้วยเช็ค)" });
    }
  });

type PaymentRowPayload = z.infer<typeof paymentRowInput>;

/** แถวของ API → ร่างของ service (ค่าที่ไม่ส่งมา = ค่าปริยายที่ service คาดหวัง ไม่ใช่ undefined) */
function toDraft(r: PaymentRowPayload): PaymentDraft {
  return {
    paidAt: r.paidAt,
    financeAccountId: r.financeAccountId ?? null,
    amountSatang: r.amountSatang,
    note: r.note ?? "",
    whtIncomeType: r.whtIncomeType ? toWhtIncomeType(r.whtIncomeType) : null,
    whtRateBp: r.whtRateBp ?? null,
    whtAmountSatang: r.whtAmountSatang ?? 0,
    feeSatang: r.feeSatang ?? 0,
    cheque: r.cheque
      ? { chequeNo: r.cheque.chequeNo, bankName: r.cheque.bankName, chequeDate: r.cheque.chequeDate }
      : null,
  };
}

const recordInput = z
  .object({
    documentId: idField("Id of the invoice, deposit, purchase or expense being settled. A receipt issued from an invoice settles the invoice."),
    rows: z
      .array(paymentRowInput)
      .min(1)
      .max(MAX_ROWS)
      .describe("One entry per time money moved. Several entries are recorded as one batch, in order."),
  })
  .strict();

const paymentsRecord = defineOp({
  id: "payments.record",
  method: "POST",
  path: "/payments",
  kind: "write",
  action: "account.payment.record",
  summary:
    "Record money received or paid against a document, with optional withholding tax, bank fee and cheque. The ledger, the document status and the finance account balance all move together.",
  label: "บันทึกรับ/จ่ายชำระ",
  tool: { name: "account_record_payment", hint: "Use for \"the customer paid\" or \"we paid this bill\". One payment per call; proposed for confirmation." },
  input: recordInput,
  test: "C2-P1.1",
  async handler({ actor, input, idempotencyKey, requestId }) {
    const { tenantId, systemId } = actor;
    const res = await recordPayments(tenantId, systemId, input.documentId, input.rows.map(toDraft), {
      userId: null,
      keyBase: serviceKey(actorRefId(actor), idempotencyKey, requestId),
    });
    if (!res.ok) failPayment(res.reason);
    return {
      // ใบเสร็จที่ออกจากใบแจ้งหนี้ไม่มีลูกหนี้ของตัวเอง ⇒ เงินไปตัดที่ใบแจ้งหนี้ · บอกผู้เรียกว่าใบไหน
      documentId: res.targetDocId,
      status: res.status,
      paidSatang: res.paidTotal,
      outstandingSatang: res.outstanding,
      payments: res.paymentIds,
      whtCertNos: res.certNos,
    };
  },
});

// ── 2. แผงการชำระของเอกสาร ─────────────────────────────────────────────────

const paymentsList = defineOp({
  id: "payments.list",
  method: "GET",
  path: "/documents/{id}/payments",
  kind: "read",
  action: "account.doc.view",
  summary: "Every payment recorded against this document, including the voided ones, with the totals of the document.",
  label: "การชำระของเอกสาร",
  input: noBody,
  test: "C2-P1.7",
  async handler({ actor, params }) {
    const panel = await paymentPanelData(actor.tenantId, actor.systemId, params.id ?? "");
    if (!panel) throw notFoundDoc();
    return paymentPanelView(panel);
  },
});

// ── 3. ยกเลิกการชำระ (danger) ──────────────────────────────────────────────

const voidPaymentInput = z
  .object({
    documentId: idField("Id of the document this payment belongs to."),
    reason: z
      .string()
      .min(5)
      .max(500)
      .describe("Why the payment is being reversed, at least 5 characters. Stored on the reversing journal entry and in the audit log."),
  })
  .strict();

const paymentsVoid = defineOp({
  id: "payments.void",
  method: "POST",
  path: "/payments/{paymentId}/void",
  kind: "danger",
  action: "account.payment.void",
  summary: "Reverse one recorded payment. A reversing journal entry is written; nothing is deleted and the document goes back to awaiting payment.",
  label: "ยกเลิกการชำระ",
  tool: { name: "account_void_payment", hint: "Irreversible: reverses one recorded payment. Needs a reason and a double confirmation." },
  input: voidPaymentInput,
  test: "C2-P4.2",
  async handler({ actor, params, input }) {
    const { tenantId, systemId } = actor;
    const res = await voidPaymentAny(tenantId, systemId, input.documentId, params.paymentId ?? "", input.reason);
    if (!res.ok) failPayment(res.reason);
    const doc = await getDocRef(tenantId, systemId, input.documentId);
    if (!doc) throw notFoundDoc();
    return { documentId: doc.id, status: doc.status };
  },
});

// ── 4. คืนมัดจำ (danger) ───────────────────────────────────────────────────

const refundInput = z
  .object({
    reason: z
      .string()
      .min(5)
      .max(500)
      .describe("Why the deposit is being returned, at least 5 characters. Stored on the document and in the audit log."),
  })
  .strict();

const documentsRefundDeposit = defineOp({
  id: "documents.refund-deposit",
  method: "POST",
  path: "/documents/{id}/refund-deposit",
  kind: "danger",
  action: "account.doc.void",
  summary: "Give a paid deposit back to the customer or get it back from the vendor. The deposit document is voided and its ledger entry reversed.",
  label: "คืนมัดจำ",
  input: refundInput,
  test: "C2-P5.4",
  async handler({ actor, params, input }) {
    const { tenantId, systemId } = actor;
    const id = params.id ?? "";
    const res = await refundDeposit(tenantId, systemId, id, input.reason);
    if (!res.ok) failPayment(res.reason);
    const doc = await getDocRef(tenantId, systemId, id);
    if (!doc) throw notFoundDoc();
    return { refundedSatang: res.refunded, status: doc.status };
  },
});

// ── 5. ลิงก์ + QR พร้อมเพย์ ────────────────────────────────────────────────

const payReqCreateInput = z
  .object({
    documentId: idField("Id of the invoice, deposit receipt or debit note to collect. The amount is always the outstanding balance at this moment; it is never taken from the request."),
    financeAccountId: idField("Id of the bank account or wallet the money should land in. It must have a PromptPay id set."),
    expiresInDays: z
      .number()
      .int()
      .min(1)
      .max(90)
      .optional()
      .describe("How long the link stays usable. Default 7 days."),
  })
  .strict();

const paymentRequestsCreate = defineOp({
  id: "payment-requests.create",
  method: "POST",
  path: "/payment-requests",
  kind: "write",
  action: "account.payment.record",
  summary:
    "Create the link and PromptPay QR the customer pays with. Asking again while an identical request is still pending returns the same one instead of a second link.",
  label: "สร้างลิงก์ชำระเงิน",
  input: payReqCreateInput,
  test: "C2-P6.1",
  async handler({ actor, input }) {
    const ctx = { tenantId: actor.tenantId, systemId: actor.systemId };
    const res = await createPaymentRequest(ctx, input.documentId, {
      financeId: input.financeAccountId,
      expiresInDays: input.expiresInDays ?? null,
      userId: null,
    });
    if (!res.ok) failPayment(res.reason);
    return { ...paymentRequestView(res.request), reused: res.reused };
  },
});

const payReqConfirmInput = z
  .object({
    paidAt: ymdField("paidAt").optional(),
  })
  .strict();

const paymentRequestsConfirm = defineOp({
  id: "payment-requests.confirm",
  method: "POST",
  path: "/payment-requests/{id}/confirm",
  kind: "write",
  action: "account.payment.record",
  summary:
    "Confirm by hand that the money for a static PromptPay request has arrived. The payment is recorded once; confirming again returns the same payment with duplicated true.",
  label: "ยืนยันรับเงินตามลิงก์",
  input: payReqConfirmInput,
  test: "C2-P6.3",
  async handler({ actor, params, input }) {
    const ctx = { tenantId: actor.tenantId, systemId: actor.systemId };
    const res = await confirmStaticPaymentRequest(ctx, params.id ?? "", {
      userId: null,
      ...(input.paidAt ? { paidAt: new Date(`${input.paidAt}T00:00:00.000Z`) } : {}),
    });
    if (!res.ok) failPayment(res.reason);
    return { paymentId: res.paymentId, duplicated: res.duplicated };
  },
});

const paymentRequestsCancel = defineOp({
  id: "payment-requests.cancel",
  method: "POST",
  path: "/payment-requests/{id}/cancel",
  kind: "write",
  action: "account.payment.record",
  summary: "Cancel a pending payment request. The link stops working immediately. A request that was already paid cannot be cancelled.",
  label: "ยกเลิกลิงก์ชำระเงิน",
  input: noBody,
  test: "C2-P6.5",
  async handler({ actor, params }) {
    const ctx = { tenantId: actor.tenantId, systemId: actor.systemId };
    const id = params.id ?? "";
    const res = await cancelPaymentRequest(ctx, id, null);
    if (!res.ok) failPayment(res.reason);
    return { id, status: "CANCELLED" };
  },
});

// ── 6. ใบวางบิลรวม / ใบรวมจ่าย ─────────────────────────────────────────────

const GROUP_TYPES = ["BILLING_NOTE", "COMBINED_PAYMENT"] as const;

const candidatesInput = z
  .object({
    type: z
      .enum(GROUP_TYPES)
      .describe("BILLING_NOTE groups what customers owe you; COMBINED_PAYMENT groups what you owe vendors."),
    contactId: idField("Id of the customer or vendor. Only documents of one contact can be grouped."),
  })
  .strict();

const documentsGroupCandidates = defineOp({
  id: "documents.group-candidates",
  method: "GET",
  path: "/documents/group-candidates",
  kind: "read",
  action: "account.doc.view",
  summary:
    "Documents of this contact that can go into a billing note or combined payment. Documents that are already in another open group are returned too, with eligible false and the reason.",
  label: "เอกสารที่รวมเข้ากลุ่มได้",
  input: candidatesInput,
  test: "C2-P7.1",
  async handler({ actor, input }) {
    const rows = await listGroupCandidates(
      actor.tenantId,
      actor.systemId,
      input.type as AccountDocType,
      input.contactId,
    );
    return rows.map(groupCandidateView);
  },
});

const groupWhtInput = z
  .object({
    childDocId: idField("Id of the child document this withholding tax belongs to."),
    whtIncomeType: whtIncomeTypeField,
    whtRateBp: z.number().int().min(0).max(10000).nullish().describe("Withholding tax rate in basis points: 300 = 3%."),
    whtAmountSatang: z.number().int().min(0).describe("Withholding tax deducted from that child document, in satang."),
  })
  .strict();

const groupPaymentInput = z
  .object({
    groupId: idField("Id of the billing note or combined payment."),
    paidAt: ymdField("paidAt"),
    financeAccountId: idField("Id of the finance account the money moves through. May be null only when `cheque` is sent.").nullish(),
    tieOffSatang: z
      .number()
      .int()
      .positive()
      .describe("Total debt settled by this transfer in satang, cash plus withholding tax. It is spread over the child documents oldest due date first."),
    feeSatang: z.number().int().min(0).optional().describe("Bank fee of this transfer in satang, booked once on the first child document. Default 0."),
    note: z.string().max(MAX_NOTE).nullish().describe(`Short note kept on each payment row, at most ${MAX_NOTE} characters.`),
    wht: z.array(groupWhtInput).max(200).optional().describe("Withholding tax per child document, when the payer deducted it."),
    cheque: chequeInput.nullish(),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (!v.financeAccountId && !v.cheque) {
      ctx.addIssue({ code: "custom", path: ["financeAccountId"], message: "ต้องระบุช่องทางการเงิน (ยกเว้นการชำระด้วยเช็ค)" });
    }
  });

const paymentsRecordGroup = defineOp({
  id: "payments.record-group",
  method: "POST",
  path: "/payments/group",
  kind: "write",
  action: "account.payment.record",
  summary:
    "Record one transfer against a billing note or combined payment. The amount is spread over the child documents oldest due date first, and each child gets its own payment and ledger entry.",
  label: "รับ/จ่ายชำระแบบกลุ่ม",
  input: groupPaymentInput,
  test: "C2-P7.3",
  async handler({ actor, input, idempotencyKey, requestId }) {
    const { tenantId, systemId } = actor;
    const draft: GroupPaymentDraft = {
      paidAt: input.paidAt,
      financeAccountId: input.financeAccountId ?? null,
      tieOffSatang: input.tieOffSatang,
      note: input.note ?? "",
      feeSatang: input.feeSatang ?? 0,
      wht: (input.wht ?? []).map((w) => ({
        childDocId: w.childDocId,
        incomeType: toWhtIncomeType(w.whtIncomeType),
        rateBp: w.whtRateBp ?? null,
        amountSatang: w.whtAmountSatang,
      })),
      cheque: input.cheque
        ? { chequeNo: input.cheque.chequeNo, bankName: input.cheque.bankName, chequeDate: input.cheque.chequeDate }
        : null,
    };
    const res = await recordGroupPayment(tenantId, systemId, input.groupId, draft, {
      userId: null,
      clientKey: groupClientKey(actorRefId(actor), idempotencyKey, requestId),
    });
    if (!res.ok) failPayment(res.reason);
    return {
      // batchKey = "ครั้งนี้" ของกลุ่ม — ผู้เรียกเก็บไว้ยิงยกเลิกทั้งครั้งได้ในคำสั่งเดียว
      batchKey: res.batchKey,
      recorded: res.recorded,
      allocations: res.allocations.map((a) => ({
        childDocumentId: a.childDocId,
        docNo: a.docNo,
        tieOffSatang: a.tieOff,
        whtSatang: a.wht,
        cashSatang: a.cash,
      })),
      status: res.status,
      outstandingSatang: res.outstanding,
      whtCertNos: res.certNos,
    };
  },
});

const voidGroupInput = z
  .object({
    groupId: idField("Id of the billing note or combined payment the batch belongs to."),
    reason: z
      .string()
      .min(5)
      .max(500)
      .describe("Why the whole transfer is being reversed, at least 5 characters. Stored on every reversing journal entry."),
  })
  .strict();

const paymentsVoidGroup = defineOp({
  id: "payments.void-group",
  method: "POST",
  path: "/payments/group/{batchKey}/void",
  kind: "danger",
  action: "account.payment.void",
  summary: "Reverse every payment created by one group transfer. Each child document gets a reversing journal entry and goes back to awaiting payment.",
  label: "ยกเลิกการชำระแบบกลุ่ม",
  input: voidGroupInput,
  test: "C2-P7.4",
  async handler({ actor, params, input }) {
    const res = await voidGroupPayment(
      actor.tenantId,
      actor.systemId,
      input.groupId,
      params.batchKey ?? "",
      input.reason,
    );
    if (!res.ok) failPayment(res.reason);
    return { voided: res.voided };
  },
});

export const PAYMENTS_WRITE_OPS: ApiOp[] = [
  paymentsRecord,
  paymentsList,
  paymentsVoid,
  documentsRefundDeposit,
  paymentRequestsCreate,
  paymentRequestsConfirm,
  paymentRequestsCancel,
  documentsGroupCandidates,
  paymentsRecordGroup,
  paymentsVoidGroup,
];
