import { notFound } from "next/navigation";
import { requireTenant } from "@/lib/core/context";
import { prisma } from "@/lib/core/db";
import { canReadKanban, getBoardView, KanbanNotFoundError, listBoardTable, toActor } from "@/lib/modules/kanban/service";
import type { TableGroupBy, TableSort } from "@/lib/modules/kanban/service";
import { boardFiltersFromParams } from "@/lib/modules/kanban/search";
// K1.14 — ปุ่มลัดปิดได้รายคน (แบบ §5.6) → อ่านค่าที่นี่แล้วส่งลงเป็น prop (client ไม่ต้องยิงถามเอง)
import { getUserPreferences } from "@/lib/modules/kanban/preferences";
import { BoardView } from "@/components/kanban/BoardView";
// K2.1 — มุมมองตาราง `?view=table` (แท็บใน BoardHeader)
import { TableView } from "@/components/kanban/TableView";

const GROUP_VALUES: readonly TableGroupBy[] = ["column", "assignee", "label"];
const SORT_VALUES: readonly TableSort[] = ["due", "created", "updated", "position"];

// หน้าบอร์ดใหม่ (K1.5) — `/app/sys/{id}/kanban/b/{boardId}` ตามภาพ `ledger/design-kanban/02-board.png`
// 🔴 เส้นทางเดิม `/kanban/{boardId}` redirect มาที่นี่ (ลิงก์เก่า/บุ๊กมาร์กของพนักงานต้องไม่ตาย)
// 🔴 อ่านผ่าน `getBoardView` → `getBoardFor` เท่านั้น ⇒ บอร์ดที่มองไม่เห็น = 404 ไม่ใช่ 403 (§6.3)
//    ห้ามส่ง Prisma model ลง client — ส่ง DTO ที่ serialize ได้ (วันที่เป็น ISO)
// 🔴 K1.11: ตัวกรองอ่านจาก `searchParams` ที่นี่ (server) แล้วส่งเป็น prop ให้ `BoardView` (client) —
//    ลิงก์ที่แชร์ตัวกรองไปจึงให้ผลเดียวกันเป๊ะไม่ว่าใครเปิด (ตัวกรองอยู่ใน URL เสมอ ไม่ใช่ local state)
// 🔴 K2.1: `?view=table` → server เรียก `listBoardTable` แล้วส่ง `TableView` แทนกองคอลัมน์ของ `BoardView`
//    `board` (จาก `getBoardView`) ยังใช้เป็น "โครงบอร์ด" ของหัวบอร์ด/ตัวกรอง/ป้าย/สมาชิก ให้ทั้งสองมุมมอง
export default async function KanbanBoardPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; boardId: string }>;
  searchParams: Promise<{
    card?: string;
    assignee?: string;
    label?: string;
    due?: string;
    status?: string;
    q?: string;
    view?: string;
    group?: string;
    sort?: string;
    page?: string;
  }>;
}) {
  const [{ id, boardId }, query] = await Promise.all([params, searchParams]);
  const auth = await requireTenant();
  const tenantId = auth.active.tenantId;

  const sys = await prisma.appSystem.findFirst({ where: { id, tenantId, type: "KANBAN" } });
  if (!sys) notFound();

  const actor = toActor(auth.user.id, auth.active);
  if (!canReadKanban(actor)) notFound(); // ไม่มีสิทธิ์โมดูล = ไม่บอกด้วยซ้ำว่าบอร์ดมีอยู่

  const ctx = { tenantId, systemId: id, actorUserId: auth.user.id };
  const board = await getBoardView(ctx, actor, boardId).catch((e: unknown) => {
    if (e instanceof KanbanNotFoundError) return null;
    throw e;
  });
  if (!board) notFound();

  const filters = boardFiltersFromParams(query);
  const view = query.view === "table" ? "table" : "board";

  if (view === "table") {
    const group = GROUP_VALUES.includes(query.group as TableGroupBy) ? (query.group as TableGroupBy) : undefined;
    const sort = SORT_VALUES.includes(query.sort as TableSort) ? (query.sort as TableSort) : "position";
    const page = Math.max(1, parseInt(query.page ?? "1", 10) || 1);
    const table = await listBoardTable(ctx, actor, boardId, { now: new Date(board.now), filters, group, sort, page });
    return <TableView board={board} table={table} filters={filters} group={group} sort={sort} page={page} />;
  }

  const prefs = await getUserPreferences(auth.user.id);
  return (
    <BoardView
      board={board}
      initialCardId={query.card ?? null}
      filters={filters}
      shortcutsEnabled={prefs.kanbanShortcuts}
    />
  );
}
