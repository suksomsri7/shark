// vat.ts — ถอด VAT ออกจากยอดที่ "รวม VAT แล้ว" (INCLUDED) · สูตรเดียวของทั้งระบบ (POS P1.6 R1)
//
// 🔴 ผู้ใช้: pos/service.ts createSale (เก็บ PosSale.vatSatang) + account/index.ts applyExternalSale (ลงบัญชี)
//    ⇒ VAT บนบิล = VAT ในสมุดบัญชี ทุกสตางค์ · ห้ามเขียนสูตรถอด VAT ซ้ำที่อื่น
// 🔴 บริสุทธิ์ล้วน: ไม่ import อะไรเลย (อยู่นอก src/lib/modules ⇒ pos และ account import ได้โดยไม่เกิดเส้นพึ่งพาใหม่ระหว่างโมดูล)
//
// สูตร (= สะพานบัญชีเดิม `base = Math.round(gross / (1 + rate))` · `vat = gross − base`) แต่คิดด้วยจำนวนเต็มล้วน:
//   base = ปัดครึ่งขึ้นของ gross × 10000 / (10000 + rateBp) · vat = gross − base
//   (จำนวนเต็มตรงตัว ไม่มีเศษทศนิยมลอยตัว · ยอดถึง 10^9 สตางค์ × 20000 < 2^53)
// อัตรา ≤ 0 = ไม่มี VAT (base = gross)

export type IncludedVatSplit = { baseSatang: number; vatSatang: number };

const BP_FULL = 10_000;

export function splitIncludedVat(grossSatang: number, rateBp: number): IncludedVatSplit {
  if (!(rateBp > 0)) return { baseSatang: grossSatang, vatSatang: 0 };
  const den = BP_FULL + rateBp;
  // ปัดครึ่งไปทาง +∞ แบบเดียวกับ Math.round · ยอด/อัตราไม่ใช่จำนวนเต็ม (ไม่ควรเกิด) = สูตรทศนิยมเดิมของสะพานตรงตัว
  const baseSatang =
    Number.isInteger(grossSatang) && Number.isInteger(rateBp)
      ? Math.floor((2 * grossSatang * BP_FULL + den) / (2 * den))
      : Math.round(grossSatang / (1 + rateBp / BP_FULL));
  return { baseSatang, vatSatang: grossSatang - baseSatang };
}
