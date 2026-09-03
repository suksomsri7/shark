"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { AccountDocType, AccountProductType } from "@prisma/client";
import { loadAccountSystem } from "./guard";
import { assertAccountCan, writeAudit } from "./access";
import {
  createUnit,
  renameUnit,
  archiveUnit,
  seedUnits,
  approveGoodsMovement,
  createCostAdjustment,
  setBundleItems,
  addOpeningLot,
  type UnitKind,
  type BundleComponentInput,
  createCategory,
  updateCategory,
  archiveCategory,
  createProduct,
  updateProduct,
  archiveProduct,
  createGoodsMovement,
  type ProductInput,
  type GoodsLineInput,
} from "./product";
// WO 4.1 — ผูก/เลิกผูกสินค้าบัญชีกับสินค้าในคลัง ("ติดตามสต็อกในคลังสินค้า" · SPEC §8.2 "การเชื่อมต่อ")
import { linkProductToItem, unlinkProductFromItem } from "./inventory-link";

// ─────────────────── helpers ───────────────────

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const num = (fd: FormData, k: string) => {
  const v = String(fd.get(k) ?? "").trim();
  return v === "" ? undefined : Number(v);
};
// ราคาบาท (ในฟอร์ม) → สตางค์ (Int) · ว่าง = null
const satang = (fd: FormData, k: string): number | null => {
  const v = String(fd.get(k) ?? "").trim();
  return v === "" ? null : Math.round(Number(v) * 100);
};

const productsPath = (systemId: string, tab?: string) =>
  `/app/sys/${systemId}/account/products${tab ? `?tab=${tab}` : ""}`;
const goodsPath = (systemId: string) => `/app/sys/${systemId}/account/goods-issue`;

// ─────────────────── หน่วย ───────────────────

export async function createUnitAction(formData: FormData) {
  const systemId = str(formData, "systemId");
  const { auth, tenantId, userId } = await loadAccountSystem(systemId);
  assertAccountCan(auth, "account.product.manage");
  const res = await createUnit(tenantId, systemId, str(formData, "name"), {
    nameEn: str(formData, "nameEn") || null,
    kind: (str(formData, "kind") === "SERVICE" ? "SERVICE" : "PRODUCT") as UnitKind,
    code: str(formData, "code") || null,
  });
  await writeAudit({
    tenantId,
    actorId: userId,
    action: "account.product.manage",
    targetType: "AccountUnit",
    targetId: res.ok ? res.id : undefined,
    after: { unit: str(formData, "name"), ok: res.ok },
  });
  revalidatePath(productsPath(systemId, "units"));
  redirect(res.ok ? productsPath(systemId, "units") : `${productsPath(systemId, "units")}&err=${encodeURIComponent(res.reason)}`);
}

export async function renameUnitAction(formData: FormData) {
  const systemId = str(formData, "systemId");
  const { auth, tenantId, userId } = await loadAccountSystem(systemId);
  assertAccountCan(auth, "account.product.manage");
  const id = str(formData, "id");
  await renameUnit(tenantId, systemId, id, str(formData, "name"), {
    nameEn: str(formData, "nameEn") || null,
    kind: (str(formData, "kind") === "SERVICE" ? "SERVICE" : "PRODUCT") as UnitKind,
    code: str(formData, "code") || null,
  });
  await writeAudit({ tenantId, actorId: userId, action: "account.product.manage", targetType: "AccountUnit", targetId: id });
  revalidatePath(productsPath(systemId, "units"));
  redirect(productsPath(systemId, "units"));
}

export async function archiveUnitAction(formData: FormData) {
  const systemId = str(formData, "systemId");
  const { auth, tenantId, userId } = await loadAccountSystem(systemId);
  assertAccountCan(auth, "account.product.manage");
  const id = str(formData, "id");
  await archiveUnit(tenantId, systemId, id);
  await writeAudit({ tenantId, actorId: userId, action: "account.product.manage", targetType: "AccountUnit", targetId: id, after: { archived: true } });
  revalidatePath(productsPath(systemId, "units"));
  redirect(productsPath(systemId, "units"));
}

