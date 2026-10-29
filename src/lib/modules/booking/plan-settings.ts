// SVC B.3 — ค่าตั้งที่ resolve แล้ว → PlanSettings ของตัววางคิว (pure · ใบสั่ง svc-brief-b.3 §3.1 · carry ใบ B.0 "แปลงค่าตั้ง → PlanSettings")
// 🔴 pure: import ได้เฉพาะ `import type` จาก ./planner · ไม่มี prisma/next · ไม่อ่านนาฬิกา · ไม่สุ่ม · ไม่แก้ object ที่รับเข้า
// 🔴 คีย์ขาด/ชนิดผิด/ค่า enum ที่ไม่รู้จัก ⇒ throw (ห้ามเดาค่า — ตัววางคิวผิดเงียบ ๆ แย่กว่าล้มดัง)
// 🔴 noShowAfterMin null ⇒ Infinity ⇒ ห้ามเก็บ PlanSettings เป็น JSON ตรง ๆ (JSON.stringify(Infinity) = null)
import type { PlanSettings } from "./planner";

export const PLAN_SETTING_KEYS: readonly string[] = Object.freeze([
  "booking.queue.order",
  "booking.queue.walkInFillGaps",
  "booking.queue.safetyMin",
  "booking.late.graceMin",
  "booking.late.noShowAfterMin",
  "booking.late.afterGrace",
  "booking.queue.priorityGroups",
  "booking.queue.walkInCloseWaitMin",
  "booking.queue.overrunExtendMin",
  "booking.staff.minBreakMin",
  "booking.staff.maxJobsPerDay",
]);

function has(values: Readonly<Record<string, unknown>>, key: string): unknown {
  if (!values || typeof values !== "object" || !Object.prototype.hasOwnProperty.call(values, key)) {
    throw new Error(`[plan-settings] ไม่มีค่า ${key}`);
  }
  return values[key];
}

function num(values: Readonly<Record<string, unknown>>, key: string): number {
  const v = has(values, key);
  if (typeof v !== "number" || !Number.isFinite(v)) throw new Error(`[plan-settings] ${key} ต้องเป็นตัวเลข`);
  return v;
}

function numOrNull(values: Readonly<Record<string, unknown>>, key: string): number | null {
  const v = has(values, key);
  if (v === null) return null;
  if (typeof v !== "number" || !Number.isFinite(v)) throw new Error(`[plan-settings] ${key} ต้องเป็นตัวเลขหรือว่าง`);
  return v;
}

function bool(values: Readonly<Record<string, unknown>>, key: string): boolean {
  const v = has(values, key);
  if (typeof v !== "boolean") throw new Error(`[plan-settings] ${key} ต้องเป็นจริง/เท็จ`);
  return v;
}

function queueOrderOf(v: unknown): PlanSettings["queueOrder"] {
  const s = v as "SINGLE_LINE_BY_TIME" | "APPOINTMENT_FIRST";
  switch (s) {
    case "SINGLE_LINE_BY_TIME":
      return "SINGLE_LINE";
    case "APPOINTMENT_FIRST":
      return "APPOINTMENT_FIRST";
    default: {
      const never: never = s;
      throw new Error(`[plan-settings] booking.queue.order ไม่รู้จัก ${String(never)}`);
    }
  }
}

function lateActionOf(v: unknown): PlanSettings["lateAction"] {
  const s = v as "RELEASE_REQUEUE" | "WAIT_NOTIFY_COUNTER";
  switch (s) {
    case "RELEASE_REQUEUE":
      return "RELEASE";
    case "WAIT_NOTIFY_COUNTER":
      return "HOLD";
    default: {
      const never: never = s;
      throw new Error(`[plan-settings] booking.late.afterGrace ไม่รู้จัก ${String(never)}`);
    }
  }
}

/** ค่าที่ resolve แล้ว (คีย์ → value) → PlanSettings · คีย์เกินไม่มีผล · ไม่แก้ input */
export function planSettingsFrom(values: Readonly<Record<string, unknown>>): PlanSettings {
  const groups = has(values, "booking.queue.priorityGroups");
  if (!Array.isArray(groups)) throw new Error("[plan-settings] booking.queue.priorityGroups ต้องเป็นรายการ");
  const noShow = numOrNull(values, "booking.late.noShowAfterMin");
  return {
    queueOrder: queueOrderOf(has(values, "booking.queue.order")),
    backfill: bool(values, "booking.queue.walkInFillGaps"),
    safetyBeforeBookingMin: num(values, "booking.queue.safetyMin"),
    graceMin: num(values, "booking.late.graceMin"),
    noShowAfterMin: noShow === null ? Number.POSITIVE_INFINITY : noShow,
    lateAction: lateActionOf(has(values, "booking.late.afterGrace")),
    priorityEnabled: groups.length > 0,
    walkInMaxWaitMin: num(values, "booking.queue.walkInCloseWaitMin"),
    overrunExtendMin: num(values, "booking.queue.overrunExtendMin"),
    minBreakMin: num(values, "booking.staff.minBreakMin"),
    maxJobsPerDay: numOrNull(values, "booking.staff.maxJobsPerDay"),
  };
}
