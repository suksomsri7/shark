// POS P2.3 ▸ สูตร/วัตถุดิบ (BOM) — ฝั่งเซิร์ฟเวอร์: ตัวโหลดสูตรที่ใช้จริง (หน้าขาย · แคตตาล็อก) + ต้นทุนตามสูตร (recipeCost) ◂
//   ผู้เขียนสูตร = catalog.ts เท่านั้น (F15.1) · ไฟล์นี้อ่านอย่างเดียว · กระจายสูตรด้วย expandRecipe (recipe-shared.ts) ตัวเดียว
//   ต้นทุนตามสูตร (R8 · CD4) = Σ qty × InvItem.costSatang (ถัวเฉลี่ยปัจจุบัน) — ไม่มีคอลัมน์สำเนาต้นทุน · ต้นทุนที่ขายจริง = แถว OUT ของบิล
//   เห็นต้นทุน/กำไร (มติ Q10) = pos.product.manage หรือ pos.report.view ที่สาขานั้น · อื่น ๆ ได้วัตถุดิบ/จำนวนโดยไม่มีคีย์ต้นทุน/กำไรเลย
import type { Prisma, PrismaClient, PosProductKind, Role } from "@prisma/client";
import { canAccessUnit, evaluate } from "@/lib/core/rbac";
import { prisma } from "./db";
import { expandRecipe, recipeOwnerId, type RecipeBaseLine, type RecipeChoiceLine } from "./recipe-shared";

type Db = PrismaClient | Prisma.TransactionClient;

/** สูตรที่ใช้กับแถวหนึ่ง — owner = แถวเจ้าของสูตร (มติ 3) · live = ขายแล้วตัดวัตถุดิบ (BUNDLE เสมอ · MENU เมื่อเจ้าของเปิด bomEnabled และมีสูตร) */
export type RowRecipe = { ownerId: string; bomEnabled: boolean; live: boolean; lines: RecipeBaseLine[]; choiceLines: RecipeChoiceLine[] };

/**
 * โหลดสูตรของหลายแถวในคำสั่งชุดเดียว (RecipeLine ของแถว+แม่ · bomEnabled + PosRecipeChoiceLine ของเจ้าของ)
 *   BUNDLE: เจ้าของ = ตัวเอง (เดิมของ P1.2) · MENU: มติ 3 (ตัวแปรไม่มีสูตรเอง = แม่) · ชนิดอื่น = ไม่มีสูตร (live false)
 *   ลำดับบรรทัดฐาน = createdAt, id (เดิมของ P1.2) — ผลของ expandRecipe เรียงตาม invItemId อยู่แล้ว
 */
export async function loadRowRecipes(db: Db, tenantId: string, rows: readonly { id: string; parentId: string | null; kind: PosProductKind }[]): Promise<Map<string, RowRecipe>> {
  const out = new Map<string, RowRecipe>();
  const want = rows.filter((r) => r.kind === "MENU" || r.kind === "BUNDLE");
  if (!want.length) return out;
  const lineIds = [...new Set(want.flatMap((r) => (r.kind === "MENU" && r.parentId ? [r.id, r.parentId] : [r.id])))];
  const lines = await db.recipeLine.findMany({
    where: { tenantId, productId: { in: lineIds } },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: { productId: true, invItemId: true, qty: true },
  });
  const linesBy = new Map<string, RecipeBaseLine[]>();
  for (const l of lines) linesBy.set(l.productId, [...(linesBy.get(l.productId) ?? []), { invItemId: l.invItemId, qty: l.qty }]);
  const ownerOf = new Map(want.map((r) => [r.id, r.kind === "MENU" ? recipeOwnerId(r, (linesBy.get(r.id) ?? []).length) : r.id]));
  const ownerIds = [...new Set(ownerOf.values())];
  const [owners, choices] = await Promise.all([
    db.posProduct.findMany({ where: { tenantId, id: { in: ownerIds } }, select: { id: true, bomEnabled: true } }),
    db.posRecipeChoiceLine.findMany({
      where: { tenantId, productId: { in: ownerIds } },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: { productId: true, choiceId: true, invItemId: true, qtyDelta: true },
    }),
  ]);
  const bomOf = new Map(owners.map((o) => [o.id, o.bomEnabled]));
  const choicesBy = new Map<string, RecipeChoiceLine[]>();
  for (const c of choices) choicesBy.set(c.productId, [...(choicesBy.get(c.productId) ?? []), { choiceId: c.choiceId, invItemId: c.invItemId, qtyDelta: c.qtyDelta }]);
  for (const r of want) {
    const ownerId = ownerOf.get(r.id)!;
    const ls = linesBy.get(ownerId) ?? [];
    const bomEnabled = bomOf.get(ownerId) === true;
    const live = r.kind === "BUNDLE" ? true : bomEnabled && ls.length > 0;
    out.set(r.id, { ownerId, bomEnabled, live, lines: ls, choiceLines: choicesBy.get(ownerId) ?? [] });
  }
  return out;
}

