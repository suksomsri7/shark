// receipt-shared.ts — กติกาชนิดใบเสร็จ (POS P1.16 R2) · ฟังก์ชันบริสุทธิ์ ไม่แตะ DB — จอ 'use client' import ได้
// 🔴 ใช้ร่วมกันสองที่: receipt.ts (receiptPayload.kind · P1.10) และ bills.ts (billDetail.receiptKind) ⇒ สองหน้าตอบตรงกันเสมอ
// 🔴 TAX_INVOICE_ABB เฉพาะเมื่อครบ 4 ข้อ: สมุดจด VAT · เปิดใบกำกับอย่างย่อจาก POS · มีเลขผู้เสียภาษี (ตัดช่องว่างแล้วไม่ว่าง) ·
//    บิลมี VAT จริง (vatSatang > 0 · P1.10 แก้รอบ 1 F1) — ขาดข้อใด = RECEIPT

export type ReceiptKindInput = {
  vatRegistered: boolean;
  posAbbreviatedInvoice: boolean;
  taxId: string | null | undefined;
  vatSatang: number;
};

/** ชนิดใบเสร็จของบิล — "TAX_INVOICE_ABB" (ใบกำกับภาษีอย่างย่อ) หรือ "RECEIPT" */
export function receiptKindOf(input: ReceiptKindInput): "TAX_INVOICE_ABB" | "RECEIPT" {
  const taxId = typeof input.taxId === "string" ? input.taxId.trim() : "";
  return input.vatRegistered === true && input.posAbbreviatedInvoice === true && taxId.length > 0 && input.vatSatang > 0 ? "TAX_INVOICE_ABB" : "RECEIPT";
}
