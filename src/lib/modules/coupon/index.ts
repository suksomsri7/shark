// coupon/index.ts — facade เดียวที่โมดูลอื่นได้รับอนุญาตให้ import (fitness F2 · พิมพ์เขียว §5.11)
//
// 🔴 ทำไมเพิ่งมีไฟล์นี้ที่ M2.7: ก่อนหน้านี้ผู้เรียกข้ามโมดูลมีรายเดียว (POS `pos→coupon` chokepoint)
//    ที่ import `coupon/service` ตรง ๆ ตามหนี้เดิม · ระบบสมาชิก v2 (wallet) เป็นผู้เรียกรายใหม่
//    ⇒ เริ่มกติกาใหม่ที่นี่: **โมดูลอื่นเรียกผ่านไฟล์นี้เท่านั้น** (เหมือน `point/index.ts` ที่ M1.4)
//    หนี้ที่เหลือ: ย้าย `pos/service.ts` มาเรียกผ่านไฟล์นี้ (ไม่ใช่งานของใบนี้ — ห้ามแตะ pos ที่ M2.7)
// 🔴 ไฟล์นี้ห่อบาง ๆ ล้วน: ห้ามมีตรรกะธุรกิจ (ตรรกะอยู่ที่ `service.ts`)

export type {
  ValidateReason,
  ValidateOk,
  ValidateFail,
  ValidateResult,
  ValidateInput,
  RedeemInput,
  RedeemResult,
  ReleaseInput,
  CreateCouponInput,
  UpdateCouponInput,
  PerMemberCodeRow,
} from "./service";

export {
  /** คูปองโค้ดนี้ใช้กับยอดนี้ได้ไหม + ลดเท่าไหร่ (อ่านอย่างเดียว เรียกซ้ำได้) */
  validate,
  /** ตัดสิทธิ์คูปองแบบ atomic (ใส่ `tx` เพื่ออยู่ใน transaction ของบิลผู้เรียก) */
  redeem,
  /** คืนสิทธิ์คูปองเมื่อบิลถูกยกเลิก */
  release,
  /** คูปองของระบบคูปองหนึ่ง (กระเป๋าสิทธิ์ของลูกค้า · หน้าจัดการคูปอง) */
  listCoupons,
  getCoupon,
  createCoupon,
  toggleCoupon,
  /** M2.10 — แก้ไขคูปอง · ตั้งสถานะตรง ๆ · ออกโค้ดเฉพาะคนจากคูปองต้นแบบ */
  updateCoupon,
  setCouponActive,
  issuePerMemberCodes,
  listRedemptions,
  /** ข้อความไทยของเหตุผลที่คูปองใช้ไม่ได้ (ผู้เรียกเอาไปโชว์/โยน error ต่อ) */
  couponReasonText,
  /** ส่วนลดของคูปองใบหนึ่งต่อยอดเงินหนึ่ง (ปัดลง ไม่เกินยอด) */
  computeDiscount,
} from "./service";
