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
// CRM C5.5-fix9 r2 ▸ ยกเลิกเป็นชุด (คำสั่งละ ≤ 1,000 · เฉพาะที่ยัง PENDING) — ผู้เรียก: crm/portal.ts#cancelErasedApprovals (ขั้นหลังการลบ PDPA) ◂
export { cancelRequests } from "./service";

// CRM C3.3 ▸ ผู้ตัดสินขั้นสุดท้ายของคำขอ (อ่านล้วน) — ผู้เรียก: crm/commissions.ts (ห้ามอนุมัติคอมมิชชันของตัวเองผ่านสายอนุมัติ) ◂ CRM C3.3
export { lastDecisionOf, requestStatuses } from "./service";

// POS P1.15 ▸ เลือกกติกาที่เข้าเงื่อนไข (อ่านล้วน · ไม่ยื่นอะไร) — ผู้เรียก: pos/pos-approval.ts (ส่วนลดเกินสิทธิ์ต้องรู้ก่อนพักบิล · มติผู้คุมงาน 7) ◂
// CRM C5.5 ▸ RV-6 (fix1 r2): นโยบายที่ "จะ" จับคำขอนี้ (อ่านล้วน · ไม่มี = ต้นทางจะ autoApprove) — ผู้เรียก: point/adjust.ts ·
//   voucher/service.ts (คำตัดสินของประตูมือที่กฎอัตโนมัติ CRM ใช้ตรวจตอนบันทึก) · ห่อบาง ๆ ของ service เดิม ไม่มีตรรกะใหม่ ◂ CRM C5.5
// MAIN-MERGE ▸ POS P1.15 และ CRM C5.5 ส่งออกตัวเดียวกัน — เก็บ export เดียว ◂
export { resolvePolicy } from "./service";

// POS P1.18 ▸ R10 (มติ Q4): กติกาของชนิดที่ขอ (อ่านล้วน · ทั้ง active และปิด · มี steps) — ผู้เรียก: pos/settings-overview.ts (แท็บพนักงานและสิทธิ์ 17C)
//   กรองว่ากติกาไหน "ใช้กับ POS/สาขานี้" เป็นหน้าที่ของผู้เรียก · ห่อ listPolicies เดิม ไม่มีตรรกะใหม่ ◂
import { listPolicies as listPoliciesOfTenant, type Ctx as PolicyCtx } from "./service";
export async function listPoliciesForEntities(ctx: PolicyCtx, entityTypes: readonly string[]) {
  const want = new Set(entityTypes);
  return (await listPoliciesOfTenant(ctx)).filter((p) => want.has(p.entityType));
}
