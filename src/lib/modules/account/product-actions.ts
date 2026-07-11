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
  const res = await createUnit(tenantId, systemId, str(formData, "name"));
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
  await renameUnit(tenantId, systemId, id, str(formData, "name"));
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
  await writeAudit({
    tenantId,
    actorId: userId,
    action: "account.product.manage",
    targetType: "AccountProduct",
    targetId: res.ok ? res.id : undefined,
    after: { name: str(formData, "name"), ok: res.ok },
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
      } as GoodsLineInput;
    })
    .filter((l) => l.productId && l.qty > 0);
}

export async function createGoodsMovementAction(formData: FormData) {
  const systemId = str(formData, "systemId");
  const { auth, tenantId, userId } = await loadAccountSystem(systemId);
  assertAccountCan(auth, "account.product.manage");
  const docType = str(formData, "docType") === "GOODS_ISSUE_RETURN" ? "GOODS_ISSUE_RETURN" : "GOODS_ISSUE";
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
  });
  await writeAudit({
    tenantId,
    actorId: userId,
    action: "account.product.manage",
    targetType: "AccountDocument",
    targetId: res.ok ? res.id : undefined,
    after: res.ok ? { docNo: res.docNo, docType } : { error: res.reason },
  });
  revalidatePath(goodsPath(systemId));
  revalidatePath(productsPath(systemId, "catalog"));
  redirect(res.ok ? `${goodsPath(systemId)}?ok=${encodeURIComponent(res.docNo)}` : `${goodsPath(systemId)}?err=${encodeURIComponent(res.reason)}`);
}