// ─────────────────── กลุ่มจัดประเภท ───────────────────

function parseAppliesTo(formData: FormData): AccountDocType[] {
  return formData.getAll("appliesTo").map((v) => String(v) as AccountDocType);
}

export async function createCategoryAction(formData: FormData) {
  const systemId = str(formData, "systemId");
  const { auth, tenantId, userId } = await loadAccountSystem(systemId);
  assertAccountCan(auth, "account.product.manage");
  const res = await createCategory(tenantId, systemId, {
    name: str(formData, "name"),
    appliesTo: parseAppliesTo(formData),
  });
  await writeAudit({
    tenantId,
    actorId: userId,
    action: "account.product.manage",
    targetType: "AccountCategory",
    targetId: res.ok ? res.id : undefined,
    after: { name: str(formData, "name"), ok: res.ok },
  });
  revalidatePath(productsPath(systemId, "categories"));
  redirect(res.ok ? productsPath(systemId, "categories") : `${productsPath(systemId, "categories")}&err=${encodeURIComponent(res.reason)}`);
}

export async function updateCategoryAction(formData: FormData) {
  const systemId = str(formData, "systemId");
  const { auth, tenantId, userId } = await loadAccountSystem(systemId);
  assertAccountCan(auth, "account.product.manage");
  const id = str(formData, "id");
  await updateCategory(tenantId, systemId, id, {
    name: str(formData, "name") || undefined,
    appliesTo: parseAppliesTo(formData),
  });
  await writeAudit({ tenantId, actorId: userId, action: "account.product.manage", targetType: "AccountCategory", targetId: id });
  revalidatePath(productsPath(systemId, "categories"));
  redirect(productsPath(systemId, "categories"));
}

export async function archiveCategoryAction(formData: FormData) {
  const systemId = str(formData, "systemId");
  const { auth, tenantId, userId } = await loadAccountSystem(systemId);
  assertAccountCan(auth, "account.product.manage");
  const id = str(formData, "id");
  await archiveCategory(tenantId, systemId, id);
  await writeAudit({ tenantId, actorId: userId, action: "account.product.manage", targetType: "AccountCategory", targetId: id, after: { archived: true } });
  revalidatePath(productsPath(systemId, "categories"));
  redirect(productsPath(systemId, "categories"));
}

// ─────────────────── สินค้า/บริการ ───────────────────

function readProductInput(formData: FormData): ProductInput {
  return {
    sku: str(formData, "sku") || null,
    name: str(formData, "name"),
    nameEn: str(formData, "nameEn") || null,
    type: (str(formData, "type") as AccountProductType) || "GOODS",
    unitId: str(formData, "unitId") || null,
    salePrice: satang(formData, "salePrice"),
    buyPrice: satang(formData, "buyPrice"),
    vatRateBp: num(formData, "vatRateBp") ?? 700,
    incomeAccountId: str(formData, "incomeAccountId") || null,
    expenseAccountId: str(formData, "expenseAccountId") || null,
    imageUrl: str(formData, "imageUrl") || null,
  };
}

export async function createProductAction(formData: FormData) {
  const systemId = str(formData, "systemId");
  const { auth, tenantId, userId } = await loadAccountSystem(systemId);
  assertAccountCan(auth, "account.product.manage");
  const res = await createProduct(tenantId, systemId, readProductInput(formData));
  // WO 4.1: ติ๊ก "ติดตามสต็อกในคลังสินค้า" ตอนสร้าง → สร้าง InvItem + ผูกสองทางให้เลย
  //   ผูกไม่สำเร็จ = สินค้าถูกสร้างแล้ว (ไม่ย้อน) แค่เตือนเหตุผลกลับไปที่หน้ารายการ
  let linkErr = "";
  if (res.ok && str(formData, "trackStock") === "1") {
    const link = await linkProductToItem({ tenantId, systemId }, res.id, {
      createItem: {
        warehouseId: str(formData, "warehouseId") || null,
        reorderPoint: num(formData, "reorderPoint") ?? null,
      },
    });
    if (!link.ok) linkErr = link.reason;
  }
  await writeAudit({
    tenantId,
    actorId: userId,
    action: "account.product.manage",
    targetType: "AccountProduct",
    targetId: res.ok ? res.id : undefined,
    after: { name: str(formData, "name"), ok: res.ok, trackStock: str(formData, "trackStock") === "1" },
  });
  revalidatePath(productsPath(systemId, "catalog"));
  const err = res.ok ? linkErr : res.reason;
  redirect(err ? `${productsPath(systemId, "catalog")}&err=${encodeURIComponent(err)}` : productsPath(systemId, "catalog"));
}

