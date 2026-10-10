"use server";
// catalog-recipe-actions.ts — server action สูตร/วัตถุดิบ (BOM) ของจอ 06 (POS P2.3U ▸ มติ 1/2) · เปลือกบาง: session → ctx → catalog.* / recipe.recipeCost / inventory facade
//
// 🔴 ไฟล์ "use server" export ได้เฉพาะ async function — ชนิดผลลัพธ์เขียนในลายเซ็น (จอใช้ Awaited<ReturnType<…>>)
// 🔴 ไม่มีตรรกะสูตร/เงินเอง: ผู้เขียน = catalog.setRecipe / setRecipeChoiceLines / setBomEnabled (F15.1) · ต้นทุน/กำไร = recipe.recipeCost (คืนผลตามเดิมทุกคีย์)
// 🔴 คำปฏิเสธ "คืน" เสมอ {ok:false, code, message} (Next ปิดข้อความของ error ที่โยนออกจาก action ใน production) · รหัสชุดเดิมของ CatalogError
// 🔴 ร้าน + ผู้ใช้มาจาก SESSION เท่านั้น — systemId / productId / unitId จากคำขอถูกตรวจซ้ำใน catalog.ts / recipe.ts (ร้านอื่น/ระบบอื่น = NOT_FOUND)
// POS P2.3U ▸ มติ 1: บันทึกสูตร "แทนทั้งชุด" ทั้งสองตัวเขียน (สูตรฐาน + ส่วนต่างตามตัวเลือก) + สวิตช์ตัดสต็อกตามสูตร ใน tx เดียว (ล้มทั้งชุด = ไม่มีอะไรเปลี่ยน) ·
//   มติ 2 (F4): ป้ายสูตรจากเมนูเดิม → setBomEnabledAction(true) โดยตรง (การบันทึกสูตรไม่พลิกสวิตช์เอง) ·
//   ตัวเลือกวัตถุดิบ = ค้นสินค้าคลังผ่าน facade `@/lib/modules/inventory` (searchItems) ของคลังที่ผูกสาขาของ POS นี้ — ไม่มีตัวอ่านเดิมที่ใช้สิทธิ์ pos.product.manage (ส่วนเบี่ยง · โน้ต P2.3U) ◂

import { unstable_rethrow } from "next/navigation";
import { requireTenant } from "@/lib/core/context";
import { assertCan, evaluate } from "@/lib/core/rbac";
import { searchItems } from "@/lib/modules/inventory";
import { prisma } from "./db";
import { posMembership } from "./access";
import { CatalogError, setBomEnabled, setRecipe, setRecipeChoiceLines, type CatalogCtx, type CatalogErrorCode } from "./catalog";
import { recipeCost, type RecipeCostResult } from "./recipe";

type RecipeActionRefusal = { ok: false; code: CatalogErrorCode | "INTERNAL"; message: string };
type Session = Awaited<ReturnType<typeof requireTenant>>;

const INTERNAL = "เกิดข้อผิดพลาด — ลองอีกครั้ง";
const PICK_MAX = 20;
const Q_MAX = 128;

function refusalOf(where: string, e: unknown): RecipeActionRefusal {
  if (e instanceof CatalogError) return { ok: false, code: e.code, message: e.message };
  console.error(`[pos/catalog-recipe-actions] ${where}`, e);
  return { ok: false, code: "INTERNAL", message: INTERNAL };
}

const fieldsOf = (args: unknown): Record<string, unknown> => (args && typeof args === "object" && !Array.isArray(args) ? (args as Record<string, unknown>) : {});

/** session → CatalogCtx · ด่านแรกระดับบทบาท (pos.product.manage) — ขอบเขตต่อแถวตรวจซ้ำใน catalog.ts กับ DB */
async function manageCtx(auth: Session, args: unknown): Promise<CatalogCtx | RecipeActionRefusal> {
  const systemId = fieldsOf(args).systemId;
  if (typeof systemId !== "string" || !systemId) return { ok: false, code: "NOT_FOUND", message: "ไม่พบรายการนี้ในระบบขาย" };
  try {
    assertCan(posMembership(auth.active), { module: "pos", action: "pos.product.manage" });
  } catch {
    return { ok: false, code: "PERMISSION_DENIED", message: "บัญชีนี้ยังไม่มีสิทธิ์แก้สูตร — ขอสิทธิ์จากเจ้าของร้าน" };
  }
  return { tenantId: auth.active.tenantId, systemId, actorUserId: auth.user.id };
}

