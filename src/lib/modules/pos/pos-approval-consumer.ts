// pos-approval-consumer.ts — ผลของคำขออนุมัติชนิด POS_* (POS P1.15 · R6 · มติผู้คุมงาน 10 13) ◂
// ลงทะเบียนบรรทัดเดียวใน outbox-consumers.ts บน "approval.request.approved" / ".rejected" (ขั้นแรกที่ retry ได้ · โหลดแบบ dynamic)
// สัญญา = scripts/qc-pos-p1.15.mts (AP4–AP9) · brief ledger/pos-briefs/pos-brief-P1.15.md R6
//
// approved:
//   POS_VOID          ⇒ voidSale(…, { actorUserId: ผู้ตัดสิน, via:"approval", requestId, เหตุผล/คีย์จาก snapshot })
//   POS_REFUND        ⇒ refundApproved — ใบคืนคีย์ `approval-<requestId>` · นอกกะ (มติ 13) · ผู้ทำรายการ = ผู้ขอ · audit = ผู้ตัดสิน
//   POS_DISCOUNT_OVER ⇒ PosHeldCart.approvedRequestId = requestId (เขียนครั้งเดียว) — ใช้ได้ 1 บิลที่ submit พร้อม heldCartId
// rejected: ไม่ทำอะไร (คำขอปิดแล้ว · จออ่านสถานะจาก requestStatuses) · POS P1.15U ▸ ยกเว้น POS_DISCOUNT_OVER = ทิ้งบิลพักที่รออนุมัติ (audit) ◂
// 🔴 idempotent: snapshot มี outcome = ทำไปแล้ว/ปิดแล้ว ⇒ จบ · voidSale ซ้ำ = บิล VOIDED อยู่แล้ว · ใบคืนกันซ้ำด้วยคีย์ · ผูกบิลพักเฉพาะช่องที่ยังว่าง
// 🔴 มติ 10: ผู้ตัดสิน = ผู้ขอ ⇒ ไม่ทำ (ops WARN pos.approval.self_approved_blocked) · คำขอคงสถานะเดิม · snapshot ปิดด้วย BLOCKED_SELF_APPROVAL
// 🔴 ขั้นแรกของ chain (ห้ามขวางขั้นหลังถาวร): โยนเฉพาะความล้มชั่วคราว (DB/ธุรกรรม) · ข้อมูลใช้ไม่ได้ถาวร = WARN + outcome FAILED:<code> แล้วจบ
import type { OutboxHandler } from "@/lib/core/outbox";
import { logOps } from "@/lib/core/ops";
import { prisma } from "./db";
import { PosSaleError, voidSale } from "./service";
import { refundApproved } from "./refund";
import { armHeldCartApproval, discardHeldCartRejected } from "./held-cart";
import { isPosApprovalKind, markPosApprovalOutcome, payloadOutcome, posApprovalDecider, posApprovalPayload, posApprovalStatus } from "./pos-approval";
import type { RefundSaleInput } from "./refund-shared";

type Evt = Parameters<OutboxHandler>[0];
const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);
const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

async function warn(evt: Evt, message: string, detail: Record<string, unknown>): Promise<void> {
  await logOps("WARN", "pos.approval", message, { tenantId: evt.tenantId, detail: JSON.stringify(detail).slice(0, 1000) });
}

