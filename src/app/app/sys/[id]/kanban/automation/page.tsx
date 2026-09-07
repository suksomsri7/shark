import { notFound } from "next/navigation";
import { requireTenant } from "@/lib/core/context";
import { prisma } from "@/lib/core/db";
import { boardRole, toActor, visibleBoardsWhere } from "@/lib/modules/kanban/access";
import { canManageAutomation, listRuns, listRules, usageThisMonth } from "@/lib/modules/kanban/automation";
import { KANBAN_AUTOMATION_EVENTS } from "@/lib/automation/labels";
import { AutomationBuilder, type AutomationPageData } from "@/components/kanban/AutomationBuilder";

// หน้า "อัตโนมัติ" ของบอร์ดงาน (K2.9 · ภาพ `ledger/design-kanban/08-automation.png`)
//
// 🔴 404 ไม่ใช่ 403 (§6.3): ไม่มีคีย์ `kanban.automation.manage` หรือไม่ได้เป็น ADMIN ของบอร์ดไหนเลย
//    = "ไม่มีหน้านี้" · ระบุ `?board=` ของบอร์ดที่ตัวเองไม่ได้เป็น ADMIN ก็ 404 เหมือนกัน
//    (ตอบว่า "มีบอร์ดนี้อยู่แต่คุณเข้าไม่ได้" = ยืนยันว่าบอร์ดลับมีจริง)
// 🔴 หน้านี้เป็น server component ล้วน — โหลดกฎ/บันทึก/ตัวเลือกทั้งหมดมาให้ `AutomationBuilder` (client)
//    ในเที่ยวเดียว · client ไม่ยิง action เพื่อ "ดู" อะไรเลย ยิงเฉพาะตอนลงมือ

export default async function KanbanAutomationPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ board?: string }>;
}) {
  const { id } = await params;
  const { board: boardParam } = await searchParams;
  const auth = await requireTenant();
  const tenantId = auth.active.tenantId;

  const sys = await prisma.appSystem.findFirst({ where: { id, tenantId, type: "KANBAN" } });
  if (!sys) notFound();

  const actor = toActor(auth.user.id, auth.active);
  if (!canManageAutomation(actor)) notFound();

  // บอร์ดที่ "มองเห็น" ก่อน แล้วค่อยกรองเหลือเฉพาะใบที่เป็น ADMIN (คิดด้วย access.ts ตัวเดียวกับทั้งโมดูล)
  const [boards, myMemberships] = await Promise.all([
    prisma.kanbanBoard.findMany({
      where: { tenantId, systemId: id, status: "ACTIVE", AND: [visibleBoardsWhere(actor)] },
      orderBy: [{ name: "asc" }],
      select: { id: true, name: true, unitId: true, visibility: true },
    }),
    prisma.kanbanBoardMember.findMany({ where: { tenantId, userId: auth.user.id }, select: { boardId: true, role: true } }),
  ]);
  const adminBoards = boards.filter(
    (b) =>
      boardRole(
        actor,
        { unitId: b.unitId, visibility: b.visibility },
        myMemberships.filter((m) => m.boardId === b.id).map((m) => ({ userId: auth.user.id, role: m.role })),
      ) === "ADMIN",
  );
  if (adminBoards.length === 0) notFound();
  const board = boardParam ? adminBoards.find((b) => b.id === boardParam) : adminBoards[0];
  if (!board) notFound();

  const ctx = { tenantId, systemId: id, actorUserId: auth.user.id };
  const [rules, runs, usage, columns, labels, members, fields, allBoards] = await Promise.all([
    listRules(ctx, actor, board.id),
    listRuns(ctx, actor, board.id, { take: 30 }),
    usageThisMonth(ctx, board.id),
    prisma.kanbanColumn.findMany({
      where: { tenantId, systemId: id, boardId: board.id, status: "ACTIVE" },
      orderBy: [{ position: { sort: "asc", nulls: "first" } }, { sortOrder: "asc" }],
      select: { id: true, name: true },
    }),
    prisma.kanbanLabel.findMany({ where: { tenantId, systemId: id, boardId: board.id }, orderBy: [{ sortOrder: "asc" }], select: { id: true, name: true } }),
    prisma.membership.findMany({ where: { tenantId, acceptedAt: { not: null } }, select: { userId: true, user: { select: { name: true, email: true } } } }),
    prisma.kanbanCustomField.findMany({ where: { tenantId, boardId: board.id }, orderBy: [{ sortOrder: "asc" }], select: { id: true, name: true } }),
    prisma.kanbanColumn.findMany({
      where: { tenantId, systemId: id, status: "ACTIVE", board: { status: "ACTIVE" } },
      orderBy: [{ position: { sort: "asc", nulls: "first" } }, { sortOrder: "asc" }],
      select: { id: true, name: true, boardId: true, board: { select: { name: true } } },
    }),
  ]);

  const data: AutomationPageData = {
    systemId: id,
    board: { id: board.id, name: board.name },
    boards: adminBoards.map((b) => ({ id: b.id, name: b.name })),
    usage,
    rules,
    runs: runs.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })),
    events: KANBAN_AUTOMATION_EVENTS.map((e) => ({ value: e.value, label: e.label })),
    columns,
    labels,
    users: members.map((m) => ({ userId: m.userId, name: m.user.name ?? m.user.email ?? "พนักงาน" })),
    fields,
    targetBoards: Array.from(new Map(allBoards.map((c) => [c.boardId, { id: c.boardId, name: c.board.name }])).values()),
    targetColumns: allBoards.map((c) => ({ id: c.id, name: c.name, boardId: c.boardId })),
  };

  return <AutomationBuilder data={data} />;
}
