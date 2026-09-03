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
  AccountPriceMode,
  AccountDiscountMode,
  AccountWhtIncomeType,
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
// WO 1.4: เอกสารภาษีถูกหัก ณ ที่จ่าย ฝั่งขาย (WTI) — ออกอัตโนมัติตอนรับชำระที่ลูกค้าหักภาษี
import { issueWhtCreditCert } from "./wht";
// WO 1.1: แหล่งเดียวของแมป flyout tab → สถานะ (ร่วมกับ LIST_TABS ของหน้ารายการ V2)
import { NAV_FLYOUT_TABS } from "./list-tabs";

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
  // WO 1.7: ใบวางบิลรวม = เอกสารเรียกเก็บ ⇒ ออกแล้วต้อง "รอรับชำระ" (ไม่ใช่ ISSUED ลอย ๆ)
  // ตรงกับชุดแท็บ §3 ของ BN (รอรับชำระ · เกินเวลารับชำระ · รับชำระแล้ว) และทำให้ปุ่ม "รับชำระ" ใช้ได้จริง
  BILLING_NOTE: "AWAITING_PAYMENT",
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

/**
 * เบอร์โทรไทยให้อยู่รูปเดียวกัน (WO 0.2) — ใช้เป็นกุญแจจับคู่ผู้ติดต่อซ้ำ
 *   "08-1234-5678"      → "0812345678"
 *   "+66 81 234 5678"   → "0812345678"
 *   "02-090-4301"       → "020904301"
 *   "+66 (0)81 234 5678"→ "0812345678"
 * เบอร์ต่างประเทศที่ไม่ใช่ +66 → คืนเฉพาะตัวเลข (ไม่ดัดแปลง)
 * WO 0.3: มีคอลัมน์ `AccountContact.phoneNorm` แล้ว — ทุกจุดที่เขียน `phone` ต้องเขียนค่านี้ลงคอลัมน์ด้วย
 * (ใช้ `contactWriteFields()` ด้านล่าง อย่าประกอบ data เอง)
 */
export function normalizePhoneTh(phone: string | null | undefined): string {
  let d = (phone ?? "").replace(/\D/g, "");
  if (!d) return "";
  if (d.startsWith("0066")) d = d.slice(4); // 00 = รหัสโทรออก + 66 = รหัสประเทศไทย
  if (!d.startsWith("66")) return d; // เบอร์ในประเทศ (ขึ้นต้น 0) หรือประเทศอื่น → เลขล้วน
  d = d.slice(2);
  return d.startsWith("0") ? d : "0" + d; // +66 (0)81… และ +6681… ให้ผลเดียวกัน
}

/**
 * ฟิลด์คู่ `phone` + `phoneNorm` สำหรับทุกจุดที่เขียน AccountContact (WO 0.3)
 *
 * 🔴 ทำไมต้องมี: `phoneNorm` คือกุญแจจับผู้ติดต่อซ้ำ ถ้ามีจุดไหนเขียน `phone` โดยไม่เขียน `phoneNorm`
 *    แถวนั้นจะ "ล่องหน" จากการจับคู่ → ระบบสร้างผู้ติดต่อซ้ำเงียบ ๆ
 *    ⇒ createContact/updateContact ต้องเรียกตัวนี้เสมอ ห้ามประกอบ data เอง
 *
 * - ไม่ส่ง `phone` มาเลย (update ที่ไม่แตะเบอร์) → คืน {} (ไม่แตะทั้งสองคอลัมน์)
 * - ส่ง `phone` มา (รวม null/"") → เขียนทั้งคู่ให้ตรงกันเสมอ · เบอร์ว่าง → phoneNorm = null
 */
