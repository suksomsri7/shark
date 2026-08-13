import { notFound } from "next/navigation";
import { requireTenant } from "@/lib/core/context";
import { prisma } from "@/lib/core/db";
import { systemDef } from "@/lib/systems";
import { InvServicesSection, invTabs } from "@/lib/modules/inventory/ui";
import { PageHeader } from "@/components/ui/PageHeader";
import { ModuleTabs } from "@/components/module-tabs";

// หน้าย่อย "บริการ" ของระบบสินค้า/บริการ — ต้นฉบับเดียวของบริการทั้งระบบ (เจ้าของสั่งข้อ 12-15)
export default async function InvServicesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireTenant();
  const sys = await prisma.appSystem.findFirst({
    where: { id, tenantId: auth.active.tenantId, type: "INVENTORY" },
  });
  if (!sys) notFound();
  const def = systemDef(sys.type);

  return (
    <div className="flex max-w-2xl flex-col gap-5">
      <PageHeader title={`${def?.icon ?? ""} ${sys.name}`.trim()} desc="บริการ — ราคา เวลา มัดจำ รูป (ที่เดียว)" />
      <ModuleTabs items={invTabs(id)} />
      <InvServicesSection systemId={id} />
    </div>
  );
}
