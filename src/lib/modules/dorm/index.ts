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
