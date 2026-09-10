import { notFound } from "next/navigation";
import { requireTenant } from "@/lib/core/context";
import { prisma } from "@/lib/core/db";
import { canReadKanban, toActor } from "@/lib/modules/kanban/service";
import { crossBoardTotals, listCrossBoard } from "@/lib/modules/kanban/overview";
import type { CrossBoardFilters, CrossBoardGroupBy, CrossBoardSort } from "@/lib/modules/kanban/overview";
import { applyView, listViews } from "@/lib/modules/kanban/views";
import { KanbanTabs } from "@/components/kanban/KanbanTabs";
import { OverviewPage } from "@/components/kanban/OverviewPage";
import { PageHeader } from "@/components/ui/PageHeader";

// หน้าภาพรวมข้ามบอร์ดระดับองค์กร (K3.8 · `/kanban/overview` · nav.ts key "overview" ถัดจาก "บอร์ด")
//
// 🔴 อ่านอย่างเดียวเสมอ (ไม่มีแก้ในช่อง/ลาก/bulk — ดูเหตุผลที่หัวไฟล์ `OverviewPage.tsx`) · ไม่มีสิทธิ์
//    โมดูล = 404 (§6.3) · `listCrossBoard`/`crossBoardTotals` กรองด้วย `visibleBoardsWhere(actor)` เองแล้ว
//    (ไม่ต้องกรองซ้ำที่นี่) — คนที่ไม่เห็นบอร์ดลับต้องไม่เห็นการ์ดของมันในหน้านี้

const GROUP_VALUES: readonly CrossBoardGroupBy[] = ["board", "assignee", "due"];
const SORT_VALUES: readonly CrossBoardSort[] = ["due", "created", "updated", "position"];

export default async function KanbanOverviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    assignee?: string;
    label?: string;
    due?: string;
    status?: string;
    q?: string;
    column?: string;
    board?: string;
    group?: string;
    sort?: string;
    page?: string;
    // K2.5/K3.8 — โหลดมุมมองที่บันทึกไว้ข้ามบอร์ด (§2.3): พารามิเตอร์ที่ผู้ใช้ไม่ได้ระบุเองรับค่าจากมุมมองนี้
    savedView?: string;
  }>;
}) {
  const { id } = await params;
  const auth = await requireTenant();
  const tenantId = auth.active.tenantId;

  const sys = await prisma.appSystem.findFirst({ where: { id, tenantId, type: "KANBAN" } });
  if (!sys) notFound();

  const actor = toActor(auth.user.id, auth.active);
  if (!canReadKanban(actor)) notFound(); // ไม่มีสิทธิ์เข้าโมดูลเลย = ไม่บอกด้วยซ้ำว่าหน้านี้มีอยู่

  const ctx = { tenantId, systemId: id, actorUserId: auth.user.id };
  const now = new Date();

  const rawQuery = await searchParams;
  let query = rawQuery;
  if (rawQuery.savedView) {
    const applied = await applyView(ctx, actor, rawQuery.savedView).catch(() => null);
    if (applied) {
      query = {
        ...rawQuery,
        assignee: rawQuery.assignee ?? applied.filters.assignee,
        label: rawQuery.label ?? applied.filters.label,
        due: rawQuery.due ?? applied.filters.due,
        status: rawQuery.status ?? applied.filters.status,
        q: rawQuery.q ?? applied.filters.q,
        column: rawQuery.column ?? applied.filters.column,
        board: rawQuery.board ?? applied.filters.board,
        sort: rawQuery.sort ?? applied.sort,
        group: rawQuery.group ?? applied.group,
      };
    }
  }
  const savedViews = await listViews(ctx, actor, null).catch(() => []);

  const selectedBoardIds = (query.board ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const filters: CrossBoardFilters = {
    ...(query.assignee ? { assignee: query.assignee } : {}),
    ...(query.label ? { label: query.label } : {}),
    ...(query.due === "overdue" || query.due === "today" || query.due === "week" || query.due === "none" ? { due: query.due } : {}),
    ...(query.status === "done" || query.status === "open" ? { status: query.status } : {}),
    ...(query.column ? { column: query.column } : {}),
    ...(selectedBoardIds.length > 0 ? { board: selectedBoardIds } : {}),
  };
  const group = GROUP_VALUES.includes(query.group as CrossBoardGroupBy) ? (query.group as CrossBoardGroupBy) : undefined;
  const sort = SORT_VALUES.includes(query.sort as CrossBoardSort) ? (query.sort as CrossBoardSort) : undefined;
  const page = Math.max(1, parseInt(query.page ?? "1", 10) || 1);

  const [data, totals] = await Promise.all([
    listCrossBoard(ctx, actor, { now, filters, group, sort, page }),
    crossBoardTotals(ctx, actor, { now }),
  ]);

  return (
    <div className="flex flex-col gap-4">
      <div className="px-2">
        <PageHeader title={sys.name} back={{ href: `/app/sys/${id}`, label: sys.name }} desc="ภาพรวมข้ามบอร์ดระดับองค์กร — รวมงานค้างของทุกบอร์ดที่มองเห็น อ่านอย่างเดียว" />
        <KanbanTabs systemId={id} actor={actor} />
      </div>
      <div className="rounded-2xl border" style={{ borderColor: "var(--color-line)", background: "var(--color-surface)" }}>
        <OverviewPage
          systemId={id}
          now={now.toISOString()}
          data={data}
          totals={totals}
          filters={filters}
          selectedBoardIds={selectedBoardIds}
          group={group}
          sort={sort}
          page={page}
          savedViews={savedViews}
          isOwner={actor.role === "OWNER"}
          viewerUserId={auth.user.id}
        />
      </div>
    </div>
  );
}
