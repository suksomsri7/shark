"use server";
// stock-count-actions.ts — server action ของตรวจนับ + ทางลัดรับ/โอน/ปรับ (POS P1.14 U) · เปลือกบาง: session → ctx/actor → stock-count.* → คืนผลตามเดิม
// 🔴 ไฟล์ "use server" export ได้เฉพาะ async function · ชนิดข้อมูลอยู่ที่ stock-count.ts / stock-count-shared.ts
// 🔴 คำปฏิเสธ "คืน" เสมอ {ok:false, code, message} (message ไทยจาก STOCK_COUNT_MESSAGES) · ขัดข้องที่ไม่คาดคิด = INTERNAL
// 🔴 ร้าน + ผู้ทำรายการมาจาก membership ของ SESSION เท่านั้น · ตรวจค่า/สิทธิ์ละเอียดอยู่ใน stock-count.ts (action ส่งผ่านอย่างเดียว)
// 🔴 Server Actions ถูกส่งทีละคำขอต่อ client — จอเรียกครั้งละหนึ่ง (ห้ามยิงพร้อมกันหลายตัว)

import { unstable_rethrow } from "next/navigation";
import { requireTenant } from "@/lib/core/context";
import { assertCan, canAccessUnit, evaluate } from "@/lib/core/rbac";
import { systemForUnit } from "@/lib/modules/system/service";
import * as inventory from "@/lib/modules/inventory/service";
import { prisma } from "./db";
import { posMembership } from "./access";
import {
  cancelStockCount,
  confirmStockCount,
  getStockCount,
  listStockCounts,
  openStockCount,
  posAdjustStock,
  posReceiveStock,
  posTransferStock,
  recordStockCount,
  stockCountMeta,
  type CancelStockCountResult,
  type ConfirmStockCountResult,
  type GetStockCountResult,
  type ListStockCountsResult,
  type OpenStockCountInput,
  type OpenStockCountResult,
  type PosAdjustStockInput,
  type PosReceiveStockInput,
  type PosTransferStockInput,
  type RecordStockCountInput,
  type RecordStockCountResult,
  type ShortcutResult,
  type StockCountMetaResult,
  type TransferShortcutResult,
} from "./stock-count";
import { STOCK_COUNT_MESSAGES, type StockCountFilter, type StockCountRefusal, type StockCountRefusalCode, type StockCountStatus, type StockCountView } from "./stock-count-shared";
import type { RegisterActor, RegisterCtx } from "./register-shared";

type Target = { systemId: string; unitId: string };
const STOCK_GATE = [
  { module: "pos", action: "pos.stock.count" },
  { module: "inventory", action: "inventory.movement.receive" },
  { module: "inventory", action: "inventory.movement.transfer" },
  { module: "inventory", action: "inventory.movement.adjust" },
] as const;
type Session = Awaited<ReturnType<typeof requireTenant>>;

