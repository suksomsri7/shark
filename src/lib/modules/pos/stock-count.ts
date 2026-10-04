// POS P1.14 ▸ ตรวจนับสต็อกจากหน้าขาย (มือถือ) + ทางลัดรับของ/โอน/ปรับ (มติ R1–R16 · ledger/pos-briefs/pos-brief-P1.14.md) ◂
// สัญญา = scripts/qc-pos-p1.14.mts · โน้ต ledger/wo-notes/pos-P1.14.md
// 🔴 ผู้เขียนเดียวของ PosStockCount / PosStockCountLine / PosStockCountEntry
// 🔴 C-1: ทุกการเขียนสต็อกผ่าน inventory/service เท่านั้น (adjustInTx · receive · transfer · lockItemsInTx) — ไฟล์นี้ "อ่าน" ตารางคลังอย่างเดียว
// 🔴 ทุกฟังก์ชันรับ (ctx, actor, input, client?) และ "คืน" คำปฏิเสธ {ok:false, code, message} ไม่ throw
//    ลำดับตายตัว: ขอบเขต → สิทธิ์ → ตรวจค่า → คีย์กันซ้ำ → tx · ขอบเขตผิด (ร้าน/ระบบ/สาขา · รอบของสาขาอื่น) = NOT_FOUND
// 🔴 ล็อก: แถวรอบ (บันทึก = FOR SHARE · ยืนยัน/ยกเลิก = FOR UPDATE) → แถวบรรทัด (FOR NO KEY UPDATE) → สินค้า (lockItemsInTx เรียง id)
//    การขายล็อกเฉพาะสินค้า ⇒ ไม่มีวงล็อก
// 🔴 กติกาบวกกลับ (R6): expectedAtCount = ยอดที่ที่เก็บ "ใต้ล็อกสินค้า" ณ รายการนับล่าสุด · ยืนยัน = ยอดปัจจุบัน + (นับได้ − expectedAtCount)
//    ⇒ ทุก movement ที่ลงหลังนับยังอยู่ในยอด · ทุก movement ก่อนนับอยู่ใน expectedAtCount แล้ว
import { Prisma, type PosStockCount, type PosStockCountLine, type PrismaClient } from "@prisma/client";
import { prisma } from "./db";
import { evaluate } from "@/lib/core/rbac";
import { emitOutbox } from "@/lib/core/outbox";
import { scheduleDrain } from "@/lib/outbox-consumers";
import * as inventory from "@/lib/modules/inventory/service";
import { parseWeighedBarcode, weighedGramsFromPrice } from "./scan-shared";
import type { RegisterActor, RegisterCtx } from "./register-shared";
import {
  STOCK_COUNT_CATEGORY_MAX,
  STOCK_COUNT_CONFIRM_MAX_LINES,
  STOCK_COUNT_KEY_RE,
  STOCK_COUNT_LIST_MAX,
  STOCK_COUNT_MESSAGES,
  STOCK_COUNT_NOTE_MAX,
  STOCK_COUNT_QTY_MAX,
  STOCK_COUNT_REASON_MAX,
  type StockCountFilter,
  type StockCountLineView,
  type StockCountMode,
  type StockCountRefusal,
  type StockCountRefusalCode,
  type StockCountStatus,
  type StockCountSummary,
  type StockCountView,
} from "./stock-count-shared";

type Db = PrismaClient;
type Tx = Prisma.TransactionClient;

const EVENT_CONFIRMED = "pos.stockCount.confirmed";
const COUNTED_MAX = 2_000_000_000; // เพดาน int4 ของยอดนับสะสม (ADD หลายครั้ง)
const LOT_MAX = 64;

// ═══════════ คำปฏิเสธ ═══════════
const refuse = (code: StockCountRefusalCode, extra?: { countId?: string }): StockCountRefusal => ({ ok: false, code, message: STOCK_COUNT_MESSAGES[code].th, ...(extra ?? {}) });
const isRefusal = (v: unknown): v is StockCountRefusal => !!v && typeof v === "object" && (v as { ok?: unknown }).ok === false;
/** โยนใน tx เพื่อ rollback แล้วคืนคำปฏิเสธ (guard จับ) */
class RefuseTx extends Error {
  constructor(readonly refusal: StockCountRefusal) {
    super(refusal.code);
  }
}

async function guard<T>(name: string, body: () => Promise<T>): Promise<T | StockCountRefusal> {
  try {
    return await body();
  } catch (e) {
    if (e instanceof RefuseTx) return e.refusal;
    if ((e as { code?: unknown } | null)?.code === inventory.STOCK_KEY_CONFLICT_CODE) return refuse("IDEMPOTENCY_CONFLICT");
    if (inventory.isStockContention(e)) return refuse("STOCK_BUSY");
    console.error(`[pos/stock-count] ${name} INTERNAL`, e);
    return refuse("INTERNAL");
  }
}

// ═══════════ ตัวตรวจ ═══════════
const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const isId = (v: unknown): v is string => typeof v === "string" && v.length > 0 && v.length <= 200 && !v.includes("\u0000");
const isInt = (v: unknown, min: number, max: number): v is number => typeof v === "number" && Number.isInteger(v) && v >= min && v <= max;
const onlyKeys = (o: Record<string, unknown>, keys: readonly string[]) => Object.keys(o).every((k) => keys.includes(k));
const isKey = (v: unknown): v is string => typeof v === "string" && STOCK_COUNT_KEY_RE.test(v);
/** ข้อความไม่บังคับ: ไม่ส่ง/ว่าง = null · ยาวเกิน/ไม่ใช่ข้อความ = false */
const optText = (v: unknown, max: number): string | null | false => {
  if (v === undefined || v === null) return null;
  if (typeof v !== "string" || v.includes("\u0000")) return false;
  const t = v.trim();
  if (t.length > max) return false;
  return t.length ? t : null;
};
/** ข้อความบังคับ 1–max หลังตัดช่องว่าง · ผิด = null */
const reqText = (v: unknown, max: number): string | null => {
  const t = optText(v, max);
  return typeof t === "string" ? t : null;
};
const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);
const isUniqueViolation = (e: unknown): boolean => {
  const o = e as { code?: unknown; message?: unknown } | null;
  return o?.code === "P2002" || /\b23505\b|Unique constraint/i.test(String(o?.message ?? ""));
};
function runTx<T>(db: Db, fn: (tx: Tx) => Promise<T>, timeout = 30_000): Promise<T> {
  return db.$transaction((tx) => fn(tx), { timeout, maxWait: 10_000 });
}
/** R2 F1: tx ยืนยันมีเวลาของตัวเอง (สูงสุด 2,000 บรรทัด × adjustInTx) */
const CONFIRM_TX_TIMEOUT_MS = 120_000;

function actorOf(a: unknown): RegisterActor | null {
  if (!isRecord(a) || !isId(a.userId)) return null;
  if (a.role !== "OWNER" && a.role !== "MANAGER" && a.role !== "STAFF") return null;
  if (!Array.isArray(a.unitAccess) || !a.unitAccess.every((x) => typeof x === "string")) return null;
  if (!isRecord(a.permissions)) return null;
  return { userId: a.userId, role: a.role, unitAccess: [...(a.unitAccess as string[])], permissions: a.permissions };
}

// ═══════════ ขอบเขต + สิทธิ์ (R3 R12) ═══════════
type Scope = { tenantId: string; systemId: string; unitId: string; actor: RegisterActor; posSettings: unknown; inventorySystemId: string | null };

