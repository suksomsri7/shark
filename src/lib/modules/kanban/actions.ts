"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireTenant } from "@/lib/core/context";
import { assertCan, evaluate as can, ForbiddenError } from "@/lib/core/rbac";
import {
  archiveBoard,
  archiveCard,
  canReadKanban,
  createBoard,
  createCard,
  createColumn,
  listCardAssigneeDtos,
  listCardLabelDtos,
  renameBoard,
  toActor,
  toBoardCardDto,
  updateCard,
} from "./service";
// K1.4 — การย้ายทุกชนิดเดินผ่าน `moves.ts` (fractional index + WIP + คอลัมน์เสร็จ + เหตุการณ์)
// 🔴 `archiveColumn`/`renameColumn` ของ moves ตรวจบทบาทบอร์ดเอง และ **ไม่เก็บการ์ดตามไปเงียบ ๆ**
//    เหมือนตัวเดิมใน service.ts (พิมพ์เขียว §5.3) — ตั้งชื่อ import ให้ชัดว่าเป็นคนละตัวกัน
import {
  archiveColumn as archiveColumnEmpty,
  moveAllCards,
  moveCard,
  moveCardSideways,
  moveColumn,
  renameColumn as renameColumnV2,
  setColumnDone,
  setColumnWip,
} from "./moves";
import { assertBoardRole, assertCardRole, assertColumnRole, starBoard, unstarBoard } from "./members";
// K1.6 — หลังการ์ด: แก้ฟิลด์/ทำสำเนา/เก็บ-กู้คืน อยู่ที่ cards.ts (ชื่อ `archiveCard` ชนกับตัวเดิมของ
// service.ts ที่ actions.ts ใช้อยู่แล้ว → ตั้งชื่อ import ให้ชัดว่าเป็นคนละตัว เหมือนแพตเทิร์นของ moves.ts ข้างบน)
import {
  archiveCard as archiveCardV2,
  bulkUpdate,
  duplicateCard,
  getCardDetail,
  restoreCard,
  setCardAssignees,
  updateCardFields,
  type BulkUpdatePatch,
} from "./cards";
import { createLabel, setCardLabels } from "./labels";
import type { ArchiveListDto } from "./types";
// K1.14 — คลังเก็บ + การตั้งค่าส่วนตัว (ปุ่มลัด)
import { listArchived, restoreColumn } from "./archive";
import { parsePreferences, setUserPreferences } from "./preferences";
// K2.11 — ติดตาม (watch) + ความถี่อีเมลของแต่ละคน
import { requireActor, unwatch, watch } from "./watch";
// K3.1 — เชื่อมข้อมูล SHARK (ด่านบทบาทบอร์ด EDITOR/VIEWER ตรวจใน `links.ts`/`link-resolvers.ts` เอง
// ที่นี่ตรวจแค่ชั้นสิทธิ์โมดูล เหมือน action อื่นของไฟล์นี้)
import { addLink, removeLink, searchPartiesForLink } from "./links";
// K3.5 — ปุ่มผู้ช่วย AI ในหลังการ์ด (ด่าน EDITOR + การเรียกโมเดล/เครดิตอยู่ในไฟล์นั้น)
import {
  acceptChecklistSuggestion,
  draftReply,
  suggestChecklist,
  summarizeCard,
  type ChecklistSuggestion,
} from "./ai";
// K3.2 — สวิตช์ "การเชื่อมต่อ" รายร้าน (เก็บใน AppSystem.settings.integrations)
import {
  getIntegrations,
  listTaskTargetBoards,
  setIntegrations,
  type IntegrationBoardOption,
  type IntegrationsPatch,
  type KanbanIntegrations,
} from "./integrations";
import { listCardLinks } from "./link-resolvers";
import type { CardLinkDto, KanbanLinkKind, KanbanLinkRole } from "./types";
import type { KanbanDigestMode, KanbanEmailMode } from "@/lib/core/user-preferences";
// K1.7 — เช็คลิสต์: `checklistProgressOfCard` ใช้ตอนคืนการ์ดเดี่ยวจาก action (ทำสำเนา/กู้คืน)
// เพื่อให้ตรา n/m บนการ์ดที่เพิ่งแทรกกลับเข้าบอร์ดถูกต้องทันที ไม่ต้องรอโหลดบอร์ดใหม่ทั้งใบ
import {
  addItem as addChecklistItem,
  checklistProgressOfCard,
  createChecklist,
  deleteChecklist,
  deleteItem as deleteChecklistItem,
  editItem as editChecklistItem,
  getCardChecklists,
  moveItem as moveChecklistItem,
  renameChecklist,
  toggleItem as toggleChecklistItem,
} from "./checklists";
// K1.8 — ความเห็น + @mention (บริการอยู่ `comments.ts` · แจ้งเตือนยิงตรงคนใน `notify.ts`)
import {
  addComment,
  deleteComment,
  editComment,
  listComments,
  listMentionTargets,
} from "./comments";
// K1.9 — ไฟล์แนบ + ปก (บริการอยู่ `attachments.ts` · เก็บผ่าน storage กลาง)
import { addAttachment, attachmentBadgeOfCard, listAttachments, removeAttachment, setCover } from "./attachments";
// K1.10 — ประวัติกิจกรรม (อ่านอย่างเดียวจากฝั่ง action · การเขียนเกิดใน tx ของงานจริงเสมอ)
import { listBoardActivity, listCardTimeline } from "./activity";
// K1.11 — ตัวกรอง + ค้นหาข้ามบอร์ด (บริการอยู่ `search.ts` · SearchPalette ส่ง "ข้อความดิบ" มาที่นี่
// แล้วให้ `parseSearchQuery` แปลงไวยากรณ์ไทยครั้งเดียวที่ server กันไม่ให้ตรรกะซ้ำสองที่)
import { parseSearchQuery, searchCards, type SearchCardDto } from "./search";
// K1.12 — เทมเพลตบอร์ด + หน้ารวมบอร์ดใหม่ (บริการอยู่ `templates.ts`/`boardsHome.ts`)
import { createBoardFromTemplate, deleteTenantTemplate, saveBoardAsTemplate } from "./templates";
// K1.13 — งานของฉันใหม่ + ปัดเสร็จ/เก็บมือถือ + undo (บริการอยู่ `my-tasks.ts`)
import { archiveWithUndo, completeCard, undo } from "./my-tasks";
import { normalizeUploadType } from "@/lib/storage/service";
// K2.1 — มุมมองตาราง: เลือกหลายรายการ (`cards.bulkUpdate` — import ไว้กับ cards.ts ข้างบน) · ส่งออก CSV (`reports.ts`)
// K2.10 — รายงาน (5 รายงานเรียกตรงจาก page.tsx เหมือน K2.9/automation — ที่นี่มีแค่ action ส่งออก CSV ของแท็บที่เปิดอยู่)
import { exportCardsCsv, exportReportCsv } from "./reports";
import type { ReportKind } from "./types";
// K2.2 — มุมมองปฏิทิน: ลากตั้ง/เปลี่ยนกำหนดส่ง (บริการอยู่ `calendar.ts` — `listBoardCalendar` เรียกตรงจาก page.tsx)
import { setCardDueFromCalendar } from "./calendar";
// K2.3 — มุมมองไทม์ไลน์: ลากขอบ/ลากตัวแถบ (บริการอยู่ `timeline.ts` — `listBoardTimeline` เรียกตรงจาก page.tsx)
import { setCardRange, shiftCardRange } from "./timeline";
import type { BoardFilters } from "./filters";
import type {
  BoardCardDto,
  BoardLabelDto,
  CardDetailDto,
  CardFieldValueDto,
  CustomFieldDto,
  KanbanActivityDto,
  KanbanAttachmentDto,
  KanbanChecklistDto,
  KanbanCommentDto,
  KanbanCtx,
  KanbanTimelineFilter,
  KanbanTimelineItemDto,
  SavedViewDto,
} from "./types";
// K2.5 — มุมมองที่บันทึกไว้ (บริการอยู่ `views.ts` — สิทธิ์ 2 ชั้นตรวจในนั้นเอง ที่นี่แค่ตรวจสิทธิ์โมดูล)
import { deleteView, reorderViews, saveView, updateView } from "./views";
// K2.6 — ฟิลด์กำหนดเอง (บริการอยู่ `fields.ts` — บทบาทบอร์ด 2 ชั้นตรวจในนั้นเอง ที่นี่แค่ตรวจสิทธิ์โมดูล)
import { createField, deleteField, reorderFields, setCardFieldValue, updateField } from "./fields";
// K2.7 — เทมเพลตการ์ด (บริการอยู่ `card-templates.ts`) + กำหนดส่งซ้ำ (บริการอยู่ `recurrence.ts`)
// บทบาทบอร์ด 2 ชั้นตรวจในไฟล์บริการเองเสมอ — ที่นี่แค่ตรวจสิทธิ์โมดูล
import {
  createCardFromTemplate,
  deleteCardTemplate,
  reorderCardTemplates,
  saveAsCardTemplate,
  updateCardTemplate,
} from "./card-templates";
import { describeRecurrence, setCardRecurrence } from "./recurrence";
// K2.8 — กล่องงานเข้าส่วนตัว (บริการอยู่ `inbox.ts` — ความเป็นเจ้าของ/บทบาทบอร์ด 2 ชั้นตรวจในนั้นเอง
// ที่นี่แค่ตรวจสิทธิ์โมดูล เหมือน K2.7)
import { dismiss as dismissInbox, moveToBoard as moveInboxToBoard, quickAdd as quickAddInbox } from "./inbox";
import type { CardTemplateDto, InboxItemDto } from "./types";

// ทุก action: requireTenant → เอา tenantId จาก session (ไม่เชื่อ client) + scope ด้วย systemId

// ตรวจสิทธิ์โมดูล (system-scoped) — OWNER/MANAGER ผ่าน · STAFF ตาม permission
// หมายเหตุ: scope ระดับ systemId รอ kernel Phase ถัดไป (ตอนนี้ตรวจ module+action)
function assertKanbanCan(auth: Awaited<ReturnType<typeof requireTenant>>, action: string) {
  // 🔴 K3.1 (บั๊กที่ builder จับได้): ชั้นที่ 1 "เข้าโมดูลได้" ต้องใช้กติกา read-โดยนัยของ K1.3
  //    (`canReadKanban` — มีคีย์ kanban.* ตัวใดตัวหนึ่ง = อ่านได้) ไม่ใช่ตรวจคีย์ `kanban.board.read` ตรงตัว
  //    ไม่งั้นพนักงานที่เจ้าของติ๊กแค่ `kanban.card.*` เปิดบอร์ดได้แต่เปิดหลังการ์ด/ประวัติ/ลิงก์แล้วได้ 403/500
  if (action === "kanban.board.read") {
    if (canReadKanban(toActor(auth.user.id, auth.active))) return;
    throw new ForbiddenError({ module: "kanban", action });
  }
  assertCan(
    {
      role: auth.active.role,
      unitAccess: auth.active.unitAccess as string[],
      permissions: auth.active.permissions as Record<string, unknown>,
    },
    { module: "kanban", action },
  );
}

/**
 * ผ่านได้ถ้ามีคีย์ใดคีย์หนึ่งในรายการ (K1.8) — ใช้กับ "เขียนความเห็น" ที่มีคีย์เฉพาะของตัวเอง
 * (`kanban.card.comment`) แต่ร้านที่ตั้งสิทธิ์ไว้ก่อนมีคีย์นี้ ติ๊กแค่ `kanban.card.update` ⇒ ถ้าตรวจ
 * ตรงตัวคีย์เดียว พนักงานที่เคยคอมเมนต์ได้จะคอมเมนต์ไม่ได้ทันทีที่ deploy (แพตเทิร์นเดียวกับ
 * backward compat ของ `canReadKanban` ใน K1.3) · ชั้นที่ 2 (บทบาทบอร์ด EDITOR+) ยังตรวจใน service เสมอ
 */
function assertKanbanCanAny(auth: Awaited<ReturnType<typeof requireTenant>>, actions: string[]) {
  const ctx = {
    role: auth.active.role,
    unitAccess: auth.active.unitAccess as string[],
    permissions: auth.active.permissions as Record<string, unknown>,
  };
  if (actions.some((action) => can(ctx, { module: "kanban", action }))) return;
  assertKanbanCan(auth, actions[0]!); // ไม่ผ่านสักคีย์ → ให้ตัวเดิมโยน ForbiddenError รูปแบบเดียวกับที่อื่น
}

// บริบทของโมดูล — tenantId มาจาก session เสมอ (ไม่เชื่อ client) · systemId มาจากฟอร์ม แล้วถูกกรองซ้ำใน service
function ctxOf(auth: Awaited<ReturnType<typeof requireTenant>>, systemId: string): KanbanCtx {
  return { tenantId: auth.active.tenantId, systemId, actorUserId: auth.user.id };
}

// K1.5: หน้าบอร์ดย้ายไป `/kanban/b/{boardId}` (ของเดิม `/kanban/{boardId}` redirect มาที่นี่)
function boardPath(systemId: string, boardId?: string) {
  return boardId ? `/app/sys/${systemId}/kanban/b/${boardId}` : `/app/sys/${systemId}`;
}

