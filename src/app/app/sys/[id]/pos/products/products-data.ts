// products-data.ts — ตัวโหลดข้อมูลฝั่งเซิร์ฟเวอร์ของจอ 06 "สินค้าและเมนู" + จอโปรราคา (POS P2.2U · มติ 1/2/4)
//   อ่านอย่างเดียว: catalog.listForUnit ต่อสาขา (แถวราคาตามช่องทางของทุกสาขา = รวมทุกสาขาที่โหลด) · ช่องทางขายที่เปิดอยู่ของระบบ · หมวด ·
//   โปรราคา (price-rule.listPriceRules) — ไม่เขียนอะไร (ช่องทาง builtin ที่สาขายังไม่มีแถว = ชื่อตั้งต้นจาก channel-shared ไม่สร้างแถว)
// 🔴 ไฟล์นี้ใช้จาก server component เท่านั้น (import catalog.ts / price-rule.ts / prisma) — client import ไม่ได้
// 🔴 ผลส่งให้ client เป็นข้อมูลล้วน (ไม่มี Date · เงินสตางค์ Int)

import { prisma } from "@/lib/core/db";
import { CatalogError, listForUnit, type PosProductView } from "@/lib/modules/pos/catalog";
// POS P2.3U ▸ มติ 1/3/4: สูตร/วัตถุดิบของแถว (listForUnit) + ต้นทุนตามสูตร (recipe.recipeCost ครั้งเดียวต่อหน้า ต่อสาขา) + ข้อมูลวัตถุดิบ (ชื่อ · หน่วย · เก็บถาวร · คลัง) ◂
import { recipeCost } from "@/lib/modules/pos/recipe";
import { systemForUnit } from "@/lib/modules/system/service";
import { listPriceRules } from "@/lib/modules/pos/price-rule";
import { CHANNEL_BUILTIN_CODES, CHANNEL_BUILTIN_NAMES, type ChannelKind, type ChannelPayout } from "@/lib/modules/pos/channel-shared";
import type { PriceRuleItem } from "@/lib/modules/pos/price-shared";
import type { RegisterActor } from "@/lib/modules/pos/register-shared";

/** ช่องทางที่จอ 06 ใช้ (รวมตามรหัสข้ามสาขา — ชื่อ/payout ของสาขาแรกตามลำดับแสดง) */
export type ProductsChannel = { code: string; name: string; kind: ChannelKind; payout: ChannelPayout; unitIds: string[] };
export type ProductsPriceRow = { channelCode: string | null; unitId: string | null; priceSatang: number | null; notSold: boolean };
// POS P2.3U ▸ สูตร/วัตถุดิบ (มติ 1–4) — ข้อมูลล้วน · ต้นทุน/กำไรเป็นค่าที่ recipeCost คืน (ไม่มีคีย์ = ไม่มีสิทธิ์ดูต้นทุน · จอไม่คิดเงินเอง) ◂
export type ProductsRecipeLine = { invItemId: string; qty: number };
export type ProductsRecipeChoiceLine = { choiceId: string; invItemId: string; qtyDelta: number };
export type ProductsRecipeGroup = { id: string; name: string; nameEn: string | null; choices: { id: string; name: string; nameEn: string | null }[] };
export type ProductsRecipeVariant = { id: string; name: string; nameEn: string | null; recipe: ProductsRecipeLine[]; bomEnabled: boolean };
/** ผลของ recipeCost สำหรับมุมมองสูตรฐาน (ทุกคีย์ตามบริการ · cost/costComplete/marginBp/ต้นทุนต่อบรรทัด มีเฉพาะผู้ดูต้นทุนได้) */
export type ProductsRecipeCostLine = { invItemId: string; name: string; unitLabel: string; qty: number; unitCostSatang?: number; costSatang?: number };
export type ProductsRecipeCost = { lines: ProductsRecipeCostLine[]; costSatang?: number; costComplete?: boolean; marginBp?: number | null };
/** วัตถุดิบที่สูตรของหน้านี้อ้างถึง — archived = เก็บถาวร (ป้ายเตือน) · systemId = คลังของวัตถุดิบ (เทียบคลังของสาขา → "ไม่ขึ้นที่สาขา") */
export type ProductsIngredient = { id: string; name: string; unitLabel: string; onHand: number; archived: boolean; systemId: string; kind: string };
export type ProductsRow = {
  id: string;
  name: string;
  nameEn: string | null;
  sku: string | null;
  kind: string;
  categoryId: string | null;
  basePriceSatang: number | null;
  soldByWeight: boolean;
  /** สินค้าของสาขาเดียว (null = ทุกสาขา) */
  unitId: string | null;
  optionCount: number;
  variantCount: number;
  trackStock: boolean;
  /** สาขาที่สินค้านี้อยู่ในรายการ (ขายได้/เห็นได้ที่สาขานั้น) → สต็อก/ขายได้ */
  stock: Record<string, number>;
  available: Record<string, boolean>;
  /** แถวราคาตามช่องทาง/สาขาทั้งชุดของสินค้า (ทุกสาขาที่โหลด) — ตัวแก้ส่งกลับทั้งชุด (setChannelPrices แทนทั้งชุด) */
  rows: ProductsPriceRow[];
  // POS P2.3U ▸ สูตรของแถวนี้ (listForUnit) · กลุ่มตัวเลือกที่ผูก (ชิป "ขนาด S/M/L…") · ตัวแปร (สูตรของตัวเอง) · ต้นทุนสูตรฐาน (null = ไม่มีสูตร/ไม่ได้คิด) ◂
  recipe: ProductsRecipeLine[];
  recipeChoiceLines: ProductsRecipeChoiceLine[];
  bomEnabled: boolean;
  recipeGroups: ProductsRecipeGroup[];
  recipeVariants: ProductsRecipeVariant[];
  recipeCost: ProductsRecipeCost | null;
};
export type ProductsData = {
  units: { id: string; name: string }[];
  channels: ProductsChannel[];
  categories: { id: string; name: string; nameEn: string | null }[];
  products: ProductsRow[];
  rules: PriceRuleItem[];
  /** โหลดไม่ครบ (เกินเพดานต่อสาขา) */
  truncated: boolean;
  // POS P2.3U ▸ วัตถุดิบที่สูตรในหน้านี้อ้างถึง (key = invItemId) · คลังสินค้าของแต่ละสาขา (null = สาขาไม่ผูกคลัง) ◂
  ingredients: Record<string, ProductsIngredient>;
  unitInventory: Record<string, string | null>;
};

