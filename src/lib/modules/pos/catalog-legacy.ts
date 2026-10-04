// catalog-legacy.ts — ผู้เขียนคนที่สองของแคตตาล็อก (WO P1.1b ส่วน A · ซิงก์สองทาง "dual-write" ขาเดิม → แคตตาล็อก)
//
// สัญญา: ledger/pos-briefs/pos-brief-P1.1b.md G1–G13 + Addendum + Addendum 2 (มติ 1–14)
//   • G1: ไฟล์เขียนแคตตาล็อกมีสองไฟล์ = `catalog.ts` + ไฟล์นี้ (F15.1 CATALOG_WRITERS) — คำสั่งเขียนตารางเดิม (MenuItem/หมวด/กลุ่มตัวเลือก/
//     ShopProduct/ราคา AccountProduct/InvItem) ย้ายมาที่นี่ "ทั้งคำสั่ง" (ข้อมูลเดิมทุกตัวอักษร) แล้วเขียนฝั่ง PosProduct ใน tx เดียวกัน
//   • G2: ประตูเดิม (restaurant/menu · order · shop/service · inventory/service · account/product · inventory-link · pos/register) ยังเป็นประตูสาธารณะ
//     — ตรวจสิทธิ์/ข้อความ/รูปผลลัพธ์อยู่ที่ประตูเดิม · ไฟล์นี้รับ tx ที่ผู้เรียกเปิดแล้วเท่านั้น (ทุก export · มติ 8: ตัวแปลงบริสุทธิ์อยู่ catalog.ts)
//   • G4a: ผู้เรียกระดับระบบ — ประตูเดิมอนุญาตผู้กระทำตามกติกาโมดูลของตัวเองแล้ว ⇒ ฝั่งแคตตาล็อกใช้ตัวบ่งชี้ระบบ (ไฟล์นี้อยู่ใน
//     SYSTEM_MARKER_ALLOWLIST) · F15.5 ห้าม import ไฟล์นี้จาก src/app · src/lib/actions · ไฟล์ "use server"
//   • G4c: ไม่ปิงปอง — ไม่ import ประตูเดิม · ประตูหนึ่งเขียนแต่ละฝั่งครั้งเดียว · ไม่มี outbox/after-commit
//   • G5: ราคาที่แถวแคตตาล็อกได้ = ลำดับ C7 ของแหล่งเดิมของแถวนั้น — ประตูที่ไม่ใช่แหล่งราคาของแถว (เว็บร้านบนแถวร่วม · InvItem.priceSatang
//     ของสินค้า) เขียนช่องตัวเองแต่ไม่แตะราคาแถว
//   • G7 ลำดับล็อก (ทั้งสองทิศ): ล็อกร้านแบบมีงบ (เฉพาะสร้างลิงก์ InvItem ใหม่) → PosProduct (FOR NO KEY UPDATE · เรียง id) → ตารางเดิม
//     ข้อยกเว้นที่ตั้งใจ: ประตู "สร้างแถวเดิมใหม่" INSERT แถวเดิมก่อนแล้วจึงล็อกร้าน/สร้าง PosProduct (แถวใหม่ยังไม่มีใครเห็น — ล็อกไม่ได้)
//   • G8: คำสั่งสต็อก/86 ของออเดอร์ย้ายมา "ไม่เปลี่ยน" (consumeMenuStock · markMenuItemOutOfStock · restoreMenuStock) — ไม่เพิ่มคำสั่ง
//     ตัวนับสด stockQty/isOutOfStock ไม่ mirror (ผู้อ่านอ่าน MenuItem — catalog.menuSoldOutIds) · dailyStockQty (ค่าตั้ง) mirror
//   • G11: error ใด ๆ ในนี้ = tx ของผู้เรียกจบ (throw ออกไป) — ห้ามจับแล้วเขียนต่อ
//   • แถวเดิมที่ยังไม่มีลิงก์ (ยังไม่ backfill) = ประตู "แก้" ไม่สร้างแถวแคตตาล็อก (backfill สร้างจากค่าล่าสุดเอง ⇒ G3 แฝดเท่ากัน) ·
//     ประตู "สร้าง" สร้างแถวด้วยตัวแปลงเดียวกับ backfill
//   • ทุกคำสั่งกรอง tenantId (+ unitId/systemId ตามขอบเขตของประตูเดิม — แทน tenantDb ซึ่งใช้กับ tx ดิบไม่ได้)
import { randomUUID } from "node:crypto";
import type { MenuItem, PosProduct, Prisma, ShopProduct } from "@prisma/client";
import * as C from "./catalog";
import { CATALOG_SYSTEM_ACTOR } from "./catalog";

type Tx = Prisma.TransactionClient;
type UnitScope = { tenantId: string; unitId: string };
type SysScope = { tenantId: string; systemId: string };

