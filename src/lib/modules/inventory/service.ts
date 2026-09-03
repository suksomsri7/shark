import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma, tenantDb } from "@/lib/core/db";
import { cell, columnIndex, type CsvTable, type ImportSummary } from "@/lib/core/csv";
import { emitOutbox } from "@/lib/core/outbox";
import { formatThaiDate } from "@/lib/ui/date";
import { isNegative, movingAvgCost, needsReorder } from "./rules";
import { bridgeInventoryMovement, bridgeItemToAccountProduct, type MovementForGl } from "./account-bridge";

// Inventory (ระบบ 18) — สต็อกกลาง + movement ledger (contract C-1)
// ⚠️ กติกาทั้งหมดมาจาก rules.ts (สมอง FREEZE) — ที่นี่แค่เรียกใช้ + ผูก DB
//    ห้าม hardcode: ต้นทุนถัวเฉลี่ย · เกณฑ์แจ้งเตือน · เกณฑ์ติดลบ
// scope: ใช้ tenantDb({ tenantId, systemId }) — inject tenantId+systemId ทุก query
//    (defense-in-depth · InvItem/InvMovement เป็น system-scoped ใน scope.ts)
// source of truth = ledger (InvMovement) · InvItem.onHand เป็น cache ที่ sync ในทุก movement
//    (อยู่ใน tx เดียวกับการ append ledger เสมอ → balanceAfter = onHand หลังรายการ)

export type Ctx = { tenantId: string; systemId: string };

// ═══════════ Multi-warehouse (WO-0037) — Location + สต็อกต่อคลัง ═══════════
// InvItem.onHand = ยอดรวมทุกคลัง (ของเดิม ห้ามเพี้ยน) · InvLocationStock = ยอดต่อคลัง (cache)
// invariant: sum(InvLocationStock ของ item) == InvItem.onHand เสมอ
// lazy migration ต่อ item: ครั้งแรกที่ item ถูกแตะ (ยังไม่มีแถวสต็อกเลย) → seed แถวคลัง default
//   ด้วย onHand ปัจจุบัน "ก่อน" apply delta → ของยุคเก่าไหลเข้าคลังหลักครบ
const DEFAULT_LOCATION_NAME = "คลังหลัก";
type Db = Prisma.TransactionClient;

// ⚠️ WO 4.1 — helper ชุดล่างนี้ถูกใช้ได้ 2 เส้น:
//    (ก) เส้นเดิมของคลัง: `db` มาจาก tenantDb(ctx) → มี tenantId/systemId inject ให้อยู่แล้ว
//    (ข) เส้นใหม่ `*InTx`: `db` = tx ของโมดูลบัญชี (prisma.$transaction ธรรมดา · ไม่ inject อะไรเลย)
//    ⇒ ทุก where ที่นี่ต้องใส่ `tenantId/systemId` ของ ctx เอง (เส้น ก ได้ตัวกรองซ้ำ = ไม่มีผลข้างเคียง)
const scope = (ctx: Ctx) => ({ tenantId: ctx.tenantId, systemId: ctx.systemId });

// get-or-create คลัง default (isDefault ชื่อ "คลังหลัก") — race-safe ผ่าน unique [systemId,name]
async function getOrCreateDefaultLocation(db: Db, ctx: Ctx): Promise<{ id: string }> {
  const found = await db.invLocation.findFirst({ where: { ...scope(ctx), isDefault: true, archivedAt: null } });
  if (found) return { id: found.id };
  try {
    const created = await db.invLocation.create({
      data: { tenantId: ctx.tenantId, systemId: ctx.systemId, name: DEFAULT_LOCATION_NAME, isDefault: true },
    });
    return { id: created.id };
  } catch (e) {
    // ชนกับคนสร้างพร้อมกัน → refind ตามชื่อ (unique [systemId,name])
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      const again = await db.invLocation.findFirst({ where: { ...scope(ctx), name: DEFAULT_LOCATION_NAME } });
      if (again) return { id: again.id };
    }
    throw e;
  }
}

// lazy seed: ถ้า item ยังไม่มีแถวสต็อกเลย → สร้างแถวคลัง default ด้วย onHand ปัจจุบัน (ก่อน apply delta)
async function seedDefaultStockIfNeeded(db: Db, ctx: Ctx, item: { id: string; onHand: number }): Promise<void> {
  const count = await db.invLocationStock.count({ where: { ...scope(ctx), itemId: item.id } });
  if (count > 0) return;
  const def = await getOrCreateDefaultLocation(db, ctx);
  await db.invLocationStock.create({
    data: { tenantId: ctx.tenantId, systemId: ctx.systemId, itemId: item.id, locationId: def.id, onHand: item.onHand },
  });
}

// ปรับสต็อกคลังหนึ่งด้วย delta (find→update/create — ห้าม upsert) คืนยอดคงเหลือหลังปรับ
async function applyLocationDelta(db: Db, ctx: Ctx, itemId: string, locationId: string, delta: number): Promise<number> {
  const row = await db.invLocationStock.findFirst({ where: { ...scope(ctx), itemId, locationId } });
  if (row) {
    const after = row.onHand + delta;
    await db.invLocationStock.update({ where: { id: row.id }, data: { onHand: after } });
    return after;
  }
  await db.invLocationStock.create({
    data: { tenantId: ctx.tenantId, systemId: ctx.systemId, itemId, locationId, onHand: delta },
  });
  return delta;
}

// ═══════════ Lot/Expiry (WO-0038) — lot ต่อ item (orthogonal กับ location) ═══════════
// invariant เบา: lot.onHand เดินตาม movement ที่ระบุ lotCode เท่านั้น (ไม่ระบุ = ไม่แตะ lot)
// get-or-create InvLot(itemId,lotCode) แล้วบวก delta (find→update/create — ห้าม upsert)
// expiryDate ส่งมา → ตั้งให้ lot (lot เดิมที่ยังว่างก็เติมได้) · คืน onHand ของ lot หลังปรับ
async function applyLotDelta(
  db: Db,
  ctx: Ctx,
  itemId: string,
  lotCode: string,
  delta: number,
  expiryDate?: Date | null,
): Promise<number> {
  const existing = await db.invLot.findFirst({ where: { ...scope(ctx), itemId, lotCode } });
  if (existing) {
    const after = existing.onHand + delta;
    await db.invLot.update({
      where: { id: existing.id },
      data: { onHand: after, ...(expiryDate ? { expiryDate } : {}) },
    });
    return after;
  }
  await db.invLot.create({
    data: {
      tenantId: ctx.tenantId,
      systemId: ctx.systemId,
      itemId,
      lotCode,
      onHand: delta,
      ...(expiryDate ? { expiryDate } : {}),
    },
  });
  return delta;
}

// resolve locationId ที่จะใช้จริง: ส่งมา = ใช้ตามนั้น (ต้องเป็นคลังของระบบนี้) · ไม่ส่ง = คลัง default
// 🔴 WO 4.1: เดิมเชื่อ id ที่ส่งมาโดยไม่ตรวจ — ชี้คลังของระบบอื่นได้ (แถว InvLocationStock จะถูกสร้าง
//    ด้วย tenantId/systemId ของเรา แต่ locationId เป็นของคนอื่น = ยอดคลังเพี้ยนข้ามระบบ)
async function resolveLocationId(db: Db, ctx: Ctx, locationId?: string | null): Promise<string> {
  const id = locationId?.trim();
  if (id) {
    const loc = await db.invLocation.findFirst({ where: { ...scope(ctx), id }, select: { id: true } });
    if (!loc) throw new Error("ไม่พบคลังสินค้าที่เลือก");
    return loc.id;
  }
  return (await getOrCreateDefaultLocation(db, ctx)).id;
}

