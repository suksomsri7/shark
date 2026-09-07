// reports.ts — รายงาน + ส่งออกของบอร์ดงาน (เริ่มไฟล์นี้ใน K2.1 · `exportCardsCsv` ตามสัญญา §K2.1
// § 5.6 พิมพ์เขียว: `openCards`/`overdue`/`workload`/`throughput`/`aging` เติมใน K2.10 — พิมพ์เขียว §3.7/§11.10)
//
// 🔴 `exportCardsCsv` เดิม (K2.1) ไม่แตะ prisma ตรง ๆ — พึ่ง `listBoardTable` ให้กรอง/เรียง/join ให้ครบ
// 🔴 ฟังก์ชันรายงาน 5 ตัวของ K2.10 แตะ prisma ตรง (`./db` เท่านั้น — chokepoint F5): "รายงานคิวรีสด" (§11.10
//    ห้ามตาราง summary) ⇒ ต้องคุมเองว่าทุกคิวรีมี where tenantId+systemId+status ครบและ select เฉพาะที่ใช้
//    (งบประสิทธิภาพ §12.1 · ข้อสอบ S7.1/S7.2) — ขอบเขตบอร์ดผ่าน `visibleBoardsWhere(actor)` ของ access.ts
//    เสมอ (ห้ามเขียนตรรกะสิทธิ์ซ้ำ) · เวลาไทยผ่าน `dueBucketOf`/`dayIndexOf`/`bkkDayStartMs` ของ filters.ts
//    (ห้ามใช้ตัวอ่านวันในสัปดาห์ตรงจาก Date แบบ local/Intl — ต้องเลื่อน +07:00 ก่อนเสมอ · `reference_thai_date_getday_trap`)
import { csvRow } from "@/lib/core/csv";
import { canViewReports, KanbanForbiddenError, KanbanNotFoundError, visibleBoardsWhere } from "./access";
import { prisma } from "./db";
import { BKK_OFFSET_MS, bkkDayStartMs, dayIndexOf, dueBucketOf } from "./filters";
import { listBoardTable } from "./table";
import type { BoardFilters } from "./filters";
import type {
  KanbanActor,
  KanbanCtx,
  ReportAgingBucketKey,
  ReportAgingColumnDto,
  ReportAgingDto,
  ReportKind,
  ReportOpenBoardDto,
  ReportOpenCardsDto,
  ReportOverdueDto,
  ReportOverdueRowDto,
  ReportThroughputWeekDto,
  ReportWorkloadDto,
  ReportWorkloadRowDto,
} from "./types";

const CSV_BOM = "﻿";
const CSV_HEADER = ["#", "การ์ด", "คอลัมน์", "ผู้รับผิดชอบ", "กำหนดส่ง", "เช็คลิสต์", "ป้ายกำกับ", "แก้ไขล่าสุด"];

// BKK_OFFSET_MS มาจาก import ของ filters.ts (ตัวเดียวกันทั้งโมดูล — ห้ามประกาศซ้ำ) — Asia/Bangkok = UTC+7 ตายตัว
const DAY_MS = 24 * 60 * 60 * 1000;
const pad2 = (n: number) => (n < 10 ? `0${n}` : String(n));

/** "5/9/2569 18:00" — วันที่ไทย พ.ศ. (คำนวณเองล้วน ไม่พึ่งตัวจัดรูปแบบวันที่ของเบราว์เซอร์/Node ตามกติกาของโมดูล) */
function thaiDateTime(iso: string | null): string {
  if (!iso) return "";
  const ms = Date.parse(iso) + BKK_OFFSET_MS;
  const d = new Date(ms);
  const day = d.getUTCDate();
  const month = d.getUTCMonth() + 1;
  const year = d.getUTCFullYear() + 543;
  return `${day}/${month}/${year} ${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}`;
}

export type ExportCardsCsvInput = { now: Date; filters?: BoardFilters };

/**
 * ส่งออกการ์ดของบอร์ด (ตามตัวกรองปัจจุบัน) เป็น CSV — BOM UTF-8 ให้ Excel เปิดภาษาไทยไม่เพี้ยน
 * ดึง "ทุกแถวที่ตรงตัวกรอง" (ไม่ใช่แค่หน้าปัจจุบันของตาราง) เรียงตามลำดับบนบอร์ด
 */
