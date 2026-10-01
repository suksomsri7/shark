// catalog.ts — แคตตาล็อกเดียวของ POS (WO P1.1a) · ผู้เขียนเดียวของ PosProduct / PosCategory / PosProductOptionGroup / RecipeLine
//
// สัญญา: ledger/pos-briefs/pos-brief-P1.1a.md (R1–R8 + addendum 1 ต.ค.) · ledger/wo-notes/pos-P0.3-catalog.md "Ratified names"
//   • ctx = { tenantId, systemId (AppSystem type POS), actorUserId | null } — null = ผู้เรียกระดับระบบ (backfill/ผู้เขียนเดิม)
//     ข้ามการตรวจสิทธิ์ แต่ยังตรวจร้าน/ระบบเสมอ · ทุกฟังก์ชันรับ `client` ท้ายสุด (PrismaClient หรือ tx) ได้
//   • ปฏิเสธ = throw `CatalogError` ที่มี `.code` คงที่: NOT_FOUND (ข้ามร้าน/ข้ามสาขา/ข้ามระบบ — แบบ 404 ไม่บอกว่ามีอยู่)
//     · PERMISSION_DENIED · VALIDATION · CONFLICT — ข้อความไทยที่ไม่โทษผู้ใช้และไม่สะท้อนข้อมูลของร้านอื่น
//   • เงิน = สตางค์ Int · basePriceSatang null = "ยังไม่ตั้งราคา" (ไม่ใช้ต้นทุนแทน) · 0 = ตั้งใจให้ฟรี
//   • ทุกการเขียนมีแถว AuditLog (targetType PosProduct/PosCategory · action pos.product.* / pos.category.*) ในธุรกรรมเดียวกัน
// 🔴 P1.1a: ไม่มี dual-write และไม่เขียนกลับตารางเดิม (AccountProduct/MenuItem/ShopProduct/InvItem) — เป็นงานของ P1.1b
//    ข้อยกเว้นเดียว: backfill ตั้งคอลัมน์เชื่อมใหม่ `MenuItem.posProductId` / `ShopProduct.posProductId` (ไม่แตะ updatedAt)
// 🔴 ห้ามแตะ createSale/voidSale (service.ts) · register.ts — จอเดิมทุกจอยังอ่านตารางเดิมตามเดิม

import { randomUUID } from "node:crypto";
import { Prisma, type PosProduct, type PosProductKind, type PrismaClient } from "@prisma/client";
import { canAccessUnit, evaluate, type MembershipCtx } from "@/lib/core/rbac";
import { prisma } from "./db";

// ═══════════════════ ชนิดข้อมูล + error ═══════════════════

export type CatalogCtx = { tenantId: string; systemId: string; actorUserId: string | null };
/** client ของผู้เรียก — PrismaClient (เปิดธุรกรรมให้เอง) หรือ tx ที่ผู้เรียกเปิดไว้แล้ว */
export type CatalogClient = PrismaClient | Prisma.TransactionClient;

export type CatalogErrorCode = "NOT_FOUND" | "PERMISSION_DENIED" | "VALIDATION" | "CONFLICT";

/** error ของแคตตาล็อก — ผู้เรียกตัดสินจาก `.code` เท่านั้น (ข้อความไว้แสดงผู้ใช้) */
export class CatalogError extends Error {
  readonly code: CatalogErrorCode;
  constructor(code: CatalogErrorCode, message: string) {
    super(message);
    this.name = "CatalogError";
    this.code = code;
  }
}

const notFound = () => new CatalogError("NOT_FOUND", "ไม่พบรายการนี้ในระบบขาย");
const denied = () => new CatalogError("PERMISSION_DENIED", "บัญชีนี้ยังไม่ได้รับสิทธิ์ทำรายการนี้ — ขอสิทธิ์จากเจ้าของร้าน");
const invalid = (message: string) => new CatalogError("VALIDATION", message);
const conflict = (message: string) => new CatalogError("CONFLICT", message);

export const PRODUCT_KINDS: readonly PosProductKind[] = ["PRODUCT", "SERVICE", "MENU", "BUNDLE"];
/** สิทธิ์: เปลี่ยนราคา · เพิ่ม/แก้/เก็บสินค้าและหมวด (อ่านรายการ = แค่เข้าถึงสาขาได้ — แคชเชียร์ต้องขายได้) */
export const PERM_SET_PRICE = "pos.product.setPrice";
export const PERM_MANAGE = "pos.product.manage";
const MAX_SATANG = 2_000_000_000; // ใต้เพดาน Int4 ของ Postgres
const MAX_NAME = 200;
const MAX_PAGE = 500;

/** หน้าตาสินค้าชั้นขาย (POS-API §1 `GET /products`) — เงินเป็นสตางค์ Int */
export type PosProductView = {
  id: string;
  invItemId: string | null;
  unitId: string | null;
  name: string;
  nameEn: string | null;
  kind: PosProductKind;
  categoryId: string | null;
  basePriceSatang: number | null;
  vatRateBp: number | null;
  barcode: string | null;
  sku: string | null;
  trackStock: boolean;
  images: string[];
  optionGroups: PosOptionGroupView[];
  /** P1.2 เป็นเจ้าของ — P1.1a ว่างเสมอ */
  variants: { id: string }[];
  recipe: { invItemId: string; qty: number }[];
  /** ราคาต่อช่องทาง — ใบช่องทางขายเป็นเจ้าของ · P1.1a ว่างเสมอ */
  channelPrices: { channelId: string; priceSatang: number }[];
  /** ขายได้ที่สาขานี้ไหม (key = unitId ที่ขอ) */
  availability: Record<string, boolean>;
  /** สต็อกคงเหลือ (key = unitId ที่ขอ · = InvItem.onHand รวมทั้งระบบคลัง — ยังไม่มีสต็อกระดับสาขา) */
  stock: Record<string, number>;
};
export type PosOptionGroupView = {
  id: string;
  groupId: string;
  name: string;
  nameEn: string | null;
  minSelect: number;
  maxSelect: number;
  sortOrder: number;
  choices: { id: string; name: string; nameEn: string | null; priceDelta: number; isDefault: boolean; isOutOfStock: boolean }[];
};

// ═══════════════════ ตัวช่วยภายใน ═══════════════════

/** ธุรกรรม: ผู้เรียกส่ง PrismaClient มา = เปิดใหม่ · ส่ง tx มา = ใช้ของผู้เรียก (commit/rollback เป็นของเขา) */
async function inTx<T>(client: CatalogClient, fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  if ("$transaction" in client && typeof client.$transaction === "function") return client.$transaction((tx) => fn(tx));
  return fn(client);
}

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const toStrings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
const isSatang = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= MAX_SATANG;

function cleanName(v: unknown, label: string): string {
  if (typeof v !== "string") throw invalid(`กรุณาใส่${label}`);
  const s = v.trim();
  if (!s) throw invalid(`กรุณาใส่${label}`);
  if (s.length > MAX_NAME) throw invalid(`${label}ยาวเกิน ${MAX_NAME} ตัวอักษร`);
  return s;
}
function cleanOptional(v: unknown, label: string): string | null {
  if (v === undefined || v === null) return null;
  if (typeof v !== "string") throw invalid(`${label}ต้องเป็นข้อความ`);
  const s = v.trim();
  if (s.length > MAX_NAME) throw invalid(`${label}ยาวเกิน ${MAX_NAME} ตัวอักษร`);
  return s || null;
}

/**
 * AUDIT-CLASS X2: ctx ต้องชี้ระบบ POS ของร้านนี้จริง (ห้ามเชื่อ systemId จากผู้เรียก) — ไม่ใช่ = NOT_FOUND
 * (ctx ที่ systemId เป็น POS ของร้านอื่น → ไม่พบ เหมือน 404 ไม่บอกว่ามีอยู่)
 */
async function assertPosSystem(ctx: CatalogCtx, db: CatalogClient): Promise<void> {
  if (!ctx || typeof ctx.tenantId !== "string" || !ctx.tenantId || typeof ctx.systemId !== "string" || !ctx.systemId) throw notFound();
  const sys = await db.appSystem.findFirst({ where: { id: ctx.systemId, tenantId: ctx.tenantId, type: "POS" }, select: { id: true } });
  if (!sys) throw notFound();
}

