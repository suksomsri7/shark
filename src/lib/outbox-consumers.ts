// outbox-consumers.ts — composition root ของ outbox (อยู่นอก core → import โมดูลได้)
// ผูก event type → handler · handler อ่านข้อมูลจาก prisma ตรง แล้วส่งให้ pos/account-bridge
// WO-0002: "pos.sale.paid" (ขายสด→บัญชี) · "pos.sale.voided" (void→กลับรายการ)

import { prisma } from "@/lib/core/db";
import { drainOutbox, type OutboxHandler } from "@/lib/core/outbox";
import { bridgePosSalePaid, bridgePosSaleVoided } from "@/lib/modules/pos/account-bridge";
import { runForEvent } from "@/lib/automation/engine";

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
    await handler(evt); // งานหลักก่อน (พัง = พังตามเดิม → retry/backoff)
    try {
      await runForEvent({ tenantId: evt.tenantId, type: evt.type, payload: evt.payload });
    } catch {
      // automation ล้มเหลว = เรื่องรอง — event หลัก DONE ตามปกติ
    }
  };

export const consumers: Record<string, OutboxHandler> = {
  "pos.sale.paid": withAutomation(posSalePaid),
  "pos.sale.voided": withAutomation(posSaleVoided),
};

export async function drainAll() {
  return drainOutbox(consumers);
}
