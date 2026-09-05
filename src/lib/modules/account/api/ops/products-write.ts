// ops/products-write.ts — WRITE ของสินค้า/หน่วย/หมวดหมู่/จัดชุด/ยอดยกมา/ผูกคลัง/เอกสารสต็อก (WO C3)
//
// 15 op: สินค้า (สร้าง/แก้/ปิดใช้งาน/จัดชุด/ยอดยกมา/ผูก-เลิกผูกคลัง) · หน่วยนับ (CRUD) ·
//        หมวดหมู่ (CRUD) · เอกสารสต็อก (ใบเบิก/ใบส่งคืน/ใบปรับต้นทุน — สร้าง/อนุมัติ)
//
// 🔴 กติกาของชั้นนี้ (เหมือน `contacts-write.ts`/`documents-write.ts`):
//   1) ห้ามแตะ prisma ตรง ๆ — เรียกผ่าน service เท่านั้น (fitness F5) · ผลลัพธ์ผ่าน `../serialize-master.ts`
//   2) `products.update` — `updateProduct` เขียนทับฟิลด์หลัก 10 ช่อง (sku/name/nameEn/type/unitId/salePrice/
//      buyPrice/vatRateBp/incomeAccountId/expenseAccountId/imageUrl) **เสมอ** ไม่ว่าผู้เรียกส่งมาหรือไม่
//      (ไม่ใช่ partial merge ในตัวมันเอง) ⇒ ต้องโหลดของเดิมด้วย `getProduct` มาเป็นฐานก่อนค่อยทับด้วยที่
//      ผู้เรียกส่งมาจริง มิฉะนั้นฟิลด์ที่ไม่ได้ส่งจะถูกล้างเป็นค่าเริ่มต้น (ตาม comment ในฟังก์ชันนั้น)
//   3) เงินเป็นสตางค์จำนวนเต็มเสมอ (decimal ต้องตกที่ zod `.int()` เป็น 422 ก่อนถึง service เลย)

import { AccountDocType } from "@prisma/client";
import { z } from "zod";
import { ERR } from "../../errors";
import {
  addOpeningLot,
  approveGoodsMovement,
  archiveCategory,
  archiveProduct,
  archiveUnit,
  categoryAppliesTo,
  checkProductDuplicates,
  createCategory,
  createCostAdjustment,
  createGoodsMovement,
  createProduct,
  createUnit,
  getCategory,
  getProduct,
  getUnit,
  listUnits,
  renameUnit,
  setBundleItems,
  unitUsageCount,
  updateCategory,
  updateProduct,
  type ProductInput,
} from "../../product";
import { linkProductToItem, productStockMap, unlinkProductFromItem, type LinkOptions } from "../../inventory-link";
import { defineOp, type ApiOp } from "../op";
import { ApiError } from "../respond";
import { categoryView, productRow, unitView } from "../serialize-master";

// ── ตัวช่วยร่วม ─────────────────────────────────────────────────────────────

const YMD = /^\d{4}-\d{2}-\d{2}$/;
const ymdField = (what: string) =>
  z
    .string()
    .regex(YMD, `${what} ต้องเป็นวันที่รูปแบบ YYYY-MM-DD`)
    .describe(`${what} (Thai calendar day, YYYY-MM-DD).`);

/** `YYYY-MM-DD` → Date เที่ยงคืน UTC — วิธีเดียวกับ `documents-write.ts` */
function dayToDate(day: string): Date {
  return new Date(`${day}T00:00:00.000Z`);
}

function notFoundProduct(): ApiError {
  return new ApiError(404, "not_found", ERR.PRODUCT_NOT_FOUND, "No such product in this accounting book.");
}
function notFoundUnit(): ApiError {
  return new ApiError(404, "not_found", "ไม่พบหน่วยนับนี้", "No such unit in this accounting book.");
}
function notFoundCategory(): ApiError {
  return new ApiError(404, "not_found", "ไม่พบหมวดหมู่นี้", "No such category in this accounting book.");
}
function notFoundStockDoc(): ApiError {
  return new ApiError(404, "not_found", ERR.DOC_NOT_FOUND, "No such stock document in this accounting book.");
}

/** ผลลัพธ์ `{ ok:false, reason }` ของ service → error ที่ `mapError` แปลต่อได้ (ข้อความไทยเดิม) */
function failWith(reason: string): never {
  throw new Error(reason);
}

