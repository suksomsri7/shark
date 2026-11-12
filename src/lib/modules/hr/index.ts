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
//   verifyPin({ tenantId, pin, callerKey, unitId?, systemId? }) → { ok:true, employeeId, systemId, userId } | { ok:false, reason } — คืน id เท่านั้น ·
//   HR H0.5 r4 ▸ R4.5 callerKey บังคับ และ "เซิร์ฟเวอร์เป็นคนได้มาจากตัวตนที่ยืนยันแล้ว" เท่านั้น — user id จาก session
//   หรือ id เครื่องที่ลงทะเบียนไว้ฝั่งเซิร์ฟเวอร์ (อ่านจาก session / cookie ที่เซ็นแล้ว) · 🔴 ห้ามรับจากช่องใดของคำขอ (form / body / query / header)
//   เพราะผู้เรียกที่เลือกคีย์เองได้จะหมุนคีย์หนีถังต่อผู้เรียกจนเหลือแค่ถังร้าน (hunt G3) ·
//   รูปแบบ ^[A-Za-z0-9:_.-]{1,128}$ หลัง trim — ไม่ส่ง / ไม่ตรง = "PIN ไม่ถูกต้อง" (ไม่แตะ DB) ·
//   นับก่อนค้นแล้วคืนช่องเมื่อถูก/ถูกปฏิเสธ (เหลือเฉพาะครั้งที่ผิด): ผู้เรียก hr-verifypin:<tenantId>:<callerKey> 10/10 นาที
//   (ครบ 10 = audit hr.pin.locked 1 แถว) + ร้าน hr-verifypin:<tenantId> 120/60 s (ครบ 120 = audit hr.pin.tenant_limited + OpsEvent WARN) ◂ ·
//   unitId (HR H1.1 ▸ R9) = สาขาของผู้ถาม: พนักงานต่างสาขา ⇒ "PIN ไม่ถูกต้อง" (นับเหมือนผิด) · ยังไม่ระบุสาขา = ผ่าน ◂ · systemId = ตัวกรอง
export type { VerifyPinInput, VerifyPinResult, VerifyPinOk, VerifyPinFail } from "./pin";
export { verifyPin } from "./pin";
// ◂ HR H0.5

// HR H0.6 ▸ กลับรายการรอบจ่าย → CRM (re-export ล้วน — ตรรกะอยู่ที่ `payroll.ts` บล็อก H0.6)
//   adjustmentsByIds = รายการเพิ่ม/หักตาม id (ผูกร้าน + ระบบ HR · `runStatus` ของรอบที่ผูกอยู่) — ผู้บริโภค `hr.payroll.reversed`
//   (`crm/commissions.ts#onPayrollReversed`: คอมมิชชัน PAID → APPROVED ครั้งเดียว ข้ามรายการที่เข้ารอบที่จ่ายแล้วอีกรอบ) ◂
export type { PayAdjustmentRef } from "./payroll";
export { adjustmentsByIds } from "./payroll";
// ◂ HR H0.6

