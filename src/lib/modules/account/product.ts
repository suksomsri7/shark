// Account — สินค้า/บริการ + หน่วย + กลุ่มจัดประเภท + เบิก/คืนสินค้า (§3.4)
// scope = feature: ทุกตาราง tenantId + systemId · เงิน Int สตางค์ · จำนวน (qty) Decimal
// เบิกสินค้า (GOODS_ISSUE/GOODS_ISSUE_RETURN):
//   • สินค้าที่ **ผูกคลัง** (invItemId != null · WO 4.1) → ตัด/คืนที่ `InvItem` ผ่านโมดูลคลัง
//     (`consumeInTx`/`receiveInTx` ใน tx เดียวกับเอกสาร ⇒ ล้ม = ไม่เหลือครึ่ง ๆ กลาง ๆ)
//     idempotencyKey = `acc-issue-<docLineId>` / `acc-return-<docLineId>` ⇒ อนุมัติซ้ำไม่ตัดเบิ้ล
//   • สินค้าที่ **ยังไม่ผูกคลัง** → ตัด/คืน `qtyOnHand` เหมือนเดิมทุกประการ (ไม่มี regression)
//   • WO 4.3: **ลงบัญชีตอนอนุมัติแล้ว** — Dr "ค่าใช้จ่ายที่ปรับปรุง" (§8.4) / Cr 1200 ด้วยต้นทุนจริงที่คลังคืนมา
//     ใบส่งคืนกลับด้าน · ใบปรับต้นทุน (CA) ลง JV กำไร/ขาดทุนจากการปรับมูลค่า
// เจ้าของไฟล์นี้ = subagent Products
import { prisma } from "@/lib/core/db";
import type {
  AccountDocType,
  AccountProductType,
  Prisma,
} from "@prisma/client";
// WO 1.1: reuse (read-only) ตัวช่วยกรอง/แบ่งหน้าเดียวกับฝั่งรายรับ/รายจ่าย — ไม่ก๊อปสูตรวันที่/พ้นกำหนดซ้ำ
import { overdueWhere, parseDay, clampPageSize, clampPage, type DocStatusFilter, type DocSort } from "./service";
// WO 4.1 — สินค้าที่ผูกคลัง: ความจริงเรื่องสต็อกอยู่ที่ InvItem (อ่าน/เขียนผ่านชั้นนี้เท่านั้น)
import { inventorySystemId, productStockMap, syncProductToItem } from "./inventory-link";
// chokepoint account→inventory (fitness F2 · WO 4.1) — ตัด/คืนสต็อกใน tx ของเอกสาร
import * as inventory from "@/lib/modules/inventory/service";
// WO 4.3 — ลงบัญชีเอกสารปรับปรุงสต็อก/ต้นทุน (Dr/Cr ระบุด้วยรหัสบัญชี · idempotent ต่อ (docId,event))
import * as gl from "./gl";
// WO 4.3 (§8.2) — ตัดสต็อกส่วนประกอบของ "รายการจัดชุด" (ตรรกะอยู่ bundle.ts · ที่นี่แค่ห่อ transaction ให้)
import { consumeBundleComponentsInTx, type BundleConsumeResult } from "./bundle";
import { clampSearch } from "./search-input";
import { isCodeUniqueConflict } from "./unique-conflict";

// ─────────────────── ค่าคงที่ ───────────────────

/** ชนิดเอกสารปรับปรุงสต็อก/ต้นทุน ที่ออกเลขรันจากที่นี่ */
export type StockDocType = "GOODS_ISSUE" | "GOODS_ISSUE_RETURN" | "COST_ADJUSTMENT";

// เลขรัน §8.4: PRR-YYYYMM#### · RPR-YYYYMM#### · CA-YYYYMM####
// (ก่อน WO 4.3 ใช้ GI-/GIR- รูปแบบ `PREFIX-YYYY-MM-####` — เอกสารเก่าคงเลขเดิมไว้ ไม่ย้อนแก้)
export const GOODS_PREFIX: Record<StockDocType, string> = {
  GOODS_ISSUE: "PRR",
  GOODS_ISSUE_RETURN: "RPR",
  COST_ADJUSTMENT: "CA",
};

export const STOCK_DOC_LABEL: Record<StockDocType, string> = {
  GOODS_ISSUE: "ใบเบิกสินค้า",
  GOODS_ISSUE_RETURN: "ใบส่งคืนเบิกสินค้า",
  COST_ADJUSTMENT: "ใบปรับต้นทุนสินค้า",
};

export const PRODUCT_TYPE_LABEL: Record<AccountProductType, string> = {
  GOODS: "สินค้า",
  SERVICE: "บริการ",
  BUNDLE: "รายการจัดชุด",
};

/** ชนิดสินค้าตามลำดับแท็บใน f6 */
export const PRODUCT_TYPES: AccountProductType[] = ["GOODS", "SERVICE", "BUNDLE"];

// จำนวนเป็นบาท (แสดง) — เงินสตางค์→บาท (คงรูปเดียวกับ service.ts baht())
export const baht = (satang: number) =>
  (satang / 100).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// จำนวน (Decimal) → string อ่านง่าย (ตัดศูนย์ท้าย)
export function qtyText(q: Prisma.Decimal | number | string): string {
  const n = Number(q);
  if (!Number.isFinite(n)) return "0";
  return n.toLocaleString("th-TH", { maximumFractionDigits: 4 });
}

// ─────────────────── หน่วย (AccountUnit) ───────────────────

export function listUnits(
  tenantId: string,
  systemId: string,
  opts?: { includeArchived?: boolean },
) {
  return prisma.accountUnit.findMany({
    where: { tenantId, systemId, ...(opts?.includeArchived ? {} : { archivedAt: null }) },
    orderBy: { name: "asc" },
  });
}

/** ชนิดหน่วย (§8.3) — PU = หน่วยของสินค้า · SU = หน่วยของบริการ/เวลา */
export type UnitKind = "PRODUCT" | "SERVICE";
export const UNIT_KIND_LABEL: Record<UnitKind, string> = { PRODUCT: "หน่วยสินค้า", SERVICE: "หน่วยบริการ" };
const UNIT_PREFIX: Record<UnitKind, string> = { PRODUCT: "PU", SERVICE: "SU" };

/** ชุดหน่วยเริ่มต้นตาม SPEC §8.3 (12 หน่วย · ลำดับตามสเปคเป๊ะ) */
export const UNIT_SEED: { name: string; nameEn: string; kind: UnitKind }[] = [
  { name: "ชิ้น", nameEn: "piece", kind: "PRODUCT" },
  { name: "กล่อง", nameEn: "box", kind: "PRODUCT" },
  { name: "แพ็ค", nameEn: "pack", kind: "PRODUCT" },
  { name: "โหล", nameEn: "dozen", kind: "PRODUCT" },
  { name: "ลัง", nameEn: "carton", kind: "PRODUCT" },
  { name: "ชุด", nameEn: "set", kind: "PRODUCT" },
  { name: "ครั้ง", nameEn: "time", kind: "SERVICE" },
  { name: "ชั่วโมง", nameEn: "hour", kind: "SERVICE" },
  { name: "วัน", nameEn: "day", kind: "SERVICE" },
  { name: "คน", nameEn: "person", kind: "SERVICE" },
  { name: "ทริป", nameEn: "trip", kind: "SERVICE" },
  { name: "คอร์ส", nameEn: "course", kind: "SERVICE" },
];

const UNIT_CODE_RE = /^(PU|SU)(\d{1,})$/;

/** เลขหน่วยถัดไปของชนิดนั้น ("PU07") — นับจากรหัสที่มีอยู่ (รวมที่ปิดใช้งาน เพื่อไม่ให้เลขซ้ำย้อนกลับ) */
export async function nextUnitCode(
  systemId: string,
  kind: UnitKind,
  db: Prisma.TransactionClient | typeof prisma = prisma,
): Promise<string> {
  const rows = await db.accountUnit.findMany({ where: { systemId, code: { not: null } }, select: { code: true } });
  let max = 0;
  for (const r of rows) {
    const m = UNIT_CODE_RE.exec((r.code ?? "").trim());
    if (!m || m[1] !== UNIT_PREFIX[kind]) continue;
    const n = Number(m[2]);
    if (Number.isSafeInteger(n) && n > max) max = n;
  }
  return `${UNIT_PREFIX[kind]}${String(max + 1).padStart(2, "0")}`;
}

/**
 * เติมหน่วยเริ่มต้น 12 หน่วยตาม §8.3 — **idempotent**: รันซ้ำไม่สร้างซ้ำ
 * หน่วยชื่อเดิมที่มีอยู่แล้ว (จาก seed เก่า/คลัง) แต่ยังไม่มีรหัส/ชื่ออังกฤษ → เติมให้ ไม่สร้างใหม่
 */
export async function seedUnits(
  tenantId: string,
  systemId: string,
): Promise<{ created: number; filled: number; total: number }> {
  let created = 0;
  let filled = 0;
  for (const u of UNIT_SEED) {
    const existing = await prisma.accountUnit.findFirst({ where: { systemId, name: u.name } });
    if (existing) {
      if (existing.code && existing.nameEn && existing.kind) continue;
      await prisma.accountUnit.update({
        where: { id: existing.id },
        data: {
          code: existing.code ?? (await nextUnitCode(systemId, u.kind)),
          nameEn: existing.nameEn ?? u.nameEn,
          kind: existing.kind ?? u.kind,
        },
      });
      filled += 1;
      continue;
    }
    const res = await createUnit(tenantId, systemId, u.name, { nameEn: u.nameEn, kind: u.kind });
    if (res.ok) created += 1;
  }
  const total = await prisma.accountUnit.count({ where: { systemId, archivedAt: null } });
  return { created, filled, total };
}

export async function createUnit(
  tenantId: string,
  systemId: string,
  name: string,
  opts?: { nameEn?: string | null; kind?: UnitKind | null; code?: string | null },
): Promise<{ ok: true; id: string } | { ok: false; reason: string }> {
  const n = name.trim();
  if (!n) return { ok: false, reason: "กรุณากรอกชื่อหน่วย" };
  if (n.length > 20) return { ok: false, reason: "ชื่อหน่วยยาวเกิน 20 ตัวอักษร" };
  const kind: UnitKind = opts?.kind ?? "PRODUCT";
  // ชนเลขกันตอนกดพร้อมกัน → ขอเลขใหม่แล้วลองซ้ำ (unique [systemId, code] เป็นตัวกันจริง)
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = (opts?.code ?? "").trim() || (await nextUnitCode(systemId, kind));
    try {
      const u = await prisma.accountUnit.create({
        data: { tenantId, systemId, name: n, nameEn: opts?.nameEn?.trim() || null, kind, code },
      });
      return { ok: true, id: u.id };
    } catch (e) {
      const blob = e instanceof Error ? e.message : String(e);
      if (/name/i.test(blob) && !/code/i.test(blob)) return { ok: false, reason: "มีหน่วยชื่อนี้อยู่แล้ว" };
      if (opts?.code) return { ok: false, reason: `รหัสหน่วย "${opts.code}" ซ้ำกับที่มีอยู่` };
      // ชนที่ code → วนขอเลขใหม่
    }
  }
  return { ok: false, reason: "ออกรหัสหน่วยไม่สำเร็จ กรุณาลองใหม่" };
}

