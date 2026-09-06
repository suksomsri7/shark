import { notFound } from "next/navigation";
import { requireTenant } from "@/lib/core/context";
import { prisma } from "@/lib/core/db";
import { boardsHome, canReadKanban, toActor } from "@/lib/modules/kanban/service";
import { kanbanTabs } from "@/lib/modules/kanban/ui";
import { BoardsHome } from "@/components/kanban/BoardsHome";
import { ModuleTabs } from "@/components/module-tabs";

// หน้ารวมบอร์ดใหม่ (K1.12) — แทนที่ `KanbanBoardsSection` เดิม · เทียบ `ledger/design-kanban/01-boards-home.png`
// ดาว/จัดกลุ่มสาขา/บอร์ดกลางองค์กร/แถวเทมเพลต — ข้อมูลมาจาก `service.boardsHome` ตัวเดียว (ผ่านสิทธิ์แล้ว)
export default async function KanbanBoardsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireTenant();
  const tenantId = auth.active.tenantId;

  const sys = await prisma.appSystem.findFirst({ where: { id, tenantId, type: "KANBAN" } });
  if (!sys) notFound();

  const actor = toActor(auth.user.id, auth.active);
  if (!canReadKanban(actor)) notFound();

  const ctx = { tenantId, systemId: id, actorUserId: auth.user.id };
  const [home, units] = await Promise.all([
    boardsHome(ctx, actor),
    prisma.businessUnit.findMany({
      where: { tenantId, status: "ACTIVE" },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true },
    }),
  ]);

  return (
    <div className="flex flex-col gap-5">
      <ModuleTabs items={kanbanTabs(id)} />
      <BoardsHome systemId={id} home={home} units={units} nowMs={Date.now()} />
    </div>
  );
}
