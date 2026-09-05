import { randomBytes } from "node:crypto";
import { safeReason } from "./errors";
import { prisma } from "@/lib/core/db";
import { emitOutbox, emitOutboxMany } from "@/lib/core/outbox";
// WO 4.3 (§8.2) — ขาย "รายการจัดชุด" = ตัดสต็อกส่วนประกอบ (ไฟล์แยกกัน import วน service↔product)
import { consumeBundleComponentsInTx } from "./bundle";
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
  AccountDocSource,
  AccountLinkedKind,
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
// WO 3.1 — Party (INTEGRATION-MAP §F.1/§F.4): ตัวตนกลางระดับ tenant · เรียกผ่าน facade เท่านั้น (F2.2)
// `safeFindOrCreate` ไม่มีวันทำให้ที่นี่ throw (BLUEPRINT §1: ไม่เชื่อม/ล้มเหลว = partyId null ไม่ใช่พัง)
import * as party from "@/lib/modules/party";
// WO 1.9 (เอกสารประจำ + เตือน) — ดูหัวข้อท้ายไฟล์ว่าทำไมโค้ดก้อนนั้นอยู่ในไฟล์นี้ (fitness F5)
import { evaluate } from "@/lib/core/rbac";
import { writeAudit } from "./access";
// 🔴 `sendEmail` **ต้อง import แบบ lazy เท่านั้น** (ดูใน runAccountEmailReports)
//    `@/lib/core/email` → `@/lib/env` ที่ตรวจ schema ตอน "โหลดโมดูล" (ต้องมี SESSION_SECRET/RESEND_*)
//    ถ้า import ไว้หัวไฟล์ การ import โมดูลบัญชีเฉย ๆ จะพังในสภาพแวดล้อมที่ไม่มี .env (CI · fitness F10.1)
//    กติกาเดียวกับที่ WO 1.9 ใช้ และที่ core/email.ts เองใช้กับ logOps
import {
  composeAccountReport,
  reportIdempotencyKey,
  reportKindsDue,
  REPORT_MARKER_TITLE,
} from "./email-report";
import { accountRateGuard } from "./rate-limit";
import { clampSearch } from "./search-input";
import { isCodeUniqueConflict } from "./unique-conflict";
// WO 8.2 (§9.3) นโยบายบัญชี — ล็อกวันที่ · ปีบัญชี · ค่าเริ่มต้นของฟอร์ม/การแปลงเอกสาร
import {
  assertNotLockedTx,
  assertNotLockedWith,
  defaultPolicy,
  fiscalYearOf,
  parsePolicy,
  POLICY_SELECT,
  toDupPolicy,
  type PolicyRow,
  type AccountPolicy,
} from "./policy";
// WO 8.1 (§9.2) — เครื่องออกเลขที่เอกสาร + โครงตั้งค่าเอกสาร (แหล่งเดียวทั้งฝั่งรายรับ/รายจ่าย)
import {
  bkkParts,
  issueDocNo,
  peekDocNo,
  setNextNo,
  findSeqGaps,
} from "./doc-numbering";
import {
  REVENUE_DOC_PREFIX,
  applyDueColumns,
  defaultDocSettings,
  fallbackPrefixOf,
  parseDocSettings,
  type DocSettings as DocSettingsView,
  type SeqReset as DocSeqReset,
  type SeqConfig as DocSeqConfig,
} from "./settings-schema";
import {
  DAY_MS as REC_DAY_MS,
  RECURRING_TAG,
  autoApproveBlockReason,
  firstRunAt,
  isRecurringDocType,
  nextRunAfter,
  parseRecurringTemplate,
  periodKeyOf,
  utcDay,
  type RecurringTemplate,
} from "./recurring-shared";
import type { AccountRecurringFrequency } from "@prisma/client";

// Account (บัญชี P1 — ฝั่งรายรับ) service. scope = tenantId + systemId (feature)
// เอกสารเงิน immutable: DRAFT แก้ได้ · พ้น DRAFT แก้ไม่ได้ → void/reissue

// ─────────────────── ค่าคงที่/ตัวช่วย ───────────────────

// WO 8.1: ตารางจริงย้ายไป settings-schema.ts (ฝั่งรายจ่ายต้องใช้ด้วย และ 2 ไฟล์นั้น import กันเป็นวง)
export const DOC_PREFIX = REVENUE_DOC_PREFIX;

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
import { computeTotals, computeDocTotals, lineAmount } from "./totals";
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
  /**
   * WO 8.1 (§9.2) — ตั้งค่าเอกสารทั้งก้อน (เลขที่ · หมายเหตุ · วันครบกำหนด · ช่องทางบนเอกสาร ·
   * ลิงก์สาธารณะ · ใบกำกับอัตโนมัติ · เทมเพลตพิมพ์ · ลิงก์ขอใบกำกับ · กฎอัตโนมัติ)
   * ติดมากับ getSettings เลย เพราะทุกที่ที่ต้องใช้ (ฟอร์ม/พิมพ์/ลิงก์สาธารณะ/รับชำระ) เรียก getSettings อยู่แล้ว
   * ⇒ ไม่มี query เพิ่ม และไม่มีใครต้องไปอ่าน docConfig ดิบ ๆ เองอีก
   */
  doc: DocSettingsView;
  /**
   * WO 8.2 (§9.3) — นโยบายบัญชีทั้งก้อน (ปีบัญชี · VAT · WHT เริ่มต้น · ประเภทราคา · ล็อกวันที่ ·
   * ชื่อซ้ำ · บัญชีเริ่มต้น · ออกเอกสารต่อ · ลูกค้าประจำ · ปิดงวดอัตโนมัติ · รายงานอีเมล)
   * ติดมากับ getSettings ด้วยเหตุผลเดียวกับ `doc` — ทุกจุดที่ต้องใช้เรียก getSettings อยู่แล้ว ⇒ ไม่มี query เพิ่ม
   */
  policy: AccountPolicy;
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
  doc: defaultDocSettings(),
  policy: defaultPolicy(),
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

// WO 8.2: "จุดรับรู้ภาษีขาย" ย้ายขึ้นคอลัมน์ `AccountSettings.vatTiming` แล้ว (migration backfill จาก JSON ให้)
// เก็บ `taxPointBasis` ไว้ในชื่อเดิมของ view เพราะมีผู้ใช้ ~10 จุด — แต่แหล่งความจริงเป็นคอลัมน์แล้ว

export async function getSettings(
  tenantId: string,
  systemId: string,
): Promise<AccountSettingsView> {
  const s = await prisma.accountSettings.findFirst({ where: { tenantId, systemId } });
  if (!s) return { ...SETTINGS_DEFAULT, doc: defaultDocSettings(), policy: defaultPolicy() };
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
    taxPointBasis: s.vatTiming,
    defaultDueDays: s.defaultDueDays,
    defaultValidDays: s.defaultValidDays,
    footerNote: s.footerNote,
    docTypes: readDocTypes(s.docConfig),
    doc: applyDueColumns(parseDocSettings(s.docConfig), {
      defaultValidDays: s.defaultValidDays,
      defaultDueDays: s.defaultDueDays,
    }),
    policy: parsePolicy(s),
  };
}