export async function exportCardsCsv(
  ctx: KanbanCtx,
  actor: KanbanActor,
  boardId: string,
  opts: ExportCardsCsvInput,
): Promise<string> {
  const { rows } = await listBoardTable(ctx, actor, boardId, {
    now: opts.now,
    filters: opts.filters ?? {},
    page: 1,
    // ไม่มีเพดานจำนวนการ์ด/บอร์ดในระบบ (D4) ⇒ ขอมาให้ครบทุกแถวที่กรองได้ในเที่ยวเดียว
    pageSize: 1_000_000,
  });

  const lines = [csvRow(CSV_HEADER)];
  for (const r of rows) {
    lines.push(
      csvRow([
        r.cardNo,
        r.title,
        r.columnName,
        r.assignees.map((a) => a.name).join("; "),
        thaiDateTime(r.dueAt),
        r.checklistTotal > 0 ? `${r.checklistDone}/${r.checklistTotal}` : "",
        r.labels.map((l) => l.name).join("; "),
        thaiDateTime(r.updatedAt),
      ]),
    );
  }
  return CSV_BOM + lines.join("\n");
}

// ═══════════════════════════════ K2.10 — รายงาน 5 ตัว ═══════════════════════════════
//
// ทุกฟังก์ชันรับ `(ctx, actor, { now, boardId? })` — `actor` มาจากผู้เรียกตรง ๆ (ไม่ใช่ `ctx.actor`/
// `loadActor()`): หน้าจอ/action ประกอบ actor จาก session แล้วส่งเข้ามา ⇒ ทดสอบสิทธิ์ได้โดยไม่ต้องพึ่ง DB
// (oracle override `actor.permissions` ในหน่วยความจำได้ตรง ๆ — ห้ามฟังก์ชันพวกนี้ไปอ่าน Membership ซ้ำ)

const NONE_KEY = "none";
const NONE_ASSIGNEE_LABEL = "ไม่มีผู้รับผิดชอบ";

/** ด่านสิทธิ์เดียวของทุกรายงาน — ดู `canViewReports()` ของ access.ts สำหรับกติกาเต็ม */
export function assertReportAccess(actor: KanbanActor): void {
  if (!canViewReports(actor)) {
    throw new KanbanForbiddenError('ต้องมีสิทธิ์ "ดูรายงาน" ถึงจะดูหน้านี้ได้ — ขอให้เจ้าของร้านเปิดสิทธิ์ให้ก่อน');
  }
}

export type ReportBaseInput = { now: Date; boardId?: string };

/**
 * บอร์ด ACTIVE ที่ `actor` มองเห็น (`visibleBoardsWhere`) — ระบุ `boardId` = กรองเหลือใบเดียว
 * `boardId` ที่มองไม่เห็น/ไม่มีจริง → `KanbanNotFoundError` (§6.3 — ห้ามยืนยันว่าบอร์ดลับมีจริง)
 */
