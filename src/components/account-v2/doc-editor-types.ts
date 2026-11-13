import type { AmountOrPercent, PriceMode } from "@/lib/modules/account/totals";
import type { AccMode } from "./mode-shared";

// ─────────────────────────────────────────────────────────────
// doc-editor-types.ts — สัญญาระหว่าง "หน้า (server)" กับ "ฟอร์ม (client)" ของ DocEditorV2
// 🔴 ห้าม import อะไรที่แตะ prisma/next-headers — ไฟล์นี้ถูกดึงเข้า bundle ฝั่ง client
//    (import type จาก totals.ts ได้เพราะ totals.ts บริสุทธิ์เหมือนกัน)
// ─────────────────────────────────────────────────────────────

export type { AmountOrPercent, PriceMode };

/**
 * ACC T0.2 ▸ ค่ากฎหมายที่ฟอร์มฝั่ง client ต้องใช้ — หน้า server คำนวณจากตารางค่ากฎหมายของสมุด
 *   (`legal-values.legalUiOptionsFrom`) แล้วส่งลงมาก้อนเดียว · ห้ามฝังอัตราในไฟล์ client (เดิม VAT_OPTIONS / defaultRateBp)
 */
export type LegalUiOptions = {
  /** อัตรา VAT มาตรฐาน ณ วันที่ของฟอร์ม */
  defaultVatBp: number;
  /** ตัวเลือก VAT ต่อบรรทัด (§5.2 C) — ค่าเริ่มขึ้นก่อน · 0 = อัตรา 0% · −1 = ยกเว้น */
  vatOptions: { value: number; label: string }[];
  /** อัตราหัก ณ ที่จ่ายที่แนะนำต่อประเภทเงินได้ (bp) — นโยบายร้าน (WO 8.2) ทับค่าจากตาราง · 0 = ไม่มีอัตราคงที่ (กรอกเอง) */
  whtSuggest: Record<string, number>;
  /** ตัวเลือกอัตราหัก ณ ที่จ่าย (bp) = อัตราที่มีผลในตาราง ∪ {0} */
  whtRates: number[];
};

/** ตัวเลือก + ค่าปัจจุบัน (ค่าเก่าที่ไม่อยู่ในตารางแล้วต้องยังแสดง/เลือกค้างได้ ไม่หายเงียบ) */
export function withCurrent<T extends { value: number }>(opts: T[], current: number | null | undefined, make: (v: number) => T): T[] {
  return current == null || opts.some((o) => o.value === current) ? opts : [...opts, make(current)];
}
export const vatLabelOf = (bp: number): string => (bp === -1 ? "ยกเว้น" : `${bp / 100}%`);
export const whtRateChoices = (rates: readonly number[], current: number | null | undefined): number[] =>
  current == null || rates.includes(current) ? [...rates] : [...rates, current].sort((a, b) => a - b);

/**
 * ประเภทเงินได้ ม.40 สำหรับ dropdown "หัก ณ ที่จ่าย" ต่อบรรทัด (ป้ายเท่านั้น — อัตราอยู่ที่ `LegalUiOptions.whtSuggest`)
 * ⚠️ ต้องตรงกับ `WHT_INCOME_LABEL` ใน `src/lib/modules/account/expense.ts` เป๊ะ
 *    (ที่นั่น import prisma จึงดึงมาฝั่ง client ไม่ได้) — `scripts/qc-acc-v2-editor.mts` ตรวจให้ว่าไม่หลุดจากกัน
 */
export const WHT_TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: "M40_1", label: "40(1) เงินเดือน/ค่าจ้าง" },
  { value: "M40_2", label: "40(2) ค่านายหน้า/รับจ้างทำงาน" },
  { value: "M40_3", label: "40(3) ค่าลิขสิทธิ์/goodwill" },
  { value: "M40_4", label: "40(4) ดอกเบี้ย/เงินปันผล" },
  { value: "M40_5", label: "40(5) ค่าเช่าทรัพย์สิน" },
  { value: "M40_6", label: "40(6) วิชาชีพอิสระ" },
  { value: "M40_7", label: "40(7) รับเหมา" },
  { value: "M40_8", label: "40(8) บริการ/อื่นๆ" },
];

export const PRICE_MODE_OPTIONS: { value: PriceMode; label: string }[] = [
  { value: "EXCL_VAT", label: "แยก VAT" },
  { value: "INCL_VAT", label: "รวม VAT" },
  { value: "NO_VAT", label: "ไม่มี VAT" },
];

