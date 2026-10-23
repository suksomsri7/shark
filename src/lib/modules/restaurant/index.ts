// restaurant/index.ts — facade ของโมดูลร้านอาหาร
// POS P2.4 ▸ โหมดโต๊ะของ POS (มติ CD1): ข้อมูลโต๊ะ/session/ออเดอร์/โต๊ะจองยังเป็นของร้านอาหาร (ผู้เขียนเดียว = restaurant/*) —
//   modules/pos/** เรียกผ่านไฟล์นี้เท่านั้น ด้วย `await import("@/lib/modules/restaurant")` (lazy: restaurant → pos มีอยู่แล้ว · โหลดหัวไฟล์ = วงโหลด)
//   เส้น fitness "pos→restaurant" (scripts/fitness.mts · รอยต่อเดียวกัน) · ไม่มี createSale · ไม่ปล่อย outbox event (ตัวรับอย่างเดียว)
//   ฟังก์ชัน *InTx = ทำงานในธุรกรรมของผู้เรียก (POS ยึดรอบร่าง/รายการ + ขาย + ปิดโต๊ะในธุรกรรมเดียว) ◂

// POS P2.4 ▸ ส่งรอบ (R5)
export { createOrderInTx, OrderInTxError, cancelOrderItem, type OrderInTxInput, type OrderInTxLine, type OrderError } from "./order";
// ◂ POS P2.4

// POS P2.4 ▸ เปิดโต๊ะ (R3 · ล็อกเดียวกับ openSession · Q9)
export { openTableSessionInTx } from "./table";
// ◂ POS P2.4

// POS P2.4 ▸ ผัง · session · รายการของบิล · ยึด/ผูก/ปลดรายการ · ปิด/เก็บโต๊ะ · คำขอจากโต๊ะ (R2 R6–R9)
export {
  tableFloorForPos,
  tableSessionForPos,
  tableUnpaidItemsForPos,
  tableItemIdsOfSale,
  tableDetailForPos,
  claimTableItemsInTx,
  settleTableItemsInTx,
  unlinkTableSaleInTx,
  closeTableSessionInTx,
  clearTableForPos,
  setTableSessionMemberForPos,
  tableRequestsForPos,
  setTableRequestStatusForPos,
  tableItemExistsForPos,
  tableCountForPos,
  lockOpenSessionInTx, // POS P2.4 ▸ fix 2 F2 ◂
  cancelTableItemInTx, // POS P2.4 ▸ fix 2 F4c ◂
  type PosFloorData,
  type PosFloorSession,
  type PosTableSession,
  type PosTableBillItem,
  type PosTableDetail,
  type PosTableRequest,
} from "./pos-tables";
// ◂ POS P2.4

// POS P2.4 ▸ โต๊ะจองแบบย่อ (R10 · มติ Q2)
export { createReservationForPos, reservationForPos, markReservationSeatedInTx, cancelReservationForPos, bookedReservationsOfTable, type PosReservationRow } from "./reservation";
// ◂ POS P2.4

// POS P2.6 ▸ จอครัวใหม่ (R1–R6 R11–R13 · มติ 1 3 4 10 · CD 2 3 7 16 18): รอบครัวของหน้าขาย/ออนไลน์ (createKitchenRoundInTx) · เดิน/ดึงกลับ/เร่ง/ยกเลิกตั๋ว
//   (kitchenMoveInTx · kitchenRushInTx · kitchenCancelInTx) · เพดานครัวค้าง (kitchenSetAutoAcceptMaxInTx) · ผู้อ่านของบอร์ด/expo/คิวค้าง/86 ·
//   ผู้เรียก = pos/kds.ts (lazy import) · ไม่มี createSale · ไม่ปล่อย outbox · ไม่เขียน MenuItem (ตัวนับเมนู = catalog-legacy)
export {
  createKitchenRoundInTx,
  kitchenMoveInTx,
  kitchenRushInTx,
  kitchenCancelInTx,
  kitchenSetStockTakenInTx, // fix1 H1
  kitchenLockRoundInTx, // P2.6U มติ 15: kdsRecall ล็อกรอบก่อนอ่านสถานะบิล/ออเดอร์
  kitchenSetAutoAcceptMaxInTx,
  kitchenSetPauseInTx, // POS P5.2 ▸ D11 ◂
  kitchenStationsForPos,
  kitchenSettingForPos,
  kitchenRoundsForPos,
  kitchenRoundForPos,
  kitchenItemForPos,
  kitchenRoundsOfOrdersForPos,
  kitchenSoldOutMenusForPos,
  kitchenRoutesForPos, // POS P2.14 ▸ UI-8 (U1) ◂
  type KitchenRoundInput,
  type KitchenRoundLine,
  type KitchenRoundResult,
  type KitchenRoundRow,
  type KitchenItemRow,
  type KitchenMoveInput,
  type KitchenSettingView,
  type KitchenStationRow,
} from "./kitchen";
// ◂ POS P2.6

// POS P2.5 ▸ แยกบิล · ย้ายโต๊ะ · รวมโต๊ะ (R4 R6 R7 R8 · มติ 7 8 · มติ §11 ข้อ 2 5): ล็อก session ของใบที่จ่าย · ปลดรายการตาม id (ตัวรับ void ของใบ) ·
//   ย้าย/รวมด้วยล็อก session + ล็อกโต๊ะ (ไม่ล็อกแถวรายการ) · ประตูเดิม moveSession/mergeSession ไม่ถูกแตะ (หมุด L3) · ผู้เรียก = pos/table.ts · pos/table-split.ts · pos/register.ts
export {
  lockTableSessionInTx,
  tableItemNamesForPos,
  tableItemsByIdsForPos,
  unlinkTableItemsInTx,
  moveTableSessionInTx,
  mergeTableSessionsInTx,
  type PosMergeSession,
} from "./pos-tables";
// ◂ POS P2.5

// POS P2.7 ▸ QR โต๊ะผ่านประตู POS (/q/t/<qrToken> · มติ 1 6 13 · CD7): มุมมองโต๊ะของแขก (อ่านอย่างเดียว — ไม่เปิด session ผีตอนเปิดหน้า/โพล) ·
//   ส่งรอบของแขกในธุรกรรมของ POS (ล็อก session + ตรวจ OPEN + merge chain · placedByUserId null) · เปลี่ยน QR ของโต๊ะ · ครัวเปิดไหม · คำขอจากโต๊ะ ·
//   ผู้เรียก = pos/qr-order.ts + pos/table.ts (lazy import) · ไม่มี createSale · ไม่ปล่อย outbox · ประตูเดิม storefront.ts ไม่ถูกแตะ
export {
  guestRoundInTx,
  guestTableViewForPos,
  rotateTableQrForPos,
  guestKitchenForPos,
  guestServiceRequestForPos,
  GuestRoundLineError,
  type GuestRoundInput,
  type GuestRoundResult,
  type GuestTableView,
  type GuestRoundView,
} from "./pos-qr";
// ◂ POS P2.7

// POS P2.7U ▸ read-only readers for the POS QR staff screens ◂
// fix1 F1: รอบ QR โต๊ะของวันนี้ (จอ 09) · QR ของโต๊ะ (แผงโต๊ะ/แผ่นพิมพ์) · อ่านอย่างเดียว · ผู้เรียก = pos/qr-staff.ts (lazy import)
export { guestRoundsTodayForPos, tableQrTokensForPos, type GuestRoundTodayRow, type TableQrTokenRow } from "./pos-qr-readers";