async function scopeOf(db: Db, ctx: unknown, actorRaw: unknown): Promise<Scope | StockCountRefusal> {
  if (!isRecord(ctx) || !isId(ctx.tenantId) || !isId(ctx.systemId) || !isId(ctx.unitId)) return refuse("NOT_FOUND");
  const { tenantId, systemId, unitId } = ctx as RegisterCtx;
  const actor = actorOf(actorRaw);
  if (!actor) return refuse("PERMISSION_DENIED");
  const [sys, link, unit, invLink] = await Promise.all([
    db.appSystem.findFirst({ where: { id: systemId, tenantId, type: "POS", active: true }, select: { settings: true } }),
    db.appSystemUnit.findUnique({ where: { tenantId_unitId_type: { tenantId, unitId, type: "POS" } }, select: { systemId: true } }),
    db.businessUnit.findFirst({ where: { id: unitId, tenantId, status: { not: "ARCHIVED" } }, select: { id: true } }),
    // = systemForUnit(tenantId, unitId, "INVENTORY") ผ่าน client ของผู้เรียก
    db.appSystemUnit.findUnique({ where: { tenantId_unitId_type: { tenantId, unitId, type: "INVENTORY" } }, select: { systemId: true } }),
  ]);
  if (!sys || !link || link.systemId !== systemId || !unit) return refuse("NOT_FOUND");
  let inventorySystemId: string | null = null;
  if (invLink) {
    const inv = await db.appSystem.findFirst({ where: { id: invLink.systemId, tenantId, type: "INVENTORY", active: true }, select: { id: true } });
    inventorySystemId = inv?.id ?? null;
  }
  return { tenantId, systemId, unitId, actor, posSettings: sys.settings, inventorySystemId };
}

/** สิทธิ์ประเมินที่สาขาของ ctx (OWNER/MANAGER ผ่านตาม evaluate · STAFF ต้องเข้าสาขาได้ + มีคีย์) */
const can = (s: Scope, module: string, action: string) => evaluate(s.actor, { module, action, unitId: s.unitId });
const canCount = (s: Scope) => can(s, "pos", "pos.stock.count");
const canAdjust = (s: Scope) => can(s, "inventory", "inventory.movement.adjust");

/** รอบของขอบเขตนี้ (ร้าน + ระบบ POS + สาขา) — อื่น = null (NOT_FOUND) */
async function countInScope(db: Db | Tx, s: Scope, countId: unknown): Promise<PosStockCount | null> {
  if (!isId(countId)) return null;
  return db.posStockCount.findFirst({ where: { id: countId, tenantId: s.tenantId, systemId: s.systemId, unitId: s.unitId } });
}

/** ที่เก็บที่ยังใช้งานของคลังนี้ — ไม่พบ = null */
async function liveLocation(db: Db | Tx, tenantId: string, inventorySystemId: string, locationId: string): Promise<{ id: string; isDefault: boolean } | null> {
  return db.invLocation.findFirst({ where: { id: locationId, tenantId, systemId: inventorySystemId, archivedAt: null }, select: { id: true, isDefault: true } });
}

/**
 * R3 locQty — ยอดของสินค้าที่ที่เก็บหนึ่ง: แถว InvLocationStock · สินค้าที่ยังไม่มีแถวเลย (ยังไม่ถูก seed) = InvItem.onHand
 * เมื่อเป็นที่เก็บ default (lazy seed ของคลัง) · อื่น = 0 · อ่านอย่างเดียว
 */
async function locQtyMap(
  db: Db | Tx,
  invCtx: { tenantId: string; systemId: string },
  items: readonly { id: string; onHand: number }[],
  loc: { id: string; isDefault: boolean },
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (items.length === 0) return out;
  const rows = await db.invLocationStock.findMany({
    where: { tenantId: invCtx.tenantId, systemId: invCtx.systemId, itemId: { in: items.map((i) => i.id) } },
    select: { itemId: true, locationId: true, onHand: true },
  });
  const has = new Set(rows.map((r) => r.itemId));
  for (const it of items) out.set(it.id, has.has(it.id) ? 0 : loc.isDefault ? it.onHand : 0);
  for (const r of rows) if (r.locationId === loc.id) out.set(r.itemId, r.onHand);
  return out;
}

async function countLocation(db: Db | Tx, c: PosStockCount): Promise<{ id: string; isDefault: boolean }> {
  const l = await db.invLocation.findFirst({ where: { id: c.locationId, tenantId: c.tenantId, systemId: c.inventorySystemId }, select: { id: true, isDefault: true } });
  return l ?? { id: c.locationId, isDefault: false };
}

// ═══════════ มุมมอง (R11) ═══════════
function countView(r: PosStockCount): StockCountView {
  return {
    id: r.id,
    countNo: r.countNo,
    unitId: r.unitId,
    inventorySystemId: r.inventorySystemId,
    locationId: r.locationId,
    scope: r.scope,
    categoryIds: [...r.categoryIds],
    blind: r.blind,
    status: r.status as StockCountStatus,
    note: r.note,
    snapshotAt: r.snapshotAt.toISOString(),
    openedByUserId: r.openedByUserId,
    confirmedAt: iso(r.confirmedAt),
    confirmedByUserId: r.confirmedByUserId,
    cancelledAt: iso(r.cancelledAt),
    cancelledByUserId: r.cancelledByUserId,
    cancelReason: r.cancelReason,
  };
}

type ItemInfo = { name: string; sku: string; barcode: string | null; unitLabel: string };
async function lineViews(db: Db | Tx, s: Scope, c: PosStockCount, lines: readonly PosStockCountLine[]): Promise<StockCountLineView[]> {
  const ids = [...new Set(lines.map((l) => l.itemId))];
  const [items, weighed] = ids.length
    ? await Promise.all([
        db.invItem.findMany({ where: { tenantId: c.tenantId, systemId: c.inventorySystemId, id: { in: ids } }, select: { id: true, name: true, sku: true, barcode: true, unitLabel: true } }),
        db.posProduct.findMany({ where: { tenantId: c.tenantId, systemId: c.systemId, invItemId: { in: ids }, soldByWeight: true, archivedAt: null }, select: { invItemId: true } }),
      ])
    : [[], []];
  const info = new Map<string, ItemInfo>(items.map((i) => [i.id, i]));
  const w = new Set(weighed.map((p) => p.invItemId));
  // R11 blind: ผู้ไม่มีสิทธิ์ปรับสต็อกไม่เห็นยอดระบบ/ผลต่าง (ทั้งตอนเปิดและหลังปิด)
  const hide = c.blind && !canAdjust(s);
  return lines.map((l) => {
    const i = info.get(l.itemId);
    const live = l.varianceQty ?? (l.countedQty !== null && l.expectedAtCount !== null ? l.countedQty - l.expectedAtCount : null);
    return {
      id: l.id,
      itemId: l.itemId,
      name: i?.name ?? "",
      sku: i?.sku ?? "",
      barcode: i?.barcode ?? null,
      unitLabel: i?.unitLabel ?? "",
      weighed: w.has(l.itemId),
      snapshotQty: hide ? null : l.snapshotQty,
      countedQty: l.countedQty,
      expectedAtCount: hide ? null : l.expectedAtCount,
      varianceQty: hide ? null : live,
      countedAt: iso(l.countedAt),
    };
  });
}

