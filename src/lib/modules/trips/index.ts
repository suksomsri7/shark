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
} from "./money-math";
export {
  PRICE_STEPS,
  PRICING_POLICY_KEYS,
  PricingAbort,
  tripPricingInputSchema,
  agencyPricingInputSchema,
  resolveTripPrice,
  priceFingerprint,
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
export type { AgencyPricingPort, AgencyPricingQuery, TripPromoProvider, QuoteLineOpts } from "./pricing";
export { listSeasons, saveSeason, archiveSeason, listPrices, setPrice, removePrice, savePriceRule, setPriceRuleActive } from "./prices";
export type { SeasonDTO, PriceDTO } from "./prices";
export { redeemPromoInTx, releasePromoInTx } from "./promo";
export type { Redemption as TripPromoRedemptionResult } from "./promo";
export { tripSellable } from "./sellable-impl";
// ── /T0.5 pricing ──
