// SVC D.6 ▸ facade โมดูลหอพัก — ชื่อตามสัญญา ledger/svc-briefs/svc-brief-d.6.md §3 §5 §6
//   (ใบหออื่นเพิ่มบรรทัด export ของตัวเองต่อท้าย — ใบนี้ export เฉพาะของมิเตอร์)
export {
  createMeter,
  listMeters,
  submitReadings,
  confirmReading,
  replaceMeter,
  meterWalk,
  meterFlags,
  heldRooms,
  periodUsage,
} from "./meter";
export type {
  MeterCtx,
  MeterFlag,
  MeterWalk,
  MeterWalkFloor,
  MeterWalkRoom,
  MeterWalkMeter,
  MeterWalkMain,
  MeterFlagRow,
  PeriodUsageRow,
  SubmitItem,
  SubmitItemResult,
  SubmitReadingsResult,
} from "./meter";
export { dormAccess } from "./access";
export { enqueueReading, nextBatch, settleBatch } from "./meter-queue";
export type { QueuedReading } from "./meter-queue";
// SVC D.7 ▸ ค่าน้ำไฟทุกโหมด + หน้ากฎหมาย/VAT — สัญญา ledger/svc-briefs/svc-brief-d.7.md §3
export { recordAuthorityBill, utilityCharges, utilityBillingGate, acceptUtilityLegalWarn, authorityTariffFor, parseBahtToSatang } from "./utility";
export type {
  UtilityCtx,
  UtilityKind,
  UtilityChargeRow,
  UtilityGroup,
  UtilityCharges,
  UtilityGate,
  UtilityGateItem,
  UtilityLegalGroup,
  UtilityLegalOutcome,
  RecordAuthorityBillResult,
  AuthorityTariff,
} from "./utility";
export { setDormLegalMode, dormLawModel } from "./law";
export type { DormLawModel, DormLawBill } from "./law";

// ── SVC D.5 ▸ ผู้เช่า · สัญญา · เงินประกัน — ชื่อตามสัญญา ledger/svc-briefs/svc-brief-d.5.md §3 §5 (บล็อกนี้ของใบ D.5 เท่านั้น) ──
export {
  createLease,
  findTenantCandidates,
  receiveBookingFee,
  moveIn,
  signLease,
  addLeaseFiles,
  leaseFileLinks,
  getLease,
  listLeases,
  leaseContract,
  cancelLease,
  updateLeaseOccupants,
} from "./lease";
export type { LeaseCtx, LeaseDetail, LeaseRow, LeaseTab, LeaseList } from "./lease";
export { leaseAccess } from "./lease-access";
// ◂ SVC D.5

// ── SVC D.8 ▸ รอบบิลรายเดือน (ภาพ หอ 04) — ชื่อตามสัญญา ledger/svc-briefs/svc-brief-d.8.md §3 (บล็อกนี้ของใบ D.8 เท่านั้น) ──
export {
  prepareBillRun,
  setBillExtraLines,
  releaseHeldBill,
  scheduleBillRun,
  sendBillRun,
  adjustSentBill,
  billRunModel,
  getBill,
  billRunCsv,
  meterEstimates,
  runDormBillingJobs,
} from "./billing";
export type {
  BillingCtx,
  BillRunStatus,
  BillGateItem,
  BillRunGate,
  BillRunModel,
  BillRunRow,
  BillPreview,
  MeterEstimate,
  ExtraLineInput,
  PrepareBillRunResult,
  SendBillRunResult,
} from "./billing";
// ◂ SVC D.8
// ── SVC D.13 ▸ หน้าแรกหอ · ตั้งนโยบาย/สิทธิ์ · ขอบเขตอาคาร — สัญญา ledger/svc-briefs/svc-brief-d.13.md §3–§6 (บล็อกนี้ของใบ D.13 เท่านั้น) ──
export { dormHomeModel } from "./home";
export type { DormHomeModel, DormHomeFinance, DormHomeTodoKind } from "./home";
export { dormBuildingScope, dormVisibleRoomsFor } from "./scope";
export type { DormBuildingScope } from "./scope";
export { loadDormPolicySettings, applyDormRolePreset, setDormBuildingAssignment } from "./policy";
export type { DormPolicyModel } from "./policy";
export { DORM_ROLE_ROWS, DORM_ROLE_COLUMNS, dormPresetPermissions } from "./access";
export type { DormPresetRole, DormRoleColumn, DormRoleCell, DormRoleRow } from "./access";
// ◂ SVC D.13
// ── SVC D.3 ▸ ใบกำกับภาษีเต็มรูปของหอ (ม.86/4) — สัญญา ledger/svc-briefs/svc-brief-d.3.md §3.2–§3.4 (บล็อกนี้ของใบ D.3 เท่านั้น) ──
export { billTaxInvoice, issueBillTaxInvoice, reissueBillTaxInvoice } from "./tax-invoice";
export type { TaxInvoiceView } from "./tax-invoice";
// ◂ SVC D.3
// ── SVC D.11 ▸ เตือน · ทวง · ค่าปรับ — สัญญา ledger/svc-briefs/svc-brief-d.11.md §3–§9 (บล็อกนี้ของใบ D.11 เท่านั้น) ──
export { lateFeeLedger, waiveLateFee, applyLateFeeWaiverApproval } from "./latefee";
export type { LateFeeCtx, LateFeeLedger, LateFeeLedgerItem, WaiverStatus, WaiveResult, ApplyWaiverResult, AutoLateFeeEntry } from "./latefee";
export { runDormDunningJobs, sendDunningNow, setPaymentPromise, overdueModel, terminationNotice } from "./dunning";
export type { OverdueModel, OverdueRow, SendDunningResult, TerminationNotice, DunningJobResult } from "./dunning";
// ◂ SVC D.11
// ── SVC D.9 ▸ ตัวอ่านฝั่งผู้เช่า (พอร์ทัลลิงก์เซ็น · LINE) — สัญญา ledger/svc-briefs/svc-brief-d.9.md §1 §3.0 (บล็อกนี้ของใบ D.9 เท่านั้น) ──
export {
  portalLiveLease,
  portalLiveLeasesOfParty,
  portalCanonicalParty,
  portalLeaseOfUnit,
  portalBillVisible,
  portalLeaseBills,
  portalBillForSend,
  portalBillLiveState,
  portalSlipKeyExists,
  portalPartyName,
  portalFileAssets,
  portalActiveUnitIds,
  dormStaffGate,
  portalPeriodLabel,
  portalDateLabel,
  portalBaht,
} from "./portal";
export type { PortalLeaseRow, PortalBillRow, PortalSlipStatus } from "./portal";
// ◂ SVC D.9
// ── SVC D.12 ▸ ย้ายออก · ย้ายห้อง · ต่อสัญญา + คืนเงินประกัน — สัญญา ledger/svc-briefs/svc-brief-d.12.md §3–§5 (บล็อกนี้ของใบ D.12 เท่านั้น) ──
export {
  giveMoveOutNotice,
  cancelMoveOut,
  addMoveOutFiles,
  recordMoveOutInspection,
  moveOutSummary,
  moveOutModel,
  sendMoveOutSummary,
  reopenMoveOutSummary,
  settleMoveOut,
  runDormMoveOutJobs,
} from "./moveout";
export type { MoveOutCtx, SummaryLine, MoveOutSummary, MoveOutModel, MoveOutStatus } from "./moveout";
export { transferRoom, renewLease, depositLeaseIdOf } from "./lease-change";
export type { LeaseChangeCtx } from "./lease-change";
export { moveOutAccess } from "./moveout-access";
// ◂ SVC D.12