// ═══════════ เปิดรอบ (R4) ═══════════
export type OpenStockCountInput = {
  scope: "ALL" | "CATEGORY";
  categoryIds?: string[];
  blind?: boolean;
  locationId?: string;
  note?: string;
  idempotencyKey: string;
};
export type OpenStockCountResult = { ok: true; count: StockCountView; duplicated?: true } | StockCountRefusal;

export async function openStockCount(ctx: RegisterCtx, actor: RegisterActor, input: OpenStockCountInput, client?: Db): Promise<OpenStockCountResult> {
  const db = client ?? prisma;
  return guard("openStockCount", async (): Promise<OpenStockCountResult> => {
    const s = await scopeOf(db, ctx, actor);
    if (isRefusal(s)) return s;
    if (!canCount(s)) return refuse("PERMISSION_DENIED");
    if (!s.inventorySystemId) return refuse("NO_INVENTORY");
    const invS = s.inventorySystemId;
    // ── ตรวจค่า (R14) ──
    if (!isRecord(input) || !onlyKeys(input, ["scope", "categoryIds", "blind", "locationId", "note", "idempotencyKey"])) return refuse("VALIDATION");
    if (!isKey(input.idempotencyKey)) return refuse("VALIDATION");
    if (input.scope !== "ALL" && input.scope !== "CATEGORY") return refuse("VALIDATION");
    if (input.blind !== undefined && typeof input.blind !== "boolean") return refuse("VALIDATION");
    const note = optText(input.note, STOCK_COUNT_NOTE_MAX);
    if (note === false) return refuse("VALIDATION");
    let categoryIds: string[] = [];
    if (input.scope === "ALL") {
      if (input.categoryIds !== undefined) return refuse("VALIDATION");
    } else {
      const raw = input.categoryIds;
      if (!Array.isArray(raw) || raw.length < 1 || raw.length > STOCK_COUNT_CATEGORY_MAX || !raw.every(isId)) return refuse("VALIDATION");
      categoryIds = [...new Set(raw)].sort();
      const found = await db.invCategory.count({ where: { tenantId: s.tenantId, systemId: invS, id: { in: categoryIds } } });
      if (found !== categoryIds.length) return refuse("VALIDATION");
    }
    if (input.locationId !== undefined && !isId(input.locationId)) return refuse("VALIDATION");
    const invCtx = { tenantId: s.tenantId, systemId: invS };
    const loc = input.locationId
      ? await liveLocation(db, s.tenantId, invS, input.locationId)
      : await inventory.ensureDefaultLocation(invCtx).then((d) => liveLocation(db, s.tenantId, invS, d.id));
    if (!loc) return refuse("NOT_FOUND");
    const blind = input.blind === true;
    const key = input.idempotencyKey;
    const same = (r: PosStockCount) =>
      r.unitId === s.unitId && r.systemId === s.systemId && r.inventorySystemId === invS && r.locationId === loc.id && r.scope === input.scope &&
      [...r.categoryIds].sort().join(",") === categoryIds.join(",") && r.blind === blind && (r.note ?? null) === note;
    const prior = async (): Promise<OpenStockCountResult | null> => {
      const r = await db.posStockCount.findUnique({ where: { tenantId_openKey: { tenantId: s.tenantId, openKey: key } } });
      if (!r) return null;
      return same(r) ? { ok: true, count: countView(r), duplicated: true } : refuse("IDEMPOTENCY_CONFLICT");
    };
    // ── คีย์กันซ้ำ ──
    const before = await prior();
    if (before) return before;
    // ── tx ──
    let created: PosStockCount;
    try {
      created = await runTx(db, async (tx) => {
        // เลขรอบต่อสาขา: เรียงคิวด้วย advisory lock ของสาขา · @@unique([unitId, countNo]) เป็นด่านสุดท้าย
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`PosStockCount:${s.unitId}`}))`;
        const open = await tx.posStockCount.findFirst({ where: { tenantId: s.tenantId, inventorySystemId: invS, locationId: loc.id, status: "OPEN" }, select: { id: true } });
        if (open) throw new RefuseTx(refuse("COUNT_ALREADY_OPEN", { countId: open.id }));
        const max = await tx.posStockCount.aggregate({ where: { unitId: s.unitId }, _max: { countNo: true } });
        const countNo = (max._max.countNo ?? 0) + 1;
        // บรรทัดตายตัวตั้งแต่เปิด: สินค้า (ไม่ใช่บริการ) ที่ยังไม่เก็บถาวรของคลังสาขา (+ หมวดที่เลือก)
        const items = await tx.invItem.findMany({
          where: { tenantId: s.tenantId, systemId: invS, kind: "PRODUCT", archivedAt: null, ...(input.scope === "CATEGORY" ? { categoryId: { in: categoryIds } } : {}) },
          select: { id: true, onHand: true },
          orderBy: { id: "asc" },
        });
        const snapshotAt = new Date();
        const qty = await locQtyMap(tx, invCtx, items, loc);
        const row = await tx.posStockCount.create({
          data: {
            tenantId: s.tenantId,
            systemId: s.systemId,
            unitId: s.unitId,
            inventorySystemId: invS,
            locationId: loc.id,
            countNo,
            scope: input.scope,
            categoryIds,
            blind,
            status: "OPEN",
            note,
            snapshotAt,
            openedByUserId: s.actor.userId,
            openKey: key,
          },
        });
        if (items.length) {
          await tx.posStockCountLine.createMany({
            data: items.map((i) => ({ tenantId: s.tenantId, countId: row.id, itemId: i.id, snapshotQty: qty.get(i.id) ?? 0 })),
          });
        }
        return row;
      });
    } catch (e) {
      if (e instanceof RefuseTx || !isUniqueViolation(e)) throw e;
      // แข่งเปิด: partial unique PosStockCount_open_location_key (หรือคีย์เดียวกัน) ตัดสิน — ผู้แพ้ rollback
      const again = await prior();
      if (again) return again;
      const w = await db.posStockCount.findFirst({ where: { tenantId: s.tenantId, inventorySystemId: invS, locationId: loc.id, status: "OPEN" }, select: { id: true } });
      if (w) return refuse("COUNT_ALREADY_OPEN", { countId: w.id });
      throw e;
    }
    return { ok: true, count: countView(created) };
  });
}

// ═══════════ บันทึกการนับ (R5 R6) ═══════════
export type RecordStockCountInput = {
  countId: string;
  itemId?: string;
  code?: string;
  qty?: number;
  mode: StockCountMode;
  idempotencyKey: string;
};
export type RecordStockCountResult = { ok: true; line: StockCountLineView; entryId: string; duplicated?: true } | StockCountRefusal;

type Resolved = { itemId: string; qty: number } | StockCountRefusal;

/**
 * R5 รหัส → สินค้า (ตัวแรกที่เจอชนะ): (1) ป้ายเครื่องชั่ง → PosProduct ชั่งของระบบ POS นี้ (กรัมจากป้าย · ป้ายราคา = แปลงด้วยราคาต่อกก.)
 * (2) InvItem.barcode (3) InvItem.sku ของคลังรอบนี้ — รวมบริการ/ของเก็บถาวร (เจอแต่ไม่มีบรรทัด = NOT_IN_COUNT) · ไม่เจอ = UNKNOWN_CODE
 */
async function resolveCountCode(db: Db, s: Scope, c: PosStockCount, code: string, qty: number | undefined): Promise<Resolved> {
  const label = parseWeighedBarcode(code, s.posSettings);
  if (label) {
    const p = await db.posProduct.findFirst({
      where: { tenantId: s.tenantId, systemId: s.systemId, scalePlu: label.itemCode, soldByWeight: true, archivedAt: null, invItemId: { not: null } },
      select: { invItemId: true, basePriceSatang: true },
    });
    if (p?.invItemId) {
      if (qty !== undefined) return refuse("VALIDATION"); // จำนวนมาจากป้าย — ส่ง qty ซ้ำไม่ได้
      const grams = label.grams ?? (p.basePriceSatang && p.basePriceSatang > 0 ? weighedGramsFromPrice(label.priceSatang ?? 0, p.basePriceSatang) : -1);
      if (!isInt(grams, 0, STOCK_COUNT_QTY_MAX)) return refuse("VALIDATION");
      return { itemId: p.invItemId, qty: grams };
    }
  }
  if (qty === undefined) return refuse("VALIDATION");
  const where = { tenantId: c.tenantId, systemId: c.inventorySystemId };
  let hits = await db.invItem.findMany({ where: { ...where, barcode: code }, select: { id: true }, take: 10 });
  if (!hits.length) hits = await db.invItem.findMany({ where: { ...where, sku: code }, select: { id: true }, take: 10 });
  if (!hits.length) return refuse("UNKNOWN_CODE");
  if (hits.length > 1) {
    const withLine = await db.posStockCountLine.findFirst({ where: { countId: c.id, itemId: { in: hits.map((h) => h.id) } }, select: { itemId: true } });
    if (withLine) return { itemId: withLine.itemId, qty };
  }
  return { itemId: hits[0]!.id, qty };
}

export async function recordStockCount(ctx: RegisterCtx, actor: RegisterActor, input: RecordStockCountInput, client?: Db): Promise<RecordStockCountResult> {
  const db = client ?? prisma;
  return guard("recordStockCount", async (): Promise<RecordStockCountResult> => {
    const s = await scopeOf(db, ctx, actor);
    if (isRefusal(s)) return s;
    if (!canCount(s)) return refuse("PERMISSION_DENIED");
    // ── ตรวจค่า (R5 R14) ──
    if (!isRecord(input) || !onlyKeys(input, ["countId", "itemId", "code", "qty", "mode", "idempotencyKey"])) return refuse("VALIDATION");
    if (!isId(input.countId) || !isKey(input.idempotencyKey)) return refuse("VALIDATION");
    const mode = input.mode;
    if (mode !== "SET" && mode !== "ADD") return refuse("VALIDATION");
    const hasItem = input.itemId !== undefined;
    const hasCode = input.code !== undefined;
    if (hasItem === hasCode) return refuse("VALIDATION");
    if (hasItem && !isId(input.itemId)) return refuse("VALIDATION");
    const code = hasCode ? (typeof input.code === "string" ? input.code.trim() : "") : null;
    if (hasCode && (!code || code.length > 128 || code.includes("\u0000"))) return refuse("VALIDATION");
    const minQty = mode === "ADD" ? 1 : 0;
    if (input.qty !== undefined && !isInt(input.qty, minQty, STOCK_COUNT_QTY_MAX)) return refuse("VALIDATION");
    if (hasItem && input.qty === undefined) return refuse("VALIDATION");
    const key = input.idempotencyKey;
    // ── รอบของสาขานี้ ──
    const c = await countInScope(db, s, input.countId);
    if (!c) return refuse("NOT_FOUND");
    const view = async (lineId: string) => {
      const l = await db.posStockCountLine.findUnique({ where: { id: lineId } });
      return l ? (await lineViews(db, s, c, [l]))[0]! : null;
    };
    // ── คีย์กันซ้ำ (payload เดิม = duplicated ไม่เปลี่ยนอะไร) ──
    const prior = async (): Promise<RecordStockCountResult | null> => {
      const en = await db.posStockCountEntry.findUnique({ where: { tenantId_idempotencyKey: { tenantId: s.tenantId, idempotencyKey: key } } });
      if (!en) return null;
      const same =
        en.countId === c.id && en.mode === mode && (en.code ?? null) === code && (!hasItem || en.itemId === input.itemId) && (input.qty === undefined || en.qty === input.qty);
      if (!same) return refuse("IDEMPOTENCY_CONFLICT");
      const lv = await view(en.lineId);
      return lv ? { ok: true, line: lv, entryId: en.id, duplicated: true } : refuse("INTERNAL");
    };
    const before = await prior();
    if (before) return before;
    if (c.status !== "OPEN") return refuse("COUNT_NOT_OPEN");
    // ── รหัส/สินค้า → บรรทัดของรอบ ──
    const r: Resolved = hasItem ? { itemId: input.itemId as string, qty: input.qty as number } : await resolveCountCode(db, s, c, code as string, input.qty);
    if (isRefusal(r)) return r;
    if (!isInt(r.qty, minQty, STOCK_COUNT_QTY_MAX)) return refuse("VALIDATION");
    const line0 = await db.posStockCountLine.findUnique({ where: { countId_itemId: { countId: c.id, itemId: r.itemId } }, select: { id: true } });
    if (!line0) return refuse("NOT_IN_COUNT");
    const loc = await countLocation(db, c);
    const invCtx = { tenantId: c.tenantId, systemId: c.inventorySystemId };
    // ── tx: รอบ FOR SHARE → บรรทัด FOR NO KEY UPDATE → สินค้า (lockItemsInTx) → อ่านยอดที่เก็บ → entry + บรรทัด ──
    let out: { lineId: string; entryId: string };
    try {
      out = await runTx(db, async (tx) => {
        const st = await tx.$queryRaw<{ status: string }[]>`
          SELECT "status"::text AS status FROM "PosStockCount" WHERE "id" = ${c.id} AND "tenantId" = ${c.tenantId} FOR SHARE`;
        if (st[0]?.status !== "OPEN") throw new RefuseTx(refuse("COUNT_NOT_OPEN"));
        const ln = await tx.$queryRaw<{ countedQty: number | null }[]>`
          SELECT "countedQty" FROM "PosStockCountLine" WHERE "id" = ${line0.id} AND "countId" = ${c.id} FOR NO KEY UPDATE`;
        if (!ln.length) throw new RefuseTx(refuse("NOT_IN_COUNT"));
        await inventory.lockItemsInTx(tx, invCtx, [r.itemId]);
        const it = await tx.invItem.findFirst({ where: { id: r.itemId, tenantId: invCtx.tenantId, systemId: invCtx.systemId }, select: { id: true, onHand: true } });
        if (!it) throw new RefuseTx(refuse("NOT_IN_COUNT"));
        const expected = (await locQtyMap(tx, invCtx, [it], loc)).get(it.id) ?? 0;
        const counted = mode === "SET" ? r.qty : (ln[0]!.countedQty ?? 0) + r.qty;
        if (counted > COUNTED_MAX) throw new RefuseTx(refuse("VALIDATION"));
        const countedAt = new Date(); // หลังได้ล็อกสินค้า ⇒ ทุก movement ของสินค้านี้ลงก่อนหรือหลังจุดนี้ชัดเจน (R6)
        const en = await tx.posStockCountEntry.create({
          data: { tenantId: c.tenantId, countId: c.id, lineId: line0.id, itemId: r.itemId, mode, qty: r.qty, code, byUserId: s.actor.userId, idempotencyKey: key },
          select: { id: true },
        });
        await tx.posStockCountLine.update({ where: { id: line0.id }, data: { countedQty: counted, expectedAtCount: expected, countedAt } });
        return { lineId: line0.id, entryId: en.id };
      });
    } catch (e) {
      if (e instanceof RefuseTx || !isUniqueViolation(e)) throw e;
      const again = await prior(); // คีย์เดียวกันพร้อมกัน — ผู้แพ้อ่านผลของผู้ชนะ
      if (again) return again;
      throw e;
    }
    const lv = await view(out.lineId);
    return lv ? { ok: true, line: lv, entryId: out.entryId } : refuse("INTERNAL");
  });
}

// ═══════════ อ่าน (R11) ═══════════
export type GetStockCountResult = { ok: true; count: StockCountView; lines: StockCountLineView[]; summary: StockCountSummary } | StockCountRefusal;

export async function getStockCount(ctx: RegisterCtx, actor: RegisterActor, input: { countId: string; filter?: StockCountFilter }, client?: Db): Promise<GetStockCountResult> {
  const db = client ?? prisma;
  return guard("getStockCount", async (): Promise<GetStockCountResult> => {
    const s = await scopeOf(db, ctx, actor);
    if (isRefusal(s)) return s;
    if (!canCount(s)) return refuse("PERMISSION_DENIED");
    if (!isRecord(input) || !onlyKeys(input, ["countId", "filter"]) || !isId(input.countId)) return refuse("VALIDATION");
    const filter = input.filter ?? "ALL";
    if (filter !== "ALL" && filter !== "UNCOUNTED" && filter !== "VARIANCE") return refuse("VALIDATION");
    const c = await countInScope(db, s, input.countId);
    if (!c) return refuse("NOT_FOUND");
    // R2 F2: ผู้เรียกใต้ blind ไม่ได้รู้ผลต่าง — ตัวกรอง VARIANCE = VALIDATION · summary.withVariance = null
    const hide = c.blind && !canAdjust(s);
    if (hide && filter === "VARIANCE") return refuse("VALIDATION");
    const rows = await db.posStockCountLine.findMany({ where: { countId: c.id, tenantId: c.tenantId }, orderBy: { id: "asc" } });
    const all = await lineViews(db, s, c, rows);
    all.sort((a, b) => a.name.localeCompare(b.name, "th") || a.id.localeCompare(b.id));
    // ผลต่างนับจากแถวจริง (ใช้เฉพาะผู้ที่เห็นตัวเลข)
    const varianceOf = new Map(rows.map((l) => [l.id, l.varianceQty ?? (l.countedQty !== null && l.expectedAtCount !== null ? l.countedQty - l.expectedAtCount : null)]));
    const summary: StockCountSummary = {
      total: rows.length,
      counted: rows.filter((l) => l.countedQty !== null).length,
      withVariance: hide ? null : rows.filter((l) => (varianceOf.get(l.id) ?? 0) !== 0).length,
    };
    const lines =
      filter === "UNCOUNTED" ? all.filter((l) => l.countedQty === null) : filter === "VARIANCE" ? all.filter((l) => (varianceOf.get(l.id) ?? 0) !== 0) : all;
    return { ok: true, count: countView(c), lines, summary };
  });
}

export type ListStockCountsResult = { ok: true; items: StockCountView[] } | StockCountRefusal;

export async function listStockCounts(ctx: RegisterCtx, actor: RegisterActor, input: { status?: StockCountStatus; limit?: number } = {}, client?: Db): Promise<ListStockCountsResult> {
  const db = client ?? prisma;
  return guard("listStockCounts", async (): Promise<ListStockCountsResult> => {
    const s = await scopeOf(db, ctx, actor);
    if (isRefusal(s)) return s;
    if (!canCount(s)) return refuse("PERMISSION_DENIED");
    const inp = input ?? {};
    if (!isRecord(inp) || !onlyKeys(inp, ["status", "limit"])) return refuse("VALIDATION");
    if (inp.status !== undefined && inp.status !== "OPEN" && inp.status !== "CONFIRMED" && inp.status !== "CANCELLED") return refuse("VALIDATION");
    if (inp.limit !== undefined && !isInt(inp.limit, 1, STOCK_COUNT_LIST_MAX)) return refuse("VALIDATION");
    const rows = await db.posStockCount.findMany({
      where: { tenantId: s.tenantId, systemId: s.systemId, unitId: s.unitId, ...(inp.status ? { status: inp.status } : {}) },
      orderBy: [{ countNo: "desc" }],
      take: inp.limit ?? 20,
    });
    return { ok: true, items: rows.map(countView) };
  });
}

// ═══════════ ยืนยัน (R7 R10) ═══════════
export type ConfirmStockCountResult =
  | { ok: true; count: StockCountView; adjustedLines: number; varianceValueSatang: number; duplicated?: true }
  | StockCountRefusal;

export async function confirmStockCount(
  ctx: RegisterCtx,
  actor: RegisterActor,
  input: { countId: string; uncounted?: "SKIP" | "ZERO"; idempotencyKey: string },
  client?: Db,
): Promise<ConfirmStockCountResult> {
  const db = client ?? prisma;
  return guard("confirmStockCount", async (): Promise<ConfirmStockCountResult> => {
    const s = await scopeOf(db, ctx, actor);
    if (isRefusal(s)) return s;
    if (!canAdjust(s)) return refuse("PERMISSION_DENIED");
    if (!isRecord(input) || !onlyKeys(input, ["countId", "uncounted", "idempotencyKey"])) return refuse("VALIDATION");
    if (!isId(input.countId) || !isKey(input.idempotencyKey)) return refuse("VALIDATION");
    const uncounted = input.uncounted ?? "SKIP";
    if (uncounted !== "SKIP" && uncounted !== "ZERO") return refuse("VALIDATION");
    const key = input.idempotencyKey;
    const c0 = await countInScope(db, s, input.countId);
    if (!c0) return refuse("NOT_FOUND");
    /** ผลของรอบที่ยืนยันแล้ว (อ่านจากบรรทัดที่แช่แข็ง) */
    const done = async (r: PosStockCount, duplicated: boolean): Promise<ConfirmStockCountResult> => {
      const ls = await db.posStockCountLine.findMany({ where: { countId: r.id, tenantId: r.tenantId }, select: { varianceQty: true, costSatang: true, movementId: true } });
      return {
        ok: true,
        count: countView(r),
        adjustedLines: ls.filter((l) => l.movementId !== null).length,
        varianceValueSatang: ls.reduce((a, l) => a + (l.varianceQty ?? 0) * (l.costSatang ?? 0), 0),
        ...(duplicated ? { duplicated: true as const } : {}),
      };
    };
    if (c0.status === "CONFIRMED" && c0.confirmKey === key) return done(c0, true);
    if (c0.status !== "OPEN") return refuse("COUNT_NOT_OPEN");
    const invCtx = { tenantId: c0.tenantId, systemId: c0.inventorySystemId };
    const loc = await countLocation(db, c0);
    // ── tx: รอบ FOR UPDATE → สินค้าทุกตัว (lockItemsInTx เรียง id) → ADJUST ผลต่าง → แช่แข็งบรรทัด → CONFIRMED + audit + event ──
    const res = await runTx(db, async (tx): Promise<{ row: PosStockCount; duplicated: boolean; adjusted: string[] }> => {
      const got = await tx.$queryRaw<{ id: string }[]>`
        SELECT "id" FROM "PosStockCount" WHERE "id" = ${c0.id} AND "tenantId" = ${c0.tenantId} AND "unitId" = ${c0.unitId} FOR UPDATE`;
      if (!got.length) throw new RefuseTx(refuse("NOT_FOUND"));
      const c = (await tx.posStockCount.findUnique({ where: { id: c0.id } }))!;
      if (c.status === "CONFIRMED" && c.confirmKey === key) return { row: c, duplicated: true, adjusted: [] };
      if (c.status !== "OPEN") throw new RefuseTx(refuse("COUNT_NOT_OPEN"));
      const all = await tx.posStockCountLine.findMany({ where: { countId: c.id, tenantId: c.tenantId }, orderBy: { itemId: "asc" } });
      const targets = all.filter((l) => l.countedQty !== null || uncounted === "ZERO");
      if (!all.some((l) => l.countedQty !== null) && (uncounted === "SKIP" || targets.length === 0)) throw new RefuseTx(refuse("NOTHING_COUNTED"));
      // R2 F1: เกินเพดาน → ปฏิเสธก่อนล็อกสินค้า (รอบยังเปิด แบ่งนับตามหมวดได้)
      if (targets.length > STOCK_COUNT_CONFIRM_MAX_LINES) throw new RefuseTx(refuse("COUNT_TOO_LARGE"));
      const ids = targets.map((l) => l.itemId);
      await inventory.lockItemsInTx(tx, invCtx, ids);
      const items = await tx.invItem.findMany({ where: { tenantId: invCtx.tenantId, systemId: invCtx.systemId, id: { in: ids } }, select: { id: true, onHand: true, costSatang: true } });
      const byId = new Map(items.map((i) => [i.id, i]));
      const zeroItems = targets.filter((l) => l.countedQty === null).map((l) => byId.get(l.itemId)).filter((i): i is NonNullable<typeof i> => !!i);
      const zeroQty = await locQtyMap(tx, invCtx, zeroItems, loc);
      const now = new Date();
      const adjusted: string[] = [];
      let counted = 0;
      let varianceQtyNet = 0;
      let varianceValueSatang = 0;
      for (const l of targets) {
        const it = byId.get(l.itemId);
        if (!it) throw new Error(`stock count line item missing: ${l.itemId}`);
        const isZero = l.countedQty === null;
        const countedQty = isZero ? 0 : l.countedQty!;
        const expected = isZero ? (zeroQty.get(it.id) ?? 0) : (l.expectedAtCount ?? 0);
        const variance = countedQty - expected;
        let movementId: string | null = null;
        if (variance !== 0) {
          // R6/R8: ผลต่างเป็น delta บนยอดปัจจุบัน (ล็อกอยู่) — ทุก movement หลังนับยังอยู่ในยอด
          const mv = await inventory.adjustInTx(tx, invCtx, {
            itemId: it.id,
            newQty: it.onHand + variance,
            locationId: c.locationId,
            idempotencyKey: `pos-count-${c.id}-${it.id}`,
            sourceModule: "POS",
            refType: "PosStockCount",
            refId: c.id,
            note: `ตรวจนับ #${c.countNo}`,
          });
          movementId = mv.id;
          adjusted.push(it.id);
        }
        await tx.posStockCountLine.update({
          where: { id: l.id },
          data: { varianceQty: variance, costSatang: it.costSatang, movementId, ...(isZero ? { countedQty: 0, expectedAtCount: expected, countedAt: now } : {}) },
        });
        counted++;
        varianceQtyNet += variance;
        varianceValueSatang += variance * it.costSatang;
      }
      const row = await tx.posStockCount.update({
        where: { id: c.id },
        data: { status: "CONFIRMED", confirmKey: key, confirmedByUserId: s.actor.userId, confirmedAt: now },
      });
      const summary = { countedLines: counted, adjustedLines: adjusted.length, varianceQtyNet, varianceValueSatang, uncounted };
      await tx.auditLog.create({
        data: {
          tenantId: c.tenantId,
          unitId: c.unitId,
          actorType: "USER",
          actorId: s.actor.userId,
          action: "pos.stockCount.confirm",
          targetType: "PosStockCount",
          targetId: c.id,
          before: { status: "OPEN" } as Prisma.InputJsonValue,
          after: { status: "CONFIRMED", ...summary } as Prisma.InputJsonValue,
        },
      });
      await emitOutbox(tx, {
        tenantId: c.tenantId,
        type: EVENT_CONFIRMED,
        idempotencyKey: `PosStockCount#${c.id}#CONFIRMED`,
        payload: {
          countId: c.id,
          countNo: c.countNo,
          unitId: c.unitId,
          inventorySystemId: c.inventorySystemId,
          locationId: c.locationId,
          countedLines: counted,
          adjustedLines: adjusted.length,
          varianceQtyNet,
          varianceValueSatang,
        },
        systemId: c.systemId,
        unitId: c.unitId,
      });
      return { row, duplicated: false, adjusted };
    }, CONFIRM_TX_TIMEOUT_MS);
    if (!res.duplicated) {
      // หลัง commit: กระจกสินค้าบัญชีตามยอดใหม่ (แบบ adjust เดิม · ADJUST ไม่โพสต์ GL — R15/Q2)
      for (const id of res.adjusted) await inventory.syncAccountProductAfterTx(invCtx, id);
      scheduleDrain();
    }
    return done(res.row, res.duplicated);
  });
}

