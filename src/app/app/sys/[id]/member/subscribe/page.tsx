import { notFound } from "next/navigation";
import { requireTenant } from "@/lib/core/context";
import { prisma } from "@/lib/core/db";
import { systemDef } from "@/lib/systems";
import { memberTabs } from "@/lib/modules/member/ui";
import { SubscribeSection } from "@/lib/modules/member/subscription-ui";
import { PageHeader } from "@/components/ui/PageHeader";
import { ModuleTabs } from "@/components/module-tabs";

// หน้าย่อย "สมัครสมาชิก" ของระบบสมาชิก — สมัคร/ต่ออายุให้ลูกค้า + รายการสมัครล่าสุด
export default async function MemberSubscribePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireTenant();
  const sys = await prisma.appSystem.findFirst({ where: { id, tenantId: auth.active.tenantId, type: "MEMBER" } });
  if (!sys) notFound();
  const def = systemDef(sys.type);

  return (
    <div className="flex max-w-2xl flex-col gap-5">
      <PageHeader title={`${def?.icon ?? ""} ${sys.name}`.trim()} desc="สมัครสมาชิก — สมัคร/ต่ออายุให้ลูกค้า" />
      <ModuleTabs items={memberTabs(id)} />
      <SubscribeSection systemId={id} />
    </div>
  );
}
