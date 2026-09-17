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