// ═══════════ ยกเลิก (R9) ═══════════
export type CancelStockCountResult = { ok: true; count: StockCountView; duplicated?: true } | StockCountRefusal;

export async function cancelStockCount(
  ctx: RegisterCtx,
  actor: RegisterActor,
  input: { countId: string; reason: string; idempotencyKey: string },
  client?: Db,
): Promise<CancelStockCountResult> {
  const db = client ?? prisma;
  return guard("cancelStockCount", async (): Promise<CancelStockCountResult> => {
    const s = await scopeOf(db, ctx, actor);
    if (isRefusal(s)) return s;
    const adjustAll = canAdjust(s);
    if (!adjustAll && !canCount(s)) return refuse("PERMISSION_DENIED");
    if (!isRecord(input) || !onlyKeys(input, ["countId", "reason", "idempotencyKey"])) return refuse("VALIDATION");
    if (!isId(input.countId) || !isKey(input.idempotencyKey)) return refuse("VALIDATION");
    const reason = reqText(input.reason, STOCK_COUNT_REASON_MAX);
    if (!reason) return refuse("VALIDATION");
    const key = input.idempotencyKey;
    const c0 = await countInScope(db, s, input.countId);
    if (!c0) return refuse("NOT_FOUND");
    // R12: ผู้ไม่มีสิทธิ์ปรับสต็อกยกเลิกได้เฉพาะรอบที่ตัวเองเปิด
    if (!adjustAll && c0.openedByUserId !== s.actor.userId) return refuse("PERMISSION_DENIED");
    if (c0.status === "CANCELLED" && c0.cancelKey === key) return { ok: true, count: countView(c0), duplicated: true };
    if (c0.status !== "OPEN") return refuse("COUNT_NOT_OPEN");
    const res = await runTx(db, async (tx): Promise<{ row: PosStockCount; duplicated: boolean }> => {
      const got = await tx.$queryRaw<{ id: string }[]>`
        SELECT "id" FROM "PosStockCount" WHERE "id" = ${c0.id} AND "tenantId" = ${c0.tenantId} AND "unitId" = ${c0.unitId} FOR UPDATE`;
      if (!got.length) throw new RefuseTx(refuse("NOT_FOUND"));
      const c = (await tx.posStockCount.findUnique({ where: { id: c0.id } }))!;
      if (c.status === "CANCELLED" && c.cancelKey === key) return { row: c, duplicated: true };
      if (c.status !== "OPEN") throw new RefuseTx(refuse("COUNT_NOT_OPEN"));
      const row = await tx.posStockCount.update({
        where: { id: c.id },
        data: { status: "CANCELLED", cancelKey: key, cancelledByUserId: s.actor.userId, cancelledAt: new Date(), cancelReason: reason },
      });
      await tx.auditLog.create({
        data: {
          tenantId: c.tenantId,
          unitId: c.unitId,
          actorType: "USER",
          actorId: s.actor.userId,
          action: "pos.stockCount.cancel",
          targetType: "PosStockCount",
          targetId: c.id,
          before: { status: "OPEN" } as Prisma.InputJsonValue,
          after: { status: "CANCELLED", reason } as Prisma.InputJsonValue,
        },
      });
      return { row, duplicated: false };
    });
    return { ok: true, count: countView(res.row), ...(res.duplicated ? { duplicated: true as const } : {}) };
  });
}

