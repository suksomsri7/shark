// Account ↔ Inventory — "สินค้าบัญชี" ผูกกับ "สินค้าในคลัง" (WO 4.1 · MAP §F.8–12, §F.15)
//
// ═══ ทิศ canonical (ตัดสินใจครั้งเดียว ห้ามแตกสองทาง) ═══
//   InvItem  = ต้นฉบับของ  sku · unitLabel(หน่วย) · costSatang(ต้นทุน→ราคาซื้อ) · onHand(สต็อก) · barcode · จุดสั่งซื้อ · คลัง
//   AccountProduct = ต้นฉบับของ  ผังบัญชีรายได้/ค่าใช้จ่าย · vatRateBp · salePrice(ราคาขาย) · nameEn · รูป · ปักหมุด · ชนิด
//   name (ชื่อ) = แก้ได้ทั้งสองฝั่ง — hook แต่ละทางเขียนอีกฝั่ง "เฉพาะเมื่อค่าต่างกัน" ⇒ idempotent ไม่ปิงปอง
//   สต็อก: ผูกแล้ว → ความจริงคือ `InvItem.onHand` เท่านั้น · `AccountProduct.qtyOnHand` เหลือเป็น
//          **กระจกอ่านอย่างเดียว** (mirror) ที่เราเขียนทับทุกครั้งที่ฝั่งบัญชีขยับสต็อก — ห้ามอ่านมาตัดสินใจ
//          (อาจล้าสมัยได้ถ้าคลัง/POS ขยับสต็อกเอง — ทางอ่านทุกทางต้องผ่าน `productStockMap`)
//   ⚠️ ข้อต่างจาก MAP §F.11: "sync vatRateBp" ทำไม่ได้ — `InvItem` ไม่มีคอลัมน์ VAT
//      ⇒ VAT เป็นฟิลด์บัญชี (AccountProduct เป็นต้นฉบับ) ตามตารางด้านบน
//
// ═══ กติกา degrade (§F.15 "ไม่เชื่อม = ไม่ post") ═══
//   ทุก sync ไม่ throw เมื่ออีกฝั่งหาย/ไม่มีระบบ — คืน { synced:false, reason } แล้วปล่อยผ่าน
//   ห้าม log ชื่อสินค้า/ข้อมูลลูกค้า (reason เป็นรหัสภาษาอังกฤษล้วน)
//
// 🔴 ห้าม import raw `prisma` ที่นี่ (fitness F5 baseline freeze) — ใช้ `tenantDb(ctx)` เท่านั้น
import { tenantDb } from "@/lib/core/db";
// chokepoint account→inventory (fitness F2 · อนุมัติตามใบสั่งงาน WO 4.1):
//   บัญชีอ่าน/ตัดสต็อกผ่านโมดูลคลังเท่านั้น — ห้ามแตะตาราง InvItem/InvMovement ตรงจากที่อื่นในโมดูลบัญชี
import * as inventory from "@/lib/modules/inventory/service";

/** บริบทระบบบัญชี (AppSystem type=ACCOUNT) */
export type AccCtx = { tenantId: string; systemId: string };
/** บริบทระบบคลัง (AppSystem type=INVENTORY) */
export type InvCtx = { tenantId: string; systemId: string };

export type SyncResult = { synced: boolean; reason?: string };

// ─────────────────── resolve ระบบข้ามโมดูล (แบบเดียวกับ inventory.postMovementGl) ───────────────────

/** ระบบคลังสินค้าของกิจการนี้ — null = ยังไม่ได้เปิดระบบคลัง (บัญชีต้อง degrade ไม่ใช่ระเบิด) */
export async function inventorySystemId(tenantId: string): Promise<string | null> {
  const sys = await tenantDb({ tenantId }).appSystem.findFirst({
    where: { type: "INVENTORY" },
    select: { id: true },
  });
  return sys?.id ?? null;
}

/** ระบบบัญชีของกิจการนี้ — ใช้ตอนที่คลังเป็นคนเรียกเข้ามา (มีแต่ INVENTORY ctx) */
async function accountSystemId(tenantId: string): Promise<string | null> {
  const sys = await tenantDb({ tenantId }).appSystem.findFirst({
    where: { type: "ACCOUNT" },
    select: { id: true },
  });
  return sys?.id ?? null;
}

