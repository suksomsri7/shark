import { prisma } from "@/lib/core/db";
import { emitOutbox } from "@/lib/core/outbox";
import { Prisma } from "@prisma/client";
import type { KanbanBoard, KanbanBoardVisibility, KanbanCard, KanbanCardSourceType, KanbanColumn, KanbanLabelColor } from "@prisma/client";
import { logActivity } from "./activity-log";
import { keyBetween, keysBetween } from "./ordering";
import { publishBoardSignal, boardSignal } from "./realtime";
import { applyCardLabelNames } from "./labels";
import { syncSingleAssignee } from "./cards";
import { notifyCardAssigned } from "./notify";
import { fieldsOnCardForCards } from "./fields";
// K2.11 — สถานะ "ติดตาม" ของคนที่กำลังดู (ส่งลงหัวบอร์ด/เมนูคอลัมน์)
import { boardWatchState } from "./watch";
// K3.1 — จำนวน "เชื่อมข้อมูล SHARK" ต่อการ์ด (ชิป 🔗 n) · อ่านจากฝั่ง resolver ที่ไม่รู้จัก service.ts
// (ฝั่งเขียน `links.ts` เป็นตัวที่ import service.ts — ถ้าดึงจากที่นั่นจะเป็น import วนกลับ)
import { linkCountsOfCards } from "./link-resolvers";
import { boardRole, KanbanNotFoundError, visibleBoardsWhere, type BoardRole } from "./access";
import type {
  BoardCardDto,
  BoardCardMirrorDto,
  BoardLabelDto,
  BoardPersonDto,
  BoardViewDto,
  FieldOnCardDto,
  KanbanActor,
  KanbanCtx,
  KanbanTagColor,
} from "./types";

// ── K1.2: service.ts เป็น facade ของโมดูล (proposals.ts/ai/tools.ts/ข้อสอบเก่า import ที่นี่) ──
//    ฟังก์ชันใหม่อยู่ไฟล์ของตัวเอง แล้ว re-export ออกจากที่นี่ — ผู้เรียกเดิมไม่ต้องแก้สักบรรทัด
export { setCardAssignees, listCardAssignees } from "./cards";
export { listLabels, createLabel, updateLabel, deleteLabel, setCardLabels } from "./labels";
export type { KanbanCtx, KanbanActor } from "./types";
// K1.5: ชนิดของ DTO หน้าบอร์ด (หน้า/คอมโพเนนต์ฝั่ง client import จาก facade เดียวกัน)
export type {
  BoardCardDto,
  BoardCardMirrorDto,
  BoardColumnDto,
  BoardLabelDto,
  BoardPersonDto,
  BoardViewDto,
  KanbanTagColor,
} from "./types";
// K3.7 — การ์ดสะท้อน: mirrorCard/resolveMirror/รายชื่อบอร์ด-คอลัมน์ปลายทาง ผ่าน facade เดียวกัน
export { listMirrorBoards, listMirrorColumns, mirrorCard } from "./mirror";
// K1.3: สิทธิ์ 2 ชั้น — ผู้เรียกนอกโมดูล (หน้า/action/AI) ใช้ผ่าน facade เดียวกัน
export { boardRole, canReadKanban, toActor, visibleBoardsWhere, KanbanNotFoundError, KanbanForbiddenError } from "./access";
export type { BoardRole } from "./access";
export {
  addMember,
  assertBoardRole,
  boardRoleOf,
  leaveBoard,
  listMembers,
  listStarredBoardIds,
  removeMember,
  setBoardVisibility,
  setMemberRole,
  starBoard,
  unstarBoard,
} from "./members";
// K1.12: เทมเพลตบอร์ด + หน้ารวมบอร์ดใหม่ — ผู้เรียกนอกโมดูล (หน้า/action) ใช้ผ่าน facade เดียวกัน
export { createBoardFromTemplate, deleteTenantTemplate, listTemplates, saveBoardAsTemplate } from "./templates";
export type { BoardTemplateDto, TemplateCardSpec, TemplateColumnSpec, TemplateLabelSpec, TemplateStructure } from "./templates";
export { boardsHome } from "./boardsHome";
export type { BoardsHomeCardDto, BoardsHomeDto } from "./boardsHome";
// K2.1: มุมมองตาราง + เลือกหลายรายการ + ส่งออก CSV — ผู้เรียกนอกโมดูล (หน้า/action/K2.10) ใช้ผ่าน facade เดียวกัน
export { listBoardTable } from "./table";
export type { BoardTableResult, ListBoardTableInput, TableGroupBy, TableSort } from "./table";
export { bulkUpdate } from "./cards";
export type { BulkUpdatePatch, BulkUpdateResult } from "./cards";
export { exportCardsCsv } from "./reports";
export type { ExportCardsCsvInput } from "./reports";
export type { TableCardLinkDto, TableGroupDto, TableRowDto } from "./types";
// K2.2: มุมมองปฏิทิน + ลากตั้ง/เปลี่ยนกำหนดส่ง — ผู้เรียกนอกโมดูล (หน้า/action) ใช้ผ่าน facade เดียวกัน
export { listBoardCalendar, setCardDueFromCalendar } from "./calendar";
export type { ListBoardCalendarInput, SetCardDueFromCalendarResult } from "./calendar";
export type { BoardCalendarDto, CalCardDto, CalDayDto, CalExternalDto } from "./types";
// K2.3: มุมมองไทม์ไลน์ + ลากขอบ/ลากตัวแถบ — ผู้เรียกนอกโมดูล (หน้า/action) ใช้ผ่าน facade เดียวกัน
export { listBoardTimeline, setCardRange, shiftCardRange } from "./timeline";
export type { ListBoardTimelineInput, SetCardRangeResult, ShiftCardRangeResult } from "./timeline";
export type { BoardTimelineDto, TimelineBarDto, TimelineGroupBy, TimelineRowDto } from "./types";
// K2.4: มุมมองสรุป (4 ไทล์ เจาะลงการ์ดได้) — ผู้เรียกนอกโมดูล (หน้า) ใช้ผ่าน facade เดียวกัน
export { boardSummary } from "./summary";
export type { BoardSummaryInput } from "./summary";
export type { BoardSummaryDto, SummaryLabelTileDto, SummaryThroughputWeekDto, SummaryTileDto } from "./types";
// K2.6: ฟิลด์กำหนดเอง — ผู้เรียกนอกโมดูล (หน้า/action) ใช้ผ่าน facade เดียวกัน
export { createField, deleteField, getCardFieldValues, listFields, reorderFields, setCardFieldValue, updateField } from "./fields";
export type { CardFieldValueDto, CustomFieldDto, CustomFieldOptions, FieldOnCardDto, KanbanCustomFieldType } from "./types";
// K2.7: เทมเพลตการ์ด + กำหนดส่งซ้ำ — ผู้เรียกนอกโมดูล (หน้า/action) ใช้ผ่าน facade เดียวกัน
export {
  createCardFromTemplate,
  deleteCardTemplate,
  listCardTemplates,
  reorderCardTemplates,
  saveAsCardTemplate,
  updateCardTemplate,
} from "./card-templates";
export { describeRecurrence, nextOccurrence, parseRecurrenceRule, setCardRecurrence, sweepRecurringCards } from "./recurrence";
export type { CardTemplateDto } from "./types";

// K3.9 — อีเมลเข้าบอร์ด: กุญแจ/ที่อยู่ของบอร์ด (ฝั่งเขียนอยู่ `boards-email.ts` · หน้า/action เรียกผ่าน facade นี้)
export {
  boardEmailAddress,
  boardEmailKeyFromRecipients,
  ensureEmailKey,
  findBoardByEmailKey,
  getBoardEmailKey,
  isBoardEmailKey,
  rotateEmailKey,
} from "./boards-email";
export type { BoardByEmailKey, BoardEmailKey } from "./boards-email";

