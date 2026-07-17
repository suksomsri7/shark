// outbox-consumers.ts — composition root ของ outbox (อยู่นอก core → import โมดูลได้)
// ผูก event type → handler · handler อ่านข้อมูลจาก prisma ตรง แล้วส่งให้ pos/account-bridge
// WO-0002: "pos.sale.paid" (ขายสด→บัญชี) · "pos.sale.voided" (void→กลับรายการ)

import { prisma } from "@/lib/core/db";
import { drainOutbox, type OutboxHandler } from "@/lib/core/outbox";
import { bridgePosSalePaid, bridgePosSaleVoided } from "@/lib/modules/pos/account-bridge";
import { runForEvent } from "@/lib/automation/engine";
import { dispatchWebhooks } from "@/lib/webhooks/service";
import { entityLabel } from "@/lib/modules/approval/labels";
import { applyApprovalEffect } from "@/lib/approval-effects";
import { logOps } from "@/lib/core/ops";

const saleIdOf = (payload: unknown): string | null => {
  const p = payload as { saleId?: unknown } | null;
  return p && typeof p.saleId === "string" ? p.saleId : null;
};

// ขายสด POS → บัญชี
const posSalePaid: OutboxHandler = async (evt) => {
  const saleId = saleIdOf(evt.payload);
  if (!saleId) return;
  const sale = await prisma.posSale.findFirst({
    where: { id: saleId, tenantId: evt.tenantId },
    include: { payments: true },
  });
  if (!sale) return;
  if (sale.status !== "PAID") return; // ถูก void ก่อน drain → ไม่ต้อง post (void handler จัดการ)
  await bridgePosSalePaid(sale, sale.payments);
};

// void บิล POS → กลับรายการบัญชี
const posSaleVoided: OutboxHandler = async (evt) => {
  const saleId = saleIdOf(evt.payload);
  if (!saleId) return;
  const sale = await prisma.posSale.findFirst({
    where: { id: saleId, tenantId: evt.tenantId },
    select: { id: true, tenantId: true, systemId: true },
  });
  if (!sale) return;
  await bridgePosSaleVoided(sale);
};

// ห่อ handler หลักด้วย Automation (WO-0026): หลัง handler หลักสำเร็จ (event กำลังจะ DONE)
// เรียก engine แบบ best-effort — engine พัง (rule/webhook ล่ม) ห้ามล้ม consumer หลัก
// (ไม่งั้น event จะถูก retry แล้ว post บัญชีซ้ำ) → ครอบ try/catch เงียบ
const withAutomation =
  (handler: OutboxHandler): OutboxHandler =>
  async (evt) => {
    // งานหลักก่อน — พังต้องโยนต่อเหมือนเดิม (drain จะ retry/backoff) เพียงแต่ log ERROR ก่อน
    try {
      await handler(evt);
    } catch (e) {
      await logOps("ERROR", "outbox", `handler "${evt.type}" ล้มเหลว`, {
        tenantId: evt.tenantId,
        detail: e instanceof Error ? (e.stack ?? e.message) : String(e),
      });
      throw e; // โยนต่อ — พฤติกรรมเดิมห้ามเปลี่ยน
    }
    try {
      await runForEvent({ tenantId: evt.tenantId, type: evt.type, payload: evt.payload });
    } catch (e) {
      // automation ล้มเหลว = เรื่องรอง — event หลัก DONE ตามปกติ · แค่บันทึก WARN
      await logOps("WARN", "outbox", `automation ของ "${evt.type}" ล้มเหลว`, {
        tenantId: evt.tenantId,
        detail: e instanceof Error ? (e.stack ?? e.message) : String(e),
      });
    }
  };

// ── Approval Engine (WO-0049): แจ้งเตือนร้านเมื่อคำขออนุมัติเปลี่ยนสถานะ ──
const approvalMeta = (payload: unknown): { entityType: string; entityId: string } => {
  const p = (payload ?? {}) as { entityType?: unknown; entityId?: unknown };
  return {
    entityType: typeof p.entityType === "string" ? p.entityType : "",
    entityId: typeof p.entityId === "string" ? p.entityId : "",
  };
};

