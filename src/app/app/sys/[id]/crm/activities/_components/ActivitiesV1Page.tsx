// CRM uiVersion gate ▸ หน้า v1 เดิม (ก่อน CRM v2 · ใบ C1.6) ย้ายมาเป็น server component ทุกตัวอักษร ยกเว้นชื่อ export — `page.tsx` เลือกหน้านี้เมื่อ settings.crm.uiVersion ≠ 2 ◂
import { notFound } from "next/navigation";
import { requireTenant } from "@/lib/core/context";
import { prisma } from "@/lib/core/db";
import { systemDef } from "@/lib/systems";
import { CrmActivitiesSection, crmTabs } from "@/lib/modules/crm/ui";
import { PageHeader } from "@/components/ui/PageHeader";
import { ModuleTabs } from "@/components/module-tabs";

// หน้าย่อย "งานติดตาม" ของระบบ CRM — งานติดตาม (follow-up) ที่ค้างอยู่
export async function ActivitiesV1Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireTenant();
  const sys = await prisma.appSystem.findFirst({ where: { id, tenantId: auth.active.tenantId, type: "CRM" } });
  if (!sys) notFound();
  const def = systemDef(sys.type);

  return (
    <div className="flex max-w-2xl flex-col gap-5">
      <PageHeader title={`${def?.icon ?? ""} ${sys.name}`.trim()} desc="งานติดตาม — follow-up ที่ต้องทำ" />
      <ModuleTabs items={crmTabs(id)} />
      <CrmActivitiesSection systemId={id} />
    </div>
  );
}
