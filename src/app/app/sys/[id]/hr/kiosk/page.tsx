import { notFound } from "next/navigation";
import { requireTenant } from "@/lib/core/context";
import { prisma } from "@/lib/core/db";
import { systemDef } from "@/lib/systems";
import { HrKioskSection, hrTabs } from "@/lib/modules/hr/ui";
import { PageHeader } from "@/components/ui/PageHeader";
import { ModuleTabs } from "@/components/module-tabs";

// หน้าย่อย "จอลงเวลา" ของระบบ HR — เปิดค้างบนแท็บเล็ตหน้าร้าน พนักงานกดลงเวลาเองด้วย PIN
export default async function HrKioskPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireTenant();
  const sys = await prisma.appSystem.findFirst({ where: { id, tenantId: auth.active.tenantId, type: "HR" } });
  if (!sys) notFound();
  const def = systemDef(sys.type);

  return (
    <div className="flex max-w-2xl flex-col gap-5">
      <PageHeader title={`${def?.icon ?? ""} ${sys.name}`.trim()} desc="จอลงเวลา — พนักงานกดเองด้วย PIN" />
      <ModuleTabs items={hrTabs(id)} />
      <HrKioskSection systemId={id} />
    </div>
  );
}
