// outbox-consumers.ts — composition root ของ outbox (อยู่นอก core → import โมดูลได้)
// ผูก event type → handler · handler อ่านข้อมูลจาก prisma ตรง แล้วส่งให้ pos/account-bridge
// WO-0002: "pos.sale.paid" (ขายสด→บัญชี) · "pos.sale.voided" (void→กลับรายการ)

import { prisma } from "@/lib/core/db";
import { drainOutbox, type OutboxHandler } from "@/lib/core/outbox";
import { bridgePosSalePaid, bridgePosSaleVoided } from "@/lib/modules/pos/account-bridge";

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

export const consumers: Record<string, OutboxHandler> = {
  "pos.sale.paid": posSalePaid,
  "pos.sale.voided": posSaleVoided,
};

export async function drainAll() {
  return drainOutbox(consumers);
}
