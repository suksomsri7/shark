// teams.ts — ทีม (ของกลางทั้งแอป · แกน tenant) — CRM v2 ใบ C1.1 (พิมพ์เขียว 20-crm-v2 §4.3 กลุ่ม core · §5.9 · §15)
//
// 🔴 ทำไมอยู่ core: ทีมถูกใช้ข้ามโมดูล (CRM การมองเห็น/มอบหมาย · HR "ทีมขาย" · บอร์ดงานในอนาคต)
//    ⇒ ไม่ผูกระบบ (ไม่มี systemId) · ผูกสาขาด้วย `unitIds` · ชื่อไม่ซ้ำในร้าน (unique [tenantId, name])
// 🔴 AUDIT-CLASS X1: ทุกคำสั่งผูก `ctx.tenantId` เสมอ — ทีม/ผู้ใช้/สาขาของร้านอื่น = "ไม่พบ" (ไม่ใช่ "ไม่มีสิทธิ์")
// 🔴 ทุกการเปลี่ยนแปลง: แถว + event `team.updated` (payload มีแต่ id) ใน transaction เดียวกัน + AuditLog
//    (consumer ยังเป็น no-op — ใบ C1.7/C2.3 ใช้ล้างแคชการมองเห็น/รอบ round-robin)
// ไม่ตรวจสิทธิ์ของผู้เรียกในไฟล์นี้: ผู้เรียก (หน้า /app/settings/teams ของ C1.7 · REST /api/v1/teams ของ C1.10)
// เป็นคนตรวจคีย์สิทธิ์ก่อนเรียก — ไฟล์นี้คุมแค่ "ข้อมูลถูกร้าน + กติกาของทีม"
import { randomUUID } from "node:crypto";
import { Prisma, type TeamRole } from "@prisma/client";
import { prisma } from "./db";
import { emitOutbox } from "./outbox";
import { writeAudit } from "./audit";

export type TeamCtx = { tenantId: string; actorUserId?: string | null };

export type TeamDto = {
  id: string;
  name: string;
  leadUserId: string | null;
  unitIds: string[];
  color: string | null;
  description: string | null;
  archivedAt: Date | null;
};

export type TeamMemberDto = { userId: string; role: TeamRole; acceptingLeads: boolean; joinedAt: Date };

const TEAM_SELECT = { id: true, name: true, leadUserId: true, unitIds: true, color: true, description: true, archivedAt: true } as const;

/** ข้อความไทยที่ไม่โทษผู้ใช้ — ชื่อ export เพื่อให้ผู้เรียก (UI/REST) แยกชนิดได้ */
export class TeamError extends Error {
  constructor(
    message: string,
    public readonly code: "NOT_FOUND" | "DUPLICATE" | "VALIDATION",
  ) {
    super(message);
    this.name = "TeamError";
  }
}

const NAME_MAX = 80;

function cleanName(name: unknown): string {
  const n = typeof name === "string" ? name.trim().replace(/\s+/g, " ") : "";
  if (!n) throw new TeamError("กรุณาตั้งชื่อทีม", "VALIDATION");
  if (n.length > NAME_MAX) throw new TeamError(`ชื่อทีมยาวได้ไม่เกิน ${NAME_MAX} ตัวอักษร`, "VALIDATION");
  return n;
}