const refusal = (code: StockCountRefusalCode): StockCountRefusal => ({ ok: false, code, message: STOCK_COUNT_MESSAGES[code].th });
function unexpected(where: string, e: unknown): StockCountRefusal {
  console.error(`[pos/stock-count-actions] ${where}`, e);
  return refusal("INTERNAL");
}
async function session(where: string): Promise<Session | StockCountRefusal> {
  try {
    return await requireTenant();
  } catch (e) {
    unstable_rethrow(e);
    return unexpected(`${where} requireTenant`, e);
  }
}
/** session → ขอบเขต + ผู้ทำรายการ · เข้าสาขาไม่ได้ = NOT_FOUND (stock-count.ts ตรวจซ้ำพร้อมระบบ/สาขาจาก DB + สิทธิ์ต่อคำสั่ง) */
function scopeOf(auth: Session, args: unknown): { ctx: RegisterCtx; actor: RegisterActor; m: ReturnType<typeof posMembership> } | StockCountRefusal {
  const a = args && typeof args === "object" ? (args as Record<string, unknown>) : {};
  const systemId = typeof a.systemId === "string" ? a.systemId : "";
  const unitId = typeof a.unitId === "string" ? a.unitId : "";
  if (!systemId || !unitId) return refusal("NOT_FOUND");
  const m = posMembership(auth.active);
  if (!canAccessUnit(m, unitId)) return refusal("NOT_FOUND");
  // ด่านหยาบ: ต้องมีสิทธิ์ของหน้าสต็อกอย่างน้อยหนึ่งข้อที่สาขานี้ (ตรวจนับ หรือ รับ/โอน/ปรับ) — สิทธิ์ละเอียดต่อคำสั่ง = stock-count.ts
  const allowed = STOCK_GATE.some((q) => {
    try {
      assertCan(m, { ...q, unitId });
      return true;
    } catch {
      return false;
    }
  });
  if (!allowed) return refusal("PERMISSION_DENIED");
  return {
    ctx: { tenantId: auth.active.tenantId, systemId, unitId },
    actor: { userId: auth.user.id, role: m.role, unitAccess: m.unitAccess, permissions: m.permissions },
    m,
  };
}
/** ห่อทุก action ด้วยลำดับเดียวกัน: session → ขอบเขต → ฟังก์ชันโมดูล · โยน = INTERNAL */
async function run<R>(where: string, args: unknown, body: (ctx: RegisterCtx, actor: RegisterActor) => Promise<R>): Promise<R | StockCountRefusal> {
  const auth = await session(where);
  if ("ok" in auth) return auth;
  try {
    const s = scopeOf(auth, args);
    if ("ok" in s) return s;
    return await body(s.ctx, s.actor);
  } catch (e) {
    return unexpected(where, e);
  }
}

/** ตัวอ่านของหน้าสต็อก (คลัง · ที่เก็บ · หมวด · สิทธิ์ · รอบที่เปิดอยู่) */
export async function posStockMetaAction(args: Target): Promise<StockCountMetaResult> {
  return run("posStockMetaAction", args, (ctx, actor) => stockCountMeta(ctx, actor));
}

/** เปิดรอบตรวจนับ (R4) */
export async function posStockCountOpenAction(args: Target & { input: OpenStockCountInput }): Promise<OpenStockCountResult> {
  return run("posStockCountOpenAction", args, (ctx, actor) => openStockCount(ctx, actor, args.input));
}

/** บันทึกการนับ 1 รายการ (R5 · SET จากช่องกรอก · ADD จากการสแกน) */
export async function posStockCountRecordAction(args: Target & { input: RecordStockCountInput }): Promise<RecordStockCountResult> {
  return run("posStockCountRecordAction", args, (ctx, actor) => recordStockCount(ctx, actor, args.input));
}

/** อ่านรอบ + บรรทัด + สรุป (R11) */
export async function posStockCountGetAction(args: Target & { input: { countId: string; filter?: StockCountFilter } }): Promise<GetStockCountResult> {
  return run("posStockCountGetAction", args, (ctx, actor) => getStockCount(ctx, actor, args.input));
}

/** รอบของสาขา ใหม่สุดก่อน (R11) */
export async function posStockCountListAction(args: Target & { input?: { status?: StockCountStatus; limit?: number } }): Promise<ListStockCountsResult> {
  return run("posStockCountListAction", args, (ctx, actor) => listStockCounts(ctx, actor, args.input ?? {}));
}

/** ยืนยันผลต่าง (R7) */
export async function posStockCountConfirmAction(args: Target & { input: { countId: string; uncounted?: "SKIP" | "ZERO"; idempotencyKey: string } }): Promise<ConfirmStockCountResult> {
  return run("posStockCountConfirmAction", args, (ctx, actor) => confirmStockCount(ctx, actor, args.input));
}

/** ยกเลิกรอบ (R9) */
export async function posStockCountCancelAction(args: Target & { input: { countId: string; reason: string; idempotencyKey: string } }): Promise<CancelStockCountResult> {
  return run("posStockCountCancelAction", args, (ctx, actor) => cancelStockCount(ctx, actor, args.input));
}

