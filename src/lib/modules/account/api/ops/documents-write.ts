// ops/documents-write.ts — WRITE ของงานเอกสาร (WO C1)
//
// 23 op: สร้าง/แก้/ยกเลิกร่าง/ออกเอกสาร/แปลง/ตอบรับ/อนุมัติ/ปฏิเสธ/ยกเลิก(void)/รับใบกำกับ/
//        มัดจำ/ลิงก์สาธารณะ/แท็ก/ไฟล์แนบ/เตือนชำระ/รายการโปรด/เอกสารประจำ (CRUD + run)
//
// 🔴 กติกาของชั้นนี้ (เหมือน `documents-read.ts` + ข้อของ "การเขียน"):
//   1) ห้ามแตะ prisma ตรง ๆ — เรียกผ่าน service เท่านั้น (fitness F5) · ผลลัพธ์ผ่าน `../serialize.ts`
//   2) เอกสารทุกใบที่เกิดจาก REST ตั้ง `source: "API"` + `createdById: null` — ในบัญชีต้องแยกออกเสมอ
//      ว่า "ใบนี้แอปภายนอกยิงเข้ามา" ไม่ใช่คนในร้านพิมพ์เอง (หน้าจอ/audit อ่านจากคอลัมน์นี้)
//   3) service ส่วนใหญ่คืน `{ ok: false, reason }` แทนการโยน ⇒ ต้อง **แปลงเป็น HTTP เอง**
//      · เหตุผลที่ mapError จับคำได้ (ไทย + คำสำคัญ) → `throw new Error(reason)` พอ
//      · เหตุผลที่คำไม่ตรงกติกาจับคำ (เช่น "เอกสารนี้ออกแล้ว" ไม่มีคำว่า "ร่าง"/"สถานะ")
//        → อ่านสถานะจริงก่อนแล้วโยน `ApiError(409, "state_conflict", …)` ตรง ๆ
//        (ห้ามไปแก้ข้อความใน service — ข้อความนั้นมีคนอ่านบนหน้าจออยู่)
//   4) เงินเป็นสตางค์จำนวนเต็มเสมอ · วันที่เป็น `YYYY-MM-DD` (วันไทย) · body ทุกตัว `.strict()`

import type { AccountDocType, AccountVatMode, AccountVatTiming } from "@prisma/client";
import { z } from "zod";
import {
  archiveAttachment,
  createAttachment,
  listDocumentAttachmentFiles,
  unlinkAttachment,
} from "../../attachment";
import { canCreateDirect, sideOf } from "../../doc-editor-config";
import { ERR } from "../../errors";
import {
  approvePurchaseOrder,
  convertPurchaseOrder,
  createExpenseDoc,
  createPurchaseOrder,
  issueExpenseDoc,
  listDeductiblePaidDeposits,
  markAssetReceived,
  receivePurchaseTaxInvoice,
  rejectPurchaseOrder,
  setExpenseDocDeposits,
  submitForApproval,
  updateExpenseDoc,
  voidExpenseDoc,
  type ExpLineInput,
  type VatPurchaseMode,
} from "../../expense";
import { createGroupDoc, isGroupDocType } from "../../group";
import {
  isRecurringDocType,
  parseYmd,
  validateRuleInput,
  type RecurringTemplate,
} from "../../recurring-shared";
import {
  cancelDraft,
  convertDocument,
  createDocument,
  createRecurringRule,
  deleteRecurringRule,
  ensurePublicTaxInvoiceLink,
  findDocByRef,
  getContact,
  getDocRef,
  getDocument,
  getRecurringRule,
  issueDocument,
  listDeductibleDeposits,
  runRecurringRules,
  saveDocFavorite,
  sendPaymentReminder,
  setDocDeposits,
  setDocumentTags,
  setQuotationResponse,
  setRecurringRuleActive,
  updateDocument,
  updateRecurringRule,
  voidDocument,
  type RecurringRuleInput,
} from "../../service";
import { actorDocSource, actorRefId } from "../actor";
import { defineOp, type ApiOp } from "../op";
import { ApiError } from "../respond";
import { docRow, ymd } from "../serialize";

// ── ค่าคงที่ของสัญญา ────────────────────────────────────────────────────────

/**
 * ชนิดเอกสารที่ "สร้างตรง" ผ่าน API ได้ (ตาราง §C1) — ชนิดอื่นต้องเกิดจากการแปลงเอกสารเท่านั้น
 * (RECEIPT/TAX_INVOICE เกิดจากใบแจ้งหนี้ · TAX_INVOICE_ABB มาจาก POS · GOODS_ISSUE/COST_ADJUSTMENT/
 *  WHT_CERT มีเส้นทางของตัวเอง) ⇒ ส่งชนิดนอกรายการนี้มา = 422 พร้อมบอกว่าใช้ได้ชนิดไหน
 */
const DIRECT_DOC_TYPES = [
  "QUOTATION",
  "INVOICE",
  "DEPOSIT_RECEIPT",
  "CREDIT_NOTE",
  "DEBIT_NOTE",
  "BILLING_NOTE",
  "EXPENSE",
  "PURCHASE",
  "PURCHASE_ORDER",
  "ASSET_PURCHASE_ORDER",
  "ASSET_PURCHASE",
  "PURCHASE_TAX_INVOICE",
  "DEPOSIT_PAYMENT",
  "CREDIT_NOTE_RECEIVED",
  "DEBIT_NOTE_RECEIVED",
  "COMBINED_PAYMENT",
] as const satisfies readonly AccountDocType[];

type DirectDocType = (typeof DIRECT_DOC_TYPES)[number];

/** ชนิดที่ `createExpenseDoc` เป็นเจ้าของ (ฝั่งจ่าย ยกเว้นใบสั่งซื้อและใบรวมจ่ายซึ่งมีทางของตัวเอง) */
const PURCHASE_ORDER_TYPES: readonly AccountDocType[] = ["PURCHASE_ORDER", "ASSET_PURCHASE_ORDER"];

const YMD = /^\d{4}-\d{2}-\d{2}$/;
const MAX_TAGS = 10;
const MAX_TAG_LEN = 30;
const MAX_LINES = 200;

const ymdField = (what: string) =>
  z
    .string()
    .regex(YMD, `${what} ต้องเป็นวันที่รูปแบบ YYYY-MM-DD`)
    .describe(`${what} (Thai calendar day, YYYY-MM-DD).`);

/** `YYYY-MM-DD` → Date เที่ยงคืน UTC — วิธีเดียวกับฟอร์มบนหน้าจอ (`editor-actions.dateOf`) */
function dayToDate(day: string): Date {
  return new Date(`${day}T00:00:00.000Z`);
}

function notFound(): ApiError {
  return new ApiError(404, "not_found", ERR.DOC_NOT_FOUND, "The document was not found in this accounting book.");
}

function stateConflict(message_th: string): ApiError {
  return new ApiError(
    409,
    "state_conflict",
    message_th,
    "The document is not in a state that allows this operation.",
  );
}

/** ผลลัพธ์ `{ ok:false, reason }` ของ service → error ที่ `mapError` แปลต่อได้ (ข้อความไทยเดิม) */
function failWith(reason: string): never {
  throw new Error(reason);
}

// ── ตัวแปลงคำตอบ ───────────────────────────────────────────────────────────

