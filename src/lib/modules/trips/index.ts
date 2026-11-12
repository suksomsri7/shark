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

// TRIPS T0.2 ▸ สินค้า · ตัวเลือก · ประเภทคน · รายการเสริม · เนื้อหาไทย/อังกฤษ (ใบสั่ง ledger/trips-briefs/T0.2.md) ◂
export {
  createProduct,
  updateProduct,
  setProductContent,
  publishProduct,
  unpublishProduct,
  archiveProduct,
  restoreProduct,
  listProducts,
  getProduct,
  getProductBySlug,
  createOption,
  updateOption,
  setOptionActive,
  reorderOptions,
  createPaxType,
  updatePaxType,
  setPaxTypeActive,
  createExtra,
  updateExtra,
  setExtraActive,
  // r2 ▸ ด่าน "ขายได้" ในธุรกรรมของผู้เรียก (T0.3 กฎรอบ/รอบ · T0.5 ราคา) ◂
  assertProductSellableInTx,
  TripProductNotSellableError,
} from "./products";
export type { ProductSellableCode as TripProductSellableCode } from "./products";
export {
  CONTENT_SECTIONS,
  PROSPECTUS_ITEMS,
  TRIP_PRODUCT_ERROR_CODES,
  PRODUCT_TYPES,
  EXTRA_KINDS,
  EXTRA_BASES,
  TAX_KINDS,
  effectivePaxBand,
  paxTypeForAge,
  localize,
  prospectusChecklist,
} from "./products-core";
export type {
  Ctx as TripProductCtx,
  Fail as TripProductFail,
  TripProductErrorCode,
  I18n as TripI18n,
  I18nText as TripI18nText,
  Localized as TripLocalized,
  ContentSection as TripContentSection,
  ProspectusItem as TripProspectusItem,
  PublishMissing as TripPublishMissing,
  Band as TripPaxBand,
  T27Value as TripChildAgeBand,
  ProductDTO as TripProductDTO,
  OptionDTO as TripOptionDTO,
  PaxTypeDTO as TripPaxTypeDTO,
  ExtraDTO as TripExtraDTO,
  ProductListItem as TripProductListItem,
} from "./products-core";
// ◂ TRIPS T0.2
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
  // r2 ▸ นิพจน์ SQL เดียวของ "สถานะหลังตัวนับ/ความจุเปลี่ยน" — T0.4 ใช้ตัวนี้ (มติผู้คุม G) ◂
  departureStatusAfterCountersSql,
  departureGuaranteedAtAfterCountersSql,
  departureCountersUnchangedSql,
} from "./departures";
export type { DepartureCountersAfterSql, DepartureDTO, ScheduleItem, MaterializeResult, MaterializeConflict, MinPaxResult, MinPaxFailure, DepartureEventType } from "./departures";
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
export type { TripJobOpts, TripJobFailure } from "./jobs";
// ◂ TRIPS T0.3
// ── /T0.3 departures ──
