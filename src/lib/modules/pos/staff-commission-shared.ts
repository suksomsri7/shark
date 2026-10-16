// staff-commission-shared.ts — คณิตบริสุทธิ์ของค่าคอมฯ พนักงานขาย (POS P3.5 S · R6 R7 R8 · มติ 1 8 9)
//
// 🔴 บริสุทธิ์ล้วน: ไม่ import prisma/db/ไฟล์ฝั่งเซิร์ฟเวอร์ (ข้อสอบ ST3) · import ได้แค่ refund-math (บริสุทธิ์) + ชนิดข้อมูล
// 🔴 เงินเป็นสตางค์จำนวนเต็ม · ปัดครึ่งขึ้นตัวเดียวกับการคืนเงิน (refund-math.halfUpDiv)
// 🔴 ชื่อ "staffCommission*" เสมอ — ไม่ปนกับค่าคอมฯ ของแพลตฟอร์ม (channelCommission* · channel-shared.ts)
import { halfUpDiv, lineNets } from "./refund-math";
import { POS_STAFF_COMMISSION_LIMITS, type PosStaffCommissionConfig } from "./settings-shared";

export type StaffCommissionRateSource = "PRODUCT" | "CATEGORY" | "DEFAULT";
export type StaffCommissionRate = { bp: number; fixedSatang: number; source: StaffCommissionRateSource };

const clamp = (v: unknown, lim: { min: number; max: number }): number => (typeof v === "number" && Number.isInteger(v) ? Math.min(lim.max, Math.max(lim.min, v)) : 0);
const own = (o: unknown, k: string | null | undefined): unknown =>
  k && o && typeof o === "object" && Object.prototype.hasOwnProperty.call(o, k) ? (o as Record<string, unknown>)[k] : undefined;

/**
 * มติ 1 — อัตราของบรรทัด: สินค้า > หมวด > ค่าปริยาย · แถวของสินค้า "ชนะทั้งแถว" (ช่องที่ไม่ได้ตั้ง = 0 · เช่นมีแค่ fixed ⇒ bp 0) ·
 * ตัดเข้าช่วงอีกชั้น (ค่าที่ไม่ได้ผ่านตัวอ่าน posStaffCommission ก็ปลอดภัย)
 */
export function resolveStaffCommissionRate(cfg: Pick<PosStaffCommissionConfig, "defaultBp" | "byCategory" | "byProduct">, line: { productId?: string | null; categoryId?: string | null }): StaffCommissionRate {
  const pick = (r: unknown, source: StaffCommissionRateSource): StaffCommissionRate | null => {
    if (!r || typeof r !== "object") return null;
    const x = r as { bp?: unknown; fixedSatang?: unknown };
    return { bp: clamp(x.bp, POS_STAFF_COMMISSION_LIMITS.bp), fixedSatang: clamp(x.fixedSatang, POS_STAFF_COMMISSION_LIMITS.fixedSatang), source };
  };
  return (
    pick(own(cfg?.byProduct, line?.productId ?? null), "PRODUCT") ??
    pick(own(cfg?.byCategory, line?.categoryId ?? null), "CATEGORY") ?? { bp: clamp(cfg?.defaultBp, POS_STAFF_COMMISSION_LIMITS.bp), fixedSatang: 0, source: "DEFAULT" }
  );
}

/** R7 มติ 8 — ค่าคอมฯ ของบรรทัด = ปัดครึ่งขึ้น(ฐาน × bp / 10000) + fixed × จำนวน · ฐาน ≤ 0 ⇒ ส่วนร้อยละ = 0 */
export function staffCommissionAmount(baseSatang: number, rate: { bp: number; fixedSatang: number }, qty: number): number {
  const pct = halfUpDiv(Math.max(0, Math.trunc(baseSatang)) * Math.max(0, Math.trunc(rate.bp)), 10_000);
  const fixed = Math.max(0, Math.trunc(rate.fixedSatang)) * Math.max(0, Math.trunc(qty));
  return pct + fixed;
}

/** R7 มติ 8 · CD-8 — ฐานต่อบรรทัด = ยอดสุทธิหลังส่วนลดระดับบิล (ท้ายบิล + คูปอง + สิทธิ์สมาชิก) ตัวเดียวกับบัญชี/การคืนเงิน (lineNets) · รวม VAT · ค่าบริการไม่ถูกเกลี่ย */
export function staffCommissionBases(lineTotals: number[], serviceChargeSatang: number, grandTotalSatang: number): number[] {
  return lineNets(lineTotals, serviceChargeSatang, grandTotalSatang);
}

/**
 * R8 มติ 9 — ส่วนที่กลับรายการของใบคืนหนึ่งใบ (ขนาด ≥ 0): ใบที่ทำให้บรรทัดคืนครบ = ที่เหลือทั้งหมด (accrual − prev) ·
 * ใบที่ยังไม่ครบ = min(ปัดครึ่งขึ้น(accrual × ยอดคืน / ยอดสุทธิของบรรทัด), ที่เหลือ) ⇒ Σ ทุกใบ = accrual พอดี (แบบ P2.1 R6)
 */
export function staffCommissionRefundShare(accrualSatang: number, lineNetSatang: number, refundSatang: number, prevReversedSatang: number, completesLine: boolean): number {
  const left = Math.max(0, accrualSatang - Math.max(0, prevReversedSatang));
  if (completesLine) return left;
  return Math.min(halfUpDiv(Math.max(0, accrualSatang) * Math.max(0, refundSatang), lineNetSatang), left);
}

/** เดือนไทย (YYYY-MM) ของเวลาหนึ่ง — periodKey ของสมุด */
export function staffCommissionPeriodOf(d: Date): string {
  return new Date(d.getTime() + 7 * 3_600_000).toISOString().slice(0, 7);
}
/** เดือนถัดไปของ YYYY-MM */
export function nextPeriodKey(pk: string): string {
  const [y, m] = pk.split("-").map(Number) as [number, number];
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
}
