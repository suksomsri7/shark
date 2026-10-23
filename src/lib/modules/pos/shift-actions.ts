"use server";
// shift-actions.ts — server action ของกะ/ลิ้นชัก (POS P1.9 · มติ S3) · เปลือกบาง: session → ctx/actor → shift.* → คืนผลตามเดิม
// 🔴 ไฟล์ "use server" export ได้เฉพาะ async function · ชนิดข้อมูลอยู่ที่ shift.ts / register-shared.ts
// 🔴 คำปฏิเสธ "คืน" เสมอ {ok:false, code, message} · ขัดข้องที่ไม่คาดคิด = {ok:false, code:"INTERNAL"}
// 🔴 ร้าน + ผู้ทำรายการ (role · unitAccess · permissions) มาจาก membership ของ SESSION เท่านั้น — สิทธิ์กะ (operate/manage) ตัดสินใน shift.ts
//    ไม่มี PIN (HR เป็นเจ้าของ · P1.15/P3.5)

import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { requireTenant } from "@/lib/core/context";
import { assertCan, canAccessUnit } from "@/lib/core/rbac";
import { posMembership } from "./access";
import {
  closeShift,
  currentShift,
  listShifts,
  offShiftCash,
  openShift,
  recordCashMovement,
  recountShift,
  shiftsPageData,
  xReport,
  zReport,
  type CashMovementInput,
  type CashMovementResult,
  type CloseShiftInput,
  type CloseShiftResult,
  type CurrentShiftResult,
  type ListShiftsResult,
  type OffShiftCashResult,
  type OpenShiftInput,
  type OpenShiftResult,
  type RecountShiftInput,
  type RecountShiftResult,
  type ShiftRefusal,
  type ShiftReportResult,
  type ShiftsPageData,
} from "./shift";
import type { RegisterActor, RegisterCtx } from "./register-shared";
import { notPaired, requestDevice, type DeviceNotPaired, type DeviceRevokedRefusal } from "./device-request"; // POS P5.2 ▸ D2/D3 · CD-P52-O4 F1 ◂

type Target = { systemId: string; unitId: string; deviceId?: string };
type Session = Awaited<ReturnType<typeof requireTenant>>;

