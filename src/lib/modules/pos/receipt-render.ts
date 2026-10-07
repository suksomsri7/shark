// receipt-render.ts — ข้อมูลใบเสร็จ (ชนิด + คำบรรยาย th/en) และตัวเรนเดอร์ HTML / ESC-POS (POS P1.10 · มติ R5 R6 · ภาพ 11B)
//
// 🔴 บริสุทธิ์ + ใช้ร่วม client: ห้าม import prisma / server-only / next/* / node:* / ไฟล์ฝั่งเซิร์ฟเวอร์ของ pos
//    (P1.10U import ไฟล์นี้ในเบราว์เซอร์: พรีวิว · WebUSB/Bluetooth · rasterize ภาษาไทยด้วย canvas)
// 🔴 ไม่มี Date.now() / new Date() ไม่มีอาร์กิวเมนต์ / Math.random() — ทุกอย่างมาจาก payload ⇒ เรียกซ้ำได้ผลเดิมทุกไบต์
// 🔴 คำบรรยายทุกคำมาจาก payload.labels[locale] (en = ไม่มีอักษรไทยเลย) · ข้อมูลร้าน/สินค้าพิมพ์ตามที่เก็บ

// ═══════════════════ ชนิดข้อมูล (สัญญา R5) ═══════════════════
export type ReceiptDocType = "SALE" | "REFUND";
export type ReceiptKind = "TAX_INVOICE_ABB" | "RECEIPT";
export type ReceiptPayType = "CASH" | "TRANSFER" | "PROMPTPAY" | "DEPOSIT" | "ROOM_CHARGE" | "CARD";

export type ReceiptLabels = {
  receipt: string;
  taxInvoiceAbb: string;
  refund: string;
  vatIncluded: string;
  copy: string;
  taxId: string;
  branchNo: string;
  headOffice: string;
  posRegNo: string;
  phone: string;
  docNo: string;
  date: string;
  cashier: string;
  shift: string;
  refDoc: string;
  items: string;
  subtotal: string;
  lineDiscount: string;
  billDiscount: string;
  coupon: string;
  tierDiscount: string;
  serviceCharge: string;
  grandTotal: string;
  vatBase: string;
  vat: string;
  tip: string;
  tendered: string;
  change: string;
  reference: string;
  member: string;
  tier: string;
  pointEarned: string;
  pointBalance: string;
  note: string;
  weight: string;
  fullTaxInvoiceHint: string;
  eReceipt: string;
  pay: Record<ReceiptPayType, string>;
};

export type ReceiptLine = {
  name: string;
  qty: number;
  /** ราคาต่อหน่วยรวมตัวเลือกแล้ว (สตางค์) */
  unitPriceSatang: number;
  lineTotalSatang: number;
  discountSatang: number;
  options: string[];
  note?: string;
  weightGrams?: number;
};
export type ReceiptPayment = { type: ReceiptPayType | string; amountSatang: number; tenderedSatang?: number; changeSatang?: number; reference?: string };

export type ReceiptPayload = {
  docType: ReceiptDocType;
  kind: ReceiptKind;
  copy: boolean;
  /** ขนาดกระดาษเลือกตอนเรนเดอร์ (ค่าตั้งของเครื่อง) — payload ไม่ผูก */
  paper: null;
  shop: { name: string; branchName: string; address: string; phone: string; taxId?: string; branchNo?: string; logoUrl?: string };
  device: { posRegNo?: string; name?: string };
  doc: { receiptNo: string; issuedAt: string; cashierName?: string; shiftNo?: number; refReceiptNo?: string };
  lines: ReceiptLine[];
  totals: {
    /** Σ qty × ราคาต่อหน่วย (ก่อนส่วนลดรายการ) */
    subtotalSatang: number;
    lineDiscountSatang: number;
    billDiscountSatang: number;
    couponDiscountSatang: number;
    couponCode?: string;
    tierDiscountSatang: number;
    serviceChargeSatang: number;
    grandTotalSatang: number;
    vatBaseSatang: number;
    vatSatang: number;
    vatRateBp: number;
    tipSatang: number;
  };
  payments: ReceiptPayment[];
  member?: { name: string; tierName?: string; pointEarned: number; pointBalance?: number };
  footer: { text: string; qrEReceiptUrl: string | null; fullTaxInvoiceHint: boolean };
  labels: { th: ReceiptLabels; en: ReceiptLabels };
};

