import { prisma } from "@/lib/core/db";
import type {
  AccountDocType,
  AccountDocStatus,
  AccountVatMode,
  AccountVatTiming,
  AccountPayChannel,
  AccountContactKind,
  AccountLegalType,
  Prisma,
} from "@prisma/client";
// posting engine (owner = GL-Core, ไฟล์ gl.ts) — subagent แค่ import + เรียกตามลายเซ็น
// ctx = { tenantId, systemId } · ทุกฟังก์ชันรับ tx? เพื่อโพสต์ใน transaction เดียวกับเอกสาร
import {
  ensureAccounting,
  postDocument,
  postPayment,
  postTaxInvoice,
  reverseFor,
} from "./gl";

// Account (บัญชี P1 — ฝั่งรายรับ) service. scope = tenantId + systemId (feature)
// เอกสารเงิน immutable: DRAFT แก้ได้ · พ้น DRAFT แก้ไม่ได้ → void/reissue

// ─────────────────── ค่าคงที่/ตัวช่วย ───────────────────

export const DOC_PREFIX: Partial<Record<AccountDocType, string>> = {
  QUOTATION: "QT",
  INVOICE: "IV",
  RECEIPT: "RE",
  TAX_INVOICE: "TX",
  DEPOSIT_RECEIPT: "DR",
  CREDIT_NOTE: "CN",
  DEBIT_NOTE: "DN",
  BILLING_NOTE: "BN",
};

export const DOC_LABEL: Partial<Record<AccountDocType, string>> = {
  QUOTATION: "ใบเสนอราคา",
  INVOICE: "ใบแจ้งหนี้",
  RECEIPT: "ใบเสร็จรับเงิน",
  TAX_INVOICE: "ใบกำกับภาษีขาย",
  DEPOSIT_RECEIPT: "ใบรับเงินมัดจำ",
  CREDIT_NOTE: "ใบลดหนี้",
  DEBIT_NOTE: "ใบเพิ่มหนี้",
  BILLING_NOTE: "ใบวางบิล",
};

export const STATUS_LABEL: Record<AccountDocStatus, string> = {
  DRAFT: "ร่าง",
  AWAITING_ACCEPT: "รอตอบรับ",
  ACCEPTED: "ยอมรับแล้ว",
  REJECTED: "ปฏิเสธ",
  AWAITING_PAYMENT: "รอชำระเงิน",
  PARTIAL: "ชำระบางส่วน",
  PAID: "ชำระเงินแล้ว",
  AWAITING_DEDUCT: "รอหักมัดจำ",
  DEDUCTED: "หักมัดจำแล้ว",
  AWAITING_APPROVAL: "รออนุมัติ",
  APPROVED: "อนุมัติแล้ว",
  AWAITING_RECEIVE: "รอรับเอกสาร",
  RECEIVED: "รับแล้ว",
  ISSUED: "ออกแล้ว",
  VOIDED: "ยกเลิก",
  CANCELLED: "ยกเลิก",
};

// สถานะที่เอกสารกลายเป็นเมื่อ "ออกเอกสาร" (issue) ต่อชนิด
const ISSUE_STATUS: Partial<Record<AccountDocType, AccountDocStatus>> = {
  QUOTATION: "AWAITING_ACCEPT",
  INVOICE: "AWAITING_PAYMENT",
  RECEIPT: "PAID",
  TAX_INVOICE: "ISSUED",
  DEPOSIT_RECEIPT: "AWAITING_PAYMENT",
  CREDIT_NOTE: "ISSUED",
  DEBIT_NOTE: "ISSUED",
  BILLING_NOTE: "ISSUED",
};

// การแปลงเอกสารที่อนุญาต (P1)
const CONVERT_MAP: Partial<Record<AccountDocType, AccountDocType[]>> = {
  QUOTATION: ["INVOICE", "DEPOSIT_RECEIPT"],
  INVOICE: ["RECEIPT", "TAX_INVOICE", "CREDIT_NOTE", "DEBIT_NOTE"],
  RECEIPT: ["TAX_INVOICE"],
  TAX_INVOICE: [],
  DEPOSIT_RECEIPT: [],
  CREDIT_NOTE: [],
  DEBIT_NOTE: [],
  BILLING_NOTE: [],
};

