import { prisma } from "@/lib/core/db";
import type {
  AccountDocType,
  AccountDocStatus,
  AccountVatMode,
  AccountPayChannel,
  AccountContactKind,
  AccountLegalType,
  Prisma,
} from "@prisma/client";

// Account (บัญชี P1 — ฝั่งรายรับ) service. scope = tenantId + systemId (feature)
// เอกสารเงิน immutable: DRAFT แก้ได้ · พ้น DRAFT แก้ไม่ได้ → void/reissue

// ─────────────────── ค่าคงที่/ตัวช่วย ───────────────────

export const DOC_PREFIX: Record<AccountDocType, string> = {
  QUOTATION: "QT",
  INVOICE: "IV",
  RECEIPT: "RE",
  TAX_INVOICE: "TX",
  DEPOSIT_RECEIPT: "DR",
  CREDIT_NOTE: "CN",
  DEBIT_NOTE: "DN",
  BILLING_NOTE: "BN",
};

export const DOC_LABEL: Record<AccountDocType, string> = {
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
  ISSUED: "ออกแล้ว",
  VOIDED: "ยกเลิก",
  CANCELLED: "ยกเลิก",
};

// สถานะที่เอกสารกลายเป็นเมื่อ "ออกเอกสาร" (issue) ต่อชนิด
const ISSUE_STATUS: Record<AccountDocType, AccountDocStatus> = {
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
const CONVERT_MAP: Record<AccountDocType, AccountDocType[]> = {
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
  defaultDueDays: 30,
  defaultValidDays: 30,
  footerNote: null,
};

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
  };
  const existing = await prisma.accountSettings.findFirst({ where: { tenantId, systemId } });
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
  const prefix = DOC_PREFIX[docType];
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
  discountAmount?: number;
  note?: string | null;
  adjustReason?: string | null;
  lines: LineInput[];
  createdById?: string | null;
  sourceDocId?: string | null;
}) {
  const settings = await getSettings(input.tenantId, input.systemId);
  const vatMode = input.vatMode ?? "EXCLUDE";
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
      const vatMode = input.vatMode ?? doc.vatMode;
      const discountAmount = input.discountAmount ?? doc.discountAmount;
      await tx.accountDocument.update({
        where: { id },
        data: {
          contactId: input.contactId === undefined ? doc.contactId : input.contactId,
          issueDate: input.issueDate ?? doc.issueDate,
          dueDate: input.dueDate === undefined ? doc.dueDate : input.dueDate,
          validUntil: input.validUntil === undefined ? doc.validUntil : input.validUntil,
          vatMode,
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
    let docNo = "";
    await prisma.$transaction(async (tx) => {
      const doc = await tx.accountDocument.findFirst({
        where: { id, tenantId, systemId },
        include: { lines: true, contact: true },
      });
      if (!doc) throw new Error("ไม่พบเอกสาร");
      if (doc.status !== "DRAFT") throw new Error("เอกสารนี้ออกแล้ว");
      if (doc.lines.length === 0) throw new Error("ต้องมีรายการอย่างน้อย 1 รายการ");
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

// บันทึกรับชำระเงิน → ปรับสถานะ PARTIAL/PAID
export async function recordPayment(
  tenantId: string,
  systemId: string,
  id: string,
  input: { paidAt?: Date; channel?: AccountPayChannel; amount: number; note?: string | null; createdById?: string | null },
): Promise<{ ok: true; status: AccountDocStatus } | { ok: false; reason: string }> {
  if (!input.amount || input.amount <= 0) return { ok: false, reason: "ยอดชำระต้องมากกว่า 0" };
  try {
    let status: AccountDocStatus = "PARTIAL";
    await prisma.$transaction(async (tx) => {
      const doc = await tx.accountDocument.findFirst({ where: { id, tenantId, systemId } });
      if (!doc) throw new Error("ไม่พบเอกสาร");
      if (!["AWAITING_PAYMENT", "PARTIAL"].includes(doc.status))
        throw new Error("เอกสารนี้รับชำระไม่ได้ในสถานะปัจจุบัน");
      await tx.accountDocumentPayment.create({
        data: {
          tenantId,
          systemId,
          documentId: id,
          paidAt: input.paidAt ?? new Date(),
          channel: input.channel ?? "TRANSFER",
          amount: input.amount,
          note: input.note ?? null,
          createdById: input.createdById ?? null,
        },
      });
      const newPaid = doc.paidTotal + input.amount;
      status = newPaid >= doc.grandTotal ? "PAID" : "PARTIAL";
      await tx.accountDocument.update({
        where: { id },
        data: { paidTotal: newPaid, status },
      });
    });
    return { ok: true, status };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : "บันทึกชำระไม่สำเร็จ" };
  }
}

// ยกเลิกเอกสาร: DRAFT → CANCELLED · มีผลแล้ว → VOIDED
export async function voidDocument(
  tenantId: string,
  systemId: string,
  id: string,
  reason: string,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const doc = await prisma.accountDocument.findFirst({ where: { id, tenantId, systemId } });
  if (!doc) return { ok: false, reason: "ไม่พบเอกสาร" };
  if (doc.status === "VOIDED" || doc.status === "CANCELLED")
    return { ok: false, reason: "เอกสารถูกยกเลิกแล้ว" };
  await prisma.accountDocument.update({
    where: { id },
    data: {
      status: doc.status === "DRAFT" ? "CANCELLED" : "VOIDED",
      voidedAt: new Date(),
      voidReason: reason || null,
    },
  });
  return { ok: true };
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
