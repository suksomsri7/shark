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
import type { BoardCardDto, KanbanCtx } from "./types";

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

export async function archiveCardAction(formData: FormData) {
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