const sysCtx = (tenantId: string, systemId: string): C.CatalogCtx => ({ tenantId, systemId, actorUserId: CATALOG_SYSTEM_ACTOR });

const INV_LITE = { id: true, systemId: true, name: true, kind: true, priceSatang: true, costSatang: true, archivedAt: true, onHand: true, accountProductId: true, sortOrder: true } as const;

// ═══════════════════ ตัวช่วยภายใน ═══════════════════

/** G7: ล็อกแถว PosProduct (เรียง id · คำสั่งเดียว) แล้วอ่านค่าปัจจุบัน — ก่อนเขียนตารางเดิม */
async function lockRows(tx: Tx, tenantId: string, ids: (string | null | undefined)[]): Promise<PosProduct[]> {
  const want = [...new Set(ids.filter((x): x is string => typeof x === "string" && !!x))].sort();
  if (!want.length) return [];
  await tx.$queryRaw`SELECT id FROM "PosProduct" WHERE id = ANY(${want}::text[]) AND "tenantId" = ${tenantId} ORDER BY id FOR NO KEY UPDATE`;
  return tx.posProduct.findMany({ where: { tenantId, id: { in: want } }, orderBy: { id: "asc" } });
}

async function auditSys(tx: Tx, tenantId: string, action: string, targetType: "PosProduct" | "PosCategory", targetId: string, before: unknown, after: unknown): Promise<void> {
  await tx.auditLog.create({
    data: {
      tenantId,
      actorType: "SYSTEM",
      actorId: null,
      action,
      targetType,
      targetId,
      before: before === null ? undefined : (before as Prisma.InputJsonValue),
      after: after === null ? undefined : (after as Prisma.InputJsonValue),
      createdAt: new Date(),
    },
  });
}

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** เขียนเฉพาะช่องที่ต่างจากค่าปัจจุบัน — คำสั่งเดียว (G4c) · ไม่ต่าง = ไม่เขียน (บันทึกซ้ำไม่ขยับ updatedAt) · audit `pos.product.sync` */
async function applySync(tx: Tx, row: PosProduct, want: Record<string, unknown>): Promise<void> {
  const data: Record<string, unknown> = {};
  const before: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(want)) {
    const cur = (row as unknown as Record<string, unknown>)[k];
    if (!same(cur, v)) {
      data[k] = v;
      before[k] = cur;
    }
  }
  if (!Object.keys(data).length) return;
  await tx.posProduct.updateMany({ where: { id: row.id, tenantId: row.tenantId }, data: data as Prisma.PosProductUncheckedUpdateManyInput });
  await auditSys(tx, row.tenantId, "pos.product.sync", "PosProduct", row.id, before, data);
}

/** ระบบ POS ที่ขายเมนูของสาขานี้ (ทางเดียวกับ backfill — C.resolvePosSystem) */
async function posOfUnit(tx: Tx, tenantId: string, unitId: string): Promise<string | null> {
  return C.resolvePosSystem(await C.loadPosResolution(tenantId, tx), { kind: "menuItem", unitId }).systemId;
}

/** PosCategory ของหมวดเมนู (กุญแจ ระบบ+สาขา+ชื่อ แบบ backfill) — ไม่มี = สร้างด้วยตัวแปลงเดียวกับ backfill */
async function categoryFor(tx: Tx, tenantId: string, systemId: string, menuCategoryId: string): Promise<string | null> {
  const mc = await tx.menuCategory.findFirst({ where: { id: menuCategoryId, tenantId } });
  if (!mc) return null;
  const hit = await tx.posCategory.findFirst({ where: { tenantId, systemId, unitId: mc.unitId, name: mc.name }, select: { id: true } });
  if (hit) return hit.id;
  const row = await tx.posCategory.create({ data: { tenantId, systemId, ...C.menuCategoryFields(mc) } });
  await auditSys(tx, tenantId, "pos.category.create", "PosCategory", row.id, null, { name: row.name, unitId: row.unitId, source: "menuCategory" });
  return row.id;
}

/** ช่องที่เมนูเป็นเจ้าของ (ไม่รวม: ตัวนับสด stockQty/isOutOfStock · archivedAt (ประตูเก็บถาวรของตัวเอง) · trackStock · unitId) */
async function syncMenuRow(tx: Tx, row: PosProduct, item: MenuItem): Promise<void> {
  const catId = await categoryFor(tx, row.tenantId, row.systemId, item.categoryId);
  const d = C.menuItemProductFields(item, catId).data;
  await applySync(tx, row, {
    name: d.name, nameEn: d.nameEn, categoryId: d.categoryId, basePriceSatang: d.basePriceSatang, images: d.images,
    sortOrder: d.sortOrder, stationId: d.stationId, dailyStockQty: d.dailyStockQty,
  });
}