// ── คลังสินค้า (Location) ──
export async function ensureDefaultLocation(ctx: Ctx): Promise<{ id: string }> {
  return getOrCreateDefaultLocation(tenantDb(ctx) as unknown as Db, ctx);
}

export async function createLocation(ctx: Ctx, input: { name: string }): Promise<{ id: string }> {
  const name = input.name.trim();
  if (!name) throw new Error("กรุณาระบุชื่อคลัง");
  const db = tenantDb(ctx);
  const dup = await db.invLocation.findFirst({ where: { name } });
  if (dup) throw new Error("มีคลังชื่อนี้อยู่แล้ว");
  try {
    const loc = await db.invLocation.create({
      data: { tenantId: ctx.tenantId, systemId: ctx.systemId, name, isDefault: false },
    });
    return { id: loc.id };
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") throw new Error("มีคลังชื่อนี้อยู่แล้ว");
    throw e;
  }
}

// คลังที่ใช้งานอยู่ (archivedAt null) เรียงคลัง default ก่อน แล้วเก่าสุดก่อน
export async function listLocations(ctx: Ctx) {
  return tenantDb(ctx).invLocation.findMany({
    where: { archivedAt: null },
    orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
  });
}

// ยอดคงเหลือแยกตามคลัง (เฉพาะคลังที่มีแถวสต็อก) เรียงคลัง default ก่อน
export async function onHandByLocation(ctx: Ctx, itemId: string): Promise<{ locationId: string; name: string; onHand: number }[]> {
  const db = tenantDb(ctx);
  const rows = await db.invLocationStock.findMany({ where: { itemId } });
  if (rows.length === 0) return [];
  const locs = await db.invLocation.findMany({ where: { id: { in: rows.map((r) => r.locationId) } } });
  const byId = new Map(locs.map((l) => [l.id, l]));
  return rows
    .map((r) => {
      const loc = byId.get(r.locationId);
      return { locationId: r.locationId, name: loc?.name ?? "(คลังถูกลบ)", onHand: r.onHand, isDefault: loc?.isDefault ?? false };
    })
    .sort((a, b) => (a.isDefault === b.isDefault ? 0 : a.isDefault ? -1 : 1))
    .map(({ locationId, name, onHand }) => ({ locationId, name, onHand }));
}

// ── สร้างสินค้าใหม่ (onHand เริ่ม 0 — เข้าของจริงผ่าน receive เท่านั้น) ──
export type CreateItemInput = {
  sku: string;
  name: string;
  barcode?: string | null;
  unitLabel?: string | null;
  category?: string | null;
  reorderPoint?: number | null;
  costSatang?: number | null;
  // ── บริการ (13 ส.ค. 2026 · ข้อ 12) — kind=SERVICE ไม่มีสต็อก ──
  kind?: "PRODUCT" | "SERVICE";
  priceSatang?: number | null; // ราคาขาย (บริการใช้ช่องนี้)
  durationMin?: number | null;
  bufferMin?: number | null;
  depositSatang?: number | null;
  bookable?: boolean;
  description?: string | null;
  categoryId?: string | null;
};

export async function createItem(ctx: Ctx, input: CreateItemInput): Promise<{ id: string }> {
  const it = await tenantDb(ctx).invItem.create({
    data: {
      tenantId: ctx.tenantId,
      systemId: ctx.systemId,
      sku: input.sku.trim(),
      name: input.name.trim(),
      barcode: input.barcode?.trim() || null,
      // unitLabel มี default "ชิ้น" ใน schema — ส่งเฉพาะเมื่อระบุ
      ...(input.unitLabel?.trim() ? { unitLabel: input.unitLabel.trim() } : {}),
      category: input.category?.trim() || null,
      categoryId: input.categoryId?.trim() || null,
      reorderPoint: Math.max(0, Math.round(input.reorderPoint ?? 0)),
      costSatang: Math.max(0, Math.round(input.costSatang ?? 0)),
      kind: input.kind ?? "PRODUCT",
      priceSatang: Math.max(0, Math.round(input.priceSatang ?? 0)),
      ...(input.durationMin != null ? { durationMin: Math.max(1, Math.round(input.durationMin)) } : {}),
      bufferMin: Math.max(0, Math.round(input.bufferMin ?? 0)),
      depositSatang: Math.max(0, Math.round(input.depositSatang ?? 0)),
      ...(input.bookable !== undefined ? { bookable: input.bookable } : {}),
      description: input.description?.trim() || null,
      // onHand = 0 (default ใน schema)
    },
  });
  return { id: it.id };
}

// ── นำเข้าสินค้าจาก CSV (WO Wave6-A) — reuse createItem · onHand เริ่ม 0 (รับเข้าจริงทีหลังผ่าน receive) ──
// header ที่รองรับ (ไทย/อังกฤษ) — normalize ตัดช่องว่าง/พิมพ์เล็กแล้วเทียบ
const ITEM_COLS = {
  name: ["name", "ชื่อ", "ชื่อสินค้า", "สินค้า", "product", "productname"],
  sku: ["sku", "รหัส", "รหัสสินค้า", "code", "itemcode", "รหัสสกุ"],
  barcode: ["barcode", "บาร์โค้ด", "บาร์โคด"],
  category: ["category", "หมวด", "หมวดหมู่", "ประเภท"],
  unit: ["unit", "หน่วย", "หน่วยนับ", "unitlabel"],
  cost: ["cost", "ต้นทุน", "ราคาทุน", "ราคาต้นทุน", "ต้นทุนต่อหน่วย", "ทุน", "costprice"],
  reorder: ["reorder", "reorderpoint", "จุดสั่งซื้อ", "จุดสั่ง", "min", "minimum"],
};

// SKU ว่าง → gen อัตโนมัติ (กันชนกับ @@unique[systemId,sku] เมื่อมีหลายแถวไม่มี sku)
const SKU_ALPHABET = "ACDEFGHJKLMNPQRSTUVWXY3456789";
function genSku(): string {
  let s = "IMP-";
  for (let i = 0; i < 6; i++) s += SKU_ALPHABET[Math.floor(Math.random() * SKU_ALPHABET.length)];
  return s;
}

// จำนวนเงินบาท → สตางค์ (ตัด comma หลักพัน) · ค่าที่อ่านไม่ได้/ติดลบ → 0
function bahtToSatang(raw: string): number {
  const n = Number(raw.replace(/,/g, ""));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : 0;
}
function toReorder(raw: string): number {
  const n = Number(raw.replace(/,/g, ""));
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
}

// นำเข้าทีละแถว: ชื่อว่าง → error · sku ซ้ำในระบบ (P2002) → ข้าม · ที่เหลือ createItem (onHand=0)
export async function importItems(ctx: Ctx, table: CsvTable): Promise<ImportSummary> {
  const idx = {
    name: columnIndex(table.headers, ITEM_COLS.name),
    sku: columnIndex(table.headers, ITEM_COLS.sku),
    barcode: columnIndex(table.headers, ITEM_COLS.barcode),
    category: columnIndex(table.headers, ITEM_COLS.category),
    unit: columnIndex(table.headers, ITEM_COLS.unit),
    cost: columnIndex(table.headers, ITEM_COLS.cost),
    reorder: columnIndex(table.headers, ITEM_COLS.reorder),
  };
  const summary: ImportSummary = { created: 0, skipped: 0, errors: [] };

  for (let r = 0; r < table.rows.length; r++) {
    const rowNo = r + 2; // +1 header, +1 = เลขแถว 1-based ที่ผู้ใช้เห็นใน Excel
    const row = table.rows[r];
    const name = cell(row, idx.name);
    if (!name) {
      summary.errors.push({ row: rowNo, reason: "ชื่อสินค้าว่าง" });
      continue;
    }
    const sku = cell(row, idx.sku) || genSku();
    try {
      await createItem(ctx, {
        sku,
        name,
        barcode: cell(row, idx.barcode) || null,
        unitLabel: cell(row, idx.unit) || null,
        category: cell(row, idx.category) || null,
        reorderPoint: toReorder(cell(row, idx.reorder)),
        costSatang: bahtToSatang(cell(row, idx.cost)),
      });
      summary.created += 1;
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        summary.skipped += 1; // sku ซ้ำในระบบ → ข้าม (ไม่ทับของเดิม)
      } else {
        summary.errors.push({ row: rowNo, reason: e instanceof Error ? e.message.slice(0, 120) : "เกิดข้อผิดพลาด" });
      }
    }
  }
  return summary;
}

