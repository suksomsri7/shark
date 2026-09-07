import { notFound } from "next/navigation";
import { requireTenant } from "@/lib/core/context";
import { prisma } from "@/lib/core/db";
import { canViewReports, toActor, visibleBoardsWhere } from "@/lib/modules/kanban/access";
import { aging, openCards, overdue, throughput, workload } from "@/lib/modules/kanban/reports";
import { KanbanTabs } from "@/components/kanban/KanbanTabs";
import { ReportsPage } from "@/components/kanban/ReportsPage";
import { PageHeader } from "@/components/ui/PageHeader";

// หน้า "รายงาน" ของระบบบอร์ดงาน (K2.10 · พิมพ์เขียว §3.7/§11.10 · ไม่มี mockup)
//
// 🔴 404 ไม่ใช่ 403 (§6.3): ไม่มีคีย์ `kanban.report.view` (OWNER ผ่านเสมอ) = "ไม่มีหน้านี้" — เช็คก่อนคิว
//    รี DB ใด ๆ ด้วยตัวตัดสินไร้สถานะ `canViewReports()` ของ access.ts (เหมือน `canManageAutomation` ของ
//    หน้าอัตโนมัติ) · `?board=` ที่ actor มองไม่เห็น → `reports.ts#scopedBoards` โยน `KanbanNotFoundError`
//    ระหว่างดึงข้อมูล ⇒ จับที่นี่แล้ว 404 เหมือนกัน (ไม่ยืนยันว่าบอร์ดลับมีจริง)
// 🔴 server component ล้วน — เรียก 5 รายงานในเที่ยวเดียว (Promise.all) แล้วส่งเป็น props ให้ `ReportsPage`
//    (client) สลับแท็บฝั่ง client ล้วนโดยไม่ยิง server ซ้ำ — เปลี่ยนเฉพาะ `?board=` เท่านั้นที่ navigate ใหม่
export default async function KanbanReportsPage({
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
  if (!canViewReports(actor)) notFound();

  const ctx = { tenantId, systemId: id, actorUserId: auth.user.id };
  const now = new Date();
  const boardId = boardParam || undefined;

  let data: [
    { id: string; name: string }[],
    Awaited<ReturnType<typeof openCards>>,
    Awaited<ReturnType<typeof overdue>>,
    Awaited<ReturnType<typeof workload>>,
    Awaited<ReturnType<typeof throughput>>,
    Awaited<ReturnType<typeof aging>>,
  ];
  try {
    data = await Promise.all([
      prisma.kanbanBoard.findMany({
        where: { AND: [{ tenantId, systemId: id, status: "ACTIVE" }, visibleBoardsWhere(actor)] },
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      }),
      openCards(ctx, actor, { now, boardId }),
      overdue(ctx, actor, { now, boardId }),
      workload(ctx, actor, { now, boardId }),
      throughput(ctx, actor, { now, boardId }),
      aging(ctx, actor, { now, boardId }),
    ]);
  } catch {
    // boardId ที่ actor มองไม่เห็น (หรือไม่มีจริง) → ไม่พบ — ไม่ยืนยันว่าบอร์ดลับมีจริง (§6.3)
    notFound();
  }
  const [boards, openCardsData, overdueData, workloadData, throughputData, agingData] = data;

  return (
    <div className="flex max-w-6xl flex-col gap-5">
      <PageHeader title={sys.name} back={{ href: `/app/sys/${id}`, label: sys.name }} desc="รายงาน — ค้าง/เลยกำหนด/ภาระงาน/ผลงานรายสัปดาห์/อายุงาน ข้ามทุกบอร์ดที่มองเห็น" />
      <KanbanTabs systemId={id} actor={actor} />
      <ReportsPage
        systemId={id}
        boards={boards}
        selectedBoardId={boardId}
        openCards={openCardsData}
        overdue={overdueData}
        workload={workloadData}
        throughput={throughputData}
        aging={agingData}
      />
    </div>
  );
}