const noBody = z.object({}).strict();

// ── ตัวแปลงคำตอบของสินค้า ────────────────────────────────────────────────────

async function productWriteRow(tenantId: string, systemId: string, id: string) {
  const p = await getProduct(tenantId, systemId, id);
  if (!p) throw notFoundProduct();
  const units = await listUnits(tenantId, systemId, { includeArchived: true });
  const unitName = p.unitId ? (units.find((u) => u.id === p.unitId)?.name ?? null) : null;
  const stockMap = await productStockMap(
    { tenantId, systemId },
    [{ id: p.id, invItemId: p.invItemId, qtyOnHand: p.qtyOnHand }],
  );
  return productRow({
    id: p.id,
    code: p.code,
    sku: p.sku,
    name: p.name,
    type: p.type,
    unitName,
    category: p.category,
    salePrice: p.salePrice,
    buyPrice: p.buyPrice,
    stock: stockMap.get(p.id) ?? Number(p.qtyOnHand),
    invItemId: p.invItemId,
    archivedAt: p.archivedAt,
  });
}

/** ฟิลด์หลัก 10 ช่องที่ `updateProduct` เขียนทับเสมอ — โหลดจากแถวเดิมมาเป็นฐานก่อนทับด้วยของผู้เรียก */
function productCoreFromRow(p: {
  sku: string | null;
  name: string;
  nameEn: string | null;
  type: ProductInput["type"];
  unitId: string | null;
  salePrice: number | null;
  buyPrice: number | null;
  vatRateBp: number;
  incomeAccountId: string | null;
  expenseAccountId: string | null;
  imageUrl: string | null;
}): ProductInput {
  return {
    sku: p.sku,
    name: p.name,
    nameEn: p.nameEn,
    type: p.type,
    unitId: p.unitId,
    salePrice: p.salePrice,
    buyPrice: p.buyPrice,
    vatRateBp: p.vatRateBp,
    incomeAccountId: p.incomeAccountId,
    expenseAccountId: p.expenseAccountId,
    imageUrl: p.imageUrl,
  };
}

type ProductWritePayload = {
  type?: "GOODS" | "SERVICE" | "BUNDLE";
  name?: string;
  nameEn?: string | null;
  sku?: string | null;
  code?: string | null;
  barcode?: string | null;
  unitId?: string | null;
  category?: string | null;
  description?: string | null;
  salePriceSatang?: number | null;
  buyPriceSatang?: number | null;
  vatRateBp?: number;
  purchaseVatRateBp?: number | null;
  incomeAccountId?: string | null;
  expenseAccountId?: string | null;
  cogsAccountCode?: string | null;
  inventoryAccountCode?: string | null;
  imageUrl?: string | null;
  defaultWhtType?: string | null;
  defaultWhtRateBp?: number | null;
};

/** คำขอของ REST (`…Satang`) → `ProductInput` ของ service — ทับเฉพาะคีย์ที่ผู้เรียกส่งมาจริงเหนือฐานที่ให้มา */
function toProductInput(input: ProductWritePayload, base: ProductInput = {} as ProductInput): ProductInput {
  return {
    ...base,
    ...(input.name !== undefined ? { name: input.name } : {}),
    ...(input.nameEn !== undefined ? { nameEn: input.nameEn } : {}),
    ...(input.type !== undefined ? { type: input.type } : {}),
    ...(input.sku !== undefined ? { sku: input.sku } : {}),
    ...(input.code !== undefined ? { code: input.code } : {}),
    ...(input.barcode !== undefined ? { barcode: input.barcode } : {}),
    ...(input.unitId !== undefined ? { unitId: input.unitId } : {}),
    ...(input.category !== undefined ? { category: input.category } : {}),
    ...(input.description !== undefined ? { description: input.description } : {}),
    ...(input.salePriceSatang !== undefined ? { salePrice: input.salePriceSatang } : {}),
    ...(input.buyPriceSatang !== undefined ? { buyPrice: input.buyPriceSatang } : {}),
    ...(input.vatRateBp !== undefined ? { vatRateBp: input.vatRateBp } : {}),
    ...(input.purchaseVatRateBp !== undefined ? { purchaseVatRateBp: input.purchaseVatRateBp } : {}),
    ...(input.incomeAccountId !== undefined ? { incomeAccountId: input.incomeAccountId } : {}),
    ...(input.expenseAccountId !== undefined ? { expenseAccountId: input.expenseAccountId } : {}),
    ...(input.cogsAccountCode !== undefined ? { cogsAccountCode: input.cogsAccountCode } : {}),
    ...(input.inventoryAccountCode !== undefined ? { inventoryAccountCode: input.inventoryAccountCode } : {}),
    ...(input.imageUrl !== undefined ? { imageUrl: input.imageUrl } : {}),
    ...(input.defaultWhtType !== undefined ? { defaultWhtType: input.defaultWhtType } : {}),
    ...(input.defaultWhtRateBp !== undefined ? { defaultWhtRateBp: input.defaultWhtRateBp } : {}),
  };
}

