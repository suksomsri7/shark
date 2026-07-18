import { notFound } from "next/navigation";
import { requireTenant } from "@/lib/core/context";
import { prisma } from "@/lib/core/db";
import { systemDef } from "@/lib/systems";
import { CrmDealsSection, crmTabs } from "@/lib/modules/crm/ui";
import { PageHeader } from "@/components/ui/PageHeader";
import { ModuleTabs } from "@/components/module-tabs";

// หน้าย่อย "ดีล" ของระบบ CRM — ยอดคาดการณ์ + กระดานไปป์ไลน์ + สร้างดีล
export default async function CrmDealsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireTenant();
  const sys = await prisma.appSystem.findFirst({ where: { id, tenantId: auth.active.tenantId, type: "CRM" } });
  if (!sys) notFound();
  const def = systemDef(sys.type);

  return (
    <div className="flex max-w-2xl flex-col gap-5">
      <PageHeader title={`${def?.icon ?? ""} ${sys.name}`.trim()} desc="ดีล — ไปป์ไลน์ + ยอดคาดการณ์" />
      <ModuleTabs items={crmTabs(id)} />
      <CrmDealsSection systemId={id} />
    </div>
  );
}
