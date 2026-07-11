import Link from "next/link";
import { requireTenant } from "@/lib/core/context";
import { prisma } from "@/lib/core/db";
import { logoutAction } from "@/lib/actions/auth";
import { systemDef, SYSTEM_DEFS } from "@/lib/systems";
import { MobileNav, type NavItem } from "@/components/mobile-nav";

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
  const soon = SYSTEM_DEFS.filter((s) => s.status === "coming_soon");

  return (
    <div className="flex min-h-full flex-1 flex-col md:flex-row">
      <MobileNav tenantName={auth.active.tenant.name} userEmail={auth.user.email} items={items} />

      <aside className="hidden w-64 shrink-0 flex-col border-r px-3 py-4 md:flex">
        <div className="px-2 pb-1 text-sm font-bold tracking-widest">SHARK</div>
        <div className="truncate px-2 pb-3 text-xs text-[color:var(--color-muted)]">
          {auth.active.tenant.name}
        </div>

        <nav className="flex flex-col gap-0.5 overflow-y-auto text-sm">
          <Link href="/app" className="rounded-lg px-2 py-2 hover:bg-[color:var(--color-surface-2)]">
            ระบบทั้งหมด
          </Link>
          {items.map((it) => (
            <Link
              key={it.key}
              href={it.href}
              className="flex items-center gap-2 rounded-lg px-2 py-2 hover:bg-[color:var(--color-surface-2)]"
            >
              <span>{it.icon}</span>
              <span className="truncate">{it.label}</span>
            </Link>
          ))}
          <div className="my-2 border-t" />
          {soon.map((s) => (
            <div
              key={s.code}
              className="flex items-center justify-between rounded-lg px-2 py-1.5 text-xs opacity-45"
            >
              <span>
                {s.icon} {s.label}
              </span>
              <span className="rounded-full border px-1.5 py-0.5 text-[10px]">เร็วๆ นี้</span>
            </div>
          ))}
        </nav>

        <div className="mt-auto flex flex-col gap-2 border-t pt-3">
          <Link href="/app/settings/systems" className="btn btn-primary w-full text-sm">
            + เพิ่มระบบ
          </Link>
          <div className="flex items-center justify-between px-2">
            <span className="truncate text-xs text-[color:var(--color-muted)]">{auth.user.email}</span>
            <form action={logoutAction}>
              <button type="submit" className="text-xs underline">
                ออก
              </button>
            </form>
          </div>
        </div>
      </aside>

      <main className="flex-1 px-4 py-6 sm:px-6">{children}</main>
    </div>
  );
}
