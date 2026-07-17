// Dashboard builder v1 (WO-0056) — เลือก/เรียง widget จัดหน้า dashboard เอง
// ต่อยอดจาก dashboard/service.ts (WO-0030): reuse pattern findSystem + ช่วงเวลา BKK
//
// กติกา:
// - layout เก็บใน TenantDashboard (tenant-scoped, 1 แถว/ร้าน) — widgetsJson = ["salesToday", ...]
// - runWidgets คืน "สตางค์" สำหรับ widget เงิน (UI ค่อย format เป็นบาท)
// - ระบบไหนยังไม่ได้เปิด (ไม่มี AppSystem/หน่วยประเภทนั้น) → ค่า 0 (ไม่ query, ไม่ throw)
// - ทุก query ผ่าน tenantDb → inject tenantId/systemId/unitId อัตโนมัติ (defense-in-depth)

import { tenantDb } from "@/lib/core/db";
import type { SystemType } from "@prisma/client";
import { dayKeyBangkok } from "@/lib/ai/rules";
import { needsReorder } from "@/lib/modules/inventory/rules";

export type DashboardCtx = { tenantId: string };

export type WidgetDef = { label: string; unit?: string };

// คลัง widget ทั้งหมด — label ไทยล้วน · unit "baht" = ค่าเป็นสตางค์ (UI แปลงหาร 100)
export const WIDGETS: Record<string, WidgetDef> = {
  salesToday: { label: "ยอดขายวันนี้", unit: "baht" },
  sales7d: { label: "ยอดขาย 7 วัน", unit: "baht" },
  billsToday: { label: "บิลวันนี้" },
  newCustomers7d: { label: "สมาชิกใหม่ 7 วัน" },
  lowStockCount: { label: "สต็อกใกล้หมด" },
  pendingLeaves: { label: "ใบลารออนุมัติ" },
  pendingApprovals: { label: "คำขอรออนุมัติ" },
  shopOrdersPending: { label: "ออเดอร์ร้านค้ารอชำระ" },
};

export type WidgetResult = { key: string; label: string; value: number };

// layout เริ่มต้นเมื่อร้านยังไม่เคยตั้ง = 4 การ์ดแรกของ WIDGETS
const DEFAULT_LAYOUT = Object.keys(WIDGETS).slice(0, 4);

// ── helper (คัดลอกแนวทางจาก dashboard/service.ts) ──

