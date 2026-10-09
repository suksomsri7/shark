// price.ts — ตัวอ่านชั้นราคาของ POS P2.2 (ฝั่งเซิร์ฟเวอร์ · อ่านอย่างเดียว) · C-6 `channel.priceFor` = `resolvePrices`
//
// • `loadPriceBook` โหลดแถวราคา (PosProductChannelPrice) + กติกาที่อาจเกี่ยว (PosPriceRule) ของชุดสินค้า "ครั้งเดียว" ต่อการคิดราคา 1 ครั้ง
//   (2 คำสั่ง · กรองด้วย id สินค้า/แม่ + หมวด) แล้วให้ `priceOf` แก้ราคาทีละรายการด้วยตัวแก้บริสุทธิ์ `resolveUnitPrice` ที่ `at` เดียวกัน
// • `resolvePrices` = ทางเข้าของการ์ดถัดไป (ร้านอาหาร/เว็บ/QR/แชท P2.4 P2.7 P2.8) — ส่งออกผ่าน pos facade (index.ts)
// 🔴 ไม่เขียนอะไรเลย: แถวราคาเขียนใน catalog.ts เท่านั้น · กติกาเขียนใน price-rule.ts เท่านั้น
import type { PrismaClient, Prisma } from "@prisma/client";
import { CHANNEL_CODE_RE } from "./channel-shared";
import {
  nextPriceEdge,
  resolveUnitPrice,
  type ChannelPriceRow,
  type PriceParentLike,
  type PriceProductLike,
  type PriceRuleLike,
  type PriceSource,
  type ResolveUnitPriceResult,
} from "./price-shared";

type Db = PrismaClient | Prisma.TransactionClient;

export type PriceScope = { tenantId: string; systemId: string; unitId: string };
/** ชุดราคาที่โหลดแล้วของสินค้าชุดหนึ่ง (ใช้ซ้ำทุกบรรทัดของตะกร้า ⇒ สินค้าเดียวในบิลเดียวได้ราคาเดียว) */
export type PriceBook = {
  at: Date;
  unitId: string;
  rows: ChannelPriceRow[];
  rules: PriceRuleLike[];
  parents: Map<string, PriceParentLike & { soldByWeight: boolean }>;
};

const RULE_SELECT = {
  id: true,
  name: true,
  kind: true,
  active: true,
  archivedAt: true,
  priority: true,
  productIds: true,
  categoryIds: true,
  channelCodes: true,
  unitIds: true,
  adjust: true,
  valueSatang: true,
  valueBp: true,
  startsAt: true,
  endsAt: true,
  weekdays: true,
  timeFrom: true,
  timeTo: true,
  createdAt: true,
} as const;

/**
 * โหลดชุดราคาของ `products` (แถวของตัวเอง + ของแม่ · กติกาที่ active ไม่เก็บถาวร ใช้กับสาขานี้ และระบุสินค้า/แม่/หมวดใดหมวดหนึ่ง)
 * — 3 คำสั่งสูงสุด (แม่ที่ยังไม่มีในมือ · แถวราคา · กติกา)
 */
export async function loadPriceBook(db: Db, scope: PriceScope, products: readonly PriceProductLike[], at: Date, knownParents?: ReadonlyMap<string, PriceParentLike & { soldByWeight: boolean }>): Promise<PriceBook> {
  const parents = new Map<string, PriceParentLike & { soldByWeight: boolean }>(knownParents ?? []);
  const need = [...new Set(products.map((p) => p.parentId).filter((x): x is string => !!x && !parents.has(x)))];
  if (need.length) {
    const rows = await db.posProduct.findMany({
      where: { tenantId: scope.tenantId, systemId: scope.systemId, id: { in: need } },
      select: { id: true, basePriceSatang: true, categoryId: true, soldByWeight: true },
    });
    for (const r of rows) parents.set(r.id, r);
  }
  const ids = [...new Set(products.flatMap((p) => (p.parentId ? [p.id, p.parentId] : [p.id])))];
  const cats = [...new Set(products.flatMap((p) => [p.categoryId, p.parentId ? (parents.get(p.parentId)?.categoryId ?? null) : null]).filter((x): x is string => !!x))];
  if (!ids.length) return { at, unitId: scope.unitId, rows: [], rules: [], parents };
  const [rows, rules] = await Promise.all([
    db.posProductChannelPrice.findMany({
      where: { tenantId: scope.tenantId, systemId: scope.systemId, productId: { in: ids }, OR: [{ unitId: null }, { unitId: scope.unitId }] },
      select: { productId: true, channelCode: true, unitId: true, priceSatang: true, notSold: true },
    }),
    db.posPriceRule.findMany({
      where: {
        tenantId: scope.tenantId,
        systemId: scope.systemId,
        archivedAt: null,
        active: true,
        AND: [
          { OR: [{ unitIds: { isEmpty: true } }, { unitIds: { has: scope.unitId } }] },
          { OR: [{ productIds: { hasSome: ids } }, ...(cats.length ? [{ categoryIds: { hasSome: cats } }] : [])] },
        ],
      },
      select: RULE_SELECT,
    }),
  ]);
  return { at, unitId: scope.unitId, rows, rules, parents };
}

