import { notFound } from "next/navigation";
import { requireTenant } from "@/lib/core/context";
import { prisma } from "@/lib/core/db";
import { systemDef } from "@/lib/systems";
import { MemberCustomersSection, memberTabs } from "@/lib/modules/member/ui";
import { PageHeader } from "@/components/ui/PageHeader";
import { ModuleTabs } from "@/components/module-tabs";

// หน้าย่อย "รายชื่อสมาชิก" ของระบบสมาชิก — รายชื่อ + ลิงก์เข้าโปรไฟล์/แก้ไข
export default async function MemberCustomersPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireTenant();
  const sys = await prisma.appSystem.findFirst({ where: { id, tenantId: auth.active.tenantId, type: "MEMBER" } });
  if (!sys) notFound();
  const def = systemDef(sys.type);

  return (
    <div className="flex max-w-2xl flex-col gap-5">
      <PageHeader title={`${def?.icon ?? ""} ${sys.name}`.trim()} desc="รายชื่อสมาชิก" />
      <ModuleTabs items={memberTabs(id)} />
      <MemberCustomersSection systemId={id} />
    </div>
  );
}
