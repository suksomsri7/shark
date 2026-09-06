// boardsHome.ts — หน้ารวมบอร์ดใหม่ (K1.12 · พิมพ์เขียว 13-kanban-v2 §3.1 · KANBAN-RUN §K1.12 · ภาพ 01)
//
// รวมทุกอย่างที่หน้า `/kanban/boards` ต้องใช้ไว้ที่เดียว: บอร์ดติดดาว · จัดกลุ่มตามหน่วยธุรกิจ ·
// บอร์ดกลางองค์กร (unitId=null) · แถวเทมเพลต · ยอดรวม — คืนเป็น DTO ที่ serialize ข้าม RSC ได้
// (ไม่มี Date/Prisma model) เหมือนแพตเทิร์นของ `service.getBoardView` (K1.5)
//
// 🔴 ผ่าน `visibleBoardsWhere(actor)` เสมอ — บอร์ด PRIVATE ของสาขาอื่น/ที่ไม่ได้เป็นสมาชิกต้องไม่รั่วมาที่นี่
// re-export จาก `service.ts` เป็น `service.boardsHome` ตามชื่อที่ปักไว้ในสัญญา §K1.12

import { visibleBoardsWhere } from "./access";
import { prisma } from "./db";
import { listTemplates } from "./templates";
import type { BoardsHomeCardDto, BoardsHomeDto, KanbanActor, KanbanCtx, KanbanTagColor } from "./types";

// 🔴 `BoardsHomeCardDto`/`BoardsHomeDto` อยู่ใน `types.ts` (ไฟล์บริสุทธิ์) ด้วยเหตุผลเดียวกับ `templates.ts`
//    ด้านบน — `BoardsHome.tsx` (client) ต้อง `import type` ได้โดยไม่ลากไฟล์นี้เข้าบันเดิลฝั่ง browser
export type { BoardsHomeCardDto, BoardsHomeDto } from "./types";

export async function boardsHome(ctx: KanbanCtx, actor: KanbanActor): Promise<BoardsHomeDto> {
  const boards = await prisma.kanbanBoard.findMany({
    where: { AND: [{ tenantId: ctx.tenantId, systemId: ctx.systemId, status: "ACTIVE" }, visibleBoardsWhere(actor)] },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
  const boardIds = boards.map((b) => b.id);
  const now = new Date();

  const [totalRows, openRows, overdueRows, memberRows, starRows, units] = await Promise.all([
    boardIds.length
      ? prisma.kanbanCard.groupBy({ by: ["boardId"], where: { boardId: { in: boardIds }, status: "ACTIVE" }, _count: { _all: true } })
      : Promise.resolve([] as { boardId: string; _count: { _all: number } }[]),
    boardIds.length
      ? prisma.kanbanCard.groupBy({
          by: ["boardId"],
          where: { boardId: { in: boardIds }, status: "ACTIVE", completedAt: null },
          _count: { _all: true },
        })
      : Promise.resolve([] as { boardId: string; _count: { _all: number } }[]),
    boardIds.length
      ? prisma.kanbanCard.groupBy({
          by: ["boardId"],
          where: { boardId: { in: boardIds }, status: "ACTIVE", completedAt: null, dueAt: { lt: now } },
          _count: { _all: true },
        })
      : Promise.resolve([] as { boardId: string; _count: { _all: number } }[]),
    boardIds.length
      ? prisma.kanbanBoardMember.findMany({ where: { boardId: { in: boardIds }, tenantId: ctx.tenantId }, select: { boardId: true, userId: true } })
      : Promise.resolve([] as { boardId: string; userId: string }[]),
    ctx.actorUserId && boardIds.length
      ? prisma.kanbanBoardStar.findMany({ where: { boardId: { in: boardIds }, userId: ctx.actorUserId, tenantId: ctx.tenantId }, select: { boardId: true } })
      : Promise.resolve([] as { boardId: string }[]),
    prisma.businessUnit.findMany({ where: { tenantId: ctx.tenantId }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { id: true, name: true } }),
  ]);

  const userIds = Array.from(new Set(memberRows.map((m) => m.userId)));
  const users = userIds.length ? await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true, email: true } }) : [];
  const nameOf = new Map(users.map((u) => [u.id, u.name ?? u.email ?? u.id]));

  const totalOf = new Map(totalRows.map((r) => [r.boardId, r._count._all]));
  const openOf = new Map(openRows.map((r) => [r.boardId, r._count._all]));
  const overdueOf = new Map(overdueRows.map((r) => [r.boardId, r._count._all]));
  const membersOf = new Map<string, { userId: string; name: string }[]>();
  for (const m of memberRows) {
    const list = membersOf.get(m.boardId) ?? [];
    list.push({ userId: m.userId, name: nameOf.get(m.userId) ?? m.userId });
    membersOf.set(m.boardId, list);
  }
  const starredIds = new Set(starRows.map((s) => s.boardId));
  const unitById = new Map(units.map((u) => [u.id, u]));

  const toCard = (b: (typeof boards)[number]): BoardsHomeCardDto => ({
    id: b.id,
    name: b.name,
    color: b.color as KanbanTagColor,
    unitId: b.unitId,
    visibility: b.visibility,
    cardCount: totalOf.get(b.id) ?? 0,
    overdueCount: overdueOf.get(b.id) ?? 0,
    members: membersOf.get(b.id) ?? [],
    updatedAt: b.updatedAt.toISOString(),
  });

  const starred = boards.filter((b) => starredIds.has(b.id)).map(toCard);
  const tenantWide = boards.filter((b) => b.unitId === null).map(toCard);

  const byUnitIds = Array.from(new Set(boards.map((b) => b.unitId).filter((v): v is string => v !== null)));
  const byUnit = byUnitIds
    .map((unitId) => {
      const unit = unitById.get(unitId);
      if (!unit) return null;
      const unitBoards = boards.filter((b) => b.unitId === unitId).map(toCard);
      if (unitBoards.length === 0) return null;
      return { unit, boards: unitBoards };
    })
    .filter((v): v is { unit: { id: string; name: string }; boards: BoardsHomeCardDto[] } => v !== null);

  const templates = await listTemplates(ctx);

  const openCards = boardIds.reduce((sum, id) => sum + (openOf.get(id) ?? 0), 0);

  return {
    starred,
    byUnit,
    tenantWide,
    templates,
    totals: { boards: boards.length, openCards },
  };
}