const PER_UNIT_MAX = 2_000;
const PAGE = 500;

async function unitProducts(tenantId: string, systemId: string, userId: string, unitId: string): Promise<{ items: PosProductView[]; truncated: boolean }> {
  const out: PosProductView[] = [];
  let cursor: string | null = null;
  try {
    do {
      const r: { items: PosProductView[]; nextCursor: string | null } = await listForUnit({ tenantId, systemId, actorUserId: userId }, unitId, { limit: PAGE, cursor });
      out.push(...r.items);
      cursor = r.nextCursor;
    } while (cursor && out.length < PER_UNIT_MAX);
  } catch (e) {
    // สาขาที่ผู้ใช้เข้าไม่ได้/ไม่ผูกแล้ว = ข้ามสาขานั้น (หน้าไม่ล้ม)
    if (e instanceof CatalogError) return { items: out, truncated: false };
    throw e;
  }
  return { items: out, truncated: !!cursor };
}

/** ข้อมูลทั้งจอ — สาขาที่ส่งมา = สาขาที่ผู้ใช้เห็น (ผู้เรียกกรองแล้ว) */
export async function loadProductsData(
  scope: { tenantId: string; systemId: string },
  actor: RegisterActor,
  units: { id: string; name: string }[],
  opts: { rules?: boolean } = {},
): Promise<ProductsData> {
  const { tenantId, systemId } = scope;
  const per = await Promise.all(units.map((u) => unitProducts(tenantId, systemId, actor.userId, u.id)));
  const byId = new Map<string, ProductsRow>();
  const rowKeys = new Map<string, Set<string>>();
  const variantSeen = new Set<string>(); // POS P2.3U
  const variantRows: { parentId: string; v: ProductsRecipeVariant }[] = []; // POS P2.3U
  per.forEach((res, i) => {
    const unitId = units[i]!.id;
    for (const p of res.items) {
      let row = byId.get(p.id);
      if (!row) {
        row = {
          id: p.id,
          name: p.name,
          nameEn: p.nameEn,
          sku: p.sku,
          kind: p.kind,
          categoryId: p.categoryId,
          basePriceSatang: p.basePriceSatang,
          soldByWeight: p.soldByWeight,
          unitId: p.unitId,
          optionCount: p.optionGroups.length,
          variantCount: p.variants.length,
          trackStock: p.trackStock,
          stock: {},
          available: {},
          rows: [],
          // POS P2.3U ▸ สูตรของแถว (ค่าเดียวกันทุกสาขา — สูตรไม่แยกสาขา) ◂
          recipe: p.recipe,
          recipeChoiceLines: p.recipeChoiceLines,
          bomEnabled: p.bomEnabled,
          recipeGroups: p.optionGroups.map((g) => ({ id: g.id, name: g.name, nameEn: g.nameEn, choices: g.choices.map((c) => ({ id: c.id, name: c.name, nameEn: c.nameEn })) })),
          recipeVariants: [],
          recipeCost: null,
        };
        if (p.parentId === null) byId.set(p.id, row);
        else {
          // POS P2.3U ▸ มติ 1: ตัวแปร = สูตรของตัวเอง (ว่าง = ใช้ของแม่ · จอแสดง "สูตรของสินค้าหลัก") ◂
          if (!variantSeen.has(p.id)) {
            variantSeen.add(p.id);
            variantRows.push({ parentId: p.parentId, v: { id: p.id, name: p.name, nameEn: p.nameEn, recipe: p.recipe, bomEnabled: p.bomEnabled } });
          }
          continue; // ตัวแปรใช้แถวราคาของแม่ (แก้ตัวแปรรายตัว = แท็บตัวเลือก P2.3)
        }
        rowKeys.set(p.id, new Set());
      }
      if (typeof p.stock[unitId] === "number") row.stock[unitId] = p.stock[unitId]!;
      row.available[unitId] = p.availability[unitId] !== false;
      row.variantCount = Math.max(row.variantCount, p.variants.length);
      const seen = rowKeys.get(p.id)!;
      for (const cp of p.channelPrices) {
        const k = `${cp.channelCode ?? ""}|${cp.unitId ?? ""}`;
        if (seen.has(k)) continue;
        seen.add(k);
        row.rows.push({ channelCode: cp.channelCode, unitId: cp.unitId, priceSatang: cp.priceSatang, notSold: cp.notSold });
      }
    }
  });

  const unitIds = units.map((u) => u.id);
  const [chRows, cats, rules] = await Promise.all([
    unitIds.length
      ? prisma.salesChannel.findMany({
          where: { tenantId, systemId, unitId: { in: unitIds }, archivedAt: null, active: true },
          select: { code: true, name: true, kind: true, payout: true, unitId: true, sortOrder: true, createdAt: true },
        })
      : Promise.resolve([]),
    prisma.posCategory.findMany({ where: { tenantId, systemId, archivedAt: null }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { id: true, name: true, nameEn: true } }),
    opts.rules === false || !unitIds.length
      ? Promise.resolve([] as PriceRuleItem[])
      : listPriceRules({ tenantId, systemId, unitId: unitIds[0]! }, actor, {}).then((r) => (r.ok ? r.items : [])),
  ]);

  // ช่องทาง: builtin ตามลำดับคงที่ (สาขาที่ยังไม่มีแถว = ชื่อตั้งต้น) แล้วช่องทางอื่นตาม sortOrder → createdAt → รหัส
  const rank = (code: string) => {
    const i = (CHANNEL_BUILTIN_CODES as readonly string[]).indexOf(code);
    return i < 0 ? 99 : i;
  };
  const sorted = [...chRows].sort((a, b) => rank(a.code) - rank(b.code) || a.sortOrder - b.sortOrder || a.createdAt.getTime() - b.createdAt.getTime() || a.code.localeCompare(b.code));
  const channels = new Map<string, ProductsChannel>();
  for (const c of sorted) {
    const cur = channels.get(c.code);
    if (cur) cur.unitIds.push(c.unitId);
    else channels.set(c.code, { code: c.code, name: c.name, kind: c.kind, payout: c.payout, unitIds: [c.unitId] });
  }
  for (const code of CHANNEL_BUILTIN_CODES) {
    const unitsWithout = unitIds.filter((u) => !chRows.some((r) => r.code === code && r.unitId === u));
    // สาขาที่ยังไม่เคยเปิดช่องทาง (ยังไม่มีแถว builtin เลย) = ใช้ได้ตามค่าตั้งต้น
    const fresh = unitsWithout.filter((u) => !chRows.some((r) => r.unitId === u && r.kind === "BUILTIN"));
    if (!fresh.length) continue;
    const cur = channels.get(code);
    if (cur) cur.unitIds.push(...fresh);
    else channels.set(code, { code, name: CHANNEL_BUILTIN_NAMES[code], kind: "BUILTIN", payout: "DIRECT", unitIds: fresh });
  }
  const chList = [...channels.values()].sort((a, b) => rank(a.code) - rank(b.code));
  // คงลำดับของช่องทางที่ไม่ใช่ builtin ตาม sorted (sort ของ JS เสถียร)
  const products = [...byId.values()];
  const recipeData = await loadRecipeData(scope, actor, units, products, variantRows); // POS P2.3U
  return {
    units,
    channels: chList,
    categories: cats,
    products,
    rules,
    truncated: per.some((r) => r.truncated),
    ...recipeData, // POS P2.3U
  };
}

