// Backoffice service (Phase 0 — read-only) — ภาพรวมร้าน + metrics แพลตฟอร์ม
// ทุก query อ่านผ่าน base client (platform scope) — ไม่มี tenant context

import { prisma } from "@/lib/core/db";

export type TenantOverview = {
  id: string;
  name: string;
  createdAt: Date;
  systemsCount: number;
};

// รายชื่อร้านทั้งหมด + จำนวนระบบที่เปิด (เรียงใหม่→เก่า)
// ใช้ groupBy นับระบบครั้งเดียว — ไม่วน query ต่อร้าน (กัน N+1)
export async function listTenantsOverview(): Promise<TenantOverview[]> {
  const [tenants, grouped] = await Promise.all([
    prisma.tenant.findMany({
      select: { id: true, name: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.appSystem.groupBy({ by: ["tenantId"], _count: { _all: true } }),
  ]);
  const countByTenant = new Map(grouped.map((g) => [g.tenantId, g._count._all]));
  return tenants.map((t) => ({
    id: t.id,
    name: t.name,
    createdAt: t.createdAt,
    systemsCount: countByTenant.get(t.id) ?? 0,
  }));
}

export type PlatformMetrics = {
  totalTenants: number;
  totalSystems: number;
  systemsByType: Record<string, number>;
};

// ตัวเลขรวมทั้งแพลตฟอร์ม — จำนวนร้าน / ระบบรวม / แยกตามประเภท
export async function platformMetrics(): Promise<PlatformMetrics> {
  const [totalTenants, totalSystems, byType] = await Promise.all([
    prisma.tenant.count(),
    prisma.appSystem.count(),
    prisma.appSystem.groupBy({ by: ["type"], _count: { _all: true } }),
  ]);
  const systemsByType: Record<string, number> = {};
  for (const r of byType) systemsByType[r.type] = r._count._all;
  return { totalTenants, totalSystems, systemsByType };
}

export type TenantDetail = {
  id: string;
  name: string;
  slug: string;
  status: string;
  plan: string;
  createdAt: Date;
  systems: { id: string; type: string; name: string; active: boolean; createdAt: Date }[];
};

// รายละเอียดร้าน (read-only Phase 0) — ข้อมูลร้าน + รายชื่อระบบที่เปิด
export async function tenantDetail(id: string): Promise<TenantDetail | null> {
  const tenant = await prisma.tenant.findUnique({
    where: { id },
    select: { id: true, name: true, slug: true, status: true, plan: true, createdAt: true },
  });
  if (!tenant) return null;
  const systems = await prisma.appSystem.findMany({
    where: { tenantId: id },
    select: { id: true, type: true, name: true, active: true, createdAt: true },
    orderBy: [{ type: "asc" }, { createdAt: "asc" }],
  });
  return { ...tenant, systems };
}
