import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma, tenantDb } from "@/lib/core/db";
import { cell, columnIndex, type CsvTable, type ImportSummary } from "@/lib/core/csv";
import { emitOutbox } from "@/lib/core/outbox";
import { formatThaiDate } from "@/lib/ui/date";
import { isNegative, movingAvgCost, needsReorder } from "./rules";
import { bridgeInventoryMovement, bridgeItemToAccountProduct, type MovementForGl } from "./account-bridge";
// POS P1.1b ▸ G2: คำสั่งเขียน InvItem (ข้อมูล/ราคา/เก็บถาวร/ลิงก์บัญชี) ย้ายไป catalog-legacy — InvItem + แคตตาล็อก POS ในธุรกรรมเดียว ◂
import * as legacy from "@/lib/modules/pos/catalog-legacy";

// Inventory (ระบบ 18) — สต็อกกลาง + movement ledger (contract C-1)
// ⚠️ กติกาทั้งหมดมาจาก rules.ts (สมอง FREEZE) — ที่นี่แค่เรียกใช้ + ผูก DB
//    ห้าม hardcode: ต้นทุนถัวเฉลี่ย · เกณฑ์แจ้งเตือน · เกณฑ์ติดลบ
// scope: ใช้ tenantDb({ tenantId, systemId }) — inject tenantId+systemId ทุก query
//    (defense-in-depth · InvItem/InvMovement เป็น system-scoped ใน scope.ts)
// source of truth = ledger (InvMovement) · InvItem.onHand เป็น cache ที่ sync ในทุก movement
//    (อยู่ใน tx เดียวกับการ append ledger เสมอ → balanceAfter = onHand หลังรายการ)
//    🔴 HF-INV-1: ทุกการเขียนสต็อกล็อกแถว InvItem ก่อนอ่านยอด (lockItemForStock/lockItemsInTx) — ห้ามเพิ่มจุดเขียนใหม่ที่ไม่ล็อก

/** POS P1.1b R2 F9: actorUserId (ไม่บังคับ) = ผู้กระทำจริง → audit ของแคตตาล็อก (ไม่ใช้ตรวจสิทธิ์) */
export type Ctx = { tenantId: string; systemId: string; actorUserId?: string };

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

// ═══════════ HF-INV-1 (D1) — ล็อกแถวสินค้าก่อนแตะสต็อก (กันยอดหายเมื่อมีหลายรายการพร้อมกัน) ═══════════
// เดิม: อ่าน onHand/ต้นทุน → คำนวณใน JS → เขียนค่าสัมบูรณ์ทับ โดยไม่มีล็อก ⇒ 2 รายการพร้อมกันอ่านค่าเดียวกัน
//   แล้วเขียนทับกัน = ยอดหาย · รับเข้าทั้งก้อนหายพร้อมต้นทุน · balanceAfter ซ้ำ · Σคลัง ≠ ยอดรวม (วัดจริงบน QC4)
// ตอนนี้: ทุกจุดที่เขียนสต็อกของสินค้า 1 ตัว (onHand · ต้นทุนถัวเฉลี่ย · แถวคลัง · lot · movement) ล็อกแถว InvItem
//   ด้วย `SELECT … FOR NO KEY UPDATE` (R3.1) ใน tx เดียวกับที่เขียน **ก่อน** อ่านยอด ⇒ รายการที่สองรอจนรายการแรก commit
//   แล้วจึงอ่านค่าใหม่ (READ COMMITTED อ่านใหม่ทุกคำสั่ง) — ตรรกะอ่าน-คำนวณ-เขียนเดิมจึงถูกต้องโดยไม่ต้องรื้อ
//   (ค่าเฉลี่ยเคลื่อนที่ต้องใช้ยอดก่อนรับ ⇒ `increment` อย่างเดียวไม่พอ ต้องล็อก)
// ล็อกหลายตัวใน tx เดียว: `lockItemsInTx` เรียง id (COLLATE "C") แล้วล็อกในคำสั่งเดียว — ผู้เรียกที่แตะหลายสินค้า
//   ใน tx เดียว (ใบเบิกบัญชี · ตัดส่วนประกอบชุด) ต้องเรียกตัวนี้ **ก่อน** แตะสินค้าตัวใด ⇒ ทุก tx ล็อกตามลำดับเดียวกัน
//   = ไม่มีวงล็อก (deadlock) · ล็อกซ้ำตัวที่ถือไว้แล้วใน tx เดียวกันไม่มีผล
type LockedItem = { id: string; name: string; kind: string; onHand: number; costSatang: number };

