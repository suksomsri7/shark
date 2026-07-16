// Inventory — สมอง (FREEZE) · contract C-1: จุดตัดสต็อกเดียว
// ต้นทุนถัวเฉลี่ยเคลื่อนที่ (moving average) เมื่อรับเข้า · ตัดออกไม่กระทบต้นทุน
export function movingAvgCost(oldQty: number, oldCost: number, inQty: number, inCost: number): number {
  const total = oldQty + inQty;
  if (total <= 0) return inCost;
  return Math.round((oldQty * oldCost + inQty * inCost) / total);
}
/** ต่ำกว่าจุดสั่งซื้อ = ควรเตือน */
export function needsReorder(onHand: number, reorderPoint: number): boolean {
  return reorderPoint > 0 && onHand <= reorderPoint;
}
/** ตัดจนติดลบ = ตั้งธง needsReview (ยอมขายไปก่อน ไม่ block) */
export function isNegative(balanceAfter: number): boolean {
  return balanceAfter < 0;
}
