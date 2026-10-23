// device-request.ts — POS P5.2 ▸ CD-P52-O4 F1 (ต่อ D2/D3 · CD-P52-O2-2 · CD-P52-O2-3): "เครื่องที่ยืนอยู่" ของคำขอนี้ = คุกกี้เครื่องลงนามเท่านั้น ◂
//
// ผู้เรียก = server action (register-actions · shift-actions · refund-actions) — deviceId ใน payload ของ client ไม่ถูกเชื่อ
//   bind  : paired = ใช้เครื่องของคุกกี้ · revoked = DEVICE_REVOKED · ไม่มีคุกกี้ + สาขามีเครื่อง ACTIVE = DEVICE_NOT_PAIRED · ไม่มีคุกกี้ + สาขาไม่มีเครื่องเลย = ทางเดิมไม่มีเครื่อง
//   strip : paired = ใช้เครื่องของคุกกี้ · revoked = DEVICE_REVOKED · อย่างอื่น = ไม่มีเครื่อง (งานที่ทำได้โดยไม่ยืนที่เครื่อง เช่น ค้นสินค้า/คืนเงินนอกกะ)
// 🔴 ไม่ใช่ไฟล์ "use server" · อ่านคุกกี้จาก next/headers (เฉพาะในคำขอ) · ล้ม = ปิด (ถือว่าไม่มีคุกกี้)
import { cookies } from "next/headers";
import { deviceBinding } from "./device";
import { POS_DEVICE_COOKIE } from "./device-cookie";

export type DeviceNotPaired = { ok: false; code: "DEVICE_NOT_PAIRED"; message: string };
export type DeviceRevokedRefusal = { ok: false; code: "DEVICE_REVOKED"; message: string };
export const DEVICE_NOT_PAIRED_MESSAGE = "เครื่องนี้ยังไม่ได้จับคู่กับสาขา — ให้ผู้จัดการจับคู่ที่ ตั้งค่า › เครื่องขาย ก่อน";
export const DEVICE_REVOKED_MESSAGE = "เครื่องนี้ถูกเพิกถอนแล้ว — ใช้ขายหรือเปิดกะไม่ได้ ติดต่อผู้จัดการ";
export const notPaired = (message = DEVICE_NOT_PAIRED_MESSAGE): DeviceNotPaired => ({ ok: false, code: "DEVICE_NOT_PAIRED", message });
export const deviceRevoked = (): DeviceRevokedRefusal => ({ ok: false, code: "DEVICE_REVOKED", message: DEVICE_REVOKED_MESSAGE });

/** เครื่องของคำขอ: { deviceId?: รหัสเครื่องของคุกกี้ } หรือคำปฏิเสธ (โหมด bind/strip ตามหัวไฟล์) */
export async function requestDevice(scope: { tenantId: string; unitId: string }, mode: "bind" | "strip"): Promise<{ ok: true; deviceId?: string } | DeviceNotPaired | DeviceRevokedRefusal> {
  let value: string | undefined;
  try {
    value = (await cookies()).get(POS_DEVICE_COOKIE)?.value;
  } catch (e) {
    console.error("[pos/device-request] cookies", e);
  }
  const b = await deviceBinding(scope, value);
  if (b.kind === "paired") return { ok: true, deviceId: b.deviceCode };
  if (b.kind === "revoked") return deviceRevoked();
  if (mode === "bind" && b.unitHasDevices) return notPaired();
  return { ok: true };
}

/** POS P5.2 ▸ CD-P52-O4b: โหมด strip แบบไม่ปฏิเสธ — เครื่อง ACTIVE ของคุกกี้ หรือไม่มีเครื่อง (deviceId ของ client ถูกทิ้ง · เพิกถอน = ไม่มีเครื่อง) ◂ */
export async function cookieDeviceId(scope: { tenantId: string; unitId: string }): Promise<string | undefined> {
  if (!scope.tenantId || !scope.unitId) return undefined;
  const d = await requestDevice(scope, "strip");
  return d.ok ? d.deviceId : undefined;
}
/** POS P5.2 ▸ CD-P52-O4b: คำปฏิเสธของโหมด bind ที่ผู้เรียกคืนตรง ๆ (lineIndex/field ว่าง — จอที่อ่านช่องเหล่านี้ใช้ชนิดเดิมได้) ◂ */
export type DeviceBindRefusal = (DeviceNotPaired | DeviceRevokedRefusal) & { lineIndex?: undefined; field?: undefined };
/** POS P5.2 ▸ CD-P52-O4b: โหมด bind บน ctx ที่มีอยู่ — แทน ctx.deviceId ด้วยเครื่องของคุกกี้ หรือคืนคำปฏิเสธ ◂ */
export async function bindCtxDevice<C extends { tenantId: string; unitId: string; deviceId?: string }>(ctx: C): Promise<{ ok: true; ctx: C } | DeviceBindRefusal> {
  const d = await requestDevice({ tenantId: ctx.tenantId, unitId: ctx.unitId }, "bind");
  if (!d.ok) return d;
  const { deviceId: _client, ...rest } = ctx;
  void _client;
  return { ok: true, ctx: { ...rest, ...(d.deviceId ? { deviceId: d.deviceId } : {}) } as C };
}