// 🔴 HF-INV-1 R2.2 → R3.2: เพดานรอ "เฉพาะตอนขอล็อกสต็อก" — ตั้งด้วย set_config(…, true) = SET LOCAL (อยู่แค่ใน tx นี้
//    · ห้าม SET ระดับ session: บน pooler รั่วไปถึง client อื่น) แล้ว "คืนค่าเดิม" ทันทีหลังได้ล็อกครบ ในคำสั่งเดียวกัน
//    (ไม่เพิ่มรอบเดินทาง) ⇒ คำสั่งที่เหลือของ tx (GL · เลขที่เอกสาร · แถวอื่น) ไม่ถูกเพดานนี้ตัด (รอบ 2 ค้าง 5 วิ ทั้ง tx)
//    ลำดับในคำสั่ง: prev (จำค่าเดิม) → lt (ตั้งเพดาน · ประเมินก่อนแถวใดถึงขั้นล็อก) → locked (ล็อกครบทุกแถว)
//    → restore (นับแถวที่ล็อกให้ครบก่อน แล้วคืนค่าเดิม) → ส่งแถวออก (LEFT JOIN จาก restore ⇒ restore ถูกประเมินเสมอ แม้ไม่มีแถว)
//    งบ: ตัวห่อที่โมดูลคลังเปิด tx เอง = 5 วิ + ลองใหม่ 1 ครั้ง · lockItemsInTx ของเอกสารบัญชี (ไม่มีตัวห่อลองใหม่) = 15 วิ
// 🔴 HF-INV-1 R3.1: ล็อกแบบ FOR NO KEY UPDATE (ไม่ใช่ FOR UPDATE) — ผู้เขียนสต็อกยังเรียงคิวกันเหมือนเดิม (NO KEY UPDATE ชนกันเอง
//    และ UPDATE คอลัมน์ที่ไม่ใช่คีย์ก็ถือล็อกระดับนี้) แต่ไม่ชนกับ FOR KEY SHARE ที่ FK insert ถือไว้ (บรรทัดเอกสาร/movement
//    ที่อ้างแถวนี้) ⇒ ใบเบิกที่แทรกบรรทัดแล้วรอสินค้า กับการตัดชุดที่ถือสินค้าแล้วรอแถวสินค้าบัญชี ไม่วงล็อกกันอีก
const STOCK_LOCK_WAIT_WRAPPER = "5s";
const STOCK_LOCK_WAIT_ACCOUNT_DOC = "15s";
// ล็อก + อ่านสินค้า 1 ตัวในคำสั่งเดียว (แทน findFirst เดิม — ไม่เพิ่มรอบเดินทาง) · ไม่พบ/ข้ามร้าน/ข้ามระบบ → null
async function lockItemForStock(db: Db, ctx: Ctx, itemId: string): Promise<LockedItem | null> {
  const rows = await db.$queryRaw<(LockedItem | { id: null })[]>`
    WITH prev AS MATERIALIZED (SELECT current_setting('lock_timeout') AS v),
    lt AS MATERIALIZED (SELECT set_config('lock_timeout', ${STOCK_LOCK_WAIT_WRAPPER}, true) AS v FROM prev),
    locked AS MATERIALIZED (
      SELECT i."id", i."name", i."kind"::text AS "kind", i."onHand", i."costSatang"
      FROM "InvItem" i, lt
      WHERE i."id" = ${itemId} AND i."tenantId" = ${ctx.tenantId} AND i."systemId" = ${ctx.systemId}
      FOR NO KEY UPDATE OF i
    ),
    restore AS MATERIALIZED (
      SELECT set_config('lock_timeout', (SELECT v FROM prev), true) AS v FROM (SELECT count(*) FROM locked) c
    )
    SELECT l.* FROM restore LEFT JOIN locked l ON true`;
  return (rows.find((r) => r.id !== null) as LockedItem | undefined) ?? null;
}

/**
 * HF-INV-1 — ล็อกสินค้าหลายตัวตามลำดับ id ที่ตายตัว ภายใน tx ของผู้เรียก (กัน deadlock ของ tx ที่แตะหลายสินค้า)
 * เรียกก่อน `consumeInTx`/`receiveInTx` ตัวแรกของ tx นั้น · id ซ้ำ/ว่างตัดทิ้ง · id ที่ไม่มีในระบบนี้ข้ามเงียบ
 * R3.2: รอล็อกได้ไม่เกิน 15 วิ (เอกสารบัญชีไม่มีตัวห่อลองใหม่) · หลังได้ล็อก lock_timeout ของ tx กลับเป็นค่าเดิม
 */
