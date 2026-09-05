// members.ts — สมาชิกบอร์ด + ดาว + การมองเห็นบอร์ด (K1.3 · พิมพ์เขียว §6 · D2)
//
// ไฟล์นี้ = "ตัวโหลดข้อมูลให้ `access.ts` ตัดสิน" + จุดเดียวที่เขียนแถวสมาชิก/ดาว/visibility
// 🔴 ทุกฟังก์ชันเริ่มด้วย `assertBoardRole` เสมอ — มองไม่เห็น → `KanbanNotFoundError` (404)
//    เห็นแต่ยศไม่ถึง → `KanbanForbiddenError` (403) · ลำดับนี้ห้ามสลับ ไม่งั้นบอร์ดลับจะถูกยืนยันว่ามีจริง
// 🔴 ทุก mutation เขียน `AuditLog` กลาง (§6.5) ผ่าน `writeAudit` ของแพลตฟอร์ม (core/audit.ts)
//    — ไม่ใช่ log ของโมดูลเอง: เจ้าของร้านต้องเห็น "ใครเปิดบอร์ดลับให้ใคร" ในประวัติเดียวกับเรื่องเงิน

import type { KanbanBoardRole, KanbanBoardVisibility } from "@prisma/client";
import { writeAudit } from "@/lib/core/audit";
import { prisma } from "./db";
import { KANBAN_LIMITS } from "./limits";
import {
  boardRole,
  hasBoardRole,
  KanbanForbiddenError,
  KanbanNotFoundError,
  toActor,
  type BoardRole,
} from "./access";
import type { KanbanActor, KanbanCtx } from "./types";

export type MemberRow = {
  userId: string;
  name: string;
  email: string;
  role: KanbanBoardRole;
  /** บทบาทในร้าน (OWNER/MANAGER/STAFF) — หน้าจอใช้บอกว่าคนนี้เป็น ADMIN โดยนัยอยู่แล้ว */
  tenantRole: string;
};

type BoardRow = {
  id: string;
  name: string;
  unitId: string | null;
  visibility: KanbanBoardVisibility;
};

// ───────────────────────── ตัวช่วยภายใน ─────────────────────────

/** actor จาก `ctx.actorUserId` — ไม่มี membership ในร้านนี้ = ไม่มีตัวตนสำหรับโมดูลนี้ */
async function loadActor(ctx: KanbanCtx): Promise<KanbanActor | null> {
  if (!ctx.actorUserId) return null;
  const m = await prisma.membership.findFirst({
    where: { tenantId: ctx.tenantId, userId: ctx.actorUserId },
    select: { role: true, unitAccess: true, permissions: true },
  });
  return m ? toActor(ctx.actorUserId, m) : null;
}

async function loadBoard(ctx: KanbanCtx, boardId: string): Promise<BoardRow | null> {
  return prisma.kanbanBoard.findFirst({
    where: { id: boardId, tenantId: ctx.tenantId, systemId: ctx.systemId },
    select: { id: true, name: true, unitId: true, visibility: true },
  });
}

/** แถวสมาชิกทั้งบอร์ด (จำนวนน้อยตามเพดาน `membersPerBoard`) — ใช้ทั้งคิดสิทธิ์และนับ ADMIN คนสุดท้าย */
async function loadMembers(boardId: string, tenantId: string) {
  return prisma.kanbanBoardMember.findMany({
    where: { boardId, tenantId },
    select: { userId: true, role: true },
    orderBy: { createdAt: "asc" },
  });
}

/** บทบาทในบอร์ดของคนที่กำลังทำงาน (โหลดทุกอย่างจาก DB) — `null` = มองไม่เห็นบอร์ดนี้ */
export async function boardRoleOf(ctx: KanbanCtx, boardId: string): Promise<BoardRole> {
  const [actor, board] = await Promise.all([loadActor(ctx), loadBoard(ctx, boardId)]);
  if (!actor || !board) return null;
  const members = await loadMembers(board.id, ctx.tenantId);
  return boardRole(actor, board, members);
}

/**
 * ด่านของทุก mutation: คืนบอร์ด + บทบาท เมื่อผ่าน
 * มองไม่เห็น → 404 · เห็นแต่ยศไม่ถึง → 403 (§6.3)
 */
