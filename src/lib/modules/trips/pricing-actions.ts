"use server";
// ─────────────────────────────────────────────────────────────
// trips/pricing-actions.ts — server action ของราคา/ฤดูกาล/กฎราคา/โค้ดส่วนลด + quote ฝั่งพนักงาน (RUN TRIPS T0.5 · จอ T1.x เรียก)
// ทุกตัว: requireUnit (หน่วยของร้านที่เข้าได้ ไม่งั้น 404) → assertCan (trips.price.* / trips.product.view) → บริการด้วย SellCtx ของหน่วย
// 🔴 "use server" ⇒ ส่งออกเฉพาะ async function · ไม่รับเวลา (บริการใช้นาฬิกาเครื่อง) · unitId มาจาก slug ของหน้าเสมอ
// 🔴 ราคาแก้มือ: ส่ง canOverride เฉพาะหลัง assertCan("trips.price.override") ผ่านแล้วเท่านั้น · approval ไม่รับจากหน้าจอ (T0.6 ตรวจกับ facade approval)
// ─────────────────────────────────────────────────────────────
import { requireUnit } from "@/lib/core/context";
import { ForbiddenError, assertCan, type MembershipCtx } from "@/lib/core/rbac";
import { evaluate } from "@/lib/core/rbac"; // TRIPS T1.1
import type { LineRequest, SellCtx } from "@/lib/core/sellable";
import * as prices from "./prices";
import * as pricing from "./pricing";
import type { QuoteLineOpts } from "./pricing";

type Auth = Awaited<ReturnType<typeof requireUnit>>["auth"];
const FORBIDDEN = { ok: false as const, code: "FORBIDDEN" as const, messageTh: "บัญชีนี้ยังไม่ได้รับสิทธิ์ทำรายการนี้ — ติดต่อเจ้าของร้านหรือผู้จัดการเพื่อขอสิทธิ์", retryable: false as const };

function memberOf(auth: Auth): MembershipCtx {
  const p = auth.active.permissions;
  return {
    role: auth.active.role,
    unitAccess: Array.isArray(auth.active.unitAccess) ? auth.active.unitAccess.filter((x): x is string => typeof x === "string") : [],
    permissions: typeof p === "object" && p !== null && !Array.isArray(p) ? (p as Record<string, unknown>) : {},
  };
}
function ctxOf(auth: Auth, unitId: string): SellCtx {
  return { tenantId: auth.active.tenantId, unitId, channel: "COUNTER", actor: { kind: "STAFF", userId: auth.user.id }, locale: "th" };
}
function denied(e: unknown): typeof FORBIDDEN {
  if (e instanceof ForbiddenError) return FORBIDDEN;
  throw e;
}
const isRec = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
// TRIPS T1.1 ▸ มติผู้คุม: สิทธิ์ "ดูราคา" ให้ตรงกับ product-actions.ts (view|edit|publish) — เพิ่มบรรทัดอย่างเดียว (ข้อสอบ S-14 ห้ามลบบรรทัด T0.x) ◂
const VIEW_ANY_T11 = ["trips.product.view", "trips.product.edit", "trips.product.publish"];
const canViewTrips = (m: MembershipCtx, unitId: string): boolean => VIEW_ANY_T11.some((action) => evaluate(m, { module: "trips", action, unitId }));