// ═══════════════════ POS P2.3U ▸ สูตร/วัตถุดิบของจอ 06 (มติ 1/3/4) ═══════════════════
const RECIPE_COST_BATCH = 200; // เพดานของ recipeCost ต่อครั้ง
const hasRecipe = (p: Pick<ProductsRow, "kind" | "recipe" | "soldByWeight">) => (p.kind === "MENU" || p.kind === "BUNDLE") && !p.soldByWeight && p.recipe.length > 0;

/**
 * ตัวแปรเข้าแถวแม่ · ต้นทุนสูตรฐานของแถวที่มีสูตร = recipe.recipeCost "ครั้งเดียวต่อสาขา" (มติ 4 — ไม่เรียกต่อแถว ·
 *   แถวทุกสาขาคิดที่สาขาแรกที่แถวนั้นขาย · แถวของสาขาเดียวคิดที่สาขานั้น — ต้นทุนวัตถุดิบเป็นค่าระดับร้าน) ·
 *   วัตถุดิบที่อ้างถึง (สูตร + ส่วนต่าง + สูตรตัวแปร) อ่านชื่อ/หน่วย/คงเหลือ/เก็บถาวร/คลัง ในคำสั่งเดียว · คลังของสาขาจาก systemForUnit
 * ผิดพลาด/ถูกปฏิเสธ = ไม่มีต้นทุน (หน้าไม่ล้ม · ช่องต้นทุนแสดง —)
 */
