import { notFound } from "next/navigation";
import { requireTenant } from "@/lib/core/context";
import { prisma } from "@/lib/core/db";
import { systemDef } from "@/lib/systems";
import { InvMovementsSection, invTabs } from "@/lib/modules/inventory/ui";
import { PageHeader } from "@/components/ui/PageHeader";
import { ModuleTabs } from "@/components/module-tabs";

// หน้าย่อย "รับเข้า / เคลื่อนไหว" ของระบบคลัง — รับเข้า + ตัดออก + ความเคลื่อนไหวล่าสุด
export default async function InvMovementsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireTenant();
  const sys = await prisma.appSystem.findFirst({ where: { id, tenantId: auth.active.tenantId, type: "INVENTORY" } });
  if (!sys) notFound();
  const def = systemDef(sys.type);

  return (
    <div className="flex max-w-2xl flex-col gap-5">
      <PageHeader title={`${def?.icon ?? ""} ${sys.name}`.trim()} desc="รับเข้า — รับเข้า · ตัดออก · ประวัติ" />
      <ModuleTabs items={invTabs(id)} />
      <InvMovementsSection systemId={id} />
    </div>
  );
}
