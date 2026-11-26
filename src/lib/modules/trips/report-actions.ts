"use server";
// ─────────────────────────────────────────────────────────────
// trips/report-actions.ts — server action ของจอรายงานทัวร์ (RUN TRIPS T1.7a2 §6.3): ส่งออก CSV
// 🔴 ส่งออกเฉพาะ async function ตัวเดียว · requireUnit (หน่วยจาก slug ทับ input) → assertCan ดูรอบ + ดูรายงาน (บริการตรวจซ้ำพร้อมสิทธิ์ต้นทุนแคบ)
// 🔴 อ่านจาก input เฉพาะ from · to · productId (ฐาน/ช่องทาง/หน่วย/ภาษา/เวลาไม่รับ) · ภาษาไฟล์ = คุกกี้ LOCALE ที่เซิร์ฟเวอร์อ่านเอง
// 🔴 เรียกบริการสองอาร์กิวเมนต์ (ไม่มีทางส่งเพดานของข้อสอบ · บริการใช้นาฬิกาเซิร์ฟเวอร์) · ไม่มีสิทธิ์ ⇒ { ok: false, code: "FORBIDDEN" } ไม่ throw
// ─────────────────────────────────────────────────────────────
import { cookies } from "next/headers";
import { requireUnit } from "@/lib/core/context";
import { assertCan, ForbiddenError, type MembershipCtx } from "@/lib/core/rbac";
import { isLocale, LOCALE_COOKIE } from "@/i18n/config";
import { exportTripReportCsv } from "./reports";

const NEEDS = ["trips.departure.view", "trips.report.view"] as const;
const FORBIDDEN = { ok: false as const, code: "FORBIDDEN" as const, message: "บัญชีนี้ยังไม่ได้รับสิทธิ์ทำรายการนี้ — ติดต่อเจ้าของร้านหรือผู้จัดการเพื่อขอสิทธิ์" };

/** ส่งออกรายงานตามรอบเป็น CSV (ฐานวันเดินทาง · บันทึกการส่งออกก่อนคืนไฟล์) — input: { from, to, productId } */
export async function exportTripReportCsvAction(unitSlug: string, input: unknown) {
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
  const raw = (await cookies()).get(LOCALE_COOKIE)?.value;
  const locale = isLocale(raw) ? raw : "th";
  return exportTripReportCsv({ tenantId: auth.active.tenantId, actorUserId: auth.user.id }, { unitId: unit.id, from: body.from, to: body.to, productId: body.productId, locale });
}
