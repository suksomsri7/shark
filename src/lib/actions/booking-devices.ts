"use server";

// SVC B.6 — server actions จัดการจอทีวี/ตู้รับบัตรของหน่วยแถวเดียว (พนักงาน) · ใบสั่ง §3.5
//   ทุกตัว: requireUnit → assertCan booking.devices.manage → facade devices (ctx มี actorUserId) · ผู้กระทำ/ร้านจาก session เท่านั้น
//   ลิงก์ที่มี token แสดง "ครั้งเดียว" ในผลของ create/rotate (ไม่เก็บ ไม่ log)
//   🔴 ไฟล์ "use server": export async function เท่านั้น
import { refresh } from "next/cache";
import { requireUnit } from "@/lib/core/context";
import { assertCan } from "@/lib/core/rbac";
import { createDevice, listDevices, revokeDevice, rotateDeviceToken } from "@/lib/modules/booking/devices";

type Auth = Awaited<ReturnType<typeof requireUnit>>["auth"];
const memberOf = (auth: Auth) => ({
  role: auth.active.role,
  unitAccess: Array.isArray(auth.active.unitAccess) ? (auth.active.unitAccess as string[]) : [],
  permissions: (auth.active.permissions ?? {}) as Record<string, unknown>,
});
const str = (fd: FormData, k: string) => {
  const v = fd.get(k);
  return typeof v === "string" ? v.trim() : "";
};
const urlOf = (kind: "TV" | "KIOSK", token: string) => `/bq/${kind === "TV" ? "tv" : "kiosk"}/${token}`;
type DeviceActionResult = { ok: true; deviceId: string; url: string } | { ok: false; reason: string };

export async function createDeviceAction(unitSlug: string, _prev: unknown, formData: FormData): Promise<DeviceActionResult> {
  void _prev;
  const { auth, unit } = await requireUnit(unitSlug);
  assertCan(memberOf(auth), { module: "booking", action: "booking.devices.manage", unitId: unit.id });
  const kind = str(formData, "kind") as "TV" | "KIOSK";
  const r = await createDevice({ tenantId: auth.active.tenantId, unitId: unit.id, actorUserId: auth.user.id }, { kind, name: str(formData, "name") });
  if (!r.ok) return { ok: false, reason: r.reason };
  refresh();
  return { ok: true, deviceId: r.device.id, url: urlOf(r.device.kind, r.token) };
}

export async function rotateDeviceTokenAction(unitSlug: string, _prev: unknown, formData: FormData): Promise<DeviceActionResult> {
  void _prev;
  const { auth, unit } = await requireUnit(unitSlug);
  assertCan(memberOf(auth), { module: "booking", action: "booking.devices.manage", unitId: unit.id });
  const ctx = { tenantId: auth.active.tenantId, unitId: unit.id, actorUserId: auth.user.id };
  const deviceId = str(formData, "deviceId");
  const r = await rotateDeviceToken(ctx, deviceId);
  if (!r.ok) return { ok: false, reason: r.reason };
  const d = (await listDevices(ctx)).find((x) => x.id === deviceId);
  refresh();
  return { ok: true, deviceId, url: urlOf(d?.kind ?? "TV", r.token) };
}

export async function revokeDeviceAction(unitSlug: string, formData: FormData): Promise<void> {
  const { auth, unit } = await requireUnit(unitSlug);
  assertCan(memberOf(auth), { module: "booking", action: "booking.devices.manage", unitId: unit.id });
  const r = await revokeDevice({ tenantId: auth.active.tenantId, unitId: unit.id, actorUserId: auth.user.id }, str(formData, "deviceId"));
  if (r.ok) refresh();
}