// ─────────────────── ผูก/เลิกผูกคลังสินค้า (WO 4.1 · SPEC §8.2 "การเชื่อมต่อ") ───────────────────

/** ติ๊ก "ติดตามสต็อกในคลังสินค้า" ของสินค้าที่มีอยู่แล้ว — ระบุ itemId = ผูกของเดิม · ไม่ระบุ = สร้างใหม่ในคลัง */
export async function linkProductToItemAction(formData: FormData) {
  const systemId = str(formData, "systemId");
  const { auth, tenantId, userId } = await loadAccountSystem(systemId);
  assertAccountCan(auth, "account.product.manage");
  const id = str(formData, "id");
  const itemId = str(formData, "itemId");
  const res = await linkProductToItem(
    { tenantId, systemId },
    id,
    itemId
      ? { itemId }
      : { createItem: { warehouseId: str(formData, "warehouseId") || null, reorderPoint: num(formData, "reorderPoint") ?? null } },
  );
  await writeAudit({
    tenantId,
    actorId: userId,
    action: "account.product.manage",
    targetType: "AccountProduct",
    targetId: id,
    after: { linked: res.ok, mode: itemId ? "existing" : "create" },
  });
  revalidatePath(productsPath(systemId, "catalog"));
  redirect(res.ok ? productsPath(systemId, "catalog") : `${productsPath(systemId, "catalog")}&err=${encodeURIComponent(res.reason)}`);
}

/** เลิกติดตามสต็อกในคลัง — สินค้ากลับไปใช้ยอดคงเหลือของตัวเอง (แช่แข็งยอดล่าสุดจากคลังไว้ให้) */
export async function unlinkProductFromItemAction(formData: FormData) {
  const systemId = str(formData, "systemId");
  const { auth, tenantId, userId } = await loadAccountSystem(systemId);
  assertAccountCan(auth, "account.product.manage");
  const id = str(formData, "id");
  const res = await unlinkProductFromItem({ tenantId, systemId }, id);
  await writeAudit({
    tenantId,
    actorId: userId,
    action: "account.product.manage",
    targetType: "AccountProduct",
    targetId: id,
    after: { unlinked: res.ok },
  });
  revalidatePath(productsPath(systemId, "catalog"));
  redirect(res.ok ? productsPath(systemId, "catalog") : `${productsPath(systemId, "catalog")}&err=${encodeURIComponent(res.reason)}`);
}

export async function updateProductAction(formData: FormData) {
  const systemId = str(formData, "systemId");
  const { auth, tenantId, userId } = await loadAccountSystem(systemId);
  assertAccountCan(auth, "account.product.manage");
  const id = str(formData, "id");
  const res = await updateProduct(tenantId, systemId, id, readProductInput(formData));
  await writeAudit({
    tenantId,
    actorId: userId,
    action: "account.product.manage",
    targetType: "AccountProduct",
    targetId: id,
    after: { ok: res.ok },
  });
  revalidatePath(productsPath(systemId, "catalog"));
  redirect(res.ok ? productsPath(systemId, "catalog") : `${productsPath(systemId, "catalog")}&err=${encodeURIComponent(res.reason)}`);
}

export async function archiveProductAction(formData: FormData) {
  const systemId = str(formData, "systemId");
  const { auth, tenantId, userId } = await loadAccountSystem(systemId);
  assertAccountCan(auth, "account.product.manage");
  const id = str(formData, "id");
  const archived = str(formData, "archived") !== "0"; // "0" = กู้คืน
  await archiveProduct(tenantId, systemId, id, archived);
  await writeAudit({
    tenantId,
    actorId: userId,
    action: "account.product.manage",
    targetType: "AccountProduct",
    targetId: id,
    after: { archived },
  });
  revalidatePath(productsPath(systemId, "catalog"));
  redirect(productsPath(systemId, "catalog"));
}

