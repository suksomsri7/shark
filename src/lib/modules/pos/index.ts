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
  /** HF-TX: งานหลัง commit ของบิล (ตัดสต็อก + ระบายคิว) — ผู้เรียกที่ส่ง `callerTx(tx)` ให้ createSale เรียกหลัง `$transaction` resolve */
  afterSaleCommitted,
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
  // POS P2.8 ▸ R9 ราคาหน้าเว็บร้าน (อ่านสองทาง: แถว WEB ของแถวแคตตาล็อก หรือราคา ShopProduct) ◂
  webPricesForShop as catalogWebPricesForShop,
  // POS P2.6 ▸ R9 R10 ผู้เขียน/ผู้อ่านความพร้อมขาย (86) ต่อสาขา (CD 9 11) ◂
  setAvailability as catalogSetAvailability,
  availabilityFor as catalogAvailabilityFor,
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
  /** P2.8 R9 — ราคาหน้าเว็บร้านของ ShopProduct ชุดหนึ่ง (เว็บร้านเรียก · อ่านอย่างเดียว · ชน = ราคา ShopProduct ของตัวเอง) */
  webPricesForShop: catalogWebPricesForShop,
  /** POS P2.6 ▸ R9 — 86/คืนขายต่อสาขา (ctx, actor, input) คืนคำปฏิเสธ · event pos.product.availability เฉพาะเมื่อพลิก ◂ */
  setAvailability: catalogSetAvailability,
  /** POS P2.6 ▸ R10 — ความพร้อมขายของสินค้าที่สาขา { [productId]: boolean } (หน้าเว็บร้าน/09) ◂ */
  availabilityFor: catalogAvailabilityFor,
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

// POS P2.8 ▸ ออเดอร์ทุกช่องทาง (จอ 09) — ผู้เขียนเดียว pos/order.ts · ผู้เรียกนอกโมดูล (เว็บร้าน · composition root) ใช้ `orders.<fn>` ·
//   ฟังก์ชันผู้ใช้รับ (ctx, actor, input) คืน {ok:false, code, message} ไม่ throw · ingestInTx/sourceCancelledInTx = ประตูระบบในธุรกรรมของผู้เรียก ◂
import {
  ingestOrder as orderIngestOrder,
  ingestInTx as orderIngestInTx,
  sourceCancelledInTx as orderSourceCancelledInTx,
  afterCommit as orderAfterCommit,
  acceptOrder as orderAcceptOrder,
  rejectOrder as orderRejectOrder,
  markPreparing as orderMarkPreparing,
  markReady as orderMarkReady,
  handOver as orderHandOver,
  cancelOrder as orderCancelOrder,
  payOrder as orderPayOrder,
  setPrepMinutes as orderSetPrepMinutes,
  setChannelOrderSettings as orderSetChannelOrderSettings,
  listOrders as orderListOrders,
  getOrder as orderGetOrder,
  onShopOrderPaid as orderOnShopOrderPaid,
  onSaleVoided as orderOnSaleVoided,
  webLineSources as orderWebLineSources,
  // POS P2.8 fix รอบ 3 (H1) ▸ การรับเงินของเว็บร้านสะท้อนในธุรกรรมของเว็บร้านเอง ◂
  webClaimInTx as orderWebClaimInTx,
  webSaleBoundInTx as orderWebSaleBoundInTx,
  webClaimRevertInTx as orderWebClaimRevertInTx,
  kitchenProgressInTx as orderKitchenProgressInTx, // POS P2.6 ▸ R11 ◂
  onIntentPaid as orderOnIntentPaid, // POS P2.7 ▸ ตัวรับ pos.payment.intent_paid ◂
  expirePreorders as orderExpirePreorders, // POS P2.7 ▸ ตัวกวาดรายชั่วโมง ◂
} from "./order";
export const orders = {
  /** R3 — พนักงานคีย์ออเดอร์ (MANUAL/CHAT/ช่องทางกำหนดเอง) · X1 idempotency */
  ingestOrder: orderIngestOrder,
  /** R4 — ประตูระบบ (เว็บร้านเรียกใน tx ของ createOrder) · ไม่มี POS = {ok:true, skipped:true} */
  ingestInTx: orderIngestInTx,
  /** R4 — ต้นทางยกเลิก (เว็บร้านยกเลิกออเดอร์รอชำระ) ใน tx ของผู้เรียก */
  sourceCancelledInTx: orderSourceCancelledInTx,
  /** หลัง commit ของผู้เรียกประตูระบบ — ระบายคิว pos.order.* */
  afterCommit: orderAfterCommit,
  acceptOrder: orderAcceptOrder,
  rejectOrder: orderRejectOrder,
  markPreparing: orderMarkPreparing,
  markReady: orderMarkReady,
  handOver: orderHandOver,
  cancelOrder: orderCancelOrder,
  payOrder: orderPayOrder,
  setPrepMinutes: orderSetPrepMinutes,
  setChannelOrderSettings: orderSetChannelOrderSettings,
  listOrders: orderListOrders,
  getOrder: orderGetOrder,
  /** ตัวรับคิว (composition root): shop.order.paid → ผูกบิล ECOM · pos.sale.voided → ยกเลิก/คืนเงินของออเดอร์ */
  onShopOrderPaid: orderOnShopOrderPaid,
  onSaleVoided: orderOnSaleVoided,
  /** ที่มาของราคาบรรทัดเว็บร้าน (บรรทัดบิลตอนยืนยันรับเงิน) */
  webLineSources: orderWebLineSources,
  /** H1 — เว็บร้าน claim รับเงิน: ล็อกออเดอร์ · ปฏิเสธ/ยกเลิกแล้ว = {ok:false, code ORDER_CLOSED} · อื่น = PAID (ในธุรกรรม claim) */
  webClaimInTx: orderWebClaimInTx,
  /** H1 — ผูกบิล ECOM (ในธุรกรรมที่เว็บร้านเขียน posSaleId) */
  webSaleBoundInTx: orderWebSaleBoundInTx,
  /** H1 — เว็บร้านคืนการ claim (บิลไม่เกิด) ⇒ ออเดอร์กลับเป็น UNPAID */
  webClaimRevertInTx: orderWebClaimRevertInTx,
  // POS P2.7 ▸ จ่ายก่อน (QR_ORDER): ตัวรับ intent_paid (composition root) · ตัวกวาดออเดอร์ที่เลยเวลาจ่าย (cron รายชั่วโมง) ◂
  onIntentPaid: orderOnIntentPaid,
  expirePreorders: orderExpirePreorders,
  /** POS P2.6 ▸ R11 CD7 — ครัวขับ ACCEPTED→PREPARING→READY ในธุรกรรมของจอครัว (pos/kds.ts เรียก · ไม่ถอยสถานะ) ◂ */
  kitchenProgressInTx: orderKitchenProgressInTx,
} as const;
export type * from "./order-shared";
export { ORDER_ADAPTERS } from "./order-adapters";
export type { OrderAdapter, OrderAdapterKind } from "./order-adapters";

