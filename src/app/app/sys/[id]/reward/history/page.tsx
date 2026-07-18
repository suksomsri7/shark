import { notFound } from "next/navigation";
import { requireTenant } from "@/lib/core/context";
import { prisma } from "@/lib/core/db";
import { systemDef } from "@/lib/systems";
import { RewardHistorySection, rewardTabs } from "@/lib/modules/reward/ui";
import { PageHeader } from "@/components/ui/PageHeader";
import { ModuleTabs } from "@/components/module-tabs";

// หน้าย่อย "ประวัติการแลก" ของระบบรางวัล — รายการแลกล่าสุด + ยืนยันรับของ/ยกเลิก
export default async function RewardHistoryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireTenant();
  const sys = await prisma.appSystem.findFirst({ where: { id, tenantId: auth.active.tenantId, type: "REWARD" } });
  if (!sys) notFound();
  const def = systemDef(sys.type);

  return (
    <div className="flex max-w-2xl flex-col gap-5">
      <PageHeader title={`${def?.icon ?? ""} ${sys.name}`.trim()} desc="ประวัติการแลก — รายการล่าสุด" />
      <ModuleTabs items={rewardTabs(id)} />
      <RewardHistorySection systemId={id} />
    </div>
  );
}