export async function assertBoardRole(
  ctx: KanbanCtx,
  boardId: string,
  need: "VIEWER" | "EDITOR" | "ADMIN",
): Promise<{ board: BoardRow; role: Exclude<BoardRole, null>; actor: KanbanActor }> {
  const [actor, board] = await Promise.all([loadActor(ctx), loadBoard(ctx, boardId)]);
  if (!actor || !board) throw new KanbanNotFoundError();
  const members = await loadMembers(board.id, ctx.tenantId);
  const role = boardRole(actor, board, members);
  if (role === null) throw new KanbanNotFoundError();
  if (!hasBoardRole(role, need)) {
    throw new KanbanForbiddenError(
      need === "ADMIN"
        ? "ต้องเป็นผู้ดูแลบอร์ดนี้ถึงจะทำรายการนี้ได้"
        : "คุณดูบอร์ดนี้ได้อย่างเดียว",
    );
  }
  return { board, role, actor };
}

/**
 * ด่านของ mutation ที่ผู้ใช้ส่ง "คอลัมน์"/"การ์ด" มา — หาบอร์ดจริงจากตัวมันเอง ไม่เชื่อ boardId ในฟอร์ม
 * 🔴 ถ้าเชื่อ boardId ที่ client ส่งมา คนที่เป็น ADMIN บอร์ดตัวเองจะยิง columnId ของบอร์ดลับแล้วผ่านด่านได้
 */
export async function assertColumnRole(
  ctx: KanbanCtx,
  columnId: string,
  need: "VIEWER" | "EDITOR" | "ADMIN",
): Promise<{ boardId: string }> {
  const col = await prisma.kanbanColumn.findFirst({
    where: { id: columnId, tenantId: ctx.tenantId, systemId: ctx.systemId },
    select: { boardId: true },
  });
  if (!col) throw new KanbanNotFoundError("ไม่พบคอลัมน์นี้");
  await assertBoardRole(ctx, col.boardId, need);
  return { boardId: col.boardId };
}

export async function assertCardRole(
  ctx: KanbanCtx,
  cardId: string,
  need: "VIEWER" | "EDITOR" | "ADMIN",
): Promise<{ boardId: string }> {
  const card = await prisma.kanbanCard.findFirst({
    where: { id: cardId, tenantId: ctx.tenantId, systemId: ctx.systemId },
    select: { boardId: true },
  });
  if (!card) throw new KanbanNotFoundError("ไม่พบการ์ดนี้");
  await assertBoardRole(ctx, card.boardId, need);
  return { boardId: card.boardId };
}

/** ปลายทางของคำเชิญต้องเป็นพนักงานของร้านนี้จริง (Membership ที่ accepted แล้ว) */
async function assertTenantMember(tenantId: string, userId: string): Promise<void> {
  const m = await prisma.membership.findFirst({
    where: { tenantId, userId, acceptedAt: { not: null } },
    select: { userId: true },
  });
  if (!m) throw new Error("เชิญได้เฉพาะพนักงานในร้านนี้ — คนนี้ยังไม่ใช่สมาชิกของร้าน");
}

/**
 * ห้ามให้บอร์ดเหลือ 0 คนที่ประกาศเป็น ADMIN (§6.4 †)
 * 🔴 OWNER เป็น ADMIN โดยนัยอยู่แล้วก็จริง แต่ "โดยนัย" เปลี่ยนได้ตามบทบาทในร้าน (ลาออก/ลดขั้น)
 *    ⇒ ยึดแถวที่ประกาศไว้ชัด ๆ เป็นเกณฑ์: ต้องตั้งคนใหม่ก่อนถึงจะถอด/ลดขั้นคนสุดท้ายได้
 */
function assertNotLastAdmin(members: { userId: string; role: KanbanBoardRole }[], userId: string): void {
  const admins = members.filter((m) => m.role === "ADMIN");
  if (admins.length === 1 && admins[0]!.userId === userId) {
    throw new Error("ต้องตั้งผู้ดูแลบอร์ดคนใหม่ก่อน — บอร์ดนี้เหลือผู้ดูแลคนสุดท้ายแล้ว");
  }
}

// ───────────────────────── สมาชิก ─────────────────────────

