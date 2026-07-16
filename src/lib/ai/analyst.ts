// AI นักวิเคราะห์ธุรกิจ (WO-0046) — snapshot ตัวเลขจริง + รายงานสัปดาห์อัตโนมัติ
// - gatherBusinessSnapshot: รวบตัวเลข deterministic (ไม่แตะ LLM) — ระบบไหนยังไม่เปิด = 0 ไม่ throw
// - weeklyAnalysis: แนบ snapshot JSON ให้ LLM เรียบเรียง (ห้ามแต่งตัวเลข) → สร้าง AppNotification
// - sweepWeeklyAnalysis: cron วันจันทร์ (เวลาไทย) วนทุก tenant ACTIVE ที่เปิดระบบ ≥1 (cap 50/รอบ)
//
// ที่ตั้ง src/lib/ai (เหมือน tools.ts) → เรียก prisma/tenantDb ตรงได้ (guard ยัง inject scope ให้ = defense-in-depth)

import { prisma, tenantDb } from "@/lib/core/db";
import type { SystemType } from "@prisma/client";
import { needsReorder } from "@/lib/modules/inventory/rules";
import { dayKeyBangkok } from "./rules";
import { resolveProvider, type AiProvider } from "./provider";

export type AnalystCtx = { tenantId: string };

export type BusinessSnapshot = {
  salesTodaySatang: number; // ยอดขาย PAID วันนี้ (วัน BKK) — สตางค์
  salesTodayCount: number; // จำนวนบิล PAID วันนี้
  sales7dSatang: number; // ยอดขาย PAID 7 วันล่าสุด — สตางค์
  sales7dCount: number; // จำนวนบิล PAID 7 วัน
  salesByDay: { day: string; totalSatang: number; count: number }[]; // 7 ช่องเสมอ (วันไม่มีขาย = 0)
  newCustomers7d: number; // สมาชิกใหม่ 7 วัน
  lowStockCount: number; // สินค้าต่ำกว่าจุดสั่งซื้อ (ไม่นับ archived)
  pendingLeaves: number; // ใบลารออนุมัติ
  activeSystems: string[]; // ประเภทระบบที่ร้านเปิดใช้อยู่
};