function refusal(code: ShiftRefusal["code"], message: string): ShiftRefusal {
  return { ok: false, code, message };
}
function unexpected(where: string, e: unknown): ShiftRefusal {
  console.error(`[pos/shift-actions] ${where}`, e);
  return refusal("INTERNAL", "เกิดข้อผิดพลาด — ลองอีกครั้ง");
}
async function session(where: string): Promise<Session | ShiftRefusal> {
  try {
    return await requireTenant();
  } catch (e) {
    unstable_rethrow(e);
    return unexpected(`${where} requireTenant`, e);
  }
}
/** session → ขอบเขต + ผู้ทำรายการ · เข้าสาขาไม่ได้ = NOT_FOUND (shift.ts ตรวจซ้ำพร้อมระบบ/สาขาจาก DB) */
function scopeOf(auth: Session, args: unknown): { ctx: RegisterCtx; actor: RegisterActor } | ShiftRefusal {
  const a = args && typeof args === "object" ? (args as Record<string, unknown>) : {};
  const systemId = typeof a.systemId === "string" ? a.systemId : "";
  const unitId = typeof a.unitId === "string" ? a.unitId : "";
  if (!systemId || !unitId) return refusal("NOT_FOUND", "ไม่พบสาขานี้");
  const m = posMembership(auth.active);
  if (!canAccessUnit(m, unitId)) return refusal("NOT_FOUND", "ไม่พบสาขานี้");
  // ด่านหยาบ: ต้องมีสิทธิ์ POS ที่เกี่ยวกับกะอย่างน้อยหนึ่งอย่างที่สาขานี้ (สิทธิ์ละเอียดต่อคำสั่ง operate/manage/ของตัวเอง = shift.ts)
  const allowed = (["pos.shift.operate", "pos.shift.manage", "pos.sale.create"] as const).some((action) => {
    try {
      assertCan(m, { module: "pos", action, unitId });
      return true;
    } catch {
      return false;
    }
  });
  if (!allowed) return refusal("PERMISSION_DENIED", "บัญชีนี้ยังไม่มีสิทธิ์จัดการกะ — ขอสิทธิ์จากเจ้าของร้าน");
  const deviceId = typeof a.deviceId === "string" ? a.deviceId : undefined;
  return {
    ctx: { tenantId: auth.active.tenantId, systemId, unitId, ...(deviceId !== undefined ? { deviceId } : {}) },
    actor: { userId: auth.user.id, role: m.role, unitAccess: m.unitAccess, permissions: m.permissions },
  };
}
// POS P5.2 ▸ D2/D3 + CD-P52-O4 F1 (CD-P52-O2-2 สัญญา D1 · CD-P52-O2-3 กุญแจแยก · §10.4 D1c): "เครื่องที่ยืนอยู่" = คุกกี้เครื่องลงนามเท่านั้น (device-request.ts) —
//   deviceId จาก client ไม่ถูกเชื่อในทุกคำสั่งของกะ · เปิดกะ = ต้องมีคุกกี้ (D2) · X/กะปัจจุบัน/หน้ากะ = เครื่องของคุกกี้ (D3) ·
//   เงินเข้า/ออก = bind (เพิกถอน = DEVICE_REVOKED · ไม่มีคุกกี้ + สาขามีเครื่อง = DEVICE_NOT_PAIRED — ไม่ส่ง deviceId ก็ข้ามการตรวจเพิกถอนไม่ได้) ·
//   ปิดกะ = bind แต่ผู้ถือ pos.shift.manage ที่สาขาปิดจากเครื่องที่ไม่ได้จับคู่ได้ (ผู้จัดการปิดกะค้างของเครื่องที่ถูกเพิกถอนที่หน้ากะ) ◂
type Scoped = { ctx: RegisterCtx; actor: RegisterActor };
type NotPaired = DeviceNotPaired;
const NOT_PAIRED = notPaired;
function withDevice(s: Scoped, deviceId: string | undefined): Scoped {
  const { deviceId: _client, ...rest } = s.ctx as RegisterCtx & { deviceId?: string };
  void _client;
  return { ctx: { ...rest, ...(deviceId ? { deviceId } : {}) } as RegisterCtx, actor: s.actor };
}
/** อ่านอย่างเดียว: เครื่องของคุกกี้ (เพิกถอน/ไม่มี = ไม่มีเครื่อง) */
async function pairedScope(s: Scoped): Promise<Scoped> {
  const d = await requestDevice({ tenantId: s.ctx.tenantId, unitId: s.ctx.unitId }, "strip");
  return withDevice(s, d.ok ? d.deviceId : undefined);
}
/** เขียน: bind (ดูหัวบล็อก) · manageMayUnpair = ผู้ถือ pos.shift.manage ไม่ต้องมีคุกกี้ */
async function boundScope(s: Scoped, manageMayUnpair = false): Promise<Scoped | DeviceNotPaired | DeviceRevokedRefusal> {
  const d = await requestDevice({ tenantId: s.ctx.tenantId, unitId: s.ctx.unitId }, "bind");
  if (d.ok) return withDevice(s, d.deviceId);
  if (d.code === "DEVICE_NOT_PAIRED" && manageMayUnpair) {
    try {
      assertCan(s.actor, { module: "pos", action: "pos.shift.manage", unitId: s.ctx.unitId });
      return withDevice(s, undefined);
    } catch {
      return d;
    }
  }
  return d;
}
// ◂ POS P5.2

function touch(systemId: string): void {
  try {
    revalidatePath(`/app/sys/${systemId}/pos/shifts`);
  } catch (e) {
    console.error("[pos/shift-actions] revalidatePath", e);
  }
}