// ═══════════ ทางลัด รับ/โอน/ปรับ (R13) ═══════════
type StockItem = { id: string; kind: string; archivedAt: Date | null; costSatang: number };
type ShortcutScope = { s: Scope; invCtx: { tenantId: string; systemId: string } };

/** ขอบเขต + สิทธิ์ + มีคลัง (ลำดับเดียวกันทุกทางลัด) */
async function shortcutScope(db: Db, ctx: unknown, actor: unknown, permission: string): Promise<ShortcutScope | StockCountRefusal> {
  const s = await scopeOf(db, ctx, actor);
  if (isRefusal(s)) return s;
  if (!can(s, "inventory", permission)) return refuse("PERMISSION_DENIED");
  if (!s.inventorySystemId) return refuse("NO_INVENTORY");
  return { s, invCtx: { tenantId: s.tenantId, systemId: s.inventorySystemId } };
}

/** itemId หรือรหัส (บาร์โค้ด → SKU ของคลังสาขา) — ไม่พบ id = NOT_FOUND · รหัสไม่รู้จัก = UNKNOWN_CODE · บริการ/เก็บถาวร = NOT_STOCKED */
async function stockItem(db: Db, invCtx: { tenantId: string; systemId: string }, input: Record<string, unknown>): Promise<StockItem | StockCountRefusal> {
  const sel = { id: true, kind: true, archivedAt: true, costSatang: true } as const;
  let it: StockItem | null;
  if (input.itemId !== undefined) {
    it = await db.invItem.findFirst({ where: { ...invCtx, id: input.itemId as string }, select: sel });
    if (!it) return refuse("NOT_FOUND");
  } else {
    const code = String(input.code).trim();
    it =
      (await db.invItem.findFirst({ where: { ...invCtx, barcode: code }, select: sel, orderBy: [{ archivedAt: { sort: "asc", nulls: "first" } }, { id: "asc" }] })) ??
      (await db.invItem.findFirst({ where: { ...invCtx, sku: code }, select: sel }));
    if (!it) return refuse("UNKNOWN_CODE");
  }
  if (it.kind !== "PRODUCT" || it.archivedAt) return refuse("NOT_STOCKED");
  return it;
}

