import { notFound } from "next/navigation";
import { requireTenant } from "@/lib/core/context";
import { prisma } from "@/lib/core/db";
import { canReadKanban, getBoardView, KanbanNotFoundError, toActor } from "@/lib/modules/kanban/service";
import { boardFiltersFromParams } from "@/lib/modules/kanban/search";
import { BoardView } from "@/components/kanban/BoardView";

// หน้าบอร์ดใหม่ (K1.5) — `/app/sys/{id}/kanban/b/{boardId}` ตามภาพ `ledger/design-kanban/02-board.png`
// 🔴 เส้นทางเดิม `/kanban/{boardId}` redirect มาที่นี่ (ลิงก์เก่า/บุ๊กมาร์กของพนักงานต้องไม่ตาย)
// 🔴 อ่านผ่าน `getBoardView` → `getBoardFor` เท่านั้น ⇒ บอร์ดที่มองไม่เห็น = 404 ไม่ใช่ 403 (§6.3)
//    ห้ามส่ง Prisma model ลง client — ส่ง DTO ที่ serialize ได้ (วันที่เป็น ISO)
// 🔴 K1.11: ตัวกรองอ่านจาก `searchParams` ที่นี่ (server) แล้วส่งเป็น prop ให้ `BoardView` (client) —
//    ลิงก์ที่แชร์ตัวกรองไปจึงให้ผลเดียวกันเป๊ะไม่ว่าใครเปิด (ตัวกรองอยู่ใน URL เสมอ ไม่ใช่ local state)
export default async function KanbanBoardPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; boardId: string }>;
  searchParams: Promise<{ card?: string; assignee?: string; label?: string; due?: string; status?: string; q?: string }>;
}) {
  const [{ id, boardId }, query] = await Promise.all([params, searchParams]);
  const auth = await requireTenant();
  const tenantId = auth.active.tenantId;

  const sys = await prisma.appSystem.findFirst({ where: { id, tenantId, type: "KANBAN" } });
  if (!sys) notFound();

  const actor = toActor(auth.user.id, auth.active);
  if (!canReadKanban(actor)) notFound(); // ไม่มีสิทธิ์โมดูล = ไม่บอกด้วยซ้ำว่าบอร์ดมีอยู่

  const board = await getBoardView(
    { tenantId, systemId: id, actorUserId: auth.user.id },
    actor,
    boardId,
  ).catch((e: unknown) => {
    if (e instanceof KanbanNotFoundError) return null;
    throw e;
  });
  if (!board) notFound();

  const filters = boardFiltersFromParams(query);
  return <BoardView board={board} initialCardId={query.card ?? null} filters={filters} />;
}
