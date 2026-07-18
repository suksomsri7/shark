import { notFound } from "next/navigation";
import { requireTenant } from "@/lib/core/context";
import { prisma } from "@/lib/core/db";
import { systemDef } from "@/lib/systems";
import { PointSettingsSection, pointTabs } from "@/lib/modules/point/ui";
import { PageHeader } from "@/components/ui/PageHeader";
import { ModuleTabs } from "@/components/module-tabs";

// หน้าย่อย "ตั้งค่าแต้ม" ของระบบแต้ม — ตั้งอัตราสะสม + เปิด/ปิดการสะสม
export default async function PointSettingsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireTenant();
  const sys = await prisma.appSystem.findFirst({ where: { id, tenantId: auth.active.tenantId, type: "POINT" } });
  if (!sys) notFound();
  const def = systemDef(sys.type);

  return (
    <div className="flex max-w-2xl flex-col gap-5">
      <PageHeader title={`${def?.icon ?? ""} ${sys.name}`.trim()} desc="ตั้งค่าแต้ม — อัตราสะสม + เปิด/ปิด" />
      <ModuleTabs items={pointTabs(id)} />
      <PointSettingsSection systemId={id} />
    </div>
  );
}
