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
