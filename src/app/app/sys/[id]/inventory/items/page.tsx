import { notFound } from "next/navigation";
import { requireTenant } from "@/lib/core/context";
import { prisma } from "@/lib/core/db";
import { systemDef } from "@/lib/systems";
import { InvItemsSection, invTabs } from "@/lib/modules/inventory/ui";
import { PageHeader } from "@/components/ui/PageHeader";
import { ModuleTabs } from "@/components/module-tabs";

// หน้าย่อย "สินค้า" ของระบบคลัง — ค้นบาร์โค้ด + ใกล้หมด + รายการสินค้า + เพิ่ม + นำเข้า CSV
export default async function InvItemsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireTenant();
  const sys = await prisma.appSystem.findFirst({ where: { id, tenantId: auth.active.tenantId, type: "INVENTORY" } });
  if (!sys) notFound();
  const def = systemDef(sys.type);

  return (
    <div className="flex max-w-2xl flex-col gap-5">
      <PageHeader title={`${def?.icon ?? ""} ${sys.name}`.trim()} desc="สินค้า — รายการ + เพิ่ม + นำเข้า" />
      <ModuleTabs items={invTabs(id)} />
      <InvItemsSection systemId={id} />
    </div>
  );
}