function parseDue(raw: string): Date | null {
  const s = raw.trim();
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

// ───────────────────────── Board ─────────────────────────

export async function createBoardAction(formData: FormData) {
  const auth = await requireTenant();
  assertKanbanCan(auth, "kanban.board.create");
  const systemId = String(formData.get("systemId") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  if (!systemId || name.length < 1) return;
  const board = await createBoard({ tenantId: auth.active.tenantId, systemId, name });
  revalidatePath(`/app/sys/${systemId}`);
  redirect(boardPath(systemId, board.id));
}

export async function renameBoardAction(input: { systemId: string; boardId: string; name: string }) {
  const auth = await requireTenant();
  assertKanbanCan(auth, "kanban.board.rename");
  const name = input.name.trim();
  if (!input.systemId || !input.boardId || name.length < 1) return { ok: false as const, message: "ต้องมีชื่อบอร์ด" };
  // ชั้นที่ 2 (K1.3): ตั้งค่าบอร์ด = ADMIN ของบอร์ดใบนั้น · มองไม่เห็น = 404
  await assertBoardRole(ctxOf(auth, input.systemId), input.boardId, "ADMIN");
  await renameBoard(auth.active.tenantId, input.systemId, input.boardId, name, auth.user.id);
  revalidatePath(boardPath(input.systemId, input.boardId));
  return { ok: true as const };
}

/** ติดดาว/เอาดาวออก (ของส่วนตัว · K1.3 มีบริการแล้ว — K1.5 ต่อปุ่มบนหัวบอร์ด) */
export async function starBoardAction(input: { systemId: string; boardId: string; starred: boolean }) {
  const auth = await requireTenant();
  assertKanbanCan(auth, "kanban.board.read");
  if (!input.systemId || !input.boardId) return { ok: false as const };
  const ctx = ctxOf(auth, input.systemId);
  if (input.starred) await starBoard(ctx, input.boardId);
  else await unstarBoard(ctx, input.boardId);
  revalidatePath(`/app/sys/${input.systemId}/kanban/boards`);
  return { ok: true as const };
}

export async function archiveBoardAction(formData: FormData) {
  const auth = await requireTenant();
  assertKanbanCan(auth, "kanban.board.delete");
  const systemId = String(formData.get("systemId") ?? "");
  const boardId = String(formData.get("boardId") ?? "");
  if (!systemId || !boardId) return;
  await assertBoardRole(ctxOf(auth, systemId), boardId, "ADMIN");
  await archiveBoard(auth.active.tenantId, systemId, boardId, auth.user.id);
  revalidatePath(`/app/sys/${systemId}`);
  redirect(`/app/sys/${systemId}`);
}

// ───────────────────────── Column ─────────────────────────

export async function createColumnAction(formData: FormData) {
  const auth = await requireTenant();
  assertKanbanCan(auth, "kanban.column.create");
  const systemId = String(formData.get("systemId") ?? "");
  const boardId = String(formData.get("boardId") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  if (!systemId || !boardId || name.length < 1) return;
  // คอลัมน์/การ์ด = EDITOR ขึ้นไป (ผู้ชมกดไม่ได้ · คนที่มองไม่เห็นบอร์ดได้ 404)
  await assertBoardRole(ctxOf(auth, systemId), boardId, "EDITOR");
  await createColumn(auth.active.tenantId, systemId, boardId, name, auth.user.id);
  revalidatePath(boardPath(systemId, boardId));
}

export async function archiveColumnAction(input: { systemId: string; boardId: string; columnId: string }) {
  const auth = await requireTenant();
  assertKanbanCan(auth, "kanban.column.delete");
  if (!input.systemId || !input.columnId) return { ok: false as const };
  // 🔴 หาบอร์ดจาก columnId จริง ไม่เชื่อ boardId ในฟอร์ม (ไม่งั้นยิงคอลัมน์ของบอร์ดลับผ่านด่านได้)
  //    (ด่านบทบาทบอร์ด ADMIN อยู่ใน `archiveColumnEmpty` แล้ว — เก็บได้เฉพาะคอลัมน์ที่ว่าง · D16)
  await archiveColumnEmpty(ctxOf(auth, input.systemId), input.columnId);
  revalidatePath(boardPath(input.systemId, input.boardId));
  return { ok: true as const };
}

/** ตัวเดียวกันแต่รับ FormData — หน้าบอร์ดเดิม (`ui.tsx`) ใช้กับ `<form action={…}>` ที่ต้องคืน void */
export async function archiveColumnFormAction(formData: FormData) {
  const systemId = String(formData.get("systemId") ?? "");
  const boardId = String(formData.get("boardId") ?? "");
  const columnId = String(formData.get("columnId") ?? "");
  if (!systemId || !columnId) return;
  await archiveColumnAction({ systemId, boardId, columnId });
}

// ── K1.4: คอลัมน์ — เปลี่ยนชื่อ (EDITOR) · ย้ายซ้าย-ขวา (EDITOR) · WIP/ธงเสร็จ (ADMIN) · ย้ายการ์ดออกทั้งคอลัมน์
export async function renameColumnAction(input: { systemId: string; boardId: string; columnId: string; name: string }) {
  const auth = await requireTenant();
  assertKanbanCan(auth, "kanban.column.create");
  const name = input.name.trim();
  if (!input.systemId || !input.columnId || name.length < 1) return { ok: false as const };
  await renameColumnV2(ctxOf(auth, input.systemId), input.columnId, name);
  revalidatePath(boardPath(input.systemId, input.boardId));
  return { ok: true as const };
}

export async function moveColumnAction(input: {
  systemId: string;
  boardId: string;
  columnId: string;
  beforeColumnId?: string | null;
  afterColumnId?: string | null;
}) {
  const auth = await requireTenant();
  assertKanbanCan(auth, "kanban.column.create");
  if (!input.systemId || !input.columnId) return { ok: false as const };
  const res = await moveColumn(ctxOf(auth, input.systemId), {
    columnId: input.columnId,
    beforeColumnId: input.beforeColumnId ?? null,
    afterColumnId: input.afterColumnId ?? null,
  });
  revalidatePath(boardPath(input.systemId, input.boardId));
  return { ok: true as const, position: res.position, placedAt: res.placedAt };
}

export async function setColumnWipAction(input: {
  systemId: string;
  boardId: string;
  columnId: string;
  wipLimit: number | null;
}) {
  const auth = await requireTenant();
  assertKanbanCan(auth, "kanban.column.create");
  if (!input.systemId || !input.columnId) return { ok: false as const };
  // null = ไม่จำกัด · ค่าที่ไม่ใช่ตัวเลข/0/ติดลบ ถูกปฏิเสธพร้อมข้อความไทยใน service
  await setColumnWip(ctxOf(auth, input.systemId), input.columnId, input.wipLimit);
  revalidatePath(boardPath(input.systemId, input.boardId));
  return { ok: true as const };
}

export async function setColumnDoneAction(input: {
  systemId: string;
  boardId: string;
  columnId: string;
  isDone: boolean;
}) {
  const auth = await requireTenant();
  assertKanbanCan(auth, "kanban.column.create");
  if (!input.systemId || !input.columnId) return { ok: false as const };
  await setColumnDone(ctxOf(auth, input.systemId), input.columnId, input.isDone);
  revalidatePath(boardPath(input.systemId, input.boardId));
  return { ok: true as const };
}

export async function moveAllCardsAction(input: {
  systemId: string;
  boardId: string;
  fromColumnId: string;
  toColumnId: string;
}) {
  const auth = await requireTenant();
  assertKanbanCan(auth, "kanban.card.move");
  if (!input.systemId || !input.fromColumnId || !input.toColumnId) return { ok: false as const };
  await moveAllCards(ctxOf(auth, input.systemId), { fromColumnId: input.fromColumnId, toColumnId: input.toColumnId });
  revalidatePath(boardPath(input.systemId, input.boardId));
  return { ok: true as const };
}

// ───────────────────────── Card ─────────────────────────

export async function createCardAction(input: {
  systemId: string;
  boardId: string;
  columnId: string;
  title: string;
  assigneeUserId?: string | null;
  dueAt?: string | null;
}): Promise<{ ok: true; card: BoardCardDto } | { ok: false; message: string }> {
  const auth = await requireTenant();
  assertKanbanCan(auth, "kanban.card.create");
  const title = input.title.trim();
  if (!input.systemId || !input.columnId || title.length < 1) {
    return { ok: false, message: "ต้องมีชื่องานก่อนถึงจะเพิ่มการ์ดได้" };
  }
  await assertColumnRole(ctxOf(auth, input.systemId), input.columnId, "EDITOR");
  const card = await createCard({
    tenantId: auth.active.tenantId,
    systemId: input.systemId,
    columnId: input.columnId,
    title,
    assigneeUserId: input.assigneeUserId ?? null,
    dueAt: input.dueAt ? parseDue(input.dueAt) : null,
  });
  // คอลัมน์ถูกเก็บเข้าคลังไประหว่างที่หน้าเปิดค้างอยู่ = createCard คืน null (ไม่ throw)
  if (!card) return { ok: false, message: "คอลัมน์นี้ถูกเก็บเข้าคลังไปแล้ว — โหลดบอร์ดใหม่อีกครั้ง" };
  revalidatePath(boardPath(input.systemId, input.boardId));
  // คืน DTO ให้หน้าบอร์ดแทรกการ์ดใหม่ได้ทันทีโดยไม่ต้องโหลดบอร์ดใหม่ทั้งใบ
  return { ok: true, card: toBoardCardDto(card, [], []) };
}

/** ตัวเดียวกันแต่รับ FormData — หน้าบอร์ดเดิม (`ui.tsx`) ใช้กับ `<form action={…}>` ที่ต้องคืน void */
export async function createCardFormAction(formData: FormData) {
  const systemId = String(formData.get("systemId") ?? "");
  const boardId = String(formData.get("boardId") ?? "");
  const columnId = String(formData.get("columnId") ?? "");
  const title = String(formData.get("title") ?? "");
  const assigneeUserId = String(formData.get("assigneeUserId") ?? "").trim() || null;
  const dueAt = String(formData.get("dueAt") ?? "").trim() || null;
  if (!systemId || !columnId || title.trim().length < 1) return;
  await createCardAction({ systemId, boardId, columnId, title, assigneeUserId, dueAt });
}

export async function updateCardAction(formData: FormData) {
  const auth = await requireTenant();
  assertKanbanCan(auth, "kanban.card.update");
  const systemId = String(formData.get("systemId") ?? "");
  const boardId = String(formData.get("boardId") ?? "");
  const cardId = String(formData.get("cardId") ?? "");
  if (!systemId || !cardId) return;
  await assertCardRole(ctxOf(auth, systemId), cardId, "EDITOR");
  const title = String(formData.get("title") ?? "").trim();
  const assigneeUserId = String(formData.get("assigneeUserId") ?? "").trim() || null;
  const dueAt = parseDue(String(formData.get("dueAt") ?? ""));
  await updateCard({
    tenantId: auth.active.tenantId,
    systemId,
    cardId,
    ...(title.length >= 1 ? { title } : {}),
    assigneeUserId,
    dueAt,
  });
  revalidatePath(boardPath(systemId, boardId));
}

/**
 * ย้ายการ์ด (ลากวาง K1.5) — ส่ง **id ของเพื่อนบ้าน** เท่านั้น ห้ามส่ง position
 * (ฝั่ง client ไม่รู้จัก fractional index — `moves.ts` เป็นคนคิดคีย์ในทรานแซกชันเดียวกับที่ล็อกคอลัมน์)
 *
 * คืนผลลัพธ์ของ `moveCard` ตรง ๆ ({ok:false, code} เมื่อคอลัมน์เต็ม/การ์ดถูกเก็บ) ให้ client เอาไป
 * rollback + toast ได้โดยไม่ต้อง try/catch (ส่วน "ไม่มีสิทธิ์" ยังโยน 404/403 ตามกติกา §6.3)
 */
export async function moveCardAction(input: {
  systemId: string;
  boardId: string;
  cardId: string;
  toColumnId: string;
  beforeCardId?: string | null;
  afterCardId?: string | null;
}): Promise<
  | { ok: true; position: string; placedAt: "between" | "end" }
  | { ok: false; code: string; message: string }
> {
  const auth = await requireTenant();
  assertKanbanCan(auth, "kanban.card.move");
  if (!input.systemId || !input.cardId || !input.toColumnId) {
    return { ok: false, code: "NOT_FOUND", message: "ไม่พบการ์ดนี้" };
  }
  // ชั้นที่ 2 อยู่ใน service แล้ว — ตรวจซ้ำที่นี่เพื่อให้ "การ์ดของบอร์ดที่มองไม่เห็น" ได้ 404 ก่อนแตะอะไรทั้งสิ้น
  await assertCardRole(ctxOf(auth, input.systemId), input.cardId, "EDITOR");
  const res = await moveCard(ctxOf(auth, input.systemId), {
    cardId: input.cardId,
    toColumnId: input.toColumnId,
    beforeCardId: input.beforeCardId ?? null,
    afterCardId: input.afterCardId ?? null,
  });
  revalidatePath(boardPath(input.systemId, input.boardId));
  return res.ok
    ? { ok: true, position: res.position, placedAt: res.placedAt }
    : { ok: false, code: res.code, message: res.message };
}

/**
 * ปุ่ม ◀ ▶ ของหน้าเดิม (`<form action=…>` ต้องได้ action ที่คืน void — ห้ามคืนค่าเข้า form)
 * แยกจาก `moveCardAction` เพราะตัวนั้นคืนผลลัพธ์ให้ตัวลากวางเอาไป rollback (K1.5)
 */
export async function moveCardSidewaysAction(formData: FormData) {
  const auth = await requireTenant();
  assertKanbanCan(auth, "kanban.card.move");
  const systemId = String(formData.get("systemId") ?? "");
  const boardId = String(formData.get("boardId") ?? "");
  const cardId = String(formData.get("cardId") ?? "");
  const direction = String(formData.get("direction") ?? "") === "left" ? "left" : "right";
  if (!systemId || !cardId) return;
  await assertCardRole(ctxOf(auth, systemId), cardId, "EDITOR");
  await moveCardSideways(ctxOf(auth, systemId), { cardId, direction });
  revalidatePath(boardPath(systemId, boardId));
}

/** ตัวเดิม (ก่อน K1.6) — หน้าเดิม `ui.tsx` เรียกผ่าน `<ConfirmDialog action={…}>` ที่คืน void */
export async function archiveCardFormAction(formData: FormData) {
  const auth = await requireTenant();
  assertKanbanCan(auth, "kanban.card.delete");
  const systemId = String(formData.get("systemId") ?? "");
  const boardId = String(formData.get("boardId") ?? "");
  const cardId = String(formData.get("cardId") ?? "");
  if (!systemId || !cardId) return;
  await assertCardRole(ctxOf(auth, systemId), cardId, "EDITOR");
  await archiveCard(auth.active.tenantId, systemId, cardId, auth.user.id);
  revalidatePath(boardPath(systemId, boardId));
}

// ───────────────────────── K1.6: หลังการ์ด ─────────────────────────
// ทุกตัวรับ object (หน้าใหม่เรียกจาก client component) · คืน DTO ให้ optimistic UI เอาไปแปะ state ต่อได้
// 🔴 สิทธิ์ EDITOR+ ทั้งชุด (D16 style) — ตรวจซ้ำในนี้ก่อนเรียก service เผื่อวันหน้ามีคนเรียกข้ามชั้น

export async function getCardDetailAction(input: {
  systemId: string;
  cardId: string;
}): Promise<{ ok: true; detail: CardDetailDto } | { ok: false; message: string }> {
  const auth = await requireTenant();
  assertKanbanCan(auth, "kanban.board.read");
  if (!input.systemId || !input.cardId) return { ok: false, message: "ไม่พบการ์ดนี้" };
  try {
    const detail = await getCardDetail(ctxOf(auth, input.systemId), input.cardId);
    return { ok: true, detail };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "โหลดรายละเอียดการ์ดไม่สำเร็จ" };
  }
}

export async function updateCardFieldsAction(input: {
  systemId: string;
  boardId: string;
  cardId: string;
  title?: string;
  description?: string | null;
  dueAt?: string | null;
  startAt?: string | null;
  reminderMinutesBefore?: number | null;
}): Promise<
  | { ok: true; title: string; description: string | null; dueAt: string | null; startAt: string | null; reminderMinutesBefore: number | null }
  | { ok: false; message: string }
> {
  const auth = await requireTenant();
  assertKanbanCan(auth, "kanban.card.update");
  if (!input.systemId || !input.cardId) return { ok: false, message: "ไม่พบการ์ดนี้" };
  try {
    const card = await updateCardFields(ctxOf(auth, input.systemId), input.cardId, {
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.dueAt !== undefined ? { dueAt: input.dueAt ? new Date(input.dueAt) : null } : {}),
      ...(input.startAt !== undefined ? { startAt: input.startAt ? new Date(input.startAt) : null } : {}),
      ...(input.reminderMinutesBefore !== undefined ? { reminderMinutesBefore: input.reminderMinutesBefore } : {}),
    });
    revalidatePath(boardPath(input.systemId, input.boardId));
    return {
      ok: true,
      title: card.title,
      description: card.description,
      dueAt: card.dueAt ? card.dueAt.toISOString() : null,
      startAt: card.startAt ? card.startAt.toISOString() : null,
      reminderMinutesBefore: card.reminderMinutesBefore,
    };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "แก้การ์ดไม่สำเร็จ ลองใหม่อีกครั้ง" };
  }
}