export { listSystemCalendar } from "./system-calendar";
export type { ListSystemCalendarInput } from "./system-calendar";
export type { SystemCalCardDto, SystemCalDayDto, SystemCalendarBoardDto, SystemCalendarDto } from "./types";

// แจ้งเตือนเมื่อมอบหมายงาน — ย้ายตรรกะไป `notify.ts` ใน K1.2 (cards.ts ใช้ร่วมโดยไม่เกิด import วงกลม)
// ชื่อเดิมคงไว้เป็น alias ภายในไฟล์นี้ เพื่อไม่ต้องแก้จุดเรียกเดิม
const notifyAssignment = notifyCardAssigned;

// งานของฉัน — การ์ด ACTIVE ที่มอบหมายให้ผู้ใช้ปัจจุบัน ข้ามทุกบอร์ด (เรียงตามกำหนดส่ง)
//
// 🔴 K1.3: ส่ง `actor` มาด้วยเมื่อรู้ว่าใครกำลังดู — การ์ดจากบอร์ดที่คนนั้น "มองไม่เห็นแล้ว"
//    (ถูกถอดออกจากบอร์ด PRIVATE / บอร์ดเปลี่ยนเป็น PRIVATE) ต้องหายจากหน้า "งานของฉัน" ทันที
//    ไม่งั้นชื่อการ์ด+ชื่อบอร์ดลับจะรั่วผ่านหน้ารวมทั้งที่ปิดประตูหน้าบอร์ดไปแล้ว
//    (พารามิเตอร์เป็น optional เพื่อไม่หักผู้เรียกเดิม — cron/AI ที่ไม่มี actor ยังเรียกได้เหมือนเดิม)
export async function listMyCards(tenantId: string, systemId: string, userId: string, actor?: KanbanActor | null) {
  // 🔴 K1.2: ผู้รับผิดชอบมีได้หลายคน — "งานของฉัน" ต้องอ่าน `KanbanCardAssignee` ด้วย
  //    ไม่ใช่แค่ช่องเดิม `assigneeUserId` (คนที่ 2 ของการ์ดจะไม่เห็นงานตัวเองเลย)
  //    union ทั้งสองทางไว้ตลอด P1 เพราะทั้งคู่ถูกเขียนคู่กัน (แถวเก่าที่ยังไม่ backfill ก็ยังโผล่)
  const assigned = await prisma.kanbanCardAssignee.findMany({
    where: { tenantId, userId },
    select: { cardId: true },
  });
  const assignedIds = assigned.map((a) => a.cardId);
  return prisma.kanbanCard.findMany({
    where: {
      tenantId,
      systemId,
      status: "ACTIVE",
      OR: [{ assigneeUserId: userId }, ...(assignedIds.length ? [{ id: { in: assignedIds } }] : [])],
      ...(actor ? { board: visibleBoardsWhere(actor) } : {}),
    },
    include: { board: { select: { name: true } }, column: { select: { name: true } } },
    // กำหนดส่งก่อน (หน้า "งานของฉัน" จัดกลุ่มตามวัน) แล้วค่อยลำดับในคอลัมน์ (position → sortOrder → createdAt)
    orderBy: [
      { dueAt: { sort: "asc", nulls: "last" } },
      { position: { sort: "asc", nulls: "first" } },
      { sortOrder: "asc" },
      { createdAt: "asc" },
    ],
    take: 100,
  });
}

// Kanban — บอร์ดงานภายในองค์กร. scope = feature: filter ด้วย tenantId + systemId เสมอ
// ทุก mutation ตรวจ ownership ผ่าน tenantId + systemId (defense-in-depth) — ไม่พึ่ง tenantDb inject

const DEFAULT_COLUMNS = ["รอทำ", "กำลังทำ", "เสร็จ"];

export type BoardWithData = KanbanBoard & {
  columns: (KanbanColumn & { cards: KanbanCard[] })[];
};

// ───────────────────────── Board ─────────────────────────

export async function listBoards(tenantId: string, systemId: string, includeArchived = false) {
  return prisma.kanbanBoard.findMany({
    where: { tenantId, systemId, ...(includeArchived ? {} : { status: "ACTIVE" }) },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    include: { _count: { select: { cards: { where: { status: "ACTIVE" } } } } },
  });
}

// โหลดบอร์ดเต็ม (คอลัมน์ active เรียงซ้าย-ขวา + การ์ด active เรียงในคอลัมน์)
export async function getBoard(
  tenantId: string,
  systemId: string,
  boardId: string,
): Promise<BoardWithData | null> {
  const board = await prisma.kanbanBoard.findFirst({
    where: { id: boardId, tenantId, systemId },
    include: {
      // เรียงด้วย `position` (fractional index) เป็นหลัก · `sortOrder` เป็น fallback ช่วงเปลี่ยนผ่าน (D10)
      // 🔴 nulls: "first" — แถวที่ยังไม่ backfill (position = null) ต้องอยู่ "ก่อน" แถวที่มี key
      //    เพราะการ์ด/คอลัมน์ที่โค้ดใหม่สร้าง = ต่อท้ายเสมอ (ถ้าใช้ค่าปริยาย NULLS LAST ของ Postgres
      //    ของใหม่จะเด้งขึ้นไปอยู่หัวคอลัมน์ในช่วงก่อน backfill)
      columns: {
        where: { status: "ACTIVE" },
        orderBy: [{ position: { sort: "asc", nulls: "first" } }, { sortOrder: "asc" }, { createdAt: "asc" }],
        include: {
          cards: {
            where: { status: "ACTIVE" },
            orderBy: [{ position: { sort: "asc", nulls: "first" } }, { sortOrder: "asc" }, { createdAt: "asc" }],
          },
        },
      },
    },
  });
  return board as BoardWithData | null;
}

// ───────────────── K1.3: ตัวที่ "ผ่านสิทธิ์" แล้ว — หน้าเว็บ/action ต้องเรียกตัวนี้เท่านั้น ─────────────────
// `listBoards`/`getBoard` เดิมยังอยู่ (seed · AI · ข้อสอบเก่าเรียกอยู่) แต่ **ไม่กรองสิทธิ์**
// ⇒ ทุกจุดที่มี "คนกด" ต้องใช้ตัว `…For` ที่รับ `actor` ไม่งั้นบอร์ดลับโผล่ในรายการ

export type BoardListItem = KanbanBoard & { starred: boolean };

/** บอร์ดที่ actor มองเห็น — ติดดาวขึ้นก่อน แล้วเรียงตามลำดับเดิม */
export async function listBoardsFor(
  ctx: KanbanCtx,
  actor: KanbanActor,
  includeArchived = false,
): Promise<BoardListItem[]> {
  const boards = await prisma.kanbanBoard.findMany({
    where: {
      AND: [
        { tenantId: ctx.tenantId, systemId: ctx.systemId, ...(includeArchived ? {} : { status: "ACTIVE" as const }) },
        visibleBoardsWhere(actor),
      ],
    },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    include: {
      _count: { select: { cards: { where: { status: "ACTIVE" } } } },
      stars: { where: { userId: actor.userId }, select: { boardId: true } },
    },
  });
  // เรียงใหม่แบบคงลำดับเดิมภายในกลุ่ม (stable sort ของ JS) — ดาวขึ้นบน ที่เหลือเรียงเหมือนเดิม
  return boards
    .map((b) => ({ ...b, starred: b.stars.length > 0 }))
    .sort((a, b) => Number(b.starred) - Number(a.starred));
}