export async function lockItemsInTx(tx: Db, ctx: Ctx, itemIds: readonly string[]): Promise<void> {
  const ids = [...new Set(itemIds.filter((x) => typeof x === "string" && x))].sort();
  if (ids.length === 0) return;
  await tx.$queryRaw`
    WITH prev AS MATERIALIZED (SELECT current_setting('lock_timeout') AS v),
    lt AS MATERIALIZED (SELECT set_config('lock_timeout', ${STOCK_LOCK_WAIT_ACCOUNT_DOC}, true) AS v FROM prev),
    locked AS MATERIALIZED (
      SELECT i."id" FROM "InvItem" i, lt
      WHERE i."tenantId" = ${ctx.tenantId} AND i."systemId" = ${ctx.systemId} AND i."id" IN (${Prisma.join(ids)})
      ORDER BY i."id" COLLATE "C"
      FOR NO KEY UPDATE OF i
    ),
    restore AS MATERIALIZED (
      SELECT set_config('lock_timeout', (SELECT v FROM prev), true) AS v FROM (SELECT count(*) FROM locked) c
    )
    SELECT l."id" FROM restore LEFT JOIN locked l ON true`;
}

// 🔴 HF-INV-1 R3.5: idempotencyKey ซ้ำ "แต่ข้อมูลไม่ตรง" (คนละสินค้า · คนละทิศ · คนละจำนวน) — เดิมคืนรายการแรกเหมือนว่า
//    รายการนี้บันทึกแล้ว (ผู้เรียกเข้าใจว่าตัด/รับแล้วทั้งที่ไม่ได้ทำ) และคีย์เดียวกันพร้อมกันบนสองสินค้าหลุด P2002 ดิบ
//    ⇒ โยน error ชนิดนี้ (รหัสคงที่ · ข้อความไทยไม่โทษผู้ใช้) · คีย์เดิม + ข้อมูลเดิม = คืนรายการเดิมเหมือนเดิม
export const STOCK_KEY_CONFLICT_CODE = "INV_IDEMPOTENCY_CONFLICT";
export class StockKeyConflictError extends Error {
  readonly code = STOCK_KEY_CONFLICT_CODE;
  constructor(options?: { cause?: unknown }) {
    super(
      "รหัสอ้างอิงของรายการสต็อกนี้ตรงกับรายการที่บันทึกไว้แล้ว แต่สินค้า ทิศทาง หรือจำนวนไม่ตรงกัน — ระบบยังไม่บันทึกรายการนี้ กรุณาตรวจประวัติสต็อกก่อนทำรายการใหม่",
      options,
    );
    this.name = "StockKeyConflictError";
  }
}
type DupMovement = { itemId: string; type: string; qtyDelta: number; balanceAfter: number };
// รายการเดิมของคีย์นี้ตรงกับที่ขอไหม — ตรง = คืนรายการเดิม (idempotent) · ไม่ตรง = โยน StockKeyConflictError
function sameMovementOrThrow<T extends DupMovement>(dup: T, want: { itemId: string; type: "IN" | "OUT" | "ADJUST"; qtyDelta?: number; balanceAfter?: number }): T {
  const same =
    dup.itemId === want.itemId &&
    dup.type === want.type &&
    (want.qtyDelta === undefined || dup.qtyDelta === want.qtyDelta) &&
    (want.balanceAfter === undefined || dup.balanceAfter === want.balanceAfter);
  if (!same) throw new StockKeyConflictError();
  return dup;
}
// insert movement ชน unique (tenantId, idempotencyKey) = คีย์เดียวกันถูกใช้พร้อมกันกับสินค้าอื่น (ล็อกเป็นรายสินค้า
//   จึงไม่เรียงคิวกัน) ⇒ แปลงเป็น error ชนิดเดียวกัน แทน P2002 ดิบ (InvMovement มี unique เดียวนอกจาก id)
function rethrowKeyConflict(e: unknown): never {
  if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") throw new StockKeyConflictError({ cause: e });
  throw e;
}

// รอล็อกนานเกิน/ชนกันจนฐานข้อมูลยกเลิก tx — tx ที่โมดูลคลังเปิดเองลองใหม่ได้ 1 ครั้ง (idempotencyKey กันซ้ำอยู่แล้ว)
// ครั้งที่สองยังไม่ผ่าน → ข้อความไทยให้ลองใหม่ (ไม่ใช่ 500 · ไม่โทษผู้ใช้)
const STOCK_BUSY_MESSAGE = "สินค้านี้กำลังถูกบันทึกสต็อกจากหลายรายการพร้อมกัน — รายการนี้ยังไม่ถูกบันทึก กรุณาลองใหม่อีกครั้ง";
const CONTENTION_CODES = new Set(["40P01", "55P03", "40001", "P2034", "P2028"]);
const CONTENTION_RE = /deadlock detected|lock timeout|could not obtain lock|expired transaction|transaction already closed|unable to start a transaction/i;

