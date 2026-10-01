// catalog.ts — แคตตาล็อกเดียวของ POS (WO P1.1a · round 2) · ผู้เขียนเดียวของ PosProduct / PosCategory / PosProductOptionGroup / RecipeLine
//
// สัญญา: ledger/pos-briefs/pos-brief-P1.1a-R2.md (C1–C13 · ชนะ brief เดิม) · ledger/wo-notes/pos-P0.3-catalog.md "Ratified names" (🔁 = round 2)
//   • ctx = { tenantId, systemId (AppSystem type POS · active), actorUserId: string | typeof CATALOG_SYSTEM_ACTOR }
//     ผู้เรียกระดับระบบ (backfill · ผู้เขียนเดิมใน P1.1b) ส่ง `CATALOG_SYSTEM_ACTOR` (unique symbol — ปลอมจาก body/session ไม่ได้)
//     null / undefined / "" = PERMISSION_DENIED (fail closed · C1) · ทุกฟังก์ชันรับ `client` ท้ายสุด (PrismaClient หรือ tx)
//   • ปฏิเสธ = throw `CatalogError` ที่มี `.code` คงที่: NOT_FOUND (ข้ามร้าน/สาขา/ระบบ — แบบ 404) · PERMISSION_DENIED · VALIDATION
//     · CONFLICT (รวม P2002 จาก unique ทุกตัว — ไม่หลุดเป็น error ดิบ · C10) — ข้อความไทยที่ไม่โทษผู้ใช้
//   • เงิน = สตางค์ Int · basePriceSatang null = "ยังไม่ตั้งราคา" (ไม่ใช้ต้นทุนแทน) · 0 = ขายฟรีจริง
//   • ทุกการเขียนมีแถว AuditLog ในธุรกรรมเดียวกัน (ล็อกแถวก่อนอ่านค่าเดิม ⇒ สาย before→after ต่อกัน · C11)
// 🔴 P1.1a: ไม่มี dual-write และไม่เขียนกลับตารางเดิม (P1.1b) — ข้อยกเว้นเดียว: backfill ตั้งคอลัมน์เชื่อมใหม่ (ไม่แตะ updatedAt)
// 🔴 ห้ามแตะ createSale/voidSale (service.ts) · register.ts — จอเดิมทุกจอยังอ่านตารางเดิมตามเดิม
// หนี้ (N5 → P1.1b): อ่านตารางของโมดูลอื่นตรง (AppSystemUnit · InvItem · AccountProduct · AccountSystemLink · AccountSettings · Menu*)
//   แบบเดียวกับ register.ts — P1.1b ตัดสินว่าจะย้ายไป facade หรือบันทึกเป็นข้อยกเว้น

import { randomUUID } from "node:crypto";
import { Prisma, type PosProduct, type PosProductKind, type PrismaClient } from "@prisma/client";
import { canAccessUnit, canGrantUnitAccess, evaluate, type MembershipCtx } from "@/lib/core/rbac";
import { prisma } from "./db";

// ═══════════════════ ชนิดข้อมูล + error ═══════════════════

/** C1: ตัวบ่งชี้ผู้เรียกระดับระบบ — มีได้จากการ import โมดูลนี้เท่านั้น (ค่าจาก JSON/คุกกี้/ฟอร์ม เป็น symbol ไม่ได้) */
export const CATALOG_SYSTEM_ACTOR: unique symbol = Symbol("pos.catalog.system-actor");
export type CatalogActor = string | typeof CATALOG_SYSTEM_ACTOR;
export type CatalogCtx = { tenantId: string; systemId: string; actorUserId: CatalogActor };
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
const MAX_INT4 = 2_147_483_647;
const MAX_NAME = 200;
const PAGE_DEFAULT = 100;
const PAGE_MAX = 500;

export type TrackStockMode = "auto" | "on" | "off";

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
  /** ตัดสต็อกจริงไหม (ค่าที่ใช้ — AUTO คิดตอนอ่าน · C2) */
  trackStock: boolean;
  trackStockMode: TrackStockMode;
  images: string[];
  optionGroups: PosOptionGroupView[];
  /** P1.2 เป็นเจ้าของ — P1.1a ว่างเสมอ */
  variants: { id: string }[];
  recipe: { invItemId: string; qty: number }[];
  /** ราคาต่อช่องทาง — ใบช่องทางขายเป็นเจ้าของ · P1.1a ว่างเสมอ */
  channelPrices: { channelId: string; priceSatang: number }[];
  /** ขายได้ที่สาขานี้ไหม (key = unitId ที่ขอ) */
  availability: Record<string, boolean>;
  /** สต็อกคงเหลือ (key = unitId ที่ขอ · = InvItem.onHand ของคลังที่สาขานี้ใช้ · C3) */
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

/** C10: unique violation (P2002) จากการเขียนใด ๆ = CatalogError CONFLICT — ไม่ส่ง error ดิบของ Prisma ถึงผู้เรียก */
async function writeGuard<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") throw conflict("มีรายการนี้อยู่แล้ว (ชื่อ/บาร์โค้ด/สินค้าคลังซ้ำ)");
    throw e;
  }
}

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const toStrings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
/** จำนวนเต็มสตางค์ 0..Int4 */
const isSatang = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= MAX_INT4;

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
function cleanTrackStock(v: unknown): boolean | null {
  if (v === null || typeof v === "boolean") return v;
  throw invalid("ค่าการตัดสต็อกต้องเป็น เปิด/ปิด/อัตโนมัติ");
}

/**
 * AUDIT-CLASS X2 + C12: ctx ต้องชี้ระบบ POS ที่เปิดใช้งานของร้านนี้จริง (ห้ามเชื่อ systemId จากผู้เรียก) — ไม่ใช่ = NOT_FOUND
 */
async function assertPosSystem(ctx: CatalogCtx, db: CatalogClient): Promise<void> {
  if (!ctx || typeof ctx.tenantId !== "string" || !ctx.tenantId || typeof ctx.systemId !== "string" || !ctx.systemId) throw notFound();
  const sys = await db.appSystem.findFirst({ where: { id: ctx.systemId, tenantId: ctx.tenantId, type: "POS", active: true }, select: { id: true } });
  if (!sys) throw notFound();
}

/**
 * AUDIT-CLASS X3 + C1: ผู้กระทำ — ตัวบ่งชี้ระบบ = null (ข้ามสิทธิ์) · สตริง = สมาชิกของร้าน (ไม่ใช่สมาชิก = NOT_FOUND)
 * · อย่างอื่นทั้งหมด (null/undefined/""/ชนิดอื่น) = PERMISSION_DENIED — fail closed
 */
async function actorOf(ctx: CatalogCtx, db: CatalogClient): Promise<MembershipCtx | null> {
  const a: unknown = ctx.actorUserId;
  if (a === CATALOG_SYSTEM_ACTOR) return null;
  if (typeof a !== "string" || !a) throw denied();
  const m = await db.membership.findUnique({
    where: { userId_tenantId: { userId: a, tenantId: ctx.tenantId } },
    select: { role: true, unitAccess: true, permissions: true },
  });
  if (!m) throw notFound();
  return { role: m.role, unitAccess: toStrings(m.unitAccess), permissions: isRecord(m.permissions) ? m.permissions : {} };
}

/** C4: ผู้กระทำ "ทุกสาขา" = OWNER หรือ unitAccess ["*"] — ตัวตัดสินกลางเดียวกับหน้าตั้งสิทธิ์พนักงาน (rbac.canGrantUnitAccess) */
const isAllBranchActor = (m: MembershipCtx): boolean => canGrantUnitAccess(m, ["*"]);

/**
 * AUDIT-CLASS X3 + C4: สิทธิ์ตามขอบเขตของแถว — unitId null (ทุกสาขา) ต้องเป็นผู้กระทำทุกสาขา · มีสาขา = ต้องเข้าถึงสาขานั้น (ไม่ได้ = NOT_FOUND)
 * แล้วจึงตรวจคีย์สิทธิ์ (OWNER/MANAGER ผ่าน · STAFF ต้องมีคีย์) · ระบบ (null) ผ่าน
 */
function requireScope(actor: MembershipCtx | null, unitId: string | null, action: string): void {
  if (!actor) return;
  if (unitId === null) {
    if (!isAllBranchActor(actor)) throw denied();
    if (!evaluate(actor, { module: "pos", action })) throw denied();
    return;
  }
  if (!canAccessUnit(actor, unitId)) throw notFound();
  if (!evaluate(actor, { module: "pos", action, unitId })) throw denied();
}

/**
 * AUDIT-CLASS X2 + C12: สาขาต้องผูกระบบ POS ใน ctx · ไม่เก็บถาวร · ผู้กระทำเข้าถึงได้ — ไม่ใช่ = NOT_FOUND (แบบ 404)
 */
