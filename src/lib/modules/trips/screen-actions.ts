"use server";
// ─────────────────────────────────────────────────────────────
// trips/screen-actions.ts — server action ของจอ TRIPS (RUN TRIPS T1.1 §6): บันทึก/คืนค่าตั้ง trips · รีเฟรชจอหลังเขียนผ่าน action ของ T0.x
// ทุกตัว: requireUnit (หน่วยของร้านที่เข้าได้ ไม่งั้น 404) → หน่วย TRIPS → assertCan → บริการ (ตรวจซ้ำทุกด่านจากสมาชิกภาพสด)
// 🔴 "use server" ⇒ ส่งออกเฉพาะ async function · unitId มาจาก slug ของหน้าเสมอ · scope/scopeId ตรวจกับฐานในบริการ
// ─────────────────────────────────────────────────────────────
import { refresh } from "next/cache";
import { requireUnit } from "@/lib/core/context";
import { ForbiddenError, assertCan, evaluate, type MembershipCtx } from "@/lib/core/rbac";
import type { RemoveResult, SetFail, SetResult } from "@/lib/core/settings";
import { resetTripsSetting, saveTripsSettings } from "./trips-settings";

type Guarded = { ctx: { tenantId: string; actorUserId: string }; unitId: string };
const NO_RIGHT: SetFail = { ok: false, code: "PERMISSION", issues: [{ code: "PERMISSION", messageTh: "บัญชีนี้ยังไม่ได้รับสิทธิ์ทำรายการนี้ — ติดต่อเจ้าของร้านหรือผู้จัดการเพื่อขอสิทธิ์" }] };
const NOT_TRIPS: SetFail = { ok: false, code: "NOT_FOUND", issues: [{ code: "NOT_FOUND", messageTh: "หน่วยนี้ไม่ใช่หน่วยทัวร์" }] };

/** หน่วย TRIPS + ต้องมีสิทธิ์อย่างน้อยหนึ่งตัวในชุด (สิทธิ์ต่อช่องตัดสินที่เครื่องยนต์ค่าตั้ง) */
async function guard(unitSlug: string, anyOf: readonly string[]): Promise<Guarded | SetFail> {
  const { auth, unit } = await requireUnit(String(unitSlug ?? ""));
  if (unit.type !== "TRIPS") return NOT_TRIPS;
  const p = auth.active.permissions;
  const m: MembershipCtx = {
    role: auth.active.role,
    unitAccess: Array.isArray(auth.active.unitAccess) ? auth.active.unitAccess.filter((x): x is string => typeof x === "string") : [],
    permissions: typeof p === "object" && p !== null && !Array.isArray(p) ? (p as Record<string, unknown>) : {},
  };
  const first = anyOf.find((action) => evaluate(m, { module: "trips", action, unitId: unit.id })) ?? anyOf[0];
  try {
    assertCan(m, { module: "trips", action: first, unitId: unit.id });
  } catch (e) {
    if (e instanceof ForbiddenError) return NO_RIGHT;
    throw e;
  }
  return { ctx: { tenantId: auth.active.tenantId, actorUserId: auth.user.id }, unitId: unit.id };
}
const isFail = (x: unknown): x is SetFail => typeof x === "object" && x !== null && (x as { ok?: unknown }).ok === false;
const SETTINGS_ANY = ["trips.settings.edit", "trips.settings.money"] as const;
const TRIPS_ANY = ["trips.product.view", "trips.product.edit", "trips.product.publish", "trips.price.edit", "trips.settings.edit", "trips.settings.money"] as const;

export async function saveTripsSettingsAction(unitSlug: string, changes: unknown, opts?: { ackLegalWarn?: boolean }): Promise<SetResult> {
  const g = await guard(unitSlug, SETTINGS_ANY);
  if (isFail(g)) return g;
  const r = await saveTripsSettings(g.ctx, { unitId: g.unitId, changes, ackLegalWarn: opts?.ackLegalWarn === true });
  if (r.ok) refresh();
  return r;
}

export async function resetTripsSettingAction(unitSlug: string, target: unknown): Promise<RemoveResult> {
  const g = await guard(unitSlug, SETTINGS_ANY);
  if (isFail(g)) return g;
  const t = typeof target === "object" && target !== null && !Array.isArray(target) ? (target as Record<string, unknown>) : {};
  const r = await resetTripsSetting(g.ctx, { unitId: g.unitId, key: t.key, scope: t.scope, scopeId: t.scopeId });
  if (r.ok) refresh();
  return r;
}

/** รีเฟรชจอ TRIPS หลังเขียนผ่าน action ของ T0.x (ซึ่งไม่ refresh เอง) — ไม่เขียนอะไร */
export async function refreshTripsScreenAction(unitSlug: string): Promise<{ ok: boolean }> {
  const g = await guard(unitSlug, TRIPS_ANY);
  if (isFail(g)) return { ok: false };
  refresh();
  return { ok: true };
}
