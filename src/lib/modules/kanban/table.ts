// table.ts — มุมมองตาราง `?view=table` (K2.1 · พิมพ์เขียว 13-kanban-v2 §3.4 · สัญญา ledger/KANBAN-RUN.md §K2.1)
//
// อ่านอย่างเดียว (VIEWER+) — กรองการ์ดของบอร์ดเดียวด้วย `filterBoardCards` เดิม (K1.11) แล้วจัด
// กลุ่ม/เรียง/แบ่งหน้าให้พร้อมขึ้นสเปรดชีต
//
// 🔴 ทำไมไม่เรียก `service.getBoardFor`/`getBoardView`: `service.ts` เป็น facade ที่ re-export
//    ฟังก์ชันของไฟล์นี้ออกไปด้วย (ให้หน้าจอ/AI/K2.10 เรียกที่เดียว) ถ้าไฟล์นี้ import กลับเข้า
//    `service.ts` จะเกิด import วนกลับ (service → table → service) ⇒ คุยกับ `prisma`/`members`
//    ตรง ๆ เหมือนที่ `search.ts` ทำกับการค้นหาข้ามบอร์ด (K1.11) แทน
import { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { assertBoardRole } from "./members";
import { filterBoardCards, type BoardFilters, type FilterableCard } from "./filters";
import { fieldsOnCardForCards, listShowOnCardFieldNames } from "./fields";
import { KANBAN_LIMITS } from "./limits";
import type {
  BoardLabelDto,
  BoardPersonDto,
  KanbanActor,
  KanbanCtx,
  KanbanTagColor,
  TableGroupBy,
  TableGroupDto,
  TableRowDto,
  TableSort,
} from "./types";
// re-export ให้ผู้เรียกนอกโมดูล (service.ts/page.tsx) ใช้ชื่อเดิมได้จากที่นี่เหมือนเดิม
export type { TableGroupBy, TableSort } from "./types";

export type ListBoardTableInput = {
  /** เวลาอ้างอิง (จาก server เดียวกับที่ใช้เรนเดอร์ทั้งหน้า — ให้ `filterBoardCards`/ป้ายกำหนดส่งตรงกันเป๊ะ) */
  now: Date;
  filters?: BoardFilters;
  group?: TableGroupBy;
  /** ปริยาย "position" = ลำดับจริงบนบอร์ด (คอลัมน์ซ้าย→ขวา แล้วตำแหน่งในคอลัมน์) */
  sort?: TableSort;
  /** ปริยาย 1 */
  page?: number;
  /** ปริยาย `KANBAN_LIMITS.tablePageSize` */
  pageSize?: number;
};

export type BoardTableResult = {
  rows: TableRowDto[];
  total: number;
  page: number;
  pageSize: number;
  groups?: TableGroupDto[];
  /** K2.6: ชื่อฟิลด์กำหนดเองที่ `showOnCard=true` ของบอร์ด เรียงตาม sortOrder — 1 คอลัมน์ตารางต่อชื่อ */
  customFieldColumns: string[];
};

const NONE_ASSIGNEE_KEY = "none";
const NONE_ASSIGNEE_LABEL = "ไม่มีผู้รับผิดชอบ";
const NONE_LABEL_KEY = "none";
const NONE_LABEL_LABEL = "ไม่มีป้ายกำกับ";

/** แถวการ์ดดิบ + สิ่งที่ต้องรู้ก่อนกรอง (`assignees` ต้องมีครบก่อนเรียก `filterBoardCards` — assignee ที่ 2 ขึ้นไปยังกรองได้) */
type RawTableCard = FilterableCard & {
  cardNo: number | null;
  columnId: string;
  dueAt: Date | null;
  completedAt: Date | null;
  updatedAt: Date;
  /** K2.7: ไม่ null = การ์ดนี้เป็น "แม่" ของงานประจำ — ชิป 🔁 */
  recurrenceRule: string | null;
};

export async function listBoardTable(
  ctx: KanbanCtx,
  actor: KanbanActor,
  boardId: string,
  opts: ListBoardTableInput,
): Promise<BoardTableResult> {
  await assertBoardRole(ctx, boardId, "VIEWER");

  const columns = await prisma.kanbanColumn.findMany({
    where: { boardId, tenantId: ctx.tenantId, systemId: ctx.systemId, status: "ACTIVE" },
    orderBy: [{ position: { sort: "asc", nulls: "first" } }, { sortOrder: "asc" }, { createdAt: "asc" }],
    select: { id: true, name: true },
  });
  const columnName = new Map(columns.map((c) => [c.id, c.name]));
  const columnIndex = new Map(columns.map((c, i) => [c.id, i]));

  const cards = columns.length
    ? await prisma.kanbanCard.findMany({
        where: { boardId, tenantId: ctx.tenantId, systemId: ctx.systemId, status: "ACTIVE" },
        orderBy: [{ position: { sort: "asc", nulls: "first" } }, { sortOrder: "asc" }, { createdAt: "asc" }],
      })
    : [];

  // ทุกการ์ดของบอร์ด (ก่อนกรอง) ต้องรู้จัก "ผู้รับผิดชอบทุกคน" (ไม่ใช่แค่คนแรก) ก่อนส่งเข้า `filterBoardCards`
  // ไม่งั้น filters.assignee = คนที่ 2 ขึ้นไปจะหลุดกรองไปเงียบ ๆ (assigneeUserId เก็บแค่คนแรก)
  const allAssigneeRows = cards.length
    ? await prisma.kanbanCardAssignee.findMany({
        where: { cardId: { in: cards.map((c) => c.id) }, tenantId: ctx.tenantId },
        orderBy: { assignedAt: "asc" },
        select: { cardId: true, userId: true },
      })
    : [];
  const assigneeIdsOfCard = new Map<string, string[]>();
  for (const row of allAssigneeRows) {
    const list = assigneeIdsOfCard.get(row.cardId) ?? [];
    list.push(row.userId);
    assigneeIdsOfCard.set(row.cardId, list);
  }

  // ลำดับ "position" = คอลัมน์ซ้าย→ขวาก่อน แล้วตำแหน่งในคอลัมน์ (คิวรีข้างบนเรียงในคอลัมน์มาแล้ว —
  // เหลือแค่จัดกลุ่มตามลำดับคอลัมน์ด้วย sort ที่เสถียร (JS `Array#sort` เสถียรตาม ECMA-262))
  const ordered: RawTableCard[] = [...cards]
    .sort((a, b) => (columnIndex.get(a.columnId) ?? 0) - (columnIndex.get(b.columnId) ?? 0))
    .map((c) => ({
      ...c,
      assignees: (assigneeIdsOfCard.get(c.id) ?? []).map((userId) => ({ userId })),
    }));

  const filters = opts.filters ?? {};
  const matched = filterBoardCards<RawTableCard>(ordered, filters, { now: opts.now, userId: actor.userId });

  const cardIds = matched.map((c) => c.id);
  const [labelRows, checklistRows, fieldsOnCardByCard, customFieldColumns] = await Promise.all([
    cardIds.length
      ? prisma.kanbanCardLabel.findMany({
          where: { cardId: { in: cardIds }, tenantId: ctx.tenantId },
          include: { label: { select: { id: true, name: true, color: true } } },
        })
      : Promise.resolve([]),
    cardIds.length
      ? prisma.$queryRaw<{ cardId: string; total: bigint; done: bigint }[]>`
          SELECT ch."cardId" as "cardId",
                 COUNT(i.id) as total,
                 COUNT(i.id) FILTER (WHERE i.done) as done
          FROM "KanbanChecklist" ch
          JOIN "KanbanChecklistItem" i ON i."checklistId" = ch.id
          WHERE ch."cardId" IN (${Prisma.join(cardIds)})
          GROUP BY ch."cardId"
        `
      : Promise.resolve([] as { cardId: string; total: bigint; done: bigint }[]),
    // K2.6: ชิปฟิลด์กำหนดเองต่อการ์ด (คิวรีเดียว กัน N+1) + ชื่อคอลัมน์ฟิลด์ของบอร์ดสำหรับหัวตาราง
    fieldsOnCardForCards(ctx.tenantId, boardId, cardIds),
    listShowOnCardFieldNames(ctx.tenantId, boardId),
  ]);

  const matchedAssigneeIds = Array.from(new Set(cardIds.flatMap((id) => assigneeIdsOfCard.get(id) ?? [])));
  const users = matchedAssigneeIds.length
    ? await prisma.user.findMany({ where: { id: { in: matchedAssigneeIds } }, select: { id: true, name: true, email: true } })
    : [];
  const nameOf = new Map(users.map((u) => [u.id, u.name ?? u.email ?? u.id]));

  const labelsOfCard = new Map<string, BoardLabelDto[]>();
  for (const row of labelRows) {
    const list = labelsOfCard.get(row.cardId) ?? [];
    list.push({ id: row.label.id, name: row.label.name, color: row.label.color as KanbanTagColor });
    labelsOfCard.set(row.cardId, list);
  }
  const checklistOfCard = new Map(checklistRows.map((r) => [r.cardId, { done: Number(r.done), total: Number(r.total) }]));

  const rowsAll: TableRowDto[] = matched.map((raw) => {
    const checklist = checklistOfCard.get(raw.id);
    const assignees: BoardPersonDto[] = (assigneeIdsOfCard.get(raw.id) ?? []).map((userId) => ({
      userId,
      name: nameOf.get(userId) ?? userId,
    }));
    return {
      id: raw.id,
      cardNo: raw.cardNo,
      title: raw.title,
      columnId: raw.columnId,
      columnName: columnName.get(raw.columnId) ?? "",
      assignees,
      dueAt: raw.dueAt ? raw.dueAt.toISOString() : null,
      completedAt: raw.completedAt ? raw.completedAt.toISOString() : null,
      checklistDone: checklist?.done ?? 0,
      checklistTotal: checklist?.total ?? 0,
      labels: labelsOfCard.get(raw.id) ?? [],
      links: [], // K3.1 ยังไม่มี — คอลัมน์ "เชื่อมระบบ" ว่างจนกว่าจะถึง WO นั้น (สัญญา K2.1)
      updatedAt: raw.updatedAt.toISOString(),
      fieldsOnCard: fieldsOnCardByCard.get(raw.id) ?? [],
      isRecurring: raw.recurrenceRule != null,
    };
  });

  const sorted = sortRows(rowsAll, opts.sort ?? "position");

  const page = Math.max(1, Math.floor(opts.page ?? 1));
  const pageSize = Math.max(1, Math.floor(opts.pageSize ?? KANBAN_LIMITS.tablePageSize));
  const start = (page - 1) * pageSize;
  const rows = sorted.slice(start, start + pageSize);

  const result: BoardTableResult = { rows, total: sorted.length, page, pageSize, customFieldColumns };
  if (opts.group) result.groups = groupRows(sorted, opts.group, columns);
  return result;
}

/** เรียงแถวที่กรองแล้ว — `position` คงลำดับเดิม (คือลำดับที่ส่งเข้ามา) ตัวอื่นเรียงใหม่แบบเสถียร (ผูก index เดิมกันคะแนนเท่ากัน) */
function sortRows(rows: readonly TableRowDto[], sort: TableSort): TableRowDto[] {
  if (sort === "position") return [...rows];
  const withIndex = rows.map((r, i) => ({ r, i }));
  withIndex.sort((a, b) => {
    switch (sort) {
      case "due": {
        // ไม่กำหนดอยู่ท้ายเสมอ (สัญญา K2.1) — เทียบเวลาที่ parse แล้วก่อน ตกลำดับเดิมเมื่อเท่ากัน
        const at = a.r.dueAt ? Date.parse(a.r.dueAt) : null;
        const bt = b.r.dueAt ? Date.parse(b.r.dueAt) : null;
        if (at === null && bt === null) return a.i - b.i;
        if (at === null) return 1;
        if (bt === null) return -1;
        return at - bt || a.i - b.i;
      }
      case "created":
        // ไม่มี createdAt ใน DTO นี้ (งบประสิทธิภาพเดียวกับ §12.1) — cardNo เรียงตามลำดับสร้างเป๊ะ (D14)
        // ใหม่สุดก่อน (ธรรมชาติของตาราง: งานที่เพิ่งเข้ามาอยู่บนสุด)
        return (b.r.cardNo ?? 0) - (a.r.cardNo ?? 0) || a.i - b.i;
      case "updated":
        return Date.parse(b.r.updatedAt) - Date.parse(a.r.updatedAt) || a.i - b.i;
      default:
        return a.i - b.i;
    }
  });
  return withIndex.map((x) => x.r);
}

function groupRows(rows: readonly TableRowDto[], group: TableGroupBy, columns: { id: string; name: string }[]): TableGroupDto[] {
  if (group === "column") {
    const byColumn = new Map<string, string[]>();
    for (const r of rows) byColumn.set(r.columnId, [...(byColumn.get(r.columnId) ?? []), r.id]);
    return columns.map((c) => ({ key: c.id, label: c.name, rowIds: byColumn.get(c.id) ?? [] }));
  }
  if (group === "assignee") {
    const byUser = new Map<string, { label: string; ids: string[] }>();
    const none: string[] = [];
    for (const r of rows) {
      if (r.assignees.length === 0) {
        none.push(r.id);
        continue;
      }
      for (const a of r.assignees) {
        const entry = byUser.get(a.userId) ?? { label: a.name, ids: [] };
        entry.ids.push(r.id);
        byUser.set(a.userId, entry);
      }
    }
    const groups: TableGroupDto[] = Array.from(byUser.entries()).map(([userId, v]) => ({ key: userId, label: v.label, rowIds: v.ids }));
    groups.push({ key: NONE_ASSIGNEE_KEY, label: NONE_ASSIGNEE_LABEL, rowIds: none });
    return groups;
  }
  // group === "label"
  const byLabel = new Map<string, { label: string; ids: string[] }>();
  const none: string[] = [];
  for (const r of rows) {
    if (r.labels.length === 0) {
      none.push(r.id);
      continue;
    }
    for (const l of r.labels) {
      const entry = byLabel.get(l.id) ?? { label: l.name, ids: [] };
      entry.ids.push(r.id);
      byLabel.set(l.id, entry);
    }
  }
  const groups: TableGroupDto[] = Array.from(byLabel.entries()).map(([id, v]) => ({ key: id, label: v.label, rowIds: v.ids }));
  groups.push({ key: NONE_LABEL_KEY, label: NONE_LABEL_LABEL, rowIds: none });
  return groups;
}
