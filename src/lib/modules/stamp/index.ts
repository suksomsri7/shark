// stamp/index.ts — facade เดียวที่โมดูลอื่นได้รับอนุญาตให้ import (fitness F2)
//
// 🔴 ห่อบาง ๆ ล้วน: ห้ามมีตรรกะธุรกิจ (ตรรกะอยู่ที่ service.ts)
// 🔴 ผู้เรียกภายในโมดูลเอง (หน้า/action) import ไฟล์ย่อยตรงได้ตามปกติ
// ผู้เรียกจริงวันนี้: POS (สแตมป์หลังปิดบิล) · จอง (มาตามนัด) · สมาชิก (รวมคน) · cron (หมดอายุ)

export type {
  StampCtx,
  StampRuleConfig,
  StampRewardConfig,
  StampRefType,
  StampCardDto,
  StampCardStats,
  CreateCardInput,
  UpdateCardInput,
  AddStampInput,
  AddStampResult,
  ProgressDto,
  AutoStampResult,
} from "./service";

export { StampNotFoundError, StampForbiddenError, StampInputError, StampStateError } from "./errors";

export {
  /** สแตมป์การ์ดทั้งหมดของระบบสมาชิกนี้ + สถิติต่อใบ */
  listCards,
  getCard,
  /** สร้าง/แก้/เปิดปิดใบ (ต้องมีสิทธิ์ `member.loyalty.manage`) */
  createCard,
  updateCard,
  toggleCard,
  /** ประทับตรา — ทางเข้าเดียวของทั้งระบบ (พนักงานกด · ลูกค้าใส่ PIN · อัตโนมัติ) */
  addStamp,
  /** ยกเลิกตรา 1 รายการ / ยกเลิกตราทั้งหมดของบิลที่ถูก void */
  voidStampEvent,
  voidStampsForSale,
  /** ใบสะสมของลูกค้า 1 คน (แผงสิทธิ์ที่หน้าขาย · LIFF · โปรไฟล์ 360) */
  progressFor,
  /** สถิติของใบเดียว {active, completed, rewardsPaid} */
  cardStats,
  /** ตราของใบจริงที่คืบหน้ามากที่สุด (ตัวอย่างการ์ดในหน้าตั้งค่า) */
  sampleStamps,
  /** ทางอัตโนมัติ: บิลปิดแล้ว / ลูกค้ามาตามนัด */
  autoStampFromSale,
  autoStampFromVisit,
  /** cron รายวัน — ใบที่ถึงวันหมดอายุทุกร้าน */
  expireDue,
  /** รวมสมาชิกซ้ำ → ย้าย/บวกตราไปคนที่เก็บไว้ (เรียกจาก member/profile.ts) */
  mergeProgress,
  /** สะพานจากคิว outbox — รู้แค่ tenant + id ของบิล/นัด แล้วหาระบบสมาชิกเอง */
  autoStampFromSaleEvent,
  voidStampsForSaleEvent,
  autoStampFromVisitEvent,
  /** ค่าคงที่ของกติกา (หน้าจอใช้ตัวเลขชุดเดียวกับ service) */
  STAMP_MIN_SLOTS,
  STAMP_MAX_SLOTS,
  RULE_KINDS,
  REWARD_KINDS,
  ruleConfigOf,
} from "./service";
