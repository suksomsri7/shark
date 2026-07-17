// POS หน้าขาย (register/cashier) — reads + resolve เท่านั้น · ห้ามแตะ createSale engine
// รวม logic ปลอดภัยของหน้าขาย: หา unit ที่ผูก POS · resolve ระบบแต้ม/คูปอง/คลัง/สมาชิก ที่ผูก unit เดียวกัน
//   + catalog สินค้าจากคลัง (ราคาขายจาก AccountProduct ถ้าเชื่อม ไม่งั้น fallback ต้นทุน)
// ทุกอย่าง tenant-scoped ผ่าน filter tenantId ตรง ๆ (กันข้ามร้าน)

import { prisma } from "@/lib/core/db";
import { systemForUnit } from "@/lib/modules/system/service";
import * as inventory from "@/lib/modules/inventory/service";

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