// ─────────────────── หน่วยนับ (AccountUnit ↔ InvItem.unitLabel) ───────────────────

/** หา/สร้างหน่วยนับของระบบบัญชีจากชื่อหน่วยของคลัง — คืน null ถ้าชื่อว่าง */
async function unitIdForLabel(ctx: AccCtx, label: string | null | undefined): Promise<string | null> {
  const name = (label ?? "").trim();
  if (!name) return null;
  const db = tenantDb(ctx);
  const found = await db.accountUnit.findFirst({ where: { name }, select: { id: true } });
  if (found) return found.id;
  try {
    const created = await db.accountUnit.create({ data: { tenantId: ctx.tenantId, systemId: ctx.systemId, name } });
    return created.id;
  } catch {
    // ชนกับคนสร้างพร้อมกัน (unique [systemId,name]) → หาใหม่
    const again = await db.accountUnit.findFirst({ where: { name }, select: { id: true } });
    return again?.id ?? null;
  }
}

/** ชื่อหน่วยของสินค้าบัญชี (AccountUnit.name) — null = ไม่ได้ตั้งหน่วย */
async function unitLabelOf(ctx: AccCtx, unitId: string | null): Promise<string | null> {
  if (!unitId) return null;
  const u = await tenantDb(ctx).accountUnit.findFirst({ where: { id: unitId }, select: { name: true } });
  return u?.name ?? null;
}

// ─────────────────── sync คลัง → บัญชี (MAP §F.11) ───────────────────

/**
 * item ในคลังเปลี่ยน → ดันไปที่ `AccountProduct` ที่ผูกกันไว้: ชื่อ · sku · หน่วย · ราคาซื้อ(=ต้นทุนถัวเฉลี่ย)
 * + เขียนกระจกสต็อก `qtyOnHand` ให้ตรง `InvItem.onHand`
 * เรียกโดยโมดูลคลังผ่าน facade `account/index` (chokepoint inventory→account)
 *
 * เยียวยาลิงก์ครึ่งใบ: ถ้า `InvItem.accountProductId` ชี้มาแล้วแต่ `AccountProduct.invItemId` ยังว่าง
 * (ลิงก์ยุคเก่าที่ `pos.setItemSalePrice` สร้างไว้) → เติมขากลับให้เอง
 * ไม่ throw ทุกกรณี · ห้าม log ข้อมูลลูกค้า
 */
export async function syncItemToAccountProduct(ctx: InvCtx, itemId: string): Promise<SyncResult> {
  const item = await tenantDb(ctx).invItem.findFirst({ where: { id: itemId } });
  if (!item) return { synced: false, reason: "item-not-found" };
  const productId = item.accountProductId;
  if (!productId) return { synced: false, reason: "unlinked" };

  const accSystemId = await accountSystemId(ctx.tenantId);
  if (!accSystemId) return { synced: false, reason: "no-account-system" };
  const accCtx: AccCtx = { tenantId: ctx.tenantId, systemId: accSystemId };
  const db = tenantDb(accCtx);

  const product = await db.accountProduct.findFirst({ where: { id: productId } });
  if (!product) return { synced: false, reason: "product-not-found" };
  // ผูกกับ item อื่นอยู่ = ลิงก์ขัดกันเอง — ห้ามเขียนทับเงียบ ๆ ให้คนมาเคลียร์
  if (product.invItemId && product.invItemId !== item.id) return { synced: false, reason: "linked-elsewhere" };

  const unitId = await unitIdForLabel(accCtx, item.unitLabel);
  const data: Record<string, unknown> = {};
  if (product.invItemId !== item.id) data.invItemId = item.id; // เยียวยาลิงก์ครึ่งใบ
  if (product.name !== item.name) data.name = item.name;
  if (unitId && product.unitId !== unitId) data.unitId = unitId;
  if (product.buyPrice !== item.costSatang) data.buyPrice = item.costSatang;
  if (Number(product.qtyOnHand) !== item.onHand) data.qtyOnHand = item.onHand; // กระจกอ่านอย่างเดียว
  const skuChanged = item.sku && product.sku !== item.sku;
  if (skuChanged) data.sku = item.sku;

  if (Object.keys(data).length === 0) return { synced: true }; // ตรงกันอยู่แล้ว (เรียกซ้ำ = no-op)
  try {
    await db.accountProduct.updateMany({ where: { id: product.id }, data });
  } catch {
    // sku ชนกับสินค้าบัญชีตัวอื่น (unique [systemId,sku]) → ยอมทิ้ง sku แล้ว sync ที่เหลือ
    if (!skuChanged) return { synced: false, reason: "write-failed" };
    delete data.sku;
    if (Object.keys(data).length === 0) return { synced: false, reason: "sku-conflict" };
    try {
      await db.accountProduct.updateMany({ where: { id: product.id }, data });
    } catch {
      return { synced: false, reason: "write-failed" };
    }
    return { synced: true, reason: "sku-conflict" };
  }
  return { synced: true };
}

