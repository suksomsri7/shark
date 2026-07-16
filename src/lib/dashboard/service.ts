// Dashboard หน้าแรกกิจการ (WO-0030) — สรุปตัวเลข "วันนี้" ของร้านหนึ่งใบเดียว
// วิสัยทัศน์ Blank_6: "หน้าแรกแสดง Dashboard ของกิจการนั้น"
//
// กติกา:
// - query แบบรวบยอด (aggregate/count) เท่านั้น — ห้าม N+1 (ไม่วนดึงทีละแถว)
// - ระบบไหนยังไม่ได้เปิด (ไม่มี AppSystem ประเภทนั้น) → ตัวเลขหมวดนั้น 0 (ไม่ query, ไม่ throw)
// - "วันนี้" = วันตามเวลาไทย (Asia/Bangkok) — แปลงเป็นช่วง UTC ก่อนเทียบ createdAt
// - dashboard ไม่ใช่ module (ไม่มี rules FREEZE) — เรียก tenantDb ตรงได้ เหมือน dna/ ai/
//   (guard ยัง inject tenantId/systemId ให้ทุก query = defense-in-depth ชั้น 2)

import { tenantDb } from "@/lib/core/db";
import type { SystemType } from "@prisma/client";
import { dayKeyBangkok } from "@/lib/ai/rules";
import { needsReorder } from "@/lib/modules/inventory/rules";

export type DashboardCtx = { tenantId: string };

export type DashboardSummary = {
  salesTodaySatang: number; // PosSale PAID วันนี้ (วัน BKK) — ยอดรวมสตางค์
  salesTodayCount: number; // จำนวนบิล PAID วันนี้
  newCustomers7d: number; // สมาชิกใหม่ใน 7 วัน
  lowStockCount: number; // InvItem ที่ต่ำกว่าจุดสั่งซื้อ (ไม่นับ archived)
  pendingLeaves: number; // HrLeave PENDING
  unreadNotifications: number; // AppNotification ที่ยังไม่อ่าน (readAt null)
};

// หา system instance ของประเภทที่ต้องการ (tenant-scoped) — null = ร้านนี้ยังไม่ได้เปิดระบบนั้น
async function findSystem(tenantId: string, type: SystemType): Promise<{ id: string } | null> {
  return tenantDb({ tenantId }).appSystem.findFirst({
    where: { type },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
}

// ช่วงเวลา [start, end) ของ "วันนี้" ตามเวลาไทย (Asia/Bangkok = UTC+7 คงที่)
// ใช้ dayKeyBangkok เพื่อได้วันที่ไทยของ now แล้วยึด offset +07:00 สร้างขอบเขต UTC จริง
function bangkokTodayRange(now: Date): { start: Date; end: Date } {
  const dayKey = dayKeyBangkok(now); // "YYYY-MM-DD" ตามเวลาไทย
  const start = new Date(`${dayKey}T00:00:00+07:00`); // เที่ยงคืนไทย → instant UTC
  const end = new Date(start.getTime() + 24 * 3600 * 1000);
  return { start, end };
}

export async function dashboardSummary(ctx: DashboardCtx): Promise<DashboardSummary> {
  const { tenantId } = ctx;
  const now = new Date();
  const { start: todayStart, end: todayEnd } = bangkokTodayRange(now);
  const since7d = new Date(now.getTime() - 7 * 86_400_000);

  // หา system instance ของทุกหมวดพร้อมกัน — ไม่มี = หมวดนั้นข้าม (ค่า 0)
  const [pos, member, inv, hr] = await Promise.all([
    findSystem(tenantId, "POS"),
    findSystem(tenantId, "MEMBER"),
    findSystem(tenantId, "INVENTORY"),
    findSystem(tenantId, "HR"),
  ]);

  // ยอดขายวันนี้ — aggregate รวบยอด (ไม่วนดึงทีละบิล)
  const salesP = pos
    ? tenantDb({ tenantId, systemId: pos.id }).posSale.aggregate({
        where: { status: "PAID", createdAt: { gte: todayStart, lt: todayEnd } },
        _sum: { grandTotalSatang: true },
        _count: true,
      })
    : null;

  // สมาชิกใหม่ 7 วัน — count
  const newCustP = member
    ? tenantDb({ tenantId, systemId: member.id }).customer.count({
        where: { createdAt: { gte: since7d } },
      })
    : null;

  // สต็อกใกล้หมด — ดึงเฉพาะ item ที่ยังไม่ archived (query เดียว) แล้วนับตามกติกา needsReorder
  //   Prisma เทียบสองฟิลด์ (onHand ≤ reorderPoint) ใน where ไม่ได้ → กรองในหน่วยความจำ
  //   ยังเป็น query เดียว (ไม่ใช่ N+1) และใช้จุดตัดเดียวกับโมดูลคลัง
  const lowStockP = inv
    ? tenantDb({ tenantId, systemId: inv.id }).invItem.findMany({
        where: { archivedAt: null },
        select: { onHand: true, reorderPoint: true },
      })
    : null;

  // ใบลารออนุมัติ — count
  const leavesP = hr
    ? tenantDb({ tenantId, systemId: hr.id }).hrLeave.count({ where: { status: "PENDING" } })
    : null;

  // แจ้งเตือนยังไม่อ่าน — tenant-scoped (โชว์เสมอ ไม่ผูกระบบ)
  const notifP = tenantDb({ tenantId }).appNotification.count({ where: { readAt: null } });

  const [sales, newCustomers7d, lowStockItems, pendingLeaves, unreadNotifications] =
    await Promise.all([salesP, newCustP, lowStockP, leavesP, notifP]);

  return {
    salesTodaySatang: sales?._sum.grandTotalSatang ?? 0,
    salesTodayCount: sales?._count ?? 0,
    newCustomers7d: newCustomers7d ?? 0,
    lowStockCount: (lowStockItems ?? []).filter((i) => needsReorder(i.onHand, i.reorderPoint)).length,
    pendingLeaves: pendingLeaves ?? 0,
    unreadNotifications,
  };
}
