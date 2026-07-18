import { notFound } from "next/navigation";
import { requireTenant } from "@/lib/core/context";
import { prisma } from "@/lib/core/db";
import { systemDef } from "@/lib/systems";
import { memberTabs } from "@/lib/modules/member/ui";
import { SubscriptionSection } from "@/lib/modules/member/subscription-ui";
import { PageHeader } from "@/components/ui/PageHeader";
import { ModuleTabs } from "@/components/module-tabs";

// หน้าย่อย "แพ็กเกจสมาชิก" ของระบบสมาชิก — แพ็กเกจ + สมัคร/ต่ออายุ + รายการสมัครล่าสุด
export default async function MemberSubscriptionsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireTenant();
  const sys = await prisma.appSystem.findFirst({ where: { id, tenantId: auth.active.tenantId, type: "MEMBER" } });
  if (!sys) notFound();
  const def = systemDef(sys.type);

  return (
    <div className="flex max-w-2xl flex-col gap-5">
      <PageHeader title={`${def?.icon ?? ""} ${sys.name}`.trim()} desc="แพ็กเกจสมาชิก — สมัคร/ต่ออายุ" />
      <ModuleTabs items={memberTabs(id)} />
      <SubscriptionSection systemId={id} />
    </div>
  );
}