export async function saveSettings(
  tenantId: string,
  systemId: string,
  input: Partial<AccountSettingsView>,
) {
  const existing = await prisma.accountSettings.findFirst({ where: { tenantId, systemId } });
  const prevConfig =
    (existing?.docConfig as Record<string, unknown> | null | undefined) ?? {};
  const docConfig: Record<string, unknown> = { ...prevConfig };
  // §3.8 ตราประทับ/ลายเซ็น + per-docType (เก็บใน docConfig — คงคีย์เดิมถ้าไม่ได้ส่งมา)
  if (input.orgPrefix !== undefined) docConfig.orgPrefix = input.orgPrefix || null;
  if (input.stampUrl !== undefined) docConfig.stampUrl = input.stampUrl || null;
  if (input.signatureUrl !== undefined) docConfig.signatureUrl = input.signatureUrl || null;
  if (input.docTypes !== undefined) {
    docConfig.docTypes = input.docTypes;
    // sync prefix → docConfig.sequences[docType].prefix (ตัวที่ nextDocNo ใช้จริง)
    const seqs = { ...((prevConfig.sequences as Record<string, Partial<DocSeqConfig>>) ?? {}) };
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
    // 🔴 WO 8.2: VAT (จด/ไม่จด · อัตรา · จุดรับรู้) ย้ายไปหน้า "นโยบายบัญชี" (§9.3) แล้ว
    //    ⇒ เขียนเฉพาะเมื่อผู้เรียกส่งมาจริง · ถ้าเขียนทุกครั้งแบบเดิม (`?? true` / `?? 700`)
    //    การกดบันทึกหน้า "ข้อมูลกิจการ" จะรีเซ็ต VAT ของร้านทิ้งเงียบ ๆ
    ...(input.vatRegistered === undefined ? {} : { vatRegistered: input.vatRegistered }),
    ...(input.vatRateBp === undefined ? {} : { vatRateBp: input.vatRateBp }),
    ...(input.taxPointBasis === undefined ? {} : { vatTiming: input.taxPointBasis }),
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
  // WO 8.3 (§9.5): `enabled: false` = ผู้ใช้กด "ตัดการเชื่อม" ที่หน้าการเชื่อมต่อ
  //   ⇒ ต้องหยุดลงบัญชีทันที (กติกา "ไม่เชื่อม = ไม่ลงบัญชีให้") · แถวเดิมทุกแถว enabled=true จาก migration
  return prisma.accountSystemLink.findFirst({
    where: { tenantId, linkedKind: "POS", linkedId: posSystemId, archivedAt: null, enabled: true },
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
): Promise<{ vatRegistered: boolean; vatRateBp: number; posAbbreviatedInvoice: boolean }> {
  const s = await prisma.accountSettings.findFirst({
    where: { systemId },
    select: { vatRegistered: true, vatRateBp: true, docConfig: true },
  });
  return {
    vatRegistered: s?.vatRegistered ?? true,
    vatRateBp: s?.vatRateBp ?? 700,
    // WO 8.1 (§9.2 "ใบกำกับอย่างย่อจาก POS"): ปิดสวิตช์นี้ = ไม่สร้างเอกสารใบกำกับอย่างย่อจากบิลหน้าร้าน
    // (JV ของ POS ยังลงเหมือนเดิม — เงินไม่หาย · หายแค่ "ชั้นเอกสาร" ที่ใช้ทำรายงานขายรายสินค้า)
    posAbbreviatedInvoice: parseDocSettings(s?.docConfig ?? null).autoTaxInvoice.posAbbreviated,
  };
}

/**
 * WO 3.2 — หาว่า tenant นี้เปิดระบบ MEMBER/CRM ไว้ไหม (คืน systemId แรกที่เจอของแต่ละชนิด · null = ไม่เปิด)
 * ใช้เดา "ที่มา" ของผู้ติดต่อ (badges สมาชิก/CRM ในหน้าผู้ติดต่อ) — AppSystem เป็น model กลาง (เหมือนที่ guard.ts
 * เรียก prisma.appSystem ตรง ๆ อยู่แล้ว) ไม่ใช่การข้ามขอบเขตโมดูล
 */
export async function findLinkedSystemIds(
  tenantId: string,
): Promise<{ memberSystemId: string | null; crmSystemId: string | null }> {
  const rows = await prisma.appSystem.findMany({
    where: { tenantId, type: { in: ["MEMBER", "CRM"] } },
    select: { id: true, type: true },
    orderBy: { createdAt: "asc" },
  });
  return {
    memberSystemId: rows.find((r) => r.type === "MEMBER")?.id ?? null,
    crmSystemId: rows.find((r) => r.type === "CRM")?.id ?? null,
  };
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

// ═══════════════ WO 3.3 — ช่องใหม่ของ modal ผู้ติดต่อ (SPEC §7.2 · ภาพ g5) ═══════════════

/** ช่องทั้งหมดที่ modal §7.2 เขียนได้ (นอกเหนือจากของเดิม) — ใช้ร่วมทั้ง create และ update */
export type ContactExtraFields = Partial<{
  /** เลขที่ "C00019" — ไม่ส่ง = ให้ระบบออกให้อัตโนมัติตอนสร้าง (ตอนแก้ไข = ไม่แตะ) */
  code: string | null;
  taxIdCountry: string | null;
  officeType: string | null; // UNSPECIFIED | HQ | BRANCH
  legalEntityType: string | null;
  personTitle: string | null;
  addressLine: string | null;
  subdistrict: string | null;
  district: string | null;
  province: string | null;
  postcode: string | null;
  country: string | null;
  contactPerson: string | null;
  website: string | null;
  fax: string | null;
  lineId: string | null;
  defaultPriceMode: AccountPriceMode | null;
  defaultWhtType: string | null;
  defaultWhtRateBp: number | null;
  bankAccountNote: string | null;
  arAccountCode: string | null;
  apAccountCode: string | null;
  ownerUserId: string | null;
  tags: string[];
}>;

/** ที่อยู่แบบแยกช่องที่ประกอบเป็นสตริงเดียวได้ */
type AddressParts = Pick<
  ContactExtraFields,
  "addressLine" | "subdistrict" | "district" | "province" | "postcode"
>;
const ADDRESS_KEYS = ["addressLine", "subdistrict", "district", "province", "postcode"] as const;

/**
 * ประกอบที่อยู่แยกช่อง → สตริงเดียวแบบไทย ("191 ถ.ราษฎร์อุทิศ ต.รัษฎา อ.เมือง ภูเก็ต 83000")
 *
 * 🔴 ทำไมต้องมี: คอลัมน์ `address` เดิมคือของที่ **การพิมพ์ใบกำกับ/ใบเสร็จอ่านอยู่** (ม.86/4)
 *    ถ้า modal ใหม่เขียนเฉพาะช่องแยกแล้วปล่อย `address` ค้างของเก่า เอกสารที่พิมพ์จะเป็นที่อยู่ผิด
 *    ⇒ ทุกครั้งที่แตะช่องแยก ต้องเขียน `address` ให้ตรงกันในคำสั่งเดียวกัน (เหมือน phone/phoneNorm)
 */
export function joinAddressTh(p: AddressParts): string {
  const parts = [
    p.addressLine?.trim(),
    p.subdistrict?.trim() ? `ต.${p.subdistrict.trim()}` : "",
    p.district?.trim() ? `อ.${p.district.trim()}` : "",
    p.province?.trim(),
    p.postcode?.trim(),
  ].filter((s): s is string => !!s);
  return parts.join(" ");
}

/**
 * ฟิลด์ที่อยู่ที่ต้องเขียนคู่กันเสมอ — ช่องแยก + `address` (สตริงรวม)
 * - ไม่ส่งช่องแยกมาเลย → คืน {} (ปล่อย `address` ที่ caller ส่งมาเอง หรือของเดิมใน DB)
 * - ส่งช่องแยกมาอย่างน้อย 1 ช่อง → เขียนช่องแยกทั้งชุด + คำนวณ `address` ใหม่ (ว่าง → null)
 */
export function contactAddressFields(
  input: AddressParts & { address?: string | null },
): Record<string, string | null> {
  const touched = ADDRESS_KEYS.some((k) => k in input);
  if (!touched) return {};
  const parts: AddressParts = {
    addressLine: input.addressLine ?? null,
    subdistrict: input.subdistrict ?? null,
    district: input.district ?? null,
    province: input.province ?? null,
    postcode: input.postcode ?? null,
  };
  const joined = joinAddressTh(parts);
  return { ...parts, address: joined || null };
}

/** ช่องใหม่ที่ไม่ต้องแปลงอะไร — คัดเฉพาะคีย์ที่ caller ส่งมาจริง (partial update ไม่ล้างของเดิม) */
function contactExtraWriteFields(input: ContactExtraFields): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const keys = [
    "taxIdCountry", "officeType", "legalEntityType", "personTitle", "contactPerson",
    "website", "fax", "lineId", "defaultPriceMode", "defaultWhtType", "defaultWhtRateBp",
    "bankAccountNote", "arAccountCode", "apAccountCode", "ownerUserId", "country",
  ] as const;
  for (const k of keys) if (k in input) out[k] = (input as Record<string, unknown>)[k] ?? null;
  // tags เป็น Json — เก็บเป็น array ของสตริงที่ตัดช่องว่าง/ตัวซ้ำแล้ว (ค่าว่าง = [] ไม่ใช่ null)
  if ("tags" in input) {
    const raw = Array.isArray(input.tags) ? input.tags : [];
    out.tags = [...new Set(raw.map((t) => String(t).trim()).filter(Boolean))];
  }
  return out;
}

const CONTACT_CODE_RE = /^C(\d{1,})$/;

/** "C00019" → 19 · รูปแบบอื่น (ผู้ใช้พิมพ์เอง เช่น "VIP-1") → null (ไม่นับในการหาเลขถัดไป) */
export function parseContactCodeSeq(code: string | null | undefined): number | null {
  const m = CONTACT_CODE_RE.exec((code ?? "").trim());
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

export function formatContactCode(seq: number): string {
  return `C${String(seq).padStart(5, "0")}`;
}

/**
 * เลขที่ผู้ติดต่อถัดไปของระบบนี้ ("C00020")
 *
 * 🔴 ตัวนี้ **ไม่ใช่** ตัวกันเลขซ้ำ — ตัวกันจริงคือ partial unique index
 *    `AccountContact_systemId_code_active_key` (migration 20260904060000)
 *    เวลามีคนกดสร้างพร้อมกัน 2 คนจะได้เลขเดียวกันจากที่นี่ แล้วคนที่ช้ากว่าโดน P2002
 *    → `createContact` จับแล้วขอเลขใหม่ (retry) — ดูคอมเมนต์ที่นั่น
 *    (บทเรียน `reference_atomic_counter_single_statement`: ตัวนับร่วมห้ามเชื่อ SELECT-then-INSERT)
 * นับรวมแถวที่ปิดใช้งานแล้วด้วย เพื่อไม่ให้เลขเดิมถูกนำกลับมาใช้ซ้ำโดยไม่ตั้งใจ
 */
export async function nextContactCode(systemId: string): Promise<string> {
  const rows = await prisma.accountContact.findMany({
    where: { systemId, code: { not: null } },
    select: { code: true },
  });
  let max = 0;
  for (const r of rows) {
    const n = parseContactCodeSeq(r.code);
    if (n !== null && n > max) max = n;
  }
  // ยังไม่ backfill (ไม่มีแถวไหนมี code เลย) → เริ่มนับต่อจากจำนวนผู้ติดต่อที่มีอยู่ ไม่ใช่ 1
  // (ไม่งั้นผู้ติดต่อใหม่จะได้ C00001 ชนกับเลขที่หน้ารายการคำนวณสดให้แถวเก่าอยู่ — WO 3.2)
  if (max === 0) max = await prisma.accountContact.count({ where: { systemId } });
  return formatContactCode(max + 1);
}

// ─────────── ตรวจซ้ำก่อนบันทึก (SPEC §7.2 "มีอยู่แล้ว: C00012" · §9.3 นโยบายชื่อซ้ำ) ───────────

export type ContactDuplicateHit = {
  /** เหตุที่ถือว่าซ้ำ — เรียงตามความหนักแน่น: เลขภาษี > เบอร์ > ชื่อ */
  reason: "taxId" | "phone" | "name";
  id: string;
  code: string | null;
  name: string;
};

export type ContactDuplicateResult = {
  /** ซ้ำแบบบันทึกไม่ได้แน่นอน — เลขภาษี+สาขาเดียวกันในแถวที่ยังใช้งาน (DB มี unique index กันอยู่) */
  blocking: ContactDuplicateHit[];
  /** ซ้ำแบบ "เตือน" — เบอร์/ชื่อเดียวกัน · กลายเป็นห้ามเมื่อ policy = "block" */
  warnings: ContactDuplicateHit[];
  /** นโยบาย §9.3 "การสร้างชื่อซ้ำ" ที่ใช้ตัดสิน (ค่าเริ่มต้น "warn") */
  policy: ContactDupPolicy;
};

export type ContactDupPolicy = "warn" | "block";

/**
 * นโยบายชื่อซ้ำของ **ผู้ติดต่อ** (§9.3) — WO 8.2 ย้ายขึ้นคอลัมน์ `dupContactPolicy` แล้ว
 * คอลัมน์ null (ร้านที่ยังไม่เคยเปิดหน้านโยบาย) → อ่าน `docConfig.dupNamePolicy` เดิมต่อไป
 */
export async function getDupNamePolicy(systemId: string): Promise<ContactDupPolicy> {
  const row = await prisma.accountSettings.findFirst({
    where: { systemId },
    select: { dupContactPolicy: true, docConfig: true },
  });
  const legacy = (row?.docConfig as Record<string, unknown> | null)?.dupNamePolicy;
  return toDupPolicy(row?.dupContactPolicy ?? legacy, "WARN") === "BLOCK" ? "block" : "warn";
}

/** นโยบายชื่อซ้ำของ **สินค้า/บริการ** (§9.3) — ไม่มีค่าเดิมใน docConfig ⇒ ไม่ได้ตั้ง = เตือน */
export async function getProductDupPolicy(systemId: string): Promise<ContactDupPolicy> {
  const row = await prisma.accountSettings.findFirst({
    where: { systemId },
    select: { dupProductPolicy: true },
  });
  return toDupPolicy(row?.dupProductPolicy, "WARN") === "BLOCK" ? "block" : "warn";
}

/**
 * หาผู้ติดต่อเดิมที่ "น่าจะเป็นรายเดียวกัน" ก่อนบันทึก — คืน payload ให้ UI ขึ้นแถบเตือน
 * พร้อมลิงก์ "เปิด C00012" (SPEC §7.2) · ไม่โยน exception (การเตือนไม่ใช่ความผิดพลาด)
 * ดูเฉพาะแถวที่ยังใช้งาน (archivedAt = null) — ของที่ปิดใช้งานแล้วไม่ควรขวางการสร้างใหม่
 */
export async function checkContactDuplicates(
  tenantId: string,
  systemId: string,
  input: {
    taxId?: string | null;
    branchCode?: string | null;
    phone?: string | null;
    name?: string | null;
    /** ตอนแก้ไข — ไม่ต้องเตือนว่าซ้ำกับตัวเอง */
    excludeId?: string | null;
  },
): Promise<ContactDuplicateResult> {
  const taxId = normalizeTaxId(input.taxId);
  const branchCode = input.branchCode || "00000";
  const phoneNorm = normalizePhoneTh(input.phone);
  const name = (input.name ?? "").trim();

  const or: Prisma.AccountContactWhereInput[] = [];
  if (taxId) or.push({ taxId, branchCode });
  if (phoneNorm) or.push({ phoneNorm });
  if (name) or.push({ name: { equals: name, mode: "insensitive" } });
  const policy = await getDupNamePolicy(systemId);
  if (or.length === 0) return { blocking: [], warnings: [], policy };

  const rows = await prisma.accountContact.findMany({
    where: {
      tenantId,
      systemId,
      archivedAt: null,
      ...(input.excludeId ? { id: { not: input.excludeId } } : {}),
      OR: or,
    },
    select: { id: true, code: true, name: true, taxId: true, branchCode: true, phoneNorm: true },
    take: 20,
  });

  const blocking: ContactDuplicateHit[] = [];
  const warnings: ContactDuplicateHit[] = [];
  const seen = new Set<string>();
  for (const r of rows) {
    const hit = { id: r.id, code: r.code, name: r.name };
    if (taxId && r.taxId === taxId && (r.branchCode || "00000") === branchCode) {
      blocking.push({ reason: "taxId", ...hit });
      seen.add(r.id);
      continue;
    }
    if (phoneNorm && r.phoneNorm === phoneNorm) {
      warnings.push({ reason: "phone", ...hit });
      seen.add(r.id);
      continue;
    }
    if (name && r.name.trim().toLowerCase() === name.toLowerCase() && !seen.has(r.id)) {
      warnings.push({ reason: "name", ...hit });
      seen.add(r.id);
    }
  }
  return { blocking, warnings, policy };
}

/** ซ้ำแบบนี้บันทึกไม่ได้หรือไม่ (รวมนโยบาย §9.3) — ใช้ตัดสินใน action ก่อนเรียก createContact */
export function contactDuplicateBlocks(res: ContactDuplicateResult): ContactDuplicateHit | null {
  if (res.blocking.length > 0) return res.blocking[0]!;
  if (res.policy === "block" && res.warnings.length > 0) return res.warnings[0]!;
  return null;
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
  /** WO 3.1 — รู้ partyId อยู่แล้ว (เช่นจาก CRM) → ใช้ตรง ๆ ไม่ต้อง findOrCreate ซ้ำ */
  partyId?: string | null;
} & ContactExtraFields) {
  // R-C: เลขผู้เสียภาษีถ้ากรอกต้องเป็นตัวเลข 13 หลัก (กัน T0 เลขสั้น/ผิดรูปแบบ)
  // WO 3.3: กติกานี้ใช้กับเลขทะเบียน**ไทย**เท่านั้น — เลือก "ต่างประเทศ" แล้วรูปแบบเลขเป็นอย่างอื่นได้
  const isForeignTaxId = !!input.taxIdCountry && input.taxIdCountry !== "TH";
  const taxId = isForeignTaxId ? (input.taxId ?? "").trim() : normalizeTaxId(input.taxId);
  if (!isForeignTaxId && taxId && !/^\d{13}$/.test(taxId))
    throw new Error("เลขประจำตัวผู้เสียภาษีต้องเป็นตัวเลข 13 หลัก");
  // WO 3.1 (MAP §F.1/§F.4): เชื่อม Party ตอนสร้างผู้ติดต่อ — ล้มเหลว = partyId null (ไม่ throw)
  const partyId =
    input.partyId ??
    (await party.safeFindOrCreate(input.tenantId, {
      name: input.name,
      phone: input.phone ?? null,
      email: input.email ?? null,
      taxId: taxId || null,
      branchCode: input.branchCode || undefined,
      kind: (input.legalType ?? "COMPANY") === "PERSON" ? "PERSON" : "COMPANY",
    }));

  const data = {
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
    ...contactAddressFields(input), // WO 3.3: ช่องแยก + `address` สตริงรวม (การพิมพ์เอกสารเดิมยังใช้ได้)
    ...contactExtraWriteFields(input),
    email: input.email ?? null,
    creditTermDays: input.creditTermDays ?? 0,
    note: input.note ?? null,
    partyId,
  } as Prisma.AccountContactUncheckedCreateInput;

  // 🔴 เลขที่: ผู้ใช้กรอกเองมา = ใช้ตามนั้น (ซ้ำ = P2002 เด้งให้ผู้ใช้เห็น ไม่ต้องเดาแทน)
  //    ไม่กรอก = ระบบออกให้ + **retry เมื่อชนกัน** เพราะ nextContactCode เป็น SELECT-then-INSERT
  //    (2 คนกดพร้อมกันได้เลขเดียวกันแน่นอน — ตัวกันจริงคือ unique index ไม่ใช่ตรรกะนี้)
  const explicitCode = typeof input.code === "string" ? input.code.trim() : "";
  if (explicitCode) return prisma.accountContact.create({ data: { ...data, code: explicitCode } });

  for (let attempt = 0; attempt < 6; attempt++) {
    const code = await nextContactCode(input.systemId);
    try {
      return await prisma.accountContact.create({ data: { ...data, code } });
    } catch (e) {
      if (!isContactCodeConflict(e)) throw e;
      // ชนกับคนที่เร็วกว่า → วนไปขอเลขถัดไป (nextContactCode จะเห็นเลขของเขาแล้ว)
    }
  }
  // ชนติดกัน 6 รอบ = ผิดปกติจริง (ไม่ใช่ race ปกติ) — สร้างโดยไม่มีเลข ดีกว่าทำงานผู้ใช้หาย
  // (หน้ารายการถอยไปใช้เลขคำนวณสดของ WO 3.2 อยู่แล้ว · backfill เก็บกวาดทีหลังได้)
  console.warn(`[account] ออกเลขที่ผู้ติดต่อไม่สำเร็จหลัง 6 ครั้ง (system=${input.systemId}) — บันทึกโดยไม่มีเลขที่`);
  return prisma.accountContact.create({ data });
}

/** ชื่อ partial unique index ของ `code` (migration 20260904060000) — ใช้แยกว่าชนกันที่คอลัมน์ไหน */
const CONTACT_CODE_INDEX = "AccountContact_systemId_code_active_key";

/**
 * error ของ Prisma ที่แปลว่า "เลขที่ผู้ติดต่อชนกัน" (unique index ของ code) — ไม่ใช่ error อื่น
 *
 * 🔴 บทเรียน 4 ก.ย. (เจอจากข้อสอบ P6 ตอนสร้างพร้อมกัน 5 ราย): Prisma 7 + `@prisma/adapter-pg`
 *    **ไม่ได้ใส่ `meta.target` มาให้** — `meta` มีแค่ `modelName` + `driverAdapterError`
 *    ถ้าเช็คแค่ `meta.target` จะได้ false เสมอ → rethrow → retry ไม่เคยทำงานเลย (ผู้ใช้เห็น 500)
 *    ⇒ ดูจาก `message` ที่ Prisma ประกอบให้ ("…failed on the fields: (`systemId`, `code`)")
 *      + ชื่อ index ดิบจาก driver เป็นตัวสำรอง · ระวัง "branchCode" (ตัว C ใหญ่) ไม่ชนกับ `code`
 */
function isContactCodeConflict(e: unknown): boolean {
  // WO 9.2 ข้อ 13 — ใช้ตัวอ่าน P2002 ตัวเดียวกับสินค้า (unique-conflict.ts)
  // ของเดิมค้น substring ในข้อความรวมของ Prisma ซึ่ง **มีซอร์สโค้ดปนมาด้วย** ⇒ ตัดสินผิดได้
  return isCodeUniqueConflict(e, CONTACT_CODE_INDEX);
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
  }> &
    ContactExtraFields,
) {
  const { tags: _tags, ...rest } = input;
  const data: Record<string, unknown> = {
    ...rest,
    // WO 0.3: ถ้า caller ส่ง phone มา ต้องอัปเดต phoneNorm ให้ตรงกันในคำสั่งเดียว
    //         (ไม่ส่ง phone = ไม่แตะทั้งคู่ — พฤติกรรม partial update เดิมคงอยู่)
    ...contactWriteFields(input),
    // WO 3.3: แตะช่องที่อยู่แยก = ต้องเขียน `address` สตริงรวมให้ตรงกันด้วย (การพิมพ์เอกสารอ่านช่องนั้น)
    ...contactAddressFields(input),
    ...contactExtraWriteFields(input),
  };
  if ("code" in input) {
    const c = typeof input.code === "string" ? input.code.trim() : "";
    data.code = c || null;
  }
  await prisma.accountContact.updateMany({ where: { id, tenantId, systemId }, data });

  // WO 3.3 (ปิดหนี้ที่ wo-notes/3.1.md ข้อ "updateContact ยังไม่เติม partyId"):
  // แก้ชื่อ/เบอร์/อีเมล/เลขภาษีของผู้ติดต่อที่ยังไม่มี Party → เชื่อมให้ตอนนี้
  // (มีอยู่แล้วไม่แตะ — การย้าย Party ของแถวเดิมเป็นงานของ "รวมผู้ติดต่อซ้ำ" WO 3.4 ไม่ใช่ที่นี่)
  const touchesIdentity = ["name", "phone", "email", "taxId"].some((k) => k in input);
  if (!touchesIdentity) return;
  const row = await prisma.accountContact.findFirst({
    where: { id, tenantId, systemId },
    select: { partyId: true, name: true, phone: true, email: true, taxId: true, branchCode: true, legalType: true },
  });
  if (!row || row.partyId) return;
  const partyId = await party.safeFindOrCreate(tenantId, {
    name: row.name,
    phone: row.phone,
    email: row.email,
    taxId: row.taxId,
    branchCode: row.branchCode || undefined,
    kind: row.legalType === "PERSON" ? "PERSON" : "COMPANY",
  });
  if (partyId) await prisma.accountContact.updateMany({ where: { id, tenantId, systemId }, data: { partyId } });
}

export async function archiveContact(tenantId: string, systemId: string, id: string) {
  await prisma.accountContact.updateMany({
    where: { id, tenantId, systemId },
    data: { archivedAt: new Date() },
  });
}

/** WO C3 (REST `POST /contacts/{id}/restore`) — เปิดใช้งานผู้ติดต่อที่ถูกปิดใช้งานกลับคืน (ตรงข้าม archiveContact) */
export async function restoreContact(tenantId: string, systemId: string, id: string) {
  await prisma.accountContact.updateMany({
    where: { id, tenantId, systemId },
    data: { archivedAt: null },
  });
}

// ─────────────────── WO 1.8 — นำเข้า CSV: ตัวช่วยผู้ติดต่อ/idempotency ───────────────────

/**
 * หาผู้ติดต่อที่มีอยู่แล้วให้เอกสารที่นำเข้า — เลขผู้เสียภาษี (สาขา 00000) ก่อน แล้วค่อยชื่อตรงเป๊ะ (ไม่สนตัวพิมพ์)
 * ไม่พบ → null (ผู้เรียกสร้างใหม่เอง + ติดป้ายเตือน "ผู้ติดต่อไม่พบ (จะสร้างใหม่)")
 */
export async function findContactForImport(
  tenantId: string,
  systemId: string,
  input: { name: string; taxId?: string | null },
): Promise<{ id: string; name: string } | null> {
  const taxId = normalizeTaxId(input.taxId);
  if (taxId && /^\d{13}$/.test(taxId)) {
    const byTax = await prisma.accountContact.findFirst({
      where: { tenantId, systemId, taxId, branchCode: "00000", archivedAt: null },
      select: { id: true, name: true },
    });
    if (byTax) return byTax;
  }
  const name = input.name.trim();
  if (!name) return null;
  return prisma.accountContact.findFirst({
    where: { tenantId, systemId, archivedAt: null, name: { equals: name, mode: "insensitive" } },
    select: { id: true, name: true },
  });
}

/**
 * ตรวจผู้ติดต่อซ้ำล่วงหน้าเป็นชุด (ก่อนสร้างจริง) — คืนชุด key ที่ชนกับของเดิมในระบบแล้ว
 * ใช้รายงานเหตุผล "เลขภาษีซ้ำ" ในขั้นพรีวิว ก่อนพยายาม insert จริง (กัน error กลางอากาศ)
 */
export async function findContactDuplicates(
  tenantId: string,
  systemId: string,
  keys: { taxId?: string; phoneNorm?: string }[],
): Promise<{ taxIds: Set<string>; phones: Set<string> }> {
  const taxIds = [...new Set(keys.map((k) => k.taxId).filter((v): v is string => !!v && /^\d{13}$/.test(v)))];
  const phones = [...new Set(keys.map((k) => k.phoneNorm).filter((v): v is string => !!v))];
  const [byTax, byPhone] = await Promise.all([
    taxIds.length
      ? prisma.accountContact.findMany({
          where: { tenantId, systemId, archivedAt: null, taxId: { in: taxIds }, branchCode: "00000" },
          select: { taxId: true },
        })
      : Promise.resolve([]),
    phones.length
      ? prisma.accountContact.findMany({
          where: { tenantId, systemId, archivedAt: null, phoneNorm: { in: phones } },
          select: { phoneNorm: true },
        })
      : Promise.resolve([]),
  ]);
  return {
    taxIds: new Set(byTax.map((r) => r.taxId).filter((v): v is string => !!v)),
    phones: new Set(byPhone.map((r) => r.phoneNorm).filter((v): v is string => !!v)),
  };
}

/**
 * WO 1.8 — เอกสารที่นำเข้าไปแล้วด้วย refId ชุดนี้ (idempotency: อัปโหลดไฟล์เดิมซ้ำ → ไม่สร้างซ้ำ)
 * refId = `${fileHash}:${rowKey}` (ดู import-shared.ts fileHashOf + import-actions.ts)
 */
export async function findExistingImportRefIds(
  tenantId: string,
  systemId: string,
  refIds: string[],
): Promise<Set<string>> {
  if (refIds.length === 0) return new Set();
  const rows = await prisma.accountDocument.findMany({
    where: { tenantId, systemId, refType: "CSV_IMPORT", refId: { in: refIds } },
    select: { refId: true },
  });
  return new Set(rows.map((r) => r.refId).filter((v): v is string => !!v));
}

// ─────────────────── เลขรันเอกสาร ───────────────────
//
// 🔴 WO 8.1: ตรรกะทั้งหมดย้ายไป `doc-numbering.ts` (ที่เดียวทั้งฝั่งรายรับ/รายจ่าย)
//    ที่เหลือตรงนี้เป็นแค่ตัวห่อที่ใส่ prisma/tx ให้ — ห้ามเขียนสูตรเลขซ้ำที่นี่อีก

export type SeqReset = DocSeqReset;

/** วันที่ตามเวลาไทย (Asia/Bangkok) → ปี/เดือน (pipeline-M7: TZ ไทยเสมอ ไม่ใช่ TZ เครื่อง) */
export function bkkYearMonth(date: Date): { year: string; month: string } {
  const { year, month } = bkkParts(date);
  return { year, month };
}

async function nextDocNo(
  tx: Prisma.TransactionClient,
  tenantId: string,
  systemId: string,
  docType: AccountDocType,
  date: Date,
): Promise<string> {
  return issueDocNo(tx, {
    tenantId,
    systemId,
    docType,
    fallbackPrefix: docNoFallbackPrefix(docType),
    date,
  });
}

/**
 * เลขที่ "ถัดไป" แบบดูอย่างเดียว ฝั่งรายรับ — สำหรับโชว์บนฟอร์มร่าง (DESIGN-SPEC-V2 §5.2 B)
 * 🔴 ห้ามเขียนอะไรลง AccountDocSequence: ร่างต้องไม่กินเลข · เลขจริงจองตอน issueDocument เท่านั้น
 *    ⇒ ค่านี้เป็น "คาดว่าจะได้" ถ้ามีคนอื่นออกเอกสารก่อน เลขจริงจะขยับ (จงใจ)
 */
export async function previewNextDocNo(
  systemId: string,
  docType: AccountDocType,
  date: Date,
  override?: Partial<DocSeqConfig> | null,
): Promise<string> {
  return peekDocNo(prisma, {
    systemId,
    docType,
    fallbackPrefix: docNoFallbackPrefix(docType),
    date,
    override,
  });
}

/** คำนำหน้าปริยายของชนิดเอกสาร (รายรับ + รายจ่าย — แหล่งเดียวที่ settings-schema.ts) */
export function docNoFallbackPrefix(docType: AccountDocType): string {
  return fallbackPrefixOf(docType);
}

/** ตั้ง "เลขถัดไป" เอง (§9.2) — ปฏิเสธถ้าย้อนกลับไปทับเลขที่ออกไปแล้ว */
export async function setNextDocNo(
  tenantId: string,
  systemId: string,
  docType: AccountDocType,
  nextNo: number,
  now: Date,
): Promise<{ ok: true; nextNo: number } | { ok: false; reason: string }> {
  return setNextNo(prisma, {
    tenantId,
    systemId,
    docType,
    fallbackPrefix: docNoFallbackPrefix(docType),
    date: now,
    nextNo,
  });
}

/** ลำดับที่หายไปในงวดปัจจุบัน (§9.2 "เตือนเมื่อเลขที่เอกสารข้ามลำดับ") */
export async function docNoGaps(
  systemId: string,
  docType: AccountDocType,
  now: Date,
): Promise<number[]> {
  return findSeqGaps(prisma, {
    systemId,
    docType,
    fallbackPrefix: docNoFallbackPrefix(docType),
    date: now,
  });
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
  /**
   * WO 3.4 (ขยายแบบเข้ากันได้): เดิมรับชนิดเดียว — ตอนนี้รับ array ("แท็บเอกสาร" ของโปรไฟล์ 360°
   * ต้องดูทุกชนิดในตารางเดียว) หรือ undefined = ไม่กรองชนิด · ผู้เรียกเดิมที่ส่งค่าเดี่ยวทำงานเหมือนเดิม
   */
  docType?: AccountDocType | AccountDocType[];
  status?: DocStatusFilter;
  /** ค้นหา: เลขที่เอกสาร หรือ ชื่อผู้ติดต่อ (ไม่สนตัวพิมพ์) */
  q?: string;
  contactId?: string;
  /**
   * WO API-B1 (additive) — เอกสารที่ไหลมาจากระบบอื่น: `refType` = ชื่อโมเดลต้นทางตรงตัว ("PosSale")
   * · `refId` = id ในระบบนั้น ⇒ ผู้เชื่อมต่อภายนอกถามได้ว่า "บิลใบนี้กลายเป็นเอกสารบัญชีใบไหน"
   * โดยไม่ต้องเก็บ id ฝั่งเราเอง (C1 ใช้กันสร้างซ้ำเวลายิงเข้ามาใหม่)
   */
  refType?: string;
  refId?: string;
  /** ช่วงวันที่ออกเอกสาร (รับ Date หรือ "YYYY-MM-DD") */
  from?: Date | string;
  to?: Date | string;
  page?: number;
  /** ค่าเริ่มต้น 20 · สูงสุด 100 */
  pageSize?: number;
  sort?: DocSort;
  /** ตัดรายการที่พ้นกำหนดออก (แท็บ "รอชำระ/รอตอบรับ" ที่ไม่รวมพ้นกำหนด) */
  excludeOverdue?: boolean;
  /**
   * WO 3.4: ไม่ต้อง include ผู้ติดต่อ/การชำระ (Prisma โหลด relation ด้วย query แยกเสมอ = +2 SQL ต่อครั้ง)
   * ใช้เมื่อผู้เรียกรู้ผู้ติดต่ออยู่แล้ว เช่นแท็บ "เอกสาร" ของโปรไฟล์ 360° ที่กรอง contactId ตัวเดียว
   * ⇒ ประหยัด 2 query ต่อการเปิด 1 ครั้ง · ไม่ส่ง = พฤติกรรมเดิมเป๊ะ
   */
  slim?: boolean;
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

// WO 9.2 ข้อ 9 — ขอบเขตคำค้น: ตรรกะจริงอยู่ `search-input.ts` (บริสุทธิ์ ไม่มีวงจร import)
export { clampSearch, MAX_SEARCH_LEN } from "./search-input";

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
  const q = clampSearch(input.q);
  const from = parseDay(input.from, false);
  const to = parseDay(input.to, true);

  // base = ทุกตัวกรองยกเว้นสถานะ → ใช้ทั้งนับแท็บและนับ total ให้บวกกันลงตัว
  const base: Prisma.AccountDocumentWhereInput = {
    tenantId,
    systemId,
    ...(input.docType
      ? { docType: Array.isArray(input.docType) ? { in: input.docType } : input.docType }
      : {}),
    ...(input.contactId ? { contactId: input.contactId } : {}),
    ...(input.refType ? { refType: input.refType } : {}),
    ...(input.refId ? { refId: input.refId } : {}),
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

  const listArgs = {
    where,
    orderBy: DOC_SORT_ORDER[input.sort ?? "recent"],
    skip: (page - 1) * pageSize,
    take: pageSize,
  };
  const [rows, total, grouped, overdueCount] = await Promise.all([
    // slim = ไม่ include relation (ประหยัด 2 SQL) → เติม contact/payments เป็นค่าว่างให้ชนิดคงเดิม
    // ผู้เรียกที่ขอ slim ต้องไม่พึ่ง 2 ฟิลด์นี้ (โปรไฟล์ 360° รู้ผู้ติดต่ออยู่แล้ว)
    input.slim
      ? prisma.accountDocument
          .findMany(listArgs)
          .then((rs) => rs.map((r) => ({ ...r, contact: null, payments: [] as { channel: AccountPayChannel }[] })))
      : prisma.accountDocument.findMany({ ...listArgs, include: LIST_DOCUMENTS_INCLUDE }),
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
  const q = clampSearch(extra?.q);
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
  // WO 9.3: เดิมมี 3 คำสั่ง — คำสั่งที่ 3 คือ count() ของ "พ้นกำหนดทั้งหมด" ซึ่งเป็น **ตัวกรองเดียวกันเป๊ะ**
  // กับ groupBy ตัวที่ 2 ⇒ ผลรวมของ groupBy ตัวที่ 2 = ค่าเดียวกัน (groupBy ครอบทุก status ไม่มี take/skip)
  // ตัดทิ้ง 1 query ต่อการโหลดหน้ารายการทุกหน้า โดยตัวเลขไม่เปลี่ยน
  const [rawGroup, overdueGroup] = await Promise.all([
    prisma.accountDocument.groupBy({ by: ["status"], where: base, _count: { _all: true } }),
    prisma.accountDocument.groupBy({ by: ["status"], where: { AND: [base, overdueWhere(now)] }, _count: { _all: true } }),
  ]);
  const raw = new Map(rawGroup.map((g) => [g.status, g._count._all]));
  const overdueByStatus = new Map(overdueGroup.map((g) => [g.status, g._count._all]));
  const all = rawGroup.reduce((s, g) => s + g._count._all, 0);
  const overdueTotal = overdueGroup.reduce((s, g) => s + g._count._all, 0);

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
  const q = clampSearch(extra?.q);
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
      // WO 8.1: เทมเพลตพิมพ์ "มีรูปสินค้า"/คอลัมน์รหัสสินค้า (§9.2) ต้องใช้ sku+imageUrl ของสินค้าที่ผูกไว้
      // เลือกมาแค่ 2 ช่อง (ไม่ใช่ทั้งแถว) — ไม่กระทบผู้เรียกเดิมและไม่ลากข้อมูลเกินจำเป็น
      lines: {
        orderBy: { sortOrder: "asc" },
        include: { product: { select: { sku: true, imageUrl: true } } },
      },
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
    return { ok: false, reason: safeReason(e, "บันทึกการหักมัดจำไม่สำเร็จ") };
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
  /** 🐞 WO 4.3: เดิมชนิดเป็น `LineInput[]` เฉย ๆ ⇒ `productId`/`accountId` ที่ฟอร์ม V2 ส่งมาถูกทิ้งเงียบ ๆ
   *  (บรรทัดเอกสารขายที่ทำด้วยมือไม่เคยผูกทะเบียนสินค้าเลย — รายงาน "ขายอะไรดี" เห็นแต่บิล POS
   *   และ "รายการจัดชุด" ตัดสต็อกส่วนประกอบไม่ได้) — รับเข้ามาและบันทึกจริงแล้ว */
  lines: (LineInput & { productId?: string | null; accountId?: string | null })[];
  createdById?: string | null;
  sourceDocId?: string | null;
  // ── WO 1.8 (นำเข้า CSV) · additive · optional — ไม่ส่ง = พฤติกรรมเดิมเป๊ะ (source MANUAL, tags []) ──
  source?: AccountDocSource;
  tags?: string[];
  /** กุญแจกันนำเข้าซ้ำ (refType="CSV_IMPORT" · refId=`${fileHash}:${rowKey}`) — ดู import-actions.ts */
  refType?: string | null;
  refId?: string | null;
}) {
  const settings = await getSettings(input.tenantId, input.systemId);
  // A3: ไม่จด VAT → บังคับ vatMode NONE (ไม่มีบรรทัด VAT)
  const vatMode: AccountVatMode = !settings.vatRegistered
    ? "NONE"
    : input.vatMode ?? "EXCLUDE";
  // A1: จุดรับรู้ภาษี — ต่อใบ (form) หรือ default ตามประเภทกิจการ
  const vatTiming: AccountVatTiming = input.vatTiming ?? settings.taxPointBasis;
  const issueDate = input.issueDate ?? new Date();
  // §9.3 ล็อกข้อมูลก่อนวันที่ — ร่างก็ห้าม (ไม่งั้นผู้ใช้กรอกเสร็จแล้วค่อยเด้งตอนกดออกเอกสาร)
  assertNotLockedWith(settings.policy.lockBeforeDate, issueDate);

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
        source: input.source ?? "MANUAL",
        tags: input.tags ?? [],
        refType: input.refType ?? null,
        refId: input.refId ?? null,
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
            // 🐞 WO 4.3 — ผูกทะเบียนสินค้า/บัญชี GL ของบรรทัด (เดิมหล่นหาย ดูหมายเหตุที่ชนิดของ `lines`)
            productId: l.productId ?? null,
            accountId: l.accountId ?? null,
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
    lines?: (LineInput & { productId?: string | null; accountId?: string | null })[];
  },
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const settings = await getSettings(tenantId, systemId);
  try {
    await prisma.$transaction(async (tx) => {
      const doc = await tx.accountDocument.findFirst({ where: { id, tenantId, systemId } });
      if (!doc) throw new Error("ไม่พบเอกสาร");
      if (doc.status !== "DRAFT") throw new Error("เอกสารที่ออกแล้วแก้ไขไม่ได้ — ใช้ยกเลิก/ออกใบใหม่");
      // §9.3: ล็อกทั้ง "วันที่เดิม" และ "วันที่ใหม่" — กันย้ายเอกสารเข้า/ออกจากช่วงที่ล็อก
      assertNotLockedWith(settings.policy.lockBeforeDate, doc.issueDate);
      if (input.issueDate) assertNotLockedWith(settings.policy.lockBeforeDate, input.issueDate);
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
            productId: l.productId ?? null,
            accountId: l.accountId ?? null,
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
    return { ok: false, reason: safeReason(e, "แก้ไขไม่สำเร็จ") };
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
      // WO 9.2 ข้อ 14 — กดปุ่ม "ออกเอกสาร" รัว 2 ครั้ง: ไม่มีล็อก = ผ่านด่าน DRAFT ทั้งคู่
      //                  → กินเลขที่เอกสาร 2 เลข (เลขหาย 1 ตัวโดยไม่มีใบ)
      await lockDocumentRow(tx, tenantId, systemId, id);
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

      // ── WO 4.3 (§8.2 รายการจัดชุด): ขายชุด = ตัดสต็อก "ส่วนประกอบ" ใน tx เดียวกับเอกสาร ──
      //    เฉพาะเอกสารที่ถือว่า "ส่งมอบของ" = ใบแจ้งหนี้/ใบส่งของ · ใบเสร็จขายสด
      //    ใบเสร็จที่แปลงมาจากใบแจ้งหนี้ = ของถูกส่งมอบไปแล้วตอน IV ⇒ ข้าม (ไม่ตัดซ้ำ)
      //    ใบกำกับภาษีที่ออกตามหลัง IV ก็ไม่ตัดซ้ำเช่นกัน (ไม่อยู่ในรายชื่อนี้)
      if (doc.docType === "INVOICE" || (doc.docType === "RECEIPT" && !doc.sourceDocId)) {
        await consumeBundleComponentsInTx(tx, ctx, id);
      }
    });
    return { ok: true, docNo };
  } catch (e) {
    return { ok: false, reason: safeReason(e, "ออกเอกสารไม่สำเร็จ") };
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
    // §9.3 ล็อกข้อมูลก่อนวันที่ — เอกสารปลายทางลงวันที่ "วันนี้" เสมอ จึงตรวจที่วันนี้
    assertNotLockedWith(settings.policy.lockBeforeDate, new Date());
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
          // §9.3 "การออกเอกสารต่อ": คัดลอกหมายเหตุ/แท็กตามที่ตั้งไว้
          // 🐞 ของเดิมคัดลอก note เสมอ และ **ไม่เคยคัดลอก tags เลย** (แท็กหายทุกครั้งที่แปลงเอกสาร)
          note: settings.policy.copyNotesOnConvert ? source.note : null,
          tags: settings.policy.copyTagsOnConvert ? source.tags : [],
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
    return { ok: false, reason: safeReason(e, "แปลงเอกสารไม่สำเร็จ") };
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

/**
 * ล็อกแถวเอกสาร 1 ใบภายใน transaction (`SELECT … FOR UPDATE`) — WO 9.2 ข้อ 12/14
 *
 * 🔴 ทำไมต้องมี: Postgres ของเราอยู่ระดับ READ COMMITTED ⇒ `findFirst` ใน tx **ไม่กัน**
 *    คำขอที่มาพร้อมกันจากการอ่านค่าเดียวกัน · ทุกที่ที่ตัดสินใจจากยอด/สถานะที่เพิ่งอ่าน
 *    (รับชำระ · ยกเลิกชำระ · ยกเลิกเอกสาร) ต้องล็อกแถวก่อน ไม่งั้นด่านเช็คผ่านได้ทั้งคู่
 * 🔴 ต้องเรียก **ก่อน** อ่านข้อมูลของเอกสารเสมอ · ล็อกจะถูกปล่อยเมื่อ tx จบ (commit/rollback)
 *    ผูก tenantId+systemId ไว้ด้วยเพื่อไม่ให้ id จากร้านอื่นมาจับล็อกแถวเราได้
 */
async function lockDocumentRow(
  tx: Prisma.TransactionClient,
  tenantId: string,
  systemId: string,
  id: string,
): Promise<void> {
  await tx.$queryRaw`SELECT "id" FROM "AccountDocument"
    WHERE "id" = ${id} AND "tenantId" = ${tenantId} AND "systemId" = ${systemId} FOR UPDATE`;
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
    /** WO 5.5: รับเงินใบนี้มาจากคำขอชำระเงิน (ลิงก์+QR PromptPay) ใบไหน — null = ทางเรียกเดิมทั้งหมด */
    paymentRequestId?: string | null;
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
      // 🔴 WO 9.2 ข้อ 12 — ล็อกแถวเอกสารก่อนอ่านยอด (SELECT … FOR UPDATE)
      //    ก่อนหน้านี้ 2 คำขอที่มาพร้อมกันอ่าน `paidTotal` ค่าเดียวกัน (READ COMMITTED) แล้ว
      //    **ผ่านด่าน "ยอดชำระเกินยอดคงเหลือ" ทั้งคู่** → ได้ payment 2 ใบเต็มยอด + JV 2 ชุด
      //    (วัดจริงด้วย Promise.all ใน qc-acc-v2-security S12) · ล็อกที่นี่ทำให้คำขอที่สอง
      //    รอจน tx แรก commit แล้วค่อยอ่าน paidTotal ที่อัปเดตแล้ว → ตกด่านตามที่ควรเป็น
      await lockDocumentRow(tx, tenantId, systemId, id);
      const doc = await tx.accountDocument.findFirst({ where: { id, tenantId, systemId } });
      if (!doc) throw new Error("ไม่พบเอกสาร");
      if (!["AWAITING_PAYMENT", "PARTIAL"].includes(doc.status))
        throw new Error("เอกสารนี้รับชำระไม่ได้ในสถานะปัจจุบัน");
      // §9.3 ล็อกข้อมูลก่อนวันที่ — ตรวจที่ "วันที่รับเงิน" (บอกก่อนสร้างแถว payment จะได้ไม่ต้องม้วนกลับ)
      assertNotLockedWith(settings.policy.lockBeforeDate, input.paidAt ?? new Date());
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
          paymentRequestId: input.paymentRequestId ?? null,
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
        //    WO 8.1 (§9.2): เคารพนโยบาย "ออกใบกำกับภาษีอัตโนมัติเมื่อ …" ของหน้าตั้งค่า
        //    ค่าเริ่มต้น = ON_PAYMENT ⇒ ร้านที่ไม่เคยแตะตั้งค่า พฤติกรรมเหมือนเดิมเป๊ะ
        //    MANUAL/ON_INVOICE = ไม่ออกให้อัตโนมัติตอนรับเงิน (staff กดออกเองจากหน้าเอกสาร)
        if (
          settings.vatRegistered &&
          settings.doc.autoTaxInvoice.mode === "ON_PAYMENT" &&
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
      // ── WO 8.3 (§9.5 "แอปภายนอก/API"): เหตุการณ์บัญชีออกทาง webhook ของแพลตฟอร์ม ──
      //    emit ใน tx เดียวกับการชำระ (transactional outbox) ⇒ เงินรอด = event รอด · idempotent ต่อ paymentId
      // 🔴 WO 9.3: เดิมเรียก emitOutbox ทีละตัว = 2 คำสั่ง/event (findUnique + create) → สูงสุด 4 คำสั่ง
      //    ใน tx ที่ล็อกแถวเอกสารอยู่ (WO 9.2 เพิ่มการล็อกกันรับชำระซ้อน) ⇒ ยิงชุดเดียว 1 คำสั่งแทน
      //    ทั้ง 2 ชนิดยังแยกกันเหมือนเดิม (ผู้สมัคร webhook คนละรายการ) — เปลี่ยนแค่วิธีเขียนลงตาราง
      await emitOutboxMany(tx, [
        {
          tenantId,
          type: "account.payment.recorded",
          idempotencyKey: `account.payment.recorded#${payment.id}`,
          payload: { documentId: id, paymentId: payment.id, amountSatang: input.amount, docType: doc.docType },
          systemId,
        },
        ...(status === "PAID" && doc.docType === "INVOICE"
          ? [
              {
                tenantId,
                type: "account.invoice.paid",
                idempotencyKey: `account.invoice.paid#${id}`,
                payload: { documentId: id, docNo: doc.docNo, grandTotalSatang: doc.grandTotal },
                systemId,
              },
            ]
          : []),
      ]);
    });
    return { ok: true, status, paymentId, whtCertNo };
  } catch (e) {
    return { ok: false, reason: safeReason(e, "บันทึกชำระไม่สำเร็จ") };
  }
}

// ─────────────────── WO 8.3 (§9.5) — เหตุการณ์บัญชีสำหรับ webhook ขาออก ───────────────────
//
// 🔴 เพิ่ม event ใหม่ **ต้องลงทะเบียน consumer** ที่ `src/lib/outbox-consumers.ts` ด้วยเสมอ
//    ไม่งั้น event ค้าง PENDING ตลอดกาล + webhook ไม่เคยถูกยิง (บทเรียน 30 ส.ค. — ติ๊กคู่ ✓✓ ไม่ขึ้น)
//    และป้ายไทยต้องอยู่ใน `src/lib/webhooks/labels.ts` ไม่งั้นร้านเลือกสมัครไม่ได้
export async function emitAccountEvent(input: {
  tenantId: string;
  systemId: string;
  type: "account.document.approved" | "account.period.closed";
  idempotencyKey: string;
  payload: Record<string, unknown>;
}): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await emitOutbox(tx, {
      tenantId: input.tenantId,
      type: input.type,
      idempotencyKey: input.idempotencyKey,
      payload: input.payload,
      systemId: input.systemId,
    });
  });
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
      // WO 9.2 ข้อ 14 — ล็อกแถวเอกสารก่อน (กดยกเลิกรัว 2 ครั้งพร้อมกันเคยลด paidTotal ซ้ำสองได้)
      await lockDocumentRow(tx, tenantId, systemId, documentId);
      const pay = await tx.accountDocumentPayment.findFirst({
        where: { id: paymentId, documentId, tenantId, systemId },
      });
      if (!pay) throw new Error("ไม่พบรายการชำระ");
      if (pay.voidedAt) throw new Error("รายการชำระนี้ถูกยกเลิกแล้ว");
      // §9.3 (เหตุผลเดียวกับ voidDocument — reversal เลื่อนวันได้ ด่าน gl จึงจับไม่ถึง)
      await assertNotLockedTx(tx, systemId, pay.paidAt);
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
    return { ok: false, reason: safeReason(e, "ยกเลิกการชำระไม่สำเร็จ") };
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
    return { ok: false, reason: safeReason(e, "คืนมัดจำไม่สำเร็จ") };
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
  /** WO API-B1 (additive): id ของช่องทางเงิน — REST คืน `financeAccount { id, name }` ให้ผู้เรียกอ้างต่อได้ */
  financeAccountId: string | null;
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
  // 🔴 WO 9.3: เดิม select ซ้อน `financeAccount` / `cheque` (relation to-one ที่เป็น null ได้)
  //    Prisma ยิง query ของ relation **เสมอ** แม้ทุกแถวจะมี FK = null → ได้ `WHERE id IN (NULL)`
  //    เปล่า ๆ 2 คำสั่งต่อการเปิดหน้าเอกสาร 1 ครั้ง ⇒ ดึงแค่ FK แล้วค่อยไปหาชื่อเมื่อ "มีของให้หา"
  const rows = await prisma.accountDocumentPayment.findMany({
    where: { documentId, tenantId, systemId },
    // 🔴 WO 9.3: เดิมเรียงด้วย paidAt อย่างเดียว — แต่ paidAt เก็บเป็น "วันที่" (เที่ยงคืน) ⇒ รับชำระ
    //    2 ครั้งในวันเดียวกันมีค่าเท่ากันเป๊ะ = ไม่มีตัวตัดสิน ⇒ Postgres คืนลำดับตามใจ
    //    ผลกับผู้ใช้: ตารางการชำระเงินบนหน้าเอกสาร "สลับแถวเอง" ระหว่างการโหลดแต่ละครั้ง
    //    ผลกับข้อสอบ: qc-acc-v2-payments P1.17–P1.19/P7.8/P7.9 แดงเป็นครั้งคราว (flaky ที่ 1.7/8.1/8.3 จดไว้)
    orderBy: [{ paidAt: "asc" }, { createdAt: "asc" }, { id: "asc" }],
    select: {
      id: true, paidAt: true, channel: true, amount: true, whtAmountSatang: true, feeAmount: true,
      note: true, voidedAt: true, whtCertDocId: true, createdById: true,
      financeAccountId: true, chequeId: true,
    },
  });
  const certIds = rows.map((r) => r.whtCertDocId).filter((x): x is string => !!x);
  const financeIds = [...new Set(rows.map((r) => r.financeAccountId).filter((x): x is string => !!x))];
  const chequeIds = [...new Set(rows.map((r) => r.chequeId).filter((x): x is string => !!x))];
  const [certs, financeRows, chequeRows] = await Promise.all([
    certIds.length
      ? prisma.accountDocument.findMany({
          where: { id: { in: certIds }, tenantId, systemId },
          select: { id: true, docNo: true },
        })
      : Promise.resolve([]),
    financeIds.length
      ? prisma.accountFinance.findMany({ where: { id: { in: financeIds }, tenantId, systemId }, select: { id: true, name: true } })
      : Promise.resolve([]),
    chequeIds.length
      ? prisma.accountCheque.findMany({ where: { id: { in: chequeIds }, tenantId, systemId }, select: { id: true, chequeNo: true } })
      : Promise.resolve([]),
  ]);
  const certNo = new Map(certs.map((c) => [c.id, c.docNo]));
  const financeName = new Map(financeRows.map((f) => [f.id, f.name]));
  const chequeNo = new Map(chequeRows.map((c) => [c.id, c.chequeNo]));
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
    financeAccountId: p.financeAccountId,
    financeName: p.financeAccountId ? (financeName.get(p.financeAccountId) ?? null) : null,
    amount: p.amount,
    whtAmount: p.whtAmountSatang,
    feeAmount: p.feeAmount,
    note: p.note,
    chequeNo: p.chequeId ? (chequeNo.get(p.chequeId) ?? null) : null,
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
    return { ok: false, reason: safeReason(e, "ผูกรายการรับเงินไม่สำเร็จ") };
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
      // WO 9.2 ข้อ 14 — ล็อกแถวก่อนอ่านสถานะ (กดยกเลิกพร้อมกัน 2 ครั้ง = กลับรายการซ้ำ)
      await lockDocumentRow(tx, tenantId, systemId, id);
      const doc = await tx.accountDocument.findFirst({ where: { id, tenantId, systemId } });
      if (!doc) throw new Error("ไม่พบเอกสาร");
      if (doc.status === "VOIDED" || doc.status === "CANCELLED")
        throw new Error("เอกสารถูกยกเลิกแล้ว");
      // §9.3: ยกเลิกเอกสารที่ลงวันที่ในช่วงล็อกไม่ได้
      // 🔴 ด่านใน gl.commitEntry จับเคสนี้ไม่ได้ เพราะ reversal เลื่อนวันไปงวดเปิดถัดไปแล้ว
      await assertNotLockedTx(tx, systemId, doc.issueDate);
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
    return { ok: false, reason: safeReason(e, "ยกเลิกเอกสารไม่สำเร็จ") };
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

// ─────────────────── WO 5.5 · ตัวเข้าถึง "คำขอชำระเงิน" ที่ยังไม่รู้ร้าน ───────────────────
//
// 🔴 3 ทางเข้านี้ **ไม่มี tenant/system มาก่อน** โดยธรรมชาติของงาน:
//    webhook ของผู้ให้บริการ (รู้แค่ chargeId/referenceId) · ลิงก์สาธารณะ (รู้แค่ token) · cron หมดอายุ (ทั้งระบบ)
//    ⇒ ต้องอ่าน/เขียนโดยไม่ผูก scope · ตัว token (128 บิต) และ referenceId คือ capability
//    วางไว้ที่นี่ (ชั้นข้อมูลของโมดูล) เพื่อให้ `payment-request.ts` เป็นตัวประสานล้วน ไม่แตะ prisma ดิบ
//    (กติกาเดียวกับ payment.ts ของ WO 1.4)

/** คำขอชำระเงิน 1 ใบจาก id — ใช้โดย webhook (referenceId = "acc:<id>") */
export async function findPaymentRequestById(id: string) {
  return prisma.accountPaymentRequest.findUnique({ where: { id } });
}

/** คำขอชำระเงิน 1 ใบจาก token สาธารณะ + หัวเอกสารเท่าที่หน้าสาธารณะต้องใช้ (ห้ามดึงข้อมูลลูกค้า) */
export async function findPaymentRequestByToken(token: string) {
  return prisma.accountPaymentRequest.findUnique({
    where: { token },
    select: {
      token: true,
      tenantId: true,
      systemId: true,
      amountSatang: true,
      method: true,
      qrPayload: true,
      status: true,
      expiresAt: true,
      paidAt: true,
      paidAmountSatang: true,
      document: { select: { docType: true, docNo: true } },
    },
  });
}

/** ปิดคำขอที่เลยวันหมดอายุทั้งระบบ (cron) — ปลอดภัยต่อการรันซ้ำ (แตะเฉพาะแถวที่ยัง PENDING) */
export async function expirePaymentRequestsAll(now: Date): Promise<number> {
  const res = await prisma.accountPaymentRequest.updateMany({
    where: { status: "PENDING", expiresAt: { lt: now } },
    data: { status: "EXPIRED" },
  });
  return res.count;
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
  // ── WO 8.1 (§9.2 "การแสดงข้อมูลสาธารณะ" + "ลิงก์ให้ลูกค้าขอใบกำกับ") ──
  /** ยอดค้างชำระ (สตางค์) — null = ตั้งค่าปิดไม่ให้แสดง */
  outstandingSatang: number | null;
  /** token ของคำขอชำระที่ยังเปิดอยู่ (ปุ่มจ่าย PromptPay) — null = ปิดไว้/ไม่มีคำขอ */
  payToken: string | null;
  /** เปิดให้ลูกค้ากรอกขอใบกำกับภาษีเองไหม */
  taxRequestEnabled: boolean;
  /** ข้อความ/เงื่อนไขที่เจ้าของตั้งไว้ให้แสดงบนหน้านี้ */
  taxRequestNote: string;
} | null> {
  const doc = await prisma.accountDocument.findFirst({
    where: { publicToken: token },
    select: {
      id: true, tenantId: true, systemId: true, docType: true, docNo: true,
      issueDate: true, grandTotal: true, paidTotal: true, status: true,
    },
  });
  if (!doc) return null;
  if (!PUBLIC_TAX_SOURCE.includes(doc.docType)) return null;
  const settings = await getSettings(doc.tenantId, doc.systemId);
  const pub = settings.doc.publicView;
  // ปิดลิงก์สาธารณะทั้งระบบ = ปฏิบัติเหมือน token ไม่ถูกต้อง (ไม่บอกใบ้ว่ามีเอกสารอยู่จริง)
  if (!pub.enabled) return null;
  // อายุลิงก์: 0 = ไม่หมดอายุ · เกินกำหนดนับจากวันที่ออกเอกสาร = ปิด
  if (pub.expiryDays > 0 && Date.now() - doc.issueDate.getTime() > pub.expiryDays * 86_400_000) return null;
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
  // ปุ่มจ่าย PromptPay (§9.2) — ใช้คำขอชำระที่ยัง PENDING และยังไม่หมดอายุของเอกสารใบนี้
  const payReq =
    pub.promptPayButton && doc.grandTotal > doc.paidTotal
      ? await prisma.accountPaymentRequest.findFirst({
          where: { systemId: doc.systemId, documentId: doc.id, status: "PENDING", expiresAt: { gt: new Date() } },
          orderBy: { createdAt: "desc" },
          select: { token: true },
        })
      : null;
  const payToken = payReq?.token ?? null;
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
    outstandingSatang: pub.showOutstanding ? Math.max(0, doc.grandTotal - doc.paidTotal) : null,
    payToken: payToken,
    taxRequestEnabled: settings.doc.taxRequest.enabled,
    taxRequestNote: settings.doc.taxRequest.conditionNote,
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
    // 🔴 WO 9.2 ข้อ 4 — ด่านเดียวกับที่ `getPublicTaxContext` ใช้ซ่อนฟอร์ม **ต้องมีที่นี่ด้วย**
    //    ของเดิมตรวจแค่ตอนเรนเดอร์หน้า ⇒ ใครก็ยิง server action ตรงด้วย token เก่าได้
    //    (ปิดลิงก์สาธารณะ/ปิดคำขอใบกำกับ/ลิงก์หมดอายุแล้ว ก็ยังสร้างคำขอ DRAFT ได้เงียบ ๆ)
    //    ข้อความเดียวกับตอน token ผิด — ไม่บอกใบ้ว่ามีเอกสารอยู่จริง
    const pub = settings.doc.publicView;
    if (!pub.enabled) return { ok: false, reason: "ลิงก์ไม่ถูกต้องหรือหมดอายุ" };
    if (pub.expiryDays > 0 && Date.now() - source.issueDate.getTime() > pub.expiryDays * 86_400_000)
      return { ok: false, reason: "ลิงก์ไม่ถูกต้องหรือหมดอายุ" };
    if (!settings.doc.taxRequest.enabled)
      return { ok: false, reason: "ร้านนี้ปิดการขอใบกำกับภาษีผ่านลิงก์อยู่ — ติดต่อร้านค้าโดยตรง" };
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
    // 🔴 WO 9.2 ข้อ 4 — หน้านี้เป็น "สาธารณะ" ⇒ ห้ามคืนข้อความ error ดิบ (ของเดิมส่ง `e.message`
    //    ของ Prisma ออกไปเลย = ชื่อตาราง/คอลัมน์/ข้อจำกัดรั่วให้คนนอกอ่าน) · ของจริงลง log ฝั่งเรา
    console.error(
      `[account] issuePublicTaxInvoice ล้มเหลว — ${e instanceof Error ? e.name || "Error" : "unknown"}`,
    );
    return { ok: false, reason: "ขอใบกำกับไม่สำเร็จ — กรุณาลองใหม่หรือติดต่อร้านค้า" };
  }
}

