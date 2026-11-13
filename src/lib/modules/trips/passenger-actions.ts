"use server";
// ─────────────────────────────────────────────────────────────
// trips/passenger-actions.ts — server actions ของผู้เดินทาง/ข้อมูลส่วนบุคคลฝั่งร้าน (จอ T1.3/T1.4/L1.7 เรียก) · RUN TRIPS T0.8
// ทุกตัว: requireUnit (หน่วยของร้านที่เข้าได้ ไม่งั้น 404) → assertCan (trips.passenger.* / trips.pdpa.manage) → บริการด้วย SellCtx ของหน่วย (STAFF · COUNTER)
// 🔴 "use server" ⇒ ส่งออกเฉพาะ async function · ไม่รับเวลาจากผู้เรียก (บริการใช้นาฬิกาเครื่อง) · หน่วยมาจาก slug ของหน้าเสมอ
// 🔴 สิทธิ์แคบ (reveal · health) ตรวจซ้ำในบริการด้วย canSeeSensitive — assertCan ที่นี่เป็นด่านแรกเท่านั้น (MANAGER ผ่าน assertCan แต่บริการปฏิเสธ)
// ─────────────────────────────────────────────────────────────
import { requireUnit } from "@/lib/core/context";
import { ForbiddenError, assertCan, type MembershipCtx } from "@/lib/core/rbac";
import type { SellCtx } from "@/lib/core/sellable";
import * as pax from "./passengers";
import * as pdpa from "./pdpa";

// ── T0.8 passengers ──
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
/** คำขอมีข้อมูลสุขภาพ / ชนิดไฟล์ MEDICAL (ต้องผ่าน trips.passenger.health ด้วย) */
function touchesHealth(input: unknown): boolean {
  if (typeof input !== "object" || input === null || Array.isArray(input)) return false;
  const o = input as Record<string, unknown>;
  return o.health !== undefined || o.kind === "MEDICAL" || o.what === "HEALTH";
}

// ── อ่าน (trips.passenger.view) ──
export async function getTripPassengersAction(unitSlug: string, input: unknown) {
  const { auth, unit } = await requireUnit(unitSlug);
  try {
    assertCan(memberOf(auth), { module: "trips", action: "trips.passenger.view", unitId: unit.id });
  } catch (e) {
    return denied(e);
  }
  return pax.getTripPassengers(ctxOf(auth, unit.id), input);
}
export async function passengerDocumentUrlAction(unitSlug: string, input: unknown) {
  const { auth, unit } = await requireUnit(unitSlug);
  try {
    assertCan(memberOf(auth), { module: "trips", action: "trips.passenger.view", unitId: unit.id });
  } catch (e) {
    return denied(e);
  }
  return pax.passengerDocumentUrl(ctxOf(auth, unit.id), input);
}
/** เปิดค่าเต็ม — reveal (เลขเอกสาร) / health (สุขภาพ) · บริการตรวจสิทธิ์แคบซ้ำ + audit ทุกครั้ง */
export async function revealPassengerDataAction(unitSlug: string, input: unknown) {
  const { auth, unit } = await requireUnit(unitSlug);
  try {
    assertCan(memberOf(auth), { module: "trips", action: touchesHealth(input) ? "trips.passenger.health" : "trips.passenger.reveal", unitId: unit.id });
  } catch (e) {
    return denied(e);
  }
  return pax.revealPassengerData(ctxOf(auth, unit.id), input);
}

