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

const metaOf = (payload: unknown): { entityType: string; entityId: string; requestId: string } => {
  const p = (payload ?? {}) as { entityType?: unknown; entityId?: unknown; requestId?: unknown };
  return {
    entityType: typeof p.entityType === "string" ? p.entityType : "",
    entityId: typeof p.entityId === "string" ? p.entityId : "",
    requestId: typeof p.requestId === "string" ? p.requestId : "",
  };
};

// นำผลการตัดสินของสายอนุมัติไปเปลี่ยนสถานะ entity ต้นทาง
//   · approved + PurchaseOrder → DRAFT→ORDERED (+orderedAt) · rejected + PurchaseOrder → คง DRAFT (เงียบ)
//   · approved + HrLeave → PENDING→APPROVED · rejected + HrLeave → PENDING→REJECTED (decidedById "approval-engine")
//   · entityType อื่น → เงียบ (โมดูลอนาคตค่อยเพิ่ม)
export async function applyApprovalEffect(evt: ApprovalEffectEvent): Promise<void> {
  const { entityType, entityId, requestId } = metaOf(evt.payload);
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

  // WO 8.3 (§9.4 เพดานอนุมัติ): PO ที่ผู้กดอนุมัติ "เกินเพดาน" ถูกยื่นเข้าสายอนุมัติแทน
  //   เมื่อผู้มีอำนาจสูงกว่ากดผ่านในสายอนุมัติ → ดันเอกสารเป็น APPROVED ให้เอง
  //   guard สถานะ AWAITING_APPROVAL ⇒ ยิงซ้ำ/replay ปลอดภัย · ปฏิเสธ → REJECTED (เหมือนกด "ไม่อนุมัติ")
  if (entityType === "AccountDocument") {
    await prisma.accountDocument.updateMany({
      where: { id: entityId, tenantId: evt.tenantId, status: "AWAITING_APPROVAL" },
      data: approved ? { status: "APPROVED" } : { status: "REJECTED", voidReason: "ไม่อนุมัติผ่านสายอนุมัติ" },
    });
    return;
  }

  // ระบบสมาชิก v2 (M1.4 · §11.1): ผู้จัดการขอ "รวมสมาชิกซ้ำ" — ผ่านแล้วจึงรวมจริง
  //   entityId = `${keepId}:${mergeId}` · systemId (ระบบสมาชิก) อ่านจากคำขอ ไม่ได้อยู่ใน payload
  //   ปฏิเสธ = ไม่ทำอะไร (ทั้งสองคนยังอยู่ครบเหมือนเดิม) · เรียกซ้ำปลอดภัย (mergeMembersApproved
  //   เช็คสถานะ MERGED แล้วเงียบ) ⇒ drain ซ้ำ/replay ไม่รวมซ้อน
  if (entityType === "member.merge") {
    if (!approved) return;
    const [keepId, mergeId] = entityId.split(":");
    if (!keepId || !mergeId || !requestId) return;
    const req = await prisma.approvalRequest.findFirst({
      where: { id: requestId, tenantId: evt.tenantId },
      select: { systemId: true, requestedById: true },
    });
    if (!req?.systemId) return;
    const member = await import("@/lib/modules/member");
    await member.mergeMembersApproved(
      { tenantId: evt.tenantId, systemId: req.systemId, actorUserId: req.requestedById },
      { keepId, mergeId, approvedById: req.requestedById },
    );
    return;
  }

  // ระบบสมาชิก v2 (M1.9 · §5.4): ผู้จัดการขอ "ตั้งระดับสมาชิกด้วยมือ" — ผ่านแล้วจึงใช้ระดับใหม่จริง
  //   entityId = Customer.id · คำขอที่รออยู่ถูกพักไว้เป็นแถว MemberTierHistory (evidence.pending = true)
  //   ที่ผูก approvalRequestId ⇒ effect หยิบแถวนั้นมาใช้ต่อได้โดยไม่ต้องแบก payload ในสายอนุมัติ
  //   idempotent: แถวถูกปิด (pending = false) ก่อนใช้ระดับ ⇒ drain ซ้ำ/replay ไม่ตั้งซ้ำ
  //   ปฏิเสธ = ปิดแถวไว้เป็นหลักฐานว่าเคยขอแล้วไม่ผ่าน (ระดับของสมาชิกไม่ถูกแตะ)
  if (entityType === "member.tier.manual") {
    if (!requestId) return;
    const req = await prisma.approvalRequest.findFirst({
      where: { id: requestId, tenantId: evt.tenantId },
      select: { systemId: true, requestedById: true },
    });
    if (!req?.systemId) return;
    const member = await import("@/lib/modules/member");
    await member.applyManualTierApproved(
      { tenantId: evt.tenantId, systemId: req.systemId, actorUserId: req.requestedById },
      { customerId: entityId, approvalRequestId: requestId, approved, approvedById: req.requestedById },
    );
    return;
  }

  // ระบบสมาชิก v2 (M1.7 · §11.8): คำขอ "ลบข้อมูลตาม PDPA" — ผ่านแล้วจึงลบจริง
  //   entityId = MemberPrivacyRequest.id · systemId (ระบบสมาชิก) อ่านจากคำขออนุมัติ ไม่ได้อยู่ใน payload
  //   ปฏิเสธ = ปิดคำขอเป็น REJECTED ไว้เป็นหลักฐาน (ข้อมูลลูกค้าไม่ถูกแตะเลย)
  //   idempotent ทั้งสองทาง (guard สถานะใน updateMany + eraseMember เงียบเมื่อคนนั้นถูกลบไปแล้ว)
  if (entityType === "member.erase") {
    if (!requestId) return;
    const req = await prisma.approvalRequest.findFirst({
      where: { id: requestId, tenantId: evt.tenantId },
      select: { systemId: true, requestedById: true },
    });
    if (!req?.systemId) return;
    const member = await import("@/lib/modules/member");
    await member.applyEraseApproved(
      { tenantId: evt.tenantId, systemId: req.systemId, actorUserId: req.requestedById || null },
      { requestId: entityId, approved },
    );
    return;
  }

  // ระบบสมาชิก v2 (M2.2 · §5.5 §6.2): ผู้จัดการขอ "ปรับแต้มมือ" เกินเพดาน — ผ่านแล้วจึงเขียนแต้มจริง
  //   entityId = `${customerId}:${idempotencyKey}` แต่รายละเอียด (delta/reason/expiresAt) พักไว้ที่
  //   `PointAdjustRequest` (ผูกด้วย requestId) เพราะ ApprovalRequest ไม่มีช่อง JSON ให้แนบ payload อิสระ
  //   idempotent: `point/adjust.ts#applyPointAdjustApproved` เองกันซ้ำผ่าน idempotencyKey ของ ledger
  //   ปฏิเสธ = ไม่เขียนแต้มเลย (แค่ปิดคำขอไว้เป็นหลักฐาน)
  if (entityType === "member.point.adjust") {
    if (!requestId) return;
    const point = await import("@/lib/modules/point");
    await point.applyPointAdjustApproved({ approvalRequestId: requestId, tenantId: evt.tenantId, approved });
    return;
  }

  // ระบบสมาชิก v2 (M2.5 · §6.2 §11.6): ผู้จัดการขอ "ออก voucher" ที่มูลค่ารวมเกินเพดาน ฿10,000
  //   entityId = `VoucherIssueBatch.id` — รายชื่อผู้รับ/แบบ/เงื่อนไข พักไว้ที่แถวนั้น (ApprovalRequest
  //   ไม่มีช่อง JSON ให้แนบ payload อิสระ · แบบเดียวกับ `PointAdjustRequest` ของ M2.2)
  //   idempotent 2 ชั้น: guard สถานะ PENDING ของ batch + `idempotencyKey` ต่อใบใน voucher/service
  //   ⇒ drain ซ้ำ/replay ไม่ออกใบซ้ำ · ปฏิเสธ = batch REJECTED ไม่มีใบถูกออกเลย
  if (entityType === "member.voucher.issue") {
    const voucher = await import("@/lib/modules/voucher");
    await voucher.issueApprovedBatch(evt.tenantId, entityId, approved);
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
