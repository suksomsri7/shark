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

// ── T1.1 screens ──
// TRIPS T1.1 ▸ จอสินค้าทัวร์ (ภาพ 16) · โซนรับส่ง (บริการใหม่ · polygon JSON v1 ชั่วคราว) · จอค่าตั้ง trips (ภาพ 17) · ด่านหน้า/แถบ TRIPS (ใบสั่ง ledger/trips-briefs/T1.1.md) ◂
export {
  PICKUP_ZONE_KINDS,
  PICKUP_ERROR_CODES,
  PICKUP_ZONE_LIMIT,
  pickupZoneInputSchema,
  pickupZonePatchSchema,
  pickupWindowFor,
} from "./pickup-core";
export type { PickupZoneKind, PickupErrorCode, PickupZoneDTO, PickupWindow, PickupAreas } from "./pickup-core";
export { listPickupZones, createPickupZone, updatePickupZone, setPickupZoneActive, reorderPickupZones } from "./pickup";
export type { TripsScreenCtx, TripsFail } from "./pickup";
export { tripsPageGate, loadTripsNav, loadProductListVM, loadProductEditorVM, loadTripsSettingsVM } from "./screens";
export type {
  TripsNavVM,
  ProductListVM,
  ProductListItemVM,
  ProductEditorVM,
  PaxRowVM,
  SeasonRowVM,
  DepartureRowVM,
  ExtraRowVM,
  ExampleVM,
  TripsSettingsVM,
} from "./screens";
export { saveTripsSettings, resetTripsSetting } from "./trips-settings";
// ◂ TRIPS T1.1
// ── /T1.1 screens ──
// ── T0.6 booking ──
// TRIPS T0.6 ▸ การจอง: ถือผ่านตะกร้า · ยืนยันในธุรกรรมเดียว · ผังสถานะ · เลขจอง · อนุมัติ/ยกเลิกก่อนจ่าย · แก้คน/เลื่อนวัน (ใบสั่ง ledger/trips-briefs/T0.6.md) ◂
export {
  BOOKING_STATUSES,
  BOOKING_TERMINAL_STATUSES,
  BOOKING_SOLD_STATUSES,
  BOOKING_UNPAID_STATUSES,
  BOOKING_TRANSITIONS,
  canTransitionBooking,
  initialBookingStatus,
  isBookingStatus,
} from "./state";
export type { BookingStatus, BookingActorKind, BookingTransition, InitialHoldMode, InitialStatusInput, InitialStatusResult } from "./state";
export { contactKeyOf, phoneE164, bookingColumnsFromSnapshot, seatsOfSnapshot, dueNowOfSnapshot } from "./booking-core";
export type { TripHoldRequest, TripConfirmRequest, TripBookNowRequest, TripChangeRequest, BookingColumns, BookingItemColumns } from "./booking-core";
export { BOOKING_CODE_RE, bookingPeriodOf, formatBookingCode, nextSeqInTx, nextBookingCodeInTx } from "./numbering";
export {
  BookingAbort,
  TRIP_PRICE_OVERRIDE_ENTITY,
  tripPriceOverrideEntityId,
  tripsUnexpectedCount,
  bookingPublicToken,
  holdTrips,
  prepareTripConfirm,
  confirmTrips,
  finalizeTripsInTx,
  bookTripsNow,
  getTripBooking,
  listTripBookings,
  transitionBookingInTx,
  cancelTripBooking,
  approveTripBooking,
  changeTripBooking,
  onTripBookingExpired,
} from "./booking";
export type { BookingOpts, PreparedConfirm, PreparedLine, TripBookingDTO } from "./booking";
// ◂ TRIPS T0.6
// ── /T0.6 booking ──
// ── T0.7 money ──
// TRIPS T0.7 ▸ เงินฝั่ง trips: งวดจ่าย · รับเงิน · QR พร้อมเพย์ยอดล็อก · คำขอคืนเงิน G.3 · ข้อมูลเอกสาร · ข้อมูลเงินสดรายวัน · งาน trips.paymentDue (ใบสั่ง ledger/trips-briefs/T0.7.md) ◂
export {
  TRIP_TENDERS,
  TRIP_REFUND_STATUSES,
  TRIP_REFUND_OPEN_STATUSES,
  TRIP_REFUND_TRANSITIONS,
  TRIP_REFUND_ENTITY,
  TRIP_DUE_OPEN_STATUSES,
  tenderGroupOf,
  canTransitionRefund,
  dueDraftsFromSnapshot,
  allocatePayment,
  receiptVatSatang,
  receiptVatCtxOf,
  bookingStatusAfterPayment,
  refundQuoteFromSnapshot,
  planRefundSlices,
  tripRefundEntityId,
  moneyDocumentOf,
  unavailablePostingPort,
} from "./money-core";
export type {
  TripTender,
  TenderGroup,
  TripRefundStatus,
  DueDraft,
  ReceiptVatCtx,
  DueState,
  PaymentSlice,
  RefundReasonKind,
  RefundQuoteInput,
  RefundQuote,
  ReceiptRow,
  RefundSlice,
  MoneyDocument,
  PostingOutcome,
  TripsPostingPort,
} from "./money-core";
export { ensureTripDuesInTx, listTripDues, recordTripPayment, tripPaymentIntent, tripMoneySummary, tripCashDay } from "./money";
export type { DueRow, TripDueDTO, PaymentEventDTO, PaymentValue, PaymentIntentValue, TripMoneySummary, TripCashDay } from "./money";
export { requestTripRefund, decideTripRefund, withdrawTripRefund, executeTripRefund, getTripRefund, listTripRefunds } from "./refund";
export type { TripRefundDTO, RefundRequestValue, DecideValue, ExecuteValue, RefundMoneyEventDTO } from "./refund";
export { runPaymentDue } from "./jobs";
// ◂ TRIPS T0.7
// ── /T0.7 money ──