async function assertUnit(ctx: CatalogCtx, actor: MembershipCtx | null, unitId: unknown, db: CatalogClient): Promise<string> {
  if (typeof unitId !== "string" || !unitId) throw notFound();
  const link = await db.appSystemUnit.findUnique({
    where: { tenantId_unitId_type: { tenantId: ctx.tenantId, unitId, type: "POS" } },
    select: { systemId: true },
  });
  if (!link || link.systemId !== ctx.systemId) throw notFound();
  const unit = await db.businessUnit.findFirst({ where: { id: unitId, tenantId: ctx.tenantId, status: { not: "ARCHIVED" } }, select: { id: true } });
  if (!unit) throw notFound();
  if (actor && !canAccessUnit(actor, unitId)) throw notFound();
  return unitId;
}

/** C3: คลังที่สาขานี้ใช้ (ทางเดียวกับหน้าขาย resolvePosLinks → systemForUnit INVENTORY) · null = สาขาไม่มีคลัง */
async function unitInventory(tenantId: string, unitId: string, db: CatalogClient): Promise<string | null> {
  const l = await db.appSystemUnit.findUnique({ where: { tenantId_unitId_type: { tenantId, unitId, type: "INVENTORY" } }, select: { systemId: true } });
  return l?.systemId ?? null;
}

/**
 * สินค้าของระบบ POS ใน ctx — ไม่ใช่ = NOT_FOUND · ของสาขาที่ผู้กระทำเข้าไม่ได้ = NOT_FOUND
 * AUDIT-CLASS X6 + C11: `forUpdate` ล็อกแถว (SELECT … FOR UPDATE) ก่อนอ่านค่าเดิม ⇒ ผู้เขียนพร้อมกันต่อคิว · audit before→after ต่อกันเป็นสาย
 */
async function loadProduct(ctx: CatalogCtx, actor: MembershipCtx | null, id: unknown, db: CatalogClient, forUpdate = false): Promise<PosProduct> {
  if (typeof id !== "string" || !id) throw notFound();
  if (forUpdate) await db.$queryRaw`SELECT id FROM "PosProduct" WHERE id = ${id} AND "tenantId" = ${ctx.tenantId} AND "systemId" = ${ctx.systemId} FOR UPDATE`;
  // AUDIT-CLASS X2: id + tenantId + systemId ในคำสั่งเดียว — productId ของร้านอื่น/ระบบอื่น = ไม่พบ
  const p = await db.posProduct.findFirst({ where: { id, tenantId: ctx.tenantId, systemId: ctx.systemId } });
  if (!p) throw notFound();
  if (actor && p.unitId && !canAccessUnit(actor, p.unitId)) throw notFound();
  return p;
}

/** ระบบคลังที่ "ขายผ่าน" ระบบ POS นี้ = คลังที่ผูกสาขา (ไม่เก็บถาวร) เดียวกับ POS นี้ · คลังปิดใช้งานไม่นับ (C12) */
async function inventorySystemsOfPos(tenantId: string, posSystemId: string, db: CatalogClient): Promise<string[]> {
  const posLinks = await db.appSystemUnit.findMany({ where: { tenantId, systemId: posSystemId, type: "POS" }, select: { unitId: true } });
  if (!posLinks.length) return [];
  const live = await db.businessUnit.findMany({
    where: { tenantId, id: { in: posLinks.map((l) => l.unitId) }, status: { not: "ARCHIVED" } },
    select: { id: true },
  });
  if (!live.length) return [];
  const inv = await db.appSystemUnit.findMany({
    where: { tenantId, type: "INVENTORY", unitId: { in: live.map((u) => u.id) }, system: { active: true } },
    select: { systemId: true },
  });
  return [...new Set(inv.map((l) => l.systemId))];
}

/**
 * AUDIT-CLASS X6: ล็อกระดับร้านของ "การสร้างแถวที่ผูก InvItem" (backfill · ensureForInvItem · createProduct ผูกคลัง/บาร์โค้ด)
 * pg_advisory_xact_lock หลุดเองตอน commit/rollback · ใช้กับ pooler โหมด transaction ได้
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
  // ในธุรกรรมเดียวกับการเขียน · createdAt = เวลาหลังได้ล็อก (ไม่ใช่เวลาเริ่ม tx ของ DB) ⇒ เรียงตามลำดับที่เขียนจริง (C11)
  await tx.auditLog.create({
    data: {
      tenantId: ctx.tenantId,
      actorType: typeof ctx.actorUserId === "string" ? "USER" : "SYSTEM",
      actorId: typeof ctx.actorUserId === "string" ? ctx.actorUserId : null,
      action,
      targetType,
      targetId,
      before: before ? (before as unknown as Prisma.InputJsonValue) : undefined,
      after: after ? (after as unknown as Prisma.InputJsonValue) : undefined,
      createdAt: new Date(),
    },
  });
}

// ═══════════════════ R2 + C12 · ระบบ POS ของแหล่งข้อมูลเดิม (ตัวตัดสินเดียว) ═══════════════════

/** ข้อมูลการผูกระบบของร้าน 1 ร้าน (โหลดครั้งเดียว ใช้ตัดสินทุกแถว) */
export type PosResolution = {
  tenantId: string;
  /** สาขา (ไม่เก็บถาวร) → ระบบ POS ที่เปิดใช้งาน (AppSystemUnit type POS · 1 สาขา/1 POS) */
  unitPos: Map<string, string>;
  /** ระบบคลัง (เปิดใช้งาน) → ระบบ POS ที่ขายของคลังนั้น (ผ่านสาขาไม่เก็บถาวรที่ผูกทั้งคู่) */
  inventoryPos: Map<string, string[]>;
  /** POS ตัวแรกของร้าน: เปิดใช้งาน · createdAt เก่าสุด · เสมอกันใช้ id */
  firstPos: string | null;
};
export type CatalogSource = { kind: "invItem"; inventorySystemId: string } | { kind: "menuItem"; unitId: string } | { kind: "shopProduct" };
export type PosResolveResult = { systemId: string; reason: null } | { systemId: null; reason: "NO_POS" | "AMBIGUOUS_POS" };

export async function loadPosResolution(tenantId: string, client: CatalogClient = prisma): Promise<PosResolution> {
  const [links, archived, systems] = await Promise.all([
    client.appSystemUnit.findMany({ where: { tenantId, type: { in: ["POS", "INVENTORY"] } }, select: { unitId: true, systemId: true, type: true } }),
    client.businessUnit.findMany({ where: { tenantId, status: "ARCHIVED" }, select: { id: true } }),
    client.appSystem.findMany({
      where: { tenantId, type: { in: ["POS", "INVENTORY"] }, active: true },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: { id: true, type: true },
    }),
  ]);
  const archivedIds = new Set(archived.map((u) => u.id));
  const activeIds = new Set(systems.map((s) => s.id));
  const unitPos = new Map<string, string>();
  for (const l of links) if (l.type === "POS" && !archivedIds.has(l.unitId) && activeIds.has(l.systemId)) unitPos.set(l.unitId, l.systemId);
  const inventoryPos = new Map<string, string[]>();
  for (const l of links) {
    if (l.type !== "INVENTORY" || archivedIds.has(l.unitId) || !activeIds.has(l.systemId)) continue;
    const pos = unitPos.get(l.unitId);
    if (!pos) continue;
    const cur = inventoryPos.get(l.systemId) ?? [];
    if (!cur.includes(pos)) inventoryPos.set(l.systemId, [...cur, pos]);
  }
  return { tenantId, unitPos, inventoryPos, firstPos: systems.find((s) => s.type === "POS")?.id ?? null };
}