/** ราคาของสินค้า 1 รายการจากชุดที่โหลดแล้ว (ช่องทาง = รหัส) */
export function priceOf(
  book: PriceBook,
  product: PriceProductLike,
  channelCode: string,
  opts: { optionDeltaSatang?: number; override?: { source: "OPEN" | "CUSTOM" | "WEIGHED"; priceSatang: number } } = {},
): ResolveUnitPriceResult {
  const parent = product.parentId ? (book.parents.get(product.parentId) ?? null) : null;
  return resolveUnitPrice({
    product,
    parent,
    channelCode,
    unitId: book.unitId,
    rows: book.rows,
    rules: book.rules,
    at: book.at,
    ...(opts.override ? { override: opts.override } : {}),
    ...(opts.optionDeltaSatang ? { optionDeltaSatang: opts.optionDeltaSatang } : {}),
  });
}

/** R6: ขอบหน้าต่างถัดไปของกติกาในชุด (ภายใน 24 ชม.) — ISO หรือ null */
export function priceBookValidUntil(book: PriceBook): string | null {
  const d = nextPriceEdge(book.rules, book.at);
  return d ? d.toISOString() : null;
}

// ═══════════ R10 · C-6 priceFor ═══════════
export type ResolvePricesInput = {
  channelId?: string | null;
  channelCode?: string | null;
  at?: Date;
  items: { productId: string; optionDeltaSatang?: number }[];
};
export type ResolvedPriceItem = { unitPriceSatang: number; listPriceSatang: number | null; source: PriceSource; ruleId: string | null };
export type ResolvePricesRefusalCode = "VALIDATION" | "CHANNEL_INVALID" | "PRODUCT_NOT_FOUND" | "PRICE_NOT_SET" | "CHANNEL_NOT_SOLD";
export type ResolvePricesResult =
  | { ok: true; channelCode: string; items: ResolvedPriceItem[] }
  | { ok: false; code: ResolvePricesRefusalCode; message: string; lineIndex?: number };

const RP_MESSAGE: Record<ResolvePricesRefusalCode, string> = {
  VALIDATION: "ข้อมูลที่ส่งมาไม่ถูกต้อง",
  CHANNEL_INVALID: "ช่องทางขายนี้ใช้ไม่ได้ (ไม่พบ เก็บแล้ว หรือเป็นของสาขาอื่น)",
  PRODUCT_NOT_FOUND: "ไม่พบสินค้านี้ในระบบขาย",
  PRICE_NOT_SET: "สินค้านี้ยังไม่ได้ตั้งราคาขาย",
  CHANNEL_NOT_SOLD: "สินค้านี้ไม่ขายในช่องทางนี้",
};
const rpRefuse = (code: ResolvePricesRefusalCode, lineIndex?: number): ResolvePricesResult => ({ ok: false, code, message: RP_MESSAGE[code], ...(lineIndex !== undefined ? { lineIndex } : {}) });
const isId = (v: unknown): v is string => typeof v === "string" && v.length > 0 && v.length <= 200 && !v.includes("\u0000");
const RP_ITEMS_MAX = 500;

