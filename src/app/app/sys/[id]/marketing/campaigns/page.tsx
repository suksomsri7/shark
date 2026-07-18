import { notFound } from "next/navigation";
import { requireTenant } from "@/lib/core/context";
import { prisma } from "@/lib/core/db";
import { systemDef } from "@/lib/systems";
import { MarketingCampaignsSection, marketingTabs } from "@/lib/modules/marketing/ui";
import { PageHeader } from "@/components/ui/PageHeader";
import { ModuleTabs } from "@/components/module-tabs";

// หน้าย่อย "แคมเปญ" ของระบบการตลาด — รายการแคมเปญ + สร้างแคมเปญ + ส่ง
export default async function MarketingCampaignsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireTenant();
  const sys = await prisma.appSystem.findFirst({ where: { id, tenantId: auth.active.tenantId, type: "MARKETING" } });
  if (!sys) notFound();
  const def = systemDef(sys.type);

  return (
    <div className="flex max-w-2xl flex-col gap-5">
      <PageHeader title={`${def?.icon ?? ""} ${sys.name}`.trim()} desc="แคมเปญ — รายการ + สร้าง + ส่ง" />
      <ModuleTabs items={marketingTabs(id)} />
      <MarketingCampaignsSection systemId={id} />
    </div>
  );
}
