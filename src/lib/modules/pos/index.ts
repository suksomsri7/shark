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
