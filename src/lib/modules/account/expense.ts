import { prisma } from "@/lib/core/db";
import type {
  AccountDocType,
  AccountDocStatus,
  AccountVatMode,
  AccountVatTiming,
  AccountPayChannel,
  AccountWhtIncomeType,
  AccountLegalType,
  Prisma,
} from "@prisma/client";
// posting engine (owner = GL-P2P3, ไฟล์ gl.ts) — subagent P2 แค่ import + เรียกตามลายเซ็น
import { ensureAccounting, postDocument, postPayment, reverseFor } from "./gl";
// reuse (read-only) helper จาก service P1 — ห้ามแก้ service.ts
import {
  computeTotals,
  lineAmount,
  getSettings,
  STATUS_LABEL,
  isOverdue,
  type LineInput,
} from "./service";

// ─────────────────────────────────────────────────────────────
// expense.ts — ฝั่งรายจ่าย (P2) direction=IN
// docType: PURCHASE EXPENSE PURCHASE_ORDER ASSET_PURCHASE_ORDER ASSET_PURCHASE
//          PURCHASE_TAX_INVOICE DEPOSIT_PAYMENT CREDIT_NOTE_RECEIVED
//          DEBIT_NOTE_RECEIVED COMBINED_PAYMENT (+ WHT_CERT auto)
// สร้างเอกสาร → โพสต์ผ่าน gl.postDocument/postPayment (§3.2, §7.10, F5)
// เอกสารเงิน immutable: DRAFT แก้ได้ · พ้น DRAFT → void/reissue
// ─────────────────────────────────────────────────────────────

export { STATUS_LABEL, isOverdue };

// ─────────────────── ทะเบียน docType ฝั่งจ่าย ───────────────────

export const EXP_DOC_PREFIX: Partial<Record<AccountDocType, string>> = {
  PURCHASE: "PC",
  EXPENSE: "EX",
  PURCHASE_ORDER: "PO",
  ASSET_PURCHASE_ORDER: "APO",
  ASSET_PURCHASE: "AP",
  PURCHASE_TAX_INVOICE: "PTX",
  DEPOSIT_PAYMENT: "DP",
  CREDIT_NOTE_RECEIVED: "CNR",
  DEBIT_NOTE_RECEIVED: "DNR",
  COMBINED_PAYMENT: "CP",
  WHT_CERT: "WHT",
};

export const EXP_DOC_LABEL: Partial<Record<AccountDocType, string>> = {
  PURCHASE: "บันทึกซื้อสินค้า",
  EXPENSE: "บันทึกค่าใช้จ่าย",
  PURCHASE_ORDER: "ใบสั่งซื้อ (PO)",
  ASSET_PURCHASE_ORDER: "ใบสั่งซื้อสินทรัพย์",
  ASSET_PURCHASE: "ซื้อสินทรัพย์",
  PURCHASE_TAX_INVOICE: "ใบกำกับภาษีซื้อ",
  DEPOSIT_PAYMENT: "ใบจ่ายเงินมัดจำ",
  CREDIT_NOTE_RECEIVED: "รับใบลดหนี้",
  DEBIT_NOTE_RECEIVED: "รับใบเพิ่มหนี้",
  COMBINED_PAYMENT: "ใบรวมจ่าย",
  WHT_CERT: "หนังสือรับรองหัก ณ ที่จ่าย (50 ทวิ)",
};

// ประเภทเงินได้ ม.40 (50 ทวิ) — label สำหรับ picker
export const WHT_INCOME_LABEL: Record<AccountWhtIncomeType, string> = {
  M40_1: "40(1) เงินเดือน/ค่าจ้าง",
  M40_2: "40(2) ค่านายหน้า/รับจ้างทำงาน",
  M40_3: "40(3) ค่าลิขสิทธิ์/goodwill",
  M40_4: "40(4) ดอกเบี้ย/เงินปันผล",
  M40_5: "40(5) ค่าเช่าทรัพย์สิน",
  M40_6: "40(6) วิชาชีพอิสระ",
  M40_7: "40(7) รับเหมา",
  M40_8: "40(8) บริการ/อื่นๆ",
};

// docType ฝั่งจ่ายที่โพสต์ตอน issue → AWAITING_PAYMENT (ตั้งเจ้าหนี้)
const PAYABLE_TYPES: readonly AccountDocType[] = [
  "PURCHASE",
  "EXPENSE",
  "ASSET_PURCHASE",
  "DEPOSIT_PAYMENT",
];
// docType ที่โพสต์ตอน issue แล้วจบเป็น ISSUED (adjust)
const ADJUST_TYPES: readonly AccountDocType[] = [
  "CREDIT_NOTE_RECEIVED",
  "DEBIT_NOTE_RECEIVED",
];

// สถานะเมื่อ "บันทึก/ออก" ต่อชนิด
function issueStatusFor(docType: AccountDocType): AccountDocStatus {
  if (ADJUST_TYPES.includes(docType)) return "ISSUED";
  return "AWAITING_PAYMENT";
}

// ─────────────────── VAT ซื้อ 3 โหมด (§3.2) ───────────────────
// CLAIM   = มีใบกำกับ เคลมได้ทันที → Dr 1150 (vatTiming ON_ISSUE)
// AWAITING= ยังไม่รับใบกำกับ → Dr 1155 รอ (vatTiming ON_PAYMENT) + สร้าง PTX รอรับ
// NO_CLAIM= เคลมไม่ได้ (ABB/ค่ารับรอง/รถนั่ง) → VAT รวมเป็นต้นทุน (vatMode NONE)
export type VatPurchaseMode = "CLAIM" | "AWAITING" | "NO_CLAIM";