// หา system instance ของประเภทที่ต้องการ — null = ร้านนี้ยังไม่ได้เปิดระบบนั้น
async function findSystem(tenantId: string, type: SystemType): Promise<{ id: string } | null> {
  return tenantDb({ tenantId }).appSystem.findFirst({
    where: { type },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
}

// ช่วงเวลา [start, end) ของ "วันนี้" ตามเวลาไทย (Asia/Bangkok = UTC+7 คงที่)
function bangkokTodayRange(now: Date): { start: Date; end: Date } {
  const dayKey = dayKeyBangkok(now);
  const start = new Date(`${dayKey}T00:00:00+07:00`);
  const end = new Date(start.getTime() + 24 * 3600 * 1000);
  return { start, end };
}

// ── layout ──

// อ่าน layout ปัจจุบันของร้าน — ยังไม่ตั้ง/ว่าง = default · กรอง key ที่ไม่รู้จักทิ้ง (กัน widget ถูกลบภายหลัง)
export async function getDashboardLayout(ctx: DashboardCtx): Promise<string[]> {
  const row = await tenantDb(ctx).tenantDashboard.findFirst({ where: {} });
  const raw = row?.widgetsJson;
  const stored = Array.isArray(raw)
    ? raw.filter((k): k is string => typeof k === "string" && k in WIDGETS)
    : [];
  return stored.length > 0 ? stored : [...DEFAULT_LAYOUT];
}

// บันทึก layout — validate key + ว่าง → throw ไทย · find→update/create (ห้าม upsert)
export async function saveDashboardLayout(
  ctx: DashboardCtx,
  keys: string[],
): Promise<{ ok: true }> {
  if (!Array.isArray(keys) || keys.length === 0) {
    throw new Error("กรุณาเลือกการ์ดอย่างน้อย 1 รายการ");
  }
  for (const k of keys) {
    if (!(k in WIDGETS)) throw new Error(`ไม่รู้จักการ์ด: ${k}`);
  }
  const db = tenantDb(ctx);
  const existing = await db.tenantDashboard.findFirst({ where: {} });
  if (existing) {
    await db.tenantDashboard.update({ where: { id: existing.id }, data: { widgetsJson: keys } });
  } else {
    await db.tenantDashboard.create({ data: { tenantId: ctx.tenantId, widgetsJson: keys } });
  }
  return { ok: true };
}

// ── ค่าจริงของ widget ──

// คำนวณค่าของ widget ตามลำดับ keys — เงินเป็นสตางค์ · ระบบไม่เปิด = 0 (ไม่ throw)
export async function runWidgets(ctx: DashboardCtx, keys: string[]): Promise<WidgetResult[]> {
  const { tenantId } = ctx;
  const now = new Date();
  const { start: todayStart, end: todayEnd } = bangkokTodayRange(now);
  const since7d = new Date(now.getTime() - 7 * 86_400_000);

  const need = new Set(keys);
  const needPos = need.has("salesToday") || need.has("sales7d") || need.has("billsToday");

  // หา system instance เฉพาะที่ต้องใช้ (ไม่มี = หมวดนั้นได้ค่า 0)
  const [pos, member, inv, hr] = await Promise.all([
    needPos ? findSystem(tenantId, "POS") : Promise.resolve(null),
    need.has("newCustomers7d") ? findSystem(tenantId, "MEMBER") : Promise.resolve(null),
    need.has("lowStockCount") ? findSystem(tenantId, "INVENTORY") : Promise.resolve(null),
    need.has("pendingLeaves") ? findSystem(tenantId, "HR") : Promise.resolve(null),
  ]);

  const compute: Record<string, () => Promise<number>> = {
    // ยอดขายวันนี้ (สตางค์) — PosSale PAID วันนี้ (BKK)
    salesToday: async () => {
      if (!pos) return 0;
      const r = await tenantDb({ tenantId, systemId: pos.id }).posSale.aggregate({
        where: { status: "PAID", createdAt: { gte: todayStart, lt: todayEnd } },
        _sum: { grandTotalSatang: true },
      });
      return r._sum.grandTotalSatang ?? 0;
    },
    // ยอดขาย 7 วัน (สตางค์)
    sales7d: async () => {
      if (!pos) return 0;
      const r = await tenantDb({ tenantId, systemId: pos.id }).posSale.aggregate({
        where: { status: "PAID", createdAt: { gte: since7d } },
        _sum: { grandTotalSatang: true },
      });
      return r._sum.grandTotalSatang ?? 0;
    },
    // จำนวนบิลวันนี้
    billsToday: async () => {
      if (!pos) return 0;
      return tenantDb({ tenantId, systemId: pos.id }).posSale.count({
        where: { status: "PAID", createdAt: { gte: todayStart, lt: todayEnd } },
      });
    },
    // สมาชิกใหม่ 7 วัน
    newCustomers7d: async () => {
      if (!member) return 0;
      return tenantDb({ tenantId, systemId: member.id }).customer.count({
        where: { createdAt: { gte: since7d } },
      });
    },
    // สต็อกใกล้หมด — ดึง item ที่ยังไม่ archived (query เดียว) แล้วนับตาม needsReorder
    lowStockCount: async () => {
      if (!inv) return 0;
      const items = await tenantDb({ tenantId, systemId: inv.id }).invItem.findMany({
        where: { archivedAt: null },
        select: { onHand: true, reorderPoint: true },
      });
      return items.filter((i) => needsReorder(i.onHand, i.reorderPoint)).length;
    },
    // ใบลารออนุมัติ
    pendingLeaves: async () => {
      if (!hr) return 0;
      return tenantDb({ tenantId, systemId: hr.id }).hrLeave.count({ where: { status: "PENDING" } });
    },
    // คำขอรออนุมัติ (ApprovalRequest PENDING) — tenant-scoped ไม่ผูก system
    pendingApprovals: async () =>
      tenantDb({ tenantId }).approvalRequest.count({ where: { status: "PENDING" } }),
    // ออเดอร์ร้านค้ารอชำระ (ShopOrder PENDING_PAYMENT) — unit-scoped → รวมทุกหน่วย SHOP
    shopOrdersPending: async () => {
      const units = await tenantDb({ tenantId }).businessUnit.findMany({
        where: { type: "SHOP" },
        select: { id: true },
      });
      if (units.length === 0) return 0;
      const counts = await Promise.all(
        units.map((u) =>
          tenantDb({ tenantId, unitId: u.id }).shopOrder.count({
            where: { status: "PENDING_PAYMENT" },
          }),
        ),
      );
      return counts.reduce((a, b) => a + b, 0);
    },
  };

  // ตามลำดับ keys — ข้าม key ที่ไม่รู้จัก
  const out: WidgetResult[] = [];
  for (const key of keys) {
    const def = WIDGETS[key];
    if (!def) continue;
    const value = compute[key] ? await compute[key]() : 0;
    out.push({ key, label: def.label, value });
  }
  return out;
}