// ─────────────────── เบิก/คืนสินค้า ───────────────────

function parseGoodsLines(formData: FormData): GoodsLineInput[] {
  const raw = String(formData.get("lines") ?? "[]");
  let arr: unknown;
  try {
    arr = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(arr)) return [];
  return arr
    .map((x) => {
      const l = x as Record<string, unknown>;
      return {
        productId: String(l.productId ?? "").trim(),
        qty: Number(l.qty ?? 0),
        description: l.description ? String(l.description) : null,
        locationId: l.locationId ? String(l.locationId) : null,
      } as GoodsLineInput;
    })
    .filter((l) => l.productId && l.qty > 0);
}

export async function createGoodsMovementAction(formData: FormData) {
  const systemId = str(formData, "systemId");
  const { auth, tenantId, userId } = await loadAccountSystem(systemId);
  assertAccountCan(auth, "account.product.manage");
  const docType = str(formData, "docType") === "GOODS_ISSUE_RETURN" ? "GOODS_ISSUE_RETURN" : "GOODS_ISSUE";
  // WO 1.6 §5.2 J — RPR จาก wizard ส่ง sourceDocId (PRR ที่เลือกในขั้น ①) + เหตุผล มาด้วย — createGoodsMovement ตรวจเพดานเอง
  const sourceDocId = docType === "GOODS_ISSUE_RETURN" ? str(formData, "sourceDocId") || null : null;
  const res = await createGoodsMovement({
    tenantId,
    systemId,
    docType,
    contactId: str(formData, "contactId") || null,
    categoryId: str(formData, "categoryId") || null,
    note: str(formData, "note") || null,
    lines: parseGoodsLines(formData),
    allowNegative: str(formData, "allowNegative") === "1",
    createdById: userId,
    sourceDocId,
    adjustReason: str(formData, "adjustReason") || null,
    // WO 4.3 §8.4 (ภาพ g12) — อ้างอิง · บัญชี Dr ของ "ค่าใช้จ่ายที่ปรับปรุง" · แท็ก · ปุ่ม "บันทึกร่าง"
    adjustAccountCode: str(formData, "adjustAccountCode") || null,
    reference: str(formData, "reference") || null,
    tags: formData.getAll("tags").map((t) => String(t).trim()).filter(Boolean),
    asDraft: str(formData, "asDraft") === "1",
    issueDate: str(formData, "issueDate") ? new Date(`${str(formData, "issueDate")}T10:00:00+07:00`) : undefined,
  });
  await writeAudit({
    tenantId,
    actorId: userId,
    action: "account.product.manage",
    targetType: "AccountDocument",
    targetId: res.ok ? res.id : undefined,
    after: res.ok ? { docNo: res.docNo, docType, sourceDocId } : { error: res.reason },
  });
  revalidatePath(goodsPath(systemId));
  revalidatePath(productsPath(systemId, "catalog"));
  redirect(res.ok ? `${goodsPath(systemId)}?ok=${encodeURIComponent(res.docNo)}` : `${goodsPath(systemId)}?err=${encodeURIComponent(res.reason)}`);
}

// ═══════════════════════════════════════════════════════════════════════════
// WO 4.3 — action ของหน้าสินค้า V2 (§8.1–8.4 · เฟรม f6/g8/g12)
// ทุกตัวตรวจสิทธิ์ `account.product.manage` ก่อนแตะข้อมูลเสมอ (F6 authz)
// ═══════════════════════════════════════════════════════════════════════════

/** เติมหน่วยเริ่มต้น 12 หน่วย (§8.3) — กดซ้ำได้ ไม่สร้างซ้ำ */
export async function seedUnitsAction(formData: FormData) {
  const systemId = str(formData, "systemId");
  const { auth, tenantId, userId } = await loadAccountSystem(systemId);
  assertAccountCan(auth, "account.product.manage");
  const res = await seedUnits(tenantId, systemId);
  await writeAudit({
    tenantId,
    actorId: userId,
    action: "account.product.manage",
    targetType: "AccountUnit",
    after: { seeded: res.created, filled: res.filled, total: res.total },
  });
  revalidatePath(unitsPath(systemId));
  redirect(unitsPath(systemId));
}

