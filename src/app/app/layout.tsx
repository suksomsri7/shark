import { requireTenant } from "@/lib/core/context";
import { prisma } from "@/lib/core/db";
import { systemDef, SYSTEM_DEFS } from "@/lib/systems";
import { AppShell } from "@/components/app-shell/AppShell";
import type { NavItem, SoonItem } from "@/components/app-shell/NavDrawer";

// โครงแอป: topbar ติดตายด้านบน (fixed) + drawer เมนูระบบ + ปุ่มผู้ช่วย AI + ศูนย์ช่วยเหลือ
// nav ยังมาจาก DB เหมือนเดิม (units + appSystems) — เปลี่ยนแค่การนำเสนอเป็น app shell
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const auth = await requireTenant();
  const tenantId = auth.active.tenantId;
  const [units, appSystems] = await Promise.all([
    prisma.businessUnit.findMany({
      where: { tenantId, status: { not: "ARCHIVED" } },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    }),
    prisma.appSystem.findMany({ where: { tenantId, active: true }, orderBy: { createdAt: "asc" } }),
  ]);

  // ระบบทั้งหมด (business + feature) เป็นรายการเดียว
  const items: NavItem[] = [
    ...units.map((u) => ({
      key: `u-${u.id}`,
      href: `/app/u/${u.slug}`,
      icon: systemDef(u.type)?.icon ?? "•",
      label: u.name,
    })),
    ...appSystems.map((s) => ({
      key: `s-${s.id}`,
      href: `/app/sys/${s.id}`,
      icon: systemDef(s.type)?.icon ?? "•",
      label: s.name,
    })),
  ];
  const soon: SoonItem[] = SYSTEM_DEFS.filter((s) => s.status === "coming_soon").map((s) => ({
    code: s.code,
    icon: s.icon,
    label: s.label,
  }));

  return (
    <div className="min-h-full">
      <AppShell
        tenantName={auth.active.tenant.name}
        userEmail={auth.user.email}
        items={items}
        soon={soon}
        addHref="/app/settings/systems"
      />
      {/* pt-14 = เว้นให้พ้น topbar (สูง 56px) · pb-24 = เว้นให้พ้นปุ่ม AI มุมซ้ายล่าง */}
      <main className="px-4 pb-24 pt-[calc(3.5rem+1rem)] sm:px-6">{children}</main>
    </div>
  );
}