export async function renameUnit(
  tenantId: string,
  systemId: string,
  id: string,
  name: string,
  opts?: { nameEn?: string | null; kind?: UnitKind | null; code?: string | null },
) {
  const n = name.trim();
  if (!n) return { ok: false as const, reason: "กรุณากรอกชื่อหน่วย" };
  if (n.length > 20) return { ok: false as const, reason: "ชื่อหน่วยยาวเกิน 20 ตัวอักษร" };
  const data: Prisma.AccountUnitUpdateManyMutationInput = { name: n };
  if (opts?.nameEn !== undefined) data.nameEn = opts.nameEn?.trim() || null;
  if (opts?.kind !== undefined && opts.kind) data.kind = opts.kind;
  if (opts?.code !== undefined) data.code = opts.code?.trim() || null;
  try {
    // WO 9.2 ข้อ 2 — เหตุผลเดียวกับ updateProduct: count 0 = ไม่ใช่ของสโคปนี้ ห้ามตอบ ok:true
    const res = await prisma.accountUnit.updateMany({ where: { id, tenantId, systemId }, data });
    if (res.count === 0) return { ok: false as const, reason: "ไม่พบหน่วยนับนี้" };
  } catch {
    return { ok: false as const, reason: "ชื่อ/รหัสหน่วยซ้ำกับที่มีอยู่" };
  }
  return { ok: true as const };
}

/** จำนวนสินค้าที่ใช้หน่วยแต่ละตัว (คอลัมน์ "ใช้กับสินค้า n" ของ §8.3) */
export async function unitUsageCount(systemId: string): Promise<Map<string, number>> {
  const rows = await prisma.accountProduct.groupBy({
    by: ["unitId"],
    where: { systemId, archivedAt: null, unitId: { not: null } },
    _count: { _all: true },
  });
  const out = new Map<string, number>();
  for (const r of rows) if (r.unitId) out.set(r.unitId, r._count._all);
  return out;
}

export async function archiveUnit(tenantId: string, systemId: string, id: string) {
  await prisma.accountUnit.updateMany({
    where: { id, tenantId, systemId },
    data: { archivedAt: new Date() },
  });
}

// ─────────────────── กลุ่มจัดประเภท (AccountCategory) ───────────────────

export function listCategories(
  tenantId: string,
  systemId: string,
  opts?: { includeArchived?: boolean },
) {
  return prisma.accountCategory.findMany({
    where: { tenantId, systemId, ...(opts?.includeArchived ? {} : { archivedAt: null }) },
    orderBy: { name: "asc" },
  });
}

export function categoryAppliesTo(appliesTo: unknown): AccountDocType[] {
  if (!Array.isArray(appliesTo)) return [];
  return appliesTo.filter((x): x is AccountDocType => typeof x === "string");
}

export async function createCategory(
  tenantId: string,
  systemId: string,
  input: { name: string; appliesTo?: AccountDocType[] },
): Promise<{ ok: true; id: string } | { ok: false; reason: string }> {
  const name = input.name.trim();
  if (!name) return { ok: false, reason: "กรุณากรอกชื่อกลุ่ม" };
  try {
    const c = await prisma.accountCategory.create({
      data: {
        tenantId,
        systemId,
        name,
        appliesTo: (input.appliesTo ?? []) as Prisma.InputJsonValue,
      },
    });
    return { ok: true, id: c.id };
  } catch {
    return { ok: false, reason: "มีกลุ่มชื่อนี้อยู่แล้ว" };
  }
}

export async function updateCategory(
  tenantId: string,
  systemId: string,
  id: string,
  input: { name?: string; appliesTo?: AccountDocType[] },
) {
  const data: Prisma.AccountCategoryUpdateManyMutationInput = {};
  if (input.name !== undefined) data.name = input.name.trim();
  if (input.appliesTo !== undefined) data.appliesTo = input.appliesTo as Prisma.InputJsonValue;
  await prisma.accountCategory.updateMany({ where: { id, tenantId, systemId }, data });
}

export async function archiveCategory(tenantId: string, systemId: string, id: string) {
  await prisma.accountCategory.updateMany({
    where: { id, tenantId, systemId },
    data: { archivedAt: new Date() },
  });
}

// ─────────────────── สินค้า/บริการ (AccountProduct) ───────────────────

export function listProducts(
  tenantId: string,
  systemId: string,
  opts?: { includeArchived?: boolean; type?: AccountProductType },
) {
  return prisma.accountProduct.findMany({
    where: {
      tenantId,
      systemId,
      ...(opts?.includeArchived ? {} : { archivedAt: null }),
      ...(opts?.type ? { type: opts.type } : {}),
    },
    orderBy: { createdAt: "desc" },
  });
}

export function getProduct(tenantId: string, systemId: string, id: string) {
  return prisma.accountProduct.findFirst({ where: { id, tenantId, systemId } });
}

/**
 * WO 4.1 — รายการสินค้าพร้อม "คงเหลือจริง" (`stock`)
 * ผูกคลัง → `InvItem.onHand` · ไม่ผูก → `qtyOnHand` ของตัวเอง
 * ⚠️ ทุกหน้าจอ/รายงานที่โชว์คงเหลือ ต้องใช้ตัวนี้ ห้ามอ่าน `qtyOnHand` ตรง ๆ อีก (มันเป็นแค่กระจก)
 */
export async function listProductsWithStock(
  tenantId: string,
  systemId: string,
  opts?: { includeArchived?: boolean; type?: AccountProductType },
) {
  const rows = await listProducts(tenantId, systemId, opts);
  const stock = await productStockMap({ tenantId, systemId }, rows);
  return rows.map((p) => ({ ...p, stock: stock.get(p.id) ?? Number(p.qtyOnHand) }));
}

// ─────────────────── เลขที่สินค้า P000xx / S000xx / B000xx (§8.2) ───────────────────

const PRODUCT_CODE_PREFIX: Record<AccountProductType, string> = { GOODS: "P", SERVICE: "S", BUNDLE: "B" };
const PRODUCT_CODE_RE = /^([PSB])(\d{1,})$/;

export function formatProductCode(type: AccountProductType, seq: number): string {
  return `${PRODUCT_CODE_PREFIX[type]}${String(seq).padStart(5, "0")}`;
}

