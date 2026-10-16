// ops/products.ts — op ของแคตตาล็อกขาย (ใบ P2.13 · brief §1 #14–#21 · มติ 4)
//
// อ่าน: รายการสินค้าของสาขา (catalog.listForUnit) · สแกนบาร์โค้ด/ป้ายชั่ง (registerScan) · ตัวเลือกของสินค้า (registerProductOptions)
// เขียน: สร้าง/แก้/ตั้งราคา/เก็บถาวร (catalog.ts — ผู้เขียนแคตตาล็อกที่เดียว · F15.1) · 86/คืนขาย (catalog.setAvailability · event pos.product.availability)
// 🔴 มติ 4: สิทธิ์ของคีย์ = scope ของคีย์ (CatalogCtx.actorMembership จาก pos/api/actor.ts) — ไม่ใช่สิทธิ์ของคนที่ออกคีย์
// 🔴 ไม่มีตรรกะราคาที่นี่: ราคา/ภาษี/ตัวแปร/ราคาช่องทาง อยู่ที่ catalog.ts + register.ts

import { z } from "zod";
import { paged } from "@/lib/api/respond";
import { archive, createProduct, listForUnit, PRODUCT_KINDS, setAvailability, setPrice, updateProduct } from "../../catalog";
import { registerProductOptions, registerScan } from "../../register";
import { posCatalogCtxOf, posRegisterActorOf } from "../actor";
import { posData, posResult, toPosApiError } from "../http-errors";
import { definePosOp, POS_SCOPES, type ApiOp } from "../op";
import { posProductUnit, requirePosUnit } from "../units";

const satang = z.number().int().min(0).max(2_147_483_647);
const unitIdField = z.string().min(1).max(64).describe("Branch (BusinessUnit id) of this POS system.");
const unitIdOpt = unitIdField
  .optional()
  .describe("Branch to act in. Optional for a product of one branch (its own branch is used; a different branch answers 404); required for a product sold at every branch when the operation is per branch.");
const productTarget = ({ params, data }: { params: Record<string, string>; data: unknown }) => {
  const id = params.id || (typeof data === "object" && data !== null ? (data as { id?: unknown }).id : null);
  return typeof id === "string" && id ? { targetType: "PosProduct", targetId: id } : null;
};

/** catalog.ts โยน CatalogError — แปลเป็นรหัส REST (NOT_FOUND 404 · PERMISSION_DENIED 403 · VALIDATION 422 · CONFLICT 409 · BUSY 503) */
async function catalogCall<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    throw toPosApiError(e);
  }
}

const productsList = definePosOp({
  id: "products.list",
  method: "GET",
  path: "/products",
  kind: "read",
  action: POS_SCOPES.saleRead,
  summary: "Products sellable at a branch (the register catalog): price in satang, VAT, kind, stock link, availability (86) per branch. Cursor paging: send nextCursor back as cursor.",
  label: "สินค้าของสาขา",
  test: "products.list",
  input: z
    .object({
      unitId: unitIdField,
      q: z.string().max(100).optional().describe("Search name, English name, barcode or SKU."),
      pageSize: z.coerce.number().int().min(1).max(500).optional().describe("Products per page (default 100, max 500)."),
      cursor: z.string().min(1).max(400).optional().describe("nextCursor of the previous page."),
    })
    .strict(),
  paged: true,
  async handler({ actor, input }) {
    const unitId = await requirePosUnit(actor, input.unitId);
    const pageSize = input.pageSize ?? 100;
    const r = await catalogCall(() => listForUnit(posCatalogCtxOf(actor), unitId, { ...(input.q ? { q: input.q } : {}), limit: pageSize, ...(input.cursor ? { cursor: input.cursor } : {}) }));
    // แบ่งหน้าแบบ cursor ของ catalog — page นับจากหน้าที่ขอ (1 = หน้านี้) · total = จำนวนในหน้านี้ · hasMore = มี nextCursor
    return paged(r.items, { page: 1, pageSize, pageCount: r.nextCursor ? 2 : 1, total: r.items.length, hasMore: r.nextCursor !== null }, { nextCursor: r.nextCursor });
  },
});