// ─────────────────── sync บัญชี → คลัง (ชื่อ/sku/หน่วย เท่านั้น) ───────────────────

/**
 * แก้สินค้าบัญชี → ดันเฉพาะ **ชื่อ · sku · หน่วย** ไปที่ item กลาง
 * (ห้ามดัน ราคาขาย/VAT/ผังบัญชี — เป็นฟิลด์บัญชีล้วน · ห้ามดันต้นทุน — คลังเป็นต้นฉบับ)
 * ไม่ throw · ไม่ผูก item = no-op
 */
export async function syncProductToItem(ctx: AccCtx, productId: string): Promise<SyncResult> {
  const product = await tenantDb(ctx).accountProduct.findFirst({ where: { id: productId } });
  if (!product) return { synced: false, reason: "product-not-found" };
  if (!product.invItemId) return { synced: false, reason: "unlinked" };

  const invSystemId = await inventorySystemId(ctx.tenantId);
  if (!invSystemId) return { synced: false, reason: "no-inventory-system" };
  const invDb = tenantDb({ tenantId: ctx.tenantId, systemId: invSystemId });
  const item = await invDb.invItem.findFirst({ where: { id: product.invItemId } });
  if (!item) return { synced: false, reason: "item-not-found" };

  const label = await unitLabelOf(ctx, product.unitId);
  const data: Record<string, unknown> = {};
  if (item.accountProductId !== product.id) data.accountProductId = product.id; // เยียวยาลิงก์ครึ่งใบ
  if (product.name && item.name !== product.name) data.name = product.name;
  if (label && item.unitLabel !== label) data.unitLabel = label;
  const skuChanged = Boolean(product.sku) && item.sku !== product.sku;
  if (skuChanged) data.sku = product.sku;

  if (Object.keys(data).length === 0) return { synced: true };
  try {
    await invDb.invItem.updateMany({ where: { id: item.id }, data });
  } catch {
    if (!skuChanged) return { synced: false, reason: "write-failed" };
    delete data.sku; // sku ชนใน @@unique([systemId,sku]) ของคลัง → คงของเดิม
    if (Object.keys(data).length === 0) return { synced: false, reason: "sku-conflict" };
    try {
      await invDb.invItem.updateMany({ where: { id: item.id }, data });
    } catch {
      return { synced: false, reason: "write-failed" };
    }
    return { synced: true, reason: "sku-conflict" };
  }
  return { synced: true };
}

// ─────────────────── ผูก / เลิกผูก ───────────────────

export type LinkOptions =
  /** ผูกกับ item ที่มีอยู่แล้วในคลัง */
  | { itemId: string }
  /** สร้าง item ใหม่ในคลังจากข้อมูลสินค้าบัญชีตัวนี้ (ติ๊ก "ติดตามสต็อก" ในหน้าสินค้า §8.2) */
  | { createItem: { warehouseId?: string | null; reorderPoint?: number | null; sku?: string | null } };

export type LinkResult = { ok: true; itemId: string } | { ok: false; reason: string };

/**
 * ผูกสินค้าบัญชี ↔ สินค้าในคลัง (ตั้งทั้ง `AccountProduct.invItemId` และ `InvItem.accountProductId`)
 * — เรียกซ้ำด้วยคู่เดิม = ไม่เปลี่ยนอะไร (idempotent)
 * — item ของ tenant/ระบบอื่น = หาไม่เจอ ⇒ ปฏิเสธ (ทุก query ผ่าน tenantDb ที่ผูก scope แล้ว)
 * — คืนเหตุผลภาษาไทยสำหรับโชว์ผู้ใช้ (ห้าม throw ให้หน้าเว็บ 500)
 */