const RELATION_FOR: Partial<Record<AccountDocType, "CONVERT" | "TAX_FOR" | "ADJUST">> = {
  INVOICE: "CONVERT",
  RECEIPT: "CONVERT",
  DEPOSIT_RECEIPT: "CONVERT",
  TAX_INVOICE: "TAX_FOR",
  CREDIT_NOTE: "ADJUST",
  DEBIT_NOTE: "ADJUST",
};

export function convertTargets(docType: AccountDocType): AccountDocType[] {
  return CONVERT_MAP[docType] ?? [];
}

// ─────────────────── QC5 Gate A-A5: docType ที่เปิดใช้ (flow ครบ) ───────────────────
// ซ่อนชั่วคราว: DEPOSIT_RECEIPT (มัดจำ) · BILLING_NOTE (วางบิล) · CREDIT_NOTE · DEBIT_NOTE
// (flow ยังไม่ครบ — จะเปิดคืน Gate B) · คงไว้ QUOTATION→INVOICE→RECEIPT→TAX_INVOICE
export const VISIBLE_DOC_TYPES: readonly AccountDocType[] = [
  "QUOTATION",
  "INVOICE",
  "RECEIPT",
  "TAX_INVOICE",
];

export function isVisibleDocType(docType: AccountDocType): boolean {
  return VISIBLE_DOC_TYPES.includes(docType);
}

// เป้าหมายการแปลงที่ "โชว์จริง" = ตัด docType ที่ซ่อน + gate ใบกำกับภาษีตาม vatRegistered (A3)
export function visibleConvertTargets(
  docType: AccountDocType,
  vatRegistered: boolean,
): AccountDocType[] {
  return convertTargets(docType).filter(
    (t) => isVisibleDocType(t) && (t !== "TAX_INVOICE" || vatRegistered),
  );
}

export const baht = (satang: number) =>
  (satang / 100).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function isOverdue(d: {
  status: AccountDocStatus;
  dueDate: Date | null;
  validUntil: Date | null;
}): boolean {
  const now = Date.now();
  if ((d.status === "AWAITING_PAYMENT" || d.status === "PARTIAL") && d.dueDate)
    return d.dueDate.getTime() < now;
  if (d.status === "AWAITING_ACCEPT" && d.validUntil) return d.validUntil.getTime() < now;
  return false;
}

// ─────────────────── ยอดเงิน ───────────────────

export type LineInput = {
  description: string;
  qty: number;
  unitName?: string | null;
  unitPrice: number; // สตางค์
  discount?: number; // สตางค์
  vatRateBp?: number;
};

export function lineAmount(l: LineInput): number {
  const gross = Math.round((l.qty || 0) * (l.unitPrice || 0));
  return Math.max(0, gross - (l.discount || 0));
}

// คำนวณยอดทั้งเอกสาร (VAT ระดับเอกสารจาก settings)
export function computeTotals(input: {
  lines: LineInput[];
  discountAmount?: number;
  depositDeducted?: number;
  vatMode: AccountVatMode;
  vatRegistered: boolean;
  vatRateBp: number;
}): { subTotal: number; vatAmount: number; grandTotal: number } {
  const subTotal = input.lines.reduce((s, l) => s + lineAmount(l), 0);
  const afterDiscount = Math.max(0, subTotal - (input.discountAmount || 0));
  const rate = input.vatMode === "NONE" || !input.vatRegistered ? 0 : input.vatRateBp / 10000;
  let vatAmount = 0;
  let grandTotal = afterDiscount;
  if (rate > 0) {
    if (input.vatMode === "INCLUDE") {
      // ราคารวม VAT แล้ว → แยก VAT ออกมาแสดง
      const net = Math.round(afterDiscount / (1 + rate));
      vatAmount = afterDiscount - net;
      grandTotal = afterDiscount;
    } else {
      vatAmount = Math.round(afterDiscount * rate);
      grandTotal = afterDiscount + vatAmount;
    }
  }
  grandTotal = Math.max(0, grandTotal - (input.depositDeducted || 0));
  return { subTotal, vatAmount, grandTotal };
}

// ─────────────────── ตั้งค่า ───────────────────

export type AccountSettingsView = {
  orgName: string;
  orgNameEn: string | null;
  taxId: string | null;
  branchCode: string | null;
  branchName: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  logoUrl: string | null;
  vatRegistered: boolean;
  vatRateBp: number;
  // QC5-A1: จุดรับรู้ภาษีขายเริ่มต้นของกิจการ (สินค้า=ON_ISSUE / บริการ=ON_PAYMENT)
  taxPointBasis: AccountVatTiming;
  defaultDueDays: number;
  defaultValidDays: number;
  footerNote: string | null;
};

