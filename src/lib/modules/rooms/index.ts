// SVC R0.8 ▸ facade โมดูลแกนห้อง — หอ/โรงแรมเรียกผ่านทางนี้เท่านั้น (`@/lib/modules/rooms` · ห้ามล้วง subpath)
//   ชื่อตามสัญญา ledger/svc-briefs/svc-brief-r0.8.md §3 · โมดูลนี้ไม่ import โมดูลอื่น (ใช้ได้แค่ @/lib/core/*)
export { claimRoom, releaseOccupancy, moveOccupancy, resizeOccupancy, expireHolds, sweepStaleOccupancy, exclusiveEnd } from "./occupancy";
export {
  availability,
  roomBoard,
  createBuilding,
  updateBuilding,
  deleteBuilding,
  listBuildings,
  setRoomLayout,
  setHkStatus,
  affectedByOutOfOrder,
  setRoomTypeRent,
  backfillHotelOccupancy,
  occupancyRange,
} from "./service";
export type { RoomBoardCell, AffectedOccupancy, OccupancyRangeRow, RoomUse } from "./service";
