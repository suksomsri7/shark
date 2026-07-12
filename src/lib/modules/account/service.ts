import { randomBytes } from "node:crypto";
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
  DEPOSIT_RECEIPT: ["TAX_INVOICE"], // M3: ออกใบกำกับจากใบรับมัดจำ (VAT รับรู้ตอนรับเงินแล้ว → GL-neutral)
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

// ─────────────────── QC5 Gate B: docType ฝั่งรายรับที่เปิดใช้ (flow ครบ) ───────────────────
// Gate A เคยซ่อนมัดจำ/วางบิล/CN/DN — Gate B เปิดคืนพร้อม flow+posting+ใบกำกับ ม.86/4 ครบ
export const VISIBLE_DOC_TYPES: readonly AccountDocType[] = [
  "QUOTATION",
  "INVOICE",
  "RECEIPT",
  "TAX_INVOICE",
  "DEPOSIT_RECEIPT",
  "CREDIT_NOTE",
  "DEBIT_NOTE",
  "BILLING_NOTE",
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

// ─────────────────── R-C: เลขประจำตัวผู้เสียภาษี 13 หลัก (mod-11) ───────────────────
// ฟังก์ชันกลาง — ใช้ทั้ง createContact (backoffice) + public form
export function normalizeTaxId(taxId: string | null | undefined): string {
  return (taxId ?? "").replace(/\D/g, "");
}

/** ตรวจ checksum เลขผู้เสียภาษีไทย 13 หลัก (mod-11 หลักที่ 13 = check digit) */
export function isValidThaiTaxId(taxId: string | null | undefined): boolean {
  const id = normalizeTaxId(taxId);
  if (!/^\d{13}$/.test(id)) return false;
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += parseInt(id[i], 10) * (13 - i);
  const check = (11 - (sum % 11)) % 10;
  return check === parseInt(id[12], 10);
}

export function isOverdue(d: {
  status: AccountDocStatus | string;
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

// กระจายยอด (เช่น ส่วนลดท้ายบิล) ตามสัดส่วนน้ำหนักแต่ละบรรทัด — largest remainder ให้ผลรวมตรงเป๊ะ
// (ledger-M11: ส่วนลดท้ายบิลข้ามหลายอัตรา VAT → allocate ตามสัดส่วนฐานแต่ละบรรทัด/อัตรา)
export function allocateProportional(total: number, weights: number[]): number[] {
  const sumW = weights.reduce((a, b) => a + b, 0);
  if (total <= 0 || sumW <= 0) return weights.map(() => 0);
  const raw = weights.map((w) => (total * w) / sumW);
  const out = raw.map((r) => Math.floor(r));
  let rem = total - out.reduce((a, b) => a + b, 0);
  const order = raw
    .map((r, i) => ({ i, frac: r - Math.floor(r) }))
    .sort((a, b) => b.frac - a.frac);
  for (let k = 0; rem > 0 && order.length > 0; k++, rem--) out[order[k % order.length].i] += 1;
  return out;
}

// อัตรา VAT ต่อบรรทัด: -1 = ยกเว้น, 0 = 0% → คิดเป็น 0 · ไม่จด VAT / vatMode NONE → 0 ทุกบรรทัด
function lineRate(
  l: LineInput,
  vatMode: AccountVatMode,
  vatRegistered: boolean,
  fallbackBp: number,
): number {
  if (vatMode === "NONE" || !vatRegistered) return 0;
  const bp = l.vatRateBp ?? fallbackBp;
  return bp > 0 ? bp / 10000 : 0;
}

// คำนวณยอดทั้งเอกสาร — ใช้ vatRateBp จริงต่อบรรทัด (pipeline-M5) + กระจายส่วนลดท้ายบิลตามสัดส่วนฐาน (ledger-M11)
// contract กับ gl.postDocument: afterDiscount = subTotal − discountAmount = ฐานรายได้สุทธิ (สมดุลทั้ง EXCLUDE/INCLUDE)
export function computeTotals(input: {
  lines: LineInput[];
  discountAmount?: number;
  depositDeducted?: number;
  vatMode: AccountVatMode;
  vatRegistered: boolean;
  vatRateBp: number;
}): { subTotal: number; vatAmount: number; grandTotal: number } {
  const bases = input.lines.map(lineAmount); // ฐานบรรทัด (ตามที่ป้อน: EXCLUDE=ก่อน VAT, INCLUDE=รวม VAT)
  const baseSum = bases.reduce((a, b) => a + b, 0);
  const docDiscount = Math.min(Math.max(0, input.discountAmount || 0), baseSum);
  const discAlloc = allocateProportional(docDiscount, bases);

  let vatAmount = 0;
  let incomeNet = 0; // ฐานรายได้สุทธิ (หลังหักส่วนลดท้ายบิล ก่อน VAT) ทุกบรรทัดรวมกัน
  let grandBeforeDeposit = 0;
  input.lines.forEach((l, i) => {
    const afterBase = Math.max(0, bases[i] - discAlloc[i]);
    const rate = lineRate(l, input.vatMode, input.vatRegistered, input.vatRateBp);
    if (rate > 0) {
      if (input.vatMode === "INCLUDE") {
        const net = Math.round(afterBase / (1 + rate));
        vatAmount += afterBase - net;
        incomeNet += net;
        grandBeforeDeposit += afterBase; // ราคารวม VAT แล้ว
      } else {
        const vat = Math.round(afterBase * rate);
        vatAmount += vat;
        incomeNet += afterBase;
        grandBeforeDeposit += afterBase + vat;
      }
    } else {
      incomeNet += afterBase;
      grandBeforeDeposit += afterBase;
    }
  });

  // subTotal นิยามให้ (subTotal − discountAmount) = incomeNet เพื่อให้ gl สมดุลทั้งสองโหมด
  const subTotal = incomeNet + docDiscount;
  const grandTotal = Math.max(0, grandBeforeDeposit - (input.depositDeducted || 0));
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
  // §3.8 ตราประทับ/ลายเซ็น (URL-paste — ยังไม่มี upload service)
  stampUrl: string | null;
  signatureUrl: string | null;
  vatRegistered: boolean;
  vatRateBp: number;
  // QC5-A1: จุดรับรู้ภาษีขายเริ่มต้นของกิจการ (สินค้า=ON_ISSUE / บริการ=ON_PAYMENT)
  taxPointBasis: AccountVatTiming;
  defaultDueDays: number;
  defaultValidDays: number;
  footerNote: string | null;
  // §3.8 per-docType: prefix, ออกใบกำกับอัตโนมัติ, เปิดลิงก์สาธารณะขอใบกำกับ
  docTypes: Record<string, DocTypeConfig>;
};

export type DocTypeConfig = {
  prefix?: string;
  autoTaxInvoice?: boolean; // ออกใบกำกับภาษีอัตโนมัติเมื่อออกใบเสร็จ
  publicLink?: boolean; // เปิดลิงก์/QR ให้ลูกค้าขอใบกำกับ
};

// docType ฝั่งรายรับที่ตั้งค่า per-doc ได้ (§3.8)
export const CONFIGURABLE_DOC_TYPES: readonly AccountDocType[] = [
  "QUOTATION",
  "INVOICE",
  "RECEIPT",
  "TAX_INVOICE",
  "DEPOSIT_RECEIPT",
  "CREDIT_NOTE",
  "DEBIT_NOTE",
  "BILLING_NOTE",
];

function readDocTypes(docConfig: unknown): Record<string, DocTypeConfig> {
  const raw = (docConfig as Record<string, unknown> | null)?.docTypes;
  if (!raw || typeof raw !== "object") return {};
  const out: Record<string, DocTypeConfig> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (v && typeof v === "object") {
      const c = v as Record<string, unknown>;
      out[k] = {
        prefix: typeof c.prefix === "string" ? c.prefix : undefined,
        autoTaxInvoice: c.autoTaxInvoice === true,
        publicLink: c.publicLink === true,
      };
    }
  }
  return out;
}

function readStr(docConfig: unknown, key: string): string | null {
  const v = (docConfig as Record<string, unknown> | null)?.[key];
  return typeof v === "string" && v.trim() ? v : null;
}

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
  stampUrl: null,
  signatureUrl: null,
  vatRegistered: true,
  vatRateBp: 700,
  taxPointBasis: "ON_ISSUE",
  defaultDueDays: 30,
  defaultValidDays: 30,
  footerNote: null,
  docTypes: {},
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
    stampUrl: readStr(s.docConfig, "stampUrl"),
    signatureUrl: readStr(s.docConfig, "signatureUrl"),
    vatRegistered: s.vatRegistered,
    vatRateBp: s.vatRateBp,
    taxPointBasis: readTaxPointBasis(s.docConfig),
    defaultDueDays: s.defaultDueDays,
    defaultValidDays: s.defaultValidDays,
    footerNote: s.footerNote,
    docTypes: readDocTypes(s.docConfig),
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
  const docConfig: Record<string, unknown> = { ...prevConfig, taxPointBasis };
  // §3.8 ตราประทับ/ลายเซ็น + per-docType (เก็บใน docConfig — คงคีย์เดิมถ้าไม่ได้ส่งมา)
  if (input.stampUrl !== undefined) docConfig.stampUrl = input.stampUrl || null;
  if (input.signatureUrl !== undefined) docConfig.signatureUrl = input.signatureUrl || null;
  if (input.docTypes !== undefined) {
    docConfig.docTypes = input.docTypes;
    // sync prefix → docConfig.sequences[docType].prefix (ตัวที่ nextDocNo ใช้จริง)
    const seqs = { ...((prevConfig.sequences as Record<string, SeqConfig>) ?? {}) };
    for (const [dt, c] of Object.entries(input.docTypes)) {
      if (c.prefix) seqs[dt] = { ...(seqs[dt] ?? {}), prefix: c.prefix };
    }
    docConfig.sequences = seqs;
  }
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
  // R-C: เลขผู้เสียภาษีถ้ากรอกต้องเป็นตัวเลข 13 หลัก (กัน T0 เลขสั้น/ผิดรูปแบบ)
  const taxId = normalizeTaxId(input.taxId);
  if (taxId && !/^\d{13}$/.test(taxId))
    throw new Error("เลขประจำตัวผู้เสียภาษีต้องเป็นตัวเลข 13 หลัก");
  return prisma.accountContact.create({
    data: {
      tenantId: input.tenantId,
      systemId: input.systemId,
      kind: input.kind,
      legalType: input.legalType ?? "COMPANY",
      name: input.name,
      taxId: taxId || null,
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

export type SeqReset = "YEAR" | "MONTH" | "NONE";
type SeqConfig = { prefix?: string; reset?: SeqReset; pattern?: string };

// วันที่ตามเวลาไทย (Asia/Bangkok) → ปี/เดือน (pipeline-M7: TZ ไทยเสมอ ไม่ใช่ TZ เครื่อง)
export function bkkYearMonth(date: Date): { year: string; month: string } {
  const s = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
  return { year: s.slice(0, 4), month: s.slice(5, 7) };
}

// อ่านตั้งค่าเลขรันต่อ docType จาก docConfig.sequences[docType] (prefix/reset/pattern)
function readSeqConfig(docConfig: unknown, docType: AccountDocType): SeqConfig {
  const seqs = (docConfig as Record<string, unknown> | null)?.sequences as
    | Record<string, SeqConfig>
    | undefined;
  return seqs?.[docType] ?? {};
}

async function nextDocNo(
  tx: Prisma.TransactionClient,
  tenantId: string,
  systemId: string,
  docType: AccountDocType,
  date: Date,
): Promise<string> {
  const settings = await tx.accountSettings.findFirst({
    where: { systemId },
    select: { docConfig: true },
  });
  const cfg = readSeqConfig(settings?.docConfig, docType);
  const { year, month } = bkkYearMonth(date);
  const prefix = cfg.prefix || DOC_PREFIX[docType] || docType;
  const reset: SeqReset = cfg.reset ?? "MONTH";
  // periodKey = ตัวคุมการรีเซ็ตเลขในตาราง sequence
  const periodKey = reset === "NONE" ? "-" : reset === "YEAR" ? year : `${year}-${month}`;
  const seq = await tx.accountDocSequence.upsert({
    where: { systemId_docType_periodKey: { systemId, docType, periodKey } },
    create: { tenantId, systemId, docType, prefix, periodKey, lastNo: 1 },
    update: { lastNo: { increment: 1 } },
  });
  const num = String(seq.lastNo).padStart(4, "0");
  if (cfg.pattern) {
    return cfg.pattern
      .replace(/\{PREFIX\}/g, prefix)
      .replace(/\{YYYY\}/g, year)
      .replace(/\{YY\}/g, year.slice(2))
      .replace(/\{MM\}/g, month)
      .replace(/\{SEQ\}/g, num);
  }
  // default pattern ต่อ reset: YEAR = PFX-YYYY-0001 · MONTH = PFX-YYYY-MM-0001 · NONE = PFX-0001
  if (reset === "NONE") return `${prefix}-${num}`;
  if (reset === "YEAR") return `${prefix}-${year}-${num}`;
  return `${prefix}-${year}-${month}-${num}`;
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

// ยอดมัดจำคงเหลือให้หัก (gross) = grandTotal − Σ DEPOSIT_APPLY ที่ผูกกับใบแจ้งหนี้ที่ยังไม่ถูกยกเลิก
async function depositAvailable(
  tx: Prisma.TransactionClient,
  systemId: string,
  depositId: string,
  excludeInvoiceId?: string,
): Promise<number> {
  const dep = await tx.accountDocument.findFirst({
    where: { id: depositId, systemId },
    select: { grandTotal: true },
  });
  if (!dep) return 0;
  const applies = await tx.accountDocumentRelation.findMany({
    where: { systemId, fromId: depositId, type: "DEPOSIT_APPLY" },
    include: { to: { select: { id: true, status: true } } },
  });
  let used = 0;
  for (const r of applies) {
    if (excludeInvoiceId && r.toId === excludeInvoiceId) continue;
    if (r.to.status === "VOIDED" || r.to.status === "CANCELLED") continue;
    used += r.amount ?? 0;
  }
  return Math.max(0, dep.grandTotal - used);
}

// ยอดที่ยังลดหนี้ได้ของเอกสารเดิม (CN cap) = grandTotal ต้นทาง − Σ ใบลดหนี้ที่ออกแล้วอ้างต้นทางนี้
async function creditAvailable(
  tx: Prisma.TransactionClient,
  systemId: string,
  sourceDocId: string,
  excludeId?: string,
): Promise<number> {
  const src = await tx.accountDocument.findFirst({
    where: { id: sourceDocId, systemId },
    select: { grandTotal: true, paidTotal: true },
  });
  if (!src) return 0;
  const priorCns = await tx.accountDocument.findMany({
    where: {
      systemId,
      docType: "CREDIT_NOTE",
      sourceDocId,
      status: { notIn: ["DRAFT", "VOIDED", "CANCELLED"] },
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    select: { grandTotal: true },
  });
  const used = priorCns.reduce((s, c) => s + c.grandTotal, 0);
  // F-04: CN cap = ยอดคงเหลือค้างชำระจริง (grandTotal − ที่ชำระแล้ว − CN เดิม)
  return Math.max(0, src.grandTotal - src.paidTotal - used);
}

// ใบมัดจำที่ยังหักได้ของผู้ติดต่อ (สำหรับ picker หักมัดจำในใบแจ้งหนี้)
export async function listDeductibleDeposits(
  tenantId: string,
  systemId: string,
  contactId: string,
): Promise<{ id: string; docNo: string | null; available: number }[]> {
  const deposits = await prisma.accountDocument.findMany({
    where: { tenantId, systemId, docType: "DEPOSIT_RECEIPT", status: "AWAITING_DEDUCT", contactId },
    select: { id: true, docNo: true, grandTotal: true },
    orderBy: { issueDate: "asc" },
  });
  const out: { id: string; docNo: string | null; available: number }[] = [];
  for (const d of deposits) {
    const applies = await prisma.accountDocumentRelation.findMany({
      where: { systemId, fromId: d.id, type: "DEPOSIT_APPLY" },
      include: { to: { select: { status: true } } },
    });
    let used = 0;
    for (const r of applies)
      if (r.to.status !== "VOIDED" && r.to.status !== "CANCELLED") used += r.amount ?? 0;
    const available = Math.max(0, d.grandTotal - used);
    if (available > 0) out.push({ id: d.id, docNo: d.docNo, available });
  }
  return out;
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
  depositReceiptId?: string | null; // F2: ใบมัดจำที่จะหักในใบแจ้งหนี้นี้
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

  return prisma.$transaction(async (tx) => {
    // F2: หักมัดจำ — เฉพาะใบแจ้งหนี้ + ใบมัดจำต้องเป็นของลูกค้าเดียวกันและยังหักได้
    let depositDeducted = 0;
    let depositReceiptId: string | null = null;
    if (input.docType === "INVOICE" && input.depositReceiptId) {
      const dep = await tx.accountDocument.findFirst({
        where: { id: input.depositReceiptId, systemId: input.systemId, docType: "DEPOSIT_RECEIPT" },
        select: { id: true, status: true, contactId: true },
      });
      if (dep && dep.status === "AWAITING_DEDUCT" && dep.contactId === (input.contactId ?? null)) {
        const avail = await depositAvailable(tx, input.systemId, dep.id);
        depositDeducted = avail;
        depositReceiptId = dep.id;
      }
    }

    const totals = computeTotals({
      lines: input.lines,
      discountAmount: input.discountAmount,
      depositDeducted,
      vatMode,
      vatRegistered: settings.vatRegistered,
      vatRateBp: settings.vatRateBp,
    });

    const doc = await tx.accountDocument.create({
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
        depositDeducted,
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
    if (depositReceiptId && depositDeducted > 0) {
      await tx.accountDocumentRelation.create({
        data: {
          tenantId: input.tenantId,
          systemId: input.systemId,
          fromId: depositReceiptId,
          toId: doc.id,
          type: "DEPOSIT_APPLY",
          amount: depositDeducted,
        },
      });
    }
    return doc;
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
    depositReceiptId?: string | null; // F2: เปลี่ยน/ล้างการหักมัดจำ (undefined = ไม่แตะ)
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
      const contactId = input.contactId === undefined ? doc.contactId : input.contactId;

      // F2: จัดการการหักมัดจำใหม่ (เฉพาะใบแจ้งหนี้) — ลบ relation เดิม แล้วผูกใบใหม่ที่ยังหักได้
      let depositDeducted = doc.depositDeducted;
      if (doc.docType === "INVOICE" && input.depositReceiptId !== undefined) {
        await tx.accountDocumentRelation.deleteMany({
          where: { systemId, toId: id, type: "DEPOSIT_APPLY" },
        });
        depositDeducted = 0;
        if (input.depositReceiptId) {
          const dep = await tx.accountDocument.findFirst({
            where: { id: input.depositReceiptId, systemId, docType: "DEPOSIT_RECEIPT" },
            select: { id: true, status: true, contactId: true },
          });
          if (dep && dep.status === "AWAITING_DEDUCT" && dep.contactId === contactId) {
            depositDeducted = await depositAvailable(tx, systemId, dep.id, id);
            if (depositDeducted > 0) {
              await tx.accountDocumentRelation.create({
                data: { tenantId, systemId, fromId: dep.id, toId: id, type: "DEPOSIT_APPLY", amount: depositDeducted },
              });
            }
          }
        }
      }

      await tx.accountDocument.update({
        where: { id },
        data: {
          contactId,
          issueDate: input.issueDate ?? doc.issueDate,
          dueDate: input.dueDate === undefined ? doc.dueDate : input.dueDate,
          validUntil: input.validUntil === undefined ? doc.validUntil : input.validUntil,
          vatMode,
          vatTiming,
          taxPointBasis: vatTiming,
          discountAmount,
          depositDeducted,
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
        depositDeducted,
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
      // M2 (ม.86/4(2)): ออกใบกำกับภาษีต้องมีเลขผู้เสียภาษีผู้ขายใน settings
      if (doc.docType === "TAX_INVOICE" && !normalizeTaxId(settings.taxId))
        throw new Error("กรุณากรอกเลขประจำตัวผู้เสียภาษีของกิจการในการตั้งค่าก่อนออกใบกำกับภาษี (ม.86/4)");

      // ── CN/DN (F4, tax-M3): บังคับอ้างเอกสารเดิม + เหตุผลสรรพากร + CN cap ≤ คงเหลือของเอกสารเดิม ──
      if (doc.docType === "CREDIT_NOTE" || doc.docType === "DEBIT_NOTE") {
        if (!doc.sourceDocId) throw new Error("ต้องอ้างอิงเอกสารเดิม (ใบแจ้งหนี้/ใบเสร็จ/ใบกำกับภาษี)");
        if (!doc.adjustReason || doc.adjustReason.trim().length === 0)
          throw new Error("ต้องระบุเหตุผลการออก (ตามประกาศสรรพากร)");
        if (doc.docType === "CREDIT_NOTE") {
          const cap = await creditAvailable(tx, systemId, doc.sourceDocId, id);
          if (doc.grandTotal > cap + 1)
            throw new Error(`ยอดใบลดหนี้เกินยอดคงเหลือของเอกสารเดิม (คงเหลือ ฿${baht(cap)})`);
        }
      }

      // ── pipeline-M2: กันออกใบกำกับภาษีซ้ำจากต้นทางเดิม ──
      if (doc.docType === "TAX_INVOICE" && doc.sourceDocId) {
        const dup = await tx.accountDocument.count({
          where: {
            systemId,
            docType: "TAX_INVOICE",
            sourceDocId: doc.sourceDocId,
            status: { notIn: ["DRAFT", "VOIDED", "CANCELLED"] },
            id: { not: id },
          },
        });
        if (dup > 0) throw new Error("เอกสารต้นทางนี้ออกใบกำกับภาษีไปแล้ว — ออกซ้ำไม่ได้");
      }

      // ── F2: ล็อกการหักมัดจำตอนออกใบแจ้งหนี้ (ตรวจว่ายังหักได้ + อัปเดตสถานะใบมัดจำ) ──
      if (doc.docType === "INVOICE") {
        const applies = await tx.accountDocumentRelation.findMany({
          where: { systemId, toId: id, type: "DEPOSIT_APPLY" },
        });
        for (const ap of applies) {
          const dep = await tx.accountDocument.findFirst({
            where: { id: ap.fromId, systemId, docType: "DEPOSIT_RECEIPT" },
            select: { id: true, status: true, grandTotal: true },
          });
          if (!dep || dep.status !== "AWAITING_DEDUCT")
            throw new Error("ใบมัดจำที่เลือกหักไม่พร้อมใช้ (ต้องอยู่สถานะรอหักมัดจำ)");
          const avail = await depositAvailable(tx, systemId, dep.id, id);
          if ((ap.amount ?? 0) > avail + 1)
            throw new Error("ยอดหักมัดจำเกินยอดคงเหลือของใบมัดจำ");
          // หักครบ (Σ apply ≥ ยอดมัดจำ) → ใบมัดจำเป็น DEDUCTED
          const usedAll = dep.grandTotal - (await depositAvailable(tx, systemId, dep.id));
          if (usedAll >= dep.grandTotal)
            await tx.accountDocument.update({ where: { id: dep.id }, data: { status: "DEDUCTED" } });
        }
      }

      docNo = await nextDocNo(tx, tenantId, systemId, doc.docType, doc.issueDate);
      const snapshot = doc.contact
        ? {
            name: doc.contact.name,
            taxId: doc.contact.taxId,
            legalType: doc.contact.legalType, // M4: freeze ประเภทผู้เสียภาษี (ภงด 3/53 ไม่ขยับย้อนหลัง)
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
        // ตั้งลูกหนี้/รายได้/VAT (accrual) — ON_PAYMENT พัก VAT ที่ 2210 (logic ใน gl) · หักมัดจำ Dr 2110
        await postDocument(ctx, id, tx);
      } else if (doc.docType === "CREDIT_NOTE" || doc.docType === "DEBIT_NOTE") {
        // F4: CN = Dr รายได้+Dr 2200 / Cr 1100|เงิน · DN กลับด้าน (logic ใน gl)
        await postDocument(ctx, id, tx);
      } else if (doc.docType === "TAX_INVOICE") {
        // A2: ใบกำกับเป็นตัวกำหนดเดือน VAT → ย้าย 2205/2210 → 2200
        await postTaxInvoice(ctx, id, tx);
      }
      // DEPOSIT_RECEIPT/BILLING_NOTE ไม่โพสต์ตอน issue (มัดจำโพสต์ตอนรับเงิน · วางบิลโพสต์ตอนกระจายชำระ)
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

    // F-02: ใบกำกับภาษีของใบแจ้งหนี้ที่หักมัดจำ → รับรู้ VAT เฉพาะส่วนคงเหลือ
    //       (VAT ส่วนมัดจำรับรู้ตอนออกใบกำกับมัดจำแล้ว) — subTotal/vatAmount = เต็มงาน − ส่วนมัดจำ
    let tiSubTotal = source.subTotal;
    let tiVatAmount = source.vatAmount;
    const tiGrandTotal = source.grandTotal; // net หักมัดจำอยู่แล้ว
    if (toDocType === "TAX_INVOICE" && source.depositDeducted > 0) {
      const rate =
        settings.vatRegistered && source.vatMode !== "NONE" ? settings.vatRateBp / 10000 : 0;
      const depBase =
        rate > 0 ? Math.round(source.depositDeducted / (1 + rate)) : source.depositDeducted;
      const depVat = source.depositDeducted - depBase;
      tiSubTotal = source.subTotal - depBase;
      tiVatAmount = source.vatAmount - depVat;
    }

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
          subTotal: tiSubTotal,
          vatAmount: tiVatAmount,
          grandTotal: tiGrandTotal,
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
      // F-05: หนี้จริง = grandTotal − ที่ชำระแล้ว − ใบลดหนี้ที่ออกแล้ว (กันรับเงินเกินจน GL ลูกหนี้ติดลบ)
      const cnAgg = await tx.accountDocument.aggregate({
        where: {
          systemId,
          docType: "CREDIT_NOTE",
          sourceDocId: id,
          status: { notIn: ["DRAFT", "VOIDED", "CANCELLED"] },
        },
        _sum: { grandTotal: true },
      });
      const cnTotal = cnAgg._sum.grandTotal ?? 0;
      const remain = Math.max(0, doc.grandTotal - doc.paidTotal - cnTotal);
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
      const fullyPaid = newPaid >= doc.grandTotal;
      const ctx = { tenantId, systemId };
      await ensureAccounting(ctx, tx);

      if (doc.docType === "DEPOSIT_RECEIPT") {
        // F2: รับเงินมัดจำ → รับครบ = AWAITING_DEDUCT (รอหักในใบแจ้งหนี้) · โพสต์ Dr เงิน/Cr 2110/Cr 2200
        status = fullyPaid ? "AWAITING_DEDUCT" : "PARTIAL";
        await tx.accountDocument.update({ where: { id }, data: { paidTotal: newPaid, status } });
        // มัดจำโพสต์เต็มก้อนเมื่อรับครบ (เงินสด Dr = grandTotal) — postDocument อ่าน finance account จาก payment
        if (fullyPaid) await postDocument(ctx, id, tx);
      } else {
        status = fullyPaid ? "PAID" : "PARTIAL";
        await tx.accountDocument.update({ where: { id }, data: { paidTotal: newPaid, status } });
        // ── A5: โพสต์บัญชีการชำระ (Dr เงิน/WHT/fee, Cr ลูกหนี้ + โอน VAT ถ้า ON_PAYMENT) ──
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

      // ── R-A/C1: cascade → ใบกำกับภาษี (บริการ ON_PAYMENT) ที่ออกต่อ payment งวดนี้ ──
      //    ไม่งั้น VAT ที่ย้าย 2210→2200 ตอนออกใบกำกับค้างอยู่ → ภพ.30 เกินจริง
      const linkedTis = await tx.accountDocument.findMany({
        where: {
          systemId,
          docType: "TAX_INVOICE",
          sourcePaymentId: paymentId,
          status: { notIn: ["VOIDED", "CANCELLED"] },
        },
        select: { id: true, status: true },
      });
      for (const ti of linkedTis) {
        await tx.accountDocument.update({
          where: { id: ti.id },
          data: { status: "VOIDED", voidedAt: new Date(), voidReason: `ยกเลิกตามการยกเลิกรับชำระ: ${reason}` },
        });
        if (ti.status !== "DRAFT")
          await reverseFor({ tenantId, systemId }, "AccountDocument", ti.id, reason, tx);
      }
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
    select: { id: true, grandTotal: true, paidTotal: true, dueDate: true, status: true, validUntil: true },
  });
  // F-06: หักใบลดหนี้ที่ออกแล้วของแต่ละใบ → ยอดค้างรับหน้าจอตรงกับ GL 1100
  const cnBySource = new Map<string, number>();
  if (openInvoices.length > 0) {
    const cns = await prisma.accountDocument.groupBy({
      by: ["sourceDocId"],
      where: {
        tenantId,
        systemId,
        docType: "CREDIT_NOTE",
        sourceDocId: { in: openInvoices.map((d) => d.id) },
        status: { notIn: ["DRAFT", "VOIDED", "CANCELLED"] },
      },
      _sum: { grandTotal: true },
    });
    for (const c of cns) if (c.sourceDocId) cnBySource.set(c.sourceDocId, c._sum.grandTotal ?? 0);
  }
  let receivable = 0;
  let overdueCount = 0;
  let overdueAmount = 0;
  for (const d of openInvoices) {
    const remain = Math.max(0, d.grandTotal - d.paidTotal - (cnBySource.get(d.id) ?? 0));
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

// ─────────────────── §5.6 ลิงก์สาธารณะขอใบกำกับภาษี ───────────────────

// เอกสารต้นทางที่ลูกค้าขอใบกำกับภาษีได้ (มี VAT รับรู้แล้ว → ออกใบกำกับ GL-neutral)
const PUBLIC_TAX_SOURCE: readonly AccountDocType[] = ["RECEIPT", "INVOICE", "DEPOSIT_RECEIPT"];

/** สร้าง/คืน publicToken ของเอกสาร (สำหรับทำ QR/ลิงก์บนใบเสร็จ) — idempotent */
export async function ensurePublicTaxInvoiceLink(
  tenantId: string,
  systemId: string,
  docId: string,
): Promise<{ ok: true; token: string } | { ok: false; reason: string }> {
  const doc = await prisma.accountDocument.findFirst({
    where: { id: docId, tenantId, systemId },
    select: { id: true, docType: true, status: true, publicToken: true },
  });
  if (!doc) return { ok: false, reason: "ไม่พบเอกสาร" };
  if (!PUBLIC_TAX_SOURCE.includes(doc.docType))
    return { ok: false, reason: "เอกสารชนิดนี้ขอใบกำกับผ่านลิงก์ไม่ได้" };
  if (doc.status === "DRAFT" || doc.status === "CANCELLED" || doc.status === "VOIDED")
    return { ok: false, reason: "ต้องออกเอกสารก่อนจึงสร้างลิงก์ได้" };
  if (doc.publicToken) return { ok: true, token: doc.publicToken };
  const token = randomBytes(18).toString("base64url");
  await prisma.accountDocument.update({ where: { id: docId }, data: { publicToken: token } });
  return { ok: true, token };
}

/** อ่านเอกสารสาธารณะจาก publicToken (ไม่ต้องล็อกอิน — token คือ capability) */
export async function getPublicTaxContext(token: string): Promise<{
  systemId: string;
  tenantId: string;
  orgName: string;
  docType: AccountDocType;
  docNo: string | null;
  issueDate: Date;
  grandTotal: number;
  vatRegistered: boolean;
  existingTaxInvoiceNo: string | null;
  pendingRequest: boolean; // R-D: มีคำขอ DRAFT รอ staff อนุมัติ
} | null> {
  const doc = await prisma.accountDocument.findFirst({
    where: { publicToken: token },
    select: {
      id: true, tenantId: true, systemId: true, docType: true, docNo: true,
      issueDate: true, grandTotal: true, status: true,
    },
  });
  if (!doc) return null;
  if (!PUBLIC_TAX_SOURCE.includes(doc.docType)) return null;
  const settings = await getSettings(doc.tenantId, doc.systemId);
  // ใบกำกับที่ออกไปแล้วจากต้นทางนี้ (idempotent display)
  const existing = await prisma.accountDocument.findFirst({
    where: {
      systemId: doc.systemId, docType: "TAX_INVOICE", sourceDocId: doc.id,
      status: { notIn: ["DRAFT", "VOIDED", "CANCELLED"] },
    },
    select: { docNo: true },
    orderBy: { createdAt: "desc" },
  });
  // คำขอ DRAFT ที่ยังรออนุมัติ (public บันทึกแล้ว staff ยังไม่ออกเลข)
  const pending = existing ? null : await prisma.accountDocument.findFirst({
    where: { systemId: doc.systemId, docType: "TAX_INVOICE", sourceDocId: doc.id, sourcePaymentId: null, status: "DRAFT" },
    select: { id: true },
  });
  return {
    systemId: doc.systemId,
    tenantId: doc.tenantId,
    orgName: settings.orgName,
    docType: doc.docType,
    docNo: doc.docNo,
    issueDate: doc.issueDate,
    grandTotal: doc.grandTotal,
    vatRegistered: settings.vatRegistered,
    existingTaxInvoiceNo: existing?.docNo ?? null,
    pendingRequest: !!pending,
  };
}

/**
 * ลูกค้าขอใบกำกับภาษีผ่านลิงก์สาธารณะ (R-D/C7) → บันทึกเป็น **คำขอ DRAFT** (ไม่ jump ISSUED/จองเลข/post GL)
 * staff อนุมัติ (issueDocument) ก่อนจึงจองเลข+โพสต์ · idempotent (คำขอเดิม/ใบที่ออกแล้ว → คืนสถานะเดิม)
 * กัน double-issue: partial unique (systemId, sourceDocId) WHERE docType='TAX_INVOICE' AND sourcePaymentId IS NULL
 *                    → catch P2002 คืนคำขอเดิม (M1)
 */
export async function issuePublicTaxInvoice(
  token: string,
  buyer: { name: string; taxId: string; branchCode?: string | null; address?: string | null; phone?: string | null; email?: string | null },
): Promise<{ ok: true; requested: boolean; docNo: string | null } | { ok: false; reason: string }> {
  const name = buyer.name.trim();
  const taxId = normalizeTaxId(buyer.taxId);
  if (!name) return { ok: false, reason: "กรุณากรอกชื่อผู้ซื้อ" };
  // M2: เลขผู้เสียภาษี 13 หลัก + ตรวจ checksum (กัน 1111111111111)
  if (!isValidThaiTaxId(taxId))
    return { ok: false, reason: "เลขประจำตัวผู้เสียภาษีไม่ถูกต้อง (ต้องเป็นตัวเลข 13 หลักและหลักตรวจสอบถูกต้อง)" };

  try {
    const source = await prisma.accountDocument.findFirst({
      where: { publicToken: token },
      include: { lines: { orderBy: { sortOrder: "asc" } } },
    });
    if (!source) return { ok: false, reason: "ลิงก์ไม่ถูกต้องหรือหมดอายุ" };
    if (!PUBLIC_TAX_SOURCE.includes(source.docType))
      return { ok: false, reason: "เอกสารนี้ขอใบกำกับไม่ได้" };
    const { tenantId, systemId } = source;
    const settings = await getSettings(tenantId, systemId);
    if (!settings.vatRegistered)
      return { ok: false, reason: "กิจการนี้ไม่ได้จดทะเบียนภาษีมูลค่าเพิ่ม" };

    // idempotent: มีคำขอ/ใบกำกับจากต้นทางนี้แล้ว (DRAFT รออนุมัติ หรือ ISSUED) → คืนสถานะเดิม
    const existing = await prisma.accountDocument.findFirst({
      where: {
        systemId, docType: "TAX_INVOICE", sourceDocId: source.id, sourcePaymentId: null,
        status: { notIn: ["VOIDED", "CANCELLED"] },
      },
      select: { docNo: true, status: true },
    });
    if (existing) return { ok: true, requested: false, docNo: existing.docNo };

    // ยอดใบกำกับ = ยอดต้นทาง หักส่วนมัดจำ (เหมือน convertDocument F-02)
    let tiSubTotal = source.subTotal;
    let tiVatAmount = source.vatAmount;
    const tiGrandTotal = source.grandTotal;
    if (source.depositDeducted > 0) {
      const rate = source.vatMode !== "NONE" ? settings.vatRateBp / 10000 : 0;
      const depBase = rate > 0 ? Math.round(source.depositDeducted / (1 + rate)) : source.depositDeducted;
      const depVat = source.depositDeducted - depBase;
      tiSubTotal = source.subTotal - depBase;
      tiVatAmount = source.vatAmount - depVat;
    }

    const snapshot = {
      name,
      taxId,
      legalType: "COMPANY", // ผู้ขอใบกำกับผ่านลิงก์ = นิติบุคคล/บุคคลที่มีเลข 13 หลัก (freeze M4)
      branchCode: buyer.branchCode?.trim() || "00000",
      branchName: null,
      address: buyer.address?.trim() || null,
      phone: buyer.phone?.trim() || null,
      email: buyer.email?.trim() || null,
    };

    // บันทึกเป็นคำขอ DRAFT — staff ตรวจแล้วกด "ออกใบกำกับ" (issueDocument) เพื่อจองเลข+โพสต์ GL
    await prisma.accountDocument.create({
      data: {
        tenantId, systemId, docType: "TAX_INVOICE", status: "DRAFT", direction: "OUT",
        issueDate: new Date(), contactId: source.contactId,
        vatMode: source.vatMode, vatTiming: source.vatTiming, taxPointBasis: source.taxPointBasis,
        subTotal: tiSubTotal, vatAmount: tiVatAmount, grandTotal: tiGrandTotal,
        discountAmount: source.discountAmount, note: source.note, sourceDocId: source.id,
        contactSnapshot: snapshot as Prisma.InputJsonValue,
        lines: {
          create: source.lines.map((l, i) => ({
            tenantId, systemId, sortOrder: i, description: l.description, qty: l.qty,
            unitName: l.unitName, unitPrice: l.unitPrice, discount: l.discount,
            vatRateBp: l.vatRateBp, amount: l.amount,
          })),
        },
      },
    });
    return { ok: true, requested: true, docNo: null };
  } catch (e) {
    // M1: race → partial unique (systemId, sourceDocId) ชน → คืนคำขอเดิม
    if (e instanceof Error && "code" in e && (e as { code?: string }).code === "P2002") {
      const src = await prisma.accountDocument.findFirst({ where: { publicToken: token }, select: { id: true, systemId: true } });
      const dup = src ? await prisma.accountDocument.findFirst({
        where: { systemId: src.systemId, docType: "TAX_INVOICE", sourceDocId: src.id, sourcePaymentId: null, status: { notIn: ["VOIDED", "CANCELLED"] } },
        select: { docNo: true },
      }) : null;
      return { ok: true, requested: false, docNo: dup?.docNo ?? null };
    }
    return { ok: false, reason: e instanceof Error ? e.message : "ขอใบกำกับไม่สำเร็จ" };
  }
}