const SETTINGS_DEFAULT: AccountSettingsView = {
  orgName: "",
  orgNameEn: null,
  taxId: null,
  branchCode: "00000",
  branchName: "สำนักงานใหญ่",
  address: null,
  phone: null,
  email: null,
  website: null,
  logoUrl: null,
  vatRegistered: true,
  vatRateBp: 700,
  taxPointBasis: "ON_ISSUE",
  defaultDueDays: 30,
  defaultValidDays: 30,
  footerNote: null,
};

// อ่าน taxPointBasis จาก docConfig JSON (ไม่มีคอลัมน์เฉพาะใน schema)
function readTaxPointBasis(docConfig: unknown): AccountVatTiming {
  const v = (docConfig as Record<string, unknown> | null)?.taxPointBasis;
  return v === "ON_PAYMENT" ? "ON_PAYMENT" : "ON_ISSUE";
}

export async function getSettings(
  tenantId: string,
  systemId: string,
): Promise<AccountSettingsView> {
  const s = await prisma.accountSettings.findFirst({ where: { tenantId, systemId } });
  if (!s) return { ...SETTINGS_DEFAULT };
  return {
    orgName: s.orgName,
    orgNameEn: s.orgNameEn,
    taxId: s.taxId,
    branchCode: s.branchCode,
    branchName: s.branchName,
    address: s.address,
    phone: s.phone,
    email: s.email,
    website: s.website,
    logoUrl: s.logoUrl,
    vatRegistered: s.vatRegistered,
    vatRateBp: s.vatRateBp,
    taxPointBasis: readTaxPointBasis(s.docConfig),
    defaultDueDays: s.defaultDueDays,
    defaultValidDays: s.defaultValidDays,
    footerNote: s.footerNote,
  };
}

export async function saveSettings(
  tenantId: string,
  systemId: string,
  input: Partial<AccountSettingsView>,
) {
  const existing = await prisma.accountSettings.findFirst({ where: { tenantId, systemId } });
  // merge taxPointBasis เข้า docConfig (คงคีย์อื่นเดิมไว้)
  const prevConfig =
    (existing?.docConfig as Record<string, unknown> | null | undefined) ?? {};
  const taxPointBasis: AccountVatTiming =
    input.taxPointBasis === "ON_PAYMENT" ? "ON_PAYMENT" : "ON_ISSUE";
  const docConfig = { ...prevConfig, taxPointBasis };
  const data = {
    orgName: input.orgName ?? "",
    orgNameEn: input.orgNameEn ?? null,
    taxId: input.taxId ?? null,
    branchCode: input.branchCode || "00000",
    branchName: input.branchName ?? null,
    address: input.address ?? null,
    phone: input.phone ?? null,
    email: input.email ?? null,
    website: input.website ?? null,
    logoUrl: input.logoUrl ?? null,
    vatRegistered: input.vatRegistered ?? true,
    vatRateBp: input.vatRateBp ?? 700,
    defaultDueDays: input.defaultDueDays ?? 30,
    defaultValidDays: input.defaultValidDays ?? 30,
    footerNote: input.footerNote ?? null,
    docConfig: docConfig as Prisma.InputJsonValue,
  };
  if (existing) {
    return prisma.accountSettings.update({ where: { id: existing.id }, data });
  }
  return prisma.accountSettings.create({ data: { tenantId, systemId, ...data } });
}

// ─────────────────── ผู้ติดต่อ ───────────────────

export function listContacts(
  tenantId: string,
  systemId: string,
  opts?: { kind?: AccountContactKind; includeArchived?: boolean },
) {
  return prisma.accountContact.findMany({
    where: {
      tenantId,
      systemId,
      ...(opts?.includeArchived ? {} : { archivedAt: null }),
      ...(opts?.kind ? { kind: opts.kind } : {}),
    },
    orderBy: { createdAt: "desc" },
  });
}

export function getContact(tenantId: string, systemId: string, id: string) {
  return prisma.accountContact.findFirst({ where: { id, tenantId, systemId } });
}

