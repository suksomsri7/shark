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
};

export async function receive(ctx: Ctx, input: ReceiveInput): Promise<{ id: string }> {
  const qty = Math.round(input.qty);
  const inCost = Math.max(0, Math.round(input.costSatang));
  const db = tenantDb(ctx);

  return db.$transaction(async (tx) => {
    // idempotent guard — key เดิมเคยบันทึกแล้ว → คืนรายการเดิม ไม่แตะสต็อก
    const dup = await tx.invMovement.findFirst({ where: { idempotencyKey: input.idempotencyKey } });
    if (dup) return { id: dup.id };

    const item = await tx.invItem.findFirst({ where: { id: input.itemId } });
    if (!item) throw new Error("ไม่พบสินค้าในคลัง");

    const newOnHand = item.onHand + qty;
    // ต้นทุนถัวเฉลี่ยจากกติกา — ตัดออกไม่กระทบต้นทุน, รับเข้าเท่านั้นที่ถัวเฉลี่ย
    const newCost = movingAvgCost(item.onHand, item.costSatang, qty, inCost);

    await tx.invItem.update({
      where: { id: item.id },
      data: { onHand: newOnHand, costSatang: newCost },
    });

    const mv = await tx.invMovement.create({
      data: {
        tenantId: ctx.tenantId,
        systemId: ctx.systemId,
        itemId: item.id,
        type: "IN",
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
  sourceModule: string;
  refType: string;
  refId: string;
  idempotencyKey: string;
  note?: string | null;
};

export async function consume(ctx: Ctx, input: ConsumeInput): Promise<{ id: string }> {
  const qty = Math.round(input.qty);
  const db = tenantDb(ctx);

  return db.$transaction(async (tx) => {
    const dup = await tx.invMovement.findFirst({ where: { idempotencyKey: input.idempotencyKey } });
    if (dup) return { id: dup.id };

    const item = await tx.invItem.findFirst({ where: { id: input.itemId } });
    if (!item) throw new Error("ไม่พบสินค้าในคลัง");

    const newOnHand = item.onHand - qty;

    await tx.invItem.update({
      where: { id: item.id },
      data: { onHand: newOnHand }, // ตัดออกไม่กระทบต้นทุนถัวเฉลี่ย
    });

    const mv = await tx.invMovement.create({
      data: {
        tenantId: ctx.tenantId,
        systemId: ctx.systemId,
        itemId: item.id,
        type: "OUT",
        qtyDelta: -qty,
        balanceAfter: newOnHand,
        costSatang: item.costSatang,
        sourceModule: input.sourceModule.trim() || null,
        refType: input.refType.trim() || null,
        refId: input.refId.trim() || null,
        idempotencyKey: input.idempotencyKey,
        note: input.note?.trim() || null,
        // ตัดจนติดลบ = ตั้งธงให้ร้านมาเคลียร์ (ขายไปก่อน ไม่ block)
        needsReview: isNegative(newOnHand),
      },
    });
    return { id: mv.id };
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