/** เปิดบอร์ดพร้อมบทบาทของผู้เปิด — มองไม่เห็น = `KanbanNotFoundError` (404 ไม่ใช่ 403) */
export async function getBoardFor(
  ctx: KanbanCtx,
  actor: KanbanActor,
  boardId: string,
): Promise<BoardWithData & { role: Exclude<BoardRole, null> }> {
  const board = await getBoard(ctx.tenantId, ctx.systemId, boardId);
  if (!board) throw new KanbanNotFoundError();
  const members = await prisma.kanbanBoardMember.findMany({
    where: { boardId: board.id, tenantId: ctx.tenantId },
    select: { userId: true, role: true },
  });
  const role = boardRole(actor, board, members);
  if (role === null) throw new KanbanNotFoundError();
  return { ...board, role };
}

export async function createBoard(input: {
  tenantId: string;
  systemId: string;
  name: string;
  description?: string | null;
  /** BusinessUnit.id — บอร์ดของสาขาไหน (null = กลางองค์กร) */
  unitId?: string | null;
  /** ไม่ระบุ = PRIVATE ตาม default ของ schema (บอร์ดใหม่ปิดก่อน — D2) */
  visibility?: KanbanBoardVisibility;
  color?: KanbanLabelColor;
  createdById?: string | null;
}): Promise<KanbanBoard> {
  const count = await prisma.kanbanBoard.count({
    where: { tenantId: input.tenantId, systemId: input.systemId },
  });
  // คอลัมน์เริ่มต้นได้ position ตั้งแต่แรก ⇒ บอร์ดที่โค้ดใหม่สร้างจะไม่ถูก backfill แตะ (เครื่องหมายใน K1.1)
  const colKeys = keysBetween(null, null, DEFAULT_COLUMNS.length);
  // K1.10: บอร์ด + คอลัมน์เริ่มต้น + ประวัติ "สร้างบอร์ด" อยู่ทรานแซกชันเดียวกัน
  return prisma.$transaction(async (tx) => {
    const board = await tx.kanbanBoard.create({
    data: {
      tenantId: input.tenantId,
      systemId: input.systemId,
      name: input.name,
      description: input.description ?? null,
      sortOrder: count,
      unitId: input.unitId ?? null,
      ...(input.visibility ? { visibility: input.visibility } : {}),
      ...(input.color ? { color: input.color } : {}),
      createdById: input.createdById ?? null,
      columns: {
        create: DEFAULT_COLUMNS.map((name, i) => ({
          tenantId: input.tenantId,
          systemId: input.systemId,
          name,
          sortOrder: i,
          position: colKeys[i]!,
        })),
      },
      },
    });
    await logActivity(tx, {
      tenantId: input.tenantId,
      boardId: board.id,
      actorUserId: input.createdById ?? null,
      type: "BOARD_CREATED",
      data: { name: board.name, visibility: board.visibility, unitId: board.unitId },
    });
    return board;
  });
}

export async function renameBoard(tenantId: string, systemId: string, boardId: string, name: string, actorUserId?: string | null) {
  await prisma.$transaction(async (tx) => {
    const before = await tx.kanbanBoard.findFirst({ where: { id: boardId, tenantId, systemId }, select: { name: true } });
    if (!before) return;
    await tx.kanbanBoard.updateMany({ where: { id: boardId, tenantId, systemId }, data: { name } });
    await logActivity(tx, {
      tenantId,
      boardId,
      actorUserId: actorUserId ?? null,
      type: "BOARD_UPDATED",
      data: { fields: ["name"], from: before.name, name },
    });
  });
}

/**
 * แก้ฟิลด์ของบอร์ดที่ไม่ใช่ "ชื่อ" และไม่ใช่ "การมองเห็น" (คำอธิบาย/สี/สาขา) — K1.15
 *
 * ทำไมต้องมี: หน้าจอ K1.5–K1.14 แก้ได้แค่ชื่อ (renameBoard) กับ visibility (members.setBoardVisibility)
 * แต่ REST ต้องรับ `PATCH /boards/{id}` ครบชุดตามสัญญา §K1.15 ⇒ ตัวเขียนอยู่ที่นี่ที่เดียว
 * (จุดเดียวที่แตะฟิลด์เหล่านี้ · ผู้เรียกต้องตรวจบทบาท ADMIN มาก่อนเหมือน `renameBoard`)
 * ไม่มีฟิลด์ให้เปลี่ยนเลย = ไม่เขียนอะไร (ไม่มีแถวประวัติเปล่า ๆ)
 */
export async function updateBoardFields(
  ctx: KanbanCtx,
  boardId: string,
  patch: { description?: string | null; color?: KanbanLabelColor; unitId?: string | null },
): Promise<void> {
  const fields = Object.keys(patch).filter((k) => patch[k as keyof typeof patch] !== undefined);
  if (fields.length === 0) return;
  await prisma.$transaction(async (tx) => {
    const before = await tx.kanbanBoard.findFirst({
      where: { id: boardId, tenantId: ctx.tenantId, systemId: ctx.systemId },
      select: { description: true, color: true, unitId: true },
    });
    if (!before) return;
    await tx.kanbanBoard.updateMany({
      where: { id: boardId, tenantId: ctx.tenantId, systemId: ctx.systemId },
      data: {
        ...(patch.description !== undefined ? { description: patch.description } : {}),
        ...(patch.color !== undefined ? { color: patch.color } : {}),
        ...(patch.unitId !== undefined ? { unitId: patch.unitId } : {}),
      },
    });
    await logActivity(tx, {
      tenantId: ctx.tenantId,
      boardId,
      actorUserId: ctx.actorUserId ?? null,
      type: "BOARD_UPDATED",
      data: { fields, from: { description: before.description, color: before.color, unitId: before.unitId } },
    });
  });
}

export async function archiveBoard(tenantId: string, systemId: string, boardId: string, actorUserId?: string | null) {
  await prisma.$transaction(async (tx) => {
    const { count } = await tx.kanbanBoard.updateMany({
      where: { id: boardId, tenantId, systemId },
      data: { status: "ARCHIVED", archivedAt: new Date() },
    });
    if (count === 0) return;
    await logActivity(tx, { tenantId, boardId, actorUserId: actorUserId ?? null, type: "BOARD_ARCHIVED" });
  });
}

export async function unarchiveBoard(tenantId: string, systemId: string, boardId: string, actorUserId?: string | null) {
  await prisma.$transaction(async (tx) => {
    const { count } = await tx.kanbanBoard.updateMany({
      where: { id: boardId, tenantId, systemId },
      data: { status: "ACTIVE", archivedAt: null },
    });
    if (count === 0) return;
    // ไม่มีชนิด BOARD_RESTORED ในสัญญา — ใช้ BOARD_UPDATED + `status` แล้วให้ `describeActivity` พูดว่า "กู้บอร์ดคืน"
    await logActivity(tx, {
      tenantId,
      boardId,
      actorUserId: actorUserId ?? null,
      type: "BOARD_UPDATED",
      data: { fields: ["status"], status: "ACTIVE" },
    });
  });
}

// ───────────────────────── ลำดับ (fractional index) ─────────────────────────

/**
 * คีย์ตำแหน่ง "ต่อท้ายสุด" — ของคอลัมน์ในบอร์ด (kind=column) หรือของการ์ดในคอลัมน์ (kind=card)
 *
 * 🔴 อ่านเฉพาะแถวที่ `position` ไม่ null: แถวที่ยังไม่ backfill ไม่มีคีย์ที่ใช้ต่อยอดได้
 *    (generateKeyBetween ต้องรับคีย์ที่ถูกต้องตามไวยากรณ์เท่านั้น — ยัด "5" จาก sortOrder เข้าไปจะโยน)
 *    ⇒ คอลัมน์ที่ยังไม่ backfill: ของใหม่เริ่มที่ "a0" แล้วเรียงหลังแถว null ด้วย nulls:"first" ตอนอ่าน
 */