const approvalNotify =
  (title: (label: string) => string, body: string): OutboxHandler =>
  async (evt) => {
    const { entityType } = approvalMeta(evt.payload);
    await prisma.appNotification.create({
      data: { tenantId: evt.tenantId, title: title(entityLabel(entityType)), body },
    });
  };

const approvalSubmitted = approvalNotify(
  (label) => `มีคำขออนุมัติใหม่: ${label}`,
  "มีคำขอรอการอนุมัติ เปิดหน้า “รออนุมัติของฉัน” เพื่อตรวจสอบ",
);
const approvalApproved = approvalNotify(
  (label) => `คำขออนุมัติผ่านแล้ว: ${label}`,
  "คำขอผ่านการอนุมัติครบทุกขั้นแล้ว",
);
const approvalRejected = approvalNotify(
  (label) => `คำขอถูกปฏิเสธ: ${label}`,
  "คำขออนุมัติถูกปฏิเสธ ไม่ไปขั้นถัดไป",
);

// WO-0049b: ห่อ notify ของ approved/rejected ด้วย effect — หลัง notify เดิมทำงาน (ห้ามหาย)
//   applyApprovalEffect นำผลกลับ entity ต้นทาง (PO→ORDERED / ใบลา→APPROVED|REJECTED)
//   effect เป็น updateMany + guard สถานะ → idempotent (ถ้า drain retry ก็ไม่พัง)
const withApprovalEffect =
  (handler: OutboxHandler): OutboxHandler =>
  async (evt) => {
    await handler(evt); // notify เดิมก่อนเสมอ
    if (evt.type === "approval.request.approved" || evt.type === "approval.request.rejected") {
      await applyApprovalEffect({ tenantId: evt.tenantId, type: evt.type, payload: evt.payload });
    }
  };

// ── Webhooks ขาออก (WO-0062): ห่อเพิ่มอีกชั้นหลัง handler หลัก(+automation) สำเร็จ ──
// ยิงฮุคไปทุก endpoint ที่ร้าน subscribe event นี้ — best-effort เหมือน automation
// (dispatch จับ error ต่อ endpoint อยู่แล้ว · ห่อ try/catch กัน error ระดับ query ไม่ให้ล้ม consumer)
const withWebhooks =
  (handler: OutboxHandler): OutboxHandler =>
  async (evt) => {
    await handler(evt); // handler หลัก(+automation) — พังต้องโยนต่อ (drain retry) ตามเดิม
    try {
      await dispatchWebhooks({ tenantId: evt.tenantId, type: evt.type, payload: evt.payload });
    } catch (e) {
      await logOps("WARN", "outbox", `webhook ของ "${evt.type}" ล้มเหลว`, {
        tenantId: evt.tenantId,
        detail: e instanceof Error ? (e.stack ?? e.message) : String(e),
      });
    }
  };

const baseConsumers: Record<string, OutboxHandler> = {
  "pos.sale.paid": withAutomation(posSalePaid),
  "pos.sale.voided": withAutomation(posSaleVoided),
  "approval.request.submitted": withAutomation(approvalSubmitted),
  "approval.request.approved": withAutomation(withApprovalEffect(approvalApproved)),
  "approval.request.rejected": withAutomation(withApprovalEffect(approvalRejected)),
  // WO-0038: AppNotification ถูกสร้างแล้วใน sweepExpiringLots — consumer นี้มีไว้ปิด event เป็น DONE
  // (ไม่งั้นค้าง PENDING โดน drain วนตลอด) + เป็นจุดให้ Automation rules ยิงตามกติกาที่ร้านตั้ง
  "inventory.lot.expiring": withAutomation(async () => {}),
};

// ห่อทุก consumer ด้วย withWebhooks → ทุก event ที่ drain สำเร็จจะ dispatch ฮุคให้อัตโนมัติ
export const consumers: Record<string, OutboxHandler> = Object.fromEntries(
  Object.entries(baseConsumers).map(([type, handler]) => [type, withWebhooks(handler)]),
);

export async function drainAll() {
  return drainOutbox(consumers);
}
