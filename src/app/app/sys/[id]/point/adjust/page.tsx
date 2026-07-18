import { notFound } from "next/navigation";
import { requireTenant } from "@/lib/core/context";
import { prisma } from "@/lib/core/db";
import { systemDef } from "@/lib/systems";
import { PointAdjustSection, pointTabs } from "@/lib/modules/point/ui";
import { PageHeader } from "@/components/ui/PageHeader";
import { ModuleTabs } from "@/components/module-tabs";

// หน้าย่อย "ปรับแต้ม" ของระบบแต้ม — ปรับ/แจกแต้มให้สมาชิกด้วยมือ
export default async function PointAdjustPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireTenant();
  const sys = await prisma.appSystem.findFirst({ where: { id, tenantId: auth.active.tenantId, type: "POINT" } });
  if (!sys) notFound();
  const def = systemDef(sys.type);

  return (
    <div className="flex max-w-2xl flex-col gap-5">
      <PageHeader title={`${def?.icon ?? ""} ${sys.name}`.trim()} desc="ปรับแต้ม — ปรับ/แจกแต้มให้สมาชิก" />
      <ModuleTabs items={pointTabs(id)} />
      <PointAdjustSection systemId={id} />
    </div>
  );
}