/** ทางลัดรับของเข้า (รับอิสระเท่านั้น — มติเจ้าของ Q1: รับตามใบสั่งซื้อทำที่ระบบคลัง) */
export async function posStockReceiveAction(args: Target & { input: PosReceiveStockInput }): Promise<ShortcutResult> {
  return run("posStockReceiveAction", args, (ctx, actor) => posReceiveStock(ctx, actor, args.input));
}

/** ทางลัดโอนระหว่างที่เก็บของคลังเดียวกัน (R16) */
export async function posStockTransferAction(args: Target & { input: PosTransferStockInput }): Promise<TransferShortcutResult> {
  return run("posStockTransferAction", args, (ctx, actor) => posTransferStock(ctx, actor, args.input));
}

/** ทางลัดปรับสต็อก (delta ≠ 0 + เหตุผล · ไม่ลงบัญชี — มติเจ้าของ Q2) */
export async function posStockAdjustAction(args: Target & { input: PosAdjustStockInput }): Promise<ShortcutResult> {
  return run("posStockAdjustAction", args, (ctx, actor) => posAdjustStock(ctx, actor, args.input));
}

// ═══════════ ตัวอ่านเสริมของหน้าจอ (ค้นสินค้า · ประวัติล่าสุด) — อ่านอย่างเดียว ═══════════
const MOVE_ACTIONS = ["inventory.movement.receive", "inventory.movement.transfer", "inventory.movement.adjust"] as const;
/** ระบบ POS นี้ผูกสาขานี้ (live) + คลังของสาขา (live) — ไม่ผ่าน = คำปฏิเสธ (ลำดับเดียวกับ stock-count.ts: ขอบเขต → สิทธิ์ → คลัง) */
async function unitInventory(ctx: RegisterCtx, gate: () => boolean): Promise<{ id: string } | StockCountRefusal> {
  const { tenantId, systemId, unitId } = ctx;
  const [sys, link] = await Promise.all([
    prisma.appSystem.findFirst({ where: { id: systemId, tenantId, type: "POS", active: true }, select: { id: true } }),
    prisma.appSystemUnit.findUnique({ where: { tenantId_unitId_type: { tenantId, unitId, type: "POS" } }, select: { systemId: true } }),
  ]);
  if (!sys || link?.systemId !== systemId) return refusal("NOT_FOUND");
  if (!gate()) return refusal("PERMISSION_DENIED");
  const invId = await systemForUnit(tenantId, unitId, "INVENTORY");
  const inv = invId ? await prisma.appSystem.findFirst({ where: { id: invId, tenantId, type: "INVENTORY", active: true }, select: { id: true } }) : null;
  return inv ?? refusal("NO_INVENTORY");
}

type StockItemHit = { id: string; name: string; sku: string; barcode: string | null; unitLabel: string; onHand: number; costSatang: number; exact: boolean };
type ItemSearchResult = { ok: true; items: StockItemHit[] } | StockCountRefusal;
const SEARCH_LIMIT = 20;

/**
 * ค้นสินค้าของคลังสาขา (ตัวเลือกสินค้าของทางลัด) · q = ชื่อ/SKU/บาร์โค้ด (1–128 ตัว) · ตรงตัว (บาร์โค้ด/SKU) มาก่อนเสมอ (exact:true)
 * แล้วตามด้วยชื่อ/SKU/บาร์โค้ดที่มีคำนี้ · สินค้า PRODUCT ที่ยังไม่เก็บถาวรเท่านั้น · สูงสุด 20
 * สิทธิ์: ทางลัดอย่างน้อยหนึ่งข้อ (inventory.movement.receive|transfer|adjust) ที่สาขานี้
 */