export async function duplicateCardAction(input: {
  systemId: string;
  boardId: string;
  cardId: string;
}): Promise<{ ok: true; card: BoardCardDto; columnId: string } | { ok: false; message: string }> {
  const auth = await requireTenant();
  assertKanbanCan(auth, "kanban.card.create");
  if (!input.systemId || !input.cardId) return { ok: false, message: "ไม่พบการ์ดนี้" };
  try {
    const [labelRows, assigneeRows] = await Promise.all([
      listCardLabelDtos(ctxOf(auth, input.systemId), input.cardId),
      listCardAssigneeDtos(ctxOf(auth, input.systemId), input.cardId),
    ]);
    const created = await duplicateCard(ctxOf(auth, input.systemId), input.cardId);
    const checklist = await checklistProgressOfCard(ctxOf(auth, input.systemId), created.id);
    revalidatePath(boardPath(input.systemId, input.boardId));
    return { ok: true, card: toBoardCardDto(created, labelRows, assigneeRows, checklist), columnId: created.columnId };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "ทำสำเนาการ์ดไม่สำเร็จ" };
  }
}

export async function archiveCardAction(input: {
  systemId: string;
  boardId: string;
  cardId: string;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  const auth = await requireTenant();
  assertKanbanCan(auth, "kanban.card.delete");
  if (!input.systemId || !input.cardId) return { ok: false, message: "ไม่พบการ์ดนี้" };
  try {
    await archiveCardV2(ctxOf(auth, input.systemId), input.cardId);
    revalidatePath(boardPath(input.systemId, input.boardId));
    return { ok: true };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "เก็บการ์ดเข้าคลังไม่สำเร็จ" };
  }
}

export async function restoreCardAction(input: {
  systemId: string;
  boardId: string;
  cardId: string;
}): Promise<{ ok: true; card: BoardCardDto; columnId: string } | { ok: false; message: string }> {
  const auth = await requireTenant();
  assertKanbanCan(auth, "kanban.card.update");
  if (!input.systemId || !input.cardId) return { ok: false, message: "ไม่พบการ์ดนี้" };
  try {
    const [labelRows, assigneeRows] = await Promise.all([
      listCardLabelDtos(ctxOf(auth, input.systemId), input.cardId),
      listCardAssigneeDtos(ctxOf(auth, input.systemId), input.cardId),
    ]);
    const restored = await restoreCard(ctxOf(auth, input.systemId), input.cardId);
    const checklist = await checklistProgressOfCard(ctxOf(auth, input.systemId), restored.id);
    // K1.9: การ์ดที่กู้คืนอาจมีไฟล์แนบ/ปกอยู่แล้วก่อนถูกเก็บเข้าคลัง — โหลดของจริงแทนค่าเริ่มต้น 0/null
    const attachment = await attachmentBadgeOfCard(ctxOf(auth, input.systemId), restored.id);
    revalidatePath(boardPath(input.systemId, input.boardId));
    return { ok: true, card: toBoardCardDto(restored, labelRows, assigneeRows, checklist, undefined, attachment), columnId: restored.columnId };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "กู้คืนการ์ดไม่สำเร็จ" };
  }
}

export async function setCardLabelsAction(input: {
  systemId: string;
  boardId: string;
  cardId: string;
  labelIds: string[];
}): Promise<{ ok: true; labelIds: string[] } | { ok: false; message: string }> {
  const auth = await requireTenant();
  assertKanbanCan(auth, "kanban.label.manage");
  if (!input.systemId || !input.cardId) return { ok: false, message: "ไม่พบการ์ดนี้" };
  const ctx = ctxOf(auth, input.systemId);
  try {
    await assertCardRole(ctx, input.cardId, "EDITOR");
    const labelIds = await setCardLabels(ctx, input.cardId, input.labelIds);
    revalidatePath(boardPath(input.systemId, input.boardId));
    return { ok: true, labelIds };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "ตั้งป้ายกำกับไม่สำเร็จ" };
  }
}

export async function setCardAssigneesAction(input: {
  systemId: string;
  boardId: string;
  cardId: string;
  userIds: string[];
}): Promise<{ ok: true; userIds: string[] } | { ok: false; message: string }> {
  const auth = await requireTenant();
  assertKanbanCan(auth, "kanban.card.update");
  if (!input.systemId || !input.cardId) return { ok: false, message: "ไม่พบการ์ดนี้" };
  const ctx = ctxOf(auth, input.systemId);
  try {
    await assertCardRole(ctx, input.cardId, "EDITOR");
    const { assigneeUserIds } = await setCardAssignees(ctx, input.cardId, input.userIds);
    revalidatePath(boardPath(input.systemId, input.boardId));
    return { ok: true, userIds: assigneeUserIds };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "ตั้งผู้รับผิดชอบไม่สำเร็จ" };
  }
}

export async function createLabelAction(input: {
  systemId: string;
  boardId: string;
  name: string;
  color: string;
}): Promise<{ ok: true; label: BoardLabelDto } | { ok: false; message: string }> {
  const auth = await requireTenant();
  assertKanbanCan(auth, "kanban.label.manage");
  if (!input.systemId || !input.boardId) return { ok: false, message: "ไม่พบบอร์ดนี้" };
  const ctx = ctxOf(auth, input.systemId);
  try {
    await assertBoardRole(ctx, input.boardId, "EDITOR");
    const label = await createLabel(ctx, input.boardId, { name: input.name, color: input.color });
    revalidatePath(boardPath(input.systemId, input.boardId));
    return { ok: true, label: { id: label.id, name: label.name, color: label.color as BoardLabelDto["color"] } };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "สร้างป้ายกำกับไม่สำเร็จ" };
  }
}

// ═══════════════════════════ K1.7: เช็คลิสต์ ═══════════════════════════
// ทุก action คืนเช็คลิสต์ทั้งชุดของการ์ดกลับไป (ไม่ใช่แค่ส่วนที่เปลี่ยน) — ชุดข้อมูลเล็ก
// (≤50 รายการ/การ์ด) การอ่านใหม่ทั้งหมดหลังทุกแก้ไขปลอดภัยกว่าประกอบ patch เองฝั่ง client
// `Checklist.tsx` ทำ optimistic เองก่อนเรียก แล้วค่อยเอาผลจริงจาก server มาทับ/ย้อนกลับ

type ChecklistActionResult = { ok: true; checklists: KanbanChecklistDto[] } | { ok: false; message: string };

export async function createChecklistAction(input: {
  systemId: string;
  boardId: string;
  cardId: string;
  title: string;
}): Promise<ChecklistActionResult> {
  const auth = await requireTenant();
  assertKanbanCan(auth, "kanban.card.update");
  if (!input.systemId || !input.cardId) return { ok: false, message: "ไม่พบการ์ดนี้" };
  const ctx = ctxOf(auth, input.systemId);
  try {
    await createChecklist(ctx, input.cardId, input.title);
    revalidatePath(boardPath(input.systemId, input.boardId));
    return { ok: true, checklists: await getCardChecklists(ctx, input.cardId) };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "สร้างเช็คลิสต์ไม่สำเร็จ" };
  }
}

export async function renameChecklistAction(input: {
  systemId: string;
  boardId: string;
  cardId: string;
  checklistId: string;
  title: string;
}): Promise<ChecklistActionResult> {
  const auth = await requireTenant();
  assertKanbanCan(auth, "kanban.card.update");
  if (!input.systemId || !input.checklistId) return { ok: false, message: "ไม่พบเช็คลิสต์นี้" };
  const ctx = ctxOf(auth, input.systemId);
  try {
    await renameChecklist(ctx, input.checklistId, input.title);
    revalidatePath(boardPath(input.systemId, input.boardId));
    return { ok: true, checklists: await getCardChecklists(ctx, input.cardId) };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "เปลี่ยนชื่อเช็คลิสต์ไม่สำเร็จ" };
  }
}

export async function deleteChecklistAction(input: {
  systemId: string;
  boardId: string;
  cardId: string;
  checklistId: string;
}): Promise<ChecklistActionResult> {
  const auth = await requireTenant();
  assertKanbanCan(auth, "kanban.card.update");
  if (!input.systemId || !input.checklistId) return { ok: false, message: "ไม่พบเช็คลิสต์นี้" };
  const ctx = ctxOf(auth, input.systemId);
  try {
    await deleteChecklist(ctx, input.checklistId);
    revalidatePath(boardPath(input.systemId, input.boardId));
    return { ok: true, checklists: await getCardChecklists(ctx, input.cardId) };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "ลบเช็คลิสต์ไม่สำเร็จ" };
  }
}

export async function addChecklistItemAction(input: {
  systemId: string;
  boardId: string;
  cardId: string;
  checklistId: string;
  text: string;
  assigneeUserId?: string | null;
  dueAt?: string | null;
}): Promise<ChecklistActionResult> {
  const auth = await requireTenant();
  assertKanbanCan(auth, "kanban.card.update");
  if (!input.systemId || !input.checklistId) return { ok: false, message: "ไม่พบเช็คลิสต์นี้" };
  const ctx = ctxOf(auth, input.systemId);
  try {
    await addChecklistItem(ctx, input.checklistId, input.text, {
      assigneeUserId: input.assigneeUserId ?? null,
      dueAt: input.dueAt ? new Date(input.dueAt) : null,
    });
    revalidatePath(boardPath(input.systemId, input.boardId));
    return { ok: true, checklists: await getCardChecklists(ctx, input.cardId) };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "เพิ่มรายการไม่สำเร็จ" };
  }
}

export async function toggleChecklistItemAction(input: {
  systemId: string;
  boardId: string;
  cardId: string;
  itemId: string;
  done: boolean;
}): Promise<ChecklistActionResult> {
  const auth = await requireTenant();
  assertKanbanCan(auth, "kanban.card.update");
  if (!input.systemId || !input.itemId) return { ok: false, message: "ไม่พบรายการนี้" };
  const ctx = ctxOf(auth, input.systemId);
  try {
    await toggleChecklistItem(ctx, input.itemId, input.done);
    revalidatePath(boardPath(input.systemId, input.boardId));
    return { ok: true, checklists: await getCardChecklists(ctx, input.cardId) };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "ติ๊กรายการไม่สำเร็จ" };
  }
}

export async function editChecklistItemAction(input: {
  systemId: string;
  boardId: string;
  cardId: string;
  itemId: string;
  text?: string;
  assigneeUserId?: string | null;
  dueAt?: string | null;
}): Promise<ChecklistActionResult> {
  const auth = await requireTenant();
  assertKanbanCan(auth, "kanban.card.update");
  if (!input.systemId || !input.itemId) return { ok: false, message: "ไม่พบรายการนี้" };
  const ctx = ctxOf(auth, input.systemId);
  try {
    await editChecklistItem(ctx, input.itemId, {
      ...(input.text !== undefined ? { text: input.text } : {}),
      ...(input.assigneeUserId !== undefined ? { assigneeUserId: input.assigneeUserId } : {}),
      ...(input.dueAt !== undefined ? { dueAt: input.dueAt ? new Date(input.dueAt) : null } : {}),
    });
    revalidatePath(boardPath(input.systemId, input.boardId));
    return { ok: true, checklists: await getCardChecklists(ctx, input.cardId) };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "แก้รายการไม่สำเร็จ" };
  }
}

