import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { requireTenant } from "@/lib/core/context";
import { prisma } from "@/lib/core/db";
import { logoutAction } from "@/lib/actions/auth";

const TYPE_ICON: Record<string, string> = {
  HOTEL: "🏨",
  RESTAURANT: "🍜",
  BOOKING: "✂️",
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

        {/* โซน ข: tenant-level */}
        <nav className="flex flex-col gap-0.5 text-sm">
          <Link href="/app/members" className="rounded-lg px-2 py-2 hover:bg-[color:var(--color-surface-2)]">
            {t("members")}
          </Link>
          <Link href="/app/coupons" className="rounded-lg px-2 py-2 hover:bg-[color:var(--color-surface-2)]">
            {t("coupons")}
          </Link>
          <Link href="/app/chat" className="rounded-lg px-2 py-2 hover:bg-[color:var(--color-surface-2)]">
            {t("chat")}
          </Link>
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
