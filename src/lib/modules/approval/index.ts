// approval/index.ts — facade เดียวที่โมดูลอื่นได้รับอนุญาตให้ import (fitness F2)
//
// 🔴 ห่อบาง ๆ ล้วน: ห้ามมีตรรกะธุรกิจ (ตรรกะอยู่ที่ service.ts)
// 🔴 ผู้เรียกภายในโมดูลเอง (หน้า/action ของสายอนุมัติ) import `./service` ตรงได้ตามปกติ
// 🔴 ผลของการอนุมัติ **ไม่** กลับเข้ามาทางนี้ — มันเกิดที่ composition root `src/lib/approval-effects.ts`
//    (ที่เดียวที่ประกอบข้ามโมดูลได้) ⇒ facade นี้จึงมีแต่ขา "ยื่นเข้า" ทางเดียว

export type { Ctx as ApprovalCtx, SubmitInput } from "./service";

export {
  /**
   * ยื่น entity เข้าสายอนุมัติกลาง — ไม่มีนโยบายที่เข้าเงื่อนไข = `{ autoApproved: true }`
   * (ต้นทางเดินต่อได้ทันที) · มีนโยบาย = `{ requestId }` แล้วรอ `approval.request.approved`
   * ยื่นซ้ำ entity เดิม → คืน requestId เดิม (idempotent)
   */
  submitForApproval,
} from "./service";