type DocWriteRow = ReturnType<typeof docRow> & { note: string | null };

/**
 * คำตอบมาตรฐานของ op ที่ "คืนเอกสารทั้งใบ" = `DocRow` ของ B1 + `note`
 * (`note` ไม่อยู่ใน DocRow ของหน้ารายการเพราะไม่มีใครแสดงในตาราง แต่ผู้เรียกที่เพิ่งเขียนเอกสาร
 *  ต้องอ่านกลับได้ว่าข้อความที่ส่งไปถูกบันทึกจริง)
 */
async function docWriteRow(tenantId: string, systemId: string, id: string): Promise<DocWriteRow> {
  const doc = await getDocument(tenantId, systemId, id);
  if (!doc) throw notFound();
  return { ...docRow(doc), note: doc.note };
}

/** คำตอบสั้นของ op ที่เปลี่ยนสถานะ (ออกเอกสาร/อนุมัติ/ยกเลิก) — ผู้เรียกอยากรู้แค่เลขที่+สถานะ */
async function docStateRow(
  tenantId: string,
  systemId: string,
  id: string,
): Promise<{ id: string; docNo: string | null; status: string; type: AccountDocType }> {
  const d = await getDocRef(tenantId, systemId, id);
  if (!d) throw notFound();
  return { id: d.id, docNo: d.docNo, status: d.status, type: d.docType };
}

// ── สคีมาร่วม ──────────────────────────────────────────────────────────────

const lineInput = z
  .object({
    description: z.string().min(1).max(1000).describe("What is being sold or bought, as it appears on the printed document."),
    qty: z.number().positive().max(1_000_000).describe("Quantity. Must be greater than zero; fractional quantities are allowed."),
    unitName: z.string().max(40).nullish().describe("Unit label, for example `ชิ้น` or `ทริป`."),
    unitPriceSatang: z.number().int().min(0).describe("Price of one unit in satang (integer). 1,250.50 baht is 125050."),
    discountSatang: z.number().int().min(0).optional().describe("Discount of this line in satang (integer). Default 0."),
    vatRateBp: z
      .union([z.literal(700), z.literal(0), z.literal(-1)])
      .optional()
      .describe("VAT rate in basis points: 700 = 7%, 0 = zero rated, -1 = exempt. Default: the rate in the book settings."),
    productId: z.string().max(40).nullish().describe("Id of a product in this book, when the line comes from the catalogue."),
    accountId: z.string().max(40).nullish().describe("Id of the chart of accounts entry to post this line to (expense and asset documents)."),
  })
  .strict();

type LineInputPayload = z.infer<typeof lineInput>;

/** บรรทัดของ API (`…Satang`) → บรรทัดของ service (`unitPrice`/`discount` เป็นสตางค์อยู่แล้ว) */
function toServiceLines(lines: LineInputPayload[]): ExpLineInput[] {
  return lines.map((l) => ({
    description: l.description,
    qty: l.qty,
    unitName: l.unitName ?? null,
    unitPrice: l.unitPriceSatang,
    discount: l.discountSatang ?? 0,
    ...(l.vatRateBp === undefined ? {} : { vatRateBp: l.vatRateBp }),
    productId: l.productId ?? null,
    accountId: l.accountId ?? null,
  }));
}

const tagsField = z
  .array(z.string().min(1).max(MAX_TAG_LEN))
  .max(MAX_TAGS)
  .describe(`Labels for grouping documents. At most ${MAX_TAGS} tags, each at most ${MAX_TAG_LEN} characters.`);

const vatModeField = z
  .enum(["EXCLUDE", "INCLUDE", "NONE"])
  .describe("How the unit prices relate to VAT: `EXCLUDE` (price before VAT), `INCLUDE` (price already contains VAT) or `NONE`.");
const vatTimingField = z
  .enum(["ON_ISSUE", "ON_PAYMENT"])
  .describe("Tax point: `ON_ISSUE` for goods, `ON_PAYMENT` for services. Default: the setting of the book.");
const vatPurchaseModeField = z
  .enum(["CLAIM", "AWAITING", "NO_CLAIM"])
  .describe("Purchase VAT handling: `CLAIM` (claimable now), `AWAITING` (waiting for the tax invoice) or `NO_CLAIM`.");

const documentFields = {
  contactId: z.string().max(40).nullish().describe("Id of the customer or vendor in this book."),
  issueDate: ymdField("issueDate").optional(),
  dueDate: ymdField("dueDate").nullish(),
  validUntil: ymdField("validUntil").nullish(),
  vatMode: vatModeField.optional(),
  vatTiming: vatTimingField.optional(),
  vatPurchaseMode: vatPurchaseModeField.optional(),
  discountSatang: z.number().int().min(0).optional().describe("Discount on the whole document in satang (integer)."),
  note: z.string().max(2000).nullish().describe("Note printed on the document."),
  adjustReason: z.string().max(500).nullish().describe("Reason required by the Revenue Department on credit and debit notes."),
  sourceDocId: z.string().max(40).nullish().describe("Id of the document this one refers to (credit and debit notes)."),
  tags: tagsField.optional(),
} as const;

const createInput = z
  .object({
    type: z
      .enum(DIRECT_DOC_TYPES)
      .describe("Document type to create. Types that only come from a conversion (RECEIPT, TAX_INVOICE) are rejected with 422."),
    ...documentFields,
    refType: z.string().min(1).max(60).optional().describe("Name of the record in your own system this document belongs to, for example `Booking`."),
    refId: z.string().min(1).max(60).optional().describe("Id of that record. Sending the same pair twice returns 409 `duplicate` with the existing id in `hint`."),
    childIds: z
      .array(z.string().max(40))
      .max(200)
      .optional()
      .describe("Documents to group, for BILLING_NOTE and COMBINED_PAYMENT only. At least 2 ids."),
    lines: z.array(lineInput).max(MAX_LINES).optional().describe("Lines of the document. At least one, except for BILLING_NOTE and COMBINED_PAYMENT which take `childIds` instead."),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (isGroupDocType(v.type)) {
      if (v.lines && v.lines.length > 0) {
        ctx.addIssue({ code: "custom", path: ["lines"], message: "เอกสารกลุ่มไม่รับบรรทัดสินค้า — ใช้ childIds แทน" });
      }
      if (!v.childIds || v.childIds.length < 2) {
        ctx.addIssue({ code: "custom", path: ["childIds"], message: "เอกสารกลุ่มต้องเลือกเอกสารลูกอย่างน้อย 2 ใบ" });
      }
      if (!v.contactId) {
        ctx.addIssue({ code: "custom", path: ["contactId"], message: "เอกสารกลุ่มต้องระบุผู้ติดต่อ" });
      }
      return;
    }
    if (v.childIds) {
      ctx.addIssue({ code: "custom", path: ["childIds"], message: "childIds ใช้ได้เฉพาะ BILLING_NOTE/COMBINED_PAYMENT" });
    }
    if (!v.lines || v.lines.length === 0) {
      ctx.addIssue({ code: "custom", path: ["lines"], message: "ต้องมีรายการอย่างน้อย 1 รายการ" });
    }
    if ((v.refType && !v.refId) || (v.refId && !v.refType)) {
      ctx.addIssue({ code: "custom", path: ["refId"], message: "refType กับ refId ต้องส่งมาคู่กัน" });
    }
  });

