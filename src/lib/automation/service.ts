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

/**
 * บริบทของ "คนที่กำลังเปิดศูนย์แจ้งเตือน" — ต้องส่ง `userId` มาด้วยเสมอ (ปิดหนี้ G11)
 *
 * 🔴 ทำไมถึงต้องมี `userId` (PDPA · 31 ส.ค. 2026)
 *    `AppNotification` เคยเป็น **ประกาศทั้งร้าน** ล้วน ⇒ แจ้งเตือนที่มีเนื้อความอ่อนไหว
 *    (ตัวอย่างข้อความลูกค้าจากกล่องแชท) ถูกอ่านได้โดยทุกคนที่เข้าแอปของร้านได้
 *    ตอนนี้แถวที่ระบุ `recipientUserId` = ของคนนั้นคนเดียว · `null` = ประกาศทั้งร้านเหมือนเดิม
 *
 * ⚠️ `userId` เป็น optional ในรูป type เพื่อไม่ให้ผู้เรียกเก่าพังเงียบ ๆ **แต่ไม่ส่ง = เห็นเฉพาะ
 *    ประกาศทั้งร้าน** (fail-closed: ไม่มีตัวตน ⇒ ไม่ได้อะไรที่จ่าหน้าถึงใครสักคน)
 */
export type NotifyCtx = Ctx & { userId?: string | null };

/**
 * เงื่อนไข "แจ้งเตือนที่คนนี้มีสิทธิ์เห็น" — ประกาศ **ที่เดียว** ให้รายการกับตัวนับใช้ร่วมกัน
 * 🔴 ถ้าเขียนแยกกัน 2 ชุด วันหนึ่งจะได้ป้ายเลขที่ไม่ตรงกับรายการที่กดเข้าไปเห็น
 *    (ผู้ใช้เห็น "3 รายการใหม่" แล้วเปิดเข้าไปเจอ 1 = ป้ายที่โกหก ซึ่งแย่กว่าไม่มีป้าย)
 */
function visibleTo(me: { recipientUserId: string | null }): Prisma.AppNotificationWhereInput {
  return me.recipientUserId
    ? { OR: [{ recipientUserId: null }, { recipientUserId: me.recipientUserId }] }
    : { recipientUserId: null };
}

// รายการแจ้งเตือนของร้านนี้ที่คนนี้เห็นได้ (ใหม่สุดก่อน)
export async function listNotifications(ctx: NotifyCtx): Promise<AppNotification[]> {
  return tenantDb({ tenantId: ctx.tenantId }).appNotification.findMany({
    where: visibleTo({ recipientUserId: ctx.userId ?? null }),
    orderBy: { createdAt: "desc" },
  });
}

// จำนวนที่ยังไม่อ่าน (สำหรับ badge) — ต้องนับด้วยเงื่อนไขเดียวกับรายการเสมอ
export async function countUnread(ctx: NotifyCtx): Promise<number> {
  return tenantDb({ tenantId: ctx.tenantId }).appNotification.count({
    where: { AND: [{ readAt: null }, visibleTo({ recipientUserId: ctx.userId ?? null })] },
  });
}

/**
 * ทำเครื่องหมายว่าอ่านแล้ว (idempotent — อ่านซ้ำทับ readAt ใหม่)
 *
 * 🔴 ใช้ `updateMany` + เงื่อนไข `visibleTo` เดียวกับขาอ่าน: แถวที่คนนี้ไม่มีสิทธิ์เห็น
 *    ต้องกดอ่านไม่ได้ด้วย (ไม่งั้นเดา id แล้วไปลบสถานะ "ใหม่" ของแจ้งเตือนคนอื่นได้)
 *    · `updateMany` ยังทำให้ id ที่ไม่มีอยู่จริงได้ผลเป็น 0 แถว แทนที่จะโยน P2025 กลางฟอร์ม
 */
export async function markNotificationRead(ctx: NotifyCtx, id: string): Promise<number> {
  const res = await tenantDb({ tenantId: ctx.tenantId }).appNotification.updateMany({
    where: { AND: [{ id }, visibleTo({ recipientUserId: ctx.userId ?? null })] },
    data: { readAt: new Date() },
  });
  return res.count;
}
