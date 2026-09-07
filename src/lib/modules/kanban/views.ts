// views.ts — มุมมองที่บันทึกไว้ (K2.5 · พิมพ์เขียว 13-kanban-v2 §2.3/§3.10 · สัญญา ledger/KANBAN-RUN.md §K2.5)
//
// PRIVATE = ของคนคนเดียว (`ownerUserId`) — ใครก็สร้างเองได้ (แค่มองเห็นบอร์ด = VIEWER พอ)
// BOARD   = ของทั้งทีม (`ownerUserId` = null) — สร้าง/แก้/ลบได้เฉพาะ ADMIN ของบอร์ดเท่านั้น
//
// 🔴 กติกา 404-not-403: มุมมอง PRIVATE ของคนอื่น = "ไม่พบ" เสมอ (ไม่บอกว่ามีอยู่จริงแต่ไม่ให้ดู)
// 🔴 `boardId` เป็น `String?` ตั้งแต่ schema (K3.8 จะใช้ null = มุมมองข้ามบอร์ด) — ไฟล์นี้ยังรับเฉพาะ
//    `boardId` ที่ไม่ใช่ null (K2.5 ทำแค่มุมมองต่อบอร์ด) ทุกจุดที่แตะ `row.boardId` จึง narrow เป็น
//    non-null ก่อนเรียก `assertBoardRole`/สร้าง `href` เสมอ

import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { assertBoardRole } from "./members";
import { logActivity } from "./activity-log";
import { KanbanForbiddenError, KanbanNotFoundError } from "./access";
import { KANBAN_LIMITS } from "./limits";
// `hrefForSavedView` เป็นฟังก์ชันบริสุทธิ์ตัวเดียวกับที่ `SavedViewsMenu.tsx` (client) ใช้คำนวณ href
// เอง — เรียกจากที่นี่ด้วยเพื่อไม่ให้ตรรกะสร้าง query string ซ้ำสองที่ (filters.ts ไม่แตะ prisma
// ⇒ server ฝั่งนี้ import ตรง ๆ ได้อย่างปลอดภัย ไม่ใช่ทิศทางที่เสี่ยงบันเดิลฝั่ง browser)
import { hrefForSavedView } from "./filters";
import type { KanbanActor, KanbanCtx, SavedViewDto, ViewConfig, ViewFilters, ViewScope } from "./types";

// ชนิดที่ client component ต้อง `import type` ได้โดยไม่ลาก prisma เข้าบันเดิล อยู่ที่ `types.ts` จริง
// (แบบเดียวกับ K1.11/K1.12/K1.13/K2.1/K2.2/K2.4) — export ซ้ำที่นี่ให้ผู้เรียกยัง
// `import type { ViewConfig } from "@/lib/modules/kanban/views"` ได้เหมือนสัญญา K2.5 เขียนไว้
export type { SavedViewDto, ViewConfig, ViewFilters, ViewScope } from "./types";

// ───────────────────────── ViewConfig (zod · §2.3) ─────────────────────────

const VIEW_KEYS = ["board", "table", "calendar", "summary", "timeline"] as const;
const DUE_KEYS = ["overdue", "today", "week", "none"] as const;
const STATUS_KEYS = ["done", "open"] as const;

/** คีย์แปลกที่ผู้เรียกยัดมา (client เก่า/มือทดสอบ) ถูกตัดทิ้งเงียบ ๆ — zod `.object()` strip โดยปริยาย (ไม่ `.strict()`) */
const ViewFiltersSchema = z
  .object({
    assignee: z.string().min(1).max(80).optional(),
    label: z.string().min(1).max(80).optional(),
    due: z.enum(DUE_KEYS).optional(),
    status: z.enum(STATUS_KEYS).optional(),
    q: z.string().min(1).max(200).optional(),
    column: z.string().min(1).max(80).optional(),
  })
  .partial();

const ViewConfigSchema = z.object({
  view: z.enum(VIEW_KEYS),
  filters: ViewFiltersSchema.optional(),
  sort: z.string().min(1).max(40).optional(),
  group: z.string().min(1).max(40).optional(),
  // K2.3 — ระดับซูมของมุมมองไทม์ไลน์ (week/month/quarter) เก็บกว้าง ๆ เหมือน sort/group เดิม
  zoom: z.string().min(1).max(40).optional(),
});