// ── แก้ไขข้อมูลสินค้า (CRUD) — เฉพาะ field ข้อมูล ห้ามแตะ onHand/costSatang ──
// onHand = ledger-derived cache (source of truth = InvMovement) · costSatang = ต้นทุนถัวเฉลี่ย (เดินตาม receive เท่านั้น)
//   → แก้ผ่าน movement เท่านั้น ไม่ใช่ field patch (กัน cache เพี้ยนจาก ledger)
// แก้เฉพาะ field ที่ผู้ใช้ตั้ง (undefined = ไม่แตะ) · sku ซ้ำในระบบ (unique [systemId,sku]) → throw ไทย
export type UpdateItemPatch = Partial<{
  name: string;
  sku: string;
  barcode: string | null;
  category: string | null;
  categoryId: string | null;
  unitLabel: string;
  reorderPoint: number;
  // บริการ/ราคา (ข้อ 12-15) — แก้ได้ที่ระบบสินค้า/บริการเท่านั้น
  priceSatang: number;
  durationMin: number;
  bufferMin: number;
  depositSatang: number;
  bookable: boolean;
  description: string | null;
}>;

export async function updateItem(ctx: Ctx, itemId: string, patch: UpdateItemPatch): Promise<{ id: string }> {
  const db = tenantDb(ctx);
  const item = await db.invItem.findFirst({ where: { id: itemId } });
  if (!item) throw new Error("ไม่พบสินค้าในคลัง");

  const data: Record<string, unknown> = {};
  if (patch.name !== undefined) {
    const name = patch.name.trim();
    if (!name) throw new Error("กรุณาระบุชื่อสินค้า");
    data.name = name;
  }
  if (patch.sku !== undefined) {
    const sku = patch.sku.trim();
    if (!sku) throw new Error("กรุณาระบุรหัสสินค้า (SKU)");
    data.sku = sku;
  }
  if (patch.barcode !== undefined) data.barcode = patch.barcode?.trim() || null;
  if (patch.category !== undefined) data.category = patch.category?.trim() || null;
  if (patch.unitLabel !== undefined) {
    const u = patch.unitLabel.trim();
    if (u) data.unitLabel = u; // ว่าง = คงหน่วยเดิม (unitLabel มี default ห้ามตั้งว่าง)
  }
  if (patch.reorderPoint !== undefined) data.reorderPoint = Math.max(0, Math.round(patch.reorderPoint));
  if (patch.categoryId !== undefined) data.categoryId = patch.categoryId?.trim() || null;
  if (patch.priceSatang !== undefined) data.priceSatang = Math.max(0, Math.round(patch.priceSatang));
  if (patch.durationMin !== undefined) {
    const d = Math.round(patch.durationMin);
    if (item.kind === "SERVICE" && d < 1) throw new Error("บริการต้องใช้เวลาอย่างน้อย 1 นาที");
    data.durationMin = d;
  }
  if (patch.bufferMin !== undefined) data.bufferMin = Math.max(0, Math.round(patch.bufferMin));
  if (patch.depositSatang !== undefined) data.depositSatang = Math.max(0, Math.round(patch.depositSatang));
  if (patch.bookable !== undefined) data.bookable = patch.bookable;
  if (patch.description !== undefined) data.description = patch.description?.trim() || null;

  if (Object.keys(data).length === 0) return { id: itemId };

  try {
    await db.invItem.update({ where: { id: item.id }, data });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")
      throw new Error("มีสินค้ารหัส (SKU) นี้อยู่แล้ว");
    throw e;
  }
  // WO 4.1: item = ต้นฉบับของ ชื่อ/sku/หน่วย/ต้นทุน → ดันไปที่สินค้าบัญชีที่ผูกกันไว้
  await syncLinkedAccountProduct(ctx, itemId);
  return { id: itemId };
}

// ── ปิดการใช้งานสินค้า (soft-delete) — active=false ผ่าน archivedAt ──
// ไม่โผล่ใน listItems ปกติ/catalog POS แต่ประวัติ movement คงอยู่ (ledger ไม่ถูกแตะ)
export async function archiveItem(ctx: Ctx, itemId: string): Promise<{ id: string }> {
  const db = tenantDb(ctx);
  const item = await db.invItem.findFirst({ where: { id: itemId } });
  if (!item) throw new Error("ไม่พบสินค้าในคลัง");
  if (!item.archivedAt) {
    await db.invItem.update({ where: { id: item.id }, data: { archivedAt: new Date() } });
  }
  return { id: itemId };
}

// ── เปิดใช้งานสินค้าอีกครั้ง (unarchive) ──
export async function unarchiveItem(ctx: Ctx, itemId: string): Promise<{ id: string }> {
  const db = tenantDb(ctx);
  const item = await db.invItem.findFirst({ where: { id: itemId } });
  if (!item) throw new Error("ไม่พบสินค้าในคลัง");
  if (item.archivedAt) {
    await db.invItem.update({ where: { id: item.id }, data: { archivedAt: null } });
  }
  return { id: itemId };
}

// ── บัญชีต้นทุนอัตโนมัติ (perpetual) — โพสต์ GL หลังบันทึก movement (WO Inventory→Account) ──
// resolve ระบบ ACCOUNT ของกิจการ (type ACCOUNT · ผูก tenant) — ไม่มี = ข้ามเงียบ (standalone)
// โพสต์ "หลัง" tx ของ movement (คนละ tx): tenantDb tx ผูก systemId=INVENTORY → inject ทับ systemId
//   ของ accountJournalEntry ไม่ได้ (จะเพี้ยนเป็นระบบคลัง) จึงโพสต์นอก tx ผ่าน facade ที่ scope=ACCOUNT
// idempotent ที่ชั้น gl (InvMovement#id#event) — movement เดิม (dup guard คืน row เดิม) โพสต์ซ้ำไม่เบิ้ล
// GL ล้ม = ไม่ล้ม movement (catch) · ทุก entry Dr=Cr ในตัว → งบไม่มีทางเสียสมดุลจากตรงนี้
async function postMovementGl(ctx: Ctx, mv: MovementForGl): Promise<void> {
  try {
    const acct = await tenantDb(ctx).appSystem.findFirst({ where: { type: "ACCOUNT" }, select: { id: true } });
    await bridgeInventoryMovement(acct?.id ?? null, ctx.tenantId, mv);
  } catch {
    // โพสต์บัญชีไม่สำเร็จ → เก็บ movement ไว้ (ระบบคลังทำงานต่อได้) — ไม่ปล่อย error ทับงานคลัง
  }
}

/** แถว InvMovement เต็ม ๆ (ผลลัพธ์ของ receiveInTx/consumeInTx) */
export type MovementRow = Awaited<ReturnType<typeof prisma.invMovement.create>>;

