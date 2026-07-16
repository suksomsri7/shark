import { Prisma } from "@prisma/client";
import { tenantDb } from "@/lib/core/db";
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
};

export async function receive(ctx: Ctx, input: ReceiveInput): Promise<{ id: string }> {
  const qty = Math.round(input.qty);
  const inCost = Math.max(0, Math.round(input.costSatang));
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

    const mv = await tx.invMovement.create({
      data: {
        tenantId: ctx.tenantId,
        systemId: ctx.systemId,
        itemId: item.id,
        type: "IN",
        locationId: locId,
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
};

export async function consume(ctx: Ctx, input: ConsumeInput): Promise<{ id: string }> {
  const qty = Math.round(input.qty);
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

    const mv = await tx.invMovement.create({
      data: {
        tenantId: ctx.tenantId,
        systemId: ctx.systemId,
        itemId: item.id,
        type: "OUT",
        locationId: locId,
        qtyDelta: -qty,
        balanceAfter: newOnHand,
        costSatang: item.costSatang,
        sourceModule: input.sourceModule?.trim() || null,
        refType: input.refType?.trim() || null,
        refId: input.refId?.trim() || null,
        idempotencyKey: input.idempotencyKey,
        note: input.note?.trim() || null,
        // ตัดจนติดลบ = ตั้งธงให้ร้านมาเคลียร์ (ขายไปก่อน ไม่ block)
        needsReview: isNegative(newOnHand),
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
