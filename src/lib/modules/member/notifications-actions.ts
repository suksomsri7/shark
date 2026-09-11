"use server";

// notifications-actions.ts — server action ของหน้า "ระบบสมาชิก › ตั้งค่า › การแจ้งเตือน" (M3.6 · ภาพ 30)
//
// 🔴 ทุก action ผ่านด่านเดียว `gate(systemId)`: requireTenant → เข้าโมดูลสมาชิกได้ (read-โดยนัย) →
//    มีคีย์ `member.settings.manage` จริง (ไม่ใช่แค่ MANAGER เฉย ๆ — ดู access.ts) → ระบบเป็น MEMBER ของร้านนี้จริง
//    (แบบเดียวกับ `fields-actions.ts`) — เรียก `notifications.ts` เท่านั้น **ห้ามแตะ MemberNotification ผ่าน prisma ตรง**
// 🔴 ตัวส่งจริง (ทดสอบส่งหาตัวเอง) มาจาก composition root `@/lib/member-journey-senders` — import แบบ
//    dynamic เพื่อไม่ให้ไฟล์นี้ (อยู่ใน src/lib/modules/member) ลาก chat/kanban เข้ามาแบบ static (F2)

import { revalidatePath } from "next/cache";
import { requireTenant } from "@/lib/core/context";
import { assertCan, ForbiddenError } from "@/lib/core/rbac";
import { safeReason } from "@/lib/core/errors";
import { prisma } from "./db";
import { canManageSettings, canReadMember, toMemberActor, type MemberActor } from "./access";
import {
  getNotificationSettings,
  setNotificationSettings,
  setTemplate,
  stats,
  testSend,
  type NotificationSettingsView,
  type NotificationStats,
  type NotifTemplateConfig,
  type SetNotificationSettingsPatch,
  type SetTemplatePatch,
  type TestSendResult,
} from "./notifications";

export type NotifActionResult<T> = { ok: true; data: T } | { ok: false; reason: string };

const PATH = (systemId: string) => `/app/sys/${systemId}/member/settings/notifications`;

async function gate(systemId: string): Promise<{ tenantId: string; userId: string; actor: MemberActor }> {
  const auth = await requireTenant();
  const tenantId = auth.active.tenantId;
  const actor = toMemberActor(auth.user.id, auth.active);
  const mc = { role: auth.active.role, unitAccess: actor.unitAccess, permissions: actor.permissions };

  // ชั้นที่ 1 — เข้าโมดูลสมาชิกได้ไหม (read-โดยนัย แบบเดียวกับ fields-actions.ts)
  if (!canReadMember(actor)) {
    assertCan(mc, { module: "member", action: "member.customer.read" }); // โยน ForbiddenError รูปแบบเดียวกับโมดูลอื่น
  }
  // ชั้นที่ 2 — ตั้งค่าการแจ้งเตือนต้องมี member.settings.manage เจาะจง (§6.1 — MANAGER ไม่ได้โดยปริยาย)
  if (!canManageSettings(actor)) {
    throw new ForbiddenError({ module: "member", action: "member.settings.manage" });
  }

  const system = await prisma.appSystem.findFirst({ where: { id: systemId, tenantId, type: "MEMBER" }, select: { id: true } });
  if (!system) throw new Error("ไม่พบระบบสมาชิกนี้ในร้านนี้ — รีเฟรชหน้าแล้วลองใหม่");

  return { tenantId, userId: auth.user.id, actor };
}

export async function getNotificationSettingsAction(systemId: string): Promise<NotifActionResult<NotificationSettingsView>> {
  try {
    const { tenantId } = await gate(systemId);
    const data = await getNotificationSettings({ tenantId, systemId, actorUserId: null });
    return { ok: true, data };
  } catch (e) {
    return { ok: false, reason: safeReason(e, "อ่านค่าตั้งการแจ้งเตือนไม่สำเร็จ — ลองใหม่อีกครั้ง") };
  }
}

export async function saveTemplateAction(input: { systemId: string; key: string; patch: SetTemplatePatch }): Promise<NotifActionResult<NotifTemplateConfig>> {
  try {
    const { tenantId, userId, actor } = await gate(input.systemId);
    const data = await setTemplate({ tenantId, systemId: input.systemId, actorUserId: userId }, actor, input.key, input.patch);
    revalidatePath(PATH(input.systemId));
    return { ok: true, data };
  } catch (e) {
    return { ok: false, reason: safeReason(e, "บันทึกเทมเพลตไม่สำเร็จ — ลองใหม่อีกครั้ง") };
  }
}

export async function saveNotificationSettingsAction(
  input: { systemId: string; patch: SetNotificationSettingsPatch },
): Promise<NotifActionResult<NotificationSettingsView>> {
  try {
    const { tenantId, userId, actor } = await gate(input.systemId);
    const data = await setNotificationSettings({ tenantId, systemId: input.systemId, actorUserId: userId }, actor, input.patch);
    revalidatePath(PATH(input.systemId));
    return { ok: true, data };
  } catch (e) {
    return { ok: false, reason: safeReason(e, "บันทึกตั้งค่าไม่สำเร็จ — ลองใหม่อีกครั้ง") };
  }
}

export async function testSendNotificationAction(input: { systemId: string; key: string; channel: string }): Promise<NotifActionResult<TestSendResult>> {
  try {
    const { tenantId, userId, actor } = await gate(input.systemId);
    const { notificationSenders } = await import("@/lib/member-journey-senders");
    const data = await testSend({ tenantId, systemId: input.systemId, actorUserId: userId }, actor, input.key, input.channel, { deps: notificationSenders });
    return { ok: true, data };
  } catch (e) {
    return { ok: false, reason: safeReason(e, "ทดสอบส่งไม่สำเร็จ — ลองใหม่อีกครั้ง") };
  }
}

export async function notificationStatsAction(input: { systemId: string; month?: string }): Promise<NotifActionResult<NotificationStats>> {
  try {
    const { tenantId, userId, actor } = await gate(input.systemId);
    const month = input.month ? new Date(input.month) : undefined;
    const data = await stats({ tenantId, systemId: input.systemId, actorUserId: userId }, actor, { month });
    return { ok: true, data };
  } catch (e) {
    return { ok: false, reason: safeReason(e, "อ่านสถิติไม่สำเร็จ — ลองใหม่อีกครั้ง") };
  }
}
