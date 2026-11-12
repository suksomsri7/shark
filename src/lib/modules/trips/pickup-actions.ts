"use server";
// ─────────────────────────────────────────────────────────────
// trips/pickup-actions.ts — server action ของโซนรับส่ง (RUN TRIPS T1.1 §5 · แบบ product-actions.ts)
// ทุกตัว: requireUnit (หน่วยของร้านที่เข้าได้ ไม่งั้น 404) → assertCan (trips.product.* ตามระดับ) → บริการด้วย {tenantId, actorUserId} (ตรวจซ้ำทุกด่าน)
// 🔴 "use server" ⇒ ส่งออกเฉพาะ async function · unitId มาจาก slug ของหน้าเสมอ (ทับค่าที่ฟอร์มส่งมา) · ค่าบวกเพิ่ม ⇒ บริการตรวจ trips.price.edit เอง
// ─────────────────────────────────────────────────────────────
import { refresh } from "next/cache";
import { requireUnit } from "@/lib/core/context";
import { ForbiddenError, assertCan, evaluate, type MembershipCtx } from "@/lib/core/rbac";
import * as svc from "./pickup";

type Fail = { ok: false; code: string; message: string };
const FORBIDDEN: Fail = { ok: false, code: "FORBIDDEN", message: "บัญชีนี้ยังไม่ได้รับสิทธิ์ทำรายการนี้ — ติดต่อเจ้าของร้านหรือผู้จัดการเพื่อขอสิทธิ์" };
const VIEW_ANY = ["trips.product.view", "trips.product.edit", "trips.product.publish"];

async function guard(unitSlug: string, level: "view" | "edit"): Promise<{ ctx: svc.TripsScreenCtx; unitId: string } | Fail> {
  const { auth, unit } = await requireUnit(String(unitSlug ?? ""));
  const p = auth.active.permissions;
  const m: MembershipCtx = {
    role: auth.active.role,
    unitAccess: Array.isArray(auth.active.unitAccess) ? auth.active.unitAccess.filter((x): x is string => typeof x === "string") : [],
    permissions: typeof p === "object" && p !== null && !Array.isArray(p) ? (p as Record<string, unknown>) : {},
  };
  try {
    if (level === "view") {
      if (!VIEW_ANY.some((action) => evaluate(m, { module: "trips", action, unitId: unit.id }))) return FORBIDDEN;
    } else assertCan(m, { module: "trips", action: "trips.product.edit", unitId: unit.id });
  } catch (e) {
    if (e instanceof ForbiddenError) return FORBIDDEN;
    throw e;
  }
  return { ctx: { tenantId: auth.active.tenantId, actorUserId: auth.user.id }, unitId: unit.id };
}
const isFail = (x: unknown): x is Fail => typeof x === "object" && x !== null && (x as { ok?: unknown }).ok === false;
const withUnit = (input: unknown, unitId: string): unknown =>
  typeof input === "object" && input !== null && !Array.isArray(input) ? { ...(input as Record<string, unknown>), unitId } : input;
const after = <T extends { ok: boolean }>(r: T): T => {
  if (r.ok) refresh();
  return r;
};

export async function listPickupZonesAction(unitSlug: string, input: unknown) {
  const g = await guard(unitSlug, "view");
  return isFail(g) ? g : svc.listPickupZones(g.ctx, withUnit(input ?? {}, g.unitId));
}
export async function createPickupZoneAction(unitSlug: string, input: unknown) {
  const g = await guard(unitSlug, "edit");
  return isFail(g) ? g : after(await svc.createPickupZone(g.ctx, withUnit(input, g.unitId)));
}
export async function updatePickupZoneAction(unitSlug: string, input: unknown) {
  const g = await guard(unitSlug, "edit");
  return isFail(g) ? g : after(await svc.updatePickupZone(g.ctx, withUnit(input, g.unitId)));
}
export async function setPickupZoneActiveAction(unitSlug: string, input: unknown) {
  const g = await guard(unitSlug, "edit");
  return isFail(g) ? g : after(await svc.setPickupZoneActive(g.ctx, withUnit(input, g.unitId)));
}
export async function reorderPickupZonesAction(unitSlug: string, input: unknown) {
  const g = await guard(unitSlug, "edit");
  return isFail(g) ? g : after(await svc.reorderPickupZones(g.ctx, withUnit(input, g.unitId)));
}