// หา system instance ของประเภทที่ต้องการ (tenant-scoped) — null = ยังไม่เปิดระบบนั้น
async function findSystem(tenantId: string, type: SystemType): Promise<{ id: string } | null> {
  return tenantDb({ tenantId }).appSystem.findFirst({
    where: { type },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
}

/** รวบ snapshot ตัวเลขจริงของร้าน — deterministic ล้วน ระบบไหนยังไม่เปิด = 0 (ไม่ query, ไม่ throw) */
export async function gatherBusinessSnapshot(ctx: AnalystCtx): Promise<BusinessSnapshot> {
  const { tenantId } = ctx;
  const now = new Date();

  // 7 วันล่าสุดตามเวลาไทย (เก่า→ใหม่) — ตั้ง bucket ครบ 7 ช่องก่อนเสมอ (วันไม่มีขายก็ยังมีช่อง = 0)
  const dayKeys: string[] = [];
  for (let i = 6; i >= 0; i--) dayKeys.push(dayKeyBangkok(new Date(now.getTime() - i * 86_400_000)));
  const todayKey = dayKeys[dayKeys.length - 1];
  const windowStart = new Date(`${dayKeys[0]}T00:00:00+07:00`); // เที่ยงคืนไทยของวันแรกในหน้าต่าง → instant UTC
  const since7d = new Date(now.getTime() - 7 * 86_400_000);

  // หา system instance ของทุกหมวดพร้อมกัน — ไม่มี = หมวดนั้นข้าม (ค่า 0)
  const [pos, member, inv, hr] = await Promise.all([
    findSystem(tenantId, "POS"),
    findSystem(tenantId, "MEMBER"),
    findSystem(tenantId, "INVENTORY"),
    findSystem(tenantId, "HR"),
  ]);

  // ยอดขาย PAID ในหน้าต่าง 7 วัน — ดึงครั้งเดียวแล้วแยก bucket ตามวันไทย
  const sales = pos
    ? await tenantDb({ tenantId, systemId: pos.id }).posSale.findMany({
        where: { status: "PAID", createdAt: { gte: windowStart } },
        select: { grandTotalSatang: true, createdAt: true },
      })
    : [];

  const bucket = new Map<string, { totalSatang: number; count: number }>();
  for (const k of dayKeys) bucket.set(k, { totalSatang: 0, count: 0 });
  let salesTodaySatang = 0;
  let salesTodayCount = 0;
  let sales7dSatang = 0;
  let sales7dCount = 0;
  for (const s of sales) {
    const key = dayKeyBangkok(s.createdAt);
    const g = bucket.get(key);
    if (!g) continue; // หลุดนอกหน้าต่าง 7 วัน (ขอบเวลา) — ข้าม
    const amt = s.grandTotalSatang ?? 0;
    g.totalSatang += amt;
    g.count += 1;
    sales7dSatang += amt;
    sales7dCount += 1;
    if (key === todayKey) {
      salesTodaySatang += amt;
      salesTodayCount += 1;
    }
  }
  const salesByDay = dayKeys.map((day) => {
    const g = bucket.get(day) ?? { totalSatang: 0, count: 0 };
    return { day, totalSatang: g.totalSatang, count: g.count };
  });

  // เมตริกที่เหลือ — ระบบไหนไม่เปิดคืนค่า 0/ว่างทันที (ไม่ยิง DB)
  const [newCustomers7d, lowStockItems, pendingLeaves, systems] = await Promise.all([
    member
      ? tenantDb({ tenantId, systemId: member.id }).customer.count({ where: { createdAt: { gte: since7d } } })
      : Promise.resolve(0),
    inv
      ? tenantDb({ tenantId, systemId: inv.id }).invItem.findMany({
          where: { archivedAt: null },
          select: { onHand: true, reorderPoint: true },
        })
      : Promise.resolve([] as { onHand: number; reorderPoint: number }[]),
    hr
      ? tenantDb({ tenantId, systemId: hr.id }).hrLeave.count({ where: { status: "PENDING" } })
      : Promise.resolve(0),
    tenantDb({ tenantId }).appSystem.findMany({ select: { type: true }, orderBy: { createdAt: "asc" } }),
  ]);

  return {
    salesTodaySatang,
    salesTodayCount,
    sales7dSatang,
    sales7dCount,
    salesByDay,
    newCustomers7d,
    lowStockCount: lowStockItems.filter((i) => needsReorder(i.onHand, i.reorderPoint)).length,
    pendingLeaves,
    activeSystems: systems.map((s) => s.type as string),
  };
}

// system prompt: นักวิเคราะห์ธุรกิจ — กติกาเหล็กคือตัวเลขทุกตัวต้องมาจาก snapshot ห้ามแต่ง
const SYSTEM_PROMPT = [
  "คุณคือนักวิเคราะห์ธุรกิจของร้านค้า SME ไทย เขียนรายงานสรุปประจำสัปดาห์ให้เจ้าของร้านอ่านเข้าใจง่าย",
  "กติกาเหล็ก: ตัวเลขทุกตัวในรายงานต้องมาจากข้อมูล snapshot ที่แนบให้เท่านั้น ห้ามแต่ง เดา หรือประมาณตัวเลขขึ้นเอง ถ้าไม่มีข้อมูลให้ระบุว่าไม่มีข้อมูล",
  "ยอดเงินใน snapshot เป็นหน่วยสตางค์ (100 สตางค์ = 1 บาท) — แปลงเป็นบาทเมื่อกล่าวถึงในรายงาน",
  "ตอบเป็นภาษาไทย แบ่งเป็น 4 ส่วนชัดเจน: สรุป / แนวโน้ม / จุดเสี่ยง / คำแนะนำ",
].join("\n");

/**
 * สร้างรายงานวิเคราะห์ธุรกิจประจำสัปดาห์ด้วย LLM แล้วบันทึกเป็น AppNotification
 * - provider ฉีดได้ทาง deps (สำหรับ oracle) ?? resolveProvider() จาก env
 * - ไม่มี provider (ยังไม่เปิด AI) → คืน null เงียบ ๆ ไม่ throw
 */
export async function weeklyAnalysis(
  ctx: AnalystCtx,
  deps?: { provider?: AiProvider },
): Promise<string | null> {
  const provider = deps?.provider ?? resolveProvider();
  if (!provider) return null; // ยังไม่เปิดใช้ AI — เงียบ ๆ

  const snapshot = await gatherBusinessSnapshot(ctx);
  const userPrompt = [
    "ข้อมูลธุรกิจ (snapshot) สำหรับเขียนรายงานประจำสัปดาห์ — ใช้ตัวเลขจากนี้เท่านั้น:",
    JSON.stringify(snapshot),
    "",
    "กรุณาเขียนรายงานประจำสัปดาห์เป็นภาษาไทย แบ่ง 4 ส่วน: สรุป / แนวโน้ม / จุดเสี่ยง / คำแนะนำ",
  ].join("\n");

  const reply = await provider.chat([
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: userPrompt },
  ]);
  const text = reply.text;

  // บันทึกเป็นแจ้งเตือนในร้าน — ใส่ tenantId ตรง ๆ
  await prisma.appNotification.create({
    data: { tenantId: ctx.tenantId, title: "รายงานธุรกิจประจำสัปดาห์", body: text },
  });
  return text;
}

/**
 * กวาดรายงานสัปดาห์ — รันเฉพาะ "วันจันทร์" ตามเวลาไทย (ไม่ใช่จันทร์ → 0 ไม่ทำอะไร)
 * วนทุก tenant ACTIVE ที่เปิด AppSystem ≥1 (cap 50/รอบ) → weeklyAnalysis
 * ตัวไหนพัง catch แล้วไปต่อ · คืนจำนวนที่ส่งรายงานสำเร็จ
 */
export async function sweepWeeklyAnalysis(
  now: Date = new Date(),
  deps?: { provider?: AiProvider },
): Promise<number> {
  // ใช้ formatter timezone Asia/Bangkok — กันปัญหาขอบวัน (จันทร์ UTC อาจเป็นอาทิตย์/อังคาร BKK)
  const weekday = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Bangkok", weekday: "short" }).format(now);
  if (weekday !== "Mon") return 0;

  // AppSystem ไม่มี relation บน Tenant → หา tenantId ที่มีระบบก่อน (distinct) แล้วกรอง ACTIVE
  const rows = await prisma.appSystem.findMany({ distinct: ["tenantId"], select: { tenantId: true } });
  const ids = rows.map((r) => r.tenantId);
  if (ids.length === 0) return 0;
  const tenants = await prisma.tenant.findMany({
    where: { id: { in: ids }, status: "ACTIVE" },
    select: { id: true },
    take: 50, // cap 50/รอบ
  });

  let sent = 0;
  for (const t of tenants) {
    try {
      const text = await weeklyAnalysis({ tenantId: t.id }, deps);
      if (text !== null) sent += 1;
    } catch {
      // ร้านนี้พัง → ข้ามไปทำร้านถัดไป (cron ต้องไม่ล้มทั้งรอบ)
    }
  }
  return sent;
}
