// POS P2.3 ▸ สูตร/วัตถุดิบ (BOM) — ฝั่งบริสุทธิ์ (client import ได้ · ไม่มี prisma/db/โมดูลเซิร์ฟเวอร์) ◂
//   expandRecipe = ตัวกำหนดเดียวของ "ขาย 1 หน่วยใช้วัตถุดิบอะไรเท่าไร" (หน้าขาย · ต้นทุนตามสูตร · จอ 06 คำนวณมุมมองต่อขนาด)
//   กติกา (brief P2.3 §2 R3 · มติ Q2): สูตรฐาน + Σ delta ของตัวเลือกที่เลือก → รวมต่อ InvItem → ทิ้งรายการที่สุทธิ ≤ 0 (ไม่ติดลบ) →
//   เรียง invItemId น้อยไปมาก (เทียบรหัสอักขระ = COLLATE "C") · จำนวนเต็มในหน่วยของสินค้าคลังเอง · ไม่มีการปัดเศษ
//   เกิน 50 รายการหลังรวม/ทิ้ง = INVALID_LINE (คืนค่า ไม่ throw)

/** เพดานวัตถุดิบต่อ 1 บรรทัดขาย (เท่ากับเพดานส่วนประกอบของ createSale) */
export const RECIPE_MAX_COMPONENTS = 50;

export type RecipeBaseLine = { invItemId: string; qty: number };
export type RecipeChoiceLine = { choiceId: string; invItemId: string; qtyDelta: number };
export type RecipeComponent = { invItemId: string; qty: number };
export type ExpandRecipeResult = { ok: true; components: RecipeComponent[] } | { ok: false; code: "INVALID_LINE"; message: string };

export const RECIPE_TOO_MANY_MESSAGE = `สูตรรวมตัวเลือกมีวัตถุดิบเกิน ${RECIPE_MAX_COMPONENTS} รายการ`;

const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
const isInt = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v);

/**
 * กระจายสูตรต่อ 1 หน่วย — ไม่แก้อินพุต · choiceId ที่ไม่ได้เลือก/ไม่รู้จัก = ไม่มีผล · ลำดับอินพุตไม่มีผลกับผล
 * แถวผิดรูป (id ว่าง · จำนวนไม่ใช่จำนวนเต็ม) ถูกข้าม (ผู้เขียนสูตรตรวจไว้แล้ว — ตัวนี้ห้ามล้มกลางการขาย)
 */
export function expandRecipe(input: { lines: readonly RecipeBaseLine[]; choiceLines: readonly RecipeChoiceLine[]; choiceIds: readonly string[] }): ExpandRecipeResult {
  const net = new Map<string, number>();
  for (const l of input.lines ?? []) {
    if (!l || typeof l.invItemId !== "string" || !l.invItemId || !isInt(l.qty)) continue;
    net.set(l.invItemId, (net.get(l.invItemId) ?? 0) + l.qty);
  }
  const picked = new Set((input.choiceIds ?? []).filter((x) => typeof x === "string" && x));
  for (const c of input.choiceLines ?? []) {
    if (!c || !picked.has(c.choiceId) || typeof c.invItemId !== "string" || !c.invItemId || !isInt(c.qtyDelta)) continue;
    net.set(c.invItemId, (net.get(c.invItemId) ?? 0) + c.qtyDelta);
  }
  const components = [...net.entries()]
    .filter(([, q]) => q > 0)
    .sort(([a], [b]) => cmp(a, b))
    .map(([invItemId, qty]) => ({ invItemId, qty }));
  if (components.length > RECIPE_MAX_COMPONENTS) return { ok: false, code: "INVALID_LINE", message: RECIPE_TOO_MANY_MESSAGE };
  return { ok: true, components };
}

/**
 * มติ 3 (ผู้คุม): แถวเจ้าของสูตร — ตัวแปรที่มีสูตรของตัวเอง ≥ 1 แถว = ตัวเอง · ไม่มี = แม่ (ไม่ใช่ตัวแปร = ตัวเอง)
 * bomEnabled + choice lines อ่านจากแถวเจ้าของเดียวกัน
 */
export function recipeOwnerId(row: { id: string; parentId: string | null }, ownLineCount: number): string {
  return row.parentId && ownLineCount === 0 ? row.parentId : row.id;
}

/**
 * R9: จำนวนหน่วยที่ทำได้จากสต็อก = min ⌊onHand / qty⌋ ของสูตรฐาน (ไม่ติดลบ) · ไม่มีวัตถุดิบ/ไม่รู้ยอดของบางตัว = null
 */
export function recipePortions(lines: readonly RecipeBaseLine[], onHandOf: (invItemId: string) => number | undefined): number | null {
  let best: number | null = null;
  for (const l of lines) {
    if (!isInt(l.qty) || l.qty < 1) continue;
    const oh = onHandOf(l.invItemId);
    if (oh === undefined) return null;
    const n = Math.max(0, Math.floor(oh / l.qty));
    best = best === null ? n : Math.min(best, n);
  }
  return best;
}