function vatFieldsFor(
  mode: VatPurchaseMode,
  reqVatMode: AccountVatMode,
): { vatMode: AccountVatMode; vatTiming: AccountVatTiming } {
  if (mode === "NO_CLAIM") return { vatMode: "NONE", vatTiming: "ON_ISSUE" };
  if (mode === "AWAITING") return { vatMode: reqVatMode, vatTiming: "ON_PAYMENT" };
  return { vatMode: reqVatMode, vatTiming: "ON_ISSUE" };
}

// ─────────────────── เลขรันเอกสาร (จองใน tx) ───────────────────

async function nextDocNo(
  tx: Prisma.TransactionClient,
  tenantId: string,
  systemId: string,
  docType: AccountDocType,
  date: Date,
): Promise<string> {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const periodKey = `${year}-${month}`;
  const prefix = EXP_DOC_PREFIX[docType] ?? docType;
  const seq = await tx.accountDocSequence.upsert({
    where: { systemId_docType_periodKey: { systemId, docType, periodKey } },
    create: { tenantId, systemId, docType, prefix, periodKey, lastNo: 1 },
    update: { lastNo: { increment: 1 } },
  });
  return `${prefix}-${year}-${month}-${String(seq.lastNo).padStart(4, "0")}`;
}

// ─────────────────── list + filter tabs (§3.0.3) ───────────────────

export type ExpTab =
  | "recent"
  | "awaiting"
  | "paid"
  | "overdue"
  | "deduct"
  | "received"
  | "approved"
  | "awaiting_approval"
  | "awaiting_receive"
  | "all";

// แท็บที่แต่ละ docType แสดง (ตาม §3.0.3)
export function tabsFor(docType: AccountDocType): { key: ExpTab; label: string }[] {
  const recent = { key: "recent" as ExpTab, label: "ล่าสุด" };
  const all = { key: "all" as ExpTab, label: "ทั้งหมด" };
  switch (docType) {
    case "PURCHASE":
    case "EXPENSE":
      return [
        recent,
        { key: "awaiting", label: "รอชำระ" },
        { key: "paid", label: "ชำระแล้ว" },
        { key: "overdue", label: "พ้นกำหนด" },
        all,
      ];
    case "ASSET_PURCHASE":
      return [
        recent,
        { key: "awaiting", label: "รอชำระ" },
        { key: "overdue", label: "พ้นกำหนด" },
        { key: "received", label: "รับใบเสร็จแล้ว" },
        all,
      ];
    case "DEPOSIT_PAYMENT":
      return [
        recent,
        { key: "awaiting", label: "รอชำระ" },
        { key: "overdue", label: "พ้นกำหนด" },
        { key: "deduct", label: "รอหักมัดจำ" },
        all,
      ];
    case "PURCHASE_ORDER":
    case "ASSET_PURCHASE_ORDER":
      return [
        recent,
        { key: "awaiting_approval", label: "รออนุมัติ" },
        { key: "approved", label: "อนุมัติแล้ว" },
        all,
      ];
    case "PURCHASE_TAX_INVOICE":
      return [
        recent,
        { key: "awaiting_receive", label: "รอรับ" },
        { key: "received", label: "รับแล้ว" },
        all,
      ];
    default: // CNR / DNR / COMBINED_PAYMENT
      return [recent, all];
  }
}

export async function listExpenseDocs(
  tenantId: string,
  systemId: string,
  docType: AccountDocType,
  opts?: { tab?: ExpTab; take?: number },
) {
  const tab = opts?.tab ?? "recent";
  const where: Prisma.AccountDocumentWhereInput = { tenantId, systemId, docType };
  switch (tab) {
    case "awaiting":
      where.status = { in: ["AWAITING_PAYMENT", "PARTIAL"] };
      break;
    case "paid":
      where.status = "PAID";
      break;
    case "deduct":
      where.status = "AWAITING_DEDUCT";
      break;
    case "received":
      where.status = "RECEIVED";
      break;
    case "approved":
      where.status = "APPROVED";
      break;
    case "awaiting_approval":
      where.status = "AWAITING_APPROVAL";
      break;
    case "awaiting_receive":
      where.status = "AWAITING_RECEIVE";
      break;
  }
  const rows = await prisma.accountDocument.findMany({
    where,
    orderBy: tab === "recent" ? { updatedAt: "desc" } : { issueDate: "desc" },
    take: opts?.take ?? 100,
    include: { contact: true },
  });
  if (tab === "overdue") return rows.filter((r) => isOverdue(r));
  return rows;
}

export function getExpenseDoc(tenantId: string, systemId: string, id: string) {
  return prisma.accountDocument.findFirst({
    where: { id, tenantId, systemId },
    include: {
      lines: { orderBy: { sortOrder: "asc" }, include: { account: true } },
      payments: { where: { voidedAt: null }, orderBy: { paidAt: "asc" } },
      contact: true,
      relationsFrom: { include: { to: true } },
      relationsTo: { include: { from: true } },
    },
  });
}

