"use server";
// device-actions.ts — server action ทะเบียนเครื่องขาย (POS P1.10 · มติ R2) · เปลือกบาง: session → ctx/actor → device.*
//
// 🔴 ไฟล์ "use server" export ได้เฉพาะ async function — ชนิดข้อมูลอยู่ที่ device-shared.ts
// 🔴 คำปฏิเสธ "คืน" เสมอ {ok:false, code, message} (Next ปิดข้อความของ error ที่โยนออกจาก action ใน production)
// 🔴 ร้าน + ผู้ใช้ (role · unitAccess · permissions) มาจาก membership ของ SESSION เท่านั้น · systemId/unitId จากคำขอถูกตรวจซ้ำใน device.ts
//    ลงทะเบียน/แก้/เพิกถอน/รายการ = pos.device.manage ที่สาขานั้น · heartbeat = pos.sale.create (หน้าขาย)

import { unstable_rethrow } from "next/navigation";
import { cookies } from "next/headers"; // POS P5.2 ▸ D1 ◂
import { secureCookies } from "@/lib/env"; // POS P5.2 ▸ D1 ◂
import { requireTenant } from "@/lib/core/context";
import { assertCan, canAccessUnit } from "@/lib/core/rbac";
import { posMembership } from "./access";
import { heartbeat, listDevices, pairedDevice, registerDevice, revokeDevice, updateDevice } from "./device"; // POS P5.2 ▸ + pairedDevice ◂
import { POS_DEVICE_COOKIE, POS_DEVICE_COOKIE_MAX_AGE_S, posDeviceKeyConfigured, signPosDeviceCookie } from "./device-cookie"; // POS P5.2 ▸ D1 ◂
import type {
  DevicePairingResult, // POS P5.2 ▸ D1 ◂
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

/** ลงทะเบียน / จับคู่เครื่องนี้ (deviceCode = รหัสเครื่องจาก localStorage ของเบราว์เซอร์นี้) */
export async function registerDeviceAction(args: Target & RegisterDeviceInput): Promise<PosDeviceResult> {
  try {
    const s = await sessionScope(args, "pos.device.manage");
    if ("ok" in s) return s;
    // POS P5.2 ▸ D1 (CD-P52-O2-3): จับคู่ = ลงทะเบียน + คุกกี้เครื่องลงนามด้วยกุญแจแยก POS_DEVICE_KEY (device-cookie.ts) ·
    //   ยังไม่ตั้งกุญแจ = ปฏิเสธ DEVICE_KEY_UNSET ก่อนสร้างแถว (การ์ด "ยังไม่ตั้งกุญแจ") · ผู้ถือ pos.device.manage ที่สาขาเท่านั้น (แคชเชียร์ = PERMISSION_DENIED) ·
    //   ลงทะเบียนรหัสเดิมที่ ACTIVE = จับคู่เบราว์เซอร์นี้ใหม่ (ได้คุกกี้ใหม่) ◂
    if (!posDeviceKeyConfigured()) return refusal("DEVICE_KEY_UNSET", "ยังไม่ตั้งกุญแจจับคู่เครื่อง — ผู้ดูแลระบบต้องตั้งกุญแจก่อนจึงจะจับคู่เครื่องขายได้");
    const r = await registerDevice(s.ctx, s.actor, { name: args?.name, deviceCode: args?.deviceCode });
    if (r.ok) {
      const value = signPosDeviceCookie({ tenantId: s.ctx.tenantId, unitId: s.ctx.unitId, deviceId: r.device.id, deviceCode: r.device.deviceCode, iat: Math.floor(Date.now() / 1000) });
      (await cookies()).set(POS_DEVICE_COOKIE, value, { httpOnly: true, secure: secureCookies, sameSite: "strict", path: "/", maxAge: POS_DEVICE_COOKIE_MAX_AGE_S });
    }
    return r; // ◂ POS P5.2
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

/** POS P5.2 ▸ D1 (CD-P52-O2-3): ตั้งกุญแจแล้วหรือยัง + เบราว์เซอร์นี้จับคู่กับเครื่องไหนของสาขานี้ (หน้าเครื่องขาย: การ์ด "ยังไม่ตั้งกุญแจ" · ปุ่มจับคู่เครื่องนี้) ◂ */
export async function devicePairingAction(args: Target): Promise<DevicePairingResult> {
  try {
    const s = await sessionScope(args, "pos.device.manage");
    if ("ok" in s) return s;
    const keyConfigured = posDeviceKeyConfigured();
    const dev = keyConfigured ? await pairedDevice(s.ctx, (await cookies()).get(POS_DEVICE_COOKIE)?.value) : null;
    return { ok: true, keyConfigured, pairedDeviceId: dev?.id ?? null };
  } catch (e) {
    unstable_rethrow(e);
    return unexpected("devicePairingAction", e);
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
