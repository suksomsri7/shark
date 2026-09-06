import { notFound } from "next/navigation";
import { requireTenant } from "@/lib/core/context";
import { prisma } from "@/lib/core/db";
import { canReadKanban, getBoardFor, KanbanNotFoundError, toActor } from "@/lib/modules/kanban/service";
import { hasBoardRole } from "@/lib/modules/kanban/access";
import { listArchived } from "@/lib/modules/kanban/archive";
import { ArchivePage } from "@/components/kanban/ArchivePage";

// หน้าคลังเก็บของบอร์ด (K1.14) — `/app/sys/{id}/kanban/b/{boardId}/archive` · เข้าจากเมนู ⋯ ของบอร์ด
// 🔴 อ่านผ่าน `getBoardFor` เท่านั้น ⇒ บอร์ดที่มองไม่เห็น = 404 (§6.3) เหมือนหน้าบอร์ด
// 🔴 ปุ่ม "กู้คืน" โผล่ตามบทบาทจริงในบอร์ด: การ์ด = EDITOR ขึ้นไป · คอลัมน์ = ADMIN (D16)
//    (ชั้น server ตรวจซ้ำเสมอใน action — นี่คือการซ่อนปุ่มที่กดไม่ได้ ไม่ใช่ด่านสิทธิ์)
export default async function KanbanArchivePage({
  params,
}: {
  params: Promise<{ id: string; boardId: string }>;
}) {
  const { id, boardId } = await params;
  const auth = await requireTenant();
  const tenantId = auth.active.tenantId;

  const sys = await prisma.appSystem.findFirst({ where: { id, tenantId, type: "KANBAN" } });
  if (!sys) notFound();

  const actor = toActor(auth.user.id, auth.active);
  if (!canReadKanban(actor)) notFound();

  const ctx = { tenantId, systemId: id, actorUserId: auth.user.id };
  const board = await getBoardFor(ctx, actor, boardId).catch((e: unknown) => {
    if (e instanceof KanbanNotFoundError) return null;
    throw e;
  });
  if (!board) notFound();

  const initial = await listArchived(ctx, boardId, {});
  const role = board.role;

  return (
    <ArchivePage
      systemId={id}
      boardId={boardId}
      boardName={board.name}
      initial={initial}
      canRestoreCards={hasBoardRole(role, "EDITOR")}
      canRestoreColumns={hasBoardRole(role, "ADMIN")}
    />
  );
}