/**
 * มติ 1 — บันทึกสูตรของสินค้า 1 รายการ "แทนทั้งชุด" ใน tx เดียว:
 *   ① catalog.setRecipe(lines) ② catalog.setRecipeChoiceLines(choiceLines) เมื่อส่งมา (ตัวแปรไม่ส่ง — ส่วนต่างอ่านจากแถวเจ้าของ)
 *   ③ catalog.setBomEnabled(bomEnabled) เมื่อส่งมา (หลัง ① ⇒ เห็นสูตรใหม่ · ค่าเดิม = ไม่เขียน)
 *   ผล = แถวหลังบันทึก (bomEnabled อ่านในธุรกรรมเดียวกัน) · ปฏิเสธ = VALIDATION · NOT_FOUND · PERMISSION_DENIED · BUSY · CONFLICT · INTERNAL
 */
export async function saveRecipeAction(args: {
  systemId: string;
  productId: string;
  lines: { invItemId: string; qty: number }[];
  choiceLines?: { choiceId: string; invItemId: string; qtyDelta: number }[];
  bomEnabled?: boolean;
}): Promise<
  | {
      ok: true;
      productId: string;
      recipe: { invItemId: string; qty: number }[];
      recipeChoiceLines: { choiceId: string; invItemId: string; qtyDelta: number }[] | null;
      bomEnabled: boolean;
    }
  | RecipeActionRefusal
> {
  try {
    const auth = await requireTenant();
    const ctx = await manageCtx(auth, args);
    if ("ok" in ctx) return ctx;
    const a = fieldsOf(args);
    const productId = a.productId as string;
    const out = await prisma.$transaction(
      async (tx) => {
        const r = await setRecipe(ctx, productId, a.lines as { invItemId: string; qty: number }[], tx);
        const c = a.choiceLines === undefined ? null : await setRecipeChoiceLines(ctx, productId, a.choiceLines as { choiceId: string; invItemId: string; qtyDelta: number }[], tx);
        if (a.bomEnabled !== undefined) await setBomEnabled(ctx, productId, a.bomEnabled as boolean, tx);
        const row = await tx.posProduct.findFirst({ where: { id: r.id, tenantId: ctx.tenantId, systemId: ctx.systemId }, select: { bomEnabled: true } });
        return { productId: r.id, recipe: r.recipe, recipeChoiceLines: c ? c.recipeChoiceLines : null, bomEnabled: row?.bomEnabled === true };
      },
      { timeout: 20_000, maxWait: 10_000 },
    );
    return { ok: true, ...out };
  } catch (e) {
    unstable_rethrow(e);
    return refusalOf("saveRecipeAction", e);
  }
}

/** มติ 2 (F4) — สวิตช์ "ตัดสต็อกตามสูตร" (catalog.setBomEnabled) · ป้ายสูตรจากเมนูเดิมเรียก on = true โดยตรง */
export async function setBomEnabledAction(args: { systemId: string; productId: string; on: boolean }): Promise<{ ok: true; productId: string; bomEnabled: boolean } | RecipeActionRefusal> {
  try {
    const auth = await requireTenant();
    const ctx = await manageCtx(auth, args);
    if ("ok" in ctx) return ctx;
    const a = fieldsOf(args);
    const r = await setBomEnabled(ctx, a.productId as string, a.on as boolean);
    return { ok: true, productId: r.id, bomEnabled: r.bomEnabled };
  } catch (e) {
    unstable_rethrow(e);
    return refusalOf("setBomEnabledAction", e);
  }
}

/**
 * ต้นทุนตามสูตร (recipe.recipeCost) ของสินค้าที่สาขา unitId · choiceIds = มุมมองตามตัวเลือก (ไม่ส่ง = สูตรฐาน)
 *   ผลตามบริการทุกคีย์ (ไม่มีสิทธิ์ดูต้นทุน = ไม่มีคีย์ต้นทุน/กำไร) — จอแสดงอย่างเดียว ไม่คิดเงินเอง
 */
