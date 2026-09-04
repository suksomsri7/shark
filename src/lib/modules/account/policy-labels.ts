// policy-labels.ts — ชนิดข้อมูล + ป้ายไทยของ "นโยบายบัญชี" (§9.3 · WO 8.2)
//
// 🔴 ไฟล์นี้ต้อง **บริสุทธิ์ 100%** (ไม่ import อะไรที่แตะ DB) เพราะคอมโพเนนต์ฝั่ง client
//    (`PolicyPanel.tsx`) ใช้ป้ายชุดนี้ — ถ้าดึงมาจาก `policy.ts` ที่ import `tenantDb`
//    ตัว bundler จะลาก `pg` เข้าไปในบันเดิลเบราว์เซอร์แล้ว build พัง (เจอจริงตอน build WO 8.2)
//    `policy.ts` re-export ต่อให้ ⇒ ฝั่ง server เรียกที่เดิมได้เหมือนเดิม

import type { AccountPriceMode, AccountVatTiming } from "@prisma/client";

export type DupPolicy = "WARN" | "BLOCK";

/** ปลายทางเริ่มต้นเมื่อกด "ออกเอกสารต่อ" จากใบเสนอราคา */
export type ConvertQtTarget = "INVOICE" | "DEPOSIT_RECEIPT";

/**
 * ปลายทางเริ่มต้นเมื่อแปลงใบสั่งซื้อ
 * 🔴 SHARK ไม่มีเอกสารชนิด "AP" แยกต่างหาก (เจ้าหนี้เกิดตอนอนุมัติบันทึกซื้อ/ค่าใช้จ่าย)
 *    ⇒ ตัวเลือกจริงคือ บันทึกซื้อ (PURCHASE) หรือ บันทึกค่าใช้จ่าย (EXPENSE)
 *    ใบสั่งซื้อสินทรัพย์ยังบังคับไป ASSET_PURCHASE เหมือนเดิม (นโยบายไม่แตะ)
 */
export type ConvertPoTarget = "PURCHASE" | "EXPENSE";

export const DUP_POLICY_LABEL: Record<DupPolicy, string> = {
  WARN: "เตือน (บันทึกต่อได้)",
  BLOCK: "ห้าม (บันทึกไม่ได้)",
};

export const VAT_TIMING_LABEL: Record<AccountVatTiming, string> = {
  ON_ISSUE: "ตอนออกเอกสาร (ขายสินค้า)",
  ON_PAYMENT: "ตอนรับเงิน (ให้บริการ)",
};

export const PRICE_MODE_POLICY_LABEL: Record<AccountPriceMode, string> = {
  EXCL_VAT: "ราคายังไม่รวม VAT (แยก VAT)",
  INCL_VAT: "ราคารวม VAT แล้ว",
  NO_VAT: "ไม่มี VAT",
};

export const CONVERT_QT_LABEL: Record<ConvertQtTarget, string> = {
  INVOICE: "ใบแจ้งหนี้",
  DEPOSIT_RECEIPT: "ใบรับเงินมัดจำ",
};

export const CONVERT_PO_LABEL: Record<ConvertPoTarget, string> = {
  PURCHASE: "บันทึกซื้อ (ตั้งเจ้าหนี้)",
  EXPENSE: "บันทึกค่าใช้จ่าย",
};
