import { requireTenant } from "@/lib/core/context";
import { prisma } from "@/lib/core/db";
import { systemDef, SYSTEM_DEFS, FIXED_PAGE_SYSTEMS, isFixedPageSystem } from "@/lib/systems";
import { AppShell } from "@/components/app-shell/AppShell";
import { NavProgress } from "@/components/app-shell/NavProgress";
import type { NavItem, SoonItem } from "@/components/app-shell/NavDrawer";

// โครงแอป: topbar ติดตายด้านบน (fixed) + drawer เมนูระบบ + ปุ่มผู้ช่วย AI + ศูนย์ช่วยเหลือ
// nav ยังมาจาก DB เหมือนเดิม (units + appSystems) — เปลี่ยนแค่การนำเสนอเป็น app shell
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const auth = await requireTenant();
  const tenantId = auth.active.tenantId;
  // perf A: badge (help/AI) ย้ายไปโหลดฝั่ง client หลังหน้าโผล่ — ไม่บล็อกการเปลี่ยนหน้า
  // layout เหลือแค่ query ที่จำเป็นต้องมีตอน render เมนู (units + appSystems)
  const [units, appSystems] = await Promise.all([
    prisma.businessUnit.findMany({
      where: { tenantId, status: { not: "ARCHIVED" } },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    }),
    prisma.appSystem.findMany({ where: { tenantId, active: true }, orderBy: { createdAt: "asc" } }),
  ]);

  // ต้นแบบ "แตกฟังก์ชันย่อยในเมนู" — ระบบที่รองรับจะกาง submenu ใต้ชื่อระบบ (จองคิว + POS)
  const bookingChildren = (slug: string) => [
    { href: `/app/u/${slug}/booking`, label: "นัดวันนี้" },
    { href: `/app/u/${slug}/booking/services`, label: "บริการ" },
    { href: `/app/u/${slug}/booking/staff`, label: "พนักงาน" },
    { href: `/app/u/${slug}/booking/hours`, label: "เวลาทำการ" },
  ];
  const posChildren = (id: string) => [
    { href: `/app/sys/${id}`, label: "ภาพรวม" },
    { href: `/app/sys/${id}/pos/sales`, label: "ประวัติบิล" },
  ];

  // ระบบทั้งหมด (business + feature) เป็นรายการเดียว
  const items: NavItem[] = [
    ...units.map((u) => ({
      key: `u-${u.id}`,
      href: `/app/u/${u.slug}`,
      icon: systemDef(u.type)?.icon ?? "•",
      label: u.name,
      ...(u.type === "BOOKING" ? { children: bookingChildren(u.slug) } : {}),
    })),
    ...appSystems.map((s) => ({
      key: `s-${s.id}`,
      href: `/app/sys/${s.id}`,
      icon: systemDef(s.type)?.icon ?? "•",
      label: s.name,
      ...(s.type === "POS" ? { children: posChildren(s.id) } : {}),
    })),
    // ระบบ "หน้า fixed ระดับ tenant" ที่เปิดใช้แล้ว (เช่น คลังความรู้ /app/kb) — เข้าถึงตรงจากเมนู
    ...SYSTEM_DEFS.filter(
      (s) => s.status === "available" && isFixedPageSystem(s.code),
    ).map((s) => ({
      key: `fp-${s.code}`,
      href: FIXED_PAGE_SYSTEMS[s.code],
      icon: s.icon,
      label: s.label,
    })),
  ];
  const soon: SoonItem[] = SYSTEM_DEFS.filter((s) => s.status === "coming_soon").map((s) => ({
    code: s.code,
    icon: s.icon,
    label: s.label,
  }));

  return (
    <div className="min-h-full">
      <NavProgress />
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
