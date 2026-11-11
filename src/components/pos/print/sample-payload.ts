// sample-payload.ts — ใบเสร็จตัวอย่างที่สร้างฝั่ง client (POS P1.10 U · ภาพ 17A "ตัวอย่างสด" + ปุ่มพิมพ์ตัวอย่าง/ทดสอบพิมพ์)
// 🔴 บริสุทธิ์: ไม่มี Date.now()/สุ่ม — เวลาออกใบส่งเข้ามา ⇒ ผลเดิมทุกครั้ง (สคริปต์ qc-pos-p1.10u-print ใช้เป็น payload คงที่)
// 🔴 กติกาเดียวกับ receipt.ts ที่พิมพ์จริง: ชื่อ/ที่อยู่/โทร = ค่าตั้งใบเสร็จก่อน ว่าง = โปรไฟล์สมุดบัญชี · เลขผู้เสียภาษี/สาขาเฉพาะใบกำกับอย่างย่อ ·
//    ชนิดใบ = receiptKindOf (ตัวเดียวกับหน้าบิล) · VAT ถอดจากยอดรวม ปัดครึ่งขึ้นระดับบิล · showPoints ปิด = ไม่มีส่วนสมาชิก · showCashier ปิด = ไม่มีชื่อแคชเชียร์
// รายการคงที่: ลาเต้ ฿85 · ครัวซองต์ ฿85 → ฿170 จ่ายพร้อมเพย์ (ภาพ 17A)
import { RECEIPT_LABELS, type ReceiptPayload } from "@/lib/modules/pos/receipt-render";
import { receiptKindOf } from "@/lib/modules/pos/receipt-shared";

export type SampleBook = {
  orgName: string | null;
  taxId: string | null;
  branchCode: string | null;
  address: string | null;
  phone: string | null;
  logoUrl: string | null;
  vatRegistered: boolean;
  vatRateBp: number;
  posAbbreviatedInvoice: boolean;
};
export type SampleInput = {
  header: { name?: string; phone?: string; address?: string; logoUrl?: string | null };
  footer: string;
  showPoints: boolean;
  showCashier: boolean;
  book: SampleBook | null;
  /** ข้อความตัวอย่างตามภาษาของจอ (ชื่อสินค้า · แคชเชียร์ · สมาชิก) */
  text: { latte: string; croissant: string; cashier: string; member: string };
  receiptNo: string;
  issuedAt: string;
  copy: boolean;
  branchName?: string;
  device?: { name?: string; posRegNo?: string | null };
};

const LINE_SATANG = 8500;
const nonEmpty = (v: string | null | undefined): string | undefined => (typeof v === "string" && v.trim() ? v.trim() : undefined);

/** VAT ที่รวมในราคา (ปัดครึ่งขึ้นระดับบิล) — gross × rate / (10000 + rate) */
export function includedVat(grossSatang: number, rateBp: number): number {
  if (rateBp <= 0 || grossSatang <= 0) return 0;
  const num = grossSatang * rateBp;
  const den = 10000 + rateBp;
  return Math.floor((2 * num + den) / (2 * den));
}

export function samplePayload(x: SampleInput): ReceiptPayload {
  const grand = LINE_SATANG * 2;
  const book = x.book;
  const vatSatang = book?.vatRegistered ? includedVat(grand, book.vatRateBp) : 0;
  const kind = receiptKindOf({ vatRegistered: !!book?.vatRegistered, posAbbreviatedInvoice: !!book?.posAbbreviatedInvoice, taxId: book?.taxId, vatSatang });
  const logoUrl = nonEmpty(x.header.logoUrl ?? undefined) ?? nonEmpty(book?.logoUrl);
  const taxId = nonEmpty(book?.taxId);
  return {
    docType: "SALE",
    kind,
    status: "PAID",
    copy: x.copy,
    paper: null,
    shop: {
      name: nonEmpty(x.header.name) ?? nonEmpty(book?.orgName) ?? "-",
      branchName: x.branchName ?? "",
      address: nonEmpty(x.header.address) ?? nonEmpty(book?.address) ?? "",
      phone: nonEmpty(x.header.phone) ?? nonEmpty(book?.phone) ?? "",
      ...(kind === "TAX_INVOICE_ABB" ? { taxId, branchNo: nonEmpty(book?.branchCode) ?? "00000" } : {}),
      ...(logoUrl ? { logoUrl } : {}),
    },
    device: {
      ...(nonEmpty(x.device?.posRegNo) ? { posRegNo: nonEmpty(x.device?.posRegNo)! } : {}),
      ...(nonEmpty(x.device?.name) ? { name: nonEmpty(x.device?.name)! } : {}),
    },
    doc: {
      receiptNo: x.receiptNo,
      issuedAt: x.issuedAt,
      ...(x.showCashier ? { cashierName: x.text.cashier } : {}),
    },
    lines: [
      { name: x.text.latte, qty: 1, unitPriceSatang: LINE_SATANG, lineTotalSatang: LINE_SATANG, discountSatang: 0, options: [] },
      { name: x.text.croissant, qty: 1, unitPriceSatang: LINE_SATANG, lineTotalSatang: LINE_SATANG, discountSatang: 0, options: [] },
    ],
    totals: {
      subtotalSatang: grand,
      lineDiscountSatang: 0,
      billDiscountSatang: 0,
      couponDiscountSatang: 0,
      tierDiscountSatang: 0,
      serviceChargeSatang: 0,
      grandTotalSatang: grand,
      vatBaseSatang: grand - vatSatang,
      vatSatang,
      vatRateBp: vatSatang > 0 && book ? book.vatRateBp : 0,
      tipSatang: 0,
    },
    payments: [{ type: "PROMPTPAY", amountSatang: grand }],
    ...(x.showPoints ? { member: { name: x.text.member, pointEarned: 17, pointBalance: 819 } } : {}),
    footer: { text: x.footer, qrEReceiptUrl: null, fullTaxInvoiceHint: kind === "TAX_INVOICE_ABB" },
    labels: { th: RECEIPT_LABELS.th, en: RECEIPT_LABELS.en },
  };
}
