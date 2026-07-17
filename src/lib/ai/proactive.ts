// AI เชิงรุก ระดับ 1 (proactive L1) — "พนักงาน AI" เห็นปัญหาแล้วทักก่อน ไม่รอสั่ง
// - gatherProactiveInsights: รวบสัญญาณจริงของร้าน deterministic ล้วน (ไม่แตะ LLM)
//     กติกา ≥4: lowStock · pendingApprovalsAged · pendingLeavesAged · shopOrdersPending
//     ระบบไหนยังไม่เปิด/ตารางว่าง → ข้ามเงียบ (แต่ละก้อนห่อ try/catch เอง) ไม่มีปัญหา → []
// - sweepProactiveNudges: cron รายวัน วนทุก tenant ACTIVE (cap 50) มี insight ≥1 → AppNotification
//     กันสแปม: มี noti title เดียวกันของวันนั้น (เวลาไทย) แล้ว → ข้าม · ร้านพัง catch ไปต่อ
//
// ที่ตั้ง src/lib/ai (เหมือน analyst.ts/tools.ts) → เรียก prisma ตรงได้ (นอก modules)
// model แกน system (InvItem/HrLeave) enumerate AppSystem ตาม type ก่อน (pattern analyst.ts)

import { prisma } from "@/lib/core/db";
import type { SystemType } from "@prisma/client";
import { needsReorder } from "@/lib/modules/inventory/rules";

export type ProactiveCtx = { tenantId: string };
export type ProactiveInsight = { key: string; message: string; actionHint?: string };

const DAY_MS = 86_400_000;
export const PROACTIVE_TITLE = "ผู้ช่วยมีเรื่องอยากบอก";

// รายการ id ของ AppSystem ที่เป็น type ที่ต้องการ (tenant-scoped) — ว่าง = ยังไม่เปิดระบบนั้น
async function systemIds(tenantId: string, type: SystemType): Promise<string[]> {
  const rows = await prisma.appSystem.findMany({ where: { tenantId, type }, select: { id: true } });
  return rows.map((r) => r.id);
}

/**
 * รวบสัญญาณเชิงรุกของร้าน — deterministic ล้วน (ไม่แตะ LLM)
 * แต่ละก้อนห่อ try/catch → ระบบไม่เปิด/ตารางว่าง = ข้ามเงียบ ไม่ throw · ไม่มีปัญหา → []
 */
