"use server";
// ─────────────────────────────────────────────────────────────
// trips/manifest-actions.ts — server action ของใบรายชื่อรายวัน (RUN TRIPS T1.4a §6): ส่งออก CSV · เปิดดูข้อมูลสุขภาพ · บันทึกการพิมพ์
// 🔴 ส่งออกเฉพาะ export async function · ทุกตัว requireUnit + ด่านสิทธิ์ (ดูรอบ ∧ ดูผู้เดินทาง — บริการตรวจซ้ำพร้อมสิทธิ์สุขภาพตรงตัว) · unitId จากหน่วยของ slug ทับค่าใน input
// 🔴 ไม่รับเวลาจากผู้เรียก (บริการใช้นาฬิกาเซิร์ฟเวอร์) · ภาษาไฟล์ส่งออกมาจากภาษาของผู้ใช้ที่เซิร์ฟเวอร์อ่านเอง (ไม่รับจาก input)
// ─────────────────────────────────────────────────────────────
import { getLocale } from "next-intl/server";
import { requireUnit } from "@/lib/core/context";
import { assertCan, type MembershipCtx } from "@/lib/core/rbac";
import { exportManifestCsv, recordManifestPrint, revealManifestHealth } from "./manifest";

const NEEDS = ["trips.departure.view", "trips.passenger.view"] as const;

async function enter(unitSlug: string, input: unknown) {
  const { auth, unit } = await requireUnit(unitSlug);
  const m: MembershipCtx = {
    role: auth.active.role,
    unitAccess: auth.active.unitAccess as string[],
    permissions: auth.active.permissions as Record<string, unknown>,
  };
  for (const action of NEEDS) assertCan(m, { module: "trips", action, unitId: unit.id });
  const body = typeof input === "object" && input !== null && !Array.isArray(input) ? (input as Record<string, unknown>) : {};
  return { ctx: { tenantId: auth.active.tenantId, actorUserId: auth.user.id }, unitId: unit.id, departureId: body.departureId, purpose: body.purpose };
}

/** ส่งออกใบรายชื่อเป็น CSV (บันทึกการนำออกก่อนคืนไฟล์) — input: { departureId } */
export async function exportManifestCsvAction(unitSlug: string, input: unknown) {
  const e = await enter(unitSlug, input);
  const locale = (await getLocale()) === "en" ? "en" : "th";
  return exportManifestCsv(e.ctx, { unitId: e.unitId, departureId: e.departureId, locale });
}

/** เปิดดูข้อมูลสุขภาพของรอบ (สิทธิ์สุขภาพตรงตัว · บันทึกรายคน) — input: { departureId, purpose } */
export async function revealManifestHealthAction(unitSlug: string, input: unknown) {
  const e = await enter(unitSlug, input);
  return revealManifestHealth(e.ctx, { unitId: e.unitId, departureId: e.departureId, purpose: e.purpose });
}

/** บันทึกการพิมพ์ใบรายชื่อ — จอเรียกก่อนเปิดกล่องพิมพ์ของเบราว์เซอร์ · input: { departureId } */
export async function recordManifestPrintAction(unitSlug: string, input: unknown) {
  const e = await enter(unitSlug, input);
  return recordManifestPrint(e.ctx, { unitId: e.unitId, departureId: e.departureId });
}