const vatRateBpField = z.number().int().min(-1).max(10000);

const productCreateInput = z
  .object({
    type: z.enum(["GOODS", "SERVICE", "BUNDLE"]),
    name: z.string().min(1).max(100),
    nameEn: z.string().max(100).nullish(),
    sku: z.string().max(64).nullish(),
    code: z.string().max(30).nullish(),
    barcode: z.string().max(48).nullish(),
    unitId: z.string().max(40).nullish(),
    category: z.string().max(80).nullish(),
    description: z.string().max(500).nullish(),
    salePriceSatang: z.number().int().min(0).nullish().describe("Sale price in satang (integer). 1,500.00 baht is 150000."),
    buyPriceSatang: z.number().int().min(0).nullish().describe("Cost/buy price in satang (integer)."),
    vatRateBp: vatRateBpField.optional().describe("VAT rate in basis points: 700 = 7%, 0 = zero rated, -1 = exempt. Default 700."),
    purchaseVatRateBp: vatRateBpField.nullish().describe("Purchase VAT rate. Null uses vatRateBp."),
    incomeAccountId: z.string().max(40).nullish(),
    expenseAccountId: z.string().max(40).nullish(),
    cogsAccountCode: z.string().max(20).nullish(),
    inventoryAccountCode: z.string().max(20).nullish(),
    trackStock: z.boolean().optional().describe("Accepted for forward compatibility; use POST /products/{id}/link-inventory to actually track stock in a warehouse."),
    imageUrl: z.string().max(2000).nullish(),
    defaultWhtType: z.string().max(20).nullish(),
    defaultWhtRateBp: z.number().int().min(0).max(10000).nullish(),
  })
  .strict();

const productUpdateInput = productCreateInput.partial().strict();

// ── 1. สร้าง / แก้ไข / ปิดใช้งาน ────────────────────────────────────────────

const productsCreate = defineOp({
  id: "products.create",
  method: "POST",
  path: "/products",
  kind: "write",
  action: "account.product.manage",
  summary: "Create a good, service or bundle. A matching SKU returns 409.",
  label: "สร้างสินค้า/บริการ",
  input: productCreateInput,
  test: "C3-M3.1",
  async handler({ actor, input }) {
    const { tenantId, systemId } = actor;
    const dups = await checkProductDuplicates(tenantId, systemId, { name: input.name, sku: input.sku ?? null });
    const skuDup = dups.find((d) => d.reason === "sku");
    if (skuDup) {
      throw new ApiError(
        409,
        "duplicate",
        `รหัสสินค้า (SKU) นี้ซ้ำกับ ${skuDup.code ?? skuDup.id}`,
        "A product with this SKU already exists.",
        skuDup.id,
      );
    }
    // trackStock ใน body รับไว้เพื่อความเข้ากันได้ของสัญญาเท่านั้น — การผูกคลังจริงทำผ่าน
    // products.link-inventory แยกต่างหาก (ผูกตอนสร้างมีเงื่อนไขมากกว่านี้ เช่นต้องมีระบบคลังก่อน)
    const res = await createProduct(tenantId, systemId, toProductInput(input));
    if (!res.ok) failWith(res.reason);
    return productWriteRow(tenantId, systemId, res.id);
  },
});

const productsUpdate = defineOp({
  id: "products.update",
  method: "PATCH",
  path: "/products/{id}",
  kind: "write",
  action: "account.product.manage",
  summary: "Change a product. Only the fields that are sent are changed; the rest keep their current value.",
  label: "แก้ไขสินค้า/บริการ",
  input: productUpdateInput,
  test: "C3-M3.5",
  async handler({ actor, params, input }) {
    const { tenantId, systemId } = actor;
    const id = params.id ?? "";
    const current = await getProduct(tenantId, systemId, id);
    if (!current) throw notFoundProduct();
    const merged = toProductInput(input, productCoreFromRow(current));
    const res = await updateProduct(tenantId, systemId, id, merged);
    if (!res.ok) failWith(res.reason);
    return productWriteRow(tenantId, systemId, id);
  },
});