/**
 * WO 1.6 §5.2 J — เหตุผลออกเอกสารปรับปรุงหนี้ (ม.86/10) · ใช้ทั้งขั้น ② ของ CN/DN/CNR/DNR/RPR
 * ค่า "OTHER" บังคับกรอกข้อความเพิ่ม (`adjustReasonText`) — ตัวอื่นกรอกเพิ่มได้แต่ไม่บังคับ
 */
export const REASON_OPTIONS: { value: string; label: string }[] = [
  { value: "DAMAGED", label: "สินค้าชำรุด/คืนสินค้า" },
  { value: "PRICE_ERROR", label: "คำนวณราคาผิด" },
  { value: "EXTRA_DISCOUNT", label: "ส่วนลดเพิ่ม" },
  { value: "SERVICE_CANCELLED", label: "ยกเลิกบริการ" },
  { value: "OTHER", label: "อื่น ๆ" },
];
export const REASON_LABEL: Record<string, string> = Object.fromEntries(
  REASON_OPTIONS.map((o) => [o.value, o.label]),
);

/** เก็บ `adjustReason` (DB เก็บเป็นข้อความก้อนเดียว) → รวม/แยกรหัส+ข้อความเสริม */
export function packAdjustReason(code: string, text: string): string {
  const label = REASON_LABEL[code] ?? "";
  const t = text.trim();
  if (!label) return t;
  return t ? `${label} — ${t}` : label;
}

/** แกะ `adjustReason` ที่บันทึกไว้กลับเป็นรหัส+ข้อความ (สำหรับเปิดร่างเดิมมาแก้ — ทำได้แบบประมาณเท่านั้น) */
export function unpackAdjustReason(raw: string | null | undefined): { code: string; text: string } {
  const s = (raw ?? "").trim();
  if (!s) return { code: "", text: "" };
  for (const o of REASON_OPTIONS) {
    if (o.value === "OTHER") continue;
    if (s === o.label) return { code: o.value, text: "" };
    if (s.startsWith(`${o.label} — `)) return { code: o.value, text: s.slice(o.label.length + 3) };
  }
  return { code: "OTHER", text: s };
}

/** 1 บรรทัดในตารางรายการ (§5.2 C) */
export type LineDraft = {
  /** key ฝั่ง React เท่านั้น — ไม่ส่งขึ้น server */
  key: string;
  productId: string | null;
  /** ชื่อสินค้า/บริการ (พิมพ์อิสระได้) = `description` ใน DB */
  name: string;
  /** คำอธิบายเพิ่ม (≤1,000) — ต่อท้ายชื่อด้วย \n ตอนบันทึก */
  description: string;
  /** เปิดกล่องคำอธิบายไว้ไหม (สถานะ UI ล้วน — server ไม่สนใจ) */
  descriptionOpen: boolean;
  accountId: string | null;
  qty: number;
  unitName: string;
  unitPriceSatang: number;
  discount: AmountOrPercent;
  vatRateBp: number;
  whtIncomeType: string | null;
  whtRateBp: number | null;
  /** ACC T1.2 — ชนิดบรรทัด สินค้า/บริการ (เอกสารขาย) · null = ตามชนิดสินค้า/ชนิดเริ่มของใบ */
  lineKind: "GOODS" | "SERVICE" | null;
};

/** ค่าทั้งฟอร์ม (§5.2 B, C, E, G) */
export type DocDraftValue = {
  docNo: string;
  contactId: string | null;
  contactLabel: string;
  issueDate: string; // ISO yyyy-mm-dd
  dueDate: string;
  reference: string;
  priceMode: PriceMode;
  /** ACC T1.2 — สวิตช์ "ออกใบกำกับภาษีพร้อมกัน": null = ตามค่าตั้ง (สินค้าพร้อมใบ · บริการตามโหมด) · true/false = ผู้ใช้เลือกเอง */
  autoTaxInvoice: boolean | null;
  recognizeVatNow: boolean;
  salesUserId: string | null;
  tags: string[];
  lines: LineDraft[];
  docDiscount: AmountOrPercent;
  note: string;
  internalNote: string;
  /** WO 1.6 §5.2 J — เหตุผล (เฉพาะ CN/DN/CNR/DNR) */
  adjustReasonCode: string;
  adjustReasonText: string;
};