// บัญชีค่าใช้จ่าย/ต้นทุน สำหรับ picker บรรทัด EXPENSE
export function listExpenseAccounts(systemId: string) {
  return prisma.accountLedger.findMany({
    where: { systemId, archivedAt: null, type: { in: ["EXPENSE", "COGS"] } },
    orderBy: { code: "asc" },
    select: { id: true, code: true, name: true },
  });
}

// บัญชีสินทรัพย์ถาวร (16xx) สำหรับ ASSET_PURCHASE
export function listAssetAccounts(systemId: string) {
  return prisma.accountLedger.findMany({
    where: { systemId, archivedAt: null, type: "ASSET", code: { startsWith: "16" } },
    orderBy: { code: "asc" },
    select: { id: true, code: true, name: true },
  });
}

// ─────────────────── สร้างเอกสาร (DRAFT) ───────────────────

export type ExpLineInput = LineInput & {
  accountId?: string | null; // EXPENSE: หมวดบัญชี · ASSET_PURCHASE: บัญชีสินทรัพย์
  productId?: string | null; // PURCHASE: อ้างสินค้า
};

export async function createExpenseDoc(input: {
  tenantId: string;
  systemId: string;
  docType: AccountDocType;
  contactId?: string | null;
  issueDate?: Date;
  dueDate?: Date | null;
  vatMode?: AccountVatMode;
  vatPurchaseMode?: VatPurchaseMode;
  discountAmount?: number;
  note?: string | null;
  adjustReason?: string | null;
  sourceDocId?: string | null;
  lines: ExpLineInput[];
  createdById?: string | null;
}) {
  const settings = await getSettings(input.tenantId, input.systemId);
  const reqVatMode: AccountVatMode = !settings.vatRegistered
    ? "NONE"
    : input.vatMode ?? "EXCLUDE";
  const purchaseMode: VatPurchaseMode = !settings.vatRegistered
    ? "NO_CLAIM"
    : input.vatPurchaseMode ?? "CLAIM";
  const { vatMode, vatTiming } = vatFieldsFor(purchaseMode, reqVatMode);
  const issueDate = input.issueDate ?? new Date();
  const totals = computeTotals({
    lines: input.lines,
    discountAmount: input.discountAmount,
    vatMode,
    vatRegistered: settings.vatRegistered,
    vatRateBp: settings.vatRateBp,
  });
  return prisma.accountDocument.create({
    data: {
      tenantId: input.tenantId,
      systemId: input.systemId,
      docType: input.docType,
      status: "DRAFT",
      direction: "IN",
      issueDate,
      dueDate: input.dueDate ?? null,
      contactId: input.contactId ?? null,
      vatMode,
      vatTiming,
      taxPointBasis: vatTiming,
      discountAmount: input.discountAmount ?? 0,
      subTotal: totals.subTotal,
      vatAmount: totals.vatAmount,
      grandTotal: totals.grandTotal,
      note: input.note ?? null,
      adjustReason: input.adjustReason ?? null,
      sourceDocId: input.sourceDocId ?? null,
      createdById: input.createdById ?? null,
      lines: {
        create: input.lines.map((l, i) => ({
          tenantId: input.tenantId,
          systemId: input.systemId,
          sortOrder: i,
          description: l.description,
          qty: l.qty,
          unitName: l.unitName ?? null,
          unitPrice: l.unitPrice,
          discount: l.discount ?? 0,
          vatRateBp: l.vatRateBp ?? settings.vatRateBp,
          amount: lineAmount(l),
          accountId: l.accountId ?? null,
          productId: l.productId ?? null,
        })),
      },
    },
  });
}

