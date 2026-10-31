"use server";

// ─────────────────────────────────────────────────────────────
// actions/booking-settings.ts — server actions ของจอตั้งค่าจองคิว · SVC B.11 ใบสั่ง §7.3
//   รับ (unitSlug, input) · requireUnit → assertBookingAction (ด่านต่อ action) → ฟังก์ชันใน settings-model → refresh() เมื่อสำเร็จ
//   ผู้กระทำ/ร้าน มาจาก session (auth.active) เท่านั้น — ไม่รับ tenantId/บทบาท/สิทธิ์จาก client
// 🔴 ไฟล์ "use server": export async function เท่านั้น
// ─────────────────────────────────────────────────────────────
import { refresh } from "next/cache";
import { requireUnit } from "@/lib/core/context";
import { assertBookingActionAllowed } from "@/lib/modules/booking/access";
import { applyBookingRolePreset, applyBookingTemplate, setServiceBooking, setStaffService } from "@/lib/modules/booking/settings-model";
import { createResource, setResourceMaintenance, updateResource, type MaintenanceWindow, type ResourceInput, type ResourcePatch } from "@/lib/modules/booking/resources"; // SVC B.13

type UnitAuth = Awaited<ReturnType<typeof requireUnit>>["auth"];

function assertBookingAction(auth: UnitAuth, unitId: string, action: string) {
  const m = {
    role: auth.active.role,
    unitAccess: Array.isArray(auth.active.unitAccess) ? (auth.active.unitAccess as string[]) : [],
    permissions: (auth.active.permissions ?? {}) as Record<string, unknown>,
  };
  assertBookingActionAllowed(m, unitId, action);
}

function actorOf(auth: UnitAuth) {
  return {
    ctx: { tenantId: auth.active.tenantId },
    actor: {
      role: auth.active.role,
      unitAccess: Array.isArray(auth.active.unitAccess) ? (auth.active.unitAccess as string[]) : [],
      permissions: (auth.active.permissions ?? {}) as Record<string, unknown>,
      userId: auth.active.userId,
    },
  };
}

const str = (v: unknown): string => (typeof v === "string" ? v : "");
const numOrNull = (v: unknown): number | null => (typeof v === "number" ? v : null);

export async function applyBookingTemplateAction(unitSlug: string, input: { templateKey: string; overwrite: string }) {
  const { auth, unit } = await requireUnit(unitSlug);
  assertBookingAction(auth, unit.id, "applyBookingTemplateAction");
  const { actor, ctx } = actorOf(auth);
  const overwrite = input?.overwrite === "KEEP_CUSTOM" || input?.overwrite === "RESET_ALL" ? input.overwrite : ("" as "KEEP_CUSTOM");
  const r = await applyBookingTemplate(actor, ctx, { unitId: unit.id, templateKey: str(input?.templateKey), overwrite });
  if (r.ok) refresh();
  return r;
}

export async function setStaffServiceAction(
  unitSlug: string,
  input: { staffId: string; serviceId: string; can: boolean; priceSatang: number | null; durationMin: number | null },
) {
  const { auth, unit } = await requireUnit(unitSlug);
  assertBookingAction(auth, unit.id, "setStaffServiceAction");
  const { actor, ctx } = actorOf(auth);
  const r = await setStaffService(actor, ctx, {
    unitId: unit.id,
    staffId: str(input?.staffId),
    serviceId: str(input?.serviceId),
    can: input?.can === true,
    priceSatang: numOrNull(input?.priceSatang),
    durationMin: numOrNull(input?.durationMin),
  });
  if (r.ok) refresh();
  return r;
}

export async function setServiceBookingAction(unitSlug: string, input: { serviceId: string; bufferMin?: number; bookable?: boolean; depositSatang?: number }) {
  const { auth, unit } = await requireUnit(unitSlug);
  assertBookingAction(auth, unit.id, "setServiceBookingAction");
  const { actor, ctx } = actorOf(auth);
  const r = await setServiceBooking(actor, ctx, {
    unitId: unit.id,
    serviceId: str(input?.serviceId),
    ...(input?.bufferMin !== undefined ? { bufferMin: input.bufferMin } : {}),
    ...(input?.bookable !== undefined ? { bookable: input.bookable } : {}),
    ...(input?.depositSatang !== undefined ? { depositSatang: input.depositSatang } : {}),
  });
  if (r.ok) refresh();
  return r;
}

type RolePresetInput = { membershipId: string; role: string };

export async function applyBookingRolePresetAction(unitSlug: string, input: RolePresetInput) {
  const { auth, unit } = await requireUnit(unitSlug);
  assertBookingAction(auth, unit.id, "applyBookingRolePresetAction");
  const { actor, ctx } = actorOf(auth);
  const role = input?.role === "LEAD" || input?.role === "PROVIDER" || input?.role === "CASHIER" ? input.role : ("" as "LEAD");
  const r = await applyBookingRolePreset(actor, ctx, { unitId: unit.id, membershipId: str(input?.membershipId), role });
  if (r.ok) refresh();
  return r;
}

// ── SVC B.13 ▸ ทรัพยากร (จอง 12 ส่วน "ห้อง · เตียง · อุปกรณ์") — ด่าน action ก่อนอ่าน/เขียน · facade ตรวจสิทธิ์ซ้ำ + ขอบเขตร้าน/สาขาเอง ◂
type ResourceFormInput = { kind?: unknown; name?: unknown; capacity?: unknown; cleanupMin?: unknown; sortOrder?: unknown; active?: unknown };
const pickResource = (i: ResourceFormInput | null | undefined) => {
  const o: Record<string, unknown> = {};
  for (const k of ["kind", "name", "capacity", "cleanupMin", "sortOrder", "active"] as const) if (i && i[k] !== undefined) o[k] = i[k];
  return o;
};

export async function createResourceAction(unitSlug: string, input: ResourceFormInput) {
  const { auth, unit } = await requireUnit(unitSlug);
  assertBookingAction(auth, unit.id, "createResourceAction");
  const { actor } = actorOf(auth);
  const r = await createResource(actor, { tenantId: auth.active.tenantId, unitId: unit.id, actorUserId: auth.active.userId }, pickResource(input) as ResourceInput);
  if (r.ok) refresh();
  return r;
}

export async function updateResourceAction(unitSlug: string, input: { id: string } & ResourceFormInput) {
  const { auth, unit } = await requireUnit(unitSlug);
  assertBookingAction(auth, unit.id, "updateResourceAction");
  const { actor } = actorOf(auth);
  const r = await updateResource(actor, { tenantId: auth.active.tenantId, unitId: unit.id, actorUserId: auth.active.userId }, str(input?.id), pickResource(input) as ResourcePatch);
  if (r.ok) refresh();
  return r;
}

export async function setResourceMaintenanceAction(unitSlug: string, input: { id: string; windows: MaintenanceWindow[] }) {
  const { auth, unit } = await requireUnit(unitSlug);
  assertBookingAction(auth, unit.id, "setResourceMaintenanceAction");
  const { actor } = actorOf(auth);
  const windows = Array.isArray(input?.windows) ? input.windows : ([] as MaintenanceWindow[]);
  const r = await setResourceMaintenance(actor, { tenantId: auth.active.tenantId, unitId: unit.id, actorUserId: auth.active.userId }, str(input?.id), windows);
  if (r.ok) refresh();
  return r;
}
