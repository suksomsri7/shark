import { loadAccountSystem } from "@/lib/modules/account/guard";
import { getSettings, accountFlyoutCounts } from "@/lib/modules/account/service";
import { ACCOUNT_NAV } from "@/lib/modules/account/nav";
import { AccountTabBar } from "@/components/account-v2/AccountTabBar";
import { AccountBreadcrumb } from "@/components/account-v2/AccountBreadcrumb";

// Shell V2 (WO 0.4): แถบเมนูบัญชี 9 หมวด (แทน sidebar เดิม) + breadcrumb เหนือเนื้อหา
// เนื้อหาเต็มความกว้างแล้ว (ไม่มี sidebar แบ่งซ้าย) — เมนูอยู่ใน AccountTabBar ทั้งเดสก์ท็อป/มือถือ
export default async function AccountLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { tenantId, systemId } = await loadAccountSystem(id);
  const base = `/app/sys/${id}/account`;
  const [settings, counts] = await Promise.all([
    getSettings(tenantId, systemId),
    accountFlyoutCounts(tenantId, systemId),
  ]);
  const groups = ACCOUNT_NAV(base, settings.vatRegistered);

  return (
    <div className="flex flex-col gap-4">
      <AccountTabBar groups={groups} base={base} counts={counts} />
      <AccountBreadcrumb groups={groups} base={base} />
      <div className="min-w-0">{children}</div>
    </div>
  );
}