/** "P00024" → 24 · รูปแบบอื่น (ผู้ใช้พิมพ์เอง เช่น "VIP-1") → null (ไม่นับในการหาเลขถัดไป) */
export function parseProductCodeSeq(code: string | null | undefined): number | null {
  const m = PRODUCT_CODE_RE.exec((code ?? "").trim());
  if (!m) return null;
  const n = Number(m[2]);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

/**
 * เลขที่สินค้าถัดไปของชนิดนั้น ("P00025")
 *
 * 🔴 ตัวนี้ **ไม่ใช่** ตัวกันเลขซ้ำ — ตัวกันจริงคือ partial unique index
 *    `AccountProduct_systemId_code_active_key` (migration 20260904190000)
 *    กดสร้างพร้อมกัน 2 คน = ได้เลขเดียวกันจากที่นี่ แล้วคนที่ช้ากว่าโดน P2002 → `createProduct` ขอเลขใหม่
 *    (บทเรียนเดียวกับ `nextContactCode` ของ WO 3.3 · reference_atomic_counter_single_statement)
 * นับเฉพาะ prefix ของชนิดนั้น (P/S/B แยกสายเลขกัน) และนับรวมแถวที่ปิดใช้งานแล้วด้วย
 */
export async function nextProductCode(systemId: string, type: AccountProductType): Promise<string> {
  const rows = await prisma.accountProduct.findMany({
    where: { systemId, type, code: { not: null } },
    select: { code: true },
  });
  let max = 0;
  for (const r of rows) {
    const c = (r.code ?? "").trim();
    if (!c.startsWith(PRODUCT_CODE_PREFIX[type])) continue;
    const n = parseProductCodeSeq(c);
    if (n !== null && n > max) max = n;
  }
  // ยังไม่เคยมีเลขเลย → เริ่มนับต่อจากจำนวนสินค้าชนิดนั้นที่มีอยู่ (ไม่ให้ชนกับเลขคำนวณสดของหน้ารายการ)
  if (max === 0) max = await prisma.accountProduct.count({ where: { systemId, type } });
  return formatProductCode(type, max + 1);
}

/** ชื่อ partial unique index ของ `code` (migration 20260904190000) — ใช้แยกว่าชนกันที่คอลัมน์ไหน */
const PRODUCT_CODE_INDEX = "AccountProduct_systemId_code_active_key";

/**
 * error ของ Prisma ที่แปลว่า "เลขที่สินค้าชนกัน" (ไม่ใช่ sku ชน)
 * 🔴 บทเรียน WO 3.3: Prisma 7 + adapter-pg **ไม่ส่ง `meta.target`** ⇒ ต้องอ่านจาก message + ชื่อ index ดิบ
 */
function isProductCodeConflict(e: unknown): boolean {
  // WO 9.2 ข้อ 13 — ตรรกะจริงย้ายไป unique-conflict.ts (ของเดิมค้น substring ในข้อความรวม
  // ซึ่งมีซอร์สโค้ดที่มีคำว่า `code` ปนอยู่ ⇒ SKU ซ้ำถูกอ่านเป็น "เลขที่ซ้ำ" — ดูเหตุผลเต็มในไฟล์นั้น)
  return isCodeUniqueConflict(e, PRODUCT_CODE_INDEX);
}

// ─────────────────── สร้าง/แก้ไขสินค้า ───────────────────

export type ProductInput = {
  sku?: string | null;
  name: string;
  nameEn?: string | null;
  type?: AccountProductType;
  unitId?: string | null;
  salePrice?: number | null; // สตางค์
  buyPrice?: number | null; // สตางค์
  vatRateBp?: number;
  incomeAccountId?: string | null;
  expenseAccountId?: string | null;
  imageUrl?: string | null;
  // ── WO 4.3 (§8.2) — ทุกช่องไม่บังคับ: ไม่ส่ง = ไม่แตะ/ค่าเริ่มต้นเดิม ──
  code?: string | null;
  barcode?: string | null;
  category?: string | null;
  description?: string | null;
  costMethod?: string | null; // "AVG" (FIFO 🕓 ยังไม่รองรับ)
  cogsAccountCode?: string | null;
  inventoryAccountCode?: string | null;
  purchaseVatRateBp?: number | null;
  defaultWhtType?: string | null;
  defaultWhtRateBp?: number | null;
  posEnabled?: boolean;
  posCategory?: string | null;
  posPrice?: number | null;
  bookingEnabled?: boolean;
  bookingDurationMin?: number | null;
  bookingDepositSatang?: number | null;
  imageUrls?: string[] | null;
};

/** ช่องที่ WO 4.3 เพิ่ม — แปลงจาก input เป็น data ของ Prisma (ไม่ส่ง = ไม่มีคีย์ ⇒ update ไม่แตะ) */
function productExtraFields(input: ProductInput): Record<string, unknown> {
  const d: Record<string, unknown> = {};
  if (input.barcode !== undefined) d.barcode = input.barcode?.trim() || null;
  if (input.category !== undefined) d.category = input.category?.trim() || null;
  if (input.description !== undefined) d.description = input.description?.trim().slice(0, 500) || null;
  if (input.costMethod !== undefined) d.costMethod = input.costMethod === "FIFO" ? "FIFO" : "AVG";
  if (input.cogsAccountCode !== undefined) d.cogsAccountCode = input.cogsAccountCode?.trim() || null;
  if (input.inventoryAccountCode !== undefined) d.inventoryAccountCode = input.inventoryAccountCode?.trim() || null;
  if (input.purchaseVatRateBp !== undefined) d.purchaseVatRateBp = input.purchaseVatRateBp ?? null;
  if (input.defaultWhtType !== undefined) d.defaultWhtType = input.defaultWhtType?.trim() || null;
  if (input.defaultWhtRateBp !== undefined) d.defaultWhtRateBp = input.defaultWhtRateBp ?? null;
  if (input.posEnabled !== undefined) d.posEnabled = input.posEnabled === true;
  if (input.posCategory !== undefined) d.posCategory = input.posCategory?.trim() || null;
  if (input.posPrice !== undefined) d.posPrice = input.posPrice ?? null;
  if (input.bookingEnabled !== undefined) d.bookingEnabled = input.bookingEnabled === true;
  if (input.bookingDurationMin !== undefined) d.bookingDurationMin = input.bookingDurationMin ?? null;
  if (input.bookingDepositSatang !== undefined) d.bookingDepositSatang = input.bookingDepositSatang ?? null;
  if (input.imageUrls !== undefined) {
    const urls = (input.imageUrls ?? []).map((u) => u.trim()).filter(Boolean).slice(0, 5);
    d.imageUrls = urls;
    d.imageUrl = urls[0] ?? (input.imageUrl?.trim() || null); // รูปแรก = ช่องเดิมที่หน้าจอเก่าอ่านอยู่
  }
  return d;
}

function validateProduct(input: ProductInput): string | null {
  const name = input.name.trim();
  if (!name) return "กรุณากรอกชื่อสินค้า/บริการ";
  if (name.length > 100) return "ชื่อสินค้ายาวเกิน 100 ตัวอักษร";
  if ((input.barcode ?? "").trim().length > 48) return "บาร์โค้ดยาวเกิน 48 ตัวอักษร";
  if (input.salePrice != null && input.salePrice < 0) return "ราคาขายติดลบไม่ได้";
  if (input.buyPrice != null && input.buyPrice < 0) return "ราคาซื้อติดลบไม่ได้";
  if (input.costMethod === "FIFO") return "วิธีคิดต้นทุนแบบ FIFO ยังไม่เปิดใช้งาน (คลัง SHARK ใช้ถัวเฉลี่ย)";
  return null;
}

// ─────────────────── WO 8.2 (§9.3) ชื่อสินค้าซ้ำ ───────────────────

export type ProductDuplicateHit = { id: string; code: string | null; name: string; reason: "name" | "sku" };

/**
 * หาสินค้าเดิมที่ "ชื่อ/รหัสสินค้า (SKU) ซ้ำ" — คู่ขนานกับ `checkContactDuplicates` ฝั่งผู้ติดต่อ
 * ดูเฉพาะที่ยังใช้งาน (archivedAt = null) — ของที่ปิดใช้งานแล้วไม่ควรขวางการสร้างใหม่
 * ไม่โยน exception (การเตือนไม่ใช่ความผิดพลาด) · SKU ซ้ำถูกกันด้วย unique index อยู่แล้ว
 * ที่นี่จึงคืนเป็น "คำเตือนก่อนบันทึก" เพื่อให้ผู้ใช้เห็นรายการเดิมและกดเปิดดูได้
 */
export async function checkProductDuplicates(
  tenantId: string,
  systemId: string,
  input: { name?: string | null; sku?: string | null; excludeId?: string | null },
): Promise<ProductDuplicateHit[]> {
  const name = (input.name ?? "").trim();
  const sku = (input.sku ?? "").trim();
  const or: Prisma.AccountProductWhereInput[] = [];
  if (name) or.push({ name: { equals: name, mode: "insensitive" } });
  if (sku) or.push({ sku: { equals: sku, mode: "insensitive" } });
  if (or.length === 0) return [];
  const rows = await prisma.accountProduct.findMany({
    where: {
      tenantId,
      systemId,
      archivedAt: null,
      ...(input.excludeId ? { id: { not: input.excludeId } } : {}),
      OR: or,
    },
    select: { id: true, code: true, name: true, sku: true },
    take: 20,
  });
  const hits: ProductDuplicateHit[] = [];
  for (const r of rows) {
    if (sku && (r.sku ?? "").trim().toLowerCase() === sku.toLowerCase()) hits.push({ id: r.id, code: r.code, name: r.name, reason: "sku" });
    else if (name && r.name.trim().toLowerCase() === name.toLowerCase()) hits.push({ id: r.id, code: r.code, name: r.name, reason: "name" });
  }
  return hits;
}

export async function createProduct(
  tenantId: string,
  systemId: string,
  input: ProductInput,
): Promise<{ ok: true; id: string; code: string | null } | { ok: false; reason: string }> {
  const bad = validateProduct(input);
  if (bad) return { ok: false, reason: bad };
  const name = input.name.trim();
  const type = input.type ?? "GOODS";
  const base = {
    tenantId,
    systemId,
    sku: input.sku?.trim() || null,
    name,
    nameEn: input.nameEn?.trim() || null,
    type,
    unitId: input.unitId || null,
    salePrice: input.salePrice ?? null,
    buyPrice: input.buyPrice ?? null,
    vatRateBp: input.vatRateBp ?? 700,
    incomeAccountId: input.incomeAccountId || null,
    expenseAccountId: input.expenseAccountId || null,
    imageUrl: input.imageUrl?.trim() || null,
    ...productExtraFields(input),
  };

  // เลขที่: ผู้ใช้กรอกเอง = ใช้ตามนั้น (ชน = บอกตรง ๆ) · ไม่กรอก = ออกให้ + วนขอใหม่เมื่อชนกับคนที่เร็วกว่า
  const manual = (input.code ?? "").trim();
  for (let attempt = 0; attempt < 6; attempt++) {
    const code = manual || (await nextProductCode(systemId, type));
    try {
      const p = await prisma.accountProduct.create({ data: { ...base, code } });
      return { ok: true, id: p.id, code };
    } catch (e) {
      if (isProductCodeConflict(e)) {
        if (manual) return { ok: false, reason: `เลขที่สินค้า "${manual}" ซ้ำกับรายการที่ใช้งานอยู่` };
        continue; // race — ขอเลขถัดไป (nextProductCode จะเห็นเลขของเขาแล้ว)
      }
      const err = e as { code?: string };
      if (err?.code === "P2002") return { ok: false, reason: "รหัสสินค้า (SKU) ซ้ำกับที่มีอยู่" };
      return { ok: false, reason: e instanceof Error ? e.message : "บันทึกสินค้าไม่สำเร็จ" };
    }
  }
  // ชนติดกัน 6 รอบ = ผิดปกติจริง — สร้างโดยไม่มีเลขที่ ดีกว่าทำงานผู้ใช้หาย (หน้ารายการถอยไปใช้ sku/เลขคำนวณสด)
  console.warn(`[account] ออกเลขที่สินค้าไม่สำเร็จหลัง 6 ครั้ง (system=${systemId})`);
  try {
    const p = await prisma.accountProduct.create({ data: base });
    return { ok: true, id: p.id, code: null };
  } catch (e) {
    // 🔴 WO 9.2 ข้อ 13 — ทางสำรองสุดท้ายก็ล้มได้ (เช่น SKU ซ้ำ) · ฟังก์ชันนี้ประกาศว่าคืน
    //    `{ok:false,reason}` เสมอ ⇒ ห้ามปล่อย error ดิบของ Prisma หลุดไปถึงผู้ใช้
    const err = e as { code?: string };
    if (err?.code === "P2002") return { ok: false, reason: "รหัสสินค้า (SKU) ซ้ำกับที่มีอยู่" };
    return { ok: false, reason: e instanceof Error ? e.message : "บันทึกสินค้าไม่สำเร็จ" };
  }
}

export async function updateProduct(
  tenantId: string,
  systemId: string,
  id: string,
  input: ProductInput,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const bad = validateProduct(input);
  if (bad) return { ok: false, reason: bad };
  const name = input.name.trim();
  const data: Record<string, unknown> = {
    sku: input.sku?.trim() || null,
    name,
    nameEn: input.nameEn?.trim() || null,
    type: input.type ?? "GOODS",
    unitId: input.unitId || null,
    salePrice: input.salePrice ?? null,
    buyPrice: input.buyPrice ?? null,
    vatRateBp: input.vatRateBp ?? 700,
    incomeAccountId: input.incomeAccountId || null,
    expenseAccountId: input.expenseAccountId || null,
    imageUrl: input.imageUrl?.trim() || null,
    ...productExtraFields(input),
  };
  if (input.code !== undefined) {
    const c = (input.code ?? "").trim();
    data.code = c || null;
  }
  try {
    // 🔴 WO 9.2 ข้อ 2 — `updateMany` ที่ไม่ตรงสโคปคืน count 0 **โดยไม่ error** ⇒ ของเดิมตอบ ok:true
    //    ทั้งที่ไม่ได้เขียนอะไรเลย (ข้อมูลไม่รั่ว แต่หน้าจอขึ้น "บันทึกแล้ว" ทั้งที่ไม่ได้บันทึก
    //    และข้อสอบ IDOR แยกไม่ออกว่าถูกกันจริงหรือแค่เงียบ) — ต้องรายงานว่าไม่พบ
    const res = await prisma.accountProduct.updateMany({ where: { id, tenantId, systemId }, data });
    if (res.count === 0) return { ok: false, reason: "ไม่พบสินค้า/บริการนี้" };
  } catch (e) {
    if (isProductCodeConflict(e)) return { ok: false, reason: "เลขที่สินค้าซ้ำกับรายการที่ใช้งานอยู่" };
    const err = e as { code?: string };
    if (err?.code === "P2002") return { ok: false, reason: "รหัสสินค้า (SKU) ซ้ำกับที่มีอยู่" };
    return { ok: false, reason: e instanceof Error ? e.message : "บันทึกสินค้าไม่สำเร็จ" };
  }
  // WO 4.1: ผูกคลังอยู่ → ดัน ชื่อ/sku/หน่วย ไปที่ item กลาง (ไม่ดันราคา/VAT/ผังบัญชี — เป็นฟิลด์บัญชี)
  //   ไม่ผูก / ไม่มีระบบคลัง = no-op เงียบ ๆ (§F.15)
  await syncProductToItem({ tenantId, systemId }, id);
  return { ok: true };
}

export async function archiveProduct(
  tenantId: string,
  systemId: string,
  id: string,
  archived = true,
) {
  await prisma.accountProduct.updateMany({
    where: { id, tenantId, systemId },
    data: { archivedAt: archived ? new Date() : null },
  });
}

// ─────────────────── บัญชี GL (สำหรับ dropdown override รายได้/ค่าใช้จ่าย) ───────────────────

// รายได้ = INCOME · ค่าใช้จ่าย/ต้นทุน = COGS/EXPENSE — ถ้ายังไม่ seed ผังบัญชี จะได้ []
export function listIncomeAccounts(tenantId: string, systemId: string) {
  return prisma.accountLedger.findMany({
    where: { tenantId, systemId, archivedAt: null, type: "INCOME" },
    orderBy: { code: "asc" },
    select: { id: true, code: true, name: true },
  });
}

export function listExpenseAccounts(tenantId: string, systemId: string) {
  return prisma.accountLedger.findMany({
    where: { tenantId, systemId, archivedAt: null, type: { in: ["COGS", "EXPENSE"] } },
    orderBy: { code: "asc" },
    select: { id: true, code: true, name: true },
  });
}

// ─────────────────── เลขรันเอกสารเบิก (จองใน tx เดียวกับ insert) ───────────────────

async function nextGoodsDocNo(
  tx: Prisma.TransactionClient,
  tenantId: string,
  systemId: string,
  docType: StockDocType,
  date: Date,
): Promise<string> {
  // งวดตามเวลาไทย (เครื่อง/CI อาจเป็น UTC — 30 ก.ย. 23:00 ไทย ต้องอยู่งวด 2026-09 ไม่ใช่ 2026-10)
  const ymd = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
  const year = ymd.slice(0, 4);
  const month = ymd.slice(5, 7);
  const periodKey = `${year}-${month}`;
  const prefix = GOODS_PREFIX[docType];
  const seq = await tx.accountDocSequence.upsert({
    where: { systemId_docType_periodKey: { systemId, docType, periodKey } },
    create: { tenantId, systemId, docType, prefix, periodKey, lastNo: 1 },
    update: { lastNo: { increment: 1 } },
  });
  // §8.4 / ภาพ g12: "PRR-202609-0004"
  return `${prefix}-${year}${month}-${String(seq.lastNo).padStart(4, "0")}`;
}

// ─────────────────── เบิก/คืนสินค้า (GOODS_ISSUE / GOODS_ISSUE_RETURN) ───────────────────

// ─────────────────── เอกสารปรับปรุงสต็อก: ใบเบิก PRR · ใบส่งคืน RPR · ใบปรับต้นทุน CA ───────────────────
// WO 4.3 (§8.4 · ภาพ g12) — ของที่เพิ่มจาก WO 4.1:
//   • ร่าง/อนุมัติ 2 ขั้น (ปุ่ม "บันทึกร่าง" / "อนุมัติใบเบิกสินค้า") — ร่างไม่แตะสต็อกและไม่ลงบัญชี
//   • **ลงบัญชีจริงตอนอนุมัติ**: Dr "ค่าใช้จ่ายที่ปรับปรุง" (บัญชีที่ผู้ใช้เลือก · ปริยาย 5300) / Cr 1200
//     ด้วย "ต้นทุนจริง" ที่คลังคืนมา (`InvMovement.costSatang`) ไม่ใช่ราคาขาย — ใบส่งคืนกลับด้าน
//   • คลังต่อบรรทัด · สาเหตุการเบิก · เก็บต้นทุนที่ตัดจริงไว้ที่ `line.unitCost` (ไว้พิมพ์/ตรวจย้อนหลัง)

/** สาเหตุการเบิก (§8.4 select) — เก็บเป็นข้อความไทยตรง ๆ ใน `AccountDocument.adjustReason` ไม่ใช่ enum ใน DB */
export const GOODS_ISSUE_REASONS = [
  "ใช้ในกิจการ",
  "ตัวอย่าง/แจก",
  "ชำรุด/สูญหาย",
  "โอนสาขา",
  "อื่น ๆ",
] as const;
export type GoodsIssueReason = (typeof GOODS_ISSUE_REASONS)[number];

/** เหตุผลการปรับต้นทุน (§8.4 ใบปรับต้นทุน CA) */
export const COST_ADJUST_REASONS = [
  "ต้นทุนซื้อเปลี่ยน",
  "ตีราคาสินค้าใหม่",
  "สินค้าเสื่อมสภาพ",
  "แก้ไขข้อมูลผิดพลาด",
  "อื่น ๆ",
] as const;

/** บัญชี Dr ปริยายของ "ค่าใช้จ่ายที่ปรับปรุง" (ใบเบิก) และบัญชีคู่ของใบปรับต้นทุน — ตรงกับ mapping key ใน coa.ts */
export const GOODS_ISSUE_DEFAULT_ACCOUNT = "5300";
export const COST_ADJUST_DEFAULT_ACCOUNT = "5310";
export const INVENTORY_ACCOUNT = "1200";

export type GoodsLineInput = {
  productId: string;
  qty: number; // จำนวนหน่วย (>0)
  description?: string | null;
  /** คลังที่ตัด/คืนของบรรทัดนี้ (InvLocation.id) — ไม่ส่ง = คลังปริยายของสินค้า (`AccountProduct.warehouseId`) */
  locationId?: string | null;
};

/**
 * WO 1.6 §5.2 J — จำนวนที่ยังคืนได้ต่อสินค้า ของใบเบิก (PRR) หนึ่งใบ = จำนวนที่เบิกไว้ − Σ ที่คืนไปแล้ว
 * (ใบส่งคืน RPR ก่อนหน้าที่อ้างอิง `sourceDocId` เดียวกัน) — ใช้ตรวจเพดานตอนสร้าง RPR ใหม่ (เพดานต่อบรรทัด/สินค้า)
 */
export async function returnableQtyForIssue(
  db: Prisma.TransactionClient | typeof prisma,
  tenantId: string,
  systemId: string,
  issueId: string,
): Promise<Map<string, number>> {
  const [issue, returns] = await Promise.all([
    db.accountDocument.findFirst({
      where: { id: issueId, tenantId, systemId, docType: "GOODS_ISSUE" },
      include: { lines: { select: { productId: true, qty: true } } },
    }),
    db.accountDocument.findMany({
      where: {
        tenantId,
        systemId,
        docType: "GOODS_ISSUE_RETURN",
        sourceDocId: issueId,
        // ร่างยังไม่คืนของจริง — ไม่นับกินเพดาน (WO 4.3: ใบส่งคืนมีสถานะร่างได้แล้ว)
        status: { notIn: ["DRAFT", "CANCELLED", "VOIDED"] },
      },
      include: { lines: { select: { productId: true, qty: true } } },
    }),
  ]);
  const issued = new Map<string, number>();
  for (const l of issue?.lines ?? []) {
    if (!l.productId) continue;
    issued.set(l.productId, (issued.get(l.productId) ?? 0) + Number(l.qty));
  }
  const returned = new Map<string, number>();
  for (const r of returns) {
    for (const l of r.lines) {
      if (!l.productId) continue;
      returned.set(l.productId, (returned.get(l.productId) ?? 0) + Number(l.qty));
    }
  }
  const out = new Map<string, number>();
  for (const [productId, qty] of issued) out.set(productId, Math.max(0, qty - (returned.get(productId) ?? 0)));
  return out;
}

/** เวอร์ชันไม่ต้องมี tx — ให้หน้า route (server component) เรียกแสดงเพดานต่อบรรทัดในขั้น ② ของ wizard RPR */
export function returnableQtyForIssueNow(tenantId: string, systemId: string, issueId: string): Promise<Map<string, number>> {
  return returnableQtyForIssue(prisma, tenantId, systemId, issueId);
}

/** ใบเบิก (PRR) 1 ใบพร้อมบรรทัด — สำหรับดึงมาแสดง/พรีฟิลในขั้น ② ของ wizard ใบส่งคืน (RPR) */
export function getGoodsIssueDoc(tenantId: string, systemId: string, id: string) {
  return prisma.accountDocument.findFirst({
    where: { id, tenantId, systemId, docType: "GOODS_ISSUE" },
    include: {
      contact: { select: { id: true, name: true } },
      lines: { orderBy: { sortOrder: "asc" }, include: { product: { select: { id: true, name: true, sku: true } } } },
    },
  });
}

/** เอกสารปรับปรุงสต็อก 1 ใบ (ทุกชนิด) พร้อมบรรทัด — ใช้ในหน้ารายละเอียด/แก้ร่าง */
export function getStockDoc(tenantId: string, systemId: string, id: string) {
  return prisma.accountDocument.findFirst({
    where: { id, tenantId, systemId, docType: { in: ["GOODS_ISSUE", "GOODS_ISSUE_RETURN", "COST_ADJUSTMENT"] } },
    include: {
      contact: { select: { id: true, name: true } },
      lines: {
        orderBy: { sortOrder: "asc" },
        include: { product: { select: { id: true, name: true, sku: true, code: true, unitId: true } } },
      },
    },
  });
}

// ── ชั้นใน: ตัด/คืนสต็อกของเอกสาร 1 ใบ (ต้องอยู่ใน tx ของผู้เรียกเสมอ) ──
// คืน "ต้นทุนรวม" ที่เดินจริง (สตางค์) เพื่อเอาไปลงบัญชี · เขียน `line.unitCost` ไว้ทุกบรรทัด
async function applyGoodsDocInTx(
  tx: Prisma.TransactionClient,
  input: {
    tenantId: string;
    systemId: string;
    docType: "GOODS_ISSUE" | "GOODS_ISSUE_RETURN";
    docId: string;
    docNo: string;
    allowNegative?: boolean;
    sourceDocId?: string | null;
  },
): Promise<{ costTotal: number }> {
  const { tenantId, systemId, docType } = input;
  const sign = docType === "GOODS_ISSUE" ? -1 : 1;
  const lines = await tx.accountDocumentLine.findMany({
    where: { documentId: input.docId, tenantId, systemId },
    orderBy: { sortOrder: "asc" },
    select: { id: true, productId: true, qty: true, unitName: true },
  });
  const ids = [...new Set(lines.map((l) => l.productId).filter(Boolean) as string[])];
  if (ids.length === 0) throw new Error("ต้องมีรายการสินค้าอย่างน้อย 1 รายการ");
  const products = await tx.accountProduct.findMany({ where: { id: { in: ids }, tenantId, systemId } });
  const byId = new Map(products.map((p) => [p.id, p]));
  for (const l of lines) {
    const p = l.productId ? byId.get(l.productId) : undefined;
    if (!p) throw new Error("ไม่พบสินค้าในรายการ");
    if (p.type === "SERVICE") throw new Error(`"${p.name}" เป็นบริการ — เบิกสต็อกไม่ได้`);
  }

  const deltaById = new Map<string, number>();
  for (const l of lines) deltaById.set(l.productId as string, (deltaById.get(l.productId as string) ?? 0) + Number(l.qty));

  // เพดานการคืน (RPR ที่อ้างอิง PRR)
  if (docType === "GOODS_ISSUE_RETURN" && input.sourceDocId) {
    const remaining = await returnableQtyForIssue(tx, tenantId, systemId, input.sourceDocId);
    for (const [productId, qty] of deltaById) {
      const left = remaining.get(productId) ?? 0;
      if (qty > left + 1e-9) {
        const name = byId.get(productId)?.name ?? productId;
        throw new Error(`คืน "${name}" เกินจำนวนที่เบิกไว้ (เบิก-คืนไปแล้วเหลือคืนได้ ${qtyText(left)})`);
      }
    }
  }

  // ── สินค้าที่ผูกคลัง → ความจริงอยู่ที่ InvItem ──
  const linked = products.filter((p) => p.invItemId);
  let invCtx: { tenantId: string; systemId: string } | null = null;
  const itemByProductId = new Map<string, { id: string; onHand: number; costSatang: number; kind: string; name: string }>();
  if (linked.length > 0) {
    const invSystemId = await inventorySystemId(tenantId);
    if (!invSystemId) throw new Error("สินค้าในใบนี้ผูกกับคลังสินค้าไว้ แต่ยังไม่พบระบบคลังสินค้าของกิจการ");
    invCtx = { tenantId, systemId: invSystemId };
    const items = await tx.invItem.findMany({
      where: { tenantId, systemId: invSystemId, id: { in: linked.map((p) => p.invItemId as string) } },
      select: { id: true, onHand: true, costSatang: true, kind: true, name: true },
    });
    const byItemId = new Map(items.map((i) => [i.id, i]));
    for (const p of linked) {
      const it = byItemId.get(p.invItemId as string);
      if (!it) throw new Error(`ไม่พบ "${p.name}" ในคลังสินค้า (ลิงก์เสีย) — เลิกผูกคลังก่อนจึงจะเบิกได้`);
      if (it.kind === "SERVICE") throw new Error(`"${p.name}" ในคลังเป็นบริการ — เบิกสต็อกไม่ได้`);
      itemByProductId.set(p.id, it);
    }
    if (sign < 0 && !input.allowNegative) {
      for (const [productId, qty] of deltaById) {
        const it = itemByProductId.get(productId);
        if (!it) continue;
        if (it.onHand - qty < 0)
          throw new Error(`สต็อก "${byId.get(productId)!.name}" ในคลังไม่พอ (คงเหลือ ${qtyText(it.onHand)}, เบิก ${qtyText(qty)})`);
      }
    }
  }

  // ── สินค้าที่ไม่ผูกคลัง: เดิน qtyOnHand ของตัวเอง (พฤติกรรมเดิม) ──
  let costTotal = 0;
  for (const [productId, qty] of deltaById) {
    if (itemByProductId.has(productId)) continue;
    const p = byId.get(productId)!;
    const current = Number(p.qtyOnHand);
    const nextQty = current + sign * qty;
    if (sign < 0 && !input.allowNegative && nextQty < 0)
      throw new Error(`สต็อก "${p.name}" ไม่พอ (คงเหลือ ${qtyText(current)}, เบิก ${qtyText(qty)})`);
    await tx.accountProduct.update({ where: { id: productId }, data: { qtyOnHand: nextQty } });
  }

  // ── เดินสต็อกจริงต่อบรรทัด + เก็บต้นทุนที่ใช้ลงบัญชี ──
  const balanceByItem = new Map<string, number>();
  for (const line of lines) {
    if (!line.productId) continue;
    const p = byId.get(line.productId)!;
    const qty = Number(line.qty);
    const it = itemByProductId.get(line.productId);
    let unitCost = 0;
    if (it && invCtx) {
      const common = {
        itemId: it.id,
        qty,
        sourceModule: "ACCOUNT",
        refType: "AccountDocument",
        refId: input.docId,
        note: input.docNo,
        locationId: p.warehouseId,
      };
      const mv =
        docType === "GOODS_ISSUE"
          ? await inventory.consumeInTx(tx, invCtx, { ...common, idempotencyKey: `acc-issue-${line.id}` })
          : await inventory.receiveInTx(tx, invCtx, {
              ...common,
              // คืนของเข้าคลังด้วย "ต้นทุนถัวเฉลี่ยปัจจุบัน" → ค่าเฉลี่ยไม่ขยับจากการคืนเบิก
              costSatang: it.costSatang,
              idempotencyKey: `acc-return-${line.id}`,
            });
      balanceByItem.set(it.id, mv.balanceAfter);
      unitCost = mv.costSatang;
    } else {
      // ไม่ผูกคลัง = ไม่มีต้นทุนถัวเฉลี่ยของจริง → ใช้ "ราคาซื้อ/หน่วย" ของสินค้าเป็นตัวแทน
      unitCost = p.buyPrice ?? 0;
    }
    costTotal += Math.round(unitCost * qty);
    await tx.accountDocumentLine.update({
      where: { id: line.id },
      data: { unitCost, amount: Math.round(unitCost * qty) },
    });
  }
  // กระจก (mirror) — ให้หน้าจอ/คิวรีเก่าที่ยังอ่าน qtyOnHand เห็นตัวเลขเดียวกับคลัง
  for (const [productId, it] of itemByProductId) {
    const after = balanceByItem.get(it.id);
    if (after === undefined) continue;
    await tx.accountProduct.update({ where: { id: productId }, data: { qtyOnHand: after } });
  }
  return { costTotal };
}

/** ลงบัญชีของเอกสารเบิก/ส่งคืน (เรียกใน tx เดียวกับเอกสาร) — ต้นทุน 0 = ไม่มีอะไรให้ลง */
async function postGoodsDocInTx(
  tx: Prisma.TransactionClient,
  input: {
    tenantId: string;
    systemId: string;
    docType: "GOODS_ISSUE" | "GOODS_ISSUE_RETURN";
    docId: string;
    docNo: string;
    issueDate: Date;
    adjustAccountCode: string | null;
    costTotal: number;
  },
): Promise<void> {
  const ctx = { tenantId: input.tenantId, systemId: input.systemId };
  const expenseCode = input.adjustAccountCode || null;
  if (input.docType === "GOODS_ISSUE") {
    // Dr ค่าใช้จ่ายที่ปรับปรุง / Cr สินค้าคงเหลือ
    await gl.postStockDocument(
      ctx,
      {
        docId: input.docId,
        event: "ISSUE",
        date: input.issueDate,
        amountSatang: input.costTotal,
        drCode: expenseCode,
        crCode: INVENTORY_ACCOUNT,
        drKey: "GOODS_ISSUE_EXPENSE",
        crKey: "INVENTORY",
        memo: `ใบเบิกสินค้า ${input.docNo}`,
      },
      tx,
    );
  } else {
    // ส่งคืน = กลับด้าน (Dr สินค้าคงเหลือ / Cr ค่าใช้จ่ายที่ปรับปรุง)
    await gl.postStockDocument(
      ctx,
      {
        docId: input.docId,
        event: "RETURN",
        date: input.issueDate,
        amountSatang: input.costTotal,
        drCode: INVENTORY_ACCOUNT,
        crCode: expenseCode,
        drKey: "INVENTORY",
        crKey: "GOODS_ISSUE_EXPENSE",
        memo: `ใบส่งคืนเบิกสินค้า ${input.docNo}`,
      },
      tx,
    );
  }
}

// สร้างเอกสารเบิก/คืน — ค่าเริ่มต้น = อนุมัติทันที (พฤติกรรมเดิมของ WO 4.1)
//   `asDraft: true` = บันทึกร่าง (ไม่มีเลขที่ · ไม่แตะสต็อก · ไม่ลงบัญชี) แล้วค่อย `approveGoodsMovement`
export async function createGoodsMovement(input: {
  tenantId: string;
  systemId: string;
  docType: "GOODS_ISSUE" | "GOODS_ISSUE_RETURN";
  issueDate?: Date;
  contactId?: string | null;
  categoryId?: string | null;
  note?: string | null;
  lines: GoodsLineInput[];
  allowNegative?: boolean; // GOODS_ISSUE: อนุญาตให้สต็อกติดลบ (default = กัน)
  createdById?: string | null;
  /** WO 1.6 §5.2 J — ใบเบิก (PRR) ที่ใบส่งคืนนี้อ้างอิง (เฉพาะ GOODS_ISSUE_RETURN จาก wizard) */
  sourceDocId?: string | null;
  /** WO 1.6/4.3 — สาเหตุการเบิก (§8.4 select) / เหตุผลการคืน */
  adjustReason?: string | null;
  /** WO 4.3 §8.4 — บัญชี Dr ของ "ค่าใช้จ่ายที่ปรับปรุง" (รหัส 6 หลัก · ไม่ระบุ = 5300) */
  adjustAccountCode?: string | null;
  /** WO 4.3 — อ้างอิงบนหัวเอกสาร (§8.4 "อ้างอิง ≤35") */
  reference?: string | null;
  /** WO 4.3 — บันทึกเป็นร่าง (ปุ่ม "บันทึกร่าง" ของ g12) */
  asDraft?: boolean;
  /** WO 4.3 — แท็กของเอกสาร (§8.4) */
  tags?: string[];
}): Promise<{ ok: true; id: string; docNo: string } | { ok: false; reason: string }> {
  const clean = input.lines
    .map((l) => ({
      productId: l.productId,
      qty: Number(l.qty),
      description: l.description ?? null,
      locationId: l.locationId ?? null,
    }))
    .filter((l) => l.productId && Number.isFinite(l.qty) && l.qty > 0);
  if (clean.length === 0) return { ok: false, reason: "ต้องมีรายการสินค้าอย่างน้อย 1 รายการ" };
  const issueDate = input.issueDate ?? new Date();
  const asDraft = input.asDraft === true;

  try {
    const res = await prisma.$transaction(async (tx) => {
      const ids = [...new Set(clean.map((l) => l.productId))];
      const products = await tx.accountProduct.findMany({
        where: { id: { in: ids }, tenantId: input.tenantId, systemId: input.systemId },
      });
      const byId = new Map(products.map((p) => [p.id, p]));
      for (const l of clean) {
        const p = byId.get(l.productId);
        if (!p) throw new Error("ไม่พบสินค้าในรายการ");
        if (p.type === "SERVICE") throw new Error(`"${p.name}" เป็นบริการ — เบิกสต็อกไม่ได้`);
      }

      const docNo = asDraft
        ? null
        : await nextGoodsDocNo(tx, input.tenantId, input.systemId, input.docType, issueDate);
      const doc = await tx.accountDocument.create({
        data: {
          tenantId: input.tenantId,
          systemId: input.systemId,
          docType: input.docType,
          docNo,
          status: asDraft ? "DRAFT" : "ISSUED",
          direction: "INTERNAL",
          issueDate,
          reference: input.reference?.trim() || null,
          contactId: input.contactId || null,
          categoryId: input.categoryId || null,
          note: input.note?.trim() || null,
          createdById: input.createdById ?? null,
          sourceDocId: input.sourceDocId ?? null,
          adjustReason: input.adjustReason ?? null,
          adjustAccountCode: input.adjustAccountCode?.trim() || null,
          tags: input.tags ?? [],
          lines: {
            create: clean.map((l, i) => ({
              tenantId: input.tenantId,
              systemId: input.systemId,
              sortOrder: i,
              description: l.description || byId.get(l.productId)!.name,
              qty: l.qty,
              unitName: null,
              unitPrice: 0, // มูลค่าของใบเบิก = ต้นทุน ไม่ใช่ราคาขาย (เขียนที่ unitCost ตอนอนุมัติ)
              discount: 0,
              vatRateBp: 0,
              amount: 0,
              productId: l.productId,
            })),
          },
        },
        select: { id: true },
      });

      if (!asDraft) {
        const { costTotal } = await applyGoodsDocInTx(tx, {
          tenantId: input.tenantId,
          systemId: input.systemId,
          docType: input.docType,
          docId: doc.id,
          docNo: docNo as string,
          allowNegative: input.allowNegative,
          sourceDocId: input.sourceDocId ?? null,
        });
        await tx.accountDocument.update({
          where: { id: doc.id },
          data: { subTotal: costTotal, grandTotal: costTotal },
        });
        await postGoodsDocInTx(tx, {
          tenantId: input.tenantId,
          systemId: input.systemId,
          docType: input.docType,
          docId: doc.id,
          docNo: docNo as string,
          issueDate,
          adjustAccountCode: input.adjustAccountCode?.trim() || null,
          costTotal,
        });
      }

      if (input.docType === "GOODS_ISSUE_RETURN" && input.sourceDocId) {
        await tx.accountDocumentRelation.create({
          data: {
            tenantId: input.tenantId,
            systemId: input.systemId,
            fromId: input.sourceDocId,
            toId: doc.id,
            type: "ADJUST",
          },
        });
      }
      return { id: doc.id, docNo: docNo ?? "" };
    });
    return { ok: true, ...res };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : "บันทึกเอกสารเบิกไม่สำเร็จ" };
  }
}

