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
// 🔁 P1.1b (ส่วน A): ทางย้อน G4b — setPrice/updateProduct(ชื่อ)/archive/restore เขียนช่องเดิมช่องเดียวในธุรกรรมเดียว (writeBack*)
//   ขาเดิม→แคตตาล็อกอยู่ที่ `catalog-legacy.ts` (ผู้เขียนคนที่สอง · ประตูเดิมเรียกด้วย tx ของตัวเอง) · ตัวแปลงเดียว (G3) อยู่ที่นี่
// 🔴 ห้ามแตะ createSale/voidSale (service.ts) · register.ts — จอเดิมทุกจอยังอ่านตารางเดิมตามเดิม
// หนี้ (N5 → P1.1b): อ่านตารางของโมดูลอื่นตรง (AppSystemUnit · InvItem · AccountProduct · AccountSystemLink · AccountSettings · Menu*)
//   แบบเดียวกับ register.ts — P1.1b ตัดสินว่าจะย้ายไป facade หรือบันทึกเป็นข้อยกเว้น
// 🔁 R5 (brief pos-brief-P1.1a-R5.md F1–F7):
//   • ทุกฟังก์ชันของ facade (`catalog.<fn>` — createProduct · updateProduct · setPrice · archive · restore · listForUnit · byBarcode ·
//     ensureForInvItem · createCategory · checkCatalogWrite) ห่อด้วย `boundary`: error ที่ไม่ใช่ CatalogError = CatalogError `INTERNAL`
//     ข้อความไทยคงที่ (ไม่มี path/SQL/ข้อความต้นฉบับ) · ต้นฉบับอยู่ใน `cause` + console.error ครั้งเดียวฝั่งเซิร์ฟเวอร์ · P2002 = CONFLICT
//     ผู้เรียกที่ส่ง tx ของตัวเองมา: error ใด ๆ ใน tx (รวม CONFLICT/INTERNAL) = ธุรกรรมของผู้เรียกถูก Postgres ยกเลิกแล้ว — ต้อง rollback ทั้งก้อน (เหมือน R3)
//   • สตริงทุกตัวที่จะถึง DB (ctx · id · ชื่อ · บาร์โค้ด · q · cursor) ที่มี NUL หรือ UTF-16 ผิดรูป = VALIDATION ก่อนแตะ DB
//     (byBarcode: รหัสสแกนผิดรูป = `{items: []}` — เครื่องสแกนสะดุดต้องไม่ throw)
//   • ล็อกร้าน = `pg_try_advisory_xact_lock` ลองซ้ำแบบสุ่มหน่วง ≤ LOCK_BUDGET_MS แล้ว `BUSY` (ลองใหม่ได้) — เพดาน tx ของ client แอป = 30 วิ
//     (core/db.ts transactionOptions · วัดแล้ว) · client เปล่า = 5 วิ ⇒ งบ 3.5 วิ อยู่ใต้ทั้งคู่ · backfill ยังใช้ล็อกแบบรอ (ผู้ถือยาว · ต่อร้าน)
//   • 🔴 กติกาผู้เรียก `checkCatalogWrite`: `isMembershipCtx` ตรวจ "รูปร่าง" เท่านั้น — ต้องส่ง MembershipCtx ของ SESSION ที่โหลดจาก DB
//     (core/context) เสมอ ห้ามประกอบออบเจกต์จากข้อมูลในคำขอ (body/query/คุกกี้) — รูปร่างถูกไม่ได้แปลว่าเป็นสิทธิ์จริง

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

/** R5: BUSY = ล็อกร้านไม่ว่างเกินงบรอ (ลองใหม่ได้) · INTERNAL = ขัดข้องที่ไม่คาดคิด (ต้นฉบับอยู่ใน `cause` · log ฝั่งเซิร์ฟเวอร์เท่านั้น) */
export type CatalogErrorCode = "NOT_FOUND" | "PERMISSION_DENIED" | "VALIDATION" | "CONFLICT" | "BUSY" | "INTERNAL";

/** error ของแคตตาล็อก — ผู้เรียกตัดสินจาก `.code` เท่านั้น (ข้อความไว้แสดงผู้ใช้) */
export class CatalogError extends Error {
  readonly code: CatalogErrorCode;
  constructor(code: CatalogErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "CatalogError";
    this.code = code;
  }
}

const notFound = () => new CatalogError("NOT_FOUND", "ไม่พบรายการนี้ในระบบขาย");
const denied = () => new CatalogError("PERMISSION_DENIED", "บัญชีนี้ยังไม่ได้รับสิทธิ์ทำรายการนี้ — ขอสิทธิ์จากเจ้าของร้าน");
const invalid = (message: string) => new CatalogError("VALIDATION", message);
const conflict = (message: string) => new CatalogError("CONFLICT", message);
const busy = () => new CatalogError("BUSY", "ระบบกำลังบันทึกแคตตาล็อกของร้านนี้อยู่ — ยังไม่ได้บันทึกรายการนี้ ลองอีกครั้งในอีกสักครู่");
/** R5 F2: ข้อความเดียวของ INTERNAL ทุกฟังก์ชัน — ไม่มี path / SQL / ข้อความต้นฉบับ */
const INTERNAL_MESSAGE = "ระบบขายขัดข้องชั่วคราว ยังไม่ได้บันทึกรายการนี้ — ลองอีกครั้ง หากยังไม่ได้โปรดแจ้งผู้ดูแลระบบ";
const DIRTY_TEXT_MESSAGE = "ข้อมูลที่ส่งมามีอักขระที่ระบบขายบันทึกไม่ได้ (เช่น อักขระว่าง) — ยังไม่ได้บันทึกอะไร";

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

/**
 * R5 F2 — ขอบของ facade (ทุกฟังก์ชันที่ export ผ่าน `catalog.<fn>`): CatalogError ผ่านตามเดิม · C10 P2002 = CONFLICT ·
 * อย่างอื่นทั้งหมด (Prisma/driver/TypeError/client ของผู้เรียกพัง) = CatalogError `INTERNAL` ข้อความคงที่ · ต้นฉบับใน `cause` ·
 * console.error ครั้งเดียวฝั่งเซิร์ฟเวอร์ · ค่าที่คืนเมื่อสำเร็จไม่เปลี่ยน
 */
async function boundary<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof CatalogError) throw e;
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") throw conflict("มีรายการนี้อยู่แล้ว (ชื่อ/บาร์โค้ด/สินค้าคลังซ้ำ)");
    console.error("[pos/catalog] INTERNAL", e);
    throw new CatalogError("INTERNAL", INTERNAL_MESSAGE, { cause: e });
  }
}

/** R5 F2: ไม่มี NUL และเป็น UTF-16 ที่ถูกรูป (surrogate ครบคู่) — แบบเดียวกับ `String.prototype.isWellFormed` + ห้าม U+0000 */
function isCleanText(s: string): boolean {
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c === 0) return false;
    if (c >= 0xd800 && c <= 0xdbff) {
      const d = s.charCodeAt(i + 1);
      if (!(d >= 0xdc00 && d <= 0xdfff)) return false;
      i++;
    } else if (c >= 0xdc00 && c <= 0xdfff) return false;
  }
  return true;
}
/** มีสตริงสกปรกไหม — สตริง · คีย์/ค่าของออบเจกต์และอาร์เรย์ (เฉพาะของตัวเอง · ลึก ≤ 4) */
function hasDirtyText(v: unknown, depth = 0): boolean {
  if (typeof v === "string") return !isCleanText(v);
  if (depth >= 4 || !v || typeof v !== "object") return false;
  for (const k of Object.keys(v)) if (!isCleanText(k) || hasDirtyText((v as Record<string, unknown>)[k], depth + 1)) return true;
  return false;
}
/** R5 F2: ด่านแรกของทุกฟังก์ชัน facade — ก่อนแตะ DB (ไม่ส่ง client เข้ามา) */
function assertCleanInputs(...vals: unknown[]): void {
  if (vals.some((v) => hasDirtyText(v))) throw invalid(DIRTY_TEXT_MESSAGE);
}

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
/**
 * R5 F6: อ่านเฉพาะคีย์ของตัวเอง (Object.keys = own enumerable · คีย์จาก prototype ไม่นับ) · ไม่ใช่ออบเจกต์ (null · อาร์เรย์ · ค่าเดี่ยว) = VALIDATION
 * คีย์ของตัวเองที่ไม่อยู่ใน `allowed` = VALIDATION (ไม่เงียบทิ้ง)
 */
function ownFields(v: unknown, allowed: ReadonlySet<string>, what: string, unknownMessage: string): Record<string, unknown> {
  if (!isRecord(v)) throw invalid(`ข้อมูล${what}ต้องเป็นชุดช่อง (ออบเจกต์) — ยังไม่ได้บันทึกอะไร`);
  const out: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const k of Object.keys(v)) {
    if (!allowed.has(k)) throw invalid(unknownMessage);
    out[k] = v[k];
  }
  return out;
}
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
/** รูปของ ctx (ร้าน + ระบบเป็นสตริงไม่ว่าง) — ไม่ใช่ = NOT_FOUND (ก่อนใช้ ctx.tenantId ทำคีย์ล็อก/คำสั่งใด ๆ) */
function assertCtxShape(ctx: CatalogCtx): void {
  if (!isRecord(ctx) || typeof ctx.tenantId !== "string" || !ctx.tenantId || typeof ctx.systemId !== "string" || !ctx.systemId) throw notFound();
}
async function assertPosSystem(ctx: CatalogCtx, db: CatalogClient): Promise<void> {
  assertCtxShape(ctx);
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
    select: { role: true, unitAccess: true, permissions: true, acceptedAt: true },
  });
  // กติกาบ้าน (core/context.ts:23,50 · push.ts:313-315): คำเชิญที่ยังไม่รับ / ถูกถอน (acceptedAt null) = ไม่ใช่สมาชิก
  if (!m || !m.acceptedAt) throw notFound();
  return { role: m.role, unitAccess: toStrings(m.unitAccess), permissions: isRecord(m.permissions) ? m.permissions : {} };
}

/** ผู้กระทำ "ทุกสาขา" = OWNER หรือ unitAccess ["*"] (rbac.canGrantUnitAccess) — ใช้เฉพาะเมื่อขอบเขตว่าง (D1) */
const isAllBranchActor = (m: MembershipCtx): boolean => canGrantUnitAccess(m, ["*"]);

/** แถวที่จะเขียน (หรือจะเป็นหลังเขียน) — สาขา + InvItem ที่ผูก */
export type CatalogRowScope = { unitId: string | null; invItemId: string | null };
export type CatalogWriteVerdict = "OK" | "NOT_FOUND" | "PERMISSION_DENIED";

const ROLES: ReadonlySet<string> = new Set(["OWNER", "MANAGER", "STAFF"]);
/** E1: ค่านี้เป็น MembershipCtx จริงไหม (role ถูกชนิด · unitAccess เป็นรายการสตริง · permissions เป็นออบเจกต์) — null/undefined/ตัวบ่งชี้ระบบ/อื่น ๆ = ไม่ใช่ */
function isMembershipCtx(v: unknown): v is MembershipCtx {
  return (
    isRecord(v) &&
    typeof v.role === "string" &&
    ROLES.has(v.role) &&
    Array.isArray(v.unitAccess) &&
    v.unitAccess.every((x) => typeof x === "string") &&
    isRecord(v.permissions)
  );
}