// คืน "รหัส" ของการชนกัน (SQLSTATE/รหัส Prisma) ถ้าเป็นการชนกันของล็อก/tx · ไม่ใช่ → null
function stockContentionCode(e: unknown): string | null {
  let cur: unknown = e;
  let byMessage: string | null = null;
  for (let depth = 0; depth < 5 && cur && typeof cur === "object"; depth++) {
    const o = cur as { code?: unknown; originalCode?: unknown; kind?: unknown; message?: unknown; cause?: unknown; meta?: unknown };
    const hit = [o.originalCode, o.code].find((c): c is string => typeof c === "string" && CONTENTION_CODES.has(c));
    if (hit) return hit;
    if (o.kind === "TransactionWriteConflict") return "P2034";
    if (!byMessage && typeof o.message === "string" && CONTENTION_RE.test(o.message)) {
      byMessage = /deadlock/i.test(o.message) ? "40P01" : /lock timeout|could not obtain lock/i.test(o.message) ? "55P03" : "P2028";
    }
    const meta = o.meta && typeof o.meta === "object" ? (o.meta as { driverAdapterError?: unknown }) : null;
    cur = o.cause ?? meta?.driverAdapterError;
  }
  return byMessage;
}

// R2.2: ลองใหม่ต้อง "มองเห็นได้" — log เฉพาะรหัส/ชนิดงาน/รหัสสินค้า (ไม่มี payload · ไม่มีข้อมูลลูกค้า)
//   ครั้งที่สองยังชน → ข้อความไทย โดยเก็บข้อผิดพลาดจริงไว้ใน cause ให้ไล่ต่อได้
async function withStockRetry<T>(op: string, itemId: string, run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (e) {
    const code = stockContentionCode(e);
    if (!code) throw e;
    console.warn("[inventory] stock write contention — retrying", { code, op, itemId });
  }
  try {
    return await run();
  } catch (e) {
    if (stockContentionCode(e)) throw new Error(STOCK_BUSY_MESSAGE, { cause: e });
    throw e;
  }
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
  // POS P1.1b: + แถวแคตตาล็อกของ POS ที่ขายคลังนี้ (ensureForInvItem) ในธุรกรรมเดียว — BUSY (backfill ถือล็อกร้าน) = ทั้งก้อนไม่บันทึก แล้ว throw ข้อความไทย
  const it = await prisma.$transaction((tx) =>
    legacy.createInvItem(tx, ctx, {
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
    }, ctx.actorUserId),
  );
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
    await prisma.$transaction((tx) => legacy.updateInvItem(tx, ctx, item.id, data as Prisma.InvItemUncheckedUpdateInput, ctx.actorUserId));
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
    await prisma.$transaction((tx) => legacy.setInvItemArchived(tx, ctx, item.id, true, ctx.actorUserId));
  }
  return { id: itemId };
}

// ── เปิดใช้งานสินค้าอีกครั้ง (unarchive) ──
export async function unarchiveItem(ctx: Ctx, itemId: string): Promise<{ id: string }> {
  const db = tenantDb(ctx);
  const item = await db.invItem.findFirst({ where: { id: itemId } });
  if (!item) throw new Error("ไม่พบสินค้าในคลัง");
  if (item.archivedAt) {
    // G6: แถวแคตตาล็อกกลับมาขาย (catalog.restore — ensureForInvItem ไม่ปลดเก็บถาวรเอง)
    await prisma.$transaction((tx) => legacy.setInvItemArchived(tx, ctx, item.id, false, ctx.actorUserId));
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
  const mv = await withStockRetry("receive", input.itemId, () => db.$transaction((tx) => receiveInTx(tx as unknown as Db, ctx, input)));
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
    const want = { itemId: input.itemId, type: "IN" as const, qtyDelta: qty }; // R3.5: คีย์ซ้ำต้องข้อมูลตรงด้วย
    const dup = await tx.invMovement.findFirst({ where: { tenantId: ctx.tenantId, idempotencyKey: input.idempotencyKey } });
    if (dup) return sameMovementOrThrow(dup, want);

    // 🔴 HF-INV-1: ล็อกแถวสินค้าก่อนอ่านยอด/ต้นทุน (ดูหัวข้อ HF-INV-1 ด้านบน)
    const item = await lockItemForStock(txc, ctx, input.itemId);
    if (!item) throw new Error("ไม่พบสินค้าในคลัง");
    // key เดียวกันที่อีก tx เพิ่ง commit ระหว่างที่เรารอล็อก → คืนรายการเดิม (ไม่รับซ้ำ · ไม่ชน unique)
    const dupAfterLock = await tx.invMovement.findFirst({ where: { tenantId: ctx.tenantId, idempotencyKey: input.idempotencyKey } });
    if (dupAfterLock) return sameMovementOrThrow(dupAfterLock, want);
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
    }).catch(rethrowKeyConflict); // R3.5(d)
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
  const mv = await withStockRetry("consume", input.itemId, () => db.$transaction((tx) => consumeInTx(tx as unknown as Db, ctx, input)));
  // perpetual: รับรู้ต้นทุนขาย (นอก tx · idempotent ต่อ movement) — ไม่มีระบบ ACCOUNT = ข้าม
  await postMovementGl(ctx, mv);
  // WO 4.2: ตัดสต็อกจาก POS/ฝั่งขาย → กระจก `AccountProduct.qtyOnHand` ต้องตามทัน
  //   (หนี้ข้อ 4 ของ WO 4.1: เดิม sync เฉพาะตอนรับเข้า/แก้ item ⇒ ขายผ่าน POS แล้วกระจกค้างที่ยอดเก่า)
  await syncLinkedAccountProduct(ctx, mv.itemId);
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
    const want = { itemId: input.itemId, type: "OUT" as const, qtyDelta: -qty }; // R3.5: คีย์ซ้ำต้องข้อมูลตรงด้วย
    const dup = await tx.invMovement.findFirst({ where: { tenantId: ctx.tenantId, idempotencyKey: input.idempotencyKey } });
    if (dup) return sameMovementOrThrow(dup, want);

    // 🔴 HF-INV-1: ล็อกแถวสินค้าก่อนอ่านยอด (ดูหัวข้อ HF-INV-1 ด้านบน)
    const item = await lockItemForStock(txc, ctx, input.itemId);
    if (!item) throw new Error("ไม่พบสินค้าในคลัง");
    // key เดียวกันที่อีก tx เพิ่ง commit ระหว่างที่เรารอล็อก → คืนรายการเดิม (ไม่ตัดซ้ำ · ไม่ชน unique)
    const dupAfterLock = await tx.invMovement.findFirst({ where: { tenantId: ctx.tenantId, idempotencyKey: input.idempotencyKey } });
    if (dupAfterLock) return sameMovementOrThrow(dupAfterLock, want);
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
    }).catch(rethrowKeyConflict); // R3.5(d)
  }
}