const productsArchive = defineOp({
  id: "products.archive",
  method: "DELETE",
  path: "/products/{id}",
  kind: "write",
  action: "account.product.manage",
  summary: "Deactivate a product/service/bundle (soft delete). Past documents keep referencing it.",
  label: "ปิดใช้งานสินค้า/บริการ",
  input: noBody,
  test: "C3-M4.9",
  async handler({ actor, params }) {
    const { tenantId, systemId } = actor;
    const id = params.id ?? "";
    if (!(await getProduct(tenantId, systemId, id))) throw notFoundProduct();
    await archiveProduct(tenantId, systemId, id);
    return { id, archived: true };
  },
});

// ── 2. จัดชุด / ยอดยกมา ─────────────────────────────────────────────────────

const bundleItemInput = z
  .object({
    componentProductId: z.string().min(1).max(40),
    qty: z.number().positive().max(1_000_000),
    unitId: z.string().max(40).nullish(),
  })
  .strict();

const setBundleInput = z.object({ items: z.array(bundleItemInput).max(200) }).strict();

const productsSetBundle = defineOp({
  id: "products.set-bundle",
  method: "PUT",
  path: "/products/{id}/bundle",
  kind: "write",
  action: "account.product.manage",
  summary: "Replace the recipe of a bundle product with the given components and quantities.",
  label: "ตั้งสูตรรายการจัดชุด",
  input: setBundleInput,
  test: "C3-M3.6",
  async handler({ actor, params, input }) {
    const { tenantId, systemId } = actor;
    const id = params.id ?? "";
    const res = await setBundleItems(
      tenantId,
      systemId,
      id,
      input.items.map((i) => ({ componentProductId: i.componentProductId, qty: i.qty, unitId: i.unitId ?? null })),
    );
    if (!res.ok) failWith(res.reason);
    return { count: res.count };
  },
});

const openingLotInput = z
  .object({
    date: ymdField("date"),
    qty: z.number().positive().max(1_000_000_000),
    unitCostSatang: z.number().int().min(0),
    warehouseId: z.string().max(40).nullish(),
  })
  .strict();

const productsAddOpeningLot = defineOp({
  id: "products.add-opening-lot",
  method: "POST",
  path: "/products/{id}/opening-lots",
  kind: "write",
  action: "account.product.manage",
  summary: "Add an opening balance lot: receives the quantity into stock at the given unit cost and posts the opening journal entry.",
  label: "เพิ่มยอดยกมา",
  input: openingLotInput,
  test: "C3-M3.8",
  async handler({ actor, params, input }) {
    const { tenantId, systemId } = actor;
    const id = params.id ?? "";
    const res = await addOpeningLot(tenantId, systemId, id, {
      lotDate: input.date,
      qty: input.qty,
      unitCost: input.unitCostSatang,
      warehouseId: input.warehouseId ?? null,
    });
    if (!res.ok) failWith(res.reason);
    return { id: res.id, seq: res.seq, amountSatang: res.amount };
  },
});

// ── 3. ผูก/เลิกผูกคลังสินค้า ─────────────────────────────────────────────────

const linkInventoryInput = z
  .object({
    itemId: z.string().max(40).optional().describe("Id of an existing item in the warehouse module to link to."),
    createItem: z
      .object({
        warehouseId: z.string().max(40).nullish(),
        reorderPoint: z.number().int().min(0).nullish(),
        sku: z.string().max(64).nullish(),
      })
      .strict()
      .optional()
      .describe("Create a new warehouse item from this product's data instead of linking an existing one."),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (!v.itemId && !v.createItem) {
      ctx.addIssue({ code: "custom", path: ["itemId"], message: "ต้องระบุ itemId หรือ createItem อย่างใดอย่างหนึ่ง" });
    }
  });