/**
 * แถวที่ผูก InvItem — คิดใหม่ตามแหล่งเดิมของแต่ละแถว · `name`: ชื่อ InvItem (แถว InvItem) · `price`: ราคา C7 + VAT
 * (แถว InvItem และแถวเว็บร้านเองที่ผูก InvItem นั้น) — ประตูส่งธงตามช่องที่ตัวเองเปลี่ยน (G5)
 */
async function resyncRows(tx: Tx, rows: PosProduct[], what: { name?: boolean; price?: boolean }): Promise<void> {
  for (const row of rows) {
    const src = await C.legacySourceOf(row, tx);
    const want: Record<string, unknown> = {};
    if (src.type === "inv") {
      const d = C.invItemProductFields(src.inv, src.ap, src.book).data;
      if (what.name) want.name = d.name;
      if (what.price) Object.assign(want, { basePriceSatang: d.basePriceSatang, vatRateBp: d.vatRateBp });
    } else if (src.type === "shop" && what.price && src.shopIds.length) {
      const sp = await tx.shopProduct.findFirst({ where: { id: src.shopIds[0], tenantId: row.tenantId } });
      if (sp) {
        const d = C.shopProductFields(sp, src.inv, src.ap, src.book).data;
        Object.assign(want, { basePriceSatang: d.basePriceSatang, vatRateBp: d.vatRateBp });
      }
    }
    if (Object.keys(want).length) await applySync(tx, row, want);
  }
}

/** แถวแคตตาล็อกทุกแถวที่ผูก InvItem นี้ (แถว InvItem ทุกระบบ + แถวเว็บร้านเองที่ผูกมัน) */
async function rowIdsOfInvItem(tx: Tx, tenantId: string, invItemId: string): Promise<string[]> {
  return (await tx.posProduct.findMany({ where: { tenantId, invItemId }, select: { id: true } })).map((r) => r.id);
}
/** แถวแคตตาล็อกที่ราคามาจาก AccountProduct นี้ (ผ่าน InvItem.accountProductId — ทางเดียวกับ C7 strictAp) */
async function rowIdsOfAccountProduct(tx: Tx, tenantId: string, productId: string): Promise<string[]> {
  const rows = await tx.$queryRaw<{ id: string }[]>`SELECT p.id FROM "PosProduct" p JOIN "InvItem" i ON i.id = p."invItemId" AND i."tenantId" = ${tenantId}
    WHERE p."tenantId" = ${tenantId} AND i."accountProductId" = ${productId}`;
  return rows.map((r) => r.id);
}

async function activePos(tx: Tx, tenantId: string, systemIds: string[]): Promise<Set<string>> {
  if (!systemIds.length) return new Set();
  const rows = await tx.appSystem.findMany({ where: { tenantId, id: { in: [...new Set(systemIds)] }, type: "POS", active: true }, select: { id: true } });
  return new Set(rows.map((r) => r.id));
}

// ═══════════════════ เมนูร้านอาหาร (restaurant/menu.ts) ═══════════════════

/** สร้างเมนู + ผูกกลุ่มตัวเลือก (คำสั่งเดิม) → แถว MENU ใหม่ของ POS สาขา (ตัวแปลง G3 · หมวด · ตัวเลือก · สูตรถ้าผูก InvItem) */
export async function createMenuItem(
  tx: Tx,
  s: UnitScope,
  data: Omit<Prisma.MenuItemUncheckedCreateInput, "tenantId" | "unitId">,
  links: { groupId: string; sortOrder: number }[],
): Promise<MenuItem> {
  const item = await tx.menuItem.create({ data: { ...data, tenantId: s.tenantId, unitId: s.unitId } });
  for (const l of links) {
    await tx.menuItemOptionGroup.create({ data: { tenantId: s.tenantId, unitId: s.unitId, itemId: item.id, groupId: l.groupId, sortOrder: l.sortOrder } });
  }
  const sys = await posOfUnit(tx, s.tenantId, s.unitId);
  if (!sys) return item;
  const catId = await categoryFor(tx, s.tenantId, sys, item.categoryId);
  const id = randomUUID();
  const d = C.menuItemProductFields(item, catId).data;
  await tx.posProduct.create({ data: { id, tenantId: s.tenantId, systemId: sys, ...d } });
  if (links.length) await tx.posProductOptionGroup.createMany({ data: links.map((l) => ({ tenantId: s.tenantId, productId: id, groupId: l.groupId, sortOrder: l.sortOrder })) });
  if (item.invItemId && (await tx.invItem.findFirst({ where: { id: item.invItemId, tenantId: s.tenantId }, select: { id: true } })))
    await tx.recipeLine.create({ data: { tenantId: s.tenantId, productId: id, invItemId: item.invItemId, qty: 1 } });
  // คอลัมน์เชื่อม (เจ้าของ = ซิงก์) — ตั้งหลังสร้างแถว PosProduct ในธุรกรรมเดียว
  await tx.menuItem.updateMany({ where: { id: item.id, tenantId: s.tenantId }, data: { posProductId: id } });
  await auditSys(tx, s.tenantId, "pos.product.create", "PosProduct", id, null, { kind: "MENU", menuItemId: item.id, basePriceSatang: d.basePriceSatang, source: "menu.createItem" });
  return { ...item, posProductId: id };
}