export async function posStockItemSearchAction(args: Target & { q: string }): Promise<ItemSearchResult> {
  const auth = await session("posStockItemSearchAction");
  if ("ok" in auth) return auth;
  try {
    const s = scopeOf(auth, args);
    if ("ok" in s) return s;
    const { tenantId, unitId } = s.ctx;
    const inv = await unitInventory(s.ctx, () => MOVE_ACTIONS.some((action) => evaluate(s.m, { module: "inventory", action, unitId })));
    if ("ok" in inv) return inv;
    const q = typeof args.q === "string" ? args.q.trim() : "";
    if (!q || q.length > 128 || q.includes("\u0000")) return refusal("VALIDATION");
    const base = { tenantId, systemId: inv.id, kind: "PRODUCT" as const, archivedAt: null };
    const select = { id: true, name: true, sku: true, barcode: true, unitLabel: true, onHand: true, costSatang: true } as const;
    const exact = await prisma.invItem.findMany({ where: { ...base, OR: [{ barcode: q }, { sku: q }] }, select, take: SEARCH_LIMIT, orderBy: { name: "asc" } });
    const seen = new Set(exact.map((i) => i.id));
    const more =
      exact.length >= SEARCH_LIMIT
        ? []
        : await prisma.invItem.findMany({
            where: { ...base, id: { notIn: [...seen] }, OR: [{ name: { contains: q, mode: "insensitive" } }, { sku: { contains: q, mode: "insensitive" } }, { barcode: { contains: q } }] },
            select,
            take: SEARCH_LIMIT - exact.length,
            orderBy: { name: "asc" },
          });
    return { ok: true, items: [...exact.map((i) => ({ ...i, exact: true })), ...more.map((i) => ({ ...i, exact: false }))] };
  } catch (e) {
    return unexpected("posStockItemSearchAction", e);
  }
}

type StockMove = { id: string; type: "IN" | "OUT" | "ADJUST" | "TRANSFER"; qtyDelta: number; itemName: string; locationId: string | null; note: string | null; sourceModule: string | null; createdAt: string };
type HistoryResult = { ok: true; counts: StockCountView[] | null; movements: StockMove[] | null } | StockCountRefusal;

/**
 * ประวัติล่าสุดของหน้าสต็อก — คำขอเดียวต่อการโหลด (Server Actions ถูกส่งทีละตัว):
 *   counts = รอบตรวจนับของสาขา (listStockCounts · ต้องมี pos.stock.count — ไม่มี = null)
 *   movements = การเคลื่อนไหวล่าสุดของคลังสาขา (inventory.recentMovements · ต้องมีสิทธิ์ทางลัดอย่างน้อยหนึ่งข้อ — ไม่มี = null)
 *     ไม่รวมแถว ADJUST ของการยืนยันตรวจนับ (refType PosStockCount — แสดงเป็นแถวรอบนับแทน) · คลังที่หลายสาขาใช้ร่วม = เห็นของทุกสาขาเหมือนระบบคลัง
 */
export async function posStockHistoryAction(args: Target & { limit?: number }): Promise<HistoryResult> {
  const auth = await session("posStockHistoryAction");
  if ("ok" in auth) return auth;
  try {
    const s = scopeOf(auth, args);
    if ("ok" in s) return s;
    const { tenantId, unitId } = s.ctx;
    const limit = typeof args.limit === "number" && Number.isInteger(args.limit) && args.limit >= 1 && args.limit <= 50 ? args.limit : 10;
    const canCount = evaluate(s.m, { module: "pos", action: "pos.stock.count", unitId });
    const canMove = MOVE_ACTIONS.some((action) => evaluate(s.m, { module: "inventory", action, unitId }));
    const inv = await unitInventory(s.ctx, () => canCount || canMove);
    if ("ok" in inv) return inv;
    const [counts, moves] = await Promise.all([
      canCount ? listStockCounts(s.ctx, s.actor, { limit }) : Promise.resolve(null),
      canMove ? inventory.recentMovements({ tenantId, systemId: inv.id }, limit * 3) : Promise.resolve(null),
    ]);
    if (counts && !counts.ok) return counts;
    return {
      ok: true,
      counts: counts ? counts.items : null,
      movements: moves
        ? moves
            .filter((m) => m.refType !== "PosStockCount")
            .slice(0, limit)
            .map((m) => ({ id: m.id, type: m.type, qtyDelta: m.qtyDelta, itemName: m.item.name, locationId: m.locationId, note: m.note, sourceModule: m.sourceModule, createdAt: m.createdAt.toISOString() }))
        : null,
    };
  } catch (e) {
    return unexpected("posStockHistoryAction", e);
  }
}