// POS P2.3 ▸ ตัดออกหลายรายการใน tx เดียว (consumeBatch) — ผู้เรียก: POS ตัดสต็อกของบิล (1 ชุดต่อบิล · C-1) · โน้ตเจ้าของโมดูลคลังใน ledger/POS-OWNER-PENDING.md
//   ทำไม: บิลที่มีสูตร (BOM) ตัดวัตถุดิบหลายตัวต่อบรรทัด — เดิมตัดทีละส่วน (tx ละส่วน) ⇒ ล็อกพลาดกลางทาง = บิลตัดครึ่งเดียว
//   กติกา: tx เดียว · ล็อกทุกสินค้าตามลำดับ id ตายตัว (lockItemsInTx) ก่อนแตะตัวใด ⇒ ไม่มีวงล็อก · consumeInTx ต่อส่วนด้วยคีย์ของส่วนนั้น
//     (แถว movement เหมือนตัดทีละส่วนทุกค่า) · ส่วนที่สินค้าไม่มีในระบบคลังนี้ / เป็นบริการ = ข้าม (คืนใน skipped · ไม่ล้มทั้งชุด)
//     ล็อกชนกัน = ลองใหม่ทั้งชุด 1 ครั้ง (withStockRetry) · ล้มทั้งชุด = ไม่มีส่วนใดถูกตัด (ผู้เรียกนับเป็น "ค้างตัด" แล้วลองใหม่ได้)
//     หลัง commit: GL ต่อ movement (รวมคีย์เดิมที่เคยตัดในtx ของบิลแบบ BLOCK — GL idempotent ต่อ movement) + sync สินค้าบัญชีต่อสินค้า
//   idempotent: เรียกซ้ำด้วยคีย์เดิม = movementIds เดิม ไม่มีแถวเพิ่ม
export type ConsumeBatchPart = { itemId: string; qty: number; idempotencyKey: string };
export type ConsumeBatchInput = { sourceModule?: string | null; refType?: string | null; refId?: string | null; parts: ConsumeBatchPart[] };
export type ConsumeBatchSkip = { itemId: string; key: string; reason: "NOT_FOUND" | "SERVICE" };
export type ConsumeBatchResult = { movementIds: string[]; skipped: ConsumeBatchSkip[] };
/** เพดานต่อชุด (กันคำขอใหญ่ผิดปกติ — บิล POS ≤ 200 บรรทัด × ≤ 50 ส่วน) */
const CONSUME_BATCH_MAX_PARTS = 10_000;