/** payload ที่ส่งขึ้น server action — ตัด key ฝั่ง React ทิ้ง */
export type DocDraftPayload = {
  systemId: string;
  docType: string;
  docId?: string;
  /** WO 1.6 — เอกสารอ้างอิงที่เลือกในขั้น ① ของ wizard (ใช้เฉพาะตอนสร้างใหม่ — ตั้งค่าเดียวตอน create แล้วคงที่) */
  refId?: string | null;
  value: Omit<DocDraftValue, "lines"> & { lines: Omit<LineDraft, "key">[] };
};

export type SaveDraftResult =
  | { ok: true; docId: string; docNo: string | null; grandTotal: number; dueTotal: number; savedAt: number }
  | { ok: false; reason: string };

export type ContactOption = {
  id: string;
  name: string;
  /** "C00019 · 081-234-5678" */
  sub?: string;
  member?: boolean;
  outstandingSatang?: number;
  creditTermDays?: number;
  priceMode?: PriceMode | null;
};

export type ProductOption = {
  id: string;
  name: string;
  sub?: string;
  priceSatang: number;
  unitName: string | null;
  vatRateBp: number | null;
  accountId: string | null;
  /** ACC T1.2 — ชนิดในทะเบียน (สินค้า/ชุด = GOODS · บริการ = SERVICE) */
  kind?: "GOODS" | "SERVICE" | null;
};

export type LedgerOption = {
  id: string;
  code: string;
  name: string;
  /** WO 8.2 (§9.3): หัก ณ ที่จ่ายเริ่มต้นของบัญชีนี้ตามนโยบาย — เลือกบัญชีแล้วเติมให้เอง */
  whtIncomeType?: string | null;
  whtRateBp?: number | null;
};

export type FavoriteSet = { name: string; lines: Omit<LineDraft, "key">[] };

export type AttachmentView = {
  id: string;
  fileName: string;
  fileUrl: string;
  mimeType: string;
  sizeBytes: number;
};

export type StepView = {
  code: string;
  label: string;
  docNo?: string;
  href?: string;
  state: "done" | "current" | "next";
};

