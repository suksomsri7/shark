import { notFound } from "next/navigation";
import { requireTenant } from "@/lib/core/context";
import { prisma } from "@/lib/core/db";
import { systemDef } from "@/lib/systems";
import { PointManageSection, pointTabs } from "@/lib/modules/point/ui";
import { PageHeader } from "@/components/ui/PageHeader";
import { ModuleTabs } from "@/components/module-tabs";

// หน้าย่อย "จัดการแต้ม" ของระบบแต้ม — ตั้งอัตราสะสม + ปรับ/แจกแต้มให้สมาชิก
export default async function PointManagePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireTenant();
  const sys = await prisma.appSystem.findFirst({ where: { id, tenantId: auth.active.tenantId, type: "POINT" } });
  if (!sys) notFound();
  const def = systemDef(sys.type);

  return (
    <div className="flex max-w-2xl flex-col gap-5">
      <PageHeader title={`${def?.icon ?? ""} ${sys.name}`.trim()} desc="จัดการแต้ม — ตั้งอัตรา + ปรับ/แจกแต้ม" />
      <ModuleTabs items={pointTabs(id)} />
      <PointManageSection systemId={id} />
    </div>
  );
}