export async function consumeBatch(ctx: Ctx, input: ConsumeBatchInput): Promise<ConsumeBatchResult> {
  const parts = (input.parts ?? []).filter((p) => p && typeof p.itemId === "string" && p.itemId && typeof p.idempotencyKey === "string" && p.idempotencyKey);
  if (parts.length === 0) return { movementIds: [], skipped: [] };
  if (parts.length > CONSUME_BATCH_MAX_PARTS) throw new Error(`ตัดสต็อกชุดเดียวได้ไม่เกิน ${CONSUME_BATCH_MAX_PARTS} รายการ`);
  const db = tenantDb(ctx);
  const ids = [...new Set(parts.map((p) => p.itemId))].sort();
  const run = () =>
    db.$transaction(
      async (tx) => {
        const txc = tx as unknown as Db;
        await lockItemsInTx(txc, ctx, ids);
        const found = await txc.invItem.findMany({ where: { ...scope(ctx), id: { in: ids } }, select: { id: true, kind: true } });
        const kindOf = new Map(found.map((i) => [i.id, String(i.kind)]));
        const rows: MovementRow[] = [];
        const skipped: ConsumeBatchSkip[] = [];
        for (const p of parts) {
          const kind = kindOf.get(p.itemId);
          if (kind === undefined) {
            skipped.push({ itemId: p.itemId, key: p.idempotencyKey, reason: "NOT_FOUND" });
            continue;
          }
          if (kind === "SERVICE") {
            skipped.push({ itemId: p.itemId, key: p.idempotencyKey, reason: "SERVICE" });
            continue;
          }
          rows.push(
            await consumeInTx(txc, ctx, {
              itemId: p.itemId,
              qty: p.qty,
              sourceModule: input.sourceModule ?? null,
              refType: input.refType ?? null,
              refId: input.refId ?? null,
              idempotencyKey: p.idempotencyKey,
            }),
          );
        }
        return { rows, skipped };
      },
      { timeout: 20_000, maxWait: 10_000 },
    );
  const { rows, skipped } = await withStockRetry("consumeBatch", ids[0]!, run);
  for (const mv of rows) await postMovementGl(ctx, mv);
  for (const itemId of [...new Set(rows.map((r) => r.itemId))]) await syncLinkedAccountProduct(ctx, itemId);
  return { movementIds: rows.map((r) => r.id), skipped };
}
// ◂ POS P2.3

// ── ปรับสต็อก (ADJUST) — ตั้ง onHand เป็นค่านับจริง (stock take) โดยตรง ──
// qtyDelta = newQty - onHand เดิม · balanceAfter = newQty · idempotent เหมือน receive
// ต้นทุนถัวเฉลี่ยไม่กระทบ (แค่ปรับจำนวน) · ปรับจนติดลบ = ตั้งธง needsReview
export type AdjustInput = {
  itemId: string;
  newQty: number;
  idempotencyKey: string;
  note?: string | null;
  locationId?: string | null; // ไม่ส่ง = คลัง default (WO-0037)
  // POS P1.14 ▸ R8: ที่มาของรายการ (ไม่ส่ง = null เหมือนเดิม) — ตรวจนับจาก POS ส่ง "POS"/"PosStockCount"/countId ◂
  sourceModule?: string | null;
  refType?: string | null;
  refId?: string | null;
};

export async function adjust(ctx: Ctx, input: AdjustInput): Promise<{ id: string }> {
  const db = tenantDb(ctx);

  return withStockRetry("adjust", input.itemId, () => db.$transaction(async (tx) => {
    const mv = await adjustInTx(tx as unknown as Db, ctx, input);
    return { id: mv.id };
  })).then(async (r) => {
    // WO 4.2: นับสต็อก/ปรับยอด ก็ทำให้กระจกฝั่งบัญชีล้าสมัยเหมือนกัน → sync หลัง commit (เงียบถ้าไม่ผูก)
    await syncLinkedAccountProduct(ctx, input.itemId);
    return r;
  });
}

/**
 * POS P1.14 ▸ R8 — ปรับสต็อก "ภายใน tx ของผู้เรียก" (ตัวเดียวกับที่ adjust ใช้ · พฤติกรรมเดิมทุกอย่าง)
 * ⚠️ ไม่ sync AccountProduct ให้ (ต้อง commit ก่อน) — ผู้เรียกเรียก `syncAccountProductAfterTx` เอง · ADJUST ไม่โพสต์ GL อยู่แล้ว
 * ⚠️ `tx` อาจไม่ได้ผูก scope → ทุก where ในนี้ใส่ tenantId/systemId เอง (ผ่าน tenantDb ก็ได้ตัวกรองซ้ำ = ไม่มีผล)
 * ผู้เรียกที่ล็อกหลายสินค้าใน tx เดียวต้องเรียก `lockItemsInTx` ก่อน (ล็อกซ้ำตัวที่ถือแล้วไม่มีผล) ◂
 */
