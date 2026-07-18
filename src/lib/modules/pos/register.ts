// POS หน้าขาย (register/cashier) — reads + resolve เท่านั้น · ห้ามแตะ createSale engine
// รวม logic ปลอดภัยของหน้าขาย: หา unit ที่ผูก POS · resolve ระบบแต้ม/คูปอง/คลัง/สมาชิก ที่ผูก unit เดียวกัน
//   + catalog สินค้าจากคลัง (ราคาขายจาก AccountProduct ถ้าเชื่อม ไม่งั้น fallback ต้นทุน)
// ทุกอย่าง tenant-scoped ผ่าน filter tenantId ตรง ๆ (กันข้ามร้าน)

import { prisma } from "@/lib/core/db";
import { systemForUnit } from "@/lib/modules/system/service";
import * as inventory from "@/lib/modules/inventory/service";
import * as account from "@/lib/modules/account";

export type PosUnit = { id: string; name: string };
export type PosCatalogItem = {
  id: string;
  name: string;
  unitLabel: string;
  priceSatang: number;
  sku: string;
  barcode: string | null;
};
export type PosMember = { id: string; name: string | null; memberCode: string; phone: string | null };
export type PosLinks = {
  pointSystemId: string | null;
  couponSystemId: string | null;
  inventorySystemId: string | null;
  memberSystemId: string | null;
};

// unit ทั้งหมดที่ผูกกับระบบ POS นี้ (type=POS) — เรียงเก่าสุดก่อน
export async function posUnits(tenantId: string, posSystemId: string): Promise<PosUnit[]> {
  const links = await prisma.appSystemUnit.findMany({
    where: { tenantId, systemId: posSystemId, type: "POS" },
    select: { unitId: true },
  });
  if (links.length === 0) return [];
  const units = await prisma.businessUnit.findMany({
    where: { tenantId, id: { in: links.map((l) => l.unitId) }, status: { not: "ARCHIVED" } },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true },
  });
  return units;
}

// ตรวจว่า unit นี้ผูกกับ POS นี้จริง (กันยิง unitId ข้ามร้าน/ข้ามระบบ) → true/false
export async function posUnitIsLinked(tenantId: string, posSystemId: string, unitId: string): Promise<boolean> {
  const link = await prisma.appSystemUnit.findUnique({
    where: { tenantId_unitId_type: { tenantId, unitId, type: "POS" } },
    select: { systemId: true },
  });
  return !!link && link.systemId === posSystemId;
}

// resolve ระบบที่ผูก unit เดียวกัน (แต้ม/คูปอง/คลัง/สมาชิก) — null = ไม่มี
export async function resolvePosLinks(tenantId: string, unitId: string): Promise<PosLinks> {
  const [pointSystemId, couponSystemId, inventorySystemId, memberSystemId] = await Promise.all([
    systemForUnit(tenantId, unitId, "POINT"),
    systemForUnit(tenantId, unitId, "COUPON"),
    systemForUnit(tenantId, unitId, "INVENTORY"),
    systemForUnit(tenantId, unitId, "MEMBER"),
  ]);
  return { pointSystemId, couponSystemId, inventorySystemId, memberSystemId };
}

// catalog สินค้าจากคลังที่ผูก unit — ราคาขายจาก AccountProduct.salePrice (ถ้าเชื่อม) ไม่งั้น fallback ต้นทุนถัวเฉลี่ย
// (InvItem ไม่มีช่องราคาขายของตัวเอง — พนักงานแก้ราคาในตะกร้าได้เสมอ)
export async function posCatalog(tenantId: string, inventorySystemId: string): Promise<PosCatalogItem[]> {
  const items = await inventory.listItems({ tenantId, systemId: inventorySystemId });
  const acctIds = items.map((i) => i.accountProductId).filter((x): x is string => !!x);
  const products = acctIds.length
    ? await prisma.accountProduct.findMany({
        where: { tenantId, id: { in: acctIds } },
        select: { id: true, salePrice: true },
      })
    : [];
  const priceById = new Map(products.map((p) => [p.id, p.salePrice]));
  return items.map((i) => {
    const sale = i.accountProductId ? priceById.get(i.accountProductId) : null;
    const priceSatang = sale && sale > 0 ? sale : Math.max(0, i.costSatang);
    return { id: i.id, name: i.name, unitLabel: i.unitLabel, priceSatang, sku: i.sku, barcode: i.barcode };
  });
}

// ═══════════ หน้า "สินค้า/ราคา" ของ POS (WO ส่วน B) ═══════════
// ตั้งราคาขายต่อสินค้าในคลังที่ผูก POS · ราคาขายเก็บที่ AccountProduct.salePrice (master data)
//   - resolve inventorySystemId จาก unit แรกที่ผูกคลัง (POS หน้าเดียวต่อระบบ)
//   - resolve accountSystemId ผ่าน facade (AccountSystemLink POS↔บัญชี) — ไม่มี = ตั้งราคาสินค้า "ใหม่" ไม่ได้
//     (แก้ราคาสินค้าที่ผูก AccountProduct ไว้แล้วยังทำได้ เพราะรู้ productId ตรง)