// POS P3.7 ▸ แชท (ใบเสร็จอัตโนมัติ · สถานะออเดอร์ · ขอชำระในแชท ประตู A · ลิงก์ติดแท็ก ประตู B · บอทตามกฎ) — ผู้เรียกนอกโมดูล = composition root
//   `src/lib/pos-chat-bridges.ts` (POS ไม่ import แชท) · `chatLink.<fn>` อ่านตาราง POS แล้วคืนเป้าหมาย/ข้อเท็จจริง · ตัวส่งอยู่ที่รอยต่อของแชท · รายการชัดเจน (ไม่ใช่ export *)
import {
  chatPreorderLink as chatLinkPreorderLink,
  orderChatPlan as chatLinkOrderPlan,
  orderIdOfIntent as chatLinkOrderIdOfIntent,
  ordersForChat as chatLinkOrdersForChat,
  orderStatusUrl as chatLinkStatusUrl,
  posChatSettingsOf as chatLinkSettingsOf,
  posSystemForChatUnit as chatLinkSystemForUnit,
  receiptChatPlan as chatLinkReceiptPlan,
  refundChatPlan as chatLinkRefundPlan,
  setPosChatSettings as chatLinkSetSettings,
} from "./chat-link";
import { requestChatPayment as chatLinkRequestPayment } from "./chat-order";
export const chatLink = {
  settingsOf: chatLinkSettingsOf,
  systemForUnit: chatLinkSystemForUnit,
  setSettings: chatLinkSetSettings,
  receiptPlan: chatLinkReceiptPlan,
  refundPlan: chatLinkRefundPlan,
  orderPlan: chatLinkOrderPlan,
  orderIdOfIntent: chatLinkOrderIdOfIntent,
  ordersForChat: chatLinkOrdersForChat,
  statusUrl: chatLinkStatusUrl,
  preorderLink: chatLinkPreorderLink,
  requestPayment: chatLinkRequestPayment,
} as const;
export type { ChatPaymentPosResult, ChatPaymentRefusal, ChatPaymentCode } from "./chat-order";
export type { PosChatTarget, ReceiptChatPlan, RefundChatPlan, OrderChatPlan, OrderChatFacts, ChatOrderItem, ChatPreorderLinkResult, PosChatSettingsResult } from "./chat-link";
export { POS_CHAT_DEFAULTS, POS_CHAT_STATUS_LABELS, bangkokHHmm, chatMoney, chatReasonLabel, chatText, matchBotIntent, posChatLang, posChatSettings, withStatusLink } from "./chat-link-shared";
export type { PosBotIntent, PosChatLang, PosChatSettings, PosChatStatusKind, PosChatTextKey } from "./chat-link-shared";
// ◂ POS P3.7