/**
 * R2 — แถวเดิมนี้ "ขายอยู่ในระบบ POS ไหน" วันนี้ (ทางเดียวกับทางขายจริง ⇒ บรรทัดขายพรุ่งนี้ลงระบบที่ขายมันจริง)
 *   • InvItem    → หน้าขายแสดง InvItem ของ **ระบบคลังที่ผูกสาขาเดียวกับ POS** (`register/page.tsx:53-55` resolvePosLinks
 *                  → `register.ts:125-133` systemForUnit(INVENTORY) → `posCatalog` :137) · สาขาเก็บถาวรไม่นับ (`posUnits` register.ts:101-112 กรอง ARCHIVED :108)
 *                  ⇒ คลังนั้นผูก POS ได้ 1 ตัวพอดี = ระบบนั้น · 0 ตัว = NO_POS · >1 ตัว = AMBIGUOUS_POS (ไม่เดา)
 *   • MenuItem   → เช็คบิลร้านอาหารใช้ `systemForUnit(tenant, unitId, "POS")` (`restaurant/order.ts:421`) ⇒ POS ของสาขาเมนู · ไม่มี = NO_POS
 *   • ShopProduct→ ยืนยันรับเงินเว็บร้านใช้ `listSystems(tenant,"POS")[0]` (`shop/service.ts:217`) = POS ตัวแรกของร้าน ไม่ดูสาขา
 *                  (โค้ดชนะ · แก้ "POS ตัวแรก" เป็นงาน P2.1) ⇒ ร้านไม่มี POS เลย = NO_POS
 *   C12: สาขาเก็บถาวร + ระบบปิดใช้งาน ไม่นับทุกทาง · "POS ตัวแรก" = เปิดใช้งาน เรียง createdAt แล้ว id
 *        (`listSystems` เรียง type,createdAt เท่านั้น ไม่กรอง active ไม่มีตัวตัดสินเสมอ — ต่างกันโดยตั้งใจ · แก้ฝั่งนั้นใน P2.1)
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

// ═══════════════════ C7 · ราคาตั้งต้น = "ที่ลิ้นชักคิดวันนี้" (ไม่ใช้ต้นทุนเด็ดขาด) ═══════════════════

/** AccountProduct ที่ผ่านเกณฑ์ C7 แล้ว (หาแบบลิ้นชัก · ไม่เก็บถาวร · สมุดบัญชีที่ผูก POS นี้) — ผู้เรียกกรองมาก่อน */
export type PriceAp = { salePrice: number | null; posPrice: number | null; posEnabled: boolean };
export type PriceSources = {
  ap?: PriceAp | null;
  inv?: { kind: string; priceSatang: number; costSatang: number } | null;
  /** ราคาของแถวตัวเอง: MenuItem.basePrice (เมนู) · ShopProduct.priceSatang (แถวของเว็บร้านเอง) · undefined = ไม่ใช่แถวของตัวเอง */
  own?: number | null;
};
export type PriceResult = { price: number | null; rung: "sale" | "pos" | "service" | "own" | "free" | "none"; invalidLegacy: boolean };

const legalPrice = (n: unknown): n is number => typeof n === "number" && Number.isInteger(n) && n >= 0 && n <= MAX_INT4;

/**
 * AUDIT-CLASS X4: ลำดับราคา C7 (สตางค์ Int เสมอ) — ราคาเดิมที่ติดลบ/ไม่ใช่จำนวนเต็ม/เกิน Int4 ไม่นับ (invalidLegacy)
 *   1) AccountProduct.salePrice > 0
 *   2) AccountProduct.posPrice > 0 เฉพาะเมื่อ posEnabled
 *   3) บริการ (SERVICE): InvItem.priceSatang > 0
 *   4) แถวของตัวเอง: เมนู basePrice / เว็บร้าน priceSatang (0 = ขายฟรีจริงวันนี้ — คงไว้)
 *   5) salePrice 0 และต้นทุน 0 = 0 (ฟรีวันนี้ ฟรีพรุ่งนี้)
 *   6) ไม่มี = null "ยังไม่ตั้งราคา" (ลิ้นชักเดิมคิดราคาทุน — แคตตาล็อกใหม่ไม่ทำ)
 */
export function initialPrice(s: PriceSources): PriceResult {
  const ap = s.ap ?? null;
  const inv = s.inv ?? null;
  const invalidLegacy =
    (!!ap && ap.salePrice !== null && !legalPrice(ap.salePrice)) ||
    (!!ap && ap.posPrice !== null && !legalPrice(ap.posPrice)) ||
    (!!inv && inv.kind === "SERVICE" && !legalPrice(inv.priceSatang)) ||
    (s.own !== undefined && s.own !== null && !legalPrice(s.own));
  if (ap && legalPrice(ap.salePrice) && ap.salePrice > 0) return { price: ap.salePrice, rung: "sale", invalidLegacy };
  if (ap && ap.posEnabled && legalPrice(ap.posPrice) && ap.posPrice > 0) return { price: ap.posPrice, rung: "pos", invalidLegacy };
  if (inv && inv.kind === "SERVICE" && legalPrice(inv.priceSatang) && inv.priceSatang > 0) return { price: inv.priceSatang, rung: "service", invalidLegacy };
  if (s.own !== undefined) return { price: legalPrice(s.own) ? s.own : null, rung: "own", invalidLegacy };
  if (ap && ap.salePrice === 0 && (inv?.costSatang ?? 0) === 0) return { price: 0, rung: "free", invalidLegacy };
  return { price: null, rung: "none", invalidLegacy };
}
/** ทางลัดเดิม (round 1) — คืนแค่ราคา */
export const initialPriceSatang = (s: PriceSources): number | null => initialPrice(s).price;

/** C2: ค่าที่ใช้จริงของ trackStock (null = AUTO: ผูก InvItem + PRODUCT + (มี movement หรือ onHand ≠ 0)) */
export function effectiveTrackStock(
  p: { trackStock: boolean | null; invItemId: string | null; kind: PosProductKind },
  inv: { hasMovement: boolean; onHand: number } | null,
): { trackStock: boolean; mode: TrackStockMode } {
  if (p.trackStock === true) return { trackStock: true, mode: "on" };
  if (p.trackStock === false) return { trackStock: false, mode: "off" };
  return { trackStock: !!p.invItemId && p.kind === "PRODUCT" && !!inv && (inv.hasMovement || inv.onHand !== 0), mode: "auto" };
}

/** สมุดบัญชีที่ผูก POS (findAccountLinkForPos — account/service.ts:551) + จด VAT ไหม (vatConfigOf :602 · ไม่มีตั้งค่า = จด) */
type BookInfo = { accountSystemId: string | null; vatRegistered: boolean };
async function bookOfPos(tenantId: string, posSystemId: string, db: CatalogClient): Promise<BookInfo> {
  const link = await db.accountSystemLink.findFirst({
    where: { tenantId, linkedKind: "POS", linkedId: posSystemId, archivedAt: null, enabled: true },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: { systemId: true },
  });
  if (!link) return { accountSystemId: null, vatRegistered: false };
  const st = await db.accountSettings.findFirst({ where: { systemId: link.systemId }, select: { vatRegistered: true } });
  return { accountSystemId: link.systemId, vatRegistered: st?.vatRegistered ?? true };
}