async function nextPosition(
  kind: "column" | "card",
  scope: { tenantId: string; systemId: string; scopeId: string },
): Promise<string> {
  const { tenantId, systemId, scopeId } = scope;
  const last =
    kind === "column"
      ? await prisma.kanbanColumn.findFirst({
          where: { tenantId, systemId, boardId: scopeId, status: "ACTIVE", position: { not: null } },
          orderBy: { position: "desc" },
          select: { position: true },
        })
      : await prisma.kanbanCard.findFirst({
          where: { tenantId, systemId, columnId: scopeId, status: "ACTIVE", position: { not: null } },
          orderBy: { position: "desc" },
          select: { position: true },
        });
  return keyBetween(last?.position ?? null, null);
}

// ───────────────────────── Column ─────────────────────────

export async function createColumn(
  tenantId: string,
  systemId: string,
  boardId: string,
  name: string,
  actorUserId?: string | null,
): Promise<KanbanColumn | null> {
  const board = await prisma.kanbanBoard.findFirst({ where: { id: boardId, tenantId, systemId } });
  if (!board) return null;
  const count = await prisma.kanbanColumn.count({ where: { tenantId, systemId, boardId, status: "ACTIVE" } });
  const position = await nextPosition("column", { tenantId, systemId, scopeId: boardId });
  return prisma.$transaction(async (tx) => {
    const column = await tx.kanbanColumn.create({
      data: { tenantId, systemId, boardId, name, sortOrder: count, position },
    });
    await logActivity(tx, {
      tenantId,
      boardId,
      actorUserId: actorUserId ?? null,
      type: "COLUMN_CREATED",
      data: { columnId: column.id, name: column.name },
    });
    return column;
  });
}

export async function renameColumn(tenantId: string, systemId: string, columnId: string, name: string, actorUserId?: string | null) {
  await prisma.$transaction(async (tx) => {
    const before = await tx.kanbanColumn.findFirst({
      where: { id: columnId, tenantId, systemId },
      select: { boardId: true, name: true },
    });
    if (!before) return;
    await tx.kanbanColumn.updateMany({ where: { id: columnId, tenantId, systemId }, data: { name } });
    await logActivity(tx, {
      tenantId,
      boardId: before.boardId,
      actorUserId: actorUserId ?? null,
      type: "COLUMN_UPDATED",
      data: { columnId, fields: ["name"], from: before.name, name },
    });
  });
}

// archive คอลัมน์ + การ์ดในคอลัมน์ (atomic)
export async function archiveColumn(tenantId: string, systemId: string, columnId: string, actorUserId?: string | null) {
  await prisma.$transaction(async (tx) => {
    const before = await tx.kanbanColumn.findFirst({
      where: { id: columnId, tenantId, systemId },
      select: { boardId: true, name: true },
    });
    if (!before) return;
    await tx.kanbanCard.updateMany({
      where: { columnId, tenantId, systemId, status: "ACTIVE" },
      data: { status: "ARCHIVED", archivedAt: new Date() },
    });
    await tx.kanbanColumn.updateMany({
      where: { id: columnId, tenantId, systemId },
      data: { status: "ARCHIVED", archivedAt: new Date() },
    });
    await logActivity(tx, {
      tenantId,
      boardId: before.boardId,
      actorUserId: actorUserId ?? null,
      type: "COLUMN_ARCHIVED",
      data: { columnId, name: before.name, withCards: true },
    });
  });
}

// ───────────────────────── Card ─────────────────────────

export async function createCard(input: {
  tenantId: string;
  systemId: string;
  columnId: string;
  title: string;
  description?: string | null;
  assigneeUserId?: string | null;
  dueAt?: Date | null;
  startAt?: Date | null;
  labels?: string[];
  sourceType?: KanbanCardSourceType;
  sourceId?: string | null;
  /**
   * K3.1 — กุญแจกันสร้างซ้ำของการ์ดที่เกิดจากภายนอก (`unique(tenantId, sourceKey)` แบบ partial ที่ DB)
   * 🔴 ผู้เรียกที่ส่งค่านี้ต้องพร้อมรับ error จากการชน unique (ยิงพร้อมกัน) — `links.createCardFromExternal`
   *    จับไว้แล้วอ่านการ์ดใบเดิมคืนเป็น `created: false` (ประตูเดียวของทางเข้าภายนอกทั้งหมด)
   */
  sourceKey?: string | null;
  createdById?: string | null;
}): Promise<KanbanCard | null> {
  const col = await prisma.kanbanColumn.findFirst({
    where: { id: input.columnId, tenantId: input.tenantId, systemId: input.systemId, status: "ACTIVE" },
  });
  if (!col) return null;
  const count = await prisma.kanbanCard.count({
    where: { columnId: col.id, tenantId: input.tenantId, systemId: input.systemId, status: "ACTIVE" },
  });
  const position = await nextPosition("card", {
    tenantId: input.tenantId,
    systemId: input.systemId,
    scopeId: col.id,
  });
  // 🔴 เลขการ์ด (D14 · §11.2): จองเลขด้วย `UPDATE … SET cardNoSeq = cardNoSeq + 1 … RETURNING`
  //    ใน transaction เดียวกับการสร้างการ์ด — คำสั่งเดียวจบ ⇒ สร้างพร้อมกันหลายใบก็ไม่ได้เลขซ้ำ
  //    (อ่านมานับเองแล้วค่อยเขียนคือรูปแบบที่นับพลาดตอนยิงพร้อมกัน)
  const card = await prisma.$transaction(async (tx) => {
    const seq = await tx.$queryRaw<{ cardNoSeq: number }[]>`
      UPDATE "KanbanBoard" SET "cardNoSeq" = "cardNoSeq" + 1 WHERE id = ${col.boardId} RETURNING "cardNoSeq"
    `;
    const created = await tx.kanbanCard.create({
      data: {
        tenantId: input.tenantId,
        systemId: input.systemId,
        boardId: col.boardId,
        columnId: col.id,
        title: input.title,
        description: input.description ?? null,
        assigneeUserId: input.assigneeUserId ?? null,
        dueAt: input.dueAt ?? null,
        startAt: input.startAt ?? null,
        labels: input.labels ?? [],
        sortOrder: count,
        position,
        cardNo: seq[0]?.cardNoSeq ?? null,
        ...(input.sourceType ? { sourceType: input.sourceType } : {}),
        sourceId: input.sourceId ?? null,
        sourceKey: input.sourceKey ?? null,
        createdById: input.createdById ?? null,
      },
    });
    await logActivity(tx, {
      tenantId: input.tenantId,
      boardId: col.boardId,
      cardId: created.id,
      actorUserId: input.createdById ?? null,
      type: "CARD_CREATED",
      data: { title: created.title, columnId: col.id, sourceType: created.sourceType },
    });
    // K1.15 — เหตุการณ์ `kanban.card.created` ใน tx เดียวกับการสร้างการ์ด (ฮุคขาออก/กฎอัตโนมัติของร้าน)
    // idempotencyKey ผูกกับ id ของการ์ด ⇒ การ์ด 1 ใบ = event 1 ใบตลอดกาล
    await emitOutbox(tx, {
      tenantId: input.tenantId,
      systemId: input.systemId,
      type: "kanban.card.created",
      idempotencyKey: `kanban.card.created#${created.id}`,
      payload: {
        cardId: created.id,
        boardId: col.boardId,
        columnId: col.id,
        cardNo: created.cardNo,
        title: created.title,
        sourceType: created.sourceType,
      },
    });
    return created;
  });
  // ── K1.2 dual-write: ช่องเดิม + ตารางใหม่ต้องตรงกันเสมอ ──
  const ctx = { tenantId: input.tenantId, systemId: input.systemId, actorUserId: input.createdById ?? null };
  if (input.assigneeUserId) {
    await syncSingleAssignee(ctx, card.id, input.assigneeUserId);
  }
  // ผู้เรียกเดิม (seed · AI · actions) ส่งป้ายมาเป็น "ชื่อ" — สร้าง/ผูก KanbanLabel ของบอร์ดให้อัตโนมัติ
  if (input.labels && input.labels.length > 0) {
    await applyCardLabelNames(ctx, { id: card.id, boardId: card.boardId }, input.labels);
  }
  // มอบหมายตั้งแต่สร้าง → แจ้งผู้รับ
  if (input.assigneeUserId) {
    await notifyAssignment(input.tenantId, input.systemId, card, input.assigneeUserId);
  }
  // K1.14 — สัญญาณหลัง commit: จออื่นที่เปิดบอร์ดเดียวกันอยู่จะ refresh มาเห็นการ์ดใบใหม่ภายใน ~2 วิ
  await publishBoardSignal(ctx, card.boardId, boardSignal({ type: "card.created", boardId: card.boardId, cardId: card.id, columnId: col.id }));
  return card;
}

