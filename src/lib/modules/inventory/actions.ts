"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { requireTenant } from "@/lib/core/context";
import { assertCan } from "@/lib/core/rbac";
import {
  consume,
  createItem,
  createLocation,
  findItemByBarcode,
  itemLots,
  receive,
  transfer,
  type Ctx,
} from "./service";

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
    barcode: String(formData.get("barcode") ?? "").trim() || null,
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
  // lot + วันหมดอายุ (ไม่บังคับ) — ปล่อยว่าง = พฤติกรรมเดิม ไม่แตะ InvLot
  const lotCode = String(formData.get("lotCode") ?? "").trim() || null;
  const expiryStr = String(formData.get("expiryDate") ?? "").trim();
  const expiryDate = expiryStr ? new Date(`${expiryStr}T00:00:00+07:00`) : null;
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
    lotCode,
    expiryDate: lotCode ? expiryDate : null, // วันหมดอายุมีความหมายเมื่อระบุ lot
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
    lotCode: String(formData.get("lotCode") ?? "").trim() || null,
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

// ── ดู lot คงเหลือของสินค้า (WO-0038) — read action ──
export async function itemLotsAction(systemId: string, itemId: string) {
  const auth = await requireTenant();
  assertInventoryCan(auth, "inventory.item.read");
  if (!systemId || !itemId) return [];
  const ctx: Ctx = { tenantId: auth.active.tenantId, systemId };
  return itemLots(ctx, itemId);
}

// ── ค้นหาสินค้าด้วยบาร์โค้ด (WO-0038) — สำหรับช่องสแกน/ค้นในหน้าคลัง ──
export type BarcodeSearchResult =
  | { ok: true; item: { id: string; name: string; sku: string; onHand: number; unitLabel: string } }
  | { ok: false; barcode: string };

export async function findItemByBarcodeAction(
  systemId: string,
  _prev: BarcodeSearchResult | null,
  formData: FormData,
): Promise<BarcodeSearchResult | null> {
  const auth = await requireTenant();
  assertInventoryCan(auth, "inventory.item.read");
  const barcode = String(formData.get("barcode") ?? "").trim();
  if (!systemId || !barcode) return null;
  const ctx: Ctx = { tenantId: auth.active.tenantId, systemId };
  const item = await findItemByBarcode(ctx, barcode);
  if (!item) return { ok: false, barcode };
  return {
    ok: true,
    item: { id: item.id, name: item.name, sku: item.sku, onHand: item.onHand, unitLabel: item.unitLabel },
  };
}
