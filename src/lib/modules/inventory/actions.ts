"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { requireTenant } from "@/lib/core/context";
import { assertCan } from "@/lib/core/rbac";
import { parseCsv, type ImportSummary } from "@/lib/core/csv";
import {
  archiveItem,
  bulkCount,
  consume,
  createItem,
  createLocation,
  findItemByBarcode,
  importItems,
  itemLots,
  receive,
  transfer,
  updateItem,
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

// ── แก้ไขข้อมูลสินค้า (ชื่อ/SKU/บาร์โค้ด/หมวด/หน่วย/จุดสั่งซื้อ) — ไม่แตะยอด/ต้นทุน ──
export async function updateItemAction(formData: FormData) {
  const auth = await requireTenant();
  assertInventoryCan(auth, "inventory.item.update");
  const systemId = String(formData.get("systemId") ?? "");
  const itemId = String(formData.get("itemId") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  if (!systemId || !itemId || !name) return;
  const ctx: Ctx = { tenantId: auth.active.tenantId, systemId };
  await updateItem(ctx, itemId, {
    name,
    sku: String(formData.get("sku") ?? "").trim(),
    barcode: String(formData.get("barcode") ?? "").trim() || null,
    category: String(formData.get("category") ?? "").trim() || null,
    unitLabel: String(formData.get("unitLabel") ?? "").trim(),
    reorderPoint: toQty(formData.get("reorderPoint")),
  });
  revalidate(systemId);
}

// ── ปิดการใช้งานสินค้า (soft) — ไม่โผล่ในรายการ/แคตตาล็อก POS · ประวัติคงอยู่ ──
export async function archiveItemAction(formData: FormData) {
  const auth = await requireTenant();
  assertInventoryCan(auth, "inventory.item.update");
  const systemId = String(formData.get("systemId") ?? "");
  const itemId = String(formData.get("itemId") ?? "");
  if (!systemId || !itemId) return;
  const ctx: Ctx = { tenantId: auth.active.tenantId, systemId };
  await archiveItem(ctx, itemId);
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

// ── นับสต็อกหลายรายการพร้อมกัน (stock take) — ตั้ง onHand = จำนวนนับจริง เฉพาะแถวที่กรอก ──
// สิทธิ์เดียวกับปรับสต็อกรายตัว (inventory.movement.adjust) · คืนสรุปผลให้ useActionState แสดง inline
export type BulkCountState =
  | { status: "idle" }
  | { status: "done"; done: number; failed: { itemId: string; reason: string }[] }
  | { status: "error"; message: string };

export async function bulkCountAction(
  systemId: string,
  _prev: BulkCountState,
  formData: FormData,
): Promise<BulkCountState> {
  const auth = await requireTenant();
  assertInventoryCan(auth, "inventory.movement.adjust");
  if (!systemId) return { status: "error", message: "ไม่พบระบบ" };
  // แถวขนาน: countItemId[] / countQty[] — เฉพาะแถวที่กรอกจำนวนจริง (ว่าง = ไม่นับ · "0" = นับได้ 0)
  const itemIds = formData.getAll("countItemId");
  const rawQtys = formData.getAll("countQty");
  const counts = itemIds
    .map((raw, i) => ({ itemId: String(raw ?? "").trim(), rawQty: String(rawQtys[i] ?? "").trim() }))
    .filter((c) => c.itemId && c.rawQty !== "")
    .map((c) => ({ itemId: c.itemId, countedQty: Math.max(0, Math.round(Number(c.rawQty) || 0)) }));
  if (counts.length === 0) {
    return { status: "error", message: "กรุณากรอกจำนวนที่นับได้อย่างน้อย 1 รายการ" };
  }
  const ctx: Ctx = { tenantId: auth.active.tenantId, systemId };
  const res = await bulkCount(ctx, counts);
  revalidate(systemId);
  return { status: "done", done: res.done, failed: res.failed };
}

// ── นำเข้าสินค้าจาก CSV (WO Wave6-A) — ใช้กับ useActionState · onHand เริ่ม 0 ──
export async function importItemsAction(
  systemId: string,
  _prev: ImportSummary | null,
  formData: FormData,
): Promise<ImportSummary | null> {
  const auth = await requireTenant();
  assertInventoryCan(auth, "inventory.item.import");
  const csv = String(formData.get("csv") ?? "");
  if (!systemId || !csv.trim()) return null;
  const table = parseCsv(csv);
  if (table.rows.length === 0) {
    return { created: 0, skipped: 0, errors: [{ row: 0, reason: "ไม่พบข้อมูล — ต้องมีบรรทัดหัวคอลัมน์ + อย่างน้อย 1 แถว" }] };
  }
  const ctx: Ctx = { tenantId: auth.active.tenantId, systemId };
  const summary = await importItems(ctx, table);
  revalidate(systemId);
  return summary;
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
