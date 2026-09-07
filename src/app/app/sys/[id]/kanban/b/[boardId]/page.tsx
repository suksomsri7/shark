import { notFound } from "next/navigation";
import { requireTenant } from "@/lib/core/context";
import { prisma } from "@/lib/core/db";
import { boardSummary, canReadKanban, getBoardView, KanbanNotFoundError, listBoardCalendar, listBoardTable, toActor } from "@/lib/modules/kanban/service";
import type { TableGroupBy, TableSort } from "@/lib/modules/kanban/service";
import { boardFiltersFromParams } from "@/lib/modules/kanban/search";
// K1.14 — ปุ่มลัดปิดได้รายคน (แบบ §5.6) → อ่านค่าที่นี่แล้วส่งลงเป็น prop (client ไม่ต้องยิงถามเอง)
import { getUserPreferences } from "@/lib/modules/kanban/preferences";
// K2.5 — มุมมองที่บันทึกไว้: รายการ (dropdown ในหัวบอร์ด) + โหลด `?savedView=` เป็นพารามิเตอร์จริง
import { applyView, listViews } from "@/lib/modules/kanban/views";
import { BoardView } from "@/components/kanban/BoardView";
// K2.1 — มุมมองตาราง `?view=table` (แท็บใน BoardHeader)
import { TableView } from "@/components/kanban/TableView";
// K2.2 — มุมมองปฏิทิน `?view=calendar` (แท็บใน BoardHeader)
import { CalendarView } from "@/components/kanban/CalendarView";
// K2.4 — มุมมองสรุป `?view=summary` (แท็บใน BoardHeader)
import { SummaryView } from "@/components/kanban/SummaryView";

const GROUP_VALUES: readonly TableGroupBy[] = ["column", "assignee", "label"];
const SORT_VALUES: readonly TableSort[] = ["due", "created", "updated", "position"];
/** Asia/Bangkok = UTC+7 ตายตัว (ไม่มี DST) — คำนวณเอง ห้าม toLocale* ตามกติกาทั้งโมดูล */
const BKK_OFFSET_MS = 7 * 60 * 60 * 1000;
const DAY_MS = 86_400_000;

/** ปี/เดือน(0-11) ตามเวลาไทยของ `ms` — ใช้ตั้งค่าปริยายของ `?month=` เมื่อไม่ได้ระบุ/ระบุผิดรูปแบบ */
function bkkYearMonth(ms: number): { year: number; month: number } {
  const d = new Date(ms + BKK_OFFSET_MS);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() };
}

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
    column?: string;
    view?: string;
    group?: string;
    sort?: string;
    page?: string;
    month?: string;
    mode?: string;
    ext?: string;
    // K2.5 — โหลดมุมมองที่บันทึกไว้ (§2.3) · merge ด้านล่าง: พารามิเตอร์ที่ผู้ใช้ส่งมาเอง "ทับ" ค่าจาก config
    savedView?: string;
  }>;
}) {
  const [{ id, boardId }, rawQuery] = await Promise.all([params, searchParams]);
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

  // K2.5 — `?savedView=` โหลด config แล้ว "ใช้เป็นพารามิเตอร์จริง": เฉพาะแกนที่ผู้ใช้ **ไม่ได้** ระบุเอง
  // ใน URL จึงรับค่าจากมุมมองที่บันทึกไว้ (พารามิเตอร์ที่ผู้ใช้ส่งมาทับ config เสมอ ตามสัญญา §K2.5)
  // มุมมองถูกลบ/ไม่มีสิทธิ์เห็นแล้ว → เพิกเฉยเงียบ ๆ ใช้ URL ตามปกติ (ไม่ทำทั้งหน้าเด้ง 404 เพราะลิงก์เก่า)
  let query = rawQuery;
  if (rawQuery.savedView) {
    const applied = await applyView(ctx, actor, rawQuery.savedView).catch(() => null);
    if (applied) {
      query = {
        ...rawQuery,
        view: rawQuery.view ?? (applied.view !== "board" ? applied.view : undefined),
        assignee: rawQuery.assignee ?? applied.filters.assignee,
        label: rawQuery.label ?? applied.filters.label,
        due: rawQuery.due ?? applied.filters.due,
        status: rawQuery.status ?? applied.filters.status,
        q: rawQuery.q ?? applied.filters.q,
        column: rawQuery.column ?? applied.filters.column,
        sort: rawQuery.sort ?? applied.sort,
        group: rawQuery.group ?? applied.group,
      };
    }
  }
  const savedViews = await listViews(ctx, actor, boardId).catch(() => []);

  const filters = boardFiltersFromParams(query);
  const view =
    query.view === "table" ? "table" : query.view === "calendar" ? "calendar" : query.view === "summary" ? "summary" : "board";

  if (view === "calendar") {
    const nowMs = Date.parse(board.now);
    const monthMatch = /^(\d{4})-(\d{2})$/.exec(query.month ?? "");
    const fallback = bkkYearMonth(nowMs);
    const year = monthMatch ? Number(monthMatch[1]) : fallback.year;
    const month = monthMatch ? Number(monthMatch[2]) - 1 : fallback.month; // 0-11 ภายใน
    const mode = query.mode === "week" ? "week" : "month";
    const ext = query.ext === "1";
    // ช่วง = เดือนที่เลือก ±6 วัน (สัญญา K2.2) — พอครอบตารางเดือน 6 สัปดาห์เต็มเสมอไม่ว่าเดือนเริ่มวันไหน
    const monthStartMs = Date.UTC(year, month, 1) - BKK_OFFSET_MS;
    const monthEndMs = Date.UTC(year, month + 1, 1) - BKK_OFFSET_MS;
    const from = new Date(monthStartMs - 6 * DAY_MS);
    const to = new Date(monthEndMs + 6 * DAY_MS);
    const data = await listBoardCalendar(ctx, actor, boardId, { from, to, now: new Date(board.now), filters, includeExternal: ext });
    const monthKey = `${year}-${String(month + 1).padStart(2, "0")}`;
    return <CalendarView board={board} data={data} filters={filters} month={monthKey} mode={mode} ext={ext} savedViews={savedViews} />;
  }

  if (view === "summary") {
    const data = await boardSummary(ctx, actor, boardId, { now: new Date(board.now), filters });
    return <SummaryView board={board} data={data} filters={filters} savedViews={savedViews} />;
  }

  if (view === "table") {
    const group = GROUP_VALUES.includes(query.group as TableGroupBy) ? (query.group as TableGroupBy) : undefined;
    const sort = SORT_VALUES.includes(query.sort as TableSort) ? (query.sort as TableSort) : "position";
    const page = Math.max(1, parseInt(query.page ?? "1", 10) || 1);
    // จัดกลุ่มแล้วโชว์ครบทุกใบต่อกลุ่ม ไม่ตัดหน้า (แบ่งหน้าไม่มีความหมายเมื่อดูเป็นกลุ่ม) — ยกเว้นบอร์ดใหญ่ผิดปกติ
    const table = await listBoardTable(ctx, actor, boardId, { now: new Date(board.now), filters, group, sort, page, ...(group ? { pageSize: 2000 } : {}) });
    return <TableView board={board} table={table} filters={filters} group={group} sort={sort} page={page} savedViews={savedViews} />;
  }

  const prefs = await getUserPreferences(auth.user.id);
  return (
    <BoardView
      board={board}
      initialCardId={query.card ?? null}
      filters={filters}
      shortcutsEnabled={prefs.kanbanShortcuts}
      savedViews={savedViews}
    />
  );
}
