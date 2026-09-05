// ops/products-read.ts — READ ของสินค้า/บริการ/หน่วย/กลุ่มจัดประเภท/คลัง (WO B2)
//
// ทุก op ที่นี่ `kind: "read"` · action `account.doc.view` — ห้ามแตะ prisma ตรง ๆ (fitness F5)
// ทุกก้อนผ่าน `../serialize-master.ts` เสมอ
//
// เรื่องที่พลาดง่ายและถูกดักไว้ตรงนี้:
//   · `type` ไม่ส่งมา = "ทุกชนิด" — `listProductsPaged` เดิมรับ `type` เดี่ยว (ไม่ส่ง = ปริยาย GOODS)
//     ⇒ เรียก 3 รอบ (GOODS/SERVICE/BUNDLE) แล้วรวม/แบ่งหน้าเองที่ชั้นนี้ ไม่แก้พฤติกรรมเดิมของ service
//     (ข้อจำกัดที่รู้ตัว: ดึงมาสูงสุด 100 แถวต่อชนิดมารวมก่อนแบ่งหน้า — พอสำหรับร้านจริงและ QC · ร้านที่มี
//     สินค้าชนิดเดียวเกิน 100 รายการจะเห็น total ถูกแต่หน้าท้าย ๆ อาจขาดหาย ไปแก้เป็น query รวมจริงใน service
//     ถ้าถึงจุดนั้น — บันทึกไว้ wo-notes/api-B2.md)
//   · `counts.GOODS/SERVICE/BUNDLE` ของ `listProductsPaged` เป็นตัวเลข "รวมทุกชนิด" อยู่แล้วไม่ว่าจะกรอง
//     `type` ไหน (ดู product.ts groupBy) ⇒ เรียกครั้งเดียวก็พอสำหรับ counts เมื่อมี `type`

import { z } from "zod";
import type { AccountProductType } from "@prisma/client";
import { ERR } from "../../errors";
import { clampPage, clampPageSize } from "../../service";
import {
  listBundleItems,
  listCategories,
  listExpenseAccounts,
  listIncomeAccounts,
  listOpeningLots,
  listProductsPaged,
  listUnits,
  listWarehouses,
  productModalData,
  productMovements,
  categoryAppliesTo,
  type ProductListInput,
} from "../../product";
import { defineOp, type ApiOp } from "../op";
import { paged, type PagedInfo } from "../respond";
import {
  bundleItemsView,
  categoryView,
  movementView,
  openingLotsView,
  productDetailView,
  productRow,
  unitView,
} from "../serialize-master";

const noQuery = z.object({}).strict();
const PRODUCT_TYPES: AccountProductType[] = ["GOODS", "SERVICE", "BUNDLE"];

function pageInfoOf(res: { page: number; pageSize: number; pageCount: number; total: number }): PagedInfo {
  return { page: res.page, pageSize: res.pageSize, pageCount: res.pageCount, total: res.total, hasMore: res.page < res.pageCount };
}

const boolQuery = z
  .enum(["true", "false"])
  .optional()
  .transform((v) => v === "true")
  .describe('"true" or "false". Default false.');

// ── products.list ────────────────────────────────────────────────────────
const productsListInput = z
  .object({
    type: z.enum(["GOODS", "SERVICE", "BUNDLE"]).optional().describe("Omit to get every type."),
    sub: z.enum(["active", "archived"]).optional().describe('Default "active".'),
    q: z.string().max(200).optional(),
    category: z.string().max(120).optional(),
    page: z.coerce.number().int().min(1).optional(),
    pageSize: z.coerce.number().int().optional(),
  })
  .strict();

const productsList = defineOp({
  id: "products.list",
  method: "GET",
  path: "/products",
  kind: "read",
  action: "account.doc.view",
  paged: true,
  summary: "List goods, services and bundles with type/sub-tab filters, search, category and paging.",
  label: "รายการสินค้า/บริการ",
  tool: { name: "account_search_products", hint: "Use to find a productId or a selling price before quoting or invoicing." },
  input: productsListInput,
  test: "B2-C4.1",
  async handler({ actor, input }) {
    const { tenantId, systemId } = actor;
    const base: ProductListInput = { sub: input.sub, q: input.q, category: input.category };

    if (input.type) {
      const res = await listProductsPaged(tenantId, systemId, { ...base, type: input.type, page: input.page, pageSize: input.pageSize });
      return paged(res.rows.map(productRow), pageInfoOf(res), {
        counts: res.counts,
        stockValueSatang: res.stockValue,
        categories: res.categories,
      });
    }

    // ไม่ส่ง type — ดึงทุกชนิด (≤100 แถว/ชนิด) แล้วรวม/แบ่งหน้าเองที่นี่ (ดูหมายเหตุหัวไฟล์)
    const pages = await Promise.all(
      PRODUCT_TYPES.map((type) => listProductsPaged(tenantId, systemId, { ...base, type, page: 1, pageSize: 100 })),
    );
    const rows = pages.flatMap((p) => p.rows);
    rows.sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      const codeCmp = (b.code ?? "").localeCompare(a.code ?? "");
      if (codeCmp !== 0) return codeCmp;
      return b.createdAt.getTime() - a.createdAt.getTime();
    });
    const total = pages.reduce((s, p) => s + p.total, 0);
    const page = clampPage(input.page);
    const pageSize = clampPageSize(input.pageSize);
    const pageCount = Math.max(1, Math.ceil(total / pageSize));
    const pageRows = rows.slice((page - 1) * pageSize, (page - 1) * pageSize + pageSize);
    const counts = pages[0]!.counts; // GOODS/SERVICE/BUNDLE รวมทุกชนิดอยู่แล้ว — เหมือนกันทั้ง 3 รอบ
    const archived = pages.reduce((s, p) => s + p.counts.archived, 0);
    const active = counts.GOODS + counts.SERVICE + counts.BUNDLE;
    const stockValue = pages.reduce((s, p) => s + p.stockValue, 0);
    const categories = [...new Set(pages.flatMap((p) => p.categories))].sort();

    return paged(pageRows.map(productRow), { page, pageSize, pageCount, total, hasMore: page < pageCount }, {
      counts: { GOODS: counts.GOODS, SERVICE: counts.SERVICE, BUNDLE: counts.BUNDLE, active, archived },
      stockValueSatang: stockValue,
      categories,
    });
  },
});