const updateInput = z
  .object({
    ...documentFields,
    lines: z.array(lineInput).min(1).max(MAX_LINES).optional().describe("Replaces every line of the draft when sent. Omit to keep the current lines."),
  })
  .strict();

const noBody = z.object({}).strict();

// ── ตัวช่วยของ handler ─────────────────────────────────────────────────────

/** ผู้ติดต่อของร้านอื่น/ไม่มีจริง = 404 (ไม่ใช่ 422) — id คือ "คำขอ" เสมอ ต้องพิสูจน์ก่อนใช้ */
async function assertContact(tenantId: string, systemId: string, contactId: string | null | undefined): Promise<void> {
  if (!contactId) return;
  const c = await getContact(tenantId, systemId, contactId);
  if (!c) {
    throw new ApiError(404, "not_found", ERR.CONTACT_NOT_FOUND, "No such contact in this accounting book.");
  }
}

/** โดเมนของลิงก์ที่ส่งออก — `@/lib/env` อ่าน process.env ตอนโหลด ⇒ ต้อง import แบบ dynamic (F10) */
async function appOrigin(): Promise<string> {
  try {
    const { env } = await import("@/lib/env");
    return (env.APP_URL || "https://shark.in.th").replace(/\/$/, "");
  } catch {
    return "https://shark.in.th";
  }
}

const vatFieldsOf = (input: {
  vatMode?: AccountVatMode;
  vatTiming?: AccountVatTiming;
  vatPurchaseMode?: VatPurchaseMode;
}) => ({
  ...(input.vatMode ? { vatMode: input.vatMode } : {}),
  ...(input.vatTiming ? { vatTiming: input.vatTiming } : {}),
  ...(input.vatPurchaseMode ? { vatPurchaseMode: input.vatPurchaseMode } : {}),
});

// ── 1. สร้างเอกสาร ─────────────────────────────────────────────────────────

const documentsCreate = defineOp({
  id: "documents.create",
  method: "POST",
  path: "/documents",
  kind: "write",
  action: "account.doc.create",
  summary: "Create a document as a draft: quotation, invoice, deposit, credit or debit note, expense, purchase, purchase order, or a grouped billing note.",
  label: "สร้างเอกสาร",
  tool: { name: "account_create_document", hint: "Proposes the document; it is created only after the owner confirms." },
  input: createInput,
  test: "C1-W1.1",
  async handler({ actor, input }) {
    const { tenantId, systemId } = actor;
    const type = input.type as DirectDocType;
    if (!canCreateDirect(type) && type !== "PURCHASE_TAX_INVOICE") {
      // ตาข่ายชั้นสอง (สคีมาปิดไว้แล้ว) — เผื่อวันหนึ่งมีชนิดใหม่ที่ "แปลงเท่านั้น" เพิ่มเข้ามา
      throw new ApiError(
        422,
        "validation",
        `เอกสารชนิด ${type} สร้างตรงไม่ได้ — ต้องแปลงมาจากเอกสารต้นทาง`,
        `${type} cannot be created directly; convert it from a source document instead.`,
      );
    }
    await assertContact(tenantId, systemId, input.contactId);

    // กันซ้ำระดับธุรกิจ: คู่ (refType, refId) ของชนิดนี้ต้องมีเอกสารได้ใบเดียว
    // (คนละชั้นกับ Idempotency-Key ซึ่งกัน "คำขอเดิมที่ยิงซ้ำ" — ตัวนี้กัน "งานเดิมที่ยิงคนละครั้ง")
    if (input.refType && input.refId) {
      const dup = await findDocByRef(systemId, type, input.refType, input.refId);
      if (dup) {
        throw new ApiError(
          409,
          "duplicate",
          `มีเอกสารของ ${input.refType} ${input.refId} อยู่แล้ว`,
          "A document for this refType and refId already exists in this book.",
          dup.id,
        );
      }
    }

    const common = {
      tenantId,
      systemId,
      docType: type as AccountDocType,
      contactId: input.contactId ?? null,
      ...(input.issueDate ? { issueDate: dayToDate(input.issueDate) } : {}),
      ...(input.dueDate === undefined ? {} : { dueDate: input.dueDate ? dayToDate(input.dueDate) : null }),
      ...(input.discountSatang === undefined ? {} : { discountAmount: input.discountSatang }),
      note: input.note ?? null,
      adjustReason: input.adjustReason ?? null,
      sourceDocId: input.sourceDocId ?? null,
      // 🔴 ทุกใบที่เกิดจาก REST: มาจากแอปภายนอก ไม่มี "คนสร้าง" ในร้าน
      //    WO E1: ใบที่มาจากสกิล AI (คนในร้านกดยืนยัน) ต้องแยกเป็น `AI` — บัญชีต้องรู้เสมอว่าใครก่อ
      source: actorDocSource(actor),
      tags: input.tags ?? [],
      refType: input.refType ?? null,
      refId: input.refId ?? null,
      createdById: null,
    };

    let id: string;
    if (isGroupDocType(type)) {
      // เอกสารกลุ่มไม่มีขั้น "ร่าง" — service ออกเลขให้ทันที (บรรทัด = ใบลูกที่เลือก)
      const res = await createGroupDoc(tenantId, systemId, {
        docType: type,
        contactId: input.contactId as string,
        issueDate: input.issueDate ?? ymd(new Date())!,
        dueDate: input.dueDate ?? null,
        note: input.note ?? null,
        childIds: input.childIds ?? [],
        createdById: null,
        source: actorDocSource(actor),
        tags: input.tags ?? [],
      });
      if (!res.ok) failWith(res.reason);
      id = res.id;
    } else if (PURCHASE_ORDER_TYPES.includes(type)) {
      const doc = await createPurchaseOrder({
        ...common,
        docType: type as "PURCHASE_ORDER" | "ASSET_PURCHASE_ORDER",
        ...vatFieldsOf(input),
        lines: toServiceLines(input.lines ?? []),
      });
      id = doc.id;
    } else if (sideOf(type) === "expense") {
      const doc = await createExpenseDoc({
        ...common,
        ...vatFieldsOf(input),
        lines: toServiceLines(input.lines ?? []),
      });
      id = doc.id;
    } else {
      const doc = await createDocument({
        ...common,
        ...vatFieldsOf(input),
        ...(input.validUntil === undefined
          ? {}
          : { validUntil: input.validUntil ? dayToDate(input.validUntil) : null }),
        lines: toServiceLines(input.lines ?? []),
      });
      id = doc.id;
    }
    return docWriteRow(tenantId, systemId, id);
  },
});

// ── 2. แก้ร่าง / ยกเลิกร่าง ─────────────────────────────────────────────────