// ── แก้/ลิงก์/เอกสาร (trips.passenger.edit · + health เมื่อแตะข้อมูลสุขภาพ) ──
export async function ensurePassengerSlotsAction(unitSlug: string, input: unknown) {
  const { auth, unit } = await requireUnit(unitSlug);
  try {
    assertCan(memberOf(auth), { module: "trips", action: "trips.passenger.edit", unitId: unit.id });
  } catch (e) {
    return denied(e);
  }
  return pax.ensurePassengerSlots(ctxOf(auth, unit.id), input);
}
export async function updateTripPassengerAction(unitSlug: string, input: unknown) {
  const { auth, unit } = await requireUnit(unitSlug);
  const m = memberOf(auth);
  try {
    assertCan(m, { module: "trips", action: "trips.passenger.edit", unitId: unit.id });
    if (touchesHealth(input)) assertCan(m, { module: "trips", action: "trips.passenger.health", unitId: unit.id });
  } catch (e) {
    return denied(e);
  }
  return pax.updateTripPassenger(ctxOf(auth, unit.id), input);
}
export async function setPassengerFormStatusAction(unitSlug: string, input: unknown) {
  const { auth, unit } = await requireUnit(unitSlug);
  try {
    assertCan(memberOf(auth), { module: "trips", action: "trips.passenger.edit", unitId: unit.id });
  } catch (e) {
    return denied(e);
  }
  return pax.setPassengerFormStatus(ctxOf(auth, unit.id), input);
}
export async function issuePassengerFormLinkAction(unitSlug: string, input: unknown) {
  const { auth, unit } = await requireUnit(unitSlug);
  try {
    assertCan(memberOf(auth), { module: "trips", action: "trips.passenger.edit", unitId: unit.id });
  } catch (e) {
    return denied(e);
  }
  return pax.issuePassengerFormLink(ctxOf(auth, unit.id), input);
}
export async function issueBookingFormLinksAction(unitSlug: string, input: unknown) {
  const { auth, unit } = await requireUnit(unitSlug);
  try {
    assertCan(memberOf(auth), { module: "trips", action: "trips.passenger.edit", unitId: unit.id });
  } catch (e) {
    return denied(e);
  }
  return pax.issueBookingFormLinks(ctxOf(auth, unit.id), input);
}
export async function revokePassengerFormLinkAction(unitSlug: string, input: unknown) {
  const { auth, unit } = await requireUnit(unitSlug);
  try {
    assertCan(memberOf(auth), { module: "trips", action: "trips.passenger.edit", unitId: unit.id });
  } catch (e) {
    return denied(e);
  }
  return pax.revokePassengerFormLink(ctxOf(auth, unit.id), input);
}
export async function recordWitnessedWaiverAction(unitSlug: string, input: unknown) {
  const { auth, unit } = await requireUnit(unitSlug);
  try {
    assertCan(memberOf(auth), { module: "trips", action: "trips.passenger.edit", unitId: unit.id });
  } catch (e) {
    return denied(e);
  }
  return pax.recordWitnessedWaiver(ctxOf(auth, unit.id), input);
}
export async function uploadPassengerDocumentStaffAction(unitSlug: string, input: unknown) {
  const { auth, unit } = await requireUnit(unitSlug);
  const m = memberOf(auth);
  try {
    assertCan(m, { module: "trips", action: "trips.passenger.edit", unitId: unit.id });
    if (touchesHealth(input)) assertCan(m, { module: "trips", action: "trips.passenger.health", unitId: unit.id });
  } catch (e) {
    return denied(e);
  }
  return pax.uploadPassengerDocumentStaff(ctxOf(auth, unit.id), input);
}
export async function withdrawHealthConsentStaffAction(unitSlug: string, input: unknown) {
  const { auth, unit } = await requireUnit(unitSlug);
  try {
    assertCan(memberOf(auth), { module: "trips", action: "trips.passenger.edit", unitId: unit.id });
  } catch (e) {
    return denied(e);
  }
  return pax.withdrawHealthConsentStaff(ctxOf(auth, unit.id), input);
}

// ── คำขอเจ้าของข้อมูล (trips.pdpa.manage · ส่งออก + reveal/health แคบในบริการ) ──
export async function recordPdpaRequestAction(unitSlug: string, input: unknown) {
  const { auth, unit } = await requireUnit(unitSlug);
  try {
    assertCan(memberOf(auth), { module: "trips", action: "trips.pdpa.manage", unitId: unit.id });
  } catch (e) {
    return denied(e);
  }
  return pdpa.recordPdpaRequest(ctxOf(auth, unit.id), input);
}
export async function listPdpaRequestsAction(unitSlug: string, input: unknown) {
  const { auth, unit } = await requireUnit(unitSlug);
  try {
    assertCan(memberOf(auth), { module: "trips", action: "trips.pdpa.manage", unitId: unit.id });
  } catch (e) {
    return denied(e);
  }
  return pdpa.listPdpaRequests(ctxOf(auth, unit.id), input);
}
export async function resolvePdpaRequestAction(unitSlug: string, input: unknown) {
  const { auth, unit } = await requireUnit(unitSlug);
  try {
    assertCan(memberOf(auth), { module: "trips", action: "trips.pdpa.manage", unitId: unit.id });
  } catch (e) {
    return denied(e);
  }
  return pdpa.resolvePdpaRequest(ctxOf(auth, unit.id), input);
}
export async function exportPassengerDataAction(unitSlug: string, input: unknown) {
  const { auth, unit } = await requireUnit(unitSlug);
  const m = memberOf(auth);
  try {
    assertCan(m, { module: "trips", action: "trips.pdpa.manage", unitId: unit.id });
    assertCan(m, { module: "trips", action: "trips.passenger.reveal", unitId: unit.id });
    assertCan(m, { module: "trips", action: "trips.passenger.health", unitId: unit.id });
  } catch (e) {
    return denied(e);
  }
  return pdpa.exportPassengerData(ctxOf(auth, unit.id), input);
}
// ── /T0.8 passengers ──
