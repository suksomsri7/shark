// pos/index.ts — facade ของโมดูล POS (จุดตัดเงินกลาง · contract 2.1)
//
// 🔴 ทำไมเพิ่งมีไฟล์นี้ตอน M2.6: โมดูลอื่นที่ต้อง "เก็บเงิน" เคยเรียก `pos/service` ตรง ๆ
//    ใบนี้ (บัตรกำนัล) เป็นตัวแรกที่ผูกเงิน + บัญชี + สมาชิกพร้อมกัน จึงบังคับตัวเองให้ผ่านสัญญาเดียว
//    เหมือนที่ `account/index.ts` ทำกับฝั่งบัญชี — ผู้เรียกใหม่ทุกรายต่อจากนี้ควรใช้ไฟล์นี้
// 🔴 ห่อบาง ๆ ล้วน: ห้ามมีตรรกะธุรกิจ (ตรรกะอยู่ที่ service.ts)
//    ผู้เรียก **ภายในโมดูล POS เอง** (หน้า/register/actions) import ไฟล์ย่อยตรงได้ตามเดิม

export type {
  CreateSaleInput,
  /** สิทธิ์สมาชิกที่เลือกใช้กับบิล (M2.8) — voucher / แต้ม / บัตรกำนัล */
  MemberSaleChoices,
  SaleResult,
  CloseCtx,
  PosDaySummary,
  PosDayBill,
  PayMethodLine,
} from "./service";

export {
  /** สร้างบิลขาย (จุดเดียวที่เงินเข้าระบบ — ยิง `pos.sale.paid` ให้บัญชี/แต้ม/สมาชิกเก็บต่อ) */
  createSale,
  /** ยกเลิกบิล (คืนแต้ม/คูปอง/สต็อก + ยิง `pos.sale.voided` ให้บัญชีกลับรายการ) */
  voidSale,
  /** สรุปยอดปิดวันของระบบ POS */
  closeDaySummary,
  closeDayBills,
  bkkToday,
} from "./service";

// POS P1.1a ▸ แคตตาล็อกเดียว (PosProduct) — ผู้เขียน/ผู้อ่านเดียวของแคตตาล็อกขาย · ผู้เรียกนอกโมดูลใช้ `catalog.<fn>` ◂
// 🔴 D5 (round 3): รายการชัดเจน ไม่ใช่ `export *` — ตัวบ่งชี้ผู้เรียกระดับระบบและ backfill ห้ามหลุดถึงโค้ดที่รับคำขอ
//    (สคริปต์ backfill import จาก ./catalog ตรง · fitness F15.5 คุม)
import {
  createProduct as catalogCreateProduct,
  updateProduct as catalogUpdateProduct,
  setPrice as catalogSetPrice,
  archive as catalogArchive,
  listForUnit as catalogListForUnit,
  byBarcode as catalogByBarcode,
  ensureForInvItem as catalogEnsureForInvItem,
  createCategory as catalogCreateCategory,
  checkCatalogWrite,
} from "./catalog";
export const catalog = {
  createProduct: catalogCreateProduct,
  updateProduct: catalogUpdateProduct,
  setPrice: catalogSetPrice,
  archive: catalogArchive,
  listForUnit: catalogListForUnit,
  byBarcode: catalogByBarcode,
  ensureForInvItem: catalogEnsureForInvItem,
  createCategory: catalogCreateCategory,
  /** D1 — ตัวตัดสินสิทธิ์เขียนตามขอบเขตสาขาของแถว (หน้า POS ใช้ร่วม) */
  checkCatalogWrite,
} as const;
export type { CatalogCtx, CatalogActor, CatalogClient, CatalogErrorCode, CatalogRowScope, CatalogWriteVerdict, PosProductView, PosOptionGroupView, TrackStockMode } from "./catalog";
export { CatalogError } from "./catalog";