export function contactWriteFields(input: { phone?: string | null }): {
  phone?: string | null;
  phoneNorm?: string | null;
} {
  if (!("phone" in input)) return {};
  const phone = input.phone ?? null;
  const norm = normalizePhoneTh(phone);
  return { phone, phoneNorm: norm || null };
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

// (import ตัวที่ไฟล์นี้เรียกใช้เองด้วย — `export … from` ไม่สร้าง binding ในไฟล์)
import { computeTotals, lineAmount } from "./totals";
import type { LineInput } from "./totals";

// สูตรเงินทั้งหมดย้ายไป `totals.ts` (WO 1.3) — ไฟล์นั้น "บริสุทธิ์" (ไม่ import prisma)
// เพื่อให้ฟอร์ม V2 ฝั่ง client เรียกสูตรเดียวกับ server ได้ · ที่นี่ re-export ให้ผู้เรียกเดิมไม่ต้องแก้
export {
  lineAmount,
  allocateProportional,
  computeTotals,
  computeDocTotals,
  bahtText,
  vatModeOf,
  priceModeOf,
  lineDiscountSatang,
  ZERO_DISCOUNT,
} from "./totals";
export type {
  LineInput,
  LineBreakdown,
  Totals,
  PriceMode,
  AmountOrPercent,
  DocTotalsLine,
  DocTotalsInput,
  DocTotalsLineOut,
  DocTotals,
} from "./totals";

// ─────────────────── ตั้งค่า ───────────────────

export type AccountSettingsView = {
  // คำนำหน้าชื่อนิติบุคคล ("บริษัท" / "ห้างหุ้นส่วนจำกัด" / …) — เก็บแยกจากชื่อ
  // เพราะเอกสารภาษีต้องพิมพ์ชื่อเต็มตามที่จดทะเบียน แต่คนกรอกมักลืมพิมพ์คำนำหน้า
  orgPrefix: string | null;
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
  orgPrefix: null,
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

/** คำนำหน้าชื่อนิติบุคคลที่ให้เลือก — ค่าว่าง = ไม่มีคำนำหน้า (บุคคลธรรมดา/ร้านค้า) */
export const ORG_PREFIXES = [
  "",
  "บริษัท",
  "ห้างหุ้นส่วนจำกัด",
  "ห้างหุ้นส่วนสามัญนิติบุคคล",
  "ร้าน",
  "มูลนิธิ",
  "สมาคม",
  "สหกรณ์",
] as const;

/**
 * ชื่อกิจการที่ใช้พิมพ์บนเอกสาร = คำนำหน้า + ชื่อ
 * รวมที่เดียวเพราะเอกสารภาษีมีหลายหน้า (ใบกำกับ · 50 ทวิ · ใบเสร็จสาธารณะ) ถ้าต่างคนต่างต่อสตริง
 * จะมีสักหน้าที่ลืมคำนำหน้าแล้วชื่อบนเอกสารไม่ตรงกับที่จดทะเบียน
 */
export function orgDisplayName(s: { orgPrefix?: string | null; orgName?: string | null }): string {
  return [s.orgPrefix?.trim(), s.orgName?.trim()].filter(Boolean).join(" ");
}

/**
 * เว็บไซต์: คนกรอกมักพิมพ์ `shark.in.th` เฉย ๆ ซึ่งพอเอาไปทำลิงก์บนเอกสารจะกลายเป็น path ในเว็บเรา
 * → เติม https:// ให้เมื่อไม่มี scheme · ค่าว่าง = null (ไม่ใช่ "https://")
 */
export function normalizeWebsite(v: string | null | undefined): string | null {
  const raw = (v ?? "").trim();
  if (!raw) return null;
  if (/^https?:\/\//i.test(raw)) return raw;
  if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) return raw; // scheme อื่น (mailto: ฯลฯ) ปล่อยตามที่พิมพ์
  return `https://${raw}`;
}

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
    orgPrefix: readStr(s.docConfig, "orgPrefix"),
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
  if (input.orgPrefix !== undefined) docConfig.orgPrefix = input.orgPrefix || null;
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
    website: normalizeWebsite(input.website),
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

// ─────────────────── WO-0002: POS→Account link + VAT config (ใช้โดย facade index.ts) ───────────────────

/**
 * หาระบบบัญชีที่ผูกกับ POS ระบบนี้ (opt-in ตาม blueprint — ตาราง AccountSystemLink)
 * ไม่เจอ = null → หลัก standalone (POS ที่ไม่เชื่อม ห้าม post บัญชี)
 */
export async function findAccountLinkForPos(
  tenantId: string,
  posSystemId: string,
): Promise<{ systemId: string } | null> {
  return prisma.accountSystemLink.findFirst({
    where: { tenantId, linkedKind: "POS", linkedId: posSystemId, archivedAt: null },
    select: { systemId: true },
  });
}

// ─────────────────── ราคาขายสินค้า (master data — POS หน้า "สินค้า/ราคา") ───────────────────
// ราคาขายเก็บที่ AccountProduct.salePrice เท่านั้น — เป็น master data ไม่กระทบ GL/ledger
// (POS อ่านผ่าน register.posCatalog · หน้า "สินค้า/ราคา" เขียนผ่าน facade index → ที่นี่)

/** อัปเดตราคาขายของ AccountProduct ที่มีอยู่ (scope tenant กันข้ามร้าน) — คืน true ถ้าอัปเดตแถวได้ */
export async function updateAccountProductSalePrice(
  tenantId: string,
  productId: string,
  salePriceSatang: number,
): Promise<boolean> {
  const r = await prisma.accountProduct.updateMany({
    where: { id: productId, tenantId },
    data: { salePrice: Math.max(0, Math.round(salePriceSatang)) },
  });
  return r.count > 0;
}

/**
 * สร้าง AccountProduct ใหม่พร้อมราคาขาย (ผูกกับระบบบัญชี) — คืน id
 * ⚠️ ไม่คัดลอก SKU จากคลัง (กันชน unique [systemId, sku]) · ชื่อ = ชื่อสินค้าในคลัง
 */
export async function createAccountProductWithSalePrice(
  tenantId: string,
  accountSystemId: string,
  input: { name: string; salePriceSatang: number },
): Promise<string> {
  const p = await prisma.accountProduct.create({
    data: {
      tenantId,
      systemId: accountSystemId,
      name: input.name.trim() || "สินค้า",
      type: "GOODS",
      salePrice: Math.max(0, Math.round(input.salePriceSatang)),
    },
  });
  return p.id;
}

/** อ่าน config VAT ของระบบบัญชี (default: จด VAT 7% = 700 bp) */
export async function vatConfigOf(
  systemId: string,
): Promise<{ vatRegistered: boolean; vatRateBp: number }> {
  const s = await prisma.accountSettings.findFirst({
    where: { systemId },
    select: { vatRegistered: true, vatRateBp: true },
  });
  return { vatRegistered: s?.vatRegistered ?? true, vatRateBp: s?.vatRateBp ?? 700 };
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
      ...contactWriteFields({ phone: input.phone ?? null }), // WO 0.3: phone + phoneNorm คู่กันเสมอ
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
  // WO 0.3: ถ้า caller ส่ง phone มา ต้องอัปเดต phoneNorm ให้ตรงกันในคำสั่งเดียว
  //         (ไม่ส่ง phone = ไม่แตะทั้งคู่ — พฤติกรรม partial update เดิมคงอยู่)
  await prisma.accountContact.updateMany({
    where: { id, tenantId, systemId },
    data: { ...input, ...contactWriteFields(input) },
  });
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
  return formatDocNo(cfg, prefix, reset, year, month, seq.lastNo);
}

// จัดรูปเลขที่เอกสารจากลำดับที่ได้ — แยกออกมาเพื่อให้ "พรีวิวเลขถัดไป" ใช้สูตรเดียวกับตัวจริง
// (ถ้าปล่อยให้พรีวิวเขียนสูตรเอง วันหนึ่ง pattern เปลี่ยนแล้วเลขบนฟอร์มจะไม่ตรงกับเลขที่ออกจริง)
function formatDocNo(
  cfg: SeqConfig,
  prefix: string,
  reset: SeqReset,
  year: string,
  month: string,
  lastNo: number,
): string {
  const num = String(lastNo).padStart(4, "0");
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

/**
 * เลขที่ "ถัดไป" แบบดูอย่างเดียว ฝั่งรายรับ — สำหรับโชว์บนฟอร์มร่าง (DESIGN-SPEC-V2 §5.2 B)
 * (ฝั่งรายจ่ายมีสูตรเลขของตัวเอง → `previewNextExpenseDocNo` ใน expense.ts)
 * 🔴 ห้ามเขียนอะไรลง AccountDocSequence: ร่างต้องไม่กินเลข · เลขจริงจองตอน issueDocument เท่านั้น
 *    ⇒ ค่านี้เป็น "คาดว่าจะได้" ถ้ามีคนอื่นออกเอกสารก่อน เลขจริงจะขยับ (จงใจ)
 */
export async function previewNextDocNo(
  systemId: string,
  docType: AccountDocType,
  date: Date,
): Promise<string> {
  const settings = await prisma.accountSettings.findFirst({
    where: { systemId },
    select: { docConfig: true },
  });
  const cfg = readSeqConfig(settings?.docConfig, docType);
  const { year, month } = bkkYearMonth(date);
  const prefix = cfg.prefix || DOC_PREFIX[docType] || docType;
  const reset: SeqReset = cfg.reset ?? "MONTH";
  const periodKey = reset === "NONE" ? "-" : reset === "YEAR" ? year : `${year}-${month}`;
  const seq = await prisma.accountDocSequence.findUnique({
    where: { systemId_docType_periodKey: { systemId, docType, periodKey } },
    select: { lastNo: true },
  });
  return formatDocNo(cfg, prefix, reset, year, month, (seq?.lastNo ?? 0) + 1);
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

// ─── รายการเอกสารแบบกรอง/เรียง/แบ่งหน้า ฝั่ง server (WO 0.2 — เลิก take 500 แล้ว filter ใน UI) ───
// ⚠️ `listDocuments` ด้านบนคงไว้เหมือนเดิมทุกอย่าง (ยังมี caller/ด่านเก่าใช้อยู่) — ตัวใหม่คือฟังก์ชันแยก

/** ค่าที่ยอมรับใน `status`: สถานะจริง 1 ตัว · หลายตัว · "OVERDUE" (คำนวณใน SQL) · "ALL" (ไม่กรอง) */
export type DocStatusFilter = AccountDocStatus | AccountDocStatus[] | "OVERDUE" | "ALL";

export type ListDocumentsInput = {
  docType: AccountDocType;
  status?: DocStatusFilter;
  /** ค้นหา: เลขที่เอกสาร หรือ ชื่อผู้ติดต่อ (ไม่สนตัวพิมพ์) */
  q?: string;
  contactId?: string;
  /** ช่วงวันที่ออกเอกสาร (รับ Date หรือ "YYYY-MM-DD") */
  from?: Date | string;
  to?: Date | string;
  page?: number;
  /** ค่าเริ่มต้น 20 · สูงสุด 100 */
  pageSize?: number;
  sort?: DocSort;
  /** ตัดรายการที่พ้นกำหนดออก (แท็บ "รอชำระ/รอตอบรับ" ที่ไม่รวมพ้นกำหนด) */
  excludeOverdue?: boolean;
};

export type DocSort = "recent" | "issueDate" | "docNo" | "amount";

export type DocTabCounts = Partial<Record<AccountDocStatus, number>> & {
  ALL: number;
  OVERDUE: number;
};

// WO 1.1: include สุดท้ายของ listDocumentsPaged (ประกาศเป็น const เดียว กันชนิด rows กับ query จริงเพี้ยนกัน)
const LIST_DOCUMENTS_INCLUDE = {
  contact: { select: { id: true, name: true } },
  // ใช้แสดงคอลัมน์ "ช่องทางรับเงิน" ของหน้ารายการ RECEIPT (§5.1) — เอาแค่รายการล่าสุดที่ไม่ถูก void
  payments: {
    where: { voidedAt: null },
    orderBy: { paidAt: "desc" as const },
    take: 1,
    select: { channel: true },
  },
} satisfies Prisma.AccountDocumentInclude;

export type ListDocumentsPage = {
  rows: Prisma.AccountDocumentGetPayload<{ include: typeof LIST_DOCUMENTS_INCLUDE }>[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
  tabCounts: DocTabCounts;
};

/**
 * เงื่อนไข "พ้นกำหนด" ในรูป where ของ Prisma — ตรงกับ `isOverdue()` ทุกกรณี
 * (คิดใน SQL ไม่ใช่ JS หลัง take — ไม่งั้นนับผิดเมื่อข้อมูลเกินหน้าแรก)
 */
// WO 1.1: export ให้ expense.ts:listExpenseDocsPaged() ใช้เงื่อนไข "พ้นกำหนด" ชุดเดียวกันเป๊ะ (ไม่ก๊อปสูตรสอง)
export function overdueWhere(now: Date): Prisma.AccountDocumentWhereInput {
  return {
    OR: [
      { status: { in: ["AWAITING_PAYMENT", "PARTIAL"] }, dueDate: { lt: now } },
      { status: "AWAITING_ACCEPT", validUntil: { lt: now } },
    ],
  };
}

// WO 1.1 บั๊กที่เจอ+แก้: เดิม `Math.trunc(input.pageSize ?? 20) || 20` — เมื่อผู้เรียกส่ง pageSize=0 มาจริง ๆ
// (เช่นทดสอบขอบเขต) `0 || 20` จะตกกลับเป็นค่าเริ่มต้น 20 เงียบ ๆ แทนที่จะ clamp ขึ้นเป็น 1 ตามที่ตั้งใจ
// (0 เป็น falsy แต่ไม่ใช่ nullish — `??` ไม่จับ แต่ `||` จับ) ⇒ รวมเป็นฟังก์ชันเดียวใช้ร่วม 3 จุด (revenue/expense/goods)
export function clampPageSize(v: number | undefined, def = 20, max = 100): number {
  const n = Math.trunc(v ?? def);
  return Math.min(Math.max(Number.isFinite(n) ? n : def, 1), max);
}
export function clampPage(v: number | undefined): number {
  const n = Math.trunc(v ?? 1);
  return Math.max(Number.isFinite(n) ? n : 1, 1);
}

// WO 1.1: export ให้ expense.ts ใช้ parser วันที่ชุดเดียวกัน (ตัวกรองช่วงวันที่ของหน้ารายการฝั่งจ่าย)
export function parseDay(v: Date | string | undefined, endOfDay: boolean): Date | undefined {
  if (!v) return undefined;
  const d = v instanceof Date ? new Date(v) : new Date(`${v}T00:00:00+07:00`);
  if (Number.isNaN(d.getTime())) return undefined;
  if (endOfDay && typeof v === "string") d.setTime(d.getTime() + 24 * 60 * 60 * 1000 - 1);
  return d;
}

const DOC_SORT_ORDER: Record<DocSort, Prisma.AccountDocumentOrderByWithRelationInput[]> = {
  recent: [{ updatedAt: "desc" }, { id: "desc" }],
  issueDate: [{ issueDate: "desc" }, { id: "desc" }],
  docNo: [{ docNo: "desc" }, { id: "desc" }],
  amount: [{ grandTotal: "desc" }, { id: "desc" }],
};

export async function listDocumentsPaged(
  tenantId: string,
  systemId: string,
  input: ListDocumentsInput,
): Promise<ListDocumentsPage> {
  const now = new Date();
  const pageSize = clampPageSize(input.pageSize);
  const page = clampPage(input.page);
  const q = (input.q ?? "").trim();
  const from = parseDay(input.from, false);
  const to = parseDay(input.to, true);

  // base = ทุกตัวกรองยกเว้นสถานะ → ใช้ทั้งนับแท็บและนับ total ให้บวกกันลงตัว
  const base: Prisma.AccountDocumentWhereInput = {
    tenantId,
    systemId,
    docType: input.docType,
    ...(input.contactId ? { contactId: input.contactId } : {}),
    ...(from || to ? { issueDate: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
    ...(q
      ? {
          OR: [
            { docNo: { contains: q, mode: "insensitive" as const } },
            { contact: { is: { name: { contains: q, mode: "insensitive" as const } } } },
          ],
        }
      : {}),
  };

  const status = input.status ?? "ALL";
  const statusWhere: Prisma.AccountDocumentWhereInput =
    status === "ALL"
      ? {}
      : status === "OVERDUE"
        ? overdueWhere(now)
        : Array.isArray(status)
          ? { status: { in: status } }
          : { status };

  const where: Prisma.AccountDocumentWhereInput = {
    AND: [
      base,
      statusWhere,
      ...(input.excludeOverdue ? [{ NOT: overdueWhere(now) }] : []),
    ],
  };

  const [rows, total, grouped, overdueCount] = await Promise.all([
    prisma.accountDocument.findMany({
      where,
      include: LIST_DOCUMENTS_INCLUDE,
      orderBy: DOC_SORT_ORDER[input.sort ?? "recent"],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.accountDocument.count({ where }),
    prisma.accountDocument.groupBy({ by: ["status"], where: base, _count: { _all: true } }),
    prisma.accountDocument.count({ where: { AND: [base, overdueWhere(now)] } }),
  ]);

  const tabCounts: DocTabCounts = { ALL: 0, OVERDUE: overdueCount };
  for (const g of grouped) {
    tabCounts[g.status] = g._count._all;
    tabCounts.ALL += g._count._all;
  }

  return {
    rows,
    total,
    page,
    pageSize,
    pageCount: Math.max(Math.ceil(total / pageSize), 1),
    tabCounts,
  };
}

// ─── WO 1.1: ตัวนับต่อ "แท็บของหน้ารายการ V2" (LIST_TABS ของ list-tabs.ts) ───────────────────
// ต่างจาก tabCounts ใน ListDocumentsPage (คีย์ = AccountDocStatus ดิบ) — ฟังก์ชันนี้คืนตัวนับ
// "ต่อคีย์แท็บ" ตรง ๆ (เช่น "awaiting"→12, "partial"→2) พร้อมตัด/รวมพ้นกำหนดตาม excludeOverdue ของ
// แต่ละแท็บให้เอง — ใช้ได้ทั้งฝั่งรายรับ (service.ts) และฝั่งรายจ่าย (expense.ts, docType ต่างกันแต่โมเดลเดียวกัน)
// 3 query รวม (groupBy ดิบ + groupBy พ้นกำหนด + count พ้นกำหนดรวม) ไม่ใช่ 1 query ต่อแท็บ (กันงบ query บวม)
export async function computeListTabCounts(
  tenantId: string,
  systemId: string,
  docType: AccountDocType,
  tabs: { key: string; filter: { status: DocStatusFilter; excludeOverdue?: boolean } }[],
  extra?: { q?: string; contactId?: string; from?: Date | string; to?: Date | string },
): Promise<Record<string, number>> {
  const now = new Date();
  const from = parseDay(extra?.from, false);
  const to = parseDay(extra?.to, true);
  const q = (extra?.q ?? "").trim();
  const base: Prisma.AccountDocumentWhereInput = {
    tenantId,
    systemId,
    docType,
    ...(extra?.contactId ? { contactId: extra.contactId } : {}),
    ...(from || to ? { issueDate: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
    ...(q
      ? {
          OR: [
            { docNo: { contains: q, mode: "insensitive" as const } },
            { contact: { is: { name: { contains: q, mode: "insensitive" as const } } } },
          ],
        }
      : {}),
  };
  const [rawGroup, overdueGroup, overdueTotal] = await Promise.all([
    prisma.accountDocument.groupBy({ by: ["status"], where: base, _count: { _all: true } }),
    prisma.accountDocument.groupBy({ by: ["status"], where: { AND: [base, overdueWhere(now)] }, _count: { _all: true } }),
    prisma.accountDocument.count({ where: { AND: [base, overdueWhere(now)] } }),
  ]);
  const raw = new Map(rawGroup.map((g) => [g.status, g._count._all]));
  const overdueByStatus = new Map(overdueGroup.map((g) => [g.status, g._count._all]));
  const all = rawGroup.reduce((s, g) => s + g._count._all, 0);

  const out: Record<string, number> = {};
  for (const t of tabs) {
    const f = t.filter;
    if (f.status === "ALL") {
      out[t.key] = all;
      continue;
    }
    if (f.status === "OVERDUE") {
      out[t.key] = overdueTotal;
      continue;
    }
    const statuses = Array.isArray(f.status) ? f.status : [f.status];
    out[t.key] = statuses.reduce(
      (n, s) => n + (raw.get(s) ?? 0) - (f.excludeOverdue ? (overdueByStatus.get(s) ?? 0) : 0),
      0,
    );
  }
  return out;
}

// ─── WO 1.1 (มือถือ f13): ยอดค้าง (รับ/จ่าย) ของ "AWAITING_PAYMENT" ∪ "PARTIAL" ภายใต้ตัวกรองปัจจุบัน ───
// (รวมพ้นกำหนดด้วย — ต่างจากแท็บ "รอชำระ"/"ชำระบางส่วน" ของหน้ารายการที่ตัดพ้นกำหนดออกไปเข้าแท็บของตัวเอง)
// นิยามเดียวกับ `overviewStats().receivable` (ทั้งชุด AWAITING_PAYMENT+PARTIAL) แต่ผูกกับตัวกรอง (วันที่/ผู้ติดต่อ/ค้นหา)
// ของหน้ารายการแทนที่จะเป็นยอดรวมทั้งระบบ — ใช้แสดงบรรทัดสรุปใต้ h1 บนมือถือ "N ใบ · ค้างรับ/ค้างจ่าย ฿…"
export async function sumOutstandingForFilter(
  tenantId: string,
  systemId: string,
  docType: AccountDocType,
  extra?: { q?: string; contactId?: string; from?: Date | string; to?: Date | string },
): Promise<number> {
  const from = parseDay(extra?.from, false);
  const to = parseDay(extra?.to, true);
  const q = (extra?.q ?? "").trim();
  const where: Prisma.AccountDocumentWhereInput = {
    tenantId,
    systemId,
    docType,
    status: { in: ["AWAITING_PAYMENT", "PARTIAL"] },
    ...(extra?.contactId ? { contactId: extra.contactId } : {}),
    ...(from || to ? { issueDate: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
    ...(q
      ? {
          OR: [
            { docNo: { contains: q, mode: "insensitive" as const } },
            { contact: { is: { name: { contains: q, mode: "insensitive" as const } } } },
          ],
        }
      : {}),
  };
  const agg = await prisma.accountDocument.aggregate({ where, _sum: { grandTotal: true, paidTotal: true } });
  return Math.max((agg._sum.grandTotal ?? 0) - (agg._sum.paidTotal ?? 0), 0);
}

// แมป tab key ของ flyout เมนูบัญชี V2 → สถานะจริง (หรือ "overdue" = derived) ต่อ docType
// อ้างตาม DESIGN-SPEC-V2.md §3 คอลัมน์ "flyout" (3–4 รายการต่อชนิด ไม่ใช่ "แท็บ" เต็มชุดของหน้ารายการ)
// ⚠️ สถานะที่ไม่ใช่ "overdue" ทุกตัว = นับแบบ **ไม่รวมพ้นกำหนด** (excludeOverdue เหมือน tabsFor() ของหน้ารายการจริง)
//    เช่น IV "รอชำระ" = AWAITING_PAYMENT ล้วน ๆ ที่ยังไม่เลยกำหนด (ไม่รวม PARTIAL — PARTIAL มีแท็บของตัวเองในหน้ารายการ
//    แต่ SPEC ไม่ได้เอาขึ้น flyout) — เคยรวม PARTIAL มาด้วยและไม่ตัดพ้นกำหนดออกมาก่อน ทำให้ตัวเลขเพี้ยน (12+2+4=18
//    ทั้งที่ควรได้ 12 ตรงกับ tabCounts ของหน้ารายการจริง) แก้แล้วใน accountFlyoutCounts() ด้านล่าง
// WO 1.1: ย้ายไปประกาศที่ src/lib/modules/account/list-tabs.ts (แหล่งเดียวร่วมกับ LIST_TABS ของหน้ารายการ V2 —
// กันตัวนับ flyout กับแท็บของหน้ารายการเพี้ยนออกจากกัน) — import กลับมาใช้ตรงนี้เฉย ๆ

/**
 * ตัวนับสำหรับ flyout เมนูบัญชี V2 (AccountTabBar ระดับ 2) — g18 mockup โชว์ตัวเลขข้างสถานะ
 * (รอชำระ 12 · ชำระแล้ว 29 · พ้นกำหนด 4 · ดูทั้งหมด 51) — คีย์ผลลัพธ์ = `${docType}:${tabKey}` และ `${docType}:all`
 * ตั้งใจให้เป็น **2 query รวมทุก docType** (ไม่ใช่ต่อชนิดเอกสาร) กันงบ query ของหน้าที่แถบเมนูติดอยู่ทุกหน้าบวม
 * (ใช้ groupBy + overdueWhere เดียวกับ `listDocumentsPaged`/`tabsFor()` — ทั้งสอง query group by (docType,status)
 * เหมือนกัน เพื่อหักจำนวน "พ้นกำหนด" ออกจากสถานะดิบได้ต่อสถานะจริง ไม่ใช่แค่ต่อ docType — ถ้าหักแค่ต่อ docType
 * จะไม่รู้ว่าพ้นกำหนดกี่ใบเป็น AWAITING_PAYMENT กี่ใบเป็น PARTIAL แล้วหักผิดสถานะ)
 */
export async function accountFlyoutCounts(
  tenantId: string,
  systemId: string,
): Promise<Record<string, number>> {
  const now = new Date();
  const [byStatus, overdueByStatus] = await Promise.all([
    prisma.accountDocument.groupBy({
      by: ["docType", "status"],
      where: { tenantId, systemId },
      _count: { _all: true },
    }),
    prisma.accountDocument.groupBy({
      by: ["docType", "status"],
      where: { tenantId, systemId, ...overdueWhere(now) },
      _count: { _all: true },
    }),
  ]);

  const rawCount = new Map<string, number>(); // key = `${docType}:${status}`
  const totalByType = new Map<string, number>();
  for (const g of byStatus) {
    rawCount.set(`${g.docType}:${g.status}`, g._count._all);
    totalByType.set(g.docType, (totalByType.get(g.docType) ?? 0) + g._count._all);
  }
  const overdueCount = new Map<string, number>(); // key = `${docType}:${status}`
  const overdueByType = new Map<string, number>();
  for (const g of overdueByStatus) {
    overdueCount.set(`${g.docType}:${g.status}`, g._count._all);
    overdueByType.set(g.docType, (overdueByType.get(g.docType) ?? 0) + g._count._all);
  }
  // นับสถานะ "ไม่รวมพ้นกำหนด" — เท่ากับ filter { status: sel, excludeOverdue: true } ของ listDocumentsPaged เป๊ะ
  const nonOverdueSum = (docType: string, statuses: AccountDocStatus[]) =>
    statuses.reduce((s, st) => {
      const key = `${docType}:${st}`;
      return s + ((rawCount.get(key) ?? 0) - (overdueCount.get(key) ?? 0));
    }, 0);

  const out: Record<string, number> = {};
  for (const [docType, tabs] of Object.entries(NAV_FLYOUT_TABS)) {
    out[`${docType}:all`] = totalByType.get(docType) ?? 0;
    for (const [tabKey, sel] of Object.entries(tabs)) {
      out[`${docType}:${tabKey}`] =
        sel === "overdue" ? overdueByType.get(docType) ?? 0 : nonOverdueSum(docType, sel);
    }
  }
  return out;
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
// WO 1.6: export ให้ DocEditorPage เรียกอ่านอย่างเดียว (ส่ง `prisma` แทน `tx` ได้ — โครงสร้างเข้ากันได้)
// สำหรับแสดง "cap-line" ก่อนอนุมัติ — ค่าจริงยังถูกตรวจซ้ำใน issueDocument ตอนอนุมัติเสมอ
export async function creditAvailable(
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

/** WO 1.6 — เวอร์ชันไม่ต้องมี tx (นอก transaction) ให้ DocEditorPage เรียกแสดง "cap-line" ได้โดยไม่ต้อง import prisma เอง (F5) */
export function creditAvailableNow(systemId: string, sourceDocId: string, excludeId?: string): Promise<number> {
  return creditAvailable(prisma, systemId, sourceDocId, excludeId);
}

// ใบมัดจำที่ยังหักได้ของผู้ติดต่อ (สำหรับ picker หักมัดจำในใบแจ้งหนี้)
export async function listDeductibleDeposits(
  tenantId: string,
  systemId: string,
  contactId: string,
  /** WO 1.4: เอกสารที่กำลังแก้อยู่ — ยอดที่ "ใบนี้" หักไว้ไม่นับเป็นยอดที่ถูกใช้ไปแล้ว
   *  (ไม่งั้นเปิดร่างเดิมมาแก้ ยอดคงเหลือจะโชว์ 0 ทั้งที่หักใบนี้เอง) */
  excludeDocId?: string,
): Promise<{ id: string; docNo: string | null; issueDate: Date; available: number; appliedHere: number }[]> {
  const deposits = await prisma.accountDocument.findMany({
    where: { tenantId, systemId, docType: "DEPOSIT_RECEIPT", status: "AWAITING_DEDUCT", contactId },
    select: { id: true, docNo: true, issueDate: true, grandTotal: true },
    orderBy: { issueDate: "asc" },
  });
  const out: { id: string; docNo: string | null; issueDate: Date; available: number; appliedHere: number }[] = [];
  for (const d of deposits) {
    const applies = await prisma.accountDocumentRelation.findMany({
      where: { systemId, fromId: d.id, type: "DEPOSIT_APPLY" },
      include: { to: { select: { id: true, status: true } } },
    });
    let used = 0;
    let appliedHere = 0;
    for (const r of applies) {
      if (r.to.status === "VOIDED" || r.to.status === "CANCELLED") continue;
      if (excludeDocId && r.toId === excludeDocId) {
        appliedHere += r.amount ?? 0;
        continue;
      }
      used += r.amount ?? 0;
    }
    const available = Math.max(0, d.grandTotal - used);
    if (available > 0) out.push({ id: d.id, docNo: d.docNo, issueDate: d.issueDate, available, appliedHere });
  }
  return out;
}

/** ชนิดเอกสารฝั่งขายที่หักเงินมัดจำได้ (§5.2 D) */
const DEPOSIT_DEDUCTIBLE_SALES: readonly AccountDocType[] = ["INVOICE", "RECEIPT"];

export type DepositPick = { depositId: string; amountSatang: number };

/**
 * WO 1.4 §5.2 D — ตั้ง "หักเงินมัดจำ" ของร่างเอกสารขายใหม่ทั้งชุด (แทนของเดิมทั้งหมด)
 * ต่างจากของเดิม (`depositReceiptId` = 1 ใบเต็มยอด): เลือกได้หลายใบ · หักบางส่วนได้ (≤ ยอดคงเหลือ)
 *
 * 🔴 ทุกใบต้องเป็นของ **ผู้ติดต่อเดียวกัน** และอยู่สถานะ `AWAITING_DEDUCT` เท่านั้น
 * 🔴 ยอดหักรวมต้องไม่เกิน "ยอดก่อนหักมัดจำ" ของเอกสาร (ไม่งั้น grandTotal ติดลบ)
 */
export async function setDocDeposits(
  tenantId: string,
  systemId: string,
  docId: string,
  picks: DepositPick[],
): Promise<{ ok: true; depositDeducted: number; grandTotal: number } | { ok: false; reason: string }> {
  const settings = await getSettings(tenantId, systemId);
  try {
    const res = await prisma.$transaction(async (tx) => {
      const doc = await tx.accountDocument.findFirst({
        where: { id: docId, tenantId, systemId },
        include: { lines: true },
      });
      if (!doc) throw new Error("ไม่พบเอกสาร");
      if (doc.status !== "DRAFT") throw new Error("เอกสารที่ออกแล้วแก้การหักมัดจำไม่ได้");
      if (!DEPOSIT_DEDUCTIBLE_SALES.includes(doc.docType))
        throw new Error("เอกสารชนิดนี้หักเงินมัดจำไม่ได้");

      await tx.accountDocumentRelation.deleteMany({ where: { systemId, toId: docId, type: "DEPOSIT_APPLY" } });

      // ยอดก่อนหักมัดจำ = คำนวณใหม่จากบรรทัดจริง (ไม่เชื่อ grandTotal ที่อาจหักมัดจำเดิมอยู่)
      const gross = computeTotals({
        lines: doc.lines.map((l) => ({
          description: l.description,
          qty: Number(l.qty),
          unitPrice: l.unitPrice,
          discount: l.discount,
          vatRateBp: l.vatRateBp,
        })),
        discountAmount: doc.discountAmount,
        depositDeducted: 0,
        vatMode: doc.vatMode,
        vatRegistered: settings.vatRegistered,
        vatRateBp: settings.vatRateBp,
      }).grandTotal;

      let total = 0;
      const seen = new Set<string>();
      for (const p of picks) {
        const amount = Math.round(p.amountSatang);
        if (amount <= 0) continue;
        if (seen.has(p.depositId)) throw new Error("เลือกใบมัดจำใบเดียวกันซ้ำ");
        seen.add(p.depositId);
        const dep = await tx.accountDocument.findFirst({
          where: { id: p.depositId, tenantId, systemId, docType: "DEPOSIT_RECEIPT" },
          select: { id: true, docNo: true, status: true, contactId: true },
        });
        if (!dep) throw new Error("ไม่พบใบรับเงินมัดจำที่เลือก");
        if (dep.status !== "AWAITING_DEDUCT") throw new Error("ใบมัดจำที่เลือกไม่พร้อมใช้ (ต้องอยู่สถานะรอหักมัดจำ)");
        if (dep.contactId !== doc.contactId) throw new Error("ใบมัดจำไม่ใช่ของผู้ติดต่อรายเดียวกัน");
        const avail = await depositAvailable(tx, systemId, dep.id, docId);
        if (amount > avail) throw new Error(`ยอดหักเกินยอดคงเหลือของใบมัดจำ ${dep.docNo ?? ""} (คงเหลือ ฿${baht(avail)})`);
        total += amount;
        await tx.accountDocumentRelation.create({
          data: { tenantId, systemId, fromId: dep.id, toId: docId, type: "DEPOSIT_APPLY", amount },
        });
      }
      if (total > gross) throw new Error("ยอดหักมัดจำรวมเกินยอดเอกสาร");

      await tx.accountDocument.update({ where: { id: docId }, data: { depositDeducted: total } });
      const totals = await recomputeAndSave(
        tx,
        docId,
        doc.vatMode,
        doc.discountAmount,
        total,
        settings.vatRegistered,
        settings.vatRateBp,
      );
      return { depositDeducted: total, grandTotal: totals.grandTotal };
    });
    return { ok: true, ...res };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : "บันทึกการหักมัดจำไม่สำเร็จ" };
  }
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
    // WO 1.6 §5.2 J — เอกสารอ้างอิงจาก wizard ขั้น ① (CN/DN) — สร้าง relation ADJUST ไว้ตั้งแต่ตอนร่าง
    // (ต่างจาก `convertDocument` เดิมที่สร้าง doc+relation พร้อมกันในทีเดียว — เส้นทางนี้แยกเป็น 2 จังหวะ
    // เพราะ wizard ให้แก้บรรทัดก่อนอนุมัติได้ · ชนิดที่ RELATION_FOR ไม่ใช่ "ADJUST" จะไม่สร้างอะไรเพิ่ม)
    if (input.sourceDocId && RELATION_FOR[input.docType] === "ADJUST") {
      await tx.accountDocumentRelation.create({
        data: {
          tenantId: input.tenantId,
          systemId: input.systemId,
          fromId: input.sourceDocId,
          toId: doc.id,
          type: "ADJUST",
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

      // ── CN/DN (F4, tax-M3, WO 1.6): เหตุผลสรรพากรบังคับเสมอ · อ้างอิงเอกสารเดิมเป็นทางเลือก (§5.2 J
      //    "ไม่อ้างอิงเอกสารเดิม") · CN cap ≤ คงเหลือของเอกสารเดิม **เฉพาะเมื่อมีการอ้างอิง** (ไม่อ้างอิง = ไม่มีเพดาน)
      if (doc.docType === "CREDIT_NOTE" || doc.docType === "DEBIT_NOTE") {
        if (!doc.adjustReason || doc.adjustReason.trim().length === 0)
          throw new Error("ต้องระบุเหตุผลการออก (ตามประกาศสรรพากร)");
        if (doc.docType === "CREDIT_NOTE" && doc.sourceDocId) {
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

      // ── F2: ล็อกการหักมัดจำตอนออกเอกสาร (ตรวจว่ายังหักได้ + อัปเดตสถานะใบมัดจำ) ──
      //    WO 1.4: รวมใบเสร็จรับเงินด้วย (หักมัดจำในใบเสร็จขายสดได้ตาม §5.2 D)
      if (doc.docType === "INVOICE" || doc.docType === "RECEIPT") {
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

/**
 * WO 1.4 — "event" ของ JV ใบมัดจำ (โพสต์ที่ตัวเอกสาร ไม่ใช่ที่ payment)
 * รอบแรก = `ISSUE` · หลังยกเลิกการรับเงิน (กลับรายการไปแล้ว n ครั้ง) แล้วรับเงินใหม่ = `ISSUE:R<n>`
 * ถ้าไม่ทำแบบนี้ `alreadyPosted` จะเห็นคีย์เดิมแล้วข้ามการโพสต์เงียบ ๆ ⇒ รับเงินรอบ 2 ไม่ลงบัญชีเลย
 */
async function depositRepostEvent(tx: Prisma.TransactionClient, systemId: string, docId: string): Promise<string> {
  const n = await tx.accountJournalEntry.count({
    where: { systemId, refType: "AccountDocument", refId: docId, journal: "REVERSAL" },
  });
  return n === 0 ? "ISSUE" : `ISSUE:R${n}`;
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
    /** WO 1.4: ประเภทเงินได้ ม.40 — มีค่า + wht > 0 ⇒ ออกเอกสารภาษีถูกหัก (WTI) อัตโนมัติ */
    whtIncomeType?: AccountWhtIncomeType | null;
    feeAmount?: number; // ค่าธรรมเนียมโอน/gateway
    note?: string | null;
    createdById?: string | null;
    /** WO 1.4: กันบันทึกซ้ำจากการกดปุ่ม/รีทรายซ้ำ — คีย์เดิม = ไม่สร้าง payment/JV ใหม่ */
    idempotencyKey?: string | null;
  },
): Promise<{ ok: true; status: AccountDocStatus; paymentId?: string; whtCertNo?: string } | { ok: false; reason: string }> {
  if (!input.amount || input.amount <= 0) return { ok: false, reason: "ยอดชำระต้องมากกว่า 0" };
  const wht = Math.max(0, input.whtAmountSatang ?? 0);
  // ── idempotency: คีย์เดิม = คืนผลเดิม ไม่แตะบัญชี ──
  if (input.idempotencyKey) {
    const dup = await prisma.accountDocumentPayment.findFirst({
      where: { idempotencyKey: input.idempotencyKey, tenantId, systemId },
      select: { id: true, documentId: true, document: { select: { status: true } } },
    });
    if (dup) {
      if (dup.documentId !== id) return { ok: false, reason: "คีย์กันซ้ำนี้ถูกใช้กับเอกสารอื่นแล้ว" };
      return { ok: true, status: dup.document.status, paymentId: dup.id };
    }
  }
  try {
    const settings = await getSettings(tenantId, systemId);
    let status: AccountDocStatus = "PARTIAL";
    let paymentId = "";
    let whtCertNo: string | undefined;
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
          idempotencyKey: input.idempotencyKey ?? null,
        },
      });
      paymentId = payment.id;
      const newPaid = doc.paidTotal + tieOff;
      const fullyPaid = newPaid >= doc.grandTotal;
      const ctx = { tenantId, systemId };
      await ensureAccounting(ctx, tx);

      if (doc.docType === "DEPOSIT_RECEIPT") {
        // F2: รับเงินมัดจำ → รับครบ = AWAITING_DEDUCT (รอหักในใบแจ้งหนี้) · โพสต์ Dr เงิน/Cr 2110/Cr 2200
        status = fullyPaid ? "AWAITING_DEDUCT" : "PARTIAL";
        await tx.accountDocument.update({ where: { id }, data: { paidTotal: newPaid, status } });
        // มัดจำโพสต์เต็มก้อนเมื่อรับครบ (เงินสด Dr = grandTotal) — postDocument อ่าน finance account จาก payment
        if (fullyPaid) await postDocument(ctx, id, tx, { event: await depositRepostEvent(tx, systemId, id) });
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

      // ── WO 1.4 §5.2 F: ลูกค้าหักภาษี ณ ที่จ่าย → ออกเอกสารภาษีถูกหัก (WTI) อัตโนมัติ ──
      //    ฐานเงินได้จริง = ส่วนของ subTotal ตามสัดส่วนที่ตัดหนี้งวดนี้ (ไม่ย้อนจาก wht/rate — ปัดเศษเพี้ยน)
      if (wht > 0 && input.whtIncomeType) {
        const base = doc.grandTotal > 0 ? Math.round((doc.subTotal * (input.amount + wht)) / doc.grandTotal) : input.amount + wht;
        const cert = await issueWhtCreditCert(tx, { tenantId, systemId }, {
          documentId: id,
          paymentId: payment.id,
          whtAmount: wht,
          whtRateBp: input.whtRateBp ?? null,
          incomeType: input.whtIncomeType,
          base,
          issueDate: payment.paidAt,
        });
        whtCertNo = cert.docNo;
      }
    });
    return { ok: true, status, paymentId, whtCertNo };
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
      // ── WO 1.4: ใบรับมัดจำที่ถูกหักไปในใบแจ้งหนี้/ใบเสร็จแล้ว ยกเลิกการรับเงินไม่ได้ ──
      //    (เงินมัดจำไปตัดหนี้ใบอื่นแล้ว — ต้องยกเลิกการหักที่ใบปลายทางก่อน)
      if (doc.docType === "DEPOSIT_RECEIPT") {
        const applied = await tx.accountDocumentRelation.findMany({
          where: { systemId, fromId: documentId, type: "DEPOSIT_APPLY" },
          include: { to: { select: { status: true } } },
        });
        if (applied.some((r) => r.to.status !== "VOIDED" && r.to.status !== "CANCELLED"))
          throw new Error("ใบมัดจำนี้ถูกหักในเอกสารอื่นแล้ว — ยกเลิกการหักที่เอกสารนั้นก่อน");
      }
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

      // ── WO 1.4 (ปิดรูรั่ว 1.2 §8.1): ใบรับมัดจำโพสต์ JV ที่ "ตัวเอกสาร" (Dr เงิน/Cr 2110/Cr 2200)
      //    ตอนรับเงินครบ ไม่ใช่ที่ payment ⇒ reversal ข้างบนไม่แตะ · ต้องกลับรายการเอกสารด้วย
      //    ไม่งั้นยกเลิกรับเงินแล้ว เงินสด + หนี้มัดจำยังค้างอยู่ในบัญชีตลอดไป
      if (doc.docType === "DEPOSIT_RECEIPT" && doc.status === "AWAITING_DEDUCT") {
        await reverseFor({ tenantId, systemId }, "AccountDocument", documentId, reason, tx);
      }

      // ── WO 1.4: เอกสารภาษีถูกหัก ณ ที่จ่าย (WTI) ที่ออกให้การชำระนี้ → ยกเลิกตาม ──
      //    ไม่งั้นเครดิตภาษี 1160 ถูกกลับรายการแล้ว แต่ใบ WTI ยัง ISSUED = ยื่นเครดิตที่ไม่มีจริง
      if (pay.whtCertDocId) {
        await tx.accountDocument.updateMany({
          where: { id: pay.whtCertDocId, systemId, docType: "WHT_CERT", status: { notIn: ["VOIDED", "CANCELLED"] } },
          data: { status: "VOIDED", voidedAt: new Date(), voidReason: `ยกเลิกตามการยกเลิกรับชำระ: ${reason}` },
        });
        await tx.accountDocumentPayment.update({ where: { id: paymentId }, data: { whtCertDocId: null } });
      }

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

/**
 * WO 1.4 §3 — "คืนมัดจำ" (DR ฝั่งรับ / DP ฝั่งจ่าย)
 *
 * คืนเงินมัดจำ = กลับรายการ JV ของใบมัดจำทั้งใบ (Dr 2110 + Dr 2200 / Cr เงิน สำหรับฝั่งรับ ·
 * กลับด้านสำหรับฝั่งจ่าย) + ปิดใบเป็น VOIDED — **ไม่ลบอะไรทั้งสิ้น** ตามกติกาเอกสารเงิน immutable
 * วันที่ของรายการกลับ = วันที่งวดเปิดถัดไป (reverseFor จัดการให้ — ห้ามลงงวดปิด)
 *
 * 🔴 ห้ามคืนถ้าใบมัดจำถูกหักไปในเอกสารอื่นแล้ว (ต้องแก้ที่ปลายทางก่อน)
 */
export async function refundDeposit(
  tenantId: string,
  systemId: string,
  id: string,
  reason: string,
): Promise<{ ok: true; refunded: number } | { ok: false; reason: string }> {
  try {
    const refunded = await prisma.$transaction(async (tx) => {
      const doc = await tx.accountDocument.findFirst({ where: { id, tenantId, systemId } });
      if (!doc) throw new Error("ไม่พบเอกสาร");
      if (doc.docType !== "DEPOSIT_RECEIPT" && doc.docType !== "DEPOSIT_PAYMENT")
        throw new Error("คืนมัดจำได้เฉพาะใบรับ/ใบจ่ายเงินมัดจำ");
      if (doc.status === "VOIDED" || doc.status === "CANCELLED") throw new Error("เอกสารถูกยกเลิกแล้ว");
      if (doc.status === "DRAFT") throw new Error("ใบมัดจำที่ยังเป็นร่าง ให้ใช้ยกเลิกร่าง");
      if (doc.paidTotal <= 0) throw new Error("ใบมัดจำนี้ยังไม่มีเงินให้คืน");
      const applied = await tx.accountDocumentRelation.findMany({
        where: { systemId, fromId: id, type: "DEPOSIT_APPLY" },
        include: { to: { select: { status: true } } },
      });
      if (applied.some((r) => r.to.status !== "VOIDED" && r.to.status !== "CANCELLED"))
        throw new Error("ใบมัดจำนี้ถูกหักในเอกสารอื่นแล้ว — ยกเลิกการหักที่เอกสารนั้นก่อน");

      const amount = doc.paidTotal;
      await tx.accountDocumentPayment.updateMany({
        where: { documentId: id, systemId, voidedAt: null },
        data: { voidedAt: new Date(), voidReason: `คืนมัดจำ: ${reason}` },
      });
      await tx.accountDocument.update({
        where: { id },
        data: { status: "VOIDED", voidedAt: new Date(), voidReason: `คืนมัดจำ: ${reason}`, paidTotal: 0 },
      });
      // JV ของใบมัดจำอยู่ที่ "ตัวเอกสาร" → กลับรายการทั้งใบ = จ่ายเงินคืน/รับเงินคืนพอดี
      await reverseFor({ tenantId, systemId }, "AccountDocument", id, `คืนมัดจำ: ${reason}`, tx);
      return amount;
    });
    return { ok: true, refunded };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : "คืนมัดจำไม่สำเร็จ" };
  }
}

// ─────────────────── WO 1.4: ตัวอ่าน/เขียน DB ให้ payment.ts ───────────────────
// payment.ts เป็นชั้น "ตัวประสาน" จึงห้ามแตะ prisma ตรง ๆ (fitness F5 — ratchet ห้ามเพิ่มไฟล์)
// ทุกตัวที่นี่ผูก { tenantId, systemId } เสมอ

export type PaymentTargetDoc = {
  id: string;
  docType: AccountDocType;
  docNo: string | null;
  direction: string;
  status: AccountDocStatus;
  grandTotal: number;
  subTotal: number;
  discountAmount: number;
  paidTotal: number;
  sourceDocId: string | null;
  contactId: string | null;
  contactName: string | null;
};

const PAYMENT_DOC_SELECT = {
  id: true,
  docType: true,
  docNo: true,
  direction: true,
  status: true,
  grandTotal: true,
  subTotal: true,
  discountAmount: true,
  paidTotal: true,
  sourceDocId: true,
  contactId: true,
  contact: { select: { name: true } },
  contactSnapshot: true,
} as const;

type PaymentDocRow = Prisma.AccountDocumentGetPayload<{ select: typeof PAYMENT_DOC_SELECT }>;

function toPaymentTarget(d: PaymentDocRow): PaymentTargetDoc {
  const snap = (d.contactSnapshot as Record<string, unknown> | null) ?? null;
  return {
    id: d.id,
    docType: d.docType,
    docNo: d.docNo,
    direction: d.direction,
    status: d.status,
    grandTotal: d.grandTotal,
    subTotal: d.subTotal,
    discountAmount: d.discountAmount,
    paidTotal: d.paidTotal,
    sourceDocId: d.sourceDocId,
    contactId: d.contactId,
    contactName: (snap?.name as string) ?? d.contact?.name ?? null,
  };
}

/**
 * เอกสารที่ "หนี้อยู่จริง" — ใบเสร็จรับเงินที่ออกจากใบแจ้งหนี้ไม่มีลูกหนี้ของตัวเอง
 * (ลูกหนี้ตั้งไว้ที่ IV แล้ว) ⇒ เงินที่รับต้องไปตัดที่ IV ไม่งั้น AR ค้างตลอดกาล
 */
export async function paymentTargetOf(
  tenantId: string,
  systemId: string,
  docId: string,
): Promise<{ doc: PaymentTargetDoc; target: PaymentTargetDoc } | null> {
  const doc = await prisma.accountDocument.findFirst({
    where: { id: docId, tenantId, systemId },
    select: PAYMENT_DOC_SELECT,
  });
  if (!doc) return null;
  if (doc.docType === "RECEIPT" && doc.sourceDocId) {
    const src = await prisma.accountDocument.findFirst({
      where: { id: doc.sourceDocId, tenantId, systemId, docType: "INVOICE" },
      select: PAYMENT_DOC_SELECT,
    });
    if (src) return { doc: toPaymentTarget(doc), target: toPaymentTarget(src) };
  }
  const t = toPaymentTarget(doc);
  return { doc: t, target: t };
}

export type DocPaymentRow = {
  id: string;
  paidAt: Date;
  channel: AccountPayChannel;
  financeName: string | null;
  amount: number;
  whtAmount: number;
  feeAmount: number;
  note: string | null;
  chequeNo: string | null;
  certNo: string | null;
  voidedAt: Date | null;
  /** WO 1.5 §5.3 — ชื่อผู้บันทึกการชำระ (resolve จาก membership+user ของร้านนี้ · ไม่เจอ = null) */
  createdByName: string | null;
};

/**
 * WO 1.4 — หา payment ที่เคยบันทึกด้วยคีย์กันซ้ำชุดนี้
 * ต้องเช็ค **ก่อน** ด่านสถานะ: ยิงชุดเดิมซ้ำหลังเอกสารเป็น "ชำระแล้ว" ต้องคืนผลเดิมเงียบ ๆ
 * ไม่ใช่เด้ง "เอกสารนี้รับชำระไม่ได้ในสถานะปัจจุบัน" (ผู้ใช้เน็ตหลุดแล้วกดซ้ำจะงงว่าเงินเข้าไหม)
 */
export async function findPaymentsByKeys(
  tenantId: string,
  systemId: string,
  keys: string[],
): Promise<{ id: string; documentId: string; idempotencyKey: string | null }[]> {
  if (keys.length === 0) return [];
  return prisma.accountDocumentPayment.findMany({
    where: { tenantId, systemId, idempotencyKey: { in: keys } },
    select: { id: true, documentId: true, idempotencyKey: true },
  });
}

/** ประวัติการรับ/จ่ายชำระของเอกสาร (รวมที่ยกเลิกแล้ว — แผง §5.2 F ต้องโชว์เป็นขีดฆ่า) */
export async function listDocPayments(
  tenantId: string,
  systemId: string,
  documentId: string,
): Promise<DocPaymentRow[]> {
  const rows = await prisma.accountDocumentPayment.findMany({
    where: { documentId, tenantId, systemId },
    orderBy: { paidAt: "asc" },
    select: {
      id: true, paidAt: true, channel: true, amount: true, whtAmountSatang: true, feeAmount: true,
      note: true, voidedAt: true, whtCertDocId: true, createdById: true,
      financeAccount: { select: { name: true } },
      cheque: { select: { chequeNo: true } },
    },
  });
  const certIds = rows.map((r) => r.whtCertDocId).filter((x): x is string => !!x);
  const certs = certIds.length
    ? await prisma.accountDocument.findMany({
        where: { id: { in: certIds }, tenantId, systemId },
        select: { id: true, docNo: true },
      })
    : [];
  const certNo = new Map(certs.map((c) => [c.id, c.docNo]));
  // ผู้บันทึก (§5.3 ตารางการชำระเงิน คอลัมน์ "ผู้บันทึก") — resolve ผ่าน membership ของร้านนี้เหมือน access.ts
  const creatorIds = [...new Set(rows.map((r) => r.createdById).filter((x): x is string => !!x))];
  const creatorName = new Map<string, string>();
  if (creatorIds.length) {
    const members = await prisma.membership.findMany({
      where: { tenantId, userId: { in: creatorIds } },
      include: { user: true },
    });
    for (const m of members) creatorName.set(m.userId, m.user.name ?? m.user.email);
  }
  return rows.map((p) => ({
    id: p.id,
    paidAt: p.paidAt,
    channel: p.channel,
    financeName: p.financeAccount?.name ?? null,
    amount: p.amount,
    whtAmount: p.whtAmountSatang,
    feeAmount: p.feeAmount,
    note: p.note,
    chequeNo: p.cheque?.chequeNo ?? null,
    certNo: p.whtCertDocId ? (certNo.get(p.whtCertDocId) ?? null) : null,
    voidedAt: p.voidedAt,
    createdByName: p.createdById ? (creatorName.get(p.createdById) ?? null) : null,
  }));
}

/**
 * WO 1.4 — ผูกรายการรับเงินกับ "ร่างใบเสร็จขายสด" ก่อนออกเอกสาร
 * (gl.postDocument case RECEIPT อ่านรายการเหล่านี้ไปเดบิตตามช่องทางจริง + Dr 1160 ให้ครบ)
 * 🔴 ยังไม่ลง JV ที่นี่ — JV เกิดตอน issueDocument ครั้งเดียว
 */
export async function attachDraftReceiptPayments(
  tenantId: string,
  systemId: string,
  documentId: string,
  rows: {
    paidAt: Date;
    channel: AccountPayChannel;
    financeAccountId: string | null;
    amount: number;
    whtAmountSatang: number;
    whtRateBp: number | null;
    feeAmount: number;
    note: string | null;
    createdById: string | null;
    idempotencyKey: string | null;
  }[],
): Promise<{ ok: true; paymentIds: string[] } | { ok: false; reason: string }> {
  try {
    const paymentIds = await prisma.$transaction(async (tx) => {
      const doc = await tx.accountDocument.findFirst({
        where: { id: documentId, tenantId, systemId, docType: "RECEIPT", status: "DRAFT" },
        select: { id: true },
      });
      if (!doc) throw new Error("ไม่พบร่างใบเสร็จรับเงิน");
      const ids: string[] = [];
      let tieOff = 0;
      for (const r of rows) {
        if (r.idempotencyKey) {
          const dup = await tx.accountDocumentPayment.findFirst({
            where: { idempotencyKey: r.idempotencyKey },
            select: { id: true },
          });
          if (dup) throw new Error("บันทึกชุดนี้ไปแล้ว");
        }
        const p = await tx.accountDocumentPayment.create({
          data: { tenantId, systemId, documentId, ...r },
          select: { id: true },
        });
        ids.push(p.id);
        tieOff += r.amount + r.whtAmountSatang;
      }
      await tx.accountDocument.update({ where: { id: documentId }, data: { paidTotal: tieOff } });
      return ids;
    });
    return { ok: true, paymentIds };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : "ผูกรายการรับเงินไม่สำเร็จ" };
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
    orgName: orgDisplayName(settings),
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

// ── helpers สำหรับ facade (index.ts ห้าม import prisma ตรง — F5) · WO-0010 ──
export async function findAccountLinkFor(tenantId: string, linkedKind: "POS" | "CRM", linkedId: string) {
  return prisma.accountSystemLink.findFirst({
    where: { tenantId, linkedKind, linkedId, archivedAt: null },
    select: { systemId: true },
  });
}
export async function findDocByRef(systemId: string, docType: AccountDocType, refType: string, refId: string) {
  return prisma.accountDocument.findFirst({ where: { systemId, docType, refType, refId }, select: { id: true } });
}

/** WO 1.5 — เอกสารอ้างอิงแบบย่อ (สำหรับแถบ "เอกสารที่เกี่ยวข้อง" ของหน้าเอกสาร V2) */
export async function getDocRef(
  tenantId: string,
  systemId: string,
  id: string,
): Promise<{ id: string; docType: AccountDocType; docNo: string | null; status: AccountDocStatus } | null> {
  return prisma.accountDocument.findFirst({
    where: { id, tenantId, systemId },
    select: { id: true, docType: true, docNo: true, status: true },
  });
}
/**
 * จับคู่ผู้ติดต่อด้วยเบอร์โทรแบบ normalize (WO 0.2 → คอลัมน์จริงใน WO 0.3)
 *
 * ทางหลัก: `where { systemId, phoneNorm, archivedAt: null }` — ยิงตรงเข้าดัชนี `[systemId, phoneNorm]`
 *   (ไม่มีการสแกน/ไม่มีเพดานจำนวนแถวอีกแล้ว — ของเดิมโหลดสูงสุด 5000 แถวมา normalize ใน JS)
 *
 * ทางสำรอง (ชั่วคราว): ถ้าระบบนี้ **ยังไม่ได้ backfill เลยสักแถว** (มีผู้ติดต่อที่มีเบอร์ แต่ phoneNorm
 *   ว่างทั้งระบบ) ให้ย้อนไปใช้วิธีเดิม เพื่อไม่ให้ระบบที่ deploy โค้ดใหม่ก่อนรัน backfill
 *   "จับคู่ไม่ได้ทั้งกระดาน" แล้วสร้างผู้ติดต่อซ้ำเป็นพรวด
 *   👉 หลังรัน `scripts/backfill-acc-v2-phone-norm.mts` บน prod แล้ว ทางนี้จะไม่ถูกใช้อีกเลย
 *   (เงื่อนไขคือ "ทั้งระบบว่าง" ไม่ใช่ "หาไม่เจอ" — ไม่งั้นทุกครั้งที่ไม่เจอจะไปสแกนตารางฟรี ๆ)
 */
async function findContactByPhoneNorm(
  systemId: string,
  phone: string,
): Promise<{ id: string } | null> {
  const norm = normalizePhoneTh(phone);
  if (norm.length < 8) return null; // สั้นเกินกว่าจะเป็นกุญแจตัวตน
  const hit = await prisma.accountContact.findFirst({
    where: { systemId, archivedAt: null, phoneNorm: norm },
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });
  if (hit) return hit;
  return findContactByPhoneLegacyScan(systemId, norm);
}

/**
 * ทางสำรองก่อน backfill เท่านั้น (ดู findContactByPhoneNorm) — คืน null ทันทีถ้าระบบนี้ backfill แล้ว
 * ⚠️ ห้ามเรียกจากที่อื่น
 */
async function findContactByPhoneLegacyScan(
  systemId: string,
  norm: string,
): Promise<{ id: string } | null> {
  const filled = await prisma.accountContact.count({
    where: { systemId, archivedAt: null, phoneNorm: { not: null } },
  });
  if (filled > 0) return null; // ระบบนี้ backfill แล้ว → ทางหลักคือคำตอบสุดท้าย
  const rows = await prisma.accountContact.findMany({
    where: { systemId, archivedAt: null, NOT: { phone: null } },
    select: { id: true, phone: true },
    orderBy: { createdAt: "asc" },
    take: 5000, // เพดานเดิมของ WO 0.2 — คงไว้เฉพาะทางสำรองนี้ (กันโหลดทั้งตารางถ้ายังไม่ backfill)
  });
  const found = rows.find((r) => normalizePhoneTh(r.phone) === norm);
  return found ? { id: found.id } : null;
}

/**
 * หา/สร้างผู้ติดต่อฝั่งบัญชีจากระบบอื่น (CRM/POS/แชท ผ่าน facade `index.ts`)
 * ลำดับจับคู่ (MAP §F.4) — **ห้ามจับด้วยชื่อเปล่า** และกรอง `archivedAt: null` เสมอ:
 *   1) เลขผู้เสียภาษี + รหัสสาขา (คู่นี้คือกุญแจตัวตนตามกฎหมาย)
 *   2) เบอร์โทร normalize (+66… = 0…)
 *   3) ชื่อ **และ** อีเมล ตรงกันทั้งคู่
 *   ไม่เข้าเงื่อนไขไหนเลย → สร้างใหม่ (ยอมมีซ้ำ ดีกว่าหยิบผู้ติดต่อของคนอื่นมาใช้เงียบ ๆ)
 */
export async function findOrCreateCustomerContact(
  ctx: { tenantId: string; systemId: string },
  c: {
    name: string;
    phone?: string | null;
    email?: string | null;
    taxId?: string | null;
    branchCode?: string | null;
  },
) {
  // (1) เลขผู้เสียภาษี + สาขา
  const taxId = normalizeTaxId(c.taxId);
  if (taxId) {
    const branchCode = c.branchCode || "00000";
    const byTax = await prisma.accountContact.findFirst({
      where: { systemId: ctx.systemId, archivedAt: null, taxId, branchCode },
      select: { id: true },
      orderBy: { createdAt: "asc" },
    });
    if (byTax) return byTax;
  }

  // (2) เบอร์โทร (normalize)
  if (c.phone) {
    const byPhone = await findContactByPhoneNorm(ctx.systemId, c.phone);
    if (byPhone) return byPhone;
  }

  // (3) ชื่อ + อีเมล ต้องตรงทั้งคู่ (ชื่ออย่างเดียวไม่พอ — ชื่อซ้ำกันได้)
  const email = (c.email ?? "").trim();
  if (email) {
    const byNameEmail = await prisma.accountContact.findFirst({
      where: { systemId: ctx.systemId, archivedAt: null, name: c.name, email },
      select: { id: true },
      orderBy: { createdAt: "asc" },
    });
    if (byNameEmail) return byNameEmail;
  }

  return createContact({
    tenantId: ctx.tenantId,
    systemId: ctx.systemId,
    kind: "CUSTOMER",
    name: c.name,
    phone: c.phone ?? null,
    email: c.email ?? null,
    taxId: taxId || null,
    branchCode: c.branchCode || undefined,
  } as Parameters<typeof createContact>[0]);
}
export async function setDocExternalRef(docId: string, ref: { refSystemId: string; refType: string; refId: string }) {
  await prisma.accountDocument.update({ where: { id: docId }, data: ref });
}


// ═══════════════════════════════════════════════════════════════
// ฟอร์มเอกสาร V2 (WO 1.3) — ชั้นข้อมูลของ DocEditorV2
//
// 🔴 ทำไมอยู่ในไฟล์นี้ ไม่ใช่ไฟล์ใหม่: กติกา fitness F5 ห้ามเพิ่ม "ไฟล์ในโมดูลที่ import prisma ตรง ๆ"
//    (ratchet ลดได้อย่างเดียว) และหลักการเดียวกันคือ **การแตะ DB ต้องอยู่ชั้น service**
//    ⇒ `editor-actions.ts` (server action) และ `DocEditorPage.tsx` (หน้า) เรียกฟังก์ชันพวกนี้เท่านั้น
// ═══════════════════════════════════════════════════════════════

/** ยอดค้างรับต่อผู้ติดต่อ (ป้าย "ค้างรับ ฿…" §5.2 B) — 1 query ครอบทุกราย ไม่ใช่ N+1 */
export async function outstandingByContacts(
  tenantId: string,
  systemId: string,
  contactIds?: string[],
): Promise<Map<string, number>> {
  const rows = await prisma.accountDocument.findMany({
    where: {
      tenantId,
      systemId,
      direction: "OUT",
      status: { in: ["AWAITING_PAYMENT", "PARTIAL"] },
      ...(contactIds?.length ? { contactId: { in: contactIds } } : {}),
    },
    select: { contactId: true, grandTotal: true, paidTotal: true },
  });
  const out = new Map<string, number>();
  for (const r of rows) {
    if (!r.contactId) continue;
    out.set(r.contactId, (out.get(r.contactId) ?? 0) + Math.max(0, r.grandTotal - r.paidTotal));
  }
  return out;
}

export type ContactPickerRow = {
  id: string;
  name: string;
  taxId: string | null;
  phone: string | null;
  creditTermDays: number;
  defaultPriceMode: AccountPriceMode | null;
  outstandingSatang: number;
};

/** ค้นผู้ติดต่อสำหรับ lookup ในฟอร์ม (ชื่อ/เลขภาษี/เบอร์/อีเมล) + ยอดค้างรับ */
export async function searchContactPickerRows(
  tenantId: string,
  systemId: string,
  q: string,
  take = 20,
): Promise<ContactPickerRow[]> {
  const term = q.trim();
  const rows = await prisma.accountContact.findMany({
    where: {
      tenantId,
      systemId,
      archivedAt: null,
      ...(term
        ? {
            OR: [
              { name: { contains: term, mode: "insensitive" as const } },
              { taxId: { contains: term } },
              { phone: { contains: term } },
              { email: { contains: term, mode: "insensitive" as const } },
            ],
          }
        : {}),
    },
    orderBy: { name: "asc" },
    take,
    select: { id: true, name: true, taxId: true, phone: true, creditTermDays: true, defaultPriceMode: true },
  });
  const outstanding = await outstandingByContacts(tenantId, systemId, rows.map((r) => r.id));
  return rows.map((r) => ({ ...r, outstandingSatang: outstanding.get(r.id) ?? 0 }));
}

/** สมาชิกร้าน (ตัวเลือก "พนักงานขาย" §5.2 B) */
export async function listTenantMembers(tenantId: string): Promise<{ id: string; name: string }[]> {
  const rows = await prisma.membership.findMany({
    where: { tenantId },
    select: { userId: true, user: { select: { name: true, email: true } } },
  });
  return rows.map((m) => ({ id: m.userId, name: m.user.name ?? m.user.email }));
}

/** แท็กที่เคยใช้ (ตัวเลือกใน multi-select แท็ก) — ดูจากเอกสารล่าสุด 200 ใบ */
export async function listUsedTags(tenantId: string, systemId: string): Promise<string[]> {
  const rows = await prisma.accountDocument.findMany({
    where: { tenantId, systemId, tags: { isEmpty: false } },
    select: { tags: true },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  return [...new Set(rows.flatMap((r) => r.tags))].sort((a, b) => a.localeCompare(b, "th"));
}

/**
 * เอกสารพี่น้องในสายการแปลง (ขึ้นทาง sourceDocId · ลงทาง sourceDocId ของคนอื่น) สำหรับ stepper §5.2 A
 * จำกัด 4 ชั้น = ความยาวสายที่ยาวที่สุด (QT→IV→RE→TX) ⇒ ไม่มีทางวนไม่จบ
 */
export async function docChainMap(
  tenantId: string,
  systemId: string,
  doc: { id: string; sourceDocId: string | null } | null,
): Promise<Map<string, { id: string; docNo: string | null }>> {
  const found = new Map<string, { id: string; docNo: string | null }>();
  if (!doc) return found;
  let cursor = doc.sourceDocId;
  for (let hop = 0; hop < 4 && cursor; hop++) {
    const parent = await prisma.accountDocument.findFirst({
      where: { id: cursor, tenantId, systemId },
      select: { id: true, docType: true, docNo: true, sourceDocId: true },
    });
    if (!parent) break;
    found.set(parent.docType, { id: parent.id, docNo: parent.docNo });
    cursor = parent.sourceDocId;
  }
  let ids = [doc.id];
  for (let hop = 0; hop < 4 && ids.length; hop++) {
    const kids = await prisma.accountDocument.findMany({
      where: { tenantId, systemId, sourceDocId: { in: ids }, status: { notIn: ["VOIDED", "CANCELLED"] } },
      select: { id: true, docType: true, docNo: true },
    });
    for (const k of kids) found.set(k.docType, { id: k.id, docNo: k.docNo });
    ids = kids.map((k) => k.id);
  }
  return found;
}

/** id ที่ฟอร์มอ้างถึงต้องอยู่ในระบบเดียวกันจริง (กัน IDOR ข้าม tenant/system) — โยนเมื่อไม่ผ่าน */
export async function assertEditorRefs(
  tenantId: string,
  systemId: string,
  refs: { contactId?: string | null; productIds?: string[]; accountIds?: string[]; salesUserId?: string | null },
): Promise<void> {
  if (refs.contactId) {
    const n = await prisma.accountContact.count({ where: { id: refs.contactId, tenantId, systemId } });
    if (n === 0) throw new Error("ไม่พบผู้ติดต่อรายนี้ในระบบบัญชีนี้");
  }
  const productIds = [...new Set(refs.productIds ?? [])];
  if (productIds.length) {
    const n = await prisma.accountProduct.count({ where: { id: { in: productIds }, tenantId, systemId } });
    if (n !== productIds.length) throw new Error("มีสินค้า/บริการที่ไม่อยู่ในระบบบัญชีนี้");
  }
  const accountIds = [...new Set(refs.accountIds ?? [])];
  if (accountIds.length) {
    const n = await prisma.accountLedger.count({ where: { id: { in: accountIds }, tenantId, systemId } });
    if (n !== accountIds.length) throw new Error("มีผังบัญชีที่ไม่อยู่ในระบบบัญชีนี้");
  }
  if (refs.salesUserId) {
    const n = await prisma.membership.count({ where: { userId: refs.salesUserId, tenantId } });
    if (n === 0) throw new Error("ไม่พบพนักงานขายรายนี้ในร้าน");
  }
}

/** สถานะร่างของเอกสาร (ตรวจก่อนแก้ — ผูก tenant/system/docType ครบทุกตัว) */
export async function getDraftMeta(
  tenantId: string,
  systemId: string,
  id: string,
  docType?: AccountDocType,
): Promise<{ id: string; status: AccountDocStatus } | null> {
  return prisma.accountDocument.findFirst({
    where: { id, tenantId, systemId, ...(docType ? { docType } : {}) },
    select: { id: true, status: true },
  });
}

/**
 * เขียนฟิลด์ที่ฟอร์ม V2 เพิ่มเข้ามา (WO 0.3 + WO 1.3) ทับหลัง create/update ปกติ
 * — แยกจาก createDocument/updateDocument เพื่อไม่แตะ contract เดิมที่ POS/CRM/ข้อสอบเก่าใช้อยู่
 */
export async function applyEditorExtras(
  tenantId: string,
  systemId: string,
  docId: string,
  extras: {
    reference: string | null;
    priceMode: AccountPriceMode;
    discountMode: AccountDiscountMode;
    salesUserId: string | null;
    tags: string[];
    internalNote: string | null;
    autoTaxInvoice: boolean | null;
    whtAmount: number;
    lineWht: { whtIncomeType: AccountWhtIncomeType | null; whtRateBp: number | null }[];
  },
): Promise<{ docNo: string | null; grandTotal: number } | null> {
  await prisma.accountDocument.updateMany({
    where: { id: docId, tenantId, systemId },
    data: {
      reference: extras.reference,
      priceMode: extras.priceMode,
      discountMode: extras.discountMode,
      salesUserId: extras.salesUserId,
      tags: extras.tags,
      internalNote: extras.internalNote,
      autoTaxInvoice: extras.autoTaxInvoice,
      whtAmount: extras.whtAmount,
    },
  });
  const lines = await prisma.accountDocumentLine.findMany({
    where: { documentId: docId, tenantId, systemId },
    select: { id: true, sortOrder: true },
    orderBy: { sortOrder: "asc" },
  });
  for (const row of lines) {
    const src = extras.lineWht[row.sortOrder];
    if (!src) continue;
    await prisma.accountDocumentLine.update({
      where: { id: row.id },
      data: { whtIncomeType: src.whtIncomeType, whtRateBp: src.whtRateBp },
    });
  }
  return prisma.accountDocument.findFirst({
    where: { id: docId, tenantId, systemId },
    select: { docNo: true, grandTotal: true },
  });
}

/** ยกเลิกร่าง (ไม่ลบ — กติกา "ยกเลิกได้ปลอดภัย" BLUEPRINT §0.3-8) */
export async function cancelDraft(tenantId: string, systemId: string, id: string): Promise<boolean> {
  const res = await prisma.accountDocument.updateMany({
    where: { id, tenantId, systemId, status: "DRAFT" },
    data: { status: "CANCELLED" },
  });
  return res.count > 0;
}

// ── รายการโปรด (ชุดบรรทัดที่บันทึกไว้ §5.2 C) — เก็บใน AccountSettings.docConfig.favorites ──
export type DocFavorite = { name: string; lines: unknown[] };

export async function getDocFavorites(tenantId: string, systemId: string): Promise<DocFavorite[]> {
  const s = await prisma.accountSettings.findFirst({ where: { tenantId, systemId }, select: { docConfig: true } });
  const raw = (s?.docConfig as Record<string, unknown> | null)?.favorites;
  return Array.isArray(raw) ? (raw as DocFavorite[]).slice(0, 20) : [];
}

export async function saveDocFavorite(
  tenantId: string,
  systemId: string,
  fav: DocFavorite,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const s = await prisma.accountSettings.findFirst({ where: { tenantId, systemId }, select: { id: true, docConfig: true } });
  if (!s) return { ok: false, reason: "ยังไม่ได้ตั้งค่ากิจการ" };
  const cfg = (s.docConfig as Record<string, unknown> | null) ?? {};
  const prev = Array.isArray(cfg.favorites) ? (cfg.favorites as DocFavorite[]) : [];
  const next = [...prev.filter((f) => f?.name !== fav.name), fav].slice(-20);
  await prisma.accountSettings.update({
    where: { id: s.id },
    data: { docConfig: { ...cfg, favorites: next } as Prisma.InputJsonValue },
  });
  return { ok: true };
}

// ═════════════════════════════════════════════════════════════════════════
// WO 1.7 — ใบวางบิลรวม (BN) / ใบรวมจ่าย (CP) · ชั้น "แตะฐานข้อมูล" เท่านั้น
//
// 🔴 กติกาแบ่งชั้น: ไฟล์นี้ = query/insert ล้วน (ไม่มีนโยบาย) · ตรรกะ (ชนิดลูกที่รับได้ · FIFO ·
//    การกระจายชำระ · สถานะกลุ่ม) อยู่ที่ `group.ts` ซึ่ง **ไม่ import prisma** (fitness F5 ratchet)
// เอกสารกลุ่มไม่ลง JV ที่ตัวเอง (gl.ts NO_GL ทั้ง BILLING_NOTE และ COMBINED_PAYMENT) —
// บัญชีเกิดที่ "ใบลูก" ตอนกระจายชำระเท่านั้น
// ═════════════════════════════════════════════════════════════════════════

export type GroupRelType = "BILL" | "PAY_GROUP";

export type GroupChildDoc = {
  id: string;
  docType: AccountDocType;
  docNo: string | null;
  issueDate: Date;
  dueDate: Date | null;
  contactId: string | null;
  contactName: string | null;
  status: AccountDocStatus;
  statusLabel: string;
  grandTotal: number;
  paidTotal: number;
  /** ใบลดหนี้ที่ออกจากใบนี้แล้ว (เฉพาะ INVOICE — mirror ด่านของ recordPayment) */
  creditNoteTotal: number;
  outstanding: number;
  /** กลุ่มที่ใบนี้อยู่แล้วและยังไม่ถูกยกเลิก (null = ว่าง หยิบไปเข้ากลุ่มใหม่ได้) */
  groupDocId: string | null;
  groupDocNo: string | null;
  groupDocType: AccountDocType | null;
};

const GROUP_CHILD_SELECT = {
  id: true,
  docType: true,
  docNo: true,
  issueDate: true,
  dueDate: true,
  contactId: true,
  status: true,
  grandTotal: true,
  paidTotal: true,
  contact: { select: { name: true } },
  contactSnapshot: true,
} as const;

type GroupChildRaw = Prisma.AccountDocumentGetPayload<{ select: typeof GROUP_CHILD_SELECT }>;

/** เติมยอดค้าง + กลุ่มที่สังกัด ให้เอกสารลูกชุดหนึ่ง (query 2 ครั้ง ไม่ใช่ N+1 ต่อแถว) */
async function decorateGroupChildren(
  tenantId: string,
  systemId: string,
  relType: GroupRelType,
  rows: GroupChildRaw[],
  opts?: { ignoreGroupId?: string },
): Promise<GroupChildDoc[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const invoiceIds = rows.filter((r) => r.docType === "INVOICE").map((r) => r.id);
  const [cnRows, relRows] = await Promise.all([
    invoiceIds.length
      ? prisma.accountDocument.groupBy({
          by: ["sourceDocId"],
          where: {
            tenantId,
            systemId,
            docType: "CREDIT_NOTE",
            sourceDocId: { in: invoiceIds },
            status: { notIn: ["DRAFT", "VOIDED", "CANCELLED"] },
          },
          _sum: { grandTotal: true },
        })
      : Promise.resolve([] as { sourceDocId: string | null; _sum: { grandTotal: number | null } }[]),
    prisma.accountDocumentRelation.findMany({
      where: {
        tenantId,
        systemId,
        type: relType,
        toId: { in: ids },
        from: { status: { notIn: ["VOIDED", "CANCELLED"] } },
        ...(opts?.ignoreGroupId ? { fromId: { not: opts.ignoreGroupId } } : {}),
      },
      select: { toId: true, from: { select: { id: true, docNo: true, docType: true } } },
    }),
  ]);
  const cnMap = new Map<string, number>();
  for (const c of cnRows) if (c.sourceDocId) cnMap.set(c.sourceDocId, c._sum.grandTotal ?? 0);
  const relMap = new Map<string, { id: string; docNo: string | null; docType: AccountDocType }>();
  for (const r of relRows) relMap.set(r.toId, r.from);

  return rows.map((r) => {
    const cn = cnMap.get(r.id) ?? 0;
    const g = relMap.get(r.id) ?? null;
    const snap = (r.contactSnapshot as Record<string, unknown> | null) ?? null;
    return {
      id: r.id,
      docType: r.docType,
      docNo: r.docNo,
      issueDate: r.issueDate,
      dueDate: r.dueDate,
      contactId: r.contactId,
      contactName: (snap?.name as string) ?? r.contact?.name ?? null,
      status: r.status,
      statusLabel: STATUS_LABEL[r.status] ?? r.status,
      grandTotal: r.grandTotal,
      paidTotal: r.paidTotal,
      creditNoteTotal: cn,
      outstanding: Math.max(0, r.grandTotal - r.paidTotal - cn),
      groupDocId: g?.id ?? null,
      groupDocNo: g?.docNo ?? null,
      groupDocType: g?.docType ?? null,
    };
  });
}

/**
 * เอกสารที่ "หยิบเข้ากลุ่มได้" — ยังค้างชำระจริง (รอชำระ/ชำระบางส่วน) ของผู้ติดต่อรายที่เลือก
 * คืนทั้งใบที่อยู่ในกลุ่มอื่นแล้วด้วย (ติดธง groupDocNo) ให้ชั้นนโยบายตัดสินว่าจะตัดออกหรือขึ้นเป็นเทา
 */
export async function groupCandidateDocs(
  tenantId: string,
  systemId: string,
  input: {
    docTypes: readonly AccountDocType[];
    relType: GroupRelType;
    contactId?: string;
    ids?: string[];
    from?: Date | string;
    to?: Date | string;
    /** ไม่นับว่า "อยู่ในกลุ่มแล้ว" ถ้ากลุ่มนั้นคือใบนี้ (ตอนแก้ร่างกลุ่มเดิม) */
    ignoreGroupId?: string;
    take?: number;
  },
): Promise<GroupChildDoc[]> {
  const from = parseDay(input.from, false);
  const to = parseDay(input.to, true);
  const rows = await prisma.accountDocument.findMany({
    where: {
      tenantId,
      systemId,
      docType: { in: [...input.docTypes] },
      status: { in: ["AWAITING_PAYMENT", "PARTIAL"] },
      ...(input.contactId ? { contactId: input.contactId } : {}),
      ...(input.ids ? { id: { in: input.ids } } : {}),
      ...(from || to ? { issueDate: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
    },
    select: GROUP_CHILD_SELECT,
    orderBy: [{ dueDate: "asc" }, { issueDate: "asc" }, { docNo: "asc" }],
    take: Math.min(Math.max(input.take ?? 200, 1), 500),
  });
  return decorateGroupChildren(tenantId, systemId, input.relType, rows, { ignoreGroupId: input.ignoreGroupId });
}

/** ใบลูกของกลุ่มหนึ่ง เรียงตามกำหนดชำระ (FIFO) — ใช้ทั้งหน้ารายละเอียดและตอนกระจายชำระ */
export async function groupChildDocs(
  tenantId: string,
  systemId: string,
  groupId: string,
  relType: GroupRelType,
): Promise<GroupChildDoc[]> {
  const rels = await prisma.accountDocumentRelation.findMany({
    where: { tenantId, systemId, fromId: groupId, type: relType },
    select: { to: { select: GROUP_CHILD_SELECT } },
  });
  const rows = rels.map((r) => r.to);
  const decorated = await decorateGroupChildren(tenantId, systemId, relType, rows, { ignoreGroupId: groupId });
  // FIFO: ครบกำหนดก่อนมาก่อน · ไม่มีวันครบกำหนด = ใช้วันที่ออก · เสมอกันเรียงตามเลขที่ (deterministic)
  return decorated.sort((a, b) => {
    const ka = (a.dueDate ?? a.issueDate).getTime();
    const kb = (b.dueDate ?? b.issueDate).getTime();
    if (ka !== kb) return ka - kb;
    return (a.docNo ?? "").localeCompare(b.docNo ?? "");
  });
}

/** กลุ่มที่ยังไม่ถูกยกเลิกซึ่งใบลูกใบนี้สังกัดอยู่ (ใช้ทำชิป "อยู่ในใบวางบิล …" หน้าเอกสารลูก) */
export async function openGroupOfChild(
  tenantId: string,
  systemId: string,
  childId: string,
): Promise<{ id: string; docNo: string | null; docType: AccountDocType; status: AccountDocStatus } | null> {
  const rel = await prisma.accountDocumentRelation.findFirst({
    where: {
      tenantId,
      systemId,
      toId: childId,
      type: { in: ["BILL", "PAY_GROUP"] },
      from: { status: { notIn: ["VOIDED", "CANCELLED"] } },
    },
    select: { from: { select: { id: true, docNo: true, docType: true, status: true } } },
    orderBy: { createdAt: "desc" },
  });
  return rel?.from ?? null;
}

/**
 * สร้างเอกสารกลุ่ม (ร่าง) + บรรทัด 1 บรรทัดต่อใบลูก + relation BILL/PAY_GROUP
 * 🔴 ตรวจซ้ำใน tx เดียวกันว่าใบลูกยัง "ว่าง" อยู่จริง (กันสองคนกดพร้อมกันแล้วใบเดียวเข้า 2 กลุ่ม)
 */
export async function createGroupDocument(input: {
  tenantId: string;
  systemId: string;
  docType: AccountDocType;
  direction: "IN" | "OUT";
  relType: GroupRelType;
  contactId: string;
  issueDate: Date;
  dueDate: Date | null;
  note: string | null;
  createdById: string | null;
  children: { id: string; description: string; amount: number }[];
}): Promise<{ ok: true; id: string } | { ok: false; reason: string }> {
  if (input.children.length === 0) return { ok: false, reason: "ต้องเลือกเอกสารอย่างน้อย 1 ใบ" };
  const total = input.children.reduce((s, c) => s + c.amount, 0);
  try {
    const id = await prisma.$transaction(async (tx) => {
      const taken = await tx.accountDocumentRelation.findFirst({
        where: {
          tenantId: input.tenantId,
          systemId: input.systemId,
          type: input.relType,
          toId: { in: input.children.map((c) => c.id) },
          from: { status: { notIn: ["VOIDED", "CANCELLED"] } },
        },
        select: { to: { select: { docNo: true } }, from: { select: { docNo: true } } },
      });
      if (taken)
        throw new Error(
          `เอกสาร ${taken.to.docNo ?? "(ร่าง)"} อยู่ในกลุ่ม ${taken.from.docNo ?? "(ร่าง)"} แล้ว — เอาออกจากกลุ่มนั้นก่อน`,
        );
      const doc = await tx.accountDocument.create({
        data: {
          tenantId: input.tenantId,
          systemId: input.systemId,
          docType: input.docType,
          status: "DRAFT",
          direction: input.direction,
          issueDate: input.issueDate,
          dueDate: input.dueDate,
          contactId: input.contactId,
          vatMode: "NONE", // VAT อยู่ที่ใบลูกแล้ว — เอกสารกลุ่มเป็นใบสรุปยอด ไม่คิดภาษีซ้ำ
          vatTiming: "ON_ISSUE",
          taxPointBasis: "ON_ISSUE",
          discountAmount: 0,
          depositDeducted: 0,
          subTotal: total,
          vatAmount: 0,
          grandTotal: total,
          note: input.note,
          createdById: input.createdById,
          lines: {
            create: input.children.map((c, i) => ({
              tenantId: input.tenantId,
              systemId: input.systemId,
              sortOrder: i,
              description: c.description,
              qty: 1,
              unitName: null,
              unitPrice: c.amount,
              discount: 0,
              vatRateBp: -1, // ยกเว้น (ยอดในบรรทัดคือยอดค้างของใบลูกซึ่งรวมภาษีแล้ว)
              amount: c.amount,
            })),
          },
        },
      });
      for (const c of input.children) {
        await tx.accountDocumentRelation.create({
          data: {
            tenantId: input.tenantId,
            systemId: input.systemId,
            fromId: doc.id,
            toId: c.id,
            type: input.relType,
            amount: c.amount,
          },
        });
      }
      return doc.id;
    });
    return { ok: true, id };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : "สร้างเอกสารกลุ่มไม่สำเร็จ" };
  }
}

/**
 * ปรับ "ความคืบหน้า" ของเอกสารกลุ่มจากยอดค้างจริงของใบลูก (แหล่งความจริง = ใบลูก ไม่ใช่ตัวนับของกลุ่ม)
 * ⇒ จ่ายใบลูกตรง ๆ นอกกลุ่ม สถานะกลุ่มก็ตามทันเสมอ · ยกเลิกการชำระแล้วก็ถอยกลับเองได้
 */
export async function updateGroupProgress(
  tenantId: string,
  systemId: string,
  groupId: string,
  children: { outstanding: number; status: AccountDocStatus }[],
): Promise<{ paidTotal: number; status: AccountDocStatus }> {
  const doc = await prisma.accountDocument.findFirst({
    where: { id: groupId, tenantId, systemId },
    select: { id: true, grandTotal: true, status: true },
  });
  if (!doc) return { paidTotal: 0, status: "DRAFT" };
  if (doc.status === "DRAFT" || doc.status === "VOIDED" || doc.status === "CANCELLED")
    return { paidTotal: 0, status: doc.status };
  const remain = children.reduce((s, c) => s + c.outstanding, 0);
  const paidTotal = Math.max(0, doc.grandTotal - remain);
  const allSettled = children.every((c) => c.outstanding <= 0);
  const status: AccountDocStatus = allSettled ? "PAID" : paidTotal > 0 ? "PARTIAL" : "AWAITING_PAYMENT";
  await prisma.accountDocument.update({ where: { id: groupId }, data: { paidTotal, status } });
  return { paidTotal, status };
}

/** รายการชำระของใบลูกที่เกิดจากการกระจายของกลุ่มนี้ (คีย์กันซ้ำขึ้นต้นด้วย prefix ของกลุ่ม) */
export async function findGroupChildPayments(
  tenantId: string,
  systemId: string,
  keyPrefix: string,
): Promise<
  {
    id: string;
    documentId: string;
    idempotencyKey: string | null;
    paidAt: Date;
    channel: AccountPayChannel;
    financeName: string | null;
    amount: number;
    whtAmount: number;
    feeAmount: number;
    note: string | null;
    voidedAt: Date | null;
    docNo: string | null;
  }[]
> {
  const rows = await prisma.accountDocumentPayment.findMany({
    where: { tenantId, systemId, idempotencyKey: { startsWith: keyPrefix } },
    orderBy: { paidAt: "asc" },
    select: {
      id: true,
      documentId: true,
      idempotencyKey: true,
      paidAt: true,
      channel: true,
      amount: true,
      whtAmountSatang: true,
      feeAmount: true,
      note: true,
      voidedAt: true,
      financeAccount: { select: { name: true } },
      document: { select: { docNo: true } },
    },
  });
  return rows.map((r) => ({
    id: r.id,
    documentId: r.documentId,
    idempotencyKey: r.idempotencyKey,
    paidAt: r.paidAt,
    channel: r.channel,
    financeName: r.financeAccount?.name ?? null,
    amount: r.amount,
    whtAmount: r.whtAmountSatang,
    feeAmount: r.feeAmount,
    note: r.note,
    voidedAt: r.voidedAt,
    docNo: r.document.docNo,
  }));
}

/** หัวเอกสารกลุ่ม (เท่าที่ชั้นนโยบายต้องใช้) — ไม่ดึงบรรทัด/ไฟล์แนบ */
export async function getGroupDocHead(
  tenantId: string,
  systemId: string,
  groupId: string,
): Promise<{
  id: string;
  docType: AccountDocType;
  docNo: string | null;
  status: AccountDocStatus;
  direction: string;
  grandTotal: number;
  paidTotal: number;
  dueDate: Date | null;
  contactId: string | null;
  contactName: string | null;
} | null> {
  const d = await prisma.accountDocument.findFirst({
    where: { id: groupId, tenantId, systemId },
    select: {
      id: true,
      docType: true,
      docNo: true,
      status: true,
      direction: true,
      grandTotal: true,
      paidTotal: true,
      dueDate: true,
      contactId: true,
      contact: { select: { name: true } },
      contactSnapshot: true,
    },
  });
  if (!d) return null;
  const snap = (d.contactSnapshot as Record<string, unknown> | null) ?? null;
  return {
    id: d.id,
    docType: d.docType,
    docNo: d.docNo,
    status: d.status,
    direction: d.direction,
    grandTotal: d.grandTotal,
    paidTotal: d.paidTotal,
    dueDate: d.dueDate,
    contactId: d.contactId,
    contactName: (snap?.name as string) ?? d.contact?.name ?? null,
  };
}