/** แก้เมนู (คำสั่งเดิม · กรองร้าน+สาขา) → ช่องที่เมนูเป็นเจ้าของบนแถว MENU */
export async function updateMenuItem(tx: Tx, s: UnitScope, id: string, data: Prisma.MenuItemUncheckedUpdateInput): Promise<MenuItem> {
  const pre = await tx.menuItem.findFirst({ where: { id, tenantId: s.tenantId, unitId: s.unitId }, select: { posProductId: true } });
  const rows = await lockRows(tx, s.tenantId, [pre?.posProductId]);
  const item = await tx.menuItem.update({ where: { id, tenantId: s.tenantId, unitId: s.unitId }, data });
  for (const row of rows) if (row.kind === "MENU") await syncMenuRow(tx, row, item);
  return item;
}

/** ผูกกลุ่มตัวเลือกใหม่ทั้งชุด (คำสั่งเดิม) → PosProductOptionGroup ชุดเดียวกัน (groupId:sortOrder) */
export async function setMenuItemOptionGroups(tx: Tx, s: UnitScope, itemId: string, groupIds: string[]): Promise<void> {
  const pre = await tx.menuItem.findFirst({ where: { id: itemId, tenantId: s.tenantId, unitId: s.unitId }, select: { posProductId: true } });
  const rows = await lockRows(tx, s.tenantId, [pre?.posProductId]);
  await tx.menuItemOptionGroup.deleteMany({ where: { itemId, tenantId: s.tenantId, unitId: s.unitId } });
  for (let i = 0; i < groupIds.length; i++) {
    await tx.menuItemOptionGroup.create({ data: { tenantId: s.tenantId, unitId: s.unitId, itemId, groupId: groupIds[i]!, sortOrder: i } });
  }
  for (const row of rows) {
    const before = await tx.posProductOptionGroup.findMany({ where: { tenantId: s.tenantId, productId: row.id }, select: { groupId: true, sortOrder: true } });
    const want = groupIds.map((g, i) => ({ groupId: g, sortOrder: i }));
    const key = (xs: { groupId: string; sortOrder: number }[]) => xs.map((x) => `${x.groupId}:${x.sortOrder}`).sort().join(",");
    if (key(before) === key(want)) continue;
    await tx.posProductOptionGroup.deleteMany({ where: { tenantId: s.tenantId, productId: row.id } });
    if (want.length) await tx.posProductOptionGroup.createMany({ data: want.map((w) => ({ tenantId: s.tenantId, productId: row.id, ...w })), skipDuplicates: true });
    await auditSys(tx, s.tenantId, "pos.product.sync", "PosProduct", row.id, { optionGroups: key(before) }, { optionGroups: key(want) });
  }
}

/** เก็บเมนู (คำสั่งเดิม: ARCHIVED + archivedAt) → แถว MENU เก็บถาวรเวลาเดียวกัน (G6 · ไม่ผ่าน catalog.archive = ไม่เขียน MenuItem ซ้ำ — G4c) */
export async function archiveMenuItem(tx: Tx, s: UnitScope, id: string): Promise<void> {
  const pre = await tx.menuItem.findFirst({ where: { id, tenantId: s.tenantId, unitId: s.unitId }, select: { posProductId: true } });
  const rows = await lockRows(tx, s.tenantId, [pre?.posProductId]);
  const at = new Date();
  await tx.menuItem.update({ where: { id, tenantId: s.tenantId, unitId: s.unitId }, data: { status: "ARCHIVED", archivedAt: at } });
  for (const row of rows) {
    if (row.archivedAt) continue;
    const r = await tx.posProduct.updateMany({ where: { id: row.id, tenantId: s.tenantId, archivedAt: null }, data: { archivedAt: at } });
    if (r.count === 1) await auditSys(tx, s.tenantId, "pos.product.archive", "PosProduct", row.id, { archivedAt: null }, { archivedAt: at.toISOString(), source: "menu.archiveItem" });
  }
}

