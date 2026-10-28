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