// แก้เอกสาร — DRAFT เท่านั้น
export async function updateExpenseDoc(
  tenantId: string,
  systemId: string,
  id: string,
  input: {
    contactId?: string | null;
    issueDate?: Date;
    dueDate?: Date | null;
    vatMode?: AccountVatMode;
    vatPurchaseMode?: VatPurchaseMode;
    discountAmount?: number;
    note?: string | null;
    adjustReason?: string | null;
    lines?: ExpLineInput[];
  },
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const settings = await getSettings(tenantId, systemId);
  try {
    await prisma.$transaction(async (tx) => {
      const doc = await tx.accountDocument.findFirst({ where: { id, tenantId, systemId } });
      if (!doc) throw new Error("ไม่พบเอกสาร");
      if (doc.status !== "DRAFT") throw new Error("เอกสารที่ออกแล้วแก้ไขไม่ได้ — ใช้ยกเลิก/ออกใบใหม่");
      const reqVatMode: AccountVatMode = !settings.vatRegistered
        ? "NONE"
        : input.vatMode ?? doc.vatMode;
      const purchaseMode: VatPurchaseMode = !settings.vatRegistered
        ? "NO_CLAIM"
        : input.vatPurchaseMode ??
          (doc.vatMode === "NONE"
            ? "NO_CLAIM"
            : doc.vatTiming === "ON_PAYMENT"
              ? "AWAITING"
              : "CLAIM");
      const { vatMode, vatTiming } = vatFieldsFor(purchaseMode, reqVatMode);
      const discountAmount = input.discountAmount ?? doc.discountAmount;
      await tx.accountDocument.update({
        where: { id },
        data: {
          contactId: input.contactId === undefined ? doc.contactId : input.contactId,
          issueDate: input.issueDate ?? doc.issueDate,
          dueDate: input.dueDate === undefined ? doc.dueDate : input.dueDate,
          vatMode,
          vatTiming,
          taxPointBasis: vatTiming,
          discountAmount,
          note: input.note === undefined ? doc.note : input.note,
          adjustReason: input.adjustReason === undefined ? doc.adjustReason : input.adjustReason,
        },
      });
      if (input.lines) {
        await tx.accountDocumentLine.deleteMany({ where: { documentId: id } });
        await tx.accountDocumentLine.createMany({
          data: input.lines.map((l, i) => ({
            tenantId,
            systemId,
            documentId: id,
            sortOrder: i,
            description: l.description,
            qty: l.qty,
            unitName: l.unitName ?? null,
            unitPrice: l.unitPrice,
            discount: l.discount ?? 0,
            vatRateBp: l.vatRateBp ?? settings.vatRateBp,
            amount: lineAmount(l),
            accountId: l.accountId ?? null,
            productId: l.productId ?? null,
          })),
        });
      }
      const lines = await tx.accountDocumentLine.findMany({ where: { documentId: id } });
      const totals = computeTotals({
        lines: lines.map((l) => ({
          description: l.description,
          qty: Number(l.qty),
          unitPrice: l.unitPrice,
          discount: l.discount,
          vatRateBp: l.vatRateBp,
        })),
        discountAmount,
        vatMode,
        vatRegistered: settings.vatRegistered,
        vatRateBp: settings.vatRateBp,
      });
      await tx.accountDocument.update({
        where: { id },
        data: { subTotal: totals.subTotal, vatAmount: totals.vatAmount, grandTotal: totals.grandTotal },
      });
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : "แก้ไขไม่สำเร็จ" };
  }
}

// snapshot ผู้ติดต่อ (freeze พ้น DRAFT) — รวม legalType (M4: ภงด 3/53 ไม่ขยับย้อนหลัง)
function contactSnapshot(c: {
  name: string;
  taxId: string | null;
  legalType?: AccountLegalType;
  branchCode: string | null;
  branchName: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
} | null) {
  if (!c) return undefined;
  return {
    name: c.name,
    taxId: c.taxId,
    legalType: c.legalType,
    branchCode: c.branchCode,
    branchName: c.branchName,
    address: c.address,
    phone: c.phone,
    email: c.email,
  };
}

// ─────────────────── ออกเอกสาร (บันทึกซื้อ/ค่าใช้จ่าย/สินทรัพย์/มัดจำ/CNR/DNR) ───────────────────
// DRAFT → มีผล: จองเลข + freeze snapshot + postDocument (§7.10 ฝั่งซื้อ)
// AWAITING โหมด VAT → สร้าง PURCHASE_TAX_INVOICE (รอรับใบกำกับ) โยง relation TAX_FOR
export async function issueExpenseDoc(
  tenantId: string,
  systemId: string,
  id: string,
): Promise<{ ok: true; docNo: string } | { ok: false; reason: string }> {
  try {
    let docNo = "";
    await prisma.$transaction(async (tx) => {
      const doc = await tx.accountDocument.findFirst({
        where: { id, tenantId, systemId },
        include: { lines: true, contact: true },
      });
      if (!doc) throw new Error("ไม่พบเอกสาร");
      if (doc.direction !== "IN") throw new Error("ไม่ใช่เอกสารฝั่งจ่าย");
      if (doc.status !== "DRAFT") throw new Error("เอกสารนี้ออกแล้ว");
      if (doc.lines.length === 0) throw new Error("ต้องมีรายการอย่างน้อย 1 รายการ");
      docNo = await nextDocNo(tx, tenantId, systemId, doc.docType, doc.issueDate);
      await tx.accountDocument.update({
        where: { id },
        data: {
          docNo,
          status: issueStatusFor(doc.docType),
          contactSnapshot: contactSnapshot(doc.contact) ?? undefined,
        },
      });
      const ctx = { tenantId, systemId };
      await ensureAccounting(ctx, tx);
      // โพสต์บัญชีฝั่งซื้อ (GL-P2P3 จัดการ mapping/1150-1155/16xx/เจ้าหนี้)
      await postDocument(ctx, id, tx);
      // VAT รอใบกำกับ (vatTiming ON_PAYMENT + มี VAT) → เปิดทะเบียนใบกำกับภาษีซื้อรอรับ
      if (
        doc.vatTiming === "ON_PAYMENT" &&
        doc.vatMode !== "NONE" &&
        doc.vatAmount > 0 &&
        (doc.docType === "PURCHASE" || doc.docType === "EXPENSE" || doc.docType === "ASSET_PURCHASE")
      ) {
        await createPendingTaxInvoice(tx, tenantId, systemId, doc, docNo);
      }
    });
    return { ok: true, docNo };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : "ออกเอกสารไม่สำเร็จ" };
  }
}

