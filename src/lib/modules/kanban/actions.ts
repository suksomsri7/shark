"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireTenant } from "@/lib/core/context";
import { assertCan } from "@/lib/core/rbac";
import {
  archiveBoard,
  archiveCard,
  archiveColumn,
  createBoard,
  createCard,
  createColumn,
  moveCardSideways,
  renameBoard,
  updateCard,
} from "./service";
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
  await assertColumnRole(ctxOf(auth, systemId), columnId, "EDITOR");
  await archiveColumn(auth.active.tenantId, systemId, columnId);
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

export async function moveCardAction(formData: FormData) {
  const auth = await requireTenant();
  assertKanbanCan(auth, "kanban.card.move");
  const systemId = String(formData.get("systemId") ?? "");
  const boardId = String(formData.get("boardId") ?? "");
  const cardId = String(formData.get("cardId") ?? "");
  const direction = String(formData.get("direction") ?? "") === "left" ? "left" : "right";
  if (!systemId || !cardId) return;
  await assertCardRole(ctxOf(auth, systemId), cardId, "EDITOR");
  await moveCardSideways({ tenantId: auth.active.tenantId, systemId, cardId, direction });
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
