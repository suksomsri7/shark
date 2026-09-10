// views.ts — มุมมองที่บันทึกไว้ของหน้ารวมสมาชิก (M1.5 · แบบเดียวกับบอร์ดงาน K2.5 · ตาราง `MemberSavedView` มาตั้งแต่ migration `member_v2_a`)
//
// กติกา (พิมพ์เขียว §3.1 · MEMBER-RUN.md §2 M1.5)
//   • scope "PRIVATE" = ของตัวเอง (เห็นเฉพาะเจ้าของ) · "TEAM" = ทั้งทีม (สร้างได้เฉพาะ MANAGER ขึ้นไป)
//   • แก้ไข/ลบ: เจ้าของมุมมอง หรือ OWNER ของร้าน เท่านั้น (ไม่ใช่ MANAGER อื่นที่ไม่ใช่เจ้าของ)
//   • `filters`/`columns`/`sort` เป็น Json เก็บอิสระ — `list.ts` เป็นคนตีความตอน `listMembers({ viewId })`
//
// 🔴 prisma ผ่าน `./db` (จุดเดียวของโมดูลที่ล้วง core — ดู member/db.ts)

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

/** มุมมองที่ actor เห็น — TEAM ทั้งหมด + PRIVATE ของตัวเอง (เรียง TEAM ก่อน แล้วตามลำดับที่สร้าง) */
export async function listSavedViews(ctx: MemberCtx, actor: MemberActor): Promise<SavedViewDto[]> {
  void actor;
  const rows = await prisma.memberSavedView.findMany({
    where: {
      tenantId: ctx.tenantId,
      systemId: ctx.systemId,
      OR: [{ scope: "TEAM" }, { scope: "PRIVATE", ownerUserId: ctx.actorUserId }],
    },
    orderBy: [{ scope: "asc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
  });
  return rows.map(toDto);
}

export async function createSavedView(ctx: MemberCtx, actor: MemberActor, input: CreateSavedViewInput): Promise<SavedViewDto> {
  const scope: SavedViewScope = input.scope === "TEAM" ? "TEAM" : "PRIVATE";
  if (scope === "TEAM") requireManagerPlus(actor);
  const name = normalizeName(input.name);
  const row = await prisma.memberSavedView.create({
    data: {
      tenantId: ctx.tenantId,
      systemId: ctx.systemId,
      ownerUserId: ctx.actorUserId,
      scope,
      name,
      filters: (input.filters ?? {}) as object,
      columns: (input.columns ?? []) as object,
      sort: input.sort ?? undefined,
    },
  });
  return toDto(row);
}

async function loadEditable(ctx: MemberCtx, actor: MemberActor, id: string): Promise<ViewRow> {
  const row = await prisma.memberSavedView.findFirst({ where: { id, tenantId: ctx.tenantId, systemId: ctx.systemId } });
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
      ...(patch.scope !== undefined ? { scope: nextScope } : {}),
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