export async function createContact(input: {
  tenantId: string;
  systemId: string;
  kind: AccountContactKind;
  legalType?: AccountLegalType;
  name: string;
  taxId?: string | null;
  branchCode?: string | null;
  branchName?: string | null;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  creditTermDays?: number;
  note?: string | null;
}) {
  return prisma.accountContact.create({
    data: {
      tenantId: input.tenantId,
      systemId: input.systemId,
      kind: input.kind,
      legalType: input.legalType ?? "COMPANY",
      name: input.name,
      taxId: input.taxId ?? null,
      branchCode: input.branchCode || "00000",
      branchName: input.branchName ?? null,
      address: input.address ?? null,
      phone: input.phone ?? null,
      email: input.email ?? null,
      creditTermDays: input.creditTermDays ?? 0,
      note: input.note ?? null,
    },
  });
}

export async function updateContact(
  tenantId: string,
  systemId: string,
  id: string,
  input: Partial<{
    kind: AccountContactKind;
    legalType: AccountLegalType;
    name: string;
    taxId: string | null;
    branchCode: string | null;
    branchName: string | null;
    address: string | null;
    phone: string | null;
    email: string | null;
    creditTermDays: number;
    note: string | null;
  }>,
) {
  await prisma.accountContact.updateMany({ where: { id, tenantId, systemId }, data: input });
}

export async function archiveContact(tenantId: string, systemId: string, id: string) {
  await prisma.accountContact.updateMany({
    where: { id, tenantId, systemId },
    data: { archivedAt: new Date() },
  });
}

// ─────────────────── เลขรันเอกสาร ───────────────────

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
  const prefix = DOC_PREFIX[docType] ?? docType;
  const seq = await tx.accountDocSequence.upsert({
    where: { systemId_docType_periodKey: { systemId, docType, periodKey } },
    create: { tenantId, systemId, docType, prefix, periodKey, lastNo: 1 },
    update: { lastNo: { increment: 1 } },
  });
  return `${prefix}-${year}-${month}-${String(seq.lastNo).padStart(4, "0")}`;
}

// ─────────────────── เอกสาร ───────────────────

export type DocTab = "recent" | "awaiting" | "paid" | "overdue" | "all";

export async function listDocuments(
  tenantId: string,
  systemId: string,
  docType: AccountDocType,
  opts?: { tab?: DocTab; take?: number },
) {
  const tab = opts?.tab ?? "recent";
  const where: Prisma.AccountDocumentWhereInput = { tenantId, systemId, docType };
  if (tab === "paid") {
    where.status = "PAID";
  } else if (tab === "awaiting") {
    where.status =
      docType === "QUOTATION"
        ? "AWAITING_ACCEPT"
        : { in: ["AWAITING_PAYMENT", "PARTIAL"] };
  }
  const rows = await prisma.accountDocument.findMany({
    where,
    orderBy: tab === "recent" ? { updatedAt: "desc" } : { issueDate: "desc" },
    take: opts?.take ?? 100,
  });
  if (tab === "overdue") return rows.filter((r) => isOverdue(r));
  return rows;
}

export function getDocument(tenantId: string, systemId: string, id: string) {
  return prisma.accountDocument.findFirst({
    where: { id, tenantId, systemId },
    include: {
      lines: { orderBy: { sortOrder: "asc" } },
      payments: { where: { voidedAt: null }, orderBy: { paidAt: "asc" } },
      contact: true,
      relationsFrom: { include: { to: true } },
      relationsTo: { include: { from: true } },
    },
  });
}

async function recomputeAndSave(
  tx: Prisma.TransactionClient,
  documentId: string,
  vatMode: AccountVatMode,
  discountAmount: number,
  depositDeducted: number,
  vatRegistered: boolean,
  vatRateBp: number,
) {
  const lines = await tx.accountDocumentLine.findMany({ where: { documentId } });
  const totals = computeTotals({
    lines: lines.map((l) => ({
      description: l.description,
      qty: Number(l.qty),
      unitPrice: l.unitPrice,
      discount: l.discount,
      vatRateBp: l.vatRateBp,
    })),
    discountAmount,
    depositDeducted,
    vatMode,
    vatRegistered,
    vatRateBp,
  });
  await tx.accountDocument.update({
    where: { id: documentId },
    data: { subTotal: totals.subTotal, vatAmount: totals.vatAmount, grandTotal: totals.grandTotal },
  });
  return totals;
}