/** อนุมัติใบเบิก/ใบส่งคืนที่เป็นร่าง — ออกเลขที่ + ตัด/คืนสต็อก + ลงบัญชี ใน tx เดียว */
export async function approveGoodsMovement(
  tenantId: string,
  systemId: string,
  id: string,
  opts?: { allowNegative?: boolean },
): Promise<{ ok: true; docNo: string } | { ok: false; reason: string }> {
  try {
    const docNo = await prisma.$transaction(async (tx) => {
      const doc = await tx.accountDocument.findFirst({
        where: { id, tenantId, systemId, docType: { in: ["GOODS_ISSUE", "GOODS_ISSUE_RETURN"] } },
        select: { id: true, docType: true, status: true, issueDate: true, adjustAccountCode: true, sourceDocId: true },
      });
      if (!doc) throw new Error("ไม่พบเอกสาร");
      if (doc.status !== "DRAFT") throw new Error("เอกสารนี้อนุมัติไปแล้ว");
      const docType = doc.docType as "GOODS_ISSUE" | "GOODS_ISSUE_RETURN";
      const no = await nextGoodsDocNo(tx, tenantId, systemId, docType, doc.issueDate);
      await tx.accountDocument.update({ where: { id }, data: { docNo: no, status: "ISSUED" } });
      const { costTotal } = await applyGoodsDocInTx(tx, {
        tenantId,
        systemId,
        docType,
        docId: id,
        docNo: no,
        allowNegative: opts?.allowNegative,
        sourceDocId: doc.sourceDocId,
      });
      await tx.accountDocument.update({ where: { id }, data: { subTotal: costTotal, grandTotal: costTotal } });
      await postGoodsDocInTx(tx, {
        tenantId,
        systemId,
        docType,
        docId: id,
        docNo: no,
        issueDate: doc.issueDate,
        adjustAccountCode: doc.adjustAccountCode,
        costTotal,
      });
      return no;
    });
    return { ok: true, docNo };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : "อนุมัติใบเบิกไม่สำเร็จ" };
  }
}

