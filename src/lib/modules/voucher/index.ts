// voucher/index.ts — facade เดียวที่โมดูลอื่นได้รับอนุญาตให้ import (fitness F2)
//
// 🔴 ห่อบาง ๆ ล้วน: ห้ามมีตรรกะธุรกิจ (ตรรกะอยู่ที่ service.ts)
// 🔴 ผู้เรียกภายในโมดูลเอง (หน้า/action) import ไฟล์ย่อยตรงได้ตามปกติ
// ผู้เรียกจริงวันนี้: สแตมป์ (ครบใบ → ออกใบ) · สมาชิก (รวมคน · hook ขึ้นระดับผ่าน member-hooks.ts)
//                    · cron (หมดอายุ/ใกล้หมดอายุ) · approval-effects (อนุมัติแล้วออกจริง)
//                    · M2.7 wallet / M2.8 POS จะเรียก validate/redeem/release ต่อจากนี้

export type {
  VoucherCtx,
  VoucherConfig,
  TemplateInput,
  TemplateDto,
  AdhocInput,
  IssueInput,
  IssueResult,
  IssueDone,
  IssuePending,
  IssuedVoucherDto,
  CartLine,
  CartInput,
  ValidateInput,
  ValidateResult,
  RedeemInput,
  VoucherDto,
  VoucherKpi,
  ListVouchersOptions,
} from "./service";

export { VoucherNotFoundError, VoucherForbiddenError, VoucherInputError, VoucherStateError } from "./errors";

export {
  /** แบบ voucher ที่ร้านตั้งไว้ล่วงหน้า (ต้องมีสิทธิ์ `member.promo.manage`) */
  createTemplate,
  updateTemplate,
  toggleTemplate,
  listTemplates,
  /** ออกใบให้ลูกค้าหลายคน — มูลค่ารวมเกินเพดาน = เข้าสายอนุมัติแทนการออกทันที */
  issue,
  /** ผลของการอนุมัติ "ออก voucher เกินเพดาน" — เรียกจาก approval-effects เท่านั้น */
  issueApprovedBatch,
  /** ใบนี้ใช้กับตะกร้านี้ได้ไหม + ลดเท่าไหร่ (อ่านอย่างเดียว) */
  validate,
  /** ตัดใบเป็น USED แบบ atomic (ใส่ `tx` เพื่ออยู่ใน transaction ของบิลผู้เรียก) */
  redeem,
  /** คืนใบให้ลูกค้าเมื่อบิลถูกยกเลิก (หมดอายุระหว่างทาง → ต่อให้อีก 7 วัน §11.5) */
  release,
  /** ยกเลิกใบที่ออกผิด (ต้องมีสิทธิ์ `member.promo.manage`) */
  cancel,
  /** cron รายวัน — ใบที่ถึงวันหมดอายุ / ใบที่ใกล้หมดอายุทุกร้าน */
  expireDue,
  notifyExpiring,
  /** ใบของลูกค้า 1 คน (แผงสิทธิ์ที่หน้าขาย · LIFF · โปรไฟล์ 360) */
  listForCustomer,
  /** ตาราง + KPI ของหน้าจอ */
  listVouchers,
  /** รวมสมาชิกซ้ำ → ย้ายใบไปคนที่เก็บไว้ (เรียกจาก member/profile.ts) */
  mergeVouchers,
  /** actor ของงานเบื้องหลัง (hook ขึ้นระดับ · สแตมป์ครบใบ) — ไม่มีคนกดปุ่ม */
  VOUCHER_SYSTEM_ACTOR,
  /** ค่าคงที่ของกติกา (หน้าจอ/ข้อความช่วยเหลือใช้ตัวเลขชุดเดียวกับ service) */
  VOUCHER_KINDS,
  VOUCHER_ORIGINS,
  VOUCHER_RELEASE_GRACE_DAYS,
  VOUCHER_EXPIRING_DAYS,
  configOf,
} from "./service";
