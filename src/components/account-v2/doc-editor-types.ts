import type { AmountOrPercent, PriceMode } from "@/lib/modules/account/totals";
import type { AccMode } from "./mode-shared";

// ─────────────────────────────────────────────────────────────
// doc-editor-types.ts — สัญญาระหว่าง "หน้า (server)" กับ "ฟอร์ม (client)" ของ DocEditorV2
// 🔴 ห้าม import อะไรที่แตะ prisma/next-headers — ไฟล์นี้ถูกดึงเข้า bundle ฝั่ง client
//    (import type จาก totals.ts ได้เพราะ totals.ts บริสุทธิ์เหมือนกัน)
// ─────────────────────────────────────────────────────────────

export type { AmountOrPercent, PriceMode };

/** ตัวเลือก VAT ต่อบรรทัด (§5.2 C) — -1 = ยกเว้น (ไม่ใช่ 0%) */
export const VAT_OPTIONS: { value: number; label: string }[] = [
  { value: 700, label: "7%" },
  { value: 0, label: "0%" },
  { value: -1, label: "ยกเว้น" },
];

/**
 * ประเภทเงินได้ ม.40 สำหรับ dropdown "หัก ณ ที่จ่าย" ต่อบรรทัด
 * ⚠️ ต้องตรงกับ `WHT_INCOME_LABEL` ใน `src/lib/modules/account/expense.ts` เป๊ะ
 *    (ที่นั่น import prisma จึงดึงมาฝั่ง client ไม่ได้) — `scripts/qc-acc-v2-editor.mts` ตรวจให้ว่าไม่หลุดจากกัน
 */
export const WHT_TYPE_OPTIONS: { value: string; label: string; defaultRateBp: number }[] = [
  { value: "M40_1", label: "40(1) เงินเดือน/ค่าจ้าง", defaultRateBp: 0 },
  { value: "M40_2", label: "40(2) ค่านายหน้า/รับจ้างทำงาน", defaultRateBp: 300 },
  { value: "M40_3", label: "40(3) ค่าลิขสิทธิ์/goodwill", defaultRateBp: 300 },
  { value: "M40_4", label: "40(4) ดอกเบี้ย/เงินปันผล", defaultRateBp: 100 },
  { value: "M40_5", label: "40(5) ค่าเช่าทรัพย์สิน", defaultRateBp: 500 },
  { value: "M40_6", label: "40(6) วิชาชีพอิสระ", defaultRateBp: 300 },
  { value: "M40_7", label: "40(7) รับเหมา", defaultRateBp: 300 },
  { value: "M40_8", label: "40(8) บริการ/อื่นๆ", defaultRateBp: 300 },
];

export const PRICE_MODE_OPTIONS: { value: PriceMode; label: string }[] = [
  { value: "EXCL_VAT", label: "แยก VAT" },
  { value: "INCL_VAT", label: "รวม VAT" },
  { value: "NO_VAT", label: "ไม่มี VAT" },
];

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
  autoTaxInvoice: boolean;
  recognizeVatNow: boolean;
  salesUserId: string | null;
  tags: string[];
  lines: LineDraft[];
  docDiscount: AmountOrPercent;
  note: string;
  internalNote: string;
};

/** payload ที่ส่งขึ้น server action — ตัด key ฝั่ง React ทิ้ง */
export type DocDraftPayload = {
  systemId: string;
  docType: string;
  docId?: string;
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
};

export type LedgerOption = { id: string; code: string; name: string };

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
  branchName: string;
  /** ชนิดนี้มีวันที่ "ใช้ได้ถึง" แทน "ครบกำหนด" หรือไม่ (ใบเสนอราคา) */
  dueLabel: string;
  contacts: ContactOption[];
  products: ProductOption[];
  accounts: LedgerOption[];
  salesUsers: { id: string; name: string }[];
  tagOptions: string[];
  favorites: FavoriteSet[];
  attachments: AttachmentView[];
  storageEnabled: boolean;
  /** เอกสารนี้ต้องเลือกบัญชีต่อบรรทัด (บันทึกค่าใช้จ่าย/ซื้อสินทรัพย์) */
  requireLineAccount: boolean;
  initial: DocDraftValue;
  /** ยอดหักมัดจำที่มีอยู่แล้วบนร่างนี้ (อ่านอย่างเดียว — WO 1.4 เป็นคนทำ UI เลือก) */
  depositDeductedSatang: number;
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