/**
 * D1 + E1 — ตัวตัดสินเดียว "สมาชิกคนนี้เขียนแถวนี้ได้ไหม" (export ผ่าน facade `catalog.checkCatalogWrite` · หน้า POS ใช้ร่วมได้ ·
 * คู่กับ `posCanSetTenantPrice` ของ hotfix/pos-page-authz — ต้องตรงกันตอน merge) — คืนค่าเสมอ ไม่ throw สำหรับกรณีปฏิเสธ
 *   • actor ต้องเป็น MembershipCtx จริง — null / undefined / ตัวบ่งชี้ระบบ / ค่าอื่น = "PERMISSION_DENIED" (กติกาบ้าน `evaluate(null)` = false ·
 *     ทางข้ามสิทธิ์ของระบบมีเฉพาะทางภายใน `rowWriteVerdict` ที่ `actorOf` ส่ง null มาเมื่อเห็นตัวบ่งชี้)
 *   • where ต้องเป็นระบบ POS ที่เปิดใช้งานของร้านนั้น · row.unitId (ถ้ามี) ต้องเป็นสาขาไม่เก็บถาวรที่ผูก where.systemId — ไม่ใช่ = "NOT_FOUND"
 *     (ผู้เรียกไม่ต้องจำไปตรวจเอง)
 *   • แถวของสาขา: เข้าสาขาไม่ได้ = NOT_FOUND · ไม่มีคีย์ที่สาขานั้น = PERMISSION_DENIED
 *   • แถวทุกสาขา (unitId null): ขอบเขต = สาขา (ไม่เก็บถาวร) ของ POS นี้ที่ขายแถวนี้ได้จริง — แถวผูก InvItem นับเฉพาะสาขาที่คลังของสาขา
 *     คือคลังของ InvItem (C3) · ต้องมีคีย์ (`evaluate(action, unitId)`) ที่ **ทุก** สาขาในขอบเขต · ขอบเขตว่าง = OWNER หรือ unitAccess `*` เท่านั้น
 * ผลที่ต้องเป็น: ผู้จัดการร้านสาขาเดียว (unitAccess=[สาขานั้น]) เขียนสินค้าทุกสาขาของร้านตัวเองได้ · ผู้จัดการที่ระบุครบทุกสาขาได้ ·
 *   ผู้จัดการสาขา A ในร้านสองสาขาเขียนแถวทุกสาขาที่ขายที่ B ไม่ได้ แต่เขียนแถวทุกสาขาที่ (ตาม C3) ขายได้แค่ที่ A ได้
 *   • R5 F6: `row.invItemId` (ถ้ามี) ต้องเป็น InvItem ของร้านนี้ในคลังที่ขายผ่าน POS นี้ — ไม่มีจริง/ร้านอื่น/คลังอื่น = "NOT_FOUND" ทุกผู้กระทำ (รวมเจ้าของ)
 *     (ทางภายใน `rowWriteVerdict` ไม่ตรวจซ้ำ — ผู้เขียนตรวจด้วย `loadSellableItem` · แถวเดิมที่คลังเลิกขายผ่าน POS นี้ภายหลังยังแก้ได้ตามเดิม)
 *   • R5 F2: สตริงสกปรก (NUL / UTF-16 ผิดรูป) ใน where/row = "NOT_FOUND" · action = "PERMISSION_DENIED" (คืนค่า ไม่ throw)
 * 🔴 `actor` ต้องเป็น MembershipCtx ของ SESSION (โหลดจาก DB) — `isMembershipCtx` ตรวจรูปร่างเท่านั้น ห้ามประกอบจากข้อมูลในคำขอ
 */
export async function checkCatalogWrite(
  actor: MembershipCtx,
  where: { tenantId: string; systemId: string },
  row: CatalogRowScope,
  action: string,
  client: CatalogClient = prisma,
): Promise<CatalogWriteVerdict> {
  return boundary<CatalogWriteVerdict>(async () => {
    if (!isMembershipCtx(actor)) return "PERMISSION_DENIED";
    if (!isRecord(where) || typeof where.tenantId !== "string" || !where.tenantId || typeof where.systemId !== "string" || !where.systemId) return "NOT_FOUND";
    if (!isRecord(row) || (row.unitId !== null && (typeof row.unitId !== "string" || !row.unitId))) return "NOT_FOUND";
    if (row.invItemId !== null && (typeof row.invItemId !== "string" || !row.invItemId)) return "NOT_FOUND";
    if (typeof action !== "string" || !action || !isCleanText(action)) return "PERMISSION_DENIED";
    if (hasDirtyText([where.tenantId, where.systemId, row.unitId, row.invItemId])) return "NOT_FOUND";
    // AUDIT-CLASS X2: ระบบ POS ของร้านนี้ที่เปิดใช้งาน (ห้ามเชื่อ systemId ของผู้เรียก)
    const sys = await client.appSystem.findFirst({ where: { id: where.systemId, tenantId: where.tenantId, type: "POS", active: true }, select: { id: true } });
    if (!sys) return "NOT_FOUND";
    if (row.unitId !== null) {
      // AUDIT-CLASS X2 + E1: สาขาต้องผูก POS นี้ (unique tenant+unit+type ⇒ สาขาร้านอื่น/POS อื่น/ไม่ผูก POS/ไม่มีจริง = ไม่พบ) และไม่เก็บถาวร
      const link = await client.appSystemUnit.findUnique({
        where: { tenantId_unitId_type: { tenantId: where.tenantId, unitId: row.unitId, type: "POS" } },
        select: { systemId: true },
      });
      if (!link || link.systemId !== where.systemId) return "NOT_FOUND";
      const unit = await client.businessUnit.findFirst({ where: { id: row.unitId, tenantId: where.tenantId, status: { not: "ARCHIVED" } }, select: { id: true } });
      if (!unit) return "NOT_FOUND";
    }
    if (row.invItemId !== null) {
      // R5 F6 + AUDIT-CLASS X2: InvItem ของร้านนี้ (tenantId ในคำสั่ง) ในคลังที่ขายผ่าน POS นี้ — ทุกผู้กระทำ
      const inv = await client.invItem.findFirst({ where: { id: row.invItemId, tenantId: where.tenantId }, select: { systemId: true } });
      if (!inv || !(await inventorySystemsOfPos(where.tenantId, where.systemId, client)).includes(inv.systemId)) return "NOT_FOUND";
    }
    return rowWriteVerdict(actor, where, { unitId: row.unitId, invItemId: row.invItemId }, action, client);
  });
}

/**
 * ทางภายใน (ไม่ export): ตัวตัดสินจริงของ D1 — `actor === null` = ผู้เรียกระดับระบบ (มาจาก `actorOf` เมื่อเห็น CATALOG_SYSTEM_ACTOR เท่านั้น) = OK
 * ผู้เรียกภายในตรวจสาขาด้วย `assertUnit` มาก่อนแล้ว (สาขาของแถวเดิมที่ถูกเก็บถาวรไปภายหลังยังแก้/เก็บถาวรได้ตามเดิม)
 */
async function rowWriteVerdict(
  actor: MembershipCtx | null,
  where: { tenantId: string; systemId: string },
  row: CatalogRowScope,
  action: string,
  client: CatalogClient,
): Promise<CatalogWriteVerdict> {
  if (actor === null) return "OK";
  if (row.unitId !== null) {
    if (!canAccessUnit(actor, row.unitId)) return "NOT_FOUND";
    return evaluate(actor, { module: "pos", action, unitId: row.unitId }) ? "OK" : "PERMISSION_DENIED";
  }
  const links = await client.appSystemUnit.findMany({ where: { tenantId: where.tenantId, systemId: where.systemId, type: "POS" }, select: { unitId: true } });
  const live = links.length
    ? await client.businessUnit.findMany({ where: { tenantId: where.tenantId, id: { in: links.map((l) => l.unitId) }, status: { not: "ARCHIVED" } }, select: { id: true } })
    : [];
  let scope = live.map((u) => u.id);
  if (row.invItemId && scope.length) {
    const inv = await client.invItem.findFirst({ where: { id: row.invItemId, tenantId: where.tenantId }, select: { systemId: true } });
    const wh = await client.appSystemUnit.findMany({ where: { tenantId: where.tenantId, type: "INVENTORY", unitId: { in: scope } }, select: { unitId: true, systemId: true } });
    const serves = new Set(wh.filter((w) => !!inv && w.systemId === inv.systemId).map((w) => w.unitId));
    scope = scope.filter((u) => serves.has(u));
  }
  if (!scope.length) return isAllBranchActor(actor) && evaluate(actor, { module: "pos", action }) ? "OK" : "PERMISSION_DENIED";
  return scope.every((u) => evaluate(actor, { module: "pos", action, unitId: u })) ? "OK" : "PERMISSION_DENIED";
}