const productsLinkInventory = defineOp({
  id: "products.link-inventory",
  method: "POST",
  path: "/products/{id}/link-inventory",
  kind: "write",
  action: "account.product.manage",
  summary: "Link this product to a warehouse item (existing or newly created) so its stock is tracked there.",
  label: "ผูกกับคลังสินค้า",
  input: linkInventoryInput,
  test: "C3-M4.8",
  async handler({ actor, params, input }) {
    const { tenantId, systemId } = actor;
    const id = params.id ?? "";
    const opts: LinkOptions = input.itemId
      ? { itemId: input.itemId }
      : {
          createItem: {
            warehouseId: input.createItem?.warehouseId ?? null,
            reorderPoint: input.createItem?.reorderPoint ?? null,
            sku: input.createItem?.sku ?? null,
          },
        };
    const res = await linkProductToItem({ tenantId, systemId }, id, opts);
    if (!res.ok) failWith(res.reason);
    return { ok: true, itemId: res.itemId };
  },
});

const productsUnlinkInventory = defineOp({
  id: "products.unlink-inventory",
  method: "DELETE",
  path: "/products/{id}/link-inventory",
  kind: "write",
  action: "account.product.manage",
  summary: "Unlink this product from its warehouse item. The last known quantity is frozen onto the product itself.",
  label: "เลิกผูกกับคลังสินค้า",
  input: noBody,
  // ไม่มีข้อสอบพฤติกรรมเฉพาะใน C3 (oracle ยังไม่มี call ตรง) — ครอบด้วย C3-M5.2 (ทะเบียน id/kind/action)
  test: "C3-M5.2",
  async handler({ actor, params }) {
    const { tenantId, systemId } = actor;
    const id = params.id ?? "";
    const res = await unlinkProductFromItem({ tenantId, systemId }, id);
    if (!res.ok) failWith(res.reason);
    return { changed: res.changed };
  },
});

// ── 4. หน่วยนับ ──────────────────────────────────────────────────────────────

async function unitWriteRow(tenantId: string, systemId: string, id: string) {
  const u = await getUnit(tenantId, systemId, id);
  if (!u) throw notFoundUnit();
  return unitView(u);
}

const unitFields = {
  name: z.string().min(1).max(20),
  nameEn: z.string().max(40).nullish(),
  kind: z.enum(["PRODUCT", "SERVICE"]).optional(),
  code: z.string().max(20).nullish(),
} as const;

const unitCreateInput = z.object(unitFields).strict();

const unitsCreate = defineOp({
  id: "units.create",
  method: "POST",
  path: "/units",
  kind: "write",
  action: "account.product.manage",
  summary: "Create a unit of measure. A matching name or code returns 409/422.",
  label: "สร้างหน่วยนับ",
  input: unitCreateInput,
  test: "C3-M2.1",
  async handler({ actor, input }) {
    const { tenantId, systemId } = actor;
    const res = await createUnit(tenantId, systemId, input.name, { nameEn: input.nameEn, kind: input.kind, code: input.code });
    if (!res.ok) failWith(res.reason);
    return unitWriteRow(tenantId, systemId, res.id);
  },
});

const unitsUpdate = defineOp({
  id: "units.update",
  method: "PATCH",
  path: "/units/{id}",
  kind: "write",
  action: "account.product.manage",
  summary: "Rename a unit of measure or change its code/kind.",
  label: "แก้ไขหน่วยนับ",
  input: unitCreateInput,
  test: "C3-M2.3",
  async handler({ actor, params, input }) {
    const { tenantId, systemId } = actor;
    const id = params.id ?? "";
    if (!(await getUnit(tenantId, systemId, id))) throw notFoundUnit();
    const res = await renameUnit(tenantId, systemId, id, input.name, { nameEn: input.nameEn, kind: input.kind, code: input.code });
    if (!res.ok) failWith(res.reason);
    return unitWriteRow(tenantId, systemId, id);
  },
});

const unitsArchive = defineOp({
  id: "units.archive",
  method: "DELETE",
  path: "/units/{id}",
  kind: "write",
  action: "account.product.manage",
  summary: "Deactivate a unit of measure. Units still used by an active product cannot be deactivated.",
  label: "ปิดใช้งานหน่วยนับ",
  input: noBody,
  test: "C3-M4.10",
  async handler({ actor, params }) {
    const { tenantId, systemId } = actor;
    const id = params.id ?? "";
    const unit = await getUnit(tenantId, systemId, id);
    if (!unit) throw notFoundUnit();
    const usage = await unitUsageCount(systemId);
    if ((usage.get(id) ?? 0) > 0) {
      throw new ApiError(
        409,
        "state_conflict",
        `หน่วยนับนี้ถูกใช้กับสินค้าที่ใช้งานอยู่ ${usage.get(id)} รายการ — ปิดใช้งานไม่ได้`,
        "This unit is used by active products and cannot be deactivated.",
      );
    }
    await archiveUnit(tenantId, systemId, id);
    return unitWriteRow(tenantId, systemId, id);
  },
});

