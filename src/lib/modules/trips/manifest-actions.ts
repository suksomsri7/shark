"use server";
// ─────────────────────────────────────────────────────────────
// trips/manifest-actions.ts — server action ของใบรายชื่อรายวัน (RUN TRIPS T1.4a §6): ส่งออก CSV · เปิดดูข้อมูลสุขภาพ · บันทึกการพิมพ์
// 🔴 ส่งออกเฉพาะ export async function · ทุกตัว requireUnit + ด่านสิทธิ์ (ดูรอบ ∧ ดูผู้เดินทาง — บริการตรวจซ้ำพร้อมสิทธิ์สุขภาพตรงตัว) · unitId จากหน่วยของ slug ทับค่าใน input
// 🔴 ไม่มีสิทธิ์ ⇒ คืนผล { ok: false, code: "FORBIDDEN" } (ไม่ throw — ไม่เป็น 500 · จอแสดงข้อความไม่มีสิทธิ์)
// 🔴 ไม่รับเวลาจากผู้เรียก (บริการใช้นาฬิกาเซิร์ฟเวอร์) · ภาษาไฟล์ส่งออกมาจากภาษาของผู้ใช้ที่เซิร์ฟเวอร์อ่านเอง (ไม่รับจาก input)
// ─────────────────────────────────────────────────────────────
import { getLocale } from "next-intl/server";
import { requireUnit } from "@/lib/core/context";
import { assertCan, ForbiddenError, type MembershipCtx } from "@/lib/core/rbac";
import { exportManifestCsv, recordManifestPrint, revealManifestHealth } from "./manifest";

const NEEDS = ["trips.departure.view", "trips.passenger.view"] as const;
type Denied = { ok: false; code: "FORBIDDEN"; message: string };
const FORBIDDEN: Denied = { ok: false, code: "FORBIDDEN", message: "บัญชีนี้ยังไม่ได้รับสิทธิ์ทำรายการนี้ — ติดต่อเจ้าของร้านหรือผู้จัดการเพื่อขอสิทธิ์" };
type Entered = { ctx: { tenantId: string; actorUserId: string }; unitId: string; departureId: unknown; purpose: unknown };
const isDenied = (x: Entered | Denied): x is Denied => "ok" in x && x.ok === false;

async function enter(unitSlug: string, input: unknown): Promise<Entered | Denied> {
  const { auth, unit } = await requireUnit(String(unitSlug ?? ""));
  const p = auth.active.permissions;
  const m: MembershipCtx = {
    role: auth.active.role,
    unitAccess: Array.isArray(auth.active.unitAccess) ? auth.active.unitAccess.filter((x): x is string => typeof x === "string") : [],
    permissions: typeof p === "object" && p !== null && !Array.isArray(p) ? (p as Record<string, unknown>) : {},
  };
  try {
    for (const action of NEEDS) assertCan(m, { module: "trips", action, unitId: unit.id });
  } catch (err) {
    if (err instanceof ForbiddenError) return FORBIDDEN;
    throw err;
  }
  const body = typeof input === "object" && input !== null && !Array.isArray(input) ? (input as Record<string, unknown>) : {};
  return { ctx: { tenantId: auth.active.tenantId, actorUserId: auth.user.id }, unitId: unit.id, departureId: body.departureId, purpose: body.purpose };
}

/** ส่งออกใบรายชื่อเป็น CSV (บันทึกการนำออกก่อนคืนไฟล์) — input: { departureId } */
export async function exportManifestCsvAction(unitSlug: string, input: unknown) {
  const e = await enter(unitSlug, input);
  if (isDenied(e)) return e;
  const locale = (await getLocale()) === "en" ? "en" : "th";
  return exportManifestCsv(e.ctx, { unitId: e.unitId, departureId: e.departureId, locale });
}

/** เปิดดูข้อมูลสุขภาพของรอบ (สิทธิ์สุขภาพตรงตัว · บันทึกรายคน) — input: { departureId, purpose } */
export async function revealManifestHealthAction(unitSlug: string, input: unknown) {
  const e = await enter(unitSlug, input);
  if (isDenied(e)) return e;
  return revealManifestHealth(e.ctx, { unitId: e.unitId, departureId: e.departureId, purpose: e.purpose });
}

/** บันทึกการพิมพ์ใบรายชื่อ — จอเรียกก่อนเปิดกล่องพิมพ์ของเบราว์เซอร์ · input: { departureId } */
export async function recordManifestPrintAction(unitSlug: string, input: unknown) {
  const e = await enter(unitSlug, input);
  if (isDenied(e)) return e;
  return recordManifestPrint(e.ctx, { unitId: e.unitId, departureId: e.departureId });
}