/** 86 / สต็อก / สต็อกรายวัน (คำสั่งเดิม) — G8: mirror เฉพาะ dailyStockQty (ค่าตั้ง) · ตัวนับสดไม่แตะ PosProduct */
export async function setMenuItemStock(
  tx: Tx,
  s: UnitScope,
  id: string,
  data: { isOutOfStock?: boolean; stockQty?: number | null; dailyStockQty?: number | null },
): Promise<MenuItem> {
  const mirror = data.dailyStockQty !== undefined;
  const pre = mirror ? await tx.menuItem.findFirst({ where: { id, tenantId: s.tenantId, unitId: s.unitId }, select: { posProductId: true } }) : null;
  const rows = await lockRows(tx, s.tenantId, [pre?.posProductId]);
  const item = await tx.menuItem.update({ where: { id, tenantId: s.tenantId, unitId: s.unitId }, data });
  for (const row of rows) if (row.kind === "MENU") await applySync(tx, row, { dailyStockQty: item.dailyStockQty });
  return item;
}

/** reset สต็อกรายวัน 1 เมนู (คำสั่งเดิม — ตัวนับสด ไม่ mirror) */
export async function resetMenuItemDailyStock(tx: Tx, s: UnitScope, it: { id: string; dailyStockQty: number | null }): Promise<void> {
  await tx.menuItem.update({ where: { id: it.id, tenantId: s.tenantId, unitId: s.unitId }, data: { stockQty: it.dailyStockQty, isOutOfStock: false } });
}

/** หมวดเมนูใหม่ (คำสั่งเดิม) → PosCategory ของ POS สาขา (ตัวแปลงเดียวกับ backfill) */
export async function createMenuCategory(
  tx: Tx,
  s: UnitScope,
  data: { name: string; nameEn: string | null; availableFrom: string | null; availableTo: string | null },
): Promise<{ id: string }> {
  const cat = await tx.menuCategory.create({ data: { tenantId: s.tenantId, unitId: s.unitId, ...data } });
  const sys = await posOfUnit(tx, s.tenantId, s.unitId);
  if (sys) await categoryFor(tx, s.tenantId, sys, cat.id);
  return { id: cat.id };
}

/** เก็บหมวดเมนู (คำสั่งเดิม) → PosCategory คู่กัน (ระบบ+สาขา+ชื่อ) เก็บถาวร */
export async function archiveMenuCategory(tx: Tx, s: UnitScope, id: string): Promise<void> {
  const at = new Date();
  const cat = await tx.menuCategory.update({ where: { id, tenantId: s.tenantId, unitId: s.unitId }, data: { archivedAt: at } });
  const sys = await posOfUnit(tx, s.tenantId, s.unitId);
  if (!sys) return;
  const pc = await tx.posCategory.findFirst({ where: { tenantId: s.tenantId, systemId: sys, unitId: s.unitId, name: cat.name, archivedAt: null }, select: { id: true } });
  if (!pc) return;
  await tx.posCategory.updateMany({ where: { id: pc.id, tenantId: s.tenantId, archivedAt: null }, data: { archivedAt: at } });
  await auditSys(tx, s.tenantId, "pos.category.archive", "PosCategory", pc.id, { archivedAt: null }, { archivedAt: at.toISOString(), source: "menu.archiveCategory" });
}

/** กลุ่มตัวเลือก + ตัวเลือก (คำสั่งเดิม) — แคตตาล็อกอ่านกลุ่ม/ตัวเลือกสดผ่าน PosProductOptionGroup.groupId (ไม่มีสำเนา) */
export async function createMenuOptionGroup(
  tx: Tx,
  s: UnitScope,
  group: { name: string; nameEn: string | null; minSelect: number; maxSelect: number },
  choices: { name: string; priceDelta: number; isDefault: boolean }[],
): Promise<{ id: string }> {
  const g = await tx.menuOptionGroup.create({ data: { tenantId: s.tenantId, unitId: s.unitId, ...group } });
  let i = 0;
  for (const c of choices) {
    await tx.menuOptionChoice.create({ data: { tenantId: s.tenantId, unitId: s.unitId, groupId: g.id, name: c.name, priceDelta: c.priceDelta, isDefault: c.isDefault, sortOrder: i++ } });
  }
  return { id: g.id };
}

/** เก็บกลุ่มตัวเลือก + ถอดออกจากทุกเมนู (คำสั่งเดิม) → ถอดออกจากทุกแถวแคตตาล็อกด้วย (เท่ากับที่ backfill จะสร้าง) */
export async function archiveMenuOptionGroup(tx: Tx, s: UnitScope, id: string): Promise<void> {
  await tx.menuOptionGroup.update({ where: { id, tenantId: s.tenantId, unitId: s.unitId }, data: { archivedAt: new Date() } });
  await tx.menuItemOptionGroup.deleteMany({ where: { groupId: id, tenantId: s.tenantId, unitId: s.unitId } });
  await tx.posProductOptionGroup.deleteMany({ where: { tenantId: s.tenantId, groupId: id } });
}