// ── 5. หมวดหมู่ ──────────────────────────────────────────────────────────────

async function categoryWriteRow(tenantId: string, systemId: string, id: string) {
  const c = await getCategory(tenantId, systemId, id);
  if (!c) throw notFoundCategory();
  return categoryView(c, categoryAppliesTo(c.appliesTo));
}

const categoryCreateInput = z
  .object({
    name: z.string().min(1).max(60),
    appliesTo: z.array(z.nativeEnum(AccountDocType)).max(30).optional(),
  })
  .strict();

const categoryUpdateInput = z
  .object({
    name: z.string().min(1).max(60).optional(),
    appliesTo: z.array(z.nativeEnum(AccountDocType)).max(30).optional(),
  })
  .strict();

const categoriesCreate = defineOp({
  id: "categories.create",
  method: "POST",
  path: "/categories",
  kind: "write",
  action: "account.product.manage",
  summary: "Create a product/document category.",
  label: "สร้างหมวดหมู่",
  input: categoryCreateInput,
  test: "C3-M2.4",
  async handler({ actor, input }) {
    const { tenantId, systemId } = actor;
    const res = await createCategory(tenantId, systemId, { name: input.name, appliesTo: input.appliesTo });
    if (!res.ok) failWith(res.reason);
    return categoryWriteRow(tenantId, systemId, res.id);
  },
});

const categoriesUpdate = defineOp({
  id: "categories.update",
  method: "PATCH",
  path: "/categories/{id}",
  kind: "write",
  action: "account.product.manage",
  summary: "Rename a category or change which document types it applies to.",
  label: "แก้ไขหมวดหมู่",
  input: categoryUpdateInput,
  test: "C3-M2.5",
  async handler({ actor, params, input }) {
    const { tenantId, systemId } = actor;
    const id = params.id ?? "";
    if (!(await getCategory(tenantId, systemId, id))) throw notFoundCategory();
    await updateCategory(tenantId, systemId, id, { name: input.name, appliesTo: input.appliesTo });
    return categoryWriteRow(tenantId, systemId, id);
  },
});

const categoriesArchive = defineOp({
  id: "categories.archive",
  method: "DELETE",
  path: "/categories/{id}",
  kind: "write",
  action: "account.product.manage",
  summary: "Deactivate a category.",
  label: "ปิดใช้งานหมวดหมู่",
  input: noBody,
  test: "C3-M2.5",
  async handler({ actor, params }) {
    const { tenantId, systemId } = actor;
    const id = params.id ?? "";
    if (!(await getCategory(tenantId, systemId, id))) throw notFoundCategory();
    await archiveCategory(tenantId, systemId, id);
    return categoryWriteRow(tenantId, systemId, id);
  },
});

// ── 6. เอกสารสต็อก (ใบเบิก/ใบส่งคืน/ใบปรับต้นทุน) ────────────────────────────

const stockLineInput = z
  .object({
    productId: z.string().min(1).max(40),
    qty: z.number().positive().max(1_000_000),
    description: z.string().max(300).nullish(),
    locationId: z.string().max(40).nullish(),
  })
  .strict();

const stockDocCreateInput = z
  .object({
    type: z.enum(["GOODS_ISSUE", "GOODS_ISSUE_RETURN", "COST_ADJUSTMENT"]),
    issueDate: ymdField("issueDate").optional(),
    reason: z.string().max(300).nullish(),
    note: z.string().max(2000).nullish(),
    reference: z.string().max(35).nullish(),
    contactId: z.string().max(40).nullish(),
    sourceDocId: z.string().max(40).nullish(),
    allowNegative: z.boolean().optional(),
    asDraft: z.boolean().optional(),
    adjustAccountCode: z.string().max(20).nullish(),
    tags: z.array(z.string().max(30)).max(10).optional(),
    lines: z.array(stockLineInput).max(200).optional().describe("Required for GOODS_ISSUE / GOODS_ISSUE_RETURN."),
    productId: z.string().max(40).optional().describe("Required for COST_ADJUSTMENT."),
    newCostSatang: z.number().int().min(0).optional().describe("Required for COST_ADJUSTMENT."),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (v.type === "COST_ADJUSTMENT") {
      if (!v.productId) ctx.addIssue({ code: "custom", path: ["productId"], message: "ต้องระบุ productId สำหรับใบปรับต้นทุน" });
      if (v.newCostSatang === undefined) ctx.addIssue({ code: "custom", path: ["newCostSatang"], message: "ต้องระบุ newCostSatang สำหรับใบปรับต้นทุน" });
    } else if (!v.lines || v.lines.length === 0) {
      ctx.addIssue({ code: "custom", path: ["lines"], message: "ต้องมีรายการสินค้าอย่างน้อย 1 รายการ" });
    }
  });