export async function createDocument(input: {
  tenantId: string;
  systemId: string;
  docType: AccountDocType;
  contactId?: string | null;
  issueDate?: Date;
  dueDate?: Date | null;
  validUntil?: Date | null;
  vatMode?: AccountVatMode;
  vatTiming?: AccountVatTiming; // QC5-A1: จุดรับรู้ภาษี (ต่อใบ) — default จากตั้งค่ากิจการ
  discountAmount?: number;
  note?: string | null;
  adjustReason?: string | null;
  lines: LineInput[];
  createdById?: string | null;
  sourceDocId?: string | null;
}) {
  const settings = await getSettings(input.tenantId, input.systemId);
  // A3: ไม่จด VAT → บังคับ vatMode NONE (ไม่มีบรรทัด VAT)
  const vatMode: AccountVatMode = !settings.vatRegistered
    ? "NONE"
    : input.vatMode ?? "EXCLUDE";
  // A1: จุดรับรู้ภาษี — ต่อใบ (form) หรือ default ตามประเภทกิจการ
  const vatTiming: AccountVatTiming = input.vatTiming ?? settings.taxPointBasis;
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
      direction: "OUT",
      issueDate,
      dueDate: input.dueDate ?? null,
      validUntil: input.validUntil ?? null,
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
        })),
      },
    },
  });
}

// แก้เอกสาร — DRAFT เท่านั้น (immutable rule)
export async function updateDocument(
  tenantId: string,
  systemId: string,
  id: string,
  input: {
    contactId?: string | null;
    issueDate?: Date;
    dueDate?: Date | null;
    validUntil?: Date | null;
    vatMode?: AccountVatMode;
    vatTiming?: AccountVatTiming;
    discountAmount?: number;
    note?: string | null;
    adjustReason?: string | null;
    lines?: LineInput[];
  },
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const settings = await getSettings(tenantId, systemId);
  try {
    await prisma.$transaction(async (tx) => {
      const doc = await tx.accountDocument.findFirst({ where: { id, tenantId, systemId } });
      if (!doc) throw new Error("ไม่พบเอกสาร");
      if (doc.status !== "DRAFT") throw new Error("เอกสารที่ออกแล้วแก้ไขไม่ได้ — ใช้ยกเลิก/ออกใบใหม่");
      // A3: ไม่จด VAT → บังคับ NONE
      const vatMode: AccountVatMode = !settings.vatRegistered
        ? "NONE"
        : input.vatMode ?? doc.vatMode;
      const vatTiming: AccountVatTiming = input.vatTiming ?? doc.vatTiming;
      const discountAmount = input.discountAmount ?? doc.discountAmount;
      await tx.accountDocument.update({
        where: { id },
        data: {
          contactId: input.contactId === undefined ? doc.contactId : input.contactId,
          issueDate: input.issueDate ?? doc.issueDate,
          dueDate: input.dueDate === undefined ? doc.dueDate : input.dueDate,
          validUntil: input.validUntil === undefined ? doc.validUntil : input.validUntil,
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
          })),
        });
      }
      await recomputeAndSave(
        tx,
        id,
        vatMode,
        discountAmount,
        doc.depositDeducted,
        settings.vatRegistered,
        settings.vatRateBp,
      );
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : "แก้ไขไม่สำเร็จ" };
  }
}

// ออกเอกสาร: DRAFT → มีผล (จองเลข docNo + freeze contactSnapshot + set status)
export async function issueDocument(
  tenantId: string,
  systemId: string,
  id: string,
): Promise<{ ok: true; docNo: string } | { ok: false; reason: string }> {
  try {
    const settings = await getSettings(tenantId, systemId);
    let docNo = "";
    await prisma.$transaction(async (tx) => {
      const doc = await tx.accountDocument.findFirst({
        where: { id, tenantId, systemId },
        include: { lines: true, contact: true },
      });
      if (!doc) throw new Error("ไม่พบเอกสาร");
      if (doc.status !== "DRAFT") throw new Error("เอกสารนี้ออกแล้ว");
      if (doc.lines.length === 0) throw new Error("ต้องมีรายการอย่างน้อย 1 รายการ");
      // A3: ไม่จด VAT → ห้ามออกใบกำกับภาษี
      if (doc.docType === "TAX_INVOICE" && !settings.vatRegistered)
        throw new Error("กิจการยังไม่จดทะเบียน VAT — ออกใบกำกับภาษีไม่ได้");
      docNo = await nextDocNo(tx, tenantId, systemId, doc.docType, doc.issueDate);
      const snapshot = doc.contact
        ? {
            name: doc.contact.name,
            taxId: doc.contact.taxId,
            branchCode: doc.contact.branchCode,
            branchName: doc.contact.branchName,
            address: doc.contact.address,
            phone: doc.contact.phone,
            email: doc.contact.email,
          }
        : null;
      await tx.accountDocument.update({
        where: { id },
        data: {
          docNo,
          status: ISSUE_STATUS[doc.docType],
          contactSnapshot: snapshot ?? undefined,
        },
      });
      // ── A5/A2: โพสต์บัญชีเงียบใน tx เดียวกัน (posting ล้ม = เอกสาร rollback) ──
      const ctx = { tenantId, systemId };
      await ensureAccounting(ctx, tx);
      if (doc.docType === "INVOICE" || doc.docType === "RECEIPT") {
        // ตั้งลูกหนี้/รายได้/VAT (accrual) — ON_PAYMENT พัก VAT ที่ 2210 (logic ใน gl)
        await postDocument(ctx, id, tx);
      } else if (doc.docType === "TAX_INVOICE") {
        // A2: ใบกำกับเป็นตัวกำหนดเดือน VAT → ย้าย 2205/2210 → 2200
        await postTaxInvoice(ctx, id, tx);
      }
    });
    return { ok: true, docNo };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : "ออกเอกสารไม่สำเร็จ" };
  }
}

