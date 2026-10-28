// ─────────────────────────────────────────────────────────────
// dorm/account-bridge.ts — บิลหอ (D.1 `DormBillResult`) → บรรทัดเอกสารของ facade บัญชี (ใบสั่ง D.2 §3.5)
//
// 🔴 pure ล้วน: ไม่แตะฐานข้อมูล · ไม่อ่านนาฬิกา · ไม่สุ่ม — import บัญชีได้ทาง `@/lib/modules/account` (facade · type เท่านั้น) และ `./calc`
// 🔴 1 บรรทัดบิล = 1 บรรทัดเอกสาร ลำดับเดิม · qty 1 × amountSatang (ยอดเอกสาร = computeBill ของ D.1 ทุกสตางค์ — VAT ต่อบรรทัดสูตรเดียวกับ computeTotals)
//    ห้ามส่ง qty = หน่วยมิเตอร์ × อัตรา: อัตรา ACTUAL_COST ปัดลง/ขั้นต่ำ/TARIFF ปัดท้าย ⇒ qty×อัตรา ≠ ยอดบิลได้
// 🔴 บรรทัดมิเตอร์ต้องแสดงหน่วย (+ ราคาต่อหน่วยเป็นบาท 2 ตำแหน่ง ถ้ามีอัตราเดียว) ในคำอธิบาย — กฎหมายให้แสดงหน่วย+อัตรา (D.1 §3.1)
// ─────────────────────────────────────────────────────────────

import type { ExternalDocLine } from "@/lib/modules/account";
import type { DormBillLine, DormBillResult } from "./calc";

/** สตางค์ (จำนวนเต็ม) → บาท 2 ตำแหน่ง ด้วยเลขจำนวนเต็มล้วน (ไม่ปัดเศษทศนิยมลอยตัว) */
function bahtText(satang: number): string {
  if (!Number.isInteger(satang)) return (satang / 100).toFixed(2);
  const sign = satang < 0 ? "-" : "";
  const a = Math.abs(satang);
  return `${sign}${Math.trunc(a / 100).toLocaleString("en-US")}.${String(a % 100).padStart(2, "0")}`;
}

function describe(l: DormBillLine): string {
  const units = l.meta?.units;
  if (typeof units !== "number") return l.labelTh;
  const rate = l.unitPriceSatang === null ? "" : ` × ${bahtText(l.unitPriceSatang)} บาท`;
  return `${l.labelTh} ${units.toLocaleString("en-US")} หน่วย${rate}`;
}

export function dormBillInvoiceLines(bill: DormBillResult): ExternalDocLine[] {
  return bill.lines.map((l) => ({
    description: describe(l),
    qty: 1,
    unitPriceSatang: l.amountSatang,
    taxKind: l.taxKind,
    meta: { ...(l.meta ?? {}), code: l.code },
  }));
}
