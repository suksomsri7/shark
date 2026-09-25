"use server";

// actions.ts — server actions ของหน้า "ตั้งค่าการแจ้งเตือน" `/app/sys/{id}/crm/settings/notifications` (ใบ C2.10 · §7.4 · มติ C22)
// 🔴 "use server" = ส่งออกได้เฉพาะ async function (ชนิด/ค่าคงที่ส่งออกจากที่นี่ไม่ได้ — หน้า 500 ทั้งที่ build ผ่าน)
// 🔴 tenantId มาจาก session เสมอ · systemId ถูก resolve ใหม่ในบริการ (`crm/notifications.ts`) — ไม่เชื่อ id จากหน้าจอ
// 🔴 ด่านของ "ค่าของร้าน" = คีย์ `crm.settings.manage` (ตรวจในบริการ) · ด่านของ "ค่าของฉัน" = เป็นพนักงานของร้านนี้
//    (ไม่ต้องมีคีย์ · และไม่มีทางเขียนค่าของคนอื่น — บริการปฏิเสธ payload ที่ระบุ userId คนอื่น)
// 🔴 uiVersion: หน้านี้มีเฉพาะ CRM v2 — ระบบที่ยังไม่เปิด = ปฏิเสธภาษาไทย (assertCrmV2 · CRM_V2_DISABLED)
// 🔴 ข้อความ error ไม่โทษผู้ใช้ · error ที่ไม่รู้จัก = ข้อความกลาง (รายละเอียดไม่หลุดไปหน้าจอ)

import { revalidatePath } from "next/cache";
import { requireTenant } from "@/lib/core/context";
import { ForbiddenError } from "@/lib/core/rbac";
import { toMemberActor } from "@/lib/modules/member";
import { CrmNotifyError, setMyPrefs, setNotificationSettings, setTemplate } from "@/lib/modules/crm/notifications";
import { assertCrmV2, CrmV2DisabledError } from "@/lib/modules/crm/ui-version";
import type { CrmNotifyActionResult, CrmNotifyQuiet } from "@/components/crm/notifications/types";

async function session(systemId: string) {
  const auth = await requireTenant();
  const actor = toMemberActor(auth.user.id, auth.active);
  const ctx = { tenantId: auth.active.tenantId, systemId: String(systemId ?? ""), actorUserId: auth.user.id };
  await assertCrmV2(ctx);
  return { ctx, actor };
}

function failOf(e: unknown): { ok: false; error: string; code?: string } {
  if (e instanceof CrmV2DisabledError) return { ok: false, error: e.message, code: e.code };
  if (e instanceof CrmNotifyError) return { ok: false, error: e.message, code: e.code };
  if (e instanceof ForbiddenError) return { ok: false, error: e.message, code: "FORBIDDEN" };
  console.error(`[crm.notifications] action ล้มเหลว — ${e instanceof Error ? e.name : "unknown"}`);
  return { ok: false, error: "บันทึกไม่สำเร็จ ระบบยกเลิกรายการให้แล้ว (ค่าการแจ้งเตือนไม่เปลี่ยน) — ลองใหม่อีกครั้ง" };
}

const touch = (systemId: string) => revalidatePath(`/app/sys/${systemId}/crm/settings/notifications`);

/** เปิด/ปิดช่องทางของเรื่องหนึ่ง — ค่าของร้าน (คีย์ `crm.settings.manage`) */
export async function setCrmNotifyChannelAction(systemId: string, key: string, channel: string, on: boolean): Promise<CrmNotifyActionResult> {
  try {
    const { ctx, actor } = await session(systemId);
    await setTemplate(ctx, actor, String(key ?? ""), { channels: { [String(channel ?? "")]: !!on } });
    touch(systemId);
    return { ok: true };
  } catch (e) {
    return failOf(e);
  }
}

/** ช่วงห้ามรบกวนของร้าน + ชั่วโมงส่งสรุป */
export async function setCrmNotifyShopAction(systemId: string, patch: { quietHours?: CrmNotifyQuiet; digestHour?: number }): Promise<CrmNotifyActionResult> {
  try {
    const { ctx, actor } = await session(systemId);
    await setNotificationSettings(ctx, actor, {
      ...(patch?.quietHours ? { quietHours: { enabled: !!patch.quietHours.enabled, from: String(patch.quietHours.from), to: String(patch.quietHours.to) } } : {}),
      ...(patch?.digestHour !== undefined ? { digestHour: Number(patch.digestHour) } : {}),
    });
    touch(systemId);
    return { ok: true };
  } catch (e) {
    return failOf(e);
  }
}

/** เปิด/ปิดช่องทางของเรื่องหนึ่ง — ค่าของ "ฉัน" (ทับค่าร้าน) */
export async function setCrmNotifyMyChannelAction(systemId: string, key: string, channel: string, on: boolean): Promise<CrmNotifyActionResult> {
  try {
    const { ctx, actor } = await session(systemId);
    await setMyPrefs(ctx, actor, { notifications: { [String(key ?? "")]: { [String(channel ?? "")]: !!on } } });
    touch(systemId);
    return { ok: true };
  } catch (e) {
    return failOf(e);
  }
}

/** ช่วงห้ามรบกวนของ "ฉัน" — `null` = กลับไปใช้ของร้าน */
export async function setCrmNotifyMyQuietAction(systemId: string, patch: { quietHours: CrmNotifyQuiet | null }): Promise<CrmNotifyActionResult> {
  try {
    const { ctx, actor } = await session(systemId);
    await setMyPrefs(ctx, actor, {
      quietHours: patch?.quietHours ? { enabled: !!patch.quietHours.enabled, from: String(patch.quietHours.from), to: String(patch.quietHours.to) } : null,
    });
    touch(systemId);
    return { ok: true };
  } catch (e) {
    return failOf(e);
  }
}