// ── ฤดูกาล ──
export async function listSeasonsAction(unitSlug: string, input: unknown) {
  const { auth, unit } = await requireUnit(unitSlug);
  if (canViewTrips(memberOf(auth), unit.id)) return prices.listSeasons(ctxOf(auth, unit.id), input); // TRIPS T1.1 ▸ view|edit|publish ◂
  try {
    assertCan(memberOf(auth), { module: "trips", action: "trips.product.view", unitId: unit.id });
  } catch (e) {
    return denied(e);
  }
  return prices.listSeasons(ctxOf(auth, unit.id), input);
}
export async function saveSeasonAction(unitSlug: string, input: unknown) {
  const { auth, unit } = await requireUnit(unitSlug);
  try {
    assertCan(memberOf(auth), { module: "trips", action: "trips.price.edit", unitId: unit.id });
  } catch (e) {
    return denied(e);
  }
  return prices.saveSeason(ctxOf(auth, unit.id), input);
}
export async function archiveSeasonAction(unitSlug: string, input: unknown) {
  const { auth, unit } = await requireUnit(unitSlug);
  try {
    assertCan(memberOf(auth), { module: "trips", action: "trips.price.edit", unitId: unit.id });
  } catch (e) {
    return denied(e);
  }
  return prices.archiveSeason(ctxOf(auth, unit.id), input);
}

// ── ราคา ──
export async function listPricesAction(unitSlug: string, input: unknown) {
  const { auth, unit } = await requireUnit(unitSlug);
  if (canViewTrips(memberOf(auth), unit.id)) return prices.listPrices(ctxOf(auth, unit.id), input); // TRIPS T1.1 ▸ view|edit|publish ◂
  try {
    assertCan(memberOf(auth), { module: "trips", action: "trips.product.view", unitId: unit.id });
  } catch (e) {
    return denied(e);
  }
  return prices.listPrices(ctxOf(auth, unit.id), input);
}
export async function setPriceAction(unitSlug: string, input: unknown) {
  const { auth, unit } = await requireUnit(unitSlug);
  try {
    assertCan(memberOf(auth), { module: "trips", action: "trips.price.edit", unitId: unit.id });
  } catch (e) {
    return denied(e);
  }
  return prices.setPrice(ctxOf(auth, unit.id), input);
}
export async function removePriceAction(unitSlug: string, input: unknown) {
  const { auth, unit } = await requireUnit(unitSlug);
  try {
    assertCan(memberOf(auth), { module: "trips", action: "trips.price.edit", unitId: unit.id });
  } catch (e) {
    return denied(e);
  }
  return prices.removePrice(ctxOf(auth, unit.id), input);
}

// ── กฎราคา + โค้ดส่วนลด ──
export async function savePriceRuleAction(unitSlug: string, input: unknown) {
  const { auth, unit } = await requireUnit(unitSlug);
  try {
    assertCan(memberOf(auth), { module: "trips", action: "trips.price.edit", unitId: unit.id });
  } catch (e) {
    return denied(e);
  }
  return prices.savePriceRule(ctxOf(auth, unit.id), input);
}
export async function setPriceRuleActiveAction(unitSlug: string, input: unknown) {
  const { auth, unit } = await requireUnit(unitSlug);
  try {
    assertCan(memberOf(auth), { module: "trips", action: "trips.price.edit", unitId: unit.id });
  } catch (e) {
    return denied(e);
  }
  return prices.setPriceRuleActive(ctxOf(auth, unit.id), input);
}

// ── quote ฝั่งพนักงาน (หน้าร้าน) — ราคาแก้มือได้เฉพาะผู้มีสิทธิ์ trips.price.override ──
export async function quoteTripLineAction(unitSlug: string, line: unknown, overrides: unknown) {
  const { auth, unit } = await requireUnit(unitSlug);
  const m = memberOf(auth);
  try {
    assertCan(m, { module: "trips", action: "trips.product.view", unitId: unit.id });
  } catch (e) {
    return denied(e);
  }
  const ln = (isRec(line) ? { ...line, unitId: unit.id } : line) as LineRequest;
  const ov = Array.isArray(overrides) ? overrides : [];
  if (ov.length === 0) return pricing.quoteTripLine(ctxOf(auth, unit.id), ln, {});
  try {
    assertCan(m, { module: "trips", action: "trips.price.override", unitId: unit.id });
  } catch (e) {
    return denied(e);
  }
  return pricing.quoteTripLine(ctxOf(auth, unit.id), ln, { overrides: ov as QuoteLineOpts["overrides"], canOverride: true });
}
