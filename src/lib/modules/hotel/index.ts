// SVC H.1 ▸ facade โมดูลโรงแรม — ราคา (pure) · ราคา (server) · ตั้งค่าโรงแรม · โมดูลอื่น/หน้าใหม่ import ผ่านทางนี้เท่านั้น
//   (หน้าเดิมของ P1 ยัง import ./service ตรงจนใบหลังย้าย)
export {
  resolveSeason,
  resolveNightPrice,
  quoteStay,
  depositFor,
  depositPolicyOf,
  refundFor,
  taxLines,
  isYmd,
  dayNumber,
  dayOfWeekOf,
  addDaysYmd,
  nightDates,
  roundFraction,
} from "./pricing";
export type {
  PricingContext,
  RatePlanRow,
  SeasonRow,
  RateRow,
  OverrideRow,
  RoomTypeInfo,
  FallbackRate,
  NightPrice,
  QuoteNight,
  QuoteLimits,
  QuoteInput,
  QuoteOk,
  QuoteFail,
  QuoteError,
  DepositKind,
  DepositPolicy,
  CancelRule,
  TaxMode,
  TaxPolicy,
  TaxLine,
  RoundingMode,
  PriceSource,
  PriceBucket,
} from "./pricing";
export {
  listRatePlans,
  saveRatePlan,
  archiveRatePlan,
  saveCancelRules,
  listSeasons,
  saveSeason,
  archiveSeason,
  saveHolidays,
  removeHoliday,
  getRateMatrix,
  saveRates,
  setOverride,
  clearOverride,
  loadPricingContext,
  ratePreview,
  loadRatesScreen,
} from "./rates";
export type {
  HotelActor,
  HotelCtx,
  RatesFail,
  RatesFailCode,
  RatePlanDto,
  SeasonDto,
  HolidayDto,
  MatrixRow,
  PreviewCell,
  PreviewDay,
  PreviewRoomType,
  RatesScreenModel,
} from "./rates";
export { loadHotelSettings, saveHotelSettings, resetHotelSetting } from "./hotel-settings";
export type { HotelSettingsModel } from "./hotel-settings";
// SVC H.3 ▸ จอง V2 (ใบสั่ง h.3 §3) — ห้องว่างสูตรเดียว · การจอง (HOLD/มัดจำ/ยกเลิก/ต่อ/ย่น/ย้าย/ไม่มา/sweeper) · state machine (pure)
export { hotelAvailability, availabilityInTx, buildAvailability, AVAILABILITY_MAX_DAYS } from "./availability";
export type { AvailabilityCell, AvailabilityByDate, AvailabilityResult } from "./availability";
export {
  createBooking,
  confirmBooking,
  cancelBooking,
  extendBooking,
  shortenBooking,
  assignRoom,
  rescheduleBooking,
  rescheduleBooking as moveBooking,
  markNoShow,
  undoNoShow,
  takeBookingDeposit,
  listBookings,
  getBooking,
  assignableRoomsFor,
  quoteExtension,
  sweepExpiredHolds,
  refundPreview,
  cancelRulesOfSnapshot,
} from "./booking";
export type { BookingActor, BookingSource, BookingFail, BookingFailCode, BookingRowOut, CreateBookingOk, BookingListRow, BookingDetail } from "./booking";
export { TRANSITIONS, canTransition, nightsOf, holdDeadline } from "./booking-state";
export type { BookingStatus, TransitionOpts, TransitionRole } from "./booking-state";
// ◂ SVC H.3
