"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUnit } from "@/lib/core/context";
import { assertCan } from "@/lib/core/rbac";
import * as shop from "./service";

type UnitAuth = Awaited<ReturnType<typeof requireUnit>>["auth"];

function ctxOf(auth: UnitAuth, unitId: string) {
  return { tenantId: auth.active.tenantId, unitId };
}

// ตรวจสิทธิ์ระดับหน่วย (OWNER ผ่าน · MANAGER ผ่านในหน่วยที่คุม · STAFF ต้องมี permission)
function assertShopCan(auth: UnitAuth, unitId: string, action: string) {
  assertCan(
    {
      role: auth.active.role,
      unitAccess: auth.active.unitAccess as string[],
      permissions: auth.active.permissions as Record<string, unknown>,
    },
    { module: "shop", action, unitId },
  );
}

// ───────────────────────── สินค้า ─────────────────────────
const productSchema = z.object({
  name: z.string().trim().min(1).max(120),
  priceBaht: z.coerce.number().min(0).max(10_000_000),
  description: z.string().trim().max(500).optional(),
  imageUrl: z.string().trim().max(500).optional(),
  invItemId: z.string().trim().max(40).optional(),
  sortOrder: z.coerce.number().int().min(0).max(9999).optional(),
});

export async function createProductAction(unitSlug: string, formData: FormData) {
  const { auth, unit } = await requireUnit(unitSlug);
  assertShopCan(auth, unit.id, "shop.product.create");
  const p = productSchema.safeParse({
    name: formData.get("name"),
    priceBaht: formData.get("priceBaht"),
    description: formData.get("description") || undefined,
    imageUrl: formData.get("imageUrl") || undefined,
    invItemId: formData.get("invItemId") || undefined,
    sortOrder: formData.get("sortOrder") || undefined,
  });
  if (!p.success) return;
  await shop.createProduct(ctxOf(auth, unit.id), {
    name: p.data.name,
    priceSatang: Math.round(p.data.priceBaht * 100),
    description: p.data.description,
    imageUrl: p.data.imageUrl,
    invItemId: p.data.invItemId,
    sortOrder: p.data.sortOrder,
  });
  revalidatePath(`/app/u/${unitSlug}/shop`);
}

export async function updateProductAction(unitSlug: string, productId: string, formData: FormData) {
  const { auth, unit } = await requireUnit(unitSlug);
  assertShopCan(auth, unit.id, "shop.product.update");
  const p = productSchema.safeParse({
    name: formData.get("name"),
    priceBaht: formData.get("priceBaht"),
    description: formData.get("description") || undefined,
    imageUrl: formData.get("imageUrl") || undefined,
    invItemId: formData.get("invItemId") || undefined,
    sortOrder: formData.get("sortOrder") || undefined,
  });
  if (!p.success) return;
  await shop.updateProduct(ctxOf(auth, unit.id), productId, {
    name: p.data.name,
    priceSatang: Math.round(p.data.priceBaht * 100),
    description: p.data.description ?? null,
    imageUrl: p.data.imageUrl ?? null,
    invItemId: p.data.invItemId ?? null,
    sortOrder: p.data.sortOrder,
  });
  revalidatePath(`/app/u/${unitSlug}/shop`);
}

export async function toggleProductAction(unitSlug: string, productId: string, active: boolean) {
  const { auth, unit } = await requireUnit(unitSlug);
  assertShopCan(auth, unit.id, "shop.product.update");
  await shop.updateProduct(ctxOf(auth, unit.id), productId, { active });
  revalidatePath(`/app/u/${unitSlug}/shop`);
}

// ───────────────────────── ออเดอร์ ─────────────────────────
export async function confirmOrderAction(unitSlug: string, orderId: string) {
  const { auth, unit } = await requireUnit(unitSlug);
  assertShopCan(auth, unit.id, "shop.order.confirm");
  await shop.confirmOrderPaid(ctxOf(auth, unit.id), orderId, auth.active.userId);
  revalidatePath(`/app/u/${unitSlug}/shop/orders`);
}

export async function cancelOrderAction(unitSlug: string, orderId: string) {
  const { auth, unit } = await requireUnit(unitSlug);
  assertShopCan(auth, unit.id, "shop.order.cancel");
  await shop.cancelOrder(ctxOf(auth, unit.id), orderId);
  revalidatePath(`/app/u/${unitSlug}/shop/orders`);
}

// คืนเงิน/ยกเลิกหลังชำระ — void PosSale + คืนสต็อก · error inline ผ่าน ?err= (pattern เดียวกับบัญชี)
export async function refundOrderAction(unitSlug: string, orderId: string) {
  const { auth, unit } = await requireUnit(unitSlug);
  assertShopCan(auth, unit.id, "shop.order.refund");
  const res = await shop.refundOrder(ctxOf(auth, unit.id), orderId);
  revalidatePath(`/app/u/${unitSlug}/shop/orders`);
  if (!res.ok) {
    redirect(`/app/u/${unitSlug}/shop/orders?err=${encodeURIComponent(res.reason ?? "คืนเงินไม่สำเร็จ")}`);
  }
}
