// SVC H.10 ▸ facade ของช่องทาง OTA (channel manager) — ส่งออกผ่าน hotel/index.ts (ใบสั่ง h.10 §1 · §3)
//   ฝั่งเซิร์ฟเวอร์เท่านั้น · ไฟล์ 'use client' ใช้ "./types" (pure) เท่านั้น
export { listChannelConnections, saveRoomMap, saveRateMap, saveBuffer, channelMappingFor, channelDetail, CHANNEL_MANAGE } from "./mapping";
export type { ChannelActor, ChannelFail, ChannelFailCode, ChannelConnectionDto, ChannelDetailDto } from "./mapping";
export { emitAriDirty, onAriDirty, ariDirtyFromBooking, enqueueAri, buildAri, pushAriJobs, ARI_MAX_ATTEMPTS } from "./ari";
export type { AriDirtyInput } from "./ari";
export { ingestInbound, applyInbound, pullAll, retryInbound, rejectInbound, listNeedsRoom, listInbox, fakeEnqueueInbound, inboxReasonTh } from "./inbound";
export type { ApplyResult, NeedsRoomItem, InboxItem } from "./inbound";
export { markupPrice, ariHash, INBOX_REASON_TH } from "./types";
export type { AriPayload, AriDay, AriRoomDay, AriRate, InboundReservation, InboundStatus, ChannelMapping, ChannelCallOpts, InboxReason, InboxStatus } from "./types";