// ── helpers สำหรับ facade (index.ts ห้าม import prisma ตรง — F5) · WO-0010 ──
export async function findAccountLinkFor(
  tenantId: string,
  linkedKind: AccountLinkedKind,
  linkedId: string,
) {
  // WO 8.3: กรอง enabled ด้วย (ดูเหตุผลที่ findAccountLinkForPos)
  return prisma.accountSystemLink.findFirst({
    where: { tenantId, linkedKind, linkedId, archivedAt: null, enabled: true },
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
): Promise<{ id: string; partyId: string | null } | null> {
  const norm = normalizePhoneTh(phone);
  if (norm.length < 8) return null; // สั้นเกินกว่าจะเป็นกุญแจตัวตน
  const hit = await prisma.accountContact.findFirst({
    where: { systemId, archivedAt: null, phoneNorm: norm },
    select: { id: true, partyId: true },
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
): Promise<{ id: string; partyId: string | null } | null> {
  const filled = await prisma.accountContact.count({
    where: { systemId, archivedAt: null, phoneNorm: { not: null } },
  });
  if (filled > 0) return null; // ระบบนี้ backfill แล้ว → ทางหลักคือคำตอบสุดท้าย
  const rows = await prisma.accountContact.findMany({
    where: { systemId, archivedAt: null, NOT: { phone: null } },
    select: { id: true, phone: true, partyId: true },
    orderBy: { createdAt: "asc" },
    take: 5000, // เพดานเดิมของ WO 0.2 — คงไว้เฉพาะทางสำรองนี้ (กันโหลดทั้งตารางถ้ายังไม่ backfill)
  });
  const found = rows.find((r) => normalizePhoneTh(r.phone) === norm);
  return found ? { id: found.id, partyId: found.partyId } : null;
}

/**
 * WO 3.1 — ผู้ติดต่อที่จับคู่ได้แล้วแต่ยังไม่มี partyId (สร้างก่อน WO นี้) → เติมให้ (backfill on read)
 * ล้มเหลว = เงียบ (ยังคืนผู้ติดต่อเดิมได้ตามปกติ — ไม่ block การออกเอกสาร)
 */
async function backfillContactPartyId(
  ctx: { tenantId: string; systemId: string },
  contact: { id: string; partyId: string | null },
  c: { name: string; phone?: string | null; email?: string | null; taxId?: string | null; branchCode?: string | null },
): Promise<{ id: string }> {
  if (contact.partyId) return { id: contact.id };
  const partyId = await party.safeFindOrCreate(ctx.tenantId, {
    name: c.name,
    phone: c.phone ?? null,
    email: c.email ?? null,
    taxId: c.taxId ?? null,
    branchCode: c.branchCode ?? null,
  });
  if (partyId) {
    await prisma.accountContact.updateMany({
      where: { id: contact.id, systemId: ctx.systemId },
      data: { partyId },
    });
  }
  return { id: contact.id };
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
    /** WO 3.1 (MAP §F.5) — ผู้เรียก (เช่น CRM) รู้ partyId ของผู้ติดต่อฝั่งตัวเองอยู่แล้ว → ใช้เป็นกุญแจแรก */
    partyId?: string | null;
  },
) {
  // (0) partyId ที่ผู้เรียกส่งมา — ถ้าเคยออกเอกสารให้ตัวตนนี้ในระบบบัญชีนี้แล้ว ใช้ผู้ติดต่อเดิม
  if (c.partyId) {
    const byParty = await prisma.accountContact.findFirst({
      where: { systemId: ctx.systemId, archivedAt: null, partyId: c.partyId },
      select: { id: true },
      orderBy: { createdAt: "asc" },
    });
    if (byParty) return byParty;
  }

  // (1) เลขผู้เสียภาษี + สาขา
  const taxId = normalizeTaxId(c.taxId);
  if (taxId) {
    const branchCode = c.branchCode || "00000";
    const byTax = await prisma.accountContact.findFirst({
      where: { systemId: ctx.systemId, archivedAt: null, taxId, branchCode },
      select: { id: true, partyId: true },
      orderBy: { createdAt: "asc" },
    });
    if (byTax) return backfillContactPartyId(ctx, byTax, c);
  }

  // (2) เบอร์โทร (normalize)
  if (c.phone) {
    const byPhone = await findContactByPhoneNorm(ctx.systemId, c.phone);
    if (byPhone) return backfillContactPartyId(ctx, byPhone, c);
  }

  // (3) ชื่อ + อีเมล ต้องตรงทั้งคู่ (ชื่ออย่างเดียวไม่พอ — ชื่อซ้ำกันได้)
  const email = (c.email ?? "").trim();
  if (email) {
    const byNameEmail = await prisma.accountContact.findFirst({
      where: { systemId: ctx.systemId, archivedAt: null, name: c.name, email },
      select: { id: true, partyId: true },
      orderBy: { createdAt: "asc" },
    });
    if (byNameEmail) return backfillContactPartyId(ctx, byNameEmail, c);
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
    partyId: c.partyId ?? undefined,
  } as Parameters<typeof createContact>[0]);
}
export async function setDocExternalRef(docId: string, ref: { refSystemId: string; refType: string; refId: string }) {
  await prisma.accountDocument.update({ where: { id: docId }, data: ref });
}

// ═══════════════════════════════════════════════════════════════
// WO 4.2 (MAP §F.13) — เอกสารบัญชีของ "บิลขายหน้าร้าน" (POS)
//
// ทำไมต้องมีเอกสาร: JV ของ POS (postExternalSale) รู้แค่ยอดรวม ⇒ รายงาน "ขายอะไรดี/ขายใคร" (§4 บล็อก 8)
//   มองไม่เห็นยอดขาย POS เลย · เอกสารใบนี้เก็บ **บรรทัดสินค้า + ผู้ติดต่อ** ให้รายงานอ่านได้
//
// ชนิดเอกสาร = `TAX_INVOICE_ABB` (ใบกำกับอย่างย่อ — ชนิดที่ schema จองไว้ให้ "POS link" ตั้งแต่ baseline)
//   🔴 เหตุผลที่ไม่ใช้ RECEIPT: `gl.postDocument` โพสต์ GL ให้ RECEIPT ⇒ ถ้าใครกดออก/รับชำระใบนั้นซ้ำ
//      รายได้จะเข้า 2 เท่า (JV ของ POS ลงไปแล้ว) · `TAX_INVOICE_ABB` อยู่ในชุด NO_GL ของ postDocument
//      ⇒ **โครงสร้างเองกันการโพสต์ซ้ำ** ไม่ต้องพึ่งวินัยของผู้ใช้
// เอกสารนี้ **ไม่โพสต์ GL** — เงินเข้าบัญชีทาง `gl.postExternalSale` เส้นเดิมเท่านั้น
export const EXTERNAL_SALE_DOC_TYPE: AccountDocType = "TAX_INVOICE_ABB";
export const EXTERNAL_SALE_REF_TYPE = "PosSale";

export type ExternalSaleDocLine = {
  description: string;
  qty: number;
  unitPrice: number; // สตางค์/หน่วย (ราคาที่ขายจริงหน้าร้าน = รวม VAT เมื่อร้านจด VAT)
  discount?: number; // ส่วนลดของบรรทัด (สตางค์) — รวมส่วนลดท้ายบิลที่ผู้เรียกเกลี่ยลงมาแล้ว
  vatRateBp?: number | null;
  unitName?: string | null;
  productId?: string | null; // ทะเบียนสินค้าฝั่งบัญชี (null = รายการที่ไม่มีในทะเบียน)
};

/**
 * สร้างเอกสารบิล POS **ครั้งเดียวต่อ PosSale** (idempotent ต่อ systemId+docType+refType+refId)
 * เรียกซ้ำ = ได้ใบเดิม ไม่มีบรรทัดเพิ่ม · ยอดรวมของเอกสารต้องเท่ากับยอดบิลเป๊ะ ไม่งั้นไม่สร้าง
 */
export async function upsertExternalSaleDocument(input: {
  tenantId: string;
  systemId: string;
  refSystemId: string; // AppSystem.id ของ POS ต้นทาง
  refId: string; // PosSale.id
  docNo?: string | null; // เลขใบเสร็จของ POS (ใช้ซ้ำได้ถ้ายังไม่ถูกใช้ในสมุดเล่มนี้)
  occurredAt: Date;
  contactId: string | null; // null = ลูกค้าเดินเข้าร้าน (walk-in) — รายงานแสดง "ไม่ระบุคู่ค้า"
  vatMode: AccountVatMode;
  vatRegistered: boolean;
  vatRateBp: number;
  grandTotalSatang: number;
  note?: string | null;
  lines: ExternalSaleDocLine[];
}): Promise<{ ok: true; docId: string; created: boolean } | { ok: false; reason: string }> {
  const existing = await findDocByRef(input.systemId, EXTERNAL_SALE_DOC_TYPE, EXTERNAL_SALE_REF_TYPE, input.refId);
  if (existing) return { ok: true, docId: existing.id, created: false };

  if (input.lines.length === 0) return { ok: false, reason: "บิลไม่มีรายการสินค้า — ไม่สร้างเอกสาร" };
  const totals = computeTotals({
    lines: input.lines.map((l) => ({
      description: l.description,
      qty: l.qty,
      unitPrice: l.unitPrice,
      discount: l.discount ?? 0,
      vatRateBp: l.vatRateBp ?? undefined,
    })),
    vatMode: input.vatMode,
    vatRegistered: input.vatRegistered,
    vatRateBp: input.vatRateBp,
  });
  // ด่านสุดท้าย (ผู้เรียกตรวจมาแล้วชั้นหนึ่ง) — ยอดเอกสารต้องเท่าบิลเป๊ะ ไม่งั้นบัญชีกับหน้าร้านไม่ตรงกัน
  if (totals.grandTotal !== input.grandTotalSatang)
    return {
      ok: false,
      reason: `ยอดรวมของบรรทัด (${totals.grandTotal}) ไม่เท่ากับยอดบิล (${input.grandTotalSatang}) — ไม่สร้างเอกสารบิลขายหน้าร้าน`,
    };

  const contact = input.contactId
    ? await prisma.accountContact.findFirst({
        where: { id: input.contactId, systemId: input.systemId },
        select: { name: true, taxId: true, legalType: true, branchCode: true, branchName: true, address: true, phone: true, email: true },
      })
    : null;

  try {
    const doc = await prisma.$transaction(async (tx) => {
      // กันเบิ้ลอีกชั้นภายใน tx (drain 2 ตัวชนกันตอน lease หมดอายุ)
      const again = await tx.accountDocument.findFirst({
        where: { systemId: input.systemId, docType: EXTERNAL_SALE_DOC_TYPE, refType: EXTERNAL_SALE_REF_TYPE, refId: input.refId },
        select: { id: true },
      });
      if (again) return { id: again.id, created: false };

      // เลขที่เอกสาร = เลขใบเสร็จ POS ถ้ายังว่างในสมุดเล่มนี้ (ไม่กินเลขรันของบัญชี) · ชนกัน = ปล่อยว่าง
      let docNo: string | null = (input.docNo ?? "").trim() || null;
      if (docNo) {
        const dup = await tx.accountDocument.findFirst({
          where: { systemId: input.systemId, docType: EXTERNAL_SALE_DOC_TYPE, docNo },
          select: { id: true },
        });
        if (dup) docNo = null;
      }

      const created = await tx.accountDocument.create({
        data: {
          tenantId: input.tenantId,
          systemId: input.systemId,
          docType: EXTERNAL_SALE_DOC_TYPE,
          docNo,
          status: "PAID", // ขายสด = รับเงินครบตั้งแต่ออกบิล
          direction: "OUT",
          issueDate: input.occurredAt,
          contactId: input.contactId,
          contactSnapshot: contact ?? undefined,
          vatMode: input.vatMode,
          vatTiming: "ON_ISSUE",
          taxPointBasis: "ON_ISSUE",
          subTotal: totals.subTotal,
          vatAmount: totals.vatAmount,
          grandTotal: totals.grandTotal,
          paidTotal: totals.grandTotal,
          source: "POS",
          refSystemId: input.refSystemId,
          refType: EXTERNAL_SALE_REF_TYPE,
          refId: input.refId,
          note: input.note ?? null,
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
              vatRateBp: l.vatRateBp ?? input.vatRateBp,
              amount: lineAmount({ description: l.description, qty: l.qty, unitPrice: l.unitPrice, discount: l.discount ?? 0 }),
              productId: l.productId ?? null,
            })),
          },
        },
        select: { id: true },
      });
      return { id: created.id, created: true };
    });
    return { ok: true, docId: doc.id, created: doc.created };
  } catch (e) {
    return { ok: false, reason: safeReason(e, "สร้างเอกสารบิลขายหน้าร้านไม่สำเร็จ") };
  }
}

