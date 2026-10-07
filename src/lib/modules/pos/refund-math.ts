// POS P1.8 ▸ คณิตศาสตร์เงินของการคืนเงิน (บริสุทธิ์ล้วน · ไม่แตะ DB · ไม่ import อะไร) ◂
//
// 🔴 ผู้ใช้: pos/account-bridge.ts (เกลี่ยส่วนลดท้ายบิลลงบรรทัดก่อนส่งเอกสารบัญชี) + pos/refund.ts (ยอดคืนต่อบรรทัด)
//    ⇒ "ยอดสุทธิของบรรทัด" ที่ใช้คิดเงินคืน = ตัวเดียวกับที่บัญชีเห็น ทุกสตางค์ (มติ R5)
// สูตร (มติ R5 · CD4 · CD5 · ข้อสอบ qc-pos-p1.8):
//   ส่วนลดระดับบิล D = Σ lineTotal + ค่าบริการ − grandTotal (ท้ายบิล + คูปอง + สิทธิ์สมาชิก) → เกลี่ยแบบ largest remainder
//     น้ำหนัก = lineTotal ของบรรทัดสินค้า (ค่าบริการไม่ถูกเกลี่ย) ⇒ net(บรรทัด) = lineTotal − ส่วนที่เกลี่ย
//   คืน q หน่วยจาก Q: ยังไม่ครบ = ปัดครึ่งขึ้น(net × q / Q) · ครบหน่วยสุดท้าย = net − Σ ที่คืนไปแล้วของบรรทัดนั้น
//   ค่าบริการ: ใบที่ยังไม่ครบบิล = ปัดครึ่งขึ้น(SC × Σ ยอดบรรทัดที่คืน / Σ net ทั้งบิล) · ใบที่ทำให้ครบทั้งบิล = SC − Σ SC ที่คืนไปแล้ว
//   ทิปไม่คืนเลย (ไม่อยู่ใน grandTotal)

/**
 * เกลี่ย "ส่วนลดท้ายบิล/คูปอง" ลงบรรทัดตามสัดส่วนน้ำหนัก (largest remainder — ผลรวมตรงเป๊ะ · เศษเท่ากัน = ลำดับบรรทัด)
 * 🔴 ย้ายมาจาก account-bridge.ts (P1.8) — สะพานบัญชีและการคืนเงินต้องเกลี่ยด้วยตัวเดียวกัน
 */
export function allocateBillDiscount(weights: number[], total: number): number[] {
  const sumW = weights.reduce((a, b) => a + b, 0);
  if (total <= 0 || sumW <= 0) return weights.map(() => 0);
  const raw = weights.map((w) => (total * w) / sumW);
  const out = raw.map((r) => Math.floor(r));
  let rem = total - out.reduce((a, b) => a + b, 0);
  const order = raw.map((r, i) => ({ i, frac: r - Math.floor(r) })).sort((a, b) => b.frac - a.frac);
  for (let k = 0; rem > 0 && order.length > 0; k++, rem--) out[order[k % order.length]!.i] += 1;
  return out;
}

/** ปัดครึ่งขึ้นของ a/b (a ≥ 0 · b > 0 · จำนวนเต็มล้วน) · b ≤ 0 = 0 */
export function halfUpDiv(a: number, b: number): number {
  if (!(b > 0)) return 0;
  if (a <= 0) return 0;
  return Math.floor((2 * a + b) / (2 * b));
}

/** ยอดสุทธิของแต่ละบรรทัดของบิล (ลำดับเดียวกับ lines) = lineTotal − ส่วนลดระดับบิลที่เกลี่ยลงมา */
export function lineNets(lineTotals: number[], serviceChargeSatang: number, grandTotalSatang: number): number[] {
  const d = lineTotals.reduce((a, b) => a + b, 0) + serviceChargeSatang - grandTotalSatang;
  const alloc = allocateBillDiscount(
    lineTotals.map((t) => Math.max(0, t)),
    d,
  );
  return lineTotals.map((t, i) => t - alloc[i]!);
}

/**
 * ยอดคืนของบรรทัดหนึ่ง: คืน q หน่วย (จาก Q) โดยคืนไปแล้ว prevQty หน่วย รวม prevAmount สตางค์
 * ครบหน่วยสุดท้าย = เศษที่เหลือทั้งหมด ⇒ Σ ใบคืนของบรรทัด = net ของบรรทัดเป๊ะ (CD5)
 */
export function refundLineAmount(net: number, qtyTotal: number, prevQty: number, prevAmount: number, q: number): number {
  if (prevQty + q >= qtyTotal) return Math.max(0, net - prevAmount);
  return halfUpDiv(Math.max(0, net) * q, qtyTotal);
}

/** ค่าบริการของใบคืน (CD4) — full = ใบนี้ทำให้ทุกบรรทัดคืนครบ */
export function refundServiceCharge(sc: number, linesRefundSatang: number, netTotal: number, prevSc: number, full: boolean): number {
  if (sc <= 0) return 0;
  if (full) return Math.max(0, sc - prevSc);
  return Math.min(Math.max(0, sc - prevSc), halfUpDiv(sc * linesRefundSatang, netTotal));
}