// ═══════════════════ R8 ต้นทุนตามสูตร ═══════════════════

export type RecipeCostActor = { userId: string; role: Role; unitAccess: string[]; permissions: Record<string, unknown> };
export type RecipeCostCtx = { tenantId: string; systemId: string; actor: RecipeCostActor };
/** บรรทัดวัตถุดิบ — unitCostSatang/costSatang มีเฉพาะผู้เห็นต้นทุน */
export type RecipeCostLine = { invItemId: string; name: string; unitLabel: string; qty: number; unitCostSatang?: number; costSatang?: number };
export type RecipeCostItem = {
  productId: string;
  bomEnabled: boolean;
  basePriceSatang: number | null;
  lines: RecipeCostLine[];
  /** ผู้เห็นต้นทุนเท่านั้น (ไม่มีสิทธิ์ = ไม่มีคีย์) */
  costSatang?: number;
  costComplete?: boolean;
  marginBp?: number | null;
};
export type RecipeCostResult =
  | { ok: true; items: RecipeCostItem[] }
  | { ok: false; code: "NOT_FOUND" | "PERMISSION_DENIED" | "VALIDATION" | "INVALID_LINE" | "INTERNAL"; message: string };

const MSG = {
  NOT_FOUND: "ไม่พบสินค้าหรือสาขานี้ในระบบขาย",
  PERMISSION_DENIED: "บัญชีนี้ยังไม่ได้รับสิทธิ์ดูสูตรของสาขานี้",
  VALIDATION: "ข้อมูลที่ส่งมาไม่ถูกต้อง — ยังไม่ได้คำนวณ",
  INTERNAL: "ระบบขายขัดข้องชั่วคราว — ลองอีกครั้ง",
} as const;
const RECIPE_COST_MAX_PRODUCTS = 200;
const isRec = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const isId = (v: unknown): v is string => typeof v === "string" && v.length > 0 && v.length <= 200;

function actorOf(v: unknown): RecipeCostActor | null {
  if (!isRec(v) || !isId(v.userId) || (v.role !== "OWNER" && v.role !== "MANAGER" && v.role !== "STAFF")) return null;
  if (!Array.isArray(v.unitAccess) || !v.unitAccess.every((x) => typeof x === "string") || !isRec(v.permissions)) return null;
  return { userId: v.userId, role: v.role, unitAccess: [...(v.unitAccess as string[])], permissions: v.permissions };
}

/**
 * R8 — ต้นทุนตามสูตรของสินค้า (ลำดับตาม productIds) ที่สาขา `unitId` · `choiceIds` = ตัวเลือกที่ใช้คิด (ไม่ส่ง = สูตรฐาน)
 *   cost = Σ qty × InvItem.costSatang · costComplete = false เมื่อวัตถุดิบต้นทุน 0 / เก็บถาวร / ไม่มีจริง ("ยังไม่ใส่ต้นทุน")
 *   marginBp = floor((ราคาฐาน − ต้นทุน) × 10000 / ราคาฐาน) (สูตร P1.17 · ราคารวม VAT) · ราคาไม่ตั้ง/0 หรือไม่ครบ = null ("กำไรคำนวณไม่ได้")
 *   ขอบเขต: ระบบ POS ของร้านนี้ · สาขาผูกระบบนี้ (ไม่เก็บถาวร · เข้าได้) · ต้องมีสิทธิ์ขาย/จัดการสินค้า/ดูรายงานที่สาขานั้น · ปฏิเสธ = คืน (ไม่ throw)
 */
