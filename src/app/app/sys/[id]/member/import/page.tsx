import { notFound } from "next/navigation";
import { requireTenant } from "@/lib/core/context";
import { prisma } from "@/lib/core/db";
import { systemDef } from "@/lib/systems";
import { MemberImportSection, memberTabs } from "@/lib/modules/member/ui";
import { PageHeader } from "@/components/ui/PageHeader";
import { ModuleTabs } from "@/components/module-tabs";

// หน้าย่อย "นำเข้า CSV" ของระบบสมาชิก — เพิ่มลูกค้าครั้งละมาก ๆ จากไฟล์
export default async function MemberImportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireTenant();
  const sys = await prisma.appSystem.findFirst({ where: { id, tenantId: auth.active.tenantId, type: "MEMBER" } });
  if (!sys) notFound();
  const def = systemDef(sys.type);

  return (
    <div className="flex max-w-2xl flex-col gap-5">
      <PageHeader title={`${def?.icon ?? ""} ${sys.name}`.trim()} desc="นำเข้าลูกค้าจาก CSV" />
      <ModuleTabs items={memberTabs(id)} />
      <MemberImportSection systemId={id} />
    </div>
  );
}
