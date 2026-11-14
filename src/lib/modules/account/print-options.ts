// print-options.ts — "ข้อมูลสำหรับพิมพ์" ที่คิดจากตั้งค่าเอกสาร §9.2 (WO 8.1)
//
// ทำไมแยกไฟล์: หน้าพิมพ์เป็น React server component ซึ่งทดสอบตรง ๆ ไม่ได้ ⇒ ตรรกะ "เทมเพลตไหน
// ซ่อนฟิลด์อะไร ใช้ป้ายภาษาอะไร ข้อความท้ายเอกสารของชนิดนี้คืออะไร" ต้องอยู่ในฟังก์ชันบริสุทธิ์
// ที่ข้อสอบเรียกได้ ไม่งั้นจะพิสูจน์ไม่ได้ว่า "เลือกกะทัดรัด/อังกฤษแล้วมีผลจริง"
import type { AccountDocType } from "@prisma/client";
import { isGroupDocType } from "./group";
import type { DocSettings, PrintField, PrintLanguage, PrintTemplate } from "./settings-schema";

export type PrintLabels = {
  docNo: string; date: string; dueDate: string; validUntil: string; reference: string;
  buyer: string; buyerTax: string; taxId: string;
  item: string; sku: string; qty: string; unitPrice: string; vat: string; amount: string;
  /** ACC T2.1 — หัวคอลัมน์ส่วนลดรายบรรทัด */
  lineDiscount: string;
  subTotal: string; discount: string; deposit: string; vatAmount: string;
  grandTotal: string; netTotal: string;
  note: string; terms: string; channels: string;
  signature: string; buyerSignature: string;
  original: string; copy: string; phone: string;
  // ── เอกสารกลุ่ม (WO 1.7 · §5.2 K): 1 บรรทัด = 1 ใบลูก ⇒ ตารางคนละชุดกับเอกสารสินค้า ──
  groupItem: string; groupOutstanding: string; groupCount: string; groupGrandTotal: string;
};

/** ป้ายบนกระดาษ 2 ภาษา — คีย์เดียวกัน ใช้ที่หน้าพิมพ์ที่เดียว */
const LABELS: Record<PrintLanguage, PrintLabels> = {
  TH: {
    docNo: "เลขที่",
    date: "วันที่",
    dueDate: "ครบกำหนด",
    validUntil: "ยืนราคาถึง",
    reference: "อ้างอิง",
    buyer: "ลูกค้า",
    buyerTax: "ผู้ซื้อ / ลูกค้า",
    taxId: "เลขประจำตัวผู้เสียภาษี",
    item: "รายการ",
    sku: "รหัส",
    qty: "จำนวน",
    unitPrice: "ราคา/หน่วย",
    lineDiscount: "ส่วนลด",
    vat: "VAT",
    amount: "จำนวนเงิน",
    subTotal: "มูลค่าสินค้า/บริการ",
    discount: "ส่วนลด",
    deposit: "หักเงินมัดจำ",
    vatAmount: "ภาษีมูลค่าเพิ่ม (VAT)",
    grandTotal: "จำนวนเงินรวมทั้งสิ้น",
    netTotal: "ยอดสุทธิ",
    note: "หมายเหตุ",
    terms: "เงื่อนไขการชำระเงิน",
    channels: "ช่องทางการชำระเงิน",
    signature: "ผู้รับเงิน / ผู้มีอำนาจลงนาม",
    buyerSignature: "ผู้ซื้อ / ลูกค้า",
    original: "ต้นฉบับ (Original)",
    copy: "สำเนา (Copy)",
    phone: "โทร",
    groupItem: "เอกสาร",
    groupOutstanding: "ยอดค้างชำระ",
    groupCount: "จำนวนเอกสารในรายการ",
    groupGrandTotal: "รวมยอดที่ต้องชำระ",
  },
  EN: {
    docNo: "No.",
    date: "Date",
    dueDate: "Due date",
    validUntil: "Valid until",
    reference: "Reference",
    buyer: "Customer",
    buyerTax: "Buyer / Customer",
    taxId: "Taxpayer ID",
    item: "Description",
    sku: "Code",
    qty: "Qty",
    unitPrice: "Unit price",
    lineDiscount: "Discount",
    vat: "VAT",
    amount: "Amount",
    subTotal: "Subtotal",
    discount: "Discount",
    deposit: "Less deposit",
    vatAmount: "VAT",
    grandTotal: "Grand total",
    netTotal: "Net total",
    note: "Note",
    terms: "Payment terms",
    channels: "Payment channels",
    signature: "Authorised signature",
    buyerSignature: "Buyer / Customer",
    original: "Original",
    copy: "Copy",
    phone: "Tel",
    groupItem: "Document",
    groupOutstanding: "Outstanding",
    groupCount: "Documents in this list",
    groupGrandTotal: "Total due",
  },
};

export function printLabels(language: PrintLanguage): PrintLabels {
  return LABELS[language];
}

/**
 * ACCOUNT-FIX B3 — เอกสารฝั่งซื้อ/จ่าย (ใบสั่งซื้อ · บันทึกซื้อ · ค่าใช้จ่าย · ใบรวมจ่าย ฯลฯ): หัวเอกสารเป็นกิจการเรา (ผู้ซื้อ/ผู้จ่าย)
 *   คู่ค้าบนกระดาษคือ "ผู้ขาย / ผู้รับเงิน" ไม่ใช่ "ผู้ซื้อ / ลูกค้า" · ช่องลงนามสลับฝั่งตาม
 */