async function scopedBoards(ctx: KanbanCtx, actor: KanbanActor, boardId?: string): Promise<{ id: string; name: string }[]> {
  const boards = await prisma.kanbanBoard.findMany({
    where: { AND: [{ tenantId: ctx.tenantId, systemId: ctx.systemId, status: "ACTIVE" }, visibleBoardsWhere(actor)] },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  if (!boardId) return boards;
  const found = boards.find((b) => b.id === boardId);
  if (!found) throw new KanbanNotFoundError();
  return [found];
}

// ───────────────────────── openCards — ค้าง ─────────────────────────

/** ค้าง (`completedAt` null) ต่อบอร์ดที่มองเห็น + วันนี้/สัปดาห์นี้ตามปฏิทินไทยของ `now` */
export async function openCards(ctx: KanbanCtx, actor: KanbanActor, opts: ReportBaseInput): Promise<ReportOpenCardsDto> {
  assertReportAccess(actor);
  const boards = await scopedBoards(ctx, actor, opts.boardId);
  const boardIds = boards.map((b) => b.id);
  if (boardIds.length === 0) return { total: 0, overdue: 0, byBoard: [] };

  const cards = await prisma.kanbanCard.findMany({
    where: {
      tenantId: ctx.tenantId,
      systemId: ctx.systemId,
      status: "ACTIVE",
      board: { status: "ACTIVE" },
      boardId: { in: boardIds },
      completedAt: null,
    },
    select: { boardId: true, dueAt: true },
  });

  const nowMs = opts.now.getTime();
  const agg = new Map(boards.map((b) => [b.id, { open: 0, overdue: 0, dueToday: 0, dueWeek: 0 }]));
  for (const c of cards) {
    const rec = agg.get(c.boardId);
    if (!rec) continue;
    rec.open++;
    const bucket = dueBucketOf({ id: "", title: "", dueAt: c.dueAt, completedAt: null }, nowMs);
    if (bucket === "overdue") rec.overdue++;
    else if (bucket === "today") rec.dueToday++;
    else if (bucket === "week") rec.dueWeek++;
  }

  const byBoard: ReportOpenBoardDto[] = boards.map((b) => {
    const rec = agg.get(b.id)!;
    return { boardId: b.id, boardName: b.name, open: rec.open, overdue: rec.overdue, dueToday: rec.dueToday, dueWeek: rec.dueWeek };
  });
  return {
    total: byBoard.reduce((n, b) => n + b.open, 0),
    overdue: byBoard.reduce((n, b) => n + b.overdue, 0),
    byBoard,
  };
}

// ───────────────────────── overdue — เลยกำหนด ─────────────────────────

/** เลยกำหนด (ค้าง + `dueAt < now`) เรียงเลยนานสุดก่อน — `take: 500` (§12.1) · `total` = จำนวนจริงทั้งหมด */
export async function overdue(ctx: KanbanCtx, actor: KanbanActor, opts: ReportBaseInput): Promise<ReportOverdueDto> {
  assertReportAccess(actor);
  const boards = await scopedBoards(ctx, actor, opts.boardId);
  const boardIds = boards.map((b) => b.id);
  if (boardIds.length === 0) return { total: 0, rows: [] };
  const boardNameOf = new Map(boards.map((b) => [b.id, b.name]));

  const where = {
    tenantId: ctx.tenantId,
    systemId: ctx.systemId,
    status: "ACTIVE" as const,
    board: { status: "ACTIVE" as const },
    boardId: { in: boardIds },
    completedAt: null,
    dueAt: { lt: opts.now },
  };

  const [total, cards] = await Promise.all([
    prisma.kanbanCard.count({ where }),
    prisma.kanbanCard.findMany({
      where,
      select: {
        id: true,
        cardNo: true,
        title: true,
        boardId: true,
        dueAt: true,
        column: { select: { name: true } },
        assignees: { select: { userId: true } },
      },
      orderBy: { dueAt: "asc" },
      take: 500,
    }),
  ]);

  const userIds = Array.from(new Set(cards.flatMap((c) => c.assignees.map((a) => a.userId))));
  const users = userIds.length
    ? await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true, email: true } })
    : [];
  const nameOf = new Map(users.map((u) => [u.id, u.name ?? u.email ?? u.id]));

  const nowDay = dayIndexOf(opts.now.getTime());
  const rows: ReportOverdueRowDto[] = cards.map((c) => ({
    cardId: c.id,
    cardNo: c.cardNo,
    title: c.title,
    boardId: c.boardId,
    boardName: boardNameOf.get(c.boardId) ?? "",
    columnName: c.column.name,
    dueAt: c.dueAt!.toISOString(),
    daysOverdue: Math.max(0, nowDay - dayIndexOf(c.dueAt!.getTime())),
    assignees: c.assignees.map((a) => ({ userId: a.userId, name: nameOf.get(a.userId) ?? a.userId })),
  }));

  return { total, rows };
}

// ───────────────────────── workload — ภาระงาน ─────────────────────────

