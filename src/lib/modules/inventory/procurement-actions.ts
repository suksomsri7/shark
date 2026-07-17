"use server";

import { revalidatePath } from "next/cache";
import { requireTenant } from "@/lib/core/context";
import { assertCan } from "@/lib/core/rbac";
import type { Ctx } from "./service";
import {
  cancelPo,
  createPo,
  createSupplier,
  disableVendorPortal,
  enableVendorPortal,
  markOrdered,
  receivePo,
} from "./procurement";

// ตรวจสิทธิ์โมดูล Inventory (system-scoped) — convention action = "inventory.<entity>.<verb>"
// (F6 ratchet บังคับให้ไฟล์ actions เรียก assertCan)
function assertInventoryCan(auth: Awaited<ReturnType<typeof requireTenant>>, action: string) {
  assertCan(
    {
      role: auth.active.role,
      unitAccess: auth.active.unitAccess as string[],
      permissions: auth.active.permissions as Record<string, unknown>,
    },
    { module: "inventory", action },
  );
}

const revalidate = (systemId: string) => revalidatePath(`/app/sys/${systemId}`);

// จำนวนเต็มบวก (ปฏิเสธค่าติดลบ/ไม่ใช่ตัวเลข → 0)
const toQty = (v: FormDataEntryValue | undefined): number => {
  const n = Number(String(v ?? "").trim());
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
};

// รับเป็นบาท → สตางค์ (ต้นทุน/หน่วย)
const bahtToSatang = (v: FormDataEntryValue | undefined): number => {
  const n = Number(String(v ?? "").trim());
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : 0;
};

// ── สร้างซัพพลายเออร์ ──
export async function createSupplierAction(formData: FormData) {
  const auth = await requireTenant();
  assertInventoryCan(auth, "inventory.supplier.create");
  const systemId = String(formData.get("systemId") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  if (!systemId || !name) return;
  const ctx: Ctx = { tenantId: auth.active.tenantId, systemId };
  await createSupplier(ctx, {
    name,
    phone: String(formData.get("phone") ?? "").trim() || null,
    email: String(formData.get("email") ?? "").trim() || null,
    note: String(formData.get("note") ?? "").trim() || null,
  });
  revalidate(systemId);
}

// ── เปิด/หมุนลิงก์ผู้ขาย (Vendor Portal) ──
export async function enableVendorPortalAction(formData: FormData) {
  const auth = await requireTenant();
  assertInventoryCan(auth, "inventory.supplier.update");
  const systemId = String(formData.get("systemId") ?? "");
  const supplierId = String(formData.get("supplierId") ?? "").trim();
  if (!systemId || !supplierId) return;
  const ctx: Ctx = { tenantId: auth.active.tenantId, systemId };
  await enableVendorPortal(ctx, supplierId);
  revalidate(systemId);
}

// ── ปิดลิงก์ผู้ขาย ──
export async function disableVendorPortalAction(formData: FormData) {
  const auth = await requireTenant();
  assertInventoryCan(auth, "inventory.supplier.update");
  const systemId = String(formData.get("systemId") ?? "");
  const supplierId = String(formData.get("supplierId") ?? "").trim();
  if (!systemId || !supplierId) return;
  const ctx: Ctx = { tenantId: auth.active.tenantId, systemId };
  await disableVendorPortal(ctx, supplierId);
  revalidate(systemId);
}

// ── สร้างใบสั่งซื้อ (DRAFT) ──
export async function createPoAction(formData: FormData) {
  const auth = await requireTenant();
  assertInventoryCan(auth, "inventory.po.create");
  const systemId = String(formData.get("systemId") ?? "");
  const supplierId = String(formData.get("supplierId") ?? "").trim();
  if (!systemId || !supplierId) return;

  // แถวสินค้าแบบขนาน: lineItemId[] / lineQty[] / lineCost[]
  const itemIds = formData.getAll("lineItemId");
  const qtys = formData.getAll("lineQty");
  const costs = formData.getAll("lineCost");
  const lines = itemIds
    .map((raw, i) => ({
      itemId: String(raw ?? "").trim(),
      qty: toQty(qtys[i]),
      costSatang: bahtToSatang(costs[i]),
    }))
    .filter((l) => l.itemId && l.qty > 0);
  if (lines.length === 0) return;

  const ctx: Ctx = { tenantId: auth.active.tenantId, systemId };
  await createPo(ctx, { supplierId, note: String(formData.get("note") ?? "").trim() || null, lines });
  revalidate(systemId);
}

// ── ยืนยันสั่งซื้อ (DRAFT → ORDERED | เข้าสายอนุมัติ) ──
// WO-0049b: markOrdered อาจคืน { pending: true } (มีสายอนุมัติตามวงเงิน) → PO คง DRAFT แล้วเข้าสาย
//   ผลบนจอ = ป้าย "รออนุมัติ" ในหน้ารายการ PO (หลัง revalidate) แทนข้อความ "ส่งเข้าสายอนุมัติแล้ว"
//   ไม่มีสาย → ORDERED เหมือนเดิม · ส่ง actorUserId = ผู้กด (บันทึกเป็น requestedById ของคำขอ)
//   (form action นี้คืน void ตามสัญญาเดิม — ไม่ต้อง useActionState เพราะป้ายสถานะสื่อผลให้ครบแล้ว)
export async function markOrderedAction(formData: FormData) {
  const auth = await requireTenant();
  assertInventoryCan(auth, "inventory.po.order");
  const systemId = String(formData.get("systemId") ?? "");
  const poId = String(formData.get("poId") ?? "").trim();
  if (!systemId || !poId) return;
  const ctx: Ctx = { tenantId: auth.active.tenantId, systemId };
  await markOrdered(ctx, poId, auth.user.id);
  revalidate(systemId);
}

// ── รับของเข้าคลัง (ORDERED → RECEIVED + เข้าสต็อก) ──
export async function receivePoAction(formData: FormData) {
  const auth = await requireTenant();
  assertInventoryCan(auth, "inventory.po.receive");
  const systemId = String(formData.get("systemId") ?? "");
  const poId = String(formData.get("poId") ?? "").trim();
  if (!systemId || !poId) return;
  const ctx: Ctx = { tenantId: auth.active.tenantId, systemId };
  const locationId = String(formData.get("locationId") ?? "").trim();
  await receivePo(ctx, poId, locationId ? { locationId } : undefined);
  revalidate(systemId);
}

// ── ยกเลิกใบสั่งซื้อ (DRAFT/ORDERED → CANCELLED) ──
export async function cancelPoAction(formData: FormData) {
  const auth = await requireTenant();
  assertInventoryCan(auth, "inventory.po.cancel");
  const systemId = String(formData.get("systemId") ?? "");
  const poId = String(formData.get("poId") ?? "").trim();
  if (!systemId || !poId) return;
  const ctx: Ctx = { tenantId: auth.active.tenantId, systemId };
  await cancelPo(ctx, poId);
  revalidate(systemId);
}