/** ผู้กระทำ: null = ระบบ · ผู้ใช้ที่ไม่ใช่สมาชิกของร้านนี้ = NOT_FOUND (ไม่บอกว่ามีร้านนี้) */
async function actorOf(ctx: CatalogCtx, db: CatalogClient): Promise<MembershipCtx | null> {
  if (ctx.actorUserId === null) return null;
  if (typeof ctx.actorUserId !== "string" || !ctx.actorUserId) throw notFound();
  const m = await db.membership.findUnique({
    where: { userId_tenantId: { userId: ctx.actorUserId, tenantId: ctx.tenantId } },
    select: { role: true, unitAccess: true, permissions: true },
  });
  if (!m) throw notFound();
  return { role: m.role, unitAccess: toStrings(m.unitAccess), permissions: isRecord(m.permissions) ? m.permissions : {} };
}

/** AUDIT-CLASS X3: สิทธิ์ตามทะเบียน (OWNER/MANAGER ผ่าน · STAFF ต้องมีคีย์) — ระบบ (null) ผ่าน */
function requirePerm(actor: MembershipCtx | null, action: string, unitId?: string | null): void {
  if (!actor) return;
  if (!evaluate(actor, { module: "pos", action, unitId: unitId ?? undefined })) throw denied();
}

/** AUDIT-CLASS X2: สาขาต้องผูกระบบ POS ใน ctx และผู้กระทำเข้าถึงสาขานั้นได้ — ไม่ใช่ = NOT_FOUND (ข้ามสาขาแบบ 404) */
async function assertUnit(ctx: CatalogCtx, actor: MembershipCtx | null, unitId: unknown, db: CatalogClient): Promise<string> {
  if (typeof unitId !== "string" || !unitId) throw notFound();
  const link = await db.appSystemUnit.findUnique({
    where: { tenantId_unitId_type: { tenantId: ctx.tenantId, unitId, type: "POS" } },
    select: { systemId: true },
  });
  if (!link || link.systemId !== ctx.systemId) throw notFound();
  if (actor && !canAccessUnit(actor, unitId)) throw notFound();
  return unitId;
}

/** สินค้าของระบบ POS ใน ctx (+ ผู้กระทำเข้าถึงสาขาของสินค้าได้) — ไม่ใช่ = NOT_FOUND */
async function loadProduct(ctx: CatalogCtx, actor: MembershipCtx | null, id: unknown, db: CatalogClient): Promise<PosProduct> {
  if (typeof id !== "string" || !id) throw notFound();
  // AUDIT-CLASS X2: id + tenantId + systemId ในคำสั่งเดียว — productId ของร้านอื่น/ระบบอื่น = ไม่พบ
  const p = await db.posProduct.findFirst({ where: { id, tenantId: ctx.tenantId, systemId: ctx.systemId } });
  if (!p) throw notFound();
  if (actor && p.unitId && !canAccessUnit(actor, p.unitId)) throw notFound();
  return p;
}

/** ระบบคลังที่ "ขายผ่าน" ระบบ POS นี้ = คลังที่ผูกสาขา (ไม่เก็บถาวร) เดียวกับ POS นี้ — ทางเดียวกับหน้าขาย (resolvePosLinks) */
async function inventorySystemsOfPos(tenantId: string, posSystemId: string, db: CatalogClient): Promise<string[]> {
  const posLinks = await db.appSystemUnit.findMany({ where: { tenantId, systemId: posSystemId, type: "POS" }, select: { unitId: true } });
  if (!posLinks.length) return [];
  const live = await db.businessUnit.findMany({
    where: { tenantId, id: { in: posLinks.map((l) => l.unitId) }, status: { not: "ARCHIVED" } },
    select: { id: true },
  });
  if (!live.length) return [];
  const inv = await db.appSystemUnit.findMany({
    where: { tenantId, type: "INVENTORY", unitId: { in: live.map((u) => u.id) } },
    select: { systemId: true },
  });
  return [...new Set(inv.map((l) => l.systemId))];
}

/**
 * AUDIT-CLASS X6: ล็อกระดับร้านของ "การสร้างแถวที่ผูก InvItem" (backfill · ensureForInvItem · createProduct ผูกคลัง ·
 * บาร์โค้ด/หมวดซ้ำ) — pg_advisory_xact_lock หลุดเองตอน commit/rollback · ใช้กับ pooler โหมด transaction ได้
 */