// ─────────────────── ใบปรับต้นทุนสินค้า (CA · §8.4) ───────────────────

/**
 * ใบปรับต้นทุน — เปลี่ยน "ต้นทุนต่อหน่วย" ของสินค้า แล้วลง JV กำไร/ขาดทุนจากการปรับมูลค่า
 *   มูลค่าที่กระทบ = (ต้นทุนใหม่ − ต้นทุนเดิม) × จำนวนคงเหลือ
 *   ต้นทุนเพิ่ม → Dr 1200 / Cr 5310 (กำไร)  ·  ต้นทุนลด → Dr 5310 / Cr 1200 (ขาดทุน)
 * สินค้าที่ผูกคลัง = เขียนต้นทุนที่ `InvItem.costSatang` ผ่านชั้นคลัง (ต้นฉบับ) แล้ว sync ลงมาที่ราคาซื้อ
 * สินค้าที่ไม่ผูกคลัง = เขียนที่ `AccountProduct.buyPrice` ของตัวเอง
 */
export async function createCostAdjustment(input: {
  tenantId: string;
  systemId: string;
  productId: string;
  newCostSatang: number;
  issueDate?: Date;
  reason?: string | null;
  adjustAccountCode?: string | null;
  note?: string | null;
  createdById?: string | null;
  asDraft?: boolean;
}): Promise<
  | { ok: true; id: string; docNo: string; oldCost: number; newCost: number; qty: number; delta: number }
  | { ok: false; reason: string }
