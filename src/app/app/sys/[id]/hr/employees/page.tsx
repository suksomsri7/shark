import { notFound } from "next/navigation";
import { requireTenant } from "@/lib/core/context";
import { prisma } from "@/lib/core/db";
import { systemDef } from "@/lib/systems";
import { HrEmployeesSection, hrTabs } from "@/lib/modules/hr/ui";
import { PageHeader } from "@/components/ui/PageHeader";
import { ModuleTabs } from "@/components/module-tabs";

// หน้าย่อย "พนักงาน" ของระบบ HR — รายชื่อพนักงาน + เพิ่มพนักงาน
export default async function HrEmployeesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireTenant();
  const sys = await prisma.appSystem.findFirst({ where: { id, tenantId: auth.active.tenantId, type: "HR" } });
  if (!sys) notFound();
  const def = systemDef(sys.type);

  return (
    <div className="flex max-w-2xl flex-col gap-5">
      <PageHeader title={`${def?.icon ?? ""} ${sys.name}`.trim()} desc="พนักงาน — รายชื่อ + เพิ่มพนักงาน" />
      <ModuleTabs items={hrTabs(id)} />
      <HrEmployeesSection systemId={id} />
    </div>
  );
}