// สร้าง PURCHASE_TAX_INVOICE สถานะ AWAITING_RECEIVE (ยังไม่โพสต์ — โพสต์ตอน "รับแล้ว")
async function createPendingTaxInvoice(
  tx: Prisma.TransactionClient,
  tenantId: string,
  systemId: string,
  source: {
    id: string;
    contactId: string | null;
    contactSnapshot: unknown;
    vatMode: AccountVatMode;
    vatAmount: number;
  },
  sourceDocNo: string,
): Promise<void> {
  const issueDate = new Date();
  const docNo = await nextDocNo(tx, tenantId, systemId, "PURCHASE_TAX_INVOICE", issueDate);
  const ptx = await tx.accountDocument.create({
    data: {
      tenantId,
      systemId,
      docType: "PURCHASE_TAX_INVOICE",
      status: "AWAITING_RECEIVE",
      direction: "IN",
      docNo,
      issueDate,
      contactId: source.contactId,
      contactSnapshot: (source.contactSnapshot ?? undefined) as Prisma.InputJsonValue | undefined,
      vatMode: source.vatMode,
      vatTiming: "ON_PAYMENT",
      taxPointBasis: "ON_PAYMENT",
      subTotal: 0,
      vatAmount: source.vatAmount,
      grandTotal: source.vatAmount,
      sourceDocId: source.id,
      note: `รอรับใบกำกับภาษีซื้อของ ${sourceDocNo}`,
      lines: {
        create: [
          {
            tenantId,
            systemId,
            sortOrder: 0,
            description: "ภาษีซื้อรอรับใบกำกับ (โอน 1155 → 1150 เมื่อรับใบจริง)",
            qty: 1,
            unitPrice: source.vatAmount,
            discount: 0,
            vatRateBp: 0,
            amount: source.vatAmount,
          },
        ],
      },
    },
  });
  await tx.accountDocumentRelation.create({
    data: { tenantId, systemId, fromId: source.id, toId: ptx.id, type: "TAX_FOR", amount: source.vatAmount },
  });
}

// ใบกำกับภาษีซื้อ "รับแล้ว" → RECEIVED + postDocument (โอน 1155 → 1150 เคลม VAT)
export async function receivePurchaseTaxInvoice(
  tenantId: string,
  systemId: string,
  id: string,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  try {
    await prisma.$transaction(async (tx) => {
      const doc = await tx.accountDocument.findFirst({ where: { id, tenantId, systemId } });
      if (!doc) throw new Error("ไม่พบเอกสาร");
      if (doc.docType !== "PURCHASE_TAX_INVOICE") throw new Error("ไม่ใช่ใบกำกับภาษีซื้อ");
      if (doc.status !== "AWAITING_RECEIVE") throw new Error("สถานะไม่ถูกต้อง (ต้องรอรับ)");
      await tx.accountDocument.update({ where: { id }, data: { status: "RECEIVED" } });
      const ctx = { tenantId, systemId };
      await ensureAccounting(ctx, tx);
      await postDocument(ctx, id, tx); // GL-P2P3: Dr 1150 / Cr 1155
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : "รับใบกำกับไม่สำเร็จ" };
  }
}

// ─────────────────── รับใบเสร็จซื้อสินทรัพย์ (ASSET_PURCHASE → RECEIVED) ───────────────────
export async function markAssetReceived(
  tenantId: string,
  systemId: string,
  id: string,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const doc = await prisma.accountDocument.findFirst({ where: { id, tenantId, systemId } });
  if (!doc) return { ok: false, reason: "ไม่พบเอกสาร" };
  if (doc.docType !== "ASSET_PURCHASE") return { ok: false, reason: "ไม่ใช่เอกสารซื้อสินทรัพย์" };
  if (!["AWAITING_PAYMENT", "PARTIAL", "PAID"].includes(doc.status))
    return { ok: false, reason: "สถานะไม่ถูกต้อง" };
  await prisma.accountDocument.update({ where: { id }, data: { status: "RECEIVED" } });
  return { ok: true };
}

// ─────────────────── บันทึกจ่ายชำระ (+ WHT + 50 ทวิ) ───────────────────
export async function recordVendorPayment(
  tenantId: string,
  systemId: string,
  id: string,
  input: {
    paidAt?: Date;
    channel?: AccountPayChannel;
    financeAccountId?: string | null;
    amount: number; // เงินออกจริง (ไม่รวม WHT)
    whtAmountSatang?: number; // WHT ที่เราหัก vendor (ตัดเจ้าหนี้ด้วย)
    whtRateBp?: number | null;
    whtIncomeType?: AccountWhtIncomeType | null; // ออก 50 ทวิ ถ้ามี
    feeAmount?: number;
    note?: string | null;
    createdById?: string | null;
  },
): Promise<{ ok: true; status: AccountDocStatus } | { ok: false; reason: string }> {
  if (!input.amount || input.amount <= 0) return { ok: false, reason: "ยอดชำระต้องมากกว่า 0" };
  const wht = Math.max(0, input.whtAmountSatang ?? 0);
  try {
    let status: AccountDocStatus = "PARTIAL";
    await prisma.$transaction(async (tx) => {
      const doc = await tx.accountDocument.findFirst({
        where: { id, tenantId, systemId },
        include: { contact: true },
      });
      if (!doc) throw new Error("ไม่พบเอกสาร");
      if (doc.direction !== "IN") throw new Error("ไม่ใช่เอกสารฝั่งจ่าย");
      if (!["AWAITING_PAYMENT", "PARTIAL"].includes(doc.status))
        throw new Error("เอกสารนี้จ่ายชำระไม่ได้ในสถานะปัจจุบัน");
      const tieOff = input.amount + wht; // ยอดที่ตัดเจ้าหนี้
      const remain = Math.max(0, doc.grandTotal - doc.paidTotal);
      if (tieOff > remain + 1) throw new Error("ยอดจ่ายเกินยอดคงเหลือ");
      const payment = await tx.accountDocumentPayment.create({
        data: {
          tenantId,
          systemId,
          documentId: id,
          paidAt: input.paidAt ?? new Date(),
          channel: input.channel ?? "TRANSFER",
          financeAccountId: input.financeAccountId ?? null,
          amount: input.amount,
          whtAmountSatang: wht,
          whtRateBp: input.whtRateBp ?? null,
          feeAmount: Math.max(0, input.feeAmount ?? 0),
          note: input.note ?? null,
          createdById: input.createdById ?? null,
        },
      });
      const newPaid = doc.paidTotal + tieOff;
      const fullyPaid = newPaid >= doc.grandTotal;
      // มัดจำจ่าย: จ่ายครบ → รอหักมัดจำ (mirror ฝั่งรับ)
      status = fullyPaid
        ? doc.docType === "DEPOSIT_PAYMENT"
          ? "AWAITING_DEDUCT"
          : "PAID"
        : "PARTIAL";
      await tx.accountDocument.update({ where: { id }, data: { paidTotal: newPaid, status } });
      const ctx = { tenantId, systemId };
      await ensureAccounting(ctx, tx);
      // GL-P2P3: Dr 2100 เจ้าหนี้ / Cr เงิน + Cr 2130 WHT ค้างนำส่ง (direction IN)
      await postPayment(ctx, payment.id, tx);
      // ออกหนังสือรับรองหัก ณ ที่จ่าย (50 ทวิ) อัตโนมัติ
      if (wht > 0 && input.whtIncomeType) {
        // M5: ฐานเงินได้จริง = ยอดจ่ายจริงงวดนี้ก่อน VAT (subTotal × สัดส่วนที่ตัดหนี้) ไม่ย้อนจาก wht/rate
        const realBase = doc.grandTotal > 0 ? Math.round((doc.subTotal * tieOff) / doc.grandTotal) : tieOff;
        // C3: 50 ทวิ ใช้ paidAt (WHT ตกงวด ภงด. ถูกเดือน)
        await issueWhtCert(tx, tenantId, systemId, doc, payment.id, wht, input.whtRateBp ?? null, input.whtIncomeType, realBase, payment.paidAt);
      }
    });
    return { ok: true, status };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : "บันทึกจ่ายไม่สำเร็จ" };
  }
}