> {
  const newCost = Math.round(Number(input.newCostSatang));
  if (!Number.isFinite(newCost) || newCost < 0) return { ok: false, reason: "ต้นทุนใหม่ต้องเป็นจำนวนเงินที่ไม่ติดลบ" };
  const issueDate = input.issueDate ?? new Date();
  const asDraft = input.asDraft === true;

  try {
    const out = await prisma.$transaction(async (tx) => {
      const p = await tx.accountProduct.findFirst({
        where: { id: input.productId, tenantId: input.tenantId, systemId: input.systemId },
      });
      if (!p) throw new Error("ไม่พบสินค้า");
      if (p.type === "SERVICE") throw new Error(`"${p.name}" เป็นบริการ — ไม่มีต้นทุนสต็อกให้ปรับ`);

      // ต้นทุนเดิม + จำนวนคงเหลือ: ผูกคลัง = ความจริงอยู่ที่ InvItem
      let oldCost = p.buyPrice ?? 0;
      let qty = Number(p.qtyOnHand);
      let invCtx: { tenantId: string; systemId: string } | null = null;
      if (p.invItemId) {
        const invSystemId = await inventorySystemId(input.tenantId);
        if (!invSystemId) throw new Error("สินค้านี้ผูกกับคลังสินค้าไว้ แต่ยังไม่พบระบบคลังสินค้าของกิจการ");
        invCtx = { tenantId: input.tenantId, systemId: invSystemId };
        const it = await tx.invItem.findFirst({
          where: { tenantId: input.tenantId, systemId: invSystemId, id: p.invItemId },
          select: { id: true, onHand: true, costSatang: true },
        });
        if (!it) throw new Error(`ไม่พบ "${p.name}" ในคลังสินค้า (ลิงก์เสีย)`);
        oldCost = it.costSatang;
        qty = it.onHand;
      }
      const delta = Math.round((newCost - oldCost) * qty);

      const docNo = asDraft ? null : await nextGoodsDocNo(tx, input.tenantId, input.systemId, "COST_ADJUSTMENT", issueDate);
      const doc = await tx.accountDocument.create({
        data: {
          tenantId: input.tenantId,
          systemId: input.systemId,
          docType: "COST_ADJUSTMENT",
          docNo,
          status: asDraft ? "DRAFT" : "ISSUED",
          direction: "INTERNAL",
          issueDate,
          note: input.note?.trim() || null,
          createdById: input.createdById ?? null,
          adjustReason: input.reason ?? null,
          adjustAccountCode: input.adjustAccountCode?.trim() || null,
          subTotal: Math.abs(delta),
          grandTotal: Math.abs(delta),
          lines: {
            create: [
              {
                tenantId: input.tenantId,
                systemId: input.systemId,
                sortOrder: 0,
                description: p.name,
                qty,
                unitPrice: newCost, // ต้นทุนใหม่
                unitCost: oldCost, // ต้นทุนเดิม
                discount: 0,
                vatRateBp: 0,
                amount: Math.abs(delta),
                productId: p.id,
              },
            ],
          },
        },
        select: { id: true },
      });

      if (!asDraft) {
        // เขียนต้นทุนใหม่ — ผูกคลัง = แก้ที่ต้นฉบับ (InvItem) แล้วสะท้อนลงราคาซื้อของสินค้าบัญชี
        if (invCtx && p.invItemId) {
          await tx.invItem.update({ where: { id: p.invItemId }, data: { costSatang: newCost } });
        }
        await tx.accountProduct.update({ where: { id: p.id }, data: { buyPrice: newCost } });

        if (delta !== 0) {
          const ctx = { tenantId: input.tenantId, systemId: input.systemId };
          const gainLossCode = input.adjustAccountCode?.trim() || null;
          await gl.postStockDocument(
            ctx,
            {
              docId: doc.id,
              event: "COST_ADJUST",
              date: issueDate,
              amountSatang: Math.abs(delta),
              // ต้นทุนเพิ่ม = สินค้าคงเหลือเพิ่ม (Dr 1200 / Cr กำไร) · ต้นทุนลด = กลับด้าน
              drCode: delta > 0 ? INVENTORY_ACCOUNT : gainLossCode,
              crCode: delta > 0 ? gainLossCode : INVENTORY_ACCOUNT,
              drKey: delta > 0 ? "INVENTORY" : "INVENTORY_ADJUST_GAINLOSS",
              crKey: delta > 0 ? "INVENTORY_ADJUST_GAINLOSS" : "INVENTORY",
              memo: `ใบปรับต้นทุนสินค้า ${docNo}`,
            },
            tx,
          );
        }
      }
      return { id: doc.id, docNo: docNo ?? "", oldCost, newCost, qty, delta };
    });
    return { ok: true, ...out };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : "บันทึกใบปรับต้นทุนไม่สำเร็จ" };
  }
}

// รายการเอกสารเบิก/คืนย้อนหลัง (ทั้งสองชนิด)
export function listGoodsMovements(
  tenantId: string,
  systemId: string,
  opts?: { take?: number },
) {
  return prisma.accountDocument.findMany({
    where: { tenantId, systemId, docType: { in: ["GOODS_ISSUE", "GOODS_ISSUE_RETURN"] } },
    orderBy: { issueDate: "desc" },
    take: opts?.take ?? 100,
    include: {
      contact: { select: { name: true } },
      lines: { orderBy: { sortOrder: "asc" }, include: { product: { select: { name: true } } } },
    },
  });
}

// ─── หน้ารายการใบเบิกสินค้า PRR แบบกรอง/เรียง/แบ่งหน้า ฝั่ง server (WO 1.1 — analogous listDocumentsPaged) ───
export type ListGoodsIssueInput = {
  /** WO 4.3: ครอบใบปรับต้นทุน (CA) ด้วย — โครงตาราง/ตัวกรองเหมือนกันทุกอย่าง */
  docType?: StockDocType;
  status?: DocStatusFilter;
  q?: string;
  contactId?: string;
  from?: Date | string;
  to?: Date | string;
  page?: number;
  pageSize?: number;
  sort?: DocSort;
  excludeOverdue?: boolean;
};