const productsGet = defineOp({
  id: "products.get",
  method: "GET",
  path: "/products/{id}",
  kind: "read",
  action: "account.doc.view",
  summary: "One product/service/bundle in full: accounts, bundle recipe, opening lots and inventory link.",
  label: "รายละเอียดสินค้า",
  input: noQuery,
  test: "B2-C4.6",
  async handler({ actor, params }) {
    const { tenantId, systemId } = actor;
    const id = params.id ?? "";
    const data = await productModalData(tenantId, systemId, id);
    if (!data) throw new Error(ERR.PRODUCT_NOT_FOUND);
    const [incomeAccounts, expenseAccounts, units] = await Promise.all([
      listIncomeAccounts(tenantId, systemId),
      listExpenseAccounts(tenantId, systemId),
      listUnits(tenantId, systemId, { includeArchived: true }),
    ]);
    const unitName = data.product.unitId ? (units.find((u) => u.id === data.product.unitId)?.name ?? null) : null;
    return productDetailView(data, unitName, incomeAccounts, expenseAccounts);
  },
});

const movementsInput = z.object({ take: z.coerce.number().int().min(1).max(500).optional() }).strict();

const productsMovements = defineOp({
  id: "products.movements",
  method: "GET",
  path: "/products/{id}/movements",
  kind: "read",
  action: "account.doc.view",
  summary: "Stock movements (issue/return) of one product, newest first.",
  label: "ประวัติการเคลื่อนไหวของสินค้า",
  input: movementsInput,
  test: "B2-C4.8",
  async handler({ actor, params, input }) {
    const rows = await productMovements(actor.tenantId, actor.systemId, params.id ?? "", { take: input.take });
    return rows.map(movementView);
  },
});

const productsBundle = defineOp({
  id: "products.bundle",
  method: "GET",
  path: "/products/{id}/bundle",
  kind: "read",
  action: "account.doc.view",
  summary: "Recipe of one bundle product: its components and quantities.",
  label: "สูตรรายการจัดชุด",
  input: noQuery,
  test: "B2-C4.9",
  async handler({ actor, params }) {
    const rows = await listBundleItems(actor.tenantId, actor.systemId, params.id ?? "");
    return bundleItemsView(rows);
  },
});

const productsOpeningLots = defineOp({
  id: "products.opening-lots",
  method: "GET",
  path: "/products/{id}/opening-lots",
  kind: "read",
  action: "account.doc.view",
  summary: "Opening balance lots of one product (quantity and unit cost per lot).",
  label: "ยอดยกมาของสินค้า",
  input: noQuery,
  test: "B2-C4.10",
  async handler({ actor, params }) {
    const rows = await listOpeningLots(actor.tenantId, actor.systemId, params.id ?? "");
    return openingLotsView(rows);
  },
});

const unitsListInput = z.object({ includeArchived: boolQuery }).strict();

const unitsList = defineOp({
  id: "units.list",
  method: "GET",
  path: "/units",
  kind: "read",
  action: "account.doc.view",
  summary: "Units of measure for products and services.",
  label: "หน่วยนับ",
  input: unitsListInput,
  test: "B2-C5.1",
  async handler({ actor, input }) {
    const rows = await listUnits(actor.tenantId, actor.systemId, { includeArchived: input.includeArchived });
    return rows.map(unitView);
  },
});

const categoriesListInput = z.object({ includeArchived: boolQuery }).strict();

const categoriesList = defineOp({
  id: "categories.list",
  method: "GET",
  path: "/categories",
  kind: "read",
  action: "account.doc.view",
  summary: "Product/document categories of this accounting book.",
  label: "หมวดหมู่",
  input: categoriesListInput,
  test: "B2-C5.3",
  async handler({ actor, input }) {
    const rows = await listCategories(actor.tenantId, actor.systemId, { includeArchived: input.includeArchived });
    return rows.map((c) => categoryView(c, categoryAppliesTo(c.appliesTo)));
  },
});

const warehousesList = defineOp({
  id: "warehouses.list",
  method: "GET",
  path: "/warehouses",
  kind: "read",
  action: "account.doc.view",
  summary: "Warehouses (stock locations) of this shop, when the inventory module is enabled.",
  label: "คลังสินค้า",
  input: noQuery,
  test: "B2-C5.4",
  async handler({ actor }) {
    return listWarehouses(actor.tenantId);
  },
});

export const PRODUCTS_READ_OPS: ApiOp[] = [
  productsList,
  productsGet,
  productsMovements,
  productsBundle,
  productsOpeningLots,
  unitsList,
  categoriesList,
  warehousesList,
];