/** ตรวจรูป config ด้วย zod — ผิดรูป/`view` ไม่รู้จัก → throw ข้อความไทย (ไม่มีวันปล่อย ZodError ดิบออกไป)
 * zod schema กับ `ViewConfig`/`ViewFilters` (types.ts) เป็นรูปเดียวกันเป๊ะ — cast โครงสร้างล้วน ไม่ใช่ any */
function parseViewConfig(raw: unknown): ViewConfig {
  const parsed = ViewConfigSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error('รูปแบบมุมมองไม่ถูกต้อง — ต้องระบุ "แสดงเป็น" ให้ถูกต้อง (บอร์ด/ตาราง/ปฏิทิน/สรุป/ไทม์ไลน์)');
  }
  return parsed.data as ViewConfig;
}

const NAME_MAX = 60;

function normalizeViewName(name: string): string {
  const n = name.trim();
  if (!n) throw new Error("ต้องตั้งชื่อมุมมองก่อนจึงบันทึกได้");
  if (n.length > NAME_MAX) throw new Error(`ชื่อมุมมองยาวเกิน ${NAME_MAX} ตัวอักษร — ตั้งให้สั้นลง`);
  return n;
}

// ───────────────────────── DTO ─────────────────────────

type ViewRow = {
  id: string;
  tenantId: string;
  systemId: string;
  boardId: string | null;
  ownerUserId: string | null;
  name: string;
  scope: ViewScope;
  config: Prisma.JsonValue;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
};

