// approval/index.ts — facade เดียวที่โมดูลอื่นได้รับอนุญาตให้ import (fitness F2)
//
// 🔴 ห่อบาง ๆ ล้วน: ห้ามมีตรรกะธุรกิจ (ตรรกะอยู่ที่ service.ts)
// 🔴 ผู้เรียกภายในโมดูลเอง (หน้า/action ของสายอนุมัติ) import `./service` ตรงได้ตามปกติ
// 🔴 ผลของการอนุมัติ **ไม่** กลับเข้ามาทางนี้ — มันเกิดที่ composition root `src/lib/approval-effects.ts`
//    (ที่เดียวที่ประกอบข้ามโมดูลได้) ⇒ facade นี้มีขา "ยื่นเข้า/ยกเลิก" (submitForApproval · cancelRequest) และตัวอ่านล้วนของ C3.3
//    (lastDecisionOf · requestStatuses — ผู้ตัดสินและสถานะคำขอ สำหรับด่าน "ห้ามอนุมัติของตัวเอง" และคิวสำรองของงานรายนาที) ไม่มีขาเขียนผล

export type { Ctx as ApprovalCtx, SubmitInput } from "./service";

export {
  /**
   * ยื่น entity เข้าสายอนุมัติกลาง — ไม่มีนโยบายที่เข้าเงื่อนไข = `{ autoApproved: true }`
   * (ต้นทางเดินต่อได้ทันที) · มีนโยบาย = `{ requestId }` แล้วรอ `approval.request.approved`
   * ยื่นซ้ำ entity เดิม → คืน requestId เดิม (idempotent)
   */
  submitForApproval,
} from "./service";

// CRM C1.5 ▸ ต้นทางยกเลิก entity → คำขอ PENDING เป็น CANCELLED (สถานะอื่น/ไม่พบ = false) — ผู้เรียก: `crm/deals.ts#deleteDeal`
//   (ดีลที่ถูกลบขณะมีคำขออนุมัติส่วนลด `crm.discount` ค้างอยู่) · ห่อบาง ๆ ของ service เดิม ไม่มีตรรกะใหม่ ◂ CRM C1.5
export { cancelRequest } from "./service";

// CRM C3.3 ▸ ผู้ตัดสินขั้นสุดท้ายของคำขอ (อ่านล้วน) — ผู้เรียก: crm/commissions.ts (ห้ามอนุมัติคอมมิชชันของตัวเองผ่านสายอนุมัติ) ◂ CRM C3.3
export { lastDecisionOf, requestStatuses } from "./service";

// POS P1.15 ▸ เลือกกติกาที่เข้าเงื่อนไข (อ่านล้วน · ไม่ยื่นอะไร) — ผู้เรียก: pos/pos-approval.ts (ส่วนลดเกินสิทธิ์ต้องรู้ก่อนพักบิล · มติผู้คุมงาน 7) ◂
export { resolvePolicy } from "./service";