const unitsPath = (systemId: string) => `/app/sys/${systemId}/account/units`;
const costAdjustPath = (systemId: string) => `/app/sys/${systemId}/account/cost-adjustment`;

// ─────────────────── modal สินค้า (g8) — server action ที่ "คืนค่า" ไม่ redirect ───────────────────
// เหตุผลเดียวกับ ContactModal ของ WO 3.3: บันทึกไม่ผ่าน = สิ่งที่ผู้ใช้พิมพ์ต้องไม่หาย

export type ProductFormPayload = {
  id?: string | null;
  code?: string | null;
  type: string;
  name: string;
  nameEn?: string | null;
  sku?: string | null;
  barcode?: string | null;
  category?: string | null;
  description?: string | null;
  unitId?: string | null;
  salePriceBaht?: string | null;
  buyPriceBaht?: string | null;
  vatRateBp?: number | null;
  purchaseVatRateBp?: number | null;
  incomeAccountId?: string | null;
  expenseAccountId?: string | null;
  cogsAccountCode?: string | null;
  inventoryAccountCode?: string | null;
  costMethod?: string | null;
  defaultWhtType?: string | null;
  defaultWhtRateBp?: number | null;
  imageUrls?: string[];
  // การเชื่อมต่อ (§8.2)
  trackStock?: boolean;
  warehouseId?: string | null;
  reorderPoint?: number | null;
  posEnabled?: boolean;
  posCategory?: string | null;
  posPriceBaht?: string | null;
  bookingEnabled?: boolean;
  bookingDurationMin?: number | null;
  bookingDepositBaht?: string | null;
  // รายการจัดชุด (§8.2)
  bundleItems?: { componentProductId: string; qty: number; unitId?: string | null }[];
};

export type SaveProductResult =
  | { ok: true; id: string; code: string | null }
  | { ok: false; error: string; fields?: Record<string, string> };

const bahtToSatang = (v: string | null | undefined): number | null => {
  const t = (v ?? "").trim();
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? Math.round(n * 100) : null;
};

function validateProductPayload(p: ProductFormPayload): Record<string, string> {
  const f: Record<string, string> = {};
  if (!p.name?.trim()) f.name = "กรุณากรอกชื่อสินค้า/บริการ";
  else if (p.name.trim().length > 100) f.name = "ชื่อยาวเกิน 100 ตัวอักษร";
  if ((p.nameEn ?? "").trim().length > 100) f.nameEn = "ชื่ออังกฤษยาวเกิน 100 ตัวอักษร";
  if ((p.barcode ?? "").trim().length > 48) f.barcode = "บาร์โค้ดยาวเกิน 48 ตัวอักษร";
  if ((p.description ?? "").trim().length > 500) f.description = "คำอธิบายยาวเกิน 500 ตัวอักษร";
  for (const [k, label] of [["salePriceBaht", "ราคาขาย"], ["buyPriceBaht", "ราคาซื้อ"], ["posPriceBaht", "ราคา POS"]] as const) {
    const raw = (p[k] ?? "").trim();
    if (raw === "") continue;
    const n = Number(raw);
    if (!Number.isFinite(n)) f[k] = `${label}ต้องเป็นตัวเลข`;
    else if (n < 0) f[k] = `${label}ติดลบไม่ได้`;
  }
  if (p.costMethod === "FIFO") f.costMethod = "FIFO ยังไม่เปิดใช้งาน (คลัง SHARK ใช้ถัวเฉลี่ย)";
  if (p.type === "BUNDLE" && p.trackStock) f.trackStock = "รายการจัดชุดติดตามสต็อกเองไม่ได้ (ตัดที่ส่วนประกอบ)";
  if (p.type === "SERVICE" && p.trackStock) f.trackStock = "บริการไม่มีสต็อกให้ติดตาม";
  return f;
}