export async function recipeCostAction(args: { systemId: string; unitId: string; productIds: string[]; choiceIds?: string[] }): Promise<RecipeCostResult> {
  try {
    const auth = await requireTenant();
    const a = fieldsOf(args);
    const m = posMembership(auth.active);
    const opts: { unitId: string; choiceIds?: string[] } = { unitId: a.unitId as string };
    if (a.choiceIds !== undefined) opts.choiceIds = a.choiceIds as string[];
    return await recipeCost(
      { tenantId: auth.active.tenantId, systemId: a.systemId as string, actor: { userId: auth.user.id, role: m.role, unitAccess: m.unitAccess, permissions: m.permissions } },
      a.productIds as string[],
      opts,
    );
  } catch (e) {
    unstable_rethrow(e);
    console.error("[pos/catalog-recipe-actions] recipeCostAction", e);
    return { ok: false, code: "INTERNAL", message: INTERNAL };
  }
}

/**
 * ตัวเลือกวัตถุดิบ (มติ 1 · ส่วนเบี่ยง): ค้นสินค้าคลัง (ชื่อ · SKU · บาร์โค้ด) ของคลังที่ผูกสาขาของ POS นี้ ผ่าน facade inventory.searchItems ·
 *   ไม่รวมบริการ · ของเก็บถาวรไม่โผล่ (facade) · ≤ 20 รายการ · สิทธิ์ pos.product.manage (เท่าตัวเขียนสูตร) · ต้นทุนต่อหน่วยมีเมื่อดูต้นทุนได้ (manage/report.view)
 *   ผลเป็นข้อมูลแสดง — ตัวเขียน (catalog.setRecipe) ตรวจวัตถุดิบซ้ำทุกครั้ง
 */
export async function searchRecipeItemsAction(args: { systemId: string; q: string }): Promise<
  | { ok: true; items: { id: string; systemId: string; name: string; sku: string; unitLabel: string; onHand: number; costSatang?: number }[] }
  | RecipeActionRefusal
> {
  try {
    const auth = await requireTenant();
    const ctx = await manageCtx(auth, args);
    if ("ok" in ctx) return ctx;
    const raw = fieldsOf(args).q;
    const q = typeof raw === "string" ? raw.trim() : "";
    if (!q || q.length > Q_MAX || q.includes("\u0000")) return { ok: false, code: "VALIDATION", message: "คำค้นต้องยาว 1–128 ตัวอักษร" };
    const sys = await prisma.appSystem.findFirst({ where: { id: ctx.systemId, tenantId: ctx.tenantId, type: "POS" }, select: { id: true } });
    if (!sys) return { ok: false, code: "NOT_FOUND", message: "ไม่พบรายการนี้ในระบบขาย" };
    // คลังที่ผูกสาขา (ไม่เก็บถาวร) ของ POS นี้ — ชุดเดียวกับที่ catalog.setRecipe ยอมรับ
    const posLinks = await prisma.appSystemUnit.findMany({ where: { tenantId: ctx.tenantId, systemId: ctx.systemId, type: "POS" }, select: { unitId: true } });
    const live = posLinks.length
      ? await prisma.businessUnit.findMany({ where: { tenantId: ctx.tenantId, id: { in: posLinks.map((l) => l.unitId) }, status: { not: "ARCHIVED" } }, select: { id: true } })
      : [];
    const invLinks = live.length ? await prisma.appSystemUnit.findMany({ where: { tenantId: ctx.tenantId, type: "INVENTORY", unitId: { in: live.map((u) => u.id) } }, select: { systemId: true } }) : [];
    const invIds = [...new Set(invLinks.map((l) => l.systemId))].sort();
    const m = posMembership(auth.active);
    const seeCost = evaluate(m, { module: "pos", action: "pos.product.manage" }) || evaluate(m, { module: "pos", action: "pos.report.view" });
    const items: { id: string; systemId: string; name: string; sku: string; unitLabel: string; onHand: number; costSatang?: number }[] = [];
    for (const systemId of invIds) {
      if (items.length >= PICK_MAX) break;
      for (const it of await searchItems({ tenantId: ctx.tenantId, systemId }, q, PICK_MAX)) {
        if (it.kind === "SERVICE" || items.length >= PICK_MAX) continue;
        const row: (typeof items)[number] = { id: it.id, systemId: it.systemId, name: it.name, sku: it.sku, unitLabel: it.unitLabel, onHand: it.onHand };
        if (seeCost) row.costSatang = it.costSatang;
        items.push(row);
      }
    }
    return { ok: true, items };
  } catch (e) {
    unstable_rethrow(e);
    return refusalOf("searchRecipeItemsAction", e);
  }
}