export type ListGoodsIssuePage = {
  rows: Prisma.AccountDocumentGetPayload<{
    include: { contact: { select: { id: true; name: true } }; lines: { select: { qty: true } } };
  }>[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
};

export async function listGoodsIssuePaged(
  tenantId: string,
  systemId: string,
  input: ListGoodsIssueInput,
): Promise<ListGoodsIssuePage> {
  const now = new Date();
  const pageSize = clampPageSize(input.pageSize);
  const page = clampPage(input.page);
  const q = clampSearch(input.q);
  const from = parseDay(input.from, false);
  const to = parseDay(input.to, true);
  const base: Prisma.AccountDocumentWhereInput = {
    tenantId,
    systemId,
    docType: input.docType ?? "GOODS_ISSUE",
    ...(input.contactId ? { contactId: input.contactId } : {}),
    ...(from || to ? { issueDate: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
    ...(q
      ? {
          OR: [
            { docNo: { contains: q, mode: "insensitive" as const } },
            { note: { contains: q, mode: "insensitive" as const } },
            { contact: { is: { name: { contains: q, mode: "insensitive" as const } } } },
          ],
        }
      : {}),
  };
  const status = input.status ?? "ALL";
  const statusWhere: Prisma.AccountDocumentWhereInput =
    status === "ALL"
      ? {}
      : status === "OVERDUE"
        ? overdueWhere(now)
        : Array.isArray(status)
          ? { status: { in: status } }
          : { status };
  const where: Prisma.AccountDocumentWhereInput = {
    AND: [base, statusWhere, ...(input.excludeOverdue ? [{ NOT: overdueWhere(now) }] : [])],
  };
  const [rows, total] = await Promise.all([
    prisma.accountDocument.findMany({
      where,
      include: { contact: { select: { id: true, name: true } }, lines: { select: { qty: true } } },
      orderBy: input.sort === "docNo" ? { docNo: "desc" } : { issueDate: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.accountDocument.count({ where }),
  ]);
  return { rows, total, page, pageSize, pageCount: Math.max(Math.ceil(total / pageSize), 1) };
}

// ความเคลื่อนไหวย้อนหลังต่อสินค้า (ledger การ์ดสต็อกอย่างง่าย)
export async function productMovements(
  tenantId: string,
  systemId: string,
  productId: string,
  opts?: { take?: number },
) {
  const lines = await prisma.accountDocumentLine.findMany({
    where: {
      tenantId,
      systemId,
      productId,
      document: { docType: { in: ["GOODS_ISSUE", "GOODS_ISSUE_RETURN"] } },
    },
    orderBy: { createdAt: "desc" },
    take: opts?.take ?? 100,
    include: { document: { select: { docNo: true, docType: true, issueDate: true, note: true } } },
  });
  return lines.map((l) => ({
    id: l.id,
    docNo: l.document.docNo,
    docType: l.document.docType,
    issueDate: l.document.issueDate,
    note: l.document.note,
    qty: Number(l.qty),
    delta: (l.document.docType === "GOODS_ISSUE" ? -1 : 1) * Number(l.qty),
  }));
}

/**
 * ค้นสินค้า/บริการสำหรับ lookup ในฟอร์มเอกสาร V2 (WO 1.3 · §5.2 C)
 * คืนชื่อหน่วยมาด้วย (AccountProduct.unitId ไม่ได้เป็น relation ⇒ ต้อง join มือ 1 query)
 */
export async function searchProductPickerRows(
  tenantId: string,
  systemId: string,
  q: string,
  take = 20,
): Promise<
  {
    id: string;
    name: string;
    sku: string | null;
    salePrice: number | null;
    buyPrice: number | null;
    unitName: string | null;
    vatRateBp: number;
    incomeAccountId: string | null;
    expenseAccountId: string | null;
  }[]
> {
  const term = clampSearch(q);
  const rows = await prisma.accountProduct.findMany({
    where: {
      tenantId,
      systemId,
      archivedAt: null,
      ...(term
        ? {
            OR: [
              { name: { contains: term, mode: "insensitive" as const } },
              { sku: { contains: term, mode: "insensitive" as const } },
            ],
          }
        : {}),
    },
    orderBy: [{ pinned: "desc" }, { name: "asc" }],
    take,
    select: {
      id: true,
      name: true,
      sku: true,
      salePrice: true,
      buyPrice: true,
      unitId: true,
      vatRateBp: true,
      incomeAccountId: true,
      expenseAccountId: true,
    },
  });
  const unitIds = [...new Set(rows.map((r) => r.unitId).filter((x): x is string => !!x))];
  const units = unitIds.length
    ? await prisma.accountUnit.findMany({
        where: { id: { in: unitIds }, tenantId, systemId },
        select: { id: true, name: true },
      })
    : [];
  const nameOf = new Map(units.map((u) => [u.id, u.name]));
  return rows.map(({ unitId, ...r }) => ({ ...r, unitName: unitId ? (nameOf.get(unitId) ?? null) : null }));
}

// ═══════════════════════════════════════════════════════════════════════════
// WO 4.3 — รายการจัดชุด · ยอดยกมา · คิวรีของหน้าสินค้า V2 (§8.1–8.2 · เฟรม f6/g8)
// ═══════════════════════════════════════════════════════════════════════════

// ─────────────────── รายการจัดชุด (AccountProductBundleItem · §8.2) ───────────────────

export type BundleComponentInput = { componentProductId: string; qty: number; unitId?: string | null };

export type BundleComponentRow = {
  id: string;
  componentProductId: string;
  qty: number;
  unitId: string | null;
  name: string;
  code: string | null;
  sku: string | null;
  type: AccountProductType;
  buyPrice: number | null;
  salePrice: number | null;
};

/** ส่วนประกอบของชุด 1 ตัว (เรียงตามลำดับที่ผู้ใช้จัดไว้) */
export async function listBundleItems(
  tenantId: string,
  systemId: string,
  bundleProductId: string,
): Promise<BundleComponentRow[]> {
  const rows = await prisma.accountProductBundleItem.findMany({
    where: { tenantId, systemId, bundleProductId },
    orderBy: { sortOrder: "asc" },
  });
  if (rows.length === 0) return [];
  const products = await prisma.accountProduct.findMany({
    where: { systemId, id: { in: rows.map((r) => r.componentProductId) } },
    select: { id: true, name: true, code: true, sku: true, type: true, buyPrice: true, salePrice: true },
  });
  const byId = new Map(products.map((p) => [p.id, p]));
  return rows.flatMap((r) => {
    const p = byId.get(r.componentProductId);
    if (!p) return [];
    return [
      {
        id: r.id,
        componentProductId: r.componentProductId,
        qty: Number(r.qty),
        unitId: r.unitId,
        name: p.name,
        code: p.code,
        sku: p.sku,
        type: p.type,
        buyPrice: p.buyPrice,
        salePrice: p.salePrice,
      },
    ];
  });
}

/** ส่วนประกอบของชุดหลายตัวพร้อมกัน (หน้ารายการ: นับจำนวนส่วนประกอบต่อชุด) */
export async function bundleItemCountMap(systemId: string, bundleIds: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (bundleIds.length === 0) return out;
  const rows = await prisma.accountProductBundleItem.groupBy({
    by: ["bundleProductId"],
    where: { systemId, bundleProductId: { in: bundleIds } },
    _count: { _all: true },
  });
  for (const r of rows) out.set(r.bundleProductId, r._count._all);
  return out;
}

/**
 * ตั้งสูตรของชุด (แทนที่ทั้งชุด) — ลบของเดิม + ใส่ชุดใหม่ใน tx เดียว
 * กติกา: ชุดต้องเป็นชนิด BUNDLE · ส่วนประกอบต้องอยู่ระบบเดียวกัน · ห้ามใส่ตัวเอง · ห้ามใส่ชุดซ้อนชุด
 */
export async function setBundleItems(
  tenantId: string,
  systemId: string,
  bundleProductId: string,
  items: BundleComponentInput[],
): Promise<{ ok: true; count: number } | { ok: false; reason: string }> {
  const clean = items
    .map((i) => ({ componentProductId: i.componentProductId?.trim() ?? "", qty: Number(i.qty), unitId: i.unitId || null }))
    .filter((i) => i.componentProductId && Number.isFinite(i.qty) && i.qty > 0);
  // รวมบรรทัดที่ชี้สินค้าตัวเดียวกัน (unique (bundle, component) ที่ DB จะไม่ระเบิด)
  const merged = new Map<string, BundleComponentInput>();
  for (const i of clean) {
    const prev = merged.get(i.componentProductId);
    merged.set(i.componentProductId, { ...i, qty: (prev?.qty ?? 0) + i.qty });
  }
  const list = [...merged.values()];

  try {
    const count = await prisma.$transaction(async (tx) => {
      const bundle = await tx.accountProduct.findFirst({ where: { id: bundleProductId, tenantId, systemId } });
      if (!bundle) throw new Error("ไม่พบรายการจัดชุดนี้");
      if (bundle.type !== "BUNDLE") throw new Error("สินค้านี้ไม่ใช่ “รายการจัดชุด” — เปลี่ยนประเภทก่อนจึงจะใส่ส่วนประกอบได้");
      if (list.some((i) => i.componentProductId === bundleProductId))
        throw new Error("ชุดใส่ตัวเองเป็นส่วนประกอบไม่ได้");
      if (list.length > 0) {
        const comps = await tx.accountProduct.findMany({
          where: { id: { in: list.map((i) => i.componentProductId) }, tenantId, systemId },
          select: { id: true, name: true, type: true },
        });
        if (comps.length !== list.length) throw new Error("มีส่วนประกอบที่ไม่พบในทะเบียนสินค้าของกิจการนี้");
        const nested = comps.find((c) => c.type === "BUNDLE");
        if (nested) throw new Error(`"${nested.name}" เป็นรายการจัดชุด — ใส่ชุดซ้อนชุดไม่ได้`);
      }
      await tx.accountProductBundleItem.deleteMany({ where: { tenantId, systemId, bundleProductId } });
      if (list.length > 0) {
        await tx.accountProductBundleItem.createMany({
          data: list.map((i, idx) => ({
            tenantId,
            systemId,
            bundleProductId,
            componentProductId: i.componentProductId,
            qty: i.qty,
            unitId: i.unitId ?? null,
            sortOrder: idx,
          })),
        });
      }
      // ชุดไม่มีสต็อกของตัวเอง — กันไม่ให้เผลอผูกคลังไว้
      if (bundle.invItemId) throw new Error("รายการจัดชุดติดตามสต็อกเองไม่ได้ — เลิกผูกคลังของรายการนี้ก่อน");
      return list.length;
    });
    return { ok: true, count };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : "บันทึกส่วนประกอบไม่สำเร็จ" };
  }
}

// ─────────────────── ยอดยกมา (AccountProductOpeningLot · §8.2 แท็บ "ยอดยกมา") ───────────────────

export type OpeningLotInput = { lotDate: Date | string; qty: number; unitCost: number; warehouseId?: string | null };

export function listOpeningLots(tenantId: string, systemId: string, productId: string) {
  return prisma.accountProductOpeningLot.findMany({
    where: { tenantId, systemId, productId },
    orderBy: { seq: "asc" },
  });
}

/**
 * เพิ่ม lot ยอดยกมา + **รับเข้าคลังจริง + ลงบัญชี** ทันที (ตาม §8.2: ยอดยกมาเป็นของจริง ไม่ใช่ข้อความ)
 *   สินค้าที่ผูกคลัง → `inventory.receiveInTx` คีย์ `acc-open-<productId>-<seq>` (รับซ้ำไม่ได้)
 *   สินค้าที่ไม่ผูกคลัง → บวก `qtyOnHand` ของตัวเอง
 *   บัญชี → Dr 1200 สินค้าคงเหลือ / Cr 3999 ยอดยกมา (mapping key `OPENING_BALANCE`)
 */
export async function addOpeningLot(
  tenantId: string,
  systemId: string,
  productId: string,
  input: OpeningLotInput,
): Promise<{ ok: true; id: string; seq: number; amount: number } | { ok: false; reason: string }> {
  const qty = Number(input.qty);
  const unitCost = Math.round(Number(input.unitCost));
  if (!Number.isFinite(qty) || qty <= 0) return { ok: false, reason: "จำนวนยอดยกมาต้องมากกว่า 0" };
  if (!Number.isFinite(unitCost) || unitCost < 0) return { ok: false, reason: "ราคาต่อหน่วยติดลบไม่ได้" };
  const lotDate = input.lotDate instanceof Date ? input.lotDate : new Date(String(input.lotDate));
  if (Number.isNaN(lotDate.getTime())) return { ok: false, reason: "วันที่ยอดยกมาไม่ถูกต้อง" };
  const amount = Math.round(qty * unitCost);

  try {
    const out = await prisma.$transaction(async (tx) => {
      const p = await tx.accountProduct.findFirst({ where: { id: productId, tenantId, systemId } });
      if (!p) throw new Error("ไม่พบสินค้า");
      if (p.type !== "GOODS") throw new Error("ยอดยกมาใช้ได้กับสินค้าที่มีสต็อกเท่านั้น");
      const last = await tx.accountProductOpeningLot.findFirst({
        where: { productId },
        orderBy: { seq: "desc" },
        select: { seq: true },
      });
      const seq = (last?.seq ?? 0) + 1;
      const lot = await tx.accountProductOpeningLot.create({
        data: {
          tenantId,
          systemId,
          productId,
          seq,
          lotDate,
          qty,
          unitCost,
          warehouseId: input.warehouseId?.trim() || p.warehouseId || null,
          postedAt: new Date(),
        },
      });

      if (p.invItemId) {
        const invSystemId = await inventorySystemId(tenantId);
        if (!invSystemId) throw new Error("สินค้านี้ผูกกับคลังสินค้าไว้ แต่ยังไม่พบระบบคลังสินค้าของกิจการ");
        const mv = await inventory.receiveInTx(
          tx,
          { tenantId, systemId: invSystemId },
          {
            itemId: p.invItemId,
            qty,
            costSatang: unitCost,
            sourceModule: "ACCOUNT",
            refType: "AccountProductOpeningLot",
            refId: lot.id,
            note: "ยอดยกมา",
            locationId: lot.warehouseId,
            idempotencyKey: `acc-open-${productId}-${seq}`,
          },
        );
        await tx.accountProduct.update({ where: { id: p.id }, data: { qtyOnHand: mv.balanceAfter } });
      } else {
        await tx.accountProduct.update({
          where: { id: p.id },
          data: { qtyOnHand: Number(p.qtyOnHand) + qty },
        });
      }

      // Dr 1200 สินค้าคงเหลือ / Cr 3999 ยอดยกมา
      await gl.postStockDocument(
        { tenantId, systemId },
        {
          docId: `open-${lot.id}`, // ไม่ใช่เอกสารจริง — ใช้เป็นคีย์ idempotent ของ entry เท่านั้น
          event: "OPENING",
          date: lotDate,
          amountSatang: amount,
          drCode: p.inventoryAccountCode || INVENTORY_ACCOUNT,
          crCode: null,
          drKey: "INVENTORY",
          crKey: "OPENING_BALANCE",
          journal: "OPENING",
          memo: `ยอดยกมา ${p.name}`,
        },
        tx,
      );
      return { id: lot.id, seq, amount };
    });
    return { ok: true, ...out };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : "บันทึกยอดยกมาไม่สำเร็จ" };
  }
}

// ─────────────────── คิวรีของหน้าสินค้า V2 (§8.1 · f6) ───────────────────

export type ProductListRow = Prisma.AccountProductGetPayload<Record<string, never>> & {
  stock: number;
  unitName: string | null;
  bundleCount: number;
};

export type ProductListInput = {
  /** แท็บชนิด (f6 แถวบน) */
  type?: AccountProductType;
  /** sub-tab: "active" = ทั้งหมด(ที่ใช้งาน) · "archived" = ปิดใช้งาน */
  sub?: "active" | "archived";
  q?: string;
  category?: string;
  page?: number;
  pageSize?: number;
};

export type ProductListPage = {
  rows: ProductListRow[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
  /** ตัวนับของแท็บชนิดทั้ง 3 (นับเฉพาะแถวที่ใช้งาน) + แท็บย่อย */
  counts: { GOODS: number; SERVICE: number; BUNDLE: number; active: number; archived: number };
  /** มูลค่าสต็อกรวมของแท็บที่เลือก (สตางค์) = Σ คงเหลือ × ต้นทุน/หน่วย */
  stockValue: number;
  categories: string[];
};

/** หน้ารายการสินค้า V2 — กรอง/ค้นหา/แบ่งหน้า **ฝั่ง server** (ห้ามโหลดทั้งตารางมากรองที่ client) */
export async function listProductsPaged(
  tenantId: string,
  systemId: string,
  input: ProductListInput,
): Promise<ProductListPage> {
  const type = input.type ?? "GOODS";
  const sub = input.sub === "archived" ? "archived" : "active";
  const q = clampSearch(input.q);
  const pageSize = clampPageSize(input.pageSize);
  const page = clampPage(input.page);

  const search: Prisma.AccountProductWhereInput = q
    ? {
        OR: [
          { name: { contains: q, mode: "insensitive" } },
          { nameEn: { contains: q, mode: "insensitive" } },
          { code: { contains: q, mode: "insensitive" } },
          { sku: { contains: q, mode: "insensitive" } },
          { barcode: { contains: q, mode: "insensitive" } },
        ],
      }
    : {};
  const where: Prisma.AccountProductWhereInput = {
    tenantId,
    systemId,
    type,
    ...(sub === "archived" ? { archivedAt: { not: null } } : { archivedAt: null }),
    ...(input.category ? { category: input.category } : {}),
    ...search,
  };

  const [rows, total, goods, service, bundle, archived, cats] = await Promise.all([
    prisma.accountProduct.findMany({
      where,
      orderBy: [{ pinned: "desc" }, { code: "desc" }, { createdAt: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.accountProduct.count({ where }),
    prisma.accountProduct.count({ where: { tenantId, systemId, type: "GOODS", archivedAt: null } }),
    prisma.accountProduct.count({ where: { tenantId, systemId, type: "SERVICE", archivedAt: null } }),
    prisma.accountProduct.count({ where: { tenantId, systemId, type: "BUNDLE", archivedAt: null } }),
    prisma.accountProduct.count({ where: { tenantId, systemId, type, archivedAt: { not: null } } }),
    prisma.accountProduct.findMany({
      where: { tenantId, systemId, archivedAt: null, category: { not: null } },
      select: { category: true },
      distinct: ["category"],
      orderBy: { category: "asc" },
    }),
  ]);

  const stockMap = await productStockMap({ tenantId, systemId }, rows);
  const unitIds = [...new Set(rows.map((r) => r.unitId).filter((x): x is string => !!x))];
  const units = unitIds.length
    ? await prisma.accountUnit.findMany({ where: { systemId, id: { in: unitIds } }, select: { id: true, name: true } })
    : [];
  const unitName = new Map(units.map((u) => [u.id, u.name]));
  const bundleCounts = await bundleItemCountMap(
    systemId,
    rows.filter((r) => r.type === "BUNDLE").map((r) => r.id),
  );

  const out: ProductListRow[] = rows.map((p) => ({
    ...p,
    stock: stockMap.get(p.id) ?? Number(p.qtyOnHand),
    unitName: p.unitId ? (unitName.get(p.unitId) ?? null) : null,
    bundleCount: bundleCounts.get(p.id) ?? 0,
  }));

  // มูลค่าสต็อกรวมของทั้งแท็บ (ไม่ใช่เฉพาะหน้านี้) — สินค้าเท่านั้นที่มีมูลค่าสต็อก
  let stockValue = 0;
  if (type === "GOODS") {
    const all = await prisma.accountProduct.findMany({
      where,
      select: { id: true, invItemId: true, qtyOnHand: true, buyPrice: true },
    });
    const allStock = await productStockMap({ tenantId, systemId }, all);
    for (const p of all) stockValue += Math.round((allStock.get(p.id) ?? 0) * (p.buyPrice ?? 0));
  }

  return {
    rows: out,
    total,
    page,
    pageSize,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
    counts: { GOODS: goods, SERVICE: service, BUNDLE: bundle, active: type === "GOODS" ? goods : type === "SERVICE" ? service : bundle, archived },
    stockValue,
    categories: cats.map((c) => c.category as string),
  };
}

export type TrackedProductCard = {
  id: string;
  name: string;
  code: string | null;
  stock: number;
  reorderPoint: number;
  /** สัดส่วนของแถบเทียบจุดสั่งซื้อ 0–1 (ติดลบ = 1 แถบแดงเต็ม) */
  ratio: number;
  low: boolean;
  negative: boolean;
};

/**
 * การ์ด "สินค้าที่ติดตาม" ≤6 ใบ (f6) — สินค้าที่ปักหมุดก่อน แล้วค่อยตัวที่ผูกคลัง
 * จุดสั่งซื้อมาจาก `InvItem.reorderPoint` (คลังเป็นต้นฉบับ) · ไม่ผูกคลัง = 0
 */
export async function trackedProductCards(
  tenantId: string,
  systemId: string,
  take = 6,
): Promise<TrackedProductCard[]> {
  const rows = await prisma.accountProduct.findMany({
    where: { tenantId, systemId, archivedAt: null, type: "GOODS", OR: [{ pinned: true }, { invItemId: { not: null } }] },
    orderBy: [{ pinned: "desc" }, { name: "asc" }],
    take,
    select: { id: true, name: true, code: true, invItemId: true, qtyOnHand: true },
  });
  if (rows.length === 0) return [];
  const stock = await productStockMap({ tenantId, systemId }, rows);
  const invSystemId = rows.some((r) => r.invItemId) ? await inventorySystemId(tenantId) : null;
  const reorder = new Map<string, number>();
  if (invSystemId) {
    const items = await prisma.invItem.findMany({
      where: { tenantId, systemId: invSystemId, id: { in: rows.map((r) => r.invItemId).filter((x): x is string => !!x) } },
      select: { id: true, reorderPoint: true },
    });
    const byItem = new Map(items.map((i) => [i.id, i.reorderPoint]));
    for (const r of rows) if (r.invItemId) reorder.set(r.id, byItem.get(r.invItemId) ?? 0);
  }
  return rows.map((r) => {
    const s = stock.get(r.id) ?? Number(r.qtyOnHand);
    const rp = reorder.get(r.id) ?? 0;
    const negative = s < 0;
    const denom = Math.max(rp * 2, rp + 1, 1); // แถบเต็ม = 2 เท่าของจุดสั่งซื้อ (ให้เห็นระยะห่างจากขั้นต่ำ)
    return {
      id: r.id,
      name: r.name,
      code: r.code,
      stock: s,
      reorderPoint: rp,
      ratio: negative ? 1 : Math.max(0, Math.min(1, s / denom)),
      low: !negative && rp > 0 && s <= rp,
      negative,
    };
  });
}

/** คลังทั้งหมดของกิจการ (ตัวเลือก "คลัง" ในฟอร์ม/modal) — ไม่มีระบบคลัง = [] */
export async function listWarehouses(tenantId: string): Promise<{ id: string; name: string; isDefault: boolean }[]> {
  const invSystemId = await inventorySystemId(tenantId);
  if (!invSystemId) return [];
  // ผ่านชั้นคลัง (chokepoint account→inventory) — ไม่ query ตาราง InvLocation เอง
  const rows = await inventory.listLocations({ tenantId, systemId: invSystemId });
  return rows.map((l) => ({ id: l.id, name: l.name, isDefault: l.isDefault }));
}

/** ข้อมูลที่ modal สินค้า (g8) ต้องใช้ตอนเปิดแก้ไข — ลิงก์คลัง/POS + สูตรชุด + ยอดยกมา */
export async function productModalData(tenantId: string, systemId: string, productId: string) {
  const p = await prisma.accountProduct.findFirst({ where: { id: productId, tenantId, systemId } });
  if (!p) return null;
  const [bundleItems, openingLots] = await Promise.all([
    p.type === "BUNDLE" ? listBundleItems(tenantId, systemId, p.id) : Promise.resolve([]),
    listOpeningLots(tenantId, systemId, p.id),
  ]);
  let item: { id: string; sku: string; reorderPoint: number; costSatang: number; onHand: number; locationName: string | null } | null = null;
  if (p.invItemId) {
    const invSystemId = await inventorySystemId(tenantId);
    if (invSystemId) {
      const it = await prisma.invItem.findFirst({
        where: { tenantId, systemId: invSystemId, id: p.invItemId },
        select: { id: true, sku: true, reorderPoint: true, costSatang: true, onHand: true },
      });
      if (it) {
        const loc = p.warehouseId
          ? await prisma.invLocation.findFirst({ where: { id: p.warehouseId, tenantId }, select: { name: true } })
          : await prisma.invLocation.findFirst({ where: { tenantId, systemId: invSystemId, isDefault: true }, select: { name: true } });
        item = { ...it, locationName: loc?.name ?? null };
      }
    }
  }
  return { product: p, bundleItems, openingLots, item };
}


/**
 * ตัดสต็อกส่วนประกอบของรายการจัดชุด "นอก tx ของผู้เรียก" (บิล POS — เอกสารถูก commit ไปแล้ว)
 * 🔴 ต้องใช้ transaction ของ client ที่ **ไม่ผูก scope** เท่านั้น — `tenantDb(accCtx)` จะยัด
 *    systemId ของระบบบัญชีลงไปที่ตาราง `InvItem` ของระบบคลังด้วย แล้วหาของไม่เจอ (เจอจริง 4 ก.ย.)
 */
export function consumeBundleComponentsForDoc(
  ctx: { tenantId: string; systemId: string },
  docId: string,
): Promise<BundleConsumeResult> {
  return prisma.$transaction((tx) => consumeBundleComponentsInTx(tx, ctx, docId));
}
