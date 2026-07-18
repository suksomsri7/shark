import { notFound } from "next/navigation";
import { requireTenant } from "@/lib/core/context";
import { prisma } from "@/lib/core/db";
import { systemDef } from "@/lib/systems";
import { HrAttendanceSection, hrTabs } from "@/lib/modules/hr/ui";
import { PageHeader } from "@/components/ui/PageHeader";
import { ModuleTabs } from "@/components/module-tabs";

// หน้าย่อย "ลงเวลา" ของระบบ HR — ลงเวลาเข้า/ออก + บันทึกลงเวลาล่าสุด
export default async function HrAttendancePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireTenant();
  const sys = await prisma.appSystem.findFirst({ where: { id, tenantId: auth.active.tenantId, type: "HR" } });
  if (!sys) notFound();
  const def = systemDef(sys.type);

  return (
    <div className="flex max-w-2xl flex-col gap-5">
      <PageHeader title={`${def?.icon ?? ""} ${sys.name}`.trim()} desc="ลงเวลา — เข้า/ออกงาน" />
      <ModuleTabs items={hrTabs(id)} />
      <HrAttendanceSection systemId={id} />
    </div>
  );
}
