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
import { assertBoardRole, assertCardRole, assertColumnRole } from "./members";
import type { KanbanCtx } from "./types";

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

function boardPath(systemId: string, boardId?: string) {
  return boardId ? `/app/sys/${systemId}/kanban/${boardId}` : `/app/sys/${systemId}`;
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

export async function renameBoardAction(formData: FormData) {
  const auth = await requireTenant();
  assertKanbanCan(auth, "kanban.board.rename");
  const systemId = String(formData.get("systemId") ?? "");
  const boardId = String(formData.get("boardId") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  if (!systemId || !boardId || name.length < 1) return;
  // ชั้นที่ 2 (K1.3): ตั้งค่าบอร์ด = ADMIN ของบอร์ดใบนั้น · มองไม่เห็น = 404
  await assertBoardRole(ctxOf(auth, systemId), boardId, "ADMIN");
  await renameBoard(auth.active.tenantId, systemId, boardId, name);
  revalidatePath(boardPath(systemId, boardId));
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

export async function archiveColumnAction(formData: FormData) {
  const auth = await requireTenant();
  assertKanbanCan(auth, "kanban.column.delete");
  const systemId = String(formData.get("systemId") ?? "");
  const boardId = String(formData.get("boardId") ?? "");
  const columnId = String(formData.get("columnId") ?? "");
  if (!systemId || !boardId || !columnId) return;
  // 🔴 หาบอร์ดจาก columnId จริง ไม่เชื่อ boardId ในฟอร์ม (ไม่งั้นยิงคอลัมน์ของบอร์ดลับผ่านด่านได้)
  //    (ด่านบทบาทบอร์ด ADMIN อยู่ใน `archiveColumnEmpty` แล้ว — เก็บได้เฉพาะคอลัมน์ที่ว่าง · D16)
  await archiveColumnEmpty(ctxOf(auth, systemId), columnId);
  revalidatePath(boardPath(systemId, boardId));
}

// ── K1.4: คอลัมน์ — เปลี่ยนชื่อ (EDITOR) · ย้ายซ้าย-ขวา (EDITOR) · WIP/ธงเสร็จ (ADMIN) · ย้ายการ์ดออกทั้งคอลัมน์
export async function renameColumnAction(formData: FormData) {
  const auth = await requireTenant();
  assertKanbanCan(auth, "kanban.column.create");
  const systemId = String(formData.get("systemId") ?? "");
  const boardId = String(formData.get("boardId") ?? "");
  const columnId = String(formData.get("columnId") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  if (!systemId || !columnId || name.length < 1) return;
  await renameColumnV2(ctxOf(auth, systemId), columnId, name);
  revalidatePath(boardPath(systemId, boardId));
}

export async function moveColumnAction(formData: FormData) {
  const auth = await requireTenant();
  assertKanbanCan(auth, "kanban.column.create");
  const systemId = String(formData.get("systemId") ?? "");
  const boardId = String(formData.get("boardId") ?? "");
  const columnId = String(formData.get("columnId") ?? "");
  const beforeColumnId = String(formData.get("beforeColumnId") ?? "").trim() || null;
  const afterColumnId = String(formData.get("afterColumnId") ?? "").trim() || null;
  if (!systemId || !columnId) return;
  await moveColumn(ctxOf(auth, systemId), { columnId, beforeColumnId, afterColumnId });
  revalidatePath(boardPath(systemId, boardId));
}

export async function setColumnWipAction(formData: FormData) {
  const auth = await requireTenant();
  assertKanbanCan(auth, "kanban.column.create");
  const systemId = String(formData.get("systemId") ?? "");
  const boardId = String(formData.get("boardId") ?? "");
  const columnId = String(formData.get("columnId") ?? "");
  const raw = String(formData.get("wipLimit") ?? "").trim();
  if (!systemId || !columnId) return;
  // ช่องว่าง = ไม่จำกัด · ค่าที่ไม่ใช่ตัวเลข/0/ติดลบ ถูกปฏิเสธพร้อมข้อความไทยใน service
  await setColumnWip(ctxOf(auth, systemId), columnId, raw === "" ? null : Number(raw));
  revalidatePath(boardPath(systemId, boardId));
}

export async function setColumnDoneAction(formData: FormData) {
  const auth = await requireTenant();
  assertKanbanCan(auth, "kanban.column.create");
  const systemId = String(formData.get("systemId") ?? "");
  const boardId = String(formData.get("boardId") ?? "");
  const columnId = String(formData.get("columnId") ?? "");
  const isDone = String(formData.get("isDone") ?? "") === "1";
  if (!systemId || !columnId) return;
  await setColumnDone(ctxOf(auth, systemId), columnId, isDone);
  revalidatePath(boardPath(systemId, boardId));
}

export async function moveAllCardsAction(formData: FormData) {
  const auth = await requireTenant();
  assertKanbanCan(auth, "kanban.card.move");
  const systemId = String(formData.get("systemId") ?? "");
  const boardId = String(formData.get("boardId") ?? "");
  const fromColumnId = String(formData.get("fromColumnId") ?? "");
  const toColumnId = String(formData.get("toColumnId") ?? "");
  if (!systemId || !fromColumnId || !toColumnId) return;
  await moveAllCards(ctxOf(auth, systemId), { fromColumnId, toColumnId });
  revalidatePath(boardPath(systemId, boardId));
}

// ───────────────────────── Card ─────────────────────────

export async function createCardAction(formData: FormData) {
  const auth = await requireTenant();
  assertKanbanCan(auth, "kanban.card.create");
  const systemId = String(formData.get("systemId") ?? "");
  const boardId = String(formData.get("boardId") ?? "");
  const columnId = String(formData.get("columnId") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  const assigneeUserId = String(formData.get("assigneeUserId") ?? "").trim() || null;
  const dueAt = parseDue(String(formData.get("dueAt") ?? ""));
  if (!systemId || !columnId || title.length < 1) return;
  await assertColumnRole(ctxOf(auth, systemId), columnId, "EDITOR");
  await createCard({
    tenantId: auth.active.tenantId,
    systemId,
    columnId,
    title,
    assigneeUserId,
    dueAt,
  });
  revalidatePath(boardPath(systemId, boardId));
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
 * ย้ายการ์ด — รับได้ 2 แบบในตัวเดียว
 *  - ลากวาง (K1.5): `toColumnId` + `beforeCardId`/`afterCardId` (id ของเพื่อนบ้านเท่านั้น ห้ามส่ง position)
 *  - ปุ่ม ◀ ▶ ของหน้าเดิม: `direction=left|right` → ต่อท้ายคอลัมน์ข้าง ๆ
 * คืนผลลัพธ์ของ `moveCard` ตรง ๆ ({ok:false, code} เมื่อคอลัมน์เต็ม/การ์ดถูกเก็บ) ให้ client เอาไป rollback + toast
 */
export async function moveCardAction(formData: FormData) {
  const auth = await requireTenant();
  assertKanbanCan(auth, "kanban.card.move");
  const systemId = String(formData.get("systemId") ?? "");
  const boardId = String(formData.get("boardId") ?? "");
  const cardId = String(formData.get("cardId") ?? "");
  const toColumnId = String(formData.get("toColumnId") ?? "").trim();
  const beforeCardId = String(formData.get("beforeCardId") ?? "").trim() || null;
  const afterCardId = String(formData.get("afterCardId") ?? "").trim() || null;
  const rawDir = String(formData.get("direction") ?? "");
  if (!systemId || !cardId) return { ok: false as const, code: "NOT_FOUND" as const, message: "ไม่พบการ์ดนี้" };
  // ชั้นที่ 2 อยู่ใน service แล้ว — ตรวจซ้ำที่นี่เพื่อให้ "การ์ดของบอร์ดที่มองไม่เห็น" ได้ 404 ก่อนแตะอะไรทั้งสิ้น
  await assertCardRole(ctxOf(auth, systemId), cardId, "EDITOR");
  const res = toColumnId
    ? await moveCard(ctxOf(auth, systemId), { cardId, toColumnId, beforeCardId, afterCardId })
    : await moveCardSideways(ctxOf(auth, systemId), { cardId, direction: rawDir === "left" ? "left" : "right" });
  revalidatePath(boardPath(systemId, boardId));
  return res.ok
    ? { ok: true as const, position: res.position, placedAt: res.placedAt }
    : { ok: false as const, code: res.code, message: res.message };
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