export async function deleteChecklistItemAction(input: {
  systemId: string;
  boardId: string;
  cardId: string;
  itemId: string;
}): Promise<ChecklistActionResult> {
  const auth = await requireTenant();
  assertKanbanCan(auth, "kanban.card.update");
  if (!input.systemId || !input.itemId) return { ok: false, message: "ไม่พบรายการนี้" };
  const ctx = ctxOf(auth, input.systemId);
  try {
    await deleteChecklistItem(ctx, input.itemId);
    revalidatePath(boardPath(input.systemId, input.boardId));
    return { ok: true, checklists: await getCardChecklists(ctx, input.cardId) };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "ลบรายการไม่สำเร็จ" };
  }
}

export async function moveChecklistItemAction(input: {
  systemId: string;
  boardId: string;
  cardId: string;
  itemId: string;
  beforeItemId?: string;
  afterItemId?: string;
}): Promise<ChecklistActionResult> {
  const auth = await requireTenant();
  assertKanbanCan(auth, "kanban.card.update");
  if (!input.systemId || !input.itemId) return { ok: false, message: "ไม่พบรายการนี้" };
  const ctx = ctxOf(auth, input.systemId);
  try {
    await moveChecklistItem(ctx, input.itemId, { beforeItemId: input.beforeItemId, afterItemId: input.afterItemId });
    revalidatePath(boardPath(input.systemId, input.boardId));
    return { ok: true, checklists: await getCardChecklists(ctx, input.cardId) };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "จัดลำดับรายการไม่สำเร็จ" };
  }
}

// ───────────────────────── K1.8: ความเห็น + @mention ─────────────────────────
// ทุกตัวคืน "ความเห็นทั้งชุด" ของการ์ด (ไม่ใช่ patch ย่อย) — ชุดข้อมูลเล็กและต้องเรียงเก่า→ใหม่เสมอ
// แพตเทิร์นเดียวกับเช็คลิสต์ (K1.7): ฝั่งจอแปะ optimistic ก่อน แล้วรับของจริงจาก action มาทับ

export type CommentActionResult =
  | { ok: true; comments: KanbanCommentDto[]; commentCount: number }
  | { ok: false; message: string };

async function commentsResult(ctx: KanbanCtx, cardId: string): Promise<CommentActionResult> {
  const comments = await listComments(ctx, cardId);
  return { ok: true, comments, commentCount: comments.length };
}

export async function addCommentAction(input: {
  systemId: string;
  boardId: string;
  cardId: string;
  body: string;
}): Promise<CommentActionResult> {
  const auth = await requireTenant();
  assertKanbanCanAny(auth, ["kanban.card.comment", "kanban.card.update"]);
  if (!input.systemId || !input.cardId) return { ok: false, message: "ไม่พบการ์ดนี้" };
  const ctx = ctxOf(auth, input.systemId);
  try {
    await addComment(ctx, input.cardId, input.body);
    revalidatePath(boardPath(input.systemId, input.boardId));
    return await commentsResult(ctx, input.cardId);
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "ส่งความเห็นไม่สำเร็จ" };
  }
}

export async function editCommentAction(input: {
  systemId: string;
  boardId: string;
  cardId: string;
  commentId: string;
  body: string;
}): Promise<CommentActionResult> {
  const auth = await requireTenant();
  assertKanbanCanAny(auth, ["kanban.card.comment", "kanban.card.update"]);
  if (!input.systemId || !input.commentId) return { ok: false, message: "ไม่พบความเห็นนี้" };
  const ctx = ctxOf(auth, input.systemId);
  try {
    await editComment(ctx, input.commentId, input.body);
    revalidatePath(boardPath(input.systemId, input.boardId));
    return await commentsResult(ctx, input.cardId);
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "แก้ความเห็นไม่สำเร็จ" };
  }
}

export async function deleteCommentAction(input: {
  systemId: string;
  boardId: string;
  cardId: string;
  commentId: string;
}): Promise<CommentActionResult> {
  const auth = await requireTenant();
  assertKanbanCanAny(auth, ["kanban.card.comment", "kanban.card.update"]);
  if (!input.systemId || !input.commentId) return { ok: false, message: "ไม่พบความเห็นนี้" };
  const ctx = ctxOf(auth, input.systemId);
  try {
    await deleteComment(ctx, input.commentId);
    revalidatePath(boardPath(input.systemId, input.boardId));
    return await commentsResult(ctx, input.cardId);
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "ลบความเห็นไม่สำเร็จ" };
  }
}

/** รายชื่อพนักงานสำหรับเมนู `@` — ต้องมองเห็นบอร์ดใบนั้นก่อน (ไม่ใช่ช่องดูดรายชื่อทั้งร้าน) */
export async function listMentionTargetsAction(input: {
  systemId: string;
  boardId: string;
}): Promise<{ ok: true; people: { userId: string; name: string }[] } | { ok: false; message: string }> {
  const auth = await requireTenant();
  assertKanbanCan(auth, "kanban.board.read");
  if (!input.systemId || !input.boardId) return { ok: false, message: "ไม่พบบอร์ดนี้" };
  try {
    const people = await listMentionTargets(ctxOf(auth, input.systemId), input.boardId);
    return { ok: true, people };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "โหลดรายชื่อไม่สำเร็จ" };
  }
}

// ───────────────────────── K1.9: ไฟล์แนบ + ปก ─────────────────────────
// แพตเทิร์นเดียวกับความเห็น (K1.8): ทุกตัวคืน "ไฟล์แนบทั้งชุด" ของการ์ด (ไม่ใช่ patch ย่อย)
// สิทธิ์ชั้นที่ 1 เหมือน K1.8: คีย์ `kanban.card.attach` หรือ `kanban.card.update` — ร้านที่ตั้งสิทธิ์
// ไว้ก่อนมีคีย์ attach (K1.3) ยังแนบไฟล์ได้ต่อเนื่องหลัง deploy · ชั้นที่ 2 (EDITOR+ ของบอร์ด) ตรวจใน service เสมอ

export type AttachmentActionResult =
  | { ok: true; attachments: KanbanAttachmentDto[] }
  | { ok: false; message: string; attachments?: KanbanAttachmentDto[] };

async function attachmentsResult(ctx: KanbanCtx, cardId: string): Promise<AttachmentActionResult> {
  const attachments = await listAttachments(ctx, cardId);
  return { ok: true, attachments };
}

/**
 * รับไฟล์จากฟอร์ม (`files` — หลายไฟล์ได้) → แนบเข้าการ์ดทีละไฟล์
 * ไฟล์ไหนติดด่าน (ชนิด/ขนาด/ไบต์ไม่ตรง/เกินโควตา) หยุดที่ไฟล์นั้นทันที — ไฟล์ก่อนหน้าที่แนบสำเร็จแล้วยังอยู่
 * (คืน `attachments` ปัจจุบันมาด้วยแม้ตอบ `ok:false` เพื่อให้จอวาดรายการที่แนบสำเร็จไปแล้วได้ทันที)
 */
export async function uploadAttachmentAction(formData: FormData): Promise<AttachmentActionResult> {
  const auth = await requireTenant();
  assertKanbanCanAny(auth, ["kanban.card.attach", "kanban.card.update"]);
  const systemId = String(formData.get("systemId") ?? "");
  const boardId = String(formData.get("boardId") ?? "");
  const cardId = String(formData.get("cardId") ?? "");
  if (!systemId || !cardId) return { ok: false, message: "ไม่พบการ์ดนี้" };
  const ctx = ctxOf(auth, systemId);

  const files = formData
    .getAll("files")
    .filter((f): f is File => typeof f === "object" && f !== null && "arrayBuffer" in f)
    .filter((f) => f.size > 0);
  if (files.length === 0) return { ok: false, message: "กรุณาเลือกไฟล์ก่อนอัปโหลด" };

  for (const f of files) {
    try {
      const mime = normalizeUploadType(f.type) || "application/octet-stream";
      await addAttachment(ctx, cardId, { filename: f.name, contentType: mime, data: new Uint8Array(await f.arrayBuffer()) });
    } catch (e) {
      const attachments = await listAttachments(ctx, cardId).catch(() => undefined);
      return { ok: false, message: e instanceof Error ? e.message : `แนบไฟล์ "${f.name}" ไม่สำเร็จ`, attachments };
    }
  }
  revalidatePath(boardPath(systemId, boardId));
  return await attachmentsResult(ctx, cardId);
}

export async function removeAttachmentAction(input: {
  systemId: string;
  boardId: string;
  cardId: string;
  attachmentId: string;
}): Promise<AttachmentActionResult> {
  const auth = await requireTenant();
  assertKanbanCanAny(auth, ["kanban.card.attach", "kanban.card.update"]);
  if (!input.systemId || !input.attachmentId) return { ok: false, message: "ไม่พบไฟล์แนบนี้" };
  const ctx = ctxOf(auth, input.systemId);
  try {
    await removeAttachment(ctx, input.attachmentId);
    revalidatePath(boardPath(input.systemId, input.boardId));
    return await attachmentsResult(ctx, input.cardId);
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "ลบไฟล์แนบไม่สำเร็จ" };
  }
}

export async function setCoverAction(input: {
  systemId: string;
  boardId: string;
  cardId: string;
  attachmentId: string | null;
}): Promise<{ ok: true; coverUrl: string | null } | { ok: false; message: string }> {
  const auth = await requireTenant();
  assertKanbanCanAny(auth, ["kanban.card.attach", "kanban.card.update"]);
  if (!input.systemId || !input.cardId) return { ok: false, message: "ไม่พบการ์ดนี้" };
  const ctx = ctxOf(auth, input.systemId);
  try {
    await setCover(ctx, input.cardId, input.attachmentId);
    revalidatePath(boardPath(input.systemId, input.boardId));
    const badge = await attachmentBadgeOfCard(ctx, input.cardId);
    return { ok: true, coverUrl: badge.coverUrl };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "ตั้งปกไม่สำเร็จ" };
  }
}

// ───────────────────────── K1.10: ประวัติกิจกรรม ─────────────────────────
// 🔴 อ่านอย่างเดียว: ไม่มี action ที่ "เขียน/ลบกิจกรรม" — กิจกรรมเกิดจากงานจริงเท่านั้น (append-only)
// 🔴 สิทธิ์ชั้นที่ 1 = `kanban.board.read` (คนที่เข้าโมดูลได้) · ชั้นที่ 2 (VIEWER+ ของบอร์ดใบนั้น)
//    ตรวจใน service เสมอ ⇒ บอร์ดที่มองไม่เห็น = 404 ไม่ใช่รายการว่าง

export type TimelineActionResult =
  | { ok: true; items: KanbanTimelineItemDto[]; nextCursor: string | null }
  | { ok: false; message: string };

/** สายรวม (ความเห็น + กิจกรรม) ของการ์ด 1 ใบ — แท็บ/โหลดเพิ่มของ `Timeline.tsx` */
export async function listCardTimelineAction(input: {
  systemId: string;
  cardId: string;
  filter?: KanbanTimelineFilter;
  take?: number;
  cursor?: string | null;
}): Promise<TimelineActionResult> {
  const auth = await requireTenant();
  assertKanbanCan(auth, "kanban.board.read");
  if (!input.systemId || !input.cardId) return { ok: false, message: "ไม่พบการ์ดนี้" };
  try {
    const page = await listCardTimeline(ctxOf(auth, input.systemId), input.cardId, {
      filter: input.filter ?? "all",
      take: input.take,
      cursor: input.cursor ?? null,
    });
    return { ok: true, items: page.items, nextCursor: page.nextCursor };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "โหลดประวัติกิจกรรมไม่สำเร็จ" };
  }
}

export type BoardActivityActionResult =
  | { ok: true; items: KanbanActivityDto[]; nextCursor: string | null }
  | { ok: false; message: string };

/** ประวัติกิจกรรมของทั้งบอร์ด — แผงขวาที่เปิดจากเมนู ⋯ ของหัวบอร์ด */
export async function listBoardActivityAction(input: {
  systemId: string;
  boardId: string;
  take?: number;
  cursor?: string | null;
}): Promise<BoardActivityActionResult> {
  const auth = await requireTenant();
  assertKanbanCan(auth, "kanban.board.read");
  if (!input.systemId || !input.boardId) return { ok: false, message: "ไม่พบบอร์ดนี้" };
  try {
    const page = await listBoardActivity(ctxOf(auth, input.systemId), input.boardId, {
      take: input.take,
      cursor: input.cursor ?? null,
    });
    return { ok: true, items: page.items, nextCursor: page.nextCursor };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "โหลดประวัติกิจกรรมของบอร์ดไม่สำเร็จ" };
  }
}

// ───────────────────────── K1.11: ตัวกรอง + ค้นหาข้ามบอร์ด ─────────────────────────
// 🔴 ใช้ `canReadKanban` (ผ่านคีย์ kanban.* ตัวใดก็ได้ — เข้ากันได้ย้อนหลังแบบ K1.3) แทน
//    `assertKanbanCan(auth,"kanban.board.read")` ตรง ๆ: พนักงานที่เจ้าของติ๊กแค่ `kanban.card.create`
//    ต้องค้นหาได้เหมือนเข้าหน้าบอร์ดได้ ไม่งั้นปุ่มค้นหาจะเงียบใส่คนกลุ่มนี้ทั้งที่กดเข้าบอร์ดได้ปกติ

export type SearchCardsActionResult =
  | { ok: true; items: SearchCardDto[]; nextCursor?: string; total: number }
  | { ok: false; message: string };

/**
 * ค้นหาการ์ดข้ามบอร์ด (`SearchPalette.tsx`) — รับ "ข้อความดิบ" แล้วแปลงไวยากรณ์ที่นี่ทีเดียว
 * (ไม่ใช่ REST `/api/v1/kanban/search` ของ K1.15 — เส้นทางคนละเส้น คนละ auth)
 */
