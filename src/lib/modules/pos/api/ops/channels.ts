// ops/channels.ts — op ของช่องทางขาย (ใบ P2.13 · brief §1 #22–#24)
// อ่านรายการช่องทางของสาขา (listChannels) · พัก/เปิดรับออเดอร์ (setChannelOrderSettings.pausedUntil · adapter setStoreStatus)
// สร้าง/แก้/เก็บช่องทาง = P2.14 (IN-B ที่ยังไม่เปิด · มติ §10)
import { z } from "zod";
import { listChannels } from "../../channel";
import { setChannelOrderSettings } from "../../order";
import { posRegisterActorOf } from "../actor";
import { posData, posResult } from "../http-errors";
import { definePosOp, POS_SCOPES, type ApiOp } from "../op";
import { posChannelUnit, requirePosUnit } from "../units";

const unitIdField = z.string().min(1).max(64).describe("Branch (BusinessUnit id) of this POS system.");
const unitIdOpt = unitIdField.optional().describe("Branch of the channel. Optional: the channel's own branch is used; a different branch answers 404.");
const channelTarget = ({ params }: { params: Record<string, string> }) => (params.id ? { targetType: "SalesChannel", targetId: params.id } : null);

const channelsList = definePosOp({
  id: "channels.list",
  method: "GET",
  path: "/channels",
  kind: "read",
  action: POS_SCOPES.saleRead,
  summary: "Sales channels of a branch (walk-in STORE, web shop, delivery platforms, custom channels): code, payout (DIRECT or PLATFORM), commission, adapter and pause state.",
  label: "ช่องทางขายของสาขา",
  test: "channels.list",
  input: z.object({ unitId: unitIdField, includeArchived: z.enum(["true", "false"]).optional().describe("true = also list archived channels.") }).strict(),
  async handler({ actor, input }) {
    const unitId = await requirePosUnit(actor, input.unitId);
    return posData(
      await listChannels({ tenantId: actor.tenantId, systemId: actor.systemId, unitId }, posRegisterActorOf(actor), input.includeArchived === "true" ? { includeArchived: true } : undefined),
    );
  },
});

const channelsPause = definePosOp({
  id: "channels.pause",
  method: "POST",
  path: "/channels/{id}/pause",
  kind: "write",
  action: POS_SCOPES.orderAccept,
  summary: "Stop taking orders on a channel until a time (at most 24 hours ahead). Orders sent to a paused API, web or chat channel are refused with 409 state_conflict.",
  label: "พักรับออเดอร์",
  test: "channels.pause",
  input: z.object({ unitId: unitIdOpt, until: z.string().datetime({ offset: true }).describe("ISO-8601 time when the channel opens again (max 24 h from now).") }).strict(),
  auditTarget: channelTarget,
  async handler({ actor, params, input }) {
    const unitId = await posChannelUnit(actor, params.id ?? "", input.unitId);
    // POS P2.14 ▸ API-8 (A9): คำตอบรูปคงที่ — ไม่ผ่าน posData (ผลฟิลด์เดียว = ค่าเปล่า · หลายฟิลด์ = วัตถุ ⇒ รูปเปลี่ยนตามผล) ◂
    return posResult(await setChannelOrderSettings({ tenantId: actor.tenantId, systemId: actor.systemId, unitId }, posRegisterActorOf(actor), { channelId: params.id ?? "", pausedUntil: input.until })).channel;
  },
});

const channelsResume = definePosOp({
  id: "channels.resume",
  method: "POST",
  path: "/channels/{id}/resume",
  kind: "write",
  action: POS_SCOPES.orderAccept,
  summary: "Take orders on a paused channel again now.",
  label: "เปิดรับออเดอร์",
  test: "channels.resume",
  input: z.object({ unitId: unitIdOpt }).strict(),
  auditTarget: channelTarget,
  async handler({ actor, params, input }) {
    const unitId = await posChannelUnit(actor, params.id ?? "", input.unitId);
    // POS P2.14 ▸ API-8 (A9): คำตอบรูปคงที่ — ไม่ผ่าน posData (ผลฟิลด์เดียว = ค่าเปล่า · หลายฟิลด์ = วัตถุ ⇒ รูปเปลี่ยนตามผล) ◂
    return posResult(await setChannelOrderSettings({ tenantId: actor.tenantId, systemId: actor.systemId, unitId }, posRegisterActorOf(actor), { channelId: params.id ?? "", pausedUntil: null })).channel;
  },
});

export const CHANNELS_OPS: ApiOp[] = [channelsList, channelsPause, channelsResume];