/** บันทึกสินค้าจาก modal g8 (สร้าง/แก้ไข) + ผูกคลัง/POS/สูตรชุด ในคำสั่งเดียว */
export async function saveProductAction(systemId: string, payload: ProductFormPayload): Promise<SaveProductResult> {
  const { auth, tenantId, userId } = await loadAccountSystem(systemId);
  assertAccountCan(auth, "account.product.manage");

  const fields = validateProductPayload(payload);
  if (Object.keys(fields).length > 0) return { ok: false, error: "validation", fields };

  const type = (["GOODS", "SERVICE", "BUNDLE"].includes(payload.type) ? payload.type : "GOODS") as AccountProductType;
  const input: ProductInput = {
    code: payload.code ?? undefined,
    name: payload.name,
    nameEn: payload.nameEn ?? null,
    sku: payload.sku ?? null,
    type,
    unitId: payload.unitId ?? null,
    salePrice: bahtToSatang(payload.salePriceBaht),
    buyPrice: bahtToSatang(payload.buyPriceBaht),
    vatRateBp: payload.vatRateBp ?? 700,
    incomeAccountId: payload.incomeAccountId ?? null,
    expenseAccountId: payload.expenseAccountId ?? null,
    barcode: payload.barcode ?? null,
    category: payload.category ?? null,
    description: payload.description ?? null,
    costMethod: payload.costMethod ?? "AVG",
    cogsAccountCode: payload.cogsAccountCode ?? null,
    inventoryAccountCode: payload.inventoryAccountCode ?? null,
    purchaseVatRateBp: payload.purchaseVatRateBp ?? null,
    defaultWhtType: payload.defaultWhtType ?? null,
    defaultWhtRateBp: payload.defaultWhtRateBp ?? null,
    posEnabled: payload.posEnabled === true,
    posCategory: payload.posCategory ?? null,
    posPrice: bahtToSatang(payload.posPriceBaht),
    bookingEnabled: payload.bookingEnabled === true,
    bookingDurationMin: payload.bookingDurationMin ?? null,
    bookingDepositSatang: bahtToSatang(payload.bookingDepositBaht),
    imageUrls: payload.imageUrls ?? [],
  };

  let id = (payload.id ?? "").trim();
  let code: string | null = null;
  if (id) {
    const res = await updateProduct(tenantId, systemId, id, input);
    if (!res.ok) return { ok: false, error: res.reason };
    code = (payload.code ?? "").trim() || null;
  } else {
    const res = await createProduct(tenantId, systemId, input);
    if (!res.ok) return { ok: false, error: res.reason };
    id = res.id;
    code = res.code;
  }

  // ── การเชื่อมต่อ: ติดตามสต็อกในคลัง (สร้าง InvItem ใหม่ให้ถ้ายังไม่ผูก) ──
  if (type === "GOODS" && payload.trackStock) {
    const link = await linkProductToItem({ tenantId, systemId }, id, {
      createItem: {
        warehouseId: payload.warehouseId ?? null,
        reorderPoint: payload.reorderPoint ?? null,
        sku: payload.sku ?? null,
      },
    });
    // "ผูกอยู่แล้ว" ไม่ใช่ error ของผู้ใช้ — แค่ปรับคลัง/จุดสั่งซื้อให้ตรงที่เลือก
    if (!link.ok && !/ผูกกับคลังอยู่แล้ว/.test(link.reason)) return { ok: false, error: link.reason };
  } else if (payload.trackStock === false) {
    await unlinkProductFromItem({ tenantId, systemId }, id);
  }

  // ── รายการจัดชุด: สูตรส่วนประกอบ ──
  if (type === "BUNDLE" && payload.bundleItems) {
    const res = await setBundleItems(tenantId, systemId, id, payload.bundleItems as BundleComponentInput[]);
    if (!res.ok) return { ok: false, error: res.reason };
  }

  await writeAudit({
    tenantId,
    actorId: userId,
    action: "account.product.manage",
    targetType: "AccountProduct",
    targetId: id,
    after: { name: payload.name, type, trackStock: payload.trackStock === true, posEnabled: payload.posEnabled === true },
  });
  revalidatePath(productsPath(systemId));
  return { ok: true, id, code };
}

