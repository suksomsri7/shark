// ops/shifts.ts — op อ่านกะของระบบขายหน้าร้าน (ใบ P2.13 · brief §1 #10–#12 + IN-B shifts.current · มติ §10)
// อ่านอย่างเดียว: เปิด/ปิดกะ · เงินเข้าออกลิ้นชัก ต้องมีเครื่อง + คนเปิดกะ (P3.4/P3.5) — ไม่มีใน v1
// 🔴 X/Z ของกะคนอื่น = pos.shift.manage (กติกา "กะของตัวเอง" ของ shift.ts) ⇒ ทุก op ที่นี่ใช้ scope นั้น
import { z } from "zod";
import { currentShift, listShifts, xReport, zReport } from "../../shift";
import { posRegisterActorOf } from "../actor";
import { posData } from "../http-errors";
import { definePosOp, POS_SCOPES, type ApiOp } from "../op";
import { posShiftUnit, requirePosUnit } from "../units";

const unitIdField = z.string().min(1).max(64).describe("Branch (BusinessUnit id) of this POS system.");
const unitIdOpt = unitIdField.optional().describe("Branch of the shift. Optional: the shift's own branch is used; a different branch answers 404.");

const shiftsList = definePosOp({
  id: "shifts.list",
  method: "GET",
  path: "/shifts",
  kind: "read",
  action: POS_SCOPES.shiftManage,
  summary: "Recent shifts of a branch, newest first: device, opener, opened/closed time, status and the frozen Z totals of closed shifts.",
  label: "รายการกะ",
  test: "shifts.list",
  input: z.object({ unitId: unitIdField, limit: z.coerce.number().int().min(1).max(200).optional().describe("How many shifts (default as the app).") }).strict(),
  async handler({ actor, input }) {
    const unitId = await requirePosUnit(actor, input.unitId);
    return posData(await listShifts({ tenantId: actor.tenantId, systemId: actor.systemId, unitId }, posRegisterActorOf(actor), input.limit ? { limit: input.limit } : {}));
  },
});

const shiftsCurrent = definePosOp({
  id: "shifts.current",
  method: "GET",
  path: "/shifts/current",
  kind: "read",
  action: POS_SCOPES.shiftManage,
  summary: "The open shift of one register device of a branch (null when none). A shift left open past the shop limit is force closed first, exactly as at the register.",
  label: "กะปัจจุบันของเครื่อง",
  test: "shifts.current",
  input: z.object({ unitId: unitIdField, deviceId: z.string().min(8).max(64).describe("Device code of the register (GET /devices).") }).strict(),
  async handler({ actor, input }) {
    const unitId = await requirePosUnit(actor, input.unitId);
    return posData(await currentShift({ tenantId: actor.tenantId, systemId: actor.systemId, unitId }, posRegisterActorOf(actor), { deviceId: input.deviceId }));
  },
});

const reportInput = z.object({ unitId: unitIdOpt }).strict();

const shiftsX = definePosOp({
  id: "shifts.xReport",
  method: "GET",
  path: "/shifts/{id}/x-report",
  kind: "read",
  action: POS_SCOPES.shiftManage,
  summary: "X report of a shift (running totals so far: sales by payment method, cash in and out, expected cash in the drawer).",
  label: "รายงาน X ของกะ",
  test: "shifts.xReport",
  tool: { name: "pos_shift_now", hint: "Use for the running totals of one open shift (find the shift with pos_shift_report)." }, // POS P3.9 ▸ R1 มติ 1 ◂
  input: reportInput,
  async handler({ actor, params, input }) {
    const unitId = await posShiftUnit(actor, params.id ?? "", input.unitId);
    return posData(await xReport({ tenantId: actor.tenantId, systemId: actor.systemId, unitId }, posRegisterActorOf(actor), { shiftId: params.id ?? "" }));
  },
});

const shiftsZ = definePosOp({
  id: "shifts.zReport",
  method: "GET",
  path: "/shifts/{id}/z-report",
  kind: "read",
  action: POS_SCOPES.shiftManage,
  summary: "Z report of a closed shift (frozen at close: totals, counted cash, over/short). An open shift answers 422 validation.",
  label: "รายงาน Z ของกะ",
  test: "shifts.zReport",
  input: reportInput,
  async handler({ actor, params, input }) {
    const unitId = await posShiftUnit(actor, params.id ?? "", input.unitId);
    return posData(await zReport({ tenantId: actor.tenantId, systemId: actor.systemId, unitId }, posRegisterActorOf(actor), { shiftId: params.id ?? "" }));
  },
});

export const SHIFTS_OPS: ApiOp[] = [shiftsList, shiftsCurrent, shiftsX, shiftsZ];