/** รายชื่อสมาชิกที่ถูกเชิญไว้ชัด ๆ (สิทธิ์โดยนัยของ OWNER/MANAGER/บอร์ด TENANT ไม่อยู่ในลิสต์นี้) */
export async function listMembers(ctx: KanbanCtx, boardId: string): Promise<MemberRow[]> {
  await assertBoardRole(ctx, boardId, "VIEWER");
  const rows = await prisma.kanbanBoardMember.findMany({
    where: { boardId, tenantId: ctx.tenantId },
    select: { userId: true, role: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });
  if (rows.length === 0) return [];
  const userIds = rows.map((r) => r.userId);
  const [users, memberships] = await Promise.all([
    prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true, email: true } }),
    prisma.membership.findMany({
      where: { tenantId: ctx.tenantId, userId: { in: userIds } },
      select: { userId: true, role: true },
    }),
  ]);
  const byUser = new Map(users.map((u) => [u.id, u]));
  const roleOf = new Map(memberships.map((m) => [m.userId, m.role as string]));
  return rows.map((r) => {
    const u = byUser.get(r.userId);
    return {
      userId: r.userId,
      name: u?.name ?? u?.email ?? r.userId,
      email: u?.email ?? "",
      role: r.role,
      tenantRole: roleOf.get(r.userId) ?? "STAFF",
    };
  });
}

/** เชิญคนเข้าบอร์ด (ต้องเป็น ADMIN ของบอร์ด) — เชิญซ้ำ = อัปเดตบทบาทให้ตามที่ระบุ */
export async function addMember(
  ctx: KanbanCtx,
  boardId: string,
  userId: string,
  role: KanbanBoardRole = "EDITOR",
): Promise<{ userId: string; role: KanbanBoardRole }> {
  const { board } = await assertBoardRole(ctx, boardId, "ADMIN");
  await assertTenantMember(ctx.tenantId, userId);
  const existing = await prisma.kanbanBoardMember.findFirst({
    where: { boardId: board.id, userId },
    select: { id: true, role: true },
  });
  if (!existing) {
    const count = await prisma.kanbanBoardMember.count({ where: { boardId: board.id } });
    if (count >= KANBAN_LIMITS.membersPerBoard) {
      throw new Error(`บอร์ดนี้มีสมาชิกครบ ${KANBAN_LIMITS.membersPerBoard} คนแล้ว — ถอดคนที่ไม่ได้ใช้ก่อน`);
    }
  }
  const row = existing
    ? await prisma.kanbanBoardMember.update({ where: { id: existing.id }, data: { role }, select: { userId: true, role: true } })
    : await prisma.kanbanBoardMember.create({
        data: { tenantId: ctx.tenantId, boardId: board.id, userId, role, invitedById: ctx.actorUserId ?? null },
        select: { userId: true, role: true },
      });
  await writeAudit({
    tenantId: ctx.tenantId,
    actorType: "USER",
    actorId: ctx.actorUserId ?? null,
    action: "kanban.board.member.add",
    targetType: "KanbanBoard",
    targetId: board.id,
    before: existing ? { userId, role: existing.role } : undefined,
    after: { userId, role, boardName: board.name },
  });
  return row;
}

/** เปลี่ยนบทบาทของสมาชิก (ADMIN เท่านั้น · ลดขั้น ADMIN คนสุดท้ายไม่ได้) */
export async function setMemberRole(
  ctx: KanbanCtx,
  boardId: string,
  userId: string,
  role: KanbanBoardRole,
): Promise<void> {
  const { board } = await assertBoardRole(ctx, boardId, "ADMIN");
  const members = await loadMembers(board.id, ctx.tenantId);
  const current = members.find((m) => m.userId === userId);
  if (!current) throw new Error("ไม่พบคนนี้ในรายชื่อสมาชิกบอร์ด");
  if (current.role === role) return;
  if (role !== "ADMIN") assertNotLastAdmin(members, userId);
  await prisma.kanbanBoardMember.updateMany({
    where: { boardId: board.id, tenantId: ctx.tenantId, userId },
    data: { role },
  });
  await writeAudit({
    tenantId: ctx.tenantId,
    actorType: "USER",
    actorId: ctx.actorUserId ?? null,
    action: "kanban.board.member.role",
    targetType: "KanbanBoard",
    targetId: board.id,
    before: { userId, role: current.role },
    after: { userId, role, boardName: board.name },
  });
}

/** ถอดสมาชิก (ADMIN เท่านั้น · ถอด ADMIN คนสุดท้ายไม่ได้) */
export async function removeMember(ctx: KanbanCtx, boardId: string, userId: string): Promise<void> {
  const { board } = await assertBoardRole(ctx, boardId, "ADMIN");
  const members = await loadMembers(board.id, ctx.tenantId);
  const current = members.find((m) => m.userId === userId);
  if (!current) return; // ถอดคนที่ไม่ได้อยู่ในบอร์ด = ไม่มีอะไรให้ทำ (idempotent)
  assertNotLastAdmin(members, userId);
  await prisma.kanbanBoardMember.deleteMany({ where: { boardId: board.id, tenantId: ctx.tenantId, userId } });
  await writeAudit({
    tenantId: ctx.tenantId,
    actorType: "USER",
    actorId: ctx.actorUserId ?? null,
    action: "kanban.board.member.remove",
    targetType: "KanbanBoard",
    targetId: board.id,
    before: { userId, role: current.role },
    after: { userId, removed: true, boardName: board.name },
  });
}

