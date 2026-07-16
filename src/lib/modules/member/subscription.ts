import { tenantDb } from "@/lib/core/db";

// Subscription (WO-0027) — สมาชิกรายเดือน/รายปี ในระบบ MEMBER (fitness/สปา/คอร์ส)
// scope: ใช้ tenantDb({ tenantId, systemId }) — inject tenantId+systemId ทุก query (defense-in-depth)
//   MemberPlan/MemberSubscription เป็น system-scoped ใน scope.ts
// cron-ready: expireDue รับ now เป็น argument — ไม่ผูก request context เรียกจาก cron ได้
//
// สถานะ: ACTIVE (กำลังใช้งาน) · EXPIRED (หมดอายุตามรอบ) · CANCELLED (ยกเลิกก่อนกำหนด)

export type Ctx = { tenantId: string; systemId: string };

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// ── สร้างแพ็กเกจ (แผน) ──
export type CreatePlanInput = { name: string; priceSatang: number; periodDays: number };

export async function createPlan(ctx: Ctx, input: CreatePlanInput): Promise<{ id: string }> {
  const periodDays = Math.round(input.periodDays);
  if (!Number.isFinite(periodDays) || periodDays < 1) {
    throw new Error("รอบของแพ็กเกจต้องอย่างน้อย 1 วัน");
  }
  const name = input.name.trim();
  if (!name) throw new Error("กรุณาระบุชื่อแพ็กเกจ");
  const priceSatang = Math.max(0, Math.round(input.priceSatang));

  const plan = await tenantDb(ctx).memberPlan.create({
    data: {
      tenantId: ctx.tenantId,
      systemId: ctx.systemId,
      name,
      priceSatang,
      periodDays,
    },
  });
  return { id: plan.id };
}

// ── รายการแผน (ค่าเริ่มต้น = เฉพาะที่เปิดขาย) ──
export async function listPlans(ctx: Ctx, activeOnly = true) {
  return tenantDb(ctx).memberPlan.findMany({
    where: activeOnly ? { active: true } : {},
    orderBy: { createdAt: "desc" },
  });
}

// ── เปิด/ปิดการขายแผน (ไม่กระทบ subscription ที่ออกไปแล้ว) ──
export async function setPlanActive(ctx: Ctx, planId: string, active: boolean): Promise<boolean> {
  const r = await tenantDb(ctx).memberPlan.updateMany({
    where: { id: planId },
    data: { active },
  });
  return r.count > 0;
}

// ── สมัครสมาชิกให้ลูกค้า — endAt = startAt + periodDays ──
// ลูกค้าที่มีแพ็กเกจ ACTIVE อยู่แล้ว สมัครซ้อนไม่ได้ (ต้องรอหมดอายุ/ยกเลิกก่อน)
export type SubscribeInput = { customerId: string; planId: string; startAt?: Date };

export async function subscribe(ctx: Ctx, input: SubscribeInput): Promise<{ id: string }> {
  const db = tenantDb(ctx);

  const active = await db.memberSubscription.findFirst({
    where: { customerId: input.customerId, status: "ACTIVE" },
  });
  if (active) throw new Error("ลูกค้ารายนี้มีแพ็กเกจที่ยังใช้งานอยู่ ไม่สามารถสมัครซ้อนได้");

  const plan = await db.memberPlan.findFirst({ where: { id: input.planId } });
  if (!plan) throw new Error("ไม่พบแพ็กเกจที่เลือก");

  const startAt = input.startAt ?? new Date();
  const endAt = new Date(startAt.getTime() + plan.periodDays * MS_PER_DAY);

  const sub = await db.memberSubscription.create({
    data: {
      tenantId: ctx.tenantId,
      systemId: ctx.systemId,
      customerId: input.customerId,
      planId: input.planId,
      status: "ACTIVE",
      startAt,
      endAt,
    },
  });
  return { id: sub.id };
}

// ── ยกเลิกก่อนกำหนด — ACTIVE→CANCELLED + cancelledAt · สถานะอื่น = false (idempotent) ──
export async function cancelSubscription(ctx: Ctx, subId: string): Promise<boolean> {
  const r = await tenantDb(ctx).memberSubscription.updateMany({
    where: { id: subId, status: "ACTIVE" },
    data: { status: "CANCELLED", cancelledAt: new Date() },
  });
  return r.count > 0;
}

// ── มีแพ็กเกจใช้งานอยู่ ณ เวลาที่กำหนดหรือไม่ (ตรวจช่วง start..end จริง ไม่ดูแค่สถานะ) ──
export async function isSubscriptionActive(ctx: Ctx, customerId: string, at: Date = new Date()): Promise<boolean> {
  const sub = await tenantDb(ctx).memberSubscription.findFirst({
    where: {
      customerId,
      status: "ACTIVE",
      startAt: { lte: at },
      endAt: { gte: at },
    },
  });
  return !!sub;
}

// ── หมดอายุตามรอบ — ACTIVE ที่ endAt < now → EXPIRED (คืนจำนวน) · cron-ready idempotent ──
export async function expireDue(ctx: Ctx, now: Date = new Date()): Promise<number> {
  const r = await tenantDb(ctx).memberSubscription.updateMany({
    where: { status: "ACTIVE", endAt: { lt: now } },
    data: { status: "EXPIRED" },
  });
  return r.count;
}

// ── รายการสมัครล่าสุด (สำหรับหน้าจอ) ──
export async function listSubscriptions(ctx: Ctx, take = 50) {
  return tenantDb(ctx).memberSubscription.findMany({
    orderBy: { createdAt: "desc" },
    take,
  });
}
