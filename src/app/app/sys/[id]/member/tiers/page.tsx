import { notFound } from "next/navigation";
import { requireTenant } from "@/lib/core/context";
import { prisma } from "@/lib/core/db";
import { systemDef } from "@/lib/systems";
import { memberTabs, MemberTiersSection } from "@/lib/modules/member/ui";
import { PageHeader } from "@/components/ui/PageHeader";
import { ModuleTabs } from "@/components/module-tabs";

// หน้าย่อย "ระดับสมาชิก" ของระบบสมาชิก — ตั้งชื่อระดับ + ยอดขั้นต่ำ (ลูกค้าเลื่อนระดับอัตโนมัติตามยอดสะสม)
export default async function MemberTiersPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireTenant();
  const sys = await prisma.appSystem.findFirst({ where: { id, tenantId: auth.active.tenantId, type: "MEMBER" } });
  if (!sys) notFound();
  const def = systemDef(sys.type);

  return (
    <div className="flex max-w-2xl flex-col gap-5">
      <PageHeader title={`${def?.icon ?? ""} ${sys.name}`.trim()} desc="ระดับสมาชิก — ตั้งชื่อ+ยอดขั้นต่ำแต่ละระดับ" />
      <ModuleTabs items={memberTabs(id)} />
      <MemberTiersSection systemId={id} />
    </div>
  );
}
