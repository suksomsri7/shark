import { Prisma } from "@prisma/client";
import { prisma, tenantDb } from "@/lib/core/db";
import { emitOutbox } from "@/lib/core/outbox";
import { formatThaiDate } from "@/lib/ui/date";
import { isNegative, movingAvgCost, needsReorder } from "./rules";

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

// get-or-create คลัง default (isDefault ชื่อ "คลังหลัก") — race-safe ผ่าน unique [systemId,name]
async function getOrCreateDefaultLocation(db: Db, ctx: Ctx): Promise<{ id: string }> {
  const found = await db.invLocation.findFirst({ where: { isDefault: true, archivedAt: null } });
  if (found) return { id: found.id };
  try {
    const created = await db.invLocation.create({
      data: { tenantId: ctx.tenantId, systemId: ctx.systemId, name: DEFAULT_LOCATION_NAME, isDefault: true },
    });
    return { id: created.id };
  } catch (e) {
    // ชนกับคนสร้างพร้อมกัน → refind ตามชื่อ (unique [systemId,name])
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      const again = await db.invLocation.findFirst({ where: { name: DEFAULT_LOCATION_NAME } });
      if (again) return { id: again.id };
    }
    throw e;
  }
}

// lazy seed: ถ้า item ยังไม่มีแถวสต็อกเลย → สร้างแถวคลัง default ด้วย onHand ปัจจุบัน (ก่อน apply delta)
async function seedDefaultStockIfNeeded(db: Db, ctx: Ctx, item: { id: string; onHand: number }): Promise<void> {
  const count = await db.invLocationStock.count({ where: { itemId: item.id } });
  if (count > 0) return;
  const def = await getOrCreateDefaultLocation(db, ctx);
  await db.invLocationStock.create({
    data: { tenantId: ctx.tenantId, systemId: ctx.systemId, itemId: item.id, locationId: def.id, onHand: item.onHand },
  });
}

// ปรับสต็อกคลังหนึ่งด้วย delta (find→update/create — ห้าม upsert) คืนยอดคงเหลือหลังปรับ
async function applyLocationDelta(db: Db, ctx: Ctx, itemId: string, locationId: string, delta: number): Promise<number> {
  const row = await db.invLocationStock.findFirst({ where: { itemId, locationId } });
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
  const existing = await db.invLot.findFirst({ where: { itemId, lotCode } });
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

// resolve locationId ที่จะใช้จริง: ส่งมา = ใช้ตามนั้น · ไม่ส่ง = คลัง default
async function resolveLocationId(db: Db, ctx: Ctx, locationId?: string | null): Promise<string> {
  const id = locationId?.trim();
  if (id) return id;
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
      reorderPoint: Math.max(0, Math.round(input.reorderPoint ?? 0)),
      costSatang: Math.max(0, Math.round(input.costSatang ?? 0)),
      // onHand = 0 (default ใน schema)
    },
  });
  return { id: it.id };
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
  unitLabel: string;
  reorderPoint: number;
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

  if (Object.keys(data).length === 0) return { id: itemId };

  try {
    await db.invItem.update({ where: { id: item.id }, data });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")
      throw new Error("มีสินค้ารหัส (SKU) นี้อยู่แล้ว");
    throw e;
  }
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
  const qty = Math.round(input.qty);
  const inCost = Math.max(0, Math.round(input.costSatang));
  const lotCode = input.lotCode?.trim() || null;
  const db = tenantDb(ctx);

  return db.$transaction(async (tx) => {
    const txc = tx as unknown as Db;
    // idempotent guard — key เดิมเคยบันทึกแล้ว → คืนรายการเดิม ไม่แตะสต็อก
    const dup = await tx.invMovement.findFirst({ where: { idempotencyKey: input.idempotencyKey } });
    if (dup) return { id: dup.id };

    const item = await tx.invItem.findFirst({ where: { id: input.itemId } });
    if (!item) throw new Error("ไม่พบสินค้าในคลัง");

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

    const mv = await tx.invMovement.create({
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
    return { id: mv.id };
  });
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
  const qty = Math.round(input.qty);
  const lotCode = input.lotCode?.trim() || null;
  const db = tenantDb(ctx);

  return db.$transaction(async (tx) => {
    const txc = tx as unknown as Db;
    const dup = await tx.invMovement.findFirst({ where: { idempotencyKey: input.idempotencyKey } });
    if (dup) return { id: dup.id };

    const item = await tx.invItem.findFirst({ where: { id: input.itemId } });
    if (!item) throw new Error("ไม่พบสินค้าในคลัง");

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

    const mv = await tx.invMovement.create({
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
    return { id: mv.id };
  });
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
    where: { archivedAt: null },
    orderBy: { onHand: "asc" },
  });
  return items.filter((i) => needsReorder(i.onHand, i.reorderPoint));
}

// ── reads สำหรับ UI ──
export async function listItems(ctx: Ctx, take = 200) {
  return tenantDb(ctx).invItem.findMany({
    where: { archivedAt: null },
    orderBy: { createdAt: "desc" },
    take,
  });
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
