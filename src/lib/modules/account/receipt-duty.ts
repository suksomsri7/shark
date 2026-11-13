// receipt-duty.ts — ACC T2c A6 · เกณฑ์ใบรับ ม.105 (pure — ใช้ได้ทั้ง server และจอ client)
import { legalWarning, type LegalWarning } from "@/lib/core/settings/legal/warnings";
import { receiptDutyRowOf } from "@/lib/core/settings/legal/th-tax-2569";

/**
 * ACC T2c A6 ▸ คำเตือนเมื่อปิดใบเสร็จอัตโนมัติ — เกณฑ์ใบรับ ม.105 จากตารางค่ากฎหมาย (SYSTEM_RECEIPT_DUTY_ROWS · skill domain-accounting-books.md §ง1 [V])
 *   ร้านจด VAT = เกิน ฿100 (+ บอกเกณฑ์ ฿1,000 ของกิจการรายย่อย ม.86/8) · ร้านไม่จด VAT = เกิน ฿100 (ผู้ได้รับยกเว้น ม.81/81/1) ◂
 */
export function receiptAutoOffWarning(vatRegistered: boolean, at: Date = new Date()): LegalWarning {
  const ymd = new Date(at.getTime() + 7 * 3600_000).toISOString().slice(0, 10);
  const main = receiptDutyRowOf(vatRegistered ? "VAT_OTHER" : "NON_VAT", ymd);
  const small = vatRegistered ? receiptDutyRowOf("VAT_SMALL_86_8", ymd) : null;
  const baht = (v: number | null | undefined) => ((v ?? 0) / 100).toLocaleString("en-US", { maximumFractionDigits: 2 });
  return legalWarning("RECEIPT_AUTO_OFF", {
    threshold: baht(main?.value),
    who: main?.labelTh ?? "",
    ...(small ? { small: `${small.labelTh} ใช้เกณฑ์เกิน ฿${baht(small.value)}` } : {}),
  });
}

