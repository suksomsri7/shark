import { notFound } from "next/navigation";
import { requireTenant } from "@/lib/core/context";
import { prisma } from "@/lib/core/db";
import { KanbanBoardView } from "@/lib/modules/kanban/ui";

// หน้าบอร์ด Kanban เต็มจอ — คอลัมน์แนวนอน + การ์ด + ย้าย/ผู้รับผิดชอบ/กำหนดส่ง
export default async function KanbanBoardPage({
  params,
}: {
  params: Promise<{ id: string; boardId: string }>;
}) {
  const { id, boardId } = await params;
  const auth = await requireTenant();
  const tenantId = auth.active.tenantId;

  const sys = await prisma.appSystem.findFirst({ where: { id, tenantId } });
  if (!sys || sys.type !== "KANBAN") notFound();

  return (
    <div className="flex flex-col gap-6">
      <KanbanBoardView systemId={id} tenantId={tenantId} boardId={boardId} />
    </div>
  );
}
