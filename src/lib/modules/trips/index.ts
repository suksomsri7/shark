// ─────────────────────────────────────────────────────────────
// modules/trips — facade เดียวที่โมดูลอื่น import (ทัวร์ · เดย์ทริป · Liveaboard) · RUN TRIPS
// 🔴 ส่งออกเป็นรายการชัดเจน (ห้าม export *) · แต่ละใบเพิ่มบล็อกของตัวเอง
// ─────────────────────────────────────────────────────────────

// TRIPS T0.1 ▸ รูป JSON ของคอลัมน์ Json (CC §N.2) ◂
export {
  isYmd,
  tripScheduleRuleSchema,
  tripScheduleExceptionsSchema,
  tripPriceRuleParamsSchema,
  tripDepartureStopSellSchema,
  tripDepartureInsuranceSchema,
} from "./json-schemas";
export type {
  TripScheduleRule,
  TripScheduleExceptions,
  TripPriceRuleParams,
  TripDepartureStopSell,
  TripDepartureInsurance,
} from "./json-schemas";
// ◂ TRIPS T0.1

// ── T0.3 departures ──
// TRIPS T0.3 ▸ รอบ · กฎซ้ำ · สถานะ · ความจุ · ขั้นต่ำ · ปิดรับ · หยุดขาย · ทรัพยากร · งานตามเวลา (ใบสั่ง T0.3 §3) ◂
export {
  DEPARTURE_STATUSES,
  DEPARTURE_TRANSITIONS,
  TRIP_DEPARTURE_ERROR_CODES,
  DEPARTURE_SELL_CHANNELS,
  canTransitionDeparture,
  normalizeTimezone,
  localToUtc,
  utcToLocal,
  weekdayOfYmd,
  addDaysYmd,
  expandSchedule,
  cutoffFor,
  cutoffsFor,
  cutoffAtColumn,
  decisionAtFor,
  needsDecision,
  stopSellBlocks,
  saleBlockReason,
} from "./departures-core";
export type {
  DepartureStatus,
  DepartureActor,
  TripDepartureErrorCode,
  DepartureConflict,
  DepartureFail,
  ScheduleShape,
  ExpandedDay,
  CutoffSpec,
  T6Value,
  T7Value,
  SaleBlockReason,
} from "./departures-core";
export {
  createSchedule,
  updateSchedule,
  pauseSchedule,
  resumeSchedule,
  listSchedules,
  materializeSchedule,
  createDeparture,
  updateDeparture,
  setDepartureCapacity,
  setDepartureStatus,
  cancelDeparture,
  getDeparture,
  listDepartures,
  refreshDeparturePolicy,
  setDepartureStopSell,
  evaluateMinPax,
} from "./departures";
export type { DepartureDTO, ScheduleItem, MaterializeResult, MinPaxResult, DepartureEventType } from "./departures";
export {
  RESOURCE_KINDS,
  createResource,
  updateResource,
  setResourceActive,
  listResources,
  assignResource,
  unassignResource,
} from "./resources";
export type { TripCtx, TripOpts, ResourceItem } from "./resources";
export { runGenerateDepartures, runMinPaxCheck } from "./jobs";
export type { TripJobOpts } from "./jobs";
// ◂ TRIPS T0.3
// ── /T0.3 departures ──