/** ตรวจค่า itemId XOR code */
function itemOrCodeOk(input: Record<string, unknown>): boolean {
  const hasItem = input.itemId !== undefined;
  const hasCode = input.code !== undefined;
  if (hasItem === hasCode) return false;
  if (hasItem) return isId(input.itemId);
  return typeof input.code === "string" && !!input.code.trim() && input.code.length <= 128 && !input.code.includes("\u0000");
}

async function shortcutAudit(db: Db, s: Scope, action: string, movementId: string, after: Record<string, unknown>): Promise<void> {
  // R13: เขียนหลัง movement commit (ตัวห่อของคลังถือ tx เอง) — ล้มตรงนี้เสียแค่แถว audit ไม่เสียสต็อก
  await db.auditLog.create({
    data: { tenantId: s.tenantId, unitId: s.unitId, actorType: "USER", actorId: s.actor.userId, action, targetType: "InvMovement", targetId: movementId, after: after as Prisma.InputJsonValue },
  });
}

export type ShortcutResult = { ok: true; movementId: string; duplicated?: true } | StockCountRefusal;
export type TransferShortcutResult = { ok: true; movementIds: [string, string]; duplicated?: true } | StockCountRefusal;

export type PosReceiveStockInput = {
  itemId?: string;
  code?: string;
  qty: number;
  costSatang?: number;
  lotCode?: string;
  expiryDate?: string;
  note?: string;
  idempotencyKey: string;
};

