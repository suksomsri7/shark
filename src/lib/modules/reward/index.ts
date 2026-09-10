// reward/index.ts — facade เดียวที่โมดูลอื่นได้รับอนุญาตให้ import (fitness F2 · พิมพ์เขียว §5.11)
//
// 🔴 ห่อบาง ๆ ล้วน — ตรรกะธุรกิจอยู่ที่ `v2.ts` (M2.4) / `service.ts` (v1 เดิม)
// 🔴 v1 (`redeem`/`fulfillRedemption`/`cancelRedemption`/…) ยังใช้งานอยู่จริง (หน้า `reward/rewards|history|redeem`
//    · AI tools/proposals · `src/lib/actions/systems.ts`) — ไฟล์พวกนั้น import `./service` ตรงเหมือนเดิม
//    (อยู่นอก `src/lib/modules` จึงไม่ติด fitness F2 · ห้ามย้ายมาเรียกผ่านไฟล์นี้ในใบนี้ — ไม่ใช่ของ M2.4)
// 🔴 ผู้เรียกภายในโมดูลรางวัลเอง (หน้า/action ของ M2.4) import `./v2` ตรงได้ตามปกติ

export type {
  RewardCtx,
  RewardDto,
  CreateRewardV2Input,
  UpdateRewardV2Input,
  RedeemV2Input,
  RedeemV2Result,
  FulfilV2Input,
  FulfilV2Result,
  CancelV2Input,
  CancelV2Result,
  LookupRedemptionResult,
  ListRedemptionsFilter,
  RedemptionRowV2,
  CatalogItem,
} from "./v2";

export {
  /** หา ctx (REWARD systemId + POINT systemId ที่ผูก) จาก MEMBER systemId ของ route — หน้า/action เรียกก่อนทุกครั้ง */
  resolveRewardCtx,
  /** สร้าง/แก้/เปิดปิดของรางวัล (ต้องมีสิทธิ์ `member.loyalty.manage`) */
  createRewardV2,
  updateRewardV2,
  toggleReward,
  /** ของรางวัลทั้งหมด + สถิติ {pending, fulfilled} */
  listRewardsV2,
  /** แลกด้วยแต้ม และ/หรือ สแตมป์ */
  redeemV2,
  /** ส่งมอบ / ยกเลิก (คืนแต้ม/สแตมป์/สต็อก) — ต้องมีสิทธิ์ `member.loyalty.fulfil` */
  fulfilV2,
  cancelV2,
  /** cron รายวัน — รายการที่หมดอายุรับของทุกร้าน */
  expireDue,
  /** หารายการด้วย qrCode หรือ code (v1) — ใช้ที่แผงรับของหน้าร้าน */
  lookupRedemption,
  /** ประวัติการแลก */
  listRedemptionsV2,
  /** แคตตาล็อกสำหรับลูกค้าคนหนึ่ง (LIFF M2.9 ใช้ต่อ) */
  catalogFor,
} from "./v2";