// ═══════════════════ คำบรรยาย (ชุดคีย์เดียวกันทั้งสองภาษา) ═══════════════════
export const RECEIPT_LABELS: { readonly th: ReceiptLabels; readonly en: ReceiptLabels } = {
  th: {
    receipt: "ใบเสร็จรับเงิน",
    taxInvoiceAbb: "ใบกำกับภาษีอย่างย่อ",
    refund: "ใบลดหนี้ / ใบคืนเงิน",
    vatIncluded: "ราคารวมภาษีมูลค่าเพิ่มแล้ว",
    copy: "สำเนา",
    taxId: "เลขประจำตัวผู้เสียภาษี",
    branchNo: "สาขาที่",
    headOffice: "สำนักงานใหญ่",
    posRegNo: "เลขเครื่อง POS",
    phone: "โทร",
    docNo: "เลขที่",
    date: "วันที่",
    cashier: "แคชเชียร์",
    shift: "กะ",
    refDoc: "อ้างอิง",
    items: "รายการ",
    subtotal: "รวม",
    lineDiscount: "ส่วนลดรายการ",
    billDiscount: "ส่วนลดท้ายบิล",
    coupon: "คูปอง",
    tierDiscount: "ส่วนลดสมาชิก",
    serviceCharge: "ค่าบริการ",
    grandTotal: "ยอดสุทธิ",
    vatBase: "มูลค่าก่อนภาษี",
    vat: "ภาษีมูลค่าเพิ่ม",
    tip: "ทิป",
    tendered: "รับเงิน",
    change: "เงินทอน",
    reference: "อ้างอิง",
    member: "สมาชิก",
    tier: "ระดับ",
    pointEarned: "แต้มที่ได้รับ",
    pointBalance: "แต้มคงเหลือ",
    note: "หมายเหตุ",
    weight: "น้ำหนัก",
    fullTaxInvoiceHint: "ขอใบกำกับเต็มรูปได้ภายใน 7 วัน",
    eReceipt: "สแกนรับใบเสร็จอิเล็กทรอนิกส์",
    pay: { CASH: "เงินสด", TRANSFER: "โอนเงิน", PROMPTPAY: "พร้อมเพย์", DEPOSIT: "มัดจำ", ROOM_CHARGE: "ลงบัญชีห้องพัก", CARD: "บัตร" },
  },
  en: {
    receipt: "RECEIPT",
    taxInvoiceAbb: "ABBREVIATED TAX INVOICE",
    refund: "CREDIT NOTE / REFUND",
    vatIncluded: "VAT included",
    copy: "COPY",
    taxId: "Tax ID",
    branchNo: "Branch",
    headOffice: "Head office",
    posRegNo: "POS No.",
    phone: "Tel",
    docNo: "No.",
    date: "Date",
    cashier: "Cashier",
    shift: "Shift",
    refDoc: "Ref.",
    items: "items",
    subtotal: "Subtotal",
    lineDiscount: "Item discount",
    billDiscount: "Bill discount",
    coupon: "Coupon",
    tierDiscount: "Member discount",
    serviceCharge: "Service charge",
    grandTotal: "TOTAL",
    vatBase: "Before VAT",
    vat: "VAT",
    tip: "Tip",
    tendered: "Received",
    change: "Change",
    reference: "Ref.",
    member: "Member",
    tier: "Tier",
    pointEarned: "Points earned",
    pointBalance: "Points balance",
    note: "Note",
    weight: "Weight",
    fullTaxInvoiceHint: "Full tax invoice available on request within 7 days",
    eReceipt: "Scan for e-receipt",
    pay: { CASH: "Cash", TRANSFER: "Transfer", PROMPTPAY: "PromptPay", DEPOSIT: "Deposit", ROOM_CHARGE: "Room charge", CARD: "Card" },
  },
};
