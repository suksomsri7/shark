"use server";
// ─────────────────────────────────────────────────────────────
// trips/departure-actions.ts — server actions ของรอบ · กฎซ้ำ · ทรัพยากร · RUN TRIPS T0.3
// 🔴 ส่งออกเฉพาะ export async function · ทุกตัว requireUnit + assertCan ก่อนเรียกบริการ (F6) · บริการตรวจด่านซ้ำเอง (ลำดับ T0.2 §5)
// 🔴 action ไม่รับเวลาจากผู้เรียก (บริการใช้นาฬิกาจริง) · unitId มาจาก slug ที่ requireUnit ตรวจแล้วเสมอ (ทับค่าจาก input)
// ─────────────────────────────────────────────────────────────
import { requireUnit } from "@/lib/core/context";
import { assertCan, evaluate, type MembershipCtx } from "@/lib/core/rbac";
import * as dep from "./departures";
import * as res from "./resources";

type UnitAuth = Awaited<ReturnType<typeof requireUnit>>["auth"];

const VIEW = ["trips.departure.view", "trips.departure.edit", "trips.departure.status"] as const;
const EDIT = ["trips.departure.edit"] as const;
const STATUS = ["trips.departure.status"] as const;
const RESOURCE = ["trips.resource.edit"] as const;
const RESOURCE_VIEW = [...VIEW, "trips.resource.edit"] as const;

/** ด่านสิทธิ์ของ action: ผ่านเมื่อได้สิทธิ์ข้อใดข้อหนึ่ง · ไม่ผ่าน ⇒ assertCan โยน ForbiddenError */
function guard(auth: UnitAuth, unitId: string, actions: readonly string[]) {
  const m: MembershipCtx = {
    role: auth.active.role,
    unitAccess: auth.active.unitAccess as string[],
    permissions: auth.active.permissions as Record<string, unknown>,
  };
  if (actions.some((action) => evaluate(m, { module: "trips", action, unitId }))) return;
  assertCan(m, { module: "trips", action: actions[0], unitId });
}

/** ตรวจ slug + สิทธิ์ แล้วคืน ctx ของบริการ + input ที่ unitId ถูกทับด้วยหน่วยจริง */
async function enter(unitSlug: string, input: unknown, actions: readonly string[]) {
  const { auth, unit } = await requireUnit(unitSlug);
  guard(auth, unit.id, actions);
  const body = typeof input === "object" && input !== null && !Array.isArray(input) ? input : {};
  return { ctx: { tenantId: auth.active.tenantId, actorUserId: auth.user.id }, input: { ...body, unitId: unit.id } };
}

// ── กฎซ้ำ ──
export async function createScheduleAction(unitSlug: string, input: unknown) {
  const e = await enter(unitSlug, input, EDIT);
  return dep.createSchedule(e.ctx, e.input);
}
export async function updateScheduleAction(unitSlug: string, input: unknown) {
  const e = await enter(unitSlug, input, EDIT);
  return dep.updateSchedule(e.ctx, e.input);
}
export async function pauseScheduleAction(unitSlug: string, input: unknown) {
  const e = await enter(unitSlug, input, EDIT);
  return dep.pauseSchedule(e.ctx, e.input);
}
export async function resumeScheduleAction(unitSlug: string, input: unknown) {
  const e = await enter(unitSlug, input, EDIT);
  return dep.resumeSchedule(e.ctx, e.input);
}
export async function listSchedulesAction(unitSlug: string, input: unknown) {
  const e = await enter(unitSlug, input, VIEW);
  return dep.listSchedules(e.ctx, e.input);
}
export async function materializeScheduleAction(unitSlug: string, input: unknown) {
  const e = await enter(unitSlug, input, EDIT);
  // งบต่อคำขอ: ไม่เกิน MATERIALIZE_ACTION_MAX_CHUNKS ช่วง · ที่เหลืองานรายวัน trips.generateDepartures ทำต่อ (ผล complete: false + doneUntil)
  return dep.materializeSchedule(e.ctx, e.input, { maxChunks: dep.MATERIALIZE_ACTION_MAX_CHUNKS });
}

// ── รอบ ──
export async function createDepartureAction(unitSlug: string, input: unknown) {
  const e = await enter(unitSlug, input, EDIT);
  return dep.createDeparture(e.ctx, e.input);
}
export async function updateDepartureAction(unitSlug: string, input: unknown) {
  const e = await enter(unitSlug, input, EDIT);
  return dep.updateDeparture(e.ctx, e.input);
}
export async function setDepartureCapacityAction(unitSlug: string, input: unknown) {
  const e = await enter(unitSlug, input, EDIT);
  return dep.setDepartureCapacity(e.ctx, e.input);
}
export async function setDepartureStatusAction(unitSlug: string, input: unknown) {
  const e = await enter(unitSlug, input, STATUS);
  return dep.setDepartureStatus(e.ctx, e.input);
}
export async function cancelDepartureAction(unitSlug: string, input: unknown) {
  const e = await enter(unitSlug, input, STATUS);
  return dep.cancelDeparture(e.ctx, e.input);
}
export async function getDepartureAction(unitSlug: string, input: unknown) {
  const e = await enter(unitSlug, input, VIEW);
  return dep.getDeparture(e.ctx, e.input);
}
export async function listDeparturesAction(unitSlug: string, input: unknown) {
  const e = await enter(unitSlug, input, VIEW);
  return dep.listDepartures(e.ctx, e.input);
}
export async function refreshDeparturePolicyAction(unitSlug: string, input: unknown) {
  const e = await enter(unitSlug, input, EDIT);
  return dep.refreshDeparturePolicy(e.ctx, e.input);
}
export async function setDepartureStopSellAction(unitSlug: string, input: unknown) {
  const e = await enter(unitSlug, input, EDIT);
  return dep.setDepartureStopSell(e.ctx, e.input);
}
export async function evaluateMinPaxAction(unitSlug: string, input: unknown) {
  const e = await enter(unitSlug, input, STATUS);
  return dep.evaluateMinPax(e.ctx, e.input);
}

// ── ทรัพยากร ──
export async function createResourceAction(unitSlug: string, input: unknown) {
  const e = await enter(unitSlug, input, RESOURCE);
  return res.createResource(e.ctx, e.input);
}
export async function updateResourceAction(unitSlug: string, input: unknown) {
  const e = await enter(unitSlug, input, RESOURCE);
  return res.updateResource(e.ctx, e.input);
}
export async function setResourceActiveAction(unitSlug: string, input: unknown) {
  const e = await enter(unitSlug, input, RESOURCE);
  return res.setResourceActive(e.ctx, e.input);
}
export async function listResourcesAction(unitSlug: string, input: unknown) {
  const e = await enter(unitSlug, input, RESOURCE_VIEW);
  return res.listResources(e.ctx, e.input);
}
export async function assignResourceAction(unitSlug: string, input: unknown) {
  const e = await enter(unitSlug, input, EDIT);
  return res.assignResource(e.ctx, e.input);
}
export async function unassignResourceAction(unitSlug: string, input: unknown) {
  const e = await enter(unitSlug, input, EDIT);
  return res.unassignResource(e.ctx, e.input);
}