export async function recipeCost(ctx: RecipeCostCtx, productIds: string[], opts: { unitId: string; choiceIds?: string[] }, client: Db = prisma): Promise<RecipeCostResult> {
  try {
    if (!isRec(ctx) || !isId(ctx.tenantId) || !isId(ctx.systemId) || !isRec(opts) || !isId(opts.unitId)) return { ok: false, code: "NOT_FOUND", message: MSG.NOT_FOUND };
    const actor = actorOf(ctx.actor);
    if (!actor) return { ok: false, code: "PERMISSION_DENIED", message: MSG.PERMISSION_DENIED };
    if (!Array.isArray(productIds) || productIds.length > RECIPE_COST_MAX_PRODUCTS || !productIds.every(isId)) return { ok: false, code: "VALIDATION", message: MSG.VALIDATION };
    const choiceIds = opts.choiceIds ?? [];
    if (!Array.isArray(choiceIds) || choiceIds.length > 100 || !choiceIds.every(isId)) return { ok: false, code: "VALIDATION", message: MSG.VALIDATION };
    const { tenantId, systemId } = ctx;
    const unitId = opts.unitId;
    const [sys, link, unit] = await Promise.all([
      client.appSystem.findFirst({ where: { id: systemId, tenantId, type: "POS", active: true }, select: { id: true } }),
      client.appSystemUnit.findUnique({ where: { tenantId_unitId_type: { tenantId, unitId, type: "POS" } }, select: { systemId: true } }),
      client.businessUnit.findFirst({ where: { id: unitId, tenantId, status: { not: "ARCHIVED" } }, select: { id: true } }),
    ]);
    if (!sys || !link || link.systemId !== systemId || !unit || !canAccessUnit(actor, unitId)) return { ok: false, code: "NOT_FOUND", message: MSG.NOT_FOUND };
    const can = (action: string) => evaluate(actor, { module: "pos", action, unitId });
    if (!can("pos.sale.create") && !can("pos.product.manage") && !can("pos.report.view")) return { ok: false, code: "PERMISSION_DENIED", message: MSG.PERMISSION_DENIED };
    const seeCost = can("pos.product.manage") || can("pos.report.view");
    const ids = [...new Set(productIds)];
    const rows = ids.length
      ? await client.posProduct.findMany({ where: { tenantId, systemId, id: { in: ids } }, select: { id: true, parentId: true, kind: true, unitId: true, basePriceSatang: true } })
      : [];
    if (rows.length !== ids.length || rows.some((r) => r.unitId !== null && r.unitId !== unitId)) return { ok: false, code: "NOT_FOUND", message: MSG.NOT_FOUND };
    const parentIds = [...new Set(rows.map((r) => r.parentId).filter((x): x is string => !!x))];
    const parents = parentIds.length ? await client.posProduct.findMany({ where: { tenantId, id: { in: parentIds } }, select: { id: true, basePriceSatang: true } }) : [];
    const parentPrice = new Map(parents.map((p) => [p.id, p.basePriceSatang]));
    const recipes = await loadRowRecipes(client, tenantId, rows);
    const expanded = new Map<string, { invItemId: string; qty: number }[]>();
    for (const r of rows) {
      const rc = recipes.get(r.id);
      const x = rc ? expandRecipe({ lines: rc.lines, choiceLines: rc.choiceLines, choiceIds }) : { ok: true as const, components: [] };
      if (!x.ok) return { ok: false, code: "INVALID_LINE", message: x.message };
      expanded.set(r.id, x.components);
    }
    const itemIds = [...new Set([...expanded.values()].flatMap((cs) => cs.map((c) => c.invItemId)))];
    const items = itemIds.length
      ? await client.invItem.findMany({ where: { tenantId, id: { in: itemIds } }, select: { id: true, name: true, unitLabel: true, costSatang: true, archivedAt: true } })
      : [];
    const itemById = new Map(items.map((i) => [i.id, i]));
    const rowById = new Map(rows.map((r) => [r.id, r]));
    const out: RecipeCostItem[] = productIds.map((pid) => {
      const r = rowById.get(pid)!;
      const rc = recipes.get(pid);
      const base = r.basePriceSatang ?? (r.parentId ? (parentPrice.get(r.parentId) ?? null) : null);
      let total = 0;
      let complete = true;
      const lines: RecipeCostLine[] = (expanded.get(pid) ?? []).map((c) => {
        const it = itemById.get(c.invItemId);
        const unitCost = it ? it.costSatang : 0;
        if (!it || it.archivedAt || unitCost <= 0) complete = false;
        const cost = c.qty * unitCost;
        total += cost;
        const line: RecipeCostLine = { invItemId: c.invItemId, name: it?.name ?? "", unitLabel: it?.unitLabel ?? "", qty: c.qty };
        if (seeCost) {
          line.unitCostSatang = unitCost;
          line.costSatang = cost;
        }
        return line;
      });
      const item: RecipeCostItem = { productId: pid, bomEnabled: rc?.bomEnabled === true, basePriceSatang: base, lines };
      if (seeCost) {
        item.costSatang = total;
        item.costComplete = complete;
        item.marginBp = complete && base !== null && base > 0 ? Math.floor(((base - total) * 10_000) / base) : null;
      }
      return item;
    });
    return { ok: true, items: out };
  } catch (e) {
    console.error("[pos/recipe] recipeCost", e);
    return { ok: false, code: "INTERNAL", message: MSG.INTERNAL };
  }
}