export async function linkProductToItem(ctx: AccCtx, productId: string, opts: LinkOptions): Promise<LinkResult> {
  const db = tenantDb(ctx);
  const product = await db.accountProduct.findFirst({ where: { id: productId } });
  if (!product) return { ok: false, reason: "ไม่พบสินค้า/บริการนี้" };
  if (product.type !== "GOODS") return { ok: false, reason: "บริการไม่ต้องติดตามสต็อก — ใช้ได้เฉพาะสินค้า" };

  const invSystemId = await inventorySystemId(ctx.tenantId);
  if (!invSystemId) return { ok: false, reason: "กิจการนี้ยังไม่ได้เปิดระบบคลังสินค้า — เปิดระบบคลังก่อนจึงจะติดตามสต็อกได้" };
  const invCtx: InvCtx = { tenantId: ctx.tenantId, systemId: invSystemId };
  const invDb = tenantDb(invCtx);

  let itemId: string;
  if ("itemId" in opts) {
    const item = await invDb.invItem.findFirst({ where: { id: opts.itemId.trim() } });
    if (!item) return { ok: false, reason: "ไม่พบสินค้านี้ในคลังสินค้า" };
    if (item.kind === "SERVICE") return { ok: false, reason: `"${item.name}" ในคลังเป็นบริการ — ไม่มีสต็อกให้ติดตาม` };
    if (item.accountProductId && item.accountProductId !== product.id)
      return { ok: false, reason: "สินค้าในคลังรายการนี้ถูกผูกกับสินค้าบัญชีอื่นไว้แล้ว" };
    if (product.invItemId && product.invItemId !== item.id)
      return { ok: false, reason: "สินค้านี้ผูกกับคลังรายการอื่นอยู่ — เลิกผูกของเดิมก่อน" };
    itemId = item.id;
  } else {
    if (product.invItemId) return { ok: false, reason: "สินค้านี้ผูกกับคลังอยู่แล้ว" };
    const warehouseId = opts.createItem.warehouseId?.trim() || null;
    if (warehouseId) {
      const loc = await invDb.invLocation.findFirst({ where: { id: warehouseId }, select: { id: true } });
      if (!loc) return { ok: false, reason: "ไม่พบคลังที่เลือก" };
    }
    const label = await unitLabelOf(ctx, product.unitId);
    const sku = (opts.createItem.sku ?? product.sku ?? "").trim() || (await inventory.nextSku(invCtx));
    try {
      const created = await inventory.createItem(invCtx, {
        sku,
        name: product.name,
        unitLabel: label,
        kind: "PRODUCT",
        costSatang: product.buyPrice ?? 0,
        priceSatang: product.salePrice ?? 0,
        reorderPoint: opts.createItem.reorderPoint ?? 0,
      });
      itemId = created.id;
    } catch {
      return { ok: false, reason: `สร้างสินค้าในคลังไม่สำเร็จ — รหัส (SKU) "${sku}" อาจซ้ำกับของที่มีอยู่ในคลัง` };
    }
  }

  // ขาไปก่อน (บัญชี) แล้วค่อยขากลับ (คลัง) — ถ้าขากลับล้ม ถอนขาไปคืนเพื่อไม่ให้เหลือลิงก์ครึ่งใบ
  const warehouseId = "createItem" in opts ? opts.createItem.warehouseId?.trim() || null : product.warehouseId;
  await db.accountProduct.updateMany({ where: { id: product.id }, data: { invItemId: itemId, warehouseId } });
  try {
    await inventory.linkAccountProduct(invCtx, itemId, product.id);
  } catch {
    await db.accountProduct.updateMany({ where: { id: product.id }, data: { invItemId: null } });
    return { ok: false, reason: "ผูกกับคลังสินค้าไม่สำเร็จ กรุณาลองใหม่" };
  }
  // คลังเป็นต้นฉบับของ sku/หน่วย/ต้นทุน/สต็อก → ดันลงมาให้สินค้าบัญชีตรงกันทันที
  await syncItemToAccountProduct(invCtx, itemId);
  return { ok: true, itemId };
}

/**
 * เลิกผูก — เคลียร์ทั้งสองฝั่ง แล้ว "แช่แข็ง" สต็อกล่าสุดของคลังไว้ใน `qtyOnHand`
 * เพื่อให้สินค้ากลับไปใช้สต็อกของตัวเองต่อได้อย่างต่อเนื่อง (พฤติกรรมเดิมก่อนผูก)
 */