async function lockTenant(tx: Prisma.TransactionClient, key: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`;
}

async function audit(
  tx: Prisma.TransactionClient,
  ctx: CatalogCtx,
  action: string,
  targetType: "PosProduct" | "PosCategory",
  targetId: string,
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null,
): Promise<void> {
  // ในธุรกรรมเดียวกับการเขียน (ไม่ใช่ writeAudit แบบกลืน error) — ไม่มีแถวเขียนที่ไม่มีร่องรอย
  await tx.auditLog.create({
    data: {
      tenantId: ctx.tenantId,
      actorType: ctx.actorUserId ? "USER" : "SYSTEM",
      actorId: ctx.actorUserId,
      action,
      targetType,
      targetId,
      before: before ? (before as unknown as Prisma.InputJsonValue) : undefined,
      after: after ? (after as unknown as Prisma.InputJsonValue) : undefined,
    },
  });
}

// ═══════════════════ R2 · ระบบ POS ของแหล่งข้อมูลเดิม (ตัวตัดสินเดียว) ═══════════════════

/** ข้อมูลการผูกระบบของร้าน 1 ร้าน (โหลดครั้งเดียว ใช้ตัดสินทุกแถว) */
export type PosResolution = {
  tenantId: string;
  /** สาขา → ระบบ POS (AppSystemUnit type POS · 1 สาขา/1 POS) */
  unitPos: Map<string, string>;
  /** ระบบคลัง → ระบบ POS ที่ขายของคลังนั้น (ผ่านสาขาไม่เก็บถาวรที่ผูกทั้งคู่) */
  inventoryPos: Map<string, string[]>;
  /** POS ตัวแรกของร้าน (createdAt เก่าสุด — listSystems(tenant,"POS")[0]) */
  firstPos: string | null;
};
export type CatalogSource = { kind: "invItem"; inventorySystemId: string } | { kind: "menuItem"; unitId: string } | { kind: "shopProduct" };
export type PosResolveResult = { systemId: string; reason: null } | { systemId: null; reason: "NO_POS" | "AMBIGUOUS_POS" };

export async function loadPosResolution(tenantId: string, client: CatalogClient = prisma): Promise<PosResolution> {
  const [links, archived, first] = await Promise.all([
    client.appSystemUnit.findMany({ where: { tenantId, type: { in: ["POS", "INVENTORY"] } }, select: { unitId: true, systemId: true, type: true } }),
    client.businessUnit.findMany({ where: { tenantId, status: "ARCHIVED" }, select: { id: true } }),
    client.appSystem.findFirst({ where: { tenantId, type: "POS" }, orderBy: [{ createdAt: "asc" }], select: { id: true } }),
  ]);
  const archivedIds = new Set(archived.map((u) => u.id));
  const unitPos = new Map<string, string>();
  for (const l of links) if (l.type === "POS") unitPos.set(l.unitId, l.systemId);
  const inventoryPos = new Map<string, string[]>();
  for (const l of links) {
    if (l.type !== "INVENTORY" || archivedIds.has(l.unitId)) continue;
    const pos = unitPos.get(l.unitId);
    if (!pos) continue;
    const cur = inventoryPos.get(l.systemId) ?? [];
    if (!cur.includes(pos)) inventoryPos.set(l.systemId, [...cur, pos]);
  }
  return { tenantId, unitPos, inventoryPos, firstPos: first?.id ?? null };
}

/**
 * R2 — แถวเดิมนี้ "ขายอยู่ในระบบ POS ไหน" วันนี้ (ทางเดียวกับทางขายจริง ⇒ บรรทัดขายพรุ่งนี้ลงระบบที่ขายมันจริง)
 *   • InvItem    → หน้าขายแสดง InvItem ของ **ระบบคลังที่ผูกสาขาเดียวกับ POS** (`register/page.tsx:53-55` resolvePosLinks
 *                  → `register.ts:125-133` systemForUnit(INVENTORY) → `posCatalog` :137) · สาขาเก็บถาวรไม่นับ (`posUnits` register.ts:101-112 กรอง ARCHIVED :108)
 *                  ⇒ คลังนั้นผูก POS ได้ 1 ตัวพอดี = ระบบนั้น · 0 ตัว = NO_POS · >1 ตัว = AMBIGUOUS_POS (ไม่เดา)
 *   • MenuItem   → เช็คบิลร้านอาหารใช้ `systemForUnit(tenant, unitId, "POS")` (`restaurant/order.ts:421`) ⇒ POS ของสาขาเมนู · ไม่มี = NO_POS
 *   • ShopProduct→ ยืนยันรับเงินเว็บร้านใช้ `listSystems(tenant,"POS")[0]` (`shop/service.ts:217`) = POS ตัวแรกของร้าน
 *                  **ไม่ดูสาขา** (โค้ดชนะ · แก้ "POS ตัวแรก" เป็นงาน P2.1) ⇒ ร้านไม่มี POS เลย = NO_POS
 */
export function resolvePosSystem(res: PosResolution, source: CatalogSource): PosResolveResult {
  if (source.kind === "invItem") {
    const list = res.inventoryPos.get(source.inventorySystemId) ?? [];
    if (list.length === 1) return { systemId: list[0]!, reason: null };
    return { systemId: null, reason: list.length === 0 ? "NO_POS" : "AMBIGUOUS_POS" };
  }
  if (source.kind === "menuItem") {
    const s = res.unitPos.get(source.unitId);
    return s ? { systemId: s, reason: null } : { systemId: null, reason: "NO_POS" };
  }
  return res.firstPos ? { systemId: res.firstPos, reason: null } : { systemId: null, reason: "NO_POS" };
}

// ═══════════════════ R4 · ราคาตั้งต้น (ไม่ใช้ต้นทุนเด็ดขาด) ═══════════════════

export type PriceSources = {
  ap?: { salePrice: number | null; posPrice: number | null } | null;
  inv?: { kind: string; priceSatang: number } | null;
  /** ราคาของแถวตัวเอง: MenuItem.basePrice (เมนู) · ShopProduct.priceSatang (สินค้าเว็บล้วน) */
  ownPriceSatang?: number | null;
};

/**
 * AUDIT-CLASS X4: ลำดับราคา (มติ R4 + addendum) — สตางค์ Int เสมอ
 *   1) AccountProduct.posPrice > 0  (posPrice 0 = ไม่นับ — หน้าบัญชีใช้ null/0 แทน "เท่าราคาขาย")
 *   2) AccountProduct.salePrice ไม่ใช่ null  (0 = ร้านตั้งใจให้ฟรี — คงไว้ · null = ยังไม่ตั้ง)
 *   3) InvItem.priceSatang ของบริการ (SERVICE) > 0  (ค่าปริยาย 0 แยกไม่ออกจาก "ยังไม่ตั้ง" ⇒ 0 ไม่นับ)
 *   4) ราคาของแถวตัวเอง (เมนู basePrice · เว็บล้วน priceSatang — ช่องบังคับของต้นทาง ⇒ 0 = ตั้งใจ)
 *   5) ไม่มี = null "ยังไม่ตั้งราคา" (หน้าขายเดิมใช้ต้นทุนแทน — แคตตาล็อกใหม่ไม่ทำ)
 */
export function initialPriceSatang(s: PriceSources): number | null {
  const ap = s.ap ?? null;
  if (ap && typeof ap.posPrice === "number" && ap.posPrice > 0) return ap.posPrice;
  if (ap && typeof ap.salePrice === "number") return ap.salePrice;
  if (s.inv && s.inv.kind === "SERVICE" && s.inv.priceSatang > 0) return s.inv.priceSatang;
  if (typeof s.ownPriceSatang === "number") return s.ownPriceSatang;
  return null;
}

/** trackStock ตั้งต้น: ผูก InvItem + ไม่ใช่เมนู + InvItem นั้นเคยเคลื่อนไหวหรือคงเหลือ ≠ 0 (หลังจากนี้คอลัมน์คือความจริง) */
export function initialTrackStock(kind: PosProductKind, invItemId: string | null, hasMovement: boolean, onHand: number): boolean {
  return !!invItemId && kind !== "MENU" && (hasMovement || onHand !== 0);
}

type ApRow = { id: string; invItemId: string | null; salePrice: number | null; posPrice: number | null; vatRateBp: number; createdAt: Date };
/** AccountProduct ของ InvItem: ผ่าน InvItem.accountProductId ก่อน · ไม่มีก็หาจาก AccountProduct.invItemId (เก่าสุดก่อน) */
function apOfItem(inv: { id: string; accountProductId: string | null }, byId: Map<string, ApRow>, byInv: Map<string, ApRow>): ApRow | null {
  return (inv.accountProductId ? byId.get(inv.accountProductId) : undefined) ?? byInv.get(inv.id) ?? null;
}
function indexAps(rows: ApRow[]): { byId: Map<string, ApRow>; byInv: Map<string, ApRow> } {
  const byId = new Map(rows.map((r) => [r.id, r]));
  const byInv = new Map<string, ApRow>();
  for (const r of [...rows].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id)))
    if (r.invItemId && !byInv.has(r.invItemId)) byInv.set(r.invItemId, r);
  return { byId, byInv };
}

// ═══════════════════ ตัวอ่าน: listForUnit · byBarcode ═══════════════════

type Cursor = { n: string; i: string };
const encodeCursor = (p: { name: string; id: string }) => Buffer.from(JSON.stringify({ n: p.name, i: p.id })).toString("base64url");
function decodeCursor(v: unknown): Cursor {
  if (typeof v !== "string" || !v) throw invalid("ตำแหน่งหน้าถัดไปไม่ถูกต้อง — โหลดรายการใหม่อีกครั้ง");
  try {
    const o: unknown = JSON.parse(Buffer.from(v, "base64url").toString("utf8"));
    if (isRecord(o) && typeof o.n === "string" && typeof o.i === "string") return { n: o.n, i: o.i };
  } catch {
    /* ตกไปโยนด้านล่าง */
  }
  throw invalid("ตำแหน่งหน้าถัดไปไม่ถูกต้อง — โหลดรายการใหม่อีกครั้ง");
}

/** แปลงแถว → หน้าตา POS-API §1 (โหลดของประกอบเป็นชุดเดียวต่อหน้า ไม่ยิงทีละแถว) */
async function toViews(tenantId: string, unitId: string, rows: PosProduct[], db: CatalogClient): Promise<PosProductView[]> {
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const invIds = [...new Set(rows.map((r) => r.invItemId).filter((x): x is string => !!x))];
  const [items, links, recipes] = await Promise.all([
    invIds.length
      ? db.invItem.findMany({ where: { tenantId, id: { in: invIds } }, select: { id: true, onHand: true, barcode: true, sku: true } })
      : Promise.resolve([]),
    db.posProductOptionGroup.findMany({ where: { tenantId, productId: { in: ids } }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] }),
    db.recipeLine.findMany({ where: { tenantId, productId: { in: ids } }, orderBy: [{ createdAt: "asc" }] }),
  ]);
  const groupIds = [...new Set(links.map((l) => l.groupId))];
  const groups = groupIds.length
    ? await db.menuOptionGroup.findMany({
        where: { tenantId, id: { in: groupIds }, archivedAt: null },
        include: { choices: { where: { archivedAt: null }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] } },
      })
    : [];
  const itemById = new Map(items.map((i) => [i.id, i]));
  const groupById = new Map(groups.map((g) => [g.id, g]));
  return rows.map((p) => {
    const inv = p.invItemId ? itemById.get(p.invItemId) : undefined;
    const optionGroups: PosOptionGroupView[] = links
      .filter((l) => l.productId === p.id)
      .flatMap((l) => {
        const g = groupById.get(l.groupId);
        if (!g) return [];
        return [{
          id: g.id,
          groupId: g.id,
          name: g.name,
          nameEn: g.nameEn,
          minSelect: g.minSelect,
          maxSelect: g.maxSelect,
          sortOrder: l.sortOrder,
          choices: g.choices.map((c) => ({ id: c.id, name: c.name, nameEn: c.nameEn, priceDelta: c.priceDelta, isDefault: c.isDefault, isOutOfStock: c.isOutOfStock })),
        }];
      });
    return {
      id: p.id,
      invItemId: p.invItemId,
      unitId: p.unitId,
      name: p.name,
      nameEn: p.nameEn,
      kind: p.kind,
      categoryId: p.categoryId,
      basePriceSatang: p.basePriceSatang,
      vatRateBp: p.vatRateBp,
      barcode: p.barcode ?? inv?.barcode ?? null,
      sku: inv?.sku ?? null,
      trackStock: p.trackStock,
      images: toStrings(p.images),
      optionGroups,
      variants: [],
      recipe: recipes.filter((r) => r.productId === p.id).map((r) => ({ invItemId: r.invItemId, qty: r.qty })),
      channelPrices: [],
      availability: { [unitId]: !p.unavailableUnitIds.includes(unitId) && !p.isOutOfStock },
      stock: inv ? { [unitId]: inv.onHand } : {},
    };
  });
}

/**
 * รายการสินค้าที่ขายได้ที่สาขานี้ (สินค้าทุกสาขา unitId null + ของสาขานี้ · ไม่รวมที่เก็บถาวร)
 *   • ค้นฝั่ง server (`q`): ชื่อไทย/อังกฤษ · บาร์โค้ด · SKU ของ InvItem — ไม่มีเพดาน 200 แบบหน้าขายเดิม
 *   • แบ่งหน้า: ส่ง `limit` (1–500) → ได้ `nextCursor` (keyset ตาม ชื่อ+id · ไม่ซ้ำ ไม่ข้ามแม้มีแถวเพิ่มระหว่างเดิน)
 *     ไม่ส่ง `limit` = คืนครบทุกแถว (`nextCursor` null)
 *   • สิทธิ์: เข้าถึงสาขาได้ก็พอ (แคชเชียร์ต้องขายได้) · สาขาที่ไม่ผูก POS นี้/เข้าไม่ได้ = NOT_FOUND
 */
export async function listForUnit(
  ctx: CatalogCtx,
  unitId: string,
  opts: { q?: string; limit?: number; cursor?: string | null } = {},
  client: CatalogClient = prisma,
): Promise<{ items: PosProductView[]; nextCursor: string | null }> {
  await assertPosSystem(ctx, client);
  const actor = await actorOf(ctx, client);
  const unit = await assertUnit(ctx, actor, unitId, client);
  const o = isRecord(opts) ? opts : {};
  let limit: number | null = null;
  if (o.limit !== undefined && o.limit !== null) {
    if (typeof o.limit !== "number" || !Number.isInteger(o.limit) || o.limit < 1 || o.limit > MAX_PAGE) throw invalid(`จำนวนต่อหน้าต้องอยู่ระหว่าง 1–${MAX_PAGE}`);
    limit = o.limit;
  }
  const cur = o.cursor === undefined || o.cursor === null ? null : decodeCursor(o.cursor);
  const q = typeof o.q === "string" ? o.q.trim().slice(0, 100) : "";

  const and: Prisma.PosProductWhereInput[] = [
    // AUDIT-CLASS X2: ร้าน + ระบบ ของ ctx เสมอ · ของสาขาอื่นไม่โผล่
    { tenantId: ctx.tenantId, systemId: ctx.systemId, archivedAt: null },
    { OR: [{ unitId: null }, { unitId: unit }] },
  ];
  if (q) {
    const invSystems = await inventorySystemsOfPos(ctx.tenantId, ctx.systemId, client);
    const hitItems = invSystems.length
      ? await client.invItem.findMany({
          where: { tenantId: ctx.tenantId, systemId: { in: invSystems }, OR: [{ sku: { contains: q, mode: "insensitive" } }, { barcode: { contains: q, mode: "insensitive" } }] },
          select: { id: true },
          take: 2000,
        })
      : [];
    and.push({
      OR: [
        { name: { contains: q, mode: "insensitive" } },
        { nameEn: { contains: q, mode: "insensitive" } },
        { barcode: { contains: q, mode: "insensitive" } },
        ...(hitItems.length ? [{ invItemId: { in: hitItems.map((i) => i.id) } }] : []),
      ],
    });
  }
  if (cur) and.push({ OR: [{ name: { gt: cur.n } }, { name: cur.n, id: { gt: cur.i } }] });
  const rows = await client.posProduct.findMany({
    where: { AND: and },
    orderBy: [{ name: "asc" }, { id: "asc" }],
    ...(limit ? { take: limit + 1 } : {}),
  });
  const page = limit ? rows.slice(0, limit) : rows;
  const nextCursor = limit && rows.length > limit ? encodeCursor(page[page.length - 1]!) : null;
  return { items: await toViews(ctx.tenantId, unit, page, client), nextCursor };
}

/** หาสินค้าด้วยบาร์โค้ดตรงตัว (ของแถวเอง หรือของ InvItem ที่ผูก) ในระบบ+สาขานี้ · ไม่พบ = null */
export async function byBarcode(ctx: CatalogCtx, unitId: string, barcode: string, client: CatalogClient = prisma): Promise<PosProductView | null> {
  await assertPosSystem(ctx, client);
  const actor = await actorOf(ctx, client);
  const unit = await assertUnit(ctx, actor, unitId, client);
  const code = typeof barcode === "string" ? barcode.trim() : "";
  if (!code) return null;
  const invSystems = await inventorySystemsOfPos(ctx.tenantId, ctx.systemId, client);
  const items = invSystems.length
    ? await client.invItem.findMany({ where: { tenantId: ctx.tenantId, systemId: { in: invSystems }, barcode: code }, select: { id: true } })
    : [];
  const row = await client.posProduct.findFirst({
    where: {
      tenantId: ctx.tenantId,
      systemId: ctx.systemId,
      archivedAt: null,
      AND: [
        { OR: [{ unitId: null }, { unitId: unit }] },
        { OR: [{ barcode: code }, ...(items.length ? [{ invItemId: { in: items.map((i) => i.id) } }] : [])] },
      ],
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
  if (!row) return null;
  return (await toViews(ctx.tenantId, unit, [row], client))[0] ?? null;
}

// ═══════════════════ ตัวเขียน ═══════════════════

export type CreateProductInput = {
  name: string;
  nameEn?: string | null;
  kind?: PosProductKind;
  categoryId?: string | null;
  basePriceSatang?: number | null;
  vatRateBp?: number | null;
  barcode?: string | null;
  unitId?: string | null;
  invItemId?: string | null;
};

function cleanVat(v: unknown): number | null {
  if (v === undefined || v === null) return null;
  if (typeof v !== "number" || !Number.isInteger(v) || v < 0 || v > 10_000) throw invalid("อัตรา VAT ต้องเป็นจำนวนเต็ม 0–10000 (หน่วย 0.01%)");
  return v;
}

/** หมวดต้องเป็นของร้าน+ระบบนี้ และยังไม่เก็บถาวร — ไม่ใช่ = NOT_FOUND */
async function assertCategory(ctx: CatalogCtx, categoryId: unknown, db: CatalogClient): Promise<string | null> {
  if (categoryId === undefined || categoryId === null) return null;
  if (typeof categoryId !== "string" || !categoryId) throw notFound();
  const c = await db.posCategory.findFirst({ where: { id: categoryId, tenantId: ctx.tenantId, systemId: ctx.systemId, archivedAt: null }, select: { id: true } });
  if (!c) throw notFound();
  return c.id;
}

/** บาร์โค้ดซ้ำในระบบ POS นี้ (ของแถวเอง หรือของ InvItem ในคลังที่ขายผ่าน POS นี้) = CONFLICT */
async function assertBarcodeFree(ctx: CatalogCtx, code: string, exceptId: string | null, db: CatalogClient): Promise<void> {
  const invSystems = await inventorySystemsOfPos(ctx.tenantId, ctx.systemId, db);
  const items = invSystems.length
    ? await db.invItem.findMany({ where: { tenantId: ctx.tenantId, systemId: { in: invSystems }, barcode: code }, select: { id: true } })
    : [];
  const clash = await db.posProduct.findFirst({
    where: {
      tenantId: ctx.tenantId,
      systemId: ctx.systemId,
      archivedAt: null,
      ...(exceptId ? { id: { not: exceptId } } : {}),
      OR: [{ barcode: code }, ...(items.length ? [{ invItemId: { in: items.map((i) => i.id) } }] : [])],
    },
    select: { id: true },
  });
  if (clash || (items.length > 0 && !exceptId)) throw conflict("บาร์โค้ดนี้มีสินค้าอื่นใช้อยู่ในระบบขายนี้แล้ว");
}

/** InvItem ต้องอยู่ในคลังที่ขายผ่าน POS ใน ctx (ร้านเดียวกัน) — ไม่ใช่ = NOT_FOUND */
async function loadSellableItem(ctx: CatalogCtx, invItemId: unknown, db: CatalogClient) {
  if (typeof invItemId !== "string" || !invItemId) throw notFound();
  const inv = await db.invItem.findFirst({
    where: { id: invItemId, tenantId: ctx.tenantId },
    select: { id: true, systemId: true, name: true, kind: true, priceSatang: true, archivedAt: true, onHand: true, accountProductId: true, sortOrder: true },
  });
  if (!inv) throw notFound();
  if (!(await inventorySystemsOfPos(ctx.tenantId, ctx.systemId, db)).includes(inv.systemId)) throw notFound();
  return inv;
}

/** เพิ่มสินค้าในแคตตาล็อก (สิทธิ์ pos.product.manage) — kind ปริยาย PRODUCT */
export async function createProduct(ctx: CatalogCtx, input: CreateProductInput, client: CatalogClient = prisma): Promise<PosProduct> {
  return inTx(client, async (tx) => {
    await assertPosSystem(ctx, tx);
    const actor = await actorOf(ctx, tx);
    const i: Record<string, unknown> = isRecord(input) ? input : {};
    const unitId = i.unitId === undefined || i.unitId === null ? null : await assertUnit(ctx, actor, i.unitId, tx);
    requirePerm(actor, PERM_MANAGE, unitId);
    const name = cleanName(i.name, "ชื่อสินค้า");
    const nameEn = cleanOptional(i.nameEn, "ชื่อภาษาอังกฤษ");
    const kind = (i.kind ?? "PRODUCT") as PosProductKind;
    if (!PRODUCT_KINDS.includes(kind)) throw invalid("ชนิดสินค้าไม่ถูกต้อง");
    const price = i.basePriceSatang === undefined || i.basePriceSatang === null ? null : i.basePriceSatang;
    if (price !== null && !isSatang(price)) throw invalid("ราคาต้องเป็นจำนวนเต็มสตางค์ไม่ติดลบ");
    const vatRateBp = cleanVat(i.vatRateBp);
    const barcode = cleanOptional(i.barcode, "บาร์โค้ด");
    const categoryId = await assertCategory(ctx, i.categoryId, tx);
    // AUDIT-CLASS X6: แถวผูกคลัง/บาร์โค้ด ตรวจซ้ำ + เขียน ภายใต้ล็อกร้าน (สองคนกดพร้อมกันไม่ได้แถวซ้ำ)
    await lockTenant(tx, `pos-catalog:${ctx.tenantId}`);
    let invItemId: string | null = null;
    let trackStock = false;
    if (i.invItemId !== undefined && i.invItemId !== null) {
      const inv = await loadSellableItem(ctx, i.invItemId, tx);
      if (await tx.posProduct.findFirst({ where: { tenantId: ctx.tenantId, systemId: ctx.systemId, invItemId: inv.id }, select: { id: true } }))
        throw conflict("สินค้าจากคลังรายการนี้อยู่ในแคตตาล็อกขายแล้ว");
      invItemId = inv.id;
      const moved = await tx.invMovement.findFirst({ where: { tenantId: ctx.tenantId, itemId: inv.id }, select: { id: true } });
      trackStock = initialTrackStock(kind, invItemId, !!moved, inv.onHand);
    }
    if (barcode) await assertBarcodeFree(ctx, barcode, null, tx);
    const row = await tx.posProduct.create({
      data: {
        tenantId: ctx.tenantId,
        systemId: ctx.systemId,
        unitId,
        invItemId,
        kind,
        name,
        nameEn,
        categoryId,
        basePriceSatang: price as number | null,
        vatRateBp,
        barcode,
        trackStock,
      },
    });
    await audit(tx, ctx, "pos.product.create", "PosProduct", row.id, null, {
      name, kind, unitId, invItemId, basePriceSatang: row.basePriceSatang, vatRateBp, barcode, categoryId,
    });
    return row;
  });
}

export type UpdateProductPatch = {
  name?: string;
  nameEn?: string | null;
  categoryId?: string | null;
  unitId?: string | null;
  trackStock?: boolean;
  /** เปิด/ปิดขายรายสาขา { [unitId]: true|false } — แทน setAvailability (ไม่มีฟังก์ชันนั้น) */
  availability?: Record<string, boolean>;
};
const PATCH_KEYS = new Set(["name", "nameEn", "categoryId", "unitId", "trackStock", "availability"]);

/** แก้ชื่อ/หมวด/สาขา/การตัดสต็อก/ความพร้อมขาย (สิทธิ์ pos.product.manage) — ราคาไปทาง setPrice */
export async function updateProduct(ctx: CatalogCtx, id: string, patch: UpdateProductPatch, client: CatalogClient = prisma): Promise<PosProduct> {
  return inTx(client, async (tx) => {
    await assertPosSystem(ctx, tx);
    const actor = await actorOf(ctx, tx);
    const before = await loadProduct(ctx, actor, id, tx);
    requirePerm(actor, PERM_MANAGE, before.unitId);
    const p: Record<string, unknown> = isRecord(patch) ? patch : {};
    const unknownKeys = Object.keys(p).filter((k) => !PATCH_KEYS.has(k));
    if (unknownKeys.length) throw invalid("มีช่องที่แก้ผ่านทางนี้ไม่ได้ (ราคาใช้การตั้งราคา)");
    const data: Prisma.PosProductUncheckedUpdateManyInput = {};
    const changed: Record<string, unknown> = {};
    if ("name" in p) data.name = changed.name = cleanName(p.name, "ชื่อสินค้า");
    if ("nameEn" in p) data.nameEn = changed.nameEn = cleanOptional(p.nameEn, "ชื่อภาษาอังกฤษ");
    if ("trackStock" in p) {
      if (typeof p.trackStock !== "boolean") throw invalid("ค่าการตัดสต็อกต้องเป็น ใช่/ไม่ใช่");
      data.trackStock = changed.trackStock = p.trackStock;
    }
    let categoryId: string | null | undefined;
    if ("categoryId" in p) categoryId = changed.categoryId = await assertCategory(ctx, p.categoryId, tx);
    let unitId: string | null | undefined;
    if ("unitId" in p) unitId = changed.unitId = p.unitId === null ? null : await assertUnit(ctx, actor, p.unitId, tx);
    let off: string[] = [];
    let on: string[] = [];
    if ("availability" in p) {
      if (!isRecord(p.availability)) throw invalid("ค่าความพร้อมขายไม่ถูกต้อง");
      for (const [u, v] of Object.entries(p.availability)) {
        if (typeof v !== "boolean") throw invalid("ค่าความพร้อมขายต้องเป็น เปิด/ปิด");
        await assertUnit(ctx, actor, u, tx);
        (v ? on : off).push(u);
      }
      changed.availability = p.availability;
    }
    if (!Object.keys(changed).length) return before;
    // AUDIT-CLASS X6: เขียนเฉพาะคอลัมน์ที่เปลี่ยนในคำสั่งเดียว (ไม่ read-modify-write ทั้งแถว) ⇒ แข่งกับ setPrice ไม่ทับกัน
    if (categoryId !== undefined) data.categoryId = categoryId;
    if (unitId !== undefined) data.unitId = unitId;
    if (Object.keys(data).length) await tx.posProduct.updateMany({ where: { id: before.id, tenantId: ctx.tenantId, systemId: ctx.systemId }, data });
    if (off.length || on.length) {
      off = [...new Set(off)];
      on = [...new Set(on)];
      // ชุดสาขาที่ปิดขาย: เพิ่ม off · ลบ on — คำสั่งเดียว (ไม่อ่านมาแก้ในโค้ด)
      await tx.$executeRaw`UPDATE "PosProduct" SET "unavailableUnitIds" = ARRAY(
          SELECT DISTINCT u FROM unnest(coalesce("unavailableUnitIds", ARRAY[]::text[]) || ${off}::text[]) AS u
          WHERE u <> ALL(${on}::text[]) ORDER BY u),
        "updatedAt" = now()
        WHERE id = ${before.id} AND "tenantId" = ${ctx.tenantId} AND "systemId" = ${ctx.systemId}`;
    }
    const prev: Record<string, unknown> = {};
    for (const k of Object.keys(changed)) prev[k] = k === "availability" ? before.unavailableUnitIds : (before as unknown as Record<string, unknown>)[k];
    await audit(tx, ctx, "pos.product.update", "PosProduct", before.id, prev, changed);
    return (await tx.posProduct.findFirst({ where: { id: before.id, tenantId: ctx.tenantId, systemId: ctx.systemId } })) ?? before;
  });
}

/** ตั้งราคาขาย (สตางค์ Int ≥ 0 · 0 = ฟรี) — สิทธิ์ pos.product.setPrice · P1.1a ไม่เขียนกลับตารางเดิม (P1.1b) */
export async function setPrice(
  ctx: CatalogCtx,
  id: string,
  priceSatang: number,
  client: CatalogClient = prisma,
): Promise<{ id: string; basePriceSatang: number }> {
  return inTx(client, async (tx) => {
    await assertPosSystem(ctx, tx);
    const actor = await actorOf(ctx, tx);
    const before = await loadProduct(ctx, actor, id, tx);
    requirePerm(actor, PERM_SET_PRICE, before.unitId);
    // AUDIT-CLASS X4: จำนวนเต็มสตางค์เท่านั้น — ติดลบ/เศษสตางค์/NaN/สตริง = VALIDATION (ราคาเดิมไม่เปลี่ยน)
    if (!isSatang(priceSatang)) throw invalid("ราคาต้องเป็นจำนวนเต็มสตางค์ไม่ติดลบ");
    // AUDIT-CLASS X6: UPDATE คำสั่งเดียวเฉพาะคอลัมน์ราคา — 10 เลนพร้อมกันได้ค่าสุดท้ายเป็นหนึ่งในค่าที่ส่ง ไม่ทับคอลัมน์อื่น
    await tx.posProduct.updateMany({ where: { id: before.id, tenantId: ctx.tenantId, systemId: ctx.systemId }, data: { basePriceSatang: priceSatang } });
    await audit(tx, ctx, "pos.product.price", "PosProduct", before.id, { basePriceSatang: before.basePriceSatang }, { basePriceSatang: priceSatang });
    return { id: before.id, basePriceSatang: priceSatang };
  });
}

/** เก็บถาวร (soft · กดซ้ำได้ไม่ error) — สิทธิ์ pos.product.manage */
export async function archive(ctx: CatalogCtx, id: string, client: CatalogClient = prisma): Promise<{ id: string; archivedAt: Date }> {
  return inTx(client, async (tx) => {
    await assertPosSystem(ctx, tx);
    const actor = await actorOf(ctx, tx);
    const before = await loadProduct(ctx, actor, id, tx);
    requirePerm(actor, PERM_MANAGE, before.unitId);
    if (before.archivedAt) return { id: before.id, archivedAt: before.archivedAt };
    const at = new Date();
    const r = await tx.posProduct.updateMany({ where: { id: before.id, tenantId: ctx.tenantId, systemId: ctx.systemId, archivedAt: null }, data: { archivedAt: at } });
    if (r.count === 1) await audit(tx, ctx, "pos.product.archive", "PosProduct", before.id, { archivedAt: null }, { archivedAt: at.toISOString() });
    return { id: before.id, archivedAt: at };
  });
}

/**
 * ให้แน่ใจว่า InvItem นี้มีแถวในแคตตาล็อกของระบบ POS ใน ctx (สร้างครั้งเดียว · เรียกซ้ำได้ id เดิม)
 * ราคาตั้งต้นตาม R4 · VAT จาก AccountProduct · trackStock ตามกติกา · ชื่อ/ชนิด/เก็บถาวร ตาม InvItem
 * AUDIT-CLASS X1 + X6: ล็อกร้าน + INSERT … ON CONFLICT DO NOTHING บน unique(systemId, invItemId) ⇒ 10 เลนพร้อมกันได้แถวเดียว id เดียว
 */
export async function ensureForInvItem(ctx: CatalogCtx, invItemId: string, client: CatalogClient = prisma): Promise<{ id: string; created: boolean }> {
  return inTx(client, async (tx) => {
    await assertPosSystem(ctx, tx);
    const actor = await actorOf(ctx, tx);
    requirePerm(actor, PERM_MANAGE, null);
    const inv = await loadSellableItem(ctx, invItemId, tx);
    const existing = await tx.posProduct.findFirst({ where: { tenantId: ctx.tenantId, systemId: ctx.systemId, invItemId: inv.id }, select: { id: true } });
    if (existing) return { id: existing.id, created: false };
    await lockTenant(tx, `pos-catalog:${ctx.tenantId}`);
    const again = await tx.posProduct.findFirst({ where: { tenantId: ctx.tenantId, systemId: ctx.systemId, invItemId: inv.id }, select: { id: true } });
    if (again) return { id: again.id, created: false };
    const aps = indexAps(
      await tx.accountProduct.findMany({
        where: { tenantId: ctx.tenantId, OR: [{ invItemId: inv.id }, ...(inv.accountProductId ? [{ id: inv.accountProductId }] : [])] },
        select: { id: true, invItemId: true, salePrice: true, posPrice: true, vatRateBp: true, createdAt: true },
      }),
    );
    const ap = apOfItem(inv, aps.byId, aps.byInv);
    const moved = await tx.invMovement.findFirst({ where: { tenantId: ctx.tenantId, itemId: inv.id }, select: { id: true } });
    const kind: PosProductKind = inv.kind === "SERVICE" ? "SERVICE" : "PRODUCT";
    const id = randomUUID();
    const r = await tx.posProduct.createMany({
      data: [{
        id,
        tenantId: ctx.tenantId,
        systemId: ctx.systemId,
        invItemId: inv.id,
        kind,
        name: inv.name,
        basePriceSatang: initialPriceSatang({ ap, inv }),
        vatRateBp: ap ? ap.vatRateBp : null,
        sortOrder: inv.sortOrder,
        trackStock: initialTrackStock(kind, inv.id, !!moved, inv.onHand),
        archivedAt: inv.archivedAt,
      }],
      skipDuplicates: true,
    });
    const row = await tx.posProduct.findFirst({ where: { tenantId: ctx.tenantId, systemId: ctx.systemId, invItemId: inv.id }, select: { id: true, basePriceSatang: true } });
    if (!row) throw notFound();
    if (r.count === 1) await audit(tx, ctx, "pos.product.create", "PosProduct", row.id, null, { invItemId: inv.id, kind, basePriceSatang: row.basePriceSatang, source: "ensureForInvItem" });
    return { id: row.id, created: r.count === 1 };
  });
}

/** เพิ่มหมวด (ทั้งระบบ หรือเฉพาะสาขา) — สิทธิ์ pos.product.manage · ชื่อซ้ำในระบบ+สาขาเดียวกัน = CONFLICT */
export async function createCategory(
  ctx: CatalogCtx,
  input: { name: string; nameEn?: string | null; unitId?: string | null; sortOrder?: number },
  client: CatalogClient = prisma,
): Promise<{ id: string; name: string; unitId: string | null }> {
  return inTx(client, async (tx) => {
    await assertPosSystem(ctx, tx);
    const actor = await actorOf(ctx, tx);
    const i: Record<string, unknown> = isRecord(input) ? input : {};
    const unitId = i.unitId === undefined || i.unitId === null ? null : await assertUnit(ctx, actor, i.unitId, tx);
    requirePerm(actor, PERM_MANAGE, unitId);
    const name = cleanName(i.name, "ชื่อหมวด");
    const nameEn = cleanOptional(i.nameEn, "ชื่อหมวดภาษาอังกฤษ");
    const sortOrder = i.sortOrder === undefined || i.sortOrder === null ? 0 : i.sortOrder;
    if (typeof sortOrder !== "number" || !Number.isInteger(sortOrder) || Math.abs(sortOrder) > 1_000_000) throw invalid("ลำดับหมวดต้องเป็นจำนวนเต็ม");
    // unique (systemId, unitId, name) ไม่กันแถว unitId null ซ้ำกัน (NULL ไม่เท่ากันใน Postgres) ⇒ ตรวจเองใต้ล็อก
    await lockTenant(tx, `pos-category:${ctx.systemId}`);
    const dup = await tx.posCategory.findFirst({ where: { tenantId: ctx.tenantId, systemId: ctx.systemId, unitId, name }, select: { id: true } });
    if (dup) throw conflict("มีหมวดชื่อนี้อยู่แล้ว");
    const row = await tx.posCategory.create({ data: { tenantId: ctx.tenantId, systemId: ctx.systemId, unitId, name, nameEn, sortOrder } });
    await audit(tx, ctx, "pos.category.create", "PosCategory", row.id, null, { name, nameEn, unitId, sortOrder });
    return { id: row.id, name: row.name, unitId: row.unitId };
  });
}

// ═══════════════════ backfill (ขั้น 1 ของ POS-MIGRATION-PLAN) ═══════════════════

export type BackfillSummary = {
  dryRun: boolean;
  tenants: number;
  sources: { invItem: number; menuItem: number; shopProduct: number };
  perSystem: Record<string, { invItem: number; menuItem: number; shopProduct: number }>;
  /** แหล่งที่หา POS ตามทางขายจริงไม่เจอ (InvItem: 0 หรือ >1 POS · เมนู: สาขาไม่มี POS · เว็บร้าน: ร้านไม่มี POS) */
  skippedNoPosSystem: { invItem: number; menuItem: number; shopProduct: number };
  /** ทุกเหตุที่ข้าม แยกชื่อ */
  skipped: {
    invItemNoPos: number;
    invItemAmbiguousPos: number;
    menuItemNoPos: number;
    shopProductNoPos: number;
    shopProductInvItemNotInFirstPos: number;
    recipeInvItemMissing: number;
  };
  skippedAmbiguousPos: number;
  created: { posProduct: number; posCategory: number; posProductOptionGroup: number; recipeLine: number; invItem: number };
  updated: { posProduct: number; menuItem: number; shopProduct: number };
  alreadyDone: { invItem: number; menuItem: number; shopProduct: number };
  failedTenants: { tenantId: string; error: string }[];
};

type TenantPlan = {
  products: Prisma.PosProductCreateManyInput[];
  categories: Prisma.PosCategoryCreateManyInput[];
  optionLinks: Prisma.PosProductOptionGroupCreateManyInput[];
  recipes: Prisma.RecipeLineCreateManyInput[];
  menuLinks: { id: string; productId: string }[];
  shopLinks: { id: string; productId: string }[];
};

function emptySummary(dryRun: boolean): BackfillSummary {
  return {
    dryRun,
    tenants: 0,
    sources: { invItem: 0, menuItem: 0, shopProduct: 0 },
    perSystem: {},
    skippedNoPosSystem: { invItem: 0, menuItem: 0, shopProduct: 0 },
    skipped: { invItemNoPos: 0, invItemAmbiguousPos: 0, menuItemNoPos: 0, shopProductNoPos: 0, shopProductInvItemNotInFirstPos: 0, recipeInvItemMissing: 0 },
    skippedAmbiguousPos: 0,
    created: { posProduct: 0, posCategory: 0, posProductOptionGroup: 0, recipeLine: 0, invItem: 0 },
    updated: { posProduct: 0, menuItem: 0, shopProduct: 0 },
    alreadyDone: { invItem: 0, menuItem: 0, shopProduct: 0 },
    failedTenants: [],
  };
}

/** วางแผนของร้านเดียว (อ่านล้วน) — dry-run และรันจริงใช้แผนเดียวกัน ⇒ ตัวเลขที่ dry-run ทำนาย = ที่สร้างจริง */
async function planTenant(tenantId: string, db: CatalogClient, s: BackfillSummary): Promise<TenantPlan> {
  const res = await loadPosResolution(tenantId, db);
  const [products, categories, items, aps, moved, menuCats, menus, menuOgs, shops] = await Promise.all([
    db.posProduct.findMany({ where: { tenantId }, select: { id: true, systemId: true, invItemId: true } }),
    db.posCategory.findMany({ where: { tenantId }, select: { id: true, systemId: true, unitId: true, name: true } }),
    db.invItem.findMany({
      where: { tenantId },
      select: { id: true, systemId: true, name: true, kind: true, priceSatang: true, archivedAt: true, onHand: true, accountProductId: true, sortOrder: true },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    }),
    db.accountProduct.findMany({ where: { tenantId }, select: { id: true, invItemId: true, salePrice: true, posPrice: true, vatRateBp: true, createdAt: true } }),
    db.invMovement.findMany({ where: { tenantId }, distinct: ["itemId"], select: { itemId: true } }),
    db.menuCategory.findMany({ where: { tenantId }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] }),
    db.menuItem.findMany({ where: { tenantId }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] }),
    db.menuItemOptionGroup.findMany({ where: { tenantId }, select: { itemId: true, groupId: true, sortOrder: true } }),
    db.shopProduct.findMany({ where: { tenantId }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] }),
  ]);
  const plan: TenantPlan = { products: [], categories: [], optionLinks: [], recipes: [], menuLinks: [], shopLinks: [] };
  const per = (sys: string) => (s.perSystem[sys] ??= { invItem: 0, menuItem: 0, shopProduct: 0 });
  const productIds = new Set(products.map((p) => p.id));
  const byInvKey = new Map(products.filter((p) => p.invItemId).map((p) => [`${p.systemId}|${p.invItemId}`, p.id]));
  const { byId: apById, byInv: apByInv } = indexAps(aps);
  const movedSet = new Set(moved.map((m) => m.itemId));
  const itemIds = new Set(items.map((i) => i.id));

  // 1) InvItem → PosProduct ของระบบ POS ที่ขายมัน (แถวเดียวต่อ InvItem)
  s.sources.invItem += items.length;
  for (const inv of items) {
    const r = resolvePosSystem(res, { kind: "invItem", inventorySystemId: inv.systemId });
    if (!r.systemId) {
      s.skippedNoPosSystem.invItem++;
      if (r.reason === "AMBIGUOUS_POS") (s.skipped.invItemAmbiguousPos++, s.skippedAmbiguousPos++);
      else s.skipped.invItemNoPos++;
      continue;
    }
    per(r.systemId).invItem++;
    const key = `${r.systemId}|${inv.id}`;
    if (byInvKey.has(key)) {
      s.alreadyDone.invItem++;
      continue;
    }
    const ap = apOfItem(inv, apById, apByInv);
    const kind: PosProductKind = inv.kind === "SERVICE" ? "SERVICE" : "PRODUCT";
    const id = randomUUID();
    plan.products.push({
      id,
      tenantId,
      systemId: r.systemId,
      invItemId: inv.id,
      kind,
      name: inv.name,
      basePriceSatang: initialPriceSatang({ ap, inv }),
      vatRateBp: ap ? ap.vatRateBp : null,
      sortOrder: inv.sortOrder,
      trackStock: initialTrackStock(kind, inv.id, movedSet.has(inv.id), inv.onHand),
      archivedAt: inv.archivedAt,
    });
    byInvKey.set(key, id);
  }

  // 2) MenuCategory → PosCategory (เฉพาะสาขาที่มี POS · 1 ต่อ 1 · กุญแจธรรมชาติ ระบบ+สาขา+ชื่อ เหมือน unique ของต้นทาง)
  const catKey = (sys: string, unit: string | null, name: string) => `${sys}|${unit ?? ""}|${name}`;
  const catByKey = new Map(categories.map((c) => [catKey(c.systemId, c.unitId, c.name), c.id]));
  const catOfMenuCat = new Map<string, string>();
  for (const mc of menuCats) {
    const sys = res.unitPos.get(mc.unitId);
    if (!sys) continue;
    const k = catKey(sys, mc.unitId, mc.name);
    let id = catByKey.get(k);
    if (!id) {
      id = randomUUID();
      plan.categories.push({
        id, tenantId, systemId: sys, unitId: mc.unitId, name: mc.name, nameEn: mc.nameEn, sortOrder: mc.sortOrder, isVisible: mc.isVisible,
        availableFrom: mc.availableFrom, availableTo: mc.availableTo, archivedAt: mc.archivedAt,
      });
      catByKey.set(k, id);
    }
    catOfMenuCat.set(mc.id, id);
  }

  // 3) MenuItem → PosProduct kind MENU ของตัวเอง (invItemId null · ราคา basePrice) + ตัวเลือก + RecipeLine (ถ้าผูก InvItem)
  s.sources.menuItem += menus.length;
  for (const m of menus) {
    const r = resolvePosSystem(res, { kind: "menuItem", unitId: m.unitId });
    if (!r.systemId) {
      s.skippedNoPosSystem.menuItem++;
      s.skipped.menuItemNoPos++;
      continue;
    }
    per(r.systemId).menuItem++;
    if (m.posProductId && productIds.has(m.posProductId)) {
      s.alreadyDone.menuItem++;
      continue;
    }
    const id = randomUUID();
    plan.products.push({
      id,
      tenantId,
      systemId: r.systemId,
      unitId: m.unitId,
      invItemId: null,
      kind: "MENU",
      name: m.name,
      nameEn: m.nameEn,
      categoryId: catOfMenuCat.get(m.categoryId) ?? null,
      basePriceSatang: initialPriceSatang({ ownPriceSatang: m.basePrice }),
      images: toStrings(m.images),
      sortOrder: m.sortOrder,
      trackStock: false,
      stationId: m.stationId,
      stockQty: m.stockQty,
      dailyStockQty: m.dailyStockQty,
      isOutOfStock: m.isOutOfStock,
      archivedAt: m.archivedAt ?? (m.status === "ARCHIVED" ? m.updatedAt : null),
    });
    for (const og of menuOgs.filter((x) => x.itemId === m.id)) plan.optionLinks.push({ tenantId, productId: id, groupId: og.groupId, sortOrder: og.sortOrder });
    if (m.invItemId) {
      if (itemIds.has(m.invItemId)) plan.recipes.push({ tenantId, productId: id, invItemId: m.invItemId, qty: 1 });
      else s.skipped.recipeInvItemMissing++;
    }
    plan.menuLinks.push({ id: m.id, productId: id });
  }

  // 4) ShopProduct → POS ตัวแรกของร้าน: มี invItemId = แถวของ InvItem นั้น (แหล่งร่วม) · ไม่มี = แถวของตัวเอง (PRODUCT)
  s.sources.shopProduct += shops.length;
  for (const sp of shops) {
    const r = resolvePosSystem(res, { kind: "shopProduct" });
    if (!r.systemId) {
      s.skippedNoPosSystem.shopProduct++;
      s.skipped.shopProductNoPos++;
      continue;
    }
    per(r.systemId).shopProduct++;
    if (sp.posProductId && productIds.has(sp.posProductId)) {
      s.alreadyDone.shopProduct++;
      continue;
    }
    if (sp.invItemId) {
      const target = byInvKey.get(`${r.systemId}|${sp.invItemId}`);
      // InvItem ไม่ได้ขายผ่าน POS ตัวแรก (คลังผูก POS อื่น/ไม่ผูก) — ไม่เดา ไม่สร้างแถวที่สอง (ผู้คุมงานตัดสิน)
      if (!target) {
        s.skipped.shopProductInvItemNotInFirstPos++;
        continue;
      }
      plan.shopLinks.push({ id: sp.id, productId: target });
      continue;
    }
    const id = randomUUID();
    plan.products.push({
      id,
      tenantId,
      systemId: r.systemId,
      unitId: sp.unitId,
      invItemId: null,
      kind: "PRODUCT",
      name: sp.name,
      basePriceSatang: initialPriceSatang({ ownPriceSatang: sp.priceSatang }),
      images: sp.imageUrl ? [sp.imageUrl] : [],
      sortOrder: sp.sortOrder,
      trackStock: false,
      // สินค้าเว็บที่ปิดขาย = ปิดขายที่สาขานั้น (ไม่ใช่เก็บถาวร — เปิดคืนได้)
      unavailableUnitIds: sp.active ? [] : [sp.unitId],
    });
    plan.shopLinks.push({ id: sp.id, productId: id });
  }
  return plan;
}

async function applyPlan(tenantId: string, plan: TenantPlan, tx: Prisma.TransactionClient): Promise<void> {
  if (plan.categories.length) await tx.posCategory.createMany({ data: plan.categories });
  if (plan.products.length) await tx.posProduct.createMany({ data: plan.products });
  if (plan.optionLinks.length) await tx.posProductOptionGroup.createMany({ data: plan.optionLinks });
  if (plan.recipes.length) await tx.recipeLine.createMany({ data: plan.recipes });
  // คอลัมน์เชื่อมของตารางเดิม: SQL คำสั่งเดียวต่อตาราง · ไม่แตะ updatedAt (แถวเดิม "ไม่ถูกแก้" ในสายตาจอเดิม/รายงาน)
  if (plan.menuLinks.length)
    await tx.$executeRaw`UPDATE "MenuItem" AS m SET "posProductId" = x.p
      FROM unnest(${plan.menuLinks.map((l) => l.id)}::text[], ${plan.menuLinks.map((l) => l.productId)}::text[]) AS x(id, p)
      WHERE m.id = x.id AND m."tenantId" = ${tenantId}`;
  if (plan.shopLinks.length)
    await tx.$executeRaw`UPDATE "ShopProduct" AS s SET "posProductId" = x.p
      FROM unnest(${plan.shopLinks.map((l) => l.id)}::text[], ${plan.shopLinks.map((l) => l.productId)}::text[]) AS x(id, p)
      WHERE s.id = x.id AND s."tenantId" = ${tenantId}`;
}

/**
 * backfill แคตตาล็อกเดียวจากของเดิม (InvItem · MenuItem(+หมวด/ตัวเลือก) · ShopProduct) — ไม่สร้าง InvItem เลย (R1)
 *   • idempotent: แถวที่มีแล้ว (InvItem ตาม unique ระบบ+InvItem · เมนู/เว็บร้านตามคอลัมน์เชื่อม) = ข้าม ⇒ รอบสองสร้าง 0 แก้ 0
 *   • ทีละร้านในธุรกรรมเดียว (ล้มกลางทาง = ร้านนั้นไม่มีอะไรค้างครึ่ง ๆ · ร้านถัดไปเดินต่อ)
 *   • AUDIT-CLASS X6: ล็อกร้าน (pg_advisory_xact_lock) ⇒ 2 โปรเซสพร้อมกัน ตัวที่สองรอแล้ววางแผนใหม่จากของที่ตัวแรก commit
 *   • dryRun: อ่านล้วน ไม่เรียกคำสั่งเขียนเลย — ตัวเลข created/updated = "จะสร้าง/จะแก้"
 */
export async function backfillCatalog(opts: { tenantIds: string[]; dryRun: boolean }, client: PrismaClient = prisma): Promise<BackfillSummary> {
  const s = emptySummary(opts.dryRun);
  const tenantIds = [...new Set(opts.tenantIds)].sort(); // ลำดับคงที่ ⇒ 2 โปรเซสล็อกตามลำดับเดียวกัน ไม่ deadlock
  for (const tenantId of tenantIds) {
    s.tenants++;
    const scratch = emptySummary(opts.dryRun);
    try {
      const plan = opts.dryRun
        ? await planTenant(tenantId, client, scratch)
        : await client.$transaction(
            async (tx) => {
              await lockTenant(tx, `pos-catalog:${tenantId}`);
              const p = await planTenant(tenantId, tx, scratch);
              await applyPlan(tenantId, p, tx);
              return p;
            },
            { timeout: 600_000, maxWait: 60_000 },
          );
      mergeSummary(s, scratch);
      s.created.posProduct += plan.products.length;
      s.created.posCategory += plan.categories.length;
      s.created.posProductOptionGroup += plan.optionLinks.length;
      s.created.recipeLine += plan.recipes.length;
      s.updated.menuItem += plan.menuLinks.length;
      s.updated.shopProduct += plan.shopLinks.length;
    } catch (e) {
      s.failedTenants.push({ tenantId, error: e instanceof Error ? e.message.split("\n").filter(Boolean).slice(-1)[0] ?? e.name : String(e) });
    }
  }
  return s;
}

function mergeSummary(into: BackfillSummary, from: BackfillSummary): void {
  for (const k of ["invItem", "menuItem", "shopProduct"] as const) {
    into.sources[k] += from.sources[k];
    into.skippedNoPosSystem[k] += from.skippedNoPosSystem[k];
    into.alreadyDone[k] += from.alreadyDone[k];
  }
  for (const k of Object.keys(from.skipped) as (keyof BackfillSummary["skipped"])[]) into.skipped[k] += from.skipped[k];
  into.skippedAmbiguousPos += from.skippedAmbiguousPos;
  for (const [sys, v] of Object.entries(from.perSystem)) {
    const cur = (into.perSystem[sys] ??= { invItem: 0, menuItem: 0, shopProduct: 0 });
    cur.invItem += v.invItem;
    cur.menuItem += v.menuItem;
    cur.shopProduct += v.shopProduct;
  }
}