export async function posReceiveStock(ctx: RegisterCtx, actor: RegisterActor, input: PosReceiveStockInput, client?: Db): Promise<ShortcutResult> {
  const db = client ?? prisma;
  return guard("posReceiveStock", async (): Promise<ShortcutResult> => {
    const sc = await shortcutScope(db, ctx, actor, "inventory.movement.receive");
    if (isRefusal(sc)) return sc;
    const { s, invCtx } = sc;
    if (!isRecord(input) || !onlyKeys(input, ["itemId", "code", "qty", "costSatang", "lotCode", "expiryDate", "note", "idempotencyKey"])) return refuse("VALIDATION");
    if (!itemOrCodeOk(input) || !isKey(input.idempotencyKey) || !isInt(input.qty, 1, STOCK_COUNT_QTY_MAX)) return refuse("VALIDATION");
    if (input.costSatang !== undefined && !isInt(input.costSatang, 0, COUNTED_MAX)) return refuse("VALIDATION");
    const note = optText(input.note, STOCK_COUNT_NOTE_MAX);
    const lotCode = optText(input.lotCode, LOT_MAX);
    if (note === false || lotCode === false) return refuse("VALIDATION");
    let expiryDate: Date | null = null;
    if (input.expiryDate !== undefined) {
      if (typeof input.expiryDate !== "string" || !lotCode) return refuse("VALIDATION");
      expiryDate = new Date(input.expiryDate);
      if (Number.isNaN(expiryDate.getTime())) return refuse("VALIDATION");
    }
    const it = await stockItem(db, invCtx, input);
    if (isRefusal(it)) return it;
    const mvKey = `pos-recv-${input.idempotencyKey}`;
    const dup = await db.invMovement.findFirst({ where: { tenantId: s.tenantId, idempotencyKey: mvKey }, select: { id: true, itemId: true, type: true, qtyDelta: true } });
    if (dup) return dup.itemId === it.id && dup.type === "IN" && dup.qtyDelta === input.qty ? { ok: true, movementId: dup.id, duplicated: true } : refuse("IDEMPOTENCY_CONFLICT");
    // ไม่ส่งต้นทุน = ต้นทุนเฉลี่ยปัจจุบัน (ค่าเฉลี่ยไม่ขยับ)
    const mv = await inventory.receive(invCtx, {
      itemId: it.id,
      qty: input.qty,
      costSatang: input.costSatang ?? it.costSatang,
      idempotencyKey: mvKey,
      sourceModule: "POS",
      refType: "PosUnit",
      refId: s.unitId,
      note,
      lotCode,
      expiryDate,
    });
    await shortcutAudit(db, s, "pos.stock.receive", mv.id, { itemId: it.id, qty: input.qty, costSatang: input.costSatang ?? null, lotCode });
    return { ok: true, movementId: mv.id };
  });
}

export type PosTransferStockInput = {
  itemId?: string;
  code?: string;
  qty: number;
  fromLocationId?: string;
  toLocationId: string;
  note?: string;
  idempotencyKey: string;
};