export async function searchCardsAction(input: {
  systemId: string;
  text?: string;
  take?: number;
  cursor?: string | null;
}): Promise<SearchCardsActionResult> {
  const auth = await requireTenant();
  if (!input.systemId) return { ok: false, message: "ไม่พบระบบนี้" };
  const actor = toActor(auth.user.id, auth.active);
  if (!canReadKanban(actor)) return { ok: false, message: "คุณไม่มีสิทธิ์ใช้งานบอร์ดงาน" };
  try {
    const filters = parseSearchQuery(input.text ?? "");
    const result = await searchCards(ctxOf(auth, input.systemId), actor, {
      ...filters,
      take: input.take,
      cursor: input.cursor ?? null,
    });
    return { ok: true, items: result.items, ...(result.nextCursor ? { nextCursor: result.nextCursor } : {}), total: result.total };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "ค้นหาไม่สำเร็จ ลองใหม่อีกครั้ง" };
  }
}

// ───────────────────────── K1.12: เทมเพลต + สร้างบอร์ด ─────────────────────────
// 🔴 `createBoardFromTemplateAction` ทำหน้าที่คู่ (deviation จดใน wo-notes): `templateId` มี = สร้างจาก
//    เทมเพลต (ต้อง `kanban.board.create` ตรวจอยู่แล้วใน `templates.ts`) · `templateId` ไม่มี = สร้างบอร์ดเปล่า
//    ผ่าน `createBoard()` เดิม (ตรวจ `kanban.board.create` ที่นี่) — `CreateBoardModal.tsx` เรียกตัวเดียวจบ
//    ทั้งสองทาง ไม่ต้องมี action แยกสำหรับบอร์ดเปล่า

export async function createBoardFromTemplateAction(input: {
  systemId: string;
  templateId?: string | null;
  name: string;
  unitId?: string | null;
  visibility?: "PRIVATE" | "TENANT";
}): Promise<{ ok: true; boardId: string } | { ok: false; message: string }> {
  const auth = await requireTenant();
  if (!input.systemId) return { ok: false, message: "ไม่พบระบบนี้" };
  const name = input.name.trim();
  if (!name) return { ok: false, message: "ต้องตั้งชื่อบอร์ดก่อนจึงสร้างได้" };
  const ctx = ctxOf(auth, input.systemId);
  const actor = toActor(auth.user.id, auth.active);
  try {
    const board = input.templateId
      ? await createBoardFromTemplate(ctx, actor, input.templateId, {
          name,
          unitId: input.unitId ?? null,
          visibility: input.visibility,
        })
      : await (async () => {
          assertKanbanCan(auth, "kanban.board.create");
          return createBoard({
            tenantId: auth.active.tenantId,
            systemId: input.systemId,
            name,
            unitId: input.unitId ?? null,
            visibility: input.visibility,
            createdById: auth.user.id,
          });
        })();
    revalidatePath(`/app/sys/${input.systemId}/kanban/boards`);
    return { ok: true, boardId: board.id };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "สร้างบอร์ดไม่สำเร็จ ลองใหม่อีกครั้ง" };
  }
}

/** บันทึกบอร์ดปัจจุบันเป็นเทมเพลตของร้าน (เมนู ⋯ ของหัวบอร์ด · ADMIN เท่านั้น — ตรวจใน `saveBoardAsTemplate`) */
export async function saveBoardAsTemplateAction(input: {
  systemId: string;
  boardId: string;
  name: string;
  description?: string;
}): Promise<{ ok: true; templateId: string } | { ok: false; message: string }> {
  const auth = await requireTenant();
  if (!input.systemId || !input.boardId) return { ok: false, message: "ไม่พบบอร์ดนี้" };
  const ctx = ctxOf(auth, input.systemId);
  const actor = toActor(auth.user.id, auth.active);
  try {
    const template = await saveBoardAsTemplate(ctx, actor, input.boardId, {
      name: input.name,
      description: input.description,
    });
    revalidatePath(`/app/sys/${input.systemId}/kanban/boards`);
    return { ok: true, templateId: template.id };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "บันทึกเป็นเทมเพลตไม่สำเร็จ" };
  }
}

/** ลบเทมเพลตของร้าน (ของแพลตฟอร์มลบไม่ได้ — ตรวจใน `deleteTenantTemplate`) */
export async function deleteTenantTemplateAction(input: {
  systemId: string;
  templateId: string;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  const auth = await requireTenant();
  if (!input.systemId || !input.templateId) return { ok: false, message: "ไม่พบเทมเพลตนี้" };
  const ctx = ctxOf(auth, input.systemId);
  const actor = toActor(auth.user.id, auth.active);
  try {
    await deleteTenantTemplate(ctx, actor, input.templateId);
    revalidatePath(`/app/sys/${input.systemId}/kanban/boards`);
    return { ok: true };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "ลบเทมเพลตไม่สำเร็จ" };
  }
}

// ───────────────────────── K1.13: มือถือ (ปัดขวา=เสร็จ/ปัดซ้าย=เก็บ) + งานของฉัน ─────────────────────────
// 🔴 ตรรกะจริงอยู่ใน `my-tasks.ts` (`completeCard`/`archiveWithUndo`/`undo`) — ที่นี่แค่ห่อ requireTenant +
//    revalidatePath (`my-tasks` + หน้าบอร์ด) ตามแพตเทิร์นเดิมของไฟล์นี้ทั้งไฟล์

function myTasksPath(systemId: string) {
  return `/app/sys/${systemId}/kanban/my-tasks`;
}

/** ปัดขวาบนมือถือ / ติ๊กในหน้า "งานของฉัน" — ย้ายเข้าคอลัมน์เสร็จของบอร์ดใบนั้น + คืน undo token */
export async function completeCardAction(input: {
  systemId: string;
  boardId: string;
  cardId: string;
}): Promise<
  | { ok: true; fromColumnId: string; undoToken: string }
  | { ok: false; code?: string; message: string }
> {
  const auth = await requireTenant();
  assertKanbanCan(auth, "kanban.card.move");
  if (!input.systemId || !input.cardId) return { ok: false, message: "ไม่พบการ์ดนี้" };
  try {
    const res = await completeCard(ctxOf(auth, input.systemId), input.cardId);
    if (res.ok) {
      revalidatePath(boardPath(input.systemId, input.boardId));
      revalidatePath(myTasksPath(input.systemId));
      return { ok: true, fromColumnId: res.fromColumnId, undoToken: res.undoToken };
    }
    return { ok: false, code: res.code, message: res.message };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "ปัดเสร็จไม่สำเร็จ ลองใหม่อีกครั้ง" };
  }
}

/** ปัดซ้ายบนมือถือ — เก็บการ์ดเข้าคลัง + คืน undo token (ใช้ตัวเดียวกับ "เก็บ" ของหลังการ์ด แต่มี undo ให้) */
export async function archiveWithUndoAction(input: {
  systemId: string;
  boardId: string;
  cardId: string;
}): Promise<{ ok: true; undoToken: string } | { ok: false; message: string }> {
  const auth = await requireTenant();
  assertKanbanCan(auth, "kanban.card.delete");
  if (!input.systemId || !input.cardId) return { ok: false, message: "ไม่พบการ์ดนี้" };
  try {
    const res = await archiveWithUndo(ctxOf(auth, input.systemId), input.cardId);
    revalidatePath(boardPath(input.systemId, input.boardId));
    revalidatePath(myTasksPath(input.systemId));
    return { ok: true, undoToken: res.undoToken };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "เก็บการ์ดเข้าคลังไม่สำเร็จ" };
  }
}

/** ปุ่ม "เลิกทำ" ของ toast — one-shot ภายใน 5 นาที ผูก tenant+system+user จาก session ปัจจุบันเสมอ */
export async function undoAction(input: {
  systemId: string;
  boardId?: string | null;
  token: string;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  const auth = await requireTenant();
  assertKanbanCan(auth, "kanban.board.read");
  if (!input.systemId || !input.token) return { ok: false, message: "ไม่พบรายการที่จะเลิกทำ" };
  const res = await undo(ctxOf(auth, input.systemId), input.token);
  if (!res.ok) return { ok: false, message: "เลิกทำไม่ได้แล้ว (อาจใช้ไปแล้วหรือหมดเวลา)" };
  if (input.boardId) revalidatePath(boardPath(input.systemId, input.boardId));
  revalidatePath(myTasksPath(input.systemId));
  return { ok: true };
}

// ───────────────────────── K1.14 — คลังเก็บ (หน้า /kanban/b/{id}/archive) ─────────────────────────

/** ค้นในคลังของบอร์ด (ช่องค้นหาบนหน้าคลังเรียกตัวนี้ทุกครั้งที่พิมพ์ — ผ่านด่านสิทธิ์ทุกครั้งเหมือนกัน) */
export async function listArchivedAction(input: {
  systemId: string;
  boardId: string;
  q?: string;
}): Promise<{ ok: true; data: ArchiveListDto } | { ok: false; message: string }> {
  const auth = await requireTenant();
  assertKanbanCan(auth, "kanban.board.read");
  if (!input.systemId || !input.boardId) return { ok: false, message: "ไม่พบบอร์ดนี้" };
  try {
    const data = await listArchived(ctxOf(auth, input.systemId), input.boardId, { q: input.q });
    return { ok: true, data };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "เปิดคลังเก็บไม่สำเร็จ" };
  }
}

/** กู้คืนคอลัมน์จากคลัง → กลับมาท้ายบอร์ดพร้อมการ์ดที่ยังผูกอยู่ (ADMIN ของบอร์ดตาม D16) */
export async function restoreColumnAction(input: {
  systemId: string;
  boardId: string;
  columnId: string;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  const auth = await requireTenant();
  assertKanbanCan(auth, "kanban.column.create");
  if (!input.systemId || !input.columnId) return { ok: false, message: "ไม่พบคอลัมน์นี้" };
  try {
    await restoreColumn(ctxOf(auth, input.systemId), input.columnId);
    revalidatePath(boardPath(input.systemId, input.boardId));
    return { ok: true };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "กู้คืนคอลัมน์ไม่สำเร็จ" };
  }
}

// ───────────────────────── K2.1 — มุมมองตาราง: เลือกหลายรายการ + ส่งออก CSV ─────────────────────────

export type BulkUpdateActionResult =
  | { ok: true; updated: number; skipped: { id: string; reason: string }[] }
  | { ok: false; message: string };

/**
 * รูป patch ที่หน้าจอ (client) ส่งมา — เหมือน `BulkUpdatePatch` ของ `cards.ts` ทุกอย่างยกเว้น `dueAt`
 * เป็น ISO string (ไม่ใช่ `Date`) แบบเดียวกับ `updateCardFieldsAction` — TableView.tsx ไม่ import ชนิด
 * จาก `cards.ts`/`table.ts` (ไฟล์แตะ prisma) ตามกติกา K1.11/K1.12/K1.13
 */
export type BulkUpdateActionPatch = {
  toColumnId?: string;
  addAssigneeUserIds?: string[];
  removeAssigneeUserIds?: string[];
  addLabelIds?: string[];
  removeLabelIds?: string[];
  dueAt?: string | null;
  archive?: true;
};

/**
 * แถบ "เลือกหลายรายการ" ของมุมมองตาราง — ย้าย/มอบหมาย/ติดป้าย/ตั้งกำหนดส่ง/เก็บเข้าคลังหลายใบพร้อมกัน
 * 🔴 ตรวจสิทธิ์ระดับโมดูลที่นี่ (เหมือน action อื่นของการ์ด) · ชั้นบทบาทบอร์ด (EDITOR+) ตรวจซ้ำใน `cards.bulkUpdate`
 *    เอง (ที่นั่นคำนวณบอร์ดจาก cardIds ก่อน ไม่ใช่จาก `boardId` ที่ฟอร์มส่งมา)
 */
export async function bulkUpdateAction(input: {
  systemId: string;
  boardId: string;
  cardIds: string[];
  patch: BulkUpdateActionPatch;
}): Promise<BulkUpdateActionResult> {
  const auth = await requireTenant();
  assertKanbanCan(auth, "kanban.card.update");
  if (!input.systemId || input.cardIds.length === 0) {
    return { ok: false, message: "ยังไม่ได้เลือกการ์ด" };
  }
  const patch: BulkUpdatePatch = {
    ...(input.patch.toColumnId !== undefined ? { toColumnId: input.patch.toColumnId } : {}),
    ...(input.patch.addAssigneeUserIds !== undefined ? { addAssigneeUserIds: input.patch.addAssigneeUserIds } : {}),
    ...(input.patch.removeAssigneeUserIds !== undefined ? { removeAssigneeUserIds: input.patch.removeAssigneeUserIds } : {}),
    ...(input.patch.addLabelIds !== undefined ? { addLabelIds: input.patch.addLabelIds } : {}),
    ...(input.patch.removeLabelIds !== undefined ? { removeLabelIds: input.patch.removeLabelIds } : {}),
    ...(input.patch.dueAt !== undefined ? { dueAt: input.patch.dueAt ? new Date(input.patch.dueAt) : null } : {}),
    ...(input.patch.archive ? { archive: true as const } : {}),
  };
  try {
    const { updated, skipped } = await bulkUpdate(ctxOf(auth, input.systemId), input.cardIds, patch);
    revalidatePath(boardPath(input.systemId, input.boardId));
    return { ok: true, updated, skipped };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "ทำรายการไม่สำเร็จ ลองใหม่อีกครั้ง" };
  }
}

/**
 * ส่งออกการ์ดของบอร์ด (ตามตัวกรองที่กำลังเปิดอยู่) เป็นข้อความ CSV — ฝั่ง client แปลงเป็นไฟล์ดาวน์โหลดเอง
 * ผ่าน Blob (ไม่เปิด route สาธารณะตามสัญญา §K2.1)
 */