/**
 * WO 4.1 — ให้ผู้เรียก `*InTx` โพสต์ GL ต้นทุนได้ "หลัง commit" ของ tx ตัวเอง
 * (โพสต์ในระหว่าง tx ไม่ได้ — entry บัญชีต้องอยู่ scope=ACCOUNT ไม่ใช่ scope=INVENTORY · ดูหมายเหตุ postMovementGl)
 */
export async function postMovementGlAfterTx(ctx: Ctx, mv: MovementForGl): Promise<void> {
  await postMovementGl(ctx, mv);
}

/**
 * WO 4.1 (MAP §F.11) — item เปลี่ยน → ดันค่าไปที่ AccountProduct ที่ผูกกันไว้ (ชื่อ · sku · หน่วย · ต้นทุน)
 * เรียกผ่าน facade บัญชี (`account/index`) เท่านั้น — chokepoint inventory→account เดิม
 * ไม่ผูกกับใคร / ไม่มีระบบบัญชี / พังกลางทาง = เงียบ (คลังต้องทำงานต่อได้ตามกติกา §F.15 "ไม่เชื่อม = ไม่ post")
 */
async function syncLinkedAccountProduct(ctx: Ctx, itemId: string): Promise<void> {
  await bridgeItemToAccountProduct(ctx, itemId); // กลืน error เองแล้วภายใน (คลังต้องทำงานต่อได้)
}

// ── รับเข้า (IN) — เพิ่ม onHand + คำนวณต้นทุนถัวเฉลี่ยเคลื่อนที่ (จากกติกา) ──
// idempotent ต่อ idempotencyKey: เรียกซ้ำด้วย key เดิม → ไม่เพิ่มซ้ำ
export type ReceiveInput = {
  itemId: string;
  qty: number;
  costSatang: number;
  idempotencyKey: string;
  refType?: string | null;
  refId?: string | null;
  sourceModule?: string | null;
  note?: string | null;
  locationId?: string | null; // ไม่ส่ง = คลัง default (WO-0037)
  lotCode?: string | null; // WO-0038: ระบุ lot → เดิน InvLot · ไม่ส่ง = พฤติกรรมเดิม
  expiryDate?: Date | null; // WO-0038: ตั้งวันหมดอายุให้ lot (ต้องมี lotCode)
};

export async function receive(ctx: Ctx, input: ReceiveInput): Promise<{ id: string }> {
  const db = tenantDb(ctx);
  const mv = await db.$transaction((tx) => receiveInTx(tx as unknown as Db, ctx, input));
  // perpetual: โพสต์ต้นทุนเข้าบัญชี (นอก tx · idempotent ต่อ movement) — ไม่มีระบบ ACCOUNT = ข้าม
  await postMovementGl(ctx, mv);
  // WO 4.1: ต้นทุนถัวเฉลี่ยเปลี่ยนหลังรับเข้า → ดันไปที่ "ราคาซื้อ/หน่วย" ของสินค้าบัญชีที่ผูกกันไว้
  await syncLinkedAccountProduct(ctx, mv.itemId);
  return { id: mv.id };
}

/**
 * WO 4.1 — รับเข้า "ภายใน tx ของผู้เรียก" (โมดูลบัญชี: ใบส่งคืนเบิก RPR ต้อง atomic กับเอกสาร)
 * ⚠️ ไม่โพสต์ GL ให้ (ต้อง commit ก่อน) — ผู้เรียกรับผิดชอบเรียก `postMovementGlAfterTx` เองถ้าต้องการ
 * ⚠️ `tx` อาจไม่ได้ผูก scope → ทุก where ในนี้ใส่ tenantId/systemId เอง
 */
export async function receiveInTx(tx: Db, ctx: Ctx, input: ReceiveInput): Promise<MovementRow> {
  const qty = Math.round(input.qty);
  const inCost = Math.max(0, Math.round(input.costSatang));
  const lotCode = input.lotCode?.trim() || null;
  {
    const txc = tx as unknown as Db;
    // idempotent guard — key เดิมเคยบันทึกแล้ว → คืนรายการเดิม ไม่แตะสต็อก
    const dup = await tx.invMovement.findFirst({ where: { tenantId: ctx.tenantId, idempotencyKey: input.idempotencyKey } });
    if (dup) return dup;

    const item = await tx.invItem.findFirst({ where: { ...scope(ctx), id: input.itemId } });
    if (!item) throw new Error("ไม่พบสินค้าในคลัง");
    // 🔴 บริการไม่มีสต็อก (13 ส.ค. 2026) — กันเผลอรับเข้า/ตัด/นับ "ค่าตัดผม" เป็นชิ้น
    if (item.kind === "SERVICE") throw new Error(`"${item.name}" เป็นบริการ — ไม่มีสต็อกให้รับเข้า/ตัด/นับ`);

    const locId = await resolveLocationId(txc, ctx, input.locationId);
    await seedDefaultStockIfNeeded(txc, ctx, item); // ก่อน apply delta (invariant)

    const newOnHand = item.onHand + qty;
    // ต้นทุนถัวเฉลี่ยจากกติกา — ตัดออกไม่กระทบต้นทุน, รับเข้าเท่านั้นที่ถัวเฉลี่ย
    const newCost = movingAvgCost(item.onHand, item.costSatang, qty, inCost);

    await tx.invItem.update({
      where: { id: item.id },
      data: { onHand: newOnHand, costSatang: newCost },
    });
    await applyLocationDelta(txc, ctx, item.id, locId, qty);
    // ระบุ lot → เดิน InvLot (get-or-create + ตั้งวันหมดอายุ) · ไม่ระบุ = ไม่แตะ lot เลย
    if (lotCode) await applyLotDelta(txc, ctx, item.id, lotCode, qty, input.expiryDate ?? null);

    return tx.invMovement.create({
      data: {
        tenantId: ctx.tenantId,
        systemId: ctx.systemId,
        itemId: item.id,
        type: "IN",
        locationId: locId,
        lotCode,
        qtyDelta: qty,
        balanceAfter: newOnHand,
        costSatang: inCost,
        sourceModule: input.sourceModule?.trim() || null,
        refType: input.refType?.trim() || null,
        refId: input.refId?.trim() || null,
        idempotencyKey: input.idempotencyKey,
        note: input.note?.trim() || null,
        needsReview: isNegative(newOnHand),
      },
    });
  }
}

// ── ตัดออก (OUT) — ลด onHand · ยอมติดลบ ไม่ block ·  ติดลบ = ตั้งธง needsReview ──
// idempotent ต่อ idempotencyKey เช่นกัน (กันตัดสต็อกซ้ำจาก retry ของโมดูลต้นทาง)
export type ConsumeInput = {
  itemId: string;
  qty: number;
  sourceModule?: string | null;
  refType?: string | null;
  refId?: string | null;
  idempotencyKey: string;
  note?: string | null;
  locationId?: string | null; // ไม่ส่ง = คลัง default (WO-0037)
  lotCode?: string | null; // WO-0038: ระบุ lot → ตัดจาก InvLot (ติดลบยอม)
};

export async function consume(ctx: Ctx, input: ConsumeInput): Promise<{ id: string }> {
  const db = tenantDb(ctx);
  const mv = await db.$transaction((tx) => consumeInTx(tx as unknown as Db, ctx, input));
  // perpetual: รับรู้ต้นทุนขาย (นอก tx · idempotent ต่อ movement) — ไม่มีระบบ ACCOUNT = ข้าม
  await postMovementGl(ctx, mv);
  return { id: mv.id };
}

/**
 * WO 4.1 — ตัดออก "ภายใน tx ของผู้เรียก" (โมดูลบัญชี: ใบเบิก PRR ต้อง atomic กับเอกสาร)
 * ⚠️ ไม่โพสต์ GL ให้ · ⚠️ `tx` อาจไม่ได้ผูก scope → ใส่ tenantId/systemId เองทุก where
 */
