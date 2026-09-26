// views.ts — มุมมองที่บันทึกไว้ของหน้ารวมสมาชิก (M1.5 · แบบเดียวกับบอร์ดงาน K2.5 · ตาราง `MemberSavedView` มาตั้งแต่ migration `member_v2_a`)
//
// กติกา (พิมพ์เขียว §3.1 · MEMBER-RUN.md §2 M1.5)
//   • scope "PRIVATE" = ของตัวเอง (เห็นเฉพาะเจ้าของ) · "TEAM" = ทั้งทีม (สร้างได้เฉพาะ MANAGER ขึ้นไป)
//   • แก้ไข/ลบ: เจ้าของมุมมอง หรือ OWNER ของร้าน เท่านั้น (ไม่ใช่ MANAGER อื่นที่ไม่ใช่เจ้าของ)
//   • `filters`/`columns`/`sort` เป็น Json เก็บอิสระ — `list.ts` เป็นคนตีความตอน `listMembers({ viewId })`
//
// 🔴 prisma ผ่าน `./db` (จุดเดียวของโมดูลที่ล้วง core — ดู member/db.ts)

import type { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { type MemberActor } from "./access";
import type { MemberCtx } from "./privacy";
import { MemberForbiddenError, MemberInputError, MemberNotFoundError } from "./errors";
import type { MemberSort } from "./list";

export type SavedViewScope = "PRIVATE" | "TEAM";

export type SavedViewDto = {
  id: string;
  name: string;
  scope: SavedViewScope;
  filters: Record<string, unknown>;
  columns: string[];
  sort: MemberSort | null;
  ownerUserId: string | null;
};

export type CreateSavedViewInput = {
  name: string;
  scope?: SavedViewScope;
  /** CRM C3.6 ▸ ทีมจริงของมุมมองแบบ TEAM (ไม่ส่ง/ว่าง = ทั้งร้านแบบเดิม) — ไม่อยู่ใน SavedViewDto (อ่านผ่าน `savedViewTeamIds`) ◂ */
  teamId?: string | null;
  filters?: Record<string, unknown>;
  columns?: string[];
  sort?: MemberSort | null;
};

export type UpdateSavedViewInput = Partial<CreateSavedViewInput>;

type ViewRow = Awaited<ReturnType<typeof prisma.memberSavedView.findFirstOrThrow>>;

function toDto(row: ViewRow): SavedViewDto {
  return {
    id: row.id,
    name: row.name,
    scope: row.scope === "TEAM" ? "TEAM" : "PRIVATE",
    filters: (row.filters ?? {}) as Record<string, unknown>,
    columns: Array.isArray(row.columns) ? (row.columns as string[]) : [],
    sort: (row.sort as MemberSort | null) ?? null,
    ownerUserId: row.ownerUserId,
  };
}

function requireManagerPlus(actor: MemberActor): void {
  if (actor.role !== "OWNER" && actor.role !== "MANAGER") {
    throw new MemberForbiddenError('บันทึกมุมมองแบบ "ทั้งทีม" ได้เฉพาะผู้จัดการขึ้นไป — บันทึกเป็นมุมมองส่วนตัวแทนได้');
  }
}

function normalizeName(raw: string | undefined): string {
  const name = (raw ?? "").trim();
  if (!name) throw new MemberInputError("ต้องตั้งชื่อมุมมองก่อนจึงบันทึกได้");
  if (name.length > 80) throw new MemberInputError("ชื่อมุมมองยาวเกินไป (ไม่เกิน 80 ตัวอักษร)");
  return name;
}

// CRM C3.6 ▸ `MemberSavedView.teamId` = ทีมจริง (มาจาก migration crm_v2_a · แบบเดียวกับมุมมอง CRM ของ C3.2)
//   ใครเห็น/ใช้มุมมองไหนได้ (ทั้ง `listSavedViews` และ `listMembers({ viewId })` ใช้ตัวกรองเดียวกันนี้):
//     • PRIVATE ของตัวเอง · TEAM ที่ตัวเองสร้าง
//     • TEAM ที่ไม่มี teamId (แถวเดิมก่อน C3.6) = ทั้งร้านเหมือนเดิม
//     • TEAM ของทีมที่ตัวเองอยู่ (TeamMember หรือ Team.leadUserId · ทีมที่ยังไม่เก็บถาวร)
//     • เจ้าของร้าน (OWNER) เห็น TEAM ทุกทีม — เขาแก้/ลบได้อยู่แล้ว (`loadEditable`) · แบบเดียวกับ `crm/views.ts`
//   🔴 AUDIT-CLASS X1: ผูก tenantId + systemId + objectKey "customer" เสมอ (มุมมองของ CRM ในตารางเดียวกันไม่มีวันหลุดมา)
//   🔴 `SavedViewDto` ไม่เปลี่ยนรูป (ข้อสอบ C3.2-X1.6 ตรึงคีย์ไว้) — หน้าจออ่าน teamId ผ่าน `savedViewTeamIds` แยก
const VIEW_OBJECT = "customer";

/** ทีม (ยังไม่เก็บถาวร) ที่ผู้ใช้อยู่ — สมาชิก หรือหัวหน้า (Team.leadUserId) */
async function myTeamIds(tenantId: string, userId: string | null | undefined): Promise<string[]> {
  if (!userId) return [];
  const [asMember, asLead] = await Promise.all([
    prisma.teamMember.findMany({ where: { tenantId, userId, team: { tenantId, archivedAt: null } }, select: { teamId: true }, take: 200 }),
    prisma.team.findMany({ where: { tenantId, leadUserId: userId, archivedAt: null }, select: { id: true }, take: 200 }),
  ]);
  return [...new Set([...asMember.map((r) => r.teamId), ...asLead.map((r) => r.id)])];
}

/** ตัวกรอง "มุมมองที่ actor นี้ใช้ได้" — ใช้ร่วมกับ list.ts (`listMembers({ viewId })`) */
export async function savedViewAccessWhere(ctx: MemberCtx, actor: MemberActor): Promise<Prisma.MemberSavedViewWhereInput> {
  const me = ctx.actorUserId ?? actor.userId ?? null;
  const teams = await myTeamIds(ctx.tenantId, me);
  const or: Prisma.MemberSavedViewWhereInput[] = [{ scope: "TEAM", teamId: null }];
  if (me) or.push({ scope: "PRIVATE", ownerUserId: me }, { scope: "TEAM", ownerUserId: me });
  if (actor.role === "OWNER") or.push({ scope: "TEAM" });
  else if (teams.length) or.push({ scope: "TEAM", teamId: { in: teams } });
  return { tenantId: ctx.tenantId, systemId: ctx.systemId, objectKey: VIEW_OBJECT, OR: or };
}
// ◂ CRM C3.6

/** มุมมองที่ actor เห็น (กติกาข้างบน) — เรียง TEAM ก่อน แล้วตามลำดับที่สร้าง */
export async function listSavedViews(ctx: MemberCtx, actor: MemberActor): Promise<SavedViewDto[]> {
  const rows = await prisma.memberSavedView.findMany({
    where: await savedViewAccessWhere(ctx, actor),
    orderBy: [{ scope: "asc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
  });
  return rows.map(toDto);
}

// CRM C3.6 ▸ ข้อมูลเสริมของตัวเลือกทีม (หน้าจออ่านแยกจาก DTO) ◂
/** teamId ของมุมมองที่ actor ใช้ได้ (id ที่มองไม่เห็น = ไม่อยู่ในผล) */
export async function savedViewTeamIds(ctx: MemberCtx, actor: MemberActor, viewIds: readonly string[]): Promise<Record<string, string | null>> {
  const ids = [...new Set(viewIds.filter((x) => typeof x === "string" && x))].slice(0, 500);
  if (ids.length === 0) return {};
  const rows = await prisma.memberSavedView.findMany({ where: { AND: [await savedViewAccessWhere(ctx, actor), { id: { in: ids } }] }, select: { id: true, teamId: true } });
  return Object.fromEntries(rows.map((r) => [r.id, r.teamId ?? null]));
}

/** ทีมของร้านที่เลือกเป็นเจ้าของมุมมองแบบ TEAM ได้ (ยังไม่เก็บถาวร · เรียงชื่อ) */
export async function savedViewTeamOptions(ctx: MemberCtx, actor: MemberActor): Promise<{ id: string; name: string }[]> {
  if (actor.role !== "OWNER" && actor.role !== "MANAGER") return [];
  return prisma.team.findMany({ where: { tenantId: ctx.tenantId, archivedAt: null }, select: { id: true, name: true }, orderBy: { name: "asc" }, take: 200 });
}

async function cleanTeamId(ctx: MemberCtx, scope: SavedViewScope, raw: unknown): Promise<string | null> {
  if (scope !== "TEAM") return null;
  const teamId = typeof raw === "string" ? raw.trim() : "";
  if (!teamId) return null;
  // AUDIT-CLASS X1: ทีมต้องเป็นของร้านนี้และยังไม่เก็บถาวร — ทีมร้านอื่น = ไม่พบ (ไม่บอกว่ามีอยู่)
  const team = await prisma.team.findFirst({ where: { id: teamId, tenantId: ctx.tenantId, archivedAt: null }, select: { id: true } });
  if (!team) throw new MemberInputError("ไม่พบทีมที่เลือกในร้านนี้ — เลือกทีมใหม่จากรายการ หรือเลือก \"ทั้งร้าน\"");
  return team.id;
}

export async function createSavedView(ctx: MemberCtx, actor: MemberActor, input: CreateSavedViewInput): Promise<SavedViewDto> {
  const scope: SavedViewScope = input.scope === "TEAM" ? "TEAM" : "PRIVATE";
  if (scope === "TEAM") requireManagerPlus(actor);
  const name = normalizeName(input.name);
  const teamId = await cleanTeamId(ctx, scope, input.teamId); // CRM C3.6 ◂
  const row = await prisma.memberSavedView.create({
    data: {
      tenantId: ctx.tenantId,
      systemId: ctx.systemId,
      ownerUserId: ctx.actorUserId,
      scope,
      objectKey: VIEW_OBJECT, // CRM C3.6 ◂
      teamId, // CRM C3.6 ◂
      name,
      filters: (input.filters ?? {}) as object,
      columns: (input.columns ?? []) as object,
      sort: input.sort ?? undefined,
    },
  });
  return toDto(row);
}

async function loadEditable(ctx: MemberCtx, actor: MemberActor, id: string): Promise<ViewRow> {
  // CRM C3.6 ▸ แก้/ลบได้เฉพาะมุมมองที่มองเห็น (มุมมองของ CRM ในตารางเดียวกัน = ไม่พบ) — เจ้าของร้าน (OWNER) ยังแก้/ลบมุมมอง
  //   ส่วนตัวของคนอื่นได้แบบเดิม (ทางดูแลของเจ้าของร้าน) ◂
  const row = await prisma.memberSavedView.findFirst({
    where: actor.role === "OWNER" ? { id, tenantId: ctx.tenantId, systemId: ctx.systemId, objectKey: VIEW_OBJECT } : { AND: [await savedViewAccessWhere(ctx, actor), { id }] },
  });
  if (!row) throw new MemberNotFoundError("ไม่พบมุมมองที่บันทึกไว้นี้ — อาจถูกลบไปแล้ว");
  const isOwner = row.ownerUserId === ctx.actorUserId;
  const isPlatformOwner = actor.role === "OWNER";
  if (!isOwner && !isPlatformOwner) {
    throw new MemberForbiddenError("แก้ไข/ลบมุมมองนี้ได้เฉพาะเจ้าของมุมมองหรือเจ้าของร้านเท่านั้น");
  }
  return row;
}

export async function updateSavedView(ctx: MemberCtx, actor: MemberActor, id: string, patch: UpdateSavedViewInput): Promise<SavedViewDto> {
  const row = await loadEditable(ctx, actor, id);
  const nextScope: SavedViewScope = patch.scope ? (patch.scope === "TEAM" ? "TEAM" : "PRIVATE") : (row.scope === "TEAM" ? "TEAM" : "PRIVATE");
  if (nextScope === "TEAM" && row.scope !== "TEAM") requireManagerPlus(actor);
  const updated = await prisma.memberSavedView.update({
    where: { id: row.id },
    data: {
      ...(patch.name !== undefined ? { name: normalizeName(patch.name) } : {}),
      ...(patch.scope !== undefined ? { scope: nextScope, ...(nextScope === "PRIVATE" ? { teamId: null } : {}) } : {}), // CRM C3.6 ◂
      ...(patch.filters !== undefined ? { filters: patch.filters as object } : {}),
      ...(patch.columns !== undefined ? { columns: patch.columns as object } : {}),
      ...(patch.sort !== undefined ? { sort: patch.sort ?? undefined } : {}),
    },
  });
  return toDto(updated);
}

export async function deleteSavedView(ctx: MemberCtx, actor: MemberActor, id: string): Promise<{ ok: true }> {
  const row = await loadEditable(ctx, actor, id);
  await prisma.memberSavedView.delete({ where: { id: row.id } });
  return { ok: true };
}
