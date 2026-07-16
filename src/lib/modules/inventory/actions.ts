"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { requireTenant } from "@/lib/core/context";
import { assertCan } from "@/lib/core/rbac";
import { consume, createItem, createLocation, receive, transfer, type Ctx } from "./service";

// ตรวจสิทธิ์โมดูล Inventory (system-scoped) — OWNER/MANAGER ผ่าน · STAFF ตาม permission
// convention action = "inventory.<entity>.<verb>" (F6 ratchet บังคับให้ไฟล์นี้เรียก assertCan)
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
const toQty = (v: FormDataEntryValue | null): number => {
  const n = Number(String(v ?? "").trim());
  return Number.isFinite(n) ? Math.round(n) : 0;
};

// รับเป็นบาท → สตางค์ (ต้นทุน)
const bahtToSatang = (v: FormDataEntryValue | null): number => {
  const n = Number(String(v ?? "").trim());
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : 0;
};

// ── สร้างสินค้าใหม่ ──
export async function createItemAction(formData: FormData) {
  const auth = await requireTenant();
  assertInventoryCan(auth, "inventory.item.create");
  const systemId = String(formData.get("systemId") ?? "");
  const sku = String(formData.get("sku") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  if (!systemId || !sku || !name) return;
  const ctx: Ctx = { tenantId: auth.active.tenantId, systemId };
  await createItem(ctx, {
    sku,
    name,
    unitLabel: String(formData.get("unitLabel") ?? "").trim() || null,
    category: String(formData.get("category") ?? "").trim() || null,
    reorderPoint: toQty(formData.get("reorderPoint")),
    costSatang: bahtToSatang(formData.get("cost")),
  });
  revalidate(systemId);
}

// ── รับเข้า (เพิ่มสต็อก + ต้นทุนถัวเฉลี่ย) ──
export async function receiveAction(formData: FormData) {
  const auth = await requireTenant();
  assertInventoryCan(auth, "inventory.movement.receive");
  const systemId = String(formData.get("systemId") ?? "");
  const itemId = String(formData.get("itemId") ?? "");
  const qty = toQty(formData.get("qty"));
  if (!systemId || !itemId || qty <= 0) return;
  const ctx: Ctx = { tenantId: auth.active.tenantId, systemId };
  await receive(ctx, {
    itemId,
    qty,
    costSatang: bahtToSatang(formData.get("cost")),
    // สร้างจากฟอร์ม (คนกดครั้งเดียว) → key ใหม่ต่อการกด
    idempotencyKey: `manual-in-${randomUUID()}`,
    sourceModule: "manual",
    refType: "ManualReceive",
    refId: itemId,
    note: String(formData.get("note") ?? "").trim() || null,
    locationId: String(formData.get("locationId") ?? "").trim() || null,
  });
  revalidate(systemId);
}

// ── ตัดออก (ปรับลดด้วยมือ — เสีย/สูญหาย/ใช้ภายใน) ──
export async function consumeAction(formData: FormData) {
  const auth = await requireTenant();
  assertInventoryCan(auth, "inventory.movement.consume");
  const systemId = String(formData.get("systemId") ?? "");
  const itemId = String(formData.get("itemId") ?? "");
  const qty = toQty(formData.get("qty"));
  if (!systemId || !itemId || qty <= 0) return;
  const ctx: Ctx = { tenantId: auth.active.tenantId, systemId };
  await consume(ctx, {
    itemId,
    qty,
    sourceModule: "manual",
    refType: "ManualIssue",
    refId: itemId,
    idempotencyKey: `manual-out-${randomUUID()}`,
    note: String(formData.get("note") ?? "").trim() || null,
    locationId: String(formData.get("locationId") ?? "").trim() || null,
  });
  revalidate(systemId);
}

// ── สร้างคลังใหม่ (WO-0037) ──
export async function createLocationAction(formData: FormData) {
  const auth = await requireTenant();
  assertInventoryCan(auth, "inventory.location.create");
  const systemId = String(formData.get("systemId") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  if (!systemId || !name) return;
  const ctx: Ctx = { tenantId: auth.active.tenantId, systemId };
  await createLocation(ctx, { name });
  revalidate(systemId);
}

// ── โอนสต็อกระหว่างคลัง (WO-0037) ──
export async function transferAction(formData: FormData) {
  const auth = await requireTenant();
  assertInventoryCan(auth, "inventory.movement.transfer");
  const systemId = String(formData.get("systemId") ?? "");
  const itemId = String(formData.get("itemId") ?? "").trim();
  const fromLocationId = String(formData.get("fromLocationId") ?? "").trim();
  const toLocationId = String(formData.get("toLocationId") ?? "").trim();
  const qty = toQty(formData.get("qty"));
  if (!systemId || !itemId || !fromLocationId || !toLocationId || fromLocationId === toLocationId || qty <= 0) return;
  const ctx: Ctx = { tenantId: auth.active.tenantId, systemId };
  await transfer(ctx, {
    itemId,
    fromLocationId,
    toLocationId,
    qty,
    idempotencyKey: `manual-tf-${randomUUID()}`,
    note: String(formData.get("note") ?? "").trim() || null,
  });
  revalidate(systemId);
}