// HR H2.1 ▸ ตารางกะรายวัน — ตัวอ่านของโมดูลอื่น (re-export ล้วน — ตรรกะอยู่ที่ `roster.ts`)
//   rosterOnDay({ tenantId, date, unitId?, systemId? }) → { hrLinked, entries } = แถวที่ประกาศแล้วของวันนั้น (วันที่กะเริ่ม · เวลาไทย)
//     ของทุกระบบ HR ในร้าน (หรือระบบที่ระบุ) · ตัดพนักงานที่ไม่ทำงานแล้ว (inactive/ENDED) และใบลา APPROVED ที่ครอบวันนั้น ·
//     unitId = สาขาของวันนั้นตรงกัน หรือแถวไม่ระบุสาขา · คืน id + เวลาเท่านั้น (ไม่มีชื่อ/ประเภทลา/เหตุผล/เงิน)
//   rosterAt({ tenantId, at, unitId?, systemId?, toleranceMin? }) → แถวที่ช่วงเวลาครอบ `at` (02:00 ของวัน D+1 เจอกะดึกของวัน D)
//   🔴 ไม่ประกาศ onShiftToday ที่นี่ — ชื่อนั้นถูกแช่แข็งใน POS-CONTRACTS C-8 v2 (hr/pos-seam*.ts บนสาย POS · มติ Q1) ·
//      การสลับ seam ของ POS มาอ่านตารางกะ = ก้อนแก้แยกหลังสองสายงานมาบรรจบ
export type { RosterDayEntry, RosterDayResult } from "./roster";
export { rosterOnDay, rosterAt } from "./roster";
// ◂ HR H2.1
// HR H2.3 ▸ คำขอสลับกะ — re-export ล้วน (ตรรกะอยู่ที่ `swap.ts`) · ผู้เรียก: approval-effects.ts (ผลของสายอนุมัติชนิด HrShiftSwapRequest)
export type { SwapItem, SwapSide, SwapShape, SwapStatus } from "./swap";
export { applySwapDecision } from "./swap";
// ◂ HR H2.3
// HR H2.7 ▸ การลา — re-export ล้วน (ตรรกะอยู่ที่ `leave.ts`) · ผู้เรียก: approval-effects.ts (ผลของสายอนุมัติชนิด HrLeave) · cron/hourly (งานรายปี)
//   applyLeaveDecision({ tenantId, systemId, leaveId, requestId, approved }) → { applied, code? } · runLeaveYearJob({ tenantId, systemId, asOf }) → { granted, carried, expired }
export type { LeaveYearJobResult } from "./leave";
export { applyLeaveDecision, runLeaveYearJob } from "./leave";
// ◂ HR H2.7
// HR H2.6 ▸ คำขอแก้เวลา — re-export ล้วน (ตรรกะอยู่ที่ `correction.ts`) · ผู้เรียก: approval-effects.ts (ผลของสายอนุมัติชนิด HrTimeCorrection)
//   applyCorrectionDecision({ tenantId, systemId, correctionId, requestId, approved }) → { applied, code? }
export { applyCorrectionDecision } from "./correction";
// ◂ HR H2.6
// POS P3.5 ▸ รอยต่อ HR ↔ POS ฉบับ C-8 v2 (มติ 5 · ledger/POS-CONTRACTS.md C-8) — re-export ล้วน (ตัวงานอยู่ที่ pos-seam.ts)
//   onShiftToday = ใครเป็นพนักงาน · active · ลาวันนี้ · ตารางของวัน (unitId ยังไม่ใช้จนกว่า H1.1) · workedMinutesBetween = นาทีทำงานช่วงหนึ่ง ·
//   clockSelf = ลงเวลาของตัวเอง (เขียนผ่าน clock() ของ HR เท่านั้น) · adjustmentStatuses = สถานะรายการปรับเงินที่ POS ส่งเข้างวด
//   HR เปลี่ยนตัวในได้เอง (H2.1 · H1.1 · H2.4) — 4 ชื่อนี้แช่แข็ง POS ไม่ต้องแก้
export type { OnShiftTodayItem, OnShiftTodayResult, PosSeamSchedule, PosSeamClockMarks, ClockSelfResult } from "./pos-seam";
export { onShiftToday, workedMinutesBetween, clockSelf, adjustmentStatuses } from "./pos-seam";
// ◂ POS P3.5
// POS P3.5 ▸ fix2 N1 (มติผู้คุม CD-P35c): ตัวกวาดรายการของระบบ (ค่าคอมฯ POS) ที่ค้างในงวดที่มีรอบแล้ว — re-export ล้วน (ตัวงานอยู่ที่ payroll.ts)
export { rehomeStrandedSystemAdjustments } from "./payroll";
// ◂ POS P3.5 fix2 N1
// POS P4.3 ▸ fix2 (R1 F5): ผู้ใช้ในชุดที่ผูกพนักงาน (ทั้งชุดในคำขอเดียว · ป้าย "จาก HR" ของแท็บพนักงาน POS) — re-export ล้วน ◂
export { linkedUserIdsOf } from "./service";
// SVC B.1 ▸ BQ-1: กะรายวัน → หน้าต่างเวลาช่าง (ผู้เรียก: booking/service#staffDayProfiles — เรียกครั้งเดียวต่อคำขอ)
//   นาที = นาทีจากเที่ยงคืนของวันไทย (`date` = "YYYY-MM-DD" ไทย) · breaks = ช่วงพักที่ booking หักออกจาก windows — 🔴 ห้ามเปลี่ยนลายเซ็น
// HR H4.1 ▸ X-HR.1: ของจริงจากตารางกะที่ประกาศแล้ว + ใบลา APPROVED (re-export ล้วน — ตรรกะอยู่ที่ `availability.ts` · กติกาล้วน `availability-rules.ts`)
//   ชนิดข้อมูลของ seam ย้ายไปประกาศที่ availability.ts (ช่องเดิมทุกตัว) · ไม่มีตารางกะในสัปดาห์นั้น = ไม่มีแถว (booking ใช้แหล่งถัดไป)
//   leaveDutyNotify = ผู้บริโภค hr.leave.decided (APPROVED) แจ้งผู้ดูแลว่ามีกะที่ต้องหาคนแทน · leaveDutyHints = คำใบ้บนหน้าใบลา
export type { StaffWindowsInput, StaffWindowsRow } from "./availability";
export { staffWindows, leaveDutyNotify, leaveDutyHints } from "./availability";
// ◂ HR H4.1
// ◂ SVC B.1

// HR H3.1 ▸ ชั่วโมงทำงาน (work entries) — snapshot ต่องวดที่รอบเงินเดือนรุ่น 2 (H3.2/H3.4) อ่าน (re-export ล้วน — ตรรกะอยู่ที่ `work-entries.ts`) ·
//   WE_OT_PAYMENT = นาที OT วัดอย่างเดียว · จ่าย OT ผ่าน HrPayAdjustment (H2.9) ที่เดียว ⇒ ผู้สร้างบรรทัดเงินห้ามจ่ายจาก otWorkdayMin/otHolidayMin ซ้ำ
export { buildWorkEntrySnapshot, workEntryPreview, WE_OT_PAYMENT } from "./work-entries";
// ◂ HR H3.1
// HR H2.9 ▸ คำขอ OT — re-export ล้วน (ตรรกะอยู่ที่ `ot.ts`) · settleOtRequests = ตัวจ่ายรายชั่วโมง (cron/hourly) · notifyOtDecided = ผู้บริโภค hr.ot.decided
export { settleOtRequests, notifyOtDecided } from "./ot";
// ◂ HR H2.9