// สร้าง WHT_CERT (50 ทวิ) ผูก payment — ไม่โพสต์ GL (WHT โพสต์กับ payment แล้ว, NO_GL)
async function issueWhtCert(
  tx: Prisma.TransactionClient,
  tenantId: string,
  systemId: string,
  source: { id: string; contactId: string | null; contactSnapshot: unknown; contact: unknown },
  paymentId: string,
  whtAmount: number,
  whtRateBp: number | null,
  incomeType: AccountWhtIncomeType,
  base: number, // M5: ฐานเงินได้จริง (คำนวณจากยอดจ่ายจริง ไม่ย้อนจาก wht/rate)
  issueDate: Date, // C3: = paidAt (WHT ตกงวด ภงด. ถูกเดือน)
): Promise<void> {
  const docNo = await nextDocNo(tx, tenantId, systemId, "WHT_CERT", issueDate);
  const cert = await tx.accountDocument.create({
    data: {
      tenantId,
      systemId,
      docType: "WHT_CERT",
      status: "ISSUED",
      direction: "IN",
      docNo,
      issueDate,
      contactId: source.contactId,
      contactSnapshot: (source.contactSnapshot ?? undefined) as Prisma.InputJsonValue | undefined,
      vatMode: "NONE",
      subTotal: base,
      vatAmount: 0,
      whtAmount,
      grandTotal: base,
      whtIncomeType: incomeType,
      whtRateBp: whtRateBp,
      sourceDocId: source.id,
      sourcePaymentId: paymentId,
      note: "หนังสือรับรองหัก ณ ที่จ่าย (50 ทวิ)",
    },
  });
  await tx.accountDocumentPayment.update({
    where: { id: paymentId },
    data: { whtCertDocId: cert.id },
  });
  await tx.accountDocumentRelation.create({
    data: { tenantId, systemId, fromId: source.id, toId: cert.id, type: "TAX_FOR", amount: whtAmount },
  });
}

