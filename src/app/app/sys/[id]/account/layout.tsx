import Link from "next/link";
import { loadAccountSystem } from "@/lib/modules/account/guard";
import { getSettings } from "@/lib/modules/account/service";
import { ACCOUNT_NAV } from "@/lib/modules/account/nav";
import { SubNav } from "@/components/ui/SubNav";

// เมนูรองโมดูลบัญชี: desktop = sidebar ~200px ซ้าย · mobile = เนื้อหาเต็ม (ใช้ back-link ในแต่ละหน้า)
export default async function AccountLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { tenantId, systemId } = await loadAccountSystem(id);
  const settings = await getSettings(tenantId, systemId);
  const base = `/app/sys/${id}/account`;

  return (
    <div className="flex flex-col gap-4 md:flex-row md:items-start md:gap-6">
      <aside className="hidden md:block md:w-[200px] md:shrink-0">
        <Link href={base} className="mb-3 block text-sm text-[color:var(--color-muted)]">
          ← ระบบบัญชี
        </Link>
        <SubNav groups={ACCOUNT_NAV(base, settings.vatRegistered)} />
      </aside>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
