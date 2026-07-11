import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { requireTenant } from "@/lib/core/context";
import { prisma } from "@/lib/core/db";
import { logoutAction } from "@/lib/actions/auth";
import { TENANT_MODULES } from "@/lib/systems";

const TYPE_ICON: Record<string, string> = {
  HOTEL: "🏨",
  RESTAURANT: "🍜",
  BOOKING: "📅",
  QUEUE: "🎫",
  TICKET: "🎟️",
  SHOP: "🛍️",
};

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const t = await getTranslations("nav");
  const auth = await requireTenant();
  const units = await prisma.businessUnit.findMany({
    where: { tenantId: auth.active.tenantId, status: { not: "ARCHIVED" } },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });

  return (
    <div className="flex min-h-full flex-1">
      <aside className="hidden w-64 shrink-0 flex-col border-r px-3 py-4 md:flex">
        <div className="px-2 pb-1 text-sm font-bold tracking-widest">SHARK</div>
        <div className="truncate px-2 pb-3 text-xs text-[color:var(--color-muted)]">
          {auth.active.tenant.name}
        </div>

        {/* โซน ก: ภาพรวม + รายชื่อกิจการ */}
        <nav className="flex flex-col gap-0.5 text-sm">
          <Link href="/app" className="rounded-lg px-2 py-2 hover:bg-[color:var(--color-surface-2)]">
            {t("overview")}
          </Link>
          {units.map((u) => (
            <Link
              key={u.id}
              href={`/app/u/${u.slug}`}
              className="flex items-center gap-2 rounded-lg px-2 py-2 hover:bg-[color:var(--color-surface-2)]"
            >
              <span>{TYPE_ICON[u.type] ?? "•"}</span>
              <span className="truncate">{u.name}</span>
              {u.status === "PAUSED" && (
                <span className="ml-auto text-xs text-[color:var(--color-muted)]">พัก</span>
              )}
            </Link>
          ))}
        </nav>

        <div className="my-3 border-t" />

        {/* โซน ข: tenant-level — แสดงทุกระบบ, ที่ยังไม่เปิด = disable + ป้าย "เร็วๆ นี้" */}
        <nav className="flex flex-col gap-0.5 text-sm">
          {TENANT_MODULES.map((m) =>
            m.status === "available" ? (
              <Link
                key={m.key}
                href={m.href}
                className="rounded-lg px-2 py-2 hover:bg-[color:var(--color-surface-2)]"
              >
                {m.label}
              </Link>
            ) : (
              <div
                key={m.key}
                aria-disabled
                className="flex cursor-not-allowed items-center justify-between rounded-lg px-2 py-2 opacity-45"
              >
                <span>{m.label}</span>
                <span className="rounded-full border px-1.5 py-0.5 text-[10px]">เร็วๆ นี้</span>
              </div>
            ),
          )}
        </nav>

        {/* โซน ค */}
        <div className="mt-auto flex flex-col gap-2 border-t pt-3">
          <Link href="/app/settings/units/new" className="btn btn-ghost w-full text-sm">
            + {t("addBusiness")}
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

      <main className="flex-1 px-6 py-6">{children}</main>
    </div>
  );
}
