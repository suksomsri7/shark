import { notFound } from "next/navigation";
import { requireTenant } from "@/lib/core/context";
import { prisma } from "@/lib/core/db";
import { systemDef } from "@/lib/systems";
import { InvProcurementSection, invTabs } from "@/lib/modules/inventory/ui";
import { PageHeader } from "@/components/ui/PageHeader";
import { ModuleTabs } from "@/components/module-tabs";

// หน้าย่อย "จัดซื้อ" ของระบบคลัง — ซัพพลายเออร์ + ใบสั่งซื้อ (PO)
export default async function InvProcurementPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireTenant();
  const sys = await prisma.appSystem.findFirst({ where: { id, tenantId: auth.active.tenantId, type: "INVENTORY" } });
  if (!sys) notFound();
  const def = systemDef(sys.type);

  return (
    <div className="flex max-w-2xl flex-col gap-5">
      <PageHeader title={`${def?.icon ?? ""} ${sys.name}`.trim()} desc="จัดซื้อ — ซัพพลายเออร์ + ใบสั่งซื้อ" />
      <ModuleTabs items={invTabs(id)} />
      <InvProcurementSection systemId={id} />
    </div>
  );
}
