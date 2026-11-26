"use server";
// ─────────────────────────────────────────────────────────────
// trips/cancel-departure-actions.ts — server action ของ "ร้านยกเลิกรอบที่มีคนจอง" (RUN TRIPS T1.6a1 · ใบสั่ง §5.3 §9)
// 🔴 ส่งออกเฉพาะ export async function · requireUnit (หน่วยของ slug ทับ unitId ในฟอร์ม) → assertCan ทุกคีย์ของทาง (ForbiddenError ⇒ { ok:false, code:"FORBIDDEN" })
//    → อ่านฟิลด์ฟอร์มตามชื่อ §9 → บริการ (บริการตรวจสิทธิ์ซ้ำจาก membership เอง · N3 — action ไม่ส่งสิทธิ์ให้) · ไม่รับเวลา
// ─────────────────────────────────────────────────────────────
import { requireUnit } from "@/lib/core/context";
import { ForbiddenError, assertCan, type MembershipCtx } from "@/lib/core/rbac";
import { cancelDepartureWithBookings, resolveCancelledBooking } from "./cancel-departure";

const FORBIDDEN = { ok: false as const, code: "FORBIDDEN", message: "ไม่มีสิทธิ์ทำรายการนี้" };
const CANCEL_FIELDS = ["departureId", "kind", "reason", "confirmBookings", "expectedVersion", "idempotencyKey"] as const;
const RESOLVE_FIELDS = ["bookingId", "expectedVersion", "choice", "reason", "idempotencyKey"] as const;
const NUMERIC: ReadonlySet<string> = new Set(["confirmBookings", "expectedVersion"]);

/** FormData หรือ object → ค่าของช่องที่รู้จักเท่านั้น (ตัวเลขแปลงเป็น number · ช่องว่างไม่ส่ง) */
function fieldsOf(form: unknown, names: readonly string[]): Record<string, unknown> {
  const get = (k: string): unknown => (form instanceof FormData ? form.get(k) : typeof form === "object" && form !== null && !Array.isArray(form) ? (form as Record<string, unknown>)[k] : undefined);
  const out: Record<string, unknown> = {};
  for (const k of names) {
    const raw = get(k);
    if (raw === null || raw === undefined) continue;
    if (typeof raw === "string" && raw.trim() === "") continue;
    out[k] = NUMERIC.has(k) && typeof raw === "string" && /^\d{1,10}$/.test(raw.trim()) ? Number(raw.trim()) : typeof raw === "string" || typeof raw === "number" ? raw : String(raw);
  }
  return out;
}
async function enter(unitSlug: string, actions: readonly string[]) {
  const { auth, unit } = await requireUnit(unitSlug);
  const m = auth.active as unknown as MembershipCtx;
  try {
    for (const action of actions) assertCan(m, { module: "trips", action, unitId: unit.id });
  } catch (e) {
    if (e instanceof ForbiddenError) return null;
    throw e;
  }
  return { ctx: { tenantId: auth.active.tenantId, actorUserId: auth.user.id }, unitId: unit.id };
}

/** ยกเลิกรอบที่มีคนจอง (กล่องยืนยัน · พิมพ์จำนวนการจอง) — departure.status ∧ refund.approve */
export async function cancelDepartureWithBookingsAction(unitSlug: string, form: unknown) {
  const e = await enter(unitSlug, ["trips.departure.status", "trips.refund.approve"]);
  if (!e) return FORBIDDEN;
  return cancelDepartureWithBookings(e.ctx, { ...fieldsOf(form, CANCEL_FIELDS), unitId: e.unitId });
}

/** ร้านบันทึกทางออกของการจอง: REFUND (refund.request) · NO_MONEY (booking.cancel) · MOVE (booking.edit · a2) */
export async function resolveCancelledBookingAction(unitSlug: string, form: unknown) {
  const f = fieldsOf(form, RESOLVE_FIELDS);
  const key = f.choice === "NO_MONEY" ? "trips.booking.cancel" : f.choice === "MOVE" ? "trips.booking.edit" : "trips.refund.request";
  const e = await enter(unitSlug, [key]);
  if (!e) return FORBIDDEN;
  return resolveCancelledBooking(e.ctx, { ...f, unitId: e.unitId });
}