// ใบเสนอราคา: ตอบรับ/ปฏิเสธ
export async function setQuotationResponse(
  tenantId: string,
  systemId: string,
  id: string,
  accepted: boolean,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const doc = await prisma.accountDocument.findFirst({ where: { id, tenantId, systemId } });
  if (!doc) return { ok: false, reason: "ไม่พบเอกสาร" };
  if (doc.docType !== "QUOTATION") return { ok: false, reason: "ไม่ใช่ใบเสนอราคา" };
  if (doc.status !== "AWAITING_ACCEPT") return { ok: false, reason: "สถานะไม่ถูกต้อง" };
  await prisma.accountDocument.update({
    where: { id },
    data: {
      status: accepted ? "ACCEPTED" : "REJECTED",
      acceptedAt: accepted ? new Date() : null,
    },
  });
  return { ok: true };
}

// แปลงเอกสาร (QT→IV, IV→RE/TX/CN/DN ฯลฯ) → สร้าง DRAFT ปลายทาง + relation
export async function convertDocument(
  tenantId: string,
  systemId: string,
  id: string,
  toDocType: AccountDocType,
  createdById?: string | null,
): Promise<{ ok: true; newId: string } | { ok: false; reason: string }> {
  try {
    const source = await prisma.accountDocument.findFirst({
      where: { id, tenantId, systemId },
      include: { lines: { orderBy: { sortOrder: "asc" } } },
    });
    if (!source) return { ok: false, reason: "ไม่พบเอกสารต้นทาง" };
    if (!convertTargets(source.docType).includes(toDocType))
      return { ok: false, reason: "แปลงเป็นเอกสารชนิดนี้ไม่ได้" };
    if (source.status === "DRAFT")
      return { ok: false, reason: "ต้องออกเอกสารต้นทางก่อนจึงแปลงได้" };

    const settings = await getSettings(tenantId, systemId);
    const dueDate =
      toDocType === "INVOICE" && source.contactId
        ? await computeDueDate(tenantId, systemId, source.contactId, settings.defaultDueDays)
        : null;

    const created = await prisma.$transaction(async (tx) => {
      const newDoc = await tx.accountDocument.create({
        data: {
          tenantId,
          systemId,
          docType: toDocType,
          status: "DRAFT",
          direction: "OUT",
          issueDate: new Date(),
          dueDate,
          contactId: source.contactId,
          vatMode: source.vatMode,
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
            })),
          },
        },
      });
      await tx.accountDocumentRelation.create({
        data: {
          tenantId,
          systemId,
          fromId: source.id,
          toId: newDoc.id,
          type: RELATION_FOR[toDocType] ?? "CONVERT",
          amount: source.grandTotal,
        },
      });
      return newDoc;
    });
    return { ok: true, newId: created.id };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : "แปลงเอกสารไม่สำเร็จ" };
  }
}

async function computeDueDate(
  tenantId: string,
  systemId: string,
  contactId: string,
  fallbackDays: number,
): Promise<Date> {
  const c = await prisma.accountContact.findFirst({ where: { id: contactId, tenantId, systemId } });
  const days = c?.creditTermDays ?? fallbackDays;
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d;
}

