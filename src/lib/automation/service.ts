// Automation v1 (WO-0026) — service: CRUD กติกา + ศูนย์แจ้งเตือน (tenant-scoped)
// ทุก query ผ่าน tenantDb({ tenantId }) → inject tenantId อัตโนมัติ (kernel guard)
// ร้านอื่นมองไม่เห็นกติกา/แจ้งเตือนของร้านนี้ (findMany ข้ามร้าน → [] · update/delete → P2025)

import type { AppNotification, AutomationActionType, AutomationRule, Prisma } from "@prisma/client";
import { tenantDb } from "@/lib/core/db";

export type Ctx = { tenantId: string };

export type CreateRuleInput = {
  name: string;
  event: string;
  minAmountSatang?: number | null;
  actionType: AutomationActionType;
  actionConfig?: unknown; // NOTIFY: {title?} · WEBHOOK: {url}
};

// สร้างกติกา — ใส่ tenantId ตรง ๆ (ให้ type ผ่าน · kernel ก็ inject ซ้ำค่าเดิม)
export async function createRule(ctx: Ctx, input: CreateRuleInput): Promise<AutomationRule> {
  return tenantDb(ctx).automationRule.create({
    data: {
      tenantId: ctx.tenantId,
      name: input.name.trim(),
      event: input.event,
      minAmountSatang: input.minAmountSatang ?? null,
      actionType: input.actionType,
      actionConfig: (input.actionConfig ?? {}) as Prisma.InputJsonValue,
    },
  });
}

// รายการกติกาของร้านนี้ (ใหม่สุดก่อน)
export async function listRules(ctx: Ctx): Promise<AutomationRule[]> {
  return tenantDb(ctx).automationRule.findMany({ orderBy: { createdAt: "desc" } });
}

// เปิด/ปิดกติกา (ปิดแล้ว engine ข้าม)
export async function setRuleEnabled(
  ctx: Ctx,
  id: string,
  enabled: boolean,
): Promise<AutomationRule> {
  return tenantDb(ctx).automationRule.update({ where: { id }, data: { enabled } });
}

// ลบกติกา (ประวัติ AutomationRun เก่ายังอยู่ — เก็บไว้ตรวจสอบ)
export async function deleteRule(ctx: Ctx, id: string): Promise<void> {
  await tenantDb(ctx).automationRule.delete({ where: { id } });
}

// ── ศูนย์แจ้งเตือน (ปลายทางของ action NOTIFY) ──

// รายการแจ้งเตือนของร้านนี้ (ใหม่สุดก่อน) — ยังไม่อ่านลอยขึ้นด้วย readAt asc รอง
export async function listNotifications(ctx: Ctx): Promise<AppNotification[]> {
  return tenantDb(ctx).appNotification.findMany({ orderBy: { createdAt: "desc" } });
}

// จำนวนที่ยังไม่อ่าน (สำหรับ badge)
export async function countUnread(ctx: Ctx): Promise<number> {
  return tenantDb(ctx).appNotification.count({ where: { readAt: null } });
}

// ทำเครื่องหมายว่าอ่านแล้ว (idempotent — อ่านซ้ำทับ readAt ใหม่)
export async function markNotificationRead(ctx: Ctx, id: string): Promise<AppNotification> {
  return tenantDb(ctx).appNotification.update({
    where: { id },
    data: { readAt: new Date() },
  });
}