export async function consumeInTx(tx: Db, ctx: Ctx, input: ConsumeInput): Promise<MovementRow> {
  const qty = Math.round(input.qty);
  const lotCode = input.lotCode?.trim() || null;
  {
    const txc = tx as unknown as Db;
    const dup = await tx.invMovement.findFirst({ where: { tenantId: ctx.tenantId, idempotencyKey: input.idempotencyKey } });
    if (dup) return dup;

    const item = await tx.invItem.findFirst({ where: { ...scope(ctx), id: input.itemId } });
    if (!item) throw new Error("ไม่พบสินค้าในคลัง");
    // 🔴 บริการไม่มีสต็อก (13 ส.ค. 2026) — กันเผลอรับเข้า/ตัด/นับ "ค่าตัดผม" เป็นชิ้น
    if (item.kind === "SERVICE") throw new Error(`"${item.name}" เป็นบริการ — ไม่มีสต็อกให้รับเข้า/ตัด/นับ`);

    const locId = await resolveLocationId(txc, ctx, input.locationId);
    await seedDefaultStockIfNeeded(txc, ctx, item);

    const newOnHand = item.onHand - qty;

    await tx.invItem.update({
      where: { id: item.id },
      data: { onHand: newOnHand }, // ตัดออกไม่กระทบต้นทุนถัวเฉลี่ย
    });
    await applyLocationDelta(txc, ctx, item.id, locId, -qty);
    // ระบุ lot → ตัดจาก lot (ติดลบยอม) · lot ติดลบก็ตั้งธงให้ตรวจตามนโยบายเดิม
    let lotNegative = false;
    if (lotCode) lotNegative = isNegative(await applyLotDelta(txc, ctx, item.id, lotCode, -qty));

    return tx.invMovement.create({
      data: {
        tenantId: ctx.tenantId,
        systemId: ctx.systemId,
        itemId: item.id,
        type: "OUT",
        locationId: locId,
        lotCode,
        qtyDelta: -qty,
        balanceAfter: newOnHand,
        costSatang: item.costSatang,
        sourceModule: input.sourceModule?.trim() || null,
        refType: input.refType?.trim() || null,
        refId: input.refId?.trim() || null,
        idempotencyKey: input.idempotencyKey,
        note: input.note?.trim() || null,
        // ตัดจนติดลบ (ยอดรวม หรือ lot ที่ระบุ) = ตั้งธงให้ร้านมาเคลียร์ (ขายไปก่อน ไม่ block)
        needsReview: isNegative(newOnHand) || lotNegative,
      },
    });
  }
}

// ── ปรับสต็อก (ADJUST) — ตั้ง onHand เป็นค่านับจริง (stock take) โดยตรง ──
// qtyDelta = newQty - onHand เดิม · balanceAfter = newQty · idempotent เหมือน receive
// ต้นทุนถัวเฉลี่ยไม่กระทบ (แค่ปรับจำนวน) · ปรับจนติดลบ = ตั้งธง needsReview
export type AdjustInput = {
  itemId: string;
  newQty: number;
  idempotencyKey: string;
  note?: string | null;
  locationId?: string | null; // ไม่ส่ง = คลัง default (WO-0037)
};

export async function adjust(ctx: Ctx, input: AdjustInput): Promise<{ id: string }> {
  const newQty = Math.round(input.newQty);
  const db = tenantDb(ctx);

  return db.$transaction(async (tx) => {
    const txc = tx as unknown as Db;
    // idempotent guard — key เดิมเคยบันทึกแล้ว → คืนรายการเดิม ไม่แตะสต็อก
    const dup = await tx.invMovement.findFirst({ where: { idempotencyKey: input.idempotencyKey } });
    if (dup) return { id: dup.id };

    const item = await tx.invItem.findFirst({ where: { id: input.itemId } });
    if (!item) throw new Error("ไม่พบสินค้าในคลัง");
    // 🔴 บริการไม่มีสต็อก (13 ส.ค. 2026) — กันเผลอรับเข้า/ตัด/นับ "ค่าตัดผม" เป็นชิ้น
    if (item.kind === "SERVICE") throw new Error(`"${item.name}" เป็นบริการ — ไม่มีสต็อกให้รับเข้า/ตัด/นับ`);

    const locId = await resolveLocationId(txc, ctx, input.locationId);
    await seedDefaultStockIfNeeded(txc, ctx, item);

    const qtyDelta = newQty - item.onHand;

    await tx.invItem.update({
      where: { id: item.id },
      data: { onHand: newQty }, // ตั้งเป็นค่านับจริงโดยตรง (ไม่กระทบต้นทุนถัวเฉลี่ย)
    });
    await applyLocationDelta(txc, ctx, item.id, locId, qtyDelta); // คลังที่ระบุขยับตาม delta → invariant คง

    const mv = await tx.invMovement.create({
      data: {
        tenantId: ctx.tenantId,
        systemId: ctx.systemId,
        itemId: item.id,
        type: "ADJUST",
        locationId: locId,
        qtyDelta,
        balanceAfter: newQty,
        costSatang: item.costSatang,
        idempotencyKey: input.idempotencyKey,
        note: input.note?.trim() || null,
        // ปรับจนติดลบ = ตั้งธงให้ร้านมาเคลียร์
        needsReview: isNegative(newQty),
      },
    });
    return { id: mv.id };
  });
}

// ── นับสต็อกหลายรายการพร้อมกัน (bulk stock take) — วน adjust() ตั้ง onHand = จำนวนนับจริง ทีละตัว ──
// reuse adjust ต่อรายการ (atomic/idempotent เดิม · movement ADJUST ไม่โพสต์ GL ตาม account-bridge)
// ไม่ atomic ทั้งชุด: id ข้ามร้าน/ไม่พบ → adjust โยน "ไม่พบสินค้าในคลัง" → บันทึก failed แล้วไปต่อ
// reason = "นับสต็อก" · idempotencyKey ใหม่ต่อรายการ (การนับเป็น action ครั้งเดียวเหมือน manual receive/consume)
export type BulkCountLine = { itemId: string; countedQty: number };
export type BulkCountResult = { done: number; failed: { itemId: string; reason: string }[] };
export async function bulkCount(ctx: Ctx, counts: BulkCountLine[]): Promise<BulkCountResult> {
  const result: BulkCountResult = { done: 0, failed: [] };
  for (const c of counts) {
    try {
      await adjust(ctx, {
        itemId: c.itemId,
        newQty: Math.round(c.countedQty),
        idempotencyKey: `count-${randomUUID()}`,
        note: "นับสต็อก",
      });
      result.done += 1;
    } catch (e) {
      result.failed.push({ itemId: c.itemId, reason: e instanceof Error ? e.message.slice(0, 120) : "ปรับสต็อกไม่สำเร็จ" });
    }
  }
  return result;
}

// ── โอนระหว่างคลัง (TRANSFER) — ย้ายสต็อกข้ามคลัง onHand รวมไม่เปลี่ยน (WO-0037) ──
// movement คู่: ขาออก (-qty @from key `<key>-out`) + ขาเข้า (+qty @to key `<key>-in`)
// idempotent ต่อ idempotencyKey (เช็ค `<key>-out`): ยิงซ้ำ → ok:false ไม่ทำซ้ำ
// ต้นทางติดลบ → ยอม (นโยบายเดิม) + ตั้งธง needsReview ที่ขาออก
export type TransferInput = {
  itemId: string;
  fromLocationId: string;
  toLocationId: string;
  qty: number;
  idempotencyKey: string;
  note?: string | null;
};

