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
  moveBooking, // SVC H.2: เดิม alias rescheduleBooking · มติผู้คุม 7 พ.ย. = ไม่จัดห้องให้การจองอื่น (repack false)
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
// SVC H.5 ▸ บิลระหว่างพัก (folio) · เช็กเอาต์ปิดบิล POS ใบเดียว · เงินประกันห้อง · ลงห้องจาก POS (ใบสั่ง h.5 §3) — โมดูลอื่น/หน้าใหม่ import ผ่านทางนี้
export { getFolio, postFolioItem, voidFolioItem, postRoomNights, folioForGroup, postDeposit, FOLIO_ITEM_TYPES } from "./folio";
export type { FolioDto, FolioItemDto, FolioFail, FolioFailCode } from "./folio";
export { prepareCheckout, settleAndCheckOut, takeSecurityDeposit, refundSecurityDeposit, forfeitSecurityDeposit, COUNTER_PAY_TYPES } from "./checkout";
export type { PrepareOk, SettleOk, CheckoutFail, CheckoutFailCode, PosLine } from "./checkout";
export { chargeToRoom, onPosSalePaidRoomCharge, onPosSaleVoidedRoomCharge, listUnmatchedRoomCharges, countUnmatchedRoomCharges, attachRoomCharge, roomChargeReasonTh } from "./room-charge";
export type { ChargeToRoomInput, RoomChargeFail, RoomChargeFailCode, UnmatchedRow } from "./room-charge";
// ◂ SVC H.5
// SVC H.2 ▸ ปฏิทินห้อง (tape chart · อ่านอย่างเดียว) + KPI หน้าเคาน์เตอร์ + ปิดห้อง (BLOCK) — ใบสั่ง h.2 §3 · การลาก = rescheduleBooking/moveBooking ของ H.3
export { tapeChart, hotelToday, previewMove, TAPE_MAX_DAYS } from "./tape";
export type { TapeBar, TapeBarKind, TapeRoom, TapeGroup, TapeOccupancyDay, TapeLegendItem, TapeChartOk, TapeFail, HotelTodayOk, MovePreview } from "./tape";
export { blockRoom, releaseBlock, listBlocks, BLOCK_REF } from "./block";
export type { BlockActor, BlockFail, BlockFailCode, BlockOk, BlockRow } from "./block";
// ◂ SVC H.2
// SVC H.6 ▸ แม่บ้าน (ใบสั่ง h.6 §3) — บอร์ดงานห้องวันนี้ · state machine hk · เริ่มทำ/เสร็จ/ตรวจ · มินิบาร์ → folio · แจ้งของเสีย · night audit (H.7 เรียก)
export {
  hkBoard,
  hkRoom,
  hkSetStatus,
  hkStart,
  hkRelease,
  hkFinish,
  hkInspect,
  hkLogs,
  postMinibar,
  reportDefect,
  setGuestRequest,
  markStayoversDirty,
  syncBlockedRooms,
  minibarItemsOf,
  inWork,
  HK_EVENTS,
} from "./housekeeping";
export type { HkActor, HkFail, HkFailCode, HkBoard, HkBoardRow, HkRoomView, HkLogRow, MinibarItem } from "./housekeeping";
export { HK_TRANSITIONS, HK_ROLES, HK_CONTEXTS, HK_STATUS_LIST, canHkTransition, hkPriority, parseHkNote, serializeHkNote } from "./hk-state";
export type { HkState, HkRole, HkContext, HkNote, HkTransition, HkTransitionOpts } from "./hk-state";
// ◂ SVC H.6
// SVC H.7 ▸ ปิดวัน (night audit 6 ขั้น · cron hotel-night-audit) · business date ต่อ timezone (pure) · รายงาน Occ/ADR/RevPAR/รายได้/ฟันเนล/พยากรณ์/แม่บ้าน/มัดจำ + CSV · getUnitKpi (Overview)
export { businessDateOf, nextBusinessDate, isAuditDue, normalizeTimezone, zonedDayStart, DEFAULT_TIMEZONE } from "./business-date";
export { auditPreview, closeNightAudit, reopenNightAudit, auditHistory, runDueAudits, computeKpi, pendingAuditDays, pendingBusinessDate, auditSummaryEmail, isAuditFail } from "./night-audit";
export type { AuditActor, AuditFail, AuditFailCode, NightAuditKpi, AuditNoShowRow, AuditPreviewOk, CloseAuditOk, AuditHistoryRow, RunDueResult, KpiInput, KpiRoom, KpiNight } from "./night-audit";
export { occupancyReport, revenueReport, bookingFunnel, forecast30, housekeepingReport, depositsReport, exportCsv, getUnitKpi, isReportFail, isCsvKind, CSV_KINDS, REPORT_MAX_DAYS, SOURCE_TH } from "./reports";
export type { HotelReportCtx, ReportFail, ReportFailCode, OccupancyRow, OccupancyReport, RevenueGroupBy, RevenueRow, RevenueReport, FunnelRow, FunnelReport, ForecastRow, ForecastReport, HousekeepingReport, DepositsReport, UnitKpi, CsvKind } from "./reports";
// ◂ SVC H.7