async function loadRecipeData(
  scope: { tenantId: string; systemId: string },
  actor: RegisterActor,
  units: { id: string; name: string }[],
  products: ProductsRow[],
  variantRows: { parentId: string; v: ProductsRecipeVariant }[],
): Promise<Pick<ProductsData, "ingredients" | "unitInventory">> {
  const { tenantId, systemId } = scope;
  const byId = new Map(products.map((p) => [p.id, p]));
  for (const { parentId, v } of variantRows) byId.get(parentId)?.recipeVariants.push(v);
  const groups = new Map<string, string[]>();
  for (const p of products) {
    if (!hasRecipe(p)) continue;
    const u = p.unitId ?? units.find((x) => p.available[x.id] !== undefined)?.id;
    if (!u) continue;
    groups.set(u, [...(groups.get(u) ?? []), p.id]);
  }
  for (const [unitId, ids] of groups) {
    for (let i = 0; i < ids.length; i += RECIPE_COST_BATCH) {
      const r = await recipeCost({ tenantId, systemId, actor }, ids.slice(i, i + RECIPE_COST_BATCH), { unitId });
      if (!r.ok) continue;
      for (const it of r.items) {
        const row = byId.get(it.productId);
        if (!row) continue;
        const c: ProductsRecipeCost = { lines: it.lines.map((l) => ({ ...l })) };
        if (it.costSatang !== undefined) c.costSatang = it.costSatang;
        if (it.costComplete !== undefined) c.costComplete = it.costComplete;
        if (it.marginBp !== undefined) c.marginBp = it.marginBp;
        row.recipeCost = c;
      }
    }
  }
  const itemIds = [...new Set(products.flatMap((p) => [...p.recipe.map((l) => l.invItemId), ...p.recipeChoiceLines.map((l) => l.invItemId), ...p.recipeVariants.flatMap((v) => v.recipe.map((l) => l.invItemId))]))];
  const [items, invOf] = await Promise.all([
    itemIds.length
      ? prisma.invItem.findMany({ where: { tenantId, id: { in: itemIds } }, select: { id: true, name: true, unitLabel: true, onHand: true, archivedAt: true, systemId: true, kind: true } })
      : Promise.resolve([]),
    Promise.all(units.map(async (u) => [u.id, await systemForUnit(tenantId, u.id, "INVENTORY")] as const)),
  ]);
  const ingredients: Record<string, ProductsIngredient> = {};
  for (const i of items) ingredients[i.id] = { id: i.id, name: i.name, unitLabel: i.unitLabel, onHand: i.onHand, archived: i.archivedAt !== null, systemId: i.systemId, kind: i.kind };
  return { ingredients, unitInventory: Object.fromEntries(invOf) };
}