/** เปิดกะของเครื่องนี้ (S4) */
export async function openShiftAction(args: Target & { shift: OpenShiftInput }): Promise<OpenShiftResult | NotPaired | DeviceRevokedRefusal> { // POS P5.2 ▸ + NotPaired · DeviceRevoked ◂
  const auth = await session("openShiftAction");
  if ("ok" in auth) return auth;
  try {
    const s0 = scopeOf(auth, args);
    if ("ok" in s0) return s0;
    // POS P5.2 ▸ D2: ผูกเครื่องจากคุกกี้เท่านั้น — ไม่มีคุกกี้ = DEVICE_NOT_PAIRED · รหัสเครื่องใน payload ไม่ตรงคุกกี้ = ปฏิเสธ (ไม่เปิดบนเครื่องที่อ้าง) ◂
    const sb = await boundScope(s0);
    if ("ok" in sb) return sb;
    const s = sb;
    const dev = s.ctx.deviceId;
    if (!dev) return NOT_PAIRED(); // สาขายังไม่มีเครื่อง = เปิดกะไม่ได้จนกว่าจะจับคู่ (D2)
    const input: unknown = args?.shift;
    if (!input || typeof input !== "object" || Array.isArray(input)) return refusal("VALIDATION", "ข้อมูลที่ส่งมาไม่ถูกต้อง — ยังไม่ได้บันทึกอะไร");
    const claimed = (input as { deviceId?: unknown }).deviceId;
    if (claimed !== undefined && claimed !== dev) return NOT_PAIRED("รหัสเครื่องไม่ตรงกับเครื่องที่จับคู่ไว้บนเบราว์เซอร์นี้ — เปิดกะไม่ได้");
    const r = await openShift(s.ctx, s.actor, { ...(input as OpenShiftInput), deviceId: dev });
    if (r.ok) touch(s.ctx.systemId);
    return r;
  } catch (e) {
    return unexpected("openShiftAction", e);
  }
}

/** กะ OPEN ของเครื่องนี้ (null = ยังไม่เปิด) */
export async function currentShiftAction(args: Target & { deviceId: string }): Promise<CurrentShiftResult | NotPaired> { // POS P5.2 ▸ + NotPaired ◂
  const auth = await session("currentShiftAction");
  if ("ok" in auth) return auth;
  try {
    const s0 = scopeOf(auth, args);
    if ("ok" in s0) return s0;
    const s = await pairedScope(s0); // POS P5.2 ▸ D2/D3: เครื่องนี้ = คุกกี้ ◂
    if (!s.ctx.deviceId) return NOT_PAIRED();
    return await currentShift(s.ctx, s.actor, { deviceId: s.ctx.deviceId });
  } catch (e) {
    return unexpected("currentShiftAction", e);
  }
}

/** รายงาน X (สด · อ่านอย่างเดียว) */
export async function xReportAction(args: Target & { shiftId: string }): Promise<ShiftReportResult> {
  const auth = await session("xReportAction");
  if ("ok" in auth) return auth;
  try {
    const s0 = scopeOf(auth, args);
    if ("ok" in s0) return s0;
    const s = await pairedScope(s0); // POS P5.2 ▸ D3: ข้อยกเว้น "เครื่องของกะ" ของ STAFF ไม่มี manage = คุกกี้เท่านั้น (ไม่มีคุกกี้ = กะของตัวเองเท่านั้น) ◂
    return await xReport(s.ctx, s.actor, { shiftId: args.shiftId });
  } catch (e) {
    return unexpected("xReportAction", e);
  }
}

/** ปิดกะ + Z (S10) */
export async function closeShiftAction(args: Target & { close: CloseShiftInput }): Promise<CloseShiftResult | NotPaired | DeviceRevokedRefusal> { // POS P5.2 ▸ CD-P52-O4 F1 ◂
  const auth = await session("closeShiftAction");
  if ("ok" in auth) return auth;
  try {
    const s0 = scopeOf(auth, args);
    if ("ok" in s0) return s0;
    const s = await boundScope(s0, true); // POS P5.2 ▸ CD-P52-O4 F1: เครื่องจากคุกกี้ · เพิกถอน = DEVICE_REVOKED · ไม่จับคู่ได้เฉพาะผู้ถือ pos.shift.manage ◂
    if ("ok" in s) return s;
    const r = await closeShift(s.ctx, s.actor, args.close);
    if (r.ok) touch(s.ctx.systemId);
    return r;
  } catch (e) {
    return unexpected("closeShiftAction", e);
  }
}