/** 86 ตัวเลือก (คำสั่งเดิม — สถานะสด แคตตาล็อกอ่านจาก MenuOptionChoice ตรง) */
export async function setMenuChoiceStock(tx: Tx, s: UnitScope, choiceId: string, isOutOfStock: boolean): Promise<void> {
  await tx.menuOptionChoice.update({ where: { id: choiceId, tenantId: s.tenantId, unitId: s.unitId }, data: { isOutOfStock } });
}

// ═══════════════════ G8 · ทางร้อนสั่งอาหาร (restaurant/order.ts) — คำสั่งเดิม ไม่เปลี่ยน ไม่เพิ่ม ═══════════════════

/** หักสต็อกเมนูแบบมีเงื่อนไข (กัน oversell) — คำสั่งเดิม order.ts:168 */
export async function consumeMenuStock(tx: Tx, a: { itemId: string; tenantId: string; unitId: string; qty: number }): Promise<{ count: number }> {
  return tx.menuItem.updateMany({
    where: { id: a.itemId, tenantId: a.tenantId, unitId: a.unitId, stockQty: { gte: a.qty } },
    data: { stockQty: { decrement: a.qty } },
  });
}

/** 86 อัตโนมัติเมื่อหมด — คำสั่งเดิม order.ts:177 */
export async function markMenuItemOutOfStock(tx: Tx, itemId: string): Promise<void> {
  await tx.menuItem.update({ where: { id: itemId }, data: { isOutOfStock: true } });
}

/** คืนสต็อกเมื่อยกเลิกรายการที่ยังไม่เริ่มทำ — คำสั่งเดิม order.ts:280 */
export async function restoreMenuStock(tx: Tx, itemId: string, qty: number): Promise<void> {
  await tx.menuItem.update({ where: { id: itemId }, data: { stockQty: { increment: qty }, isOutOfStock: false } });
}

// ═══════════════════ เว็บร้าน (shop/service.ts) ═══════════════════

/** สินค้าเว็บใหม่ (คำสั่งเดิม) → POS แรกของร้าน: InvItem ที่ POS แรกขาย = แถวของ InvItem (สร้างถ้ายังไม่มี) · อื่น ๆ = แถวของตัวเอง (C9) */
export async function createShopProduct(tx: Tx, data: Prisma.ShopProductUncheckedCreateInput): Promise<ShopProduct> {
  const sp = await tx.shopProduct.create({ data });
  const t = sp.tenantId;
  const res = await C.loadPosResolution(t, tx);
  const sys = C.resolvePosSystem(res, { kind: "shopProduct" }).systemId;
  if (!sys) return sp;
  // AUDIT-CLASS X2: InvItem ของร้านนี้เท่านั้น — id ร้านอื่น = ไม่ผูก (แถวของตัวเอง invItemId null · C9c)
  const inv = sp.invItemId ? await tx.invItem.findFirst({ where: { id: sp.invItemId, tenantId: t }, select: INV_LITE }) : null;
  let productId: string;
  if (inv && C.resolvePosSystem(res, { kind: "invItem", inventorySystemId: inv.systemId }).systemId === sys) {
    // C9a: แถวร่วมของ InvItem (ไม่แก้แถวร่วม — ราคาเว็บไม่ใช่แหล่งราคาของมัน · G5)
    productId = (await C.ensureForInvItem(sysCtx(t, sys), inv.id, tx)).id;
  } else {
    // C9b: InvItem นอกคลังของ POS แรก = ลิงก์ InvItem ใหม่ ⇒ ล็อกร้านแบบมีงบก่อน (G7) · แถวเว็บร้านก่อนหน้าที่ชี้ InvItem เดียวกัน = ใช้ร่วม
    if (inv) await C.tryLockCatalogTenant(tx, t);
    const shared = inv ? await tx.posProduct.findFirst({ where: { tenantId: t, systemId: sys, invItemId: inv.id }, select: { id: true } }) : null;
    if (shared) productId = shared.id;
    else {
      const book = await C.bookOfPosSystem(t, sys, tx);
      const ap = await C.strictApOf(t, inv, book, tx);
      const d = C.shopProductFields(sp, inv, ap, book).data;
      productId = randomUUID();
      await tx.posProduct.create({ data: { id: productId, tenantId: t, systemId: sys, ...d } });
      await auditSys(tx, t, "pos.product.create", "PosProduct", productId, null, { shopProductId: sp.id, basePriceSatang: d.basePriceSatang, source: "shop.createProduct" });
    }
  }
  await tx.shopProduct.updateMany({ where: { id: sp.id, tenantId: t }, data: { posProductId: productId } });
  return { ...sp, posProductId: productId };
}