/** ออกจากบอร์ดเอง (ไม่ต้องเป็น ADMIN — แต่ ADMIN คนสุดท้ายออกไม่ได้) */
export async function leaveBoard(ctx: KanbanCtx, boardId: string): Promise<void> {
  const userId = ctx.actorUserId;
  if (!userId) throw new KanbanForbiddenError("ต้องเข้าสู่ระบบก่อน");
  const { board } = await assertBoardRole(ctx, boardId, "VIEWER");
  const members = await loadMembers(board.id, ctx.tenantId);
  const current = members.find((m) => m.userId === userId);
  if (!current) return;
  assertNotLastAdmin(members, userId);
  await prisma.kanbanBoardMember.deleteMany({ where: { boardId: board.id, tenantId: ctx.tenantId, userId } });
  await writeAudit({
    tenantId: ctx.tenantId,
    actorType: "USER",
    actorId: userId,
    action: "kanban.board.member.remove",
    targetType: "KanbanBoard",
    targetId: board.id,
    before: { userId, role: current.role },
    after: { userId, removed: true, self: true, boardName: board.name },
  });
}

// ───────────────────────── ดาว (ของส่วนตัว) ─────────────────────────

/** ติดดาว — idempotent · บอร์ดที่มองไม่เห็น → 404 (ห้ามใช้ดาวเป็นเครื่องมือเดาว่ามีบอร์ดอะไรอยู่) */
export async function starBoard(ctx: KanbanCtx, boardId: string): Promise<void> {
  const userId = ctx.actorUserId;
  if (!userId) throw new KanbanForbiddenError("ต้องเข้าสู่ระบบก่อน");
  const { board } = await assertBoardRole(ctx, boardId, "VIEWER");
  await prisma.kanbanBoardStar.upsert({
    where: { boardId_userId: { boardId: board.id, userId } },
    create: { boardId: board.id, userId, tenantId: ctx.tenantId },
    update: {},
  });
}

/** เอาดาวออก — idempotent (ไม่มีดาวอยู่แล้วก็ไม่ error) */
export async function unstarBoard(ctx: KanbanCtx, boardId: string): Promise<void> {
  const userId = ctx.actorUserId;
  if (!userId) throw new KanbanForbiddenError("ต้องเข้าสู่ระบบก่อน");
  await prisma.kanbanBoardStar.deleteMany({ where: { boardId, userId, tenantId: ctx.tenantId } });
}

/** บอร์ดที่ฉันติดดาวไว้ (ใช้จัดลำดับหน้ารวมบอร์ด) */
export async function listStarredBoardIds(ctx: KanbanCtx): Promise<string[]> {
  const userId = ctx.actorUserId;
  if (!userId) return [];
  const rows = await prisma.kanbanBoardStar.findMany({
    where: { tenantId: ctx.tenantId, userId },
    select: { boardId: true },
  });
  return rows.map((r) => r.boardId);
}

// ───────────────────────── การมองเห็นของบอร์ด ─────────────────────────

/** เปลี่ยน PRIVATE ↔ TENANT (ADMIN ของบอร์ดเท่านั้น) — มีผลทันทีกับทุกคนที่เคยเห็น/ไม่เคยเห็น */
export async function setBoardVisibility(
  ctx: KanbanCtx,
  boardId: string,
  visibility: KanbanBoardVisibility,
): Promise<void> {
  const { board } = await assertBoardRole(ctx, boardId, "ADMIN");
  if (board.visibility === visibility) return;
  await prisma.kanbanBoard.updateMany({
    where: { id: board.id, tenantId: ctx.tenantId, systemId: ctx.systemId },
    data: { visibility },
  });
  await writeAudit({
    tenantId: ctx.tenantId,
    actorType: "USER",
    actorId: ctx.actorUserId ?? null,
    action: "kanban.board.visibility",
    targetType: "KanbanBoard",
    targetId: board.id,
    before: { visibility: board.visibility },
    after: { visibility, boardName: board.name },
  });
}