export type PosProductRow = {
  id: string; // InvItem.id
  name: string;
  unitLabel: string;
  sku: string;
  costSatang: number;
  salePriceSatang: number | null; // null = ยังไม่ตั้งราคาขาย (POS จะ fallback ต้นทุน)
  linked: boolean; // ผูก AccountProduct แล้วหรือยัง
};
export type PosProductsResult = {
  inventorySystemId: string | null; // null = POS ยังไม่ผูกคลัง (ไม่มีสินค้าให้ตั้งราคา)
  accountSystemId: string | null; // null = ยังไม่เชื่อมระบบบัญชี (ตั้งราคาสินค้าใหม่ไม่ได้)
  items: PosProductRow[];
};

// resolve ระบบคลังที่ผูก POS นี้ (ผ่าน unit แรกที่มีคลัง) — null = ไม่มี
async function inventorySystemForPos(tenantId: string, posSystemId: string): Promise<string | null> {
  const units = await posUnits(tenantId, posSystemId);
  for (const u of units) {
    const links = await resolvePosLinks(tenantId, u.id);
    if (links.inventorySystemId) return links.inventorySystemId;
  }
  return null;
}

// รายการสินค้าที่ POS ขาย (จากคลัง) + ราคาขายปัจจุบัน (จาก AccountProduct.salePrice ถ้ามี)
export async function listPosProducts(tenantId: string, posSystemId: string): Promise<PosProductsResult> {
  const [inventorySystemId, accountSystemId] = await Promise.all([
    inventorySystemForPos(tenantId, posSystemId),
    account.posAccountSystemId(tenantId, posSystemId),
  ]);
  if (!inventorySystemId) return { inventorySystemId: null, accountSystemId, items: [] };

  const items = await inventory.listItems({ tenantId, systemId: inventorySystemId });
  const acctIds = items.map((i) => i.accountProductId).filter((x): x is string => !!x);
  const products = acctIds.length
    ? await prisma.accountProduct.findMany({
        where: { tenantId, id: { in: acctIds } },
        select: { id: true, salePrice: true },
      })
    : [];
  const priceById = new Map(products.map((p) => [p.id, p.salePrice]));
  const rows: PosProductRow[] = items.map((i) => ({
    id: i.id,
    name: i.name,
    unitLabel: i.unitLabel,
    sku: i.sku,
    costSatang: Math.max(0, i.costSatang),
    salePriceSatang: i.accountProductId ? priceById.get(i.accountProductId) ?? null : null,
    linked: !!i.accountProductId,
  }));
  return { inventorySystemId, accountSystemId, items: rows };
}

export type SetSalePriceResult = { ok: true; productId: string } | { ok: false; reason: string };

// ตั้งราคาขายของสินค้า item หนึ่ง:
//   - item ผูก AccountProduct แล้ว → update salePrice (ผ่าน facade บัญชี)
//   - ยังไม่ผูก → ต้องมีระบบบัญชี → สร้าง AccountProduct (ชื่อ=item.name) + set ราคา + ผูก InvItem.accountProductId
// find→update/create เท่านั้น (ไม่ upsert) · ราคาขายไม่กระทบ ledger (master data)
export async function setItemSalePrice(
  tenantId: string,
  posSystemId: string,
  itemId: string,
  salePriceSatang: number,
): Promise<SetSalePriceResult> {
  if (!Number.isFinite(salePriceSatang) || salePriceSatang < 0) {
    return { ok: false, reason: "ราคาขายต้องเป็นตัวเลขไม่ติดลบ" };
  }
  const price = Math.round(salePriceSatang);

  const inventorySystemId = await inventorySystemForPos(tenantId, posSystemId);
  if (!inventorySystemId) return { ok: false, reason: "ยังไม่ได้เชื่อมคลังสินค้ากับระบบขายนี้" };

  const invCtx = { tenantId, systemId: inventorySystemId };
  const item = await inventory.getItem(invCtx, itemId); // scope tenant+system → กัน itemId ข้ามร้าน/ข้ามระบบ
  if (!item) return { ok: false, reason: "ไม่พบสินค้าในคลัง" };

  // มี AccountProduct อยู่แล้ว → แค่แก้ราคา (รู้ productId ตรง ไม่ต้องมีระบบบัญชีผูก POS)
  if (item.accountProductId) {
    const ok = await account.updateAccountProductSalePrice(tenantId, item.accountProductId, price);
    if (!ok) return { ok: false, reason: "อัปเดตราคาไม่สำเร็จ" };
    return { ok: true, productId: item.accountProductId };
  }

  // ยังไม่ผูก → ต้องมีระบบบัญชีเพื่อเก็บราคา (AccountProduct.systemId บังคับ)
  const accountSystemId = await account.posAccountSystemId(tenantId, posSystemId);
  if (!accountSystemId) {
    return { ok: false, reason: "ตั้งราคาขายต้องเปิด/เชื่อมระบบบัญชีกับระบบขายนี้ก่อน" };
  }
  const productId = await account.createAccountProductWithSalePrice(tenantId, accountSystemId, {
    name: item.name,
    salePriceSatang: price,
  });
  await inventory.linkAccountProduct(invCtx, itemId, productId);
  return { ok: true, productId };
}

// สมาชิกในระบบสมาชิกที่ผูก unit (สำหรับ dropdown แนบบิลเพื่อสะสมแต้ม) — เว้น null = ไม่มีระบบสมาชิก
export async function posMembers(tenantId: string, memberSystemId: string): Promise<PosMember[]> {
  const rows = await prisma.customer.findMany({
    where: { tenantId, memberSystemId },
    orderBy: { createdAt: "desc" },
    take: 200,
    select: { id: true, name: true, memberCode: true, phone: true },
  });
  return rows.map((c) => ({ ...c, memberCode: c.memberCode ?? "" }));
}