/** AUDIT-CLASS X3 + D1: บังคับผลของ rowWriteVerdict (โยน CatalogError) — ทางภายในเท่านั้น (actor null = ระบบ จาก actorOf) */
async function requireRowWrite(ctx: CatalogCtx, actor: MembershipCtx | null, row: CatalogRowScope, action: string, db: CatalogClient): Promise<void> {
  const v = await rowWriteVerdict(actor, ctx, row, action, db);
  if (v === "NOT_FOUND") throw notFound();
  if (v === "PERMISSION_DENIED") throw denied();
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

/**
 * C3: คลังที่สาขานี้ใช้ (ทางเดียวกับหน้าขาย resolvePosLinks → systemForUnit INVENTORY) · null = สาขาไม่มีคลัง
 * มติ R3 (a): ไม่กรองคลังที่ปิดใช้งาน — `systemForUnit` (system/service.ts:58-68) ไม่กรอง ⇒ ทางอ่านและทางเขียนใช้กติกาเดียวกับหน้าขายวันนี้
 */
async function unitInventory(tenantId: string, unitId: string, db: CatalogClient): Promise<string | null> {
  const l = await db.appSystemUnit.findUnique({ where: { tenantId_unitId_type: { tenantId, unitId, type: "INVENTORY" } }, select: { systemId: true } });
  return l?.systemId ?? null;
}

/**
 * สินค้าของระบบ POS ใน ctx — ไม่ใช่ = NOT_FOUND · ของสาขาที่ผู้กระทำเข้าไม่ได้ = NOT_FOUND
 * AUDIT-CLASS X6 + C11: `forUpdate` ล็อกแถว ก่อนอ่านค่าเดิม ⇒ ผู้เขียนพร้อมกันต่อคิว · audit before→after ต่อกันเป็นสาย
 * P1.1b G7: `FOR NO KEY UPDATE` (บทเรียน HF-INV-1 — FOR UPDATE ชนกับ FK insert) · ลำดับล็อกทั้งสองทิศ = ล็อกร้าน (ถ้าต้อง) → PosProduct → ตารางเดิม
 */
async function loadProduct(ctx: CatalogCtx, actor: MembershipCtx | null, id: unknown, db: CatalogClient, forUpdate = false): Promise<PosProduct> {
  if (typeof id !== "string" || !id) throw notFound();
  if (forUpdate) await db.$queryRaw`SELECT id FROM "PosProduct" WHERE id = ${id} AND "tenantId" = ${ctx.tenantId} AND "systemId" = ${ctx.systemId} FOR NO KEY UPDATE`;
  // AUDIT-CLASS X2: id + tenantId + systemId ในคำสั่งเดียว — productId ของร้านอื่น/ระบบอื่น = ไม่พบ
  const p = await db.posProduct.findFirst({ where: { id, tenantId: ctx.tenantId, systemId: ctx.systemId } });
  if (!p) throw notFound();
  if (actor && p.unitId && !canAccessUnit(actor, p.unitId)) throw notFound();
  return p;
}

/** ระบบคลังที่ "ขายผ่าน" ระบบ POS นี้ = คลังที่ผูกสาขา (ไม่เก็บถาวร) เดียวกับ POS นี้ — ชุดเดียวกับที่ unitInventory ของสาขาเหล่านั้นเห็น (มติ R3 a) */
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
 * AUDIT-CLASS X6: ล็อกระดับร้านของ "การสร้างแถวที่ผูก InvItem" (backfill · ensureForInvItem · createProduct ผูกคลัง/บาร์โค้ด)
 * pg_advisory_xact_lock หลุดเองตอน commit/rollback · ใช้กับ pooler โหมด transaction ได้
 */
async function lockTenant(tx: Prisma.TransactionClient, key: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`;
}

/**
 * R5 F3 — งบรอล็อกร้านของผู้เขียนที่รับคำขอ (ไม่ใช่ backfill): ลองด้วย `pg_try_advisory_xact_lock` ซ้ำแบบสุ่มหน่วง (40→400 ms ×0.5–1.5)
 * จนครบงบแล้ว `BUSY` — ไม่ปล่อยให้จบเป็น P2028/INTERNAL: เพดาน tx ของ client แอป = 30 วิ (core/db.ts · วัดแล้ว) · client เปล่าของ Prisma = 5 วิ
 * · ข้อสอบ S3.55 = < 7 วิ ⇒ 3.5 วิ (+ 1 round-trip) อยู่ใต้ทุกตัวพร้อมที่เหลือให้คำสั่งก่อน/หลัง
 */
const LOCK_BUDGET_MS = 3_500;
async function tryLockTenant(tx: Prisma.TransactionClient, tenantId: string): Promise<void> {
  const key = `pos-catalog:${tenantId}`;
  const start = Date.now();
  let step = 40;
  for (;;) {
    const r = await tx.$queryRaw<{ ok: boolean }[]>`SELECT pg_try_advisory_xact_lock(hashtext(${key})) AS ok`;
    if (r[0]?.ok === true) return;
    const left = LOCK_BUDGET_MS - (Date.now() - start);
    if (left <= 0) throw busy();
    await new Promise((res) => setTimeout(res, Math.max(1, Math.min(left, Math.round(step * (0.5 + Math.random()))))));
    step = Math.min(step * 2, 400);
  }
}

/**
 * P1.1b G7: ล็อกร้านแบบมีงบสำหรับซิงก์ของประตูเดิมที่ "สร้างลิงก์ InvItem ใหม่" (แถวเว็บร้านเองที่ผูก InvItem นอก POS แรก · C9b)
 * — ล็อกเดียวกับ createProduct/ensureForInvItem/backfill · ไม่ว่าง = BUSY (ลองใหม่ทั้งธุรกรรม) · ไม่ให้สิทธิ์อะไรเพิ่ม (แค่ต่อคิว)
 */
export async function tryLockCatalogTenant(tx: Prisma.TransactionClient, tenantId: string): Promise<void> {
  await tryLockTenant(tx, tenantId);
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
  /** ระบบคลัง → ระบบ POS ที่ขายของคลังนั้น (ผ่านสาขาไม่เก็บถาวรที่ผูกทั้งคู่ · คลังปิดใช้งานยังนับ — มติ R3 a) */
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
    client.appSystem.findMany({ where: { tenantId, type: "POS", active: true }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], select: { id: true, type: true } }),
  ]);
  const archivedIds = new Set(archived.map((u) => u.id));
  const activePos = new Set(systems.map((s) => s.id));
  const unitPos = new Map<string, string>();
  for (const l of links) if (l.type === "POS" && !archivedIds.has(l.unitId) && activePos.has(l.systemId)) unitPos.set(l.unitId, l.systemId);
  const inventoryPos = new Map<string, string[]>();
  for (const l of links) {
    if (l.type !== "INVENTORY" || archivedIds.has(l.unitId)) continue;
    const pos = unitPos.get(l.unitId);
    if (!pos) continue;
    const cur = inventoryPos.get(l.systemId) ?? [];
    if (!cur.includes(pos)) inventoryPos.set(l.systemId, [...cur, pos]);
  }
  return { tenantId, unitPos, inventoryPos, firstPos: systems[0]?.id ?? null };
}

/**
 * R2 — แถวเดิมนี้ "ขายอยู่ในระบบ POS ไหน" วันนี้ (ทางเดียวกับทางขายจริง ⇒ บรรทัดขายพรุ่งนี้ลงระบบที่ขายมันจริง)
 *   • InvItem    → หน้าขายแสดง InvItem ของ **ระบบคลังที่ผูกสาขาเดียวกับ POS** (`register/page.tsx:53-55` resolvePosLinks
 *                  → `register.ts:125-133` systemForUnit(INVENTORY) → `posCatalog` :137) · สาขาเก็บถาวรไม่นับ (`posUnits` register.ts:101-112 กรอง ARCHIVED :108)
 *                  ⇒ คลังนั้นผูก POS ได้ 1 ตัวพอดี = ระบบนั้น · 0 ตัว = NO_POS · >1 ตัว = AMBIGUOUS_POS (ไม่เดา)
 *   • MenuItem   → เช็คบิลร้านอาหารใช้ `systemForUnit(tenant, unitId, "POS")` (`restaurant/order.ts:421`) ⇒ POS ของสาขาเมนู · ไม่มี = NO_POS
 *   • ShopProduct→ ยืนยันรับเงินเว็บร้านใช้ `listSystems(tenant,"POS")[0]` (`shop/service.ts:217`) = POS ตัวแรกของร้าน ไม่ดูสาขา
 *                  (โค้ดชนะ · แก้ "POS ตัวแรก" เป็นงาน P2.1) ⇒ ร้านไม่มี POS เลย = NO_POS
 *   C12: สาขาเก็บถาวร + ระบบ POS ปิดใช้งาน ไม่นับทุกทาง (คลังปิดใช้งานยังนับ — มติ R3 a ตาม systemForUnit) · "POS ตัวแรก" = เปิดใช้งาน เรียง createdAt แล้ว id
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

// ═══════════════════ P1.1b G3 · ตัวแปลงเดียว "แถวเดิม → ช่องของ PosProduct" (backfill + ซิงก์ใช้ร่วม · ฟังก์ชันบริสุทธิ์ — มติ 8) ═══════════════════

/** InvItem ที่ตัวแปลงต้องรู้ */
export type InvLite = { id: string; systemId: string; name: string; kind: string; priceSatang: number; costSatang: number; archivedAt: Date | null; onHand: number; accountProductId: string | null; sortOrder: number };
export type { ApRow, BookInfo };
type MenuLite = {
  unitId: string; name: string; nameEn: string | null; basePrice: number; images: unknown; sortOrder: number; stationId: string;
  stockQty: number | null; dailyStockQty: number | null; isOutOfStock: boolean; archivedAt: Date | null; status: string; updatedAt: Date;
};
type ShopLite = { unitId: string; name: string; priceSatang: number; imageUrl: string | null; sortOrder: number; active: boolean };
type MenuCatLite = { unitId: string; name: string; nameEn: string | null; sortOrder: number; isVisible: boolean; availableFrom: string | null; availableTo: string | null; archivedAt: Date | null };

/** แถวของ InvItem (C7 ราคา · C8 VAT · ชนิดตาม InvItem · trackStock AUTO · เก็บถาวรตาม InvItem) — ใช้ใน backfill · ensureForInvItem · ซิงก์ */
export function invItemProductFields(inv: InvLite, ap: ApRow | null, book: BookInfo) {
  const price = initialPrice({ ap, inv });
  const kind: PosProductKind = inv.kind === "SERVICE" ? "SERVICE" : "PRODUCT";
  return {
    price,
    data: { invItemId: inv.id, kind, name: inv.name, basePriceSatang: price.price, vatRateBp: vatOf(ap, book), sortOrder: inv.sortOrder, trackStock: null, archivedAt: inv.archivedAt },
  };
}

/** แถวของเมนู (MENU · สาขาเมนู · ไม่ผูก InvItem ตรง · ราคา basePrice · สต็อกเมนูสำเนาตอนสร้างเท่านั้น — G8 ตัวนับสดไม่ mirror) */
export function menuItemProductFields(m: MenuLite, categoryId: string | null) {
  const price = initialPrice({ own: m.basePrice });
  return {
    price,
    data: {
      unitId: m.unitId, invItemId: null, kind: "MENU" as PosProductKind, name: m.name, nameEn: m.nameEn, categoryId, basePriceSatang: price.price,
      images: toStrings(m.images), sortOrder: m.sortOrder, trackStock: null, stationId: m.stationId, stockQty: m.stockQty, dailyStockQty: m.dailyStockQty,
      isOutOfStock: m.isOutOfStock, archivedAt: m.archivedAt ?? (m.status === "ARCHIVED" ? m.updatedAt : null),
    },
  };
}

/** แถวของเว็บร้านเอง (C9b/c/d) — ราคา C7 (AP ของ InvItem ที่ผูก ถ้ามี) → ราคาเว็บ · ปิดขาย = ปิดที่สาขานั้น (ไม่ใช่เก็บถาวร · มติ 5) */
export function shopProductFields(sp: ShopLite, inv: InvLite | null, ap: ApRow | null, book: BookInfo) {
  const price = initialPrice({ ap, inv, own: sp.priceSatang });
  return {
    price,
    data: {
      unitId: sp.unitId, invItemId: inv ? inv.id : null, kind: (inv?.kind === "SERVICE" ? "SERVICE" : "PRODUCT") as PosProductKind, name: sp.name,
      basePriceSatang: price.price, vatRateBp: vatOf(ap, book), images: sp.imageUrl ? [sp.imageUrl] : [], sortOrder: sp.sortOrder, trackStock: null,
      unavailableUnitIds: sp.active ? [] : [sp.unitId],
    },
  };
}

/** หมวดเมนู → PosCategory ของสาขานั้น (1 ต่อ 1 · กุญแจธรรมชาติ ระบบ+สาขา+ชื่อ) */
export function menuCategoryFields(mc: MenuCatLite) {
  return {
    unitId: mc.unitId, name: mc.name, nameEn: mc.nameEn, sortOrder: mc.sortOrder, isVisible: mc.isVisible,
    availableFrom: mc.availableFrom, availableTo: mc.availableTo, archivedAt: mc.archivedAt,
  };
}

// ═══════════════════ P1.1b · แหล่งเดิมของแถวแคตตาล็อก (อ่านล้วน — ใช้ทั้งทางย้อน G4b ใน catalog.ts และซิงก์ใน catalog-legacy.ts) ═══════════════════

/** แถวนี้มาจากอะไร: เมนู · InvItem ที่ขายผ่าน POS นี้ (แถวร่วม C9a) · เว็บร้านเอง (C9b/c/d) · แคตตาล็อกล้วน */
export type LegacySource =
  | { type: "menu"; menuItemId: string }
  | { type: "inv"; inv: InvLite; ap: ApRow | null; book: BookInfo }
  | { type: "shop"; shopIds: string[]; inv: InvLite | null; ap: ApRow | null; book: BookInfo }
  | { type: "native" };

const INV_LITE = { id: true, systemId: true, name: true, kind: true, priceSatang: true, costSatang: true, archivedAt: true, onHand: true, accountProductId: true, sortOrder: true } as const;
const AP_ROW = { id: true, systemId: true, salePrice: true, posPrice: true, posEnabled: true, vatRateBp: true, archivedAt: true } as const;

/** AccountProduct แบบลิ้นชัก (C7 strictAp) ของ InvItem ในสมุดที่ผูก POS นี้ */
export async function strictApOf(tenantId: string, inv: InvLite | null, book: BookInfo, db: CatalogClient): Promise<ApRow | null> {
  if (!inv?.accountProductId) return null;
  const rows = await db.accountProduct.findMany({ where: { tenantId, id: inv.accountProductId }, select: AP_ROW });
  return strictAp(inv, new Map(rows.map((a) => [a.id, a])), book);
}
export async function bookOfPosSystem(tenantId: string, posSystemId: string, db: CatalogClient): Promise<BookInfo> {
  return bookOfPos(tenantId, posSystemId, db);
}

/** จัดชนิดแถว (ทุกคำสั่งกรอง tenantId) — ตัวตัดสินเดียวของ "แถวนี้มีต้นฉบับเดิมที่ไหน" */
export async function legacySourceOf(row: { id: string; tenantId: string; systemId: string; kind: PosProductKind; invItemId: string | null }, db: CatalogClient): Promise<LegacySource> {
  const t = row.tenantId;
  if (row.kind === "MENU") {
    const m = await db.menuItem.findFirst({ where: { tenantId: t, posProductId: row.id }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], select: { id: true } });
    return m ? { type: "menu", menuItemId: m.id } : { type: "native" };
  }
  const inv = row.invItemId ? await db.invItem.findFirst({ where: { id: row.invItemId, tenantId: t }, select: INV_LITE }) : null;
  const sellsHere = !!inv && (await inventorySystemsOfPos(t, row.systemId, db)).includes(inv.systemId);
  const shops = sellsHere ? [] : await db.shopProduct.findMany({ where: { tenantId: t, posProductId: row.id }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], select: { id: true } });
  if (!sellsHere && !shops.length) return { type: "native" };
  const book = await bookOfPos(t, row.systemId, db);
  const ap = await strictApOf(t, inv, book, db);
  if (sellsHere && inv) return { type: "inv", inv, ap, book };
  return { type: "shop", shopIds: shops.map((s) => s.id), inv, ap, book };
}

/**
 * G4b + มติ 11 — ราคาจากแคตตาล็อกไปลงช่องเดิม "ช่องเดียว" = ช่องที่ชนะลำดับ C7 (ราคาที่ลิ้นชักคิด):
 *   MENU → MenuItem.basePrice · มี AP แบบลิ้นชัก (สินค้า หรือ AP ที่ราคาขาย/ราคา POS กำลังชนะ) → AccountProduct.salePrice ·
 *   บริการไม่มี AP ที่ชนะ → InvItem.priceSatang · แถวเว็บร้านเอง → ShopProduct.priceSatang · สินค้าไม่มี AP / แคตตาล็อกล้วน → PosProduct อย่างเดียว (X8.1)
 */
function priceTarget(src: LegacySource): "MenuItem" | "AccountProduct" | "InvItem" | "ShopProduct" | null {
  if (src.type === "menu") return "MenuItem";
  if (src.type === "native") return null;
  const ap = src.ap;
  const apWins = !!ap && ((legalPrice(ap.salePrice) && ap.salePrice > 0) || (ap.posEnabled && legalPrice(ap.posPrice) && ap.posPrice > 0));
  if (src.type === "inv") {
    if (ap && (apWins || src.inv.kind !== "SERVICE")) return "AccountProduct";
    return src.inv.kind === "SERVICE" ? "InvItem" : null;
  }
  if (ap && apWins) return "AccountProduct";
  return src.shopIds.length ? "ShopProduct" : null;
}

/** ทางย้อนของ setPrice — คำสั่งเดียวบนตารางเดิม (หลังล็อกแถว PosProduct แล้ว · ลำดับล็อก G7) */
async function writeBackPrice(tx: Prisma.TransactionClient, tenantId: string, src: LegacySource, price: number): Promise<void> {
  switch (priceTarget(src)) {
    case "MenuItem":
      if (src.type === "menu") await tx.menuItem.updateMany({ where: { id: src.menuItemId, tenantId }, data: { basePrice: price } });
      return;
    case "AccountProduct":
      if (src.type !== "native" && src.type !== "menu" && src.ap) await tx.accountProduct.updateMany({ where: { id: src.ap.id, tenantId }, data: { salePrice: price } });
      return;
    case "InvItem":
      if (src.type === "inv") await tx.invItem.updateMany({ where: { id: src.inv.id, tenantId }, data: { priceSatang: price } });
      return;
    case "ShopProduct":
      if (src.type === "shop") await tx.shopProduct.updateMany({ where: { id: { in: src.shopIds }, tenantId }, data: { priceSatang: price } });
      return;
    default:
      return;
  }
}

/** ทางย้อนของ updateProduct (ชื่อ) — เมนู: name/nameEn · InvItem: name (มติ 12) · เว็บร้าน: name · แคตตาล็อกล้วน: ไม่มี */
async function writeBackNames(tx: Prisma.TransactionClient, tenantId: string, src: LegacySource, names: { name?: string; nameEn?: string | null }): Promise<void> {
  if (src.type === "menu") {
    const data: { name?: string; nameEn?: string | null } = {};
    if (names.name !== undefined) data.name = names.name;
    if (names.nameEn !== undefined) data.nameEn = names.nameEn;
    if (Object.keys(data).length) await tx.menuItem.updateMany({ where: { id: src.menuItemId, tenantId }, data });
  } else if (src.type === "inv" && names.name !== undefined) await tx.invItem.updateMany({ where: { id: src.inv.id, tenantId }, data: { name: names.name } });
  else if (src.type === "shop" && names.name !== undefined && src.shopIds.length) await tx.shopProduct.updateMany({ where: { id: { in: src.shopIds }, tenantId }, data: { name: names.name } });
}

/** ทางย้อนของ archive/restore (G6 + มติ 4): เมนู = ARCHIVED+archivedAt / ACTIVE+null · เว็บร้าน = active · InvItem = แคตตาล็อกอย่างเดียว */
async function writeBackArchived(tx: Prisma.TransactionClient, tenantId: string, src: LegacySource, archivedAt: Date | null): Promise<void> {
  if (src.type === "menu")
    await tx.menuItem.updateMany({ where: { id: src.menuItemId, tenantId }, data: archivedAt ? { status: "ARCHIVED", archivedAt } : { status: "ACTIVE", archivedAt: null } });
  else if (src.type === "shop" && src.shopIds.length) await tx.shopProduct.updateMany({ where: { id: { in: src.shopIds }, tenantId }, data: { active: archivedAt === null } });
}

/**
 * G8 + มติ 3 — ความพร้อมขายสดของแถว MENU = MenuItem (86 มือ หรือ stockQty ≤ 0 · กติกาเดียวกับ orderingMenu) · คืน Set ของ productId ที่หมด
 * ผู้อ่านทุกตัว (listForUnit/byBarcode ผ่าน toViews · หน้าขายใหม่ registerCatalog) ใช้ฟังก์ชันนี้ — ไม่อ่าน PosProduct.isOutOfStock ของแถว MENU
 */
export async function menuSoldOutIds(tenantId: string, rows: { id: string; kind: PosProductKind }[], db: CatalogClient): Promise<Set<string>> {
  const ids = rows.filter((r) => r.kind === "MENU").map((r) => r.id);
  if (!ids.length) return new Set();
  const ms = await db.menuItem.findMany({ where: { tenantId, posProductId: { in: ids } }, select: { posProductId: true, isOutOfStock: true, stockQty: true } });
  return new Set(ms.filter((m) => m.isOutOfStock || (m.stockQty != null && m.stockQty <= 0)).map((m) => m.posProductId as string));
}
/** availability ของแถวที่สาขาหนึ่ง: ปิดขายรายสาขา · MENU = สดจาก MenuItem · อื่น ๆ = PosProduct.isOutOfStock (เดิม) */
export function rowAvailable(p: { id: string; kind: PosProductKind; unavailableUnitIds: string[] | null; isOutOfStock: boolean }, unitId: string, menuSoldOut: Set<string>): boolean {
  if ((p.unavailableUnitIds ?? []).includes(unitId)) return false;
  return p.kind === "MENU" ? !menuSoldOut.has(p.id) : !p.isOutOfStock;
}

// ═══════════════════ ตัวอ่าน: listForUnit · byBarcode ═══════════════════

type Cursor = { n: string; i: string };
const encodeCursor = (p: { name: string; id: string }) => Buffer.from(JSON.stringify({ n: p.name, i: p.id })).toString("base64url");
function decodeCursor(v: unknown): Cursor {
  if (typeof v !== "string" || !v) throw invalid("ตำแหน่งหน้าถัดไปไม่ถูกต้อง — โหลดรายการใหม่อีกครั้ง");
  try {
    const o: unknown = JSON.parse(Buffer.from(v, "base64url").toString("utf8"));
    // R5 F2: ค่าที่ถอดได้ไปถึง SQL — NUL / surrogate เดี่ยว (JSON `\u0000` · `\ud800`) = ไม่ถูกต้อง
    if (isRecord(o) && typeof o.n === "string" && typeof o.i === "string" && isCleanText(o.n) && isCleanText(o.i)) return { n: o.n, i: o.i };
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
async function toViews(tenantId: string, unitId: string, unitInv: string | null, rows: PosProduct[], db: CatalogClient): Promise<PosProductView[]> {
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const invIds = [...new Set(rows.map((r) => r.invItemId).filter((x): x is string => !!x))];
  const [items, links, recipes, menuSoldOut] = await Promise.all([
    invIds.length ? db.invItem.findMany({ where: { tenantId, id: { in: invIds } }, select: { id: true, onHand: true, barcode: true, sku: true } }) : Promise.resolve([]),
    db.posProductOptionGroup.findMany({ where: { tenantId, productId: { in: ids } }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] }),
    db.recipeLine.findMany({ where: { tenantId, productId: { in: ids } }, orderBy: [{ createdAt: "asc" }] }),
    // P1.1b มติ 3: แถว MENU อ่านความพร้อมขายสดจาก MenuItem (G8 — ตัวนับสดไม่ mirror)
    menuSoldOutIds(tenantId, rows, db),
  ]);
  const groupIds = [...new Set(links.map((l) => l.groupId))];
  const groups = groupIds.length
    ? await db.menuOptionGroup.findMany({
        where: { tenantId, id: { in: groupIds }, archivedAt: null },
        include: { choices: { where: { archivedAt: null }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] } },
      })
    : [];
  const itemById = new Map(items.map((i) => [i.id, i]));
  // D2: AUTO ต้องรู้ว่า "เคยเคลื่อนไหว" ไหม — ถามเฉพาะแถว AUTO ที่ onHand = 0 (≠ 0 ตอบได้เลย) · ทีละ InvItem ด้วย EXISTS … LIMIT 1
  //     กรองด้วยคลังของสาขานี้ — ไม่สแกนประวัติ movement ทั้งร้าน
  const needMove = rows
    .filter((r) => r.trackStock === null && r.kind === "PRODUCT" && !!r.invItemId && itemById.get(r.invItemId)?.onHand === 0)
    .map((r) => r.invItemId as string);
  const moved = needMove.length && unitInv
    ? await db.$queryRaw<{ id: string }[]>`SELECT i.id FROM "InvItem" i WHERE i.id = ANY(${needMove}::text[]) AND i."tenantId" = ${tenantId}
        AND EXISTS (SELECT 1 FROM "InvMovement" m WHERE m."itemId" = i.id AND m."tenantId" = ${tenantId} AND m."systemId" = ${unitInv} LIMIT 1)`
    : [];
  const movedSet = new Set(moved.map((m) => m.id));
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
      availability: { [unitId]: rowAvailable(p, unitId, menuSoldOut) },
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
  return boundary(async () => {
    // R5 F2: ctx · สาขา · q · cursor ที่มี NUL / UTF-16 ผิดรูป = VALIDATION ก่อนแตะ DB
    assertCleanInputs(ctx, unitId, isRecord(opts) ? [opts.q, opts.cursor] : null);
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
    // ตัด 100 ตัวอักษร (code unit) — ถ้าตัดกลางคู่ surrogate ให้ทิ้งครึ่งที่ค้าง (ไม่ส่ง UTF-16 ผิดรูปถึง SQL)
    let q = typeof o.q === "string" ? o.q.trim().slice(0, 100) : "";
    if (q && !isCleanText(q)) q = q.slice(0, -1);
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
    return { items: await toViews(ctx.tenantId, unit, unitInv, page, client), nextCursor };
  });
}

/**
 * C5: หาสินค้าด้วยบาร์โค้ดตรงตัว (ของแถวเอง หรือของ InvItem ที่ผูก) ที่ขายได้ที่สาขานี้ → `{items}` 0..n เรียงชื่อ+id (คงที่)
 * บาร์โค้ดซ้ำใน legacy เป็นเรื่องปกติ (InvItem.barcode ไม่ unique) — หน้าขายให้แคชเชียร์เลือก ไม่เดาตัวเก่าสุด
 */
export async function byBarcode(ctx: CatalogCtx, unitId: string, barcode: string, client: CatalogClient = prisma): Promise<{ items: PosProductView[] }> {
  return boundary(async () => {
    assertCleanInputs(ctx, unitId);
    await assertPosSystem(ctx, client);
    const actor = await actorOf(ctx, client);
    const unit = await assertUnit(ctx, actor, unitId, client);
    const code = typeof barcode === "string" ? barcode.trim() : "";
    // R5 F2: รหัสที่สแกนมาผิดรูป (NUL / UTF-16 ผิดรูป) = ไม่พบ — เครื่องสแกนสะดุดต้องไม่ทำให้หน้าขายล้ม
    if (!code || !isCleanText(code)) return { items: [] };
    const unitInv = await unitInventory(ctx.tenantId, unit, client);
    // D6: UNION สองทาง — บาร์โค้ดของแถวเอง (ใช้ index PosProduct(systemId, barcode)) ∪ บาร์โค้ดของ InvItem ที่ผูก
    //     (index บาร์โค้ดของ InvItem = หนี้ P6.1)
    const ids = await client.$queryRaw<{ id: string; name: string }[]>`
      SELECT p.id, p.name FROM "PosProduct" p
      WHERE p."systemId" = ${ctx.systemId} AND p.barcode = ${code} AND p."tenantId" = ${ctx.tenantId} AND p."archivedAt" IS NULL
        AND (p."unitId" IS NULL OR p."unitId" = ${unit}) AND ${warehouseCond(ctx.tenantId, unitInv)}
      UNION
      SELECT p.id, p.name FROM "InvItem" b JOIN "PosProduct" p ON p."invItemId" = b.id AND p."systemId" = ${ctx.systemId}
      WHERE b."tenantId" = ${ctx.tenantId} AND b.barcode = ${code} AND p."tenantId" = ${ctx.tenantId} AND p."archivedAt" IS NULL
        AND (p."unitId" IS NULL OR p."unitId" = ${unit}) AND ${warehouseCond(ctx.tenantId, unitInv)}
      ORDER BY name, id
      LIMIT ${PAGE_MAX}`;
    const rows = await rowsInOrder(ids.map((r) => r.id), ctx.tenantId, client);
    return { items: await toViews(ctx.tenantId, unit, unitInv, rows, client) };
  });
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

/** R5 F6: คีย์ที่ createProduct รับ (sku ไม่อยู่ — SKU เป็นของ InvItem · ส่งมา = คีย์แปลก VALIDATION) */
const CREATE_KEYS: ReadonlySet<string> = new Set(["name", "nameEn", "kind", "categoryId", "basePriceSatang", "vatRateBp", "barcode", "unitId", "invItemId", "trackStock"]);
const ownHas = (o: Record<string, unknown>, k: string) => Object.prototype.hasOwnProperty.call(o, k);

/**
 * เพิ่มสินค้าในแคตตาล็อก (สิทธิ์ pos.product.manage ตามขอบเขต D1) — kind ปริยาย PRODUCT (ผูก InvItem แล้วไม่ส่ง = ชนิดของ InvItem)
 * D6: สินค้าธรรมดา (ไม่ผูก InvItem · ไม่มีบาร์โค้ด) ไม่จับล็อกร้าน — ไม่ต้องรอ backfill ที่ถือล็อกอยู่
 * R5: F6 อ่านเฉพาะคีย์ของตัวเอง (คีย์แปลก/ไม่ใช่ออบเจกต์ = VALIDATION) · F3 ผูกคลัง/มีบาร์โค้ด = ล็อกร้านแบบมีงบ (ตัดสินจากข้อมูลเข้าล้วน) ไม่ว่าง = BUSY
 *     P1.1b G12: ล็อกหลังตรวจสิทธิ์ (การอ่านก่อนหน้าไม่ถือล็อกแถวใด ⇒ ระหว่างรอล็อกร้านยังไม่ถืออะไร) · F1 InvItem ที่มีแถวเก็บถาวรอยู่ = CONFLICT ที่บอกให้กู้คืน (ไม่มี id)
 */
export async function createProduct(ctx: CatalogCtx, input: CreateProductInput, client: CatalogClient = prisma): Promise<PosProduct> {
  return boundary(async () => {
    assertCleanInputs(ctx, input);
    assertCtxShape(ctx);
    const raw: Record<string, unknown> = isRecord(input) ? input : {};
    const wantsLock =
      (ownHas(raw, "invItemId") && raw.invItemId !== undefined && raw.invItemId !== null) || (ownHas(raw, "barcode") && typeof raw.barcode === "string" && raw.barcode.trim() !== "");
    return inTx(client, async (tx) => {
      // P1.1b G12: ตรวจคีย์ของตัวเอง (VALIDATION) ได้ก่อนตรวจสิทธิ์ · ล็อกร้านอยู่ "หลัง" ตรวจสิทธิ์ — ผู้ไม่มีสิทธิ์ไม่ต้องรอ/แย่งล็อก
      await assertPosSystem(ctx, tx);
      const actor = await actorOf(ctx, tx);
      const i = ownFields(input, CREATE_KEYS, "สินค้า", "มีช่องที่เพิ่มสินค้าผ่านทางนี้ไม่ได้ (เช่น SKU อยู่ที่สินค้าคลัง) — ยังไม่ได้บันทึกอะไร");
      const unitId = i.unitId === undefined || i.unitId === null ? null : await assertUnit(ctx, actor, i.unitId, tx);
      const wantInv = typeof i.invItemId === "string" && i.invItemId ? i.invItemId : null;
      await requireRowWrite(ctx, actor, { unitId, invItemId: wantInv }, PERM_MANAGE, tx);
      // AUDIT-CLASS X6 + R5 F3: แถวผูกคลัง/บาร์โค้ด ตรวจซ้ำ + เขียน ภายใต้ล็อกร้าน (unique ของ DB เป็นตาข่ายชั้นสุดท้าย → CONFLICT)
      if (wantsLock) await tryLockTenant(tx, ctx.tenantId);
      const name = cleanName(i.name, "ชื่อสินค้า");
      const nameEn = cleanOptional(i.nameEn, "ชื่อภาษาอังกฤษ");
      if (i.kind !== undefined && !PRODUCT_KINDS.includes(i.kind as PosProductKind)) throw invalid("ชนิดสินค้าไม่ถูกต้อง");
      const price = i.basePriceSatang === undefined || i.basePriceSatang === null ? null : i.basePriceSatang;
      if (price !== null && !isSatang(price)) throw invalid("ราคาต้องเป็นจำนวนเต็มสตางค์ไม่ติดลบ");
      const vatRateBp = cleanVat(i.vatRateBp);
      const barcode = cleanOptional(i.barcode, "บาร์โค้ด");
      const trackStock = i.trackStock === undefined ? null : cleanTrackStock(i.trackStock);
      const categoryId = await assertCategory(ctx, i.categoryId, unitId, tx);
      let kind: PosProductKind = (i.kind as PosProductKind | undefined) ?? "PRODUCT";
      let invItemId: string | null = null;
      if (i.invItemId !== undefined && i.invItemId !== null) {
        // C10: เมนู/ชุดไม่ผูก InvItem ตรง (ใช้ RecipeLine) · InvItem ต้องยังใช้งาน · ชนิดต้องตรง
        if (i.kind === "MENU" || i.kind === "BUNDLE") throw invalid("เมนู/ชุดสินค้าผูกสินค้าคลังตรงไม่ได้ — ใช้สูตร (ส่วนประกอบ) แทน");
        const inv = await loadSellableItem(ctx, i.invItemId, tx);
        if (inv.archivedAt) throw invalid("สินค้าคลังรายการนี้ถูกเก็บถาวรแล้ว");
        kind = (i.kind as PosProductKind | undefined) ?? (inv.kind === "SERVICE" ? "SERVICE" : "PRODUCT");
        if ((inv.kind === "SERVICE") !== (kind === "SERVICE")) throw invalid("ชนิดสินค้าไม่ตรงกับสินค้าคลัง (สินค้า ↔ บริการ)");
        // D6: แถวของสาขาต้องผูก InvItem ของคลังที่เสิร์ฟสาขานั้น — ไม่งั้นจะเป็นแถวที่มองไม่เห็นแต่ยึดช่อง unique (systemId, invItemId)
        if (unitId && (await unitInventory(ctx.tenantId, unitId, tx)) !== inv.systemId) throw invalid("สินค้าคลังรายการนี้ไม่ได้อยู่ในคลังของสาขาที่เลือก");
        const prior = await tx.posProduct.findFirst({ where: { tenantId: ctx.tenantId, systemId: ctx.systemId, invItemId: inv.id }, select: { archivedAt: true } });
        // R5 F1: แถวเดิมที่เก็บถาวร = บอกให้กู้คืน (ไม่ใส่ id — ผู้กระทำอาจมองไม่เห็นสาขาของแถวนั้น)
        if (prior)
          throw conflict(
            prior.archivedAt
              ? "สินค้าจากคลังรายการนี้มีในแคตตาล็อกขายแล้วแต่ถูกเก็บถาวรไว้ — กู้คืนรายการเดิมได้แทนการเพิ่มใหม่"
              : "สินค้าจากคลังรายการนี้อยู่ในแคตตาล็อกขายแล้ว",
          );
        invItemId = inv.id;
      }
      if (trackStock === true && !invItemId) throw invalid("ตัดสต็อกได้เฉพาะสินค้าที่ผูกสินค้าคลัง");
      if (trackStock === true && kind === "SERVICE") throw invalid("บริการไม่ตัดสต็อก");
      if (barcode) await assertBarcodeFree(ctx, barcode, invItemId, null, tx);
      const row = await tx.posProduct.create({
        data: { tenantId: ctx.tenantId, systemId: ctx.systemId, unitId, invItemId, kind, name, nameEn, categoryId, basePriceSatang: price as number | null, vatRateBp, barcode, trackStock },
      });
      await audit(tx, ctx, "pos.product.create", "PosProduct", row.id, null, {
        name, kind, unitId, invItemId, basePriceSatang: row.basePriceSatang, vatRateBp, barcode, categoryId, trackStock,
      });
      return row;
    });
  });
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
const PATCH_KEYS: ReadonlySet<string> = new Set(["name", "nameEn", "categoryId", "unitId", "trackStock", "availability"]);

/**
 * แก้ชื่อ/หมวด/สาขา/การตัดสต็อก/ความพร้อมขาย (สิทธิ์ pos.product.manage) — ราคาไปทาง setPrice
 * D1: สิทธิ์ตามขอบเขตของแถว (checkCatalogWrite) · ย้ายสาขา = ต้องมีสิทธิ์ทั้งขอบเขตเดิมและใหม่ (ไปสาขาที่เข้าไม่ได้ = NOT_FOUND) · หมวดต้องเข้ากับสาขาปลายทาง
 * R5 F6: อ่านเฉพาะคีย์ของตัวเอง (คีย์จาก prototype ไม่นับ) · patch ที่ไม่ใช่ออบเจกต์ (null/อาร์เรย์) = VALIDATION · F1 แถวเก็บถาวรแก้ได้ (กู้คืนแล้วพกค่าล่าสุด)
 */
export async function updateProduct(ctx: CatalogCtx, id: string, patch: UpdateProductPatch, client: CatalogClient = prisma): Promise<PosProduct> {
  return boundary(async () => {
    assertCleanInputs(ctx, id, patch);
    return inTx(client, async (tx) => {
      await assertPosSystem(ctx, tx);
      const actor = await actorOf(ctx, tx);
      const before = await loadProduct(ctx, actor, id, tx, true);
      await requireRowWrite(ctx, actor, before, PERM_MANAGE, tx);
      const p = ownFields(patch, PATCH_KEYS, "ที่แก้", "มีช่องที่แก้ผ่านทางนี้ไม่ได้ (ราคาใช้การตั้งราคา)");
      const data: Prisma.PosProductUncheckedUpdateManyInput = {};
      const changed: Record<string, unknown> = {};
      let unitId = before.unitId;
      if ("unitId" in p) {
        unitId = p.unitId === null ? null : await assertUnit(ctx, actor, p.unitId, tx);
        // D1: ย้ายสาขาต้องมีสิทธิ์ทั้งที่เดิม (ตรวจแล้วข้างบน) และที่ใหม่ (ขอบเขตของแถวหลังย้าย)
        await requireRowWrite(ctx, actor, { unitId, invItemId: before.invItemId }, PERM_MANAGE, tx);
        // D6: แถวผูก InvItem ย้ายไปสาขาที่คลังไม่ใช่คลังของ InvItem = แถวที่มองไม่เห็น ⇒ ปฏิเสธ
        if (unitId && before.invItemId) {
          const inv = await tx.invItem.findFirst({ where: { id: before.invItemId, tenantId: ctx.tenantId }, select: { systemId: true } });
          if (!inv || (await unitInventory(ctx.tenantId, unitId, tx)) !== inv.systemId) throw invalid("สินค้าคลังรายการนี้ไม่ได้อยู่ในคลังของสาขาที่เลือก");
        }
        data.unitId = changed.unitId = unitId;
      }
      if ("name" in p) data.name = changed.name = cleanName(p.name, "ชื่อสินค้า");
      if ("nameEn" in p) data.nameEn = changed.nameEn = cleanOptional(p.nameEn, "ชื่อภาษาอังกฤษ");
      if ("trackStock" in p) {
        const ts = cleanTrackStock(p.trackStock);
        if (ts === true && !before.invItemId) throw invalid("ตัดสต็อกได้เฉพาะสินค้าที่ผูกสินค้าคลัง");
        if (ts === true && before.kind === "SERVICE") throw invalid("บริการไม่ตัดสต็อก");
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
      // P1.1b G4b + มติ 12: ชื่อไปลงช่องเดิมของแถว (เมนู name/nameEn · InvItem name · เว็บร้าน name) ในธุรกรรมเดียว · ช่องอื่นไม่มีทางย้อน
      if ("name" in changed || "nameEn" in changed) {
        const names: { name?: string; nameEn?: string | null } = {};
        if ("name" in changed) names.name = changed.name as string;
        if ("nameEn" in changed) names.nameEn = changed.nameEn as string | null;
        await writeBackNames(tx, ctx.tenantId, await legacySourceOf(before, tx), names);
      }
      const prev: Record<string, unknown> = {};
      for (const k of Object.keys(changed)) prev[k] = k === "availability" ? before.unavailableUnitIds : (before as unknown as Record<string, unknown>)[k];
      await audit(tx, ctx, "pos.product.update", "PosProduct", before.id, prev, changed);
      return (await tx.posProduct.findFirst({ where: { id: before.id, tenantId: ctx.tenantId, systemId: ctx.systemId } })) ?? before;
    });
  });
}

/**
 * ตั้งราคาขาย (สตางค์ Int ≥ 0 · 0 = ฟรี) — สิทธิ์ pos.product.setPrice (+ ขอบเขตสาขา C4) · P1.1b: เขียนช่องเดิมที่ชนะลำดับราคาด้วย (writeBackPrice)
 * R5 F1: แถวเก็บถาวรตั้งราคาได้ (กู้คืนแล้วขายราคาปัจจุบัน — ตรึงใน S3.50)
 */
export async function setPrice(
  ctx: CatalogCtx,
  id: string,
  priceSatang: number,
  client: CatalogClient = prisma,
): Promise<{ id: string; basePriceSatang: number }> {
  return boundary(async () => {
    assertCleanInputs(ctx, id);
    return inTx(client, async (tx) => {
      await assertPosSystem(ctx, tx);
      const actor = await actorOf(ctx, tx);
      // AUDIT-CLASS X6 + C11: ล็อกแถวก่อนอ่านราคาเดิม ⇒ 2 เลนพร้อมกันได้ audit 100→200, 200→300 (ไม่ใช่ 100→200, 100→300)
      const before = await loadProduct(ctx, actor, id, tx, true);
      await requireRowWrite(ctx, actor, before, PERM_SET_PRICE, tx);
      // AUDIT-CLASS X4: จำนวนเต็มสตางค์เท่านั้น — ติดลบ/เศษสตางค์/NaN/สตริง = VALIDATION (ราคาเดิมไม่เปลี่ยน)
      if (!isSatang(priceSatang)) throw invalid("ราคาต้องเป็นจำนวนเต็มสตางค์ไม่ติดลบ");
      await tx.posProduct.updateMany({ where: { id: before.id, tenantId: ctx.tenantId, systemId: ctx.systemId }, data: { basePriceSatang: priceSatang } });
      // P1.1b G4b: ช่องเดิมช่องเดียวที่ชนะลำดับ C7 (มติ 11) — ธุรกรรมเดียว · ไม่สร้าง AccountProduct (X8.1) · ไม่เรียกประตูเดิม (G4c)
      await writeBackPrice(tx, ctx.tenantId, await legacySourceOf(before, tx), priceSatang);
      await audit(tx, ctx, "pos.product.price", "PosProduct", before.id, { basePriceSatang: before.basePriceSatang }, { basePriceSatang: priceSatang });
      return { id: before.id, basePriceSatang: priceSatang };
    });
  });
}

/** เก็บถาวร (soft · กดซ้ำได้ไม่ error) — สิทธิ์ pos.product.manage · C11 คืนเวลาที่เก็บจริงเสมอ (แม้แพ้การแข่ง) · กู้คืนด้วย `restore` (R5 F1) */
export async function archive(ctx: CatalogCtx, id: string, client: CatalogClient = prisma): Promise<{ id: string; archivedAt: Date }> {
  return boundary(async () => {
    assertCleanInputs(ctx, id);
    return inTx(client, async (tx) => {
      await assertPosSystem(ctx, tx);
      const actor = await actorOf(ctx, tx);
      const before = await loadProduct(ctx, actor, id, tx, true);
      await requireRowWrite(ctx, actor, before, PERM_MANAGE, tx);
      if (before.archivedAt) return { id: before.id, archivedAt: before.archivedAt };
      const r = await tx.posProduct.updateMany({ where: { id: before.id, tenantId: ctx.tenantId, systemId: ctx.systemId, archivedAt: null }, data: { archivedAt: new Date() } });
      const stored = await tx.posProduct.findFirst({ where: { id: before.id, tenantId: ctx.tenantId, systemId: ctx.systemId }, select: { archivedAt: true } });
      if (!stored?.archivedAt) throw notFound();
      // P1.1b G6 + มติ 4: เมนู → ARCHIVED · เว็บร้าน → active=false · แถว InvItem = แคตตาล็อกอย่างเดียว (ของยังอยู่ในคลัง)
      if (r.count === 1) await writeBackArchived(tx, ctx.tenantId, await legacySourceOf(before, tx), stored.archivedAt);
      if (r.count === 1) await audit(tx, ctx, "pos.product.archive", "PosProduct", before.id, { archivedAt: null }, { archivedAt: stored.archivedAt.toISOString() });
      return { id: before.id, archivedAt: stored.archivedAt };
    });
  });
}

/**
 * R5 F1 — กู้คืนแถวที่เก็บถาวร (ล้าง archivedAt) · ลายเซ็นแบบตัวเขียนอื่น `(ctx, id, client?)` — ผู้กระทำ = ctx.actorUserId (มติผู้คุมงาน)
 *   • สิทธิ์/ขอบเขตเดียวกับ archive (pos.product.manage · D1 requireRowWrite) · ร้านอื่น/ไม่มีจริง/สาขาที่เข้าไม่ได้ = NOT_FOUND
 *   • idempotent: แถวที่ไม่ได้เก็บถาวร (หรือกู้แล้ว) = OK `restored: false` ไม่มี audit · กู้จริง = audit `pos.product.restore`
 *     before `{ archivedAt: เวลาที่เก็บ }` → after `{ archivedAt: null }` ในธุรกรรมเดียวกัน
 *   • ชนกติกาไม่ซ้ำของชุดที่ขายอยู่ (บาร์โค้ดของแถวนี้มีแถวอื่นที่ขายอยู่/InvItem ในคลังของ POS นี้ใช้แล้ว) = CONFLICT — ไม่ใช่ P2002 ดิบ
 *     แถวมีบาร์โค้ด: ตรวจ+เขียนภายใต้ล็อกร้านแบบมีงบ (F3 · คู่กับ createProduct ที่มีบาร์โค้ด) — ล็อกร้านก่อนล็อกแถว ไม่ถือแถวระหว่างรอ
 *     (unique(systemId, invItemId) นับแถวเก็บถาวรด้วยอยู่แล้ว ⇒ กู้คืนไม่มีทางชนตัวนี้)
 *   • ไม่ตรวจว่า InvItem ยังขาย/ยังไม่เก็บถาวร — ตัวอ่านกรองคลังเอง (C3) · P1.1b: legacy sync เรียก restore เมื่อร้านปลดเก็บถาวร InvItem
 *     (`ensureForInvItem` ไม่ปลดเก็บถาวรเอง)
 */
export async function restore(ctx: CatalogCtx, id: string, client: CatalogClient = prisma): Promise<{ id: string; archivedAt: null; restored: boolean }> {
  return boundary(async () => {
    assertCleanInputs(ctx, id);
    return inTx(client, async (tx) => {
      await assertPosSystem(ctx, tx);
      const actor = await actorOf(ctx, tx);
      const peek = await loadProduct(ctx, actor, id, tx);
      await requireRowWrite(ctx, actor, peek, PERM_MANAGE, tx);
      if (!peek.archivedAt) return { id: peek.id, archivedAt: null, restored: false };
      let locked = false;
      if (peek.barcode) {
        await tryLockTenant(tx, ctx.tenantId);
        locked = true;
      }
      // AUDIT-CLASS X6 + C11: ล็อกแถวก่อนอ่านค่าเดิม ⇒ กดพร้อมกันได้ audit แถวเดียว
      const before = await loadProduct(ctx, actor, id, tx, true);
      // P1.1b G6 / N1: ตรวจสิทธิ์ซ้ำบนแถวที่ "ล็อกแล้ว" — แถวถูกย้ายขอบเขตระหว่างรอล็อก = ตัดสินจากค่าปัจจุบัน
      await requireRowWrite(ctx, actor, before, PERM_MANAGE, tx);
      if (!before.archivedAt) return { id: before.id, archivedAt: null, restored: false };
      if (before.barcode) {
        if (!locked) await tryLockTenant(tx, ctx.tenantId);
        await assertBarcodeFree(ctx, before.barcode, before.invItemId, before.id, tx);
      }
      const r = await tx.posProduct.updateMany({
        where: { id: before.id, tenantId: ctx.tenantId, systemId: ctx.systemId, archivedAt: { not: null } },
        data: { archivedAt: null },
      });
      if (r.count === 1) {
        await writeBackArchived(tx, ctx.tenantId, await legacySourceOf(before, tx), null);
        await audit(tx, ctx, "pos.product.restore", "PosProduct", before.id, { archivedAt: before.archivedAt.toISOString() }, { archivedAt: null });
      }
      return { id: before.id, archivedAt: null, restored: r.count === 1 };
    });
  });
}

/**
 * ให้แน่ใจว่า InvItem นี้มีแถว (ทุกสาขา) ในแคตตาล็อกของระบบ POS ใน ctx — สร้างครั้งเดียว · เรียกซ้ำได้ id เดิม
 * ราคา C7 · VAT C8 · trackStock = null (AUTO · C2) · ชื่อ/ชนิด/เก็บถาวร ตาม InvItem · สิทธิ์ตามขอบเขต D1 (สาขาที่คลังถือ InvItem นี้)
 * AUDIT-CLASS X1 + X6: ล็อกร้าน + INSERT … ON CONFLICT DO NOTHING บน unique(systemId, invItemId) ⇒ 10 เลนพร้อมกันได้แถวเดียว id เดียว
 * R5 F1: คืน `archived` ด้วย · ไม่ปลดเก็บถาวรเอง (ตั้งใจเก็บที่หน้าขายได้แม้ของยังอยู่ในคลัง — P1.1b เรียก `restore` เมื่อร้านปลดเก็บถาวร InvItem)
 * R5 F3: ทางลัดอ่านแถวที่มีแล้ว (คำสั่งเดียว · ไม่ล็อก) — ไม่มี = ล็อกร้านแบบมีงบก่อนตรวจอย่างอื่น ⇒ แถวที่มีแล้วไม่ BUSY ระหว่าง backfill
 */
export async function ensureForInvItem(ctx: CatalogCtx, invItemId: string, client: CatalogClient = prisma): Promise<{ id: string; created: boolean; archived: boolean }> {
  return boundary(async () => {
    assertCleanInputs(ctx, invItemId);
    assertCtxShape(ctx);
    return inTx(client, async (tx) => {
      const quick =
        typeof invItemId === "string" && invItemId
          ? await tx.posProduct.findFirst({ where: { tenantId: ctx.tenantId, systemId: ctx.systemId, invItemId }, select: { id: true } })
          : null;
      let locked = false;
      if (!quick) {
        await tryLockTenant(tx, ctx.tenantId);
        locked = true;
      }
      await assertPosSystem(ctx, tx);
      const actor = await actorOf(ctx, tx);
      await requireRowWrite(ctx, actor, { unitId: null, invItemId: typeof invItemId === "string" ? invItemId : null }, PERM_MANAGE, tx);
      const inv = await loadSellableItem(ctx, invItemId, tx);
      const existing = await tx.posProduct.findFirst({ where: { tenantId: ctx.tenantId, systemId: ctx.systemId, invItemId: inv.id }, select: { id: true, archivedAt: true } });
      if (existing) return { id: existing.id, created: false, archived: existing.archivedAt !== null };
      if (!locked) await tryLockTenant(tx, ctx.tenantId);
      const book = await bookOfPos(ctx.tenantId, ctx.systemId, tx);
      const apRows = inv.accountProductId
        ? await tx.accountProduct.findMany({
            where: { tenantId: ctx.tenantId, id: inv.accountProductId },
            select: { id: true, systemId: true, salePrice: true, posPrice: true, posEnabled: true, vatRateBp: true, archivedAt: true },
          })
        : [];
      const ap = strictAp(inv, new Map(apRows.map((a) => [a.id, a])), book);
      // P1.1b G3: ตัวแปลงเดียวกับ backfill (invItemProductFields)
      const { data } = invItemProductFields(inv, ap, book);
      const kind = data.kind;
      const r = await tx.posProduct.createMany({ data: [{ id: randomUUID(), tenantId: ctx.tenantId, systemId: ctx.systemId, ...data }], skipDuplicates: true });
      const row = await tx.posProduct.findFirst({
        where: { tenantId: ctx.tenantId, systemId: ctx.systemId, invItemId: inv.id },
        select: { id: true, basePriceSatang: true, archivedAt: true },
      });
      if (!row) throw notFound();
      if (r.count === 1) await audit(tx, ctx, "pos.product.create", "PosProduct", row.id, null, { invItemId: inv.id, kind, basePriceSatang: row.basePriceSatang, source: "ensureForInvItem" });
      return { id: row.id, created: r.count === 1, archived: row.archivedAt !== null };
    });
  });
}

/**
 * เพิ่มหมวด (ทุกสาขา หรือเฉพาะสาขา) — สิทธิ์ pos.product.manage ตามขอบเขต D1 (หมวดทุกสาขา = ทุกสาขาของ POS) · ไม่จับล็อกร้าน (D6)
 * ชื่อซ้ำในระบบ+สาขาเดียวกัน = CONFLICT (unique ของสาขา + M5 partial unique ของหมวดทุกสาขา — แข่งกันก็ได้ CONFLICT)
 */
const CATEGORY_KEYS: ReadonlySet<string> = new Set(["name", "nameEn", "unitId", "sortOrder"]);
export async function createCategory(
  ctx: CatalogCtx,
  input: { name: string; nameEn?: string | null; unitId?: string | null; sortOrder?: number },
  client: CatalogClient = prisma,
): Promise<{ id: string; name: string; unitId: string | null }> {
  return boundary(async () => {
    assertCleanInputs(ctx, input);
    return inTx(client, async (tx) => {
      await assertPosSystem(ctx, tx);
      const actor = await actorOf(ctx, tx);
      // P1.1b G12: อ่านเฉพาะคีย์ของตัวเอง (ownFields) — unitId จาก prototype ไม่ลงสาขา · คีย์แปลก/null/อาร์เรย์ = VALIDATION
      const i = ownFields(input, CATEGORY_KEYS, "หมวด", "มีช่องที่เพิ่มหมวดผ่านทางนี้ไม่ได้ — ยังไม่ได้บันทึกอะไร");
      const unitId = i.unitId === undefined || i.unitId === null ? null : await assertUnit(ctx, actor, i.unitId, tx);
      await requireRowWrite(ctx, actor, { unitId, invItemId: null }, PERM_MANAGE, tx);
      const name = cleanName(i.name, "ชื่อหมวด");
      const nameEn = cleanOptional(i.nameEn, "ชื่อหมวดภาษาอังกฤษ");
      const sortOrder = i.sortOrder === undefined || i.sortOrder === null ? 0 : i.sortOrder;
      if (typeof sortOrder !== "number" || !Number.isInteger(sortOrder) || Math.abs(sortOrder) > 1_000_000) throw invalid("ลำดับหมวดต้องเป็นจำนวนเต็ม");
      const dup = await tx.posCategory.findFirst({ where: { tenantId: ctx.tenantId, systemId: ctx.systemId, unitId, name }, select: { id: true } });
      if (dup) throw conflict("มีหมวดชื่อนี้อยู่แล้ว");
      const row = await tx.posCategory.create({ data: { tenantId: ctx.tenantId, systemId: ctx.systemId, unitId, name, nameEn, sortOrder } });
      await audit(tx, ctx, "pos.category.create", "PosCategory", row.id, null, { name, nameEn, unitId, sortOrder });
      return { id: row.id, name: row.name, unitId: row.unitId };
    });
  });
}

// ═══════════════════ backfill (ขั้น 1 ของ POS-MIGRATION-PLAN) ═══════════════════

/** ตัวนับที่ C7/C9/C13 สั่งให้รายงาน (นับจากแหล่งทุกแถวในขอบเขต — แถวใหม่และแถวที่ผูกไว้แล้ว) */
export type BackfillCounts = {
  soldAtCostToday: number;
  zeroPriceProduct: number;
  zeroPriceMenu: number;
  zeroPriceWeb: number;
  /** แถวราคา null ที่ราคาเดิมผิดรูป (ติดลบ ฯลฯ) — R4/E3: เป็นตัวนับใน partition ราคา null (แถวที่ได้ราคาจากขั้นอื่นไม่นับ) */
  invalidLegacyPrice: number;
  posPriceDiffersFromSalePrice: number;
  shopPriceDiffersFromCatalog: number;
  shopInactiveLinked: number;
  shopOwnRowInvItemOutsideFirstPos: number;
  shopDanglingInvItem: number;
  shopBranchNotInFirstPos: number;
  /** แถวจาก InvItem ที่ AUTO จะตัดสต็อกจริงตอนนี้ (มี movement หรือ onHand ≠ 0) — ให้เจ้าของเห็นก่อนเปิดใช้ (C2) */
  trackStockAutoOn: number;
  /** D3: AccountProduct ที่ลิ้นชักใช้คิด salePrice > 0 วันนี้ แต่ C7 ไม่นับ (เก็บถาวร/สมุดอื่น) ⇒ แคตตาล็อก "ยังไม่ตั้งราคา" */
  apIgnoredButTillPriced: number;
  /** D3: แถวราคา null ที่ไม่เข้าตัวนับราคา null ตัวอื่น (ไม่มีราคาจากแหล่งใด · ลิ้นชักวันนี้ก็คิด 0 หรือไม่ได้ขาย) */
  priceNotSetOther: number;
  /** D3: บริการที่ราคาในคลัง (InvItem.priceSatang) ≠ salePrice ของ AccountProduct (C7 ใช้ salePrice) */
  servicePriceDiffersFromAccountProduct: number;
  /** E3: แถวจาก InvItem ที่ราคาแคตตาล็อกไม่ว่าง และ ≠ ราคาที่ลิ้นชักคิดวันนี้ (`tillPriceToday`) — ตัวที่เจ้าของอ่านก่อนสลับลิ้นชักมาใช้แคตตาล็อก */
  catalogPriceDiffersFromTill: number;
};
type SampleRow = { id: string; name: string };
/** E3: ตัวอย่างของ catalogPriceDiffersFromTill — มีทั้งสองราคา (สตางค์) */
type PriceDiffSample = SampleRow & { catalogPriceSatang: number; tillPriceSatang: number };
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
  /**
   * ตัวอย่างต่อร้าน (≤20) — เจ้าของตั้งราคาจริงก่อนเปิดใช้ · priceNotSetOther: แถวที่มีร่องรอยราคาเดิม (AP/ราคาบริการ) ขึ้นก่อน
   * R4/E3: ตัวนับราคา null 4 ตัว (soldAtCostToday → apIgnoredButTillPriced → invalidLegacyPrice → priceNotSetOther) แบ่งแถวราคา null
   * แบบไม่ซ้อนกัน (ตัวแรกที่จริงชนะ) · catalogPriceDiffersFromTill มี catalogPriceSatang + tillPriceSatang
   */
  samples: {
    soldAtCostToday: Record<string, SampleRow[]>;
    apIgnoredButTillPriced: Record<string, SampleRow[]>;
    invalidLegacyPrice: Record<string, SampleRow[]>;
    priceNotSetOther: Record<string, SampleRow[]>;
    servicePriceDiffersFromAccountProduct: Record<string, SampleRow[]>;
    catalogPriceDiffersFromTill: Record<string, PriceDiffSample[]>;
  };
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
    apIgnoredButTillPriced: 0, priceNotSetOther: 0, servicePriceDiffersFromAccountProduct: 0, catalogPriceDiffersFromTill: 0,
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
    samples: { soldAtCostToday: {}, apIgnoredButTillPriced: {}, invalidLegacyPrice: {}, priceNotSetOther: {}, servicePriceDiffersFromAccountProduct: {}, catalogPriceDiffersFromTill: {} },
    created: { posProduct: 0, posCategory: 0, posProductOptionGroup: 0, recipeLine: 0, invItem: 0 },
    updated: { posProduct: 0, menuItem: 0, shopProduct: 0 },
    alreadyDone: { invItem: 0, menuItem: 0, shopProduct: 0 },
    failedTenants: [],
  };
}

/**
 * E3 — ราคาที่ลิ้นชัก (หน้าขายเดิม) คิดวันนี้ สำหรับ InvItem หนึ่งตัว · null = ลิ้นชักไม่ได้ขายมัน (InvItem เก็บถาวร — `listItems`/`listServices`
 * กรอง `archivedAt: null` · inventory/service.ts:793-807) · ทางเดียวกับ `register.ts`:
 *   • PRODUCT — `posCatalog` (register.ts:137-151): AP หาด้วย `InvItem.accountProductId` ในร้านเดียวกัน (:139-146 — ไม่กรองเก็บถาวร/สมุดบัญชี)
 *     แล้ว `sale && sale > 0 ? sale : Math.max(0, i.costSatang)` (:149) — ไม่อ่าน posPrice เลย
 *   • SERVICE — `posServices` (register.ts:163-176): `priceSatang: r.priceSatang` (:174) = InvItem.priceSatang ล้วน ไม่อ่าน AccountProduct
 *   ไม่จำลองเพดาน 200 รายการของหน้าขาย (`listItems(ctx, take = 200)`) — เป็นข้อจำกัดของหน้าจอ ไม่ใช่ราคา
 * `atCost` = ลิ้นชักคิดราคาทุนจริงวันนี้ (สินค้า · sale ≤ 0/ว่าง · ต้นทุน > 0) · `fromAp` = ราคามาจาก salePrice ของ AP
 */
type TillPrice = { price: number; atCost: boolean; fromAp: boolean };
function tillPriceToday(
  inv: { kind: string; priceSatang: number; costSatang: number; accountProductId: string | null; archivedAt: Date | null },
  apById: Map<string, { salePrice: number | null }>,
): TillPrice | null {
  if (inv.archivedAt) return null;
  if (inv.kind === "SERVICE") return { price: inv.priceSatang, atCost: false, fromAp: false };
  const sale = inv.accountProductId ? (apById.get(inv.accountProductId)?.salePrice ?? null) : null;
  if (sale !== null && sale > 0) return { price: sale, atCost: false, fromAp: true };
  return { price: Math.max(0, inv.costSatang), atCost: inv.costSatang > 0, fromAp: false };
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
    db.accountProduct.findMany({ where: { tenantId }, select: { id: true, systemId: true, invItemId: true, salePrice: true, posPrice: true, posEnabled: true, vatRateBp: true, archivedAt: true } }),
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
  // ตัวอย่าง ≤20 ต่อร้าน — priceNotSetOther เก็บผู้สมัครทั้งหมดก่อนแล้วจัดลำดับท้ายร้าน (มีร่องรอยราคาเดิมก่อน)
  const sample = (k: Exclude<keyof BackfillSummary["samples"], "priceNotSetOther" | "catalogPriceDiffersFromTill">, row: SampleRow) => {
    const arr = (s.samples[k][tenantId] ??= []);
    if (arr.length < 20) arr.push(row);
  };
  /** ราคาที่ผิดรูปของแหล่งเดิม (แถวราคา null) — ตัวนับใน partition ราคา null ลำดับที่ 3 */
  const invalidLegacy = (row: SampleRow) => {
    s.counts.invalidLegacyPrice++;
    sample("invalidLegacyPrice", row);
  };
  const notSet: { row: SampleRow; signal: boolean }[] = [];
  const apHalfLinked = new Set(aps.map((a) => a.invItemId).filter((x): x is string => !!x));

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
    // ตัวนับ (จากแหล่งทุกแถว) — ทุกการตัดสิน "ลิ้นชัก" ใช้ราคาที่ลิ้นชักคิดวันนี้จริง (E3 · `tillPriceToday`)
    const till = tillPriceToday(inv, apById);
    const tillAp = inv.accountProductId ? apById.get(inv.accountProductId) : undefined;
    const row = { id: inv.id, name: inv.name };
    if (pr.price === null) {
      // E3 partition ของแถวราคา null — แต่ละแถวเข้าตัวนับเดียวพอดี ตามลำดับตัดสิน (ตัวแรกที่จริงชนะ):
      //   1) soldAtCostToday        ลิ้นชักคิดราคาทุนจริงวันนี้ (สินค้า · sale ≤ 0/ว่าง · ต้นทุน > 0)
      //   2) apIgnoredButTillPriced ลิ้นชักคิด salePrice > 0 จาก AP ที่ C7 ไม่นับ (เก็บถาวร / สมุดบัญชีอื่น)
      //   3) invalidLegacyPrice     ราคาเดิมผิดรูป (ติดลบ ฯลฯ) ⇒ ไม่นับ
      //   4) priceNotSetOther       ที่เหลือ (ไม่มีราคาจากแหล่งใด — เช่น บริการราคา 0 ที่มี AP เก็บถาวร: ลิ้นชักบริการไม่อ่าน AP)
      if (till?.atCost) {
        s.counts.soldAtCostToday++;
        sample("soldAtCostToday", row);
      } else if (till?.fromAp) {
        s.counts.apIgnoredButTillPriced++;
        sample("apIgnoredButTillPriced", row);
      } else if (pr.invalidLegacy) invalidLegacy(row);
      else {
        s.counts.priceNotSetOther++;
        notSet.push({ row, signal: !!tillAp || apHalfLinked.has(inv.id) || (inv.kind === "SERVICE" && inv.priceSatang !== 0) });
      }
    } else if (till && pr.price !== till.price) {
      // E3: ราคาแคตตาล็อก ≠ ราคาที่ลิ้นชักคิดวันนี้ — เจ้าของเห็นก่อนสลับ (ลำดับราคาที่รับรองแล้วไม่เปลี่ยน)
      s.counts.catalogPriceDiffersFromTill++;
      const arr = (s.samples.catalogPriceDiffersFromTill[tenantId] ??= []);
      if (arr.length < 20) arr.push({ ...row, catalogPriceSatang: pr.price, tillPriceSatang: till.price });
    }
    if (inv.kind === "SERVICE" && legalPrice(inv.priceSatang) && inv.priceSatang > 0 && ap && legalPrice(ap.salePrice) && ap.salePrice > 0 && ap.salePrice !== inv.priceSatang) {
      s.counts.servicePriceDiffersFromAccountProduct++;
      sample("servicePriceDiffersFromAccountProduct", row);
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
    const id = randomUUID();
    // G3: ตัวแปลงเดียวกับซิงก์ของ P1.1b
    plan.products.push({ id, tenantId, systemId: r.systemId, ...invItemProductFields(inv, ap, bk).data });
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
      plan.categories.push({ id, tenantId, systemId: sys, ...menuCategoryFields(mc) });
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
    const conv = menuItemProductFields(m, catOfMenuCat.get(m.categoryId) ?? null);
    const pr = conv.price;
    // partition ราคา null (ลำดับเดียวกับขั้น 1 — เมนูไม่มีราคาลิ้นชักจาก InvItem ⇒ เหลือ 3) / 4))
    if (pr.price === null) {
      if (pr.invalidLegacy) invalidLegacy({ id: m.id, name: m.name });
      else (s.counts.priceNotSetOther++, notSet.push({ row: { id: m.id, name: m.name }, signal: false }));
    }
    if (pr.price === 0) s.counts.zeroPriceMenu++;
    if (m.posProductId && productIds.has(m.posProductId)) {
      s.alreadyDone.menuItem++;
      continue;
    }
    const id = randomUUID();
    plan.products.push({ id, tenantId, systemId: r.systemId, ...conv.data });
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
  // R5 F4: แถวแคตตาล็อกของเว็บร้านเองที่ถูกนับแล้ว (หลายแถวเว็บร้านชี้ InvItem เดียวกัน = แถวแคตตาล็อกเดียว · C9b) — นับครั้งเดียวต่อแถวแคตตาล็อก
  //   ใช้คีย์เดียวกับ byInvKey (ระบบ|InvItem) ⇒ รอบแรก (สร้างใหม่) และรอบซ้ำ (แถวมีอยู่แล้ว) นับเท่ากัน
  const ownRowCounted = new Set<string>();
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
    // R5 F4: แถวเว็บร้านที่ใช้แถวแคตตาล็อกของเว็บร้านแถวก่อนหน้าร่วม (C9b) = บันทึกลิงก์อย่างเดียว ไม่นับซ้ำ
    //   (ตัวนับ shopOwnRow/zeroPriceWeb/ราคา null นับ "แถวแคตตาล็อก" ⇒ Σ ตัวนับราคา null = จำนวนแถวราคา null ที่สร้าง แม้มีแถวร่วม)
    const ownKey = inv && !sharedIsInvRow ? `${r.systemId}|${inv.id}` : null;
    const ownCountedBefore = ownKey !== null && ownRowCounted.has(ownKey);
    if (ownKey !== null) ownRowCounted.add(ownKey);
    if (inv && shared && sharedIsInvRow) {
      // C9a — นับอย่างเดียว ไม่แก้แถวร่วม
      if (priceOfProduct.get(shared) !== sp.priceSatang) s.counts.shopPriceDiffersFromCatalog++;
      if (!sp.active) s.counts.shopInactiveLinked++;
    } else if (inv) {
      if (!ownCountedBefore) s.counts.shopOwnRowInvItemOutsideFirstPos++;
    } else if (sp.invItemId) s.counts.shopDanglingInvItem++;
    if (!(inv && shared && sharedIsInvRow) && !ownCountedBefore) {
      // แถวของเว็บร้านเอง (C9b/c/d): นับจากราคาสุดท้ายจริง — zeroPriceWeb เฉพาะเมื่อราคาสุดท้ายคือราคาเว็บ 0 (D6)
      const fin = initialPrice({ ap: inv ? strictAp(inv, apById, book(r.systemId)) : null, inv, own: sp.priceSatang });
      // partition ราคา null (แถวของเว็บร้านเอง — ไม่ใช่ราคาลิ้นชัก ⇒ เหลือ 3) / 4))
      if (fin.price === null) {
        if (fin.invalidLegacy) invalidLegacy({ id: sp.id, name: sp.name });
        else (s.counts.priceNotSetOther++, notSet.push({ row: { id: sp.id, name: sp.name }, signal: false }));
      }
      if (fin.rung === "own" && fin.price === 0) s.counts.zeroPriceWeb++;
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
    const id = randomUUID();
    // สินค้าเว็บที่ปิดขาย = ปิดขายที่สาขานั้น (ไม่ใช่เก็บถาวร — เปิดคืนได้) · G3 ตัวแปลงเดียว
    plan.products.push({ id, tenantId, systemId: r.systemId, ...shopProductFields(sp, inv, ap, bk).data });
    if (inv) byInvKey.set(`${r.systemId}|${inv.id}`, id);
    plan.shopLinks.push({ id: sp.id, productId: id });
  }
  // ตัวอย่าง priceNotSetOther: แถวที่มีร่องรอยราคาเดิม (AP ไม่ว่าทางไหน / ราคาบริการ) ก่อน — ตัดสินใจได้ก่อน · ที่เหลือเรียงเดิม
  s.samples.priceNotSetOther[tenantId] = [...notSet.filter((x) => x.signal), ...notSet.filter((x) => !x.signal)].slice(0, 20).map((x) => x.row);
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
  for (const k of Object.keys(from.samples) as (keyof BackfillSummary["samples"])[]) Object.assign(into.samples[k], from.samples[k]);
  into.skippedAmbiguousPos += from.skippedAmbiguousPos;
  for (const [sys, v] of Object.entries(from.perSystem)) {
    const cur = (into.perSystem[sys] ??= { invItem: 0, menuItem: 0, shopProduct: 0 });
    cur.invItem += v.invItem;
    cur.menuItem += v.menuItem;
    cur.shopProduct += v.shopProduct;
  }
}
