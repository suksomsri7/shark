// ─────────────────────────────────────────────────────────────
// trips/sellable-impl.ts — ทัวร์ในหน้าสัมผัส Sellable (CC §C)
// T0.5 เป็นเจ้าของสมาชิก `quote` ตัวเดียว (→ quoteTrips) · ที่เหลือเป็นของ T0.4 (ถือที่/ความจุ) และ T0.6 (ยืนยัน/ยกเลิก)
// ⚠️ ไฟล์นี้สร้างในเลน T0.5 เพราะ T0.4 ยังไม่ลงทรีนี้ — ตอน merge กับ T0.4 ให้เก็บสมาชิกของ T0.4 ทั้งหมด แล้วแทน `quote` ด้วยบรรทัดด้านล่าง
// ─────────────────────────────────────────────────────────────
import type { Sellable, SellResult } from "@/lib/core/sellable";
import { quoteTrips } from "./pricing";
import { PricingAbort } from "./pricing-core";

const notYet = <T>(): Promise<SellResult<T>> =>
  Promise.resolve({ ok: false, code: "KIND_NOT_SUPPORTED", messageTh: "ส่วนนี้ของการขายทัวร์ยังไม่เปิดใช้", retryable: false });

export const tripSellable: Sellable = {
  kind: "TRIP",
  quote: (ctx, req) => quoteTrips(ctx, req),
  availability: () => notYet(),
  hold: () => notYet(),
  confirm: () => notYet(),
  cancel: () => notYet(),
  // ปิดแบบล้ม (fail closed): ไม่มีแถวความจุ ≠ "ไม่มีอะไรต้องล็อก" — T0.4 เป็นเจ้าของ
  capacityRowsOf: () => Promise.reject(new PricingAbort("KIND_NOT_SUPPORTED", "NOT_YET", "ส่วนนี้ของการขายทัวร์ยังไม่เปิดใช้")),
  reserveInTx: () => notYet(),
  finalizeInTx: () => notYet(),
};
