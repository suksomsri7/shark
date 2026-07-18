import { notFound } from "next/navigation";
import { requireTenant } from "@/lib/core/context";
import { prisma } from "@/lib/core/db";
import { systemDef } from "@/lib/systems";
import { memberTabs } from "@/lib/modules/member/ui";
import { PlansSection } from "@/lib/modules/member/subscription-ui";
import { PageHeader } from "@/components/ui/PageHeader";
import { ModuleTabs } from "@/components/module-tabs";

// หน้าย่อย "แพ็กเกจสมาชิก" ของระบบสมาชิก — รายการแพ็กเกจ + เปิด/ปิดขาย + สร้างใหม่
export default async function MemberPlansPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireTenant();
  const sys = await prisma.appSystem.findFirst({ where: { id, tenantId: auth.active.tenantId, type: "MEMBER" } });
  if (!sys) notFound();
  const def = systemDef(sys.type);

  return (
    <div className="flex max-w-2xl flex-col gap-5">
      <PageHeader title={`${def?.icon ?? ""} ${sys.name}`.trim()} desc="แพ็กเกจสมาชิก — สร้าง/เปิด-ปิดขาย" />
      <ModuleTabs items={memberTabs(id)} />
      <PlansSection systemId={id} />
    </div>
  );
}