// บันทึกรับชำระเงิน → ปรับสถานะ PARTIAL/PAID + โพสต์บัญชี + (บริการ) ออกใบกำกับต่องวด
export async function recordPayment(
  tenantId: string,
  systemId: string,
  id: string,
  input: {
    paidAt?: Date;
    channel?: AccountPayChannel;
    financeAccountId?: string | null;
    amount: number; // เงินเข้าจริง (ไม่รวม WHT)
    whtAmountSatang?: number; // WHT ที่ถูกหัก (ตัดหนี้ด้วย)
    whtRateBp?: number | null;
    feeAmount?: number; // ค่าธรรมเนียมโอน/gateway
    note?: string | null;
    createdById?: string | null;
  },
): Promise<{ ok: true; status: AccountDocStatus } | { ok: false; reason: string }> {
  if (!input.amount || input.amount <= 0) return { ok: false, reason: "ยอดชำระต้องมากกว่า 0" };
  const wht = Math.max(0, input.whtAmountSatang ?? 0);
  try {
    const settings = await getSettings(tenantId, systemId);
    let status: AccountDocStatus = "PARTIAL";
    await prisma.$transaction(async (tx) => {
      const doc = await tx.accountDocument.findFirst({ where: { id, tenantId, systemId } });
      if (!doc) throw new Error("ไม่พบเอกสาร");
      if (!["AWAITING_PAYMENT", "PARTIAL"].includes(doc.status))
        throw new Error("เอกสารนี้รับชำระไม่ได้ในสถานะปัจจุบัน");
      // A5: paidTotal = ยอดที่ตัดหนี้ (เงินเข้า + WHT ถูกหัก) — กันเกินยอด
      const tieOff = input.amount + wht;
      const remain = Math.max(0, doc.grandTotal - doc.paidTotal);
      if (tieOff > remain + 1) // เผื่อ rounding 1 สตางค์
        throw new Error("ยอดชำระเกินยอดคงเหลือ");
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
      status = newPaid >= doc.grandTotal ? "PAID" : "PARTIAL";
      await tx.accountDocument.update({
        where: { id },
        data: { paidTotal: newPaid, status },
      });
      // ── A5: โพสต์บัญชีการชำระ (Dr เงิน/WHT/fee, Cr ลูกหนี้ + โอน VAT ถ้า ON_PAYMENT) ──
      const ctx = { tenantId, systemId };
      await ensureAccounting(ctx, tx);
      await postPayment(ctx, payment.id, tx);
      // ── A1: บริการ (ON_PAYMENT) + จด VAT → ออกใบกำกับภาษีต่อ payment งวดนี้ ──
      if (
        settings.vatRegistered &&
        doc.vatTiming === "ON_PAYMENT" &&
        doc.vatMode !== "NONE" &&
        doc.docType === "INVOICE"
      ) {
        await issueServiceTaxInvoice(tx, tenantId, systemId, doc, payment.id, tieOff);
      }
    });
    return { ok: true, status };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : "บันทึกชำระไม่สำเร็จ" };
  }
}