// ยกเลิกการจ่าย → reversal + ถอยสถานะ
export async function voidVendorPayment(
  tenantId: string,
  systemId: string,
  documentId: string,
  paymentId: string,
  reason: string,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  try {
    await prisma.$transaction(async (tx) => {
      const pay = await tx.accountDocumentPayment.findFirst({
        where: { id: paymentId, documentId, tenantId, systemId },
      });
      if (!pay) throw new Error("ไม่พบรายการจ่าย");
      if (pay.voidedAt) throw new Error("รายการจ่ายนี้ถูกยกเลิกแล้ว");
      const doc = await tx.accountDocument.findFirst({ where: { id: documentId, tenantId, systemId } });
      if (!doc) throw new Error("ไม่พบเอกสาร");
      await tx.accountDocumentPayment.update({
        where: { id: paymentId },
        data: { voidedAt: new Date(), voidReason: reason || null },
      });
      const tieOff = pay.amount + pay.whtAmountSatang;
      const newPaid = Math.max(0, doc.paidTotal - tieOff);
      await tx.accountDocument.update({
        where: { id: documentId },
        data: { paidTotal: newPaid, status: newPaid > 0 ? "PARTIAL" : "AWAITING_PAYMENT" },
      });
      await reverseFor({ tenantId, systemId }, "AccountDocumentPayment", paymentId, reason, tx);

      // ── R-A/C2: cascade → 50 ทวิ (WHT_CERT) ที่ผูก payment นี้ → VOIDED + ล้าง link ──
      //    ไม่งั้น ภงด.53 นำส่งบนเงินที่ไม่ได้จ่าย (จ่าย void แต่ cert ยัง ISSUED)
      if (pay.whtCertDocId) {
        await tx.accountDocument.updateMany({
          where: { id: pay.whtCertDocId, systemId, docType: "WHT_CERT", status: { notIn: ["VOIDED", "CANCELLED"] } },
          data: { status: "VOIDED", voidedAt: new Date(), voidReason: `ยกเลิกตามการยกเลิกจ่าย: ${reason}` },
        });
        await tx.accountDocumentPayment.update({ where: { id: paymentId }, data: { whtCertDocId: null } });
      }
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : "ยกเลิกการจ่ายไม่สำเร็จ" };
  }
}

// ยกเลิกเอกสาร: DRAFT → CANCELLED · มีผลแล้ว → VOIDED + reversal
export async function voidExpenseDoc(
  tenantId: string,
  systemId: string,
  id: string,
  reason: string,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  try {
    await prisma.$transaction(async (tx) => {
      const doc = await tx.accountDocument.findFirst({ where: { id, tenantId, systemId } });
      if (!doc) throw new Error("ไม่พบเอกสาร");
      if (doc.status === "VOIDED" || doc.status === "CANCELLED")
        throw new Error("เอกสารถูกยกเลิกแล้ว");
      if (doc.status !== "DRAFT") {
        const activePay = await tx.accountDocumentPayment.count({
          where: { documentId: id, voidedAt: null },
        });
        if (activePay > 0) throw new Error("มีการจ่ายค้างอยู่ — ยกเลิกการจ่ายก่อน");
      }
      // เอกสารที่มี posting: PAYABLE + ADJUST + PTX(RECEIVED) = เคยโพสต์ → reversal
      const posted =
        doc.status !== "DRAFT" &&
        doc.status !== "AWAITING_APPROVAL" &&
        doc.status !== "AWAITING_RECEIVE" &&
        doc.status !== "APPROVED";
      await tx.accountDocument.update({
        where: { id },
        data: {
          status: doc.status === "DRAFT" ? "CANCELLED" : "VOIDED",
          voidedAt: new Date(),
          voidReason: reason || null,
        },
      });
      if (posted) {
        await reverseFor({ tenantId, systemId }, "AccountDocument", id, reason, tx);
      }
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : "ยกเลิกเอกสารไม่สำเร็จ" };
  }
}

// ─────────────────── PO / ใบสั่งซื้อสินทรัพย์ (workflow อนุมัติ) ───────────────────

export async function createPurchaseOrder(input: {
  tenantId: string;
  systemId: string;
  docType: "PURCHASE_ORDER" | "ASSET_PURCHASE_ORDER";
  contactId?: string | null;
  issueDate?: Date;
  vatMode?: AccountVatMode;
  discountAmount?: number;
  note?: string | null;
  lines: ExpLineInput[];
  createdById?: string | null;
}) {
  // PO/APO ไม่โพสต์บัญชี — ใช้ VAT CLAIM เป็น default (มีผลตอนแปลงเป็นบันทึกซื้อ)
  return createExpenseDoc({
    ...input,
    vatPurchaseMode: "CLAIM",
  });
}

// ส่งอนุมัติ: DRAFT → AWAITING_APPROVAL
export async function submitForApproval(
  tenantId: string,
  systemId: string,
  id: string,
): Promise<{ ok: true; docNo: string } | { ok: false; reason: string }> {
  try {
    let docNo = "";
    await prisma.$transaction(async (tx) => {
      const doc = await tx.accountDocument.findFirst({
        where: { id, tenantId, systemId },
        include: { lines: true, contact: true },
      });
      if (!doc) throw new Error("ไม่พบเอกสาร");
      if (doc.docType !== "PURCHASE_ORDER" && doc.docType !== "ASSET_PURCHASE_ORDER")
        throw new Error("ไม่ใช่ใบสั่งซื้อ");
      if (doc.status !== "DRAFT") throw new Error("ส่งอนุมัติได้เฉพาะร่าง");
      if (doc.lines.length === 0) throw new Error("ต้องมีรายการอย่างน้อย 1 รายการ");
      docNo = await nextDocNo(tx, tenantId, systemId, doc.docType, doc.issueDate);
      await tx.accountDocument.update({
        where: { id },
        data: {
          docNo,
          status: "AWAITING_APPROVAL",
          contactSnapshot: contactSnapshot(doc.contact) ?? undefined,
        },
      });
    });
    return { ok: true, docNo };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : "ส่งอนุมัติไม่สำเร็จ" };
  }
}

// อนุมัติ: AWAITING_APPROVAL → APPROVED (คุมวงเงิน maxSatang ที่ชั้น action)
export async function approvePurchaseOrder(
  tenantId: string,
  systemId: string,
  id: string,
  approvedById: string,
  opts?: { maxSatang?: number },
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const doc = await prisma.accountDocument.findFirst({ where: { id, tenantId, systemId } });
  if (!doc) return { ok: false, reason: "ไม่พบเอกสาร" };
  if (doc.docType !== "PURCHASE_ORDER" && doc.docType !== "ASSET_PURCHASE_ORDER")
    return { ok: false, reason: "ไม่ใช่ใบสั่งซื้อ" };
  if (doc.status !== "AWAITING_APPROVAL") return { ok: false, reason: "สถานะไม่ถูกต้อง (ต้องรออนุมัติ)" };
  if (opts?.maxSatang !== undefined && doc.grandTotal > opts.maxSatang)
    return { ok: false, reason: `เกินวงเงินอนุมัติ (จำกัด ฿${(opts.maxSatang / 100).toLocaleString("th-TH")})` };
  await prisma.accountDocument.update({
    where: { id },
    data: { status: "APPROVED", approvedById },
  });
  return { ok: true };
}

export async function rejectPurchaseOrder(
  tenantId: string,
  systemId: string,
  id: string,
  reason: string,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const doc = await prisma.accountDocument.findFirst({ where: { id, tenantId, systemId } });
  if (!doc) return { ok: false, reason: "ไม่พบเอกสาร" };
  if (doc.status !== "AWAITING_APPROVAL") return { ok: false, reason: "สถานะไม่ถูกต้อง" };
  await prisma.accountDocument.update({
    where: { id },
    data: { status: "REJECTED", voidReason: reason || null },
  });
  return { ok: true };
}

// แปลง PO → PURCHASE · APO → ASSET_PURCHASE (สร้าง DRAFT ปลายทาง + relation CONVERT)
export async function convertPurchaseOrder(
  tenantId: string,
  systemId: string,
  id: string,
  createdById?: string | null,
): Promise<{ ok: true; newId: string; toDocType: AccountDocType } | { ok: false; reason: string }> {
  try {
    const source = await prisma.accountDocument.findFirst({
      where: { id, tenantId, systemId },
      include: { lines: { orderBy: { sortOrder: "asc" } } },
    });
    if (!source) return { ok: false, reason: "ไม่พบเอกสารต้นทาง" };
    if (source.docType !== "PURCHASE_ORDER" && source.docType !== "ASSET_PURCHASE_ORDER")
      return { ok: false, reason: "แปลงได้เฉพาะใบสั่งซื้อ" };
    if (source.status !== "APPROVED") return { ok: false, reason: "ต้องอนุมัติก่อนจึงแปลงได้" };
    const toDocType: AccountDocType =
      source.docType === "ASSET_PURCHASE_ORDER" ? "ASSET_PURCHASE" : "PURCHASE";

    const created = await prisma.$transaction(async (tx) => {
      const newDoc = await tx.accountDocument.create({
        data: {
          tenantId,
          systemId,
          docType: toDocType,
          status: "DRAFT",
          direction: "IN",
          issueDate: new Date(),
          contactId: source.contactId,
          vatMode: source.vatMode,
          vatTiming: source.vatTiming,
          taxPointBasis: source.taxPointBasis,
          discountAmount: source.discountAmount,
          subTotal: source.subTotal,
          vatAmount: source.vatAmount,
          grandTotal: source.grandTotal,
          note: source.note,
          sourceDocId: source.id,
          createdById: createdById ?? null,
          lines: {
            create: source.lines.map((l, i) => ({
              tenantId,
              systemId,
              sortOrder: i,
              description: l.description,
              qty: l.qty,
              unitName: l.unitName,
              unitPrice: l.unitPrice,
              discount: l.discount,
              vatRateBp: l.vatRateBp,
              amount: l.amount,
              accountId: l.accountId,
              productId: l.productId,
            })),
          },
        },
      });
      await tx.accountDocumentRelation.create({
        data: { tenantId, systemId, fromId: source.id, toId: newDoc.id, type: "CONVERT", amount: source.grandTotal },
      });
      return newDoc;
    });
    return { ok: true, newId: created.id, toDocType };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : "แปลงเอกสารไม่สำเร็จ" };
  }
}

