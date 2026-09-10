// giftcard/index.ts — facade เดียวที่โมดูลอื่นได้รับอนุญาตให้ import (fitness F2)
//
// 🔴 ห่อบาง ๆ ล้วน: ห้ามมีตรรกะธุรกิจ (ตรรกะอยู่ที่ service.ts)
// 🔴 ผู้เรียกภายในโมดูลเอง (หน้า/action) import ไฟล์ย่อยตรงได้ตามปกติ

export type {
  GiftCardCtx,
  GiftCardSettingsDto,
  GiftCardRowDto,
  GiftCardKpi,
  BalanceDto,
  SellInput,
  SellResult,
  SellRecipient,
  UseInput,
  UseResult,
  ReloadInput,
  CustomerGiftCardDto,
} from "./service";

export {
  GiftCardNotFoundError,
  GiftCardForbiddenError,
  GiftCardInputError,
  GiftCardStateError,
} from "./errors";

export {
  /** ตั้งค่าบัตรกำนัลของร้าน (ยังไม่เคยตั้ง = ค่าปริยาย) */
  getSettings,
  setSettings,
  /** ขายบัตรใบใหม่ผ่าน POS (ไม่ให้แต้ม · ลงบัญชีเป็นเงินรับล่วงหน้าเมื่อเปิดสวิตช์ผูกบัญชี) */
  sell,
  /** ยอดคงเหลือ/สถานะของบัตร — ไม่ต้องใช้ PIN */
  balance,
  /** ตัดยอดจากบัตร (ใส่ `tx` เพื่อให้อยู่ใน transaction ของบิลผู้เรียก) */
  use,
  /** เติมเงินเข้าบัตรผ่าน POS */
  reload,
  /** โอนเจ้าของบัตรให้สมาชิกอีกคน */
  transfer,
  /** ระงับ/ปลดระงับบัตร (บัตรหาย · สงสัยทุจริต) */
  suspend,
  unsuspend,
  /** คืนยอดกลับบัตรเมื่อบิลที่ใช้บัตรถูกยกเลิก (idempotent) */
  refundUse,
  /** คืนยอดของทุกรายการใช้บัตรในบิลใบหนึ่ง (M2.7 `member.releaseOnVoid` — ผู้เรียกรู้แค่ saleId) */
  refundUsesForSale,
  /** บัตรในมือของสมาชิกคนหนึ่ง — เลขปิดบัง ไม่มี PIN (กระเป๋าสิทธิ์ · LIFF · แผงสิทธิ์หน้าขาย) */
  listForCustomer,
  /** cron รายวัน — บัตรที่ถึงวันหมดอายุทุกร้าน */
  expireDue,
  /** รายการบัตร + KPI ของหน้าจอ */
  list,
  /** รวมสมาชิกซ้ำ → ย้ายบัตรไปคนที่เก็บไว้ (เรียกจาก member/profile.ts) */
  mergeGiftCards,
  /** ค่าคงที่ของกติกา (หน้าจอ/ข้อความช่วยเหลือใช้ตัวเลขชุดเดียวกับ service) */
  GIFTCARD_MIN_EXPIRY_MONTHS,
  GIFTCARD_PIN_MAX_FAIL,
  GIFTCARD_PIN_LOCK_MINUTES,
  GIFTCARD_SETTINGS_DEFAULT,
  maskNumber,
} from "./service";