/** props ของ `DocEditorV2` — หน้า server ประกอบให้ครบแล้วส่งลงมาก้อนเดียว */
export type DocEditorV2Props = {
  systemId: string;
  docType: string;
  docLabel: string;
  side: "revenue" | "expense";
  /** โหมดง่าย/นักบัญชีที่ server อ่านจากคุกกี้ `acc_mode` — client ใช้เป็นค่าตั้งต้น (กัน hydration mismatch) */
  accMode: AccMode;
  basePath: string;
  listPath: string;
  detailPathFor: string; // prefix ของหน้าเอกสาร (ต่อท้ายด้วย /<docId>)
  docId?: string;
  steps: StepView[];
  vatRegistered: boolean;
  vatRateBp: number;
  /** ACC T1.2 — ค่าตั้งใบกำกับอัตโนมัติ (สินค้า: พร้อมใบแจ้งหนี้ · บริการ: โหมด) ใช้คำนวณค่าเริ่มของสวิตช์ "ออกใบกำกับภาษีพร้อมกัน" */
  taxInvoiceSettings?: { goodsOnIssue: boolean; mode: "MANUAL" | "ON_PAYMENT" | "ON_INVOICE" };
  branchName: string;
  /** ชนิดนี้มีวันที่ "ใช้ได้ถึง" แทน "ครบกำหนด" หรือไม่ (ใบเสนอราคา) */
  dueLabel: string;
  contacts: ContactOption[];
  products: ProductOption[];
  accounts: LedgerOption[];
  /**
   * ACC T0.2 ▸ ค่ากฎหมายของฟอร์ม (ตัวเลือก VAT · อัตราหัก ณ ที่จ่ายที่แนะนำต่อประเภทเงินได้ = นโยบายร้าน WO 8.2 ทับตาราง)
   */
  legal: LegalUiOptions;
  salesUsers: { id: string; name: string }[];
  tagOptions: string[];
  favorites: FavoriteSet[];
  attachments: AttachmentView[];
  storageEnabled: boolean;
  /** เอกสารนี้ต้องเลือกบัญชีต่อบรรทัด (บันทึกค่าใช้จ่าย/ซื้อสินทรัพย์) */
  requireLineAccount: boolean;
  initial: DocDraftValue;
  /** ยอดหักมัดจำที่มีอยู่แล้วบนร่างนี้ (ส่วน D — ผู้ใช้แก้ผ่าน `DepositSection` ได้ตั้งแต่ WO 1.4) */
  depositDeductedSatang: number;
  /** ── WO 1.4 ส่วน D ── ชนิดนี้หักเงินมัดจำได้หรือไม่ (IV/RE ฝั่งขาย · PUR/EXP ฝั่งจ่าย) */
  depositEnabled: boolean;
  /** ใบมัดจำที่ร่างนี้หักอยู่ตอนนี้ (มาจาก relation DEPOSIT_APPLY) */
  depositApplied: { depositId: string; docNo: string | null; amountSatang: number }[];
  /** ── WO 1.4 ส่วน F ── ฟอร์มนี้มีบล็อก "รับชำระเงิน" (ใบเสร็จรับเงิน · ภาพ g2) */
  paymentEnabled: boolean;
  /** ACCOUNT-FIX A2 — ชนิดนี้ออกแล้วค้างรับ/จ่าย ⇒ มีตัวเลือก "อนุมัติและรับชำระ/บันทึกจ่าย" (`canPayAfterIssue`) */
  payAfterIssue?: boolean;
  /** ช่องทางการเงินให้ dropdown "ช่องทาง" */
  paymentChannels: { id: string; name: string; type: string; bankName: string | null; accountNo: string | null }[];
  /**
   * CRM C5.4-C ▸ round 13 · R12-1: รายการรับชำระที่ผูกกับร่างใบเสร็จนี้แล้ว (ผูกสำเร็จแต่ยังไม่ได้ออก) — แสดงแบบอ่านอย่างเดียว
   *   แทนช่องกรอกใหม่ (กดอนุมัติ = ออกเอกสารด้วยรายการเดิม) · ไม่ส่ง = ไม่มี ◂
   */
  attachedPayments?: {
    id: string; paidAt: string; amountSatang: number; whtAmountSatang: number; whtRateBp: number | null; suggestedWhtIncomeType: string | null;
    channel: string; financeAccountId: string | null; financeName: string | null; chequeNo: string | null; bankName: string | null; chequeDate: string | null;
  }[];
  /** round 13 · R12-2: ร่างนี้เคยผูกรายการรับชำระ แต่ถูกยกเลิก/เช็คเด้งหมดแล้ว — ออกตอนนี้โดยไม่กรอกการรับเงินใหม่ = บันทึกเป็นรับเงินสด */
  attachedAllVoided?: boolean;
  /** เลขที่ + ลิงก์ของใบแจ้งหนี้ต้นทาง (การ์ดหัวของ g2 "อ้างอิงใบแจ้งหนี้") */
  sourceDoc?: { docNo: string | null; href: string; label: string } | null;
  /** ── WO 1.6 §5.2 J — โหมด wizard เอกสารปรับปรุงหนี้ (CN/DN/CNR/DNR) ── */
  adjustMode?: boolean;
  /** เอกสารอ้างอิงที่เลือกในขั้น ① (chip "อ้างอิง<label> <docNo>" ในหัวฟอร์ม) — ไม่มี = โหมด "ไม่อ้างอิง" */
  refDoc?: { id: string; docNo: string | null; href: string; label: string; outstandingSatang: number } | null;
  /** เพดานยอดคงเหลือของเอกสารอ้างอิง (เฉพาะ CN/CNR ที่มี refDoc) — null = ไม่มีเพดาน (DN/DNR หรือไม่อ้างอิง) */
  capSatang?: number | null;
};

export function newLineDraft(vatRateBp: number): LineDraft {
  return {
    key: `l${Math.random().toString(36).slice(2, 10)}`,
    productId: null,
    name: "",
    description: "",
    descriptionOpen: false,
    accountId: null,
    qty: 1,
    unitName: "",
    unitPriceSatang: 0,
    discount: { mode: "amount", satang: 0, percentBp: 0 },
    vatRateBp,
    whtIncomeType: null,
    whtRateBp: null,
    lineKind: null,
  };
}

/** ชื่อ+คำอธิบาย → `description` ที่เก็บใน DB (บรรทัดแรก = ชื่อ) และแกะกลับได้ */
export function packDescription(name: string, description: string): string {
  const n = name.trim();
  const d = description.trim();
  return d ? `${n}\n${d}` : n;
}

export function unpackDescription(raw: string): { name: string; description: string } {
  const i = raw.indexOf("\n");
  if (i < 0) return { name: raw, description: "" };
  return { name: raw.slice(0, i), description: raw.slice(i + 1) };
}