/** รายงาน Z ที่แช่แข็ง */
export async function zReportAction(args: Target & { shiftId: string }): Promise<ShiftReportResult> {
  const auth = await session("zReportAction");
  if ("ok" in auth) return auth;
  try {
    const s = scopeOf(auth, args);
    if ("ok" in s) return s;
    return await zReport(s.ctx, s.actor, { shiftId: args.shiftId });
  } catch (e) {
    return unexpected("zReportAction", e);
  }
}

/** เงินเข้า/ออกลิ้นชัก (S8) */
export async function recordCashMovementAction(args: Target & { movement: CashMovementInput }): Promise<CashMovementResult | NotPaired | DeviceRevokedRefusal> { // POS P5.2 ▸ CD-P52-O4 F1 ◂
  const auth = await session("recordCashMovementAction");
  if ("ok" in auth) return auth;
  try {
    const s0 = scopeOf(auth, args);
    if ("ok" in s0) return s0;
    const s = await boundScope(s0); // POS P5.2 ▸ CD-P52-O4 F1: ตรวจเพิกถอนจากเครื่องของคุกกี้ · ไม่ส่ง deviceId ก็ข้ามไม่ได้ ◂
    if ("ok" in s) return s;
    return await recordCashMovement(s.ctx, s.actor, args.movement);
  } catch (e) {
    return unexpected("recordCashMovementAction", e);
  }
}

/** ประวัติกะของสาขา */
export async function listShiftsAction(args: Target & { limit?: number }): Promise<ListShiftsResult> {
  const auth = await session("listShiftsAction");
  if ("ok" in auth) return auth;
  try {
    const s = scopeOf(auth, args);
    if ("ok" in s) return s;
    return await listShifts(s.ctx, s.actor, args.limit !== undefined ? { limit: args.limit } : {});
  } catch (e) {
    return unexpected("listShiftsAction", e);
  }
}

/** เงินสดนอกกะของวันทำการ (S16) */
export async function offShiftCashAction(args: Target & { businessDate?: string }): Promise<OffShiftCashResult> {
  const auth = await session("offShiftCashAction");
  if ("ok" in auth) return auth;
  try {
    const s = scopeOf(auth, args);
    if ("ok" in s) return s;
    return await offShiftCash(s.ctx, s.actor, args.businessDate !== undefined ? { businessDate: args.businessDate } : {});
  } catch (e) {
    return unexpected("offShiftCashAction", e);
  }
}

/** P1.9b (R13) ผู้จัดการนับเงินย้อนหลังของกะที่ระบบบังคับปิด — สิทธิ์ manage ตัดสินใน shift.ts */
export async function recountShiftAction(args: Target & { recount: RecountShiftInput }): Promise<RecountShiftResult> {
  const auth = await session("recountShiftAction");
  if ("ok" in auth) return auth;
  try {
    const s = scopeOf(auth, args);
    if ("ok" in s) return s;
    const r = await recountShift(s.ctx, s.actor, args.recount);
    if (r.ok) touch(s.ctx.systemId);
    return r;
  } catch (e) {
    return unexpected("recountShiftAction", e);
  }
}

/** POS P1.9 U — ข้อมูลทั้งหน้ากะ (ภาพ 07) ในคำขอเดียว: กะของเครื่องนี้ · X + เงินเข้า/ออก · ประวัติ · เงินสดนอกกะ (Server Action เรียงคิวต่อ client) */
export async function shiftsPageDataAction(args: Target): Promise<ShiftsPageData> {
  const auth = await session("shiftsPageDataAction");
  if ("ok" in auth) return auth;
  try {
    const s0 = scopeOf(auth, args);
    if ("ok" in s0) return s0;
    const s = await pairedScope(s0); // POS P5.2 ▸ D3: กะ/X ของ "เครื่องนี้" บนหน้ากะ = คุกกี้ ◂
    return await shiftsPageData(s.ctx, s.actor, s.ctx.deviceId !== undefined ? { deviceId: s.ctx.deviceId } : {});
  } catch (e) {
    return unexpected("shiftsPageDataAction", e);
  }
}