const documentsUpdate = defineOp({
  id: "documents.update",
  method: "PATCH",
  path: "/documents/{id}",
  kind: "write",
  action: "account.doc.create",
  summary: "Change a draft document. Only fields that are sent are changed; sending `lines` replaces every line. Issued documents cannot be edited.",
  label: "แก้ไขร่างเอกสาร",
  input: updateInput,
  test: "C1-W1.7",
  async handler({ actor, params, input }) {
    const { tenantId, systemId } = actor;
    const id = params.id ?? "";
    const current = await getDocRef(tenantId, systemId, id);
    if (!current) throw notFound();
    // "เอกสารที่ออกแล้วแก้ไขไม่ได้" ของ service ไม่มีคำที่ mapError จับได้ ⇒ ตัดสินที่นี่จากสถานะจริง
    if (current.status !== "DRAFT") {
      throw stateConflict("เอกสารที่ออกแล้วแก้ไขไม่ได้ — ใช้ยกเลิกแล้วออกใบใหม่");
    }
    if (input.contactId) await assertContact(tenantId, systemId, input.contactId);

    const patch = {
      ...(input.contactId === undefined ? {} : { contactId: input.contactId ?? null }),
      ...(input.issueDate ? { issueDate: dayToDate(input.issueDate) } : {}),
      ...(input.dueDate === undefined ? {} : { dueDate: input.dueDate ? dayToDate(input.dueDate) : null }),
      ...(input.discountSatang === undefined ? {} : { discountAmount: input.discountSatang }),
      ...(input.note === undefined ? {} : { note: input.note ?? null }),
      ...(input.adjustReason === undefined ? {} : { adjustReason: input.adjustReason ?? null }),
      ...vatFieldsOf(input),
      ...(input.lines ? { lines: toServiceLines(input.lines) } : {}),
    };

    const res =
      sideOf(current.docType) === "expense"
        ? await updateExpenseDoc(tenantId, systemId, id, patch)
        : await updateDocument(tenantId, systemId, id, {
            ...patch,
            ...(input.validUntil === undefined
              ? {}
              : { validUntil: input.validUntil ? dayToDate(input.validUntil) : null }),
          });
    if (!res.ok) failWith(res.reason);
    if (input.tags) await setDocumentTags(tenantId, systemId, id, input.tags);
    return docWriteRow(tenantId, systemId, id);
  },
});

const documentsDelete = defineOp({
  id: "documents.delete",
  method: "DELETE",
  path: "/documents/{id}",
  kind: "write",
  action: "account.doc.create",
  summary: "Cancel a draft document. The row is kept with status CANCELLED; issued documents must be voided instead.",
  label: "ยกเลิกร่างเอกสาร",
  input: noBody,
  test: "C1-W5.6",
  async handler({ actor, params }) {
    const { tenantId, systemId } = actor;
    const id = params.id ?? "";
    const current = await getDocRef(tenantId, systemId, id);
    if (!current) throw notFound();
    if (!(await cancelDraft(tenantId, systemId, id))) {
      throw stateConflict("ลบได้เฉพาะเอกสารที่ยังเป็นร่าง — เอกสารที่ออกแล้วต้องใช้การยกเลิก (void)");
    }
    return { id, status: "CANCELLED", type: current.docType };
  },
});

// ── 3. ออกเอกสาร / แปลง / ตอบรับ ───────────────────────────────────────────

const documentsIssue = defineOp({
  id: "documents.issue",
  method: "POST",
  path: "/documents/{id}/issue",
  kind: "write",
  action: "account.doc.issue",
  summary: "Issue a draft: it takes the next document number and posts to the ledger. A purchase order is sent for approval instead.",
  label: "ออกเอกสาร",
  tool: { name: "account_issue_document", hint: "Issuing takes the next document number and posts to the ledger, so it is proposed for the owner to confirm." },
  input: noBody,
  test: "C1-W1.8",
  async handler({ actor, params }) {
    const { tenantId, systemId } = actor;
    const id = params.id ?? "";
    const current = await getDocRef(tenantId, systemId, id);
    if (!current) throw notFound();
    if (current.status !== "DRAFT") {
      throw stateConflict(`เอกสารนี้ออกแล้ว (เลขที่ ${current.docNo ?? "-"}) — ออกซ้ำไม่ได้`);
    }
    const res = PURCHASE_ORDER_TYPES.includes(current.docType)
      ? await submitForApproval(tenantId, systemId, id)
      : sideOf(current.docType) === "expense"
        ? await issueExpenseDoc(tenantId, systemId, id)
        : await issueDocument(tenantId, systemId, id);
    if (!res.ok) failWith(res.reason);
    return docStateRow(tenantId, systemId, id);
  },
});

const convertInput = z
  .object({
    toType: z
      .enum(DIRECT_DOC_TYPES.filter((t) => t !== "BILLING_NOTE" && t !== "COMBINED_PAYMENT") as unknown as [DirectDocType, ...DirectDocType[]])
      .or(z.enum(["RECEIPT", "TAX_INVOICE", "PURCHASE_TAX_INVOICE"]))
      .optional()
      .describe("Target document type. Not needed for a purchase order, which always converts to its own follow up document."),
  })
  .strict();

const documentsConvert = defineOp({
  id: "documents.convert",
  method: "POST",
  path: "/documents/{id}/convert",
  kind: "write",
  action: "account.doc.create",
  summary: "Create the follow up document of an issued one, for example quotation to invoice or invoice to receipt. The new document starts as a draft.",
  label: "แปลงเอกสาร",
  tool: { name: "account_convert_document", hint: "Use for \"turn this quotation into an invoice\" or \"issue the receipt for this invoice\". Proposed for confirmation." },
  input: convertInput,
  test: "C1-W1.12",
  async handler({ actor, params, input }) {
    const { tenantId, systemId } = actor;
    const id = params.id ?? "";
    const source = await getDocRef(tenantId, systemId, id);
    if (!source) throw notFound();

    let newId: string;
    if (PURCHASE_ORDER_TYPES.includes(source.docType)) {
      const res = await convertPurchaseOrder(tenantId, systemId, id, null);
      if (!res.ok) failWith(res.reason);
      newId = res.newId;
    } else {
      if (!input.toType) {
        throw new ApiError(
          422,
          "validation",
          "ต้องระบุ toType ว่าจะแปลงเป็นเอกสารชนิดไหน",
          "Send `toType` with the document type to convert into.",
        );
      }
      const res = await convertDocument(tenantId, systemId, id, input.toType as AccountDocType, null);
      if (!res.ok) failWith(res.reason);
      newId = res.newId;
    }
    return {
      ...(await docWriteRow(tenantId, systemId, newId)),
      sourceDocument: { id: source.id, docNo: source.docNo, type: source.docType },
    };
  },
});

const respondInput = z
  .object({
    accepted: z.boolean().describe("True when the customer accepted the quotation, false when they turned it down."),
  })
  .strict();

const documentsRespond = defineOp({
  id: "documents.respond",
  method: "POST",
  path: "/documents/{id}/respond",
  kind: "write",
  action: "account.doc.create",
  summary: "Record the customer answer to a quotation: accepted or rejected.",
  label: "บันทึกการตอบรับใบเสนอราคา",
  input: respondInput,
  test: "C1-W1.11",
  async handler({ actor, params, input }) {
    const { tenantId, systemId } = actor;
    const id = params.id ?? "";
    const current = await getDocRef(tenantId, systemId, id);
    if (!current) throw notFound();
    const res = await setQuotationResponse(tenantId, systemId, id, input.accepted);
    if (!res.ok) failWith(res.reason);
    return docStateRow(tenantId, systemId, id);
  },
});

// ── 4. อนุมัติ / ปฏิเสธ / รับของ ───────────────────────────────────────────