/** ภาระงานต่อคน (การ์ดหลายผู้รับผิดชอบนับให้ทุกคน) — เรียง `open` มากก่อน */
export async function workload(ctx: KanbanCtx, actor: KanbanActor, opts: ReportBaseInput): Promise<ReportWorkloadDto> {
  assertReportAccess(actor);
  const boards = await scopedBoards(ctx, actor, opts.boardId);
  const boardIds = boards.map((b) => b.id);
  if (boardIds.length === 0) return { rows: [] };

  const nowMs = opts.now.getTime();
  const since30 = new Date(nowMs - 30 * DAY_MS);
  const boardActiveWhere = { tenantId: ctx.tenantId, systemId: ctx.systemId, status: "ACTIVE" as const, board: { status: "ACTIVE" as const }, boardId: { in: boardIds } };

  const [openRows, doneRows] = await Promise.all([
    prisma.kanbanCard.findMany({
      where: { ...boardActiveWhere, completedAt: null },
      select: { dueAt: true, assignees: { select: { userId: true } } },
    }),
    prisma.kanbanCard.findMany({
      where: { ...boardActiveWhere, completedAt: { gte: since30, lte: opts.now } },
      select: { assignees: { select: { userId: true } } },
    }),
  ]);

  type Stat = { open: number; overdue: number; dueWeek: number; done30d: number };
  const stat = new Map<string, Stat>();
  const touch = (uid: string): Stat => stat.get(uid) ?? { open: 0, overdue: 0, dueWeek: 0, done30d: 0 };
  const idsOf = (assignees: { userId: string }[]): string[] => (assignees.length ? assignees.map((a) => a.userId) : [NONE_KEY]);

  for (const c of openRows) {
    const bucket = dueBucketOf({ id: "", title: "", dueAt: c.dueAt, completedAt: null }, nowMs);
    for (const uid of idsOf(c.assignees)) {
      const rec = touch(uid);
      rec.open++;
      if (bucket === "overdue") rec.overdue++;
      if (bucket === "week") rec.dueWeek++;
      stat.set(uid, rec);
    }
  }
  for (const c of doneRows) {
    for (const uid of idsOf(c.assignees)) {
      const rec = touch(uid);
      rec.done30d++;
      stat.set(uid, rec);
    }
  }

  const userIds = [...stat.keys()].filter((k) => k !== NONE_KEY);
  const users = userIds.length
    ? await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true, email: true } })
    : [];
  const nameOf = new Map(users.map((u) => [u.id, u.name ?? u.email ?? u.id]));

  const rows: ReportWorkloadRowDto[] = [...stat.entries()]
    .map(([userId, rec]) => ({
      userId,
      name: userId === NONE_KEY ? NONE_ASSIGNEE_LABEL : (nameOf.get(userId) ?? userId),
      open: rec.open,
      overdue: rec.overdue,
      dueWeek: rec.dueWeek,
      done30d: rec.done30d,
    }))
    .sort((a, b) => b.open - a.open || a.name.localeCompare(b.name, "th"));

  return { rows };
}

// ───────────────────────── throughput — ผลงานรายสัปดาห์ ─────────────────────────