/** ยอดยกมา 1 lot (§8.2 แท็บ "ยอดยกมา") — รับเข้าคลังจริง + ลง JV ทันที */
export async function addOpeningLotAction(
  systemId: string,
  payload: { productId: string; lotDate: string; qty: number; unitCostBaht: string; warehouseId?: string | null },
): Promise<{ ok: true; seq: number; amount: number } | { ok: false; error: string }> {
  const { auth, tenantId, userId } = await loadAccountSystem(systemId);
  assertAccountCan(auth, "account.product.manage");
  const res = await addOpeningLot(tenantId, systemId, payload.productId, {
    lotDate: `${payload.lotDate}T10:00:00+07:00`,
    qty: payload.qty,
    unitCost: bahtToSatang(payload.unitCostBaht) ?? 0,
    warehouseId: payload.warehouseId ?? null,
  });
  if (!res.ok) return { ok: false, error: res.reason };
  await writeAudit({
    tenantId,
    actorId: userId,
    action: "account.product.manage",
    targetType: "AccountProduct",
    targetId: payload.productId,
    after: { openingLot: res.seq, amount: res.amount },
  });
  revalidatePath(productsPath(systemId));
  return { ok: true, seq: res.seq, amount: res.amount };
}

/** อนุมัติใบเบิก/ใบส่งคืนที่เป็นร่าง (ปุ่ม "อนุมัติใบเบิกสินค้า" ของ g12 เมื่อเปิดร่างเดิม) */
export async function approveGoodsMovementAction(formData: FormData) {
  const systemId = str(formData, "systemId");
  const { auth, tenantId, userId } = await loadAccountSystem(systemId);
  assertAccountCan(auth, "account.product.manage");
  const id = str(formData, "id");
  const res = await approveGoodsMovement(tenantId, systemId, id, {
    allowNegative: str(formData, "allowNegative") === "1",
  });
  await writeAudit({
    tenantId,
    actorId: userId,
    action: "account.product.manage",
    targetType: "AccountDocument",
    targetId: id,
    after: res.ok ? { approved: true, docNo: res.docNo } : { error: res.reason },
  });
  revalidatePath(goodsPath(systemId));
  redirect(res.ok ? `${goodsPath(systemId)}?ok=${encodeURIComponent(res.docNo)}` : `${goodsPath(systemId)}?err=${encodeURIComponent(res.reason)}`);
}

/** ใบปรับต้นทุนสินค้า (CA · §8.4) */
export async function createCostAdjustmentAction(formData: FormData) {
  const systemId = str(formData, "systemId");
  const { auth, tenantId, userId } = await loadAccountSystem(systemId);
  assertAccountCan(auth, "account.product.manage");
  const res = await createCostAdjustment({
    tenantId,
    systemId,
    productId: str(formData, "productId"),
    newCostSatang: satang(formData, "newCostBaht") ?? 0,
    issueDate: str(formData, "issueDate") ? new Date(`${str(formData, "issueDate")}T10:00:00+07:00`) : undefined,
    reason: str(formData, "reason") || null,
    adjustAccountCode: str(formData, "adjustAccountCode") || null,
    note: str(formData, "note") || null,
    createdById: userId,
    asDraft: str(formData, "asDraft") === "1",
  });
  await writeAudit({
    tenantId,
    actorId: userId,
    action: "account.product.manage",
    targetType: "AccountDocument",
    targetId: res.ok ? res.id : undefined,
    after: res.ok
      ? { docNo: res.docNo, oldCost: res.oldCost, newCost: res.newCost, qty: res.qty, delta: res.delta }
      : { error: res.reason },
  });
  revalidatePath(costAdjustPath(systemId));
  revalidatePath(productsPath(systemId));
  redirect(
    res.ok
      ? `${costAdjustPath(systemId)}?ok=${encodeURIComponent(res.docNo)}`
      : `${costAdjustPath(systemId)}?err=${encodeURIComponent(res.reason)}`,
  );
}
