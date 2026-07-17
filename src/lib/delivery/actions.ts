"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUnit } from "@/lib/core/context";
import { assertCan } from "@/lib/core/rbac";
import * as delivery from "./service";

type UnitAuth = Awaited<ReturnType<typeof requireUnit>>["auth"];

function ctxOf(auth: UnitAuth, unitId: string) {
  return { tenantId: auth.active.tenantId, unitId };
}

function assertDeliveryCan(auth: UnitAuth, unitId: string, action: string) {
  assertCan(
    {
      role: auth.active.role,
      unitAccess: auth.active.unitAccess as string[],
      permissions: auth.active.permissions as Record<string, unknown>,
    },
    { module: "delivery", action, unitId },
  );
}

const createSchema = z.object({
  provider: z.string().trim().min(1).max(40),
  trackingNo: z.string().trim().max(80).optional(),
  note: z.string().trim().max(300).optional(),
});

// สร้างใบจัดส่งให้ออเดอร์ (เฉพาะ order PAID) — /app/u/[unitSlug]/shop/orders
export async function createShipmentAction(unitSlug: string, orderId: string, formData: FormData) {
  const { auth, unit } = await requireUnit(unitSlug);
  assertDeliveryCan(auth, unit.id, "delivery.shipment.create");
  const p = createSchema.safeParse({
    provider: formData.get("provider"),
    trackingNo: formData.get("trackingNo") || undefined,
    note: formData.get("note") || undefined,
  });
  if (!p.success) return;
  await delivery.createShipment(ctxOf(auth, unit.id), {
    orderId,
    provider: p.data.provider,
    trackingNo: p.data.trackingNo,
    note: p.data.note,
  });
  revalidatePath(`/app/u/${unitSlug}/shop/orders`);
}

const statusSchema = z.enum(["PREPARING", "SHIPPED", "DELIVERED", "CANCELLED"]);

// อัปเดตสถานะจัดส่ง (ส่งแล้ว/ถึงแล้ว/ยกเลิก) — /app/u/[unitSlug]/shop/orders
export async function updateShipmentStatusAction(unitSlug: string, shipmentId: string, status: string) {
  const { auth, unit } = await requireUnit(unitSlug);
  assertDeliveryCan(auth, unit.id, "delivery.shipment.update");
  const s = statusSchema.safeParse(status);
  if (!s.success) return;
  await delivery.updateShipment(ctxOf(auth, unit.id), shipmentId, { status: s.data });
  revalidatePath(`/app/u/${unitSlug}/shop/orders`);
}