export async function adjustInTx(tx: Db, ctx: Ctx, input: AdjustInput): Promise<MovementRow> {
  const newQty = Math.round(input.newQty);
  // idempotent guard — key เดิมเคยบันทึกแล้ว → คืนรายการเดิม ไม่แตะสต็อก
  const want = { itemId: input.itemId, type: "ADJUST" as const, balanceAfter: newQty }; // R3.5: คีย์ซ้ำต้องยอดนับเดียวกัน
  const dup = await tx.invMovement.findFirst({ where: { ...scope(ctx), idempotencyKey: input.idempotencyKey } });
  if (dup) return sameMovementOrThrow(dup, want);

  // 🔴 HF-INV-1: ล็อกแถวสินค้าก่อนอ่านยอด — qtyDelta ต้องคิดจากยอดล่าสุดจริง ไม่ใช่ยอดที่อ่านก่อนรายการอื่น commit
  const item = await lockItemForStock(tx, ctx, input.itemId);
  if (!item) throw new Error("ไม่พบสินค้าในคลัง");
  const dupAfterLock = await tx.invMovement.findFirst({ where: { ...scope(ctx), idempotencyKey: input.idempotencyKey } });
  if (dupAfterLock) return sameMovementOrThrow(dupAfterLock, want);
  // 🔴 บริการไม่มีสต็อก (13 ส.ค. 2026) — กันเผลอรับเข้า/ตัด/นับ "ค่าตัดผม" เป็นชิ้น
  if (item.kind === "SERVICE") throw new Error(`"${item.name}" เป็นบริการ — ไม่มีสต็อกให้รับเข้า/ตัด/นับ`);

  const locId = await resolveLocationId(tx, ctx, input.locationId);
  await seedDefaultStockIfNeeded(tx, ctx, item);

  const qtyDelta = newQty - item.onHand;

  await tx.invItem.update({
    where: { id: item.id },
    data: { onHand: newQty }, // ตั้งเป็นค่านับจริงโดยตรง (ไม่กระทบต้นทุนถัวเฉลี่ย)
  });
  await applyLocationDelta(tx, ctx, item.id, locId, qtyDelta); // คลังที่ระบุขยับตาม delta → invariant คง

  return tx.invMovement.create({
    data: {
      tenantId: ctx.tenantId,
      systemId: ctx.systemId,
      itemId: item.id,
      type: "ADJUST",
      locationId: locId,
      qtyDelta,
      balanceAfter: newQty,
      costSatang: item.costSatang,
      sourceModule: input.sourceModule?.trim() || null,
      refType: input.refType?.trim() || null,
      refId: input.refId?.trim() || null,
      idempotencyKey: input.idempotencyKey,
      note: input.note?.trim() || null,
      // ปรับจนติดลบ = ตั้งธงให้ร้านมาเคลียร์
      needsReview: isNegative(newQty),
    },
  }).catch(rethrowKeyConflict); // R3.5(d)
}

/** POS P1.14 ▸ ให้ผู้เรียก `adjustInTx` ดันยอดไปกระจกสินค้าบัญชี "หลัง commit" (แบบ postMovementGlAfterTx · เงียบถ้าไม่ผูก) ◂ */
export async function syncAccountProductAfterTx(ctx: Ctx, itemId: string): Promise<void> {
  await syncLinkedAccountProduct(ctx, itemId);
}

/** POS P1.14 ▸ ผู้เรียกที่เปิด tx สต็อกเอง (pos/stock-count) แยก "ล็อกชนกัน" ออกจาก error อื่นได้ (รหัส SQLSTATE/Prisma หรือ null) ◂ */
export function isStockContention(e: unknown): boolean {
  return stockContentionCode(e) !== null;
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

  return withStockRetry("transfer", input.itemId, () => db.$transaction(async (tx) => {
    const txc = tx as unknown as Db;
    // idempotent — เคยโอน key นี้แล้ว → ไม่ทำซ้ำ
    const dup = await tx.invMovement.findFirst({ where: { idempotencyKey: outKey } });
    if (dup) return { ok: false };

    // 🔴 HF-INV-1: ล็อกแถวสินค้า (ล็อกต่อสินค้า ไม่ใช่ต่อคลัง) ⇒ โอน A→B กับ B→A ของสินค้าเดียวกันเรียงคิวกัน
    //    ยอดต่อคลังที่อ่านด้านล่างจึงเป็นยอดล่าสุดจริง · ไม่มีวงล็อกระหว่างแถวคลังสองแถว
    const item = await lockItemForStock(txc, ctx, input.itemId);
    if (!item) throw new Error("ไม่พบสินค้าในคลัง");
    const dupAfterLock = await tx.invMovement.findFirst({ where: { idempotencyKey: outKey } });
    if (dupAfterLock) return { ok: false };
    // 🔴 บริการไม่มีสต็อก (13 ส.ค. 2026) — กันเผลอรับเข้า/ตัด/นับ "ค่าตัดผม" เป็นชิ้น
    if (item.kind === "SERVICE") throw new Error(`"${item.name}" เป็นบริการ — ไม่มีสต็อกให้รับเข้า/ตัด/นับ`);

    // 🔴 HF-INV-0 (D3): คลังต้นทาง/ปลายทางมาจากฟอร์ม — ต้องเป็นคลังของระบบนี้ที่ยังใช้งานอยู่ทั้งคู่
    //    เดิมไม่ตรวจ: id มั่ว/คลังของระบบอื่น/คลังที่ปิดแล้ว → applyLocationDelta สร้างแถวผีติดลบ แล้วคลังจริงได้ของเพิ่มฟรี
    //    (ต้นทางติดลบยังยอมตามนโยบายเดิม — ตรงนี้ตรวจแค่ว่าคลังมีจริง)
    const locs = await tx.invLocation.findMany({
      where: { ...scope(ctx), id: { in: [input.fromLocationId, input.toLocationId] }, archivedAt: null },
      select: { id: true },
    });
    if (locs.length !== 2) throw new Error("ไม่พบคลังต้นทางหรือปลายทางที่เลือก — รีเฟรชหน้าแล้วเลือกคลังใหม่อีกครั้ง");

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
  }));
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
  await prisma.$transaction((tx) => legacy.linkInvItemAccountProduct(tx, ctx, item.id, accountProductId, ctx.actorUserId));
  // WO 4.1: ผูกแล้วดันค่าฝั่งคลัง (sku/หน่วย/ต้นทุน) ไปตั้งต้นให้สินค้าบัญชีทันที — ขากลับ
  //   (AccountProduct.invItemId) ตั้งโดย account.linkProductToItem ซึ่งเรียกฟังก์ชันนี้ต่ออีกที
  await syncLinkedAccountProduct(ctx, itemId);
}