export async function updateCard(input: {
  tenantId: string;
  systemId: string;
  cardId: string;
  title?: string;
  description?: string | null;
  assigneeUserId?: string | null;
  dueAt?: Date | null;
  labels?: string[];
}) {
  const data: Prisma.KanbanCardUpdateManyMutationInput = {};
  if (input.title !== undefined) data.title = input.title;
  if (input.description !== undefined) data.description = input.description;
  if (input.assigneeUserId !== undefined) data.assigneeUserId = input.assigneeUserId;
  if (input.dueAt !== undefined) data.dueAt = input.dueAt;
  // 🔴 `labels` ไม่เขียนตรงที่นี่แล้ว — ผ่าน applyCardLabelNames เพื่อให้แถวเชื่อมกับ Json ตรงกัน (K1.2)
  if (Object.keys(data).length === 0 && input.labels === undefined) return;
  // อ่าน assignee เดิมก่อน เพื่อแจ้งเฉพาะเมื่อ "เปลี่ยนผู้รับเป็นคนใหม่" (ไม่แจ้งซ้ำถ้าเดิมคนเดียวกัน)
  const before = await prisma.kanbanCard.findFirst({
    where: { id: input.cardId, tenantId: input.tenantId, systemId: input.systemId },
    select: { id: true, title: true, boardId: true, assigneeUserId: true },
  });
  if (!before) return;
  if (Object.keys(data).length > 0) {
    // K1.10: การแก้ + ประวัติอยู่ tx เดียวกัน (`labels`/`assigneeUserId` มีชนิดของตัวเองอยู่แล้ว
    // จาก `applyCardLabelNames`/`syncSingleAssignee` ด้านล่าง — ที่นี่บันทึกเฉพาะฟิลด์ที่เขียนตรง ๆ)
    const fields = Object.keys(data);
    await prisma.$transaction(async (tx) => {
      await tx.kanbanCard.updateMany({
        where: { id: input.cardId, tenantId: input.tenantId, systemId: input.systemId },
        data,
      });
      await logActivity(tx, {
        tenantId: input.tenantId,
        boardId: before.boardId,
        cardId: before.id,
        actorUserId: null,
        type: "CARD_UPDATED",
        data: { fields },
      });
      if (input.dueAt !== undefined) {
        await logActivity(tx, {
          tenantId: input.tenantId,
          boardId: before.boardId,
          cardId: before.id,
          actorUserId: null,
          type: "CARD_DUE_SET",
          data: { dueAt: input.dueAt ? input.dueAt.toISOString() : null },
        });
      }
    });
  }
  const ctx = { tenantId: input.tenantId, systemId: input.systemId, actorUserId: null };
  if (input.labels !== undefined) {
    await applyCardLabelNames(ctx, { id: before.id, boardId: before.boardId }, input.labels);
  }
  if (input.assigneeUserId !== undefined) {
    await syncSingleAssignee(ctx, before.id, input.assigneeUserId);
  }
  const newAssignee = input.assigneeUserId;
  if (newAssignee != null && newAssignee !== before.assigneeUserId) {
    const title = input.title ?? before.title;
    await notifyAssignment(input.tenantId, input.systemId, { id: before.id, title, boardId: before.boardId }, newAssignee);
  }
}

export async function archiveCard(tenantId: string, systemId: string, cardId: string, actorUserId?: string | null) {
  await prisma.$transaction(async (tx) => {
    const before = await tx.kanbanCard.findFirst({ where: { id: cardId, tenantId, systemId }, select: { boardId: true } });
    if (!before) return;
    await tx.kanbanCard.updateMany({
      where: { id: cardId, tenantId, systemId },
      data: { status: "ARCHIVED", archivedAt: new Date() },
    });
    await logActivity(tx, {
      tenantId,
      boardId: before.boardId,
      cardId,
      actorUserId: actorUserId ?? null,
      type: "CARD_ARCHIVED",
    });
  });
}

// ย้ายการ์ดไปอีกคอลัมน์ (ต่อท้าย) — atomic ใน tx, กัน cross-tenant/board
export async function moveCard(input: {
  tenantId: string;
  systemId: string;
  cardId: string;
  toColumnId: string;
}): Promise<{ ok: boolean }> {
  const { tenantId, systemId, cardId, toColumnId } = input;
  return prisma.$transaction(async (tx) => {
    const card = await tx.kanbanCard.findFirst({
      where: { id: cardId, tenantId, systemId, status: "ACTIVE" },
    });
    if (!card) return { ok: false };
    const col = await tx.kanbanColumn.findFirst({
      where: { id: toColumnId, tenantId, systemId, boardId: card.boardId, status: "ACTIVE" },
    });
    if (!col) return { ok: false };
    if (col.id === card.columnId) return { ok: true };
    const max = await tx.kanbanCard.aggregate({
      where: { columnId: col.id, tenantId, systemId, status: "ACTIVE" },
      _max: { sortOrder: true },
    });
    // 🔴 ต้องเขียน `position` ใหม่ด้วย (dual-write · D10): คีย์เดิมเป็นของคอลัมน์เก่า
    //    ถ้าไม่เขียน การ์ดจะไปโผล่กลางคอลัมน์ปลายทางตามคีย์เก่า (getBoard เรียงด้วย position แล้ว)
    //    ย้ายแบบเลือกตำแหน่ง (before/after) มาใน K1.4 — ที่นี่คือ "ต่อท้ายคอลัมน์ปลายทาง"
    const lastInTarget = await tx.kanbanCard.findFirst({
      where: { columnId: col.id, tenantId, systemId, status: "ACTIVE", position: { not: null } },
      orderBy: { position: "desc" },
      select: { position: true },
    });
    await tx.kanbanCard.update({
      where: { id: card.id },
      data: {
        columnId: col.id,
        sortOrder: (max._max.sortOrder ?? -1) + 1,
        position: keyBetween(lastInTarget?.position ?? null, null),
      },
    });
    await logActivity(tx, {
      tenantId,
      boardId: card.boardId,
      cardId: card.id,
      actorUserId: null,
      type: "CARD_MOVED",
      data: { fromColumnId: card.columnId, toColumnId: col.id },
    });
    return { ok: true };
  });
}