const documentsApprove = defineOp({
  id: "documents.approve",
  method: "POST",
  path: "/documents/{id}/approve",
  kind: "write",
  action: "account.doc.approve",
  summary: "Approve a purchase order that is waiting for approval.",
  label: "อนุมัติใบสั่งซื้อ",
  tool: { name: "account_approve_document", hint: "Use for a purchase order that is waiting for approval. Proposed for confirmation." },
  input: noBody,
  test: "C1-W5.4",
  async handler({ actor, params }) {
    const { tenantId, systemId } = actor;
    const id = params.id ?? "";
    const current = await getDocRef(tenantId, systemId, id);
    if (!current) throw notFound();
    // ผู้อนุมัติ = คีย์ (หน้าจอแสดง "แอปภายนอก (API key)") · ไม่มีเพดานวงเงิน:
    // เจ้าของร้านมอบสิทธิ์ไปแล้วตอนติ๊ก scope `account.doc.approve` ให้คีย์นี้
    const res = await approvePurchaseOrder(tenantId, systemId, id, actorRefId(actor));
    if (!res.ok) failWith(res.reason);
    return docStateRow(tenantId, systemId, id);
  },
});

const rejectInput = z
  .object({
    reason: z.string().min(1).max(500).describe("Why the purchase order is turned down. Stored on the document and in the audit log."),
  })
  .strict();

const documentsReject = defineOp({
  id: "documents.reject",
  method: "POST",
  path: "/documents/{id}/reject",
  kind: "write",
  action: "account.doc.approve",
  summary: "Turn down a purchase order that is waiting for approval, with a reason.",
  label: "ปฏิเสธใบสั่งซื้อ",
  input: rejectInput,
  test: "C1-W5.8",
  async handler({ actor, params, input }) {
    const { tenantId, systemId } = actor;
    const id = params.id ?? "";
    const current = await getDocRef(tenantId, systemId, id);
    if (!current) throw notFound();
    const res = await rejectPurchaseOrder(tenantId, systemId, id, input.reason);
    if (!res.ok) failWith(res.reason);
    return docStateRow(tenantId, systemId, id);
  },
});

const documentsReceive = defineOp({
  id: "documents.receive",
  method: "POST",
  path: "/documents/{id}/receive",
  kind: "write",
  action: "account.payment.record",
  summary: "Mark the paper as received: a purchase tax invoice becomes RECEIVED and posts input VAT, an asset purchase becomes RECEIVED.",
  label: "รับเอกสารตัวจริง",
  input: noBody,
  test: "C1-W10.1",
  async handler({ actor, params }) {
    const { tenantId, systemId } = actor;
    const id = params.id ?? "";
    const current = await getDocRef(tenantId, systemId, id);
    if (!current) throw notFound();
    if (current.docType === "PURCHASE_TAX_INVOICE") {
      const res = await receivePurchaseTaxInvoice(tenantId, systemId, id);
      if (!res.ok) failWith(res.reason);
    } else if (current.docType === "ASSET_PURCHASE") {
      const res = await markAssetReceived(tenantId, systemId, id);
      if (!res.ok) failWith(res.reason);
    } else {
      throw stateConflict("เอกสารชนิดนี้ไม่มีขั้นตอน “รับตัวจริง” (ใช้ได้กับใบกำกับภาษีซื้อและการซื้อสินทรัพย์)");
    }
    return docStateRow(tenantId, systemId, id);
  },
});

// ── 5. ยกเลิก (danger) ─────────────────────────────────────────────────────

// `confirm` ถูกตรวจและถอดออกที่ dispatch กลางแล้ว — schema เห็นแค่ `reason`
const voidInput = z
  .object({
    reason: z.string().min(5).max(500).describe("Why this document is being voided, at least 5 characters. Stored on the document and in the audit log."),
  })
  .strict();

const documentsVoid = defineOp({
  id: "documents.void",
  method: "POST",
  path: "/documents/{id}/void",
  kind: "danger",
  action: "account.doc.void",
  summary: "Void an issued document. The ledger entry is reversed with a new journal entry; nothing is deleted.",
  label: "ยกเลิกเอกสาร",
  tool: { name: "account_void_document", hint: "Irreversible: the ledger entry is reversed. Needs a reason and a double confirmation from the owner." },
  input: voidInput,
  test: "C1-W3.3",
  async handler({ actor, params, input }) {
    const { tenantId, systemId } = actor;
    const id = params.id ?? "";
    const current = await getDocRef(tenantId, systemId, id);
    if (!current) throw notFound();
    // "เอกสารถูกยกเลิกแล้ว" ของ service ไม่มีคำที่ mapError จับได้ ⇒ ตัดสินที่นี่ (กันกลับรายการซ้ำ)
    if (current.status === "VOIDED" || current.status === "CANCELLED") {
      throw stateConflict("เอกสารนี้ถูกยกเลิกไปแล้ว");
    }
    const res =
      sideOf(current.docType) === "expense"
        ? await voidExpenseDoc(tenantId, systemId, id, input.reason)
        : await voidDocument(tenantId, systemId, id, input.reason);
    if (!res.ok) failWith(res.reason);
    return docStateRow(tenantId, systemId, id);
  },
});

// ── 6. มัดจำที่หักได้ ───────────────────────────────────────────────────────

const documentsDeposits = defineOp({
  id: "documents.deposits",
  method: "GET",
  path: "/documents/{id}/deposits",
  kind: "read",
  action: "account.doc.view",
  summary: "Deposits of this contact that can still be deducted from this document, with the amount already applied here.",
  label: "มัดจำที่หักได้ของเอกสารนี้",
  input: noBody,
  test: "C1-W10.1",
  async handler({ actor, params }) {
    const { tenantId, systemId } = actor;
    const id = params.id ?? "";
    const doc = await getDocument(tenantId, systemId, id);
    if (!doc) throw notFound();
    const rows =
      sideOf(doc.docType) === "expense"
        ? await listDeductiblePaidDeposits(tenantId, systemId, doc.contactId ?? undefined, id)
        : doc.contactId
          ? await listDeductibleDeposits(tenantId, systemId, doc.contactId, id)
          : [];
    return rows.map((d) => ({
      id: d.id,
      docNo: d.docNo,
      issueDate: ymd(d.issueDate),
      availableSatang: d.available,
      appliedSatang: d.appliedHere,
    }));
  },
});

const setDepositsInput = z
  .object({
    picks: z
      .array(
        z
          .object({
            depositId: z.string().min(1).max(40).describe("Id of the deposit document to deduct from."),
            amountSatang: z.number().int().min(0).describe("How much of that deposit to use, in satang."),
          })
          .strict(),
      )
      .max(50)
      .describe("The complete set of deductions for this document. Sending an empty array clears them all."),
  })
  .strict();

const documentsSetDeposits = defineOp({
  id: "documents.set-deposits",
  method: "PUT",
  path: "/documents/{id}/deposits",
  kind: "write",
  action: "account.doc.create",
  summary: "Replace the deposits deducted from this draft with the given set and return the new grand total.",
  label: "ตั้งการหักมัดจำ",
  input: setDepositsInput,
  test: "C1-W10.1",
  async handler({ actor, params, input }) {
    const { tenantId, systemId } = actor;
    const id = params.id ?? "";
    const current = await getDocRef(tenantId, systemId, id);
    if (!current) throw notFound();
    const res =
      sideOf(current.docType) === "expense"
        ? await setExpenseDocDeposits(tenantId, systemId, id, input.picks)
        : await setDocDeposits(tenantId, systemId, id, input.picks);
    if (!res.ok) failWith(res.reason);
    return { depositDeductedSatang: res.depositDeducted, grandTotalSatang: res.grandTotal };
  },
});