export async function posTransferStock(ctx: RegisterCtx, actor: RegisterActor, input: PosTransferStockInput, client?: Db): Promise<TransferShortcutResult> {
  const db = client ?? prisma;
  return guard("posTransferStock", async (): Promise<TransferShortcutResult> => {
    const sc = await shortcutScope(db, ctx, actor, "inventory.movement.transfer");
    if (isRefusal(sc)) return sc;
    const { s, invCtx } = sc;
    if (!isRecord(input) || !onlyKeys(input, ["itemId", "code", "qty", "fromLocationId", "toLocationId", "note", "idempotencyKey"])) return refuse("VALIDATION");
    if (!itemOrCodeOk(input) || !isKey(input.idempotencyKey) || !isInt(input.qty, 1, STOCK_COUNT_QTY_MAX)) return refuse("VALIDATION");
    if (!isId(input.toLocationId) || (input.fromLocationId !== undefined && !isId(input.fromLocationId))) return refuse("VALIDATION");
    const note = optText(input.note, STOCK_COUNT_NOTE_MAX);
    if (note === false) return refuse("VALIDATION");
    const fromId = input.fromLocationId ?? (await inventory.ensureDefaultLocation(invCtx)).id;
    if (fromId === input.toLocationId) return refuse("VALIDATION");
    // R16: ที่เก็บของคลังสาขาเดียวกันเท่านั้น
    const [from, to] = await Promise.all([liveLocation(db, s.tenantId, invCtx.systemId, fromId), liveLocation(db, s.tenantId, invCtx.systemId, input.toLocationId)]);
    if (!from || !to) return refuse("NOT_FOUND");
    const it = await stockItem(db, invCtx, input);
    if (isRefusal(it)) return it;
    const base = `pos-tf-${input.idempotencyKey}`;
    const pair = async () => {
      const ms = await db.invMovement.findMany({ where: { tenantId: s.tenantId, idempotencyKey: { in: [`${base}-out`, `${base}-in`] } }, select: { id: true, itemId: true, qtyDelta: true, locationId: true, idempotencyKey: true } });
      return { out: ms.find((m) => m.idempotencyKey === `${base}-out`), inn: ms.find((m) => m.idempotencyKey === `${base}-in`) };
    };
    const samePair = (p: Awaited<ReturnType<typeof pair>>) =>
      !!p.out && !!p.inn && p.out.itemId === it.id && p.out.qtyDelta === -input.qty && p.out.locationId === from.id && p.inn.locationId === to.id;
    const before = await pair();
    if (before.out || before.inn) return samePair(before) ? { ok: true, movementIds: [before.out!.id, before.inn!.id], duplicated: true } : refuse("IDEMPOTENCY_CONFLICT");
    const r = await inventory.transfer(invCtx, { itemId: it.id, fromLocationId: from.id, toLocationId: to.id, qty: input.qty, idempotencyKey: base, note });
    const after = await pair();
    if (!samePair(after)) return refuse("IDEMPOTENCY_CONFLICT");
    if (!r.ok) return { ok: true, movementIds: [after.out!.id, after.inn!.id], duplicated: true }; // คีย์เดียวกันพร้อมกัน — อีกรายการชนะ
    await shortcutAudit(db, s, "pos.stock.transfer", after.out!.id, { itemId: it.id, qty: input.qty, fromLocationId: from.id, toLocationId: to.id });
    return { ok: true, movementIds: [after.out!.id, after.inn!.id] };
  });
}

export type PosAdjustStockInput = {
  itemId?: string;
  code?: string;
  deltaQty: number;
  reason: string;
  locationId?: string;
  idempotencyKey: string;
};

export async function posAdjustStock(ctx: RegisterCtx, actor: RegisterActor, input: PosAdjustStockInput, client?: Db): Promise<ShortcutResult> {
  const db = client ?? prisma;
  return guard("posAdjustStock", async (): Promise<ShortcutResult> => {
    const sc = await shortcutScope(db, ctx, actor, "inventory.movement.adjust");
    if (isRefusal(sc)) return sc;
    const { s, invCtx } = sc;
    if (!isRecord(input) || !onlyKeys(input, ["itemId", "code", "deltaQty", "reason", "locationId", "idempotencyKey"])) return refuse("VALIDATION");
    if (!itemOrCodeOk(input) || !isKey(input.idempotencyKey)) return refuse("VALIDATION");
    if (!isInt(input.deltaQty, -STOCK_COUNT_QTY_MAX, STOCK_COUNT_QTY_MAX) || input.deltaQty === 0) return refuse("VALIDATION");
    const reason = reqText(input.reason, STOCK_COUNT_REASON_MAX);
    if (!reason) return refuse("VALIDATION");
    if (input.locationId !== undefined && !isId(input.locationId)) return refuse("VALIDATION");
    const locId = input.locationId ?? (await inventory.ensureDefaultLocation(invCtx)).id;
    const loc = await liveLocation(db, s.tenantId, invCtx.systemId, locId);
    if (!loc) return refuse("NOT_FOUND");
    const it = await stockItem(db, invCtx, input);
    if (isRefusal(it)) return it;
    const delta = input.deltaQty;
    const mvKey = `pos-adj-${input.idempotencyKey}`;
    type Prior = { id: string; itemId: string; type: string; qtyDelta: number } | null;
    const judge = (m: NonNullable<Prior>): ShortcutResult =>
      m.itemId === it.id && m.type === "ADJUST" && m.qtyDelta === delta ? { ok: true, movementId: m.id, duplicated: true } : refuse("IDEMPOTENCY_CONFLICT");
    const sel = { id: true, itemId: true, type: true, qtyDelta: true } as const;
    const dup: Prior = await db.invMovement.findFirst({ where: { tenantId: s.tenantId, idempotencyKey: mvKey }, select: sel });
    if (dup) return judge(dup);
    // tx เอง: ล็อกสินค้า → ตรวจคีย์ซ้ำใต้ล็อก → ยอดปัจจุบัน + delta ผ่าน adjustInTx · ชนกันลองใหม่ 1 ครั้ง (แบบตัวห่อของคลัง)
    const run = () =>
      runTx(db, async (tx): Promise<{ prior: Prior; id: string | null }> => {
        await inventory.lockItemsInTx(tx, invCtx, [it.id]);
        const again: Prior = await tx.invMovement.findFirst({ where: { tenantId: s.tenantId, idempotencyKey: mvKey }, select: sel });
        if (again) return { prior: again, id: null };
        const cur = await tx.invItem.findFirst({ where: { ...invCtx, id: it.id }, select: { onHand: true } });
        if (!cur) throw new RefuseTx(refuse("NOT_FOUND"));
        const mv = await inventory.adjustInTx(tx, invCtx, {
          itemId: it.id,
          newQty: cur.onHand + delta,
          locationId: loc.id,
          idempotencyKey: mvKey,
          sourceModule: "POS",
          refType: "PosUnit",
          refId: s.unitId,
          note: reason,
        });
        return { prior: null, id: mv.id };
      });
    let out: { prior: Prior; id: string | null };
    try {
      out = await run();
    } catch (e) {
      if (e instanceof RefuseTx || !inventory.isStockContention(e)) throw e;
      out = await run();
    }
    if (out.prior) return judge(out.prior);
    await inventory.syncAccountProductAfterTx(invCtx, it.id);
    await shortcutAudit(db, s, "pos.stock.adjust", out.id!, { itemId: it.id, deltaQty: delta, reason, locationId: loc.id });
    return { ok: true, movementId: out.id! };
  });
}