// ย้ายการ์ดไปคอลัมน์ซ้าย/ขวา (ป้าย ◀ ▶ ใน P1)
export async function moveCardSideways(input: {
  tenantId: string;
  systemId: string;
  cardId: string;
  direction: "left" | "right";
}): Promise<{ ok: boolean }> {
  const { tenantId, systemId, cardId, direction } = input;
  const card = await prisma.kanbanCard.findFirst({
    where: { id: cardId, tenantId, systemId, status: "ACTIVE" },
  });
  if (!card) return { ok: false };
  const columns = await prisma.kanbanColumn.findMany({
    where: { tenantId, systemId, boardId: card.boardId, status: "ACTIVE" },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
  const idx = columns.findIndex((c) => c.id === card.columnId);
  const targetIdx = direction === "left" ? idx - 1 : idx + 1;
  if (idx < 0 || targetIdx < 0 || targetIdx >= columns.length) return { ok: false };
  return moveCard({ tenantId, systemId, cardId, toColumnId: columns[targetIdx].id });
}

// ───────────────────────── Assignee helpers ─────────────────────────

// รายชื่อผู้ใช้ใน tenant (สำหรับ dropdown ผู้รับผิดชอบ) — accepted members เท่านั้น
export async function listTenantUsers(tenantId: string) {
  const memberships = await prisma.membership.findMany({
    where: { tenantId, acceptedAt: { not: null } },
    include: { user: true },
    orderBy: { createdAt: "asc" },
  });
  return memberships.map((m) => ({
    userId: m.userId,
    name: m.user.name ?? m.user.email,
    email: m.user.email,
  }));
}

// ───────────────── K1.5: ข้อมูลของ "หน้าบอร์ดใหม่" (DTO ที่ส่งข้าม RSC ได้) ─────────────────
//
// รวมทุกอย่างที่หน้า `/app/sys/{id}/kanban/b/{boardId}` ต้องใช้ไว้ที่เดียว (บอร์ด+คอลัมน์+การ์ด+ป้าย+
// ผู้รับผิดชอบ+สาขา+ดาว) แล้วแปลงเป็นชนิดที่ไม่มี Date/Prisma model ติดไปฝั่ง client
// 🔴 ผ่าน `getBoardFor` เสมอ ⇒ บอร์ดที่มองไม่เห็น = `KanbanNotFoundError` (หน้าแปลงเป็น notFound())

const TAG_COLORS: readonly KanbanLabelColor[] = ["SLATE", "BLUE", "GREEN", "AMBER", "RED", "PURPLE"];

export async function getBoardView(
  ctx: KanbanCtx,
  actor: KanbanActor,
  boardId: string,
): Promise<BoardViewDto> {
  const board = await getBoardFor(ctx, actor, boardId);
  const cardIds = board.columns.flatMap((c) => c.cards.map((k) => k.id));

  // K3.7 — การ์ดสะท้อนไม่มีเนื้อหาของตัวเอง (ป้าย/ผู้รับผิดชอบ/เช็คลิสต์/ไฟล์แนบ/ปก/กำหนดส่ง) — อ่านของ
  // ต้นฉบับมาแปะแทนบนหน้าบอร์ด (สัญญา K3.7: "ป้าย/ผู้รับผิดชอบ/เช็คลิสต์/ไฟล์ … แสดงจากต้นฉบับ")
  // ⇒ ขยายชุด cardId ที่ยิงถามป้าย/ผู้รับผิดชอบ/ตราต่าง ๆ ให้รวมต้นฉบับด้วย แล้วตอนประกอบ DTO สลับไปอ่าน
  // จาก "รหัสต้นฉบับ" เมื่อการ์ดใบนั้นเป็นตัวสะท้อน
  const sourceIdOfCard = new Map<string, string>();
  for (const c of board.columns.flatMap((col) => col.cards)) {
    if (c.mirrorOfId) sourceIdOfCard.set(c.id, c.mirrorOfId);
  }
  const sourceIds = Array.from(new Set(sourceIdOfCard.values()));
  const dataCardIds = Array.from(new Set([...cardIds, ...sourceIds]));

  const [labelRows, cardLabels, assigneeRows, unit, star, memberRows, checklistCountRows, commentCountRows, attachmentCountRows, fieldsOnCardByCard, automationButtons, linksOfCard, sourceCardRows] = await Promise.all([
    prisma.kanbanLabel.findMany({
      where: { boardId: board.id, tenantId: ctx.tenantId, systemId: ctx.systemId },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      select: { id: true, name: true, color: true },
    }),
    dataCardIds.length
      ? prisma.kanbanCardLabel.findMany({
          where: { cardId: { in: dataCardIds }, tenantId: ctx.tenantId },
          select: { cardId: true, labelId: true },
        })
      : Promise.resolve([] as { cardId: string; labelId: string }[]),
    dataCardIds.length
      ? prisma.kanbanCardAssignee.findMany({
          where: { cardId: { in: dataCardIds }, tenantId: ctx.tenantId },
          orderBy: { assignedAt: "asc" },
          select: { cardId: true, userId: true },
        })
      : Promise.resolve([] as { cardId: string; userId: string }[]),
    board.unitId
      ? prisma.businessUnit.findFirst({
          where: { id: board.unitId, tenantId: ctx.tenantId },
          select: { name: true },
        })
      : Promise.resolve(null),
    ctx.actorUserId
      ? prisma.kanbanBoardStar.findFirst({
          where: { boardId: board.id, userId: ctx.actorUserId, tenantId: ctx.tenantId },
          select: { boardId: true },
        })
      : Promise.resolve(null),
    prisma.kanbanBoardMember.findMany({
      where: { boardId: board.id, tenantId: ctx.tenantId },
      orderBy: { createdAt: "asc" },
      select: { userId: true },
    }),
    // K1.7: ตราเช็คลิสต์ n/m ของทุกการ์ด — คิวรีเดียว (join + group by cardId) ไม่ใช่ต่อการ์ด (กัน N+1)
    // K3.7: `dataCardIds` รวมต้นฉบับของตัวสะท้อนด้วย (ไม่ใช่แค่การ์ดของบอร์ดนี้)
    dataCardIds.length
      ? prisma.$queryRaw<{ cardId: string; total: bigint; done: bigint }[]>`
          SELECT ch."cardId" as "cardId",
                 COUNT(i.id) as total,
                 COUNT(i.id) FILTER (WHERE i.done) as done
          FROM "KanbanChecklist" ch
          JOIN "KanbanChecklistItem" i ON i."checklistId" = ch.id
          WHERE ch."cardId" IN (${Prisma.join(dataCardIds)})
          GROUP BY ch."cardId"
        `
      : Promise.resolve([] as { cardId: string; total: bigint; done: bigint }[]),
    // K1.8: ตราจำนวนความเห็นของทุกการ์ด — คิวรีเดียว (group by cardId) ไม่ใช่ต่อการ์ด (กัน N+1)
    dataCardIds.length
      ? prisma.$queryRaw<{ cardId: string; total: bigint }[]>`
          SELECT c."cardId" as "cardId", COUNT(c.id) as total
          FROM "KanbanComment" c
          WHERE c."cardId" IN (${Prisma.join(dataCardIds)}) AND c."deletedAt" IS NULL
          GROUP BY c."cardId"
        `
      : Promise.resolve([] as { cardId: string; total: bigint }[]),
    // K1.9: ตราจำนวนไฟล์แนบของทุกการ์ด — คิวรีเดียว (group by cardId) ไม่ใช่ต่อการ์ด (กัน N+1)
    dataCardIds.length
      ? prisma.$queryRaw<{ cardId: string; total: bigint }[]>`
          SELECT a."cardId" as "cardId", COUNT(a.id) as total
          FROM "KanbanAttachment" a
          WHERE a."cardId" IN (${Prisma.join(dataCardIds)}) AND a."deletedAt" IS NULL
          GROUP BY a."cardId"
        `
      : Promise.resolve([] as { cardId: string; total: bigint }[]),
    // K2.6: ชิปฟิลด์กำหนดเองของทุกการ์ด (เฉพาะ showOnCard=true ที่มีค่าแล้ว) — คิวรีเดียว (กัน N+1)
    fieldsOnCardForCards(ctx.tenantId, board.id, cardIds),
    // K2.9: ปุ่มอัตโนมัติของหัวบอร์ด (kind BOARD_BUTTON ที่เปิดอยู่) · อ่าน prisma ตรงที่นี่
    // ไม่ import `automation.ts` (ไฟล์นั้น import `service.ts` อยู่แล้ว — เรียกกลับ = import วงกลม)
    prisma.automationRule.findMany({
      where: { tenantId: ctx.tenantId, boardId: board.id, kind: "BOARD_BUTTON", enabled: true },
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true },
    }),
    // K3.1: ชิป 🔗 n ของทุกการ์ด — คิวรีเดียว (groupBy cardId) ไม่ใช่ต่อการ์ด (กัน N+1)
    // 🔴 เป็นแค่ "จำนวนของที่ผูกอยู่" ไม่ใช่รายละเอียด ⇒ ไม่ตัดสินสิทธิ์รายชิ้นที่นี่
    //    (รายละเอียด + ด่านสิทธิ์อยู่ที่ `listCardLinks` ตอนเปิดหลังการ์ด)
    linkCountsOfCards(ctx, cardIds),
    // K3.7 — แถวต้นฉบับของทุกตัวสะท้อนบนบอร์ดนี้ (กำหนดส่ง/เสร็จ/ปก/บอร์ด/เลขการ์ด/สถานะ) — คิวรีเดียว
    sourceIds.length
      ? prisma.kanbanCard.findMany({
          where: { id: { in: sourceIds }, tenantId: ctx.tenantId, systemId: ctx.systemId },
          select: { id: true, boardId: true, cardNo: true, dueAt: true, completedAt: true, coverFileId: true, status: true },
        })
      : Promise.resolve([] as { id: string; boardId: string; cardNo: number | null; dueAt: Date | null; completedAt: Date | null; coverFileId: string | null; status: string }[]),
  ]);
  const checklistOfCard = new Map(
    checklistCountRows.map((r) => [r.cardId, { done: Number(r.done), total: Number(r.total) }]),
  );
  const commentsOfCard = new Map(commentCountRows.map((r) => [r.cardId, Number(r.total)]));
  const attachmentsOfCard = new Map(attachmentCountRows.map((r) => [r.cardId, Number(r.total)]));

  // K3.7 — ต้นฉบับของตัวสะท้อน: id → แถว · boardId ต้นฉบับ → ชื่อบอร์ด (สำหรับชิป "สะท้อนจาก {บอร์ด} #n")
  const sourceCardById = new Map(sourceCardRows.map((c) => [c.id, c]));
  const sourceBoardIds = Array.from(new Set(sourceCardRows.map((c) => c.boardId)));
  const sourceBoardRows = sourceBoardIds.length
    ? await prisma.kanbanBoard.findMany({ where: { id: { in: sourceBoardIds } }, select: { id: true, name: true } })
    : [];
  const sourceBoardNameById = new Map(sourceBoardRows.map((b) => [b.id, b.name]));

  // K1.9: ปกการ์ด — โหลด FileAsset.cdnUrl ของทุก coverFileId ที่ใช้อยู่ในบอร์ดนี้ (คิวรีเดียว)
  // K3.7: ตัวสะท้อนไม่มีปกของตัวเอง — ใช้ปกของต้นฉบับแทน
  const coverFileIds = Array.from(
    new Set(
      board.columns
        .flatMap((c) => c.cards)
        .map((k) => {
          const srcId = sourceIdOfCard.get(k.id);
          return srcId ? (sourceCardById.get(srcId)?.coverFileId ?? null) : k.coverFileId;
        })
        .filter((v): v is string => !!v),
    ),
  );
  const coverFiles = coverFileIds.length
    ? await prisma.fileAsset.findMany({ where: { id: { in: coverFileIds } }, select: { id: true, cdnUrl: true } })
    : [];
  const coverUrlOfFile = new Map(coverFiles.map((f) => [f.id, f.cdnUrl]));

  // ชื่อคน: สมาชิกบอร์ด + ผู้รับผิดชอบการ์ด (แถวรูปคนหัวบอร์ดใช้ชุดเดียวกับ avatar บนการ์ด)
  const peopleIds = Array.from(
    new Set<string>([...memberRows.map((m) => m.userId), ...assigneeRows.map((a) => a.userId)]),
  );
  const users = peopleIds.length
    ? await prisma.user.findMany({
        where: { id: { in: peopleIds } },
        select: { id: true, name: true, email: true },
      })
    : [];
  const nameOf = new Map(users.map((u) => [u.id, u.name ?? u.email ?? u.id]));

  // K2.11 — "ฉันติดตามบอร์ด/คอลัมน์ไหนบ้าง" (คิวรีเดียวต่อการเปิดบอร์ด — ไม่ยิงต่อคอลัมน์)
  const watchState = await boardWatchState(ctx, board.id, board.columns.map((c) => c.id));

  const labelById = new Map(labelRows.map((l) => [l.id, { id: l.id, name: l.name, color: l.color as KanbanTagColor }]));
  const labelsOfCard = new Map<string, BoardLabelDto[]>();
  for (const cl of cardLabels) {
    const label = labelById.get(cl.labelId);
    if (!label) continue;
    const list = labelsOfCard.get(cl.cardId) ?? [];
    list.push(label);
    labelsOfCard.set(cl.cardId, list);
  }
  const peopleOfCard = new Map<string, BoardPersonDto[]>();
  for (const a of assigneeRows) {
    const list = peopleOfCard.get(a.cardId) ?? [];
    list.push({ userId: a.userId, name: nameOf.get(a.userId) ?? a.userId });
    peopleOfCard.set(a.cardId, list);
  }

  return {
    id: board.id,
    systemId: ctx.systemId,
    name: board.name,
    role: board.role,
    viewerUserId: ctx.actorUserId ?? "",
    visibility: board.visibility,
    unitName: unit?.name ?? null,
    starred: star !== null,
    watched: watchState.board,
    watchedColumnIds: watchState.columnIds,
    labels: labelRows.map((l) => ({ id: l.id, name: l.name, color: l.color as KanbanTagColor })),
    members: peopleIds.map((id) => ({ userId: id, name: nameOf.get(id) ?? id })),
    now: new Date().toISOString(),
    // VIEWER กดปุ่มอัตโนมัติไม่ได้ (ต้อง EDITOR) ⇒ ไม่ต้องเห็นปุ่มที่กดแล้วเด้ง error
    automationButtons: board.role === "VIEWER" ? [] : automationButtons,
    columns: board.columns.map((col) => ({
      id: col.id,
      name: col.name,
      position: col.position,
      wipLimit: col.wipLimit,
      isDoneColumn: col.isDoneColumn,
      cards: col.cards.map((card) => {
        // K3.7 — ตัวสะท้อน: อ่านป้าย/ผู้รับผิดชอบ/เช็คลิสต์/ไฟล์/กำหนดส่ง/ปก จากต้นฉบับ (lookupId) แทน
        // ของตัวเอง (ที่ไม่เคยมีใครเขียนอะไรลงไปเลย) · `id`/`cardNo`/`title`/`position` ยังเป็นของตัวเอง
        const sourceId = sourceIdOfCard.get(card.id);
        const sourceCard = sourceId ? sourceCardById.get(sourceId) : undefined;
        const lookupId = sourceId ?? card.id;
        const mirror: BoardCardMirrorDto | null = sourceCard
          ? { sourceBoardName: sourceBoardNameById.get(sourceCard.boardId) ?? "", sourceCardNo: sourceCard.cardNo, sourceArchived: sourceCard.status === "ARCHIVED" }
          : null;
        const coverFileId = sourceCard ? sourceCard.coverFileId : card.coverFileId;
        return toBoardCardDto(
          sourceCard ? { ...card, dueAt: sourceCard.dueAt, completedAt: sourceCard.completedAt } : card,
          labelsOfCard.get(lookupId) ?? [],
          peopleOfCard.get(lookupId) ?? [],
          checklistOfCard.get(lookupId),
          commentsOfCard.get(lookupId),
          {
            count: attachmentsOfCard.get(lookupId) ?? 0,
            coverUrl: coverFileId ? (coverUrlOfFile.get(coverFileId) ?? null) : null,
          },
          fieldsOnCardByCard.get(card.id) ?? [],
          linksOfCard.get(card.id) ?? 0,
          mirror,
        );
      }),
    })),
  };
}

/**
 * K3.3 — prefix ของ `sourceKey` ที่สะพานขาเข้า (`platform/kanban-bridges`) ตั้งไว้ → ชนิดที่มาบนชิปการ์ด
 * ตั้งใจอ่านจาก `sourceKey` ไม่ใช่เพิ่มคอลัมน์ใหม่: ค่านี้ถูกเขียนตอนสร้างการ์ดอยู่แล้วและห้ามเปลี่ยน
 * (เป็นกุญแจกันซ้ำ) ⇒ ไม่มีทางหลุดออกจากกัน และไม่ต้องไมเกรตข้อมูลเก่า
 */
function sourceKindOf(sourceKey: string | null): BoardCardDto["sourceKind"] {
  if (!sourceKey) return null;
  if (sourceKey.startsWith("approval:")) return "APPROVAL";
  if (sourceKey.startsWith("hrleave:")) return "HR_LEAVE";
  if (sourceKey.startsWith("possale:")) return "POS_SALE";
  return null;
}

/** การ์ด 1 ใบ → DTO (ใช้ทั้งตอนโหลดหน้าและตอนเพิ่งสร้างการ์ดใหม่จาก action) */
export function toBoardCardDto(
  card: KanbanCard,
  labels: BoardLabelDto[],
  assignees: BoardPersonDto[],
  checklist?: { done: number; total: number },
  commentCount?: number,
  attachment?: { count: number; coverUrl: string | null },
  fieldsOnCard?: FieldOnCardDto[],
  linkCount?: number,
  /** K3.7: ไม่ใช่ตัวสะท้อน = undefined/null */
  mirror?: BoardCardMirrorDto | null,
): BoardCardDto {
  return {
    // K2.7: ชิป 🔁 — "แม่" ของงานประจำเท่านั้น (ลูกไม่มี recurrenceRule ของตัวเอง — ดู recurrence.ts)
    isRecurring: card.recurrenceRule != null,
    id: card.id,
    cardNo: card.cardNo,
    title: card.title,
    position: card.position,
    dueAt: card.dueAt ? card.dueAt.toISOString() : null,
    completedAt: card.completedAt ? card.completedAt.toISOString() : null,
    labels,
    assignees,
    // K1.7: ตราเช็คลิสต์ n/m ของจริง (ค่าเริ่มต้น 0/0 สำหรับการ์ดที่เพิ่งสร้าง/ยังไม่มีเช็คลิสต์)
    checklistDone: checklist?.done ?? 0,
    checklistTotal: checklist?.total ?? 0,
    // K1.9: ตราจำนวนไฟล์แนบของจริง (ค่าเริ่มต้น 0 สำหรับการ์ดที่เพิ่งสร้าง/ยังไม่มีไฟล์แนบ)
    attachmentCount: attachment?.count ?? 0,
    // K1.8: ตราจำนวนความเห็นของจริง (ค่าเริ่มต้น 0 สำหรับการ์ดที่เพิ่งสร้าง/ยังไม่มีความเห็น)
    commentCount: commentCount ?? 0,
    // K1.9: ปกการ์ดของจริง (ค่าเริ่มต้น null สำหรับการ์ดที่เพิ่งสร้าง/ยังไม่ตั้งปก)
    coverUrl: attachment?.coverUrl ?? null,
    sourceType: card.sourceType,
    // K3.3: ที่มาแบบละเอียด (ใบลา/คำขออนุมัติ/บิลยกเลิก ใช้ sourceType AUTOMATION เหมือนกันหมด)
    sourceKind: sourceKindOf(card.sourceKey),
    // K2.6: ชิปฟิลด์กำหนดเอง (ค่าเริ่มต้น [] สำหรับการ์ดที่เพิ่งสร้าง/ยังไม่มีฟิลด์ที่ตั้ง showOnCard)
    fieldsOnCard: fieldsOnCard ?? [],
    // K3.1: ชิป 🔗 n (ค่าเริ่มต้น 0 สำหรับการ์ดที่เพิ่งสร้าง/ยังไม่ผูกอะไร)
    linkCount: linkCount ?? 0,
    // K3.7: ชิปสะท้อน (null = ไม่ใช่ตัวสะท้อน)
    mirror: mirror ?? null,
  };
}

/** ป้ายสี 6 สีตามลำดับ (D9) — ใช้ตอนสร้างป้ายใหม่จากหน้าบอร์ด */
export function tagColorAt(i: number): KanbanLabelColor {
  return TAG_COLORS[i % TAG_COLORS.length]!;
}

// ───────────────── K1.6: DTO ของป้าย/ผู้รับผิดชอบของ "การ์ดใบเดียว" ─────────────────
// ใช้ตอนตอบกลับ action ที่คืนการ์ดทั้งใบ (ทำสำเนา/กู้คืน) ให้ BoardView แปะลง state ได้ทันที
// โดยไม่ต้องโหลดทั้งบอร์ดใหม่ — เหมือน `getBoardView` แต่ย่อขนาดลงมาเหลือการ์ดเดียว

export async function listCardLabelDtos(ctx: KanbanCtx, cardId: string): Promise<BoardLabelDto[]> {
  const rows = await prisma.kanbanCardLabel.findMany({
    where: { cardId, tenantId: ctx.tenantId },
    include: { label: { select: { id: true, name: true, color: true } } },
  });
  return rows.map((r) => ({ id: r.label.id, name: r.label.name, color: r.label.color as KanbanTagColor }));
}

export async function listCardAssigneeDtos(ctx: KanbanCtx, cardId: string): Promise<BoardPersonDto[]> {
  const rows = await prisma.kanbanCardAssignee.findMany({
    where: { cardId, tenantId: ctx.tenantId },
    orderBy: { assignedAt: "asc" },
    select: { userId: true },
  });
  if (rows.length === 0) return [];
  const userIds = rows.map((r) => r.userId);
  const users = await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true, email: true } });
  const nameOf = new Map(users.map((u) => [u.id, u.name ?? u.email ?? u.id]));
  return userIds.map((userId) => ({ userId, name: nameOf.get(userId) ?? userId }));
}
