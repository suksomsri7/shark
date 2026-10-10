// POS P2.3 ▸ สูตร/วัตถุดิบ (BOM) — ฝั่งเซิร์ฟเวอร์: ตัวโหลดสูตรที่ใช้จริง (หน้าขาย · แคตตาล็อก) + ต้นทุนตามสูตร (recipeCost) ◂
//   ผู้เขียนสูตร = catalog.ts เท่านั้น (F15.1) · ไฟล์นี้อ่านอย่างเดียว · กระจายสูตรด้วย expandRecipe (recipe-shared.ts) ตัวเดียว
//   ต้นทุนตามสูตร (R8 · CD4) = Σ qty × InvItem.costSatang (ถัวเฉลี่ยปัจจุบัน) — ไม่มีคอลัมน์สำเนาต้นทุน · ต้นทุนที่ขายจริง = แถว OUT ของบิล
//   เห็นต้นทุน/กำไร (มติ Q10) = pos.product.manage หรือ pos.report.view ที่สาขานั้น · อื่น ๆ ได้วัตถุดิบ/จำนวนโดยไม่มีคีย์ต้นทุน/กำไรเลย
import type { Prisma, PrismaClient, PosProductKind } from "@prisma/client";
import { recipeOwnerId, type RecipeBaseLine, type RecipeChoiceLine } from "./recipe-shared";

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