/** "YYYY-MM-DD" ของวันไทยที่ `dayIndex` (ตัวผกผันของ `dayIndexOf` — ผ่าน `bkkDayStartMs` แล้วอ่านฟิลด์ UTC) */
function dateKeyOfDayIndex(dayIndex: number): string {
  const d = new Date(bkkDayStartMs(dayIndex) + BKK_OFFSET_MS);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** สร้าง/เสร็จรายสัปดาห์ (จันทร์ไทย) — สัปดาห์นี้อยู่ท้าย · `weeks` ตัดที่ 52 (ปริยาย 12) */
export async function throughput(
  ctx: KanbanCtx,
  actor: KanbanActor,
  opts: ReportBaseInput & { weeks?: number },
): Promise<ReportThroughputWeekDto[]> {
  assertReportAccess(actor);
  const boards = await scopedBoards(ctx, actor, opts.boardId);
  const boardIds = boards.map((b) => b.id);
  const weeks = Math.min(Math.max(1, Math.floor(opts.weeks ?? 12)), 52);

  const nowMs = opts.now.getTime();
  const nowDay = dayIndexOf(nowMs);
  // สูตรเดียวกับ `summary.ts`/`my-tasks.ts` (จันทร์–อาทิตย์ ปฏิทินไทย) — อ่านวันในสัปดาห์บนเวลาที่เลื่อน +07:00 แล้วเท่านั้น
  const nowWeekday = new Date(nowMs + BKK_OFFSET_MS).getUTCDay(); // 0 = อาทิตย์
  const mondayOffset = (nowWeekday + 6) % 7;
  const thisWeekStartDay = nowDay - mondayOffset;
  const rangeStartDay = thisWeekStartDay - (weeks - 1) * 7;
  const rangeStartMs = bkkDayStartMs(rangeStartDay);
  const rangeEndMs = bkkDayStartMs(thisWeekStartDay + 7);

  const boardActiveWhere = { tenantId: ctx.tenantId, systemId: ctx.systemId, status: "ACTIVE" as const, board: { status: "ACTIVE" as const }, boardId: { in: boardIds } };
  const [createdRows, completedRows] = boardIds.length
    ? await Promise.all([
        prisma.kanbanCard.findMany({
          where: { ...boardActiveWhere, createdAt: { gte: new Date(rangeStartMs), lt: new Date(rangeEndMs) } },
          select: { createdAt: true },
        }),
        prisma.kanbanCard.findMany({
          where: { ...boardActiveWhere, completedAt: { gte: new Date(rangeStartMs), lt: new Date(rangeEndMs) } },
          select: { completedAt: true },
        }),
      ])
    : [[], []];

  const weeksOut: ReportThroughputWeekDto[] = [];
  for (let i = 0; i < weeks; i++) {
    const weekStartDay = rangeStartDay + i * 7;
    const weekStartMs = bkkDayStartMs(weekStartDay);
    const weekEndMs = bkkDayStartMs(weekStartDay + 7);
    const created = createdRows.filter((r) => r.createdAt.getTime() >= weekStartMs && r.createdAt.getTime() < weekEndMs).length;
    const completed = completedRows.filter((r) => r.completedAt !== null && r.completedAt.getTime() >= weekStartMs && r.completedAt.getTime() < weekEndMs).length;
    weeksOut.push({ weekStart: dateKeyOfDayIndex(weekStartDay), created, completed });
  }
  return weeksOut;
}

// ───────────────────────── aging — อายุงาน ─────────────────────────

const AGE_BUCKETS: { key: ReportAgingBucketKey; label: string }[] = [
  { key: "0-7", label: "0–7 วัน" },
  { key: "8-14", label: "8–14 วัน" },
  { key: "15-30", label: "15–30 วัน" },
  { key: "31+", label: "มากกว่า 30 วัน" },
];

function ageBucketOf(days: number): ReportAgingBucketKey {
  if (days <= 7) return "0-7";
  if (days <= 14) return "8-14";
  if (days <= 30) return "15-30";
  return "31+";
}

/** อายุของการ์ดค้าง (วันเต็มจาก `createdAt` ถึง `now`) — บั๊กเก็ต 4 ช่วง + เฉลี่ย/สูงสุดต่อคอลัมน์ (`byColumn` เรียง `avgDays` มากก่อน) */
export async function aging(ctx: KanbanCtx, actor: KanbanActor, opts: ReportBaseInput): Promise<ReportAgingDto> {
  assertReportAccess(actor);
  const boards = await scopedBoards(ctx, actor, opts.boardId);
  const boardIds = boards.map((b) => b.id);
  const emptyBuckets = AGE_BUCKETS.map((b) => ({ key: b.key, label: b.label, count: 0 }));
  if (boardIds.length === 0) return { buckets: emptyBuckets, byColumn: [] };
  const boardNameOf = new Map(boards.map((b) => [b.id, b.name]));

  const [cards, columns] = await Promise.all([
    prisma.kanbanCard.findMany({
      where: {
        tenantId: ctx.tenantId,
        systemId: ctx.systemId,
        status: "ACTIVE",
        board: { status: "ACTIVE" },
        boardId: { in: boardIds },
        completedAt: null,
      },
      select: { boardId: true, columnId: true, createdAt: true },
    }),
    prisma.kanbanColumn.findMany({
      where: { tenantId: ctx.tenantId, systemId: ctx.systemId, status: "ACTIVE", boardId: { in: boardIds } },
      select: { id: true, name: true },
    }),
  ]);
  const columnNameOf = new Map(columns.map((c) => [c.id, c.name]));

  const nowMs = opts.now.getTime();
  const bucketCount: Record<ReportAgingBucketKey, number> = { "0-7": 0, "8-14": 0, "15-30": 0, "31+": 0 };
  const byCol = new Map<string, { boardId: string; columnId: string; sum: number; max: number; count: number }>();
  for (const c of cards) {
    const days = Math.max(0, Math.floor((nowMs - c.createdAt.getTime()) / DAY_MS));
    bucketCount[ageBucketOf(days)]++;
    const key = `${c.boardId}::${c.columnId}`;
    const rec = byCol.get(key) ?? { boardId: c.boardId, columnId: c.columnId, sum: 0, max: 0, count: 0 };
    rec.sum += days;
    rec.count++;
    rec.max = Math.max(rec.max, days);
    byCol.set(key, rec);
  }

  const byColumn: ReportAgingColumnDto[] = [...byCol.values()]
    .map((r) => ({
      boardId: r.boardId,
      boardName: boardNameOf.get(r.boardId) ?? "",
      columnName: columnNameOf.get(r.columnId) ?? "",
      open: r.count,
      avgDays: Math.round((r.sum / r.count) * 10) / 10,
      maxDays: r.max,
    }))
    .sort((a, b) => b.avgDays - a.avgDays);

  return {
    buckets: AGE_BUCKETS.map((b) => ({ key: b.key, label: b.label, count: bucketCount[b.key] })),
    byColumn,
  };
}

// ───────────────────────── ส่งออก CSV ─────────────────────────

/** ส่งออกรายงาน 1 ใน 4 ชนิด (ไม่รวม "ค้าง" — เป็นภาพรวมของอีก 4 อยู่แล้ว) เป็น CSV — BOM + หัวไทย ผ่าน `csvRow`/`csvCell` (`@/lib/core/csv`) */
export async function exportReportCsv(
  ctx: KanbanCtx,
  actor: KanbanActor,
  kind: ReportKind,
  opts: ReportBaseInput,
): Promise<string> {
  assertReportAccess(actor);

  if (kind === "overdue") {
    const data = await overdue(ctx, actor, opts);
    const lines = [csvRow(["#", "การ์ด", "บอร์ด", "คอลัมน์", "กำหนดส่ง", "เลยมาแล้ว (วัน)", "ผู้รับผิดชอบ"])];
    for (const r of data.rows) {
      lines.push(csvRow([r.cardNo, r.title, r.boardName, r.columnName, thaiDateTime(r.dueAt), r.daysOverdue, r.assignees.map((a) => a.name).join("; ")]));
    }
    return CSV_BOM + lines.join("\n");
  }

  if (kind === "workload") {
    const data = await workload(ctx, actor, opts);
    const lines = [csvRow(["ผู้รับผิดชอบ", "ค้าง", "เลยกำหนด", "สัปดาห์นี้", "เสร็จใน 30 วันล่าสุด"])];
    for (const r of data.rows) lines.push(csvRow([r.name, r.open, r.overdue, r.dueWeek, r.done30d]));
    return CSV_BOM + lines.join("\n");
  }

  if (kind === "throughput") {
    const weeks = await throughput(ctx, actor, { now: opts.now, boardId: opts.boardId });
    const lines = [csvRow(["สัปดาห์เริ่ม (จันทร์)", "สร้างใหม่", "เสร็จแล้ว"])];
    for (const w of weeks) lines.push(csvRow([w.weekStart, w.created, w.completed]));
    return CSV_BOM + lines.join("\n");
  }

  if (kind === "aging") {
    const data = await aging(ctx, actor, opts);
    const lines = [csvRow(["บอร์ด", "คอลัมน์", "จำนวนค้าง", "อายุเฉลี่ย (วัน)", "อายุมากสุด (วัน)"])];
    for (const c of data.byColumn) lines.push(csvRow([c.boardName, c.columnName, c.open, c.avgDays, c.maxDays]));
    return CSV_BOM + lines.join("\n");
  }

  throw new Error(`ชนิดรายงานไม่รู้จัก: "${String(kind)}" — ต้องเป็น overdue / workload / throughput / aging`);
}