export const PURCHASE_SIDE_DOC_TYPES: ReadonlySet<AccountDocType> = new Set<AccountDocType>([
  "PURCHASE_ORDER", "PURCHASE", "PURCHASE_TAX_INVOICE", "EXPENSE", "DEPOSIT_PAYMENT",
  "CREDIT_NOTE_RECEIVED", "DEBIT_NOTE_RECEIVED", "ASSET_PURCHASE_ORDER", "ASSET_PURCHASE", "COMBINED_PAYMENT",
]);
export function partyLabelsFor(base: PrintLabels, docType: AccountDocType, language: PrintLanguage): PrintLabels {
  if (!PURCHASE_SIDE_DOC_TYPES.has(docType)) return base;
  return language === "EN"
    ? { ...base, buyer: "Vendor / Payee", buyerTax: "Vendor / Payee", signature: "Paid by / Authorised signature", buyerSignature: "Vendor / Payee" }
    : { ...base, buyer: "ผู้ขาย / ผู้รับเงิน", buyerTax: "ผู้ขาย / ผู้รับเงิน", signature: "ผู้จ่ายเงิน / ผู้มีอำนาจลงนาม", buyerSignature: "ผู้ขาย / ผู้รับเงิน" };
}

/** ระยะ/ขนาดตัวอักษรตามเทมเพลต — "กะทัดรัด" = บีบให้ลงหน้าเดียว */
export const TEMPLATE_STYLE: Record<PrintTemplate, { page: string; table: string; gapTop: string }> = {
  STANDARD: { page: "max-w-2xl bg-white p-8 text-sm text-black", table: "mt-4 w-full border-collapse text-xs", gapTop: "mt-12" },
  COMPACT: { page: "max-w-2xl bg-white p-5 text-xs text-black", table: "mt-3 w-full border-collapse text-[11px]", gapTop: "mt-6" },
  WITH_IMAGES: { page: "max-w-2xl bg-white p-8 text-sm text-black", table: "mt-4 w-full border-collapse text-xs", gapTop: "mt-12" },
};

export type PrintOptions = {
  template: PrintTemplate;
  /** เอกสารกลุ่ม (ใบวางบิลรวม/ใบรวมจ่าย) — ตารางและยอดรวมใช้ชุดของ WO 1.7 ไม่ใช่ตารางสินค้า */
  isGroup: boolean;
  language: PrintLanguage;
  labels: PrintLabels;
  style: (typeof TEMPLATE_STYLE)[PrintTemplate];
  show: Record<PrintField, boolean>;
  /** ข้อความท้ายเอกสารของชนิดนี้ ("" = ไม่มี) */
  footerNote: string;
  /** เงื่อนไขการชำระเงินของชนิดนี้ ("" = ไม่มี) */
  paymentTerms: string;
  /** ข้อความตามกฎหมาย (พิมพ์เฉพาะใบกำกับภาษี) */
  legalText: string;
};

/**
 * รวมตั้งค่า §9.2 → ตัวเลือกการพิมพ์ของเอกสารชนิดหนึ่ง
 * · เทมเพลต "มีรูปสินค้า" บังคับเปิดคอลัมน์รูป (เลือกเทมเพลตนี้แล้วไม่มีรูป = ไม่มีความหมาย)
 * · เทมเพลต "กะทัดรัด" บังคับปิดรูปสินค้า (จุดขายคือลงหน้าเดียว)
 * · ข้อความท้าย/เงื่อนไข ใช้ของชนิดนั้นก่อน แล้วค่อยตกไปที่ค่ากลางของกิจการ
 */
export function buildPrintOptions(
  settings: DocSettings,
  docType: AccountDocType,
  fallbackFooterNote?: string | null,
): PrintOptions {
  const template = settings.print.template;
  const show = { ...settings.print.fields };
  if (template === "WITH_IMAGES") show.productImage = true;
  if (template === "COMPACT") show.productImage = false;
  // 🔴 WO 1.7 (§5.2 K): ใบวางบิลรวม/ใบรวมจ่าย ไม่มีบรรทัดสินค้าเลย — 1 บรรทัด = 1 ใบลูก
  //    ⇒ เทมเพลตที่เปิด "รหัสสินค้า"/"รูปสินค้า" ต้องไม่ไปงอกคอลัมน์ว่างบนใบกลุ่ม
  //    (บั๊กที่ข้อสอบ qc-acc-v2-groups G0.12b จับได้ตอน WO 8.1: เทมเพลตพิมพ์เข้าไปทับตารางของกลุ่ม)
  const isGroup = isGroupDocType(docType);
  if (isGroup) {
    show.productSku = false;
    show.productImage = false;
  }
  const note = settings.notes[docType];
  return {
    template,
    isGroup,
    language: settings.print.language,
    labels: partyLabelsFor(printLabels(settings.print.language), docType, settings.print.language),
    style: TEMPLATE_STYLE[template],
    show,
    footerNote: (note?.footer ?? "").trim() || (fallbackFooterNote ?? "").trim(),
    paymentTerms: (note?.terms ?? "").trim(),
    legalText: docType === "TAX_INVOICE" ? settings.autoTaxInvoice.legalText : "",
  };
}