const DUP_MSG = "ชื่อทีมนี้มีอยู่แล้วในร้าน (รวมทีมที่เก็บถาวร) — ลองตั้งชื่ออื่น";
const isP2002 = (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";

type Tx = Prisma.TransactionClient;

async function assertUsers(tx: Tx, tenantId: string, userIds: (string | null | undefined)[]): Promise<void> {
  const ids = [...new Set(userIds.filter((v): v is string => !!v))];
  if (ids.length === 0) return;
  const n = await tx.membership.count({ where: { tenantId, userId: { in: ids } } });
  if (n !== ids.length) throw new TeamError("ไม่พบผู้ใช้นี้ในร้าน", "NOT_FOUND");
}

async function cleanUnits(tx: Tx, tenantId: string, unitIds: unknown): Promise<string[]> {
  if (unitIds === undefined || unitIds === null) return [];
  if (!Array.isArray(unitIds) || unitIds.some((u) => typeof u !== "string")) throw new TeamError("รายการสาขาไม่ถูกต้อง", "VALIDATION");
  const ids = [...new Set(unitIds as string[])];
  if (ids.length === 0) return [];
  const n = await tx.businessUnit.count({ where: { tenantId, id: { in: ids } } });
  if (n !== ids.length) throw new TeamError("ไม่พบสาขาที่เลือกในร้าน", "NOT_FOUND");
  return ids;
}

/**
 * อ่านทีม **พร้อมล็อกแถว** (`SELECT … FOR UPDATE`) — ทุกเส้นทางที่แก้ทีม/สมาชิกเรียกตัวนี้ก่อน
 * ⇒ การแก้ทีมเดียวกันพร้อมกัน (เช่น setLead(A) ∥ setLead(B)) ถูกเรียงคิว คนที่สองเห็นผลของคนแรกเสมอ (AUDIT-CLASS X3)
 * ทีมของร้านอื่น = ไม่พบ (X1 — เงื่อนไข tenantId อยู่ในคำสั่งล็อกด้วย)
 */
async function lockTeam(tx: Tx, ctx: TeamCtx, teamId: string) {
  const hit = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "Team" WHERE "id" = ${teamId} AND "tenantId" = ${ctx.tenantId} FOR UPDATE`;
  if (hit.length === 0) throw new TeamError("ไม่พบทีมนี้", "NOT_FOUND");
  const t = await tx.team.findFirst({ where: { id: teamId, tenantId: ctx.tenantId }, select: TEAM_SELECT });
  if (!t) throw new TeamError("ไม่พบทีมนี้", "NOT_FOUND");
  return t;
}

/**
 * ตั้งหัวหน้าทีม (ภายใน tx ที่ล็อกแถวทีมแล้ว) — ทางเดียวของการเปลี่ยนหัวหน้า (setLead และ addMember role LEAD)
 * กติกา: ทีมมีหัวหน้าได้ไม่เกิน 1 คน · `Team.leadUserId` ตรงกับสมาชิกบทบาท LEAD เสมอ
 * ลดทุกแถว LEAD อื่นเป็น MEMBER (ไม่ใช่แค่ leadUserId เดิม — ซ่อมสภาพเพี้ยนที่อาจค้างอยู่ด้วย)
 */
async function applyLead(tx: Tx, ctx: TeamCtx, teamId: string, userId: string | null): Promise<void> {
  await tx.teamMember.updateMany({
    where: { teamId, role: "LEAD", ...(userId ? { userId: { not: userId } } : {}) },
    data: { role: "MEMBER" },
  });
  if (userId) {
    await tx.teamMember.upsert({
      where: { teamId_userId: { teamId, userId } },
      create: { tenantId: ctx.tenantId, teamId, userId, role: "LEAD" },
      update: { role: "LEAD" },
    });
  }
  await tx.team.update({ where: { id: teamId }, data: { leadUserId: userId } });
}

/** event + audit ในจังหวะเดียวกัน — payload เป็น id ล้วน (X8) */
async function changed(tx: Tx, ctx: TeamCtx, teamId: string, change: string, userId?: string): Promise<void> {
  await emitOutbox(tx, {
    tenantId: ctx.tenantId,
    type: "team.updated",
    idempotencyKey: `team.updated#${teamId}#${randomUUID()}`,
    payload: { teamId, change, ...(userId ? { userId } : {}) },
  });
}

async function audit(ctx: TeamCtx, action: string, teamId: string, after?: unknown): Promise<void> {
  await writeAudit({ tenantId: ctx.tenantId, actorId: ctx.actorUserId ?? null, action, targetType: "Team", targetId: teamId, after });
}

