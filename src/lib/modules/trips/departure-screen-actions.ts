"use server";
// ─────────────────────────────────────────────────────────────
// trips/departure-screen-actions.ts — server action ของจอปฏิทินรอบ (RUN TRIPS T1.2 §7) ที่ไม่มีใน departure-actions/pricing-actions
//   decideBelowMinAction (ใหม่) · ตัวห่อที่จอต้องใช้: หยุดขายแบบ "ถึงเมื่อ" เป็นเวลาร้าน · มอบทรัพยากรพร้อมข้อความรอบที่ชนตามเวลาร้าน
// 🔴 ส่งออกเฉพาะ export async function · ทุกตัว requireUnit + ด่านสิทธิ์ (แบบ departure-actions.ts enter()) · unitId จาก slug ทับค่าใน input · ไม่รับเวลา "now"
// ─────────────────────────────────────────────────────────────
import { requireUnit } from "@/lib/core/context";
import { assertCan, evaluate, type MembershipCtx } from "@/lib/core/rbac";
import { setDepartureStopSell } from "./departures";
import { assignResource, gateUnit, isFail, unitDb } from "./resources";
import { hhmm, localToUtc, utcToLocal } from "./departures-core";
import { decideBelowMin } from "./departure-desk";
import { isCalendarYmd } from "./departure-view-core";

type UnitAuth = Awaited<ReturnType<typeof requireUnit>>["auth"];
const EDIT = ["trips.departure.edit"] as const;
const STATUS = ["trips.departure.status"] as const;

function guard(auth: UnitAuth, unitId: string, actions: readonly string[]) {
  const m: MembershipCtx = {
    role: auth.active.role,
    unitAccess: auth.active.unitAccess as string[],
    permissions: auth.active.permissions as Record<string, unknown>,
  };
  if (actions.some((action) => evaluate(m, { module: "trips", action, unitId }))) return;
  assertCan(m, { module: "trips", action: actions[0], unitId });
}
async function enter(unitSlug: string, input: unknown, actions: readonly string[]) {
  const { auth, unit } = await requireUnit(unitSlug);
  guard(auth, unit.id, actions);
  const body = typeof input === "object" && input !== null && !Array.isArray(input) ? (input as Record<string, unknown>) : {};
  const merged: Record<string, unknown> = { ...body, unitId: unit.id };
  return { ctx: { tenantId: auth.active.tenantId, actorUserId: auth.user.id }, input: merged, unitId: unit.id };
}

/** ตัดสินรอบต่ำกว่าขั้นต่ำ: RUN (ออกขาดทุน) · CANCEL (+ เหตุผล) · MERGE (+ เป้า) */
export async function decideBelowMinAction(unitSlug: string, input: unknown) {
  const e = await enter(unitSlug, input, STATUS);
  return decideBelowMin(e.ctx, e.input);
}

/**
 * หยุดขายบางช่องทาง (กล่องปิดรับ): channels + reason + ถึงเมื่อ (วัน/นาทีของวันตามเวลาร้าน — แปลงเป็นเวลา UTC ที่นี่) · stopSell null = ล้าง
 * input: { departureId, stopSell: { channels, reason, untilDate?, untilMin? } | null } — untilDate/untilMin มาคู่กันเท่านั้น
 */
export async function setStopSellLocalAction(unitSlug: string, input: unknown) {
  const e = await enter(unitSlug, input, EDIT);
  const raw = e.input.stopSell;
  if (raw === null) return setDepartureStopSell(e.ctx, { unitId: e.unitId, departureId: e.input.departureId, stopSell: null });
  const s = typeof raw === "object" && raw !== null && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  let until: string | undefined;
  const hasDate = s.untilDate !== undefined && s.untilDate !== null && s.untilDate !== "";
  const hasMin = s.untilMin !== undefined && s.untilMin !== null;
  if (hasDate || hasMin) {
    // "ถึงเมื่อ" ต้องมีทั้งวัน (วันที่มีจริง) และเวลา (นาทีของวัน 0–1439) — ไม่เดาเที่ยงคืน ไม่ทิ้งค่าเงียบ ๆ
    const min = s.untilMin;
    if (!isCalendarYmd(s.untilDate) || typeof min !== "number" || !Number.isInteger(min) || min < 0 || min >= 1440) {
      return { ok: false as const, code: "INVALID_INPUT", message: "วันและเวลา \"ถึงเมื่อ\" ต้องเป็นวันที่มีจริงและระบุเวลา" };
    }
    const g = await gateUnit(e.ctx, e.unitId, "edit");
    if (isFail(g)) return g;
    until = localToUtc(g.tz, s.untilDate, min).toISOString();
  }
  return setDepartureStopSell(e.ctx, {
    unitId: e.unitId,
    departureId: e.input.departureId,
    stopSell: { channels: s.channels, reason: s.reason, ...(until ? { until } : {}) },
  });
}

/** มอบทรัพยากรให้รอบ — ชนรอบอื่น ⇒ RESOURCE_CLASH + clash { localDate, timeText, productTitle } ตามเวลาร้าน (ให้จอทุกภาษาแสดงรอบที่ชน) */
export async function assignResourceForScreenAction(unitSlug: string, input: unknown) {
  const e = await enter(unitSlug, input, EDIT);
  const r = await assignResource(e.ctx, e.input);
  if (r.ok || r.code !== "RESOURCE_CLASH" || !r.conflict) return r;
  const g = await gateUnit(e.ctx, e.unitId, "edit");
  if (isFail(g)) return r;
  const p = await unitDb(g).tripProduct.findFirst({ where: { id: r.conflict.productId, tenantId: g.tenantId, unitId: g.unitId }, select: { title: true } });
  const title = p && typeof p.title === "object" && p.title !== null && !Array.isArray(p.title) ? (p.title as Record<string, unknown>).th : null;
  const s = utcToLocal(g.tz, new Date(r.conflict.startsAt));
  const en = utcToLocal(g.tz, new Date(r.conflict.endsAt));
  return { ...r, clash: { localDate: r.conflict.localDate, timeText: `${hhmm(s.minutes)}–${hhmm(en.minutes)}`, productTitle: typeof title === "string" ? title : "" } };
}
