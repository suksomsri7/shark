// approval-effects.ts — composition root (นอก src/lib/modules) ผูก "ผลของการอนุมัติ" กลับเข้า entity ต้นทาง
// WO-0049b · เรียกจาก outbox-consumers ต่อจาก notify เดิม (approval.request.approved / rejected)
//
// ทำไม prisma ตรง (มี comment ตามกติกา): effect ต้องแตะตาราง entity ของหลายโมดูล
//   (PurchaseOrder = inventory · HrLeave = hr) ในที่เดียว — ถ้าอยู่ในโมดูลใดโมดูลหนึ่งจะเกิด
//   import ข้ามโมดูล (F2). composition root นอก modules คือที่เดียวที่ประกอบข้ามโมดูลได้
//   (เหมือน pos/account-bridge). ทุก write เป็น updateMany + guard สถานะ → idempotent (drain ซ้ำปลอดภัย)

import { prisma } from "@/lib/core/db";

export type ApprovalEffectEvent = {
  tenantId: string;
  type: "approval.request.approved" | "approval.request.rejected";
  payload: unknown;
};

const metaOf = (payload: unknown): { entityType: string; entityId: string } => {
  const p = (payload ?? {}) as { entityType?: unknown; entityId?: unknown };
  return {
    entityType: typeof p.entityType === "string" ? p.entityType : "",
    entityId: typeof p.entityId === "string" ? p.entityId : "",
  };
};

// นำผลการตัดสินของสายอนุมัติไปเปลี่ยนสถานะ entity ต้นทาง
//   · approved + PurchaseOrder → DRAFT→ORDERED (+orderedAt) · rejected + PurchaseOrder → คง DRAFT (เงียบ)
//   · approved + HrLeave → PENDING→APPROVED · rejected + HrLeave → PENDING→REJECTED (decidedById "approval-engine")
//   · entityType อื่น → เงียบ (โมดูลอนาคตค่อยเพิ่ม)
export async function applyApprovalEffect(evt: ApprovalEffectEvent): Promise<void> {
  const { entityType, entityId } = metaOf(evt.payload);
  if (!entityId) return;
  const approved = evt.type === "approval.request.approved";

  if (entityType === "PurchaseOrder") {
    // ปฏิเสธ PO → คง DRAFT (ไม่ทำอะไร) · อนุมัติ → ORDERED (guard DRAFT กัน state ชน/ยิงซ้ำ)
    if (approved) {
      await prisma.purchaseOrder.updateMany({
        where: { id: entityId, tenantId: evt.tenantId, status: "DRAFT" },
        data: { status: "ORDERED", orderedAt: new Date() },
      });
    }
    return;
  }

  if (entityType === "HrLeave") {
    await prisma.hrLeave.updateMany({
      where: { id: entityId, tenantId: evt.tenantId, status: "PENDING" },
      data: { status: approved ? "APPROVED" : "REJECTED", decidedById: "approval-engine" },
    });
    return;
  }
  // entityType อื่น → เงียบ ๆ
}