// ── 7. ลิงก์สาธารณะ / แท็ก / ไฟล์แนบ / เตือนชำระ ────────────────────────────

const documentsPublicLink = defineOp({
  id: "documents.public-link",
  method: "POST",
  path: "/documents/{id}/public-link",
  kind: "write",
  action: "account.doc.public_link",
  summary: "Create (or reuse) the public link where the customer can see the document and ask for a tax invoice.",
  label: "ลิงก์สาธารณะของเอกสาร",
  tool: { name: "account_create_payment_link", hint: "Use to give the customer a link to view the document and pay. Proposed for confirmation." },
  input: noBody,
  test: "C1-W2.2",
  async handler({ actor, params }) {
    const { tenantId, systemId } = actor;
    const id = params.id ?? "";
    if (!(await getDocRef(tenantId, systemId, id))) throw notFound();
    const res = await ensurePublicTaxInvoiceLink(tenantId, systemId, id);
    if (!res.ok) failWith(res.reason);
    // 🔴 คืน "ลิงก์" อย่างเดียว ไม่คืน token แยก — token คือกุญแจ ใครถือก็เปิดเอกสารได้
    return { url: `${await appOrigin()}/r/${res.token}` };
  },
});

const setTagsInput = z.object({ tags: tagsField }).strict();

const documentsSetTags = defineOp({
  id: "documents.set-tags",
  method: "PUT",
  path: "/documents/{id}/tags",
  kind: "write",
  action: "account.doc.create",
  summary: "Replace every tag of one document with the given list. Works on any document that is not cancelled or voided.",
  label: "ตั้งแท็กของเอกสาร",
  input: setTagsInput,
  test: "C1-W2.1",
  async handler({ actor, params, input }) {
    const { tenantId, systemId } = actor;
    const id = params.id ?? "";
    const current = await getDocRef(tenantId, systemId, id);
    if (!current) throw notFound();
    // แท็กซ้ำในชุดเดียวกันไม่มีความหมาย — เก็บครั้งแรกไว้ตามลำดับที่ส่งมา
    const tags = [...new Set(input.tags.map((t) => t.trim()).filter(Boolean))];
    if (!(await setDocumentTags(tenantId, systemId, id, tags))) {
      throw stateConflict("เอกสารที่ยกเลิกแล้วแก้แท็กไม่ได้");
    }
    return { id, tags };
  },
});