/**
 * POS P1.1b ▸ ซิงก์บัญชี → คลัง (ชื่อ/sku/หน่วย/ลิงก์ — ผู้เรียก: account/inventory-link.syncProductToItem) · ธุรกรรมเดียวกับแถวแคตตาล็อก
 * P2002 (sku ชน) = ทั้งก้อนไม่บันทึก แล้ว throw ต่อให้ผู้เรียกลองใหม่ด้วยธุรกรรมใหม่ (ไม่เขียนต่อในธุรกรรมที่ล้มแล้ว) ◂
 */
export async function applyAccountProductSync(
  ctx: Ctx,
  itemId: string,
  data: { accountProductId?: string; name?: string; unitLabel?: string; sku?: string },
): Promise<void> {
  await prisma.$transaction((tx) => legacy.writeInvItemFromAccountProduct(tx, ctx, itemId, data, ctx.actorUserId));
}

// CRM C1.5 ▸ อ่านสินค้าหลายตัวในคำสั่งเดียว (scope tenant+system ผ่าน tenantDb · ของเลิกขาย/ข้ามระบบไม่คืน · ≤ 500 id)
//   ผู้เรียก: `crm/deals.ts` (ตรวจ productId ของบรรทัดดีล + ป้าย "ราคาเปลี่ยน") — แทนการเรียก getItem ทีละตัว (รีวิว C1.5) ◂ CRM C1.5
export async function getItemsByIds(ctx: Ctx, itemIds: string[]) {
  const ids = [...new Set((itemIds ?? []).filter((x) => typeof x === "string" && x))].slice(0, 500);
  if (ids.length === 0) return [];
  return tenantDb(ctx).invItem.findMany({ where: { id: { in: ids }, archivedAt: null }, select: { id: true, priceSatang: true } });
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

// ── ค้นแคตตาล็อกจากคำเดียว (WO CRM v2 · C0.3 ส่วน D) ──
// 🔴 ต่างจาก `findItemByBarcode` (เทียบบาร์โค้ดตรงตัว สำหรับเครื่องยิง) — ตัวนี้คือช่องค้นหาของ **คน**
//    ที่กำลังหยิบของลงบรรทัดใบเสนอราคาของ CRM ⇒ ค้นทั้ง ชื่อ · SKU · บาร์โค้ด ในคำสั่งเดียว
//    และคืน **ทั้งสินค้าและบริการ** (บรรทัดดีลขายได้ทั้งสองชนิด — ตัวกรองชนิดอยู่ที่ listItems/listServices)
// 🔴 ของที่เลิกขาย (`archivedAt`) ไม่โผล่เด็ดขาด · เพดาน 50 แถวเสมอ (ผู้เรียกขอ 999 ก็ได้ 50)
//    — ช่องค้นหาที่อ่านทั้งคลังคือ query ที่ทำให้หน้าจอค้างตอนร้านมีของเป็นหมื่นชิ้น
export async function searchItems(ctx: Ctx, q: string, take = 20) {
  const query = (q ?? "").trim();
  if (!query) return [];
  const limit = Math.min(Math.max(1, Math.floor(take) || 1), 50);
  return tenantDb(ctx).invItem.findMany({
    where: {
      archivedAt: null,
      OR: [
        { name: { contains: query, mode: "insensitive" } },
        { sku: { contains: query, mode: "insensitive" } },
        { barcode: { contains: query, mode: "insensitive" } },
      ],
    },
    orderBy: [{ kind: "asc" }, { name: "asc" }],
    take: limit,
  });
}