const stockDocumentsCreate = defineOp({
  id: "stock-documents.create",
  method: "POST",
  path: "/stock-documents",
  kind: "write",
  action: "account.product.manage",
  summary: "Create a goods issue, goods issue return, or cost adjustment document. Goods issue/return post immediately unless asDraft is true.",
  label: "สร้างเอกสารสต็อก",
  input: stockDocCreateInput,
  test: "C3-M4.1",
  async handler({ actor, input }) {
    const { tenantId, systemId } = actor;
    if (input.type === "COST_ADJUSTMENT") {
      const res = await createCostAdjustment({
        tenantId,
        systemId,
        productId: input.productId as string,
        newCostSatang: input.newCostSatang as number,
        issueDate: input.issueDate ? dayToDate(input.issueDate) : undefined,
        reason: input.reason ?? null,
        adjustAccountCode: input.adjustAccountCode ?? null,
        note: input.note ?? null,
        asDraft: input.asDraft,
      });
      if (!res.ok) failWith(res.reason);
      return { id: res.id, docNo: res.docNo, oldCostSatang: res.oldCost, newCostSatang: res.newCost, deltaSatang: res.delta };
    }
    const res = await createGoodsMovement({
      tenantId,
      systemId,
      docType: input.type,
      issueDate: input.issueDate ? dayToDate(input.issueDate) : undefined,
      contactId: input.contactId ?? null,
      note: input.note ?? null,
      lines: (input.lines ?? []).map((l) => ({
        productId: l.productId,
        qty: l.qty,
        description: l.description ?? null,
        locationId: l.locationId ?? null,
      })),
      allowNegative: input.allowNegative,
      sourceDocId: input.sourceDocId ?? null,
      adjustReason: input.reason ?? null,
      adjustAccountCode: input.adjustAccountCode ?? null,
      reference: input.reference ?? null,
      asDraft: input.asDraft,
      tags: input.tags ?? [],
    });
    if (!res.ok) failWith(res.reason);
    return { id: res.id, docNo: res.docNo, type: input.type, status: input.asDraft ? "DRAFT" : "ISSUED" };
  },
});

const stockDocApproveInput = z.object({ allowNegative: z.boolean().optional() }).strict();

const stockDocumentsApprove = defineOp({
  id: "stock-documents.approve",
  method: "POST",
  path: "/stock-documents/{id}/approve",
  kind: "write",
  action: "account.product.manage",
  summary: "Approve a draft goods issue/return: it takes the next document number, moves the stock and posts to the ledger.",
  label: "อนุมัติเอกสารสต็อก",
  input: stockDocApproveInput,
  test: "C3-M4.4",
  async handler({ actor, params, input }) {
    const { tenantId, systemId } = actor;
    const id = params.id ?? "";
    const res = await approveGoodsMovement(tenantId, systemId, id, { allowNegative: input.allowNegative });
    if (!res.ok) {
      if (res.reason.startsWith("ไม่พบ")) throw notFoundStockDoc();
      failWith(res.reason);
    }
    return { id, docNo: res.docNo, status: "ISSUED" };
  },
});

export const PRODUCTS_WRITE_OPS: ApiOp[] = [
  productsCreate,
  productsUpdate,
  productsArchive,
  productsSetBundle,
  productsAddOpeningLot,
  productsLinkInventory,
  productsUnlinkInventory,
  unitsCreate,
  unitsUpdate,
  unitsArchive,
  categoriesCreate,
  categoriesUpdate,
  categoriesArchive,
  stockDocumentsCreate,
  stockDocumentsApprove,
];