export async function exportBoardCsvAction(input: {
  systemId: string;
  boardId: string;
  filters?: BoardFilters;
}): Promise<{ ok: true; csv: string } | { ok: false; message: string }> {
  const auth = await requireTenant();
  assertKanbanCan(auth, "kanban.board.read");
  if (!input.systemId || !input.boardId) return { ok: false, message: "ไม่พบบอร์ดนี้" };
  const ctx = ctxOf(auth, input.systemId);
  const actor = toActor(auth.user.id, auth.active);
  try {
    const csv = await exportCardsCsv(ctx, actor, input.boardId, { now: new Date(), filters: input.filters ?? {} });
    return { ok: true, csv };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "ส่งออกไม่สำเร็จ ลองใหม่อีกครั้ง" };
  }
}

/**
 * K2.10 — ส่งออก CSV ของแท็บรายงานที่กำลังเปิดอยู่ (เลยกำหนด/ภาระงาน/ผลงานรายสัปดาห์/อายุงาน)
 * `assertKanbanCan` ที่นี่เป็นแค่ด่าน "เข้าโมดูลได้ไหม" (เหมือนแพตเทิร์นของ `exportBoardCsvAction`)
 * — ด่านจริง (`kanban.report.view` + OWNER) อยู่ใน `reports.assertReportAccess()` ซึ่งเป็นผู้ตัดสินสุดท้าย
 * (MANAGER ผ่าน `assertKanbanCan` ได้เสมอผ่าน `evaluate()` แต่ยังโดน `assertReportAccess` ปฏิเสธถ้าไม่มีคีย์จริง)
 * ไม่มี route `/api/kanban/reports` สาธารณะ — ฝั่งจอแปลงข้อความนี้เป็นไฟล์ดาวน์โหลดผ่าน Blob เอง
 */
export async function exportReportCsvAction(input: {
  systemId: string;
  kind: ReportKind;
  boardId?: string;
}): Promise<{ ok: true; csv: string } | { ok: false; message: string }> {
  const auth = await requireTenant();
  assertKanbanCan(auth, "kanban.report.view");
  if (!input.systemId) return { ok: false, message: "ไม่พบระบบนี้" };
  const ctx = ctxOf(auth, input.systemId);
  const actor = toActor(auth.user.id, auth.active);
  try {
    const csv = await exportReportCsv(ctx, actor, input.kind, { now: new Date(), boardId: input.boardId });
    return { ok: true, csv };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "ส่งออกไม่สำเร็จ ลองใหม่อีกครั้ง" };
  }
}

// ───────────────────────── K2.2 — มุมมองปฏิทิน: ลากตั้ง/เปลี่ยนกำหนดส่ง ─────────────────────────
// 🔴 ตรวจสิทธิ์ระดับโมดูลที่นี่ (เหมือน `updateCardFieldsAction`) · ชั้นบทบาทบอร์ด (EDITOR+) ตรวจซ้ำใน
//    `calendar.setCardDueFromCalendar` เอง (หาบอร์ดจาก cardId จริง ไม่เชื่อ boardId ที่ฟอร์มส่งมา)

export async function setCardDueFromCalendarAction(input: {
  systemId: string;
  boardId: string;
  cardId: string;
  /** ISO 8601 — จอคำนวณเวลาก่อนส่งมา (เช่น 18:00 ไทยของวันที่ถูกลาก) */
  date: string;
  /** true = ลากระหว่างวันในปฏิทิน (เปลี่ยนเฉพาะวัน คงเวลาเดิม) · false/ไม่ส่ง = ตั้งจากถาด */
  keepTime?: boolean;
}): Promise<{ ok: true; dueAt: string } | { ok: false; message: string }> {
  const auth = await requireTenant();
  assertKanbanCan(auth, "kanban.card.update");
  if (!input.systemId || !input.cardId || !input.date) return { ok: false, message: "ไม่พบการ์ดนี้" };
  const date = new Date(input.date);
  if (isNaN(date.getTime())) return { ok: false, message: "วันที่ไม่ถูกต้อง" };
  try {
    const res = await setCardDueFromCalendar(ctxOf(auth, input.systemId), input.cardId, date, {
      keepTime: input.keepTime,
    });
    revalidatePath(boardPath(input.systemId, input.boardId));
    return { ok: true, dueAt: res.dueAt };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "ตั้งกำหนดส่งไม่สำเร็จ ลองใหม่อีกครั้ง" };
  }
}

// ───────────────────────── K2.3 — มุมมองไทม์ไลน์: ลากขอบ/ลากตัวแถบ ─────────────────────────
// 🔴 ตรวจสิทธิ์ระดับโมดูลที่นี่ (เหมือน `setCardDueFromCalendarAction`) · ชั้นบทบาทบอร์ด (EDITOR+) ตรวจซ้ำใน
//    `timeline.setCardRange`/`shiftCardRange` เอง (หาบอร์ดจาก cardId จริง ไม่เชื่อ boardId ที่ฟอร์มส่งมา)

/** ลากขอบซ้าย/ขวาของแถบ — `startAt`(ว่าง = ล้างวันเริ่ม)/`dueAt` ใหม่คำนวณฝั่งจอตามตำแหน่งที่ลากแล้วส่งมาตรง ๆ */
export async function setCardRangeAction(input: {
  systemId: string;
  boardId: string;
  cardId: string;
  /** ISO 8601 — null/"" = ล้างวันเริ่ม */
  startAt: string | null;
  /** ISO 8601 */
  dueAt: string;
}): Promise<{ ok: true; startAt: string | null; dueAt: string } | { ok: false; message: string }> {
  const auth = await requireTenant();
  assertKanbanCan(auth, "kanban.card.update");
  if (!input.systemId || !input.cardId || !input.dueAt) return { ok: false, message: "ไม่พบการ์ดนี้" };
  const dueAt = new Date(input.dueAt);
  if (isNaN(dueAt.getTime())) return { ok: false, message: "วันที่ไม่ถูกต้อง" };
  let startAt: Date | null = null;
  if (input.startAt) {
    startAt = new Date(input.startAt);
    if (isNaN(startAt.getTime())) return { ok: false, message: "วันที่ไม่ถูกต้อง" };
  }
  try {
    const res = await setCardRange(ctxOf(auth, input.systemId), input.cardId, { startAt, dueAt });
    revalidatePath(boardPath(input.systemId, input.boardId));
    return { ok: true, startAt: res.startAt, dueAt: res.dueAt };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "ตั้งช่วงวันไม่สำเร็จ ลองใหม่อีกครั้ง" };
  }
}

/** ลากตัวแถบ (ไม่ใช่ขอบ) — เลื่อนทั้งวันเริ่ม+กำหนดส่งไปพร้อมกันเป็นจำนวนวันเท่ากัน คงเวลาเดิมของทั้งคู่ */
export async function shiftCardRangeAction(input: {
  systemId: string;
  boardId: string;
  cardId: string;
  days: number;
}): Promise<{ ok: true; startAt: string | null; dueAt: string } | { ok: false; message: string }> {
  const auth = await requireTenant();
  assertKanbanCan(auth, "kanban.card.update");
  if (!input.systemId || !input.cardId || !Number.isFinite(input.days) || input.days === 0) {
    return { ok: false, message: "ไม่พบการ์ดนี้" };
  }
  try {
    const res = await shiftCardRange(ctxOf(auth, input.systemId), input.cardId, { days: Math.round(input.days) });
    revalidatePath(boardPath(input.systemId, input.boardId));
    return { ok: true, startAt: res.startAt, dueAt: res.dueAt };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "เลื่อนวันไม่สำเร็จ ลองใหม่อีกครั้ง" };
  }
}

// ───────────────────────── K1.14 — การตั้งค่าส่วนตัว (ปุ่มลัด) ─────────────────────────

/**
 * เปิด/ปิดปุ่มลัดคีย์บอร์ดของ "ผู้ใช้คนที่ล็อกอินอยู่" เท่านั้น
 * 🔴 ไม่รับ userId จากฟอร์ม — ถ้ารับ ใครก็ปิดปุ่มลัดให้คนอื่นได้ (ค่านี้ผูกกับ session เสมอ)
 * 🔴 ไม่ต้องมีคีย์สิทธิ์โมดูล: เป็นการตั้งค่าหน้าจอของตัวเอง ไม่ใช่ข้อมูลของร้าน
 */
export async function setKanbanShortcutsAction(input: {
  enabled: boolean;
}): Promise<{ ok: true; kanbanShortcuts: boolean }> {
  const auth = await requireTenant();
  const next = await setUserPreferences(auth.user.id, { kanbanShortcuts: !!input.enabled });
  revalidatePath("/app/settings/preferences");
  return { ok: true, kanbanShortcuts: next.kanbanShortcuts };
}

// ───────────────────────── K2.11 — ติดตาม + ความถี่อีเมล ─────────────────────────

/**
 * ติดตาม/เลิกติดตาม การ์ด · คอลัมน์ · บอร์ด (ปุ่ม 👁 · เมนูคอลัมน์ · เมนูบอร์ด)
 * 🔴 คนที่ติดตาม = คนที่ล็อกอินอยู่เสมอ (ไม่รับ userId จากฟอร์ม — ไม่งั้นสมัครแจ้งเตือนแทนคนอื่นได้)
 * 🔴 ด่านสิทธิ์จริง (VIEWER+ ของบอร์ด · มองไม่เห็น = 404) อยู่ใน `watch.ts` — ที่นี่ตรวจแค่ชั้นโมดูล
 */
export async function watchAction(input: {
  systemId: string;
  targetType: "CARD" | "COLUMN" | "BOARD";
  targetId: string;
}): Promise<{ ok: true; watching: boolean } | { ok: false; message: string }> {
  const auth = await requireTenant();
  assertKanbanCan(auth, "kanban.board.read");
  if (!input.systemId || !input.targetId) return { ok: false as const, message: "ข้อมูลไม่ครบ" };
  const ctx = ctxOf(auth, input.systemId);
  try {
    const actor = await requireActor(ctx);
    const res = await watch(ctx, actor, { targetType: input.targetType, targetId: input.targetId });
    return { ok: true as const, watching: res.watching };
  } catch (e) {
    return { ok: false as const, message: e instanceof Error ? e.message : "ติดตามไม่สำเร็จ" };
  }
}

export async function unwatchAction(input: {
  systemId: string;
  targetType: "CARD" | "COLUMN" | "BOARD";
  targetId: string;
}): Promise<{ ok: true; watching: boolean } | { ok: false; message: string }> {
  const auth = await requireTenant();
  assertKanbanCan(auth, "kanban.board.read");
  if (!input.systemId || !input.targetId) return { ok: false as const, message: "ข้อมูลไม่ครบ" };
  const ctx = ctxOf(auth, input.systemId);
  try {
    const actor = await requireActor(ctx);
    const res = await unwatch(ctx, actor, { targetType: input.targetType, targetId: input.targetId });
    return { ok: true as const, watching: res.watching };
  } catch (e) {
    return { ok: false as const, message: e instanceof Error ? e.message : "เลิกติดตามไม่สำเร็จ" };
  }
}

/**
 * ตั้งความถี่อีเมลของ "ตัวเอง" (บล็อก "การแจ้งเตือนของฉัน" ในหน้าตั้งค่าบอร์ดงาน)
 * 🔴 ไม่ต้องมีคีย์สิทธิ์โมดูล เหมือน `setKanbanShortcutsAction` — เป็นค่าของคน ไม่ใช่ของร้าน
 * 🔴 ค่าที่ส่งมาผ่าน `parsePreferences` อีกชั้นเสมอ (ค่าแปลก → ค่าเริ่มต้น ไม่ใช่เขียนลงตรง ๆ)
 */
export async function setKanbanNotifyPrefsAction(input: {
  emailMode?: string;
  digest?: string;
}): Promise<{ ok: true; kanbanEmailMode: KanbanEmailMode; kanbanDigest: KanbanDigestMode }> {
  const auth = await requireTenant();
  const patch: { kanbanEmailMode?: KanbanEmailMode; kanbanDigest?: KanbanDigestMode } = {};
  if (input.emailMode !== undefined) {
    patch.kanbanEmailMode = parsePreferences({ kanbanEmailMode: input.emailMode }).kanbanEmailMode;
  }
  if (input.digest !== undefined) {
    patch.kanbanDigest = parsePreferences({ kanbanDigest: input.digest }).kanbanDigest;
  }
  const next = await setUserPreferences(auth.user.id, patch);
  return { ok: true as const, kanbanEmailMode: next.kanbanEmailMode, kanbanDigest: next.kanbanDigest };
}

// ───────────────────────── K2.5 — มุมมองที่บันทึกไว้ ─────────────────────────
// 🔴 ตรวจสิทธิ์โมดูลขั้นต่ำที่นี่ (แบบเดียวกับ `searchCardsAction`/`starBoardAction`) — บทบาทบอร์ด
//    จริง (PRIVATE=VIEWER · BOARD=ADMIN) ตรวจซ้ำใน `views.ts` เอง (`assertBoardRole`)

export type SavedViewActionResult = { ok: true; view: SavedViewDto } | { ok: false; message: string };

/** บันทึกมุมมองปัจจุบันของบอร์ด (ปุ่ม "บันทึกมุมมองนี้" ใน `SavedViewsMenu.tsx`) */
export async function saveViewAction(input: {
  systemId: string;
  boardId: string;
  name: string;
  scope?: "PRIVATE" | "BOARD";
  config: unknown;
}): Promise<SavedViewActionResult> {
  const auth = await requireTenant();
  assertKanbanCan(auth, "kanban.board.read");
  if (!input.systemId || !input.boardId) return { ok: false, message: "ไม่พบบอร์ดนี้" };
  const ctx = ctxOf(auth, input.systemId);
  const actor = toActor(auth.user.id, auth.active);
  try {
    const view = await saveView(ctx, actor, {
      boardId: input.boardId,
      name: input.name,
      scope: input.scope,
      config: input.config,
    });
    revalidatePath(boardPath(input.systemId, input.boardId));
    revalidatePath(`${boardPath(input.systemId, input.boardId)}/settings/views`);
    return { ok: true, view };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "บันทึกมุมมองไม่สำเร็จ ลองใหม่อีกครั้ง" };
  }
}

