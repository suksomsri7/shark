"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireTenant } from "@/lib/core/context";
import { assertCan } from "@/lib/core/rbac";
import {
  archiveBoard,
  archiveCard,
  createBoard,
  createCard,
  createColumn,
  listCardAssigneeDtos,
  listCardLabelDtos,
  renameBoard,
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
  duplicateCard,
  getCardDetail,
  restoreCard,
  setCardAssignees,
  updateCardFields,
} from "./cards";
import { createLabel, setCardLabels } from "./labels";
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
import type { BoardCardDto, BoardLabelDto, CardDetailDto, KanbanChecklistDto, KanbanCtx } from "./types";

// ทุก action: requireTenant → เอา tenantId จาก session (ไม่เชื่อ client) + scope ด้วย systemId

// ตรวจสิทธิ์โมดูล (system-scoped) — OWNER/MANAGER ผ่าน · STAFF ตาม permission
// หมายเหตุ: scope ระดับ systemId รอ kernel Phase ถัดไป (ตอนนี้ตรวจ module+action)
function assertKanbanCan(auth: Awaited<ReturnType<typeof requireTenant>>, action: string) {
  assertCan(
    {
      role: auth.active.role,
      unitAccess: auth.active.unitAccess as string[],
      permissions: auth.active.permissions as Record<string, unknown>,
    },
    { module: "kanban", action },
  );
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
  await renameBoard(auth.active.tenantId, input.systemId, input.boardId, name);
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
  await archiveBoard(auth.active.tenantId, systemId, boardId);
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
  await createColumn(auth.active.tenantId, systemId, boardId, name);
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
  await archiveCard(auth.active.tenantId, systemId, cardId);
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
    revalidatePath(boardPath(input.systemId, input.boardId));
    return { ok: true, card: toBoardCardDto(restored, labelRows, assigneeRows, checklist), columnId: restored.columnId };
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
