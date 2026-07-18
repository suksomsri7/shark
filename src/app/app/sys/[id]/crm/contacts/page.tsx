import { notFound } from "next/navigation";
import { requireTenant } from "@/lib/core/context";
import { prisma } from "@/lib/core/db";
import { systemDef } from "@/lib/systems";
import { CrmContactsSection, crmTabs } from "@/lib/modules/crm/ui";
import { PageHeader } from "@/components/ui/PageHeader";
import { ModuleTabs } from "@/components/module-tabs";

// หน้าย่อย "ผู้ติดต่อ" ของระบบ CRM — รายชื่อผู้ติดต่อ/lead + เพิ่มผู้ติดต่อ
export default async function CrmContactsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireTenant();
  const sys = await prisma.appSystem.findFirst({ where: { id, tenantId: auth.active.tenantId, type: "CRM" } });
  if (!sys) notFound();
  const def = systemDef(sys.type);

  return (
    <div className="flex max-w-2xl flex-col gap-5">
      <PageHeader title={`${def?.icon ?? ""} ${sys.name}`.trim()} desc="ผู้ติดต่อ — รายชื่อ + เพิ่มผู้ติดต่อ" />
      <ModuleTabs items={crmTabs(id)} />
      <CrmContactsSection systemId={id} />
    </div>
  );
}