/** แก้ชื่อ/config ของมุมมองที่บันทึกไว้ (หน้าตั้งค่าบอร์ด › มุมมองที่บันทึกไว้) */
export async function updateViewAction(input: {
  systemId: string;
  boardId: string;
  viewId: string;
  name?: string;
  config?: unknown;
}): Promise<SavedViewActionResult> {
  const auth = await requireTenant();
  assertKanbanCan(auth, "kanban.board.read");
  if (!input.systemId || !input.viewId) return { ok: false, message: "ไม่พบมุมมองนี้" };
  const ctx = ctxOf(auth, input.systemId);
  const actor = toActor(auth.user.id, auth.active);
  try {
    const view = await updateView(ctx, actor, input.viewId, { name: input.name, config: input.config });
    revalidatePath(boardPath(input.systemId, input.boardId));
    revalidatePath(`${boardPath(input.systemId, input.boardId)}/settings/views`);
    return { ok: true, view };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "แก้ไขมุมมองไม่สำเร็จ ลองใหม่อีกครั้ง" };
  }
}

/** ลบมุมมองที่บันทึกไว้ */
export async function deleteViewAction(input: {
  systemId: string;
  boardId: string;
  viewId: string;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  const auth = await requireTenant();
  assertKanbanCan(auth, "kanban.board.read");
  if (!input.systemId || !input.viewId) return { ok: false, message: "ไม่พบมุมมองนี้" };
  const ctx = ctxOf(auth, input.systemId);
  const actor = toActor(auth.user.id, auth.active);
  try {
    await deleteView(ctx, actor, input.viewId);
    revalidatePath(boardPath(input.systemId, input.boardId));
    revalidatePath(`${boardPath(input.systemId, input.boardId)}/settings/views`);
    return { ok: true };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "ลบมุมมองไม่สำเร็จ ลองใหม่อีกครั้ง" };
  }
}

/** K2.12 (หนี้ K2.5): ลากเรียง/ปุ่ม ↑↓ มุมมองที่บันทึกไว้ในหน้าตั้งค่า — แพตเทิร์นเดียวกับ reorderFieldsAction */
export async function reorderViewsAction(input: {
  systemId: string;
  boardId: string;
  ids: string[];
}): Promise<{ ok: true } | { ok: false; message: string }> {
  const auth = await requireTenant();
  assertKanbanCan(auth, "kanban.board.read");
  if (!input.systemId || !input.boardId) return { ok: false, message: "ไม่พบบอร์ดนี้" };
  const ctx = ctxOf(auth, input.systemId);
  const actor = toActor(auth.user.id, auth.active);
  try {
    await reorderViews(ctx, actor, input.ids);
    revalidatePath(`${boardPath(input.systemId, input.boardId)}/settings/views`);
    return { ok: true };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "จัดลำดับมุมมองไม่สำเร็จ ลองใหม่อีกครั้ง" };
  }
}

// ═══════════════════════════ K2.6: ฟิลด์กำหนดเอง ═══════════════════════════
// นิยามฟิลด์ (สร้าง/แก้/ลบ/ลากเรียง) = ตั้งค่าบอร์ด (ADMIN — ตรวจจริงใน `fields.ts`)
// ค่าฟิลด์ต่อการ์ด = หลังการ์ด (EDITOR ขึ้นไป — ตรวจจริงใน `fields.ts`)

function fieldsSettingsPath(systemId: string, boardId: string) {
  return `${boardPath(systemId, boardId)}/settings/fields`;
}

export async function createFieldAction(input: {
  systemId: string;
  boardId: string;
  name: string;
  type: string;
  options?: unknown;
  showOnCard?: boolean;
}): Promise<{ ok: true; field: CustomFieldDto } | { ok: false; message: string }> {
  const auth = await requireTenant();
  assertKanbanCan(auth, "kanban.board.read");
  if (!input.systemId || !input.boardId) return { ok: false, message: "ไม่พบบอร์ดนี้" };
  const ctx = ctxOf(auth, input.systemId);
  const actor = toActor(auth.user.id, auth.active);
  try {
    const field = await createField(ctx, actor, input.boardId, {
      name: input.name,
      type: input.type,
      options: input.options,
      showOnCard: input.showOnCard,
    });
    revalidatePath(boardPath(input.systemId, input.boardId));
    revalidatePath(fieldsSettingsPath(input.systemId, input.boardId));
    return { ok: true, field };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "สร้างฟิลด์ไม่สำเร็จ ลองใหม่อีกครั้ง" };
  }
}

export async function updateFieldAction(input: {
  systemId: string;
  boardId: string;
  fieldId: string;
  name?: string;
  options?: unknown;
  showOnCard?: boolean;
}): Promise<{ ok: true; field: CustomFieldDto } | { ok: false; message: string }> {
  const auth = await requireTenant();
  assertKanbanCan(auth, "kanban.board.read");
  if (!input.systemId || !input.fieldId) return { ok: false, message: "ไม่พบฟิลด์นี้" };
  const ctx = ctxOf(auth, input.systemId);
  const actor = toActor(auth.user.id, auth.active);
  try {
    const field = await updateField(ctx, actor, input.fieldId, {
      name: input.name,
      options: input.options,
      showOnCard: input.showOnCard,
    });
    revalidatePath(boardPath(input.systemId, input.boardId));
    revalidatePath(fieldsSettingsPath(input.systemId, input.boardId));
    return { ok: true, field };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "แก้ไขฟิลด์ไม่สำเร็จ ลองใหม่อีกครั้ง" };
  }
}

export async function deleteFieldAction(input: {
  systemId: string;
  boardId: string;
  fieldId: string;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  const auth = await requireTenant();
  assertKanbanCan(auth, "kanban.board.read");
  if (!input.systemId || !input.fieldId) return { ok: false, message: "ไม่พบฟิลด์นี้" };
  const ctx = ctxOf(auth, input.systemId);
  const actor = toActor(auth.user.id, auth.active);
  try {
    await deleteField(ctx, actor, input.fieldId);
    revalidatePath(boardPath(input.systemId, input.boardId));
    revalidatePath(fieldsSettingsPath(input.systemId, input.boardId));
    return { ok: true };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "ลบฟิลด์ไม่สำเร็จ ลองใหม่อีกครั้ง" };
  }
}

export async function reorderFieldsAction(input: {
  systemId: string;
  boardId: string;
  ids: string[];
}): Promise<{ ok: true } | { ok: false; message: string }> {
  const auth = await requireTenant();
  assertKanbanCan(auth, "kanban.board.read");
  if (!input.systemId || !input.boardId) return { ok: false, message: "ไม่พบบอร์ดนี้" };
  const ctx = ctxOf(auth, input.systemId);
  const actor = toActor(auth.user.id, auth.active);
  try {
    await reorderFields(ctx, actor, input.boardId, input.ids);
    revalidatePath(fieldsSettingsPath(input.systemId, input.boardId));
    return { ok: true };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "จัดลำดับฟิลด์ไม่สำเร็จ ลองใหม่อีกครั้ง" };
  }
}

/** ตั้งค่าฟิลด์ของการ์ด 1 ใบ (หลังการ์ด) — `value: null` = ล้างค่า · `type` บอก action ว่าต้องแปลง ISO string เป็นวันที่ไหม */
export async function setCardFieldValueAction(input: {
  systemId: string;
  boardId: string;
  cardId: string;
  fieldId: string;
  type: CustomFieldDto["type"];
  value: string | number | boolean | null;
}): Promise<{ ok: true; field: CardFieldValueDto } | { ok: false; message: string }> {
  const auth = await requireTenant();
  assertKanbanCan(auth, "kanban.card.update");
  if (!input.systemId || !input.cardId || !input.fieldId) return { ok: false, message: "ไม่พบฟิลด์นี้" };
  const ctx = ctxOf(auth, input.systemId);
  const actor = toActor(auth.user.id, auth.active);
  try {
    const value = input.value === null ? null : input.type === "DATE" ? new Date(input.value as string) : input.value;
    const field = await setCardFieldValue(ctx, actor, input.cardId, input.fieldId, value);
    revalidatePath(boardPath(input.systemId, input.boardId));
    return { ok: true, field };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "บันทึกฟิลด์ไม่สำเร็จ ลองใหม่อีกครั้ง" };
  }
}

// ═══════════════════════════ K2.7: เทมเพลตการ์ด + กำหนดส่งซ้ำ ═══════════════════════════
// บันทึก/แก้/ลบ/ลากเรียงเทมเพลต = ตั้งค่าบอร์ด (ADMIN) · สร้างการ์ดจากเทมเพลต = EDITOR
// ตั้ง/ล้างกำหนดส่งซ้ำ = หลังการ์ด (EDITOR) — บทบาทบอร์ดจริงตรวจใน `card-templates.ts`/`recurrence.ts` เสมอ

function cardTemplatesSettingsPath(systemId: string, boardId: string) {
  return `${boardPath(systemId, boardId)}/settings/card-templates`;
}

/** บันทึกการ์ดที่เปิดอยู่เป็นเทมเพลตใหม่ (เมนู ⋯ ของการ์ด "บันทึกเป็นเทมเพลตการ์ด" — ADMIN) */
export async function saveCardTemplateAction(input: {
  systemId: string;
  boardId: string;
  cardId: string;
  name: string;
}): Promise<{ ok: true; template: CardTemplateDto } | { ok: false; message: string }> {
  const auth = await requireTenant();
  assertKanbanCan(auth, "kanban.board.read");
  if (!input.systemId || !input.cardId) return { ok: false, message: "ไม่พบการ์ดนี้" };
  const ctx = ctxOf(auth, input.systemId);
  const actor = toActor(auth.user.id, auth.active);
  try {
    const template = await saveAsCardTemplate(ctx, actor, input.cardId, { name: input.name });
    revalidatePath(boardPath(input.systemId, input.boardId));
    revalidatePath(cardTemplatesSettingsPath(input.systemId, input.boardId));
    return { ok: true, template };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "บันทึกเทมเพลตไม่สำเร็จ ลองใหม่อีกครั้ง" };
  }
}

/** สร้างการ์ดใหม่จากเทมเพลต (ปุ่ม "จากเทมเพลต ▾" ในคอลัมน์ — `CardTemplatePicker.tsx`) */
export async function createCardFromTemplateAction(input: {
  systemId: string;
  boardId: string;
  templateId: string;
  columnId: string;
  title?: string;
  dueAt?: string | null;
  assigneeUserIds?: string[];
}): Promise<{ ok: true; card: BoardCardDto; columnId: string } | { ok: false; message: string }> {
  const auth = await requireTenant();
  assertKanbanCan(auth, "kanban.card.create");
  if (!input.systemId || !input.templateId || !input.columnId) return { ok: false, message: "ไม่พบเทมเพลตหรือคอลัมน์นี้" };
  const ctx = ctxOf(auth, input.systemId);
  const actor = toActor(auth.user.id, auth.active);
  try {
    const created = await createCardFromTemplate(ctx, actor, {
      templateId: input.templateId,
      columnId: input.columnId,
      title: input.title,
      dueAt: input.dueAt ? new Date(input.dueAt) : undefined,
      assigneeUserIds: input.assigneeUserIds,
    });
    const [labelRows, assigneeRows] = await Promise.all([
      listCardLabelDtos(ctx, created.id),
      listCardAssigneeDtos(ctx, created.id),
    ]);
    const checklist = await checklistProgressOfCard(ctx, created.id);
    revalidatePath(boardPath(input.systemId, input.boardId));
    return { ok: true, card: toBoardCardDto(created, labelRows, assigneeRows, checklist), columnId: created.columnId };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "สร้างการ์ดจากเทมเพลตไม่สำเร็จ ลองใหม่อีกครั้ง" };
  }
}

/** แก้ชื่อเทมเพลต/ชื่อการ์ด/รายละเอียดในเทมเพลต (ตั้งค่าบอร์ด › เทมเพลตการ์ด) */
export async function updateCardTemplateAction(input: {
  systemId: string;
  boardId: string;
  templateId: string;
  name?: string;
  title?: string;
  description?: string | null;
}): Promise<{ ok: true; template: CardTemplateDto } | { ok: false; message: string }> {
  const auth = await requireTenant();
  assertKanbanCan(auth, "kanban.board.read");
  if (!input.systemId || !input.templateId) return { ok: false, message: "ไม่พบเทมเพลตนี้" };
  const ctx = ctxOf(auth, input.systemId);
  const actor = toActor(auth.user.id, auth.active);
  try {
    const template = await updateCardTemplate(ctx, actor, input.templateId, {
      name: input.name,
      title: input.title,
      description: input.description,
    });
    revalidatePath(cardTemplatesSettingsPath(input.systemId, input.boardId));
    return { ok: true, template };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "แก้ไขเทมเพลตไม่สำเร็จ ลองใหม่อีกครั้ง" };
  }
}

export async function deleteCardTemplateAction(input: {
  systemId: string;
  boardId: string;
  templateId: string;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  const auth = await requireTenant();
  assertKanbanCan(auth, "kanban.board.read");
  if (!input.systemId || !input.templateId) return { ok: false, message: "ไม่พบเทมเพลตนี้" };
  const ctx = ctxOf(auth, input.systemId);
  const actor = toActor(auth.user.id, auth.active);
  try {
    await deleteCardTemplate(ctx, actor, input.templateId);
    revalidatePath(boardPath(input.systemId, input.boardId));
    revalidatePath(cardTemplatesSettingsPath(input.systemId, input.boardId));
    return { ok: true };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "ลบเทมเพลตไม่สำเร็จ ลองใหม่อีกครั้ง" };
  }
}

