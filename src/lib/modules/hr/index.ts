// hr/index.ts — facade เดียวที่โมดูลอื่นได้รับอนุญาตให้ import (fitness F2 · ใบ CRM v2 C0.3 ส่วน C)
//
// 🔴 **re-export ล้วน ไม่มีตรรกะ ไม่มี DB**: ห้ามเปิดทางเข้าฐานข้อมูลของตัวเองที่นี่ (ไม่ import
//    ตัวไคลเอนต์ของเคอร์เนล · ไม่สร้าง PrismaClient ใหม่)
//    (ข้อสอบ C0.3-SC.8) — "Move no code" ของใบสั่งงานแปลว่าตรรกะยังอยู่ที่ `payroll.ts` / `service.ts`
//    ตามเดิม ไฟล์นี้แค่เปิดประตู ⇒ ไม่มีวันเกิด engine ชุดที่สองของ HR
// 🔴 ไฟล์ของโมดูลอื่นที่ import `hr/service` ตรงอยู่แล้ว (booking · ai) ยังใช้ได้เหมือนเดิม —
//    ไฟล์นี้ **เพิ่มทางเข้าใหม่** ไม่ได้ปิดทางเก่า (เหมือนตอนเปิด facade ของแชท)
//
// ผู้เรียกที่รออยู่: CRM v2 — คอมมิชชันของดีลที่ปิดได้ → `requestAdjustment` (kind COMMISSION) ·
//    การแจกงาน/lead ต้องข้ามคนที่ลาอยู่ → `isOnLeave` · "ผู้ใช้คนนี้คือพนักงานคนไหน" → `employeeOfUser`

export type { RequestAdjustInput, Ctx as HrPayrollCtx } from "./payroll";
export {
  /** ยื่นรายการปรับเงิน (PENDING เสมอ — อนุมัติด้วยกติกา 4 ตาของ HR เอง `decideAdjustment`) */
  requestAdjustment,
  /** ลบรายการที่ยังไม่เข้ารอบจ่าย (เข้ารอบแล้วต้องกลับรายการรอบจ่ายแทน) */
  cancelAdjustment,
} from "./payroll";

export type { Ctx as HrCtx } from "./service";
export {
  /** พนักงานที่ผูกกับ user คนนี้ในร้านนี้ (`HrEmployee.linkedUserId`) — ไม่มี/ข้ามร้าน → null */
  employeeOfUser,
  /** "คนนี้ลาอยู่ไหม ณ เวลานั้น" — เฉพาะใบลา APPROVED · เทียบเป็น **วันตามปฏิทินไทย** (+07:00) */
  isOnLeave,
} from "./service";

// CRM C3.3 ▸ คอมมิชชัน CRM → เงินเดือน (re-export ล้วน — ตรรกะอยู่ที่ `payroll.ts` บล็อก C3.3)
//   requestAdjustment รับ `crmCommissionId` (+ `tx` ของผู้เรียก) และปฏิเสธรายการที่สองของคอมมิชชันเดียวกัน (partial unique) ·
//   payrollEmployeeOfUser = พนักงาน **active ที่มีโปรไฟล์เงินเดือน** ที่ผูกกับผู้ใช้ (จ่ายเฉพาะคนที่ยังทำงานและมีแถวในรอบจ่าย — C3.3-fix H4) ·
//   payrollRunPeriods / adjustmentOfCommission / adjustmentsOfRun = ตัวอ่านของงวด · ลิงก์สองทาง · รอบที่จ่ายแล้ว (ผู้บริโภค `hr.payroll.paid` ·
//   เฉพาะรายการของพนักงานที่มีแถวในรอบ — H4)
export type { CommissionAdjustmentRef } from "./payroll";
export { payrollEmployeeOfUser, payrollRunPeriods, adjustmentOfCommission, adjustmentsOfRun } from "./payroll";
//   มติผู้คุมงาน (รีวิวเงิน B3 · S3 · S4 · C3.3-fix H5): ถอนรายการที่ยังไม่จ่าย (guard · PENDING/APPROVED ที่ไม่เคยเข้ารอบ) · ผู้ใช้ที่มีพนักงาน active + โปรไฟล์ ·
//   รายการค้าง (PENDING/APPROVED) ในงวดที่มีรอบแล้ว
export { withdrawCommissionAdjustment, activeLinkedUserIds, strandedCommissionAdjustments, moveCommissionAdjustmentPeriod } from "./payroll";
// ◂ CRM C3.3

// HR H0.5 ▸ contract C-8 — "PIN นี้เป็นของพนักงานคนไหนในร้าน" (re-export ล้วน — ตรรกะอยู่ที่ `pin.ts`)
//   ผู้เรียกที่รออยู่: POS P1.15 (ยืนยันพนักงานหน้าเครื่อง / อนุมัติ void) · HR เป็นเจ้าของ PIN (review ruling #3 — ไม่มี PosStaffPin)
//   verifyPin({ tenantId, pin, unitId?, systemId? }) → { ok:true, employeeId, systemId, userId } | { ok:false, reason } — คืน id เท่านั้น ·
//   ถังจำกัด hr-verifypin:<tenantId> 120 ครั้ง/60 วินาที · unitId ยังไม่มีผลจนถึง H1.1 · systemId = ตัวกรอง
export type { VerifyPinInput, VerifyPinResult, VerifyPinOk, VerifyPinFail } from "./pin";
export { verifyPin } from "./pin";
// ◂ HR H0.5