/** ยกเลิกเอกสารบิล POS เมื่อบิลถูก void — กลับสถานะเป็น VOIDED (ไม่ลบบรรทัด · ไม่มี GL ให้กลับ) */
export async function voidExternalSaleDocument(
  tenantId: string,
  systemId: string,
  refId: string,
  reason: string,
): Promise<{ voided: boolean; reason?: string }> {
  const doc = await findDocByRef(systemId, EXTERNAL_SALE_DOC_TYPE, EXTERNAL_SALE_REF_TYPE, refId);
  if (!doc) return { voided: false, reason: "ไม่มีเอกสารบิลขายหน้าร้านของบิลนี้" };
  const res = await voidDocument(tenantId, systemId, doc.id, reason);
  if (!res.ok) return { voided: false, reason: res.reason };
  return { voided: true };
}

/**
 * แปลง "ของที่ POS รู้จัก" (InvItem.id / AccountProduct.id) → `AccountProduct.id` ของสมุดเล่มนี้
 * - ทุก query ผูก `systemId` ⇒ id ของร้านอื่นหาไม่เจอ = คืน null (บรรทัดยังบันทึกได้ แค่ไม่ผูกทะเบียนสินค้า)
 * - คีย์ item ใช้ `AccountProduct.invItemId` (ทิศ canonical ของ WO 4.1)
 */
