import { tenantDb } from "@/lib/core/db";
import type { KdsItemStatus } from "@prisma/client";
import "./scope";

const FORWARD: Record<string, KdsItemStatus[]> = {
  NEW: ["COOKING", "READY"],
  COOKING: ["READY", "SERVED"],
  READY: ["SERVED"],
  SERVED: [],
  CANCELLED: [],
};

// คิวของสถานี — เฉพาะรายการที่ยัง active (order ไม่ยกเลิก) จัดเรียง rush→เวลา
export async function stationQueue(
  tenantId: string,
  unitId: string,
  stationId: string,
  statuses: KdsItemStatus[] = ["NEW", "COOKING", "READY"],
) {
  const db = tenantDb({ tenantId, unitId });
  const items = await db.restaurantOrderItem.findMany({
    where: {
      stationId,
      kdsStatus: { in: statuses },
      order: { status: { in: ["CONFIRMED", "COMPLETED"] } },
    },
    orderBy: [{ isRush: "desc" }, { createdAt: "asc" }],
    include: {
      options: true,
      order: { include: { session: { include: { table: true } } } },
    },
  });
  return items;
}

// เลื่อนสถานะ (ไปข้างหน้าเท่านั้น)
export async function advanceItem(
  tenantId: string,
  unitId: string,
  itemId: string,
  to: KdsItemStatus,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const db = tenantDb({ tenantId, unitId });
  const it = await db.restaurantOrderItem.findFirst({ where: { id: itemId } });
  if (!it) return { ok: false, reason: "ไม่พบรายการ" };
  if (it.saleId) return { ok: false, reason: "รายการนี้ชำระแล้ว" };
  if (!FORWARD[it.kdsStatus]?.includes(to)) {
    return { ok: false, reason: "เลื่อนสถานะย้อนหลังไม่ได้" };
  }
  const now = new Date();
  await db.restaurantOrderItem.update({
    where: { id: itemId },
    data: {
      kdsStatus: to,
      ...(to === "COOKING" ? { cookingAt: now } : {}),
      ...(to === "READY" ? { readyAt: now } : {}),
      ...(to === "SERVED" ? { servedAt: now } : {}),
    },
  });
  await maybeCompleteOrder(tenantId, unitId, it.orderId);
  return { ok: true };
}

// recall: READY→COOKING (Manager)
export async function recallItem(tenantId: string, unitId: string, itemId: string) {
  const db = tenantDb({ tenantId, unitId });
  const it = await db.restaurantOrderItem.findFirst({ where: { id: itemId } });
  if (!it || it.kdsStatus !== "READY" || it.saleId) return { ok: false as const, reason: "recall ไม่ได้" };
  await db.restaurantOrderItem.update({ where: { id: itemId }, data: { kdsStatus: "COOKING", readyAt: null } });
  return { ok: true as const };
}

// ถ้าทุกรายการ SERVED/CANCELLED → order = COMPLETED
async function maybeCompleteOrder(tenantId: string, unitId: string, orderId: string) {
  const db = tenantDb({ tenantId, unitId });
  const items = await db.restaurantOrderItem.findMany({ where: { orderId }, select: { kdsStatus: true } });
  const allDone = items.length > 0 && items.every((i) => i.kdsStatus === "SERVED" || i.kdsStatus === "CANCELLED");
  if (allDone) {
    await db.restaurantOrder.update({ where: { id: orderId }, data: { status: "COMPLETED" } });
  }
}

// Expo: ทุกสถานี เฉพาะ READY จัดกลุ่มตามโต๊ะ/ออเดอร์
export async function expoQueue(tenantId: string, unitId: string) {
  const db = tenantDb({ tenantId, unitId });
  return db.restaurantOrderItem.findMany({
    where: { kdsStatus: "READY", order: { status: { in: ["CONFIRMED", "COMPLETED"] } } },
    orderBy: [{ isRush: "desc" }, { readyAt: "asc" }],
    include: { options: true, station: true, order: { include: { session: { include: { table: true } } } } },
  });
}