export async function transfer(ctx: Ctx, input: TransferInput): Promise<{ ok: boolean }> {
  const qty = Math.round(input.qty);
  if (qty <= 0) throw new Error("จำนวนที่โอนต้องมากกว่า 0");
  if (input.fromLocationId === input.toLocationId) throw new Error("คลังต้นทางและปลายทางต้องเป็นคนละคลัง");
  const outKey = `${input.idempotencyKey}-out`;
  const inKey = `${input.idempotencyKey}-in`;
  const note = input.note?.trim() || null;
  const db = tenantDb(ctx);

  return db.$transaction(async (tx) => {
    const txc = tx as unknown as Db;
    // idempotent — เคยโอน key นี้แล้ว → ไม่ทำซ้ำ
    const dup = await tx.invMovement.findFirst({ where: { idempotencyKey: outKey } });
    if (dup) return { ok: false };

    const item = await tx.invItem.findFirst({ where: { id: input.itemId } });
    if (!item) throw new Error("ไม่พบสินค้าในคลัง");
    // 🔴 บริการไม่มีสต็อก (13 ส.ค. 2026) — กันเผลอรับเข้า/ตัด/นับ "ค่าตัดผม" เป็นชิ้น
    if (item.kind === "SERVICE") throw new Error(`"${item.name}" เป็นบริการ — ไม่มีสต็อกให้รับเข้า/ตัด/นับ`);

    await seedDefaultStockIfNeeded(txc, ctx, item);

    // คำนวณยอดหลังโอนไว้ก่อน apply (สำหรับ balanceAfter/needsReview)
    const fromRow = await tx.invLocationStock.findFirst({ where: { itemId: item.id, locationId: input.fromLocationId } });
    const toRow = await tx.invLocationStock.findFirst({ where: { itemId: item.id, locationId: input.toLocationId } });
    const fromAfter = (fromRow?.onHand ?? 0) - qty;
    const toAfter = (toRow?.onHand ?? 0) + qty;

    await applyLocationDelta(txc, ctx, item.id, input.fromLocationId, -qty);
    await applyLocationDelta(txc, ctx, item.id, input.toLocationId, qty);
    // InvItem.onHand ไม่แตะ — ยอดรวมทุกคลังไม่เปลี่ยน

    await tx.invMovement.create({
      data: {
        tenantId: ctx.tenantId,
        systemId: ctx.systemId,
        itemId: item.id,
        type: "TRANSFER",
        locationId: input.fromLocationId,
        qtyDelta: -qty,
        balanceAfter: fromAfter,
        costSatang: item.costSatang,
        sourceModule: "transfer",
        refType: "InvLocation",
        refId: input.toLocationId,
        idempotencyKey: outKey,
        note,
        needsReview: isNegative(fromAfter), // ต้นทางติดลบ = ตั้งธงให้ตรวจ
      },
    });
    await tx.invMovement.create({
      data: {
        tenantId: ctx.tenantId,
        systemId: ctx.systemId,
        itemId: item.id,
        type: "TRANSFER",
        locationId: input.toLocationId,
        qtyDelta: qty,
        balanceAfter: toAfter,
        costSatang: item.costSatang,
        sourceModule: "transfer",
        refType: "InvLocation",
        refId: input.fromLocationId,
        idempotencyKey: inKey,
        note,
        needsReview: false,
      },
    });
    return { ok: true };
  });
}

// ── อ่านยอดคงเหลือ (cache) ตามรายการสินค้า ──
export async function onHand(ctx: Ctx, itemIds: string[]): Promise<{ itemId: string; onHand: number }[]> {
  if (itemIds.length === 0) return [];
  const items = await tenantDb(ctx).invItem.findMany({
    where: { id: { in: itemIds } },
    select: { id: true, onHand: true },
  });
  return items.map((i) => ({ itemId: i.id, onHand: i.onHand }));
}

// ── สต็อกต่อคลังของทุก item (สำหรับ UI แสดงแบบกดดู) → Map itemId → [{locationId,name,onHand}] ──
export async function stockByLocationMap(ctx: Ctx): Promise<Map<string, { locationId: string; name: string; onHand: number }[]>> {
  const db = tenantDb(ctx);
  const [rows, locs] = await Promise.all([
    db.invLocationStock.findMany({}),
    db.invLocation.findMany({ orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }] }),
  ]);
  const nameById = new Map(locs.map((l) => [l.id, l.name]));
  const order = new Map(locs.map((l, i) => [l.id, i]));
  const map = new Map<string, { locationId: string; name: string; onHand: number }[]>();
  for (const r of rows) {
    const arr = map.get(r.itemId) ?? [];
    arr.push({ locationId: r.locationId, name: nameById.get(r.locationId) ?? "(คลังถูกลบ)", onHand: r.onHand });
    map.set(r.itemId, arr);
  }
  for (const arr of map.values()) arr.sort((a, b) => (order.get(a.locationId) ?? 99) - (order.get(b.locationId) ?? 99));
  return map;
}

// ── สินค้าใกล้หมด/หมด (ต่ำกว่าจุดสั่งซื้อ ตามกติกา needsReorder) ──
export async function lowStock(ctx: Ctx) {
  const items = await tenantDb(ctx).invItem.findMany({
    where: { archivedAt: null, kind: "PRODUCT" }, // บริการไม่มีสต็อก → ไม่มี "ใกล้หมด"

    orderBy: { onHand: "asc" },
  });
  return items.filter((i) => needsReorder(i.onHand, i.reorderPoint));
}

// ── reads สำหรับ UI ──
// 🔴 13 ส.ค. 2026: แคตตาล็อกมี 2 ชนิด — listItems = **สินค้าเท่านั้น** (หน้าสต็อก/รับเข้า/นับ ใช้ตัวนี้)
//    บริการอยู่ listServices() · ถ้าเผลอรวมกัน หน้าสต็อกจะมีบริการโผล่มาให้นับ (ไม่มีของให้นับ)
export async function listItems(ctx: Ctx, take = 200) {
  return tenantDb(ctx).invItem.findMany({
    where: { archivedAt: null, kind: "PRODUCT" },
    orderBy: { createdAt: "desc" },
    take,
  });
}

/** บริการในแคตตาล็อก (ต้นฉบับเดียวของทั้งระบบ — จองคิว/POS ดึงจากที่นี่) */
export async function listServices(ctx: Ctx, take = 200) {
  return tenantDb(ctx).invItem.findMany({
    where: { archivedAt: null, kind: "SERVICE" },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    take,
  });
}

// อ่านสินค้าตัวเดียว (scope tenant+system ผ่าน tenantDb) — null ถ้าไม่พบ/ข้ามระบบ
export async function getItem(ctx: Ctx, itemId: string) {
  return tenantDb(ctx).invItem.findFirst({ where: { id: itemId, archivedAt: null } });
}

// ผูกสินค้าในคลังกับ AccountProduct (สำหรับตั้งราคาขาย POS) — find→update (ไม่ใช่ upsert)
export async function linkAccountProduct(ctx: Ctx, itemId: string, accountProductId: string): Promise<void> {
  const db = tenantDb(ctx);
  const item = await db.invItem.findFirst({ where: { id: itemId } });
  if (!item) throw new Error("ไม่พบสินค้าในคลัง");
  await db.invItem.update({ where: { id: item.id }, data: { accountProductId } });
  // WO 4.1: ผูกแล้วดันค่าฝั่งคลัง (sku/หน่วย/ต้นทุน) ไปตั้งต้นให้สินค้าบัญชีทันที — ขากลับ
  //   (AccountProduct.invItemId) ตั้งโดย account.linkProductToItem ซึ่งเรียกฟังก์ชันนี้ต่ออีกที
  await syncLinkedAccountProduct(ctx, itemId);
}