export async function reorderCardTemplatesAction(input: {
  systemId: string;
  boardId: string;
  ids: string[];
}): Promise<{ ok: true } | { ok: false; message: string }> {
  const auth = await requireTenant();
  assertKanbanCan(auth, "kanban.board.read");
  if (!input.systemId || !input.boardId) return { ok: false, message: "ไม่พบบอร์ดนี้" };
  const ctx = ctxOf(auth, input.systemId);
  const actor = toActor(auth.user.id, auth.active);
  try {
    await reorderCardTemplates(ctx, actor, input.boardId, input.ids);
    revalidatePath(cardTemplatesSettingsPath(input.systemId, input.boardId));
    return { ok: true };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "จัดลำดับเทมเพลตไม่สำเร็จ ลองใหม่อีกครั้ง" };
  }
}

/** ตั้ง/ล้างกำหนดส่งซ้ำของการ์ด (บล็อก "กำหนดส่งซ้ำ" ในหลังการ์ด — `rule: null` = เลือก "ไม่ซ้ำ") */
export async function setCardRecurrenceAction(input: {
  systemId: string;
  boardId: string;
  cardId: string;
  rule: string | null;
}): Promise<{ ok: true; recurrenceLabel: string | null } | { ok: false; message: string }> {
  const auth = await requireTenant();
  assertKanbanCan(auth, "kanban.card.update");
  if (!input.systemId || !input.cardId) return { ok: false, message: "ไม่พบการ์ดนี้" };
  const ctx = ctxOf(auth, input.systemId);
  const actor = toActor(auth.user.id, auth.active);
  try {
    await setCardRecurrence(ctx, actor, input.cardId, input.rule);
    revalidatePath(boardPath(input.systemId, input.boardId));
    return { ok: true, recurrenceLabel: input.rule ? describeRecurrence(input.rule) : null };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "ตั้งกำหนดส่งซ้ำไม่สำเร็จ ลองใหม่อีกครั้ง" };
  }
}

// ───────────────────────── K2.8 — กล่องงานเข้าส่วนตัว ─────────────────────────

/** ช่อง "พิมพ์แล้วกด Enter" บนหน้า "งานของฉัน" — จดเร็ว (source MANUAL เสมอ) ให้ตัวเอง */
export async function quickAddInboxAction(input: {
  systemId: string;
  title: string;
}): Promise<{ ok: true; item: InboxItemDto } | { ok: false; message: string }> {
  const auth = await requireTenant();
  assertKanbanCan(auth, "kanban.board.read");
  if (!input.systemId) return { ok: false, message: "ไม่พบระบบนี้" };
  try {
    const item = await quickAddInbox(ctxOf(auth, input.systemId), { title: input.title });
    revalidatePath(myTasksPath(input.systemId));
    return { ok: true, item };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "จดงานไม่สำเร็จ ลองใหม่อีกครั้ง" };
  }
}

/** ปุ่ม "ส่งเข้าบอร์ด" ของแต่ละรายการในกล่องงานเข้า — เลือกบอร์ด/คอลัมน์/กำหนดส่ง (ไม่บังคับ) แล้วกลายเป็นการ์ดจริง */
export async function moveInboxToBoardAction(input: {
  systemId: string;
  itemId: string;
  boardId: string;
  columnId: string;
  dueAt?: string;
  assigneeUserIds?: string[];
}): Promise<{ ok: true; cardId: string } | { ok: false; message: string }> {
  const auth = await requireTenant();
  assertKanbanCan(auth, "kanban.card.create");
  if (!input.systemId || !input.itemId || !input.boardId || !input.columnId) {
    return { ok: false, message: "ไม่พบรายการหรือบอร์ดปลายทาง" };
  }
  try {
    const res = await moveInboxToBoard(ctxOf(auth, input.systemId), {
      itemId: input.itemId,
      boardId: input.boardId,
      columnId: input.columnId,
      dueAt: input.dueAt ? parseDue(input.dueAt) : null,
      assigneeUserIds: input.assigneeUserIds,
    });
    revalidatePath(myTasksPath(input.systemId));
    revalidatePath(boardPath(input.systemId, input.boardId));
    return { ok: true, cardId: res.cardId };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "ส่งเข้าบอร์ดไม่สำเร็จ ลองใหม่อีกครั้ง" };
  }
}

/** ปุ่ม "ไม่เอาแล้ว" ของแต่ละรายการในกล่องงานเข้า — ปิดรายการโดยไม่สร้างการ์ด */
export async function dismissInboxAction(input: {
  systemId: string;
  itemId: string;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  const auth = await requireTenant();
  assertKanbanCan(auth, "kanban.board.read");
  if (!input.systemId || !input.itemId) return { ok: false, message: "ไม่พบรายการนี้" };
  try {
    await dismissInbox(ctxOf(auth, input.systemId), input.itemId);
    revalidatePath(myTasksPath(input.systemId));
    return { ok: true };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "ลบรายการไม่สำเร็จ ลองใหม่อีกครั้ง" };
  }
}

// ───────────────────────── K3.1: เชื่อมข้อมูล SHARK ─────────────────────────
// 🔴 ทุกตัวคืนรายการใหม่ทั้งชุด (`links`) ให้หน้าจอวาดทับ ไม่ใช่ให้ client ประกอบเอง —
//    สิทธิ์ของแต่ละแถวคิดจากฝั่ง server เท่านั้น (client ประกอบเอง = ช่องหลุดข้อมูล)

export async function addCardLinkAction(input: {
  systemId: string;
  cardId: string;
  linkType: KanbanLinkKind;
  linkId: string;
  role?: KanbanLinkRole;
  label?: string;
}): Promise<{ ok: true; links: CardLinkDto[] } | { ok: false; message: string }> {
  const auth = await requireTenant();
  assertKanbanCan(auth, "kanban.card.update");
  if (!input.systemId || !input.cardId) return { ok: false as const, message: "ข้อมูลไม่ครบ" };
  const ctx = ctxOf(auth, input.systemId);
  try {
    const actor = await requireActor(ctx);
    await addLink(ctx, input.cardId, {
      linkType: input.linkType,
      linkId: input.linkId,
      role: input.role ?? null,
      label: input.label ?? null,
    });
    return { ok: true as const, links: await listCardLinks(ctx, actor, input.cardId) };
  } catch (e) {
    return { ok: false as const, message: e instanceof Error ? e.message : "เชื่อมข้อมูลไม่สำเร็จ" };
  }
}

export async function removeCardLinkAction(input: {
  systemId: string;
  cardId: string;
  linkRowId: string;
}): Promise<{ ok: true; links: CardLinkDto[] } | { ok: false; message: string }> {
  const auth = await requireTenant();
  assertKanbanCan(auth, "kanban.card.update");
  if (!input.systemId || !input.cardId || !input.linkRowId) return { ok: false as const, message: "ข้อมูลไม่ครบ" };
  const ctx = ctxOf(auth, input.systemId);
  try {
    const actor = await requireActor(ctx);
    await removeLink(ctx, input.cardId, input.linkRowId);
    return { ok: true as const, links: await listCardLinks(ctx, actor, input.cardId) };
  } catch (e) {
    return { ok: false as const, message: e instanceof Error ? e.message : "ถอดการเชื่อมไม่สำเร็จ" };
  }
}

/**
 * ค้นผู้ติดต่อสำหรับป๊อปอัป "เพิ่มการเชื่อม"
 * 🔴 คืนแค่ `{ id, name }` (ผ่าน facade ของโมดูลผู้ติดต่อ) — ช่องค้นหานี้ไม่ใช่สมุดที่อยู่ลูกค้า
 */
export async function searchPartyForLinkAction(input: {
  systemId: string;
  q: string;
}): Promise<{ ok: true; results: { id: string; name: string }[] } | { ok: false; message: string }> {
  const auth = await requireTenant();
  assertKanbanCan(auth, "kanban.card.update");
  if (!input.systemId) return { ok: false as const, message: "ข้อมูลไม่ครบ" };
  const ctx = ctxOf(auth, input.systemId);
  try {
    return { ok: true as const, results: await searchPartiesForLink(ctx, input.q ?? "") };
  } catch (e) {
    return { ok: false as const, message: e instanceof Error ? e.message : "ค้นหาไม่สำเร็จ" };
  }
}

// ───────────────────────── K3.2: การเชื่อมต่อ (สวิตช์รายร้าน) ─────────────────────────
// 🔴 ด่านจริงอยู่ใน `integrations.setIntegrations` (OWNER หรือคีย์ `kanban.automation.manage`
//    + ต้องเป็น ADMIN ของบอร์ดปลายทาง) — ที่นี่ตรวจแค่ชั้นสิทธิ์โมดูลเหมือน action อื่นของไฟล์นี้

export async function setIntegrationsAction(input: {
  systemId: string;
  patch: IntegrationsPatch;
}): Promise<{ ok: true; integrations: KanbanIntegrations; boards: IntegrationBoardOption[] } | { ok: false; message: string }> {
  const auth = await requireTenant();
  assertKanbanCan(auth, "kanban.automation.manage");
  if (!input.systemId) return { ok: false as const, message: "ข้อมูลไม่ครบ" };
  const ctx = ctxOf(auth, input.systemId);
  const actor = toActor(auth.user.id, auth.active);
  try {
    const integrations = await setIntegrations(ctx, actor, input.patch ?? {});
    const boards = await listTaskTargetBoards(ctx, actor, "ADMIN");
    revalidatePath(`/app/sys/${input.systemId}/kanban/settings`);
    return { ok: true as const, integrations, boards };
  } catch (e) {
    return { ok: false as const, message: e instanceof Error ? e.message : "บันทึกการเชื่อมต่อไม่สำเร็จ" };
  }
}

/** อ่านค่าปัจจุบัน (หน้าตั้งค่าโหลดครั้งแรกจาก server component — ตัวนี้ไว้ให้จอรีเฟรชหลังบันทึก) */
export async function loadIntegrationsAction(input: {
  systemId: string;
}): Promise<{ ok: true; integrations: KanbanIntegrations } | { ok: false; message: string }> {
  const auth = await requireTenant();
  assertKanbanCan(auth, "kanban.board.read");
  if (!input.systemId) return { ok: false as const, message: "ข้อมูลไม่ครบ" };
  return { ok: true as const, integrations: await getIntegrations(auth.active.tenantId, input.systemId) };
}


// ───────────────────────── K3.5: ปุ่มผู้ช่วย AI ในหลังการ์ด ─────────────────────────
// 🔴 ด่านจริงอยู่ใน `ai.ts` (EDITOR ของบอร์ด ผ่าน `assertCardRole`) — ที่นี่ตรวจชั้นสิทธิ์โมดูล
//    เหมือน action อื่นของไฟล์นี้ · ทุกตัวคืน `{ok:false, message}` ไทย ไม่โยน (ปุ่มบนจอต้องบอกเหตุได้)
// 🔴 `suggestChecklistAction` **ไม่เขียนอะไรลง DB** — เช็คลิสต์เกิดตอน `acceptChecklistSuggestionAction`
//    ซึ่งรับรายการที่ผู้ใช้เห็น (และแก้ได้) บนจอแล้วเท่านั้น

export async function summarizeCardAction(input: {
  systemId: string;
  cardId: string;
}): Promise<{ ok: true; comments: KanbanCommentDto[]; text: string } | { ok: false; message: string }> {
  const auth = await requireTenant();
  assertKanbanCan(auth, "kanban.card.comment");
  if (!input.systemId || !input.cardId) return { ok: false as const, message: "ข้อมูลไม่ครบ" };
  const ctx = ctxOf(auth, input.systemId);
  try {
    const res = await summarizeCard(ctx, toActor(auth.user.id, auth.active), input.cardId);
    return { ok: true as const, comments: await listComments(ctx, input.cardId), text: res.text };
  } catch (e) {
    return { ok: false as const, message: e instanceof Error ? e.message : "สรุปการ์ดไม่สำเร็จ" };
  }
}

export async function suggestChecklistAction(input: {
  systemId: string;
  cardId: string;
}): Promise<{ ok: true; suggestion: ChecklistSuggestion } | { ok: false; message: string }> {
  const auth = await requireTenant();
  assertKanbanCan(auth, "kanban.card.update");
  if (!input.systemId || !input.cardId) return { ok: false as const, message: "ข้อมูลไม่ครบ" };
  try {
    const suggestion = await suggestChecklist(ctxOf(auth, input.systemId), toActor(auth.user.id, auth.active), input.cardId);
    return { ok: true as const, suggestion };
  } catch (e) {
    return { ok: false as const, message: e instanceof Error ? e.message : "ขอข้อเสนอเช็คลิสต์ไม่สำเร็จ" };
  }
}

export async function acceptChecklistSuggestionAction(input: {
  systemId: string;
  cardId: string;
  suggestion: ChecklistSuggestion;
}): Promise<{ ok: true; checklists: KanbanChecklistDto[] } | { ok: false; message: string }> {
  const auth = await requireTenant();
  assertKanbanCan(auth, "kanban.card.update");
  if (!input.systemId || !input.cardId) return { ok: false as const, message: "ข้อมูลไม่ครบ" };
  const ctx = ctxOf(auth, input.systemId);
  try {
    await acceptChecklistSuggestion(ctx, toActor(auth.user.id, auth.active), input.cardId, input.suggestion);
    return { ok: true as const, checklists: await getCardChecklists(ctx, input.cardId) };
  } catch (e) {
    return { ok: false as const, message: e instanceof Error ? e.message : "เพิ่มเช็คลิสต์ไม่สำเร็จ" };
  }
}

export async function draftReplyAction(input: {
  systemId: string;
  cardId: string;
}): Promise<{ ok: true; text: string } | { ok: false; message: string }> {
  const auth = await requireTenant();
  assertKanbanCan(auth, "kanban.card.update");
  if (!input.systemId || !input.cardId) return { ok: false as const, message: "ข้อมูลไม่ครบ" };
  try {
    const res = await draftReply(ctxOf(auth, input.systemId), toActor(auth.user.id, auth.active), input.cardId);
    return { ok: true as const, text: res.text };
  } catch (e) {
    return { ok: false as const, message: e instanceof Error ? e.message : "ร่างข้อความไม่สำเร็จ" };
  }
}
