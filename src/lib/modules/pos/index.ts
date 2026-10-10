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
  /** P1.6 R2 F1: บิลของสาขานี้ไปลง POS ไหน (O21) — ผู้เรียกใช้เป็นด่านก่อน claim */
  posSystemForSale,
  /** P1.6 R2 F2: สถานะของบิลที่ถือคีย์นี้ */
  saleStatusByKey,
  /** P1.9 R2 F5: error มีรหัสของ createSale/voidSale (เช่น SHIFT_CLOSED) — ชั้น API แปลงเป็นสถานะ HTTP */
  PosSaleError,
} from "./service";

// POS P1.1a ▸ แคตตาล็อกเดียว (PosProduct) — ผู้เขียน/ผู้อ่านเดียวของแคตตาล็อกขาย · ผู้เรียกนอกโมดูลใช้ `catalog.<fn>` ◂
// 🔁 R5: ทุกฟังก์ชันข้างล่างห่อขอบ facade ใน catalog.ts (`boundary`) — error ที่ไม่คาดคิด = CatalogError INTERNAL (ไม่มี error ดิบหลุด)
// 🔴 D5 (round 3): รายการชัดเจน ไม่ใช่ `export *` — ตัวบ่งชี้ผู้เรียกระดับระบบและ backfill ห้ามหลุดถึงโค้ดที่รับคำขอ
//    (สคริปต์ backfill import จาก ./catalog ตรง · fitness F15.5 คุม)
import {
  createProduct as catalogCreateProduct,
  updateProduct as catalogUpdateProduct,
  setPrice as catalogSetPrice,
  archive as catalogArchive,
  restore as catalogRestore,
  listForUnit as catalogListForUnit,
  byBarcode as catalogByBarcode,
  ensureForInvItem as catalogEnsureForInvItem,
  createCategory as catalogCreateCategory,
  checkCatalogWrite,
  // POS P1.2 ▸ R5 ตัวเลือก · R8 สูตรชุด ◂
  createOptionGroup as catalogCreateOptionGroup,
  setProductOptionGroups as catalogSetProductOptionGroups,
  setRecipe as catalogSetRecipe,
  // POS P2.2 ▸ R2 ราคาตามช่องทาง/สาขา (แทนทั้งชุด) · บวกราคาทั้งช่องทางเป็น % (ราคาตายตัว) ◂
  setChannelPrices as catalogSetChannelPrices,
  bulkChannelMarkup as catalogBulkChannelMarkup,
  // POS P2.3 ▸ R2 สูตร/BOM ของเมนู: ส่วนต่างต่อตัวเลือก (แทนทั้งชุด) · สวิตช์ตัดสต็อกตามสูตร ◂
  setRecipeChoiceLines as catalogSetRecipeChoiceLines,
  setBomEnabled as catalogSetBomEnabled,
} from "./catalog";
export const catalog = {
  createProduct: catalogCreateProduct,
  updateProduct: catalogUpdateProduct,
  setPrice: catalogSetPrice,
  archive: catalogArchive,
  /** R5 F1 — กู้คืนแถวที่เก็บถาวร (สิทธิ์/ขอบเขตเดียวกับ archive) */
  restore: catalogRestore,
  listForUnit: catalogListForUnit,
  byBarcode: catalogByBarcode,
  ensureForInvItem: catalogEnsureForInvItem,
  createCategory: catalogCreateCategory,
  /** D1 — ตัวตัดสินสิทธิ์เขียนตามขอบเขตสาขาของแถว (หน้า POS ใช้ร่วม) */
  checkCatalogWrite,
  /** P1.2 R5 — กลุ่มตัวเลือก (ตารางร้านอาหาร · ต่อสาขา) · ผูกกลุ่มกับสินค้าแทนทั้งชุด (MENU เขียน MenuItemOptionGroup ด้วย) */
  createOptionGroup: catalogCreateOptionGroup,
  setProductOptionGroups: catalogSetProductOptionGroups,
  /** P1.2 R8 — ส่วนประกอบของชุด/คอมโบ · P2.3 R2 — สูตรของเมนู (MENU: บันทึกสูตรแรก = เปิดตัดสต็อกตามสูตร · [] = ปิด) */
  setRecipe: catalogSetRecipe,
  /** P2.3 R2 — ส่วนต่างของสูตรต่อตัวเลือก (ขนาด/นม/ท็อปปิ้ง · จำนวนเต็มมีเครื่องหมาย · แทนทั้งชุด) */
  setRecipeChoiceLines: catalogSetRecipeChoiceLines,
  /** P2.3 R2 — เปิด/ปิดตัดสต็อกตามสูตรของเมนู (ไม่มีสูตร = เปิดไม่ได้) */
  setBomEnabled: catalogSetBomEnabled,
  /** P2.2 R2 — แถวราคาตามช่องทาง/สาขาของสินค้า 1 รายการ (แทนทั้งชุด · pos.product.setPrice ตามขอบเขตแถว) */
  setChannelPrices: catalogSetChannelPrices,
  /** P2.2 R2 CD6 — ราคาช่องทาง = ฐาน + X% ปัดครั้งเดียว เขียนเป็นราคาตายตัว (≤ 500 สินค้า หรือ 1 หมวด) */
  bulkChannelMarkup: catalogBulkChannelMarkup,
} as const;
export type { CatalogCtx, CatalogActor, CatalogClient, CatalogErrorCode, CatalogRowScope, CatalogWriteVerdict, PosProductView, PosOptionGroupView, TrackStockMode } from "./catalog";
export { CatalogError } from "./catalog";

// POS P2.2 ▸ R10 · C-6 `priceFor` — ราคาตามชั้น (ฐาน/สาขา/ช่องทาง/กติกา) ของสินค้าแคตตาล็อก ณ เวลาหนึ่ง (ร้านอาหาร/เว็บ/QR/แชท ใช้ตัวนี้ · P2.4 P2.7 P2.8) ◂
export { resolvePrices } from "./price";
export type { ResolvePricesInput, ResolvePricesResult, ResolvedPriceItem, PriceScope } from "./price";
export type { PriceSource, ChannelPriceView, ChannelPriceInputRow } from "./price-shared";

// POS P2.3 ▸ สูตร/BOM — กระจายสูตรต่อ 1 หน่วย (บริสุทธิ์ · ผู้เรียกร้านอาหาร/เว็บ/QR ส่ง components จากตัวเดียวกันใน P2.4/P2.7/P2.8) ·
//   ต้นทุนตามสูตร (R8 · เห็นต้นทุนเฉพาะ pos.product.manage / pos.report.view) ◂
export { expandRecipe, RECIPE_MAX_COMPONENTS } from "./recipe-shared";
export type { RecipeBaseLine, RecipeChoiceLine, RecipeComponent, ExpandRecipeResult } from "./recipe-shared";
export { recipeCost } from "./recipe";
export type { RecipeCostCtx, RecipeCostItem, RecipeCostLine, RecipeCostResult } from "./recipe";
