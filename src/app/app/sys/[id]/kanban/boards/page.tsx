import { notFound } from "next/navigation";
import { requireTenant } from "@/lib/core/context";
import { prisma } from "@/lib/core/db";
import { KanbanBoardsSection, kanbanTabs } from "@/lib/modules/kanban/ui";
import { PageHeader } from "@/components/ui/PageHeader";
import { ModuleTabs } from "@/components/module-tabs";

// หน้าย่อย "บอร์ดงาน" ของระบบบอร์ดงาน — รายการบอร์ด + สร้างบอร์ด
export default async function KanbanBoardsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireTenant();
  const tenantId = auth.active.tenantId;

  const sys = await prisma.appSystem.findFirst({ where: { id, tenantId, type: "KANBAN" } });
  if (!sys) notFound();

  return (
    <div className="flex max-w-2xl flex-col gap-5">
      <PageHeader title={sys.name} back={{ href: `/app/sys/${id}`, label: sys.name }} desc="บอร์ดงาน — รายการบอร์ด + สร้างบอร์ด" />
      <ModuleTabs items={kanbanTabs(id)} />
      <KanbanBoardsSection systemId={id} tenantId={tenantId} />
    </div>
  );
}
