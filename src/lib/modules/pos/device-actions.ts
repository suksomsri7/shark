"use server";
// device-actions.ts — server action ทะเบียนเครื่องขาย (POS P1.10 · มติ R2) · เปลือกบาง: session → ctx/actor → device.*
//
// 🔴 ไฟล์ "use server" export ได้เฉพาะ async function — ชนิดข้อมูลอยู่ที่ device-shared.ts
// 🔴 คำปฏิเสธ "คืน" เสมอ {ok:false, code, message} (Next ปิดข้อความของ error ที่โยนออกจาก action ใน production)
// 🔴 ร้าน + ผู้ใช้ (role · unitAccess · permissions) มาจาก membership ของ SESSION เท่านั้น · systemId/unitId จากคำขอถูกตรวจซ้ำใน device.ts
//    ลงทะเบียน/แก้/เพิกถอน/รายการ = pos.device.manage ที่สาขานั้น · heartbeat = pos.sale.create (หน้าขาย)

import { unstable_rethrow } from "next/navigation";
import { requireTenant } from "@/lib/core/context";
import { assertCan, canAccessUnit } from "@/lib/core/rbac";
import { posMembership } from "./access";
import { heartbeat, listDevices, registerDevice, revokeDevice, updateDevice } from "./device";
import type {
  HeartbeatResult,
  ListDevicesResult,
  PosDeviceRefusal,
  PosDeviceResult,
  RegisterDeviceInput,
  UpdateDeviceInput,
} from "./device-shared";
import type { RegisterActor, RegisterCtx } from "./register-shared";

type Target = { systemId: string; unitId: string };

function refusal(code: PosDeviceRefusal["code"], message: string): PosDeviceRefusal {
  return { ok: false, code, message };
}

function unexpected(where: string, e: unknown): PosDeviceRefusal {
  console.error(`[pos/device-actions] ${where}`, e);
  return refusal("INTERNAL", "เกิดข้อผิดพลาด — ลองอีกครั้ง");
}

/** session → ขอบเขต + ผู้ใช้ · เข้าสาขาไม่ได้ = NOT_FOUND · ไม่มีสิทธิ์ `action` ที่สาขานี้ = PERMISSION_DENIED (device.ts ตรวจซ้ำกับ DB) */
async function sessionScope(args: unknown, action: "pos.device.manage" | "pos.sale.create"): Promise<{ ctx: RegisterCtx; actor: RegisterActor } | PosDeviceRefusal> {
  const auth = await requireTenant();
  const a = args && typeof args === "object" ? (args as Record<string, unknown>) : {};
  const systemId = typeof a.systemId === "string" ? a.systemId : "";
  const unitId = typeof a.unitId === "string" ? a.unitId : "";
  if (!systemId || !unitId) return refusal("NOT_FOUND", "ไม่พบสาขานี้");
  const m = posMembership(auth.active);
  if (!canAccessUnit(m, unitId)) return refusal("NOT_FOUND", "ไม่พบสาขานี้");
  try {
    assertCan(m, { module: "pos", action, unitId });
  } catch {
    return refusal("PERMISSION_DENIED", action === "pos.device.manage" ? "บัญชีนี้ยังไม่มีสิทธิ์จัดการเครื่องขาย — ขอสิทธิ์จากเจ้าของร้าน" : "บัญชีนี้ยังไม่มีสิทธิ์ขาย — ขอสิทธิ์จากเจ้าของร้าน");
  }
  return { ctx: { tenantId: auth.active.tenantId, systemId, unitId }, actor: { userId: auth.user.id, role: m.role, unitAccess: m.unitAccess, permissions: m.permissions } };
}

/** ลงทะเบียนเครื่องนี้ (deviceCode = รหัสเครื่องจาก localStorage ของเบราว์เซอร์นี้) */
export async function registerDeviceAction(args: Target & RegisterDeviceInput): Promise<PosDeviceResult> {
  try {
    const s = await sessionScope(args, "pos.device.manage");
    if ("ok" in s) return s;
    return await registerDevice(s.ctx, s.actor, { name: args?.name, deviceCode: args?.deviceCode });
  } catch (e) {
    unstable_rethrow(e);
    return unexpected("registerDeviceAction", e);
  }
}

/** แก้ชื่อ / เลขประจำเครื่อง POS / ค่าตั้งเครื่องพิมพ์ — ส่งเฉพาะฟิลด์ที่แก้ */
export async function updateDeviceAction(args: Target & { patch: UpdateDeviceInput }): Promise<PosDeviceResult> {
  try {
    const s = await sessionScope(args, "pos.device.manage");
    if ("ok" in s) return s;
    return await updateDevice(s.ctx, s.actor, args?.patch ?? { id: "" });
  } catch (e) {
    unstable_rethrow(e);
    return unexpected("updateDeviceAction", e);
  }
}

/** เพิกถอนเครื่อง (กะที่เปิดค้างของเครื่องนั้นผู้จัดการปิดเองที่หน้ากะ) */
export async function revokeDeviceAction(args: Target & { id: string }): Promise<PosDeviceResult> {
  try {
    const s = await sessionScope(args, "pos.device.manage");
    if ("ok" in s) return s;
    return await revokeDevice(s.ctx, s.actor, { id: typeof args?.id === "string" ? args.id : "" });
  } catch (e) {
    unstable_rethrow(e);
    return unexpected("revokeDeviceAction", e);
  }
}

/** เครื่องของสาขานี้ + สถานะออนไลน์ + กะที่เปิดอยู่ + เพดาน */
export async function listDevicesAction(args: Target): Promise<ListDevicesResult> {
  try {
    const s = await sessionScope(args, "pos.device.manage");
    if ("ok" in s) return s;
    return await listDevices(s.ctx, s.actor);
  } catch (e) {
    unstable_rethrow(e);
    return unexpected("listDevicesAction", e);
  }
}

/** heartbeat ของหน้าขาย — คืนแถวของเครื่องนี้ (printerConfig) · ไม่ได้ลงทะเบียน = registered:false */
export async function heartbeatAction(args: Target & { deviceCode: string }): Promise<HeartbeatResult> {
  try {
    const s = await sessionScope(args, "pos.sale.create");
    if ("ok" in s) return s;
    return await heartbeat(s.ctx, s.actor, { deviceCode: typeof args?.deviceCode === "string" ? args.deviceCode : "" });
  } catch (e) {
    unstable_rethrow(e);
    return unexpected("heartbeatAction", e);
  }
}