// A1: สร้าง+ออกใบกำกับภาษี (บริการ) ต่อ payment งวดที่รับ (1 payment = 1 ใบกำกับ) + โพสต์ VAT
async function issueServiceTaxInvoice(
  tx: Prisma.TransactionClient,
  tenantId: string,
  systemId: string,
  invoice: { id: string; contactId: string | null; contactSnapshot: unknown; vatMode: AccountVatMode; vatAmount: number; grandTotal: number },
  paymentId: string,
  tieOff: number, // ยอดที่ตัดหนี้งวดนี้ (เงิน + WHT)
): Promise<void> {
  // แบ่งสัดส่วน VAT ของงวดนี้ตามสัดส่วนที่รับต่อยอดเต็มใบ (แสดงบนเอกสาร — journal จริงอยู่ใน gl)
  const portion = invoice.grandTotal > 0 ? tieOff / invoice.grandTotal : 0;
  const vatPortion = Math.round(invoice.vatAmount * portion);
  const base = Math.max(0, tieOff - vatPortion);
  const issueDate = new Date();
  const docNo = await nextDocNo(tx, tenantId, systemId, "TAX_INVOICE", issueDate);
  const taxInv = await tx.accountDocument.create({
    data: {
      tenantId,
      systemId,
      docType: "TAX_INVOICE",
      status: "ISSUED",
      direction: "OUT",
      docNo,
      issueDate,
      contactId: invoice.contactId,
      contactSnapshot: (invoice.contactSnapshot ?? undefined) as Prisma.InputJsonValue | undefined,
      vatMode: invoice.vatMode,
      vatTiming: "ON_PAYMENT",
      taxPointBasis: "ON_PAYMENT",
      subTotal: base,
      vatAmount: vatPortion,
      grandTotal: tieOff,
      sourceDocId: invoice.id,
      sourcePaymentId: paymentId,
      lines: {
        create: [
          {
            tenantId,
            systemId,
            sortOrder: 0,
            description: "ใบกำกับภาษี — รับชำระค่าบริการ (ตามงวดรับเงิน)",
            qty: 1,
            unitPrice: base,
            discount: 0,
            vatRateBp: invoice.vatMode === "NONE" ? 0 : 700,
            amount: base,
          },
        ],
      },
    },
  });
  await tx.accountDocumentRelation.create({
    data: {
      tenantId,
      systemId,
      fromId: invoice.id,
      toId: taxInv.id,
      type: "TAX_FOR",
      amount: tieOff,
    },
  });
  // A2: ใบกำกับกำหนดเดือน VAT → โอน 2210 → 2200 ตามงวด
  await postTaxInvoice({ tenantId, systemId }, taxInv.id, tx);
}

// ยกเลิกการรับชำระ → reversal journal + ถอย paidTotal/สถานะ
export async function voidPayment(
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
      if (!pay) throw new Error("ไม่พบรายการชำระ");
      if (pay.voidedAt) throw new Error("รายการชำระนี้ถูกยกเลิกแล้ว");
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
        data: {
          paidTotal: newPaid,
          status: newPaid > 0 ? "PARTIAL" : "AWAITING_PAYMENT",
        },
      });
      // reversal journal ของการชำระ
      await reverseFor({ tenantId, systemId }, "AccountDocumentPayment", paymentId, reason, tx);
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : "ยกเลิกการชำระไม่สำเร็จ" };
  }
}

// ยกเลิกเอกสาร: DRAFT → CANCELLED · มีผลแล้ว → VOIDED
export async function voidDocument(
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
      // เอกสารมี payment ที่ยังไม่ void → ต้อง void payment ก่อน (กันบัญชีค้าง)
      if (doc.status !== "DRAFT") {
        const activePay = await tx.accountDocumentPayment.count({
          where: { documentId: id, voidedAt: null },
        });
        if (activePay > 0) throw new Error("มีการรับชำระค้างอยู่ — ยกเลิกการชำระก่อน");
      }
      const wasIssued = doc.status !== "DRAFT"; // เคยมีผล (มี journal)
      await tx.accountDocument.update({
        where: { id },
        data: {
          status: doc.status === "DRAFT" ? "CANCELLED" : "VOIDED",
          voidedAt: new Date(),
          voidReason: reason || null,
        },
      });
      // A5: เอกสารเคยมีผล → กลับรายการ journal (reversal)
      if (wasIssued) {
        await reverseFor({ tenantId, systemId }, "AccountDocument", id, reason, tx);
      }
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : "ยกเลิกเอกสารไม่สำเร็จ" };
  }
}

// สรุปหน้าแรก: ค้างรับ/พ้นกำหนด
export async function overviewStats(tenantId: string, systemId: string) {
  const openInvoices = await prisma.accountDocument.findMany({
    where: {
      tenantId,
      systemId,
      docType: "INVOICE",
      status: { in: ["AWAITING_PAYMENT", "PARTIAL"] },
    },
    select: { grandTotal: true, paidTotal: true, dueDate: true, status: true, validUntil: true },
  });
  let receivable = 0;
  let overdueCount = 0;
  let overdueAmount = 0;
  for (const d of openInvoices) {
    const remain = Math.max(0, d.grandTotal - d.paidTotal);
    receivable += remain;
    if (isOverdue({ status: d.status, dueDate: d.dueDate, validUntil: d.validUntil })) {
      overdueCount += 1;
      overdueAmount += remain;
    }
  }
  const [docCount, contactCount] = await Promise.all([
    prisma.accountDocument.count({ where: { tenantId, systemId } }),
    prisma.accountContact.count({ where: { tenantId, systemId, archivedAt: null } }),
  ]);
  return { receivable, overdueCount, overdueAmount, docCount, contactCount };
}