export async function gatherProactiveInsights(ctx: ProactiveCtx): Promise<ProactiveInsight[]> {
  const { tenantId } = ctx;
  const now = new Date();
  const agedBefore = new Date(now.getTime() - 2 * DAY_MS); // เก่ากว่า 2 วัน
  const out: ProactiveInsight[] = [];

  // 1) สต็อกต่ำกว่าจุดสั่งซื้อ (resolve ระบบ INVENTORY ก่อน)
  try {
    const invIds = await systemIds(tenantId, "INVENTORY");
    if (invIds.length > 0) {
      const items = await prisma.invItem.findMany({
        where: { systemId: { in: invIds }, archivedAt: null },
        select: { name: true, onHand: true, reorderPoint: true },
      });
      const low = items.filter((i) => needsReorder(i.onHand, i.reorderPoint));
      if (low.length > 0) {
        const eg = low[0];
        out.push({
          key: "lowStock",
          message: `สต็อกต่ำกว่าจุดสั่งซื้อ ${low.length} รายการ (เช่น ${eg.name} เหลือ ${eg.onHand} — ต่ำกว่าจุดสั่ง ${eg.reorderPoint}) — ให้ผมช่วยตั้งใบสั่งซื้อเลยไหม?`,
          actionHint: "inventory.reorder",
        });
      }
    }
  } catch {
    // ระบบคลังยังไม่เปิด/ตารางว่าง → ข้ามเงียบ
  }

  // 2) คำขออนุมัติค้างเกิน 2 วัน (tenant-scoped ตรง)
  try {
    const n = await prisma.approvalRequest.count({
      where: { tenantId, status: "PENDING", createdAt: { lt: agedBefore } },
    });
    if (n > 0) {
      out.push({
        key: "pendingApprovalsAged",
        message: `มีคำขออนุมัติค้างนานเกิน 2 วัน ${n} รายการ — ให้ผมช่วยสรุปเพื่อเร่งอนุมัติไหม?`,
        actionHint: "approval.review",
      });
    }
  } catch {
    // ยังไม่มีระบบอนุมัติ → ข้ามเงียบ
  }

  // 3) ใบลารออนุมัติค้างเกิน 2 วัน (resolve ระบบ HR ก่อน)
  try {
    const hrIds = await systemIds(tenantId, "HR");
    if (hrIds.length > 0) {
      const n = await prisma.hrLeave.count({
        where: { systemId: { in: hrIds }, status: "PENDING", createdAt: { lt: agedBefore } },
      });
      if (n > 0) {
        out.push({
          key: "pendingLeavesAged",
          message: `มีใบลารออนุมัติค้างเกิน 2 วัน ${n} ใบ — ให้ผมช่วยจัดการให้พนักงานไหม?`,
          actionHint: "hr.leave.review",
        });
      }
    }
  } catch {
    // ระบบ HR ยังไม่เปิด → ข้ามเงียบ
  }

  // 4) ออเดอร์ร้านค้าออนไลน์ที่รอชำระเงิน (tenant-scoped ตรง)
  try {
    const n = await prisma.shopOrder.count({
      where: { tenantId, status: "PENDING_PAYMENT" },
    });
    if (n > 0) {
      out.push({
        key: "shopOrdersPending",
        message: `มีออเดอร์รอชำระเงิน ${n} รายการ — ให้ผมช่วยติดตามลูกค้าให้ไหม?`,
        actionHint: "ecommerce.orders.followup",
      });
    }
  } catch {
    // ยังไม่เปิดร้านค้าออนไลน์ → ข้ามเงียบ
  }

  return out;
}

/**
 * กวาดทัก proactive รายวัน — วนทุก tenant ACTIVE (cap 50 · ใหม่ก่อน)
 * มี insight ≥1 → สร้าง AppNotification (รวมทุก insight ในฉบับเดียว)
 * กันสแปม: เคยมี noti title นี้ของร้านในวันเดียวกัน (เวลาไทย) แล้ว → ข้าม
 * ร้านไหนพัง catch แล้วไปต่อ (cron ต้องไม่ล้มทั้งรอบ) · คืนจำนวนร้านที่เพิ่งทักรอบนี้
 */
export async function sweepProactiveNudges(now: Date = new Date()): Promise<number> {
  // ขอบเขตวันตามเวลาไทย (กันปัญหาขอบวัน UTC) สำหรับกันสแปม
  const dayKey = now.toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" }); // YYYY-MM-DD
  const dayStart = new Date(`${dayKey}T00:00:00+07:00`);
  const dayEnd = new Date(dayStart.getTime() + DAY_MS);

  const tenants = await prisma.tenant.findMany({
    where: { status: "ACTIVE" },
    select: { id: true },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  let notified = 0;
  for (const t of tenants) {
    try {
      // กันสแปม — เคยทักวันนี้แล้ว → ข้าม
      const already = await prisma.appNotification.count({
        where: { tenantId: t.id, title: PROACTIVE_TITLE, createdAt: { gte: dayStart, lt: dayEnd } },
      });
      if (already > 0) continue;

      const insights = await gatherProactiveInsights({ tenantId: t.id });
      if (insights.length === 0) continue;

      const body = insights.map((i) => `• ${i.message}`).join("\n");
      await prisma.appNotification.create({ data: { tenantId: t.id, title: PROACTIVE_TITLE, body } });
      notified += 1;
    } catch {
      // ร้านนี้พัง → ข้ามไปทำร้านถัดไป
    }
  }
  return notified;
}
