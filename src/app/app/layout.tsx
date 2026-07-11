import { getTranslations } from "next-intl/server";
import Link from "next/link";

// Dashboard shell — sidebar 3 โซน + Unit Switcher (placeholder Stage A)
// TODO Stage A: อ่าน session + membership จริง, Unit Switcher client component, RBAC ซ่อนเมนู
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const t = await getTranslations("nav");
  const tApp = await getTranslations("app");
  return (
    <div className="flex min-h-full flex-1">
      <aside className="hidden w-60 shrink-0 flex-col border-r px-3 py-4 md:flex">
        <div className="px-2 pb-4 text-sm font-bold tracking-widest">{tApp("name")}</div>

        {/* โซน ก: รายชื่อกิจการ (Unit Switcher จะมาแทน) */}
        <nav className="flex flex-col gap-1 text-sm">
          <Link href="/app" className="rounded-lg px-2 py-2 hover:bg-[color:var(--color-surface-2)]">
            {t("overview")}
          </Link>
        </nav>

        <div className="my-3 border-t" />

        {/* โซน ข: tenant-level */}
        <nav className="flex flex-col gap-1 text-sm">
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

        <div className="mt-auto border-t pt-3">
          {/* โซน ค */}
          <Link href="/app/settings" className="block rounded-lg px-2 py-2 text-sm hover:bg-[color:var(--color-surface-2)]">
            {t("settings")}
          </Link>
          <Link href="/app/settings/units/new" className="btn btn-ghost mt-2 w-full text-sm">
            + {t("addBusiness")}
          </Link>
        </div>
      </aside>

      <main className="flex-1 px-6 py-6">{children}</main>
    </div>
  );
}