/**
 * C-6 `priceFor` (R10) — ราคาต่อหน่วยของสินค้าแคตตาล็อกบนช่องทาง (channelId ของสาขานี้ หรือ channelCode · ไม่ส่ง = STORE) ณ `at` (ปริยาย = ตอนนี้)
 * · ผู้เรียกตรวจขอบเขต/สิทธิ์ของตัวเองแล้ว (ร้าน + ระบบ POS + สาขา) · สินค้าชั่ง = ราคาต่อกก. ที่มา WEIGHED (ไม่โดนชั้นราคา · CD7)
 * · ปฏิเสธคืนค่า (ไม่ throw): VALIDATION · CHANNEL_INVALID · PRODUCT_NOT_FOUND · PRICE_NOT_SET · CHANNEL_NOT_SOLD (+ lineIndex)
 */
export async function resolvePrices(db: Db, scope: PriceScope, input: ResolvePricesInput): Promise<ResolvePricesResult> {
  if (!scope || !isId(scope.tenantId) || !isId(scope.systemId) || !isId(scope.unitId)) return rpRefuse("VALIDATION");
  if (!input || !Array.isArray(input.items) || input.items.length > RP_ITEMS_MAX) return rpRefuse("VALIDATION");
  const at = input.at instanceof Date && Number.isFinite(input.at.getTime()) ? input.at : new Date();
  let code = "STORE";
  if (input.channelId !== undefined && input.channelId !== null) {
    if (!isId(input.channelId)) return rpRefuse("CHANNEL_INVALID");
    const ch = await db.salesChannel.findFirst({ where: { id: input.channelId, tenantId: scope.tenantId, systemId: scope.systemId, unitId: scope.unitId, archivedAt: null }, select: { code: true } });
    if (!ch) return rpRefuse("CHANNEL_INVALID");
    code = ch.code;
  } else if (input.channelCode !== undefined && input.channelCode !== null) {
    if (typeof input.channelCode !== "string" || !CHANNEL_CODE_RE.test(input.channelCode)) return rpRefuse("CHANNEL_INVALID");
    code = input.channelCode;
  }
  for (const it of input.items) {
    if (!it || !isId(it.productId)) return rpRefuse("VALIDATION");
    if (it.optionDeltaSatang !== undefined && (typeof it.optionDeltaSatang !== "number" || !Number.isInteger(it.optionDeltaSatang))) return rpRefuse("VALIDATION");
  }
  const ids = [...new Set(input.items.map((i) => i.productId))];
  const rows = ids.length
    ? await db.posProduct.findMany({
        where: { tenantId: scope.tenantId, systemId: scope.systemId, id: { in: ids }, archivedAt: null, OR: [{ unitId: null }, { unitId: scope.unitId }] },
        select: { id: true, basePriceSatang: true, categoryId: true, parentId: true, soldByWeight: true },
      })
    : [];
  const byId = new Map(rows.map((r) => [r.id, r]));
  const book = await loadPriceBook(db, scope, rows, at);
  const out: ResolvedPriceItem[] = [];
  for (let i = 0; i < input.items.length; i++) {
    const it = input.items[i]!;
    const p = byId.get(it.productId);
    if (!p) return rpRefuse("PRODUCT_NOT_FOUND", i);
    const parent = p.parentId ? book.parents.get(p.parentId) : undefined;
    const weighed = p.soldByWeight || (!!parent && p.basePriceSatang === null && parent.soldByWeight);
    if (weighed) {
      const perKg = p.basePriceSatang ?? parent?.basePriceSatang ?? null;
      if (perKg === null) return rpRefuse("PRICE_NOT_SET", i);
      const r = priceOf(book, p, code, { override: { source: "WEIGHED", priceSatang: perKg }, optionDeltaSatang: it.optionDeltaSatang });
      if (r.ok) out.push({ unitPriceSatang: r.unitPriceSatang, listPriceSatang: r.listPriceSatang, source: r.source, ruleId: r.ruleId });
      continue;
    }
    const r = priceOf(book, p, code, { optionDeltaSatang: it.optionDeltaSatang });
    if (!r.ok) return rpRefuse(r.code, i);
    out.push({ unitPriceSatang: r.unitPriceSatang, listPriceSatang: r.listPriceSatang, source: r.source, ruleId: r.ruleId });
  }
  return { ok: true, channelCode: code, items: out };
}