/**
 * แก้สินค้าเว็บ (คำสั่งเดิม · กรองร้าน+สาขา) → แถวของเว็บร้านเอง: ชื่อ · ราคา (C7) · VAT · รูป · ลำดับ · ปิด/เปิดขายที่สาขานั้น
 * แถวร่วมของ InvItem (C9a) = ไม่แตะ (G5 · S2.9) — ShopProduct ของตัวเองยังถูกเขียน
 */
export async function updateShopProduct(tx: Tx, s: UnitScope, id: string, data: Prisma.ShopProductUncheckedUpdateManyInput): Promise<{ count: number }> {
  const pre = await tx.shopProduct.findFirst({ where: { id, tenantId: s.tenantId, unitId: s.unitId }, select: { posProductId: true } });
  const rows = await lockRows(tx, s.tenantId, [pre?.posProductId]);
  const r = await tx.shopProduct.updateMany({ where: { id, tenantId: s.tenantId, unitId: s.unitId }, data });
  if (!r.count) return r;
  for (const row of rows) {
    const src = await C.legacySourceOf(row, tx);
    if (src.type !== "shop") continue;
    const sp = await tx.shopProduct.findFirst({ where: { id, tenantId: s.tenantId } });
    if (!sp) continue;
    const d = C.shopProductFields(sp, src.inv, src.ap, src.book).data;
    const cur = row.unavailableUnitIds ?? [];
    const off = sp.active ? cur.filter((u) => u !== sp.unitId) : [...new Set([...cur, sp.unitId])].sort();
    await applySync(tx, row, { name: d.name, basePriceSatang: d.basePriceSatang, vatRateBp: d.vatRateBp, images: d.images, sortOrder: d.sortOrder, unavailableUnitIds: off });
  }
  return r;
}

// ═══════════════════ คลัง (inventory/service.ts) ═══════════════════

/** สินค้า/บริการใหม่ในคลัง (คำสั่งเดิม) → แถวของ InvItem ใน POS ที่ขายคลังนั้น (ensureForInvItem: ล็อกร้านแบบมีงบ · BUSY = ทั้ง tx ล้ม) */
export async function createInvItem(tx: Tx, ctx: SysScope, data: Prisma.InvItemUncheckedCreateInput): Promise<{ id: string }> {
  const it = await tx.invItem.create({ data: { ...data, tenantId: ctx.tenantId, systemId: ctx.systemId } });
  const pos = C.resolvePosSystem(await C.loadPosResolution(ctx.tenantId, tx), { kind: "invItem", inventorySystemId: ctx.systemId }).systemId;
  if (pos) await C.ensureForInvItem(sysCtx(ctx.tenantId, pos), it.id, tx);
  return { id: it.id };
}

/** แก้ InvItem (คำสั่งเดิม) → ชื่อ (แถว InvItem) · ราคาเฉพาะบริการ (InvItem.priceSatang เป็นแหล่งราคา C7 ของบริการเท่านั้น — G5) */
export async function updateInvItem(tx: Tx, ctx: SysScope, itemId: string, data: Prisma.InvItemUncheckedUpdateInput): Promise<void> {
  const rows = await lockRows(tx, ctx.tenantId, await rowIdsOfInvItem(tx, ctx.tenantId, itemId));
  const it = await tx.invItem.update({ where: { id: itemId, tenantId: ctx.tenantId, systemId: ctx.systemId }, data });
  await resyncRows(tx, rows, { name: "name" in data, price: it.kind === "SERVICE" && "priceSatang" in data });
}

/** เก็บ/เลิกเก็บ InvItem (คำสั่งเดิม) → archive / restore แถว InvItem (G6 · ensureForInvItem ไม่ปลดเอง — P1.1a กติกา 1) */
export async function setInvItemArchived(tx: Tx, ctx: SysScope, itemId: string, archived: boolean): Promise<void> {
  const rows = await lockRows(tx, ctx.tenantId, await rowIdsOfInvItem(tx, ctx.tenantId, itemId));
  await tx.invItem.update({ where: { id: itemId, tenantId: ctx.tenantId, systemId: ctx.systemId }, data: { archivedAt: archived ? new Date() : null } });
  const live = await activePos(tx, ctx.tenantId, rows.map((r) => r.systemId));
  for (const row of rows) {
    if (!live.has(row.systemId) || (await C.legacySourceOf(row, tx)).type !== "inv") continue;
    if (archived) await C.archive(sysCtx(ctx.tenantId, row.systemId), row.id, tx);
    else await C.restore(sysCtx(ctx.tenantId, row.systemId), row.id, tx);
  }
}

