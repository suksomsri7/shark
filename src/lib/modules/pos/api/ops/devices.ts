// ops/devices.ts — op อ่านเครื่องขายของสาขา (ใบ P2.13 · brief §1 #13)
// ลงทะเบียน/เพิกถอนเครื่องผ่าน API = P3.4 (ยังไม่มีตัวตนของเครื่อง) — v1 อ่านอย่างเดียว
import { z } from "zod";
import { listDevices } from "../../device";
import { posRegisterActorOf } from "../actor";
import { posData } from "../http-errors";
import { definePosOp, POS_SCOPES, type ApiOp } from "../op";
import { requirePosUnit } from "../units";

const devicesList = definePosOp({
  id: "devices.list",
  method: "GET",
  path: "/devices",
  kind: "read",
  action: POS_SCOPES.deviceManage,
  summary: "Registered register devices of a branch: name, device code, status, receipt printer settings, and the device limit of the branch.",
  label: "เครื่องขายของสาขา",
  test: "devices.list",
  input: z.object({ unitId: z.string().min(1).max(64).describe("Branch (BusinessUnit id) of this POS system.") }).strict(),
  async handler({ actor, input }) {
    const unitId = await requirePosUnit(actor, input.unitId);
    return posData(await listDevices({ tenantId: actor.tenantId, systemId: actor.systemId, unitId }, posRegisterActorOf(actor)));
  },
});

export const DEVICES_OPS: ApiOp[] = [devicesList];