function toDto(row: ViewRow): SavedViewDto {
  return {
    id: row.id,
    boardId: row.boardId,
    ownerUserId: row.ownerUserId,
    name: row.name,
    scope: row.scope,
    config: parseViewConfig(row.config), // แถวใน DB ผ่านด่านนี้มาแล้วตอนเขียนเสมอ — parse ซ้ำเพื่อชนิดที่แม่นเท่านั้น
    sortOrder: row.sortOrder,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function actorUserIdOf(ctx: KanbanCtx, actor: KanbanActor): string {
  return ctx.actorUserId ?? actor.userId;
}

// ───────────────────────── อ่าน ─────────────────────────

/**
 * มุมมองที่ actor เห็นของบอร์ดนี้ — ทั้งทีม (BOARD) มาก่อนเสมอ แล้วตามด้วยของตัวเอง (PRIVATE)
 * 🔴 ต้องเห็นบอร์ดก่อน (`assertBoardRole …"VIEWER"`) — บอร์ดที่มองไม่เห็น = 404 เหมือนทุกฟังก์ชันอื่นในโมดูล
 */
export async function listViews(ctx: KanbanCtx, actor: KanbanActor, boardId: string): Promise<SavedViewDto[]> {
  await assertBoardRole(ctx, boardId, "VIEWER");
  const userId = actorUserIdOf(ctx, actor);
  const rows = await prisma.kanbanBoardView.findMany({
    where: {
      boardId,
      tenantId: ctx.tenantId,
      systemId: ctx.systemId,
      OR: [{ scope: "BOARD" }, { scope: "PRIVATE", ownerUserId: userId }],
    },
    // enum ถูกประกาศ PRIVATE ก่อน BOARD (schema) ⇒ Postgres สั่ง desc ตามอันดับ = BOARD(1) มาก่อน PRIVATE(0)
    orderBy: [{ scope: "desc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
  });
  return rows.map((r) => toDto(r as ViewRow));
}

/** โหลดแถวดิบ + ยืนยันว่า actor "เห็น" มุมมองนี้ได้ (BOARD ที่เห็นบอร์ด · PRIVATE ที่เป็นเจ้าของ) — ไม่งั้น 404 */
async function loadVisibleView(ctx: KanbanCtx, actor: KanbanActor, viewId: string): Promise<ViewRow> {
  const row = await prisma.kanbanBoardView.findFirst({
    where: { id: viewId, tenantId: ctx.tenantId, systemId: ctx.systemId },
  });
  if (!row) throw new KanbanNotFoundError("ไม่พบมุมมองนี้");
  const typed = row as ViewRow;
  if (typed.scope === "PRIVATE" && typed.ownerUserId !== actorUserIdOf(ctx, actor)) {
    throw new KanbanNotFoundError("ไม่พบมุมมองนี้"); // ของคนอื่น — ไม่บอกว่ามีอยู่จริง (§6.3)
  }
  if (typed.boardId) await assertBoardRole(ctx, typed.boardId, "VIEWER");
  return typed;
}

/** โหลดแถว + ยืนยันว่า actor "แก้/ลบ" ได้ (PRIVATE = เจ้าของ · BOARD = ADMIN ของบอร์ด) */
async function loadEditableView(ctx: KanbanCtx, actor: KanbanActor, viewId: string): Promise<ViewRow> {
  const row = await prisma.kanbanBoardView.findFirst({
    where: { id: viewId, tenantId: ctx.tenantId, systemId: ctx.systemId },
  });
  if (!row) throw new KanbanNotFoundError("ไม่พบมุมมองนี้");
  const typed = row as ViewRow;
  if (typed.scope === "PRIVATE") {
    if (typed.ownerUserId !== actorUserIdOf(ctx, actor)) throw new KanbanNotFoundError("ไม่พบมุมมองนี้");
    if (typed.boardId) await assertBoardRole(ctx, typed.boardId, "VIEWER");
  } else {
    if (!typed.boardId) throw new KanbanForbiddenError("มุมมองนี้ยังแก้ไม่ได้");
    await assertBoardRole(ctx, typed.boardId, "ADMIN");
  }
  return typed;
}

// ───────────────────────── เขียน ─────────────────────────

export type SaveViewInput = { boardId: string; name: string; scope?: ViewScope; config: unknown };

/**
 * บันทึกมุมมองปัจจุบันของบอร์ด — PRIVATE ใครที่เห็นบอร์ด (VIEWER+) ก็บันทึกของตัวเองได้
 * BOARD (ทั้งทีม) ต้องเป็น ADMIN เท่านั้น (`assertBoardRole` โยน Forbidden ข้อความ "…ผู้ดูแล…" ให้เอง)
 */
export async function saveView(ctx: KanbanCtx, actor: KanbanActor, input: SaveViewInput): Promise<SavedViewDto> {
  const scope: ViewScope = input.scope === "BOARD" ? "BOARD" : "PRIVATE";
  await assertBoardRole(ctx, input.boardId, scope === "BOARD" ? "ADMIN" : "VIEWER");
  const name = normalizeViewName(input.name);
  const config = parseViewConfig(input.config);
  const userId = actorUserIdOf(ctx, actor);
  const ownerUserId = scope === "PRIVATE" ? userId : null;

  // เพดาน KANBAN_LIMITS.viewsPerBoard ต่อคนต่อบอร์ด (สัญญา K2.5) — PRIVATE นับเฉพาะของตัวเอง ·
  // BOARD (ของทั้งทีม ไม่มีเจ้าของรายคน) นับรวมกันเป็นโควตาเดียวของบอร์ด
  const count = await prisma.kanbanBoardView.count({
    where: scope === "PRIVATE" ? { boardId: input.boardId, scope: "PRIVATE", ownerUserId } : { boardId: input.boardId, scope: "BOARD" },
  });
  if (count >= KANBAN_LIMITS.viewsPerBoard) {
    throw new Error(`บันทึกมุมมองได้สูงสุด ${KANBAN_LIMITS.viewsPerBoard} มุมมองต่อบอร์ด — ลบมุมมองที่ไม่ได้ใช้ก่อน`);
  }

  const row = await prisma.kanbanBoardView.create({
    data: {
      tenantId: ctx.tenantId,
      systemId: ctx.systemId,
      boardId: input.boardId,
      ownerUserId,
      name,
      scope,
      config: config as Prisma.InputJsonValue,
    },
  });

  if (scope === "BOARD") {
    await logActivity(prisma, {
      tenantId: ctx.tenantId,
      boardId: input.boardId,
      actorUserId: ctx.actorUserId ?? null,
      type: "BOARD_UPDATED",
      data: { savedViewCreated: name },
    });
  }
  return toDto(row as ViewRow);
}

export type UpdateViewInput = { name?: string; config?: unknown; sortOrder?: number };

export async function updateView(ctx: KanbanCtx, actor: KanbanActor, viewId: string, patch: UpdateViewInput): Promise<SavedViewDto> {
  const row = await loadEditableView(ctx, actor, viewId);
  const data: Prisma.KanbanBoardViewUpdateInput = {};
  if (patch.name !== undefined) data.name = normalizeViewName(patch.name);
  if (patch.config !== undefined) data.config = parseViewConfig(patch.config) as Prisma.InputJsonValue;
  if (patch.sortOrder !== undefined) data.sortOrder = patch.sortOrder;
  if (Object.keys(data).length === 0) return toDto(row);

  const updated = await prisma.kanbanBoardView.update({ where: { id: row.id }, data });
  if (row.scope === "BOARD" && row.boardId) {
    await logActivity(prisma, {
      tenantId: ctx.tenantId,
      boardId: row.boardId,
      actorUserId: ctx.actorUserId ?? null,
      type: "BOARD_UPDATED",
      data: { savedViewUpdated: updated.name },
    });
  }
  return toDto(updated as ViewRow);
}

export async function deleteView(ctx: KanbanCtx, actor: KanbanActor, viewId: string): Promise<void> {
  const row = await loadEditableView(ctx, actor, viewId);
  await prisma.kanbanBoardView.delete({ where: { id: row.id } });
  if (row.scope === "BOARD" && row.boardId) {
    await logActivity(prisma, {
      tenantId: ctx.tenantId,
      boardId: row.boardId,
      actorUserId: ctx.actorUserId ?? null,
      type: "BOARD_UPDATED",
      data: { savedViewDeleted: row.name },
    });
  }
}

/** ลากเรียงลำดับมุมมอง (หน้าตั้งค่า) — เฉพาะมุมมองที่ actor แก้ได้ (ที่เหลือถูกข้ามเงียบ ๆ ไม่ throw ทั้งชุด) */
export async function reorderViews(ctx: KanbanCtx, actor: KanbanActor, ids: string[]): Promise<void> {
  for (let i = 0; i < ids.length; i += 1) {
    const id = ids[i]!;
    try {
      const row = await loadEditableView(ctx, actor, id);
      if (row.sortOrder !== i) await prisma.kanbanBoardView.update({ where: { id }, data: { sortOrder: i } });
    } catch {
      // ไม่ใช่ของตัวเอง/ไม่มีสิทธิ์ — ข้ามแถวนี้ไป (ป้องกัน id ปลอมปนมาทำทั้งคำขอล้ม)
    }
  }
}

// ───────────────────────── applyView (โหลดมุมมอง → พารามิเตอร์จริง §2.3) ─────────────────────────

export type AppliedView = { view: ViewConfig["view"]; filters: ViewFilters; sort?: string; group?: string; zoom?: string; href: string };

/** href ตาม §2.3 — เขียนตัวกรองลง URL จริง + คง `savedView=<id>` ท้ายสุด (ตามสัญญา S2.8) */
function buildHref(systemId: string, row: Pick<ViewRow, "boardId" | "id">, config: ViewConfig): string {
  // K3.8 (ยังไม่ทำ): boardId null → `/kanban/overview` — วันนี้ K2.5 สร้างได้แต่แถวที่มี boardId เท่านั้น
  const base = row.boardId ? `/app/sys/${systemId}/kanban/b/${row.boardId}` : `/app/sys/${systemId}/kanban/overview`;
  return hrefForSavedView(base, row.id, config);
}

/** โหลดมุมมองที่บันทึกไว้ → พารามิเตอร์จริงพร้อม href เดินหน้าไปยังบอร์ดพร้อมตัวกรอง (สัญญา K2.5 §2.3) */
export async function applyView(ctx: KanbanCtx, actor: KanbanActor, viewId: string): Promise<AppliedView> {
  const row = await loadVisibleView(ctx, actor, viewId);
  const config = parseViewConfig(row.config);
  return {
    view: config.view,
    filters: config.filters ?? {},
    sort: config.sort,
    group: config.group,
    zoom: config.zoom,
    href: buildHref(ctx.systemId, row, config),
  };
}