/** ผูก InvItem ↔ AccountProduct (คำสั่งเดิม) → ราคา/VAT ของแถวคิดใหม่ (AP ของลิ้นชักเปลี่ยน · C7) */
export async function linkInvItemAccountProduct(tx: Tx, ctx: SysScope, itemId: string, accountProductId: string): Promise<void> {
  const rows = await lockRows(tx, ctx.tenantId, await rowIdsOfInvItem(tx, ctx.tenantId, itemId));
  await tx.invItem.update({ where: { id: itemId, tenantId: ctx.tenantId, systemId: ctx.systemId }, data: { accountProductId } });
  await resyncRows(tx, rows, { price: true });
}

/** ซิงก์บัญชี → คลัง (ชื่อ/sku/หน่วย/ลิงก์ · คำสั่งเดิมของ inventory-link.syncProductToItem) → ชื่อแถว InvItem + ราคา (ลิงก์ AP อาจเปลี่ยน) */
export async function writeInvItemFromAccountProduct(
  tx: Tx,
  ctx: SysScope,
  itemId: string,
  data: { accountProductId?: string; name?: string; unitLabel?: string; sku?: string },
): Promise<void> {
  const rows = await lockRows(tx, ctx.tenantId, await rowIdsOfInvItem(tx, ctx.tenantId, itemId));
  await tx.invItem.updateMany({ where: { id: itemId, tenantId: ctx.tenantId, systemId: ctx.systemId }, data });
  await resyncRows(tx, rows, { name: data.name !== undefined, price: data.accountProductId !== undefined });
}

// ═══════════════════ บัญชี (account/product.ts · inventory-link.ts · pos/register.ts) ═══════════════════

/** สร้างสินค้าบัญชี (คำสั่งเดิม) — ยังไม่มี InvItem ชี้มา ⇒ ไม่มีแถวแคตตาล็อกใดเปลี่ยน */
export async function createAccountProduct(tx: Tx, data: Prisma.AccountProductUncheckedCreateInput) {
  return tx.accountProduct.create({ data });
}

/** แก้สินค้าบัญชี (คำสั่งเดิม) → ราคา C7 + VAT ของทุกแถวที่ InvItem ผูก AP นี้ (ล็อกแถวก่อน · G7) */
export async function updateAccountProduct(tx: Tx, scope: SysScope, id: string, data: Prisma.AccountProductUncheckedUpdateManyInput): Promise<{ count: number }> {
  const rows = await lockRows(tx, scope.tenantId, await rowIdsOfAccountProduct(tx, scope.tenantId, id));
  const r = await tx.accountProduct.updateMany({ where: { id, tenantId: scope.tenantId, systemId: scope.systemId }, data });
  if (r.count) await resyncRows(tx, rows, { price: true });
  return r;
}

/** เก็บ/เลิกเก็บสินค้าบัญชี (คำสั่งเดิม) — มติ 13: เป็นประตู (C7 ไม่นับ AP ที่เก็บถาวร ⇒ ราคาที่คิดได้เปลี่ยน) */
export async function archiveAccountProduct(tx: Tx, scope: SysScope, id: string, archived: boolean): Promise<void> {
  const rows = await lockRows(tx, scope.tenantId, await rowIdsOfAccountProduct(tx, scope.tenantId, id));
  const r = await tx.accountProduct.updateMany({ where: { id, tenantId: scope.tenantId, systemId: scope.systemId }, data: { archivedAt: archived ? new Date() : null } });
  if (r.count) await resyncRows(tx, rows, { price: true });
}

/** ราคาขาย POS หน้า "สินค้า/ราคา" ของสินค้าที่ผูกบัญชีแล้ว (มติ 1 — คำสั่งเดียวกับ account.updateAccountProductSalePrice) */
export async function writeAccountProductSalePrice(tx: Tx, tenantId: string, productId: string, salePriceSatang: number): Promise<boolean> {
  const rows = await lockRows(tx, tenantId, await rowIdsOfAccountProduct(tx, tenantId, productId));
  const r = await tx.accountProduct.updateMany({ where: { id: productId, tenantId }, data: { salePrice: Math.max(0, Math.round(salePriceSatang)) } });
  if (r.count) await resyncRows(tx, rows, { price: true });
  return r.count > 0;
}

/** ซิงก์คลัง → บัญชี (ชื่อ/sku/หน่วย/ราคาซื้อ/กระจกสต็อก · คำสั่งเดิมของ inventory-link.syncItemToAccountProduct) — ไม่มีช่องที่แคตตาล็อกคิดจาก */
export async function writeAccountProductFromItem(
  tx: Tx,
  scope: SysScope,
  productId: string,
  data: { invItemId?: string; name?: string; unitId?: string; buyPrice?: number; qtyOnHand?: number; sku?: string },
): Promise<void> {
  await tx.accountProduct.updateMany({ where: { id: productId, tenantId: scope.tenantId, systemId: scope.systemId }, data });
}