export async function createTeam(
  ctx: TeamCtx,
  input: { name: string; leadUserId?: string | null; unitIds?: string[]; color?: string | null; description?: string | null },
): Promise<TeamDto> {
  const name = cleanName(input.name);
  try {
    const team = await prisma.$transaction(async (tx) => {
      const unitIds = await cleanUnits(tx, ctx.tenantId, input.unitIds);
      await assertUsers(tx, ctx.tenantId, [input.leadUserId]);
      const t = await tx.team.create({
        data: {
          tenantId: ctx.tenantId,
          name,
          leadUserId: input.leadUserId ?? null,
          unitIds,
          color: input.color ?? null,
          description: input.description?.trim() || null,
        },
        select: TEAM_SELECT,
      });
      // หัวหน้าทีมเป็นสมาชิกบทบาท LEAD เสมอ (มอบหมาย/การมองเห็น TEAM อ่านจาก TeamMember)
      if (t.leadUserId) await tx.teamMember.create({ data: { tenantId: ctx.tenantId, teamId: t.id, userId: t.leadUserId, role: "LEAD" } });
      await changed(tx, ctx, t.id, "created");
      return t;
    });
    await audit(ctx, "team.create", team.id, { name: team.name, unitIds: team.unitIds });
    return team;
  } catch (e) {
    if (isP2002(e)) throw new TeamError(DUP_MSG, "DUPLICATE");
    throw e;
  }
}

export async function updateTeam(
  ctx: TeamCtx,
  teamId: string,
  patch: { name?: string; unitIds?: string[]; color?: string | null; description?: string | null },
): Promise<TeamDto> {
  try {
    const team = await prisma.$transaction(async (tx) => {
      await lockTeam(tx, ctx, teamId);
      const data: Prisma.TeamUpdateInput = {};
      if (patch.name !== undefined) data.name = cleanName(patch.name);
      if (patch.unitIds !== undefined) data.unitIds = await cleanUnits(tx, ctx.tenantId, patch.unitIds);
      if (patch.color !== undefined) data.color = patch.color;
      if (patch.description !== undefined) data.description = patch.description?.trim() || null;
      const t = await tx.team.update({ where: { id: teamId }, data, select: TEAM_SELECT });
      await changed(tx, ctx, teamId, "updated");
      return t;
    });
    await audit(ctx, "team.update", teamId, patch);
    return team;
  } catch (e) {
    if (isP2002(e)) throw new TeamError(DUP_MSG, "DUPLICATE");
    throw e;
  }
}

/** เก็บถาวร (แถวยังอยู่ · สมาชิกยังอยู่ · teamsOf/listTeams ไม่คืนแล้ว) — เรียกซ้ำได้ */
export async function archiveTeam(ctx: TeamCtx, teamId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const t = await lockTeam(tx, ctx, teamId);
    if (t.archivedAt) return;
    await tx.team.update({ where: { id: teamId }, data: { archivedAt: new Date() } });
    await changed(tx, ctx, teamId, "archived");
  });
  await audit(ctx, "team.archive", teamId);
}

export async function restoreTeam(ctx: TeamCtx, teamId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const t = await lockTeam(tx, ctx, teamId);
    if (!t.archivedAt) return;
    await tx.team.update({ where: { id: teamId }, data: { archivedAt: null } });
    await changed(tx, ctx, teamId, "restored");
  });
  await audit(ctx, "team.restore", teamId);
}

/** เพิ่ม/ปรับบทบาทสมาชิก (upsert — เพิ่มซ้ำไม่เกิดแถวซ้ำ) */
export async function addMember(ctx: TeamCtx, teamId: string, input: { userId: string; role?: TeamRole }): Promise<void> {
  const role: TeamRole = input.role ?? "MEMBER";
  await prisma.$transaction(async (tx) => {
    const t = await lockTeam(tx, ctx, teamId);
    await assertUsers(tx, ctx.tenantId, [input.userId]);
    if (role === "LEAD") {
      // เพิ่มเป็นหัวหน้า = เปลี่ยนหัวหน้า (หัวหน้าเดิมกลับเป็น MEMBER) — ใช้ตรรกะเดียวกับ setLead
      await applyLead(tx, ctx, teamId, input.userId);
    } else {
      await tx.teamMember.upsert({
        where: { teamId_userId: { teamId, userId: input.userId } },
        create: { tenantId: ctx.tenantId, teamId, userId: input.userId, role },
        update: { role },
      });
      // ลดหัวหน้าปัจจุบันเป็น MEMBER ⇒ ทีมไม่มีหัวหน้า (ห้ามให้ leadUserId ชี้คนที่เป็น MEMBER)
      if (t.leadUserId === input.userId) await tx.team.update({ where: { id: teamId }, data: { leadUserId: null } });
    }
    await changed(tx, ctx, teamId, "member.added", input.userId);
  });
  await audit(ctx, "team.member.add", teamId, { userId: input.userId, role });
}