const productsLookup = definePosOp({
  id: "products.lookup",
  method: "GET",
  path: "/products/lookup",
  kind: "read",
  action: POS_SCOPES.saleCreate,
  summary: "Find the product of a barcode exactly like the register scanner: product barcode, stock item barcode, or a scale label (grams and price of the label). match is one, choose (pick a variant) or none.",
  label: "ค้นสินค้าจากบาร์โค้ด",
  test: "products.lookup",
  input: z.object({ unitId: unitIdField, barcode: z.string().min(1).max(64).describe("Scanned code (EAN/UPC/internal, or a weighed EAN-13 label).") }).strict(),
  async handler({ actor, input }) {
    const unitId = await requirePosUnit(actor, input.unitId);
    return posData(await registerScan({ tenantId: actor.tenantId, systemId: actor.systemId, unitId }, posRegisterActorOf(actor), { barcode: input.barcode }));
  },
});

const productsOptions = definePosOp({
  id: "products.options",
  method: "GET",
  path: "/products/{id}/options",
  kind: "read",
  action: POS_SCOPES.saleCreate,
  summary: "Option groups and choices (with price deltas) and variants of a product at a branch. Sold out choices are flagged.",
  label: "ตัวเลือกของสินค้า",
  test: "products.options",
  input: z.object({ unitId: unitIdOpt }).strict(),
  async handler({ actor, params, input }) {
    const unitId = (await posProductUnit(actor, params.id ?? "", input.unitId, true))!;
    return posData(await registerProductOptions({ tenantId: actor.tenantId, systemId: actor.systemId, unitId }, posRegisterActorOf(actor), { productId: params.id ?? "" }));
  },
});

const productsCreate = definePosOp({
  id: "products.create",
  method: "POST",
  path: "/products",
  kind: "write",
  action: POS_SCOPES.productManage,
  summary: "Add a product to the catalog of a branch (or of every branch with allBranches: true). Stock items come from the inventory module; this creates catalog only products.",
  label: "เพิ่มสินค้า",
  test: "products.create",
  input: z
    .object({
      unitId: unitIdField,
      allBranches: z.boolean().optional().describe("true = sold at every branch of this POS system (needs the scope at every branch)."),
      name: z.string().trim().min(1).max(200).describe("Product name (Thai)."),
      nameEn: z.string().trim().max(200).optional().describe("English name."),
      kind: z.enum(PRODUCT_KINDS as unknown as [string, ...string[]]).optional().describe("PRODUCT (default), SERVICE, MENU or BUNDLE."),
      categoryId: z.string().min(1).max(64).optional().describe("Catalog category id."),
      basePriceSatang: satang.optional().describe("Price in satang, VAT included as the shop sets. Per kilogram for sold-by-weight products."),
      vatRateBp: z.number().int().min(0).max(10_000).optional().describe("VAT rate in basis points (700 = 7%). Absent = the shop default."),
      barcode: z.string().trim().min(1).max(64).optional().describe("Barcode."),
      trackStock: z.boolean().optional().describe("Cut stock on sale (needs a stock item)."),
      soldByWeight: z.boolean().optional().describe("Sold by weight (PRODUCT only); basePriceSatang = price per kg."),
      scalePlu: z.string().regex(/^\d{5}$/).optional().describe("5 digit scale PLU of a sold-by-weight product."),
    })
    .strict(),
  auditTarget: productTarget,
  async handler({ actor, input }) {
    const unitId = await requirePosUnit(actor, input.unitId);
    const { unitId: _u, allBranches, ...fields } = input;
    return catalogCall(() => createProduct(posCatalogCtxOf(actor), { ...fields, unitId: allBranches ? null : unitId } as Parameters<typeof createProduct>[1]));
  },
});