export async function recentMovements(ctx: Ctx, take = 30) {
  return tenantDb(ctx).invMovement.findMany({
    orderBy: { createdAt: "desc" },
    include: { item: true },
    take,
  });
}

// ═══════════ Lot/Expiry/Barcode reads (WO-0038) ═══════════
const DAY_MS = 86_400_000;
const LOT_EXPIRING_TITLE = "สินค้าใกล้หมดอายุ";
const LOT_EXPIRING_EVENT = "inventory.lot.expiring";
const SWEEP_WITHIN_DAYS = 7; // กวาดเตือน lot ที่จะหมดใน 7 วัน

// lot ทั้งหมดของ item เรียงวันหมดอายุใกล้ก่อน (null = ไม่มีวันหมดอายุ → ท้ายสุด)
export async function itemLots(ctx: Ctx, itemId: string) {
  return tenantDb(ctx).invLot.findMany({
    where: { itemId },
    orderBy: { expiryDate: { sort: "asc", nulls: "last" } },
  });
}

// lot คงเหลือ (>0) ของทุก item สำหรับ UI แสดงแบบกดดู → Map itemId → lot[]
export async function lotsByItemMap(ctx: Ctx) {
  const rows = await tenantDb(ctx).invLot.findMany({
    where: { onHand: { gt: 0 } },
    orderBy: { expiryDate: { sort: "asc", nulls: "last" } },
  });
  const map = new Map<string, typeof rows>();
  for (const r of rows) {
    const arr = map.get(r.itemId) ?? [];
    arr.push(r);
    map.set(r.itemId, arr);
  }
  return map;
}

// ค้นสินค้าด้วยบาร์โค้ด (เทียบตรง InvItem.barcode) — ไม่เจอ/บาร์โค้ดว่าง → null
export async function findItemByBarcode(ctx: Ctx, barcode: string) {
  const bc = barcode.trim();
  if (!bc) return null;
  return tenantDb(ctx).invItem.findFirst({ where: { barcode: bc, archivedAt: null } });
}

// lot ที่ยังมีของ (onHand>0) และมีวันหมดอายุ ≤ now+withinDays (รวมที่หมดแล้ว) เรียงใกล้ก่อน
export async function expiringLots(ctx: Ctx, input: { withinDays: number }) {
  const cutoff = new Date(Date.now() + Math.max(0, input.withinDays) * DAY_MS);
  return tenantDb(ctx).invLot.findMany({
    where: { onHand: { gt: 0 }, expiryDate: { lte: cutoff } }, // lte กับ null คอลัมน์ = ตัด null ออกอยู่แล้ว
    orderBy: { expiryDate: "asc" },
  });
}

// ── กวาดแจ้งเตือน lot ใกล้หมดอายุข้ามทุกร้าน (platform-level, เรียกจาก cron) ──
// วนทุก tenant ACTIVE ที่มีระบบ INVENTORY (cap 50) · เจอ lot ใกล้หมด (7 วัน) →
//   AppNotification "สินค้าใกล้หมดอายุ" (body ไทยระบุชื่อสินค้า+lot+วันหมด) + emitOutbox inventory.lot.expiring
// idempotent ต่อวัน BKK: มี notification title นี้ของร้านในวันเดียวกัน (เวลาไทย) แล้ว → ข้าม
// คืนจำนวนร้านที่เพิ่งสร้างแจ้งเตือนรอบนี้ · ร้านไหนพัง catch แล้วไปต่อ (cron ต้องไม่ล้มทั้งรอบ)
export async function sweepExpiringLots(now: Date = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() + SWEEP_WITHIN_DAYS * DAY_MS);
  // ขอบเขตวันตามเวลาไทย (กันปัญหาขอบวัน UTC) สำหรับ idempotent
  const dayKey = now.toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" }); // YYYY-MM-DD
  const dayStart = new Date(`${dayKey}T00:00:00+07:00`);
  const dayEnd = new Date(dayStart.getTime() + DAY_MS);

  // tenant ที่มีระบบ INVENTORY (distinct) → กรอง ACTIVE (cap 50/รอบ)
  const sysRows = await prisma.appSystem.findMany({
    where: { type: "INVENTORY" },
    distinct: ["tenantId"],
    select: { tenantId: true },
  });
  const ids = sysRows.map((r) => r.tenantId);
  if (ids.length === 0) return 0;
  const tenants = await prisma.tenant.findMany({
    where: { id: { in: ids }, status: "ACTIVE" },
    select: { id: true },
    take: 50,
  });

  let notified = 0;
  for (const t of tenants) {
    try {
      // idempotent ต่อวัน BKK — เคยแจ้งวันนี้แล้ว → ข้าม (คืน 0 สำหรับร้านนี้)
      const already = await prisma.appNotification.count({
        where: { tenantId: t.id, title: LOT_EXPIRING_TITLE, createdAt: { gte: dayStart, lt: dayEnd } },
      });
      if (already > 0) continue;

      const lots = await prisma.invLot.findMany({
        where: { tenantId: t.id, onHand: { gt: 0 }, expiryDate: { lte: cutoff } },
        orderBy: { expiryDate: "asc" },
      });
      if (lots.length === 0) continue;

      const items = await prisma.invItem.findMany({
        where: { id: { in: lots.map((l) => l.itemId) } },
        select: { id: true, name: true, unitLabel: true },
      });
      const byId = new Map(items.map((i) => [i.id, i]));
      const lines = lots.map((l) => {
        const it = byId.get(l.itemId);
        const name = it?.name ?? "สินค้า";
        const unit = it?.unitLabel ?? "ชิ้น";
        const exp = l.expiryDate ? formatThaiDate(l.expiryDate) : "-";
        return `• ${name} (ล็อต ${l.lotCode}) หมดอายุ ${exp} · คงเหลือ ${l.onHand.toLocaleString("th-TH")} ${unit}`;
      });
      const body = [`พบสินค้าใกล้หมดอายุภายใน ${SWEEP_WITHIN_DAYS} วัน จำนวน ${lots.length} รายการ`, ...lines].join("\n");

      await prisma.$transaction(async (tx) => {
        await tx.appNotification.create({ data: { tenantId: t.id, title: LOT_EXPIRING_TITLE, body } });
        await emitOutbox(tx, {
          tenantId: t.id,
          type: LOT_EXPIRING_EVENT,
          idempotencyKey: `lot-expiring-${dayKey}`,
          systemId: lots[0].systemId,
          payload: {
            lots: lots.map((l) => ({
              itemId: l.itemId,
              name: byId.get(l.itemId)?.name ?? null,
              lotCode: l.lotCode,
              expiryDate: l.expiryDate,
              onHand: l.onHand,
            })),
          },
        });
      });
      notified += 1;
    } catch {
      // ร้านนี้พัง → ข้ามไปทำร้านถัดไป
    }
  }
  return notified;
}

// ═══════════ หมวดหมู่ · ตั้งค่า SKU/บาร์โค้ด · รูป (13 ส.ค. 2026 · เจ้าของสั่งข้อ 16-17) ═══════════

export type BarcodeType = "NONE" | "EAN13" | "CODE128" | "QR";

/** ตั้งค่าระดับระบบ (สร้างค่าเริ่มต้นให้ถ้ายังไม่มี — lazy เหมือนกระเป๋าเครดิต) */
export async function getSettings(ctx: Ctx) {
  const db = tenantDb(ctx);
  const found = await db.invSettings.findFirst({ where: { systemId: ctx.systemId } });
  if (found) return found;
  return db.invSettings.create({ data: { tenantId: ctx.tenantId, systemId: ctx.systemId } });
}

