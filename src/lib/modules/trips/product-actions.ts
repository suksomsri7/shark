"use server";
// ─────────────────────────────────────────────────────────────
// trips/product-actions.ts — server action ของสินค้าทัวร์ (RUN TRIPS T0.2 · จอ T1.1 เรียก)
// ทุกตัว: requireUnit (หน่วยของร้านที่เข้าได้ ไม่งั้น 404) → assertCan (สิทธิ์ trips.product.*) → บริการด้วย {tenantId, actorUserId}
// 🔴 "use server" ⇒ ส่งออกเฉพาะ async function · unitId มาจาก slug ของหน้าเสมอ (ทับค่าที่ฟอร์มส่งมา) · บริการตรวจซ้ำทุกด่าน (สมาชิกภาพสด)
// ─────────────────────────────────────────────────────────────
import { requireUnit } from "@/lib/core/context";
import { ForbiddenError, assertCan, evaluate, type MembershipCtx } from "@/lib/core/rbac";
import * as svc from "./products";
import type { Ctx, Fail } from "./products-core";

type Level = "view" | "trips.product.edit" | "trips.product.publish";
const VIEW_ANY = ["trips.product.view", "trips.product.edit", "trips.product.publish"];
const FORBIDDEN: Fail = { ok: false, code: "FORBIDDEN", message: "บัญชีนี้ยังไม่ได้รับสิทธิ์ทำรายการนี้ — ติดต่อเจ้าของร้านหรือผู้จัดการเพื่อขอสิทธิ์" };

async function guard(unitSlug: string, level: Level): Promise<{ ctx: Ctx; unitId: string } | Fail> {
  const { auth, unit } = await requireUnit(unitSlug);
  const m: MembershipCtx = {
    role: auth.active.role,
    unitAccess: Array.isArray(auth.active.unitAccess) ? auth.active.unitAccess.filter((x): x is string => typeof x === "string") : [],
    permissions: typeof auth.active.permissions === "object" && auth.active.permissions !== null && !Array.isArray(auth.active.permissions) ? (auth.active.permissions as Record<string, unknown>) : {},
  };
  try {
    if (level === "view") {
      if (!VIEW_ANY.some((action) => evaluate(m, { module: "trips", action, unitId: unit.id }))) return FORBIDDEN;
    } else {
      assertCan(m, { module: "trips", action: level, unitId: unit.id });
    }
  } catch (e) {
    if (e instanceof ForbiddenError) return FORBIDDEN;
    throw e;
  }
  return { ctx: { tenantId: auth.active.tenantId, actorUserId: auth.user.id }, unitId: unit.id };
}
const isFail = (x: unknown): x is Fail => typeof x === "object" && x !== null && (x as { ok?: unknown }).ok === false;
const withUnit = (input: unknown, unitId: string): unknown =>
  typeof input === "object" && input !== null && !Array.isArray(input) ? { ...(input as Record<string, unknown>), unitId } : input;