// ─────────────────── สรุปฝั่งจ่าย (หน้าแรกรายจ่าย) ───────────────────
export async function payableStats(tenantId: string, systemId: string) {
  const open = await prisma.accountDocument.findMany({
    where: {
      tenantId,
      systemId,
      direction: "IN",
      status: { in: ["AWAITING_PAYMENT", "PARTIAL"] },
    },
    select: { grandTotal: true, paidTotal: true, dueDate: true, status: true, validUntil: true },
  });
  let payable = 0;
  let overdueCount = 0;
  let overdueAmount = 0;
  for (const d of open) {
    const remain = Math.max(0, d.grandTotal - d.paidTotal);
    payable += remain;
    if (isOverdue({ status: d.status, dueDate: d.dueDate, validUntil: d.validUntil })) {
      overdueCount += 1;
      overdueAmount += remain;
    }
  }
  const [pendingApproval, awaitingTaxInvoice] = await Promise.all([
    prisma.accountDocument.count({
      where: { tenantId, systemId, direction: "IN", status: "AWAITING_APPROVAL" },
    }),
    prisma.accountDocument.count({
      where: { tenantId, systemId, docType: "PURCHASE_TAX_INVOICE", status: "AWAITING_RECEIVE" },
    }),
  ]);
  return { payable, overdueCount, overdueAmount, pendingApproval, awaitingTaxInvoice };
}
