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
  branchName: string;
  /** ชนิดนี้มีวันที่ "ใช้ได้ถึง" แทน "ครบกำหนด" หรือไม่ (ใบเสนอราคา) */
  dueLabel: string;
  contacts: ContactOption[];
  products: ProductOption[];
  accounts: LedgerOption[];
  /**
   * WO 8.2 (§9.3): อัตราหัก ณ ที่จ่ายเริ่มต้น **ต่อประเภทเงินได้** ตามนโยบายของร้าน
   * ไม่ได้ตั้ง = ใช้อัตราตามกฎหมายใน `WHT_TYPE_OPTIONS` เหมือนเดิม
   */
  whtRateByIncomeType?: Record<string, number>;
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
  /** ช่องทางการเงินให้ dropdown "ช่องทาง" */
  paymentChannels: { id: string; name: string; type: string; bankName: string | null; accountNo: string | null }[];
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