const addAttachmentInput = z
  .object({
    fileUrl: z
      .string()
      .max(2000)
      .refine((v) => /^https?:\/\//i.test(v.trim()), "URL ไฟล์ต้องขึ้นต้นด้วย http:// หรือ https://")
      .describe("Public URL of the file. Must start with http:// or https://."),
    fileName: z.string().min(1).max(200).describe("File name to show, for example `slip-001.jpg`."),
    mime: z.string().max(120).nullish().describe("Content type. Guessed from the file name when omitted."),
    sizeBytes: z.number().int().min(0).nullish().describe("File size in bytes, when known."),
    sha256: z.string().max(64).nullish().describe("Hex sha256 of the file. When it matches a file already in this book, that file is reused and `duplicate` is true."),
  })
  .strict();

const documentsAddAttachment = defineOp({
  id: "documents.add-attachment",
  method: "POST",
  path: "/documents/{id}/attachments",
  kind: "write",
  action: "account.doc.create",
  summary: "Attach a file that is already hosted somewhere to a document, by URL.",
  label: "แนบไฟล์เข้าเอกสาร",
  tool: { name: "account_upload_file", hint: "The file must already be hosted somewhere reachable by URL. Proposed for confirmation." },
  input: addAttachmentInput,
  test: "C1-W2.4",
  async handler({ actor, params, input }) {
    const { tenantId, systemId } = actor;
    const id = params.id ?? "";
    if (!(await getDocRef(tenantId, systemId, id))) throw notFound();
    const res = await createAttachment({
      tenantId,
      systemId,
      documentId: id,
      fileName: input.fileName,
      fileUrl: input.fileUrl.trim(),
      mimeType: input.mime ?? null,
      sizeBytes: input.sizeBytes ?? null,
      uploadedById: null,
      source: "API",
      sha256: input.sha256 ?? null,
    });
    if (!res.ok) failWith(res.reason);
    const files = await listDocumentAttachmentFiles(tenantId, systemId, id);
    const saved = files.find((f) => f.id === res.id);
    return {
      id: res.id,
      fileName: saved?.fileName ?? input.fileName,
      url: saved?.fileUrl ?? input.fileUrl.trim(),
      ...(res.duplicate ? { duplicate: true } : {}),
    };
  },
});

const documentsDeleteAttachment = defineOp({
  id: "documents.delete-attachment",
  method: "DELETE",
  path: "/documents/{id}/attachments/{attId}",
  kind: "write",
  action: "account.doc.create",
  summary: "Remove a file from a document. The file is unlinked and archived, never destroyed.",
  label: "ลบไฟล์แนบของเอกสาร",
  input: noBody,
  test: "C1-W2.7",
  async handler({ actor, params }) {
    const { tenantId, systemId } = actor;
    const id = params.id ?? "";
    const attId = params.attId ?? "";
    if (!(await getDocRef(tenantId, systemId, id))) throw notFound();
    // ไฟล์ของเอกสารอื่น/ร้านอื่น = "ไม่มี" (รายการนี้กรอง tenant+system+documentId ให้แล้ว)
    const files = await listDocumentAttachmentFiles(tenantId, systemId, id);
    if (!files.some((f) => f.id === attId)) {
      throw new ApiError(404, "not_found", ERR.ATTACHMENT_NOT_FOUND, "No such file on this document.");
    }
    const unlinked = await unlinkAttachment(tenantId, systemId, attId);
    if (!unlinked.ok) failWith(unlinked.reason);
    const archived = await archiveAttachment(tenantId, systemId, attId);
    if (!archived.ok) failWith(archived.reason);
    return { id: attId };
  },
});

const documentsRemind = defineOp({
  id: "documents.remind",
  method: "POST",
  path: "/documents/{id}/remind",
  kind: "write",
  action: "account.doc.view",
  summary: "Email the contact a payment reminder for this document, with a link to it.",
  label: "ส่งเตือนชำระเงิน",
  tool: { name: "account_email_document", hint: "Emails the contact a reminder with a link to the document. Proposed for confirmation." },
  input: noBody,
  test: "C1-W2.8",
  async handler({ actor, params }) {
    const { tenantId, systemId } = actor;
    const id = params.id ?? "";
    if (!(await getDocRef(tenantId, systemId, id))) throw notFound();
    const res = await sendPaymentReminder(tenantId, systemId, id, { actorId: null, origin: await appOrigin() });
    if (!res.ok) failWith(res.reason);
    return { email: res.email, link: res.link };
  },
});

// ── 8. รายการโปรด ─────────────────────────────────────────────────────────

const favoriteInput = z
  .object({
    name: z.string().min(1).max(80).describe("Name of the saved set of lines. Saving with an existing name replaces it."),
    lines: z.array(lineInput).min(1).max(MAX_LINES).describe("Lines of the template."),
  })
  .strict();

const favoritesSave = defineOp({
  id: "favorites.save",
  method: "POST",
  path: "/favorites",
  kind: "write",
  action: "account.doc.create",
  summary: "Save a set of document lines under a name so it can be reused later. At most 20 sets are kept.",
  label: "บันทึกชุดรายการโปรด",
  input: favoriteInput,
  test: "C1-W2.9",
  async handler({ actor, input }) {
    const res = await saveDocFavorite(actor.tenantId, actor.systemId, { name: input.name, lines: input.lines });
    if (!res.ok) failWith(res.reason);
    return { ok: true, name: input.name };
  },
});

// ── 9. เอกสารประจำ ─────────────────────────────────────────────────────────

const templateLineInput = z
  .object({
    name: z.string().min(1).max(300).describe("Name of the product or service on this line."),
    description: z.string().max(1000).optional().describe("Extra description printed under the name."),
    qty: z.number().positive().max(1_000_000).describe("Quantity."),
    unitName: z.string().max(40).nullish().describe("Unit label."),
    unitPriceSatang: z.number().int().min(0).describe("Price of one unit in satang (integer)."),
    vatRateBp: z.union([z.literal(700), z.literal(0), z.literal(-1)]).describe("VAT rate in basis points: 700, 0 or -1 (exempt)."),
    discountSatang: z.number().int().min(0).optional().describe("Discount of this line in satang. Default 0."),
    productId: z.string().max(40).nullish().describe("Product in the catalogue, when this line comes from one."),
    accountId: z.string().max(40).nullish().describe("Chart of accounts entry to post this line to."),
  })
  .strict();

const templateInput = z
  .object({
    priceMode: z.enum(["EXCL_VAT", "INCL_VAT", "NO_VAT"]).describe("How the prices in the template are meant: before VAT, including VAT, or no VAT at all."),
    lines: z.array(templateLineInput).min(1).max(100).describe("Lines of every document this rule produces."),
    note: z.string().max(2000).optional().describe("Note printed on every document produced."),
    tags: tagsField.optional(),
    dueDays: z.number().int().min(0).max(365).nullish().describe("Payment terms in days after the issue date. Null uses the setting of the book."),
  })
  .strict();

const recurringFields = {
  name: z.string().min(1).max(120).describe("Name of the rule, shown in the recurring documents list."),
  docType: z.enum(["INVOICE", "QUOTATION", "EXPENSE", "PURCHASE"]).describe("Type of document this rule produces."),
  contactId: z.string().max(40).nullish().describe("Contact of every document produced. Required when `autoApprove` is true."),
  frequency: z.enum(["WEEKLY", "MONTHLY", "QUARTERLY", "YEARLY"]).describe("How often a document is produced."),
  dayOfMonth: z.number().int().min(1).max(31).nullish().describe("Day of the month for MONTHLY, QUARTERLY and YEARLY. 31 is clamped to the last day of short months."),
  weekday: z.number().int().min(0).max(6).nullish().describe("Day of the week for WEEKLY: 0 is Sunday."),
  startDate: ymdField("startDate"),
  endDate: ymdField("endDate").nullish(),
  leadDays: z.number().int().min(0).max(60).describe("Produce the document this many days before its date."),
  autoApprove: z.boolean().describe("True issues each document automatically; false leaves it as a draft to check."),
  active: z.boolean().describe("False pauses the rule without deleting its history."),
} as const;

const recurringCreateInput = z.object({ ...recurringFields, template: templateInput }).strict();

const recurringUpdateInput = z
  .object({
    name: recurringFields.name.optional(),
    docType: recurringFields.docType.optional(),
    contactId: recurringFields.contactId,
    frequency: recurringFields.frequency.optional(),
    dayOfMonth: recurringFields.dayOfMonth,
    weekday: recurringFields.weekday,
    startDate: recurringFields.startDate.optional(),
    endDate: recurringFields.endDate,
    leadDays: recurringFields.leadDays.optional(),
    autoApprove: recurringFields.autoApprove.optional(),
    active: recurringFields.active.optional(),
    template: templateInput.optional(),
  })
  .strict();

type RecurringTemplatePayload = z.infer<typeof templateInput>;

function toTemplate(t: RecurringTemplatePayload): RecurringTemplate {
  return {
    priceMode: t.priceMode,
    lines: t.lines.map((l) => ({
      name: l.name,
      description: l.description ?? "",
      qty: l.qty,
      unitName: l.unitName ?? null,
      unitPriceSatang: l.unitPriceSatang,
      vatRateBp: l.vatRateBp,
      discountSatang: l.discountSatang ?? 0,
      productId: l.productId ?? null,
      accountId: l.accountId ?? null,
    })),
    note: t.note ?? "",
    tags: [...(t.tags ?? [])],
    dueDays: t.dueDays ?? null,
  };
}

/** กฎที่ service เก็บไว้ → ชุด input เต็มของ `updateRecurringRule` (ฐานของการ merge แบบ partial) */
function ruleAsInput(rule: NonNullable<Awaited<ReturnType<typeof getRecurringRule>>>): RecurringRuleInput {
  return {
    name: rule.name,
    docType: rule.docType,
    contactId: rule.contactId,
    template: rule.template,
    frequency: rule.frequency,
    dayOfMonth: rule.dayOfMonth,
    weekday: rule.weekday,
    startDate: rule.startDate,
    endDate: rule.endDate,
    leadDays: rule.leadDays,
    autoApprove: rule.autoApprove,
    active: rule.active,
  };
}

async function ruleView(tenantId: string, systemId: string, id: string) {
  const r = await getRecurringRule(tenantId, systemId, id);
  if (!r) throw new ApiError(404, "not_found", ERR.RECURRING_RULE_NOT_FOUND, "No such recurring rule in this book.");
  return {
    id: r.id,
    name: r.name,
    docType: r.docType,
    contact: r.contactId ? { id: r.contactId, name: r.contactName } : null,
    frequency: r.frequency,
    dayOfMonth: r.dayOfMonth,
    weekday: r.weekday,
    startDate: ymd(r.startDate),
    endDate: r.endDate ? ymd(r.endDate) : null,
    nextRunAt: r.nextRunAt.toISOString(),
    leadDays: r.leadDays,
    autoApprove: r.autoApprove,
    active: r.active,
  };
}

/** ด่านตรวจกฎชุดเดียวกับหน้าจอ (`validateRuleInput`) — ผิดหลายข้อ รายงานทีเดียวเป็นภาษาไทย */
function assertRuleValid(input: RecurringRuleInput): void {
  if (!isRecurringDocType(input.docType)) {
    throw new ApiError(
      422,
      "unprocessable",
      "ชนิดเอกสารนี้ตั้งเป็นเอกสารประจำไม่ได้",
      "This document type cannot be produced by a recurring rule.",
    );
  }
  const errs = validateRuleInput({
    name: input.name,
    docType: input.docType,
    frequency: input.frequency,
    startDate: input.startDate,
    endDate: input.endDate,
    template: input.template,
    leadDays: input.leadDays,
  });
  if (errs.length > 0) {
    throw new ApiError(422, "unprocessable", errs.join(" · "), "The recurring rule is not valid.");
  }
}

const recurringCreate = defineOp({
  id: "recurring.create",
  method: "POST",
  path: "/recurring",
  kind: "write",
  action: "account.doc.create",
  summary: "Create a rule that produces the same document every week, month, quarter or year.",
  label: "สร้างเอกสารประจำ",
  tool: { name: "account_create_recurring", hint: "Use for \"bill this customer every month\". Proposed for confirmation." },
  input: recurringCreateInput,
  test: "C1-W8.1",
  async handler({ actor, input }) {
    const { tenantId, systemId } = actor;
    await assertContact(tenantId, systemId, input.contactId);
    const start = parseYmd(input.startDate);
    if (!start) {
      throw new ApiError(422, "validation", "startDate ไม่ถูกต้อง", "`startDate` is not a valid date.");
    }
    const ruleInput: RecurringRuleInput = {
      name: input.name,
      docType: input.docType,
      contactId: input.contactId ?? null,
      template: toTemplate(input.template),
      frequency: input.frequency,
      dayOfMonth: input.dayOfMonth ?? null,
      weekday: input.weekday ?? null,
      startDate: start,
      endDate: input.endDate ? parseYmd(input.endDate) : null,
      leadDays: input.leadDays,
      autoApprove: input.autoApprove,
      active: input.active,
    };
    assertRuleValid(ruleInput);
    const res = await createRecurringRule(tenantId, systemId, ruleInput, null);
    if (!res.ok) failWith(res.reason);
    return ruleView(tenantId, systemId, res.id);
  },
});

const recurringUpdate = defineOp({
  id: "recurring.update",
  method: "PATCH",
  path: "/recurring/{id}",
  kind: "write",
  action: "account.doc.create",
  summary: "Change a recurring rule. Only the fields that are sent change; sending `template` replaces the whole template.",
  label: "แก้ไขเอกสารประจำ",
  input: recurringUpdateInput,
  test: "C1-W8.2",
  async handler({ actor, params, input }) {
    const { tenantId, systemId } = actor;
    const id = params.id ?? "";
    const current = await getRecurringRule(tenantId, systemId, id);
    if (!current) {
      throw new ApiError(404, "not_found", ERR.RECURRING_RULE_NOT_FOUND, "No such recurring rule in this book.");
    }
    if (input.contactId) await assertContact(tenantId, systemId, input.contactId);
    const base = ruleAsInput(current);
    const startDate = input.startDate ? parseYmd(input.startDate) : base.startDate;
    if (!startDate) {
      throw new ApiError(422, "validation", "startDate ไม่ถูกต้อง", "`startDate` is not a valid date.");
    }
    const merged: RecurringRuleInput = {
      ...base,
      ...(input.name === undefined ? {} : { name: input.name }),
      ...(input.docType === undefined ? {} : { docType: input.docType }),
      ...(input.contactId === undefined ? {} : { contactId: input.contactId ?? null }),
      ...(input.frequency === undefined ? {} : { frequency: input.frequency }),
      ...(input.dayOfMonth === undefined ? {} : { dayOfMonth: input.dayOfMonth ?? null }),
      ...(input.weekday === undefined ? {} : { weekday: input.weekday ?? null }),
      startDate,
      ...(input.endDate === undefined ? {} : { endDate: input.endDate ? parseYmd(input.endDate) : null }),
      ...(input.leadDays === undefined ? {} : { leadDays: input.leadDays }),
      ...(input.autoApprove === undefined ? {} : { autoApprove: input.autoApprove }),
      ...(input.active === undefined ? {} : { active: input.active }),
      ...(input.template === undefined ? {} : { template: toTemplate(input.template) }),
    };
    assertRuleValid(merged);
    const res = await updateRecurringRule(tenantId, systemId, id, merged);
    if (!res.ok) failWith(res.reason);
    return ruleView(tenantId, systemId, id);
  },
});

const recurringSetActive = defineOp({
  id: "recurring.set-active",
  method: "POST",
  path: "/recurring/{id}/active",
  kind: "write",
  action: "account.doc.create",
  summary: "Pause or resume a recurring rule without touching its history.",
  label: "เปิด/ปิดเอกสารประจำ",
  input: z.object({ active: z.boolean().describe("True resumes the rule, false pauses it.") }).strict(),
  test: "C1-W8.4",
  async handler({ actor, params, input }) {
    const { tenantId, systemId } = actor;
    const id = params.id ?? "";
    const res = await setRecurringRuleActive(tenantId, systemId, id, input.active);
    if (!res.ok) {
      throw new ApiError(404, "not_found", ERR.RECURRING_RULE_NOT_FOUND, "No such recurring rule in this book.");
    }
    return { id, active: input.active };
  },
});

const recurringDelete = defineOp({
  id: "recurring.delete",
  method: "DELETE",
  path: "/recurring/{id}",
  kind: "write",
  action: "account.doc.create",
  summary: "Delete a recurring rule. Documents it already produced are kept; only the schedule stops.",
  label: "ลบเอกสารประจำ",
  input: noBody,
  test: "C1-W8.5",
  async handler({ actor, params }) {
    const { tenantId, systemId } = actor;
    const id = params.id ?? "";
    const res = await deleteRecurringRule(tenantId, systemId, id);
    if (!res.ok) {
      throw new ApiError(404, "not_found", ERR.RECURRING_RULE_NOT_FOUND, "No such recurring rule in this book.");
    }
    return { id };
  },
});

const recurringRun = defineOp({
  id: "recurring.run",
  method: "POST",
  path: "/recurring/{id}/run",
  kind: "write",
  action: "account.doc.create",
  summary: "Run one recurring rule now. Producing a period twice is impossible, so calling this repeatedly is safe.",
  label: "สั่งเอกสารประจำทำงานตอนนี้",
  input: noBody,
  test: "C1-W8.3",
  async handler({ actor, params }) {
    const { tenantId, systemId } = actor;
    const id = params.id ?? "";
    if (!(await getRecurringRule(tenantId, systemId, id))) {
      throw new ApiError(404, "not_found", ERR.RECURRING_RULE_NOT_FOUND, "No such recurring rule in this book.");
    }
    const res = await runRecurringRules(new Date(), { tenantId, systemId, ruleId: id });
    return {
      processed: res.processed,
      created: res.created,
      issued: res.issued,
      skipped: res.skipped,
      finished: res.finished,
      // สรุปของ service นับ "รอบที่ล้ม" เป็นตัวเลข (ข้อความจริงไปที่แจ้งเตือนในแอปของเจ้าของร้าน
      // เพราะมันคือปัญหาของข้อมูลในร้าน ไม่ใช่ของผู้เรียก) — ช่องนี้จึงว่างเมื่อไม่มีรายละเอียดให้บอก
      errors: res.failed > 0 ? [`สร้างเอกสารไม่สำเร็จ ${res.failed} รอบ — ดูการแจ้งเตือนในแอป`] : [],
    };
  },
});

export const DOCUMENTS_WRITE_OPS: ApiOp[] = [
  documentsCreate,
  documentsUpdate,
  documentsDelete,
  documentsIssue,
  documentsConvert,
  documentsRespond,
  documentsApprove,
  documentsReject,
  documentsVoid,
  documentsReceive,
  documentsDeposits,
  documentsSetDeposits,
  documentsPublicLink,
  documentsSetTags,
  documentsAddAttachment,
  documentsDeleteAttachment,
  documentsRemind,
  favoritesSave,
  recurringCreate,
  recurringUpdate,
  recurringSetActive,
  recurringDelete,
  recurringRun,
];