export async function saveSettings(
  ctx: Ctx,
  patch: { skuAuto?: boolean; skuPrefix?: string; skuPadding?: number; barcodeType?: BarcodeType },
): Promise<{ ok: boolean; reason?: string }> {
  const cur = await getSettings(ctx);
  const prefix = patch.skuPrefix?.trim().toUpperCase();
  if (prefix !== undefined && !/^[A-Z0-9-]{1,10}$/.test(prefix)) {
    return { ok: false, reason: "คำนำหน้า SKU ใช้ได้แค่ A-Z 0-9 และ - (ไม่เกิน 10 ตัว)" };
  }
  await tenantDb(ctx).invSettings.updateMany({
    where: { id: cur.id },
    data: {
      ...(patch.skuAuto !== undefined ? { skuAuto: patch.skuAuto } : {}),
      ...(prefix ? { skuPrefix: prefix } : {}),
      ...(patch.skuPadding !== undefined ? { skuPadding: Math.min(8, Math.max(2, Math.round(patch.skuPadding))) } : {}),
      ...(patch.barcodeType !== undefined ? { barcodeType: patch.barcodeType } : {}),
    },
  });
  return { ok: true };
}

export async function listCategories(ctx: Ctx) {
  return tenantDb(ctx).invCategory.findMany({
    where: { systemId: ctx.systemId },
    orderBy: [{ kind: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
  });
}

export async function saveCategory(
  ctx: Ctx,
  input: {
    id?: string | null;
    name: string;
    kind?: "PRODUCT" | "SERVICE";
    skuPrefix?: string | null;
    barcodeType?: BarcodeType;
    defaultUnitLabel?: string | null;
    defaultPriceBaht?: number | null;
    defaultDurationMin?: number | null;
  },
): Promise<{ ok: boolean; reason?: string; id?: string }> {
  const name = input.name.trim();
  if (!name) return { ok: false, reason: "ตั้งชื่อหมวดหมู่ก่อน" };
  const prefix = input.skuPrefix?.trim().toUpperCase() || null;
  if (prefix && !/^[A-Z0-9-]{1,10}$/.test(prefix)) {
    return { ok: false, reason: "คำนำหน้า SKU ใช้ได้แค่ A-Z 0-9 และ - (ไม่เกิน 10 ตัว)" };
  }
  const data = {
    name,
    kind: input.kind ?? "PRODUCT",
    skuPrefix: prefix,
    ...(input.barcodeType ? { barcodeType: input.barcodeType } : {}),
    defaultUnitLabel: input.defaultUnitLabel?.trim() || null,
    defaultPriceSatang:
      input.defaultPriceBaht != null && Number.isFinite(input.defaultPriceBaht)
        ? Math.max(0, Math.round(input.defaultPriceBaht * 100))
        : null,
    defaultDurationMin:
      input.defaultDurationMin != null && Number.isFinite(input.defaultDurationMin)
        ? Math.max(1, Math.round(input.defaultDurationMin))
        : null,
  };
  const db = tenantDb(ctx);
  try {
    if (input.id) {
      const cur = await db.invCategory.findFirst({ where: { id: input.id } });
      if (!cur) return { ok: false, reason: "ไม่พบหมวดหมู่" };
      await db.invCategory.updateMany({ where: { id: cur.id }, data });
      return { ok: true, id: cur.id };
    }
    const row = await db.invCategory.create({ data: { ...ctx, ...data } });
    return { ok: true, id: row.id };
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { ok: false, reason: "มีหมวดหมู่ชื่อนี้อยู่แล้ว" };
    }
    throw e;
  }
}

/** ลบหมวดหมู่ — ของที่อยู่ในหมวดนี้ไม่ถูกลบ แค่หลุดหมวด (ห้ามทำข้อมูลสินค้าหาย) */
export async function removeCategory(ctx: Ctx, id: string): Promise<{ ok: boolean; moved: number }> {
  const db = tenantDb(ctx);
  const moved = await db.invItem.updateMany({ where: { categoryId: id }, data: { categoryId: null } });
  await db.invCategory.deleteMany({ where: { id } });
  return { ok: true, moved: moved.count };
}

/**
 * SKU อัตโนมัติ: <คำนำหน้าของหมวด หรือของระบบ>-<เลขลำดับ zero-pad>
 * เดินเลขจนไม่ชนของเดิม (unique [systemId, sku]) — ร้านที่เคยตั้ง SKU มือไว้แล้วจึงไม่พัง
 */
export async function nextSku(ctx: Ctx, categoryId?: string | null): Promise<string> {
  const st = await getSettings(ctx);
  const cat = categoryId ? await tenantDb(ctx).invCategory.findFirst({ where: { id: categoryId } }) : null;
  const prefix = (cat?.skuPrefix || st.skuPrefix).toUpperCase();
  const db = tenantDb(ctx);
  let seq = st.nextSeq;
  for (let i = 0; i < 500; i++) {
    const sku = `${prefix}-${String(seq).padStart(st.skuPadding, "0")}`;
    const dup = await db.invItem.findFirst({ where: { sku }, select: { id: true } });
    if (!dup) {
      await db.invSettings.updateMany({ where: { id: st.id }, data: { nextSeq: seq + 1 } });
      return sku;
    }
    seq++;
  }
  return `${prefix}-${Date.now().toString().slice(-6)}`;
}

// ── รูปของสินค้า/บริการ (ข้อ 16) ──
export async function listItemImages(ctx: Ctx, itemId: string) {
  return tenantDb(ctx).invItemImage.findMany({
    where: { itemId },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
}

export async function addItemImage(
  ctx: Ctx,
  itemId: string,
  input: { url: string; alt?: string | null },
): Promise<{ ok: boolean; reason?: string; id?: string }> {
  const item = await tenantDb(ctx).invItem.findFirst({ where: { id: itemId } });
  if (!item) return { ok: false, reason: "ไม่พบสินค้า/บริการ" };
  const url = input.url.trim();
  // รับเฉพาะลิงก์ที่ปลอดภัย (บทเรียน stored XSS จากไฟล์แนบเคส support 31 ก.ค.)
  if (!/^https?:\/\//i.test(url)) return { ok: false, reason: "ลิงก์รูปต้องเป็น http(s)" };
  const count = await tenantDb(ctx).invItemImage.count({ where: { itemId } });
  if (count >= 8) return { ok: false, reason: "เก็บรูปได้ไม่เกิน 8 รูปต่อรายการ" };
  const row = await tenantDb(ctx).invItemImage.create({
    data: { ...ctx, itemId, url, alt: input.alt?.trim() || null, sortOrder: count },
  });
  return { ok: true, id: row.id };
}

export async function removeItemImage(ctx: Ctx, imageId: string): Promise<{ ok: boolean }> {
  await tenantDb(ctx).invItemImage.deleteMany({ where: { id: imageId } });
  return { ok: true };
}

/** เลื่อนลำดับรูป (รูปแรก = รูปหลักที่โผล่ในหน้าขาย/หน้าจอง) */
export async function setPrimaryImage(ctx: Ctx, itemId: string, imageId: string): Promise<{ ok: boolean }> {
  const db = tenantDb(ctx);
  const imgs = await db.invItemImage.findMany({ where: { itemId }, orderBy: { sortOrder: "asc" } });
  let order = 1;
  // ยิงเป็นชุดเดียว (เดิม await ทีละรูป = สูงสุด 8 รอบเดินทางไป DB ต่อการกด "ตั้งเป็นรูปหลัก" 1 ครั้ง)
  const writes = imgs.map((img) =>
    db.invItemImage.updateMany({ where: { id: img.id }, data: { sortOrder: img.id === imageId ? 0 : order++ } }),
  );
  if (writes.length) await db.$transaction(writes);
  return { ok: true };
}