// ── สินค้า ──
export async function createProductAction(unitSlug: string, input: unknown) {
  const g = await guard(unitSlug, "trips.product.edit");
  return isFail(g) ? g : svc.createProduct(g.ctx, withUnit(input, g.unitId));
}
export async function updateProductAction(unitSlug: string, input: unknown) {
  const g = await guard(unitSlug, "trips.product.edit");
  return isFail(g) ? g : svc.updateProduct(g.ctx, withUnit(input, g.unitId));
}
export async function setProductContentAction(unitSlug: string, input: unknown) {
  const g = await guard(unitSlug, "trips.product.edit");
  return isFail(g) ? g : svc.setProductContent(g.ctx, withUnit(input, g.unitId));
}
export async function publishProductAction(unitSlug: string, input: unknown) {
  const g = await guard(unitSlug, "trips.product.publish");
  return isFail(g) ? g : svc.publishProduct(g.ctx, withUnit(input, g.unitId));
}
export async function unpublishProductAction(unitSlug: string, input: unknown) {
  const g = await guard(unitSlug, "trips.product.publish");
  return isFail(g) ? g : svc.unpublishProduct(g.ctx, withUnit(input, g.unitId));
}
export async function archiveProductAction(unitSlug: string, input: unknown) {
  const g = await guard(unitSlug, "trips.product.publish");
  return isFail(g) ? g : svc.archiveProduct(g.ctx, withUnit(input, g.unitId));
}
export async function restoreProductAction(unitSlug: string, input: unknown) {
  const g = await guard(unitSlug, "trips.product.publish");
  return isFail(g) ? g : svc.restoreProduct(g.ctx, withUnit(input, g.unitId));
}
export async function listProductsAction(unitSlug: string, input: unknown) {
  const g = await guard(unitSlug, "view");
  return isFail(g) ? g : svc.listProducts(g.ctx, withUnit(input ?? {}, g.unitId));
}
export async function getProductAction(unitSlug: string, input: unknown) {
  const g = await guard(unitSlug, "view");
  return isFail(g) ? g : svc.getProduct(g.ctx, withUnit(input, g.unitId));
}
export async function getProductBySlugAction(unitSlug: string, input: unknown) {
  const g = await guard(unitSlug, "view");
  return isFail(g) ? g : svc.getProductBySlug(g.ctx, withUnit(input, g.unitId));
}

// ── ตัวเลือก ──
export async function createOptionAction(unitSlug: string, input: unknown) {
  const g = await guard(unitSlug, "trips.product.edit");
  return isFail(g) ? g : svc.createOption(g.ctx, withUnit(input, g.unitId));
}
export async function updateOptionAction(unitSlug: string, input: unknown) {
  const g = await guard(unitSlug, "trips.product.edit");
  return isFail(g) ? g : svc.updateOption(g.ctx, withUnit(input, g.unitId));
}
export async function setOptionActiveAction(unitSlug: string, input: unknown) {
  const g = await guard(unitSlug, "trips.product.edit");
  return isFail(g) ? g : svc.setOptionActive(g.ctx, withUnit(input, g.unitId));
}
export async function reorderOptionsAction(unitSlug: string, input: unknown) {
  const g = await guard(unitSlug, "trips.product.edit");
  return isFail(g) ? g : svc.reorderOptions(g.ctx, withUnit(input, g.unitId));
}

// ── ประเภทคน ──
export async function createPaxTypeAction(unitSlug: string, input: unknown) {
  const g = await guard(unitSlug, "trips.product.edit");
  return isFail(g) ? g : svc.createPaxType(g.ctx, withUnit(input, g.unitId));
}
export async function updatePaxTypeAction(unitSlug: string, input: unknown) {
  const g = await guard(unitSlug, "trips.product.edit");
  return isFail(g) ? g : svc.updatePaxType(g.ctx, withUnit(input, g.unitId));
}
export async function setPaxTypeActiveAction(unitSlug: string, input: unknown) {
  const g = await guard(unitSlug, "trips.product.edit");
  return isFail(g) ? g : svc.setPaxTypeActive(g.ctx, withUnit(input, g.unitId));
}

// ── รายการเสริม ──
export async function createExtraAction(unitSlug: string, input: unknown) {
  const g = await guard(unitSlug, "trips.product.edit");
  return isFail(g) ? g : svc.createExtra(g.ctx, withUnit(input, g.unitId));
}
export async function updateExtraAction(unitSlug: string, input: unknown) {
  const g = await guard(unitSlug, "trips.product.edit");
  return isFail(g) ? g : svc.updateExtra(g.ctx, withUnit(input, g.unitId));
}
export async function setExtraActiveAction(unitSlug: string, input: unknown) {
  const g = await guard(unitSlug, "trips.product.edit");
  return isFail(g) ? g : svc.setExtraActive(g.ctx, withUnit(input, g.unitId));
}