export const onPosApprovalDecided: OutboxHandler = async (evt: Evt) => {
  if (evt.type !== "approval.request.approved" && evt.type !== "approval.request.rejected") return;
  const p = isRecord(evt.payload) ? evt.payload : {};
  const requestId = str(p.requestId);
  const entityType = str(p.entityType);
  if (!requestId || !isPosApprovalKind(entityType)) return;
  // ปฏิเสธ = ไม่มีผลข้างเคียง (บิลคงเดิม) · POS P1.15U ▸ มติ 5: ส่วนลดเกินสิทธิ์ที่ถูกปฏิเสธ ⇒ ทิ้งบิลพักของคำขอนั้น (เฉพาะที่ยัง HELD — เล่นซ้ำไม่ทำซ้ำ) ◂
  if (evt.type === "approval.request.rejected") {
    if (entityType !== "POS_DISCOUNT_OVER") return;
    const rj = await posApprovalPayload(evt.tenantId, requestId);
    const held = rj ? (str(rj.payload.heldCartId) ?? str(rj.payload.ref)) : null;
    if (!held || (await posApprovalStatus(evt.tenantId, requestId)) !== "REJECTED") return;
    await discardHeldCartRejected(evt.tenantId, held, requestId, await posApprovalDecider(evt.tenantId, requestId));
    return;
  }

  const snap = await posApprovalPayload(evt.tenantId, requestId);
  if (!snap) {
    // snapshot เขียนคู่กับการยื่น — ไม่มี = ยื่นไม่ครบ (ไม่มีข้อมูลพอจะทำ) · ไม่ทำอะไรเลยปลอดภัยกว่า
    await warn(evt, "pos.approval.payload_missing — คำขอ POS ที่อนุมัติแล้วไม่มี snapshot ไม่ได้ทำรายการ", { requestId, entityType });
    return;
  }
  if (payloadOutcome(snap.payload)) return; // ทำไปแล้ว / ปิดแล้ว / ส่วนลดถูกใช้แล้ว (เล่นซ้ำไม่เปิดสิทธิ์ใหม่)
  if ((await posApprovalStatus(evt.tenantId, requestId)) !== "APPROVED") return;
  const deciderId = await posApprovalDecider(evt.tenantId, requestId);
  const requestedById = str(snap.payload.requestedById);
  if (!deciderId || !requestedById) {
    await warn(evt, "pos.approval.decider_missing — ไม่พบผู้ตัดสิน/ผู้ขอของคำขอ POS ไม่ได้ทำรายการ", { requestId });
    await markPosApprovalOutcome(evt.tenantId, requestId, "FAILED:NO_DECIDER");
    return;
  }
  // มติ 10: ห้ามอนุมัติของตัวเอง (ด่านระดับแกนกลาง = งานตามหลัง)
  if (deciderId === requestedById) {
    await warn(evt, "pos.approval.self_approved_blocked — ผู้อนุมัติคือผู้ขอเอง ไม่ได้ทำรายการ", { requestId, entityType, userId: deciderId });
    await markPosApprovalOutcome(evt.tenantId, requestId, "BLOCKED_SELF_APPROVAL");
    return;
  }
  const unitId = str(snap.payload.unitId) ?? evt.unitId;
  const systemId = str(snap.payload.systemId) ?? evt.systemId;
  if (!unitId || !systemId) {
    await markPosApprovalOutcome(evt.tenantId, requestId, "FAILED:NO_SCOPE");
    return;
  }

  if (snap.kind === "POS_DISCOUNT_OVER") {
    const heldCartId = str(snap.payload.heldCartId) ?? str(snap.payload.ref);
    if (!heldCartId || !(await armHeldCartApproval(evt.tenantId, heldCartId, requestId))) {
      const cur = heldCartId ? await prisma.posHeldCart.findFirst({ where: { id: heldCartId, tenantId: evt.tenantId }, select: { approvedRequestId: true } }) : null;
      if (cur?.approvedRequestId !== requestId) await warn(evt, "pos.approval.discount_not_armed — ผูกส่วนลดที่อนุมัติกับบิลพักไม่ได้", { requestId, heldCartId });
    }
    return;
  }

  const saleId = str(snap.payload.saleId) ?? str(snap.payload.ref);
  if (!saleId) {
    await markPosApprovalOutcome(evt.tenantId, requestId, "FAILED:NO_SALE");
    return;
  }

  if (snap.kind === "POS_VOID") {
    const reason = str(snap.payload.reason) ?? "ยกเลิกบิลตามคำขออนุมัติ";
    const key = str(snap.payload.idempotencyKey);
    try {
      await voidSale(evt.tenantId, unitId, saleId, { actorUserId: deciderId, reason, ...(key ? { idempotencyKey: key } : {}), via: "approval", requestId, requestedByUserId: requestedById });
    } catch (e) {
      const now = await prisma.posSale.findFirst({ where: { id: saleId, tenantId: evt.tenantId }, select: { status: true } });
      if (now?.status !== "VOIDED") {
        const code = e instanceof PosSaleError ? e.code : e instanceof Error && e.message === "บิลนี้ void ไม่ได้" ? "SALE_NOT_VOIDABLE" : null;
        if (!code) throw e; // ล้มชั่วคราว — คิวลองใหม่
        await warn(evt, "pos.approval.void_failed — อนุมัติแล้วแต่ยกเลิกบิลไม่ได้", { requestId, saleId, code });
        await markPosApprovalOutcome(evt.tenantId, requestId, `FAILED:${code}`);
        return;
      }
      // VOIDED อยู่แล้ว (เล่นซ้ำ / ยกเลิกด้วย PIN ไปก่อน) = จบ
    }
    await markPosApprovalOutcome(evt.tenantId, requestId, "EXECUTED", { saleId });
    return;
  }

  // POS_REFUND
  const input: RefundSaleInput = {
    saleId,
    lines: Array.isArray(snap.payload.lines) ? (snap.payload.lines as RefundSaleInput["lines"]) : [],
    payMethods: Array.isArray(snap.payload.payMethods) ? (snap.payload.payMethods as RefundSaleInput["payMethods"]) : [],
    reasonCode: snap.payload.reasonCode as RefundSaleInput["reasonCode"],
    reason: str(snap.payload.reason),
    idempotencyKey: `approval-${requestId}`,
  };
  const r = await refundApproved({ tenantId: evt.tenantId, systemId, unitId }, input, { requestId, deciderId, requestedById });
  if (r.ok) {
    await markPosApprovalOutcome(evt.tenantId, requestId, "EXECUTED", { refundSaleId: r.refund.id });
    return;
  }
  if (r.code === "UNKNOWN") throw new Error(`pos.approval refund ${requestId}: UNKNOWN`); // ล้มชั่วคราว — คิวลองใหม่ (คีย์กันใบซ้ำ)
  await warn(evt, "pos.approval.refund_failed — อนุมัติแล้วแต่ออกใบคืนไม่ได้", { requestId, saleId, code: r.code });
  await markPosApprovalOutcome(evt.tenantId, requestId, `FAILED:${r.code}`);
};