const productsUpdate = definePosOp({
  id: "products.update",
  method: "PATCH",
  path: "/products/{id}",
  kind: "write",
  action: POS_SCOPES.productManage,
  summary: "Change the name, English name, category, stock cutting or weighing of a product. Prices go through PUT /products/{id}/price.",
  label: "แก้สินค้า",
  test: "products.update",
  input: z
    .object({
      unitId: unitIdOpt,
      name: z.string().trim().min(1).max(200).optional().describe("Product name (Thai)."),
      nameEn: z.string().trim().max(200).nullable().optional().describe("English name (null = clear)."),
      categoryId: z.string().min(1).max(64).nullable().optional().describe("Category id (null = none)."),
      trackStock: z.boolean().nullable().optional().describe("true = always cut stock · false = never · null = automatic."),
      soldByWeight: z.boolean().optional().describe("Sold by weight."),
      scalePlu: z.string().regex(/^\d{5}$/).nullable().optional().describe("5 digit scale PLU (null = clear)."),
    })
    .strict(),
  auditTarget: productTarget,
  async handler({ actor, params, input }) {
    await posProductUnit(actor, params.id ?? "", input.unitId, false);
    const { unitId: _u, ...patch } = input;
    return catalogCall(() => updateProduct(posCatalogCtxOf(actor), params.id ?? "", patch as Parameters<typeof updateProduct>[2]));
  },
});

const productsSetPrice = definePosOp({
  id: "products.setPrice",
  method: "PUT",
  path: "/products/{id}/price",
  kind: "write",
  action: POS_SCOPES.productSetPrice,
  summary: "Set the base price of a product (satang). Linked menu, web shop and accounting prices follow from the same write.",
  label: "ตั้งราคาสินค้า",
  test: "products.setPrice",
  input: z.object({ unitId: unitIdOpt, priceSatang: satang.describe("New base price in satang.") }).strict(),
  auditTarget: productTarget,
  async handler({ actor, params, input }) {
    await posProductUnit(actor, params.id ?? "", input.unitId, false);
    return catalogCall(() => setPrice(posCatalogCtxOf(actor), params.id ?? "", input.priceSatang));
  },
});

const productsArchive = definePosOp({
  id: "products.archive",
  method: "POST",
  path: "/products/{id}/archive",
  kind: "danger",
  action: POS_SCOPES.productManage,
  summary: "Stop selling a product (archive). Old bills keep their lines; the product can be restored from the app.",
  label: "เลิกขายสินค้า",
  test: "products.archive",
  input: z.object({ reason: z.string().trim().min(5).max(500).describe("Why it is archived. Stored in the audit log."), unitId: unitIdOpt }).strict(),
  auditTarget: productTarget,
  async handler({ actor, params, input }) {
    await posProductUnit(actor, params.id ?? "", input.unitId, false);
    return catalogCall(() => archive(posCatalogCtxOf(actor), params.id ?? ""));
  },
});

const productsAvailability = definePosOp({
  id: "products.availability",
  method: "POST",
  path: "/products/{id}/availability",
  kind: "write",
  action: POS_SCOPES.saleCreate,
  summary: "Mark a product sold out (86) or back on sale at a branch. The register, kitchen screens and channels see it at once; emits pos.product.availability when it flips.",
  label: "แจ้งของหมด / คืนขาย",
  test: "products.availability",
  input: z
    .object({
      unitId: unitIdOpt,
      available: z.boolean().describe("false = sold out (86) · true = back on sale."),
      note: z.string().trim().max(200).optional().describe("Note for the staff."),
    })
    .strict(),
  auditTarget: productTarget,
  async handler({ actor, params, input }) {
    const unitId = (await posProductUnit(actor, params.id ?? "", input.unitId, true))!;
    // POS P2.14 ▸ API-8 (A9): คำตอบรูปคงที่ — ไม่ผ่าน posData (ผลฟิลด์เดียว = ค่าเปล่า · หลายฟิลด์ = วัตถุ ⇒ รูปเปลี่ยนตามผล) ◂
    const r = posResult(
      await setAvailability({ tenantId: actor.tenantId, systemId: actor.systemId, unitId }, posRegisterActorOf(actor), {
        productId: params.id ?? "",
        unitId,
        available: input.available,
        source: "MANUAL",
        ...(input.note ? { note: input.note } : {}),
      }),
    );
    return { changed: r.changed, available: r.available };
  },
});

export const PRODUCTS_OPS: ApiOp[] = [productsList, productsLookup, productsOptions, productsCreate, productsUpdate, productsSetPrice, productsArchive, productsAvailability];