type ApRow = { id: string; systemId: string; salePrice: number | null; posPrice: number | null; posEnabled: boolean; vatRateBp: number; archivedAt: Date | null };
/** C7: AccountProduct แบบเดียวกับลิ้นชัก (InvItem.accountProductId → AP — ไม่มีทางสำรองผ่าน AP.invItemId) · ไม่เก็บถาวร · อยู่ในสมุดที่ผูก POS */
function strictAp(inv: { accountProductId: string | null } | null, apById: Map<string, ApRow>, book: BookInfo): ApRow | null {
  const ap = inv?.accountProductId ? apById.get(inv.accountProductId) : undefined;
  return ap && !ap.archivedAt && book.accountSystemId !== null && ap.systemId === book.accountSystemId ? ap : null;
}
/** C8: VAT คัดลอกเมื่อสมุดที่ผูกจด VAT เท่านั้น — ไม่จด/ไม่มีบัญชี = null (ตามตั้งค่า VAT ของระบบตอนขาย · P1.6) */
const vatOf = (ap: ApRow | null, book: BookInfo): number | null => (ap && book.vatRegistered ? ap.vatRateBp : null);

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
const likePattern = (q: string) => `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

/** C3: แถวผูก InvItem มองเห็นที่สาขานี้เฉพาะเมื่อ InvItem อยู่คลังของสาขา (ไม่มีคลัง = เห็นแต่แถวไม่ผูกคลัง) */
function warehouseCond(tenantId: string, unitInv: string | null): Prisma.Sql {
  return unitInv
    ? Prisma.sql`(p."invItemId" IS NULL OR EXISTS (SELECT 1 FROM "InvItem" w WHERE w.id = p."invItemId" AND w."tenantId" = ${tenantId} AND w."systemId" = ${unitInv}))`
    : Prisma.sql`p."invItemId" IS NULL`;
}

/** แปลงแถว → หน้าตา POS-API §1 (ของประกอบโหลดเป็นชุดต่อหน้า · จับคู่ด้วย Map ไม่ไล่ filter ต่อแถว) */
async function toViews(tenantId: string, unitId: string, rows: PosProduct[], db: CatalogClient): Promise<PosProductView[]> {
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const invIds = [...new Set(rows.map((r) => r.invItemId).filter((x): x is string => !!x))];
  const [items, moved, links, recipes] = await Promise.all([
    invIds.length ? db.invItem.findMany({ where: { tenantId, id: { in: invIds } }, select: { id: true, onHand: true, barcode: true, sku: true } }) : Promise.resolve([]),
    invIds.length ? db.invMovement.groupBy({ by: ["itemId"], where: { tenantId, itemId: { in: invIds } } }) : Promise.resolve([]),
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
  const movedSet = new Set(moved.map((m) => m.itemId));
  const groupById = new Map(groups.map((g) => [g.id, g]));
  const linksBy = new Map<string, typeof links>();
  for (const l of links) linksBy.set(l.productId, [...(linksBy.get(l.productId) ?? []), l]);
  const recipesBy = new Map<string, { invItemId: string; qty: number }[]>();
  for (const r of recipes) recipesBy.set(r.productId, [...(recipesBy.get(r.productId) ?? []), { invItemId: r.invItemId, qty: r.qty }]);
  return rows.map((p) => {
    const inv = p.invItemId ? itemById.get(p.invItemId) : undefined;
    const optionGroups: PosOptionGroupView[] = (linksBy.get(p.id) ?? []).flatMap((l) => {
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
    const ts = effectiveTrackStock(p, inv ? { hasMovement: movedSet.has(inv.id), onHand: inv.onHand } : null);
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
      trackStock: ts.trackStock,
      trackStockMode: ts.mode,
      images: toStrings(p.images),
      optionGroups,
      variants: [],
      recipe: recipesBy.get(p.id) ?? [],
      channelPrices: [],
      availability: { [unitId]: !(p.unavailableUnitIds ?? []).includes(unitId) && !p.isOutOfStock },
      stock: inv ? { [unitId]: inv.onHand } : {},
    };
  });
}

/** โหลดแถวตาม id แล้วคืนตามลำดับที่ขอ */
async function rowsInOrder(ids: string[], tenantId: string, db: CatalogClient): Promise<PosProduct[]> {
  if (!ids.length) return [];
  const rows = await db.posProduct.findMany({ where: { tenantId, id: { in: ids } } });
  const byId = new Map(rows.map((r) => [r.id, r]));
  return ids.flatMap((id) => (byId.has(id) ? [byId.get(id)!] : []));
}

/**
 * รายการสินค้าที่ขายได้ที่สาขานี้ (สินค้าทุกสาขา unitId null + ของสาขานี้ · ไม่รวมที่เก็บถาวร · C3 เฉพาะของคลังสาขานี้)
 *   • C6 แบ่งหน้าเสมอ: `limit` ปริยาย 100 · เกิน 500 = ตัดเหลือ 500 · มีแถวเหลือ = `nextCursor` (keyset ตาม ชื่อ+id ไม่ซ้ำไม่ข้าม)
 *   • C6 ค้น (`q`) ในคำสั่ง SQL เดียว: ชื่อไทย/อังกฤษ · บาร์โค้ดของแถว · SKU/บาร์โค้ดของ InvItem ที่ผูก (EXISTS)
 *   • สิทธิ์: เข้าถึงสาขาได้ก็พอ (แคชเชียร์ต้องขายได้) · สาขาที่ไม่ผูก POS นี้/เก็บถาวร/เข้าไม่ได้ = NOT_FOUND
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
  let limit = PAGE_DEFAULT;
  if (o.limit !== undefined && o.limit !== null) {
    if (typeof o.limit !== "number" || !Number.isInteger(o.limit) || o.limit < 1) throw invalid("จำนวนต่อหน้าต้องเป็นจำนวนเต็มตั้งแต่ 1");
    limit = Math.min(o.limit, PAGE_MAX);
  }
  const cur = o.cursor === undefined || o.cursor === null ? null : decodeCursor(o.cursor);
  const q = typeof o.q === "string" ? o.q.trim().slice(0, 100) : "";
  const unitInv = await unitInventory(ctx.tenantId, unit, client);
  const pat = q ? likePattern(q) : null;
  const ids = await client.$queryRaw<{ id: string }[]>`
    SELECT p.id FROM "PosProduct" p
    WHERE p."tenantId" = ${ctx.tenantId} AND p."systemId" = ${ctx.systemId} AND p."archivedAt" IS NULL
      AND (p."unitId" IS NULL OR p."unitId" = ${unit})
      AND ${warehouseCond(ctx.tenantId, unitInv)}
      ${pat ? Prisma.sql`AND (p.name ILIKE ${pat} OR p."nameEn" ILIKE ${pat} OR p.barcode ILIKE ${pat}
        OR EXISTS (SELECT 1 FROM "InvItem" s WHERE s.id = p."invItemId" AND s."tenantId" = ${ctx.tenantId} AND (s.sku ILIKE ${pat} OR s.barcode ILIKE ${pat})))` : Prisma.empty}
      ${cur ? Prisma.sql`AND (p.name > ${cur.n} OR (p.name = ${cur.n} AND p.id > ${cur.i}))` : Prisma.empty}
    ORDER BY p.name, p.id
    LIMIT ${limit + 1}`;
  const page = await rowsInOrder(ids.slice(0, limit).map((r) => r.id), ctx.tenantId, client);
  const nextCursor = ids.length > limit && page.length ? encodeCursor(page[page.length - 1]!) : null;
  return { items: await toViews(ctx.tenantId, unit, page, client), nextCursor };
}

/**
 * C5: หาสินค้าด้วยบาร์โค้ดตรงตัว (ของแถวเอง หรือของ InvItem ที่ผูก) ที่ขายได้ที่สาขานี้ → `{items}` 0..n เรียงชื่อ+id (คงที่)
 * บาร์โค้ดซ้ำใน legacy เป็นเรื่องปกติ (InvItem.barcode ไม่ unique) — หน้าขายให้แคชเชียร์เลือก ไม่เดาตัวเก่าสุด
 */
export async function byBarcode(ctx: CatalogCtx, unitId: string, barcode: string, client: CatalogClient = prisma): Promise<{ items: PosProductView[] }> {
  await assertPosSystem(ctx, client);
  const actor = await actorOf(ctx, client);
  const unit = await assertUnit(ctx, actor, unitId, client);
  const code = typeof barcode === "string" ? barcode.trim() : "";
  if (!code) return { items: [] };
  const unitInv = await unitInventory(ctx.tenantId, unit, client);
  const ids = await client.$queryRaw<{ id: string }[]>`
    SELECT p.id FROM "PosProduct" p
    WHERE p."tenantId" = ${ctx.tenantId} AND p."systemId" = ${ctx.systemId} AND p."archivedAt" IS NULL
      AND (p."unitId" IS NULL OR p."unitId" = ${unit})
      AND ${warehouseCond(ctx.tenantId, unitInv)}
      AND (p.barcode = ${code} OR EXISTS (SELECT 1 FROM "InvItem" b WHERE b.id = p."invItemId" AND b."tenantId" = ${ctx.tenantId} AND b.barcode = ${code}))
    ORDER BY p.name, p.id
    LIMIT ${PAGE_MAX}`;
  const rows = await rowsInOrder(ids.map((r) => r.id), ctx.tenantId, client);
  return { items: await toViews(ctx.tenantId, unit, rows, client) };
}

// ═══════════════════ ตัวเขียน ═══════════════════

export type CreateProductInput = {
  name: string;
  nameEn?: string | null;
  /** ปริยาย PRODUCT (ผูก InvItem แล้วไม่ส่ง = ชนิดของ InvItem) */
  kind?: PosProductKind;
  categoryId?: string | null;
  basePriceSatang?: number | null;
  vatRateBp?: number | null;
  barcode?: string | null;
  unitId?: string | null;
  invItemId?: string | null;
  /** C2: ไม่ส่ง/null = AUTO */
  trackStock?: boolean | null;
};

function cleanVat(v: unknown): number | null {
  if (v === undefined || v === null) return null;
  if (typeof v !== "number" || !Number.isInteger(v) || v < 0 || v > 10_000) throw invalid("อัตรา VAT ต้องเป็นจำนวนเต็ม 0–10000 (หน่วย 0.01%)");
  return v;
}

/**
 * หมวดต้องเป็นของร้าน+ระบบนี้ ยังไม่เก็บถาวร (ไม่ใช่ = NOT_FOUND) · C4: หมวดของสาขาอื่นกับสินค้า = VALIDATION
 * (หมวดทุกสาขาใช้กับสินค้าใดก็ได้ · หมวดของสาขา X ใช้ได้กับสินค้าของสาขา X เท่านั้น)
 */
async function assertCategory(ctx: CatalogCtx, categoryId: unknown, productUnitId: string | null, db: CatalogClient): Promise<string | null> {
  if (categoryId === undefined || categoryId === null) return null;
  if (typeof categoryId !== "string" || !categoryId) throw notFound();
  const c = await db.posCategory.findFirst({ where: { id: categoryId, tenantId: ctx.tenantId, systemId: ctx.systemId, archivedAt: null }, select: { id: true, unitId: true } });
  if (!c) throw notFound();
  if (c.unitId !== null && c.unitId !== productUnitId) throw invalid("หมวดนี้เป็นของอีกสาขา — เลือกหมวดของสาขาเดียวกันหรือหมวดทุกสาขา");
  return c.id;
}

/**
 * บาร์โค้ดซ้ำในระบบ POS นี้ (ของแถวเอง หรือของ InvItem ในคลังที่ขายผ่าน POS นี้) = CONFLICT
 * C10: บาร์โค้ดที่เท่ากับของ InvItem ที่แถวนี้ผูกเอง ไม่นับเป็นการชน
 */
async function assertBarcodeFree(ctx: CatalogCtx, code: string, ownInvItemId: string | null, exceptProductId: string | null, db: CatalogClient): Promise<void> {
  const invSystems = await inventorySystemsOfPos(ctx.tenantId, ctx.systemId, db);
  const items = invSystems.length
    ? await db.invItem.findMany({
        where: { tenantId: ctx.tenantId, systemId: { in: invSystems }, barcode: code, ...(ownInvItemId ? { id: { not: ownInvItemId } } : {}) },
        select: { id: true },
      })
    : [];
  const clash = await db.posProduct.findFirst({
    where: {
      tenantId: ctx.tenantId,
      systemId: ctx.systemId,
      archivedAt: null,
      ...(exceptProductId ? { id: { not: exceptProductId } } : {}),
      OR: [{ barcode: code }, ...(items.length ? [{ invItemId: { in: items.map((i) => i.id) } }] : [])],
    },
    select: { id: true },
  });
  if (clash || items.length > 0) throw conflict("บาร์โค้ดนี้มีสินค้าอื่นใช้อยู่ในระบบขายนี้แล้ว");
}

/** InvItem ต้องอยู่ในคลังที่ขายผ่าน POS ใน ctx (ร้านเดียวกัน) — ไม่ใช่ = NOT_FOUND */
async function loadSellableItem(ctx: CatalogCtx, invItemId: unknown, db: CatalogClient) {
  if (typeof invItemId !== "string" || !invItemId) throw notFound();
  const inv = await db.invItem.findFirst({
    where: { id: invItemId, tenantId: ctx.tenantId },
    select: { id: true, systemId: true, name: true, kind: true, priceSatang: true, costSatang: true, archivedAt: true, onHand: true, accountProductId: true, sortOrder: true },
  });
  if (!inv) throw notFound();
  if (!(await inventorySystemsOfPos(ctx.tenantId, ctx.systemId, db)).includes(inv.systemId)) throw notFound();
  return inv;
}

/** เพิ่มสินค้าในแคตตาล็อก (สิทธิ์ pos.product.manage · ทุกสาขา = ผู้กระทำทุกสาขา C4) — kind ปริยาย PRODUCT */
export async function createProduct(ctx: CatalogCtx, input: CreateProductInput, client: CatalogClient = prisma): Promise<PosProduct> {
  return writeGuard(() =>
    inTx(client, async (tx) => {
      await assertPosSystem(ctx, tx);
      const actor = await actorOf(ctx, tx);
      const i: Record<string, unknown> = isRecord(input) ? input : {};
      const unitId = i.unitId === undefined || i.unitId === null ? null : await assertUnit(ctx, actor, i.unitId, tx);
      requireScope(actor, unitId, PERM_MANAGE);
      const name = cleanName(i.name, "ชื่อสินค้า");
      const nameEn = cleanOptional(i.nameEn, "ชื่อภาษาอังกฤษ");
      if (i.kind !== undefined && !PRODUCT_KINDS.includes(i.kind as PosProductKind)) throw invalid("ชนิดสินค้าไม่ถูกต้อง");
      const price = i.basePriceSatang === undefined || i.basePriceSatang === null ? null : i.basePriceSatang;
      if (price !== null && !isSatang(price)) throw invalid("ราคาต้องเป็นจำนวนเต็มสตางค์ไม่ติดลบ");
      const vatRateBp = cleanVat(i.vatRateBp);
      const barcode = cleanOptional(i.barcode, "บาร์โค้ด");
      const trackStock = i.trackStock === undefined ? null : cleanTrackStock(i.trackStock);
      const categoryId = await assertCategory(ctx, i.categoryId, unitId, tx);
      // AUDIT-CLASS X6: แถวผูกคลัง/บาร์โค้ด ตรวจซ้ำ + เขียน ภายใต้ล็อกร้าน (unique ของ DB เป็นตาข่ายชั้นสุดท้าย → CONFLICT)
      await lockTenant(tx, `pos-catalog:${ctx.tenantId}`);
      let kind: PosProductKind = (i.kind as PosProductKind | undefined) ?? "PRODUCT";
      let invItemId: string | null = null;
      if (i.invItemId !== undefined && i.invItemId !== null) {
        // C10: เมนู/ชุดไม่ผูก InvItem ตรง (ใช้ RecipeLine) · InvItem ต้องยังใช้งาน · ชนิดต้องตรง
        if (i.kind === "MENU" || i.kind === "BUNDLE") throw invalid("เมนู/ชุดสินค้าผูกสินค้าคลังตรงไม่ได้ — ใช้สูตร (ส่วนประกอบ) แทน");
        const inv = await loadSellableItem(ctx, i.invItemId, tx);
        if (inv.archivedAt) throw invalid("สินค้าคลังรายการนี้ถูกเก็บถาวรแล้ว");
        kind = (i.kind as PosProductKind | undefined) ?? (inv.kind === "SERVICE" ? "SERVICE" : "PRODUCT");
        if ((inv.kind === "SERVICE") !== (kind === "SERVICE")) throw invalid("ชนิดสินค้าไม่ตรงกับสินค้าคลัง (สินค้า ↔ บริการ)");
        if (await tx.posProduct.findFirst({ where: { tenantId: ctx.tenantId, systemId: ctx.systemId, invItemId: inv.id }, select: { id: true } }))
          throw conflict("สินค้าจากคลังรายการนี้อยู่ในแคตตาล็อกขายแล้ว");
        invItemId = inv.id;
      }
      if (trackStock === true && !invItemId) throw invalid("ตัดสต็อกได้เฉพาะสินค้าที่ผูกสินค้าคลัง");
      if (barcode) await assertBarcodeFree(ctx, barcode, invItemId, null, tx);
      const row = await tx.posProduct.create({
        data: { tenantId: ctx.tenantId, systemId: ctx.systemId, unitId, invItemId, kind, name, nameEn, categoryId, basePriceSatang: price as number | null, vatRateBp, barcode, trackStock },
      });
      await audit(tx, ctx, "pos.product.create", "PosProduct", row.id, null, {
        name, kind, unitId, invItemId, basePriceSatang: row.basePriceSatang, vatRateBp, barcode, categoryId, trackStock,
      });
      return row;
    }),
  );
}

export type UpdateProductPatch = {
  name?: string;
  nameEn?: string | null;
  categoryId?: string | null;
  unitId?: string | null;
  /** C2: true = ตัดเสมอ · false = ไม่ตัด · null = AUTO */
  trackStock?: boolean | null;
  /** เปิด/ปิดขายรายสาขา { [unitId]: true|false } — แทน setAvailability (ไม่มีฟังก์ชันนั้น) */
  availability?: Record<string, boolean>;
};
const PATCH_KEYS = new Set(["name", "nameEn", "categoryId", "unitId", "trackStock", "availability"]);

/**
 * แก้ชื่อ/หมวด/สาขา/การตัดสต็อก/ความพร้อมขาย (สิทธิ์ pos.product.manage) — ราคาไปทาง setPrice
 * C4: แถวทุกสาขา = ผู้กระทำทุกสาขา · ย้ายสาขา = ต้องมีสิทธิ์ทั้งที่เดิมและที่ใหม่ (ย้ายเป็นทุกสาขา = ผู้กระทำทุกสาขา ·
 *     ไปสาขาที่เข้าไม่ได้ = NOT_FOUND) · หมวดต้องเข้ากับสาขาปลายทาง
 */
export async function updateProduct(ctx: CatalogCtx, id: string, patch: UpdateProductPatch, client: CatalogClient = prisma): Promise<PosProduct> {
  return writeGuard(() =>
    inTx(client, async (tx) => {
      await assertPosSystem(ctx, tx);
      const actor = await actorOf(ctx, tx);
      const before = await loadProduct(ctx, actor, id, tx, true);
      requireScope(actor, before.unitId, PERM_MANAGE);
      const p: Record<string, unknown> = isRecord(patch) ? patch : {};
      if (Object.keys(p).some((k) => !PATCH_KEYS.has(k))) throw invalid("มีช่องที่แก้ผ่านทางนี้ไม่ได้ (ราคาใช้การตั้งราคา)");
      const data: Prisma.PosProductUncheckedUpdateManyInput = {};
      const changed: Record<string, unknown> = {};
      let unitId = before.unitId;
      if ("unitId" in p) {
        unitId = p.unitId === null ? null : await assertUnit(ctx, actor, p.unitId, tx);
        requireScope(actor, unitId, PERM_MANAGE);
        data.unitId = changed.unitId = unitId;
      }
      if ("name" in p) data.name = changed.name = cleanName(p.name, "ชื่อสินค้า");
      if ("nameEn" in p) data.nameEn = changed.nameEn = cleanOptional(p.nameEn, "ชื่อภาษาอังกฤษ");
      if ("trackStock" in p) {
        const ts = cleanTrackStock(p.trackStock);
        if (ts === true && !before.invItemId) throw invalid("ตัดสต็อกได้เฉพาะสินค้าที่ผูกสินค้าคลัง");
        data.trackStock = changed.trackStock = ts;
      }
      if ("categoryId" in p) data.categoryId = changed.categoryId = await assertCategory(ctx, p.categoryId, unitId, tx);
      else if ("unitId" in p && before.categoryId) await assertCategory(ctx, before.categoryId, unitId, tx);
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
    }),
  );
}

/** ตั้งราคาขาย (สตางค์ Int ≥ 0 · 0 = ฟรี) — สิทธิ์ pos.product.setPrice (+ ขอบเขตสาขา C4) · P1.1a ไม่เขียนกลับตารางเดิม (P1.1b) */
export async function setPrice(
  ctx: CatalogCtx,
  id: string,
  priceSatang: number,
  client: CatalogClient = prisma,
): Promise<{ id: string; basePriceSatang: number }> {
  return writeGuard(() =>
    inTx(client, async (tx) => {
      await assertPosSystem(ctx, tx);
      const actor = await actorOf(ctx, tx);
      // AUDIT-CLASS X6 + C11: ล็อกแถวก่อนอ่านราคาเดิม ⇒ 2 เลนพร้อมกันได้ audit 100→200, 200→300 (ไม่ใช่ 100→200, 100→300)
      const before = await loadProduct(ctx, actor, id, tx, true);
      requireScope(actor, before.unitId, PERM_SET_PRICE);
      // AUDIT-CLASS X4: จำนวนเต็มสตางค์เท่านั้น — ติดลบ/เศษสตางค์/NaN/สตริง = VALIDATION (ราคาเดิมไม่เปลี่ยน)
      if (!isSatang(priceSatang)) throw invalid("ราคาต้องเป็นจำนวนเต็มสตางค์ไม่ติดลบ");
      await tx.posProduct.updateMany({ where: { id: before.id, tenantId: ctx.tenantId, systemId: ctx.systemId }, data: { basePriceSatang: priceSatang } });
      await audit(tx, ctx, "pos.product.price", "PosProduct", before.id, { basePriceSatang: before.basePriceSatang }, { basePriceSatang: priceSatang });
      return { id: before.id, basePriceSatang: priceSatang };
    }),
  );
}

/** เก็บถาวร (soft · กดซ้ำได้ไม่ error) — สิทธิ์ pos.product.manage · C11 คืนเวลาที่เก็บจริงเสมอ (แม้แพ้การแข่ง) */
export async function archive(ctx: CatalogCtx, id: string, client: CatalogClient = prisma): Promise<{ id: string; archivedAt: Date }> {
  return writeGuard(() =>
    inTx(client, async (tx) => {
      await assertPosSystem(ctx, tx);
      const actor = await actorOf(ctx, tx);
      const before = await loadProduct(ctx, actor, id, tx, true);
      requireScope(actor, before.unitId, PERM_MANAGE);
      if (before.archivedAt) return { id: before.id, archivedAt: before.archivedAt };
      const r = await tx.posProduct.updateMany({ where: { id: before.id, tenantId: ctx.tenantId, systemId: ctx.systemId, archivedAt: null }, data: { archivedAt: new Date() } });
      const stored = await tx.posProduct.findFirst({ where: { id: before.id, tenantId: ctx.tenantId, systemId: ctx.systemId }, select: { archivedAt: true } });
      if (!stored?.archivedAt) throw notFound();
      if (r.count === 1) await audit(tx, ctx, "pos.product.archive", "PosProduct", before.id, { archivedAt: null }, { archivedAt: stored.archivedAt.toISOString() });
      return { id: before.id, archivedAt: stored.archivedAt };
    }),
  );
}

/**
 * ให้แน่ใจว่า InvItem นี้มีแถว (ทุกสาขา) ในแคตตาล็อกของระบบ POS ใน ctx — สร้างครั้งเดียว · เรียกซ้ำได้ id เดิม
 * ราคา C7 · VAT C8 · trackStock = null (AUTO · C2) · ชื่อ/ชนิด/เก็บถาวร ตาม InvItem · C4: ผู้กระทำทุกสาขาเท่านั้น
 * AUDIT-CLASS X1 + X6: ล็อกร้าน + INSERT … ON CONFLICT DO NOTHING บน unique(systemId, invItemId) ⇒ 10 เลนพร้อมกันได้แถวเดียว id เดียว
 */
export async function ensureForInvItem(ctx: CatalogCtx, invItemId: string, client: CatalogClient = prisma): Promise<{ id: string; created: boolean }> {
  return writeGuard(() =>
    inTx(client, async (tx) => {
      await assertPosSystem(ctx, tx);
      const actor = await actorOf(ctx, tx);
      requireScope(actor, null, PERM_MANAGE);
      const inv = await loadSellableItem(ctx, invItemId, tx);
      const existing = await tx.posProduct.findFirst({ where: { tenantId: ctx.tenantId, systemId: ctx.systemId, invItemId: inv.id }, select: { id: true } });
      if (existing) return { id: existing.id, created: false };
      await lockTenant(tx, `pos-catalog:${ctx.tenantId}`);
      const again = await tx.posProduct.findFirst({ where: { tenantId: ctx.tenantId, systemId: ctx.systemId, invItemId: inv.id }, select: { id: true } });
      if (again) return { id: again.id, created: false };
      const book = await bookOfPos(ctx.tenantId, ctx.systemId, tx);
      const apRows = inv.accountProductId
        ? await tx.accountProduct.findMany({
            where: { tenantId: ctx.tenantId, id: inv.accountProductId },
            select: { id: true, systemId: true, salePrice: true, posPrice: true, posEnabled: true, vatRateBp: true, archivedAt: true },
          })
        : [];
      const ap = strictAp(inv, new Map(apRows.map((a) => [a.id, a])), book);
      const kind: PosProductKind = inv.kind === "SERVICE" ? "SERVICE" : "PRODUCT";
      const r = await tx.posProduct.createMany({
        data: [{
          id: randomUUID(),
          tenantId: ctx.tenantId,
          systemId: ctx.systemId,
          invItemId: inv.id,
          kind,
          name: inv.name,
          basePriceSatang: initialPrice({ ap, inv }).price,
          vatRateBp: vatOf(ap, book),
          sortOrder: inv.sortOrder,
          trackStock: null,
          archivedAt: inv.archivedAt,
        }],
        skipDuplicates: true,
      });
      const row = await tx.posProduct.findFirst({ where: { tenantId: ctx.tenantId, systemId: ctx.systemId, invItemId: inv.id }, select: { id: true, basePriceSatang: true } });
      if (!row) throw notFound();
      if (r.count === 1) await audit(tx, ctx, "pos.product.create", "PosProduct", row.id, null, { invItemId: inv.id, kind, basePriceSatang: row.basePriceSatang, source: "ensureForInvItem" });
      return { id: row.id, created: r.count === 1 };
    }),
  );
}

/**
 * เพิ่มหมวด (ทุกสาขา หรือเฉพาะสาขา) — สิทธิ์ pos.product.manage · หมวดทุกสาขา = ผู้กระทำทุกสาขา (C4)
 * ชื่อซ้ำในระบบ+สาขาเดียวกัน = CONFLICT (unique ของสาขา + M5 partial unique ของหมวดทุกสาขา — แข่งกันก็ได้ CONFLICT)
 */
export async function createCategory(
  ctx: CatalogCtx,
  input: { name: string; nameEn?: string | null; unitId?: string | null; sortOrder?: number },
  client: CatalogClient = prisma,
): Promise<{ id: string; name: string; unitId: string | null }> {
  return writeGuard(() =>
    inTx(client, async (tx) => {
      await assertPosSystem(ctx, tx);
      const actor = await actorOf(ctx, tx);
      const i: Record<string, unknown> = isRecord(input) ? input : {};
      const unitId = i.unitId === undefined || i.unitId === null ? null : await assertUnit(ctx, actor, i.unitId, tx);
      requireScope(actor, unitId, PERM_MANAGE);
      const name = cleanName(i.name, "ชื่อหมวด");
      const nameEn = cleanOptional(i.nameEn, "ชื่อหมวดภาษาอังกฤษ");
      const sortOrder = i.sortOrder === undefined || i.sortOrder === null ? 0 : i.sortOrder;
      if (typeof sortOrder !== "number" || !Number.isInteger(sortOrder) || Math.abs(sortOrder) > 1_000_000) throw invalid("ลำดับหมวดต้องเป็นจำนวนเต็ม");
      const dup = await tx.posCategory.findFirst({ where: { tenantId: ctx.tenantId, systemId: ctx.systemId, unitId, name }, select: { id: true } });
      if (dup) throw conflict("มีหมวดชื่อนี้อยู่แล้ว");
      const row = await tx.posCategory.create({ data: { tenantId: ctx.tenantId, systemId: ctx.systemId, unitId, name, nameEn, sortOrder } });
      await audit(tx, ctx, "pos.category.create", "PosCategory", row.id, null, { name, nameEn, unitId, sortOrder });
      return { id: row.id, name: row.name, unitId: row.unitId };
    }),
  );
}

// ═══════════════════ backfill (ขั้น 1 ของ POS-MIGRATION-PLAN) ═══════════════════

/** ตัวนับที่ C7/C9/C13 สั่งให้รายงาน (นับจากแหล่งทุกแถวในขอบเขต — แถวใหม่และแถวที่ผูกไว้แล้ว) */
export type BackfillCounts = {
  soldAtCostToday: number;
  zeroPriceProduct: number;
  zeroPriceMenu: number;
  zeroPriceWeb: number;
  invalidLegacyPrice: number;
  posPriceDiffersFromSalePrice: number;
  shopPriceDiffersFromCatalog: number;
  shopInactiveLinked: number;
  shopOwnRowInvItemOutsideFirstPos: number;
  shopDanglingInvItem: number;
  shopBranchNotInFirstPos: number;
  /** แถวจาก InvItem ที่ AUTO จะตัดสต็อกจริงตอนนี้ (มี movement หรือ onHand ≠ 0) — ให้เจ้าของเห็นก่อนเปิดใช้ (C2) */
  trackStockAutoOn: number;
};
export type BackfillSummary = {
  dryRun: boolean;
  tenants: number;
  sources: { invItem: number; menuItem: number; shopProduct: number };
  perSystem: Record<string, { invItem: number; menuItem: number; shopProduct: number }>;
  /** แหล่งที่หา POS ตามทางขายจริงไม่เจอ (InvItem: 0 หรือ >1 POS · เมนู: สาขาไม่มี POS · เว็บร้าน: ร้านไม่มี POS) */
  skippedNoPosSystem: { invItem: number; menuItem: number; shopProduct: number };
  skipped: { invItemNoPos: number; invItemAmbiguousPos: number; menuItemNoPos: number; shopProductNoPos: number; recipeInvItemMissing: number };
  skippedAmbiguousPos: number;
  counts: BackfillCounts;
  /** C7: ตัวอย่างสินค้าที่ลิ้นชักวันนี้คิดราคาทุน (≤20 ต่อร้าน) — เจ้าของตั้งราคาจริงก่อนเปิดใช้ */
  samples: { soldAtCostToday: Record<string, { invItemId: string; name: string }[]> };
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

function emptyCounts(): BackfillCounts {
  return {
    soldAtCostToday: 0, zeroPriceProduct: 0, zeroPriceMenu: 0, zeroPriceWeb: 0, invalidLegacyPrice: 0, posPriceDiffersFromSalePrice: 0,
    shopPriceDiffersFromCatalog: 0, shopInactiveLinked: 0, shopOwnRowInvItemOutsideFirstPos: 0, shopDanglingInvItem: 0, shopBranchNotInFirstPos: 0, trackStockAutoOn: 0,
  };
}
function emptySummary(dryRun: boolean): BackfillSummary {
  return {
    dryRun,
    tenants: 0,
    sources: { invItem: 0, menuItem: 0, shopProduct: 0 },
    perSystem: {},
    skippedNoPosSystem: { invItem: 0, menuItem: 0, shopProduct: 0 },
    skipped: { invItemNoPos: 0, invItemAmbiguousPos: 0, menuItemNoPos: 0, shopProductNoPos: 0, recipeInvItemMissing: 0 },
    skippedAmbiguousPos: 0,
    counts: emptyCounts(),
    samples: { soldAtCostToday: {} },
    created: { posProduct: 0, posCategory: 0, posProductOptionGroup: 0, recipeLine: 0, invItem: 0 },
    updated: { posProduct: 0, menuItem: 0, shopProduct: 0 },
    alreadyDone: { invItem: 0, menuItem: 0, shopProduct: 0 },
    failedTenants: [],
  };
}

/** วางแผนของร้านเดียว (อ่านล้วน) — dry-run และรันจริงใช้แผนเดียวกัน ⇒ ตัวเลขที่ dry-run ทำนาย = ที่สร้างจริง */
async function planTenant(tenantId: string, db: CatalogClient, s: BackfillSummary): Promise<TenantPlan> {
  const res = await loadPosResolution(tenantId, db);
  // C13 / S8: movement ใช้ groupBy (SELECT DISTINCT "itemId") — ไม่โหลดแถว movement ทั้งหมดเข้าหน่วยความจำ
  const [products, categories, items, aps, moved, menuCats, menus, menuOgs, shops, bookLinks, settings] = await Promise.all([
    db.posProduct.findMany({ where: { tenantId }, select: { id: true, systemId: true, invItemId: true, basePriceSatang: true } }),
    db.posCategory.findMany({ where: { tenantId }, select: { id: true, systemId: true, unitId: true, name: true } }),
    db.invItem.findMany({
      where: { tenantId },
      select: { id: true, systemId: true, name: true, kind: true, priceSatang: true, costSatang: true, archivedAt: true, onHand: true, accountProductId: true, sortOrder: true },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    }),
    db.accountProduct.findMany({ where: { tenantId }, select: { id: true, systemId: true, salePrice: true, posPrice: true, posEnabled: true, vatRateBp: true, archivedAt: true } }),
    db.invMovement.groupBy({ by: ["itemId"], where: { tenantId } }),
    db.menuCategory.findMany({ where: { tenantId }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] }),
    db.menuItem.findMany({ where: { tenantId }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] }),
    db.menuItemOptionGroup.findMany({ where: { tenantId }, select: { itemId: true, groupId: true, sortOrder: true } }),
    db.shopProduct.findMany({ where: { tenantId }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] }),
    db.accountSystemLink.findMany({
      where: { tenantId, linkedKind: "POS", archivedAt: null, enabled: true },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: { linkedId: true, systemId: true },
    }),
    db.accountSettings.findMany({ where: { tenantId }, select: { systemId: true, vatRegistered: true } }),
  ]);
  const movedSet = new Set(moved.map((m) => m.itemId));
  const plan: TenantPlan = { products: [], categories: [], optionLinks: [], recipes: [], menuLinks: [], shopLinks: [] };
  const per = (sys: string) => (s.perSystem[sys] ??= { invItem: 0, menuItem: 0, shopProduct: 0 });
  const productIds = new Set(products.map((p) => p.id));
  const priceOfProduct = new Map<string, number | null>(products.map((p) => [p.id, p.basePriceSatang]));
  const byInvKey = new Map(products.filter((p) => p.invItemId).map((p) => [`${p.systemId}|${p.invItemId}`, p.id]));
  const apById = new Map(aps.map((a) => [a.id, a]));
  const itemById = new Map(items.map((i) => [i.id, i]));
  const vatRegOf = new Map(settings.map((x) => [x.systemId, x.vatRegistered]));
  const bookOf = new Map<string, BookInfo>();
  for (const l of bookLinks) if (!bookOf.has(l.linkedId)) bookOf.set(l.linkedId, { accountSystemId: l.systemId, vatRegistered: vatRegOf.get(l.systemId) ?? true });
  const book = (posSys: string): BookInfo => bookOf.get(posSys) ?? { accountSystemId: null, vatRegistered: false };
  const samples = (s.samples.soldAtCostToday[tenantId] ??= []);

  // 1) InvItem → PosProduct ของระบบ POS ที่ขายมัน (แถวเดียวต่อ InvItem ต่อระบบ)
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
    const bk = book(r.systemId);
    const ap = strictAp(inv, apById, bk);
    const pr = initialPrice({ ap, inv });
    // ตัวนับ C7 (จากแหล่งทุกแถว): ลิ้นชักวันนี้หา AP แบบ InvItem.accountProductId (ไม่กรองสมุด/เก็บถาวร) แล้ว salePrice > 0 ? ราคานั้น : ต้นทุน
    const tillAp = inv.accountProductId ? apById.get(inv.accountProductId) : undefined;
    const tillSale = tillAp?.salePrice ?? null;
    if (pr.invalidLegacy) s.counts.invalidLegacyPrice++;
    if (inv.kind !== "SERVICE" && pr.price === null && !(typeof tillSale === "number" && tillSale > 0) && inv.costSatang > 0) {
      s.counts.soldAtCostToday++;
      if (samples.length < 20) samples.push({ invItemId: inv.id, name: inv.name });
    }
    if (pr.rung === "free") s.counts.zeroPriceProduct++;
    if (effectiveTrackStock({ trackStock: null, invItemId: inv.id, kind: inv.kind === "SERVICE" ? "SERVICE" : "PRODUCT" }, { hasMovement: movedSet.has(inv.id), onHand: inv.onHand }).trackStock)
      s.counts.trackStockAutoOn++;
    if (ap && legalPrice(ap.salePrice) && ap.salePrice > 0 && legalPrice(ap.posPrice) && ap.posPrice > 0 && ap.posPrice !== ap.salePrice) s.counts.posPriceDiffersFromSalePrice++;
    const key = `${r.systemId}|${inv.id}`;
    if (byInvKey.has(key)) {
      s.alreadyDone.invItem++;
      continue;
    }
    const kind: PosProductKind = inv.kind === "SERVICE" ? "SERVICE" : "PRODUCT";
    const id = randomUUID();
    plan.products.push({
      id, tenantId, systemId: r.systemId, invItemId: inv.id, kind, name: inv.name,
      basePriceSatang: pr.price, vatRateBp: vatOf(ap, bk), sortOrder: inv.sortOrder, trackStock: null, archivedAt: inv.archivedAt,
    });
    byInvKey.set(key, id);
    priceOfProduct.set(id, pr.price);
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
  const ogsByItem = new Map<string, typeof menuOgs>();
  for (const og of menuOgs) ogsByItem.set(og.itemId, [...(ogsByItem.get(og.itemId) ?? []), og]);
  s.sources.menuItem += menus.length;
  for (const m of menus) {
    const r = resolvePosSystem(res, { kind: "menuItem", unitId: m.unitId });
    if (!r.systemId) {
      s.skippedNoPosSystem.menuItem++;
      s.skipped.menuItemNoPos++;
      continue;
    }
    per(r.systemId).menuItem++;
    const pr = initialPrice({ own: m.basePrice });
    if (pr.invalidLegacy) s.counts.invalidLegacyPrice++;
    if (pr.price === 0) s.counts.zeroPriceMenu++;
    if (m.posProductId && productIds.has(m.posProductId)) {
      s.alreadyDone.menuItem++;
      continue;
    }
    const id = randomUUID();
    plan.products.push({
      id, tenantId, systemId: r.systemId, unitId: m.unitId, invItemId: null, kind: "MENU", name: m.name, nameEn: m.nameEn,
      categoryId: catOfMenuCat.get(m.categoryId) ?? null, basePriceSatang: pr.price, images: toStrings(m.images), sortOrder: m.sortOrder,
      trackStock: null, stationId: m.stationId, stockQty: m.stockQty, dailyStockQty: m.dailyStockQty, isOutOfStock: m.isOutOfStock,
      archivedAt: m.archivedAt ?? (m.status === "ARCHIVED" ? m.updatedAt : null),
    });
    for (const og of ogsByItem.get(m.id) ?? []) plan.optionLinks.push({ tenantId, productId: id, groupId: og.groupId, sortOrder: og.sortOrder });
    if (m.invItemId) {
      if (itemById.has(m.invItemId)) plan.recipes.push({ tenantId, productId: id, invItemId: m.invItemId, qty: 1 });
      else s.skipped.recipeInvItemMissing++;
    }
    plan.menuLinks.push({ id: m.id, productId: id });
  }

  // 4) ShopProduct → POS ตัวแรกของร้าน (C9): a) InvItem ขายใน POS แรก = แถวของ InvItem นั้น (ไม่แก้แถวร่วม)
  //    b) InvItem อยู่นอกคลังของ POS แรก = แถวของตัวเองใน POS แรก (invItemId ตั้ง · unitId สาขาร้าน)
  //    c) invItemId ชี้ InvItem ที่ไม่มีแล้ว = แถวของตัวเอง invItemId null · d) ไม่ผูกคลัง = แถวของตัวเอง
  //    ทุกกรณี ShopProduct.posProductId ถูกตั้ง · สาขาที่ไม่อยู่ใน POS แรก = นับ (เว็บล้วน · แก้ไขได้ใน P2.8)
  s.sources.shopProduct += shops.length;
  const firstPosUnits = new Set([...res.unitPos.entries()].filter(([, sys]) => sys === res.firstPos).map(([u]) => u));
  for (const sp of shops) {
    const r = resolvePosSystem(res, { kind: "shopProduct" });
    if (!r.systemId) {
      s.skippedNoPosSystem.shopProduct++;
      s.skipped.shopProductNoPos++;
      continue;
    }
    per(r.systemId).shopProduct++;
    if (!firstPosUnits.has(sp.unitId)) s.counts.shopBranchNotInFirstPos++;
    const inv = sp.invItemId ? itemById.get(sp.invItemId) ?? null : null;
    const shared = inv ? byInvKey.get(`${r.systemId}|${inv.id}`) : undefined;
    const sharedIsInvRow = !!inv && resolvePosSystem(res, { kind: "invItem", inventorySystemId: inv.systemId }).systemId === r.systemId;
    if (inv && shared && sharedIsInvRow) {
      // C9a — นับอย่างเดียว ไม่แก้แถวร่วม
      if (priceOfProduct.get(shared) !== sp.priceSatang) s.counts.shopPriceDiffersFromCatalog++;
      if (!sp.active) s.counts.shopInactiveLinked++;
    } else if (inv) s.counts.shopOwnRowInvItemOutsideFirstPos++;
    else if (sp.invItemId) s.counts.shopDanglingInvItem++;
    const own = initialPrice({ own: sp.priceSatang });
    if (!(inv && shared && sharedIsInvRow)) {
      if (own.invalidLegacy) s.counts.invalidLegacyPrice++;
      if (own.price === 0) s.counts.zeroPriceWeb++;
    }
    if (sp.posProductId && productIds.has(sp.posProductId)) {
      s.alreadyDone.shopProduct++;
      continue;
    }
    if (inv && shared && sharedIsInvRow) {
      plan.shopLinks.push({ id: sp.id, productId: shared });
      continue;
    }
    if (inv && shared) {
      // C9b แถวของเว็บร้านแถวก่อนหน้าที่ชี้ InvItem เดียวกัน (unique ระบบ+InvItem) — ใช้แถวนั้นร่วม
      plan.shopLinks.push({ id: sp.id, productId: shared });
      continue;
    }
    const bk = book(r.systemId);
    const ap = inv ? strictAp(inv, apById, bk) : null;
    const pr = initialPrice({ ap, inv, own: sp.priceSatang });
    const id = randomUUID();
    plan.products.push({
      id, tenantId, systemId: r.systemId, unitId: sp.unitId, invItemId: inv ? inv.id : null,
      kind: inv?.kind === "SERVICE" ? "SERVICE" : "PRODUCT", name: sp.name, basePriceSatang: pr.price, vatRateBp: vatOf(ap, bk),
      images: sp.imageUrl ? [sp.imageUrl] : [], sortOrder: sp.sortOrder, trackStock: null,
      // สินค้าเว็บที่ปิดขาย = ปิดขายที่สาขานั้น (ไม่ใช่เก็บถาวร — เปิดคืนได้)
      unavailableUnitIds: sp.active ? [] : [sp.unitId],
    });
    if (inv) byInvKey.set(`${r.systemId}|${inv.id}`, id);
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
 *   • dryRun: อ่านล้วน ไม่เรียกคำสั่งเขียนเลย — ตัวเลข created/updated = "จะสร้าง/จะแก้" · counts = ข้อมูลที่เจ้าของควรรู้ก่อนเปิดใช้
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
  for (const k of Object.keys(from.counts) as (keyof BackfillCounts)[]) into.counts[k] += from.counts[k];
  Object.assign(into.samples.soldAtCostToday, from.samples.soldAtCostToday);
  into.skippedAmbiguousPos += from.skippedAmbiguousPos;
  for (const [sys, v] of Object.entries(from.perSystem)) {
    const cur = (into.perSystem[sys] ??= { invItem: 0, menuItem: 0, shopProduct: 0 });
    cur.invItem += v.invItem;
    cur.menuItem += v.menuItem;
    cur.shopProduct += v.shopProduct;
  }
}