export async function resolveProductIdsForExternalSale(
  systemId: string,
  keys: { itemIds: string[]; productIds: string[] },
): Promise<{ byItemId: Map<string, string>; byProductId: Map<string, string> }> {
  const byItemId = new Map<string, string>();
  const byProductId = new Map<string, string>();
  const itemIds = [...new Set(keys.itemIds.filter(Boolean))];
  const productIds = [...new Set(keys.productIds.filter(Boolean))];
  if (itemIds.length > 0) {
    const rows = await prisma.accountProduct.findMany({
      where: { systemId, invItemId: { in: itemIds } },
      select: { id: true, invItemId: true },
    });
    for (const r of rows) if (r.invItemId) byItemId.set(r.invItemId, r.id);
  }
  if (productIds.length > 0) {
    const rows = await prisma.accountProduct.findMany({
      where: { systemId, id: { in: productIds } },
      select: { id: true },
    });
    for (const r of rows) byProductId.set(r.id, r.id);
  }
  return { byItemId, byProductId };
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
  const term = clampSearch(q);
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

/**
 * WO C1 (REST) — แทนที่ "แท็ก" ของเอกสารทั้งชุด
 *
 * ทำไมไม่ใช้ `applyEditorExtras`: ตัวนั้นเขียน 8 ฟิลด์ของฟอร์ม V2 พร้อมกัน (reference/priceMode/
 * discountMode/salesUserId/internalNote/autoTaxInvoice/whtAmount + WHT รายบรรทัด) ⇒ ผู้เรียกที่
 * อยากแก้แค่แท็กจะล้างของที่ตัวเองไม่รู้จักทิ้งเงียบ ๆ · ตัวนี้แตะคอลัมน์เดียวจริง ๆ
 *
 * เอกสารที่ยกเลิก/void แล้วห้ามแก้ (ของที่จบแล้วต้องนิ่ง) — คืน false เมื่อไม่พบ/สถานะไม่ให้แก้
 */
export async function setDocumentTags(
  tenantId: string,
  systemId: string,
  id: string,
  tags: string[],
): Promise<boolean> {
  const res = await prisma.accountDocument.updateMany({
    where: { id, tenantId, systemId, status: { notIn: ["CANCELLED", "VOIDED"] } },
    data: { tags },
  });
  return res.count > 0;
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
  /** WO C1 · additive — ไม่ส่ง = พฤติกรรมเดิม (source MANUAL, tags []) */
  source?: AccountDocSource;
  tags?: string[];
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
          source: input.source ?? "MANUAL",
          tags: input.tags ?? [],
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
    return { ok: false, reason: safeReason(e, "สร้างเอกสารกลุ่มไม่สำเร็จ") };
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

// ═══════════════════════════════════════════════════════════════════════════
// WO 1.9 — เอกสารประจำ + เตือนครบกำหนด (BLUEPRINT §0.3 ข้อ 4 และ 7)
//
// 🔴 ทำไมโค้ดก้อนนี้อยู่ใน service.ts ไม่ใช่ไฟล์ใหม่:
//    fitness F5 (raw prisma ในโมดูล) เป็น ratchet baseline 45 ไฟล์ และตอนนี้ **เต็ม 45 พอดี**
//    ไฟล์ใหม่ที่ `import { prisma }` = CI แดงทันที ⇒ ส่วนที่แตะ DB ต้องอยู่ในไฟล์ที่นับไปแล้ว
//    ส่วนที่ไม่แตะ DB แยกออกไปเป็น `recurring-shared.ts` (บริสุทธิ์ ใช้ฝั่ง client ได้)
//
// 🔴 ทำไม import `./expense` แบบ dynamic:
//    `expense.ts` import จาก `service.ts` อยู่แล้ว (บรรทัด 16–30 ของไฟล์นั้น)
//    ⇒ import แบบ static ที่นี่จะเป็นวงกลม static ระหว่าง 2 ไฟล์ (ESM ยอมแต่ลำดับ init เปราะ)
//    การ `await import()` ตอนเรียกใช้จริงตัดวงนั้นทิ้ง และ Node แคชโมดูลให้อยู่แล้ว
// ═══════════════════════════════════════════════════════════════════════════


const BKK_OFFSET_MS = 7 * 60 * 60 * 1000;

/** "วันนี้ตามปฏิทินไทย" คืนเป็น Date ที่เป็นเที่ยงคืน **UTC** ของวันนั้น (ชนิดเดียวกับ dueDate ในตาราง) */
export function bkkTodayUtcMidnight(now: Date = new Date()): Date {
  const s = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  return new Date(`${s}T00:00:00.000Z`);
}

/** เวลาจริง (instant) ของ 00:00 น. วันนี้ตามเวลาไทย — ใช้เป็นขอบล่างของ "กันเตือนซ้ำในวันเดียวกัน" */
function bkkDayStartInstant(now: Date): Date {
  return new Date(bkkTodayUtcMidnight(now).getTime() - BKK_OFFSET_MS);
}

/** ช่วง [วันนั้น, วันถัดไป) สำหรับเทียบคอลัมน์วันที่ที่เก็บเป็นเที่ยงคืน UTC */
function dayRange(d: Date): { gte: Date; lt: Date } {
  return { gte: d, lt: new Date(d.getTime() + REC_DAY_MS) };
}

// ─────────────────── ผู้รับแจ้งเตือน (G11 — รายคน ไม่ใช่ประกาศทั้งร้าน) ───────────────────

/**
 * userId ของคนในร้านที่ **มีสิทธิ์จริง** ตาม action ที่ระบุ
 * 🔴 fail-closed: อ่านสิทธิ์เพี้ยน/ไม่รู้จัก = ไม่ส่ง (เหมือน selectChatNotifyRecipients ที่ปิดช่องโหว่ G9)
 *    ห้ามเขียนแจ้งเตือนแบบ `recipientUserId: null` (ประกาศทั้งร้าน) สำหรับเนื้อหาที่มีเลขเอกสาร/ยอดเงิน
 */
export async function selectAccountNotifyRecipients(tenantId: string, action: string): Promise<string[]> {
  const members = await prisma.membership.findMany({
    where: { tenantId },
    select: { userId: true, role: true, unitAccess: true, permissions: true },
    take: 200,
  });
  const out: string[] = [];
  const seen = new Set<string>();
  for (const m of members) {
    if (!m.userId || seen.has(m.userId)) continue;
    seen.add(m.userId);
    const ctx = {
      role: m.role,
      unitAccess: Array.isArray(m.unitAccess) ? (m.unitAccess as string[]) : [],
      permissions:
        m.permissions && typeof m.permissions === "object" && !Array.isArray(m.permissions)
          ? (m.permissions as Record<string, unknown>)
          : {},
    };
    if (evaluate(ctx, { module: "account", action })) out.push(m.userId);
  }
  return out;
}

/**
 * เขียน AppNotification ถึงผู้รับหลายคน — กันซ้ำด้วย "เนื้อความเดิมภายในวันไทยเดียวกัน"
 *
 * 🔴 ทำไมกันซ้ำแบบนี้ ไม่ใช่แปะโค้ดกันซ้ำในข้อความ: `title`+`body` ของแต่ละ (ชนิดเตือน · เอกสาร · วัน)
 *    ถูกออกแบบให้ **ตายตัว** อยู่แล้ว (มีเลขที่เอกสาร/งวดอยู่ในข้อความ) ⇒ ใช้ตัวข้อความเองเป็นกุญแจได้เลย
 *    ผู้ใช้จึงไม่ต้องเห็นโค้ดประหลาดอย่าง `[R:DUE:xxx]` ในกล่องแจ้งเตือน
 * @returns จำนวนแถวที่เขียนจริง (0 = เคยเตือนไปแล้ววันนี้)
 */
async function notifyUsersOncePerDay(
  tenantId: string,
  userIds: string[],
  title: string,
  body: string,
  now: Date,
): Promise<number> {
  if (userIds.length === 0) return 0;
  const since = bkkDayStartInstant(now);
  let written = 0;
  for (const userId of userIds) {
    const already = await prisma.appNotification.count({
      where: { tenantId, recipientUserId: userId, title, body, createdAt: { gte: since } },
    });
    if (already > 0) continue;
    await prisma.appNotification.create({
      data: { tenantId, recipientUserId: userId, title, body },
    });
    written += 1;
  }
  return written;
}

// ─────────────────── A. กฎเอกสารประจำ (CRUD) ───────────────────

export type RecurringRuleRow = {
  id: string;
  name: string;
  docType: AccountDocType;
  contactId: string | null;
  contactName: string | null;
  frequency: AccountRecurringFrequency;
  dayOfMonth: number | null;
  weekday: number | null;
  startDate: Date;
  endDate: Date | null;
  nextRunAt: Date;
  lastRunAt: Date | null;
  leadDays: number;
  autoApprove: boolean;
  active: boolean;
  template: RecurringTemplate;
  runCount: number;
};

function toRuleRow(r: {
  id: string;
  name: string;
  docType: AccountDocType;
  contactId: string | null;
  contact: { name: string } | null;
  frequency: AccountRecurringFrequency;
  dayOfMonth: number | null;
  weekday: number | null;
  startDate: Date;
  endDate: Date | null;
  nextRunAt: Date;
  lastRunAt: Date | null;
  leadDays: number;
  autoApprove: boolean;
  active: boolean;
  templateJson: unknown;
  _count?: { runs: number };
}): RecurringRuleRow {
  return {
    id: r.id,
    name: r.name,
    docType: r.docType,
    contactId: r.contactId,
    contactName: r.contact?.name ?? null,
    frequency: r.frequency,
    dayOfMonth: r.dayOfMonth,
    weekday: r.weekday,
    startDate: r.startDate,
    endDate: r.endDate,
    nextRunAt: r.nextRunAt,
    lastRunAt: r.lastRunAt,
    leadDays: r.leadDays,
    autoApprove: r.autoApprove,
    active: r.active,
    template: parseRecurringTemplate(r.templateJson),
    runCount: r._count?.runs ?? 0,
  };
}

const RULE_SELECT = {
  id: true,
  name: true,
  docType: true,
  contactId: true,
  contact: { select: { name: true } },
  frequency: true,
  dayOfMonth: true,
  weekday: true,
  startDate: true,
  endDate: true,
  nextRunAt: true,
  lastRunAt: true,
  leadDays: true,
  autoApprove: true,
  active: true,
  templateJson: true,
  _count: { select: { runs: true } },
} as const;

/** รายการกฎทั้งหมดของระบบนี้ (ทำงานอยู่ก่อน แล้วเรียงตามรอบถัดไป) */
export async function listRecurringRules(tenantId: string, systemId: string): Promise<RecurringRuleRow[]> {
  const rows = await prisma.accountRecurringRule.findMany({
    where: { tenantId, systemId },
    select: RULE_SELECT,
    orderBy: [{ active: "desc" }, { nextRunAt: "asc" }],
    take: 200,
  });
  return rows.map(toRuleRow);
}

export async function getRecurringRule(
  tenantId: string,
  systemId: string,
  id: string,
): Promise<RecurringRuleRow | null> {
  const r = await prisma.accountRecurringRule.findFirst({
    where: { id, tenantId, systemId },
    select: RULE_SELECT,
  });
  return r ? toRuleRow(r) : null;
}

export type RecurringRuleInput = {
  name: string;
  docType: AccountDocType;
  contactId: string | null;
  template: RecurringTemplate;
  frequency: AccountRecurringFrequency;
  dayOfMonth: number | null;
  weekday: number | null;
  startDate: Date;
  endDate: Date | null;
  leadDays: number;
  autoApprove: boolean;
  active: boolean;
};

/** ตรวจว่า contactId ที่ส่งมาเป็นของระบบนี้จริง (กัน IDOR — id จากเบราว์เซอร์เป็นแค่ "คำขอ") */
async function assertRuleContact(tenantId: string, systemId: string, contactId: string | null): Promise<string | null> {
  if (!contactId) return null;
  const c = await prisma.accountContact.findFirst({
    where: { id: contactId, tenantId, systemId },
    select: { id: true },
  });
  return c?.id ?? null;
}

export async function createRecurringRule(
  tenantId: string,
  systemId: string,
  input: RecurringRuleInput,
  createdByUserId: string | null,
): Promise<{ ok: true; id: string } | { ok: false; reason: string }> {
  if (!isRecurringDocType(input.docType)) return { ok: false, reason: "ชนิดเอกสารนี้ตั้งเป็นเอกสารประจำไม่ได้" };
  if (input.template.lines.length === 0) return { ok: false, reason: "ต้องมีรายการอย่างน้อย 1 รายการ" };
  const contactId = await assertRuleContact(tenantId, systemId, input.contactId);
  const nextRunAt = firstRunAt({
    frequency: input.frequency,
    dayOfMonth: input.dayOfMonth,
    weekday: input.weekday,
    startDate: input.startDate,
    endDate: input.endDate,
  });
  const rule = await prisma.accountRecurringRule.create({
    data: {
      tenantId,
      systemId,
      name: input.name.slice(0, 120),
      docType: input.docType,
      contactId,
      templateJson: input.template as unknown as Prisma.InputJsonValue,
      frequency: input.frequency,
      dayOfMonth: input.dayOfMonth,
      weekday: input.weekday,
      startDate: utcDay(input.startDate),
      endDate: input.endDate ? utcDay(input.endDate) : null,
      nextRunAt,
      leadDays: input.leadDays,
      autoApprove: input.autoApprove,
      active: input.active,
      createdByUserId,
    },
    select: { id: true },
  });
  return { ok: true, id: rule.id };
}

export async function updateRecurringRule(
  tenantId: string,
  systemId: string,
  id: string,
  input: RecurringRuleInput,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const cur = await prisma.accountRecurringRule.findFirst({
    where: { id, tenantId, systemId },
    select: { id: true, nextRunAt: true, frequency: true, dayOfMonth: true, weekday: true, startDate: true },
  });
  if (!cur) return { ok: false, reason: "ไม่พบเอกสารประจำนี้" };
  if (!isRecurringDocType(input.docType)) return { ok: false, reason: "ชนิดเอกสารนี้ตั้งเป็นเอกสารประจำไม่ได้" };
  if (input.template.lines.length === 0) return { ok: false, reason: "ต้องมีรายการอย่างน้อย 1 รายการ" };
  const contactId = await assertRuleContact(tenantId, systemId, input.contactId);
  // ตารางเวลาเปลี่ยน → คิด "รอบถัดไป" ใหม่จากต้น · ตารางเดิม → คงวันนัดเดิมไว้ (ไม่ทำให้งวดหาย/ซ้ำ)
  const scheduleChanged =
    cur.frequency !== input.frequency ||
    (cur.dayOfMonth ?? null) !== (input.dayOfMonth ?? null) ||
    (cur.weekday ?? null) !== (input.weekday ?? null) ||
    utcDay(cur.startDate).getTime() !== utcDay(input.startDate).getTime();
  const nextRunAt = scheduleChanged
    ? firstRunAt({
        frequency: input.frequency,
        dayOfMonth: input.dayOfMonth,
        weekday: input.weekday,
        startDate: input.startDate,
        endDate: input.endDate,
      })
    : cur.nextRunAt;
  await prisma.accountRecurringRule.updateMany({
    where: { id, tenantId, systemId },
    data: {
      name: input.name.slice(0, 120),
      docType: input.docType,
      contactId,
      templateJson: input.template as unknown as Prisma.InputJsonValue,
      frequency: input.frequency,
      dayOfMonth: input.dayOfMonth,
      weekday: input.weekday,
      startDate: utcDay(input.startDate),
      endDate: input.endDate ? utcDay(input.endDate) : null,
      nextRunAt,
      leadDays: input.leadDays,
      autoApprove: input.autoApprove,
      active: input.active,
    },
  });
  return { ok: true };
}

/** เปิด/ปิดกฎ (ไม่ลบ — ประวัติการสร้างต้องอยู่ครบ) */
export async function setRecurringRuleActive(
  tenantId: string,
  systemId: string,
  id: string,
  active: boolean,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const res = await prisma.accountRecurringRule.updateMany({
    where: { id, tenantId, systemId },
    data: { active },
  });
  return res.count > 0 ? { ok: true } : { ok: false, reason: "ไม่พบเอกสารประจำนี้" };
}

/**
 * ลบกฎทิ้ง — `AccountRecurringRun` ตามไปด้วย (FK ON DELETE CASCADE)
 * 🔴 **เอกสารที่เคยสร้างไปแล้วไม่ถูกแตะ** (documentId เป็นคอลัมน์ธรรมดา ไม่ใช่ FK) —
 *    ลบกฎ = หยุดออกใบใหม่ ไม่ใช่ลบบัญชีย้อนหลัง
 */
export async function deleteRecurringRule(
  tenantId: string,
  systemId: string,
  id: string,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const res = await prisma.accountRecurringRule.deleteMany({ where: { id, tenantId, systemId } });
  return res.count > 0 ? { ok: true } : { ok: false, reason: "ไม่พบเอกสารประจำนี้" };
}

/** ประวัติการสร้างของกฎ 1 ตัว (ใหม่สุดก่อน) */
export async function listRecurringRuns(
  tenantId: string,
  systemId: string,
  ruleId: string,
  limit = 20,
): Promise<{ id: string; periodKey: string; documentId: string; docNo: string | null; status: AccountDocStatus; createdAt: Date }[]> {
  const runs = await prisma.accountRecurringRun.findMany({
    where: { tenantId, systemId, ruleId },
    orderBy: { createdAt: "desc" },
    take: Math.min(100, Math.max(1, limit)),
    // WO API-B1 (additive): `id` ของรอบ — REST ต้องมีคีย์ให้ผู้เรียกอ้างรอบนั้นซ้ำได้ (documentId ไม่ใช่ id ของรอบ)
    select: { id: true, periodKey: true, documentId: true, createdAt: true },
  });
  if (runs.length === 0) return [];
  const docs = await prisma.accountDocument.findMany({
    where: { tenantId, systemId, id: { in: runs.map((r) => r.documentId) } },
    select: { id: true, docNo: true, status: true },
  });
  const byId = new Map(docs.map((d) => [d.id, d]));
  return runs.map((r) => ({
    id: r.id,
    periodKey: r.periodKey,
    documentId: r.documentId,
    docNo: byId.get(r.documentId)?.docNo ?? null,
    status: byId.get(r.documentId)?.status ?? "CANCELLED",
    createdAt: r.createdAt,
  }));
}

/**
 * แม่แบบตั้งต้นจากเอกสารที่ออกแล้ว — ปุ่ม "ตั้งเป็นเอกสารประจำ" บนหน้าเอกสาร (§5.3 ⋯)
 * คืน null เมื่อเอกสารไม่มีจริง/ยังเป็นร่าง/ชนิดที่ทำเอกสารประจำไม่ได้
 */
export async function buildRuleDraftFromDocument(
  tenantId: string,
  systemId: string,
  docId: string,
): Promise<{ name: string; docType: AccountDocType; contactId: string | null; template: RecurringTemplate } | null> {
  const doc = await prisma.accountDocument.findFirst({
    where: { id: docId, tenantId, systemId },
    select: {
      docType: true,
      docNo: true,
      status: true,
      contactId: true,
      note: true,
      priceMode: true,
      tags: true,
      issueDate: true,
      dueDate: true,
      contact: { select: { name: true } },
      lines: {
        orderBy: { sortOrder: "asc" },
        select: {
          description: true,
          qty: true,
          unitName: true,
          unitPrice: true,
          discount: true,
          vatRateBp: true,
          productId: true,
          accountId: true,
        },
      },
    },
  });
  if (!doc) return null;
  if (!isRecurringDocType(doc.docType)) return null;
  if (doc.status === "DRAFT" || doc.status === "CANCELLED" || doc.status === "VOIDED") return null;
  const dueDays =
    doc.dueDate && doc.issueDate
      ? Math.max(0, Math.round((utcDay(doc.dueDate).getTime() - utcDay(doc.issueDate).getTime()) / REC_DAY_MS))
      : null;
  const template = parseRecurringTemplate({
    priceMode: doc.priceMode ?? "EXCL_VAT",
    note: doc.note ?? "",
    tags: doc.tags ?? [],
    dueDays,
    lines: doc.lines.map((l) => {
      const nl = l.description.indexOf("\n");
      return {
        name: nl < 0 ? l.description : l.description.slice(0, nl),
        description: nl < 0 ? "" : l.description.slice(nl + 1),
        qty: l.qty,
        unitName: l.unitName,
        unitPriceSatang: l.unitPrice,
        vatRateBp: l.vatRateBp,
        discountSatang: l.discount,
        productId: l.productId,
        accountId: l.accountId,
      };
    }),
  });
  const who = doc.contact?.name ? ` ${doc.contact.name}` : "";
  return {
    name: `${DOC_LABEL[doc.docType] ?? doc.docType}${who}`.slice(0, 120),
    docType: doc.docType,
    contactId: doc.contactId,
    template,
  };
}

// ─────────────────── B. ตัวสร้างเอกสารประจำ ───────────────────

export type RecurringRunSummary = {
  /** จำนวนกฎที่ถึงรอบและถูกประมวลผลรอบนี้ */
  processed: number;
  /** ร่างที่สร้างใหม่จริง */
  created: number;
  /** ที่ออกเอกสารให้อัตโนมัติสำเร็จ */
  issued: number;
  /** ข้ามเพราะงวดนี้เคยสร้างไปแล้ว (idempotent) */
  skipped: number;
  /** สร้างไม่สำเร็จ (มีแจ้งเตือนพร้อมเหตุผล) */
  failed: number;
  /** กฎที่หมดอายุรอบนี้ (เลย endDate → ปิดเอง) */
  finished: number;
};

const EMPTY_RUN_SUMMARY: RecurringRunSummary = {
  processed: 0,
  created: 0,
  issued: 0,
  skipped: 0,
  failed: 0,
  finished: 0,
};

/** เพดาน lead time — ใช้ตัดช่วง query ก่อน แล้วค่อยกรอง leadDays รายแถวใน JS */
const MAX_LEAD_DAYS = 60;

/**
 * สร้างเอกสารตามกฎที่ถึงรอบ — **idempotent ด้วย unique(ruleId, periodKey)**
 *
 * ไม่ส่ง `opts` = กวาดทุกระบบบัญชีทั้งแพลตฟอร์ม (เส้นทางของ cron) เหมือน `sweepAutoClosePeriods`
 * ส่ง `opts` = จำกัดที่ระบบเดียว (ปุ่ม "สร้างตอนนี้" และชุดทดสอบ)
 *
 * 🔴 กติกา "ไล่ทีละงวดต่อ 1 รอบ": กฎที่ตั้งวันเริ่มย้อนหลัง (หรือ cron ตายไปหลายวัน) จะได้เอกสาร
 *    **งวดละ 1 ใบต่อการรัน 1 ครั้ง** ไม่ใช่ถล่มออกมาพร้อมกันทั้งปี — ตั้งใจให้เป็นแบบนี้:
 *    เจ้าของร้านที่เผลอตั้งวันเริ่มเป็นปีที่แล้ว จะได้ร่างมาตรวจวันละใบ (แก้/ปิดกฎทัน)
 *    ไม่ใช่ตื่นมาเจอใบแจ้งหนี้ 12 ใบพร้อมเลขรัน 12 เลขที่เรียกคืนไม่ได้
 */
export async function runRecurringRules(
  now: Date = new Date(),
  opts?: { tenantId: string; systemId: string; ruleId?: string },
): Promise<RecurringRunSummary> {
  const horizon = new Date(now.getTime() + MAX_LEAD_DAYS * REC_DAY_MS);
  const rules = await prisma.accountRecurringRule.findMany({
    where: {
      active: true,
      nextRunAt: { lte: horizon },
      ...(opts ? { tenantId: opts.tenantId, systemId: opts.systemId } : {}),
      ...(opts?.ruleId ? { id: opts.ruleId } : {}),
    },
    orderBy: { nextRunAt: "asc" },
    take: 500,
  });

  const summary = { ...EMPTY_RUN_SUMMARY };
  for (const rule of rules) {
    // "สร้างล่วงหน้า n วัน" — เทียบรายแถวเพราะ leadDays เป็นค่าของกฎแต่ละตัว (SQL เดียวเทียบไม่ได้)
    const dueAt = new Date(rule.nextRunAt.getTime() - rule.leadDays * REC_DAY_MS);
    if (dueAt.getTime() > now.getTime()) continue;

    // เลย "วันที่สิ้นสุด" แล้ว → ปิดกฎ ไม่สร้างอะไรอีก
    if (rule.endDate && rule.nextRunAt.getTime() > rule.endDate.getTime()) {
      await prisma.accountRecurringRule.updateMany({ where: { id: rule.id }, data: { active: false } });
      summary.finished += 1;
      continue;
    }

    summary.processed += 1;
    try {
      const res = await generateOneRecurringDocument(rule, now);
      if (res === "skipped") summary.skipped += 1;
      else {
        summary.created += 1;
        if (res === "issued") summary.issued += 1;
      }
    } catch (e) {
      summary.failed += 1;
      // WO 9.4 — ข้อความนี้ไปโผล่เป็นแจ้งเตือนในแอปจริง ๆ ⇒ กันข้อความดิบจาก error ที่ไม่คาดคิด
      await notifyRecurringFailure(rule, safeReason(e, "สร้างเอกสารไม่สำเร็จ"), now);
    }

    // เลื่อนงวด — ทำเสมอ ไม่ว่ารอบนี้จะสร้างสำเร็จหรือถูกข้าม (ไม่งั้น cron ติดอยู่ที่งวดเดิมตลอดกาล)
    const spec = {
      frequency: rule.frequency,
      dayOfMonth: rule.dayOfMonth,
      weekday: rule.weekday,
      startDate: rule.startDate,
      endDate: rule.endDate,
    };
    const next = nextRunAfter(spec, rule.nextRunAt);
    const finished = !!rule.endDate && next.getTime() > rule.endDate.getTime();
    if (finished) summary.finished += 1;
    await prisma.accountRecurringRule.updateMany({
      where: { id: rule.id },
      data: { nextRunAt: next, lastRunAt: now, active: finished ? false : rule.active },
    });
  }
  return summary;
}

type RecurringRuleRecord = Awaited<ReturnType<typeof prisma.accountRecurringRule.findMany>>[number];

/** สร้างเอกสารของ "งวดปัจจุบัน" ของกฎ 1 ตัว — คืน skipped เมื่องวดนั้นมีเอกสารแล้ว */
async function generateOneRecurringDocument(
  rule: RecurringRuleRecord,
  now: Date,
): Promise<"created" | "issued" | "skipped"> {
  const { tenantId, systemId } = rule;
  const periodKey = periodKeyOf(rule.frequency, rule.nextRunAt);

  // ด่านที่ 1 (เร็ว): งวดนี้เคยสร้างแล้วหรือยัง
  const existing = await prisma.accountRecurringRun.findFirst({
    where: { ruleId: rule.id, periodKey },
    select: { id: true },
  });
  if (existing) return "skipped";

  const template = parseRecurringTemplate(rule.templateJson);
  if (template.lines.length === 0) throw new Error("แม่แบบไม่มีรายการสินค้า/บริการ");

  const settings = await getSettings(tenantId, systemId);
  const totals = computeDocTotals({
    lines: template.lines.map((l) => ({
      qty: l.qty,
      unitPriceSatang: l.unitPriceSatang,
      discount: { mode: "amount" as const, satang: l.discountSatang, percentBp: 0 },
      vatRateBp: l.vatRateBp,
    })),
    priceMode: template.priceMode,
    vatRegistered: settings.vatRegistered,
    vatRateBp: settings.vatRateBp,
  });

  const issueDate = new Date(rule.nextRunAt.getTime());
  const dueDays = template.dueDays ?? settings.defaultDueDays ?? 30;
  const dueDate = new Date(issueDate.getTime() + dueDays * REC_DAY_MS);
  const validDate = new Date(issueDate.getTime() + (template.dueDays ?? settings.defaultValidDays ?? 30) * REC_DAY_MS);

  const lineInputs = template.lines.map((l) => ({
    description: l.description ? `${l.name}\n${l.description}` : l.name,
    qty: l.qty,
    unitName: l.unitName,
    unitPrice: l.unitPriceSatang,
    discount: l.discountSatang,
    vatRateBp: l.vatRateBp,
    accountId: l.accountId,
    productId: l.productId,
  }));
  const tags = Array.from(new Set([...template.tags, RECURRING_TAG]));
  const isRevenue = rule.docType === "INVOICE" || rule.docType === "QUOTATION";

  // 🔵 ใช้ createDocument/createExpenseDoc **ตัวเดียวกับที่ saveDraftAction (ฟอร์ม V2) เรียก**
  //    ⇒ ยอดบนเอกสารประจำ = ยอดที่ฟอร์มคิด ไม่มีสูตรคู่ขนาน
  let doc: { id: string };
  if (isRevenue) {
    doc = await createDocument({
      tenantId,
      systemId,
      docType: rule.docType,
      contactId: rule.contactId,
      issueDate,
      dueDate: rule.docType === "QUOTATION" ? null : dueDate,
      validUntil: rule.docType === "QUOTATION" ? validDate : null,
      vatMode: totals.vatMode,
      vatTiming: settings.taxPointBasis,
      discountAmount: totals.discountAmount,
      note: template.note || null,
      lines: lineInputs,
      createdById: rule.createdByUserId,
      source: "RECURRING",
      tags,
    });
  } else {
    const exp = await import("./expense");
    doc = await exp.createExpenseDoc({
      tenantId,
      systemId,
      docType: rule.docType,
      contactId: rule.contactId,
      issueDate,
      dueDate,
      vatMode: totals.vatMode,
      discountAmount: totals.discountAmount,
      note: template.note || null,
      lines: lineInputs,
      createdById: rule.createdByUserId,
      source: "RECURRING",
      tags,
    });
  }

  // ฟิลด์ V2 ที่ create เดิมยังไม่รู้จัก (อ้างอิง/โหมดราคา) — เส้นเดียวกับฟอร์ม
  await applyEditorExtras(tenantId, systemId, doc.id, {
    reference: rule.name.slice(0, 35),
    priceMode: template.priceMode,
    discountMode: "AMOUNT",
    salesUserId: null,
    tags,
    internalNote: null,
    autoTaxInvoice: null,
    whtAmount: 0,
    lineWht: template.lines.map(() => ({ whtIncomeType: null, whtRateBp: null })),
  });

  // ด่านที่ 2 (ของจริง): unique(ruleId, periodKey) — แข่งกันแล้วแพ้ = ลบร่างที่เพิ่งสร้างทิ้ง ไม่ทิ้งขยะ
  try {
    await prisma.accountRecurringRun.create({
      data: { tenantId, systemId, ruleId: rule.id, periodKey, documentId: doc.id },
    });
  } catch {
    await prisma.accountDocumentLine.deleteMany({ where: { documentId: doc.id } });
    await prisma.accountDocument.deleteMany({ where: { id: doc.id, tenantId, systemId, status: "DRAFT" } });
    return "skipped";
  }

  const base = `/app/sys/${systemId}/account`;
  const label = DOC_LABEL[rule.docType] ?? rule.docType;
  const link = isRevenue ? `${base}/docs/${rule.docType}/${doc.id}` : `${base}/${rule.docType === "PURCHASE" ? "purchase" : "expense"}/${doc.id}`;
  const recipients = await recurringRecipients(rule);

  // ออกให้อัตโนมัติเมื่อสั่งไว้ **และข้อมูลครบเท่านั้น** — ไม่ครบ = ปล่อยเป็นร่างให้คนตรวจ (ไม่ใช่ปล่อยเลยตามใจ)
  if (rule.autoApprove) {
    const block = autoApproveBlockReason({ contactId: rule.contactId, template });
    if (block) {
      await notifyUsersOncePerDay(
        tenantId,
        recipients,
        "เอกสารประจำรอตรวจ",
        `${rule.name} — สร้างเป็นร่างแล้วแต่ออกอัตโนมัติไม่ได้: ${block} · ${link}`,
        now,
      );
      return "created";
    }
    const exp = await import("./expense");
    const res = isRevenue
      ? await issueDocument(tenantId, systemId, doc.id)
      : await exp.issueExpenseDoc(tenantId, systemId, doc.id);
    if (!res.ok) {
      await notifyUsersOncePerDay(
        tenantId,
        recipients,
        "เอกสารประจำรอตรวจ",
        `${rule.name} — สร้างเป็นร่างแล้วแต่ออกอัตโนมัติไม่ได้: ${res.reason} · ${link}`,
        now,
      );
      return "created";
    }
    await notifyUsersOncePerDay(
      tenantId,
      recipients,
      "ออกเอกสารประจำแล้ว",
      `${rule.name} — ออก${label}เลขที่ ${res.docNo} อัตโนมัติแล้ว · ${link}`,
      now,
    );
    return "issued";
  }

  await notifyUsersOncePerDay(
    tenantId,
    recipients,
    "สร้างเอกสารประจำ",
    `${rule.name} — สร้าง${label}เป็นร่างแล้ว รอตรวจและอนุมัติ · ${link}`,
    now,
  );
  return "created";
}

/** ผู้รับแจ้งเตือนของกฎ: ผู้สร้างกฎมาก่อน (ถ้ายังมีสิทธิ์อยู่) แล้วจึงคนอื่นที่สร้างเอกสารได้ */
async function recurringRecipients(rule: { tenantId: string; createdByUserId: string | null }): Promise<string[]> {
  const eligible = await selectAccountNotifyRecipients(rule.tenantId, "account.doc.create");
  const owner = rule.createdByUserId;
  if (owner && eligible.includes(owner)) return [owner, ...eligible.filter((u) => u !== owner)];
  return eligible;
}

async function notifyRecurringFailure(
  rule: { id: string; tenantId: string; name: string; createdByUserId: string | null },
  reason: string,
  now: Date,
): Promise<void> {
  const recipients = await recurringRecipients(rule);
  await notifyUsersOncePerDay(
    rule.tenantId,
    recipients,
    "สร้างเอกสารประจำไม่สำเร็จ",
    `${rule.name} — ${reason} · แก้แม่แบบแล้วระบบจะลองใหม่รอบหน้า`,
    now,
  );
}

// ─────────────────── C. เตือนอัตโนมัติรายวัน ───────────────────

export type ReminderKind =
  | "DUE_TOMORROW"
  | "OVERDUE_TODAY"
  | "PTX_AWAITING"
  | "CHEQUE_DUE"
  | "PP30_DUE";

export const REMINDER_TITLE: Record<ReminderKind, string> = {
  DUE_TOMORROW: "ครบกำหนดพรุ่งนี้",
  OVERDUE_TODAY: "พ้นกำหนดชำระแล้ว",
  PTX_AWAITING: "ใบกำกับภาษีซื้อยังไม่ได้รับ",
  CHEQUE_DUE: "เช็คถึงกำหนด",
  PP30_DUE: "ภ.พ.30 ใกล้ครบกำหนดยื่น",
};

export type ReminderSummary = Record<ReminderKind, number> & { systems: number };

const EMPTY_REMINDER_SUMMARY = (): ReminderSummary => ({
  systems: 0,
  DUE_TOMORROW: 0,
  OVERDUE_TODAY: 0,
  PTX_AWAITING: 0,
  CHEQUE_DUE: 0,
  PP30_DUE: 0,
});

/** เอกสารที่ "ครบกำหนดแล้วต้องจ่าย/ต้องเก็บ" — ฝั่งขายเก็บเงิน · ฝั่งซื้อจ่ายเงิน */
const REMIND_DOC_TYPES: readonly AccountDocType[] = [
  "INVOICE",
  "BILLING_NOTE",
  "DEBIT_NOTE",
  "PURCHASE",
  "EXPENSE",
  "ASSET_PURCHASE",
  "DEPOSIT_PAYMENT",
  "COMBINED_PAYMENT",
];

/** วันที่รอใบกำกับภาษีซื้อได้นานสุดก่อนถือว่า "ช้า" */
const PTX_WAIT_DAYS = 7;
/** เตือนเช็คล่วงหน้ากี่วัน */
const CHEQUE_LEAD_DAYS = 3;
/** ภ.พ.30 ยื่นภายในวันที่ 10 ของเดือนถัดไป — เตือนล่วงหน้า 5 วัน = วันที่ 5 */
const PP30_DUE_DAY = 10;
const PP30_LEAD_DAYS = 5;

/**
 * เตือนงานค้างประจำวัน (BLUEPRINT §0.3 ข้อ 4) — 5 ชนิด
 * ไม่ส่ง `opts` = กวาดทุกระบบบัญชี (cron) · ส่ง = ระบบเดียว (ชุดทดสอบ)
 * รันซ้ำในวันเดียวกันไม่เพิ่มแจ้งเตือน (ดู notifyUsersOncePerDay)
 */
export async function runAccountReminders(
  now: Date = new Date(),
  opts?: { tenantId: string; systemId: string },
): Promise<ReminderSummary> {
  const summary = EMPTY_REMINDER_SUMMARY();
  const systems = opts
    ? [{ id: opts.systemId, tenantId: opts.tenantId }]
    : await prisma.appSystem.findMany({ where: { type: "ACCOUNT" }, select: { id: true, tenantId: true }, take: 200 });

  const today = bkkTodayUtcMidnight(now);
  const tomorrow = new Date(today.getTime() + REC_DAY_MS);
  const yesterday = new Date(today.getTime() - REC_DAY_MS);

  for (const sys of systems) {
    summary.systems += 1;
    const { id: systemId, tenantId } = sys;
    const to = await selectAccountNotifyRecipients(tenantId, "account.payment.record");
    if (to.length === 0) continue;

    // (1) ครบกำหนดพรุ่งนี้ · (2) พ้นกำหนด "วันแรก" (ครบกำหนดเมื่อวาน)
    for (const [kind, range] of [
      ["DUE_TOMORROW", dayRange(tomorrow)],
      ["OVERDUE_TODAY", dayRange(yesterday)],
    ] as [ReminderKind, { gte: Date; lt: Date }][]) {
      const docs = await prisma.accountDocument.findMany({
        where: {
          tenantId,
          systemId,
          docType: { in: [...REMIND_DOC_TYPES] },
          status: { in: ["AWAITING_PAYMENT", "PARTIAL"] },
          dueDate: range,
        },
        select: { docNo: true, docType: true, direction: true, grandTotal: true, paidTotal: true, contact: { select: { name: true } } },
        take: 100,
      });
      for (const d of docs) {
        const remain = Math.max(0, d.grandTotal - d.paidTotal);
        const side = d.direction === "IN" ? "ต้องจ่าย" : "ต้องเก็บ";
        const who = d.contact?.name ? ` · ${d.contact.name}` : "";
        const body = `${DOC_LABEL[d.docType] ?? EXPENSE_DOC_LABEL_FALLBACK(d.docType)} ${d.docNo ?? "(ไม่มีเลขที่)"}${who} — ${side} ฿${baht(remain)}`;
        summary[kind] += await notifyUsersOncePerDay(tenantId, to, REMINDER_TITLE[kind], body, now);
      }
    }

    // (3) ใบกำกับภาษีซื้อรอรับเกิน 7 วัน
    const ptx = await prisma.accountDocument.findMany({
      where: {
        tenantId,
        systemId,
        docType: "PURCHASE_TAX_INVOICE",
        status: "AWAITING_RECEIVE",
        issueDate: { lt: new Date(today.getTime() - PTX_WAIT_DAYS * REC_DAY_MS) },
      },
      select: { docNo: true, issueDate: true, grandTotal: true, contact: { select: { name: true } } },
      take: 100,
    });
    for (const d of ptx) {
      const days = Math.max(
        PTX_WAIT_DAYS,
        Math.round((today.getTime() - utcDay(d.issueDate).getTime()) / REC_DAY_MS),
      );
      const who = d.contact?.name ? ` · ${d.contact.name}` : "";
      const body = `ใบกำกับภาษีซื้อ ${d.docNo ?? "(ไม่มีเลขที่)"}${who} — รอรับตัวจริงมา ${days} วันแล้ว`;
      summary.PTX_AWAITING += await notifyUsersOncePerDay(tenantId, to, REMINDER_TITLE.PTX_AWAITING, body, now);
    }

    // (4) เช็คถึงกำหนดใน 3 วัน (รวมที่เลยกำหนดแล้วแต่ยังไม่เคลียร์)
    const cheques = await prisma.accountCheque.findMany({
      where: {
        tenantId,
        systemId,
        status: { in: ["ON_HAND", "DEPOSITED", "ISSUED"] },
        chequeDate: { lt: new Date(today.getTime() + (CHEQUE_LEAD_DAYS + 1) * REC_DAY_MS) },
      },
      select: { chequeNo: true, bankName: true, amount: true, chequeDate: true, direction: true },
      take: 100,
    });
    for (const c of cheques) {
      const side = c.direction === "IN" ? "เช็ครับ" : "เช็คจ่าย";
      const body = `${side} ${c.chequeNo} ${c.bankName} ฿${baht(c.amount)} — ถึงกำหนด ${utcDay(c.chequeDate).toISOString().slice(0, 10)}`;
      summary.CHEQUE_DUE += await notifyUsersOncePerDay(tenantId, to, REMINDER_TITLE.CHEQUE_DUE, body, now);
    }

    // (5) ภ.พ.30 — เตือนวันที่ 5 ของเดือน (ก่อนกำหนดยื่นวันที่ 10 อยู่ 5 วัน) สำหรับงวดเดือนก่อน
    if (today.getUTCDate() === PP30_DUE_DAY - PP30_LEAD_DAYS) {
      const py = today.getUTCMonth() === 0 ? today.getUTCFullYear() - 1 : today.getUTCFullYear();
      const pm = today.getUTCMonth() === 0 ? 12 : today.getUTCMonth();
      const periodKey = `${py}-${String(pm).padStart(2, "0")}`;
      const body = `งวด ${periodKey} — ยื่นภายในวันที่ ${PP30_DUE_DAY} ของเดือนนี้ (เหลือ ${PP30_LEAD_DAYS} วัน)`;
      summary.PP30_DUE += await notifyUsersOncePerDay(tenantId, to, REMINDER_TITLE.PP30_DUE, body, now);
    }
  }
  return summary;
}

/** ป้ายชนิดเอกสารฝั่งจ่ายที่ DOC_LABEL (ฝั่งขาย) ไม่มี — เขียนไว้ที่นี่กันวงกลม import กับ expense.ts */
function EXPENSE_DOC_LABEL_FALLBACK(dt: AccountDocType): string {
  const m: Partial<Record<AccountDocType, string>> = {
    PURCHASE: "บันทึกซื้อ",
    EXPENSE: "บันทึกค่าใช้จ่าย",
    ASSET_PURCHASE: "ซื้อสินทรัพย์",
    DEPOSIT_PAYMENT: "ใบจ่ายเงินมัดจำ",
    COMBINED_PAYMENT: "ใบรวมจ่าย",
    PURCHASE_TAX_INVOICE: "ใบกำกับภาษีซื้อ",
  };
  return m[dt] ?? dt;
}

// ─────────────────── D. เตือนชำระถึงลูกค้า (⋯ บนหน้าเอกสาร §5.3) ───────────────────

/** เอกสารที่กด "เตือนชำระ" ได้ (ต้องมียอดค้างของลูกค้าจริง) */
export const PAYMENT_REMINDER_TYPES: readonly AccountDocType[] = ["INVOICE", "BILLING_NOTE", "DEBIT_NOTE"];

/**
 * เหตุผลไทยที่ยังกด "เตือนชำระ" ไม่ได้ — คืน null = กดได้
 * ใช้ทั้งฝั่งจอ (ปิดปุ่มพร้อมบอกเหตุผล) และฝั่ง server (ตรวจซ้ำ ห้ามเชื่อจอ)
 */
export function paymentReminderBlockReason(doc: {
  docType: AccountDocType;
  status: AccountDocStatus;
  contactEmail: string | null;
}): string | null {
  if (!PAYMENT_REMINDER_TYPES.includes(doc.docType)) return "เอกสารชนิดนี้ไม่มีการเตือนชำระ";
  if (doc.status !== "AWAITING_PAYMENT" && doc.status !== "PARTIAL") return "เอกสารนี้ไม่มียอดค้างชำระ";
  if (!doc.contactEmail) return "ผู้ติดต่อยังไม่มีอีเมล — เพิ่มอีเมลในข้อมูลผู้ติดต่อก่อน";
  return null;
}

/**
 * ส่งอีเมลเตือนชำระถึงลูกค้า + บันทึก AuditLog
 * `origin` = โดเมนจริงของ request (มาจาก publicOrigin() ฝั่ง action) — ไม่ประกอบ URL เองในนี้
 */
export async function sendPaymentReminder(
  tenantId: string,
  systemId: string,
  docId: string,
  opts: { actorId?: string | null; origin: string },
): Promise<{ ok: true; email: string; link: string | null } | { ok: false; reason: string }> {
  const doc = await prisma.accountDocument.findFirst({
    where: { id: docId, tenantId, systemId },
    select: {
      id: true,
      docType: true,
      docNo: true,
      status: true,
      dueDate: true,
      grandTotal: true,
      paidTotal: true,
      contactSnapshot: true,
      contact: { select: { name: true, email: true } },
    },
  });
  if (!doc) return { ok: false, reason: "ไม่พบเอกสาร" };
  const snap = (doc.contactSnapshot as Record<string, unknown> | null) ?? null;
  const email = (doc.contact?.email ?? (typeof snap?.email === "string" ? snap.email : null) ?? "").trim() || null;
  const block = paymentReminderBlockReason({ docType: doc.docType, status: doc.status, contactEmail: email });
  if (block) return { ok: false, reason: block };

  const settings = await getSettings(tenantId, systemId);
  const remain = Math.max(0, doc.grandTotal - doc.paidTotal);
  const label = DOC_LABEL[doc.docType] ?? doc.docType;
  const due = doc.dueDate ? utcDay(doc.dueDate).toISOString().slice(0, 10) : "—";

  // ลิงก์สาธารณะมีเฉพาะชนิดที่ระบบรองรับ (IV/RE/DP) — BN/DN ส่งเนื้อความอย่างเดียว ไม่ทำลิงก์ปลอม
  let link: string | null = null;
  const linkRes = await ensurePublicTaxInvoiceLink(tenantId, systemId, doc.id);
  if (linkRes.ok) link = `${opts.origin.replace(/\/$/, "")}/r/${linkRes.token}`;

  const who = doc.contact?.name ?? (typeof snap?.name === "string" ? snap.name : "") ?? "";
  const org = settings.orgName || "";
  const subject = `แจ้งเตือนการชำระเงิน ${label} ${doc.docNo ?? ""}`.trim();
  const text = [
    `เรียน ${who}`.trim(),
    "",
    `${label}เลขที่ ${doc.docNo ?? "-"} มียอดค้างชำระ ฿${baht(remain)}`,
    `กำหนดชำระ: ${due}`,
    link ? `ดูเอกสาร: ${link}` : "",
    "",
    `หากชำระเรียบร้อยแล้ว ขออภัยในความไม่สะดวก`,
    org ? `— ${org}` : "",
  ]
    .filter((l) => l !== "")
    .join("\n");

  // 🔴 import แบบ dynamic โดยเจตนา: `@/lib/core/email` → `@/lib/env` ซึ่ง `schema.parse(process.env)`
  //    **ตอนโหลดโมดูล** ⇒ ถ้า import ที่หัวไฟล์ ทุกคนที่ import service.ts (รวมทะเบียน tool ของ AI ที่
  //    fitness F10 เรียก) จะพังทันทีในเชลล์ที่ไม่มี DATABASE_URL/SESSION_SECRET เช่น pre-commit hook และ CI
  //    (เจอจริงตอน WO 1.9 — fitness F10.1 แดงเพราะเหตุนี้) · โหลดตอนจะส่งจริงเท่านั้น
  const { sendEmail } = await import("@/lib/core/email");
  await sendEmail(email as string, subject, text);
  await writeAudit({
    tenantId,
    actorId: opts.actorId ?? null,
    action: "account.doc.remind",
    targetType: "AccountDocument",
    targetId: doc.id,
    after: { docNo: doc.docNo, remain, hasLink: !!link },
  });
  return { ok: true, email: email as string, link };
}

// ─────────────────── E. "งานที่รอคุณ" (§4 บล็อก 7 — WO 2.1 เอาไปวาด) ───────────────────

export type PendingTasks = {
  /** ใบเสนอราคาที่ส่งไปแล้วลูกค้ายังไม่ตอบ */
  quotationAwaitingAccept: number;
  /** ใบสั่งซื้อ/ใบสั่งซื้อสินทรัพย์ ที่รออนุมัติ */
  poAwaitingApproval: number;
  /** ใบมัดจำ (รับ+จ่าย) ที่ยังไม่ถูกหักเข้าเอกสารจริง */
  depositAwaitingDeduct: number;
  /** รายการบัญชีที่ระบบตั้งธงให้คนตรวจ (บัญชีพัก 9999 ฯลฯ) */
  needsReview: number;
  /** ใบกำกับภาษีซื้อที่ยังรอรับตัวจริง */
  purchaseTaxAwaiting: number;
  /** ร่างที่เอกสารประจำสร้างไว้ รอคนตรวจ/อนุมัติ */
  recurringDraftsAwaiting: number;
  /** ผลรวมทุกช่อง — ใช้เป็นตัวเลขบนหัวการ์ด */
  total: number;
};

/** ตัวเลขทั้งหมดของการ์ด "งานที่รอคุณ" — 1 ฟังก์ชัน 1 คิวรีชุด (หน้าหลักเรียกครั้งเดียว) */
export async function pendingTasks(tenantId: string, systemId: string): Promise<PendingTasks> {
  const [
    quotationAwaitingAccept,
    poAwaitingApproval,
    depositAwaitingDeduct,
    needsReview,
    purchaseTaxAwaiting,
    recurringDraftsAwaiting,
  ] = await Promise.all([
    prisma.accountDocument.count({
      where: { tenantId, systemId, docType: "QUOTATION", status: "AWAITING_ACCEPT" },
    }),
    prisma.accountDocument.count({
      where: {
        tenantId,
        systemId,
        docType: { in: ["PURCHASE_ORDER", "ASSET_PURCHASE_ORDER"] },
        status: "AWAITING_APPROVAL",
      },
    }),
    prisma.accountDocument.count({
      where: {
        tenantId,
        systemId,
        docType: { in: ["DEPOSIT_RECEIPT", "DEPOSIT_PAYMENT"] },
        status: "AWAITING_DEDUCT",
      },
    }),
    prisma.accountJournalEntry.count({ where: { tenantId, systemId, needsReview: true } }),
    prisma.accountDocument.count({
      where: { tenantId, systemId, docType: "PURCHASE_TAX_INVOICE", status: "AWAITING_RECEIVE" },
    }),
    prisma.accountDocument.count({
      where: { tenantId, systemId, source: "RECURRING", status: "DRAFT" },
    }),
  ]);
  const total =
    quotationAwaitingAccept +
    poAwaitingApproval +
    depositAwaitingDeduct +
    needsReview +
    purchaseTaxAwaiting +
    recurringDraftsAwaiting;
  return {
    quotationAwaitingAccept,
    poAwaitingApproval,
    depositAwaitingDeduct,
    needsReview,
    purchaseTaxAwaiting,
    recurringDraftsAwaiting,
    total,
  };
}

// ═══════════════════════════════════════════════════════════════
// WO 8.2 (§9.3) — รายงานทางอีเมล สรุปรายวัน/รายสัปดาห์
// อยู่ในไฟล์นี้ (ไม่แยกไฟล์ใหม่) เพราะต้องใช้ prisma กวาดข้ามร้าน และ fitness F5.1
// ตรึงจำนวนไฟล์ในโมดูลที่ import prisma ไว้ — ตัวประกอบข้อความอยู่ใน `email-report.ts` ที่บริสุทธิ์
// ═══════════════════════════════════════════════════════════════

export type EmailReportResult = { systems: number; sent: number; skipped: number; failed: number };

/**
 * ส่งรายงานทางอีเมลของทุกร้านที่เปิดไว้ (เรียกจาก cron — `acc-v2-cron-recurring.mts email-reports`)
 * · ร้านที่ยังไม่ได้เปิด / ไม่มีผู้รับ → ข้าม
 * · ส่งไปแล้วในงวดนี้ → ข้าม (idempotent)
 * · ส่งเมลล้ม 1 ร้าน ไม่ล้มทั้งรอบ
 */
export async function runAccountEmailReports(now: Date = new Date()): Promise<EmailReportResult> {
  const rows = await prisma.accountSettings.findMany({
    where: { OR: [{ emailReportDaily: true }, { emailReportWeekly: true }] },
    select: { tenantId: true, systemId: true, orgName: true, ...POLICY_SELECT },
  });

  const out: EmailReportResult = { systems: rows.length, sent: 0, skipped: 0, failed: 0 };
  for (const row of rows) {
    const policy = parsePolicy(row as unknown as PolicyRow);
    if (policy.emailReportRecipients.length === 0) {
      out.skipped += 1;
      continue;
    }
    const ctx = { tenantId: row.tenantId, systemId: row.systemId };
    for (const kind of reportKindsDue(policy, now)) {
      const key = reportIdempotencyKey(row.systemId, kind, now);
      const already = await prisma.appNotification.count({
        where: { tenantId: row.tenantId, title: REPORT_MARKER_TITLE, body: { contains: key } },
      });
      if (already > 0) {
        out.skipped += 1;
        continue;
      }
      // WO 9.2 ข้อ 11 — ชั้นที่ 2 ต่อจาก idempotencyKey: ถ้าวันหนึ่งมีใครเรียกตัวนี้นอก cron
      //   (หรือ cron เด้งซ้ำ) กล่องจดหมายของเจ้าของร้านต้องไม่โดนถล่ม
      const rate = await accountRateGuard("emailReport", row.systemId, now.getTime());
      if (!rate.ok) {
        out.skipped += 1;
        continue;
      }
      try {
        const { dashboardSnapshot } = await import("./dashboard");
        const { sendEmail } = await import("@/lib/core/email");
        const snap = await dashboardSnapshot(ctx, { now });
        const { subject, text } = composeAccountReport({
          orgName: row.orgName || "กิจการของคุณ",
          kind,
          now,
          kpi: snap.kpi,
          pending: {
            quotationAwaitingAccept: snap.pending.quotationAwaitingAccept,
            poAwaitingApproval: snap.pending.poAwaitingApproval,
            needsReview: snap.pending.needsReview,
            total: snap.pending.total,
          },
          fiscalYearLabel: fiscalYearOf(now, policy.fiscalYearStartMonth).label,
        });
        for (const to of policy.emailReportRecipients) await sendEmail(to, subject, text);
        // 🔴 ประทับ "ส่งแล้ว" หลังส่งจริงเท่านั้น — ล้มกลางทางแล้วรอบหน้าต้องส่งใหม่ได้
        await prisma.appNotification.create({
          data: {
            tenantId: row.tenantId,
            title: REPORT_MARKER_TITLE,
            body: `${key} · ${policy.emailReportRecipients.length} ผู้รับ`,
          },
        });
        out.sent += 1;
      } catch {
        out.failed += 1;
      }
    }
  }
  return out;
}