export async function unlinkProductFromItem(
  ctx: AccCtx,
  productId: string,
): Promise<{ ok: true; changed: boolean } | { ok: false; reason: string }> {
  const db = tenantDb(ctx);
  const product = await db.accountProduct.findFirst({ where: { id: productId } });
  if (!product) return { ok: false, reason: "ไม่พบสินค้า/บริการนี้" };
  if (!product.invItemId) return { ok: true, changed: false };

  const invSystemId = await inventorySystemId(ctx.tenantId);
  let frozen = Number(product.qtyOnHand);
  if (invSystemId) {
    const invDb = tenantDb({ tenantId: ctx.tenantId, systemId: invSystemId });
    const item = await invDb.invItem.findFirst({ where: { id: product.invItemId } });
    if (item) {
      frozen = item.onHand;
      if (item.accountProductId === product.id) {
        await invDb.invItem.updateMany({ where: { id: item.id }, data: { accountProductId: null } });
      }
    }
  }
  await db.accountProduct.updateMany({
    where: { id: product.id },
    data: { invItemId: null, warehouseId: null, qtyOnHand: frozen },
  });
  return { ok: true, changed: true };
}

// ─────────────────── อ่านสต็อก (ทางเดียวที่โมดูลบัญชีอ่านสต็อกได้) ───────────────────

export type ProductStockRow = { id: string; invItemId: string | null; qtyOnHand: unknown };

const EMPTY_ON_HAND: ReadonlyMap<string, number> = new Map<string, number>();

/**
 * สต็อกจริงต่อสินค้า — ผูกคลัง = `InvItem.onHand` · ไม่ผูก = `AccountProduct.qtyOnHand` (พฤติกรรมเดิม)
 * item หาย/ระบบคลังหาย → ถอยไปใช้กระจก `qtyOnHand` (degrade §F.15 ไม่ระเบิดหน้าจอ)
 */
export async function productStockMap(ctx: AccCtx, products: ProductStockRow[]): Promise<Map<string, number>> {
  const linked = products.filter((p) => p.invItemId);
  // ไม่มีตัวไหนผูกคลัง / ยังไม่เปิดระบบคลัง → ใช้กระจก qtyOnHand ล้วน (degrade §F.15 · ไม่ยิง DB เพิ่ม)
  if (linked.length === 0) return productStockMapFrom(products, EMPTY_ON_HAND);

  const invSystemId = await inventorySystemId(ctx.tenantId);
  if (!invSystemId) return productStockMapFrom(products, EMPTY_ON_HAND);
  const items = await tenantDb({ tenantId: ctx.tenantId, systemId: invSystemId }).invItem.findMany({
    where: { id: { in: linked.map((p) => p.invItemId as string) } },
    select: { id: true, onHand: true },
  });
  return productStockMapFrom(products, new Map(items.map((i) => [i.id, i.onHand])));
}

/**
 * ส่วน "คำนวณล้วน" ของ `productStockMap` — ใช้เมื่อผู้เรียกอ่าน `InvItem.onHand` มาแล้วจากคิวรีของตัวเอง
 * (WO 9.3 · การ์ดสินค้าที่ติดตาม ต้องอ่าน `reorderPoint` จากแถวเดียวกันอยู่แล้ว ⇒ ไม่ต้องอ่าน InvItem ซ้ำ)
 * 🔴 สูตรต้องเป็นอันเดียวกับทางปกติเสมอ — ห้าม copy ตรรกะ "ผูกแล้วใช้ onHand" ไปเขียนใหม่ที่อื่น
 */
export function productStockMapFrom(
  products: ProductStockRow[],
  onHandById: ReadonlyMap<string, number>,
): Map<string, number> {
  const out = new Map<string, number>();
  for (const p of products) out.set(p.id, Number(p.qtyOnHand ?? 0));
  for (const p of products) {
    if (!p.invItemId) continue;
    const oh = onHandById.get(p.invItemId);
    if (oh !== undefined) out.set(p.id, oh);
  }
  return out;
}

/** สต็อกจริงของสินค้าเดียว (สะดวกสำหรับหน้าเดี่ยว/ข้อสอบ) */
export async function productStock(ctx: AccCtx, product: ProductStockRow): Promise<number> {
  return (await productStockMap(ctx, [product])).get(product.id) ?? 0;
}
