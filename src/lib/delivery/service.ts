// Delivery service (WO-0060) — shipment ต่อ ShopOrder (order ละ 1 ใบ)
// v1 MANUAL: ร้านสร้างใบจัดส่งเองหลังรับเงิน แล้วเดินสถานะ PREPARING→SHIPPED→DELIVERED
//
// ctx = { tenantId, unitId } — Shipment เป็น unit axis → ทุก query ผ่าน tenantDb(ctx)
// นโยบาย: สร้าง shipment ได้เฉพาะ order ที่ชำระเงินแล้ว (PAID) และอยู่ในหน่วยนี้
import { Prisma } from "@prisma/client";
import { tenantDb } from "@/lib/core/db";
import { isKnownProvider } from "./adapters";

export type DeliveryCtx = { tenantId: string; unitId: string };

export type CreateShipmentInput = {
  orderId: string;
  provider: string;
  trackingNo?: string | null;
  note?: string | null;
};

export async function createShipment(ctx: DeliveryCtx, input: CreateShipmentInput): Promise<{ id: string }> {
  const provider = input.provider?.trim();
  if (!provider || !isKnownProvider(provider)) throw new Error("ไม่รองรับผู้ให้บริการจัดส่งนี้");

  const db = tenantDb(ctx);

  // order ต้องอยู่ในหน่วยนี้ (tenantDb กรอง tenantId+unitId ให้แล้ว) + ชำระเงินแล้ว
  const order = await db.shopOrder.findFirst({ where: { id: input.orderId } });
  if (!order) throw new Error("ไม่พบออเดอร์ในร้านนี้");
  if (order.status !== "PAID") throw new Error("สร้างใบจัดส่งได้เฉพาะออเดอร์ที่ชำระเงินแล้ว");

  // order ละ 1 ใบ — เช็กก่อน (กันซ้ำแบบชัดเจน) + กันชนที่ระดับ DB (unique orderId)
  const existing = await db.shipment.findFirst({ where: { orderId: input.orderId } });
  if (existing) throw new Error("ออเดอร์นี้มีใบจัดส่งอยู่แล้ว");

  try {
    const sh = await db.shipment.create({
      data: {
        tenantId: ctx.tenantId,
        unitId: ctx.unitId,
        orderId: input.orderId,
        provider,
        trackingNo: input.trackingNo?.trim() || null,
        note: input.note?.trim() || null,
        status: "PREPARING",
      },
    });
    return { id: sh.id };
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      throw new Error("ออเดอร์นี้มีใบจัดส่งอยู่แล้ว");
    }
    throw e;
  }
}

export type UpdateShipmentPatch = {
  status?: "PREPARING" | "SHIPPED" | "DELIVERED" | "CANCELLED";
  trackingNo?: string | null;
  note?: string | null;
};

// เดินสถานะ/แก้เลขพัสดุ — CANCELLED แล้วล็อก (แก้ไม่ได้ → false) · ไม่พบใบ → false
export async function updateShipment(
  ctx: DeliveryCtx,
  shipmentId: string,
  patch: UpdateShipmentPatch,
): Promise<boolean> {
  const db = tenantDb(ctx);
  const sh = await db.shipment.findFirst({ where: { id: shipmentId } });
  if (!sh) return false;
  if (sh.status === "CANCELLED") return false;

  const data: Record<string, unknown> = {};
  if (patch.status !== undefined) data.status = patch.status;
  if (patch.trackingNo !== undefined) data.trackingNo = patch.trackingNo?.trim() || null;
  if (patch.note !== undefined) data.note = patch.note?.trim() || null;
  if (Object.keys(data).length === 0) return true;

  const res = await db.shipment.updateMany({ where: { id: shipmentId }, data });
  return res.count > 0;
}

export async function getShipmentForOrder(ctx: DeliveryCtx, orderId: string) {
  return tenantDb(ctx).shipment.findFirst({ where: { orderId } });
}
