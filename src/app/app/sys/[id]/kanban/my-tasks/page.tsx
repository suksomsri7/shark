import { notFound } from "next/navigation";
import { requireTenant } from "@/lib/core/context";
import { prisma } from "@/lib/core/db";
import { KanbanMyTasksSection, kanbanTabs } from "@/lib/modules/kanban/ui";
import { PageHeader } from "@/components/ui/PageHeader";
import { ModuleTabs } from "@/components/module-tabs";

// หน้าย่อย "งานของฉัน" ของระบบบอร์ดงาน — การ์ดที่มอบหมายให้ฉันข้ามทุกบอร์ด
export default async function KanbanMyTasksPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireTenant();
  const tenantId = auth.active.tenantId;

  const sys = await prisma.appSystem.findFirst({ where: { id, tenantId, type: "KANBAN" } });
  if (!sys) notFound();

  return (
    <div className="flex max-w-2xl flex-col gap-5">
      <PageHeader title={sys.name} back={{ href: `/app/sys/${id}`, label: sys.name }} desc="งานของฉัน — การ์ดที่มอบหมายให้ฉัน" />
      <ModuleTabs items={kanbanTabs(id)} />
      <KanbanMyTasksSection systemId={id} tenantId={tenantId} />
    </div>
  );
}