export async function removeMember(ctx: TeamCtx, teamId: string, userId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const t = await lockTeam(tx, ctx, teamId);
    const n = await tx.teamMember.deleteMany({ where: { teamId, userId } });
    if (n.count === 0) return;
    if (t.leadUserId === userId) await tx.team.update({ where: { id: teamId }, data: { leadUserId: null } });
    await changed(tx, ctx, teamId, "member.removed", userId);
  });
  await audit(ctx, "team.member.remove", teamId, { userId });
}

/** ตั้งหัวหน้าทีม (null = ไม่มีหัวหน้า) — หัวหน้าเดิมกลับเป็น MEMBER · หัวหน้าใหม่ถูกเพิ่มเป็นสมาชิก LEAD */
export async function setLead(ctx: TeamCtx, teamId: string, userId: string | null): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await lockTeam(tx, ctx, teamId);
    await assertUsers(tx, ctx.tenantId, [userId]);
    await applyLead(tx, ctx, teamId, userId);
    await changed(tx, ctx, teamId, "lead.changed", userId ?? undefined);
  });
  await audit(ctx, "team.lead.set", teamId, { userId });
}

/** เปิด/ปิดรับลีดของสมาชิกคนหนึ่ง (round-robin ของ C2.3 ข้ามคนที่ปิด) */
export async function setAcceptingLeads(ctx: TeamCtx, teamId: string, userId: string, accepting: boolean): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await lockTeam(tx, ctx, teamId);
    const n = await tx.teamMember.updateMany({ where: { teamId, userId }, data: { acceptingLeads: accepting } });
    if (n.count === 0) throw new TeamError("ผู้ใช้นี้ไม่ได้อยู่ในทีม", "NOT_FOUND");
    await changed(tx, ctx, teamId, "member.accepting_leads", userId);
  });
  await audit(ctx, "team.member.accepting_leads", teamId, { userId, accepting });
}

// ───────────────────────── อ่าน ─────────────────────────

export async function listTeams(ctx: TeamCtx, opts: { includeArchived?: boolean } = {}): Promise<TeamDto[]> {
  return prisma.team.findMany({
    where: { tenantId: ctx.tenantId, ...(opts.includeArchived ? {} : { archivedAt: null }) },
    select: TEAM_SELECT,
    orderBy: { name: "asc" },
  });
}

export async function getTeam(ctx: TeamCtx, teamId: string): Promise<TeamDto | null> {
  return prisma.team.findFirst({ where: { id: teamId, tenantId: ctx.tenantId }, select: TEAM_SELECT });
}

/** ทีม (ที่ยังไม่เก็บถาวร) ที่ผู้ใช้คนนี้อยู่ */
export async function teamsOf(ctx: TeamCtx, userId: string): Promise<(TeamDto & { role: TeamRole })[]> {
  const rows = await prisma.teamMember.findMany({
    where: { tenantId: ctx.tenantId, userId, team: { tenantId: ctx.tenantId, archivedAt: null } },
    select: { role: true, team: { select: TEAM_SELECT } },
    orderBy: { joinedAt: "asc" },
  });
  return rows.map((r) => ({ ...r.team, role: r.role }));
}

export async function membersOf(ctx: TeamCtx, teamId: string): Promise<TeamMemberDto[]> {
  return prisma.teamMember.findMany({
    where: { tenantId: ctx.tenantId, teamId, team: { tenantId: ctx.tenantId } },
    select: { userId: true, role: true, acceptingLeads: true, joinedAt: true },
    orderBy: { joinedAt: "asc" },
  });
}

/** สาขาที่ทีมผูกอยู่ ([] = ไม่พบทีม/ไม่ผูกสาขา) */
export async function unitIdsOf(ctx: TeamCtx, teamId: string): Promise<string[]> {
  const t = await prisma.team.findFirst({ where: { id: teamId, tenantId: ctx.tenantId }, select: { unitIds: true } });
  return t?.unitIds ?? [];
}
