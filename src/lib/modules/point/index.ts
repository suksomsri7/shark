// point/index.ts — facade เดียวที่โมดูลอื่นได้รับอนุญาตให้ import (fitness F2 · พิมพ์เขียว §5.11)
//
// 🔴 ทำไมเพิ่งมีไฟล์นี้ที่ M1.4: ก่อนหน้านี้ผู้เรียกทุกตัว (POS/รางวัล/หน้าจอของโมดูลแต้มเอง)
//    import `point/service` ตรง ๆ ซึ่งอยู่ในหนี้เดิมของ fitness · ระบบสมาชิก v2 เป็นผู้เรียกรายใหม่
//    ⇒ เริ่มกติกาใหม่ที่นี่: **โมดูลอื่นเรียกผ่านไฟล์นี้เท่านั้น** (เหมือน `party/index.ts`)
// 🔴 ไฟล์นี้ห่อบาง ๆ ล้วน — ห้ามใส่ตรรกะธุรกิจ (ตรรกะอยู่ที่ `service.ts` เจ้าของโมดูล)
//    ชุดฟังก์ชันเต็ม (computeEarn / earnWithLot / burnFifo / transfer) มาที่ M2.1 ตามพิมพ์เขียว §5.5

export {
  /** ให้แต้มจากการขาย (คิดจากยอด + อัตราของร้าน) */
  earn,
  /** ตัดแต้ม (แลกของ/ส่วนลด) */
  burn,
  /** คืน/เพิ่มแต้มจำนวนเป๊ะ ๆ พร้อม idempotencyKey (เช่น โอนแต้มตอนรวมสมาชิกซ้ำ) */
  credit,
  /** ปรับแต้มด้วยมือ (บวก/ลบ) — ใช้ตอนหักแต้มออกจากคนที่ถูกรวมเข้าอีกคน */
  adjustPoints,
  /** กลับรายการทั้งหมดของ ref หนึ่ง (void บิล) */
  reverse,
  /** ยอดแต้มคงเหลือของสมาชิกในระบบแต้มที่ระบุ */
  getBalance,
  /** ยอดแต้มรวมของสมาชิก โดย resolve ระบบแต้มที่ผูกสาขาเดียวกับระบบสมาชิก (หน้า 360 ใช้ตัวนี้) */
  getCustomerPoints,
  /** รายการแต้มทั้งหมดของสมาชิก (M1.7 — สำเนาข้อมูลตาม PDPA) */
  listCustomerLedger,
  /** อ่านการตั้งค่าแต้มของร้าน (v2 · 15 ช่อง — สร้างค่าปริยายให้ถ้ายังไม่เคยตั้ง) */
  getPointSettings,
  /** บันทึกการตั้งค่าแต้ม (ส่งเฉพาะช่องที่จะแก้ก็ได้) */
  setPointSettings,
  // ── M2.2 ──
  /** systemId ของ "ระบบแต้ม" ทั้งหมดที่ผูกกับ "ระบบสมาชิก" นี้ */
  resolvePointSystemIds,
  /** การ์ด "ผลกระทบ" ของหน้าตั้งค่าแต้ม (ภาพ 16) */
  previewPointImpact,
  /** ค่าตั้งค่าแต้มที่ไม่มีคอลัมน์ของตัวเอง (ใช้ได้ที่ไหน/ค่าธรรมเนียมโอน/ต้อง OTP) */
  getPointExtras,
  setPointExtras,
  /** ledger รวม + KPI ของหน้า `/member/points` */
  listPointLedgerForMemberSystem,
  pointKpiForMemberSystem,
  /** ล็อตที่ใกล้หมดอายุของหน้า `/member/points/expiring` */
  expiringForMemberSystem,
  /** สมาชิกที่ปรับแต้มในระบบแต้มที่ระบุได้ (หน้าปรับแต้ม) */
  listPointCustomers,
} from "./service";

export type {
  CustomerLedgerRow,
  SetPointSettingsInput,
  PointImpactPreview,
  PointExtras,
  PointLedgerFilter,
  PointLedgerRow,
  PointLedgerKpi,
  ExpiringLotRow,
} from "./service";

export { adjustPoints as adjust } from "./service";

// ── แต้ม v2: กฎได้แต้ม + ล็อต/หมดอายุ (M2.1 · พิมพ์เขียว §5.5 §11.4) ──
export type { PointCtx } from "./internal";

export type {
  PointRuleDto,
  UpsertRuleInput,
  SaleLineInput,
  SaleForEarn,
  ComputeEarnInput,
  ComputeEarnResult,
} from "./rules";

export {
  /** กฎได้แต้มทั้งหมดของระบบแต้ม (เรียงตามลำดับที่ใช้คิด) */
  listRules,
  /** เพิ่ม/แก้กฎได้แต้ม (ต้องมีสิทธิ์ `member.settings.manage`) */
  upsertRule,
  toggleRule,
  deleteRule,
  /** คิดแต้มที่จะได้จากบิล/เหตุการณ์ — อ่านอย่างเดียว ไม่เขียนฐานข้อมูล (POS เรียกก่อนปิดบิล) */
  computeEarn,
} from "./rules";

export type {
  EarnBreakdownRow,
  EarnWithLotInput,
  EarnWithLotResult,
  BurnFifoInput,
  BurnFifoResult,
  LotUse,
  ExpiringLot,
} from "./lots";

export {
  /** ให้แต้ม 1 ครั้ง = ledger EARN + ล็อตที่มีวันหมดอายุของตัวเอง */
  earnWithLot,
  /** ตัดแต้มโดยกินล็อตที่หมดอายุเร็วสุดก่อน */
  burnFifo,
  /** กลับรายการแต้มของบิลหนึ่ง โดยคืนเข้าล็อตเดิม (void) */
  reverseWithLots,
  /** cron รายวัน: ตัดล็อตที่หมดอายุ (ctx = null คือทุกร้าน) */
  expireDue,
  /** ล็อตที่จะหมดอายุภายใน N วัน */
  expiringSoon,
  /** cron รายวัน: ยิง event แจ้งเตือนแต้มใกล้หมดอายุตาม remindDays */
  notifyExpiring,
} from "./lots";

// ── แต้ม v2: โอนระหว่างสมาชิก (M2.2 · พิมพ์เขียว §5.5 §11.4) ──
export type { RequestTransferOtpResult, TransferPointsInput, TransferPointsResult } from "./transfer";

export {
  /** ขอรหัส OTP ก่อนโอนแต้ม — เฉพาะลูกค้าที่ล็อกอินด้วยบัญชีตัวเอง */
  requestTransferOtp,
  /** โอนแต้มให้สมาชิกอีกคน (ต้องยืนยัน OTP) */
  transferPoints,
} from "./transfer";

// ── แต้ม v2: ปรับแต้มมือ + สายอนุมัติ (M2.2 · พิมพ์เขียว §5.5 §6.2 §11.4) ──
export type { AdjustWithApprovalInput, AdjustWithApprovalResult } from "./adjust";

export {
  /** เขียนการปรับแต้มจริง (ledger ADJUST + ต่อล็อต) — ใช้ตรง ๆ และจาก approval-effects */
  applyPointAdjust,
  /** ปรับแต้มมือ v2 — เกินเพดานเข้าสายอนุมัติ (ไม่มีนโยบาย = autoApproved) */
  adjustWithApproval,
  /** ผลของการอนุมัติ "ปรับแต้มมือ" — เรียกจาก src/lib/approval-effects.ts เท่านั้น */
  applyPointAdjustApproved,
} from "./adjust";
