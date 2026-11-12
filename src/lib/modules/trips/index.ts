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

// ── T0.5 pricing ──
// TRIPS T0.5 ▸ ตัวเลือกราคา 8 ขั้น · ฤดูกาล/ราคา/กฎราคา/โค้ดส่วนลด · snapshot + recompute · quote ของ Sellable (ใบสั่ง ledger/trips-briefs/T0.5.md) ◂
export {
  BP_UNIT,
  MICROS_UNIT,
  mulBpHalfUp,
  mulDivHalfUp,
  divCeil,
  divFloor,
  vatOfInclusive,
  vatOfExclusive,
  minorToSatang,
  allocateLastRemainder,
  allocateWithin,
  satangToMinor,
  productLess,
} from "./money-math";
export {
  PRICE_STEPS,
  PRICING_POLICY_KEYS,
  PricingAbort,
  tripPricingInputSchema,
  agencyPricingInputSchema,
  resolveTripPrice,
  priceFingerprint,
  normalizeReason,
  reasonOk,
} from "./pricing-core";
export type {
  PriceStep,
  TripPricingInput,
  AgencyPricingInput,
  AgencyLevel,
  PricedQuote,
  PricedItem,
  PricedTotals,
  CommissionBlock,
  PricingResult,
  PricingWarning,
} from "./pricing-core";
export { toTripsSnapshot, snapshotValue, recomputeFromSnapshot, SnapshotKeyMissing } from "./snapshot";
export type { TripsBookingSnapshot, RecomputeEvent, CancelComputed, CommissionComputed } from "./snapshot";
export {
  loadPricingInput,
  quoteTripLine,
  quoteTrips,
  buildTripBookingSnapshot,
  registerAgencyPricingPort,
  registerTripPromoProvider,
} from "./pricing";
export type { AgencyPricingPort, AgencyPricingQuery, TripPromoProvider, QuoteLineOpts, TripQuoteLine, QuotedRef } from "./pricing";
export { listSeasons, saveSeason, archiveSeason, listPrices, setPrice, removePrice, savePriceRule, setPriceRuleActive } from "./prices";
export type { SeasonDTO, PriceDTO } from "./prices";
export { redeemPromoInTx, redeemPromosInTx, releasePromoInTx } from "./promo";
export type { Redemption as TripPromoRedemptionResult } from "./promo";
export { tripSellable } from "./sellable-impl";
// ── /T0.5 pricing ──
// ── T0.4 capacity ──
// TRIPS T0.4 ▸ ที่ว่าง (R2) · ถือ/แปลง/ปล่อย/คืน/ย้าย · เพดานถือ · ตัวกวาด · รายการรอ · Sellable เฟส 1 (ใบสั่ง ledger/trips-briefs/T0.4.md §3) ◂
export {
  HOLD_STATUSES,
  HOLD_PURPOSES,
  WAITLIST_STATUSES,
  canTransitionHold,
  canTransitionWaitlist,
  publicLeftOf,
  holdExpiresAt,
  sortCapacityRows,
  idemKeyFor,
} from "./capacity-core";
export type { HoldStatus, HoldPurpose, WaitlistStatus, HoldDurations, CounterShape } from "./capacity-core";
// ชั้นในธุรกรรม (capacity.ts · รับ tx ของผู้เรียก · ไม่ขอ connection ที่สอง) — ลำดับล็อก: 0 (ตะกร้า → advisory) → สินค้า SHARE → 1a (เรียง id) → 2a → 2a′ → 2b → 2h
export {
  CapacityAbort,
  expectRows,
  holdCapKeyHash,
  holdRequestHash,
  releaseHoldInTx,
  convertHoldInTx,
  returnSoldInTx,
  moveSoldInTx,
  reserveSeatsInTx,
  unreserveSeatsInTx,
  holdFromReservedInTx,
  unholdToReservedInTx,
  reserveInTx,
  insertHoldInTx,
  acquireHoldCapInTx,
  rekeyHoldsToContactInTx,
} from "./capacity";
export type { CapacityPolicies, DeparturePolicy, PlaceHoldValue, ConvertValue, ReleaseValue, CountersValue, MoveValue, TripReserveIntent, ExitValue, OfferFailure } from "./capacity";
// ชั้นเปิดธุรกรรมเอง (capacity-service.ts) — ตัวโหลดค่าตั้งรันก่อนเปิด tx แล้วส่งผลให้ *InTx
export {
  loadCapacityPolicies,
  reportCapacityIncident,
  reportOfferFailures,
  getAvailability,
  listAvailability,
  placeHold,
  extendHold,
  releaseHold,
  convertHold,
  returnSold,
  moveSold,
  capacityRowsOf,
} from "./capacity-service";
export type { AvailabilityValue } from "./capacity-service";
export { joinWaitlist, leaveWaitlist, declineWaitlistOffer, offerWaitlist, listWaitlist, onWaitlistTrigger } from "./waitlist";
export type { JoinValue, WaitlistItem } from "./waitlist";
// tripSellable ส่งออกในบล็อก T0.5 ข้างบน (ไฟล์เดียวกัน sellable-impl.ts · รวมสมาชิก T0.4 + quote ของ T0.5)
export { runExpireHolds, runWaitlistOffers } from "./jobs";
export type { CapacityJobOpts, CapacityJobFailure } from "./jobs";
// ◂ TRIPS T0.4
// ── /T0.4 capacity ──
